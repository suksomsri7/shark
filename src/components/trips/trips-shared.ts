// ─────────────────────────────────────────────────────────────
// trips-shared.ts — ค่าคงที่ + ฟังก์ชันบริสุทธิ์ของจอ TRIPS (RUN TRIPS T1.1 §3 §4.2 §6) — ธรรมเนียมของทุกจอ TRIPS
// 🔴 pure ล้วน: ไม่มี directive · import ได้เฉพาะ `import type` (ทั้งหน้า/คอมโพเนนต์ client/ตัวโหลดใน src/lib/modules/trips ใช้ร่วม)
// ─────────────────────────────────────────────────────────────
import type { TripProductDTO } from "@/lib/modules/trips";

// ═══════════════ แถบนำทาง (ภาพ 11/16/17/18 แถบบน) ═══════════════
export const TRIPS_NAV_KEYS = ["products", "departures", "bookings", "agents", "channels", "settings"] as const;
export type TripsNavKey = (typeof TRIPS_NAV_KEYS)[number];
/** path ต่อท้าย /app/u/<slug> · available = มีหน้าจริงแล้ว · wo = ใบที่สร้าง/จะเปิดหน้า · ป้าย = i18n `trips.nav.<key>` */
export const TRIPS_NAV: readonly { key: TripsNavKey; path: string; available: boolean; wo: string }[] = [
  { key: "products", path: "/trips/products", available: true, wo: "T1.1" },
  { key: "departures", path: "/trips/departures", available: true, wo: "T1.2" },
  { key: "bookings", path: "/trips/bookings", available: true, wo: "T1.3" },
  { key: "agents", path: "/trips/agents", available: false, wo: "A1.2" },
  { key: "channels", path: "/trips/channels", available: false, wo: "W1.1" },
  { key: "settings", path: "/trips/settings", available: true, wo: "T1.1" },
];
export const isTripsNavKey = (v: unknown): v is TripsNavKey => typeof v === "string" && (TRIPS_NAV_KEYS as readonly string[]).includes(v);

export type TripsNavEntry = { key: TripsNavKey; href: string; available: boolean; visible: boolean; wo: string };

// ═══════════════ จอค่าตั้ง (ภาพ 17 เมนูซ้าย · TRIPS-DEFAULTS §1.1–§1.9) ═══════════════
export const TRIPS_SETTINGS_SECTION_KEYS = ["sell", "pay", "cancel", "pax", "tax", "line", "dive", "pdpa", "msg"] as const;
export type TripsSettingsSectionKey = (typeof TRIPS_SETTINGS_SECTION_KEYS)[number];
/** 9 หมวด ครอบทุกกลุ่มของทะเบียน trips ครั้งเดียว · ป้ายไทยของเมนู (กรอบจอ i18n: `trips.settings.sections.<key>`) */
export const TRIPS_SETTINGS_SECTIONS: readonly { key: TripsSettingsSectionKey; labelTh: string; groups: readonly string[] }[] = [
  { key: "sell", labelTh: "ทั่วไปและการขาย", groups: ["general", "fx", "sell", "price", "public", "ops", "supplier"] },
  { key: "pay", labelTh: "เงินและงวดจ่าย", groups: ["pay", "cash"] },
  { key: "cancel", labelTh: "ยกเลิกและคืนเงิน", groups: ["cancel"] },
  { key: "pax", labelTh: "ผู้เดินทาง", groups: ["pax"] },
  { key: "tax", labelTh: "ภาษีและเอกสารเงิน", groups: ["tax", "giftcard", "consumer"] },
  { key: "line", labelTh: "บรรทัดเก็บแทนและค่าอุทยาน", groups: ["line", "parkFee"] },
  { key: "dive", labelTh: "ดำน้ำ เรือ ประกัน ใบอนุญาต", groups: ["dive", "insurance", "license", "prospectus", "marine"] },
  { key: "pdpa", labelTh: "ข้อมูลส่วนบุคคลและเอกสารยินยอม", groups: ["pdpa", "waiver"] },
  { key: "msg", labelTh: "ข้อความแจ้งเตือน", groups: ["msg"] },
];
export const isTripsSettingsSection = (v: unknown): v is TripsSettingsSectionKey => typeof v === "string" && (TRIPS_SETTINGS_SECTION_KEYS as readonly string[]).includes(v);
/** หมวดของกลุ่มทะเบียน (ไม่รู้จัก ⇒ "sell") */
export function sectionOfGroup(group: string): TripsSettingsSectionKey {
  return TRIPS_SETTINGS_SECTIONS.find((s) => s.groups.includes(group))?.key ?? "sell";
}

// ═══════════════ ตัวอย่างราคา "ลูกค้าจะเห็น" (ตัวอย่างจอ 01/18 · ค่าแสดงผล ไม่ใช่ค่าธุรกิจ) ═══════════════
export const TRIPS_PRICE_EXAMPLE_DEFAULT: { pax: Readonly<Record<string, number>>; extraKinds: readonly string[] } = {
  pax: { ADULT: 2, CHILD: 1 },
  extraKinds: ["EQUIPMENT"],
};

