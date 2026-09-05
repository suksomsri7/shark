// ops/settings-write.ts — WRITE ของข้อมูลกิจการ / เอกสารและเลขที่ / นโยบาย / สิทธิ์ผู้ใช้งาน /
//                         เชื่อมระบบใน SHARK / คีย์ API (list) (WO D4)
//
// ทุก op ที่นี่ scope `account.settings.manage` เดียวกันหมด (ตามตาราง §D4) · ห้ามแตะ prisma ตรง ๆ (fitness F5)
//
// 🔴 กับดักที่ถูกดักไว้ตรงนี้ (อ่านก่อนแก้):
//   1) `saveSettings()` เป็น "แทนที่ทั้งก้อน" ไม่ใช่ patch จริง (ฟอร์ม UI ส่งค่าทั้งหน้าเสมอ) ⇒ REST ที่
//      อยาก PATCH บางฟิลด์ **ต้องอ่านค่าเดิมมาก่อน** (`getSettings`) แล้วค่อยทับด้วยฟิลด์ที่ผู้เรียกส่งมา
//      ไม่งั้นฟิลด์ที่ไม่ได้ส่ง (เช่น taxId ที่ตั้งไว้ก่อนหน้า) จะถูกล้างเป็นค่าว่างเงียบ ๆ
//   2) `settings.update` **ห้าม** รับ stampUrl/signatureUrl/logoUrl — ไม่ประกาศไว้ใน schema + `.strict()`
//      ⇒ zod ปฏิเสธเป็น 422 เองโดยอัตโนมัติ (ไม่ต้องเขียนด่านเพิ่ม)
//   3) `formatDocNo()` (ตัวออกเลขจริง) จำเฉพาะ token ตัวพิมพ์ใหญ่/ไทย (`{YYYY}`/`{ปี}`/`{0000}`) —
//      ผู้เรียก REST ไม่รู้อนุสัญญานี้ ⇒ `normalizePattern()` แปลง token ตัวพิมพ์เล็กที่เข้าใจง่ายกว่า
//      (`{prefix}` `{yyyy}` `{mm}` `{dd}` `{seqN}` `{seq}`) เป็นรูปแบบภายในก่อนบันทึกเสมอ
//   4) `connect()` ของ `connections.ts` ไม่ตรวจว่า `linkedId` เป็นระบบจริงของร้าน (หน้าจอส่งมาจาก
//      dropdown ที่กรองไว้แล้ว) — ที่นี่ต้องเรียก `isValidLinkTarget()` ก่อนเสมอ กัน id ปลอม/ข้ามร้าน
//   5) `PATCH`/`DELETE /links/{kind}` ไม่มี linkedId ในเส้นทาง ⇒ คลี่จาก `linkedIdOfKind()` ก่อน
//   6) permissions-service (`saveRole`/`assignRole`/`setApprovalCap`/`revokeAccountAccess`) เขียนผ่าน
//      `staff/service.updateStaffAccess` ซึ่ง**ต้องมี `actorUserId` ที่เป็น Membership จริงของร้านนี้**
//      (เช็คการยกระดับสิทธิ์ `checkNoEscalation` + ลำดับชั้นบทบาท) — คีย์ API ไม่ใช่ผู้ใช้ ⇒ ใช้ userId
//      ของ OWNER คนแรกของร้าน (`ownerActorId()`) แทน: ปลอดภัยเพราะ OWNER มีสิทธิ์ทุกอย่างอยู่แล้ว
//      (ผ่าน `canGrantPermission`/`canAssignRole` ทุกกรณี) และการเรียกมาถึงตรงนี้ได้ต้องมี scope
//      `account.settings.manage` อยู่แล้ว · `addRole()` ไม่ต้องใช้ actorUserId (แค่เพิ่มนิยามบทบาท ยังไม่
//      เขียนสิทธิ์ให้ใคร)

