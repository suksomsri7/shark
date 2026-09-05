// ops/finance-write.ts — WRITE ของงานการเงิน / เช็ค / ภาษีหัก ณ ที่จ่าย (WO D1)
//
// 15 op: ช่องทางการเงิน (สร้าง · แก้ · ปิดใช้งาน · ยอดยกมา) · โอนระหว่างช่องทาง ·
//        เงินสดย่อย (เติม · เบิกชดเชย) · เช็ค (ออก · นำฝาก · เรียกเก็บ · เด้ง · ยกเลิก) ·
//        50 ทวิ (ออกใบ · ทำเครื่องหมายนำส่ง · ยกเลิกเครื่องหมายนำส่ง)
// (การอ่านทั้งหมดอยู่ที่ `finance-read.ts` ของ WO B3 แล้ว — ที่นี่ไม่ทำซ้ำ)
//
// 🔴 กติกาของชั้นนี้ (เหมือน `payments-write.ts` + ข้อเฉพาะของ "ช่องทางเงิน/เช็ค"):
//   1) ห้ามแตะ prisma ตรง ๆ (fitness F5) · ผลลัพธ์ผ่าน `../serialize-finance.ts` เท่านั้น
//   2) service ส่วนใหญ่คืน `{ ok:false, reason }` แทนการโยน ⇒ แปลงเป็น HTTP ที่นี่:
//      · ข้อความที่ `mapError` จับคำได้ (ขึ้นต้น "ไม่พบ" ฯลฯ) → `throw new Error(reason)` พอ
//      · ข้อความที่จับคำไม่ถึงแต่ความหมายคือ "สถานะไม่ให้ทำ"/"ทำไปแล้ว" → โยน `ApiError` ตรง ๆ
//        (ห้ามไปแก้ข้อความใน service — ข้อความเดียวกันนั้นขึ้นบนหน้าจอผู้ใช้อยู่)
//   3) **ลำดับสถานะของเช็คถูกบังคับที่นี่ ไม่ใช่ที่ service**: service ยอมให้ทางลัดบางเส้นที่หน้าจอ
//      ต้องการ (เคลียร์เช็คที่ยังไม่นำฝาก · ทำเช็คที่เรียกเก็บแล้วให้เด้ง) เพราะพนักงานเห็นของจริง
//      ตรงหน้าและแก้ให้ตรงความจริงได้ · แต่ **แอปภายนอกไม่มีตาแบบนั้น** — ยิงผิดลำดับคือบั๊กของ
//      ผู้เชื่อมต่อ ไม่ใช่การแก้ข้อมูล ⇒ REST ตรวจ direction+status ก่อนเสมอ แล้วตอบ 409 state_conflict
//   4) **โอนเกินยอดคงเหลือถูกปฏิเสธที่นี่**: `transferBetweenFinance` ไม่ตรวจยอด (ยอมติดลบ) —
//      ยอมได้บนหน้าจอที่คนมองเห็นตัวเลข แต่ผ่าน API แปลว่าสคริปต์คำนวณผิด ⇒ กันไว้ก่อนดีกว่า
//      ปล่อยให้บัญชีเงินสดติดลบเงียบ ๆ · ⚠️ ด่านนี้เป็น read-then-write (ไม่ได้ล็อกแถว) ⇒ กันความ
//      ผิดพลาดของผู้เรียก ไม่ใช่กันการแข่งกัน · การรับประกันที่แท้จริงยังเป็นงบทดลองของ GL
//   5) เงินเป็นสตางค์จำนวนเต็มเสมอ · วันที่เป็น `YYYY-MM-DD` (วันไทย) · body ทุกตัว `.strict()`

import { createHash } from "node:crypto";
import type { AccountChequeStatus, AccountFinanceType } from "@prisma/client";
import { z } from "zod";
import {
  CHEQUE_STATUS_LABEL,
  bounceCheque,
  clearCheque,
  createCheque,
  depositCheque,
  getChequeRowV2,
  voidCheque,
  type ChequeRowV2,
} from "../../cheque";
import { ERR } from "../../errors";
import {
  addFinanceOpeningEntry,
  archiveFinanceAccount,
  createFinanceAccount,
  financeLedgerCodes,
  getFinanceAccountBalance,
  listFinanceOpeningEntries,
  transferBetweenFinance,
  updateFinanceAccount,
  type BankSubtype,
} from "../../finance";
import { reimbursePettyCash, topUpPettyCash } from "../../finance-overview";
import { issueWhtCert, markFiled, unmarkFiled } from "../../wht";
import type { ApiActor } from "../actor";
import { defineOp, type ApiOp } from "../op";
import { ApiError } from "../respond";
import { chequeRowView, financeAccountWriteView } from "../serialize-finance";
import { toWhtIncomeType, whtIncomeTypeField } from "../wht-income";

