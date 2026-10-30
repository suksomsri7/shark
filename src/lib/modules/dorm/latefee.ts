// SVC D.11 ▸ ค่าปรับจ่ายช้าอัตโนมัติของหอ (สูตร · เพดาน 2 ชั้น · สมุดค่าปรับ) + ยกเว้นค่าปรับ/ผลอนุมัติ — สัญญา ledger/svc-briefs/svc-brief-d.11.md §2–§4
//   • สูตรเรียก lateFee ของ D.1 · ฐาน = เงินต้นค้างจากบัญชี (สมุดใบแจ้งหนี้ · ใบลดหนี้ · รับชำระ อ่านเป็นชุด · รับชำระตัดเงินต้นก่อนค่าปรับ) — ไม่ทบต้น (ป.พ.พ. ม.655)
//   • กติกาค่าปรับอ่านจาก lease.policySnapshot (CC §1.6) · เพดาน E = min(capPerBill ของสัญญา, เพดานกฎหมาย evaluateLegal LATE_FEE_CAP)
//     ทั้งคู่ว่าง ⇒ เพดานกันพิมพ์ผิดจากค่าตั้ง rooms.lateFee.guardRentBp (ค่าปัจจุบันของหน่วย · ว่าง = ไม่จำกัด)
//   • ค่าปรับลงบิลปลายทาง (DRAFT/HELD ของงวดถัดไป) เป็นรายการ meta.auto ของบรรทัด LATE_FEE — ลงแล้วไม่ย้อนแก้ · ส่วนเพิ่มลงรอบถัดไป
//   • ยกเว้น = AuditLog dorm.latefee.waived (ไม่มี migration · มติ 1) · บิลปลายทางที่ส่งแล้ว ⇒ ใบลดหนี้ทางเดียวกับ adjustSentBill (ทีละใบ · ref idempotent)
//   • ขอบเขต: tenantDb เท่านั้น (F5.1) · หน่วย DORM ของร้าน + Membership สด ทุกครั้ง · ไม่ผ่าน ⇒ NOT_FOUND / null · ไม่ throw
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveSettingsMany } from "@/lib/core/settings";
import { evaluateLegal, isValidOutOfScopeReason, resolveLegalParams } from "@/lib/core/settings/legal/th-rental-2568";
import { lastDecisionOf, listPoliciesForEntities, requestStatuses, resolvePolicy, submitForApproval } from "@/lib/modules/approval";
import { dormAccess } from "./access";
import { lateFee } from "./calc";

// ───────────────────────── ชนิด (สัญญา §3 §4) ─────────────────────────
export type LateFeeCtx = { tenantId: string; actorUserId: string };
type Money = number;
type Fail = { ok: false; code: string; reason: string };
export type WaiverStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "APPLIED";
export type LateFeeKind = "NONE" | "PER_DAY" | "ONCE" | "PERCENT";
export type LateFeeLedgerItem = {
  sourceBillId: string;
  periodKey: string;
  dueDate: string;
  paidDate: string | null;
  asOf: string;
  principalSatang: Money;
  principalOutstandingSatang: Money;
  daysLate: number;
  chargeableDays: number;
  accruedSatang: Money;
  capSatang: Money | null;
  dueSatang: Money;
  chargedSatang: Money;
  charges: { billId: string; periodKey: string; status: string; amountSatang: Money }[];
  waiver: { status: WaiverStatus; requestId: string | null };
  policy: { kind: LateFeeKind; amountSatang: number; percentBp: number | null; capPerBillSatang: number | null; graceDays: number };
};
export type LateFeeLedger = { unitId: string; leaseId: string; asOf: string; items: LateFeeLedgerItem[]; totalDueSatang: Money; totalChargedSatang: Money };
/** รายการค่าปรับอัตโนมัติในบรรทัด LATE_FEE ของบิลปลายทาง (meta.auto = JSON ของอาร์เรย์นี้) */
export type AutoLateFeeEntry = { sourceBillId: string; periodKey: string; daysLate: number; chargeableDays: number; amountSatang: number; asOf: string; capped: 0 | 1 };
export type AutoLateFeePlan = Map<string, { entries: AutoLateFeeEntry[]; capSatang: number | null; sig: string }>;
export type WaiveResult = { ok: true; status: "WAIVED" | "PENDING_APPROVAL"; created: boolean; requestId: string | null; creditNotes: { billId: string; docId: string; amountSatang: Money }[] };
export type ApplyWaiverResult = { status: "APPLIED" | "ALREADY" | "SKIPPED" | "INVALID"; reason?: string };

const ENTITY = "dorm.latefee.waive";
const A_WAIVED = "dorm.latefee.waived";
const A_REQUESTED = "dorm.latefee.waive.requested";
/** คำขอที่ปิดแล้ว (ปฏิเสธ/ยกเลิก/ใช้ไม่ได้) — งานตามเวลาไม่กวาดซ้ำ */
const A_CLOSED = "dorm.latefee.waive.closed";
const SENTISH = ["SENT", "PARTIALLY_PAID", "PAID"];
const DEAD_DOC = ["VOIDED", "CANCELLED", "DRAFT"];
const TX_OPTS = { maxWait: 30_000, timeout: 60_000 } as const;
const LF_KEYS = [
  "rooms.lateFee.kind",
  "rooms.lateFee.amount",
  "rooms.lateFee.percentBp",
  "rooms.lateFee.capPerBill",
  "rooms.lateFee.graceDays",
  "rooms.lateFee.autoCharge",
  "rooms.lateFee.guardRentBp",
];

const fail = (code: string, reason: string): Fail => ({ ok: false, code, reason });
const NOT_FOUND = (): Fail => fail("NOT_FOUND", "ไม่พบหอพัก บิล หรือสัญญานี้");
const INTERNAL = (): Fail => fail("INTERNAL", "ระบบขัดข้องชั่วคราว — ลองใหม่อีกครั้ง");
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNat = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const pad2 = (n: number) => String(n).padStart(2, "0");

// ───────────────────────── วันที่ (สตริง YYYY-MM-DD · ไม่ผ่าน getDay/getDate ดิบ) ─────────────────────────
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const utcOf = (ymd: string): number => {
  const m = YMD_RE.exec(ymd);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
};
/** วันที่ในคอลัมน์ @db.Date ⇒ "YYYY-MM-DD" */
export const ymdOfDate = (d: Date | null | undefined): string | null => (d instanceof Date ? d.toISOString().slice(0, 10) : null);
export const addDaysYmd = (ymd: string, n: number): string => new Date(utcOf(ymd) + n * 86_400_000).toISOString().slice(0, 10);
export const diffDaysYmd = (a: string, b: string): number => Math.round((utcOf(a) - utcOf(b)) / 86_400_000);
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-10" ⇒ "ต.ค. 2569" */
export function thMonthOf(periodKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  return m ? `${TH_MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : periodKey;
}
/** "2026-11-05" ⇒ "5 พ.ย. 2569" */
export function thDateOf(ymd: string): string {
  const m = YMD_RE.exec(ymd);
  return m ? `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : ymd;
}
/** สตางค์ ⇒ "฿5,486.00" */
export function bahtOf(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  return `${satang < 0 ? "-" : ""}฿${Math.trunc(a / 100).toLocaleString("en-US")}.${pad2(a % 100)}`;
}

// ───────────────────────── ทั่วไป ─────────────────────────
type Tx = Prisma.TransactionClient;
export const lateFeeLockKey = (leaseId: string) => `dorm.latefee:${leaseId}`;
async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
function isDeadlock(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (o.code === "40P01" || o.originalCode === "40P01" || o.code === "P2034") return true;
    if (typeof o.message === "string" && /deadlock|40P01|write conflict/i.test(o.message)) return true;
    cur = o.cause ?? (isRec(o.meta) ? o.meta.driverAdapterError : undefined);
  }
  return false;
}
/** 40P01 ⇒ ลองใหม่ 1 ครั้ง · ยังชน ⇒ "BUSY" (ไม่ throw) */
export async function retryOnce<T>(fn: () => Promise<T>): Promise<T | "BUSY"> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isDeadlock(e) || attempt === 1) {
        if (isDeadlock(e)) return "BUSY";
        throw e;
      }
    }
  }
  return "BUSY";
}
export async function logLateFee(where: string, tenantId: unknown, e: unknown): Promise<void> {
  try {
    await logOps("ERROR", `dorm.${where}`, "บริการค่าปรับ/ทวงหอขัดข้อง", {
      tenantId: typeof tenantId === "string" ? tenantId : undefined,
      detail: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 500) : String(e).slice(0, 500),
    });
  } catch {
    /* log ล้มไม่ทำให้ผู้ใช้ล้มซ้ำ */
  }
}

