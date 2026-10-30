// SVC D.11 ▸ เตือนก่อนครบ · ทวงหลังเลยกำหนด · นัดจ่าย · จอค้างชำระ · หนังสือบอกเลิกสัญญา · event dorm.bill.overdue — สัญญา ledger/svc-briefs/svc-brief-d.11.md §5–§9
//   • ข้อความถึงผู้เช่าผ่านประตูเดียว notifyCustomer (R0.7: เวลาเงียบ · OA ต่อหน่วย · ยินยอม · QUOTA · dedupe) เท่านั้น
//   • ข้อความมาจากแม่แบบในค่าตั้งเท่านั้น และตรวจคำต้องห้ามบนข้อความที่ render แล้วก่อนส่งทุกครั้ง (findForbiddenTerms) — พบ = ไม่ส่ง
//   • ยอดค้าง: บิลที่ออกใบแจ้งหนี้ = จากบัญชี · บิลยกมาไม่มีใบ = totalSatang − paidSatang (มติ 6) · ไม่ใช้ DormBill.status (D.10)
//   • งานตามเวลา: ข้ามร้านไม่แย่งคิว (หมุนลำดับหน่วยทุกรอบ · หน่วยที่ล้มไปท้าย) · ≤ 200 บิลต่อหน่วยต่อรอบ · เคารพงบ/สัญญาณยกเลิก
//     กรองคีย์ที่จบแล้วด้วยคิวรีเดียวก่อนเรียกประตูข้อความ · ซ้อนกันกี่ทาง = ข้อความ 1 แถวต่อคีย์ · event 1 ต่อบิล (X5)
//   • ขอบเขต: tenantDb เท่านั้น · หน่วย DORM ของร้าน + Membership สด · ไม่ผ่าน ⇒ NOT_FOUND / null · ไม่ throw · event ไม่มีชื่อ/เบอร์ (X8)
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { bkkYmd, inQuietWindow } from "@/lib/core/quiet-hours";
import { getDef, renderTemplate, resolveSettingsMany } from "@/lib/core/settings";
import { findForbiddenTerms } from "@/lib/core/settings/legal/th-rental-2568";
import {
  LF_BILL_SELECT,
  addDaysYmd,
  bahtOf,
  billOutstandingSatang,
  outstandingMany,
  diffDaysYmd,
  dormActorOf,
  ledgerItemsOf,
  logLateFee,
  retryOnce,
  sweepLateFeeApprovals,
  sweepWaivedCredits,
  thDateOf,
  thMonthOf,
  ymdOfDate,
  type DormActor,
  type LateFeeCtx,
  type LfBill,
  type WaiverStatus,
} from "./latefee";

// ───────────────────────── ชนิด (สัญญา §5–§8) ─────────────────────────
type Money = number;
type Fail = { ok: false; code: string; reason: string };
export type OverdueRow = {
  billId: string;
  leaseId: string;
  roomNumber: string;
  tenantName: string;
  periodKey: string;
  dueDate: string;
  daysLate: number;
  outstandingSatang: Money;
  principalOutstandingSatang: Money;
  hasDoc: boolean;
  lateFee: { dueSatang: Money; chargedSatang: Money; waiver: WaiverStatus };
  dunning: { count: number; delivered: number; lastAt: string | null };
  promiseDate: string | null;
};
export type OverdueModel = {
  unitId: string;
  unitName: string;
  asOf: string;
  kpi: { count: number; outstandingSatang: Money; lateFeeDueSatang: Money; promised: number };
  rows: OverdueRow[];
  can: { dun: boolean; waive: boolean; requestWaive: boolean; promise: boolean; notice: boolean };
};
export type SendDunningResult = {
  ok: true;
  status: "SENT" | "SKIPPED_CONSENT" | "SKIPPED_QUIET" | "NO_CHANNEL" | "FAILED" | "SENDING";
  channel: "LINE" | "SMS" | "NONE";
  duplicate: boolean;
};
export type TerminationNotice = {
  ok: true;
  textTh: string;
  noticeDate: string;
  effectiveDate: string;
  overdue: { billId: string; periodKey: string; outstandingSatang: Money }[];
  totalOutstandingSatang: Money;
};
export type DunningJobResult = { reminders: number; dunning: number; overdueEvents: number; waiversApplied: number; failedUnits: number };

const EVENT = "dorm.bill.overdue";
const A_PROMISE = "dorm.bill.promise";
const A_TPL_BLOCKED = "dorm.dunning.template_blocked";
const A_NOTICE = "dorm.lease.termination_notice";
const SENTISH = ["SENT", "PARTIALLY_PAID", "PAID"];
const FINAL = new Set(["SENT", "SKIPPED_CONSENT", "NO_CHANNEL", "QUOTA"]);
const DUN_LEASE = ["ACTIVE", "NOTICE"];
const MAX_BILLS_PER_UNIT = 200;
const MODEL_MAX_BILLS = 500;
const TX_OPTS = { maxWait: 30_000, timeout: 60_000 } as const;
const UNIT_KEYS = ["rooms.notify.reminderBeforeDays", "rooms.notify.dunningAfterDays", "rooms.msg.reminder", "rooms.msg.dunning", "messaging.quietHours"];

