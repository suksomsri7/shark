"use server";

// settings-actions.ts — server actions ของหน้า "ตั้งค่า › เอกสารและเลขที่" (WO 8.1 · §9.2)
//
// ทุกตัวผ่านด่านเดียวกัน: loadAccountSystem (ระบบเป็นของร้านนี้จริง) → assertAccountCan
// ("account.settings.manage") → ทำงาน → writeAudit → revalidate
// 🔴 ผลลัพธ์เป็น { ok, reason } เสมอ (ไม่ throw ให้ผู้ใช้เห็น stack) — ฟอร์มเอาไปแสดง inline ตาม §0.3(9)

import { revalidatePath } from "next/cache";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit } from "./access";
import {
  archiveDocTag,
  createDocTag,
  getDocSettings,
  resetDocSettings,
  saveDocSettings,
  setDocNextNo,
  setDocTypeAccount,
  updateDocTag,
} from "./doc-settings";
import {
  NUMBERED_DOC_TYPES,
  toSeqReset,
  type AutoTaxInvoiceMode,
  type DocNoteConfig,
  type DocSettingsPatch,
  type PrintField,
  type PrintLanguage,
  type PrintTemplate,
  type SeqConfig,
  PRINT_FIELDS,
} from "./settings-schema";

export type ActionResult = { ok: true } | { ok: false; reason: string };

const SETTINGS_PATH = (systemId: string) => `/app/sys/${systemId}/account/settings/documents`;

async function gate(systemId: string) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.settings.manage");
  return { tenantId, systemId, userId };
}

async function audit(tenantId: string, userId: string | null, systemId: string, what: string, after?: unknown) {
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "AccountSettings",
    targetId: systemId,
    after: { section: what, ...(after ? { value: after } : {}) },
  });
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string, dflt: number) => {
  const v = Number.parseInt(String(fd.get(k) ?? ""), 10);
  return Number.isFinite(v) ? v : dflt;
};
const on = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "1" || fd.get(k) === "true";

function isDocType(v: string): v is AccountDocType {
  return (NUMBERED_DOC_TYPES as readonly string[]).includes(v);
}

// ─────────────────── ① เลขที่เอกสาร + กฎอัตโนมัติ (การ์ดบน+ล่างของ f10) ───────────────────

export async function saveDocNumberingAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);

  const sequences: Record<string, Partial<SeqConfig>> = {};
  for (const dt of NUMBERED_DOC_TYPES) {
    if (formData.get(`seq_${dt}_prefix`) === null) continue; // แถวที่ฟอร์มไม่ได้ส่งมา = ไม่แตะ
    sequences[dt] = {
      prefix: s(formData, `seq_${dt}_prefix`),
      pattern: s(formData, `seq_${dt}_pattern`),
      reset: toSeqReset(s(formData, `seq_${dt}_reset`)),
    };
  }
  // การ์ด "กฎอัตโนมัติของเอกสาร" (f10) มี 2 สวิตช์ที่เป็นค่าเดียวกับหัวข้อย่อยอื่น
  // ⇒ อ่านค่าปัจจุบันมาก่อน แล้วแก้เฉพาะช่อง on/off (ไม่ล้างข้อความ/ตัวเลือกละเอียดที่ตั้งไว้)
  const cur = await getDocSettings({ tenantId, systemId });
  const patch: DocSettingsPatch = {
    sequences,
    rules: { lockNumberOnIssue: on(formData, "lockNumberOnIssue"), warnOnGap: on(formData, "warnOnGap") },
    autoTaxInvoice: {
      ...cur.autoTaxInvoice,
      mode: on(formData, "autoTaxOnPayment")
        ? "ON_PAYMENT"
        : cur.autoTaxInvoice.mode === "ON_PAYMENT"
          ? "MANUAL"
          : cur.autoTaxInvoice.mode,
    },
    taxRequest: { ...cur.taxRequest, enabled: on(formData, "publicTaxRequest") },
  };
  const saved = await saveDocSettings({ tenantId, systemId }, patch);
  if (!saved.ok) return saved;

  // "เลขถัดไป" แก้แยกจาก pattern เพราะมันเขียนตัวนับ ไม่ใช่ตั้งค่า — ปฏิเสธได้รายชนิด
  const now = new Date();
  for (const dt of NUMBERED_DOC_TYPES) {
    const raw = formData.get(`seq_${dt}_next`);
    if (raw === null || String(raw).trim() === "") continue;
    const want = Number.parseInt(String(raw), 10);
    const current = Number.parseInt(String(formData.get(`seq_${dt}_next_current`) ?? ""), 10);
    if (!Number.isFinite(want) || want === current) continue; // ไม่ได้แก้ = ไม่ต้องเขียนตัวนับ
    const res = await setDocNextNo({ tenantId, systemId }, dt, want, now);
    if (!res.ok) return res;
  }

  await audit(tenantId, userId, systemId, "เลขที่เอกสาร");
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}

// ─────────────────── ② หมายเหตุ + เงื่อนไขการชำระ ต่อชนิด ───────────────────

export async function saveDocNotesAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const notes: Record<string, Partial<DocNoteConfig>> = {};
  for (const dt of NUMBERED_DOC_TYPES) {
    if (formData.get(`note_${dt}_footer`) === null && formData.get(`note_${dt}_terms`) === null) continue;
    notes[dt] = { footer: s(formData, `note_${dt}_footer`), terms: s(formData, `note_${dt}_terms`) };
  }
  const res = await saveDocSettings({ tenantId, systemId }, { notes });
  if (!res.ok) return res;
  await audit(tenantId, userId, systemId, "หมายเหตุเอกสาร");
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}