// ───────────────────────── ด่าน (หน่วย DORM ของร้าน → Membership สด → สิทธิ์) ─────────────────────────
export type DormActor = {
  tenantId: string;
  unitId: string;
  unitName: string;
  actorUserId: string;
  isOwner: boolean;
  can: (action: string) => boolean;
  money: boolean;
};
/** ด่านกลางของ D.11 — อ่านสดทุกครั้ง (ไม่แคชสิทธิ์) · หน่วยไม่ใช่ DORM/ไม่ ACTIVE/ไม่ใช่ร้านนี้/สมาชิกยังไม่ตอบรับ ⇒ null */
export async function dormActorOf(ctx: unknown, unitId: unknown): Promise<DormActor | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId)) return null;
  const tenantId = ctx.tenantId;
  const actorUserId = ctx.actorUserId;
  const tdb = tenantDb({ tenantId });
  const unit = await tdb.businessUnit.findFirst({ where: { id: unitId, type: "DORM", status: "ACTIVE" }, select: { id: true, name: true } });
  if (!unit) return null;
  const mem = await tdb.membership.findFirst({ where: { tenantId, userId: actorUserId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mem) return null;
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  return {
    tenantId,
    unitId: unit.id,
    unitName: unit.name,
    actorUserId,
    isOwner: mem.role === "OWNER",
    can: (action: string) => evaluate(m, { module: "dorm", action, unitId: unit.id }),
    money: dormAccess(m, unit.id).money,
  };
}

// ───────────────────────── บิล · รายการอัตโนมัติ ─────────────────────────
export type LfBill = {
  id: string;
  leaseId: string;
  periodKey: string;
  status: string;
  dueDate: Date | null;
  accountDocumentId: string | null;
  totalSatang: number;
  paidSatang: number;
  lines: Prisma.JsonValue;
};
export const LF_BILL_SELECT = {
  id: true,
  leaseId: true,
  periodKey: true,
  status: true,
  dueDate: true,
  accountDocumentId: true,
  totalSatang: true,
  paidSatang: true,
  lines: true,
} as const;
const isSource = (b: { status: string; accountDocumentId: string | null }) => !!b.accountDocumentId && SENTISH.includes(b.status);

function lateLineOf(lines: unknown): Record<string, unknown> | null {
  if (!Array.isArray(lines)) return null;
  const l = lines.find((x) => isRec(x) && x.code === "LATE_FEE");
  return isRec(l) ? l : null;
}
/** รายการอัตโนมัติของบิล (meta.auto ของบรรทัด LATE_FEE) — อ่านไม่ได้ = [] */
export function autoEntriesOf(lines: unknown): AutoLateFeeEntry[] {
  const l = lateLineOf(lines);
  const meta = l && isRec(l.meta) ? l.meta : null;
  if (!meta || typeof meta.auto !== "string") return [];
  let raw: unknown = null;
  try {
    raw = JSON.parse(meta.auto);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: AutoLateFeeEntry[] = [];
  for (const x of raw) {
    if (!isRec(x) || !isStr(x.sourceBillId) || typeof x.periodKey !== "string" || !isNat(x.amountSatang)) continue;
    out.push({
      sourceBillId: x.sourceBillId,
      periodKey: x.periodKey,
      daysLate: isNat(x.daysLate) ? x.daysLate : 0,
      chargeableDays: isNat(x.chargeableDays) ? x.chargeableDays : 0,
      amountSatang: x.amountSatang,
      asOf: typeof x.asOf === "string" ? x.asOf : "",
      capped: x.capped === 1 ? 1 : 0,
    });
  }
  return out;
}
/** ยอด LATE_FEE (gross) ของบิล */
function lateGrossOf(lines: unknown): number {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((s: number, x) => (isRec(x) && x.code === "LATE_FEE" && isNat(x.grossSatang) ? s + x.grossSatang : s), 0);
}
/** SVC D.11 (ง) ▸ "ต.ค. 2569 ช้า 4 วัน" ต่อรายการ — ใช้ใน getBill/หน้าพิมพ์ */
export function autoLateFeeDetail(auto: string): string | null {
  const es = autoEntriesOf([{ code: "LATE_FEE", meta: { auto } }]);
  return es.length ? es.map((e) => `${thMonthOf(e.periodKey)} ช้า ${e.daysLate} วัน`).join(" · ") : null;
}
/** ตัดรายการให้ Σ ≤ room (null = ไม่จำกัด) · ตัดท้ายก่อน · ตัดแล้ว capped = 1 */
export function trimAutoLateFees(entries: AutoLateFeeEntry[], room: number | null): AutoLateFeeEntry[] {
  if (room === null) return entries;
  let left = Math.max(0, room);
  const out: AutoLateFeeEntry[] = [];
  for (const e of entries) {
    const amt = Math.min(e.amountSatang, left);
    if (amt <= 0) continue;
    out.push(amt < e.amountSatang ? { ...e, amountSatang: amt, capped: 1 } : e);
    left -= amt;
  }
  return out;
}
/** เพดานกันพิมพ์ผิด = ค่าเช่าในสัญญา × guardRentBp / 10,000 (ว่าง/ผิดรูป = ไม่จำกัด) */
export function lateFeeGuardCap(rentSatang: number, guardBp: unknown): number | null {
  return isNat(guardBp) && isNat(rentSatang) ? Math.floor((rentSatang * guardBp) / 10_000) : null;
}

// ───────────────────────── นโยบายต่อสัญญา (snapshot ก่อน) ─────────────────────────
type Pol = LateFeeLedgerItem["policy"];
type LeaseIn = { id: string; rentSatang: number; policySnapshot: unknown };
type LeaseCfg = { pol: Pol; cap: number | null; autoCharge: boolean };

const snapOf = (v: unknown): Record<string, unknown> | null => (isRec(v) && isRec(v.values) ? v.values : null);
function leaseVal(snap: Record<string, unknown> | null, cur: Record<string, unknown>, key: string): unknown {
  return snap && Object.prototype.hasOwnProperty.call(snap, key) ? snap[key] : cur[key];
}
/** เพดานที่มีผล E (มติ 4): min(capPerBill ของสัญญา, เพดานกฎหมาย) · ทั้งคู่ว่าง ⇒ เพดานกันพิมพ์ผิดจากค่าตั้งของหน่วย */
function capOf(pol: Pol, rentSatang: number, guardBp: unknown, legalParams: Record<string, unknown> | null): number | null {
  const legalCap = resolveLegalParams(legalParams).lateFeeCapSatang;
  if (pol.capPerBillSatang !== null) {
    // ตัวตรวจกลาง: เพดานของสัญญาเกินเพดานกฎหมาย ⇒ ใช้เพดานกฎหมาย (ไม่ขึ้นกับโหมด — ค่าปรับอัตโนมัติต้องปลอดภัยเสมอ)
    const o = evaluateLegal("LATE_FEE_CAP", { feeSatang: pol.capPerBillSatang }, { mode: "STRICT", params: legalParams });
    return o.raw === "BLOCK" && isNat(legalCap) ? legalCap : pol.capPerBillSatang;
  }
  if (isNat(legalCap)) return legalCap;
  return lateFeeGuardCap(rentSatang, guardBp);
}
async function leaseCfgs(tenantId: string, unitId: string, leases: LeaseIn[], legalParams: Record<string, unknown> | null): Promise<Map<string, LeaseCfg>> {
  const out = new Map<string, LeaseCfg>();
  if (!leases.length) return out;
  const res = await resolveSettingsMany({ tenantId }, LF_KEYS, leases.map((l) => ({ unitId, leaseId: l.id })));
  leases.forEach((l, i) => {
    const cur: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(res[i] ?? {})) cur[k] = v.value;
    const snap = snapOf(l.policySnapshot);
    const kindRaw = leaseVal(snap, cur, "rooms.lateFee.kind");
    const kind: LateFeeKind = kindRaw === "NONE" || kindRaw === "ONCE" || kindRaw === "PERCENT" ? kindRaw : "PER_DAY";
    const amount = leaseVal(snap, cur, "rooms.lateFee.amount");
    const bp = leaseVal(snap, cur, "rooms.lateFee.percentBp");
    const capPer = leaseVal(snap, cur, "rooms.lateFee.capPerBill");
    const grace = leaseVal(snap, cur, "rooms.lateFee.graceDays");
    const pol: Pol = {
      kind,
      amountSatang: isNat(amount) ? amount : 0,
      percentBp: isNat(bp) ? bp : null,
      capPerBillSatang: isNat(capPer) ? capPer : null,
      graceDays: isNat(grace) ? grace : 0,
    };
    out.set(l.id, { pol, cap: capOf(pol, l.rentSatang, cur["rooms.lateFee.guardRentBp"], legalParams), autoCharge: cur["rooms.lateFee.autoCharge"] !== false });
  });
  return out;
}

// ───────────────────────── เงินต้นค้างจากบัญชี ─────────────────────────
type Fin = { base: number; pays: { ymd: string; amount: number }[] };
/** สมุดของใบแจ้งหนี้ (อ่านล้วน · รวมคิวรีต่อชุด — L3) */
export type DocFin = { grand: number; status: string; credit: number; lateCredit: number; tieOff: number; pays: { ymd: string; amount: number }[] };
/**
 * SVC D.11 (L3/L2/L11) ▸ สมุดของใบแจ้งหนี้หลายใบในคิวรีเดียวต่อชนิด (ใบ · ใบลดหนี้ · รับชำระ) — อ่านล้วน ผูกร้านทุกคำสั่ง
 *   ทำไมไม่เรียก docPaymentLedger/listDocPayments ต่อใบ: รอบบิลหอใหญ่ × หลายงวด = หลายพัน round-trip ต่อการเตรียม/ส่ง (รีวิว L3) ·
 *   facade บัญชียังไม่มีตัวอ่านแบบชุด (คำขอใน wo-notes) — นิยามเดียวกับ docPaymentLedger: คงค้าง = ยอดใบ − (รับ + WHT) − ใบลดหนี้ที่มีผล
 *   lateCredit = ส่วนของใบลดหนี้ที่เป็นบรรทัด LATE_FEE (จาก audit dorm.bill.adjusted ของหอ · ใบยกเว้นค่าปรับก็ผ่านทางนี้) — ไม่นับเป็นการลดเงินต้น (L11)
 */
export async function docFinMany(tenantId: string, docs: { docId: string; billId: string }[]): Promise<Map<string, DocFin>> {
  const out = new Map<string, DocFin>();
  const ids = [...new Set(docs.map((d) => d.docId))];
  if (!ids.length) return out;
  const raw = tenantDb({ tenantId });
  const head = await raw.$queryRaw<{ id: string; grandTotal: number; status: string }[]>`
    SELECT "id", "grandTotal", "status"::text AS "status" FROM "AccountDocument" WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::text[])`;
  const cns = await raw.$queryRaw<{ id: string; sourceDocId: string; grandTotal: number }[]>`
    SELECT "id", "sourceDocId", "grandTotal" FROM "AccountDocument"
    WHERE "tenantId" = ${tenantId} AND "sourceDocId" = ANY(${ids}::text[]) AND "docType"::text = 'CREDIT_NOTE' AND "status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT')`;
  const pays = await raw.$queryRaw<{ documentId: string; amount: number; whtAmountSatang: number; paidAt: Date }[]>`
    SELECT "documentId", "amount", "whtAmountSatang", "paidAt" FROM "AccountDocumentPayment"
    WHERE "tenantId" = ${tenantId} AND "documentId" = ANY(${ids}::text[]) AND "voidedAt" IS NULL`;
  const billIds = [...new Set(docs.map((d) => d.billId))];
  const adj = cns.length
    ? await raw.auditLog.findMany({ where: { action: "dorm.bill.adjusted", targetType: "DormBill", targetId: { in: billIds } }, select: { after: true } })
    : [];
  const lateOfCn = new Map<string, number>();
  for (const a of adj) {
    const x = isRec(a.after) ? a.after : {};
    if (x.kind === "CREDIT" && isStr(x.docId) && isNat(x.lateFeeSatang)) lateOfCn.set(x.docId, x.lateFeeSatang);
  }
  for (const h of head) {
    const mine = cns.filter((c) => c.sourceDocId === h.id);
    const ps = pays
      .filter((p) => p.documentId === h.id)
      .map((p) => ({ ymd: bkkYmd(p.paidAt), amount: Math.max(0, Number(p.amount)) + Math.max(0, Number(p.whtAmountSatang ?? 0)) }))
      .sort((a, b) => (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0));
    out.set(h.id, {
      grand: Number(h.grandTotal),
      status: h.status,
      credit: mine.reduce((x, c) => x + Number(c.grandTotal), 0),
      lateCredit: mine.reduce((x, c) => x + Math.min(Number(c.grandTotal), lateOfCn.get(c.id) ?? 0), 0),
      tieOff: ps.reduce((x, p) => x + p.amount, 0),
      pays: ps,
    });
  }
  return out;
}
/** ยอดเงินต้นของบิลต้นทาง = ใบแจ้งหนี้ − ค่าปรับในบิล − ใบลดหนี้ที่ไม่ใช่บรรทัดค่าปรับ (L11) · รับชำระตามวันไทยของ paidAt */
function finFrom(b: LfBill, f: DocFin | undefined): Fin | null {
  if (!f || DEAD_DOC.includes(f.status)) return null;
  const otherCredit = Math.max(0, f.credit - f.lateCredit);
  return { base: Math.max(0, f.grand - lateGrossOf(b.lines) - otherCredit), pays: f.pays };
}
const outstandingFrom = (f: DocFin | undefined): number => (!f || DEAD_DOC.includes(f.status) ? 0 : Math.max(0, f.grand - f.tieOff - f.credit));
/** ยอดค้างทั้งใบ (เงินต้น + ค่าปรับ) — มีใบ = จากบัญชี · ไม่มีใบ (ยกมา) = totalSatang − paidSatang (มติ 6) */
export async function billOutstandingSatang(tenantId: string, b: { id: string; accountDocumentId: string | null; totalSatang: number; paidSatang: number }): Promise<number> {
  return (await outstandingMany(tenantId, [b])).get(b.id) ?? 0;
}
/** ยอดค้างหลายบิลในคิวรีชุดเดียว (L2) */
export async function outstandingMany(tenantId: string, bills: { id: string; accountDocumentId: string | null; totalSatang: number; paidSatang: number }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const docs = bills.filter((b) => !!b.accountDocumentId).map((b) => ({ docId: b.accountDocumentId as string, billId: b.id }));
  const fin = await docFinMany(tenantId, docs);
  for (const b of bills) out.set(b.id, b.accountDocumentId ? outstandingFrom(fin.get(b.accountDocumentId)) : Math.max(0, b.totalSatang - b.paidSatang));
  return out;
}

type Eval = { dueDate: string; paidDate: string | null; daysLate: number; chargeableDays: number; accrued: number; base: number; outstanding: number };
function evalSource(b: LfBill, fin: Fin, pol: Pol, asOf: string): Eval | null {
  const due = ymdOfDate(b.dueDate);
  if (!due) return null;
  const paidUpTo = (d: string) => fin.pays.filter((p) => p.ymd <= d).reduce((s, p) => s + p.amount, 0);
  const principalAt = (d: string) => Math.max(0, fin.base - paidUpTo(d));
  let paidDate: string | null = null;
  if (fin.base <= 0) paidDate = due;
  else {
    let cum = 0;
    for (const p of fin.pays) {
      if (p.ymd > asOf) break;
      cum += p.amount;
      if (cum >= fin.base) {
        paidDate = p.ymd;
        break;
      }
    }
  }
  const end = paidDate ?? asOf;
  const daysLate = Math.max(0, diffDaysYmd(end, due));
  if (daysLate < 1) return null;
  let accrued = 0;
  let chargeable = Math.max(0, daysLate - pol.graceDays);
  try {
    const r = lateFee({
      policy: { kind: pol.kind, amountSatang: pol.amountSatang, percentBp: pol.percentBp ?? 0, capSatang: null, graceDays: pol.graceDays },
      dueDate: due,
      paidDate: end,
      overdueSatang: principalAt(addDaysYmd(due, pol.graceDays)),
    });
    accrued = r.feeSatang;
    chargeable = r.chargeableDays;
  } catch {
    accrued = 0; // นโยบายในสัญญาเพี้ยน ⇒ ไม่คิด (ปลอดภัยต่อผู้เช่า)
  }
  return { dueDate: due, paidDate, daysLate, chargeableDays: chargeable, accrued, base: fin.base, outstanding: principalAt(asOf) };
}

// ───────────────────────── สถานะของสัญญา (บิล · การยกเว้น · คำขอ) ─────────────────────────
type WaivedInfo = { approvalId: string | null; creditNotes: { billId: string; docId: string; amountSatang: number }[] };
function waivedInfoOf(after: unknown): WaivedInfo {
  const a = isRec(after) ? after : {};
  const notes = Array.isArray(a.creditNotes)
    ? a.creditNotes.filter((x): x is Record<string, unknown> => isRec(x) && isStr(x.billId) && isStr(x.docId) && isNat(x.amountSatang)).map((x) => ({ billId: String(x.billId), docId: String(x.docId), amountSatang: Number(x.amountSatang) }))
    : [];
  return { approvalId: isStr(a.approvalId) ? a.approvalId : null, creditNotes: notes };
}
async function waivedOf(tenantId: string, sourceIds: string[]): Promise<Map<string, WaivedInfo>> {
  const out = new Map<string, WaivedInfo>();
  if (!sourceIds.length) return out;
  const rows = await tenantDb({ tenantId }).auditLog.findMany({
    where: { action: A_WAIVED, targetType: "DormBill", targetId: { in: sourceIds } },
    orderBy: { createdAt: "asc" },
    select: { targetId: true, after: true },
  });
  for (const r of rows) if (r.targetId && !out.has(r.targetId)) out.set(r.targetId, waivedInfoOf(r.after));
  return out;
}
/** คำขอยกเว้นต่อบิลต้นทาง (จาก audit dorm.latefee.waive.requested → สถานะสดของสายอนุมัติ) */
async function requestsOf(tenantId: string, sourceIds: string[]): Promise<Map<string, { requestId: string; status: string; reason: string; unitId: string }>> {
  const out = new Map<string, { requestId: string; status: string; reason: string; unitId: string }>();
  if (!sourceIds.length) return out;
  const rows = await tenantDb({ tenantId }).auditLog.findMany({
    where: { action: A_REQUESTED, targetType: "DormBill", targetId: { in: sourceIds } },
    orderBy: { createdAt: "desc" },
    select: { targetId: true, after: true },
  });
  const pick = new Map<string, { requestId: string; reason: string; unitId: string }>();
  for (const r of rows) {
    const a = isRec(r.after) ? r.after : {};
    if (r.targetId && isStr(a.requestId) && !pick.has(r.targetId)) pick.set(r.targetId, { requestId: a.requestId, reason: typeof a.reason === "string" ? a.reason : "", unitId: typeof a.unitId === "string" ? a.unitId : "" });
  }
  if (!pick.size) return out;
  const st = await requestStatuses({ tenantId }, [...pick.values()].map((p) => p.requestId));
  for (const [src, p] of pick) out.set(src, { ...p, status: st[p.requestId] ?? "UNKNOWN" });
  return out;
}

type LeaseData = { cfg: Map<string, LeaseCfg>; bills: Map<string, LfBill[]>; waived: Map<string, WaivedInfo>; fin: Map<string, Fin | null> };
/** บิล · การยกเว้น · นโยบาย · สมุดเงิน (เฉพาะบิลต้นทางที่ต้องใช้ · คิวรีชุด) ของหลายสัญญา */
async function leaseData(
  tenantId: string,
  unitId: string,
  leases: LeaseIn[],
  legalParams: Record<string, unknown> | null,
  needFin: (b: LfBill) => boolean = () => true,
): Promise<LeaseData> {
  const ids = leases.map((l) => l.id);
  const rows: LfBill[] = ids.length
    ? await tenantDb({ tenantId, unitId }).dormBill.findMany({ where: { leaseId: { in: ids }, status: { not: "VOID" } }, select: LF_BILL_SELECT, orderBy: [{ periodKey: "asc" }] })
    : [];
  const bills = new Map<string, LfBill[]>();
  for (const b of rows) bills.set(b.leaseId, [...(bills.get(b.leaseId) ?? []), b]);
  const srcRows = rows.filter(isSource);
  const waived = await waivedOf(tenantId, srcRows.map((b) => b.id));
  const cfg = srcRows.length ? await leaseCfgs(tenantId, unitId, leases, legalParams) : new Map<string, LeaseCfg>();
  const want = srcRows.filter((b) => needFin(b));
  const docFin = await docFinMany(tenantId, want.map((b) => ({ docId: b.accountDocumentId as string, billId: b.id })));
  const fin = new Map<string, Fin | null>();
  for (const b of want) fin.set(b.id, finFrom(b, docFin.get(b.accountDocumentId as string)));
  return { cfg, bills, waived, fin };
}
/** ที่ลงบิลแล้ว (ไม่ VOID) ของบิลต้นทาง src — ไม่นับบิลงวด excludePeriod */
function chargesOf(bills: LfBill[], srcId: string, excludePeriod: string | null): { billId: string; periodKey: string; status: string; amountSatang: number }[] {
  const out: { billId: string; periodKey: string; status: string; amountSatang: number }[] = [];
  for (const b of bills) {
    if (b.status === "VOID" || (excludePeriod !== null && b.periodKey === excludePeriod)) continue;
    const amt = autoEntriesOf(b.lines).filter((e) => e.sourceBillId === srcId).reduce((s, e) => s + e.amountSatang, 0);
    if (amt > 0) out.push({ billId: b.id, periodKey: b.periodKey, status: b.status, amountSatang: amt });
  }
  return out;
}
/** ลายเซ็นฐานของค่าปรับอัตโนมัติต่อสัญญา (บิลต้นทาง · การยกเว้น · ที่ลงบิลอื่นแล้ว) — ใช้ตรวจซ้ำใต้ล็อก */
function sigOf(bills: { id: string; periodKey: string; status: string; accountDocumentId: string | null; lines: unknown }[], P: string, waived: Set<string>): string {
  const src = bills.filter((b) => b.periodKey < P && isSource(b)).map((b) => b.id).sort();
  if (!src.length) return "";
  const charged = src.map((id) => {
    let s = 0;
    for (const b of bills) if (b.status !== "VOID" && b.periodKey !== P) for (const e of autoEntriesOf(b.lines)) if (e.sourceBillId === id) s += e.amountSatang;
    return [id, s];
  });
  return JSON.stringify({ s: src, w: src.filter((id) => waived.has(id)), c: charged });
}

// ───────────────────────── 3. ค่าปรับอัตโนมัติในรอบบิล (ผู้เรียก = billing.ts จุด ก) ─────────────────────────
/**
 * แผนค่าปรับอัตโนมัติของบิลปลายทางงวด P (asOf = วันออกของรอบ) ต่อสัญญา — คิดจากบิลต้นทางงวดก่อน P ที่ออกใบแจ้งหนี้จริง (มติ 6) และยังไม่ยกเว้น
 *   รายการ = min(ค้างของบิลต้นทาง (≤ E) − ที่ลงบิลอื่นแล้ว, ที่ว่างของเพดานบิลปลายทาง E) · เรียงงวด · ปิดอัตโนมัติ ⇒ ไม่มีรายการ
 */
export async function planAutoLateFees(i: {
  tenantId: string;
  unitId: string;
  periodKey: string;
  asOf: string;
  leases: LeaseIn[];
  legalParams?: Record<string, unknown> | null;
}): Promise<AutoLateFeePlan> {
  const out: AutoLateFeePlan = new Map();
  if (!i.leases.length) return out;
  const lp = i.legalParams ?? null;
  // L3 ▸ อ่านสมุดเงินเฉพาะบิลต้นทางที่ยังลงค่าปรับเพิ่มได้ (เลยกำหนด ณ asOf · ไม่ยกเว้น · ที่ลงแล้วยังไม่ถึงเพดาน E)
  const d0 = await leaseData(i.tenantId, i.unitId, i.leases, lp, () => false);
  const full = (b: LfBill): boolean => {
    const cap = d0.cfg.get(b.leaseId)?.cap ?? null;
    const due = ymdOfDate(b.dueDate);
    if (!due || due >= i.asOf || d0.waived.has(b.id) || !(b.periodKey < i.periodKey)) return false;
    if (cap === null) return true;
    return chargesOf(d0.bills.get(b.leaseId) ?? [], b.id, i.periodKey).reduce((x, c) => x + c.amountSatang, 0) < cap;
  };
  const srcNeed = [...d0.bills.values()].flat().filter((b) => isSource(b) && full(b));
  const docFin = await docFinMany(i.tenantId, srcNeed.map((b) => ({ docId: b.accountDocumentId as string, billId: b.id })));
  const d: LeaseData = { ...d0, fin: new Map(srcNeed.map((b) => [b.id, finFrom(b, docFin.get(b.accountDocumentId as string))])) };
  for (const l of i.leases) {
    const bills = d.bills.get(l.id) ?? [];
    const sig = sigOf(bills, i.periodKey, new Set(d.waived.keys()));
    if (!sig) continue;
    const cfg = d.cfg.get(l.id);
    const entries: AutoLateFeeEntry[] = [];
    if (cfg && cfg.autoCharge && cfg.pol.kind !== "NONE") {
      let room = cfg.cap === null ? Number.POSITIVE_INFINITY : cfg.cap;
      for (const s of bills) {
        if (room <= 0) break;
        if (!(s.periodKey < i.periodKey) || !isSource(s) || d.waived.has(s.id) || !d.fin.has(s.id)) continue;
        const fin = d.fin.get(s.id) ?? null;
        const ev = fin ? evalSource(s, fin, cfg.pol, i.asOf) : null;
        if (!ev || ev.accrued <= 0) continue;
        const due = cfg.cap === null ? ev.accrued : Math.min(ev.accrued, cfg.cap);
        const other = chargesOf(bills, s.id, i.periodKey).reduce((x, c) => x + c.amountSatang, 0);
        const want = due - other;
        if (want <= 0) continue;
        const amt = Math.min(want, room);
        entries.push({ sourceBillId: s.id, periodKey: s.periodKey, daysLate: ev.daysLate, chargeableDays: ev.chargeableDays, amountSatang: amt, asOf: i.asOf, capped: ev.accrued - other > amt ? 1 : 0 });
        room -= amt;
      }
    }
    out.set(l.id, { entries, capSatang: cfg?.cap ?? null, sig });
  }
  return out;
}

/** ลายเซ็นปัจจุบันของสัญญาที่ระบุ — อ่านผ่าน tx ของผู้เรียก (ไม่มี connection ที่สอง) */
export async function autoLateFeeSigsInTx(tx: Tx, i: { tenantId: string; unitId: string; periodKey: string; leaseIds: string[] }): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!i.leaseIds.length) return out;
  const rows = await tx.dormBill.findMany({
    where: { tenantId: i.tenantId, unitId: i.unitId, leaseId: { in: i.leaseIds }, status: { not: "VOID" } },
    select: { id: true, leaseId: true, periodKey: true, status: true, accountDocumentId: true, lines: true },
  });
  const src = rows.filter((b) => b.periodKey < i.periodKey && isSource(b)).map((b) => b.id);
  const w = src.length
    ? await tx.auditLog.findMany({ where: { tenantId: i.tenantId, action: A_WAIVED, targetType: "DormBill", targetId: { in: src } }, select: { targetId: true } })
    : [];
  const waived = new Set(w.map((x) => x.targetId).filter((x): x is string => !!x));
  for (const id of i.leaseIds) out.set(id, sigOf(rows.filter((b) => b.leaseId === id), i.periodKey, waived));
  return out;
}

