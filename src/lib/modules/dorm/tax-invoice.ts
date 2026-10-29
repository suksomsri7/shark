// SVC D.3 ▸ ใบกำกับภาษีเต็มรูปของหอ (ม.86/4) — สัญญา ledger/svc-briefs/svc-brief-d.3.md §3.2–§3.4
//   • อ่าน/เขียนข้อมูลหอผ่าน tenantDb เท่านั้น (F5.1) · เอกสาร/เลขที่/บัญชีผ่าน facade บัญชีเท่านั้น (createExternalTaxInvoice · replaceExternalTaxInvoice ·
//     externalTaxInvoicesOf · externalTaxSeller) — ไม่ล้วง account/*
//   • ผู้ซื้อ (ม.86/4(3)) = Party ของสัญญา ณ ตอนออก: ชื่อ · ที่อยู่ (ว่าง ⇒ "ห้อง <เลข> <ชื่อหอ>") · เลขผู้เสียภาษี (ต้องผ่าน checksum) · สาขา
//   • ขอบเขต (X1): หน่วยต้องเป็น DORM ACTIVE ของร้าน · สิทธิ์อ่านสดจาก Membership ทุกครั้ง · ไม่ผ่าน ⇒ NOT_FOUND / null
//   • ยกเลิกใบกำกับ = ออกฉบับใหม่แทนเท่านั้น (ยอดเท่าเดิม) · audit dorm.taxinvoice.reissued ไม่มีชื่อ/เลขผู้ซื้อ (X8)
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveSettingsMany } from "@/lib/core/settings";
import {
  checkDormTaxBuyer,
  createExternalTaxInvoice,
  DORM_TAX_BUYER_ADDRESS_MAX,
  DORM_TAX_BUYER_NAME_MAX,
  externalTaxInvoicesOf,
  externalTaxSeller,
  replaceExternalTaxInvoice,
  type DormTaxBuyer,
} from "@/lib/modules/account";
import type { BillingCtx } from "./billing";

type Fail = { ok: false; code: string; reason: string };
type Vals = Record<string, unknown>;
type Action = "dorm.view" | "dorm.bill.send";
type G = { tenantId: string; unitId: string; unitName: string; actorUserId: string | null };

export type TaxInvoiceView = {
  billId: string;
  roomNumber: string;
  periodKey: string;
  invoiceDocNo: string | null;
  docId: string;
  docNo: string | null;
  status: "ISSUED" | "VOIDED";
  issueDate: string;
  form: "FULL";
  seller: { name: string; taxId: string; branchLabel: string; address: string | null };
  buyer: { name: string; taxId: string | null; branchLabel: string | null; address: string; kind: "PERSON" | "COMPANY" };
  lines: { code: string; description: string; netSatang: number; vatSatang: number; grossSatang: number }[];
  subTotalSatang: number;
  vatSatang: number;
  totalSatang: number;
  pricesIncludeVat: boolean;
  replaces: { docNo: string | null; issueDate: string; reason: string } | null;
  history: { docId: string; docNo: string | null; status: string; issueDate: string }[];
};

const SENTISH = ["SENT", "PARTIALLY_PAID", "PAID"];
const DEAD = ["VOIDED", "CANCELLED"];
const KEY_MAX = 100;
const fail = (code: string, reason: string): Fail => ({ ok: false, code, reason });
const NOT_FOUND = (): Fail => fail("NOT_FOUND", "ไม่พบหอพักหรือบิลนี้");
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNat = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const realLen = (v: string): number => [...v.replace(/\s+/g, "")].length;
const snapValuesOf = (v: unknown): Vals | null => (isRec(v) && isRec(v.values) ? (v.values as Vals) : null);
export const branchLabelOf = (code: string | null | undefined): string => {
  const c = (code ?? "").trim() || "00000";
  return c === "00000" ? "สำนักงานใหญ่" : `สาขาที่ ${c}`;
};

