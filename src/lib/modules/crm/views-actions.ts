"use server";

// views-actions.ts — server actions ของ "มุมมองที่บันทึก" บนหน้ารายการผู้ติดต่อ/บริษัท/ดีล (ใบ C3.2 · addendum ข้อ 12)
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ชนิดข้อมูลอยู่ที่ views.ts / คอมโพเนนต์)
// 🔴 tenantId มาจาก session เสมอ · systemId ถูก resolve ใหม่ในบริการ (`views.ts`) — ไม่เชื่อ id จากหน้าจอ
// 🔴 ด่าน: uiVersion 2 (assertCrmV2) → คีย์อ่านของวัตถุนั้น (assertCanCrm) → บริการตรวจซ้ำ (ทีมที่แชร์ได้ · เจ้าของมุมมอง)
// 🔴 ข้อความ error ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลาง

import { revalidateAndWake } from "./outbox-wake"; // CRM C5.4-D ▸ L3-M1b: รีเฟรชหน้า + ปลุกคิว outbox หลังเขียนสำเร็จ ◂
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "./access";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import { CrmViewError, createView, deleteView, isCrmViewObjectKey } from "./views";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; code?: string };
const READ: Record<string, string> = { contact: "crm.contact.read", company: "crm.company.read", deal: "crm.deal.read" };
const PAGE: Record<string, string> = { contact: "contacts", company: "companies", deal: "deals" };

function failOf(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof CrmViewError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.views] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกมุมมองไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว — ลองใหม่อีกครั้ง" };
}

async function session(systemId: string, objectKey: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  assertCanCrm(actor, READ[objectKey] ?? "crm.deal.read");
  return { ctx, actor };
}

/** บันทึกตัวกรองปัจจุบันของหน้ารายการเป็นมุมมอง (ส่วนตัว หรือแชร์ให้ทีม) — คืน id ของมุมมองใหม่ */
export async function createCrmViewAction(
  systemId: string,
  input: { objectKey: string; name: string; scope: string; teamId: string | null; filters: Record<string, unknown> },
): Promise<Result<{ id: string }>> {
  try {
    const objectKey = String(input?.objectKey ?? "");
    const { ctx, actor } = await session(systemId, objectKey);
    const v = await createView(ctx, actor, { objectKey, name: String(input?.name ?? ""), scope: input?.scope === "TEAM" ? "TEAM" : "PRIVATE", teamId: input?.teamId ?? null, filters: input?.filters ?? {} });
    if (isCrmViewObjectKey(objectKey)) revalidateAndWake(`/app/sys/${systemId}/crm/${PAGE[objectKey]}`);
    return { ok: true, id: v.id };
  } catch (e) {
    return failOf(e);
  }
}

/** ลบมุมมอง (เจ้าของมุมมองหรือเจ้าของร้าน) */
export async function deleteCrmViewAction(systemId: string, objectKey: string, viewId: string): Promise<Result<Record<never, never>>> {
  try {
    const { ctx, actor } = await session(systemId, String(objectKey ?? ""));
    await deleteView(ctx, actor, String(viewId ?? ""));
    if (isCrmViewObjectKey(objectKey)) revalidateAndWake(`/app/sys/${systemId}/crm/${PAGE[objectKey]}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
