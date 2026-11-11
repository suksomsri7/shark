// chat-link-shared.ts — POS ↔ แชท (P3.7 S · R3 R6 R9 R11 · มติผู้คุม 1 4 5 6) — ไฟล์บริสุทธิ์ (ไม่ถึง prisma/เครือข่าย · client import ได้)
//
// 🔴 ตัวอ่านค่าตั้งเดียวของ settings.pos.chat (ผู้อ่าน "อ่านผ่อน" — ค่าแปลกถูกตัดขอบ/ตกค่าปริยาย · ผู้เขียน setPosChatSettings "ตรวจเข้ม" = VALIDATION · CD-P8)
//    ค่าปริยาย = ปิดทุกสวิตช์ (มติ 4: ส่งข้อความใช้โควตา LINE OA ของร้าน — เจ้าของร้านเปิดเอง)
// 🔴 บอทตามกฎเท่านั้น (มติ 5): STATUS / ORDER / HUMAN จากคำสำคัญ th+en · ไม่ตรง = เงียบ (ทีมตอบเองเหมือนเดิม) · ไม่มี LLM
// 🔴 ข้อความตายตัว th/en (มติ 6 · เลือกตาม ChatContact.lang · ปริยาย th) — ห้ามมีเบอร์/ชื่อลูกค้า/ที่อยู่ (R10): มีแค่รหัสออเดอร์ · ยอด · เวลา · ลิงก์
import { moneyText } from "./register-shared";

export const POS_CHAT_STATUS_KINDS = ["accepted", "ready", "cancelled", "paid"] as const;
export type PosChatStatusKind = (typeof POS_CHAT_STATUS_KINDS)[number];
export const POS_CHAT_PAUSE_HOURS = { min: 1, max: 72, default: 24 } as const;
export const POS_CHAT_SWITCHES = ["receiptAuto", "refundNotice", "orderStatus", "autoReply"] as const;
export type PosChatSwitch = (typeof POS_CHAT_SWITCHES)[number];
export const POS_CHAT_SETTING_KEYS = [...POS_CHAT_SWITCHES, "statusKinds", "botPauseHours"] as const;

export type PosChatSettings = {
  receiptAuto: boolean;
  refundNotice: boolean;
  orderStatus: boolean;
  autoReply: boolean;
  statusKinds: PosChatStatusKind[];
  botPauseHours: number;
};
export const POS_CHAT_DEFAULTS: PosChatSettings = Object.freeze({
  receiptAuto: false,
  refundNotice: false,
  orderStatus: false,
  autoReply: false,
  statusKinds: [...POS_CHAT_STATUS_KINDS],
  botPauseHours: POS_CHAT_PAUSE_HOURS.default,
}) as PosChatSettings;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isKind = (v: unknown): v is PosChatStatusKind => typeof v === "string" && (POS_CHAT_STATUS_KINDS as readonly string[]).includes(v);

/** ค่าตั้งแชทของระบบ POS (AppSystem.settings ทั้งก้อน) — ไม่ใช่ true = false · ชั่วโมงพักบอทเป็นจำนวนเต็ม 1–72 (ไม่ใช่ตัวเลข = 24) · ชนิดสถานะกรอง/ไม่ซ้ำ */
export function posChatSettings(settings: unknown): PosChatSettings {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const c = pos && isRecord(pos.chat) ? pos.chat : {};
  const hoursRaw = c.botPauseHours;
  const hours =
    typeof hoursRaw === "number" && Number.isFinite(hoursRaw) ? Math.min(POS_CHAT_PAUSE_HOURS.max, Math.max(POS_CHAT_PAUSE_HOURS.min, Math.trunc(hoursRaw))) : POS_CHAT_PAUSE_HOURS.default;
  const kinds = Array.isArray(c.statusKinds) ? [...new Set(c.statusKinds.filter(isKind))] : [...POS_CHAT_STATUS_KINDS];
  return {
    receiptAuto: c.receiptAuto === true,
    refundNotice: c.refundNotice === true,
    orderStatus: c.orderStatus === true,
    autoReply: c.autoReply === true,
    statusKinds: kinds,
    botPauseHours: hours,
  };
}

