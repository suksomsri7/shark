// SVC D.12 ▸ ย้ายออก · ตรวจห้อง · สรุปเงิน · ส่งใบสรุป (ตรึง) · คืนเงินประกัน · งานตามเวลา — สัญญา ledger/svc-briefs/svc-brief-d.12.md §2–§3 · §6
//
// ชั้นตรวจ "เข้ม" (เงิน + สคบ. + ข้อมูลข้ามร้าน):
//   • ขอบเขต (X1): หน่วย DORM ของร้าน → Membership สด → dorm.moveout.manage → ขอบเขตอาคาร → ใบ/สัญญา/ห้อง/มิเตอร์/ไฟล์ของหน่วยนั้น ·
//     ไม่ผ่าน ⇒ NOT_FOUND เหตุผลเดียว (เขียน) / null (อ่าน) · ไม่ throw · ไม่ import prisma ดิบ (F5.1 — tenantDb + runDormMoneyTx)
//   • เงินออกจากประกันทางเดียว: settleSecurityDepositInTx (มติ R1) ใน tx เดียวกับสถานะใบ ⇒ "มี JV ⇔ สถานะปิด" · ค่าใช้จ่ายวันออก = ใบแจ้งหนี้ ·
//     แก้ใบสรุป = ใบลดหนี้ (ไม่ลบเอกสาร/JV ใด) · ประกันอ่านตามต้นสาย (มติ R2)
//   • ตรึงก่อนปิดเสมอ (มติ 4): ใบสรุปที่ผู้เช่าเห็น = บรรทัดที่ตรึง · ลายนิ้วมือของสาย (บิล · เอกสารบัญชี · การยกเว้นค่าปรับ · ตรวจห้อง · มิเตอร์)
//     ตรวจซ้ำใต้ล็อกตอนตรึงและตอนปิด — ต่าง ⇒ STALE (ไม่มีอะไรถูกเขียน)
//   • หักต้องมีหลักฐานที่แนบใบนี้ทุกโหมด · ค่าเสื่อมหักไม่ได้ทุกโหมด (มติ 5) · เกินวงเงิน ⇒ ผู้ถือ dorm.deposit.deduct.approve หรือคำขออนุมัติ (มติ 6 · R7)
//   • ลำดับล็อก (ห้ามสลับ): advisory dorm.lease:<ต้นสาย> → dorm.lease:<ตัวเอง> → dorm.latefee:<สัญญาในสาย> (ตรึง/ปิด) → แถว Tenant (ปิด) →
//     (รุ่น InTx ของบัญชี: ลิงก์หน่วย → เอกสาร) → แถวใบ/สัญญา (CAS) · ไม่มี connection ที่สองระหว่างถือ tx (ค่าตั้ง/ใบแจ้งหนี้/ข้อความ/ห้อง นอก tx)
//   • 40P01/P2034 ⇒ ลองใหม่ 1 ครั้ง ⇒ BUSY · วันที่ไทย (bkkYmd · สตริง YYYY-MM-DD) · ครบคืน = 00:00 ไทยของวันถัดจากวันครบ
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { getDef, renderTemplate, resolveSettings } from "@/lib/core/settings";
import { evaluateLegal, findForbiddenTerms, isValidOutOfScopeReason, normalizeLegalMode, resolveLegalParams } from "@/lib/core/settings/legal/th-rental-2568";
import { deleteFileAsset, privateFileUrl, uploadFile } from "@/lib/storage/service";
import {
  createExternalCreditNote,
  createExternalDebitNote,
  createExternalInvoice,
  runDormMoneyTx,
  securityDepositHeld,
  securityDepositHeldInTx,
  settleSecurityDepositInTx,
  type ExternalDocLine,
} from "@/lib/modules/account";
import { cancelRequest, listPoliciesForEntities, requestStatuses, resolvePolicy, submitForApproval } from "@/lib/modules/approval";
import { resizeOccupancy, setHkStatus } from "@/lib/modules/rooms";
import { occupiedDays, prorate, settleDeposit, utilityLine, type VatConfig } from "./calc";
import { lateFeeLedger, ledgerItemsOf } from "./latefee";
import {
  Abort,
  addDaysYmd,
  addMonthsKey,
  d12Gate,
  d12Tx as d12TxWith,
  daysBetween,
  dbDate,
  dimOf,
  emitLeaseEnded,
  fail,
  isFail,
  isInt,
  isRec,
  isStr,
  lateFeeLockKey,
  leaseChainOf,
  leaseLockKey,
  logD12,
  monthEndOf,
  notFound,
  parseYmd,
  rentMonthOfPeriod,
  rentTimingOf,
  roomVisible,
  TRANSFER_UTILITY_DONE,
  transferUtilityInvoice,
  unavailable,
  ymdOfDb,
  type ChangeFail,
  type D12Gate,
  type Tx,
} from "./lease-change";

// ───────────────────────── ชนิด (สัญญา §3) ─────────────────────────
export type MoveOutCtx = { tenantId: string; actorUserId: string };
type Fail = ChangeFail;
type Money = number;
export type SummaryLine = {
  code: "ELEC" | "WATER" | "RENT" | "COMMON" | "ADVANCE_RENT" | "LATE_FEE" | "DAMAGE" | "UNPAID";
  labelTh: string;
  amountSatang: Money;
  qty?: number;
  unitPriceSatang?: number | null;
  evidenceCount?: number;
  docId?: string | null;
  itemKey?: string;
};
export type MoveOutStatus = "NOTICE" | "INSPECTED" | "SETTLED" | "REFUNDED" | "CANCELLED";
export type MoveOutSummary = {
  moveOutId: string;
  leaseId: string;
  depositLeaseId: string;
  roomId: string;
  roomNumber: string;
  tenantName: string;
  status: MoveOutStatus;
  rev: number;
  noticeDate: string;
  moveOutDate: string;
  refundDueDate: string;
  daysLeft: number;
  refundOverdue: boolean;
  heldSatang: Money;
  lines: SummaryLine[];
  chargesSatang: Money;
  unpaidSatang: Money;
  deductSatang: Money;
  refundSatang: Money;
  tenantOwesSatang: Money;
  needsApproval: boolean;
  approval: { id: string | null; status: "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" };
  frozen: { hash: string; invoiceDocId: string | null; at: string } | null;
  sentAt: string | null;
  meters: { meterId: string; kind: "ELEC" | "WATER"; baseValue: number; value: number | null; units: number | null }[];
  items: { key: string; labelTh: string; verdict: "NORMAL" | "DAMAGE"; amountSatang: Money; evidenceCount: number }[];
  moveInPhotos: { fileId: string; url: string }[];
  warnings: string[];
  settled: { entryId: string | null; appliedSatang: Money; refundSatang: Money; at: string } | null;
};
export type MoveOutModel = MoveOutSummary & {
  unitName: string;
  returnDays: number;
  checklist: { key: string; labelTh: string; verdict: "NORMAL" | "DAMAGE" | null; amountSatang: Money; evidenceCount: number; note: string | null }[];
  canSettle: { ok: boolean; code: string | null };
  canSend: { ok: boolean; code: string | null };
  approver: boolean;
  moveInDate: string;
  meterReadAt: string | null;
  fileCount: number;
  // SVC D.12 (Y2) ▸ ข้อมูลฟอร์มตรวจห้อง/ปุ่มของจอ (ไม่มี path ไฟล์ · ไม่มี PII) ◂
  catalog: { code: string; labelTh: string; amountSatang: Money }[];
  files: { fileId: string; contentType: string; url: string }[];
  itemEvidence: Record<string, string[]>;
  itemDamageCode: Record<string, string | null>;
  canInspect: { ok: boolean; code: string | null };
  canReopen: { ok: boolean; code: string | null };
  canCancel: { ok: boolean; code: string | null };
  reopening: boolean;
  leaseStatus: string;
};

// ───────────────────────── ค่าคงที่ ─────────────────────────
const ENTITY = "dorm.moveout.deduction";
const EV_SETTLED = "dorm.moveout.settled";
const EV_DUE = "dorm.deposit.refund_due";
const A_OVERDUE = "dorm.deposit.refund_overdue";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_CALL = 20;
const MAX_FILES = 60;
const MAX_ITEMS = 50;
const MAX_ITEM_SATANG = 100_000_000; // ฿1,000,000
const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" };
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const CLOSED: readonly string[] = ["SETTLED", "REFUNDED"];
const LINE_ORDER: SummaryLine["code"][] = ["ELEC", "WATER", "RENT", "COMMON", "ADVANCE_RENT", "LATE_FEE", "DAMAGE", "UNPAID"];
const KEY_RE = /^[a-z0-9_]{1,24}$/;

/** ธุรกรรมเดียวของใบนี้ = runDormMoneyTx ของ facade บัญชี (connection เดียว · ปิดประกันรุ่น InTx อยู่ใน tx เดียวกับสถานะใบ) · 40P01 ⇒ ลองใหม่ 1 ครั้ง ⇒ BUSY */
const d12Tx = <T,>(fn: (tx: Tx) => Promise<T>) => d12TxWith<T>(fn, (f) => runDormMoneyTx(f));
/** ล็อกต่อคีย์ (advisory xact — ปล่อยเองตอน commit/rollback) */
async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

const nowOf = (d: unknown): Date => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date());
const pad2 = (n: number) => String(n).padStart(2, "0");
const thMonth = (p: string) => `${TH_MONTHS[Number(p.slice(5, 7)) - 1] ?? ""} ${Number(p.slice(0, 4)) + 543}`;
const thDate = (ymd: string) => (parseYmd(ymd) ? `${Number(ymd.slice(8, 10))} ${TH_MONTHS[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(0, 4)) + 543}` : ymd);
function baht(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  return `${satang < 0 ? "-" : ""}฿${Math.trunc(a / 100).toLocaleString("en-US")}.${pad2(a % 100)}`;
}
/** 00:00 เวลาไทยของวันถัดจากวันครบ (มติ 11 · เช่น ครบ 7 พ.ย. ⇒ 2026-11-07T17:00:00.000Z) */
const dueAtOf = (dueYmd: string) => new Date(`${addDaysYmd(dueYmd, 1)}T00:00:00+07:00`);
const dueYmdOf = (dueAt: Date) => addDaysYmd(bkkYmd(dueAt), -1);
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
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;

// ───────────────────────── รูปทรง JSON (§2.4) ─────────────────────────
type InspItem = { key: string; labelTh: string; verdict: "NORMAL" | "DAMAGE"; damageCode: string | null; amountSatang: number; evidenceFileIds: string[]; note: string | null };
type InspMeter = { meterId: string; kind: "ELEC" | "WATER"; baseValue: number; value: number; units: number };
type InspFile = { fileId: string; contentType: string; at: string };
type Insp = {
  originalEndDate: string;
  noticeDate: string;
  shortNoticeReason: string | null;
  files: InspFile[];
  items: InspItem[];
  meters: InspMeter[];
  inspectedAt: string | null;
  inspectedById: string | null;
  hkMarkedAt: string | null;
};
type Frozen = {
  hash: string;
  at: string;
  invoiceDocId: string | null;
  docIds: string[];
  approvalId: string | null;
  lines: SummaryLine[];
  heldSatang: number;
  refundSatang: number;
  tenantOwesSatang: number;
  needsApproval: boolean;
  sentAt?: string | null;
  /** SVC D.12 (Y15) ▸ บรรทัด/VAT ที่ลงใบวันออกจริง ณ ตอนตรึง — ใบลดหนี้ตอน reopen ใช้ชุดนี้ (ไม่ใช่ค่าตั้งปัจจุบัน) ◂ */
  invLines: ExternalDocLine[];
  vat: VatConfig | null;
  /** SVC D.12 (Y16) ▸ ผู้ถือ dorm.deposit.deduct.approve ที่ตรึงใบเกินวงเงินเอง (อนุมัติตัวเอง · มี audit) ⇒ ผู้ไม่มีคีย์ปิดได้ไม่เกินยอดที่ตรึง ◂ */
  selfApprovedById: string | null;
  /** SVC D.12 (Y23) ▸ ใบลดหนี้ค่าห้องส่วนเกินที่ต้องออกหลังตรึง (ยอดสะท้อนในบรรทัด UNPAID ที่ตรึงแล้ว) ◂ */
  rentCredit: { billDocId: string; amount: number; refId: string; labelTh: string } | null;
};
/** ประวัติรุ่น — pending = จองรุ่นไว้ใต้ล็อกก่อนออกใบวันออก (Y1 แบบ D.8 F1) · lines/vat/totalSatang = ของใบที่ออก (Y4 ใบลดหนี้ใบกำพร้าใช้ชุดเดิม) */
type Hist = {
  rev: number;
  invoiceDocId: string | null;
  creditNoteDocId: string | null;
  reason: string;
  at: string;
  pending?: boolean;
  lines?: ExternalDocLine[];
  vat?: VatConfig | null;
  totalSatang?: number | null;
};
type Settle = { key: string; entryId: string | null; at: string; status: "SETTLED" | "REFUNDED"; heldSatang: number; appliedSatang: number; refundSatang: number; tenantOwesSatang: number };
/** reopening (Y5) = จังหวะ 1 ของการเปิดใบสรุปใหม่ (ตั้งใต้ล็อก — ปิดประกันปฏิเสธ) ก่อนออกใบลดหนี้ · จังหวะ 2 ขึ้นรุ่นแล้วล้าง */
type Ded = { rev: number; frozen: Frozen | null; history: Hist[]; settle: Settle | null; reopening: { rev: number; at: string; by: string; reason: string } | null };

const strOr = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);
function inspOf(v: unknown): Insp {
  const r = isRec(v) ? v : {};
  const items: InspItem[] = [];
  if (Array.isArray(r.items))
    for (const x of r.items)
      if (isRec(x) && isStr(x.key))
        items.push({
          key: x.key,
          labelTh: strOr(x.labelTh, x.key),
          verdict: x.verdict === "DAMAGE" ? "DAMAGE" : "NORMAL",
          damageCode: strOrNull(x.damageCode),
          amountSatang: isNat(x.amountSatang) ? x.amountSatang : 0,
          evidenceFileIds: Array.isArray(x.evidenceFileIds) ? x.evidenceFileIds.filter((f): f is string => typeof f === "string") : [],
          note: strOrNull(x.note),
        });
  const meters: InspMeter[] = [];
  if (Array.isArray(r.meters))
    for (const x of r.meters)
      if (isRec(x) && isStr(x.meterId) && (x.kind === "ELEC" || x.kind === "WATER") && isNat(x.value))
        meters.push({ meterId: x.meterId, kind: x.kind, baseValue: isNat(x.baseValue) ? x.baseValue : 0, value: x.value, units: isNat(x.units) ? x.units : 0 });
  const files: InspFile[] = [];
  if (Array.isArray(r.files)) for (const x of r.files) if (isRec(x) && isStr(x.fileId)) files.push({ fileId: x.fileId, contentType: strOr(x.contentType, ""), at: strOr(x.at, "") });
  return {
    originalEndDate: strOr(r.originalEndDate, ""),
    noticeDate: strOr(r.noticeDate, ""),
    shortNoticeReason: strOrNull(r.shortNoticeReason),
    files,
    items,
    meters,
    inspectedAt: strOrNull(r.inspectedAt),
    inspectedById: strOrNull(r.inspectedById),
    hkMarkedAt: strOrNull(r.hkMarkedAt),
  };
}
function linesOf(v: unknown): SummaryLine[] {
  if (!Array.isArray(v)) return [];
  const out: SummaryLine[] = [];
  for (const x of v)
    if (isRec(x) && typeof x.code === "string" && (LINE_ORDER as string[]).includes(x.code) && isInt(x.amountSatang))
      out.push({
        code: x.code as SummaryLine["code"],
        labelTh: strOr(x.labelTh, ""),
        amountSatang: x.amountSatang,
        ...(isInt(x.qty) ? { qty: x.qty } : {}),
        ...(x.unitPriceSatang === null || isInt(x.unitPriceSatang) ? { unitPriceSatang: x.unitPriceSatang as number | null } : {}),
        ...(isInt(x.evidenceCount) ? { evidenceCount: x.evidenceCount } : {}),
        ...(typeof x.docId === "string" || x.docId === null ? { docId: x.docId as string | null } : {}),
        ...(typeof x.itemKey === "string" ? { itemKey: x.itemKey } : {}),
      });
  return out;
}
const TAXK: readonly string[] = ["EXEMPT", "VAT7", "NONE"];
function docLinesOf(v: unknown): ExternalDocLine[] {
  if (!Array.isArray(v)) return [];
  const out: ExternalDocLine[] = [];
  for (const x of v)
    if (isRec(x) && typeof x.description === "string" && isNat(x.qty) && isNat(x.unitPriceSatang) && typeof x.taxKind === "string" && TAXK.includes(x.taxKind))
      out.push({ description: x.description, qty: x.qty, unitPriceSatang: x.unitPriceSatang, taxKind: x.taxKind as TaxKind });
  return out;
}
const vatCfgOf = (v: unknown): VatConfig | null => (isRec(v) && typeof v.registered === "boolean" && typeof v.pricesIncludeVat === "boolean" ? { registered: v.registered, pricesIncludeVat: v.pricesIncludeVat } : null);
function dedOf(v: unknown): Ded {
  const r = isRec(v) ? v : {};
  const f = isRec(r.frozen) ? r.frozen : null;
  const s = isRec(r.settle) ? r.settle : null;
  const ro = isRec(r.reopening) ? r.reopening : null;
  return {
    rev: isInt(r.rev) && r.rev >= 1 ? r.rev : 1,
    frozen: f
      ? {
          hash: strOr(f.hash, ""),
          at: strOr(f.at, ""),
          invoiceDocId: strOrNull(f.invoiceDocId),
          docIds: Array.isArray(f.docIds) ? f.docIds.filter((x): x is string => typeof x === "string") : [],
          approvalId: strOrNull(f.approvalId),
          lines: linesOf(f.lines),
          heldSatang: isNat(f.heldSatang) ? f.heldSatang : 0,
          refundSatang: isNat(f.refundSatang) ? f.refundSatang : 0,
          tenantOwesSatang: isNat(f.tenantOwesSatang) ? f.tenantOwesSatang : 0,
          needsApproval: f.needsApproval === true,
          sentAt: strOrNull(f.sentAt),
          invLines: docLinesOf(f.invLines),
          vat: vatCfgOf(f.vat),
          selfApprovedById: strOrNull(f.selfApprovedById),
          rentCredit:
            isRec(f.rentCredit) && isStr(f.rentCredit.billDocId) && isNat(f.rentCredit.amount) && isStr(f.rentCredit.refId)
              ? { billDocId: f.rentCredit.billDocId, amount: f.rentCredit.amount, refId: f.rentCredit.refId, labelTh: strOr(f.rentCredit.labelTh, "คืนค่าห้องส่วนเกิน") }
              : null,
        }
      : null,
    history: Array.isArray(r.history)
      ? r.history.filter(isRec).map((h) => ({
          rev: isInt(h.rev) ? h.rev : 0,
          invoiceDocId: strOrNull(h.invoiceDocId),
          creditNoteDocId: strOrNull(h.creditNoteDocId),
          reason: strOr(h.reason, ""),
          at: strOr(h.at, ""),
          ...(h.pending === true ? { pending: true } : {}),
          ...(Array.isArray(h.lines) ? { lines: docLinesOf(h.lines) } : {}),
          ...(isRec(h.vat) ? { vat: vatCfgOf(h.vat) } : {}),
          ...(isInt(h.totalSatang) ? { totalSatang: h.totalSatang } : {}),
        }))
      : [],
    reopening: ro && isInt(ro.rev) ? { rev: ro.rev, at: strOr(ro.at, ""), by: strOr(ro.by, ""), reason: strOr(ro.reason, "") } : null,
    settle: s
      ? {
          key: strOr(s.key, ""),
          entryId: strOrNull(s.entryId),
          at: strOr(s.at, ""),
          status: s.status === "REFUNDED" ? "REFUNDED" : "SETTLED",
          heldSatang: isNat(s.heldSatang) ? s.heldSatang : 0,
          appliedSatang: isNat(s.appliedSatang) ? s.appliedSatang : 0,
          refundSatang: isNat(s.refundSatang) ? s.refundSatang : 0,
          tenantOwesSatang: isNat(s.tenantOwesSatang) ? s.tenantOwesSatang : 0,
        }
      : null,
  };
}
const json = (v: unknown) => v as Prisma.InputJsonValue;

// ───────────────────────── อ่านใบ · สัญญา ─────────────────────────
const MO_SELECT = {
  id: true,
  unitId: true,
  leaseId: true,
  status: true,
  noticeAt: true,
  moveOutDate: true,
  inspection: true,
  deductions: true,
  depositSatang: true,
  deductSatang: true,
  refundSatang: true,
  refundDueAt: true,
  refundedAt: true,
  settlementDocumentId: true,
  approvalId: true,
  lease: {
    select: {
      id: true,
      roomId: true,
      partyId: true,
      status: true,
      startDate: true,
      endDate: true,
      rentSatang: true,
      commonFeeSatang: true,
      advanceRentSatang: true,
      occupancyId: true,
      moveInPhotos: true,
      policySnapshot: true,
      previousLeaseId: true,
    },
  },
} as const;
type MoRow = {
  id: string;
  unitId: string;
  leaseId: string;
  status: string;
  noticeAt: Date;
  moveOutDate: Date;
  inspection: Prisma.JsonValue;
  deductions: Prisma.JsonValue;
  depositSatang: number;
  deductSatang: number;
  refundSatang: number;
  refundDueAt: Date | null;
  refundedAt: Date | null;
  settlementDocumentId: string | null;
  approvalId: string | null;
  lease: {
    id: string;
    roomId: string;
    partyId: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    rentSatang: number;
    commonFeeSatang: number;
    advanceRentSatang: number;
    occupancyId: string | null;
    moveInPhotos: Prisma.JsonValue;
    policySnapshot: Prisma.JsonValue;
    previousLeaseId: string | null;
  };
};
async function readMo(g: D12Gate, moveOutId: unknown): Promise<MoRow | null> {
  if (!isStr(moveOutId)) return null;
  const mo = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormMoveOut.findFirst({ where: { id: moveOutId }, select: MO_SELECT });
  return mo && roomVisible(g, mo.lease.roomId) ? mo : null;
}
const snapVal = (snap: unknown, key: string): unknown => (isRec(snap) && isRec(snap.values) && Object.prototype.hasOwnProperty.call(snap.values, key) ? snap.values[key] : undefined);

