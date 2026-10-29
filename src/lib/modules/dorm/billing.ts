// SVC D.8 ▸ รอบบิลรายเดือนหอพัก (ภาพ หอ 04) — สัญญา ledger/svc-briefs/svc-brief-d.8.md §2–§4
//   • สูตรเงินทุกตัวเรียก D.1 (buildDormBill · prorate · occupiedDays · daysInMonth · utilityLine) — ไม่เขียนสูตรซ้ำ
//   • ค่าน้ำไฟจาก D.7 (utilityCharges · utilityBillingGate) + D.6 (periodUsage · heldRooms · meterWalk) · ตัวตรวจกฎหมายผ่าน evaluateLegal
//   • เงินผ่าน facade บัญชีเท่านั้น (createExternalInvoice · ใบลด/เพิ่มหนี้ · createPaymentRequestForDoc) · บรรทัดเอกสาร = dormBillInvoiceLines (D.2)
//   • ขอบเขต (X1): อ่าน/เขียนผ่าน tenantDb เท่านั้น · หน่วยต้องเป็น DORM ของร้าน · สิทธิ์อ่านสดจาก Membership ทุกครั้ง · ไม่ผ่าน ⇒ NOT_FOUND / null / {}
//   • กติกาจากสัญญา (dueDay · prorate · ค่าบริการ · ค่าคนพักเพิ่ม · เพดานค่าปรับ · เงินจองหักเข้าอะไร) อ่านจาก lease.policySnapshot (CC §1.6)
//     วิธีคิดน้ำไฟ/VAT ณ ตอนออก = ค่าตั้งปัจจุบัน ⇒ จดลง DormBill.policySnapshot (snapshotPolicy "bill")
//   • เขียนแถวรอบ/บิลใต้ advisory lock ต่อ (หน่วย × งวด) ใน tx สั้น (ไม่มี connection ที่สองระหว่างถือ tx) · 40P01 ⇒ ลองใหม่ 1 ครั้งแล้วคืน RUN_BUSY
//   • ส่ง: ผู้ส่งทีละคนต่อรอบ (สัญญาเช่าผู้ส่งใน progress · หมดอายุเองถ้าโพรเซสตาย) · ออกใบทีละใบ (ล็อกเงินระดับร้านของ D.2) ·
//     ใบแจ้งหนี้ idempotent ต่อ ref DormBill/<leaseId>:<periodKey> · ตั้ง SENT + event ใน tx เดียว (CAS สถานะ DRAFT) · ลิงก์จ่าย best-effort
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { csvRow } from "@/lib/core/csv";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveSettingsMany, snapshotPolicy, SNAPSHOT_KEYS, type PolicySnapshot, type Resolved, type ScopeRefs } from "@/lib/core/settings";
import { evaluateLegal, normalizeLegalMode } from "@/lib/core/settings/legal/th-rental-2568";
import {
  createExternalCreditNote,
  createExternalDebitNote,
  createExternalInvoice,
  cancelOtherPendingPaymentRequests,
  createPaymentRequestForDoc,
  docLinkInfo,
  firstReceiveFinanceId,
  type DormVat,
  type ExternalDocLine,
} from "@/lib/modules/account";
import { dormBillInvoiceLines } from "./account-bridge";
import {
  buildDormBill,
  daysInMonth,
  occupiedDays,
  prorate,
  utilityLine,
  type DormBillLine,
  type DormBillResult,
  type DormTaxSlot,
  type TaxKind,
  type VatConfig,
} from "./calc";
import { heldRooms, meterWalk, periodUsage, type PeriodUsageRow } from "./meter";
import { utilityBillingGate, utilityCharges, type UtilityChargeRow, type UtilityGate, type UtilityGroup } from "./utility";
// SVC D.3 ▸ ใบกำกับภาษีเต็มรูปต่อบิล (ส่วน VAT) · ด่านผู้ขาย/ผู้ซื้อ ◂
import { badBuyerTaxIds, issueTaxForBill, liveTaxInvoicesFor, sellerTaxProblem, taxBuyerOf } from "./tax-invoice";

// ───────────────────────── ชนิด (สัญญา §3) ─────────────────────────
export type BillingCtx = { tenantId: string; actorUserId: string };
export type BillRunStatus = "DRAFT" | "REVIEW" | "SENT" | "CLOSED";
export type BillGateItem = { kind: "ELEC" | "WATER" | null; buildingId: string | null; code: string; messageTh: string; ruleId?: string };
export type BillRunGate = { ok: boolean; blocks: BillGateItem[]; needsAcceptance: BillGateItem[] };
type Fail = { ok: false; code: string; reason: string; blocks?: BillGateItem[] };
type Money = number;
type Channel = "LINE" | "SMS" | "PRINT";

export type PrepareBillRunResult =
  | {
      ok: true;
      runId: string;
      created: boolean;
      status: BillRunStatus;
      utilityPeriodKey: string;
      billCount: number;
      heldCount: number;
      added: number;
      changed: number;
      totalSatang: number;
      skipped: { leaseId: string; roomNumber: string; reason: "MOVE_OUT" }[];
      gate: BillRunGate;
    }
  | Fail;
export type SendBillRunResult =
  | {
      ok: true;
      done: boolean;
      status: BillRunStatus;
      sent: number;
      alreadySent: number;
      held: number;
      remaining: number;
      failed: { billId: string; code: string; reason: string; docId?: string }[];
      payLinkPending: number;
      /** SVC D.3 ▸ บิลส่งแล้วของรอบที่มี VAT แต่ยังไม่มีใบกำกับที่ยังมีผล (ปกติ 0 · การเรียกซ้ำพยายามออกให้ก่อนนับ) ◂ */
      taxInvoicePending: number;
    }
  | Fail;
export type BillPreview = {
  billId: string;
  roomNumber: string;
  unitName: string;
  tenantName: string;
  status: string;
  docNo: string | null;
  issueDate: string;
  dueDate: string;
  lines: { code: string; labelTh: string; detail: string | null; amountSatang: Money }[];
  totalSatang: Money;
  vatSatang: Money;
  vatRegistered: boolean;
  lateFeeRule: string | null;
  /** SVC D.3 ▸ ใบกำกับภาษีที่ยังมีผลของบิล (null = ไม่มี) · หัก ณ ที่จ่ายผู้เช่านิติบุคคล (แสดงอย่างเดียว · null = ไม่หัก) ◂ */
  taxInvoice: { docId: string; docNo: string | null; status: string } | null;
  withholding: { rateBp: number; baseSatang: Money; amountSatang: Money } | null;
};
export type BillRunRow = {
  billId: string | null;
  leaseId: string;
  roomId: string;
  roomNumber: string;
  tenantName: string;
  status: "DRAFT" | "HELD" | "SENT" | "PARTIALLY_PAID" | "PAID" | "VOID" | "SKIPPED";
  skipReason: "MOVE_OUT" | null;
  holdReason: string | null;
  rentCommonSatang: Money | null;
  elec: { amountSatang: Money; units: number } | null;
  water: { amountSatang: Money; units: number } | null;
  otherSatang: Money;
  otherNote: string | null;
  totalSatang: Money | null;
  channel: Channel | null;
  meterFlag: { flag: string; confirmed: boolean } | null;
  docNo: string | null;
  adjustments: { kind: "CREDIT" | "DEBIT"; docNo: string | null; totalSatang: Money }[];
  /** SVC D.3 ▸ เลขใบกำกับภาษีที่ยังมีผล ◂ */
  taxInvoiceNo: string | null;
};
export type BillRunModel = {
  unitId: string;
  unitName: string;
  periodKey: string;
  utilityPeriodKey: string;
  runId: string | null;
  status: "NONE" | BillRunStatus;
  issueDate: string | null;
  scheduledSendAt: string | null;
  meter: { rooms: number; done: number };
  kpi: {
    billCount: number;
    rentSatang: Money;
    commonSatang: Money;
    elecSatang: Money;
    elecUnits: number;
    elecRateSatang: number | null;
    waterSatang: Money;
    waterUnits: number;
    waterRateSatang: number | null;
    lateFeeSatang: Money;
    otherSatang: Money;
    totalSatang: Money;
  };
  legal: BillRunGate & {
    elec: { billSatang: Money; units: number; rateSatang: number } | null;
    water: { billSatang: Money; units: number; rateSatang: number } | null;
  };
  rows: BillRunRow[];
  preview: BillPreview | null;
  counts: { total: number; reviewed: number; held: number };
  canPrepare: boolean;
  canSend: boolean;
  /** งานตามเวลาส่งไม่สำเร็จครั้งล่าสุด (F4) — null = ไม่มี */
  lastError?: { code: string; reason: string; at: string; nextAttemptAt: string | null } | null;
};
export type MeterEstimate = {
  totalSatang: Money;
  elec: { units: number; rateSatangPerUnit: number | null; amountSatang: Money } | null;
  water: { units: number; rateSatangPerUnit: number | null; amountSatang: Money } | null;
};
export type ExtraLineInput = { kind: "LATE_FEE" | "OTHER"; labelTh: string; amountSatang: number; note?: string | null; taxKind?: "EXEMPT" | "VAT7" | "NONE" };

// ───────────────────────── ค่าคงที่ · ตัวช่วยเล็ก ─────────────────────────
type Tx = Prisma.TransactionClient;
type Vals = Record<string, unknown>;
type Kind = "ELEC" | "WATER";
const KINDS: readonly Kind[] = ["ELEC", "WATER"];
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MIN_PERIOD = "2020-01";
const TX_OPTS = { maxWait: 30_000, timeout: 60_000 } as const;
const EVENT = "dorm.billrun.sent";
const BILL_REF = "DormBill";
const ADJUST_REF = "DormBillAdjust";
const MAX_EXTRA_LINES = 10;
const MAX_EXTRA_SATANG = 100_000_000;
const MAX_ADJUST_LINES = 20;
const MAX_ADJUST_SATANG = 1_000_000_000;
const DEFAULT_BUDGET_MS = 25_000;
const LEASE_SLACK_MS = 20_000;
const LEASE_POLL_MS = 300;
const LEASE_WAIT_MS = 1_000;
const CLAIM_PREFIX = "claim:";
/** การจองบิลก่อนออกใบ (เก็บใน sentVia ขณะยังเป็น DRAFT) — บิลที่ถูกจองอาจมีใบแจ้งหนี้แล้ว ⇒ ห้ามแก้/ลบ/คำนวณทับ */
const SEND_CLAIM = "sending:";
const CLAIM_STALE_MS = 120_000;
const SCHEDULE_MAX_MS = 60 * 86_400_000;
const SENTISH = ["SENT", "PARTIALLY_PAID", "PAID"];
const FLAG_ORDER = ["BACKWARDS", "VACANT_USAGE", "HIGH", "LOW"];

const fail = (code: string, reason: string, blocks?: BillGateItem[]): Fail => (blocks ? { ok: false, code, reason, blocks } : { ok: false, code, reason });
const NOT_FOUND = (): Fail => fail("NOT_FOUND", "ไม่พบหอพัก รอบบิล หรือบิลนี้");
const INTERNAL = (): Fail => fail("INTERNAL", "ระบบขัดข้องชั่วคราว — ลองใหม่อีกครั้ง");
const BILL_LOCKED = (): Fail => fail("BILL_LOCKED", "รอบนี้เริ่มส่งแล้ว บิลที่รอส่งถูกล็อกไม่ให้แก้ — ยกเลิกตั้งเวลาส่ง (กลับเป็นร่าง) หรือรอส่งเสร็จแล้วแก้ด้วยใบลด/เพิ่มหนี้");
const BUSY = (): Fail => fail("RUN_BUSY", "มีคนกำลังทำงานกับรอบบิลนี้อยู่ — รอสักครู่แล้วลองใหม่");
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNat = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const pad2 = (n: number) => String(n).padStart(2, "0");
const numCmp = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const isSendClaim = (v: unknown): boolean => typeof v === "string" && v.startsWith(SEND_CLAIM);
const isTaxKind = (v: unknown): v is TaxKind => v === "EXEMPT" || v === "VAT7" || v === "NONE";

function addMonths(p: string, k: number): string {
  const y = Number(p.slice(0, 4));
  const m0 = Number(p.slice(5, 7)) - 1 + k;
  const y2 = y + Math.floor(m0 / 12);
  const m2 = (((m0 % 12) + 12) % 12) + 1;
  return `${String(y2).padStart(4, "0")}-${pad2(m2)}`;
}
const dimOf = (p: string) => daysInMonth(Number(p.slice(0, 4)), Number(p.slice(5, 7)));
const monthEnd = (p: string) => `${p}-${pad2(dimOf(p))}`;
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date | null | undefined): string | null => (d instanceof Date ? d.toISOString().slice(0, 10) : null);
const minS = (a: string, b: string) => (a < b ? a : b);
const maxS = (a: string, b: string) => (a > b ? a : b);

/** JSON แบบเรียงคีย์ (jsonb ของ Postgres เรียงคีย์ใหม่ — เทียบด้วยรูปนี้เท่านั้น) */
function canon(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (isRec(x)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(x).sort()) if (x[k] !== undefined) out[k] = norm(x[k]);
      return out;
    }
    return x;
  };
  return JSON.stringify(norm(JSON.parse(JSON.stringify(v ?? null))));
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
async function retryOnce<T>(fn: () => Promise<T>): Promise<T | "BUSY"> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isDeadlock(e)) throw e;
      if (attempt === 1) return "BUSY";
    }
  }
  return "BUSY";
}
async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
const runLockKey = (unitId: string, periodKey: string) => `dorm.billrun:${unitId}:${periodKey}`;
const sendLockKey = (runId: string) => `dorm.billrun.send:${runId}`;

async function logFail(where: string, tenantId: unknown, e: unknown): Promise<void> {
  try {
    await logOps("ERROR", `dorm.billing.${where}`, "บริการรอบบิลหอขัดข้อง", {
      tenantId: typeof tenantId === "string" ? tenantId : undefined,
      detail: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 500) : String(e).slice(0, 500),
    });
  } catch {
    /* log ล้มไม่ทำให้ผู้ใช้ล้มซ้ำ */
  }
}

// ───────────────────────── ด่าน (หน่วย DORM ของร้าน → Membership สด → สิทธิ์) ─────────────────────────
type Action = "dorm.view" | "dorm.bill.run" | "dorm.bill.send";
type G = { tenantId: string; unitId: string; unitName: string; actorUserId: string | null; canRun: boolean; canSend: boolean };

async function gateOf(ctx: unknown, unitId: unknown, need: Action): Promise<G | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId)) return null;
  const tenantId = ctx.tenantId;
  const actorUserId = ctx.actorUserId;
  const tdb = tenantDb({ tenantId });
  const unit = await tdb.businessUnit.findFirst({ where: { id: unitId, type: "DORM", status: "ACTIVE" }, select: { id: true, name: true } });
  if (!unit) return null;
  const mem = await tdb.membership.findFirst({
    where: { tenantId, userId: actorUserId, acceptedAt: { not: null } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  if (!mem) return null;
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  const can = (a: Action) => evaluate(m, { module: "dorm", action: a, unitId: unit.id });
  if (!can(need)) return null;
  return { tenantId, unitId: unit.id, unitName: unit.name, actorUserId, canRun: can("dorm.bill.run"), canSend: can("dorm.bill.send") };
}
/** ผู้กระทำระบบ (งานตามเวลา) — ทางภายในเท่านั้น ไม่เปิดเป็น ctx ของ facade */
async function systemGate(tenantId: string, unitId: string): Promise<G | null> {
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "DORM", status: "ACTIVE" }, select: { id: true, name: true } });
  return unit ? { tenantId, unitId: unit.id, unitName: unit.name, actorUserId: null, canRun: true, canSend: true } : null;
}

// ───────────────────────── ค่าตั้ง ─────────────────────────
const UNIT_KEYS = [
  "rooms.billing.rentTiming",
  "rooms.billing.utilityTiming",
  "rooms.billing.issueDay",
  "rooms.billing.autoSend",
  "rooms.legal.outOfScopeReason",
];
/** กติกาที่ล็อกในสัญญา — อ่านจาก lease.policySnapshot ก่อนเสมอ (ค่าปัจจุบันใช้เมื่อ snapshot เก่าไม่ได้จดคีย์นั้นเท่านั้น) */
const LEASE_KEYS = [
  "rooms.billing.dueDay",
  "rooms.billing.prorate",
  "rooms.services.catalog",
  "rooms.services.extraOccupantFee",
  "rooms.lateFee.kind",
  "rooms.lateFee.amount",
  "rooms.lateFee.percentBp",
  "rooms.lateFee.capPerBill",
  "rooms.lease.reservationAppliesTo",
];
const billKeys = (): string[] => [...(SNAPSHOT_KEYS.bill ?? [])];
const valsOf = (r: Record<string, Resolved> | undefined): Vals => {
  const out: Vals = {};
  for (const [k, v] of Object.entries(r ?? {})) out[k] = v.value;
  return out;
};
async function unitValsOf(tenantId: string, unitId: string): Promise<Vals> {
  const [r] = await resolveSettingsMany({ tenantId }, UNIT_KEYS, [{ unitId }]);
  return valsOf(r);
}
function monthsOf(P: string, uv: Vals): { rentMonth: string; utilMonth: string } {
  return {
    rentMonth: uv["rooms.billing.rentTiming"] === "ARREARS" ? addMonths(P, -1) : P,
    utilMonth: uv["rooms.billing.utilityTiming"] === "SAME_MONTH" ? P : addMonths(P, -1),
  };
}
const snapValuesOf = (v: unknown): Vals | null => (isRec(v) && isRec(v.values) ? (v.values as Vals) : null);
/** ค่าของสัญญา: snapshot ก่อน · ไม่ได้จด ⇒ ค่าปัจจุบัน */
function leaseVal(snap: Vals | null, cur: Vals, key: string): unknown {
  if (snap && Object.prototype.hasOwnProperty.call(snap, key)) return snap[key];
  return cur[key];
}
const vatOf = (bv: Vals): VatConfig => ({ registered: bv["rooms.vat.registered"] === true, pricesIncludeVat: bv["rooms.vat.pricesIncludeVat"] !== false });
function taxKindsOf(bv: Vals): Partial<Record<DormTaxSlot, TaxKind>> {
  const raw = bv["rooms.vat.taxKinds"];
  const out: Partial<Record<DormTaxSlot, TaxKind>> = {};
  if (!isRec(raw)) return out;
  for (const k of ["COMMON", "ELEC", "WATER", "SERVICE", "LATE_FEE"] as const) if (isTaxKind(raw[k])) out[k] = raw[k];
  out.RENT = "EXEMPT";
  return out;
}

// ───────────────────────── บรรทัดมือ (§3.3) ─────────────────────────
type ManualLine = { kind: "LATE_FEE" | "OTHER"; labelTh: string; amountSatang: number; note: string | null; taxKind: TaxKind | null };

