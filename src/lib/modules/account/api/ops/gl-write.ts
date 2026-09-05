// ops/gl-write.ts — WRITE ของสมุดรายวัน / ผังบัญชี / งวดบัญชี / สินทรัพย์ถาวร (WO D2)
//
// 15 op: JV มือ (สร้าง · กลับรายการ · ติดธงต้องตรวจ) · ผังบัญชี (สร้าง · แก้ · เปิด-ปิดใช้งาน) ·
//        การผูกบัญชีอัตโนมัติ (mapping · บัญชีต่อชนิดเอกสาร) · งวด (ปิด · เปิดใหม่ · ยื่น/ยกเลิกยื่น ภ.พ.30) ·
//        สินทรัพย์ (ขึ้นทะเบียน · รันค่าเสื่อม · จำหน่าย)
// (การอ่านทั้งหมดอยู่ที่ `gl-read.ts` ของ WO B4 แล้ว — ที่นี่ไม่ทำซ้ำ)
//
// 🔴 กติกาของชั้นนี้ (ต่อจาก `finance-write.ts` ของ D1 + ข้อเฉพาะของงานบัญชีแยกประเภท):
//   1) ห้ามแตะ prisma ตรง ๆ (fitness F5) · ผลลัพธ์ผ่าน `../serialize-gl.ts` เท่านั้น
//      ⇒ ของที่ผู้เรียกได้จาก "สร้าง/แก้" มีหน้าตาเดียวกับตอนไป GET อ่านทีหลังเป๊ะ
//   2) service ฝั่งนี้คืน error สามแบบไม่เหมือนกัน — แปลงเป็น HTTP ที่นี่ที่เดียว:
//      · `{ ok:false, fields:{...} }` (ผังบัญชี) → 422 `validation` + `details[{path,message}]`
//        ยกเว้น "มีรหัสบัญชี … อยู่แล้ว" ซึ่งแปลว่ามีของอยู่จริง ⇒ 409 `duplicate` (path=code)
//      · `{ ok:false, reason }` ที่ `mapError` จับคำไทยได้ → `failWith(reason)` พอ
//      · `{ ok:false, reason }` ที่ความหมายคือ "ทำไปแล้ว/สถานะไม่ให้ทำ" แต่ไม่มีคำที่ mapError จับ
//        ("ถูกกลับรายการไปแล้ว" · "จำหน่าย/ตัดบัญชีไปแล้ว" · "บัญชีระบบ ปิดใช้งานไม่ได้") → โยน
//        `ApiError` 409 ตรง ๆ · **ห้ามไปแก้ข้อความใน service** — ข้อความเดียวกันนั้นขึ้นบนหน้าจอผู้ใช้อยู่
//   3) **`account.asset.writeoff` ถูกตรวจใน handler ไม่ใช่ที่ `require.ts`**: op เดียว (`assets.dispose`)
//      ทำได้ 2 อย่างที่ความเสี่ยงต่างกันมาก — "ขาย" (มีเงินเข้า มีหลักฐาน) กับ "ตัดบัญชีทิ้ง"
//      (ของหายไปเฉย ๆ ไม่มีเงินเข้า) ⇒ ด่านคงที่ต่อ op ตัวเดียวแยกสองอย่างนี้ไม่ได้
//   4) **`userId` ที่ service ขอ = `null` เสมอ** (ปิด/เปิดงวด · ยื่น ภ.พ.30) — คีย์ API ไม่ใช่ผู้ใช้
//      ผู้ลงมือจริงถูกบันทึกที่ `AuditLog` โดย `dispatch.ts` (actorType API_KEY + keyName + reason)
//   5) เงินเป็นสตางค์จำนวนเต็มเสมอ · วันที่เป็น `YYYY-MM-DD` (วันไทย) · งวดเป็น `YYYY-MM` · body `.strict()`

import type { AccountDocType } from "@prisma/client";
import { z } from "zod";
import { disposeAsset, getAsset, registerAsset, runDepreciation } from "../../asset";
import { assetDetail } from "../../asset-v2";
import {
  MAPPING_KEYS,
  createLedgerV2,
  ledgerDetail,
  listLedgers,
  listMappings,
  mappingKeyLabel,
  setLedgerActive,
  setMapping,
  updateLedgerV2,
} from "../../coa";
import type { SaveLedgerInput } from "../../coa-v2";
import { docTypeLabel } from "../../dashboard";
import { listDocTypeAccounts, setDocTypeAccount } from "../../doc-settings";
import { ERR } from "../../errors";
import {
  createManualEntry,
  journalEntryDetail,
  journalNumbersOf,
  reverseJournalEntry,
  toggleNeedsReview,
} from "../../journal-v2";
import {
  closePeriodWithChecklist,
  currentPeriodKey,
  isPeriodKey,
  markVatFiled,
  reopenPeriodV2,
  unmarkVatFiled,
} from "../../period-close";
import { NUMBERED_DOC_TYPES } from "../../settings-schema";
import { actorCan, type ApiActor } from "../actor";
import { defineOp, type ApiOp } from "../op";
import { ApiError, type ApiErrorDetail } from "../respond";
import {
  assetDetailView,
  chartRowView,
  checklistView,
  docTypeAccountView,
  journalDetail,
  mappingView,
} from "../serialize-gl";

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

