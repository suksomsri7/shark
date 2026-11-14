// ACC T5.9 (E14 H4 H5 H6) — รายงานสินค้าและวัตถุดิบรายงวด · บันทึกของเสีย/ทำลาย (waste log) · ของแถม · ถือเป็นขายราคาตลาด
// design note ledger/wo-notes/T5.9.md
//
// แหล่ง: InvMovement ของสินค้าในสมุดที่ผูกคลัง (AccountProduct.invItemId) — ปริมาณ + ต้นทุนต่อหน่วย ณ รายการ (costSatang)
//   สาเหตุของการจ่ายออก: ใบเบิก (refType AccountDocument → adjustReasonCode · T4.8) · ขาย (POS/ใบขาย) · อื่น ๆ
// กฎ (skill shark-thai-law): รายงานสินค้าและวัตถุดิบ ม.87 — "เฉพาะผู้ประกอบการจดทะเบียนที่ประกอบกิจการขายสินค้า" · รายสถานประกอบการ [V] ·
//   คอลัมน์ของแบบรายงาน [S] · ร้านอาหารต้องทำไหม [U] (common-vat-invoice.md §18) · waste log ป.79/2541 ข้อ 3(3.1) [V] ·
//   ใช้ส่วนตัว/ขาด = ถือเป็นขาย ราคาตลาด ม.77/1(8)(ง) ม.79/3 [V] · ร้านนับเองถือเป็น "ตรวจพบ" [U] (domain-shark-accounting-cases.md §5)
import { tenantDb } from "@/lib/core/db";
import { invMovementsOfItems, userNamesOf } from "./product";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { goodsIssueReasonOf } from "./stock-issue-reasons";

