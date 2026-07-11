import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/core/db";
import type {
  Prisma,
  AccountJournalBook,
  AccountJournalType,
  AccountEntrySource,
} from "@prisma/client";
import { seedChartOfAccounts } from "./coa";

// ─────────────────────────────────────────────────────────────
// gl.ts — Posting engine (double-entry) — QC5 Gate A
// หัวใจ correctness: ทุก AccountJournalEntry ต้อง Σdebit == Σcredit เป๊ะ
// อ้าง §7.10 (posting rules) + QC5-A2 (VAT รอ 2205/2210 → 2200 ตอนออกใบกำกับ)
//        + QC5-A4 (ส่วนลด net default · มัดจำ gross รวม VAT)
// เงิน Int สตางค์ล้วน · idempotent ต่อ (refType, refId, event)
// เจ้าของไฟล์ = GL-Core agent · Sales-GateA import ฟังก์ชันเหล่านี้ไปใช้
// ─────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type GlCtx = { tenantId: string; systemId: string };

// เล่มบัญชี → prefix เลขที่ใบสำคัญ (docNo ต้อง unique ต่อ systemId)
const BOOK_PREFIX: Record<AccountJournalBook, string> = {
  SALES: "SV",
  PURCHASES: "PV",
  RECEIPTS: "RV",
  PAYMENTS: "PY",
  GENERAL: "JV",
};

// ─────────────────── ตัวช่วยเวลา/งวด (TZ ไทย) ───────────────────

function bkkPeriod(date: Date): { periodKey: string; year: string; month: string } {
  // "2026-07-11" ตามเวลาไทย → periodKey "2026-07"
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return { periodKey: s.slice(0, 7), year: s.slice(0, 4), month: s.slice(5, 7) };
}

async function withTx<T>(tx: Tx | undefined, fn: (db: Db) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  return prisma.$transaction(fn);
}

// ─────────────────── mapping resolver ───────────────────

async function resolveLine(
  ctx: GlCtx,
  key: string,
  docType: string | undefined,
  db: Db,
): Promise<{ accountId: string; needsReview: boolean }> {
  // resolve: DOC:{docType} override → key กลาง → 9999 SUSPENSE (+needsReview)
  if (docType) {
    const over = await db.accountMapping.findFirst({
      where: { systemId: ctx.systemId, key: `DOC:${docType}` },
      select: { accountId: true },
    });
    if (over) return { accountId: over.accountId, needsReview: false };
  }
  const m = await db.accountMapping.findFirst({
    where: { systemId: ctx.systemId, key },
    select: { accountId: true },
  });
  if (m) return { accountId: m.accountId, needsReview: false };

  const susp = await db.accountMapping.findFirst({
    where: { systemId: ctx.systemId, key: "SUSPENSE" },
    select: { accountId: true },
  });
  if (susp) return { accountId: susp.accountId, needsReview: true };

  const ledger = await db.accountLedger.findFirst({
    where: { systemId: ctx.systemId, code: "9999" },
    select: { id: true },
  });
  if (!ledger)
    throw new Error("ยังไม่ได้ seed ผังบัญชี — เรียก ensureAccounting() ก่อนโพสต์");
  return { accountId: ledger.id, needsReview: true };
}

export async function resolveMapping(
  ctx: GlCtx,
  key: string,
  docType?: string,
  tx?: Tx,
): Promise<string> {
  const { accountId } = await resolveLine(ctx, key, docType, tx ?? prisma);
  return accountId;
}

// บัญชีเงิน (finance account → GL ledger) สำหรับบรรทัดเงินเข้า/ออก
async function financeLedgerId(
  ctx: GlCtx,
  financeAccountId: string | null | undefined,
  channel: string | null | undefined,
  db: Db,
): Promise<string> {
  if (financeAccountId) {
    const fa = await db.accountFinance.findFirst({
      where: { id: financeAccountId, systemId: ctx.systemId },
      select: { ledgerAccountId: true, type: true },
    });
    if (fa?.ledgerAccountId) return fa.ledgerAccountId;
    if (fa) return (await resolveLine(ctx, fa.type === "CASH" ? "CASH" : "BANK", undefined, db)).accountId;
  }
  const key = channel === "CASH" ? "CASH" : "BANK";
  return (await resolveLine(ctx, key, undefined, db)).accountId;
}

// ─────────────────── ตัวสร้าง entry (สะสมบรรทัด + assert balance) ───────────────────

type Line = {
  accountId: string;
  debit: number;
  credit: number;
  note?: string;
  contactId?: string;
};

class Book {
  lines: Line[] = [];
  needsReview = false;
  constructor(private ctx: GlCtx, private db: Db) {}

  async id(key: string, docType?: string): Promise<string> {
    const r = await resolveLine(this.ctx, key, docType, this.db);
    if (r.needsReview) this.needsReview = true;
    return r.accountId;
  }

  dr(accountId: string, amount: number, note?: string, contactId?: string): void {
    if (amount === 0) return;
    if (amount < 0) return this.cr(accountId, -amount, note, contactId);
    this.lines.push({ accountId, debit: amount, credit: 0, note, contactId });
  }

  cr(accountId: string, amount: number, note?: string, contactId?: string): void {
    if (amount === 0) return;
    if (amount < 0) return this.dr(accountId, -amount, note, contactId);
    this.lines.push({ accountId, debit: 0, credit: amount, note, contactId });
  }
}

