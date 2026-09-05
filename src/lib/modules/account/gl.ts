import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/core/db";
import type {
  Prisma,
  AccountJournalBook,
  AccountJournalType,
  AccountEntrySource,
} from "@prisma/client";
import { seedChartOfAccounts } from "./coa";
import { isLockedDate, lockedMessage } from "./policy";

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
  isPayable = false,
): Promise<string> {
  // M6: ชำระด้วยเช็ค → พักที่เช็ครอเรียกเก็บ (ยังไม่ขึ้นเงินธนาคาร) จน clearCheque ย้ายเข้า/ออก 1010
  //     รับ (IN) → 1040 เช็ครับรอนำฝาก · จ่าย (OUT) → 2300 เช็คจ่ายรอเรียกเก็บ
  if (channel === "CHEQUE") {
    return (await resolveLine(ctx, isPayable ? "CHEQUE_PAYABLE" : "CHEQUE_IN_TRANSIT", undefined, db)).accountId;
  }
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

/**
 * WO 8.2 (§9.3) — ด่าน "ล็อกข้อมูลก่อนวันที่"
 * 🔴 อยู่ตรงนี้เพราะ `commitEntry` คือคอขวดเดียวที่ทุกฟังก์ชัน post / reverse ผ่าน
 *    ⇒ ปิดที่นี่ที่เดียว = ครอบการโพสต์บัญชีทั้งโมดูล (เอกสาร · ชำระเงิน · เช็ค · สินทรัพย์ · คลัง · POS · เงินเดือน)
 *    อ่านผ่าน `db` ตัวเดียวกับที่กำลังโพสต์ ⇒ อยู่ใน transaction เดียวกัน เห็นค่าที่เพิ่งบันทึกเสมอ
 *    ตรรกะตัดสิน (isLockedDate/lockedMessage) เป็นฟังก์ชันบริสุทธิ์ใน policy.ts — ข้อสอบเรียกตรงได้
 */
async function assertNotLockedGl(ctx: GlCtx, date: Date, db: Db) {
  const s = await db.accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: { lockBeforeDate: true },
  });
  const lock = s?.lockBeforeDate ?? null;
  if (lock && isLockedDate(lock, date)) throw new Error(lockedMessage(lock));
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
  await assertNotLockedGl(ctx, o.date, db);

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
  sourceDocId: string | null;
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
// vatRateBp ต้องมาด้วย เพราะโหมด "ราคารวม VAT" ต้องถอด VAT ตามอัตราของแต่ละบรรทัด
async function loadDocLines(
  ctx: GlCtx,
  docId: string,
  db: Db,
): Promise<{ accountId: string | null; amount: number; vatRateBp: number }[]> {
  return db.accountDocumentLine.findMany({
    where: { documentId: docId, systemId: ctx.systemId },
    orderBy: { sortOrder: "asc" },
    select: { accountId: true, amount: true, vatRateBp: true },
  });
}

// แยกฐาน/VAT ของยอดมัดจำ (depositDeducted = gross รวม VAT — QC5-A4)
function depositSplit(depositGross: number, rate: number): { base: number; vat: number } {
  if (depositGross <= 0 || rate <= 0) return { base: depositGross, vat: 0 };
  const base = Math.round(depositGross / (1 + rate));
  return { base, vat: depositGross - base };
}

// ฐานสุทธิ (ก่อน VAT) ของบรรทัดฝั่งซื้อ/ค่าใช้จ่าย
// โหมด EXCLUDE/NONE: amount = ฐานอยู่แล้ว · โหมด INCLUDE: amount รวม VAT แล้ว → ต้องถอดออกก่อนลงต้นทุน
// ใช้ depositSplit (ตัวถอด VAT ออกจากยอด gross ตัวเดียวกับที่ใช้กับมัดจำ) — ไม่มีสูตร VAT ซ้ำในไฟล์นี้
// อัตราต่อบรรทัด: vatRateBp ≤ 0 = ยกเว้น/0% (ตรงกับ service.lineRate)
function lineNetBase(
  l: { amount: number; vatRateBp: number },
  docRate: number,
  vatMode: string,
): number {
  if (vatMode !== "INCLUDE" || docRate <= 0) return l.amount;
  const rate = l.vatRateBp > 0 ? l.vatRateBp / 10000 : 0;
  return rate > 0 ? depositSplit(l.amount, rate).base : l.amount;
}

// กระจาย total ลงแต่ละบรรทัดตามน้ำหนัก (largest remainder) — Σ ที่ได้ตรงกับ total เป๊ะเสมอ
// ใช้ผูกยอดเดบิตราย line เข้ากับ doc.subTotal ที่ service.computeTotals คำนวณไว้แล้ว
// (ตรรกะเดียวกับ service.allocateProportional แต่ import ขึ้นไปไม่ได้ — service เป็นชั้นบนของ gl จะเป็นวงจร)
function splitByWeight(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW === total) return weights.slice(); // ตรงอยู่แล้ว (โหมดราคาแยก VAT) → ไม่แตะการปัดเศษเลย
  if (sumW <= 0 || total <= 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const raw = weights.map((w) => (total * w) / sumW);
  const out = raw.map((r) => Math.floor(r));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0; k++, rem--) out[order[k % order.length].i] += 1;
  return out;
}

// ─────────────────── postDocument ───────────────────