export type GoodsCtx = { tenantId: string; systemId: string };
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dayStart = (d: string) => new Date(`${d}T00:00:00.000+07:00`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

/** กลุ่มการจ่ายออกในรายงาน */
export const GOODS_OUT_KINDS = ["SALE", "BUSINESS_USE", "GIVEAWAY", "WASTE", "DEEMED_SALE", "OTHER"] as const;
export type GoodsOutKind = (typeof GOODS_OUT_KINDS)[number];
export const GOODS_OUT_LABEL_TH: Record<GoodsOutKind, string> = {
  SALE: "ขาย",
  BUSINESS_USE: "เบิกใช้ในกิจการ",
  GIVEAWAY: "ของแถม/ตัวอย่าง",
  WASTE: "เสีย/ทำลาย/ชำรุด",
  DEEMED_SALE: "ใช้ส่วนตัว/ขาด (ถือเป็นขาย)",
  OTHER: "อื่น ๆ",
};

export function outKindOfReason(code: string | null | undefined): GoodsOutKind {
  const d = goodsIssueReasonOf(code);
  if (!d) return "OTHER";
  if (d.deemedSale) return "DEEMED_SALE";
  if (d.code === "WASTE" || d.code === "DAMAGED") return "WASTE";
  if (d.code === "GIVEAWAY" || d.code === "SAMPLE") return "GIVEAWAY";
  if (d.code === "OTHER" || d.code === "TRANSFER") return "OTHER";
  return "BUSINESS_USE";
}

export type QtyVal = { qty: number; valueSatang: number };
export type GoodsReportRow = {
  productId: string;
  name: string;
  sku: string | null;
  unit: string | null;
  opening: QtyVal;
  receipts: QtyVal;
  issues: Record<GoodsOutKind, QtyVal>;
  issuesTotal: QtyVal;
  closing: QtyVal;
};
export type GoodsReport = {
  from: string;
  to: string;
  rows: GoodsReportRow[];
  totals: { opening: QtyVal; receipts: QtyVal; issues: Record<GoodsOutKind, QtyVal>; issuesTotal: QtyVal; closing: QtyVal };
  /** สินค้าในสมุดที่ไม่ผูกคลัง (ไม่มีประวัติเคลื่อนไหวให้รายงาน) */
  untracked: number;
  warnings: LegalWarning[];
};

const z = (): QtyVal => ({ qty: 0, valueSatang: 0 });
const zIssues = () => Object.fromEntries(GOODS_OUT_KINDS.map((k) => [k, z()])) as Record<GoodsOutKind, QtyVal>;
const add = (a: QtyVal, qty: number, value: number) => {
  a.qty += qty;
  a.valueSatang += value;
};

/** รายงานสินค้าและวัตถุดิบ (รับ / จ่าย / คงเหลือ) ช่วงวันที่ (เวลาไทย) */
export async function goodsPeriodReport(ctx: GoodsCtx, from: string, to: string): Promise<GoodsReport> {
  if (!YMD.test(from) || !YMD.test(to) || from > to) throw new Error("ช่วงวันที่ไม่ถูกต้อง (YYYY-MM-DD · from ≤ to)");
  const products = await tenantDb(ctx).accountProduct.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "GOODS" },
    select: { id: true, name: true, sku: true, invItemId: true, unitId: true },
    orderBy: [{ name: "asc" }],
  });
  const linked = products.filter((p) => p.invItemId);
  const itemIds = linked.map((p) => p.invItemId!) as string[];
  const unitIds = [...new Set(linked.map((p) => p.unitId).filter(Boolean))] as string[];
  const units = unitIds.length ? await tenantDb(ctx).accountUnit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } }).catch(() => []) : [];
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const moves = itemIds.length
    ? await invMovementsOfItems(ctx.tenantId, itemIds, dayEnd(to))
    : [];
  const docIds = [...new Set(moves.filter((m) => m.refType === "AccountDocument" && m.refId).map((m) => m.refId!))];
  const docs = docIds.length
    ? await tenantDb(ctx).accountDocument.findMany({ where: { id: { in: docIds }, tenantId: ctx.tenantId }, select: { id: true, docType: true, adjustReasonCode: true, adjustReason: true } })
    : [];
  const docById = new Map(docs.map((d) => [d.id, d]));
  const start = dayStart(from);
  const rows: GoodsReportRow[] = [];
  const byItem = new Map<string, typeof moves>();
  for (const m of moves) {
    const arr = byItem.get(m.itemId) ?? [];
    arr.push(m);
    byItem.set(m.itemId, arr);
  }
  for (const p of linked) {
    const r: GoodsReportRow = { productId: p.id, name: p.name, sku: p.sku, unit: p.unitId ? unitName.get(p.unitId) ?? null : null, opening: z(), receipts: z(), issues: zIssues(), issuesTotal: z(), closing: z() };
    for (const m of byItem.get(p.invItemId!) ?? []) {
      const value = m.qtyDelta * m.costSatang;
      if (m.createdAt < start) {
        add(r.opening, m.qtyDelta, value);
        continue;
      }
      if (m.qtyDelta >= 0) {
        add(r.receipts, m.qtyDelta, value);
        continue;
      }
      const d = m.refType === "AccountDocument" && m.refId ? docById.get(m.refId) : undefined;
      const kind: GoodsOutKind = d
        ? d.docType === "GOODS_ISSUE"
          ? outKindOfReason(d.adjustReasonCode ?? d.adjustReason)
          : "SALE"
        : m.sourceModule === "POS" || m.sourceModule === "RESTAURANT" || m.refType === "PosSale"
          ? "SALE"
          : "OTHER";
      add(r.issues[kind], -m.qtyDelta, -value);
      add(r.issuesTotal, -m.qtyDelta, -value);
    }
    r.closing = { qty: r.opening.qty + r.receipts.qty - r.issuesTotal.qty, valueSatang: r.opening.valueSatang + r.receipts.valueSatang - r.issuesTotal.valueSatang };
    if (r.opening.qty || r.receipts.qty || r.issuesTotal.qty || r.closing.qty) rows.push(r);
  }
  const totals = { opening: z(), receipts: z(), issues: zIssues(), issuesTotal: z(), closing: z() };
  for (const r of rows) {
    add(totals.opening, r.opening.qty, r.opening.valueSatang);
    add(totals.receipts, r.receipts.qty, r.receipts.valueSatang);
    add(totals.issuesTotal, r.issuesTotal.qty, r.issuesTotal.valueSatang);
    add(totals.closing, r.closing.qty, r.closing.valueSatang);
    for (const k of GOODS_OUT_KINDS) add(totals.issues[k], r.issues[k].qty, r.issues[k].valueSatang);
  }
  const warnings: LegalWarning[] = [legalWarning("GOODS_REPORT_FORMAT")];
  const untracked = products.length - linked.length;
  if (untracked > 0) warnings.push(legalWarning("GOODS_REPORT_UNTRACKED", { n: String(untracked) }));
  return { from, to, rows, totals, untracked, warnings };
}

// ─────────────────── บันทึกของเสีย/ทำลาย (waste log) ───────────────────

export type StockEvidence = { witnessName?: string | null; witnessRole?: string | null; inspectedAt?: string | null; method?: string | null; note?: string | null };
export function parseStockEvidence(v: unknown): StockEvidence {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const s = (k: string) => (typeof o[k] === "string" && (o[k] as string).trim() ? ((o[k] as string).trim().slice(0, 200)) : null);
  return { witnessName: s("witnessName"), witnessRole: s("witnessRole"), inspectedAt: s("inspectedAt"), method: s("method"), note: s("note") };
}

