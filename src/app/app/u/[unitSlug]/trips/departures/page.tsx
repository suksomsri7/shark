import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { calendarMonthDays, calendarWeekDays, loadDepartureCalendarVM, loadDeparturePanelVM, loadDepartureSchedulesVM, tripsPageGate } from "@/lib/modules/trips";
import TripsForbidden from "@/components/trips/TripsForbidden";
import DeparturesScreen from "@/components/trips/DeparturesScreen";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

// TRIPS T1.2 ▸ ปฏิทินรอบและที่ว่าง ฝั่งร้าน (ภาพ 11 · ใบสั่ง T1.2 §2) — หน้าบาง: ด่าน → ตัวโหลด → คอมโพเนนต์
//   query: ?view=week|month|trips &start=YYYY-MM-DD &month=YYYY-MM &f=all|tour|dive &dep=<รอบ> &decide=1
//   ค่าที่อ่านไม่ได้ ⇒ ทิ้งใช้ค่าปริยาย (ไม่ 404) · dep ของหน่วยอื่น/ไม่มี ⇒ notFound() · ตัวโหลดใช้นาฬิกาจริง (หน้าไม่ส่งเวลา)
export default async function TripsDeparturesPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: SearchP }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.user.id };
  const g = await tripsPageGate(ctx, { unitId: unit.id, page: "departures" });
  if (!g.ok) {
    if (g.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  const viewRaw = one(sp.view);
  const view = viewRaw === "month" || viewRaw === "trips" ? viewRaw : "week";
  const startRaw = one(sp.start);
  const start = startRaw && calendarWeekDays(startRaw).length ? startRaw : undefined;
  const monthRaw = one(sp.month);
  const month = monthRaw && calendarMonthDays(monthRaw).length ? monthRaw : undefined;
  const fRaw = one(sp.f);
  const filter = fRaw === "tour" || fRaw === "dive" ? fRaw : "all";

  let cal = await loadDepartureCalendarVM(ctx, { unitId: unit.id, view, ...(view === "week" && start ? { start } : {}), ...(view === "month" && month ? { month } : {}), filter });
  if (!cal.ok && cal.code === "INVALID_INPUT") cal = await loadDepartureCalendarVM(ctx, { unitId: unit.id });
  if (!cal.ok) {
    if (cal.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }

  const dep = one(sp.dep);
  let panel = null;
  if (dep) {
    const r = await loadDeparturePanelVM(ctx, { unitId: unit.id, departureId: dep.slice(0, 128) });
    if (!r.ok) {
      if (r.code === "FORBIDDEN") return <TripsForbidden />;
      notFound();
    }
    panel = r.vm;
  }
  let sched = null;
  if (cal.vm.flags.canEdit) {
    const s = await loadDepartureSchedulesVM(ctx, { unitId: unit.id });
    if (s.ok) sched = s.vm;
  }
  return <DeparturesScreen unitSlug={unitSlug} cal={cal.vm} panel={panel} sched={sched} openDecide={one(sp.decide) === "1"} />;
}
