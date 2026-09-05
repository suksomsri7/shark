// journal-v2.ts — สมุดรายวัน V2 (WO 6.2 · DESIGN-SPEC-V2 §11.2 · เฟรม g16-journal.png)
//
// ของเดิมที่ "ห้ามเขียนใหม่" และไฟล์นี้แค่ห่อ:
//   gl.postManualJV  — validate Σdebit = Σcredit + ≥2 บรรทัด + งวดเปิด + เลขรัน + idempotencyKey
//   gl.reverseEntry  — กลับรายการ (immutable · ซ้ำไม่เบิ้ล · งวดปิดเลื่อนไปงวดเปิดถัดไป)
// ที่เพิ่มในนี้: query ฝั่ง server ของหน้ารายการ (แท็บ/ตัวกรอง/ค้นหา/หน้า) + ธง ⚑ ต้องตรวจ
//
// 🔴 ใช้ `tenantDb(ctx)` ไม่ใช่ `prisma` ตรง ๆ — fitness F5.1 นับไฟล์ในโมดูลที่ import prisma (baseline 45 · ratchet ลงอย่างเดียว)

import { tenantDb } from "@/lib/core/db";
import type { AccountJournalBook, AccountLedgerType, Prisma } from "@prisma/client";
import { ledgerRunning, type LedgerRunningRow } from "./coa";
import { postManualJV, reverseEntry } from "./gl";
import { checkNotLocked } from "./policy"; // §9.3 ล็อกข้อมูลก่อนวันที่
import { safeReason } from "./errors";

export type JournalCtx = { tenantId: string; systemId: string };
import { clampSearch } from "./search-input";

// ─────────────────── ป้ายไทย (แหล่งเดียว — UI + ข้อสอบใช้ตัวนี้) ───────────────────

/** แท็บตาม `book` ตาม §11.2 / g16: ทั้งหมด · ซื้อ · ขาย · จ่าย · รับ · ทั่วไป (ลำดับตามเฟรม) */
export const JOURNAL_TABS = [
  { key: "ALL", label: "ทั้งหมด", book: null },
  { key: "PURCHASES", label: "ซื้อ", book: "PURCHASES" },
  { key: "SALES", label: "ขาย", book: "SALES" },
  { key: "PAYMENTS", label: "จ่าย", book: "PAYMENTS" },
  { key: "RECEIPTS", label: "รับ", book: "RECEIPTS" },
  { key: "GENERAL", label: "ทั่วไป", book: "GENERAL" },
] as const satisfies readonly { key: string; label: string; book: AccountJournalBook | null }[];

export type JournalTabKey = (typeof JOURNAL_TABS)[number]["key"];

export const BOOK_LABEL: Record<AccountJournalBook, string> = {
  SALES: "ขาย",
  PURCHASES: "ซื้อ",
  RECEIPTS: "รับ",
  PAYMENTS: "จ่าย",
  GENERAL: "ทั่วไป",
};

export const JOURNAL_TYPE_LABEL: Record<string, string> = {
  DOC: "เอกสาร",
  PAYMENT: "ชำระเงิน",
  ADJUST: "ปรับปรุง",
  REVERSAL: "กลับรายการ",
  DEPRECIATION: "ค่าเสื่อม",
  OPENING: "ยอดยกมา",
};

/** แปลง key ของแท็บ → book (null = ทุกเล่ม) · ค่าที่ไม่รู้จัก = ทุกเล่ม (กัน query string มั่ว) */
export function bookOfTab(tab: string | undefined): AccountJournalBook | null {
  const t = JOURNAL_TABS.find((x) => x.key === tab);
  return (t?.book ?? null) as AccountJournalBook | null;
}

export const JOURNAL_PAGE_SIZE = 20;

// ─────────────────── ป้ายชื่อ "อ้างอิงเอกสาร" (คอลัมน์ที่ 5 ของ g16) ───────────────────

/** refType ที่ลิงก์ออกไปหน้าเอกสารได้จริง → path segment ของหน้ารายละเอียด */
export type JournalRefLink = { label: string; href: string | null };

// ─────────────────── 1) หน้ารายการ (server-side ทั้งหมด) ───────────────────