// ── ตัวช่วยร่วม ─────────────────────────────────────────────────────────────

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

const ymdField = (what: string) =>
  z
    .string()
    .regex(YMD, `${what} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`)
    .describe(`${what} (Thai calendar day, YYYY-MM-DD).`);

const idField = (what: string) => z.string().min(1).max(40).describe(what);

const noBody = z.object({}).strict();

/** `YYYY-MM-DD` (วันไทย) → เที่ยงวันไทยของวันนั้น — เที่ยงกันวันเพี้ยนตอนแปลงกลับไปกลับมา */
function dayOf(v: string | null | undefined): Date | undefined {
  return v ? new Date(`${v}T12:00:00+07:00`) : undefined;
}

function notFound(message_th: string): ApiError {
  return new ApiError(404, "not_found", message_th, "The requested record was not found in this accounting book.");
}

function stateConflict(message_th: string): ApiError {
  return new ApiError(409, "state_conflict", message_th, "The record is not in a state that allows this operation.");
}

function duplicate(message_th: string): ApiError {
  return new ApiError(409, "duplicate", message_th, "A conflicting record already exists.");
}

/** `{ ok:false, reason }` ทั่วไป → ปล่อยให้ `mapError` จับคำไทยเอง (ไม่พบ → 404 · อื่น ๆ → 422) */
function failWith(reason: string): never {
  throw new Error(reason);
}

/**
 * คีย์กันซ้ำของ "การโอนเงิน" ที่ชั้นบริการ — ผูกกับ (คีย์ที่ยิง, Idempotency-Key ของคำขอ) เสมอ
 * 🔴 `transferId` คือ **primary key ทั้งตาราง** (ไม่ได้แยกตามร้าน) ⇒ ห้ามส่งค่า Idempotency-Key ดิบ
 *    ลงไปตรง ๆ: สองร้านที่บังเอิญใช้ค่าเดียวกัน (เช่น "transfer-1") จะชนกัน แล้ว service มองว่า
 *    "โพสต์ไปแล้ว" → ตอบสำเร็จโดยไม่โอนจริง = เงินหายเงียบ ๆ · sha256 ของคู่ (keyId, idemKey)
 *    ทำให้ค่าคงที่ต่อคำขอเดิม (retry ได้ผลเดิม) แต่ไม่มีทางชนข้ามคีย์
 */
function transferIdOf(keyId: string, idempotencyKey: string | null, requestId: string): string {
  return createHash("sha256").update(`acct-transfer:${keyId}:${idempotencyKey ?? requestId}`).digest("hex").slice(0, 40);
}

/** แถวช่องทางการเงินรูปแบบเดียวกับ B3 (+ช่องที่ตั้งค่าได้) — ใช้เป็นคำตอบของทุก op ที่แก้ช่องทาง */
async function financeAccountResponse(actor: ApiActor, id: string) {
  const row = await getFinanceAccountBalance(actor.tenantId, actor.systemId, id);
  if (!row) throw notFound(ERR.FINANCE_ACCOUNT_NOT_FOUND);
  const [openingEntries, ledgerCodes] = await Promise.all([
    listFinanceOpeningEntries(id),
    financeLedgerCodes(actor.systemId, [row.ledgerAccountId]),
  ]);
  return financeAccountWriteView(row, openingEntries, ledgerCodes);
}

/**
 * ด่าน "เงินพอไหม" ของช่องทางต้นทาง (ดูข้อ 4 ในหัวไฟล์) — คืนแถวต้นทางให้ผู้เรียกใช้ต่อ
 * ไม่พบช่องทาง → 404 (ไม่ปล่อยให้ไปตายกลาง transaction ของ service ด้วยข้อความกว้าง ๆ)
 */
