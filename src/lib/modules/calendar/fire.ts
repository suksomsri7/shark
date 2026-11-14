// fire.ts — งานรายนาที `calendar.fire` (CAL1.4 · สัญญา §5.6) — เตือนถึงเวลา + เลื่อน + ย้ำ 1 ครั้ง + เก็บกวาด
//
// 🔴 ข้อยกเว้น M3 ที่ระบุใน §3.3: อ่าน CalItem ข้ามผู้ใช้/ร้าน (แถวที่ nextFireAt ≤ now) แต่ส่งผลถึง "เจ้าของแถว" คนเดียวเสมอ
//    (`sendPushEach` ต่อ row.userId ไม่กรองร้าน · R-CAL-12) — จึงเป็นไฟล์เดียวของปฏิทินที่ใช้ prisma ดิบ (F5 baseline)
// 🔴 push เฉพาะ CalItem (R-CAL-22 · ไม่แตะการ์ดบอร์ด/กิจกรรม CRM) · ไม่ใช้ quiet hours (R-CAL-11) · ไม่ใส่ badge (Q3)
// 🔴 idempotent ทุกบรรทัด: จอง lease (updateMany มีเงื่อนไข) → commit แบบมีเงื่อนไข leaseToken+version **ก่อน**ส่ง
//    (ผู้ใช้ เสร็จ/เลื่อน/แก้ ระหว่างนั้น = version เปลี่ยน = commit 0 แถว = ไม่ส่ง) → ส่งนอกทรานแซกชัน → ส่งล้มด้วย transport = คืนค่า+ลองใหม่ ≤ 3
// 🔴 ไม่ log title/note — logOps ใส่แค่ itemId
import { randomUUID } from "node:crypto";
import type { CalItem, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { sendPushEach } from "@/lib/core/push";
import type { MembershipCtx } from "@/lib/core/rbac";
import { linkKey, resolveLinks, type LinkInfo } from "./links";
import { afterFire, fireReason, schedule, type FireReason } from "./next-fire";
import { fireMessage } from "./push-msg";

const LEASE_MS = 120_000;
const CLAIM_MAX = 100;
const RETRY_MS = 60_000;
const MAX_ATTEMPTS = 3;
const SWEEP_MAX = 200;
const DAY_MS = 86_400_000;
const KEEP_CLOSED_MS = 90 * DAY_MS;
const DRAFT_TTL_MS = DAY_MS;

export type FireDeps = {
  /** transport push (ฉีดได้แบบ push.ts) */
  post?: (payloads: unknown[], signal?: AbortSignal) => Promise<unknown>;
  /** QC เท่านั้น: จำกัดแถวที่จอง/กวาด (ฐาน QC มีแถวของ seed/ข้อสอบอื่นปน) */
  scope?: { userIds?: string[]; itemIds?: string[] };
  /** QC เท่านั้น: จุดแทรกหลังจองก่อน commit (จำลองผู้ใช้แก้ระหว่าง job ถือ lease) */
  afterClaim?: (ids: string[]) => Promise<void>;
  /** QC เท่านั้น: ลำดับแถวที่ส่งในรอบนี้ */
  onSent?: (ids: string[]) => void;
  /** QC เท่านั้น: เก็บกวาดทุกรอบ (ปกติชั่วโมงละครั้ง) */
  sweepNow?: boolean;
};
export type FireResult = { claimed: number; sent: number; skipped: number; retried: number; gaveUp: number; noMember: number; swept: number; released: number };

const scopeWhere = (deps?: FireDeps): Prisma.CalItemWhereInput => ({
  ...(deps?.scope?.userIds ? { userId: { in: deps.scope.userIds } } : {}),
  ...(deps?.scope?.itemIds ? { id: { in: deps.scope.itemIds } } : {}),
});

const COMMIT_CONCURRENCY = 8;
const LINK_CONCURRENCY = 4;
/** เวลาเผื่อส่งหลังเลิกรับแถวใหม่ (ms) — แถวที่ commit แล้วต้องได้ส่งในรอบนี้ (Expo ≤ 4 วิ/ชุด) */
const SEND_RESERVE_MS = 1_500;
/** Membership ไม่ active (ถูกระงับ) = เลื่อนการตรวจไป 1 ชม. ไม่ทิ้งตาราง (review M5) */
export const MEMBER_RECHECK_MS = 3_600_000;
/** เก็บกวาดชั่วโมงละครั้ง (นาทีที่ 7) — review m7 */
const SWEEP_MINUTE = 7;

async function pool<T>(xs: T[], n: number, fn: (x: T) => Promise<void>, stop: () => boolean = () => false): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length && !stop()) await fn(xs[i++]!);
    }),
  );
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/**
 * หนึ่งรอบของ calendar.fire — ไม่โยน
 *   ก) จอง ≤ 100 แถวที่ถึงก่อน (เก่าสุดก่อน) ข) commit สถานะใหม่ (ขนาน 8 · มีเงื่อนไข leaseToken+version) จนเกือบหมดงบ
 *   ค) ปล่อย lease ของแถวที่ไม่ทัน (รอบหน้าหยิบต่อทันที · review M3) ง) อ่าน link ต่อ (ผู้ใช้,ร้าน) จ) ส่งรวมชุดละ ≤ 100 ใบ (sendPushEach)
 *   ฉ) ส่งล้ม (transport/หมดเวลา/HTTP 429-5xx) = คืนสถานะ + ลองใหม่ ≤ 3 · `signal` ยกเลิก = ส่งล้ม ⇒ ลองใหม่ (review M2)
 */