/** อ่านบรรทัดมือคืนจาก DormBill.lines (meta manual = 1 · src = JSON ต้นฉบับ) */
function manualOf(lines: unknown): ManualLine[] {
  if (!Array.isArray(lines)) return [];
  const late: ManualLine[] = [];
  const other: ManualLine[] = [];
  for (const l of lines) {
    if (!isRec(l) || !isRec(l.meta) || l.meta.manual !== 1 || typeof l.meta.src !== "string") continue;
    let src: unknown = null;
    try {
      src = JSON.parse(l.meta.src);
    } catch {
      continue;
    }
    const one = (x: unknown, kind: "LATE_FEE" | "OTHER"): ManualLine | null =>
      isRec(x) && typeof x.labelTh === "string" && isNat(x.amountSatang)
        ? { kind, labelTh: x.labelTh, amountSatang: x.amountSatang, note: typeof x.note === "string" ? x.note : null, taxKind: isTaxKind(x.taxKind) ? x.taxKind : null }
        : null;
    if (l.code === "LATE_FEE" && Array.isArray(src)) for (const x of src) {
      const m = one(x, "LATE_FEE");
      if (m) late.push(m);
    }
    else if (typeof l.code === "string" && l.code.startsWith("SERVICE:MANUAL_")) {
      const m = one(src, "OTHER");
      if (m) other.push(m);
    }
  }
  return [...late, ...other];
}

function parseExtraLines(v: unknown): ManualLine[] | null {
  if (!Array.isArray(v) || v.length > MAX_EXTRA_LINES) return null;
  const out: ManualLine[] = [];
  for (const x of v) {
    if (!isRec(x)) return null;
    if (x.kind !== "LATE_FEE" && x.kind !== "OTHER") return null;
    const label = typeof x.labelTh === "string" ? x.labelTh.trim() : "";
    if ([...label].length < 1 || [...label].length > 80) return null;
    const a = x.amountSatang;
    if (typeof a !== "number" || !Number.isInteger(a) || a < 1 || a > MAX_EXTRA_SATANG) return null;
    if (x.note !== undefined && x.note !== null && typeof x.note !== "string") return null;
    const note = typeof x.note === "string" && x.note.trim() ? x.note.trim().slice(0, 120) : null;
    if (x.taxKind !== undefined && x.taxKind !== null && !isTaxKind(x.taxKind)) return null;
    out.push({ kind: x.kind, labelTh: label, amountSatang: a, note, taxKind: isTaxKind(x.taxKind) ? x.taxKind : null });
  }
  return out;
}

// ───────────────────────── คำนวณรอบ (§2) ─────────────────────────
const LEASE_SELECT = {
  id: true,
  roomId: true,
  partyId: true,
  coTenants: true,
  status: true,
  startDate: true,
  endDate: true,
  rentSatang: true,
  commonFeeSatang: true,
  advanceRentSatang: true,
  bookingFeeSatang: true,
  policySnapshot: true,
} as const;
type LeaseRec = {
  id: string;
  roomId: string;
  partyId: string;
  coTenants: Prisma.JsonValue;
  status: string;
  startDate: Date;
  endDate: Date | null;
  rentSatang: number;
  commonFeeSatang: number;
  advanceRentSatang: number;
  bookingFeeSatang: number;
  policySnapshot: Prisma.JsonValue;
};
type RoomInfo = { id: string; number: string; buildingId: string | null; roomTypeId: string };
type Calc = {
  leaseId: string;
  roomId: string;
  partyId: string;
  roomNumber: string;
  status: "DRAFT" | "HELD";
  holdReason: string | null;
  bill: DormBillResult;
  dueDate: string;
  refs: ScopeRefs;
  billRes: Record<string, Resolved>;
  manual: ManualLine[];
};
type Skipped = { leaseId: string; roomId: string; partyId: string; roomNumber: string; reason: "MOVE_OUT"; moveOutDate: string };
type RunCalc = {
  periodKey: string;
  rentMonth: string;
  utilMonth: string;
  bills: Calc[];
  skipped: Skipped[];
  usage: PeriodUsageRow[];
  rooms: Map<string, RoomInfo>;
  gate: (BillRunGate & { groups: UtilityGroup[] }) | null;
  unitVals: Vals;
};
type ComputeOpts = { only?: Set<string>; manual?: Map<string, ManualLine[]>; gate?: boolean; unitVals?: Vals };

function runGateOf(g: UtilityGate | { ok: false; code: string; reason: string }): BillRunGate & { groups: UtilityGroup[] } {
  if (!("groups" in g)) return { ok: false, blocks: [{ kind: null, buildingId: null, code: g.code, messageTh: g.reason }], needsAcceptance: [], groups: [] };
  return { ok: g.ok, blocks: g.blocks.map((x) => ({ ...x })), needsAcceptance: g.needsAcceptance.map((x) => ({ ...x })), groups: g.groups };
}

const HOLD_TH: Record<string, string> = {
  METER_HIGH: "มิเตอร์สูงกว่าปกติ — พักบิลรอตรวจเลข",
  METER_LOW: "มิเตอร์ต่ำกว่าปกติ — พักบิลรอตรวจเลข",
  METER_BACKWARDS: "เลขมิเตอร์ถอยหลัง — พักบิลรอตรวจ (เปลี่ยนมิเตอร์หรือจดผิด)",
  METER_VACANT_USAGE: "ห้องว่างมีการใช้น้ำไฟ — พักบิลรอตรวจ",
  METER_UNREADABLE: "อ่านหน่วยมิเตอร์ไม่ได้ — พักบิลรอตรวจ",
  NO_READING: "ยังไม่ได้จดมิเตอร์ของห้องนี้ — จดแล้วกดปล่อยบิล",
  BOOKING_FEE_FIRST_RENT: "บิลแรกของสัญญาที่เงินจองหักเข้าค่าห้อง — ระบบยังหักให้อัตโนมัติไม่ได้ ตรวจยอดก่อนปล่อย",
  CALC_ERROR: "คำนวณบิลห้องนี้ไม่ได้ — ตรวจค่าตั้งน้ำไฟและสัญญา",
  // SVC D.3 ▸ (T1) ข้อมูลผู้ซื้อสำหรับใบกำกับภาษีไม่ผ่าน — บอกว่าต้องแก้อะไร ◂
  BUYER_TAX_ID_INVALID: "เลขประจำตัวผู้เสียภาษีของผู้เช่าไม่ถูกต้อง (13 หลัก) — แก้ข้อมูลผู้เช่าแล้วกดปล่อยบิล",
  "BUYER_TAX_ID_INVALID:BRANCH": "รหัสสาขาของผู้เช่าไม่ถูกต้อง (ตัวเลข 5 หลัก · สำนักงานใหญ่ = 00000) — แก้ข้อมูลผู้เช่าแล้วกดปล่อยบิล",
  "BUYER_TAX_ID_INVALID:OTHER": "ข้อมูลผู้เช่าสำหรับใบกำกับภาษีไม่ครบ/ไม่ถูกต้อง — แก้ข้อมูลผู้เช่าแล้วกดปล่อยบิล",
};
export function holdReasonTh(code: string | null): string {
  if (!code) return "";
  const k = code.split(":")[0];
  return HOLD_TH[code] ?? HOLD_TH[k] ?? "พักบิลรอตรวจ"; // SVC D.3 ▸ รหัสเต็มก่อน (BUYER_TAX_ID_INVALID:BRANCH) ◂
}

function flagOfRoom(usage: PeriodUsageRow[], roomId: string, heldOnly: boolean): { flag: string; held: boolean } | null {
  const mine = usage.filter((u) => u.role === "ROOM" && u.roomId === roomId && u.flag !== null && (!heldOnly || u.held));
  if (!mine.length) return null;
  mine.sort((a, b) => FLAG_ORDER.indexOf(String(a.flag)) - FLAG_ORDER.indexOf(String(b.flag)));
  return { flag: String(mine[0].flag), held: mine.some((u) => u.held) };
}
function pickUsage(usage: PeriodUsageRow[], roomId: string, kind: Kind): PeriodUsageRow | null {
  const mine = usage.filter((u) => u.role === "ROOM" && u.roomId === roomId && u.kind === kind);
  return mine.find((u) => u.value !== null) ?? mine[0] ?? null;
}
const occupantsOf = (v: Prisma.JsonValue): number => (isRec(v) && Array.isArray(v.occupants) ? v.occupants.filter((o) => isRec(o)).length : 0);

type ReadRec = { meterId: string; periodKey: string; value: number; readAt: Date };
type MoveInRec = { meterId: string; leaseId: string | null; value: number; readAt: Date };

/** แกนคำนวณ — ไม่เขียนอะไร · คำนวณสดทุกครั้ง */
async function computeRun(tenantId: string, unitId: string, P: string, issueYmd: string, opts: ComputeOpts = {}): Promise<RunCalc> {
  const db = tenantDb({ tenantId, unitId });
  const uv = opts.unitVals ?? (await unitValsOf(tenantId, unitId));
  const { rentMonth, utilMonth } = monthsOf(P, uv);
  const rentStart = `${rentMonth}-01`;
  const rentEnd = monthEnd(rentMonth);
  const utilStart = `${utilMonth}-01`;
  const utilEnd = monthEnd(utilMonth);
  const winStart = minS(utilStart, rentStart);
  const winEnd = maxS(utilEnd, rentEnd);
  const uctx = { tenantId };
  const [leasesAll, roomRows, uc, usage, held, gateRaw, existing] = await Promise.all([
    db.dormLease.findMany({
      where: { status: { in: ["ACTIVE", "NOTICE"] }, startDate: { lte: dbDate(winEnd) }, OR: [{ endDate: null }, { endDate: { gte: dbDate(winStart) } }] },
      select: LEASE_SELECT,
    }),
    db.hotelRoom.findMany({ select: { id: true, number: true, buildingId: true, roomTypeId: true } }),
    utilityCharges(uctx, { unitId, periodKey: utilMonth }),
    periodUsage(uctx, { unitId, periodKey: utilMonth }),
    heldRooms(uctx, { unitId, periodKey: utilMonth }),
    opts.gate === false ? Promise.resolve(null) : utilityBillingGate(uctx, { unitId, periodKey: utilMonth }),
    db.dormBill.findMany({ where: { periodKey: P }, select: { leaseId: true, lines: true } }),
  ]);
  const leases: LeaseRec[] = opts.only ? leasesAll.filter((l) => opts.only?.has(l.id)) : leasesAll;
  const rooms = new Map<string, RoomInfo>(roomRows.map((r) => [r.id, r]));
  const ids = leases.map((l) => l.id);
  const [moveOuts, others, moveIns] = ids.length
    ? await Promise.all([
        db.dormMoveOut.findMany({ where: { leaseId: { in: ids }, status: { not: "CANCELLED" } }, select: { leaseId: true, moveOutDate: true } }),
        db.dormBill.findMany({ where: { leaseId: { in: ids }, periodKey: { lt: P }, status: { not: "VOID" } }, select: { leaseId: true }, distinct: ["leaseId"] }),
        db.dormMeterReading.findMany({ where: { kind: "MOVE_IN", leaseId: { in: ids } }, select: { meterId: true, leaseId: true, value: true, readAt: true } }),
      ])
    : [[], [], []];
  const moveOutOf = new Map(moveOuts.map((m) => [m.leaseId, ymdOf(m.moveOutDate) ?? ""]));
  const badBuyers = await badBuyerTaxIds(tenantId, leases.map((l) => l.partyId)); // SVC D.3
  const hasOther = new Set(others.map((o) => o.leaseId));
  const reads: ReadRec[] = moveIns.length
    ? await db.dormMeterReading.findMany({
        where: { meterId: { in: [...new Set(moveIns.map((m) => m.meterId))] }, kind: "PERIOD", periodKey: { lte: utilMonth } },
        select: { meterId: true, periodKey: true, value: true, readAt: true },
      })
    : [];
  const manualStored = new Map(existing.map((b) => [b.leaseId, manualOf(b.lines)]));
  const rowOf = new Map<string, UtilityChargeRow>();
  for (const r of uc.rows) rowOf.set(`${r.roomId}|${r.kind}`, r);
  const heldSet = new Set(held);

  // ค่าตั้งต่อสัญญา (ห้อง/ประเภท/อาคาร/สัญญา) — batch เดียว
  const eligible: { l: LeaseRec; room: RoomInfo }[] = [];
  const skipped: Skipped[] = [];
  for (const l of leases) {
    const room = rooms.get(l.roomId);
    if (!room) continue;
    const mo = moveOutOf.get(l.id);
    if (mo && mo <= rentEnd) {
      skipped.push({ leaseId: l.id, roomId: l.roomId, partyId: l.partyId, roomNumber: room.number, reason: "MOVE_OUT", moveOutDate: mo });
      continue;
    }
    const s = ymdOf(l.startDate) ?? "";
    const e = ymdOf(l.endDate);
    if (s > rentEnd || (e !== null && e < rentStart)) continue;
    eligible.push({ l, room });
  }
  const refsList: ScopeRefs[] = eligible.map(({ l, room }) => ({
    unitId,
    ...(room.buildingId ? { buildingId: room.buildingId } : {}),
    roomTypeId: room.roomTypeId,
    roomId: room.id,
    leaseId: l.id,
  }));
  const keys = [...new Set([...billKeys(), ...LEASE_KEYS])];
  const resolved = refsList.length ? await resolveSettingsMany({ tenantId }, keys, refsList) : [];

  const bills: Calc[] = [];
  eligible.forEach(({ l, room }, i) => {
    const res = resolved[i] ?? {};
    const cur = valsOf(res);
    const snap = snapValuesOf(l.policySnapshot);
    const lv = (k: string) => leaseVal(snap, cur, k);
    const bv = cur; // วิธีคิดน้ำไฟ/VAT ณ ตอนออก = ค่าปัจจุบัน
    const vat = vatOf(bv);
    const taxKinds = taxKindsOf(bv);
    const start = ymdOf(l.startDate) ?? rentStart;
    const end = ymdOf(l.endDate);
    const manual = opts.manual?.get(l.id) ?? manualStored.get(l.id) ?? [];
    const firstBill = !hasOther.has(l.id);

    // ค่าห้อง: ครบเดือน = ตามสัญญา · ไม่ครบ = เศษวันตามวิธีของสัญญา
    const full = start <= rentStart && (end === null || end >= rentEnd);
    const pmode = lv("rooms.billing.prorate");
    const mode = pmode === "DIV_30" || pmode === "FULL_MONTH" ? pmode : "ACTUAL_DAYS";
    const rent = full
      ? l.rentSatang
      : prorate({ monthlySatang: l.rentSatang, days: occupiedDays({ periodStart: rentStart, periodEnd: rentEnd, moveIn: start, moveOut: end }), daysInMonth: dimOf(rentMonth), mode });

    // ค่าน้ำไฟ: แถว OK ของห้อง (สัญญาต้องซ้อนงวดน้ำไฟ) · MOVE_IN ⇒ เลขงวดนี้ − เลขวันเข้า
    let hold: string | null = null;
    const utilIn: Partial<Record<Kind, { amount: number; qty: number | null; rate: number | null; meta: Record<string, number> | null }>> = {};
    const overlapsUtil = start <= utilEnd && (end === null || end >= utilStart);
    const meterFlag = heldSet.has(room.id) ? flagOfRoom(usage, room.id, true) : null;
    if (overlapsUtil) {
      for (const kind of KINDS) {
        const row = rowOf.get(`${room.id}|${kind}`);
        if (!row || row.status === "NONE") continue;
        if (row.status === "NO_READING") {
          hold = hold ?? "NO_READING";
          continue;
        }
        if (row.status === "HELD") {
          hold = hold ?? (meterFlag ? `METER_${meterFlag.flag}` : row.code ?? "METER_UNREADABLE");
          continue;
        }
        if (row.status !== "OK" || row.amountSatang === null) continue; // ไม่มีฐานคิด ⇒ ด่าน D.7 บล็อกการส่ง
        const u = pickUsage(usage, room.id, kind);
        const segs = u?.segments ?? [];
        let amount = row.amountSatang;
        let qty = row.units;
        // หน่วย (+ เลขมิเตอร์เมื่อมีช่วง) — บรรทัดที่ไม่มีช่วงก็ยังแสดง "หน่วย × อัตรา" ได้ (กฎหมายให้แสดง)
        let meta: Record<string, number> | null =
          row.units !== null
            ? segs.length
              ? { units: row.units, from: segs[0].start, to: segs[segs.length - 1].end, segments: segs.length }
              : { units: row.units }
            : null;
        if (u && row.rateSatangPerUnit !== null && (row.method === "ACTUAL_COST" || row.method === "FIXED_RATE")) {
          const mi = moveIns.find((m: MoveInRec) => m.leaseId === l.id && m.meterId === u.meterId);
          if (mi) {
            const mine = reads.filter((r) => r.meterId === u.meterId);
            const curRead = mine.find((r) => r.periodKey === utilMonth) ?? null;
            const prevRead = mine.filter((r) => r.periodKey < utilMonth).sort((a, b) => a.readAt.getTime() - b.readAt.getTime()).pop() ?? null;
            if (curRead && mi.readAt.getTime() <= curRead.readAt.getTime() && (!prevRead || mi.readAt.getTime() > prevRead.readAt.getTime()) && curRead.value >= mi.value) {
              const minimum = isNat(bv["rooms.utility.minimum"]) ? (bv["rooms.utility.minimum"] as number) : null;
              const line = utilityLine(
                { kind: "METERED", segments: [{ start: mi.value, end: curRead.value }], method: { kind: "FIXED_RATE", satangPerUnit: row.rateSatangPerUnit }, minimumSatang: minimum },
                (taxKinds[kind] ?? "VAT7") === "VAT7" ? vat : null,
              );
              amount = line.amountSatang;
              qty = line.qty;
              meta = { units: line.qty, from: mi.value, to: curRead.value, segments: 1, moveIn: 1 };
            }
          }
        }
        utilIn[kind] = { amount, qty, rate: row.rateSatangPerUnit, meta };
      }
    }
    if (meterFlag && !hold) hold = `METER_${meterFlag.flag}`;

    // ค่าบริการจาก snapshot สัญญา (บังคับเท่านั้น) · ค่าคนพักเพิ่ม · ค่าเช่าล่วงหน้า (บิลแรก) · บรรทัดมือ
    const services: { code: string; labelTh: string; amountSatang: number; taxKind?: TaxKind }[] = [];
    const catalog = lv("rooms.services.catalog");
    if (Array.isArray(catalog)) {
      for (const c of catalog) {
        if (!isRec(c) || c.required !== true || typeof c.code !== "string" || typeof c.labelTh !== "string" || !isNat(c.amountSatang)) continue;
        services.push({ code: c.code, labelTh: c.labelTh, amountSatang: c.amountSatang, ...(isTaxKind(c.taxKind) ? { taxKind: c.taxKind } : {}) });
      }
    }
    const extraFee = lv("rooms.services.extraOccupantFee");
    const occ = occupantsOf(l.coTenants);
    if (isNat(extraFee) && extraFee > 0 && occ > 0) services.push({ code: "EXTRA_OCCUPANT", labelTh: `ค่าคนพักเพิ่ม (${occ} คน)`, amountSatang: extraFee * occ });
    if (firstBill && l.advanceRentSatang > 0) services.push({ code: "ADVANCE_RENT", labelTh: "ค่าเช่าล่วงหน้า", amountSatang: l.advanceRentSatang, taxKind: "EXEMPT" });
    const others2 = manual.filter((m) => m.kind === "OTHER");
    others2.forEach((m, k) => services.push({ code: `MANUAL_${k + 1}`, labelTh: m.labelTh, amountSatang: m.amountSatang, ...(m.taxKind ? { taxKind: m.taxKind } : {}) }));
    const lates = manual.filter((m) => m.kind === "LATE_FEE");
    const lateSum = lates.reduce((s, m) => s + m.amountSatang, 0);

    if (!hold && firstBill && lv("rooms.lease.reservationAppliesTo") === "FIRST_RENT" && l.bookingFeeSatang > 0) hold = "BOOKING_FEE_FIRST_RENT";

    let bill: DormBillResult;
    try {
      const built = buildDormBill({
        rentSatang: rent,
        commonFeeSatang: l.commonFeeSatang,
        electricity: utilIn.ELEC ? { kind: "ALLOCATED", amountSatang: utilIn.ELEC.amount } : null,
        water: utilIn.WATER ? { kind: "ALLOCATED", amountSatang: utilIn.WATER.amount } : null,
        lateFeeSatang: lateSum,
        services,
        taxKinds,
        vat,
      });
      // ส่วนที่ไม่ใช่เงิน (หน่วย · อัตรา · เลขมิเตอร์ · ที่มาของบรรทัดมือ) — ยอด/VAT ของทุกบรรทัดคงเดิมจาก buildDormBill
      const lines: DormBillLine[] = built.lines.map((ln) => {
        if (ln.code === "ELEC" || ln.code === "WATER") {
          const u = utilIn[ln.code];
          if (!u || u.qty === null) return ln;
          const next: DormBillLine = { ...ln, qty: u.qty, unitPriceSatang: u.rate };
          if (u.meta) next.meta = u.meta;
          return next;
        }
        if (ln.code === "LATE_FEE" && lates.length) {
          const notes = lates.map((m) => m.note).filter((x): x is string => !!x);
          return { ...ln, meta: { manual: 1, ...(notes.length ? { note: notes.join(" · ") } : {}), src: JSON.stringify(lates.map((m) => ({ labelTh: m.labelTh, amountSatang: m.amountSatang, note: m.note }))) } };
        }
        const mm = /^SERVICE:MANUAL_(\d+)$/.exec(ln.code);
        if (mm) {
          const m = others2[Number(mm[1]) - 1];
          if (m) return { ...ln, meta: { manual: 1, ...(m.note ? { note: m.note } : {}), src: JSON.stringify({ labelTh: m.labelTh, amountSatang: m.amountSatang, note: m.note, taxKind: m.taxKind }) } };
        }
        return ln;
      });
      bill = { ...built, lines };
    } catch (e) {
      void logFail("compute", tenantId, e);
      bill = { lines: [], subtotalSatang: 0, vatSatang: 0, totalSatang: 0 };
      hold = hold ?? "CALC_ERROR";
    }
    // SVC D.3 ▸ บิลที่ต้องมีใบกำกับภาษี (จด VAT · มียอด VAT) แต่เลขผู้เสียภาษีของผู้เช่าไม่ผ่าน checksum ⇒ พักไว้ (แก้ Party แล้วปล่อย) ◂
    if (!hold && vat.registered && bill.vatSatang > 0 && badBuyers.has(l.partyId)) hold = badBuyers.get(l.partyId) ?? "BUYER_TAX_ID_INVALID";

    // วันครบกำหนด = <เดือนรอบ>-<dueDay ของสัญญา> (ตัดสิ้นเดือน) · ก่อนวันออก ⇒ วันออก
    const dd = lv("rooms.billing.dueDay");
    const dueDay = isNat(dd) && dd >= 1 ? Math.min(dd, dimOf(P)) : Math.min(5, dimOf(P));
    let due = `${P}-${pad2(dueDay)}`;
    if (due < issueYmd) due = issueYmd;

    bills.push({
      leaseId: l.id,
      roomId: room.id,
      partyId: l.partyId,
      roomNumber: room.number,
      status: hold ? "HELD" : "DRAFT",
      holdReason: hold,
      bill,
      dueDate: due,
      refs: refsList[i],
      billRes: res,
      manual,
    });
  });
  bills.sort((a, b) => numCmp(a.roomNumber, b.roomNumber));
  skipped.sort((a, b) => numCmp(a.roomNumber, b.roomNumber));
  return {
    periodKey: P,
    rentMonth,
    utilMonth,
    bills,
    skipped,
    usage,
    rooms,
    gate: gateRaw ? runGateOf(gateRaw) : null,
    unitVals: uv,
  };
}