// ───────────────────────── สมุดค่าปรับ ─────────────────────────
/** รายการสมุดค่าปรับของหลายสัญญา ณ asOf (บิลต้นทางที่เคยเลยกำหนด) — ผู้เรียกตรวจสิทธิ์แล้ว */
export async function ledgerItemsOf(
  tenantId: string,
  unitId: string,
  leases: LeaseIn[],
  asOf: string,
  legalParams: Record<string, unknown> | null = null,
): Promise<Map<string, LateFeeLedgerItem[]>> {
  const out = new Map<string, LateFeeLedgerItem[]>();
  if (!leases.length) return out;
  const d = await leaseData(tenantId, unitId, leases, legalParams);
  const allSrc = [...d.bills.values()].flat().filter(isSource).map((b) => b.id);
  const reqs = await requestsOf(tenantId, allSrc.filter((id) => !d.waived.has(id)));
  for (const l of leases) {
    const bills = d.bills.get(l.id) ?? [];
    const cfg = d.cfg.get(l.id);
    const items: LateFeeLedgerItem[] = [];
    if (cfg) {
      for (const s of bills) {
        if (!isSource(s)) continue;
        const fin = d.fin.get(s.id) ?? null;
        const ev = fin ? evalSource(s, fin, cfg.pol, asOf) : null;
        if (!ev) continue;
        const charges = chargesOf(bills, s.id, null);
        const charged = charges.reduce((x, c) => x + c.amountSatang, 0);
        const w = d.waived.get(s.id);
        const rq = reqs.get(s.id);
        const status: WaiverStatus = w
          ? "APPLIED"
          : rq && (rq.status === "PENDING" || rq.status === "APPROVED" || rq.status === "REJECTED")
            ? rq.status
            : "NONE";
        items.push({
          sourceBillId: s.id,
          periodKey: s.periodKey,
          dueDate: ev.dueDate,
          paidDate: ev.paidDate,
          asOf,
          principalSatang: ev.base,
          principalOutstandingSatang: ev.outstanding,
          daysLate: ev.daysLate,
          chargeableDays: ev.chargeableDays,
          accruedSatang: ev.accrued,
          capSatang: cfg.cap,
          dueSatang: w ? 0 : cfg.cap === null ? ev.accrued : Math.min(ev.accrued, cfg.cap),
          chargedSatang: charged,
          charges,
          waiver: { status, requestId: w ? w.approvalId : (rq?.requestId ?? null) },
          policy: { ...cfg.pol },
        });
      }
    }
    out.set(l.id, items);
  }
  return out;
}

