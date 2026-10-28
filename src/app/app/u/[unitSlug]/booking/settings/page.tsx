import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { listDefs, loadSettingsForm } from "@/lib/core/settings";
import { resetSettingAction, saveSettingsAction } from "@/lib/core/settings/actions";
import SettingsForm from "@/components/settings/SettingsForm";
import { PageHeader } from "@/components/ui/PageHeader";

// ตั้งค่าการจองและคิว (SVC R0.4) — หน้าห่อ + SettingsForm (กติกาเหล็ก #16: ห้ามวาดฟอร์มค่าตั้งมือ)
// ผู้กระทำ/ร้านมาจาก session เท่านั้น (auth.active) — ด่านสิทธิ์จริงอยู่ใน service
// B.11 เติมแม่แบบ/การ์ดเฉพาะของจองคิว (domain "booking") เมื่อมี def ลงทะเบียน
export default async function BookingSettingsPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "BOOKING") notFound();

  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const model = await loadSettingsForm(
    actor,
    { tenantId: auth.active.tenantId },
    { domains: ["payments", "messaging", ...(listDefs("booking").length ? ["booking"] : [])], unitId: unit.id },
  );
  if (!model) notFound();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`ตั้งค่าการจองและคิว · ${unit.name}`} desc="รับเงิน ตรวจสลิป และข้อความที่ส่งหาลูกค้า — ค่าที่ไม่ได้ตั้งเองจะใช้ตามแม่แบบของร้าน" />
      <SettingsForm model={model} actions={{ save: saveSettingsAction, reset: resetSettingAction }} />
    </div>
  );
}
