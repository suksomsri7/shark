"use server";

// privacy-actions.ts — server actions ของ PDPA + อายุเก็บ + เพดาน (CRM v2 · ใบ C3.9)
// 🔴 "use server" = export ได้เฉพาะ async function (ชนิด/ค่าคงที่อยู่ที่ privacy-shared.ts · limits-shared.ts)
// 🔴 tenantId มาจาก session เสมอ · systemId จากหน้าเป็นแค่ "ตัวเลือก" — บริการ resolve ใหม่ (ต้องเป็นระบบ CRM ของร้านนี้)
// 🔴 F6: ทุก action ตรวจสิทธิ์ด้วย assertCanCrm ก่อนลงมือ (บริการตรวจซ้ำอีกชั้น) · ไม่โยน error ดิบถึงหน้าจอ — ข้อความไทยไม่โทษผู้ใช้

import { revalidateAndWake } from "./outbox-wake"; // CRM C5.4-D ▸ L3-M1b: รีเฟรชหน้า + ปลุกคิว outbox หลังเขียนสำเร็จ ◂
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { toMemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "./access";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import { eraseContact, exportContact, exportTenant, getExport, listMyExports, retentionSettings, type PrivacyCtx } from "./privacy";
import { ERASE_PENDING_MESSAGE, LEAD_RETENTION_CONFIRM_WORD, PrivacyError, type CrmExportDto, type EraseCounts } from "./privacy-shared";
import { setCrmRetentionKeys } from "./settings";
import { CrmLimitError } from "./limits-shared";

type Fail = { ok: false; error: string; code?: string };

async function session(systemId: string, key: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  assertCanCrm(actor, key);
  const ctx: PrivacyCtx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  return { ctx, actor };
}

function failOf(e: unknown): Fail {
  if (e instanceof PrivacyError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof CrmLimitError) return { ok: false, error: e.message, code: "LIMIT" };
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ในระบบ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
  if (e instanceof Error && e.constructor === Error && /[ก-๙]/.test(e.message)) return { ok: false, error: e.message, code: "VALIDATION" };
  // 🔴 ไม่ส่งรายละเอียดทางเทคนิค/ข้อมูลลูกค้าออกไป (log แค่ชนิด error)
  console.error(`[crm.privacy] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "ทำรายการไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว — ลองใหม่อีกครั้ง" };
}

/** ลบข้อมูลส่วนบุคคลของผู้ติดต่อ (PDPA · danger — ยืนยัน + เหตุผล ≥ 5 · คีย์ crm.contact.delete) */
// รีวิว C3.9 B3: commit แล้ว = ลบแล้วเสมอ — ขั้นหลัง commit ที่ยังไม่ครบ (followUp PENDING) ไม่ใช่ความล้มเหลวของคำขอนี้
//   ⇒ ตอบ ok + ข้อความ "ลบแล้ว · กำลังล้างข้อมูลที่เชื่อมโยง" (ตัวรับ `crm.contact.erased` ทำต่อจนครบ) · ไม่บอกผู้ใช้ว่า "ยกเลิกแล้ว"
export async function eraseContactAction(
  systemId: string,
  contactId: string,
  input: { confirm: boolean; reason: string },
): Promise<{ ok: true; erased: boolean; counts: EraseCounts | null; message: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.delete");
    const r = await eraseContact(ctx, actor, { contactId, confirm: input?.confirm === true, reason: String(input?.reason ?? ""), source: "REQUEST" });
    revalidateAndWake(`/app/sys/${systemId}/crm/contacts`);
    revalidateAndWake(`/app/sys/${systemId}/crm/contacts/${contactId}`);
    const message = !r.erased
      ? "ผู้ติดต่อนี้ถูกลบข้อมูลไปก่อนหน้านี้แล้ว — ระบบกวาดข้อมูลที่หลงเข้ามาใหม่ (ถ้ามี) ให้อีกรอบแล้ว" // C3.9-fix H7 · รีวิว NOTE
      : r.followUp === "PENDING"
        ? ERASE_PENDING_MESSAGE
        : "ลบข้อมูลส่วนบุคคลแล้ว — ดีลและตัวเลขยอดขายยังอยู่ครบแบบไม่ระบุตัวตน";
    // CRM C3.9-fix ▸ H5: สมาชิกที่ผูกไว้ถูกจัดการตามกติกาของระบบสมาชิก — บอกผู้กดให้ชัดว่ายังเหลืออะไรต้องทำ ◂
    const memberNote = r.memberSkipped
      ? " · ข้อมูลสมาชิกที่ผูกไว้ยังไม่ถูกลบ เพราะบัญชีของคุณไม่มีสิทธิ์ลบข้อมูลสมาชิก — ให้ผู้มีสิทธิ์ลบในระบบสมาชิก"
      : r.memberPending
        ? " · ส่งคำขอลบข้อมูลสมาชิกที่ผูกไว้แล้ว รออนุมัติในระบบสมาชิก"
        : "";
    return { ok: true, erased: r.erased, counts: r.counts, message: `${message}${memberNote}` };
  } catch (e) {
    return failOf(e);
  }
}

/** ชุดข้อมูลของผู้ติดต่อหนึ่งคน (คำขอเข้าถึงข้อมูล) — คืนเป็นข้อความ JSON ให้หน้าจอดาวน์โหลด */
export async function exportContactAction(systemId: string, contactId: string): Promise<{ ok: true; filename: string; json: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.export");
    const bundle = await exportContact(ctx, actor, contactId);
    return { ok: true, filename: `crm-contact-${contactId}.json`, json: JSON.stringify(bundle, null, 2) };
  } catch (e) {
    return failOf(e);
  }
}

/** ขอไฟล์ส่งออกทั้งระบบ (งานเบื้องหลัง · ลิงก์ดาวน์โหลดของผู้ขอคนเดียว) */
export async function startTenantExportAction(systemId: string, format: string, danger?: { confirm?: boolean; reason?: string } | null): Promise<{ ok: true; jobId: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.export");
    // CRM C5.4-B ▸ L5-m7: ยืนยัน + เหตุผล ส่งต่อให้บริการ (บริการเป็นด่านจริง) ◂
    const r = await exportTenant(ctx, actor, { format, confirm: danger?.confirm === true, reason: danger?.reason ?? null });
    revalidateAndWake(`/app/sys/${systemId}/crm/settings`);
    return { ok: true, jobId: r.jobId };
  } catch (e) {
    return failOf(e);
  }
}

/** สถานะ/ลิงก์ของงานส่งออกของฉัน (ลิงก์อายุ ≤ 15 นาที — ขอใหม่ทุกครั้งที่กด) */
export async function getTenantExportAction(systemId: string, jobId: string): Promise<{ ok: true; job: CrmExportDto } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.export");
    return { ok: true, job: await getExport(ctx, actor, jobId) };
  } catch (e) {
    return failOf(e);
  }
}

export async function listTenantExportsAction(systemId: string): Promise<{ ok: true; jobs: CrmExportDto[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.export");
    return { ok: true, jobs: await listMyExports(ctx, actor) };
  } catch (e) {
    return failOf(e);
  }
}

/**
 * ตั้งอายุเก็บ (ไฟล์ส่งออก · lead ที่ไม่แปลง) — คีย์ crm.settings.manage · jsonb_set คำสั่งเดียว + audit
 * รีวิว C3.9 S4 (ก) · AUDIT-CLASS X9: **ลดอายุเก็บ lead** (หรือเปิดจาก 0) = งานรายวันถัดไปลบ lead ที่เกินอายุใหม่ทันทีและย้อนไม่ได้ ⇒
 *   ต้อง `confirm: true` + พิมพ์คำยืนยัน `LEAD_RETENTION_CONFIRM_WORD` (ไม่ครบ = CONFIRM_REQUIRED ไม่มีอะไรถูกเขียน)
 */
export async function saveRetentionAction(
  systemId: string,
  input: { exportDays: number; leadMonths: number; confirm?: boolean; confirmText?: string },
): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.settings.manage");
    const exportDays = Number(input?.exportDays);
    const leadMonths = Number(input?.leadMonths);
    const cur = await retentionSettings(ctx, actor);
    const lowering = Number.isInteger(leadMonths) && leadMonths > 0 && (cur.leadMonths === 0 || leadMonths < cur.leadMonths);
    if (lowering && (input?.confirm !== true || String(input?.confirmText ?? "").trim() !== LEAD_RETENTION_CONFIRM_WORD)) {
      return {
        ok: false,
        code: "CONFIRM_REQUIRED",
        error: `การลดอายุเก็บ lead ทำให้ lead ที่เกิน ${leadMonths} เดือนถูกลบข้อมูลในรอบงานถัดไปและย้อนกลับไม่ได้ — ติ๊กยืนยันและพิมพ์คำว่า "${LEAD_RETENTION_CONFIRM_WORD}" ก่อนบันทึก`,
      };
    }
    await setCrmRetentionKeys(ctx, { exportDays, leadMonths });
    await writeAudit({ tenantId: ctx.tenantId, actorId: actor.userId, action: "crm.settings.retention", targetType: "AppSystem", targetId: ctx.systemId, before: { exportDays: cur.exportDays, leadMonths: cur.leadMonths }, after: { exportDays, leadMonths, lowered: lowering } });
    revalidateAndWake(`/app/sys/${systemId}/crm/settings`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