const fail = (code: string, reason: string): Fail => ({ ok: false, code, reason });
const NOT_FOUND = (): Fail => fail("NOT_FOUND", "ไม่พบหอพัก บิล หรือสัญญานี้");
const INTERNAL = (): Fail => fail("INTERNAL", "ระบบขัดข้องชั่วคราว — ลองใหม่อีกครั้ง");
const NOT_OVERDUE = (): Fail => fail("NOT_OVERDUE", "บิลนี้ไม่มียอดค้างที่เลยกำหนดชำระ");
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numCmp = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });
const nowOf = (d: unknown): Date => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date());
type Tx = Prisma.TransactionClient;
async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

// ───────────────────────── บิลในข่าย (§5.1) ─────────────────────────
type DBill = LfBill & { roomId: string; partyId: string; unitId: string };
const DBILL_SELECT = { ...LF_BILL_SELECT, roomId: true, partyId: true, unitId: true } as const;
/** บิลที่ส่งแล้ว (มีใบ) หรือบิลยกมา SENT/PARTIALLY_PAID ที่ไม่มีใบ — มีวันครบกำหนด */
const ELIGIBLE: Prisma.DormBillWhereInput = {
  dueDate: { not: null },
  OR: [{ accountDocumentId: { not: null }, status: { in: SENTISH } }, { accountDocumentId: null, status: { in: ["SENT", "PARTIALLY_PAID"] } }],
};

const dkReminder = (billId: string, d: number) => `rooms:reminder:${billId}:${d}`;
const dkDunning = (billId: string, k: number | string) => `rooms:dunning:${billId}:${k}`;
const evKey = (billId: string) => `${EVENT}:${billId}`;

type UnitCfg = { before: number[]; after: number[]; quiet: { start: string; end: string } | null; tpl: Record<string, unknown> };
async function unitCfgOf(tenantId: string, unitId: string): Promise<UnitCfg> {
  const [r] = await resolveSettingsMany({ tenantId }, UNIT_KEYS, [{ unitId }]);
  const v = (k: string): unknown => r?.[k]?.value;
  const nums = (x: unknown): number[] => (Array.isArray(x) ? [...new Set(x.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0))] : []);
  const q = v("messaging.quietHours");
  return {
    before: nums(v("rooms.notify.reminderBeforeDays")),
    after: nums(v("rooms.notify.dunningAfterDays")).filter((n) => n >= 1).sort((a, b) => a - b),
    quiet: isRec(q) && typeof q.start === "string" && typeof q.end === "string" ? { start: q.start, end: q.end } : null,
    tpl: { reminder: v("rooms.msg.reminder"), dunning: v("rooms.msg.dunning") },
  };
}

/**
 * ตรวจคำต้องห้าม (L13): "TEMPLATE" = ตัวแม่แบบเอง (render ด้วยตัวแปรว่าง) ผิด ⇒ บล็อกทั้งหน่วย + audit ·
 *   "CONTENT" = แม่แบบถูกแต่ข้อความที่เติมค่าแล้วมีคำต้องห้าม (เช่น ชื่อผู้เช่า) ⇒ บล็อกเฉพาะข้อความนั้น · null = ส่งได้ (ตรวจทุกภาษาที่มี)
 */
function templateBlocked(key: string, value: unknown, vars: Record<string, string>): "TEMPLATE" | "CONTENT" | null {
  const def = getDef(key);
  if (!def) return "TEMPLATE";
  const bad = (v: Record<string, string>) => [renderTemplate(def, value, v, "th"), renderTemplate(def, value, v, "en")].some((t) => findForbiddenTerms(t).length > 0);
  if (bad({})) return "TEMPLATE";
  return bad(vars) ? "CONTENT" : null;
}

type Ctx = { roomNo: string; tenantName: string; unitName: string };
function varsOf(b: DBill, c: Ctx, outstanding: number, asOf: string): Record<string, string> {
  const due = ymdOfDate(b.dueDate) ?? asOf;
  return {
    tenantName: c.tenantName,
    roomNo: c.roomNo,
    unitName: c.unitName,
    period: thMonthOf(b.periodKey),
    amount: bahtOf(outstanding),
    dueDate: thDateOf(due),
    payLink: "",
    daysLate: String(Math.max(0, diffDaysYmd(asOf, due))),
  };
}

async function contextOf(tenantId: string, unitId: string, bills: DBill[]): Promise<{ room: Map<string, string>; party: Map<string, string> }> {
  const roomIds = [...new Set(bills.map((b) => b.roomId))];
  const partyIds = [...new Set(bills.map((b) => b.partyId))];
  const rooms = roomIds.length ? await tenantDb({ tenantId, unitId }).hotelRoom.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } }) : [];
  const parties = partyIds.length ? await tenantDb({ tenantId }).party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } }) : [];
  return { room: new Map(rooms.map((r) => [r.id, r.number])), party: new Map(parties.map((p) => [p.id, p.name])) };
}

