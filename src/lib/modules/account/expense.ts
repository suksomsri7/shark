import { prisma } from "@/lib/core/db";
import { safeReason } from "./errors";
import type {
  AccountDocType,
  AccountDocStatus,
  AccountVatMode,
  AccountVatTiming,
  AccountPayChannel,
  AccountWhtIncomeType,
  AccountLegalType,
  AccountDocSource,
  Prisma,
} from "@prisma/client";
// posting engine (owner = GL-P2P3, ไฟล์ gl.ts) — subagent P2 แค่ import + เรียกตามลายเซ็น
import { ensureAccounting, postDocument, postPayment, reverseFor } from "./gl";
// reuse (read-only) helper จาก service P1 — ห้ามแก้ service.ts
import {
  computeTotals,
  lineAmount,
  getSettings,
  STATUS_LABEL,
  isOverdue,
  overdueWhere,
  parseDay,
  clampPageSize,
  clampPage,
  baht,
  type LineInput,
  type DocStatusFilter,
  type DocSort,
} from "./service";
// WO 8.1 — เครื่องออกเลขที่เอกสารร่วม (ที่เดียวทั้งรายรับ/รายจ่าย) + ตารางคำนำหน้ากลาง
import { issueDocNo, peekDocNo } from "./doc-numbering";
// WO 8.2 (§9.3) — ล็อกข้อมูลก่อนวันที่ + ค่าเริ่มต้นหัก ณ ที่จ่าย/การแปลงเอกสาร
import { assertNotLockedTx, assertNotLockedWith } from "./policy";
// WO C4 — เหตุการณ์บัญชีที่ออกทาง webhook (ตัวประกอบ payload + คีย์กันซ้ำอยู่ที่ events.ts ที่เดียว)
import { emitDocumentApproved, emitDocumentIssued, emitDocumentVoided, emitPaymentVoided } from "./events";
import { EXPENSE_DOC_PREFIX, fallbackPrefixOf } from "./settings-schema";
import { clampSearch } from "./search-input";

// ─────────────────────────────────────────────────────────────
// expense.ts — ฝั่งรายจ่าย (P2) direction=IN
// docType: PURCHASE EXPENSE PURCHASE_ORDER ASSET_PURCHASE_ORDER ASSET_PURCHASE
//          PURCHASE_TAX_INVOICE DEPOSIT_PAYMENT CREDIT_NOTE_RECEIVED
//          DEBIT_NOTE_RECEIVED COMBINED_PAYMENT (+ WHT_CERT auto)
// สร้างเอกสาร → โพสต์ผ่าน gl.postDocument/postPayment (§3.2, §7.10, F5)
// เอกสารเงิน immutable: DRAFT แก้ได้ · พ้น DRAFT → void/reissue
// ─────────────────────────────────────────────────────────────

export { STATUS_LABEL, isOverdue };

// ─────────────────── ทะเบียน docType ฝั่งจ่าย ───────────────────

// WO 8.1: ตารางจริงย้ายไป settings-schema.ts (หน้าตั้งค่า/เครื่องออกเลขต้องใช้ร่วมกับฝั่งรายรับ)
export const EXP_DOC_PREFIX = EXPENSE_DOC_PREFIX;

export const EXP_DOC_LABEL: Partial<Record<AccountDocType, string>> = {
  PURCHASE: "บันทึกซื้อสินค้า",
  EXPENSE: "บันทึกค่าใช้จ่าย",
  PURCHASE_ORDER: "ใบสั่งซื้อ (PO)",
  ASSET_PURCHASE_ORDER: "ใบสั่งซื้อสินทรัพย์",
  ASSET_PURCHASE: "ซื้อสินทรัพย์",
  PURCHASE_TAX_INVOICE: "ใบกำกับภาษีซื้อ",
  DEPOSIT_PAYMENT: "ใบจ่ายเงินมัดจำ",
  CREDIT_NOTE_RECEIVED: "รับใบลดหนี้",
  DEBIT_NOTE_RECEIVED: "รับใบเพิ่มหนี้",
  COMBINED_PAYMENT: "ใบรวมจ่าย",
  WHT_CERT: "หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)",
};

// ─────────────────── ทะเบียน route ฝั่งจ่าย (แหล่งเดียว · WO 1.2) ───────────────────
// docType ฝั่งจ่ายทุกชนิดที่ "มีหน้ารายการของตัวเอง" วันนี้ + route จริงใต้ /app/sys/<id>/account/
// ใช้ร่วมกันโดย: expense-page.tsx (SLUG_OF) · expense-actions.ts (ROUTE_FOR · redirect หลังบันทึก)
//   · expense-ui.tsx (ลิงก์เอกสารที่เกี่ยวข้อง) · ui.tsx (เอกสารล่าสุดหน้า hub) · guard.ts (ทะเบียนสิทธิ์)
//   · WO 1.1 (list-tabs.ts / DocListPage) วนลิสต์นี้ได้ตรง ๆ ไม่ต้องพิมพ์ docType ซ้ำ
// ⚠️ COMBINED_PAYMENT (ใบรวมจ่าย) ยังไม่มี route — เพิ่มเข้าลิสต์นี้ตอน WO 1.7 · WHT_CERT ใช้หน้า /wht (ไม่ใช่ list เอกสาร)
export type ExpenseListTypeDef = {
  docType: AccountDocType;
  /** path ใต้ `/app/sys/<systemId>/account/` (ไม่มี / นำหน้า) */
  route: string;
  label: string;
  prefix: string;
};

export const EXPENSE_LIST_TYPES: readonly ExpenseListTypeDef[] = [
  { docType: "PURCHASE_ORDER", route: "po", label: "ใบสั่งซื้อ (PO)", prefix: "PO" },
  { docType: "ASSET_PURCHASE_ORDER", route: "asset-po", label: "ใบสั่งซื้อสินทรัพย์", prefix: "APO" },
  { docType: "DEPOSIT_PAYMENT", route: "deposit-payment", label: "ใบจ่ายเงินมัดจำ", prefix: "DP" },
  { docType: "PURCHASE", route: "purchase", label: "บันทึกซื้อสินค้า", prefix: "PC" },
  { docType: "EXPENSE", route: "expense", label: "บันทึกค่าใช้จ่าย", prefix: "EX" },
  { docType: "ASSET_PURCHASE", route: "asset-buy", label: "ซื้อสินทรัพย์", prefix: "AP" },
  { docType: "PURCHASE_TAX_INVOICE", route: "purchase-tax-invoice", label: "ใบกำกับภาษีซื้อ", prefix: "PTX" },
  { docType: "CREDIT_NOTE_RECEIVED", route: "credit-note-received", label: "รับใบลดหนี้", prefix: "CNR" },
  { docType: "DEBIT_NOTE_RECEIVED", route: "debit-note-received", label: "รับใบเพิ่มหนี้", prefix: "DNR" },
  // WO 1.7 — ใบรวมจ่าย (ฟอร์มพิเศษ §5.2 K: เลือกผู้ขาย → ติ๊กบิลค้างจ่าย → จ่ายครั้งเดียวกระจายให้ใบลูก)
  { docType: "COMBINED_PAYMENT", route: "combined-payment", label: "ใบรวมจ่าย", prefix: "CP" },
];

/** docType → route (ตัวเดียวกับ EXPENSE_LIST_TYPES · ห้ามพิมพ์แมปซ้ำที่อื่น) */
export const EXP_ROUTE: Partial<Record<AccountDocType, string>> = Object.fromEntries(
  EXPENSE_LIST_TYPES.map((t) => [t.docType, t.route]),
) as Partial<Record<AccountDocType, string>>;

/** variant ของฟอร์ม/ตัวเลือกบัญชีต่อ docType (ใช้โดย route + expense-page) */
export type ExpVariant = "purchase" | "expense" | "po" | "asset";
export function variantFor(docType: AccountDocType): ExpVariant {
  if (docType === "EXPENSE") return "expense";
  if (docType === "PURCHASE_ORDER" || docType === "ASSET_PURCHASE_ORDER") return "po";
  if (docType === "ASSET_PURCHASE" || docType === "PURCHASE_TAX_INVOICE") return "asset";
  return "purchase"; // PURCHASE · DEPOSIT_PAYMENT · CNR · DNR (ลงบัญชีจาก mapping กลาง ไม่ใช่บัญชีราย line)
}

// ประเภทเงินได้ ม.40 (50 ทวิ) — label สำหรับ picker
export const WHT_INCOME_LABEL: Record<AccountWhtIncomeType, string> = {
  M40_1: "40(1) เงินเดือน/ค่าจ้าง",
  M40_2: "40(2) ค่านายหน้า/รับจ้างทำงาน",
  M40_3: "40(3) ค่าลิขสิทธิ์/goodwill",
  M40_4: "40(4) ดอกเบี้ย/เงินปันผล",
  M40_5: "40(5) ค่าเช่าทรัพย์สิน",
  M40_6: "40(6) วิชาชีพอิสระ",
  M40_7: "40(7) รับเหมา",
  M40_8: "40(8) บริการ/อื่นๆ",
};

// docType ฝั่งจ่ายที่โพสต์ตอน issue → AWAITING_PAYMENT (ตั้งเจ้าหนี้)
const PAYABLE_TYPES: readonly AccountDocType[] = [
  "PURCHASE",
  "EXPENSE",
  "ASSET_PURCHASE",
  "DEPOSIT_PAYMENT",
];
// docType ที่โพสต์ตอน issue แล้วจบเป็น ISSUED (adjust)
const ADJUST_TYPES: readonly AccountDocType[] = [
  "CREDIT_NOTE_RECEIVED",
  "DEBIT_NOTE_RECEIVED",
];

