import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { getEvent, eventSummary } from "@/lib/modules/ticket/service";
import CheckinForm from "./CheckinForm";

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { unitSlug } = await params;
  const { event: eventId } = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);

  const event = eventId ? await getEvent(auth.active.tenantId, unit.id, eventId) : null;
  const summary =
    event ? await eventSummary(auth.active.tenantId, unit.id, event.id) : null;

  return (
    <div className="flex max-w-md flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">{unit.name}</div>
          <h1 className="text-2xl font-semibold">เช็คอิน</h1>
          {event ? (
            <div className="mt-1 text-sm text-[color:var(--color-muted)]">
              {event.name} · เข้าแล้ว {summary?.checkedIn}/{summary?.admissionsTotal}
            </div>
          ) : (
            <div className="mt-1 text-sm text-[color:var(--color-muted)]">
              เช็คอินได้ทุกงานของหน่วยนี้
            </div>
          )}
        </div>
        <Link href={`/app/u/${unitSlug}/ticket`} className="btn btn-ghost text-sm">
          ← กลับ
        </Link>
      </div>

      <CheckinForm unitSlug={unitSlug} eventId={event?.id} />
    </div>
  );
}