export type JournalListRow = {
  id: string;
  docNo: string;
  date: Date;
  /** WO B4 additive — งวดบัญชีที่ใบนี้ถูกบันทึกจริง ("YYYY-MM") · ไม่ใช่เดือนของ `date` เสมอไป */
  periodKey: string;
  book: AccountJournalBook;
  bookLabel: string;
  journal: string;
  memo: string | null;
  status: "POSTED" | "REVERSED";
  needsReview: boolean;
  flagNote: string | null;
  source: "AUTO" | "MANUAL";
  /** ผู้บันทึก — ชื่อผู้ใช้ · null = ระบบลงให้ (แสดง "ระบบ") */
  postedByName: string | null;
  /** WO B4 additive — id ของผู้บันทึก (REST ส่ง `createdBy{id,name}`) */
  postedById: string | null;
  /** อ้างอิงเอกสาร: ป้าย + ลิงก์ (null = ไม่มีปลายทางให้คลิก) */
  ref: JournalRefLink | null;
  // ── WO B4 (REST) additive: อ้างอิงแบบ "ข้อมูลดิบ" — หน้าจอใช้ `ref` (มี href) · API ใช้ 3 ช่องนี้
  //    (ห้ามส่ง href ออก API — เป็น path ของหน้าจอเรา ไม่ใช่ทรัพยากรของผู้เรียก)
  refType: string | null;
  refId: string | null;
  /** เลขที่เอกสารต้นทาง (เฉพาะ refType = AccountDocument) */
  refDocNo: string | null;
  /** ใบนี้ถูกกลับรายการไปแล้ว */
  reversed: boolean;
  /** ใบนี้เป็น "ขากลับ" ของใบอื่น */
  isReversal: boolean;
  totalDebit: number;
  totalCredit: number;
  lines: JournalLineRow[];
};

export type JournalLineRow = {
  id: string;
  /** WO B4 additive — REST ส่ง `account{id,code,name}` (หน้าจอใช้แค่ code/name) */
  accountId: string;
  code: string;
  name: string;
  note: string | null;
  contactName: string | null;
  debit: number;
  credit: number;
  /** บัญชีพัก 9999 — ตาราง g16 ติด ⚠ ท้ายชื่อบัญชี */
  suspense: boolean;
};

export type JournalListResult = {
  rows: JournalListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** ตัวนับต่อแท็บ (ภายใต้ตัวกรองวันที่/ค้นหา/⚑ เดียวกัน — แต่ไม่รวมตัวกรอง book) */
  tabCounts: Record<string, number>;
  /** แถวสรุปท้ายตาราง (ทั้งชุดผลลัพธ์ ไม่ใช่แค่หน้านี้) */
  sumDebit: number;
  sumCredit: number;
};

export type JournalListInput = {
  book?: string;
  /** วันที่เริ่ม (YYYY-MM-DD เวลาไทย) */
  from?: string;
  /** วันที่สิ้นสุด (YYYY-MM-DD เวลาไทย · รวมทั้งวัน) */
  to?: string;
  /** ค้นหาเลขที่ JV / คำอธิบาย */
  q?: string;
  /** true = เฉพาะรายการที่ติดธง ⚑ ต้องตรวจ */
  needsReview?: boolean;
  page?: number;
  pageSize?: number;
};

const TZ = "Asia/Bangkok";

/** "YYYY-MM-DD" (เวลาไทย) → Date ที่เที่ยงคืนของวันนั้นตามเวลาไทย */
export function bkkDayStart(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, -7, 0, 0));
}
/** ขอบบนแบบ exclusive: เที่ยงคืนของวันถัดไป (ใช้ `date < cutoff` — รายการทั้งวันสุดท้ายต้องนับครบ) */
export function bkkDayEndExclusive(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, -7, 0, 0));
}
// ── ช่วงวันที่แบบสำเร็จรูป (g16: "ช่วงวันที่: เดือนนี้ ▾") ────────────────────────────
// 🔴 ทุกตัวเป็น **ช่วงเต็มงวด** (1 → วันสุดท้ายของงวด) ไม่ใช่ "ถึงวันนี้" — สมุดรายวันเป็นรายการตามวันที่เอกสาร
//    ถ้าตัดที่ "วันนี้" ใบที่ลงวันที่ล่วงหน้าในเดือนเดียวกันจะหายไปเงียบ ๆ (ตัวนับแท็บก็เพี้ยนตาม)
// 🔴 คิดจากสตริงปฏิทินไทย (`en-CA` + TZ) ล้วน — ห้ามใช้ getMonth()/getDay() ของ Date ตรง ๆ (กับดักวันไทยบน UTC)
export const JOURNAL_RANGE_PRESETS = [
  { key: "this_month", label: "เดือนนี้" },
  { key: "last_month", label: "เดือนก่อน" },
  { key: "this_quarter", label: "ไตรมาสนี้" },
  { key: "this_year", label: "ปีนี้" },
] as const;

