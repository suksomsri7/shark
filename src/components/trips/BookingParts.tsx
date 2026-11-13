"use client";
// TRIPS T1.3 ▸ ชิ้นส่วนร่วมของจอการจองฝั่งร้าน (ภาพ 18): ลิงก์ของจอ · ป้ายสถานะแยกรูปทรง · ข้อความจากรหัส · กล่องโต้ตอบ · ตัวเรียก action
//   🔴 แสดงผลเท่านั้น — ป้าย/ต้องทำ/ปุ่ม/ยอด มาจากตัวโหลด · เงินแสดงด้วย formatBaht จากสตางค์จำนวนเต็ม (คอมโพเนนต์ไม่คิดเงิน)
//   🔴 รหัสดิบ (สถานะ · ช่องทาง · วิธีจ่าย ฯลฯ) ไม่ขึ้นจอ — ผ่านข้อความ trips.bookings.* เสมอ · วันเวลามาจาก VM (คิดตามเขตเวลาร้านแล้ว)
import { useEffect, useRef, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { BookingRowVM } from "@/lib/modules/trips";
import { BTN, Dialog, Pill, useRunner } from "./ProductsScreenParts";
import { useDepDates, useReasonText, useTitle } from "./DepartureParts";
import { formatBaht } from "./trips-shared";

// ═══════════════ URL ของจอ ═══════════════
export type BkView = "list" | "docs";
export type BkQuery = {
  q: string | null;
  product: string | null;
  when: string;
  date: string | null;
  channel: string;
  chip: string;
  dep: string | null;
  b: string | null;
  view: BkView;
  day: string | null;
};
/** URL ของจอ (?q= &p= &when= &date= &ch= &chip= &dep= &b= &view= &day=) — ค่าปริยายไม่ใส่ */
export function bkHref(base: string, q: BkQuery, patch: Partial<BkQuery>): string {
  const n = { ...q, ...patch };
  const sp = new URLSearchParams();
  if (n.view === "docs") sp.set("view", "docs");
  if (n.q) sp.set("q", n.q);
  if (n.product) sp.set("p", n.product);
  if (n.date) sp.set("date", n.date);
  else if (n.when !== "upcoming") sp.set("when", n.when);
  if (n.channel !== "all") sp.set("ch", n.channel);
  if (n.chip !== "all") sp.set("chip", n.chip);
  if (n.dep) sp.set("dep", n.dep);
  if (n.day) sp.set("day", n.day);
  if (n.b) sp.set("b", n.b);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

// ═══════════════ รหัสที่มีข้อความ (รหัสนอกชุด ⇒ ข้อความสำรอง ไม่แสดงรหัสดิบ) ═══════════════
const STATUS_CODES = ["HOLD", "PENDING", "CONFIRMED", "PART_PAID", "PAID", "EXPIRED", "CANCELLED", "TRAVELLED", "NO_SHOW"];
const ATTENTION_CODES = ["REFUND_OPEN", "PENDING_APPROVAL", "DEPARTURE_CANCELLED", "OVERDUE"];
const TENDER_CODES = ["CASH", "PROMPTPAY", "TRANSFER", "CARD", "AGENCY"];
const DUE_KIND_CODES = ["DEPOSIT", "BALANCE", "INSTALMENT", "PASSENGER_SHARE"];
const DUE_STATUS_CODES = ["OPEN", "PARTLY_PAID", "PAID", "OVERDUE", "WAIVED", "CANCELLED"];
const EVENT_KIND_CODES = ["RECEIVED", "REFUNDED", "RETAINED"];
const POSTING_CODES = ["UNPOSTED", "POSTED", "FAILED_NEEDS_ACTION"];
const REFUND_STATUS_CODES = ["REQUESTED", "QUOTED", "APPROVED", "REJECTED", "WITHDRAWN", "EXECUTING", "DONE", "FAILED"];
const REASON_CODES = [
  "REFUND_IN_PROGRESS",
  "NOTHING_DUE",
  "PENDING_APPROVAL",
  "BOOKING_EXPIRED",
  "NOT_PAYABLE",
  "OVERPAYMENT",
  "INVALID_AMOUNT",
  "NO_PROMPTPAY_RECEIVER",
  "AGENCY_NOT_ENABLED",
  "CURRENCY_NOT_THB",
  "BOOKER_PURGED",
  "SLIP_REQUIRED",
  "TRANSITION_NOT_ALLOWED",
  "REFUND_REQUIRED",
];
const ERROR_CODES = ["INVALID_INPUT", "VALIDATION", "NOT_FOUND", "FORBIDDEN", "BUSY", "STATE_CONFLICT", "CURRENCY_NOT_ALLOWED", "HOLD_EXPIRED", "IDEMPOTENCY_CONFLICT"];
/** วิธีจ่ายที่รับที่หน้าร้าน (ลำดับปุ่มในกล่องรับเงิน · ภาพ 18) */
export const PAY_TENDERS = ["CASH", "PROMPTPAY", "TRANSFER", "CARD"] as const;
export type PayTender = (typeof PAY_TENDERS)[number];

/** ข้อความของรหัสต่าง ๆ บนจอการจอง (ตามภาษาผู้ดู) */
export function useBkText() {
  const t = useTranslations("trips");
  const D = useDepDates();
  const T = useTitle();
  const reasonText = useReasonText();
  const pick = (ns: string, codes: readonly string[], code: string, fallback: string) => (codes.includes(code) ? t(`bookings.${ns}.${code}`) : t(`bookings.${ns}.${fallback}`));
  const status = (code: string) => pick("status", STATUS_CODES, code, "unknown");
  const tender = (code: string) => pick("tender", TENDER_CODES, code, "other");
  const dueKind = (code: string) => pick("dueKind", DUE_KIND_CODES, code, "other");
  const dueStatus = (code: string) => pick("dueStatus", DUE_STATUS_CODES, code, "other");
  const eventKind = (code: string) => pick("eventKind", EVENT_KIND_CODES, code, "other");
  const docKind = (code: string) => pick("docKind", EVENT_KIND_CODES, code, "other");
  const posting = (code: string) => pick("posting", POSTING_CODES, code, "other");
  const refundStatus = (code: string) => pick("refundStatus", REFUND_STATUS_CODES, code, "other");
  /** ช่องทาง: เอเจนซี่ / ชื่อช่องทางของ T1.2 (+ เลขอ้างอิงเอเจนซี่) */
  const channel = (row: Pick<BookingRowVM, "channel" | "agentAccountId" | "agentRef">, channels: readonly string[]) => {
    const name = row.agentAccountId ? t("bookings.filter.agent") : channels.includes(row.channel) ? t(`departures.channel.${row.channel}`) : t("bookings.filter.direct");
    return row.agentRef ? `${name} · ${t("bookings.row.agentRef", { ref: row.agentRef })}` : name;
  };
  /** ข้อความป้ายของแถว (เรื่องต้องทำเรื่องแรก หรือชื่อสถานะ · ถือที่ ⇒ เวลาหมด) */
  const badge = (row: Pick<BookingRowVM, "badge" | "hold" | "status">, today: string) => {
    const b = row.badge;
    if (b.shape === "alert") return ATTENTION_CODES.includes(b.kind) ? t(`bookings.attention.${b.kind}`) : status(row.status);
    if (row.status === "HOLD" && row.hold) {
      if (row.hold.expired) return t("bookings.row.holdExpired");
      return row.hold.localDate === today ? t("bookings.row.holdUntil", { time: row.hold.time }) : t("bookings.row.holdUntilDate", { date: D.short(row.hold.localDate), time: row.hold.time });
    }
    return status(b.kind);
  };
  /** "2 ผู้ใหญ่ 1 เด็ก · เช่ากล้องกันน้ำ" */
  const paxLine = (row: Pick<BookingRowVM, "pax" | "extras">) => {
    const pax = row.pax.map((p) => t("bookings.row.paxItem", { qty: p.qty, label: T(p.labelTh, p.labelEn) })).join(" ");
    const extras = row.extras.map((x) => (x.qty > 1 ? t("bookings.row.extraItem", { label: T(x.nameTh, x.nameEn), qty: x.qty }) : T(x.nameTh, x.nameEn)));
    return [pax, ...extras].filter(Boolean).join(" · ");
  };
  /** "รอบยกเลิก · คลื่นลม/อากาศ" (เหตุผลถอดด้วยตัวถอดของ T1.2 — ไม่แสดงสตริงดิบ) */
  const departureCancelled = (row: Pick<BookingRowVM, "departureStatus" | "departureCancelReason">) => {
    if (row.departureStatus !== "CANCELLED") return null;
    const reason = reasonText(row.departureCancelReason);
    return reason ? t("bookings.row.depCancelled", { reason }) : t("bookings.row.depCancelledPlain");
  };
  /** บรรทัดของคอลัมน์ "เงิน" ตามสถานะเงินจากตัวโหลด */
  const moneyLines = (row: Pick<BookingRowVM, "money" | "lastTender" | "paidSatang" | "outstandingSatang" | "refundedSatang" | "nextDue" | "refund">) => {
    const out: string[] = [];
    switch (row.money) {
      case "PAID":
        out.push(row.lastTender ? t("bookings.moneyText.paidWith", { tender: tender(row.lastTender) }) : t("bookings.money.PAID"));
        break;
      case "PART_PAID":
        out.push(t("bookings.moneyText.partPaid", { paid: formatBaht(row.paidSatang), due: formatBaht(row.outstandingSatang) }));
        break;
      case "REFUNDED":
        out.push(t("bookings.moneyText.refunded", { amount: formatBaht(row.refundedSatang) }));
        break;
      case "AGENT_COLLECTS":
        out.push(t("bookings.money.AGENT_COLLECTS"));
        break;
      case "NONE":
        out.push(t("bookings.money.NONE"));
        break;
      default:
        out.push(t("bookings.money.UNPAID"));
    }
    if ((row.money === "UNPAID" || row.money === "PART_PAID") && row.nextDue) out.push(t("bookings.moneyText.dueOn", { date: D.short(row.nextDue.localDate) }));
    if (row.refund) out.push(t("bookings.moneyText.refundOpen", { amount: formatBaht(row.refund.amountSatang), status: refundStatus(row.refund.status) }));
    return out;
  };
  /** "2026-11-12 18:00" (เวลาร้านจาก VM) → "พฤ. 12 พ.ย. 18:00" */
  const stamp = (local: string) => {
    const [ymd, hm] = local.split(" ");
    return hm ? `${D.short(ymd)} ${hm}` : D.short(ymd);
  };
  return { t, D, T, status, tender, dueKind, dueStatus, eventKind, docKind, posting, refundStatus, channel, badge, paxLine, departureCancelled, moneyLines, stamp };
}

// ═══════════════ ป้ายสถานะ (แยกด้วยรูปทรง: ทึบ = ยืนยัน · เส้นประ = ถือที่ · กรอบแดง + ไอคอน = ต้องทำ · เทา = จบแล้ว) ═══════════════
export function BookingBadge({ row, today, "data-testid": testid }: { row: Pick<BookingRowVM, "badge" | "hold" | "status">; today: string; "data-testid"?: string }) {
  const X = useBkText();
  const text = X.badge(row, today);
  const shape = row.badge.shape;
  if (shape === "alert") {
    return (
      <span data-testid={testid} data-status={row.status} data-shape="alert" className="inline-flex max-w-full items-center gap-1 rounded-md border-2 border-[color:var(--color-danger)] px-2 py-0.5 text-sm font-bold text-[color:var(--color-danger)]">
        <span aria-hidden="true">⚠</span>
        <span className="[overflow-wrap:anywhere]">{text}</span>
      </span>
    );
  }
  return (
    <Pill shape={shape} testid={testid} status={row.status}>
      {text}
    </Pill>
  );
}

/** ปุ่มของส่วนที่ยังไม่เปิดใช้ — กดไม่ได้ + บอกตรง ๆ ว่ายังไม่เปิดใช้ (ไม่มีรหัสใบงานบนจอ) */
export function NotYetButton({ "data-testid": testid, label, hint, className }: { "data-testid": string; label: string; hint: string; className?: string }) {
  const t = useTranslations("trips");
  return (
    <button type="button" data-testid={testid} disabled title={hint} aria-label={`${label} — ${hint}`} className={`${BTN} ${className ?? ""} h-auto flex-wrap gap-x-1.5 gap-y-0`}>
      <span>{label}</span>
      <span className="text-sm text-[color:var(--color-muted)]">· {t("bookings.notYet.label")}</span>
    </button>
  );
}

// ═══════════════ กล่องโต้ตอบของจอนี้ ═══════════════
/**
 * Dialog ของ T1.1 + data-testid + แถบปุ่มติดล่าง · ปิดด้วยปุ่มขณะมีค่าที่กรอก ⇒ ถามก่อน (ไม่ทิ้งค่าเงียบ ๆ)
 * Escape: Dialog ถามเองแล้ว — จดว่ากำลังกด Escape อยู่ (keydown → keyup) เพื่อไม่ถามซ้ำ
 */
export function BkDialog({ "data-testid": testid, title, busy, dirty, onClose, footer, wide, children }: { "data-testid": string; title: string; busy: boolean; dirty: boolean; onClose: () => void; footer?: ReactNode; wide?: boolean; children: ReactNode }) {
  const t = useTranslations("trips");
  const escDown = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") escDown.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Escape") escDown.current = false;
    };
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    return () => {
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
    };
  }, []);
  const close = () => {
    if (busy) return;
    if (dirty && !escDown.current && !window.confirm(t("common.discardConfirm"))) return;
    onClose();
  };
  return (
    <Dialog title={title} onClose={close} closeLabel={t("common.close")} busy={busy} dirty={dirty} wide={wide} flushBottom>
      <div data-testid={testid} className="flex min-w-0 flex-col gap-3 pb-4">
        {children}
      </div>
      {footer ? <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-3">{footer}</div> : null}
    </Dialog>
  );
}
/** ปุ่มปิดในแถบล่างของกล่อง (ถามก่อนทิ้งค่าที่กรอก) */
export function useGuardedClose(onClose: () => void, busy: boolean, dirty: boolean) {
  const t = useTranslations("trips");
  return () => {
    if (busy) return;
    if (dirty && !window.confirm(t("common.discardConfirm"))) return;
    onClose();
  };
}