type CommitOpts = {
  book: AccountJournalBook;
  journal: AccountJournalType;
  date: Date;
  refType: string;
  refId: string;
  event: string; // ส่วนหนึ่งของ idempotencyKey
  memo?: string;
  reversalOfId?: string;
  source?: AccountEntrySource; // default AUTO · JV มือ = MANUAL
  postedById?: string;
};

async function assertPeriodOpen(ctx: GlCtx, periodKey: string, db: Db) {
  const period = await db.accountPeriod.findFirst({
    where: { systemId: ctx.systemId, periodKey },
    select: { status: true },
  });
  if (period?.status === "CLOSED")
    throw new Error(`งวด ${periodKey} ปิดแล้ว — โพสต์บัญชีไม่ได้`);
}

// วันแรกของเดือนถัดไป (เวลาไทย → เที่ยงวันกัน TZ เพี้ยน)
function firstDayNextMonth(periodKey: string): Date {
  const [y, m] = periodKey.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return new Date(`${ny}-${String(nm).padStart(2, "0")}-01T05:00:00.000Z`); // 12:00 ICT
}

// Gate C ledger-M10: ถ้า date ตกงวดปิด → เลื่อนไปวันแรกของงวดเปิดถัดไป (งวดที่ยังไม่สร้าง = เปิด)
async function resolveOpenDate(ctx: GlCtx, date: Date, db: Db): Promise<Date> {
  let d = date;
  for (let i = 0; i < 36; i++) {
    const { periodKey } = bkkPeriod(d);
    const period = await db.accountPeriod.findFirst({
      where: { systemId: ctx.systemId, periodKey },
      select: { status: true },
    });
    if (period?.status !== "CLOSED") return d;
    d = firstDayNextMonth(periodKey);
  }
  throw new Error("ไม่พบงวดเปิดสำหรับลงรายการกลับ (ปิดต่อเนื่องเกิน 36 งวด)");
}

async function commitEntry(ctx: GlCtx, o: CommitOpts, book: Book, db: Db): Promise<{ id: string }> {
  const lines = book.lines.filter((l) => !(l.debit === 0 && l.credit === 0));
  if (lines.length === 0)
    throw new Error(`ไม่มีบรรทัดบัญชีสำหรับ ${o.refType}/${o.refId}/${o.event}`);
  let dr = 0;
  let cr = 0;
  for (const l of lines) {
    if (l.debit < 0 || l.credit < 0)
      throw new Error(`บรรทัดบัญชีติดลบ (${o.refType}/${o.refId})`);
    if (l.debit > 0 && l.credit > 0)
      throw new Error(`บรรทัดบัญชี debit และ credit พร้อมกัน (${o.refType}/${o.refId})`);
    dr += l.debit;
    cr += l.credit;
  }
  // ⚠️ หัวใจ double-entry — Σdebit ต้องเท่ากับ Σcredit เป๊ะ
  if (dr !== cr)
    throw new Error(
      `ลงบัญชีไม่สมดุล: Σdebit ${dr} ≠ Σcredit ${cr} (${o.refType}/${o.refId}/${o.event})`,
    );

  const { periodKey } = bkkPeriod(o.date);
  await assertPeriodOpen(ctx, periodKey, db);

  const docNo = await nextJournalNo(ctx, o.book, o.date, db as Tx);
  const idempotencyKey = `${o.refType}#${o.refId}#${o.event}`;

  const entry = await db.accountJournalEntry.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      docNo,
      book: o.book,
      journal: o.journal,
      date: o.date,
      periodKey,
      refType: o.refType,
      refId: o.refId,
      memo: o.memo ?? null,
      source: o.source ?? "AUTO",
      postedById: o.postedById ?? null,
      needsReview: book.needsReview,
      idempotencyKey,
      reversalOfId: o.reversalOfId ?? null,
      lines: {
        create: lines.map((l) => ({
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          contactId: l.contactId ?? null,
          note: l.note ?? null,
        })),
      },
    },
    select: { id: true },
  });
  return entry;
}

async function alreadyPosted(ctx: GlCtx, idempotencyKey: string, db: Db): Promise<boolean> {
  const e = await db.accountJournalEntry.findFirst({
    where: { systemId: ctx.systemId, idempotencyKey },
    select: { id: true },
  });
  return !!e;
}

// ─────────────────── เลขที่ใบสำคัญ ───────────────────

export async function nextJournalNo(
  ctx: GlCtx,
  book: string,
  date: Date,
  tx?: Tx,
): Promise<string> {
  const db: Db = tx ?? prisma;
  const { periodKey, year, month } = bkkPeriod(date);
  const b = book as AccountJournalBook;
  const prefix = BOOK_PREFIX[b] ?? "JV";
  const count = await db.accountJournalEntry.count({
    where: { systemId: ctx.systemId, book: b, periodKey },
  });
  return `${prefix}-${year}-${month}-${String(count + 1).padStart(4, "0")}`;
}

// ─────────────────── setup ───────────────────

/** seed ผังบัญชี + ประกันงวดปัจจุบัน OPEN (idempotent) — เรียกก่อนโพสต์ทุกครั้งได้ */
export async function ensureAccounting(ctx: GlCtx, tx?: Tx): Promise<void> {
  await withTx(tx, async (db) => {
    await seedChartOfAccounts(ctx, db as Tx);
    const { periodKey } = bkkPeriod(new Date());
    const existing = await db.accountPeriod.findFirst({
      where: { systemId: ctx.systemId, periodKey },
      select: { id: true },
    });
    if (!existing) {
      await db.accountPeriod.create({
        data: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey, status: "OPEN" },
      });
    }
  });
}

