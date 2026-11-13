"use client";
// TRIPS T1.1 ▸ ชิ้นส่วนร่วมของจอสินค้า (ภาพ 16): ปุ่ม · กล่องโต้ตอบ · ป้ายสถานะแยกรูปทรง · ตัวช่วยเรียก action
//   🔴 แสดงผลเท่านั้น — ไม่มีตรรกะธุรกิจ (ราคา/สิทธิ์/"เต็ม" มาจากตัวโหลด) · ตัวอักษร ≥ 14 px · ปุ่ม ≥ 44 px · สีจากโทเคนของแอปเท่านั้น
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatYmd } from "./trips-shared";

export const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:cursor-not-allowed disabled:text-[color:var(--color-muted)]";
export const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-[color:var(--color-ink)] px-4 py-2 text-sm font-bold text-[color:var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60";
export const INPUT = "input min-h-11 w-full min-w-0 text-sm";
export const CARD = "flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5";
export const TH = "whitespace-nowrap px-1.5 py-2 text-left text-sm font-medium text-[color:var(--color-muted)]";
export const TD = "px-1.5 py-2.5 align-top text-sm text-[color:var(--color-ink)]";

/** ป้ายสถานะ — แยกด้วยรูปทรงไม่ใช่สีอย่างเดียว: ทึบ (กรอบหนา) · เส้นประ · พื้นเทา */
export function Pill({ shape, children, testid, status }: { shape: "solid" | "dashed" | "muted" | "thick"; children: ReactNode; testid?: string; status?: string }) {
  const cls =
    shape === "solid"
      ? "border border-[color:var(--color-ink)] text-[color:var(--color-ink)]"
      : shape === "thick"
        ? "border-2 border-[color:var(--color-ink)] font-bold text-[color:var(--color-ink)]"
        : shape === "dashed"
          ? "border border-dashed border-[color:var(--color-ink-soft)] text-[color:var(--color-ink-soft)]"
          : "border border-transparent bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]";
  return (
    <span data-testid={testid} data-status={status} data-shape={shape} className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-sm ${cls}`}>
      {children}
    </span>
  );
}
export const statusShape = (status: string): "solid" | "dashed" | "muted" => (status === "ACTIVE" ? "solid" : status === "DRAFT" ? "dashed" : "muted");

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/**
 * กล่องโต้ตอบเต็มจอ: เปิดแล้วโฟกัสช่องแรก · Tab วนอยู่ในกล่อง · ปิดแล้วคืนโฟกัสให้ปุ่มที่เปิด
 * Escape: ไม่ทำอะไรระหว่างบันทึก (busy) · ไม่ทำอะไรเมื่อกล่องคำเตือนกฎหมายของฟอร์มกลาง (role=alertdialog) เปิดอยู่ ⇒ ไม่ข้ามขั้น W01/W03
 *   มีการพิมพ์/เลือกในกล่องตั้งแต่เปิด (จับ input/change ในกล่องเอง — ใช้ได้กับฟอร์มกลางด้วย) หรือ dirty = true ⇒ ถามยืนยันก่อนทิ้ง · ไม่มี ⇒ ปิด
 */
export function Dialog({
  title,
  onClose,
  children,
  closeLabel,
  wide,
  busy,
  dirty,
  flushBottom,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel: string;
  wide?: boolean;
  busy?: boolean;
  dirty?: boolean;
  /** เนื้อในมีแถบบันทึกติดล่างของตัวเอง (ฟอร์มกลาง sticky bottom-0) ⇒ ไม่เว้นขอบล่าง ไม่ให้เนื้อหาโผล่ใต้แถบ */
  flushBottom?: boolean;
}) {
  const t = useTranslations("trips");
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const touchedRef = useRef(false);
  const stateRef = useRef({ busy: busy === true, dirty: dirty === true, confirmText: t("common.discardConfirm") });
  useEffect(() => {
    closeRef.current = onClose;
    stateRef.current = { busy: busy === true, dirty: dirty === true, confirmText: t("common.discardConfirm") };
  }, [onClose, busy, dirty, t]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = boxRef.current;
    const items = (): HTMLElement[] => (box ? Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    const firstField = box?.querySelector<HTMLElement>("input:not([disabled]),select:not([disabled]),textarea:not([disabled])");
    (firstField ?? items()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        const st = stateRef.current;
        if (st.busy) return;
        if (box?.querySelector('[role="alertdialog"]')) return;
        if ((st.dirty || touchedRef.current) && !window.confirm(st.confirmText)) return;
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // กล่องคำเตือนกฎหมายของฟอร์มกลาง (role=alertdialog) ขึ้นท้ายฟอร์ม — เลื่อนให้เห็นทันที ไม่ให้ซ่อนอยู่นอกจอ (ภาพ 17 W01/W03)
    let shown: Element | null = null;
    const obs = new MutationObserver(() => {
      const alert = box?.querySelector('[role="alertdialog"]') ?? null;
      if (alert && alert !== shown) alert.scrollIntoView({ block: "start" });
      shown = alert;
    });
    if (box) obs.observe(box, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div ref={boxRef} onInputCapture={() => (touchedRef.current = true)} onChangeCapture={() => (touchedRef.current = true)} className={`flex max-h-[92dvh] w-full ${wide ? "max-w-2xl" : "max-w-xl"} flex-col overflow-hidden rounded-t-2xl bg-[color:var(--color-surface)] sm:rounded-2xl`}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--color-line)] px-5 py-3">
          <h2 className="text-base font-bold text-[color:var(--color-ink)]">{title}</h2>
          <button type="button" onClick={onClose} className={BTN}>
            {closeLabel}
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 ${flushBottom ? "pb-0" : "flex flex-col gap-3 pb-5"}`}>{children}</div>
      </div>
    </div>
  );
}

