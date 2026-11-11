// etax-link.ts — รอยต่อ POS → e-Tax Invoice by Email (P3-SKEL R11 R12 · มติ §10-5) — อ่านอย่างเดียว · โครง
//
// etaxPreview: บิลของสาขานี้ที่ออกใบกำกับเต็มรูปแล้ว (taxInvoiceDocId) **และ** มีอีเมลผู้ซื้อ → XML ตัวอย่าง (ขมธอ. 3-2560 ส่วนย่อย · platform/etax/render.ts)
//   ไม่มีใบกำกับ / ไม่มีอีเมล = NOT_ELIGIBLE · สิทธิ์ pos.taxinvoice.issue ที่สาขา · provider null · state "NOT_CONFIGURED"
// requestEtax: ส่งจริง = NOT_CONFIGURED (ยังไม่เลือกผู้ให้บริการ — W20) · ไม่เขียนอะไรเลย
// 🔴 คิว/สถานะ = AccountDocument.etaxStatus/etaxMeta ภายหลัง โดยเจ้าของโมดูลบัญชีเท่านั้น (OP §ACCOUNT) — ไฟล์นี้อ่าน AccountDocument/AccountSettings อย่างเดียว
//    (แบบเดียวกับ bills.ts) · ไม่แตะ modules/account/** · ยอดเงินมาจากแถว PosSale ตรง (สตางค์) ไม่คิดใหม่
import { evaluate } from "@/lib/core/rbac";
import * as account from "@/lib/modules/account";
import { normalizeEtaxDocument, renderEtaxXml } from "@/lib/platform/etax/render";
import type { EtaxLine } from "@/lib/platform/etax/types";
import { posMembership } from "./access";
import { prisma } from "./db";
import { snapshotBuyer } from "./tax-invoice-shared";

export type EtaxLinkCode = "NOT_FOUND" | "SALE_NOT_FOUND" | "PERMISSION_DENIED" | "NOT_ELIGIBLE" | "NOT_CONFIGURED" | "VALIDATION" | "UNKNOWN";
export type EtaxLinkRefusal = { ok: false; code: EtaxLinkCode; message: string };
export type EtaxPreviewResult = { ok: true; xml: string; provider: null; state: "NOT_CONFIGURED"; docNo: string; buyerEmail: string } | EtaxLinkRefusal;
type Ctx = { tenantId: string; systemId: string; unitId: string };
type Actor = { userId: string; role: string; unitAccess?: unknown; permissions?: unknown };

