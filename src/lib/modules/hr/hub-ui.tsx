// HR VIS-5b ▸ ส่วนของหน้าภาพรวมทีม (ภาพ 01) ฝั่ง server — หัวหน้า (ชื่อ · สาขา · วัน) · บอร์ด "กะวันนี้" · การ์ดเดือน · แถบใกล้ครบกำหนด · การ์ดจอลงเวลา ·
//   บอร์ดวาดจาก DTO ของ loadAttendanceBoard ที่ HrHub โหลดมาแล้ว (ไม่อ่านซ้ำ) · การ์ดเดือน = รายงานเวลา/OT ตัวเดิม (loadReport ตัดสินสิทธิ์+สาขาเอง) ·
//   แถบใกล้ครบกำหนด = lifecycleDue ตัวเดิม · ไม่มีตัวเลขเงินในไฟล์นี้ · ข้อความทั้งหมดผ่าน hr.hub / hr.attendance / hr.life ◂
import Link from "next/link";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatShortDate, formatThaiTime, thaiDateKey } from "@/lib/ui/date";
import type { AttendanceBoardDto, AttendanceSlotDto } from "./judge-rules";
import type { Ctx } from "./service";
import type { HrViewer } from "./privacy";
import { axisOf, barOf, boardFactsOf, boardRowsOf, daysBetween, dueStripOf, hasShift, kpisOf, notInSlot, pctOf } from "./hub-rules";
import { loadReport } from "./reports";
import { meetsPattern } from "./ai-rules";
import { lifecycleDue } from "./lifecycle";

type T = Awaited<ReturnType<typeof getTranslations>>;
const muted = "text-[color:var(--color-muted)]";
const ghost = "btn btn-ghost min-h-[44px] whitespace-nowrap text-sm";
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const METHODS = new Set(["KIOSK", "MOBILE", "MANAGER", "POS", "CORRECTION", "IMPORT"]);
const initialOf = (name: string) => Array.from(name.trim())[0] ?? "·";

