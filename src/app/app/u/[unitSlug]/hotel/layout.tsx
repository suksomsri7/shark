import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import HotelTabs from "@/components/hotel/HotelTabs";
import { hotelTabsFor } from "@/components/hotel/hotel-tabs-shared";

// SVC H.1 ▸ แท็บโมดูลโรงแรม (ภาพ 08/09/15 แถบบน · ใบสั่ง h.1 §7 · แบบ dorm/layout.tsx)
//   หน่วยต้องเป็น "HOTEL" (อื่น ⇒ notFound) · แท็บตามสิทธิ์จาก session: ราคา ⇔ hotel.rates.read (หรือ write) · ตั้งค่า ⇔ hotel.settings.edit
//   layout ไม่ใช่ด่าน — แต่ละหน้าตรวจสิทธิ์ของตัวเอง
export default async function HotelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const can = (action: string) => evaluate(m, { module: "hotel", action, unitId: unit.id });
  const tabs = hotelTabsFor({ ratesRead: can("hotel.rates.read") || can("hotel.rates.write"), settingsEdit: can("hotel.settings.edit") }, `/app/u/${unitSlug}`);
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <HotelTabs tabs={tabs} />
      {children}
    </div>
  );
}
