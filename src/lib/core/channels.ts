// ทะเบียนช่องทางกลาง (D19 · พิมพ์เขียว docs/modules/06-member-v2.md §9.6)
//
// 🔴 ทำไมเป็น "ทะเบียนข้อความ" ไม่ใช่ enum ของ Prisma:
//    ระบบสมาชิกอ้างช่องทางอยู่ 6 ที่ (ตัวตนหลายช่องทาง · ยินยอม · ที่มา · แคมเปญ · แจ้งเตือน · segment)
//    ถ้าเป็น enum การเพิ่ม "WeChat" ครั้งเดียวต้องทำ migration + แก้ 6 ตาราง + ฟรีซ prod ระหว่างดีพลอย
//    ⇒ เก็บเป็น `String` ที่ **ตรวจกับทะเบียนไฟล์นี้** แทน — เพิ่มช่องทางใหม่ = แก้ไฟล์เดียว
//    (การเชื่อมต่อจริง/adapter รับ-ส่งข้อความ เป็นงานของโมดูลแชท/อีคอมเมิร์ซ ไม่ใช่ของไฟล์นี้)
//
// 🔴 ไฟล์นี้ต้อง "บริสุทธิ์": ห้าม import prisma · โมดูลอื่น · next · ชนิดที่ Prisma สร้าง
//    เพราะถูกเรียกจากทั้งฝั่ง server, ฝั่ง client และจากสคริปต์ fitness ที่รันโดยไม่มี env เลย
//    (บทเรียน `reference_shark_precommit_fitness_no_env` — ทะเบียนที่ import ถึง lib/env = fitness ตาย)

/** จำแนกชนิดช่องทาง — ใช้ตัดสินว่า UI จัดกลุ่มยังไง และใครเป็นเจ้าของ adapter */
export type ChannelKind =
  /** กล่องแชทสองทาง (โมดูลแชทเป็นเจ้าของ adapter) */
  | "CHAT"
  /** ส่งข้อความหาลูกค้าเป็นหลัก ไม่ใช่ห้องสนทนาต่อเนื่อง */
  | "MESSAGING"
  /** ตลาดออนไลน์ — มีทั้งแชทและ "คำสั่งซื้อ" (ShopOrder → shop.order.paid) */
  | "MARKETPLACE"
  /** ช่องทางติดต่อตรงที่ร้านรู้ตัวตนอยู่แล้ว (เบอร์/อีเมล/อุปกรณ์) */
  | "DIRECT";

/** รายชื่อ key ตามลำดับที่แสดงผล — แหล่งความจริงเดียวของ "ช่องทางมีอะไรบ้าง" */
export const CHANNEL_KEY_LIST = [
  "LINE", "WEBCHAT", "APP", "FACEBOOK", "INSTAGRAM", "MESSENGER", "WHATSAPP", "WECHAT",
  "EMAIL", "SMS", "PHONE", "PUSH", "SHOPEE", "LAZADA", "TIKTOK_SHOP",
] as const;

/** key ของช่องทางที่อยู่ในทะเบียน */
export type ChannelKey = (typeof CHANNEL_KEY_LIST)[number];

export type ChannelDef = {
  /** key ที่เก็บลง DB (MemberConsent.channel · MemberChannelIdentity.channel · Customer.sourceChannel) */
  key: ChannelKey;
  /** ป้ายไทยที่ผู้ใช้เห็น (ห้ามโชว์ key ดิบบนจอ) */
  label: string;
  kind: ChannelKind;
  /** ขอความยินยอมทางช่องทางนี้ได้ไหม (MemberConsent จะรับเฉพาะ key ที่ true) */
  canConsent: boolean;
  /** ส่งการแจ้งเตือน/แคมเปญออกทางช่องทางนี้ได้ไหม */
  canNotify: boolean;
  /** ไอคอนสำหรับ UI (อีโมจิ — ไม่ใช้ในเนื้อความที่ผู้ใช้อ่าน) */
  icon?: string;
};

/**
 * ทะเบียน 15 ช่องทาง (D19)
 *
 * เกณฑ์ที่ใช้ตัดสิน `kind`
 * - CHAT        = มีห้องสนทนาสองทางในกล่องแชทของ SHARK (LINE/WEBCHAT/APP/Meta/WhatsApp/WeChat)
 * - MARKETPLACE = SHOPEE/LAZADA/TIKTOK_SHOP — มี "คำสั่งซื้อ" เป็นแกน แชทเป็นของแถม
 *                 (ที่มาของสมาชิกจากช่องนี้ = MemberSource.MARKETPLACE + sourceChannel = key)
 * - DIRECT      = EMAIL/SMS/PHONE — ร้านรู้ที่อยู่ติดต่อของลูกค้าเองอยู่แล้ว ไม่ต้องมีบัญชีแพลตฟอร์ม
 * - MESSAGING   = PUSH — ส่งออกทางเดียวถึงอุปกรณ์ที่ลงทะเบียนไว้ ไม่ใช่ที่อยู่ติดต่อของคน
 *                 และไม่ใช่ห้องสนทนา จึงไม่เข้าทั้ง CHAT และ DIRECT
 *
 * เกณฑ์ `canConsent` = "ลูกค้ากดยินยอมรับข่าวสารทางช่องทางนี้ได้จริง"
 *   ⇒ LINE/EMAIL/SMS/PUSH = true (ช่องทางที่ส่งออกได้จริงวันนี้ ⇒ canNotify = true ด้วย)
 *   ⇒ PHONE = true แต่ canNotify = false — "ยอมให้โทรหา" เป็นความยินยอมที่ร้านต้องเก็บตามกฎหมาย
 *     แต่ระบบไม่ได้ "ส่ง" อะไรออกไปเอง (คนโทร ไม่ใช่เครื่อง)
 *   ⇒ ที่เหลือ false: ตอบกลับได้เฉพาะในหน้าต่างสนทนาที่ลูกค้าเปิดเอง (ไม่ใช่การส่งข่าวสาร)
 */
