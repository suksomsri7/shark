// SVC B.5 — ปฏิทินรายวันตามคน (DESIGN-BOOKING-QUEUE R6 ย่อ · อ่านอย่างเดียว — ลาก/คลิกจอง = ใบหลัง) · สัญญา DOM: ใบสั่ง §4
// คอลัมน์ = ช่าง (เรียงตามเก้าอี้) · แกนตั้ง = เวลาร้าน · บล็อก = งานของวัน (ไม่รวมยกเลิก) · ไม่มีเบอร์
import Link from "next/link";
import type { DayCalendarView } from "@/lib/modules/booking/today-line";
import { dayLabel, hhmm, minLabel, type LineActions } from "./line-parts";

type Props = { view: DayCalendarView; unitSlug: string; actions?: LineActions; at?: string };

const STATUS_CLASS: Record<string, string> = {
  IN_SERVICE: "bg-[color:var(--color-ink)] text-[color:var(--color-surface)] border border-[color:var(--color-ink)]",
  ARRIVED: "bg-[color:var(--color-surface)] border-[1.5px] border-[color:var(--color-ink)]",
  QUEUED: "bg-[#d4d4d4] border-2 border-[color:var(--color-accent)]",
  DONE: "bg-[color:var(--color-surface-2)] border border-[color:var(--color-line)] text-[color:var(--color-muted)]",
  NO_SHOW: "bg-[color:var(--color-surface)] border-[1.5px] border-dashed border-[color:var(--color-danger)] text-[color:var(--color-danger)]",
  LATE: "bg-[color:var(--color-surface)] border-[1.5px] border-dashed border-[color:var(--color-danger)] text-[color:var(--color-danger)]",
};
const DEFAULT_CLASS = "bg-[color:var(--color-surface)] border-[1.5px] border-dashed border-[color:var(--color-ink)]";
const ROW_PX = 56; // ความสูงต่อชั่วโมง

export default function DayCalendar({ view, unitSlug, at }: Props) {
  const startMin = view.openMin ?? 8 * 60;
  const endMin = Math.max(startMin + 60, view.closeMin ?? 20 * 60);
  const [y, m, d] = view.dateStr.split("-").map(Number);
  const dayStartMs = Date.UTC(y, m - 1, d) - 7 * 3_600_000;
  const top = (ms: number) => ((ms - dayStartMs) / 60_000 - startMin) / 60 * ROW_PX;
  const heightPx = ((endMin - startMin) / 60) * ROW_PX;
  const hours: number[] = [];
  for (let h = Math.ceil(startMin / 60) * 60; h <= endMin; h += 60) hours.push(h);
  const q = (ds: string) => `/app/u/${unitSlug}/booking/day?date=${ds}${at ? `&at=${encodeURIComponent(at)}` : ""}`;

  return (
    <div data-day-calendar="" className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-xl font-bold tracking-tight">ปฏิทินนัด · {dayLabel(view.dateStr)}</h1>
        <Link data-cal-prev="" href={q(view.prevDateStr)} className="btn-sm min-h-[40px]">
          ‹ วันก่อน
        </Link>
        <Link data-cal-next="" href={q(view.nextDateStr)} className="btn-sm min-h-[40px]">
          วันถัดไป ›
        </Link>
      </div>
      <p className="text-[13px] text-[color:var(--color-muted)]">
        {view.openMin === null ? "ร้านปิดวันนี้" : `เปิด ${minLabel(view.openMin)}–${minLabel(view.closeMin)}`} · {view.staff.length} คน · อ่านอย่างเดียว
      </p>
      <div className="overflow-x-auto rounded-xl border">
        <div className="flex min-w-max">
          <div className="w-14 flex-none border-r">
            <div className="h-10 border-b" />
            <div className="relative" style={{ height: heightPx }}>
              {hours.map((h) => (
                <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[11px] tabular-nums text-[color:var(--color-muted)]" style={{ top: ((h - startMin) / 60) * ROW_PX }}>
                  {minLabel(h)}
                </span>
              ))}
            </div>
          </div>
          {view.staff.map((s) => (
            <div key={s.staffId} data-cal-staff={s.staffId} className="w-[150px] flex-none border-r last:border-r-0">
              <div className="flex h-10 items-center border-b bg-[color:var(--color-surface-2)] px-2 text-sm font-semibold">
                <span className="truncate">{s.name}</span>
              </div>
              <div className="relative" style={{ height: heightPx }}>
                {hours.map((h) => (
                  <i key={h} className="absolute inset-x-0 h-px bg-[color:var(--color-line)]" style={{ top: ((h - startMin) / 60) * ROW_PX }} />
                ))}
                {s.blocks.map((b) => {
                  const t = Math.max(0, top(b.startMs));
                  const hgt = Math.max(18, Math.min(heightPx, top(b.endMs)) - t);
                  const out = top(b.endMs) <= 0 || t >= heightPx;
                  return (
                    <div
                      key={b.appointmentId}
                      data-cal-block={b.appointmentId}
                      title={`${hhmm(b.startMs)}–${hhmm(b.endMs)} ${b.label}`}
                      className={`absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-1 text-[11.5px] leading-tight ${STATUS_CLASS[b.status] ?? DEFAULT_CLASS} ${out ? "hidden" : ""}`}
                      style={{ top: t, height: hgt }}
                    >
                      <b className="block truncate">
                        {hhmm(b.startMs)} {b.ticketNumber ?? ""} {b.label}
                      </b>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
