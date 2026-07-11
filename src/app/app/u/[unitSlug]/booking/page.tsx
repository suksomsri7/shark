import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listAppointments } from "@/lib/modules/booking/service";
import { daySummary } from "@/lib/modules/pos/service";
import { setStatusAction } from "@/lib/actions/booking";

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "ยืนยันแล้ว",
  ARRIVED: "มาถึงแล้ว",
  DONE: "เสร็จ",
  NO_SHOW: "ไม่มา",
  PENDING: "รอยืนยัน",
  CANCELLED: "ยกเลิก",
};

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
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">{unit.name}</div>
          <h1 className="text-2xl font-semibold">รายการนัด</h1>
          <div className="mt-1 text-sm text-[color:var(--color-muted)]">
            ยอดขายวันนี้ · ฿{(revenue.totalSatang / 100).toLocaleString("th-TH")} ({revenue.count} บิล)
          </div>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      {appts.length === 0 ? (
        <div className="card text-center text-sm text-[color:var(--color-muted)]">
          ยังไม่มีนัด — แชร์ลิงก์หน้าจองให้ลูกค้า หรือกด "ตั้งค่า" เพิ่มบริการ/พนักงานก่อน
        </div>
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
                  <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]">
                    {STATUS_LABEL[a.status]}
                  </span>
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
  return (
    <form action={setStatusAction.bind(null, slug)}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className="rounded-lg border px-2.5 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">
        {label}
      </button>
    </form>
  );
}
