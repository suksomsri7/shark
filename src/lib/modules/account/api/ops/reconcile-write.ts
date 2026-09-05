// ops/reconcile-write.ts — WRITE กระทบยอดธนาคาร (WO D3): นำเข้า statement · จับคู่อัตโนมัติ/มือ ·
//                          ยกเลิกจับคู่ · ข้ามแถว · สร้างรายการค่าธรรมเนียม/ดอกเบี้ย · ยืนยัน/เปิดกลับเดือน
//
// (การอ่านทั้งหมด — channels/get — อยู่ที่ `finance-read.ts` ของ WO B3 แล้ว ที่นี่ไม่ทำซ้ำ)
//
// 🔴 กติกาของชั้นนี้ (เหมือน `finance-write.ts`):
//   1) ห้ามแตะ prisma ตรง ๆ (fitness F5) — ทุกอย่างผ่าน `../../reconcile.ts`
//   2) service คืน `{ ok:false, reason }` เกือบทุกจุด — ข้อความ "…แล้ว" (เดือนยืนยันไปแล้ว/จับคู่ไปแล้ว/
//      สร้างรายการไปแล้ว ฯลฯ) คือ "สถานะไม่ให้ทำ" ซึ่ง `mapError` จับคำไม่ถึง (ไม่มีคำว่า "ร่าง"/"สถานะ")
//      ⇒ ต้องโยน `ApiError` 409 state_conflict ตรง ๆ ที่นี่ (ดู `failReconcile`) — ตรงตามสัญญา D3:
//      "แก้แถวหลังยืนยันเดือน → 409 state_conflict"
//   3) userId ของ service ทุกจุด = `null` (คีย์ API ไม่ใช่ "คน" — ผู้ลงมือบันทึกใน audit log ของ dispatch)
//   4) เงินเป็นสตางค์จำนวนเต็มเสมอ · เดือนเป็น `YYYY-MM` · path param `{id}` = id ของแถว statement/statement
//      ยกเว้น confirm/reopen ที่ path param คือ `{period}`

import { z } from "zod";
import type { BankSource } from "../../bank-statement-csv";
import {
  autoMatch,
  confirmMonth,
  createEntryFromLine,
  importStatement,
  manualMatch,
  previewStatementImport,
  reopenMonth,
  skipLine,
  unmatch,
  type CreateEntryKind,
} from "../../reconcile";
import { defineOp, type ApiOp } from "../op";
import { ApiError } from "../respond";

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const periodField = z.string().regex(YM, "period ต้องเป็นเดือนรูปแบบ YYYY-MM");
const bankSourceField = z
  .enum(["KBANK", "SCB", "KTB", "BBL", "GENERIC"])
  .describe("Bank statement column layout to parse the file with.");
const noBody = z.object({}).strict();

function notFound(message_th: string): ApiError {
  return new ApiError(404, "not_found", message_th, "The requested record was not found in this accounting book.");
}

function stateConflict(message_th: string): ApiError {
  return new ApiError(409, "state_conflict", message_th, "The record is not in a state that allows this operation.");
}

/**
 * `reconcile.ts` คืนข้อความไทยล้วนเมื่อล้ม — "ไม่พบ…" คือ 404 จริง ๆ (ปล่อยให้ `mapError` เดาเอง
 * ก็ได้ผลเดียวกัน) แต่ "…แล้ว" (ยืนยันไปแล้ว/จับคู่ไปแล้ว/สร้างรายการไปแล้ว/กลับรายการไปแล้ว ฯลฯ)
 * คือ "สถานะไม่ให้ทำซ้ำ" ซึ่งคำไทยพวกนี้ไม่มีคำที่ `mapError` จับได้ (ไม่ใช่ "ร่าง"/"สถานะ"/"ปิดงวด")
 * ⇒ ยกระดับเป็น 409 state_conflict ตรงนี้เสมอ (ครอบทุกจุดของไฟล์นี้ในคำเดียว)
 */
function failReconcile(reason: string): never {
  if (reason.startsWith("ไม่พบ")) throw notFound(reason);
  if (reason.includes("แล้ว")) throw stateConflict(reason);
  throw new Error(reason);
}

// ── นำเข้า statement ──────────────────────────────────────────────────────