export async function lateFeeLedger(
  ctx: LateFeeCtx,
  input: { unitId: string; leaseId: string },
  deps?: { now?: Date; legalParams?: Record<string, unknown> },
): Promise<LateFeeLedger | null> {
  try {
    const a = await dormActorOf(ctx, isRec(input) ? input.unitId : null);
    if (!a || !a.can("dorm.view") || !a.money || !isStr(input.leaseId)) return null;
    const lease = await tenantDb({ tenantId: a.tenantId, unitId: a.unitId }).dormLease.findFirst({ where: { id: input.leaseId }, select: { id: true, rentSatang: true, policySnapshot: true } });
    if (!lease) return null;
    const asOf = bkkYmd(deps?.now instanceof Date ? deps.now : new Date());
    const items = (await ledgerItemsOf(a.tenantId, a.unitId, [lease], asOf, isRec(deps?.legalParams) ? (deps?.legalParams as Record<string, unknown>) : null)).get(lease.id) ?? [];
    return {
      unitId: a.unitId,
      leaseId: lease.id,
      asOf,
      items,
      totalDueSatang: items.reduce((s, x) => s + x.dueSatang, 0),
      totalChargedSatang: items.reduce((s, x) => s + x.chargedSatang, 0),
    };
  } catch (e) {
    await logLateFee("latefee.ledger", isRec(ctx) ? ctx.tenantId : null, e);
    return null;
  }
}

