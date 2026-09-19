"use server";

// actions.ts — server actions ของกิจกรรม v2 · ปฏิทิน · บล็อกโน้ต/ไฟล์ใน 360 (CRM v2 · ใบ C1.6)
// 🔴 "use server" = export ได้เฉพาะ async function (ชนิดข้อมูลอยู่ที่ `crm/activities-shared.ts`)
// 🔴 tenantId มาจาก session เสมอ · systemId จากหน้าเป็นแค่ "ตัวเลือก" — บริการ resolve ใหม่ (ต้องเป็นระบบ CRM ของร้านนี้)
// 🔴 F6: ทุก action ตรวจสิทธิ์ด้วย assertCan ก่อนลงมือ (crm.activity.create / crm.activity.complete — OWNER/MANAGER ผ่าน · STAFF ตามสิทธิ์)
// 🔴 ไม่โยน error ดิบถึงหน้าจอ — คืน { ok:false, error } ภาษาไทยที่ไม่โทษผู้ใช้ · log แค่ชนิด error (ไม่มีเนื้อโน้ต/ชื่อไฟล์ — X8)
// 🔴 actor มาจาก `toMemberActor` เท่านั้น

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { assertCanCrm } from "@/lib/modules/crm/access";
import { toMemberActor } from "@/lib/modules/member";
import {
  completeActivity,
  deleteActivity,
  logActivity,
  openTaskCard,
  rescheduleActivity,
  searchTargets,
  setPinned,
  updateActivity,
  type LogActivityInput,
  type ActivityTargetOption,
  type RescheduleInput,
  type UpdateActivityInput,
} from "@/lib/modules/crm/activities";
import { attachFile, removeFile } from "@/lib/modules/crm/files";
import { ActivitiesError, CRM_FILE_MAX_BYTES } from "@/lib/modules/crm/activities-shared";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";

type Fail = { ok: false; error: string; code?: string };

async function session(systemId: string, action: string) {
  const auth = await requireTenant();
  // CRM C1.7 ▸ มติผู้คุมงาน C1.7 ข้อ 3: ด่านคีย์ผ่าน `crm/access.ts` (MANAGER ปริยายไม่ได้ 5 คีย์ตั้งค่า · อ่านโดยนัยของคน) ◂
  const actor = toMemberActor(auth.user.id, auth.active);
  assertCanCrm(actor, action);
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  // uiVersion gate: action ของกิจกรรม v2 ทำงานเฉพาะระบบที่เปิด CRM v2 แล้ว — ระบบ v1 = FORBIDDEN ภาษาไทย (ui-version.ts)
  await assertCrmV2(ctx);
  return { ctx, actor };
}

function failOf(e: unknown): Fail {
  if (e instanceof ActivitiesError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ในระบบ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
  console.error(`[crm.activities] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

/** หน้าที่แสดงกิจกรรม/ไฟล์: รายการ · ปฏิทิน (ของระบบนี้) + หน้า 360 ทั้งสามชนิด (แพตเทิร์น — ผู้กดยัง router.refresh() เองด้วย) */
const touch = (systemId: string) => {
  revalidatePath(`/app/sys/${systemId}/crm/activities`);
  revalidatePath(`/app/sys/${systemId}/crm/calendar`);
  revalidatePath("/app/sys/[id]/crm/contacts/[contactId]", "page");
  revalidatePath("/app/sys/[id]/crm/companies/[companyId]", "page");
  revalidatePath("/app/sys/[id]/crm/deals/[dealId]", "page");
};

export async function logActivityAction(systemId: string, input: LogActivityInput): Promise<{ ok: true; id: string; nextTaskId: string | null; notified: string[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    const r = await logActivity(ctx, actor, input);
    touch(systemId);
    // notified = คนที่ได้รับแจ้งเตือนจริง (หน้าจอบอกผู้เขียนว่าใครไม่ได้รับ โดยใช้ชื่อจากรายการตัวเลือกของเขาเอง — ไม่บอกเหตุผล)
    return { ok: true, id: r.id, nextTaskId: r.nextTaskId, notified: r.mentions };
  } catch (e) {
    return failOf(e);
  }
}

export async function completeActivityAction(systemId: string, id: string, outcome?: string | null): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.complete");
    await completeActivity(ctx, actor, id, { outcome: outcome ?? null });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function rescheduleActivityAction(systemId: string, id: string, input: RescheduleInput): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.complete");
    await rescheduleActivity(ctx, actor, id, input);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateActivityAction(systemId: string, id: string, patch: UpdateActivityInput): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    await updateActivity(ctx, actor, id, patch);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setPinnedAction(systemId: string, id: string, pinned: boolean): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    await setPinned(ctx, actor, id, pinned);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function deleteActivityAction(systemId: string, id: string, input: { confirm: boolean; reason: string }): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    await deleteActivity(ctx, actor, id, input);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function openTaskCardAction(systemId: string, activityId: string, boardId: string): Promise<{ ok: true; cardId: string; created: boolean } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    const r = await openTaskCard(ctx, actor, { activityId, boardId });
    touch(systemId);
    return { ok: true, ...r };
  } catch (e) {
    return failOf(e);
  }
}

/** แนบไฟล์ (FormData: entityType · entityId · file) — ขนาด/ชนิด/ชื่อ ตรวจซ้ำในบริการ (X6) */
export async function attachFileAction(systemId: string, form: FormData): Promise<{ ok: true; id: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "ยังไม่ได้เลือกไฟล์ — กดเลือกไฟล์แล้วลองอีกครั้ง", code: "VALIDATION" };
    if (file.size > CRM_FILE_MAX_BYTES) return { ok: false, error: `ไฟล์ใหญ่เกิน ${Math.round(CRM_FILE_MAX_BYTES / (1024 * 1024))} MB — ย่อขนาดหรือแบ่งไฟล์ก่อนแนบ`, code: "VALIDATION" };
    const data = new Uint8Array(await file.arrayBuffer());
    const r = await attachFile(ctx, actor, {
      entityType: String(form.get("entityType") ?? ""),
      entityId: String(form.get("entityId") ?? ""),
      filename: file.name,
      contentType: file.type,
      data,
    });
    touch(systemId);
    return { ok: true, id: r.id };
  } catch (e) {
    return failOf(e);
  }
}

export async function removeFileAction(systemId: string, linkId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    await removeFile(ctx, actor, linkId, { confirm: true });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ค้นผู้ติดต่อ/ดีล/บริษัท สำหรับช่อง "กิจกรรมของใคร" (หน้ากิจกรรม) */
export async function searchActivityTargetsAction(systemId: string, q: string): Promise<{ ok: true; items: ActivityTargetOption[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    return { ok: true, items: await searchTargets(ctx, actor, q) };
  } catch (e) {
    return failOf(e);
  }
}