export type WasteLogRow = {
  documentId: string;
  docNo: string | null;
  date: string;
  reasonCode: string | null;
  reasonLabel: string;
  items: { name: string; qty: number; costSatang: number }[];
  costTotalSatang: number;
  createdById: string | null;
  createdByName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  evidence: StockEvidence;
  photos: number;
  warnings: LegalWarning[];
};

const WASTE_REASONS = ["WASTE", "DAMAGED", "SHORTAGE"];

/** ใบเบิกสาเหตุเสีย/ทำลาย/ชำรุด/ขาด ในช่วง + พยาน รูป ผู้อนุมัติ (ขาดข้อใด = คำเตือน ไม่บล็อก) */
export async function wasteLog(ctx: GoodsCtx, from: string, to: string): Promise<{ from: string; to: string; rows: WasteLogRow[]; costTotalSatang: number }> {
  if (!YMD.test(from) || !YMD.test(to) || from > to) throw new Error("ช่วงวันที่ไม่ถูกต้อง (YYYY-MM-DD · from ≤ to)");
  const docs = await tenantDb(ctx).accountDocument.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      docType: "GOODS_ISSUE",
      status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] },
      issueDate: { gte: dayStart(from), lte: dayEnd(to) },
      OR: [{ adjustReasonCode: { in: WASTE_REASONS } }, { adjustReason: { in: ["ของเสีย/ทำลาย", "ชำรุด/สูญหาย", "สินค้าขาด (นับแล้วขาด)"] } }],
    },
    select: { id: true, docNo: true, issueDate: true, adjustReasonCode: true, adjustReason: true, createdById: true, approvedById: true, grandTotal: true, stockEvidence: true, lines: { select: { description: true, qty: true, unitPrice: true, amount: true } }, _count: { select: { attachments: true } } },
    orderBy: [{ issueDate: "asc" }, { docNo: "asc" }],
  });
  const userIds = [...new Set(docs.flatMap((d) => [d.createdById, d.approvedById]).filter(Boolean))] as string[];
  const users = await userNamesOf(userIds);
  const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name || users.find((u) => u.id === id)?.email || null) : null);
  const rows: WasteLogRow[] = docs.map((d) => {
    const ev = parseStockEvidence(d.stockEvidence);
    const def = goodsIssueReasonOf(d.adjustReasonCode ?? d.adjustReason);
    const warnings: LegalWarning[] = [];
    const missing = [!ev.witnessName ? "พยาน" : null, d._count.attachments === 0 ? "รูปถ่าย" : null, !d.approvedById ? "ผู้อนุมัติ" : null].filter(Boolean) as string[];
    if (missing.length) warnings.push(legalWarning("STOCK_WASTE_EVIDENCE_MISSING", { missing: missing.join(" · ") }));
    if (d.approvedById && d.createdById && d.approvedById === d.createdById) warnings.push(legalWarning("STOCK_ISSUE_APPROVER_SAME"));
    return {
      documentId: d.id,
      docNo: d.docNo,
      date: new Date(d.issueDate.getTime() + 7 * 3600_000).toISOString().slice(0, 10),
      reasonCode: def?.code ?? d.adjustReasonCode ?? null,
      reasonLabel: def?.labelTh ?? d.adjustReason ?? "",
      items: d.lines.map((l) => ({ name: l.description, qty: Number(l.qty), costSatang: l.amount ?? Math.round(Number(l.qty) * (l.unitPrice ?? 0)) })),
      costTotalSatang: d.grandTotal,
      createdById: d.createdById,
      createdByName: nameOf(d.createdById),
      approvedById: d.approvedById,
      approvedByName: nameOf(d.approvedById),
      evidence: ev,
      photos: d._count.attachments,
      warnings,
    };
  });
  return { from, to, rows, costTotalSatang: rows.reduce((a, r) => a + r.costTotalSatang, 0) };
}