import type { AccountDocType, AccountLinkedKind, AccountVatTiming } from "@prisma/client";
import { z } from "zod";
import { getDocSettings, saveDocSettings, setDocNextNo, createDocTag, docNumberingRows } from "../../doc-settings";
import { docTypeLabel } from "../../dashboard";
import { NUMBERED_DOC_TYPES, TAG_COLORS, toSeqReset, type DocSettingsPatch } from "../../settings-schema";
import { getPolicy, savePolicy, type PolicyPatch } from "../../policy";
import { getSettings, saveSettings, type AccountSettingsView } from "../../service";
import {
  addRole,
  assignRole,
  getPermissionSettings,
  listAccountUsers,
  revokeAccountAccess,
  saveRole,
  setApprovalCap,
  type Ctx as PermCtx,
} from "../../permissions-service";
import {
  buildConnectionCards,
  connect,
  disconnect,
  isValidLinkTarget,
  linkedIdOfKind,
  setLinkOptions,
  type LinkConfig,
  type ToggleKey,
} from "../../connections";
import { listApiKeys } from "@/lib/api-keys/service";
import { bundleLabelForScopes } from "@/lib/api-keys/scopes";
import type { ApiActor } from "../actor";
import { defineOp, type ApiOp } from "../op";
import { ApiError } from "../respond";
import { iso } from "../serialize";
import { docSettingRowView, linkCardView, policyView, settingsView } from "../serialize-gl";

function ctxOf(actor: ApiActor) {
  return { tenantId: actor.tenantId, systemId: actor.systemId };
}

function invalid(message_th: string, message_en = "Request payload failed validation."): ApiError {
  return new ApiError(422, "validation", message_th, message_en);
}

function notFound(message_th: string, message_en = "The requested record was not found."): ApiError {
  return new ApiError(404, "not_found", message_th, message_en);
}

function stateConflict(message_th: string): ApiError {
  return new ApiError(409, "state_conflict", message_th, "The record is not in a state that allows this operation.");
}

/** `{ ok:false, reason }` ทั่วไป → ปล่อยให้ `mapError` จับคำไทยเอง (ไม่พบ → 404 · อื่น ๆ → 422) */
function failWith(reason: string): never {
  throw new Error(reason);
}

const reasonField = (what: string) =>
  z.string().min(5).max(500).describe(`${what} At least 5 characters. Kept in the audit log.`);

// ═══════════════════════════ S1 ข้อมูลกิจการ ═══════════════════════════

const settingsUpdateInput = z
  .object({
    orgName: z.string().min(1).max(200).optional().describe("Legal/trade name printed on documents."),
    taxId: z
      .string()
      .regex(/^\d{13}$/, "เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก")
      .nullish()
      .describe("13-digit Thai tax id, digits only."),
    branchCode: z.string().max(10).optional().describe('5-digit branch code, "00000" for head office.'),
    branchName: z.string().max(120).nullish(),
    address: z.string().max(500).nullish(),
    phone: z.string().max(40).nullish(),
    email: z.string().email().max(160).nullish(),
    website: z.string().max(200).nullish(),
    vatRegistered: z.boolean().optional(),
    vatRateBp: z.number().int().min(0).max(10000).optional().describe("Basis points: 700 = 7%."),
    taxPointBasis: z.enum(["ON_ISSUE", "ON_PAYMENT"]).optional(),
  })
  .strict();

const settingsUpdate = defineOp({
  id: "settings.update",
  method: "PATCH",
  path: "/settings",
  kind: "write",
  action: "account.settings.manage",
  summary:
    "Update the company details printed on documents. Only sent fields change. The company stamp, signature and logo images are managed from the app only, never through this API.",
  label: "แก้ข้อมูลกิจการ",
  input: settingsUpdateInput,
  test: "D4-S1.1",
  async handler({ actor, input }) {
    const ctx = ctxOf(actor);
    const current = await getSettings(ctx.tenantId, ctx.systemId);
    const merged: Partial<AccountSettingsView> = {
      ...current,
      ...(input.orgName !== undefined ? { orgName: input.orgName } : {}),
      ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
      ...(input.branchCode !== undefined ? { branchCode: input.branchCode } : {}),
      ...(input.branchName !== undefined ? { branchName: input.branchName } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.vatRegistered !== undefined ? { vatRegistered: input.vatRegistered } : {}),
      ...(input.vatRateBp !== undefined ? { vatRateBp: input.vatRateBp } : {}),
      ...(input.taxPointBasis !== undefined ? { taxPointBasis: input.taxPointBasis as AccountVatTiming } : {}),
    };
    await saveSettings(ctx.tenantId, ctx.systemId, merged);
    const fresh = await getSettings(ctx.tenantId, ctx.systemId);
    return settingsView(fresh);
  },
});

// ═══════════════════════════ S2 เอกสารและเลขที่ ═══════════════════════════

/** token ที่ผู้เรียก REST พิมพ์ง่ายกว่า (ตัวพิมพ์เล็ก) → token ภายในที่ `formatDocNo()` (doc-numbering.ts) รู้จัก
 *  (ตัวพิมพ์ใหญ่/ไทย/`{0000}`) — token ที่รู้จักอยู่แล้วหรือไม่รู้จักเลยถูกปล่อยผ่านเดิม */
