// price-ui.tsx — ชิ้นส่วนร่วมของจอราคา (POS P2.2U · ภาพ 06 ลิ้นชัก "ราคาตามช่องทาง" · จอโปรราคา · ป้ายหน้าขาย/บิล)
//   ตัวแปลงเงิน ↔ ข้อความ · % ↔ bp · ป้ายช่องทางย่อ (ร้าน/LM/Grab/เว็บ) · ข้อความช่วงเวลาโปร · ข้อความค่าโปร · คีย์คำปฏิเสธ · ไอคอน
// 🔴 บริสุทธิ์ (client import ได้): import เฉพาะ price-shared / channel-shared / register-shared (moneyText) — ห้ามแตะโมดูลที่ถึง prisma
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (ST7) — คำทั้งหมดมาจาก t() ที่ผู้เรียกส่งมา

import { PRICE_MAX_SATANG } from "@/lib/modules/pos/pricing-shared";
import { applyPriceRule, channelMarkupBpOf, priceRuleState, type PriceRuleItem, type PriceRuleLike, type PriceSource } from "@/lib/modules/pos/price-shared";
import { moneyText, refusalMessageKey } from "@/lib/modules/pos/register-shared";

export type PT = (key: string, values?: Record<string, string | number>) => string;

/** สตางค์ → ข้อความในช่องกรอก ("75" · "75.5" → "75.50") */
export const satangToInput = (s: number | null | undefined): string => (s === null || s === undefined ? "" : s % 100 === 0 ? String(s / 100) : (s / 100).toFixed(2));

/** ข้อความในช่องกรอกเงิน → สตางค์ · ว่าง = null · ผิดรูป = "bad" · เกินเพดาน = "max" */
export function parseMoneyInput(v: string): number | null | "bad" | "max" {
  const s = v.trim().replace(/,/g, "");
  if (!s) return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return "bad";
  const [b, f = ""] = s.split(".");
  const satang = Number(b) * 100 + Number((f + "00").slice(0, 2));
  return satang > PRICE_MAX_SATANG ? "max" : satang;
}

/** % (1–200 · ทศนิยม ≤ 2) → bp · ผิด = null */
export function parsePctToBp(v: string, min = 1, max = 200): number | null {
  const s = v.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!(n >= min && n <= max)) return null;
  const [b, f = ""] = s.split(".");
  return Number(b) * 100 + Number((f + "00").slice(0, 2));
}
/** bp → "27" / "12.5" */
export const bpText = (bp: number): string => String(Number((bp / 100).toFixed(2)));

/** "+27%" / "−5%" ข้างราคาช่องทาง (ปัดเป็น % เต็ม · 0 หรือฐานว่าง = null) */
export function markupText(price: number | null, base: number | null, tp: PT): string | null {
  const bp = channelMarkupBpOf(price, base);
  if (bp === null) return null;
  const pct = Math.round(bp / 100);
  if (pct === 0) return null;
  return pct > 0 ? tp("markupPct", { pct }) : tp("markupPctMinus", { pct: Math.abs(pct) });
}

/** ป้ายย่อของช่องทาง (คอลัมน์ "ช่องทาง" ภาพ 06): ร้าน · เว็บ · QR · แชท · LM · Grab · ช่องทางอื่น = ชื่อย่อ */
const PRESET_SHORT: Readonly<Record<string, string>> = { LINEMAN: "LM", GRAB: "Grab", SHOPEE: "Shopee", FOODPANDA: "fp", LAZADA: "LZ", TIKTOK: "TT" };
export function channelShort(code: string, name: string, tchip: PT): string {
  if (code === "STORE" || code === "WEB" || code === "QR_TABLE" || code === "CHAT") return tchip(code);
  return PRESET_SHORT[code] ?? (Array.from(name.trim()).slice(0, 6).join("") || code);
}

