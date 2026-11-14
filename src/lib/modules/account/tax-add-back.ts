// tax-add-back.ts — รายจ่ายที่ "อาจต้องบวกกลับทางภาษี" + ตัวช่วยเพดานค่ารับรอง (ACC T5.5 · เลน 2 · ปิด C7 C8)
//
//   ธงต่อบัญชี (AccountLedger.taxAddBack · ค่าเริ่มตามรหัส TAX_ADD_BACK_DEFAULT_BY_CODE) · รายงานรวมต่อรอบบัญชี
//   เพดานค่ารับรอง = min(max(อัตรา × รายได้, อัตรา × ทุนชำระแล้ว), สูงสุด) — ค่าจากตาราง "สมุดบัญชี" (ENTERTAINMENT_CAP_*) ร้านทับได้
//   🔴 ไม่คำนวณกำไรสุทธิทางภาษี/ภาษีที่ต้องชำระ — เป็นรายการให้ผู้ทำบัญชีตรวจ (skill domain-business-income-tax ขอบเขต)
// design note: ledger/wo-notes/T5.5.md
import { tenantDb } from "@/lib/core/db";
import { TAX_ADD_BACK_NONE, TAX_ADD_BACK_SECTIONS, effectiveTaxAddBack, isJuristicPayer, legalWarning, taxAddBackSectionOf, type LegalWarning } from "@/lib/core/settings/legal/th-tax-2569";
import { accountNow } from "./clock";
import { bkkYmd, bookRuleFrom, loadBookLegal, type BookCtx } from "./legal-values";
import { fiscalYearOf, getPolicy } from "./policy";
import { ymdAddDays, ymdTh } from "./tax-calendar";

export type AddBackRow = {
  ledgerId: string;
  code: string;
  name: string;
  section: string;
  sectionTh: string;
  labelTh: string;
  scope: "FULL" | "EXCESS";
  /** ธงมาจากร้านตั้งเอง (คอลัมน์) หรือค่าเริ่มต้นตามรหัส */
  origin: "SHOP" | "DEFAULT";
  /** สตางค์: ยอดสุทธิของบัญชีในช่วง (เดบิต − เครดิต) */
  amount: number;
  /** ส่วนที่อาจต้องบวกกลับ — FULL = ทั้งจำนวน · ค่ารับรอง = ส่วนเกินเพดาน · EXCESS อื่น = null (ต้องให้ผู้ทำบัญชีคำนวณ) */
  addBack: number | null;
};

export type EntertainmentCap = {
  amount: number;
  revenue: number;
  capital: number | null;
  capitalSource: "INPUT" | "LEDGER_3000" | "NONE";
  rateBp: number | null;
  maxCap: number | null;
  cap: number | null;
  baseLabel: string;
  excess: number;
  giftLimit: number | null;
  giftDocs: { documentId: string; docNo: string | null; date: string; amount: number }[];
};

export type TaxAddBackReport = {
  from: string;
  to: string;
  periodLabel: string;
  rows: AddBackRow[];
  /** บัญชีค่าใช้จ่าย/ต้นทุนที่ยังไม่ติดธง (ให้ร้านเลือกติด) */
  unflagged: { ledgerId: string; code: string; name: string }[];
  totals: { amount: number; addBack: number };
  entertainment: EntertainmentCap | null;
  donationCapRateBp: number | null;
  sections: typeof TAX_ADD_BACK_SECTIONS;
  warnings: LegalWarning[];
};

const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** pure: เพดานค่ารับรอง */
export function entertainmentCapOf(o: { revenue: number; capital: number | null; rateBp: number | null; maxCap: number | null }): { cap: number | null; baseLabel: string } {
  if (o.rateBp === null) return { cap: null, baseLabel: "-" };
  const byRev = Math.floor((Math.max(o.revenue, 0) * o.rateBp) / 10_000);
  const byCap = o.capital !== null ? Math.floor((Math.max(o.capital, 0) * o.rateBp) / 10_000) : -1;
  const raw = Math.max(byRev, byCap);
  const cap = o.maxCap !== null ? Math.min(raw, o.maxCap) : raw;
  return { cap, baseLabel: byCap > byRev ? "ทุนชำระแล้ว" : "รายได้" };
}

