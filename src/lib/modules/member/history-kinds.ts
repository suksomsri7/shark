// history-kinds.ts — ทะเบียน "ชนิด" ของไทม์ไลน์ประวัติสมาชิก (M3.7 · พิมพ์เขียว §4.3 §8 · ภาพ 08 ซ้าย/กลาง)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma · ไม่ import โมดูลอื่น · ไม่มี next — ใช้ได้ทั้ง server (history.ts)
//    และ client component (`MemberHistory.tsx`) ⇒ ชนิดข้อมูลที่หน้าจอใช้ (DTO) อยู่ที่นี่ด้วย
//    (บทเรียน M3.1: 'use client' ที่ import ไฟล์ซึ่งลากถึง prisma = next build พังทั้งที่ tsc ผ่าน)
//
// ชนิด (kind) = ชิปกรองบนหน้าจอ 9 ตัว ตามลำดับภาพ 08 · แถว MemberActivity 1 แถว → kind เดียวเสมอ (`kindOf`)
//   ตัดสินจาก `type` ก่อน (ระดับ = แถว module "member" แต่เป็นชิปของตัวเอง) แล้วค่อย `module`
//   ไม่รู้จัก → "profile" (ไม่ throw — โมดูลใหม่ที่เขียนไทม์ไลน์ก่อนมาลงทะเบียนต้องไม่ทำหน้าพัง
//   และตัวนับต่อชิปต้องรวมกันได้เท่ากับ "ทั้งหมด" เสมอ)

export const HISTORY_KIND_KEYS = ["purchase", "booking", "chat", "document", "tier", "loyalty", "task", "review", "profile"] as const;
export type HistoryKindKey = (typeof HISTORY_KIND_KEYS)[number];
export type HistoryKindFilter = HistoryKindKey | "all";

/** โทนสีของไอคอน/จุดตามชนิด — หน้าจอแปลงเป็น CSS token (`--color-tag-*`) ห้ามพิมพ์ hex */
export type HistoryTone = "blue" | "green" | "slate" | "amber" | "red" | "purple";

export type HistoryKindDef = {
  key: HistoryKindKey;
  label: string;
  /** โมดูลต้นทางของแถวที่นับเป็นชนิดนี้ */
  modules: readonly string[];
  /** ชนิดเหตุการณ์ที่นับเป็นชนิดนี้ไม่ว่ามาจากโมดูลไหน (ตัดสินก่อน modules) */
  types?: readonly string[];
  /** ชื่อไอคอนใน `MemberIcon` */
  icon: string;
  tone: HistoryTone;
};

/**
 * 9 ชนิดตามลำดับชิปของภาพ 08
 * • ซื้อ: POS (บิลหน้าร้าน + ออเดอร์ออนไลน์ refType ShopOrder) · ร้านอาหาร (ปิดโต๊ะไม่ผ่าน POS) · ดีล CRM ที่ปิดได้ (DEAL_WON)
 * • เอกสาร: แถวจากโมดูลบัญชี + เอกสารที่อ่านผ่าน (read-through) `account.listDocsByParty`
 * • งาน: การ์ดบอร์ดงานที่ปิดแล้ว (แถว) + การ์ดที่ยังเปิดอยู่ (read-through `listCardsForTarget`)
 */
export const HISTORY_KINDS: readonly HistoryKindDef[] = Object.freeze([
  { key: "purchase", label: "ซื้อ", modules: ["pos", "restaurant", "crm"], icon: "card", tone: "blue" },
  { key: "booking", label: "จอง", modules: ["booking"], icon: "date", tone: "green" },
  { key: "chat", label: "แชท", modules: ["chat"], icon: "chat", tone: "slate" },
  { key: "document", label: "เอกสาร", modules: ["account"], icon: "doc", tone: "slate" },
  { key: "tier", label: "ระดับ", modules: [], types: ["TIER_CHANGED", "SET_TIER"], icon: "crown", tone: "amber" },
  { key: "loyalty", label: "แต้ม/สิทธิ์", modules: ["point", "voucher", "stamp", "reward", "giftcard", "wallet"], icon: "gift", tone: "purple" },
  { key: "task", label: "งาน", modules: ["kanban"], icon: "check", tone: "purple" },
  { key: "review", label: "รีวิว/แนะนำ", modules: ["review", "referral"], icon: "star", tone: "amber" },
  { key: "profile", label: "โปรไฟล์", modules: ["member"], icon: "person", tone: "slate" },
] satisfies HistoryKindDef[]);

const BY_KEY = new Map<string, HistoryKindDef>(HISTORY_KINDS.map((k) => [k.key, k]));

export function isHistoryKind(x: string): x is HistoryKindKey {
  return BY_KEY.has(x);
}

export function historyKindDef(key: string): HistoryKindDef {
  return BY_KEY.get(key) ?? (BY_KEY.get("profile") as HistoryKindDef);
}

/** แถวไทม์ไลน์ → ชนิด (ไม่รู้จัก = "profile" · ไม่ throw) */
export function kindOf(row: { module: string; type: string }): HistoryKindKey {
  for (const k of HISTORY_KINDS) if (k.types?.includes(row.type)) return k.key;
  for (const k of HISTORY_KINDS) if (k.modules.includes(row.module)) return k.key;
  return "profile";
}