export type JournalRangeKey = (typeof JOURNAL_RANGE_PRESETS)[number]["key"];

const pad2 = (n: number) => String(n).padStart(2, "0");
/** วันสุดท้ายของเดือน (m = 1–12) — `Date.UTC(y, m, 0)` = "วันที่ 0 ของเดือนถัดไป" = วันสุดท้ายของเดือน m */
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function journalRangeOf(key: JournalRangeKey, now: Date): { from: string; to: string } {
  const today = now.toLocaleDateString("en-CA", { timeZone: TZ }); // yyyy-mm-dd ตามเวลาไทย
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const span = (y1: number, m1: number, y2: number, m2: number) => ({
    from: `${y1}-${pad2(m1)}-01`,
    to: `${y2}-${pad2(m2)}-${pad2(lastDayOfMonth(y2, m2))}`,
  });
  switch (key) {
    case "last_month": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return span(py, pm, py, pm);
    }
    case "this_quarter": {
      const q1 = Math.floor((m - 1) / 3) * 3 + 1;
      return span(y, q1, y, q1 + 2);
    }
    case "this_year":
      return span(y, 1, y, 12);
    default:
      return span(y, m, y, m);
  }
}

/** ช่วง from/to ที่ได้มา ตรงกับ preset ตัวไหน — ไม่ตรงสักตัว = "custom" (โชว์ช่องวันที่ 2 ช่อง) */
export function journalRangeKeyOf(from: string, to: string, now: Date): JournalRangeKey | "custom" {
  for (const p of JOURNAL_RANGE_PRESETS) {
    const r = journalRangeOf(p.key, now);
    if (r.from === from && r.to === to) return p.key;
  }
  return "custom";
}