const reasonField = (what: string) =>
  z.string().min(5).max(500).describe(`${what} At least 5 characters. Kept in the audit log.`);

/** `YYYY-MM-DD` (วันไทย) → เที่ยงวันไทยของวันนั้น — เที่ยงกันวันเพี้ยนตอนแปลงกลับไปกลับมา */
function dayOf(v: string): Date {
  return new Date(`${v}T12:00:00+07:00`);
}

function ctxOf(actor: ApiActor) {
  return { tenantId: actor.tenantId, systemId: actor.systemId };
}

function notFound(message_th: string): ApiError {
  return new ApiError(404, "not_found", message_th, "The requested record was not found in this accounting book.");
}

function stateConflict(message_th: string): ApiError {
  return new ApiError(409, "state_conflict", message_th, "The record is not in a state that allows this operation.");
}

function invalid(message_th: string, details?: ApiErrorDetail[]): ApiError {
  return new ApiError(422, "validation", message_th, "Request payload failed validation.", undefined, details);
}

/** `{ ok:false, reason }` ทั่วไป → ปล่อยให้ `mapError` จับคำไทยเอง (ไม่พบ → 404 · ปิดแล้ว → 409 · อื่น ๆ → 422) */
function failWith(reason: string): never {
  throw new Error(reason);
}

/**
 * `fields` ของผังบัญชี → HTTP · "มีรหัสบัญชี … อยู่แล้ว" คือ **มีของอยู่จริง** ไม่ใช่คำขอผิดรูป
 * ⇒ 409 `duplicate` (ผู้เรียกที่ยิงซ้ำแยกออกจากผู้เรียกที่ส่งรหัสผิดรูปแบบได้) · ที่เหลือ 422
 */
function ledgerFieldsError(fields: Record<string, string>): ApiError {
  const entries = Object.entries(fields);
  const details = entries.map(([path, message]) => ({ path, message }));
  const first = entries[0];
  const message_th = first ? first[1] : ERR.GENERIC_ACTION_FAILED;
  if (fields.code?.includes("อยู่แล้ว")) {
    return new ApiError(409, "duplicate", fields.code, "An account with this code already exists.", undefined, details);
  }
  return invalid(message_th, details);
}

/**
 * หมวดย่อยที่จะส่งให้ service — **คิดจากรหัสบัญชีเสมอ** ตรวจแค่ว่าอยู่หมวดใหญ่เดียวกับที่ผู้เรียกบอก
 *
 * ทำไมไม่ส่ง `groupPrefix` ดิบไป: ฟอร์มบนหน้าจอเลือก "หมวดย่อย" จาก dropdown ก่อนแล้วค่อยเสนอรหัสว่าง
 * ในช่วงนั้น ⇒ `validateLedgerInput` บังคับให้รหัสอยู่ในช่วงของ prefix พอดี (610 = 6100–6109)
 * ผู้เรียก REST ไม่มี dropdown นั้น และ **หมวดย่อยที่เก็บจริงถูกคิดจากรหัสอยู่แล้ว**
 * (`ledgerDetail.group3 = prefixOf(code, 3)` · ต้นไม้ผังบัญชีก็จัดกลุ่มด้วยรหัส) ⇒ prefix ที่ส่งมา
 * มีความหมายเดียวที่เหลืออยู่คือ "หมวดบัญชี" (หลักแรก 1–6) ซึ่งเป็นตัวกำหนดชนิดบัญชี
 * ⇒ ตรวจหลักแรกให้ขัดกันไม่ได้ (6199 คู่กับ 110 = ผู้เรียกสับสน ต้องเตือน) แล้วคิดหมวดย่อยจากรหัส
 */
function groupPrefixFor(code: string, groupPrefix: string): string {
  if (groupPrefix[0] !== code[0]) {
    throw invalid("หมวดย่อยต้องอยู่ในหมวดบัญชีเดียวกับรหัส (ตัวเลขหลักแรกต้องตรงกัน)", [
      { path: "groupPrefix", message: `รหัส ${code} อยู่หมวด ${code[0]} แต่หมวดย่อยที่ส่งมาคือ ${groupPrefix}` },
    ]);
  }
  return code.slice(0, 3);
}