/** บันทึกพยาน/การตรวจสภาพของใบเบิก (ไม่แตะยอด/บัญชี — ข้อมูลประกอบ waste log) */
export async function saveStockEvidence(ctx: GoodsCtx, documentId: string, ev: StockEvidence): Promise<{ ok: true } | { ok: false; reason: string }> {
  const d = await tenantDb(ctx).accountDocument.findFirst({ where: { id: documentId, tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "GOODS_ISSUE" }, select: { id: true } });
  if (!d) return { ok: false, reason: "ไม่พบใบเบิกนี้" };
  const clean = parseStockEvidence(ev);
  await tenantDb(ctx).accountDocument.updateMany({ where: { id: d.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { stockEvidence: clean as object } });
  return { ok: true };
}

// ─────────────────── ของแถม · ถือเป็นขายราคาตลาด ───────────────────

export type DeemedSaleRow = { documentId: string; docNo: string | null; date: string; reasonLabel: string; costSatang: number; marketValueSatang: number; vatSatang: number; marketBasis: "SALE_PRICE" | "COST" };
export type GiveawayDeemed = {
  from: string;
  to: string;
  giveaways: { documentId: string; docNo: string | null; date: string; reasonLabel: string; costSatang: number }[];
  deemed: DeemedSaleRow[];
  deemedVatSatang: number;
  setting: "WARN" | "OFF";
  warnings: LegalWarning[];
};

/**
 * ของแถม/ตัวอย่าง (ต้นทุน) + ใบเบิกที่ถือเป็นขาย (ใช้ส่วนตัว · ขาด) มูลค่าราคาตลาดโดยประมาณ = ราคาขายของสินค้า × จำนวน (ไม่มีราคาขาย = ต้นทุน)
 *   ค่าตั้ง `deemedSale` (ค่าเริ่ม WARN = แสดงยอด + คำเตือนให้ออกใบกำกับ/คิดภาษีขาย · OFF = ร้านปิด ยังมีคำเตือนว่าปิดอยู่)
 *   ระบบไม่ตั้งภาษีขายเองอัตโนมัติ (จุดรับผิดภาษีห้ามเปลี่ยนเงียบ ๆ)
 */
export async function giveawayDeemedSales(ctx: GoodsCtx, from: string, to: string, opts: { setting: "WARN" | "OFF"; vatRateBp: number; vatRegistered: boolean }): Promise<GiveawayDeemed> {
  if (!YMD.test(from) || !YMD.test(to) || from > to) throw new Error("ช่วงวันที่ไม่ถูกต้อง (YYYY-MM-DD · from ≤ to)");
  const docs = await tenantDb(ctx).accountDocument.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "GOODS_ISSUE", status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] }, issueDate: { gte: dayStart(from), lte: dayEnd(to) } },
    select: { id: true, docNo: true, issueDate: true, adjustReasonCode: true, adjustReason: true, grandTotal: true, lines: { select: { productId: true, qty: true } } },
    orderBy: [{ issueDate: "asc" }, { docNo: "asc" }],
  });
  const pids = [...new Set(docs.flatMap((d) => d.lines.map((l) => l.productId)).filter(Boolean))] as string[];
  const prices = new Map((pids.length ? await tenantDb(ctx).accountProduct.findMany({ where: { id: { in: pids } }, select: { id: true, salePrice: true } }) : []).map((p) => [p.id, p.salePrice]));
  const ymd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const giveaways: GiveawayDeemed["giveaways"] = [];
  const deemed: DeemedSaleRow[] = [];
  for (const d of docs) {
    const def = goodsIssueReasonOf(d.adjustReasonCode ?? d.adjustReason);
    const kind = outKindOfReason(d.adjustReasonCode ?? d.adjustReason);
    if (kind === "GIVEAWAY") giveaways.push({ documentId: d.id, docNo: d.docNo, date: ymd(d.issueDate), reasonLabel: def?.labelTh ?? "", costSatang: d.grandTotal });
    if (kind === "DEEMED_SALE") {
      let mv = 0;
      let allPriced = d.lines.length > 0;
      for (const l of d.lines) {
        const p = l.productId ? prices.get(l.productId) : null;
        if (p == null) allPriced = false;
        else mv += Math.round(Number(l.qty) * p);
      }
      const basis: DeemedSaleRow["marketBasis"] = allPriced ? "SALE_PRICE" : "COST";
      const market = allPriced ? mv : d.grandTotal;
      deemed.push({ documentId: d.id, docNo: d.docNo, date: ymd(d.issueDate), reasonLabel: def?.labelTh ?? "", costSatang: d.grandTotal, marketValueSatang: market, vatSatang: opts.vatRegistered ? Math.round((market * opts.vatRateBp) / 10_000) : 0, marketBasis: basis });
    }
  }
  const deemedVatSatang = deemed.reduce((a, r) => a + r.vatSatang, 0);
  const warnings: LegalWarning[] = [];
  if (giveaways.length) warnings.push(legalWarning("STOCK_ISSUE_GIVEAWAY"));
  if (deemed.length && opts.vatRegistered) warnings.push(legalWarning(opts.setting === "OFF" ? "STOCK_DEEMED_SALE_OFF" : "STOCK_DEEMED_SALE_VAT", { vat: (deemedVatSatang / 100).toFixed(2) }));
  return { from, to, giveaways, deemed, deemedVatSatang, setting: opts.setting, warnings };
}