// ─────────────────── ③ วันครบกำหนด ───────────────────

export async function saveDueDefaultsAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const res = await saveDocSettings(
    { tenantId, systemId },
    {
      due: {
        quotationValidDays: n(formData, "quotationValidDays", 30),
        invoiceCreditDays: n(formData, "invoiceCreditDays", 30),
        purchaseOrderDueDays: n(formData, "purchaseOrderDueDays", 7),
        basis: s(formData, "dueBasis") === "MONTH_END" ? "MONTH_END" : "ISSUE",
      },
    },
  );
  if (!res.ok) return res;
  await audit(tenantId, userId, systemId, "วันครบกำหนด");
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}

// ─────────────────── ④ ช่องทางรับชำระบนเอกสาร (ลำดับ) ───────────────────

export async function saveChannelOrderAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const order = s(formData, "order")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const res = await saveDocSettings({ tenantId, systemId }, { channels: { order } });
  if (!res.ok) return res;
  await audit(tenantId, userId, systemId, "ช่องทางรับชำระบนเอกสาร");
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}

// ─────────────────── ⑤ ลิงก์สาธารณะ + ลิงก์ขอใบกำกับ ───────────────────

export async function savePublicLinkAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const res = await saveDocSettings(
    { tenantId, systemId },
    {
      publicView: {
        enabled: on(formData, "publicEnabled"),
        showOutstanding: on(formData, "showOutstanding"),
        promptPayButton: on(formData, "promptPayButton"),
        expiryDays: n(formData, "expiryDays", 0),
      },
      taxRequest: {
        enabled: on(formData, "taxRequestEnabled"),
        receiptText: s(formData, "receiptText"),
        conditionNote: s(formData, "conditionNote"),
        minAmountSatang: Math.max(0, Math.round(Number.parseFloat(s(formData, "minAmountBaht") || "0") * 100)),
      },
    },
  );
  if (!res.ok) return res;
  await audit(tenantId, userId, systemId, "ลิงก์สาธารณะและ QR");
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}

// ─────────────────── ⑥ ใบกำกับภาษีอัตโนมัติ ───────────────────

export async function saveAutoTaxInvoiceAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const raw = s(formData, "mode");
  const mode: AutoTaxInvoiceMode =
    raw === "ON_INVOICE" || raw === "MANUAL" || raw === "ON_PAYMENT" ? raw : "ON_PAYMENT";
  const res = await saveDocSettings(
    { tenantId, systemId },
    { autoTaxInvoice: { mode, posAbbreviated: on(formData, "posAbbreviated"), legalText: s(formData, "legalText") } },
  );
  if (!res.ok) return res;
  await audit(tenantId, userId, systemId, "ใบกำกับภาษีอัตโนมัติ", { mode });
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}

// ─────────────────── ⑦ เทมเพลตพิมพ์ ───────────────────

export async function savePrintTemplateAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const t = s(formData, "template");
  const template: PrintTemplate = t === "COMPACT" || t === "WITH_IMAGES" ? t : "STANDARD";
  const language: PrintLanguage = s(formData, "language") === "EN" ? "EN" : "TH";
  const fields = {} as Record<PrintField, boolean>;
  for (const f of PRINT_FIELDS) fields[f] = on(formData, `field_${f}`);
  const res = await saveDocSettings({ tenantId, systemId }, { print: { template, language, fields } });
  if (!res.ok) return res;
  await audit(tenantId, userId, systemId, "เทมเพลตพิมพ์", { template, language });
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}

// ─────────────────── ⑧ แท็ก ───────────────────

export async function saveDocTagAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const id = s(formData, "id");
  const name = s(formData, "name");
  const color = s(formData, "color") || "slate";
  const docTypes = formData.getAll("docTypes").map(String).filter(isDocType);
  const res = id
    ? await updateDocTag({ tenantId, systemId }, id, { name, color, docTypes })
    : await createDocTag({ tenantId, systemId }, { name, color, docTypes });
  if (!res.ok) return res;
  await audit(tenantId, userId, systemId, id ? "แก้แท็ก" : "เพิ่มแท็ก", { name });
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}

export async function archiveDocTagAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const res = await archiveDocTag({ tenantId, systemId }, s(formData, "id"), !on(formData, "restore"));
  if (!res.ok) return res;
  await audit(tenantId, userId, systemId, "เก็บแท็กเข้ากรุ");
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}

// ─────────────────── ⑨ บัญชีรายวันของเอกสาร (override ต่อชนิด) ───────────────────

export async function saveDocTypeAccountAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  for (const dt of NUMBERED_DOC_TYPES) {
    const raw = formData.get(`acct_${dt}`);
    if (raw === null) continue;
    const res = await setDocTypeAccount({ tenantId, systemId }, dt, String(raw).trim() || null);
    if (!res.ok) return res;
  }
  await audit(tenantId, userId, systemId, "บัญชีรายวันของเอกสาร");
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}

// ─────────────────── ⑩ คืนค่าเริ่มต้น ───────────────────

export async function resetDocSettingsAction(formData: FormData): Promise<ActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const res = await resetDocSettings({ tenantId, systemId });
  if (!res.ok) return res;
  await audit(tenantId, userId, systemId, "คืนค่าเริ่มต้น");
  revalidatePath(SETTINGS_PATH(systemId));
  return { ok: true };
}