/** แถวบัญชีหน้าตาเดียวกับ `chart.list` — คำตอบของทุก op ที่แตะผังบัญชี */
async function chartRowResponse(actor: ApiActor, id: string) {
  const ctx = ctxOf(actor);
  const [detail, rows] = await Promise.all([ledgerDetail(ctx, id), listLedgers(ctx)]);
  if (!detail) throw notFound(ERR.LEDGER_NOT_FOUND);
  const meta = rows.find((r) => r.id === id);
  return chartRowView(detail, meta ? { parentId: meta.parentId, level: meta.level } : undefined);
}

/** งวดจาก path — รูปแบบผิดคือคำขอผิด ไม่ใช่ "ไม่พบ" (path param ไม่ผ่าน zod ⇒ ตรวจมือ) */
function periodParam(raw: string | undefined): string {
  const key = raw ?? "";
  if (!isPeriodKey(key)) {
    throw new ApiError(422, "validation", ERR.PERIOD_KEY_INVALID, "The period must be a month in `YYYY-MM` form.");
  }
  return key;
}

// ── 1. สมุดรายวัน (JV มือ) ──────────────────────────────────────────────────

const BOOKS = ["SALES", "PURCHASES", "RECEIPTS", "PAYMENTS", "GENERAL"] as const;

const journalLineInput = z
  .object({
    accountId: idField("Ledger account of this line, from the chart of accounts."),
    debitSatang: z.number().int().min(0).describe("Debit amount in satang. One side must be 0."),
    creditSatang: z.number().int().min(0).describe("Credit amount in satang. One side must be 0."),
    contactId: idField("Optional contact this line belongs to, for receivable or payable lines.").nullish(),
    memo: z.string().max(300).nullish().describe("Note printed on this line of the entry."),
  })
  .strict();

const journalCreateInput = z
  .object({
    date: ymdField("date"),
    book: z.enum(BOOKS).optional().describe("Journal book the entry belongs to. Default GENERAL."),
    memo: z.string().max(300).nullish().describe("What the entry is for. Shown in the journal list."),
    lines: z
      .array(journalLineInput)
      .min(2, "ต้องมีบรรทัดรายการอย่างน้อย 2 บรรทัด")
      .max(200)
      .describe("At least two lines. Total debit must equal total credit."),
    attachmentIds: z
      .array(idField("Id of a file already uploaded to the accounting file store."))
      .max(20)
      .optional()
      .describe("Files to attach to the entry as evidence."),
  })
  .strict()
  // 🔴 ด่านสมดุลอยู่ที่ schema ไม่ใช่ที่ service เพียงอย่างเดียว — ผู้เรียกต้องได้ `details[{path:"lines"}]`
  //    บอกว่าผิดที่ก้อนไหน ไม่ใช่ข้อความรวมที่ต้องเดาเอง (service ตรวจซ้ำอีกชั้นอยู่แล้ว)
  .superRefine((v, ctx) => {
    const debit = v.lines.reduce((s, l) => s + l.debitSatang, 0);
    const credit = v.lines.reduce((s, l) => s + l.creditSatang, 0);
    if (debit !== credit) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "ยังไม่สมดุล — เดบิตรวมต้องเท่ากับเครดิตรวม" });
    }
    if (debit === 0) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "จำนวนเงินต้องมากกว่า 0" });
    }
    v.lines.forEach((l, i) => {
      if (l.debitSatang > 0 && l.creditSatang > 0) {
        ctx.addIssue({ code: "custom", path: ["lines", i], message: "บรรทัดเดียวลงทั้งเดบิตและเครดิตไม่ได้" });
      }
    });
  });

const journalCreate = defineOp({
  id: "journal.create",
  method: "POST",
  path: "/journal",
  kind: "write",
  action: "account.journal.adjust",
  summary:
    "Post a manual journal entry. Total debit must equal total credit and the entry must fall in a period that is still open. The entry is posted straight away, it is not a draft.",
  label: "บันทึกใบสำคัญด้วยมือ",
  input: journalCreateInput,
  test: "D2-G1.1",
  async handler({ actor, input }) {
    const ctx = ctxOf(actor);
    const res = await createManualEntry(ctx, {
      dateKey: input.date,
      book: input.book,
      memo: input.memo ?? null,
      lines: input.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debitSatang,
        credit: l.creditSatang,
        contactId: l.contactId ?? null,
        note: l.memo ?? null,
      })),
      attachmentIds: input.attachmentIds,
    });
    if (!res.ok) failWith(res.reason);
    const detail = await journalEntryDetail(ctx, res.entryId);
    if (!detail) throw notFound(ERR.JOURNAL_ENTRY_NOT_FOUND);
    return journalDetail(detail);
  },
});

