import { requireUnit } from "@/lib/core/context";
import { getUnitHours, listClosures } from "@/lib/modules/booking/service";
import { setBookingHoursAction, addClosureAction, removeClosureAction } from "@/lib/actions/booking";
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
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const [hours, closures] = await Promise.all([getUnitHours(ctx.tenantId, ctx.unitId), listClosures(ctx)]);
  const byWeekday = new Map(hours.map((h) => [h.weekday, h]));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="เวลาทำการ" desc="เวลาทำการประจำสัปดาห์ + วันหยุด/เวลาพิเศษรายวัน — ใช้เป็นกรอบช่องจอง" />

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

      {/* ── วันหยุด/เวลาพิเศษรายวัน ──
          ทับเวลาทำการรายสัปดาห์เฉพาะวันที่ระบุ (ปีใหม่ สงกรานต์ ลาพักร้อน หรือวันเปิดสั้น) */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">วันหยุด / เวลาพิเศษรายวัน</h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            ใช้ทับตารางด้านบนเฉพาะวันที่เลือก — ปิดทั้งวัน หรือเปิดเวลาพิเศษก็ได้
          </p>
        </div>

        {closures.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่ได้ตั้งวันหยุด</p>
        ) : (
          <div className="flex flex-col gap-2">
            {closures.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">
                    {new Date(`${c.date}T12:00:00+07:00`).toLocaleDateString("th-TH", {
                      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
                    })}
                  </span>
                  <span className="text-xs text-[color:var(--color-muted)]">
                    {c.closed
                      ? "ปิดทั้งวัน"
                      : `เปิดพิเศษ ${minutesToHHMM(c.openMin ?? 0)} – ${minutesToHHMM(c.closeMin ?? 0)} น.`}
                    {c.note ? ` · ${c.note}` : ""}
                  </span>
                </div>
                <form action={removeClosureAction.bind(null, unitSlug)}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
                </form>
              </div>
            ))}
          </div>
        )}

        <form
          action={addClosureAction.bind(null, unitSlug)}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed px-3 py-2 text-sm"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">วันที่</span>
            <input type="date" name="date" required className="rounded-lg border px-2 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">แบบ</span>
            <select name="mode" defaultValue="closed" className="rounded-lg border px-2 py-2">
              <option value="closed">ปิดทั้งวัน</option>
              <option value="open">เปิดเวลาพิเศษ</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">เปิด</span>
            <input type="time" name="openAt" defaultValue="10:00" className="rounded-lg border px-2 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">ปิด</span>
            <input type="time" name="closeAt" defaultValue="14:00" className="rounded-lg border px-2 py-2" />
          </label>
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">หมายเหตุ</span>
            <input name="note" placeholder="เช่น หยุดปีใหม่" className="w-full rounded-lg border px-2 py-2" />
          </label>
          <button className="btn btn-primary min-h-[40px] text-sm">เพิ่ม</button>
        </form>
        <p className="text-xs text-[color:var(--color-muted)]">
          เลือก “ปิดทั้งวัน” ไม่ต้องสนใจช่องเวลา · เลือก “เปิดเวลาพิเศษ” ระบบจะใช้เวลาในช่องแทนตารางประจำสัปดาห์
        </p>
      </section>
    </div>
  );
}
