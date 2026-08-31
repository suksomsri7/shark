// channel-icon.tsx — ทะเบียน "ช่องทางแชท" ตัวเดียวของทั้งระบบ (WO-CW4 · PLAN-CHAT-WHATSAPP §6.3)
//
// 🔴 ทำไมต้องเป็น "ทะเบียนเดียว" (บทเรียน AS-6.1/6.3 · หนี้ H4)
//    ก่อนหน้านี้ลิสต์ช่องทางถูกพิมพ์มือไว้ 3 ที่ (`CHANNEL_LABEL` ใน ui.tsx · `CHAT_CHANNEL_TH`
//    ใน ai/tools.ts · `CHANNEL_LABEL_TH` ใน chat/service.ts) และทั้ง 3 เป็น `Record<string, string>`
//    ⇒ วันที่ enum โตขึ้น (APP/TIKTOK) typecheck ไม่แดงเลย แต่หน้าจอได้ "ป้ายว่าง"
//    ⇒ ที่นี่ผูกกับ `Record<ChatChannelType, …>` เต็มรูป: เพิ่มค่าใน enum แล้วลืม = typecheck แดงทันที
//
// 🔴 SVG ฝังในโค้ด ไม่ดึงจาก CDN ภายนอก — โหลดช้า/หายได้ และเป็นการบอกบุคคลที่สามว่า
//    ร้านไหนกำลังเปิดหน้าแชทอยู่ (ข้อมูลรั่วโดยไม่ตั้งใจ)
//
// ⚠️ **ไอคอนมี ≠ ช่องทางใช้ได้** — ตัวตัดสินว่า "ส่ง/รับได้จริงไหม" คือ registry ของ adapter
//    (`chat/adapter.ts` → `isSupported()`) ไม่ใช่ไฟล์นี้ · ห้ามพิมพ์ลิสต์ "ช่องทางที่เปิดแล้ว" ที่นี่

import type { ChatChannelType } from "@prisma/client";

type IconProps = { className?: string };