const journalReverse = defineOp({
  id: "journal.reverse",
  method: "POST",
  path: "/journal/{id}/reverse",
  kind: "danger",
  action: "account.journal.adjust",
  summary:
    "Reverse a posted journal entry by writing a mirror entry with the sides swapped. The original entry stays in the books and is marked REVERSED. If its own period is already closed the reversal is dated in the next open period.",
  label: "กลับรายการใบสำคัญ",
  input: z.object({ reason: reasonField("Why the entry is being reversed.") }).strict(),
  test: "D2-G1.7",
  async handler({ actor, params, input }) {
    const res = await reverseJournalEntry(ctxOf(actor), params.id ?? "", input.reason);
    if (!res.ok) {
      // "… ถูกกลับรายการไปแล้ว" = ทำไปแล้ว (ไม่ใช่คำขอผิด) ⇒ 409 · mapError จับคำนี้ไม่ได้เอง
      if (res.reason.includes("กลับรายการไปแล้ว")) throw stateConflict(res.reason);
      if (res.reason.includes("กลับรายการไม่ได้")) throw stateConflict(res.reason);
      failWith(res.reason);
    }
    return { id: res.entryId, journalNo: res.docNo };
  },
});

const journalFlag = defineOp({
  id: "journal.flag",
  method: "POST",
  path: "/journal/{id}/flag",
  kind: "write",
  action: "account.journal.adjust",
  summary:
    "Toggle the review flag of one journal entry. Flagged entries block closing the period they sit in, so this is how an app parks something for the accountant to look at. Calling it again clears the flag.",
  label: "ติด/ปลดธงต้องตรวจ",
  input: z
    .object({ note: z.string().max(300).nullish().describe("What has to be checked. Cleared when the flag is removed.") })
    .strict(),
  test: "D2-G1.5",
  async handler({ actor, params, input }) {
    const res = await toggleNeedsReview(ctxOf(actor), params.id ?? "", input.note ?? null);
    if (!res.ok) failWith(res.reason);
    return { id: params.id ?? "", needsReview: res.needsReview };
  },
});

// ── 2. ผังบัญชี ─────────────────────────────────────────────────────────────

const codeField = z
  .string()
  .regex(/^\d{3,6}$/, "รหัสบัญชีต้องเป็นตัวเลข 3–6 หลัก")
  .describe("Account code, 3 to 6 digits. The first digit is the account type: 1 asset, 2 liability, 3 equity, 4 income, 5 cost of sales, 6 expense.");

const groupPrefixField = z
  .string()
  .regex(/^\d{3}$/, "หมวดย่อยต้องเป็นตัวเลข 3 หลัก")
  .describe("Three digit prefix of the sub group the account belongs to, such as 610. The code must start with it.");

const whtTypeField = z
  .string()
  .max(40)
  .describe("Default withholding tax income type used when this account is picked on an expense line.");

const vatTreatmentField = z
  .enum(["CLAIMABLE", "NON_CLAIMABLE", "PENDING_INVOICE"])
  .describe("How input VAT on this account is treated: claimable, not claimable, or waiting for the tax invoice.");

const chartCreateInput = z
  .object({
    code: codeField,
    name: z.string().min(1).max(80).describe("Thai account name shown in the chart of accounts."),
    nameEn: z.string().max(80).nullish().describe("English account name, optional."),
    groupPrefix: groupPrefixField,
    description: z.string().max(300).nullish().describe("What the account is for, shown in the account panel."),
    defaultWhtRateBp: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .nullish()
      .describe("Default withholding rate in basis points: 300 = 3%."),
    defaultWhtType: whtTypeField.nullish(),
    vatTreatment: vatTreatmentField.nullish(),
  })
  .strict();

const chartCreate = defineOp({
  id: "chart.create",
  method: "POST",
  path: "/chart",
  kind: "write",
  action: "account.chart.manage",
  summary:
    "Add an account to the chart of accounts. The account type is taken from the sub group prefix, so 610 makes an expense account. Codes are unique per book.",
  label: "เพิ่มบัญชีในผังบัญชี",
  input: chartCreateInput,
  test: "D2-G2.1",
  async handler({ actor, input }) {
    const res = await createLedgerV2(ctxOf(actor), {
      code: input.code,
      name: input.name,
      nameEn: input.nameEn ?? null,
      groupPrefix: groupPrefixFor(input.code, input.groupPrefix),
      description: input.description ?? null,
      defaultWhtRateBp: input.defaultWhtRateBp ?? null,
      defaultWhtType: input.defaultWhtType ?? null,
      vatTreatment: input.vatTreatment ?? null,
    });
    if (!res.ok) throw ledgerFieldsError(res.fields);
    return chartRowResponse(actor, res.id);
  },
});