// ─────────────────── ตัวช่วยยอดเงิน/VAT ───────────────────

type SaleDoc = {
  id: string;
  docType: string;
  direction: string;
  status: string;
  subTotal: number;
  discountAmount: number;
  vatAmount: number;
  grandTotal: number;
  depositDeducted: number;
  vatMode: string;
  vatTiming: string;
  taxPointBasis: string | null;
  issueDate: Date;
};

async function settingsOf(ctx: GlCtx, db: Db): Promise<{ vatRegistered: boolean; vatRateBp: number }> {
  const s = await db.accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: { vatRegistered: true, vatRateBp: true },
  });
  return { vatRegistered: s?.vatRegistered ?? true, vatRateBp: s?.vatRateBp ?? 700 };
}

// อัตรา VAT ที่ใช้จริงกับเอกสาร (0 เมื่อไม่จด VAT / vatMode NONE)
function effectiveRate(doc: SaleDoc, vatRegistered: boolean, vatRateBp: number): number {
  if (!vatRegistered || doc.vatMode === "NONE") return 0;
  return vatRateBp / 10000;
}

// โหลดบรรทัดเอกสาร (สำหรับ Dr ราย line + override หมวดบัญชี ฝั่งซื้อ/สินทรัพย์)
async function loadDocLines(
  ctx: GlCtx,
  docId: string,
  db: Db,
): Promise<{ accountId: string | null; amount: number }[]> {
  return db.accountDocumentLine.findMany({
    where: { documentId: docId, systemId: ctx.systemId },
    orderBy: { sortOrder: "asc" },
    select: { accountId: true, amount: true },
  });
}

// แยกฐาน/VAT ของยอดมัดจำ (depositDeducted = gross รวม VAT — QC5-A4)
function depositSplit(depositGross: number, rate: number): { base: number; vat: number } {
  if (depositGross <= 0 || rate <= 0) return { base: depositGross, vat: 0 };
  const base = Math.round(depositGross / (1 + rate));
  return { base, vat: depositGross - base };
}

// ─────────────────── postDocument ───────────────────

