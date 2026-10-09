"use client";

// bills-ui.tsx — ชิ้นส่วนแสดงผลของหน้า "บิลวันนี้" (POS P1.16 U · ภาพ 12): ตัวจัดรูปเงิน/เวลา (เวลาไทย) · ป้ายสถานะ · ป้ายช่องทาง · ไอคอน · CSV
// 🔴 ไฟล์นี้ไม่เรียก action และไม่มีปุ่ม/ช่องกรอก (อยู่ใน BillsClient ทั้งหมด) · เงินเป็นสตางค์ Int ทุกที่

import type { ReactNode } from "react";
import type { BillRow } from "@/lib/modules/pos/bills-shared";
import { moneyText } from "@/lib/modules/pos/register-shared";

export type T = (key: string, values?: Record<string, string | number>) => string;

export const money = (satang: number) => moneyText(satang);
const loc = (locale: string) => (locale.startsWith("en") ? "en-GB" : "th-TH");
/** เวลาไทย HH:MM */
export const bkkHm = (iso: string, locale: string) => new Intl.DateTimeFormat(loc(locale), { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
/** วันที่ (YYYY-MM-DD ตามเวลาไทย) → "30 ก.ย. 2569" */
export const dateLabel = (date: string, locale: string) =>
  new Intl.DateTimeFormat(loc(locale), { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00+07:00`));

/** สถานะที่จอแสดง: คืนบางส่วน = PAID ที่มียอดคืน */
export type BillChip = "PAID" | "VOIDED" | "PARTIAL" | "REFUNDED";
export const chipOf = (b: { status: string; refundedSatang: number }): BillChip =>
  b.status === "VOIDED" ? "VOIDED" : b.status === "REFUNDED" ? "REFUNDED" : b.refundedSatang > 0 ? "PARTIAL" : "PAID";

/** ป้ายสถานะ (ภาพ 12: ชำระแล้ว = กรอบดำ · ยกเลิก = กรอบแดง · คืนบางส่วน = กรอบฟ้า · คืนเงินแล้ว = เทา) */
export function StatusChip({ chip, t }: { chip: BillChip; t: T }) {
  const c =
    chip === "VOIDED"
      ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]"
      : chip === "PARTIAL"
        ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]"
        : chip === "REFUNDED"
          ? "border-[color:var(--color-line)] text-[color:var(--color-muted)]"
          : "border-[color:var(--color-ink)] text-[color:var(--color-ink)]";
  return <span className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md border px-2 text-[11px] font-bold ${c}`}>{t(`status.${chip}`)}</span>;
}

/** ป้ายช่องทาง: POS = "หน้าร้าน" · ระบบที่รู้จัก = ชื่อจาก pos.shift.source · อื่น = ชื่อโมดูลดิบ */
const SOURCE_KEYS = new Set(["BOOKING", "HOTEL", "RESTAURANT", "TICKET"]);
export function channelLabel(src: string, t: T, ts: T): string {
  if (src === "POS") return t("channelPos");
  return SOURCE_KEYS.has(src) ? ts(`source.${src}`) : src;
}
export function ChannelChip({ src, t, ts }: { src: string; t: T; ts: T }) {
  const pos = src === "POS";
  return (
    <span
      className={`inline-flex h-6 max-w-full items-center truncate whitespace-nowrap rounded-md border px-2 text-[11px] ${pos ? "border-[color:var(--color-line)] text-[color:var(--color-muted)]" : "border-[color:var(--color-ink)] font-bold"}`}
    >
      {channelLabel(src, t, ts)}
    </span>
  );
}

/** วิธีชำระ "CASH+PROMPTPAY" → "เงินสด + พร้อมเพย์" · เงินสดนอกกะ = ป้ายของมันเอง */
const METHOD_KEYS = new Set(["CASH", "CARD", "PROMPTPAY", "TRANSFER", "DEPOSIT", "ROOM_CHARGE"]);
export const methodLabel = (m: string, ts: T) => (METHOD_KEYS.has(m) ? ts(`method.${m}`) : m);
export function payText(row: Pick<BillRow, "payMethods" | "offShiftCash">, t: T, ts: T): string {
  if (row.offShiftCash) return t("offShiftCashPay");
  if (!row.payMethods) return "—";
  return row.payMethods.split("+").map((m) => methodLabel(m, ts)).join(" + ");
}

// ═══════════ ไอคอน (เส้น · currentColor) ═══════════
const PATHS = {
  cal: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  left: <path d="m14.5 6-6 6 6 6" />,
  right: <path d="m9.5 6 6 6-6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  dots: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
  x: <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />,
  print: (
    <>
      <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" />
      <rect x="7" y="14" width="10" height="6" rx="1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h11a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3Z" />
      <path d="M5 17a3 3 0 0 1 3-3h11" />
    </>
  ),
  doc: (
    <>
      <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M9.5 10h5M9.5 13.5h5M9.5 17h3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  download: <path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14" />,
  // POS P1.11U ▸ แถวส่งใบเสร็จในลิ้นชัก (ภาพ 12) ◂
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  at: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M15.5 12v1.3a2.6 2.6 0 0 0 5 1V12a8.5 8.5 0 1 0-3.3 6.7" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
} as const;
export type BillIconName = keyof typeof PATHS;
export function BillIcon({ name, size = 16, className }: { name: BillIconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className ?? ""}`}>
      {PATHS[name]}
    </svg>
  );
}

/** การ์ดสรุป (ภาพ 12: ป้ายเล็กเทา · ตัวเลขใหญ่ · บรรทัดย่อย) */
export function SummaryCard({ label, value, sub, testid }: { label: string; value: string; sub: ReactNode; testid: string }) {
  return (
    <div data-testid={testid} className="card flex min-w-0 flex-1 flex-col gap-0.5 !p-4">
      <span className="text-[12px] text-[color:var(--color-muted)]">{label}</span>
      <span className="break-words text-[20px] font-bold leading-tight tabular-nums">{value}</span>
      <span className="text-[11px] text-[color:var(--color-muted)] tabular-nums">{sub}</span>
    </div>
  );
}

/** CSV ของแถวในหน้านี้ (U1: "ส่งออก (หน้านี้)" — ส่งออกทั้งวันอยู่ที่ CSV ของ P1.17) */
export function billsCsv(rows: BillRow[], head: string[], cell: (r: BillRow) => (string | number)[]): string {
  const esc = (v: string | number) => {
    // แก้รอบ 1 F4: กันสูตรในสเปรดชีต (= + - @ นำหน้า) — ใส่ ' นำหน้าเฉพาะข้อความ (ตัวเลขเงินเป็น number ไม่โดน)
    const s = typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [head, ...rows.map(cell)].map((r) => r.map(esc).join(",")).join("\r\n");
}