async function assertSourceHasFunds(actor: ApiActor, fromId: string, amountSatang: number): Promise<void> {
  const from = await getFinanceAccountBalance(actor.tenantId, actor.systemId, fromId);
  if (!from) throw notFound(ERR.FINANCE_ACCOUNT_NOT_FOUND);
  if (amountSatang > from.balance) {
    const baht = (from.balance / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
    throw stateConflict(`โอนไม่ได้ — ยอดคงเหลือของ "${from.name}" มีเพียง ฿${baht}`);
  }
}

/** ยอดคงเหลือปัจจุบันของช่องทาง (หลังทำรายการ) — ใช้ตอบกลับให้ผู้เรียกไม่ต้องยิง GET ตาม */
async function balanceOf(actor: ApiActor, id: string): Promise<number> {
  const row = await getFinanceAccountBalance(actor.tenantId, actor.systemId, id);
  if (!row) throw notFound(ERR.FINANCE_ACCOUNT_NOT_FOUND);
  return row.balance;
}

// ── 1. ช่องทางการเงิน ───────────────────────────────────────────────────────

const financeTypeField = z
  .enum(["CASH", "BANK", "E_WALLET", "PETTY_CASH"])
  .describe(
    "Kind of money channel. CASH is a cash box, BANK is a bank account, E_WALLET is a wallet such as TrueMoney, " +
      "PETTY_CASH is a small float handed to staff. The channel code and the matching ledger account are created from this.",
  );

const bankSubtypeField = z
  .enum(["SAVINGS", "CURRENT"])
  .describe("For BANK only: savings or current account. Default SAVINGS.");

const financeAccountFields = {
  code: z.string().max(20).nullish().describe("Channel code. Leave it out and the system issues the next free one, such as BSV001."),
  bankSubtype: bankSubtypeField.nullish(),
  bankName: z.string().max(80).nullish().describe("Bank name as printed on documents, such as KBANK."),
  bankBranch: z.string().max(80).nullish().describe("Branch of the account."),
  accountNo: z.string().max(40).nullish().describe("Bank account number."),
  accountName: z.string().max(120).nullish().describe("Account holder name as registered with the bank."),
  promptpayId: z.string().max(40).nullish().describe("PromptPay id used to build payment QR codes for this channel."),
  note: z.string().max(500).nullish().describe("Free note kept with the channel."),
  useForReceive: z.boolean().optional().describe("Offer this channel when money comes in. Default true."),
  useForPay: z.boolean().optional().describe("Offer this channel when money goes out. Default true."),
  showOnDocuments: z.boolean().optional().describe("Print the account details on invoices so the customer can transfer. Default false."),
  limitSatang: z.number().int().min(0).nullish().describe("Ceiling of the float or the card limit in satang. Informational."),
  holderUserId: idField("Id of the staff member holding this channel, for petty cash boxes.").nullish(),
};

const financeAccountCreateInput = z
  .object({
    type: financeTypeField,
    name: z.string().min(1).max(120).describe("Name shown everywhere, such as Kasikorn savings."),
    ...financeAccountFields,
    openingSatang: z
      .number()
      .int()
      .optional()
      .describe("Opening balance in satang carried over from the old books. A journal entry is posted for it."),
    openingDate: ymdField("openingDate").optional().describe("Date of the opening balance. Default today."),
  })
  .strict();

const financeAccountsCreate = defineOp({
  id: "finance-accounts.create",
  method: "POST",
  path: "/finance-accounts",
  kind: "write",
  action: "account.finance.manage",
  summary:
    "Add a cash box, bank account, wallet or petty cash float. A child ledger account is created with it, and the opening balance is posted as a journal entry.",
  label: "เพิ่มช่องทางการเงิน",
  input: financeAccountCreateInput,
  test: "D1-F1.1",
  async handler({ actor, input }) {
    const res = await createFinanceAccount({
      tenantId: actor.tenantId,
      systemId: actor.systemId,
      type: input.type as AccountFinanceType,
      name: input.name,
      code: input.code ?? null,
      bankSubtype: (input.bankSubtype ?? null) as BankSubtype | null,
      bankName: input.bankName ?? null,
      bankBranch: input.bankBranch ?? null,
      accountNo: input.accountNo ?? null,
      accountName: input.accountName ?? null,
      promptpayId: input.promptpayId ?? null,
      note: input.note ?? null,
      useForReceive: input.useForReceive ?? true,
      useForPay: input.useForPay ?? true,
      showOnDocuments: input.showOnDocuments ?? false,
      holderUserId: input.holderUserId ?? null,
      limitSatang: input.limitSatang ?? null,
      openingBalance: input.openingSatang ?? 0,
      openingDate: dayOf(input.openingDate) ?? null,
    });
    if (!res.ok) failWith(res.reason);
    return financeAccountResponse(actor, res.id);
  },
});

const financeAccountUpdateInput = z
  .object({ name: z.string().min(1).max(120).optional(), ...financeAccountFields })
  .strict();

const financeAccountsUpdate = defineOp({
  id: "finance-accounts.update",
  method: "PATCH",
  path: "/finance-accounts/{id}",
  kind: "write",
  action: "account.finance.manage",
  summary:
    "Change the details of one money channel. Fields that are not sent keep their current value. Opening balances are not touched here.",
  label: "แก้ช่องทางการเงิน",
  input: financeAccountUpdateInput,
  test: "D1-F1.6",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    const res = await updateFinanceAccount(actor.tenantId, actor.systemId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.bankSubtype !== undefined ? { bankSubtype: input.bankSubtype as BankSubtype | null } : {}),
      ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
      ...(input.bankBranch !== undefined ? { bankBranch: input.bankBranch } : {}),
      ...(input.accountNo !== undefined ? { accountNo: input.accountNo } : {}),
      ...(input.accountName !== undefined ? { accountName: input.accountName } : {}),
      ...(input.promptpayId !== undefined ? { promptpayId: input.promptpayId } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.useForReceive !== undefined ? { useForReceive: input.useForReceive } : {}),
      ...(input.useForPay !== undefined ? { useForPay: input.useForPay } : {}),
      ...(input.showOnDocuments !== undefined ? { showOnDocuments: input.showOnDocuments } : {}),
      ...(input.holderUserId !== undefined ? { holderUserId: input.holderUserId } : {}),
      ...(input.limitSatang !== undefined ? { limitSatang: input.limitSatang } : {}),
    });
    if (!res.ok) failWith(res.reason);
    return financeAccountResponse(actor, id);
  },
});