export async function postDocument(
  ctx: GlCtx,
  docId: string,
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true; reason: string }> {
  return withTx(tx, async (db) => {
    const doc = (await db.accountDocument.findFirst({
      where: { id: docId, systemId: ctx.systemId },
      select: {
        id: true,
        docType: true,
        direction: true,
        status: true,
        subTotal: true,
        discountAmount: true,
        vatAmount: true,
        grandTotal: true,
        depositDeducted: true,
        vatMode: true,
        vatTiming: true,
        taxPointBasis: true,
        issueDate: true,
      },
    })) as SaleDoc | null;
    if (!doc) throw new Error("ไม่พบเอกสาร");

    // docType ที่ไม่โพสต์ GL ที่ตัวมันเอง
    const NO_GL = new Set([
      "QUOTATION",
      "BILLING_NOTE",
      "TAX_INVOICE", // ใช้ postTaxInvoice
      "TAX_INVOICE_ABB",
      "PURCHASE_ORDER",
      "ASSET_PURCHASE_ORDER",
      "WHT_CERT",
      "GOODS_ISSUE",
      "GOODS_ISSUE_RETURN",
    ]);
    if (NO_GL.has(doc.docType)) return { skipped: true, reason: `docType ${doc.docType} ไม่โพสต์ GL` };

    const event = "ISSUE";
    if (await alreadyPosted(ctx, `AccountDocument#${docId}#${event}`, db))
      return { skipped: true, reason: "โพสต์แล้ว (idempotent)" };

    const { vatRegistered, vatRateBp } = await settingsOf(ctx, db);
    const rate = effectiveRate(doc, vatRegistered, vatRateBp);
    const afterDiscount = doc.subTotal - doc.discountAmount; // ฐานรายได้สุทธิ
    const dep = depositSplit(doc.depositDeducted, rate);
    const b = new Book(ctx, db);

    // ส่วนลด: default net (Cr รายได้ = สุทธิ) · use4800 → Cr รายได้ = gross + Dr 4800 (QC5-A4)
    const use4800 = false; // P1: ยังไม่มี field เปิดโหมด 4800 → net เสมอ (Gate B ต่อยอด)
    const creditIncome = async (incomeId: string) => {
      if (use4800 && doc.discountAmount > 0) {
        b.cr(incomeId, doc.subTotal);
        b.dr(await b.id("DISCOUNT_GIVEN"), doc.discountAmount);
      } else {
        b.cr(incomeId, afterDiscount);
      }
    };

    let book: AccountJournalBook = "SALES";
    let opts: CommitOpts;

    switch (doc.docType) {
      case "INVOICE": {
        // Dr 1100 AR · Dr 2110 (ฐานมัดจำ) · Cr รายได้ · Cr VAT รอ (2205 goods / 2210 service)
        const timing = doc.taxPointBasis ?? doc.vatTiming;
        const vatKey = timing === "ON_PAYMENT" ? "VAT_OUTPUT_UNDUE" : "VAT_OUTPUT_PENDING_INVOICE";
        b.dr(await b.id("AR"), doc.grandTotal);
        if (dep.base > 0) b.dr(await b.id("DEPOSIT_RECEIVED"), dep.base, "หักมัดจำ");
        await creditIncome(await b.id("INCOME_DEFAULT", doc.docType));
        if (rate > 0) b.cr(await b.id(vatKey), doc.vatAmount - dep.vat);
        book = "SALES";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "ออกใบแจ้งหนี้" };
        break;
      }
      case "RECEIPT": {
        // ขายสด: Dr เงิน · Cr รายได้ · Cr 2200 (ออกใบกำกับทันที)
        const pay = await db.accountDocumentPayment.findFirst({
          where: { documentId: docId, systemId: ctx.systemId, voidedAt: null },
          orderBy: { paidAt: "asc" },
          select: { financeAccountId: true, channel: true },
        });
        const cashId = await financeLedgerId(ctx, pay?.financeAccountId, pay?.channel, db);
        b.dr(cashId, doc.grandTotal);
        if (dep.base > 0) b.dr(await b.id("DEPOSIT_RECEIVED"), dep.base, "หักมัดจำ");
        await creditIncome(await b.id("INCOME_DEFAULT", doc.docType));
        if (rate > 0) b.cr(await b.id("VAT_OUTPUT"), doc.vatAmount - dep.vat);
        book = "RECEIPTS";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "ใบเสร็จขายสด" };
        break;
      }
      case "DEPOSIT_RECEIPT": {
        // รับมัดจำ: Dr เงิน · Cr 2110 (ฐาน) · Cr 2200 (VAT เกิดตอนรับเงิน)
        const pay = await db.accountDocumentPayment.findFirst({
          where: { documentId: docId, systemId: ctx.systemId, voidedAt: null },
          orderBy: { paidAt: "asc" },
          select: { financeAccountId: true, channel: true },
        });
        const cashId = await financeLedgerId(ctx, pay?.financeAccountId, pay?.channel, db);
        b.dr(cashId, doc.grandTotal);
        b.cr(await b.id("DEPOSIT_RECEIVED"), doc.grandTotal - doc.vatAmount);
        if (rate > 0) b.cr(await b.id("VAT_OUTPUT"), doc.vatAmount);
        book = "RECEIPTS";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "รับเงินมัดจำ" };
        break;
      }
      case "CREDIT_NOTE": {
        // Dr รายได้ + Dr 2200 · Cr 1100 AR
        b.dr(await b.id("INCOME_DEFAULT", doc.docType), afterDiscount);
        if (rate > 0) b.dr(await b.id("VAT_OUTPUT"), doc.vatAmount);
        b.cr(await b.id("AR"), doc.grandTotal);
        book = "SALES";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "ใบลดหนี้" };
        break;
      }
      case "DEBIT_NOTE": {
        // Dr 1100 AR · Cr รายได้ + Cr 2200
        b.dr(await b.id("AR"), doc.grandTotal);
        await creditIncome(await b.id("INCOME_DEFAULT", doc.docType));
        if (rate > 0) b.cr(await b.id("VAT_OUTPUT"), doc.vatAmount);
        book = "SALES";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "ใบเพิ่มหนี้" };
        break;
      }
      case "PURCHASE":
      case "EXPENSE": {
        // Dr ต้นทุน/ค่าใช้จ่าย (ราย line + override หมวด) · Dr 1150/1155 VAT ซื้อ · Cr 2100 เจ้าหนี้
        // ส่วนลดท้ายบิล → Cr 5800 ส่วนลดรับ (contra) เพื่อให้ Σ line = subTotal คงเดิม
        const expKey = doc.docType === "PURCHASE" ? "PURCHASE_DEFAULT" : "EXPENSE_DEFAULT";
        const vatInKey = doc.status === "AWAITING_RECEIVE" ? "VAT_INPUT_UNDUE" : "VAT_INPUT";
        const lines = await loadDocLines(ctx, docId, db);
        if (lines.length > 0) {
          for (const l of lines) b.dr(l.accountId ?? (await b.id(expKey, doc.docType)), l.amount);
        } else {
          b.dr(await b.id(expKey, doc.docType), doc.subTotal);
        }
        if (doc.discountAmount > 0) b.cr(await b.id("DISCOUNT_RECEIVED"), doc.discountAmount, "ส่วนลดรับ");
        if (rate > 0) b.dr(await b.id(vatInKey), doc.vatAmount);
        b.cr(await b.id("AP"), doc.grandTotal);
        book = "PURCHASES";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "บันทึกซื้อ/ค่าใช้จ่าย" };
        break;
      }
      case "ASSET_PURCHASE": {
        // Dr 16xx สินทรัพย์ (ราคาสุทธิ) + Dr 1150 VAT ซื้อ · Cr 2100 เจ้าหนี้
        const lines = await loadDocLines(ctx, docId, db);
        const assetAcct = lines.find((l) => l.accountId)?.accountId ?? (await b.id("ASSET_DEFAULT", doc.docType));
        b.dr(assetAcct, afterDiscount, "ราคาทุนสินทรัพย์");
        if (rate > 0) b.dr(await b.id("VAT_INPUT"), doc.vatAmount);
        b.cr(await b.id("AP"), doc.grandTotal);
        book = "PURCHASES";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "ซื้อสินทรัพย์" };
        break;
      }
      case "PURCHASE_TAX_INVOICE": {
        // รับใบกำกับภาษีซื้อแล้ว → ย้าย 1155 (รอใบกำกับ) เข้า 1150 (เคลมได้)
        if (doc.vatAmount <= 0) return { skipped: true, reason: "ไม่มี VAT ให้ย้าย" };
        b.dr(await b.id("VAT_INPUT"), doc.vatAmount);
        b.cr(await b.id("VAT_INPUT_UNDUE"), doc.vatAmount);
        book = "GENERAL";
        opts = { book, journal: "ADJUST", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "รับใบกำกับภาษีซื้อ — รับรู้ภาษีซื้อ" };
        break;
      }
      case "DEPOSIT_PAYMENT": {
        // จ่ายเงินมัดจำให้ผู้ขาย: Dr 1130 มัดจำจ่าย (+1150 VAT) · Cr เงิน
        const pay = await db.accountDocumentPayment.findFirst({
          where: { documentId: docId, systemId: ctx.systemId, voidedAt: null },
          orderBy: { paidAt: "asc" },
          select: { financeAccountId: true, channel: true },
        });
        const cashId = await financeLedgerId(ctx, pay?.financeAccountId, pay?.channel, db);
        b.dr(await b.id("DEPOSIT_PAID"), doc.grandTotal - doc.vatAmount, "มัดจำจ่าย");
        if (rate > 0) b.dr(await b.id("VAT_INPUT"), doc.vatAmount);
        b.cr(cashId, doc.grandTotal);
        book = "PAYMENTS";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "จ่ายเงินมัดจำ" };
        break;
      }
      case "CREDIT_NOTE_RECEIVED": {
        // รับใบลดหนี้จากผู้ขาย: Dr 2100 เจ้าหนี้ · Cr ต้นทุน/ค่าใช้จ่าย + Cr 1150 (กลับภาษีซื้อ)
        b.dr(await b.id("AP"), doc.grandTotal);
        b.cr(await b.id("PURCHASE_DEFAULT", doc.docType), afterDiscount);
        if (rate > 0) b.cr(await b.id("VAT_INPUT"), doc.vatAmount);
        book = "PURCHASES";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "รับใบลดหนี้" };
        break;
      }
      case "DEBIT_NOTE_RECEIVED": {
        // รับใบเพิ่มหนี้จากผู้ขาย: Dr ต้นทุน/ค่าใช้จ่าย + Dr 1150 · Cr 2100 เจ้าหนี้
        b.dr(await b.id("PURCHASE_DEFAULT", doc.docType), afterDiscount);
        if (rate > 0) b.dr(await b.id("VAT_INPUT"), doc.vatAmount);
        b.cr(await b.id("AP"), doc.grandTotal);
        book = "PURCHASES";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "รับใบเพิ่มหนี้" };
        break;
      }
      default:
        return { skipped: true, reason: `docType ${doc.docType} ยังไม่รองรับ` };
    }

    const entry = await commitEntry(ctx, opts, b, db);
    return { entryId: entry.id };
  });
}

