import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/core/db";
import type { AccountFinanceType, Prisma } from "@prisma/client";
// posting engine (owner = GL-Core, ไฟล์ gl.ts) — subagent แค่ import + เรียกตามลายเซ็น
// GL-P2P3 เพิ่ม postManualJV / postOpening (เรียกตามลายเซ็นที่ประกาศไว้)
// WO 5.1: postFinanceOpening (ยอดยกมาต่อรายการ idempotent ต่อ financeId+seq+version — ต่างจาก postOpening
//         ที่ idempotent ต่องวดทั้งระบบ) · postFinanceTransfer (โอน idempotent ต่อ transferId) · reverseFor (แก้/ลบรายการยอดยกมา)
import { ensureAccounting, postFinanceOpening, postFinanceTransfer, reverseFor } from "./gl";

// ─────────────────────────────────────────────────────────────
// finance.ts — การเงิน (บัญชีเงิน) — §3.5 (P2) · V2 WO 5.1 (DESIGN-SPEC-V2 §10.1 · ภาพ g9)
// AccountFinance CRUD (CASH/BANK/E_WALLET/PETTY_CASH) + สร้างบัญชีลูก GL อัตโนมัติ
// (ใต้ 1000/1010/1020/1030) + ยอดยกมาหลายรายการ (AccountFinanceOpening → gl.postFinanceOpening
// 1 JV/รายการ) + รหัสช่องทาง (CSH/BSV/BCA/EWL/PTY + เลข 3 หลัก) + statement (จาก AccountJournalLine
// ของ ledgerAccountId) + ยอดคงเหลือ + โอนระหว่างบัญชีเงิน (กันโพสต์ซ้ำด้วย AccountFinanceTransfer)
// + petty cash เติม/เบิกชดเชย + จัดกลุ่มตามประเภทสำหรับหน้ารายการ (§10.1)
// เงิน Int สตางค์ · scope = tenantId + systemId · owner = Finance-WHT agent
// ─────────────────────────────────────────────────────────────

type Ctx = { tenantId: string; systemId: string };

// type บัญชีเงิน → ผังบัญชีแม่ (§4.14): เงินสด 1000 · ธนาคาร 1010 · e-Wallet 1020 · สำรองจ่าย 1030
const PARENT_CODE: Record<AccountFinanceType, string> = {
  CASH: "1000",
  BANK: "1010",
  E_WALLET: "1020",
  PETTY_CASH: "1030",
};

export const FINANCE_TYPE_LABEL: Record<AccountFinanceType, string> = {
  CASH: "เงินสด",
  BANK: "ธนาคาร",
  E_WALLET: "e-Wallet",
  PETTY_CASH: "เงินสำรองจ่าย",
};

export type BankSubtype = "SAVINGS" | "CURRENT";
export const BANK_SUBTYPE_LABEL: Record<BankSubtype, string> = {
  SAVINGS: "ออมทรัพย์",
  CURRENT: "กระแสรายวัน",
};

// ─────────────────── กลุ่มการ์ด (§10.1: เงินสด · ออมทรัพย์ · กระแสรายวัน · e-Wallet · สำรองรับ/จ่าย) ───────────────────

export type FinanceGroupKey = "CASH" | "BANK_SAVINGS" | "BANK_CURRENT" | "E_WALLET" | "PETTY_CASH";
export const FINANCE_GROUP_LABEL: Record<FinanceGroupKey, string> = {
  CASH: "เงินสด",
  BANK_SAVINGS: "ออมทรัพย์",
  BANK_CURRENT: "กระแสรายวัน",
  E_WALLET: "e-Wallet",
  PETTY_CASH: "สำรองรับ-จ่าย",
};
const GROUP_ORDER: FinanceGroupKey[] = ["CASH", "BANK_SAVINGS", "BANK_CURRENT", "E_WALLET", "PETTY_CASH"];

export function financeGroupKey(type: AccountFinanceType, bankSubtype: string | null): FinanceGroupKey {
  if (type === "BANK") return bankSubtype === "CURRENT" ? "BANK_CURRENT" : "BANK_SAVINGS";
  return type; // CASH / E_WALLET / PETTY_CASH ตรงตัว
}

// รหัสช่องทาง (WO 5.1 · §10.1): CSH001 · BSV001 (ออมทรัพย์) · BCA001 (กระแส) · EWL001 · PTY001
const CODE_PREFIX: Record<FinanceGroupKey, string> = {
  CASH: "CSH",
  BANK_SAVINGS: "BSV",
  BANK_CURRENT: "BCA",
  E_WALLET: "EWL",
  PETTY_CASH: "PTY",
};

function codePrefixFor(type: AccountFinanceType, bankSubtype: string | null): string {
  return CODE_PREFIX[financeGroupKey(type, bankSubtype)];
}