// ───────────────────────── ด่าน (หน่วย DORM ของร้าน → Membership สด → สิทธิ์) ─────────────────────────
async function gateOf(ctx: unknown, unitId: unknown, need: Action): Promise<G | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId)) return null;
  const tenantId = ctx.tenantId;
  const tdb = tenantDb({ tenantId });
  const unit = await tdb.businessUnit.findFirst({ where: { id: unitId, type: "DORM", status: "ACTIVE" }, select: { id: true, name: true } });
  if (!unit) return null;
  const mem = await tdb.membership.findFirst({
    where: { tenantId, userId: ctx.actorUserId, acceptedAt: { not: null } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  if (!mem) return null;
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  if (!evaluate(m, { module: "dorm", action: need, unitId: unit.id })) return null;
  return { tenantId, unitId: unit.id, unitName: unit.name, actorUserId: ctx.actorUserId };
}

const BILL_SELECT = {
  id: true,
  roomId: true,
  partyId: true,
  periodKey: true,
  status: true,
  lines: true,
  vatSatang: true,
  accountDocumentId: true,
  policySnapshot: true,
} as const;
type BillRow = { id: string; roomId: string; partyId: string; periodKey: string; status: string; lines: Prisma.JsonValue; vatSatang: number; accountDocumentId: string | null; policySnapshot: Prisma.JsonValue };
async function readBill(g: G, billId: unknown): Promise<BillRow | null> {
  if (!isStr(billId)) return null;
  return tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormBill.findFirst({ where: { id: billId }, select: BILL_SELECT });
}
const vatOfBill = (b: { policySnapshot: Prisma.JsonValue }) => {
  const v = snapValuesOf(b.policySnapshot) ?? {};
  return { registered: v["rooms.vat.registered"] === true, pricesIncludeVat: v["rooms.vat.pricesIncludeVat"] !== false };
};
type BillLine = { code: string; taxKind: string; netSatang: number; vatSatang: number; grossSatang: number };
const vatLinesOf = (v: Prisma.JsonValue): BillLine[] =>
  Array.isArray(v)
    ? v.filter((x): x is Prisma.JsonObject => isRec(x) && typeof x.code === "string" && x.taxKind === "VAT7").map((x) => ({
        code: String(x.code),
        taxKind: "VAT7",
        netSatang: isNat(x.netSatang) ? x.netSatang : 0,
        vatSatang: isNat(x.vatSatang) ? x.vatSatang : 0,
        grossSatang: isNat(x.grossSatang) ? x.grossSatang : 0,
      }))
    : [];

// ───────────────────────── ผู้ซื้อ (ม.86/4(3)) ─────────────────────────
export type BuyerOverride = { name?: string; address?: string | null; taxId?: string | null; branchCode?: string | null } | null | undefined;
/** ปัญหาผู้ซื้อที่ต้องแก้ข้อมูลผู้เช่าก่อน — รหัสพักบิล (ขึ้นต้น BUYER_TAX_ID_INVALID เสมอ) */
export type BuyerProblem = { holdCode: "BUYER_TAX_ID_INVALID" | "BUYER_TAX_ID_INVALID:BRANCH" | "BUYER_TAX_ID_INVALID:OTHER"; reason: string };
type PartyTax = { name: string; address: string | null; taxId: string | null; branchCode: string | null; kind: string } | null;

/**
 * (T1) จัดรูปผู้ซื้อจาก Party (+ override) แล้วตรวจด้วยตัวตรวจชุดเดียวกับ facade บัญชี (checkDormTaxBuyer) — ล้วน ไม่แตะฐาน
 *   จัดรูปที่ทำได้โดยไม่เปลี่ยนความหมาย: ชื่อ > 300 ⇒ ตัด · ที่อยู่ > 500 ⇒ ตัด · สาขาตัวเลข 1–4 หลัก ⇒ เติม 0 หน้าให้ครบ 5 · ว่าง = 00000
 *   ที่เหลือ (เลขผิด checksum · สาขาไม่ใช่ตัวเลข/เกิน 5 หลัก) ⇒ problem (ผู้เรียกพักบิล/ปฏิเสธก่อนออกใบใด ๆ)
 */
function buyerFromParty(party: PartyTax, fallbackAddress: string, override?: BuyerOverride): { buyer: DormTaxBuyer; problem: BuyerProblem | null } {
  const o = override ?? {};
  const cut = (v: string, n: number) => v.slice(0, n).trim();
  const name = cut((typeof o.name === "string" && o.name.trim() ? o.name : (party?.name ?? "")).trim(), DORM_TAX_BUYER_NAME_MAX) || "ผู้เช่า";
  const addrOverride = typeof o.address === "string" ? o.address.trim() : "";
  const address = cut(addrOverride || party?.address?.trim() || fallbackAddress, DORM_TAX_BUYER_ADDRESS_MAX) || fallbackAddress;
  const rawTax = ((o.taxId !== undefined ? o.taxId : party?.taxId) ?? "").trim();
  const rawBranch = ((o.branchCode !== undefined ? o.branchCode : party?.branchCode) ?? "").trim();
  const branch = /^\d{1,5}$/.test(rawBranch) ? rawBranch.padStart(5, "0") : rawBranch;
  const kind: "PERSON" | "COMPANY" = party?.kind === "COMPANY" ? "COMPANY" : "PERSON";
  const c = checkDormTaxBuyer({ name, address, taxId: rawTax || null, branchCode: branch || null, kind });
  if (c.ok) return { buyer: c.buyer, problem: null };
  const holdCode = c.code === "BUYER_TAX_ID_INVALID" ? "BUYER_TAX_ID_INVALID" : rawTax ? "BUYER_TAX_ID_INVALID:BRANCH" : "BUYER_TAX_ID_INVALID:OTHER";
  return { buyer: { name, address, taxId: null, branchCode: null, kind }, problem: { holdCode, reason: c.reason } };
}

/**
 * ผู้ซื้อของบิล ณ ตอนนี้ (Party ของสัญญา) — `bad` = ข้อมูลผู้ซื้อไม่ผ่านตัวตรวจของ facade (ผู้เรียกพัก/ปฏิเสธก่อนออกใบใด ๆ)
 *   override = ทับเฉพาะช่องที่ส่ง (ใบแทน) · ไม่แก้ Party
 */
export async function taxBuyerOf(
  tenantId: string,
  unitId: string,
  unitName: string,
  bill: { partyId: string; roomId: string },
  override?: BuyerOverride,
): Promise<{ buyer: DormTaxBuyer; bad: boolean; problem: BuyerProblem | null }> {
  const party = await tenantDb({ tenantId }).party.findFirst({
    where: { id: bill.partyId },
    select: { name: true, address: true, taxId: true, branchCode: true, kind: true },
  });
  const room = await tenantDb({ tenantId, unitId }).hotelRoom.findFirst({ where: { id: bill.roomId }, select: { number: true } });
  const fallback = `ห้อง ${room?.number ?? ""} ${unitName}`.replace(/\s+/g, " ").trim();
  const r = buyerFromParty(party ? { ...party, kind: String(party.kind) } : null, fallback, override);
  return { buyer: r.buyer, bad: !!r.problem, problem: r.problem };
}

/** Party ที่ข้อมูลผู้ซื้อไม่ผ่านตัวตรวจ (ใช้ตอนคำนวณรอบ — พักบิล) ⇒ partyId → รหัสพัก */
export async function badBuyerTaxIds(tenantId: string, partyIds: string[]): Promise<Map<string, BuyerProblem["holdCode"]>> {
  const out = new Map<string, BuyerProblem["holdCode"]>();
  const uniq = [...new Set(partyIds)];
  if (!uniq.length) return out;
  const rows = await tenantDb({ tenantId }).party.findMany({
    where: { id: { in: uniq } },
    select: { id: true, name: true, address: true, taxId: true, branchCode: true, kind: true },
  });
  for (const p of rows) {
    const r = buyerFromParty({ ...p, kind: String(p.kind) }, "ห้องที่เช่า");
    if (r.problem) out.set(p.id, r.problem.holdCode);
  }
  return out;
}

/** ด่านผู้ขาย: หอจด VAT (ค่าตั้งปัจจุบัน) + สมุดจด VAT + เลขผู้เสียภาษีผู้ขายไม่ครบ ⇒ ข้อความ (ไม่ผูกสมุด/ไม่จด = null — ทางเดิมของ D.8 จัดการ) */
export async function sellerTaxProblem(tenantId: string, unitId: string): Promise<{ code: "SELLER_TAX_ID_MISSING"; messageTh: string } | null> {
  const [r] = await resolveSettingsMany({ tenantId }, ["rooms.vat.registered"], [{ unitId }]);
  if (r?.["rooms.vat.registered"]?.value !== true) return null;
  const s = await externalTaxSeller({ tenantId, unitId });
  if (!s.ok || !s.vatRegistered || s.taxIdValid) return null;
  return {
    code: "SELLER_TAX_ID_MISSING",
    messageTh: "หอจด VAT แต่ยังไม่ได้กรอกเลขประจำตัวผู้เสียภาษีของกิจการ (13 หลัก) ในตั้งค่าบัญชี — ออกใบกำกับภาษีไม่ได้ (ม.86/4) กรอกก่อนแล้วส่งบิล",
  };
}

/** ใบกำกับที่ยังมีผลของหอ (T6: source DORM · refType DormBillTax · ไม่ใช่ใบต่อการรับเงิน · พ้นร่าง) ของใบแจ้งหนี้แต่ละใบ (อ่านอย่างเดียว · ทุกสมุดของร้าน) */
export async function liveTaxInvoicesFor(tenantId: string, invoiceIds: string[]): Promise<Map<string, { docId: string; docNo: string | null; status: string }>> {
  const out = new Map<string, { docId: string; docNo: string | null; status: string }>();
  const ids = [...new Set(invoiceIds.filter(isStr))];
  if (!ids.length) return out;
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; docNo: string | null; status: string; sourceDocId: string }[]>`
    SELECT "id", "docNo", "status"::text AS "status", "sourceDocId" FROM "AccountDocument"
    WHERE "tenantId" = ${tenantId} AND "docType"::text = 'TAX_INVOICE' AND "sourceDocId" = ANY(${ids})
      AND "source"::text = 'DORM' AND "refType" = 'DormBillTax' AND "sourcePaymentId" IS NULL AND "status"::text NOT IN ('DRAFT', 'VOIDED', 'CANCELLED')
    ORDER BY "createdAt" ASC`;
  for (const r of rows) if (!out.has(r.sourceDocId)) out.set(r.sourceDocId, { docId: r.id, docNo: r.docNo, status: r.status });
  return out;
}

/** ออกใบกำกับของบิลที่ส่งแล้ว (ทางเดียวของหอ — ส่งบิล D.8 · ทางกู้ §3.3) · ผลของ facade ส่งต่อตรงตัว */
export async function issueTaxForBill(
  g: { tenantId: string; unitId: string; unitName: string; actorUserId: string | null },
  input: { invoiceId: string; partyId: string; roomId: string; buyer?: DormTaxBuyer },
): Promise<{ ok: true; docId: string; docNo: string | null; created: boolean; vatSatang: number; totalSatang: number } | Fail> {
  let buyer = input.buyer;
  if (!buyer) {
    const tb = await taxBuyerOf(g.tenantId, g.unitId, g.unitName, { partyId: input.partyId, roomId: input.roomId });
    if (tb.problem) return fail("BUYER_TAX_ID_INVALID", `${tb.problem.reason} — แก้ข้อมูลผู้เช่าก่อนแล้วออกใบกำกับภาษีอีกครั้ง`);
    buyer = tb.buyer;
  }
  const r = await createExternalTaxInvoice({ tenantId: g.tenantId, unitId: g.unitId, sourceDocId: input.invoiceId, buyer, createdById: g.actorUserId });
  if (!r.ok) return fail(r.code, r.reason);
  return { ok: true, docId: r.docId, docNo: r.docNo, created: r.created, vatSatang: r.vatSatang, totalSatang: r.totalSatang };
}

// ───────────────────────── §3.2 อ่าน ─────────────────────────
export async function billTaxInvoice(ctx: BillingCtx, input: { unitId: string; billId: string; docId?: string }): Promise<TaxInvoiceView | null> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.view");
    if (!g) return null;
    const b = await readBill(g, input.billId);
    if (!b || !b.accountDocumentId) return null;
    const rows = await externalTaxInvoicesOf({ tenantId: g.tenantId, unitId: g.unitId, sourceDocId: b.accountDocumentId });
    if (!rows.length) return null;
    const cur = isStr(input.docId) ? rows.find((r) => r.docId === input.docId) : rows.find((r) => !DEAD.includes(r.status));
    if (!cur) return null;
    const seller = cur.seller ? { ok: false as const } : await externalTaxSeller({ tenantId: g.tenantId, unitId: g.unitId });
    const room = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).hotelRoom.findFirst({ where: { id: b.roomId }, select: { number: true } });
    const inv = await tenantDb({ tenantId: g.tenantId }).$queryRaw<{ docNo: string | null }[]>`
      SELECT "docNo" FROM "AccountDocument" WHERE "tenantId" = ${g.tenantId} AND "id" = ${b.accountDocumentId} LIMIT 1`;
    const bl = vatLinesOf(b.lines);
    const pred = rows.find((r) => r.replacedById === cur.docId) ?? null;
    return {
      billId: b.id,
      roomNumber: room?.number ?? "",
      periodKey: b.periodKey,
      invoiceDocNo: inv[0]?.docNo ?? null,
      docId: cur.docId,
      docNo: cur.docNo,
      status: DEAD.includes(cur.status) ? "VOIDED" : "ISSUED",
      issueDate: cur.issueDate,
      form: "FULL",
      // (T3) ผู้ขายที่ตรึงไว้ในใบ (ตอนออก) ก่อนเสมอ · ใบเก่าที่ยังไม่ได้ตรึง ⇒ ตั้งค่าสมุดปัจจุบัน
      seller: cur.seller
        ? { name: cur.seller.name, taxId: cur.seller.taxId ?? "", branchLabel: branchLabelOf(cur.seller.branchCode), address: cur.seller.address }
        : seller.ok
          ? { name: seller.name, taxId: seller.taxId ?? "", branchLabel: seller.branchLabel, address: seller.address }
          : { name: "", taxId: "", branchLabel: "สำนักงานใหญ่", address: null },
      buyer: {
        name: cur.buyer.name,
        taxId: cur.buyer.taxId,
        branchLabel: cur.buyer.taxId ? branchLabelOf(cur.buyer.branchCode) : null,
        address: cur.buyer.address ?? "",
        kind: cur.buyer.legalType === "COMPANY" ? "COMPANY" : "PERSON",
      },
      lines: cur.lines.map((l, i) => {
        const x = bl[i];
        return { code: x?.code ?? `LINE_${i + 1}`, description: l.description, netSatang: x?.netSatang ?? 0, vatSatang: x?.vatSatang ?? 0, grossSatang: x?.grossSatang ?? l.amountSatang };
      }),
      subTotalSatang: cur.subTotalSatang,
      vatSatang: cur.vatSatang,
      totalSatang: cur.totalSatang,
      pricesIncludeVat: vatOfBill(b).pricesIncludeVat,
      replaces: pred ? { docNo: pred.docNo, issueDate: pred.issueDate, reason: pred.voidReason ?? "" } : null,
      history: rows.map((r) => ({ docId: r.docId, docNo: r.docNo, status: DEAD.includes(r.status) ? "VOIDED" : "ISSUED", issueDate: r.issueDate })),
    };
  } catch {
    return null;
  }
}

