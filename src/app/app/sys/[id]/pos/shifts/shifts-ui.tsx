"use client";

// shifts-ui.tsx — ชิ้นส่วนแสดงผลของหน้ากะ POS (P1.9 U · ภาพ 07 / 13A): ไอคอน · ตัวจัดรูปเงิน/เวลา (เวลาไทย) · ป้าย · การ์ด KPI · ตัวแปลงธนบัตร
// 🔴 เงินเป็นสตางค์ Int ทุกที่ · ช่องกรอกเป็นบาท (×100) · ไฟล์นี้ไม่เรียก action และไม่มีปุ่ม/ช่องกรอก (อยู่ใน ShiftsClient ทั้งหมด)

import type { ReactNode } from "react";
import { moneyText } from "@/lib/modules/pos/register-shared";

export type T = (key: string, values?: Record<string, string | number>) => string;

/** ธนบัตร/เหรียญที่กรอกเป็น "จำนวน" (สตางค์) — ลำดับตามภาพ 07: คอลัมน์ซ้าย 1000/500/100 · ขวา 50/20/10 */
export const NOTE_DENOMS = [100000, 50000, 10000, 5000, 2000, 1000] as const;

/** "1,234.50" → 123450 · ว่าง = 0 เมื่อ emptyZero · ผิดรูป/ติดลบ = null */
export function bahtToSatang(v: string, emptyZero = false): number | null {
  const t = v.replace(/[,\s฿]/g, "").trim();
  if (!t) return emptyZero ? 0 : null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return null;
  const [b, s = ""] = t.split(".");
  return Number(b) * 100 + Number((s + "00").slice(0, 2));
}
/** จำนวนธนบัตร: ว่าง = 0 · จำนวนเต็ม 0…99999 · อื่น = null */
export function parseCount(v: string): number | null {
  const t = v.replace(/[,\s]/g, "");
  if (!t) return 0;
  if (!/^\d{1,5}$/.test(t)) return null;
  return Number(t);
}

/**
 * ยอดรวมจากช่องธนบัตร + ช่องเหรียญ (บาท) → { total, detail } · detail = เฉพาะธนบัตรที่กรอกจริง (คีย์ SHIFT_DENOMS ของเซิร์ฟเวอร์)
 * R2 Q3: ห้ามแปลงยอดเหรียญเป็นจำนวนเหรียญปลอม · เซิร์ฟเวอร์ (denomDetail) ยังไม่รับคีย์ "coins" และบังคับ Σ detail = ยอด
 *   ⇒ มีเหรียญ = ไม่ส่ง detail (ส่งแค่ยอดรวม) · ไม่มีเหรียญ = ส่ง detail ธนบัตร (Σ = ยอดพอดี) — follow-up: เซิร์ฟเวอร์เพิ่มคีย์ coins
 * ไม่ได้กรอกช่องใดเลย = used:false · ช่องผิดรูป = null
 */
export function denomTotal(counts: Record<string, string>, coins: string): { total: number; detail: Record<string, number> | null; used: boolean } | null {
  let total = 0;
  let used = false;
  const detail: Record<string, number> = {};
  for (const d of NOTE_DENOMS) {
    const raw = counts[String(d)] ?? "";
    const n = parseCount(raw);
    if (n === null) return null;
    if (raw.trim()) used = true;
    if (n > 0) {
      detail[String(d)] = n;
      total += d * n;
    }
  }
  const c = bahtToSatang(coins, true);
  if (c === null) return null;
  if (coins.trim()) used = true;
  total += c;
  return { total, detail: c === 0 && Object.keys(detail).length ? detail : null, used };
}

export const money = (satang: number) => moneyText(satang);
/** ผลต่างมีเครื่องหมาย: "−฿15" · "+฿20" · "฿0" */
export const signedMoney = (satang: number) => (satang > 0 ? `+${moneyText(satang)}` : satang < 0 ? `−${moneyText(-satang)}` : moneyText(0));

