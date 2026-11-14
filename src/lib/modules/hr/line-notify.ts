// HR H4.5 ▸ แจ้งเตือนพนักงาน: ในแอปเสมอ + คิวส่ง LINE (brief hr-brief-H4.5 R6 · R9 · R12 · P6) — ฝั่ง HR ล้วน: ไม่ import แชท/แพลตฟอร์ม
//
// planHrNotices(evt): ผู้รับคิดสดจากฐาน (payload ใช้แค่ id) · 1 tx · INSERT … ON CONFLICT DO NOTHING ต่อ (ร้าน, dedupeKey) ⇒ ส่งซ้ำ/พร้อมกันกี่รอบ = แถวเดียว ·
//   แถวที่เพิ่งเกิด ⇒ แจ้งในแอป (ข้อความคงที่ · OT ไม่เพิ่มเพราะ ot.ts แจ้งอยู่แล้ว) + line = PENDING (ร้านเปิด ∧ เปิดชนิดนี้ ∧ ผูก ACTIVE) | HELD (โหมดสรุป) | NONE
// claimLineNotices: จองแถวด้วย UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED) ⇒ SENDING + สัญญาเช่า 2 นาที (nextAttemptAt) · SENDING ที่สัญญาหมด = หยิบใหม่ได้ ·
//   แล้วตรวจสดรายแถว (ร้านเปิด · ผูก ACTIVE · พนักงานยังทำงาน · บัญชีผูก = ผู้ขอรหัส · สมาชิกภาพ) — ไม่ผ่าน ⇒ ปิดการผูก + แถว SKIPPED
// เพดานรายเดือน: นับ SENT/SENDING ที่จองเวลาส่งไว้ในเดือนไทย (ไม่นับแถวสมาชิกของสรุป) ใต้ล็อก hr:linecap:<ระบบ> ⇒ ไม่เกินแม้ส่งพร้อมกัน
// ค่าตั้ง lineNotify: เขียนผ่าน lockHrSettings + writeHrSettingsKeys เท่านั้น (HR-SET-1) · audit hr.line.settings / cap_reached / quota (id ล้วน) ◂
import { randomInt, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { lockHrSettings, writeHrSettingsKeys } from "./settings-lock";
import { SETTINGS_TEXT } from "./settings";
import { hrScopeOf } from "./scope";
import { finalizedOf, slipState } from "./payslip-rules";
import { endLineLinks, lineLinkInvalidReason, type LineEndReason } from "./line-link";
import {
  appNoteOf,
  dayKeyBkk,
  dedupeKeyOf,
  eventOfKind,
  HR_LINE_EVENTS,
  type HrLineEvent,
  hmToMin,
  isDigestAt,
  LINE_CAP_RANGE,
  lineNotifyPolicyOf,
  minuteOfDayBkk,
  monthKeyBkk,
  monthRangeBkk,
  type HrNoticeKind,
  type LineNotifyPolicy,
} from "./line-rules";

type Ctx = { tenantId: string; systemId: string };
type Tx = ReturnType<typeof tenantDb>;
type Evt = { id?: string; tenantId: string; systemId?: string | null; type: string; payload: unknown };
type Recipient = { employeeId: string; kind: HrNoticeKind; refId: string; outcome: string | null; app: boolean };

const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
const LEASE_MS = 2 * 60_000;
/** สัญญาเช่า = now + 2 นาที + ส่วนสุ่ม (มิลลิวินาที) — ค่า nextAttemptAt ของแถวที่จองเป็น "ตั๋ว" ของผู้จอง (H4.5 fix ▸ H) */
const leaseOf = (now: Date) => new Date(now.getTime() + LEASE_MS + randomInt(1, 30_000));
/** แถวต่อรอบการจอง (ส่งทีละแถว ≤ 10 วิ/แถว ⇒ จบในสัญญาเช่า · ต่อสัญญาก่อนยิงทุกแถว) */
export const LINE_CLAIM_BATCH = 20;
const PENDING_GRACE_MS = 60_000;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);
const objOf = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
async function lock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
const policyOfSettings = (settings: unknown): LineNotifyPolicy => lineNotifyPolicyOf(objOf(settings).lineNotify);