// ─────────────────── postPayment (รับชำระ IV) ───────────────────

export async function postPayment(
  ctx: GlCtx,
  paymentId: string,
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true }> {
  return withTx(tx, async (db) => {
    const p = await db.accountDocumentPayment.findFirst({
      where: { id: paymentId, systemId: ctx.systemId },
      select: {
        id: true,
        documentId: true,
        paidAt: true,
        channel: true,
        financeAccountId: true,
        amount: true,
        whtAmountSatang: true,
        feeAmount: true,
        voidedAt: true,
        document: { select: { direction: true, contactId: true } },
      },
    });
    if (!p) throw new Error("ไม่พบรายการชำระ");
    if (p.voidedAt) return { skipped: true };

    const event = "PAYMENT";
    if (await alreadyPosted(ctx, `AccountDocumentPayment#${paymentId}#${event}`, db))
      return { skipped: true };

    const isPayable = p.document?.direction === "IN"; // จ่ายให้ผู้ขาย (ฝั่งเจ้าหนี้)
    const contactId = p.document?.contactId ?? undefined;
    const b = new Book(ctx, db);

    // ── channel หักมัดจำ/เครดิต (ไม่มีเงินสด) — ledger-M3 ──
    if (p.channel === "DEPOSIT_APPLY") {
      // ลูกค้า: Dr 2110 มัดจำรับ / Cr 1100 AR · ผู้ขาย: Dr 2100 AP / Cr 1130 มัดจำจ่าย
      if (isPayable) {
        b.dr(await b.id("AP"), p.amount, "หักมัดจำจ่าย", contactId);
        b.cr(await b.id("DEPOSIT_PAID"), p.amount, "หักมัดจำจ่าย", contactId);
      } else {
        b.dr(await b.id("DEPOSIT_RECEIVED"), p.amount, "หักมัดจำรับ", contactId);
        b.cr(await b.id("AR"), p.amount, "หักมัดจำรับ", contactId);
      }
    } else if (p.channel === "CREDIT_APPLY") {
      // หักเครดิต (ใบลดหนี้/จ่ายเกิน) กับหนี้อีกใบ — reclass ภายในบัญชีคุมยอด (คงยอด GL, subledger ตาม contact)
      if (isPayable) {
        b.dr(await b.id("AP"), p.amount, "หักเครดิตเจ้าหนี้", contactId);
        b.cr(await b.id("AP"), p.amount, "จากเครดิตคงเหลือ", contactId);
      } else {
        b.dr(await b.id("AR"), p.amount, "จากเครดิตคงเหลือ", contactId);
        b.cr(await b.id("AR"), p.amount, "หักเครดิตลูกหนี้", contactId);
      }
    } else if (isPayable) {
      // จ่ายชำระเจ้าหนี้: Dr 2100 (amount+WHT) + Dr 6500 fee · Cr เงิน (amount+fee) · Cr 2130 WHT ค้างนำส่ง
      const cashId = await financeLedgerId(ctx, p.financeAccountId, p.channel, db);
      b.dr(await b.id("AP"), p.amount + p.whtAmountSatang, "จ่ายชำระ", contactId);
      if (p.feeAmount > 0) b.dr(await b.id("PAYMENT_FEE"), p.feeAmount, "ค่าธรรมเนียม");
      b.cr(cashId, p.amount + p.feeAmount);
      if (p.whtAmountSatang > 0) b.cr(await b.id("WHT_PAYABLE"), p.whtAmountSatang, "ภาษีหัก ณ ที่จ่ายค้างนำส่ง", contactId);
    } else {
      // รับชำระลูกหนี้: Dr เงิน (amount−fee) + Dr 1160 WHT + Dr 6500 fee · Cr 1100 AR (amount+WHT)
      const cashId = await financeLedgerId(ctx, p.financeAccountId, p.channel, db);
      b.dr(cashId, p.amount - p.feeAmount);
      if (p.whtAmountSatang > 0) b.dr(await b.id("WHT_ASSET"), p.whtAmountSatang, "ภาษีถูกหัก ณ ที่จ่าย", contactId);
      if (p.feeAmount > 0) b.dr(await b.id("PAYMENT_FEE"), p.feeAmount, "ค่าธรรมเนียม");
      b.cr(await b.id("AR"), p.amount + p.whtAmountSatang, "รับชำระ", contactId);
    }

    const entry = await commitEntry(
      ctx,
      {
        book: isPayable ? "PAYMENTS" : "RECEIPTS",
        journal: "PAYMENT",
        date: p.paidAt,
        refType: "AccountDocumentPayment",
        refId: paymentId,
        event,
        memo: isPayable ? "จ่ายชำระเงิน" : "รับชำระเงิน",
      },
      b,
      db,
    );
    return { entryId: entry.id };
  });
}