function normalizePattern(pattern: string): string {
  return pattern.replace(/\{([^{}]*)\}/g, (whole, token: string) => {
    const t = token.trim();
    if (/^0+$/.test(t)) return whole; // ตัวนับตัวพิมพ์ศูนย์อยู่แล้ว
    const lower = t.toLowerCase();
    if (lower === "seq") return "{SEQ}";
    const seqN = /^seq(\d{1,6})$/.exec(lower);
    if (seqN) return `{${"0".repeat(Number(seqN[1]))}}`;
    const map: Record<string, string> = { yyyy: "YYYY", yy: "YY", mm: "MM", dd: "DD", prefix: "PREFIX", br: "BR", branch: "BR" };
    if (map[lower]) return `{${map[lower]}}`;
    return whole;
  });
}

function isNumberedDocType(v: string): v is AccountDocType {
  return (NUMBERED_DOC_TYPES as readonly string[]).includes(v);
}

function docTypeParam(params: Record<string, string>): AccountDocType {
  const dt = params.docType ?? "";
  if (!isNumberedDocType(dt)) {
    throw notFound(`ไม่มีเลขที่เอกสารให้ตั้งค่าสำหรับชนิด "${dt}"`, `No document numbering for type "${dt}".`);
  }
  return dt;
}

const docSettingsUpdateInput = z
  .object({
    prefix: z.string().max(12).optional().describe('Code shown before the running number, such as "INV".'),
    pattern: z
      .string()
      .max(60)
      .optional()
      .describe(
        "Number pattern. Tokens: {prefix} {yyyy} {yy} {mm} {dd} {br} and a sequence token such as {seq4} (4-digit running number) or {seq}.",
      ),
    reset: z.enum(["NONE", "YEARLY", "MONTHLY"]).optional().describe("When the running number resets to 1."),
    dueDays: z.number().int().min(0).max(3650).optional().describe("Payment due days (purchase orders: lead time to receive goods)."),
    validDays: z.number().int().min(0).max(3650).optional().describe("Quotation validity in days."),
    notes: z.string().max(1000).optional().describe("Footer note printed at the bottom of this document type."),
    terms: z.string().max(500).optional().describe("Payment terms line printed on this document type."),
    publicLink: z
      .object({ enabled: z.boolean().optional(), expiryDays: z.number().int().min(0).max(3650).optional() })
      .strict()
      .optional(),
    autoTaxInvoice: z.enum(["MANUAL", "ON_PAYMENT", "ON_INVOICE"]).optional(),
    printTemplate: z.enum(["STANDARD", "COMPACT", "WITH_IMAGES"]).optional(),
    channels: z.array(z.string().min(1).max(60)).max(50).optional().describe("Money channel ids, in the order printed on documents."),
  })
  .strict();

const settingsDocumentsUpdate = defineOp({
  id: "settings.documents.update",
  method: "PATCH",
  path: "/settings/documents/{docType}",
  kind: "write",
  action: "account.settings.manage",
  summary: "Change the numbering pattern, due days, footer note, terms or print settings of one document type.",
  label: "แก้ตั้งค่าเอกสารและเลขที่",
  input: docSettingsUpdateInput,
  test: "D4-S2.1",
  async handler({ actor, params, input }) {
    const docType = docTypeParam(params);
    const ctx = ctxOf(actor);
    const cur = await getDocSettings(ctx);
    const patch: DocSettingsPatch = {};
    if (input.prefix !== undefined || input.pattern !== undefined || input.reset !== undefined) {
      patch.sequences = {
        [docType]: {
          ...(input.prefix !== undefined ? { prefix: input.prefix } : {}),
          ...(input.pattern !== undefined ? { pattern: normalizePattern(input.pattern) } : {}),
          ...(input.reset !== undefined ? { reset: toSeqReset(input.reset) } : {}),
        },
      };
    }
    if (input.notes !== undefined || input.terms !== undefined) {
      patch.notes = {
        [docType]: {
          ...(input.notes !== undefined ? { footer: input.notes } : {}),
          ...(input.terms !== undefined ? { terms: input.terms } : {}),
        },
      };
    }
    if (input.dueDays !== undefined || input.validDays !== undefined) {
      patch.due = {
        quotationValidDays: input.validDays ?? cur.due.quotationValidDays,
        invoiceCreditDays: docType === "PURCHASE_ORDER" ? cur.due.invoiceCreditDays : (input.dueDays ?? cur.due.invoiceCreditDays),
        purchaseOrderDueDays: docType === "PURCHASE_ORDER" ? (input.dueDays ?? cur.due.purchaseOrderDueDays) : cur.due.purchaseOrderDueDays,
        basis: cur.due.basis,
      };
    }
    if (input.publicLink !== undefined) {
      patch.publicView = {
        ...cur.publicView,
        ...(input.publicLink.enabled !== undefined ? { enabled: input.publicLink.enabled } : {}),
        ...(input.publicLink.expiryDays !== undefined ? { expiryDays: input.publicLink.expiryDays } : {}),
      };
    }
    if (input.autoTaxInvoice !== undefined) patch.autoTaxInvoice = { ...cur.autoTaxInvoice, mode: input.autoTaxInvoice };
    if (input.printTemplate !== undefined) patch.print = { ...cur.print, template: input.printTemplate };
    if (input.channels !== undefined) patch.channels = { order: input.channels };

    const res = await saveDocSettings(ctx, patch);
    if (!res.ok) throw invalid(res.reason);

    const now = new Date();
    const [rows, settings] = await Promise.all([docNumberingRows(ctx, docTypeLabel, now), getDocSettings(ctx)]);
    const row = rows.find((r) => r.docType === docType);
    if (!row) throw notFound(`ไม่พบตั้งค่าเอกสารของชนิด "${docType}"`);
    return docSettingRowView(row, settings);
  },
});

