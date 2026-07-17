import { requireUnit } from "@/lib/core/context";
import { getUnitHours } from "@/lib/modules/booking/service";
import { setBookingHoursAction } from "@/lib/actions/booking";
import { minutesToHHMM } from "@/lib/modules/booking/slots";
import { PageHeader } from "@/components/ui/PageHeader";

// ลำดับแสดง จันทร์→อาทิตย์ (weekday DB 0=อาทิตย์)
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABEL: Record<number, string> = {
  0: "อาทิตย์",
  1: "จันทร์",
  2: "อังคาร",
  3: "พุธ",
  4: "พฤหัสบดี",
  5: "ศุกร์",
  6: "เสาร์",
};

export default async function BookingHoursPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const hours = await getUnitHours(auth.active.tenantId, unit.id);
  const byWeekday = new Map(hours.map((h) => [h.weekday, h]));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="เวลาทำการ" desc="กำหนดเวลาเปิด-ปิด และวันหยุดของร้าน — ใช้เป็นกรอบช่องจอง" />

      <form action={setBookingHoursAction.bind(null, unitSlug)} className="flex flex-col gap-3">
        {DISPLAY_ORDER.map((wd) => {
          const h = byWeekday.get(wd)!;
          return (
            <div
              key={wd}
              className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="w-16 font-medium">{DAY_LABEL[wd]}</span>
              <label className="flex items-center gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">เปิด</span>
                <input
                  type="time"
                  name={`open-${wd}`}
                  defaultValue={minutesToHHMM(h.openMin)}
                  className="rounded-lg border px-2 py-1"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">ปิด</span>
                <input
                  type="time"
                  name={`close-${wd}`}
                  defaultValue={minutesToHHMM(h.closeMin)}
                  className="rounded-lg border px-2 py-1"
                />
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" name={`closed-${wd}`} defaultChecked={h.closed} />
                <span className="text-xs">หยุด</span>
              </label>
            </div>
          );
        })}
        <button className="btn btn-primary self-start text-sm">บันทึก</button>
      </form>
    </div>
  );
}