const financeAccountsArchive = defineOp({
  id: "finance-accounts.archive",
  method: "DELETE",
  path: "/finance-accounts/{id}",
  kind: "write",
  action: "account.finance.manage",
  summary:
    "Retire a money channel. Nothing is deleted: past entries stay in the books. A channel with a balance left, or one used for a payment this month, is refused.",
  label: "ปิดใช้งานช่องทางการเงิน",
  input: noBody,
  test: "D1-F1.14",
  async handler({ actor, params }) {
    const id = params.id ?? "";
    const res = await archiveFinanceAccount(actor.tenantId, actor.systemId, id);
    if (!res.ok) {
      // "ปิดใช้งานไม่ได้ — ยอดคงเหลือ…/มีรายการชำระ…" ไม่มีคำที่ mapError จับได้ แต่คือสถานะไม่ให้ทำ
      if (res.reason.startsWith("ไม่พบ")) throw notFound(res.reason);
      throw stateConflict(res.reason);
    }
    return { id, archived: true };
  },
});

const openingInput = z
  .object({
    date: ymdField("date"),
    amountSatang: z
      .number()
      .int()
      .describe("Opening amount in satang. Negative means the channel was overdrawn when the books were taken over."),
    note: z.string().max(200).nullish().describe("What this opening line is, such as which old book it came from."),
  })
  .strict();

const financeAccountsAddOpening = defineOp({
  id: "finance-accounts.add-opening",
  method: "POST",
  path: "/finance-accounts/{id}/opening",
  kind: "write",
  action: "account.finance.manage",
  summary:
    "Add one opening balance line to a money channel. Each line becomes its own journal entry, so a channel taken over from several old books keeps them apart.",
  label: "เพิ่มยอดยกมาของช่องทาง",
  input: openingInput,
  test: "D1-F1.7",
  async handler({ actor, params, input }) {
    const res = await addFinanceOpeningEntry(actor.tenantId, actor.systemId, params.id ?? "", {
      date: dayOf(input.date) as Date,
      amountSatang: input.amountSatang,
      note: input.note ?? null,
    });
    if (!res.ok) failWith(res.reason);
    return { seq: res.seq };
  },
});

// ── 2. โอนระหว่างช่องทาง ────────────────────────────────────────────────────

const transferInput = z
  .object({
    fromId: idField("Id of the channel the money leaves."),
    toId: idField("Id of the channel the money lands in."),
    amountSatang: z.number().int().positive().describe("Amount moved in satang. 5,000.00 baht is 500000."),
    date: ymdField("date").optional().describe("Date of the transfer. Default today."),
    note: z.string().max(200).nullish().describe("Why the money was moved."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.fromId === v.toId) {
      ctx.addIssue({ code: "custom", path: ["toId"], message: "บัญชีต้นทางและปลายทางต้องต่างกัน" });
    }
  });

