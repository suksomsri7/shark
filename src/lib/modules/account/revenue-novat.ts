// revenue-novat.ts — รายงาน "รายได้ที่ไม่มี VAT" (ACC T1.9 · ปิด E13) · อ่านอย่างเดียว
//
// เอกสารขายที่ออกแล้ว + บิล POS (ใบกำกับอย่างย่อ) ในช่วงเดือน → ต่อบรรทัดที่ไม่มี VAT แยกหมวด:
//   EXEMPT     — บรรทัดติดป้ายยกเว้น (vatRateBp < 0) · มีเหตุผลแล้ว (ม.81)
//   ZERO_RATED — บรรทัด 0% ในใบที่คิด VAT (ม.80/1)
//   UNTAXED    — ใบไม่คิด VAT (vatMode NONE) หรือบิล POS ที่บรรทัดไม่มี VAT — ไม่มีเหตุผลกำกับ (สิ่งที่สมุดจด VAT ต้องตรวจ)
// ใบเสร็จ/ใบกำกับที่ออกจากใบแจ้งหนี้ ไม่ใช่รายได้ใหม่ ⇒ ไม่นับ (นับที่ใบแจ้งหนี้) · ใบลดหนี้ = ติดลบ
// design note ledger/wo-notes/T1.9.md
import { tenantDb } from "@/lib/core/db";
import type { AccountDocType } from "@prisma/client";

type Ctx = { tenantId: string; systemId: string };

export const NOVAT_CATEGORIES = ["EXEMPT", "ZERO_RATED", "UNTAXED"] as const;
export type NovatCategory = (typeof NOVAT_CATEGORIES)[number];
export const NOVAT_CATEGORY_LABEL_TH: Record<NovatCategory, string> = {
  EXEMPT: "ยกเว้น VAT",
  ZERO_RATED: "อัตรา 0%",
  UNTAXED: "ไม่คิด VAT (ไม่ระบุเหตุผล)",
};

const REVENUE_TYPES: AccountDocType[] = ["INVOICE", "RECEIPT", "TAX_INVOICE", "DEPOSIT_RECEIPT", "DEBIT_NOTE", "CREDIT_NOTE", "TAX_INVOICE_ABB"];
const DERIVED_TYPES = new Set<AccountDocType>(["RECEIPT", "TAX_INVOICE"]);

export type NovatRow = {
  month: string;
  date: Date;
  docId: string;
  docNo: string | null;
  docType: AccountDocType;
  source: "DOC" | "POS";
  contactName: string;
  category: NovatCategory;
  description: string;
  /** สตางค์ · ใบลดหนี้ติดลบ */
  amount: number;
};

export type NovatMonth = { month: string } & Record<NovatCategory, number> & { total: number };

export type RevenueWithoutVat = {
  from: string;
  to: string;
  vatRegistered: boolean;
  rows: NovatRow[];
  byMonth: NovatMonth[];
  totals: Record<NovatCategory, number> & { total: number; docCount: number };
};

const bkkMonth = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
const monthStartUtc = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1) - 7 * 3_600_000);
};
const nextYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
export const isYm = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** หมวดของบรรทัด VAT 0 · null = บรรทัดมี VAT (ไม่เข้ารายงาน) */
export function novatCategoryOf(docType: string, vatMode: string, vatRateBp: number): NovatCategory | null {
  if (vatRateBp < 0) return "EXEMPT";
  if (vatMode === "NONE") return "UNTAXED";
  if (vatRateBp === 0) return docType === "TAX_INVOICE_ABB" ? "UNTAXED" : "ZERO_RATED";
  return null;
}

export async function revenueWithoutVat(ctx: Ctx, input: { from: string; to: string }): Promise<RevenueWithoutVat> {
  const db = tenantDb(ctx);
  const [settings, docs] = await Promise.all([
    db.accountSettings.findFirst({ select: { vatRegistered: true } }),
    db.accountDocument.findMany({
      where: {
        direction: "OUT",
        docType: { in: REVENUE_TYPES },
        status: { notIn: ["DRAFT", "CANCELLED", "VOIDED", "REJECTED"] },
        issueDate: { gte: monthStartUtc(input.from), lt: monthStartUtc(nextYm(input.to)) },
      },
      select: {
        id: true, docNo: true, docType: true, issueDate: true, vatMode: true, sourceDocId: true, refType: true, contactSnapshot: true,
        contact: { select: { name: true } },
        lines: { select: { description: true, vatRateBp: true, amount: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ issueDate: "asc" }, { docNo: "asc" }],
    }),
  ]);
  const rows: NovatRow[] = [];
  for (const d of docs) {
    if (DERIVED_TYPES.has(d.docType) && d.sourceDocId) continue;
    const sign = d.docType === "CREDIT_NOTE" ? -1 : 1;
    const snap = (d.contactSnapshot ?? null) as { name?: string } | null;
    for (const l of d.lines) {
      const cat = novatCategoryOf(d.docType, d.vatMode, l.vatRateBp);
      if (!cat || l.amount === 0) continue;
      rows.push({
        month: bkkMonth(d.issueDate),
        date: d.issueDate,
        docId: d.id,
        docNo: d.docNo,
        docType: d.docType,
        source: d.docType === "TAX_INVOICE_ABB" || d.refType === "PosSale" ? "POS" : "DOC",
        contactName: snap?.name ?? d.contact?.name ?? (d.docType === "TAX_INVOICE_ABB" ? "ลูกค้าหน้าร้าน" : "—"),
        category: cat,
        description: l.description,
        amount: sign * l.amount,
      });
    }
  }
  const months: NovatMonth[] = [];
  for (let m = input.from; m <= input.to; m = nextYm(m)) months.push({ month: m, EXEMPT: 0, ZERO_RATED: 0, UNTAXED: 0, total: 0 });
  const totals = { EXEMPT: 0, ZERO_RATED: 0, UNTAXED: 0, total: 0, docCount: new Set(rows.map((r) => r.docId)).size };
  for (const r of rows) {
    const m = months.find((x) => x.month === r.month);
    if (m) {
      m[r.category] += r.amount;
      m.total += r.amount;
    }
    totals[r.category] += r.amount;
    totals.total += r.amount;
  }
  return { from: input.from, to: input.to, vatRegistered: !!settings?.vatRegistered, rows, byMonth: months, totals };
}
