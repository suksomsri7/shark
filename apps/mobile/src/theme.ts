// ธีมกลางของแอป — light mode + น้ำเงิน orb (สีชุดเดียวกับ .ai-orb ใน globals.css ฝั่งเว็บ)
export const C = {
  bg: "#ffffff",
  surface: "#f4f5f7", // การ์ด/แถบ
  surfaceHi: "#e9eaee", // กดแล้ว/ยกระดับ
  border: "#e5e7eb",
  text: "#111827",
  textDim: "#6b7280",
  textFaint: "#9ca3af",
  blue: "#2563eb", // ปุ่มหลัก (โทนเดียวกับเว็บ)
  blueHi: "#60a5fa", // accent/ลิงก์/จุด unread
  blueSoft: "#1e3a8a",
  cyan: "#7dd3fc",
  danger: "#ef4444",
  dangerDim: "#fee2e2", // พื้นปุ่มแดงอ่อนบน light
  ok: "#22c55e",
} as const;

export const R = { sm: 8, md: 12, lg: 16, full: 999 } as const; // radius
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const; // spacing