/** ตัวจัดวันที่ตามภาษาของผู้ใช้ (ชื่อวัน/เดือน/ปีจาก messages trips.dates.*) */
export function useYmd(): (ymd: string, withWeekday?: boolean) => string {
  const t = useTranslations("trips");
  const names = {
    weekdays: [0, 1, 2, 3, 4, 5, 6].map((i) => t(`dates.wd${i}`)),
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => t(`dates.mon${i}`)),
    yearOffset: Number(t("dates.yearOffset")) || 0,
  };
  return (ymd: string, withWeekday = true) => formatYmd(ymd, names, withWeekday);
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium text-[color:var(--color-ink)]">{label}</span>
      {children}
      {hint ? <span className="text-sm text-[color:var(--color-muted)]">{hint}</span> : null}
    </label>
  );
}

type ActionResult = { ok: boolean; message?: string; messageTh?: string; code?: string };
/** รหัสข้อผิดพลาดของบริการที่มีข้อความในทั้งสองภาษา (messages trips.errors.<code>) */
const ERROR_CODES = new Set([
  "INVALID_INPUT",
  "VALIDATION",
  "NOT_FOUND",
  "FORBIDDEN",
  "PERMISSION",
  "BUSY",
  "NAME_TAKEN",
  "ZONE_LIMIT",
  "SLUG_TAKEN",
  "PUBLISH_INCOMPLETE",
  "BAD_STATE",
  "CONFIRM_REQUIRED",
  "CURRENCY_LOCKED",
  "AGE_RANGE",
  "AGE_OVERLAP",
  "LAST_ACTIVE_OPTION",
  "LAST_SEAT_PAX_TYPE",
  // TRIPS T1.2 ▸ รหัสของจอปฏิทินรอบ (บริการ T0.3/T0.5 + decideBelowMin) ◂
  "NOT_BELOW_MIN",
  "MERGE_NEEDS_BOOKINGS",
  "MERGE_TARGET_INVALID",
  "HAS_BOOKINGS",
  "CAPACITY_BELOW_USED",
  "RESOURCE_CLASH",
  "PAST_DEPARTURE",
  "FORBIDDEN_TRANSITION",
  "DUPLICATE_DEPARTURE",
  "RESOURCE_INACTIVE",
  "NO_DURATION",
  "OPTION_INACTIVE",
  "PRODUCT_ARCHIVED",
  "SCHEDULE_PAUSED",
  "HORIZON_OFF",
  "STATE_CONFLICT",
  "CURRENCY_NOT_ALLOWED",
]);

/** เรียก server action ทีละครั้ง: สำเร็จ ⇒ รีเฟรชข้อมูลจอจากเซิร์ฟเวอร์ · ไม่สำเร็จ ⇒ ข้อความไทยของบริการ */
/**
 * ข้อความผิดพลาดของ action: จอไทย = ข้อความเจาะจงของบริการ (ไทย) · จออื่น = ข้อความตามรหัสจาก messages (ไม่ส่งข้อความไทยของบริการขึ้นจออังกฤษ)
 * รหัสที่ไม่รู้จักบนจออังกฤษ ⇒ ข้อความทั่วไป
 */
export function useRunner(failText: string) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const msgOf = (r: ActionResult): string => {
    const own = r.message ?? r.messageTh;
    if (locale === "th" && own) return own;
    return r.code && ERROR_CODES.has(r.code) ? t(`errors.${r.code}`) : failText;
  };
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(steps: () => Promise<ActionResult | ActionResult[]>, onOk?: () => void): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const out = await steps();
      const list = Array.isArray(out) ? out : [out];
      const bad = list.find((r) => !r.ok);
      if (bad) {
        setError(msgOf(bad));
        return false;
      }
      onOk?.();
      router.refresh();
      return true;
    } catch {
      setError(failText);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run, router };
}

export function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
      {text}
    </p>
  );
}

/** "บาท" จากข้อความที่ผู้ใช้พิมพ์ → สตางค์ (จำนวนเต็ม) · อ่านไม่ได้ ⇒ null */
export function bahtToSatang(text: string): number | null {
  const t = text.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [b, s = ""] = t.split(".");
  const v = Number(b) * 100 + Number(s.padEnd(2, "0"));
  return Number.isSafeInteger(v) ? v : null;
}
export const intOrNull = (text: string): number | null => (/^\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : null);