const financeTransfer = defineOp({
  id: "finance.transfer",
  method: "POST",
  path: "/finance-transfers",
  kind: "write",
  action: "account.finance.manage",
  summary:
    "Move money between two of your own channels, such as a cash deposit into the bank. One journal entry is posted. Sending the same Idempotency-Key again returns the first transfer instead of moving the money twice.",
  label: "โอนเงินระหว่างช่องทาง",
  input: transferInput,
  test: "D1-F1.8",
  async handler({ actor, input, idempotencyKey, requestId }) {
    await assertSourceHasFunds(actor, input.fromId, input.amountSatang);
    const transferId = transferIdOf(actor.keyId, idempotencyKey, requestId);
    const res = await transferBetweenFinance(actor.tenantId, actor.systemId, {
      transferId,
      fromId: input.fromId,
      toId: input.toId,
      amount: input.amountSatang,
      date: dayOf(input.date),
      note: input.note ?? null,
      // คีย์ API ไม่ใช่ "คน" — คอลัมน์นี้ชี้ไปที่ผู้ใช้จริงเท่านั้น (ผู้ลงมือถูกบันทึกใน audit log แทน)
      createdById: null,
    });
    if (!res.ok) failWith(res.reason);
    return { transferId };
  },
});

// ── 3. เงินสดย่อย ───────────────────────────────────────────────────────────

const topUpInput = z
  .object({
    pettyId: idField("Id of the petty cash box being filled. It must be a PETTY_CASH channel."),
    sourceFinanceAccountId: idField("Id of the bank account or cash box the money comes from."),
    amountSatang: z.number().int().positive().describe("Amount put into the box, in satang."),
    date: ymdField("date").optional().describe("Date of the top up. Default today."),
    note: z.string().max(200).nullish().describe("Note kept on the transfer."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.pettyId === v.sourceFinanceAccountId) {
      ctx.addIssue({ code: "custom", path: ["sourceFinanceAccountId"], message: "บัญชีต้นทางและปลายทางต้องต่างกัน" });
    }
  });

const pettyCashTopUp = defineOp({
  id: "petty-cash.top-up",
  method: "POST",
  path: "/petty-cash/top-up",
  kind: "write",
  action: "account.finance.manage",
  summary: "Put money into a petty cash box from a bank account or cash box. Booked as a transfer between the two channels.",
  label: "เติมเงินสดย่อย",
  input: topUpInput,
  test: "D1-F1.12",
  async handler({ actor, input, idempotencyKey, requestId }) {
    await assertSourceHasFunds(actor, input.sourceFinanceAccountId, input.amountSatang);
    const res = await topUpPettyCash(actor.tenantId, actor.systemId, {
      pettyId: input.pettyId,
      sourceFinanceId: input.sourceFinanceAccountId,
      amount: input.amountSatang,
      date: dayOf(input.date),
      note: input.note ?? null,
      transferId: transferIdOf(actor.keyId, idempotencyKey, requestId),
    });
    if (!res.ok) failWith(res.reason);
    return { ok: true, balanceSatang: await balanceOf(actor, input.pettyId) };
  },
});

const reimburseInput = z
  .object({
    paymentId: idField("Id of the expense payment that was paid out of the petty cash box. Take it from the payments of the expense document."),
    sourceFinanceAccountId: idField("Id of the bank account or cash box that refills the box."),
    date: ymdField("date").optional().describe("Date of the refill. Default today."),
    note: z.string().max(200).nullish().describe("Note kept on the transfer."),
  })
  .strict();

const pettyCashReimburse = defineOp({
  id: "petty-cash.reimburse",
  method: "POST",
  path: "/petty-cash/reimburse",
  kind: "write",
  action: "account.finance.manage",
  summary:
    "Refill a petty cash box by exactly one expense that was paid out of it, so the float returns to its ceiling. The same expense cannot be claimed twice.",
  label: "เบิกชดเชยเงินสดย่อย",
  input: reimburseInput,
  test: "D1-F1.13",
  async handler({ actor, input }) {
    const res = await reimbursePettyCash(actor.tenantId, actor.systemId, {
      paymentId: input.paymentId,
      sourceFinanceId: input.sourceFinanceAccountId,
      date: dayOf(input.date),
      note: input.note ?? null,
    });
    if (!res.ok) {
      // "รายการนี้เบิกชดเชยไปแล้ว" / "รายการจ่ายนี้ถูกยกเลิกแล้ว" = สถานะไม่ให้ทำ (mapError จับคำไม่ถึง)
      if (res.reason.startsWith("ไม่พบ")) throw notFound(res.reason);
      if (res.reason.includes("แล้ว")) throw stateConflict(res.reason);
      failWith(res.reason);
    }
    return { ok: true, balanceSatang: await balanceOf(actor, res.pettyId) };
  },
});