// ───────────────────────── §3.3 ออก (ทางกู้) ─────────────────────────
export async function issueBillTaxInvoice(
  ctx: BillingCtx,
  input: { unitId: string; billId: string },
): Promise<{ ok: true; docId: string; docNo: string | null; created: boolean; vatSatang: number; totalSatang: number } | Fail> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.bill.send");
    if (!g) return NOT_FOUND();
    const b = await readBill(g, input.billId);
    if (!b) return NOT_FOUND();
    if (!SENTISH.includes(b.status) || !b.accountDocumentId) return fail("NOT_SENT", "บิลนี้ยังไม่ได้ส่ง (ยังไม่มีใบแจ้งหนี้) — ส่งบิลก่อน ระบบออกใบกำกับภาษีให้พร้อมกัน");
    if (!vatOfBill(b).registered) return fail("NOT_VAT_REGISTERED", "บิลนี้ออกตอนหอยังไม่จดทะเบียน VAT — ไม่มีใบกำกับภาษี");
    if (b.vatSatang <= 0) return fail("NO_VAT_LINES", "บิลนี้ไม่มีรายการที่มี VAT (ค่าเช่าที่อยู่อาศัยได้รับยกเว้น) — ไม่ต้องออกใบกำกับภาษี");
    return await issueTaxForBill(g, { invoiceId: b.accountDocumentId, partyId: b.partyId, roomId: b.roomId });
  } catch {
    return fail("INTERNAL", "ระบบขัดข้องชั่วคราว — ลองใหม่อีกครั้ง");
  }
}