// ───────────────────────── ค่าตั้งของหน่วย (อ่านนอก tx เสมอ) ─────────────────────────
const UNIT_KEYS = [
  "rooms.utility.elec.method",
  "rooms.utility.water.method",
  "rooms.utility.elec.fixedRate",
  "rooms.utility.water.fixedRate",
  "rooms.vat.registered",
  "rooms.vat.pricesIncludeVat",
  "rooms.vat.taxKinds",
  "rooms.deposit.approvalThreshold",
  "rooms.deposit.damageCatalog",
  "rooms.deposit.returnDays",
  "rooms.moveout.noticeDays",
  "rooms.billing.prorate",
  "rooms.legal.mode",
  "rooms.legal.outOfScopeReason",
  "rooms.moveout.checklist",
  "rooms.msg.moveOutSummary",
];
type UnitVals = Record<string, unknown>;
async function unitVals(tenantId: string, unitId: string, roomId?: string): Promise<UnitVals> {
  const r = await resolveSettings({ tenantId }, UNIT_KEYS, roomId ? { unitId, roomId } : { unitId });
  const out: UnitVals = {};
  for (const k of UNIT_KEYS) out[k] = r[k]?.value;
  return out;
}
const vatOf = (uv: UnitVals): VatConfig => ({ registered: uv["rooms.vat.registered"] === true, pricesIncludeVat: uv["rooms.vat.pricesIncludeVat"] !== false });
type TaxKind = "EXEMPT" | "VAT7" | "NONE";
const isTaxKind = (v: unknown): v is TaxKind => v === "EXEMPT" || v === "VAT7" || v === "NONE";
function taxKindOf(uv: UnitVals, code: SummaryLine["code"]): TaxKind {
  if (code === "RENT" || code === "ADVANCE_RENT") return "EXEMPT";
  if (!vatOf(uv).registered) return "NONE"; // หอไม่จด VAT ⇒ ไม่มีบรรทัดภาษี
  const raw = uv["rooms.vat.taxKinds"];
  const m = isRec(raw) ? raw : {};
  if (code === "ELEC" || code === "WATER") return isTaxKind(m[code]) ? m[code] : "VAT7";
  if (code === "COMMON") return isTaxKind(m.COMMON) ? m.COMMON : "VAT7";
  if (code === "LATE_FEE") return isTaxKind(m.LATE_FEE) ? m.LATE_FEE : "NONE";
  return "NONE"; // DAMAGE — ค่าเริ่ม NONE (⚠️ J4)
}
const legalCtxOf = (uv: UnitVals) => ({
  mode: normalizeLegalMode(uv["rooms.legal.mode"]),
  outOfScopeReason: typeof uv["rooms.legal.outOfScopeReason"] === "string" ? (uv["rooms.legal.outOfScopeReason"] as string) : null,
});
function catalogOf(uv: UnitVals): Map<string, { labelTh: string; amountSatang: number }> {
  const out = new Map<string, { labelTh: string; amountSatang: number }>();
  const raw = uv["rooms.deposit.damageCatalog"];
  if (Array.isArray(raw)) for (const x of raw) if (isRec(x) && isStr(x.code) && isNat(x.amountSatang)) out.set(x.code, { labelTh: strOr(x.labelTh, x.code), amountSatang: x.amountSatang });
  return out;
}

/** กำหนดคืน (มติ 11): วันออก + returnDays ของ snapshot · STRICT และเกินพารามิเตอร์กฎหมาย ⇒ ตัดเหลือเพดาน + legal */
function refundDueOf(moveOutDate: string, snap: unknown, uv: UnitVals): { dueDate: string; returnDays: number; legal: { code: string; messageTh: string } | null } {
  const sv = snapVal(snap, "rooms.deposit.returnDays");
  const days = isNat(sv) ? sv : isNat(uv["rooms.deposit.returnDays"]) ? (uv["rooms.deposit.returnDays"] as number) : 7;
  const lctx = legalCtxOf(uv);
  const o = evaluateLegal("DEPOSIT_RETURN_DAYS", { days }, lctx);
  if (o.level === "BLOCK" && lctx.mode === "STRICT") {
    const max = resolveLegalParams(null).depositReturnMaxDays;
    const cap = isNat(max) ? Math.min(days, max) : days;
    return { dueDate: addDaysYmd(moveOutDate, cap), returnDays: cap, legal: { code: o.code, messageTh: o.messageTh } };
  }
  return { dueDate: addDaysYmd(moveOutDate, days), returnDays: days, legal: o.level === "OK" ? null : { code: o.code, messageTh: o.messageTh } };
}

// ───────────────────────── ลายนิ้วมือของสาย (ตรวจ STALE ใต้ล็อก) ─────────────────────────
type SigDb = Pick<Tx, "dormBill" | "dormMeterReading" | "dormMoveOut" | "$queryRaw">;
type BillRow = { id: string; leaseId: string; roomId: string; periodKey: string; status: string; sentVia: string | null; totalSatang: number; accountDocumentId: string | null; dueDate: Date | null; lines: Prisma.JsonValue };
const BILL_SEL = { id: true, leaseId: true, roomId: true, periodKey: true, status: true, sentVia: true, totalSatang: true, accountDocumentId: true, dueDate: true, lines: true } as const;
/** SVC D.12 (Y9) ▸ ใบลดหนี้ค่าห้องส่วนเกินของบิลเดือนวันออก — ref idempotent ต่อ (ใบย้ายออก, วันออก) */
const RENT_CREDIT_REF = "DormMoveOutRentCredit";
/** SVC D.12 (Y23) ▸ ต่อรุ่นที่ตรึง (ออกหลังตรึงสำเร็จ) · กลับรายการตอนยกเลิกด้วยใบเพิ่มหนี้ ref RENT_CREDIT_REVERSE/<เลขใบลดหนี้> ◂ */
const rentCreditRefId = (moveOutId: string, moveOutDate: string, rev: number) => `${moveOutId}:${moveOutDate}:r${rev}`;
const RENT_CREDIT_REVERSE = "DormMoveOutRentCreditReverse";
const LIVE_ST = (st: string) => !["VOIDED", "CANCELLED", "DRAFT"].includes(st);
type DocHead = { id: string; docType: string; docNo: string | null; status: string; grandTotal: number; paidTotal: number; sourceDocId: string | null; refType: string | null; refId: string | null; dueDate: Date | null; issueDate: Date | null };

/** เอกสารบัญชีของสาย: ใบแจ้งหนี้ของบิล + ใบลด/เพิ่มหนี้ของใบเหล่านั้น + ใบค่าน้ำไฟย้ายห้อง (DormTransfer) — อ่านผ่าน db/tx ของผู้เรียก (ผูกร้านทุกคำสั่ง) */
async function chainDocs(db: SigDb, tenantId: string, unitId: string, chain: string[], bills: BillRow[]): Promise<{ heads: DocHead[]; pays: Map<string, number>; cns: Map<string, number> }> {
  const billDocs = bills.map((b) => b.accountDocumentId).filter((x): x is string => !!x);
  const heads = await db.$queryRaw<DocHead[]>`
    SELECT "id", "docType"::text AS "docType", "docNo", "status"::text AS "status", "grandTotal", "paidTotal", "sourceDocId", "refType", "refId", "dueDate", "issueDate"
    FROM "AccountDocument"
    WHERE "tenantId" = ${tenantId} AND "source"::text = 'DORM' AND "refSystemId" = ${unitId}
      AND ("id" = ANY(${billDocs}::text[])
        OR ("sourceDocId" = ANY(${billDocs}::text[]) AND "docType"::text IN ('DEBIT_NOTE', 'CREDIT_NOTE'))
        OR ("refType" = 'DormTransfer' AND "refId" = ANY(${chain}::text[])))
    ORDER BY "id" ASC`;
  const ids = heads.map((h) => h.id);
  const payRows = ids.length
    ? await db.$queryRaw<{ documentId: string; amount: number; wht: number }[]>`
        SELECT "documentId", "amount", COALESCE("whtAmountSatang", 0) AS "wht" FROM "AccountDocumentPayment" WHERE "tenantId" = ${tenantId} AND "documentId" = ANY(${ids}::text[]) AND "voidedAt" IS NULL`
    : [];
  const pays = new Map<string, number>();
  for (const p of payRows) pays.set(p.documentId, (pays.get(p.documentId) ?? 0) + Math.max(0, Number(p.amount)) + Math.max(0, Number(p.wht)));
  const cns = new Map<string, number>();
  for (const h of heads)
    if (h.docType === "CREDIT_NOTE" && h.sourceDocId && !["VOIDED", "CANCELLED", "DRAFT"].includes(h.status)) cns.set(h.sourceDocId, (cns.get(h.sourceDocId) ?? 0) + Number(h.grandTotal));
  return { heads, pays, cns };
}
/** หนี้ค้างของสาย (มติ 10) — ใบแจ้งหนี้/ใบเพิ่มหนี้ที่ยังมีผล เรียงวันครบเก่าก่อน · ยอดจากบัญชี (ไม่ใช่ DormBill.paidSatang) */
function unpaidOf(d: { heads: DocHead[]; pays: Map<string, number>; cns: Map<string, number> }, bills: BillRow[]): { docId: string; docNo: string | null; amount: number; labelTh: string; due: string }[] {
  const billOfDoc = new Map(bills.filter((b) => b.accountDocumentId).map((b) => [b.accountDocumentId as string, b]));
  const out: { docId: string; docNo: string | null; amount: number; labelTh: string; due: string }[] = [];
  for (const h of d.heads) {
    if (h.docType !== "INVOICE" && h.docType !== "DEBIT_NOTE") continue;
    if (["VOIDED", "CANCELLED", "DRAFT"].includes(h.status)) continue;
    const amount = Math.max(0, Number(h.grandTotal) - (d.pays.get(h.id) ?? 0) - (d.cns.get(h.id) ?? 0));
    if (amount <= 0) continue;
    const b = billOfDoc.get(h.id) ?? (h.sourceDocId ? billOfDoc.get(h.sourceDocId) : undefined);
    const due = ymdOfDb(h.dueDate) || ymdOfDb(b?.dueDate) || ymdOfDb(h.issueDate) || "9999-12-31";
    const labelTh =
      h.docType === "DEBIT_NOTE"
        ? `ค้างชำระ ใบเพิ่มหนี้${b ? ` งวด ${thMonth(b.periodKey)}` : ""}`
        : h.refType === "DormTransfer"
          ? "ค้างชำระ ค่าน้ำไฟห้องเดิม (ย้ายห้อง)"
          : `ค้างชำระ บิล${b ? ` งวด ${thMonth(b.periodKey)}` : ""}`;
    out.push({ docId: h.id, docNo: h.docNo, amount, labelTh, due });
  }
  out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.docId < b.docId ? -1 : 1));
  return out;
}
/** ลายนิ้วมือของสาย = บิล · เอกสาร (ยอด/ชำระ/สถานะ) · การยกเว้นค่าปรับ · ตรวจห้อง · มิเตอร์วันออก — อ่านผ่าน db/tx เดียวกันทั้งนอกและใน tx */
/**
 * SVC D.12 (Y19) ▸ inspection = สแนปช็อตตรวจห้องที่ผู้เรียกใช้คำนวณบรรทัดจริง (นอก tx ส่งค่าของ mo ที่ป้อน computeLive) ·
 *   ไม่ส่ง ⇒ อ่านสดผ่าน db/tx (ใต้ล็อก) — ตรวจห้องที่ commit ระหว่างอ่านใบกับอ่านลายนิ้วมือ ⇒ hash ไม่เท่า ⇒ STALE (ไม่ตรึงบรรทัดเก่า) ◂
 */
async function chainSig(db: SigDb, tenantId: string, unitId: string, chain: string[], moveOutId: string, leaseId: string, heldSatang: number, inspection?: Prisma.JsonValue): Promise<string> {
  const bills: BillRow[] = await db.dormBill.findMany({ where: { tenantId, unitId, leaseId: { in: chain }, status: { not: "VOID" } }, select: BILL_SEL, orderBy: { id: "asc" } });
  const d = await chainDocs(db, tenantId, unitId, chain, bills);
  const billIds = bills.map((b) => b.id);
  const waived = billIds.length
    ? await db.$queryRaw<{ targetId: string }[]>`SELECT "targetId" FROM "AuditLog" WHERE "tenantId" = ${tenantId} AND "action" = 'dorm.latefee.waived' AND "targetId" = ANY(${billIds}::text[]) ORDER BY "targetId" ASC`
    : [];
  const insp = inspOf(inspection !== undefined ? inspection : (await db.dormMoveOut.findFirst({ where: { tenantId, unitId, id: moveOutId }, select: { inspection: true } }))?.inspection);
  const reads = await db.dormMeterReading.findMany({ where: { tenantId, unitId, leaseId, kind: "MOVE_OUT" }, select: { meterId: true, value: true }, orderBy: { meterId: "asc" } });
  return createHash("sha256")
    .update(
      canon({
        bills: bills.map((b) => [b.id, b.status, b.totalSatang, b.accountDocumentId, typeof b.sentVia === "string" && b.sentVia.startsWith("sending:")]),
        // Y23 ▸ ใบลดหนี้ค่าห้องส่วนเกินของใบนี้ออกหลังตรึง (ยอดอยู่ในบรรทัดที่ตรึงแล้ว) ⇒ ไม่อยู่ในลายนิ้วมือ ◂
        docs: d.heads.filter((h) => !(h.docType === "CREDIT_NOTE" && h.refType === RENT_CREDIT_REF && (h.refId ?? "").startsWith(`${moveOutId}:`))).map((h) => [h.id, h.docType, h.status, Number(h.grandTotal), d.pays.get(h.id) ?? 0]),
        waived: waived.map((w) => w.targetId),
        items: insp.items,
        meters: insp.meters,
        files: insp.files.map((f) => f.fileId),
        reads: reads.map((r) => [r.meterId, r.value]),
        held: heldSatang, // SVC D.12 (Y10) ▸ ยอดถือของต้นสายอยู่ในลายนิ้วมือ ◂
      }),
    )
    .digest("hex");
}
const scopedDb = (tenantId: string, unitId: string) => tenantDb({ tenantId, unitId }) as unknown as Tx;
const billPending = (bills: { status: string; sentVia: string | null }[]) => bills.some((b) => b.status === "DRAFT" || b.status === "HELD" || (typeof b.sentVia === "string" && b.sentVia.startsWith("sending:")));
const BILL_PENDING = () => fail("BILL_PENDING", "สัญญานี้มีบิลที่ยังเป็นร่าง/พักไว้/กำลังส่ง — ส่งหรือลบบิลนั้นในรอบบิลก่อน แล้วค่อยทำต่อ");
const STALE = () => fail("STALE", "ข้อมูลของสัญญาเปลี่ยนหลังส่งใบสรุป (บิล/ใบเพิ่มหนี้/การรับชำระ/ค่าปรับ/ตรวจห้อง) — เปิดใบสรุปใหม่แล้วส่งให้ผู้เช่าอีกครั้ง");

// ───────────────────────── ค่าน้ำไฟถึงวันออก (มติ 7) ─────────────────────────
type MeterCalc = { meterId: string; kind: "ELEC" | "WATER"; baseValue: number | null; value: number | null; units: number | null; amount: number; rate: number | null };
/** เลขฐาน = meta.to ของบรรทัดน้ำ/ไฟในบิลล่าสุด (ตามงวด) ที่ไม่ VOID ของสาย · ไม่มี ⇒ MOVE_IN ของสายสัญญา · ไม่มี ⇒ null */
async function baseReadings(tenantId: string, unitId: string, chain: string[], bills: BillRow[], meters: { id: string; kind: string }[], roomId: string): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  // SVC D.12 (Y8) ▸ เฉพาะบิลของห้องนี้ (สายที่ย้ายห้องมา — บิลห้องเดิมเป็นมิเตอร์อื่น) · ไม่มี ⇒ MOVE_IN ของมิเตอร์นั้นในสาย ◂
  // SVC D.12 (Y26) ▸ เฉพาะ "ช่วงที่อยู่ห้องนี้ครั้งล่าสุด" = สัญญาท้ายสายที่ต่อเนื่องกันในห้องนี้ (A→B→A ไม่ใช้บิล/MOVE_IN ของช่วง A แรก) ◂
  const rows = chain.length ? await tenantDb({ tenantId, unitId }).dormLease.findMany({ where: { id: { in: chain } }, select: { id: true, roomId: true } }) : [];
  const roomOf = new Map(rows.map((r) => [r.id, r.roomId]));
  const stint: string[] = [];
  for (let i = chain.length - 1; i >= 0 && roomOf.get(chain[i]) === roomId; i--) stint.unshift(chain[i]);
  chain = stint;
  const sorted = bills.filter((b) => b.roomId === roomId && stint.includes(b.leaseId)).sort((a, b) => (a.periodKey < b.periodKey ? 1 : a.periodKey > b.periodKey ? -1 : 0));
  const fromBill = (kind: string): number | null => {
    for (const b of sorted) {
      if (!Array.isArray(b.lines)) continue;
      const l = b.lines.find((x) => isRec(x) && x.code === kind && isRec(x.meta) && isNat(x.meta.to));
      if (isRec(l) && isRec(l.meta) && isNat(l.meta.to)) return l.meta.to;
    }
    return null;
  };
  const moveIns = meters.length
    ? await tenantDb({ tenantId, unitId }).dormMeterReading.findMany({ where: { kind: "MOVE_IN", leaseId: { in: chain }, meterId: { in: meters.map((m) => m.id) } }, select: { meterId: true, value: true, readAt: true }, orderBy: { readAt: "desc" } })
    : [];
  for (const m of meters) out.set(m.id, fromBill(m.kind) ?? moveIns.find((r) => r.meterId === m.id)?.value ?? null);
  return out;
}
/** อัตราต่อหน่วยตามวิธีคิดปัจจุบันของหน่วย: FIXED_RATE = ค่าตั้ง · ACTUAL_COST = อัตรางวดเดือนวันออก (ไม่มี ⇒ งวดล่าสุดก่อนหน้า + warning) */
async function rateOf(tenantId: string, unitId: string, buildingId: string | null, kind: "ELEC" | "WATER", month: string, uv: UnitVals, warnings: string[]): Promise<number | null> {
  const k = kind === "ELEC" ? "elec" : "water";
  const method = uv[`rooms.utility.${k}.method`];
  if (method === "FIXED_RATE") {
    const r = uv[`rooms.utility.${k}.fixedRate`];
    if (isNat(r)) return r;
    warnings.push(`RATE_MISSING:${kind}`);
    return null;
  }
  if (method === undefined || method === "ACTUAL_COST") {
    const rows = await tenantDb({ tenantId, unitId }).dormUtilityRate.findMany({
      where: { kind, periodKey: { lte: month }, rateSatangPerUnit: { not: null }, OR: [{ buildingId: null }, ...(buildingId ? [{ buildingId }] : [])] },
      select: { periodKey: true, rateSatangPerUnit: true, buildingId: true },
      orderBy: [{ periodKey: "desc" }],
      take: 10,
    });
    const best = rows.find((r) => r.buildingId === buildingId && r.periodKey === rows[0]?.periodKey) ?? rows[0];
    if (!best || !isNat(best.rateSatangPerUnit)) {
      warnings.push(`RATE_MISSING:${kind}`);
      return null;
    }
    if (best.periodKey !== month) warnings.push(`RATE_FROM:${best.periodKey}`);
    return best.rateSatangPerUnit;
  }
  warnings.push(`METHOD_UNSUPPORTED:${kind}:${String(method)}`); // หนี้: TARIFF/FLAT วันย้ายออก
  return null;
}
async function meterCalcs(tenantId: string, unitId: string, lease: { id: string; roomId: string }, chain: string[], bills: BillRow[], month: string, uv: UnitVals, warnings: string[]): Promise<MeterCalc[]> {
  const db = tenantDb({ tenantId, unitId });
  const meters = await db.dormMeter.findMany({ where: { roomId: lease.roomId, role: "ROOM", removedAt: null }, select: { id: true, kind: true }, orderBy: [{ kind: "asc" }, { id: "asc" }] });
  if (!meters.length) return [];
  const room = await db.hotelRoom.findFirst({ where: { id: lease.roomId }, select: { buildingId: true } });
  const base = await baseReadings(tenantId, unitId, chain, bills, meters, lease.roomId);
  const reads = await db.dormMeterReading.findMany({ where: { kind: "MOVE_OUT", leaseId: lease.id, meterId: { in: meters.map((m) => m.id) } }, select: { meterId: true, value: true } });
  const out: MeterCalc[] = [];
  for (const m of meters) {
    const kind = m.kind === "WATER" ? "WATER" : "ELEC";
    const b = base.get(m.id) ?? null;
    const v = reads.find((r) => r.meterId === m.id)?.value ?? null;
    if (b === null) warnings.push(`BASE_READING_MISSING:${kind}`);
    let units: number | null = null;
    let amount = 0;
    let rate: number | null = null;
    if (b !== null && v !== null) {
      if (v < b) warnings.push(`METER_BACKWARDS:${kind}`);
      else {
        units = v - b;
        if (units > 0) {
          rate = await rateOf(tenantId, unitId, room?.buildingId ?? null, kind, month, uv, warnings);
          if (rate !== null) {
            const vat = taxKindOf(uv, kind) === "VAT7" ? vatOf(uv) : null;
            amount = utilityLine({ kind: "METERED", segments: [{ start: b, end: v }], method: { kind: "FIXED_RATE", satangPerUnit: rate } }, vat && vat.registered ? vat : null).amountSatang;
          }
        }
      }
    }
    out.push({ meterId: m.id, kind, baseValue: b, value: v, units, amount, rate });
  }
  return out;
}
/** ใช้ร่วมกับย้ายห้อง (lease-change.ts): บรรทัดใบแจ้งหนี้ค่าน้ำไฟของสัญญาถึงเลข MOVE_OUT */
export async function utilityLinesForLease(tenantId: string, unitId: string, leaseId: string, roomId: string, month: string): Promise<{ lines: ExternalDocLine[]; vat: VatConfig } | null> {
  const chain = (await leaseChainOf(null, { tenantId, unitId, leaseId })).ids;
  const bills: BillRow[] = await tenantDb({ tenantId, unitId }).dormBill.findMany({ where: { leaseId: { in: chain }, status: { not: "VOID" } }, select: BILL_SEL });
  const uv = await unitVals(tenantId, unitId, roomId);
  const mc = await meterCalcs(tenantId, unitId, { id: leaseId, roomId }, chain, bills, month, uv, []);
  const lines: ExternalDocLine[] = [];
  for (const m of mc) if (m.amount > 0 && m.units) lines.push(docLine(`${m.kind === "ELEC" ? "ค่าไฟฟ้า" : "ค่าน้ำประปา"} ถึงวันย้ายห้อง (${m.baseValue}→${m.value})`, m.amount, m.units, m.rate, taxKindOf(uv, m.kind)));
  return { lines, vat: vatOf(uv) };
}
function docLine(description: string, amount: number, qty: number | null | undefined, unitPrice: number | null | undefined, taxKind: TaxKind): ExternalDocLine {
  if (isNat(qty) && qty > 0 && isNat(unitPrice) && qty * unitPrice === amount) return { description, qty, unitPriceSatang: unitPrice, taxKind };
  return { description, qty: 1, unitPriceSatang: amount, taxKind };
}

