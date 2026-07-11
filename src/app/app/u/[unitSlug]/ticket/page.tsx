import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listEvents } from "@/lib/modules/ticket/service";
import { createEventAction } from "@/lib/modules/ticket/actions";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  PUBLISHED: "เปิดขาย",
  ENDED: "จบงาน",
  CANCELLED: "ยกเลิก",
};

function fmt(d: Date) {
  return d.toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

const baht = (s: number) => (s / 100).toLocaleString("th-TH");

export default async function TicketPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const events = await listEvents(auth.active.tenantId, unit.id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">{unit.name}</div>
          <h1 className="text-2xl font-semibold">ตั๋ว / อีเวนต์</h1>
        </div>
        <Link href={`/app/u/${unitSlug}/ticket/checkin`} className="btn btn-ghost text-sm">
          เช็คอิน
        </Link>
      </div>

      {/* สร้างอีเวนต์ใหม่ */}
      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">+ สร้างอีเวนต์ใหม่</summary>
        <form action={createEventAction.bind(null, unitSlug)} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">ชื่องาน</span>
            <input name="name" required placeholder="เช่น คอนเสิร์ตปีใหม่" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">สถานที่</span>
            <input name="venue" placeholder="เช่น ลานหน้าห้าง" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--color-muted)]">เริ่มงาน</span>
              <input name="startAt" type="datetime-local" required className="w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--color-muted)]">จบงาน (ไม่บังคับ)</span>
              <input name="endAt" type="datetime-local" className="w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">รายละเอียด (ไม่บังคับ)</span>
            <textarea name="description" rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <button className="btn btn-primary self-start text-sm">สร้างอีเวนต์</button>
        </form>
      </details>

      {events.length === 0 ? (
        <div className="card text-center text-sm text-[color:var(--color-muted)]">
          ยังไม่มีอีเวนต์ — กด "สร้างอีเวนต์ใหม่" เพื่อเริ่มขายตั๋ว
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((e) => {
            const quota = e.ticketTypes.reduce((s, t) => s + t.quota, 0);
            const sold = e.ticketTypes.reduce((s, t) => s + t.sold, 0);
            return (
              <Link
                key={e.id}
                href={`/app/u/${unitSlug}/ticket/event/${e.id}`}
                className="rounded-xl border p-3 hover:bg-[color:var(--color-surface-2)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{e.name}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">
                      {fmt(e.startAt)}
                      {e.venue ? ` · ${e.venue}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                      ขายแล้ว {sold}/{quota} ใบ · {e.ticketTypes.length} ประเภท
                      {e.ticketTypes.length > 0
                        ? ` · เริ่ม ฿${baht(Math.min(...e.ticketTypes.map((t) => t.priceSatang)))}`
                        : ""}
                    </div>
                  </div>
                  <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]">
                    {STATUS_LABEL[e.status]}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