// ═══════════════════════════ วางแผนแจ้งเตือนจากเหตุการณ์ ═══════════════════════════
/** ผู้รับของเหตุการณ์ — อ่านสดจากฐาน (P6) · เหตุการณ์ที่ไม่เกี่ยว/ข้อมูลไม่ครบ ⇒ [] */
async function recipientsOf(ctx: Ctx, evt: Evt): Promise<Recipient[]> {
  const p = objOf(evt.payload);
  const db = tenantDb(ctx);
  switch (evt.type) {
    case "hr.roster.published": {
      const ids = (Array.isArray(p.employeeIds) ? p.employeeIds : []).filter(isId).slice(0, 1000);
      if (!isId(p.publishId) || !ids.length) return [];
      const rows = await db.hrEmployee.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true } });
      return rows.map((r) => ({ employeeId: r.id, kind: "ROSTER" as const, refId: p.publishId as string, outcome: null, app: true }));
    }
    case "hr.leave.decided": {
      if (!isId(p.leaveId) || (p.status !== "APPROVED" && p.status !== "REJECTED")) return []; // CANCELLED / อื่น ๆ = ไม่แจ้ง
      const l = await db.hrLeave.findFirst({ where: { id: p.leaveId }, select: { employeeId: true, status: true, decidedById: true, employee: { select: { linkedUserId: true } } } });
      if (!l || l.status !== p.status) return [];
      if (l.decidedById && l.employee.linkedUserId && l.decidedById === l.employee.linkedUserId) return []; // ตัดสินใบของตัวเอง (ยกเลิก/เจ้าของร้าน) = ไม่แจ้งตัวเอง
      return [{ employeeId: l.employeeId, kind: "LEAVE", refId: p.leaveId, outcome: l.status, app: true }];
    }
    case "hr.ot.decided": {
      if (!isId(p.otRequestId) || (p.status !== "APPROVED" && p.status !== "REJECTED" && p.status !== "CANCELLED")) return [];
      const o = await db.hrOtRequest.findFirst({ where: { id: p.otRequestId }, select: { employeeId: true, status: true } });
      if (!o || o.status !== p.status) return [];
      return [{ employeeId: o.employeeId, kind: "OT", refId: p.otRequestId, outcome: o.status, app: false }]; // ในแอป = notifyOtDecided (H2.9) อยู่แล้ว
    }
    case "hr.shift.swap_requested": {
      if (!isId(p.swapId)) return [];
      const s = await db.hrShiftSwapRequest.findFirst({ where: { id: p.swapId }, select: { targetEmployeeId: true } });
      return s?.targetEmployeeId ? [{ employeeId: s.targetEmployeeId, kind: "SWAP_ASK", refId: p.swapId, outcome: null, app: true }] : [];
    }
    case "hr.shift.swap_approved": {
      if (!isId(p.swapId)) return [];
      const s = await db.hrShiftSwapRequest.findFirst({ where: { id: p.swapId }, select: { status: true, requesterEmployeeId: true, targetEmployeeId: true } });
      if (!s || s.status !== "APPROVED") return [];
      return [...new Set([s.requesterEmployeeId, s.targetEmployeeId].filter((x): x is string => !!x))].map((employeeId) => ({ employeeId, kind: "SWAP" as const, refId: p.swapId as string, outcome: "APPROVED", app: true }));
    }
    case "hr.payroll.paid": {
      if (!isId(p.runId)) return [];
      const r = await db.hrPayrollRun.findFirst({ where: { id: p.runId }, select: { status: true, engineVersion: true, stepsJson: true } });
      if (!r || slipState({ status: r.status, engineVersion: r.engineVersion, finalized: finalizedOf(r.stepsJson) }) !== "ISSUED") return [];
      const items = await db.hrPayrollItem.findMany({ where: { runId: p.runId }, select: { employeeId: true }, take: 5000 });
      return items.map((i) => ({ employeeId: i.employeeId, kind: "SLIP" as const, refId: p.runId as string, outcome: null, app: true }));
    }
    default:
      return [];
  }
}

/** ระบบ HR ของเหตุการณ์ (payload.systemId → evt.systemId) ที่เป็นของร้านนี้จริง + นโยบาย */
async function hrSystemOf(evt: Evt): Promise<{ ctx: Ctx; policy: LineNotifyPolicy } | null> {
  const tenantId = str(evt?.tenantId);
  const systemId = str(objOf(evt?.payload).systemId) || str(evt?.systemId);
  if (!tenantId || !systemId) return null;
  const s = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { settings: true } });
  return s ? { ctx: { tenantId, systemId }, policy: policyOfSettings(s.settings) } : null;
}

/**
 * เหตุการณ์ → แถวแจ้งเตือน (1 tx) — คืน id ที่ต้องส่ง LINE ทันที (PENDING) · ไม่ใช่เหตุการณ์ที่รู้จัก = ว่าง
 * ส่งซ้ำ/พร้อมกัน: แถวเดิมไม่ถูกเพิ่ม · แจ้งในแอปเฉพาะแถวที่เพิ่งเกิด
 */
