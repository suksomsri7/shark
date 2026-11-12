"use client";
// HR H2.10 ▸ จอ "ของฉัน" (mockup 07a/07b · มือถือก่อน 390) — แสดงเฉพาะ DTO จาก hr/self.ts ที่หน้า server ส่งมา · ปุ่มเรียก self-actions.ts เท่านั้น
//   ไม่ import อะไรที่ถึงฐานข้อมูล (type จาก ./self = type ล้วน) · ข้อความทั้งหมดจาก messages hr.self · วันที่ไทย พ.ศ. ผ่าน @/lib/ui/date ·
//   ปุ่มหลักติดเหนือแถบแท็บล่าง (< lg) · เป้ากด ≥ 44 px · ทุกค่ามีป้าย · สีจากโทเคนเท่านั้น ◂
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatThaiDateFull } from "@/lib/ui/date";
import { formatBaht } from "@/lib/ui/money";
import {
  myLeavePreviewAction,
  mySwapTargetsAction,
  selfAcknowledgeNoteAction,
  selfCancelAdvanceAction,
  selfCancelCorrectionAction,
  selfCancelLeaveAction,
  selfCancelOtAction,
  selfCancelSwapAction,
  selfClockAction,
  selfRequestAdvanceAction,
  selfRequestCorrectionAction,
  selfRequestLeaveAction,
  selfRequestOtAction,
  selfRequestSwapAction,
  selfRespondSwapAction,
} from "./self-actions";
import type { MyDocuments, MyLeavePolicy, MyRequests, MySelf, MySwapTarget, MyToday, MyWeek } from "./self";
import type { LeaveBalanceItem } from "./leave";

type Res = { ok: boolean; reason?: string };
const ME = "/app/me/hr";
const MUTED = "text-[color:var(--color-muted)]";
const BOX = "rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]";
const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const wdOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const beDate = (ymd: string | null | undefined) => (ymd ? formatThaiDateFull(ymd.slice(0, 10)) : "—");
const bkkYmd = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkHm = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(11, 16);
const reasonOf = (r: unknown): string => (r && typeof r === "object" && typeof (r as Res).reason === "string" ? (r as Res).reason! : "");

/** แถว "ป้าย : ค่า" — ทุกค่ามีป้าย (บทเรียน VIS batch1: การ์ด 390 ที่ไม่มีป้ายอ่านไม่ออก) */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
      <span className={`text-xs ${MUTED}`}>{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${strong ? "border-[color:var(--color-ink)] font-semibold" : `border-[color:var(--color-line)] ${MUTED}`}`}
    >
      {children}
    </span>
  );
}
function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "font-semibold" : "text-[color:var(--color-danger)]"}`}>
      {msg.text}
    </p>
  );
}
function Title({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold">{children}</h2>
      {right}
    </div>
  );
}

// ═══════════════════════════ โครงหน้า + แถบแท็บ ═══════════════════════════
const ICON: Record<string, React.ReactNode> = {
  today: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  week: <path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" />,
  requests: <path d="M7 4h10v16H7zM10 9h4M10 13h4" />,
  pay: <path d="M3 7h18v10H3zM12 10v4M7 12h.01M17 12h.01" />,
  profile: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" />,
};
function TabIcon({ k }: { k: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICON[k]}
    </svg>
  );
}
/** แถบแท็บ 5 ช่อง — ล่างจอ (ต่ำกว่า lg) · แถบบน (lg ขึ้นไป) · เฉพาะบัญชีที่ผูกกับพนักงาน */
export function SelfShell({ linked, ended, children }: { linked: boolean; ended: boolean; children: React.ReactNode }) {
  const t = useTranslations("hr.self");
  const path = usePathname();
  const on = (href: string) => (href === ME ? path === ME : path === href || path.startsWith(`${href}/`));
  const cls = (href: string) =>
    `flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-xs lg:flex-row lg:gap-2 lg:text-sm ${
      on(href) ? "font-semibold text-[color:var(--color-ink)]" : MUTED
    }`;
  return (
    <div data-testid="hr-self-page" className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-28 lg:pb-6">
      {linked && (
        <nav
          data-testid="hr-self-tabbar"
          aria-label={t("tabsLabel")}
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 lg:static lg:z-auto lg:rounded-xl lg:border lg:pb-1"
        >
          <Link href={ME} data-testid="hr-self-tab-today" className={cls(ME)} aria-current={on(ME) ? "page" : undefined}>
            <TabIcon k="today" />
            {t("tabToday")}
          </Link>
          <Link href={`${ME}/week`} data-testid="hr-self-tab-week" className={cls(`${ME}/week`)} aria-current={on(`${ME}/week`) ? "page" : undefined}>
            <TabIcon k="week" />
            {t("tabWeek")}
          </Link>
          <Link href={`${ME}/requests`} data-testid="hr-self-tab-requests" className={cls(`${ME}/requests`)} aria-current={on(`${ME}/requests`) ? "page" : undefined}>
            <TabIcon k="requests" />
            {t("tabRequests")}
          </Link>
          <Link href={`${ME}/pay`} data-testid="hr-self-tab-pay" className={cls(`${ME}/pay`)} aria-current={on(`${ME}/pay`) ? "page" : undefined}>
            <TabIcon k="pay" />
            {t("tabPay")}
          </Link>
          <Link href={`${ME}/profile`} data-testid="hr-self-tab-profile" className={cls(`${ME}/profile`)} aria-current={on(`${ME}/profile`) ? "page" : undefined}>
            <TabIcon k="profile" />
            {t("tabProfile")}
          </Link>
        </nav>
      )}
      {linked && ended && (
        <p data-testid="hr-self-ended" role="note" className={`${BOX} px-4 py-3 text-sm`}>
          {t("ended")}
        </p>
      )}
      {children}
    </div>
  );
}