// ═══════════════ เงิน ═══════════════
const group3 = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** สตางค์ → "11,450.00" (คณิตจำนวนเต็ม ไม่ผ่านทศนิยม) */
export function formatBaht(satang: number): string {
  if (!Number.isFinite(satang)) return "—";
  const s = Math.trunc(satang);
  const neg = s < 0;
  const abs = Math.abs(s);
  return `${neg ? "-" : ""}${group3(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, "0")}`;
}
/** สตางค์ → "3,500" (มีเศษสตางค์ ⇒ แบบเต็ม) */
export function formatBahtShort(satang: number): string {
  if (!Number.isFinite(satang)) return "—";
  const s = Math.trunc(satang);
  if (s % 100 !== 0) return formatBaht(s);
  return `${s < 0 ? "-" : ""}${group3(Math.abs(s) / 100)}`;
}

// ═══════════════ แก้สินค้า (หนี้ T0.2: updateProduct แทน disclosure/meetingPoint/body ทั้งก้อน) ═══════════════
type I18nText = { th?: string | null; en?: string | null; zh?: string | null };
export type ProductEdits = {
  slug?: string;
  title?: { th: string; en?: string | null };
  body?: { summary?: I18nText; itinerary?: I18nText; includes?: I18nText; photoFileIds?: string[] };
  meetingPoint?: { text?: I18nText; lat?: number; lng?: number };
  disclosure?: { accommodationMeals?: I18nText; guides?: I18nText };
  deepDive?: boolean;
  crossBorder?: boolean;
};
type ProductLike = Pick<TripProductDTO, "id"> & Partial<Pick<TripProductDTO, "body" | "meetingPoint" | "disclosure">>;
/**
 * อินพุตของ updateProduct จากค่าปัจจุบัน + ส่วนที่แก้ — ก้อน body/meetingPoint/disclosure ส่งเต็ม (รวมของเดิม) เพราะ T0.2 แทนทั้งก้อน
 * ส่งเฉพาะฟิลด์ที่ zod ของ T0.2 รับ · ไม่มี tenantId/unitId จากฟอร์ม (OQ18 · action ใส่ unitId จาก slug ของหน้า)
 */
export function productUpdatePayload(current: ProductLike, edits: ProductEdits): Record<string, unknown> {
  const out: Record<string, unknown> = { productId: current.id };
  if (edits.slug !== undefined) out.slug = edits.slug;
  if (edits.title !== undefined) out.title = edits.title;
  if (edits.deepDive !== undefined) out.deepDive = edits.deepDive;
  if (edits.crossBorder !== undefined) out.crossBorder = edits.crossBorder;
  if (edits.body !== undefined) out.body = { ...(current.body ?? {}), ...edits.body };
  if (edits.disclosure !== undefined) out.disclosure = { ...(current.disclosure ?? {}), ...edits.disclosure };
  if (edits.meetingPoint !== undefined) {
    const cur = current.meetingPoint ?? { text: {} };
    out.meetingPoint = { ...cur, ...edits.meetingPoint, text: edits.meetingPoint.text ?? cur.text };
  }
  return out;
}

// ═══════════════ ป้ายจอสินค้า ═══════════════
// ป้ายทุกตัวอยู่ใน messages trips.json (ไทย/อังกฤษ) — ไฟล์นี้มีแค่รายการรหัส
export const EXTRA_BASIS_CODES = ["PER_PAX", "PER_BOOKING", "PER_DAY", "PER_PAX_DAY", "PER_BOAT_NIGHT"] as const;
export const EXTRA_KIND_CODES = ["PARK_FEE", "PORT_FEE", "FUEL", "EQUIPMENT", "NITROX", "TRANSFER", "COURSE", "INSURANCE", "OTHER"] as const;

export type DateNames = { weekdays: readonly string[]; months: readonly string[]; yearOffset: number };
/**
 * วันที่ YYYY-MM-DD → "ส. 14 พ.ย. 2569" / "Sat 14 Nov 2026" ตามชื่อจาก messages (ปีบวก yearOffset)
 * วันในสัปดาห์คิดจาก UTC ของวันที่ล้วน (ไม่ใช้ getDay ดิบของเวลาเครื่อง)
 */
export function formatYmd(ymd: string, names: DateNames, withWeekday = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${withWeekday ? `${names.weekdays[wd] ?? ""} ` : ""}${d} ${names.months[mo - 1] ?? mo} ${y + names.yearOffset}`;
}

// ═══════════════ จอค่าตั้ง: ขั้นบันไดคืนเงินเป็นช่อง (ภาพ 17 "100% 30 วันขึ้นไป / 50% 15–29 วัน / 0% น้อยกว่า 15 วัน") ═══════════════
export type LadderTier = { pct: number; from: number; to: number | null };
/** ขั้นบันได [{fromDaysBefore, refundPct}] → ช่วงวันของแต่ละขั้น (เรียงวันมาก→น้อย · ขั้นแรกไม่มีเพดาน) · รูปผิด ⇒ null */
export function ladderTiers(value: unknown): LadderTier[] | null {
  if (!Array.isArray(value)) return null;
  const rows: { from: number; pct: number }[] = [];
  for (const x of value) {
    if (typeof x !== "object" || x === null) return null;
    const r = x as { fromDaysBefore?: unknown; refundPct?: unknown };
    if (typeof r.fromDaysBefore !== "number" || typeof r.refundPct !== "number") return null;
    rows.push({ from: r.fromDaysBefore, pct: r.refundPct });
  }
  rows.sort((a, b) => b.from - a.from);
  return rows.map((r, i) => ({ pct: r.pct, from: r.from, to: i === 0 ? null : rows[i - 1].from - 1 }));
}
