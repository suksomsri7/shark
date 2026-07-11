import { prisma } from "@/lib/core/db";
import type { Prisma, AccountJournalBook, AccountJournalType } from "@prisma/client";
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

type Line = { accountId: string; debit: number; credit: number; note?: string };

class Book {
  lines: Line[] = [];
  needsReview = false;
  constructor(private ctx: GlCtx, private db: Db) {}

  async id(key: string, docType?: string): Promise<string> {
    const r = await resolveLine(this.ctx, key, docType, this.db);
    if (r.needsReview) this.needsReview = true;
    return r.accountId;
  }

  dr(accountId: string, amount: number, note?: string): void {
    if (amount === 0) return;
    if (amount < 0) return this.cr(accountId, -amount, note);
    this.lines.push({ accountId, debit: amount, credit: 0, note });
  }

  cr(accountId: string, amount: number, note?: string): void {
    if (amount === 0) return;
    if (amount < 0) return this.dr(accountId, -amount, note);
    this.lines.push({ accountId, debit: 0, credit: amount, note });
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
};

async function assertPeriodOpen(ctx: GlCtx, periodKey: string, db: Db) {
  const period = await db.accountPeriod.findFirst({
    where: { systemId: ctx.systemId, periodKey },
    select: { status: true },
  });
  if (period?.status === "CLOSED")
    throw new Error(`งวด ${periodKey} ปิดแล้ว — โพสต์บัญชีไม่ได้`);
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
      source: "AUTO",
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
        // (P2 พื้นฐาน) Dr ต้นทุน/ค่าใช้จ่าย + Dr 1150 VAT ซื้อ · Cr 2100 เจ้าหนี้
        const expKey = doc.docType === "PURCHASE" ? "PURCHASE_DEFAULT" : "EXPENSE_DEFAULT";
        b.dr(await b.id(expKey, doc.docType), afterDiscount);
        if (rate > 0) b.dr(await b.id("VAT_INPUT"), doc.vatAmount);
        b.cr(await b.id("AP"), doc.grandTotal);
        book = "PURCHASES";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "บันทึกซื้อ/ค่าใช้จ่าย" };
        break;
      }
      default:
        return { skipped: true, reason: `docType ${doc.docType} ยังไม่รองรับใน P1` };
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
      },
    });
    if (!p) throw new Error("ไม่พบรายการชำระ");
    if (p.voidedAt) return { skipped: true };

    // การหักมัดจำ/เครดิต → ไม่ใช่เงินสด (โพสต์ที่ตอน issue เอกสาร) — Gate B
    if (p.channel === "DEPOSIT_APPLY" || p.channel === "CREDIT_APPLY") return { skipped: true };

    const event = "PAYMENT";
    if (await alreadyPosted(ctx, `AccountDocumentPayment#${paymentId}#${event}`, db))
      return { skipped: true };

    // Dr เงิน (amount − fee) · Dr 1160 WHT · Dr 6500 fee · Cr 1100 AR (amount + WHT = ยอดตัดหนี้)
    const b = new Book(ctx, db);
    const cashId = await financeLedgerId(ctx, p.financeAccountId, p.channel, db);
    b.dr(cashId, p.amount - p.feeAmount);
    if (p.whtAmountSatang > 0) b.dr(await b.id("WHT_ASSET"), p.whtAmountSatang, "ภาษีถูกหัก ณ ที่จ่าย");
    if (p.feeAmount > 0) b.dr(await b.id("PAYMENT_FEE"), p.feeAmount, "ค่าธรรมเนียม");
    b.cr(await b.id("AR"), p.amount + p.whtAmountSatang);

    const entry = await commitEntry(
      ctx,
      {
        book: "RECEIPTS",
        journal: "PAYMENT",
        date: p.paidAt,
        refType: "AccountDocumentPayment",
        refId: paymentId,
        event,
        memo: "รับชำระเงิน",
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
    const date = new Date();

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