/** ตรวจ patch ของผู้เขียน (เข้ม): คีย์แปลก · สวิตช์ไม่ใช่ boolean · ชั่วโมงไม่ใช่จำนวนเต็ม 1–72 · ชนิดสถานะแปลก/ไม่ใช่ array = ปฏิเสธ (field) */
export function parsePosChatPatch(patch: unknown): { ok: true; clean: Partial<PosChatSettings> } | { ok: false; field: string } {
  if (!isRecord(patch)) return { ok: false, field: "patch" };
  const clean: Partial<PosChatSettings> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if ((POS_CHAT_SWITCHES as readonly string[]).includes(k)) {
      if (typeof v !== "boolean") return { ok: false, field: k };
      clean[k as PosChatSwitch] = v;
    } else if (k === "botPauseHours") {
      if (typeof v !== "number" || !Number.isInteger(v) || v < POS_CHAT_PAUSE_HOURS.min || v > POS_CHAT_PAUSE_HOURS.max) return { ok: false, field: k };
      clean.botPauseHours = v;
    } else if (k === "statusKinds") {
      if (!Array.isArray(v) || v.length > POS_CHAT_STATUS_KINDS.length * 2 || !v.every(isKind)) return { ok: false, field: k };
      clean.statusKinds = [...new Set(v)];
    } else return { ok: false, field: k };
  }
  return { ok: true, clean };
}

// ═══════════ บอทตามกฎ (R9 · มติ 5) ═══════════
export type PosBotIntent = "STATUS" | "ORDER" | "HUMAN";
/** รหัสออเดอร์ (OD-0012) — ตรงเมื่อไหร่ = STATUS (ค้นเฉพาะออเดอร์ของห้องนี้ ไม่ค้นจากรหัสที่พิมพ์) */
export const POS_BOT_ORDER_CODE_RE = /\b[A-Za-z]{2,4}-\d{3,6}\b/;
const STATUS_WORDS = ["สถานะ", "ออเดอร์", "ถึงไหน", "ได้ยัง", "เสร็จยัง", "order", "status", "where is my"];
const ORDER_WORDS = ["สั่ง", "เมนู", "menu"];
const HUMAN_WORDS = ["พนักงาน", "คุยกับคน", "แอดมิน", "เจ้าหน้าที่", "staff", "human", "agent", "admin"];
/** เจตนาของข้อความลูกค้า (ลำดับ STATUS > ORDER > HUMAN · ไม่ตรง = null) */
export function matchBotIntent(text: unknown): PosBotIntent | null {
  if (typeof text !== "string") return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (STATUS_WORDS.some((w) => t.includes(w)) || POS_BOT_ORDER_CODE_RE.test(t)) return "STATUS";
  if (ORDER_WORDS.some((w) => t.includes(w))) return "ORDER";
  if (HUMAN_WORDS.some((w) => t.includes(w))) return "HUMAN";
  return null;
}

// ═══════════ ข้อความตายตัว (มติ 6 · R6 R7 R9) — {ตัวแปร} แทนค่าด้วย chatText ═══════════
export type PosChatLang = "th" | "en";
export const POS_CHAT_TEXTS = {
  th: {
    accepted: "ร้านรับออเดอร์ {code} แล้ว · พร้อมประมาณ {time}",
    ready: "ออเดอร์ {code} พร้อมรับที่ร้านแล้ว",
    paid: "ได้รับเงิน {amount} สำหรับออเดอร์ {code} แล้ว",
    cancelled: "ออเดอร์ {code} ถูกยกเลิก ({reason})",
    refundLine: "ร้านจะติดต่อเรื่องคืนเงินให้",
    expired: "ออเดอร์ {code} หมดเวลาชำระแล้ว — สั่งใหม่ได้ทุกเมื่อ",
    payRequest: "ยอด {amount} · ชำระด้วย PromptPay ภายใน {time}",
    refundNotice: "คืนเงิน {amount} ของใบเสร็จ {receiptNo} · ใบลดหนี้: {url}",
    botStatus: "ออเดอร์ล่าสุดของคุณ",
    botNotFound: "ไม่พบออเดอร์ที่ผูกกับแชทนี้ — พิมพ์ \"พนักงาน\" เพื่อคุยกับทีม",
    botHandoff: "ส่งต่อให้ทีมแล้ว — เจ้าหน้าที่จะตอบกลับในแชทนี้",
    botOrderLink: "สั่งและชำระล่วงหน้าได้ที่ลิงก์นี้ (ออเดอร์จะผูกกับแชทนี้): {url}",
    botOrderClosed: "ตอนนี้ร้านยังไม่เปิดรับออเดอร์ออนไลน์ — พิมพ์ \"พนักงาน\" เพื่อคุยกับทีม",
    eta: "พร้อมประมาณ {time}",
  },
  en: {
    accepted: "We accepted order {code} · ready around {time}",
    ready: "Order {code} is ready for pickup",
    paid: "Payment of {amount} received for order {code}",
    cancelled: "Order {code} was cancelled ({reason})",
    refundLine: "The shop will contact you about the refund",
    expired: "Order {code} expired before payment — feel free to order again",
    payRequest: "Total {amount} · pay with PromptPay by {time}",
    refundNotice: "Refund of {amount} for receipt {receiptNo} · credit note: {url}",
    botStatus: "Your latest orders",
    botNotFound: "No order is linked to this chat — type \"staff\" to talk to our team",
    botHandoff: "Passed to our team — someone will reply in this chat",
    botOrderLink: "Order and pay ahead here (the order is linked to this chat): {url}",
    botOrderClosed: "Online ordering is closed right now — type \"staff\" to talk to our team",
    eta: "ready around {time}",
  },
} as const;
export type PosChatTextKey = keyof (typeof POS_CHAT_TEXTS)["th"];