/** เหตุการณ์ "เชิงลบ" ได้จุดสีแดงแทนสีของชนิด (ภาพ 08: ไม่มาตามนัด · แต้มหมดอายุ) */
const RED_TYPES = new Set(["NO_SHOW", "POINTS_EXPIRED", "PURCHASE_VOIDED", "VOID", "VOUCHER_EXPIRED", "STAMP_EXPIRED"]);

export function toneOf(row: { module: string; type: string }): HistoryTone {
  if (RED_TYPES.has(row.type)) return "red";
  if (row.module === "referral") return "green";
  return historyKindDef(kindOf(row)).tone;
}

/** ไอคอนต่อแถว — เหตุการณ์เชิงลบใช้ไอคอนเตือน/นาฬิกาแบบภาพ 08 ที่เหลือใช้ไอคอนของชนิด */
export function iconOf(row: { module: string; type: string }): string {
  if (row.type === "NO_SHOW" || row.type === "PURCHASE_VOIDED" || row.type === "VOID") return "warn";
  if (row.type === "POINTS_EXPIRED") return "clock";
  if (row.module === "referral") return "users";
  return historyKindDef(kindOf(row)).icon;
}

/**
 * ชื่อช่องทางแบบที่ลูกค้า/พนักงานเรียกจริงบนไทม์ไลน์ ("แชท LINE" · "ซื้อออนไลน์ Shopee" — ภาพ 08)
 * 🔴 ไม่ใช่ป้ายของทะเบียนกลาง (`core/channels` ใช้ "ไลน์"/"ช้อปปี้" สำหรับหน้าตั้งค่า) — ชื่อแบรนด์บนไทม์ไลน์
 *    ต้องตรงกับที่ลูกค้าเห็นในแอปของเขา · ไม่รู้จัก = คืน key เดิม
 */
const CHANNEL_DISPLAY: Readonly<Record<string, string>> = Object.freeze({
  LINE: "LINE",
  WEBCHAT: "แชทหน้าเว็บ",
  APP: "แอปมือถือ",
  FACEBOOK: "Facebook",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  WECHAT: "WeChat",
  EMAIL: "อีเมล",
  SMS: "SMS",
  PHONE: "โทรศัพท์",
  SHOPEE: "Shopee",
  LAZADA: "Lazada",
  TIKTOK: "TikTok Shop",
  TIKTOK_SHOP: "TikTok Shop",
  SHOP: "ร้านออนไลน์",
});

export function channelDisplayName(key: string): string {
  const k = String(key ?? "").trim().toUpperCase();
  return CHANNEL_DISPLAY[k] ?? (k || "แชท");
}

// ───────────────────────── DTO ที่หน้าจอใช้ (ส่งผ่าน server action) ─────────────────────────

/** ช่วงเวลาสำเร็จรูปของตัวกรอง (ภาพ 08 "90 วันล่าสุด") — `all` = ไม่จำกัด */
export const HISTORY_RANGES = [
  { key: "7", label: "7 วันล่าสุด", days: 7 },
  { key: "30", label: "30 วันล่าสุด", days: 30 },
  { key: "90", label: "90 วันล่าสุด", days: 90 },
  { key: "365", label: "1 ปีล่าสุด", days: 365 },
  { key: "all", label: "ทุกช่วงเวลา", days: null },
] as const;
export type HistoryRangeKey = (typeof HISTORY_RANGES)[number]["key"];
export const HISTORY_DEFAULT_RANGE: HistoryRangeKey = "90";

export function isHistoryRange(x: string): x is HistoryRangeKey {
  return HISTORY_RANGES.some((r) => r.key === x);
}

/** ช่วงสำเร็จรูป → วันเริ่ม (null = ไม่จำกัด) — นับจาก "ตอนนี้" ย้อนหลัง n×24 ชม. */
export function historyRangeFrom(key: string, now: Date = new Date()): Date | null {
  const r = HISTORY_RANGES.find((x) => x.key === key);
  if (!r || r.days === null) return null;
  return new Date(now.getTime() - r.days * 86_400_000);
}

/** จำนวนแถวต่อหน้าของแท็บประวัติ (หน้าแรก + ทุกครั้งที่กด "โหลดเพิ่ม") */
export const HISTORY_PAGE_SIZE = 20;

export type HistoryCounts = Record<"all" | HistoryKindKey, number>;

export function emptyHistoryCounts(): HistoryCounts {
  return { all: 0, purchase: 0, booking: 0, chat: 0, document: 0, tier: 0, loyalty: 0, task: 0, review: 0, profile: 0 };
}

/** แถวไทม์ไลน์สำหรับหน้าจอ (เวลาเป็น ISO string — ข้าม server action ได้ไม่เพี้ยน) */
export type HistoryRowView = {
  id: string;
  at: string;
  kind: HistoryKindKey;
  module: string;
  type: string;
  title: string;
  summary: string;
  /** ป้ายสั้นต่อท้ายหัวเรื่อง (เช่น "มาแล้ว" · "ร่าง") — null = ไม่มี */
  badge: string | null;
  href: string | null;
  unitName: string | null;
  actorName: string | null;
};

export type HistoryPageView = {
  items: HistoryRowView[];
  nextCursor: string | null;
  counts: HistoryCounts;
};

export type HistoryUnitOption = { id: string; name: string };

export type HistoryActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };
