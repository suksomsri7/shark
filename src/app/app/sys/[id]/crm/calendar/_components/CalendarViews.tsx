// มุมมองปฏิทินกิจกรรม CRM (ใบ C1.6 · §3.8 · ภาพ 08 ขวา "ปฏิทินสัปดาห์ · ของฉัน/ทีม") — วัน | สัปดาห์ | เดือน
// 🔴 คอมโพเนนต์ฝั่งเซิร์ฟเวอร์ล้วน (ไม่มี state) — รับรายการที่หน้าอ่านผ่านบริการแล้ว · เวลาไทย +07:00 คิดจาก epoch (ไม่ใช้ getDay/getDate)
// 🔴 390 px: สัปดาห์/วัน แสดงเป็นรายการตามวัน (ไม่มีตารางกว้างล้นจอ) · ≥ 640 px แสดงเป็นตารางชั่วโมง

import Link from "next/link";
import {
  ACTIVITY_TYPE_LABEL,
  DAY_MS,
  TH_WEEKDAYS_SHORT,
  thaiDateLabel,
  thaiDayKey,
  thaiDayStartMs,
  thaiTimeLabel,
  thaiWeekday,
  type ActivityListItem,
} from "@/lib/modules/crm/activities-shared";

export type CalendarView = "day" | "week" | "month";
export const CALENDAR_VIEWS: readonly CalendarView[] = ["day", "week", "month"];
export const CALENDAR_VIEW_LABEL: Record<CalendarView, string> = { day: "วัน", week: "สัปดาห์", month: "เดือน" };
const HOURS = Array.from({ length: 14 }, (_x, i) => i + 7); // 07–20

const atOf = (i: ActivityListItem): number => Date.parse(i.startAt ?? i.dueAt ?? i.createdAt);
const hourOf = (ms: number): number => new Date(ms + 7 * 3600_000).getUTCHours();

function hrefOf(systemId: string, i: ActivityListItem): string | null {
  if (i.dealId) return `/app/sys/${systemId}/crm/deals/${i.dealId}`;
  if (i.contactId) return `/app/sys/${systemId}/crm/contacts/${i.contactId}`;
  if (i.companyId) return `/app/sys/${systemId}/crm/companies/${i.companyId}`;
  return null;
}

function Chip({ systemId, item, compact = false }: { systemId: string; item: ActivityListItem; compact?: boolean }) {
  const href = hrefOf(systemId, item);
  const done = !!item.doneAt;
  const label = `${thaiTimeLabel(atOf(item))} ${ACTIVITY_TYPE_LABEL[item.type]} · ${item.title}`;
  const style = done
    ? { background: "transparent", color: "var(--color-muted)", borderColor: "var(--color-border, currentColor)", textDecoration: "line-through" }
    : { background: "var(--color-fg, #111)", color: "var(--color-bg, #fff)", borderColor: "transparent" };
  const cls = `block min-w-0 truncate rounded-md border px-1.5 py-0.5 text-[11px] leading-tight ${compact ? "" : "sm:whitespace-normal"}`;
  return href ? (
    <Link href={href} className={cls} style={style} title={label} data-testid="calendar-item">
      {label}
    </Link>
  ) : (
    <span className={cls} style={style} title={label}>
      {label}
    </span>
  );
}

