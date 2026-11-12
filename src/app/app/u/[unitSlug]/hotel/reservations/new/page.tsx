import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { addDaysYmd, hotelAvailability, isYmd, loadPricingContext, quoteStay } from "@/lib/modules/hotel";
import { createBookingAction, takeBookingDepositAction } from "@/lib/modules/hotel/actions";
import BookingWizard from "@/components/hotel/BookingWizard";
import { roomsCountOf, wizardStepOf, type WizardRoomType } from "@/components/hotel/booking-shared";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined): string => (typeof v === "string" ? v : "");
const todayTh = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

// SVC H.3 ▸ วิซาร์ดจองหน้าเคาน์เตอร์ (ใบสั่ง h.3 §4 · มติ 12) — หน่วย HOTEL · สิทธิ์ hotel.reservation.create (ไม่มี ⇒ notFound)
//   query (checkIn · checkOut · roomTypeId · rooms · step) ใช้เติมฟอร์ม/เปิดขั้นเท่านั้น — ไม่อ่านสิทธิ์จาก URL · createBooking ตรวจซ้ำทุกอย่าง
//   ขั้น 1 แสดงห้องเหลือต่อประเภท (hotelAvailability สูตรเดียว · ค่าน้อยสุดตลอดช่วง) + ราคารวมของแผนเริ่มต้น (quoteStay)
export default async function HotelNewBookingPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: SearchP }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!evaluate(actor, { module: "hotel", action: "hotel.reservation.create", unitId: unit.id })) notFound();
  const today = todayTh();
  const qIn = one(sp.checkIn);
  const checkIn = isYmd(qIn) && qIn >= today ? qIn : today;
  const qOut = one(sp.checkOut);
  const checkOut = isYmd(qOut) && qOut > checkIn ? qOut : addDaysYmd(checkIn, 1);
  const roomTypeId = one(sp.roomTypeId);
  const rooms = roomsCountOf(one(sp.rooms));
  const step = wizardStepOf(Math.min(3, Math.max(1, Number(one(sp.step)) || 1)));
  const ctx = { tenantId: auth.active.tenantId };
  const [pc, av] = await Promise.all([
    loadPricingContext(ctx, unit.id, { from: checkIn, to: addDaysYmd(checkOut, -1) }),
    hotelAvailability.get(ctx, { unitId: unit.id, from: checkIn, to: checkOut }),
  ]);
  const plan = pc?.plans.find((p) => p.isDefault) ?? pc?.plans[0] ?? null;
  const days = av.ok ? Object.values(av.byDate) : [];
  const roomTypes: WizardRoomType[] = (pc?.roomTypeList ?? [])
    .filter((t) => days.some((d) => !!d[t.id]))
    .map((t) => {
      const cells = days.map((d) => d[t.id]).filter((c) => !!c);
      const info = pc?.roomTypes[t.id];
      const q = pc && plan ? quoteStay(pc, { roomTypeId: t.id, ratePlanId: plan.id, checkIn, checkOut, limits: { minNights: null, maxNights: null, closedToArrival: false, maxAdvanceBookingDays: 100_000 } }) : null;
      return {
        id: t.id,
        name: t.name,
        maxOccupancy: info?.maxOccupancy ?? null,
        baseOccupancy: info?.baseOccupancy ?? 2,
        extraBedAllowed: info?.extraBedAllowed ?? false,
        available: cells.length ? Math.min(...cells.map((c) => c.available)) : 0,
        total: cells.length ? cells[0].total : 0,
        priceSatang: q && q.ok ? q.nightsTotal : null,
        priceNote: q && !q.ok ? q.messageTh : null,
      };
    });
  return (
    <BookingWizard
      model={{
        unitSlug,
        today,
        checkIn,
        checkOut,
        roomTypeId,
        rooms,
        step,
        roomTypes,
        plans: (pc?.plans ?? []).map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault })),
      }}
      actions={{ create: createBookingAction.bind(null, unitSlug), takeDeposit: takeBookingDepositAction.bind(null, unitSlug) }}
    />
  );
}
