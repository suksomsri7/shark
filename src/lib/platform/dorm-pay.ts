// ─────────────────────────────────────────────────────────────
// platform/dorm-pay.ts — ตรวจสลิป/รับเงินหอ · SVC D.10 · สัญญา ledger/svc-briefs/svc-brief-d.10.md §3
//
// ทำไมอยู่ชั้น platform: ใช้ หอ + บัญชี + สลิป + notifyCustomer + แชท พร้อมกัน (แบบ dorm-line.ts)
// 🔴 เงินผ่าน facade บัญชีเท่านั้น (recordExternalPayment · issueDormReceipt · voidDormReceiptDoc) — ไฟล์นี้ไม่เขียนตารางบัญชี · ไม่ import prisma ดิบ
// 🔴 หนึ่งบิลลงเงินได้ทีละทาง: claim แบบ CAS บนแถว DormBill (policySnapshot.dormPay · คำสั่ง SQL เดียว · หมดอายุเอง) ก่อนอ่านยอด/เรียก decideSlip/บัญชี
//    ⛔ ไม่ถือ tx/advisory lock ข้ามการเรียก facade (บทเรียน B.8 V4) · ไม่ได้ claim ⇒ ทางมือ BUSY · consumer throw (คิวลองใหม่)
// 🔴 แผนการลงเงินจดบนบิลก่อนลง (policySnapshot.dormPay.plans) · คีย์ต่อเอกสารกำหนดได้จาก (การรับ, เอกสาร) ⇒ ตายกลางทางแล้วลองใหม่ = ผลเดิม
//    ลบแผนเมื่อครบทุกขั้น (เงิน → ใบเสร็จ → บิล/event) ⇒ มีใบเสร็จแล้วแต่แผนยังอยู่ = งานค้าง ให้ทำต่อ
// 🔴 Z2/Z15 ได้ claim แล้วกวาดแผนค้างของสัญญาก่อนคิดยอด: แผนที่ยังไม่ขยับเงินสักขั้น ⇒ ทิ้ง (คิดใหม่สด) · ขยับแล้ว ⇒ ทำให้จบก่อน (ของใครก็ตาม)
//    ต่ออายุ claim (CAS ด้วย token) ก่อนเรียก facade ทุกครั้ง · เสีย claim ⇒ หยุดทันที (ทางมือ BUSY · consumer throw)
// 🔴 Z3 ผู้ดูแลที่ถูกจำกัดอาคาร (dormVisibleRoomsFor) เห็น/ทำได้เฉพาะบิลของห้องในขอบเขต — นอกขอบเขต = NOT_FOUND
// 🔴 สิทธิ์ = Membership สดทุกคำขอ · ไม่ผ่าน/ร้านอื่น/ของไม่มี ⇒ NOT_FOUND เนื้อเดียวทุกไบต์ (X1)
// 🔴 ยอดทุกที่ = billBalances (A11) · ยอดสลิปอ่านจากฐาน (V8) ไม่เชื่อ payload · ค่านโยบายจากทะเบียนค่าตั้ง (อ่านต่อคำขอ)
// 🔴 ผลคืน/event/log ไม่มีเบอร์ · ชื่อเต็ม · path/URL ไฟล์ (X8 · X10) · LINE ผ่าน notifyCustomer เท่านั้น
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { emitOutboxOutsideTx } from "@/lib/core/outbox";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettings } from "@/lib/core/settings";
import { dormDocsDead, dormPaymentKeysUsed, dormReceiptRows, dormUnitBookId, issueDormReceipt, recordExternalPayment, voidDormReceiptDoc, type DormReceiptRow } from "@/lib/modules/account";
import { fetchLineMessageContent } from "@/lib/modules/chat";
import {
  billBalances,
  billPaidSatang,
  dormStaffGate,
  dormVisibleRoomsFor,
  portalBaht,
  portalDateLabel,
  portalLiveLease,
  portalPartyName,
  portalPeriodLabel,
  type DormBillBalance,
} from "@/lib/modules/dorm";
import { decideSlip, submitSlip } from "@/lib/payment/slip-verify";
import { notifyCustomer } from "@/lib/platform/notify-customer";
import { portalUrl } from "@/lib/platform/dorm-portal";
import { deleteFileAsset, uploadFile } from "@/lib/storage/service";

// ═══════════════ สัญญา §3 ═══════════════
export const DORM_PAY_NF = "ไม่พบรายการนี้";
export type DormPayCtx = { tenantId: string; actorUserId: string };
export type DormPayFail = {
  ok: false;
  code: "NOT_FOUND" | "VALIDATION" | "ALREADY_DECIDED" | "ALREADY_PAID" | "BILL_VOID" | "NO_INVOICE" | "PARTIAL_DENIED" | "DUPLICATE" | "BUSY" | "IDEMPOTENCY_CONFLICT" | "ALREADY_VOID" | "CONTENT_GONE" | "FAILED";
  reason: string;
};
export type DormReviewAction = "APPROVE" | "PARTIAL_CARRY" | "ASK_MORE" | "REJECT";
export type DormReceiptView = {
  receiptId: string;
  docNo: string;
  billId: string;
  slipId: string | null;
  channel: "PROMPTPAY" | "TRANSFER" | "CASH";
  paidAt: string;
  amountSatang: number;
  allocations: { billId: string; docId: string; kind: "INVOICE" | "DEBIT_NOTE"; amountSatang: number }[];
  creditSatang: number;
  carriedSatang: number;
  status: "ISSUED" | "VOIDED";
};
export type DormSlipFlag = "PAYER_NAME" | "SHORT" | "OVER" | "DUPLICATE" | "AFTER_PAID" | "BILL_VOID" | "NO_INVOICE" | "OTHER";
export type DormReviewRow = {
  slipId: string;
  billId: string;
  roomNumber: string;
  tenantShort: string;
  periodKey: string;
  dueSatang: number;
  slipSatang: number | null;
  diffSatang: number;
  transferredAt: string | null;
  bankCode: string | null;
  status: "PENDING" | "NEEDS_REVIEW" | "HELD";
  flags: DormSlipFlag[];
  actions: (DormReviewAction | "CREDIT" | "REFUND_DUE")[];
};
export type DormPaymentsModel = {
  unitId: string;
  unitName: string;
  periodKey: string;
  periodLabel: string;
  can: { review: boolean; manual: boolean };
  kpi: {
    receivedSatang: number; receivedBills: number; autoApproved: number; reviewCount: number; reviewSatang: number; reviewRooms: string[];
    unpaidSatang: number; unpaidBills: number; overdueSatang: number; overdueRooms: string[];
  };
  review: DormReviewRow[];
  chat: { itemId: string; roomNumbers: string[]; receivedAt: string }[];
  recent: { billId: string; roomNumber: string; tenantShort: string; via: "SLIP" | "CASH" | "TRANSFER" | "OTHER"; at: string; amountSatang: number; docNo: string | null; receiptId: string | null }[];
  /** เพิ่มจากสัญญา (ไม่กระทบ KPI): บิลที่ยังมียอดค้าง — แท็บยังไม่จ่าย/ค้าง + ตัวเลือกบิลของฟอร์มรับเงินมือ */
  open: { billId: string; roomNumber: string; tenantShort: string; periodKey: string; dueSatang: number; overdue: boolean; inReview: boolean }[];
  links: { statementMatch: string | null };
};
type FileDeps = { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; del?: (path: string) => Promise<number> };

// ═══════════════ ตัวช่วย ═══════════════
const NF: DormPayFail = { ok: false, code: "NOT_FOUND", reason: DORM_PAY_NF };
const notFound = (): DormPayFail => ({ ...NF });
const fail = (code: DormPayFail["code"], reason: string): DormPayFail => ({ ok: false, code, reason });
const BUSY_REASON = "มีคนกำลังทำรายการเงินของบิลนี้อยู่ — รอสักครู่แล้วลองใหม่";
const R = {
  VOID: "บิลนี้ถูกยกเลิกแล้ว รับเงินไม่ได้",
  NO_INV: "บิลนี้ยังไม่มีใบแจ้งหนี้ในบัญชี รับเงินไม่ได้",
  PAID: "บิลนี้จ่ายครบแล้ว",
  DECIDED: "สลิปนี้ถูกตัดสินไปแล้ว",
  DENY: "หอนี้ตั้งไม่รับชำระบางส่วน",
  FAILED: "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  HELD_VOID: "อนุมัติแล้วแต่บิลถูกยกเลิก · พักไว้",
  CARRY_SHORT: "ยอดสลิปไม่พอจ่ายยอดยกมาจากบิลก่อน — เลือกขอให้โอนเพิ่มหรือไม่รับสลิปนี้",
  PARTIAL_RCPT: "สลิปนี้ออกใบเสร็จบางส่วนไปแล้ว — ส่วนที่เหลือบันทึกเป็นต้องโอนคืนผู้เช่า",
} as const;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_RE = /^[A-Za-z0-9_:-]{8,128}$/;
const MESSAGE_ID_RE = /^[0-9]{1,40}$/;
const INT_MAX = 2_147_483_647;
const posInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const VISIBLE = ["SENT", "PARTIALLY_PAID", "PAID"];
const APPROVED = ["APPROVED", "AUTO_APPROVED"];
const REVIEWABLE = ["PENDING", "NEEDS_REVIEW"];
/** อายุ claim: นานกว่างานเงินหนึ่งครั้ง (ลงเงิน + ใบเสร็จ + บิล) · โพรเซสตายแล้วคิวลองใหม่ได้เองหลังหมดอายุ — ค่าความปลอดภัย ไม่ใช่นโยบายร้าน */
// Z19 ▸ ≥ 2 × (maxWait 20 วิ + timeout 60 วิ ของธุรกรรมบัญชี) + เผื่อ — twice() ลองได้ 2 ครั้ง (ต่ออายุก่อนครั้งที่สองด้วย)
const CLAIM_MS = 260_000;
const REASON_MAX = 500;
const VOID_REASON_MIN = 5;

const ctxOk = (ctx: unknown): ctx is DormPayCtx => isRec(ctx) && isStr(ctx.tenantId) && isStr(ctx.actorUserId);
const shortName = (name: string | null | undefined): string => (name ?? "").trim().split(/\s+/)[0] ?? "";
const byNumber = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const errText = (e: unknown) => (e instanceof Error ? e.name : "error");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Z3 ▸ ห้องที่ผู้ใช้เห็นในหน่วย (null = ทั้งหน่วย) — Membership สดทุกคำขอ */
const roomScope = (ctx: DormPayCtx, unitId: string) => dormVisibleRoomsFor({ tenantId: ctx.tenantId }, { unitId, userId: ctx.actorUserId });
const inScope = (scope: Set<string> | null, roomId: string) => scope === null || scope.has(roomId);
/** ด่านสิทธิ์ + ขอบเขตอาคารของบิล — ไม่ผ่าน ⇒ null (ผู้เรียกคืน NOT_FOUND) */
async function billGate(ctx: DormPayCtx, unitId: string, key: "dorm.slip.review" | "dorm.payment.manual", roomId: string) {
  const g = await dormStaffGate(ctx, unitId, key);
  if (!g) return null;
  return inScope(await roomScope(ctx, unitId), roomId) ? g : null;
}

type BillRow = {
  id: string; unitId: string; leaseId: string; roomId: string; partyId: string; periodKey: string; status: string; accountDocumentId: string | null;
  carriedSatang: number; totalSatang: number; paidSatang: number; paidAt: Date | null; policySnapshot: Prisma.JsonValue | null;
};
type SlipRow = {
  id: string; unitId: string; domain: string; refType: string; refId: string; partyId: string | null; status: string; amountSatang: number | null; expectedSatang: number;
  transRef: string | null; transferredAt: Date | null; decidedAt: Date | null; checks: Prisma.JsonValue; createdAt: Date; reviewReason: string | null; bankCode: string | null;
};

async function readBill(tenantId: string, billId: string): Promise<BillRow | null> {
  if (!ID_RE.test(billId)) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<BillRow[]>`
    SELECT "id", "unitId", "leaseId", "roomId", "partyId", "periodKey", "status", "accountDocumentId", "carriedSatang", "totalSatang", "paidSatang", "paidAt", "policySnapshot"
    FROM "DormBill" WHERE "tenantId" = ${tenantId} AND "id" = ${billId} LIMIT 1`;
  return rows[0] ?? null;
}
async function readSlip(tenantId: string, slipId: string): Promise<SlipRow | null> {
  if (!isStr(slipId) || !ID_RE.test(slipId)) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<SlipRow[]>`
    SELECT "id", "unitId", "domain", "refType", "refId", "partyId", "status", "amountSatang", "expectedSatang", "transRef", "transferredAt", "decidedAt", "checks", "createdAt", "reviewReason", "bankCode"
    FROM "PaymentSlip" WHERE "tenantId" = ${tenantId} AND "id" = ${slipId} LIMIT 1`;
  const s = rows[0];
  return s && s.domain === "DORM" && s.refType === "DORM_BILL" ? s : null;
}
/** บิลที่รับเงินได้ §3.0 — คืนรหัสที่ผู้เรียกแปลงเอง */
const billState = (b: BillRow | null, unitId: string): "OK" | "NOT_FOUND" | "BILL_VOID" | "NO_INVOICE" => {
  if (!b || b.unitId !== unitId) return "NOT_FOUND";
  if (b.status === "VOID") return "BILL_VOID";
  if (!VISIBLE.includes(b.status)) return "NOT_FOUND";
  return b.accountDocumentId ? "OK" : "NO_INVOICE";
};
const stateFail = (s: "NOT_FOUND" | "BILL_VOID" | "NO_INVOICE"): DormPayFail => (s === "NOT_FOUND" ? notFound() : s === "BILL_VOID" ? fail("BILL_VOID", R.VOID) : fail("NO_INVOICE", R.NO_INV));
const planOf = (b: BillRow | null, recv: string): Plan | null => {
  const s = b && isRec(b.policySnapshot) ? b.policySnapshot.dormPay : null;
  const plans = isRec(s) && isRec(s.plans) ? s.plans : null;
  const p = plans?.[recv];
  return isRec(p) && p.recv === recv ? (p as unknown as Plan) : null;
};
async function settings(tenantId: string, unitId: string) {
  const s = await resolveSettings({ tenantId }, ["rooms.payment.partial", "rooms.payment.afterPaidSlip", "rooms.payment.notifyReceipt", "rooms.payment.chatSlipKeepDays"], { unitId });
  const keep = s["rooms.payment.chatSlipKeepDays"]?.value;
  return {
    partialAllowed: s["rooms.payment.partial"]?.value !== "DENY",
    afterPaid: s["rooms.payment.afterPaidSlip"]?.value === "CREDIT" ? ("CREDIT" as const) : ("REVIEW" as const),
    notifyReceipt: s["rooms.payment.notifyReceipt"]?.value === true,
    chatKeepDays: typeof keep === "number" && Number.isInteger(keep) && keep >= 1 ? keep : 1,
  };
}

