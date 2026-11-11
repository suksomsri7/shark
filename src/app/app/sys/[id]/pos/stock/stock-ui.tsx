"use client";

// stock-ui.tsx — ชิ้นส่วนร่วมของหน้าสต็อก POS (P1.14 U): ไอคอน · คีย์กันซ้ำ · ข้อความปฏิเสธ · ตัวจัดรูปจำนวน · ตัวเลือกสินค้า (สแกน/ค้น)
// 🔴 คำปฏิเสธแสดงจาก STOCK_COUNT_MESSAGES[code][ภาษาจอ] (ไม่แสดงรหัสดิบ) · ตัวเลือกสินค้าเรียก action ครั้งละหนึ่ง (ไม่ยิงซ้อน)

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { ScanCameraDialog } from "@/components/pos/register/ScanCameraDialog";
import { STOCK_COUNT_MESSAGES, type StockCountRefusalCode } from "@/lib/modules/pos/stock-count-shared";
import { posStockItemSearchAction } from "@/lib/modules/pos/stock-count-actions";

export type Target = { systemId: string; unitId: string };
export type T = (key: string, values?: Record<string, string | number>) => string;
type SearchOk = Extract<Awaited<ReturnType<typeof posStockItemSearchAction>>, { ok: true }>;
export type ItemHit = SearchOk["items"][number];

/** คีย์กันซ้ำของคำขอ (^[A-Za-z0-9_-]{8,64}$) — สร้างตอนกดส่ง เก็บไว้จนผลมา (ลองใหม่ = คีย์เดิม) */
export const newKey = (): string => {
  const raw = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
};

/** ข้อความปฏิเสธตามภาษาจอ — รหัสที่ไม่รู้จัก = INTERNAL */
export function useRefusalText(): (code: string) => string {
  const locale = useLocale();
  const lang = locale.startsWith("en") ? "en" : "th";
  return (code: string) => (STOCK_COUNT_MESSAGES[code as StockCountRefusalCode] ?? STOCK_COUNT_MESSAGES.INTERNAL)[lang];
}

/** "1,250" → 1250 · ว่าง/ไม่ใช่จำนวนเต็มบวก = null (ทศนิยม/ติดลบไม่รับ) */
export function parseCount(v: string): number | null {
  const s = v.replace(/[,\s]/g, "").replace(/g$/i, "");
  if (!/^\d{1,8}$/.test(s)) return null;
  return Number(s);
}
/** "−3" / "+2" / "5" → จำนวนเต็มมีเครื่องหมาย · ผิดรูป = null */
export function parseSigned(v: string): number | null {
  const s = v.replace(/[,\s]/g, "").replace(/^−/, "-");
  if (!/^[+-]?\d{1,8}$/.test(s)) return null;
  return Number(s);
}
export const fmtInt = (n: number, locale: string) => n.toLocaleString(locale.startsWith("en") ? "en-US" : "th-TH");
/** จำนวนสต็อก: ชิ้น = ตัวเลข · ชั่ง = กรัม "1,250 g" */
export const fmtQty = (n: number, weighed: boolean, locale: string) => `${fmtInt(n, locale)}${weighed ? " g" : ""}`;
/** ผลต่างมีเครื่องหมายแบบภาพ 05ค: "−1" · "+2" */
export const fmtDelta = (n: number, weighed: boolean, locale: string) => `${n < 0 ? "−" : "+"}${fmtQty(Math.abs(n), weighed, locale)}`;
/** เวลาไทย HH:MM */
export const bkkHm = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
/** วันที่สั้น + เวลา (เวลาไทย) */
export const bkkDayHm = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

// ═══════════ ไอคอน (เส้น · currentColor) — ตัวที่ RegisterIcon ไม่มี ═══════════
const PATHS = {
  receive: <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />,
  transfer: <path d="M4 8h14m-4-4 4 4-4 4M20 16H6m4-4-4 4 4 4" />,
  adjust: <path d="M4 20h4L19 9l-4-4L4 16Zm9-13 4 4" />,
  history: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  count: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  dots: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  out: <path d="M12 20V8m-5 5 5-5 5 5M5 4h14" />,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />,
} as const;
export type StockIconName = keyof typeof PATHS;
export function StockIcon({ name, size = 16, className }: { name: StockIconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "dots" ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {PATHS[name]}
    </svg>
  );
}