// ───────────────────────── §3.4 ออกใบใหม่แทน ─────────────────────────
export async function reissueBillTaxInvoice(
  ctx: BillingCtx,
  input: { unitId: string; billId: string; reason: string; idempotencyKey: string; buyer?: { name?: string; address?: string | null; taxId?: string | null; branchCode?: string | null } | null },
  deps?: { now?: Date },
): Promise<{ ok: true; docId: string; docNo: string | null; created: boolean; replacedDocId: string; replacedDocNo: string | null; issueDate: string } | Fail> {
  try {
    const g = await gateOf(ctx, isRec(input) ? input.unitId : null, "dorm.bill.send");
    if (!g) return NOT_FOUND();
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (realLen(reason) < 10) return fail("REASON_REQUIRED", "กรุณาระบุเหตุผลการยกเลิกและออกใบกำกับภาษีฉบับใหม่อย่างน้อย 10 ตัวอักษร (เก็บเป็นหลักฐาน)");
    const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (!key || key.length > KEY_MAX) return fail("INVALID_INPUT", "ต้องมีคีย์กันซ้ำของการออกใบแทน (1–100 ตัวอักษร)");
    if (input.buyer !== undefined && input.buyer !== null && !isRec(input.buyer)) return fail("INVALID_INPUT", "ข้อมูลผู้ซื้อไม่ถูกต้อง");
    const b = await readBill(g, input.billId);
    if (!b) return NOT_FOUND();
    if (!b.accountDocumentId) return fail("NO_TAX_INVOICE", "บิลนี้ยังไม่มีใบกำกับภาษี — ไม่มีอะไรให้ออกแทน");
    const rows = await externalTaxInvoicesOf({ tenantId: g.tenantId, unitId: g.unitId, sourceDocId: b.accountDocumentId });
    const live = rows.find((r) => !DEAD.includes(r.status));
    if (!live) return fail("NO_TAX_INVOICE", "บิลนี้ยังไม่มีใบกำกับภาษีที่ยังมีผล — ไม่มีอะไรให้ออกแทน");
    const tb = await taxBuyerOf(g.tenantId, g.unitId, g.unitName, { partyId: b.partyId, roomId: b.roomId }, input.buyer ?? null);
    if (tb.problem) return fail("BUYER_TAX_ID_INVALID", tb.problem.reason);
    const [res] = await resolveSettingsMany({ tenantId: g.tenantId }, ["rooms.vat.reissueDate"], [{ unitId: g.unitId }]);
    const reissueDay = res?.["rooms.vat.reissueDate"]?.value === "REISSUE_DAY";
    const now = deps?.now instanceof Date ? deps.now : new Date();
    const r = await replaceExternalTaxInvoice({
      tenantId: g.tenantId,
      unitId: g.unitId,
      taxInvoiceDocId: live.docId,
      reason,
      idempotencyKey: key,
      buyer: tb.buyer,
      ...(reissueDay ? { issueDate: bkkYmd(now) } : {}),
      createdById: g.actorUserId,
    });
    if (!r.ok) return fail(r.code, r.reason);
    await auditReissue(g, b.id, r.replacedDocId, r.docId, reason); // (T4) ทุกครั้งที่ ok — กันซ้ำด้วยด่าน newDocId (เติมได้ถ้ารอบก่อนล้มหลังออกใบ)
    return { ok: true, docId: r.docId, docNo: r.docNo, created: r.created, replacedDocId: r.replacedDocId, replacedDocNo: r.replacedDocNo, issueDate: r.issueDate };
  } catch {
    return fail("INTERNAL", "ระบบขัดข้องชั่วคราว — ลองใหม่อีกครั้ง");
  }
}

/** audit 1 แถวต่อใบแทนที่สร้างจริง — after = id ล้วน + เหตุผล (ไม่มีชื่อ/เลขผู้ซื้อ · X8) */
async function auditReissue(g: G, billId: string, oldDocId: string, newDocId: string, reason: string): Promise<void> {
  try {
    const db = tenantDb({ tenantId: g.tenantId });
    const has = await db.auditLog.findFirst({
      where: { tenantId: g.tenantId, action: "dorm.taxinvoice.reissued", targetId: billId, after: { path: ["newDocId"], equals: newDocId } },
      select: { id: true },
    });
    if (has) return;
    await db.auditLog.create({
      data: {
        tenantId: g.tenantId,
        actorType: g.actorUserId ? "USER" : "SYSTEM",
        actorId: g.actorUserId,
        action: "dorm.taxinvoice.reissued",
        targetType: "DormBill",
        targetId: billId,
        after: { billId, oldDocId, newDocId, reason },
      },
    });
  } catch {
    // audit ล้มไม่ย้อนใบที่ออกแล้ว (เอกสารภาษีมีผลแล้ว) — ประวัติในบัญชี (voidReason · replacedById · note) ยังครบ
  }
}