export const CHANNELS: ChannelDef[] = [
  { key: "LINE", label: "ไลน์", kind: "CHAT", canConsent: true, canNotify: true, icon: "💚" },
  { key: "WEBCHAT", label: "แชทหน้าเว็บ", kind: "CHAT", canConsent: false, canNotify: false, icon: "💬" },
  { key: "APP", label: "แอปมือถือ", kind: "CHAT", canConsent: false, canNotify: false, icon: "📱" },
  { key: "FACEBOOK", label: "เฟซบุ๊ก", kind: "CHAT", canConsent: false, canNotify: false, icon: "📘" },
  { key: "INSTAGRAM", label: "อินสตาแกรม", kind: "CHAT", canConsent: false, canNotify: false, icon: "📸" },
  { key: "MESSENGER", label: "เมสเซนเจอร์", kind: "CHAT", canConsent: false, canNotify: false, icon: "✉️" },
  { key: "WHATSAPP", label: "วอทส์แอป", kind: "CHAT", canConsent: false, canNotify: false, icon: "🟢" },
  { key: "WECHAT", label: "วีแชท", kind: "CHAT", canConsent: false, canNotify: false, icon: "🐉" },
  { key: "EMAIL", label: "อีเมล", kind: "DIRECT", canConsent: true, canNotify: true, icon: "📧" },
  { key: "SMS", label: "เอสเอ็มเอส", kind: "DIRECT", canConsent: true, canNotify: true, icon: "📨" },
  { key: "PHONE", label: "โทรศัพท์", kind: "DIRECT", canConsent: true, canNotify: false, icon: "📞" },
  { key: "PUSH", label: "แจ้งเตือนในแอป", kind: "MESSAGING", canConsent: true, canNotify: true, icon: "🔔" },
  { key: "SHOPEE", label: "ช้อปปี้", kind: "MARKETPLACE", canConsent: false, canNotify: false, icon: "🛒" },
  { key: "LAZADA", label: "ลาซาด้า", kind: "MARKETPLACE", canConsent: false, canNotify: false, icon: "🛍️" },
  { key: "TIKTOK_SHOP", label: "ติ๊กต็อกช็อป", kind: "MARKETPLACE", canConsent: false, canNotify: false, icon: "🎵" },
];

const BY_KEY = new Map<string, ChannelDef>(CHANNELS.map((c) => [c.key, c]));

/** type guard — ใช้ก่อนเขียนค่าลง DB ทุกครั้ง (fail-closed: ไม่รู้จัก = ปฏิเสธ) */
export function isChannelKey(x: string): x is ChannelKey {
  return BY_KEY.has(x);
}

/** คืนนิยามของช่องทาง · undefined = ไม่มีในทะเบียน */
export function getChannel(key: string): ChannelDef | undefined {
  return BY_KEY.get(key);
}

/** key ทั้งหมดตามลำดับในทะเบียน */
export function channelKeys(): ChannelKey[] {
  return CHANNELS.map((c) => c.key);
}

/** ช่องทางที่ขอความยินยอมได้ (ตัวเลือกในหน้า "ความยินยอม" ของสมาชิก) */
export function consentChannels(): ChannelDef[] {
  return CHANNELS.filter((c) => c.canConsent);
}

/** ช่องทางที่ส่งข้อความออกได้ (ตัวเลือกของแคมเปญ/แจ้งเตือน) */
export function notifyChannels(): ChannelDef[] {
  return CHANNELS.filter((c) => c.canNotify);
}

/**
 * แปลงค่า enum `ChatChannelType` ของโมดูลแชท → key ทะเบียนกลาง
 *
 * 🔴 เขียนเป็นตารางข้อความล้วน ไม่ import ชนิด enum ที่ Prisma สร้าง — ไฟล์นี้ต้องบริสุทธิ์
 *    (ครบทุกค่าของ enum ณ M1.1: WEBCHAT LINE FACEBOOK INSTAGRAM SHOPEE LAZADA WHATSAPP APP TIKTOK)
 * 🔴 `TIKTOK` ฝั่งแชท = ร้านบนติ๊กต็อก ⇒ map เข้า `TIKTOK_SHOP` ของทะเบียนกลาง (ชื่อเดียวที่มีจริง)
 * 🔴 ค่าที่ไม่รู้จัก (แชทเพิ่ม enum ใหม่แล้วลืมมาเติมที่นี่) → คืน "WEBCHAT" ซึ่งเป็นช่องทาง
 *    ที่ canConsent/canNotify = false ทั้งคู่ ⇒ พลาดแล้ว "ไม่ส่งอะไรออกไป" ไม่ใช่ "ส่งผิดช่อง"
 */
const CHAT_CHANNEL_MAP: Record<string, ChannelKey> = {
  WEBCHAT: "WEBCHAT",
  LINE: "LINE",
  FACEBOOK: "FACEBOOK",
  INSTAGRAM: "INSTAGRAM",
  SHOPEE: "SHOPEE",
  LAZADA: "LAZADA",
  WHATSAPP: "WHATSAPP",
  APP: "APP",
  TIKTOK: "TIKTOK_SHOP",
};

export function chatChannelToKey(chat: string): ChannelKey {
  return CHAT_CHANNEL_MAP[chat] ?? "WEBCHAT";
}