/** นัดจ่ายล่าสุดต่อบิล (แถวล่าสุดชนะ · null = ยกเลิกนัด) */
async function promisesOf(tenantId: string, billIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!billIds.length) return out;
  const rows = await tenantDb({ tenantId }).auditLog.findMany({
    where: { action: A_PROMISE, targetType: "DormBill", targetId: { in: billIds } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { targetId: true, after: true },
  });
  for (const r of rows) {
    if (!r.targetId || out.has(r.targetId)) continue;
    const a = isRec(r.after) ? r.after : {};
    out.set(r.targetId, typeof a.promiseDate === "string" ? a.promiseDate : null);
  }
  return out;
}

async function notifyOnce(
  tenantId: string,
  unitId: string,
  b: DBill,
  messageKey: "reminder" | "dunning",
  dedupeKey: string,
  vars: Record<string, string>,
  at: Date,
): Promise<{ status: string; channel: string; duplicate: boolean; error: boolean }> {
  const { notifyCustomer } = await import("@/lib/platform/notify-customer");
  const r = await notifyCustomer({ tenantId }, { unitId, domain: "rooms", messageKey, partyId: b.partyId, vars, dedupeKey, at });
  return { status: r.status, channel: r.channel, duplicate: r.duplicate === true, error: r.error !== undefined };
}

/** audit แม่แบบมีคำต้องห้าม — วันละครั้งต่อหน่วย (ใต้ล็อก · ซ้อนกันได้ 1 แถว) · ไม่มีข้อความ/ชื่อ/เบอร์ */
async function noteTemplateBlocked(tenantId: string, unitId: string, messageKey: string, day: string): Promise<void> {
  await retryOnce(() =>
    tenantDb({ tenantId }).$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      await advisoryLock(tx, `${A_TPL_BLOCKED}:${unitId}:${day}`);
      const has = await tx.auditLog.findFirst({ where: { tenantId, unitId, action: A_TPL_BLOCKED, after: { path: ["day"], equals: day } }, select: { id: true } });
      if (has) return;
      await tx.auditLog.create({
        data: { tenantId, unitId, actorType: "SYSTEM", action: A_TPL_BLOCKED, targetType: "BusinessUnit", targetId: unitId, after: { unitId, day, messageKey } },
      });
    }, TX_OPTS),
  );
}

/** event ครั้งเดียวต่อบิล (ใต้ล็อกต่อบิล) — คืน true เมื่อเกิดใหม่ในรอบนี้ · payload ตรง 7 คีย์ (ไม่มีชื่อ/เบอร์) */
async function emitOverdue(tenantId: string, b: DBill, due: string, outstanding: number, daysLate: number): Promise<boolean> {
  const r = await retryOnce(() =>
    tenantDb({ tenantId }).$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      await advisoryLock(tx, evKey(b.id));
      const had = await tx.outboxEvent.findFirst({ where: { tenantId, idempotencyKey: evKey(b.id) }, select: { id: true } });
      if (had) return false;
      await emitOutbox(tx, {
        tenantId,
        type: EVENT,
        idempotencyKey: evKey(b.id),
        unitId: b.unitId,
        payload: { unitId: b.unitId, billId: b.id, leaseId: b.leaseId, periodKey: b.periodKey, dueDate: due, outstandingSatang: outstanding, daysLate },
      });
      return true;
    }, TX_OPTS),
  );
  return r === true;
}

// ───────────────────────── 5.4 งานตามเวลา ─────────────────────────
/** หน่วยที่ล้มในโพรเซสนี้ (ไปท้ายคิวรอบถัดไป) */
const failedAt = new Map<string, number>();

