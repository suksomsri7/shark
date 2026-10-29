// SVC B.5 — ปฏิทินรายวันตามคน (ใบสั่ง §3.6 · อ่านอย่างเดียว) · ?date= (ไม่ส่ง/ผิดรูป = วันนี้ไทย) · หน่วยแถวเดียวเท่านั้น
//   ไม่มีสิทธิ์ดู/ร้านเดิม ⇒ notFound · ?at= = นาฬิกา QC เฉพาะ SVC_QC_CLOCK=1
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import DayCalendar from "@/components/booking/DayCalendar";
import { qcNowOf } from "@/components/booking/line-page";
import { lineAccess, type LineMember } from "@/lib/modules/booking/line-access";
import { loadDayCalendar } from "@/lib/modules/booking/today-line";

export const dynamic = "force-dynamic";

export default async function BookingDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams?: Promise<{ date?: string; at?: string }>;
}) {
  const { unitSlug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const { auth, unit } = await requireUnit(unitSlug);
  const m: LineMember = {
    role: auth.active.role as LineMember["role"],
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const qc = qcNowOf(sp?.at, process.env.SVC_QC_CLOCK === "1");
  const today = new Date(qc.now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const dateStr = typeof sp?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const view =
    (await loadDayCalendar({ tenantId: auth.active.tenantId, unitId: unit.id }, { userId: auth.user.id, access: lineAccess(m, unit.id) }, { dateStr, now: qc.now }))
    ?? (dateStr !== today ? await loadDayCalendar({ tenantId: auth.active.tenantId, unitId: unit.id }, { userId: auth.user.id, access: lineAccess(m, unit.id) }, { dateStr: today, now: qc.now }) : null);
  if (!view) notFound();
  return <DayCalendar view={view} unitSlug={unitSlug} at={qc.at} />;
}
