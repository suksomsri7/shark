import { prisma } from "@/lib/core/db";
import type { AccountFinanceType, Prisma } from "@prisma/client";
// posting engine (owner = GL-Core, ไฟล์ gl.ts) — subagent แค่ import + เรียกตามลายเซ็น
// GL-P2P3 เพิ่ม postManualJV / postOpening (เรียกตามลายเซ็นที่ประกาศไว้)
import { ensureAccounting, postManualJV, postOpening } from "./gl";

// ─────────────────────────────────────────────────────────────
// finance.ts — การเงิน (บัญชีเงิน) — §3.5 (P2)
// AccountFinance CRUD (CASH/BANK/E_WALLET/PETTY_CASH) + สร้างบัญชีลูก GL อัตโนมัติ
// (ใต้ 1000/1010/1020/1030) + openingBalance → gl.postOpening ผูก ledgerAccountId
// statement (จาก AccountJournalLine ของ ledgerAccountId) + ยอดคงเหลือ
// โอนระหว่างบัญชีเงิน (gl.postManualJV) + petty cash เติม/เบิกชดเชย
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

// ─────────────────── อ่าน ───────────────────

export function listFinanceAccounts(tenantId: string, systemId: string) {
  return prisma.accountFinance.findMany({
    where: { tenantId, systemId, archivedAt: null },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
}

export function getFinanceAccount(tenantId: string, systemId: string, id: string) {
  return prisma.accountFinance.findFirst({ where: { id, tenantId, systemId } });
}

/** ยอดคงเหลือปัจจุบันของทุกบัญชีเงิน (asset: Σdebit − Σcredit ของ ledger ที่ผูก) */
export async function financeBalances(
  tenantId: string,
  systemId: string,
): Promise<Array<{
  id: string;
  name: string;
  type: AccountFinanceType;
  bankName: string | null;
  accountNo: string | null;
  ledgerAccountId: string | null;
  balance: number;
}>> {
  const accounts = await listFinanceAccounts(tenantId, systemId);
  const ledgerIds = accounts
    .map((a) => a.ledgerAccountId)
    .filter((x): x is string => !!x);

  const sums = ledgerIds.length
    ? await prisma.accountJournalLine.groupBy({
        by: ["accountId"],
        where: { systemId, accountId: { in: ledgerIds } },
        _sum: { debit: true, credit: true },
      })
    : [];
  // reversal สร้าง entry ตรงข้าม + ทำ entry เดิม REVERSED (แต่บรรทัดยังอยู่) → รวมทั้งหมด = ยอดสุทธิถูก
  const balByLedger = new Map(
    sums.map((s) => [s.accountId, (s._sum.debit ?? 0) - (s._sum.credit ?? 0)]),
  );

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    bankName: a.bankName,
    accountNo: a.accountNo,
    ledgerAccountId: a.ledgerAccountId,
    balance: a.ledgerAccountId ? balByLedger.get(a.ledgerAccountId) ?? 0 : 0,
  }));
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

export async function createFinanceAccount(input: {
  tenantId: string;
  systemId: string;
  type: AccountFinanceType;
  name: string;
  bankName?: string | null;
  accountNo?: string | null;
  promptpayId?: string | null;
  openingBalance?: number; // สตางค์
  openingDate?: Date | null;
  showOnDocuments?: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!input.name.trim()) return { ok: false, reason: "กรุณากรอกชื่อบัญชี" };
  const ctx = { tenantId: input.tenantId, systemId: input.systemId };
  const opening = Math.round(input.openingBalance ?? 0);
  try {
    const id = await prisma.$transaction(async (tx) => {
      await ensureAccounting(ctx, tx);
      const ledgerAccountId = await createChildLedger(tx, ctx, input.type, input.name.trim());
      const fa = await tx.accountFinance.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          type: input.type,
          name: input.name.trim(),
          bankName: input.bankName ?? null,
          accountNo: input.accountNo ?? null,
          promptpayId: input.promptpayId ?? null,
          openingBalance: opening,
          openingDate: input.openingDate ?? null,
          ledgerAccountId,
          showOnDocuments: input.showOnDocuments ?? false,
        },
        select: { id: true },
      });
      // ยอดยกมา → OPENING (บัญชีคู่ 3999 balancer จัดการฝั่ง gl — ledger-M6)
      if (opening !== 0) {
        await postOpening(
          ctx,
          {
            date: input.openingDate ?? new Date(),
            lines: [{ accountId: ledgerAccountId, debit: opening, credit: 0 }],
          },
          tx,
        );
      }
      return fa.id;
    });
    return { ok: true, id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "สร้างบัญชีเงินไม่สำเร็จ" };
  }
}