const chartUpdateInput = z
  .object({
    code: codeField.optional(),
    name: z.string().min(1).max(80).optional().describe("Thai account name."),
    nameEn: z.string().max(80).nullish(),
    groupPrefix: groupPrefixField.optional(),
    description: z.string().max(300).nullish(),
    defaultWhtRateBp: z.number().int().min(0).max(10000).nullish(),
    defaultWhtType: whtTypeField.nullish(),
    vatTreatment: vatTreatmentField.nullish(),
  })
  .strict();

const chartUpdate = defineOp({
  id: "chart.update",
  method: "PATCH",
  path: "/chart/{id}",
  kind: "write",
  action: "account.chart.manage",
  summary:
    "Change one account. Only the fields sent are touched, the rest keep their current value. Accounts the system created can be renamed but cannot change code or type, because reports and posting rules point at the old code.",
  label: "แก้ไขบัญชีในผังบัญชี",
  input: chartUpdateInput,
  test: "D2-G2.4",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    const cur = await ledgerDetail(ctxOf(actor), id);
    if (!cur) throw notFound(ERR.LEDGER_NOT_FOUND);
    // PATCH = ทับเฉพาะช่องที่ส่งมา · `undefined` = ไม่แตะ (ต่างจาก `null` ที่แปลว่า "ล้างค่า")
    const code = input.code ?? cur.code;
    const merged: SaveLedgerInput = {
      code,
      name: input.name ?? cur.name,
      nameEn: input.nameEn === undefined ? cur.nameEn : input.nameEn,
      groupPrefix: groupPrefixFor(code, input.groupPrefix ?? code),
      description: input.description === undefined ? cur.description : input.description,
      defaultWhtRateBp: input.defaultWhtRateBp === undefined ? cur.defaultWhtRateBp : input.defaultWhtRateBp,
      defaultWhtType: input.defaultWhtType === undefined ? cur.defaultWhtType : input.defaultWhtType,
      vatTreatment: input.vatTreatment === undefined ? cur.vatTreatment : input.vatTreatment,
    };
    const res = await updateLedgerV2(ctxOf(actor), id, merged);
    if (!res.ok) throw ledgerFieldsError(res.fields);
    return chartRowResponse(actor, id);
  },
});

const chartSetActive = defineOp({
  id: "chart.set-active",
  method: "POST",
  path: "/chart/{id}/active",
  kind: "write",
  action: "account.chart.manage",
  summary:
    "Turn an account on or off. Turning it off hides it from every picker but keeps the history. An account that already has movement, a posting rule or a money channel behind it cannot be turned off. Turning one back on always works.",
  label: "เปิด/ปิดใช้งานบัญชี",
  input: z
    .object({ active: z.boolean().describe("true turns the account back on, false hides it from pickers.") })
    .strict(),
  test: "D2-G2.6",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    const res = await setLedgerActive(ctxOf(actor), id, input.active);
    if (!res.ok) {
      if (res.reason.startsWith("ไม่พบ")) throw notFound(res.reason);
      // "บัญชีระบบ ปิดใช้งานไม่ได้" / "…มีรายการเคลื่อนไหวแล้ว" = สถานะของข้อมูลไม่ให้ทำ ⇒ 409
      throw stateConflict(res.reason);
    }
    return { id, active: res.active };
  },
});

// ── 3. การผูกบัญชีอัตโนมัติ ─────────────────────────────────────────────────

const mappingsSet = defineOp({
  id: "mappings.set",
  method: "PUT",
  path: "/mappings/{key}",
  kind: "write",
  action: "account.mapping.manage",
  summary:
    "Point one posting rule at a different ledger account. The keys are the ones returned by the mappings list, such as AR, VAT_OUTPUT or DEPRECIATION_EXPENSE. Every document posted from now on uses the new account.",
  label: "ตั้งบัญชีของการผูกอัตโนมัติ",
  input: z.object({ accountId: idField("Ledger account this rule should post to.") }).strict(),
  test: "D2-G2.8",
  async handler({ actor, params, input }) {
    const key = params.key ?? "";
    if (!MAPPING_KEYS.includes(key)) {
      throw invalid(`ไม่รู้จักการผูกบัญชี "${key}"`, [{ path: "key", message: "ไม่อยู่ในรายการที่ระบบรองรับ" }]);
    }
    const ctx = ctxOf(actor);
    const res = await setMapping(ctx, key, input.accountId);
    if (!res.ok) failWith(res.reason ?? ERR.GENERIC_ACTION_FAILED);
    const row = (await listMappings(ctx)).find((m) => m.key === key);
    if (!row) throw notFound(`ไม่พบการผูกบัญชี "${key}"`);
    return mappingView(row, mappingKeyLabel(key));
  },
});

