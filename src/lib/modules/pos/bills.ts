// bills.ts — หน้า "บิลวันนี้" (POS P1.16 · จอ 12 · ครึ่งเซิร์ฟเวอร์ S) · billsPageData · billDetail · voidSaleByActor
// สัญญา = scripts/qc-pos-p1.16.mts · brief ledger/pos-briefs/pos-brief-P1.16.md (§2 R1–R6 · §5) · ตารางชื่อ ledger/wo-notes/pos-P1.16-oracle.md
//
// 🔴 อ่านอย่างเดียว ยกเว้น voidSaleByActor (ผ่าน voidSale ของ service.ts ตัวเดียว + อาร์กิวเมนต์ที่ 4 = audit ในtx)
// 🔴 สิทธิ์อ่าน = กติกาเดียวกับใบเสร็จ (receiptReadScope: pos.sale.read หรือ pos.sale.create · P1.10 CD3) — อ่านไม่ได้ที่ไหนเลย = NO_PERMISSION ·
//    สาขานอกขอบเขต / สาขาของ POS อื่น = ผลว่าง (ไม่ปฏิเสธ · มติ CD-O1) · บิลของสาขาอื่น/id มั่ว = SALE_NOT_FOUND
// 🔴 แถวของรายการ = บิลขาย (docType SALE) เท่านั้น · ใบคืน (REFUND) ห้อยที่บิลของมัน (refunds[]) ไม่เป็นแถว
// 🔴 billDetail ห้ามเรียก receiptPayload (มันเขียน audit / ยกเป็นสำเนา) — คำนวณยอดด้วยสูตรเดียวกันจากแถว DB
// 🔴 คำปฏิเสธ "คืน" {ok:false, code, message ไทย} — ไม่ throw ข้ามขอบ action (ขัดข้องที่ไม่คาดคิด = UNKNOWN)
import type { PosSaleStatus } from "@prisma/client";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import * as account from "@/lib/modules/account";
import { prisma } from "./db";
import { receiptReadScope } from "./receipt";
import { receiptKindOf } from "./receipt-shared";
import { snapshotBuyer } from "./tax-invoice-shared"; // POS P1.13 ▸ R7 ◂
import { saleForRefund } from "./refund";
import { PAY_TYPE_ORDER, PosSaleError, voidSale, type VoidSaleAudit } from "./service";
// POS P1.15 ▸ R5: ยกเลิกบิลผ่านสายอนุมัติ (POS_VOID) · PIN ผู้จัดการชนะคำขอที่รอ (CD4) ◂
import { POS_APPROVAL_MESSAGE, auditPinOverride, cancelOpenPosRequest, submitPosApproval } from "./pos-approval";
import { verifyManagerPin } from "./staff-pin";
import { moneyText, type RegisterActor, type RegisterCtx } from "./register-shared";
import {
  BILL_PAGE_SIZES,
  BILL_Q_MAX,
  BILL_STATUS_FILTERS,
  REFUND_REASON_LABEL_TH,
  VOID_REASON_MAX,
  addBillDays,
  isBillDate,
  type BillDetail,
  type BillDetailResult,
  type BillRow,
  type BillSaleStatus,
  type BillStatusFilter,
  type BillsPageData,
  type BillsPageDataResult,
  type BillsRefusal,
  type BillsRefusalCode,
  type BillVoidBlockedReason,
  type VoidSaleActionResult,
} from "./bills-shared";

/** สิทธิ์ยกเลิกบิล (มีอยู่แล้ว · ข้อเสนอ AI ใช้คีย์เดียวกัน) */
export const VOID_PERMISSION = "pos.sale.void";
const REFUND_PERMISSION = "pos.sale.refund";
const MAX_KEY = 200;
const SYSTEM_NAME = "ระบบ";

