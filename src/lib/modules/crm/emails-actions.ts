"use server";

// emails-actions.ts — server actions ของหน้าจออีเมล CRM (ใบ C2.5b · ภาพ 08 กลาง · ภาพ 15)
//   หน้า `/crm/emails` · `/crm/emails/[threadKey]` · `/crm/settings/email` เรียกผ่านที่นี่ที่เดียว
//
// 🔴 "use server" = ส่งออกได้เฉพาะ **async function** — ชนิด/ค่าคงที่ส่งออกจากที่นี่ไม่ได้ (หน้า 500 ทั้งที่ build ผ่าน
//    · reference_next_use_server_no_type_export) ⇒ ชนิดทั้งหมดอยู่ที่ `src/components/crm/emails/types.ts`
// 🔴 tenantId มาจาก session เสมอ · systemId ถูก re-resolve ในบริการ (`emails.ts`) — ไม่เชื่อ id จากหน้าจอ
// 🔴 ลำดับด่านเดียวกับบริการ: ระบบ CRM ของร้าน (NOT_FOUND) → uiVersion 2 (`assertCrmV2`) → คีย์ (`crmCan`)
//    ที่นี่ตรวจ "ด่านหน้า" อีกชั้นเพื่อไม่ให้ action ที่ไม่มีสิทธิ์ไปแตะบริการเลย — บริการยังตรวจซ้ำเองทุกครั้ง
// 🔴 ข้อความ error เป็นภาษาไทยที่ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลาง (รายละเอียดไม่หลุดออกหน้าจอ)
// 🔴 AUDIT-CLASS X8: ไม่ log หัวเรื่อง/เนื้อความ/ที่อยู่ — บันทึกเฉพาะชนิดของ error

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import type { MemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "./access";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import { EmailError } from "./emails";
import * as emails from "./emails";
import * as activities from "./activities";
import type { CrmEmailActionResult } from "@/components/crm/emails/types";

type Ctx = { tenantId: string; systemId: string; actorUserId: string };

async function session(systemId: string, key: string): Promise<{ ctx: Ctx; actor: MemberActor }> {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  // AUDIT-CLASS X2: ด่านคีย์สิทธิ์ตัวเดียวของ CRM (`access.ts`) — บริการตรวจซ้ำอีกชั้นเสมอ
  assertCanCrm(actor, key);
  return { ctx, actor };
}

function failOf(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof EmailError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.email] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "ทำรายการไม่สำเร็จ ระบบยกเลิกให้แล้ว (ข้อมูลอีเมลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touchInbox = (systemId: string) => revalidatePath(`/app/sys/${systemId}/crm/emails`);
const touchThread = (systemId: string, threadKey: string) => revalidatePath(`/app/sys/${systemId}/crm/emails/${threadKey}`);
const touchSettings = (systemId: string) => revalidatePath(`/app/sys/${systemId}/crm/settings/email`);

// ───────────────────────── เขียนจดหมาย ─────────────────────────

/**
 * ส่งจดหมาย 1 ฉบับจากหน้าเธรด (ตอบในเธรดเดิม หรือเปิดเรื่องใหม่กับผู้ติดต่อคนนี้)
 * ไฟล์แนบมาเป็น base64 จากเบราว์เซอร์ (input type=file อ่านเองฝั่ง client) — บริการตรวจชนิด/ขนาด/จำนวนอีกชั้น
 */
export async function sendCrmEmailAction(
  systemId: string,
  input: {
    contactId: string;
    to?: string[];
    subject: string;
    bodyHtml: string;
    templateId?: string | null;
    scheduledAt?: string | null;
    replyToEmailId?: string | null;
    attachments?: { filename: string; contentType: string; base64: string }[];
  },
): Promise<CrmEmailActionResult<{ emailId: string; threadKey: string; status: string }>> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.send");
    const files = (input?.attachments ?? []).map((a) => ({
      filename: String(a?.filename ?? "ไฟล์แนบ"),
      contentType: String(a?.contentType ?? ""),
      data: new Uint8Array(Buffer.from(String(a?.base64 ?? ""), "base64")),
    }));
    const r = await emails.sendEmail(ctx, actor, {
      contactId: String(input?.contactId ?? ""),
      ...(Array.isArray(input?.to) && input.to.length ? { to: input.to } : {}),
      subject: String(input?.subject ?? ""),
      bodyHtml: String(input?.bodyHtml ?? ""),
      ...(input?.templateId ? { templateId: input.templateId } : {}),
      ...(input?.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
      ...(input?.replyToEmailId ? { replyToEmailId: input.replyToEmailId } : {}),
      ...(files.length ? { attachments: files } : {}),
    });
    touchInbox(systemId);
    touchThread(systemId, r.threadKey);
    return { ok: true, emailId: r.emailId, threadKey: r.threadKey, status: r.status };
  } catch (e) {
    return failOf(e);
  }
}