async function runUnit(
  tenantId: string,
  unit: { id: string; name: string },
  at: Date,
  left: () => number,
  out: DunningJobResult,
): Promise<boolean> {
  const today = bkkYmd(at);
  const cfg = await unitCfgOf(tenantId, unit.id);
  const maxBefore = cfg.before.length ? Math.max(...cfg.before) : 0;
  const maxAfter = cfg.after.length ? Math.max(...cfg.after) : 0;
  // หน้าต่างบิลที่ยังมีงานได้: ครบกำหนดภายใน maxBefore วันข้างหน้า · เลยมาไม่เกินขั้นทวงสุดท้าย (+31 วันให้ event ทัน)
  const from = addDaysYmd(today, -(Math.max(maxAfter, 30) + 1));
  const to = addDaysYmd(today, maxBefore);
  const db = tenantDb({ tenantId, unitId: unit.id });
  const all: DBill[] = await db.dormBill.findMany({
    where: { ...ELIGIBLE, dueDate: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) } },
    select: DBILL_SELECT,
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });
  if (!all.length) return true;
  // งานที่ต้องทำต่อบิล (ยังไม่แตะบัญชี)
  type Job = { b: DBill; due: string; daysLate: number; reminder: number | null; step: number | null };
  const jobs: Job[] = [];
  for (const b of all) {
    const due = ymdOfDate(b.dueDate);
    if (!due) continue;
    const daysLate = diffDaysYmd(today, due);
    const reminder = daysLate <= 0 ? (cfg.before.includes(-daysLate) ? -daysLate : null) : null;
    const reached = cfg.after.filter((k) => k <= daysLate);
    const step = daysLate >= 1 && reached.length ? reached[reached.length - 1] : null;
    if (reminder === null && step === null && daysLate < 1) continue;
    jobs.push({ b, due, daysLate, reminder, step });
  }
  if (!jobs.length) return true;
  // คีย์ที่จบแล้ว/กำลังส่ง + event ที่มีแล้ว — คิวรีเดียวต่อชนิด
  const keys = jobs.flatMap((j) => [...(j.reminder !== null ? [dkReminder(j.b.id, j.reminder)] : []), ...(j.step !== null ? [dkDunning(j.b.id, j.step)] : [])]);
  const sml = keys.length ? await db.serviceMessageLog.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true, status: true } }) : [];
  const smlOf = new Map(sml.map((r) => [r.dedupeKey, r.status]));
  const evs = await tenantDb({ tenantId }).outboxEvent.findMany({ where: { idempotencyKey: { in: jobs.filter((j) => j.daysLate >= 1).map((j) => evKey(j.b.id)) } }, select: { idempotencyKey: true } });
  const evDone = new Set(evs.map((e) => e.idempotencyKey));
  const quietNow = cfg.quiet ? inQuietWindow(at, cfg.quiet.start, cfg.quiet.end) : false;
  const keyOpen = (k: string): boolean => {
    const s = smlOf.get(k);
    if (s === undefined) return true;
    if (FINAL.has(s) || s === "SENDING") return false;
    if (s === "SKIPPED_QUIET" && quietNow) return false; // ไม่อ้างสิทธิ์ซ้ำก่อนพ้นเวลาเงียบ
    return true;
  };
  const open = jobs
    .map((j) => ({ ...j, reminder: j.reminder !== null && keyOpen(dkReminder(j.b.id, j.reminder)) ? j.reminder : null, step: j.step !== null && keyOpen(dkDunning(j.b.id, j.step)) ? j.step : null, event: j.daysLate >= 1 && !evDone.has(evKey(j.b.id)) }))
    .filter((j) => j.reminder !== null || j.step !== null || j.event);
  if (!open.length) return true;
  // L2 ▸ ยอดค้างของทุกบิลที่มีงานในคิวรีชุดเดียว — ตัดบิลจ่ายครบออกก่อนจำกัดจำนวน · หมุนจุดเริ่มทุกหน้าต่าง 5 นาที (หน่วยใหญ่ไม่ค้างหัวคิว)
  const owed = await outstandingMany(tenantId, open.map((j) => j.b));
  const due = open.filter((j) => (owed.get(j.b.id) ?? 0) > 0);
  if (!due.length) return true;
  const rot = due.length > MAX_BILLS_PER_UNIT ? Math.floor(at.getTime() / 300_000) % due.length : 0;
  const work = [...due.slice(rot), ...due.slice(0, rot)].slice(0, MAX_BILLS_PER_UNIT);
  const leaseIds = [...new Set(work.map((j) => j.b.leaseId))];
  const leases = await db.dormLease.findMany({ where: { id: { in: leaseIds } }, select: { id: true, status: true } });
  const leaseStatus = new Map(leases.map((l) => [l.id, l.status]));
  const promises = await promisesOf(tenantId, work.map((j) => j.b.id));
  const cx = await contextOf(tenantId, unit.id, work.map((j) => j.b));
  let ok = true;
  const blocked = new Set<string>();
  for (const j of work) {
    if (left() < 2_000) break;
    const outstanding = owed.get(j.b.id) ?? 0;
    if (outstanding <= 0) continue; // จ่ายครบแล้ว ⇒ หยุดเตือน/ทวง (มติ 10)
    if (j.event && (await emitOverdue(tenantId, j.b, j.due, outstanding, j.daysLate))) out.overdueEvents++;
    const active = DUN_LEASE.includes(leaseStatus.get(j.b.leaseId) ?? "");
    if (!active) continue; // สัญญาจบ/ยกเลิก ⇒ ไม่เตือน/ทวงอัตโนมัติ (ทวงมือได้)
    const vars = varsOf(j.b, { roomNo: cx.room.get(j.b.roomId) ?? "", tenantName: cx.party.get(j.b.partyId) ?? "", unitName: unit.name }, outstanding, today);
    const sends: { kind: "reminder" | "dunning"; key: string }[] = [];
    if (j.reminder !== null) sends.push({ kind: "reminder", key: dkReminder(j.b.id, j.reminder) });
    if (j.step !== null) {
      const p = promises.get(j.b.id) ?? null;
      if (!(p && today <= p)) sends.push({ kind: "dunning", key: dkDunning(j.b.id, j.step) }); // ไม่ทวงระหว่างนัดจ่าย
    }
    for (const s of sends) {
      if (blocked.has(s.kind)) continue;
      const tb = templateBlocked(`rooms.msg.${s.kind}`, cfg.tpl[s.kind], vars);
      if (tb === "TEMPLATE") {
        blocked.add(s.kind);
        ok = false;
        await noteTemplateBlocked(tenantId, unit.id, s.kind, today);
        continue;
      }
      if (tb === "CONTENT") continue; // ข้อความของบิลนี้เท่านั้น (เช่น ชื่อผู้เช่ามีคำต้องห้าม) — ห้องอื่นส่งต่อ
      const r = await notifyOnce(tenantId, unit.id, j.b, s.kind, s.key, vars, at);
      if (!r.duplicate && !r.error) {
        if (s.kind === "reminder") out.reminders++;
        else out.dunning++;
      }
    }
  }
  return ok;
}