/** เลขที่ถัดไปของ prefix นี้ (สแกนโค้ดที่มีอยู่ทั้งหมด รวมที่ปิดใช้งานแล้ว กันเลขซ้ำย้อนหลัง) */
export async function nextFinanceCode(
  systemId: string,
  type: AccountFinanceType,
  bankSubtype: string | null,
): Promise<string> {
  const prefix = codePrefixFor(type, bankSubtype);
  const rows = await prisma.accountFinance.findMany({
    where: { systemId, code: { startsWith: prefix } },
    select: { code: true },
  });
  let max = 0;
  for (const r of rows) {
    const m = r.code?.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** ชื่อ partial unique index ของ `code` (migration 20260904220000) */
const FINANCE_CODE_INDEX = "AccountFinance_systemId_code_active_key";

/** error ของ Prisma ที่แปลว่า "รหัสช่องทางชนกัน" — รูปแบบเดียวกับ isContactCodeConflict (service.ts)
 * เหตุผลเดียวกัน: Prisma 7 + @prisma/adapter-pg ไม่ใส่ meta.target มาให้ ต้องดูจาก message/ชื่อ index */
function isFinanceCodeConflict(e: unknown): boolean {
  const err = e as {
    code?: string;
    message?: string;
    meta?: { driverAdapterError?: { cause?: { originalMessage?: string; constraint?: { fields?: unknown } } } };
  };
  if (err?.code !== "P2002") return false;
  const cause = err.meta?.driverAdapterError?.cause;
  const blob = [err.message ?? "", cause?.originalMessage ?? "", JSON.stringify(cause?.constraint?.fields ?? "")].join(" | ");
  if (blob.includes(FINANCE_CODE_INDEX)) return true;
  return /(^|[^A-Za-z])code([^A-Za-z]|$)/.test(blob);
}

// ─────────────────── ช่วงเดือนนี้ (เวลาไทย) — คำนวณเองในไฟล์นี้ ไม่ import จาก dashboard.ts
//   (dashboard.ts import financeBalances จากไฟล์นี้อยู่แล้ว — import กลับจะเป็น circular) ───────────────────

const TZ = "Asia/Bangkok";
function bkkDayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}
/** [ต้นเดือนนี้, ต้นเดือนหน้า) ตามเวลาไทย ของวันที่ `now` */
function currentMonthRangeBkk(now: Date): { from: Date; to: Date } {
  const [y, m] = bkkDayKey(now).slice(0, 7).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return {
    from: new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+07:00`),
    to: new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00+07:00`),
  };
}

// ─────────────────── อ่าน ───────────────────

/** พรีวิวเลขบัญชีลูก GL ที่จะถูกสร้างให้ ถ้าเพิ่มช่องทางประเภทนี้ตอนนี้ (modal ขั้นสูง g9: "ระบบจะสร้างบัญชี … ให้อัตโนมัติ")
 * best-effort — แค่ตัวเลขที่คาดว่าจะได้ ไม่ได้ล็อกไว้ (สร้างจริงตอนบันทึกอาจขยับถ้ามีคนอื่นสร้างพร้อมกัน) */
export async function previewChildLedgerCodes(systemId: string): Promise<Record<AccountFinanceType, string>> {
  const types: AccountFinanceType[] = ["CASH", "BANK", "E_WALLET", "PETTY_CASH"];
  const out = {} as Record<AccountFinanceType, string>;
  for (const t of types) {
    const parentCode = PARENT_CODE[t];
    const siblings = await prisma.accountLedger.count({ where: { systemId, code: { startsWith: `${parentCode}-` } } });
    out[t] = `${parentCode}-${String(siblings + 1).padStart(2, "0")}`;
  }
  return out;
}

export function listFinanceAccounts(tenantId: string, systemId: string) {
  return prisma.accountFinance.findMany({
    where: { tenantId, systemId, archivedAt: null },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
}

export function getFinanceAccount(tenantId: string, systemId: string, id: string) {
  return prisma.accountFinance.findFirst({ where: { id, tenantId, systemId } });
}

export type FinanceAccountBalance = {
  id: string;
  code: string | null;
  name: string;
  type: AccountFinanceType;
  bankSubtype: string | null;
  bankName: string | null;
  accountNo: string | null;
  accountName: string | null;
  bankBranch: string | null;
  promptpayId: string | null;
  note: string | null;
  useForReceive: boolean;
  useForPay: boolean;
  showOnDocuments: boolean;
  holderUserId: string | null;
  limitSatang: number | null;
  ledgerAccountId: string | null;
  balance: number;
  /** ปักหมุด (V2 WO 0.3) — หน้าหลักใช้เลือกการ์ด "ช่องทางที่ติดตาม" โดยไม่ต้อง query ซ้ำ */
  pinned: boolean;
};

/** ยอดคงเหลือปัจจุบันของทุกบัญชีเงิน (asset: Σdebit − Σcredit ของ ledger ที่ผูก) */
export async function financeBalances(tenantId: string, systemId: string): Promise<FinanceAccountBalance[]> {
  const accounts = await listFinanceAccounts(tenantId, systemId);
  const ledgerIds = accounts.map((a) => a.ledgerAccountId).filter((x): x is string => !!x);

  const sums = ledgerIds.length
    ? await prisma.accountJournalLine.groupBy({
        by: ["accountId"],
        where: { systemId, accountId: { in: ledgerIds } },
        _sum: { debit: true, credit: true },
      })
    : [];
  // reversal สร้าง entry ตรงข้าม + ทำ entry เดิม REVERSED (แต่บรรทัดยังอยู่) → รวมทั้งหมด = ยอดสุทธิถูก
  const balByLedger = new Map(sums.map((s) => [s.accountId, (s._sum.debit ?? 0) - (s._sum.credit ?? 0)]));

  return accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    bankSubtype: a.bankSubtype,
    bankName: a.bankName,
    accountNo: a.accountNo,
    accountName: a.accountName,
    bankBranch: a.bankBranch,
    promptpayId: a.promptpayId,
    note: a.note,
    useForReceive: a.useForReceive,
    useForPay: a.useForPay,
    showOnDocuments: a.showOnDocuments,
    holderUserId: a.holderUserId,
    limitSatang: a.limitSatang,
    ledgerAccountId: a.ledgerAccountId,
    balance: a.ledgerAccountId ? balByLedger.get(a.ledgerAccountId) ?? 0 : 0,
    pinned: a.pinned,
  }));
}