/** รูปเทียบ "เท่าเดิม" ของบิล (ไม่รวม snapshot — เวลาใน snapshot เปลี่ยนทุกครั้ง) */
type BillShape = { status: string; holdReason: string | null; lines: unknown; subtotalSatang: number; vatSatang: number; totalSatang: number; dueDate: string | null };
const shapeOfCalc = (c: Calc): BillShape => ({
  status: c.status,
  holdReason: c.holdReason,
  lines: c.bill.lines,
  subtotalSatang: c.bill.subtotalSatang,
  vatSatang: c.bill.vatSatang,
  totalSatang: c.bill.totalSatang,
  dueDate: c.dueDate,
});
const shapeOfRow = (b: { status: string; holdReason: string | null; lines: Prisma.JsonValue; subtotalSatang: number; vatSatang: number; totalSatang: number; dueDate: Date | null }): BillShape => ({
  status: b.status,
  holdReason: b.holdReason,
  lines: b.lines,
  subtotalSatang: b.subtotalSatang,
  vatSatang: b.vatSatang,
  totalSatang: b.totalSatang,
  dueDate: ymdOf(b.dueDate),
});

/** snapshot "bill" ต่อบิล — คำนวณ snapshotPolicy ครั้งเดียวต่อกลุ่มค่าที่ resolve ได้เหมือนกันทุกตัว (ค่า+ที่มา) */
async function billSnapshots(tenantId: string, bills: Calc[]): Promise<Map<string, PolicySnapshot>> {
  const keys = billKeys();
  const groups = new Map<string, Calc[]>();
  for (const c of bills) {
    const sig = canon(keys.map((k) => [c.billRes[k]?.value ?? null, c.billRes[k]?.source ?? null, c.billRes[k]?.scopeId ?? null]));
    groups.set(sig, [...(groups.get(sig) ?? []), c]);
  }
  const out = new Map<string, PolicySnapshot>();
  for (const list of groups.values()) {
    const snap = await snapshotPolicy({ tenantId }, "bill", list[0].refs);
    for (const c of list) out.set(c.leaseId, snap);
  }
  return out;
}

type BillWriteRow = {
  id: string;
  leaseId: string;
  status: string;
  holdReason: string | null;
  lines: Prisma.JsonValue;
  subtotalSatang: number;
  vatSatang: number;
  totalSatang: number;
  dueDate: Date | null;
  sentVia: string | null;
};
const BILL_WRITE_SELECT = { id: true, leaseId: true, status: true, holdReason: true, lines: true, subtotalSatang: true, vatSatang: true, totalSatang: true, dueDate: true, sentVia: true } as const;
const billData = (c: Calc, snap: PolicySnapshot | undefined) => ({
  status: c.status,
  holdReason: c.holdReason,
  lines: c.bill.lines as unknown as Prisma.InputJsonValue,
  subtotalSatang: c.bill.subtotalSatang,
  vatSatang: c.bill.vatSatang,
  totalSatang: c.bill.totalSatang,
  dueDate: dbDate(c.dueDate),
  ...(snap ? { policySnapshot: snap as unknown as Prisma.InputJsonValue } : {}),
});

/** ยอดรอบ = Σ บิลที่ไม่ใช่ HELD/VOID — เขียนเฉพาะเมื่อต่าง */
async function refreshRunTotals(tx: Tx, tenantId: string, unitId: string, runId: string): Promise<{ billCount: number; totalSatang: number; heldCount: number }> {
  const [agg, heldCount, run] = [
    await tx.dormBill.aggregate({ where: { tenantId, unitId, runId, status: { notIn: ["HELD", "VOID"] } }, _sum: { totalSatang: true }, _count: { _all: true } }),
    await tx.dormBill.count({ where: { tenantId, unitId, runId, status: "HELD" } }),
    await tx.dormBillRun.findFirst({ where: { id: runId, tenantId, unitId }, select: { billCount: true, totalSatang: true } }),
  ];
  const billCount = agg._count._all;
  const totalSatang = agg._sum.totalSatang ?? 0;
  if (run && (run.billCount !== billCount || run.totalSatang !== totalSatang)) {
    await tx.dormBillRun.updateMany({ where: { id: runId, tenantId, unitId }, data: { billCount, totalSatang } });
  }
  return { billCount, totalSatang, heldCount };
}

// ───────────────────────── Σ ค่าน้ำไฟตอนออกจริง (หนี้ D.7 (5)) ─────────────────────────
/** ต่อกลุ่ม (kind × ขอบเขตบิล) ที่มีบิลการไฟฟ้า/ประปา: Σ grossSatang ของบิลในรอบ ≤ บิล ผ่าน evaluateLegal */
function sumCheck(groups: UtilityGroup[], rooms: Map<string, RoomInfo>, bills: { roomId: string; lines: unknown }[], outOfScopeReason: unknown): BillGateItem[] {
  const items: BillGateItem[] = [];
  const withBill = groups.filter((g) => g.billSatang !== null);
  if (!withBill.length) return items;
  const scopeOf = (kind: Kind, roomId: string): UtilityGroup | null => {
    const b = rooms.get(roomId)?.buildingId ?? null;
    return (b ? withBill.find((g) => g.kind === kind && g.buildingId === b) : undefined) ?? withBill.find((g) => g.kind === kind && g.buildingId === null) ?? null;
  };
  const sums = new Map<UtilityGroup, number>();
  for (const b of bills) {
    if (!Array.isArray(b.lines)) continue;
    for (const l of b.lines) {
      if (!isRec(l) || (l.code !== "ELEC" && l.code !== "WATER") || !isNat(l.grossSatang)) continue;
      const g = scopeOf(l.code, b.roomId);
      if (g) sums.set(g, (sums.get(g) ?? 0) + l.grossSatang);
    }
  }
  for (const [g, total] of sums) {
    const o = evaluateLegal(
      "UTIL_TOTAL_LE_BILL",
      { chargedTotalSatang: total, authorityBillSatang: g.billSatang },
      { mode: normalizeLegalMode(g.legal.mode), outOfScopeReason: typeof outOfScopeReason === "string" ? outOfScopeReason : null },
    );
    if (o.level === "BLOCK" || (o.level === "WARN" && !g.legal.accepted)) {
      items.push({ kind: g.kind, buildingId: g.buildingId, code: "UTIL_TOTAL_EXCEEDS_BILL", messageTh: o.messageTh, ruleId: "UTIL_TOTAL_LE_BILL" });
    }
  }
  return items;
}

// ───────────────────────── 3.1 เตรียมรอบ ─────────────────────────
export async function prepareBillRun(ctx: BillingCtx, input: { unitId: string; periodKey: string }, deps?: { now?: Date }): Promise<PrepareBillRunResult> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.bill.run");
    if (!g) return NOT_FOUND();
    return await prepareInternal(g, isRec(input) ? input.periodKey : null, deps?.now instanceof Date ? deps.now : new Date());
  } catch (e) {
    await logFail("prepare", isRec(ctx) ? ctx.tenantId : null, e);
    return INTERNAL();
  }
}

async function prepareInternal(g: G, periodKey: unknown, now: Date): Promise<PrepareBillRunResult> {
  if (typeof periodKey !== "string" || !PERIOD_RE.test(periodKey)) return fail("INVALID_INPUT", "งวดต้องเป็นรูปแบบ ปี-เดือน เช่น 2026-11");
  const P = periodKey;
  if (P < MIN_PERIOD || P > addMonths(bkkYmd(now).slice(0, 7), 2)) return fail("BAD_PERIOD", "งวดต้องอยู่ระหว่าง 2020-01 ถึงอีก 2 เดือนข้างหน้า");
  const { tenantId, unitId } = g;
  const db = tenantDb({ tenantId, unitId });
  const [run0, uv] = await Promise.all([db.dormBillRun.findFirst({ where: { periodKey: P }, select: { issueDate: true } }), unitValsOf(tenantId, unitId)]);
  const issueYmd = ymdOf(run0?.issueDate) ?? bkkYmd(now);
  const calc = await computeRun(tenantId, unitId, P, issueYmd, { unitVals: uv });
  const snaps = await billSnapshots(tenantId, calc.bills);

  const res = await retryOnce(() =>
    db.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      await advisoryLock(tx, runLockKey(unitId, P));
      let run = await tx.dormBillRun.findFirst({ where: { tenantId, unitId, periodKey: P }, select: { id: true, status: true } });
      let created = false;
      if (!run) {
        run = await tx.dormBillRun.create({
          data: { tenantId, unitId, periodKey: P, status: "DRAFT", issueDate: dbDate(issueYmd), createdById: g.actorUserId },
          select: { id: true, status: true },
        });
        created = true;
      }
      const runId = run.id;
      const status = run.status;
      const existing: BillWriteRow[] = await tx.dormBill.findMany({ where: { tenantId, unitId, periodKey: P }, select: BILL_WRITE_SELECT });
      const exOf = new Map(existing.map((b) => [b.leaseId, b]));
      let added = 0;
      let changed = 0;
      const creates: Prisma.DormBillCreateManyInput[] = [];
      for (const c of calc.bills) {
        const ex = exOf.get(c.leaseId);
        if (!ex) {
          creates.push({ tenantId, unitId, runId, leaseId: c.leaseId, roomId: c.roomId, partyId: c.partyId, periodKey: P, ...billData(c, snaps.get(c.leaseId)) });
          added++;
          continue;
        }
        // คำนวณใหม่ได้: HELD · DRAFT ที่ยังไม่ถูกจองส่ง (มติผู้คุม F2: รอบ REVIEW/SENT ก็ได้ — ยังไม่มีใบแจ้งหนี้ของ ref)
        //   บิลที่ถูกจองส่งแล้ว (sentVia = sending:…) อาจมีใบแจ้งหนี้แล้ว ⇒ ห้ามแตะ (F1/F11)
        const editable = (ex.status === "HELD" || ex.status === "DRAFT") && !isSendClaim(ex.sentVia);
        if (!editable) continue;
        if (canon(shapeOfRow(ex)) === canon(shapeOfCalc(c))) continue;
        if (canon(manualOf(ex.lines)) !== canon(c.manual)) continue; // บรรทัดมือถูกแก้ระหว่างคำนวณ — ปล่อยให้รอบหน้าคำนวณ
        const u = await tx.dormBill.updateMany({ where: { id: ex.id, tenantId, unitId, status: ex.status, sentVia: null }, data: billData(c, snaps.get(c.leaseId)) });
        changed += u.count;
      }
      if (status === "DRAFT") {
        const keep = new Set(calc.bills.map((c) => c.leaseId));
        const gone = existing.filter((b) => !keep.has(b.leaseId) && (b.status === "DRAFT" || b.status === "HELD") && !isSendClaim(b.sentVia)).map((b) => b.id);
        if (gone.length) {
          const del = await tx.dormBill.deleteMany({ where: { id: { in: gone }, tenantId, unitId, status: { in: ["DRAFT", "HELD"] }, accountDocumentId: null, sentVia: null } });
          changed += del.count;
        }
      }
      if (creates.length) await tx.dormBill.createMany({ data: creates, skipDuplicates: true });
      // F19: จดค่า autoSend ของหน่วย ณ ตอนเตรียมไว้ในรอบ — งานตามเวลากรองรอบที่ต้องส่งจริงได้ใน SQL (เขียนเฉพาะเมื่อเปลี่ยน)
      const auto = calc.unitVals["rooms.billing.autoSend"] === true;
      const pr = await tx.dormBillRun.findFirst({ where: { id: runId, tenantId, unitId }, select: { progress: true } });
      const prog: Record<string, unknown> = isRec(pr?.progress) ? { ...(pr?.progress as Record<string, unknown>) } : {};
      if ((prog.autoSend === true) !== auto) {
        if (auto) prog.autoSend = true;
        else delete prog.autoSend;
        await tx.dormBillRun.updateMany({ where: { id: runId, tenantId, unitId }, data: { progress: prog as Prisma.InputJsonValue } });
      }
      const tot = await refreshRunTotals(tx, tenantId, unitId, runId);
      return { runId, created, status, added, changed, ...tot };
    }, TX_OPTS),
  );
  if (res === "BUSY") return BUSY();

  // ด่าน = D.7 + Σ ของบิลในรอบ (ไม่ใช่ HELD/VOID)
  const live = await db.dormBill.findMany({ where: { runId: res.runId, status: { notIn: ["HELD", "VOID"] } }, select: { roomId: true, lines: true } });
  const base = calc.gate ?? { ok: false, blocks: [], needsAcceptance: [], groups: [] };
  const extra = sumCheck(base.groups, calc.rooms, live, calc.unitVals["rooms.legal.outOfScopeReason"]);
  // SVC D.3 ▸ ผู้ขายไม่มีเลขผู้เสียภาษี (หอจด VAT + สมุดจด VAT) ⇒ บล็อกการส่ง ◂
  const seller = await sellerTaxProblem(tenantId, unitId);
  if (seller) extra.push({ kind: null, buildingId: null, code: seller.code, messageTh: seller.messageTh });
  const gate: BillRunGate = { ok: base.ok && extra.length === 0, blocks: [...base.blocks, ...extra], needsAcceptance: base.needsAcceptance };
  return {
    ok: true,
    runId: res.runId,
    created: res.created,
    status: res.status as BillRunStatus,
    utilityPeriodKey: calc.utilMonth,
    billCount: res.billCount,
    heldCount: res.heldCount,
    added: res.added,
    changed: res.changed,
    totalSatang: res.totalSatang,
    skipped: calc.skipped.map((s) => ({ leaseId: s.leaseId, roomNumber: s.roomNumber, reason: s.reason })),
    gate,
  };
}

// ───────────────────────── 3.2 · 3.3 แก้บิลเดี่ยว (บรรทัดมือ · ปล่อยพัก) ─────────────────────────
type BillRec = {
  id: string;
  runId: string;
  leaseId: string;
  roomId: string;
  partyId: string;
  periodKey: string;
  status: string;
  holdReason: string | null;
  lines: Prisma.JsonValue;
  subtotalSatang: number;
  vatSatang: number;
  totalSatang: number;
  dueDate: Date | null;
  accountDocumentId: string | null;
  paymentRequestId: string | null;
  sentVia: string | null;
  sentAt: Date | null;
  policySnapshot: Prisma.JsonValue;
};
const BILL_SELECT = {
  id: true,
  runId: true,
  leaseId: true,
  roomId: true,
  partyId: true,
  periodKey: true,
  status: true,
  holdReason: true,
  lines: true,
  subtotalSatang: true,
  vatSatang: true,
  totalSatang: true,
  dueDate: true,
  accountDocumentId: true,
  paymentRequestId: true,
  sentVia: true,
  sentAt: true,
  policySnapshot: true,
} as const;

