// cash-book.ts — รายงานเงินสดรับ-จ่าย เกณฑ์เงินสด (ACC T5.2 · เลน 2 · ปิด A3)
//
//   ร้านบุคคลธรรมดาที่ไม่จด VAT ต้องทำรายงานแสดงรายได้และรายจ่ายประจำวัน (ประกาศอธิบดีฯ เงินได้ ฉ.161 — skill domain-accounting-books §ค [V])
//   แหล่ง = GL: ทุกใบสำคัญที่แตะบัญชีเงิน (บัญชีของช่องทางการเงิน + mapping CASH/BANK) · เงินเข้า/ออกสุทธิของใบ = รายรับ/รายจ่าย
//     ⇒ ขายเชื่อไม่ขึ้นจนรับเงิน (เกณฑ์เงินสด) · โอนระหว่างบัญชีเงินของร้าน = ไม่นับ · บัญชีคู่เป็นทุนทั้งหมด = เงินทุน/ถอนใช้ส่วนตัว (แยก ไม่รวมรายรับ/รายจ่าย)
//   🔴 หัวคอลัมน์ตามแบบแนบท้ายยังไม่ได้เทียบ [U] — ห้ามอ้าง "ตรงแบบสรรพากร"
// design note: ledger/wo-notes/T5.2.md
import { tenantDb } from "@/lib/core/db";
import { legalWarning, type EntityKind, type LegalWarning } from "@/lib/core/settings/legal/th-tax-2569";
import { accountNow } from "./clock";
import { bkkYmd, bookRuleFrom, loadBookLegal, type BookCtx } from "./legal-values";
import { getPolicy } from "./policy";
import { ymdAddDays } from "./tax-calendar";

export type CashBookRow = {
  date: string;
  entryId: string;
  docNo: string;
  description: string;
  /** สตางค์ */
  receipt: number;
  payment: number;
  /** true = เงินทุน/ถอนใช้ส่วนตัว (ไม่ใช่รายได้/รายจ่ายของกิจการ) */
  owner: boolean;
  /** บัญชีคู่ (ช่วยอ่าน = ช่องหมายเหตุ) */
  counterTh: string;
};
export type CashBookDay = { date: string; receipt: number; payment: number };
export type CashBookMonth = { month: string; receipt: number; payment: number; ownerIn: number; ownerOut: number; net: number };
export type CashBook = {
  from: string;
  to: string;
  entityKind: EntityKind;
  vatRegistered: boolean;
  /** สมุดบุคคลธรรมดาที่ไม่จด VAT — รายงานนี้คือรายงานที่ประกาศ ฉ.161 กำหนด */
  applies: boolean;
  rows: CashBookRow[];
  days: CashBookDay[];
  months: CashBookMonth[];
  totals: { receipt: number; payment: number; ownerIn: number; ownerOut: number; net: number };
  warnings: LegalWarning[];
};