// ─────────────────── postTaxInvoice (ออกใบกำกับ → ย้าย VAT รอ → 2200) ───────────────────

export async function postTaxInvoice(
  ctx: GlCtx,
  taxInvoiceDocId: string,
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true }> {
  return withTx(tx, async (db) => {
    const doc = await db.accountDocument.findFirst({
      where: { id: taxInvoiceDocId, systemId: ctx.systemId },
      select: { id: true, vatAmount: true, vatTiming: true, taxPointBasis: true, issueDate: true },
    });
    if (!doc) throw new Error("ไม่พบใบกำกับภาษี");
    if (doc.vatAmount <= 0) return { skipped: true }; // ไม่มี VAT ให้ย้าย

    const event = "TAX_INVOICE";
    if (await alreadyPosted(ctx, `AccountDocument#${taxInvoiceDocId}#${event}`, db))
      return { skipped: true };

    // QC5-A2: เดือนภาษี = จุดออกใบกำกับ → ย้าย VAT รอ (2205 goods / 2210 service) เข้า 2200
    const timing = doc.taxPointBasis ?? doc.vatTiming;
    const parkedKey = timing === "ON_PAYMENT" ? "VAT_OUTPUT_UNDUE" : "VAT_OUTPUT_PENDING_INVOICE";
    const b = new Book(ctx, db);
    b.dr(await b.id(parkedKey), doc.vatAmount);
    b.cr(await b.id("VAT_OUTPUT"), doc.vatAmount);

    const entry = await commitEntry(
      ctx,
      {
        book: "SALES",
        journal: "ADJUST",
        date: doc.issueDate,
        refType: "AccountDocument",
        refId: taxInvoiceDocId,
        event,
        memo: "ออกใบกำกับภาษี — รับรู้ภาษีขาย",
      },
      b,
      db,
    );
    return { entryId: entry.id };
  });
}

// ─────────────────── reverseFor (VOID → กลับรายการทุก entry ของต้นทาง) ───────────────────

export async function reverseFor(
  ctx: GlCtx,
  refType: string,
  refId: string,
  reason: string,
  tx?: Tx,
): Promise<{ entryId: string }[]> {
  return withTx(tx, async (db) => {
    const entries = await db.accountJournalEntry.findMany({
      where: { systemId: ctx.systemId, refType, refId, status: "POSTED" },
      include: { lines: true },
    });
    const out: { entryId: string }[] = [];
    // Gate C ledger-M10: void งวดปิด → reversal ลงงวดเปิดถัดไป (memo คงเหตุผลเดิม)
    const date = await resolveOpenDate(ctx, new Date(), db);

    for (const e of entries) {
      const idempotencyKey = `${refType}#${refId}#REVERSAL:${e.id}`;
      const existing = await db.accountJournalEntry.findFirst({
        where: { systemId: ctx.systemId, idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        out.push({ entryId: existing.id });
        continue;
      }

      const { periodKey } = bkkPeriod(date);
      await assertPeriodOpen(ctx, periodKey, db);
      const docNo = await nextJournalNo(ctx, e.book, date, db as Tx);

      const rev = await db.accountJournalEntry.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          docNo,
          book: e.book, // เล่มเดิม
          journal: "REVERSAL",
          date,
          periodKey,
          refType,
          refId,
          memo: `กลับรายการ: ${reason}`,
          source: "AUTO",
          reversalOfId: e.id,
          idempotencyKey,
          lines: {
            create: e.lines.map((l) => ({
              tenantId: ctx.tenantId,
              systemId: ctx.systemId,
              accountId: l.accountId,
              debit: l.credit, // สลับ dr/cr
              credit: l.debit,
              contactId: l.contactId,
              note: l.note,
            })),
          },
        },
        select: { id: true },
      });
      await db.accountJournalEntry.update({ where: { id: e.id }, data: { status: "REVERSED" } });
      out.push({ entryId: rev.id });
    }
    return out;
  });
}

