// channel-icon.tsx — ทะเบียน "ช่องทางแชท" ตัวเดียวของทั้งระบบ (WO-CV1 · PLAN-CHAT-V2 §3)
//
// 🔴 ทำไมต้องเป็น "ทะเบียนเดียว" (บทเรียน AS-6.1/6.3 · หนี้ H4)
//    ก่อนหน้านี้ลิสต์ช่องทางถูกพิมพ์มือไว้ 3 ที่ (`CHANNEL_LABEL` ใน ui.tsx · `CHAT_CHANNEL_TH`
//    ใน ai/tools.ts · `CHANNEL_LABEL_TH` ใน chat/service.ts) และเป็น `Record<string, string>`
//    ⇒ วันที่ enum โตขึ้น (APP/TIKTOK) typecheck ไม่แดงเลย แต่หน้าจอได้ "ป้ายว่าง"
//    ⇒ ที่นี่ผูกกับ `Record<ChatChannelType, …>` เต็มรูป: เพิ่มค่าใน enum แล้วลืม = typecheck แดงทันที
//    ⇒ 1 ก.ย. 2026 ยุบครบทั้ง 3 ที่แล้ว — ป้ายช่องทางทุกใบในระบบอ่านจากไฟล์นี้
//
// 🔴 ป้ายมี 2 แบบ เพราะใช้คนละที่ (เคยเพี้ยนเพราะพยายามใช้ใบเดียว)
//    · `label`    — สั้น ใช้ในชิป/แบดจ์ที่มีที่ว่างจำกัด ("เว็บ" "แอป" "Messenger")
//    · `sentence` — ยาว ใช้กลางประโยคที่คนอ่านเป็นภาษาไทย ("แชทหน้าเว็บ" "แอปมือถือ")
//      เช่น แจ้งเตือน "ลูกค้าทักเข้ามา · แชทหน้าเว็บ" — ใส่ "เว็บ" ตรงนี้อ่านแล้วห้วน
//
// 🔴 SVG ฝังในโค้ด ไม่ดึงจาก CDN ภายนอก — โหลดช้า/หายได้ และเป็นการบอกบุคคลที่สามว่า
//    ร้านไหนกำลังเปิดหน้าแชทอยู่ (ข้อมูลรั่วโดยไม่ตั้งใจ)
//
// ⚠️ **ไอคอนมี ≠ ช่องทางใช้ได้** — ตัวตัดสินว่า "ส่ง/รับได้จริงไหม" คือ registry ของ adapter
//    (`chat/adapter.ts` → `isSupported()`) ไม่ใช่ไฟล์นี้ · ห้ามพิมพ์ลิสต์ "ช่องทางที่เปิดแล้ว" ที่นี่
//    (ลิสต์ที่พิมพ์มือจะบอกว่าเชื่อม WhatsApp ได้แล้ว ทั้งที่ยังไม่มี adapter = โกหกเจ้าของ)
//
// ── ทำไมโลโก้ถึงเป็น "เงาทึบ" ไม่ใช่เส้นบางเหมือนไอคอนตัวอื่น (ปรับจากแบบร่าง · สิทธิ์ตามมติ V3) ──
//    แบบร่างวาดช่องทางด้วยเส้น 2.1px ในแบดจ์ 19px (glyph 11px) — Fable เทียบภาพจริงแล้วพบว่า
//    **อ่านไม่ออกว่าเป็นแบรนด์ไหน เห็นเป็นสี่เหลี่ยมสี** เพราะเส้นบางที่ 11px รวมกันเป็นก้อนเทา
//    ⇒ เปลี่ยนเป็น **แบดจ์ 22px + glyph ทึบ 13px** — ที่ขนาดนี้สิ่งที่คนจำได้คือ "สี + เงารูปทรง"
//      ไม่ใช่รายละเอียดภายใน · ตัวหนังสือในโลโก้ (เช่น คำว่า LINE) ถูกถอดออกด้วยเหตุผลเดียวกัน

import type { ChatChannelType } from "@prisma/client";

type IconProps = { className?: string };