// ───────────────────────── สรุปเงินสด (§3.4) ─────────────────────────
type Live = {
  lines: SummaryLine[];
  /** SVC D.12 (Y7) ▸ บรรทัดที่จะลงใบวันออกจริง (ราคาก่อน VAT ตามค่าตั้ง) — lines ข้างบนเป็นยอดรวม VAT แล้ว (= ยอดใบจริงทุกสตางค์) ◂ */
  invLines: ExternalDocLine[];
  vat: VatConfig;
  /** SVC D.12 (Y9) ▸ ใบลดหนี้ค่าห้องส่วนเกินที่ยังต้องออก (ยังไม่ออก ⇒ amount > 0) ◂ */
  rentCredit: { billDocId: string; amount: number; refId: string; labelTh: string } | null;
  meters: MeterCalc[];
  unpaid: { docId: string; amount: number }[];
  heldSatang: number;
  chargesSatang: number;
  unpaidSatang: number;
  deductSatang: number;
  refundSatang: number;
  tenantOwesSatang: number;
  needsApproval: boolean;
  warnings: string[];
  chain: string[];
  root: string;
  bills: BillRow[];
  uv: UnitVals;
  roomNumber: string;
  tenantName: string;
};
const lineAmt = (lines: Prisma.JsonValue, code: string): number =>
  Array.isArray(lines) ? lines.reduce<number>((s, x) => s + (isRec(x) && x.code === code && isNat(x.amountSatang) ? x.amountSatang : 0), 0) : 0;
/** ยอดรวม VAT ของบรรทัด — สูตรเดียวกับ computeBill/computeTotals (EXCLUDE: + round half-up 7% ต่อบรรทัด · INCLUDE/ไม่จด: เท่าเดิม) */
function grossOf(amount: number, taxKind: TaxKind, vat: VatConfig): number {
  if (taxKind !== "VAT7" || !vat.registered || vat.pricesIncludeVat || amount <= 0) return amount;
  return amount + Math.floor((amount * 7 + 50) / 100);
}
async function computeLive(ctx: MoveOutCtx, g: D12Gate, mo: MoRow, now: Date): Promise<Live> {
  const { tenantId, unitId } = g;
  const db = tenantDb({ tenantId, unitId });
  const lease = mo.lease;
  const chainInfo = await leaseChainOf(null, { tenantId, unitId, leaseId: lease.id });
  const chain = chainInfo.ids;
  const uv = await unitVals(tenantId, unitId, lease.roomId);
  const vat = vatOf(uv);
  const warnings: string[] = [];
  const moveOut = ymdOfDb(mo.moveOutDate);
  const month = moveOut.slice(0, 7);
  const bills: BillRow[] = await db.dormBill.findMany({ where: { leaseId: { in: chain }, status: { not: "VOID" } }, select: BILL_SEL });
  const insp = inspOf(mo.inspection);
  const lines: SummaryLine[] = [];

  // น้ำไฟ
  const meters = await meterCalcs(tenantId, unitId, lease, chain, bills, month, uv, warnings);
  for (const m of meters)
    if (m.amount > 0 && m.units)
      lines.push({ code: m.kind, labelTh: m.kind === "ELEC" ? `ค่าไฟ ${m.units.toLocaleString("en-US")} หน่วย` : `ค่าน้ำ ${m.units.toLocaleString("en-US")} หน่วย`, amountSatang: m.amount, qty: m.units, unitPriceSatang: m.rate });

  // ค่าห้องเศษเดือน (มติ 8) — เดือนหลังเดือนค่าห้องล่าสุดที่ออกบิลแล้ว ถึงเดือนวันออก
  //   SVC D.12 (Y12) ▸ "ออกบิลแล้ว" นับจากบิลของสัญญาปัจจุบันเท่านั้น (บิลสัญญาเดิมในสายเป็นค่าห้องของห้อง/ช่วงเดิม) ◂
  const timing = await rentTimingOf(tenantId, unitId);
  const ownBills = bills.filter((b) => b.leaseId === lease.id);
  const billedMonths = ownBills.map((b) => rentMonthOfPeriod(b.periodKey, timing)).sort();
  const lastBilled = billedMonths.length ? billedMonths[billedMonths.length - 1] : null;
  const start = ymdOfDb(lease.startDate);
  let m0 = lastBilled ? addMonthsKey(lastBilled, 1) : start.slice(0, 7);
  if (m0 < start.slice(0, 7)) m0 = start.slice(0, 7);
  const pv = snapVal(lease.policySnapshot, "rooms.billing.prorate") ?? uv["rooms.billing.prorate"];
  const pmode = pv === "DIV_30" || pv === "FULL_MONTH" ? pv : "ACTUAL_DAYS";
  let rentSum = 0;
  for (let m = m0, i = 0; m <= month && i < 120; m = addMonthsKey(m, 1), i++) {
    const dim = dimOf(Number(m.slice(0, 4)), Number(m.slice(5, 7)));
    const days = occupiedDays({ periodStart: `${m}-01`, periodEnd: monthEndOf(m), moveIn: start, moveOut });
    if (days <= 0) continue;
    const rent = days >= dim ? lease.rentSatang : prorate({ monthlySatang: lease.rentSatang, days, daysInMonth: dim, mode: pmode });
    if (rent > 0) {
      lines.push({ code: "RENT", labelTh: `ค่าห้อง ${thMonth(m)} (${days} วัน)`, amountSatang: rent, qty: 1, unitPriceSatang: rent });
      rentSum += rent;
    }
    if (lease.commonFeeSatang > 0) {
      const c = days >= dim ? lease.commonFeeSatang : prorate({ monthlySatang: lease.commonFeeSatang, days, daysInMonth: dim, mode: pmode });
      if (c > 0) lines.push({ code: "COMMON", labelTh: `ค่าส่วนกลาง ${thMonth(m)} (${days} วัน)`, amountSatang: c, qty: 1, unitPriceSatang: c });
    }
  }
  // ค่าเช่าล่วงหน้า ⇒ หักค่าห้องในใบ (ไม่เกินยอดค่าห้อง)
  //   SVC D.12 (Y3) ▸ ยอด = บรรทัด ADVANCE_RENT ที่ออกบิลจริงในสาย (บิลไม่ VOID) ไม่เกินค่าที่ตกลงในสัญญาต้นสาย · ไม่เคยออกบิลแรก ⇒ ไม่หัก ◂
  const rootAdvance = chainInfo.root === lease.id ? lease.advanceRentSatang : ((await db.dormLease.findFirst({ where: { id: chainInfo.root }, select: { advanceRentSatang: true } }))?.advanceRentSatang ?? 0);
  const advance = Math.min(rootAdvance, bills.reduce((s, b) => s + lineAmt(b.lines, "ADVANCE_RENT"), 0));
  if (advance > 0) {
    const use = Math.min(advance, rentSum);
    if (use > 0) lines.push({ code: "ADVANCE_RENT", labelTh: "หักค่าเช่าล่วงหน้า", amountSatang: -use });
    if (advance - use > 0) warnings.push(`ADVANCE_RENT_LEFT:${advance - use}`);
  }
  // ค่าปรับค้าง (มติ 9 · ปิดหนี้ D.11 มติ 5)
  let late = 0;
  const asOf = bkkYmd(now);
  for (const lid of chain) {
    const lf = await lateFeeLedger(ctx, { unitId, leaseId: lid }, { now });
    if (lf) late += Math.max(0, lf.totalDueSatang - lf.totalChargedSatang);
    else {
      const l = await db.dormLease.findFirst({ where: { id: lid }, select: { id: true, rentSatang: true, policySnapshot: true } });
      if (!l) continue;
      const items = (await ledgerItemsOf(tenantId, unitId, [l], asOf)).get(l.id) ?? [];
      late += Math.max(0, items.reduce((s, x) => s + x.dueSatang, 0) - items.reduce((s, x) => s + x.chargedSatang, 0));
    }
  }
  if (late > 0) lines.push({ code: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้าคงค้าง", amountSatang: late });
  // ค่าเสียหาย (มีหลักฐานที่แนบใบนี้)
  const attached = new Set(insp.files.map((f) => f.fileId));
  for (const it of insp.items)
    if (it.verdict === "DAMAGE" && it.amountSatang > 0)
      lines.push({ code: "DAMAGE", labelTh: it.labelTh, amountSatang: it.amountSatang, evidenceCount: it.evidenceFileIds.filter((f) => attached.has(f)).length, itemKey: it.key });
  // หนี้ค้างของสาย
  const docs = await chainDocs(scopedDb(tenantId, unitId), tenantId, unitId, chain, bills);
  const unpaid = unpaidOf(docs, bills);

  // SVC D.12 (Y9 · มติ 8) ▸ ออกบิลค่าห้องเดือนวันออกแล้วแต่ย้ายออกก่อนสิ้นเดือน (ไม่ใช่ FULL_MONTH) ⇒ ใบลดหนี้ส่วนเกินของบิลนั้น
  //   ออกได้ไม่เกินยอดค้างของใบนั้น (เพดานใบลดหนี้ของบัญชี) · ส่วนที่จ่ายแล้วคืนนอกประกันไม่ได้ ⇒ RENT_EXCESS_LEFT (หนี้ D.10) ◂
  let rentCredit: Live["rentCredit"] = null;
  const monthBill = ownBills.find((b) => rentMonthOfPeriod(b.periodKey, timing) === month && b.accountDocumentId);
  if (monthBill && pmode !== "FULL_MONTH" && moveOut < monthEndOf(month)) {
    const dim = dimOf(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
    const used = occupiedDays({ periodStart: `${month}-01`, periodEnd: monthEndOf(month), moveIn: start, moveOut });
    const billedRent = lineAmt(monthBill.lines, "RENT");
    const usedRent = used >= dim ? lease.rentSatang : prorate({ monthlySatang: lease.rentSatang, days: Math.max(0, used), daysInMonth: dim, mode: pmode });
    const excess = Math.max(0, billedRent - usedRent);
    if (excess > 0) {
      const billDocId = monthBill.accountDocumentId as string;
      const refId = rentCreditRefId(mo.id, moveOut, dedOf(mo.deductions).rev);
      // ลดไปแล้วสุทธิ = ใบลดหนี้ของใบย้ายออกนี้ (ทุกรุ่น) − ใบเพิ่มหนี้ที่กลับรายการใบเหล่านั้น (ตามบัญชีจริง)
      const cnRows = docs.heads.filter((h) => h.docType === "CREDIT_NOTE" && h.refType === RENT_CREDIT_REF && (h.refId ?? "").startsWith(`${mo.id}:${moveOut}`) && LIVE_ST(h.status));
      const cnIds = new Set(cnRows.map((h) => h.id));
      const reversed = docs.heads.filter((h) => h.docType === "DEBIT_NOTE" && h.refType === RENT_CREDIT_REVERSE && cnIds.has(h.refId ?? "") && LIVE_ST(h.status)).reduce((s2, h) => s2 + Number(h.grandTotal), 0);
      const already = Math.max(0, cnRows.reduce((s2, h) => s2 + Number(h.grandTotal), 0) - reversed);
      const open = unpaid.find((u) => u.docId === billDocId)?.amount ?? 0;
      const plan = Math.max(0, Math.min(excess - already, open));
      if (plan > 0) {
        rentCredit = { billDocId, amount: plan, refId, labelTh: `คืนค่าห้องส่วนเกิน ${thMonth(month)} (ย้ายออก ${thDate(moveOut)})` };
        const u = unpaid.find((x) => x.docId === billDocId);
        if (u) u.amount -= plan; // ใบสรุปแสดงยอดค้างหลังลดหนี้ (Y23: ใบลดหนี้ออกหลังตรึงสำเร็จ · ปิดประกันออกให้ถ้ายังไม่มี)
      }
      if (excess - already - plan > 0) warnings.push(`RENT_EXCESS_LEFT:${excess - already - plan}`);
    }
  }
  for (const u of unpaid) if (u.amount > 0) lines.push({ code: "UNPAID", labelTh: u.labelTh, amountSatang: u.amount, docId: u.docId });

  const netOrdered = LINE_ORDER.flatMap((c) => lines.filter((l) => l.code === c)).filter((l) => l.amountSatang !== 0);
  const invLines = invoiceLinesOf(netOrdered, uv);
  // SVC D.12 (Y7) ▸ ยอดบนใบสรุป = ยอดที่ลงใบจริง (รวม VAT เมื่อหอจด VAT แบบราคาไม่รวม VAT) ◂
  const ordered = netOrdered.map((l) => (l.code === "UNPAID" ? l : { ...l, amountSatang: grossOf(l.amountSatang, taxKindOf(uv, l.code), vat) }));
  const heldSatang = await securityDepositHeld({ tenantId, unitId, leaseId: chainInfo.root });
  const money = moneyOf(ordered, heldSatang, uv);
  const room = await db.hotelRoom.findFirst({ where: { id: lease.roomId }, select: { number: true } });
  const party = await tenantDb({ tenantId }).party.findFirst({ where: { id: lease.partyId }, select: { name: true } });
  return {
    lines: ordered,
    invLines,
    vat,
    rentCredit,
    meters,
    unpaid: unpaid.filter((u) => u.amount > 0).map((u) => ({ docId: u.docId, amount: u.amount })),
    heldSatang,
    ...money,
    warnings,
    chain,
    root: chainInfo.root,
    bills,
    uv,
    roomNumber: room?.number ?? "",
    tenantName: party?.name ?? "",
  };
}
/** ยอด (มติ: เท่ากับ settleDeposit ของ D.1 กับชุดเดียวกัน) — ค่าห้อง/ส่วนกลาง/ค่าปรับ/ค่าเช่าล่วงหน้า รวมเข้าช่องค้างชำระของสูตร */
function moneyOf(lines: SummaryLine[], held: number, uv: UnitVals, thresholdOverride?: number) {
  const sum = (codes: SummaryLine["code"][]) => lines.filter((l) => codes.includes(l.code)).reduce((s, l) => s + l.amountSatang, 0);
  const deductSatang = sum(["DAMAGE"]);
  const unpaidSatang = sum(["UNPAID"]);
  const other = sum(["RENT", "COMMON", "ADVANCE_RENT", "LATE_FEE"]);
  const chargesSatang = lines.filter((l) => l.code !== "UNPAID").reduce((s, l) => s + l.amountSatang, 0);
  const thr = thresholdOverride ?? (isNat(uv["rooms.deposit.approvalThreshold"]) ? (uv["rooms.deposit.approvalThreshold"] as number) : 200_000);
  const s = settleDeposit({
    depositSatang: held,
    utilities: lines.filter((l) => l.code === "ELEC" || l.code === "WATER").map((l) => ({ code: l.code as "ELEC" | "WATER", input: { kind: "ALLOCATED" as const, amountSatang: l.amountSatang } })),
    damages: lines.filter((l) => l.code === "DAMAGE").map((l) => ({ labelTh: l.labelTh, amountSatang: l.amountSatang, kind: "DAMAGE" as const, evidenceCount: Math.max(1, l.evidenceCount ?? 1) })),
    unpaidSatang: Math.max(0, unpaidSatang + other),
    approvalThresholdSatang: thr,
    legal: legalCtxOf(uv),
  });
  const net = held - chargesSatang - unpaidSatang;
  return {
    chargesSatang,
    unpaidSatang,
    deductSatang,
    refundSatang: s.ok ? s.refundSatang : Math.max(0, net),
    tenantOwesSatang: s.ok ? s.tenantOwesSatang : Math.max(0, -net),
    needsApproval: s.ok ? s.needsApproval : deductSatang > thr,
  };
}

// ───────────────────────── 3.1 แจ้งย้ายออก ─────────────────────────
export async function giveMoveOutNotice(
  ctx: MoveOutCtx,
  input: { unitId: string; leaseId: string; moveOutDate: string; shortNoticeReason?: string | null },
  deps?: { now?: Date },
): Promise<{ ok: true; moveOutId: string; duplicate: boolean; noticeDate: string; moveOutDate: string; noticeDays: number; shortNotice: boolean; refundDueDate: string; legal: { code: string; messageTh: string } | null } | Fail> {
  try {
    if (!isRec(input)) return notFound();
    const g = await d12Gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const lease = isStr(input.leaseId)
      ? await db.dormLease.findFirst({ where: { id: input.leaseId }, select: { id: true, roomId: true, status: true, startDate: true, endDate: true, occupancyId: true, policySnapshot: true } })
      : null;
    if (!lease || !roomVisible(g, lease.roomId)) return notFound();
    const now = nowOf(deps?.now);
    const today = bkkYmd(now);
    const moveOutDate = parseYmd(input.moveOutDate) ? input.moveOutDate : null;
    if (!moveOutDate) return fail("INVALID_INPUT", "วันย้ายออกไม่ถูกต้อง (ใช้รูปแบบ ปปปป-ดด-วว)");
    const reasonRaw = input.shortNoticeReason;
    if (reasonRaw !== undefined && reasonRaw !== null && typeof reasonRaw !== "string") return fail("INVALID_INPUT", "เหตุผลไม่ถูกต้อง");
    const uv = await unitVals(g.tenantId, g.unitId, lease.roomId);
    const sn = snapVal(lease.policySnapshot, "rooms.moveout.noticeDays");
    const noticeDays = isNat(sn) ? sn : isNat(uv["rooms.moveout.noticeDays"]) ? (uv["rooms.moveout.noticeDays"] as number) : 30;
    const due = refundDueOf(moveOutDate, lease.policySnapshot, uv);
    const existing = await db.dormMoveOut.findFirst({ where: { leaseId: lease.id }, select: { id: true, status: true, moveOutDate: true, noticeAt: true, inspection: true } });
    const dupOf = (mo: { id: string; noticeAt: Date; inspection: Prisma.JsonValue }, dup: boolean) => {
      const i = inspOf(mo.inspection);
      const nd = i.noticeDate || bkkYmd(mo.noticeAt);
      return { ok: true as const, moveOutId: mo.id, duplicate: dup, noticeDate: nd, moveOutDate, noticeDays, shortNotice: daysBetween(nd, moveOutDate) < noticeDays, refundDueDate: due.dueDate, legal: due.legal };
    };
    if (existing && (existing.status === "NOTICE" || existing.status === "INSPECTED")) {
      if (ymdOfDb(existing.moveOutDate) === moveOutDate) return dupOf(existing, true);
      return fail("ALREADY_NOTICED", "สัญญานี้แจ้งย้ายออกไว้แล้วด้วยวันอื่น — ยกเลิกการแจ้งเดิมก่อนถ้าต้องการเปลี่ยนวัน");
    }
    if (lease.status !== "ACTIVE") return fail("NOT_EDITABLE", "แจ้งย้ายออกได้เฉพาะสัญญาที่เข้าอยู่แล้วและยังมีผล");
    if (await db.dormLease.findFirst({ where: { previousLeaseId: lease.id, status: { not: "CANCELLED" } }, select: { id: true } }))
      return fail("HAS_RENEWAL", "สัญญานี้ต่อสัญญาหรือย้ายห้องไปแล้ว — แจ้งย้ายออกที่สัญญาฉบับใหม่แทน");
    const start = ymdOfDb(lease.startDate);
    const end = ymdOfDb(lease.endDate);
    if (moveOutDate < start) return fail("INVALID_INPUT", "วันย้ายออกต้องไม่ก่อนวันเริ่มสัญญา");
    if (end && moveOutDate > end) return fail("AFTER_LEASE_END", "วันย้ายออกเลยวันจบสัญญา — สัญญาจบตามวันเดิม (ต่อสัญญาก่อนถ้าจะอยู่ต่อ)");
    const shortNotice = daysBetween(today, moveOutDate) < noticeDays;
    const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
    if (shortNotice && !isValidOutOfScopeReason(reason))
      return fail("SHORT_NOTICE", `สัญญานี้ตกลงแจ้งย้ายออกล่วงหน้า ${noticeDays} วัน แต่แจ้งก่อน ${Math.max(0, daysBetween(today, moveOutDate))} วัน — ระบุเหตุผลอย่างน้อย 10 ตัวอักษร (ไม่มีการปรับ/ริบเงินประกันอัตโนมัติ)`);
    const root = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id })).root;
    const out = await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(root));
      if (root !== lease.id) await advisoryLock(tx, leaseLockKey(lease.id));
      const cur = await tx.dormLease.findFirst({ where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, endDate: true, occupancyId: true } });
      if (!cur) throw new Abort(notFound());
      const row = await tx.dormMoveOut.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id }, select: { id: true, status: true, moveOutDate: true, noticeAt: true, inspection: true, deductions: true } });
      if (row && (row.status === "NOTICE" || row.status === "INSPECTED")) {
        if (ymdOfDb(row.moveOutDate) === moveOutDate) return { dup: true as const, row };
        throw new Abort(fail("ALREADY_NOTICED", "สัญญานี้แจ้งย้ายออกไว้แล้วด้วยวันอื่น — ยกเลิกการแจ้งเดิมก่อนถ้าต้องการเปลี่ยนวัน"));
      }
      if (row && row.status !== "CANCELLED") throw new Abort(fail("NOT_EDITABLE", "สัญญานี้ย้ายออก/ปิดเงินประกันแล้ว"));
      if (cur.status !== "ACTIVE") throw new Abort(fail("NOT_EDITABLE", "แจ้งย้ายออกได้เฉพาะสัญญาที่เข้าอยู่แล้วและยังมีผล"));
      if (await tx.dormLease.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, previousLeaseId: lease.id, status: { not: "CANCELLED" } }, select: { id: true } }))
        throw new Abort(fail("HAS_RENEWAL", "สัญญานี้ต่อสัญญาหรือย้ายห้องไปแล้ว — แจ้งย้ายออกที่สัญญาฉบับใหม่แทน"));
      const originalEnd = ymdOfDb(cur.endDate);
      const prev = row ? dedOf(row.deductions) : null;
      const insp: Insp = { originalEndDate: originalEnd, noticeDate: today, shortNoticeReason: shortNotice ? reason : null, files: [], items: [], meters: [], inspectedAt: null, inspectedById: null, hkMarkedAt: null };
      // แจ้งใหม่บนแถวที่ยกเลิก: รุ่นต่อจากเดิม (ใบแจ้งหนี้รุ่นเก่า (ถ้ามี) ไม่ถูกใช้ซ้ำ) · ประวัติคงไว้
      const ded: Ded = { rev: prev ? prev.rev + (prev.history.some((h) => h.rev === prev.rev) || prev.frozen ? 1 : 0) : 1, frozen: null, history: prev?.history ?? [], settle: null, reopening: null };
      const data = {
        status: "NOTICE",
        noticeAt: now,
        moveOutDate: dbDate(moveOutDate),
        inspection: json(insp),
        deductions: json(ded),
        depositSatang: 0,
        deductSatang: 0,
        refundSatang: 0,
        refundDueAt: dueAtOf(due.dueDate),
        refundedAt: null,
        settlementDocumentId: null,
        approvalId: null,
      };
      let id: string;
      if (row) {
        const u = await tx.dormMoveOut.updateMany({ where: { id: row.id, tenantId: g.tenantId, unitId: g.unitId, status: "CANCELLED" }, data });
        if (u.count !== 1) throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้เปลี่ยนไปแล้ว — โหลดหน้าใหม่"));
        id = row.id;
      } else id = (await tx.dormMoveOut.create({ data: { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id, createdById: g.actorUserId, ...data }, select: { id: true } })).id;
      const lu = await tx.dormLease.updateMany({ where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId, status: "ACTIVE" }, data: { status: "NOTICE", endDate: dbDate(moveOutDate) } });
      if (lu.count !== 1) throw new Abort(fail("NOT_EDITABLE", "สัญญานี้เปลี่ยนไปแล้ว — โหลดหน้าใหม่"));
      if (cur.occupancyId) {
        const rs = await resizeOccupancy(tx, { tenantId: g.tenantId, unitId: g.unitId, occupancyId: cur.occupancyId, end: addDaysYmd(moveOutDate, 1) });
        if (!rs.ok && rs.code !== "INACTIVE") throw new Abort(fail("NOT_EDITABLE", "ปรับช่วงการถือห้องตามวันย้ายออกไม่ได้"));
      }
      await tx.auditLog.create({
        data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.noticed", targetType: "DormMoveOut", targetId: id, after: { leaseId: lease.id, moveOutDate, noticeDate: today, noticeDays, originalEndDate: originalEnd, refundDueDate: due.dueDate } },
      });
      if (shortNotice)
        await tx.auditLog.create({
          data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.short_notice", targetType: "DormMoveOut", targetId: id, after: { leaseId: lease.id, moveOutDate, noticeDate: today, noticeDays, reason } },
        });
      return { dup: false as const, id };
    });
    if (isFail(out)) return out;
    if (out.dup) return dupOf(out.row, true);
    return { ok: true, moveOutId: out.id, duplicate: false, noticeDate: today, moveOutDate, noticeDays, shortNotice, refundDueDate: due.dueDate, legal: due.legal };
  } catch (e) {
    await logD12("notice", isRec(ctx) ? ctx.tenantId : null, e);
    return unavailable();
  }
}