export async function planHrNotices(evt: Evt): Promise<{ tenantId: string; ids: string[] }> {
  const none = { tenantId: str(evt?.tenantId), ids: [] as string[] };
  const sys = await hrSystemOf(evt);
  if (!sys) return none;
  const { ctx, policy } = sys;
  const rcpts = await recipientsOf(ctx, evt);
  if (!rcpts.length) return none;
  const ids = await tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    const out: string[] = [];
    const emps = await tx.hrEmployee.findMany({ where: { id: { in: [...new Set(rcpts.map((r) => r.employeeId))] } }, select: { id: true, linkedUserId: true } });
    const userOf = new Map(emps.map((e) => [e.id, e.linkedUserId]));
    const linked = new Set(
      (await tx.hrLineLink.findMany({ where: { employeeId: { in: emps.map((e) => e.id) }, status: "ACTIVE" }, select: { employeeId: true } })).map((l) => l.employeeId),
    );
    for (const r of rcpts) {
      if (!userOf.has(r.employeeId)) continue;
      const user = userOf.get(r.employeeId) ?? null;
      const ev = eventOfKind(r.kind);
      const want = policy.enabled && !!ev && policy.events[ev] && linked.has(r.employeeId);
      const line = want ? (policy.mode === "DIGEST" ? "HELD" : "PENDING") : "NONE";
      const note = r.app && user ? appNoteOf(r.kind, r.outcome) : null;
      const key = dedupeKeyOf({ kind: r.kind, refId: r.refId, employeeId: r.employeeId, outcome: r.outcome });
      const id = randomUUID();
      const ins = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "HrNotice" ("id", "tenantId", "systemId", "employeeId", "kind", "refId", "outcome", "dedupeKey", "appNotified", "line", "lineAttempts", "createdAt")
        VALUES (${id}, ${ctx.tenantId}, ${ctx.systemId}, ${r.employeeId}, ${r.kind}, ${r.refId}, ${r.outcome}, ${key}, ${!!note}, ${line}, 0, now())
        ON CONFLICT ("tenantId", "dedupeKey") DO NOTHING RETURNING "id"`;
      if (!ins.length) continue;
      if (note && user) await tx.appNotification.create({ data: { tenantId: ctx.tenantId, recipientUserId: user, title: note.title, body: note.body } });
      if (line === "PENDING") out.push(id);
    }
    return out;
  }, TX_OPTS);
  return { tenantId: ctx.tenantId, ids };
}

/** พนักงานพ้นสภาพ: แจ้งเตือนที่ยังไม่ส่งของคนนี้ ⇒ SKIPPED (ไม่มีการยิงหลัง commit) */
export async function skipPendingNotices(i: { tenantId: string; employeeId: string }, code: string): Promise<number> {
  const tenantId = str(i?.tenantId);
  const employeeId = str(i?.employeeId);
  if (!tenantId || !employeeId) return 0;
  return tenantDb({ tenantId }).$executeRaw`
    UPDATE "HrNotice" SET "line" = 'SKIPPED', "skipCode" = ${code.slice(0, 40)}, "nextAttemptAt" = NULL
    WHERE "tenantId" = ${tenantId} AND "employeeId" = ${employeeId} AND "line" IN ('PENDING', 'HELD', 'FAILED')`;
}

// ═══════════════════════════ จอง + ตรวจสด ═══════════════════════════
type NoticeRow = { id: string; tenantId: string; systemId: string; employeeId: string; kind: string; refId: string; outcome: string | null; dedupeKey: string; lineAttempts: number; lease: Date };
export type ClaimedNotice = NoticeRow & { lease: Date; connectionId: string; chatContactId: string; homeUnitId: string | null; policy: LineNotifyPolicy; n: number };

/**
 * จองแถวที่ถึงเวลาส่ง ⇒ SENDING (สัญญาเช่า 2 นาที) แล้วตรวจสดรายแถว — คืนเฉพาะแถวที่ส่งได้
 * ids = แถวของผู้เรียก (ต้องระบุร้าน) · ไม่ระบุ ids = แถวที่ถึงเวลาของทุกร้าน (งานตามเวลา)
 */
export async function claimLineNotices(i: { tenantId?: string | null; ids?: string[] | null; now: Date; limit?: number }): Promise<ClaimedNotice[]> {
  const now = i?.now instanceof Date && Number.isFinite(i.now.getTime()) ? i.now : new Date();
  const limit = Number.isInteger(i?.limit) && (i.limit as number) > 0 ? Math.min(i.limit as number, LINE_CLAIM_BATCH) : LINE_CLAIM_BATCH;
  const lease = leaseOf(now);
  const tenantId = str(i?.tenantId);
  let rows: NoticeRow[] = [];
  if (Array.isArray(i?.ids)) {
    const ids = i.ids.filter(isId).slice(0, limit);
    if (!tenantId || !ids.length) return [];
    rows = await tenantDb({ tenantId }).$queryRaw<NoticeRow[]>`
      UPDATE "HrNotice" n SET "line" = 'SENDING', "nextAttemptAt" = ${lease}
      FROM (SELECT "id" FROM "HrNotice" WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::text[])
              AND ("line" = 'PENDING' OR ("line" IN ('FAILED', 'HELD', 'SENDING') AND "nextAttemptAt" IS NOT NULL AND "nextAttemptAt" <= ${now}))
            ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED) c
      WHERE n."id" = c."id"
      RETURNING n."id", n."tenantId", n."systemId", n."employeeId", n."kind", n."refId", n."outcome", n."dedupeKey", n."lineAttempts", n."nextAttemptAt" AS "lease"`;
  } else {
    const grace = new Date(now.getTime() - PENDING_GRACE_MS);
    rows = await tenantDb({ tenantId: tenantId || "" }).$queryRaw<NoticeRow[]>`
      UPDATE "HrNotice" n SET "line" = 'SENDING', "nextAttemptAt" = ${lease}
      FROM (SELECT h."id" FROM "HrNotice" h
            WHERE (${tenantId} = '' OR h."tenantId" = ${tenantId})
              AND ((h."line" = 'PENDING' AND h."createdAt" <= ${grace})
                OR (h."line" IN ('FAILED', 'HELD', 'SENDING') AND h."nextAttemptAt" IS NOT NULL AND h."nextAttemptAt" <= ${now})
                OR (h."line" = 'HELD' AND h."nextAttemptAt" IS NULL AND h."digestOf" IS NULL AND h."kind" <> 'DIGEST'
                    AND NOT EXISTS (SELECT 1 FROM "AppSystem" s WHERE s."id" = h."systemId" AND s."settings" -> 'lineNotify' ->> 'mode' = 'DIGEST')))
            ORDER BY h."nextAttemptAt" NULLS FIRST, h."createdAt", h."id" LIMIT ${limit} FOR UPDATE SKIP LOCKED) c
      WHERE n."id" = c."id"
      RETURNING n."id", n."tenantId", n."systemId", n."employeeId", n."kind", n."refId", n."outcome", n."dedupeKey", n."lineAttempts", n."nextAttemptAt" AS "lease"`;
  }
  const out: ClaimedNotice[] = [];
  const policies = new Map<string, LineNotifyPolicy | null>();
  const tenants = new Map<string, boolean>();
  for (const r of rows) {
    const ready = await precheck(r, now, policies, tenants).catch(() => null);
    if (ready) out.push(ready);
  }
  return out;
}

/** ตรวจสดก่อนส่ง (P6) — ไม่ผ่าน ⇒ แถว SKIPPED (+ ปิดการผูกเมื่อพนักงาน/บัญชีไม่ใช่คนเดิม) · คืน null */
async function precheck(r: NoticeRow, now: Date, policies: Map<string, LineNotifyPolicy | null>, tenants: Map<string, boolean>): Promise<ClaimedNotice | null> {
  const ctx: Ctx = { tenantId: r.tenantId, systemId: r.systemId };
  const db = tenantDb(ctx);
  if (!policies.has(r.systemId)) {
    const s = await tenantDb({ tenantId: r.tenantId }).appSystem.findFirst({ where: { id: r.systemId, type: "HR" }, select: { settings: true } });
    policies.set(r.systemId, s ? policyOfSettings(s.settings) : null);
  }
  const policy = policies.get(r.systemId) ?? null;
  const skip = async (code: string, end?: LineEndReason) => {
    if (end) await endLineLinks({ tenantId: r.tenantId, systemId: r.systemId, employeeId: r.employeeId }, end, { now });
    await finishLineNotice(r, { line: "SKIPPED", skipCode: code }, now);
    return null;
  };
  // HR H4.5 fix ▸ G: ร้านที่ไม่ใช่ ACTIVE (ระงับ · ปิด · รอลบ) ⇒ ไม่ส่ง ◂
  if (!tenants.has(r.tenantId)) tenants.set(r.tenantId, (await tenantDb({ tenantId: r.tenantId }).$queryRaw<{ status: string }[]>`SELECT "status"::text AS "status" FROM "Tenant" WHERE "id" = ${r.tenantId}`)[0]?.status === "ACTIVE");
  if (!tenants.get(r.tenantId)) return skip("TENANT");
  if (!policy?.enabled) return skip("OFF");
  // HR H4.5 fix ▸ E: ชนิดเหตุการณ์ที่ร้านปิดแล้ว ⇒ แถวที่ค้าง/ส่งซ้ำไม่ยิง ◂
  const ev = eventOfKind(r.kind) as HrLineEvent | null;
  if (ev && !policy.events[ev]) return skip("OFF");
  const link = await db.hrLineLink.findFirst({ where: { employeeId: r.employeeId, status: "ACTIVE" }, select: { connectionId: true, chatContactId: true, issuedForUserId: true } });
  if (!link?.connectionId || !link.chatContactId) return skip("NO_LINK");
  const why = await lineLinkInvalidReason({ tenantId: r.tenantId, systemId: r.systemId, employeeId: r.employeeId, issuedForUserId: link.issuedForUserId }); // D2 ◂
  if (why) return skip(why === "OFFBOARD" ? "INACTIVE" : "ACCOUNT", why);
  const e = await db.hrEmployee.findFirst({ where: { id: r.employeeId }, select: { unitId: true } });
  const n = r.kind === "DIGEST" ? await db.hrNotice.count({ where: { digestOf: r.id } }) : 0;
  if (r.kind === "DIGEST" && n < 1) return skip("EMPTY");
  return { ...r, connectionId: link.connectionId, chatContactId: link.chatContactId, homeUnitId: e?.unitId ?? null, policy, n };
}

export type LineFinish = { line: "SENT" | "FAILED" | "HELD" | "QUOTA" | "CAP" | "SKIPPED"; skipCode?: string | null; nextAttemptAt?: Date | null; attempted?: boolean };
const FINAL = new Set(["SENT", "QUOTA", "CAP", "SKIPPED"]);
/** ปิดรอบส่งของแถวที่จองไว้ (เฉพาะแถวที่ยัง SENDING) · แถวสรุป (DIGEST) ที่จบแล้ว ⇒ แถวสมาชิกตามสถานะเดียวกัน */
export async function finishLineNotice(r: { id: string; tenantId: string; kind: string; lease?: Date | null }, f: LineFinish, now: Date): Promise<boolean> {
  const db = tenantDb({ tenantId: r.tenantId });
  const next = f.line === "FAILED" || f.line === "HELD" ? (f.nextAttemptAt ?? null) : null;
  const sentAt = f.line === "SENT" ? now : null;
  const skipCode = f.skipCode ? f.skipCode.slice(0, 40) : null;
  const inc = f.attempted ? 1 : 0;
  // H4.5 fix ▸ H: ผู้จองที่ถือตั๋ว (lease) ปิดได้เฉพาะแถวที่ยังเป็นตั๋วของตัวเอง
  const n = r.lease
    ? await db.$executeRaw`
        UPDATE "HrNotice" SET "line" = ${f.line}, "nextAttemptAt" = ${next}, "sentAt" = ${sentAt}, "skipCode" = ${skipCode}, "lineAttempts" = "lineAttempts" + ${inc}
        WHERE "id" = ${r.id} AND "tenantId" = ${r.tenantId} AND "line" = 'SENDING' AND "nextAttemptAt" = ${r.lease}`
    : await db.$executeRaw`
        UPDATE "HrNotice" SET "line" = ${f.line}, "nextAttemptAt" = ${next}, "sentAt" = ${sentAt}, "skipCode" = ${skipCode}, "lineAttempts" = "lineAttempts" + ${inc}
        WHERE "id" = ${r.id} AND "tenantId" = ${r.tenantId} AND "line" = 'SENDING'`;
  if (n === 1 && r.kind === "DIGEST" && (FINAL.has(f.line) || (f.line === "FAILED" && !next))) {
    await db.$executeRaw`
      UPDATE "HrNotice" SET "line" = ${f.line}, "sentAt" = ${sentAt}, "skipCode" = ${skipCode}, "nextAttemptAt" = NULL
      WHERE "tenantId" = ${r.tenantId} AND "digestOf" = ${r.id} AND "line" = 'HELD'`;
  }
  return n === 1;
}

/** HR H4.5 fix ▸ H: ต่อสัญญาเช่าก่อนยิง — ยังถือตั๋วเดิม (nextAttemptAt = lease) ⇒ ตั๋วใหม่ · ผู้อื่นจองไปแล้ว ⇒ false (ไม่ยิง ไม่แตะแถว) */
export async function renewLineClaim(r: { id: string; tenantId: string; lease: Date }, now: Date): Promise<boolean> {
  const next = leaseOf(now);
  const n = await tenantDb({ tenantId: r.tenantId }).$executeRaw`
    UPDATE "HrNotice" SET "nextAttemptAt" = ${next} WHERE "id" = ${r.id} AND "tenantId" = ${r.tenantId} AND "line" = 'SENDING' AND "nextAttemptAt" = ${r.lease}`;
  if (n !== 1) return false;
  r.lease = next;
  return true;
}

/** จองโควตาเดือนนี้ให้แถวที่กำลังส่ง (sentAt = now) — เต็มเพดาน ⇒ false */
export async function reserveLineCap(r: { id: string; tenantId: string; systemId: string }, cap: number, now: Date): Promise<boolean> {
  const { from, to } = monthRangeBkk(now);
  return tenantDb({ tenantId: r.tenantId, systemId: r.systemId }).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    await lock(tx, `hr:linecap:${r.systemId}`);
    const used = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "HrNotice"
      WHERE "tenantId" = ${r.tenantId} AND "systemId" = ${r.systemId} AND "digestOf" IS NULL AND "line" IN ('SENT', 'SENDING')
        AND "sentAt" >= ${from} AND "sentAt" < ${to} AND "id" <> ${r.id}`;
    if (Number(used[0]?.n ?? 0) >= cap) return false;
    const u = await tx.$executeRaw`UPDATE "HrNotice" SET "sentAt" = ${now} WHERE "id" = ${r.id} AND "tenantId" = ${r.tenantId} AND "line" = 'SENDING'`;
    return u === 1;
  }, TX_OPTS);
}

