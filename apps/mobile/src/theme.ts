// ธีมกลางของแอป — ดำสนิท + น้ำเงิน orb (สีชุดเดียวกับ .ai-orb ใน globals.css ฝั่งเว็บ)
export const C = {
  bg: "#000000",
  surface: "#101014", // การ์ด/แถบ
  surfaceHi: "#1a1a20", // กดแล้ว/ยกระดับ
  border: "#26262e",
  text: "#f4f4f5",
  textDim: "#9ca3af",
  textFaint: "#6b7280",
  blue: "#2563eb", // ปุ่มหลัก (โทนเดียวกับเว็บ)
  blueHi: "#60a5fa", // accent/ลิงก์/จุด unread
  blueSoft: "#1e3a8a",
  cyan: "#7dd3fc",
  danger: "#ef4444",
  dangerDim: "#7f1d1d",
  ok: "#22c55e",
} as const;

export const R = { sm: 8, md: 12, lg: 16, full: 999 } as const; // radius
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const; // spacing