export async function taxAddBackReport(ctx: BookCtx, input: { asOf?: string; from?: string; to?: string; paidUpCapital?: number | null } = {}): Promise<TaxAddBackReport> {
  const db = tenantDb(ctx);
  const [legal, policy, ledgers] = await Promise.all([
    loadBookLegal(ctx),
    getPolicy(ctx),
    db.accountLedger.findMany({ where: { systemId: ctx.systemId }, select: { id: true, code: true, name: true, type: true, taxAddBack: true, archivedAt: true } }),
  ]);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(input.asOf ?? "") ? input.asOf! : bkkYmd(accountNow());
  const fy = fiscalYearOf(asOf, policy.fiscalYearStartMonth);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(input.from ?? "") ? input.from! : fy.startYmd;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(input.to ?? "") ? input.to! : fy.endYmd;
  const range = { gte: new Date(`${from}T00:00:00+07:00`), lt: new Date(`${ymdAddDays(to, 1)}T00:00:00+07:00`) };
  const at = new Date(`${to}T00:00:00Z`);

  const flagged = ledgers
    .map((l) => ({ l, code: effectiveTaxAddBack({ code: l.code, taxAddBack: l.taxAddBack }) }))
    .filter((x): x is { l: (typeof ledgers)[number]; code: string } => !!x.code && !!taxAddBackSectionOf(x.code));
  const incomeIds = ledgers.filter((l) => l.type === "INCOME").map((l) => l.id);
  const capitalLedger = ledgers.find((l) => l.code === "3000" && l.type === "EQUITY");
  const sumIds = [...new Set([...flagged.map((x) => x.l.id), ...incomeIds])];
  const [sums, capSum] = await Promise.all([
    sumIds.length ? db.accountJournalLine.groupBy({ by: ["accountId"], where: { systemId: ctx.systemId, accountId: { in: sumIds }, entry: { date: range } }, _sum: { debit: true, credit: true } }) : Promise.resolve([]),
    input.paidUpCapital == null && capitalLedger
      ? db.accountJournalLine.aggregate({ where: { systemId: ctx.systemId, accountId: capitalLedger.id, entry: { date: { lt: range.lt } } }, _sum: { debit: true, credit: true } })
      : Promise.resolve(null),
  ]);
  const net = (id: string) => {
    const g = sums.find((s) => s.accountId === id);
    return (g?._sum.debit ?? 0) - (g?._sum.credit ?? 0);
  };
  const revenue = -incomeIds.reduce((s, id) => s + net(id), 0);

  // ── ค่ารับรอง ──
  const entIds = flagged.filter((x) => x.code === "S65TRI_4").map((x) => x.l.id);
  let entertainment: EntertainmentCap | null = null;
  if (entIds.length) {
    const amount = entIds.reduce((s, id) => s + net(id), 0);
    const capital = input.paidUpCapital != null ? input.paidUpCapital : capSum ? (capSum._sum.credit ?? 0) - (capSum._sum.debit ?? 0) : null;
    const rate = bookRuleFrom(legal, "ENTERTAINMENT_CAP_RATE", at);
    const max = bookRuleFrom(legal, "ENTERTAINMENT_CAP_MAX", at);
    const gift = bookRuleFrom(legal, "ENTERTAINMENT_GIFT_PER_PERSON", at);
    const { cap, baseLabel } = entertainmentCapOf({ revenue, capital, rateBp: rate.value, maxCap: max.value });
    const lines =
      gift.value !== null
        ? await db.accountDocumentLine.findMany({
            where: { systemId: ctx.systemId, accountId: { in: entIds }, amount: { gt: gift.value }, document: { status: { notIn: ["DRAFT", "CANCELLED", "VOIDED", "REJECTED"] }, issueDate: range } },
            select: { amount: true, document: { select: { id: true, docNo: true, issueDate: true } } },
            take: 200,
          })
        : [];
    entertainment = {
      amount,
      revenue,
      capital,
      capitalSource: input.paidUpCapital != null ? "INPUT" : capitalLedger ? "LEDGER_3000" : "NONE",
      rateBp: rate.value,
      maxCap: max.value,
      cap,
      baseLabel,
      excess: cap !== null ? Math.max(amount - cap, 0) : 0,
      giftLimit: gift.value,
      giftDocs: lines.map((l) => ({ documentId: l.document.id, docNo: l.document.docNo, date: bkkYmd(l.document.issueDate), amount: l.amount })),
    };
  }

  const rows: AddBackRow[] = flagged
    .map(({ l, code }) => {
      const sec = taxAddBackSectionOf(code)!;
      const amount = net(l.id);
      const addBack = sec.scope === "FULL" ? amount : code === "S65TRI_4" && entertainment ? Math.round((entertainment.excess * amount) / (entertainment.amount || 1)) : null;
      return { ledgerId: l.id, code: l.code, name: l.name, section: code, sectionTh: sec.sectionTh, labelTh: sec.labelTh, scope: sec.scope, origin: (l.taxAddBack && l.taxAddBack !== TAX_ADD_BACK_NONE ? "SHOP" : "DEFAULT") as "SHOP" | "DEFAULT", amount, addBack };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  const unflagged = ledgers
    .filter((l) => (l.type === "EXPENSE" || l.type === "COGS") && !l.archivedAt && !flagged.some((x) => x.l.id === l.id))
    .map((l) => ({ ledgerId: l.id, code: l.code, name: l.name }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const totals = { amount: rows.reduce((s, r) => s + r.amount, 0), addBack: rows.reduce((s, r) => s + (r.addBack ?? 0), 0) };

  const warnings: LegalWarning[] = [];
  const live = rows.filter((r) => r.amount !== 0);
  if (live.length) warnings.push(legalWarning("TAX_ADD_BACK_FLAGGED", { count: live.length, amount: baht(live.reduce((s, r) => s + r.amount, 0)), individual: isJuristicPayer(legal.entityKind) === false ? "1" : "" }));
  const periodTh = `${ymdTh(from)} – ${ymdTh(to)}`;
  if (entertainment && entertainment.cap !== null && entertainment.excess > 0)
    warnings.push(
      legalWarning("ENTERTAINMENT_CAP_EXCEEDED", {
        period: ` ${periodTh}`,
        amount: baht(entertainment.amount),
        cap: baht(entertainment.cap),
        rate: `${(entertainment.rateBp ?? 0) / 100}%`,
        baseLabel: entertainment.baseLabel,
        base: baht(entertainment.baseLabel === "ทุนชำระแล้ว" ? (entertainment.capital ?? 0) : entertainment.revenue),
        max: baht(entertainment.maxCap ?? 0),
        excess: baht(entertainment.excess),
      }),
    );
  if (entertainment && entertainment.giftDocs.length && entertainment.giftLimit !== null)
    warnings.push(legalWarning("ENTERTAINMENT_GIFT_CHECK", { count: entertainment.giftDocs.length, limit: baht(entertainment.giftLimit) }));
  return {
    from,
    to,
    periodLabel: from === fy.startYmd && to === fy.endYmd ? fy.label : periodTh,
    rows,
    unflagged,
    totals,
    entertainment,
    donationCapRateBp: bookRuleFrom(legal, "DONATION_CAP_RATE", at).value,
    sections: TAX_ADD_BACK_SECTIONS,
    warnings,
  };
}

/** ตั้ง/ปลดธงของบัญชี — `section` = รหัสอนุมาตรา · "NONE" = ปลดธง (ทับค่าเริ่มต้น) · null = กลับไปใช้ค่าเริ่มต้นตามรหัส */
export async function setTaxAddBack(ctx: BookCtx, ledgerId: string, section: string | null): Promise<{ ok: true; effective: string | null } | { ok: false; reason: string }> {
  if (section !== null && section !== TAX_ADD_BACK_NONE && !taxAddBackSectionOf(section)) return { ok: false, reason: "ไม่รู้จักอนุมาตรานี้" };
  const db = tenantDb(ctx);
  const l = await db.accountLedger.findFirst({ where: { id: ledgerId, systemId: ctx.systemId }, select: { id: true, code: true } });
  if (!l) return { ok: false, reason: "ไม่พบบัญชี" };
  await db.accountLedger.update({ where: { id: l.id }, data: { taxAddBack: section } });
  return { ok: true, effective: effectiveTaxAddBack({ code: l.code, taxAddBack: section }) };
}