const nextNoInput = z.object({ nextNo: z.number().int().min(1).max(999_999) }).strict();

const settingsDocumentsNextNo = defineOp({
  id: "settings.documents.next-no",
  method: "POST",
  path: "/settings/documents/{docType}/next-no",
  kind: "write",
  action: "account.settings.manage",
  summary: "Set the next running number of one document type. Cannot go lower than a number already used this period.",
  label: "ตั้งเลขที่ถัดไป",
  input: nextNoInput,
  test: "D4-S2.2",
  async handler({ actor, params, input }) {
    const docType = docTypeParam(params);
    const ctx = ctxOf(actor);
    const res = await setDocNextNo(ctx, docType, input.nextNo, new Date());
    if (!res.ok) {
      if (res.reason.includes("แล้ว")) throw stateConflict(res.reason);
      throw invalid(res.reason);
    }
    const rows = await docNumberingRows(ctx, docTypeLabel, new Date());
    const row = rows.find((r) => r.docType === docType);
    return { docType, nextNo: res.nextNo, example: row?.example ?? "" };
  },
});

const tagsCreateInput = z
  .object({
    name: z.string().min(1).max(40),
    color: z.enum(TAG_COLORS).describe(`Tag swatch. One of ${TAG_COLORS.join(", ")} (the 6 design tokens the app renders; hex colors are not accepted).`),
    docTypes: z.array(z.string()).max(30).describe("Document types this tag applies to. Empty means every type."),
  })
  .strict();

const settingsTagsCreate = defineOp({
  id: "settings.tags.create",
  method: "POST",
  path: "/settings/tags",
  kind: "write",
  action: "account.settings.manage",
  summary: "Add a document tag (color label used to filter and mark documents).",
  label: "เพิ่มแท็กเอกสาร",
  input: tagsCreateInput,
  test: "D4-S2.5",
  async handler({ actor, input }) {
    const res = await createDocTag(ctxOf(actor), { name: input.name, color: input.color, docTypes: input.docTypes });
    if (!res.ok) throw invalid(res.reason);
    return { id: res.id, name: input.name.trim(), color: input.color, docTypes: input.docTypes };
  },
});

// ═══════════════════════════ S3 นโยบาย ═══════════════════════════

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymdOf = (v: string): Date => new Date(`${v}T12:00:00+07:00`);

const INCOME_TYPES = ["M40_1", "M40_2", "M40_3", "M40_4", "M40_5", "M40_6", "M40_7", "M40_8"] as const;
const whtDefaultField = z
  .object({
    incomeType: z.enum(INCOME_TYPES),
    rateBp: z.number().int().min(0).max(10000),
    expenseAccountCodes: z.array(z.string()).max(30).default([]),
  })
  .strict();
const regularCustomerField = z
  .object({
    minPaidDocs: z.number().int().min(1),
    minPaidTotalSatang: z.number().int().min(0),
    periodMonths: z.number().int().min(1).max(120),
  })
  .strict();