// ───────────────────────── 4. ยกเว้นค่าปรับ ─────────────────────────
type WaiveSrc = { id: string; leaseId: string; periodKey: string };
/**
 * ยกเว้นจริง (มติ 8 · L1): ใบลดหนี้ต่อบิลปลายทางที่ส่งแล้ว (ตรวจคงค้างทุกใบก่อน · ออกทีละใบ · ref idempotent) →
 *   ใต้ล็อกสัญญา dorm.latefee:<leaseId> อ่านบิลปลายทางสด: ถูกจองส่งอยู่ (sending:) ⇒ ไม่บันทึก (RUN_BUSY) · ส่งแล้วแต่ยังไม่มีใบลดหนี้ ⇒ วนออกใบก่อน ·
 *   ผ่าน ⇒ audit dorm.latefee.waived (มีแล้ว = created false) → บิลปลายทาง DRAFT/HELD ที่ยังไม่ถูกจองคำนวณใหม่ (รวมรอบ REVIEW — มติ F2)
 *   ผู้ส่งตรวจค่าปรับสดหลังจองบิลอีกชั้น (billing.ts sendOne) ⇒ บิลไม่ออกพร้อมค่าปรับที่ยกเว้นแล้ว
 */
async function applyWaiver(p: {
  tenantId: string;
  unitId: string;
  actorUserId: string | null;
  src: WaiveSrc;
  reason: string;
  approvalId: string | null;
  dueSatang: number;
}): Promise<{ ok: true; created: boolean; creditNotes: WaivedInfo["creditNotes"]; approvalId: string | null } | Fail> {
  const db = tenantDb({ tenantId: p.tenantId, unitId: p.unitId });
  const bm = await import("./billing");
  const BUSY = fail("RUN_BUSY", "บิลที่ลงค่าปรับนี้กำลังถูกส่งอยู่ — รอส่งเสร็จแล้วกดยกเว้นอีกครั้ง (ระบบจะออกใบลดหนี้ให้)");
  let creditNotes: WaivedInfo["creditNotes"] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const bills: LfBill[] = await db.dormBill.findMany({ where: { leaseId: p.src.leaseId, status: { not: "VOID" } }, select: LF_BILL_SELECT, orderBy: [{ periodKey: "asc" }] });
    const sentTargets = chargesOf(bills, p.src.id, null).filter((c) => SENTISH.includes(c.status));
    if (sentTargets.length) {
      const r = await bm.creditLateFeeWaiver({
        tenantId: p.tenantId,
        unitId: p.unitId,
        actorUserId: p.actorUserId,
        sourceBillId: p.src.id,
        sourcePeriodKey: p.src.periodKey,
        reason: p.reason,
        targets: sentTargets.map((c) => ({ billId: c.billId, amountSatang: c.amountSatang })),
      });
      if (!r.ok) return fail(r.code, r.reason);
      creditNotes = r.notes;
    } else creditNotes = [];
    const covered = new Set(creditNotes.map((n) => n.billId));
    const res = await retryOnce(() =>
      db.$transaction(async (txRaw) => {
        const tx = txRaw as unknown as Tx;
        await advisoryLock(tx, lateFeeLockKey(p.src.leaseId));
        const has = await tx.auditLog.findFirst({ where: { tenantId: p.tenantId, action: A_WAIVED, targetType: "DormBill", targetId: p.src.id }, select: { after: true } });
        if (has) return { kind: "DONE" as const, created: false, info: waivedInfoOf(has.after) };
        const live = await tx.dormBill.findMany({
          where: { tenantId: p.tenantId, unitId: p.unitId, leaseId: p.src.leaseId, status: { not: "VOID" } },
          select: { id: true, status: true, sentVia: true, lines: true },
        });
        for (const b of live) {
          if (!autoEntriesOf(b.lines).some((e) => e.sourceBillId === p.src.id)) continue;
          if ((b.status === "DRAFT" || b.status === "HELD") && typeof b.sentVia === "string" && b.sentVia.startsWith("sending:")) return { kind: "CLAIMED" as const };
          if (SENTISH.includes(b.status) && !covered.has(b.id)) return { kind: "NEW_SENT" as const };
        }
        await tx.auditLog.create({
          data: {
            tenantId: p.tenantId,
            unitId: p.unitId,
            actorType: p.actorUserId ? "USER" : "SYSTEM",
            actorId: p.actorUserId,
            action: A_WAIVED,
            targetType: "DormBill",
            targetId: p.src.id,
            after: {
              unitId: p.unitId,
              leaseId: p.src.leaseId,
              sourceBillId: p.src.id,
              reason: p.reason,
              approvalId: p.approvalId,
              amountSatang: p.dueSatang,
              creditNoteDocIds: creditNotes.map((n) => n.docId),
              creditNotes,
            },
          },
        });
        return { kind: "DONE" as const, created: true, info: { approvalId: p.approvalId, creditNotes } };
      }, TX_OPTS),
    );
    if (res === "BUSY") return BUSY;
    if (res.kind === "NEW_SENT") continue; // บิลปลายทางเพิ่งส่ง ⇒ ออกใบลดหนี้ก่อนแล้วตรวจใหม่
    if (res.kind === "CLAIMED") {
      await new Promise((r) => setTimeout(r, 1_500));
      continue;
    }
    // บิลปลายทางที่ยังคำนวณได้ (DRAFT/HELD · ไม่ถูกจอง · รอบใดก็ได้) ⇒ คำนวณใหม่ทันที (อ่านสดหลังบันทึกการยกเว้น)
    const drafts = (await db.dormBill.findMany({ where: { leaseId: p.src.leaseId, status: { in: ["DRAFT", "HELD"] } }, select: { id: true, lines: true } }))
      .filter((b) => autoEntriesOf(b.lines).some((e) => e.sourceBillId === p.src.id))
      .map((b) => b.id);
    if (drafts.length) await bm.recomputeDormBills(p.tenantId, p.unitId, drafts);
    const notes = res.created ? creditNotes : res.info.creditNotes.length ? res.info.creditNotes : creditNotes;
    return { ok: true, created: res.created, creditNotes: notes, approvalId: res.info.approvalId };
  }
  return BUSY;
}