/** แก้ข้อมูลบัญชีเงิน (metadata) — ยอดยกมาที่โพสต์แล้ว immutable ไม่แก้ผ่านนี้ */
export async function updateFinanceAccount(
  tenantId: string,
  systemId: string,
  id: string,
  input: {
    name?: string;
    bankName?: string | null;
    accountNo?: string | null;
    promptpayId?: string | null;
    showOnDocuments?: boolean;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fa = await prisma.accountFinance.findFirst({ where: { id, tenantId, systemId } });
  if (!fa) return { ok: false, reason: "ไม่พบบัญชีเงิน" };
  const name = input.name?.trim();
  await prisma.$transaction(async (tx) => {
    await tx.accountFinance.update({
      where: { id },
      data: {
        name: name || fa.name,
        bankName: input.bankName ?? fa.bankName,
        accountNo: input.accountNo ?? fa.accountNo,
        promptpayId: input.promptpayId ?? fa.promptpayId,
        showOnDocuments: input.showOnDocuments ?? fa.showOnDocuments,
      },
    });
    // sync ชื่อบัญชีลูก GL ให้ตรง
    if (name && fa.ledgerAccountId) {
      await tx.accountLedger.update({ where: { id: fa.ledgerAccountId }, data: { name } });
    }
  });
  return { ok: true };
}

export async function archiveFinanceAccount(tenantId: string, systemId: string, id: string) {
  const fa = await prisma.accountFinance.findFirst({ where: { id, tenantId, systemId } });
  if (!fa) return { ok: false as const, reason: "ไม่พบบัญชีเงิน" };
  await prisma.accountFinance.update({ where: { id }, data: { archivedAt: new Date() } });
  return { ok: true as const };
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

export async function transferBetweenFinance(
  tenantId: string,
  systemId: string,
  input: { fromId: string; toId: string; amount: number; date?: Date; note?: string | null },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const amount = Math.round(input.amount);
  if (input.fromId === input.toId) return { ok: false, reason: "บัญชีต้นทางและปลายทางต้องต่างกัน" };
  if (amount <= 0) return { ok: false, reason: "จำนวนเงินต้องมากกว่า 0" };
  const ctx = { tenantId, systemId };
  try {
    await prisma.$transaction(async (tx) => {
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
      // เงินออกจากต้นทาง (Cr) → เข้าปลายทาง (Dr)
      await postManualJV(
        ctx,
        {
          date: input.date ?? new Date(),
          memo: input.note ?? `โอนเงิน ${from.name} → ${to.name}`,
          lines: [
            { accountId: toLedger, debit: amount, credit: 0 },
            { accountId: fromLedger, debit: 0, credit: amount },
          ],
        },
        tx,
      );
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "โอนเงินไม่สำเร็จ" };
  }
}

/**
 * petty cash เติมเงิน / เบิกชดเชย — ย้ายเงินจากบัญชี counter (ธนาคาร/เงินสด) เข้าบัญชี PETTY_CASH
 * (บัญชีลงเหมือนการโอน — ทั้งเติมและเบิกชดเชยคือเงินไหลเข้าสำรองจ่าย)
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
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const petty = await prisma.accountFinance.findFirst({
    where: { id: input.pettyId, tenantId, systemId },
    select: { type: true },
  });
  if (!petty) return { ok: false, reason: "ไม่พบบัญชีสำรองจ่าย" };
  if (petty.type !== "PETTY_CASH") return { ok: false, reason: "บัญชีปลายทางต้องเป็นเงินสำรองจ่าย" };
  const memo =
    input.note ?? (input.kind === "REIMBURSE" ? "เบิกชดเชยเงินสำรองจ่าย" : "เติมเงินสำรองจ่าย");
  return transferBetweenFinance(tenantId, systemId, {
    fromId: input.counterFinanceId,
    toId: input.pettyId,
    amount: input.amount,
    date: input.date,
    note: memo,
  });
}
