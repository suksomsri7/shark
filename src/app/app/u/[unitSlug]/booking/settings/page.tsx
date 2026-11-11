import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { resetSettingAction, saveSettingsAction } from "@/lib/core/settings/actions";
import { loadBookingSettingsPage } from "@/lib/modules/booking";
import { applyBookingTemplateAction } from "@/lib/actions/booking-settings";
import BookingPolicySettings from "@/components/booking/settings/BookingPolicySettings";

// จอง 08 · ตั้งค่าการจองและคิว — แม่แบบประเภทร้าน + นโยบายทุกข้อ (SVC B.11 · ภาพ ledger/design-booking/08-settings.png)
// กติกาเหล็ก #16: แถวค่าตั้งทุกแถวมาจาก loadSettingsForm (ผ่าน loadBookingSettingsPage) · ผู้กระทำจาก session (auth.active) เท่านั้น
export default async function BookingSettingsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: Promise<{ only?: string }> }) {
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
  const model = await loadBookingSettingsPage(actor, ctx, { unitId: unit.id, page: "policy" });
  const { only } = await searchParams;
  if (!model || model.page !== "policy") notFound();
  return (
    <BookingPolicySettings
      model={model}
      actions={{ save: saveSettingsAction, reset: resetSettingAction, applyTemplate: applyBookingTemplateAction.bind(null, unitSlug) }}
      view={{ onlyChanged: only === "1" }}
    />
  );
}
