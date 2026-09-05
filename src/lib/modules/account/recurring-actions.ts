"use server";

import { redirect } from "next/navigation";
import { safeReason } from "./errors";
import { revalidatePath } from "next/cache";
import type { AccountDocType, AccountRecurringFrequency } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit } from "./access";
import { publicOrigin } from "@/lib/core/origin";
// 🔴 ไฟล์นี้ **ไม่ import prisma** โดยเจตนา — ทุกการแตะ DB ผ่าน service.ts (fitness F5 · เหมือน editor-actions.ts)
import {
  createRecurringRule,
  updateRecurringRule,
  setRecurringRuleActive,
  deleteRecurringRule,
  runRecurringRules,
  runAccountReminders,
  sendPaymentReminder,
  type RecurringRuleInput,
} from "./service";
import {
  isFrequency,
  isRecurringDocType,
  normDayOfMonth,
  normWeekday,
  parseRecurringTemplate,
  parseYmd,
  validateRuleInput,
  type RecurringRulePayload,
  type SaveRuleResult,
} from "./recurring-shared";

// ─────────────────────────────────────────────────────────────
// recurring-actions.ts — server actions ของ "เอกสารประจำ" (WO 1.9)
//
// กติกาความปลอดภัยที่ทุก action ในไฟล์นี้ทำ **ตามลำดับนี้เสมอ** (เหมือน editor-actions.ts):
//   1) loadAccountSystem(systemId)  → ผูก tenant + ยืนยันว่าระบบนี้เป็น ACCOUNT ของ tenant ที่ล็อกอิน
//   2) assertAccountCan(auth, …)    → สิทธิ์ (ห้ามพึ่งว่า "หน้าไม่โชว์ปุ่ม")
//   3) ทุก query ผูก { tenantId, systemId } — id ที่ client ส่งมาเป็นแค่ "คำขอ" ไม่ใช่ความจริง
//   4) ค่าจากฟอร์มถูก sanitize ใหม่ฝั่ง server ทุกครั้ง (จำนวน/ราคา/วันที่/ความถี่)
//
// สิทธิ์ที่ใช้ (ไม่มี key ใหม่ — ดู ledger/wo-notes/1.9.md ข้อ 2):
//   ดูรายการกฎ      → account.doc.view
//   สร้าง/แก้/เปิด-ปิด/สั่งรันเอง → account.doc.create
//   เตือนชำระลูกค้า → account.payment.record (เป็นงานติดตามหนี้ ไม่ใช่การออกเอกสาร)
// ─────────────────────────────────────────────────────────────