async function readBill(g: G, billId: unknown): Promise<BillRec | null> {
  if (!isStr(billId)) return null;
  return tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormBill.findFirst({ where: { id: billId }, select: BILL_SELECT });
}

/**
 * ค่าปรับมือ (§3.3 · F15): สัญญาไม่มีค่าปรับ (kind NONE) ⇒ ใส่ไม่ได้ · เพดานต่อบิลของ snapshot (ไม่ null) ⇒ LATE_FEE_OVER_CAP ·
 *   เพดานว่าง (ไม่จำกัดตามสัญญา) ⇒ ตัวตรวจกลาง LATE_FEE_CAP (evaluateLegal) + กันพิมพ์ผิด: ไม่เกินค่าเช่า 1 เดือนของสัญญา (เพดานจริง = D.11)
 */
function lateFeeCheck(snap: Vals | null, cur: Vals, rentSatang: number, lateSum: number): Fail | null {
  if (lateSum <= 0) return null;
  if (leaseVal(snap, cur, "rooms.lateFee.kind") === "NONE") return fail("LATE_FEE_NOT_IN_LEASE", "สัญญานี้ไม่มีข้อตกลงค่าปรับชำระล่าช้า — เรียกเก็บค่าปรับไม่ได้");
  const cap = leaseVal(snap, cur, "rooms.lateFee.capPerBill");
  const thb = (n: number) => `฿${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  if (isNat(cap)) return lateSum > cap ? fail("LATE_FEE_OVER_CAP", `ค่าปรับรวมเกินเพดานต่อบิลตามสัญญา (${thb(cap)}) — ลดยอดค่าปรับลง`) : null;
  const o = evaluateLegal("LATE_FEE_CAP", { feeSatang: lateSum }, { mode: normalizeLegalMode(cur["rooms.legal.mode"]), outOfScopeReason: null });
  if (o.level === "BLOCK" && o.code !== "OUT_OF_SCOPE_REASON_REQUIRED") return fail("LATE_FEE_OVER_CAP", o.messageTh);
  if (rentSatang > 0 && lateSum > rentSatang) return fail("LATE_FEE_OVER_CAP", `ค่าปรับรวม ${thb(lateSum)} เกินค่าเช่า 1 เดือน (${thb(rentSatang)}) — ตรวจยอดที่กรอก`);
  return null;
}

/** คำนวณบิลเดี่ยวใหม่แล้วเขียนใต้ล็อกของรอบ (บิลต้องยังเป็น DRAFT/HELD) */
async function rewriteOne(g: G, bill: BillRec, manual: ManualLine[] | null, check: (c: Calc) => Fail | null): Promise<{ ok: true; calc: Calc } | Fail> {
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const run = await db.dormBillRun.findFirst({ where: { id: bill.runId }, select: { issueDate: true } });
  if (!run) return NOT_FOUND();
  const calc = await computeRun(g.tenantId, g.unitId, bill.periodKey, ymdOf(run.issueDate) ?? bill.periodKey, {
    only: new Set([bill.leaseId]),
    ...(manual ? { manual: new Map([[bill.leaseId, manual]]) } : {}),
    gate: false,
  });
  const c = calc.bills.find((x) => x.leaseId === bill.leaseId);
  if (!c) return fail("NOT_IN_RUN", "สัญญานี้ไม่อยู่ในรอบบิลนี้แล้ว (ย้ายออก/สิ้นสุด) — กดเตรียมรอบใหม่");
  const bad = check(c);
  if (bad) return bad;
  const snaps = await billSnapshots(g.tenantId, [c]);
  const res = await retryOnce(() =>
    db.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      await advisoryLock(tx, runLockKey(g.unitId, bill.periodKey));
      const cur = await tx.dormBill.findFirst({ where: { id: bill.id, tenantId: g.tenantId, unitId: g.unitId }, select: BILL_WRITE_SELECT });
      if (!cur || (cur.status !== "DRAFT" && cur.status !== "HELD")) return "SENT" as const;
      // F1 (ข): แก้ DRAFT ได้เฉพาะรอบ DRAFT และยังไม่ถูกจองส่ง · HELD แก้ได้เสมอ (ยังไม่เคยจอง)
      if (isSendClaim(cur.sentVia)) return "LOCKED" as const;
      if (cur.status === "DRAFT") {
        const r = await tx.dormBillRun.findFirst({ where: { id: bill.runId, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true } });
        if (r?.status !== "DRAFT") return "LOCKED" as const;
      }
      if (canon(shapeOfRow(cur)) !== canon(shapeOfCalc(c))) {
        await tx.dormBill.updateMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId, status: cur.status, sentVia: null }, data: billData(c, snaps.get(c.leaseId)) });
        await refreshRunTotals(tx, g.tenantId, g.unitId, bill.runId);
      }
      return "OK" as const;
    }, TX_OPTS),
  );
  if (res === "BUSY") return BUSY();
  if (res === "SENT") return fail("BILL_SENT", "บิลนี้ส่งแล้ว — แก้หลังส่งได้ด้วยใบลดหนี้/เพิ่มหนี้เท่านั้น");
  if (res === "LOCKED") return BILL_LOCKED();
  return { ok: true, calc: c };
}

export async function setBillExtraLines(
  ctx: BillingCtx,
  input: { unitId: string; billId: string; lines: ExtraLineInput[] },
): Promise<{ ok: true; totalSatang: number } | Fail> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.bill.run");
    if (!g) return NOT_FOUND();
    const lines = parseExtraLines(isRec(input) ? input.lines : null);
    if (!lines) return fail("INVALID_INPUT", "รายการเพิ่มไม่ถูกต้อง — สูงสุด 10 รายการ · ชื่อ 1–80 ตัวอักษร · ยอดเป็นจำนวนเต็มสตางค์ 1 ถึง 1,000,000 บาท");
    const bill = await readBill(g, input.billId);
    if (!bill) return NOT_FOUND();
    if (bill.status !== "DRAFT" && bill.status !== "HELD") return fail("BILL_SENT", "บิลนี้ส่งแล้ว — แก้หลังส่งได้ด้วยใบลดหนี้/เพิ่มหนี้เท่านั้น");
    if (isSendClaim(bill.sentVia)) return BILL_LOCKED();
    if (bill.status === "DRAFT") {
      const run = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormBillRun.findFirst({ where: { id: bill.runId }, select: { status: true } });
      if (run?.status !== "DRAFT") return BILL_LOCKED();
    }
    // F15: ค่าปรับต้องลงช่อง LATE_FEE (ไม่ให้แฝงเป็นรายการอื่นเพื่อเลี่ยงเพดาน)
    if (lines.some((l) => l.kind === "OTHER" && /ค่าปรับ|ปรับล่าช้า|ปรับช้า|ปรับจ่ายช้า/.test(l.labelTh))) {
      return fail("LATE_FEE_AS_OTHER", "รายการที่เป็นค่าปรับต้องเลือกชนิด \"ค่าปรับชำระล่าช้า\" (ตรวจเพดานตามสัญญา) — ไม่ใส่เป็นรายการอื่น");
    }
    const lease = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormLease.findFirst({ where: { id: bill.leaseId }, select: { policySnapshot: true, rentSatang: true } });
    const snap = snapValuesOf(lease?.policySnapshot ?? null);
    const lateSum = lines.filter((l) => l.kind === "LATE_FEE").reduce((s, l) => s + l.amountSatang, 0);
    const r = await rewriteOne(g, bill, lines, (c) => lateFeeCheck(snap, valsOf(c.billRes), lease?.rentSatang ?? 0, lateSum));
    if (!r.ok) return r;
    return { ok: true, totalSatang: r.calc.bill.totalSatang };
  } catch (e) {
    await logFail("extraLines", isRec(ctx) ? ctx.tenantId : null, e);
    return INTERNAL();
  }
}

export async function releaseHeldBill(ctx: BillingCtx, input: { unitId: string; billId: string }, deps?: { now?: Date }): Promise<{ ok: true; status: "DRAFT"; totalSatang: number } | Fail> {
  void deps;
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.bill.run");
    if (!g) return NOT_FOUND();
    const bill = await readBill(g, input.billId);
    if (!bill) return NOT_FOUND();
    if (bill.status !== "HELD") return fail("NOT_HELD", "บิลนี้ไม่ได้พักไว้");
    const r = await rewriteOne(g, bill, null, (c) =>
      c.status === "HELD" ? fail("STILL_HELD", `ยังปล่อยไม่ได้ — ${holdReasonTh(c.holdReason)}`) : null,
    );
    if (!r.ok) return r;
    return { ok: true, status: "DRAFT", totalSatang: r.calc.bill.totalSatang };
  } catch (e) {
    await logFail("release", isRec(ctx) ? ctx.tenantId : null, e);
    return INTERNAL();
  }
}

// ───────────────────────── 3.4 ตั้งเวลาส่ง ─────────────────────────
export async function scheduleBillRun(
  ctx: BillingCtx,
  input: { unitId: string; runId: string; at: string | null },
  deps?: { now?: Date },
): Promise<{ ok: true; status: BillRunStatus; scheduledSendAt: string | null } | Fail> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.bill.send");
    if (!g) return NOT_FOUND();
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const run = isStr(input.runId) ? await db.dormBillRun.findFirst({ where: { id: input.runId }, select: { id: true, status: true, periodKey: true } }) : null;
    if (!run) return NOT_FOUND();
    if (run.status === "SENT" || run.status === "CLOSED") return fail("RUN_SENT", "รอบนี้ส่งครบแล้ว — ตั้งเวลาส่งไม่ได้");
    const now = deps?.now instanceof Date ? deps.now : new Date();
    let at: Date | null = null;
    if (input.at !== null) {
      const ok = typeof input.at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.at) && Number.isFinite(Date.parse(input.at));
      if (!ok) return fail("INVALID_INPUT", "เวลาส่งต้องเป็นวันเวลาที่ถูกต้อง");
      at = new Date(Date.parse(input.at as string));
      if (at.getTime() <= now.getTime() || at.getTime() - now.getTime() > SCHEDULE_MAX_MS) return fail("INVALID_INPUT", "เวลาส่งต้องอยู่ในอนาคต ไม่เกิน 60 วัน");
    }
    const res = await retryOnce(() =>
      db.$transaction(async (txRaw) => {
        const tx = txRaw as unknown as Tx;
        await advisoryLock(tx, runLockKey(g.unitId, run.periodKey));
        const cur = await tx.dormBillRun.findFirst({ where: { id: run.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, progress: true } });
        if (!cur || cur.status === "SENT" || cur.status === "CLOSED") return null;
        let status: BillRunStatus = "REVIEW";
        if (!at) {
          // F11: มีผู้ส่งถือสัญญาเช่าอยู่ ⇒ ห้ามคืนรอบเป็นร่างกลางการส่ง
          const lease = leaseInProgress(cur.progress).lease;
          if (lease && lease.until > Date.now()) return "SENDING" as const;
          const sent = await tx.dormBill.count({ where: { tenantId: g.tenantId, unitId: g.unitId, runId: run.id, status: { in: SENTISH } } });
          status = sent > 0 ? "REVIEW" : "DRAFT";
        }
        await tx.dormBillRun.updateMany({ where: { id: run.id, tenantId: g.tenantId, unitId: g.unitId, status: cur.status }, data: { status, scheduledSendAt: at } });
        return status;
      }, TX_OPTS),
    );
    if (res === "BUSY" || res === "SENDING") return BUSY();
    if (res === null) return fail("RUN_SENT", "รอบนี้ส่งครบแล้ว — ตั้งเวลาส่งไม่ได้");
    return { ok: true, status: res, scheduledSendAt: at ? at.toISOString() : null };
  } catch (e) {
    await logFail("schedule", isRec(ctx) ? ctx.tenantId : null, e);
    return INTERNAL();
  }
}

// ───────────────────────── ช่องทางส่ง · ผู้เช่า ─────────────────────────
type PartyInfo = { name: string; phone: string | null };
async function partiesOf(tenantId: string, ids: string[]): Promise<Map<string, PartyInfo>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  const rows = await tenantDb({ tenantId }).party.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, phone: true, phoneNorm: true } });
  return new Map(rows.map((p) => [p.id, { name: p.name, phone: p.phoneNorm || p.phone || null }]));
}
/** Party ที่ผูก LINE แล้ว (ห้องแชท LINE ที่ไม่ถูกบล็อก) — อ่านอย่างเดียว */
async function lineLinked(tenantId: string, partyIds: string[]): Promise<Set<string>> {
  const uniq = [...new Set(partyIds)];
  if (!uniq.length) return new Set();
  try {
    const rows = await tenantDb({ tenantId }).$queryRaw<{ partyId: string }[]>`
      SELECT DISTINCT "partyId" FROM "ChatContact"
      WHERE "tenantId" = ${tenantId} AND "channel"::text = 'LINE' AND "blockedAt" IS NULL AND "partyId" = ANY(${uniq})`;
    return new Set(rows.map((r) => r.partyId));
  } catch (e) {
    await logFail("lineLinked", tenantId, e);
    return new Set();
  }
}
/** ช่องทางแรกตาม rooms.billing.sendChannels (refs หน่วย+สัญญา) ที่ใช้ได้ · ไม่มีเลย ⇒ PRINT */
async function channelsOf(g: G, leases: { leaseId: string; partyId: string }[], parties: Map<string, PartyInfo>): Promise<Map<string, Channel>> {
  const out = new Map<string, Channel>();
  if (!leases.length) return out;
  const [res, line] = [
    await resolveSettingsMany({ tenantId: g.tenantId }, ["rooms.billing.sendChannels"], leases.map((l) => ({ unitId: g.unitId, leaseId: l.leaseId }))),
    await lineLinked(g.tenantId, leases.map((l) => l.partyId)),
  ];
  leases.forEach((l, i) => {
    const order = res[i]?.["rooms.billing.sendChannels"]?.value;
    const list: Channel[] = Array.isArray(order) ? order.filter((x): x is Channel => x === "LINE" || x === "SMS" || x === "PRINT") : ["LINE", "SMS", "PRINT"];
    let ch: Channel = "PRINT";
    for (const c of list) {
      if (c === "LINE" && line.has(l.partyId)) {
        ch = "LINE";
        break;
      }
      if (c === "SMS" && parties.get(l.partyId)?.phone) {
        ch = "SMS";
        break;
      }
      if (c === "PRINT") {
        ch = "PRINT";
        break;
      }
    }
    out.set(l.leaseId, ch);
  });
  return out;
}

// ───────────────────────── 3.6 อ่าน · จอ · พิมพ์ · ส่งออก ─────────────────────────
const linesOf = (v: Prisma.JsonValue): DormBillLine[] => (Array.isArray(v) ? (v.filter((x) => isRec(x) && typeof x.code === "string") as unknown as DormBillLine[]) : []);
const grossOf = (ls: DormBillLine[], pred: (code: string) => boolean): number => ls.filter((l) => pred(l.code)).reduce((s, l) => s + (isNat(l.grossSatang) ? l.grossSatang : 0), 0);
const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtRate = (satang: number) => `${Math.trunc(satang / 100)}.${pad2(Math.abs(satang % 100))}`;

function lineDetail(l: DormBillLine): string | null {
  const m = l.meta ?? {};
  if ((l.code === "ELEC" || l.code === "WATER") && typeof m.units === "number") {
    const span = typeof m.from === "number" && typeof m.to === "number" ? `${fmtInt(m.from)}→${fmtInt(m.to)} ` : "";
    const rate = l.unitPriceSatang !== null ? `×${fmtRate(l.unitPriceSatang)}` : " หน่วย";
    return `${span}${fmtInt(m.units)}${rate}`;
  }
  if (typeof m.note === "string" && m.note) return m.note;
  return null;
}
function lateFeeRuleOf(snap: Vals | null): string | null {
  if (!snap) return null;
  const kind = snap["rooms.lateFee.kind"];
  const amount = snap["rooms.lateFee.amount"];
  const bp = snap["rooms.lateFee.percentBp"];
  const baht = (s: number) => `฿${s % 100 === 0 ? fmtInt(s / 100) : fmtRate(s)}`;
  if (kind === "PER_DAY" && isNat(amount) && amount > 0) return `เกินกำหนดปรับวันละ ${baht(amount)}`;
  if (kind === "ONCE" && isNat(amount) && amount > 0) return `เกินกำหนดปรับครั้งละ ${baht(amount)}`;
  if (kind === "PERCENT" && isNat(bp) && bp > 0) return `เกินกำหนดปรับ ${fmtRate(bp)}% ของยอดค้าง`;
  return null;
}

function previewOf(
  b: BillRec,
  roomNumber: string,
  unitName: string,
  tenantName: string,
  issueYmd: string,
  leaseSnap: Vals | null,
  docNo: string | null,
  d3: { taxInvoice: BillPreview["taxInvoice"]; partyKind: string | null } = { taxInvoice: null, partyKind: null },
): BillPreview {
  const ls = linesOf(b.lines);
  const vals = snapValuesOf(b.policySnapshot);
  // SVC D.3 ▸ หัก ณ ที่จ่าย (แสดงอย่างเดียว): ผู้เช่านิติบุคคล + อัตราใน snapshot สัญญา > 0 · ฐาน = Σ gross ค่าห้อง ◂
  const whtBp = leaseSnap ? leaseSnap["rooms.tax.withholdingCorporateBp"] : null;
  const whtBase = grossOf(ls, (c) => c === "RENT");
  const withholding = d3.partyKind === "COMPANY" && isNat(whtBp) && whtBp > 0 ? { rateBp: whtBp, baseSatang: whtBase, amountSatang: Math.round((whtBase * whtBp) / 10000) } : null;
  return {
    billId: b.id,
    roomNumber,
    unitName,
    tenantName,
    status: b.status,
    docNo,
    issueDate: issueYmd,
    dueDate: ymdOf(b.dueDate) ?? issueYmd,
    lines: ls.map((l) => ({ code: l.code, labelTh: l.labelTh, detail: lineDetail(l), amountSatang: l.amountSatang })),
    totalSatang: b.totalSatang,
    vatSatang: b.vatSatang,
    vatRegistered: vals ? vals["rooms.vat.registered"] === true : b.vatSatang > 0,
    lateFeeRule: lateFeeRuleOf(leaseSnap),
    taxInvoice: d3.taxInvoice,
    withholding,
  };
}

/** เลขที่เอกสาร + ใบลด/เพิ่มหนี้ของใบแจ้งหนี้ของบิล (อ่านอย่างเดียว · ทุกสมุดที่บิลของหน่วยอ้างถึง) */
async function docsOf(tenantId: string, docIds: string[]): Promise<{ docNo: Map<string, string | null>; adj: Map<string, { kind: "CREDIT" | "DEBIT"; docNo: string | null; totalSatang: number }[]> }> {
  const docNo = new Map<string, string | null>();
  const adj = new Map<string, { kind: "CREDIT" | "DEBIT"; docNo: string | null; totalSatang: number }[]>();
  if (!docIds.length) return { docNo, adj };
  const books = await tenantDb({ tenantId }).$queryRaw<{ systemId: string }[]>`
    SELECT DISTINCT "systemId" FROM "AccountDocument" WHERE "tenantId" = ${tenantId} AND "id" = ANY(${docIds})`;
  const rows: { id: string; docNo: string | null; docType: string; sourceDocId: string | null; grandTotal: number; status: string }[] = [];
  for (const b of books) {
    const part = await tenantDb({ tenantId, systemId: b.systemId }).accountDocument.findMany({
      where: { OR: [{ id: { in: docIds } }, { sourceDocId: { in: docIds }, docType: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] } }] },
      select: { id: true, docNo: true, docType: true, sourceDocId: true, grandTotal: true, status: true },
      orderBy: { createdAt: "asc" },
    });
    for (const r of part) rows.push({ ...r, docType: String(r.docType), status: String(r.status) });
  }
  for (const r of rows) {
    if (docIds.includes(r.id) && r.docType === "INVOICE") docNo.set(r.id, r.docNo);
    else if (r.sourceDocId && (r.docType === "CREDIT_NOTE" || r.docType === "DEBIT_NOTE") && r.status !== "VOIDED" && r.status !== "CANCELLED") {
      adj.set(r.sourceDocId, [...(adj.get(r.sourceDocId) ?? []), { kind: r.docType === "CREDIT_NOTE" ? "CREDIT" : "DEBIT", docNo: r.docNo, totalSatang: r.grandTotal }]);
    }
  }
  return { docNo, adj };
}

/** สัญญาที่ไม่ออกบิลเพราะย้ายออก (คิดในใบย้ายออก) — โมเดลจอ */
async function skippedOf(tenantId: string, unitId: string, rentMonth: string, utilMonth: string, rooms: Map<string, RoomInfo>): Promise<Skipped[]> {
  const db = tenantDb({ tenantId, unitId });
  const rentEnd = monthEnd(rentMonth);
  const winStart = minS(`${utilMonth}-01`, `${rentMonth}-01`);
  const leases = await db.dormLease.findMany({
    where: { status: { in: ["ACTIVE", "NOTICE"] }, startDate: { lte: dbDate(maxS(monthEnd(utilMonth), rentEnd)) }, OR: [{ endDate: null }, { endDate: { gte: dbDate(winStart) } }] },
    select: { id: true, roomId: true, partyId: true },
  });
  if (!leases.length) return [];
  const mos = await db.dormMoveOut.findMany({ where: { leaseId: { in: leases.map((l) => l.id) }, status: { not: "CANCELLED" } }, select: { leaseId: true, moveOutDate: true } });
  const out: Skipped[] = [];
  for (const m of mos) {
    const d = ymdOf(m.moveOutDate);
    const l = leases.find((x) => x.id === m.leaseId);
    if (!d || !l || d > rentEnd) continue;
    out.push({ leaseId: l.id, roomId: l.roomId, partyId: l.partyId, roomNumber: rooms.get(l.roomId)?.number ?? "", reason: "MOVE_OUT", moveOutDate: d });
  }
  return out;
}

function lastErrorOf(p: Prisma.JsonValue): BillRunModel["lastError"] {
  if (!isRec(p) || !isRec(p.lastError)) return null;
  const e = p.lastError;
  return typeof e.code === "string" && typeof e.reason === "string" && typeof e.at === "string"
    ? { code: e.code, reason: e.reason, at: e.at, nextAttemptAt: typeof p.nextAttemptAt === "string" ? p.nextAttemptAt : null }
    : null;
}
const emptyKpi = (): BillRunModel["kpi"] => ({
  billCount: 0,
  rentSatang: 0,
  commonSatang: 0,
  elecSatang: 0,
  elecUnits: 0,
  elecRateSatang: null,
  waterSatang: 0,
  waterUnits: 0,
  waterRateSatang: null,
  lateFeeSatang: 0,
  otherSatang: 0,
  totalSatang: 0,
});
function legalSummary(groups: UtilityGroup[], kind: Kind): { billSatang: number; units: number; rateSatang: number } | null {
  const gs = groups.filter((g) => g.kind === kind && g.billSatang !== null && g.billUnits !== null);
  if (!gs.length) return null;
  const billSatang = gs.reduce((s, g) => s + (g.billSatang ?? 0), 0);
  const units = gs.reduce((s, g) => s + (g.billUnits ?? 0), 0);
  const rate = gs.length === 1 && gs[0].costRateSatangPerUnit !== null ? gs[0].costRateSatangPerUnit : units > 0 ? Math.floor(billSatang / units) : 0;
  return { billSatang, units, rateSatang: rate };
}

export async function billRunModel(ctx: BillingCtx, input: { unitId: string; periodKey?: string; previewRoom?: string }): Promise<BillRunModel | null> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.view");
    if (!g) return null;
    const { tenantId, unitId } = g;
    const db = tenantDb({ tenantId, unitId });
    let P: string;
    if (input.periodKey !== undefined && input.periodKey !== null) {
      if (typeof input.periodKey !== "string" || !PERIOD_RE.test(input.periodKey)) return null;
      P = input.periodKey;
    } else {
      const latest = await db.dormBillRun.findFirst({ orderBy: { periodKey: "desc" }, select: { periodKey: true } });
      P = latest?.periodKey ?? addMonths(bkkYmd(new Date()).slice(0, 7), 1);
    }
    const run = await db.dormBillRun.findFirst({ where: { periodKey: P } });
    const uv = await unitValsOf(tenantId, unitId);
    const { rentMonth, utilMonth } = monthsOf(P, uv);
    const uctx = { tenantId };
    const [bills, roomRows, walk, gateRaw, usage] = await Promise.all([
      run ? db.dormBill.findMany({ where: { runId: run.id }, select: BILL_SELECT }) : Promise.resolve([] as BillRec[]),
      db.hotelRoom.findMany({ select: { id: true, number: true, buildingId: true, roomTypeId: true } }),
      meterWalk(uctx, { unitId, periodKey: utilMonth }),
      utilityBillingGate(uctx, { unitId, periodKey: utilMonth }),
      periodUsage(uctx, { unitId, periodKey: utilMonth }),
    ]);
    const rooms = new Map<string, RoomInfo>(roomRows.map((r) => [r.id, r]));
    const skipped = run ? await skippedOf(tenantId, unitId, rentMonth, utilMonth, rooms) : [];
    const billLeases = new Set(bills.map((b) => b.leaseId));
    const skipRows = skipped.filter((s) => !billLeases.has(s.leaseId));
    const parties = await partiesOf(tenantId, [...bills.map((b) => b.partyId), ...skipRows.map((s) => s.partyId)]);
    const unsent = bills.filter((b) => !SENTISH.includes(b.status));
    const planned = await channelsOf(g, unsent.map((b) => ({ leaseId: b.leaseId, partyId: b.partyId })), parties);
    const docIds = bills.map((b) => b.accountDocumentId).filter((x): x is string => !!x);
    const docs = await docsOf(tenantId, docIds);
    const tis = await liveTaxInvoicesFor(tenantId, docIds); // SVC D.3

    // KPI = ของบิลจริงในฐาน (ไม่คำนวณใหม่)
    const kpi = emptyKpi();
    const elecRates = new Set<number>();
    const waterRates = new Set<number>();
    for (const b of bills) {
      if (b.status === "HELD" || b.status === "VOID") continue;
      const ls = linesOf(b.lines);
      kpi.billCount++;
      kpi.totalSatang += b.totalSatang;
      kpi.rentSatang += grossOf(ls, (c) => c === "RENT");
      kpi.commonSatang += grossOf(ls, (c) => c === "COMMON");
      kpi.lateFeeSatang += grossOf(ls, (c) => c === "LATE_FEE");
      kpi.otherSatang += grossOf(ls, (c) => c.startsWith("SERVICE:"));
      for (const l of ls) {
        if (l.code === "ELEC") {
          kpi.elecSatang += isNat(l.grossSatang) ? l.grossSatang : 0;
          kpi.elecUnits += typeof l.meta?.units === "number" ? l.meta.units : 0;
          if (l.unitPriceSatang !== null) elecRates.add(l.unitPriceSatang);
        } else if (l.code === "WATER") {
          kpi.waterSatang += isNat(l.grossSatang) ? l.grossSatang : 0;
          kpi.waterUnits += typeof l.meta?.units === "number" ? l.meta.units : 0;
          if (l.unitPriceSatang !== null) waterRates.add(l.unitPriceSatang);
        }
      }
    }
    kpi.elecRateSatang = elecRates.size === 1 ? [...elecRates][0] : null;
    kpi.waterRateSatang = waterRates.size === 1 ? [...waterRates][0] : null;

    const base = runGateOf(gateRaw);
    const live = bills.filter((b) => b.status !== "HELD" && b.status !== "VOID").map((b) => ({ roomId: b.roomId, lines: b.lines }));
    const extra = sumCheck(base.groups, rooms, live, uv["rooms.legal.outOfScopeReason"]);
    const legal: BillRunModel["legal"] = {
      ok: base.ok && extra.length === 0,
      blocks: [...base.blocks, ...extra],
      needsAcceptance: base.needsAcceptance,
      elec: legalSummary(base.groups, "ELEC"),
      water: legalSummary(base.groups, "WATER"),
    };

    const rows: BillRunRow[] = [];
    for (const b of bills) {
      const ls = linesOf(b.lines);
      const el = ls.find((l) => l.code === "ELEC");
      const wa = ls.find((l) => l.code === "WATER");
      const notes = ls
        .filter((l) => l.code === "LATE_FEE" || l.code.startsWith("SERVICE:"))
        .map((l) => (typeof l.meta?.note === "string" && l.meta.note ? l.meta.note : l.code === "LATE_FEE" ? l.labelTh : l.labelTh));
      const mf = flagOfRoom(usage, b.roomId, false);
      rows.push({
        billId: b.id,
        leaseId: b.leaseId,
        roomId: b.roomId,
        roomNumber: rooms.get(b.roomId)?.number ?? "",
        tenantName: parties.get(b.partyId)?.name ?? "",
        status: (["DRAFT", "HELD", "SENT", "PARTIALLY_PAID", "PAID", "VOID"].includes(b.status) ? b.status : "DRAFT") as BillRunRow["status"],
        skipReason: null,
        holdReason: b.holdReason,
        rentCommonSatang: grossOf(ls, (c) => c === "RENT" || c === "COMMON"),
        elec: el ? { amountSatang: el.grossSatang, units: typeof el.meta?.units === "number" ? el.meta.units : el.qty } : null,
        water: wa ? { amountSatang: wa.grossSatang, units: typeof wa.meta?.units === "number" ? wa.meta.units : wa.qty } : null,
        otherSatang: grossOf(ls, (c) => c === "LATE_FEE" || c.startsWith("SERVICE:")),
        otherNote: notes.length ? notes.join(" · ") : null,
        totalSatang: b.totalSatang,
        channel: b.sentVia === "LINE" || b.sentVia === "SMS" || b.sentVia === "PRINT" ? b.sentVia : (planned.get(b.leaseId) ?? null),
        meterFlag: mf ? { flag: mf.flag, confirmed: !mf.held } : null,
        docNo: b.accountDocumentId ? (docs.docNo.get(b.accountDocumentId) ?? null) : null,
        adjustments: b.accountDocumentId ? (docs.adj.get(b.accountDocumentId) ?? []) : [],
        taxInvoiceNo: b.accountDocumentId ? (tis.get(b.accountDocumentId)?.docNo ?? null) : null,
      });
    }
    for (const s of skipRows) {
      rows.push({
        billId: null,
        leaseId: s.leaseId,
        roomId: s.roomId,
        roomNumber: s.roomNumber,
        tenantName: parties.get(s.partyId)?.name ?? "",
        status: "SKIPPED",
        skipReason: "MOVE_OUT",
        holdReason: null,
        rentCommonSatang: null,
        elec: null,
        water: null,
        otherSatang: 0,
        otherNote: `ย้ายออก ${s.moveOutDate} — คิดในใบย้ายออก`,
        totalSatang: null,
        channel: null,
        meterFlag: null,
        docNo: null,
        adjustments: [],
        taxInvoiceNo: null,
      });
    }
    rows.sort((a, b) => numCmp(a.roomNumber, b.roomNumber));

    const issueYmd = ymdOf(run?.issueDate ?? null) ?? bkkYmd(new Date());
    let preview: BillPreview | null = null;
    const want = typeof input.previewRoom === "string" ? rows.find((r) => r.billId && r.roomNumber === input.previewRoom) : undefined;
    const pick = want ?? rows.find((r) => r.billId);
    if (pick?.billId) {
      const b = bills.find((x) => x.id === pick.billId);
      if (b) {
        const lease = await db.dormLease.findFirst({ where: { id: b.leaseId }, select: { policySnapshot: true } });
        const pk = await tenantDb({ tenantId }).party.findFirst({ where: { id: b.partyId }, select: { kind: true } });
        const ti = b.accountDocumentId ? (tis.get(b.accountDocumentId) ?? null) : null;
        preview = previewOf(b, pick.roomNumber, g.unitName, pick.tenantName, issueYmd, snapValuesOf(lease?.policySnapshot ?? null), pick.docNo, { taxInvoice: ti, partyKind: pk?.kind ?? null });
      }
    }
    const live2 = bills.filter((b) => b.status !== "VOID");
    const held = live2.filter((b) => b.status === "HELD").length;
    const drafts = bills.filter((b) => b.status === "DRAFT").length;
    const status = (run?.status ?? "NONE") as BillRunModel["status"];
    return {
      unitId,
      unitName: g.unitName,
      periodKey: P,
      utilityPeriodKey: utilMonth,
      runId: run?.id ?? null,
      status,
      issueDate: ymdOf(run?.issueDate ?? null),
      scheduledSendAt: run?.scheduledSendAt ? run.scheduledSendAt.toISOString() : null,
      meter: { rooms: walk.progress.rooms, done: walk.progress.done },
      kpi,
      legal,
      rows,
      preview,
      counts: { total: live2.length, reviewed: live2.length - held, held },
      lastError: lastErrorOf(run?.progress ?? null),
      canPrepare: g.canRun && status !== "CLOSED",
      canSend: g.canSend && !!run && status !== "CLOSED" && drafts > 0,
    };
  } catch (e) {
    await logFail("model", isRec(ctx) ? ctx.tenantId : null, e);
    return null;
  }
}

export async function getBill(ctx: BillingCtx, input: { unitId: string; billId: string }): Promise<BillPreview | null> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.view");
    if (!g) return null;
    const b = await readBill(g, input.billId);
    if (!b) return null;
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const [run, room, lease, parties] = [
      await db.dormBillRun.findFirst({ where: { id: b.runId }, select: { issueDate: true } }),
      await db.hotelRoom.findFirst({ where: { id: b.roomId }, select: { number: true } }),
      await db.dormLease.findFirst({ where: { id: b.leaseId }, select: { policySnapshot: true } }),
      await partiesOf(g.tenantId, [b.partyId]),
    ];
    const docs = b.accountDocumentId ? await docsOf(g.tenantId, [b.accountDocumentId]) : null;
    // SVC D.3 ▸ ใบกำกับที่ยังมีผล + ชนิดผู้เช่า (หัก ณ ที่จ่าย) ◂
    const ti = b.accountDocumentId ? ((await liveTaxInvoicesFor(g.tenantId, [b.accountDocumentId])).get(b.accountDocumentId) ?? null) : null;
    const pk = await tenantDb({ tenantId: g.tenantId }).party.findFirst({ where: { id: b.partyId }, select: { kind: true } });
    return previewOf(
      b,
      room?.number ?? "",
      g.unitName,
      parties.get(b.partyId)?.name ?? "",
      ymdOf(run?.issueDate ?? null) ?? ymdOf(b.dueDate) ?? "",
      snapValuesOf(lease?.policySnapshot ?? null),
      b.accountDocumentId ? (docs?.docNo.get(b.accountDocumentId) ?? null) : null,
      { taxInvoice: ti, partyKind: pk?.kind ?? null },
    );
  } catch (e) {
    await logFail("getBill", isRec(ctx) ? ctx.tenantId : null, e);
    return null;
  }
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** SVC D.3 ▸ "2026-10-26" ⇒ "26 ต.ค. 2569" (จากข้อความ ไม่ผ่าน Date) ◂ */
const thaiDateOf = (ymd: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}` : ymd;
};
const STATUS_TH: Record<string, string> = { DRAFT: "รอส่ง", HELD: "พักไว้", SENT: "ส่งแล้ว", PARTIALLY_PAID: "จ่ายบางส่วน", PAID: "จ่ายครบ", VOID: "ยกเลิก" };
/** บาทเป็นตัวเลข (สองตำแหน่ง) — จากสตางค์จำนวนเต็ม */
const bahtNum = (satang: number): number => Number(`${satang < 0 ? "-" : ""}${Math.trunc(Math.abs(satang) / 100)}.${pad2(Math.abs(satang) % 100)}`);

