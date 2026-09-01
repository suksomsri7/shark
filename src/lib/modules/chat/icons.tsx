// icons.tsx — ทะเบียนไอคอน "เส้นบาง minimal" ตัวเดียวของโมดูลแชท (WO-CV1 · PLAN-CHAT-V2 §3)
//
// 🔴 ทำไมต้องเป็นทะเบียนเดียว (มติเจ้าของ V2 · 1 ก.ย. 2026)
//    ของเดิมโมดูลแชทใช้ emoji เป็นไอคอน (📎 📷 ✨ 🌐 🔒 🔔) ซึ่ง
//    (1) หน้าตาเปลี่ยนไปตามระบบปฏิบัติการ/ฟอนต์ของเครื่องลูกค้า — คุมไม่ได้เลย
//    (2) ปรับสี/ขนาดให้เข้ากับโทนหน้าจอไม่ได้ (emoji มีสีของมันเอง)
//    (3) โปรแกรมอ่านหน้าจออ่านออกมาเป็นชื่อ emoji ยาว ๆ กลางประโยค
//    ⇒ ทุกไอคอนในโมดูลนี้ต้องมาจากไฟล์นี้ที่เดียว · ห้ามไฟล์อื่นวาด <svg> เองหรือแปะ emoji
//
// 🔴 path ทุกเส้นยกมาจากแบบร่าง `docs/design/chat-v2/mockup.html` (<symbol id="i-*">) ตรง ๆ
//    แบบร่างคือ "ข้อสอบ" ไม่ใช่แรงบันดาลใจ (มติ V3) — แก้ path = ผิดสัญญากับเจ้าของ
//
// โทเคนที่ล็อกไว้ (แบบร่าง `svg.i` / `.i.sm` / `.i.lg`):
//    viewBox 0 0 24 24 · currentColor · fill:none · stroke-linecap/join = round
//    ขนาดปกติ 21px stroke 1.7 · sm 15px stroke 1.9 (เส้นหนาขึ้นเพราะย่อแล้วเส้นบางจะจาง) · lg 24px
//
// ⚠️ ไอคอน "ช่องทางแชท" (LINE/WhatsApp/…) **ไม่ได้อยู่ที่นี่** — อยู่ `channel-icon.tsx`
//    เพราะเป็นคนละชนิดของงาน: อันนั้นเป็นโลโก้แบรนด์ (ทึบ มีสีของแบรนด์) ต้องผูกกับ enum
//    `ChatChannelType` ให้ typecheck จับได้เวลาช่องทางใหม่เข้ามา ส่วนไฟล์นี้เป็นไอคอน UI ล้วน

import type { ReactNode, SVGProps } from "react";

/** ชื่อไอคอนทั้งหมด = ชื่อ `<symbol id="i-*">` ในแบบร่าง (ตัด `i-` ออก) */
export type IconName =
  | "menu"
  | "search"
  | "more"
  | "back"
  | "plus"
  | "send"
  | "mic"
  | "camera"
  | "image"
  | "clip"
  | "pin"
  | "star"
  | "globe"
  | "quick"
  | "lock"
  | "bookmark"
  | "belloff"
  | "userplus"
  | "users"
  | "tag"
  | "check"
  | "check2"
  | "clock"
  | "moon"
  | "checkcircle"
  | "sparkle"
  | "play"
  | "hand"
  | "filter"
  | "history"
  // ── 3 ตัวนี้ **ไม่มีในแบบร่าง** แต่หน้าจอจริงต้องใช้ (แบบร่างไม่ได้วาดสถานะพวกนี้ไว้) ──
  // 🔴 เพิ่มไว้ล่วงหน้าเพื่อไม่ให้สายที่ทำห้องแชท/กล่องพิมพ์ต้องเลือกระหว่าง
  //    "คง emoji ไว้" (ผิดมติ V2) กับ "วาด <svg> เองในไฟล์หน้าจอ" (ผิดกติกาทะเบียนเดียว)
  //    · x        = ปิดแผ่น/เอาไฟล์ที่เลือกออก (ของเดิมใช้ตัวอักษร ✕)
  //    · xcircle  = ส่งไม่สำเร็จ (ของเดิมใช้ ✗ — คู่กับ check/check2 ที่แบบร่างมีให้แล้ว)
  //    · alert    = ป้ายเตือน "คำตอบนี้ไม่มีแหล่งอ้างอิง" (ของเดิมใช้ ⚠️)
  | "x"
  | "xcircle"
  | "alert";

