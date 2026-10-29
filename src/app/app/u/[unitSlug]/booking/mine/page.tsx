// SVC B.5 — มือถือช่าง "ของฉัน" (ใบสั่ง §3.6) · หน่วยแถวเดียวเท่านั้น · ไม่มีสิทธิ์ดู/ร้านเดิม ⇒ notFound
//   ?at= = นาฬิกา QC เฉพาะ SVC_QC_CLOCK=1 · ?err= = เหตุผลจาก action ที่ล้ม
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import MyQueue from "@/components/booking/MyQueue";
import { lineActionsFor, qcNowOf } from "@/components/booking/line-page";
import { lineAccess, type LineMember } from "@/lib/modules/booking/line-access";
import { loadTodayLine } from "@/lib/modules/booking/today-line";

export const dynamic = "force-dynamic";

export default async function BookingMinePage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams?: Promise<{ err?: string; at?: string }>;
}) {
  const { unitSlug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const err = typeof sp?.err === "string" ? sp.err.slice(0, 300) : "";
  const { auth, unit } = await requireUnit(unitSlug);
  const m: LineMember = {
    role: auth.active.role as LineMember["role"],
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const qc = qcNowOf(sp?.at, process.env.SVC_QC_CLOCK === "1");
  const view = await loadTodayLine({ tenantId: auth.active.tenantId, unitId: unit.id }, { userId: auth.user.id, access: lineAccess(m, unit.id) }, { now: qc.now });
  if (!view) notFound();
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <AutoRefresh />
      {err ? (
        <p role="alert" data-testid="booking-status-error" className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
          {err}
        </p>
      ) : null}
      <MyQueue view={view} unitSlug={unitSlug} actions={lineActionsFor(unitSlug)} at={qc.at} />
    </div>
  );
}
