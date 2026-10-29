import { ModuleTabs } from "@/components/module-tabs";
import { requireUnit } from "@/lib/core/context";
import { resolveSettings } from "@/lib/core/settings";

// ต้นแบบแตกหน้า "ระบบจองคิว/นัดหมาย" — แท็บฟังก์ชันย่อยคร่อมทุกหน้าย่อยของ booking
// SVC B.11 ▸ แท็บชุดเดียวกับแบบ (คิววันนี้ · <คำเรียกผู้ให้บริการ> · บริการ · เวลาทำการ · ตั้งค่า) — ปฏิทิน/รายงาน เพิ่มเมื่อมีหน้า (B.14/B3)
//   ไม่ครอบความกว้างทั้งโมดูล (หน้าตั้งค่า/ตารางกว้างตามแบบ) ◂
export default async function BookingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const base = `/app/u/${unitSlug}/booking`;
  const { auth, unit } = await requireUnit(unitSlug);
  let providerLabel = "ช่าง";
  try {
    const r = await resolveSettings({ tenantId: auth.active.tenantId }, ["booking.general.providerLabel"], { unitId: unit.id });
    const v = r["booking.general.providerLabel"]?.value;
    if (typeof v === "string" && v.trim()) providerLabel = v.trim();
  } catch {
    // ค่าตั้งอ่านไม่ได้ ⇒ ใช้คำเรียกเริ่มต้น
  }
  return (
    <div className="flex w-full flex-col gap-5">
      <ModuleTabs
        items={[
          { href: base, label: "คิววันนี้" },
          { href: `${base}/staff`, label: providerLabel },
          { href: `${base}/services`, label: "บริการ" },
          { href: `${base}/hours`, label: "เวลาทำการ" },
          { href: `${base}/settings`, label: "ตั้งค่า" },
        ]}
      />
      {children}
    </div>
  );
}