export async function billRunCsv(ctx: BillingCtx, input: { unitId: string; runId: string }): Promise<string | null> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.view");
    if (!g || !isStr(input.runId)) return null;
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const run = await db.dormBillRun.findFirst({ where: { id: input.runId }, select: { id: true } });
    if (!run) return null;
    const bills = await db.dormBill.findMany({ where: { runId: run.id }, select: BILL_SELECT });
    const rooms = new Map((await db.hotelRoom.findMany({ select: { id: true, number: true } })).map((r) => [r.id, r.number]));
    const parties = await partiesOf(g.tenantId, bills.map((b) => b.partyId));
    const docs = await docsOf(g.tenantId, bills.map((b) => b.accountDocumentId).filter((x): x is string => !!x));
    const out = [
      csvRow(["ห้อง", "ผู้เช่า", "สถานะ", "ค่าห้อง+ส่วนกลาง (บาท)", "ค่าไฟ (บาท)", "หน่วยไฟ", "ค่าน้ำ (บาท)", "หน่วยน้ำ", "อื่น ๆ (บาท)", "รวม (บาท)", "ครบกำหนด", "เลขที่ใบแจ้งหนี้", "ส่งทาง"]),
    ];
    const sorted = [...bills].sort((a, b) => numCmp(rooms.get(a.roomId) ?? "", rooms.get(b.roomId) ?? ""));
    for (const b of sorted) {
      const ls = linesOf(b.lines);
      const el = ls.find((l) => l.code === "ELEC");
      const wa = ls.find((l) => l.code === "WATER");
      out.push(
        csvRow([
          rooms.get(b.roomId) ?? "",
          parties.get(b.partyId)?.name ?? "",
          STATUS_TH[b.status] ?? b.status,
          bahtNum(grossOf(ls, (c) => c === "RENT" || c === "COMMON")),
          el ? bahtNum(el.grossSatang) : null,
          el && typeof el.meta?.units === "number" ? el.meta.units : null,
          wa ? bahtNum(wa.grossSatang) : null,
          wa && typeof wa.meta?.units === "number" ? wa.meta.units : null,
          bahtNum(grossOf(ls, (c) => c === "LATE_FEE" || c.startsWith("SERVICE:"))),
          bahtNum(b.totalSatang),
          ymdOf(b.dueDate),
          b.accountDocumentId ? (docs.docNo.get(b.accountDocumentId) ?? "") : "",
          b.sentVia === "LINE" || b.sentVia === "SMS" || b.sentVia === "PRINT" ? b.sentVia : "",
        ]),
      );
    }
    return `${out.join("\n")}\n`;
  } catch (e) {
    await logFail("csv", isRec(ctx) ? ctx.tenantId : null, e);
    return null;
  }
}