/** เปลี่ยนแปลงเดือนนี้ต่อบัญชี (Σdr−cr ของบรรทัดที่ entry.date อยู่ในเดือนนี้ตามเวลาไทย)
 * + จำนวนครั้งที่มีเงินเข้า (debit>0) ในเดือนนี้ — ใช้แสดง "เดือนนี้ เติมแล้ว N ครั้ง" ของสำรองรับ-จ่าย (g9) */
export async function financeMonthChanges(
  tenantId: string,
  systemId: string,
  now: Date = new Date(),
): Promise<Map<string, { delta: number; inCount: number }>> {
  const accounts = await listFinanceAccounts(tenantId, systemId);
  const ledgerIds = accounts.map((a) => a.ledgerAccountId).filter((x): x is string => !!x);
  const out = new Map<string, { delta: number; inCount: number }>();
  if (ledgerIds.length === 0) return out;
  const { from, to } = currentMonthRangeBkk(now);

  const [sums, lines] = await Promise.all([
    prisma.accountJournalLine.groupBy({
      by: ["accountId"],
      where: { systemId, accountId: { in: ledgerIds }, entry: { date: { gte: from, lt: to } } },
      _sum: { debit: true, credit: true },
    }),
    prisma.accountJournalLine.findMany({
      where: { systemId, accountId: { in: ledgerIds }, debit: { gt: 0 }, entry: { date: { gte: from, lt: to } } },
      select: { accountId: true },
    }),
  ]);
  const deltaByLedger = new Map(sums.map((s) => [s.accountId, (s._sum.debit ?? 0) - (s._sum.credit ?? 0)]));
  const inCountByLedger = new Map<string, number>();
  for (const l of lines) inCountByLedger.set(l.accountId, (inCountByLedger.get(l.accountId) ?? 0) + 1);

  for (const a of accounts) {
    if (!a.ledgerAccountId) continue;
    out.set(a.id, {
      delta: deltaByLedger.get(a.ledgerAccountId) ?? 0,
      inCount: inCountByLedger.get(a.ledgerAccountId) ?? 0,
    });
  }
  return out;
}

export type FinanceGroup = {
  key: FinanceGroupKey;
  label: string;
  total: number;
  accounts: FinanceAccountBalance[];
};

/** จัดกลุ่มตามประเภท (§10.1) — pure function ไม่ query ซ้ำ ใช้ผลจาก financeBalances */
export function groupFinanceAccounts(rows: FinanceAccountBalance[]): FinanceGroup[] {
  const byKey = new Map<FinanceGroupKey, FinanceAccountBalance[]>();
  for (const r of rows) {
    const key = financeGroupKey(r.type, r.bankSubtype);
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  return GROUP_ORDER.filter((k) => (byKey.get(k)?.length ?? 0) > 0).map((key) => {
    const accounts = byKey.get(key) ?? [];
    return { key, label: FINANCE_GROUP_LABEL[key], total: accounts.reduce((s, a) => s + a.balance, 0), accounts };
  });
}

export function getFinanceAccountById(tenantId: string, systemId: string, id: string) {
  return prisma.accountFinance.findFirst({ where: { id, tenantId, systemId } });
}

// ─────────────────── ยอดยกมา (หลายรายการ) ───────────────────

export type FinanceOpeningRow = {
  seq: number;
  date: Date;
  amountSatang: number;
  note: string | null;
  version: number;
};

export function listFinanceOpeningEntries(financeId: string): Promise<FinanceOpeningRow[]> {
  return prisma.accountFinanceOpening.findMany({
    where: { financeId },
    orderBy: { seq: "asc" },
    select: { seq: true, date: true, amountSatang: true, note: true, version: true },
  });
}

/** รวมยอดยกมาปัจจุบัน (ผลรวมของทุกรายการ) + วันที่เร็วสุด — ใช้ sync คอลัมน์ backward-compat */
async function recomputeOpeningSummary(tx: Prisma.TransactionClient, financeId: string): Promise<void> {
  const rows = await tx.accountFinanceOpening.findMany({ where: { financeId }, select: { amountSatang: true, date: true } });
  const sum = rows.reduce((s, r) => s + r.amountSatang, 0);
  const minDate = rows.length ? rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date) : null;
  await tx.accountFinance.update({ where: { id: financeId }, data: { openingBalance: sum, openingDate: minDate } });
}

