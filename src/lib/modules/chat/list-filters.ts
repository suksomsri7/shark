// list-filters.ts — ตรรกะบริสุทธิ์ของ "รายการแชท" (WO-CV3 + WO-CV10 · PLAN-CHAT-V2 §3)
//
// 🔴 ทำไมแยกไฟล์
//    ของพวกนี้ถูกใช้ **สองฝั่ง**: หน้าจอ (client) ใช้วาดชิป/ป้าย · server action ใช้แปลงตัวกรอง
//    เป็นเงื่อนไข query จริง ถ้าปล่อยให้ต่างฝั่งต่างนิยาม วันหนึ่งชิปกับ query จะพูดคนละเรื่อง
//    (= "ชิปหลอก" ที่กดแล้วได้รายการเดิม ซึ่งเป็นบั๊กที่ข้อสอบ LS-3.1 เฝ้าอยู่)
//    ⇒ ไฟล์นี้ต้อง **ไม่ import อะไรที่เป็น runtime** (ไม่ prisma ไม่ react) จะได้อยู่ได้ทั้งสองฝั่ง
//
// ⚠️ ไฟล์นี้ไม่ใช่ `"use server"` โดยตั้งใจ — ไฟล์ server action ห้าม export ค่าที่ไม่ใช่ async function
//    ลิสต์ชิป/ป้ายเลยต้องอยู่ที่นี่ แล้วให้ทั้งสองฝั่ง import

// 🔴 ไฟล์นี้ตั้งใจ **ไม่ import อะไรเลย** — ต้องอยู่ได้ทั้งฝั่งเบราว์เซอร์และฝั่งเซิร์ฟเวอร์

// ───────────────────────── ชิปกรอง (แบบร่างจอ 1 · `.chips`) ─────────────────────────

/**
 * ชิป 4 ตัวตามแบบร่าง — **ของที่ใช้บ่อยที่สุด** เท่านั้น
 *
 * 🔴 "ปิดแล้ว" ของเดิม **ไม่ได้หายไป** — ย้ายไปอยู่หลังไอคอนกรวย (มติ D3)
 *    แบบร่างวาดกรวยไว้แต่ไม่ได้ให้หน้าที่ ⇒ กรวย = ตัวกรองเพิ่มเติม (ปิดแล้ว · ช่องทาง · ผู้รับผิดชอบ)
 *    ทำตามแบบร่างเป๊ะโดยไม่คิดต่อ = ทำฟีเจอร์เดิมหายไปเงียบ ๆ ซึ่งแย่กว่าผิดแบบร่างเล็กน้อย
 */
export type InboxFilterKey = "all" | "unread" | "mine" | "unassigned";

/**
 * ลำดับชิปบนจอ — ไฟล์นี้ถือ **สัญญา** (มีชิปอะไรบ้าง เรียงยังไง) ส่วน **คำไทยที่คนอ่าน**
 * อยู่ในไฟล์หน้าจอ เพราะเป็นเรื่องของการแสดงผล ไม่ใช่ของตรรกะที่เซิร์ฟเวอร์ต้องรู้
 * 🔴 ฝั่งจอประกาศป้ายเป็น `Record<InboxFilterKey, string>` เต็มรูป ⇒ เพิ่มชิปใหม่แล้วลืมตั้งชื่อ
 *    = typecheck แดงทันที (ไม่ใช่ชิปที่โผล่มาเป็นช่องว่างบนหน้าจอ)
 * ของใหม่รอบนี้คือ `unassigned` — "ห้องที่ยังไม่มีใครรับ" คือคิวงานที่ตกหล่นบ่อยที่สุดของร้าน
 */
export const INBOX_FILTER_KEYS: readonly InboxFilterKey[] = [
  "all",
  "unread",
  "mine",
  "unassigned",
];

/** ค่าที่ไม่รู้จัก (มาจาก query string / client เก่า) ต้องตกกลับเป็น "ทั้งหมด" ไม่ใช่โยน */
export function toInboxFilterKey(v: unknown): InboxFilterKey {
  return INBOX_FILTER_KEYS.includes(v as InboxFilterKey) ? (v as InboxFilterKey) : "all";
}

/** ตัวนับต่อชิป — มาจากการนับที่ชั้นข้อมูล ไม่ใช่นับจากแถวที่โหลดมาแล้ว */
export type InboxCounts = Record<InboxFilterKey, number>;

export const EMPTY_COUNTS: InboxCounts = { all: 0, unread: 0, mine: 0, unassigned: 0 };

// ───────────────────────── ตัวกรองเพิ่มเติมหลังไอคอนกรวย (มติ D3) ─────────────────────────

export type InboxExtraFilter = {
  /** true = ดูเฉพาะห้องที่ปิดแล้ว (ของเดิมเป็นชิป "ปิดแล้ว") */
  closed: boolean;
  /** ช่องทาง (ค่าใน enum ChatChannelType) — null = ทุกช่องทาง */
  channel: string | null;
  /** ผู้รับผิดชอบ (userId) — null = ทุกคน */
  assignee: string | null;
};

