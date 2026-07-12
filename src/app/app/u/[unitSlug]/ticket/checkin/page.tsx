import { requireUnit } from "@/lib/core/context";
import { getEvent, eventSummary } from "@/lib/modules/ticket/service";
import CheckinForm from "./CheckinForm";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader
        title="เช็คอิน"
        desc={
          event
            ? `${event.name} · เข้าแล้ว ${summary?.checkedIn}/${summary?.admissionsTotal}`
            : "เช็คอินได้ทุกงานของหน่วยนี้"
        }
        back={{ href: `/app/u/${unitSlug}/ticket`, label: "ตั๋ว / อีเวนต์" }}
      />

      <CheckinForm unitSlug={unitSlug} eventId={event?.id} />
    </div>
  );
}