const docTypeAccountsSet = defineOp({
  id: "doc-type-accounts.set",
  method: "PUT",
  path: "/doc-type-accounts/{docType}",
  kind: "write",
  action: "account.mapping.manage",
  summary:
    "Set the income or expense account used when documents of one type are posted, overriding the general rule. Send accountId null to drop the override and fall back to the default account again.",
  label: "ตั้งบัญชีของชนิดเอกสาร",
  input: z
    .object({
      accountId: idField("Ledger account for this document type.")
        .nullable()
        .describe("Ledger account for this document type, or null to remove the override."),
    })
    .strict(),
  test: "D2-G2.10",
  async handler({ actor, params, input }) {
    const raw = params.docType ?? "";
    const docType: AccountDocType | undefined = NUMBERED_DOC_TYPES.find((t) => t === raw);
    if (!docType) {
      throw invalid(`ชนิดเอกสาร "${raw}" ตั้งบัญชีแยกไม่ได้`, [{ path: "docType", message: "ชนิดเอกสารไม่ถูกต้อง" }]);
    }
    const ctx = ctxOf(actor);
    const res = await setDocTypeAccount(ctx, docType, input.accountId);
    if (!res.ok) failWith(res.reason);
    const row = (await listDocTypeAccounts(ctx)).find((r) => r.docType === docType);
    if (!row) throw notFound(ERR.GENERIC_ACTION_FAILED);
    return docTypeAccountView(row, docTypeLabel(docType));
  },
});

// ── 4. งวดบัญชี ─────────────────────────────────────────────────────────────

const periodsClose = defineOp({
  id: "periods.close",
  method: "POST",
  path: "/periods/{key}/close",
  kind: "write",
  action: "account.period.close",
  summary:
    "Close one accounting period. The pre-close checklist runs first: the suspense account must be clear and no entry in the period may still be flagged for review. Once closed nothing can be posted into it any more.",
  label: "ปิดงวดบัญชี",
  input: noBody,
  test: "D2-G4.4",
  async handler({ actor, params }) {
    const key = periodParam(params.key);
    // userId = null: คีย์ API ไม่ใช่ผู้ใช้ (คอลัมน์ closedById เป็น nullable · ตัวจริงอยู่ใน AuditLog)
    const res = await closePeriodWithChecklist(ctxOf(actor), key, null);
    if (!res.ok) failWith(res.reason);
    return { period: key, status: "CLOSED", checklist: checklistView(res.checklist) };
  },
});

const periodsReopen = defineOp({
  id: "periods.reopen",
  method: "POST",
  path: "/periods/{key}/reopen",
  kind: "danger",
  action: "account.period.reopen",
  summary:
    "Reopen a closed period so entries can be posted into it again. Every reopen is stamped in the period log with the reason, because auditors ask about periods that were opened after they were closed.",
  label: "เปิดงวดบัญชีใหม่",
  input: z.object({ reason: reasonField("Why the period has to be reopened.") }).strict(),
  test: "D2-G4.7",
  async handler({ actor, params, input }) {
    const key = periodParam(params.key);
    const res = await reopenPeriodV2(ctxOf(actor), key, input.reason, null);
    if (!res.ok) failWith(res.reason);
    return { period: key, status: "OPEN" };
  },
});

const periodsVatFiled = defineOp({
  id: "periods.vat-filed",
  method: "POST",
  path: "/periods/{key}/vat-filed",
  kind: "write",
  action: "account.period.close",
  summary:
    "Record that the VAT return (form PP.30) of one month has been filed, together with the output and input VAT that were on it. This is checklist item four when the period is closed.",
  label: "ทำเครื่องหมายยื่น ภ.พ.30",
  input: z
    .object({
      salesVatSatang: z.number().int().min(0).describe("Output VAT on the return, in satang."),
      inputVatSatang: z.number().int().min(0).describe("Input VAT on the return, in satang."),
      note: z.string().max(200).nullish().describe("How it was filed, for example through the e-filing site."),
    })
    .strict(),
  test: "D2-G4.2",
  async handler({ actor, params, input }) {
    const key = periodParam(params.key);
    const res = await markVatFiled(ctxOf(actor), {
      periodKey: key,
      salesVat: input.salesVatSatang,
      inputVat: input.inputVatSatang,
      userId: null,
      note: input.note ?? null,
    });
    if (!res.ok) {
      // "งวด … ทำเครื่องหมายยื่นไปแล้ว" = มีของอยู่แล้ว ⇒ 409 duplicate (ยิงซ้ำไม่ใช่คำขอผิดรูป)
      if (res.reason.includes("ไปแล้ว")) {
        throw new ApiError(409, "duplicate", res.reason, "This period is already marked as filed.");
      }
      failWith(res.reason);
    }
    return { period: key, vatFiled: true };
  },
});