const MSG: Record<EtaxLinkCode, string> = {
  NOT_FOUND: "ไม่พบจุดขายนี้",
  SALE_NOT_FOUND: "ไม่พบบิลนี้ในสาขานี้",
  PERMISSION_DENIED: "ต้องมีสิทธิ์ออกใบกำกับภาษี (pos.taxinvoice.issue) ที่สาขานี้",
  NOT_ELIGIBLE: "ส่ง e-Tax ได้เฉพาะบิลที่ออกใบกำกับภาษีเต็มรูปแล้วและมีอีเมลผู้ซื้อ",
  NOT_CONFIGURED: "ส่ง e-Tax ทางอีเมล · รอผู้ให้บริการ (ยังไม่ได้เชื่อม — W4/W20)",
  VALIDATION: "ข้อมูลเอกสารไม่ครบสำหรับ e-Tax",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const refuse = (code: EtaxLinkCode, message?: string): EtaxLinkRefusal => ({ ok: false, code, message: message ?? MSG[code] });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const thaiDate = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

function membershipOf(actor: unknown) {
  return isRecord(actor) && typeof actor.role === "string" && typeof actor.userId === "string" ? posMembership(actor as Parameters<typeof posMembership>[0]) : null;
}

type Loaded = { xml: string; docNo: string; email: string };

async function load(ctx: unknown, actor: unknown, input: unknown): Promise<Loaded | EtaxLinkRefusal> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
  const c = ctx as Ctx;
  const m = membershipOf(actor);
  if (!m || !evaluate(m, { module: "pos", action: "pos.taxinvoice.issue", unitId: c.unitId })) return refuse("PERMISSION_DENIED");
  if (!isRecord(input) || !isId(input.saleId)) return refuse("SALE_NOT_FOUND");
  const sale = await prisma.posSale.findFirst({
    where: { id: input.saleId, tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId, docType: "SALE" },
    select: { id: true, receiptNo: true, status: true, taxInvoice: true, taxInvoiceDocId: true, grandTotalSatang: true, vatSatang: true, paidAt: true, createdAt: true, lines: { orderBy: { id: "asc" }, select: { name: true, qty: true, unitPriceSatang: true, lineTotalSatang: true } } },
  });
  if (!sale) return refuse("SALE_NOT_FOUND");
  if (sale.status === "VOIDED" || !sale.taxInvoiceDocId) return refuse("NOT_ELIGIBLE");
  const buyer = snapshotBuyer(sale.taxInvoice);
  const email = typeof buyer?.email === "string" ? buyer.email.trim() : "";
  if (!buyer || !email) return refuse("NOT_ELIGIBLE");
  const bookId = await account.posAccountSystemId(c.tenantId, c.systemId);
  if (!bookId) return refuse("NOT_ELIGIBLE", "จุดขายนี้ยังไม่เชื่อมสมุดบัญชี");
  const [settings, doc] = await Promise.all([
    prisma.accountSettings.findFirst({ where: { systemId: bookId, tenantId: c.tenantId }, select: { orgName: true, taxId: true, branchCode: true, address: true, vatRateBp: true } }),
    prisma.accountDocument.findFirst({ where: { id: sale.taxInvoiceDocId, tenantId: c.tenantId }, select: { docNo: true, issueDate: true } }),
  ]);
  if (!settings || !doc?.docNo) return refuse("NOT_ELIGIBLE", "ยังไม่พบเลขใบกำกับภาษีของบิลนี้");
  // บรรทัด = ราคารวม VAT ของแต่ละรายการ · ส่วนต่างระดับบิล (ส่วนลดท้ายบิล/คูปอง/ค่าบริการ) = บรรทัดปรับยอด 1 บรรทัด ⇒ Σ บรรทัด = ยอดบิล
  const lines: EtaxLine[] = sale.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, amountSatang: l.lineTotalSatang }));
  const diff = sale.grandTotalSatang - lines.reduce((t, l) => t + l.amountSatang, 0);
  if (diff !== 0) lines.push({ name: diff < 0 ? "ส่วนลดท้ายบิล" : "ค่าบริการ/ปรับยอด", qty: 1, unitPriceSatang: diff, amountSatang: diff });
  const n = normalizeEtaxDocument({
    seller: { name: settings.orgName, taxId: settings.taxId ?? "", branch: settings.branchCode ?? "00000", address: settings.address ?? "" },
    buyer: { kind: buyer.kind, name: buyer.name, taxId: buyer.taxId, branchCode: buyer.branchCode, address: buyer.address, email },
    doc: { typeCode: "T03", number: doc.docNo, issueDate: thaiDate(doc.issueDate ?? sale.paidAt ?? sale.createdAt) },
    lines,
    totals: { netSatang: sale.grandTotalSatang - sale.vatSatang, vatSatang: sale.vatSatang, grandSatang: sale.grandTotalSatang },
    vat: { rateBp: settings.vatRateBp, inclusive: true },
  });
  if (n.ok !== true) return refuse("NOT_ELIGIBLE", `${MSG.NOT_ELIGIBLE} (${n.message})`);
  return { xml: renderEtaxXml(n.doc), docNo: doc.docNo, email };
}

/** ตัวอย่าง XML e-Tax ของบิล (ไม่ส่ง ไม่เขียน) */
export async function etaxPreview(ctx: Ctx, actor: Actor, input: unknown): Promise<EtaxPreviewResult> {
  try {
    const r = await load(ctx, actor, input);
    if ("ok" in r) return r;
    return { ok: true, xml: r.xml, provider: null, state: "NOT_CONFIGURED", docNo: r.docNo, buyerEmail: r.email };
  } catch (e) {
    console.error("[pos/etax-link] preview", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/** ส่ง e-Tax ทางอีเมล — โครง: ผ่านด่านเดียวกับตัวอย่างแล้วตอบ NOT_CONFIGURED (ไม่ยิงเครือข่าย · ไม่เขียน AccountDocument) */
export async function requestEtax(ctx: Ctx, actor: Actor, input: unknown): Promise<EtaxLinkRefusal> {
  try {
    const r = await load(ctx, actor, input);
    if ("ok" in r) return r;
    return refuse("NOT_CONFIGURED");
  } catch (e) {
    console.error("[pos/etax-link] request", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}