export async function runDormDunningJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }): Promise<DunningJobResult> {
  const t0 = Date.now();
  const out: DunningJobResult = { reminders: 0, dunning: 0, overdueEvents: 0, waiversApplied: 0, failedUnits: 0 };
  const budget = typeof opts?.budgetMs === "number" && opts.budgetMs > 0 ? opts.budgetMs : 120_000;
  const signal = opts?.signal;
  const left = () => (signal?.aborted ? 0 : budget - (Date.now() - t0));
  const tid = isStr(opts?.tenantId) ? opts.tenantId : null;
  const at = nowOf(now);
  try {
    // (1) ผลอนุมัติยกเว้นค่าปรับที่ค้าง (ทางสำรองเมื่อ outbox ล้ม)
    out.waiversApplied += await sweepLateFeeApprovals(tid, left);
    // (1b) L1 ▸ ค่าปรับที่ยกเว้นแล้วแต่ค้างในบิลที่ส่งออกไปก่อนบันทึกการยกเว้น ⇒ ใบลดหนี้ (ทางสำรอง)
    await sweepWaivedCredits(tid, at, left);
    // (2)(3) ต่อหน่วย: event → เตือน/ทวง — หมุนลำดับทุกหน้าต่าง 5 นาที · หน่วยที่ล้มในโพรเซสนี้ไปท้าย
    const raw = tenantDb({ tenantId: tid ?? "platform-global-read" });
    const units = tid
      ? await raw.$queryRaw<{ id: string; tenantId: string; name: string }[]>`
          SELECT "id", "tenantId", "name" FROM "BusinessUnit" WHERE "type"::text = 'DORM' AND "status"::text = 'ACTIVE' AND "tenantId" = ${tid} ORDER BY "createdAt" ASC, "id" ASC`
      : await raw.$queryRaw<{ id: string; tenantId: string; name: string }[]>`
          SELECT "id", "tenantId", "name" FROM "BusinessUnit" WHERE "type"::text = 'DORM' AND "status"::text = 'ACTIVE' ORDER BY "createdAt" ASC, "id" ASC`;
    const off = units.length ? Math.floor(at.getTime() / 300_000) % units.length : 0;
    const order = [...units.slice(off), ...units.slice(0, off)].sort((a, b) => (failedAt.get(a.id) ?? 0) - (failedAt.get(b.id) ?? 0));
    for (const u of order) {
      if (left() < 3_000) break;
      try {
        const ok = await runUnit(u.tenantId, u, at, left, out);
        if (ok) failedAt.delete(u.id);
        else {
          out.failedUnits++;
          failedAt.set(u.id, Date.now());
        }
      } catch (e) {
        out.failedUnits++;
        failedAt.set(u.id, Date.now());
        await logLateFee("dunning.unit", u.tenantId, e);
      }
    }
  } catch (e) {
    await logLateFee("dunning.job", tid, e);
  }
  return out;
}

// ───────────────────────── 5.3 ทวงมือ ─────────────────────────
async function billOfUnit(a: DormActor, billId: unknown): Promise<DBill | null> {
  if (!isStr(billId)) return null;
  return tenantDb({ tenantId: a.tenantId, unitId: a.unitId }).dormBill.findFirst({ where: { id: billId, ...ELIGIBLE }, select: DBILL_SELECT });
}

