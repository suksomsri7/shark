import type { ChatChannelType } from "@prisma/client";
import { lineAdapter } from "./line";
import { webchatAdapter } from "./webchat";

// ─────────────────────────────────────────────────────────────
// ChannelAdapter — หัวใจ omni-channel: ทุกช่องทาง implement interface เดียวกัน
// core routing เขียนครั้งเดียว (service.receiveInbound / sendReply) วิ่งผ่าน adapter
// เพิ่มช่องทางใหม่ (FB/IG/Shopee/Lazada/WhatsApp) = เพิ่มไฟล์ adapter เดียว + ลง registry ข้างล่าง
//   ไม่ต้องแตะ core/service/schema
// ─────────────────────────────────────────────────────────────

// credentials หลัง decrypt (ต่อช่องทาง)
export type LineCreds = { channelAccessToken?: string; channelSecret?: string };
export type ChannelCreds = LineCreds & Record<string, unknown>;

// ข้อความขาเข้ามาตรฐาน (adapter แปลง payload provider → รูปนี้)
export interface InboundMessage {
  externalUserId: string; // LINE userId / webchat guest token
  externalMessageId: string; // idempotency ฝั่ง provider
  type: "TEXT" | "IMAGE" | "STICKER";
  body?: string;
  stickerMeta?: Record<string, unknown>;
  replyToken?: string; // LINE reply token (single-use, อายุสั้น)
  sentAt: Date;
}

// ข้อความขาออก (staff → ลูกค้า)
export interface OutboundMessage {
  type: "TEXT" | "IMAGE" | "STICKER" | "AUDIO";
  body?: string;
  stickerMeta?: { packageId: string; stickerId: string };
  imageUrl?: string;
  /**
   * ข้อความเสียง (WO-CV13) — เพิ่มล้วน adapter เดิมที่ไม่รู้จัก AUDIO ตกไปทาง `else` เหมือนเดิม
   * 🔴 `audioUrl` ต้องเป็นลิงก์สาธารณะ https ของ **CDN ของเราเอง** และไฟล์ต้องเป็น m4a จริง
   *    (LINE ไปดึงไฟล์เองจากลิงก์นี้ — ให้ลิงก์ที่อื่น = พาปลายทางไปยิงเครื่องที่เราไม่ได้คุม)
   * `durationMs` = ความยาวเป็น **มิลลิวินาที** ตามที่ LINE ต้องการ (ไม่ใช่วินาที)
   */
  audioUrl?: string;
  durationMs?: number;
}

// error ที่ adapter โยนเมื่อส่งไม่สำเร็จ (reason ใช้เก็บใน deliveryError)
export class ChannelDeliveryError extends Error {
  constructor(
    public reason: string,
    public retryable = false,
  ) {
    super(reason);
    this.name = "ChannelDeliveryError";
  }
}

export interface ChannelAdapter {
  readonly type: ChatChannelType;
  readonly capabilities: {
    sendImage: boolean;
    sendSticker: boolean;
    /**
     * ส่ง "ข้อความเสียง" ออกช่องทางนี้ได้จริงไหม (WO-CV8)
     *
     * 🔴 ความจริงเรื่องความสามารถอยู่ที่ adapter **ที่เดียว** — ไม่ใช่ที่หน้าจอ ไม่ใช่ที่ทะเบียนไอคอน
     *    (`channel-icon.tsx` เป็นทะเบียน "ป้าย/โลโก้" และหัวไฟล์นั้นห้ามพิมพ์ลิสต์ความสามารถไว้ชัดเจน
     *     เพราะลิสต์ที่พิมพ์มือจะค้างโกหกว่าช่องทางที่ยังไม่มี adapter ส่งได้)
     * 🔴 ประกาศ true ได้เฉพาะเมื่อ **ส่งถึงลูกค้าได้จริงด้วยไฟล์ที่เบราว์เซอร์อัดออกมาได้เท่านั้น**
     *    ประกาศเกินจริง = ทีมอัดเสียงส่งไป แล้วลูกค้าไม่ได้ยิน โดยไม่มีใครรู้
     *    "ได้จริง" รวมถึงทางอ้อม: LINE รับเฉพาะ m4a แต่ตัวอัดผลิต wav ⇒ เปิด true ได้เพราะมีเส้นทาง
     *    **ส่งช้าแบบ async** ครบวง (แปลงบน VPS แล้ว worker ส่งเอง · WO-CV13/D31 ทาง ข)
     */
    audio: boolean;
    replyWindowHours: number | null; // LINE/WEBCHAT = null (ไม่มีหน้าต่าง)
    typing: boolean;
  };

  /** ตรวจ signature webhook (LINE: x-line-signature HMAC-SHA256 base64) */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
    creds: ChannelCreds,
  ): boolean;

  /** แปลง payload → ข้อความมาตรฐาน (1 webhook อาจมีหลายข้อความ) */
  parseInbound(payload: unknown, creds: ChannelCreds): InboundMessage[];

  /** ส่งออก — โยน ChannelDeliveryError เมื่อพัง */
  sendMessage(args: {
    creds: ChannelCreds;
    externalUserId: string;
    message: OutboundMessage;
    replyToken?: string;
  }): Promise<{ externalMessageId?: string }>;

  /** ดึงโปรไฟล์ contact (ชื่อ/avatar) */
  getProfile?(
    creds: ChannelCreds,
    externalUserId: string,
  ): Promise<{ displayName?: string; avatarUrl?: string }>;

  /** ตรวจ credentials (ปุ่มทดสอบ + หลัง onboarding) — คืน externalAccountId ถ้ามี */
  healthCheck(
    creds: ChannelCreds,
  ): Promise<{ ok: boolean; detail?: string; externalAccountId?: string }>;
}

// registry — เพิ่มช่องทาง = เพิ่ม 1 บรรทัด
const REGISTRY: Partial<Record<ChatChannelType, ChannelAdapter>> = {
  LINE: lineAdapter,
  WEBCHAT: webchatAdapter,
};

export function getAdapter(type: ChatChannelType): ChannelAdapter {
  const a = REGISTRY[type];
  if (!a) throw new Error(`[chat] ยังไม่รองรับช่องทาง ${type} (P1 = LINE + WEBCHAT)`);
  return a;
}

export function isSupported(type: ChatChannelType): boolean {
  return !!REGISTRY[type];
}

/**
 * ช่องทางนี้ส่งข้อความเสียงได้ไหม — ตัวตอบตัวเดียวที่ทั้งระบบใช้ (หน้าจอ + เซิร์ฟเวอร์)
 *
 * 🔴 ยังไม่มี adapter = **ตอบ false** (ไม่ throw) — ผู้เรียกคือ "ปุ่มไมค์ควรกดได้ไหม"
 *    ให้ throw ที่นี่ = หน้าจอพังทั้งจอเพราะช่องทางที่ยังไม่เปิด ซึ่งไม่ใช่ความผิดของผู้ใช้
 */
export function canSendAudio(type: ChatChannelType): boolean {
  return REGISTRY[type]?.capabilities.audio === true;
}
