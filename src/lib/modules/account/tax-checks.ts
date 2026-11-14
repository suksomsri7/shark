// tax-checks.ts — ตรวจภาษีประจำเดือน: เฉลี่ยภาษีซื้อ · ภ.พ.36 บริการต่างประเทศ · อากรแสตมป์ (ACC T5.6 · เลน 2 · ปิด C5 C10 C11)
//
//   คำเตือนเท่านั้น (ไม่บล็อก · ไม่คำนวณสูตรเฉลี่ยให้ — skill: หลัก [V] สูตร [S]) · ค่าตัวเลขจากตาราง (ภ.พ.36 ออนไลน์ · อากร 1/1,000 · 15 วัน)
//   ภ.พ.36: เฉพาะสมุดที่จด VAT (ร้านไม่จด VAT ผู้ให้บริการต่างประเทศเสียเอง ม.82/13 — skill common-withholding-tax §16 [V])
//   อากร: ใบเสนอราคาที่ลูกค้ายอมรับ (ร้าน = ผู้รับจ้าง) · ใบสั่งซื้อที่ออก (ผู้ขาย = ผู้รับจ้าง) ที่มีบรรทัดบริการ — ระบบตัดสินไม่ได้ว่าเป็นจ้างทำของหรือซื้อขาย
// design note: ledger/wo-notes/T5.6.md
import { tenantDb } from "@/lib/core/db";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/th-tax-2569";
import { accountNow } from "./clock";
import { bkkYmd, bookRuleFrom, legalValueFrom, loadBookLegal, type BookCtx } from "./legal-values";
import { getPolicy } from "./policy";
import { revenueWithoutVat } from "./revenue-novat";
import { whtRecipientOf } from "./wht-calc";

export type StampCandidate = {
  documentId: string;
  docType: string;
  docNo: string | null;
  date: string;
  contactName: string;
  /** ผู้เสียอากร: ร้าน (ร้านเป็นผู้รับจ้าง) / ผู้ขาย */
  payer: "SHOP" | "VENDOR";
  /** สตางค์ — ฐานบรรทัดบริการก่อน VAT */
  amount: number;
  /** อากรประมาณ (สตางค์) */
  duty: number;
  stampDutyRef: string | null;
  warning: LegalWarning;
};
export type Pp36Candidate = { documentId: string; docNo: string | null; paidAt: string; vendorName: string; amount: number; warning: LegalWarning };
export type TaxChecks = {
  period: string;
  vatRegistered: boolean;
  apportionment: { exempt: number; taxable: number; inputVat: number; taxableRatioBp: number | null; warning: LegalWarning | null };
  pp36: Pp36Candidate[];
  stamp: StampCandidate[];
  warnings: LegalWarning[];
};

const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DEAD = ["DRAFT", "CANCELLED", "VOIDED", "REJECTED"] as const;
const SERVICE_LINE = { OR: [{ lineKind: "SERVICE" as const }, { lineKind: null, productId: null }] };

/** อากร (สตางค์) = อัตราต่อทุก 1,000 บาทหรือเศษ */
export function stampDutyOf(amountSatang: number, ratePer1000Satang: number): number {
  return Math.ceil(Math.max(amountSatang, 0) / 100_000) * ratePer1000Satang;
}