/** "พฤ. 15 พ.ย. 69" · "Thu 15 Nov 2026" — วันของบอร์ด (YYYY-MM-DD ตามวันไทย) */
function dayText(ta: T, day: string, locale: string): string {
  const d = new Date(`${day}T00:00:00+07:00`);
  return `${ta(`dow.${DOW[new Date(`${day}T00:00:00Z`).getUTCDay()]!}`)} ${formatShortDate(d, locale)}`;
}
/** "พ.ย. 2569" · "Nov 2026" */
function monthText(ta: T, month: string, locale: string): string {
  const y = Number(month.slice(0, 4));
  return `${ta(`months.m${Number(month.slice(5))}`)} ${locale === "en" ? y : y + 543}`;
}
function hoursText(t: T, min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t("hoursMin", { h, m }) : t("hours", { h });
}
/** นาทีปัจจุบันตามเวลาไทย (0–1439) */
function bkkNowMin(now: Date): number {
  const [h, m] = formatThaiTime(now).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ═════════════ หัวหน้า: ชื่อ · สาขา · วัน · จัดกะ · + พนักงาน ═════════════
export async function HrHubHeader({ systemId, board, canRoster, canAdd }: { systemId: string; board: AttendanceBoardDto; canRoster: boolean; canAdd: boolean }) {
  const t = await getTranslations("hr.hub");
  const ta = await getTranslations("hr.attendance");
  const locale = await getLocale();
  const base = `/app/sys/${systemId}`;
  const unitQ = board.unitSel !== "all" ? `&unit=${encodeURIComponent(board.unitSel)}` : "";
  const dayHref = (d: string) => `${base}?day=${d}${unitQ}`;
  const unitName = board.unitSel !== "all" ? (board.units.find((u) => u.id === board.unitSel)?.name ?? ta("allUnits")) : board.units.length === 1 ? board.units[0]!.name : ta("allUnits");
  const isToday = board.day === board.todayKey;
  const item = "flex min-h-[44px] items-center rounded-lg px-3 text-sm hover:bg-[color:var(--color-surface-2)]";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="mr-1 min-w-0 text-xl font-bold md:text-2xl">
        {isToday ? t("title") : t("titleOn", { date: formatShortDate(new Date(`${board.day}T00:00:00+07:00`), locale) })}
        {` · ${unitName}`}
      </h2>
      {board.units.length > 1 && (
        <details data-testid="hr-hub-unit" className="relative">
          <summary aria-label={ta("unit")} className={`${ghost} cursor-pointer list-none`}>
            {unitName} <span aria-hidden="true">▾</span>
          </summary>
          <div className="absolute left-0 z-20 mt-2 flex w-60 max-w-[85vw] flex-col rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-1">
            <a href={`${base}?day=${board.day}`} aria-current={board.unitSel === "all" ? "true" : undefined} className={`${item} ${board.unitSel === "all" ? "font-semibold" : ""}`}>
              {ta("allUnits")}
            </a>
            {board.units.map((u) => (
              <a key={u.id} href={`${base}?day=${board.day}&unit=${encodeURIComponent(u.id)}`} aria-current={board.unitSel === u.id ? "true" : undefined} className={`${item} ${board.unitSel === u.id ? "font-semibold" : ""}`}>
                {u.name}
              </a>
            ))}
          </div>
        </details>
      )}
      <div className="inline-flex h-[46px] items-center overflow-hidden rounded-[13px] border border-[color:var(--color-line)]">
        <a href={dayHref(board.prevDay)} data-testid="hr-hub-day-prev" aria-label={ta("prevDay")} className="grid h-full min-h-[44px] min-w-[44px] place-items-center px-3">
          ‹
        </a>
        <b className="flex h-full items-center whitespace-nowrap border-x border-[color:var(--color-line)] px-3.5 text-[15px]">{dayText(ta, board.day, locale)}</b>
        <a href={dayHref(board.nextDay)} data-testid="hr-hub-day-next" aria-label={ta("nextDay")} className="grid h-full min-h-[44px] min-w-[44px] place-items-center px-3">
          ›
        </a>
      </div>
      {!isToday && (
        <a href={dayHref(board.todayKey)} className={ghost}>
          {ta("today")}
        </a>
      )}
      {(canRoster || canAdd) && (
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {canRoster && (
            <Link href={`${base}/hr/roster`} data-testid="hr-hub-roster-link" className={ghost}>
              {t("roster")}
            </Link>
          )}
          {canAdd && (
            <Link href={`${base}/hr/employees?add=1`} data-testid="hr-hub-add-employee" className="btn btn-primary min-h-[44px] whitespace-nowrap text-sm">
              {t("addEmployee")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════ บอร์ด "กะวันนี้" — คน × ชั่วโมง (≥ md) · รายการซ้อน (< md) ═════════════
type Tone = { bar: string; text: string; dot: string };
const TONE: Record<"danger" | "ink" | "leave" | "wait", Tone> = {
  danger: { bar: "border-[color:var(--color-danger)] bg-[color:var(--color-surface)] text-[color:var(--color-danger)]", text: "font-semibold text-[color:var(--color-danger)]", dot: "bg-[color:var(--color-danger)]" },
  ink: { bar: "border-[color:var(--color-ink)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)]", text: "text-[color:var(--color-ink)]", dot: "bg-[color:var(--color-ink)]" },
  leave: { bar: "border-dashed border-[color:var(--color-line)] bg-[color:var(--color-surface)] text-[color:var(--color-muted)]", text: muted, dot: "border border-[color:var(--color-muted)]" },
  wait: { bar: "border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]", text: muted, dot: "border border-[color:var(--color-muted)]" },
};
function slotState(t: T, ta: T, s: AttendanceSlotDto): { text: string; tone: Tone } {
  if (s.status === "LEAVE") return { text: s.leave?.label ?? ta("status.LEAVE"), tone: TONE.leave };
  if (notInSlot(s)) return { text: s.status === "ABSENT" ? ta("status.ABSENT") : ta("count.PENDING"), tone: TONE.danger };
  if (s.status === "LATE") return { text: ta("status.LATE", { n: s.lateMin }), tone: TONE.danger };
  if (s.status === "ABSENT") return { text: ta("status.ABSENT"), tone: TONE.danger };
  if (s.inAt && !s.outAt) return { text: t("arrived"), tone: TONE.ink };
  if (s.status === "EARLY_OUT") return { text: ta("status.EARLY_OUT", { n: s.earlyOutMin }), tone: TONE.danger };
  if (s.status === "PENDING") return { text: s.phase === "UPCOMING" ? ta("status.UPCOMING") : ta("status.PENDING"), tone: TONE.wait };
  return { text: ta(`status.${s.status}`), tone: TONE.ink };
}
function barText(t: T, s: AttendanceSlotDto, inLabel: string): string {
  const sh = s.shift!;
  const span = `${sh.name} ${hhmm(sh.startMin)}–${hhmm(sh.endMin)}`;
  if (s.status === "LEAVE") return `${span} · ${s.leave?.label ?? ""}`.replace(/ · $/, "");
  if (s.inAt) return `${span} · ${inLabel} ${formatThaiTime(s.inAt)}`;
  if (notInSlot(s)) return `${span} · ${t("board.notClocked")}`;
  return span;
}
const COLS = "md:grid md:grid-cols-[minmax(150px,200px)_minmax(0,1fr)_minmax(110px,150px)] md:items-center md:gap-3";

export async function HrTodayBoard({ board }: { board: AttendanceBoardDto }) {
  const t = await getTranslations("hr.hub");
  const ta = await getTranslations("hr.attendance");
  const inLabel = (await getTranslations("hr.correction"))("kindShort.IN");
  const { rows, off } = boardRowsOf(board);
  const axis = axisOf(board);
  const facts = boardFactsOf(board);
  const k = kpisOf(board);
  const isToday = board.day === board.todayKey;
  const now = new Date();
  let nowMin: number | null = isToday ? bkkNowMin(now) : null;
  if (axis && nowMin !== null && nowMin < axis.start && nowMin + 1440 <= axis.end) nowMin += 1440;
  const nowPct = axis && nowMin !== null && nowMin >= axis.start && nowMin <= axis.end ? pctOf(nowMin, axis) : null;
  const grid = axis ? axis.ticks.map((m) => pctOf(m, axis)) : [];
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className={`py-4 text-sm ${muted}`}>{t("noShift")}</p>
      ) : (
        <div className="flex flex-col">
          {axis && (
            <div className={`hidden border-b border-[color:var(--color-line)] pb-1.5 text-xs ${COLS} ${muted}`}>
              <span />
              <div className="relative h-5">
                {axis.ticks.map((m) => (
                  <span key={m} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pctOf(m, axis)}%` }}>
                    {hhmm(m)}
                  </span>
                ))}
                {nowPct !== null && nowMin !== null && (
                  <span className="absolute -translate-x-1/2 rounded bg-[color:var(--color-surface)] px-1 font-semibold tabular-nums text-[color:var(--color-accent)]" style={{ left: `${nowPct}%` }}>
                    {hhmm(nowMin)}
                  </span>
                )}
              </div>
              <span />
            </div>
          )}
          {rows.map((r) => {
            const shifts = r.slots.filter(hasShift);
            const main = shifts.find(notInSlot) ?? shifts.find((s) => s.status === "LATE") ?? shifts[0]!;
            const st = slotState(t, ta, main);
            return (
              <div key={r.employeeId} data-testid={`hr-hub-board-row-${r.employeeId}`} className={`flex items-center gap-3 border-b border-[color:var(--color-line)] py-2.5 last:border-b-0 ${COLS}`}>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-stage)] text-sm">
                    {r.initial}
                  </span>
                  <div className="min-w-0">
                    <b className="block truncate text-sm font-semibold">{r.name}</b>
                    <small className={`block truncate text-xs ${muted} md:hidden`}>{shifts.map((s) => barText(t, s, inLabel)).join(" · ")}</small>
                    {(r.position || r.borrowed) && <small className={`hidden truncate text-xs ${muted} md:block`}>{[r.position, r.borrowed ? ta("borrowed") : null].filter(Boolean).join(" · ")}</small>}
                  </div>
                </div>
                <div className="relative hidden h-10 md:block">
                  {grid.map((p) => (
                    <span key={p} aria-hidden="true" className="absolute inset-y-0 border-l border-[color:var(--color-line)]" style={{ left: `${p}%` }} />
                  ))}
                  {axis &&
                    shifts.map((s) => {
                      const b = barOf(s.shift!, axis);
                      const tone = slotState(t, ta, s).tone;
                      return (
                        <span key={s.slotKey} title={barText(t, s, inLabel)} className={`absolute top-1/2 flex h-8 -translate-y-1/2 items-center overflow-hidden whitespace-nowrap rounded-lg border-[1.5px] px-2 text-xs ${tone.bar}`} style={{ left: `${b.left}%`, width: `${b.width}%` }}>
                          {barText(t, s, inLabel)}
                        </span>
                      );
                    })}
                  {nowPct !== null && <span aria-hidden="true" className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-[color:var(--color-accent)]" style={{ left: `${nowPct}%` }} />}
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm ${st.tone.text}`}>
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${st.tone.dot}`} />
                  {st.text}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${muted}`}>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-5 rounded border-[1.5px] border-[color:var(--color-ink)]" />
          {t("board.legendShift")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-5 rounded border-[1.5px] border-[color:var(--color-danger)]" />
          {ta("count.PENDING")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-5 rounded border-[1.5px] border-dashed border-[color:var(--color-muted)]" />
          {ta("count.LEAVE")}
        </span>
        {nowPct !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-0.5 bg-[color:var(--color-accent)]" />
            {t("board.now")}
          </span>
        )}
      </div>
      {off.length > 0 && <p className="text-sm text-[color:var(--color-ink)]">{t("board.off", { names: off.join(" · ") })}</p> /* r2 (F4): บรรทัดของตัวเอง ขนาดปกติ */}
      {rows.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[color:var(--color-line)] pt-3 md:grid-cols-4">
          <Fact label={t("board.planned")} value={hoursText(t, facts.plannedMin)} sub={t("board.plannedSub", { n: facts.plannedPeople })} />
          <Fact label={isToday ? t("board.workedNow", { time: formatThaiTime(now) }) : t("board.worked")} value={hoursText(t, facts.workedMin)} sub={t("board.workedSub", { n: k.arrived })} />
          <Fact label={t("board.thin")} value={facts.thinnest ? `${hhmm(facts.thinnest.from)}–${hhmm(facts.thinnest.to)}` : "—"} sub={facts.thinnest ? t("board.thinSub", { n: facts.thinnest.n }) : ""} danger={!!facts.thinnest && facts.thinnest.n <= 1} />
          <Fact label={t("board.methods")} value={facts.methods.length ? facts.methods.map((m) => `${METHODS.has(m.method) ? ta(`method.${m.method}`) : m.method} ${m.n}`).join(" · ") : "—"} />
        </dl>
      )}
    </div>
  );
}
function Fact({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className={`text-xs ${muted}`}>{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${danger ? "text-[color:var(--color-danger)]" : ""}`}>{value}</dd>
      {sub && <dd className={`text-xs ${muted}`}>{sub}</dd>}
    </div>
  );
}

// ═════════════ การ์ดเดือน (สาย · ขาด · OT · ลา + ควรคุยรายคน) ═════════════
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
export async function HrMonthCard({ ctx, viewer, systemId, ot }: { ctx: Ctx; viewer: HrViewer; systemId: string; ot: boolean }) {
  const t = await getTranslations("hr.hub");
  const ta = await getTranslations("hr.attendance");
  const locale = await getLocale();
  const month = thaiDateKey(new Date()).slice(0, 7);
  const base = `/app/sys/${systemId}`;
  const [time, otRep] = await Promise.all([loadReport(ctx, viewer, { report: "time", period: month }, { locale }), ot ? loadReport(ctx, viewer, { report: "ot", period: month }, { locale }) : Promise.resolve(null)]);
  if (!time.ok)
    return (
      <p className={`text-sm ${muted}`}>
        {t("month.unavailable")}{" "}
        <Link href={`${base}/hr/reports`} className="inline-flex min-h-[44px] items-center underline">
          {t("month.openReports")}
        </Link>
      </p>
    );
  const tot = time.totals ?? {};
  const rows = time.rows.map((r) => ({ id: r.employeeId, name: String(r.values.name ?? ""), late: num(r.values.lateCount), lateMin: num(r.values.lateMin), absent: num(r.values.absentDays), leave: num(r.values.leaveDays) }));
  const lateRows = rows.filter((r) => r.late > 0).sort((a, b) => b.late - a.late);
  const lateSub = [...lateRows.slice(0, 2).map((r) => `${r.name} ${r.late}`), ...(lateRows.length > 2 ? [t("month.others", { n: lateRows.slice(2).reduce((a, r) => a + r.late, 0) })] : [])].join(" · ");
  const absentRows = rows.filter((r) => r.absent > 0).sort((a, b) => b.absent - a.absent);
  const absentSub = [...absentRows.slice(0, 2).map((r) => `${r.name} ${r.absent}`), ...(absentRows.length > 2 ? [t("month.others", { n: absentRows.slice(2).reduce((a, r) => a + r.absent, 0) })] : [])].join(" · ");
  const otTot = otRep && otRep.ok ? (otRep.totals ?? {}) : null;
  const talk = rows.filter((r) => meetsPattern({ lateCount: r.late, absentDays: r.absent }));
  return (
    <div className="flex flex-col gap-4">
      <p className={`text-xs ${muted}`}>
        {monthText(ta, month, locale)} · {t("month.note")}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Stat label={ta("count.LATE")} value={t.rich("unit.times", { n: String(num(tot.lateCount)), b: big })} sub={lateSub} danger={num(tot.lateCount) > 0} />
        <Stat label={ta("count.ABSENT")} value={t.rich("unit.days", { n: String(num(tot.absentDays)), b: big })} sub={absentSub} danger={num(tot.absentDays) > 0} />
        {otTot && <Stat label={t("month.ot")} value={t.rich("unit.hours", { n: String(Math.round(num(otTot.approvedMin) / 6) / 10), b: big })} sub={t("month.otSub", { a: num(otTot.approved), p: num(otTot.pending) })} />}
        <Stat label={ta("count.LEAVE")} value={t.rich("unit.days", { n: String(num(tot.leaveDays)), b: big })} />
      </div>
      <div className="flex flex-col border-t border-[color:var(--color-line)] pt-3">
        <h3 className={`text-xs ${muted}`}>{t("month.talk")}</h3>
        {talk.length === 0 ? (
          <p className={`py-2 text-sm ${muted}`}>{t("month.talkNone")}</p>
        ) : (
          talk.map((r) => (
            <div key={r.id} data-testid={`hr-hub-month-talk-${r.id}`} className="flex min-h-[44px] items-center gap-2 border-b border-[color:var(--color-line)] last:border-b-0">
              <span aria-hidden="true" className="grid h-7 w-7 flex-none place-items-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-stage)] text-xs">
                {initialOf(r.name)}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <b className="font-semibold">{r.name}</b>
                {` · ${t("month.talkLine", { n: r.late, min: r.lateMin })}${r.absent > 0 ? ` · ${t("month.talkAbsent", { n: r.absent })}` : ""}`}
              </span>
              <Link href={`${base}/hr/attendance?view=month&employee=${encodeURIComponent(r.id)}`} className="inline-flex min-h-[44px] shrink-0 items-center text-sm font-medium text-[color:var(--color-accent)]">
                {t("month.calendar")}
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
/** ตัวเลขใหญ่ในข้อความ "<b>{n}</b> หน่วย" (ลำดับคำตามภาษา) — ตัวเลขเป็นโหนดของตัวเอง */
const big = (chunks: ReactNode) => <span className="text-2xl font-semibold tabular-nums">{chunks}</span>;
function Stat({ label, value, sub, danger }: { label: string; value: ReactNode; sub?: string; danger?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={`text-xs ${muted}`}>{label}</span>
      <p className={`text-sm font-medium ${danger ? "text-[color:var(--color-danger)]" : ""}`}>{value}</p>
      {sub && <span className={`truncate text-xs ${muted}`}>{sub}</span>}
    </div>
  );
}

// ═════════════ แถบใกล้ครบกำหนด (3 รายการแรกตามวันที่ + "+N") ═════════════
const KIND_KEY: Record<string, string> = { PROBATION_END: "due.probation", CONTRACT_END: "due.contract", ONBOARDING_OPEN: "due.onboarding", OFFBOARDING_OPEN: "due.offboarding" };
export async function HrDueStrip({ ctx, viewer, systemId }: { ctx: Ctx; viewer: HrViewer; systemId: string }) {
  const due = await lifecycleDue(ctx, viewer);
  if (!due) return null;
  const t = await getTranslations("hr.hub");
  const tl = await getTranslations("hr.life");
  const ta = await getTranslations("hr.attendance");
  const today = thaiDateKey(new Date());
  const base = `/app/sys/${systemId}`;
  const { shown, more } = dueStripOf(due.items);
  if (!shown.length) return <p className={`text-sm ${muted}`}>{t("due.none")}</p>;
  const left = (date: string | null, kind: string, open: number) => {
    const parts: string[] = [];
    if (kind.endsWith("_OPEN")) parts.push(tl("due.items", { n: open }));
    if (date) {
      const n = daysBetween(today, date);
      parts.push(n === 0 ? tl("banner.today") : n > 0 ? tl("banner.left", { n }) : tl("banner.over", { n: -n }));
    }
    return parts.join(" · ");
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {shown.map((i) => (
          <Link
            key={`${i.employeeId}-${i.kind}`}
            href={`${base}/hr/employees/${encodeURIComponent(i.employeeId)}`}
            data-testid={`hr-hub-due-${i.employeeId}-${i.kind}`}
            className="flex min-h-[72px] min-w-0 items-center gap-3 rounded-2xl border border-[color:var(--color-line)] p-3 transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            <span className="flex w-14 shrink-0 flex-col items-center rounded-xl border border-[color:var(--color-line)] px-2 py-1.5">
              <b className="text-lg leading-tight tabular-nums">{i.date ? Number(i.date.slice(8, 10)) : "—"}</b>
              <small className={`text-xs ${muted}`}>{i.date ? ta(`months.m${Number(i.date.slice(5, 7))}`) : ""}</small>
            </span>
            <span className="min-w-0">
              <b className="block truncate text-sm font-semibold">{`${i.name} · ${tl(KIND_KEY[i.kind] ?? "due.title")}`}</b>
              <small className={`block truncate text-xs ${muted}`}>{left(i.date, i.kind, i.open)}</small>
            </span>
          </Link>
        ))}
      </div>
      {more > 0 && (
        <Link href={`${base}/hr/employees`} className={`${ghost} self-start`}>
          {`+${more} ${t("due.more")}`}
        </Link>
      )}
    </div>
  );
}

// ═════════════ บัญชีจอลงเวลาอย่างเดียว: การ์ดเดียว "เปิดจอลงเวลา" (ไม่มีแถบแท็บ · ไม่มีตัวนับ) ═════════════
export async function HrKioskCard({ systemId }: { systemId: string }) {
  const t = await getTranslations("hr.hub");
  return (
    <Link href={`/app/sys/${systemId}/hr/kiosk`} data-testid="hr-hub-kiosk-link" className="card flex min-h-[96px] flex-col justify-center gap-1 p-5 transition-colors hover:bg-[color:var(--color-surface-2)]">
      <span className="text-base font-semibold">{t("kiosk.title")}</span>
      <span className={`text-sm ${muted}`}>{t("kiosk.desc")}</span>
    </Link>
  );
}
// ◂ HR VIS-5b