/**
 * โครง svg ร่วมของทุกช่องทาง — viewBox เดียวกันทุกตัว → คุมขนาดจากภายนอกด้วย className ตัวเดียวจบ
 * `fill="currentColor"` + เงาทึบ: อ่านออกที่ 13px ต่างจากเส้นบางที่จะจางหายไป
 */
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
    {/* ฟองแชทหางล่างซ้ายแบบ LINE — ถอดตัวอักษร "LINE" ข้างในออก (ที่ 13px กลายเป็นรอยเปื้อน) */}
    <path d="M12 3.4c-4.9 0-8.9 3.2-8.9 7.1 0 3.5 3.2 6.5 7.4 7 .3 0 .7.2.8.4.1.2.1.5 0 .8l-.1.8c-.1.4-.3 1.1.8.6 1.1-.5 5.8-3.4 7.9-5.9 1.4-1.6 2-3.1 2-3.7 0-3.9-4-7.1-8.9-7.1Z" />
  </SVG>
);

const WhatsappIcon = (p: IconProps) => (
  <SVG {...p} label="WhatsApp">
    {/* ฟองกลม + หูโทรศัพท์ทึบ — เงารูปทรงนี้คนแยกออกจาก LINE ได้แม้ไม่เห็นรายละเอียด */}
    <path
      fillRule="evenodd"
      d="M12 3.2a8.7 8.7 0 0 0-7.4 13.3l-1.1 4 4.1-1.1A8.7 8.7 0 1 0 12 3.2Zm4.9 12.2c-.2.6-1.2 1.1-1.7 1.2-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.5-.6-2.7-1.2-4.4-3.9-4.6-4.1-.1-.2-1-1.4-1-2.6 0-1.3.6-1.9.9-2.1.2-.2.5-.3.7-.3h.5c.2 0 .4.1.6.5l.8 1.9c.1.2.1.3 0 .5l-.3.4-.3.3c-.1.1-.2.3-.1.5.1.2.6 1 1.3 1.6.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.5-.1l1.8.9c.2.1.4.2.5.3 0 .1 0 .5-.2 1.1Z"
    />
  </SVG>
);

const WebIcon = (p: IconProps) => (
  <SVG {...p} label="แชทหน้าเว็บ">
    {/* ลูกโลก: วงแหวน + เส้นศูนย์สูตร + เส้นเมริเดียน — เขียนเป็นรูปทึบ (nonzero winding)
        แทนการ stroke เพราะที่ 13px เส้น stroke จะบางจนหาย */}
    <path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 2a7 7 0 1 0 0 14 7 7 0 1 0 0-14Z" />
    <path d="M3.6 11.1h16.8v1.8H3.6Z" />
    <path d="M12 3.4c2.4 2.2 3.8 5.2 3.8 8.6s-1.4 6.4-3.8 8.6c-2.4-2.2-3.8-5.2-3.8-8.6S9.6 5.6 12 3.4Zm0 3c-1.3 1.7-2 3.6-2 5.6s.7 3.9 2 5.6c1.3-1.7 2-3.6 2-5.6s-.7-3.9-2-5.6Z" />
  </SVG>
);

const AppIcon = (p: IconProps) => (
  <SVG {...p} label="แอปมือถือ">
    {/* โครงมือถือ + แถบล่าง — เงา "สี่เหลี่ยมสูงมุมมน" คือสิ่งที่บอกว่า "แอป" ไม่ใช่ "เว็บ" */}
    <path d="M8 2.6h8a2.4 2.4 0 0 1 2.4 2.4v14a2.4 2.4 0 0 1-2.4 2.4H8a2.4 2.4 0 0 1-2.4-2.4V5A2.4 2.4 0 0 1 8 2.6Zm0 2A.4.4 0 0 0 7.6 5v14c0 .2.2.4.4.4h8c.2 0 .4-.2.4-.4V5a.4.4 0 0 0-.4-.4H8Z" />
    <path d="M10.4 17.3h3.2a.9.9 0 0 1 0 1.8h-3.2a.9.9 0 0 1 0-1.8Z" />
  </SVG>
);

