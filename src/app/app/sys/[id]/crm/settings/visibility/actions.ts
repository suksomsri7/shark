"use server";

// actions.ts — server actions ของหน้า "การมองเห็นข้อมูล" `/app/sys/{id}/crm/settings/visibility` (CRM v2 ใบ C1.7 · §6.2 · C9)
// 🔴 "use server" = export ได้เฉพาะ async function · tenantId จาก session · systemId ถูก resolve ใหม่ใน visibility.policies
// 🔴 AUDIT-CLASS X2: คีย์ `crm.visibility.manage` ตรวจที่นี่ (ด่านหน้า) และใน `policies.*` อีกชั้น (ด่านบริการ)
// 🔴 AUDIT-CLASS X9: ทุกการตั้ง/ลบ policy เขียน AuditLog `crm.visibility.policy.*` (targetId = id ของ policy) ในบริการ
// 🔴 uiVersion: หน้านี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด = FORBIDDEN ภาษาไทย (assertCrmV2)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "@/lib/modules/crm/access";
import { policies, VisibilityError } from "@/lib/modules/crm/visibility";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";

type Result = { ok: true } | { ok: false; error: string; code?: string };

async function session(systemId: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  assertCanCrm(actor, "crm.visibility.manage");
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  return { ctx, actor };
}

function failOf(e: unknown): Result {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof VisibilityError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.visibility] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (การตั้งค่าไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touch = (systemId: string) => revalidatePath(`/app/sys/${systemId}/crm/settings/visibility`);

/** ตั้งระดับการมองเห็น (บทบาท/ทีม/pipeline × ชนิดข้อมูล) — มีอยู่แล้ว = แก้ระดับ (ไม่เกิดแถวซ้ำ) */
export async function setVisibilityPolicyAction(
  systemId: string,
  input: { role?: string | null; teamId?: string | null; pipelineId?: string | null; entity: string; visibility: string },
): Promise<Result> {
  try {
    const { ctx, actor } = await session(systemId);
    await policies.set(ctx, actor, {
      role: input?.role || null,
      teamId: input?.teamId || null,
      pipelineId: input?.pipelineId || null,
      entity: String(input?.entity ?? ""),
      visibility: String(input?.visibility ?? ""),
    });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ลบการตั้งค่า (กลับไปใช้ชั้นถัดไป: ทีม → บทบาท → ค่าของร้าน → ค่าเริ่มต้น) */
export async function removeVisibilityPolicyAction(systemId: string, policyId: string): Promise<Result> {
  try {
    const { ctx, actor } = await session(systemId);
    await policies.remove(ctx, actor, String(policyId ?? ""));
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