/**
 * L1 (3) ▸ ตัวกวาดของงานตามเวลา: บิลต้นทางที่ยกเว้นแล้ว (60 วันล่าสุด) แต่ค่าปรับยังค้างในบิลปลายทางที่ส่งแล้วและยังไม่มีใบลดหนี้ของ ref นี้
 *   ⇒ ออกใบลดหนี้ (idempotent) · จ่ายครบแล้วออกไม่ได้ ⇒ logOps + audit ครั้งเดียว (หนี้ D.12 คืนเงิน) · คืนจำนวนใบที่ออกใหม่ · ไม่ throw
 */
export async function sweepWaivedCredits(tenantId: string | null, now: Date, left: () => number): Promise<number> {
  let n = 0;
  try {
    const raw = tenantDb({ tenantId: tenantId ?? "platform-global-read" });
    const since = new Date(now.getTime() - 60 * 86_400_000);
    type Row = { tenantId: string; sourceBillId: string; unitId: string; leaseId: string; periodKey: string; reason: string; approvalId: string | null; actorId: string | null };
    const rows = tenantId
      ? await raw.$queryRaw<Row[]>`
          SELECT a."tenantId", a."targetId" AS "sourceBillId", a."after"->>'unitId' AS "unitId", a."after"->>'leaseId' AS "leaseId", b."periodKey",
                 COALESCE(a."after"->>'reason', '') AS "reason", a."after"->>'approvalId' AS "approvalId", a."actorId"
          FROM "AuditLog" a JOIN "DormBill" b ON b."id" = a."targetId" AND b."tenantId" = a."tenantId"
          WHERE a."action" = ${A_WAIVED} AND a."tenantId" = ${tenantId} AND a."createdAt" >= ${since}
            AND EXISTS (SELECT 1 FROM "DormBill" t WHERE t."tenantId" = a."tenantId" AND t."leaseId" = b."leaseId" AND t."status" IN ('SENT', 'PARTIALLY_PAID', 'PAID')
                        AND t."lines"::text LIKE '%' || a."targetId" || '%'
                        AND NOT EXISTS (SELECT 1 FROM "AccountDocument" d WHERE d."tenantId" = t."tenantId" AND d."refId" = t."id" || ':waive:' || a."targetId" AND d."status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT')))
            AND NOT EXISTS (SELECT 1 FROM "AuditLog" x WHERE x."tenantId" = a."tenantId" AND x."targetId" = a."targetId" AND x."action" = 'dorm.latefee.waive.credit_failed')
          ORDER BY a."createdAt" ASC LIMIT 50`
      : await raw.$queryRaw<Row[]>`
          SELECT a."tenantId", a."targetId" AS "sourceBillId", a."after"->>'unitId' AS "unitId", a."after"->>'leaseId' AS "leaseId", b."periodKey",
                 COALESCE(a."after"->>'reason', '') AS "reason", a."after"->>'approvalId' AS "approvalId", a."actorId"
          FROM "AuditLog" a JOIN "DormBill" b ON b."id" = a."targetId" AND b."tenantId" = a."tenantId"
          WHERE a."action" = ${A_WAIVED} AND a."createdAt" >= ${since}
            AND EXISTS (SELECT 1 FROM "DormBill" t WHERE t."tenantId" = a."tenantId" AND t."leaseId" = b."leaseId" AND t."status" IN ('SENT', 'PARTIALLY_PAID', 'PAID')
                        AND t."lines"::text LIKE '%' || a."targetId" || '%'
                        AND NOT EXISTS (SELECT 1 FROM "AccountDocument" d WHERE d."tenantId" = t."tenantId" AND d."refId" = t."id" || ':waive:' || a."targetId" AND d."status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT')))
            AND NOT EXISTS (SELECT 1 FROM "AuditLog" x WHERE x."tenantId" = a."tenantId" AND x."targetId" = a."targetId" AND x."action" = 'dorm.latefee.waive.credit_failed')
          ORDER BY a."createdAt" ASC LIMIT 50`;
    const bm = rows.length ? await import("./billing") : null;
    for (const r of rows) {
      if (left() < 3_000 || !bm || !r.unitId || !r.leaseId) break;
      const bills: LfBill[] = await tenantDb({ tenantId: r.tenantId, unitId: r.unitId }).dormBill.findMany({ where: { leaseId: r.leaseId, status: { in: SENTISH } }, select: LF_BILL_SELECT });
      const targets = chargesOf(bills, r.sourceBillId, null);
      if (!targets.length) continue;
      const out = await bm.creditLateFeeWaiver({
        tenantId: r.tenantId,
        unitId: r.unitId,
        actorUserId: r.actorId,
        sourceBillId: r.sourceBillId,
        sourcePeriodKey: r.periodKey,
        reason: isValidOutOfScopeReason(r.reason) ? r.reason : "ยกเว้นค่าปรับแล้ว (ตัวกวาดออกใบลดหนี้)",
        targets: targets.map((c) => ({ billId: c.billId, amountSatang: c.amountSatang })),
      });
      if (out.ok) n += out.notes.length;
      else if (out.code === "ALREADY_PAID") {
        await logOps("WARN", "dorm.latefee", `ค่าปรับที่ยกเว้นแล้วอยู่ในบิลที่ชำระครบ — ต้องคืนเงินผ่านขั้นตอนย้ายออก/คืนเงิน (D.12) · บิลต้นทาง ${r.sourceBillId}`, { tenantId: r.tenantId });
        await tenantDb({ tenantId: r.tenantId }).auditLog.create({
          data: { tenantId: r.tenantId, unitId: r.unitId, actorType: "SYSTEM", action: "dorm.latefee.waive.credit_failed", targetType: "DormBill", targetId: r.sourceBillId, after: { code: out.code, leaseId: r.leaseId } },
        });
      }
    }
  } catch (e) {
    await logLateFee("latefee.sweepCredits", tenantId, e);
  }
  return n;
}