/** เพิ่มรายการยอดยกมา 1 แถว → 1 JV (idempotent ต่อ financeId+seq+version=1) */
export async function addFinanceOpeningEntry(
  tenantId: string,
  systemId: string,
  financeId: string,
  input: { date: Date; amountSatang: number; note?: string | null },
): Promise<{ ok: true; seq: number } | { ok: false; reason: string }> {
  const amount = Math.round(input.amountSatang);
  if (amount === 0) return { ok: false, reason: "จำนวนเงินยอดยกมาต้องไม่เป็นศูนย์" };
  const fa = await prisma.accountFinance.findFirst({ where: { id: financeId, tenantId, systemId } });
  if (!fa) return { ok: false, reason: "ไม่พบช่องทางการเงิน" };
  const ctx: Ctx = { tenantId, systemId };
  try {
    await prisma.$transaction(async (tx) => {
      await ensureAccounting(ctx, tx);
      const ledgerAccountId = fa.ledgerAccountId ?? (await createChildLedger(tx, ctx, fa.type, fa.name));
      if (!fa.ledgerAccountId) await tx.accountFinance.update({ where: { id: fa.id }, data: { ledgerAccountId } });

      const last = await tx.accountFinanceOpening.findFirst({ where: { financeId }, orderBy: { seq: "desc" }, select: { seq: true } });
      const seq = (last?.seq ?? 0) + 1;
      await tx.accountFinanceOpening.create({
        data: { tenantId, systemId, financeId, seq, date: input.date, amountSatang: amount, note: input.note ?? null, version: 1 },
      });
      const posted = await postFinanceOpening(
        ctx,
        { financeId, seq, version: 1, accountId: ledgerAccountId, date: input.date, amountSatang: amount, memo: input.note ?? undefined },
        tx,
      );
      if ("entryId" in posted) {
        await tx.accountFinanceOpening.update({ where: { financeId_seq: { financeId, seq } }, data: { entryId: posted.entryId, postedAt: new Date() } });
      }
      await recomputeOpeningSummary(tx, financeId);
      return seq;
    });
    const last = await prisma.accountFinanceOpening.findFirst({ where: { financeId }, orderBy: { seq: "desc" }, select: { seq: true } });
    return { ok: true, seq: last?.seq ?? 1 };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกยอดยกมาไม่สำเร็จ" };
  }
}

/** แก้รายการยอดยกมา — กลับรายการเดิม (reverseFor ตาม version ปัจจุบัน) แล้วโพสต์ใหม่ด้วย version+1
 * (ห้ามใช้ refId เดิมซ้ำ เพราะ gl.alreadyPosted เช็คแค่ "มีแถวไหม" ไม่สนสถานะ REVERSED) */
export async function updateFinanceOpeningEntry(
  tenantId: string,
  systemId: string,
  financeId: string,
  seq: number,
  input: { date?: Date; amountSatang?: number; note?: string | null },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fa = await prisma.accountFinance.findFirst({ where: { id: financeId, tenantId, systemId } });
  if (!fa) return { ok: false, reason: "ไม่พบช่องทางการเงิน" };
  const entry = await prisma.accountFinanceOpening.findUnique({ where: { financeId_seq: { financeId, seq } } });
  if (!entry) return { ok: false, reason: "ไม่พบรายการยอดยกมา" };
  const nextDate = input.date ?? entry.date;
  const nextAmount = input.amountSatang != null ? Math.round(input.amountSatang) : entry.amountSatang;
  if (nextAmount === 0) return { ok: false, reason: "จำนวนเงินยอดยกมาต้องไม่เป็นศูนย์" };
  const ctx: Ctx = { tenantId, systemId };
  try {
    await prisma.$transaction(async (tx) => {
      await ensureAccounting(ctx, tx);
      const ledgerAccountId = fa.ledgerAccountId ?? (await createChildLedger(tx, ctx, fa.type, fa.name));
      if (!fa.ledgerAccountId) await tx.accountFinance.update({ where: { id: fa.id }, data: { ledgerAccountId } });

      await reverseFor(ctx, "AccountFinanceOpening", `${financeId}:${seq}:v${entry.version}`, "แก้ไขยอดยกมา", tx);
      const nextVersion = entry.version + 1;
      const posted = await postFinanceOpening(
        ctx,
        { financeId, seq, version: nextVersion, accountId: ledgerAccountId, date: nextDate, amountSatang: nextAmount, memo: input.note ?? entry.note ?? undefined },
        tx,
      );
      await tx.accountFinanceOpening.update({
        where: { financeId_seq: { financeId, seq } },
        data: {
          date: nextDate,
          amountSatang: nextAmount,
          note: input.note !== undefined ? input.note : entry.note,
          version: nextVersion,
          entryId: "entryId" in posted ? posted.entryId : entry.entryId,
          postedAt: new Date(),
        },
      });
      await recomputeOpeningSummary(tx, financeId);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "แก้ไขยอดยกมาไม่สำเร็จ" };
  }
}

/** ลบรายการยอดยกมา — กลับรายการ JV (ไม่เคยลบ JV จริง แค่เพิ่ม reversal) แล้วลบแถวอินพุตทิ้ง */
export async function removeFinanceOpeningEntry(
  tenantId: string,
  systemId: string,
  financeId: string,
  seq: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fa = await prisma.accountFinance.findFirst({ where: { id: financeId, tenantId, systemId } });
  if (!fa) return { ok: false, reason: "ไม่พบช่องทางการเงิน" };
  const entry = await prisma.accountFinanceOpening.findUnique({ where: { financeId_seq: { financeId, seq } } });
  if (!entry) return { ok: false, reason: "ไม่พบรายการยอดยกมา" };
  const ctx: Ctx = { tenantId, systemId };
  try {
    await prisma.$transaction(async (tx) => {
      await reverseFor(ctx, "AccountFinanceOpening", `${financeId}:${seq}:v${entry.version}`, "ลบรายการยอดยกมา", tx);
      await tx.accountFinanceOpening.delete({ where: { financeId_seq: { financeId, seq } } });
      await recomputeOpeningSummary(tx, financeId);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ลบยอดยกมาไม่สำเร็จ" };
  }
}

// ─────────────────── สร้าง (auto สร้างบัญชีลูก GL + opening) ───────────────────

/** สร้างบัญชีลูก GL ใต้ผังแม่ตาม type (code = "{parent}-NN") — คืน ledger id */
async function createChildLedger(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  type: AccountFinanceType,
  name: string,
): Promise<string> {
  const parentCode = PARENT_CODE[type];
  const parent = await tx.accountLedger.findFirst({
    where: { systemId: ctx.systemId, code: parentCode },
    select: { id: true },
  });
  // นับลูกที่มีอยู่ → หมายเลขถัดไป
  const siblings = await tx.accountLedger.count({
    where: { systemId: ctx.systemId, code: { startsWith: `${parentCode}-` } },
  });
  const code = `${parentCode}-${String(siblings + 1).padStart(2, "0")}`;
  const led = await tx.accountLedger.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      code,
      name,
      type: "ASSET",
      cashflowActivity: "OPERATING",
      parentId: parent?.id ?? null,
      isSystem: false,
    },
    select: { id: true },
  });
  return led.id;
}

