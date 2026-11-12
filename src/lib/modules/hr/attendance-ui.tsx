// HR H2.5 ▸ หน้าลงเวลา (server components) — ทีมรายวัน (mockup 04A) · ปฏิทินรายคน (mockup 04B) · ปฏิทินของตัวเอง
//   รับ DTO จากตัวโหลดใน judge.ts (ไม่มีพิกัด/อุปกรณ์/หมายเหตุ/เหตุผล/เงิน) · ไม่อ่านนาฬิกา (วันนี้มาจาก DTO) · ปุ่มทุกปุ่มสูง ≥ 44 px ·
//   การกดทุกอย่างเป็น form → server action (closure ของหน้า) → redirect พร้อมรหัสผลสั้น ◂
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { AttendanceBoardDto, AttendanceMonthDto, AttendanceSlotDto } from "./judge-rules";

type FormFn = (fd: FormData) => Promise<void>;
type T = Awaited<ReturnType<typeof getTranslations>>;

const BKK_MS = 7 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (iso: string | null) => (iso ? new Date(Date.parse(iso) + BKK_MS).toISOString().slice(11, 16) : "—");
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
const dur = (min: number) => `${Math.floor(min / 60)}:${pad(min % 60)}`;
const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const MONTH_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;
const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
const muted = "text-[color:var(--color-muted)]";