// ───────────────────────── 3.2 ยกเลิกการแจ้ง ─────────────────────────
/**
 * SVC D.12 (Y22/Y23) ▸ งานหลังยกเลิก (ซ้ำได้ · ใบ CANCELLED เท่านั้น): ใบวันออกกำพร้า ⇒ ใบลดหนี้ ·
 *   ใบลดหนี้ค่าห้องส่วนเกินของใบนี้ที่ยังไม่กลับรายการ ⇒ ใบเพิ่มหนี้ ref RENT_CREDIT_REVERSE/<เลขใบลดหนี้> (บรรทัดเดิม) — ยอดบิลกลับเท่าเดิม
 */
async function cancelledCleanup(c: OrphanCtx, moveOutId: string, leaseId: string, roomId: string, now: Date): Promise<number> {
  const row = await tenantDb({ tenantId: c.tenantId, unitId: c.unitId }).dormMoveOut.findFirst({ where: { id: moveOutId }, select: { status: true } });
  if (row?.status !== "CANCELLED") return 0;
  const uv = await unitVals(c.tenantId, c.unitId, roomId);
  const of = await creditOrphans(c, moveOutId, leaseId, uv);
  if (of) throw new Error(`orphan credit: ${of.code}`);
  const cns = await tenantDb({ tenantId: c.tenantId }).$queryRaw<{ id: string; sourceDocId: string | null }[]>`
    SELECT d."id", d."sourceDocId" FROM "AccountDocument" d
    WHERE d."tenantId" = ${c.tenantId} AND d."refType" = ${RENT_CREDIT_REF} AND d."refId" LIKE ${`${moveOutId}:%`} AND d."docType"::text = 'CREDIT_NOTE' AND d."status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT')
      AND NOT EXISTS (SELECT 1 FROM "AccountDocument" r WHERE r."tenantId" = d."tenantId" AND r."refType" = ${RENT_CREDIT_REVERSE} AND r."refId" = d."id" AND r."docType"::text = 'DEBIT_NOTE' AND r."status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT'))
    ORDER BY d."id" ASC`;
  let n = 0;
  for (const cn of cns) {
    if (!cn.sourceDocId) continue;
    const lines = await docLinesFromDb(c.tenantId, cn.id);
    if (!lines.length) continue;
    const dn = await createExternalDebitNote({
      tenantId: c.tenantId,
      unitId: c.unitId,
      sourceDocId: cn.sourceDocId,
      refType: RENT_CREDIT_REVERSE,
      refId: cn.id,
      reason: "ยกเลิกการแจ้งย้ายออก — กลับรายการลดค่าห้องส่วนเกิน",
      lines,
      vat: vatOf(uv),
      issueDate: bkkYmd(now),
      createdById: c.actorUserId,
    });
    if (!dn.ok) throw new Error(`rent credit reverse: ${dn.code}`);
    n++;
  }
  return n;
}
export async function cancelMoveOut(ctx: MoveOutCtx, input: { unitId: string; moveOutId: string; reason: string }, deps?: { now?: Date }): Promise<{ ok: true } | Fail> {
  try {
    if (!isRec(input)) return notFound();
    const g = await d12Gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const mo = await readMo(g, input.moveOutId);
    if (!mo) return notFound();
    if (CLOSED.includes(mo.status) || mo.status === "CANCELLED") return fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดหรือยกเลิกไปแล้ว");
    if (dedOf(mo.deductions).frozen) return fail("FROZEN", "ส่งใบสรุปให้ผู้เช่าแล้ว — เปิดใบสรุปใหม่ก่อนจึงยกเลิกได้");
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if ([...reason].length < 3) return fail("INVALID_INPUT", "ระบุเหตุผลที่ยกเลิกการแจ้งย้ายออก (อย่างน้อย 3 ตัวอักษร)");
    // SVC D.12 (Y1/Y22) ▸ ใบวันออกรุ่นเก่าที่ไม่ได้ตรึง ⇒ ใบลดหนี้ก่อน · รุ่นปัจจุบันที่ยังจองอยู่ (ผู้ส่งกำลังทำ) ⇒ BUSY ใต้ล็อก ◂
    {
      const of = await creditOrphans(g, mo.id, mo.leaseId, await unitVals(g.tenantId, g.unitId, mo.lease.roomId));
      if (of) return of;
    }
    const cancelNow = nowOf(deps?.now);
    const root = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: mo.leaseId })).root;
    const out = await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(root));
      if (root !== mo.leaseId) await advisoryLock(tx, leaseLockKey(mo.leaseId));
      const cur = await tx.dormMoveOut.findFirst({ where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, deductions: true, inspection: true } });
      if (!cur || CLOSED.includes(cur.status) || cur.status === "CANCELLED") throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดหรือยกเลิกไปแล้ว"));
      const dc = dedOf(cur.deductions);
      if (dc.frozen) throw new Abort(fail("FROZEN", "ส่งใบสรุปให้ผู้เช่าแล้ว — เปิดใบสรุปใหม่ก่อนจึงยกเลิกได้"));
      if (dc.reopening) throw new Abort(REOPENING());
      // Y22 ▸ ผู้ส่งใบสรุปจองรุ่นนี้อยู่ (กำลังออกใบ) ⇒ BUSY ไม่ยกเลิกทับ · จองค้างเกิน 10 นาที (ผู้ส่งตาย) ⇒ จดเป็นกำพร้าในแถวเดียวกันแล้วยกเลิกได้ (ใบลดหนี้ตามมาจากงานตามเวลา) ◂
      const pend = dc.history.find((h) => h.rev === dc.rev && h.pending && !h.creditNoteDocId);
      let dedPatch: Record<string, unknown> | null = null;
      if (pend) {
        if (Date.parse(pend.at) >= cancelNow.getTime() - PENDING_STALE_MS || Date.parse(pend.at) >= Date.now() - PENDING_STALE_MS)
          throw new Abort(fail("BUSY", "กำลังส่งใบสรุปของใบนี้อยู่ — รอสักครู่แล้วกดยกเลิกอีกครั้ง (ยังไม่มีอะไรเปลี่ยน)"));
        const rawD = isRec(cur.deductions) ? cur.deductions : {};
        dedPatch = { ...rawD, rev: dc.rev + 1, history: dc.history.map((h) => (h === pend ? { ...h, pending: false, reason: h.reason || "ยกเลิกการแจ้งย้ายออก" } : h)) };
      }
      const lease = await tx.dormLease.findFirst({ where: { id: mo.leaseId, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, occupancyId: true } });
      if (!lease || lease.status !== "NOTICE") throw new Abort(fail("NOT_EDITABLE", "สัญญานี้จบไปแล้ว — ยกเลิกการแจ้งย้ายออกไม่ได้"));
      const orig = inspOf(cur.inspection).originalEndDate;
      if (lease.occupancyId && orig) {
        const rs = await resizeOccupancy(tx, { tenantId: g.tenantId, unitId: g.unitId, occupancyId: lease.occupancyId, end: addDaysYmd(orig, 1) });
        if (!rs.ok) throw new Abort(rs.code === "ROOM_TAKEN" ? fail("CANCEL_BLOCKED", "ห้องนี้ถูกจอง/ให้เช่าต่อในช่วงหลังวันย้ายออกแล้ว — ยกเลิกการแจ้งไม่ได้ (ยกเลิกการจองนั้นก่อน)") : fail("NOT_EDITABLE", "คืนช่วงการถือห้องเดิมไม่ได้"));
      }
      const u = await tx.dormMoveOut.updateMany({ where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId, status: { in: ["NOTICE", "INSPECTED"] } }, data: { status: "CANCELLED", approvalId: null, ...(dedPatch ? { deductions: json(dedPatch) } : {}) } });
      if (u.count !== 1) throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้เปลี่ยนไปแล้ว — โหลดหน้าใหม่"));
      await tx.dormLease.updateMany({ where: { id: mo.leaseId, tenantId: g.tenantId, unitId: g.unitId, status: "NOTICE" }, data: { status: "ACTIVE", ...(orig ? { endDate: dbDate(orig) } : {}) } });
      await tx.dormMeterReading.deleteMany({ where: { tenantId: g.tenantId, unitId: g.unitId, leaseId: mo.leaseId, kind: "MOVE_OUT" } });
      await tx.auditLog.create({
        data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.cancelled", targetType: "DormMoveOut", targetId: mo.id, after: { leaseId: mo.leaseId, reason, at: nowOf(deps?.now).toISOString() } },
      });
      return { done: true };
    });
    if (isFail(out)) return out;
    // หลัง commit (ล้ม ⇒ งานตามเวลาทำต่อ · idempotent): ใบกำพร้าที่เหลือ ⇒ ใบลดหนี้ · Y23 ใบลดหนี้ค่าห้องส่วนเกิน ⇒ ใบเพิ่มหนี้กลับรายการ
    await cancelledCleanup({ tenantId: g.tenantId, unitId: g.unitId, actorUserId: g.actorUserId }, mo.id, mo.leaseId, mo.lease.roomId, cancelNow).catch((e) => logD12("cancel.cleanup", g.tenantId, e));
    return { ok: true };
  } catch (e) {
    await logD12("cancel", isRec(ctx) ? ctx.tenantId : null, e);
    return unavailable();
  }
}

// ───────────────────────── 3.3 ไฟล์หลักฐาน · ตรวจห้อง ─────────────────────────
function sniffOk(ct: string, d: Uint8Array): boolean {
  const at = (i: number) => d[i] ?? -1;
  const ascii = (from: number, s: string) => [...s].every((c, i) => at(from + i) === c.charCodeAt(0));
  switch (ct) {
    case "image/jpeg":
      return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
    case "image/png":
      return at(0) === 0x89 && ascii(1, "PNG");
    case "application/pdf":
      return ascii(0, "%PDF-");
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "image/heic":
    case "image/heif":
      return ascii(4, "ftyp") && ["heic", "heix", "mif1", "msf1"].some((b) => ascii(8, b));
    default:
      return false;
  }
}
type PutFn = (path: string, data: Uint8Array, contentType: string) => Promise<void>;
export async function addMoveOutFiles(
  ctx: MoveOutCtx,
  input: { unitId: string; moveOutId: string; files: { data: Uint8Array; contentType: string; filename?: string }[] },
  deps?: { put?: PutFn },
): Promise<{ ok: true; added: { fileId: string }[] } | Fail> {
  const uploaded: string[] = [];
  let tenantForCleanup: string | null = null;
  try {
    if (!isRec(input)) return notFound();
    const g = await d12Gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const mo = await readMo(g, input.moveOutId);
    if (!mo) return notFound();
    if (CLOSED.includes(mo.status) || mo.status === "CANCELLED") return fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดหรือยกเลิกไปแล้ว");
    if (dedOf(mo.deductions).frozen) return fail("FROZEN", "ส่งใบสรุปให้ผู้เช่าแล้ว — เปิดใบสรุปใหม่ก่อนจึงแนบไฟล์เพิ่มได้");
    const list = Array.isArray(input.files) ? input.files : [];
    if (list.length < 1 || list.length > MAX_FILES_PER_CALL) return fail("INVALID_FILE", `แนบได้ครั้งละ 1–${MAX_FILES_PER_CALL} ไฟล์`);
    const ok: { data: Uint8Array; contentType: string }[] = [];
    for (const f of list) {
      if (!isRec(f) || !(f.data instanceof Uint8Array) || typeof f.contentType !== "string") return fail("INVALID_FILE", "ไฟล์ไม่ถูกต้อง — รับเฉพาะรูป (jpeg/png/webp/heic) หรือ pdf ไม่เกิน 10 MB");
      const ct = f.contentType.split(";")[0].trim().toLowerCase();
      if (!(FILE_TYPES as readonly string[]).includes(ct) || f.data.length === 0 || f.data.length > MAX_FILE_BYTES || !sniffOk(ct, f.data))
        return fail("INVALID_FILE", "ไฟล์ไม่ถูกต้อง — รับเฉพาะรูป (jpeg/png/webp/heic) หรือ pdf ไม่เกิน 10 MB (ไม่มีไฟล์ใดถูกบันทึก)");
      ok.push({ data: f.data, contentType: ct });
    }
    if (inspOf(mo.inspection).files.length + ok.length > MAX_FILES) return fail("INVALID_FILE", `ใบย้ายออกหนึ่งใบแนบไฟล์ได้ไม่เกิน ${MAX_FILES} ไฟล์`);
    tenantForCleanup = g.tenantId;
    for (const [i, f] of ok.entries()) {
      const r = await uploadFile(
        { tenantId: g.tenantId },
        { kind: "ATTACHMENT", visibility: "private", filename: `moveout-${mo.id}-${Date.now()}-${i}.${EXT[f.contentType] ?? "bin"}`, contentType: f.contentType, data: f.data, maxBytes: MAX_FILE_BYTES },
        deps?.put ? { put: deps.put } : undefined,
      );
      if (!r.ok) {
        await dropFiles(g.tenantId, uploaded, deps);
        return fail("UPLOAD_FAILED", "อัปโหลดไฟล์ไม่สำเร็จ — ไม่มีไฟล์ใดถูกบันทึก ลองใหม่อีกครั้ง");
      }
      uploaded.push(r.assetId);
    }
    const at = new Date().toISOString();
    const root = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: mo.leaseId })).root;
    const out = await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(root));
      if (root !== mo.leaseId) await advisoryLock(tx, leaseLockKey(mo.leaseId));
      const cur = await tx.dormMoveOut.findFirst({ where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, inspection: true, deductions: true } });
      if (!cur || CLOSED.includes(cur.status) || cur.status === "CANCELLED") throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดหรือยกเลิกไปแล้ว"));
      if (dedOf(cur.deductions).frozen) throw new Abort(fail("FROZEN", "ส่งใบสรุปให้ผู้เช่าแล้ว — เปิดใบสรุปใหม่ก่อนจึงแนบไฟล์เพิ่มได้"));
      const insp = inspOf(cur.inspection);
      if (insp.files.length + uploaded.length > MAX_FILES) throw new Abort(fail("INVALID_FILE", `ใบย้ายออกหนึ่งใบแนบไฟล์ได้ไม่เกิน ${MAX_FILES} ไฟล์`));
      insp.files.push(...uploaded.map((fileId, i) => ({ fileId, contentType: ok[i].contentType, at })));
      await tx.dormMoveOut.updateMany({ where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId }, data: { inspection: json({ ...(isRec(cur.inspection) ? cur.inspection : {}), files: insp.files }) } });
      return { done: true };
    });
    if (isFail(out)) {
      await dropFiles(g.tenantId, uploaded, deps);
      return out;
    }
    return { ok: true, added: uploaded.map((fileId) => ({ fileId })) };
  } catch (e) {
    if (tenantForCleanup) await dropFiles(tenantForCleanup, uploaded, deps);
    await logD12("files", isRec(ctx) ? ctx.tenantId : null, e);
    return unavailable();
  }
}
async function dropFiles(tenantId: string, ids: string[], deps: { put?: PutFn } | undefined): Promise<void> {
  for (const id of ids) {
    try {
      await deleteFileAsset({ tenantId }, id, deps?.put ? { del: async () => 200 } : undefined);
    } catch {
      /* best-effort — ไฟล์ส่วนตัวที่ค้างไม่มีลิงก์ใดชี้ */
    }
  }
}

type ItemIn = { key: string; labelTh: string; verdict: "NORMAL" | "DAMAGE"; damageCode?: string | null; amountSatang?: number; evidenceFileIds?: string[]; note?: string | null };
export async function recordMoveOutInspection(
  ctx: MoveOutCtx,
  input: { unitId: string; moveOutId: string; items: ItemIn[]; meterReadings: { meterId: string; value: number; photoFileId?: string | null }[] },
  deps?: { now?: Date },
): Promise<{ ok: true; status: "INSPECTED"; deductSatang: Money; needsApproval: boolean } | Fail> {
  try {
    if (!isRec(input)) return notFound();
    const g = await d12Gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const mo = await readMo(g, input.moveOutId);
    if (!mo) return notFound();
    if (CLOSED.includes(mo.status) || mo.status === "CANCELLED") return fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดหรือยกเลิกไปแล้ว");
    if (dedOf(mo.deductions).frozen) return fail("FROZEN", "ส่งใบสรุปให้ผู้เช่าแล้ว — แก้ผลตรวจห้องไม่ได้ (เปิดใบสรุปใหม่ก่อน)");
    const now = nowOf(deps?.now);
    const uv = await unitVals(g.tenantId, g.unitId, mo.lease.roomId);
    const lctx = legalCtxOf(uv);
    const catalog = catalogOf(uv);
    const attached = new Set(inspOf(mo.inspection).files.map((f) => f.fileId));
    const itemsIn = Array.isArray(input.items) ? input.items : null;
    if (!itemsIn || itemsIn.length > MAX_ITEMS) return fail("INVALID_INPUT", `รายการตรวจห้องต้องเป็นรายการ ไม่เกิน ${MAX_ITEMS} รายการ`);
    const keys = new Set<string>();
    const items: InspItem[] = [];
    for (const x of itemsIn) {
      if (!isRec(x) || !isStr(x.key) || !KEY_RE.test(x.key) || keys.has(x.key)) return fail("INVALID_INPUT", "รหัสรายการตรวจห้องไม่ถูกต้องหรือซ้ำ");
      keys.add(x.key);
      const label = typeof x.labelTh === "string" ? x.labelTh.trim() : "";
      if ([...label].length < 1 || [...label].length > 80) return fail("INVALID_INPUT", "ชื่อรายการตรวจห้องต้องยาว 1–80 ตัวอักษร");
      if (x.verdict !== "NORMAL" && x.verdict !== "DAMAGE") return fail("INVALID_INPUT", "ผลตรวจต้องเป็น ใช้งานปกติ หรือ เสียหาย");
      if (x.note !== undefined && x.note !== null && typeof x.note !== "string") return fail("INVALID_INPUT", "หมายเหตุไม่ถูกต้อง");
      const code = x.damageCode === undefined || x.damageCode === null ? null : x.damageCode;
      if (code !== null && (typeof code !== "string" || !catalog.has(code))) return fail("INVALID_INPUT", "รหัสค่าเสียหายไม่อยู่ในรายการค่าเสียหายมาตรฐานของหอ");
      let amount: number;
      if (x.amountSatang === undefined || x.amountSatang === null) amount = code ? (catalog.get(code)?.amountSatang ?? 0) : 0;
      else if (isNat(x.amountSatang) && x.amountSatang <= MAX_ITEM_SATANG) amount = x.amountSatang;
      else return fail("INVALID_INPUT", "ยอดค่าเสียหายต้องเป็นจำนวนเต็มสตางค์ 0 – ฿1,000,000");
      const ev = Array.isArray(x.evidenceFileIds) ? x.evidenceFileIds.filter((f): f is string => typeof f === "string") : [];
      if (x.evidenceFileIds !== undefined && !Array.isArray(x.evidenceFileIds)) return fail("INVALID_INPUT", "หลักฐานต้องเป็นรายการไฟล์");
      const evidence = ev.filter((f) => attached.has(f)); // นับเฉพาะไฟล์ที่แนบกับใบย้ายออกนี้ (มติ 5)
      // มติ 5: ค่าเสื่อมปกติหักไม่ได้ทุกโหมด · ค่าเสียหายต้องมีหลักฐานทุกโหมด (เข้มกว่าตัวตรวจ OUT_OF_SCOPE)
      if (x.verdict === "NORMAL" && amount > 0) {
        const o = evaluateLegal("DEDUCTION_EVIDENCE", { kind: "NORMAL_WEAR", evidenceCount: evidence.length }, lctx);
        return fail("LEGAL_BLOCK", `${label}: ${o.messageTh}`, { code: "DEDUCT_NORMAL_WEAR", messageTh: o.messageTh, citation: o.citation });
      }
      if (x.verdict === "DAMAGE" && amount > 0 && evidence.length === 0) {
        const o = evaluateLegal("DEDUCTION_EVIDENCE", { kind: "DAMAGE", evidenceCount: 0 }, { mode: "STRICT" });
        return fail("LEGAL_BLOCK", `${label}: ${o.messageTh}`, { code: "DEDUCT_NO_EVIDENCE", messageTh: o.messageTh, citation: o.citation });
      }
      items.push({ key: x.key, labelTh: label, verdict: x.verdict, damageCode: code, amountSatang: x.verdict === "DAMAGE" ? amount : 0, evidenceFileIds: evidence, note: typeof x.note === "string" && x.note.trim() ? x.note.trim().slice(0, 200) : null });
    }
    // มิเตอร์วันออก — ต้องเป็นมิเตอร์ห้อง active ของห้องนี้ · ฐาน = เลขที่ออกบิลแล้ว (มติ 7)
    const readsIn = Array.isArray(input.meterReadings) ? input.meterReadings : null;
    if (!readsIn || readsIn.length > 10) return fail("INVALID_INPUT", "เลขมิเตอร์ไม่ถูกต้อง");
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const roomMeters = await db.dormMeter.findMany({ where: { roomId: mo.lease.roomId, role: "ROOM", removedAt: null }, select: { id: true, kind: true } });
    const seen = new Set<string>();
    for (const r of readsIn) {
      if (!isRec(r) || !isStr(r.meterId) || seen.has(r.meterId)) return fail("INVALID_INPUT", "เลขมิเตอร์ไม่ถูกต้อง");
      seen.add(r.meterId);
      if (!roomMeters.some((m) => m.id === r.meterId)) return notFound();
      if (!isNat(r.value) || r.value > 2_147_483_647) return fail("INVALID_INPUT", "เลขมิเตอร์ต้องเป็นจำนวนเต็มไม่ติดลบ");
    }
    const chain = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: mo.leaseId })).ids;
    const bills: BillRow[] = await db.dormBill.findMany({ where: { leaseId: { in: chain }, status: { not: "VOID" } }, select: BILL_SEL });
    const base = await baseReadings(g.tenantId, g.unitId, chain, bills, roomMeters, mo.lease.roomId);
    const meterRows: InspMeter[] = [];
    for (const r of readsIn) {
      const m = roomMeters.find((x) => x.id === r.meterId)!;
      const b = base.get(m.id) ?? null;
      if (b === null) return fail("BASE_READING_MISSING", "ไม่พบเลขมิเตอร์ที่ออกบิลครั้งล่าสุดหรือเลขวันเข้าของสัญญานี้ — บันทึกเลขวันเข้าก่อน");
      if (r.value < b) return fail("METER_BACKWARDS", `เลขมิเตอร์ ${m.kind === "ELEC" ? "ไฟ" : "น้ำ"} ${r.value.toLocaleString("en-US")} ต่ำกว่าเลขที่ออกบิลแล้ว ${b.toLocaleString("en-US")} — ตรวจเลขอีกครั้ง`);
      meterRows.push({ meterId: m.id, kind: m.kind === "WATER" ? "WATER" : "ELEC", baseValue: b, value: r.value, units: r.value - b });
    }
    const deductSatang = items.filter((i) => i.verdict === "DAMAGE").reduce((s, i) => s + i.amountSatang, 0);
    const thr = isNat(uv["rooms.deposit.approvalThreshold"]) ? (uv["rooms.deposit.approvalThreshold"] as number) : 200_000;
    const needsApproval = deductSatang > thr;
    const periodKey = ymdOfDb(mo.moveOutDate).slice(0, 7);
    const root = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: mo.leaseId })).root;
    const out = await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(root));
      if (root !== mo.leaseId) await advisoryLock(tx, leaseLockKey(mo.leaseId));
      const cur = await tx.dormMoveOut.findFirst({ where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, inspection: true, deductions: true } });
      if (!cur || CLOSED.includes(cur.status) || cur.status === "CANCELLED") throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดหรือยกเลิกไปแล้ว"));
      if (dedOf(cur.deductions).frozen) throw new Abort(fail("FROZEN", "ส่งใบสรุปให้ผู้เช่าแล้ว — แก้ผลตรวจห้องไม่ได้ (เปิดใบสรุปใหม่ก่อน)"));
      const insp = inspOf(cur.inspection);
      const nowAttached = new Set(insp.files.map((f) => f.fileId));
      for (const it of items) it.evidenceFileIds = it.evidenceFileIds.filter((f) => nowAttached.has(f));
      for (const it of items) if (it.verdict === "DAMAGE" && it.amountSatang > 0 && !it.evidenceFileIds.length) throw new Abort(fail("LEGAL_BLOCK", "หลักฐานของรายการที่หักถูกนำออกระหว่างบันทึก — แนบใหม่แล้วลองอีกครั้ง"));
      for (const r of readsIn) {
        const has = await tx.dormMeterReading.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, meterId: r.meterId, leaseId: mo.leaseId, kind: "MOVE_OUT" }, select: { id: true } });
        const photo = isStr(r.photoFileId) && nowAttached.has(r.photoFileId) ? r.photoFileId : null;
        if (has) await tx.dormMeterReading.updateMany({ where: { id: has.id, tenantId: g.tenantId }, data: { value: r.value, readAt: now, readById: g.actorUserId, periodKey, photoFileId: photo } });
        else
          await tx.dormMeterReading.create({
            data: { tenantId: g.tenantId, unitId: g.unitId, meterId: r.meterId, leaseId: mo.leaseId, periodKey, kind: "MOVE_OUT", value: r.value, readAt: now, readById: g.actorUserId, source: "MANUAL", photoFileId: photo },
          });
      }
      const merged = readsIn.length ? meterRows : insp.meters;
      const next = { ...(isRec(cur.inspection) ? cur.inspection : {}), items, meters: merged, inspectedAt: now.toISOString(), inspectedById: g.actorUserId };
      const u = await tx.dormMoveOut.updateMany({
        where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId, status: { in: ["NOTICE", "INSPECTED"] } },
        data: { status: "INSPECTED", inspection: json(next), deductSatang },
      });
      if (u.count !== 1) throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้เปลี่ยนไปแล้ว — โหลดหน้าใหม่"));
      await tx.auditLog.create({
        data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.inspected", targetType: "DormMoveOut", targetId: mo.id, after: { items: items.length, deductSatang, meters: readsIn.length } },
      });
      return { done: true };
    });
    if (isFail(out)) return out;
    return { ok: true, status: "INSPECTED", deductSatang, needsApproval };
  } catch (e) {
    await logD12("inspect", isRec(ctx) ? ctx.tenantId : null, e);
    return unavailable();
  }
}

