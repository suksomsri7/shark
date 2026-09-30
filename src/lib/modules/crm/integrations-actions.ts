"use server";

// integrations-actions.ts — server action ของหน้า "เชื่อมต่อทุกระบบ" (ใบ C3.6 · ภาพ 17) — บันทึกระบบปลายทาง `settings.crm.targets`
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ชนิดข้อมูลอยู่ที่ integrations-shared.ts)
// 🔴 tenantId มาจาก session เสมอ · systemId ถูกตรวจใหม่ในบริการ (ระบบ CRM ของร้านนี้จริง) · id ของระบบปลายทางถูกตรวจว่าเป็นของร้านนี้
// 🔴 ด่าน: uiVersion 2 → คีย์ `crm.settings.manage` → บริการตรวจซ้ำ (jsonb_set คำสั่งเดียว + audit `crm.integrations.targets`)
import { revalidateAndWake } from "./outbox-wake"; // CRM C5.4-D ▸ L3-M1b: รีเฟรชหน้า + ปลุกคิว outbox หลังเขียนสำเร็จ ◂
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "./access";
import { setTargets } from "./integrations";
import { IntegrationsError, type CrmTargetSettings } from "./integrations-shared";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";

type Result = { ok: true; targets: CrmTargetSettings } | { ok: false; error: string; code?: string };

/** บันทึกระบบปลายทาง (เฉพาะคีย์ที่ส่งมา · "" / null = กลับไปใช้อัตโนมัติ) */
export async function saveIntegrationTargetsAction(systemId: string, patch: Partial<Record<keyof CrmTargetSettings, string | null>>): Promise<Result> {
  try {
    const auth = await requireTenant();
    const actor = toMemberActor(auth.user.id, auth.active);
    const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
    await assertCrmV2(ctx);
    assertCanCrm(actor, "crm.settings.manage");
    const clean: Partial<CrmTargetSettings> = {};
    for (const key of ["memberSystemId", "accountSystemId", "kanbanSystemId", "chatSystemId", "inventorySystemId"] as const) {
      if (!patch || typeof patch !== "object" || !Object.prototype.hasOwnProperty.call(patch, key)) continue;
      const v: unknown = patch[key];
      // ค่าแปลก (ตัวเลข/ออบเจ็กต์) = ปฏิเสธ ไม่ใช่ล้างค่าเงียบ ๆ · "" / null = กลับเป็นอัตโนมัติ
      if (v !== null && typeof v !== "string") throw new IntegrationsError("VALIDATION", "ค่าที่ส่งมาไม่ใช่ระบบจากรายการ — รีเฟรชหน้าแล้วเลือกใหม่");
      clean[key] = typeof v === "string" && v.trim() ? v.trim() : null;
    }
    const targets = await setTargets(ctx, actor, clean);
    revalidateAndWake(`/app/sys/${ctx.systemId}/crm/settings/integrations`);
    return { ok: true, targets };
  } catch (e) {
    if (e instanceof IntegrationsError || e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
    if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
    console.error(`[crm.integrations] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
    return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว — ลองใหม่อีกครั้ง" };
  }
}
