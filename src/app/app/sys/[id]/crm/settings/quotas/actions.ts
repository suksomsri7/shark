"use server";

// actions.ts — server action ของหน้า "โควตา" `/app/sys/{id}/crm/settings/quotas` (ใบ C3.2 · ภาพ 10 ขวา · พิมพ์เขียว §11.6)
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ชนิดของผลลัพธ์ประกาศที่คอมโพเนนต์)
// 🔴 tenantId มาจาก session เสมอ · systemId ถูก resolve ใหม่ในบริการ (`crm/quotas.ts`) — ไม่เชื่อ id จากหน้าจอ
// 🔴 ด่าน: uiVersion 2 (assertCrmV2) → คีย์ `crm.quota.manage` (assertCanCrm) → บริการตรวจซ้ำ + งวดที่จบแล้วต้อง MANAGER/OWNER
// 🔴 ข้อความ error ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลาง (รายละเอียดไม่หลุดไปหน้าจอ)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "@/lib/modules/crm/access";
import { setQuota } from "@/lib/modules/crm/quotas";
import { QuotaError } from "@/lib/modules/crm/quotas-shared";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";

/** ตั้ง/แก้เป้าของหนึ่งแถว (พนักงานหรือทีม · งวดเดียว) — เงินเป็นสตางค์ */
export async function setQuotaAction(
  systemId: string,
  input: { ownerType: string; ownerId: string; periodKey: string; targetSatang: number; targetDeals?: number | null },
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  try {
    const auth = await requireTenant();
    const actor = toMemberActor(auth.user.id, auth.active);
    const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
    await assertCrmV2(ctx);
    assertCanCrm(actor, "crm.quota.manage");
    await setQuota(ctx, actor, {
      ownerType: String(input?.ownerType ?? ""),
      ownerId: String(input?.ownerId ?? ""),
      periodKey: String(input?.periodKey ?? ""),
      targetSatang: Number(input?.targetSatang),
      // รีวิว S2: ไม่ส่งมา = คงค่าเดิม (ไม่ล้างเป็น null) · targetActivities/note ไม่อยู่ในหน้าจอนี้ ⇒ ไม่แตะ
      ...(input?.targetDeals !== undefined ? { targetDeals: input.targetDeals } : {}),
    });
    revalidatePath(`/app/sys/${systemId}/crm/settings/quotas`);
    revalidatePath(`/app/sys/${systemId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
    if (e instanceof QuotaError) return { ok: false, error: e.message, code: e.code };
    if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
    console.error(`[crm.quotas] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
    return { ok: false, error: "บันทึกโควตาไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (เป้าเดิมไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
  }
}