/** รายการตามวัน (มือถือ + มุมมองวัน) */
function Agenda({ systemId, days, byDay }: { systemId: string; days: number[]; byDay: Map<string, ActivityListItem[]> }) {
  return (
    <ul className="flex flex-col divide-y">
      {days.map((d) => {
        const items = byDay.get(thaiDayKey(d)) ?? [];
        return (
          <li key={d} className="flex flex-col gap-1 py-2">
            <span className="text-xs font-semibold">
              {TH_WEEKDAYS_SHORT[thaiWeekday(d)]} {thaiDateLabel(d)}
            </span>
            {items.length === 0 ? (
              <span className="text-xs text-[color:var(--color-muted)]">ว่าง</span>
            ) : (
              items.map((i) => <Chip key={i.id} systemId={systemId} item={i} />)
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** ตารางชั่วโมง 07–20 × วัน (≥ 640 px) · ก่อน 7 โมง/หลัง 2 ทุ่ม รวมไว้แถวบน/ล่าง */
function HourGrid({ systemId, days, byDay, todayKey }: { systemId: string; days: number[]; byDay: Map<string, ActivityListItem[]>; todayKey: string }) {
  const rows: { key: string; label: string; match: (h: number) => boolean }[] = [
    { key: "early", label: "ก่อน 07", match: (h) => h < 7 },
    ...HOURS.map((h) => ({ key: String(h), label: String(h).padStart(2, "0"), match: (x: number) => x === h })),
    { key: "late", label: "หลัง 20", match: (h) => h > 20 },
  ];
  return (
    <div className="grid min-w-0 text-xs" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}>
      <div />
      {days.map((d) => (
        <div key={d} className="border-b px-1 py-1 text-center font-semibold" style={thaiDayKey(d) === todayKey ? { color: "var(--color-accent)" } : undefined}>
          {TH_WEEKDAYS_SHORT[thaiWeekday(d)]} {new Date(d + 7 * 3600_000).getUTCDate()}
        </div>
      ))}
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <div className="border-t px-1 py-1 text-[color:var(--color-muted)]">{r.label}</div>
          {days.map((d) => {
            const items = (byDay.get(thaiDayKey(d)) ?? []).filter((i) => r.match(hourOf(atOf(i))));
            return (
              <div key={d} className="flex min-h-[2.25rem] min-w-0 flex-col gap-0.5 border-l border-t p-0.5">
                {items.map((i) => (
                  <Chip key={i.id} systemId={systemId} item={i} compact />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function CalendarBody({ systemId, view, anchorMs, items }: { systemId: string; view: CalendarView; anchorMs: number; items: ActivityListItem[] }) {
  const byDay = new Map<string, ActivityListItem[]>();
  for (const i of [...items].sort((a, b) => atOf(a) - atOf(b))) {
    const k = thaiDayKey(atOf(i));
    byDay.set(k, [...(byDay.get(k) ?? []), i]);
  }
  const todayKey = thaiDayKey(Date.now());
  if (view === "month") {
    const { start, days } = calendarWindow("month", anchorMs);
    const monthKey = thaiDayKey(anchorMs).slice(0, 7);
    return (
      <div className="grid min-w-0 grid-cols-7 text-xs" data-testid="calendar-month">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => (
          <div key={w} className="border-b px-1 py-1 text-center font-semibold">
            {TH_WEEKDAYS_SHORT[w]}
          </div>
        ))}
        {Array.from({ length: days }, (_x, n) => start + n * DAY_MS).map((d) => {
          const key = thaiDayKey(d);
          const list = byDay.get(key) ?? [];
          return (
            <div key={d} className="flex min-h-[4.5rem] min-w-0 flex-col gap-0.5 border-l border-t p-0.5" style={key.slice(0, 7) !== monthKey ? { opacity: 0.45 } : undefined}>
              <span className="text-[11px]" style={key === todayKey ? { color: "var(--color-accent)", fontWeight: 700 } : undefined}>
                {new Date(d + 7 * 3600_000).getUTCDate()}
              </span>
              {list.slice(0, 3).map((i) => (
                <Chip key={i.id} systemId={systemId} item={i} compact />
              ))}
              {list.length > 3 && <span className="text-[10px] text-[color:var(--color-muted)]">+{list.length - 3} รายการ</span>}
            </div>
          );
        })}
      </div>
    );
  }
  const { start, days } = calendarWindow(view, anchorMs);
  const dayList = Array.from({ length: days }, (_x, n) => start + n * DAY_MS);
  return (
    <div data-testid={view === "day" ? "calendar-day" : "calendar-week"}>
      <div className="sm:hidden">
        <Agenda systemId={systemId} days={dayList} byDay={byDay} />
      </div>
      <div className="hidden sm:block">
        <HourGrid systemId={systemId} days={dayList} byDay={byDay} todayKey={todayKey} />
      </div>
    </div>
  );
}

/** ช่วงวันของมุมมอง (00:00 ไทยของวันแรก · จำนวนวัน) — สัปดาห์เริ่มวันจันทร์ · เดือน = ตาราง 6 สัปดาห์ */
export function calendarWindow(view: CalendarView, anchorMs: number): { start: number; days: number } {
  const d0 = thaiDayStartMs(anchorMs);
  if (view === "day") return { start: d0, days: 1 };
  const mondayOffset = (thaiWeekday(d0) + 6) % 7;
  if (view === "week") return { start: d0 - mondayOffset * DAY_MS, days: 7 };
  const first = thaiDayStartMs(Date.parse(`${thaiDayKey(anchorMs).slice(0, 7)}-01T00:00:00+07:00`));
  const off = (thaiWeekday(first) + 6) % 7;
  return { start: first - off * DAY_MS, days: 42 };
}

/** เลื่อนวันอ้างอิงไปก่อน/หลัง 1 ช่วงของมุมมอง */
export function shiftAnchor(view: CalendarView, anchorMs: number, dir: -1 | 1): number {
  if (view === "day") return anchorMs + dir * DAY_MS;
  if (view === "week") return anchorMs + dir * 7 * DAY_MS;
  const [y, m] = thaiDayKey(anchorMs).slice(0, 7).split("-").map(Number) as [number, number];
  const nm = m + dir;
  const ny = nm < 1 ? y - 1 : nm > 12 ? y + 1 : y;
  const mm = ((nm + 11) % 12) + 1;
  return Date.parse(`${ny}-${String(mm).padStart(2, "0")}-01T00:00:00+07:00`);
}