/** audit ครั้งเดียวต่อ (action, กุญแจช่วงเวลา) ใต้ล็อก — targetId = id + ช่วง (ไม่มีข้อมูลบุคคล) */
async function auditOnce(tenantId: string, action: string, targetType: string, targetId: string, after: Record<string, string>): Promise<boolean> {
  return tenantDb({ tenantId }).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    await lock(tx, `hr:lineaudit:${action}:${targetId}`);
    if (await tx.auditLog.findFirst({ where: { action, targetId }, select: { id: true } })) return false;
    await tx.auditLog.create({ data: { tenantId, actorType: "SYSTEM", actorId: null, action, targetType, targetId, after } });
    return true;
  }, TX_OPTS);
}
/** เพดานเดือนเต็ม ⇒ audit hr.line.cap_reached {monthKey} เดือนละครั้งต่อระบบ */
export const auditLineCapReached = (r: { tenantId: string; systemId: string }, now: Date) =>
  auditOnce(r.tenantId, "hr.line.cap_reached", "AppSystem", `${r.systemId}:${monthKeyBkk(now)}`, { monthKey: monthKeyBkk(now) });
/** LINE ตอบ 429 (โควตา OA เต็ม) ⇒ audit hr.line.quota {connectionId} วันละครั้งต่อ OA */
export const auditLineQuota = (r: { tenantId: string; connectionId: string }, now: Date) =>
  auditOnce(r.tenantId, "hr.line.quota", "ChatChannelConnection", `${r.connectionId}:${dayKeyBkk(now)}`, { connectionId: r.connectionId });