/** ลิงก์ชั่วคราวของไฟล์แนบ (AUDIT-CLASS X10 — ออกตอนกดเท่านั้น ผูกกับผู้ดูคนนี้ หมดอายุใน 15 นาที) */
export async function crmEmailAttachmentUrlAction(systemId: string, emailId: string, fileId: string): Promise<CrmEmailActionResult<{ url: string; expiresAt: string }>> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.read");
    const r = await emails.attachmentUrl(ctx, actor, String(emailId ?? ""), String(fileId ?? ""));
    return { ok: true, url: r.url, expiresAt: r.expiresAt };
  } catch (e) {
    return failOf(e);
  }
}

/** ค้นผู้ติดต่อเพื่อผูกจดหมายในกล่อง "ยังไม่จับคู่" (อ่านอย่างเดียว) */
export async function searchCrmEmailContactsAction(systemId: string, q: string): Promise<CrmEmailActionResult<{ items: { id: string; name: string }[] }>> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.read");
    const rows = await activities.searchTargets(ctx, actor, String(q ?? ""));
    return { ok: true, items: rows.filter((r) => r.kind === "CONTACT").slice(0, 20).map((r) => ({ id: r.id, name: r.name })) };
  } catch (e) {
    return failOf(e);
  }
}

/** ผูกจดหมายที่ยังไม่จับคู่เข้ากับผู้ติดต่อ (matchedBy MANUAL + กิจกรรม 1 แถว + audit crm.email.attach) */
export async function attachCrmEmailToContactAction(systemId: string, emailId: string, contactId: string): Promise<CrmEmailActionResult<{ contactId: string }>> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.read");
    const r = await emails.attachToContact(ctx, actor, String(emailId ?? ""), String(contactId ?? ""));
    touchInbox(systemId);
    return { ok: true, contactId: r.contactId };
  } catch (e) {
    return failOf(e);
  }
}

// ───────────────────────── ตั้งค่าอีเมลของร้าน (ภาพ 15) ─────────────────────────

export async function saveCrmEmailSettingsAction(systemId: string, patch: Record<string, unknown>): Promise<CrmEmailActionResult> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.settings");
    await emails.setEmailSettings(ctx, actor, patch);
    touchSettings(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** DANGER (X9): ที่อยู่กล่องขาเข้าเดิมหยุดรับจดหมายทันที — ต้องยืนยัน + เหตุผล */
export async function rotateCrmInboundKeyAction(systemId: string, reason: string): Promise<CrmEmailActionResult<{ address: string }>> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.settings");
    const r = await emails.rotateInboundKey(ctx, actor, { confirm: true, reason: String(reason ?? "") });
    touchSettings(systemId);
    return { ok: true, address: r.address };
  } catch (e) {
    return failOf(e);
  }
}