// ───────────────────────── 3.4 สรุปเงิน · โมเดลจอ ─────────────────────────
async function approvalOf(tenantId: string, id: string | null): Promise<MoveOutSummary["approval"]> {
  if (!id) return { id: null, status: "NONE" };
  const st = (await requestStatuses({ tenantId }, [id]))[id];
  return { id, status: st === "APPROVED" || st === "REJECTED" || st === "CANCELLED" || st === "PENDING" ? st : "PENDING" };
}
async function buildSummary(ctx: MoveOutCtx, g: D12Gate, mo: MoRow, now: Date): Promise<{ s: MoveOutSummary; live: Live | null; ded: Ded }> {
  const ded = dedOf(mo.deductions);
  const insp = inspOf(mo.inspection);
  const moveOutDate = ymdOfDb(mo.moveOutDate);
  const today = bkkYmd(now);
  const dueAt = mo.refundDueAt ?? dueAtOf(addDaysYmd(moveOutDate, 7));
  const refundDueDate = dueYmdOf(dueAt);
  const closed = CLOSED.includes(mo.status);
  const frozen = ded.frozen;
  let live: Live | null = null;
  let lines: SummaryLine[];
  let held: number;
  let money: ReturnType<typeof moneyOf>;
  let warnings: string[] = [];
  let roomNumber = "";
  let tenantName = "";
  let root = mo.leaseId;
  let meters: MoveOutSummary["meters"];
  if (frozen && (closed || mo.status !== "CANCELLED")) {
    lines = frozen.lines;
    held = closed ? (ded.settle?.heldSatang ?? frozen.heldSatang) : frozen.heldSatang;
    const unpaidSatang = lines.filter((l) => l.code === "UNPAID").reduce((s, l) => s + l.amountSatang, 0);
    const chargesSatang = lines.filter((l) => l.code !== "UNPAID").reduce((s, l) => s + l.amountSatang, 0);
    money = {
      chargesSatang,
      unpaidSatang,
      deductSatang: lines.filter((l) => l.code === "DAMAGE").reduce((s, l) => s + l.amountSatang, 0),
      refundSatang: frozen.refundSatang,
      tenantOwesSatang: frozen.tenantOwesSatang,
      needsApproval: frozen.needsApproval,
    };
    const room = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).hotelRoom.findFirst({ where: { id: mo.lease.roomId }, select: { number: true } });
    const party = await tenantDb({ tenantId: g.tenantId }).party.findFirst({ where: { id: mo.lease.partyId }, select: { name: true } });
    roomNumber = room?.number ?? "";
    tenantName = party?.name ?? "";
    root = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: mo.leaseId })).root;
    meters = insp.meters.map((m) => ({ meterId: m.meterId, kind: m.kind, baseValue: m.baseValue, value: m.value, units: m.units }));
  } else {
    live = await computeLive(ctx, g, mo, now);
    lines = live.lines;
    held = live.heldSatang;
    money = { chargesSatang: live.chargesSatang, unpaidSatang: live.unpaidSatang, deductSatang: live.deductSatang, refundSatang: live.refundSatang, tenantOwesSatang: live.tenantOwesSatang, needsApproval: live.needsApproval };
    warnings = live.warnings;
    roomNumber = live.roomNumber;
    tenantName = live.tenantName;
    root = live.root;
    meters = live.meters.map((m) => ({ meterId: m.meterId, kind: m.kind, baseValue: m.baseValue ?? 0, value: m.value, units: m.units }));
  }
  const attached = new Set(insp.files.map((f) => f.fileId));
  const viewer = { kind: "STAFF" as const, id: g.actorUserId };
  const photoIds: string[] = [];
  // SVC D.12 (Y16) ▸ รูปวันเข้าอยู่ที่สัญญาต้นสาย (สัญญาใหม่จากย้ายห้อง/ต่อสัญญาไม่มีรูปวันเข้า) ◂
  const photoSrc =
    root !== mo.leaseId ? ((await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormLease.findFirst({ where: { id: root }, select: { moveInPhotos: true } }))?.moveInPhotos ?? null) : mo.lease.moveInPhotos;
  if (Array.isArray(photoSrc))
    for (const p of photoSrc) if (isRec(p) && isStr(p.fileId) && p.kind !== "ID_CARD" && p.kind !== "DOCUMENT") photoIds.push(p.fileId);
  const moveInPhotos: { fileId: string; url: string }[] = [];
  for (const fileId of photoIds) {
    try {
      moveInPhotos.push({ fileId, url: privateFileUrl(fileId, viewer) });
    } catch {
      /* รหัสไฟล์เพี้ยน — ข้าม */
    }
  }
  const s: MoveOutSummary = {
    moveOutId: mo.id,
    leaseId: mo.leaseId,
    depositLeaseId: root,
    roomId: mo.lease.roomId,
    roomNumber,
    tenantName,
    status: (["NOTICE", "INSPECTED", "SETTLED", "REFUNDED", "CANCELLED"].includes(mo.status) ? mo.status : "NOTICE") as MoveOutStatus,
    rev: ded.rev,
    noticeDate: insp.noticeDate || bkkYmd(mo.noticeAt),
    moveOutDate,
    refundDueDate,
    daysLeft: daysBetween(today, refundDueDate),
    refundOverdue: !closed && mo.status !== "CANCELLED" && now.getTime() >= dueAt.getTime(),
    heldSatang: held,
    lines,
    ...money,
    approval: await approvalOf(g.tenantId, frozen?.approvalId ?? null),
    frozen: frozen ? { hash: frozen.hash, invoiceDocId: frozen.invoiceDocId, at: frozen.at } : null,
    sentAt: frozen?.sentAt ?? null,
    meters,
    items: insp.items.map((i) => ({ key: i.key, labelTh: i.labelTh, verdict: i.verdict, amountSatang: i.amountSatang, evidenceCount: i.evidenceFileIds.filter((f) => attached.has(f)).length })),
    moveInPhotos,
    warnings,
    settled: closed && ded.settle ? { entryId: ded.settle.entryId, appliedSatang: ded.settle.appliedSatang, refundSatang: ded.settle.refundSatang, at: ded.settle.at } : null,
  };
  if (closed && ded.settle) {
    s.refundSatang = ded.settle.refundSatang;
    s.tenantOwesSatang = ded.settle.tenantOwesSatang;
  }
  return { s, live, ded };
}

export async function moveOutSummary(ctx: MoveOutCtx, input: { unitId: string; moveOutId: string }, deps?: { now?: Date }): Promise<MoveOutSummary | null> {
  try {
    if (!isRec(input)) return null;
    const g = await d12Gate(ctx, input.unitId, "manage");
    if (!g) return null;
    const mo = await readMo(g, input.moveOutId);
    if (!mo) return null;
    return (await buildSummary(ctx, g, mo, nowOf(deps?.now))).s;
  } catch (e) {
    await logD12("summary", isRec(ctx) ? ctx.tenantId : null, e);
    return null;
  }
}

const BLOCKING_WARN = /^(RATE_MISSING|BASE_READING_MISSING|METER_BACKWARDS|METHOD_UNSUPPORTED)/;
export async function moveOutModel(ctx: MoveOutCtx, input: { unitId: string; moveOutId?: string; roomNumber?: string }, deps?: { now?: Date }): Promise<MoveOutModel | null> {
  try {
    if (!isRec(input)) return null;
    const g = await d12Gate(ctx, input.unitId, "manage");
    if (!g) return null;
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    let id: string | null = isStr(input.moveOutId) ? input.moveOutId : null;
    if (!id && isStr(input.roomNumber)) {
      const room = await db.hotelRoom.findFirst({ where: { number: input.roomNumber.trim() }, select: { id: true } });
      if (!room || !roomVisible(g, room.id)) return null;
      const row = await db.dormMoveOut.findFirst({ where: { status: { not: "CANCELLED" }, lease: { roomId: room.id } }, orderBy: [{ moveOutDate: "desc" }, { createdAt: "desc" }], select: { id: true } });
      id = row?.id ?? null;
    }
    if (!id) return null;
    const mo = await readMo(g, id);
    if (!mo) return null;
    const now = nowOf(deps?.now);
    const { s, ded } = await buildSummary(ctx, g, mo, now);
    const uv = await unitVals(g.tenantId, g.unitId, mo.lease.roomId);
    const unit = await tenantDb({ tenantId: g.tenantId }).businessUnit.findFirst({ where: { id: g.unitId }, select: { name: true } });
    const insp = inspOf(mo.inspection);
    const attached = new Set(insp.files.map((f) => f.fileId));
    const cl = Array.isArray(uv["rooms.moveout.checklist"]) ? (uv["rooms.moveout.checklist"] as unknown[]).filter(isRec) : [];
    const checklist: MoveOutModel["checklist"] = [];
    const seen = new Set<string>();
    for (const c of cl) {
      if (!isStr(c.key) || seen.has(c.key)) continue;
      seen.add(c.key);
      const it = insp.items.find((i) => i.key === c.key);
      checklist.push({ key: c.key, labelTh: it?.labelTh ?? strOr(c.labelTh, c.key), verdict: it?.verdict ?? null, amountSatang: it?.amountSatang ?? 0, evidenceCount: it ? it.evidenceFileIds.filter((f) => attached.has(f)).length : 0, note: it?.note ?? null });
    }
    for (const it of insp.items)
      if (!seen.has(it.key)) checklist.push({ key: it.key, labelTh: it.labelTh, verdict: it.verdict, amountSatang: it.amountSatang, evidenceCount: it.evidenceFileIds.filter((f) => attached.has(f)).length, note: it.note });
    const today = bkkYmd(now);
    const closed = CLOSED.includes(mo.status);
    const bills = await db.dormBill.findMany({ where: { leaseId: { in: (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: mo.leaseId })).ids }, status: { not: "VOID" } }, select: { status: true, sentVia: true } });
    let canSettle: MoveOutModel["canSettle"] = { ok: true, code: null };
    if (closed) canSettle = { ok: false, code: "SETTLED" };
    else if (mo.status === "CANCELLED") canSettle = { ok: false, code: "NOT_EDITABLE" };
    else if (!ded.frozen) canSettle = { ok: false, code: "NOT_FROZEN" };
    else if (ded.reopening) canSettle = { ok: false, code: "REOPENING" };
    else if (today < s.moveOutDate) canSettle = { ok: false, code: "NOT_MOVED_OUT" };
    else if (ded.frozen.needsApproval && s.approval.status === "REJECTED") canSettle = { ok: false, code: "DEDUCTION_REJECTED" }; // Y6 ▸ ทุกคน ◂
    else if (ded.frozen.needsApproval && !g.approve && !ded.frozen.selfApprovedById && s.approval.status !== "APPROVED") canSettle = { ok: false, code: "NEEDS_APPROVAL" };
    else if (billPending(bills)) canSettle = { ok: false, code: "BILL_PENDING" };
    let canSend: MoveOutModel["canSend"] = { ok: true, code: null };
    if (closed || mo.status === "CANCELLED") canSend = { ok: false, code: "NOT_EDITABLE" };
    else if (ded.reopening) canSend = { ok: false, code: "REOPENING" };
    else if (mo.status === "NOTICE") canSend = { ok: false, code: "NOT_INSPECTED" };
    else if (billPending(bills)) canSend = { ok: false, code: "BILL_PENDING" };
    else if (!ded.frozen && s.warnings.some((w) => BLOCKING_WARN.test(w))) canSend = { ok: false, code: s.warnings.find((w) => BLOCKING_WARN.test(w))?.split(":")[0] ?? "INVALID_INPUT" };
    const editable = !closed && mo.status !== "CANCELLED";
    const canInspect: MoveOutModel["canInspect"] = !editable ? { ok: false, code: "NOT_EDITABLE" } : ded.frozen ? { ok: false, code: "FROZEN" } : { ok: true, code: null };
    const canReopen: MoveOutModel["canReopen"] = !editable ? { ok: false, code: "NOT_EDITABLE" } : !ded.frozen ? { ok: false, code: "NOT_FROZEN" } : { ok: true, code: null };
    const canCancel: MoveOutModel["canCancel"] = !editable ? { ok: false, code: "NOT_EDITABLE" } : ded.frozen ? { ok: false, code: "FROZEN" } : mo.lease.status !== "NOTICE" ? { ok: false, code: "NOT_EDITABLE" } : { ok: true, code: null };
    const reads = await db.dormMeterReading.findMany({ where: { leaseId: mo.leaseId, kind: "MOVE_OUT" }, select: { readAt: true }, orderBy: { readAt: "desc" }, take: 1 });
    const due = refundDueOf(s.moveOutDate, mo.lease.policySnapshot, uv);
    const viewer = { kind: "STAFF" as const, id: g.actorUserId };
    const files: MoveOutModel["files"] = [];
    for (const f of insp.files) {
      try {
        files.push({ fileId: f.fileId, contentType: f.contentType, url: privateFileUrl(f.fileId, viewer) });
      } catch {
        /* รหัสไฟล์เพี้ยน — ข้าม */
      }
    }
    const itemEvidence: Record<string, string[]> = {};
    const itemDamageCode: Record<string, string | null> = {};
    for (const it of insp.items) {
      itemEvidence[it.key] = it.evidenceFileIds.filter((f) => attached.has(f));
      itemDamageCode[it.key] = it.damageCode;
    }
    return {
      ...s,
      unitName: unit?.name ?? "",
      returnDays: daysBetween(s.moveOutDate, s.refundDueDate) || due.returnDays,
      checklist,
      canSettle,
      canSend,
      approver: g.approve,
      moveInDate: ymdOfDb(mo.lease.startDate),
      meterReadAt: reads[0] ? reads[0].readAt.toISOString() : null,
      fileCount: insp.files.length,
      catalog: [...catalogOf(uv).entries()].map(([code, v]) => ({ code, labelTh: v.labelTh, amountSatang: v.amountSatang })),
      files,
      itemEvidence,
      itemDamageCode,
      canInspect,
      canReopen,
      canCancel,
      reopening: !!ded.reopening,
      leaseStatus: mo.lease.status,
    };
  } catch (e) {
    await logD12("model", isRec(ctx) ? ctx.tenantId : null, e);
    return null;
  }
}

