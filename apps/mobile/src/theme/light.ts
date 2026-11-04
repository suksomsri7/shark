// โหมดสว่างของธีม Airy (เลขา AI) + ชุดสีเดิมของแอป 1.0 (legacyLight = ค่า C เดิมทุกตัว · src/theme.ts re-export)
// ที่มา: CSS `.screen` `.gl` `.ao` `.sysp` `.dot` `.why` `.inp` ฯลฯ ใน gen_glass_airy.py + gen_airy_full.py + gen_sec.py (คัดลอกค่า ไม่แต่งเอง)
// คีย์ต้องตรงกับ dark.ts ทุกตัว (ข้อสอบ S2.1) · สีอยู่ได้แค่ในโฟลเดอร์ theme เท่านั้น

/** สีชุดเดิมของแอป 1.0 — ห้ามเปลี่ยนค่า (จอ 1.0 ต้องเหมือนเดิมทุกพิกเซล) */
export const legacyLight = {
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

export const light = {
  isDark: false,
  // พื้นจอ = .screen: วงไล่สี 4 จุด (ขนาดย่อจากจอแบบ 536 → 390) บนสีฐาน
  bg: {
    base: "#fbfbfd",
    spots: [
      { x: "90%", y: "8%", w: 306, h: 276, color: "#d9f5e6" },
      { x: "0%", y: "35%", w: 364, h: 364, color: "#fde3ec" },
      { x: "100%", y: "70%", w: 364, h: 306, color: "#e1ecff" },
      { x: "20%", y: "100%", w: 291, h: 291, color: "#fff0dc" },
    ],
  },
  surface: "#ffffff",
  // กระจก = .gl: พื้นไล่ 135° + ขอบ 1.5 + เงา (blur ทำได้เฉพาะเว็บ)
  glass: {
    fillFrom: "rgba(255,255,255,0.74)",
    fillTo: "rgba(255,255,255,0.42)",
    border: "rgba(255,255,255,0.85)",
    shadow: "0px 10px 30px rgba(120,120,170,0.10), inset 0px 1px 0px rgba(255,255,255,0.95)",
  },
  text: "#1d1d24",
  textDim: "#6e6e73", // บรรทัดรอง .ses .t span
  textMuted: "#8e8e93", // .st .hero p .sugg .x span
  textFaint: "#9a9aab", // .sec
  placeholder: "#aeaeb2", // .inp
  icon: "#111111", // svg stroke
  iconDim: "#8e8e93", // .lt svg (ลูกศรลง)
  accent: "#16161c",
  onAccent: "#ffffff",
  accentShadow: "0px 14px 30px rgba(20,20,40,0.22)", // .btn1
  tabShadow: "0px 6px 14px rgba(20,20,40,0.18)", // .tabs .a
  status: {
    run: "#3cc47f",
    runHalo: "rgba(60,196,127,0.22)",
    wait: "#ffb020",
    waitHalo: "rgba(255,176,32,0.22)",
    done: "#c5c8d4",
    doneHalo: "rgba(0,0,0,0)",
  },
  // สีระบบ = KC ใน gen_sec.py
  sys: {
    pos: "#ff9f0a",
    crm: "#5a64d8",
    bk: "#178a99",
    mem: "#d8436a",
    acc: "#23945a",
    kb: "#c47a12",
    chat: "#34c759",
    dorm: "#6a4fd8",
  },
  onSys: "#ffffff",
  sysTag: { bg: "rgba(150,150,185,0.14)", fg: "#55556a" }, // .sysp
  // สีโซนของไอคอนซ้ายบนตอน active (มติ 16) — เลขา = accent · ลูกค้า = เขียว · พนักงาน = คราม (เหมือนกันทั้งสองโหมด)
  zone: {
    secretary: "#16161c",
    customers: "#1f8f4a",
    team: "#5a64d8",
    onZone: "#ffffff",
  },
  bubbleUser: { from: "rgba(40,40,52,0.92)", to: "rgba(20,20,28,0.88)", fg: "#ffffff" }, // .ubb
  bubbleOther: { from: "rgba(255,255,255,0.74)", to: "rgba(255,255,255,0.42)", fg: "#1d1d24" }, // .oth .bb (กระจก)
  warn: { bg: "rgba(255,176,32,0.14)", fg: "#c47a12" }, // .why
  inputBg: "rgba(255,255,255,0.74)",
  chip: { bg: "rgba(150,150,185,0.12)", fg: "#6e6e73" }, // .chips span
  tab: { fg: "#555566" }, // .tabs span
  seg: { track: "rgba(150,150,185,0.12)", on: "#ffffff", onShadow: "0px 2px 8px rgba(100,100,150,0.15)", fg: "#6e6e73", onFg: "#111111" }, // .segw
  btnOff: { bg: "rgba(150,150,185,0.25)", fg: "#8e8e93" }, // .btn1.off
  dim: "rgba(40,40,60,0.28)",
  sheet: { from: "rgba(255,255,255,0.95)", to: "rgba(248,248,253,0.9)", grab: "#d1d1d6" },
  divider: "rgba(150,150,185,0.2)",
  // ลูกแก้ว .ao.o1
  orb: {
    hi: "rgba(255,255,255,0.95)",
    c1: "rgba(110,160,255,0.85)",
    c2: "rgba(160,220,255,0.85)",
    coreIn: "rgba(255,255,255,0.35)",
    coreMid: "rgba(228,228,244,0.75)",
    coreOut: "#ffffff",
    border: "rgba(255,255,255,0.9)",
    shadow: "inset -4px -6px 12px rgba(255,255,255,0.85), inset 3px 3px 10px rgba(160,160,200,0.25), 0px 6px 16px rgba(110,110,160,0.18)",
  },
  legacy: legacyLight,
};

type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? readonly Widen<U>[]
        : { readonly [K in keyof T]: Widen<T[K]> };

/** รูปของชุดสี — dark.ts ต้องมีคีย์ครบเท่านี้ */
export type Palette = Widen<typeof light>;
export type SysKey = keyof Palette["sys"];
export type ZoneKey = "secretary" | "customers" | "team";