/** ป้ายสถานะออเดอร์ของคำตอบบอท (ไม่ใช่สถานะภายใน) */
export const POS_CHAT_STATUS_LABELS: Record<PosChatLang, Record<string, string>> = {
  th: { NEW: "รอร้านรับ", PENDING_PAYMENT: "รอชำระเงิน", ACCEPTED: "ร้านรับแล้ว", PREPARING: "กำลังเตรียม", READY: "พร้อมรับ", HANDED: "รับแล้ว", REJECTED: "ยกเลิก", CANCELLED: "ยกเลิก" },
  en: { NEW: "waiting for the shop", PENDING_PAYMENT: "waiting for payment", ACCEPTED: "accepted", PREPARING: "preparing", READY: "ready for pickup", HANDED: "picked up", REJECTED: "cancelled", CANCELLED: "cancelled" },
};
/** ป้ายเหตุที่ยกเลิก/ปฏิเสธ (รหัสเท่านั้น — หมายเหตุอิสระของพนักงานไม่ถูกส่งถึงลูกค้า) */
export const POS_CHAT_REASON_LABELS: Record<PosChatLang, Record<string, string>> = {
  th: { OUT_OF_STOCK: "ของหมด", CLOSING: "ใกล้ปิดร้าน", TOO_BUSY: "ร้านมีออเดอร์เยอะ", OTHER: "เหตุผลอื่น", PREPAID_NOT_ACCEPTED: "ร้านรับออเดอร์ไม่ทัน", DEFAULT: "ร้านยกเลิก" },
  en: { OUT_OF_STOCK: "out of stock", CLOSING: "closing soon", TOO_BUSY: "too busy", OTHER: "other reason", PREPAID_NOT_ACCEPTED: "the shop could not accept it in time", DEFAULT: "cancelled by the shop" },
};

export const posChatLang = (lang: unknown): PosChatLang => (typeof lang === "string" && lang.trim().toLowerCase().startsWith("en") ? "en" : "th");
/** ข้อความตามภาษา + แทนค่า {ตัวแปร} (ตัวแปรที่ไม่ได้ส่ง = ว่าง) */
export function chatText(lang: unknown, key: PosChatTextKey, vars: Record<string, string | number | null | undefined> = {}): string {
  const tpl: string = POS_CHAT_TEXTS[posChatLang(lang)][key];
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k])));
}
/** เวลาไทย HH:mm (Asia/Bangkok · ไม่มีเวลาออมแสง) */
export function bangkokHHmm(d: Date | string | number): string {
  const x = new Date(new Date(d).getTime() + 7 * 3_600_000);
  return `${String(x.getUTCHours()).padStart(2, "0")}:${String(x.getUTCMinutes()).padStart(2, "0")}`;
}
export const chatMoney = (satang: number): string => moneyText(satang);
/** ต่อท้ายลิงก์หน้าสถานะ (ถ้ามี) */
export const withStatusLink = (text: string, url: string | null | undefined): string => (url ? `${text}\n${url}` : text);
/** ป้ายเหตุยกเลิกจาก rejectReason ("<รหัส>[: หมายเหตุ]") */
export function chatReasonLabel(lang: unknown, rejectReason: string | null | undefined): string {
  const code = typeof rejectReason === "string" ? rejectReason.split(":")[0]!.trim() : "";
  const map = POS_CHAT_REASON_LABELS[posChatLang(lang)];
  return map[code] ?? map.DEFAULT!;
}