export const NO_EXTRA_FILTER: InboxExtraFilter = { closed: false, channel: null, assignee: null };

/** จำนวนเงื่อนไขที่เปิดอยู่ — ใช้ขึ้นจุดแดงบนไอคอนกรวยให้รู้ว่ารายการถูกกรองอยู่ */
export function extraFilterCount(x: InboxExtraFilter): number {
  return (x.closed ? 1 : 0) + (x.channel ? 1 : 0) + (x.assignee ? 1 : 0);
}

// ───────────────────────── สรุป "ชนิดข้อความล่าสุด" บนแถว ─────────────────────────

/**
 * 🔴 ที่มาของข้อมูล: `ChatConversation.lastMessagePreview` ซึ่ง `service.preview()` เขียน
 *    **เครื่องหมายชนิด** ลงไปเองอยู่แล้ว (`[รูปภาพ]` / `[สติกเกอร์]` / `[ไฟล์]`)
 *    ⇒ อ่านจากค่าที่ denormalize ไว้แล้ว = ไม่ต้องยิง query หาข้อความล่าสุดของทุกห้องทุก 5 วิ
 *
 * ⚠️ หนี้ที่ต้องรายงาน (ไม่ใช่ของที่แก้ที่นี่ได้):
 *    1. `service.preview()` **ยังไม่มีกรณี `AUDIO`** ⇒ ห้องที่ข้อความล่าสุดเป็นเสียงจะได้ preview ว่าง
 *       จนกว่า WO-CV8 จะเติม `if (type === "AUDIO") return "[ข้อความเสียง]"`
 *    2. ทางที่ถูกกว่าในระยะยาวคือ denormalize `lastMessageType` ลง `ChatConversation` ตรง ๆ
 *       (สคีมาเป็นของสาย A) — การอ่านเครื่องหมายจากสตริงเป็นทางที่ถูกที่สุดที่ทำได้ในรอบนี้
 */
export type PreviewKind = "TEXT" | "IMAGE" | "STICKER" | "FILE" | "AUDIO";

/** เครื่องหมายที่ `service.preview()` เขียนลง `lastMessagePreview` (ต้องตรงกันเป๊ะ) */
const PREVIEW_MARK: Record<Exclude<PreviewKind, "TEXT">, string> = {
  IMAGE: "[รูปภาพ]",
  STICKER: "[สติกเกอร์]",
  FILE: "[ไฟล์]",
  AUDIO: "[ข้อความเสียง]",
};

export function previewKindOf(preview: string | null | undefined): PreviewKind {
  const t = (preview ?? "").trim();
  for (const [kind, mark] of Object.entries(PREVIEW_MARK)) {
    if (t === mark) return kind as PreviewKind;
  }
  return "TEXT";
}

// ⚠️ **ไม่มี** ฟังก์ชันที่คืน "ชื่อไอคอน" ให้จอไปวาดโดยตั้งใจ — ชื่อไอคอนต้องเขียนตรง ๆ ที่จุดวาด
//    (`<Icon name="image" />`) เพื่อให้อ่านโค้ดแล้วรู้ทันทีว่าแถวนี้วาดอะไร และเครื่องมือตรวจ
//    ตามรอยได้ว่าไอคอนมาจากทะเบียนจริงไม่ใช่ emoji · ที่นี่ตอบแค่ "ข้อความล่าสุดเป็นชนิดไหน"

/** มิลลิวินาที → `0:12` (แบบร่างเขียนไว้แบบนี้) */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ───────────────────────── ติ๊กสถานะส่งบนแถว ─────────────────────────

/**
 * ติ๊กของ "ข้อความล่าสุดที่ทีมเป็นคนส่ง" — คนละเรื่องกับติ๊กในฟอง (นั่นดูรายข้อความ)
 * ที่นี่ตัดสินจากของที่ denormalize ไว้แล้วทั้งคู่: ทิศทางข้อความล่าสุด + เวลาที่ลูกค้าอ่านถึง
 *
 * คืน `null` เมื่อข้อความล่าสุดเป็นของลูกค้า (ไม่มีติ๊กให้ดู)
 */
export function rowTickOf(args: {
  lastMessageDirection: string | null;
  lastMessageAt: number | null;
  customerLastReadAt: number | null;
}): { read: boolean; title: string } | null {
  if (args.lastMessageDirection !== "OUT") return null;
  const read =
    args.customerLastReadAt !== null &&
    args.lastMessageAt !== null &&
    args.customerLastReadAt >= args.lastMessageAt;
  return read ? { read: true, title: "ลูกค้าอ่านแล้ว" } : { read: false, title: "ส่งแล้ว" };
}

// ───────────────────────── ปิดเสียง ─────────────────────────

/** ปิดเสียงอยู่ไหม ณ เวลานี้ — `mutedUntil` ที่หมดอายุแล้วถือว่าเปิดเสียงคืนเอง (ไม่ต้องมี cron) */
export function isMuted(mutedUntil: number | null, now: number = Date.now()): boolean {
  return mutedUntil !== null && mutedUntil > now;
}
