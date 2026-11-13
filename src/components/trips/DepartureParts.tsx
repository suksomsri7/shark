"use client";
// TRIPS T1.2 ▸ ชิ้นส่วนร่วมของจอปฏิทินรอบ (ภาพ 11): ลิงก์ของจอ · วันที่สั้น · ป้ายสถานะ/รูปทรงช่อง · ข้อความช่อง
//   🔴 แสดงผลเท่านั้น — สถานะ/ที่ว่าง/ปุ่ม มาจากตัวโหลด · วันที่จาก VM (คิดตามเขตเวลาร้านแล้ว) · ไม่อ่านนาฬิกาเครื่อง · ตัวอักษร ≥ 14 px
import { useLocale, useTranslations } from "next-intl";
import { parseReason } from "@/lib/modules/trips/departure-view-core";
import type { DepartureCellState, DepartureCellVM } from "@/lib/modules/trips";

export type CalView = "week" | "month" | "trips";
export type CalFilter = "all" | "tour" | "dive";
export type CalQuery = { view: CalView; start: string | null; month: string | null; filter: CalFilter; dep: string | null; decide?: boolean };

/** URL ของจอ (?view= &start= &month= &f= &dep= &decide=1) */
export function calHref(base: string, q: CalQuery, patch: Partial<CalQuery>): string {
  const n = { ...q, ...patch };
  const sp = new URLSearchParams();
  if (n.view !== "week") sp.set("view", n.view);
  if (n.view === "week" && n.start) sp.set("start", n.start);
  if (n.view === "month" && n.month) sp.set("month", n.month);
  if (n.filter !== "all") sp.set("f", n.filter);
  if (n.dep) sp.set("dep", n.dep);
  if (n.dep && n.decide) sp.set("decide", "1");
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

const ymdParts = (ymd: string): [number, number, number] => {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y, m, d];
};
/** วันในสัปดาห์จากวันที่ล้วน (UTC · ไม่ใช่เวลาเครื่อง) */
const weekdayIndex = (ymd: string): number => {
  const [y, m, d] = ymdParts(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** ตัวจัดวันที่ของจอนี้ (ชื่อวัน/เดือน/ปีจาก messages trips.dates.*) */
export function useDepDates() {
  const t = useTranslations("trips");
  const wd = (i: number) => t(`dates.wd${i}`);
  const mon = (m: number) => t(`dates.mon${m}`);
  const yo = Number(t("dates.yearOffset")) || 0;
  /** "ส. 14 พ.ย." */
  const short = (ymd: string) => {
    const [, m, d] = ymdParts(ymd);
    return `${wd(weekdayIndex(ymd))} ${d} ${mon(m)}`;
  };
  /** "14 พ.ย. 2569" */
  const full = (ymd: string) => {
    const [y, m, d] = ymdParts(ymd);
    return `${d} ${mon(m)} ${y + yo}`;
  };
  /** "พ." + "11" แยกกัน (หัวคอลัมน์) */
  const head = (ymd: string) => ({ wd: wd(weekdayIndex(ymd)), d: ymdParts(ymd)[2] });
  /** ช่วง "11–17 พ.ย. 2569" / "28 พ.ย. – 4 ธ.ค. 2569" / "28 ธ.ค. 2569 – 3 ม.ค. 2570" */
  const range = (from: string, to: string) => {
    const [y1, m1, d1] = ymdParts(from);
    const [y2, m2, d2] = ymdParts(to);
    if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${mon(m1)} ${y1 + yo}`;
    if (y1 === y2) return `${d1} ${mon(m1)} – ${d2} ${mon(m2)} ${y1 + yo}`;
    return `${d1} ${mon(m1)} ${y1 + yo} – ${d2} ${mon(m2)} ${y2 + yo}`;
  };
  /** "พ.ย. 2569" จาก "YYYY-MM" */
  const month = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return `${mon(m)} ${y + yo}`;
  };
  /** ชื่อวันจันทร์→อาทิตย์ (หัวตารางเดือน) */
  const mondayFirst = [1, 2, 3, 4, 5, 6, 0].map((i) => wd(i));
  return { short, full, head, range, month, mondayFirst, weekdayIndex };
}

/** รูปทรงของช่อง — แยกด้วยรูปทรง ไม่ใช่สีอย่างเดียว (ภาพ :2 :44) */
export function cellShape(state: DepartureCellState, selected: boolean): string {
  const base = "relative flex min-w-0 flex-col gap-1 rounded-lg px-2 py-1.5 text-left";
  const sel = selected ? " outline outline-2 outline-offset-1 outline-[color:var(--color-accent)]" : "";
  switch (state) {
    case "BELOW_MIN":
      return `${base} border-2 border-dashed border-[color:var(--color-danger)] bg-[color:var(--color-surface)]${sel}`;
    case "FULL":
      return `${base} border-[3px] border-[color:var(--color-ink)] bg-[color:var(--color-surface)]${sel}`;
    case "CANCELLED":
      return `${base} border border-[color:var(--color-line)] text-[color:var(--color-danger)]${sel}`;
    case "PAST":
    case "DEPARTED_TODAY":
      return `${base} border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]${sel}`;
    default:
      return `${base} border border-[color:var(--color-line)] bg-[color:var(--color-surface)]${sel}`;
  }
}

/** ลายขีดของรอบยกเลิก (ภาพ :20 · repeating-linear-gradient) */
export const CANCEL_STRIPES = { backgroundImage: "repeating-linear-gradient(135deg, var(--color-surface) 0px, var(--color-surface) 6px, var(--color-line) 6px, var(--color-line) 8px)" } as const;
export const cellStyle = (state: DepartureCellState) => (state === "CANCELLED" ? CANCEL_STRIPES : undefined);

/** บรรทัด 1 + 2 ของช่อง (ใบสั่ง §5) */
export function useCellText(titles?: Record<string, { th: string; en: string | null }>) {
  const t = useTranslations("trips");
  const reasonText = useReasonText(titles);
  const line1 = (c: Pick<DepartureCellVM, "state" | "used" | "capacity">) => (c.state === "CANCELLED" ? t("departures.cellShort.CANCELLED") : t("departures.cell.used", { used: c.used, cap: c.capacity }));
  const line2 = (c: Pick<DepartureCellVM, "state" | "seatsLeft" | "minPax" | "waitlist" | "cancelReason" | "used">) => {
    switch (c.state) {
      case "PAST":
        return t("departures.cellShort.PAST");
      case "DEPARTED_TODAY":
        return t("departures.cellShort.DEPARTED_TODAY");
      case "CANCELLED":
        return [reasonText(c.cancelReason) ?? t("departures.cellShort.CANCELLED"), c.used > 0 ? t("departures.cell.cancelledPax", { n: c.used }) : null].filter(Boolean).join(" · ");
      case "FULL":
        return [t("departures.cellShort.FULL"), c.waitlist > 0 ? t("departures.cell.waitlist", { n: c.waitlist }) : null].filter(Boolean).join(" · ");
      case "CLOSED":
        return t("departures.cellShort.CLOSED");
      case "BELOW_MIN":
        return t("departures.cell.belowMin", { n: c.minPax ?? 0 });
      case "GUARANTEED":
        return t("departures.cell.left", { n: c.seatsLeft });
      case "LOW":
        return t("departures.cell.leftLow", { n: c.seatsLeft });
      default:
        return t("departures.cellShort.OPEN");
    }
  };
  /** ข้อความเต็มของช่อง (tooltip · ชื่อสถานะเต็ม + บรรทัด 2) */
  const full = (c: Pick<DepartureCellVM, "state" | "used" | "capacity" | "seatsLeft" | "minPax" | "waitlist" | "cancelReason">) => [...new Set([t(`departures.state.${c.state}`), line1(c), line2(c)])].join(" · ");
  return { line1, line2, full };
}

/**
 * เหตุผลยกเลิก → ข้อความตามภาษาผู้ดู (ตัวถอดเดียวกับบริการ: parseReason ของ departure-view-core)
 * preset ⇒ ป้ายจาก messages · merge ⇒ ชื่อเป้าจาก productId (titles จากตัวโหลด · ไม่มี ⇒ ชื่อสำรองที่เก็บไว้) · ค่าอื่น ⇒ ตรงตัว
 */
export function useReasonText(titles?: Record<string, { th: string; en: string | null }>) {
  const t = useTranslations("trips");
  const T = useTitle();
  return (raw: string | null): string | null => {
    if (raw === null) return null;
    const x = parseReason(raw);
    const withNote = (reason: string, note: string | null) => (note ? t("departures.reason.withNote", { reason, note }) : reason);
    if (x.kind === "preset") return withNote(t(`departures.reason.${x.code}`), x.note);
    if (x.kind === "merge") {
      const n = titles?.[x.productId];
      const title = n ? T(n.th, n.en) : x.title;
      return withNote(title ? t("departures.reason.merge", { title, time: x.time }) : t("departures.reason.mergeNoTitle", { time: x.time }), x.note);
    }
    return x.text;
  };
}

/** ชื่อสินค้าตามภาษาผู้ดู (ไม่มีอังกฤษ ⇒ ชื่อไทยที่ร้านกรอก) */
export function useTitle() {
  const locale = useLocale();
  return (th: string, en: string | null | undefined) => (locale === "en" && en ? en : th);
}

/** แถบความคืบหน้า ใช้แล้ว/ความจุ (ไม่แสดงในรอบยกเลิก) */
export function UsedBar({ used, capacity, tall }: { used: number; capacity: number; tall?: boolean }) {
  const pct = capacity > 0 ? Math.max(0, Math.min(100, Math.round((used / capacity) * 100))) : 0;
  return (
    <span aria-hidden="true" className={`block w-full overflow-hidden rounded-full bg-[color:var(--color-line)] ${tall ? "h-2" : "h-1"}`}>
      <span className="block h-full rounded-full bg-[color:var(--color-ink)]" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** ปุ่มกลุ่ม (สลับมุมมอง/ตัวกรอง) */
export const SEG_ON = "inline-flex min-h-11 items-center rounded-lg bg-[color:var(--color-surface)] px-3 text-sm font-bold text-[color:var(--color-ink)] shadow-sm";
export const SEG_OFF = "inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]";
export const SEG_WRAP = "inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-xl bg-[color:var(--color-surface-2)] p-1";
export const BTN_DANGER = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)] disabled:cursor-not-allowed disabled:text-[color:var(--color-muted)]";
