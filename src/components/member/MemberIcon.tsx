// MemberIcon.tsx — สไปรต์ไอคอนของโมดูล "ระบบสมาชิก v2" (M1.3)
// เดินตามแบบเดียวกับ `src/components/kanban/KanbanIcon.tsx` / `src/components/account-v2/AccountIcon.tsx`
// (stroke 1.7 currentColor · ไม่มีอีโมจิในหน้าสมาชิก) — ไอคอนเมนู/แผงคุณสมบัติ + ไอคอนชนิดฟิลด์ 11 ชนิด
"use client";

const ICONS: Record<string, string> = {
  // ── ทั่วไป (pattern เดียวกับ KanbanIcon) ──
  drag: "<path d=\"M12 16V6\"/><path d=\"m7.5 10.5 4.5-4.5 4.5 4.5\"/><rect x=\"3.5\" y=\"16\" width=\"17\" height=\"4.5\" rx=\"1.5\"/>",
  // ตีกลับรอบ 1 ข้อ 1 — แถบกรองหน้ารวมสมาชิก (MembersFilterBar) ต้องมีไอคอนค้นหา/ตัวกรอง (แบบเดียวกับ KanbanIcon)
  search: "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"m16 16 4 4\"/>",
  filter: "<path d=\"M4 6h16l-6 7v6l-4-2v-4L4 6Z\"/>",
  chevronDown: "<path d=\"m6 9 6 6 6-6\"/>",
  plus: "<path d=\"M12 5v14M5 12h14\"/>",
  x: "<path d=\"m6 6 12 12M18 6 6 18\"/>",
  check: "<path d=\"m5 12.5 4.5 4.5L19 7\"/>",
  back: "<path d=\"m15 5-7 7 7 7\"/>",
  more: "<circle cx=\"5\" cy=\"12\" r=\"1.4\"/><circle cx=\"12\" cy=\"12\" r=\"1.4\"/><circle cx=\"19\" cy=\"12\" r=\"1.4\"/>",
  trash: "<path d=\"M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13\"/>",
  lock: "<rect x=\"4.5\" y=\"10.5\" width=\"15\" height=\"9.5\" rx=\"2.2\"/><path d=\"M8 10.5V8a4 4 0 0 1 8 0v2.5\"/>",
  gear: "<circle cx=\"12\" cy=\"12\" r=\"3.2\"/><path d=\"M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z\"/>",
  chart: "<path d=\"M4 20V10M10 20V4M16 20v-7M22 20H2\"/>",
  warn: "<path d=\"M12 4 2.5 20h19Z\"/><path d=\"M12 10v4M12 17h.01\"/>",
  archive: "<path d=\"M4 8h16v3H4Z\"/><path d=\"M5 11v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9\"/><path d=\"M10 14h4\"/>",
  restore: "<path d=\"M4 12a8 8 0 1 0 2.5-5.8\"/><path d=\"M4 4v5h5\"/>",
  cam: "<path d=\"M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z\"/><circle cx=\"12\" cy=\"13\" r=\"3.2\"/>",
  // M1.10 — กฎเลื่อนระดับ (bolt) · ตัวอย่างบัตร LINE (chat) · แบบเสียเงิน (card)
  bolt: "<path d=\"M13 3 5 13h5.5l-1.5 8 8-11h-5.5Z\"/>",
  chat: "<path d=\"M4.5 5.5h15v10h-9L6 19v-3.5H4.5Z\"/>",
  card: "<rect x=\"3\" y=\"6\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M3 10h18\"/>",
  // M1.6 — หัวส่วนของฟอร์มสมัคร (ภาพ 10): คนเดียว (person) ต่างจาก users (กลุ่ม) · ธง (flag) แทน "ที่มา"
  person: "<circle cx=\"12\" cy=\"8\" r=\"3.6\"/><path d=\"M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6\"/>",
  flag: "<path d=\"M6 4v16\"/><path d=\"M6 4.5h11l-2.6 3.75L17 12H6\"/>",

  // ── เมนู 9 หมวด (§2.2) ──
  users: "<circle cx=\"9\" cy=\"8\" r=\"3.4\"/><path d=\"M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 5.4a3.4 3.4 0 0 1 0 6.4M18 14.8c2.2.6 3.5 2.3 3.5 5.2\"/>",
  crown: "<path d=\"M4 17V9.5l4 3 4-6 4 6 4-3V17Z\"/><path d=\"M4 17h16v2.5H4Z\"/>",
  star: "<path d=\"m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8Z\"/>",
  stamp: "<rect x=\"4.5\" y=\"4.5\" width=\"15\" height=\"15\" rx=\"2.5\"/><path d=\"m8 12.5 2.6 2.6L16.5 9\"/>",
  gift: "<path d=\"M4 9.5h16v4H4Z\"/><path d=\"M6 13.5v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7\"/><path d=\"M12 9.5v12\"/><path d=\"M8.5 9.5C7 9.5 5.7 8.4 5.7 6.9S7 4.3 8.5 4.3 12 6.3 12 9.5M15.5 9.5C17 9.5 18.3 8.4 18.3 6.9S17 4.3 15.5 4.3 12 6.3 12 9.5\"/>",
  tag: "<path d=\"M4 11V5a1 1 0 0 1 1-1h6l9 9-7 7-9-9Z\"/><circle cx=\"8\" cy=\"8\" r=\"1.3\"/>",
  megaphone: "<path d=\"M3.5 10.5v3l4 1v4a1 1 0 0 0 1 1h.5v-6.2\"/><path d=\"M8.5 9.5 19 5.5v13l-10.5-4Z\"/><path d=\"M19 10a2.6 2.6 0 0 1 0 5\"/>",
  doc: "<path d=\"M6 3h8l4 4v14H6Z\"/><path d=\"M14 3v4h4M9 12h6M9 16h4\"/>",

  // ── ชนิดฟิลด์ 11 ชนิด (palette ซ้ายของ FieldDesigner) ──
  text: "<path d=\"M4 7h16M4 12h9\"/>",
  longText: "<path d=\"M4 6h16M4 10.5h16M4 15h16M4 19h9\"/>",
  number: "<path d=\"M4 9h16M4 15.5h16M9.5 4 7 20M17 4l-2.5 16\"/>",
  money: "<path d=\"M12 3v18\"/><path d=\"M8 7.3c0-1.6 1.7-2.8 4-2.8s4 1.1 4 2.6-2 2.1-4 2.4c-2.3.3-4 1-4 2.6S9.7 14.9 12 14.9s4-1.2 4-2.7\"/>",
  date: "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"16\" rx=\"2.5\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/>",
  datetime: "<rect x=\"3.5\" y=\"5\" width=\"12\" height=\"14\" rx=\"2.2\"/><path d=\"M3.5 9.3h12M7 3v4\"/><circle cx=\"17\" cy=\"16\" r=\"4.3\"/><path d=\"M17 14v2.2l1.4 1\"/>",
  select: "<circle cx=\"12\" cy=\"12\" r=\"8\"/><circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"currentColor\" stroke=\"none\"/>",
  multiSelect: "<path d=\"m3.5 7 2 2 3-3.5M3.5 15 5.5 17l3-3.5M11.5 7.5h9M11.5 16h9\"/>",
  boolean: "<rect x=\"3\" y=\"8\" width=\"18\" height=\"8\" rx=\"4\"/><circle cx=\"8\" cy=\"12\" r=\"2.6\" fill=\"currentColor\" stroke=\"none\"/>",
  file: "<path d=\"M17.5 8.5 10 16a3 3 0 0 1-4.2-4.2l7.8-7.8a4.6 4.6 0 0 1 6.5 6.5l-7.7 7.7a6.2 6.2 0 0 1-8.8-8.8l6.6-6.6\"/>",
  lookup: "<path d=\"M10 13.5a3.6 3.6 0 0 0 5.2.3l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.5 1.5\"/><path d=\"M14 10.5a3.6 3.6 0 0 0-5.2-.3l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.5-1.5\"/>",
};

const FALLBACK = '<rect x="5" y="5" width="14" height="14" rx="2"/>';

/** ชื่อไอคอนทั้งหมด (ใช้ตรวจว่าไม่มีใครพิมพ์คีย์ผิดแล้วได้กล่องเปล่าเงียบ ๆ) */
export const MEMBER_ICON_KEYS: string[] = Object.keys(ICONS);

/** ไอคอน SVG ของหน้าสมาชิก — ขนาดตามแบบ: `svg.i` 18px · `.sm` 14px · `.xs` 12px */
export function MemberIcon({
  name,
  size = "md",
  className = "",
}: {
  name: string;
  size?: "md" | "sm" | "xs" | "lg";
  className?: string;
}) {
  const px = size === "lg" ? 22 : size === "md" ? 18 : size === "sm" ? 14 : 12;
  const width = size === "xs" ? 2 : size === "sm" ? 1.9 : 1.7;
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={px}
      height={px}
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? FALLBACK }}
    />
  );
}

export default MemberIcon;