// ═══════════════ ตัวเรียก action ═══════════════
export type BkActionOut = { ok: boolean; code?: string; messageTh?: string; details?: Record<string, unknown> };
/** ข้อความผิดพลาดของ action: เหตุผลเจาะจง (details.reason) ก่อน → รหัส → ข้อความไทยของบริการ (จอไทย) → ข้อความทั่วไป */
export function useBkFailText() {
  const t = useTranslations("trips");
  const locale = useLocale();
  return (r: BkActionOut): string => {
    const reason = r.details?.reason;
    if (typeof reason === "string" && REASON_CODES.includes(reason)) return t(`bookings.reason.${reason}`);
    if (r.code && ERROR_CODES.includes(r.code)) return t(`errors.${r.code}`);
    if (locale === "th" && r.messageTh) return r.messageTh;
    return t("common.failed");
  };
}
/**
 * เรียก server action ทีละครั้งผ่าน useRunner ของ T1.1 (กันกดซ้ำระหว่างส่ง · สำเร็จ ⇒ onOk + รีเฟรชข้อมูลจอ)
 * ไม่สำเร็จ ⇒ ข้อความในกล่อง (ไม่ปิด ไม่ทิ้งค่า) — special ให้ข้อความเฉพาะกรณีของกล่องนั้น
 */
export function useBkRunner() {
  const t = useTranslations("trips");
  const failText = useBkFailText();
  const r = useRunner(t("common.failed"));
  const run = async (step: () => Promise<BkActionOut>, onOk?: () => void, special?: (out: BkActionOut) => string | null): Promise<boolean> => {
    const box: { text: string | null } = { text: null };
    const ok = await r.run(async () => {
      const out = await step();
      if (!out.ok) box.text = special?.(out) ?? failText(out);
      return out;
    }, onOk);
    if (!ok && box.text) r.setError(box.text);
    return ok;
  };
  return { busy: r.busy, error: r.error, setError: r.setError, run, failText };
}

/** บรรทัดป้าย–ค่า (ป้ายซ้าย · ค่าชิดขวา ตัวเลขเท่ากันทุกหลัก) */
export function KV({ label, value, strong, "data-testid": testid }: { label: string; value: string; strong?: boolean; "data-testid"?: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{label}</span>
      <span data-testid={testid} className={`shrink-0 tabular-nums text-[color:var(--color-ink)] ${strong ? "text-base font-bold" : ""}`}>
        {value}
      </span>
    </div>
  );
}