// ═══════════════════════════ สรุปรายวัน (DIGEST) ═══════════════════════════
/**
 * ถึงเวลา digestAt (เวลาไทย) ของระบบที่เปิดโหมดสรุป ⇒ แถว DIGEST 1 แถวต่อพนักงานต่อวัน (คีย์ hr:DIGEST:<วัน>:<พนักงาน>) ·
 * แถว HELD ที่รอสรุปถูกผูก digestOf · คืน id ของแถวสรุปที่เพิ่งเกิด (ผู้เรียกส่งต่อ)
 */
export async function buildLineDigests(now: Date, opts: { tenantId?: string | null; deadline?: number } = {}): Promise<{ tenantId: string; ids: string[] }[]> {
  const tid = str(opts.tenantId);
  const systems = await tenantDb({ tenantId: tid }).$queryRaw<{ id: string; tenantId: string; settings: unknown }[]>`
    SELECT "id", "tenantId", "settings" FROM "AppSystem"
    WHERE "type"::text = 'HR' AND (${tid} = '' OR "tenantId" = ${tid}) AND "settings" -> 'lineNotify' ->> 'mode' = 'DIGEST' ORDER BY "id"`;
  const out: { tenantId: string; ids: string[] }[] = [];
  const day = dayKeyBkk(now);
  for (const s of systems) {
    if (typeof opts.deadline === "number" && Date.now() >= opts.deadline) break; // H4.5 fix ▸ H: งบของงานตามเวลา ◂
    const policy = policyOfSettings(s.settings);
    if (!policy.enabled || policy.mode !== "DIGEST" || minuteOfDayBkk(now) < hmToMin(policy.digestAt)) continue;
    const ctx: Ctx = { tenantId: s.tenantId, systemId: s.id };
    // H4.5 fix ▸ F: สรุปของวันนี้รวมเฉพาะแจ้งเตือนตั้งแต่เวลาสรุปของเมื่อวาน · ที่เก่ากว่า ⇒ SKIPPED(STALE) (ไม่ส่งของค้างข้ามวัน) ◂
    const windowStart = new Date(now.getTime() - (minuteOfDayBkk(now) - hmToMin(policy.digestAt)) * 60_000 - 24 * 3_600_000);
    await tenantDb(ctx).$executeRaw`
      UPDATE "HrNotice" SET "line" = 'SKIPPED', "skipCode" = 'STALE', "nextAttemptAt" = NULL
      WHERE "tenantId" = ${s.tenantId} AND "systemId" = ${s.id} AND "line" = 'HELD' AND "nextAttemptAt" IS NULL AND "digestOf" IS NULL AND "kind" <> 'DIGEST' AND "createdAt" < ${windowStart}`;
    const groups = await tenantDb(ctx).$queryRaw<{ employeeId: string }[]>`
      SELECT DISTINCT "employeeId" FROM "HrNotice"
      WHERE "tenantId" = ${s.tenantId} AND "systemId" = ${s.id} AND "line" = 'HELD' AND "nextAttemptAt" IS NULL AND "digestOf" IS NULL AND "kind" <> 'DIGEST' LIMIT 500`;
    const ids: string[] = [];
    for (const g of groups) {
      const id = await tenantDb(ctx).$transaction(async (t) => {
        const tx = t as unknown as Tx;
        await lock(tx, `hrline:digest:${s.id}:${g.employeeId}`);
        const nid = randomUUID();
        const key = dedupeKeyOf({ kind: "DIGEST", refId: day, employeeId: g.employeeId });
        const ins = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "HrNotice" ("id", "tenantId", "systemId", "employeeId", "kind", "refId", "outcome", "dedupeKey", "appNotified", "line", "lineAttempts", "createdAt")
          VALUES (${nid}, ${s.tenantId}, ${s.id}, ${g.employeeId}, 'DIGEST', ${day}, NULL, ${key}, false, 'PENDING', 0, now())
          ON CONFLICT ("tenantId", "dedupeKey") DO NOTHING RETURNING "id"`;
        if (!ins.length) return null; // สรุปของวันนี้ออกไปแล้ว — ที่เหลือรอรอบพรุ่งนี้
        const m = await tx.$executeRaw`
          UPDATE "HrNotice" SET "digestOf" = ${nid}
          WHERE "tenantId" = ${s.tenantId} AND "systemId" = ${s.id} AND "employeeId" = ${g.employeeId} AND "line" = 'HELD' AND "nextAttemptAt" IS NULL AND "digestOf" IS NULL AND "kind" <> 'DIGEST'`;
        if (m < 1) {
          await tx.$executeRaw`DELETE FROM "HrNotice" WHERE "id" = ${nid} AND "tenantId" = ${s.tenantId}`;
          return null;
        }
        return nid;
      }, TX_OPTS);
      if (id) ids.push(id);
    }
    if (ids.length) out.push({ tenantId: s.tenantId, ids });
  }
  return out;
}

// ═══════════════════════════ ค่าตั้ง (R9) ═══════════════════════════
export const LINE_SETTINGS_TEXT = {
  noPermission: SETTINGS_TEXT.noPermission,
  shopWide: "ค่าตั้งแจ้งเตือนทาง LINE ใช้ทั้งร้าน — จัดการได้เฉพาะผู้ดูแลทุกสาขา",
  cap: `เพดานต่อเดือนต้องเป็นจำนวนเต็ม ${LINE_CAP_RANGE.min} ถึง ${LINE_CAP_RANGE.max.toLocaleString("en-US")} ข้อความ`,
  digestAt: "เวลาส่งสรุปต้องเป็นรูปแบบ ชั่วโมง:นาที (เช่น 17:30)",
  mode: "รูปแบบการส่งไม่ถูกต้อง",
  unit: "ไม่พบสาขานี้ในร้าน — กรุณาเลือกสาขาใหม่",
  notFound: SETTINGS_TEXT.notFound,
  failed: SETTINGS_TEXT.failed,
} as const;
type SaveViewer = { userId?: string | null };
class LineSettingsRefusal extends Error {}

/** สมาชิกภาพผู้กดจากฐาน: OWNER หรือ hr.employee.create และดูแลทุกสาขา */
async function settingsGate(tenantId: string, viewer: SaveViewer | null | undefined): Promise<{ userId: string } | string> {
  const userId = str(viewer?.userId);
  if (!userId) return LINE_SETTINGS_TEXT.noPermission;
  const m = await tenantDb({ tenantId }).membership.findFirst({ where: { tenantId, userId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!m) return LINE_SETTINGS_TEXT.noPermission;
  const mc: MembershipCtx = { role: m.role, unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [], permissions: objOf(m.permissions) };
  if (!evaluate(mc, { module: "hr", action: "hr.employee.create" })) return LINE_SETTINGS_TEXT.noPermission;
  if (hrScopeOf({ role: mc.role, unitAccess: mc.unitAccess }).unitIds !== "*") return LINE_SETTINGS_TEXT.shopWide;
  return { userId };
}

/** ตรวจค่าที่ส่งมาแบบเข้ม (ค่าเสีย = ปฏิเสธ ไม่เดา) */
function strictPolicy(input: unknown): LineNotifyPolicy {
  const i = objOf(input);
  const ev = objOf(i.events);
  const cap = typeof i.monthlyCap === "string" && i.monthlyCap.trim() !== "" ? Number(i.monthlyCap) : i.monthlyCap;
  if (typeof cap !== "number" || !Number.isInteger(cap) || cap < LINE_CAP_RANGE.min || cap > LINE_CAP_RANGE.max) throw new LineSettingsRefusal(LINE_SETTINGS_TEXT.cap);
  if (i.mode !== "IMMEDIATE" && i.mode !== "DIGEST") throw new LineSettingsRefusal(LINE_SETTINGS_TEXT.mode);
  if (!isDigestAt(i.digestAt)) throw new LineSettingsRefusal(LINE_SETTINGS_TEXT.digestAt);
  return {
    enabled: i.enabled === true,
    events: Object.fromEntries(HR_LINE_EVENTS.map((k) => [k, ev[k] !== false])) as LineNotifyPolicy["events"],
    mode: i.mode,
    digestAt: i.digestAt,
    monthlyCap: cap,
    unitId: typeof i.unitId === "string" && i.unitId.trim() ? i.unitId.trim() : null,
  };
}

/** บันทึกนโยบายแจ้งเตือน LINE ของระบบ HR — ผ่าน lockHrSettings(hr:linepolicy) + writeHrSettingsKeys (คีย์ lineNotify เท่านั้น) */
export async function saveLineNotifyPolicy(ctx: Ctx, viewer: SaveViewer, input: unknown): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  try {
    const g = await settingsGate(ctx.tenantId, viewer);
    if (typeof g === "string") return { ok: false, reason: g };
    const next = strictPolicy(input);
    if (next.unitId && !(await tenantDb({ tenantId: ctx.tenantId }).businessUnit.findFirst({ where: { id: next.unitId }, select: { id: true } }))) throw new LineSettingsRefusal(LINE_SETTINGS_TEXT.unit);
    await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      const sys = await lockHrSettings(tx, ctx, [`hr:linepolicy:${ctx.systemId}`]); // HR-SET-1 ▸ hr:clockpolicy → hr:linepolicy → แถว AppSystem ◂
      if (!sys) throw new LineSettingsRefusal(LINE_SETTINGS_TEXT.notFound);
      const r = await writeHrSettingsKeys(tx, ctx, { lineNotify: next }); // HR-SET-1 ▸ เปลี่ยนเฉพาะคีย์ lineNotify ◂
      if (r.count !== 1) throw new LineSettingsRefusal(LINE_SETTINGS_TEXT.notFound);
      // H4.5 fix ▸ F: ปิด LINE ⇒ แถวที่รอ/พัก/ส่งซ้ำทั้งหมด SKIPPED(OFF) · ปิดชนิดใด ⇒ แถวของชนิดนั้น · เลิกโหมดสรุป ⇒ แถวที่รอสรุป — เปิดใหม่ไม่ส่งของเก่า ◂
      const offKinds = next.enabled ? HR_LINE_EVENTS.filter((k) => !next.events[k]).flatMap((k) => (k === "SWAP" ? ["SWAP", "SWAP_ASK"] : [k])) : [];
      await tx.$executeRaw`
        UPDATE "HrNotice" SET "line" = 'SKIPPED', "skipCode" = 'OFF', "nextAttemptAt" = NULL
        WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} AND "line" IN ('PENDING', 'HELD', 'FAILED')
          AND (${!next.enabled} OR "kind" = ANY(${offKinds}::text[]) OR (${next.mode !== "DIGEST"} AND "line" = 'HELD' AND "nextAttemptAt" IS NULL AND "digestOf" IS NULL))`;
    }, TX_OPTS);
    await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: g.userId, action: "hr.line.settings", targetType: "AppSystem", targetId: ctx.systemId, after: { systemId: ctx.systemId, enabled: next.enabled, mode: next.mode, digestAt: next.digestAt, monthlyCap: next.monthlyCap, events: next.events, unitId: next.unitId } });
    return { ok: true, id: ctx.systemId };
  } catch (e) {
    return { ok: false, reason: e instanceof LineSettingsRefusal ? e.message : LINE_SETTINGS_TEXT.failed };
  }
}

/** จำนวนข้อความ LINE ที่ส่งแล้วเดือนนี้ (เวลาไทย) ของระบบ — การ์ดค่าตั้ง "ส่งเดือนนี้ N / เพดาน" */
export async function lineSentThisMonth(ctx: Ctx, now: Date = new Date()): Promise<number> {
  const { from, to } = monthRangeBkk(now);
  return tenantDb(ctx).hrNotice.count({ where: { line: "SENT", digestOf: null, sentAt: { gte: from, lt: to } } });
}