const MSG: Record<BillsRefusalCode, string> = {
  NO_PERMISSION: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้านหรือผู้จัดการ",
  SALE_NOT_FOUND: "ไม่พบบิลนี้ในสาขานี้",
  SALE_NOT_VOIDABLE: "บิลนี้ยกเลิกไม่ได้ (ยกเลิกไปแล้ว คืนเงินครบแล้ว เป็นใบคืนเงิน หรือเป็นบิลของระบบอื่น — ยกเลิกที่ระบบนั้น)",
  HAS_REFUNDS: "บิลนี้มีการคืนเงินแล้ว — ยกเลิกทั้งใบไม่ได้ ใช้การคืนเงินส่วนที่เหลือแทน",
  SHIFT_CLOSED: "กะของบิลนี้ปิดแล้ว — ยกเลิกบิลไม่ได้ ใช้การคืนเงินแทน",
  REASON_REQUIRED: `ระบุเหตุผลการยกเลิกบิล (ไม่เกิน ${VOID_REASON_MAX} ตัวอักษร)`,
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const refuse = (code: BillsRefusalCode, message?: string): BillsRefusal => ({ ok: false, code, message: message ?? MSG[code] });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const nonEmpty = (v: string | null | undefined): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const absent = (v: unknown) => v === undefined || v === null;
/** หารปัดครึ่งขึ้นเป็นสตางค์จำนวนเต็ม (มติ CD-O3) */
const divHalfUp = (a: number, b: number) => (b > 0 ? Math.floor((2 * a + b) / (2 * b)) : 0);
const LISTED: PosSaleStatus[] = ["PAID", "VOIDED", "REFUNDED"];

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}
function ctxOf(c: unknown): { tenantId: string; systemId: string } | null {
  return isRecord(c) && isId(c.tenantId) && isId(c.systemId) ? { tenantId: c.tenantId, systemId: c.systemId } : null;
}
/** อ่านบิลของสาขานี้ได้ไหม (ขอบเขตเดียวกับใบเสร็จ) */
function unitReadable(actor: RegisterActor, unitId: string): boolean | null {
  const scope = receiptReadScope(actor);
  if (!scope) return null;
  return scope.allUnits || scope.unitIds.includes(unitId);
}
/** ช่วงเวลา UTC [start, end) ของวันที่ตามเวลาไทย */
function bkkRange(date: string): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${date}T00:00:00+07:00`));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
const dayWhere = (date: string) => {
  const { start, end } = bkkRange(date);
  return { OR: [{ paidAt: { gte: start, lt: end } }, { paidAt: null, createdAt: { gte: start, lt: end } }] };
};
const timeOf = (s: { paidAt: Date | null; createdAt: Date }) => s.paidAt ?? s.createdAt;
/** ชนิดการจ่ายไม่ซ้ำ เรียงตาม PAY_TYPE_ORDER (มติ CD-O6) */
function payMethodsText(types: string[]): string {
  const set = new Set(types);
  const known = PAY_TYPE_ORDER.filter((t) => set.has(t));
  const rest = [...set].filter((t) => !(PAY_TYPE_ORDER as string[]).includes(t)).sort();
  return [...known, ...rest].join("+");
}
async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, email: true } });
  return new Map(rows.map((u) => [u.id, nonEmpty(u.name) ?? nonEmpty(u.email) ?? "-"]));
}
type CustomerLite = { id: string; name: string | null; firstName: string | null; lastName: string | null; phone: string | null; memberCode: string | null; tierDefId: string | null };
const customerName = (c: CustomerLite) => nonEmpty(c.name) ?? nonEmpty([c.firstName, c.lastName].filter(Boolean).join(" ")) ?? nonEmpty(c.memberCode) ?? "-";

// ═══════════ billsPageData (R1) ═══════════
type CleanQuery = { unitId: string; date: string; status: BillStatusFilter; q: string; channel: string | null; staffUserId: string | null; page: number; pageSize: number };
function cleanQuery(raw: unknown): CleanQuery | BillsRefusal {
  if (!isRecord(raw)) return refuse("VALIDATION");
  if (!isId(raw.unitId)) return refuse("VALIDATION");
  if (!isBillDate(raw.date)) return refuse("VALIDATION", "วันที่ไม่ถูกต้อง");
  let status: BillStatusFilter = "ALL";
  if (!absent(raw.status)) {
    if (typeof raw.status !== "string" || !(BILL_STATUS_FILTERS as readonly string[]).includes(raw.status)) return refuse("VALIDATION");
    status = raw.status as BillStatusFilter;
  }
  let q = "";
  if (!absent(raw.q)) {
    if (typeof raw.q !== "string" || raw.q.length > BILL_Q_MAX) return refuse("VALIDATION", `คำค้นยาวได้ไม่เกิน ${BILL_Q_MAX} ตัวอักษร`);
    q = raw.q.trim();
  }
  let channel: string | null = null;
  if (!absent(raw.channel) && raw.channel !== "") {
    if (typeof raw.channel !== "string" || raw.channel.length > 40) return refuse("VALIDATION");
    channel = raw.channel;
  }
  let staffUserId: string | null = null;
  if (!absent(raw.staffUserId) && raw.staffUserId !== "") {
    if (!isId(raw.staffUserId)) return refuse("VALIDATION");
    staffUserId = raw.staffUserId;
  }
  let page = 1;
  if (!absent(raw.page)) {
    if (typeof raw.page !== "number" || !Number.isInteger(raw.page) || raw.page < 1 || raw.page > 100_000) return refuse("VALIDATION");
    page = raw.page;
  }
  let pageSize = 10;
  if (!absent(raw.pageSize)) {
    if (typeof raw.pageSize !== "number" || !(BILL_PAGE_SIZES as readonly number[]).includes(raw.pageSize)) return refuse("VALIDATION");
    pageSize = raw.pageSize;
  }
  return { unitId: raw.unitId, date: raw.date, status, q, channel, staffUserId, page, pageSize };
}

const emptyPage = (x: CleanQuery): BillsPageData => ({
  ok: true,
  date: x.date,
  counts: { all: 0, paid: 0, voided: 0, refunded: 0, offShiftCash: 0 },
  summary: { netSatang: 0, billCount: 0, storeCount: 0, onlineCount: 0, avgSatang: 0, yesterdayAvgSatang: 0 },
  items: [],
  total: 0,
  page: x.page,
  pageSize: x.pageSize,
  channels: [],
  staff: [],
});

/** ยอดสุทธิ/เฉลี่ยของชุดบิล (ไม่นับ VOIDED) — "หลังหักคืนเงินและยกเลิก" */
function liveStats(rows: { status: string; grandTotalSatang: number; refundedSatang: number; sourceModule: string }[]) {
  const live = rows.filter((r) => r.status === "PAID" || r.status === "REFUNDED");
  const net = live.reduce((n, r) => n + r.grandTotalSatang - r.refundedSatang, 0);
  const store = live.filter((r) => r.sourceModule === "POS").length;
  return { net, count: live.length, store, online: live.length - store, avg: divHalfUp(net, live.length) };
}

export async function billsPageData(ctx: RegisterCtx, actor: RegisterActor, q: unknown): Promise<BillsPageDataResult> {
  try {
    const c = ctxOf(ctx);
    const a = actorOf(actor);
    if (!a || !receiptReadScope(a)) return refuse("NO_PERMISSION");
    if (!c) return refuse("VALIDATION");
    const x = cleanQuery(q);
    if ("ok" in x) return x;
    if (!unitReadable(a, x.unitId)) return emptyPage(x);
    const { tenantId, systemId } = c;
    const base = { tenantId, systemId, unitId: x.unitId, docType: "SALE" as const, status: { in: LISTED } };

    const [rows, yRows] = await Promise.all([
      prisma.posSale.findMany({
        where: { ...base, ...dayWhere(x.date) },
        select: {
          id: true,
          receiptNo: true,
          createdAt: true,
          paidAt: true,
          sourceModule: true,
          memberId: true,
          soldByUserId: true,
          shiftId: true,
          grandTotalSatang: true,
          refundedSatang: true,
          status: true,
          payments: { select: { type: true } },
        },
      }),
      prisma.posSale.findMany({
        where: { ...base, status: { in: ["PAID", "REFUNDED"] }, ...dayWhere(addBillDays(x.date, -1)) },
        select: { status: true, grandTotalSatang: true, refundedSatang: true, sourceModule: true },
      }),
    ]);

    const offShift = (r: (typeof rows)[number]) => r.shiftId === null && r.payments.some((p) => p.type === "CASH");
    const counts = {
      all: rows.length,
      paid: rows.filter((r) => r.status === "PAID").length,
      voided: rows.filter((r) => r.status === "VOIDED").length,
      refunded: rows.filter((r) => r.status === "REFUNDED").length,
      offShiftCash: rows.filter(offShift).length,
    };
    const today = liveStats(rows);
    const yesterday = liveStats(yRows);
    const summary = { netSatang: today.net, billCount: today.count, storeCount: today.store, onlineCount: today.online, avgSatang: today.avg, yesterdayAvgSatang: yesterday.avg };

    // ลูกค้า (สมาชิก) ของบิลวันนี้ — ใช้ทั้งค้นหาและแสดงผล
    const memberIds = [...new Set(rows.map((r) => r.memberId).filter((m): m is string => !!m))];
    const customers: CustomerLite[] = memberIds.length
      ? await prisma.customer.findMany({
          where: { tenantId, id: { in: memberIds } },
          select: { id: true, name: true, firstName: true, lastName: true, phone: true, memberCode: true, tierDefId: true },
        })
      : [];
    const custById = new Map(customers.map((cu) => [cu.id, cu]));

    // ค้นหา: เลขบิลขึ้นต้น (ไม่สนตัวพิมพ์) หรือ ชื่อ/เบอร์/รหัสสมาชิก — เทียบตัวอักษรตรง ๆ ในหน่วยความจำ (ไม่มี LIKE ⇒ % _ เป็นตัวอักษรธรรมดา)
    const qn = x.q.toLowerCase();
    const qDigits = /^[\d\s+-]+$/.test(x.q) ? x.q.replace(/\D/g, "") : "";
    const matchesQ = (r: (typeof rows)[number]) => {
      if (!qn) return true;
      if ((r.receiptNo ?? "").toLowerCase().startsWith(qn)) return true;
      const cu = r.memberId ? custById.get(r.memberId) : undefined;
      if (!cu) return false;
      const name = [cu.name, [cu.firstName, cu.lastName].filter(Boolean).join(" ")].filter(Boolean).join(" ").toLowerCase();
      if (name.includes(qn)) return true;
      if ((cu.memberCode ?? "").toLowerCase().startsWith(qn)) return true;
      const phone = cu.phone ?? "";
      return phone.includes(x.q) || (qDigits.length >= 3 && phone.replace(/\D/g, "").includes(qDigits));
    };
    const matchesStatus = (r: (typeof rows)[number]) =>
      x.status === "ALL" ? true : x.status === "OFF_SHIFT_CASH" ? offShift(r) : r.status === x.status;
    const filtered = rows
      .filter((r) => matchesStatus(r) && (!x.channel || r.sourceModule === x.channel) && (!x.staffUserId || r.soldByUserId === x.staffUserId) && matchesQ(r))
      .sort((p, n) => timeOf(n).getTime() - timeOf(p).getTime() || (n.id < p.id ? -1 : n.id > p.id ? 1 : 0));
    const pageRows = filtered.slice((x.page - 1) * x.pageSize, x.page * x.pageSize);

    // ข้อมูลประกอบของหน้าที่แสดง: ใบคืน · ผู้ยกเลิก (audit) · ระดับสมาชิก · ชื่อพนักงาน
    const pageIds = pageRows.map((r) => r.id);
    const voidedIds = pageRows.filter((r) => r.status === "VOIDED").map((r) => r.id);
    const [refundDocs, voidAudits] = await Promise.all([
      pageIds.length
        ? prisma.posSale.findMany({
            where: { tenantId, docType: "REFUND", refSaleId: { in: pageIds } },
            select: { id: true, receiptNo: true, grandTotalSatang: true, refSaleId: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          })
        : [],
      voidedIds.length
        ? prisma.auditLog.findMany({
            where: { tenantId, action: "pos.sale.void", targetType: "PosSale", targetId: { in: voidedIds } },
            select: { targetId: true, actorId: true },
            orderBy: { createdAt: "desc" },
          })
        : [],
    ]);
    const tierIds = [...new Set(pageRows.map((r) => (r.memberId ? custById.get(r.memberId)?.tierDefId : null)).filter((t): t is string => !!t))];
    const tiers = tierIds.length ? await prisma.memberTierDef.findMany({ where: { tenantId, id: { in: tierIds } }, select: { id: true, name: true } }) : [];
    const tierName = new Map(tiers.map((t) => [t.id, t.name]));
    const voidBy = new Map<string, string>();
    for (const au of voidAudits) if (au.targetId && au.actorId && !voidBy.has(au.targetId)) voidBy.set(au.targetId, au.actorId);
    const names = await userNames([...rows.map((r) => r.soldByUserId), ...voidBy.values()]);

    const items: BillRow[] = pageRows.map((r) => {
      const cu = r.memberId ? custById.get(r.memberId) : undefined;
      const approver = voidBy.get(r.id);
      return {
        id: r.id,
        receiptNo: r.receiptNo,
        time: timeOf(r).toISOString(),
        sourceModule: r.sourceModule,
        customer: cu
          ? { name: customerName(cu), sub: [nonEmpty(cu.memberCode), cu.tierDefId ? tierName.get(cu.tierDefId) : undefined].filter(Boolean).join(" · ") } // แก้รอบ 1 F5: รหัสสมาชิก/ระดับเท่านั้น (ไม่แสดงเบอร์ · ค้นด้วยเบอร์ยังได้)
          : null,
        payMethods: payMethodsText(r.payments.map((p) => p.type)),
        staffName: r.soldByUserId ? (names.get(r.soldByUserId) ?? "-") : SYSTEM_NAME,
        grandTotalSatang: r.grandTotalSatang,
        refundedSatang: r.refundedSatang,
        status: r.status as BillSaleStatus,
        offShiftCash: offShift(r),
        ...(approver ? { voidApprovedBy: names.get(approver) ?? "-" } : {}),
        refunds: refundDocs.filter((d) => d.refSaleId === r.id).map((d) => ({ id: d.id, receiptNo: d.receiptNo, grandTotalSatang: d.grandTotalSatang })),
      };
    });

    const channels = [...new Set(rows.map((r) => r.sourceModule))].sort((p, n) => (p === "POS" ? -1 : n === "POS" ? 1 : p.localeCompare(n)));
    const staff = [...new Set(rows.map((r) => r.soldByUserId).filter((u): u is string => !!u))]
      .map((userId) => ({ userId, name: names.get(userId) ?? "-" }))
      .sort((p, n) => p.name.localeCompare(n.name, "th"));

    return { ok: true, date: x.date, counts, summary, items, total: filtered.length, page: x.page, pageSize: x.pageSize, channels, staff };
  } catch (e) {
    console.error("[pos/bills] billsPageData", e);
    return refuse("UNKNOWN");
  }
}

// ═══════════ billDetail (R2) ═══════════
export async function billDetail(ctx: RegisterCtx, actor: RegisterActor, input: unknown): Promise<BillDetailResult> {
  try {
    const c = ctxOf(ctx);
    const a = actorOf(actor);
    if (!a || !receiptReadScope(a)) return refuse("NO_PERMISSION");
    if (!c || !isRecord(input) || !isId(input.unitId)) return refuse("VALIDATION");
    if (!isId(input.saleId)) return refuse("SALE_NOT_FOUND");
    const unitId = input.unitId;
    if (!unitReadable(a, unitId)) return refuse("SALE_NOT_FOUND");
    const { tenantId, systemId } = c;

    // มติ CD-O13: เปิดได้เฉพาะบิลขาย (id ของใบคืน = SALE_NOT_FOUND)
    const sale = await prisma.posSale.findFirst({
      where: { id: input.saleId, tenantId, systemId, unitId, docType: "SALE", status: { in: LISTED } },
      include: { lines: { orderBy: { id: "asc" }, include: { options: { orderBy: { id: "asc" } } } }, payments: { orderBy: { id: "asc" } } },
    });
    if (!sale) return refuse("SALE_NOT_FOUND");

    const [bookId, shift, customer, coupons, refundDocs, audits] = await Promise.all([
      account.posAccountSystemId(tenantId, systemId),
      sale.shiftId ? prisma.posShift.findFirst({ where: { id: sale.shiftId, tenantId, unitId: sale.unitId }, select: { shiftNo: true, deviceId: true, deviceLabel: true, status: true } }) : null,
      sale.memberId
        ? prisma.customer.findFirst({ where: { id: sale.memberId, tenantId }, select: { id: true, name: true, firstName: true, lastName: true, phone: true, memberCode: true, tierDefId: true } })
        : null,
      prisma.couponRedemption.findMany({
        where: { tenantId, status: { not: "RELEASED" }, OR: [{ saleId: sale.id }, { refType: "PosSale", refId: sale.id }] },
        select: { discountSatang: true },
      }),
      prisma.posSale.findMany({
        where: { tenantId, docType: "REFUND", refSaleId: sale.id },
        select: { id: true, receiptNo: true, grandTotalSatang: true, createdAt: true, paidAt: true, reasonCode: true, note: true, soldByUserId: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      prisma.auditLog.findMany({
        where: { tenantId, targetType: "PosSale", targetId: sale.id, action: { in: ["pos.sale.void", "pos.receipt.reprint"] } },
        select: { action: true, actorId: true, after: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const [book, vat, device, tier, accounting] = await Promise.all([
      bookId ? prisma.accountSettings.findFirst({ where: { systemId: bookId, tenantId }, select: { taxId: true } }) : null,
      bookId ? account.vatConfigOf(bookId) : null,
      shift ? prisma.posDevice.findUnique({ where: { unitId_deviceCode: { unitId: sale.unitId, deviceCode: shift.deviceId } }, select: { tenantId: true, name: true } }) : null,
      customer?.tierDefId ? prisma.memberTierDef.findFirst({ where: { id: customer.tierDefId, tenantId }, select: { name: true } }) : null,
      account.posSaleAccountingRef({ tenantId, sourceSystemId: systemId, refId: sale.id }),
    ]);
    // POS P1.13 ▸ R7: คำขอใบกำกับเต็มรูปที่ยังรอ (ไม่มีเอกสาร) ◂
    const openTaxReq = sale.taxInvoiceDocId ? null : await prisma.posTaxInvoiceRequest.findFirst({ where: { tenantId, saleId: sale.id, status: "REQUESTED" }, select: { id: true, name: true, taxId: true, branchCode: true, address: true, email: true }, orderBy: { createdAt: "desc" } }); // P1.13U มติ 4: ข้อมูลคำขอไว้เติมฟอร์ม 15A ◂
    const [abbDoc, cnDocs, names] = await Promise.all([
      accounting ? prisma.accountDocument.findFirst({ where: { id: accounting.docId, tenantId }, select: { createdAt: true } }) : null,
      bookId && refundDocs.length
        ? prisma.accountDocument.findMany({
            where: { tenantId, systemId: bookId, docType: "CREDIT_NOTE", refType: "PosSale", refId: { in: refundDocs.map((d) => d.id) } },
            select: { refId: true, docNo: true },
          })
        : [],
      userNames([sale.soldByUserId, ...refundDocs.map((d) => d.soldByUserId), ...audits.map((x) => x.actorId)]),
    ]);
    const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? "-") : SYSTEM_NAME);

    // ── ยอด (สตางค์จากแถว DB · สูตรเดียวกับ receiptPayload) ──
    const subtotal = sale.lines.reduce((t, l) => t + l.qty * l.unitPriceSatang, 0);
    const lineDiscount = sale.lines.reduce((t, l) => t + l.discountSatang, 0);
    const coupon = coupons.reduce((t, x) => t + x.discountSatang, 0);
    const tierDisc = sale.tierDiscountSatang;
    const hasVat = sale.vatSatang > 0;
    const receiptKind = receiptKindOf({ vatRegistered: !!vat?.vatRegistered, posAbbreviatedInvoice: !!vat?.posAbbreviatedInvoice, taxId: book?.taxId, vatSatang: sale.vatSatang });
    const staffName = nameOf(sale.soldByUserId);
    const dev = device && device.tenantId === tenantId ? device : null;
    const deviceName = dev?.name ?? shift?.deviceLabel ?? null;

    // ── ไทม์ไลน์ (เฉพาะเหตุการณ์ที่มีหลักฐานในฐาน — ไม่แต่งแถว LINE/กำลังทำรายการ) ──
    const timeline: { time: string; text: string; at: number }[] = [];
    const push = (d: Date, text: string) => timeline.push({ time: d.toISOString(), text, at: d.getTime() });
    push(timeOf(sale), `เปิดบิลและชำระครบ · ${staffName}`);
    if (accounting && abbDoc) push(abbDoc.createdAt, `ลงบัญชีอัตโนมัติ ${accounting.docNo ?? ""}`.trim() + (sale.pointEarned > 0 ? " · ให้แต้มสมาชิก" : ""));
    const cnByRef = new Map(cnDocs.map((d) => [d.refId, d.docNo]));
    for (const d of refundDocs) {
      const label = d.reasonCode ? (REFUND_REASON_LABEL_TH[d.reasonCode] ?? d.reasonCode) : "";
      push(timeOf(d), [`คืนเงิน ${moneyText(d.grandTotalSatang)}`, nameOf(d.soldByUserId), label, d.receiptNo ?? ""].filter(Boolean).join(" · "));
    }
    for (const au of audits) {
      if (au.action === "pos.sale.void") {
        const reason = isRecord(au.after) && typeof au.after.reason === "string" ? au.after.reason : "";
        push(au.createdAt, ["ยกเลิกบิล", nameOf(au.actorId), reason].filter(Boolean).join(" · "));
      } else push(au.createdAt, `พิมพ์สำเนา · ${nameOf(au.actorId)}`);
    }
    timeline.sort((p, n) => p.at - n.at);

    // ── ปุ่มที่กดได้ ──
    const isPos = sale.sourceModule === "POS";
    const canVoidPerm = evaluate(a, { module: "pos", action: VOID_PERMISSION, unitId });
    // P1.13U fix F2: ข้อมูลคำขอใบกำกับ (เลข/ที่อยู่/อีเมลของลูกค้า) เฉพาะผู้ที่ออกใบกำกับได้ที่สาขานี้ · ชื่อผู้ซื้อเห็นทุกคน
    const canIssueTax = evaluate(a, { module: "pos", action: "pos.taxinvoice.issue", unitId });
    const shiftClosed = !!sale.shiftId && isPos && shift?.status !== "OPEN";
    const canVoid = canVoidPerm && sale.status === "PAID" && sale.refundedSatang === 0 && isPos && !shiftClosed;
    // มติ CD-O7: NO_PERMISSION → NOT_POS → HAS_REFUNDS → SHIFT_CLOSED
    let voidBlockedReason: BillVoidBlockedReason | undefined;
    if (!canVoid) {
      if (!canVoidPerm) voidBlockedReason = "NO_PERMISSION";
      else if (!isPos) voidBlockedReason = "NOT_POS";
      else if (sale.refundedSatang > 0) voidBlockedReason = "HAS_REFUNDS";
      else if (shiftClosed) voidBlockedReason = "SHIFT_CLOSED";
    }
    // drift 6: can.refund = สิทธิ์ AND บิลคืนได้จริง (saleForRefund ของ P1.8: บิล POS · PAID · ไม่ใช่บัตรกำนัล · ยังมีจำนวนให้คืน)
    let canRefund = false;
    if (isPos && sale.status === "PAID" && !sale.giftCardId && evaluate(a, { module: "pos", action: REFUND_PERMISSION, unitId })) {
      const fr = await saleForRefund({ tenantId, systemId, unitId }, a, { saleId: sale.id });
      canRefund = fr.ok === true && fr.canRefund && fr.sale.refundable && fr.lines.some((l) => l.refundableQty > 0);
    }

    const bill: BillDetail = {
      id: sale.id,
      receiptNo: sale.receiptNo,
      status: sale.status as BillSaleStatus,
      docType: "SALE",
      time: timeOf(sale).toISOString(),
      staffName,
      deviceName,
      shiftNo: shift?.shiftNo ?? null,
      sourceModule: sale.sourceModule,
      lines: sale.lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        unitPriceSatang: l.unitPriceSatang,
        discountSatang: l.discountSatang,
        lineTotalSatang: l.lineTotalSatang,
        options: l.options.map((o) => o.choiceName),
      })),
      totals: {
        subtotal,
        lineDiscount,
        billDiscount: sale.discountSatang - coupon - tierDisc,
        coupon,
        tier: tierDisc,
        serviceCharge: sale.serviceChargeSatang,
        vatSatang: sale.vatSatang,
        vatRateBp: hasVat && vat && vat.vatRegistered ? vat.vatRateBp : 0,
        grandTotal: sale.grandTotalSatang,
        tip: sale.tipSatang,
        refunded: sale.refundedSatang,
      },
      payments: sale.payments.map((p) => ({
        type: p.type,
        amountSatang: p.amountSatang,
        ...(p.tenderedSatang !== null ? { tenderedSatang: p.tenderedSatang } : {}),
        ...(p.changeSatang !== null ? { changeSatang: p.changeSatang } : {}),
        ...(nonEmpty(p.reference) ? { reference: nonEmpty(p.reference)! } : {}),
      })),
      member: customer
        ? { name: customerName(customer), memberCode: customer.memberCode, ...(tier?.name ? { tierName: tier.name } : {}), pointsEarned: sale.pointEarned, customerId: customer.id }
        : null,
      accounting: accounting ? { docNo: accounting.docNo, docId: accounting.docId } : null,
      receiptKind,
      taxInvoice: sale.taxInvoiceDocId
        ? {
            status: "ISSUED",
            docNo: accounting && accounting.docId === sale.taxInvoiceDocId ? accounting.docNo : null,
            ...(snapshotBuyer(sale.taxInvoice)?.name ? { buyerName: snapshotBuyer(sale.taxInvoice)!.name } : {}),
          }
        : openTaxReq
          ? {
              status: "REQUESTED",
              requestId: openTaxReq.id,
              buyerName: openTaxReq.name,
              ...(canIssueTax ? { request: { name: openTaxReq.name, taxId: openTaxReq.taxId, branchCode: openTaxReq.branchCode, address: openTaxReq.address, email: openTaxReq.email } } : {}),
            }
          : { status: "NONE" },
      refunds: refundDocs.map((d) => ({
        id: d.id,
        receiptNo: d.receiptNo,
        grandTotalSatang: d.grandTotalSatang,
        time: timeOf(d).toISOString(),
        reasonCode: d.reasonCode,
        reason: d.note,
        byName: nameOf(d.soldByUserId),
        accounting: cnByRef.has(d.id) ? { docNo: cnByRef.get(d.id) ?? null } : null,
      })),
      timeline: timeline.map(({ time, text }) => ({ time, text })),
      can: { void: canVoid, refund: canRefund, reprint: true },
      ...(voidBlockedReason ? { voidBlockedReason } : {}),
    };
    return { ok: true, bill };
  } catch (e) {
    console.error("[pos/bills] billDetail", e);
    return refuse("UNKNOWN");
  }
}

// ═══════════ voidSaleByActor (R3) ═══════════
/** การยกเลิกครั้งก่อนด้วยคีย์นี้ (audit pos.sale.void ที่เก็บ idempotencyKey) — drift 4: จับการเล่นซ้ำก่อนเรียก voidSale */
async function voidedWithKey(tenantId: string, saleId: string, key: string): Promise<boolean> {
  const rows = await prisma.auditLog.findMany({ where: { tenantId, action: "pos.sale.void", targetType: "PosSale", targetId: saleId }, select: { after: true } });
  return rows.some((r) => isRecord(r.after) && r.after.idempotencyKey === key);
}

export async function voidSaleByActor(ctx: RegisterCtx, actor: RegisterActor, input: unknown): Promise<VoidSaleActionResult> {
  try {
    const c = ctxOf(ctx);
    const a = actorOf(actor);
    if (!a) return refuse("NO_PERMISSION");
    if (!c || !isRecord(input) || !isId(input.unitId)) return refuse("VALIDATION");
    if (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim() || input.idempotencyKey.length > MAX_KEY) return refuse("VALIDATION", "รหัสรายการ (idempotencyKey) ไม่ถูกต้อง");
    if (!isId(input.saleId)) return refuse("SALE_NOT_FOUND");
    const { tenantId, systemId } = c;
    const unitId = input.unitId;
    const saleId = input.saleId;
    const key = input.idempotencyKey;
    if (!canAccessUnit(a, unitId)) return refuse("SALE_NOT_FOUND");
    // POS P1.15 ▸ มติ 11: PIN ผู้จัดการที่ถูกต้อง (ผู้จัดการมี pos.sale.void) อนุญาตแทนผู้ขอที่ไม่มีสิทธิ์ยกเลิก — ผู้ขอต้องยังมี pos.sale.create ◂
    const hasPin = !absent(input.managerPin);
    // fix รอบ 1 F2: PIN ผู้จัดการต้องมาคู่ managerUserId เสมอ
    if (hasPin && (absent(input.managerUserId) || !isId(input.managerUserId))) return refuse("VALIDATION", "เลือกผู้จัดการก่อนใส่ PIN");
    const canVoid = evaluate(a, { module: "pos", action: VOID_PERMISSION, unitId });
    if (!canVoid && !(hasPin && evaluate(a, { module: "pos", action: "pos.sale.create", unitId }))) {
      return refuse("NO_PERMISSION", "บัญชีนี้ยังไม่มีสิทธิ์ยกเลิกบิล — ขอให้เจ้าของร้านหรือผู้จัดการทำรายการ");
    }
    const reasonRaw = typeof input.reason === "string" ? input.reason : "";
    const reason = reasonRaw.trim();
    if (!reason || reason.length > VOID_REASON_MAX) return refuse("REASON_REQUIRED");

    const sale = await prisma.posSale.findFirst({
      where: { id: saleId, tenantId, systemId, unitId },
      select: { id: true, status: true, docType: true, sourceModule: true, refundedSatang: true, shiftId: true, grandTotalSatang: true, receiptNo: true },
    });
    if (!sale) return refuse("SALE_NOT_FOUND");
    // เล่นซ้ำคีย์เดิม = ผลเดิม (ไม่ throw · ไม่มี event/audit ที่สอง) · คีย์ใหม่บนบิลที่ยกเลิกแล้ว = SALE_NOT_VOIDABLE
    if (sale.status === "VOIDED") return (await voidedWithKey(tenantId, sale.id, key)) ? { ok: true, sale: { id: sale.id, status: "VOIDED" }, duplicated: true } : refuse("SALE_NOT_VOIDABLE");
    // drift 3: บิลของโมดูลอื่นยกเลิกที่โมดูลนั้น (voidSale เองรับไว้เพื่อโมดูลเหล่านั้น — ปฏิเสธที่นี่เท่านั้น)
    if (sale.docType !== "SALE" || sale.sourceModule !== "POS") return refuse("SALE_NOT_VOIDABLE");
    if (sale.refundedSatang > 0) return refuse("HAS_REFUNDS");
    if (sale.status !== "PAID") return refuse("SALE_NOT_VOIDABLE");
    if (sale.shiftId) {
      const sh = await prisma.posShift.findFirst({ where: { id: sale.shiftId, tenantId }, select: { status: true } });
      if (sh?.status !== "OPEN") return refuse("SHIFT_CLOSED");
    }
    const deviceId = isRecord(ctx) && typeof ctx.deviceId === "string" ? ctx.deviceId : null;

    // POS P1.15 ▸ R5 + CD4: PIN ผู้จัดการ = ยกเลิกทันที (แม้มีกติกา) · audit void ผู้กระทำ = ผู้จัดการ + pin_override · ยกเลิกคำขอที่รอของบิลนี้ ◂
    if (hasPin) {
      const v = await verifyManagerPin({ tenantId, unitId, deviceId }, { managerPin: input.managerPin, managerUserId: input.managerUserId });
      if (v.ok === false) return pinRefusal(v);
      if (!evaluate(v.actor, { module: "pos", action: VOID_PERMISSION, unitId })) return refuse("NO_PERMISSION", "PIN นี้ไม่มีสิทธิ์ยกเลิกบิล — ใช้ PIN ของผู้จัดการ");
      const done = await voidNow(tenantId, unitId, sale.id, key, { actorUserId: v.actor.userId, reason, idempotencyKey: key, via: "pin_override", requestId: null, requestedByUserId: a.userId });
      if (!done.ok || done.duplicated) return done;
      const cancelled = await cancelOpenPosRequest(tenantId, "POS_VOID", sale.id);
      await auditPinOverride({ tenantId, action: "POS_VOID", requestId: cancelled, byUserId: v.actor.userId, forUserId: a.userId, targetType: "PosSale", targetId: sale.id, extra: { saleId: sale.id } });
      return done;
    }

    // POS P1.15 ▸ R5: กติกา POS_VOID ที่เข้าเงื่อนไข (ยอดบิล) = ยื่นคำขอ ไม่ยกเลิก · มีคำขอรออยู่ = PENDING_APPROVAL (มติ 9) · ไม่มีกติกา = ทางเดิม ◂
    const ap = await submitPosApproval({
      tenantId,
      unitId,
      systemId,
      kind: "POS_VOID",
      ref: sale.id,
      entityIdOf: (n) => (n === 1 ? sale.id : `${sale.id}:${n}`),
      amountSatang: sale.grandTotalSatang,
      requestedById: a.userId,
      payload: { saleId: sale.id, reason, idempotencyKey: key, deviceId, receiptNo: sale.receiptNo, title: `ยกเลิกบิล ${sale.receiptNo ?? sale.id.slice(-6)}` },
    });
    if (ap.status !== "AUTO") {
      const code = ap.status === "PENDING" ? "PENDING_APPROVAL" : "APPROVAL_REQUIRED";
      return { ok: false, code, message: POS_APPROVAL_MESSAGE[code], requestId: ap.requestId };
    }
    return await voidNow(tenantId, unitId, sale.id, key, { actorUserId: a.userId, reason, idempotencyKey: key });
  } catch (e) {
    console.error("[pos/bills] voidSaleByActor", e);
    return refuse("UNKNOWN");
  }
}

/** ยกเลิกจริง (voidSale ตัวเดียว + audit ในtx) — ชนกับการยกเลิก/คืนเงินที่ commit ระหว่างนี้ = อ่านแถวใหม่แล้วตัดสินจากของจริง */
async function voidNow(tenantId: string, unitId: string, saleId: string, key: string, audit: VoidSaleAudit): Promise<VoidSaleActionResult> {
  try {
    await voidSale(tenantId, unitId, saleId, audit);
  } catch (e) {
    const now = await prisma.posSale.findFirst({ where: { id: saleId, tenantId }, select: { status: true, refundedSatang: true } });
    if (now?.status === "VOIDED") return (await voidedWithKey(tenantId, saleId, key)) ? { ok: true, sale: { id: saleId, status: "VOIDED" }, duplicated: true } : refuse("SALE_NOT_VOIDABLE");
    if (e instanceof PosSaleError && (e.code === "HAS_REFUNDS" || e.code === "SHIFT_CLOSED")) return refuse(e.code);
    if (e instanceof Error && e.message === "บิลนี้ void ไม่ได้") return refuse("SALE_NOT_VOIDABLE");
    throw e;
  }
  const after = await prisma.posSale.findFirst({ where: { id: saleId, tenantId }, select: { status: true } });
  return { ok: true, sale: { id: saleId, status: after?.status ?? "VOIDED" } };
}

/** POS P1.15 ▸ คำปฏิเสธของ PIN ผู้จัดการ → ชนิดผลของไฟล์นี้ (PIN_* / DEVICE_REVOKED ส่งต่อ · ไม่ระบุผู้จัดการ = VALIDATION · อื่น = UNKNOWN) ◂ */
function pinRefusal(v: { code: string; message: string }): { ok: false; code: "PIN_INVALID" | "PIN_LOCKED" | "DEVICE_REVOKED"; message: string } | ReturnType<typeof refuse> {
  if (v.code === "PIN_INVALID" || v.code === "PIN_LOCKED" || v.code === "DEVICE_REVOKED") return { ok: false, code: v.code, message: v.message };
  return v.code === "VALIDATION" ? refuse("VALIDATION", v.message) : refuse("UNKNOWN");
}