const periodsVatUnfiled = defineOp({
  id: "periods.vat-unfiled",
  method: "DELETE",
  path: "/periods/{key}/vat-filed",
  kind: "danger",
  action: "account.period.reopen",
  summary:
    "Undo the filed mark of one month, for example when the wrong month was filed. The period goes back to not filed and the close checklist fails on it again.",
  label: "ยกเลิกเครื่องหมายยื่น ภ.พ.30",
  input: z.object({ reason: reasonField("Why the filed mark is being removed.") }).strict(),
  test: "D2-G4.3",
  async handler({ actor, params }) {
    const key = periodParam(params.key);
    const res = await unmarkVatFiled(ctxOf(actor), key);
    if (!res.ok) {
      if (res.reason.includes("ยังไม่ได้ทำเครื่องหมาย")) throw notFound(res.reason);
      failWith(res.reason);
    }
    return { period: key, vatFiled: false };
  },
});

// ── 5. สินทรัพย์ถาวร ────────────────────────────────────────────────────────

const assetsRegisterInput = z
  .object({
    name: z.string().min(1).max(120).describe("What the asset is, such as a pickup truck or an air conditioner."),
    category: z.string().max(60).nullish().describe("Free text group used to sort the register, such as vehicles."),
    acquiredDate: ymdField("acquiredDate").describe("Day the asset was bought (Thai calendar day, YYYY-MM-DD)."),
    startDepDate: ymdField("startDepDate").describe("Day depreciation starts (Thai calendar day, YYYY-MM-DD)."),
    costSatang: z.number().int().min(1).describe("Cost of the asset in satang."),
    salvageValueSatang: z
      .number()
      .int()
      .min(100, "มูลค่าซากต้องไม่น้อยกว่า 100 สตางค์ (1 บาท)")
      .describe("Residual value in satang. Thai practice keeps at least 1 baht, so the minimum is 100."),
    usefulLifeMonths: z.number().int().min(1).max(1200).describe("Useful life in months. 5 years is 60."),
    assetAccountId: idField("Ledger account holding the cost of the asset, usually a 16xx account."),
    accumAccountId: idField("Ledger account of accumulated depreciation, usually the 16x9 account."),
    expenseAccountId: idField("Ledger account of the depreciation expense, usually 6800."),
    sourceDocumentId: idField("Id of the asset purchase document this asset came from, if there is one.").nullish(),
    note: z.string().max(500).nullish().describe("Free note kept with the asset."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.salvageValueSatang >= v.costSatang) {
      ctx.addIssue({ code: "custom", path: ["salvageValueSatang"], message: "มูลค่าซากต้องน้อยกว่าต้นทุน" });
    }
  });

const assetsRegister = defineOp({
  id: "assets.register",
  method: "POST",
  path: "/assets",
  kind: "write",
  action: "account.asset.register",
  summary:
    "Put a fixed asset on the register so monthly depreciation can be run on it. Depreciation is straight line: the cost minus the residual value spread over the useful life, with the last month taking the rounding.",
  label: "ขึ้นทะเบียนสินทรัพย์",
  input: assetsRegisterInput,
  test: "D2-G3.1",
  async handler({ actor, input }) {
    const ctx = ctxOf(actor);
    const res = await registerAsset(ctx, {
      name: input.name,
      category: input.category ?? null,
      acquiredDate: dayOf(input.acquiredDate),
      startDepDate: dayOf(input.startDepDate),
      cost: input.costSatang,
      salvageValue: input.salvageValueSatang,
      usefulLifeMonths: input.usefulLifeMonths,
      assetAccountId: input.assetAccountId,
      accumAccountId: input.accumAccountId,
      expenseAccountId: input.expenseAccountId,
      sourceDocumentId: input.sourceDocumentId ?? null,
      note: input.note ?? null,
    });
    if (!res.ok) {
      if (res.reason.includes("ขึ้นทะเบียนสินทรัพย์ไปแล้ว")) {
        throw new ApiError(409, "duplicate", res.reason, "This purchase document is already on the asset register.");
      }
      failWith(res.reason);
    }
    const detail = await assetDetail(ctx, res.id);
    if (!detail) throw notFound(ERR.ASSET_NOT_FOUND);
    return assetDetailView(detail);
  },
});