export async function sendDunningNow(ctx: LateFeeCtx, input: { unitId: string; billId: string }, deps?: { now?: Date }): Promise<SendDunningResult | Fail> {
  try {
    const a = await dormActorOf(ctx, isRec(input) ? input.unitId : null);
    if (!a || !a.can("dorm.bill.send")) return NOT_FOUND();
    const at = nowOf(deps?.now);
    const today = bkkYmd(at);
    const anyBill = isStr(input.billId) ? await tenantDb({ tenantId: a.tenantId, unitId: a.unitId }).dormBill.findFirst({ where: { id: input.billId }, select: { id: true } }) : null;
    if (!anyBill) return NOT_FOUND();
    const b = await billOfUnit(a, input.billId);
    const due = b ? ymdOfDate(b.dueDate) : null;
    if (!b || !due || diffDaysYmd(today, due) < 1) return NOT_OVERDUE();
    const outstanding = await billOutstandingSatang(a.tenantId, b);
    if (outstanding <= 0) return NOT_OVERDUE();
    const cfg = await unitCfgOf(a.tenantId, a.unitId);
    const cx = await contextOf(a.tenantId, a.unitId, [b]);
    const vars = varsOf(b, { roomNo: cx.room.get(b.roomId) ?? "", tenantName: cx.party.get(b.partyId) ?? "", unitName: a.unitName }, outstanding, today);
    const tb = templateBlocked("rooms.msg.dunning", cfg.tpl.dunning, vars);
    if (tb === "TEMPLATE") return fail("TEMPLATE_BLOCKED", "ข้อความติดตามยอดค้างของหอนี้มีถ้อยคำต้องห้ามตามประกาศ สคบ. — แก้แม่แบบในค่าตั้งก่อนส่ง");
    if (tb === "CONTENT") return fail("CONTENT_BLOCKED", "ข้อความของบิลนี้มีถ้อยคำต้องห้ามจากข้อมูลผู้เช่า (เช่น ชื่อ) — ตรวจข้อมูลผู้เช่าก่อนส่ง");
    const r = await notifyOnce(a.tenantId, a.unitId, b, "dunning", dkDunning(b.id, `m${today.replace(/-/g, "")}`), vars, at);
    const status = (["SENT", "SKIPPED_CONSENT", "SKIPPED_QUIET", "NO_CHANNEL", "FAILED", "SENDING"].includes(r.status) ? r.status : "FAILED") as SendDunningResult["status"];
    const channel = (r.channel === "LINE" || r.channel === "SMS" ? r.channel : "NONE") as SendDunningResult["channel"];
    return { ok: true, status, channel, duplicate: r.duplicate };
  } catch (e) {
    await logLateFee("dunning.manual", isRec(ctx) ? ctx.tenantId : null, e);
    return INTERNAL();
  }
}

// ───────────────────────── 6. นัดจ่าย ─────────────────────────
const isRealYmd = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDaysYmd(s, 0) === s;

export async function setPaymentPromise(
  ctx: LateFeeCtx,
  input: { unitId: string; billId: string; promiseDate: string | null; note?: string | null },
  deps?: { now?: Date },
): Promise<{ ok: true; promiseDate: string | null } | Fail> {
  try {
    const a = await dormActorOf(ctx, isRec(input) ? input.unitId : null);
    if (!a || !a.can("dorm.bill.send")) return NOT_FOUND();
    const anyBill = isStr(input.billId) ? await tenantDb({ tenantId: a.tenantId, unitId: a.unitId }).dormBill.findFirst({ where: { id: input.billId }, select: { id: true } }) : null;
    if (!anyBill) return NOT_FOUND();
    const b = await billOfUnit(a, input.billId);
    if (!b || (await billOutstandingSatang(a.tenantId, b)) <= 0) return NOT_OVERDUE();
    const today = bkkYmd(nowOf(deps?.now));
    const [s] = await resolveSettingsMany({ tenantId: a.tenantId }, ["rooms.notify.promiseMaxDays"], [{ unitId: a.unitId }]);
    const maxV = s?.["rooms.notify.promiseMaxDays"]?.value;
    const max = typeof maxV === "number" && Number.isInteger(maxV) && maxV >= 1 ? maxV : 30;
    const p = input.promiseDate;
    if (p !== null) {
      if (typeof p !== "string" || !isRealYmd(p) || p < today || p > addDaysYmd(today, max)) {
        return fail("INVALID_INPUT", `วันนัดจ่ายต้องเป็นวันที่ (ปี-เดือน-วัน) ตั้งแต่วันนี้ถึงอีก ${max} วัน`);
      }
    }
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 200) : null;
    await tenantDb({ tenantId: a.tenantId }).auditLog.create({
      data: { tenantId: a.tenantId, unitId: a.unitId, actorType: "USER", actorId: a.actorUserId, action: A_PROMISE, targetType: "DormBill", targetId: b.id, after: { billId: b.id, promiseDate: p, note } },
    });
    return { ok: true, promiseDate: p };
  } catch (e) {
    await logLateFee("dunning.promise", isRec(ctx) ? ctx.tenantId : null, e);
    return INTERNAL();
  }
}

