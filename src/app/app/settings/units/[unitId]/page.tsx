import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { getUnitLocation } from "@/lib/units/location";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { UnitLocationForm } from "@/components/unit-location-form";

// ตั้งค่าสาขา — ที่อยู่/แผนที่ (WO-CV14 ข · ปิดหนี้ D14)
//
// ทำไมต้องมีหน้านี้: ปุ่ม "แผนที่ร้าน" ในกล่องแชทอ่าน `BusinessUnit.settings.{address,mapUrl,lat,lng}`
// มาตั้งแต่รอบ V2 แต่ **ไม่มีหน้าไหนให้กรอกเลย** ⇒ ปุ่มนั้นบอกได้อย่างเดียวว่า "ยังไม่ได้ตั้ง"
export default async function UnitSettingsPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const auth = await requireTenant();
  // สาขาของร้านอื่น = ต้องเป็น 404 เหมือนไม่มีอยู่จริง (ไม่ใช่ "ไม่มีสิทธิ์" ซึ่งยืนยันว่ามีสาขานี้อยู่)
  const unit = await getUnitLocation({ tenantId: auth.active.tenantId }, unitId);
  if (!unit) notFound();
  // 🔴 กันตั้งแต่หน้าเว็บด้วย ไม่ใช่ปล่อยให้กรอกจนเสร็จแล้วค่อยตายตอนกดบันทึก
  //    ไม่มีสิทธิ์ในสาขานี้ = ปฏิบัติเหมือนไม่มีสาขานี้อยู่ (เหมือนเคสข้ามร้าน) —
  //    ข้อความ "ไม่มีสิทธิ์" เป็นการยืนยันว่าสาขานี้มีจริง ซึ่งเป็นข้อมูลที่ไม่ควรรั่ว
  const allowed = evaluate(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "systems", action: "systems.unit.update", unitId },
  );
  if (!allowed) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title={`ตั้งค่าสาขา: ${unit.name}`}
        back={{ href: "/app/settings/systems", label: "จัดการระบบ" }}
        desc="ข้อมูลชุดนี้คือสิ่งที่ทีมจะส่งให้ลูกค้าเมื่อกดปุ่ม “แผนที่ร้าน” ในกล่องแชท"
      />
      <Section title="ที่อยู่และแผนที่">
        <UnitLocationForm
          unitId={unit.id}
          unitName={unit.name}
          defaultAddress={unit.location.address}
          defaultMapUrl={unit.location.mapUrl}
          defaultLat={unit.location.lat === null ? "" : String(unit.location.lat)}
          defaultLng={unit.location.lng === null ? "" : String(unit.location.lng)}
        />
      </Section>
    </div>
  );
}