const trim = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown) => {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** แปลง payload จากเบราว์เซอร์ → input ที่ service ยอมรับ (หรือรายการเหตุผลไทยที่ยังไม่ผ่าน) */
function sanitizeRulePayload(
  payload: RecurringRulePayload,
): { ok: true; input: RecurringRuleInput } | { ok: false; reason: string } {
  const template = parseRecurringTemplate(payload?.template);
  const frequency = payload?.frequency;
  const startDate = parseYmd(payload?.startDate);
  const endDate = parseYmd(payload?.endDate);
  const leadDays = Math.min(60, Math.max(0, int(payload?.leadDays)));
  const errs = validateRuleInput({
    name: trim(payload?.name, 120),
    docType: String(payload?.docType ?? ""),
    frequency: String(frequency ?? ""),
    startDate,
    endDate,
    template,
    leadDays,
  });
  if (errs.length > 0) return { ok: false, reason: errs[0] };
  // ผ่าน validateRuleInput แล้ว = ชนิด/ความถี่/วันที่ถูกต้องแน่ (ตัว guard ด้านล่างมีไว้ให้ TS มั่นใจ)
  if (!isRecurringDocType(payload.docType) || !isFrequency(frequency) || !startDate)
    return { ok: false, reason: "ข้อมูลตารางเวลาไม่ครบ" };

  const isWeekly = frequency === "WEEKLY";
  return {
    ok: true,
    input: {
      name: trim(payload.name, 120),
      docType: payload.docType as AccountDocType,
      contactId: payload.contactId ? trim(payload.contactId, 40) : null,
      template,
      frequency: frequency as AccountRecurringFrequency,
      // เก็บเฉพาะช่องที่ความถี่นั้นใช้จริง — อีกช่องเป็น null เสมอ (กันข้อมูลกำกวมในตาราง)
      dayOfMonth: isWeekly ? null : normDayOfMonth(int(payload.dayOfMonth) || startDate.getUTCDate()),
      weekday: isWeekly ? normWeekday(int(payload.weekday)) : null,
      startDate,
      endDate,
      leadDays,
      autoApprove: payload.autoApprove === true,
      active: payload.active !== false,
    },
  };
}

/** บันทึกกฎ (สร้างใหม่ถ้าไม่มี ruleId · ทับของเดิมถ้ามี) */
export async function saveRecurringRuleAction(payload: RecurringRulePayload): Promise<SaveRuleResult> {
  const systemId = trim(payload?.systemId, 40);
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(systemId);
    assertAccountCan(auth, "account.doc.create");
    const s = sanitizeRulePayload(payload);
    if (!s.ok) return { ok: false, reason: s.reason };

    const ruleId = trim(payload?.ruleId, 40);
    if (ruleId) {
      const res = await updateRecurringRule(tenantId, systemId, ruleId, s.input);
      if (!res.ok) return { ok: false, reason: res.reason };
      await writeAudit({
        tenantId,
        actorId: userId,
        action: "account.doc.create",
        targetType: "AccountRecurringRule",
        targetId: ruleId,
        after: { name: s.input.name, docType: s.input.docType, frequency: s.input.frequency, edit: true },
      });
      revalidatePath(`/app/sys/${systemId}/account/recurring`);
      return { ok: true, id: ruleId };
    }

    const res = await createRecurringRule(tenantId, systemId, s.input, userId);
    if (!res.ok) return { ok: false, reason: res.reason };
    await writeAudit({
      tenantId,
      actorId: userId,
      action: "account.doc.create",
      targetType: "AccountRecurringRule",
      targetId: res.id,
      after: { name: s.input.name, docType: s.input.docType, frequency: s.input.frequency },
    });
    revalidatePath(`/app/sys/${systemId}/account/recurring`);
    return { ok: true, id: res.id };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกเอกสารประจำไม่สำเร็จ") };
  }
}

/** เปิด/ปิดกฎจากหน้ารายการ (ปุ่มในเมนู "ทำรายการ") */
export async function toggleRecurringRuleAction(formData: FormData) {
  const systemId = trim(formData.get("systemId"), 40);
  const id = trim(formData.get("id"), 40);
  const active = trim(formData.get("active"), 5) === "1";
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  const res = await setRecurringRuleActive(tenantId, systemId, id, active);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.create",
    targetType: "AccountRecurringRule",
    targetId: id,
    after: { active },
  });
  const base = `/app/sys/${systemId}/account/recurring`;
  revalidatePath(base);
  redirect(res.ok ? base : `${base}?err=${encodeURIComponent(res.reason)}`);
}

/**
 * "สร้างตอนนี้" — รันกฎของ **ระบบนี้เท่านั้น** (ไม่ใช่ทั้งแพลตฟอร์มแบบ cron)
 * ปลอดภัยเพราะตัวสร้างเป็น idempotent อยู่แล้ว (กดรัว ๆ ก็ได้เอกสารงวดละใบ)
 */