export type CreateFinanceOpeningEntryInput = { date: Date; amountSatang: number; note?: string | null };

export type CreateFinanceAccountInput = {
  tenantId: string;
  systemId: string;
  type: AccountFinanceType;
  name: string;
  /** ว่าง/ไม่ส่ง = ระบบออกให้อัตโนมัติ + retry เมื่อชนกัน (เหมือน AccountContact.code) */
  code?: string | null;
  bankSubtype?: BankSubtype | null; // เฉพาะ type=BANK
  bankName?: string | null;
  bankBranch?: string | null;
  accountNo?: string | null;
  accountName?: string | null;
  promptpayId?: string | null;
  note?: string | null;
  useForReceive?: boolean;
  useForPay?: boolean;
  showOnDocuments?: boolean;
  holderUserId?: string | null;
  limitSatang?: number | null;
  /** §10.1 modal ขั้นสูง "ยอดยกมาหลายรายการ" — แต่ละรายการ = 1 JV ของตัวเอง */
  openingEntries?: CreateFinanceOpeningEntryInput[];
  // backward-compat: ก้อนเดียว (WO 5.1 ก่อนหน้า/ผู้เรียกเดิม) — ถ้าไม่ส่ง openingEntries จะห่อเป็น 1 รายการให้
  openingBalance?: number; // สตางค์
  openingDate?: Date | null;
};