// ─────────────────── postManualJV (JV มือ — ADJUST) ───────────────────

/**
 * บันทึกบัญชีด้วยมือ (JV) — Σdebit ต้องเท่ากับ Σcredit (โยน error ถ้าไม่)
 * journal = ADJUST · source = MANUAL · เล่มเริ่มต้น GENERAL
 * account.journal.adjust (OWNER) — assert ที่ชั้น action
 */
export async function postManualJV(
  ctx: GlCtx,
  input: {
    date: Date;
    memo?: string;
    book?: AccountJournalBook;
    postedById?: string;
    lines: { accountId: string; debit: number; credit: number; contactId?: string; note?: string }[];
  },
  tx?: Tx,
): Promise<{ entryId: string }> {
  return withTx(tx, async (db) => {
    const lines = input.lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0);
    if (lines.length < 2) throw new Error("JV ต้องมีอย่างน้อย 2 บรรทัด");
    let dr = 0;
    let cr = 0;
    for (const l of lines) {
      if (l.debit < 0 || l.credit < 0) throw new Error("บรรทัด JV ติดลบไม่ได้");
      if (l.debit > 0 && l.credit > 0) throw new Error("บรรทัด JV ลง debit และ credit พร้อมกันไม่ได้");
      dr += l.debit;
      cr += l.credit;
    }
    if (dr !== cr) throw new Error(`JV ไม่สมดุล: Σdebit ${dr} ≠ Σcredit ${cr}`);

    const b = new Book(ctx, db);
    for (const l of lines) {
      if (l.debit > 0) b.dr(l.accountId, l.debit, l.note, l.contactId);
      if (l.credit > 0) b.cr(l.accountId, l.credit, l.note, l.contactId);
    }

    // refId unique ต่อ JV (idempotencyKey กันโพสต์ซ้ำจาก retry)
    const refId = randomUUID();
    const entry = await commitEntry(
      ctx,
      {
        book: input.book ?? "GENERAL",
        journal: "ADJUST",
        date: input.date,
        refType: "AccountManualJV",
        refId,
        event: "MANUAL",
        memo: input.memo ?? "บันทึกบัญชีด้วยมือ",
        source: "MANUAL",
        postedById: input.postedById,
      },
      b,
      db,
    );
    return { entryId: entry.id };
  });
}

// ─────────────────── postDepreciation (ค่าเสื่อมรายเดือน) ───────────────────

/**
 * ลงค่าเสื่อม 1 งวด: Dr 6800 ค่าเสื่อม / Cr 16x9 ค่าเสื่อมสะสม
 * journal = DEPRECIATION · idempotent ต่อ (assetId, periodKey)
 * date = วันสุดท้ายของงวด (ให้ตกเดือนที่ถูกต้อง) · asset.ts เป็นผู้เรียก + ถือ AccountDepreciation row
 */
export async function postDepreciation(
  ctx: GlCtx,
  input: {
    assetId: string;
    periodKey: string;
    amount: number;
    expenseAccountId: string;
    accumAccountId: string;
  },
  tx?: Tx,
): Promise<{ entryId: string }> {
  return withTx(tx, async (db) => {
    const refId = `${input.assetId}:${input.periodKey}`;
    const existing = await db.accountJournalEntry.findFirst({
      where: {
        systemId: ctx.systemId,
        idempotencyKey: `AccountDepreciation#${refId}#DEPRECIATION`,
      },
      select: { id: true },
    });
    if (existing) return { entryId: existing.id };
    if (input.amount <= 0) throw new Error("ยอดค่าเสื่อมต้อง > 0");

    // วันสุดท้ายของงวด = (วันแรกเดือนถัดไป − 1 วัน)
    const nextFirst = firstDayNextMonth(input.periodKey);
    const date = new Date(nextFirst.getTime() - 24 * 60 * 60 * 1000);

    const b = new Book(ctx, db);
    b.dr(input.expenseAccountId, input.amount, "ค่าเสื่อมราคา");
    b.cr(input.accumAccountId, input.amount, "ค่าเสื่อมราคาสะสม");

    const entry = await commitEntry(
      ctx,
      {
        book: "GENERAL",
        journal: "DEPRECIATION",
        date,
        refType: "AccountDepreciation",
        refId,
        event: "DEPRECIATION",
        memo: `ค่าเสื่อมราคางวด ${input.periodKey}`,
      },
      b,
      db,
    );
    return { entryId: entry.id };
  });
}

