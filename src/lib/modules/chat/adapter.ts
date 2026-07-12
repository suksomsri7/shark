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
  type: "TEXT" | "IMAGE" | "STICKER";
  body?: string;
  stickerMeta?: { packageId: string; stickerId: string };
  imageUrl?: string;
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