export async function runRecurringNowAction(formData: FormData) {
  const systemId = trim(formData.get("systemId"), 40);
  // ส่ง `id` มา = สั่งเฉพาะกฎนั้น (เมนู "ทำรายการ" ของแถว) · ไม่ส่ง = ทุกกฎของระบบนี้ (ปุ่มหัวหน้า)
  const ruleId = trim(formData.get("id"), 40);
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  const res = await runRecurringRules(new Date(), { tenantId, systemId, ruleId: ruleId || undefined });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.create",
    targetType: "AccountRecurringRule",
    targetId: systemId,
    after: { manualRun: true, ...res },
  });
  const base = `/app/sys/${systemId}/account/recurring`;
  revalidatePath(base);
  const msg =
    res.created === 0
      ? "ยังไม่ถึงรอบของเอกสารประจำใด — ไม่มีอะไรถูกสร้าง"
      : `สร้างเอกสารใหม่ ${res.created} ใบ (ออกอัตโนมัติ ${res.issued} ใบ)`;
  redirect(`${base}?msg=${encodeURIComponent(msg)}`);
}

/** ลบกฎทิ้ง (เอกสารที่ออกไปแล้วไม่ถูกแตะ) */
export async function deleteRecurringRuleAction(formData: FormData) {
  const systemId = trim(formData.get("systemId"), 40);
  const id = trim(formData.get("id"), 40);
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  const res = await deleteRecurringRule(tenantId, systemId, id);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.create",
    targetType: "AccountRecurringRule",
    targetId: id,
    after: { deleted: res.ok },
  });
  const base = `/app/sys/${systemId}/account/recurring`;
  revalidatePath(base);
  redirect(
    res.ok
      ? `${base}?msg=${encodeURIComponent("ลบเอกสารประจำแล้ว (เอกสารที่ออกไปแล้วยังอยู่ครบ)")}`
      : `${base}?err=${encodeURIComponent(res.reason)}`,
  );
}

/** สั่งรอบเตือนของระบบนี้เอง (ปุ่มทดสอบบนหน้ารายการ — cron ทำให้อยู่แล้ววันละครั้ง) */
export async function runRemindersNowAction(formData: FormData) {
  const systemId = trim(formData.get("systemId"), 40);
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.payment.record");
  const res = await runAccountReminders(new Date(), { tenantId, systemId });
  const sent = res.DUE_TOMORROW + res.OVERDUE_TODAY + res.PTX_AWAITING + res.CHEQUE_DUE + res.PP30_DUE;
  const base = `/app/sys/${systemId}/account/recurring`;
  revalidatePath(base);
  redirect(
    `${base}?msg=${encodeURIComponent(
      sent === 0 ? "ไม่มีเรื่องต้องเตือนเพิ่มวันนี้ (เตือนไปแล้ว/ไม่มีรายการถึงกำหนด)" : `ส่งแจ้งเตือนใหม่ ${sent} รายการ`,
    )}`,
  );
}

/**
 * ⋯ "เตือนชำระ" บนหน้าเอกสาร (§5.3) — ส่งอีเมลถึงลูกค้าพร้อมลิงก์เอกสาร
 * กลับมาที่หน้าเดิมพร้อมข้อความไทย (`?msg=` / `?err=`) ตามแบบของ WO 1.5/1.6
 */
export async function sendPaymentReminderAction(formData: FormData) {
  const systemId = trim(formData.get("systemId"), 40);
  const id = trim(formData.get("id"), 40);
  const backTo = trim(formData.get("backTo"), 300);
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.payment.record");
  const origin = await publicOrigin();
  const res = await sendPaymentReminder(tenantId, systemId, id, { actorId: userId, origin });
  // 🔴 ปลายทางต้องเป็นเส้นทางภายในเสมอ — ค่าจากฟอร์มอาจถูกยัด URL ข้ามโดเมนมา (open redirect)
  const safeBack = backTo.startsWith("/app/") ? backTo : `/app/sys/${systemId}/account`;
  revalidatePath(safeBack);
  redirect(
    res.ok
      ? `${safeBack}?msg=${encodeURIComponent(`ส่งอีเมลเตือนชำระถึง ${res.email} แล้ว`)}`
      : `${safeBack}?err=${encodeURIComponent(res.reason)}`,
  );
}