// ═══════════ ตัวเลือกสินค้า (สแกน/ค้น) ของทางลัด ═══════════
/**
 * ช่องเดียว: เครื่องสแกนพิมพ์รหัสแล้ว Enter / คนพิมพ์ชื่อ-SKU (หน่วง 300 ms) · กล้อง = ScanCameraDialog ของหน้าขาย
 * Enter: ผลตรงตัว (บาร์โค้ด/SKU) ตัวแรก = เลือกทันที · ไม่มีผล = ข้อความ UNKNOWN_CODE ใต้ช่อง
 * testid: pos-stock-<kind>-search (ช่อง) · -search-camera · -search-hit-<itemId> · -search-error
 */
export type PickerKind = "receive" | "transfer" | "transfer-c" | "adjust" | "adjust-c";
export function ItemPicker({
  target,
  kind,
  onPick,
  placeholder,
  disabled,
  "data-testid": testId,
}: {
  target: Target;
  kind: PickerKind;
  onPick: (hit: ItemHit) => void;
  placeholder: string;
  disabled?: boolean;
  "data-testid": string;
}) {
  const t = useTranslations("pos.stock") as T;
  const refusal = useRefusalText();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ItemHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = async (term: string): Promise<ItemHit[] | null> => {
    const my = ++seq.current;
    setBusy(true);
    const r = await posStockItemSearchAction({ ...target, q: term }).catch(() => null);
    if (my !== seq.current) return null; // มีคำค้นใหม่กว่าแล้ว
    setBusy(false);
    if (!r) {
      setError(refusal("INTERNAL"));
      return null;
    }
    if (!r.ok) {
      setError(refusal(r.code));
      setHits([]);
      return null;
    }
    setError(null);
    setHits(r.items);
    return r.items;
  };

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      seq.current++; // คำค้นที่ยังวิ่งอยู่ไม่ต้องเปิดรายการกลับมา
      setBusy(false);
      setHits([]);
      return;
    }
    const h = setTimeout(() => void search(term), 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pick = (hit: ItemHit) => {
    seq.current++;
    setBusy(false);
    onPick(hit);
    setQ("");
    setHits([]);
    setError(null);
    inputRef.current?.focus();
  };
  const byCode = async (code: string) => {
    const term = code.trim();
    if (!term) return;
    const items = await search(term);
    if (!items) return;
    const exact = items.find((i) => i.exact);
    if (exact) pick(exact);
    else if (items.length === 0) setError(refusal("UNKNOWN_CODE"));
  };

  return (
    <div className="relative flex flex-col gap-1" data-testid={testId}>
      <div className="flex gap-2">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] border px-3 focus-within:border-[color:var(--color-ink)]">
          <RegisterIcon name="search" size={14} className="shrink-0 text-[color:var(--color-muted)]" />
          <input
            ref={inputRef}
            data-testid={`pos-stock-${kind}-search`}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            value={q}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void byCode(q);
              }
              if (e.key === "Escape") setHits([]);
            }}
          />
          {busy && <span className="text-xs text-[color:var(--color-muted)]">{t("searching")}</span>}
        </label>
        <button
          type="button"
          data-testid={`pos-stock-${kind}-search-camera`}
          className="btn btn-ghost h-11 shrink-0 rounded-[10px] px-3"
          aria-label={t("scanCamera")}
          disabled={disabled}
          onClick={() => setCamera(true)}
        >
          <RegisterIcon name="cam" size={16} />
          <span className="hidden lg:inline">{t("scanCamera")}</span>
        </button>
      </div>
      {error && (
        <p data-testid={`pos-stock-${kind}-search-error`} role="alert" className="text-xs text-[color:var(--color-danger)]">
          {error}
        </p>
      )}
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-12 z-20 max-h-72 overflow-y-auto rounded-[12px] border bg-[color:var(--color-surface)] py-1 shadow-lg" role="listbox">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                data-testid={`pos-stock-${kind}-search-hit-${h.id}`}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                onClick={() => pick(h)}
              >
                <span className="min-w-0">
                  <b className="block truncate font-semibold">{h.name}</b>
                  <span className="block truncate text-xs text-[color:var(--color-muted)]">
                    {h.sku}
                    {h.barcode ? ` · ${h.barcode}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-[color:var(--color-muted)]">{t("onHandShort", { n: h.onHand, unit: h.unitLabel })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {camera && (
        <ScanCameraDialog
          onCode={(code) => {
            setCamera(false);
            void byCode(code);
          }}
          onClose={() => setCamera(false)}
        />
      )}
    </div>
  );
}
