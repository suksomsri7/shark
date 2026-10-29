import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { loadSettingsForm } from "@/lib/core/settings";
import { resetSettingAction, saveSettingsAction } from "@/lib/core/settings/actions";
import { loadDormPolicySettings } from "@/lib/modules/dorm";
import type { SettingsFormModel } from "@/components/settings/settings-shared";
import DormPolicySettings from "@/components/dorm/DormPolicySettings";
import { DORM_POLICY_GROUPS } from "@/components/dorm/dorm-policy-shared";
import { applyDormRolePresetAction } from "./actions";
import { setDormBuildingAssignmentAction } from "./scope-actions";

// หอ 17 "นโยบาย · ข้อความ · สิทธิ์" (SVC D.13 · แทนฟอร์มยาว R0.4) — ภาพ ledger/design-dorm/17-settings-policies.png
//   ฟอร์มค่าตั้งโหลดจากเครื่องยนต์ (loadSettingsForm ชั้น UNIT · domains rooms/payments/messaging · groups ของการ์ด) แล้วส่งเข้า loadDormPolicySettings
//   บันทึก/คืนค่า = action กลางของเครื่องยนต์ (ด่านสิทธิ์ + writeVia อยู่ฝั่งเซิร์ฟเวอร์) · ชุดสิทธิ์ตามบทบาท = applyDormRolePresetAction
//   ผู้กระทำ/ร้านมาจาก session เท่านั้น (auth.active) — ไม่อ่านสิทธิ์จาก URL
export default async function DormSettingsPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();

  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const ctx = { tenantId: auth.active.tenantId };
  const form: SettingsFormModel | null = await loadSettingsForm(actor, ctx, { domains: ["rooms", "payments", "messaging"], groups: DORM_POLICY_GROUPS, unitId: unit.id });
  if (!form) notFound();
  const model = await loadDormPolicySettings(actor, ctx, { unitId: unit.id, form });
  if (!model) notFound();

  return (
    <DormPolicySettings
      model={model}
      unitSlug={unitSlug}
      actions={{ save: saveSettingsAction, reset: resetSettingAction, applyRolePreset: applyDormRolePresetAction.bind(null, unitSlug), setBuildingAssignment: setDormBuildingAssignmentAction.bind(null, unitSlug) }}
    />
  );
}