const policyUpdateInput = z
  .object({
    fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
    periodCloseDay: z.number().int().min(1).max(28).nullish(),
    vatRegistered: z.boolean().optional(),
    vatRateBp: z.number().int().min(0).max(10000).optional(),
    vatTiming: z.enum(["ON_ISSUE", "ON_PAYMENT"]).optional(),
    defaultPriceMode: z.enum(["EXCL_VAT", "INCL_VAT", "NO_VAT"]).nullish(),
    lockBeforeDate: z.string().regex(YMD, "lockBeforeDate ต้องเป็นวันที่รูปแบบ YYYY-MM-DD").nullish(),
    dupContactPolicy: z.enum(["WARN", "BLOCK"]).optional(),
    dupProductPolicy: z.enum(["WARN", "BLOCK"]).optional(),
    defaultSalesAccountCode: z.string().max(20).nullish(),
    defaultPurchaseAccountCode: z.string().max(20).nullish(),
    defaultExpenseAccountCode: z.string().max(20).nullish(),
    convertQtTo: z.enum(["INVOICE", "DEPOSIT_RECEIPT"]).optional(),
    convertPoTo: z.enum(["PURCHASE", "EXPENSE"]).optional(),
    copyNotesOnConvert: z.boolean().optional(),
    copyTagsOnConvert: z.boolean().optional(),
    autoClosePeriods: z.boolean().optional(),
    autoCloseNotify: z.boolean().optional(),
    emailReportDaily: z.boolean().optional(),
    emailReportWeekly: z.boolean().optional(),
    emailReportRecipients: z.array(z.string().email()).max(20).optional(),
    whtDefaults: z.array(whtDefaultField).optional(),
    regularCustomer: regularCustomerField.optional(),
  })
  .strict();

const settingsPolicyUpdate = defineOp({
  id: "settings.policy.update",
  method: "PATCH",
  path: "/settings/policy",
  kind: "write",
  action: "account.settings.manage",
  summary: "Change accounting policy: fiscal year, VAT timing, date lock, duplicate rules, conversion defaults and report emails.",
  label: "แก้นโยบายบัญชี",
  input: policyUpdateInput,
  test: "D4-S3.1",
  async handler({ actor, input }) {
    const ctx = ctxOf(actor);
    const patch: PolicyPatch = {
      ...(input.fiscalYearStartMonth !== undefined ? { fiscalYearStartMonth: input.fiscalYearStartMonth } : {}),
      ...(input.periodCloseDay !== undefined ? { periodCloseDay: input.periodCloseDay } : {}),
      ...(input.vatRegistered !== undefined ? { vatRegistered: input.vatRegistered } : {}),
      ...(input.vatRateBp !== undefined ? { vatRateBp: input.vatRateBp } : {}),
      ...(input.vatTiming !== undefined ? { vatTiming: input.vatTiming } : {}),
      ...(input.defaultPriceMode !== undefined ? { defaultPriceMode: input.defaultPriceMode } : {}),
      ...(input.lockBeforeDate !== undefined ? { lockBeforeDate: input.lockBeforeDate === null ? null : ymdOf(input.lockBeforeDate) } : {}),
      ...(input.dupContactPolicy !== undefined ? { dupContactPolicy: input.dupContactPolicy } : {}),
      ...(input.dupProductPolicy !== undefined ? { dupProductPolicy: input.dupProductPolicy } : {}),
      ...(input.defaultSalesAccountCode !== undefined ? { defaultSalesAccountCode: input.defaultSalesAccountCode } : {}),
      ...(input.defaultPurchaseAccountCode !== undefined ? { defaultPurchaseAccountCode: input.defaultPurchaseAccountCode } : {}),
      ...(input.defaultExpenseAccountCode !== undefined ? { defaultExpenseAccountCode: input.defaultExpenseAccountCode } : {}),
      ...(input.convertQtTo !== undefined ? { convertQtTo: input.convertQtTo } : {}),
      ...(input.convertPoTo !== undefined ? { convertPoTo: input.convertPoTo } : {}),
      ...(input.copyNotesOnConvert !== undefined ? { copyNotesOnConvert: input.copyNotesOnConvert } : {}),
      ...(input.copyTagsOnConvert !== undefined ? { copyTagsOnConvert: input.copyTagsOnConvert } : {}),
      ...(input.autoClosePeriods !== undefined ? { autoClosePeriods: input.autoClosePeriods } : {}),
      ...(input.autoCloseNotify !== undefined ? { autoCloseNotify: input.autoCloseNotify } : {}),
      ...(input.emailReportDaily !== undefined ? { emailReportDaily: input.emailReportDaily } : {}),
      ...(input.emailReportWeekly !== undefined ? { emailReportWeekly: input.emailReportWeekly } : {}),
      ...(input.emailReportRecipients !== undefined ? { emailReportRecipients: input.emailReportRecipients } : {}),
      ...(input.whtDefaults !== undefined ? { whtDefaults: input.whtDefaults } : {}),
      ...(input.regularCustomer !== undefined ? { regularCustomer: input.regularCustomer } : {}),
    };
    const res = await savePolicy(ctx, patch);
    if (!res.ok) throw invalid(res.reason);
    const fresh = await getPolicy(ctx);
    return policyView(fresh);
  },
});