export async function runCalendarFire(now: Date, opts: { deadline?: number; signal?: AbortSignal; deps?: FireDeps } = {}): Promise<FireResult> {
  const deps = opts.deps;
  const deadline = opts.deadline ?? Date.now() + 5_000;
  const stopClaiming = () => Date.now() > deadline - SEND_RESERVE_MS || !!opts.signal?.aborted;
  const res: FireResult = { claimed: 0, sent: 0, skipped: 0, retried: 0, gaveUp: 0, noMember: 0, swept: 0, released: 0 };
  const release = { leaseToken: null, leaseUntil: null };

  // ก) จอง ≤ 100 แถวแรกตาม nextFireAt (ถึงก่อน = ส่งก่อน)
  const due = { status: "OPEN" as const, nextFireAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] };
  const cand = await prisma.calItem.findMany({ where: { ...due, ...scopeWhere(deps) }, orderBy: [{ nextFireAt: "asc" }, { id: "asc" }], take: CLAIM_MAX, select: { id: true } });
  if (cand.length) {
    const token = randomUUID();
    await prisma.calItem.updateMany({ where: { ...due, id: { in: cand.map((c) => c.id) } }, data: { leaseUntil: new Date(+now + LEASE_MS), leaseToken: token } });
    const rows = await prisma.calItem.findMany({ where: { leaseToken: token }, orderBy: [{ nextFireAt: "asc" }, { id: "asc" }] });
    res.claimed = rows.length;
    if (deps?.afterClaim) await deps.afterClaim(rows.map((r) => r.id));

    const mems = rows.length
      ? await prisma.membership.findMany({
          where: { acceptedAt: { not: null }, OR: rows.map((r) => ({ userId: r.userId, tenantId: r.tenantId })) },
          select: { userId: true, tenantId: true, role: true, unitAccess: true, permissions: true },
        })
      : [];
    const memOf = new Map(mems.map((m) => [`${m.userId}:${m.tenantId}`, m]));

    type Out = { row: CalItem; reason: FireReason; occ: Date; membership: MembershipCtx; order: number };
    const toSend: Out[] = [];
    const handled = new Set<string>();
    /** เขียนแบบมีเงื่อนไข version แล้วปล่อย lease เสมอ (review m3: ผู้ใช้แก้ระหว่างนั้น = ไม่ทับ แต่ไม่ขัง lease) */
    const settle = async (row: CalItem, data: Prisma.CalItemUpdateManyMutationInput) => {
      await prisma.calItem.updateMany({ where: { id: row.id, leaseToken: token, version: row.version }, data: { ...data, ...release } });
      await prisma.calItem.updateMany({ where: { id: row.id, leaseToken: token }, data: release });
    };

    // ข) commit ก่อนส่ง
    await pool(
      rows.map((row, order) => ({ row, order })),
      COMMIT_CONCURRENCY,
      async ({ row, order }) => {
        handled.add(row.id);
        try {
          const m = memOf.get(`${row.userId}:${row.tenantId}`);
          if (!m) {
            // ถูกระงับ/ยังไม่รับคำเชิญ — ไม่ส่ง และไม่ทิ้งตาราง: ตรวจใหม่ใน 1 ชม. (คืนสิทธิ์ = rescheduleMemberCalendar ปลุกทันที)
            await settle(row, { nextFireAt: new Date(+now + MEMBER_RECHECK_MS) });
            res.noMember++;
            return;
          }
          const reason = fireReason(row, now);
          if (!reason) {
            await settle(row, { nextFireAt: schedule(row, now).nextFireAt });
            res.skipped++;
            return;
          }
          const patch = afterFire(row, reason, now);
          const firedNow = +(patch.firedOccAt ?? 0) !== +(row.firedOccAt ?? 0);
          const occ = firedNow ? row.occursAt : row.firedOccAt ?? row.occursAt;
          const c = await prisma.calItem.updateMany({ where: { id: row.id, leaseToken: token, version: row.version }, data: { ...patch, ...release } });
          if (c.count !== 1) {
            await prisma.calItem.updateMany({ where: { id: row.id, leaseToken: token }, data: release });
            res.skipped++;
            return;
          }
          const membership: MembershipCtx = {
            role: m.role,
            unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
            permissions: (m.permissions ?? {}) as Record<string, unknown>,
          };
          toSend.push({ row, reason, occ, membership, order });
        } catch (e) {
          await logOps("WARN", "calendar", "calendar.fire: แถวล้ม", { tenantId: row.tenantId, detail: `itemId=${row.id} · ${errText(e)}` }).catch(() => undefined);
        }
      },
      stopClaiming,
    );

    // ค) แถวที่ไม่ทันงบ — ปล่อย lease ให้รอบหน้า (ไม่รอ 2 นาที · ลำดับถึงก่อนคงอยู่)
    const left = rows.filter((r) => !handled.has(r.id)).map((r) => r.id);
    if (left.length) res.released = (await prisma.calItem.updateMany({ where: { leaseToken: token, id: { in: left } }, data: release })).count;

    // ง) ข้อมูลล่าสุดของสิ่งที่ผูก ต่อ (ผู้ใช้,ร้าน) — เฉพาะที่เจ้าของยังอ่านได้ (R-CAL-23)
    toSend.sort((a, b) => a.order - b.order);
    const groups = new Map<string, Out[]>();
    for (const o of toSend) if (o.row.linkType && o.row.linkId) groups.set(`${o.row.userId}:${o.row.tenantId}`, [...(groups.get(`${o.row.userId}:${o.row.tenantId}`) ?? []), o]);
    const linkOf = new Map<string, LinkInfo>();
    await pool([...groups.values()], LINK_CONCURRENCY, async (g) => {
      try {
        const who = { userId: g[0]!.row.userId, tenantId: g[0]!.row.tenantId, membership: g[0]!.membership };
        const m = await resolveLinks(who, g.map((o) => ({ type: o.row.linkType!, id: o.row.linkId! })));
        for (const o of g) {
          const li = m.get(linkKey({ type: o.row.linkType!, id: o.row.linkId! }));
          if (li) linkOf.set(o.row.id, li);
        }
      } catch {
        /* อ่าน link ไม่ได้ = ส่งแบบไม่ผูก */
      }
    });

    // จ) ส่งรวม (ไม่กรองร้าน · R-CAL-12)
    const msgs = toSend.map((o) => {
      const li = linkOf.get(o.row.id);
      return { userId: o.row.userId, msg: fireMessage(o.row, o.reason, o.occ, li ? { body: li.body, phone: li.phone } : null) };
    });
    const sent = await sendPushEach(msgs, { ...(deps?.post ? { post: deps.post } : {}), ...(opts.signal ? { signal: opts.signal } : {}) });
    deps?.onSent?.(toSend.map((o) => o.row.id));

    // ฉ) ส่งล้มด้วย transport = คืนสถานะ + ลองใหม่
    await pool(
      toSend.map((o, k) => ({ o, r: sent[k]! })),
      COMMIT_CONCURRENCY,
      async ({ o, r }) => {
        if (r.transportError) await retryOrGiveUp(o.row, now, res).catch(() => undefined);
        else res.sent++;
      },
    );
  }

  // เก็บกวาด — ชั่วโมงละครั้ง (นาทีที่ 7 ไทย) · DRAFT > 24 ชม. → CANCELLED · ปิดแล้ว (ไม่ทำซ้ำ) > 90 วัน → ลบ
  const minute = new Date(+now + 7 * 3_600_000).getUTCMinutes();
  if ((deps?.sweepNow || minute === SWEEP_MINUTE) && Date.now() <= deadline) {
    try {
      res.swept += await sweep(now, deps);
    } catch (e) {
      await logOps("WARN", "calendar", "calendar.fire: เก็บกวาดล้ม", { detail: errText(e) }).catch(() => undefined);
    }
  }
  return res;
}

