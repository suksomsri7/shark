// SVC B.14 — ปฏิทินนัด (ภาพ จอง 02 · ใบสั่ง §4) · ?date= &range=day|week &by=staff|resource &who= &appt= &at= &err=
//   loadCalendar null (ร้านเดิม/ดูไม่ได้/วันไม่จริง) ⇒ notFound · ?at= = นาฬิกา QC เฉพาะ SVC_QC_CLOCK=1
//   ความชอบลูกค้าบนการ์ด = loadJobCustomerNotes (B.16 · สิทธิ์ของมันเอง) · actions ผ่าน props (คอมโพเนนต์ไม่ import server)
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import CalendarBoard from "@/components/booking/CalendarBoard";
import { qcNowOf } from "@/components/booking/line-page";
import { bookForCustomerAction, cancelGroupAction, moveAppointmentAction, moveGroupAction } from "@/lib/actions/booking-calendar";
import { startJobAction } from "@/lib/actions/booking-line";
import { loadCalendar, type CalendarActor } from "@/lib/modules/booking/calendar";
import { loadJobCustomerNotes } from "@/lib/modules/booking/customer-notes";
import type { LineMember } from "@/lib/modules/booking/line-access";

export const dynamic = "force-dynamic";

type SP = { date?: string; range?: string; by?: string; who?: string; appt?: string; at?: string; err?: string };

export default async function BookingCalendarPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams?: Promise<SP> }) {
  const { unitSlug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const { auth, unit } = await requireUnit(unitSlug);
  const actor: CalendarActor = {
    role: auth.active.role as CalendarActor["role"],
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.user.id,
  };
  const qc = qcNowOf(sp?.at, process.env.SVC_QC_CLOCK === "1");
  const today = new Date(qc.now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const dateStr = typeof sp?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const view = await loadCalendar(ctx, actor, {
    dateStr,
    range: sp?.range === "week" ? "WEEK" : "DAY",
    mode: sp?.by === "resource" ? "RESOURCE" : "STAFF",
    focusId: typeof sp?.who === "string" ? sp.who : undefined,
    apptId: typeof sp?.appt === "string" ? sp.appt : undefined,
    now: qc.now,
  });
  if (!view) notFound();
  const notes = view.card
    ? await loadJobCustomerNotes(ctx, { userId: auth.user.id, member: actor as LineMember }, [view.card.appointmentId], { page: "booking.today", now: qc.now })
    : {};
  return (
    <CalendarBoard
      view={view}
      unitSlug={unitSlug}
      at={qc.at}
      err={typeof sp?.err === "string" ? sp.err.slice(0, 300) : ""}
      notes={notes}
      actions={{
        move: moveAppointmentAction.bind(null, unitSlug),
        book: bookForCustomerAction.bind(null, unitSlug),
        start: startJobAction.bind(null, unitSlug),
        moveGroup: moveGroupAction.bind(null, unitSlug), // SVC B.15-UI
        cancelGroup: cancelGroupAction.bind(null, unitSlug), // SVC B.15-UI
      }}
    />
  );
}
