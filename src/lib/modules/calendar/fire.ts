// fire.ts — งานรายนาที `calendar.fire` (CAL1.4 · สัญญา §5.6) — เตือนถึงเวลา + เลื่อน + ย้ำ 1 ครั้ง + เก็บกวาด
//
// 🔴 ข้อยกเว้น M3 ที่ระบุใน §3.3: อ่าน CalItem ข้ามผู้ใช้/ร้าน (แถวที่ nextFireAt ≤ now) แต่ส่งผลถึง "เจ้าของแถว" คนเดียวเสมอ
//    (`sendPushToUser(row.userId)` ไม่ใส่ tenantId · R-CAL-12) — จึงเป็นไฟล์เดียวของปฏิทินที่ใช้ prisma ดิบ (F5 baseline)
// 🔴 push เฉพาะ CalItem (R-CAL-22 · ไม่แตะการ์ดบอร์ด/กิจกรรม CRM) · ไม่ใช้ quiet hours (R-CAL-11) · ไม่ใส่ badge (Q3)
// 🔴 idempotent ทุกบรรทัด: จอง lease (updateMany มีเงื่อนไข) → commit แบบมีเงื่อนไข leaseToken+version **ก่อน**ส่ง
//    (ผู้ใช้ เสร็จ/เลื่อน/แก้ ระหว่างนั้น = version เปลี่ยน = commit 0 แถว = ไม่ส่ง) → ส่งนอกทรานแซกชัน → ส่งล้มด้วย transport = คืนค่า+ลองใหม่ ≤ 3
// 🔴 ไม่ log title/note — logOps ใส่แค่ itemId
import { randomUUID } from "node:crypto";
import type { CalItem, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { sendPushToUser } from "@/lib/core/push";
import type { MembershipCtx } from "@/lib/core/rbac";
import { resolveLink } from "./links";
import { afterFire, fireReason, schedule } from "./next-fire";
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
  post?: (payloads: unknown[]) => Promise<unknown>;
  /** QC เท่านั้น: จำกัดแถวที่จอง/กวาด (ฐาน QC มีแถวของ seed/ข้อสอบอื่นปน) */
  scope?: { userIds?: string[]; itemIds?: string[] };
  /** QC เท่านั้น: จุดแทรกหลังจองก่อน commit (จำลองผู้ใช้แก้ระหว่าง job ถือ lease) */
  afterClaim?: (ids: string[]) => Promise<void>;
};
export type FireResult = { claimed: number; sent: number; skipped: number; retried: number; gaveUp: number; noMember: number; swept: number };

const scopeWhere = (deps?: FireDeps): Prisma.CalItemWhereInput => ({
  ...(deps?.scope?.userIds ? { userId: { in: deps.scope.userIds } } : {}),
  ...(deps?.scope?.itemIds ? { id: { in: deps.scope.itemIds } } : {}),
});