/**
 * รูปวาดของแต่ละไอคอน — คัดลอกจาก mockup.html แบบไม่แก้ตัวเลขสักตัว
 * `Record<IconName, ReactNode>` เต็มรูป: เพิ่มชื่อใน IconName แล้วลืมวาด = typecheck แดงทันที
 */
const SHAPES: Record<IconName, ReactNode> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </>
  ),
  back: <path d="m15 5-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  send: <path d="M4.5 12 20 5l-4 15-4.5-6.5L4.5 12Z" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="m4 17 5-4.5 4.5 4 3-2.5L20 17" />
    </>
  ),
  clip: (
    <path d="M18 8.5 10 16.5a3.2 3.2 0 0 1-4.5-4.5l8.5-8.5a2.2 2.2 0 0 1 3 3l-8 8a1.2 1.2 0 0 1-1.7-1.7l7.2-7.2" />
  ),
  pin: (
    <>
      <path d="M12 21s6.5-6.2 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </>
  ),
  star: <path d="M12 3.5 14.4 9l5.6.5-4.3 3.8 1.3 5.7L12 16l-5 3 1.3-5.7L4 9.5 9.6 9 12 3.5Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.5 3.6 8.5S14.4 18.4 12 20.5c-2.4-2.1-3.6-5-3.6-8.5S9.6 6.1 12 3.5Z" />
    </>
  ),
  quick: (
    <>
      <path d="M20 15.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5Z" />
      <path d="M8.5 9h7M8.5 12.5h4.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  bookmark: <path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4V5a1 1 0 0 1 1-1Z" />,
  belloff: <path d="M8 8a4 4 0 0 1 8 0c0 5 2 6 2 6H6s2-1 2-6ZM10 20h4M4 4l16 16" />,
  userplus: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M19 7v6M22 10h-6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 5.4a3.4 3.4 0 0 1 0 6.4M18 14.8c2.2.6 3.5 2.3 3.5 5.2" />
    </>
  ),
  tag: (
    <>
      <path d="M4 11V5a1 1 0 0 1 1-1h6l9 9-7 7-9-9Z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  check2: <path d="m2 12.5 4 4L14.5 8M9.5 16.5l1 1L20 8" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  checkcircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.5 2.5 4.5-5" />
    </>
  ),
  sparkle: (
    <path d="M12 3.5 13.7 9 19 10.5 13.7 12 12 17.5 10.3 12 5 10.5 10.3 9 12 3.5ZM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
  ),
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  hand: (
    <path d="M8.5 11V5.5a1.6 1.6 0 0 1 3.2 0V11m0-1.5a1.6 1.6 0 0 1 3.2 0V12m0-1a1.6 1.6 0 0 1 3.2 0v4.5c0 3.3-2.4 5.5-5.6 5.5s-5.6-2.2-5.6-5.5v-3a1.6 1.6 0 0 1 3.2 0" />
  ),
  filter: <path d="M4 6h16l-6 7v6l-4-2v-4L4 6Z" />,
  history: (
    <>
      {/* 🔴 Fable แก้ 1 ก.ย. — ของเดิม (ยกจากแบบร่าง) เรนเดอร์ออกมาเป็น "วงกลมมีเส้นทแยงพาด"
          = อ่านเป็น "ห้าม/ยกเลิก" ซึ่งตรงข้ามกับความหมายที่ต้องการ (สาย A รายงาน · Fable ยืนยันด้วยตา)
          เปลี่ยนเป็นทรงมาตรฐาน: หน้าปัดนาฬิกา + ลูกศรย้อนกลับที่มุมซ้ายบน · แก้ในแบบร่างด้วยแล้ว */}
      <path d="M3.2 12a8.8 8.8 0 1 0 2.6-6.2L3 8.3" />
      <path d="M3 3.9v4.4h4.4" />
      <path d="M12 7.6V12l3.4 2" />
    </>
  ),
  // ── นอกแบบร่าง (ดูเหตุผลที่ IconName) — วาดด้วยโทเคนเดียวกันเป๊ะ ──
  x: <path d="m6 6 12 12M18 6 6 18" />,
  xcircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.4 21 19.6H3L12 4.4Z" />
      {/* จุดตกใจ: เส้นสั้นมากที่ปลายมน = จุดกลม — ไม่ต้องใช้ fill ให้ผิดโทเคน */}
      <path d="M12 10v3.6M12 16.6h.01" />
    </>
  ),
};