export async function createFinanceAccount(
  input: CreateFinanceAccountInput,
): Promise<{ ok: true; id: string; code: string } | { ok: false; reason: string }> {
  if (!input.name.trim()) return { ok: false, reason: "กรุณากรอกชื่อบัญชี" };
  const ctx: Ctx = { tenantId: input.tenantId, systemId: input.systemId };
  const bankSubtype = input.type === "BANK" ? input.bankSubtype ?? "SAVINGS" : null;

  const entries: CreateFinanceOpeningEntryInput[] =
    input.openingEntries && input.openingEntries.length > 0
      ? input.openingEntries
      : Math.round(input.openingBalance ?? 0) !== 0
        ? [{ date: input.openingDate ?? new Date(), amountSatang: Math.round(input.openingBalance ?? 0), note: null }]
        : [];

  const explicitCode = typeof input.code === "string" ? input.code.trim() : "";

  const attemptCreate = async (code: string) => {
    return prisma.$transaction(async (tx) => {
      await ensureAccounting(ctx, tx);
      const ledgerAccountId = await createChildLedger(tx, ctx, input.type, input.name.trim());
      const fa = await tx.accountFinance.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          type: input.type,
          name: input.name.trim(),
          code,
          bankSubtype,
          bankName: input.bankName ?? null,
          bankBranch: input.bankBranch ?? null,
          accountNo: input.accountNo ?? null,
          accountName: input.accountName ?? null,
          promptpayId: input.promptpayId ?? null,
          note: input.note ?? null,
          useForReceive: input.useForReceive ?? true,
          useForPay: input.useForPay ?? true,
          openingBalance: 0,
          openingDate: null,
          ledgerAccountId,
          showOnDocuments: input.showOnDocuments ?? false,
          holderUserId: input.holderUserId ?? null,
          limitSatang: input.limitSatang != null ? Math.round(input.limitSatang) : null,
        },
        select: { id: true },
      });
      let seq = 0;
      for (const e of entries) {
        seq += 1;
        const amount = Math.round(e.amountSatang);
        if (amount === 0) continue;
        await tx.accountFinanceOpening.create({
          data: { tenantId: ctx.tenantId, systemId: ctx.systemId, financeId: fa.id, seq, date: e.date, amountSatang: amount, note: e.note ?? null, version: 1 },
        });
        const posted = await postFinanceOpening(
          ctx,
          { financeId: fa.id, seq, version: 1, accountId: ledgerAccountId, date: e.date, amountSatang: amount, memo: e.note ?? undefined },
          tx,
        );
        if ("entryId" in posted) {
          await tx.accountFinanceOpening.update({ where: { financeId_seq: { financeId: fa.id, seq } }, data: { entryId: posted.entryId, postedAt: new Date() } });
        }
      }
      if (entries.length) await recomputeOpeningSummary(tx, fa.id);
      return fa.id;
    });
  };

  try {
    if (explicitCode) {
      const id = await attemptCreate(explicitCode);
      return { ok: true, id, code: explicitCode };
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = await nextFinanceCode(input.systemId, input.type, bankSubtype);
      try {
        const id = await attemptCreate(code);
        return { ok: true, id, code };
      } catch (e) {
        if (!isFinanceCodeConflict(e)) throw e;
        // ชนกับคนที่เร็วกว่า → วนไปขอเลขถัดไป
      }
    }
    return { ok: false, reason: "ออกรหัสช่องทางไม่สำเร็จ — ลองอีกครั้ง" };
  } catch (e) {
    if (isFinanceCodeConflict(e)) return { ok: false, reason: `รหัส "${explicitCode}" ซ้ำกับช่องทางที่ใช้งานอยู่` };
    return { ok: false, reason: e instanceof Error ? e.message : "สร้างบัญชีเงินไม่สำเร็จ" };
  }
}

/** แก้ข้อมูลบัญชีเงิน (metadata) — ยอดยกมาที่โพสต์แล้ว immutable แก้ผ่าน update/removeFinanceOpeningEntry เท่านั้น */
export async function updateFinanceAccount(
  tenantId: string,
  systemId: string,
  id: string,
  input: {
    name?: string;
    code?: string | null;
    bankSubtype?: BankSubtype | null;
    bankName?: string | null;
    bankBranch?: string | null;
    accountNo?: string | null;
    accountName?: string | null;
    promptpayId?: string | null;
    note?: string | null;
    useForReceive?: boolean;
    useForPay?: boolean;
    showOnDocuments?: boolean;
    holderUserId?: string | null;
    limitSatang?: number | null;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fa = await prisma.accountFinance.findFirst({ where: { id, tenantId, systemId } });
  if (!fa) return { ok: false, reason: "ไม่พบบัญชีเงิน" };
  const name = input.name?.trim();
  const code = input.code !== undefined ? (input.code?.trim() || null) : undefined;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.accountFinance.update({
        where: { id },
        data: {
          name: name || fa.name,
          code: code !== undefined ? code : undefined,
          bankSubtype: input.bankSubtype !== undefined ? input.bankSubtype : undefined,
          bankName: input.bankName ?? fa.bankName,
          bankBranch: input.bankBranch !== undefined ? input.bankBranch : fa.bankBranch,
          accountNo: input.accountNo ?? fa.accountNo,
          accountName: input.accountName !== undefined ? input.accountName : fa.accountName,
          promptpayId: input.promptpayId ?? fa.promptpayId,
          note: input.note !== undefined ? input.note : fa.note,
          useForReceive: input.useForReceive ?? fa.useForReceive,
          useForPay: input.useForPay ?? fa.useForPay,
          showOnDocuments: input.showOnDocuments ?? fa.showOnDocuments,
          holderUserId: input.holderUserId !== undefined ? input.holderUserId : fa.holderUserId,
          limitSatang: input.limitSatang !== undefined ? input.limitSatang : fa.limitSatang,
        },
      });
      // sync ชื่อบัญชีลูก GL ให้ตรง
      if (name && fa.ledgerAccountId) {
        await tx.accountLedger.update({ where: { id: fa.ledgerAccountId }, data: { name } });
      }
    });
    return { ok: true };
  } catch (e) {
    if (isFinanceCodeConflict(e)) return { ok: false, reason: `รหัส "${code}" ซ้ำกับช่องทางที่ใช้งานอยู่` };
    return { ok: false, reason: e instanceof Error ? e.message : "แก้ไขบัญชีเงินไม่สำเร็จ" };
  }
}

