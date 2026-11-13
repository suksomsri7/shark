// components/book/BookCalendar.tsx — ปฏิทินเดือนของที่ว่างจริง (จอใหญ่ = ตาราง 7 คอลัมน์ · มือถือ = ชิปวัน) · RUN TRIPS W1.1a
// แสดงผลเท่านั้น: สภาพของวัน/เลขที่ว่าง/วันไหนกดได้ มาจาก VM (ตัวตัดสินอยู่ที่ dayCellOf ฝั่งเซิร์ฟเวอร์) — ไฟล์นี้ไม่ตัดสินเอง ไม่อ่านนาฬิกา
// ทุกสภาพมีข้อความกำกับ (ไม่พึ่งสี/รูปทรงอย่างเดียว) · วัน/เดือนเป็นลิงก์จริง (ใช้ได้โดยไม่มีสคริปต์ · กดด้วยแป้นได้)
import { formatYmd } from "@/components/trips/trips-shared";
import { bookHref, dayHasDeparture, type BookCarry, type BookDayVM, type BookProductVM } from "@/lib/platform/trips-public-core";
import { bookDateNames, bookMonthTitle, bookT, type BookT } from "./book-i18n";

// รูปทรงต่อสภาพ (อ่านจาก data-state / data-selected ของช่อง): เลือก = กรอบหนา · เหลือน้อย = เส้นประสีอันตราย · ไม่ออกเดินทาง = ลายขีด + ขีดฆ่าเลขวัน · ผ่านแล้ว = พื้นจาง
const CELL =
  "flex flex-col items-start justify-between gap-1 rounded-xl border bg-[color:var(--color-surface)] p-2 text-left " +
  "data-[state=LOW]:border-dashed data-[state=LOW]:border-[color:var(--color-danger)] " +
  "data-[state=PAST]:border-transparent data-[state=PAST]:bg-[color:var(--color-surface-2)] data-[state=PAST]:text-[color:var(--color-muted)] " +
  "data-[state=NONE]:border-transparent data-[state=NONE]:text-[color:var(--color-muted)] " +
  "data-[state=NOT_RUNNING]:bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-line)_6px_8px)] data-[state=NOT_RUNNING]:text-[color:var(--color-ink-soft)] " +
  "data-[selected=true]:border-2 data-[selected=true]:border-[color:var(--color-accent)] data-[selected=true]:bg-[color:var(--color-accent-soft)]";
const IN_TABLE = "h-full min-h-[76px] w-full";
const AS_CHIP = "min-h-[72px] w-[74px]";
const DAY_NO = "text-base font-semibold leading-none group-data-[state=NOT_RUNNING]:line-through";
const DAY_TEXT = "break-words text-sm leading-tight group-data-[state=LOW]:font-semibold group-data-[state=LOW]:text-[color:var(--color-danger)]";
const NAV = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border bg-[color:var(--color-surface)] text-xl leading-none";

/** ข้อความของสภาพวัน — ผ่านแล้ว/ไม่มีรอบ = ว่าง (มีคำอ่านใน title) */
function dayText(t: BookT, d: BookDayVM): string {
  return dayHasDeparture(d.state) ? t(`day.${d.state}`, { n: d.left ?? 0 }) : "";
}
/** จำนวนรอบของวัน — แสดงเมื่อมีมากกว่า 1 รอบที่ขายได้ (เลขที่ว่างของช่อง = ของรอบที่ออกเร็วที่สุด) */
function countText(t: BookT, d: BookDayVM): string {
  return d.departures > 1 ? t("slot.count", { n: d.departures }) : "";
}
/** ชื่อเต็มของช่องวัน (วันที่ + สภาพ/ที่ว่าง + จำนวนรอบ) — ตัวอ่านหน้าจอไม่ได้ยินแค่เลขวัน */
function dayLabel(t: BookT, d: BookDayVM, fullDate: string): string {
  return [fullDate, t(`day.${d.state}`, { n: d.left ?? 0 }), countText(t, d)].filter(Boolean).join(" · ");
}
const DAY_COUNT = "break-words text-sm leading-tight text-[color:var(--color-ink-soft)]";

type Props = { vm: BookProductVM; carry: BookCarry };