// ───────────────────────── 3.8 กล่องประมาณค่าน้ำไฟ (จอ 03) ─────────────────────────
export async function meterEstimates(ctx: BillingCtx, input: { unitId: string; periodKey: string }): Promise<Record<string, MeterEstimate>> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.view");
    if (!g || typeof input.periodKey !== "string" || !PERIOD_RE.test(input.periodKey)) return {};
    const uc = await utilityCharges({ tenantId: g.tenantId }, { unitId: g.unitId, periodKey: input.periodKey });
    const out: Record<string, MeterEstimate> = {};
    for (const r of uc.rows) {
      if (r.status !== "OK" || r.amountSatang === null) continue;
      const e = out[r.roomId] ?? { totalSatang: 0, elec: null, water: null };
      const part = { units: r.units ?? 0, rateSatangPerUnit: r.rateSatangPerUnit, amountSatang: r.amountSatang };
      if (r.kind === "ELEC") e.elec = part;
      else e.water = part;
      e.totalSatang += r.grossSatang ?? r.amountSatang;
      out[r.roomId] = e;
    }
    return out;
  } catch (e) {
    await logFail("estimates", isRec(ctx) ? ctx.tenantId : null, e);
    return {};
  }
}

// ───────────────────────── 3.9 งานตามเวลา (minute-job dorm.billing) ─────────────────────────
/**
 * (ก) ส่งต่อ: รอบ DRAFT/REVIEW ที่ยังมีบิล DRAFT และ (ตั้งเวลาไว้ถึงแล้ว หรือหน่วยเปิดส่งอัตโนมัติ) — รอบที่ส่งค้างครึ่งทางมีคนส่งต่อเสมอ (F12)
 *     เรียงตามคิวลองใหม่ (progress.nextAttemptAt) แล้วเวลาตั้งส่ง · รอบที่ล้มถอยเวลาเอง ไม่แย่งคิวร้านอื่น (F4)
 * (ข) หน่วย DORM ACTIVE ที่ยังไม่มีรอบเดือนถัดไป (ไทย) และถึงวันออกบิล หรือจดมิเตอร์ครบ ⇒ เตรียม (autoSend + ด่านผ่าน ⇒ ส่งต่อ)
 *   ซ้อนกันกี่รอบก็ได้ผลเดียว: เตรียมใต้ล็อกหน่วย×งวด · ส่งมีผู้ส่งทีละคน + จองต่อบิล · prepared นับเฉพาะรอบที่สร้างจริง
 */
const BACKOFF_MIN = [5, 15, 60, 240];
async function noteJob(g: G, runId: string, now: Date, err: { code: string; reason: string } | null): Promise<void> {
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  await retryOnce(() =>
    db.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      await advisoryLock(tx, sendLockKey(runId));
      const run = await tx.dormBillRun.findFirst({ where: { id: runId, tenantId: g.tenantId, unitId: g.unitId }, select: { progress: true } });
      if (!run) return;
      const p: Record<string, unknown> = isRec(run.progress) ? { ...run.progress } : {};
      if (err) {
        const attempts = (isNat(p.attempts) ? p.attempts : 0) + 1;
        const mins = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
        p.attempts = attempts;
        p.lastError = { code: err.code, reason: err.reason.slice(0, 300), at: now.toISOString() };
        p.nextAttemptAt = new Date(now.getTime() + mins * 60_000).toISOString();
      } else {
        if (p.lastError === undefined && p.nextAttemptAt === undefined && p.attempts === undefined) return;
        delete p.lastError;
        delete p.nextAttemptAt;
        delete p.attempts;
      }
      await tx.dormBillRun.updateMany({ where: { id: runId, tenantId: g.tenantId, unitId: g.unitId }, data: { progress: p as Prisma.InputJsonValue } });
    }, TX_OPTS),
  );
}
/** ผลการส่งจากงาน ⇒ จดข้อผิดพลาด/ล้าง (ต่อบิลล้มทั้งหมด = ข้อผิดพลาดของรอบ) */
/** ถอยเวลาเฉพาะข้อผิดพลาดที่ต้องให้คนแก้ (ด่าน/สมุด/VAT/ใบชน/ข้อมูลเปลี่ยน) — ชั่วคราว (ชนกัน/ฐานช้า) ลองรอบถัดไปทันที */
const PERSISTENT = new Set(["UTILITY_GATE_BLOCKED", "UTIL_TOTAL_EXCEEDS_BILL", "NOT_LINKED", "AMBIGUOUS_LINK", "VAT_SETTING_MISMATCH", "INVOICE_CONFLICT", "INVOICE_MISMATCH", "RUN_STALE", "INVALID_LINE", "INVALID_INPUT",
  "SELLER_TAX_ID_MISSING", "BUYER_TAX_ID_INVALID"]); // SVC D.3 ▸ ด่านผู้ขาย/ผู้ซื้อ = ต้องแก้ข้อมูลก่อน ⇒ จด lastError + backoff ◂
async function noteSend(g: G, runId: string, now: Date, s: SendBillRunResult): Promise<void> {
  if (!s.ok) {
    if (PERSISTENT.has(s.code)) await noteJob(g, runId, now, { code: s.code, reason: s.reason });
    return;
  }
  const hard = s.failed.find((f) => PERSISTENT.has(f.code));
  if (hard && s.sent === 0) await noteJob(g, runId, now, { code: hard.code, reason: hard.reason });
  else if (s.sent > 0 || s.done) await noteJob(g, runId, now, null);
}
/** ส่งต่อจนจบ/ไม่คืบ/หมดงบของงาน — ทุกการเรียกยังอยู่ในงบต่อการเรียก */
async function jobSend(g: G, runId: string, now: Date, left: () => number): Promise<number> {
  let total = 0;
  for (let i = 0; i < 20 && left() > 5_000; i++) {
    const s = await sendInternal(g, runId, { now, budgetMs: Math.min(DEFAULT_BUDGET_MS, left() - 2_000) });
    await noteSend(g, runId, now, s);
    if (!s.ok) break;
    total += s.sent;
    if (s.done || (s.sent === 0 && !s.failed.length && i > 0)) break;
    if (s.sent === 0 && s.failed.length) break;
  }
  return total;
}