// ── 4. เช็ค ─────────────────────────────────────────────────────────────────

const chequeCreateInput = z
  .object({
    direction: z
      .enum(["IN", "OUT"])
      .describe("IN is a cheque you received from a customer, OUT is a cheque you wrote to a vendor."),
    chequeNo: z.string().min(1).max(40).describe("Cheque number as printed on the cheque."),
    bankName: z.string().min(1).max(80).describe("Bank that the cheque is drawn on."),
    bankBranch: z.string().max(80).nullish().describe("Branch printed on the cheque."),
    chequeDate: ymdField("chequeDate").describe("Date written on the cheque, which is when it can be banked."),
    amountSatang: z.number().int().positive().describe("Face value of the cheque in satang."),
    financeAccountId: idField("Id of the bank account the cheque will be banked into or drawn from.").nullish(),
    documentId: idField("Id of the invoice or purchase this cheque settles. The document balance moves when the cheque is registered.").nullish(),
    note: z.string().max(200).nullish().describe("Note kept with the cheque."),
  })
  .strict();

const chequesCreate = defineOp({
  id: "cheques.create",
  method: "POST",
  path: "/cheques",
  kind: "write",
  action: "account.cheque.manage",
  summary:
    "Register a cheque in the cheque book. A received cheque starts on hand, an issued cheque starts as issued, and the money only reaches the bank account when the cheque clears.",
  label: "บันทึกเช็ค",
  input: chequeCreateInput,
  test: "D1-F2.1",
  async handler({ actor, input }) {
    const res = await createCheque({
      tenantId: actor.tenantId,
      systemId: actor.systemId,
      direction: input.direction,
      chequeNo: input.chequeNo,
      bankName: input.bankName,
      bankBranch: input.bankBranch ?? null,
      chequeDate: dayOf(input.chequeDate) as Date,
      amount: input.amountSatang,
      financeAccountId: input.financeAccountId ?? null,
      documentId: input.documentId ?? null,
      note: input.note ?? null,
    });
    if (!res.ok) failWith(res.reason);
    return chequeResponse(actor, res.id);
  },
});

/** แถวเช็คหลังเปลี่ยนสถานะ — service คืนแค่ `{ ok }` ⇒ อ่านกลับมาส่งให้ผู้เรียกเห็นสถานะจริง */
async function chequeResponse(actor: ApiActor, id: string) {
  const row = await getChequeRowV2(actor.tenantId, actor.systemId, id);
  if (!row) throw notFound(ERR.CHEQUE_NOT_FOUND);
  return chequeRowView(row);
}

/** สถานะที่แต่ละคำสั่งยอมรับ (ดูข้อ 3 ในหัวไฟล์) — ไม่ตรง = 409 พร้อมบอกสถานะปัจจุบันเป็นภาษาคน */
async function chequeInState(
  actor: ApiActor,
  id: string,
  allow: (c: ChequeRowV2) => boolean,
  expected: string,
): Promise<ChequeRowV2> {
  const cq = await getChequeRowV2(actor.tenantId, actor.systemId, id);
  if (!cq) throw notFound(ERR.CHEQUE_NOT_FOUND);
  if (!allow(cq)) {
    throw stateConflict(`${expected} — เช็คใบนี้สถานะ "${CHEQUE_STATUS_LABEL[cq.status as AccountChequeStatus]}"`);
  }
  return cq;
}

const chequesDeposit = defineOp({
  id: "cheques.deposit",
  method: "POST",
  path: "/cheques/{id}/deposit",
  kind: "write",
  action: "account.cheque.deposit",
  summary: "Bank a received cheque. Nothing is posted to the ledger yet because the money has not arrived; only the cheque status moves.",
  label: "นำฝากเช็ค",
  input: z
    .object({ depositedAt: ymdField("depositedAt").optional().describe("Day the cheque was handed to the bank. Default today.") })
    .strict(),
  test: "D1-F2.4",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    await chequeInState(actor, id, (c) => c.direction === "IN" && c.status === "ON_HAND", "นำฝากได้เฉพาะเช็ครับที่ยังไม่นำฝาก");
    const res = await depositCheque(actor.tenantId, actor.systemId, id, dayOf(input.depositedAt));
    if (!res.ok) failWith(res.reason);
    return chequeResponse(actor, id);
  },
});