/** ปิดใช้งานช่องทางการเงิน — ปฏิเสธถ้ายอดคงเหลือ ≠ 0 หรือมีรายการชำระเงินผ่านช่องทางนี้ในเดือนนี้ (SPEC §10.1) */
export async function archiveFinanceAccount(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fa = await prisma.accountFinance.findFirst({ where: { id, tenantId, systemId } });
  if (!fa) return { ok: false as const, reason: "ไม่พบบัญชีเงิน" };
  if (fa.archivedAt) return { ok: true as const };

  if (fa.ledgerAccountId) {
    const agg = await prisma.accountJournalLine.aggregate({
      where: { systemId, accountId: fa.ledgerAccountId },
      _sum: { debit: true, credit: true },
    });
    const balance = (agg._sum.debit ?? 0) - (agg._sum.credit ?? 0);
    if (balance !== 0) {
      const baht = (balance / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
      return { ok: false as const, reason: `ปิดใช้งานไม่ได้ — ยอดคงเหลือยังไม่เป็นศูนย์ (฿${baht})` };
    }
  }
  const { from, to } = currentMonthRangeBkk(new Date());
  const paymentsThisMonth = await prisma.accountDocumentPayment.count({
    where: { systemId, financeAccountId: id, voidedAt: null, paidAt: { gte: from, lt: to } },
  });
  if (paymentsThisMonth > 0) {
    return { ok: false as const, reason: `ปิดใช้งานไม่ได้ — มีรายการชำระเงินผ่านช่องทางนี้ในเดือนนี้ ${paymentsThisMonth} รายการ` };
  }

  await prisma.accountFinance.update({ where: { id }, data: { archivedAt: new Date() } });
  return { ok: true as const };
}

const MAX_PINNED = 4;

/** ตั้ง "บัญชีเงินที่ติดตาม" ใหม่ทั้งชุด (WO 2.2 §4 ข้อ 9) — แทนที่ pinned ทั้งหมดด้วย `ids` ที่ส่งมา
 * จำกัด ≤4 · ทุก id ต้องเป็นของ tenant+system นี้เท่านั้น (กัน IDOR ข้ามระบบ) */
export async function setPinnedFinanceAccounts(
  tenantId: string,
  systemId: string,
  ids: string[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const uniq = [...new Set(ids)];
  if (uniq.length > MAX_PINNED) return { ok: false, reason: `ปักหมุดได้สูงสุด ${MAX_PINNED} บัญชี` };
  const owned = await prisma.accountFinance.findMany({
    where: { id: { in: uniq }, tenantId, systemId, archivedAt: null },
    select: { id: true },
  });
  if (owned.length !== uniq.length) return { ok: false, reason: "พบบัญชีที่ไม่ใช่ของระบบนี้" };
  await prisma.$transaction([
    prisma.accountFinance.updateMany({ where: { tenantId, systemId, pinned: true }, data: { pinned: false } }),
    ...(uniq.length
      ? [prisma.accountFinance.updateMany({ where: { tenantId, systemId, id: { in: uniq } }, data: { pinned: true } })]
      : []),
  ]);
  return { ok: true };
}

// ─────────────────── statement (ความเคลื่อนไหว + ยอดคงเหลือ) ───────────────────

export type StatementRow = {
  entryId: string;
  date: Date;
  docNo: string;
  memo: string | null;
  refType: string | null;
  refId: string | null;
  debit: number;
  credit: number;
  balance: number; // ยอดสะสม (running)
};

export async function financeStatement(
  tenantId: string,
  systemId: string,
  id: string,
  opts?: { from?: Date; to?: Date },
): Promise<{
  account: { id: string; name: string; type: AccountFinanceType } | null;
  opening: number;
  closing: number;
  rows: StatementRow[];
} | null> {
  const fa = await prisma.accountFinance.findFirst({ where: { id, tenantId, systemId } });
  if (!fa) return null;
  const account = { id: fa.id, name: fa.name, type: fa.type };
  if (!fa.ledgerAccountId) return { account, opening: 0, closing: 0, rows: [] };

  // ยอดยกมา = Σ(dr−cr) ของบรรทัดก่อน from
  let opening = 0;
  if (opts?.from) {
    const agg = await prisma.accountJournalLine.aggregate({
      where: {
        systemId,
        accountId: fa.ledgerAccountId,
        entry: { date: { lt: opts.from } },
      },
      _sum: { debit: true, credit: true },
    });
    opening = (agg._sum.debit ?? 0) - (agg._sum.credit ?? 0);
  }

  const lines = await prisma.accountJournalLine.findMany({
    where: {
      systemId,
      accountId: fa.ledgerAccountId,
      entry: {
        date: { gte: opts?.from ?? undefined, lte: opts?.to ?? undefined },
      },
    },
    include: {
      entry: { select: { id: true, date: true, docNo: true, memo: true, refType: true, refId: true } },
    },
    orderBy: [{ entry: { date: "asc" } }, { entry: { docNo: "asc" } }],
  });

  let bal = opening;
  const rows: StatementRow[] = lines.map((l) => {
    bal += l.debit - l.credit;
    return {
      entryId: l.entry.id,
      date: l.entry.date,
      docNo: l.entry.docNo,
      memo: l.entry.memo,
      refType: l.entry.refType,
      refId: l.entry.refId,
      debit: l.debit,
      credit: l.credit,
      balance: bal,
    };
  });

  return { account, opening, closing: bal, rows };
}

// ─────────────────── โอนระหว่างบัญชีเงิน (JV ทั่วไป) ───────────────────

/**
 * โอนเงินระหว่างช่องทาง — idempotent ต่อ `transferId` (caller ส่งมา เช่น uuid ที่ generate ครั้งเดียว
 * ตอนเปิด modal ฝั่ง client — กด submit ซ้ำ/network retry ส่ง transferId เดิม = ไม่โพสต์ JV ซ้ำ)
 * ไม่ส่ง transferId = สุ่มให้ (ผู้เรียกที่ไม่สนใจ idempotency เช่น pettyCashReplenish เดิม)
 */
export async function transferBetweenFinance(
  tenantId: string,
  systemId: string,
  input: { transferId?: string; fromId: string; toId: string; amount: number; date?: Date; note?: string | null; createdById?: string | null },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const amount = Math.round(input.amount);
  const transferId = input.transferId?.trim() || randomUUID();
  if (input.fromId === input.toId) return { ok: false, reason: "บัญชีต้นทางและปลายทางต้องต่างกัน" };
  if (amount <= 0) return { ok: false, reason: "จำนวนเงินต้องมากกว่า 0" };
  const ctx: Ctx = { tenantId, systemId };
  const date = input.date ?? new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.accountFinanceTransfer.findUnique({ where: { id: transferId } });
      if (existing?.entryId) return; // โพสต์แล้ว (retry ซ้ำ) — ไม่ทำอะไรต่อ

      const [from, to] = await Promise.all([
        tx.accountFinance.findFirst({ where: { id: input.fromId, tenantId, systemId } }),
        tx.accountFinance.findFirst({ where: { id: input.toId, tenantId, systemId } }),
      ]);
      if (!from || !to) throw new Error("ไม่พบบัญชีเงิน");
      await ensureAccounting(ctx, tx);
      const fromLedger = from.ledgerAccountId ?? (await createChildLedger(tx, ctx, from.type, from.name));
      const toLedger = to.ledgerAccountId ?? (await createChildLedger(tx, ctx, to.type, to.name));
      if (!from.ledgerAccountId) await tx.accountFinance.update({ where: { id: from.id }, data: { ledgerAccountId: fromLedger } });
      if (!to.ledgerAccountId) await tx.accountFinance.update({ where: { id: to.id }, data: { ledgerAccountId: toLedger } });

      const memo = input.note ?? `โอนเงิน ${from.name} → ${to.name}`;
      if (!existing) {
        await tx.accountFinanceTransfer.create({
          data: { id: transferId, tenantId, systemId, fromId: from.id, toId: to.id, amountSatang: amount, date, note: memo, createdById: input.createdById ?? null },
        });
      }
      const posted = await postFinanceTransfer(ctx, { transferId, fromLedgerId: fromLedger, toLedgerId: toLedger, amountSatang: amount, date, memo }, tx);
      if ("entryId" in posted) {
        await tx.accountFinanceTransfer.update({ where: { id: transferId }, data: { entryId: posted.entryId } });
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "โอนเงินไม่สำเร็จ" };
  }
}

/**
 * petty cash เติมเงิน / เบิกชดเชย — ย้ายเงินจากบัญชี counter (ธนาคาร/เงินสด) เข้าบัญชี PETTY_CASH
 * (บัญชีลงเหมือนการโอน — ทั้งเติมและเบิกชดเชยคือเงินไหลเข้าสำรองจ่าย)
 *
 * WO 5.2: เพิ่ม `transferId?` ทางเลือก (เดิมไม่มี — สุ่มให้เสมอ = ไม่ idempotent) เพื่อให้
 * finance-overview.ts `topUpPettyCash`/`reimbursePettyCash` ส่ง id ที่ client generate ครั้งเดียวมาได้
 * (กดซ้ำ/network retry ไม่โพสต์ JV ซ้ำ) — ไม่ส่ง = พฤติกรรมเดิมเป๊ะ (สุ่มใหม่ทุกครั้ง)
 */
export async function pettyCashReplenish(
  tenantId: string,
  systemId: string,
  input: {
    pettyId: string;
    counterFinanceId: string;
    amount: number;
    kind?: "TOPUP" | "REIMBURSE";
    date?: Date;
    note?: string | null;
    transferId?: string;
  },
): Promise<{ ok: true; transferId: string } | { ok: false; reason: string }> {
  const petty = await prisma.accountFinance.findFirst({
    where: { id: input.pettyId, tenantId, systemId },
    select: { type: true },
  });
  if (!petty) return { ok: false, reason: "ไม่พบบัญชีสำรองจ่าย" };
  if (petty.type !== "PETTY_CASH") return { ok: false, reason: "บัญชีปลายทางต้องเป็นเงินสำรองจ่าย" };
  const memo =
    input.note ?? (input.kind === "REIMBURSE" ? "เบิกชดเชยเงินสำรองจ่าย" : "เติมเงินสำรองจ่าย");
  const transferId = input.transferId?.trim() || randomUUID();
  const res = await transferBetweenFinance(tenantId, systemId, {
    transferId,
    fromId: input.counterFinanceId,
    toId: input.pettyId,
    amount: input.amount,
    date: input.date,
    note: memo,
  });
  if (!res.ok) return res;
  return { ok: true, transferId };
}
