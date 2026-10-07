"use client";

// ReportsOverview.tsx — POS P1.17U ภาพรวมการขาย (ภาพ 08 · ค่าเริ่มของหน้ารายงาน)
// 🔴 ตัวเลขทุกตัวมาจากรายงานเดิมของ reports.ts (daily · margin · payments · staff) — จอแค่จัดรูป/หารเป็น % ไม่สร้างตัวเลขใหม่
// R5: สินค้าขายดีใช้แถวของ margin (คีย์/ลำดับ/ยอดเดียวกับ products) · กราฟ = 14 วันล่าสุดจบที่ `to` เสมอ
// R6: เรียก posReportOverviewAction "ครั้งเดียว" ต่อการโหลด (Next 16 ส่ง Server Action จาก client ทีละตัว — ห้ามพึ่ง Promise.all ฝั่งจอ)
//     · เปลี่ยนช่วง/สาขา = หน่วง 300 ms แล้วค่อยยิง · ผลของมุมมองเก่าทิ้งด้วยลำดับคำขอ · ลองใหม่ในการ์ด = only:[ส่วนของการ์ดนั้น]
// 🔴 บล็อกที่ยังไม่มีข้อมูล (รายชั่วโมง P2.12 · ช่องทาง P2.11 · สมาชิก P1.12 · ผู้ช่วย AI P3 · PDF P2) = ไม่แสดง (ไม่ทำตัวเลขปลอม)
// 🔴 แต่ละส่วนถูกปฏิเสธแยกกัน — การ์ดที่ถูกปฏิเสธแสดงข้อความในการ์ดเอง หน้าไม่ว่าง

import { useCallback, useEffect, useRef, useState } from "react";
import { formatBaht } from "@/lib/ui/money";
import { posReportOverviewAction } from "@/lib/modules/pos/report-actions";
import type { OverviewBranches, OverviewPart, OverviewSection, ReportOverview } from "@/lib/modules/pos/report-overview";
import type {
  DailyRow,
  DailyTotals,
  MarginRow,
  MarginTotals,
  PaymentRow,
  PaymentTotals,
  Report,
  ReportKind,
  StaffRow,
  StaffTotals,
} from "@/lib/modules/pos/reports";

type T = (key: string, values?: Record<string, string | number>) => string;
type Slot<R> = { s: "loading" } | { s: "ok"; v: R } | { s: "err"; code: string };
type DailyRep = Report<"daily", DailyRow, DailyTotals>;
type MarginRep = Report<"margin", MarginRow, MarginTotals>;
type PaymentsRep = Report<"payments", PaymentRow, PaymentTotals>;
type StaffRep = Report<"staff", StaffRow, StaffTotals>;

type Props = {
  systemId: string;
  /** สาขาที่ดูรายงานได้ (จากหน้า) — < 2 = ไม่มีการ์ดเปรียบเทียบสาขาตั้งแต่แรก (R7 #1: ไม่วูบ/ไม่โชว์ลองใหม่ให้ร้านสาขาเดียว) */
  unitCount: number;
  from: string;
  to: string;
  unitId: string;
  today: string;
  locale: string;
  t: T;
  tc: T;
  refusalText: (code: string) => string;
  onGenerated: (iso: string | null) => void;
  onSeeAll: (kind: ReportKind) => void;
};