// ═══════════════ claim ต่อบิล (§3.3) — CAS คำสั่งเดียวบนแถว ไม่ถือ tx ═══════════════
function newToken(): string {
  return createHash("sha256").update(`${process.pid}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 24);
}
async function claimOne(tenantId: string, billId: string, token: string): Promise<boolean> {
  const now = Date.now();
  const mark = JSON.stringify({ claim: token, claimUntil: now + CLAIM_MS });
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string }[]>`
    UPDATE "DormBill" SET "policySnapshot" = jsonb_set(
        CASE WHEN jsonb_typeof("policySnapshot") = 'object' THEN "policySnapshot" ELSE '{}'::jsonb END, '{dormPay}',
        COALESCE(CASE WHEN jsonb_typeof("policySnapshot") = 'object' THEN "policySnapshot"->'dormPay' END, '{}'::jsonb) || ${mark}::jsonb, true)
    WHERE "tenantId" = ${tenantId} AND "id" = ${billId}
      AND (COALESCE(("policySnapshot"#>>'{dormPay,claimUntil}')::bigint, 0) < ${now}::bigint OR "policySnapshot"#>>'{dormPay,claim}' = ${token})
    RETURNING "id"`;
  return rows.length === 1;
}
/** ต่ออายุ claim ที่ถืออยู่ (CAS ด้วย token เท่านั้น — ไม่ยึดคืนหลังมีคนอื่นถือ/ปล่อยไปแล้ว) */
async function renewOne(tenantId: string, billId: string, token: string): Promise<boolean> {
  const until = JSON.stringify(Date.now() + CLAIM_MS);
  const n = await tenantDb({ tenantId }).$executeRaw`
    UPDATE "DormBill" SET "policySnapshot" = jsonb_set("policySnapshot", '{dormPay,claimUntil}', ${until}::jsonb, true)
    WHERE "tenantId" = ${tenantId} AND "id" = ${billId} AND "policySnapshot"#>>'{dormPay,claim}' = ${token}`;
  return n === 1;
}
/** ทิ้งแผนของการรับหนึ่ง (เฉพาะผู้ถือ claim) */
async function dropPlan(tenantId: string, billId: string, token: string, recv: string): Promise<void> {
  await tenantDb({ tenantId }).$executeRaw`
    UPDATE "DormBill" SET "policySnapshot" = "policySnapshot" #- ${["dormPay", "plans", recv]}::text[]
    WHERE "tenantId" = ${tenantId} AND "id" = ${billId} AND "policySnapshot"#>>'{dormPay,claim}' = ${token}`;
}
async function releaseOne(tenantId: string, billId: string, token: string, drop: string | null): Promise<void> {
  const path = ["dormPay", "plans", drop ?? "~"];
  await tenantDb({ tenantId }).$executeRaw`
    UPDATE "DormBill" SET "policySnapshot" = (("policySnapshot" #- '{dormPay,claim}') #- '{dormPay,claimUntil}') #- ${path}::text[]
    WHERE "tenantId" = ${tenantId} AND "id" = ${billId} AND "policySnapshot"#>>'{dormPay,claim}' = ${token}`;
}
async function savePlan(tenantId: string, billId: string, token: string, plan: Plan): Promise<boolean> {
  const n = await tenantDb({ tenantId }).$executeRaw`
    UPDATE "DormBill" SET "policySnapshot" = jsonb_set(
        CASE WHEN jsonb_typeof("policySnapshot"#>'{dormPay,plans}') = 'object' THEN "policySnapshot" ELSE jsonb_set("policySnapshot", '{dormPay,plans}', '{}'::jsonb, true) END,
        ${["dormPay", "plans", plan.recv]}::text[], ${JSON.stringify(plan)}::jsonb, true)
    WHERE "tenantId" = ${tenantId} AND "id" = ${billId} AND "policySnapshot"#>>'{dormPay,claim}' = ${token}`;
  return n === 1;
}
/** ถือ claim บิลเป้าหมาย + บิลต้นทางของยอดยกมา (ลำดับงวด · ไม่รอ) — ได้ไม่ครบ ⇒ ปล่อยที่ได้แล้วคืน false */
class Hold {
  readonly token = newToken();
  private held: string[] = [];
  constructor(private tenantId: string) {}
  has(id: string): boolean {
    return this.held.includes(id);
  }
  /** Z2 ▸ ก่อนเรียก facade ทุกครั้ง: ต่ออายุทุกบิลที่ถือ · เสียใบใด ⇒ หยุด (Stop LOST) */
  async renew(): Promise<void> {
    for (const id of this.held) if (!(await renewOne(this.tenantId, id, this.token))) throw new Stop("LOST", BUSY_REASON);
  }
  async take(billIds: string[]): Promise<boolean> {
    for (const id of billIds) {
      if (this.held.includes(id)) continue;
      if (!(await claimOne(this.tenantId, id, this.token))) return false;
      this.held.push(id);
    }
    return true;
  }
  async release(planBill?: string | null, recv?: string | null): Promise<void> {
    for (const id of this.held) {
      try {
        await releaseOne(this.tenantId, id, this.token, id === planBill ? (recv ?? null) : null);
      } catch (e) {
        await logOps("WARN", "dorm.pay", "ปล่อย claim ของบิลไม่สำเร็จ — หมดอายุเอง", { tenantId: this.tenantId, detail: `bill=${id} ${errText(e)}` });
      }
    }
    this.held = [];
  }
}

// ═══════════════ แผนการลงเงิน (§3.2) ═══════════════
type PlanItem = { billId: string; docId: string; kind: "INVOICE" | "DEBIT_NOTE"; docNo: string | null; amountSatang: number };
type Channel = "PROMPTPAY" | "TRANSFER" | "CASH";
type Plan = {
  recv: string; targetBillId: string; invoiceDocId: string; amountSatang: number; items: PlanItem[]; creditSatang: number; channel: Channel; paidAt: string;
  slipId: string | null; carry: boolean; financeAccountId: string | null; note: string | null; actorId: string | null;
  /** เก็บเครดิตของสลิปที่พัก (resolveHeldSlip CREDIT) — ผู้มาทำแผนนี้ต่อต้องปิดการพักด้วย */
  heldCredit?: boolean;
  /** Z20 ▸ ทำต่อไม่ได้ด้วยรหัสที่ลองใหม่ไม่หาย (แผนขยับเงินแล้ว ⇒ ยังบล็อกบิลไว้) */
  lastError?: { code: string; reason: string; at: string; n: number };
};
const payKey = (recv: string, docId: string) => `${recv}:${docId}`;

/** กระจายตามลำดับ: ยกมา (งวดเก่า→ใหม่ · ใบแจ้งหนี้ก่อน) → ใบแจ้งหนี้เป้าหมาย → ใบเพิ่มหนี้ → เหลือ = 2110 */
function allocate(target: DormBillBalance, sources: Map<string, DormBillBalance>, amount: number): { items: PlanItem[]; credit: number } {
  const items: PlanItem[] = [];
  let left = amount;
  const take = (b: DormBillBalance, cap: number) => {
    let room = cap;
    const docs = [...(b.invoice ? [{ ...b.invoice, kind: "INVOICE" as const }] : []), ...b.debitNotes.map((d) => ({ ...d, kind: "DEBIT_NOTE" as const }))];
    for (const d of docs) {
      const n = Math.min(d.openSatang, room, left);
      if (n <= 0) continue;
      items.push({ billId: b.billId, docId: d.docId, kind: d.kind, docNo: d.docNo, amountSatang: n });
      left -= n;
      room -= n;
    }
  };
  for (const c of target.carriedIn) {
    const src = sources.get(c.billId);
    if (src) take(src, c.satang);
  }
  take(target, Number.MAX_SAFE_INTEGER);
  return { items, credit: left };
}

class Stop extends Error {
  constructor(public code: string, public reason: string) {
    super(code);
  }
}
/** Z9 ▸ เอกสารถัดไปรับเงินไม่ได้ (ยกเลิก) หลังลงเงินไปแล้วบางขั้น — ออกใบเสร็จตามยอดที่ลงจริงแล้ว ส่วนที่เหลือต้องพัก/แจ้ง (ไม่หายเงียบ) */
class PartialVoid extends Error {
  constructor(public receiptId: string, public movedSatang: number, public restSatang: number) {
    super("PARTIAL_VOID");
  }
}
/** Z20 ▸ แผนที่ขยับเงินแล้วแต่ทำต่อไม่ได้ (ไม่ใช่ BUSY/เสีย claim) — บิลยังถูกบล็อก · n = จำนวนครั้งที่ล้มติดกัน */
class Stuck extends Stop {
  constructor(reason: string, public n: number) {
    super("STUCK", reason);
  }
}
const RETRYABLE = new Set(["BUSY", "LOST"]);
/** consumer ล้มเพราะแผนค้างครบกี่ครั้งแล้วพักสลิป (เลิก throw ให้คิววนไม่จบ) — ค่าความปลอดภัย ไม่ใช่นโยบายร้าน */
// Z25 ▸ ต้องน้อยกว่า MAX_ATTEMPTS ของ outbox (5 · core/outbox.ts) — ไม่งั้นรอบส่งสุดท้ายตายก่อนได้พัก
const STUCK_MAX = 3;
/** Z25 ▸ จำนวนรอบส่งสูงสุดของ outbox (ค่าเดียวกับ core/outbox.ts MAX_ATTEMPTS — ไฟล์ core ห้ามแตะ จึงคัดลอกค่า) */
const OUTBOX_MAX_ATTEMPTS = 5;
const stuckText = (reason: string) =>
  `รายการรับเงินของบิลนี้ลงบัญชีไปแล้วบางส่วนแต่ทำต่อไม่ได้ (${reason}) — ระบบล็อกบิลไว้กันลงเงินซ้ำ ให้เจ้าของ/ผู้ดูแลบัญชีตรวจการเชื่อมสมุดบัญชีและเอกสารของบิลนี้ แล้วกดทำรายการอีกครั้ง`;
/** BUSY/deadlock ของบัญชี: ลองซ้ำครั้งเดียวด้วยคีย์เดิม (idempotent) แล้วค่อยยอมแพ้ */
async function twice<T extends { ok: boolean; code?: string }>(fn: () => Promise<T>, hold: Hold): Promise<T> {
  const a = await fn();
  if (a.ok || a.code !== "BUSY") return a;
  await hold.renew(); // Z19 ▸ ครั้งแรกอาจกินเวลาเกือบเต็ม claim — ต่ออายุ (CAS token) ก่อนลองซ้ำ · เสีย ⇒ Stop LOST ไม่เรียก facade ต่อ
  return fn();
}

const docLabel = (i: PlanItem) => `รับชำระ${i.kind === "INVOICE" ? "ใบแจ้งหนี้" : "ใบเพิ่มหนี้"} ${i.docNo ?? ""}`.trim();
type Alloc = { docId: string; amountSatang: number; labelTh: string; billId: string };
const planSteps = (plan: Plan): { item: PlanItem | null; pass: number }[] =>
  plan.items.length
    ? plan.items.map((item, i) => ({ item, pass: item.amountSatang + (i === plan.items.length - 1 ? plan.creditSatang : 0) }))
    : [{ item: null, pass: plan.amountSatang }];

/** ขั้นเงิน → ใบเสร็จ → บิล/event ตามแผน (ผู้เรียกถือ claim · ต่ออายุก่อนเรียก facade ทุกครั้ง) — ซ้ำได้ทุกขั้น */
async function settle(hold: Hold, tenantId: string, unitId: string, plan: Plan): Promise<string> {
  const paidAt = new Date(plan.paidAt);
  const allocations: Alloc[] = [];
  let moved = 0;
  for (const s of planSteps(plan)) {
    const docId = s.item?.docId ?? plan.invoiceDocId;
    await hold.renew();
    const r = await twice(() =>
      recordExternalPayment({
        tenantId, unitId, docId, amountSatang: s.pass, idempotencyKey: payKey(plan.recv, docId), paidAt, channel: plan.channel,
        financeAccountId: plan.financeAccountId, slipId: plan.slipId, note: plan.note, createdById: plan.actorId,
      }),
      hold,
    );
    if (!r.ok) {
      // Z9 ▸ ลงไปแล้วบางขั้น ⇒ ใบเสร็จตามยอดที่ลงจริง (ซ้ำได้ — ขั้นก่อนหน้าคืนผลเดิม) แล้วให้ผู้เรียกพัก/แจ้งส่วนที่เหลือ
      if (r.code === "NOT_PAYABLE" && moved > 0) {
        const rid = await issueReceipt(hold, tenantId, unitId, plan, allocations, moved, 0);
        throw new PartialVoid(rid, moved, plan.amountSatang - moved);
      }
      throw new Stop(r.code, r.reason);
    }
    moved += r.appliedSatang + r.excessSatang;
    // ไม่มีรายการในแผน (เก็บเครดิตทั้งก้อน) แต่ใบแจ้งหนี้กลับมีค้าง ณ ตอนลง ⇒ ส่วนที่ลงใบจริงต้องอยู่ในใบเสร็จด้วย (ยอดจริงจากบัญชี · V8)
    const item: PlanItem | null = s.item ?? (r.appliedSatang > 0 ? { billId: plan.targetBillId, docId, kind: "INVOICE", docNo: null, amountSatang: r.appliedSatang } : null);
    if (r.appliedSatang > 0 && item) allocations.push({ docId, amountSatang: r.appliedSatang, labelTh: docLabel(item), billId: item.billId });
  }
  // ยกยอด: ยอดค้างที่เหลือของบิลเป้าหมาย ณ หลังลงเงิน (ไม่ย้ายลูกหนี้ · ป้ายอย่างเดียว · R5)
  const fresh = await billBalances(tenantId, [plan.targetBillId]);
  const carried = plan.carry ? (fresh.get(plan.targetBillId)?.ownOutstandingSatang ?? 0) : 0;
  return issueReceipt(hold, tenantId, unitId, plan, allocations, plan.amountSatang, carried);
}
async function issueReceipt(hold: Hold, tenantId: string, unitId: string, plan: Plan, allocations: Alloc[], amount: number, carried: number): Promise<string> {
  await hold.renew();
  const rc = await twice(() =>
    issueDormReceipt({
      tenantId, unitId, refId: plan.recv, invoiceDocId: plan.invoiceDocId, amountSatang: amount, paidAt: new Date(plan.paidAt), channel: plan.channel, carriedSatang: carried,
      allocations: allocations.map(({ docId, amountSatang, labelTh }) => ({ docId, amountSatang, labelTh })), creditLabelTh: "เงินรับล่วงหน้า",
      note: carried > 0 ? `ยกยอด ${portalBaht(carried)} ไปบิลหน้า` : null, createdById: plan.actorId,
    }),
    hold,
  );
  if (!rc.ok) throw new Stop(rc.code, rc.reason);
  await syncBills(tenantId, unitId, plan, allocations, rc.docId, carried);
  return rc.docId;
}

/** DormBill ทุกใบที่ถูกแตะ + event ต่อ (บิล, ใบเสร็จ) — ยอดจากบัญชีสด · Z10 event เฉพาะเมื่อใบเสร็จยังมีผล */
async function syncBills(tenantId: string, unitId: string, plan: Plan, allocations: { billId: string; amountSatang: number }[], receiptId: string, carried: number): Promise<void> {
  const touched = [...new Set(allocations.map((a) => a.billId))];
  if (plan.carry && !touched.includes(plan.targetBillId)) touched.push(plan.targetBillId);
  if (!touched.length) return;
  const db = tenantDb({ tenantId, unitId });
  const rows = await db.dormBill.findMany({ where: { id: { in: touched } }, select: { id: true, leaseId: true, periodKey: true, accountDocumentId: true, paidSatang: true } });
  const bal = await billBalances(tenantId, touched);
  const paid = await billPaidSatang(tenantId, rows);
  const live = (await dormReceiptRows(tenantId, { ids: [receiptId] }))[0]?.status === "ISSUED";
  for (const b of rows) {
    const own = bal.get(b.id)?.ownOutstandingSatang ?? 0;
    const got = paid.get(b.id) ?? 0;
    const status = own === 0 ? "PAID" : got > 0 ? "PARTIALLY_PAID" : "SENT";
    await db.dormBill.updateMany({
      where: { id: b.id, status: { in: VISIBLE } },
      data: { paidSatang: got, status, paidAt: status === "PAID" ? new Date(plan.paidAt) : null, ...(plan.carry && live && b.id === plan.targetBillId ? { carriedSatang: carried } : {}) },
    });
    const amountSatang = allocations.filter((a) => a.billId === b.id).reduce((s, a) => s + a.amountSatang, 0);
    if (amountSatang <= 0 || !live) continue;
    const type = status === "PAID" ? "dorm.bill.paid" : "dorm.bill.partially_paid";
    await emitOutboxOutsideTx({
      tenantId, unitId, type, idempotencyKey: `${type}:${b.id}:${receiptId}`,
      payload: { unitId, billId: b.id, leaseId: b.leaseId, periodKey: b.periodKey, amountSatang, receiptId },
    });
  }
}

// ═══════════════ Z2/Z15 แผนค้าง — ใต้ claim: ยังไม่ขยับเงิน ⇒ ทิ้ง · ขยับแล้ว ⇒ ทำให้จบ ═══════════════
const plansIn = (snap: Prisma.JsonValue | null): Plan[] => {
  const s = isRec(snap) ? snap.dormPay : null;
  const plans = isRec(s) && isRec(s.plans) ? s.plans : null;
  return plans ? Object.entries(plans).filter(([k, p]) => isRec(p) && p.recv === k).map(([, p]) => p as unknown as Plan) : [];
};
/** แผนนี้ลงเงินไปแล้วอย่างน้อยหนึ่งขั้น (รับชำระ/JV ส่วนเกินของคีย์ใดในแผน) หรือออกใบเสร็จแล้ว */
async function planMoved(tenantId: string, plan: Plan): Promise<boolean> {
  const keys = planSteps(plan).map((s) => payKey(plan.recv, s.item?.docId ?? plan.invoiceDocId));
  if ((await dormPaymentKeysUsed(tenantId, keys)).size > 0) return true;
  return !!(await receiptByRef(tenantId, plan.recv));
}
type Settled = { unitId: string; view: DormReceiptView };
/** Z24 ▸ แผน "ใหม่" ที่คีย์ถูกใช้ลงเงินไปแล้ว = แผนเดิมของการรับนี้จบ/ค้างอยู่แล้ว — ห้ามบันทึก (จะชน IDEMPOTENCY_CONFLICT แล้วค้างตลอดกาล) */
async function freshPlanUsed(tenantId: string, plan: Plan): Promise<boolean> {
  return planMoved(tenantId, plan);
}
/**
 * กวาดแผนค้างทุกใบของสัญญาเดียวกัน (ผู้เรียกถือ claim บิลเป้าหมายแล้ว) — ถือ claim บิลของแผนเพิ่ม (ไม่รอ · ไม่ได้ ⇒ Stop BUSY)
 *   แผนของผู้เรียก (myRecv) ที่ขยับเงินแล้ว ⇒ คืนให้ทำต่อ · แผนอื่นที่ขยับแล้ว ⇒ ทำให้จบที่นี่ (ใบเสร็จส่ง LINE หลังปล่อย claim)
 */
async function reconcilePlans(hold: Hold, tenantId: string, leaseId: string, targetBillId: string, myRecv: string | null): Promise<{ mine: Plan | null; done: Settled[] }> {
  // แผนที่เกี่ยว = แตะบิลเป้าหมายหรือบิลต้นทางของยอดยกมา (แผนของบิลอื่นในสัญญาเดียวกันที่ไม่แตะกัน ไม่ต้องรอ)
  const focus = new Set([targetBillId, ...((await billBalances(tenantId, [targetBillId])).get(targetBillId)?.carriedIn.map((c) => c.billId) ?? [])]);
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; unitId: string; policySnapshot: Prisma.JsonValue | null }[]>`
    SELECT "id", "unitId", "policySnapshot" FROM "DormBill"
    WHERE "tenantId" = ${tenantId} AND "leaseId" = ${leaseId}
      AND jsonb_typeof("policySnapshot"#>'{dormPay,plans}') = 'object' AND "policySnapshot"#>'{dormPay,plans}' <> '{}'::jsonb
    ORDER BY "periodKey" ASC, "id" ASC`;
  let mine: Plan | null = null;
  const done: Settled[] = [];
  for (const r of rows) {
    for (const p0 of plansIn(r.policySnapshot)) {
      if (![r.id, p0.targetBillId, ...p0.items.map((i) => i.billId)].some((id) => focus.has(id))) continue;
      if (!(await hold.take([r.id, p0.targetBillId, ...p0.items.map((i) => i.billId)]))) throw new Stop("BUSY", BUSY_REASON);
      const p = planOf(await readBill(tenantId, r.id), p0.recv); // อ่านซ้ำใต้ claim — เจ้าของอาจทำจบ/ทิ้งไปแล้ว
      if (!p) continue;
      if (!(await planMoved(tenantId, p))) {
        await dropPlan(tenantId, r.id, hold.token, p.recv);
        continue;
      }
      if (p.recv === myRecv) {
        mine = p;
        continue;
      }
      const v = await finishPlan(hold, tenantId, r.unitId, r.id, p);
      if (v) done.push({ unitId: r.unitId, view: v });
    }
  }
  return { mine, done };
}
/**
 * Z20 ▸ settle + จดความล้มที่ลองใหม่ไม่หายบนแผน (lastError · ใต้ claim) + audit/แจ้งเจ้าของครั้งแรก (และทุก 10 ครั้ง) — แผนยังอยู่ (บิลยังถูกบล็อก)
 *   แผนที่ยังไม่ขยับเงิน ⇒ ไม่ใช่ค้าง (ผู้เรียกทิ้ง/คิดใหม่เอง) · BUSY/เสีย claim/เอกสารยกเลิก ⇒ โยนเดิม
 */
async function runPlan(hold: Hold, tenantId: string, unitId: string, hostBillId: string, plan: Plan): Promise<string> {
  try {
    const rid = await settle(hold, tenantId, unitId, plan);
    if (plan.slipId) await releaseStuckHold(tenantId, plan.slipId);
    return rid;
  } catch (e) {
    if (!(e instanceof Stop) || e instanceof Stuck || RETRYABLE.has(e.code) || e.code === "NOT_PAYABLE" || !(await planMoved(tenantId, plan))) throw e;
    // Z24 ▸ คีย์ชนเพราะการรับนี้จบไปแล้ว (มีใบเสร็จของ recv) ⇒ ถือว่าแผนเดิมจบแล้ว ไม่ใช่ค้าง
    if (e.code === "IDEMPOTENCY_CONFLICT") {
      const done = await receiptByRef(tenantId, plan.recv);
      if (done) {
        if (plan.slipId) await releaseStuckHold(tenantId, plan.slipId);
        return done.id;
      }
    }
    const cur = planOf(await readBill(tenantId, hostBillId), plan.recv) ?? plan;
    const n = (cur.lastError?.n ?? 0) + 1;
    const lastError = { code: e.code, reason: (e.reason || e.code).slice(0, 200), at: new Date().toISOString(), n };
    await savePlan(tenantId, hostBillId, hold.token, { ...cur, lastError });
    if (n === 1 || n % 10 === 0) {
      await tenantDb({ tenantId }).auditLog.create({
        data: { tenantId, unitId, actorType: "SYSTEM", actorId: "module:dorm", action: "dorm.pay.plan_stuck", targetType: "DormBill", targetId: plan.targetBillId, after: { billId: plan.targetBillId, recv: plan.recv, code: e.code, attempts: n } },
      });
      // ERROR = แจ้งเจ้าของร้าน (ทางเดียวกับ logOps เดิม) — ข้อความบอกว่าต้องจัดการอะไร
      await logOps("ERROR", "dorm.pay", stuckText(lastError.reason), { tenantId, detail: `bill=${plan.targetBillId} recv=${plan.recv} code=${e.code} n=${n}` });
    }
    throw new Stuck(stuckText(lastError.reason), n);
  }
}
/** ทำแผน (ที่ขยับเงินแล้ว) ให้จบ: เงินครบ ⇒ ใบเสร็จ/บิล · เอกสารถูกยกเลิกกลางทาง ⇒ ใบเสร็จตามจริง + พักส่วนที่เหลือของสลิป · ทิ้งแผน */
async function finishPlan(hold: Hold, tenantId: string, unitId: string, hostBillId: string, plan: Plan): Promise<DormReceiptView | null> {
  try {
    await runPlan(hold, tenantId, unitId, hostBillId, plan);
  } catch (e) {
    if (!(e instanceof PartialVoid)) throw e;
    const s = plan.slipId ? await readSlip(tenantId, plan.slipId) : null;
    if (s) await holdSlip(tenantId, s, await voidReason(tenantId, plan.targetBillId), e.restSatang);
    else await logOps("WARN", "dorm.pay", "รับเงินมือค้าง: เอกสารถูกยกเลิกระหว่างลงเงิน — ออกใบเสร็จตามยอดที่ลงแล้ว ส่วนที่เหลือต้องคืนผู้เช่า", { tenantId, detail: `receipt=${e.receiptId} rest=${e.restSatang}` });
  }
  if (plan.heldCredit && plan.slipId) await finishHeldCredit(tenantId, plan.slipId, plan.actorId);
  await dropPlan(tenantId, hostBillId, hold.token, plan.recv);
  return viewOfRef(tenantId, plan.recv);
}
/** SV-1 ▸ ใบแจ้งหนี้ของบิลถูกยกเลิกแล้ว (บิลอาจยังไม่ถูกพลิกเป็น VOID — ยกเลิกใบก่อนแล้วค่อยพลิกบิล) ⇒ ถือเป็นบิลยกเลิก ไม่ใช่ "จ่ายครบ" */
async function invoiceDead(tenantId: string, b: BillRow): Promise<boolean> {
  return !!b.accountDocumentId && (await dormDocsDead(tenantId, [b.accountDocumentId])).has(b.accountDocumentId);
}
/** เหตุพักเมื่อเอกสารรับเงินไม่ได้: บิลเป้าหมายถูกยกเลิก ⇒ BILL_VOID · อื่น (ใบเพิ่มหนี้/ยกมาถูกยกเลิก — บิลไม่ต้องรับเพิ่ม) ⇒ AFTER_PAID */
async function voidReason(tenantId: string, billId: string): Promise<HoldReason> {
  const b = await readBill(tenantId, billId);
  return !b || b.status === "VOID" || (await invoiceDead(tenantId, b)) ? "BILL_VOID" : !b.accountDocumentId ? "NO_INVOICE" : "AFTER_PAID";
}

// ═══════════════ มุมมองใบเสร็จ ═══════════════
const slipOfRef = (refId: string): string | null => (refId.startsWith("slip:") ? refId.slice(5) : null);
async function receiptViews(tenantId: string, rows: DormReceiptRow[]): Promise<DormReceiptView[]> {
  const invoiceOf = (a: { docId: string; docType: string; sourceDocId: string | null }) => (a.docType === "DEBIT_NOTE" ? (a.sourceDocId ?? "") : a.docId);
  const invoices = [...new Set(rows.flatMap((r) => [r.invoiceId, ...r.allocations.map(invoiceOf)]).filter(Boolean))];
  const bills = invoices.length
    ? await tenantDb({ tenantId }).$queryRaw<{ id: string; periodKey: string; accountDocumentId: string }[]>`
        SELECT "id", "periodKey", "accountDocumentId" FROM "DormBill" WHERE "tenantId" = ${tenantId} AND "accountDocumentId" = ANY(${invoices}::text[])`
    : [];
  const billOf = new Map(bills.map((b) => [b.accountDocumentId, b]));
  return rows.map((r) => {
    const sorted = [...r.allocations].sort((a, b) => {
      const pa = billOf.get(invoiceOf(a))?.periodKey ?? "", pb = billOf.get(invoiceOf(b))?.periodKey ?? "";
      if (pa !== pb) return pa < pb ? -1 : 1;
      if (a.docType !== b.docType) return a.docType === "INVOICE" ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const allocations = sorted.map((a) => ({ billId: billOf.get(invoiceOf(a))?.id ?? "", docId: a.docId, kind: a.docType === "DEBIT_NOTE" ? ("DEBIT_NOTE" as const) : ("INVOICE" as const), amountSatang: a.amountSatang }));
    return {
      receiptId: r.id,
      docNo: r.docNo,
      billId: billOf.get(r.invoiceId)?.id ?? "",
      slipId: slipOfRef(r.refId),
      channel: r.channel,
      paidAt: r.paidAt.toISOString(),
      amountSatang: r.amountSatang,
      allocations,
      creditSatang: r.amountSatang - allocations.reduce((s, a) => s + a.amountSatang, 0),
      carriedSatang: r.carriedSatang,
      status: r.status,
    };
  });
}
async function receiptByRef(tenantId: string, refId: string): Promise<DormReceiptRow | null> {
  return (await dormReceiptRows(tenantId, { refIds: [refId] }))[0] ?? null;
}
async function viewOfRef(tenantId: string, refId: string): Promise<DormReceiptView | null> {
  const r = await receiptByRef(tenantId, refId);
  return r ? ((await receiptViews(tenantId, [r]))[0] ?? null) : null;
}

// ═══════════════ LINE (§3.6) — ล้มไม่ทำให้งานเงินล้ม ═══════════════
async function leaseMsgVars(tenantId: string, leaseId: string, billId: string, now: Date) {
  const lease = await portalLiveLease(tenantId, leaseId, bkkYmd(now));
  if (!lease) return null;
  const tenantName = (await portalPartyName(tenantId, lease.partyId)) ?? "";
  return { lease, link: await portalUrl({ tenantId }, { leaseId, billId }, { now }), base: { tenantName, roomNo: lease.roomNumber, unitName: lease.unitName } };
}
async function sendReceipt(tenantId: string, unitId: string, view: DormReceiptView): Promise<void> {
  try {
    const s = await settings(tenantId, unitId);
    if (!s.notifyReceipt || !view.billId) return;
    const b = await readBill(tenantId, view.billId);
    if (!b) return;
    const now = new Date();
    const v = await leaseMsgVars(tenantId, b.leaseId, b.id, now);
    if (!v) return;
    await notifyCustomer(
      { tenantId },
      {
        unitId, domain: "rooms", messageKey: "receipt", partyId: v.lease.partyId, at: now, // Z12 ▸ เคารพช่วงงดส่ง (ไม่ bypassQuiet) ◂
        vars: { ...v.base, amount: portalBaht(view.amountSatang), paidDate: portalDateLabel(bkkYmd(new Date(view.paidAt))), receiptLink: v.link },
        dedupeKey: `rooms:receipt:${view.receiptId}`,
        precheck: async () => ((await dormReceiptRows(tenantId, { ids: [view.receiptId] }))[0]?.status === "ISSUED" ? { ok: true } : { ok: false, reason: "RECEIPT_VOIDED" }),
      },
    );
  } catch (e) {
    await logOps("WARN", "dorm.pay", "ส่งใบเสร็จทาง LINE ไม่สำเร็จ", { tenantId, detail: errText(e) });
  }
}
async function sendSlipMessage(tenantId: string, bill: BillRow, kind: "payMore" | "slipRejected", slipId: string, amount: number, reason: string | null): Promise<void> {
  try {
    const now = new Date();
    const v = await leaseMsgVars(tenantId, bill.leaseId, bill.id, now);
    if (!v) return;
    await notifyCustomer(
      { tenantId },
      {
        unitId: bill.unitId, domain: "rooms", messageKey: kind, partyId: v.lease.partyId, at: now,
        vars: { ...v.base, amount: portalBaht(amount), payLink: v.link, ...(reason === null ? {} : { reason }) },
        dedupeKey: `rooms:${kind === "payMore" ? "paymore" : "slipreject"}:${slipId}`,
      },
    );
  } catch (e) {
    await logOps("WARN", "dorm.pay", "ส่งข้อความสลิปทาง LINE ไม่สำเร็จ", { tenantId, detail: errText(e) });
  }
}

// ═══════════════ พักสลิป (§3.4) — marker ใน checks.dormHold (CAS คำสั่งเดียว · ครั้งเดียวต่อสลิป) ═══════════════
//   { open, reason, billId, at, rest? (Z9 ส่วนที่ยังไม่ลง) , resolution?, resolving? (Z5 CREDIT กำลังลงเงิน) }
type HoldReason = "AFTER_PAID" | "BILL_VOID" | "NO_INVOICE" | "PLAN_STUCK" | "RETRY_EXHAUSTED";
type HoldMark = { open: boolean; reason: string; billId: string; rest: number | null; resolution: string | null; resolving: boolean };
const holdOf = (s: SlipRow): HoldMark | null => {
  const h = isRec(s.checks) ? s.checks.dormHold : null;
  return isRec(h) && typeof h.reason === "string"
    ? {
        open: h.open === true, reason: h.reason, billId: typeof h.billId === "string" ? h.billId : "", rest: posInt(h.rest) ? h.rest : null,
        resolution: typeof h.resolution === "string" ? h.resolution : null, resolving: h.resolving === true,
      }
    : null;
};
/** แถวที่ยังต้องให้พนักงานจัดการ: พักอยู่ หรือเก็บเครดิตค้างกลางทาง */
const holdPending = (h: HoldMark | null) => !!h && (h.open || (h.resolving && h.resolution === "CREDIT"));
async function holdSlip(tenantId: string, slip: { id: string; unitId: string; refId: string }, reason: HoldReason, rest?: number): Promise<void> {
  const mark = JSON.stringify({ open: true, reason, billId: slip.refId, at: new Date().toISOString(), ...(rest && rest > 0 ? { rest } : {}) });
  const n = await tenantDb({ tenantId }).$executeRaw`
    UPDATE "PaymentSlip" SET "checks" = jsonb_set("checks", '{dormHold}', ${mark}::jsonb, true)
    WHERE "tenantId" = ${tenantId} AND "id" = ${slip.id} AND "checks"->'dormHold' IS NULL`;
  if (n !== 1) return;
  await tenantDb({ tenantId }).auditLog.create({
    data: { tenantId, unitId: slip.unitId, actorType: "SYSTEM", actorId: "module:dorm", action: "dorm.slip.held", targetType: "PaymentSlip", targetId: slip.id, after: { slipId: slip.id, billId: slip.refId, reason, ...(rest ? { restSatang: rest } : {}) } },
  });
  await logOps("WARN", "dorm.pay", "สลิปอนุมัติแล้วแต่ลงบิลไม่ได้ — พักให้พนักงานตัดสิน", { tenantId, detail: `slip=${slip.id} reason=${reason}` });
}
/** ปิดการพักแบบโอนคืน (ครั้งเดียว) — CAS open → ปิด · แพ้ (มีคนปิด/กำลังเก็บเครดิต) = false */
async function closeHold(tenantId: string, slip: SlipRow, resolution: "CREDIT" | "REFUND_DUE", actorId: string, reason: string): Promise<boolean> {
  const n = await tenantDb({ tenantId }).$executeRaw`
    UPDATE "PaymentSlip" SET "checks" = jsonb_set(jsonb_set("checks", '{dormHold,open}', 'false'::jsonb), '{dormHold,resolution}', ${JSON.stringify(resolution)}::jsonb, true)
    WHERE "tenantId" = ${tenantId} AND "id" = ${slip.id} AND "checks"#>>'{dormHold,open}' = 'true'`;
  if (n !== 1) return false;
  await tenantDb({ tenantId }).auditLog.create({
    data: { tenantId, unitId: slip.unitId, actorType: "USER", actorId, action: "dorm.slip.resolved", targetType: "PaymentSlip", targetId: slip.id, after: { slipId: slip.id, billId: slip.refId, resolution, reason } },
  });
  return true;
}
/** Z5 ▸ CREDIT จองก่อนลงเงิน: CAS open → resolving (แพ้ = REFUND_DUE/อีกคนชนะ ⇒ ไม่มีเงินเคลื่อน) */
async function beginHeldCredit(tenantId: string, slipId: string, reason: string): Promise<boolean> {
  const n = await tenantDb({ tenantId }).$executeRaw`
    UPDATE "PaymentSlip" SET "checks" = jsonb_set("checks", '{dormHold}', ("checks"->'dormHold') || ${JSON.stringify({ open: false, resolving: true, resolution: "CREDIT", note: reason })}::jsonb, true)
    WHERE "tenantId" = ${tenantId} AND "id" = ${slipId} AND "checks"#>>'{dormHold,open}' = 'true'`;
  return n === 1;
}
/** Z20 ▸ แผนค้างทำจบได้แล้ว (เงิน + ใบเสร็จครบ) ⇒ ปิดการพัก PLAN_STUCK ของสลิปเอง (ไม่ต้องให้พนักงานเลือกเก็บเครดิต/โอนคืน) */
async function releaseStuckHold(tenantId: string, slipId: string): Promise<void> {
  await tenantDb({ tenantId }).$executeRaw`
    UPDATE "PaymentSlip" SET "checks" = jsonb_set(jsonb_set(jsonb_set("checks", '{dormHold,open}', 'false'::jsonb), '{dormHold,resolving}', 'false'::jsonb, true), '{dormHold,resolution}', '"SETTLED"'::jsonb, true)
    WHERE "tenantId" = ${tenantId} AND "id" = ${slipId} AND "checks"#>>'{dormHold,reason}' IN ('PLAN_STUCK', 'RETRY_EXHAUSTED')
      AND ("checks"#>>'{dormHold,open}' = 'true' OR "checks"#>>'{dormHold,resolving}' = 'true')`;
}
/** ยังไม่มีเงินลง ⇒ คืนสถานะพัก (ให้เลือกใหม่ได้) */
async function abortHeldCredit(tenantId: string, slipId: string): Promise<void> {
  await tenantDb({ tenantId }).$executeRaw`
    UPDATE "PaymentSlip" SET "checks" = jsonb_set(("checks" #- '{dormHold,resolving}') #- '{dormHold,resolution}', '{dormHold,open}', 'true'::jsonb)
    WHERE "tenantId" = ${tenantId} AND "id" = ${slipId} AND "checks"#>>'{dormHold,resolving}' = 'true'`;
}
/** เงินลงครบแล้ว ⇒ ปิดการพัก (ครั้งเดียว · audit) */
async function finishHeldCredit(tenantId: string, slipId: string, actorId: string | null): Promise<void> {
  const rows = await tenantDb({ tenantId }).$queryRaw<{ unitId: string; refId: string; note: string | null }[]>`
    UPDATE "PaymentSlip" SET "checks" = jsonb_set("checks", '{dormHold,resolving}', 'false'::jsonb)
    WHERE "tenantId" = ${tenantId} AND "id" = ${slipId} AND "checks"#>>'{dormHold,resolving}' = 'true'
    RETURNING "unitId", "refId", "checks"#>>'{dormHold,note}' AS "note"`;
  const r = rows[0];
  if (!r) return;
  await tenantDb({ tenantId }).auditLog.create({
    data: { tenantId, unitId: r.unitId, actorType: actorId ? "USER" : "SYSTEM", actorId: actorId ?? "module:dorm", action: "dorm.slip.resolved", targetType: "PaymentSlip", targetId: slipId, after: { slipId, billId: r.refId, resolution: "CREDIT", reason: r.note ?? "" } },
  });
}
/** การตัดสินของพนักงาน (ยกยอดหรือไม่) จดบนสลิปก่อน decideSlip — consumer ที่มาทำต่อหลังแผนถูกทิ้ง (Z15) คิดแผนใหม่ด้วยเจตนาเดิม */
async function markIntent(tenantId: string, slipId: string, carry: boolean): Promise<void> {
  await tenantDb({ tenantId }).$executeRaw`
    UPDATE "PaymentSlip" SET "checks" = jsonb_set(CASE WHEN jsonb_typeof("checks") = 'object' THEN "checks" ELSE '{}'::jsonb END, '{dormCarry}', ${carry ? "true" : "false"}::jsonb, true)
    WHERE "tenantId" = ${tenantId} AND "id" = ${slipId} AND "status" IN ('PENDING', 'NEEDS_REVIEW')`;
}
const intendsCarry = (s: SlipRow) => isRec(s.checks) && s.checks.dormCarry === true;
function slipAmount(s: SlipRow): number {
  const decided = isRec(s.checks) && isRec(s.checks.decided) ? s.checks.decided.amountSatang : undefined;
  const v = [decided, s.amountSatang, s.expectedSatang].find(posInt);
  return typeof v === "number" ? v : 0;
}
const paidAtOf = (s: SlipRow, now: Date): string => {
  const t = s.transferredAt ?? s.decidedAt;
  return (t && t.getTime() < now.getTime() ? t : now).toISOString();
};
/** ถือบิลเป้าหมายแล้ว: ถือบิลต้นทางของยอดยกมาด้วย + อ่านยอดสดรวมบิลต้นทาง */
async function balancesUnder(hold: Hold, tenantId: string, billId: string): Promise<{ target: DormBillBalance; sources: Map<string, DormBillBalance> } | null> {
  const first = (await billBalances(tenantId, [billId])).get(billId);
  if (!first) throw new Stop("NOT_FOUND", DORM_PAY_NF);
  if (first.carriedIn.length && !(await hold.take(first.carriedIn.map((c) => c.billId)))) return null;
  const all = await billBalances(tenantId, [billId, ...first.carriedIn.map((c) => c.billId)]);
  const target = all.get(billId);
  if (!target) throw new Stop("NOT_FOUND", DORM_PAY_NF);
  return { target, sources: all };
}
const carriedInSum = (b: DormBillBalance) => b.carriedIn.reduce((a, c) => a + c.satang, 0);
async function sendAll(tenantId: string, done: Settled[]): Promise<void> {
  for (const d of done) await sendReceipt(tenantId, d.unitId, d.view);
}

// ═══════════════ §3.4 consumer ═══════════════
/** Z25 ▸ รอบนี้คือรอบส่งสุดท้ายของ event (ล้มแล้ว outbox จะเลิกส่ง) */
async function lastDelivery(tenantId: string, eventId: string): Promise<boolean> {
  try {
    const r = await tenantDb({ tenantId }).outboxEvent.findFirst({ where: { id: eventId, tenantId }, select: { attempts: true } });
    return !!r && r.attempts + 1 >= OUTBOX_MAX_ATTEMPTS;
  } catch {
    return false;
  }
}
/** Z17 ▸ แพ้ claim: รอสั้น ๆ (≤ 2 วิ) — ผู้ชนะออกใบเสร็จของสลิปนี้แล้ว/พักแล้ว ⇒ จบเงียบ */
async function settledElsewhere(tenantId: string, slipId: string, recv: string): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    await sleep(500);
    if (await receiptByRef(tenantId, recv)) return true;
    const s = await readSlip(tenantId, slipId);
    if (!s || holdOf(s)) return true;
  }
  return false;
}

export async function onDormSlipApproved(evt: { id?: string; tenantId: string; unitId?: string | null; type?: string; payload: unknown }): Promise<void> {
  if (!isRec(evt) || !isStr(evt.tenantId)) return;
  const p = isRec(evt.payload) ? evt.payload : null;
  if (!isStr(p?.slipId)) return;
  const tenantId = evt.tenantId;
  const slipId = p.slipId;
  const slip = await readSlip(tenantId, slipId);
  if (!slip || !APPROVED.includes(slip.status) || holdOf(slip)) return;
  const recv = `slip:${slip.id}`;
  const bill = await readBill(tenantId, slip.refId);
  const done = await receiptByRef(tenantId, recv);
  if (done && !planOf(bill, recv)) return; // หนึ่งสลิป = ใบเสร็จได้ครั้งเดียวตลอดกาล (รวมใบที่ยกเลิก · X4)
  const amount = slipAmount(slip);
  if (amount <= 0) {
    await logOps("WARN", "dorm.pay", "สลิปอนุมัติแต่ไม่มียอด — ไม่ลงเงิน", { tenantId, detail: `slip=${slip.id}` });
    return;
  }
  const state = billState(bill, slip.unitId);
  if (state === "NOT_FOUND" || !bill) {
    await logOps("WARN", "dorm.pay", "สลิปอนุมัติแล้วแต่ไม่พบบิลของหน่วย — ไม่ลงเงิน", { tenantId, detail: `slip=${slip.id}` });
    return;
  }
  if (state !== "OK" && !planOf(bill, recv)) {
    await holdSlip(tenantId, slip, state);
    return;
  }
  const hold = new Hold(tenantId);
  const sent: Settled[] = [];
  try {
    if (!(await hold.take([bill.id]))) {
      if (await settledElsewhere(tenantId, slip.id, recv)) return;
      throw new Error("[dorm.pay] บิลไม่ว่าง — คิวลองใหม่");
    }
    const s2 = await readSlip(tenantId, slip.id);
    const b2 = await readBill(tenantId, bill.id);
    if (!b2 || !s2 || holdOf(s2)) return;
    const rec = await reconcilePlans(hold, tenantId, b2.leaseId, bill.id, recv);
    sent.push(...rec.done);
    let plan = rec.mine;
    if (!plan) {
      if (await receiptByRef(tenantId, recv)) return;
      const st2 = billState(await readBill(tenantId, bill.id), slip.unitId);
      if (st2 !== "OK") {
        if (st2 !== "NOT_FOUND") await holdSlip(tenantId, s2, st2);
        return;
      }
      const u = await balancesUnder(hold, tenantId, bill.id);
      if (!u) throw new Error("[dorm.pay] บิลยกยอดไม่ว่าง — คิวลองใหม่");
      if (u.target.dueSatang === 0 && (await invoiceDead(tenantId, b2))) {
        await holdSlip(tenantId, s2, "BILL_VOID");
        return;
      }
      if (u.target.dueSatang === 0) {
        // Z2 ▸ แผนค้างของคนอื่นถูกทำจบก่อนแล้ว ⇒ สลิปนี้มาหลังจ่ายครบ (R6 · ไม่เข้า 2110 อัตโนมัติ)
        if ((await settings(tenantId, slip.unitId)).afterPaid === "REVIEW") {
          await holdSlip(tenantId, s2, "AFTER_PAID");
          return;
        }
        plan = makePlan(recv, b2, amount, { items: [], credit: amount }, "PROMPTPAY", paidAtOf(s2, new Date()), slip.id, false, null);
      } else {
        // Z23 ▸ คิดแผนใหม่หลังแผนเดิมถูกทิ้ง ⇒ ตรวจกฎ Z14 ซ้ำกับยอดสด (ยอดยกมาอาจโตขึ้น) — ไม่ผ่าน ⇒ รับเงินโดยไม่ยกยอด
        const carry = intendsCarry(s2) && amount >= carriedInSum(u.target);
        if (intendsCarry(s2) && !carry) await logOps("WARN", "dorm.pay", "ยกยอดตามที่ตัดสินไว้ไม่ได้แล้ว (ยอดสลิปไม่พอยอดยกมา) — รับเงินโดยไม่ยกยอด", { tenantId, detail: `slip=${slip.id}` });
        plan = makePlan(recv, b2, amount, allocate(u.target, u.sources, amount), "PROMPTPAY", paidAtOf(s2, new Date()), slip.id, carry, null);
      }
      if (await freshPlanUsed(tenantId, plan)) return; // Z24 ▸ การรับนี้ลงเงินไปแล้วด้วยแผนอื่น (จบ/ค้างอยู่ที่บิลอื่น) — ไม่สร้างแผนซ้อน
      if (!(await savePlan(tenantId, bill.id, hold.token, plan))) throw new Error("[dorm.pay] เสีย claim ระหว่างทาง — คิวลองใหม่");
    }
    try {
      await runPlan(hold, tenantId, slip.unitId, bill.id, plan);
    } catch (e) {
      if (e instanceof PartialVoid) {
        await holdSlip(tenantId, s2, await voidReason(tenantId, bill.id), e.restSatang);
      } else if (e instanceof Stop && e.code === "NOT_PAYABLE" && !(await planMoved(tenantId, plan))) {
        // ยังไม่มีเงินลง: บิลเป้าหมายถูกยกเลิก ⇒ พัก · อื่น (ใบยกมาถูกยกเลิก) ⇒ ทิ้งแผน ให้คิวคิดใหม่
        await dropPlan(tenantId, bill.id, hold.token, recv);
        const why = await voidReason(tenantId, bill.id);
        if (why === "AFTER_PAID") throw new Error("[dorm.pay] เอกสารเปลี่ยนระหว่างลงเงิน — คิวลองใหม่");
        await holdSlip(tenantId, s2, why);
        return;
      } else throw e;
    }
    await dropPlan(tenantId, bill.id, hold.token, recv);
    const view = await viewOfRef(tenantId, recv);
    if (view) sent.push({ unitId: slip.unitId, view });
  } catch (e) {
    // Z20 ▸ แผนค้าง (ของสลิปนี้หรือแผนอื่นที่บล็อกบิล) ล้มติดกันครบ STUCK_MAX ⇒ พักสลิป (PLAN_STUCK) แล้วจบ — ไม่ให้คิววนไม่จบ · บิลยังถูกบล็อกจนเจ้าของจัดการ
    if (e instanceof Stuck && e.n >= STUCK_MAX) {
      await holdSlip(tenantId, slip, "PLAN_STUCK");
      return;
    }
    // Z25 ▸ รอบส่งสุดท้ายของ outbox แล้วยังล้ม ⇒ พักสลิปให้พนักงานเห็น (ห้ามสลิปอนุมัติแล้วหายจากคิวเงียบ) — ยังไม่มีใบเสร็จเท่านั้น
    if (isStr(evt.id) && (await lastDelivery(tenantId, evt.id)) && !(await receiptByRef(tenantId, recv))) {
      await holdSlip(tenantId, slip, e instanceof Stuck ? "PLAN_STUCK" : "RETRY_EXHAUSTED");
      await logOps("ERROR", "dorm.pay", "สลิปอนุมัติแล้วแต่ลงเงินไม่สำเร็จจนครบรอบส่ง — พักไว้ในคิวรับเงินให้พนักงานจัดการ", { tenantId, detail: `slip=${slip.id} ${errText(e)}` });
      return;
    }
    if (e instanceof Stop) throw new Error(`[dorm.pay] ลงเงินไม่สำเร็จ ${e.code} — คิวลองใหม่`);
    throw e;
  } finally {
    await hold.release(null, null);
    await sendAll(tenantId, sent);
  }
}

function makePlan(recv: string, b: BillRow, amount: number, a: { items: PlanItem[]; credit: number }, channel: Channel, paidAt: string, slipId: string | null, carry: boolean, actorId: string | null, extra?: { financeAccountId?: string | null; note?: string | null; heldCredit?: boolean }): Plan {
  return {
    recv, targetBillId: b.id, invoiceDocId: b.accountDocumentId ?? "", amountSatang: amount, items: a.items, creditSatang: a.credit, channel, paidAt, slipId, carry,
    financeAccountId: extra?.financeAccountId ?? null, note: extra?.note ?? null, actorId, ...(extra?.heldCredit ? { heldCredit: true } : {}),
  };
}
function stopFail(e: unknown): DormPayFail {
  if (e instanceof Stop) {
    if (e.code === "BUSY" || e.code === "LOST") return fail("BUSY", BUSY_REASON);
    if (e instanceof Stuck) return fail("FAILED", e.reason); // Z20 ▸ ข้อความไทยบอกสิ่งที่ต้องจัดการ
    if (e.code === "NOT_PAYABLE") return fail("BILL_VOID", R.VOID);
    if (e.code === "NOT_FOUND") return notFound();
    return fail("FAILED", e.reason || R.FAILED);
  }
  return fail("FAILED", R.FAILED);
}
const validReason = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t && t.length <= REASON_MAX ? t : null;
};

// ═══════════════ §3.5 ตัดสินสลิป ═══════════════
const ACTIONS: DormReviewAction[] = ["APPROVE", "PARTIAL_CARRY", "ASK_MORE", "REJECT"];
function decideFail(r: { code: string; message: string }): DormPayFail {
  if (r.code === "DUPLICATE") return fail("DUPLICATE", "เลขอ้างอิงนี้ถูกใช้กับสลิปที่อนุมัติแล้ว");
  if (r.code === "VALIDATION") return fail("VALIDATION", r.message);
  if (r.code === "INVALID_STATE") return fail("ALREADY_DECIDED", R.DECIDED);
  if (r.code === "NOT_FOUND" || r.code === "PERMISSION_DENIED") return notFound();
  return fail("FAILED", R.FAILED);
}
export type DormReviewOk = { ok: true; slipId: string; status: "APPROVED" | "REJECTED"; receipt: DormReceiptView | null; held?: { reason: HoldReason; note: string } };

export async function reviewDormSlip(
  ctx: DormPayCtx,
  i: { slipId: string; action: DormReviewAction; reason: string; transRef?: string | null; amountSatang?: number | null },
): Promise<DormReviewOk | DormPayFail> {
  try {
    if (!ctxOk(ctx) || !isRec(i) || !isStr(i.slipId)) return notFound();
    const tenantId = ctx.tenantId;
    const slip = await readSlip(tenantId, i.slipId);
    if (!slip) return notFound();
    const bill = await readBill(tenantId, slip.refId);
    if (!(await billGate(ctx, slip.unitId, "dorm.slip.review", bill?.roomId ?? ""))) return notFound();
    const reason = validReason(i.reason);
    if (!reason) return fail("VALIDATION", `ใส่เหตุผล 1–${REASON_MAX} ตัวอักษร`);
    if (!ACTIONS.includes(i.action)) return fail("VALIDATION", "เลือกวิธีตัดสินสลิป");
    if (i.amountSatang !== undefined && i.amountSatang !== null && !(posInt(i.amountSatang) && i.amountSatang <= INT_MAX)) return fail("VALIDATION", "ยอดไม่ถูกต้อง");
    if (!REVIEWABLE.includes(slip.status)) return fail("ALREADY_DECIDED", R.DECIDED);
    const st = billState(bill, slip.unitId);
    if (st === "NOT_FOUND" || !bill) return notFound();
    const actor = { userId: ctx.actorUserId };
    // Z8 ▸ ปฏิเสธไม่ขยับเงิน ⇒ ไม่ต้องผ่านด่านสถานะบิล (สลิปของบิลที่ยกเลิก/ไม่มีใบแจ้งหนี้ปฏิเสธได้) · decideSlip เป็น CAS ตามสถานะสลิปเอง
    if (i.action === "REJECT" && st !== "OK") {
      const d = await decideSlip(actor, { tenantId }, slip.id, { decision: "REJECT", reason });
      if (!d.ok) return decideFail(d);
      await sendSlipMessage(tenantId, bill, "slipRejected", slip.id, slip.amountSatang ?? slip.expectedSatang, reason);
      return { ok: true, slipId: slip.id, status: "REJECTED", receipt: null };
    }
    if (st !== "OK") return stateFail(st);
    const hold = new Hold(tenantId);
    const recv = `slip:${slip.id}`;
    let keepPlan = false;
    let message: (() => Promise<void>) | null = null;
    let view: DormReceiptView | null = null;
    let held: DormReviewOk["held"];
    let status: "APPROVED" | "REJECTED" = "APPROVED";
    const sent: Settled[] = [];
    try {
      if (!(await hold.take([bill.id]))) return fail("BUSY", BUSY_REASON);
      const s2 = await readSlip(tenantId, slip.id);
      if (!s2 || !REVIEWABLE.includes(s2.status)) return fail("ALREADY_DECIDED", R.DECIDED);
      const b2 = await readBill(tenantId, bill.id);
      const st2 = billState(b2, slip.unitId);
      if (st2 !== "OK" || !b2) return stateFail(st2 === "OK" ? "NOT_FOUND" : st2);
      if (i.action === "REJECT") {
        await hold.renew();
        const d = await decideSlip(actor, { tenantId }, slip.id, { decision: "REJECT", reason });
        if (!d.ok) return decideFail(d);
        status = "REJECTED";
        message = () => sendSlipMessage(tenantId, b2, "slipRejected", slip.id, s2.amountSatang ?? s2.expectedSatang, reason);
      } else {
        // Z2/Z15 ▸ แผนค้างของสัญญานี้ก่อน (ขยับแล้ว ⇒ ทำให้จบ · ยังไม่ขยับ ⇒ ทิ้ง) แล้วค่อยอ่านยอดสด
        const rec = await reconcilePlans(hold, tenantId, b2.leaseId, bill.id, null);
        sent.push(...rec.done);
        const u = await balancesUnder(hold, tenantId, bill.id);
        if (!u) return fail("BUSY", BUSY_REASON);
        const due = u.target.dueSatang;
        if (due === 0) return (await invoiceDead(tenantId, b2)) ? fail("BILL_VOID", R.VOID) : fail("ALREADY_PAID", R.PAID);
        const partial = i.action !== "APPROVE";
        let amount: number;
        if (partial) {
          if (!(await settings(tenantId, slip.unitId)).partialAllowed) return fail("PARTIAL_DENIED", R.DENY);
          amount = s2.amountSatang ?? 0;
          if (!posInt(amount) || amount >= due) return fail("VALIDATION", "ยอดในสลิปต้องน้อยกว่ายอดที่ต้องชำระ");
          // Z14 ▸ ยกยอดได้เมื่อยอดสลิปครอบยอดยกมาแล้วเท่านั้น (ไม่งั้นยอดยกมาจะยกซ้อนอีกทอด)
          if (i.action === "PARTIAL_CARRY" && amount < carriedInSum(u.target)) return fail("VALIDATION", R.CARRY_SHORT);
        } else {
          amount = i.amountSatang ?? s2.amountSatang ?? s2.expectedSatang;
          if (amount < due) return fail("VALIDATION", "ยอดต่ำกว่าที่ต้องชำระ เลือกรับบางส่วน");
        }
        const carry = i.action === "PARTIAL_CARRY";
        const plan = makePlan(recv, b2, amount, allocate(u.target, u.sources, amount), "PROMPTPAY", paidAtOf(s2, new Date()), slip.id, carry, ctx.actorUserId);
        if (!(await savePlan(tenantId, bill.id, hold.token, plan))) return fail("BUSY", BUSY_REASON);
        await markIntent(tenantId, slip.id, carry);
        // ยอดคาดหวังของสลิปอาจเก่ากว่ายอดค้างสด (ใบลด/เพิ่มหนี้หลังยื่น) — decideSlip เทียบกับยอดคาดหวังของแถว จึงเลือกชนิดตามนั้น · ยอดที่ลงมาจากแผนเสมอ
        const decision = amount < s2.expectedSatang ? "APPROVE_PARTIAL" : "APPROVE";
        await hold.renew();
        const d = await decideSlip(actor, { tenantId }, slip.id, { decision, amountSatang: amount, reason, ...(i.transRef ? { transRef: i.transRef } : {}) });
        if (!d.ok) return decideFail(d);
        keepPlan = true; // สลิปอนุมัติแล้ว: ตายตรงนี้ consumer ต้องทำต่อจากแผนเดิม (รวมยกยอด)
        try {
          await runPlan(hold, tenantId, slip.unitId, bill.id, plan);
        } catch (e) {
          // Z16/Z9 ▸ อนุมัติแล้วแต่บิลถูกยกเลิกกลางทาง ⇒ พักสลิปทันทีในคำขอนี้ (ลงไปบางส่วน ⇒ ใบเสร็จตามจริง + พักส่วนที่เหลือ)
          const partialV = e instanceof PartialVoid ? e : null;
          if (!partialV && !(e instanceof Stop && e.code === "NOT_PAYABLE" && !(await planMoved(tenantId, plan)))) throw e;
          const why = await voidReason(tenantId, bill.id);
          if (!partialV && why === "AFTER_PAID") throw new Stop("BUSY", BUSY_REASON); // ใบยกมาถูกยกเลิก (บิลนี้ยังรับได้) — consumer คิดใหม่
          await holdSlip(tenantId, s2, why, partialV?.restSatang);
          held = { reason: why, note: why === "BILL_VOID" ? R.HELD_VOID : "อนุมัติแล้วแต่ลงบิลได้ไม่ครบ · พักส่วนที่เหลือไว้" };
        }
        await dropPlan(tenantId, bill.id, hold.token, recv);
        keepPlan = false;
        view = await viewOfRef(tenantId, recv);
        if (i.action === "ASK_MORE" && !held) {
          const left = (await billBalances(tenantId, [bill.id])).get(bill.id)?.dueSatang ?? 0;
          message = () => sendSlipMessage(tenantId, b2, "payMore", slip.id, left, null);
        }
      }
    } finally {
      await hold.release(bill.id, keepPlan ? null : recv);
    }
    await sendAll(tenantId, sent);
    if (view) await sendReceipt(tenantId, slip.unitId, view);
    if (message) await message();
    return { ok: true, slipId: slip.id, status, receipt: view, ...(held ? { held } : {}) };
  } catch (e) {
    await logOps("WARN", "dorm.pay", "ตัดสินสลิปไม่สำเร็จ", { tenantId: isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : undefined, detail: errText(e) });
    return stopFail(e);
  }
}

export async function resolveHeldSlip(ctx: DormPayCtx, i: { slipId: string; action: "CREDIT" | "REFUND_DUE"; reason: string }): Promise<{ ok: true; slipId: string; receipt: DormReceiptView | null } | DormPayFail> {
  try {
    if (!ctxOk(ctx) || !isRec(i) || !isStr(i.slipId)) return notFound();
    const tenantId = ctx.tenantId;
    const slip = await readSlip(tenantId, i.slipId);
    if (!slip) return notFound();
    const bill = await readBill(tenantId, slip.refId);
    if (!(await billGate(ctx, slip.unitId, "dorm.slip.review", bill?.roomId ?? ""))) return notFound();
    const h0 = holdOf(slip);
    if (!holdPending(h0)) return notFound();
    const reason = validReason(i.reason);
    if (!reason) return fail("VALIDATION", `ใส่เหตุผล 1–${REASON_MAX} ตัวอักษร`);
    if (i.action === "REFUND_DUE") {
      // Z27 ▸ กติกาเดียวกับจอ (refundAllowed): เงินของสลิปนี้ลงบัญชีไปแล้ว ⇒ ต้องทำให้จบด้วยการเก็บ ไม่ใช่โอนคืน
      if (h0?.open && bill && !(await refundAllowed(tenantId, h0, bill.id, slip.id)))
        return fail("VALIDATION", "เงินของสลิปนี้ลงบัญชีไปแล้วบางส่วน — ให้เจ้าของแก้สาเหตุแล้วเลือกเก็บเป็นเงินรับล่วงหน้าเพื่อทำให้จบ");
      if (h0?.open) return (await closeHold(tenantId, slip, "REFUND_DUE", ctx.actorUserId, reason)) ? { ok: true, slipId: slip.id, receipt: null } : notFound();
      return refundResolving(ctx, slip, bill, reason);
    }
    if (i.action !== "CREDIT") return fail("VALIDATION", "เลือกวิธีจัดการสลิปที่พัก");
    const recv = `slip:${slip.id}`;
    // Z24 ▸ การรับของสลิปนี้จบแล้ว (มีใบเสร็จ · ไม่มีแผนค้าง) ⇒ ปิดการพักแล้วจบ (ไม่ว่าพักเปิดหรือค้าง resolving) · ยกเว้นใบเสร็จบางส่วนของ Z9 (ส่วนที่เหลือต้องโอนคืน)
    const doneEarly = !planOf(bill, recv) ? await receiptByRef(tenantId, recv) : null;
    if (doneEarly) {
      if (h0?.rest) return fail("VALIDATION", R.PARTIAL_RCPT);
      return settledHold(ctx, slip, reason);
    }
    const st = billState(bill, slip.unitId);
    if (st !== "OK" || !bill) return stateFail(st === "OK" ? "NOT_FOUND" : st);
    const amount = h0?.rest ?? slipAmount(slip);
    if (amount <= 0) return fail("VALIDATION", "สลิปนี้ไม่มียอด");
    const hold = new Hold(tenantId);
    let view: DormReceiptView | null = null;
    let keepPlan = true;
    let begun = false;
    let plan: Plan | null = null;
    const sent: Settled[] = [];
    try {
      if (!(await hold.take([bill.id]))) return fail("BUSY", BUSY_REASON);
      const s2 = await readSlip(tenantId, slip.id);
      if (!s2 || !holdPending(holdOf(s2))) return notFound();
      const b2 = await readBill(tenantId, bill.id);
      const st2 = billState(b2, slip.unitId);
      if (st2 !== "OK" || !b2) return stateFail(st2 === "OK" ? "NOT_FOUND" : st2);
      // Z5 ▸ จองก่อนลงเงิน (open → resolving) · แพ้ = มีคนเลือกโอนคืน/เก็บเครดิตไปแล้ว ⇒ ไม่มีเงินเคลื่อน
      if (holdOf(s2)?.open) {
        if (!(await beginHeldCredit(tenantId, slip.id, reason))) return notFound();
        begun = true;
      }
      const rec = await reconcilePlans(hold, tenantId, b2.leaseId, bill.id, recv);
      sent.push(...rec.done);
      // Z24(3) ▸ ใต้ claim: แผนเดิมถูกทำจบไปแล้ว (มีใบเสร็จ) ⇒ ไม่สร้างแผนใหม่ · ปิดการพัก
      if (!rec.mine && (await receiptByRef(tenantId, recv))) {
        keepPlan = false;
        begun = false;
        plan = null;
        await releaseStuckHold(tenantId, slip.id);
        await finishHeldCredit(tenantId, slip.id, ctx.actorUserId);
        view = await viewOfRef(tenantId, recv);
      } else {
        if (!rec.mine) plan = await creditPlan(hold, tenantId, recv, b2, s2, amount, ctx.actorUserId);
        else plan = rec.mine;
        if (!rec.mine && (await freshPlanUsed(tenantId, plan))) throw new Stop("BUSY", BUSY_REASON); // Z24(4)
        if (!rec.mine && !(await savePlan(tenantId, bill.id, hold.token, plan))) throw new Stop("BUSY", BUSY_REASON);
        await runPlan(hold, tenantId, slip.unitId, bill.id, plan);
        await releaseStuckHold(tenantId, slip.id);
        await finishHeldCredit(tenantId, slip.id, ctx.actorUserId);
        await dropPlan(tenantId, bill.id, hold.token, recv);
        keepPlan = false;
        view = await viewOfRef(tenantId, recv);
      }
    } catch (e) {
      // ยังไม่มีเงินลง ⇒ คืนสถานะพัก (เลือกใหม่ได้) · มีเงินลงแล้ว ⇒ คงสถานะกำลังเก็บเครดิต (ลองซ้ำทำต่อจากแผนเดิม)
      if (begun || plan) {
        const moved = plan ? await planMoved(tenantId, plan).catch(() => true) : false;
        if (!moved) {
          if (plan) await dropPlan(tenantId, bill.id, hold.token, recv).catch(() => {});
          await abortHeldCredit(tenantId, slip.id).catch(() => {});
        }
      }
      throw e;
    } finally {
      await hold.release(bill.id, keepPlan ? null : recv);
      await sendAll(tenantId, sent);
    }
    if (view) await sendReceipt(tenantId, slip.unitId, view);
    return { ok: true, slipId: slip.id, receipt: view };
  } catch (e) {
    await logOps("WARN", "dorm.pay", "จัดการสลิปที่พักไม่สำเร็จ", { tenantId: isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : undefined, detail: errText(e) });
    return stopFail(e);
  }
}

/**
 * แผนของ "เก็บเครดิต" — พักเพราะลงเงินไม่ได้ชั่วคราว (PLAN_STUCK · RETRY_EXHAUSTED) ⇒ ลงเงินตามปกติ (ยกมา → ใบแจ้งหนี้ → ส่วนเกิน 2110)
 *   พักเพราะจ่ายครบ/อื่น ⇒ ทั้งก้อนเป็นเงินรับล่วงหน้า (เดิม)
 */
async function creditPlan(hold: Hold, tenantId: string, recv: string, b: BillRow, s: SlipRow, amount: number, actorId: string): Promise<Plan> {
  const h = holdOf(s);
  if (h && (h.reason === "PLAN_STUCK" || h.reason === "RETRY_EXHAUSTED")) {
    const u = await balancesUnder(hold, tenantId, b.id);
    if (!u) throw new Stop("BUSY", BUSY_REASON);
    if (u.target.dueSatang > 0) {
      const carry = intendsCarry(s) && amount >= carriedInSum(u.target);
      return makePlan(recv, b, amount, allocate(u.target, u.sources, amount), "PROMPTPAY", paidAtOf(s, new Date()), s.id, carry, actorId, { heldCredit: true });
    }
  }
  return makePlan(recv, b, amount, { items: [], credit: amount }, "PROMPTPAY", paidAtOf(s, new Date()), s.id, false, actorId, { heldCredit: true });
}
/** Z27 ▸ เลือกโอนคืนได้ไหม — กติกาเดียวกับ resolveHeldSlip: ไม่มีใบเสร็จของสลิป และแผนของสลิป (ถ้ามี) ยังไม่ขยับเงิน · resolving ต้องเป็นของ CREDIT */
async function refundAllowed(tenantId: string, h: HoldMark | null, billId: string, slipId: string): Promise<boolean> {
  if (!h || (!h.open && !(h.resolving && h.resolution === "CREDIT"))) return false;
  const recv = `slip:${slipId}`;
  if (await receiptByRef(tenantId, recv)) return h.open && !!h.rest; // Z9 ใบเสร็จบางส่วน ⇒ ส่วนที่เหลือโอนคืนได้
  const plan = planOf(await readBill(tenantId, billId), recv);
  return !plan || !(await planMoved(tenantId, plan));
}
/** Z24 ▸ ปิดการพักของสลิปที่การรับจบแล้ว (CAS · ครั้งเดียว · audit) แล้วคืนใบเสร็จเดิม */
async function settledHold(ctx: DormPayCtx, slip: SlipRow, reason: string): Promise<{ ok: true; slipId: string; receipt: DormReceiptView | null } | DormPayFail> {
  const tenantId = ctx.tenantId;
  const n = await tenantDb({ tenantId }).$executeRaw`
    UPDATE "PaymentSlip" SET "checks" = jsonb_set(jsonb_set(jsonb_set("checks", '{dormHold,open}', 'false'::jsonb), '{dormHold,resolving}', 'false'::jsonb, true), '{dormHold,resolution}', '"SETTLED"'::jsonb, true)
    WHERE "tenantId" = ${tenantId} AND "id" = ${slip.id} AND ("checks"#>>'{dormHold,open}' = 'true' OR "checks"#>>'{dormHold,resolving}' = 'true')`;
  if (n !== 1) return notFound();
  await tenantDb({ tenantId }).auditLog.create({
    data: { tenantId, unitId: slip.unitId, actorType: "USER", actorId: ctx.actorUserId, action: "dorm.slip.resolved", targetType: "PaymentSlip", targetId: slip.id, after: { slipId: slip.id, billId: slip.refId, resolution: "SETTLED", reason } },
  });
  return { ok: true, slipId: slip.id, receipt: await viewOfRef(tenantId, `slip:${slip.id}`) };
}
/**
 * Z23 ▸ สลิปค้างกลางทางเก็บเครดิต (resolving) แต่ยังไม่มีเงินลง (ไม่มีแผน/แผนยังไม่ขยับ · ไม่มีใบเสร็จ) ⇒ เลือกโอนคืนได้
 *   ใต้ claim บิล (กัน CREDIT ที่กำลังลงเงินอยู่) · มีเงินลงแล้ว ⇒ ต้องเก็บเครดิตต่อให้จบ
 */
async function refundResolving(ctx: DormPayCtx, slip: SlipRow, bill: BillRow | null, reason: string): Promise<{ ok: true; slipId: string; receipt: null } | DormPayFail> {
  const tenantId = ctx.tenantId;
  const recv = `slip:${slip.id}`;
  const hold = new Hold(tenantId);
  try {
    if (bill && !(await hold.take([bill.id]))) return fail("BUSY", BUSY_REASON);
    const s2 = await readSlip(tenantId, slip.id);
    const h = s2 ? holdOf(s2) : null;
    if (!s2 || !h || !h.resolving || h.resolution !== "CREDIT") return notFound();
    const plan = bill ? planOf(await readBill(tenantId, bill.id), recv) : null;
    if ((plan && (await planMoved(tenantId, plan))) || (await receiptByRef(tenantId, recv)))
      return fail("VALIDATION", "สลิปนี้เริ่มลงเป็นเงินรับล่วงหน้าแล้ว — เลือกเก็บเป็นเงินรับล่วงหน้าเพื่อทำให้จบ");
    if (plan && bill) await dropPlan(tenantId, bill.id, hold.token, recv);
    const n = await tenantDb({ tenantId }).$executeRaw`
      UPDATE "PaymentSlip" SET "checks" = jsonb_set(jsonb_set("checks", '{dormHold,resolving}', 'false'::jsonb), '{dormHold,resolution}', '"REFUND_DUE"'::jsonb, true)
      WHERE "tenantId" = ${tenantId} AND "id" = ${slip.id} AND "checks"#>>'{dormHold,resolving}' = 'true'`;
    if (n !== 1) return notFound();
    await tenantDb({ tenantId }).auditLog.create({
      data: { tenantId, unitId: slip.unitId, actorType: "USER", actorId: ctx.actorUserId, action: "dorm.slip.resolved", targetType: "PaymentSlip", targetId: slip.id, after: { slipId: slip.id, billId: slip.refId, resolution: "REFUND_DUE", reason } },
    });
    return { ok: true, slipId: slip.id, receipt: null };
  } finally {
    await hold.release(null, null);
  }
}

// ═══════════════ §3.6 รับเงินมือ · ยกเลิกใบเสร็จ ═══════════════
export async function recordDormPayment(
  ctx: DormPayCtx,
  i: { unitId: string; billId: string; amountSatang: number; channel: "CASH" | "TRANSFER"; idempotencyKey: string; paidAt?: string | null; financeAccountId?: string | null; note?: string | null },
): Promise<{ ok: true; duplicate: boolean; receipt: DormReceiptView } | DormPayFail> {
  try {
    if (!ctxOk(ctx) || !isRec(i) || !isStr(i.unitId) || !isStr(i.billId)) return notFound();
    const tenantId = ctx.tenantId;
    if (!(await dormStaffGate(ctx, i.unitId, "dorm.payment.manual"))) return notFound();
    const bill = await readBill(tenantId, i.billId);
    if (bill && !inScope(await roomScope(ctx, i.unitId), bill.roomId)) return notFound();
    if (!posInt(i.amountSatang) || i.amountSatang > INT_MAX) return fail("VALIDATION", "ยอดเงินต้องเป็นจำนวนเต็มสตางค์ที่มากกว่า 0");
    if (typeof i.idempotencyKey !== "string" || !KEY_RE.test(i.idempotencyKey)) return fail("VALIDATION", "คีย์กันซ้ำไม่ถูกต้อง");
    if (i.channel !== "CASH" && i.channel !== "TRANSFER") return fail("VALIDATION", "ช่องทางต้องเป็นเงินสดหรือโอน");
    const paidAt = i.paidAt ? new Date(i.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) return fail("VALIDATION", "วันเวลารับเงินไม่ถูกต้อง");
    const note = typeof i.note === "string" && i.note.trim() ? i.note.trim().slice(0, REASON_MAX) : null;
    const st = billState(bill, i.unitId);
    if (st !== "OK" || !bill) return stateFail(st === "OK" ? "NOT_FOUND" : st);
    const recv = `manual:${i.idempotencyKey}`;
    const sameAs = (r: DormReceiptRow) => r.invoiceId === bill.accountDocumentId && r.amountSatang === i.amountSatang && r.channel === i.channel;
    const prior = async (): Promise<{ ok: true; duplicate: boolean; receipt: DormReceiptView } | DormPayFail | null> => {
      const r = await receiptByRef(tenantId, recv);
      if (!r) return null;
      if (!sameAs(r)) return fail("IDEMPOTENCY_CONFLICT", "คีย์นี้ใช้กับการรับเงินรายการอื่นแล้ว");
      const [view] = await receiptViews(tenantId, [r]);
      return view ? { ok: true, duplicate: true, receipt: view } : fail("FAILED", R.FAILED);
    };
    const first = await prior();
    if (first && !planOf(bill, recv)) return first;
    const hold = new Hold(tenantId);
    let keepPlan = false;
    let view: DormReceiptView | null = null;
    let partial: PartialVoid | null = null;
    const sent: Settled[] = [];
    try {
      if (!(await hold.take([bill.id]))) return fail("BUSY", BUSY_REASON);
      const b2 = await readBill(tenantId, bill.id);
      if (!b2) return notFound();
      const rec = await reconcilePlans(hold, tenantId, b2.leaseId, bill.id, recv);
      sent.push(...rec.done);
      const again = await prior();
      if (again && !rec.mine) return again;
      const st2 = billState(await readBill(tenantId, bill.id), i.unitId);
      if (st2 !== "OK" && !rec.mine) return stateFail(st2);
      let plan = rec.mine;
      if (plan && (plan.amountSatang !== i.amountSatang || plan.channel !== i.channel)) return fail("IDEMPOTENCY_CONFLICT", "คีย์นี้ใช้กับการรับเงินรายการอื่นแล้ว");
      if (!plan) {
        const u = await balancesUnder(hold, tenantId, bill.id);
        if (!u) return fail("BUSY", BUSY_REASON);
        const due = u.target.dueSatang;
        if (due === 0) return (await invoiceDead(tenantId, b2)) ? fail("BILL_VOID", R.VOID) : fail("ALREADY_PAID", R.PAID);
        if (i.amountSatang < due && !(await settings(tenantId, i.unitId)).partialAllowed) return fail("PARTIAL_DENIED", R.DENY);
        plan = makePlan(recv, b2, i.amountSatang, allocate(u.target, u.sources, i.amountSatang), i.channel, paidAt.toISOString(), null, false, ctx.actorUserId, { financeAccountId: i.financeAccountId ?? null, note });
        if (!(await savePlan(tenantId, bill.id, hold.token, plan))) return fail("BUSY", BUSY_REASON);
      }
      keepPlan = true;
      try {
        await runPlan(hold, tenantId, i.unitId, bill.id, plan);
      } catch (e) {
        if (e instanceof PartialVoid) partial = e;
        else if (e instanceof Stop && e.code === "NOT_PAYABLE" && !(await planMoved(tenantId, plan))) {
          await dropPlan(tenantId, bill.id, hold.token, recv);
          keepPlan = false;
          return (await voidReason(tenantId, bill.id)) === "AFTER_PAID" ? fail("BUSY", BUSY_REASON) : fail("BILL_VOID", R.VOID);
        } else throw e;
      }
      await dropPlan(tenantId, bill.id, hold.token, recv);
      keepPlan = false;
      view = await viewOfRef(tenantId, recv);
    } finally {
      await hold.release(bill.id, keepPlan ? null : recv);
      await sendAll(tenantId, sent);
    }
    if (!view) return fail("FAILED", R.FAILED);
    if (partial) {
      // Z9 ▸ บิลถูกยกเลิกระหว่างลงเงิน: ใบเสร็จตามยอดที่ลงจริงแล้ว · ส่วนที่เหลือไม่ได้บันทึก (ไม่หายเงียบ — บอกพนักงาน + log)
      await logOps("WARN", "dorm.pay", "รับเงินมือ: บิลถูกยกเลิกระหว่างลงเงิน — ออกใบเสร็จตามยอดที่ลงแล้ว", { tenantId, detail: `receipt=${view.receiptId} rest=${partial.restSatang}` });
      await sendReceipt(tenantId, i.unitId, view);
      return fail("BILL_VOID", `บิลถูกยกเลิกระหว่างบันทึก — ออกใบเสร็จ ${view.docNo} ยอด ${portalBaht(partial.movedSatang)} แล้ว · ส่วนที่เหลือ ${portalBaht(partial.restSatang)} ไม่ได้บันทึก ให้คืนผู้เช่า`);
    }
    await sendReceipt(tenantId, i.unitId, view);
    return { ok: true, duplicate: false, receipt: view };
  } catch (e) {
    await logOps("WARN", "dorm.pay", "รับเงินมือไม่สำเร็จ", { tenantId: isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : undefined, detail: errText(e) });
    return stopFail(e);
  }
}

export async function voidDormReceipt(ctx: DormPayCtx, i: { receiptId: string; reason: string }): Promise<{ ok: true; receipt: DormReceiptView } | DormPayFail> {
  try {
    if (!ctxOk(ctx) || !isRec(i) || !isStr(i.receiptId) || !ID_RE.test(i.receiptId)) return notFound();
    const tenantId = ctx.tenantId;
    const row = (await dormReceiptRows(tenantId, { ids: [i.receiptId] }))[0];
    if (!row) return notFound();
    if (!(await dormStaffGate(ctx, row.unitId, "dorm.payment.manual"))) return notFound();
    const [before] = await receiptViews(tenantId, [row]);
    if (!before) return fail("FAILED", R.FAILED);
    const billIds = [...new Set([before.billId, ...before.allocations.map((a) => a.billId)].filter(Boolean))].sort();
    // Z3 ▸ ใบเสร็จที่แตะบิลนอกขอบเขตอาคาร = ไม่พบ
    const scope = await roomScope(ctx, row.unitId);
    if (scope !== null) {
      const rooms = await tenantDb({ tenantId, unitId: row.unitId }).dormBill.findMany({ where: { id: { in: billIds } }, select: { roomId: true } });
      if (!billIds.length || rooms.length !== billIds.length || rooms.some((r) => !scope.has(r.roomId))) return notFound();
    }
    const reason = typeof i.reason === "string" ? i.reason.trim() : "";
    if (reason.length < VOID_REASON_MIN || reason.length > REASON_MAX) return fail("VALIDATION", `ใส่เหตุผลการยกเลิกอย่างน้อย ${VOID_REASON_MIN} ตัวอักษร`);
    if (row.status === "VOIDED") return fail("ALREADY_VOID", "ใบเสร็จนี้ถูกยกเลิกไปแล้ว");
    const hold = new Hold(tenantId);
    try {
      // Z26 ▸ แพ้ claim (มีคนกำลังลงเงินบิลนี้) ⇒ รอสั้น ๆ ลองจองซ้ำ (≤ 3 วิ) — อีกทางยกเลิกใบนี้ไปแล้ว ⇒ ALREADY_VOID
      let got = await hold.take(billIds);
      for (let n = 0; !got && n < 6; n++) {
        await hold.release(null, null);
        await sleep(500);
        if ((await dormReceiptRows(tenantId, { ids: [row.id] }))[0]?.status === "VOIDED") return fail("ALREADY_VOID", "ใบเสร็จนี้ถูกยกเลิกไปแล้ว");
        got = await hold.take(billIds);
      }
      if (!got) return fail("BUSY", BUSY_REASON);
      const cur = (await dormReceiptRows(tenantId, { ids: [row.id] }))[0];
      if (!cur || cur.status === "VOIDED") return fail("ALREADY_VOID", "ใบเสร็จนี้ถูกยกเลิกไปแล้ว");
      // คีย์ที่รู้จากใบเสร็จ + facade กวาดทุกคีย์ "<การรับ>:*" ของใบนี้เองใต้ล็อก (Z1)
      const keys = [...new Set([row.invoiceId, ...row.allocations.map((a) => a.docId)])].map((d) => payKey(row.refId, d));
      await hold.renew();
      const r = await twice(() => voidDormReceiptDoc({ tenantId, unitId: row.unitId, receiptId: row.id, paymentKeys: keys, reason }), hold);
      if (!r.ok) {
        if (r.code === "ALREADY_VOID") return fail("ALREADY_VOID", r.reason);
        throw new Stop(r.code, r.reason);
      }
      // บิลกลับสถานะตามยอดจริง · ยกยอดของใบนี้หมดผล
      await resyncAfterVoid(tenantId, row.unitId, billIds, before);
    } finally {
      await hold.release(null, null);
    }
    await tenantDb({ tenantId }).auditLog.create({
      data: { tenantId, unitId: row.unitId, actorType: "USER", actorId: ctx.actorUserId, action: "dorm.receipt.voided", targetType: "AccountDocument", targetId: row.id, after: { receiptId: row.id, docNo: row.docNo, reason, amountSatang: row.amountSatang } },
    });
    const view = await viewOfRef(tenantId, row.refId);
    return view ? { ok: true, receipt: view } : fail("FAILED", R.FAILED);
  } catch (e) {
    await logOps("WARN", "dorm.pay", "ยกเลิกใบเสร็จไม่สำเร็จ", { tenantId: isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : undefined, detail: errText(e) });
    return stopFail(e);
  }
}
async function resyncAfterVoid(tenantId: string, unitId: string, billIds: string[], v: DormReceiptView): Promise<void> {
  const db = tenantDb({ tenantId, unitId });
  const rows = await db.dormBill.findMany({ where: { id: { in: billIds } }, select: { id: true, accountDocumentId: true, paidSatang: true } });
  const bal = await billBalances(tenantId, billIds);
  const paid = await billPaidSatang(tenantId, rows);
  for (const b of rows) {
    const own = bal.get(b.id)?.ownOutstandingSatang ?? 0;
    const got = paid.get(b.id) ?? 0;
    const status = own === 0 ? "PAID" : got > 0 ? "PARTIALLY_PAID" : "SENT";
    await db.dormBill.updateMany({
      where: { id: b.id, status: { in: VISIBLE } },
      data: { paidSatang: got, status, ...(status === "PAID" ? {} : { paidAt: null }), ...(v.carriedSatang > 0 && b.id === v.billId ? { carriedSatang: 0 } : {}) },
    });
  }
}

export async function dormBillReceipts(ctx: DormPayCtx, i: { unitId: string; billId: string }): Promise<DormReceiptView[] | null> {
  if (!ctxOk(ctx) || !isRec(i) || !isStr(i.unitId) || !isStr(i.billId)) return null;
  const tenantId = ctx.tenantId;
  if (!(await canAny(ctx, i.unitId))) return null;
  const bill = await readBill(tenantId, i.billId);
  if (!bill || bill.unitId !== i.unitId) return null;
  if (!inScope(await roomScope(ctx, i.unitId), bill.roomId)) return null;
  if (!bill.accountDocumentId) return [];
  const bal = (await billBalances(tenantId, [bill.id])).get(bill.id);
  const docIds = [bill.accountDocumentId, ...(bal?.debitNotes.map((d) => d.docId) ?? [])];
  return receiptViews(tenantId, await dormReceiptRows(tenantId, { docIds }));
}
async function canAny(ctx: DormPayCtx, unitId: string): Promise<{ review: boolean; manual: boolean; unitName: string } | null> {
  const a = await dormStaffGate(ctx, unitId, "dorm.slip.review");
  const b = await dormStaffGate(ctx, unitId, "dorm.payment.manual");
  return a || b ? { review: !!a, manual: !!b, unitName: (a ?? b)?.unitName ?? "" } : null;
}

// ═══════════════ §3.7 โมเดลจอ 06 ═══════════════
type ChatItem = { itemId: string; fileId: string; connectionId: string; messageId: string; partyId: string; leaseIds: string[]; unitIds: string[]; roomNumbers: string[]; receivedAt: Date };
const STASH_ACTION = "dorm.chatslip.stashed";
const CLOSE_ACTION = "dorm.chatslip.closed";

function flagsOf(s: SlipRow, due: number): DormSlipFlag[] {
  const reasons = (s.reviewReason ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const out: DormSlipFlag[] = [];
  if (reasons.includes("PAYER_NAME_MISMATCH")) out.push("PAYER_NAME");
  if (s.amountSatang !== null && s.amountSatang < due) out.push("SHORT");
  if (s.amountSatang !== null && s.amountSatang > due) out.push("OVER");
  if (reasons.some((r) => r.startsWith("DUPLICATE_") || r === "VERIFIER_DUPLICATE")) out.push("DUPLICATE");
  if (reasons.some((r) => !r.startsWith("DUPLICATE_") && !["VERIFIER_DUPLICATE", "PAYER_NAME_MISMATCH", "AMOUNT_SHORT", "AMOUNT_OVER"].includes(r))) out.push("OTHER");
  return out;
}

export async function dormPaymentsModel(ctx: DormPayCtx, i: { unitId: string; periodKey?: string | null }): Promise<DormPaymentsModel | null> {
  if (!ctxOk(ctx) || !isRec(i) || !isStr(i.unitId)) return null;
  const can = await canAny(ctx, i.unitId);
  if (!can) return null;
  const tenantId = ctx.tenantId;
  const unitId = i.unitId;
  const db = tenantDb({ tenantId, unitId });
  const raw = tenantDb({ tenantId });
  // Z3 ▸ ขอบเขตอาคาร: ทุกส่วนของจอ (รอตรวจ · ค้าง · รับล่าสุด · สลิปแชท · KPI) คิดจากห้องที่ผู้ใช้เห็นเท่านั้น
  const scope = await roomScope(ctx, unitId);
  const roomWhere = scope === null ? {} : { roomId: { in: [...scope] } };
  const period = isStr(i.periodKey) && /^\d{4}-\d{2}$/.test(i.periodKey)
    ? i.periodKey
    : ((await db.dormBill.findFirst({ where: { status: { in: VISIBLE }, ...roomWhere }, orderBy: { periodKey: "desc" }, select: { periodKey: true } }))?.periodKey ?? bkkYmd(new Date()).slice(0, 7));
  const billSel = { id: true, leaseId: true, roomId: true, partyId: true, periodKey: true, status: true, accountDocumentId: true, paidSatang: true, paidAt: true } as const;
  const pBills = await db.dormBill.findMany({ where: { periodKey: period, status: { in: VISIBLE }, ...roomWhere }, select: billSel });
  const oldBills = await db.dormBill.findMany({ where: { periodKey: { lt: period }, status: { in: ["SENT", "PARTIALLY_PAID"] }, ...roomWhere }, select: billSel });
  // Z22 ▸ ขอบเขตอาคารอยู่ในคิวรีก่อน take (ไม่ให้สลิปนอกขอบเขตกินโควตา 200 แถวแล้วสลิปในขอบเขตหาย)
  const scopeBillIds = scope === null ? null : (await db.dormBill.findMany({ where: roomWhere, select: { id: true } })).map((b) => b.id);
  const pendingSel = { id: true, refId: true, status: true, amountSatang: true, expectedSatang: true, reviewReason: true, transferredAt: true, bankCode: true, checks: true, createdAt: true } as const;
  const slips = await db.paymentSlip.findMany({
    where: {
      domain: "DORM", refType: "DORM_BILL", ...(scopeBillIds === null ? {} : { refId: { in: scopeBillIds } }),
      OR: [{ status: { in: REVIEWABLE } }, { status: { in: APPROVED }, checks: { path: ["dormHold", "open"], equals: true } }, { status: { in: APPROVED }, checks: { path: ["dormHold", "resolving"], equals: true } }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
    select: pendingSel,
  });
  const known = new Set([...pBills, ...oldBills].map((b) => b.id));
  const extra = slips.some((s) => !known.has(s.refId))
    ? await db.dormBill.findMany({ where: { id: { in: slips.map((s) => s.refId).filter((x) => !known.has(x)) }, ...roomWhere }, select: billSel })
    : [];
  const all = [...pBills, ...oldBills, ...extra];
  const bal = await billBalances(tenantId, all.map((b) => b.id));
  const paid = await billPaidSatang(tenantId, pBills);
  const roomIds = [...new Set(all.map((b) => b.roomId))];
  const partyIds = [...new Set(all.map((b) => b.partyId))];
  const rooms = roomIds.length ? await raw.$queryRaw<{ id: string; number: string }[]>`SELECT "id", "number" FROM "HotelRoom" WHERE "tenantId" = ${tenantId} AND "id" = ANY(${roomIds}::text[])` : [];
  const parties = partyIds.length ? await raw.party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } }) : [];
  const roomOf = new Map(rooms.map((r) => [r.id, r.number]));
  const nameOf = new Map(parties.map((p) => [p.id, shortName(p.name)]));
  const billOf = new Map(all.map((b) => [b.id, b]));
  const s = await settings(tenantId, unitId);

  const review: DormReviewRow[] = [];
  for (const x of slips) {
    const b = billOf.get(x.refId);
    if (!b) continue;
    const due = bal.get(b.id)?.dueSatang ?? 0;
    const row = x as unknown as SlipRow;
    const held = holdOf(row);
    const heldOpen = holdPending(held) && APPROVED.includes(x.status);
    if (!heldOpen && !REVIEWABLE.includes(x.status)) continue;
    const flags: DormSlipFlag[] = heldOpen && held ? [held.reason === "PLAN_STUCK" || held.reason === "RETRY_EXHAUSTED" ? "OTHER" : (held.reason as DormSlipFlag)] : flagsOf(row, due);
    const short = flags.includes("SHORT");
    // Z14 ▸ ยกยอดได้เมื่อยอดสลิปครอบยอดยกมาแล้ว (ไม่งั้นให้เลือก ขอเพิ่ม/ปฏิเสธ)
    const carryOk = (x.amountSatang ?? 0) >= carriedInSum(bal.get(b.id) ?? ({ carriedIn: [] } as unknown as DormBillBalance));
    const actions: DormReviewRow["actions"] = heldOpen
      ? (await refundAllowed(tenantId, held, b.id, x.id)) ? ["CREDIT", "REFUND_DUE"] : ["CREDIT"] // Z23/Z27 ▸ ตรงกับด่านของ resolveHeldSlip
      : [
          ...(due > 0 && (x.amountSatang === null || x.amountSatang >= due) ? (["APPROVE"] as const) : []),
          ...(short && s.partialAllowed ? [...(carryOk ? (["PARTIAL_CARRY"] as const) : []), "ASK_MORE" as const] : []),
          "REJECT",
        ];
    review.push({
      slipId: x.id, billId: b.id, roomNumber: roomOf.get(b.roomId) ?? "", tenantShort: nameOf.get(b.partyId) ?? "", periodKey: b.periodKey, dueSatang: due, slipSatang: x.amountSatang,
      diffSatang: x.amountSatang === null ? 0 : x.amountSatang - due, transferredAt: x.transferredAt?.toISOString() ?? null, bankCode: x.bankCode,
      status: heldOpen ? "HELD" : (x.status as "PENDING" | "NEEDS_REVIEW"), flags, actions,
    });
  }
  const live = review.filter((r) => r.status !== "HELD");
  const reviewBills = new Map(live.map((r) => [r.billId, r.dueSatang]));
  const waiting = new Set(live.map((r) => r.billId));
  const unpaid = pBills.filter((b) => (bal.get(b.id)?.dueSatang ?? 0) > 0 && !waiting.has(b.id));
  const leaseIds = [...new Set(oldBills.map((b) => b.leaseId))];
  const liveLeases = leaseIds.length ? new Set((await db.dormLease.findMany({ where: { id: { in: leaseIds }, status: { in: ["ACTIVE", "NOTICE"] }, endedAt: null }, select: { id: true } })).map((l) => l.id)) : new Set<string>();
  const over = oldBills.map((b) => ({ b, left: (bal.get(b.id)?.ownOutstandingSatang ?? 0) - (bal.get(b.id)?.carriedOutSatang ?? 0) })).filter((x) => x.left > 0 && liveLeases.has(x.b.leaseId));
  const paidBills = pBills.filter((b) => b.status === "PAID").sort((a, c) => (c.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));
  const docIds = paidBills.map((b) => b.accountDocumentId).filter((x): x is string => !!x);
  const receipts = docIds.length ? await dormReceiptRows(tenantId, { docIds }) : [];
  const liveReceipts = receipts.filter((r) => r.status === "ISSUED");
  const receiptOfBill = new Map<string, DormReceiptRow>();
  for (const r of liveReceipts) receiptOfBill.set(r.invoiceId, r);
  const autoSlips = paidBills.length ? await db.paymentSlip.findMany({ where: { status: "AUTO_APPROVED", refType: "DORM_BILL", refId: { in: paidBills.map((b) => b.id) } }, select: { id: true, refId: true } }) : [];
  const liveRefs = new Set(liveReceipts.map((r) => r.refId));
  const autoApproved = new Set(autoSlips.filter((a) => liveRefs.has(`slip:${a.id}`)).map((a) => a.refId)).size;
  const recent = paidBills.slice(0, 10).map((b) => {
    const r = b.accountDocumentId ? receiptOfBill.get(b.accountDocumentId) : undefined;
    const via: DormPaymentsModel["recent"][number]["via"] = !r ? "OTHER" : r.refId.startsWith("slip:") ? "SLIP" : r.channel === "CASH" ? "CASH" : "TRANSFER";
    return { billId: b.id, roomNumber: roomOf.get(b.roomId) ?? "", tenantShort: nameOf.get(b.partyId) ?? "", via, at: (b.paidAt ?? new Date(0)).toISOString(), amountSatang: paid.get(b.id) ?? 0, docNo: r?.docNo ?? null, receiptId: r?.id ?? null };
  });
  const openRow = (b: (typeof pBills)[number], overdue: boolean, dueSatang: number) => ({ billId: b.id, roomNumber: roomOf.get(b.roomId) ?? "", tenantShort: nameOf.get(b.partyId) ?? "", periodKey: b.periodKey, dueSatang, overdue, inReview: waiting.has(b.id) });
  const open = [...pBills.filter((b) => (bal.get(b.id)?.dueSatang ?? 0) > 0).map((b) => openRow(b, false, bal.get(b.id)?.dueSatang ?? 0)), ...over.map((x) => openRow(x.b, true, x.left))].sort((a, c) => byNumber(a.roomNumber, c.roomNumber));
  const book = await dormUnitBookId(tenantId, unitId);
  return {
    unitId, unitName: can.unitName, periodKey: period, periodLabel: portalPeriodLabel(period),
    can: { review: can.review, manual: can.manual },
    kpi: {
      receivedSatang: pBills.reduce((a, b) => a + (paid.get(b.id) ?? 0), 0),
      receivedBills: paidBills.length,
      autoApproved,
      reviewCount: live.length,
      reviewSatang: [...reviewBills.values()].reduce((a, c) => a + c, 0),
      reviewRooms: [...new Set(live.map((r) => r.roomNumber))].sort(byNumber),
      unpaidSatang: unpaid.reduce((a, b) => a + (bal.get(b.id)?.dueSatang ?? 0), 0),
      unpaidBills: unpaid.length,
      overdueSatang: over.reduce((a, x) => a + x.left, 0),
      overdueRooms: [...new Set(over.map((x) => roomOf.get(x.b.roomId) ?? ""))].sort(byNumber),
    },
    review,
    chat: can.review ? (await chatInScope(tenantId, scope, await openChatItems(tenantId, unitId, s.chatKeepDays, scope))).map((c) => ({ itemId: c.itemId, roomNumbers: c.roomNumbers, receivedAt: c.receivedAt.toISOString() })) : [],
    recent,
    open,
    links: { statementMatch: book ? `/app/sys/${book}/account/finance/reconcile` : null },
  };
}

// ═══════════════ §3.8 สลิปจากแชท — ทะเบียน = AuditLog (id กำหนดได้ ⇒ messageId เดิม = รายการเดิม · ไม่มี migration) · รูป = FileAsset ส่วนตัว ═══════════════
const itemIdOf = (connectionId: string, messageId: string) => `dcs${createHash("sha256").update(`${connectionId}:${messageId}`).digest("hex").slice(0, 32)}`;
function itemOf(r: { id: string; after: Prisma.JsonValue; createdAt: Date }): ChatItem | null {
  const a = isRec(r.after) ? r.after : null;
  if (!a || !isStr(a.fileId) || !isStr(a.connectionId) || !isStr(a.messageId) || !isStr(a.partyId)) return null;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter(isStr) : []);
  return { itemId: r.id, fileId: a.fileId, connectionId: a.connectionId, messageId: a.messageId, partyId: a.partyId, leaseIds: strs(a.leaseIds), unitIds: strs(a.unitIds), roomNumbers: strs(a.roomNumbers), receivedAt: r.createdAt };
}
async function readItem(tenantId: string, itemId: string): Promise<ChatItem | null> {
  if (!isStr(itemId) || !ID_RE.test(itemId)) return null;
  const db = tenantDb({ tenantId });
  const r = await db.auditLog.findFirst({ where: { id: itemId, action: STASH_ACTION }, select: { id: true, after: true, createdAt: true } });
  if (!r) return null;
  const closed = await db.auditLog.count({ where: { action: CLOSE_ACTION, targetId: itemId } });
  const item = closed ? null : itemOf(r);
  if (!item) return null;
  // Z6 ▸ เกินอายุเก็บของหน่วย ⇒ ไม่มีแล้ว (ลบรูปเดี๋ยวนี้ — ไม่รอรอบงานตามเวลา)
  if (await expired(tenantId, item, Date.now())) {
    await closeItem(tenantId, item, null, "หมดอายุการเก็บ");
    return null;
  }
  return item;
}
/** อายุเก็บ = ค่าตั้งของหน่วย (ค่ามากสุดของหน่วยที่รายการผูก — เก็บนานสุดที่หน่วยใดตั้งไว้) */
async function expired(tenantId: string, item: ChatItem, nowMs: number): Promise<boolean> {
  let keep = 1;
  for (const u of item.unitIds.length ? item.unitIds : [""]) if (u) keep = Math.max(keep, (await settings(tenantId, u)).chatKeepDays);
  return item.receivedAt.getTime() < nowMs - keep * 86_400_000;
}
/** ปิดรายการครั้งเดียว (id กำหนดได้ · ชน = มีคนปิดแล้ว) + ลบรูปส่วนตัว */
async function closeItem(tenantId: string, item: ChatItem, actorId: string | null, reason: string, deps?: FileDeps): Promise<boolean> {
  try {
    await tenantDb({ tenantId }).auditLog.create({
      data: { id: `${item.itemId}c`, tenantId, actorType: actorId ? "USER" : "SYSTEM", actorId: actorId ?? "module:dorm", action: CLOSE_ACTION, targetType: "AuditLog", targetId: item.itemId, after: { reason } },
    });
  } catch {
    return false;
  }
  await deleteFileAsset({ tenantId }, item.fileId, deps?.del ? { del: deps.del, purge: async () => {} } : undefined);
  return true;
}
const notClosed = async (tenantId: string, items: ChatItem[]): Promise<ChatItem[]> => {
  if (!items.length) return [];
  const closed = new Set((await tenantDb({ tenantId }).auditLog.findMany({ where: { action: CLOSE_ACTION, targetId: { in: items.map((x) => x.itemId) } }, select: { targetId: true } })).map((c) => c.targetId));
  return items.filter((x) => !closed.has(x.itemId));
};
async function openChatItems(tenantId: string, unitId: string, keepDays: number, scope: Set<string> | null = null): Promise<ChatItem[]> {
  const db = tenantDb({ tenantId });
  const cut = new Date(Date.now() - keepDays * 86_400_000);
  // Z6 ▸ รายการหมดอายุของหน่วยนี้: คิวรีตรงตามเวลา ไม่จำกัดจำนวน ⇒ ลบรูปให้หมดทุกครั้งที่อ่านจอ (งานตามเวลาเป็นทางหลัก)
  const old = (await db.auditLog.findMany({ where: { action: STASH_ACTION, createdAt: { lt: cut } }, orderBy: { createdAt: "asc" }, select: { id: true, after: true, createdAt: true } }))
    .map(itemOf)
    .filter((x): x is ChatItem => !!x && x.unitIds.includes(unitId));
  for (const x of await notClosed(tenantId, old)) if (await expired(tenantId, x, Date.now())) await closeItem(tenantId, x, null, "หมดอายุการเก็บ");
  // Z22 ▸ หน่วย · ยังไม่ปิด · ขอบเขตอาคาร (ห้องของสัญญาที่ผูก) อยู่ในคิวรีก่อน LIMIT
  const rooms = scope === null ? null : [...scope];
  const rows = await db.$queryRaw<{ id: string; after: Prisma.JsonValue; createdAt: Date }[]>`
    SELECT a."id", a."after", a."createdAt" FROM "AuditLog" a
    WHERE a."tenantId" = ${tenantId} AND a."action" = ${STASH_ACTION} AND a."createdAt" >= ${cut}
      AND (a."after"::jsonb -> 'unitIds') @> jsonb_build_array(${unitId}::text)
      AND NOT EXISTS (SELECT 1 FROM "AuditLog" c WHERE c."tenantId" = a."tenantId" AND c."action" = ${CLOSE_ACTION} AND c."targetId" = a."id")
      AND (${rooms === null}::boolean OR EXISTS (
        SELECT 1 FROM "DormLease" l WHERE l."tenantId" = a."tenantId" AND l."roomId" = ANY(${rooms ?? []}::text[])
          AND l."id" IN (SELECT jsonb_array_elements_text(a."after"::jsonb -> 'leaseIds'))))
    ORDER BY a."createdAt" DESC, a."id" DESC LIMIT 500`;
  return rows.map(itemOf).filter((x): x is ChatItem => !!x && x.unitIds.includes(unitId));
}
/** Z3 ▸ ห้องของรายการ (จากสัญญาที่ผูก) ต้องอยู่ในขอบเขตอาคาร */
async function leaseRooms(tenantId: string, leaseIds: string[]): Promise<string[]> {
  if (!leaseIds.length) return [];
  return (await tenantDb({ tenantId }).$queryRaw<{ roomId: string }[]>`SELECT "roomId" FROM "DormLease" WHERE "tenantId" = ${tenantId} AND "id" = ANY(${leaseIds}::text[])`).map((r) => r.roomId);
}
async function chatInScope(tenantId: string, scope: Set<string> | null, items: ChatItem[]): Promise<ChatItem[]> {
  if (scope === null) return items;
  const out: ChatItem[] = [];
  for (const x of items) if ((await leaseRooms(tenantId, x.leaseIds)).some((r) => scope.has(r))) out.push(x);
  return out;
}

/**
 * Z6 ▸ งานตามเวลา (minute-jobs "dorm.chatSlipSweep"): ลบรูปสลิปแชทที่เกินอายุเก็บของหน่วย — ข้ามร้าน · idempotent (ปิดด้วย id กำหนดได้ · ชน = มีคนปิดแล้ว)
 *   เดินตามเวลาสร้างแบบ cursor (ไม่ติดที่รายการที่ยังไม่หมดอายุ) · เคารพงบ/สัญญาณยกเลิก
 */
export async function sweepExpiredChatSlips(now: Date, opts?: { budgetMs?: number; signal?: AbortSignal; tenantId?: string }): Promise<{ removed: number }> {
  const t0 = Date.now();
  const budget = typeof opts?.budgetMs === "number" && opts.budgetMs > 0 ? opts.budgetMs : 60_000;
  const left = () => (opts?.signal?.aborted ? 0 : budget - (Date.now() - t0));
  const nowMs = now.getTime();
  const minCut = new Date(nowMs - 86_400_000); // อายุเก็บต่ำสุด 1 วัน — ใหม่กว่านี้ไม่มีทางหมดอายุ
  const tid = isStr(opts?.tenantId) ? opts.tenantId : null;
  const raw = tenantDb({ tenantId: tid ?? "platform-global-read" });
  let removed = 0;
  let after = new Date(0);
  let afterId = "";
  try {
    for (;;) {
      if (left() < 2_000) break;
      type Row = { id: string; tenantId: string; after: Prisma.JsonValue; createdAt: Date };
      const rows = tid
        ? await raw.$queryRaw<Row[]>`
            SELECT a."id", a."tenantId", a."after", a."createdAt" FROM "AuditLog" a
            WHERE a."tenantId" = ${tid} AND a."action" = ${STASH_ACTION} AND a."createdAt" < ${minCut} AND (a."createdAt", a."id") > (${after}, ${afterId})
              AND NOT EXISTS (SELECT 1 FROM "AuditLog" c WHERE c."tenantId" = a."tenantId" AND c."action" = ${CLOSE_ACTION} AND c."targetId" = a."id")
            ORDER BY a."createdAt" ASC, a."id" ASC LIMIT 200`
        : await raw.$queryRaw<Row[]>`
            SELECT a."id", a."tenantId", a."after", a."createdAt" FROM "AuditLog" a
            WHERE a."action" = ${STASH_ACTION} AND a."createdAt" < ${minCut} AND (a."createdAt", a."id") > (${after}, ${afterId})
              AND NOT EXISTS (SELECT 1 FROM "AuditLog" c WHERE c."tenantId" = a."tenantId" AND c."action" = ${CLOSE_ACTION} AND c."targetId" = a."id")
            ORDER BY a."createdAt" ASC, a."id" ASC LIMIT 200`;
      if (!rows.length) break;
      for (const r of rows) {
        after = r.createdAt;
        afterId = r.id;
        if (left() < 2_000) break;
        const item = itemOf(r);
        if (item && (await expired(r.tenantId, item, nowMs)) && (await closeItem(r.tenantId, item, null, "หมดอายุการเก็บ"))) removed++;
      }
      if (rows.length < 200) break;
    }
  } catch (e) {
    await logOps("WARN", "dorm.pay", "งานลบรูปสลิปแชทหมดอายุไม่สำเร็จ — รอบหน้าทำต่อ", { detail: errText(e) });
  }
  return { removed };
}

export async function stashChatSlip(
  ctx: { tenantId: string; connectionId: string; partyId: string; leaseIds: string[] },
  i: { messageId: string; data: Uint8Array; contentType: string },
  opts?: { now?: Date; deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void> } },
): Promise<{ itemId: string } | null> {
  try {
    if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.connectionId) || !isStr(ctx.partyId) || !Array.isArray(ctx.leaseIds) || !ctx.leaseIds.length) return null;
    if (!isRec(i) || !isStr(i.messageId) || !MESSAGE_ID_RE.test(i.messageId)) return null;
    const tenantId = ctx.tenantId;
    const itemId = itemIdOf(ctx.connectionId, i.messageId);
    const db = tenantDb({ tenantId });
    if (await db.auditLog.count({ where: { id: itemId, action: STASH_ACTION } })) return { itemId };
    const leases = await db.$queryRaw<{ id: string; unitId: string; number: string }[]>`
      SELECT l."id", l."unitId", r."number" FROM "DormLease" l JOIN "HotelRoom" r ON r."id" = l."roomId" AND r."tenantId" = l."tenantId"
      WHERE l."tenantId" = ${tenantId} AND l."id" = ANY(${ctx.leaseIds}::text[]) ORDER BY r."number" ASC`;
    if (!leases.length) return null;
    const up = await uploadFile({ tenantId }, { kind: "ATTACHMENT", filename: `chat-slip-${itemId}`, contentType: i.contentType, data: i.data, visibility: "private" }, opts?.deps?.put ? { put: opts.deps.put } : undefined);
    if (!up.ok) return null;
    try {
      await db.auditLog.create({
        data: {
          id: itemId, tenantId, unitId: leases[0]?.unitId ?? null, actorType: "SYSTEM", actorId: "module:dorm", action: STASH_ACTION, targetType: "FileAsset", targetId: up.assetId,
          after: { fileId: up.assetId, connectionId: ctx.connectionId, messageId: i.messageId, partyId: ctx.partyId, leaseIds: leases.map((l) => l.id), unitIds: [...new Set(leases.map((l) => l.unitId))], roomNumbers: leases.map((l) => l.number) },
          ...(opts?.now ? { createdAt: opts.now } : {}),
        },
      });
    } catch {
      await deleteFileAsset({ tenantId }, up.assetId); // แพ้การแข่ง messageId เดียวกัน = รายการเดิม
    }
    return { itemId };
  } catch (e) {
    await logOps("WARN", "dorm.pay", "เก็บรูปสลิปจากแชทไม่สำเร็จ", { tenantId: isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : undefined, detail: errText(e) });
    return null;
  }
}