export async function postDocument(
  ctx: GlCtx,
  docId: string,
  tx?: Tx,
  /** WO 1.4: เปลี่ยน "event" ของ idempotencyKey — ใช้ตอนโพสต์ใบมัดจำใหม่หลังยกเลิกการชำระ
   *  (คีย์เดิม `AccountDocument#id#ISSUE` ถูกใช้ไปแล้วและกลับรายการไปแล้ว ⇒ โพสต์ซ้ำต้องคีย์ใหม่) */
  postOpts?: { event?: string },
): Promise<{ entryId: string } | { skipped: true; reason: string }> {
  return withTx(tx, async (db) => {
    const doc = (await db.accountDocument.findFirst({
      where: { id: docId, systemId: ctx.systemId },
      select: {
        id: true,
        docType: true,
        direction: true,
        status: true,
        sourceDocId: true,
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
      // WO 1.7: เอกสาร "กลุ่ม" ทั้ง 2 ฝั่ง = ใบสรุปยอด ไม่ลง JV ที่ตัวเอง
      //   BN — ลูกหนี้ตั้งไว้ที่ใบแจ้งหนี้ลูกแล้ว (ลงซ้ำ = AR 2 เท่า)
      //   CP — เจ้าหนี้ตั้งไว้ที่บันทึกซื้อ/ค่าใช้จ่ายลูกแล้ว · JV เกิดตอนกระจายจ่ายให้ใบลูก (Dr 2100/Cr เงิน)
      "BILLING_NOTE",
      "COMBINED_PAYMENT",
      "TAX_INVOICE", // ใช้ postTaxInvoice
      "TAX_INVOICE_ABB",
      "PURCHASE_ORDER",
      "ASSET_PURCHASE_ORDER",
      "WHT_CERT",
      "GOODS_ISSUE",
      "GOODS_ISSUE_RETURN",
    ]);
    if (NO_GL.has(doc.docType)) return { skipped: true, reason: `docType ${doc.docType} ไม่โพสต์ GL` };

    const event = postOpts?.event ?? "ISSUE";
    if (await alreadyPosted(ctx, `AccountDocument#${docId}#${event}`, db))
      return { skipped: true, reason: "โพสต์แล้ว (idempotent)" };

    const { vatRegistered, vatRateBp } = await settingsOf(ctx, db);
    const rate = effectiveRate(doc, vatRegistered, vatRateBp);
    const afterDiscount = doc.subTotal - doc.discountAmount; // ฐานรายได้สุทธิ
    const dep = depositSplit(doc.depositDeducted, rate);
    const b = new Book(ctx, db);

    // F-09: แยกบัญชีรายได้ตามจุดรับรู้ภาษี — สินค้า (ON_ISSUE) → 4000 · บริการ (ON_PAYMENT) → 4030
    // (ไม่มีข้อมูลสินค้าราย line ในเอกสารทั่วไป → ใช้ tax point เป็นตัวชี้หมวดรายได้)
    const timing = doc.taxPointBasis ?? doc.vatTiming;
    const incomeKey = timing === "ON_PAYMENT" ? "INCOME_SERVICE" : "INCOME_GOODS";

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
        await creditIncome(await b.id(incomeKey, doc.docType));
        if (rate > 0) b.cr(await b.id(vatKey), doc.vatAmount - dep.vat);
        book = "SALES";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "ออกใบแจ้งหนี้" };
        break;
      }
      case "RECEIPT": {
        // ── WO 1.4 (รูรั่วเดิม): ใบเสร็จที่ "แปลงมาจากใบแจ้งหนี้" ไม่ใช่การขายสด ──
        //    รายได้/VAT/ลูกหนี้ ถูกตั้งไปแล้วตอนออก IV ⇒ ถ้าโพสต์ขายสดอีกใบ = รายได้ + VAT ขาย ซ้ำ 2 เท่า
        //    เงินที่รับจริงลงผ่าน `postPayment` ของใบแจ้งหนี้ (Dr เงิน/Dr 1160 · Cr 1100) แทน
        if (doc.sourceDocId) {
          const src = await db.accountDocument.findFirst({
            where: { id: doc.sourceDocId, systemId: ctx.systemId },
            select: { docType: true },
          });
          if (src?.docType === "INVOICE")
            return { skipped: true, reason: "ใบเสร็จของใบแจ้งหนี้ — บัญชีลงที่การรับชำระของใบแจ้งหนี้" };
        }
        // ขายสด: Dr เงิน (ตามการรับชำระจริงทุกครั้ง) · Dr 1160 WHT ที่ลูกค้าหัก · Dr ค่าธรรมเนียม
        //        · Cr รายได้ · Cr 2200 (ออกใบกำกับทันที)
        const pays = await db.accountDocumentPayment.findMany({
          where: { documentId: docId, systemId: ctx.systemId, voidedAt: null },
          orderBy: { paidAt: "asc" },
          select: { financeAccountId: true, channel: true, amount: true, whtAmountSatang: true, feeAmount: true },
        });
        const tieOff = pays.reduce((s, p) => s + p.amount + p.whtAmountSatang, 0);
        if (pays.length > 0 && tieOff === doc.grandTotal) {
          // มีรายการรับเงินครบยอด → เดบิตตามช่องทางจริงทีละครั้ง (g2: ธนาคาร 14,900 + เงินสด 9,301.87 + WHT 698.13)
          for (const p of pays) {
            const id = await financeLedgerId(ctx, p.financeAccountId, p.channel ?? "CASH", db);
            b.dr(id, p.amount - p.feeAmount);
            if (p.feeAmount > 0) b.dr(await b.id("PAYMENT_FEE"), p.feeAmount, "ค่าธรรมเนียม");
            if (p.whtAmountSatang > 0)
              b.dr(await b.id("WHT_ASSET"), p.whtAmountSatang, "ภาษีถูกหัก ณ ที่จ่าย");
          }
        } else {
          // F-07: ขายสด default เข้าเงินสด (1000) — เลือกช่องทาง/บัญชีเงินอื่นได้ผ่าน payment ที่ผูกใบเสร็จ
          const cashId = await financeLedgerId(ctx, pays[0]?.financeAccountId, pays[0]?.channel ?? "CASH", db);
          b.dr(cashId, doc.grandTotal);
        }
        if (dep.base > 0) b.dr(await b.id("DEPOSIT_RECEIVED"), dep.base, "หักมัดจำ");
        await creditIncome(await b.id(incomeKey, doc.docType));
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
        b.dr(await b.id(incomeKey, doc.docType), afterDiscount);
        if (rate > 0) b.dr(await b.id("VAT_OUTPUT"), doc.vatAmount);
        b.cr(await b.id("AR"), doc.grandTotal);
        book = "SALES";
        opts = { book, journal: "DOC", date: doc.issueDate, refType: "AccountDocument", refId: docId, event, memo: "ใบลดหนี้" };
        break;
      }
      case "DEBIT_NOTE": {
        // Dr 1100 AR · Cr รายได้ + Cr 2200
        b.dr(await b.id("AR"), doc.grandTotal);
        await creditIncome(await b.id(incomeKey, doc.docType));
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
        // VAT ซื้อยังไม่ได้ใบกำกับ (vatPurchaseMode AWAITING → vatTiming ON_PAYMENT) → พักที่ 1155
        // แล้วโอนเข้า 1150 ตอนรับใบกำกับจริง (เคส PURCHASE_TAX_INVOICE ด้านล่าง)
        const vatInKey =
          doc.status === "AWAITING_RECEIVE" || (doc.taxPointBasis ?? doc.vatTiming) === "ON_PAYMENT"
            ? "VAT_INPUT_UNDUE"
            : "VAT_INPUT";
        const lines = await loadDocLines(ctx, docId, db);
        if (lines.length > 0) {
          // เดบิตต้นทุน/ค่าใช้จ่ายด้วย "ฐานสุทธิ" เสมอ — ตรงกับฝั่งขายที่ใช้ subTotal − discountAmount
          // โหมดราคารวม VAT: l.amount รวม VAT อยู่ → ถ้าเดบิตตรง ๆ Dr จะเกิน Cr เท่ากับ VAT (ออกเอกสารไม่ได้)
          // กระจาย doc.subTotal ตามน้ำหนักฐานสุทธิรายบรรทัด ⇒ Σ เดบิต = subTotal เป๊ะทุกโหมด
          const drs = splitByWeight(
            doc.subTotal,
            lines.map((l) => lineNetBase(l, rate, doc.vatMode)),
          );
          for (let i = 0; i < lines.length; i++)
            b.dr(lines[i].accountId ?? (await b.id(expKey, doc.docType)), drs[i]);
        } else {
          b.dr(await b.id(expKey, doc.docType), doc.subTotal);
        }
        if (doc.discountAmount > 0) b.cr(await b.id("DISCOUNT_RECEIVED"), doc.discountAmount, "ส่วนลดรับ");
        // WO 1.2 — หักเงินมัดจำจ่าย (DP): กระจกของฝั่งขาย (INVOICE Dr 2110 มัดจำรับ)
        //   grandTotal ที่เก็บไว้ = ยอดหลังหักมัดจำแล้ว ⇒ ต้อง Cr 1130 ด้วยฐานมัดจำ + ลด VAT ซื้อเท่าส่วน VAT ของมัดจำ
        //   (VAT ของมัดจำถูกเคลมไปแล้วตอนออกใบมัดจำ — เคลมซ้ำที่นี่ = ภาษีซื้อเกิน)
        if (rate > 0) b.dr(await b.id(vatInKey), doc.vatAmount - dep.vat);
        if (dep.base > 0) b.cr(await b.id("DEPOSIT_PAID"), dep.base, "หักมัดจำจ่าย");
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
        const cashId = await financeLedgerId(ctx, pay?.financeAccountId, pay?.channel, db, true);
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
      const cashId = await financeLedgerId(ctx, p.financeAccountId, p.channel, db, true);
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
    // 🔴 WO 9.2 ข้อ 19 — เขียน entryId กลับที่แถว payment (พบตอน audit 5.5: คอลัมน์นี้เป็น null
    //    ทุกแถวมาตลอด ทั้งที่ schema มีไว้ ⇒ ผู้อ่านทุกคนต้องไล่หา JV จาก refType/refId เอง
    //    เช่น payment-request.ts:612 ที่ต้องเขียนหมายเหตุกำกับไว้ว่า "อย่าใช้ entryId")
    //    เขียนเพิ่มอย่างเดียว (additive) — ไม่มีใครอ่านค่านี้อยู่ ⇒ ไม่กระทบพฤติกรรมเดิม
    //    ⚠️ ไม่ unique: ใบวางบิล/รวมจ่าย 1 entry ผูกได้หลาย payment (Gate B-M4)
    await db.accountDocumentPayment.update({ where: { id: paymentId }, data: { entryId: entry.id } });
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
      select: { id: true, vatAmount: true, vatTiming: true, taxPointBasis: true, issueDate: true, sourceDocId: true },
    });
    if (!doc) throw new Error("ไม่พบใบกำกับภาษี");
    if (doc.vatAmount <= 0) return { skipped: true }; // ไม่มี VAT ให้ย้าย

    // F-01: ใบกำกับที่ออกจากใบเสร็จขายสด/ใบรับมัดจำ → VAT ลง 2200 ไปแล้วตอนรับเงิน
    //        ไม่มีอะไรพักใน 2205/2210 → ห้ามย้ายซ้ำ (นับ VAT ขายเกิน)
    if (doc.sourceDocId) {
      const src = await db.accountDocument.findFirst({
        where: { id: doc.sourceDocId, systemId: ctx.systemId },
        select: { docType: true },
      });
      if (src && (src.docType === "RECEIPT" || src.docType === "DEPOSIT_RECEIPT"))
        return { skipped: true };
    }

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

/**
 * WO 1.5 — รายการ JV (พร้อมบรรทัด Dr/Cr + ชื่อบัญชี) ของ "เอกสารเดียว" (หน้าเอกสาร V2 แท็บ "บัญชี")
 * รวมทั้ง entry ที่ผูกกับตัวเอกสารเอง (AccountDocument) และ entry ของการชำระเงินแต่ละครั้ง
 * (AccountDocumentPayment) — ไม่กรอง status เพื่อให้เห็น entry ที่ถูกกลับรายการ (REVERSED) ด้วย
 */
export async function listJournalEntriesForDocument(
  systemId: string,
  docId: string,
  paymentIds: string[],
) {
  return prisma.accountJournalEntry.findMany({
    where: {
      systemId,
      OR: [
        { refType: "AccountDocument", refId: docId },
        { refType: "AccountDocumentPayment", refId: { in: paymentIds.length ? paymentIds : ["__none__"] } },
      ],
    },
    include: { lines: { include: { account: true }, orderBy: { id: "asc" } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
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
    // 🐞 WO 4.2 — **ห้ามกลับรายการของรายการที่เป็น "การกลับรายการ" อยู่แล้ว**
    //   entry ที่ reverseFor สร้างขึ้น ใช้ refType/refId เดียวกับต้นฉบับ และสถานะเป็น POSTED
    //   ⇒ ถ้าเรียก reverseFor ซ้ำ (event void ถูก drain 2 รอบ / retry หลัง webhook ล้ม / lease หมดอายุ)
    //     รอบที่สองจะไปกลับรายการ "ตัวกลับรายการ" = โพสต์รายได้กลับเข้ามาใหม่เงียบ ๆ (เจอจริงด้วยข้อสอบ PL6.9)
    //   ตัวกรอง `reversalOfId: null` ทำให้เรียกซ้ำกี่ครั้งก็ได้ผลเท่าเดิม (ต้นฉบับถูกกลับไปแล้ว = REVERSED)
    const entries = await db.accountJournalEntry.findMany({
      where: { systemId: ctx.systemId, refType, refId, status: "POSTED", reversalOfId: null },
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

// ─────────────────── reverseEntry (กลับ 1 entry ตาม id — WO Wave2-K) ───────────────────

/**
 * กลับรายการ JV entry เดียวตาม id (immutable — สร้าง entry ตรงข้าม + mark REVERSED)
 * ใช้เมื่อ caller ถือ entryId ตรง ๆ (เช่น HrPayrollRun.journalEntryId) แทนการค้นด้วย refType/refId
 * mirror logic ของ reverseFor: สลับ dr/cr · idempotencyKey ต่อ entry (กลับซ้ำไม่เบิ้ล) · งวดปิด→เลื่อนงวดเปิด
 * ⚠️ ไม่แตะ entry เดิม (immutable ledger) — trial balance คงสมดุล (reversal สลับ dr/cr = สมดุลในตัว)
 */
export async function reverseEntry(
  ctx: GlCtx,
  entryId: string,
  reason: string,
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true }> {
  return withTx(tx, async (db) => {
    const e = await db.accountJournalEntry.findFirst({
      where: { id: entryId, systemId: ctx.systemId },
      include: { lines: true },
    });
    if (!e) throw new Error("ไม่พบรายการบัญชีที่จะกลับ");

    const idempotencyKey = `${e.refType}#${e.refId}#REVERSAL:${e.id}`;
    const existing = await db.accountJournalEntry.findFirst({
      where: { systemId: ctx.systemId, idempotencyKey },
      select: { id: true },
    });
    if (existing) return { entryId: existing.id };
    // entry ถูกกลับไปแล้ว (มี reversal อื่นชี้มา) หรือไม่ได้อยู่สถานะ POSTED → ไม่กลับซ้ำ
    if (e.status !== "POSTED") {
      const rev = await db.accountJournalEntry.findFirst({
        where: { systemId: ctx.systemId, reversalOfId: e.id },
        select: { id: true },
      });
      return rev ? { entryId: rev.id } : { skipped: true };
    }

    // Gate C ledger-M10: ถ้างวดของ entry เดิมปิดแล้ว → reversal ลงงวดเปิดถัดไป
    const date = await resolveOpenDate(ctx, new Date(), db);
    const { periodKey } = bkkPeriod(date);
    await assertPeriodOpen(ctx, periodKey, db);
    const docNo = await nextJournalNo(ctx, e.book, date, db as Tx);

    const created = await db.accountJournalEntry.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        docNo,
        book: e.book, // เล่มเดิม
        journal: "REVERSAL",
        date,
        periodKey,
        refType: e.refType,
        refId: e.refId,
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
    return { entryId: created.id };
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

// ─────────────────── postInventoryGl (perpetual inventory — WO Inventory→Account) ───────────────────

/**
 * โพสต์ต้นทุนสต็อกอัตโนมัติจาก InvMovement (perpetual inventory)
 * caller = inventory (ผ่าน account facade เท่านั้น — chokepoint inventory→account · F2.2)
 * บรรทัดเดียวคู่ Dr/Cr เท่ากันเป๊ะ (สมดุลในตัว) · value = |qtyDelta| × costSatang (valuation source เดียว)
 * เลือกบัญชี Dr/Cr ตามชนิด movement (caller ส่ง code มาตรง ๆ — resolve by code เหมือน postPayrollJV)
 * idempotent ต่อ (InvMovement, movementId, event) → รับ/ตัดซ้ำ key เดิม ไม่โพสต์ GL เบิ้ล
 * ensureAccounting ก่อน (seed ผัง + งวดปัจจุบัน OPEN) — ถ้าไม่มีระบบ ACCOUNT caller ข้ามก่อนถึงตรงนี้
 */
export async function postInventoryGl(
  ctx: GlCtx,
  o: {
    movementId: string;
    event: "RECEIVE" | "CONSUME";
    date: Date;
    drCode: string;
    crCode: string;
    amountSatang: number;
    memo?: string;
  },
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true }> {
  return withTx(tx, async (db) => {
    if (o.amountSatang <= 0) return { skipped: true }; // มูลค่า 0 → ไม่มีอะไรให้ลง
    if (await alreadyPosted(ctx, `InvMovement#${o.movementId}#${o.event}`, db)) return { skipped: true };

    await ensureAccounting(ctx, db as Tx);
    const codes = [o.drCode, o.crCode];
    const ledgers = await db.accountLedger.findMany({
      where: { systemId: ctx.systemId, code: { in: codes } },
      select: { id: true, code: true },
    });
    const idByCode = new Map(ledgers.map((l) => [l.code, l.id]));
    const acctId = (code: string): string => {
      const id = idByCode.get(code);
      if (!id) throw new Error(`ไม่พบบัญชี ${code} ในผังบัญชี`);
      return id;
    };

    const b = new Book(ctx, db);
    b.dr(acctId(o.drCode), o.amountSatang);
    b.cr(acctId(o.crCode), o.amountSatang);

    const entry = await commitEntry(
      ctx,
      {
        book: "GENERAL",
        journal: "ADJUST",
        date: o.date,
        refType: "InvMovement",
        refId: o.movementId,
        event: o.event,
        memo: o.memo ?? "ต้นทุนสินค้าคงเหลือ (perpetual)",
      },
      b,
      db,
    );
    return { entryId: entry.id };
  });
}

// ─────────────────── postStockDocument (V2 · WO 4.3 §8.4) ───────────────────

/**
 * โพสต์บัญชีของเอกสารปรับปรุงสต็อก/ต้นทุน — ใบเบิก PRR · ใบส่งคืน RPR · ใบปรับต้นทุน CA
 *
 * ต่างจาก `postDocument` ตรงที่ยอดไม่ได้มาจาก subTotal/VAT ของเอกสาร แต่มาจาก **ต้นทุนจริง**
 * ที่โมดูลคลังคืนมาตอนตัด/คืนของ (`InvMovement.costSatang`) ⇒ ผู้เรียกส่ง `amountSatang` มาเอง
 *
 * บัญชี: ระบุเป็น "รหัสบัญชี" (`drCode`/`crCode`) ได้ตรง ๆ — ผู้ใช้เลือกบัญชี Dr เองในฟอร์ม (§8.4)
 *        ไม่ระบุ = ถอยไปใช้ mapping key (`drKey`/`crKey`) ตามปกติ
 * idempotent ต่อ (docId, event) · กลับรายการด้วย `reverseFor("AccountDocument", docId)` เหมือนเอกสารอื่น
 */
export async function postStockDocument(
  ctx: GlCtx,
  o: {
    docId: string;
    event: string; // "ISSUE" | "RETURN" | "COST_ADJUST" | "OPENING"
    date: Date;
    amountSatang: number; // > 0 เสมอ (ทิศทางกำหนดด้วย dr/cr)
    drCode?: string | null;
    crCode?: string | null;
    drKey?: string;
    crKey?: string;
    memo?: string;
    journal?: AccountJournalType;
  },
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true; reason: string }> {
  return withTx(tx, async (db) => {
    if (o.amountSatang <= 0) return { skipped: true, reason: "มูลค่า 0 — ไม่มีอะไรให้ลงบัญชี" };
    if (await alreadyPosted(ctx, `AccountDocument#${o.docId}#${o.event}`, db))
      return { skipped: true, reason: "โพสต์แล้ว (idempotent)" };

    await ensureAccounting(ctx, db as Tx);
    const b = new Book(ctx, db);
    const idOf = async (code: string | null | undefined, key: string): Promise<string> => {
      const c = (code ?? "").trim();
      if (c) {
        const led = await db.accountLedger.findFirst({
          where: { systemId: ctx.systemId, code: c, archivedAt: null },
          select: { id: true },
        });
        if (led) return led.id;
        // บัญชีที่ผู้ใช้เลือกหายไป (ถูกปิด/ลบ) — อย่าเงียบ ให้ลง key ปริยายแล้วตั้งธงให้คนมาตรวจ
        b.needsReview = true;
      }
      return b.id(key);
    };
    const drId = await idOf(o.drCode, o.drKey ?? "GOODS_ISSUE_EXPENSE");
    const crId = await idOf(o.crCode, o.crKey ?? "INVENTORY");
    b.dr(drId, o.amountSatang);
    b.cr(crId, o.amountSatang);

    const entry = await commitEntry(
      ctx,
      {
        book: "GENERAL",
        journal: o.journal ?? "ADJUST",
        date: o.date,
        refType: "AccountDocument",
        refId: o.docId,
        event: o.event,
        memo: o.memo ?? "ปรับปรุงสินค้าคงเหลือ",
      },
      b,
      db,
    );
    return { entryId: entry.id };
  });
}

// ─────────────────── postChequeEntry (ทะเบียนเช็ค — R-B/M7) ───────────────────

/**
 * โพสต์ entry ของทะเบียนเช็ค — refType="AccountCheque" refId=chequeId event=REGISTER/CLEAR/BOUNCE/VOID
 * idempotent ต่อ (chequeId, event) + reverseFor("AccountCheque", chequeId) ได้ (แทน postManualJV+randomUUID)
 * บรรทัด AR/AP ใส่ contactId → subledger รายคู่ค้าตรง (M8)
 */
export async function postChequeEntry(
  ctx: GlCtx,
  o: {
    chequeId: string;
    event: "REGISTER" | "CLEAR" | "BOUNCE" | "VOID";
    book: AccountJournalBook;
    date: Date;
    memo?: string;
    lines: { accountId: string; debit: number; credit: number; contactId?: string | null; note?: string }[];
  },
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true }> {
  return withTx(tx, async (db) => {
    if (await alreadyPosted(ctx, `AccountCheque#${o.chequeId}#${o.event}`, db)) return { skipped: true };
    const b = new Book(ctx, db);
    for (const l of o.lines) {
      if (l.debit > 0) b.dr(l.accountId, l.debit, l.note, l.contactId ?? undefined);
      if (l.credit > 0) b.cr(l.accountId, l.credit, l.note, l.contactId ?? undefined);
    }
    const entry = await commitEntry(
      ctx,
      { book: o.book, journal: "DOC", date: o.date, refType: "AccountCheque", refId: o.chequeId, event: o.event, memo: o.memo },
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

// ─────────────────── postFinanceOpening (WO 5.1 · §10.1 modal "ยอดยกมาหลายรายการ") ───────────────────

/**
 * ยอดยกมา "ต่อรายการ" ของช่องทางการเงิน (ต่างจาก `postOpening` ที่ idempotent ต่อ "งวดทั้งระบบ" —
 * ถ้าใช้ `postOpening` กับหลายช่องทาง/หลายรายการในเดือนเดียวกันจะชนกันเอง)
 * idempotent ต่อ (financeId, seq, version) — แก้ไขรายการ = caller ต้อง bump `version` เอง
 * แล้วเรียกด้วย version ใหม่ (ห้ามใช้ version เดิมซ้ำ เพราะ `alreadyPosted` เช็คแค่ "มีแถวไหม" ไม่สนสถานะ)
 * amountSatang บวก = เงินเข้าช่องทาง (Dr ช่องทาง / Cr 3999) · ติดลบ = ปรับลด (Dr 3999 / Cr ช่องทาง)
 */
export async function postFinanceOpening(
  ctx: GlCtx,
  o: {
    financeId: string;
    seq: number;
    version: number;
    accountId: string; // AccountFinance.ledgerAccountId
    date: Date;
    amountSatang: number;
    memo?: string;
  },
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true }> {
  return withTx(tx, async (db) => {
    if (o.amountSatang === 0) return { skipped: true };
    const refId = `${o.financeId}:${o.seq}:v${o.version}`;
    if (await alreadyPosted(ctx, `AccountFinanceOpening#${refId}#OPEN`, db)) return { skipped: true };

    await ensureAccounting(ctx, db as Tx);
    const b = new Book(ctx, db);
    const counterId = await b.id("OPENING_BALANCE");
    const amt = Math.abs(o.amountSatang);
    if (o.amountSatang > 0) {
      b.dr(o.accountId, amt, "ยอดยกมา");
      b.cr(counterId, amt, "บัญชีคู่เปิดบัญชี");
    } else {
      b.cr(o.accountId, amt, "ยอดยกมา (ปรับลด)");
      b.dr(counterId, amt, "บัญชีคู่เปิดบัญชี");
    }

    const entry = await commitEntry(
      ctx,
      {
        book: "GENERAL",
        journal: "OPENING",
        date: o.date,
        refType: "AccountFinanceOpening",
        refId,
        event: "OPEN",
        memo: o.memo ?? "ยอดยกมาช่องทางการเงิน",
      },
      b,
      db,
    );
    return { entryId: entry.id };
  });
}

// ─────────────────── postFinanceTransfer (WO 5.1 · §10.1 เมนู ⋮ "โอน") ───────────────────

/**
 * โอนเงินระหว่างช่องทาง — idempotent ต่อ transferId ที่ caller เป็นคนกำหนด (กันโพสต์ JV ซ้ำเมื่อ
 * request ซ้ำ — ต่างจาก `postManualJV` เดิมที่สุ่ม refId ใหม่ทุกครั้ง)
 * Dr ปลายทาง / Cr ต้นทาง เสมอ (amountSatang > 0)
 */
export async function postFinanceTransfer(
  ctx: GlCtx,
  o: {
    transferId: string;
    fromLedgerId: string;
    toLedgerId: string;
    amountSatang: number;
    date: Date;
    memo?: string;
  },
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true }> {
  return withTx(tx, async (db) => {
    if (o.amountSatang <= 0) return { skipped: true };
    if (await alreadyPosted(ctx, `AccountFinanceTransfer#${o.transferId}#TRANSFER`, db)) return { skipped: true };

    await ensureAccounting(ctx, db as Tx);
    const b = new Book(ctx, db);
    b.dr(o.toLedgerId, o.amountSatang, "โอนเข้า");
    b.cr(o.fromLedgerId, o.amountSatang, "โอนออก");

    const entry = await commitEntry(
      ctx,
      {
        book: "GENERAL",
        journal: "ADJUST",
        date: o.date,
        refType: "AccountFinanceTransfer",
        refId: o.transferId,
        event: "TRANSFER",
        memo: o.memo ?? "โอนระหว่างช่องทางการเงิน",
        source: "MANUAL",
      },
      b,
      db,
    );
    return { entryId: entry.id };
  });
}

/**
 * V2 (WO 5.3 · §10.2 · g10) — "สร้างรายการจากแถว statement" (ค่าธรรมเนียมธนาคาร / ดอกเบี้ยรับ / อื่น ๆ)
 * ค่าธรรมเนียม (เงินออก): Dr ค่าธรรมเนียมธนาคาร (6510) / Cr บัญชีเงินของช่องทาง
 * ดอกเบี้ยรับ (เงินเข้า): Dr บัญชีเงินของช่องทาง / Cr ดอกเบี้ยรับ (4910)
 * idempotent ต่อ "แถว statement" — กดซ้ำ/retry ไม่โพสต์ JV เบิ้ล (key = AccountBankStatementLine#<id>#RECONCILE)
 * caller = reconcile.ts เท่านั้น (ห้ามโพสต์เองนอก gl.ts — กติกาเจ้าของไฟล์)
 */
export async function postBankReconcileEntry(
  ctx: GlCtx,
  o: {
    statementLineId: string;
    /** บัญชี GL ของช่องทางการเงิน (AccountFinance.ledgerAccountId) */
    financeLedgerId: string;
    /** บัญชีคู่ (6510 ค่าธรรมเนียม · 4910 ดอกเบี้ยรับ · หรือบัญชีที่ผู้ใช้เลือก) */
    counterLedgerId: string;
    /** + = เงินเข้าช่องทาง (Dr เงิน) · − = เงินออกจากช่องทาง (Cr เงิน) */
    amountSatang: number;
    date: Date;
    memo?: string;
    note?: string;
    postedById?: string;
  },
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true }> {
  return withTx(tx, async (db) => {
    const amount = Math.abs(Math.round(o.amountSatang));
    if (amount === 0) return { skipped: true };
    if (o.financeLedgerId === o.counterLedgerId) throw new Error("บัญชีคู่ต้องไม่ใช่บัญชีเงินของช่องทางเดียวกัน");
    const event = "RECONCILE";
    if (await alreadyPosted(ctx, `AccountBankStatementLine#${o.statementLineId}#${event}`, db)) return { skipped: true };

    await ensureAccounting(ctx, db as Tx);
    const b = new Book(ctx, db);
    if (o.amountSatang > 0) {
      b.dr(o.financeLedgerId, amount, o.note);
      b.cr(o.counterLedgerId, amount, o.note);
    } else {
      b.dr(o.counterLedgerId, amount, o.note);
      b.cr(o.financeLedgerId, amount, o.note);
    }

    const entry = await commitEntry(
      ctx,
      {
        book: "GENERAL",
        journal: "ADJUST",
        date: o.date,
        refType: "AccountBankStatementLine",
        refId: o.statementLineId,
        event,
        memo: o.memo ?? "รายการจากรายการเดินบัญชีธนาคาร",
        source: "MANUAL",
        postedById: o.postedById,
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
  /** ผู้ปิดงวด · `null` = ไม่ใช่คน (คีย์ API ปิดผ่าน REST — ตัวจริงอยู่ใน AuditLog) */
  userId: string | null,
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
  /** ผู้เปิดงวด · `null` = คีย์ API (บันทึกลง reopenLog ตามจริง — ผู้ลงมือจริงอยู่ใน AuditLog) */
  userId: string | null,
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

// ─────────────────── postExternalSale (ขายสดจากระบบภายนอก เช่น POS — WO-0002) ───────────────────

/**
 * โพสต์ยอดขายสดจากระบบต้นทางภายนอก (POS) → journal เดียว
 * Dr ราย drLine: CASH→1000 · BANK→1010 · DEPOSIT_RECEIVED→2110 (ใช้มัดจำรับ) · AR→1100 (ลงบิลลูกหนี้) · Cr 4000 (ฐานหลังถอด VAT) · Cr 2200 (VAT ถ้ามี)
 * ขายสด tax point ทันที (ไม่พัก 2205) — เหมือน RECEIPT
 * idempotent ต่อ (PosSale, refId, PAID) — drain/emit ซ้ำไม่เบิ้ล
 * ⚠️ facade (account/index) เป็นผู้คิดฐาน/VAT + สร้าง drLine แล้วส่งมา — โมดูลอื่นไม่รู้เลขบัญชี
 */
export async function postExternalSale(
  ctx: GlCtx,
  o: {
    refId: string;
    date: Date;
    baseSatang: number;
    vatSatang: number;
    /**
     * ส่วนของฐานที่เป็น "รายได้ค่าบริการ" (4030) — ที่เหลือเข้ารายได้ขายสินค้า (4000)
     * ไม่ระบุ = เข้ารายได้ขายสินค้าทั้งก้อน (พฤติกรรมเดิมของผู้เรียกที่ยังไม่ได้แยก)
     * ทำไมต้องแยก: ร้านบริการ (ตัดผม/นวด/คลินิก) ถ้าลงรวมเป็น "ขายสินค้า" งบกำไรขาดทุนผิดหมวด
     * และแยกยื่นภาษีไม่ได้ — ผังบัญชีมี 4030 อยู่แล้วแต่ POS ไม่เคยใช้
     */
    serviceBaseSatang?: number;
    drLines: { key: "CASH" | "BANK" | "DEPOSIT_RECEIVED" | "AR"; amountSatang: number }[];
  },
  tx?: Tx,
): Promise<{ entryId: string } | { skipped: true }> {
  return withTx(tx, async (db) => {
    const event = "PAID";
    if (await alreadyPosted(ctx, `PosSale#${o.refId}#${event}`, db)) return { skipped: true };

    const b = new Book(ctx, db);
    for (const l of o.drLines) b.dr(await b.id(l.key), l.amountSatang);
    // แยกรายได้ 2 หมวดตามสัดส่วนจริงของบิล — ปัดให้สองก้อนรวมกันเท่า baseSatang เป๊ะ (งบต้องบาลานซ์)
    const svcBase = Math.min(Math.max(0, Math.round(o.serviceBaseSatang ?? 0)), o.baseSatang);
    const goodsBase = o.baseSatang - svcBase;
    if (goodsBase > 0) b.cr(await b.id("INCOME_GOODS"), goodsBase);
    if (svcBase > 0) b.cr(await b.id("INCOME_SERVICE"), svcBase);
    if (o.vatSatang > 0) b.cr(await b.id("VAT_OUTPUT"), o.vatSatang);

    const entry = await commitEntry(
      ctx,
      {
        book: "SALES",
        journal: "DOC",
        date: o.date,
        refType: "PosSale",
        refId: o.refId,
        event,
        memo: "ขายสด POS",
      },
      b,
      db,
    );
    return { entryId: entry.id };
  });
}


// ── Payroll posting (WO-0036) — facade ให้โมดูล hr เรียกผ่าน account/index เท่านั้น ──
// mapping ผังบัญชี (เหตุผลเพื่อ auditor):
//   6000 เงินเดือนและค่าแรง (EXPENSE) → Dr gross + Dr ปสส.นายจ้าง (ต้นทุนบุคลากร แยกบรรทัด)
//   1010 เงินฝากธนาคาร → Cr เงินเดือนสุทธิ · 2100 เจ้าหนี้ → Cr ปสส.ค้างนำส่ง (⚠️ ควรเพิ่ม 2140 เฉพาะในอนาคต)
//   2130 ภาษีหัก ณ ที่จ่ายค้างนำส่ง → Cr ภงด.1
// สมดุล: net = gross − ssoEmployee − wht → สองฝั่ง = gross + ssoEmployer
export type PayrollPostingInput = {
  payDate: Date;
  periodKey: string;
  grossSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
  whtSatang: number;
  netSatang: number;
};

export async function postPayrollJV(
  ctx: GlCtx,
  input: PayrollPostingInput,
  tx?: Tx,
): Promise<{ entryId: string }> {
  return withTx(tx, async (db) => {
    await ensureAccounting(ctx, db as Tx);
    const codes = ["6000", "1010", "2100", "2130"];
    const ledgers = await db.accountLedger.findMany({
      where: { systemId: ctx.systemId, code: { in: codes } },
      select: { id: true, code: true },
    });
    const idByCode = new Map(ledgers.map((l) => [l.code, l.id]));
    const acctId = (code: string): string => {
      const id = idByCode.get(code);
      if (!id) throw new Error(`ไม่พบบัญชี ${code} ในผังบัญชี`);
      return id;
    };
    const ssoPayable = input.ssoEmployeeSatang + input.ssoEmployerSatang;
    return postManualJV(
      ctx,
      {
        date: input.payDate,
        book: "PAYMENTS",
        memo: `เงินเดือนงวด ${input.periodKey}`,
        lines: [
          { accountId: acctId("6000"), debit: input.grossSatang, credit: 0, note: "เงินเดือน" },
          { accountId: acctId("6000"), debit: input.ssoEmployerSatang, credit: 0, note: "เงินสมทบประกันสังคม (นายจ้าง)" },
          { accountId: acctId("1010"), debit: 0, credit: input.netSatang, note: "เงินเดือนสุทธิ (จ่ายผ่านธนาคาร)" },
          { accountId: acctId("2100"), debit: 0, credit: ssoPayable, note: "ประกันสังคมค้างนำส่ง (ลูกจ้าง+นายจ้าง)" },
          { accountId: acctId("2130"), debit: 0, credit: input.whtSatang, note: "ภาษีหัก ณ ที่จ่ายค้างนำส่ง (ภงด.1)" },
        ],
      },
      db as Tx,
    );
  });
}