/** รายชื่อไอคอนทั้งหมด — ให้ข้อสอบ/หน้าตัวอย่างเดินดูได้โดยไม่ต้องพิมพ์ลิสต์ซ้ำ */
export const ICON_NAMES = Object.keys(SHAPES) as IconName[];

/**
 * 🔴 ตัวเดียวในชุดที่แบบร่างใช้ `fill` จริง (`.play svg{fill:currentColor;stroke:none}`)
 *    สามเหลี่ยมเล่นเสียงขนาด 13px ถ้าวาดด้วยเส้น จะกลายเป็นสามเหลี่ยมกลวงที่มองไม่ออกว่าคือปุ่มเล่น
 */
const FILLED = new Set<IconName>(["play"]);

/** ขนาดตามแบบร่าง — 3 ค่านี้เท่านั้น (ห้ามให้ที่เรียกใช้ตั้งตัวเลขเอง ไม่งั้นชุดไอคอนจะกระจาย) */
const SIZE = { sm: 15, md: 21, lg: 24 } as const;
/** ย่อแล้วเส้นต้องหนาขึ้นเล็กน้อย ไม่งั้นไอคอนเล็กจะจางกว่าตัวหนังสือข้าง ๆ */
const STROKE = { sm: 1.9, md: 1.7, lg: 1.7 } as const;

export type IconSize = keyof typeof SIZE;

export type IconProps = {
  name: IconName;
  /** ปกติ = md (21px) · sm = 15px · lg = 24px */
  size?: IconSize;
  className?: string;
  /**
   * ความหนาเส้นเฉพาะจุดที่แบบร่างกำหนดเอง (ติ๊กในแสตมป์ 2.2 · ป้ายโน้ต/แบดจ์ 2.1)
   * ⚠️ ใส่เมื่อ "แบบร่างเขียนไว้" เท่านั้น — ไม่ใช่ที่ปรับตามใจ
   */
  strokeWidth?: number;
  /**
   * ข้อความสำหรับโปรแกรมอ่านหน้าจอ · ไม่ใส่ = ไอคอนประดับ (aria-hidden)
   * 🔴 ปุ่มที่มีแต่ไอคอนต้องมี label ที่ตัวปุ่ม (aria-label) หรือส่ง label มาที่นี่ ไม่งั้นคนตาบอดกดไม่ถูก
   */
  label?: string;
} & Omit<SVGProps<SVGSVGElement>, "name" | "children" | "ref">;

/**
 * ไอคอนตัวเดียวของโมดูลแชท
 * ```tsx
 * <Icon name="search" />            // 21px
 * <Icon name="check2" size="sm" />  // 15px
 * ```
 * ขนาดคุมด้วย width/height attribute → คลาส CSS (เช่น `size-4`) ทับได้เสมอเมื่อจำเป็น
 */
export function Icon({ name, size = "md", className, strokeWidth, label, ...rest }: IconProps) {
  const px = SIZE[size];
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? undefined : (strokeWidth ?? STROKE[size])}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      focusable="false"
      {...rest}
    >
      {label ? <title>{label}</title> : null}
      {SHAPES[name]}
    </svg>
  );
}