function whereOf(ctx: JournalCtx, input: JournalListInput, withBook: boolean): Prisma.AccountJournalEntryWhereInput {
  const book = withBook ? bookOfTab(input.book) : null;
  const q = clampSearch(input.q);
  return {
    systemId: ctx.systemId,
    ...(book ? { book } : {}),
    ...(input.needsReview ? { needsReview: true } : {}),
    ...(input.from || input.to
      ? {
          date: {
            ...(input.from ? { gte: bkkDayStart(input.from) } : {}),
            ...(input.to ? { lt: bkkDayEndExclusive(input.to) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { docNo: { contains: q, mode: "insensitive" as const } },
            { memo: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

/**
 * รายการสมุดรายวันแบบแบ่งหน้า — กรอง/เรียง/นับ **ฝั่ง server ทั้งหมด** (ห้าม take 500 มากรองในหน้า)
 * รวมทุกสถานะ (POSTED + REVERSED) เหมือน reports.ts — ใบที่ถูกกลับรายการยังต้องเห็นคู่กับขากลับ
 */
export async function listJournalPaged(ctx: JournalCtx, input: JournalListInput = {}): Promise<JournalListResult> {
  const db = tenantDb(ctx);
  const pageSize = Math.min(Math.max(1, input.pageSize ?? JOURNAL_PAGE_SIZE), 200);
  const page = Math.max(1, input.page ?? 1);
  const where = whereOf(ctx, input, true);
  const whereNoBook = whereOf(ctx, input, false);

  // 🔴 WO 9.3 (งบ query): เดิมมี `count({ where })` อีก 1 คำสั่ง — แต่ groupBy ด้านล่างนับ "ต่อเล่ม"
  //    ภายใต้ตัวกรองชุดเดียวกัน (ต่างแค่ไม่ใส่ book) และ `book` เป็นคอลัมน์บังคับ (ไม่มี null)
  //    ⇒ total = ยอดของเล่มที่กรอง (หรือผลรวมทุกเล่มเมื่อดูแท็บ "ทั้งหมด") หาได้จาก groupBy ตรง ๆ
  const [grouped, entries, sums] = await Promise.all([
    db.accountJournalEntry.groupBy({ by: ["book"], where: whereNoBook, _count: { _all: true } }),
    db.accountJournalEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        docNo: true,
        date: true,
        periodKey: true,
        book: true,
        journal: true,
        memo: true,
        status: true,
        needsReview: true,
        flagNote: true,
        source: true,
        postedById: true,
        refType: true,
        refId: true,
        reversalOfId: true,
        reversedBy: { select: { id: true } },
        lines: {
          select: {
            id: true,
            debit: true,
            credit: true,
            note: true,
            contactId: true,
            accountId: true,
            account: { select: { code: true, name: true } },
          },
        },
      },
    }),
    db.accountJournalLine.aggregate({ where: { systemId: ctx.systemId, entry: where }, _sum: { debit: true, credit: true } }),
  ]);

  const tabCounts: Record<string, number> = { ALL: 0 };
  for (const g of grouped) {
    tabCounts[g.book] = g._count._all;
    tabCounts.ALL += g._count._all;
  }
  for (const t of JOURNAL_TABS) tabCounts[t.key] ??= 0;
  const bookFilter = bookOfTab(input.book);
  const total = bookFilter ? (tabCounts[bookFilter] ?? 0) : tabCounts.ALL;

  // ป้าย/ลิงก์ของคอลัมน์ "อ้างอิงเอกสาร" + ชื่อผู้บันทึก + ชื่อผู้ติดต่อ — โหลดเป็นชุด (กัน N+1)
  const docIds = entries.filter((e) => e.refType === "AccountDocument" && e.refId).map((e) => e.refId!);
  const userIds = [...new Set(entries.map((e) => e.postedById).filter((x): x is string => !!x))];
  const contactIds = [
    ...new Set(entries.flatMap((e) => e.lines.map((l) => l.contactId)).filter((x): x is string => !!x)),
  ];
  // 🔴 WO 9.3: **คงด่าน `ids.length ?` ไว้ตามเดิม** — ข้ามคิวรีเมื่อไม่มี id ให้หา คือของดีต่อประสิทธิภาพ
  //    (เคยมีรอบหนึ่งที่แก้ให้ "ยิงเสมอด้วย id ปลอม" เพื่อให้ตัวนับของด่าน N+1 เท่ากันเป๊ะ — นั่นคือการ
  //    ทำให้ของจริงแย่ลงเพื่อเอาใจข้อสอบ ⇒ แก้ที่ข้อสอบแทน: `qc-acc-v2-perf` P3 เทียบ pageSize 50 กับ 100
  //    ซึ่งชุด id ไม่ว่างทั้งคู่ ⇒ จับ "คิวรีต่อแถว" ได้จริงโดยไม่ลงโทษด่านที่ข้ามคิวรีเปล่า)
  const [docs, users, contacts] = await Promise.all([
    docIds.length
      ? db.accountDocument.findMany({ where: { id: { in: docIds } }, select: { id: true, docNo: true, docType: true } })
      : Promise.resolve([]),
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    contactIds.length
      ? db.accountContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const docById = new Map(docs.map((d) => [d.id, d]));
  const userById = new Map(users.map((u) => [u.id, u.name]));
  const contactById = new Map(contacts.map((c) => [c.id, c.name]));

  const rows: JournalListRow[] = entries.map((e) => {
    const doc = e.refId ? docById.get(e.refId) : undefined;
    const ref: JournalRefLink | null = doc
      ? { label: doc.docNo ?? "(ยังไม่มีเลขที่)", href: `docs/${doc.docType}/${doc.id}` }
      : e.refType === "PosSale" && e.refId
        ? { label: `PosSale-${e.refId.slice(-8)}`, href: null }
        : null;
    return {
      id: e.id,
      docNo: e.docNo,
      date: e.date,
      periodKey: e.periodKey,
      book: e.book,
      bookLabel: BOOK_LABEL[e.book],
      journal: e.journal,
      memo: e.memo,
      status: e.status,
      needsReview: e.needsReview,
      flagNote: e.flagNote,
      source: e.source,
      postedByName: e.postedById ? (userById.get(e.postedById) ?? null) : null,
      postedById: e.postedById,
      ref,
      refType: e.refType,
      refId: e.refId,
      refDocNo: doc?.docNo ?? null,
      reversed: !!e.reversedBy,
      isReversal: !!e.reversalOfId,
      totalDebit: e.lines.reduce((s, l) => s + l.debit, 0),
      totalCredit: e.lines.reduce((s, l) => s + l.credit, 0),
      lines: e.lines.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        code: l.account.code,
        name: l.account.name,
        note: l.note,
        contactName: l.contactId ? (contactById.get(l.contactId) ?? null) : null,
        debit: l.debit,
        credit: l.credit,
        suspense: l.account.code === "9999",
      })),
    };
  });

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    tabCounts,
    sumDebit: sums._sum.debit ?? 0,
    sumCredit: sums._sum.credit ?? 0,
  };
}

// ─────────────────── 2) JV มือ (modal g16-journal-modal.png) ───────────────────

export type ManualJvLineInput = {
  accountId: string;
  /** สตางค์ (จำนวนเต็ม) */
  debit: number;
  credit: number;
  contactId?: string | null;
  note?: string | null;
};

export type ManualJvInput = {
  /** "YYYY-MM-DD" เวลาไทย */
  dateKey: string;
  book?: AccountJournalBook;
  memo?: string | null;
  lines: ManualJvLineInput[];
  postedById?: string;
  /** ไฟล์แนบที่อัปโหลดไว้แล้ว (AccountAttachment.id) — ผูกเข้ากับ JV หลังสร้างสำเร็จ */
  attachmentIds?: string[];
};

export type ManualJvResult = { ok: true; entryId: string; docNo: string } | { ok: false; reason: string };

/** ผลรวมเดบิต/เครดิตของบรรทัดที่ "มีค่า" — ใช้ทั้งฝั่ง client (แถบสมดุล) และฝั่ง server */
export function jvTotals(lines: ManualJvLineInput[]): { debit: number; credit: number; balanced: boolean } {
  const used = lines.filter((l) => (l.debit || 0) !== 0 || (l.credit || 0) !== 0);
  const debit = used.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = used.reduce((s, l) => s + (l.credit || 0), 0);
  return { debit, credit, balanced: debit === credit && debit > 0 && used.length >= 2 };
}

/** ตรวจอินพุตแบบไม่แตะ DB (ใช้ซ้ำได้ทั้ง client และข้อสอบ) — คืนข้อความไทยข้อแรกที่ผิด · null = ผ่าน */
export function validateManualJv(input: ManualJvInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey ?? "")) return "กรุณาระบุวันที่ให้ถูกต้อง";
  const used = input.lines.filter((l) => l.accountId && ((l.debit || 0) !== 0 || (l.credit || 0) !== 0));
  if (used.length < 2) return "ต้องมีบรรทัดรายการอย่างน้อย 2 บรรทัด";
  for (const l of used) {
    if (!l.accountId) return "ทุกบรรทัดต้องเลือกบัญชี";
    if ((l.debit || 0) < 0 || (l.credit || 0) < 0) return "จำนวนเงินติดลบไม่ได้";
    if ((l.debit || 0) > 0 && (l.credit || 0) > 0) return "บรรทัดเดียวลงทั้งเดบิตและเครดิตไม่ได้";
  }
  const t = jvTotals(used);
  if (t.debit !== t.credit) return "ยังไม่สมดุล — เดบิตรวมต้องเท่ากับเครดิตรวม";
  if (t.debit === 0) return "จำนวนเงินต้องมากกว่า 0";
  return null;
}

/**
 * สร้าง JV ด้วยมือ — ห่อ `gl.postManualJV` (ตัวนั้นเป็นคนตัดสินสมดุล/งวดปิด/เลขรัน)
 * เพิ่มด่านที่ gl ไม่รู้: บัญชีต้องอยู่ในร้านนี้ · ยังไม่ถูกปิดใช้งาน · ผู้ติดต่อต้องอยู่ในร้านนี้ (กัน IDOR)
 * คืน `{ok:false, reason}` เป็นภาษาไทยแทนการโยน — หน้าเรียกเอาไปแสดงในกล่องเดิมได้เลย
 */
export async function createManualEntry(ctx: JournalCtx, input: ManualJvInput): Promise<ManualJvResult> {
  const invalid = validateManualJv(input);
  if (invalid) return { ok: false, reason: invalid };

  const db = tenantDb(ctx);
  // §9.3 ล็อกข้อมูลก่อนวันที่ — ตรวจก่อนทำอย่างอื่น (ด่านจริงอยู่ที่ gl.commitEntry แต่ตรงนี้ตอบเร็วกว่า
  // และได้ข้อความเดียวกันเป๊ะ เพราะใช้ฟังก์ชันเดียวกัน)
  const lockCheck = await checkNotLocked(ctx, input.dateKey);
  if (!lockCheck.ok) return lockCheck;
  const used = input.lines.filter((l) => l.accountId && ((l.debit || 0) !== 0 || (l.credit || 0) !== 0));

  const accountIds = [...new Set(used.map((l) => l.accountId))];
  const accounts = await db.accountLedger.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, code: true, name: true, archivedAt: true },
  });
  if (accounts.length !== accountIds.length) return { ok: false, reason: "มีบรรทัดที่เลือกบัญชีนอกผังบัญชีของร้านนี้" };
  const archived = accounts.find((a) => a.archivedAt);
  if (archived) return { ok: false, reason: `บัญชี ${archived.code} ${archived.name} ถูกปิดใช้งานแล้ว` };

  const contactIds = [...new Set(used.map((l) => l.contactId).filter((x): x is string => !!x))];
  if (contactIds.length) {
    const n = await db.accountContact.count({ where: { id: { in: contactIds } } });
    if (n !== contactIds.length) return { ok: false, reason: "มีบรรทัดที่เลือกผู้ติดต่อนอกร้านนี้" };
  }

  // เที่ยงวันเวลาไทย — กันวันเหลื่อมตอนแปลง TZ (แบบเดียวกับ gl.firstDayNextMonth)
  const [y, m, d] = input.dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 5, 0, 0));

  let entryId: string;
  try {
    const r = await postManualJV(ctx, {
      date,
      memo: input.memo?.trim() || undefined,
      book: input.book ?? "GENERAL",
      postedById: input.postedById,
      lines: used.map((l) => ({
        accountId: l.accountId,
        debit: l.debit || 0,
        credit: l.credit || 0,
        contactId: l.contactId ?? undefined,
        note: l.note?.trim() || undefined,
      })),
    });
    entryId = r.entryId;
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกสมุดรายวันไม่สำเร็จ") };
  }

  if (input.attachmentIds?.length) {
    await db.accountAttachment.updateMany({
      where: { id: { in: input.attachmentIds } },
      data: { refType: "AccountJournalEntry", refId: entryId },
    });
  }

  const created = await db.accountJournalEntry.findFirst({ where: { id: entryId }, select: { docNo: true } });
  return { ok: true, entryId, docNo: created?.docNo ?? "" };
}

