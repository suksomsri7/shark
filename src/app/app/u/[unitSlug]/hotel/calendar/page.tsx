import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { hotelToday, tapeChart } from "@/lib/modules/hotel";
import TapeChart from "@/components/hotel/TapeChart";
import HotelToday from "@/components/hotel/HotelToday";
import { firstOfMonth, isYmd, viewDays, type TapeModel, type TapeView } from "@/components/hotel/tape-shared";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined): string => (typeof v === "string" ? v : "");

// SVC H.2 ▸ ปฏิทินห้อง /hotel/calendar?view=week|2w|month&from=YYYY-MM-DD (ใบสั่ง h.2 §1 · §2 มติ 7–8 · §4 · ภาพ 08)
//   หน่วย "HOTEL" เท่านั้น (อื่น ⇒ notFound) · ดู = hotel.reservation.create | hotel.booking.manage | hotel.housekeeping (แม่บ้านเห็นแต่ลากไม่ได้)
//   ลาก/ยืด/ปิดห้อง (canEdit) = hotel.booking.manage จากเซสชัน — URL ใช้เลือกช่วงวันเท่านั้น ไม่เกี่ยวกับสิทธิ์
//   ลิงก์หอของแถบรายเดือน = เฉพาะเมื่อผู้ใช้มีสิทธิ์ dorm.view ของหน่วยหอนั้น (ไม่งั้นข้อความเฉย ๆ)
export default async function HotelCalendarPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: SearchP }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const can = (action: string) => evaluate(m, { module: "hotel", action, unitId: unit.id });
  const canView = can("hotel.reservation.create") || can("hotel.booking.manage") || can("hotel.housekeeping");
  if (!canView) notFound();
  const canEdit = can("hotel.booking.manage");
  const canCreate = can("hotel.reservation.create");

  const rawView = one(sp.view);
  const view: TapeView = rawView === "2w" ? "2w" : rawView === "month" ? "month" : "week";
  const today = bkkYmd(new Date());
  const rawFrom = one(sp.from);
  const pick = isYmd(rawFrom) ? rawFrom : today;
  const from = view === "month" ? firstOfMonth(pick) : pick;
  const ctx = { tenantId: auth.active.tenantId };
  const [t, k] = await Promise.all([tapeChart(ctx, { unitId: unit.id, from, days: viewDays(view, from) }), hotelToday(ctx, { unitId: unit.id })]);
  if (!t.ok) notFound();

  // แถบรายเดือน: ลิงก์ไปหน้าผู้เช่าของหอเฉพาะผู้มี dorm.view ของหน่วยหอนั้น
  const dormOk = new Map<string, boolean>();
  const canDorm = (unitId: string | null): boolean => {
    if (!unitId) return false;
    if (!dormOk.has(unitId)) dormOk.set(unitId, evaluate(m, { module: "dorm", action: "dorm.view", unitId }));
    return dormOk.get(unitId) === true;
  };
  const model: TapeModel = {
    unitSlug,
    from: t.from,
    today: t.today,
    days: t.days,
    occupancy: t.occupancy,
    groups: t.groups.map((g) => ({
      ...g,
      rooms: g.rooms.map((r) => ({ ...r, bars: r.bars.map((b) => (b.kind === "LEASE" && !canDorm(b.leaseUnitId) ? { ...b, href: null } : b)) })),
    })),
  };
  return (
    <TapeChart model={model} view={view} canEdit={canEdit} canCreate={canCreate} nowMs={Date.now()}>
      {k.ok ? <HotelToday kpi={k} /> : null}
    </TapeChart>
  );
}
