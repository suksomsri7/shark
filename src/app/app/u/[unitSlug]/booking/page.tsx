import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listAppointments } from "@/lib/modules/booking/service";
import { daySummary } from "@/lib/modules/pos/service";
import { setStatusAction } from "@/lib/actions/booking";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { BOOKING_STATUS_LABEL } from "@/lib/ui/status-labels";
import { formatBaht } from "@/lib/ui/money";

const apptTone = (v: string) =>
  v === "CANCELLED" || v === "NO_SHOW" ? "danger" : v === "PENDING" ? "muted" : "strong";

function fmt(d: Date) {
  const day = d.toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  });
  const time = d.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
  return { day, time };
}

function todayBkk(): string {
  const bkk = new Date(Date.now() + 7 * 3600000);
  return bkk.toISOString().slice(0, 10);
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const [appts, revenue] = await Promise.all([
    listAppointments(auth.active.tenantId, unit.id, todayBkk()),
    daySummary(auth.active.tenantId, unit.id),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="รายการนัด"
        desc={`ยอดขายวันนี้ · ${formatBaht(revenue.totalSatang)} (${revenue.count} บิล)`}
        back={{ href: `/app/u/${unitSlug}`, label: unit.name }}
        actions={
          <>
            <Link href={`/app/u/${unitSlug}/booking/setup`} className="btn btn-ghost text-sm">
              ตั้งค่า
            </Link>
            <Link
              href={`/s/${auth.active.tenant.slug}/${unit.slug}`}
              target="_blank"
              className="btn btn-ghost text-sm"
            >
              หน้าจอง ↗
            </Link>
          </>
        }
      />

      {appts.length === 0 ? (
        <EmptyState
          text="ยังไม่มีนัดวันนี้ — แชร์ลิงก์หน้าจองให้ลูกค้า หรือเพิ่มบริการ/พนักงานในหน้าตั้งค่าก่อน"
          action={{ href: `/app/u/${unitSlug}/booking/setup`, label: "ไปหน้าตั้งค่า" }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {appts.map((a) => {
            const { day, time } = fmt(a.startAt);
            const active = a.status === "CONFIRMED" || a.status === "ARRIVED";
            return (
              <div key={a.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {time} · {a.service.name}
                    </div>
                    <div className="text-xs text-[color:var(--color-muted)]">
                      {day} · โดย {a.staff.name} · {a.customerName} {a.customerPhone}
                    </div>
                  </div>
                  <StatusChip value={a.status} map={BOOKING_STATUS_LABEL} toneOf={apptTone} />
                </div>
                {active && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusBtn slug={unitSlug} id={a.id} status="ARRIVED" label="มาถึง" />
                    <StatusBtn slug={unitSlug} id={a.id} status="DONE" label="เสร็จ" />
                    <StatusBtn slug={unitSlug} id={a.id} status="NO_SHOW" label="ไม่มา" />
                    <StatusBtn slug={unitSlug} id={a.id} status="CANCELLED" label="ยกเลิก" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBtn({
  slug,
  id,
  status,
  label,
}: {
  slug: string;
  id: string;
  status: string;
  label: string;
}) {
  if (status === "CANCELLED") {
    return (
      <ConfirmDialog
        triggerLabel={label}
        triggerClassName="btn-sm text-[color:var(--color-danger)]"
        title="ยกเลิกนัดนี้?"
        detail="นัดหมายจะถูกยกเลิก และปล่อยช่วงเวลาให้จองใหม่ได้"
        confirmLabel="ยืนยันยกเลิก"
        danger
        action={setStatusAction.bind(null, slug)}
        fields={{ id, status }}
      />
    );
  }
  return (
    <form action={setStatusAction.bind(null, slug)}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className="btn-sm">{label}</button>
    </form>
  );
}
