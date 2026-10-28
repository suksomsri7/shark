import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { loadSettingsForm } from "@/lib/core/settings";
import { resetSettingAction, saveSettingsAction } from "@/lib/core/settings/actions";
import SettingsForm from "@/components/settings/SettingsForm";
import { PageHeader } from "@/components/ui/PageHeader";

// ตั้งค่าหอ (SVC R0.4) — หน้าห่อ + SettingsForm (กติกาเหล็ก #16)
// กลุ่มค่าตั้งเรียงตามทะเบียน rooms → payments → messaging · D.7/D.13 จัดกลุ่มตามภาพ 10/17
// ผู้กระทำ/ร้านมาจาก session เท่านั้น (auth.active) — ด่านสิทธิ์จริงอยู่ใน service
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
  const model = await loadSettingsForm(actor, { tenantId: auth.active.tenantId }, { domains: ["rooms", "payments", "messaging"], unitId: unit.id });
  if (!model) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader title={`ตั้งค่าหอ · ${unit.name}`} desc="กติกาค่าเช่า ค่าน้ำไฟ เงินประกัน ค่าปรับ และข้อความหาผู้เช่า — ค่าที่ไม่ได้ตั้งเองจะใช้ตามแม่แบบของหอ" />
      <SettingsForm model={model} actions={{ save: saveSettingsAction, reset: resetSettingAction }} />
    </div>
  );
}