/**
 * P2.2U fix รอบ 1 F7 (มติเจ้าของ): ชั้นราคาที่ "แสดง" บนป้ายบรรทัดหน้าขาย/หมายเหตุบิล — แถว (STORE, *) ไม่ใช่ "ราคาตามช่องทาง":
 *   (STORE, สาขา) ⇒ BRANCH "ราคาสาขา" · (STORE, ทุกสาขา) ⇒ BASE ไม่มีป้าย (คือราคาปกติของร้าน) · ช่องทางอื่น/ชั้นอื่น = ตามเซิร์ฟเวอร์
 *   บรรทัด quote/บิลไม่พกสาขาของแถวที่ชนะ (ไม่แก้เซิร์ฟเวอร์) ⇒ แยกด้วยราคา: ราคา (ไม่รวมตัวเลือก) = ราคาปกติ หรือไม่รู้ ⇒ BASE · ต่างจากราคาปกติ ⇒ BRANCH
 *   channelCode ว่าง = หน้าร้าน (บิล/ตะกร้าที่ไม่มีช่องทาง)
 */
export function shownPriceSource(
  source: PriceSource | null | undefined,
  channelCode: string | null | undefined,
  priceSatang: number | null | undefined,
  listPriceSatang: number | null | undefined,
): PriceSource | null {
  if (!source) return null;
  if (source !== "CHANNEL" || (channelCode ?? "STORE") !== "STORE") return source;
  return typeof priceSatang === "number" && typeof listPriceSatang === "number" && priceSatang !== listPriceSatang ? "BRANCH" : "BASE";
}

/** "จ.–ศ." / "ทุกวัน" / "ส. อา." — ช่วงวันติดกันย่อเป็นขีด */
export function weekdaysText(days: readonly number[], tr: PT): string {
  const ds = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (!ds.length || ds.length === 7) return tr("everyDay");
  const name = (d: number) => tr(`weekdayShort.d${d}`);
  const runs: number[][] = [];
  for (const d of ds) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === d - 1) last.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length >= 3 ? `${name(r[0]!)}–${name(r[r.length - 1]!)}` : r.map(name).join(" "))).join(" ");
}