// ═══════════════════════════ S4 สิทธิ์ผู้ใช้งาน ═══════════════════════════

/** ผู้เรียกเป็นคีย์ API ไม่ใช่ผู้ใช้ — `updateStaffAccess` (ที่ permissions-service เรียกภายใน) ต้องมี
 *  Membership จริงของร้านนี้เป็น actor เพื่อผ่านด่านยกระดับสิทธิ์ ⇒ ใช้ OWNER คนแรกของร้านแทน
 *  (ปลอดภัย: OWNER มีสิทธิ์ทุกอย่างอยู่แล้ว และ scope `account.settings.manage` ผ่านมาแล้วก่อนถึงตรงนี้) */
async function ownerActorId(ctx: PermCtx): Promise<string> {
  const users = await listAccountUsers(ctx);
  const owner = users.find((u) => u.role === "OWNER");
  if (!owner) failWith("ไม่พบเจ้าของกิจการของร้านนี้ในระบบ");
  return owner.userId;
}

const settingsPermissionsGet = defineOp({
  id: "settings.permissions.get",
  method: "GET",
  path: "/settings/permissions",
  kind: "read",
  action: "account.settings.manage",
  summary: "Roles and the people who have accounting access, with the permission matrix and approval caps.",
  label: "สิทธิ์ผู้ใช้งาน",
  test: "D4-S4.1",
  async handler({ actor }) {
    const ctx = ctxOf(actor);
    const settings = await getPermissionSettings(ctx);
    const users = await listAccountUsers(ctx, settings, { includeAll: true });
    return {
      roles: settings.roles.map((r) => ({ key: r.key, name: r.name, system: r.system === true, cells: r.cells, capSatang: r.capSatang })),
      users: users.map((u) => ({
        membershipId: u.membershipId,
        userId: u.userId,
        name: u.name,
        email: u.email,
        role: u.role,
        accountRole: u.accountRoleKey,
        capSatang: u.capSatang,
      })),
    };
  },
});

const cellsField = z.record(z.string(), z.record(z.string(), z.boolean()));

const addRoleInput = z
  .object({ name: z.string().min(1).max(60), cells: cellsField, capSatang: z.number().int().min(0).nullish() })
  .strict();

const settingsPermissionsAddRole = defineOp({
  id: "settings.permissions.add-role",
  method: "POST",
  path: "/settings/permissions/roles",
  kind: "write",
  action: "account.settings.manage",
  summary: "Create a custom accounting role with a permission matrix and an optional approval cap.",
  label: "เพิ่มบทบาทสิทธิ์",
  input: addRoleInput,
  test: "D4-S4.2",
  async handler({ actor, input }) {
    const res = await addRole(ctxOf(actor), input.name, input.cells, input.capSatang ?? null);
    if (!res.ok) throw invalid(res.reason);
    return { key: res.key, name: input.name.trim(), cells: input.cells, capSatang: input.capSatang ?? null };
  },
});

const saveRoleInput = z
  .object({ name: z.string().min(1).max(60), cells: cellsField, capSatang: z.number().int().min(0).nullish() })
  .strict();

const settingsPermissionsSaveRole = defineOp({
  id: "settings.permissions.save-role",
  method: "PUT",
  path: "/settings/permissions/roles/{key}",
  kind: "write",
  action: "account.settings.manage",
  summary: "Update a custom role's permissions and cap. Everyone currently in the role is re-written immediately. System roles (owner/manager) cannot be changed.",
  label: "แก้บทบาทสิทธิ์",
  input: saveRoleInput,
  test: "D4-S4.4",
  async handler({ actor, params, input }) {
    const ctx = ctxOf(actor);
    const actorUserId = await ownerActorId(ctx);
    const res = await saveRole(ctx, actorUserId, { key: params.key ?? "", name: input.name, cells: input.cells, capSatang: input.capSatang ?? null });
    if (!res.ok) throw invalid(res.reason);
    return { key: params.key ?? "", name: input.name.trim(), cells: input.cells, capSatang: input.capSatang ?? null };
  },
});