/** บัญชีที่ยังไม่ผูก (หรือร้านที่ไม่มีระบบ HR) — หน้า 200 + ข้อความถัดไปที่ทำได้ */
export function SelfEmpty() {
  const t = useTranslations("hr.self");
  return (
    <div data-testid="hr-self-empty" className="card py-8 text-center">
      <p className="text-sm font-semibold">{t("emptyTitle")}</p>
      <p className={`mt-2 text-sm ${MUTED}`}>{t("empty")}</p>
    </div>
  );
}

// ═══════════════════════════ วันนี้ (07a) ═══════════════════════════
export function SelfToday({ self, today, week, balances, canWrite }: { self: MySelf; today: MyToday; week: MyWeek | null; balances: LeaveBalanceItem[]; canWrite: boolean }) {
  const t = useTranslations("hr.self");
  const wd = (d: string) => t(`wd.d${wdOf(d)}`);
  return (
    <>
      <div>
        <p className={`text-sm ${MUTED}`}>
          {wd(today.day)} {beDate(today.day)}
          {self.unitName ? ` · ${self.unitName}` : ""}
        </p>
        <h1 className="text-xl font-semibold">{t("hello", { name: self.name })}</h1>
      </div>
      <SelfShiftCard today={today} canWrite={canWrite} />
      <section data-testid="hr-self-colleagues" className={`${BOX} flex flex-col gap-2 p-4`}>
        <Title>{t("colleagues")}</Title>
        {today.colleagues.length === 0 ? (
          <p className={`text-sm ${MUTED}`}>{t("noColleagues")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {today.colleagues.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="min-w-0 font-medium">
                  {c.name}
                  {c.position ? <span className={`ml-1 text-xs ${MUTED}`}>· {c.position}</span> : null}
                </span>
                <span className={`text-xs ${MUTED}`}>
                  {c.shiftName} {hm(c.startMin)}–{hm(c.endMin)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {week && <SelfWeekStrip week={week} />}
      <SelfActions canWrite={canWrite} />
      <SelfBalances items={balances} />
    </>
  );
}

function SelfShiftCard({ today, canWrite }: { today: MyToday; canWrite: boolean }) {
  const t = useTranslations("hr.self");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [gps, setGps] = useState<string | null>(null);
  const st = today.clock;
  const sh = today.shift;
  const mainLabel = st.ok ? (st.next === "OUT" ? t("clockOut") : st.next === "BREAK_END" ? t("breakEnd") : t("clockIn")) : t("clockIn");
  const radius = st.ok && st.site ? st.site.radiusM : null;
  const send = (kind: "NEXT" | "BREAK_START") => {
    setMsg(null);
    const go = (coords: { latitude?: number; longitude?: number; accuracy?: number }) =>
      start(async () => {
        const r = await selfClockAction({ kind, ...coords });
        if (r.ok) {
          const d = "distanceM" in r && typeof r.distanceM === "number" ? r.distanceM : null;
          if (d !== null && radius !== null) setGps(t("gpsResult", { d: Math.round(d), r: radius }));
          setMsg({ ok: true, text: t("clockDone", { time: "at" in r && r.at ? bkkHm(new Date(r.at).toISOString()) : "" }) });
          router.refresh();
        } else {
          const d = "distanceM" in r && typeof r.distanceM === "number" ? r.distanceM : null;
          if (d !== null && radius !== null) setGps(t("gpsOutside", { d: Math.round(d), r: radius }));
          setMsg({ ok: false, text: reasonOf(r) });
        }
      });
    if (!(st.ok && st.site?.gpsRequired)) return go({});
    if (typeof navigator === "undefined" || !navigator.geolocation) return setMsg({ ok: false, text: t("gpsDenied") });
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        go({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) });
      },
      () => {
        setBusy(false);
        setMsg({ ok: false, text: t("gpsDenied") });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };
  const waiting = busy || pending;
  return (
    <section data-testid="hr-self-shift" className={`${BOX} flex flex-col gap-3 p-4`}>
      <Title right={sh ? <Chip>{t("breakMin", { n: sh.breakMin })}</Chip> : null}>{sh ? `${t("shiftToday")} · ${sh.shiftName}` : t("shiftToday")}</Title>
      {sh ? (
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-semibold tabular-nums">
            {hm(sh.startMin)} – {hm(sh.endMin)}
            {sh.crossesMidnight ? <span className={`ml-1 text-xs font-normal ${MUTED}`}>{t("nextDay")}</span> : null}
          </p>
          {sh.unitName ? <Field label={t("unit")}>{sh.unitName}</Field> : null}
        </div>
      ) : (
        <p className={`text-sm ${MUTED}`}>{t("noShift")}</p>
      )}
      <div data-testid="hr-self-clock" className="flex flex-col gap-2">
        {st.ok ? (
          <Field label={t("clockState")}>{st.state === "OPEN" ? t("stateOpen") : st.state === "ON_BREAK" ? t("stateBreak") : t("stateClosed")}</Field>
        ) : (
          <p className={`text-sm ${MUTED}`}>{st.reason}</p>
        )}
        <p data-testid="hr-self-gps" className={`text-xs ${MUTED}`}>
          {gps ?? (st.ok && st.site ? (st.site.gpsRequired ? t("gpsNeed", { r: st.site.radiusM }) : t("gpsNo")) : t("gpsOff"))}
        </p>
        <Msg msg={msg} />
        {/* ปุ่มหลักติดเหนือแถบแท็บล่าง (ครึ่งล่างของจอ 390) */}
        <div className="sticky bottom-20 z-10 flex flex-col gap-2 bg-[color:var(--color-surface)] py-1 lg:static">
          <button
            type="button"
            data-testid="hr-self-clock-btn"
            disabled={!canWrite || !st.ok || waiting}
            onClick={() => send("NEXT")}
            className="btn btn-primary min-h-14 w-full text-lg disabled:opacity-50"
          >
            {waiting ? (busy ? t("locating") : t("saving")) : mainLabel}
          </button>
          {st.ok && st.canBreak && (
            <button type="button" data-testid="hr-self-break-btn" disabled={!canWrite || waiting} onClick={() => send("BREAK_START")} className="btn btn-ghost min-h-11 w-full disabled:opacity-50">
              {t("breakStart")}
            </button>
          )}
        </div>
        {st.ok && st.site?.gpsRequired ? <p className={`text-xs ${MUTED}`}>{t("gpsNotice")}</p> : null}
      </div>
    </section>
  );
}

/** แถบสัปดาห์ (7 ช่องเท่ากัน · ไม่เลื่อนแนวนอน) */
export function SelfWeekStrip({ week }: { week: MyWeek }) {
  const t = useTranslations("hr.self");
  return (
    <section data-testid="hr-self-week" className={`${BOX} flex flex-col gap-2 p-4`}>
      <Title
        right={
          <Link href={`${ME}/week`} className="inline-flex min-h-11 items-center text-sm underline">
            {t("weekAll")}
          </Link>
        }
      >
        {t("weekThis")}
      </Title>
      <div className="grid grid-cols-7 gap-1">
        {week.days.map((d) => {
          const e = d.entries[0];
          const off = !e;
          return (
            <div
              key={d.date}
              data-testid={`hr-self-day-${d.date}`}
              className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg border px-0.5 py-1.5 text-center text-xs ${off ? `bg-[color:var(--color-surface-2)] ${MUTED}` : "border-[color:var(--color-line)]"}`}
            >
              <span className={MUTED}>{t(`wd.d${wdOf(d.date)}`)}</span>
              <b className="text-sm tabular-nums">{Number(d.date.slice(8, 10))}</b>
              <span className="w-full truncate">{d.leave ? t("leaveShort") : d.holiday ? t("holidayShort") : e ? e.shiftName : t("dayOff")}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** ปุ่มทางลัด 6 อย่าง (07a) — ไปฟอร์มของหน้า "คำขอ" / หน้า "เงินเดือน" */
export function SelfActions({ canWrite }: { canWrite: boolean }) {
  const t = useTranslations("hr.self");
  const cell = "flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl border border-[color:var(--color-line)] px-1 text-center text-sm font-medium";
  const off = canWrite ? "" : " pointer-events-none opacity-50";
  return (
    <nav data-testid="hr-self-actions" aria-label={t("actions")} className="grid grid-cols-3 gap-2">
      <Link href={`${ME}/requests?form=leave`} data-testid="hr-self-act-leave" className={cell + off} aria-disabled={!canWrite}>
        {t("actLeave")}
      </Link>
      <Link href={`${ME}/requests?form=ot`} data-testid="hr-self-act-ot" className={cell + off} aria-disabled={!canWrite}>
        {t("actOt")}
      </Link>
      <Link href={`${ME}/requests?form=swap`} data-testid="hr-self-act-swap" className={cell + off} aria-disabled={!canWrite}>
        {t("actSwap")}
      </Link>
      <Link href={`${ME}/requests?form=correction`} data-testid="hr-self-act-correction" className={cell + off} aria-disabled={!canWrite}>
        {t("actCorrection")}
      </Link>
      <Link href={`${ME}/requests?form=advance`} data-testid="hr-self-act-advance" className={cell + off} aria-disabled={!canWrite}>
        {t("actAdvance")}
      </Link>
      <Link href={`${ME}/pay`} data-testid="hr-self-act-slip" className={cell}>
        {t("actSlip")}
      </Link>
    </nav>
  );
}

export function SelfBalances({ items }: { items: LeaveBalanceItem[] }) {
  const t = useTranslations("hr.self");
  return (
    <section data-testid="hr-self-balances" className={`${BOX} flex flex-col gap-2 p-4`}>
      <Title>{t("balances")}</Title>
      {items.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>{t("noBalances")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((b) => (
            <li key={b.policyId} data-testid={`hr-self-bal-${b.policyId}`} className="flex flex-col gap-0.5 rounded-lg border border-[color:var(--color-line)] px-3 py-2">
              <span className="text-sm font-medium">{b.name}</span>
              <Field label={t("balAvail")}>{b.unlimited ? t("balUnlimited") : t("daysN", { n: b.available ?? b.balance })}</Field>
              <Field label={t("balUsed")}>{t("daysN", { n: b.used })}</Field>
              {Number(b.pending) > 0 ? <Field label={t("balPending")}>{t("daysN", { n: b.pending })}</Field> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ═══════════════════════════ ตาราง (รายสัปดาห์) ═══════════════════════════
export function SelfWeek({ week, prev, next, current }: { week: MyWeek; prev: string; next: string; current: string }) {
  const t = useTranslations("hr.self");
  const end = week.days[6]?.date ?? week.weekStart;
  return (
    <section data-testid="hr-self-week" className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">{t("weekTitle")}</h1>
      <div className="grid grid-cols-3 items-center gap-2">
        <Link href={`${ME}/week?week=${prev}`} className="btn btn-ghost min-h-11 px-2 text-sm">
          {t("prevWeek")}
        </Link>
        <Link href={`${ME}/week?week=${current}`} className="btn btn-ghost min-h-11 px-2 text-sm">
          {t("thisWeek")}
        </Link>
        <Link href={`${ME}/week?week=${next}`} className="btn btn-ghost min-h-11 px-2 text-sm">
          {t("nextWeek")}
        </Link>
      </div>
      <p className={`text-sm ${MUTED}`}>{t("weekRange", { from: beDate(week.weekStart), to: beDate(end) })}</p>
      <ul className="flex flex-col gap-2">
        {week.days.map((d) => (
          <li key={d.date} data-testid={`hr-self-day-${d.date}`} className={`${BOX} flex flex-col gap-1 px-4 py-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {t(`wd.d${wdOf(d.date)}`)} {beDate(d.date)}
              </span>
              <span className="flex flex-wrap gap-1">
                {d.holiday ? <Chip>{t("holiday")}</Chip> : null}
                {d.leave ? <Chip strong>{t("leaveShort")}</Chip> : null}
              </span>
            </div>
            {d.entries.length === 0 ? <Field label={t("shift")}>{t("dayOff")}</Field> : null}
            {d.entries.map((e, i) => (
              <Field key={i} label={t("shift")}>
                {e.shiftName} {hm(e.startMin)}–{hm(e.endMin)}
                {e.crossesMidnight ? ` ${t("nextDay")}` : ""}
                {e.unitName ? ` · ${e.unitName}` : ""}
              </Field>
            ))}
            {d.leave ? (
              <Field label={t("leaveShort")}>
                {d.leave.label}
                {d.leave.half ? ` · ${d.leave.half === "AM" ? t("halfAM") : t("halfPM")}` : ""}
              </Field>
            ) : null}
            {d.holiday ? <Field label={t("holiday")}>{d.holiday}</Field> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ═══════════════════════════ คำขอ (07b) ═══════════════════════════
type FormKind = "leave" | "ot" | "swap" | "correction" | "advance";
export type SelfRequestsData = {
  requests: MyRequests;
  policies: MyLeavePolicy[];
  balances: LeaveBalanceItem[];
  shifts: { entryId: string; date: string; shiftName: string; startMin: number; endMin: number }[];
  punches: { id: string; kind: string; at: string }[];
  today: string;
};
export function SelfRequests({ data, form, canWrite }: { data: SelfRequestsData; form: FormKind | null; canWrite: boolean }) {
  const t = useTranslations("hr.self");
  const chip = (k: FormKind) =>
    `inline-flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm whitespace-nowrap ${form === k ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-semibold text-[color:var(--color-surface)]" : "border-[color:var(--color-line)]"}`;
  return (
    <>
      <h1 className="text-xl font-semibold">{t("reqTitle")}</h1>
      {canWrite && (
        <nav data-testid="hr-self-actions" aria-label={t("newRequest")} className="flex flex-wrap gap-2">
          <Link href={`${ME}/requests?form=leave`} data-testid="hr-self-act-leave" className={chip("leave")}>
            {t("actLeave")}
          </Link>
          <Link href={`${ME}/requests?form=ot`} data-testid="hr-self-act-ot" className={chip("ot")}>
            {t("actOt")}
          </Link>
          <Link href={`${ME}/requests?form=swap`} data-testid="hr-self-act-swap" className={chip("swap")}>
            {t("actSwap")}
          </Link>
          <Link href={`${ME}/requests?form=correction`} data-testid="hr-self-act-correction" className={chip("correction")}>
            {t("actCorrection")}
          </Link>
          <Link href={`${ME}/requests?form=advance`} data-testid="hr-self-act-advance" className={chip("advance")}>
            {t("actAdvance")}
          </Link>
        </nav>
      )}
      {canWrite && form === "leave" && <LeaveForm policies={data.policies} balances={data.balances} today={data.today} />}
      {canWrite && form === "ot" && <OtForm today={data.today} />}
      {canWrite && form === "swap" && <SwapForm shifts={data.shifts} />}
      {canWrite && form === "correction" && <CorrectionForm punches={data.punches} today={data.today} />}
      {canWrite && form === "advance" && <AdvanceForm />}
      <RequestList r={data.requests} canWrite={canWrite} />
      {/* H4.6 ▸ ช่อง "คำขอของฉัน" รวมทุกระบบ (ยังว่าง) */}
      <div data-testid="hr-self-myreq-slot" hidden />
    </>
  );
}

/** ช่องวันที่ — แสดงวันไทย พ.ศ. · แตะแล้วเปิดปฏิทินของเครื่อง (ค่า ISO อยู่ในช่อง date ที่ซ้อนอยู่) */
function DateField({ label, value, onChange, min }: { label: string; value: string; onChange: (v: string) => void; min?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={`text-xs ${MUTED}`}>{label}</span>
      <span className="relative flex min-h-11 items-center rounded-lg border border-[color:var(--color-line)] px-3 text-base">
        <span className="truncate">{value ? beDate(value) : "—"}</span>
        <input type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </span>
    </label>
  );
}
function useSubmit() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const t = useTranslations("hr.self");
  const run = (fn: () => Promise<Res>, onOk?: () => void) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg({ ok: true, text: t("sent") });
        onOk?.();
        router.refresh();
      } else setMsg({ ok: false, text: reasonOf(r) });
    });
  };
  return { pending, msg, run };
}
/** ปุ่มส่ง — ติดเหนือแถบแท็บล่างบนมือถือ */
function Submit({ pending, disabled, hint }: { pending: boolean; disabled?: boolean; hint?: string }) {
  const t = useTranslations("hr.self");
  return (
    <div className="sticky bottom-20 z-10 flex flex-col gap-1 bg-[color:var(--color-surface)] py-1 lg:static">
      <button type="submit" data-testid="hr-self-submit" disabled={pending || disabled} className="btn btn-primary min-h-12 w-full text-base disabled:opacity-50">
        {pending ? t("sending") : t("submit")}
      </button>
      {hint ? <p className={`text-center text-xs ${MUTED}`}>{hint}</p> : null}
    </div>
  );
}

function LeaveForm({ policies, balances, today }: { policies: MyLeavePolicy[]; balances: LeaveBalanceItem[]; today: string }) {
  const t = useTranslations("hr.self");
  const [policyId, setPolicyId] = useState(policies[0]?.id ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [half, setHalf] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [pv, setPv] = useState<{ ok: boolean; reason?: string; days?: string; shifts?: { date: string; shiftName: string }[]; availableAfter?: string | null } | null>(null);
  const { pending, msg, run } = useSubmit();
  const pol = policies.find((p) => p.id === policyId);
  const oneDay = !!from && from === (to || from);
  useEffect(() => {
    let live = true;
    const end = to || from;
    if (!policyId || !from || end < from) {
      setPv(null);
      return;
    }
    myLeavePreviewAction({ policyId, fromDate: from, toDate: end, halfDay: half || undefined, hours: hours ? Number(hours) : undefined }).then((r) => {
      if (live) setPv(r);
    });
    return () => {
      live = false;
    };
  }, [policyId, from, to, half, hours]);
  if (!policies.length) return <p className={`${BOX} p-4 text-sm ${MUTED}`}>{t("lfNoPolicy")}</p>;
  const bal = balances.find((b) => b.policyId === policyId);
  return (
    <form
      data-testid="hr-self-form-leave"
      className={`${BOX} flex flex-col gap-4 p-4`}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => selfRequestLeaveAction({ policyId, fromDate: from, toDate: to || from, halfDay: oneDay && half ? half : undefined, hours: oneDay && hours ? Number(hours) : undefined, reason }), () => {
          setFrom("");
          setTo("");
          setReason("");
        });
      }}
    >
      <Title>{t("lfTitle")}</Title>
      <fieldset className="flex flex-col gap-2">
        <legend className={`mb-1 text-xs ${MUTED}`}>{t("lfType")}</legend>
        <div className="flex flex-wrap gap-2">
          {policies.map((p) => {
            const b = balances.find((x) => x.policyId === p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === policyId}
                onClick={() => {
                  setPolicyId(p.id);
                  setHalf("");
                  setHours("");
                }}
                className={`inline-flex min-h-11 items-center gap-1 rounded-xl border px-3 text-sm ${p.id === policyId ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-semibold text-[color:var(--color-surface)]" : "border-[color:var(--color-line)]"}`}
              >
                {p.name}
                {b && !b.unlimited ? <small className="opacity-70">{b.available ?? b.balance}</small> : null}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <DateField label={t("lfFrom")} value={from} min={today} onChange={(v) => setFrom(v)} />
        <DateField label={t("lfTo")} value={to || from} min={from || today} onChange={(v) => setTo(v)} />
      </div>
      {oneDay && pol?.allowHalfDay && (
        <label className="flex flex-col gap-1">
          <span className={`text-xs ${MUTED}`}>{t("lfHalf")}</span>
          <select value={half} onChange={(e) => (setHalf(e.target.value), setHours(""))} className="input min-h-11">
            <option value="">{t("lfHalfNone")}</option>
            <option value="AM">{t("halfAM")}</option>
            <option value="PM">{t("halfPM")}</option>
          </select>
        </label>
      )}
      {oneDay && pol?.allowHours && !half && (
        <label className="flex flex-col gap-1">
          <span className={`text-xs ${MUTED}`}>{t("lfHours")}</span>
          <select value={hours} onChange={(e) => setHours(e.target.value)} className="input min-h-11">
            <option value="">{t("lfHoursNone")}</option>
            {[1, 2, 3, 4, 5, 6, 7].map((h) => (
              <option key={h} value={h}>
                {t("hoursN", { n: h })}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className={`text-xs ${MUTED}`}>{t("lfReason")}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} className="input" />
      </label>
      <div data-testid="hr-self-leave-impact" aria-live="polite" className="flex flex-col gap-1 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-3 text-sm">
        {!pv ? (
          <p className={MUTED}>{t("lfPickDates")}</p>
        ) : !pv.ok ? (
          <p className="text-[color:var(--color-danger)]">{pv.reason}</p>
        ) : (
          <>
            <Field label={t("fDays")}>{t("daysN", { n: pv.days ?? "0.0" })}</Field>
            <Field label={t("lfImpact")}>
              {pv.shifts && pv.shifts.length ? pv.shifts.map((s) => `${t(`wd.d${wdOf(s.date)}`)} ${beDate(s.date)} ${s.shiftName}`).join(" · ") : t("lfImpactNone")}
            </Field>
            {pv.shifts && pv.shifts.length ? <p className={`text-xs ${MUTED}`}>{t("lfImpactNote")}</p> : null}
            <Field label={t("lfAfter")}>{bal?.unlimited ? t("balUnlimited") : pv.availableAfter !== null && pv.availableAfter !== undefined ? t("daysN", { n: pv.availableAfter }) : "—"}</Field>
          </>
        )}
      </div>
      <Msg msg={msg} />
      <Submit pending={pending} disabled={!policyId || !from} hint={t("submitHint")} />
    </form>
  );
}

function OtForm({ today }: { today: string }) {
  const t = useTranslations("hr.self");
  const [date, setDate] = useState(today);
  const [startT, setStart] = useState("18:00");
  const [endT, setEnd] = useState("20:00");
  const [reason, setReason] = useState("");
  const { pending, msg, run } = useSubmit();
  return (
    <form
      data-testid="hr-self-form-ot"
      className={`${BOX} flex flex-col gap-4 p-4`}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => selfRequestOtAction({ date, start: startT, end: endT, reason }));
      }}
    >
      <Title>{t("otTitle")}</Title>
      <DateField label={t("fDate")} value={date} onChange={setDate} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={`text-xs ${MUTED}`}>{t("otStart")}</span>
          <input type="time" value={startT} onChange={(e) => setStart(e.target.value)} className="input min-h-11" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={`text-xs ${MUTED}`}>{t("otEnd")}</span>
          <input type="time" value={endT} onChange={(e) => setEnd(e.target.value)} className="input min-h-11" required />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={`text-xs ${MUTED}`}>{t("otReason")}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} className="input" />
      </label>
      <Msg msg={msg} />
      <Submit pending={pending} disabled={!date} hint={t("submitHint")} />
    </form>
  );
}

function SwapForm({ shifts }: { shifts: SelfRequestsData["shifts"] }) {
  const t = useTranslations("hr.self");
  const [fromId, setFromId] = useState("");
  const [targets, setTargets] = useState<MySwapTarget[] | null>(null);
  const [targetErr, setTargetErr] = useState("");
  const [peerId, setPeerId] = useState("");
  const [trade, setTrade] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, msg, run } = useSubmit();
  useEffect(() => {
    let live = true;
    setTargets(null);
    setPeerId("");
    setTrade(false);
    setTargetErr("");
    if (!fromId) return;
    mySwapTargetsAction(fromId).then((r) => {
      if (!live) return;
      if (r.ok) setTargets(r.items);
      else setTargetErr(reasonOf(r));
    });
    return () => {
      live = false;
    };
  }, [fromId]);
  const peer = targets?.find((x) => x.employeeId === peerId);
  if (!shifts.length) return <p data-testid="hr-self-form-swap" className={`${BOX} p-4 text-sm ${MUTED}`}>{t("swNoShift")}</p>;
  return (
    <form
      data-testid="hr-self-form-swap"
      className={`${BOX} flex flex-col gap-4 p-4`}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => selfRequestSwapAction({ fromEntryId: fromId, targetEmployeeId: peerId, toEntryId: trade && peer?.entryId ? peer.entryId : undefined, reason }));
      }}
    >
      <Title>{t("swTitle")}</Title>
      <label className="flex flex-col gap-1">
        <span className={`text-xs ${MUTED}`}>{t("swFrom")}</span>
        <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="input min-h-11" required>
          <option value="">{t("swPick")}</option>
          {shifts.map((s) => (
            <option key={s.entryId} value={s.entryId}>
              {t(`wd.d${wdOf(s.date)}`)} {beDate(s.date)} · {s.shiftName} {hm(s.startMin)}–{hm(s.endMin)}
            </option>
          ))}
        </select>
      </label>
      {targetErr ? <p className="text-sm text-[color:var(--color-danger)]">{targetErr}</p> : null}
      {targets && (
        <label className="flex flex-col gap-1">
          <span className={`text-xs ${MUTED}`}>{t("swPeer")}</span>
          {targets.length === 0 ? (
            <span className={`text-sm ${MUTED}`}>{t("swNoPeer")}</span>
          ) : (
            <select value={peerId} onChange={(e) => (setPeerId(e.target.value), setTrade(false))} className="input min-h-11" required>
              <option value="">{t("swPeerPick")}</option>
              {targets.map((p) => (
                <option key={p.employeeId} value={p.employeeId}>
                  {p.name}
                  {p.position ? ` · ${p.position}` : ""}
                  {p.shiftName ? ` · ${p.shiftName}` : ` · ${t("dayOff")}`}
                </option>
              ))}
            </select>
          )}
        </label>
      )}
      {peer && (peer.entryId ? (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={trade} onChange={(e) => setTrade(e.target.checked)} className="h-5 w-5" />
          {t("swTrade", { shift: peer.shiftName ?? "" })}
        </label>
      ) : (
        <p className={`text-sm ${MUTED}`}>{t("swGive")}</p>
      ))}
      <label className="flex flex-col gap-1">
        <span className={`text-xs ${MUTED}`}>{t("swReason")}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} className="input" />
      </label>
      <Msg msg={msg} />
      <Submit pending={pending} disabled={!fromId || !peerId} hint={t("swHint")} />
    </form>
  );
}

function CorrectionForm({ punches, today }: { punches: SelfRequestsData["punches"]; today: string }) {
  const t = useTranslations("hr.self");
  const [action, setAction] = useState<"ADD" | "CHANGE" | "VOID">("ADD");
  const [punchId, setPunchId] = useState("");
  const [kind, setKind] = useState("IN");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const { pending, msg, run } = useSubmit();
  const needPunch = action !== "ADD";
  return (
    <form
      data-testid="hr-self-form-correction"
      className={`${BOX} flex flex-col gap-4 p-4`}
      onSubmit={(e) => {
        e.preventDefault();
        const at = action === "VOID" ? undefined : `${date}T${time}:00+07:00`;
        run(() => selfRequestCorrectionAction({ action, attendanceId: needPunch ? punchId : undefined, kind: action === "ADD" ? kind : undefined, at, reason }));
      }}
    >
      <Title>{t("crTitle")}</Title>
      <label className="flex flex-col gap-1">
        <span className={`text-xs ${MUTED}`}>{t("crAction")}</span>
        <select value={action} onChange={(e) => setAction(e.target.value as "ADD")} className="input min-h-11">
          <option value="ADD">{t("crADD")}</option>
          <option value="CHANGE">{t("crCHANGE")}</option>
          <option value="VOID">{t("crVOID")}</option>
        </select>
      </label>
      {needPunch ? (
        <label className="flex flex-col gap-1">
          <span className={`text-xs ${MUTED}`}>{t("crPunch")}</span>
          {punches.length === 0 ? (
            <span className={`text-sm ${MUTED}`}>{t("crNoPunch")}</span>
          ) : (
            <select
              value={punchId}
              onChange={(e) => {
                setPunchId(e.target.value);
                const p = punches.find((x) => x.id === e.target.value);
                if (p) {
                  setDate(bkkYmd(p.at));
                  setTime(bkkHm(p.at));
                }
              }}
              className="input min-h-11"
              required
            >
              <option value="">{t("crPunchPick")}</option>
              {punches.map((p) => (
                <option key={p.id} value={p.id}>
                  {beDate(bkkYmd(p.at))} {bkkHm(p.at)} · {t(`k.${p.kind}`)}
                </option>
              ))}
            </select>
          )}
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className={`text-xs ${MUTED}`}>{t("crKind")}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input min-h-11">
            {["IN", "OUT", "BREAK_START", "BREAK_END"].map((k) => (
              <option key={k} value={k}>
                {t(`k.${k}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {action !== "VOID" && (
        <div className="grid grid-cols-2 gap-2">
          <DateField label={t("fDate")} value={date} onChange={setDate} />
          <label className="flex flex-col gap-1">
            <span className={`text-xs ${MUTED}`}>{t("fTime")}</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input min-h-11" required />
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className={`text-xs ${MUTED}`}>{t("crReason")}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} className="input" required />
      </label>
      <Msg msg={msg} />
      <Submit pending={pending} disabled={needPunch && !punchId} hint={t("submitHint")} />
    </form>
  );
}

function AdvanceForm() {
  const t = useTranslations("hr.self");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { pending, msg, run } = useSubmit();
  return (
    <form
      data-testid="hr-self-form-advance"
      className={`${BOX} flex flex-col gap-4 p-4`}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => selfRequestAdvanceAction({ amountBaht: Number(amount.replace(/,/g, "")), note }), () => (setAmount(""), setNote("")));
      }}
    >
      <Title>{t("adTitle")}</Title>
      <label className="flex flex-col gap-1">
        <span className={`text-xs ${MUTED}`}>{t("adAmount")}</span>
        <input inputMode="numeric" pattern="[0-9,]*" value={amount} onChange={(e) => setAmount(e.target.value)} className="input min-h-11 tabular-nums" required />
      </label>
      <label className="flex flex-col gap-1">
        <span className={`text-xs ${MUTED}`}>{t("adNote")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} className="input" />
      </label>
      <p className={`text-xs ${MUTED}`}>{t("adHint")}</p>
      <Msg msg={msg} />
      <Submit pending={pending} disabled={!amount} />
    </form>
  );
}

function RequestList({ r, canWrite }: { r: MyRequests; canWrite: boolean }) {
  const t = useTranslations("hr.self");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const act = (fn: () => Promise<Res>) =>
    start(async () => {
      setMsg(null);
      const x = await fn();
      if (x.ok) router.refresh();
      else setMsg({ ok: false, text: reasonOf(x) });
    });
  const st = (s: string) => t(`s.${s}`);
  const total = r.leaves.length + r.ot.length + r.swaps.length + r.corrections.length + r.advances.length;
  const row = "flex flex-col gap-1 rounded-xl border border-[color:var(--color-line)] px-4 py-3";
  const head = (label: string, status: string, text?: string) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-medium">{label}</span>
      <Chip strong={status === "APPROVED"}>{text ?? st(status)}</Chip>
    </div>
  );
  const cancelBtn = (kind: string, id: string, fn: () => Promise<Res>) =>
    canWrite ? (
      <button type="button" data-testid={`hr-self-req-cancel-${kind}-${id}`} disabled={pending} onClick={() => act(fn)} className="btn btn-ghost mt-1 min-h-11 self-start text-sm disabled:opacity-50">
        {t("cancel")}
      </button>
    ) : null;
  const items = r;
  return (
    <section data-testid="hr-self-req-list" className="flex flex-col gap-2">
      <Title>{t("reqList")}</Title>
      <Msg msg={msg} />
      {total === 0 && <p className={`${BOX} p-4 text-sm ${MUTED}`}>{t("noRequests")}</p>}
      {items.leaves.map((l) => (
        <article key={l.id} id={`req-leave-${l.id}`} data-testid={`hr-self-req-${"leave"}-${l.id}`} className={row}>
          {head(`${t("kindLeave")} · ${l.policyName}`, l.status, l.statusText)}
          <Field label={t("fDates")}>{l.fromDate === l.toDate ? beDate(l.fromDate) : `${beDate(l.fromDate)} – ${beDate(l.toDate)}`}</Field>
          <Field label={t("fDays")}>
            {l.days !== null ? t("daysN", { n: l.days }) : "—"}
            {l.halfDay ? ` · ${l.halfDay === "AM" ? t("halfAM") : t("halfPM")}` : ""}
            {l.hours !== null ? ` · ${t("hoursN", { n: l.hours })}` : ""}
          </Field>
          <Field label={t("fFiled")}>{beDate(bkkYmd(l.createdAt))}</Field>
          {l.canCancel && cancelBtn("leave", l.id, () => selfCancelLeaveAction(l.id))}
        </article>
      ))}
      {items.ot.map((o) => (
        <article key={o.id} id={`req-ot-${o.id}`} data-testid={`hr-self-req-${"ot"}-${o.id}`} className={row}>
          {head(t("kindOt"), o.status)}
          <Field label={t("fDate")}>{beDate(o.date)}</Field>
          <Field label={t("fTime")}>
            {o.start}–{o.end} · {t("minutesN", { n: o.minutes })}
          </Field>
          {o.amountSatang !== null ? <Field label={t("fAmount")}>{formatBaht(o.amountSatang)}</Field> : null}
          {o.canCancel && cancelBtn("ot", o.id, () => selfCancelOtAction(o.id))}
        </article>
      ))}
      {items.swaps.map((s) => (
        <article key={s.id} id={`req-swap-${s.id}`} data-testid={`hr-self-req-${"swap"}-${s.id}`} className={row}>
          {head(`${t("kindSwap")} · ${s.role === "REQUESTER" ? t("roleRequester") : t("roleTarget")}`, s.status)}
          <Field label={t("fFrom")}>{s.fromDate ? `${beDate(s.fromDate)} ${s.fromShiftName ?? ""}` : "—"}</Field>
          {s.toDate ? <Field label={t("fTo")}>{`${beDate(s.toDate)} ${s.toShiftName ?? ""}`}</Field> : null}
          <Field label={t("fPeer")}>{s.peerName || "—"}</Field>
          {canWrite && s.canRespond && (
            <div className="mt-1 flex flex-wrap gap-2">
              <button type="button" data-testid={`hr-self-req-accept-${s.id}`} disabled={pending} onClick={() => act(() => selfRespondSwapAction(s.id, true))} className="btn btn-primary min-h-11 text-sm disabled:opacity-50">
                {t("accept")}
              </button>
              <button type="button" data-testid={`hr-self-req-decline-${s.id}`} disabled={pending} onClick={() => act(() => selfRespondSwapAction(s.id, false))} className="btn btn-ghost min-h-11 text-sm disabled:opacity-50">
                {t("decline")}
              </button>
            </div>
          )}
          {s.canCancel && cancelBtn("swap", s.id, () => selfCancelSwapAction(s.id))}
        </article>
      ))}
      {items.corrections.map((c) => (
        <article key={c.id} id={`req-correction-${c.id}`} data-testid={`hr-self-req-${"correction"}-${c.id}`} className={row}>
          {head(`${t("kindCorrection")} · ${t(`cr${c.action}`)}`, c.status)}
          <Field label={t("crKind")}>{t(`k.${c.kind}`)}</Field>
          <Field label={t("fDate")}>{beDate(c.day)}</Field>
          {c.proposedAt ? <Field label={t("fProposed")}>{`${beDate(bkkYmd(c.proposedAt))} ${bkkHm(c.proposedAt)}`}</Field> : null}
          {c.canCancel && cancelBtn("correction", c.id, () => selfCancelCorrectionAction(c.id))}
        </article>
      ))}
      {items.advances.map((a) => (
        <article key={a.id} id={`req-advance-${a.id}`} data-testid={`hr-self-req-${"advance"}-${a.id}`} className={row}>
          {head(t("kindAdvance"), a.status)}
          <Field label={t("fAmount")}>{formatBaht(a.amountSatang)}</Field>
          <Field label={t("fPeriod")}>{periodLabel(a.periodKey, t)}</Field>
          <Field label={t("fFiled")}>{beDate(bkkYmd(a.createdAt))}</Field>
          {a.canCancel && cancelBtn("advance", a.id, () => selfCancelAdvanceAction(a.id))}
        </article>
      ))}
    </section>
  );
}
function periodLabel(p: string, t: (k: string) => string): string {
  const m = Number(p.slice(5, 7));
  const y = Number(p.slice(0, 4));
  return m >= 1 && m <= 12 ? `${t(`m.m${m}`)} ${y + 543}` : p;
}

// ═══════════════════════════ เงินเดือน ═══════════════════════════
export function SelfPay({ docs }: { docs: MyDocuments }) {
  const t = useTranslations("hr.self");
  return (
    <>
      <h1 className="text-xl font-semibold">{t("payTitle")}</h1>
      <section data-testid="hr-self-payslips" className="flex flex-col gap-2">
        <Title>{t("slips")}</Title>
        {docs.payslips.length === 0 ? (
          <p className={`${BOX} p-4 text-sm ${MUTED}`}>{t("noSlips")}</p>
        ) : (
          docs.payslips.map((s) => (
            <Link key={s.runId} href={s.href} data-testid={`hr-self-slip-${s.runId}`} className={`${BOX} flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-3`}>
              <span className="flex flex-col">
                <span className="font-medium">{periodLabel(s.periodKey, t)}</span>
                <span className={`text-xs ${MUTED}`}>{t(`r.${s.status}`)}</span>
              </span>
              <span className="flex flex-col items-end">
                <span className={`text-xs ${MUTED}`}>{t("slipNet")}</span>
                <span className="font-semibold tabular-nums">{formatBaht(s.netSatang)}</span>
              </span>
            </Link>
          ))
        )}
      </section>
      <Link href={`${ME}/requests?form=advance`} data-testid="hr-self-act-advance" className="btn btn-ghost min-h-11 text-sm">
        {t("actAdvance")}
      </Link>
      <section data-testid="hr-self-cert-slot" className={`${BOX} flex flex-col gap-1 p-4`}>
        <Title>{t("certTitle")}</Title>
        <p className={`text-sm ${MUTED}`}>{t("certSoon")}</p>
      </section>
    </>
  );
}

// ═══════════════════════════ ฉัน ═══════════════════════════
export function SelfProfile({ self, docs, balances, canWrite }: { self: MySelf; docs: MyDocuments; balances: LeaveBalanceItem[]; canWrite: boolean }) {
  const t = useTranslations("hr.self");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      <h1 className="text-xl font-semibold">{t("profileTitle")}</h1>
      <section className={`${BOX} flex flex-col gap-1.5 p-4`}>
        <Field label={t("fName")}>{self.name}</Field>
        <Field label={t("fPosition")}>{self.position ?? t("notSet")}</Field>
        <Field label={t("fUnit")}>{self.unitName ?? t("notSet")}</Field>
        <Field label={t("fEmpStatus")}>{self.active ? t("stActive") : t("stEnded")}</Field>
      </section>
      <SelfBalances items={balances} />
      <section data-testid="hr-self-notes" className="flex flex-col gap-2">
        <Title>{t("notes")}</Title>
        <Msg msg={msg} />
        {docs.notes.length === 0 ? (
          <p className={`${BOX} p-4 text-sm ${MUTED}`}>{t("noNotes")}</p>
        ) : (
          docs.notes.map((n) => (
            <article key={n.id} data-testid={`hr-self-note-${n.id}`} className={`${BOX} flex flex-col gap-1 px-4 py-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{n.title}</span>
                <Chip strong={n.kind !== "NOTE"}>{t(`nk.${n.kind}`)}</Chip>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
              {n.periodLabel ? <Field label={t("notePeriod")}>{n.periodLabel}</Field> : null}
              {n.score !== null ? <Field label={t("noteScore")}>{n.score}</Field> : null}
              <Field label={t("fFiled")}>{beDate(bkkYmd(new Date(n.createdAt).toISOString()))}</Field>
              {n.acknowledgedAt ? (
                <Field label={t("ack")}>{beDate(bkkYmd(new Date(n.acknowledgedAt).toISOString()))}</Field>
              ) : canWrite ? (
                <button
                  type="button"
                  data-testid={`hr-self-note-ack-${n.id}`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setMsg(null);
                      const r = await selfAcknowledgeNoteAction(n.id);
                      if (r.ok) router.refresh();
                      else setMsg({ ok: false, text: reasonOf(r) });
                    })
                  }
                  className="btn btn-primary mt-1 min-h-11 self-start text-sm disabled:opacity-50"
                >
                  {t("ackBtn")}
                </button>
              ) : null}
            </article>
          ))
        )}
      </section>
    </>
  );
}