const chequesClear = defineOp({
  id: "cheques.clear",
  method: "POST",
  path: "/cheques/{id}/clear",
  kind: "write",
  action: "account.cheque.clear",
  summary:
    "Mark a cheque as cleared. This is the moment the money really moves: a received cheque credits the bank account, an issued cheque debits it.",
  label: "เช็คเรียกเก็บได้",
  input: z
    .object({ clearedDate: ymdField("clearedDate").optional().describe("Day the bank cleared it. Default today.") })
    .strict(),
  test: "D1-F2.5",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    await chequeInState(
      actor,
      id,
      (c) => (c.direction === "IN" ? c.status === "DEPOSITED" : c.status === "ISSUED"),
      "เรียกเก็บได้เฉพาะเช็ครับที่นำฝากแล้ว หรือเช็คจ่ายที่ยังไม่ถูกเรียกเก็บ",
    );
    const res = await clearCheque(actor.tenantId, actor.systemId, id, dayOf(input.clearedDate));
    if (!res.ok) failWith(res.reason);
    return chequeResponse(actor, id);
  },
});

const chequesBounce = defineOp({
  id: "cheques.bounce",
  method: "POST",
  path: "/cheques/{id}/bounce",
  kind: "write",
  action: "account.cheque.bounce",
  summary:
    "Record that a received cheque was returned unpaid. The ledger effect is reversed and the customer owes the money again.",
  label: "เช็คเด้ง",
  input: z
    .object({ reason: z.string().max(200).nullish().describe("What the bank gave as the reason, kept on the cheque.") })
    .strict(),
  test: "D1-F2.7",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    await chequeInState(
      actor,
      id,
      (c) => c.direction === "IN" && (c.status === "ON_HAND" || c.status === "DEPOSITED"),
      "ทำเด้งได้เฉพาะเช็ครับที่ยังไม่ถูกเรียกเก็บ",
    );
    const res = await bounceCheque(actor.tenantId, actor.systemId, id, input.reason ?? undefined);
    if (!res.ok) failWith(res.reason);
    return chequeResponse(actor, id);
  },
});

const chequesVoid = defineOp({
  id: "cheques.void",
  method: "POST",
  path: "/cheques/{id}/void",
  kind: "danger",
  action: "account.cheque.void",
  summary:
    "Cancel an issued cheque that has not been presented, for example one written with the wrong amount. The ledger effect is reversed and the vendor is owed again.",
  label: "ยกเลิกเช็คจ่าย",
  input: z
    .object({
      reason: z
        .string()
        .min(5)
        .max(500)
        .describe("Why the cheque is being cancelled, at least 5 characters. Kept on the cheque and in the audit log."),
    })
    .strict(),
  test: "D1-F2.9",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    await chequeInState(
      actor,
      id,
      (c) => c.direction === "OUT" && c.status === "ISSUED",
      "ยกเลิกได้เฉพาะเช็คจ่ายที่ยังไม่ถูกเรียกเก็บ",
    );
    const res = await voidCheque(actor.tenantId, actor.systemId, id, input.reason);
    if (!res.ok) failWith(res.reason);
    return chequeResponse(actor, id);
  },
});

// ── 5. ภาษีหัก ณ ที่จ่าย ────────────────────────────────────────────────────

const whtCertInput = z
  .object({
    paymentId: idField("Id of the payment to a vendor that had withholding tax deducted. Take it from the payments of the expense document."),
    whtIncomeType: whtIncomeTypeField,
    whtRateBp: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .nullish()
      .describe("Rate in basis points: 300 = 3%. Only needed when the payment itself did not record a rate."),
  })
  .strict();