/** viewBox เดียวกันทุกตัว → ขนาดคุมจากภายนอกด้วย className ได้ตัวเดียวจบ */
const SVG = (props: IconProps & { children: React.ReactNode; label: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    className={props.className}
    role="img"
  >
    <title>{props.label}</title>
    {props.children}
  </svg>
);

const LineIcon = (p: IconProps) => (
  <SVG {...p} label="LINE">
    <path d="M12 3C6.9 3 2.8 6.3 2.8 10.4c0 3.7 3.3 6.8 7.7 7.4.3.1.7.2.8.5.1.3 0 .7 0 1l-.1.8c0 .2-.2.9.8.5s5.3-3.1 7.2-5.3c1.3-1.4 1.9-2.9 1.9-4.9C21.2 6.3 17.1 3 12 3ZM8.3 12.8H6.4a.4.4 0 0 1-.4-.4V8.7c0-.2.2-.4.4-.4s.4.2.4.4v3.3h1.5c.2 0 .4.2.4.4s-.2.4-.4.4Zm1.6-.4c0 .2-.2.4-.4.4a.4.4 0 0 1-.4-.4V8.7c0-.2.2-.4.4-.4s.4.2.4.4v3.7Zm4.2 0c0 .2-.1.3-.3.4h-.2c-.1 0-.2 0-.3-.2l-1.9-2.5v2.3c0 .2-.2.4-.4.4a.4.4 0 0 1-.4-.4V8.7c0-.2.1-.3.3-.4h.4l.2.2 1.9 2.5V8.7c0-.2.2-.4.4-.4s.4.2.4.4v3.7Zm2.9-2.3c.2 0 .4.2.4.4s-.2.4-.4.4h-1.5v1h1.5c.2 0 .4.2.4.4s-.2.4-.4.4h-1.9a.4.4 0 0 1-.4-.4V8.7c0-.2.2-.4.4-.4h1.9c.2 0 .4.2.4.4s-.2.4-.4.4h-1.5v1h1.5Z" />
  </SVG>
);

const WhatsappIcon = (p: IconProps) => (
  <SVG {...p} label="WhatsApp">
    <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-2.8.8.7-2.8-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-3.2 4c-.2 0-.5 0-.7.4-.2.4-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.7 2.8 4.3 3.8 2.1.8 2.5.7 3 .6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.5-.3s-1.3-.6-1.5-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1-.2-.1-1-.4-2-1.2-.7-.7-1.2-1.5-1.3-1.7-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.5-.5Z" />
  </SVG>
);

const WebIcon = (p: IconProps) => (
  <SVG {...p} label="แชทหน้าเว็บ">
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-2.6a14 14 0 0 0-1.2-3.3A8.2 8.2 0 0 1 18.9 8ZM12 3.9c.7 1 1.3 2.4 1.6 4.1h-3.2c.3-1.7.9-3.1 1.6-4.1ZM3.8 14a8.4 8.4 0 0 1 0-4h3a17 17 0 0 0 0 4h-3Zm.8 2h2.6c.3 1.2.7 2.3 1.2 3.3A8.2 8.2 0 0 1 4.6 16Zm2.6-8H4.6a8.2 8.2 0 0 1 3.8-3.3C7.9 5.7 7.5 6.8 7.2 8ZM12 20.1c-.7-1-1.3-2.4-1.6-4.1h3.2c-.3 1.7-.9 3.1-1.6 4.1ZM14.1 14H9.9a15 15 0 0 1 0-4h4.2a15 15 0 0 1 0 4Zm.9 5.3c.5-1 .9-2.1 1.2-3.3h2.6a8.2 8.2 0 0 1-3.8 3.3Zm2.2-5.3a17 17 0 0 0 0-4h3a8.4 8.4 0 0 1 0 4h-3Z" />
  </SVG>
);

const AppIcon = (p: IconProps) => (
  <SVG {...p} label="แอปมือถือ">
    <path d="M7.5 1.8h9c1 0 1.8.8 1.8 1.8v16.8c0 1-.8 1.8-1.8 1.8h-9c-1 0-1.8-.8-1.8-1.8V3.6c0-1 .8-1.8 1.8-1.8Zm0 1.8v16.8h9V3.6h-9Zm3.3 14.4h2.4c.3 0 .6.3.6.6s-.3.6-.6.6h-2.4a.6.6 0 0 1-.6-.6c0-.3.3-.6.6-.6Z" />
  </SVG>
);

const MessengerIcon = (p: IconProps) => (
  <SVG {...p} label="Messenger">
    <path d="M12 2C6.4 2 2 6.2 2 11.7c0 3.1 1.4 5.9 3.7 7.7v3.8l3.4-1.9c.9.3 1.9.4 2.9.4 5.6 0 10-4.2 10-9.7S17.6 2 12 2Zm1 13-2.6-2.7L5.5 15l5.4-5.7 2.6 2.7L18.4 9 13 15Z" />
  </SVG>
);

const InstagramIcon = (p: IconProps) => (
  <SVG {...p} label="Instagram">
    <path d="M8 2.2h8c3.2 0 5.8 2.6 5.8 5.8v8c0 3.2-2.6 5.8-5.8 5.8H8c-3.2 0-5.8-2.6-5.8-5.8V8c0-3.2 2.6-5.8 5.8-5.8Zm0 1.9C5.8 4.1 4.1 5.8 4.1 8v8c0 2.2 1.7 3.9 3.9 3.9h8c2.2 0 3.9-1.7 3.9-3.9V8c0-2.2-1.7-3.9-3.9-3.9H8Zm4 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.9a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Zm5.3-3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z" />
  </SVG>
);

const TiktokIcon = (p: IconProps) => (
  <SVG {...p} label="TikTok">
    <path d="M16.6 2h-3v13.1a2.7 2.7 0 1 1-2.2-2.7V9.3a5.9 5.9 0 1 0 5.2 5.8V8.6c1 .8 2.3 1.3 3.7 1.4V6.9a4 4 0 0 1-3.7-4Z" />
  </SVG>
);

const ShopeeIcon = (p: IconProps) => (
  <SVG {...p} label="Shopee">
    <path d="M12 1.8c-2.6 0-4.6 2-4.6 4.5v.4H4a1 1 0 0 0-1 1.1l.9 12.4c.1 1.1 1 2 2.1 2h12c1.1 0 2-.9 2.1-2l.9-12.4a1 1 0 0 0-1-1.1h-3.4v-.4c0-2.5-2-4.5-4.6-4.5Zm0 1.9c1.5 0 2.7 1.1 2.7 2.6v.4H9.3v-.4c0-1.5 1.2-2.6 2.7-2.6Zm0 6.1c1.9 0 3.2.9 3.2 2.2 0 1.1-.8 1.8-2.5 2.3-1.3.4-1.7.7-1.7 1.1 0 .4.5.8 1.3.8.7 0 1.4-.2 2-.6l.7 1.5c-.8.5-1.7.8-2.7.8-2 0-3.3-1-3.3-2.4 0-1.2.8-1.9 2.6-2.4 1.3-.4 1.6-.6 1.6-1 0-.4-.4-.7-1.2-.7-.7 0-1.4.2-2 .6l-.8-1.5c.8-.5 1.7-.7 2.8-.7Z" />
  </SVG>
);

const LazadaIcon = (p: IconProps) => (
  <SVG {...p} label="Lazada">
    <path d="M12 1.8 4.2 6.1c-.5.3-.8.8-.8 1.4v7.7c0 .5.3 1 .7 1.3l7.4 4.5c.3.2.7.2 1 0l7.4-4.5c.4-.3.7-.8.7-1.3V7.5c0-.6-.3-1.1-.8-1.4L12 1.8Zm0 2.2 6.1 3.4-2.4 1.4L9.6 5.4 12 4ZM7.7 6.4l6.1 3.4-1.8 1-6.1-3.4 1.8-1Zm-2.4 2.7 5.8 3.3v6.1l-5.8-3.5V9.1Zm13.4 0v5.9l-5.8 3.5v-6.1l5.8-3.3Z" />
  </SVG>
);

export type ChannelMeta = {
  /** ป้ายที่คนอ่าน — ภาษาไทยเมื่อมีคำไทยที่ใช้กันจริง (ชื่อแบรนด์คงรูปเดิม) */
  label: string;
  /**
   * สีแบรนด์ของช่องทาง — 🔴 ใช้ได้เฉพาะ "ไอคอนเล็กบอกช่องทาง" เท่านั้น
   * โครงหน้าจอ (พื้น/ฟอง/ปุ่ม) ต้องอยู่ในโทน SHARK จาก globals.css เสมอ (มติ W1)
   */
  color: string;
  Icon: (props: IconProps) => React.ReactElement;
};

/**
 * ทะเบียนช่องทาง — `Record<ChatChannelType, …>` เต็มรูป (ไม่ใช่ `Record<string, …>`)
 * เพิ่มค่าใน enum แล้วลืมเติมที่นี่ = `pnpm typecheck` แดงทันที ซึ่งคือสิ่งที่เราต้องการ
 */
export const CHANNEL_META: Record<ChatChannelType, ChannelMeta> = {
  LINE: { label: "LINE", color: "#06C755", Icon: LineIcon },
  WHATSAPP: { label: "WhatsApp", color: "#25D366", Icon: WhatsappIcon },
  WEBCHAT: { label: "เว็บ", color: "#1d4ed8", Icon: WebIcon },
  APP: { label: "แอป", color: "#0f766e", Icon: AppIcon },
  FACEBOOK: { label: "Messenger", color: "#0084FF", Icon: MessengerIcon },
  INSTAGRAM: { label: "Instagram", color: "#C13584", Icon: InstagramIcon },
  TIKTOK: { label: "TikTok", color: "#010101", Icon: TiktokIcon },
  SHOPEE: { label: "Shopee", color: "#EE4D2D", Icon: ShopeeIcon },
  LAZADA: { label: "Lazada", color: "#0F146D", Icon: LazadaIcon },
};

/** ป้ายช่องทางสำหรับหน้าจอ — จุดเดียวที่ทั้งระบบใช้แปลง enum → คำอ่าน */
export function channelLabel(type: string): string {
  return CHANNEL_META[type as ChatChannelType]?.label ?? type;
}

/** ไอคอนช่องทางเปล่า ๆ (ไม่มีกรอบ) — ใช้ในป้ายหัวห้อง/รายการตัวเลือก */
export function ChannelIcon({
  type,
  className = "size-3.5",
}: {
  type: string;
  className?: string;
}) {
  const meta = CHANNEL_META[type as ChatChannelType];
  if (!meta) return null;
  const Icon = meta.Icon;
  return (
    <span style={{ color: meta.color }} className="inline-flex shrink-0 items-center">
      <Icon className={className} />
    </span>
  );
}

/**
 * badge เล็กมุมล่างขวาของ avatar (คำสั่งข้อ 4 ของเจ้าของ)
 * — วงกลมพื้นขาวมีขอบ เพื่อให้ไอคอนอ่านออกบนรูปโปรไฟล์ทุกสี
 */
export function ChannelBadge({ type, title }: { type: string; title?: string }) {
  const meta = CHANNEL_META[type as ChatChannelType];
  if (!meta) return null;
  const Icon = meta.Icon;
  return (
    <span
      title={title ?? meta.label}
      className="absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-surface)]"
      style={{ color: meta.color }}
    >
      <Icon className="size-2.5" />
    </span>
  );
}

/** ป้ายช่องทางแบบมีตัวหนังสือ (หัวห้องแชท / หน้าเชื่อมช่องทาง) */
export function ChannelChip({ type, className = "" }: { type: string; className?: string }) {
  const meta = CHANNEL_META[type as ChatChannelType];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--color-line)] px-2 py-0.5 text-[11px] leading-4 ${className}`}
    >
      <ChannelIcon type={type} className="size-3" />
      {meta?.label ?? type}
    </span>
  );
}

/** ลำดับที่อยากให้แสดงในหน้า "เชื่อมช่องทาง" (ของที่ใช้ได้จริงขึ้นก่อน) */
export const CHANNEL_ORDER: ChatChannelType[] = [
  "LINE",
  "WEBCHAT",
  "APP",
  "FACEBOOK",
  "INSTAGRAM",
  "WHATSAPP",
  "TIKTOK",
  "SHOPEE",
  "LAZADA",
];