// ───────────────────────── 3.5 ส่งใบสรุป (ตรึง) ─────────────────────────
function invoiceLinesOf(lines: SummaryLine[], uv: UnitVals): ExternalDocLine[] {
  const pos = lines.filter((l) => l.code !== "UNPAID" && l.amountSatang > 0);
  let adv = -lines.filter((l) => l.code === "ADVANCE_RENT").reduce((s, l) => s + l.amountSatang, 0);
  const out: ExternalDocLine[] = [];
  for (const l of pos) {
    let amount = l.amountSatang;
    let label = l.labelTh;
    if (l.code === "RENT" && adv > 0) {
      const use = Math.min(adv, amount);
      amount -= use;
      adv -= use;
      label = `${label} (หักค่าเช่าล่วงหน้า ${baht(use)})`;
      if (amount <= 0) continue;
      out.push(docLine(label, amount, 1, amount, taxKindOf(uv, l.code)));
      continue;
    }
    const desc = l.code === "DAMAGE" ? `ค่าเสียหาย: ${label}` : l.code === "ELEC" ? `ค่าไฟฟ้าถึงวันย้ายออก ${l.qty ?? ""} หน่วย` : l.code === "WATER" ? `ค่าน้ำประปาถึงวันย้ายออก ${l.qty ?? ""} หน่วย` : label;
    out.push(docLine(desc.trim(), amount, l.qty, l.unitPriceSatang ?? null, taxKindOf(uv, l.code)));
  }
  return out;
}
const invoiceRef = (moveOutId: string, rev: number) => (rev <= 1 ? moveOutId : `${moveOutId}#${rev}`);
function summaryVars(s: { tenantName: string; roomNumber: string; moveOutDate: string; heldSatang: number; deductSatang: number; refundSatang: number; tenantOwesSatang: number; refundDueDate: string; lines: SummaryLine[] }, unitName: string): Record<string, string> {
  return {
    tenantName: s.tenantName,
    roomNo: s.roomNumber,
    unitName,
    moveOutDate: thDate(s.moveOutDate),
    depositAmount: baht(s.heldSatang),
    deductAmount: baht(s.deductSatang),
    refundAmount: baht(s.refundSatang),
    owesAmount: baht(s.tenantOwesSatang),
    refundDueDate: thDate(s.refundDueDate),
    // SVC D.12 (Y16) ▸ เครื่องหมายเดียวต่อบรรทัด (หัก "−" · คืน/หักออก "+") — ไม่ซ้อน "− -฿" ◂
    lines: s.lines.map((l) => `${l.amountSatang < 0 ? "+" : "−"} ${l.labelTh} ${baht(Math.abs(l.amountSatang))}`).join("\n"),
  };
}
/** SVC D.12 (Y14) ▸ ตรวจคำต้องห้ามบนแม่แบบ (ข้อความดิบ + ค่าตัวเลข/วันที่ของระบบ) — รายการที่พนักงานพิมพ์ยังตรวจ · ไม่ตรวจชื่อคน/ชื่อหอ (ชื่อผู้เช่าที่บังเอิญมีคำนั้นไม่ทำให้ส่งไม่ได้) ◂ */
function templateBad(uv: UnitVals, vars: Record<string, string>): boolean {
  const def = getDef("rooms.msg.moveOutSummary");
  if (!def) return true;
  const value = uv["rooms.msg.moveOutSummary"];
  const neutral = { ...vars, tenantName: "ผู้เช่า", unitName: "หอพัก" };
  return [renderTemplate(def, value, {}, "th"), renderTemplate(def, value, {}, "en"), renderTemplate(def, value, neutral, "th"), renderTemplate(def, value, neutral, "en")].some((t) => findForbiddenTerms(t).length > 0);
}
async function policyHasOwner(tenantId: string, unitId: string, amount: number): Promise<boolean> {
  const pol = await resolvePolicy({ tenantId }, { entityType: ENTITY, unitId, systemId: null, amountSatang: amount });
  if (!pol) return false;
  const full = (await listPoliciesForEntities({ tenantId }, [ENTITY])).find((x) => x.id === pol.id);
  return !!full && full.steps.some((s) => s.approverRole === "OWNER");
}
type Channel = "LINE" | "SMS" | "NONE";
async function notifySummary(g: D12Gate, mo: MoRow, rev: number, vars: Record<string, string>, now: Date): Promise<Channel> {
  const { notifyCustomer } = await import("@/lib/platform/notify-customer");
  const r = await notifyCustomer(
    { tenantId: g.tenantId },
    {
      unitId: g.unitId,
      domain: "rooms",
      messageKey: "moveOutSummary",
      partyId: mo.lease.partyId,
      vars,
      dedupeKey: `rooms:moveOutSummary:${mo.id}:${rev}`,
      at: now,
      // D.9 precheck: อ่านสถานะสดหลังอ้างสิทธิ์ — ใบยังตรึงรุ่นนี้อยู่และยังไม่ถูกยกเลิก
      precheck: async () => {
        const cur = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormMoveOut.findFirst({ where: { id: mo.id }, select: { status: true, deductions: true } });
        const d = dedOf(cur?.deductions);
        return cur && cur.status !== "CANCELLED" && d.frozen && d.rev === rev ? { ok: true as const } : { ok: false as const, reason: "MOVEOUT_STALE" };
      },
    },
  );
  return r.channel === "LINE" || r.channel === "SMS" ? r.channel : "NONE";
}
async function markSent(g: D12Gate, moveOutId: string, leaseId: string, rev: number, at: Date): Promise<void> {
  const root = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId })).root;
  await d12Tx(async (tx) => {
    await advisoryLock(tx, leaseLockKey(root));
    if (root !== leaseId) await advisoryLock(tx, leaseLockKey(leaseId));
    const cur = await tx.dormMoveOut.findFirst({ where: { id: moveOutId, tenantId: g.tenantId, unitId: g.unitId }, select: { deductions: true } });
    const raw = isRec(cur?.deductions) ? cur.deductions : null;
    const d = dedOf(raw);
    if (!raw || !d.frozen || d.rev !== rev || d.frozen.sentAt) return { done: true };
    const frozen = isRec(raw.frozen) ? { ...raw.frozen, sentAt: at.toISOString() } : raw.frozen;
    await tx.dormMoveOut.updateMany({ where: { id: moveOutId, tenantId: g.tenantId, unitId: g.unitId }, data: { deductions: json({ ...raw, frozen }) } });
    return { done: true };
  });
}
/** ใบวันออกของรุ่น (หาตาม ref — ใช้เมื่อประวัติจองรุ่นไว้แต่ไม่รู้เลขใบ เช่น โพรเซสตายหลังออกใบ) */
async function moveOutInvoiceOf(tenantId: string, unitId: string, moveOutId: string, rev: number): Promise<{ id: string; grandTotal: number } | null> {
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; grandTotal: number }[]>`
    SELECT "id", "grandTotal" FROM "AccountDocument"
    WHERE "tenantId" = ${tenantId} AND "source"::text = 'DORM' AND "refSystemId" = ${unitId} AND "refType" = 'DormMoveOut' AND "refId" = ${invoiceRef(moveOutId, rev)}
      AND "docType"::text = 'INVOICE' AND "status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT')
    ORDER BY "id" ASC LIMIT 1`;
  return rows[0] ? { id: rows[0].id, grandTotal: Number(rows[0].grandTotal) } : null;
}
/** บรรทัดจริงของใบ (Y4 — ใบลดหนี้ใช้บรรทัดเดิม) · VAT7 = 700 · อื่น = ไม่มี VAT */
async function docLinesFromDb(tenantId: string, docId: string): Promise<ExternalDocLine[]> {
  const rows = await tenantDb({ tenantId }).$queryRaw<{ description: string; qty: unknown; unitPrice: number; vatRateBp: number; amount: number }[]>`
    SELECT "description", "qty", "unitPrice", "vatRateBp", "amount" FROM "AccountDocumentLine" WHERE "tenantId" = ${tenantId} AND "documentId" = ${docId} ORDER BY "sortOrder" ASC, "id" ASC`;
  return rows.map((r) => {
    const q = Number(r.qty);
    const tk: TaxKind = Number(r.vatRateBp) === 700 ? "VAT7" : "NONE";
    return Number.isSafeInteger(q) && q > 0 && q * Number(r.unitPrice) === Number(r.amount)
      ? { description: r.description, qty: q, unitPriceSatang: Number(r.unitPrice), taxKind: tk }
      : { description: r.description, qty: 1, unitPriceSatang: Number(r.amount), taxKind: tk };
  });
}
/**
 * SVC D.12 (Y1) ▸ ใบวันออกรุ่นที่ไม่ได้ตรึง (แข่ง/STALE/tx ล้ม/โพรเซสตาย) ⇒ จดเป็นกำพร้าในประวัติ + ขึ้นรุ่นใต้ล็อก (ทุกกรณี)
 *   ไม่แตะใบที่ตรึงอยู่ · รุ่นถูกขึ้นไปแล้ว ⇒ จดเลขใบอย่างเดียว · ใบลดหนี้ออกตอน creditOrphans (ครั้งส่งถัดไป)
 */
/** แถวจองรุ่นที่ค้างนานกว่านี้ = ผู้ส่งตายแล้ว (ใบ CANCELLED/งานตามเวลาถือเป็นกำพร้าได้) */
const PENDING_STALE_MS = 10 * 60_000;
/** ผู้กระทำของงานกำพร้า — คน (D12Gate) หรือระบบ (งานตามเวลา · actorUserId null) */
type OrphanCtx = { tenantId: string; unitId: string; actorUserId: string | null };
async function orphanizeRev(g: OrphanCtx, moveOutId: string, leaseId: string, rev: number, invoiceDocId: string | null, reason: string, now: Date): Promise<void> {
  const root = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId })).root;
  await d12Tx(async (tx) => {
    await advisoryLock(tx, leaseLockKey(root));
    if (root !== leaseId) await advisoryLock(tx, leaseLockKey(leaseId));
    const cur = await tx.dormMoveOut.findFirst({ where: { id: moveOutId, tenantId: g.tenantId, unitId: g.unitId }, select: { deductions: true } });
    const raw = isRec(cur?.deductions) ? cur.deductions : {};
    const d = dedOf(raw);
    if (d.frozen && d.rev === rev && (!invoiceDocId || d.frozen.invoiceDocId === invoiceDocId)) return { done: true }; // รุ่นนี้ตรึงด้วยใบนี้แล้ว — ไม่ใช่กำพร้า
    // SVC D.12 (Y22 · N3) ▸ แถวเดียวต่อรุ่น: มีแถวรุ่นนี้แล้ว ⇒ ปรับแถวเดิม (ลดหนี้ "NONE" ไปแล้วแต่เพิ่งรู้เลขใบ ⇒ เปิดให้ลดหนี้ใหม่) · ไม่มี ⇒ ต่อแถว ◂
    let hit = false;
    const history = d.history.map((h) => {
      if (h.rev !== rev) return h;
      hit = true;
      if (!h.creditNoteDocId) return { ...h, pending: false, invoiceDocId: invoiceDocId ?? h.invoiceDocId, reason: h.reason || reason };
      if (h.creditNoteDocId === "NONE" && invoiceDocId && !h.invoiceDocId) return { ...h, pending: false, invoiceDocId, creditNoteDocId: null, reason: h.reason || reason };
      return h;
    });
    if (!hit) history.push({ rev, invoiceDocId, creditNoteDocId: null, reason, at: now.toISOString(), pending: false });
    const bump = d.rev === rev && !d.frozen;
    await tx.dormMoveOut.updateMany({ where: { id: moveOutId, tenantId: g.tenantId, unitId: g.unitId }, data: { deductions: json({ ...raw, ...(bump ? { rev: rev + 1 } : {}), history }) } });
    return { done: true };
  });
}
/** ใบแจ้งหนี้รุ่นที่ไม่ได้ตรึง ⇒ ใบลดหนี้เต็มใบด้วยบรรทัดเดิม + VAT ของใบนั้น (ไม่ลบ) แล้วจดในประวัติ — เห็นทุกรุ่นเก่าที่ยังไม่ลดหนี้ (รวมรุ่นที่จองไว้แต่ไม่รู้เลขใบ) */
/** SVC D.12 (Y22) ▸ ทำงานได้กับใบทุกสถานะ (รวม CANCELLED — งานตามเวลาเรียกซ้ำได้ · idempotent ต่อ ref) · แถวที่ยังจอง (pending) ข้าม ◂ */
async function creditOrphans(g: OrphanCtx, moveOutId: string, leaseId: string, uv: UnitVals): Promise<Fail | null> {
  const row = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormMoveOut.findFirst({ where: { id: moveOutId }, select: { deductions: true, status: true } });
  const ded = dedOf(row?.deductions);
  const staleMs = Date.now() - PENDING_STALE_MS;
  const orphans = ded.history.filter(
    (h) =>
      !h.creditNoteDocId &&
      (h.rev < ded.rev || row?.status === "CANCELLED") &&
      (!h.pending || h.rev < ded.rev || Date.parse(h.at) < staleMs) &&
      !(ded.frozen && h.rev === ded.rev),
  );
  for (const h of orphans) {
    const inv = h.invoiceDocId
      ? ((await tenantDb({ tenantId: g.tenantId }).$queryRaw<{ id: string; grandTotal: number }[]>`SELECT "id", "grandTotal" FROM "AccountDocument" WHERE "tenantId" = ${g.tenantId} AND "id" = ${h.invoiceDocId}`)[0] ?? null)
      : await moveOutInvoiceOf(g.tenantId, g.unitId, moveOutId, h.rev);
    let cnId: string | null = null;
    if (inv && Number(inv.grandTotal) > 0) {
      const lines = await docLinesFromDb(g.tenantId, inv.id);
      const cn = await createExternalCreditNote({
        tenantId: g.tenantId,
        unitId: g.unitId,
        sourceDocId: inv.id,
        refType: "DormMoveOutReopen",
        refId: `${moveOutId}:${h.rev}`,
        reason: (h.reason || "ใบสรุปย้ายออกรุ่นที่ไม่ได้ส่งให้ผู้เช่า (ข้อมูลเปลี่ยนระหว่างออกใบ)").slice(0, 300),
        lines: lines.length ? lines : [{ description: "ยกเลิกใบแจ้งหนี้วันย้ายออกรุ่นเดิม", qty: 1, unitPriceSatang: Number(inv.grandTotal), taxKind: "NONE" }],
        vat: h.vat ?? vatOf(uv),
        createdById: g.actorUserId,
      });
      if (!cn.ok) return fail(cn.code, cn.reason);
      cnId = cn.docId;
    }
    const root = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId })).root;
    await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(root));
      if (root !== leaseId) await advisoryLock(tx, leaseLockKey(leaseId));
      const cur = await tx.dormMoveOut.findFirst({ where: { id: moveOutId, tenantId: g.tenantId, unitId: g.unitId }, select: { deductions: true } });
      const raw = isRec(cur?.deductions) ? cur.deductions : {};
      const d = dedOf(raw);
      const history = d.history.map((x) => (x.rev === h.rev && !x.creditNoteDocId ? { ...x, pending: false, invoiceDocId: x.invoiceDocId ?? inv?.id ?? null, creditNoteDocId: cnId ?? "NONE" } : x));
      await tx.dormMoveOut.updateMany({ where: { id: moveOutId, tenantId: g.tenantId, unitId: g.unitId }, data: { deductions: json({ ...raw, history }) } });
      return { done: true };
    });
  }
  return null;
}

type SendOk = { ok: true; duplicate: boolean; rev: number; invoiceDocId: string | null; approvalId: string | null; channel: Channel; status: string };
const REOPENING = () => fail("REOPENING", "กำลังเปิดใบสรุปใหม่ (ออกใบลดหนี้ใบเดิม) — รอสักครู่แล้วโหลดหน้าใหม่ หรือกดเปิดใบสรุปใหม่อีกครั้งให้เสร็จ");
async function resendFrozen(ctx: MoveOutCtx, g: D12Gate, mo: MoRow, ded: Ded, unitName: string, now: Date): Promise<SendOk> {
  const frozen = ded.frozen as Frozen;
  const { s } = await buildSummary(ctx, g, mo, now);
  const channel = await notifySummary(g, mo, ded.rev, summaryVars(s, unitName), now);
  if (!frozen.sentAt) await markSent(g, mo.id, mo.leaseId, ded.rev, now);
  return { ok: true, duplicate: true, rev: ded.rev, invoiceDocId: frozen.invoiceDocId, approvalId: frozen.approvalId, channel, status: mo.status };
}

export async function sendMoveOutSummary(ctx: MoveOutCtx, input: { unitId: string; moveOutId: string }, deps?: { now?: Date }): Promise<SendOk | Fail> {
  try {
    if (!isRec(input)) return notFound();
    const g = await d12Gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const mo0 = await readMo(g, input.moveOutId);
    if (!mo0) return notFound();
    const now = nowOf(deps?.now);
    const unit = await tenantDb({ tenantId: g.tenantId }).businessUnit.findFirst({ where: { id: g.unitId }, select: { name: true } });
    const unitName = unit?.name ?? "";
    // IDEMPOTENCY_CONFLICT (ใบรุ่นนี้ถูกออกด้วยบรรทัดอื่นโดยครั้งก่อนที่ไม่จบ) ⇒ จดกำพร้า + ขึ้นรุ่นแล้วลองใหม่ 1 ครั้ง
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await sendOnce(ctx, g, mo0.id, unitName, now);
      if (r !== "RETRY") return r;
    }
    return STALE();
  } catch (e) {
    await logD12("send", isRec(ctx) ? ctx.tenantId : null, e);
    return unavailable();
  }
}
async function sendOnce(ctx: MoveOutCtx, g: D12Gate, moveOutId: string, unitName: string, now: Date): Promise<SendOk | Fail | "RETRY"> {
  let mo = await readMo(g, moveOutId);
  if (!mo) return notFound();
  if (CLOSED.includes(mo.status) || mo.status === "CANCELLED") return fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดหรือยกเลิกไปแล้ว");
  if (mo.status === "NOTICE") return fail("NOT_INSPECTED", "ยังไม่ได้บันทึกตรวจห้องและมิเตอร์วันออก — ตรวจห้องก่อนส่งใบสรุป");
  let ded = dedOf(mo.deductions);
  if (ded.reopening) return REOPENING();
  // 2. ตรึงแล้วรุ่นเดียวกัน ⇒ ส่งข้อความซ้ำด้วย dedupe เดิม
  if (ded.frozen) return resendFrozen(ctx, g, mo, ded, unitName, now);
  // 1. precheck — ไม่ผ่าน = ไม่มีอะไรเกิด
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const roomMeters = await db.dormMeter.findMany({ where: { roomId: mo.lease.roomId, role: "ROOM", removedAt: null }, select: { id: true } });
  const reads = await db.dormMeterReading.findMany({ where: { leaseId: mo.leaseId, kind: "MOVE_OUT" }, select: { meterId: true } });
  if (roomMeters.some((m) => !reads.some((r) => r.meterId === m.id))) return fail("METER_MISSING", "ยังไม่ได้จดมิเตอร์วันออกครบทุกตัวของห้องนี้ — จดเลขวันออกก่อนส่งใบสรุป");
  const pre = await computeLive(ctx, g, mo, now);
  if (billPending(pre.bills)) return BILL_PENDING();
  const blocking = pre.warnings.find((w) => BLOCKING_WARN.test(w));
  if (blocking) {
    const code = blocking.split(":")[0];
    return fail(code, code === "RATE_MISSING" ? "ยังไม่มีอัตราค่าน้ำ/ไฟของเดือนวันออก — ใส่บิลการไฟฟ้า/ประปาหรืออัตราคงที่ก่อน" : code === "METHOD_UNSUPPORTED" ? "วิธีคิดค่าน้ำไฟของหอนี้ยังคิดถึงวันย้ายออกอัตโนมัติไม่ได้ — ใส่ค่าน้ำไฟเป็นรายการเองในบิล" : "เลขมิเตอร์วันออกไม่ถูกต้อง — ตรวจเลขอีกครั้ง");
  }
  const due = dueYmdOf(mo.refundDueAt ?? dueAtOf(addDaysYmd(ymdOfDb(mo.moveOutDate), 7)));
  const varsOf = (l: Live) => summaryVars({ tenantName: l.tenantName, roomNumber: l.roomNumber, moveOutDate: ymdOfDb(mo!.moveOutDate), heldSatang: l.heldSatang, deductSatang: l.deductSatang, refundSatang: l.refundSatang, tenantOwesSatang: l.tenantOwesSatang, refundDueDate: due, lines: l.lines }, unitName);
  if (templateBad(pre.uv, varsOf(pre))) return fail("TEMPLATE_BLOCKED", "แม่แบบข้อความใบสรุปย้ายออกมีถ้อยคำต้องห้ามตามประกาศ สคบ. — แก้แม่แบบในค่าตั้งก่อนส่ง");
  if (pre.needsApproval && !g.approve && !(await policyHasOwner(g.tenantId, g.unitId, pre.deductSatang)))
    return fail("NEEDS_APPROVAL", "หักเงินประกันเกินวงเงินต้องให้เจ้าของอนุมัติ แต่ร้านยังไม่ได้ตั้งสายอนุมัติ \"หักเงินประกันเกินวงเงิน (หอพัก)\" ที่มีขั้นเจ้าของ — ให้เจ้าของทำรายการนี้เอง หรือตั้งสายอนุมัติก่อน");
  // ใบรุ่นเก่าที่ค้าง (ไม่ได้ตรึง) ⇒ ใบลดหนี้ก่อน
  const orphanFail = await creditOrphans(g, mo.id, mo.leaseId, pre.uv);
  if (orphanFail) return orphanFail;
  // SVC D.12 (Y23) ▸ ใบลดหนี้ค่าห้องส่วนเกินออก "หลังตรึงสำเร็จ" เท่านั้น (ดูท้ายฟังก์ชัน) — STALE ⇒ ไม่ออก ◂
  mo = (await readMo(g, mo.id)) ?? mo;
  ded = dedOf(mo.deductions);
  if (ded.frozen) return resendFrozen(ctx, g, mo, ded, unitName, now);
  if (ded.reopening) return REOPENING();
  // ลายนิ้วมือก่อนอ่านยอด — อะไรที่เปลี่ยนหลังจุดนี้ ⇒ hash สดใต้ล็อกไม่เท่า ⇒ ไม่ตรึงบรรทัดเก่า
  const chainIds = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: mo.leaseId })).ids;
  const root0 = chainIds[0] ?? mo.leaseId;
  // Y19 ▸ ลายนิ้วมือใช้ตรวจห้องชุดเดียวกับที่ computeLive คิดบรรทัด (mo ที่อ่านครั้งเดียว) — ใต้ล็อกเทียบกับค่าสดในฐาน ◂
  const snapMo = mo;
  const sig = await chainSig(scopedDb(g.tenantId, g.unitId), g.tenantId, g.unitId, chainIds, snapMo.id, snapMo.leaseId, await securityDepositHeld({ tenantId: g.tenantId, unitId: g.unitId, leaseId: root0 }), snapMo.inspection ?? null);
  const live = await computeLive(ctx, g, snapMo, now);
  if (billPending(live.bills)) return STALE();
  const vars = varsOf(live);
  const needOwner = live.needsApproval && !g.approve;
  if (needOwner && !(await policyHasOwner(g.tenantId, g.unitId, live.deductSatang)))
    return fail("NEEDS_APPROVAL", "หักเงินประกันเกินวงเงินต้องให้เจ้าของอนุมัติ แต่ร้านยังไม่ได้ตั้งสายอนุมัติ \"หักเงินประกันเกินวงเงิน (หอพัก)\" ที่มีขั้นเจ้าของ — ให้เจ้าของทำรายการนี้เอง หรือตั้งสายอนุมัติก่อน");
  const invLines = live.invLines;
  const invTotal = live.lines.filter((l) => l.code !== "UNPAID").reduce((a, l) => a + l.amountSatang, 0);
  // SVC D.12 (Y1) ▸ จองรุ่นใต้ล็อกก่อนออกใบ (history pending · บรรทัด/VAT/ยอดของใบ) — โพรเซสตายหลังออกใบ ⇒ ครั้งหน้าเห็นเป็นกำพร้าได้เสมอ ◂
  const reserved = await d12Tx(async (tx) => {
    await advisoryLock(tx, leaseLockKey(live.root));
    if (live.root !== mo!.leaseId) await advisoryLock(tx, leaseLockKey(mo!.leaseId));
    const cur = await tx.dormMoveOut.findFirst({ where: { id: mo!.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, deductions: true } });
    if (!cur || cur.status !== "INSPECTED") throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้เปลี่ยนไปแล้ว — โหลดหน้าใหม่"));
    const raw = isRec(cur.deductions) ? cur.deductions : {};
    const d = dedOf(raw);
    if (d.frozen) return { frozen: true as const, rev: d.rev };
    if (d.reopening) throw new Abort(REOPENING());
    if (!d.history.some((h) => h.rev === d.rev && !h.creditNoteDocId)) {
      const history = [...d.history, { rev: d.rev, invoiceDocId: null, creditNoteDocId: null, reason: "", at: now.toISOString(), pending: true, lines: invLines, vat: live.vat, totalSatang: invTotal }];
      await tx.dormMoveOut.updateMany({ where: { id: mo!.id, tenantId: g.tenantId, unitId: g.unitId, status: "INSPECTED" }, data: { deductions: json({ ...raw, rev: d.rev, history }) } });
    }
    return { frozen: false as const, rev: d.rev };
  });
  if (isFail(reserved)) return reserved;
  if (reserved.frozen) {
    const m2 = (await readMo(g, mo.id)) ?? mo;
    return resendFrozen(ctx, g, m2, dedOf(m2.deductions), unitName, now);
  }
  const rev = reserved.rev;
  // 3. ใบแจ้งหนี้วันออก (นอก tx · idempotent ต่อ ref ของรุ่น)
  let invoiceDocId: string | null = null;
  if (invLines.length) {
    const inv = await createExternalInvoice({
      tenantId: g.tenantId,
      sourceKind: "DORM",
      unitId: g.unitId,
      refType: "DormMoveOut",
      refId: invoiceRef(mo.id, rev),
      customer: { name: live.tenantName || "ผู้เช่า" },
      partyId: mo.lease.partyId,
      lines: invLines,
      vat: live.vat,
      issueDate: bkkYmd(now),
      dueDate: bkkYmd(now) < due ? due : bkkYmd(now),
      note: `ใบสรุปวันย้ายออก ห้อง ${live.roomNumber} (ย้ายออก ${thDate(ymdOfDb(mo.moveOutDate))})`,
      createdById: g.actorUserId,
    });
    if (!inv.ok) {
      if (inv.code === "IDEMPOTENCY_CONFLICT") {
        // ใบของรุ่นนี้มีอยู่แล้วด้วยบรรทัดอื่น (ครั้งก่อนไม่จบ) ⇒ กำพร้า + ขึ้นรุ่น แล้วลองใหม่
        await orphanizeRev(g, mo.id, mo.leaseId, rev, (await moveOutInvoiceOf(g.tenantId, g.unitId, mo.id, rev))?.id ?? null, "ข้อมูลของสัญญาเปลี่ยนระหว่างออกใบสรุป", now);
        return "RETRY";
      }
      return fail(inv.code, inv.reason);
    }
    invoiceDocId = inv.docId;
  }
  const docIds = live.unpaid.map((u) => u.docId);
  const selfApprove = live.needsApproval && g.approve;
  let out: { dup: boolean; approvalId: string | null } | { stale: true } | Fail;
  try {
    out = await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(live.root));
      if (live.root !== mo!.leaseId) await advisoryLock(tx, leaseLockKey(mo!.leaseId));
      for (const lid of [...live.chain].sort()) await advisoryLock(tx, lateFeeLockKey(lid));
      const cur = await tx.dormMoveOut.findFirst({ where: { id: mo!.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, deductions: true } });
      if (!cur || CLOSED.includes(cur.status) || cur.status === "CANCELLED") throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดหรือยกเลิกไปแล้ว"));
      const raw = isRec(cur.deductions) ? cur.deductions : {};
      const d = dedOf(raw);
      if (d.frozen) {
        if (d.rev === rev && d.frozen.hash === sig && d.frozen.invoiceDocId === invoiceDocId) return { dup: true, approvalId: d.frozen.approvalId };
        throw new Abort(STALE());
      }
      if (d.reopening) throw new Abort(REOPENING());
      if (d.rev !== rev || cur.status !== "INSPECTED") throw new Abort(STALE());
      const heldIn = await securityDepositHeldInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, leaseId: live.root });
      const fresh = await chainSig(tx, g.tenantId, g.unitId, live.chain, mo!.id, mo!.leaseId, heldIn);
      if (fresh !== sig || heldIn !== live.heldSatang) return { stale: true as const };
      let approvalId: string | null = null;
      if (needOwner) {
        const sub = await submitForApproval({ tenantId: g.tenantId }, { entityType: ENTITY, entityId: `${mo!.id}:${rev}`, unitId: g.unitId, requestedById: g.actorUserId, amountSatang: live.deductSatang }, { tx });
        if (!("requestId" in sub)) throw new Abort(fail("NEEDS_APPROVAL", "หักเงินประกันเกินวงเงินต้องให้เจ้าของอนุมัติ — ตั้งสายอนุมัติที่มีขั้นเจ้าของก่อน"));
        approvalId = sub.requestId;
      }
      const frozen: Frozen = {
        hash: sig,
        at: now.toISOString(),
        invoiceDocId,
        docIds,
        approvalId,
        lines: live.lines,
        heldSatang: live.heldSatang,
        refundSatang: live.refundSatang,
        tenantOwesSatang: live.tenantOwesSatang,
        needsApproval: live.needsApproval,
        sentAt: null,
        invLines,
        vat: live.vat,
        selfApprovedById: selfApprove ? g.actorUserId : null,
        rentCredit: live.rentCredit,
      };
      const history = d.history.filter((h) => !(h.rev === rev && h.pending && !h.creditNoteDocId)); // รุ่นที่จองไว้ = รุ่นที่ตรึงแล้ว
      await tx.dormMoveOut.updateMany({
        where: { id: mo!.id, tenantId: g.tenantId, unitId: g.unitId, status: "INSPECTED" },
        data: { deductions: json({ ...raw, rev, frozen, history }), depositSatang: live.heldSatang, deductSatang: live.deductSatang, refundSatang: live.refundSatang, approvalId },
      });
      await tx.auditLog.create({
        data: {
          tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.summary_frozen", targetType: "DormMoveOut", targetId: mo!.id,
          after: { rev, invoiceDocId, docIds, heldSatang: live.heldSatang, chargesSatang: live.chargesSatang, refundSatang: live.refundSatang, tenantOwesSatang: live.tenantOwesSatang, needsApproval: live.needsApproval, approvalId, selfApprove },
        },
      });
      if (selfApprove)
        await tx.auditLog.create({
          data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.deduction_self_approved", targetType: "DormMoveOut", targetId: mo!.id, after: { rev, stage: "freeze", approverId: g.actorUserId, deductSatang: live.deductSatang, actorRole: g.role } },
        });
      return { dup: false, approvalId };
    });
  } catch (e) {
    // tx ล้มหลังออกใบ ⇒ ใบนี้เป็นกำพร้า (ขึ้นรุ่นใต้ล็อก) แล้วโยนต่อ (ผู้เรียก ⇒ UNAVAILABLE)
    if (invoiceDocId) await orphanizeRev(g, mo.id, mo.leaseId, rev, invoiceDocId, "บันทึกใบสรุปไม่สำเร็จหลังออกใบ", now).catch(() => undefined);
    throw e;
  }
  if (isFail(out)) {
    // ปฏิเสธใต้ล็อก (STALE/NEEDS_APPROVAL/BUSY…) หลังออกใบ ⇒ กำพร้า + ขึ้นรุ่น (orphanizeRev ไม่แตะใบที่ตรึงอยู่)
    if (invoiceDocId || out.code !== "NOT_EDITABLE") await orphanizeRev(g, mo.id, mo.leaseId, rev, invoiceDocId, "ข้อมูลของสัญญาเปลี่ยนระหว่างออกใบสรุป", now);
    // Y22 ▸ แพ้การยกเลิก (ใบ CANCELLED) ⇒ ลดหนี้ใบของรุ่นนี้ทันที (ล้ม ⇒ งานตามเวลาทำต่อ) ◂
    if (out.code === "NOT_EDITABLE") await cancelledCleanup(g, mo.id, mo.leaseId, mo.lease.roomId, now).catch((e) => logD12("send.cancelled_cleanup", g.tenantId, e));
    return out;
  }
  if ("stale" in out) {
    await orphanizeRev(g, mo.id, mo.leaseId, rev, invoiceDocId, "ข้อมูลของสัญญาเปลี่ยนระหว่างออกใบสรุป", now);
    return STALE();
  }
  // Y23 ▸ หลังตรึงสำเร็จ: ใบลดหนี้ค่าห้องส่วนเกิน (ref ต่อรุ่น · idempotent) — ล้มที่นี่ ⇒ ปิดประกันออกให้ก่อนหักเสมอ ◂
  await issueRentCredit(g, mo.id, mo.leaseId, mo.lease.roomId, now).catch((e) => logD12("send.rent_credit", g.tenantId, e));
  const channel = await notifySummary(g, mo, rev, vars, now);
  await markSent(g, mo.id, mo.leaseId, rev, now);
  return { ok: true, duplicate: out.dup, rev, invoiceDocId, approvalId: out.approvalId, channel, status: "INSPECTED" };
}
/** ออกใบลดหนี้ค่าห้องส่วนเกินตาม frozen.rentCredit ของรุ่นที่ตรึงอยู่ (ซ้ำได้ · ref ต่อรุ่น) · ไม่มีแผน ⇒ null · สำเร็จ/มีอยู่แล้ว ⇒ เลขใบ */
async function issueRentCredit(g: D12Gate, moveOutId: string, leaseId: string, roomId: string, now: Date): Promise<string | null | Fail> {
  const row = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormMoveOut.findFirst({ where: { id: moveOutId }, select: { deductions: true, moveOutDate: true } });
  const d = dedOf(row?.deductions);
  const rc = d.frozen?.rentCredit;
  if (!rc) return null;
  const uv = await unitVals(g.tenantId, g.unitId, roomId);
  const vat = d.frozen?.vat ?? vatOf(uv);
  const cn = await createExternalCreditNote({
    tenantId: g.tenantId,
    unitId: g.unitId,
    sourceDocId: rc.billDocId,
    refType: RENT_CREDIT_REF,
    refId: rc.refId,
    reason: `ย้ายออกก่อนสิ้นเดือน — ลดค่าห้องส่วนเกิน (${thDate(ymdOfDb(row?.moveOutDate))})`,
    lines: [{ description: rc.labelTh, qty: 1, unitPriceSatang: rc.amount, taxKind: vat.registered ? "EXEMPT" : "NONE" }],
    vat,
    issueDate: bkkYmd(now),
    createdById: g.actorUserId,
  });
  void leaseId;
  return cn.ok ? cn.docId : fail(cn.code, cn.reason);
}