/** วันที่ ISO → "10 ต.ค. 2569" ตามเวลาไทย */
export function dateText(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

/**
 * วันสุดท้ายที่รวมของ endsAt (P2.2U fix รอบ 1 F2): endsAt = เที่ยงคืนถัดไป (ไม่รวม) ⇒ แสดง endsAt − 1 มิลลิวินาทีตามเวลาไทย =
 * วันเดียวกับที่ตัวแก้โปรแสดง (bkkDate(…, true)) — ทุกจุดที่แสดง endsAt ใช้ตัวนี้
 */
export function endDateText(iso: string, locale: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? dateText(new Date(ms - 1).toISOString(), locale) : dateText(iso, locale);
}

/** ข้อความช่วงเวลาโปร: "จ.–ศ. 14:00–16:00" (+ ช่วงวันที่ถ้ามี · วันจบ = วันสุดท้ายที่รวม) */
export function ruleWindowText(r: Pick<PriceRuleItem, "weekdays" | "timeFrom" | "timeTo" | "startsAt" | "endsAt">, tr: PT, locale: string): string {
  const parts = [weekdaysText(r.weekdays, tr)];
  if (r.timeFrom && r.timeTo) parts.push(`${r.timeFrom}–${r.timeTo}`);
  if (r.startsAt || r.endsAt) parts.push(`${r.startsAt ? dateText(r.startsAt, locale) : "…"} – ${r.endsAt ? endDateText(r.endsAt, locale) : "…"}`);
  return parts.join(" ");
}

/** ค่าโปร: PRICE "฿59" · PERCENT_OFF "−20%" · AMOUNT_OFF "−฿10" */
export function ruleAdjustText(r: Pick<PriceRuleItem, "adjust" | "valueSatang" | "valueBp">): string {
  if (r.adjust === "PERCENT_OFF") return `−${bpText(r.valueBp ?? 0)}%`;
  if (r.adjust === "AMOUNT_OFF") return `−${moneyText(r.valueSatang ?? 0)}`;
  return moneyText(r.valueSatang ?? 0);
}

/** DTO ของจอ → รูปที่ตัวแก้บริสุทธิ์รับ (createdAt ไม่มีใน DTO — สถานะไม่ใช้) */
export const ruleLike = (r: PriceRuleItem): PriceRuleLike => ({ ...r, archivedAt: r.archived ? "archived" : null, createdAt: "" });
export const ruleStateOf = (r: PriceRuleItem, at: Date) => priceRuleState(ruleLike(r), at);
/** ราคาหลังโปรบนราคา p (ตัวอย่าง "ลาเต้ ฿75 → ฿59") · ค่าโปรผิดรูป = null */
export const rulePriceOn = (r: Pick<PriceRuleItem, "adjust" | "valueSatang" | "valueBp">, p: number): number | null => applyPriceRule(r, p);

/** กติกานี้ครอบสินค้านี้ไหม (สินค้าเอง/แม่ · หมวด) — ไม่ดูเวลา/ช่องทาง/สาขา */
export const ruleTouches = (r: PriceRuleItem, p: { id: string; categoryId: string | null }): boolean =>
  r.productIds.includes(p.id) || (p.categoryId !== null && r.categoryIds.includes(p.categoryId));

/**
 * คำปฏิเสธของจอราคา → ข้อความ: รหัสของจอราคา (pos.price.errors.*) ก่อน · โปรราคา/ช่องทาง = pos.register.errors.* ผ่าน refusalMessageKey ·
 * ไม่รู้จัก = errors.unknown (ไม่แสดง message ไทยของเซิร์ฟเวอร์)
 */
const PRICE_ERR: Readonly<Record<string, string>> = {
  VALIDATION: "errors.validation",
  PERMISSION_DENIED: "errors.permission",
  NOT_FOUND: "errors.notFound",
  BUSY: "errors.busy",
  CONFLICT: "errors.conflict",
  INTERNAL: "errors.unknown",
};
export function priceErrorText(code: string, tp: PT, treg: PT): string {
  if (Object.prototype.hasOwnProperty.call(PRICE_ERR, code)) return tp(PRICE_ERR[code]!);
  const k = refusalMessageKey(code);
  return k === "errors.unknown" ? tp("errors.unknown") : treg(k);
}
/**
 * P2.2U fix รอบ 1 F4: คำปฏิเสธ VALIDATION ของเซิร์ฟเวอร์ที่ไม่ชี้ช่องบนจอ (CatalogError ไม่มี field) ⇒ "ตรวจช่องสีแดง" ไม่มีช่องให้ดู —
 * แสดงข้อความของบริการแทน (errors.serverValidation {message}) · ชี้ช่องได้/รหัสอื่น = priceErrorText เดิม
 */
export function priceRefusalText(r: { code: string; message?: string }, fieldShown: boolean, tp: PT, treg: PT): string {
  if (r.code === "VALIDATION" && !fieldShown) {
    const message = (r.message ?? "").trim();
    return message ? tp("errors.serverValidation", { message }) : tp("errors.unknown");
  }
  return priceErrorText(r.code, tp, treg);
}

// ═══════════ ไอคอน (เส้น · currentColor) ═══════════
const PATHS = {
  tag: (
    <>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0Z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  box: (
    <>
      <path d="m12 3.5 7.5 4v9L12 20.5l-7.5-4v-9Z" />
      <path d="m4.5 7.5 7.5 4 7.5-4M12 11.5v9" />
    </>
  ),
  x: <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  percent: (
    <>
      <path d="M18.5 5.5 5.5 18.5" />
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  archive: (
    <>
      <rect x="4" y="4.5" width="16" height="4.5" rx="1" />
      <path d="M5.5 9v9.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9M10 13h4" />
    </>
  ),
  left: <path d="m14.5 6-6 6 6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
} as const;
export type PriceIconName = keyof typeof PATHS;
export function PriceIcon({ name, size = 16, className }: { name: PriceIconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className ?? ""}`}>
      {PATHS[name]}
    </svg>
  );
}

/** ชิปกรอบเล็กของคอลัมน์ช่องทาง (ภาพ 06 .chn) */
export function ChannelChip({ label }: { label: string }) {
  return <span className="inline-flex h-[18px] items-center whitespace-nowrap rounded-[5px] border bg-[color:var(--color-surface)] px-[5px] text-[10.5px] text-[color:var(--color-ink-soft)]">{label}</span>;
}

/** ชิป "เร็ว ๆ นี้ · P2.3" (ของที่ยังไม่มี) */
export function SoonTag({ text }: { text: string }) {
  return <span className="inline-flex h-5 items-center whitespace-nowrap rounded-full border border-dashed px-2 text-[10.5px] text-[color:var(--color-muted)]">{text}</span>;
}