export async function runDormBillingJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number }): Promise<{ prepared: number; sent: number }> {
  const t0 = Date.now();
  // ตัวรัน minute-job ส่งงบของรอบมาเสมอ · เรียกตรง (สคริปต์/ทดสอบ) ไม่ส่ง = 120 วิ
  const budget = isNat(opts?.budgetMs) && (opts?.budgetMs ?? 0) > 0 ? (opts?.budgetMs as number) : 120_000;
  const left = () => budget - (Date.now() - t0);
  const tid = isStr(opts?.tenantId) ? (opts?.tenantId as string) : null;
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const raw = tenantDb({ tenantId: tid ?? "platform-global-read" });
  const today = bkkYmd(at);
  const next = addMonths(today.slice(0, 7), 1);
  let prepared = 0;
  let sent = 0;

  // (ก) ส่งต่อ — เฉพาะรอบที่ต้องส่งจริง (ตั้งเวลาถึงแล้ว หรือหน่วยเปิดส่งอัตโนมัติ ณ ตอนเตรียม) ที่ยังมีบิล DRAFT · ไม่เกินเดือนถัดไป · ถึงคิวลองใหม่
  //     เรียง: ไม่เคยล้มก่อน แล้ว COALESCE(คิวลองใหม่, เวลาตั้งส่ง, สร้าง) · รอบที่เคยล้มไม่เกิน 10 ต่องาน · ตรวจการผูกสมุดแบบเบาก่อนส่งเต็ม (F19)
  type DueRow = { id: string; tenantId: string; unitId: string; failedBefore: boolean };
  const due = tid
    ? await raw.$queryRaw<DueRow[]>`
        SELECT r."id", r."tenantId", r."unitId", (r."progress"->>'nextAttemptAt' IS NOT NULL) AS "failedBefore"
        FROM "DormBillRun" r
        WHERE r."status" IN ('DRAFT', 'REVIEW') AND r."periodKey" <= ${next} AND r."tenantId" = ${tid}
          AND ((r."scheduledSendAt" IS NOT NULL AND r."scheduledSendAt" <= ${at}) OR r."progress"->>'autoSend' = 'true')
          AND EXISTS (SELECT 1 FROM "DormBill" b WHERE b."runId" = r."id" AND b."status" = 'DRAFT')
          AND (r."progress"->>'nextAttemptAt' IS NULL OR (r."progress"->>'nextAttemptAt')::timestamptz <= ${at})
        ORDER BY (r."progress"->>'nextAttemptAt' IS NOT NULL) ASC,
          COALESCE((r."progress"->>'nextAttemptAt')::timestamptz, r."scheduledSendAt", r."createdAt") ASC LIMIT 500`
    : await raw.$queryRaw<DueRow[]>`
        SELECT r."id", r."tenantId", r."unitId", (r."progress"->>'nextAttemptAt' IS NOT NULL) AS "failedBefore"
        FROM "DormBillRun" r
        WHERE r."status" IN ('DRAFT', 'REVIEW') AND r."periodKey" <= ${next}
          AND ((r."scheduledSendAt" IS NOT NULL AND r."scheduledSendAt" <= ${at}) OR r."progress"->>'autoSend' = 'true')
          AND EXISTS (SELECT 1 FROM "DormBill" b WHERE b."runId" = r."id" AND b."status" = 'DRAFT')
          AND (r."progress"->>'nextAttemptAt' IS NULL OR (r."progress"->>'nextAttemptAt')::timestamptz <= ${at})
        ORDER BY (r."progress"->>'nextAttemptAt' IS NOT NULL) ASC,
          COALESCE((r."progress"->>'nextAttemptAt')::timestamptz, r."scheduledSendAt", r."createdAt") ASC LIMIT 500`;
  let retried = 0;
  for (const r of due) {
    if (left() < 5_000) break;
    if (r.failedBefore && ++retried > 10) continue;
    try {
      const g = await systemGate(r.tenantId, r.unitId);
      if (!g) continue;
      // ด่านเบา: หน่วยยังไม่ผูกสมุด ⇒ จดข้อผิดพลาด (ถอยเวลา) โดยไม่คำนวณรอบเต็ม
      const linked = await raw.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS "n" FROM "AccountSystemLink" WHERE "tenantId" = ${r.tenantId} AND "linkedKind"::text = 'BUSINESS' AND "linkedId" = ${r.unitId} AND "enabled" = true`;
      if (Number(linked[0]?.n ?? 0) === 0) {
        await noteJob(g, r.id, at, { code: "NOT_LINKED", reason: "หอนี้ยังไม่ได้เชื่อมระบบบัญชี — เชื่อมสมุดบัญชีให้หอก่อน แล้วระบบจะส่งให้รอบถัดไป" });
        continue;
      }
      sent += await jobSend(g, r.id, at, left);
    } catch (e) {
      await logFail("job.send", r.tenantId, e);
    }
  }

  // (ข) เตรียมรอบเดือนถัดไป
  const day = Number(today.slice(8, 10));
  const units = tid
    ? await raw.$queryRaw<{ id: string; tenantId: string }[]>`
        SELECT "id", "tenantId" FROM "BusinessUnit" WHERE "type"::text = 'DORM' AND "status"::text = 'ACTIVE' AND "tenantId" = ${tid} ORDER BY "createdAt" ASC`
    : await raw.$queryRaw<{ id: string; tenantId: string }[]>`
        SELECT "id", "tenantId" FROM "BusinessUnit" WHERE "type"::text = 'DORM' AND "status"::text = 'ACTIVE' ORDER BY "createdAt" ASC`;
  for (const u of units) {
    if (left() < 5_000) break;
    try {
      const db = tenantDb({ tenantId: u.tenantId, unitId: u.id });
      if ((await db.dormBillRun.count({ where: { periodKey: next } })) > 0) continue;
      const uv = await unitValsOf(u.tenantId, u.id);
      const { utilMonth } = monthsOf(next, uv);
      const issueDay = isNat(uv["rooms.billing.issueDay"]) ? (uv["rooms.billing.issueDay"] as number) : 25;
      let go = day >= issueDay;
      if (!go) {
        const w = await meterWalk({ tenantId: u.tenantId }, { unitId: u.id, periodKey: utilMonth });
        go = w.progress.rooms > 0 && w.progress.done === w.progress.rooms;
      }
      if (!go) continue;
      const g = await systemGate(u.tenantId, u.id);
      if (!g) continue;
      const p = await prepareInternal(g, next, at);
      if (!p.ok) {
        await logFail("job.prepare", u.tenantId, new Error(`${p.code}: ${p.reason}`));
        continue;
      }
      if (p.created) prepared++;
      if (uv["rooms.billing.autoSend"] === true && left() > 5_000) {
        if (!p.gate.ok) {
          await noteJob(g, p.runId, at, { code: "UTILITY_GATE_BLOCKED", reason: p.gate.blocks[0]?.messageTh ?? p.gate.needsAcceptance[0]?.messageTh ?? "ด่านค่าน้ำไฟยังไม่ผ่าน" });
          continue;
        }
        sent += await jobSend(g, p.runId, at, left);
      }
    } catch (e) {
      await logFail("job.prepare", u.tenantId, e);
    }
  }
  return { prepared, sent };
}

// ───────────────────────── สัญญาเช่าผู้ส่ง (ผู้ส่งทีละคนต่อรอบ · หมดอายุเอง) ─────────────────────────
type SendLease = { token: string; until: number };
function leaseInProgress(v: Prisma.JsonValue): { rest: Record<string, unknown>; lease: SendLease | null } {
  const rest: Record<string, unknown> = isRec(v) ? { ...v } : {};
  const l = rest.sender;
  delete rest.sender;
  return { rest, lease: isRec(l) && typeof l.token === "string" && typeof l.until === "number" ? { token: l.token, until: l.until } : null };
}
async function tryLease(g: G, runId: string, token: string, untilMs: number): Promise<"OK" | "HELD" | "GONE"> {
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const r = await retryOnce(() =>
    db.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      await advisoryLock(tx, sendLockKey(runId));
      const run = await tx.dormBillRun.findFirst({ where: { id: runId, tenantId: g.tenantId, unitId: g.unitId }, select: { progress: true } });
      if (!run) return "GONE" as const;
      const { rest, lease } = leaseInProgress(run.progress);
      if (lease && lease.token !== token && lease.until > Date.now()) return "HELD" as const;
      await tx.dormBillRun.updateMany({
        where: { id: runId, tenantId: g.tenantId, unitId: g.unitId },
        data: { progress: { ...rest, sender: { token, until: untilMs } } as Prisma.InputJsonValue },
      });
      return "OK" as const;
    }, TX_OPTS),
  );
  return r === "BUSY" ? "HELD" : r;
}
async function dropLease(g: G, runId: string, token: string, progress: Record<string, unknown>): Promise<void> {
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  await retryOnce(() =>
    db.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      await advisoryLock(tx, sendLockKey(runId));
      const run = await tx.dormBillRun.findFirst({ where: { id: runId, tenantId: g.tenantId, unitId: g.unitId }, select: { progress: true } });
      if (!run) return;
      const { rest, lease } = leaseInProgress(run.progress);
      if (lease && lease.token !== token) return;
      await tx.dormBillRun.updateMany({ where: { id: runId, tenantId: g.tenantId, unitId: g.unitId }, data: { progress: { ...rest, ...progress } as Prisma.InputJsonValue } });
    }, TX_OPTS),
  );
}

/** บิลส่งแล้วที่ลิงก์จ่ายตายแล้ว (คำขอที่ชี้ถูกยกเลิก/หมดอายุ) — ต้องออกลิงก์ใหม่ (F18) */
async function deadLinkBills(g: G, runId: string): Promise<{ id: string; accountDocumentId: string | null; paymentRequestId: string }[]> {
  return tenantDb({ tenantId: g.tenantId }).$queryRaw<{ id: string; accountDocumentId: string | null; paymentRequestId: string }[]>`
    SELECT b."id", b."accountDocumentId", b."paymentRequestId" FROM "DormBill" b
    JOIN "AccountPaymentRequest" r ON r."id" = b."paymentRequestId" AND r."tenantId" = b."tenantId"
    WHERE b."tenantId" = ${g.tenantId} AND b."unitId" = ${g.unitId} AND b."runId" = ${runId}
      AND b."status" IN ('SENT', 'PARTIALLY_PAID', 'PAID') AND (r."status"::text IN ('CANCELLED', 'EXPIRED') OR (r."status"::text = 'PENDING' AND r."expiresAt" <= now()))
    LIMIT 200`;
}

async function runCounts(g: G, runId: string): Promise<{ drafts: number; held: number; sentish: number; pending: number }> {
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const rows = await db.dormBill.groupBy({ by: ["status"], where: { runId }, _count: { _all: true } });
  const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  const pending = await db.dormBill.count({
    where: { runId, status: { in: SENTISH }, OR: [{ paymentRequestId: null }, { paymentRequestId: { startsWith: CLAIM_PREFIX } }] },
  });
  const dead = (await deadLinkBills(g, runId)).length;
  return { drafts: n("DRAFT"), held: n("HELD"), sentish: n("SENT") + n("PARTIALLY_PAID") + n("PAID"), pending: pending + dead };
}

// ───────────────────────── 3.5 ส่งรอบ ─────────────────────────
export async function sendBillRun(
  ctx: BillingCtx,
  input: { unitId: string; runId: string },
  deps?: { now?: Date; budgetMs?: number; maxBills?: number },
): Promise<SendBillRunResult> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.bill.send");
    if (!g) return NOT_FOUND();
    return await sendInternal(g, isRec(input) ? input.runId : null, deps ?? {});
  } catch (e) {
    await logFail("send", isRec(ctx) ? ctx.tenantId : null, e);
    return INTERNAL();
  }
}

type SendDeps = { now?: Date; budgetMs?: number; maxBills?: number };

async function sendInternal(g: G, runId: unknown, deps: SendDeps): Promise<SendBillRunResult> {
  const t0 = Date.now();
  const budget = isNat(deps.budgetMs) && deps.budgetMs > 0 ? deps.budgetMs : DEFAULT_BUDGET_MS;
  const maxBills = isNat(deps.maxBills) && deps.maxBills > 0 ? deps.maxBills : Number.MAX_SAFE_INTEGER;
  const now = deps.now instanceof Date ? deps.now : new Date();
  if (!isStr(runId)) return NOT_FOUND();
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const run0 = await db.dormBillRun.findFirst({ where: { id: runId }, select: { id: true, status: true } });
  if (!run0) return NOT_FOUND();
  if (run0.status === "CLOSED") return fail("RUN_CLOSED", "รอบนี้ปิดแล้ว");

  // ผู้ส่งทีละคน: รอคนที่ถืออยู่สั้น ๆ — ยังถืออยู่ ⇒ คืนความคืบหน้าที่เห็น (ok · done ตามจริง · ไม่ throw ไม่ส่งซ้ำ · ผู้เรียกเรียกต่อได้)
  const token = randomBytes(12).toString("hex");
  let got = false;
  for (;;) {
    const r = await tryLease(g, runId, token, Date.now() + budget + LEASE_SLACK_MS);
    if (r === "GONE") return NOT_FOUND();
    if (r === "OK") {
      got = true;
      break;
    }
    if (Date.now() - t0 + LEASE_POLL_MS >= Math.min(budget, LEASE_WAIT_MS)) break;
    await sleep(LEASE_POLL_MS);
  }
  if (!got) {
    const c = await runCounts(g, runId);
    const st = await db.dormBillRun.findFirst({ where: { id: runId }, select: { status: true } });
    const tp = await taxPending(g, runId, null); // SVC D.3 (นับอย่างเดียว — ผู้ส่งอีกคนถือรอบอยู่)
    return { ok: true, done: c.drafts === 0, status: (st?.status ?? run0.status) as BillRunStatus, sent: 0, alreadySent: c.sentish, held: c.held, remaining: c.drafts, failed: [], payLinkPending: c.pending, taxInvoicePending: tp };
  }
  let sentNow = 0;
  try {
    const r = await sendLocked(g, runId, { t0, budget, maxBills, now }, (n) => {
      sentNow = n;
    });
    return r;
  } finally {
    await dropLease(g, runId, token, { lastSendAt: new Date().toISOString(), lastSent: sentNow });
  }
}

type LoopOpts = { t0: number; budget: number; maxBills: number; now: Date };

async function sendLocked(g: G, runId: string, o: LoopOpts, onSent: (n: number) => void): Promise<SendBillRunResult> {
  const { tenantId, unitId } = g;
  const db = tenantDb({ tenantId, unitId });
  const run = await db.dormBillRun.findFirst({ where: { id: runId }, select: { id: true, status: true, periodKey: true, issueDate: true } });
  if (!run) return NOT_FOUND();
  const issueYmd = ymdOf(run.issueDate) ?? bkkYmd(o.now);
  const drafts = await db.dormBill.findMany({ where: { runId, status: "DRAFT" }, select: BILL_SELECT });
  const failed: { billId: string; code: string; reason: string; docId?: string }[] = [];
  let sent = 0;
  let status = run.status as BillRunStatus;

  if (drafts.length) {
    // 1. ด่าน (สดทุกครั้ง · ก่อนออกใบใด ๆ)
    //    (คำนวณครั้งเดียว: ด่าน D.7 utilityBillingGate สด + บิลทั้งรอบ — ตัดสินด่านก่อนเทียบบิล)
    const calc = await computeRun(tenantId, unitId, run.periodKey, issueYmd, { gate: true });
    const uv = calc.unitVals;
    const gate = calc.gate ?? { ok: false, blocks: [], needsAcceptance: [], groups: [] };
    if (!gate.ok) {
      return fail("UTILITY_GATE_BLOCKED", "ด่านค่าน้ำไฟตามประกาศ สคบ. ยังไม่ผ่าน — แก้ตามรายการแล้วส่งใหม่", [...gate.blocks, ...gate.needsAcceptance]);
    }
    // 2. สด (มติผู้คุม F2 · ต่อบิล): บิลที่คำนวณใหม่แล้วต่างแม้ 1 สตางค์ ⇒ ไม่ส่งใบนั้น (failed RUN_STALE) · ส่งใบที่เหลือ
    //    ทุกใบ stale ⇒ ปฏิเสธทั้งรอบ RUN_STALE · บิลที่ถูกจองแล้ว (อาจมีใบแจ้งหนี้แล้ว) ส่งตามที่จองไว้ ห้ามเทียบ/แก้
    const calcOf = new Map(calc.bills.map((c) => [c.leaseId, c]));
    const staleIds = new Set(
      drafts
        .filter((b) => {
          if (isSendClaim(b.sentVia)) return false;
          const c = calcOf.get(b.leaseId);
          return !c || canon(shapeOfRow(b)) !== canon(shapeOfCalc(c));
        })
        .map((b) => b.id),
    );
    if (staleIds.size && staleIds.size === drafts.length) {
      return fail("RUN_STALE", `ข้อมูลเปลี่ยนหลังเตรียมรอบ ${staleIds.size} ห้อง (ค่าน้ำไฟ/มิเตอร์/สัญญา) — กดเตรียมรอบใหม่แล้วตรวจอีกครั้งก่อนส่ง`);
    }
    for (const id of staleIds) failed.push({ billId: id, code: "RUN_STALE", reason: "ข้อมูลของห้องนี้เปลี่ยนหลังเตรียมรอบ — กดเตรียมรอบใหม่แล้วส่งอีกครั้ง" });
    const toSend = drafts.filter((b) => !staleIds.has(b.id));
    // Σ ค่าน้ำไฟตอนออกจริง (บิลที่ส่งแล้ว + ที่จะส่ง) ≤ บิลการไฟฟ้า/ประปา
    const sentRows = await db.dormBill.findMany({ where: { runId, status: { in: SENTISH } }, select: { roomId: true, lines: true } });
    const over = sumCheck(gate.groups, calc.rooms, [...sentRows, ...toSend.map((b) => ({ roomId: b.roomId, lines: b.lines }))], uv["rooms.legal.outOfScopeReason"]);
    if (over.length) return fail("UTIL_TOTAL_EXCEEDS_BILL", "ค่าน้ำไฟรวมที่จะเรียกเก็บเกินบิลการไฟฟ้า/ประปาของงวด — ตรวจอัตรา/เลขมิเตอร์ก่อนส่ง", over);
    // SVC D.3 ▸ ผู้ขายไม่ครบ (หอจด VAT + สมุดจด VAT + ไม่มีเลขผู้เสียภาษี 13 หลัก) ⇒ ไม่มีใบใดเกิด · รอบคงเดิม ◂
    const seller = await sellerTaxProblem(tenantId, unitId);
    if (seller) return fail(seller.code, seller.messageTh);

    // 3. DRAFT ⇒ REVIEW (ใน tx ที่ถือล็อกของรอบ — เตรียม/แก้บิลรอคิวเดียวกัน) แล้วออกทีละใบ
    const wasDraft = status === "DRAFT";
    if (wasDraft) {
      await runStatusUnderLock(g, runId, run.periodKey, "DRAFT", "REVIEW");
      status = "REVIEW";
    }
    const rooms = calc.rooms;
    toSend.sort((a, b) => numCmp(rooms.get(a.roomId)?.number ?? "", rooms.get(b.roomId)?.number ?? ""));
    const parties = await partiesOf(tenantId, toSend.map((b) => b.partyId));
    const channels = await channelsOf(g, toSend.map((b) => ({ leaseId: b.leaseId, partyId: b.partyId })), parties);
    const pay = payLinker(g);
    // งบต่อการเรียก: ไม่เริ่มใบใหม่ถ้าเวลาที่ใช้ + เวลาเฉลี่ยต่อใบ (เผื่อ 1.5 เท่า) เกินงบ ⇒ ทุกการเรียกจบในงบ
    let avg = 1_500;
    let n = 0;
    for (const b of toSend) {
      // ใบแรกของการเรียกส่งเสมอเมื่อได้สิทธิ์ผู้ส่งและผ่านด่าน (มีความคืบหน้าทุกครั้ง แม้ด่าน/คำนวณใช้งบไปหมด) · ใบถัดไปต้องพอดีงบ
      const used = Date.now() - o.t0;
      if (sent >= o.maxBills || (n > 0 && used + avg * 1.5 >= o.budget)) break;
      const s0 = Date.now();
      const step = await sendOne(g, run.id, run.periodKey, issueYmd, b.id, parties.get(b.partyId), channels.get(b.leaseId) ?? "PRINT", o.now);
      if (step.kind === "UNIT_FAIL") {
        // ไม่ผูกสมุด/VAT ไม่ตรง/ผูกหลายเล่ม — ทั้งหน่วยออกไม่ได้ ⇒ ไม่มีใบใดเกิด (คืนรอบเป็น DRAFT ถ้ายังไม่มีบิลส่ง)
        if (wasDraft && sent === 0) {
          const anySent = await db.dormBill.count({ where: { runId, status: { in: SENTISH } } });
          if (!anySent) await runStatusUnderLock(g, runId, run.periodKey, "REVIEW", "DRAFT");
        }
        return fail(step.code, step.reason);
      }
      if (step.kind === "FAIL") {
        failed.push({ billId: b.id, code: step.code, reason: step.reason, ...(step.docId ? { docId: step.docId } : {}) });
        continue;
      }
      if (step.kind === "SENT") {
        sent++;
        onSent(sent);
        await pay.link(b.id, step.docId);
      }
      n++;
      avg = n === 1 ? Date.now() - s0 : Math.round((avg * (n - 1) + (Date.now() - s0)) / n);
    }
    // ลิงก์ที่ค้าง (ล้มรอบก่อน/ติดเพดาน) — ลองต่อเมื่อเหลืองบ · ล้มครั้งแรกหยุด (ไม่ไล่ยิงเพดานซ้ำ)
    if (Date.now() - o.t0 + avg < o.budget) await pay.retryPending(runId, o);
  } else {
    await payLinker(g).retryPending(runId, o);
  }

  // SVC D.3 ▸ บิลส่งแล้วที่มี VAT แต่ยังไม่มีใบกำกับ (ล้มกลางทาง/ก่อน D.3) — ลองออกให้เมื่อเหลืองบ แล้วนับ ◂
  const taxInvoicePending = await taxPending(g, runId, o);

  // 4. ไม่มี DRAFT เหลือ (และมีบิลส่งแล้ว) ⇒ รอบ SENT
  const c = await runCounts(g, runId);
  if (c.drafts === 0 && c.sentish > 0 && status !== "SENT") {
    await db.dormBillRun.updateMany({ where: { id: runId, status: { in: ["DRAFT", "REVIEW"] } }, data: { status: "SENT", sentAt: o.now, scheduledSendAt: null } });
    status = "SENT";
  }
  return { ok: true, done: c.drafts === 0, status, sent, alreadySent: Math.max(0, c.sentish - sent), held: c.held, remaining: c.drafts, failed, payLinkPending: c.pending, taxInvoicePending };
}

/**
 * SVC D.3 ▸ บิลส่งแล้วของรอบที่ต้องมีใบกำกับ (snapshot จด VAT · VAT > 0) แต่ยังไม่มีใบที่ยังมีผล
 *   o ≠ null (ถือสัญญาเช่าผู้ส่ง) ⇒ ลองออกทีละใบ (ทางเดียวกับการส่ง · ล้ม = นับค้าง ไม่ throw) ตามงบ · o = null ⇒ นับอย่างเดียว
 */
async function taxPending(g: G, runId: string, o: LoopOpts | null): Promise<number> {
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const rows = await db.dormBill.findMany({
    where: { runId, status: { in: SENTISH }, vatSatang: { gt: 0 }, accountDocumentId: { not: null } },
    select: { id: true, partyId: true, roomId: true, accountDocumentId: true, policySnapshot: true },
  });
  const need = rows.filter((b) => snapValuesOf(b.policySnapshot)?.["rooms.vat.registered"] === true);
  if (!need.length) return 0;
  const live = await liveTaxInvoicesFor(g.tenantId, need.map((b) => b.accountDocumentId ?? ""));
  let missing = need.filter((b) => b.accountDocumentId && !live.has(b.accountDocumentId));
  if (o && missing.length) {
    const left: typeof missing = [];
    for (const b of missing) {
      if (Date.now() - o.t0 + 1_500 >= o.budget || !b.accountDocumentId) {
        left.push(b);
        continue;
      }
      const r = await issueTaxForBill(g, { invoiceId: b.accountDocumentId, partyId: b.partyId, roomId: b.roomId });
      if (!r.ok) left.push(b);
    }
    missing = left;
  }
  return missing.length;
}

type SendStep =
  | { kind: "SENT"; docId: string }
  | { kind: "SKIP" }
  | { kind: "FAIL"; code: string; reason: string; docId?: string }
  | { kind: "UNIT_FAIL"; code: string; reason: string };
const UNIT_CODES = new Set(["NOT_LINKED", "AMBIGUOUS_LINK", "VAT_SETTING_MISMATCH"]);

/** เปลี่ยนสถานะรอบใต้ล็อกของรอบ (หน่วย × งวด) — เตรียม/แก้บิลถือล็อกเดียวกัน ⇒ ไม่มีใครแก้บิลกลางการเปลี่ยน */
async function runStatusUnderLock(g: G, runId: string, P: string, from: string, to: string): Promise<boolean> {
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const r = await retryOnce(() =>
    db.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      await advisoryLock(tx, runLockKey(g.unitId, P));
      const u = await tx.dormBillRun.updateMany({ where: { id: runId, tenantId: g.tenantId, unitId: g.unitId, status: from }, data: { status: to } });
      return u.count === 1;
    }, TX_OPTS),
  );
  return r === true;
}

/**
 * ใบแจ้งหนี้ของสัญญา×งวด (F17) — ref ฐาน `<leaseId>:<P>` + ref ต่อท้าย `#n` หลังใบเดิมถูกยกเลิก (อ่านอย่างเดียว · ทุกสมุดของร้าน)
 *   live = ใบที่ยังมีผล (มีได้ใบเดียวต่อสัญญา×งวด) · ref ที่ต้องใช้ = ref ของใบที่ยังมีผล หรือ ref ใหม่ถัดจากใบที่ยกเลิกแล้ว
 */
async function invoiceFamily(tenantId: string, unitId: string, base: string): Promise<{ live: { id: string; docNo: string | null; grandTotal: number } | null; ref: string }> {
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; docNo: string | null; grandTotal: number; refId: string; status: string }[]>`
    SELECT "id", "docNo", "grandTotal", "refId", "status"::text AS "status" FROM "AccountDocument"
    WHERE "tenantId" = ${tenantId} AND "refSystemId" = ${unitId} AND "refType" = ${BILL_REF} AND "docType"::text = 'INVOICE'
      AND ("refId" = ${base} OR "refId" LIKE ${`${base}#%`})
    ORDER BY "createdAt" ASC`;
  const dead = (st: string) => st === "VOIDED" || st === "CANCELLED";
  const live = rows.find((r) => !dead(r.status)) ?? null;
  if (live) return { live: { id: live.id, docNo: live.docNo, grandTotal: live.grandTotal }, ref: live.refId };
  const n = rows.filter((r) => dead(r.status)).length;
  return { live: null, ref: n === 0 ? base : `${base}#${n}` };
}
/** บรรทัดของใบเดิมตรงบิลไหม (ลำดับ + ยอดต่อบรรทัด + ชนิดภาษี) */
async function invoiceLinesMatch(tenantId: string, docId: string, bill: DormBillResult): Promise<boolean> {
  const rows = await tenantDb({ tenantId }).$queryRaw<{ amount: number; vatRateBp: number }[]>`
    SELECT "amount", "vatRateBp" FROM "AccountDocumentLine" WHERE "tenantId" = ${tenantId} AND "documentId" = ${docId} ORDER BY "sortOrder" ASC, "id" ASC`;
  const want = dormBillInvoiceLines(bill);
  if (rows.length !== want.length) return false;
  return want.every((l, i) => rows[i].amount === l.unitPriceSatang * l.qty && rows[i].vatRateBp === (l.taxKind === "VAT7" ? 700 : -1));
}

/**
 * ออกใบแจ้งหนี้ของบิลเดียว (F1):
 *   ① จองบิล (CAS: DRAFT + ยังไม่ถูกจอง หรือจองค้างของผู้ส่งก่อนหน้า — เราถือสัญญาเช่าผู้ส่งของรอบอยู่) ⇒ ทุกทางแก้/ลบบิลปฏิเสธบิลที่ถูกจอง
 *   ② อ่านบิลสดหลังจอง แล้วออกใบจากสภาพนั้น (idempotent ต่อ ref)
 *   ③ ใบเดิมของ ref ตรงบิล (ยอด + บรรทัด) ⇒ ผูก + SENT (กู้คืนหลังส่งล้มกลางทาง) · ไม่ตรง ⇒ failed + docId เดิม (คงการจอง — บิลไม่ถูกแก้ทับ)
 *   ④ SENT + event ใน tx เดียว (CAS: ยังเป็นการจองของเรา + updatedAt เดิม)
 *   ล้มโดยไม่มีใบเกิด (ตรวจ ref แล้ว) ⇒ ปล่อยการจอง (แก้/เตรียมใหม่ได้)
 */
async function sendOne(g: G, runId: string, P: string, issueYmd: string, billId: string, party: PartyInfo | undefined, channel: Channel, now: Date): Promise<SendStep> {
  const { tenantId, unitId } = g;
  const db = tenantDb({ tenantId, unitId });
  const marker = `${SEND_CLAIM}${Date.now()}:${randomBytes(6).toString("hex")}`;
  const claim = await db.dormBill.updateMany({
    where: { id: billId, status: "DRAFT", OR: [{ sentVia: null }, { sentVia: { startsWith: SEND_CLAIM } }] },
    data: { sentVia: marker },
  });
  if (claim.count !== 1) return { kind: "SKIP" };
  const b = await db.dormBill.findFirst({ where: { id: billId, status: "DRAFT", sentVia: marker }, select: { ...BILL_SELECT, updatedAt: true } });
  if (!b) return { kind: "SKIP" };
  // ref: ใบที่ยังมีผลของสัญญา×งวด (ถ้ามี) หรือ ref ใหม่ถัดจากใบที่ถูกยกเลิก — คำนวณใต้การจองบิล (ผู้ส่งเดียวต่อรอบ)
  const fam = await invoiceFamily(tenantId, unitId, `${b.leaseId}:${P}`);
  const refId = fam.ref;
  const release = async () => {
    await db.dormBill.updateMany({ where: { id: billId, status: "DRAFT", sentVia: marker }, data: { sentVia: null } });
  };
  const vals = snapValuesOf(b.policySnapshot) ?? {};
  const vat: DormVat = vatOf(vals);
  const bill: DormBillResult = { lines: linesOf(b.lines), subtotalSatang: b.subtotalSatang, vatSatang: b.vatSatang, totalSatang: b.totalSatang };
  // SVC D.3 ▸ บิลที่ต้องมีใบกำกับ: ตรวจผู้ซื้อ "ก่อน" ออกใบใด ๆ (เลขผิด ⇒ ไม่มีใบ · ไม่กินเลข) · ใบแจ้งหนี้ใช้ผู้ซื้อชุดเดียวกัน ◂
  const needTax = vat.registered && b.vatSatang > 0;
  const tb = await taxBuyerOf(tenantId, unitId, g.unitName, { partyId: b.partyId, roomId: b.roomId });
  if (needTax && tb.bad) {
    if (!fam.live) await release();
    return { kind: "FAIL", code: "BUYER_TAX_ID_INVALID", reason: `${tb.problem?.reason ?? "ข้อมูลผู้ซื้อไม่ถูกต้อง"} — แก้ข้อมูลผู้เช่าแล้วกดเตรียมรอบ/ส่งอีกครั้ง (ยังไม่มีเอกสารใดถูกออก)` };
  }
  const inv = await createExternalInvoice({
    tenantId,
    sourceKind: "DORM",
    unitId,
    refType: BILL_REF,
    refId,
    customer: { name: tb.buyer.name || party?.name || "ผู้เช่า", taxId: tb.buyer.taxId ?? null, branchCode: tb.buyer.branchCode ?? null },
    partyId: b.partyId,
    lines: dormBillInvoiceLines(bill),
    vat,
    issueDate: issueYmd,
    dueDate: ymdOf(b.dueDate) ?? issueYmd,
    createdById: g.actorUserId,
  });
  if (!inv.ok) {
    const existing = (await invoiceFamily(tenantId, unitId, `${b.leaseId}:${P}`)).live;
    if (!existing) {
      await release();
      if (UNIT_CODES.has(inv.code)) return { kind: "UNIT_FAIL", code: inv.code, reason: inv.reason };
      return { kind: "FAIL", code: inv.code, reason: inv.reason };
    }
    return {
      kind: "FAIL",
      code: "INVOICE_CONFLICT",
      reason: `ห้องนี้มีใบแจ้งหนี้ของงวดนี้อยู่แล้ว${existing.docNo ? ` (${existing.docNo})` : ""} แต่ยอดไม่ตรงบิล — บิลถูกล็อกไม่ให้แก้ทับ ยกเลิกใบเดิมในระบบบัญชีแล้วกดส่งอีกครั้ง (ระบบออกใบใหม่ให้ตามบิล)`,
      docId: existing.id,
    };
  }
  if (inv.subTotalSatang !== b.subtotalSatang || inv.vatSatang !== b.vatSatang || inv.totalSatang !== b.totalSatang || !(await invoiceLinesMatch(tenantId, inv.docId, bill))) {
    return {
      kind: "FAIL",
      code: "INVOICE_MISMATCH",
      reason: `ใบแจ้งหนี้${inv.docNo ? ` ${inv.docNo}` : ""} (ยอด ${inv.totalSatang}) ไม่ตรงบิล (ยอด ${b.totalSatang}) — ไม่ได้ตั้งเป็นส่งแล้ว ยกเลิกใบนั้นในระบบบัญชีแล้วกดส่งอีกครั้ง (ระบบออกใบใหม่ให้ตามบิล) และตรวจค่าตั้งภาษีของหอ`,
      docId: inv.docId,
    };
  }
  // SVC D.3 ▸ ใบกำกับภาษีเต็มรูปของส่วน VAT (วันที่ = วันที่ใบแจ้งหนี้) — สำเร็จจึงตั้ง SENT · ล้ม ⇒ failed (คงการจอง: ส่งซ้ำ = ใบแจ้งหนี้เดิม + ออกใบกำกับต่อ) ◂
  if (needTax) {
    const ti = await issueTaxForBill(g, { invoiceId: inv.docId, partyId: b.partyId, roomId: b.roomId, buyer: tb.buyer });
    if (!ti.ok) return { kind: "FAIL", code: ti.code, reason: ti.reason, docId: inv.docId };
  }
  const r = await retryOnce(() =>
    db.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      const u = await tx.dormBill.updateMany({
        where: { id: b.id, tenantId, unitId, status: "DRAFT", sentVia: marker, updatedAt: b.updatedAt },
        data: { status: "SENT", accountDocumentId: inv.docId, sentAt: now, sentVia: channel },
      });
      if (u.count !== 1) return false;
      await emitOutbox(tx, {
        tenantId,
        type: EVENT,
        idempotencyKey: `${EVENT}:${b.id}`,
        unitId,
        payload: { unitId, runId, billId: b.id, leaseId: b.leaseId, periodKey: P, amountSatang: b.totalSatang },
      });
      return true;
    }, TX_OPTS),
  );
  if (r === "BUSY") return { kind: "FAIL", code: "RUN_BUSY", reason: "ฐานข้อมูลชนกันชั่วคราว — กดส่งอีกครั้ง (ใบเดิมจะถูกใช้ ไม่ออกซ้ำ)", docId: inv.docId };
  return r ? { kind: "SENT", docId: inv.docId } : { kind: "SKIP" };
}