// ───────────────────────── 3.6 เปิดใบสรุปใหม่ ─────────────────────────
//   SVC D.12 (Y5) ▸ 2 จังหวะ: (1) ใต้ล็อกตั้ง reopening (ปิดประกันปฏิเสธตั้งแต่จุดนี้) → ใบลดหนี้ใบเดิม (นอก tx · ref idempotent)
//   → (2) ใต้ล็อกขึ้นรุ่น + ประวัติ + ล้าง reopening · ล้มกลางทาง ⇒ reopening ค้าง (ปิดไม่ได้) จนกดเปิดใหม่ซ้ำ (ต่อจากจังหวะที่ค้าง) ◂
//   SVC D.12 (Y15) ▸ ใบลดหนี้ใช้บรรทัด/VAT ที่ตรึง (frozen.invLines/vat) ไม่ใช่ค่าตั้งปัจจุบัน ◂
export async function reopenMoveOutSummary(ctx: MoveOutCtx, input: { unitId: string; moveOutId: string; reason: string }, deps?: { now?: Date }): Promise<{ ok: true; rev: number; creditNoteDocId: string | null } | Fail> {
  try {
    if (!isRec(input)) return notFound();
    const g = await d12Gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const mo = await readMo(g, input.moveOutId);
    if (!mo) return notFound();
    if (CLOSED.includes(mo.status) || mo.status === "CANCELLED") return fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดเงินประกัน/ยกเลิกไปแล้ว — เปิดใบสรุปใหม่ไม่ได้");
    const ded = dedOf(mo.deductions);
    if (!ded.frozen) return fail("NOT_FROZEN", "ยังไม่ได้ส่งใบสรุป — แก้ผลตรวจห้องได้เลย");
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if ([...reason].length < 3) return fail("INVALID_INPUT", "ระบุเหตุผลที่เปิดใบสรุปใหม่ (อย่างน้อย 3 ตัวอักษร)");
    const now = nowOf(deps?.now);
    const rev = ded.rev;
    const root = (await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: mo.leaseId })).root;
    // จังหวะ 1
    const p1 = await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(root));
      if (root !== mo.leaseId) await advisoryLock(tx, leaseLockKey(mo.leaseId));
      const cur = await tx.dormMoveOut.findFirst({ where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, deductions: true } });
      if (!cur || CLOSED.includes(cur.status) || cur.status === "CANCELLED") throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดเงินประกัน/ยกเลิกไปแล้ว — เปิดใบสรุปใหม่ไม่ได้"));
      const raw = isRec(cur.deductions) ? cur.deductions : {};
      const d = dedOf(raw);
      if (!d.frozen || d.rev !== rev) return { moved: true as const, rev: d.rev, frozen: null };
      if (!d.reopening || d.reopening.rev !== rev)
        await tx.dormMoveOut.updateMany({ where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId }, data: { deductions: json({ ...raw, reopening: { rev, at: now.toISOString(), by: g.actorUserId, reason } }) } });
      return { moved: false as const, rev, frozen: d.frozen };
    });
    if (isFail(p1)) return p1;
    if (p1.moved || !p1.frozen) return { ok: true, rev: p1.rev, creditNoteDocId: null };
    const frozen = p1.frozen;
    let creditNoteDocId: string | null = null;
    if (frozen.invoiceDocId) {
      const uv = frozen.invLines.length && frozen.vat ? null : await unitVals(g.tenantId, g.unitId, mo.lease.roomId);
      const lines = frozen.invLines.length ? frozen.invLines : await docLinesFromDb(g.tenantId, frozen.invoiceDocId);
      const cn = await createExternalCreditNote({
        tenantId: g.tenantId,
        unitId: g.unitId,
        sourceDocId: frozen.invoiceDocId,
        refType: "DormMoveOutReopen",
        refId: `${mo.id}:${rev}`,
        reason: `เปิดใบสรุปย้ายออกใหม่: ${reason}`.slice(0, 300),
        lines,
        vat: frozen.vat ?? vatOf(uv ?? {}),
        issueDate: bkkYmd(now),
        createdById: g.actorUserId,
      });
      if (!cn.ok) return fail(cn.code, cn.reason); // reopening ค้าง ⇒ ปิดประกันไม่ได้จนเปิดใหม่สำเร็จ
      creditNoteDocId = cn.docId;
    }
    // จังหวะ 2
    const out = await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(root));
      if (root !== mo.leaseId) await advisoryLock(tx, leaseLockKey(mo.leaseId));
      const cur = await tx.dormMoveOut.findFirst({ where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, deductions: true } });
      if (!cur || CLOSED.includes(cur.status) || cur.status === "CANCELLED") throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้ปิดเงินประกัน/ยกเลิกไปแล้ว — เปิดใบสรุปใหม่ไม่ได้"));
      const raw = isRec(cur.deductions) ? cur.deductions : {};
      const d = dedOf(raw);
      if (!d.frozen || d.rev !== rev) return { rev: d.rev };
      const history = [...d.history, { rev, invoiceDocId: d.frozen.invoiceDocId, creditNoteDocId: creditNoteDocId ?? (d.frozen.invoiceDocId ? null : "NONE"), reason: d.reopening?.reason || reason, at: now.toISOString(), lines: d.frozen.invLines, vat: d.frozen.vat }];
      await tx.dormMoveOut.updateMany({ where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId }, data: { deductions: json({ ...raw, rev: rev + 1, frozen: null, reopening: null, history }), approvalId: null } });
      await tx.auditLog.create({
        data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.reopened", targetType: "DormMoveOut", targetId: mo.id, after: { rev, reason, creditNoteDocId, invoiceDocId: d.frozen.invoiceDocId } },
      });
      return { rev: rev + 1 };
    });
    if (isFail(out)) return out;
    if (frozen.approvalId) await cancelRequest({ tenantId: g.tenantId }, frozen.approvalId).catch(() => false);
    return { ok: true, rev: out.rev, creditNoteDocId };
  } catch (e) {
    await logD12("reopen", isRec(ctx) ? ctx.tenantId : null, e);
    return unavailable();
  }
}

// ───────────────────────── 3.7 ปิดเงินประกัน ─────────────────────────
type SettleOk = { ok: true; duplicate: boolean; status: "REFUNDED" | "SETTLED"; entryId: string | null; heldSatang: number; appliedSatang: number; refundSatang: number; tenantOwesSatang: number };
const settleResultOf = (s: Settle, duplicate: boolean): SettleOk => ({
  ok: true,
  duplicate,
  status: s.status,
  entryId: s.entryId,
  heldSatang: s.heldSatang,
  appliedSatang: s.appliedSatang,
  refundSatang: s.refundSatang,
  tenantOwesSatang: s.tenantOwesSatang,
});
/** ห้อง ⇒ ทำความสะอาด (หลัง commit · ครั้งเดียวต่อใบ · ไม่ทับห้องที่ทำความสะอาดแล้วหลังจากนั้น)
 *  SVC D.12 (Y16) ▸ ล้ม ⇒ จด hkAttempts/hkLastError ในใบ (งานตามเวลาข้ามแถวที่ล้มครบ HK_MAX ครั้ง — ไม่วนชนแถวเดิมทุกรอบ) ◂ */
const HK_MAX = 5;
/** SVC D.12 (Y26) ▸ เพดานครั้งของงานเติมใบค่าน้ำไฟย้ายห้อง */
const TU_MAX = 5;
const TRANSFER_UTILITY_FAILED = "dorm.lease.transfer_utility_failed";
async function markHousekeeping(tenantId: string, unitId: string, moveOutId: string, leaseId: string, roomId: string): Promise<boolean> {
  const cur = await tenantDb({ tenantId, unitId }).dormMoveOut.findFirst({ where: { id: moveOutId }, select: { inspection: true, status: true } });
  if (!cur || !CLOSED.includes(cur.status) || inspOf(cur.inspection).hkMarkedAt) return false;
  const root = (await leaseChainOf(null, { tenantId, unitId, leaseId })).root;
  const write = (patch: (raw: Record<string, unknown>) => Record<string, unknown> | null) =>
    d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(root));
      if (root !== leaseId) await advisoryLock(tx, leaseLockKey(leaseId));
      const row = await tx.dormMoveOut.findFirst({ where: { id: moveOutId, tenantId, unitId }, select: { inspection: true } });
      const raw = isRec(row?.inspection) ? row.inspection : {};
      const next = patch(raw);
      if (!next) return false;
      await tx.dormMoveOut.updateMany({ where: { id: moveOutId, tenantId, unitId }, data: { inspection: json(next) } });
      return true;
    });
  let err: string | null = null;
  try {
    const r = await setHkStatus({ tenantId }, { unitId, roomId, hkStatus: "DIRTY" });
    if (!r.ok) err = `${r.code}`.slice(0, 120);
  } catch (e) {
    err = (e instanceof Error ? e.message : String(e)).slice(0, 120);
  }
  if (err !== null) {
    const msg = err;
    await write((raw) => ({ ...raw, hkAttempts: (isInt(raw.hkAttempts) ? raw.hkAttempts : 0) + 1, hkLastError: msg })).catch(() => false);
    return false;
  }
  const out = await write((raw) => (typeof raw.hkMarkedAt === "string" ? null : { ...raw, hkMarkedAt: new Date().toISOString(), hkLastError: null }));
  return out === true;
}
/** คงค้างรวมของชุดเอกสาร (อ่านผ่าน tx) — ใช้เมื่อไม่มีประกัน (ไม่มี JV) */
async function outstandingInTx(tx: Tx, tenantId: string, docIds: string[]): Promise<number> {
  if (!docIds.length) return 0;
  const heads = await tx.$queryRaw<{ id: string; grandTotal: number; status: string }[]>`SELECT "id", "grandTotal", "status"::text AS "status" FROM "AccountDocument" WHERE "tenantId" = ${tenantId} AND "id" = ANY(${docIds}::text[])`;
  const pays = await tx.$queryRaw<{ documentId: string; s: bigint | number }[]>`SELECT "documentId", COALESCE(SUM("amount" + COALESCE("whtAmountSatang", 0)), 0) AS "s" FROM "AccountDocumentPayment" WHERE "tenantId" = ${tenantId} AND "documentId" = ANY(${docIds}::text[]) AND "voidedAt" IS NULL GROUP BY "documentId"`;
  const cns = await tx.$queryRaw<{ sourceDocId: string; s: bigint | number }[]>`SELECT "sourceDocId", COALESCE(SUM("grandTotal"), 0) AS "s" FROM "AccountDocument" WHERE "tenantId" = ${tenantId} AND "sourceDocId" = ANY(${docIds}::text[]) AND "docType"::text = 'CREDIT_NOTE' AND "status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT') GROUP BY "sourceDocId"`;
  let owes = 0;
  for (const h of heads) {
    if (["VOIDED", "CANCELLED", "DRAFT"].includes(h.status)) continue;
    owes += Math.max(0, Number(h.grandTotal) - Number(pays.find((p) => p.documentId === h.id)?.s ?? 0) - Number(cns.find((c) => c.sourceDocId === h.id)?.s ?? 0));
  }
  return owes;
}