const whtIssueCert = defineOp({
  id: "wht.issue-cert",
  method: "POST",
  path: "/wht/certs",
  kind: "write",
  action: "account.wht.manage",
  summary:
    "Issue the withholding tax certificate (form 50 tawi) for one payment that had tax deducted. The tax was already booked when the payment was recorded, so this only produces the certificate. One payment can only have one.",
  label: "ออกหนังสือรับรองหัก ณ ที่จ่าย",
  input: whtCertInput,
  test: "D1-F3.2",
  async handler({ actor, input }) {
    const res = await issueWhtCert(actor.tenantId, actor.systemId, {
      paymentId: input.paymentId,
      whtIncomeType: toWhtIncomeType(input.whtIncomeType),
      whtRateBp: input.whtRateBp ?? null,
      createdById: null,
    });
    if (!res.ok) {
      // "ออก 50 ทวิ ให้รายการนี้แล้ว" = มีใบอยู่แล้ว (ไม่ใช่คำขอผิดรูป) ⇒ 409 duplicate
      if (res.reason.includes("ออก 50 ทวิ ให้รายการนี้แล้ว")) throw duplicate(res.reason);
      if (res.reason.includes("ถูกยกเลิกแล้ว")) throw stateConflict(res.reason);
      failWith(res.reason);
    }
    return { certId: res.certId, docNo: res.docNo };
  },
});

const formField = z
  .union([z.literal(3), z.literal(53)])
  .describe("Which return the certificates go on: 3 for payments to individuals, 53 for payments to companies.");

const periodField = z
  .string()
  .regex(YM, "period ต้องเป็นเดือนรูปแบบ YYYY-MM (01-12)")
  .describe("Month being filed, `YYYY-MM`. Certificates are grouped by the day the money was paid.");

const markFiledInput = z
  .object({
    form: formField,
    period: periodField,
    note: z.string().max(200).nullish().describe("How it was filed, for example through the e-filing site."),
  })
  .strict();

const whtMarkFiled = defineOp({
  id: "wht.mark-filed",
  method: "POST",
  path: "/wht/filings",
  kind: "write",
  action: "account.wht.manage",
  summary:
    "Mark one month of withholding tax certificates as filed with the Revenue Department, and stamp every certificate in it. The totals are recomputed from the certificates each time, so sending it twice is safe.",
  label: "ทำเครื่องหมายนำส่ง ภ.ง.ด.",
  input: markFiledInput,
  test: "D1-F3.4",
  async handler({ actor, input }) {
    const res = await markFiled(actor.tenantId, actor.systemId, {
      form: input.form,
      periodKey: input.period,
      filedById: null,
      note: input.note ?? null,
    });
    if (!res.ok) failWith(res.reason);
    return { certCount: res.certCount, totalBaseSatang: res.totalBaseSatang, totalTaxSatang: res.totalTaxSatang };
  },
});

const whtUnmarkFiled = defineOp({
  id: "wht.unmark-filed",
  method: "DELETE",
  path: "/wht/filings/{form}/{period}",
  kind: "danger",
  action: "account.wht.unmark",
  summary:
    "Undo the filed mark of one month, for example when the wrong month was filed. The certificates in it go back to unfiled.",
  label: "ยกเลิกเครื่องหมายนำส่ง ภ.ง.ด.",
  input: z
    .object({
      reason: z
        .string()
        .min(5)
        .max(500)
        .describe("Why the filed mark is being removed, at least 5 characters. Kept in the audit log."),
    })
    .strict(),
  test: "D1-F3.7",
  async handler({ actor, params }) {
    const rawForm = params.form ?? "";
    const period = params.period ?? "";
    if (rawForm !== "3" && rawForm !== "53") {
      throw new ApiError(422, "validation", "แบบ ภ.ง.ด. ต้องเป็น 3 หรือ 53", "The form must be 3 or 53.");
    }
    if (!YM.test(period)) {
      throw new ApiError(422, "validation", "งวดต้องเป็นเดือนรูปแบบ YYYY-MM (01-12)", "The period must be a month in `YYYY-MM` form.");
    }
    const res = await unmarkFiled(actor.tenantId, actor.systemId, { form: rawForm === "3" ? 3 : 53, periodKey: period });
    if (!res.ok) {
      if (res.reason.includes("ยังไม่ได้ทำเครื่องหมาย")) throw notFound(res.reason);
      failWith(res.reason);
    }
    return { ok: true };
  },
});

export const FINANCE_WRITE_OPS: ApiOp[] = [
  financeAccountsCreate,
  financeAccountsUpdate,
  financeAccountsArchive,
  financeAccountsAddOpening,
  financeTransfer,
  pettyCashTopUp,
  pettyCashReimburse,
  chequesCreate,
  chequesDeposit,
  chequesClear,
  chequesBounce,
  chequesVoid,
  whtIssueCert,
  whtMarkFiled,
  whtUnmarkFiled,
];