const assignRoleInput = z.object({ membershipId: z.string().min(1), roleKey: z.string().min(1) }).strict();

const settingsPermissionsAssign = defineOp({
  id: "settings.permissions.assign",
  method: "POST",
  path: "/settings/permissions/assign",
  kind: "write",
  action: "account.settings.manage",
  summary: "Assign an accounting role to one staff member. Writes the permissions immediately.",
  label: "กำหนดบทบาทให้ผู้ใช้งาน",
  input: assignRoleInput,
  test: "D4-S4.3",
  async handler({ actor, input }) {
    const ctx = ctxOf(actor);
    const actorUserId = await ownerActorId(ctx);
    const res = await assignRole(ctx, actorUserId, input.membershipId, input.roleKey);
    if (!res.ok) throw invalid(res.reason);
    return { ok: true };
  },
});

const setCapInput = z.object({ capSatang: z.number().int().min(0).nullable() }).strict();

const settingsPermissionsSetCap = defineOp({
  id: "settings.permissions.set-cap",
  method: "PUT",
  path: "/settings/permissions/caps/{membershipId}",
  kind: "write",
  action: "account.settings.manage",
  summary: "Set the approval ceiling of one staff member in satang. null removes the ceiling.",
  label: "ตั้งเพดานอนุมัติ",
  input: setCapInput,
  test: "D4-S4.6",
  async handler({ actor, params, input }) {
    const ctx = ctxOf(actor);
    const actorUserId = await ownerActorId(ctx);
    const res = await setApprovalCap(ctx, actorUserId, params.membershipId ?? "", input.capSatang);
    if (!res.ok) throw invalid(res.reason);
    return { ok: true };
  },
});

const revokeInput = z.object({ reason: reasonField("Why access is being revoked.") }).strict();

const settingsPermissionsRevoke = defineOp({
  id: "settings.permissions.revoke",
  method: "DELETE",
  path: "/settings/permissions/members/{membershipId}",
  kind: "danger",
  action: "account.settings.manage",
  summary: "Remove all accounting permissions from one staff member. The person stays in the shop and keeps access to other systems.",
  label: "ถอดสิทธิ์บัญชี",
  input: revokeInput,
  test: "D4-S4.7",
  async handler({ actor, params }) {
    const ctx = ctxOf(actor);
    const actorUserId = await ownerActorId(ctx);
    const res = await revokeAccountAccess(ctx, actorUserId, params.membershipId ?? "");
    if (!res.ok) throw invalid(res.reason);
    return { ok: true };
  },
});

// ═══════════════════════════ S5 เชื่อมระบบใน SHARK ═══════════════════════════

const LINK_KINDS = ["POS", "BUSINESS", "CRM", "MEMBER", "INVENTORY", "CHAT", "HR"] as const;
const linkKindField = z.enum(LINK_KINDS);

function linkKindParam(params: Record<string, string>): AccountLinkedKind {
  const raw = params.kind ?? "";
  if (!(LINK_KINDS as readonly string[]).includes(raw)) {
    throw notFound(`ไม่มีการ์ดเชื่อมต่อชนิด "${raw}"`, `No such connection card "${raw}".`);
  }
  return raw as AccountLinkedKind;
}

async function linkResponse(actor: ApiActor, kind: AccountLinkedKind) {
  const cards = await buildConnectionCards(ctxOf(actor), new Date());
  const card = cards.find((c) => c.kind === kind);
  if (!card) throw notFound("ไม่พบการ์ดเชื่อมต่อนี้");
  return linkCardView(card);
}

const linksConnectInput = z.object({ kind: linkKindField, linkedId: z.string().min(1).max(60) }).strict();

const linksConnect = defineOp({
  id: "links.connect",
  method: "POST",
  path: "/links",
  kind: "write",
  action: "account.settings.manage",
  summary: "Link another system in this shop (POS, member system, inventory, ...) to this accounting book.",
  label: "เชื่อมระบบ",
  input: linksConnectInput,
  test: "D4-S5.2",
  async handler({ actor, input }) {
    const ctx = ctxOf(actor);
    if (!(await isValidLinkTarget(ctx, input.kind, input.linkedId))) {
      throw notFound("ไม่พบระบบนี้ในร้าน — เลือกจากระบบที่เปิดใช้งานอยู่จริง", "No such system to link in this shop.");
    }
    const res = await connect(ctx, input.kind, input.linkedId, null);
    if (!res.ok) throw invalid(res.reason);
    return linkResponse(actor, input.kind);
  },
});