// สถานะเมื่อ "บันทึก/ออก" ต่อชนิด
function issueStatusFor(docType: AccountDocType): AccountDocStatus {
  if (ADJUST_TYPES.includes(docType)) return "ISSUED";
  return "AWAITING_PAYMENT";
}

// ─────────────────── VAT ซื้อ 3 โหมด (§3.2) ───────────────────
// CLAIM   = มีใบกำกับ เคลมได้ทันที → Dr 1150 (vatTiming ON_ISSUE)
// AWAITING= ยังไม่รับใบกำกับ → Dr 1155 รอ (vatTiming ON_PAYMENT) + สร้าง PTX รอรับ
// NO_CLAIM= เคลมไม่ได้ (ABB/ค่ารับรอง/รถนั่ง) → VAT รวมเป็นต้นทุน (vatMode NONE)
export type VatPurchaseMode = "CLAIM" | "AWAITING" | "NO_CLAIM";

function vatFieldsFor(
  mode: VatPurchaseMode,
  reqVatMode: AccountVatMode,
): { vatMode: AccountVatMode; vatTiming: AccountVatTiming } {
  if (mode === "NO_CLAIM") return { vatMode: "NONE", vatTiming: "ON_ISSUE" };
  if (mode === "AWAITING") return { vatMode: reqVatMode, vatTiming: "ON_PAYMENT" };
  return { vatMode: reqVatMode, vatTiming: "ON_ISSUE" };
}

// ─────────────────── เลขรันเอกสาร (จองใน tx) ───────────────────
//
// 🔴 WO 8.1: เดิมไฟล์นี้มีสูตรของตัวเอง ซึ่งพัง 2 อย่าง
//    (1) ไม่อ่านตั้งค่าเลย ⇒ คำนำหน้า/รูปแบบ/นโยบายรีเซ็ตที่เจ้าของตั้งไว้ ไม่มีผลกับเอกสารรายจ่ายเลย
//    (2) ใช้ `date.getFullYear()/getMonth()` = TZ ของเครื่อง ⇒ บนเซิร์ฟเวอร์ UTC เอกสารที่ออกช่วง
//        00:00–07:00 เวลาไทยของวันที่ 1 จะถูกนับเป็นเดือนก่อน (เลขรันข้ามงวด)
//    ⇒ เรียก doc-numbering.ts ตัวเดียวกับฝั่งรายรับ

async function nextDocNo(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  date: Date,
): Promise<string> {
  return issueDocNo(tx, {
    tenantId,
    systemId,
    docType,
    fallbackPrefix: fallbackPrefixOf(docType),
    date,
  });
}

/**
 * เลขที่ "ถัดไป" ฝั่งรายจ่าย แบบดูอย่างเดียว (WO 1.3 · §5.2 B)
 * 🔴 อ่านอย่างเดียว ห้าม upsert — ร่างต้องไม่กินเลข (เลขจริงจองใน issueExpenseDoc/tx เท่านั้น)
 */
export async function previewNextExpenseDocNo(
  systemId: string,
  docType: AccountDocType,
  date: Date,
): Promise<string> {
  return peekDocNo(prisma, {
    systemId,
    docType,
    fallbackPrefix: fallbackPrefixOf(docType),
    date,
  });
}

// ─────────────────── list + filter tabs (§3.0.3) ───────────────────

export type ExpTab =
  | "recent"
  | "awaiting"
  | "paid"
  | "overdue"
  | "deduct"
  | "received"
  | "approved"
  | "awaiting_approval"
  | "awaiting_receive"
  | "all";

// แท็บที่แต่ละ docType แสดง (ตาม §3.0.3)
export function tabsFor(docType: AccountDocType): { key: ExpTab; label: string }[] {
  const recent = { key: "recent" as ExpTab, label: "ล่าสุด" };
  const all = { key: "all" as ExpTab, label: "ทั้งหมด" };
  switch (docType) {
    case "PURCHASE":
    case "EXPENSE":
      return [
        recent,
        { key: "awaiting", label: "รอชำระ" },
        { key: "paid", label: "ชำระแล้ว" },
        { key: "overdue", label: "พ้นกำหนด" },
        all,
      ];
    case "ASSET_PURCHASE":
      return [
        recent,
        { key: "awaiting", label: "รอชำระ" },
        { key: "overdue", label: "พ้นกำหนด" },
        { key: "received", label: "รับใบเสร็จแล้ว" },
        all,
      ];
    case "DEPOSIT_PAYMENT":
      return [
        recent,
        { key: "awaiting", label: "รอชำระ" },
        { key: "overdue", label: "พ้นกำหนด" },
        { key: "deduct", label: "รอหักมัดจำ" },
        all,
      ];
    case "PURCHASE_ORDER":
    case "ASSET_PURCHASE_ORDER":
      return [
        recent,
        { key: "awaiting_approval", label: "รออนุมัติ" },
        { key: "approved", label: "อนุมัติแล้ว" },
        all,
      ];
    case "PURCHASE_TAX_INVOICE":
      return [
        recent,
        { key: "awaiting_receive", label: "รอรับ" },
        { key: "received", label: "รับแล้ว" },
        all,
      ];
    default: // CNR / DNR / COMBINED_PAYMENT
      return [recent, all];
  }
}

export async function listExpenseDocs(
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  opts?: { tab?: ExpTab; take?: number },
) {
  const tab = opts?.tab ?? "recent";
  const where: Prisma.AccountDocumentWhereInput = { tenantId, systemId, docType };
  switch (tab) {
    case "awaiting":
      where.status = { in: ["AWAITING_PAYMENT", "PARTIAL"] };
      break;
    case "paid":
      where.status = "PAID";
      break;
    case "deduct":
      where.status = "AWAITING_DEDUCT";
      break;
    case "received":
      where.status = "RECEIVED";
      break;
    case "approved":
      where.status = "APPROVED";
      break;
    case "awaiting_approval":
      where.status = "AWAITING_APPROVAL";
      break;
    case "awaiting_receive":
      where.status = "AWAITING_RECEIVE";
      break;
  }
  const rows = await prisma.accountDocument.findMany({
    where,
    orderBy: tab === "recent" ? { updatedAt: "desc" } : { issueDate: "desc" },
    take: opts?.take ?? 100,
    include: { contact: true },
  });
  if (tab === "overdue") return rows.filter((r) => isOverdue(r));
  return rows;
}

// ─── รายการเอกสารฝั่งจ่ายแบบกรอง/เรียง/แบ่งหน้า ฝั่ง server (WO 1.1 — analogous ของ service.ts:listDocumentsPaged) ───
// `listExpenseDocs` ด้านบนคงไว้เหมือนเดิม (ยังมี caller เก่าใช้) — ตัวนี้คือฟังก์ชันแยกสำหรับหน้ารายการ V2
// (DocListPage) ที่ต้องการ tabCounts + total + pageCount แบบเดียวกับฝั่งรายรับ ไม่ใช่ take-500-แล้ว-filter-ใน-JS

export type ListExpenseDocsInput = {
  docType: AccountDocType;
  status?: DocStatusFilter;
  q?: string;
  contactId?: string;
  from?: Date | string;
  to?: Date | string;
  page?: number;
  pageSize?: number;
  sort?: DocSort;
  excludeOverdue?: boolean;
};

export type ExpDocTabCounts = Partial<Record<AccountDocStatus, number>> & { ALL: number; OVERDUE: number };