/** หนึ่งรอบของ calendar.fire — ไม่โยน (ข้อผิดพลาดต่อแถว = log แล้วไปต่อ · lease หมดเองใน 2 นาที) */
export async function runCalendarFire(now: Date, opts: { deadline?: number; deps?: FireDeps } = {}): Promise<FireResult> {
  const deps = opts.deps;
  const deadline = opts.deadline ?? Date.now() + 5_000;
  const res: FireResult = { claimed: 0, sent: 0, skipped: 0, retried: 0, gaveUp: 0, noMember: 0, swept: 0 };

  // 1) จอง ≤ 100 แถวแรกตาม nextFireAt
  const due = { status: "OPEN" as const, nextFireAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] };
  const cand = await prisma.calItem.findMany({ where: { ...due, ...scopeWhere(deps) }, orderBy: [{ nextFireAt: "asc" }, { id: "asc" }], take: CLAIM_MAX, select: { id: true } });
  if (cand.length) {
    const token = randomUUID();
    await prisma.calItem.updateMany({ where: { ...due, id: { in: cand.map((c) => c.id) } }, data: { leaseUntil: new Date(+now + LEASE_MS), leaseToken: token } });
    const rows = await prisma.calItem.findMany({ where: { leaseToken: token }, orderBy: [{ nextFireAt: "asc" }, { id: "asc" }] });
    res.claimed = rows.length;
    if (deps?.afterClaim) await deps.afterClaim(rows.map((r) => r.id));

    // 2) สมาชิกที่ยังรับอยู่ของ (userId, tenantId) — ไม่มี = หยุดยิง (ไม่ลบ · ลบเป็นงานของ removeStaff)
    const mems = rows.length
      ? await prisma.membership.findMany({
          where: { acceptedAt: { not: null }, OR: rows.map((r) => ({ userId: r.userId, tenantId: r.tenantId })) },
          select: { userId: true, tenantId: true, role: true, unitAccess: true, permissions: true },
        })
      : [];
    const memOf = new Map(mems.map((m) => [`${m.userId}:${m.tenantId}`, m]));

    for (const row of rows) {
      const release = { leaseToken: null, leaseUntil: null };
      if (Date.now() > deadline) break; // ที่เหลือ lease หมดเองแล้วรอบหน้าทำต่อ
      try {
        const m = memOf.get(`${row.userId}:${row.tenantId}`);
        if (!m) {
          await prisma.calItem.updateMany({ where: { id: row.id, leaseToken: token, version: row.version }, data: { nextFireAt: null, ...release } });
          res.noMember++;
          continue;
        }
        const reason = fireReason(row, now);
        if (!reason) {
          // nextFireAt ค้างโดยไม่มีเหตุ (เช่นแก้ระหว่างทาง) — คำนวณใหม่แล้วปล่อย
          await prisma.calItem.updateMany({ where: { id: row.id, leaseToken: token, version: row.version }, data: { nextFireAt: schedule(row, now).nextFireAt, ...release } });
          res.skipped++;
          continue;
        }
        const patch = afterFire(row, reason, now);
        // occurrence ที่แจ้ง: ยิงครั้งปกติ = occursAt เดิม · เลื่อน/ย้ำ = ครั้งที่ยิงล่าสุด
        const firedNow = +(patch.firedOccAt ?? 0) !== +(row.firedOccAt ?? 0);
        const occ = firedNow ? row.occursAt : row.firedOccAt ?? row.occursAt;
        // 4) commit ก่อนส่ง — 0 แถว = ผู้ใช้แก้ระหว่างนั้น ⇒ ไม่ส่ง
        const c = await prisma.calItem.updateMany({ where: { id: row.id, leaseToken: token, version: row.version }, data: { ...patch, ...release } });
        if (c.count !== 1) {
          // ผู้ใช้แก้ระหว่างนั้น — ปล่อย lease (ฟิลด์ของ job ล้วน) ให้รอบหน้าคิดจากสถานะใหม่
          await prisma.calItem.updateMany({ where: { id: row.id, leaseToken: token }, data: release });
          res.skipped++;
          continue;
        }
        // 5) ส่ง (นอกทรานแซกชัน) — ข้อความใช้ข้อมูลล่าสุดของสิ่งที่ผูก เฉพาะที่เจ้าของยังอ่านได้ (R-CAL-23)
        const membership: MembershipCtx = {
          role: m.role,
          unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
          permissions: (m.permissions ?? {}) as Record<string, unknown>,
        };
        const li = row.linkType && row.linkId ? await resolveLink({ userId: row.userId, tenantId: row.tenantId, membership }, { type: row.linkType, id: row.linkId }) : null;
        const msg = fireMessage(row, reason, occ, li ? { body: li.body, phone: li.phone } : null);
        const r = await sendPushToUser(row.userId, msg, deps?.post ? { post: deps.post } : undefined);
        if (r.transportErrors > 0 && r.sent === 0) await retryOrGiveUp(row, now, res);
        else res.sent++;
      } catch (e) {
        await logOps("WARN", "calendar", "calendar.fire: แถวล้ม", { tenantId: row.tenantId, detail: `itemId=${row.id} · ${e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)}` }).catch(() => undefined);
      }
    }
  }

  // 6) เก็บกวาด (รอบละ ≤ 200 ต่อชนิด) — DRAFT > 24 ชม. → CANCELLED · ปิดแล้ว (ไม่ทำซ้ำ) > 90 วัน → ลบ
  if (Date.now() <= deadline) {
    try {
      res.swept += await sweep(now, deps);
    } catch (e) {
      await logOps("WARN", "calendar", "calendar.fire: เก็บกวาดล้ม", { detail: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) }).catch(() => undefined);
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