const loc = (locale: string) => (locale.startsWith("en") ? "en-GB" : "th-TH");
/** เวลาไทย HH:MM */
export const bkkHm = (iso: string, locale: string) => new Intl.DateTimeFormat(loc(locale), { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
/** วันที่สั้น (เวลาไทย) "29 ก.ย." */
export const bkkDay = (iso: string, locale: string) => new Intl.DateTimeFormat(loc(locale), { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }).format(new Date(iso));
/** วันที่ยาว (เวลาไทย) "พ. 30 ก.ย. 2569" */
export const bkkDate = (iso: string, locale: string) => new Intl.DateTimeFormat(loc(locale), { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
/** ระยะเวลาเปิดกะ → {h, m} (ไม่ติดลบ) */
export function elapsed(fromIso: string, toIso: string): { h: number; m: number } {
  const ms = Math.max(0, Date.parse(toIso) - Date.parse(fromIso));
  const mins = Math.floor(ms / 60_000);
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

// ═══════════ ไอคอนที่ RegisterIcon ไม่มี (เส้น · currentColor) ═══════════
const PATHS = {
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  swap: <path d="M5 9h13m-3.5-3.5L18 9l-3.5 3.5M19 15H6m3.5-3.5L6 15l3.5 3.5" />,
  warn: (
    <>
      <path d="M12 4 2.8 19.5h18.4Z" />
      <path d="M12 10v4.5M12 17h.01" />
    </>
  ),
  device: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  zdoc: (
    <>
      <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M9.5 10h5M9.5 13.5h5M9.5 17h3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
} as const;
export type ShiftIconName = keyof typeof PATHS;
export function ShiftIcon({ name, size = 16, className }: { name: ShiftIconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className ?? ""}`}>
      {PATHS[name]}
    </svg>
  );
}

/** ป้ายเส้นขอบ (ภาพ 07: "กำลังเปิด" ฟ้า · "ออนไลน์" ดำ · "มีเหตุผล"/"บังคับปิด" เทา/แดง) */
export function Pill({ tone = "ink", children, testid }: { tone?: "accent" | "ink" | "muted" | "danger"; children: ReactNode; testid?: string }) {
  const c =
    tone === "accent"
      ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]"
      : tone === "danger"
        ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]"
        : tone === "muted"
          ? "border-[color:var(--color-line)] text-[color:var(--color-muted)]"
          : "border-[color:var(--color-ink)] text-[color:var(--color-ink)]";
  return (
    <span data-testid={testid} className={`inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-semibold ${c}`}>
      {children}
    </span>
  );
}

/** ช่อง KPI ของสรุประหว่างกะ (ภาพ 07: ป้ายเล็กเทา · ตัวเลขใหญ่ · บรรทัดย่อย) */
export function Kpi({ label, value, sub, testid }: { label: string; value: string; sub?: ReactNode; testid: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid={testid}>
      <span className="text-[12px] text-[color:var(--color-muted)]">{label}</span>
      <span className="break-words text-[22px] font-bold leading-tight tabular-nums">{value}</span>
      {sub ? <span className="text-[11px] text-[color:var(--color-muted)] tabular-nums">{sub}</span> : null}
    </div>
  );
}

/** กล่องตัวเลขสามช่องของการ์ดปิดกะ (ควรมี · นับได้ · ผลต่าง) */
export function FigureBox({ label, value, danger, testid }: { label: string; value: string; danger?: boolean; testid: string }) {
  return (
    <div
      data-testid={testid}
      className={`flex min-w-0 flex-col gap-1 rounded-xl border px-3.5 py-3 ${danger ? "border-[color:var(--color-danger)]" : ""}`}
    >
      <span className={`text-[12px] ${danger ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`}>{label}</span>
      <span className={`text-[22px] font-bold leading-tight tabular-nums ${danger ? "text-[color:var(--color-danger)]" : ""}`}>{value}</span>
    </div>
  );
}

/** การ์ดของหน้า — @container: ส่วนในตัดสินเลย์เอาต์จากความกว้างการ์ด (คอลัมน์ซ้ายแคบที่ 1024) ไม่ใช่ความกว้างจอ */
export const CARD = "@container card min-w-0 rounded-2xl p-5 sm:p-7";