const MessengerIcon = (p: IconProps) => (
  <SVG {...p} label="Messenger">
    {/* ฟองก้นแหลม + สายฟ้าเจาะเป็นช่องว่าง (evenodd) → สายฟ้าโชว์สีพื้นของแบดจ์ */}
    <path
      fillRule="evenodd"
      d="M12 3.2C7 3.2 3 6.9 3 11.5c0 2.6 1.2 4.9 3.2 6.4v3.4l3-1.7c.9.3 1.8.4 2.8.4 5 0 9-3.7 9-8.5s-4-8.3-9-8.3Zm-.5 10.5 2.3 2.4 4.5-4.8-4.1 2.3-2.3-2.4-4.5 4.8 4.1-2.3Z"
    />
  </SVG>
);

const InstagramIcon = (p: IconProps) => (
  <SVG {...p} label="Instagram">
    {/* กรอบมุมมน + เลนส์ + จุดแฟลช — เจาะเป็นช่อง (evenodd) ให้เห็นเป็นเส้นขาวบนพื้นสีแบรนด์ */}
    <path
      fillRule="evenodd"
      d="M8.2 3h7.6A5.2 5.2 0 0 1 21 8.2v7.6a5.2 5.2 0 0 1-5.2 5.2H8.2A5.2 5.2 0 0 1 3 15.8V8.2A5.2 5.2 0 0 1 8.2 3Zm0 2A3.2 3.2 0 0 0 5 8.2v7.6A3.2 3.2 0 0 0 8.2 19h7.6a3.2 3.2 0 0 0 3.2-3.2V8.2A3.2 3.2 0 0 0 15.8 5H8.2Zm3.8 2.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Zm0 2a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Zm4.6-3.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"
    />
  </SVG>
);

const TiktokIcon = (p: IconProps) => (
  <SVG {...p} label="TikTok">
    {/* ตัวโน้ต "d" ของ TikTok — เงารูปทรงนี้จำได้แม้ไม่มีสีคู่แดง/ฟ้า (แบดจ์เป็นสีเดียว) */}
    <path d="M16.4 2.8h-3v12.3a2.7 2.7 0 1 1-2.2-2.7V9.3a5.8 5.8 0 1 0 5.2 5.8V9a7 7 0 0 0 3.6 1.1V7.2a3.8 3.8 0 0 1-3.6-4.4Z" />
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
  /** ป้ายสั้น — ชิป/แบดจ์/ตัวเลือก (ชื่อแบรนด์คงรูปเดิม) */
  label: string;
  /** ป้ายยาว — ใช้กลางประโยคภาษาไทย (แจ้งเตือน · สรุปให้ AI อ่าน) */
  sentence: string;
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
  LINE: { label: "LINE", sentence: "LINE", color: "#06C755", Icon: LineIcon },
  WHATSAPP: { label: "WhatsApp", sentence: "WhatsApp", color: "#25D366", Icon: WhatsappIcon },
  WEBCHAT: { label: "เว็บ", sentence: "แชทหน้าเว็บ", color: "#1d4ed8", Icon: WebIcon },
  APP: { label: "แอป", sentence: "แอปมือถือ", color: "#0f766e", Icon: AppIcon },
  FACEBOOK: { label: "Messenger", sentence: "Facebook", color: "#0084FF", Icon: MessengerIcon },
  INSTAGRAM: { label: "Instagram", sentence: "Instagram", color: "#C13584", Icon: InstagramIcon },
  TIKTOK: { label: "TikTok", sentence: "TikTok", color: "#010101", Icon: TiktokIcon },
  SHOPEE: { label: "Shopee", sentence: "Shopee", color: "#EE4D2D", Icon: ShopeeIcon },
  LAZADA: { label: "Lazada", sentence: "Lazada", color: "#0F146D", Icon: LazadaIcon },
};

/** ป้ายช่องทางสั้น — จุดเดียวที่ทั้งระบบใช้แปลง enum → คำอ่านบนชิป/แบดจ์ */
export function channelLabel(type: string): string {
  return CHANNEL_META[type as ChatChannelType]?.label ?? type;
}

