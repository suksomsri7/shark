import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { resetSettingAction, saveSettingsAction } from "@/lib/core/settings/actions";
import { loadBookingSettingsPage } from "@/lib/modules/booking";
import { applyBookingRolePresetAction } from "@/lib/actions/booking-settings";
import BookingMessagesSettings from "@/components/booking/settings/BookingMessagesSettings";

// จอง 14 · ข้อความแจ้งเตือน · จอทีวี · ตู้ · บัตร · สิทธิ์ผู้ใช้ (SVC B.11 · ภาพ ledger/design-booking/14-messages-devices-roles.png)
// ?msg=<ชนิด> เลือกข้อความที่แก้ (ไม่รู้จัก ⇒ 404) · ผู้กระทำจาก session (auth.active) เท่านั้น
export default async function BookingMessagesSettingsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: Promise<{ msg?: string | string[] }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "BOOKING") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const ctx = { tenantId: auth.active.tenantId };
  const { msg } = await searchParams;
  const kind = typeof msg === "string" ? msg : undefined;
  const model = await loadBookingSettingsPage(actor, ctx, { unitId: unit.id, page: "messages", ...(kind !== undefined ? { msgKind: kind } : {}) });
  if (!model || model.page !== "messages") notFound();
  return (
    <BookingMessagesSettings
      model={model}
      actions={{ save: saveSettingsAction, reset: resetSettingAction, applyRolePreset: applyBookingRolePresetAction.bind(null, unitSlug) }}
    />
  );
}