// ─────────────────── postOpening (ยอดยกมา + บัญชีคู่ 3999) ───────────────────

/**
 * ยอดยกมา (Gate C ledger-M6): Dr/Cr ตาม lines · เศษที่ไม่สมดุล balance ด้วย 3999
 * journal = OPENING · idempotent ต่องวดของ date (1 งวด = 1 ชุดยอดยกมา)
 */
export async function postOpening(
  ctx: GlCtx,
  input: { date: Date; lines: { accountId: string; debit: number; credit: number }[] },
  tx?: Tx,
): Promise<{ entryId: string }> {
  return withTx(tx, async (db) => {
    const lines = input.lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0);
    if (lines.length === 0) throw new Error("ไม่มีบรรทัดยอดยกมา");

    const { periodKey: openPeriod } = bkkPeriod(input.date);
    if (await alreadyPosted(ctx, `AccountOpening#${openPeriod}#OPENING`, db))
      throw new Error(`มียอดยกมาของงวด ${openPeriod} แล้ว — ถ้าต้องแก้ ให้กลับรายการก่อน`);

    const b = new Book(ctx, db);
    let dr = 0;
    let cr = 0;
    for (const l of lines) {
      if (l.debit < 0 || l.credit < 0) throw new Error("บรรทัดยอดยกมาติดลบไม่ได้");
      b.dr(l.accountId, l.debit, "ยอดยกมา");
      b.cr(l.accountId, l.credit, "ยอดยกมา");
      dr += l.debit;
      cr += l.credit;
    }
    // บัญชีคู่ balance ด้วย 3999 (residual > 0 = debit เกิน → Cr 3999)
    const residual = dr - cr;
    if (residual !== 0) {
      const openId = await b.id("OPENING_BALANCE");
      if (residual > 0) b.cr(openId, residual, "บัญชีคู่เปิดบัญชี");
      else b.dr(openId, -residual, "บัญชีคู่เปิดบัญชี");
    }

    const entry = await commitEntry(
      ctx,
      {
        book: "GENERAL",
        journal: "OPENING",
        date: input.date,
        refType: "AccountOpening",
        refId: openPeriod,
        event: "OPENING",
        memo: `ยอดยกมา ${openPeriod}`,
      },
      b,
      db,
    );
    return { entryId: entry.id };
  });
}

// ─────────────────── ปิด/เปิดงวด ───────────────────

/**
 * ปิดงวด (Gate C): pre-close = suspense 9999 สะสม (ถึงสิ้นงวด) = 0 + ไม่มี entry needsReview ในงวด
 * → set AccountPeriod CLOSED (สร้าง row ถ้ายังไม่มี)
 */
export async function closePeriod(
  ctx: GlCtx,
  periodKey: string,
  userId: string,
): Promise<{ ok: boolean; reason?: string }> {
  return prisma.$transaction(async (db) => {
    // 1) suspense 9999 ต้องเคลียร์ (net สะสมถึงสิ้นงวด = 0)
    const suspense = await db.accountLedger.findFirst({
      where: { systemId: ctx.systemId, code: "9999" },
      select: { id: true },
    });
    if (suspense) {
      const agg = await db.accountJournalLine.aggregate({
        where: {
          systemId: ctx.systemId,
          accountId: suspense.id,
          entry: { status: "POSTED", periodKey: { lte: periodKey } },
        },
        _sum: { debit: true, credit: true },
      });
      const net = (agg._sum.debit ?? 0) - (agg._sum.credit ?? 0);
      if (net !== 0)
        return { ok: false, reason: `บัญชีพักรายการ (9999) ยังไม่เคลียร์: คงเหลือ ${net} สตางค์` };
    }

    // 2) ไม่มี entry ที่ต้องตรวจ (needsReview) ในงวดนี้
    const review = await db.accountJournalEntry.count({
      where: { systemId: ctx.systemId, periodKey, status: "POSTED", needsReview: true },
    });
    if (review > 0)
      return { ok: false, reason: `ยังมี ${review} รายการที่ต้องตรวจสอบ (needsReview) ในงวดนี้` };

    // 3) ปิดงวด
    await db.accountPeriod.upsert({
      where: { systemId_periodKey: { systemId: ctx.systemId, periodKey } },
      create: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        periodKey,
        status: "CLOSED",
        closedAt: new Date(),
        closedById: userId,
      },
      update: { status: "CLOSED", closedAt: new Date(), closedById: userId },
    });
    return { ok: true };
  });
}

/**
 * เปิดงวดที่ปิดแล้ว (OWNER — assert ที่ชั้น action) + บันทึก reopenLog + audit (ที่ชั้น action)
 */
export async function reopenPeriod(
  ctx: GlCtx,
  periodKey: string,
  reason: string,
  userId: string,
): Promise<void> {
  await prisma.$transaction(async (db) => {
    const period = await db.accountPeriod.findFirst({
      where: { systemId: ctx.systemId, periodKey },
      select: { id: true, reopenLog: true },
    });
    if (!period) throw new Error(`ไม่พบงวด ${periodKey}`);
    const log = Array.isArray(period.reopenLog) ? (period.reopenLog as unknown[]) : [];
    log.push({ at: new Date().toISOString(), by: userId, reason });
    await db.accountPeriod.update({
      where: { id: period.id },
      data: { status: "OPEN", closedAt: null, closedById: null, reopenLog: log as never },
    });
  });
}