/** ลิงก์จ่าย best-effort · จองต่อบิลด้วย CAS (paymentRequestId = claim:<ms>) ⇒ ลิงก์ 1 ต่อบิลแม้หลายโพรเซส */
function payLinker(g: G) {
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const finance = new Map<string, string | null>();
  let broken = false;
  const bookOf = async (docId: string): Promise<{ systemId: string; financeId: string | null } | null> => {
    const info = await docLinkInfo(g.tenantId, docId);
    if (!info) return null;
    if (!finance.has(info.systemId)) finance.set(info.systemId, await firstReceiveFinanceId({ tenantId: g.tenantId, systemId: info.systemId }));
    return { systemId: info.systemId, financeId: finance.get(info.systemId) ?? null };
  };
  const link = async (billId: string, docId: string, current: string | null = null): Promise<boolean> => {
    if (broken) return false;
    const bk = await bookOf(docId);
    if (!bk || !bk.financeId) {
      broken = true;
      return false;
    }
    const marker = `${CLAIM_PREFIX}${Date.now()}`;
    const staleBefore = `${CLAIM_PREFIX}${Date.now() - CLAIM_STALE_MS}`;
    const claim = await db.dormBill.updateMany({
      where: current
        ? { id: billId, status: { in: SENTISH }, paymentRequestId: current }
        : { id: billId, status: { in: SENTISH }, OR: [{ paymentRequestId: null }, { paymentRequestId: { startsWith: CLAIM_PREFIX, lt: staleBefore } }] },
      data: { paymentRequestId: marker },
    });
    if (claim.count !== 1) return true;
    const pr = await createPaymentRequestForDoc({ tenantId: g.tenantId, systemId: bk.systemId }, docId, { financeId: bk.financeId, userId: g.actorUserId });
    if (pr.ok) {
      await db.dormBill.updateMany({ where: { id: billId, paymentRequestId: marker }, data: { paymentRequestId: pr.request.id } });
      // F13: ลิงก์ยอดเก่าของเอกสารเดียวกัน (ก่อนใบลด/เพิ่มหนี้ หรือของผู้ส่งที่ตายกลางทาง) หมดผล ⇒ เหลือลิงก์รอชำระ 1 ใบต่อบิล
      await cancelOtherPendingPaymentRequests({ tenantId: g.tenantId, systemId: bk.systemId }, docId, pr.request.id, g.actorUserId);
      return true;
    }
    await db.dormBill.updateMany({ where: { id: billId, paymentRequestId: marker }, data: { paymentRequestId: current } });
    broken = true;
    return false;
  };
  const retryPending = async (runId: string, o: LoopOpts): Promise<void> => {
    const staleBefore = `${CLAIM_PREFIX}${Date.now() - CLAIM_STALE_MS}`;
    const pend = await db.dormBill.findMany({
      where: { runId, status: { in: SENTISH }, accountDocumentId: { not: null }, OR: [{ paymentRequestId: null }, { paymentRequestId: { startsWith: CLAIM_PREFIX, lt: staleBefore } }] },
      select: { id: true, accountDocumentId: true },
      take: 200,
    });
    for (const p of pend) {
      if (Date.now() - o.t0 + 1_000 >= o.budget || broken) break;
      if (p.accountDocumentId) await link(p.id, p.accountDocumentId);
    }
    // F18: ลิงก์ที่ชี้คำขอที่ถูกยกเลิก/หมดอายุ ⇒ ออกใหม่
    for (const p of await deadLinkBills(g, runId)) {
      if (Date.now() - o.t0 + 1_000 >= o.budget || broken) break;
      if (p.accountDocumentId) await link(p.id, p.accountDocumentId, p.paymentRequestId);
    }
  };
  return { link, retryPending };
}

/** หลังใบลด/เพิ่มหนี้: ลิงก์จ่ายยอดคงค้างใหม่ (ใช้ใบเดิมถ้ายอดตรง) แล้วยกเลิกลิงก์อื่นที่ยังรอชำระของเอกสารเดียวกัน */
async function refreshPayLink(g: G, billId: string, oldPr: string, systemId: string, docId: string): Promise<void> {
  try {
    const ctx = { tenantId: g.tenantId, systemId };
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const financeId = await firstReceiveFinanceId(ctx);
    const pr = financeId ? await createPaymentRequestForDoc(ctx, docId, { financeId, userId: g.actorUserId }) : null;
    const keep = pr && pr.ok ? pr.request.id : null;
    if (keep && keep !== oldPr) await db.dormBill.updateMany({ where: { id: billId, paymentRequestId: oldPr }, data: { paymentRequestId: keep } });
    // ลิงก์เดิมยอดเก่า ⇒ ยกเลิกเสมอ (ผู้เช่าห้ามจ่ายยอดเก่า) · ออกใหม่ไม่ได้เพราะช่องรับเงินปิด ⇒ ล้างค่าในบิลให้รอบส่งออกใหม่ภายหลัง (F18)
    await cancelOtherPendingPaymentRequests(ctx, docId, keep, g.actorUserId);
    if (!keep && !financeId) await db.dormBill.updateMany({ where: { id: billId, paymentRequestId: oldPr }, data: { paymentRequestId: null } });
  } catch (e) {
    await logFail("adjust.payLink", g.tenantId, e);
  }
}

// ───────────────────────── 3.7 แก้หลังส่ง = ใบลดหนี้/เพิ่มหนี้ ─────────────────────────
export async function adjustSentBill(
  ctx: BillingCtx,
  input: { unitId: string; billId: string; kind: "CREDIT" | "DEBIT"; reason: string; idempotencyKey: string; lines: { code: string; labelTh: string; amountSatang: number }[] },
): Promise<{ ok: true; docId: string; docNo: string | null; created: boolean; totalSatang: number } | Fail> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.bill.send");
    if (!g) return NOT_FOUND();
    const kind = input.kind;
    const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    const rawLines = input.lines;
    const linesOk =
      (kind === "CREDIT" || kind === "DEBIT") &&
      key.length >= 1 &&
      key.length <= 80 &&
      Array.isArray(rawLines) &&
      rawLines.length >= 1 &&
      rawLines.length <= MAX_ADJUST_LINES &&
      rawLines.every(
        (l) =>
          isRec(l) &&
          isStr(l.code) &&
          typeof l.labelTh === "string" &&
          l.labelTh.trim().length >= 1 &&
          [...l.labelTh.trim()].length <= 80 &&
          typeof l.amountSatang === "number" &&
          Number.isInteger(l.amountSatang) &&
          l.amountSatang > 0 &&
          l.amountSatang <= MAX_ADJUST_SATANG,
      );
    if (!linesOk) return fail("INVALID_INPUT", "รายการปรับยอดไม่ถูกต้อง — ต้องมีอย่างน้อย 1 รายการ ยอดเป็นจำนวนเต็มสตางค์มากกว่า 0");
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if ([...reason.replace(/\s+/g, "")].length < 10) return fail("REASON_REQUIRED", "กรุณาระบุเหตุผลการปรับยอดอย่างน้อย 10 ตัวอักษร (เก็บเป็นหลักฐาน)");
    const bill = await readBill(g, input.billId);
    if (!bill) return NOT_FOUND();
    if (!SENTISH.includes(bill.status) || !bill.accountDocumentId) return fail("NOT_SENT", "บิลนี้ยังไม่ได้ส่ง — แก้ในขั้นตรวจบิลได้เลย ไม่ต้องออกใบลด/เพิ่มหนี้");
    const vals = snapValuesOf(bill.policySnapshot) ?? {};
    const vat = vatOf(vals);
    const billLines = linesOf(bill.lines);
    const svc = taxKindsOf(vals).SERVICE ?? "VAT7";
    const docLines: ExternalDocLine[] = rawLines.map((l) => {
      const same = billLines.find((x) => x.code === l.code);
      const taxKind: TaxKind = same ? same.taxKind : vat.registered ? svc : "NONE";
      return { description: l.labelTh.trim(), qty: 1, unitPriceSatang: l.amountSatang, taxKind, meta: { code: l.code } };
    });
    const refId = `${bill.id}:${key}`;
    const info = await docLinkInfo(g.tenantId, bill.accountDocumentId);
    if (!info) return NOT_FOUND();
    const adjDb = tenantDb({ tenantId: g.tenantId, systemId: info.systemId });
    const amount = rawLines.reduce((sum, l) => sum + l.amountSatang, 0);
    if (kind === "CREDIT") {
      // F16: Σ ใบลดหนี้ (ไม่นับใบของคีย์เดียวกัน) + ใบนี้ ≤ ยอดคงค้างของใบแจ้งหนี้ — ตรวจก่อนเรียกบัญชี (บัญชีตรวจซ้ำใต้ล็อกอีกชั้น)
      const credits = await adjDb.accountDocument.findMany({
        where: { sourceDocId: info.docId, docType: "CREDIT_NOTE", status: { notIn: ["VOIDED", "CANCELLED", "DRAFT"] }, NOT: { refId } },
        select: { grandTotal: true },
      });
      const remaining = info.grandTotal - info.paidTotal - credits.reduce((sum, d) => sum + d.grandTotal, 0);
      if (amount > remaining) return fail("EXCEEDS_REMAINING", `ยอดลดหนี้ (฿${(amount / 100).toFixed(2)}) เกินยอดคงค้างของใบแจ้งหนี้ (฿${(Math.max(0, remaining) / 100).toFixed(2)})`);
    } else {
      // F14: ใบเพิ่มหนี้โค้ด LATE_FEE ต้องผ่านเพดานค่าปรับของสัญญา (ค่าปรับในบิล + ใบเพิ่มหนี้ค่าปรับเดิม + ใบนี้)
      const lateNew = rawLines.filter((l) => l.code === "LATE_FEE").reduce((sum, l) => sum + l.amountSatang, 0);
      if (lateNew > 0) {
        const prior = await tenantDb({ tenantId: g.tenantId }).auditLog.findMany({ where: { action: "dorm.bill.adjusted", targetType: "DormBill", targetId: bill.id }, select: { after: true } });
        const lateDebits = prior.reduce((sum, a) => {
          const x = isRec(a.after) ? a.after : {};
          return x.kind === "DEBIT" && x.key !== key && isNat(x.lateFeeSatang) ? sum + x.lateFeeSatang : sum;
        }, 0);
        const inBill = grossOf(billLines, (c) => c === "LATE_FEE");
        const lease = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormLease.findFirst({ where: { id: bill.leaseId }, select: { policySnapshot: true, rentSatang: true } });
        const [cur] = await resolveSettingsMany({ tenantId: g.tenantId }, LEASE_KEYS, [{ unitId: g.unitId, leaseId: bill.leaseId }]);
        const bad = lateFeeCheck(snapValuesOf(lease?.policySnapshot ?? null), { ...valsOf(cur), ...vals }, lease?.rentSatang ?? 0, inBill + lateDebits + lateNew);
        if (bad) return bad;
      }
    }
    // SVC D.3 ▸ (§2.5 ม.86/9 · 86/10) บิลมีใบกำกับที่ยังมีผล ⇒ ใบลด/เพิ่มหนี้อ้างเลขที่ + วันที่ใบกำกับ ◂
    const tiRef = (await liveTaxInvoicesFor(g.tenantId, [bill.accountDocumentId])).get(bill.accountDocumentId);
    const tiRow = tiRef ? await adjDb.accountDocument.findFirst({ where: { id: tiRef.docId }, select: { docNo: true, issueDate: true } }) : null;
    const tiNote = tiRow ? `อ้างอิงใบกำกับภาษีเลขที่ ${tiRow.docNo ?? "-"} ลงวันที่ ${thaiDateOf(bkkYmd(tiRow.issueDate))}` : null;
    const note = {
      tenantId: g.tenantId,
      unitId: g.unitId,
      sourceDocId: bill.accountDocumentId,
      refType: ADJUST_REF,
      refId,
      reason,
      lines: docLines,
      vat,
      issueDate: bkkYmd(new Date()),
      createdById: g.actorUserId,
      ...(tiNote ? { note: tiNote } : {}),
    };
    const r = kind === "CREDIT" ? await createExternalCreditNote(note) : await createExternalDebitNote(note);
    if (!r.ok) return fail(r.code, r.reason);
    // F6: audit 1 แถวต่อเอกสาร — เติมแม้คำตอบเป็น created:false (ล้มหลังออกเอกสารรอบก่อน) · ใต้ล็อกต่อเอกสาร (กดซ้ำพร้อมกันไม่ซ้ำ)
    const lateFeeSatang = rawLines.filter((l) => l.code === "LATE_FEE").reduce((sum, l) => sum + l.amountSatang, 0);
    await retryOnce(() =>
      tenantDb({ tenantId: g.tenantId }).$transaction(async (txRaw) => {
        const tx = txRaw as unknown as Tx;
        await advisoryLock(tx, `dorm.bill.adjusted:${r.docId}`);
        const has = await tx.auditLog.findFirst({
          where: { tenantId: g.tenantId, action: "dorm.bill.adjusted", targetId: bill.id, after: { path: ["docId"], equals: r.docId } },
          select: { id: true },
        });
        if (has) return;
        await tx.auditLog.create({
          data: {
            tenantId: g.tenantId,
            actorType: g.actorUserId ? "USER" : "SYSTEM",
            actorId: g.actorUserId,
            action: "dorm.bill.adjusted",
            targetType: "DormBill",
            targetId: bill.id,
            after: { billId: bill.id, kind, docId: r.docId, totalSatang: r.totalSatang, reason, key, lateFeeSatang },
          },
        });
      }, TX_OPTS),
    );
    // F13: ยอดคงค้างเปลี่ยน ⇒ ออกลิงก์จ่ายยอดใหม่ + ยกเลิกลิงก์ยอดเก่า (best-effort · บิลที่ยังไม่มีลิงก์ = รอบส่งเป็นคนออก)
    if (r.created && bill.paymentRequestId && !bill.paymentRequestId.startsWith(CLAIM_PREFIX)) await refreshPayLink(g, bill.id, bill.paymentRequestId, info.systemId, info.docId);
    return { ok: true, docId: r.docId, docNo: r.docNo, created: r.created, totalSatang: r.totalSatang };
  } catch (e) {
    await logFail("adjust", isRec(ctx) ? ctx.tenantId : null, e);
    return INTERNAL();
  }
}