// ═══════════ ตัวช่วยวันที่ (ใช้ร่วมกับ ReportsClient) ═══════════
const DAY_MS = 86_400_000;
export const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const spanDays = (from: string, to: string): number => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
/** ช่วงก่อนหน้า = ช่วงยาวเท่ากัน ต่อท้ายด้านหน้าของช่วงที่เลือกพอดี */
export function prevRangeOf(from: string, to: string): { from: string; to: string } {
  const n = spanDays(from, to);
  return { from: addDays(from, -n), to: addDays(from, -1) };
}
const fmtLocale = (locale: string) => (locale.startsWith("en") ? "en-GB" : "th-TH");
/** "อ. 29 ก.ย." (วันเดียว) หรือ "1 ต.ค. – 7 ต.ค." (หลายวัน) · ตีความเป็น UTC เที่ยงวัน (ไม่เลื่อนวัน) */
export function rangeLabel(from: string, to: string, locale: string): string {
  const d = (s: string, wd: boolean) =>
    new Intl.DateTimeFormat(fmtLocale(locale), { timeZone: "UTC", ...(wd ? { weekday: "short" } : {}), day: "numeric", month: "short" }).format(new Date(`${s}T12:00:00Z`));
  return from === to ? d(from, true) : `${d(from, false)} – ${d(to, false)}`;
}
/** เวลาไทย HH:mm */
export const bkkHm = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(fmtLocale(locale), { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

// ═══════════ ตัวช่วยตัวเลข (จัดรูปเท่านั้น) ═══════════
/** เงินบนการ์ด: บาทเต็มเมื่อลงตัว ไม่งั้น 2 ตำแหน่ง (ไม่ปัดเงินทิ้ง) */
const baht = (s: number) => formatBaht(s, { decimals: s % 100 !== 0 });
const count = (n: number) => n.toLocaleString("th-TH");
/** basis point → "61%" (≥ 10% ไม่มีทศนิยม · < 10% ทศนิยม 1 ตำแหน่ง) */
const pctBp = (bp: number) => `${bp < 0 ? "−" : ""}${(Math.abs(bp) / 100).toLocaleString("th-TH", { maximumFractionDigits: Math.abs(bp) < 1000 ? 1 : 0 })}%`;
/** ส่วนต่อทั้งหมดเป็น bp (ทั้งหมด ≤ 0 = null) */
const shareBp = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part * 10_000) / whole) : null);
const arrow = (d: number) => (d > 0 ? "▲" : d < 0 ? "▼" : "");
/** ตัวอักษรย่อของชื่อ — ข้ามสระหน้า (เ แ โ ใ ไ) แบบภาพ 08 (แพร → พ) */
const initialOf = (name: string) => Array.from(name.trim()).find((ch) => !/[เแโใไ\s]/.test(ch)) ?? "?";
/** P1.17U R4 §2.6 — ป้าย "ส่วนลดสูงผิดปกติ" = ส่วนลด > 15% ของยอดสุทธิ (ข้อสังเกตบนจอ · ไม่ใช่กฎของระบบ) */
const HIGH_DISCOUNT_BP = 1500;
/** ป้ายวิธีชำระที่มีคีย์ pos.shift.method.* (อื่น ๆ ใช้ป้ายจากเซิร์ฟเวอร์) — ชุดเดียวกับ ReportsClient */
const METHOD_KEYS = new Set(["CASH", "CARD", "PROMPTPAY", "TRANSFER", "DEPOSIT", "ROOM_CHARGE"]);
/** R5 — กราฟรายวันแสดง 14 วันล่าสุดจบที่วัน `to` เสมอ (ช่วงจริงมาจากเซิร์ฟเวอร์: overview.chartRange) */
const CHART_DAYS = 14;
/** R6 — หน่วงก่อนยิงเมื่อเปลี่ยนช่วง/สาขา (พิมพ์วันที่ทีละตัวไม่ยิงทุกครั้ง) */
const DEBOUNCE_MS = 300;
/** แกน Y ปัดขึ้นเป็นเลขกลม (บาท) — มาตราส่วนกราฟเท่านั้น ไม่ใช่ตัวเลขรายงาน */
function niceCeilSatang(maxSatang: number): number {
  const v = maxSatang / 100;
  if (v <= 0) return 0;
  const exp = 10 ** Math.floor(Math.log10(v));
  const m = [1, 2, 2.5, 5, 10].find((x) => x * exp >= v) ?? 10;
  return Math.round(m * exp * 100);
}

// ═══════════ ไอคอน (เส้นจากภาพ 08 · สีตามตัวอักษร) ═══════════
const ICON = {
  chart: ["M4 20V10M10 20V4M16 20v-7M22 20H2"],
  shop: ["M4 9V4h16v5", "M3 9h18l-1.4 11a1 1 0 0 1-1 .9H5.4a1 1 0 0 1-1-.9Z", "M9.5 13h5"],
  tag: ["M4 11V5a1 1 0 0 1 1-1h6l9 9-7 7-9-9Z", "M9.3 8a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 0 1 2.6 0Z"],
  wallet: ["M5.5 6h13A2.5 2.5 0 0 1 21 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-8A2.5 2.5 0 0 1 5.5 6Z", "M3 10h18"],
  users: ["M12.4 8a3.4 3.4 0 1 1-6.8 0 3.4 3.4 0 0 1 6.8 0Z", "M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 5.4a3.4 3.4 0 0 1 0 6.4M18 14.8c2.2.6 3.5 2.3 3.5 5.2"],
} as const;
export function Icon({ d, className = "h-[18px] w-[18px]" }: { d: readonly string[]; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}

// ═══════════ ชิ้นส่วนการ์ด ═══════════
const MUTED = "text-[color:var(--color-muted)]";
const CARD = "card min-w-0 rounded-2xl p-6";
const CARD_P0 = "card min-w-0 overflow-hidden rounded-2xl p-0";
/** แท่งเทาของกราฟ (ภาพ 08 --line2) — ผสมจาก token ไม่ใช้ hex */
const BAR_GREY = "bg-[color:color-mix(in_srgb,var(--color-ink)_17%,var(--color-surface))]";
const TH = `whitespace-nowrap border-b bg-[color:var(--color-surface-2)] px-4 py-3 text-xs font-semibold ${MUTED}`;
const TD = "border-b border-[color:var(--color-line)] px-4 py-4";
const NUM = "whitespace-nowrap text-right tabular-nums";

function CardHead({ icon, title, right }: { icon: readonly string[]; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      <Icon d={icon} />
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <span className="flex-1" />
      {right}
    </div>
  );
}

function Loading({ t }: { t: T }) {
  return <p className={`py-6 text-center text-sm ${MUTED}`}>{t("loading")}</p>;
}
/** การ์ดที่ถูกปฏิเสธ/ขัดข้อง — testid ต่อท้ายด้วยชื่อการ์ด (R6 F6: ไม่ซ้ำกันในหน้า) · ลองใหม่ = โหลดเฉพาะส่วนของการ์ดนี้ (R6 F2) */
function Refused({ id, text, t, onRetry }: { id: string; text: string; t: T; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]" data-testid={`pos-report-ov-error-${id}`}>
      <span>{text}</span>
      <button data-testid={`pos-report-ov-retry-${id}`} type="button" className="btn btn-ghost min-h-[44px] text-sm" onClick={onRetry}>
        {t("retry")}
      </button>
    </div>
  );
}
function Empty({ t }: { t: T }) {
  return <p className={`py-6 text-center text-sm ${MUTED}`}>{t("empty")}</p>;
}
/** ลิงก์ "ดูทั้งหมด" ในหัวการ์ด (ปุ่มจริงเขียน testid ตรงตัวที่จุดใช้ — ด่าน F15.3 อ่านค่าจากโค้ด) */
const SEE_ALL = "inline-flex min-h-[44px] items-center px-1 text-[13px] font-semibold text-[color:var(--color-accent)] hover:underline";

