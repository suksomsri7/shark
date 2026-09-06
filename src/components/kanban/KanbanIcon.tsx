// KanbanIcon.tsx — สไปรต์ไอคอนของโมดูล "บอร์ดงาน" (K1.5)
// ⚠️ path ทุกเส้น **คัดลอกคำต่อคำ** จาก `ledger/design-kanban/_base.part` + `_kb.part` (`<symbol id="i-…">`)
//    ของแบบที่เจ้าของเคาะแล้ว — ห้ามวาดเอง/ปรับตัวเลขเอง (feedback: UI ต้องตรงภาพที่ออกแบบ)
// เดินตามแบบเดียวกับ `src/components/account-v2/AccountIcon.tsx` (stroke 1.7 currentColor · ไม่มีอีโมจิในหน้าบอร์ด)
"use client";

const ICONS: Record<string, string> = {
  menu: "<path d=\"M4 7h16M4 12h16M4 17h16\"/>",
  search: "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"m16 16 4 4\"/>",
  ar: "<path d=\"m9.5 5 7 7-7 7\"/>",
  back: "<path d=\"m15 5-7 7 7 7\"/>",
  plus: "<path d=\"M12 5v14M5 12h14\"/>",
  x: "<path d=\"m6 6 12 12M18 6 6 18\"/>",
  more: "<circle cx=\"5\" cy=\"12\" r=\"1.4\"/><circle cx=\"12\" cy=\"12\" r=\"1.4\"/><circle cx=\"19\" cy=\"12\" r=\"1.4\"/>",
  check: "<path d=\"m5 12.5 4.5 4.5L19 7\"/>",
  home: "<path d=\"M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z\"/><path d=\"M9.5 21v-6h5v6\"/>",
  users: "<circle cx=\"9\" cy=\"8\" r=\"3.4\"/><path d=\"M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 5.4a3.4 3.4 0 0 1 0 6.4M18 14.8c2.2.6 3.5 2.3 3.5 5.2\"/>",
  box: "<path d=\"M12 3 4 7v10l8 4 8-4V7Z\"/><path d=\"m4 7 8 4 8-4M12 11v10\"/>",
  book: "<path d=\"M5 4h13a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5Z\"/><path d=\"M8.5 4v17M11.5 9h4M11.5 13h4\"/>",
  cam: "<path d=\"M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z\"/><circle cx=\"12\" cy=\"13\" r=\"3.2\"/>",
  spark: "<path d=\"M12 3.5 13.7 9 19 10.5 13.7 12 12 17.5 10.3 12 5 10.5 10.3 9 12 3.5ZM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z\"/>",
  flag: "<path d=\"M5 21V4h11l-1.5 3.5L16 11H5\"/>",
  clock: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/>",
  cal: "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"16\" rx=\"2.5\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/>",
  pct: "<circle cx=\"7.5\" cy=\"7.5\" r=\"2.6\"/><circle cx=\"16.5\" cy=\"16.5\" r=\"2.6\"/><path d=\"m5 19 14-14\"/>",
  list: "<path d=\"M4.5 6.5h.01M9 6.5h10.5M4.5 12h.01M9 12h10.5M4.5 17.5h.01M9 17.5h10.5\"/>",
  grid: "<rect x=\"4\" y=\"4\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"13\" y=\"4\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"4\" y=\"13\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"13\" y=\"13\" width=\"7\" height=\"7\" rx=\"1.5\"/>",
  chart: "<path d=\"M4 20V10M10 20V4M16 20v-7M22 20H2\"/>",
  lock: "<rect x=\"4.5\" y=\"10.5\" width=\"15\" height=\"9.5\" rx=\"2.2\"/><path d=\"M8 10.5V8a4 4 0 0 1 8 0v2.5\"/>",
  shop: "<path d=\"M4 9V4h16v5\"/><path d=\"M3 9h18l-1.4 11a1 1 0 0 1-1 .9H5.4a1 1 0 0 1-1-.9Z\"/><path d=\"M9.5 13h5\"/>",
  link: "<path d=\"M10 13.5a3.6 3.6 0 0 0 5.2.3l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.5 1.5\"/><path d=\"M14 10.5a3.6 3.6 0 0 0-5.2-.3l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.5-1.5\"/>",
  mail: "<rect x=\"3\" y=\"5.5\" width=\"18\" height=\"13\" rx=\"2.2\"/><path d=\"m3.6 7 8.4 6 8.4-6\"/>",
  copy: "<rect x=\"8.5\" y=\"8.5\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3\"/>",
  edit: "<path d=\"M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z\"/><path d=\"m14.5 7.5 2 2\"/>",
  eye: "<path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"3.2\"/>",
  filter: "<path d=\"M4 6h16l-6 7v6l-4-2v-4L4 6Z\"/>",
  tag: "<path d=\"M4 11V5a1 1 0 0 1 1-1h6l9 9-7 7-9-9Z\"/><circle cx=\"8\" cy=\"8\" r=\"1.3\"/>",
  drag: "<path d=\"M12 16V6\"/><path d=\"m7.5 10.5 4.5-4.5 4.5 4.5\"/><rect x=\"3.5\" y=\"16\" width=\"17\" height=\"4.5\" rx=\"1.5\"/>",
  star: "<path d=\"m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8Z\"/>",
  chat: "<path d=\"M4 5.5h16v11H9.5L5.5 20v-3.5H4Z\"/>",
  clip: "<path d=\"M17.5 8.5 10 16a3 3 0 0 1-4.2-4.2l7.8-7.8a4.6 4.6 0 0 1 6.5 6.5l-7.7 7.7a6.2 6.2 0 0 1-8.8-8.8l6.6-6.6\"/>",
  cklist: "<path d=\"m3.5 7 2 2 3-3.5M3.5 15l2 2 3-3.5M11.5 7.5h9M11.5 16h9\"/>",
  bell: "<path d=\"M18 15.5V10a6 6 0 1 0-12 0v5.5L4 18h16Z\"/><path d=\"M10 21h4\"/>",
  line: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"13\" rx=\"4\"/><path d=\"M9.5 17 8 20.5 12.5 17\"/><path d=\"M7.5 8v5M7.5 8h2.5M7.5 10.5h2M7.5 13h2.5M13 13V8l3 5V8\"/>",
  gear: "<circle cx=\"12\" cy=\"12\" r=\"3.2\"/><path d=\"M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z\"/>",
  doc: "<path d=\"M6 3h8l4 4v14H6Z\"/><path d=\"M14 3v4h4M9 12h6M9 16h4\"/>",
  warn: "<path d=\"M12 4 2.5 20h19Z\"/><path d=\"M12 10v4M12 17h.01\"/>",
  trash: "<path d=\"M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13\"/>",
  upload: "<path d=\"M12 17V5\"/><path d=\"m7.5 9.5 4.5-4.5 4.5 4.5\"/><path d=\"M4 17v3h16v-3\"/>",
  in: "<path d=\"M12 4v13\"/><path d=\"m6.5 11.5 5.5 5.5 5.5-5.5\"/><path d=\"M4 21h16\"/>",
  out: "<path d=\"M12 20V7\"/><path d=\"m6.5 12.5 5.5-5.5 5.5 5.5\"/><path d=\"M4 3h16\"/>",
};

const FALLBACK = '<rect x="5" y="5" width="14" height="14" rx="2"/>';

/** ชื่อไอคอนทั้งหมด (ใช้ตรวจว่าไม่มีใครพิมพ์คีย์ผิดแล้วได้กล่องเปล่าเงียบ ๆ) */
export const KANBAN_ICON_KEYS: string[] = Object.keys(ICONS);

/**
 * ไอคอน SVG ของหน้าบอร์ด — ขนาดตามแบบ: `svg.i` 18px · `.sm` 14px · `.xs` 12px
 * (แบบใช้ stroke หนาขึ้นเมื่อไอคอนเล็กลง — ยกมาเป็น prop `size` ให้เรียกง่าย)
 */
export function KanbanIcon({
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

export default KanbanIcon;