export async function cashBook(ctx: BookCtx, input: { from?: string; to?: string } = {}): Promise<CashBook> {
  const db = tenantDb(ctx);
  const today = bkkYmd(accountNow());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(input.from ?? "") ? input.from! : `${today.slice(0, 7)}-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(input.to ?? "") ? input.to! : today;
  const [legal, policy, fins, maps] = await Promise.all([
    loadBookLegal(ctx),
    getPolicy(ctx),
    db.accountFinance.findMany({ where: { systemId: ctx.systemId, ledgerAccountId: { not: null } }, select: { ledgerAccountId: true } }),
    db.accountMapping.findMany({ where: { systemId: ctx.systemId, key: { in: ["CASH", "BANK"] } }, select: { accountId: true } }),
  ]);
  const money = new Set<string>([...fins.map((f) => f.ledgerAccountId as string), ...maps.map((m) => m.accountId)]);
  const range = { gte: new Date(`${from}T00:00:00+07:00`), lt: new Date(`${ymdAddDays(to, 1)}T00:00:00+07:00`) };
  const touching = money.size
    ? await db.accountJournalLine.findMany({ where: { systemId: ctx.systemId, accountId: { in: [...money] }, entry: { date: range } }, select: { entryId: true } })
    : [];
  const entryIds = [...new Set(touching.map((l) => l.entryId))];
  const lines = entryIds.length
    ? await db.accountJournalLine.findMany({
        where: { systemId: ctx.systemId, entryId: { in: entryIds } },
        select: { entryId: true, accountId: true, debit: true, credit: true, contactId: true, account: { select: { type: true, code: true, name: true } }, entry: { select: { date: true, docNo: true, memo: true } } },
      })
    : [];
  const contactIds = [...new Set(lines.map((l) => l.contactId).filter((x): x is string => !!x))];
  const contacts = contactIds.length ? await db.accountContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true } }) : [];
  const cName = new Map(contacts.map((c) => [c.id, c.name]));

  const byEntry = new Map<string, typeof lines>();
  for (const l of lines) byEntry.set(l.entryId, [...(byEntry.get(l.entryId) ?? []), l]);
  const rows: CashBookRow[] = [];
  for (const [entryId, ls] of byEntry) {
    const net = ls.filter((l) => money.has(l.accountId)).reduce((s, l) => s + l.debit - l.credit, 0);
    const counter = ls.filter((l) => !money.has(l.accountId));
    if (net === 0 || counter.length === 0) continue; // โอนระหว่างบัญชีเงินของร้าน / ไม่มีเงินเข้าออกสุทธิ
    const owner = counter.every((l) => l.account.type === "EQUITY");
    const e = ls[0].entry;
    const who = ls.map((l) => (l.contactId ? cName.get(l.contactId) : null)).find(Boolean);
    const counterTh = [...new Set(counter.sort((a, b) => Math.abs(b.debit - b.credit) - Math.abs(a.debit - a.credit)).map((l) => `${l.account.code} ${l.account.name}`))].slice(0, 2).join(" · ");
    rows.push({
      date: bkkYmd(e.date),
      entryId,
      docNo: e.docNo,
      description: [e.memo, who].filter(Boolean).join(" — ") || e.docNo,
      receipt: net > 0 ? net : 0,
      payment: net < 0 ? -net : 0,
      owner,
      counterTh,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.docNo.localeCompare(b.docNo));

  const days = new Map<string, CashBookDay>();
  const months = new Map<string, CashBookMonth>();
  const totals = { receipt: 0, payment: 0, ownerIn: 0, ownerOut: 0, net: 0 };
  for (const r of rows) {
    const m = months.get(r.date.slice(0, 7)) ?? { month: r.date.slice(0, 7), receipt: 0, payment: 0, ownerIn: 0, ownerOut: 0, net: 0 };
    if (r.owner) {
      m.ownerIn += r.receipt;
      m.ownerOut += r.payment;
      totals.ownerIn += r.receipt;
      totals.ownerOut += r.payment;
    } else {
      const d = days.get(r.date) ?? { date: r.date, receipt: 0, payment: 0 };
      d.receipt += r.receipt;
      d.payment += r.payment;
      days.set(r.date, d);
      m.receipt += r.receipt;
      m.payment += r.payment;
      totals.receipt += r.receipt;
      totals.payment += r.payment;
    }
    m.net = m.receipt - m.payment;
    months.set(m.month, m);
  }
  totals.net = totals.receipt - totals.payment;

  const applies = legal.entityKind === "INDIVIDUAL" && !policy.vatRegistered;
  const warnings: LegalWarning[] = [];
  if (applies) {
    const wd = bookRuleFrom(legal, "CASH_REPORT_WORKING_DAYS", accountNow());
    warnings.push(legalWarning("CASH_BOOK_DUTY", { who: "สมุดนี้เป็นบุคคลธรรมดาที่ไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม", days: wd.label || "-" }));
  }
  if (legal.entityKind === "UNSET") warnings.push(legalWarning("ENTITY_KIND_UNSET", { context: "calendar" }));
  warnings.push(legalWarning("CASH_BOOK_FORMAT_UNVERIFIED"));
  return {
    from,
    to,
    entityKind: legal.entityKind,
    vatRegistered: policy.vatRegistered,
    applies,
    rows,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    totals,
    warnings,
  };
}