/** ส่งล้มด้วย transport: คืนสถานะก่อนยิง + ลองใหม่ใน 60 วิ · ครบ 3 ครั้ง = เลิก (คงสถานะว่ายิงแล้ว) + WARN */
async function retryOrGiveUp(row: CalItem, now: Date, res: FireResult): Promise<void> {
  const attempts = row.fireAttempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    res.gaveUp++;
    await logOps("WARN", "calendar", "push ล้ม 3 ครั้ง", { tenantId: row.tenantId, detail: `itemId=${row.id}` }).catch(() => undefined);
    return;
  }
  res.retried++;
  // where version: ผู้ใช้แก้ระหว่างส่ง = ไม่คืนค่า (ของผู้ใช้ชนะ)
  await prisma.calItem.updateMany({
    where: { id: row.id, version: row.version },
    data: {
      occursAt: row.occursAt,
      firedOccAt: row.firedOccAt,
      lastFiredAt: row.lastFiredAt,
      snoozeUntil: row.snoozeUntil,
      nagAt: row.nagAt,
      nextFireAt: new Date(+now + RETRY_MS),
      fireAttempts: attempts,
    },
  });
}

async function sweep(now: Date, deps?: FireDeps): Promise<number> {
  const sc = scopeWhere(deps);
  let n = 0;
  const drafts = await prisma.calItem.findMany({ where: { ...sc, status: "DRAFT", createdAt: { lt: new Date(+now - DRAFT_TTL_MS) } }, select: { id: true }, take: SWEEP_MAX });
  if (drafts.length) {
    n += (await prisma.calItem.updateMany({ where: { id: { in: drafts.map((d) => d.id) }, status: "DRAFT" }, data: { status: "CANCELLED", cancelledAt: now, nextFireAt: null, version: { increment: 1 } } })).count;
  }
  const old = new Date(+now - KEEP_CLOSED_MS);
  const gone = await prisma.calItem.findMany({
    where: { ...sc, OR: [{ status: "CANCELLED", cancelledAt: { lt: old } }, { status: "DONE", repeat: "NONE", doneAt: { lt: old } }] },
    select: { id: true },
    take: SWEEP_MAX,
  });
  if (gone.length) n += (await prisma.calItem.deleteMany({ where: { id: { in: gone.map((g) => g.id) }, status: { in: ["CANCELLED", "DONE"] } } })).count;
  return n;
}