/** SVC D.12 (Y21) ▸ ปิดแล้วแต่คำขออนุมัติของรุ่นนั้นยัง PENDING (ผู้ถือคีย์ปิดเอง) ⇒ ยกเลิกคำขอ + audit (ไม่ค้างในกล่องเจ้าของ) · หลัง commit · ซ้ำได้ ◂ */
async function closeStaleApproval(g: D12Gate, moveOutId: string, approvalId: string | null): Promise<boolean> {
  if (!approvalId) return false;
  if ((await approvalOf(g.tenantId, approvalId)).status !== "PENDING") return false;
  const ok = await cancelRequest({ tenantId: g.tenantId }, approvalId).catch(() => false);
  if (ok)
    await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).auditLog.create({
      data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.approval_closed", targetType: "DormMoveOut", targetId: moveOutId, after: { approvalId, reason: "SETTLED_BY_APPROVER" } },
    });
  return !!ok;
}
export async function settleMoveOut(
  ctx: MoveOutCtx,
  input: { unitId: string; moveOutId: string; refund?: { channel?: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId?: string | null }; date?: string },
  deps?: { now?: Date },
): Promise<SettleOk | Fail> {
  try {
    if (!isRec(input)) return notFound();
    const g = await d12Gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const mo = await readMo(g, input.moveOutId);
    if (!mo) return notFound();
    const now = nowOf(deps?.now);
    const ded = dedOf(mo.deductions);
    if (CLOSED.includes(mo.status) && ded.settle) {
      await markHousekeeping(g.tenantId, g.unitId, mo.id, mo.leaseId, mo.lease.roomId).catch(() => false);
      await closeStaleApproval(g, mo.id, ded.frozen?.approvalId ?? null).catch(() => false);
      return settleResultOf(ded.settle, true);
    }
    if (mo.status === "CANCELLED") return fail("NOT_EDITABLE", "ใบย้ายออกนี้ถูกยกเลิกแล้ว");
    if (!ded.frozen) return fail("NOT_FROZEN", "ยังไม่ได้ส่งใบสรุปให้ผู้เช่าดู — ส่งใบสรุปก่อนแล้วจึงปิดเงินประกัน");
    if (bkkYmd(now) < ymdOfDb(mo.moveOutDate)) return fail("NOT_MOVED_OUT", "ยังไม่ถึงวันย้ายออก — ปิดเงินประกันได้ตั้งแต่วันย้ายออก");
    const ch = input.refund?.channel;
    if (ch !== undefined && ch !== "CASH" && ch !== "TRANSFER" && ch !== "PROMPTPAY") return fail("INVALID_INPUT", "ช่องทางคืนเงินต้องเป็น เงินสด · โอน · พร้อมเพย์");
    const fin = input.refund?.financeAccountId;
    if (fin !== undefined && fin !== null && typeof fin !== "string") return fail("INVALID_INPUT", "บัญชีเงินไม่ถูกต้อง");
    const frozen = ded.frozen;
    const rev = ded.rev;
    if (ded.reopening) return REOPENING();
    // อนุมัติเกินวงเงิน (มติ 6 · R7) — อ่านสถานะคำขอสด
    //   SVC D.12 (Y6) ▸ คำขอถูกปฏิเสธ ⇒ DEDUCTION_REJECTED ทุกคน (รวมผู้ถือคีย์อนุมัติ · จด audit) — ต้องเปิดใบสรุปใหม่ ◂
    //   SVC D.12 (Y16) ▸ ผู้ถือคีย์ตรึงเอง (selfApprovedById) ⇒ ผู้ไม่มีคีย์ปิดได้ (ยอดหักถูกตรึงไว้ ไม่เกินที่อนุมัติ) ◂
    let selfApproved = false;
    if (frozen.needsApproval) {
      const st = frozen.approvalId ? (await approvalOf(g.tenantId, frozen.approvalId)).status : "NONE";
      if (st === "REJECTED") {
        await tenantDb({ tenantId: g.tenantId, unitId: g.unitId })
          .auditLog.create({
            data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.settle_rejected", targetType: "DormMoveOut", targetId: mo.id, after: { rev, approvalId: frozen.approvalId, approver: g.approve } },
          })
          .catch(() => undefined);
        return fail("DEDUCTION_REJECTED", "เจ้าของไม่อนุมัติการหักเงินประกันเกินวงเงิน — เปิดใบสรุปใหม่แล้วแก้รายการหัก");
      }
      if (g.approve) selfApproved = st !== "APPROVED";
      else if (!frozen.selfApprovedById && st !== "APPROVED") return fail("NEEDS_APPROVAL", "รออนุมัติหักเงินประกันเกินวงเงินจากเจ้าของ — ปิดได้หลังอนุมัติ");
    }
    // Y23 ▸ ใบลดหนี้ค่าห้องส่วนเกินของรุ่นนี้ต้องมีก่อนหัก (ออกหลังตรึงแล้วล้ม ⇒ ออกตอนนี้ · idempotent) ◂
    if (frozen.rentCredit) {
      const rc = await issueRentCredit(g, mo.id, mo.leaseId, mo.lease.roomId, now);
      if (isFail(rc)) return rc.code === "EXCEEDS_REMAINING" ? STALE() : rc;
    }
    const chain = await leaseChainOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: mo.leaseId });
    const key = `dorm.moveout:${mo.id}:settle:${rev}`;
    const docIds = [...(frozen.invoiceDocId ? [frozen.invoiceDocId] : []), ...frozen.docIds];
    const out = await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(chain.root));
      if (chain.root !== mo.leaseId) await advisoryLock(tx, leaseLockKey(mo.leaseId));
      for (const lid of [...chain.ids].sort()) await advisoryLock(tx, lateFeeLockKey(lid));
      const cur = await tx.dormMoveOut.findFirst({ where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, deductions: true } });
      if (!cur) throw new Abort(notFound());
      const raw = isRec(cur.deductions) ? cur.deductions : {};
      const d = dedOf(raw);
      if (CLOSED.includes(cur.status) && d.settle) return { dup: true as const, s: d.settle };
      if (cur.status !== "NOTICE" && cur.status !== "INSPECTED") throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้ถูกยกเลิกแล้ว"));
      if (!d.frozen) throw new Abort(fail("NOT_FROZEN", "ยังไม่ได้ส่งใบสรุปให้ผู้เช่าดู — ส่งใบสรุปก่อนแล้วจึงปิดเงินประกัน"));
      if (d.rev !== rev || d.frozen.hash !== frozen.hash) throw new Abort(STALE());
      if (d.reopening) throw new Abort(REOPENING()); // Y5 ▸ เปิดใบสรุปใหม่จังหวะ 1 แล้ว ⇒ ไม่ปิดด้วยใบที่กำลังถูกลดหนี้ ◂
      // แถว Tenant ก่อนอ่านลายนิ้วมือ — เอกสารบัญชีใหม่ของร้าน (ใบเพิ่มหนี้/รับชำระ) ต้องรอจน JV ปิด commit หรือเกิดก่อนแล้วเห็นใน STALE
      await tx.tenant.updateMany({ where: { id: g.tenantId }, data: { updatedAt: new Date() } });
      const bills = await tx.dormBill.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, leaseId: { in: chain.ids }, status: { not: "VOID" } }, select: { status: true, sentVia: true } });
      if (billPending(bills)) throw new Abort(BILL_PENDING());
      // SVC D.12 (Y10) ▸ ยอดถือสดของต้นสายอยู่ในลายนิ้วมือ + เทียบกับยอดที่ตรึง ◂
      const heldNow = await securityDepositHeldInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, leaseId: chain.root });
      const fresh = await chainSig(tx, g.tenantId, g.unitId, chain.ids, mo.id, mo.leaseId, heldNow);
      if (fresh !== frozen.hash || heldNow !== frozen.heldSatang) throw new Abort(STALE());
      if (frozen.invoiceDocId) {
        const cn = await tx.$queryRaw<{ n: bigint | number }[]>`SELECT count(*) AS "n" FROM "AccountDocument" WHERE "tenantId" = ${g.tenantId} AND "sourceDocId" = ${frozen.invoiceDocId} AND "docType"::text = 'CREDIT_NOTE' AND "status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT')`;
        if (Number(cn[0]?.n ?? 0) > 0) throw new Abort(STALE()); // ใบวันออกถูกลดหนี้แล้ว (เปิดใบสรุปใหม่พร้อมกัน)
      }
      if (frozen.rentCredit) {
        const rcn = await tx.$queryRaw<{ n: bigint | number }[]>`SELECT count(*) AS "n" FROM "AccountDocument" WHERE "tenantId" = ${g.tenantId} AND "refType" = ${RENT_CREDIT_REF} AND "refId" = ${frozen.rentCredit.refId} AND "docType"::text = 'CREDIT_NOTE' AND "status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT')`;
        if (Number(rcn[0]?.n ?? 0) === 0) throw new Abort(STALE());
      }
      const held = heldNow;
      let s: Settle;
      if (held > 0) {
        const r = await settleSecurityDepositInTx(tx, {
          tenantId: g.tenantId,
          unitId: g.unitId,
          leaseId: chain.root,
          idempotencyKey: key,
          date: now,
          applyToDocIds: docIds,
          refund: { channel: ch ?? "TRANSFER", financeAccountId: typeof fin === "string" && fin ? fin : null },
          note: `ปิดเงินประกันวันย้ายออก (ใบย้ายออก ${mo.id})`,
          createdById: g.actorUserId,
        });
        if (!r.ok) throw new Abort(fail(r.code, r.reason));
        s = { key, entryId: r.entryId, at: now.toISOString(), status: r.refundSatang > 0 ? "REFUNDED" : "SETTLED", heldSatang: r.heldSatang, appliedSatang: r.appliedSatang, refundSatang: r.refundSatang, tenantOwesSatang: r.tenantOwesSatang };
      } else {
        s = { key, entryId: null, at: now.toISOString(), status: "SETTLED", heldSatang: 0, appliedSatang: 0, refundSatang: 0, tenantOwesSatang: await outstandingInTx(tx, g.tenantId, docIds) };
      }
      const u = await tx.dormMoveOut.updateMany({
        where: { id: mo.id, tenantId: g.tenantId, unitId: g.unitId, status: { in: ["NOTICE", "INSPECTED"] } },
        data: { status: s.status, deductions: json({ ...raw, settle: s }), depositSatang: s.heldSatang, refundSatang: s.refundSatang, refundedAt: now, settlementDocumentId: s.entryId },
      });
      if (u.count !== 1) throw new Abort(fail("NOT_EDITABLE", "ใบย้ายออกนี้เปลี่ยนไปแล้ว — โหลดหน้าใหม่"));
      const lu = await tx.dormLease.updateMany({ where: { id: mo.leaseId, tenantId: g.tenantId, unitId: g.unitId, status: "NOTICE" }, data: { status: "ENDED", endReason: "MOVED_OUT", endedAt: now } });
      if (lu.count === 1) await emitLeaseEnded(tx, g.tenantId, g.unitId, mo.leaseId, mo.lease.roomId, "MOVED_OUT");
      await emitOutbox(tx, {
        tenantId: g.tenantId,
        unitId: g.unitId,
        type: EV_SETTLED,
        idempotencyKey: `${EV_SETTLED}:${mo.id}`,
        payload: { unitId: g.unitId, leaseId: mo.leaseId, moveOutId: mo.id, refundSatang: s.refundSatang, dueAt: (mo.refundDueAt ?? now).toISOString() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.settled", targetType: "DormMoveOut", targetId: mo.id,
          after: { rev, entryId: s.entryId, heldSatang: s.heldSatang, appliedSatang: s.appliedSatang, refundSatang: s.refundSatang, tenantOwesSatang: s.tenantOwesSatang, depositLeaseId: chain.root },
        },
      });
      if (selfApproved)
        await tx.auditLog.create({
          data: {
            tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.moveout.deduction_self_approved", targetType: "DormMoveOut", targetId: mo.id,
            after: { rev, stage: "settle", approverId: g.actorUserId, deductSatang: frozen.lines.filter((l) => l.code === "DAMAGE").reduce((a, l) => a + l.amountSatang, 0), actorRole: g.role },
          },
        });
      return { dup: false as const, s };
    });
    if (isFail(out)) return out;
    await markHousekeeping(g.tenantId, g.unitId, mo.id, mo.leaseId, mo.lease.roomId).catch((e) => logD12("settle.hk", g.tenantId, e));
    await closeStaleApproval(g, mo.id, frozen.approvalId).catch((e) => logD12("settle.approval", g.tenantId, e));
    return settleResultOf(out.s, out.dup);
  } catch (e) {
    await logD12("settle", isRec(ctx) ? ctx.tenantId : null, e);
    return unavailable();
  }
}

// ───────────────────────── 3.8 งานตามเวลา ─────────────────────────
type JobRes = { reminders: number; overdue: number; ended: number; hkFixed: number };
type JobMo = { id: string; tenantId: string; unitId: string; leaseId: string; status: string; moveOutDate: Date; refundDueAt: Date | null; refundSatang: number; roomId: string; inspection: Prisma.JsonValue };
type JobLease = { id: string; tenantId: string; unitId: string; roomId: string };
export async function runDormMoveOutJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }): Promise<JobRes> {
  const t0 = Date.now();
  const out: JobRes = { reminders: 0, overdue: 0, ended: 0, hkFixed: 0 };
  const budget = typeof opts?.budgetMs === "number" && opts.budgetMs > 0 ? opts.budgetMs : 120_000;
  const left = () => (opts?.signal?.aborted ? 0 : budget - (Date.now() - t0));
  const tid = isStr(opts?.tenantId) ? opts.tenantId : null;
  const at = nowOf(now);
  const today = bkkYmd(at);
  const raw = tenantDb({ tenantId: tid ?? "platform-global-read" });
  try {
    const tenants = tid
      ? [{ tenantId: tid }]
      : await raw.$queryRaw<{ tenantId: string }[]>`SELECT DISTINCT "tenantId" FROM "DormLease" WHERE "status" IN ('NOTICE', 'ACTIVE') OR "id" IN (SELECT "leaseId" FROM "DormMoveOut" WHERE "status" IN ('NOTICE', 'INSPECTED', 'SETTLED', 'REFUNDED')) ORDER BY "tenantId" ASC`;
    for (const t of tenants) {
      if (left() < 3_000) break;
      try {
        await jobsOfTenant(t.tenantId, at, today, left, out);
      } catch (e) {
        await logD12("jobs.tenant", t.tenantId, e);
      }
    }
  } catch (e) {
    await logD12("jobs", tid, e);
  }
  return out;
}
async function jobsOfTenant(tenantId: string, at: Date, today: string, left: () => number, out: JobRes): Promise<void> {
  const raw = tenantDb({ tenantId });
  const td = dbDate(today);
  // (1) สัญญาจบ: NOTICE ที่วันออกผ่านแล้ว ⇒ MOVED_OUT · ACTIVE ที่ต่อแล้วและเลยวันจบ ⇒ RENEWED
  const moved = await raw.$queryRaw<JobLease[]>`
    SELECT l."id", l."tenantId", l."unitId", l."roomId" FROM "DormLease" l JOIN "DormMoveOut" m ON m."leaseId" = l."id" AND m."tenantId" = l."tenantId"
    WHERE l."tenantId" = ${tenantId} AND l."status" = 'NOTICE' AND m."status" <> 'CANCELLED' AND m."moveOutDate" < ${td} ORDER BY l."id" ASC LIMIT 200`;
  for (const l of moved) {
    if (left() < 3_000) return;
    if (await endLease(l, "MOVED_OUT", "NOTICE", at)) out.ended++;
  }
  const renewed = await raw.$queryRaw<JobLease[]>`
    SELECT l."id", l."tenantId", l."unitId", l."roomId" FROM "DormLease" l
    WHERE l."tenantId" = ${tenantId} AND l."status" = 'ACTIVE' AND l."endDate" < ${td}
      AND EXISTS (SELECT 1 FROM "DormLease" n WHERE n."tenantId" = l."tenantId" AND n."previousLeaseId" = l."id" AND n."status" <> 'CANCELLED')
    ORDER BY l."id" ASC LIMIT 200`;
  for (const l of renewed) {
    if (left() < 3_000) return;
    if (await endLease(l, "RENEWED", "ACTIVE", at)) out.ended++;
  }
  // (2) เตือนคืนประกันวันละครั้ง (ถึงวันออกแล้ว) · เลยกำหนด ⇒ audit ครั้งเดียว
  const due = await raw.$queryRaw<JobMo[]>`
    SELECT m."id", m."tenantId", m."unitId", m."leaseId", m."status", m."moveOutDate", m."refundDueAt", m."refundSatang", l."roomId", m."inspection"
    FROM "DormMoveOut" m JOIN "DormLease" l ON l."id" = m."leaseId" AND l."tenantId" = m."tenantId"
    WHERE m."tenantId" = ${tenantId} AND m."status" IN ('NOTICE', 'INSPECTED') AND m."moveOutDate" <= ${td} ORDER BY m."moveOutDate" ASC, m."id" ASC LIMIT 200`;
  for (const m of due) {
    if (left() < 3_000) return;
    const r = await remindOne(m, at, today);
    if (r.reminded) out.reminders++;
    if (r.overdue) out.overdue++;
  }
  // (3) ปิดแล้วแต่ยังไม่ได้ตั้งห้องทำความสะอาด
  const hk = await raw.$queryRaw<JobMo[]>`
    SELECT m."id", m."tenantId", m."unitId", m."leaseId", m."status", m."moveOutDate", m."refundDueAt", m."refundSatang", l."roomId", m."inspection"
    FROM "DormMoveOut" m JOIN "DormLease" l ON l."id" = m."leaseId" AND l."tenantId" = m."tenantId"
    WHERE m."tenantId" = ${tenantId} AND m."status" IN ('SETTLED', 'REFUNDED') AND (m."inspection" IS NULL OR m."inspection"->>'hkMarkedAt' IS NULL)
      AND COALESCE(CASE WHEN jsonb_typeof(m."inspection"->'hkAttempts') = 'number' THEN (m."inspection"->>'hkAttempts')::int END, 0) < ${HK_MAX}
    ORDER BY m."id" ASC LIMIT 200`;
  for (const m of hk) {
    if (left() < 3_000) return;
    if (await markHousekeeping(m.tenantId, m.unitId, m.id, m.leaseId, m.roomId).catch(() => false)) out.hkFixed++;
  }
  // (5) SVC D.12 (Y22/Y23) ▸ ใบที่ยกเลิกแล้วแต่ยังมีใบวันออกกำพร้าที่ไม่ลดหนี้ หรือใบลดหนี้ค่าห้องที่ยังไม่กลับรายการ ⇒ ทำให้จบ (idempotent) ◂
  const cx = await raw.$queryRaw<{ id: string; unitId: string; leaseId: string; roomId: string }[]>`
    SELECT m."id", m."unitId", m."leaseId", l."roomId" FROM "DormMoveOut" m JOIN "DormLease" l ON l."id" = m."leaseId" AND l."tenantId" = m."tenantId"
    WHERE m."tenantId" = ${tenantId} AND m."status" = 'CANCELLED'
      AND (EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m."deductions"->'history') = 'array' THEN m."deductions"->'history' ELSE '[]'::jsonb END) h WHERE h->>'creditNoteDocId' IS NULL)
        OR EXISTS (SELECT 1 FROM "AccountDocument" d WHERE d."tenantId" = m."tenantId" AND d."refType" = ${RENT_CREDIT_REF} AND d."refId" LIKE m."id" || ':%' AND d."docType"::text = 'CREDIT_NOTE' AND d."status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT')
          AND NOT EXISTS (SELECT 1 FROM "AccountDocument" r WHERE r."tenantId" = d."tenantId" AND r."refType" = ${RENT_CREDIT_REVERSE} AND r."refId" = d."id" AND r."docType"::text = 'DEBIT_NOTE' AND r."status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT'))))
    ORDER BY m."id" ASC LIMIT 200`;
  for (const m of cx) {
    if (left() < 3_000) return;
    await cancelledCleanup({ tenantId, unitId: m.unitId, actorUserId: null }, m.id, m.leaseId, m.roomId, at).catch((e) => logD12("jobs.cancelled_cleanup", tenantId, e));
  }
  // (4) SVC D.12 (Y13) ▸ ใบค่าน้ำไฟห้องเดิมของการย้ายห้องที่ล้มหลัง commit (ย้อนหลัง 90 วัน · ไม่มีเครื่องหมายเสร็จ) — idempotent ต่อ ref ◂
  const since = new Date(at.getTime() - 90 * 86_400_000);
  const tr = await raw.$queryRaw<{ id: string; unitId: string }[]>`
    SELECT l."id", l."unitId" FROM "DormLease" l
    WHERE l."tenantId" = ${tenantId} AND l."status" = 'ENDED' AND l."endReason" = 'TRANSFER' AND l."endedAt" >= ${since}
      AND NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."tenantId" = l."tenantId" AND a."action" = ${TRANSFER_UTILITY_DONE} AND a."targetType" = 'DormLease' AND a."targetId" = l."id")
      AND (SELECT count(*) FROM "AuditLog" f WHERE f."tenantId" = l."tenantId" AND f."action" = ${TRANSFER_UTILITY_FAILED} AND f."targetType" = 'DormLease' AND f."targetId" = l."id") < ${TU_MAX}
    ORDER BY l."id" ASC LIMIT 200`;
  for (const l of tr) {
    if (left() < 3_000) return;
    try {
      await transferUtilityInvoice(tenantId, l.unitId, null, l.id, at);
    } catch (e) {
      // SVC D.12 (Y26) ▸ ล้ม ⇒ จดครั้ง + lastError (ครบ TU_MAX ครั้ง ⇒ หยุดเติมแถวนี้ · ให้คนดูจาก log) ◂
      await logD12("jobs.transfer_utility", tenantId, e);
      await raw.auditLog
        .create({ data: { tenantId, unitId: l.unitId, actorType: "SYSTEM", action: TRANSFER_UTILITY_FAILED, targetType: "DormLease", targetId: l.id, after: { lastError: (e instanceof Error ? e.message : String(e)).slice(0, 200), at: at.toISOString() } } })
        .catch(() => undefined);
    }
  }
}
async function endLease(l: JobLease, reason: "MOVED_OUT" | "RENEWED", from: "NOTICE" | "ACTIVE", at: Date): Promise<boolean> {
  const root = (await leaseChainOf(null, { tenantId: l.tenantId, unitId: l.unitId, leaseId: l.id })).root;
  const r = await d12Tx(async (tx) => {
    await advisoryLock(tx, leaseLockKey(root));
    if (root !== l.id) await advisoryLock(tx, leaseLockKey(l.id));
    const u = await tx.dormLease.updateMany({ where: { id: l.id, tenantId: l.tenantId, unitId: l.unitId, status: from }, data: { status: "ENDED", endReason: reason, endedAt: at } });
    if (u.count !== 1) return false;
    await emitLeaseEnded(tx, l.tenantId, l.unitId, l.id, l.roomId, reason);
    await tx.auditLog.create({ data: { tenantId: l.tenantId, unitId: l.unitId, actorType: "SYSTEM", action: "dorm.lease.ended", targetType: "DormLease", targetId: l.id, after: { reason, at: at.toISOString() } } });
    return true;
  });
  return r === true;
}
async function remindOne(m: JobMo, at: Date, today: string): Promise<{ reminded: boolean; overdue: boolean }> {
  const root = (await leaseChainOf(null, { tenantId: m.tenantId, unitId: m.unitId, leaseId: m.leaseId })).root;
  const dueAt = m.refundDueAt ?? dueAtOf(addDaysYmd(ymdOfDb(m.moveOutDate), 7));
  const dueYmd = dueYmdOf(dueAt);
  const key = `${EV_DUE}:${m.id}:${today}`;
  const r = await d12Tx(async (tx) => {
    await advisoryLock(tx, leaseLockKey(root));
    if (root !== m.leaseId) await advisoryLock(tx, leaseLockKey(m.leaseId));
    const cur = await tx.dormMoveOut.findFirst({ where: { id: m.id, tenantId: m.tenantId, unitId: m.unitId }, select: { status: true, refundSatang: true, deductions: true } });
    if (!cur || (cur.status !== "NOTICE" && cur.status !== "INSPECTED")) return { reminded: false, overdue: false };
    const fz = dedOf(cur.deductions).frozen; // SVC D.12 (Y16) ▸ ยอดคืนที่ตรึงในใบสรุป (ยังไม่ตรึง = คอลัมน์ ณ ตอนนี้) ◂
    const refundSatang = fz ? fz.refundSatang : cur.refundSatang;
    let reminded = false;
    if (!(await tx.outboxEvent.findFirst({ where: { tenantId: m.tenantId, idempotencyKey: key }, select: { id: true } }))) {
      await emitOutbox(tx, {
        tenantId: m.tenantId,
        unitId: m.unitId,
        type: EV_DUE,
        idempotencyKey: key,
        payload: { unitId: m.unitId, leaseId: m.leaseId, moveOutId: m.id, refundSatang, dueAt: dueAt.toISOString(), daysLeft: daysBetween(today, dueYmd) },
      });
      reminded = true;
    }
    let overdue = false;
    if (at.getTime() >= dueAt.getTime()) {
      const has = await tx.auditLog.findFirst({ where: { tenantId: m.tenantId, action: A_OVERDUE, targetType: "DormMoveOut", targetId: m.id }, select: { id: true } });
      if (!has) {
        await tx.auditLog.create({
          data: { tenantId: m.tenantId, unitId: m.unitId, actorType: "SYSTEM", action: A_OVERDUE, targetType: "DormMoveOut", targetId: m.id, after: { leaseId: m.leaseId, refundDueDate: dueYmd, at: at.toISOString() } },
        });
        overdue = true;
      }
    }
    return { reminded, overdue };
  });
  return isFail(r) ? { reminded: false, overdue: false } : r;
}
