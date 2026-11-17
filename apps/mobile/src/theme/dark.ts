// โหมดมืดของธีม Airy (เลขา AI) — คีย์ชุดเดียวกับ light.ts ทุกตัว
// ที่มา: บล็อก DARK ของ /root/design/chat-glass/gen_airy_dark.py + DARK เพิ่มใน gen_sec.py (+ ตาราง INLINE สลับสีป้ายระบบ)
import type { Palette } from "./light";

/** แอป 1.0 ไม่มีโหมดมืด — ชุดนี้เตรียมไว้คู่กับ legacyLight เท่านั้น (src/theme.ts ส่งออก legacyLight เสมอ) */
const legacyDark = {
  bg: "#0e0e15",
  surface: "#1a1a22",
  surfaceHi: "#26262f",
  border: "#2c2c36",
  text: "#f2f2f7",
  textDim: "#a6a6b4",
  textFaint: "#7c7c8c",
  blue: "#3b82f6",
  blueHi: "#60a5fa",
  blueSoft: "#1e3a8a",
  cyan: "#7dd3fc",
  danger: "#f87171",
  dangerDim: "#3b1d1d",
  ok: "#22c55e",
} as const;

export const dark: Palette = {
  isDark: true,
  bg: {
    base: "#0e0e15",
    spots: [
      { x: "90%", y: "8%", w: 306, h: 276, color: "rgba(60,170,120,0.22)" },
      { x: "0%", y: "35%", w: 364, h: 364, color: "rgba(210,90,140,0.20)" },
      { x: "100%", y: "70%", w: 364, h: 306, color: "rgba(80,120,230,0.22)" },
      { x: "20%", y: "100%", w: 291, h: 291, color: "rgba(220,150,60,0.16)" },
    ],
  },
  surface: "#1a1a22",
  glass: {
    fillFrom: "rgba(255,255,255,0.115)",
    fillTo: "rgba(255,255,255,0.045)",
    border: "rgba(255,255,255,0.13)",
    shadow: "0px 10px 30px rgba(0,0,0,0.28), inset 0px 1px 0px rgba(255,255,255,0.12)",
  },
  text: "#f2f2f7",
  textDim: "#a6a6b4",
  textMuted: "#8e8e9c",
  textFaint: "#7c7c8c",
  placeholder: "#7c7c8c",
  icon: "#f2f2f7",
  iconDim: "#8e8e93",
  accent: "#f2f2f7",
  onAccent: "#16161c",
  danger: { bg: "#e5484d", fg: "#ffffff" }, // ปุ่มลบแดง (ปัดซ้าย "ลบแชท" K1 · ตัวอักษรขาวทั้งสองโหมด)
  accentShadow: "0px 8px 22px rgba(0,0,0,0.35)",
  tabShadow: "0px 8px 22px rgba(0,0,0,0.35)",
  status: {
    run: "#3cc47f",
    runHalo: "rgba(60,196,127,0.22)",
    wait: "#ffb020",
    waitHalo: "rgba(255,176,32,0.22)",
    done: "#4c4c5c",
    doneHalo: "rgba(0,0,0,0)",
  },
  // ป้ายระบบในโหมดมืด = สีที่ตาราง INLINE ของ gen_airy_dark.py สลับให้ (crm/kb/acc สว่างขึ้น)
  sys: {
    pos: "#ff9f0a",
    crm: "#a3abff",
    bk: "#178a99",
    mem: "#d8436a",
    acc: "#5fd39a",
    kb: "#ffbe55",
    chat: "#34c759",
    dorm: "#6a4fd8",
  },
  onSys: "#ffffff",
  // ปฏิทินเลขา (CAL2.x · ColorKey ของสัญญา §4.1): สีเดียวกับตาราง "เปิดระบบ" ในชีตกิจการ (SYS_LOOK ของ BusinessSwitcherSheet: QUEUE/ACCOUNT/KANBAN/CRM/HR/HOTEL/TICKET)
  //   + remind/personal/google/device ตามภาพ cal-*.png · มืด = hue เดิมยกความสว่าง (dsys ของ gen.py)
  cal: { booking: "#6599e2", account: "#64cbe2", kanban: "#f9c74e", crm: "#d47290", hr: "#986dd9", dorm: "#7e66e1", ticket: "#d47290", trips: "#5cdaea", remind: "#ec9f5a", personal: "#6fd798", google: "#4d8ef9", device: "#ff5147" },
  calTagAlpha: "2b", // พื้นป้ายระบบบนมืด (แบบ 17%)
  // help-cases (15 พ.ย.): สีขั้นของเคสบนมืด (hue เดิมยกความสว่าง แบบ cal)
  helpStage: { RECEIVED: "#8a91ee", CHECKING: "#6599e2", FIXING: "#ec9f5a", NEED_INFO: "#d47290", AWAITING_CONFIRM: "#6fd798", CLOSED: "#8e8e9c", track: "rgba(255,255,255,0.14)", unread: "#ff5c61", onStage: "#16161c", haloAlpha: "40" },
  team: { tagBg: "rgba(101,153,226,0.16)", tagFg: "#8fb4ee", unreadBg: "#3cc47f", unreadFg: "#0f1a13", read: "#9a9aa8", pendingAlpha: 0.5 }, // B27 แชททีม
  sysTag: { bg: "rgba(255,255,255,0.1)", fg: "#c2c2d0" },
  zone: {
    secretary: "#f2f2f7",
    customers: "#1f8f4a",
    team: "#5a64d8",
    onZone: "#ffffff",
  },
  bubbleUser: { from: "#f6f6fb", to: "#d9d9ea", fg: "#16161c" },
  bubbleOther: { from: "rgba(255,255,255,0.115)", to: "rgba(255,255,255,0.045)", fg: "#f2f2f7" },
  warn: { bg: "rgba(255,176,32,0.16)", fg: "#ffc65c" },
  approval: { border: "rgba(255,255,255,0.2)" }, // .apc (มืด: ขอบกระจกสว่างขึ้น)
  bad: { fg: "#ff6b8f" }, // ข้อความเตือนสีแดงอมชมพู (D1 "ไม่เห็นแชทลูกค้า" · ขั้นที่ล้ม · ปุ่มถอด) — S2.10
  // โซนลูกค้า (S2.17–S2.19 · แบบ K1–K5): สีป้ายช่องทาง · แถบเขียว "ลูกค้าเห็นข้อความ" · บันทึกภายใน (เส้นประส้ม) · Shark (ม่วง) · รอคน (ส้ม)
  channel: { LINE: "#06c755", WEBCHAT: "#7c85f0", FACEBOOK: "#4a90f5", INSTAGRAM: "#ff6b8f", SHOPEE: "#ff7a59", LAZADA: "#7f86d6", WHATSAPP: "#3ee07c", TIKTOK: "#f6f6fb", other: "#8e8e93" },
  cust: { bannerBg: "rgba(52,199,89,0.18)", bannerFg: "#6ee39a", noteBg: "rgba(255,176,32,0.08)", noteBorder: "rgba(255,198,92,0.5)", ai: "#a996ff", aiBg: "rgba(169,150,255,0.12)", aiBorder: "rgba(169,150,255,0.6)", waiting: "#ffb020" },
  inputBg: "rgba(255,255,255,0.115)",
  dock: { fade: "rgba(14,14,21,0)", solid: "#0e0e15", bar: "#1d1d26" },
  chip: { bg: "rgba(255,255,255,0.09)", fg: "#b4b4c4" },
  tab: { fg: "#b4b4c4" },
  seg: { track: "rgba(255,255,255,0.08)", on: "rgba(255,255,255,0.24)", onShadow: "0px 0px 0px rgba(0,0,0,0)", fg: "#a6a6b4", onFg: "#ffffff" },
  btnOff: { bg: "rgba(255,255,255,0.12)", fg: "#8e8e9c" },
  dim: "rgba(0,0,0,0.55)",
  sheet: { from: "rgba(40,40,52,0.98)", to: "rgba(26,26,34,0.97)", grab: "#5a5a68" },
  // Lekaa FAB (15 พ.ย. · แบบ fab6): ปุ่มลอย (พื้นเข้มของธีม) + วงแหวน/เงาม่วง · ชิป 📍 อ้างอิงหน้า
  lekaa: { fabBg: "#24242e", ring: "rgba(160,140,255,0.28)", shadow: "0px 8px 24px rgba(124,102,234,0.45)", refBg: "rgba(120,140,255,0.16)", refFg: "#b8c4ff", logoRing: "0px 2px 8px rgba(124,102,234,0.35)" },
  // แถบบน topbar2 (17 พ.ย. · เจ้าของอนุมัติ): สีของแต่ละระบบตามรหัส (fg = ไอคอนบนแถบ/ในแผ่น · bg = พื้นช่องในแผ่น) — ค่าจาก gen.py ของแบบ · มืด = hue เดิมยกความสว่าง 35% + พื้นโปร่ง
  navSys: { HOME: { fg: "#d0d0d8", bg: "rgba(208,208,216,0.14)" }, QUEUE: { fg: "#80a1e6", bg: "rgba(128,161,230,0.16)" }, HR: { fg: "#b394e4", bg: "rgba(179,148,228,0.16)" }, CHAT: { fg: "#78c096", bg: "rgba(120,192,150,0.16)" }, ACCOUNT: { fg: "#6db3bd", bg: "rgba(109,179,189,0.16)" }, INVENTORY: { fg: "#ebb375", bg: "rgba(235,179,117,0.16)" }, CRM: { fg: "#d7849f", bg: "rgba(215,132,159,0.16)" }, KANBAN: { fg: "#dcba6a", bg: "rgba(220,186,106,0.16)" }, MEMBER: { fg: "#9497e4", bg: "rgba(148,151,228,0.16)" }, COUPON: { fg: "#ee888b", bg: "rgba(238,136,139,0.16)" }, REWARD: { fg: "#e486b6", bg: "rgba(228,134,182,0.16)" }, KB: { fg: "#75a1e4", bg: "rgba(117,161,228,0.16)" }, PAGES: { fg: "#b4b4bc", bg: "rgba(180,180,188,0.14)" }, HOTEL: { fg: "#9e8de6", bg: "rgba(158,141,230,0.16)" }, RESTAURANT: { fg: "#eba96d", bg: "rgba(235,169,109,0.16)" }, SHOP: { fg: "#e688b6", bg: "rgba(230,136,182,0.16)" }, BOOKING: { fg: "#68b3bd", bg: "rgba(104,179,189,0.16)" }, TICKET: { fg: "#d7869f", bg: "rgba(215,134,159,0.16)" }, POINT: { fg: "#ebb359", bg: "rgba(235,179,89,0.16)" }, MEETING: { fg: "#7fa9e4", bg: "rgba(127,169,228,0.16)" }, POS: { fg: "#eba96d", bg: "rgba(235,169,109,0.16)" }, MARKETING: { fg: "#ee888b", bg: "rgba(238,136,139,0.16)" }, RENTAL: { fg: "#78c094", bg: "rgba(120,192,148,0.16)" }, SCHOOL: { fg: "#9497e4", bg: "rgba(148,151,228,0.16)" }, CLINIC: { fg: "#ee888b", bg: "rgba(238,136,139,0.16)" }, other: { fg: "#b4b4b4", bg: "rgba(180,180,180,0.14)" } },
  // ไอคอนกิจการวงกลม (BizIcon · bizsheet4): ชุดสีพื้นเมื่อร้านไม่ได้ตั้งสีแบรนด์ (เลือกตามชื่อ คงที่ต่อร้าน) · ตัวอักษร · เงาลูกศรเล็ก — ย้ายจาก SecTopBar (17 พ.ย. · ห้ามสีฝังในคอมโพเนนต์)
  biz: { palette: ["#1E7A8F", "#E07A1F", "#5B5FD6", "#2F9E5B", "#C2456B", "#8A5CD1", "#B8860B", "#3A7BD5"], fg: "#FFFFFF", chevShadow: "#000000" },
  // แผ่นดึงลงจากแถบบน (topbar2 จอ 2–4): พื้นแผ่น · เงา · กรอบเส้นประของช่องที่จะวาง · เงาไอคอนที่ยก · ลิงก์ "จัดลำดับ" · ขอบจางของแถบเลื่อน · ปุ่มกลมบนแถบ
  topPanel: { panelFade: "rgba(26,26,34,0)", bg: "#1a1a22", shadow: "0px 18px 40px rgba(0,0,0,0.55)", slot: "rgba(255,255,255,0.3)", lift: "0px 14px 26px rgba(0,0,0,0.6)", link: "#a3abff", fade: "rgba(14,14,21,0)", fadeTo: "#0e0e15", btn: "rgba(255,255,255,0.1)", btnShadow: "0px 2px 8px rgba(0,0,0,0.3)" },
  divider: "rgba(255,255,255,0.14)",
  orb: {
    hi: "rgba(255,255,255,0.95)",
    c1: "rgba(110,160,255,0.85)",
    c2: "rgba(160,220,255,0.85)",
    coreIn: "rgba(255,255,255,0.35)",
    coreMid: "rgba(228,228,244,0.75)",
    coreOut: "#ffffff",
    border: "rgba(255,255,255,0.55)",
    shadow: "inset -4px -6px 12px rgba(255,255,255,0.55), inset 3px 3px 10px rgba(160,160,200,0.25), 0px 6px 18px rgba(0,0,0,0.4)",
  },
  legacy: legacyDark,
};
