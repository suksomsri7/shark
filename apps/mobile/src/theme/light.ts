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
  danger: { bg: "#e5484d", fg: "#ffffff" }, // ปุ่มลบแดง (ปัดซ้าย "ลบแชท" K1 + ปุ่มยืนยันลบ · mock secretary-1114 จอ ③ · 14 พ.ย.)
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
  // ปฏิทินเลขา (CAL2.x · ColorKey ของสัญญา §4.1): สีเดียวกับตาราง "เปิดระบบ" ในชีตกิจการ (SYS_LOOK ของ BusinessSwitcherSheet: QUEUE/ACCOUNT/KANBAN/CRM/HR/HOTEL/TICKET)
  //   + remind/personal/google/device ตามภาพ cal-*.png · มืด = hue เดิมยกความสว่าง (dsys ของ gen.py)
  cal: { booking: "#3a7bd5", account: "#1e7a8f", kanban: "#b8860b", crm: "#c2456b", hr: "#8a5cd1", dorm: "#6a4fd8", ticket: "#c2456b", trips: "#178a99", remind: "#e07a1f", personal: "#2f9e5b", google: "#4285f4", device: "#ff3b30" },
  calTagAlpha: "1f", // พื้นป้ายระบบ = สีระบบ + alpha (แบบ 12%)
  // help-cases (15 พ.ย. · แบบ /root/mockups/secretary-help/help.html): สีขั้นของเคส · ร่องแถบความคืบหน้า · ตัวเลขยังไม่อ่าน (แดง) · วงรอบขั้นปัจจุบัน
  helpStage: { RECEIVED: "#5a64d8", CHECKING: "#3a7bd5", FIXING: "#e07a1f", NEED_INFO: "#c2456b", AWAITING_CONFIRM: "#2f9e5b", CLOSED: "#8e8e9c", track: "#e4e4ea", unread: "#e5484d", onStage: "#ffffff", haloAlpha: "33" },
  team: { tagBg: "rgba(58,123,213,0.1)", tagFg: "#3a6fc4", unreadBg: "#2f9e5b", unreadFg: "#ffffff", read: "#8e8e93", pendingAlpha: 0.55 }, // B27 แชททีม (team2.png): ป้ายบทบาทฟ้า · ตัวเลขยังไม่อ่านเขียว · แถวรอรับคำเชิญจาง
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
  approval: { border: "rgba(255,190,90,0.7)" }, // .apc (ขอบการ์ดรออนุมัติ)
  bad: { fg: "#d8436a" }, // ข้อความเตือนสีแดงอมชมพู (D1 "ไม่เห็นแชทลูกค้า" · ขั้นที่ล้ม · ปุ่มถอด) — S2.10
  // โซนลูกค้า (S2.17–S2.19 · แบบ K1–K5): สีป้ายช่องทาง · แถบเขียว "ลูกค้าเห็นข้อความ" · บันทึกภายใน (เส้นประส้ม) · Shark (ม่วง) · รอคน (ส้ม)
  channel: { LINE: "#06c755", WEBCHAT: "#5a64d8", FACEBOOK: "#1877f2", INSTAGRAM: "#d8436a", SHOPEE: "#ee4d2d", LAZADA: "#0f146d", WHATSAPP: "#25d366", TIKTOK: "#16161c", other: "#8e8e93" },
  cust: { bannerBg: "rgba(52,199,89,0.16)", bannerFg: "#1a7f3c", noteBg: "rgba(255,240,224,0.75)", noteBorder: "rgba(196,122,18,0.55)", ai: "#6a4fd8", aiBg: "rgba(106,79,216,0.09)", aiBorder: "rgba(106,79,216,0.55)", waiting: "#ff9f0a" },
  inputBg: "rgba(255,255,255,0.74)",
  // S2.14 F1: แถบรองใต้ปุ่ม/ช่องลอยล่าง (ไล่จากใส → พื้นจอทึบ) + พื้นทึบของช่องพิมพ์ — ข้อความการ์ดห้ามทะลุ
  dock: { fade: "rgba(251,251,253,0)", solid: "#fbfbfd", bar: "#ffffff" },
  chip: { bg: "rgba(150,150,185,0.12)", fg: "#6e6e73" }, // .chips span
  tab: { fg: "#555566" }, // .tabs span
  seg: { track: "rgba(150,150,185,0.12)", on: "#ffffff", onShadow: "0px 2px 8px rgba(100,100,150,0.15)", fg: "#6e6e73", onFg: "#111111" }, // .segw
  btnOff: { bg: "rgba(150,150,185,0.25)", fg: "#8e8e93" }, // .btn1.off
  dim: "rgba(40,40,60,0.28)",
  sheet: { from: "rgba(255,255,255,0.95)", to: "rgba(248,248,253,0.9)", grab: "#d1d1d6" },
  // Lekaa FAB (15 พ.ย. · แบบ fab6): ปุ่มลอยวงกลมขาว + วงแหวน/เงาม่วงอ่อน · ชิป 📍 อ้างอิงหน้า
  lekaa: { fabBg: "#ffffff", ring: "rgba(124,102,234,0.15)", shadow: "0px 8px 24px rgba(124,102,234,0.35)", refBg: "#eef2ff", refFg: "#2a3a8f", logoRing: "0px 2px 8px rgba(124,102,234,0.25)" },
  // แถบบน topbar2 (17 พ.ย. · เจ้าของอนุมัติ): สีของแต่ละระบบตามรหัส (fg = ไอคอนบนแถบ/ในแผ่น · bg = พื้นช่องในแผ่น) — ค่าจาก gen.py ของแบบ · รหัสที่แบบไม่มี = สี SYS_LOOK เดิม + พื้นจาง 12%
  // 17 พ.ย. (เจ้าของสั่งจากเครื่องจริง: ทีม/ปฏิทิน จัดลำดับได้ · เว้นที่เหนือแถวแรก): TEAM/CALENDAR = ช่องในตัวของแถบบน (สีเข้มเรียบแบบปุ่มโซนเดิม · แบบ topbar2 stroke #1b1b20)
  navSys: { HOME: { fg: "#44444c", bg: "#ededf0" }, TEAM: { fg: "#12a0c4", bg: "#e2f4f9" }, CALENDAR: { fg: "#e2622b", bg: "#fdebe3" }, QUEUE: { fg: "#3b6fd9", bg: "#e8eefc" }, HR: { fg: "#8a5bd6", bg: "#f0eafb" }, CHAT: { fg: "#2f9e5e", bg: "#e6f4ec" }, ACCOUNT: { fg: "#1f8a9a", bg: "#e3f1f3" }, INVENTORY: { fg: "#e08a2b", bg: "#fcefe0" }, CRM: { fg: "#c2416b", bg: "#fae6ec" }, KANBAN: { fg: "#c9951a", bg: "#faf1dc" }, MEMBER: { fg: "#5a5fd6", bg: "#e9eafb" }, COUPON: { fg: "#e5484d", bg: "#fde8e8" }, REWARD: { fg: "#d6458f", bg: "#fbe6f1" }, KB: { fg: "#2a6fd6", bg: "#e5eefb" }, PAGES: { fg: "#66666e", bg: "#ededf0" }, HOTEL: { fg: "#6a4fd8", bg: "#edeafa" }, RESTAURANT: { fg: "#e07a1f", bg: "#fbefe4" }, SHOP: { fg: "#d9488f", bg: "#fae9f2" }, BOOKING: { fg: "#178a99", bg: "#e3f1f3" }, TICKET: { fg: "#c2456b", bg: "#f8e9ed" }, POINT: { fg: "#e08a00", bg: "#fbf1e0" }, MEETING: { fg: "#3a7bd5", bg: "#e7effa" }, POS: { fg: "#e07a1f", bg: "#fbefe4" }, MARKETING: { fg: "#e5484d", bg: "#fce9ea" }, RENTAL: { fg: "#2f9e5b", bg: "#e6f3eb" }, SCHOOL: { fg: "#5b5fd6", bg: "#ebecfa" }, CLINIC: { fg: "#e5484d", bg: "#fce9ea" }, other: { fg: "#666666", bg: "#ededed" } },
  // ไอคอนกิจการวงกลม (BizIcon · bizsheet4): ชุดสีพื้นเมื่อร้านไม่ได้ตั้งสีแบรนด์ (เลือกตามชื่อ คงที่ต่อร้าน) · ตัวอักษร · เงาลูกศรเล็ก — ย้ายจาก SecTopBar (17 พ.ย. · ห้ามสีฝังในคอมโพเนนต์)
  biz: { palette: ["#1E7A8F", "#E07A1F", "#5B5FD6", "#2F9E5B", "#C2456B", "#8A5CD1", "#B8860B", "#3A7BD5"], fg: "#FFFFFF", chevShadow: "#000000" },
  // แผ่นดึงลงจากแถบบน (topbar2 จอ 2–4): พื้นแผ่น · เงา · กรอบเส้นประของช่องที่จะวาง · เงาไอคอนที่ยก · ลิงก์ "จัดลำดับ" · ขอบจางของแถบเลื่อน · ปุ่มกลมบนแถบ
  topPanel: { panelFade: "rgba(251,251,253,0)", bg: "#fbfbfd", shadow: "0px 18px 40px rgba(0,0,0,0.2)", slot: "#b9b9c6", lift: "0px 14px 26px rgba(0,0,0,0.28)", link: "#5a5fd6", fade: "rgba(251,251,253,0)", fadeTo: "#fbfbfd", btn: "#ffffff", btnShadow: "0px 2px 8px rgba(0,0,0,0.07)" },
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
