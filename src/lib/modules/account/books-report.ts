// books-report.ts — รายงานสมุดบัญชีแบบเต็ม (ACC T4.2 · ปิด D3 K5)
//
//   สมุดรายวัน (ทุกเล่มหรือเล่มเดียว) แสดงเดบิต/เครดิตรายบรรทัด · ไม่ตัดที่ 200 ใบ (อ่านเป็นก้อนละ CHUNK ใบด้วย keyset — คิวรีต่อก้อนคงที่)
//   บัญชีแยกประเภท (บัญชีเดียวหรือทุกบัญชีที่มียอด) · บัญชีย่อยลูกหนี้/เจ้าหนี้รายตัวจาก GL (บัญชี AR/AP ตาม mapping × ผู้ติดต่อบนบรรทัด)
//   หัวรายงาน: ชื่อกิจการ · เลขผู้เสียภาษี · สาขา · ชนิดบัญชี · ช่วงวันที่ · เลขหน้า (แบ่งหน้าที่ฝั่ง server — `paginateBookRows`)
//   ข้อความ/ข้อกำหนดจาก skill: domain-accounting-books §ก2 ข้อ 3 (ชนิดบัญชี) · ข้อ 5 (ชื่อบัญชี วันที่ เลขที่เอกสาร รายการ จำนวนเงิน · เลขหน้าเรียง) [V]
// 🔴 ใช้ `tenantDb(ctx)` (fitness F5.1) · ไม่มีแคชข้ามคำขอ
// design note: ledger/wo-notes/T4.2.md
import { tenantDb } from "@/lib/core/db";
import type { AccountJournalBook, Prisma } from "@prisma/client";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { BOOK_LABEL } from "./journal-v2";
import { resolveMapping } from "./gl";
import { sellerBranchLabelTh } from "./sales-tax-shared";

type Ctx = { tenantId: string; systemId: string };

/** ใบสำคัญต่อก้อนของการอ่านสมุดรายวันทั้งช่วง (คิวรี 3 ครั้งต่อก้อน) */
export const JOURNAL_BOOK_CHUNK = 500;
/** เพดานความปลอดภัยของการพิมพ์ทั้งช่วง (ใบ) — เกินแล้วแจ้งให้แบ่งช่วง (ไม่ตัดเงียบ) */
export const JOURNAL_BOOK_PRINT_MAX = 20_000;

// ─────────────────── หัวรายงาน ───────────────────

export type BookHeader = { orgName: string; taxId: string; branchLabel: string; warnings: LegalWarning[] };

const readStr = (cfg: unknown, k: string) => {
  const o = cfg && typeof cfg === "object" ? (cfg as Record<string, unknown>) : {};
  return typeof o[k] === "string" ? (o[k] as string).trim() : "";
};

export async function bookHeaderOf(ctx: Ctx, reportTh: string): Promise<BookHeader> {
  const s = await tenantDb(ctx).accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: { orgName: true, taxId: true, branchCode: true, branchName: true, docConfig: true },
  });
  const orgName = [readStr(s?.docConfig, "orgPrefix"), (s?.orgName ?? "").trim()].filter(Boolean).join(" ");
  return {
    orgName,
    taxId: (s?.taxId ?? "").trim(),
    branchLabel: sellerBranchLabelTh(s?.branchCode, s?.branchName),
    warnings: orgName ? [] : [legalWarning("BOOK_REPORT_ORG_NAME_MISSING", { report: reportTh })],
  };
}

/** ชื่อชนิดบัญชีตามประกาศ (ข้อ 3) — สมุดรายวันแต่ละเล่ม */
export function journalBookTitleTh(book: AccountJournalBook | null): string {
  if (!book) return "สมุดบัญชีรายวัน (ทุกเล่ม)";
  return `สมุดบัญชีรายวัน${BOOK_LABEL[book]}`;
}

// ─────────────────── สมุดรายวันแบบเต็ม ───────────────────

export type JournalBookLine = { accountCode: string; accountName: string; contactName: string | null; note: string | null; debit: number; credit: number };
export type JournalBookEntry = {
  id: string;
  docNo: string;
  date: Date;
  book: AccountJournalBook;
  bookLabel: string;
  memo: string | null;
  refDocNo: string | null;
  status: "POSTED" | "REVERSED";
  lines: JournalBookLine[];
  totalDebit: number;
  totalCredit: number;
};