// ───────────────────────── 7. จอค้างชำระ ─────────────────────────
export async function overdueModel(ctx: LateFeeCtx, input: { unitId: string }, deps?: { now?: Date }): Promise<OverdueModel | null> {
  try {
    const a = await dormActorOf(ctx, isRec(input) ? input.unitId : null);
    if (!a || !a.can("dorm.view") || !a.money) return null;
    const asOf = bkkYmd(nowOf(deps?.now));
    const db = tenantDb({ tenantId: a.tenantId, unitId: a.unitId });
    const bills: DBill[] = await db.dormBill.findMany({
      where: { ...ELIGIBLE, status: { not: "PAID" }, dueDate: { lt: new Date(`${asOf}T00:00:00.000Z`) } },
      select: DBILL_SELECT,
      orderBy: [{ dueDate: "desc" }],
      take: MODEL_MAX_BILLS,
    });
    const over: { b: DBill; due: string; daysLate: number; outstanding: number }[] = [];
    const owed = await outstandingMany(a.tenantId, bills);
    for (const b of bills) {
      const due = ymdOfDate(b.dueDate);
      if (!due) continue;
      const daysLate = diffDaysYmd(asOf, due);
      if (daysLate < 1) continue;
      const outstanding = owed.get(b.id) ?? 0;
      if (outstanding > 0) over.push({ b, due, daysLate, outstanding });
    }
    const leaseIds = [...new Set(over.filter((o) => !!o.b.accountDocumentId).map((o) => o.b.leaseId))];
    const leases = leaseIds.length ? await db.dormLease.findMany({ where: { id: { in: leaseIds } }, select: { id: true, rentSatang: true, policySnapshot: true } }) : [];
    const items = new Map<string, { dueSatang: number; chargedSatang: number; waiver: WaiverStatus; principal: number }>();
    for (const list of (await ledgerItemsOf(a.tenantId, a.unitId, leases, asOf)).values()) {
      for (const it of list) items.set(it.sourceBillId, { dueSatang: it.dueSatang, chargedSatang: it.chargedSatang, waiver: it.waiver.status, principal: it.principalOutstandingSatang });
    }
    const ids = over.map((o) => o.b.id);
    const sml = ids.length
      ? await db.serviceMessageLog.findMany({ where: { OR: ids.map((id) => ({ dedupeKey: { startsWith: `${dkDunning(id, "")}` } })) }, select: { dedupeKey: true, status: true, at: true } })
      : [];
    const promises = await promisesOf(a.tenantId, ids);
    const cx = await contextOf(a.tenantId, a.unitId, over.map((o) => o.b));
    const rows: OverdueRow[] = over.map((o) => {
      const mine = sml.filter((r) => r.dedupeKey.startsWith(dkDunning(o.b.id, "")) && r.status !== "SENDING");
      const last = mine.reduce<Date | null>((m, r) => (!m || r.at > m ? r.at : m), null);
      const it = items.get(o.b.id);
      const p = promises.get(o.b.id) ?? null;
      return {
        billId: o.b.id,
        leaseId: o.b.leaseId,
        roomNumber: cx.room.get(o.b.roomId) ?? "",
        tenantName: cx.party.get(o.b.partyId) ?? "",
        periodKey: o.b.periodKey,
        dueDate: o.due,
        daysLate: o.daysLate,
        outstandingSatang: o.outstanding,
        principalOutstandingSatang: it ? Math.min(it.principal, o.outstanding) : o.outstanding,
        hasDoc: !!o.b.accountDocumentId,
        lateFee: it ? { dueSatang: it.dueSatang, chargedSatang: it.chargedSatang, waiver: it.waiver } : { dueSatang: 0, chargedSatang: 0, waiver: "NONE" },
        dunning: { count: mine.length, delivered: mine.filter((r) => r.status === "SENT").length, lastAt: last ? last.toISOString() : null },
        promiseDate: p && p >= asOf ? p : null,
      };
    });
    rows.sort((x, y) => numCmp(x.roomNumber, y.roomNumber) || (x.periodKey < y.periodKey ? -1 : x.periodKey > y.periodKey ? 1 : 0));
    const [s] = await resolveSettingsMany({ tenantId: a.tenantId }, ["rooms.lateFee.waiverApproval"], [{ unitId: a.unitId }]);
    const mode = s?.["rooms.lateFee.waiverApproval"]?.value;
    const canWaive = a.isOwner || (mode === "MANAGER_DIRECT" && a.can("dorm.latefee.waive"));
    const canAsk = a.can("dorm.latefee.waive") || a.can("dorm.bill.run") || a.can("dorm.bill.send");
    return {
      unitId: a.unitId,
      unitName: a.unitName,
      asOf,
      kpi: {
        count: rows.length,
        outstandingSatang: rows.reduce((x, r) => x + r.outstandingSatang, 0),
        lateFeeDueSatang: rows.reduce((x, r) => x + r.lateFee.dueSatang, 0),
        promised: rows.filter((r) => r.promiseDate !== null).length,
      },
      rows,
      can: {
        dun: a.can("dorm.bill.send"),
        waive: canWaive,
        requestWaive: !canWaive && mode !== "OWNER_ONLY" && canAsk,
        promise: a.can("dorm.bill.send"),
        notice: a.can("dorm.lease.manage"),
      },
    };
  } catch (e) {
    await logLateFee("dunning.model", isRec(ctx) ? ctx.tenantId : null, e);
    return null;
  }
}