// ═══════════ การ์ด KPI ═══════════
function Kpi({ id, label, value, foot }: { id: string; label: string; value: React.ReactNode; foot: React.ReactNode }) {
  return (
    <div className={`${CARD} flex flex-col`} data-testid={`pos-report-ov-kpi-${id}`}>
      <span className={`text-sm ${MUTED}`}>{label}</span>
      {/* R6 F4: ห้าม truncate ซ่อนเงิน — ยาวเกินขึ้นบรรทัดใหม่ได้ */}
      <span className="mt-3 break-words text-2xl font-bold tracking-tight tabular-nums xl:text-[28px]">{value}</span>
      <span className={`mt-2.5 text-[13px] ${MUTED}`}>{foot}</span>
    </div>
  );
}
function Delta({ d, text }: { d: number; text: string }) {
  return <b className={d < 0 ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink)]"}>{`${arrow(d)} ${text}`.trim()}</b>;
}

// ═══════════ กราฟแท่งรายวัน (ภาพ 08: แกน Y · เส้นประ · แท่งเทา · วันสุดท้ายดำ · ตัวเลขบนแท่งสูงสุด/วันสุดท้าย) ═══════════
function DailyBars({ rows, t, locale, lastIsToday }: { rows: DailyRow[]; t: T; locale: string; lastIsToday: boolean }) {
  const n = rows.length;
  const max = Math.max(0, ...rows.map((r) => r.netSalesSatang));
  const top = niceCeilSatang(max);
  const maxIdx = rows.findIndex((r) => r.netSalesSatang === max);
  const few = n <= 14;
  const gap = few ? "gap-1.5 sm:gap-4" : "gap-px sm:gap-[2px]";
  const dm = (s: string, withMonth: boolean) =>
    new Intl.DateTimeFormat(fmtLocale(locale), { timeZone: "UTC", day: "numeric", ...(withMonth ? { month: "short" } : {}) }).format(new Date(`${s}T12:00:00Z`));
  // ป้ายแกน X: จอ ≥ sm และ ≤ 14 วัน = ทุกวัน (ใส่เดือนที่วันแรก/วันที่ 1) · จอแคบ (< sm) หรือ > 14 วัน = แรก · กลาง · สุดท้าย (R6 F5)
  const mid = Math.floor((n - 1) / 2);
  const key = (i: number) => i === 0 || i === mid || i === n - 1;
  const xLabel = (r: DailyRow, i: number) => {
    if (few) return <span className={key(i) ? undefined : "hidden sm:inline"}>{dm(r.businessDate, i === 0 || key(i) || r.businessDate.slice(8) === "01")}</span>;
    return key(i) ? dm(r.businessDate, true) : "";
  };
  const slot = "relative flex min-w-0 max-w-16 flex-1";
  // R6 V1/V2: ป้ายที่กว้างกว่าแท่ง — ตัวแรกชิดซ้าย · ตัวสุดท้ายชิดขวา · ที่เหลือกึ่งกลาง (ไม่ล้นขอบกล่องจนถูกตัด)
  const align = (i: number) => (n > 1 && i === 0 ? "justify-start" : n > 1 && i === n - 1 ? "justify-end" : "justify-center");
  const valuePos = (i: number) => (n > 1 && i === 0 ? "left-0" : n > 1 && i === n - 1 ? "right-0" : "left-1/2 -translate-x-1/2");
  return (
    <div className="flex min-w-0 gap-3 sm:gap-5" role="img" aria-label={t("overview.chartTitle")} data-testid="pos-report-ov-chart-plot">
      <div className={`mt-6 flex h-[170px] w-14 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums ${MUTED}`} aria-hidden="true">
        <span className="-translate-y-1/2">{formatBaht(top)}</span>
        <span className="-translate-y-1/2">{formatBaht(Math.round(top / 2))}</span>
        <span className="-translate-y-1/2">{formatBaht(0)}</span>
      </div>
      {/* > 14 แท่งบนจอแคบ: เลื่อนแนวนอนในกรอบกราฟเอง (หน้าไม่ล้น) · ≤ 14 แท่ง = ไม่มีกรอบเลื่อน (ป้ายไม่ถูกตัด · R6 V1) */}
      <div className={few ? "min-w-0 flex-1" : "min-w-0 flex-1 overflow-x-auto"}>
        <div className={few ? "relative pt-6" : "relative min-w-[var(--chart-w)] pt-6 sm:min-w-0"} style={few ? undefined : ({ "--chart-w": `${n * 12}px` } as React.CSSProperties)}>
          <div className="pointer-events-none absolute inset-x-0 top-6 flex h-[170px] flex-col justify-between" aria-hidden="true">
            <i className="block border-t border-dashed border-[color:var(--color-line)]" />
            <i className="block border-t border-dashed border-[color:var(--color-line)]" />
            <i className="block border-t border-[color:var(--color-line)]" />
          </div>
          <div className={`relative flex h-[170px] items-end justify-center ${gap}`}>
            {rows.map((r, i) => {
              const h = top > 0 ? Math.max(r.netSalesSatang > 0 ? 2 : 0, (r.netSalesSatang / top) * 100) : 0;
              const last = i === n - 1;
              const showValue = r.netSalesSatang > 0 && (i === maxIdx || last);
              return (
                <div key={r.businessDate} className={`${slot} ${align(i)} h-full items-end`} title={`${rangeLabel(r.businessDate, r.businessDate, locale)} · ${formatBaht(r.netSalesSatang, { decimals: true })}`}>
                  {showValue ? (
                    <span className={`absolute ${valuePos(i)} whitespace-nowrap text-[11px] font-bold tabular-nums`} style={{ bottom: `calc(${h}% + 4px)` }}>
                      {baht(r.netSalesSatang)}
                    </span>
                  ) : null}
                  <div className={`w-full rounded-t-[3px] ${last ? "bg-[color:var(--color-ink)]" : BAR_GREY}`} style={{ height: `${h}%` }} />
                </div>
              );
            })}
          </div>
          <div className={`mt-2 flex justify-center ${gap}`} aria-hidden="true">
            {rows.map((r, i) => (
              <span key={r.businessDate} className={`${slot} ${align(i)} whitespace-nowrap text-[11px] tabular-nums ${i === n - 1 ? "font-bold text-[color:var(--color-ink)]" : MUTED}`}>
                {xLabel(r, i)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">{lastIsToday ? t("overview.legendToday") : t("overview.legendLast")}</span>
    </div>
  );
}

// ═══════════ จอภาพรวม ═══════════
const ALL_SECTIONS: readonly OverviewSection[] = ["daily", "prev", "margin", "payments", "staff", "chart", "branches"];
/** ส่วนของภาพรวม → ช่อง (ส่วนที่กำลังโหลดใหม่ = loading) */
function slotOf<R>(ov: ReportOverview | null, sec: OverviewSection, busy: ReadonlySet<OverviewSection>, whole: string | null): Slot<R> {
  if (busy.has(sec)) return { s: "loading" };
  if (whole) return { s: "err", code: whole };
  const p = ov?.[sec] as OverviewPart<R> | undefined;
  if (!p) return { s: "loading" };
  return p.ok ? { s: "ok", v: p.data } : { s: "err", code: p.code };
}
const partSlot = <R,>(p: OverviewPart<R>): Slot<R> => (p.ok ? { s: "ok", v: p.data } : { s: "err", code: p.code });

export function ReportsOverview({ systemId, unitCount, from, to, unitId, today, locale, t, tc, refusalText, onGenerated, onSeeAll }: Props) {
  const [ov, setOv] = useState<ReportOverview | null>(null);
  const [whole, setWhole] = useState<string | null>(null); // คำปฏิเสธทั้งก้อน (ช่วงผิด/สิทธิ์ระดับร้าน/ขัดข้อง)
  const [busy, setBusy] = useState<ReadonlySet<OverviewSection>>(() => new Set(ALL_SECTIONS));
  const seq = useRef(0); // ลำดับการโหลดทั้งก้อน — ผลของมุมมองเก่าห้ามทับ
  const first = useRef(true);
  const viewKey = `${systemId}|${from}|${to}|${unitId}`;
  const viewRef = useRef(viewKey);
  viewRef.current = viewKey;

  const fetchOverview = useCallback(
    (only?: OverviewSection[]) => {
      // เห็นสาขาเดียว = ไม่ขอส่วนสาขาเลย (การ์ดไม่แสดงอยู่แล้ว)
      const secs = only ?? (unitCount < 2 ? ALL_SECTIONS.filter((x) => x !== "branches") : undefined);
      return posReportOverviewAction({ systemId, from, to, ...(unitId ? { unitId } : {}), ...(secs ? { only: secs } : {}) }).catch(
        () => ({ ok: false, code: "INTERNAL", message: "" }) as const,
      );
    },
    [systemId, unitCount, from, to, unitId],
  );

  // โหลดทั้งก้อน: ครั้งแรกทันที · เปลี่ยนช่วง/สาขา = หน่วง 300 ms (ยกเลิกถ้าเปลี่ยนอีกก่อนครบ)
  useEffect(() => {
    const my = ++seq.current;
    setBusy(new Set(ALL_SECTIONS));
    setWhole(null);
    onGenerated(null);
    const delay = first.current ? 0 : DEBOUNCE_MS;
    first.current = false;
    const timer = setTimeout(() => {
      void fetchOverview().then((r) => {
        if (my !== seq.current) return;
        if (r.ok) {
          setOv(r.overview);
          const d = r.overview.daily;
          onGenerated(d && d.ok ? d.data.generatedAt : null);
        } else {
          setOv(null);
          setWhole(r.code);
        }
        setBusy(new Set());
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [fetchOverview, onGenerated]);

  // ลองใหม่ในการ์ด = โหลดเฉพาะส่วนของการ์ดนั้น แล้วแทนที่เฉพาะส่วนนั้น (R6 F2)
  const retry = (secs: OverviewSection[]) => {
    const key = viewRef.current;
    const wholeLoad = seq.current;
    setBusy((b) => new Set([...b, ...secs]));
    if (whole) {
      // ทั้งก้อนเคยถูกปฏิเสธ = ไม่มีผลเดิมให้แทนที่ → โหลดทั้งก้อนใหม่
      void fetchOverview().then((r) => {
        if (key !== viewRef.current || wholeLoad !== seq.current) return;
        if (r.ok) {
          setWhole(null);
          setOv(r.overview);
          const d = r.overview.daily;
          onGenerated(d && d.ok ? d.data.generatedAt : null);
        } else setWhole(r.code);
        setBusy(new Set());
      });
      return;
    }
    void fetchOverview(secs).then((r) => {
      if (key !== viewRef.current || wholeLoad !== seq.current) return;
      if (r.ok) {
        setOv((prev) => {
          const next = { ...(prev ?? r.overview) } as ReportOverview;
          for (const s of secs) (next as Record<string, unknown>)[s] = r.overview[s];
          return next;
        });
        if (secs.includes("daily")) {
          const d = r.overview.daily;
          onGenerated(d && d.ok ? d.data.generatedAt : null);
        }
      } else {
        setOv((prev) => {
          const next = { ...(prev ?? ({} as ReportOverview)) } as ReportOverview;
          for (const s of secs) (next as Record<string, unknown>)[s] = { ok: false, code: r.code };
          return next;
        });
      }
      setBusy((b) => {
        const n = new Set(b);
        for (const s of secs) n.delete(s);
        return n;
      });
    });
  };

  const daily = slotOf<DailyRep>(ov, "daily", busy, whole);
  const prev = slotOf<DailyRep>(ov, "prev", busy, whole);
  const margin = slotOf<MarginRep>(ov, "margin", busy, whole);
  const payments = slotOf<PaymentsRep>(ov, "payments", busy, whole);
  const staff = slotOf<StaffRep>(ov, "staff", busy, whole);
  const chart = slotOf<DailyRep>(ov, "chart", busy, whole);
  const branches = slotOf<OverviewBranches>(ov, "branches", busy, whole);
  const isTodayOnly = from === to && to === today;
  const vs = isTodayOnly ? t("overview.vsYesterday") : t("overview.vsPrev");

  // ── แถว KPI (daily · prev · margin) ──
  const kpiRow = (() => {
    if (daily.s === "loading") return <div className={CARD}><Loading t={t} /></div>;
    if (daily.s === "err") return <div className={CARD}><Refused id="kpis" text={refusalText(daily.code)} t={t} onRetry={() => retry(["daily", "prev", "margin"])} /></div>;
    const cur = daily.v.totals;
    const p = prev.s === "ok" ? prev.v.totals : null;
    const netBp = p ? shareBp(cur.netSalesSatang - p.netSalesSatang, p.netSalesSatang) : null;
    const billDiff = p ? cur.billCount - p.billCount : null;
    const m = margin.s === "ok" ? margin.v.totals : null;
    const costedBp = m ? shareBp(m.costedRevenueSatang, m.revenueSatang) : null;
    return (
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:gap-6" data-testid="pos-report-ov-kpis">
        <Kpi
          id="net"
          label={t("overview.kpi.net")}
          value={baht(cur.netSalesSatang)}
          foot={prev.s === "loading" ? "…" : netBp === null ? "—" : <><Delta d={netBp} text={pctBp(Math.abs(netBp))} /> {vs}</>}
        />
        <Kpi
          id="bills"
          label={t("overview.kpi.bills")}
          value={count(cur.billCount)}
          foot={prev.s === "loading" ? "…" : billDiff === null ? "—" : <><Delta d={billDiff} text={count(Math.abs(billDiff))} /> {t("overview.billsUnit")} {vs}</>}
        />
        <Kpi
          id="avg"
          label={t("overview.kpi.avg")}
          value={baht(cur.avgBillSatang)}
          foot={prev.s === "loading" ? "…" : p ? t(isTodayOnly ? "overview.yesterdayAvg" : "overview.prevAvg", { amount: baht(p.avgBillSatang) }) : "—"}
        />
        <Kpi
          id="margin"
          label={t("overview.kpi.margin")}
          value={margin.s === "loading" ? "…" : m && m.grossMarginBp !== null ? pctBp(m.grossMarginBp) : "—"}
          foot={
            margin.s === "loading" ? t("loading") : margin.s === "err" ? <span className="text-[color:var(--color-danger)]">{refusalText(margin.code)}</span> : m && m.grossMarginBp !== null && costedBp !== null ? t("overview.costed", { pct: pctBp(costedBp) }) : t("overview.noCost")
          }
        />
        <Kpi id="voids" label={t("overview.kpi.voids")} value={count(cur.voidCount)} foot={t("overview.voidTotal", { amount: baht(cur.voidTotalSatang) })} />
      </div>
    );
  })();

  // ── กราฟรายวัน 14 วันจบที่ `to` (ช่วงจากเซิร์ฟเวอร์ · วันไม่มียอด = แท่ง 0) ──
  const chartFrom = ov?.chartRange.from ?? addDays(to, -(CHART_DAYS - 1));
  const chartRows: DailyRow[] | null =
    chart.s === "ok"
      ? Array.from({ length: CHART_DAYS }, (_, i) => {
          const d = addDays(chartFrom, i);
          const hit = chart.v.rows.find((r) => r.businessDate === d);
          return hit ?? { businessDate: d, billCount: 0, grossSatang: 0, discountSatang: 0, serviceChargeSatang: 0, netSalesSatang: 0, vatSatang: 0, netExVatSatang: 0, tipSatang: 0, voidCount: 0, voidTotalSatang: 0, refundCount: 0, refundTotalSatang: 0, avgBillSatang: 0 };
        })
      : null;
  const chartCard = (
    <section className={`${CARD} xl:flex-[1.5]`} aria-busy={chart.s === "loading"} data-testid="pos-report-ov-chart">
      <CardHead
        icon={ICON.chart}
        title={t("overview.chartTitle")}
        right={
          <span className="flex items-center gap-3.5 text-xs text-[color:var(--color-ink-soft)]">
            <span className="inline-flex items-center gap-1.5"><i className={`inline-block h-[9px] w-[9px] rounded-[2px] ${BAR_GREY}`} />{t("overview.legendActual")}</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[9px] w-[9px] rounded-[2px] bg-[color:var(--color-ink)]" />{to === today ? t("overview.legendToday") : t("overview.legendLast")}</span>
          </span>
        }
      />
      {chart.s === "loading" ? (
        <Loading t={t} />
      ) : chart.s === "err" ? (
        <Refused id="chart" text={refusalText(chart.code)} t={t} onRetry={() => retry(["chart"])} />
      ) : !chartRows || chartRows.every((r) => r.netSalesSatang === 0) ? (
        <Empty t={t} />
      ) : (
        <DailyBars rows={chartRows} t={t} locale={locale} lastIsToday={to === today} />
      )}
      <p className={`mt-3 text-[13px] ${MUTED}`} data-testid="pos-report-ov-chart-range">
        {t("overview.chartRange", { days: CHART_DAYS, date: rangeLabel(to, to, locale) })}
      </p>
    </section>
  );

  // ── เปรียบเทียบสาขา (เซิร์ฟเวอร์คืนแถวเมื่อเห็น ≥ 2 สาขา) ──
  // R6 V3: ตารางต้องพอดีการ์ด (คอลัมน์ "กำไร" เคยล้นที่ 1440) — ช่องแคบลง · ชื่อสาขาตัดบรรทัดได้ · ตัวเลขไม่ตัดบรรทัด
  const TH_C = `whitespace-nowrap border-b bg-[color:var(--color-surface-2)] px-3 py-3 text-xs font-semibold ${MUTED}`;
  const TD_C = "border-b border-[color:var(--color-line)] px-3 py-4";
  const branchCard = (() => {
    if (unitCount < 2) return null; // R7 #1: หน้ารู้อยู่แล้วว่าเห็นสาขาเดียว = ไม่มีการ์ด (ไม่รอผลเซิร์ฟเวอร์)
    if (branches.s === "ok" && branches.v.rows.length < 2) return null; // ด่านเซิร์ฟเวอร์ยังคงไว้: สาขาเดียว = ไม่แสดงการ์ด (ไม่มีกล่องว่าง)
    const b = branches.s === "ok" ? branches.v : null;
    const rowErr = !!b && (b.rows.some((r) => !r.daily.ok || !r.margin.ok) || !b.all || !b.all.daily.ok || !b.all.margin.ok);
    const allErr = b?.all ? (!b.all.daily.ok ? b.all.daily.code : !b.all.margin.ok ? b.all.margin.code : null) : null;
    const mPct = (s: Slot<MarginTotals>) => (s.s === "ok" && s.v.grossMarginBp !== null ? pctBp(s.v.grossMarginBp) : "—");
    const cells = (d: Slot<DailyTotals>) => (d.s === "ok" ? [baht(d.v.netSalesSatang), count(d.v.billCount), baht(d.v.avgBillSatang)] : ["—", "—", "—"]);
    const retryBranches = (
      <button data-testid="pos-report-ov-retry-branch-rows" type="button" className="btn btn-ghost min-h-[44px] text-sm" onClick={() => retry(["branches"])}>
        {t("retry")}
      </button>
    );
    return (
      <section className={`${CARD_P0} xl:flex-1`} aria-busy={branches.s === "loading"} data-testid="pos-report-ov-branches">
        <div className="px-6 pt-6">
          <CardHead icon={ICON.shop} title={t("overview.branches")} right={<span className={`text-[13px] ${MUTED}`}>{rangeLabel(from, to, locale)}</span>} />
        </div>
        {branches.s === "loading" ? (
          <div className="px-6 pb-6"><Loading t={t} /></div>
        ) : branches.s === "err" ? (
          <div className="px-6 pb-6"><Refused id="branches" text={refusalText(branches.code)} t={t} onRetry={() => retry(["branches"])} /></div>
        ) : (
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full min-w-[340px] border-collapse text-[13px] sm:text-sm">
              <thead>
                <tr>
                  <th scope="col" className={`${TH_C} text-left`}>{t("overview.cols.branch")}</th>
                  <th scope="col" className={`${TH_C} text-right`}>{t("overview.cols.sales")}</th>
                  <th scope="col" className={`${TH_C} text-right`}>{t("overview.cols.bills")}</th>
                  <th scope="col" className={`${TH_C} text-right`}>{t("overview.cols.avg")}</th>
                  <th scope="col" className={`${TH_C} text-right`}>{t("overview.cols.margin")}</th>
                </tr>
              </thead>
              <tbody>
                {b!.rows.map((r) => {
                  const sel = r.unitId === unitId;
                  const d = partSlot(r.daily);
                  const [net, bills, avgB] = cells(d);
                  const err = !r.daily.ok ? r.daily.code : !r.margin.ok ? r.margin.code : null;
                  return (
                    <tr key={r.unitId} className={sel ? "bg-[color:var(--color-surface-2)]" : undefined} data-testid="pos-report-ov-branch-row">
                      <td className={TD_C}>
                        {sel ? <b>{r.name}</b> : r.name}
                        {sel ? <span className={`ml-1 text-xs ${MUTED}`}>{t("overview.selected")}</span> : null}
                        {/* R6 F3: แถวที่ถูกปฏิเสธบอกเหตุในแถว (ไม่ใช่ title อย่างเดียว) */}
                        {err ? <span className="mt-1 block text-xs text-[color:var(--color-danger)]" data-testid="pos-report-ov-branch-error">{refusalText(err)}</span> : null}
                      </td>
                      <td className={`${TD_C} ${NUM}`}><b>{net}</b></td>
                      <td className={`${TD_C} ${NUM}`}>{bills}</td>
                      <td className={`${TD_C} ${NUM}`}>{avgB}</td>
                      <td className={`${TD_C} ${NUM}`}>{mPct(partSlot(r.margin))}</td>
                    </tr>
                  );
                })}
                <tr className="bg-[color:var(--color-surface-2)] font-bold" data-testid="pos-report-ov-branch-total">
                  <td className="px-3 py-4">
                    {t("overview.allBranches")}
                    {allErr ? <span className="mt-1 block text-xs font-normal text-[color:var(--color-danger)]" data-testid="pos-report-ov-branch-total-error">{refusalText(allErr)}</span> : null}
                  </td>
                  {(b!.all ? cells(partSlot(b!.all.daily)) : ["—", "—", "—"]).map((v, i) => (
                    <td key={i} className={`px-3 py-4 ${NUM}`}>{v}</td>
                  ))}
                  <td className={`px-3 py-4 ${NUM}`}>{b!.all ? mPct(partSlot(b!.all.margin)) : "—"}</td>
                </tr>
              </tbody>
            </table>
            {b!.totalUnits > b!.rows.length ? <p className={`px-6 pt-3 text-[13px] ${MUTED}`}>{t("overview.branchesCap", { shown: b!.rows.length, total: b!.totalUnits })}</p> : null}
            {rowErr ? <div className="px-6 pb-4 pt-3">{retryBranches}</div> : null}
          </div>
        )}
      </section>
    );
  })();

  // ── สินค้าขายดี 5 อันดับ (แถวของรายงานกำไร) ──
  const productsAll = (
    <button data-testid="pos-report-ov-products-all" type="button" className={SEE_ALL} onClick={() => onSeeAll("products")}>
      {t("overview.seeAll")}
    </button>
  );
  const productsCard = (
    <section className={`${CARD_P0} xl:flex-[1.25]`} aria-busy={margin.s === "loading"} data-testid="pos-report-ov-products">
      <div className="px-6 pt-6">
        <CardHead icon={ICON.tag} title={t("overview.topProducts")} right={productsAll} />
      </div>
      {margin.s === "loading" ? (
        <div className="px-6 pb-6"><Loading t={t} /></div>
      ) : margin.s === "err" ? (
        <div className="px-6 pb-6"><Refused id="products" text={refusalText(margin.code)} t={t} onRetry={() => retry(["margin"])} /></div>
      ) : margin.v.rows.length === 0 ? (
        <div className="px-6 pb-6"><Empty t={t} /></div>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto">
          <table className="w-full min-w-[400px] border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className={`${TH} text-left`}>{t("overview.cols.product")}</th>
                <th scope="col" className={`${TH} text-right`}>{t("overview.cols.qty")}</th>
                <th scope="col" className={`${TH} text-right`}>{t("overview.cols.sales")}</th>
                <th scope="col" className={`${TH} text-right`}>{t("overview.cols.margin")}</th>
              </tr>
            </thead>
            <tbody>
              {margin.v.rows.slice(0, 5).map((r, i, all) => {
                const td = i === all.length - 1 ? "px-4 py-4" : TD;
                return (
                  <tr key={r.key} data-testid="pos-report-ov-product-row">
                    <td className={td}>{`${i + 1} · ${r.name}`}</td>
                    <td className={`${td} ${NUM}`}>{count(r.qty)}</td>
                    <td className={`${td} ${NUM}`}>{baht(r.revenueSatang)}</td>
                    <td className={`${td} ${NUM}`}>{r.marginBp !== null ? pctBp(r.marginBp) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  // ── วิธีชำระ ──
  const payCard = (
    <section className={`${CARD} xl:flex-1`} aria-busy={payments.s === "loading"} data-testid="pos-report-ov-payments">
      <CardHead icon={ICON.wallet} title={t("overview.payMethods")} right={<span className={`text-[13px] ${MUTED}`}>{t("overview.pctOfTotal")}</span>} />
      {payments.s === "loading" ? (
        <Loading t={t} />
      ) : payments.s === "err" ? (
        <Refused id="payments" text={refusalText(payments.code)} t={t} onRetry={() => retry(["payments"])} />
      ) : payments.v.rows.length === 0 ? (
        <Empty t={t} />
      ) : (
        <div className="flex flex-col">
          {payments.v.rows.map((r) => {
            const bp = shareBp(r.amountSatang, payments.v.totals.totalPaidSatang) ?? 0;
            return (
              <div key={r.type} className="flex min-w-0 items-center gap-3 py-2 text-sm sm:gap-4" data-testid="pos-report-ov-pay-row">
                <span className="w-24 shrink-0 truncate text-[color:var(--color-ink-soft)]">{METHOD_KEYS.has(r.type) ? tc(`method.${r.type}`) : r.label}</span>
                <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
                  <i className="block h-full rounded-full bg-[color:var(--color-ink)]" style={{ width: `${Math.min(100, Math.max(bp > 0 ? 2 : 0, bp / 100))}%` }} />
                </span>
                <span className="w-12 shrink-0 text-right font-bold tabular-nums">{pctBp(bp)}</span>
                <span className={`w-20 shrink-0 text-right text-[13px] tabular-nums ${MUTED}`}>{baht(r.amountSatang)}</span>
              </div>
            );
          })}
          {payments.v.totals.tipSatang > 0 ? (
            <p className={`mt-2 text-[13px] ${MUTED}`} data-testid="pos-report-ov-pay-tip">{t("overview.tip", { amount: baht(payments.v.totals.tipSatang) })}</p>
          ) : null}
        </div>
      )}
    </section>
  );

  // ── พนักงาน ──
  const staffAll = (
    <button data-testid="pos-report-ov-staff-all" type="button" className={SEE_ALL} onClick={() => onSeeAll("staff")}>
      {t("overview.seeAll")}
    </button>
  );
  const staffCard = (
    <section className={CARD_P0} aria-busy={staff.s === "loading"} data-testid="pos-report-ov-staff">
      <div className="px-6 pt-6">
        <CardHead icon={ICON.users} title={t("overview.staff")} right={staffAll} />
      </div>
      {staff.s === "loading" ? (
        <div className="px-6 pb-6"><Loading t={t} /></div>
      ) : staff.s === "err" ? (
        <div className="px-6 pb-6"><Refused id="staff" text={refusalText(staff.code)} t={t} onRetry={() => retry(["staff"])} /></div>
      ) : staff.v.rows.length === 0 ? (
        <div className="px-6 pb-6"><Empty t={t} /></div>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className={`${TH} text-left`}>{t("overview.cols.name")}</th>
                <th scope="col" className={`${TH} text-right`}>{t("overview.cols.bills")}</th>
                <th scope="col" className={`${TH} text-right`}>{t("overview.cols.sales")}</th>
                <th scope="col" className={`${TH} text-right`}>{t("overview.cols.discount")}</th>
                <th scope="col" className={`${TH} text-right`}>{t("overview.cols.voids")}</th>
                <th scope="col" className={`${TH} text-left`}>{t("overview.cols.note")}</th>
              </tr>
            </thead>
            <tbody>
              {staff.v.rows.slice(0, 5).map((r, i, all) => {
                const name = r.userId === null ? t("unknownSeller") : (r.name ?? r.userId);
                const high = r.netSalesSatang > 0 && r.discountSatang * 10_000 > r.netSalesSatang * HIGH_DISCOUNT_BP;
                const none = r.billCount === 0;
                const td = i === all.length - 1 ? "px-4 py-4" : TD;
                return (
                  <tr key={r.userId ?? "∅"} data-testid="pos-report-ov-staff-row">
                    <td className={td}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border bg-[color:var(--color-surface-2)] text-[11px] font-bold text-[color:var(--color-ink-soft)]" aria-hidden="true">
                          {r.userId === null ? "?" : initialOf(name)}
                        </span>
                        <span className={r.userId === null ? `truncate ${MUTED}` : "truncate"}>{name}</span>
                      </span>
                    </td>
                    <td className={`${td} ${NUM}`}>{count(r.billCount)}</td>
                    <td className={`${td} ${NUM} ${none ? MUTED : ""}`}>{none ? "—" : baht(r.netSalesSatang)}</td>
                    <td className={`${td} ${NUM} ${none ? MUTED : high ? "font-bold text-[color:var(--color-danger)]" : ""}`}>{none ? "—" : baht(r.discountSatang)}</td>
                    <td className={`${td} ${NUM}`}>{count(r.voidCount)}</td>
                    <td className={td}>
                      {high ? (
                        <span className="inline-flex h-7 items-center whitespace-nowrap rounded-lg border border-[color:var(--color-danger)] px-2.5 text-[13px] font-bold text-[color:var(--color-danger)]" title={t("overview.highDiscountHint")} data-testid="pos-report-ov-high-discount">
                          {t("overview.highDiscount")}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 xl:gap-8" data-testid="pos-report-overview">
      <div className="flex min-w-0 flex-col gap-3">
        {kpiRow}
        <p className={`text-[13px] ${MUTED}`} data-testid="pos-report-ov-coming-soon">{t("overview.comingSoon")}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-stretch xl:gap-8">
        {chartCard}
        {branchCard}
      </div>
      <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-start xl:gap-8">
        {productsCard}
        {payCard}
      </div>
      {staffCard}
    </div>
  );
}