export type JournalBookQuery = { book?: AccountJournalBook | null; from: Date; to: Date };

const whereOf = (ctx: Ctx, q: JournalBookQuery): Prisma.AccountJournalEntryWhereInput => ({
  systemId: ctx.systemId,
  date: { gte: q.from, lte: q.to },
  ...(q.book ? { book: q.book } : {}),
});

const ORDER: Prisma.AccountJournalEntryOrderByWithRelationInput[] = [{ date: "asc" }, { docNo: "asc" }, { id: "asc" }];

async function readEntries(ctx: Ctx, where: Prisma.AccountJournalEntryWhereInput, page: { skip?: number; take: number; cursor?: string }): Promise<JournalBookEntry[]> {
  const db = tenantDb(ctx);
  const rows = await db.accountJournalEntry.findMany({
    where,
    orderBy: ORDER,
    take: page.take,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : page.skip ? { skip: page.skip } : {}),
    select: {
      id: true,
      docNo: true,
      date: true,
      book: true,
      memo: true,
      status: true,
      refType: true,
      refId: true,
      lines: { select: { debit: true, credit: true, note: true, contactId: true, account: { select: { code: true, name: true } } }, orderBy: [{ debit: "desc" }, { id: "asc" }] },
    },
  });
  const contactIds = [...new Set(rows.flatMap((r) => r.lines.map((l) => l.contactId)).filter((x): x is string => !!x))];
  const docIds = [...new Set(rows.filter((r) => r.refType === "AccountDocument" && r.refId).map((r) => r.refId as string))];
  const [contacts, docs] = await Promise.all([
    contactIds.length ? db.accountContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true } }) : Promise.resolve([] as { id: string; name: string }[]),
    docIds.length ? db.accountDocument.findMany({ where: { id: { in: docIds } }, select: { id: true, docNo: true } }) : Promise.resolve([] as { id: string; docNo: string | null }[]),
  ]);
  const cName = new Map(contacts.map((c) => [c.id, c.name]));
  const dNo = new Map(docs.map((d) => [d.id, d.docNo]));
  return rows.map((r) => {
    const lines = r.lines.map((l) => ({ accountCode: l.account.code, accountName: l.account.name, contactName: l.contactId ? (cName.get(l.contactId) ?? null) : null, note: l.note, debit: l.debit, credit: l.credit }));
    return {
      id: r.id,
      docNo: r.docNo,
      date: r.date,
      book: r.book,
      bookLabel: BOOK_LABEL[r.book],
      memo: r.memo,
      refDocNo: r.refType === "AccountDocument" && r.refId ? (dNo.get(r.refId) ?? null) : null,
      status: r.status as "POSTED" | "REVERSED",
      lines,
      totalDebit: lines.reduce((s, l) => s + l.debit, 0),
      totalCredit: lines.reduce((s, l) => s + l.credit, 0),
    };
  });
}