const toggleKeys: readonly ToggleKey[] = ["autoCreateContact", "syncProductPrices", "autoPost", "inboxFromChat"];
const optionsField = z
  .object(Object.fromEntries(toggleKeys.map((k) => [k, z.boolean().optional()])) as Record<ToggleKey, z.ZodOptional<z.ZodBoolean>>)
  .strict();

const linksUpdateInput = z.object({ options: optionsField }).strict();

const linksUpdate = defineOp({
  id: "links.update",
  method: "PATCH",
  path: "/links/{kind}",
  kind: "write",
  action: "account.settings.manage",
  summary: "Change the automation options of a linked system (auto-create contact, sync prices, auto-post, inbox from chat).",
  label: "แก้ตัวเลือกการเชื่อมต่อ",
  input: linksUpdateInput,
  test: "D4-S5.3",
  async handler({ actor, params, input }) {
    const ctx = ctxOf(actor);
    const kind = linkKindParam(params);
    const linkedId = await linkedIdOfKind(ctx, kind);
    if (!linkedId) throw notFound("ยังไม่ได้เชื่อมระบบนี้", "This system is not linked yet.");
    const res = await setLinkOptions(ctx, kind, linkedId, input.options as LinkConfig, null);
    if (!res.ok) throw invalid(res.reason);
    return linkResponse(actor, kind);
  },
});

const linksDisconnectInput = z.object({ reason: reasonField("Why this system is being unlinked.") }).strict();

const linksDisconnect = defineOp({
  id: "links.disconnect",
  method: "DELETE",
  path: "/links/{kind}",
  kind: "danger",
  action: "account.settings.manage",
  summary: "Unlink a system. Nothing already posted is undone, but new activity from it stops posting to this book.",
  label: "ตัดการเชื่อมต่อ",
  input: linksDisconnectInput,
  test: "D4-S5.4",
  async handler({ actor, params }) {
    const ctx = ctxOf(actor);
    const kind = linkKindParam(params);
    const linkedId = await linkedIdOfKind(ctx, kind);
    if (!linkedId) throw notFound("ยังไม่ได้เชื่อมระบบนี้", "This system is not linked yet.");
    const res = await disconnect(ctx, kind, linkedId, null);
    if (!res.ok) throw invalid(res.reason);
    return linkResponse(actor, kind);
  },
});

// ═══════════════════════════ S6 คีย์ API (list เท่านั้น) ═══════════════════════════
//
// 🔴 ห้ามเพิ่ม POST /api-keys ที่นี่หรือที่ไหนก็ตาม — คีย์ที่ใช้สร้างคีย์อื่นได้ = ยกระดับสิทธิ์ตัวเอง
//    ไม่มีการตรวจใดกันได้ (คีย์เดิมถือ scope ชุดหนึ่งไปตลอดอายุ) ⇒ การสร้าง/หมุนคีย์ทำได้ทางหน้าเว็บเท่านั้น
//    (ไม่ลงทะเบียน op ก็พอ — `matchOp` หา path `/api-keys` เจอแค่ GET ⇒ POST ได้ 405 อัตโนมัติจาก registry)

const apiKeysList = defineOp({
  id: "api-keys.list",
  method: "GET",
  path: "/api-keys",
  kind: "read",
  action: "account.settings.manage",
  summary: "API keys of this shop (scopes, which book they are bound to, expiry). Never includes the key value or its hash.",
  label: "รายการคีย์ API",
  test: "D4-S6.9",
  async handler({ actor }) {
    const rows = await listApiKeys({ tenantId: actor.tenantId });
    return rows.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      bundleLabel: bundleLabelForScopes(k.scopes),
      systemId: k.systemId,
      expiresAt: iso(k.expiresAt),
      lastUsedAt: iso(k.lastUsedAt),
      revoked: k.revokedAt != null,
    }));
  },
});

export const SETTINGS_WRITE_OPS: ApiOp[] = [
  settingsUpdate,
  settingsDocumentsUpdate,
  settingsDocumentsNextNo,
  settingsTagsCreate,
  settingsPolicyUpdate,
  settingsPermissionsGet,
  settingsPermissionsAddRole,
  settingsPermissionsSaveRole,
  settingsPermissionsAssign,
  settingsPermissionsSetCap,
  settingsPermissionsRevoke,
  linksConnect,
  linksUpdate,
  linksDisconnect,
  apiKeysList,
];