const assetsDepreciationRun = defineOp({
  id: "assets.depreciation-run",
  method: "POST",
  path: "/assets/depreciation/run",
  kind: "write",
  action: "account.asset.manage",
  summary:
    "Run monthly depreciation for a period and post the journal entry for it. Safe to call again: an asset that already has the period posted comes back under skipped, so nothing is booked twice. Preview the same period first to see what it will do.",
  label: "รันค่าเสื่อมของงวด",
  input: z
    .object({
      period: z
        .string()
        .regex(YM, "period ต้องเป็นงวดรูปแบบ YYYY-MM")
        .optional()
        .describe("Period to run, `YYYY-MM`. Default is the current Thai month."),
    })
    .strict(),
  test: "D2-G3.4",
  async handler({ actor, input }) {
    const ctx = ctxOf(actor);
    const res = await runDepreciation(ctx, input.period ?? currentPeriodKey());
    const numbers = await journalNumbersOf(
      ctx,
      res.posted.map((p) => p.entryId),
    );
    return {
      period: res.periodKey,
      posted: res.posted.map((p) => ({
        assetId: p.assetId,
        code: p.code,
        amountSatang: p.amount,
        journalNo: numbers.get(p.entryId) ?? "",
      })),
      skipped: res.skipped.map((s) => ({ assetId: s.assetId, code: s.code, reason: s.reason })),
      fullyDepreciated: [...res.fullyDepreciated],
    };
  },
});

const assetsDisposeInput = z
  .object({
    reason: reasonField("Why the asset is leaving the register."),
    mode: z
      .enum(["SELL", "WRITE_OFF"])
      .describe(
        "SELL when the asset was sold and money came in, WRITE_OFF when it is simply taken off the books. WRITE_OFF needs the account.asset.writeoff scope on top of account.asset.dispose.",
      ),
    date: ymdField("date").describe("Day of the disposal (Thai calendar day, YYYY-MM-DD)."),
    proceedsSatang: z.number().int().min(0).nullish().describe("Money received in satang. SELL only."),
    financeAccountId: idField("Money channel the sale proceeds landed in. Needed when proceeds are above zero.").nullish(),
    note: z.string().max(500).nullish().describe("Free note kept with the asset."),
  })
  .strict();

const assetsDispose = defineOp({
  id: "assets.dispose",
  method: "POST",
  path: "/assets/{id}/dispose",
  kind: "danger",
  action: "account.asset.dispose",
  summary:
    "Sell or write off a fixed asset. The journal entry clears the cost and the accumulated depreciation, books the money received and posts the gain or loss against the net book value. An asset can only leave the register once.",
  label: "จำหน่าย/ตัดบัญชีสินทรัพย์",
  input: assetsDisposeInput,
  test: "D2-G3.7",
  async handler({ actor, params, input }) {
    // ด่านสิทธิ์ที่ `require.ts` ทำแทนไม่ได้ (ดูข้อ 3 ในหัวไฟล์): ตัดบัญชีทิ้ง = ของหายไปโดยไม่มีเงินเข้า
    if (input.mode === "WRITE_OFF" && !actorCan(actor, "account.asset.writeoff")) {
      throw new ApiError(
        403,
        "scope_missing",
        "คีย์นี้ไม่มีสิทธิ์ตัดจำหน่ายสินทรัพย์ (ตัดบัญชีทิ้ง)",
        "This API key does not have the scope required to write an asset off.",
        "ต้องการสิทธิ์ account.asset.writeoff",
      );
    }
    const ctx = ctxOf(actor);
    const res = await disposeAsset(ctx, {
      assetId: params.id ?? "",
      mode: input.mode,
      date: dayOf(input.date),
      proceeds: input.proceedsSatang ?? 0,
      financeAccountId: input.financeAccountId ?? null,
      note: input.note ?? null,
    });
    if (!res.ok) {
      if (res.reason.startsWith("ไม่พบ")) throw notFound(res.reason);
      // "สินทรัพย์นี้จำหน่าย/ตัดบัญชีไปแล้ว" = ทำไปแล้ว ⇒ 409 (mapError จับคำนี้ไม่ได้เอง)
      if (res.reason.includes("ไปแล้ว")) throw stateConflict(res.reason);
      failWith(res.reason);
    }
    const [numbers, asset] = await Promise.all([
      journalNumbersOf(ctx, [res.entryId]),
      getAsset(ctx, params.id ?? ""),
    ]);
    return {
      journalNo: numbers.get(res.entryId) ?? "",
      gainLossSatang: res.gainLoss,
      status: asset?.status ?? (input.mode === "SELL" ? "DISPOSED" : "WRITTEN_OFF"),
    };
  },
});

export const GL_WRITE_OPS: ApiOp[] = [
  journalCreate,
  journalReverse,
  journalFlag,
  chartCreate,
  chartUpdate,
  chartSetActive,
  mappingsSet,
  docTypeAccountsSet,
  periodsClose,
  periodsReopen,
  periodsVatFiled,
  periodsVatUnfiled,
  assetsRegister,
  assetsDepreciationRun,
  assetsDispose,
];