export async function taxChecks(ctx: BookCtx, input: { period?: string } = {}): Promise<TaxChecks> {
  const db = tenantDb(ctx);
  const period = /^\d{4}-\d{2}$/.test(input.period ?? "") ? input.period! : bkkYmd(accountNow()).slice(0, 7);
  const [y, m] = period.split("-").map(Number);
  const start = new Date(`${period}-01T00:00:00+07:00`);
  const end = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00+07:00`);
  const at = new Date(`${period}-01T00:00:00Z`);
  const [legal, policy] = await Promise.all([loadBookLegal(ctx), getPolicy(ctx)]);
  const warnings: LegalWarning[] = [];

  // ── 1. เฉลี่ยภาษีซื้อ (สมุดจด VAT · มีรายได้ยกเว้น + ภาษีซื้อ) ──
  let apportionment: TaxChecks["apportionment"] = { exempt: 0, taxable: 0, inputVat: 0, taxableRatioBp: null, warning: null };
  if (policy.vatRegistered) {
    const [novat, maps, incomes] = await Promise.all([
      revenueWithoutVat(ctx, { from: period, to: period }),
      db.accountMapping.findMany({ where: { systemId: ctx.systemId, key: { in: ["VAT_INPUT", "INTEREST_INCOME", "ASSET_DISPOSAL_GAIN"] } }, select: { key: true, accountId: true } }),
      db.accountLedger.findMany({ where: { systemId: ctx.systemId, type: "INCOME" }, select: { id: true } }),
    ]);
    const exempt = novat.totals.EXEMPT;
    const inputId = maps.find((x) => x.key === "VAT_INPUT")?.accountId;
    const skip = new Set(maps.filter((x) => x.key !== "VAT_INPUT").map((x) => x.accountId));
    const incomeIds = incomes.map((l) => l.id).filter((id) => !skip.has(id));
    const [inp, inc] = await Promise.all([
      inputId ? db.accountJournalLine.aggregate({ where: { systemId: ctx.systemId, accountId: inputId, entry: { periodKey: period } }, _sum: { debit: true, credit: true } }) : Promise.resolve(null),
      incomeIds.length ? db.accountJournalLine.aggregate({ where: { systemId: ctx.systemId, accountId: { in: incomeIds }, entry: { periodKey: period } }, _sum: { debit: true, credit: true } }) : Promise.resolve(null),
    ]);
    const inputVat = inp ? (inp._sum.debit ?? 0) - (inp._sum.credit ?? 0) : 0;
    const revenue = inc ? (inc._sum.credit ?? 0) - (inc._sum.debit ?? 0) : 0;
    const taxable = Math.max(revenue - exempt, 0);
    const ratio = taxable + exempt > 0 ? Math.floor((taxable * 10_000) / (taxable + exempt)) : null;
    const w =
      exempt > 0 && inputVat > 0
        ? legalWarning("INPUT_VAT_APPORTIONMENT", { period, exempt: baht(exempt), taxable: baht(taxable), ratio: ratio === null ? "-" : `${(ratio / 100).toFixed(2)}%`, input: baht(inputVat) })
        : null;
    apportionment = { exempt, taxable, inputVat, taxableRatioBp: ratio, warning: w };
    if (w) warnings.push(w);
  }

  // ── 2. ภ.พ.36: จ่ายค่าบริการให้ผู้ขายต่างประเทศในเดือนนี้ (สมุดจด VAT) ──
  const pp36: Pp36Candidate[] = [];
  if (policy.vatRegistered) {
    const online = legalValueFrom(legal, "filing.deadline", end, { form: "PP36", channel: "ONLINE" });
    const pays = await db.accountDocumentPayment.findMany({
      where: { systemId: ctx.systemId, voidedAt: null, paidAt: { gte: start, lt: end }, channel: { notIn: ["DEPOSIT_APPLY", "CREDIT_APPLY", "BAD_DEBT"] }, document: { direction: "IN", status: { notIn: [...DEAD] } } },
      select: { amount: true, whtAmountSatang: true, paidAt: true, document: { select: { id: true, docNo: true, docType: true, contact: { select: { name: true, whtRecipient: true, legalType: true, legalEntityType: true, country: true, taxIdCountry: true } } } } },
      take: 500,
    });
    for (const p of pays) {
      const c = p.document.contact;
      if (!c) continue;
      const r = whtRecipientOf(c).recipient;
      const foreign = r === "FOREIGN" || (c.country && c.country !== "TH") || (c.taxIdCountry && c.taxIdCountry !== "TH");
      if (!foreign || r === "FOREIGN_PE") continue;
      const amount = p.amount + p.whtAmountSatang;
      pp36.push({
        documentId: p.document.id,
        docNo: p.document.docNo,
        paidAt: bkkYmd(p.paidAt),
        vendorName: c.name,
        amount,
        warning: legalWarning("PP36_FOREIGN_SERVICE", { doc: p.document.docNo ?? "เอกสารรายจ่าย", vendor: c.name, amount: baht(amount), online: online.value ?? "" }),
      });
    }
    if (pp36.length) warnings.push(pp36[0].warning);
  }

  // ── 3. อากรแสตมป์: สัญญาจ้างทำของที่ตอบรับ/ออกในเดือนนี้ ──
  const rate = bookRuleFrom(legal, "STAMP_HIRE_PER_1000", at);
  const days = bookRuleFrom(legal, "STAMP_E_PAY_DAYS", at);
  const docs = await db.accountDocument.findMany({
    where: {
      systemId: ctx.systemId,
      OR: [
        { docType: "QUOTATION", acceptedAt: { gte: start, lt: end } },
        { docType: "PURCHASE_ORDER", status: { notIn: [...DEAD, "AWAITING_APPROVAL"] }, issueDate: { gte: start, lt: end } },
      ],
      lines: { some: SERVICE_LINE },
    },
    select: { id: true, docType: true, docNo: true, acceptedAt: true, issueDate: true, stampDutyRef: true, contact: { select: { name: true } }, lines: { where: SERVICE_LINE, select: { amount: true } } },
    orderBy: [{ issueDate: "asc" }, { id: "asc" }],
    take: 200,
  });
  const stamp: StampCandidate[] = docs.map((d) => {
    const amount = d.lines.reduce((s, l) => s + l.amount, 0);
    const duty = rate.value !== null ? stampDutyOf(amount, rate.value) : 0;
    const payer = d.docType === "QUOTATION" ? "SHOP" : "VENDOR";
    const label = d.docType === "QUOTATION" ? `ใบเสนอราคา ${d.docNo ?? ""} ที่ลูกค้ายอมรับ` : `ใบสั่งซื้อ ${d.docNo ?? ""}`;
    return {
      documentId: d.id,
      docType: d.docType,
      docNo: d.docNo,
      date: bkkYmd(d.acceptedAt ?? d.issueDate),
      contactName: d.contact?.name ?? "-",
      payer,
      amount,
      duty,
      stampDutyRef: d.stampDutyRef,
      warning: legalWarning("STAMP_DUTY_INSTRUMENT", {
        doc: label.trim(),
        amount: baht(amount),
        rate: rate.value !== null ? baht(rate.value) : "-",
        duty: baht(duty),
        payer: payer === "SHOP" ? " (ร้าน)" : " (ผู้ขาย)",
        days: days.value ?? "-",
      }),
    };
  });
  if (stamp.some((s) => !s.stampDutyRef)) warnings.push(stamp.find((s) => !s.stampDutyRef)!.warning);
  return { period, vatRegistered: policy.vatRegistered, apportionment, pp36, stamp, warnings };
}

/** เก็บรหัสรับรองการเสียอากรแสตมป์ (อ.ส.9) ของเอกสาร — null = ล้าง */
export async function setStampDutyRef(ctx: BookCtx, documentId: string, ref: string | null): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = tenantDb(ctx);
  const d = await db.accountDocument.findFirst({ where: { id: documentId, systemId: ctx.systemId }, select: { id: true, docType: true } });
  if (!d) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (d.docType !== "QUOTATION" && d.docType !== "PURCHASE_ORDER") return { ok: false, reason: "เก็บรหัสอากรได้เฉพาะใบเสนอราคาและใบสั่งซื้อ" };
  const v = ref?.trim() || null;
  if (v && v.length > 60) return { ok: false, reason: "รหัสยาวเกิน 60 ตัวอักษร" };
  await db.accountDocument.update({ where: { id: d.id }, data: { stampDutyRef: v } });
  return { ok: true };
}