export type ListExpenseDocsPage = {
  rows: Prisma.AccountDocumentGetPayload<{ include: { contact: { select: { id: true; name: true } } } }>[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  tabCounts: ExpDocTabCounts;
};

const EXP_SORT_ORDER: Record<DocSort, Prisma.AccountDocumentOrderByWithRelationInput[]> = {
  recent: [{ updatedAt: "desc" }, { id: "desc" }],
  issueDate: [{ issueDate: "desc" }, { id: "desc" }],
  docNo: [{ docNo: "desc" }, { id: "desc" }],
  amount: [{ grandTotal: "desc" }, { id: "desc" }],
};

export async function listExpenseDocsPaged(
  tenantId: string,
  systemId: string,
  input: ListExpenseDocsInput,
): Promise<ListExpenseDocsPage> {
  const now = new Date();
  const pageSize = clampPageSize(input.pageSize);
  const page = clampPage(input.page);
  const q = clampSearch(input.q);
  const from = parseDay(input.from, false);
  const to = parseDay(input.to, true);

  const base: Prisma.AccountDocumentWhereInput = {
    tenantId,
    systemId,
    docType: input.docType,
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(from || to ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { docNo: { contains: q, mode: "insensitive" as const } },
            { contact: { is: { name: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const status = input.status ?? "ALL";
  const statusWhere: Prisma.AccountDocumentWhereInput =
    status === "ALL"
      ? {}
      : status === "OVERDUE"
        ? overdueWhere(now)
        : Array.isArray(status)
          ? { status: { in: status } }
          : { status };

  const where: Prisma.AccountDocumentWhereInput = {
    AND: [base, statusWhere, ...(input.excludeOverdue ? [{ NOT: overdueWhere(now) }] : [])],
  };

  const [rows, total, grouped, overdueCount] = await Promise.all([
    prisma.accountDocument.findMany({
      where,
      include: { contact: { select: { id: true, name: true } } },
      orderBy: EXP_SORT_ORDER[input.sort ?? "recent"],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accountDocument.count({ where }),
    prisma.accountDocument.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.accountDocument.count({ where: { AND: [base, overdueWhere(now)] } }),
  ]);

  const tabCounts: ExpDocTabCounts = { ALL: 0, OVERDUE: overdueCount };
  for (const g of grouped) {
    tabCounts[g.status] = g._count._all;
    tabCounts.ALL += g._count._all;
  }

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(Math.ceil(total / pageSize), 1),
    tabCounts,
  };
}

export function getExpenseDoc(tenantId: string, systemId: string, id: string) {
  return prisma.accountDocument.findFirst({
    where: { id, tenantId, systemId },
    include: {
      lines: { orderBy: { sortOrder: "asc" }, include: { account: true } },
      payments: { where: { voidedAt: null }, orderBy: { paidAt: "asc" } },
      contact: true,
      relationsFrom: { include: { to: true } },
      relationsTo: { include: { from: true } },
    },
  });
}

// บัญชีค่าใช้จ่าย/ต้นทุน สำหรับ picker บรรทัด EXPENSE
export function listExpenseAccounts(systemId: string) {
  return prisma.accountLedger.findMany({
    where: { systemId, archivedAt: null, type: { in: ["EXPENSE", "COGS"] } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

// บัญชีสินทรัพย์ถาวร (16xx) สำหรับ ASSET_PURCHASE
export function listAssetAccounts(systemId: string) {
  return prisma.accountLedger.findMany({
    where: { systemId, archivedAt: null, type: "ASSET", code: { startsWith: "16" } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

// ─────────────────── สร้างเอกสาร (DRAFT) ───────────────────

export type ExpLineInput = LineInput & {
  accountId?: string | null; // EXPENSE: หมวดบัญชี · ASSET_PURCHASE: บัญชีสินทรัพย์
  productId?: string | null; // PURCHASE: อ้างสินค้า
};

// ─────────────────── มัดจำจ่าย (DP) → หักในบันทึกซื้อ/ค่าใช้จ่าย (§5.2 D) ───────────────────
// mirror ของฝั่งขาย (service.listDeductibleDeposits + depositAvailable) แต่เป็น DEPOSIT_PAYMENT
// ยอดที่ยังหักได้ = grandTotal ของใบมัดจำ − Σ relation DEPOSIT_APPLY ที่ยังไม่ถูกยกเลิก

async function paidDepositAvailable(
  db: Prisma.TransactionClient | typeof prisma,
  systemId: string,
  depositId: string,
  excludeToId?: string,
): Promise<number> {
  const dep = await db.accountDocument.findFirst({
    where: { id: depositId, systemId, docType: "DEPOSIT_PAYMENT" },
    select: { grandTotal: true },
  });
  if (!dep) return 0;
  const applies = await db.accountDocumentRelation.findMany({
    where: { systemId, fromId: depositId, type: "DEPOSIT_APPLY", ...(excludeToId ? { toId: { not: excludeToId } } : {}) },
    include: { to: { select: { status: true } } },
  });
  let used = 0;
  for (const r of applies)
    if (r.to.status !== "VOIDED" && r.to.status !== "CANCELLED") used += r.amount ?? 0;
  return Math.max(0, dep.grandTotal - used);
}

// ยอดที่ยังลดหนี้ได้ของเอกสารเดิม (CNR cap, WO 1.6) = grandTotal ต้นทาง (PUR/EXP) − ที่จ่ายแล้ว
// − Σ ใบรับลดหนี้ที่ออกแล้วอ้างต้นทางนี้ — mirror ของ `creditAvailable` ฝั่งขาย (service.ts) แต่คิดจาก AP แทน AR
export async function creditAvailableExpense(
  db: Prisma.TransactionClient | typeof prisma,
  systemId: string,
  sourceDocId: string,
  excludeId?: string,
): Promise<number> {
  const src = await db.accountDocument.findFirst({
    where: { id: sourceDocId, systemId },
    select: { grandTotal: true, paidTotal: true },
  });
  if (!src) return 0;
  const priorCnrs = await db.accountDocument.findMany({
    where: {
      systemId,
      docType: "CREDIT_NOTE_RECEIVED",
      sourceDocId,
      status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { grandTotal: true },
  });
  const used = priorCnrs.reduce((s, c) => s + c.grandTotal, 0);
  return Math.max(0, src.grandTotal - src.paidTotal - used);
}

/** WO 1.6 — เวอร์ชันไม่ต้องมี tx ให้ DocEditorPage เรียกแสดง "cap-line" ได้โดยไม่ต้อง import prisma เอง (F5) */
export function creditAvailableExpenseNow(systemId: string, sourceDocId: string, excludeId?: string): Promise<number> {
  return creditAvailableExpense(prisma, systemId, sourceDocId, excludeId);
}

export type DeductibleDeposit = {
  id: string;
  docNo: string | null;
  contactId: string | null;
  issueDate: Date;
  available: number;
  /** ยอดที่เอกสารที่กำลังแก้อยู่หักไว้แล้ว (WO 1.4 — ใช้เติมค่าเริ่มต้นใน modal) */
  appliedHere: number;
};

/**
 * ใบจ่ายเงินมัดจำที่ยังหักได้ (picker "เลือกเงินมัดจำ" §5.2 D ในฟอร์มบันทึกซื้อ/ค่าใช้จ่าย)
 * contactId = undefined → คืนทุกผู้ขาย (ฟอร์มกรองเองตามผู้ขายที่เลือก — ผู้ขายยังเปลี่ยนได้ระหว่างกรอก)
 */
export async function listDeductiblePaidDeposits(
  tenantId: string,
  systemId: string,
  contactId?: string,
  /** WO 1.4: เอกสารที่กำลังแก้ — ยอดที่ใบนี้หักไว้ไม่นับว่า "ถูกใช้ไปแล้ว" */
  excludeDocId?: string,
): Promise<DeductibleDeposit[]> {
  const deposits = await prisma.accountDocument.findMany({
    where: {
      tenantId,
      systemId,
      docType: "DEPOSIT_PAYMENT",
      status: "AWAITING_DEDUCT",
      ...(contactId ? { contactId } : {}),
    },
    select: { id: true, docNo: true, contactId: true, issueDate: true },
    orderBy: { issueDate: "asc" },
  });
  const out: DeductibleDeposit[] = [];
  for (const d of deposits) {
    const available = await paidDepositAvailable(prisma, systemId, d.id, excludeDocId);
    let appliedHere = 0;
    if (excludeDocId) {
      const here = await prisma.accountDocumentRelation.findFirst({
        where: { systemId, fromId: d.id, toId: excludeDocId, type: "DEPOSIT_APPLY" },
        select: { amount: true },
      });
      appliedHere = here?.amount ?? 0;
    }
    if (available > 0)
      out.push({ id: d.id, docNo: d.docNo, contactId: d.contactId, issueDate: d.issueDate, available, appliedHere });
  }
  return out;
}

/** docType ที่หักเงินมัดจำจ่ายได้ (ตาม §5.2 D: PUR/EXP ฝั่งจ่าย) */
const DEPOSIT_DEDUCTIBLE_TYPES: readonly AccountDocType[] = ["PURCHASE", "EXPENSE"];

/**
 * WO 1.4 §5.2 D (ฝั่งจ่าย) — ตั้ง "หักเงินมัดจำจ่าย" ของร่างใหม่ทั้งชุด (หลายใบ · บางส่วนได้)
 * กระจกของ `service.setDocDeposits` — กติกาเดียวกันเป๊ะ ต่างแค่ DEPOSIT_PAYMENT/ผู้ขาย
 */
export async function setExpenseDocDeposits(
  tenantId: string,
  systemId: string,
  docId: string,
  picks: { depositId: string; amountSatang: number }[],
): Promise<{ ok: true; depositDeducted: number; grandTotal: number } | { ok: false; reason: string }> {
  const settings = await getSettings(tenantId, systemId);
  try {
    const res = await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id: docId, tenantId, systemId },
        include: { lines: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status !== "DRAFT") throw new Error("เอกสารที่ออกแล้วแก้การหักมัดจำไม่ได้");
      if (!DEPOSIT_DEDUCTIBLE_TYPES.includes(doc.docType))
        throw new Error("เอกสารชนิดนี้หักเงินมัดจำไม่ได้");

      await tx.accountDocumentRelation.deleteMany({ where: { systemId, toId: docId, type: "DEPOSIT_APPLY" } });

      const lineInputs = doc.lines.map((l) => ({
        description: l.description,
        qty: Number(l.qty),
        unitPrice: l.unitPrice,
        discount: l.discount,
        vatRateBp: l.vatRateBp,
      }));
      const gross = computeTotals({
        lines: lineInputs,
        discountAmount: doc.discountAmount,
        depositDeducted: 0,
        vatMode: doc.vatMode,
        vatRegistered: settings.vatRegistered,
        vatRateBp: settings.vatRateBp,
      }).grandTotal;

      let total = 0;
      const seen = new Set<string>();
      for (const p of picks) {
        const amount = Math.round(p.amountSatang);
        if (amount <= 0) continue;
        if (seen.has(p.depositId)) throw new Error("เลือกใบมัดจำใบเดียวกันซ้ำ");
        seen.add(p.depositId);
        const dep = await tx.accountDocument.findFirst({
          where: { id: p.depositId, tenantId, systemId, docType: "DEPOSIT_PAYMENT" },
          select: { id: true, docNo: true, status: true, contactId: true },
        });
        if (!dep) throw new Error("ไม่พบใบจ่ายเงินมัดจำที่เลือก");
        if (dep.status !== "AWAITING_DEDUCT") throw new Error("ใบมัดจำที่เลือกไม่พร้อมใช้ (ต้องอยู่สถานะรอหักมัดจำ)");
        if (dep.contactId !== doc.contactId) throw new Error("ใบมัดจำไม่ใช่ของผู้ขายรายเดียวกัน");
        const avail = await paidDepositAvailable(tx, systemId, dep.id, docId);
        if (amount > avail) throw new Error(`ยอดหักเกินยอดคงเหลือของใบมัดจำ ${dep.docNo ?? ""}`);
        total += amount;
        await tx.accountDocumentRelation.create({
          data: { tenantId, systemId, fromId: dep.id, toId: docId, type: "DEPOSIT_APPLY", amount },
        });
      }
      if (total > gross) throw new Error("ยอดหักมัดจำรวมเกินยอดเอกสาร");

      const totals = computeTotals({
        lines: lineInputs,
        discountAmount: doc.discountAmount,
        depositDeducted: total,
        vatMode: doc.vatMode,
        vatRegistered: settings.vatRegistered,
        vatRateBp: settings.vatRateBp,
      });
      await tx.accountDocument.update({
        where: { id: docId },
        data: {
          depositDeducted: total,
          subTotal: totals.subTotal,
          vatAmount: totals.vatAmount,
          grandTotal: totals.grandTotal,
        },
      });
      return { depositDeducted: total, grandTotal: totals.grandTotal };
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกการหักมัดจำไม่สำเร็จ") };
  }
}

export async function createExpenseDoc(input: {
  tenantId: string;
  systemId: string;
  docType: AccountDocType;
  contactId?: string | null;
  issueDate?: Date;
  dueDate?: Date | null;
  vatMode?: AccountVatMode;
  vatPurchaseMode?: VatPurchaseMode;
  discountAmount?: number;
  note?: string | null;
  adjustReason?: string | null;
  sourceDocId?: string | null;
  /** ใบจ่ายเงินมัดจำ (DP) ที่จะหักในเอกสารนี้ — เฉพาะ PURCHASE/EXPENSE ของผู้ขายรายเดียวกัน */
  depositPaymentId?: string | null;
  lines: ExpLineInput[];
  createdById?: string | null;
  // ── WO 1.8 (นำเข้า CSV) · additive · optional — ไม่ส่ง = พฤติกรรมเดิมเป๊ะ (source MANUAL, tags []) ──
  source?: AccountDocSource;
  tags?: string[];
  refType?: string | null;
  refId?: string | null;
}) {
  const settings = await getSettings(input.tenantId, input.systemId);
  const reqVatMode: AccountVatMode = !settings.vatRegistered
    ? "NONE"
    : input.vatMode ?? "EXCLUDE";
  const purchaseMode: VatPurchaseMode = !settings.vatRegistered
    ? "NO_CLAIM"
    : input.vatPurchaseMode ?? "CLAIM";
  const { vatMode, vatTiming } = vatFieldsFor(purchaseMode, reqVatMode);
  const issueDate = input.issueDate ?? new Date();
  // §9.3 ล็อกข้อมูลก่อนวันที่ (ฝั่งรายจ่าย — กติกาเดียวกับฝั่งรายรับ)
  assertNotLockedWith(settings.policy.lockBeforeDate, issueDate);
  return prisma.$transaction(async (tx) => {
    // หักเงินมัดจำจ่าย — ใบมัดจำต้องเป็นของผู้ขายรายเดียวกัน + อยู่สถานะรอหักมัดจำ + ยังมียอดเหลือ
    let depositDeducted = 0;
    let depositDocId: string | null = null;
    if (input.depositPaymentId && DEPOSIT_DEDUCTIBLE_TYPES.includes(input.docType)) {
      const dep = await tx.accountDocument.findFirst({
        where: { id: input.depositPaymentId, systemId: input.systemId, docType: "DEPOSIT_PAYMENT" },
        select: { id: true, status: true, contactId: true },
      });
      if (dep && dep.status === "AWAITING_DEDUCT" && dep.contactId === (input.contactId ?? null)) {
        depositDeducted = await paidDepositAvailable(tx, input.systemId, dep.id);
        depositDocId = depositDeducted > 0 ? dep.id : null;
      }
    }
    const totals = computeTotals({
      lines: input.lines,
      discountAmount: input.discountAmount,
      depositDeducted,
      vatMode,
      vatRegistered: settings.vatRegistered,
      vatRateBp: settings.vatRateBp,
    });
    const doc = await tx.accountDocument.create({
      data: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        docType: input.docType,
        status: "DRAFT",
        direction: "IN",
        issueDate,
        dueDate: input.dueDate ?? null,
        contactId: input.contactId ?? null,
        vatMode,
        vatTiming,
        taxPointBasis: vatTiming,
        discountAmount: input.discountAmount ?? 0,
        depositDeducted,
        subTotal: totals.subTotal,
        vatAmount: totals.vatAmount,
        grandTotal: totals.grandTotal,
        note: input.note ?? null,
        adjustReason: input.adjustReason ?? null,
        sourceDocId: input.sourceDocId ?? null,
        createdById: input.createdById ?? null,
        source: input.source ?? "MANUAL",
        tags: input.tags ?? [],
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        lines: {
          create: input.lines.map((l, i) => ({
            tenantId: input.tenantId,
            systemId: input.systemId,
            sortOrder: i,
            description: l.description,
            qty: l.qty,
            unitName: l.unitName ?? null,
            unitPrice: l.unitPrice,
            discount: l.discount ?? 0,
            vatRateBp: l.vatRateBp ?? settings.vatRateBp,
            amount: lineAmount(l),
            accountId: l.accountId ?? null,
            productId: l.productId ?? null,
          })),
        },
      },
    });
    if (depositDocId && depositDeducted > 0) {
      await tx.accountDocumentRelation.create({
        data: {
          tenantId: input.tenantId,
          systemId: input.systemId,
          fromId: depositDocId,
          toId: doc.id,
          type: "DEPOSIT_APPLY",
          amount: depositDeducted,
        },
      });
    }
    // WO 1.6 §5.2 J — เอกสารอ้างอิงจาก wizard ขั้น ① (CNR/DNR) — mirror ของ service.ts createDocument
    if (input.sourceDocId && (input.docType === "CREDIT_NOTE_RECEIVED" || input.docType === "DEBIT_NOTE_RECEIVED")) {
      await tx.accountDocumentRelation.create({
        data: {
          tenantId: input.tenantId,
          systemId: input.systemId,
          fromId: input.sourceDocId,
          toId: doc.id,
          type: "ADJUST",
        },
      });
    }
    return doc;
  });
}

// แก้เอกสาร — DRAFT เท่านั้น
export async function updateExpenseDoc(
  tenantId: string,
  systemId: string,
  id: string,
  input: {
    contactId?: string | null;
    issueDate?: Date;
    dueDate?: Date | null;
    vatMode?: AccountVatMode;
    vatPurchaseMode?: VatPurchaseMode;
    discountAmount?: number;
    note?: string | null;
    adjustReason?: string | null;
    lines?: ExpLineInput[];
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const settings = await getSettings(tenantId, systemId);
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status !== "DRAFT") throw new Error("เอกสารที่ออกแล้วแก้ไขไม่ได้ — ใช้ยกเลิก/ออกใบใหม่");
      // §9.3: ล็อกทั้งวันที่เดิมและวันที่ใหม่ (กันย้ายเอกสารเข้า/ออกจากช่วงที่ล็อก)
      assertNotLockedWith(settings.policy.lockBeforeDate, doc.issueDate);
      if (input.issueDate) assertNotLockedWith(settings.policy.lockBeforeDate, input.issueDate);
      const reqVatMode: AccountVatMode = !settings.vatRegistered
        ? "NONE"
        : input.vatMode ?? doc.vatMode;
      const purchaseMode: VatPurchaseMode = !settings.vatRegistered
        ? "NO_CLAIM"
        : input.vatPurchaseMode ??
          (doc.vatMode === "NONE"
            ? "NO_CLAIM"
            : doc.vatTiming === "ON_PAYMENT"
              ? "AWAITING"
              : "CLAIM");
      const { vatMode, vatTiming } = vatFieldsFor(purchaseMode, reqVatMode);
      const discountAmount = input.discountAmount ?? doc.discountAmount;
      await tx.accountDocument.update({
        where: { id },
        data: {
          contactId: input.contactId === undefined ? doc.contactId : input.contactId,
          issueDate: input.issueDate ?? doc.issueDate,
          dueDate: input.dueDate === undefined ? doc.dueDate : input.dueDate,
          vatMode,
          vatTiming,
          taxPointBasis: vatTiming,
          discountAmount,
          note: input.note === undefined ? doc.note : input.note,
          adjustReason: input.adjustReason === undefined ? doc.adjustReason : input.adjustReason,
        },
      });
      if (input.lines) {
        await tx.accountDocumentLine.deleteMany({ where: { documentId: id } });
        await tx.accountDocumentLine.createMany({
          data: input.lines.map((l, i) => ({
            tenantId,
            systemId,
            documentId: id,
            sortOrder: i,
            description: l.description,
            qty: l.qty,
            unitName: l.unitName ?? null,
            unitPrice: l.unitPrice,
            discount: l.discount ?? 0,
            vatRateBp: l.vatRateBp ?? settings.vatRateBp,
            amount: lineAmount(l),
            accountId: l.accountId ?? null,
            productId: l.productId ?? null,
          })),
        });
      }
      const lines = await tx.accountDocumentLine.findMany({ where: { documentId: id } });
      const lineInputs = lines.map((l) => ({
        description: l.description,
        qty: Number(l.qty),
        unitPrice: l.unitPrice,
        discount: l.discount,
        vatRateBp: l.vatRateBp,
      }));
      // WO 1.2: ยอดหักมัดจำที่เลือกไว้ตอนสร้างต้องอยู่ในสูตรด้วย ไม่งั้นแก้ร่างแล้ว grandTotal เด้งกลับเป็นยอดก่อนหัก
      // (แก้บรรทัดจนยอดเอกสารเล็กกว่ามัดจำ → clamp ทั้งเอกสารและ relation ให้เท่ากัน กัน GL ไม่ balance ตอนออก)
      let depositDeducted = doc.depositDeducted;
      if (depositDeducted > 0) {
        const gross = computeTotals({
          lines: lineInputs,
          discountAmount,
          vatMode,
          vatRegistered: settings.vatRegistered,
          vatRateBp: settings.vatRateBp,
        }).grandTotal;
        if (depositDeducted > gross) {
          depositDeducted = gross;
          await tx.accountDocumentRelation.updateMany({
            where: { systemId, toId: id, type: "DEPOSIT_APPLY" },
            data: { amount: depositDeducted },
          });
        }
      }
      const totals = computeTotals({
        lines: lineInputs,
        discountAmount,
        depositDeducted,
        vatMode,
        vatRegistered: settings.vatRegistered,
        vatRateBp: settings.vatRateBp,
      });
      await tx.accountDocument.update({
        where: { id },
        data: {
          depositDeducted,
          subTotal: totals.subTotal,
          vatAmount: totals.vatAmount,
          grandTotal: totals.grandTotal,
        },
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "แก้ไขไม่สำเร็จ") };
  }
}

// snapshot ผู้ติดต่อ (freeze พ้น DRAFT) — รวม legalType (M4: ภงด 3/53 ไม่ขยับย้อนหลัง)
function contactSnapshot(c: {
  name: string;
  taxId: string | null;
  legalType?: AccountLegalType;
  branchCode: string | null;
  branchName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
} | null) {
  if (!c) return undefined;
  return {
    name: c.name,
    taxId: c.taxId,
    legalType: c.legalType,
    branchCode: c.branchCode,
    branchName: c.branchName,
    address: c.address,
    phone: c.phone,
    email: c.email,
  };
}

// ─────────────────── ออกเอกสาร (บันทึกซื้อ/ค่าใช้จ่าย/สินทรัพย์/มัดจำ/CNR/DNR) ───────────────────
// DRAFT → มีผล: จองเลข + freeze snapshot + postDocument (§7.10 ฝั่งซื้อ)
// AWAITING โหมด VAT → สร้าง PURCHASE_TAX_INVOICE (รอรับใบกำกับ) โยง relation TAX_FOR
export async function issueExpenseDoc(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true; docNo: string } | { ok: false; reason: string }> {
  try {
    let docNo = "";
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id, tenantId, systemId },
        include: { lines: true, contact: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.direction !== "IN") throw new Error("ไม่ใช่เอกสารฝั่งจ่าย");
      if (doc.status !== "DRAFT") throw new Error("เอกสารนี้ออกแล้ว");
      if (doc.lines.length === 0) throw new Error("ต้องมีรายการอย่างน้อย 1 รายการ");

      // ── CNR/DNR (WO 1.6, mirror F4 ฝั่งขาย): เหตุผลบังคับเสมอ · อ้างอิงเอกสารเดิมเป็นทางเลือก ──
      //    CNR cap ≤ คงเหลือของเอกสารเดิม (PUR/EXP) **เฉพาะเมื่อมีการอ้างอิง**
      if (doc.docType === "CREDIT_NOTE_RECEIVED" || doc.docType === "DEBIT_NOTE_RECEIVED") {
        if (!doc.adjustReason || doc.adjustReason.trim().length === 0)
          throw new Error("ต้องระบุเหตุผลการออก (ตามประกาศสรรพากร)");
        if (doc.docType === "CREDIT_NOTE_RECEIVED" && doc.sourceDocId) {
          const cap = await creditAvailableExpense(tx, systemId, doc.sourceDocId, id);
          if (doc.grandTotal > cap + 1)
            throw new Error(`ยอดรับใบลดหนี้เกินยอดคงเหลือของเอกสารเดิม (คงเหลือ ฿${baht(cap)})`);
        }
      }

      // ── WO 1.2: ล็อกการหักเงินมัดจำจ่ายตอนออกเอกสาร (mirror F2 ฝั่งขาย) ──
      //    ตรวจว่าใบมัดจำยัง "รอหักมัดจำ" + ยอดไม่เกินคงเหลือ · หักครบแล้ว → ใบมัดจำเป็น DEDUCTED
      if (DEPOSIT_DEDUCTIBLE_TYPES.includes(doc.docType)) {
        const applies = await tx.accountDocumentRelation.findMany({
          where: { systemId, toId: id, type: "DEPOSIT_APPLY" },
        });
        for (const ap of applies) {
          const dep = await tx.accountDocument.findFirst({
            where: { id: ap.fromId, systemId, docType: "DEPOSIT_PAYMENT" },
            select: { id: true, status: true, grandTotal: true },
          });
          if (!dep || dep.status !== "AWAITING_DEDUCT")
            throw new Error("ใบจ่ายเงินมัดจำที่เลือกหักไม่พร้อมใช้ (ต้องอยู่สถานะรอหักมัดจำ)");
          const avail = await paidDepositAvailable(tx, systemId, dep.id, id);
          if ((ap.amount ?? 0) > avail + 1)
            throw new Error("ยอดหักมัดจำเกินยอดคงเหลือของใบจ่ายเงินมัดจำ");
          const usedAll = dep.grandTotal - (await paidDepositAvailable(tx, systemId, dep.id));
          if (usedAll >= dep.grandTotal)
            await tx.accountDocument.update({ where: { id: dep.id }, data: { status: "DEDUCTED" } });
        }
      }

      docNo = await nextDocNo(tx, tenantId, systemId, doc.docType, doc.issueDate);
      await tx.accountDocument.update({
        where: { id },
        data: {
          docNo,
          status: issueStatusFor(doc.docType),
          contactSnapshot: contactSnapshot(doc.contact) ?? undefined,
        },
      });
      const ctx = { tenantId, systemId };
      await ensureAccounting(ctx, tx);
      // โพสต์บัญชีฝั่งซื้อ (GL-P2P3 จัดการ mapping/1150-1155/16xx/เจ้าหนี้)
      // 🔴 ยกเว้นใบจ่ายเงินมัดจำ (DP): posting rule ของมันคือ Dr 1130 มัดจำจ่าย / Cr เงิน — เงินยังไม่ออกตอนออกเอกสาร
      //    ⇒ โพสต์ตอน "จ่ายครบ" ใน recordVendorPayment เหมือนใบรับมัดจำฝั่งขาย (service.ts DEPOSIT_RECEIPT)
      //    ถ้าโพสต์ที่นี่จะ Cr เงินซ้ำ 2 รอบ (ตอนออก + ตอนจ่าย) และ Dr 2100 ลอยโดยไม่เคยมี Cr 2100
      if (doc.docType !== "DEPOSIT_PAYMENT") await postDocument(ctx, id, tx);
      // VAT รอใบกำกับ (vatTiming ON_PAYMENT + มี VAT) → เปิดทะเบียนใบกำกับภาษีซื้อรอรับ
      if (
        doc.vatTiming === "ON_PAYMENT" &&
        doc.vatMode !== "NONE" &&
        doc.vatAmount > 0 &&
        (doc.docType === "PURCHASE" || doc.docType === "EXPENSE" || doc.docType === "ASSET_PURCHASE")
      ) {
        await createPendingTaxInvoice(tx, tenantId, systemId, doc, docNo);
      }
      // WO C4: "ออกเอกสารแล้ว" ฝั่งซื้อ — คีย์เดียวกับฝั่งขาย (ผูก docId) ⇒ `createGroupDoc` ที่เรียกต่อไม่ยิงซ้ำ
      await emitDocumentIssued(tx, ctx, {
        id,
        docType: doc.docType,
        docNo,
        status: issueStatusFor(doc.docType),
        contactId: doc.contactId,
        grandTotal: doc.grandTotal,
        issueDate: doc.issueDate,
        source: doc.source,
      });
    });
    return { ok: true, docNo };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ออกเอกสารไม่สำเร็จ") };
  }
}

// สร้าง PURCHASE_TAX_INVOICE สถานะ AWAITING_RECEIVE (ยังไม่โพสต์ — โพสต์ตอน "รับแล้ว")
async function createPendingTaxInvoice(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  source: {
    id: string;
    contactId: string | null;
    contactSnapshot: unknown;
    vatMode: AccountVatMode;
    vatAmount: number;
  },
  sourceDocNo: string,
): Promise<void> {
  const issueDate = new Date();
  const docNo = await nextDocNo(tx, tenantId, systemId, "PURCHASE_TAX_INVOICE", issueDate);
  const ptx = await tx.accountDocument.create({
    data: {
      tenantId,
      systemId,
      docType: "PURCHASE_TAX_INVOICE",
      status: "AWAITING_RECEIVE",
      direction: "IN",
      docNo,
      issueDate,
      contactId: source.contactId,
      contactSnapshot: (source.contactSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
      vatMode: source.vatMode,
      vatTiming: "ON_PAYMENT",
      taxPointBasis: "ON_PAYMENT",
      subTotal: 0,
      vatAmount: source.vatAmount,
      grandTotal: source.vatAmount,
      sourceDocId: source.id,
      note: `รอรับใบกำกับภาษีซื้อของ ${sourceDocNo}`,
      lines: {
        create: [
          {
            tenantId,
            systemId,
            sortOrder: 0,
            description: "ภาษีซื้อรอรับใบกำกับ (โอน 1155 → 1150 เมื่อรับใบจริง)",
            qty: 1,
            unitPrice: source.vatAmount,
            discount: 0,
            vatRateBp: 0,
            amount: source.vatAmount,
          },
        ],
      },
    },
  });
  await tx.accountDocumentRelation.create({
    data: { tenantId, systemId, fromId: source.id, toId: ptx.id, type: "TAX_FOR", amount: source.vatAmount },
  });
}

// ใบกำกับภาษีซื้อ "รับแล้ว" → RECEIVED + postDocument (โอน 1155 → 1150 เคลม VAT)
export async function receivePurchaseTaxInvoice(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.docType !== "PURCHASE_TAX_INVOICE") throw new Error("ไม่ใช่ใบกำกับภาษีซื้อ");
      if (doc.status !== "AWAITING_RECEIVE") throw new Error("สถานะไม่ถูกต้อง (ต้องรอรับ)");
      await tx.accountDocument.update({ where: { id }, data: { status: "RECEIVED" } });
      const ctx = { tenantId, systemId };
      await ensureAccounting(ctx, tx);
      await postDocument(ctx, id, tx); // GL-P2P3: Dr 1150 / Cr 1155
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "รับใบกำกับไม่สำเร็จ") };
  }
}

// ─────────────────── รับใบเสร็จซื้อสินทรัพย์ (ASSET_PURCHASE → RECEIVED) ───────────────────
export async function markAssetReceived(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doc = await prisma.accountDocument.findFirst({ where: { id, tenantId, systemId } });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (doc.docType !== "ASSET_PURCHASE") return { ok: false, reason: "ไม่ใช่เอกสารซื้อสินทรัพย์" };
  if (!["AWAITING_PAYMENT", "PARTIAL", "PAID"].includes(doc.status))
    return { ok: false, reason: "สถานะไม่ถูกต้อง" };
  await prisma.accountDocument.update({ where: { id }, data: { status: "RECEIVED" } });
  return { ok: true };
}

// ─────────────────── บันทึกจ่ายชำระ (+ WHT + 50 ทวิ) ───────────────────
export async function recordVendorPayment(
  tenantId: string,
  systemId: string,
  id: string,
  input: {
    paidAt?: Date;
    channel?: AccountPayChannel;
    financeAccountId?: string | null;
    amount: number; // เงินออกจริง (ไม่รวม WHT)
    whtAmountSatang?: number; // WHT ที่เราหัก vendor (ตัดเจ้าหนี้ด้วย)
    whtRateBp?: number | null;
    whtIncomeType?: AccountWhtIncomeType | null; // ออก 50 ทวิ ถ้ามี
    feeAmount?: number;
    note?: string | null;
    createdById?: string | null;
    /** WO 1.4: กันบันทึกซ้ำจากการกดปุ่ม/รีทรายซ้ำ — คีย์เดิม = ไม่สร้าง payment/JV ใหม่ */
    idempotencyKey?: string | null;
  },
): Promise<{ ok: true; status: AccountDocStatus; paymentId?: string } | { ok: false; reason: string }> {
  if (!input.amount || input.amount <= 0) return { ok: false, reason: "ยอดชำระต้องมากกว่า 0" };
  const wht = Math.max(0, input.whtAmountSatang ?? 0);
  if (input.idempotencyKey) {
    const dup = await prisma.accountDocumentPayment.findFirst({
      where: { idempotencyKey: input.idempotencyKey, tenantId, systemId },
      select: { id: true, documentId: true, document: { select: { status: true } } },
    });
    if (dup) {
      if (dup.documentId !== id) return { ok: false, reason: "คีย์กันซ้ำนี้ถูกใช้กับเอกสารอื่นแล้ว" };
      return { ok: true, status: dup.document.status, paymentId: dup.id };
    }
  }
  try {
    let status: AccountDocStatus = "PARTIAL";
    let paymentId = "";
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id, tenantId, systemId },
        include: { contact: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.direction !== "IN") throw new Error("ไม่ใช่เอกสารฝั่งจ่าย");
      if (!["AWAITING_PAYMENT", "PARTIAL"].includes(doc.status))
        throw new Error("เอกสารนี้จ่ายชำระไม่ได้ในสถานะปัจจุบัน");
      // §9.3 ล็อกข้อมูลก่อนวันที่ — ตรวจที่ "วันที่จ่าย"
      await assertNotLockedTx(tx, systemId, input.paidAt ?? new Date());
      const tieOff = input.amount + wht; // ยอดที่ตัดเจ้าหนี้
      const remain = Math.max(0, doc.grandTotal - doc.paidTotal);
      if (tieOff > remain + 1) throw new Error("ยอดจ่ายเกินยอดคงเหลือ");
      const payment = await tx.accountDocumentPayment.create({
        data: {
          tenantId,
          systemId,
          documentId: id,
          paidAt: input.paidAt ?? new Date(),
          channel: input.channel ?? "TRANSFER",
          financeAccountId: input.financeAccountId ?? null,
          amount: input.amount,
          whtAmountSatang: wht,
          whtRateBp: input.whtRateBp ?? null,
          feeAmount: Math.max(0, input.feeAmount ?? 0),
          note: input.note ?? null,
          createdById: input.createdById ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      paymentId = payment.id;
      const newPaid = doc.paidTotal + tieOff;
      const fullyPaid = newPaid >= doc.grandTotal;
      // มัดจำจ่าย: จ่ายครบ → รอหักมัดจำ (mirror ฝั่งรับ)
      status = fullyPaid
        ? doc.docType === "DEPOSIT_PAYMENT"
          ? "AWAITING_DEDUCT"
          : "PAID"
        : "PARTIAL";
      await tx.accountDocument.update({ where: { id }, data: { paidTotal: newPaid, status } });
      const ctx = { tenantId, systemId };
      await ensureAccounting(ctx, tx);
      if (doc.docType === "DEPOSIT_PAYMENT") {
        // มัดจำจ่าย: ไม่มีเจ้าหนี้ให้ตัด — โพสต์เอกสารเต็มก้อนเมื่อจ่ายครบ (Dr 1130 + Dr 1150 / Cr เงิน)
        // postDocument อ่านช่องทาง/บัญชีเงินจาก payment แรกของเอกสาร (gl.ts case DEPOSIT_PAYMENT)
        // WO 1.4: จ่ายใหม่หลังยกเลิก → ต้องใช้ event ใหม่ ไม่งั้น alreadyPosted ข้ามการโพสต์เงียบ ๆ
        if (fullyPaid) await postDocument(ctx, id, tx, { event: await depositRepostEvent(tx, systemId, id) });
      } else {
        // GL-P2P3: Dr 2100 เจ้าหนี้ / Cr เงิน + Cr 2130 WHT ค้างนำส่ง (direction IN)
        await postPayment(ctx, payment.id, tx);
      }
      // ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) อัตโนมัติ
      if (wht > 0 && input.whtIncomeType) {
        // M5: ฐานเงินได้จริง = ยอดจ่ายจริงงวดนี้ก่อน VAT (subTotal × สัดส่วนที่ตัดหนี้) ไม่ย้อนจาก wht/rate
        const realBase = doc.grandTotal > 0 ? Math.round((doc.subTotal * tieOff) / doc.grandTotal) : tieOff;
        // C3: 50 ทวิ ใช้ paidAt (WHT ตกงวด ภงด. ถูกเดือน)
        await issueWhtCert(tx, tenantId, systemId, doc, payment.id, wht, input.whtRateBp ?? null, input.whtIncomeType, realBase, payment.paidAt);
      }
    });
    return { ok: true, status, paymentId };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกจ่ายไม่สำเร็จ") };
  }
}

/** WO 1.4 — คู่แฝดของ `depositRepostEvent` ฝั่งขาย (service.ts) · ดูคำอธิบายเหตุผลที่นั่น */
async function depositRepostEvent(tx: Prisma.TransactionClient, systemId: string, docId: string): Promise<string> {
  const n = await tx.accountJournalEntry.count({
    where: { systemId, refType: "AccountDocument", refId: docId, journal: "REVERSAL" },
  });
  return n === 0 ? "ISSUE" : `ISSUE:R${n}`;
}

// สร้าง WHT_CERT (50 ทวิ) ผูก payment — ไม่โพสต์ GL (WHT โพสต์กับ payment แล้ว, NO_GL)
async function issueWhtCert(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  source: { id: string; contactId: string | null; contactSnapshot: unknown; contact: unknown },
  paymentId: string,
  whtAmount: number,
  whtRateBp: number | null,
  incomeType: AccountWhtIncomeType,
  base: number, // M5: ฐานเงินได้จริง (คำนวณจากยอดจ่ายจริง ไม่ย้อนจาก wht/rate)
  issueDate: Date, // C3: = paidAt (WHT ตกงวด ภงด. ถูกเดือน)
): Promise<void> {
  const docNo = await nextDocNo(tx, tenantId, systemId, "WHT_CERT", issueDate);
  const cert = await tx.accountDocument.create({
    data: {
      tenantId,
      systemId,
      docType: "WHT_CERT",
      status: "ISSUED",
      direction: "IN",
      docNo,
      issueDate,
      contactId: source.contactId,
      contactSnapshot: (source.contactSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
      vatMode: "NONE",
      subTotal: base,
      vatAmount: 0,
      whtAmount,
      grandTotal: base,
      whtIncomeType: incomeType,
      whtRateBp: whtRateBp,
      sourceDocId: source.id,
      sourcePaymentId: paymentId,
      note: "หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)",
    },
  });
  await tx.accountDocumentPayment.update({
    where: { id: paymentId },
    data: { whtCertDocId: cert.id },
  });
  await tx.accountDocumentRelation.create({
    data: { tenantId, systemId, fromId: source.id, toId: cert.id, type: "TAX_FOR", amount: whtAmount },
  });
}

// ยกเลิกการจ่าย → reversal + ถอยสถานะ
export async function voidVendorPayment(
  tenantId: string,
  systemId: string,
  documentId: string,
  paymentId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const pay = await tx.accountDocumentPayment.findFirst({
        where: { id: paymentId, documentId, tenantId, systemId },
      });
      if (!pay) throw new Error("ไม่พบรายการจ่าย");
      if (pay.voidedAt) throw new Error("รายการจ่ายนี้ถูกยกเลิกแล้ว");
      // §9.3 (reversal เลื่อนวันได้ ⇒ ด่านใน gl.commitEntry จับวันเดิมไม่ถึง)
      await assertNotLockedTx(tx, systemId, pay.paidAt);
      const doc = await tx.accountDocument.findFirst({ where: { id: documentId, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      // WO 1.4: ใบมัดจำจ่ายที่ถูกหักในบันทึกซื้อแล้ว ยกเลิกการจ่ายไม่ได้ (ต้องแก้ที่ปลายทางก่อน)
      if (doc.docType === "DEPOSIT_PAYMENT") {
        const applied = await tx.accountDocumentRelation.findMany({
          where: { systemId, fromId: documentId, type: "DEPOSIT_APPLY" },
          include: { to: { select: { status: true } } },
        });
        if (applied.some((r) => r.to.status !== "VOIDED" && r.to.status !== "CANCELLED"))
          throw new Error("ใบมัดจำนี้ถูกหักในเอกสารอื่นแล้ว — ยกเลิกการหักที่เอกสารนั้นก่อน");
      }
      await tx.accountDocumentPayment.update({
        where: { id: paymentId },
        data: { voidedAt: new Date(), voidReason: reason || null },
      });
      const tieOff = pay.amount + pay.whtAmountSatang;
      const newPaid = Math.max(0, doc.paidTotal - tieOff);
      await tx.accountDocument.update({
        where: { id: documentId },
        data: { paidTotal: newPaid, status: newPaid > 0 ? "PARTIAL" : "AWAITING_PAYMENT" },
      });
      await reverseFor({ tenantId, systemId }, "AccountDocumentPayment", paymentId, reason, tx);

      // ── WO 1.4 (ปิดรูรั่ว 1.2 §8.1): JV ของใบจ่ายมัดจำ (Dr 1130 + Dr 1150 / Cr เงิน) ผูกกับ
      //    *ตัวเอกสาร* ไม่ใช่ payment ⇒ reversal ข้างบนไม่แตะ · ต้องกลับรายการเอกสารด้วย
      if (doc.docType === "DEPOSIT_PAYMENT" && doc.status === "AWAITING_DEDUCT") {
        await reverseFor({ tenantId, systemId }, "AccountDocument", documentId, reason, tx);
      }

      // ── R-A/C2: cascade → 50 ทวิ (WHT_CERT) ที่ผูก payment นี้ → VOIDED + ล้าง link ──
      //    ไม่งั้น ภงด.53 นำส่งบนเงินที่ไม่ได้จ่าย (จ่าย void แต่ cert ยัง ISSUED)
      if (pay.whtCertDocId) {
        await tx.accountDocument.updateMany({
          where: { id: pay.whtCertDocId, systemId, docType: "WHT_CERT", status: { notIn: ["VOIDED", "CANCELLED"] } },
          data: { status: "VOIDED", voidedAt: new Date(), voidReason: `ยกเลิกตามการยกเลิกจ่าย: ${reason}` },
        });
        await tx.accountDocumentPayment.update({ where: { id: paymentId }, data: { whtCertDocId: null } });
      }
      // WO C4: "ยกเลิกการจ่าย" — event เดียวกับฝั่งรับ (`voidPaymentAny` ส่งต่อมาที่นี่ตามทิศทางเอกสาร)
      await emitPaymentVoided(tx, { tenantId, systemId }, {
        paymentId,
        documentId,
        docNo: doc.docNo,
        amountSatang: pay.amount,
        reason,
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ยกเลิกการจ่ายไม่สำเร็จ") };
  }
}

// ยกเลิกเอกสาร: DRAFT → CANCELLED · มีผลแล้ว → VOIDED + reversal
export async function voidExpenseDoc(
  tenantId: string,
  systemId: string,
  id: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status === "VOIDED" || doc.status === "CANCELLED")
        throw new Error("เอกสารถูกยกเลิกแล้ว");
      // §9.3 ล็อกข้อมูลก่อนวันที่
      await assertNotLockedTx(tx, systemId, doc.issueDate);
      if (doc.status !== "DRAFT") {
        const activePay = await tx.accountDocumentPayment.count({
          where: { documentId: id, voidedAt: null },
        });
        if (activePay > 0) throw new Error("มีการจ่ายค้างอยู่ — ยกเลิกการจ่ายก่อน");
      }
      // เอกสารที่มี posting: PAYABLE + ADJUST + PTX(RECEIVED) = เคยโพสต์ → reversal
      const posted =
        doc.status !== "DRAFT" &&
        doc.status !== "AWAITING_APPROVAL" &&
        doc.status !== "AWAITING_RECEIVE" &&
        doc.status !== "APPROVED";
      await tx.accountDocument.update({
        where: { id },
        data: {
          status: doc.status === "DRAFT" ? "CANCELLED" : "VOIDED",
          voidedAt: new Date(),
          voidReason: reason || null,
        },
      });
      if (posted) {
        await reverseFor({ tenantId, systemId }, "AccountDocument", id, reason, tx);
      }
      // WO C4: "ยกเลิกเอกสาร" ฝั่งซื้อ — event/คีย์ชุดเดียวกับฝั่งขาย (ปลายทางไม่ต้องแยก 2 ชนิด)
      await emitDocumentVoided(tx, { tenantId, systemId }, {
        id,
        docType: doc.docType,
        docNo: doc.docNo,
        reason,
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ยกเลิกเอกสารไม่สำเร็จ") };
  }
}

// ─────────────────── PO / ใบสั่งซื้อสินทรัพย์ (workflow อนุมัติ) ───────────────────

export async function createPurchaseOrder(input: {
  tenantId: string;
  systemId: string;
  docType: "PURCHASE_ORDER" | "ASSET_PURCHASE_ORDER";
  contactId?: string | null;
  issueDate?: Date;
  dueDate?: Date | null;
  vatMode?: AccountVatMode;
  discountAmount?: number;
  note?: string | null;
  lines: ExpLineInput[];
  createdById?: string | null;
  // ── WO C1 (REST) · additive · optional — ไม่ส่ง = พฤติกรรมเดิมเป๊ะ (source MANUAL, tags []) ──
  // ส่งต่อให้ `createExpenseDoc` ตรง ๆ ผ่าน spread ด้านล่าง (ที่นี่ทำแค่บังคับ vatPurchaseMode)
  source?: AccountDocSource;
  tags?: string[];
  refType?: string | null;
  refId?: string | null;
}) {
  // PO/APO ไม่โพสต์บัญชี — ใช้ VAT CLAIM เป็น default (มีผลตอนแปลงเป็นบันทึกซื้อ)
  return createExpenseDoc({
    ...input,
    vatPurchaseMode: "CLAIM",
  });
}

// ส่งอนุมัติ: DRAFT → AWAITING_APPROVAL
export async function submitForApproval(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true; docNo: string } | { ok: false; reason: string }> {
  try {
    let docNo = "";
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id, tenantId, systemId },
        include: { lines: true, contact: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.docType !== "PURCHASE_ORDER" && doc.docType !== "ASSET_PURCHASE_ORDER")
        throw new Error("ไม่ใช่ใบสั่งซื้อ");
      if (doc.status !== "DRAFT") throw new Error("ส่งอนุมัติได้เฉพาะร่าง");
      if (doc.lines.length === 0) throw new Error("ต้องมีรายการอย่างน้อย 1 รายการ");
      docNo = await nextDocNo(tx, tenantId, systemId, doc.docType, doc.issueDate);
      await tx.accountDocument.update({
        where: { id },
        data: {
          docNo,
          status: "AWAITING_APPROVAL",
          contactSnapshot: contactSnapshot(doc.contact) ?? undefined,
        },
      });
      // WO C4: ใบสั่งซื้อ "ได้เลขที่จริง" ตอนส่งอนุมัติ (ไม่มีขั้น issue แยก) ⇒ นับเป็น document.issued
      await emitDocumentIssued(tx, { tenantId, systemId }, {
        id,
        docType: doc.docType,
        docNo,
        status: "AWAITING_APPROVAL",
        contactId: doc.contactId,
        grandTotal: doc.grandTotal,
        issueDate: doc.issueDate,
        source: doc.source,
      });
    });
    return { ok: true, docNo };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่งอนุมัติไม่สำเร็จ") };
  }
}

/**
 * ข้อมูลย่อของเอกสารสำหรับ "ด่านเพดานอนุมัติ" (WO 8.3 §9.4) — ยอด + ผู้สร้าง
 * แยกเป็นฟังก์ชันเพื่อให้ชั้น action ตัดสินเพดาน/ยื่นสายอนุมัติได้ก่อนแตะสถานะเอกสาร
 */
export async function docForApproval(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ docType: AccountDocType; grandTotal: number; createdById: string | null; status: AccountDocStatus } | null> {
  return prisma.accountDocument.findFirst({
    where: { id, tenantId, systemId },
    select: { docType: true, grandTotal: true, createdById: true, status: true },
  });
}

// อนุมัติ: AWAITING_APPROVAL → APPROVED (คุมวงเงิน maxSatang ที่ชั้น action)
export async function approvePurchaseOrder(
  tenantId: string,
  systemId: string,
  id: string,
  approvedById: string,
  opts?: { maxSatang?: number },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doc = await prisma.accountDocument.findFirst({ where: { id, tenantId, systemId } });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (doc.docType !== "PURCHASE_ORDER" && doc.docType !== "ASSET_PURCHASE_ORDER")
    return { ok: false, reason: "ไม่ใช่ใบสั่งซื้อ" };
  if (doc.status !== "AWAITING_APPROVAL") return { ok: false, reason: "สถานะไม่ถูกต้อง (ต้องรออนุมัติ)" };
  if (opts?.maxSatang !== undefined && doc.grandTotal > opts.maxSatang)
    return { ok: false, reason: `เกินวงเงินอนุมัติ (จำกัด ฿${(opts.maxSatang / 100).toLocaleString("th-TH")})` };
  // 🔴 WO 9.2 ข้อ 14 — เปลี่ยนสถานะแบบมีเงื่อนไขในคำสั่งเดียว (ไม่ใช่ read-then-write)
  //    กดอนุมัติรัว/2 คนกดพร้อมกัน: ของเดิมผ่านด่าน `status !== AWAITING_APPROVAL` ทั้งคู่
  //    → เขียน approvedById ทับกัน + ยิง audit/webhook ซ้ำ · แบบนี้มีผู้ชนะคนเดียวเสมอ
  //    WO C4: ยิง `account.document.approved` **ที่ service** (ไม่ใช่แค่ที่ server action) ⇒ REST/สกิล AI
  //    ที่เรียกตรงก็ได้ฮุคเหมือนกัน · action เดิมยังยิงซ้ำได้ไม่เป็นไร (คีย์เดียวกัน = ข้ามเงียบ ๆ)
  const res = await prisma.$transaction(async (tx) => {
    const r = await tx.accountDocument.updateMany({
      where: { id, tenantId, systemId, status: "AWAITING_APPROVAL" },
      data: { status: "APPROVED", approvedById },
    });
    if (r.count > 0) await emitDocumentApproved(tx, { tenantId, systemId }, { id, docType: doc.docType, approvedById });
    return r;
  });
  if (res.count === 0) return { ok: false, reason: "สถานะไม่ถูกต้อง (ต้องรออนุมัติ)" };
  return { ok: true };
}

export async function rejectPurchaseOrder(
  tenantId: string,
  systemId: string,
  id: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doc = await prisma.accountDocument.findFirst({ where: { id, tenantId, systemId } });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (doc.status !== "AWAITING_APPROVAL") return { ok: false, reason: "สถานะไม่ถูกต้อง" };
  // WO 9.2 ข้อ 14 — เหตุผลเดียวกับ approvePurchaseOrder (ผู้ชนะคนเดียวในคำสั่งเดียว)
  const res = await prisma.accountDocument.updateMany({
    where: { id, tenantId, systemId, status: "AWAITING_APPROVAL" },
    data: { status: "REJECTED", voidReason: reason || null },
  });
  if (res.count === 0) return { ok: false, reason: "สถานะไม่ถูกต้อง" };
  return { ok: true };
}

// แปลง PO → PURCHASE · APO → ASSET_PURCHASE (สร้าง DRAFT ปลายทาง + relation CONVERT)
export async function convertPurchaseOrder(
  tenantId: string,
  systemId: string,
  id: string,
  createdById?: string | null,
): Promise<{ ok: true; newId: string; toDocType: AccountDocType } | { ok: false; reason: string }> {
  try {
    const source = await prisma.accountDocument.findFirst({
      where: { id, tenantId, systemId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!source) return { ok: false, reason: "ไม่พบเอกสารต้นทาง" };
    if (source.docType !== "PURCHASE_ORDER" && source.docType !== "ASSET_PURCHASE_ORDER")
      return { ok: false, reason: "แปลงได้เฉพาะใบสั่งซื้อ" };
    if (source.status !== "APPROVED") return { ok: false, reason: "ต้องอนุมัติก่อนจึงแปลงได้" };
    const settings = await getSettings(tenantId, systemId);
    // §9.3 ล็อกข้อมูลก่อนวันที่ (เอกสารปลายทางลงวันที่วันนี้)
    assertNotLockedWith(settings.policy.lockBeforeDate, new Date());
    // §9.3 "การออกเอกสารต่อ": ใบสั่งซื้อทั่วไปไปได้ทั้ง "บันทึกซื้อ" และ "บันทึกค่าใช้จ่าย" ตามที่ตั้งไว้
    // ใบสั่งซื้อ**สินทรัพย์**ยังบังคับไป ASSET_PURCHASE เสมอ (ทะเบียนสินทรัพย์ต้องเกิดจากเอกสารชนิดนี้เท่านั้น)
    const toDocType: AccountDocType =
      source.docType === "ASSET_PURCHASE_ORDER"
        ? "ASSET_PURCHASE"
        : settings.policy.convertPoTo === "EXPENSE"
          ? "EXPENSE"
          : "PURCHASE";

    const created = await prisma.$transaction(async (tx) => {
      const newDoc = await tx.accountDocument.create({
        data: {
          tenantId,
          systemId,
          docType: toDocType,
          status: "DRAFT",
          direction: "IN",
          issueDate: new Date(),
          contactId: source.contactId,
          vatMode: source.vatMode,
          vatTiming: source.vatTiming,
          taxPointBasis: source.taxPointBasis,
          discountAmount: source.discountAmount,
          subTotal: source.subTotal,
          vatAmount: source.vatAmount,
          grandTotal: source.grandTotal,
          note: settings.policy.copyNotesOnConvert ? source.note : null,
          tags: settings.policy.copyTagsOnConvert ? source.tags : [],
          sourceDocId: source.id,
          createdById: createdById ?? null,
          lines: {
            create: source.lines.map((l, i) => ({
              tenantId,
              systemId,
              sortOrder: i,
              description: l.description,
              qty: l.qty,
              unitName: l.unitName,
              unitPrice: l.unitPrice,
              discount: l.discount,
              vatRateBp: l.vatRateBp,
              amount: l.amount,
              accountId: l.accountId,
              productId: l.productId,
            })),
          },
        },
      });
      await tx.accountDocumentRelation.create({
        data: { tenantId, systemId, fromId: source.id, toId: newDoc.id, type: "CONVERT", amount: source.grandTotal },
      });
      return newDoc;
    });
    return { ok: true, newId: created.id, toDocType };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "แปลงเอกสารไม่สำเร็จ") };
  }
}

// ─────────────────── สรุปฝั่งจ่าย (หน้าแรกรายจ่าย) ───────────────────
export async function payableStats(tenantId: string, systemId: string) {
  const open = await prisma.accountDocument.findMany({
    where: {
      tenantId,
      systemId,
      direction: "IN",
      status: { in: ["AWAITING_PAYMENT", "PARTIAL"] },
    },
    select: { grandTotal: true, paidTotal: true, dueDate: true, status: true, validUntil: true },
  });
  let payable = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  for (const d of open) {
    const remain = Math.max(0, d.grandTotal - d.paidTotal);
    payable += remain;
    if (isOverdue({ status: d.status, dueDate: d.dueDate, validUntil: d.validUntil })) {
      overdueCount += 1;
      overdueAmount += remain;
    }
  }
  const [pendingApproval, awaitingTaxInvoice] = await Promise.all([
    prisma.accountDocument.count({
      where: { tenantId, systemId, direction: "IN", status: "AWAITING_APPROVAL" },
    }),
    prisma.accountDocument.count({
      where: { tenantId, systemId, docType: "PURCHASE_TAX_INVOICE", status: "AWAITING_RECEIVE" },
    }),
  ]);
  // openCount = จำนวนใบที่ยังค้างจ่าย (KPI "ค้างจ่าย (เจ้าหนี้)" หน้าหลัก · WO 1.2)
  //   นับทุกเอกสาร direction=IN ที่ยัง AWAITING_PAYMENT/PARTIAL รวม DEPOSIT_PAYMENT ที่ยังไม่จ่าย
  //   (เป็นภาระเงินออกจริงของกิจการ แม้ GL 2100 จะยังไม่ตั้งเจ้าหนี้ให้ใบมัดจำ)
  return { payable, openCount: open.length, overdueCount, overdueAmount, pendingApproval, awaitingTaxInvoice };
}