/** ยื่นขอยกเว้นผ่านสายอนุมัติ (มติ 9) — ต้องมีนโยบายที่มีขั้น OWNER · ยื่นซ้ำ = คำขอเดิม */
async function requestWaiver(a: DormActor, src: WaiveSrc, reason: string): Promise<WaiveResult | Fail> {
  const prev = (await requestsOf(a.tenantId, [src.id])).get(src.id);
  if (prev) {
    if (prev.status === "REJECTED") return fail("ALREADY_REJECTED", "คำขอยกเว้นค่าปรับของบิลนี้ถูกปฏิเสธแล้ว — ยื่นซ้ำไม่ได้");
    if (prev.status === "PENDING" || prev.status === "APPROVED") return { ok: true, status: "PENDING_APPROVAL", created: false, requestId: prev.requestId, creditNotes: [] };
  }
  const pol = await resolvePolicy({ tenantId: a.tenantId }, { entityType: ENTITY, unitId: a.unitId, systemId: null, amountSatang: null });
  const full = pol ? (await listPoliciesForEntities({ tenantId: a.tenantId }, [ENTITY])).find((x) => x.id === pol.id) : null;
  if (!full || !full.steps.some((s) => s.approverRole === "OWNER")) {
    return fail("NEEDS_APPROVAL", "การยกเว้นค่าปรับต้องให้เจ้าของอนุมัติ แต่ร้านยังไม่ได้ตั้งสายอนุมัติ \"ยกเว้นค่าปรับจ่ายช้า (หอพัก)\" ที่มีขั้นเจ้าของ — ให้เจ้าของตั้งสายอนุมัติ หรือให้เจ้าของยกเว้นเอง");
  }
  const sub = await submitForApproval({ tenantId: a.tenantId }, { entityType: ENTITY, entityId: src.id, unitId: a.unitId, requestedById: a.actorUserId });
  if (!("requestId" in sub)) return fail("NEEDS_APPROVAL", "สายอนุมัติไม่รับคำขอนี้ — ให้เจ้าของยกเว้นเอง");
  if (prev && prev.requestId === sub.requestId && prev.status !== "UNKNOWN") {
    return fail("REQUEST_CLOSED", "คำขอยกเว้นค่าปรับของบิลนี้ถูกยกเลิกแล้ว — ให้เจ้าของยกเว้นเอง");
  }
  const created = await retryOnce(() =>
    tenantDb({ tenantId: a.tenantId }).$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      await advisoryLock(tx, `dorm.latefee.request:${src.id}`);
      const has = await tx.auditLog.findFirst({ where: { tenantId: a.tenantId, action: A_REQUESTED, targetType: "DormBill", targetId: src.id, after: { path: ["requestId"], equals: sub.requestId } }, select: { id: true } });
      if (has) return false;
      await tx.auditLog.create({
        data: {
          tenantId: a.tenantId,
          unitId: a.unitId,
          actorType: "USER",
          actorId: a.actorUserId,
          action: A_REQUESTED,
          targetType: "DormBill",
          targetId: src.id,
          after: { unitId: a.unitId, leaseId: src.leaseId, sourceBillId: src.id, requestId: sub.requestId, reason },
        },
      });
      return true;
    }, TX_OPTS),
  );
  return { ok: true, status: "PENDING_APPROVAL", created: created === true, requestId: sub.requestId, creditNotes: [] };
}

export async function waiveLateFee(
  ctx: LateFeeCtx,
  input: { unitId: string; sourceBillId: string; reason: string },
  deps?: { now?: Date },
): Promise<WaiveResult | Fail> {
  try {
    const a = await dormActorOf(ctx, isRec(input) ? input.unitId : null);
    if (!a || !a.can("dorm.view") || !(a.can("dorm.latefee.waive") || a.can("dorm.bill.run") || a.can("dorm.bill.send"))) return NOT_FOUND();
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (!isValidOutOfScopeReason(reason)) return fail("REASON_REQUIRED", "กรุณาระบุเหตุผลการยกเว้นค่าปรับอย่างน้อย 10 ตัวอักษร (เก็บเป็นหลักฐาน)");
    if (!isStr(input.sourceBillId)) return NOT_FOUND();
    const db = tenantDb({ tenantId: a.tenantId, unitId: a.unitId });
    const src = await db.dormBill.findFirst({ where: { id: input.sourceBillId }, select: { id: true, leaseId: true, periodKey: true, status: true, accountDocumentId: true } });
    if (!src) return NOT_FOUND();
    const done = (await waivedOf(a.tenantId, [src.id])).get(src.id);
    if (done) return { ok: true, status: "WAIVED", created: false, requestId: done.approvalId, creditNotes: done.creditNotes };
    const lease = await db.dormLease.findFirst({ where: { id: src.leaseId }, select: { id: true, rentSatang: true, policySnapshot: true } });
    if (!lease) return NOT_FOUND();
    const asOf = bkkYmd(deps?.now instanceof Date ? deps.now : new Date());
    const item = isSource(src) ? (await ledgerItemsOf(a.tenantId, a.unitId, [lease], asOf)).get(lease.id)?.find((x) => x.sourceBillId === src.id) : undefined;
    if (!item) return fail("NOT_OVERDUE", "บิลนี้ไม่เคยเลยกำหนดชำระ (หรือไม่มีค่าปรับอัตโนมัติ) — ไม่มีค่าปรับให้ยกเว้น");
    if (!a.isOwner) {
      const [mode] = await resolveSettingsMany({ tenantId: a.tenantId }, ["rooms.lateFee.waiverApproval"], [{ unitId: a.unitId }]);
      const m = mode?.["rooms.lateFee.waiverApproval"]?.value;
      if (m === "OWNER_ONLY") return fail("OWNER_ONLY", "หอนี้ตั้งให้เจ้าของเท่านั้นที่ยกเว้นค่าปรับได้");
      // L12 ▸ เจ้าของปฏิเสธแล้ว ⇒ ทุกทางที่ไม่ใช่เจ้าของ (รวมผู้จัดการโหมดยกเว้นได้เลย) ยกเว้นไม่ได้
      if ((await requestsOf(a.tenantId, [src.id])).get(src.id)?.status === "REJECTED") return fail("ALREADY_REJECTED", "คำขอยกเว้นค่าปรับของบิลนี้ถูกเจ้าของปฏิเสธแล้ว — ยกเว้นซ้ำได้เฉพาะเจ้าของ");
      const direct = m === "MANAGER_DIRECT" && a.can("dorm.latefee.waive");
      if (!direct) return await requestWaiver(a, src, reason);
    }
    const r = await applyWaiver({ tenantId: a.tenantId, unitId: a.unitId, actorUserId: a.actorUserId, src, reason, approvalId: null, dueSatang: item.dueSatang });
    if (!r.ok) return r;
    return { ok: true, status: "WAIVED", created: r.created, requestId: r.approvalId, creditNotes: r.creditNotes };
  } catch (e) {
    await logLateFee("latefee.waive", isRec(ctx) ? ctx.tenantId : null, e);
    return INTERNAL();
  }
}

