import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { rr3Card } from "@/lib/modules/hotel";
import Rr3Card from "@/components/hotel/Rr3Card";

// SVC H.4 ▸ บัตรทะเบียนผู้พัก (ร.ร.3) แบบพิมพ์ — rr3Card (ผ่าน facade) · หน่วย "HOTEL" + สิทธิ์ทะเบียนจาก session ไม่ผ่าน ⇒ notFound
//   ลิงก์ลายเซ็น/รูปเอกสาร = /api/files ผูกผู้ดูคนนี้ (userId ใน ctx) อายุ ≤ 15 นาที · เลขเอกสาร 4 ตัวท้าย · พิมพ์ด้วยคำสั่งพิมพ์ของเบราว์เซอร์
export default async function HotelRr3PrintPage({ params }: { params: Promise<{ unitSlug: string; guestId: string }> }) {
  const { unitSlug, guestId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const can = (action: string) => evaluate(m, { module: "hotel", action, unitId: unit.id });
  if (!(can("hotel.guest.register") || can("hotel.guest.viewId") || can("hotel.reservation.checkIn"))) notFound();
  const card = await rr3Card({ tenantId: auth.active.tenantId, userId: auth.active.userId }, { guestId });
  if (!card.ok) notFound();
  return (
    <div data-rr3-print="" className="mx-auto flex w-full min-w-0 max-w-[210mm] flex-col gap-3 bg-[color:var(--color-surface)] p-6 print:p-0">
      <header className="flex flex-wrap items-baseline justify-between gap-2 print:hidden">
        <a href={`/app/u/${unitSlug}/hotel/reservations/${card.reservationId}?tab=guests`} className="text-xs text-[color:var(--color-muted)]">
          ← การจอง {card.reservationCode}
        </a>
        <p className="text-xs text-[color:var(--color-muted)]">สั่งพิมพ์จากเบราว์เซอร์ หรือเลือก “บันทึกเป็น PDF”</p>
      </header>
      <Rr3Card card={card} showImage />
    </div>
  );
}
