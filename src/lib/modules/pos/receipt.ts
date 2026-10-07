// receipt.ts — ข้อมูลใบเสร็จของบิล POS (P1.10 · มติ R5 + CD3–CD5) = สัญญาเนื้อหาที่ตัวเรนเดอร์ (receipt-render.ts) พิมพ์ตาม
// สัญญา = scripts/qc-pos-p1.10.mts (P1–P6 · A3 · RS2) · ภาพ ledger/design-pos/11-customer-display.png แผง B
//
// 🔴 อ่านอย่างเดียว — ไม่เขียนบิล ไม่มี event (R8) · copy:true = AuditLog "pos.receipt.reprint" 1 แถวต่อการเรียก (T8) · ปฏิเสธ = ไม่มี audit
// 🔴 สิทธิ์ pos.sale.read (มติ CD3 — ผู้มี pos.sale.create ได้โดยนัย) · บิลต้องอยู่ในขอบเขตสาขาของผู้เรียก (posSaleWhere) ·
//    บิลของสาขา/ระบบ/ร้านอื่น หรือ id มั่ว = SALE_NOT_FOUND (ไม่บอกว่ามีอยู่)
// 🔴 kind = TAX_INVOICE_ABB เฉพาะเมื่อสมุดบัญชีที่ผูก POS จด VAT + เปิดใบกำกับอย่างย่อจาก POS + มีเลขผู้เสียภาษี (T2) · อื่น = RECEIPT
//    ข้อมูลหัวใบ: ค่าตั้งใบเสร็จ (settings.pos.receipt.header) ก่อน · ว่าง = โปรไฟล์ของสมุด (orgName · address · phone · logoUrl) ·
//    เลขผู้เสียภาษี/สาขา มาจากสมุดเสมอ (ไม่ใช่ค่าตั้ง)
// 🔴 เงินทุกตัวเป็นสตางค์จำนวนเต็มจากแถว DB — subtotal − ส่วนลดรายการ − ส่วนลดท้ายบิล − คูปอง − ส่วนลดระดับ + ค่าบริการ = ยอดสุทธิ ·
//    ฐานภาษี + VAT = ยอดสุทธิ (VAT ที่เก็บบนบิล · P1.6 splitIncludedVat) · ทิปอยู่นอกยอด (Σ จ่าย = ยอด + ทิป)
import type { PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import * as account from "@/lib/modules/account";
import { posSaleWhere, type PosUnitScope } from "./access";
import { prisma } from "./db";
import { RECEIPT_LABELS, type ReceiptDocType, type ReceiptKind, type ReceiptPayload } from "./receipt-render";
import { receiptSettingsOf } from "./receipt-settings";
import type { RegisterActor } from "./register-shared";

type Db = PrismaClient;
export type ReceiptCtx = { tenantId: string; systemId: string; unitId?: string; deviceId?: string };
export type ReceiptRefusalCode = "PERMISSION_DENIED" | "SALE_NOT_FOUND" | "VALIDATION" | "INTERNAL";
export type ReceiptRefusal = { ok: false; code: ReceiptRefusalCode; message: string };
export type ReceiptPayloadResult = { ok: true; payload: ReceiptPayload } | ReceiptRefusal;

const MSG: Record<ReceiptRefusalCode, string> = {
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ดูบิล/พิมพ์ใบเสร็จ — ขอสิทธิ์จากเจ้าของร้าน",
  SALE_NOT_FOUND: "ไม่พบบิลนี้ (อาจเป็นของสาขาอื่น)",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  INTERNAL: "ระบบใบเสร็จขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: ReceiptRefusalCode, message?: string): ReceiptRefusal => ({ ok: false, code, message: message ?? MSG[code] });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const nonEmpty = (v: string | null | undefined): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

/** อ่านบิลได้ไหม (มติ CD3: pos.sale.read · pos.sale.create ได้โดยนัย) — ที่สาขา unitId หรือระดับร้าน */
const canRead = (a: RegisterActor, unitId?: string) =>
  evaluate(a, { module: "pos", action: "pos.sale.read", unitId }) || evaluate(a, { module: "pos", action: "pos.sale.create", unitId });

/** ขอบเขตสาขาที่อ่านบิลได้ (แบบ posSalesScope แต่ใช้สิทธิ์อ่าน) — null = ไม่มีสิทธิ์ที่สาขาใดเลย */
export function receiptReadScope(a: RegisterActor): PosUnitScope | null {
  if (!canRead(a)) return null;
  if (a.role === "OWNER" || a.unitAccess.includes("*")) return { allUnits: true };
  const unitIds = a.unitAccess.filter((u) => canAccessUnit(a, u) && canRead(a, u));
  return unitIds.length ? { allUnits: false, unitIds } : null;
}

/**
 * ข้อมูลใบเสร็จของบิล (R5) — `copy: true` = พิมพ์สำเนา (renderer ประทับ "สำเนา") + AuditLog pos.receipt.reprint
 * ctx = { tenantId (session), systemId (ระบบ POS ของบิล) } · unitId ไม่บังคับ (ขอบเขตมาจากสิทธิ์ของผู้เรียก)
 */
export async function receiptPayload(ctx: ReceiptCtx, actor: RegisterActor, input: { saleId: string; copy?: boolean }, client?: Db): Promise<ReceiptPayloadResult> {
  try {
    const db = client ?? prisma;
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId)) return refuse("SALE_NOT_FOUND");
    const a = actorOf(actor);
    if (!a) return refuse("PERMISSION_DENIED");
    const scope = receiptReadScope(a);
    if (!scope) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !Object.keys(input).every((k) => k === "saleId" || k === "copy")) return refuse("VALIDATION");
    if (input.copy !== undefined && typeof input.copy !== "boolean") return refuse("VALIDATION");
    if (!isId(input.saleId)) return refuse("SALE_NOT_FOUND");
    const copy = input.copy === true;
    const { tenantId, systemId } = ctx;

    const sale = await db.posSale.findFirst({
      where: { id: input.saleId, ...posSaleWhere(tenantId, systemId, scope) },
      include: { lines: { orderBy: { id: "asc" }, include: { options: { orderBy: { id: "asc" } } } }, payments: { orderBy: { id: "asc" } } },
    });
    if (!sale) return refuse("SALE_NOT_FOUND");

    // ── ระบบ POS · สาขา · ค่าตั้งใบเสร็จ · สมุดบัญชีที่ผูก ──
    const [posSys, unit, tenant, bookId] = await Promise.all([
      db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { settings: true } }),
      db.businessUnit.findFirst({ where: { id: sale.unitId, tenantId }, select: { name: true } }),
      db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      account.posAccountSystemId(tenantId, systemId),
    ]);
    if (!posSys) return refuse("SALE_NOT_FOUND");
    const rs = receiptSettingsOf(posSys.settings);
    const book = bookId
      ? await db.accountSettings.findFirst({
          where: { systemId: bookId, tenantId },
          select: { orgName: true, taxId: true, branchCode: true, address: true, phone: true, logoUrl: true },
        })
      : null;
    const vat = bookId ? await account.vatConfigOf(bookId) : null;
    const taxId = nonEmpty(book?.taxId);
    const kind: ReceiptKind = vat && vat.vatRegistered && vat.posAbbreviatedInvoice && taxId ? "TAX_INVOICE_ABB" : "RECEIPT";

    // ── เครื่อง/กะ ของบิล (PosSale.shiftId → PosShift.deviceId → PosDevice ของสาขาเดียวกัน) ──
    const shift = sale.shiftId
      ? await db.posShift.findFirst({ where: { id: sale.shiftId, tenantId, unitId: sale.unitId }, select: { shiftNo: true, deviceId: true, deviceLabel: true } })
      : null;
    const device = shift
      ? await db.posDevice.findUnique({ where: { unitId_deviceCode: { unitId: sale.unitId, deviceCode: shift.deviceId } }, select: { tenantId: true, name: true, posRegNo: true } })
      : null;
    const dev = device && device.tenantId === tenantId ? device : null;

    // ── ผู้ขาย · สมาชิก · คูปอง ──
    const [seller, customer, coupons] = await Promise.all([
      rs.showCashier && sale.soldByUserId ? db.user.findUnique({ where: { id: sale.soldByUserId }, select: { name: true } }) : null,
      sale.memberId ? db.customer.findFirst({ where: { id: sale.memberId, tenantId }, select: { id: true, name: true, firstName: true, lastName: true, memberCode: true, tierDefId: true } }) : null,
      db.couponRedemption.findMany({
        where: { tenantId, status: { not: "RELEASED" }, OR: [{ saleId: sale.id }, { refType: "PosSale", refId: sale.id }] },
        select: { discountSatang: true, coupon: { select: { code: true } } },
      }),
    ]);
    const [tier, balance] = customer
      ? await Promise.all([
          customer.tierDefId ? db.memberTierDef.findFirst({ where: { id: customer.tierDefId, tenantId }, select: { name: true } }) : null,
          db.pointBalance.findFirst({ where: { tenantId, customerId: customer.id }, orderBy: { updatedAt: "desc" }, select: { balance: true } }),
        ])
      : [null, null];

    // ── ยอด (สตางค์จากแถว DB) ──
    const subtotalSatang = sale.lines.reduce((t, l) => t + l.qty * l.unitPriceSatang, 0);
    const lineDiscountSatang = sale.lines.reduce((t, l) => t + l.discountSatang, 0);
    const couponDiscountSatang = coupons.reduce((t, c) => t + c.discountSatang, 0);
    const tierDiscountSatang = sale.tierDiscountSatang;
    // PosSale.discountSatang = ส่วนลดท้ายบิล + คูปอง + สิทธิ์สมาชิก (ระดับ + ว่อชเชอร์) — ส่วนที่ไม่ใช่คูปอง/ระดับ = ส่วนลดท้ายบิล
    const billDiscountSatang = sale.discountSatang - couponDiscountSatang - tierDiscountSatang;
    const vatSatang = sale.vatSatang;

    const anySale = sale as unknown as Record<string, unknown>;
    const docType: ReceiptDocType = anySale.docType === "REFUND" ? "REFUND" : "SALE"; // P1.8 เพิ่มคอลัมน์ docType — ก่อนนั้น = SALE เสมอ
    const refReceiptNo = docType === "REFUND" && typeof anySale.refReceiptNo === "string" ? anySale.refReceiptNo : undefined;

    const shopName = nonEmpty(rs.header.name) ?? nonEmpty(book?.orgName) ?? nonEmpty(tenant?.name) ?? nonEmpty(unit?.name) ?? "-";
    const logoUrl = rs.header.logoUrl ?? nonEmpty(book?.logoUrl);
    const memberName = customer ? (nonEmpty(customer.name) ?? nonEmpty([customer.firstName, customer.lastName].filter(Boolean).join(" ")) ?? nonEmpty(customer.memberCode) ?? "-") : "";
    const couponCode = coupons.map((c) => c.coupon?.code).filter((c): c is string => !!c).join(", ");

    const payload: ReceiptPayload = {
      docType,
      kind,
      copy,
      paper: null,
      shop: {
        name: shopName,
        branchName: unit?.name ?? "",
        address: nonEmpty(rs.header.address) ?? nonEmpty(book?.address) ?? "",
        phone: nonEmpty(rs.header.phone) ?? nonEmpty(book?.phone) ?? "",
        ...(kind === "TAX_INVOICE_ABB" ? { taxId, branchNo: nonEmpty(book?.branchCode) ?? "00000" } : {}),
        ...(logoUrl ? { logoUrl } : {}),
      },
      device: {
        ...(dev?.posRegNo ? { posRegNo: dev.posRegNo } : {}),
        ...((dev?.name ?? shift?.deviceLabel) ? { name: (dev?.name ?? shift?.deviceLabel)! } : {}),
      },
      doc: {
        receiptNo: sale.receiptNo ?? "",
        issuedAt: (sale.paidAt ?? sale.createdAt).toISOString(),
        ...(nonEmpty(seller?.name) ? { cashierName: nonEmpty(seller?.name)! } : {}),
        ...(shift ? { shiftNo: shift.shiftNo } : {}),
        ...(refReceiptNo ? { refReceiptNo } : {}),
      },
      lines: sale.lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        unitPriceSatang: l.unitPriceSatang,
        lineTotalSatang: l.lineTotalSatang,
        discountSatang: l.discountSatang,
        options: l.options.map((o) => o.choiceName),
        ...(nonEmpty(l.note) ? { note: nonEmpty(l.note)! } : {}),
        ...(l.weightGrams !== null ? { weightGrams: l.weightGrams } : {}),
      })),
      totals: {
        subtotalSatang,
        lineDiscountSatang,
        billDiscountSatang,
        couponDiscountSatang,
        ...(couponCode ? { couponCode } : {}),
        tierDiscountSatang,
        serviceChargeSatang: sale.serviceChargeSatang,
        grandTotalSatang: sale.grandTotalSatang,
        vatBaseSatang: sale.grandTotalSatang - vatSatang,
        vatSatang,
        vatRateBp: vat && vat.vatRegistered ? vat.vatRateBp : 0,
        tipSatang: sale.tipSatang,
      },
      payments: sale.payments.map((p) => ({
        type: p.type,
        amountSatang: p.amountSatang,
        ...(p.tenderedSatang !== null ? { tenderedSatang: p.tenderedSatang } : {}),
        ...(p.changeSatang !== null ? { changeSatang: p.changeSatang } : {}),
        ...(nonEmpty(p.reference) ? { reference: nonEmpty(p.reference)! } : {}),
      })),
      // showPoints ปิด = ไม่พิมพ์ส่วนสมาชิก/แต้ม
      ...(customer && rs.showPoints
        ? {
            member: {
              name: memberName,
              ...(tier?.name ? { tierName: tier.name } : {}),
              pointEarned: sale.pointEarned,
              ...(balance ? { pointBalance: balance.balance } : {}),
            },
          }
        : {}),
      footer: { text: rs.footer, qrEReceiptUrl: null, fullTaxInvoiceHint: kind === "TAX_INVOICE_ABB" },
      labels: { th: RECEIPT_LABELS.th, en: RECEIPT_LABELS.en },
    };

    if (copy) {
      await writeAudit({
        tenantId,
        actorId: a.userId,
        action: "pos.receipt.reprint",
        targetType: "PosSale",
        targetId: sale.id,
        after: { receiptNo: sale.receiptNo, kind, unitId: sale.unitId },
      });
    }
    return { ok: true, payload };
  } catch (e) {
    console.error("[pos/receipt] receiptPayload INTERNAL", e);
    return refuse("INTERNAL");
  }
}