const previewStatementInput = z
  .object({
    financeAccountId: z.string().min(1).describe("Id of the bank/e-wallet channel this statement belongs to."),
    period: periodField.describe("Month the statement covers, `YYYY-MM`."),
    source: bankSourceField,
    text: z.string().min(1).max(6_000_000).describe("Raw CSV content of the statement file, UTF-8 (a leading BOM is fine)."),
  })
  .strict();

const reconcilePreviewStatement = defineOp({
  id: "reconcile.preview-statement",
  method: "POST",
  path: "/reconcile/statements/preview",
  kind: "write",
  action: "account.reconcile",
  summary: "Parse a bank statement CSV without saving anything, so the caller can show what would be imported.",
  label: "ตรวจไฟล์ statement ก่อนนำเข้า",
  input: previewStatementInput,
  test: "D3-R1.1",
  async handler({ actor, input }) {
    const res = await previewStatementImport(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      { financeId: input.financeAccountId, periodKey: input.period, source: input.source as BankSource, text: input.text },
    );
    if ("ok" in res) failReconcile(res.reason);
    return {
      source: res.source,
      rows: res.rows.map((r) => ({ date: r.dateText, description: r.description, amountSatang: r.amountSatang, ref: r.refNo })),
      errors: res.errors,
      openingFromFileSatang: res.openingFromFile,
      closingFromFileSatang: res.closingFromFile,
    };
  },
});

const importStatementInput = z
  .object({
    financeAccountId: z.string().min(1),
    period: periodField,
    source: bankSourceField,
    fileName: z.string().min(1).max(200),
    text: z.string().min(1).max(6_000_000),
  })
  .strict();

const reconcileImportStatement = defineOp({
  id: "reconcile.import-statement",
  method: "POST",
  path: "/reconcile/statements",
  kind: "write",
  action: "account.reconcile",
  summary:
    "Import a bank statement CSV for one channel and month. Safe to send the same file again: rows already imported are counted as duplicated instead of imported a second time.",
  label: "นำเข้า statement ธนาคาร",
  input: importStatementInput,
  test: "D3-R1.2",
  async handler({ actor, input }) {
    const res = await importStatement(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      {
        financeId: input.financeAccountId,
        periodKey: input.period,
        source: input.source as BankSource,
        fileName: input.fileName,
        text: input.text,
        userId: null,
      },
    );
    if (!res.ok) failReconcile(res.reason);
    return { statementId: res.statementId, imported: res.imported, duplicated: res.duplicates };
  },
});

// ── จับคู่อัตโนมัติ/มือ ──────────────────────────────────────────────────────

const reconcileAutoMatch = defineOp({
  id: "reconcile.auto-match",
  method: "POST",
  path: "/reconcile/statements/{id}/auto-match",
  kind: "write",
  action: "account.reconcile",
  summary:
    "Re-run automatic matching on one imported statement. Lines already matched, created or skipped by a person are left untouched.",
  label: "จับคู่อัตโนมัติ",
  input: noBody,
  test: "D3-R1.4",
  async handler({ actor, params }) {
    const res = await autoMatch({ tenantId: actor.tenantId, systemId: actor.systemId }, params.id ?? "", null);
    if (!res.ok) failReconcile(res.reason);
    return { matched: res.matched, suggested: res.suggested, unmatched: res.unmatched, skipped: res.skipped, created: res.created };
  },
});

const matchInput = z
  .object({ journalLineId: z.string().min(1).describe("Id of the system journal line, taken from `systemEntries` of `reconcile.get`.") })
  .strict();

const reconcileMatch = defineOp({
  id: "reconcile.match",
  method: "POST",
  path: "/reconcile/lines/{id}/match",
  kind: "write",
  action: "account.reconcile",
  summary: "Manually match one bank statement line to a system journal line. The amounts must be exactly equal.",
  label: "จับคู่รายการด้วยมือ",
  input: matchInput,
  test: "D3-R1.8",
  async handler({ actor, params, input }) {
    const res = await manualMatch(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      { lineId: params.id ?? "", journalLineId: input.journalLineId, userId: null },
    );
    if (!res.ok) failReconcile(res.reason);
    return { ok: true };
  },
});