// ─────────────────── 3) กลับรายการ (§11.2) ───────────────────

export type ReverseResult = { ok: true; entryId: string; docNo: string } | { ok: false; reason: string };

/** กลับรายการใบสำคัญ — ห่อ `gl.reverseEntry` + ด่านความเป็นเจ้าของ (entry ต้องอยู่ในร้านนี้) */
export async function reverseJournalEntry(ctx: JournalCtx, entryId: string, reason: string): Promise<ReverseResult> {
  const db = tenantDb(ctx);
  const e = await db.accountJournalEntry.findFirst({
    where: { id: entryId },
    select: { id: true, status: true, docNo: true, date: true },
  });
  if (!e) return { ok: false, reason: "ไม่พบใบสำคัญนี้" };
  if (e.status === "REVERSED") return { ok: false, reason: `${e.docNo} ถูกกลับรายการไปแล้ว` };
  // §9.3: กลับรายการใบที่ลงวันที่ในช่วงล็อกไม่ได้
  // 🔴 ด่านใน gl.commitEntry จับไม่ได้ เพราะ reverseEntry เลื่อนวันไปงวดเปิดถัดไป (resolveOpenDate)
  const lockCheck = await checkNotLocked(ctx, e.date);
  if (!lockCheck.ok) return lockCheck;
  const note = reason.trim();
  if (note.length < 3) return { ok: false, reason: "กรุณาระบุเหตุผลในการกลับรายการ" };
  try {
    const r = await reverseEntry(ctx, entryId, note);
    if ("skipped" in r) return { ok: false, reason: "ใบสำคัญนี้กลับรายการไม่ได้ (สถานะไม่ใช่บันทึกแล้ว)" };
    const created = await db.accountJournalEntry.findFirst({ where: { id: r.entryId }, select: { docNo: true } });
    return { ok: true, entryId: r.entryId, docNo: created?.docNo ?? "" };
  } catch (err) {
    // WO 9.4 — err อาจเป็น Prisma/ระบบภายนอกดิบ ๆ (ไม่ใช่ Error ไทยที่เราโยนเอง) ⇒ กรองก่อนโชว์ผู้ใช้
    return { ok: false, reason: safeReason(err, "กลับรายการไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ─────────────────── 4) ธง ⚑ ต้องตรวจ ───────────────────

export type FlagResult = { ok: true; needsReview: boolean } | { ok: false; reason: string };

/**
 * ติด/ปลดธง "⚑ ต้องตรวจ" ของใบสำคัญ (§11.2)
 * ⚠️ ธงนี้เป็น **ด่านปิดงวด** (closePeriod ปฏิเสธเมื่อยังมีใบติดธงในงวด) — ไม่ใช่แค่ป้ายสวยงาม
 */
export async function toggleNeedsReview(ctx: JournalCtx, entryId: string, note?: string | null): Promise<FlagResult> {
  const db = tenantDb(ctx);
  const e = await db.accountJournalEntry.findFirst({ where: { id: entryId }, select: { id: true, needsReview: true } });
  if (!e) return { ok: false, reason: "ไม่พบใบสำคัญนี้" };
  const next = !e.needsReview;
  await db.accountJournalEntry.update({
    where: { id: e.id },
    data: { needsReview: next, flagNote: next ? (note?.trim() || null) : null },
  });
  return { ok: true, needsReview: next };
}

// ─────────────────── 5) รายละเอียดใบสำคัญ (drill-down ชั้นที่ 3) ───────────────────

export type JournalEntryDetail = JournalListRow & {
  periodKey: string;
  /** ใบที่ถูกกลับ (ถ้าใบนี้เป็นขากลับ) */
  reversalOf: { id: string; docNo: string } | null;
  /** ใบขากลับ (ถ้าใบนี้ถูกกลับไปแล้ว) */
  reversedBy: { id: string; docNo: string } | null;
  attachments: { id: string; fileName: string; fileUrl: string; mimeType: string; sizeBytes: number }[];
};

export async function journalEntryDetail(ctx: JournalCtx, entryId: string): Promise<JournalEntryDetail | null> {
  const db = tenantDb(ctx);
  const e = await db.accountJournalEntry.findFirst({
    where: { id: entryId },
    select: {
      id: true,
      docNo: true,
      date: true,
      periodKey: true,
      book: true,
      journal: true,
      memo: true,
      status: true,
      needsReview: true,
      flagNote: true,
      source: true,
      postedById: true,
      refType: true,
      refId: true,
      reversalOfId: true,
      reversalOf: { select: { id: true, docNo: true } },
      reversedBy: { select: { id: true, docNo: true } },
      lines: {
        select: {
          id: true,
          debit: true,
          credit: true,
          note: true,
          contactId: true,
          accountId: true,
          account: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (!e) return null;

  const [doc, user, contacts, attachments] = await Promise.all([
    e.refType === "AccountDocument" && e.refId
      ? db.accountDocument.findFirst({ where: { id: e.refId }, select: { id: true, docNo: true, docType: true } })
      : Promise.resolve(null),
    e.postedById
      ? db.user.findFirst({ where: { id: e.postedById }, select: { name: true } })
      : Promise.resolve(null),
    db.accountContact.findMany({
      where: { id: { in: e.lines.map((l) => l.contactId).filter((x): x is string => !!x) } },
      select: { id: true, name: true },
    }),
    db.accountAttachment.findMany({
      where: { refType: "AccountJournalEntry", refId: e.id },
      select: { id: true, fileName: true, fileUrl: true, mimeType: true, sizeBytes: true },
    }),
  ]);
  const contactById = new Map(contacts.map((c) => [c.id, c.name]));

  return {
    id: e.id,
    docNo: e.docNo,
    date: e.date,
    periodKey: e.periodKey,
    book: e.book,
    bookLabel: BOOK_LABEL[e.book],
    journal: e.journal,
    memo: e.memo,
    status: e.status,
    needsReview: e.needsReview,
    flagNote: e.flagNote,
    source: e.source,
    postedByName: user?.name ?? null,
    postedById: e.postedById,
    ref: doc ? { label: doc.docNo ?? "(ยังไม่มีเลขที่)", href: `docs/${doc.docType}/${doc.id}` } : null,
    refType: e.refType,
    refId: e.refId,
    refDocNo: doc?.docNo ?? null,
    reversed: !!e.reversedBy,
    isReversal: !!e.reversalOfId,
    reversalOf: e.reversalOf ?? null,
    reversedBy: e.reversedBy ?? null,
    totalDebit: e.lines.reduce((s, l) => s + l.debit, 0),
    totalCredit: e.lines.reduce((s, l) => s + l.credit, 0),
    lines: e.lines.map((l) => ({
      id: l.id,
      accountId: l.accountId,
      code: l.account.code,
      name: l.account.name,
      note: l.note,
      contactName: l.contactId ? (contactById.get(l.contactId) ?? null) : null,
      debit: l.debit,
      credit: l.credit,
      suspense: l.account.code === "9999",
    })),
    attachments,
  };
}

// ─────────────────── 6) บัญชีแยกประเภท (General Ledger) ───────────────────
//
// WO B4: หน้า `/account/ledger` และ `GET /reports/general-ledger` ต้องได้ตัวเลขชุดเดียวกันเป๊ะ
// ⇒ มี "ประตูเดียว" คือฟังก์ชันนี้: resolve บัญชี (scope ร้าน) + เรียกคิวรียอดสะสมตัวเดิม
//   (`coa.ledgerRunning` — เจ้าของคิวรีตั้งแต่ WO 6.1 รอบ 2 · ข้อสอบ qc-acc-v2-coa T15 คุมอยู่)
//   ห้ามเขียนคิวรียอดสะสมชุดที่ 2 ที่ไหนอีก — สองสูตรวันหนึ่งจะเดินคนละทางแล้วไม่มีใครรู้ว่าอันไหนถูก
//
// 🔴 บัญชีถูก resolve ผ่าน `tenantDb` (มี tenantId ใน SQL) ⇒ id ของร้านอื่น = ไม่พบ → ก้อนว่าง
//    (ผู้เรียก REST แปลง "account = null" เป็น 404 · หน้าจอแปลงเป็น "เลือกบัญชี")

export type GeneralLedgerAccount = { id: string; code: string; name: string; type: AccountLedgerType };

export type GeneralLedger = {
  /** null = ไม่ได้เลือกบัญชี หรือบัญชีไม่ใช่ของร้านนี้ */
  account: GeneralLedgerAccount | null;
  from: Date;
  to: Date;
  opening: number;
  rows: LedgerRunningRow[];
  movementDebit: number;
  movementCredit: number;
  closing: number;
};

export async function generalLedger(
  ctx: JournalCtx,
  input: { accountId: string; from: Date; to: Date },
): Promise<GeneralLedger> {
  const empty = {
    account: null,
    from: input.from,
    to: input.to,
    opening: 0,
    rows: [],
    movementDebit: 0,
    movementCredit: 0,
    closing: 0,
  } satisfies GeneralLedger;

  const accountId = (input.accountId ?? "").trim();
  if (!accountId) return empty;
  const account = await tenantDb(ctx).accountLedger.findFirst({
    where: { id: accountId },
    select: { id: true, code: true, name: true, type: true },
  });
  if (!account) return empty;

  const run = await ledgerRunning(ctx, account.id, { from: input.from, to: input.to });
  return { account, from: input.from, to: input.to, ...run };
}

/** บัญชีที่เลือกได้ในบรรทัด JV (ไม่รวมบัญชีที่ปิดใช้งาน) */
export async function jvAccountOptions(ctx: JournalCtx): Promise<{ id: string; code: string; name: string }[]> {
  return tenantDb(ctx).accountLedger.findMany({
    where: { archivedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

/** ผู้ติดต่อสำหรับช่อง "ผู้ติดต่อ" ในบรรทัด JV (ไม่บังคับเลือก — g16 แสดง "—") */
export async function jvContactOptions(ctx: JournalCtx): Promise<{ id: string; name: string }[]> {
  return tenantDb(ctx).accountContact.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    take: 500,
    select: { id: true, name: true },
  });
}