/** รายการของร้าน + สิทธิ์ตรวจสลิปที่หน่วยของรายการ — ไม่ผ่าน ⇒ null */
async function itemGate(ctx: DormPayCtx, itemId: string): Promise<ChatItem | null> {
  const item = await readItem(ctx.tenantId, itemId);
  if (!item) return null;
  const rooms = await leaseRooms(ctx.tenantId, item.leaseIds);
  for (const u of item.unitIds) {
    if (!(await dormStaffGate(ctx, u, "dorm.slip.review"))) continue;
    const scope = await roomScope(ctx, u);
    if (scope === null || rooms.some((r) => scope.has(r))) return item;
  }
  return null;
}

export async function attachChatSlip(ctx: DormPayCtx, i: { itemId: string; billId: string }, opts?: { deps?: FileDeps }): Promise<{ ok: true; slipId: string; status: string } | DormPayFail> {
  try {
    if (!ctxOk(ctx) || !isRec(i) || !isStr(i.itemId) || !isStr(i.billId)) return notFound();
    const tenantId = ctx.tenantId;
    const item = await itemGate(ctx, i.itemId);
    if (!item) return notFound();
    const bill = await readBill(tenantId, i.billId);
    if (!bill || !item.leaseIds.includes(bill.leaseId) || !item.unitIds.includes(bill.unitId) || !(await billGate(ctx, bill.unitId, "dorm.slip.review", bill.roomId))) return notFound();
    const st = billState(bill, bill.unitId);
    if (st !== "OK") return stateFail(st);
    const due = (await billBalances(tenantId, [bill.id])).get(bill.id)?.dueSatang ?? 0;
    if (due === 0) return (await invoiceDead(tenantId, bill)) ? fail("BILL_VOID", R.VOID) : fail("ALREADY_PAID", R.PAID); // Z21 ▸ ใบแจ้งหนี้ถูกยกเลิก (บิลยังไม่พลิก) ≠ จ่ายครบ
    const content = await fetchLineMessageContent({ tenantId }, { connectionId: item.connectionId, messageId: item.messageId });
    if (!content.ok) return fail("CONTENT_GONE", "รูปนี้หมดอายุจาก LINE แล้ว ให้ผู้เช่าส่งสลิปใหม่");
    const name = await portalPartyName(tenantId, bill.partyId);
    const deps = opts?.deps;
    const r = await submitSlip(
      { tenantId },
      {
        unitId: bill.unitId, domain: "DORM", refType: "DORM_BILL", refId: bill.id, partyId: bill.partyId, file: { data: content.data, contentType: content.contentType },
        expectedSatang: due, idempotencyKey: `dorm-chat:${item.messageId}`, expectedPayerNames: name ? [name] : [],
      },
      { ...(deps?.put ? { put: deps.put } : {}), ...(deps?.del ? { del: deps.del } : {}) },
    );
    if (!r.ok) return fail("FAILED", R.FAILED);
    await closeItem(tenantId, item, ctx.actorUserId, `แนบเข้าบิล ${bill.id}`, deps);
    return { ok: true, slipId: r.slipId, status: r.status };
  } catch (e) {
    await logOps("WARN", "dorm.pay", "แนบสลิปจากแชทไม่สำเร็จ", { tenantId: isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : undefined, detail: errText(e) });
    return stopFail(e);
  }
}

export async function dismissChatSlip(ctx: DormPayCtx, i: { itemId: string; reason: string }, opts?: { deps?: { del?: (path: string) => Promise<number> } }): Promise<{ ok: true } | DormPayFail> {
  try {
    if (!ctxOk(ctx) || !isRec(i) || !isStr(i.itemId)) return notFound();
    const item = await itemGate(ctx, i.itemId);
    if (!item) return notFound();
    const reason = validReason(i.reason);
    if (!reason) return fail("VALIDATION", `ใส่เหตุผล 1–${REASON_MAX} ตัวอักษร`);
    return (await closeItem(ctx.tenantId, item, ctx.actorUserId, reason, opts?.deps)) ? { ok: true } : notFound();
  } catch (e) {
    await logOps("WARN", "dorm.pay", "ทิ้งรายการสลิปแชทไม่สำเร็จ", { tenantId: isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : undefined, detail: errText(e) });
    return stopFail(e);
  }
}