export async function saveCrmEmailUserSettingAction(
  systemId: string,
  patch: { userId?: string | null; fromName?: string | null; fromAddr?: string | null; replyToMode?: string | null; replyToAddr?: string | null; copyToAddr?: string | null; copyMode?: string | null; signatureHtml?: string | null },
): Promise<CrmEmailActionResult> {
  try {
    // แถวของตัวเองใช้คีย์ส่งอีเมล · แถวของคนอื่นต้องมีคีย์ตั้งค่า (บริการตรวจซ้ำอีกชั้น)
    const auth = await requireTenant();
    const own = !patch?.userId || String(patch.userId) === auth.user.id;
    const { ctx, actor } = await session(systemId, own ? "crm.email.send" : "crm.email.settings");
    await emails.setUserSetting(ctx, actor, patch);
    touchSettings(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function addCrmEmailDomainAction(systemId: string, domain: string): Promise<CrmEmailActionResult<{ id: string }>> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.settings");
    const r = await emails.addDomain(ctx, actor, { domain: String(domain ?? "") });
    touchSettings(systemId);
    return { ok: true, id: r.id };
  } catch (e) {
    return failOf(e);
  }
}

export async function refreshCrmEmailDomainAction(systemId: string, domainId: string): Promise<CrmEmailActionResult<{ status: string }>> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.settings");
    const r = await emails.refreshDomain(ctx, actor, String(domainId ?? ""));
    touchSettings(systemId);
    return { ok: true, status: r.status };
  } catch (e) {
    return failOf(e);
  }
}

/** ส่งจดหมายทดสอบถึงอีเมลของคนที่กดเอง (ไม่มีแถว CrmEmailMessage · ไม่มีพิกเซล) */
export async function sendCrmEmailTestAction(systemId: string): Promise<CrmEmailActionResult<{ sent: boolean }>> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.settings");
    const r = await emails.sendTest(ctx, actor);
    return { ok: true, sent: r.ok };
  } catch (e) {
    return failOf(e);
  }
}

// ───────────────────────── แม่แบบจดหมาย ─────────────────────────

export async function saveCrmEmailTemplateAction(
  systemId: string,
  input: { id?: string | null; name: string; subject: string; bodyHtml: string; category?: string | null; active?: boolean },
): Promise<CrmEmailActionResult<{ id: string }>> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.settings");
    const r = await emails.saveTemplate(ctx, actor, {
      ...(input?.id ? { id: input.id } : {}),
      name: String(input?.name ?? ""),
      subject: String(input?.subject ?? ""),
      bodyHtml: String(input?.bodyHtml ?? ""),
      category: input?.category ?? null,
      ...(input?.active === undefined ? {} : { active: input.active === true }),
    });
    touchSettings(systemId);
    return { ok: true, id: r.id };
  } catch (e) {
    return failOf(e);
  }
}

export async function deleteCrmEmailTemplateAction(systemId: string, templateId: string): Promise<CrmEmailActionResult> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.settings");
    await emails.deleteTemplate(ctx, actor, String(templateId ?? ""));
    touchSettings(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** เนื้อความของแม่แบบ 1 ใบ (ให้หน้าเขียนจดหมายเติมลงช่องเมื่อเลือกแม่แบบ) */
export async function getCrmEmailTemplateAction(systemId: string, templateId: string): Promise<CrmEmailActionResult<{ subject: string; bodyHtml: string }>> {
  try {
    const { ctx, actor } = await session(systemId, "crm.email.read");
    const rows = await emails.listTemplates(ctx, actor);
    const one = rows.find((t) => t.id === String(templateId ?? ""));
    if (!one) return { ok: false, error: "ไม่พบแม่แบบจดหมายนี้แล้ว — รีเฟรชหน้าแล้วเลือกใหม่", code: "NOT_FOUND" };
    return { ok: true, subject: one.subject, bodyHtml: one.bodyHtml };
  } catch (e) {
    return failOf(e);
  }
}