/**
 * ป้ายช่องทางแบบเต็มประโยค — ใช้ในข้อความแจ้งเตือน/สรุปที่ AI อ่าน
 * 🔴 เดิมลิสต์นี้ถูกพิมพ์มือซ้ำใน `chat/service.ts` (CHANNEL_LABEL_TH) และ `ai/tools.ts`
 *    (CHAT_CHANNEL_TH) ⇒ ค่าที่เพิ่มใหม่ตกหล่นเงียบ ๆ · ตอนนี้ทั้งคู่เรียกฟังก์ชันนี้แทน
 */
export function channelSentenceLabel(type: string): string {
  return CHANNEL_META[type as ChatChannelType]?.sentence ?? type;
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
 * แบดจ์มุมล่างขวาของ avatar — **glyph ขาวบนวงสีแบรนด์** ตามแบบร่าง แต่ขยายเป็น 22px
 *
 * 🔴 ทำไมต้อง 22px ไม่ใช่ 19px ตามแบบร่าง (ปรับตามสิทธิ์มติ V3 · รายงานแล้วไม่ได้เปลี่ยนเงียบ ๆ)
 *    ที่ 19px glyph จะเหลือ ~11px ซึ่ง Fable เทียบภาพจริงแล้วอ่านไม่ออกว่าเป็นแบรนด์ไหน
 *    22px ให้ glyph 13px = จุดที่เงารูปทรงยังบอกแบรนด์ได้ และยังเล็กกว่า avatar 46px พอ
 *    ที่จะไม่บังหน้าลูกค้า (แบดจ์กว้าง 48% ของ avatar ขึ้นไปจะเริ่มแย่งสายตา)
 *
 * ขอบขาว 2px รอบแบดจ์ = ตัวคั่นให้วงสีแบรนด์ลอยออกจากรูปโปรไฟล์ทุกสี (ตามแบบร่าง `.badge`)
 */
export function ChannelBadge({ type, title }: { type: string; title?: string }) {
  const meta = CHANNEL_META[type as ChatChannelType];
  if (!meta) return null;
  const Icon = meta.Icon;
  return (
    <span
      title={title ?? meta.label}
      className="absolute -bottom-0.5 -right-0.5 inline-flex size-[22px] items-center justify-center rounded-[7px] border-2 border-[color:var(--color-surface)] text-white"
      style={{ backgroundColor: meta.color }}
    >
      <Icon className="size-[13px]" />
    </span>
  );
}

/**
 * ป้ายช่องทางแบบมีตัวหนังสือ (หัวห้องแชท / หน้าเชื่อมช่องทาง)
 *
 * 🔴 `isSupported` = "ช่องทางนี้รับ-ส่งข้อความได้จริงหรือยัง" — ไม่ใช่ค่าที่ไฟล์นี้รู้เอง
 *    ความจริงอยู่ที่ registry ของ adapter (`chat/adapter.ts` → `isSupported()`) เท่านั้น
 *    ⇒ ผู้เรียกฝั่ง server ส่งผลของฟังก์ชันนั้นเข้ามา · ที่นี่แค่ "วาดให้ต่างออกไป"
 *    ⚠️ ห้าม import adapter มาที่ไฟล์นี้ตรง ๆ: ไฟล์นี้ถูกใช้ใน client component
 *       แต่ adapter ลากทั้ง `node:crypto` (ตรวจลายเซ็น LINE) เข้ามาด้วย = บิลด์แตก
 *       และ **ห้ามพิมพ์ลิสต์ "ช่องทางที่เปิดแล้ว" ที่นี่** เพราะลิสต์ที่พิมพ์มือจะค้างโกหกเจ้าของ
 *    ไม่ส่งมา (undefined) = "ไม่ได้ถาม" → วาดปกติ ต่างจาก false ที่แปลว่า "ถามแล้ว ยังไม่เปิด"
 */
export function ChannelChip({
  type,
  className = "",
  isSupported,
}: {
  type: string;
  className?: string;
  isSupported?: boolean;
}) {
  const meta = CHANNEL_META[type as ChatChannelType];
  const off = isSupported === false;
  return (
    <span
      title={off ? `${meta?.label ?? type} — ยังเปิดใช้งานไม่ได้` : undefined}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--color-line)] px-2 py-0.5 text-[11px] leading-4 ${off ? "opacity-55" : ""} ${className}`}
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