export function BookCalendar({ vm, carry }: Props) {
  const t = bookT(vm.locale);
  const names = bookDateNames(vm.locale);
  const shop = vm.shop.slug;
  const slug = vm.product.slug;
  const dayHref = (date: string) => bookHref(shop, slug, { lang: carry.lang, a: carry.a, m: vm.month, d: date });
  const monthHref = (month: string) => bookHref(shop, slug, { lang: carry.lang, a: carry.a, m: month });
  const listed = vm.weeks.flatMap((w) => w.flatMap((d) => (d !== null && dayHasDeparture(d.state) ? [d] : [])));

  return (
    <section className="rounded-2xl border bg-[color:var(--color-surface)] p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("product.chooseDate")}</h2>
        <div className="flex items-center gap-2">
          {vm.prevMonth ? (
            <a data-testid="book-cal-prev" href={monthHref(vm.prevMonth)} aria-label={t("product.prevMonth")} title={t("product.prevMonth")} className={NAV}>
              <span aria-hidden="true">‹</span>
            </a>
          ) : null}
          <span data-testid="book-cal-month" className="min-w-0 px-1 text-center text-base font-semibold">
            {bookMonthTitle(vm.month, vm.locale)}
          </span>
          {vm.nextMonth ? (
            <a data-testid="book-cal-next" href={monthHref(vm.nextMonth)} aria-label={t("product.nextMonth")} title={t("product.nextMonth")} className={NAV}>
              <span aria-hidden="true">›</span>
            </a>
          ) : null}
        </div>
      </div>

      {/* จอใหญ่: ตารางเดือน อา.–ส. */}
      <table data-testid="book-cal" className="mt-4 hidden w-full table-fixed border-separate border-spacing-1.5 md:table">
        <caption className="pb-2 text-left text-sm text-[color:var(--color-muted)]">{t("product.calendarCaption")}</caption>
        <thead>
          <tr>
            {names.weekdays.map((w, i) => (
              <th key={i} scope="col" className="pb-1 text-center text-sm font-medium text-[color:var(--color-muted)]">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vm.weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((d, di) =>
                d === null ? (
                  <td key={di} className="p-0" />
                ) : (
                  <td key={di} className="h-[76px] p-0 align-top">
                    {d.selectable ? (
                      <a
                        data-testid={`book-day-${d.date}`}
                        data-state={d.state}
                        data-selected={d.selected ? "true" : "false"}
                        href={dayHref(d.date)}
                        aria-current={d.selected ? "date" : undefined}
                        aria-label={dayLabel(t, d, formatYmd(d.date, names))}
                        title={formatYmd(d.date, names)}
                        className={`group ${CELL} ${IN_TABLE} hover:border-[color:var(--color-accent)]`}
                      >
                        <span className={DAY_NO}>{d.day}</span>
                        <span className={DAY_TEXT}>{dayText(t, d)}</span>
                        {d.departures > 1 ? <span className={DAY_COUNT}>{countText(t, d)}</span> : null}
                      </a>
                    ) : (
                      <div data-testid={`book-day-${d.date}`} data-state={d.state} data-selected="false" title={dayLabel(t, d, formatYmd(d.date, names))} className={`group ${CELL} ${IN_TABLE}`}>
                        <span className={DAY_NO}>{d.day}</span>
                        <span className={DAY_TEXT}>{dayText(t, d)}</span>
                      </div>
                    )}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* มือถือ: ชิปวัน เฉพาะวันที่มีรอบตั้งแต่วันนี้ของเดือนที่ดู — ห่อบรรทัด ไม่เลื่อนแนวนอน */}
      <ul data-testid="book-cal-strip" className="mt-4 flex flex-wrap gap-2 md:hidden">
        {listed.map((d) => (
          <li key={d.date} className="min-w-0">
            {d.selectable ? (
              <a
                data-testid={`book-chip-${d.date}`}
                data-state={d.state}
                data-selected={d.selected ? "true" : "false"}
                href={dayHref(d.date)}
                aria-current={d.selected ? "date" : undefined}
                aria-label={dayLabel(t, d, formatYmd(d.date, names))}
                className={`group ${CELL} ${AS_CHIP}`}
              >
                <span className="text-sm leading-none text-[color:var(--color-muted)]">{names.weekdays[weekdayIndex(vm, d.date)] ?? ""}</span>
                <span className={DAY_NO}>{d.day}</span>
                <span className={DAY_TEXT}>{dayText(t, d)}</span>
                {d.departures > 1 ? <span className={DAY_COUNT}>{countText(t, d)}</span> : null}
              </a>
            ) : (
              <div data-testid={`book-chip-${d.date}`} data-state={d.state} data-selected="false" title={dayLabel(t, d, formatYmd(d.date, names))} className={`group ${CELL} ${AS_CHIP}`}>
                <span className="text-sm leading-none text-[color:var(--color-muted)]">{names.weekdays[weekdayIndex(vm, d.date)] ?? ""}</span>
                <span className={DAY_NO}>{d.day}</span>
                <span className={DAY_TEXT}>{dayText(t, d)}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {listed.length === 0 ? <p className="mt-3 text-sm text-[color:var(--color-muted)]">{t("product.noDates")}</p> : null}

      <ul data-testid="book-legend" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[color:var(--color-ink-soft)]">
        <li className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded border-2 border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]" />
          {t("legend.selected")}
        </li>
        <li className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded border border-dashed border-[color:var(--color-danger)]" />
          {t("legend.low")}
        </li>
        <li className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded border bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--color-line)_3px_5px)]" />
          {t("legend.notRunning")}
        </li>
        <li className="min-w-0 break-words">{t("legend.real")}</li>
      </ul>
    </section>
  );
}

/** คอลัมน์ของวันในตารางเดือน = วันในสัปดาห์ (0 = อาทิตย์) — อ่านจากตำแหน่งใน VM ไม่คิดจากนาฬิกา */
function weekdayIndex(vm: BookProductVM, date: string): number {
  for (const week of vm.weeks) {
    const i = week.findIndex((d) => d !== null && d.date === date);
    if (i >= 0) return i;
  }
  return -1;
}