/** ผลอนุมัติ (approval-effects + งานตามเวลา) — ยกเว้นในนามผู้ตัดสินขั้นสุดท้ายที่เป็นเจ้าของสด · ไม่ throw */
export async function applyLateFeeWaiverApproval(input: { tenantId: string; requestId: string; sourceBillId: string }): Promise<ApplyWaiverResult> {
  const tenantId = isRec(input) && isStr(input.tenantId) ? input.tenantId : "";
  try {
    if (!tenantId || !isStr(input.requestId) || !isStr(input.sourceBillId)) return { status: "INVALID", reason: "ข้อมูลคำขอไม่ครบ" };
    if ((await waivedOf(tenantId, [input.sourceBillId])).has(input.sourceBillId)) return { status: "ALREADY" };
    const rq = (await requestsOf(tenantId, [input.sourceBillId])).get(input.sourceBillId);
    if (!rq || rq.requestId !== input.requestId || !rq.unitId) return { status: "INVALID", reason: "ไม่พบคำขอยกเว้นของบิลนี้" };
    if (rq.status !== "APPROVED") return { status: "SKIPPED" };
    const dec = await lastDecisionOf({ tenantId }, input.requestId);
    if (!dec || dec.decision !== "APPROVED") return { status: "SKIPPED" };
    const owner = await tenantDb({ tenantId }).membership.findFirst({ where: { tenantId, userId: dec.decidedById, role: "OWNER", acceptedAt: { not: null } }, select: { userId: true } });
    if (!owner) return { status: "INVALID", reason: "ผู้อนุมัติขั้นสุดท้ายไม่ใช่เจ้าของร้าน" };
    const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: rq.unitId, type: "DORM", status: "ACTIVE" }, select: { id: true } });
    if (!unit) return { status: "INVALID", reason: "ไม่พบหอพักของคำขอ" };
    const db = tenantDb({ tenantId, unitId: unit.id });
    const src = await db.dormBill.findFirst({ where: { id: input.sourceBillId }, select: { id: true, leaseId: true, periodKey: true, status: true, accountDocumentId: true } });
    const lease = src ? await db.dormLease.findFirst({ where: { id: src.leaseId }, select: { id: true, rentSatang: true, policySnapshot: true } }) : null;
    if (!src || !lease) return { status: "INVALID", reason: "ไม่พบบิลของคำขอ" };
    const item = (await ledgerItemsOf(tenantId, unit.id, [lease], bkkYmd(new Date()))).get(lease.id)?.find((x) => x.sourceBillId === src.id);
    const reason = rq.reason && isValidOutOfScopeReason(rq.reason) ? rq.reason : "อนุมัติยกเว้นค่าปรับผ่านสายอนุมัติ";
    const r = await applyWaiver({ tenantId, unitId: unit.id, actorUserId: dec.decidedById, src, reason, approvalId: input.requestId, dueSatang: item?.dueSatang ?? 0 });
    if (!r.ok) return r.code === "RUN_BUSY" || r.code === "INTERNAL" ? { status: "SKIPPED", reason: r.reason } : { status: "INVALID", reason: r.reason };
    return { status: r.created ? "APPLIED" : "ALREADY" };
  } catch (e) {
    await logLateFee("latefee.approval", tenantId, e);
    return { status: "SKIPPED", reason: "ระบบขัดข้องชั่วคราว" };
  }
}

/**
 * ทางสำรองของงานตามเวลา (§4): คำขอที่ยื่นแล้วและยังไม่ปิด ⇒ อนุมัติแล้ว = ยกเว้น · ปฏิเสธ/ยกเลิก/ใช้ไม่ได้ = ปิด (ไม่กวาดซ้ำ)
 *   คืนจำนวนที่ยกเว้นใหม่ในรอบนี้ · เคารพงบ (left) · ไม่ throw
 */
export async function sweepLateFeeApprovals(tenantId: string | null, left: () => number): Promise<number> {
  let applied = 0;
  try {
    const raw = tenantDb({ tenantId: tenantId ?? "platform-global-read" });
    type Row = { tenantId: string; sourceBillId: string; requestId: string };
    const rows = tenantId
      ? await raw.$queryRaw<Row[]>`
          SELECT a."tenantId", a."targetId" AS "sourceBillId", a."after"->>'requestId' AS "requestId"
          FROM "AuditLog" a
          WHERE a."action" = ${A_REQUESTED} AND a."tenantId" = ${tenantId} AND a."targetId" IS NOT NULL AND a."after"->>'requestId' IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "AuditLog" w WHERE w."tenantId" = a."tenantId" AND w."targetId" = a."targetId" AND w."action" IN (${A_WAIVED}, ${A_CLOSED}))
            AND EXISTS (SELECT 1 FROM "ApprovalRequest" r WHERE r."tenantId" = a."tenantId" AND r."id" = a."after"->>'requestId' AND r."status"::text <> 'PENDING')
          ORDER BY a."createdAt" ASC LIMIT 200`
      : await raw.$queryRaw<Row[]>`
          SELECT a."tenantId", a."targetId" AS "sourceBillId", a."after"->>'requestId' AS "requestId"
          FROM "AuditLog" a
          WHERE a."action" = ${A_REQUESTED} AND a."targetId" IS NOT NULL AND a."after"->>'requestId' IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "AuditLog" w WHERE w."tenantId" = a."tenantId" AND w."targetId" = a."targetId" AND w."action" IN (${A_WAIVED}, ${A_CLOSED}))
            AND EXISTS (SELECT 1 FROM "ApprovalRequest" r WHERE r."tenantId" = a."tenantId" AND r."id" = a."after"->>'requestId' AND r."status"::text <> 'PENDING')
          ORDER BY a."createdAt" ASC LIMIT 200`;
    const byTenant = new Map<string, Row[]>();
    for (const r of rows) byTenant.set(r.tenantId, [...(byTenant.get(r.tenantId) ?? []), r]);
    for (const [tid, list] of byTenant) {
      if (left() < 3_000) break;
      const st = await requestStatuses({ tenantId: tid }, list.map((r) => r.requestId));
      for (const r of list) {
        if (left() < 3_000) break;
        const s = st[r.requestId];
        if (s === "PENDING") continue;
        const out = s === "APPROVED" ? await applyLateFeeWaiverApproval({ tenantId: tid, requestId: r.requestId, sourceBillId: r.sourceBillId }) : null;
        if (out?.status === "APPLIED") applied++;
        if (out && out.status !== "INVALID") continue;
        // ปิด (ปฏิเสธ/ยกเลิก/ไม่พบ/ใช้ไม่ได้) — ครั้งเดียวต่อบิลต้นทาง
        await retryOnce(() =>
          tenantDb({ tenantId: tid }).$transaction(async (txRaw) => {
            const tx = txRaw as unknown as Tx;
            await advisoryLock(tx, `dorm.latefee.request:${r.sourceBillId}`);
            const has = await tx.auditLog.findFirst({ where: { tenantId: tid, action: { in: [A_WAIVED, A_CLOSED] }, targetId: r.sourceBillId }, select: { id: true } });
            if (has) return;
            await tx.auditLog.create({
              data: { tenantId: tid, actorType: "SYSTEM", action: A_CLOSED, targetType: "DormBill", targetId: r.sourceBillId, after: { requestId: r.requestId, status: s ?? "UNKNOWN", reason: out?.reason ?? null } },
            });
          }, TX_OPTS),
        );
      }
    }
  } catch (e) {
    await logLateFee("latefee.sweep", tenantId, e);
  }
  return applied;
}
// ◂ SVC D.11