// ───────────────────────── 8. หนังสือบอกเลิกสัญญา (พิมพ์เท่านั้น) ─────────────────────────
export async function terminationNotice(ctx: LateFeeCtx, input: { unitId: string; leaseId: string }, deps?: { now?: Date }): Promise<TerminationNotice | Fail> {
  try {
    const a = await dormActorOf(ctx, isRec(input) ? input.unitId : null);
    if (!a || !a.can("dorm.lease.manage") || !a.money || !isStr(input.leaseId)) return NOT_FOUND();
    const db = tenantDb({ tenantId: a.tenantId, unitId: a.unitId });
    const lease = await db.dormLease.findFirst({ where: { id: input.leaseId }, select: { id: true, roomId: true, partyId: true } });
    if (!lease) return NOT_FOUND();
    const noticeDate = bkkYmd(nowOf(deps?.now));
    const bills: DBill[] = await db.dormBill.findMany({
      where: { ...ELIGIBLE, leaseId: lease.id, dueDate: { lt: new Date(`${noticeDate}T00:00:00.000Z`) } },
      select: DBILL_SELECT,
      orderBy: [{ periodKey: "asc" }],
    });
    const overdue: TerminationNotice["overdue"] = [];
    const owed = await outstandingMany(a.tenantId, bills);
    for (const b of bills) {
      const out = owed.get(b.id) ?? 0;
      if (out > 0) overdue.push({ billId: b.id, periodKey: b.periodKey, outstandingSatang: out });
    }
    if (!overdue.length) return NOT_OVERDUE();
    const [s] = await resolveSettingsMany({ tenantId: a.tenantId }, ["rooms.lease.terminationNoticeDays", "rooms.msg.terminationNotice"], [{ unitId: a.unitId }]);
    const daysV = s?.["rooms.lease.terminationNoticeDays"]?.value;
    const days = typeof daysV === "number" && Number.isInteger(daysV) && daysV >= 15 ? daysV : 30;
    const effectiveDate = addDaysYmd(noticeDate, days);
    const total = overdue.reduce((x, o) => x + o.outstandingSatang, 0);
    const room = await db.hotelRoom.findFirst({ where: { id: lease.roomId }, select: { number: true } });
    const party = await tenantDb({ tenantId: a.tenantId }).party.findFirst({ where: { id: lease.partyId }, select: { name: true } });
    const landlord = await tenantDb({ tenantId: a.tenantId }).tenant.findFirst({ where: { id: a.tenantId }, select: { name: true } });
    const vars: Record<string, string> = {
      tenantName: party?.name ?? "",
      roomNo: room?.number ?? "",
      unitName: a.unitName,
      landlordName: landlord?.name ?? a.unitName,
      overdueAmount: bahtOf(total),
      overduePeriods: overdue.map((o) => thMonthOf(o.periodKey)).join(", "),
      noticeDate: thDateOf(noticeDate),
      effectiveDate: thDateOf(effectiveDate),
    };
    const key = "rooms.msg.terminationNotice";
    const def = getDef(key);
    const value = s?.[key]?.value;
    if (!def || templateBlocked(key, value, vars)) return fail("LEGAL_BLOCK", "แม่แบบหนังสือบอกเลิกสัญญามีถ้อยคำต้องห้ามตามประกาศ สคบ. — แก้แม่แบบในค่าตั้งก่อนพิมพ์");
    const textTh = renderTemplate(def, value, vars, "th");
    // L8 ▸ audit วันละ 1 แถวต่อสัญญา (เปิดหน้าพิมพ์ซ้ำวันเดียวกันไม่เพิ่มแถว)
    await retryOnce(() =>
      tenantDb({ tenantId: a.tenantId }).$transaction(async (txRaw) => {
        const tx = txRaw as unknown as Tx;
        await advisoryLock(tx, `${A_NOTICE}:${lease.id}:${noticeDate}`);
        const has = await tx.auditLog.findFirst({ where: { tenantId: a.tenantId, action: A_NOTICE, targetType: "DormLease", targetId: lease.id, after: { path: ["noticeDate"], equals: noticeDate } }, select: { id: true } });
        if (has) return;
        await tx.auditLog.create({
          data: {
            tenantId: a.tenantId,
            unitId: a.unitId,
            actorType: "USER",
            actorId: a.actorUserId,
            action: A_NOTICE,
            targetType: "DormLease",
            targetId: lease.id,
            after: { unitId: a.unitId, leaseId: lease.id, billIds: overdue.map((o) => o.billId), noticeDate, effectiveDate },
          },
        });
      }, TX_OPTS),
    );
    return { ok: true, textTh, noticeDate, effectiveDate, overdue, totalOutstandingSatang: total };
  } catch (e) {
    await logLateFee("dunning.notice", isRec(ctx) ? ctx.tenantId : null, e);
    return INTERNAL();
  }
}
// ◂ SVC D.11
