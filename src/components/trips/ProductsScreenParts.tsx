"use client";
// TRIPS T1.1 ▸ ชิ้นส่วนร่วมของจอสินค้า (ภาพ 16): ปุ่ม · กล่องโต้ตอบ · ป้ายสถานะแยกรูปทรง · ตัวช่วยเรียก action
//   🔴 แสดงผลเท่านั้น — ไม่มีตรรกะธุรกิจ (ราคา/สิทธิ์/"เต็ม" มาจากตัวโหลด) · ตัวอักษร ≥ 14 px · ปุ่ม ≥ 44 px · สีจากโทเคนของแอปเท่านั้น
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:cursor-not-allowed disabled:text-[color:var(--color-muted)]";
export const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-[color:var(--color-ink)] px-4 py-2 text-sm font-bold text-[color:var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60";
export const INPUT = "input min-h-11 w-full min-w-0 text-sm";
export const CARD = "flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5";
export const TH = "px-2 py-2 text-left text-sm font-medium text-[color:var(--color-muted)]";
export const TD = "px-2 py-3 align-top text-sm text-[color:var(--color-ink)]";

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

/** กล่องโต้ตอบเต็มจอ (ปิดด้วยปุ่ม) */
export function Dialog({ title, onClose, children, closeLabel }: { title: string; onClose: () => void; children: ReactNode; closeLabel: string }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-[color:var(--color-surface)] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-line)] px-5 py-3">
          <h2 className="text-base font-bold text-[color:var(--color-ink)]">{title}</h2>
          <button type="button" onClick={onClose} className={BTN}>
            {closeLabel}
          </button>
        </div>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
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
const msgOf = (r: ActionResult, fallback: string): string => r.message ?? r.messageTh ?? fallback;

/** เรียก server action ทีละครั้ง: สำเร็จ ⇒ รีเฟรชข้อมูลจอจากเซิร์ฟเวอร์ · ไม่สำเร็จ ⇒ ข้อความไทยของบริการ */
export function useRunner(failText: string) {
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
        setError(msgOf(bad, failText));
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
