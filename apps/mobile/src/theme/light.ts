// สีโหมดสว่างของ Liquid Glass · Airy — ค่าจาก CSS ของ mockup (G = gen_glass_airy.py · F = gen_airy_full.py)
// แก้ว = JS ล้วน (fill + border + shadow · ไม่มี blur — คำตัดสินผู้คุมงาน) · เงา = สตริง boxShadow ที่คูณ 390/536 แล้ว
// 🔴 dark.ts ต้องมี key ชุดเดียวกันทุกตัว (ข้อสอบ T0.3-S2.1)
export const light = {
  bg: "#fbfbfd", // G:88 .screen
  surface: "#ffffff",
  glass: {
    fill: "rgba(255,255,255,0.58)", // G:89 linear-gradient(.74 → .42) → ค่ากลาง (ไม่ใช้ gradient ใน JS)
    border: "rgba(255,255,255,0.85)", // G:90
    shadow: "0px 7px 22px rgba(120,120,170,0.10), inset 0px 1px 0px rgba(255,255,255,0.95)", // G:90
  },
  text: "#1d1d24", // G:86
  textDim: "#8e8e93", // G:20 .st · F:23 .hero p
  textFaint: "#aeaeb2", // G:29
  textSub: "#6e6e73", // G:28 .row .t span
  section: "#9a9aab", // G:114 .sec
  icon: "#c7c7cc", // G:30 .row svg
  iconStrong: "#111111", // G:11 svg stroke
  placeholder: "#9a9aab", // G:145 .srch
  accent: "#16161c", // G:115 .btn1
  accentFg: "#ffffff", // G:41
  accentSoft: "rgba(150,150,185,0.12)", // G:119 .chips span
  accentOff: "rgba(22,22,28,0.14)",
  accentOffFg: "#8e8e93",
  accentShadow: "0px 10px 22px rgba(20,20,40,0.22)", // G:115
  pillShadow: "0px 4.5px 10px rgba(20,20,40,0.18)", // G:107
  highlight: "rgba(143,155,255,0.55)", // F:90 แถวแนะนำอันดับ 1
  tabText: "#555566", // G:106
  count: "#d98a00", // G:108 .tabs em
  ok: "#3cc47f", // G:101 .on
  warn: "#ffb020", // G:101 .wt
  danger: "#c2334d", // F:132
  idle: "#c5c8d4", // G:101 .idle
  track: "rgba(150,150,180,0.18)", // G:111 .ub
  ring: "#8f9bff", // G:111 .ub i (สีกลางของไล่สี)
  segBg: "rgba(150,150,185,0.12)", // G:116 .segw
  segOn: "#ffffff", // G:117
  segOnText: "#111111", // G:47
  segShadow: "0px 1.5px 6px rgba(100,100,150,0.15)", // G:117
  scrim: "rgba(40,40,60,0.28)", // G:132 .dim
  sheet: "rgba(252,252,254,0.96)", // G:133 .sheet
  grab: "#d1d1d6", // G:81
  skeleton: "rgba(150,150,185,0.16)",
  avatarRing: "#ffffff", // G:140 .stk>*
  avatarFg: "#ffffff", // G:142 .hp
  avatarShadow: "0px 3px 7px rgba(110,110,160,0.18)", // G:140
  more: "rgba(255,255,255,0.92)", // G:144
  moreFg: "#55556a", // G:144
  human: { a: "#dfb197", b: "#8cabe3", c: "#8bc9a2" }, // G:143 .h1 .h2 .h3 (ค่ากลางของไล่สี)
  orbShadow: "0px 4.5px 11.5px rgba(110,110,160,0.18)", // G:97 .ao (เงานอก — เงาในอยู่ใน PNG)
  orbInitial: "#1d1d24",
  blob: { a: "#d9f5e6", b: "#fde3ec", c: "#e1ecff", d: "#fff0dc" }, // G:88 .screen radial-gradient ×4
  orb: {
    sales: { c1: "rgba(110,160,255,0.85)", c2: "rgba(160,220,255,0.85)" }, // G:98 .o1
    chat: { c1: "rgba(255,140,170,0.85)", c2: "rgba(255,200,160,0.8)" }, // G:98 .o2
    account: { c1: "rgba(80,200,150,0.8)", c2: "rgba(180,240,200,0.85)" }, // G:98 .o3
    content: { c1: "rgba(255,160,80,0.8)", c2: "rgba(255,220,140,0.85)" }, // G:99 .o4
    member: { c1: "rgba(160,120,255,0.85)", c2: "rgba(230,180,255,0.85)" }, // G:99 .o5
    custom: { c1: "rgba(90,190,210,0.85)", c2: "rgba(170,235,240,0.85)" }, // G:99 .o6
  },
};

export type Palette = typeof light;
