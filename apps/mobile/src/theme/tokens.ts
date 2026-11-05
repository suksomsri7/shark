// โทเคนขนาดของธีม Airy (เลขา AI) — ไม่ขึ้นกับโหมดสว่าง/มืด
// ที่มา: CSS ของ ledger/design-secretary/gen_sec.py (+ /root/design/chat-glass/gen_glass_airy.py · gen_airy_full.py)
// ค่าเป็น dp ของแอป · มุมโค้ง/ตัวอักษร = ค่าในแบบตรง ๆ (ตามใบสั่ง) · ขนาดชิ้นส่วน (size) = ย่อจากแบบให้พอดีจอ 390×844
// (จอในภาพแบบกว้าง 536 px = 1.37× ของ 390 — ถ้าใช้ px ตรง ๆ ทั้งหมด แถวที่ 3 ของ C3 จะจมใต้ช่องสั่งงาน · ดู wo-notes sec-s0.2 §7)

/** มุมโค้ง */
export const radii = {
  card: 26, // .row / .ses
  sugg: 20, // .sugg / .kb
  pill: 17, // .chips span
  tab: 22, // .tabs span
  input: 36, // .inp (สูง 72)
  sheet: 48, // .sheet
  k: 10, // ป้ายระบบ .k / .why กล่องเล็ก
  tag: 9, // .sysp
  seg: 16, // .segw
  segIn: 12, // .segw span
  btn: 30, // .btn1 (สูง 60)
  round: 999,
} as const;

/** ระยะห่าง */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  page: 20, // ขอบซ้าย/ขวาของจอ
} as const;

/** ขนาดตัวอักษร */
export const type = {
  title: 34, // หัวใหญ่ .lt
  lt: 26, // หัว hero .hero h2
  h: 17, // หัวแถว / ชื่อบนแถบ
  body: 16,
  sub: 14, // บรรทัดรอง
  cap: 12.5, // คำอธิบายเล็ก / ป้าย
} as const;

/** ขนาดชิ้นส่วน */
export const size = {
  iconBtn: 44, // .ib (แบบ 48 · 44 = ขั้นต่ำที่กดง่ายของ iOS)
  icon: 21, // svg ในปุ่ม (แบบ 22)
  inputH: 56, // .inp (แบบ 72)
  send: 44, // .inp .s (แบบ 56)
  orbHero: 76, // C3 hero (แบบ 96)
  orb: 44,
  dot: 10, // .dot
  halo: 4, // วงรอบ .dot
  btnH: 60, // .btn1
  grab: 5,
} as const;

export const cardGap = 12;
export const cardPad = { v: 16, h: 18 } as const;

/** ปุ่มหลักลอยล่าง (D1 · G1 · G2 · C1 · R-S2.13g): ระยะปุ่มจากขอบล่าง และ padding ล่างของรายการ = ความสูงปุ่ม + ระยะนั้น + ช่องไฟการ์ด (+ safe area ที่จอ) */
export const CTA_BOTTOM = 26;
export const LIST_BOTTOM = size.btnH + CTA_BOTTOM + cardGap;

/** มุมโค้ง/ระยะห่างชุดเดิมของแอป 1.0 — ห้ามเปลี่ยนค่า (src/theme.ts ส่งออกเป็น R/S) */
export const legacyR = { sm: 8, md: 12, lg: 16, full: 999 } as const; // radius
export const legacyS = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const; // spacing

export const tokens = { radii, spacing, type, size, cardGap, cardPad } as const;
export type Tokens = typeof tokens;
