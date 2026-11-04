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
  chip: { bg: "rgba(255,255,255,0.09)", fg: "#b4b4c4" },
  tab: { fg: "#b4b4c4" },
  seg: { track: "rgba(255,255,255,0.08)", on: "rgba(255,255,255,0.24)", onShadow: "0px 0px 0px rgba(0,0,0,0)", fg: "#a6a6b4", onFg: "#ffffff" },
  btnOff: { bg: "rgba(255,255,255,0.12)", fg: "#8e8e9c" },
  dim: "rgba(0,0,0,0.55)",
  sheet: { from: "rgba(40,40,52,0.98)", to: "rgba(26,26,34,0.97)", grab: "#5a5a68" },
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