/** สมุดรายวันหนึ่งหน้า (REST · จอ) — นับ + อ่าน (3 คิวรีต่อหน้า) */
export async function journalBookPage(ctx: Ctx, q: JournalBookQuery & { page: number; pageSize: number }): Promise<{ entries: JournalBookEntry[]; total: number; page: number; pageSize: number; pageCount: number; sumDebit: number; sumCredit: number }> {
  const where = whereOf(ctx, q);
  const pageSize = Math.min(Math.max(1, q.pageSize), JOURNAL_BOOK_CHUNK);
  const page = Math.max(1, q.page);
  const [total, sums, entries] = await Promise.all([
    tenantDb(ctx).accountJournalEntry.count({ where }),
    tenantDb(ctx).accountJournalLine.aggregate({ where: { systemId: ctx.systemId, entry: where }, _sum: { debit: true, credit: true } }),
    readEntries(ctx, where, { skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { entries, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)), sumDebit: sums._sum.debit ?? 0, sumCredit: sums._sum.credit ?? 0 };
}

/**
 * สมุดรายวันทั้งช่วง (ใบพิมพ์) — อ่านเป็นก้อน JOURNAL_BOOK_CHUNK ด้วย cursor (ไม่ตัดที่ 200 ใบ)
 *   เกิน JOURNAL_BOOK_PRINT_MAX = หยุดและคืน truncated=true (หน้าพิมพ์แจ้งให้แบ่งช่วง — ไม่ตัดเงียบ)
 */
export async function journalBookAll(ctx: Ctx, q: JournalBookQuery, max = JOURNAL_BOOK_PRINT_MAX, chunk = JOURNAL_BOOK_CHUNK): Promise<{ entries: JournalBookEntry[]; truncated: boolean; chunks: number }> {
  const where = whereOf(ctx, q);
  const out: JournalBookEntry[] = [];
  let cursor: string | undefined;
  let chunks = 0;
  for (;;) {
    const take = Math.min(chunk, max - out.length);
    if (take <= 0) return { entries: out, truncated: true, chunks };
    const part = await readEntries(ctx, where, { take, cursor });
    chunks++;
    out.push(...part);
    if (part.length < take) return { entries: out, truncated: false, chunks };
    cursor = part[part.length - 1]!.id;
    if (out.length >= max) {
      const more = await tenantDb(ctx).accountJournalEntry.findFirst({ where, orderBy: ORDER, cursor: { id: cursor }, skip: 1, select: { id: true } });
      return { entries: out, truncated: !!more, chunks };
    }
  }
}

// ─────────────────── บัญชีแยกประเภททุกบัญชี ───────────────────

export type LedgerBookLine = { date: Date; docNo: string; memo: string | null; debit: number; credit: number; balance: number };
export type LedgerBookAccount = { id: string; code: string; name: string; opening: number; lines: LedgerBookLine[]; debit: number; credit: number; closing: number };

/**
 * บัญชีแยกประเภททุกบัญชีที่มียอดยกมาหรือเคลื่อนไหวในช่วง (ใบพิมพ์/ส่งออกทั้งเล่ม) — 3 คิวรี + ก้อนละ JOURNAL_BOOK_CHUNK×4 บรรทัด
 *   เรียงตามรหัสบัญชี · ยอดคงเหลือ = เดบิต − เครดิต (สูตรเดียวกับ coa.ledgerRunning)
 */
export async function ledgerBookAll(ctx: Ctx, range: { from: Date; to: Date }, accountId?: string | null): Promise<LedgerBookAccount[]> {
  const db = tenantDb(ctx);
  const accWhere = accountId ? { accountId } : {};
  const [ledgers, openings] = await Promise.all([
    db.accountLedger.findMany({ where: accountId ? { id: accountId } : {}, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    db.accountJournalLine.groupBy({ by: ["accountId"], where: { systemId: ctx.systemId, ...accWhere, entry: { date: { lt: range.from } } }, _sum: { debit: true, credit: true } }),
  ]);
  const opening = new Map(openings.map((o) => [o.accountId, (o._sum.debit ?? 0) - (o._sum.credit ?? 0)]));
  const lines: { accountId: string; debit: number; credit: number; note: string | null; entry: { date: Date; docNo: string; memo: string | null } }[] = [];
  let cursor: string | undefined;
  const CH = JOURNAL_BOOK_CHUNK * 4;
  for (;;) {
    const part = await db.accountJournalLine.findMany({
      where: { systemId: ctx.systemId, ...accWhere, entry: { date: { gte: range.from, lte: range.to } } },
      orderBy: [{ id: "asc" }],
      take: CH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, accountId: true, debit: true, credit: true, note: true, entry: { select: { date: true, docNo: true, memo: true, createdAt: true } } },
    });
    lines.push(...part);
    if (part.length < CH) break;
    cursor = part[part.length - 1]!.id;
  }
  const byAcc = new Map<string, typeof lines>();
  for (const l of lines) {
    const a = byAcc.get(l.accountId) ?? [];
    a.push(l);
    byAcc.set(l.accountId, a);
  }
  const out: LedgerBookAccount[] = [];
  for (const led of ledgers) {
    const ls = (byAcc.get(led.id) ?? []).sort((x, y) => x.entry.date.getTime() - y.entry.date.getTime() || x.entry.docNo.localeCompare(y.entry.docNo));
    const op = opening.get(led.id) ?? 0;
    if (ls.length === 0 && op === 0) continue;
    let run = op;
    const rows = ls.map((l) => {
      run += l.debit - l.credit;
      return { date: l.entry.date, docNo: l.entry.docNo, memo: l.note ?? l.entry.memo, debit: l.debit, credit: l.credit, balance: run };
    });
    const debit = rows.reduce((s, r) => s + r.debit, 0);
    const credit = rows.reduce((s, r) => s + r.credit, 0);
    out.push({ id: led.id, code: led.code, name: led.name, opening: op, lines: rows, debit, credit, closing: op + debit - credit });
  }
  return out;
}

// ─────────────────── บัญชีย่อยลูกหนี้/เจ้าหนี้รายตัว (จาก GL) ───────────────────

export type SubsidiarySide = "AR" | "AP";
export const SUBSIDIARY_TITLE_TH: Record<SubsidiarySide, string> = { AR: "บัญชีย่อยลูกหนี้รายตัว", AP: "บัญชีย่อยเจ้าหนี้รายตัว" };

export type SubsidiaryRow = { contactId: string | null; contactName: string; opening: number; debit: number; credit: number; closing: number };
export type SubsidiaryLedger = {
  side: SubsidiarySide;
  account: { id: string; code: string; name: string } | null;
  rows: SubsidiaryRow[];
  totals: { opening: number; debit: number; credit: number; closing: number };
  /** รายบรรทัดของผู้ติดต่อเดียว (ส่ง contactId) */
  detail: { contactId: string | null; contactName: string; opening: number; lines: LedgerBookLine[]; closing: number } | null;
};

/**
 * ACC T5 Job 0 ▸ ผู้ติดต่อของบรรทัด AR/AP ที่ลงไว้ก่อนระบบเขียนผู้ติดต่อบนบรรทัด (T4.2) — อนุมานตอนอ่านจากเอกสารต้นทาง
 *   refType AccountDocument → document.contactId · AccountDocumentPayment → payment.document.contactId
 *   AccountCheque → งวดที่ผูกเช็ค → document.contactId · AccountJournalEntry (กลับรายการ) → ตามใบเดิม
 *   ไม่แก้แถวใน DB (สมุดที่ลงแล้วห้ามแก้ — ใช้ตอนอ่านเท่านั้น) · หาไม่ได้ = คงเป็น "ไม่ระบุผู้ติดต่อ"
 *   คิวรีคงที่ ≤ 4 ครั้งต่อการเรียก (ไม่วนต่อบรรทัด)
 */
export async function deriveRefContacts(
  ctx: Ctx,
  refs: { refType: string | null; refId: string | null; reversalOf?: { refType: string | null; refId: string | null } | null }[],
): Promise<(string | null)[]> {
  const db = tenantDb(ctx);
  const eff = refs.map((r) => (r.refType === "AccountJournalEntry" && r.reversalOf ? r.reversalOf : r));
  const idsOf = (t: string) => [...new Set(eff.filter((r) => r.refType === t && r.refId).map((r) => r.refId as string))];
  const docIds = idsOf("AccountDocument");
  const payIds = idsOf("AccountDocumentPayment");
  const chqIds = idsOf("AccountCheque");
  const [pays, chqPays] = await Promise.all([
    payIds.length ? db.accountDocumentPayment.findMany({ where: { id: { in: payIds } }, select: { id: true, documentId: true } }) : Promise.resolve([] as { id: string; documentId: string }[]),
    chqIds.length ? db.accountDocumentPayment.findMany({ where: { chequeId: { in: chqIds } }, select: { chequeId: true, documentId: true } }) : Promise.resolve([] as { chequeId: string | null; documentId: string }[]),
  ]);
  const payDoc = new Map(pays.map((p) => [p.id, p.documentId]));
  const chqDoc = new Map(chqPays.map((p) => [p.chequeId as string, p.documentId]));
  const allDocs = [...new Set([...docIds, ...pays.map((p) => p.documentId), ...chqPays.map((p) => p.documentId)])];
  const docs = allDocs.length ? await db.accountDocument.findMany({ where: { id: { in: allDocs } }, select: { id: true, contactId: true } }) : [];
  const docContact = new Map(docs.map((d) => [d.id, d.contactId]));
  return eff.map((r) => {
    if (!r.refId) return null;
    if (r.refType === "AccountDocument") return docContact.get(r.refId) ?? null;
    if (r.refType === "AccountDocumentPayment") return docContact.get(payDoc.get(r.refId) ?? "") ?? null;
    if (r.refType === "AccountCheque") return docContact.get(chqDoc.get(r.refId) ?? "") ?? null;
    return null;
  });
}

/**
 * บัญชีย่อยจาก GL: บรรทัดของบัญชีลูกหนี้ (AR) / เจ้าหนี้ (AP) ตาม mapping จัดกลุ่มตามผู้ติดต่อบนบรรทัด
 *   ยอดฝั่งลูกหนี้ = เดบิต − เครดิต · ฝั่งเจ้าหนี้ = เครดิต − เดบิต (ยอดค้างเป็นบวก) · ไม่ระบุผู้ติดต่อ = แถว "ไม่ระบุผู้ติดต่อ"
 *   บรรทัดที่ไม่มีผู้ติดต่อ (ลงก่อน T4.2) = อนุมานจากเอกสารต้นทาง (deriveRefContacts) ตอนอ่าน
 *   ผลรวมทุกแถว = ยอดบัญชีคุมใน GL (ข้อสอบ T4.2 ตรวจ)
 */
export async function subsidiaryLedger(ctx: Ctx, input: { side: SubsidiarySide; from: Date; to: Date; contactId?: string | null }): Promise<SubsidiaryLedger> {
  const db = tenantDb(ctx);
  const accountId = await resolveMapping(ctx, input.side).catch(() => "");
  const account = accountId ? await db.accountLedger.findFirst({ where: { id: accountId }, select: { id: true, code: true, name: true } }) : null;
  const empty = { opening: 0, debit: 0, credit: 0, closing: 0 };
  if (!account) return { side: input.side, account: null, rows: [], totals: empty, detail: null };
  const sign = input.side === "AR" ? 1 : -1;
  const [openG, moveG, orphans] = await Promise.all([
    db.accountJournalLine.groupBy({ by: ["contactId"], where: { systemId: ctx.systemId, accountId: account.id, contactId: { not: null }, entry: { date: { lt: input.from } } }, _sum: { debit: true, credit: true } }),
    db.accountJournalLine.groupBy({ by: ["contactId"], where: { systemId: ctx.systemId, accountId: account.id, contactId: { not: null }, entry: { date: { gte: input.from, lte: input.to } } }, _sum: { debit: true, credit: true } }),
    // บรรทัดไม่มีผู้ติดต่อ (ข้อมูลก่อน T4.2) — อ่านรายบรรทัดเพื่ออนุมานจากเอกสารต้นทาง
    db.accountJournalLine.findMany({
      where: { systemId: ctx.systemId, accountId: account.id, contactId: null, entry: { date: { lte: input.to } } },
      orderBy: [{ entry: { date: "asc" } }, { entry: { createdAt: "asc" } }, { id: "asc" }],
      select: { debit: true, credit: true, note: true, entry: { select: { date: true, docNo: true, memo: true, refType: true, refId: true, reversalOf: { select: { refType: true, refId: true } } } } },
    }),
  ]);
  const derived = await deriveRefContacts(ctx, orphans.map((l) => l.entry));
  const orphanLines = orphans.map((l, i) => ({ ...l, contactId: derived[i] }));
  const agg = new Map<string | null, { o: number; d: number; c: number }>();
  const bucket = (k: string | null) => agg.get(k) ?? (agg.set(k, { o: 0, d: 0, c: 0 }), agg.get(k)!);
  for (const g of openG) bucket(g.contactId).o += sign * ((g._sum.debit ?? 0) - (g._sum.credit ?? 0));
  for (const g of moveG) {
    const b = bucket(g.contactId);
    b.d += g._sum.debit ?? 0;
    b.c += g._sum.credit ?? 0;
  }
  for (const l of orphanLines) {
    const b = bucket(l.contactId);
    if (l.entry.date < input.from) b.o += sign * (l.debit - l.credit);
    else {
      b.d += l.debit;
      b.c += l.credit;
    }
  }
  const keys = [...agg.keys()];
  const ids = keys.filter((x): x is string => !!x);
  const contacts = ids.length ? await db.accountContact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const name = new Map(contacts.map((c) => [c.id, c.name]));
  const nameOf = (id: string | null) => (id ? (name.get(id) ?? "(ผู้ติดต่อที่ถูกลบ)") : "ไม่ระบุผู้ติดต่อ");
  const rows: SubsidiaryRow[] = keys.map((k) => {
    const a = agg.get(k)!;
    // `|| 0` = ตัด −0 (ฝั่งเจ้าหนี้คูณ −1 กับ 0 แล้วจอแสดง "-0.00")
    return { contactId: k, contactName: nameOf(k), opening: a.o || 0, debit: a.d, credit: a.c, closing: a.o + sign * (a.d - a.c) || 0 };
  });
  rows.sort((a, b) => (a.contactId === null ? 1 : b.contactId === null ? -1 : a.contactName.localeCompare(b.contactName, "th")));
  const live = rows.filter((r) => r.opening !== 0 || r.debit !== 0 || r.credit !== 0);
  const totals = live.reduce((t, r) => ({ opening: t.opening + r.opening, debit: t.debit + r.debit, credit: t.credit + r.credit, closing: t.closing + r.closing }), empty);

  let detail: SubsidiaryLedger["detail"] = null;
  if (input.contactId !== undefined && input.contactId !== "") {
    const cid = input.contactId === "none" ? null : input.contactId;
    const row = rows.find((r) => r.contactId === cid);
    const direct =
      cid === null
        ? []
        : await db.accountJournalLine.findMany({
            where: { systemId: ctx.systemId, accountId: account.id, contactId: cid, entry: { date: { gte: input.from, lte: input.to } } },
            orderBy: [{ entry: { date: "asc" } }, { entry: { createdAt: "asc" } }, { id: "asc" }],
            select: { debit: true, credit: true, note: true, entry: { select: { date: true, docNo: true, memo: true, createdAt: true } } },
          });
    const fromOrphans = orphanLines.filter((l) => l.contactId === cid && l.entry.date >= input.from);
    const merged = [
      ...direct.map((l) => ({ debit: l.debit, credit: l.credit, note: l.note, date: l.entry.date, docNo: l.entry.docNo, memo: l.entry.memo })),
      ...fromOrphans.map((l) => ({ debit: l.debit, credit: l.credit, note: l.note, date: l.entry.date, docNo: l.entry.docNo, memo: l.entry.memo })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.docNo ?? "").localeCompare(b.docNo ?? ""));
    let run = row?.opening ?? 0;
    const lines = merged.map((l) => {
      run = run + sign * (l.debit - l.credit) || 0;
      return { date: l.date, docNo: l.docNo, memo: l.note ?? l.memo, debit: l.debit, credit: l.credit, balance: run };
    });
    detail = { contactId: cid, contactName: nameOf(cid), opening: row?.opening ?? 0, lines, closing: run || 0 };
  }
  return { side: input.side, account, rows: live, totals, detail };
}

// ─────────────────── แบ่งหน้าใบพิมพ์ (pure) ───────────────────

export type BookRow = {
  kind: "line" | "group" | "total";
  cells: (string | number | null)[];
  /** แถวที่ต้องอยู่หน้าเดียวกับแถวถัดไป (หัวกลุ่ม) */
  keepWithNext?: boolean;
  /** แถวแรกของก้อนที่ไม่ควรแยกหน้า (เช่น ใบสำคัญ 1 ใบ) — จำนวนแถวของก้อน · ก้อนยาวกว่า 1 หน้าแยกได้ */
  blockSize?: number;
};
export type BookPage = { no: number; rows: BookRow[]; pageSums: number[]; carriedIn: number[]; carriedOut: number[] };

/**
 * แบ่งแถวเป็นหน้า ๆ ละ `rowsPerPage` แถว — เลขหน้าเรียง (ข้อ 5) · ยอดรวมหน้า + ยอดยกมา/ยกไปของคอลัมน์เงิน (amountCols)
 *   แถว kind=line เท่านั้นที่นับเข้ายอด · หัวกลุ่ม (keepWithNext) ไม่ค้างท้ายหน้า
 */
export function paginateBookRows(rows: BookRow[], rowsPerPage: number, amountCols: number[] = []): BookPage[] {
  const per = Math.max(5, rowsPerPage);
  const pages: BookPage[] = [];
  let cur: BookRow[] = [];
  let carried = amountCols.map(() => 0);
  const flush = () => {
    const sums = amountCols.map((c) => cur.filter((r) => r.kind === "line").reduce((s, r) => s + (typeof r.cells[c] === "number" ? (r.cells[c] as number) : 0), 0));
    const out = carried.map((v, i) => v + sums[i]!);
    pages.push({ no: pages.length + 1, rows: cur, pageSums: sums, carriedIn: carried, carriedOut: out });
    carried = out;
    cur = [];
  };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const roomLeft = per - cur.length;
    if (roomLeft <= 0 || (r.keepWithNext && roomLeft <= 1) || (r.blockSize && r.blockSize <= per && r.blockSize > roomLeft && cur.length > 0)) flush();
    cur.push(r);
  }
  if (cur.length || pages.length === 0) flush();
  return pages;
}