const reconcileUnmatch = defineOp({
  id: "reconcile.unmatch",
  method: "POST",
  path: "/reconcile/lines/{id}/unmatch",
  kind: "write",
  action: "account.reconcile",
  summary: "Undo a match on one bank statement line. Both sides go back to unmatched.",
  label: "ยกเลิกการจับคู่",
  input: noBody,
  test: "D3-R1.7",
  async handler({ actor, params }) {
    const res = await unmatch({ tenantId: actor.tenantId, systemId: actor.systemId }, { lineId: params.id ?? "", userId: null });
    if (!res.ok) failReconcile(res.reason);
    return { ok: true };
  },
});

const skipInput = z.object({ reason: z.string().max(300).nullish() }).strict();

const reconcileSkip = defineOp({
  id: "reconcile.skip",
  method: "POST",
  path: "/reconcile/lines/{id}/skip",
  kind: "write",
  action: "account.reconcile",
  summary: "Skip one bank statement line, for example a duplicate the bank recorded that has nothing to do with the business.",
  label: "ข้ามรายการ",
  input: skipInput,
  test: "D3-R1.10",
  async handler({ actor, params, input }) {
    const res = await skipLine(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      { lineId: params.id ?? "", reason: input.reason ?? null, userId: null },
    );
    if (!res.ok) failReconcile(res.reason);
    return { ok: true };
  },
});

const createEntryInput = z
  .object({
    kind: z.enum(["FEE", "INTEREST", "OTHER"]).describe("FEE posts to the bank fee account, INTEREST to interest income, OTHER lets you pick the ledger account."),
    accountCode: z.string().max(20).nullish().describe("Ledger account code. Required when kind is OTHER."),
    note: z.string().max(200).nullish(),
  })
  .strict();

const reconcileCreateEntry = defineOp({
  id: "reconcile.create-entry",
  method: "POST",
  path: "/reconcile/lines/{id}/create-entry",
  kind: "write",
  action: "account.reconcile",
  summary:
    "Post a journal entry straight from a bank statement line that has no matching document in the books, such as a bank fee or interest income.",
  label: "สร้างรายการจากแถว statement",
  input: createEntryInput,
  test: "D3-R1.6",
  async handler({ actor, params, input }) {
    const res = await createEntryFromLine(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      { lineId: params.id ?? "", kind: input.kind as CreateEntryKind, accountCode: input.accountCode ?? null, note: input.note ?? null, userId: null },
    );
    if (!res.ok) failReconcile(res.reason);
    return { entryId: res.entryId };
  },
});

// ── ยืนยัน / เปิดกลับเดือน ───────────────────────────────────────────────────

const confirmInput = z.object({ financeAccountId: z.string().min(1) }).strict();

const reconcileConfirm = defineOp({
  id: "reconcile.confirm",
  method: "POST",
  path: "/reconcile/{period}/confirm",
  kind: "write",
  action: "account.reconcile",
  summary: "Confirm bank reconciliation for one channel and month. Only possible when the difference is zero and nothing is left pending.",
  label: "ยืนยันกระทบยอดเดือนนี้",
  input: confirmInput,
  test: "D3-R1.9",
  async handler({ actor, params, input }) {
    const res = await confirmMonth(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      { financeId: input.financeAccountId, periodKey: params.period ?? "", userId: null },
    );
    if (!res.ok) failReconcile(res.reason);
    return { matched: res.matched };
  },
});

const reopenInput = z
  .object({
    financeAccountId: z.string().min(1),
    reason: z.string().min(1).max(300).describe("Why this confirmed month is being reopened. Kept in the audit log."),
  })
  .strict();

const reconcileReopen = defineOp({
  id: "reconcile.reopen",
  method: "POST",
  path: "/reconcile/{period}/reopen",
  kind: "write",
  action: "account.reconcile",
  summary: "Reopen a month that was already confirmed, so its lines can be matched or fixed again.",
  label: "เปิดกลับเดือนที่ยืนยันแล้ว",
  input: reopenInput,
  test: "D3-R1.11",
  async handler({ actor, params, input }) {
    const res = await reopenMonth(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      { financeId: input.financeAccountId, periodKey: params.period ?? "", reason: input.reason, userId: null },
    );
    if (!res.ok) failReconcile(res.reason);
    return { ok: true };
  },
});

export const RECONCILE_WRITE_OPS: ApiOp[] = [
  reconcilePreviewStatement,
  reconcileImportStatement,
  reconcileAutoMatch,
  reconcileMatch,
  reconcileUnmatch,
  reconcileSkip,
  reconcileCreateEntry,
  reconcileConfirm,
  reconcileReopen,
];