function dayLabel(t: T, day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return t("dayLabel", { dow: t(`dow.${DOW_KEYS[d.getUTCDay()]!}`), d: d.getUTCDate(), month: t(`months.${MONTH_KEYS[d.getUTCMonth()]!}`) });
}
function monthLabel(t: T, month: string): string {
  return t("monthLabel", { month: t(`months.${MONTH_KEYS[Number(month.slice(5)) - 1]!}`), year: Number(month.slice(0, 4)) + 543 });
}
const addMonth = (month: string, n: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

/** ป้ายสถานะของช่อง */
function statusText(t: T, s: AttendanceSlotDto): string {
  if (s.status === "LATE") return t("status.LATE", { n: s.lateMin });
  if (s.status === "EARLY_OUT") return t("status.EARLY_OUT", { n: s.earlyOutMin });
  if (s.status === "PENDING") return s.phase === "UPCOMING" ? t("status.UPCOMING") : t("status.PENDING");
  if (s.status === "LEAVE" && s.leave) return s.leave.label;
  return t(`status.${s.status}`);
}
const TONE: Record<string, string> = {
  ON_TIME: "border-[color:var(--color-ink)] text-[color:var(--color-ink)] font-semibold",
  LATE: "border-[color:var(--color-danger)] text-[color:var(--color-danger)] font-semibold",
  EARLY_OUT: "border-[color:var(--color-danger)] text-[color:var(--color-danger)]",
  ABSENT: "border-[color:var(--color-danger)] text-[color:var(--color-danger)] font-semibold",
  PENDING: "border-[color:var(--color-line)] text-[color:var(--color-muted)]",
  LEAVE: "border-[color:var(--color-line)] text-[color:var(--color-muted)]",
  DAY_OFF: "border-[color:var(--color-line)] text-[color:var(--color-muted)]",
  NO_SCHEDULE: "border-[color:var(--color-line)] text-[color:var(--color-muted)]",
};
function StatusChip({ t, s, testid = true }: { t: T; s: AttendanceSlotDto; testid?: boolean }) {
  const notIn = s.status === "PENDING" && s.phase === "NOT_IN";
  const tone = notIn ? TONE.ABSENT : (TONE[s.status] ?? TONE.PENDING);
  return (
    <span data-testid={testid ? `hr-att-status-${s.slotKey}` : undefined} className={`inline-flex items-center whitespace-nowrap rounded-lg border-[1.5px] px-2 py-0.5 text-[13px] ${tone}`}>
      {statusText(t, s)}
    </span>
  );
}
function StaleMark({ t, s }: { t: T; s: AttendanceSlotDto }) {
  if (!s.stale) return null;
  return (
    <span data-testid={`hr-att-stale-${s.slotKey}`} className="inline-flex items-center gap-1 text-xs text-[color:var(--color-danger)]">
      ⚠ {t("stale")}
    </span>
  );
}
function Recompute({ t, s, systemId, onRecompute }: { t: T; s: AttendanceSlotDto; systemId: string; onRecompute: FormFn | null }) {
  if (!onRecompute || !s.dayId) return null;
  return (
    <details className="relative">
      <summary data-testid={`hr-att-recompute-${s.dayId}`} className="btn btn-ghost min-h-[44px] cursor-pointer list-none text-sm">
        {t("recompute")}
      </summary>
      <form action={onRecompute} className="mt-2 flex w-64 max-w-[80vw] flex-col gap-2 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3 text-left">
        <input type="hidden" name="systemId" value={systemId} />
        <input type="hidden" name="dayId" value={s.dayId} />
        <label className="flex flex-col gap-1 text-xs">
          {t("reason")}
          <input name="reason" required minLength={3} maxLength={200} className="input min-h-[44px]" data-testid="hr-att-recompute-reason" />
        </label>
        <p className={`text-xs ${muted}`}>{t("recomputeHint")}</p>
        <button type="submit" className={btn} data-testid="hr-att-recompute-submit">
          {t("recomputeSubmit")}
        </button>
      </form>
    </details>
  );
}

/** แถบสลับมุมมอง (ทีมรายวัน · ปฏิทินรายคน) */
export async function AttendanceViewTabs({ base, view, employeeId }: { base: string; view: "day" | "month" | "corrections" /* HR H2.6 ◂ */; employeeId?: string | null }) {
  const t = await getTranslations("hr.attendance");
  const cls = (on: boolean) => `inline-flex min-h-[44px] items-center rounded-[10px] px-3.5 text-sm ${on ? "bg-[color:var(--color-surface)] font-semibold shadow-sm" : muted}`;
  return (
    <nav className="inline-flex items-center gap-1 rounded-[13px] border border-[color:var(--color-line)] bg-[color:var(--color-stage)] p-1" aria-label={t("title")}>
      <a href={`${base}?view=day`} data-testid="hr-att-view-day" aria-current={view === "day" ? "page" : undefined} className={cls(view === "day")}>
        {t("view.day")}
      </a>
      <a href={`${base}?view=month${employeeId ? `&employee=${encodeURIComponent(employeeId)}` : ""}`} data-testid="hr-att-view-month" aria-current={view === "month" ? "page" : undefined} className={cls(view === "month")}>
        {t("view.month")}
      </a>
      {/* HR H2.6 ▸ แท็บคำขอแก้เวลา (การ์ด mockup 05) ◂ */}
      <a href={`${base}?view=corrections`} data-testid="hr-att-view-corr" aria-current={view === "corrections" ? "page" : undefined} className={cls(view === "corrections")}>
        {(await getTranslations("hr.correction"))("tab")}
      </a>
    </nav>
  );
}

/** ข้อความผลการกด (allowlist มาจากหน้า) */
export function AttendanceFlash({ text, ok }: { text: string; ok: boolean }) {
  if (!text) return null;
  return (
    <p role={ok ? "status" : "alert"} className={`rounded-xl border px-3 py-2 text-sm ${ok ? "border-[color:var(--color-line)]" : "border-[color:var(--color-danger)] text-[color:var(--color-danger)]"}`}>
      {text}
    </p>
  );
}

// ═══════════════════════════ 04A ทีมรายวัน ═══════════════════════════
export async function AttendanceDayView({
  board,
  base,
  systemId,
  onRecompute,
  clockForPanel,
  needs,
  corrSlot,
}: {
  board: AttendanceBoardDto;
  base: string;
  systemId: string;
  onRecompute: FormFn | null;
  clockForPanel: ReactNode;
  needs: { count: number; days: { day: string; employeeId: string; name: string }[] } | null;
  corrSlot?: ((employeeId: string) => ReactNode) | null; // HR H2.6 ▸ ปุ่ม "แก้เวลา" ต่อแถว (ฟอร์มยื่นแทน) ◂
}) {
  const t = await getTranslations("hr.attendance");
  const unitQ = board.unitSel !== "all" ? `&unit=${encodeURIComponent(board.unitSel)}` : "";
  const dayHref = (d: string) => `${base}?view=day&day=${d}${unitQ}`;
  const live = board.rows.flatMap((r) => r.slots.map((s) => ({ r, s }))).filter(({ s }) => !s.final && (s.phase === "NOT_IN" || (s.status === "ABSENT" && !s.inAt)));
  const alerted = new Set(board.alerts.map((a) => a.employeeId));
  const banner = live.filter(({ r }) => alerted.has(r.employeeId));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-[46px] items-center overflow-hidden rounded-[13px] border border-[color:var(--color-line)]">
          <a href={dayHref(board.prevDay)} data-testid="hr-att-day-prev" aria-label={t("prevDay")} className="grid h-full min-h-[44px] min-w-[44px] place-items-center px-3">
            ‹
          </a>
          <b className="flex h-full items-center whitespace-nowrap border-x border-[color:var(--color-line)] px-3.5 text-[15px]">
            {board.day === board.todayKey ? `${t("today")} ` : ""}
            {dayLabel(t, board.day)}
          </b>
          <a href={dayHref(board.nextDay)} data-testid="hr-att-day-next" aria-label={t("nextDay")} className="grid h-full min-h-[44px] min-w-[44px] place-items-center px-3">
            ›
          </a>
        </div>
        {board.day !== board.todayKey && (
          <a href={dayHref(board.todayKey)} className={ghost}>
            {t("today")}
          </a>
        )}
        {board.units.length > 1 && (
          <form method="get" action={base} className="flex items-center gap-2">
            <input type="hidden" name="view" value="day" />
            <input type="hidden" name="day" value={board.day} />
            <select name="unit" defaultValue={board.unitSel} className="input min-h-[44px]" aria-label={t("unit")}>
              <option value="all">{t("allUnits")}</option>
              {board.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button type="submit" className={ghost}>
              {t("show")}
            </button>
          </form>
        )}
        {board.canClockFor && clockForPanel && (
          <details className="relative ml-auto">
            <summary data-testid="hr-att-clock-for" className="btn btn-ghost min-h-[44px] cursor-pointer list-none text-sm">
              + {t("clockFor")}
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-80 max-w-[85vw] rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3">{clockForPanel}</div>
          </details>
        )}
      </div>

      {needs && needs.count > 0 && (
        <div data-testid="hr-att-needs-recompute" role="status" className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-dashed border-[color:var(--color-danger)] px-4 py-3 text-sm">
          <b className="text-[color:var(--color-danger)]">⚠ {t("needsRecompute", { n: needs.count })}</b>
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {needs.days.slice(0, 8).map((d) => (
              <a key={`${d.employeeId}-${d.day}`} href={`${base}?view=day&day=${d.day}`} className="inline-flex min-h-[44px] items-center underline">
                {dayLabel(t, d.day)} · {d.name}
              </a>
            ))}
          </span>
        </div>
      )}

      {banner.length > 0 && (
        <div data-testid="hr-att-banner" role="alert" className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-[color:var(--color-danger)] px-4 py-3 text-sm">
          {banner.map(({ r, s }) => (
            <p key={`${r.employeeId}-${s.slotKey}`}>
              <b className="text-[color:var(--color-danger)]">⚠ {s.status === "ABSENT" ? t("bannerAbsent") : t("bannerNotIn")}</b> {t("bannerWho", { name: r.name, shift: s.shift?.name ?? "", start: s.shift ? hhmm(s.shift.startMin) : "" })}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start">
        <section className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
          {/* VIS-1 A1: ตาราง 9 คอลัมน์กว้างกว่าจอ iPad — เลื่อนในกรอบตัวเอง (คอลัมน์พนักงานติดซ้าย) + บอกให้เลื่อน */}
          <p data-testid="hr-att-scroll-hint" className={`hidden border-b border-[color:var(--color-line)] px-4 py-2 text-xs md:block xl:hidden ${muted}`}>
            {t("scrollHint")}
          </p>
          <div className="md:overflow-x-auto">
            <div className="md:min-w-[940px]">
              <div className={`hidden ${COLS} gap-2 border-b border-[color:var(--color-line)] px-4 py-3 text-xs font-semibold md:grid ${muted}`}>
                <span className="sticky left-0 z-[1] -ml-4 bg-[color:var(--color-surface)] pl-4">{t("cols.employee")}</span>
                <span>{t("cols.shift")}</span>
                <span>{t("cols.in")}</span>
                <span>{t("cols.out")}</span>
                <span>{t("cols.break")}</span>
                <span>{t("cols.status")}</span>
                <span>{t("cols.hours")}</span>
                <span>{t("cols.ot")}</span>
                <span className="text-right">{t("cols.actions")}</span>
              </div>
              {board.rows.length === 0 && <p className={`px-4 py-6 text-sm ${muted}`}>{t("empty")}</p>}
              {board.rows.map((r) =>
                r.slots.map((s, i) => {
                  const notIn = s.status === "PENDING" && s.phase === "NOT_IN";
                  const alert = notIn || (s.status === "ABSENT" && !s.final);
                  const rowBg = alert ? "bg-[color:var(--color-stage)]" : "bg-[color:var(--color-surface)]";
                  return (
                    <div
                      key={`${r.employeeId}-${s.slotKey}`}
                      data-testid={i === 0 ? `hr-att-row-${r.employeeId}` : undefined}
                      className={`grid grid-cols-2 items-start gap-x-3 gap-y-2 border-b border-[color:var(--color-line)] px-4 py-3 text-sm last:border-b-0 md:items-center md:gap-2 ${COLS} ${rowBg} ${alert ? "border-l-4 border-l-[color:var(--color-danger)]" : ""}`}
                    >
                      <div className={`col-span-2 flex min-w-0 items-center gap-2 md:sticky md:left-0 md:z-[1] md:col-span-1 md:-ml-4 md:pl-4 ${rowBg}`} data-testid={`hr-att-slot-${s.slotKey}`}>
                        <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-stage)] text-sm">
                          {r.initial}
                        </span>
                        <div className="min-w-0">
                          <b className="block truncate font-semibold">{r.name}</b>
                          <small className={`block truncate text-xs ${muted}`}>
                            {[r.position, r.borrowed ? t("borrowed") : null].filter(Boolean).join(" · ")}
                          </small>
                        </div>
                      </div>
                      <Cell t={t} k="shift" wide>
                        {s.shift ? (
                          <>
                            <span className="block">{s.shift.name}</span>
                            <span className={`block tabular-nums text-xs ${muted}`}>
                              {hhmm(s.shift.startMin)}–{hhmm(s.shift.endMin)}
                            </span>
                          </>
                        ) : (
                          <span className={muted}>—</span>
                        )}
                      </Cell>
                      <Cell t={t} k="in">
                        {s.inAt ? (
                          <>
                            <b className="tabular-nums">{hm(s.inAt)}</b>
                            {s.method && <small className={`block text-xs ${muted}`}>{t(`method.${s.method}`)}</small>}
                          </>
                        ) : notIn ? (
                          <b className="text-[color:var(--color-danger)]">{t("status.PENDING")}</b>
                        ) : (
                          <span className={muted}>—</span>
                        )}
                      </Cell>
                      <Cell t={t} k="out">
                        <span className="tabular-nums">{s.outAt ? hm(s.outAt) : s.missingOut ? <span className="text-[color:var(--color-danger)]">{t("status.missingOut")}</span> : <span className={muted}>—</span>}</span>
                      </Cell>
                      <Cell t={t} k="break">
                        <span className={`tabular-nums ${muted}`}>{s.breaks.length ? s.breaks.map((b) => `${hm(b.from)}–${hm(b.to)}`).join(", ") : "—"}</span>
                      </Cell>
                      <Cell t={t} k="status">
                        <span className="flex flex-wrap items-center gap-1">
                          <StatusChip t={t} s={s} />
                          <StaleMark t={t} s={s} />
                        </span>
                      </Cell>
                      <Cell t={t} k="hours">
                        <span className="tabular-nums">{s.workedMin > 0 ? dur(s.workedMin) : <span className={muted}>—</span>}</span>
                      </Cell>
                      <Cell t={t} k="ot">
                        <span className="tabular-nums">{s.otMin > 0 ? t("status.ot", { n: Math.round((s.otMin / 60) * 100) / 100 }) : <span className={muted}>—</span>}</span>
                      </Cell>
                      <span className="col-span-2 flex flex-wrap justify-end gap-1 md:col-span-1">
                        <Recompute t={t} s={s} systemId={systemId} onRecompute={onRecompute} />
                        {i === 0 && corrSlot ? corrSlot(r.employeeId) : null /* HR H2.6 ▸ แก้เวลา (อยู่ในกรอบเลื่อนของตาราง) ◂ */}
                      </span>
                    </div>
                  );
                }),
              )}
            </div>
          </div>
          <p className={`border-t border-[color:var(--color-line)] px-4 py-3 text-xs ${muted}`}>{t("footer", { hours: dur(board.totals.workedMin) })}</p>
        </section>
        <aside className="grid w-full gap-3 sm:grid-cols-2 2xl:flex 2xl:w-72 2xl:flex-col">
          <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4 text-sm">
            <b className="block">{board.day === board.todayKey ? t("countsTitle") : t("countsTitleDay", { day: dayLabel(t, board.day) })}</b>
            <ul className="mt-2 flex flex-col gap-1">
              {(["ON_TIME", "LATE", "EARLY_OUT", "ABSENT", "PENDING", "LEAVE", "DAY_OFF", "NO_SCHEDULE"] as const)
                .filter((k) => board.totals.counts[k])
                .map((k) => (
                  <li key={k} className="flex justify-between">
                    <span className={muted}>{t(`count.${k}`)}</span>
                    <b className="tabular-nums">{board.totals.counts[k]}</b>
                  </li>
                ))}
            </ul>
          </div>
          <a href={`${base.replace(/\/attendance$/, "/kiosk")}`} className="flex min-h-[44px] items-center self-start rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 text-sm">
            {t("kioskLink")}
          </a>
        </aside>
      </div>
    </div>
  );
}

/** คอลัมน์ตาราง 04A (จอกว้าง) — คอลัมน์พนักงานกว้างยืด ที่เหลือกว้างพอให้ป้าย "สาย 18 นาที"/ปุ่ม "คิดผลใหม่" ไม่ถูกตัด */
const COLS = "md:grid-cols-[minmax(150px,1.6fr)_104px_92px_64px_96px_minmax(112px,1fr)_60px_72px_120px]";

/** ช่องข้อมูลของแถว — จอแคบ (การ์ด) มีป้ายชื่อคอลัมน์กำกับทุกค่า · จอกว้างป้ายอยู่หัวตาราง (VIS-1 A2) */
function Cell({ t, k, wide, children }: { t: T; k: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col ${wide ? "col-span-2 md:col-span-1" : ""}`}>
      <span className={`text-xs md:hidden ${muted}`}>{t(`cols.${k}`)}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ═══════════════════════════ 04B ปฏิทินรายคน ═══════════════════════════
export async function AttendanceMonthView({
  month,
  base,
  systemId,
  people,
  onRecompute,
  self,
  corrPanel,
  corrFor = null,
  todayKey = null,
}: {
  month: AttendanceMonthDto;
  base: string;
  systemId: string;
  people: { id: string; name: string }[];
  onRecompute: FormFn | null;
  self: boolean;
  corrPanel?: ReactNode; // HR H2.6 ▸ "ขอแก้เวลา" (ของตัวเอง/ยื่นแทนคนที่เลือก) ◂
  corrFor?: ((day: string) => ReactNode) | null; // HR H2.6 ▸ จอแคบ: "ขอแก้เวลา" ของวันนั้นในแถวรายวัน (VIS-1 A3) ◂
  todayKey?: string | null;
}) {
  const t = await getTranslations("hr.attendance");
  const first = month.days[0]?.day ?? `${month.month}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const empQ = self ? "" : `&employee=${encodeURIComponent(month.employee.id)}`;
  const monthHref = (m: string) => `${base}?view=month&month=${m}${empQ}`;
  const s = month.summary;
  return (
    <div data-testid="hr-att-cal" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">{t("calTitle", { month: monthLabel(t, month.month), name: month.employee.name })}</h2>
        {!self && people.length > 0 && (
          <form method="get" action={base} className="flex items-center gap-2">
            <input type="hidden" name="view" value="month" />
            <input type="hidden" name="month" value={month.month} />
            <select name="employee" defaultValue={month.employee.id} className="input min-h-[44px]" aria-label={t("employee")}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="submit" className={ghost}>
              {t("show")}
            </button>
          </form>
        )}
        <div className="inline-flex h-[46px] items-center overflow-hidden rounded-[13px] border border-[color:var(--color-line)]">
          <a href={monthHref(addMonth(month.month, -1))} aria-label={t("prevMonth")} className="grid h-full min-h-[44px] min-w-[44px] place-items-center px-3">
            ‹
          </a>
          <b className="flex h-full items-center whitespace-nowrap border-x border-[color:var(--color-line)] px-3.5 text-[15px]">{monthLabel(t, month.month)}</b>
          <a href={monthHref(addMonth(month.month, 1))} aria-label={t("nextMonth")} className="grid h-full min-h-[44px] min-w-[44px] place-items-center px-3">
            ›
          </a>
        </div>
        {corrPanel ? <div className="ml-auto">{corrPanel}</div> : null /* HR H2.6 ◂ */}
      </div>
      <div className={`flex flex-wrap items-center gap-4 text-[13px] ${muted}`}>
        <span>● {t("status.ON_TIME")}</span>
        <span className="text-[color:var(--color-danger)]">{t("legend.late")}</span>
        <span>{t("legend.ot")}</span>
        <span>{t("status.LEAVE")}</span>
        <span>{t("status.DAY_OFF")}</span>
        <span className="text-[color:var(--color-danger)]">{t("status.missingOut")}</span>
      </div>
      <section className="overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
        <div className={`grid grid-cols-7 border-b border-[color:var(--color-line)] text-center text-xs font-semibold ${muted}`}>
          {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((k) => (
            <span key={k} className="py-2">
              {t(`dow.${k}`)}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} className="min-h-[72px] border-b border-r border-[color:var(--color-line)] bg-[color:var(--color-stage)]" />
          ))}
          {month.days.map((d) => {
            const missing = d.slots.some((x) => x.missingOut);
            return (
              <div key={d.day} data-testid={`hr-att-cal-day-${d.day}`} aria-current={d.day === todayKey ? "date" : undefined} className={`flex min-h-[72px] min-w-0 flex-col gap-0.5 border-b border-r border-[color:var(--color-line)] p-1 text-[11px] md:min-h-[88px] md:p-2 md:text-[13px] ${missing ? "outline outline-2 -outline-offset-2 outline-[color:var(--color-danger)]" : ""}`}>
                <span className={d.day === todayKey ? "font-semibold text-[color:var(--color-accent)]" : muted}>{Number(d.day.slice(8))}</span>
                {d.slots.map((x) => (
                  <div key={x.slotKey} className="flex min-w-0 flex-col" data-testid={`hr-att-slot-${x.slotKey}`}>
                    <b className={`break-words ${x.status === "LATE" || x.status === "ABSENT" || x.missingOut ? "text-[color:var(--color-danger)]" : x.status === "ON_TIME" || x.status === "EARLY_OUT" ? "" : `font-normal ${muted}`}`}>
                      {x.missingOut ? t("status.missingOut") : x.status === "LATE" ? `+${x.lateMin}` : x.otMin > 0 ? t("status.ot", { n: Math.round((x.otMin / 60) * 100) / 100 }) : x.status === "ON_TIME" ? `● ${t("status.ON_TIME")}` : statusText(t, x)}
                    </b>
                    {x.inAt && (
                      <span className={`hidden flex-wrap gap-x-1 tabular-nums md:flex ${muted}`}>
                        <span className="whitespace-nowrap">{hm(x.inAt)} –</span>
                        <span className="whitespace-nowrap">{x.outAt ? hm(x.outAt) : "?"}</span>
                      </span>
                    )}
                    <StaleMark t={t} s={x} />
                    {/* VIS-1 A3: ปุ่มในช่องเฉพาะจอกว้าง — จอแคบใช้แถวรายวันใต้ปฏิทิน */}
                    <div className="hidden xl:block">
                      <Recompute t={t} s={x} systemId={systemId} onRecompute={onRecompute} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <DayList t={t} days={month.days} systemId={systemId} onRecompute={onRecompute} corrFor={corrFor} />
        <div data-testid="hr-att-summary" className="flex flex-wrap gap-x-8 gap-y-3 border-t border-[color:var(--color-line)] px-4 py-4">
          <Stat label={t("sum.work")} value={t("sum.days", { n: s.workDays })} />
          <Stat label={t("sum.late")} value={t("sum.times", { n: s.lateCount, m: s.lateMin })} danger={s.lateCount > 0} />
          <Stat label={t("sum.absent")} value={t("sum.days", { n: s.absentDays })} danger={s.absentDays > 0} />
          <Stat label={t("sum.ot")} value={t("sum.hours", { n: Math.round((s.otMin / 60) * 100) / 100 })} />
          <Stat label={t("sum.leave")} value={t("sum.days", { n: s.leaveDays })} />
          <Stat label={t("sum.missingOut")} value={t("sum.count", { n: s.missingOut })} danger={s.missingOut > 0} />
          <Stat label={t("sum.worked")} value={dur(s.workedMin)} />
        </div>
      </section>
    </div>
  );
}
function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={`text-xs ${muted}`}>{label}</span>
      <b className={`text-lg tabular-nums ${danger ? "text-[color:var(--color-danger)]" : ""}`}>{value}</b>
    </div>
  );
}

/** VIS-1 A3: จอแคบ (< xl) — แถวรายวันใต้ปฏิทิน กดเปิดดูเวลาเข้า–ออก + คิดผลใหม่ของวันนั้น (ช่องปฏิทินแคบเกินจะใส่ปุ่ม) */
function DayList({ t, days, systemId, onRecompute, corrFor }: { t: T; days: AttendanceMonthDto["days"]; systemId: string; onRecompute: FormFn | null; corrFor?: ((day: string) => ReactNode) | null /* HR H2.6 ◂ */ }) {
  const rows = days.filter((d) => d.slots.some((x) => x.inAt || x.dayId));
  if (!rows.length) return null;
  return (
    <div data-testid="hr-att-daylist" className="border-t border-[color:var(--color-line)] xl:hidden">
      <b className={`block px-4 pt-3 text-xs font-semibold ${muted}`}>{t("dayListTitle")}</b>
      <ul className="flex flex-col">
        {rows.map((d) => (
          <li key={d.day} className="border-b border-[color:var(--color-line)] last:border-b-0">
            <details>
              <summary data-testid={`hr-att-dayrow-${d.day}`} className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="whitespace-nowrap">{dayLabel(t, d.day)}</span>
                <span className="flex flex-wrap justify-end gap-1">
                  {d.slots.map((x) => (
                    <StatusChip key={x.slotKey} t={t} s={x} testid={false} />
                  ))}
                </span>
              </summary>
              <div className="flex flex-col gap-2 px-4 pb-3 text-sm">
                {d.slots.map((x) => (
                  <div key={x.slotKey} className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <span className={muted}>{t("cols.shift")}</span>
                    <span>{x.shift ? `${x.shift.name} ${hhmm(x.shift.startMin)}–${hhmm(x.shift.endMin)}` : "—"}</span>
                    <span className={muted}>{t("cols.in")}</span>
                    <span className="tabular-nums">{hm(x.inAt)}</span>
                    <span className={muted}>{t("cols.out")}</span>
                    <span className="tabular-nums">{x.outAt ? hm(x.outAt) : x.missingOut ? t("status.missingOut") : "—"}</span>
                    <span className={muted}>{t("cols.hours")}</span>
                    <span className="tabular-nums">{x.workedMin > 0 ? dur(x.workedMin) : "—"}</span>
                    <span className={muted}>{t("cols.ot")}</span>
                    <span className="tabular-nums">{x.otMin > 0 ? t("status.ot", { n: Math.round((x.otMin / 60) * 100) / 100 }) : "—"}</span>
                    <span className="col-span-2 flex justify-end">
                      <Recompute t={t} s={x} systemId={systemId} onRecompute={onRecompute} />
                    </span>
                  </div>
                ))}
                {corrFor ? <div className="flex justify-end">{corrFor(d.day)}</div> : null /* HR H2.6 ▸ ขอแก้เวลาของวันนี้ ◂ */}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
