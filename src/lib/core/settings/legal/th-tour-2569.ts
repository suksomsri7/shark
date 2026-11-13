// ─────────────────────────────────────────────────────────────
// th-tour-2569.ts — ตัวตรวจกฎหมายทัวร์ · เดย์ทริป · Liveaboard · เอเจนซี่ · ตั๋ว (คำเตือน W01–W46) · RUN TRIPS T0.1
// ที่มา: ledger/TRIPS-DEFAULTS.md §4 (ข้อความ · ที่มา · ความสำคัญ) · สัญญา ledger/TRIPS-CORE-CONTRACT.md §E.5 · ใบสั่ง T0.1 §3.3
//
// 🔴 ระดับสูงสุด = WARN — ไม่มีทางคืน BLOCK ในทุกกรณี (rule ไม่รู้จัก/อินพุตผิดรูป/โยนภายใน = WARN "INVALID_INPUT_WARN")
//    ร้านบันทึกค่าได้เสมอ · severity = ลำดับการแสดงผลเท่านั้น (ไม่ใช่ระดับที่สาม)
// 🔴 pure ล้วน: ไม่มี import · ไม่สุ่ม · อ่านนาฬิกาที่เดียว (W29 "เก่ากว่า 180 วันจากวันนี้" — ส่ง opts.now แทนได้)
// ข้อความใช้คำกลาง ไม่กล่าวโทษผู้ใช้ · ข้อที่มาจาก U ใช้ "โปรดตรวจกับ…" (TRIPS-DEFAULTS §4)
// ⚠️ ไม่ใช่คำปรึกษากฎหมาย/ภาษี — เกณฑ์ตามที่ TRIPS-DEFAULTS คัดจาก LEGAL-TRIPS-TH / skill shark-thai-law
// ─────────────────────────────────────────────────────────────

export const TOUR_RULE_IDS = [
  "W01", "W02", "W03", "W04", "W05", "W06", "W07", "W08", "W09", "W10",
  "W11", "W12", "W13", "W14", "W15", "W16", "W17", "W18", "W19", "W20",
  "W21", "W22", "W23", "W24", "W25", "W26", "W27", "W28", "W29", "W30",
  "W31", "W32", "W33", "W34", "W35", "W36", "W37", "W38", "W39", "W40",
  "W41", "W42", "W43", "W44", "W45", "W46",
] as const;
export type TourRuleId = (typeof TOUR_RULE_IDS)[number];
export type TourSeverity = "NORMAL" | "HIGH" | "HIGHEST";
export type TourCheckpoint = "SETTINGS" | "RUNTIME";
export type TourVerdict = {
  level: "OK" | "WARN";
  /** "OK" | "W01".."W46" | "INVALID_INPUT_WARN" */
  code: string;
  messageTh: string;
  citation: string;
  severity: TourSeverity;
  pendingReview?: true;
};
/** now = นาฬิกาที่ใช้ (ไม่ส่ง = เวลาเครื่อง) · skipTimeDependent = ข้ามเงื่อนไขที่ขึ้นกับวันนี้ (W29 · ตัวตรวจทะเบียนตอนโหลดใช้ — ค่าเริ่มต้องไม่เปลี่ยนผลตามวัน) */
export type TourEvalOpts = { now?: Date; skipTimeDependent?: boolean };
export type TourRule = {
  id: TourRuleId;
  maxLevel: "WARN";
  severity: TourSeverity;
  checkpoint: TourCheckpoint;
  messageTh: string;
  citation: string;
  pendingReview?: true;
  evaluate(input: unknown, opts?: TourEvalOpts): TourVerdict;
};
/**
 * อินพุตของ rule จุดตรวจ RUNTIME — ผู้เรียกคำนวณเงื่อนไขเอง (A1.1 ปรับรูปข้อ WHT ได้)
 * rule จุดตรวจ SETTINGS ก็รับรูปนี้ได้เมื่อเงื่อนไขเกิดตอนทำงานจริง (เช่น W26 กลุ่มจริงเกินอัตรา · W29 e-ticket ไม่ตรง)
 * variant = ข้อความทางเลือกของ rule (TOUR_RULE_VARIANTS) · ไม่ส่ง = ข้อความหลัก
 */
export type TourRuntimeInput = { hit: boolean; vars?: Record<string, string | number>; variant?: string };

export const INVALID_INPUT_WARN = "INVALID_INPUT_WARN";

// ─────────────────── เกณฑ์จากประกาศ/ระเบียบ (ค่าของตัวตรวจ ไม่ใช่ค่าของร้าน · ร้านตั้งค่าของตัวเองได้เสมอ) ───────────────────

/** W01 ขั้นต่ำตามประกาศคืนเงิน พ.ศ. 2563: ≥ 30 วัน คืน 100 · 15–29 วัน คืน 50 · น้อยกว่านั้น 0 */
const REFUND_FLOOR: readonly { fromDaysBefore: number; minPct: number; rangeTh: string }[] = [
  { fromDaysBefore: 30, minPct: 100, rangeTh: "30 วันขึ้นไปก่อนเดินทาง" },
  { fromDaysBefore: 15, minPct: 50, rangeTh: "15–29 วันก่อนเดินทาง" },
];
/**
 * TRIPS T0.7 ▸ ขั้นต่ำที่ต้องคืน (%) ณ จำนวนวันก่อนเดินทาง ตามประกาศคณะกรรมการธุรกิจนำเที่ยวและมัคคุเทศก์ เรื่องการคืนเงิน พ.ศ. 2563 (ม.28 พ.ร.บ.ธุรกิจนำเที่ยวฯ)
 * อ่านจากตาราง REFUND_FLOOR ตัวเดียวกับ W01 (แหล่งเดียว) · ไม่มีขั้นที่ใช้ ⇒ 0 · หลังวันเดินทาง (d < 0) / ไม่ใช่จำนวนเต็ม ⇒ null (ไม่ตรวจ)
 * ผู้ใช้: trips/refund.ts (คำเตือน REFUND_BELOW_STATUTORY_MINIMUM · ระดับสูงสุด WARN — ไม่บล็อก) ◂
 */
export function tourRefundFloorPctAt(daysBefore: number): number | null {
  if (!Number.isInteger(daysBefore) || daysBefore < 0) return null;
  return REFUND_FLOOR.find((f) => daysBefore >= f.fromDaysBefore)?.minPct ?? 0;
}
/** W25 วงเงินประกันอุบัติเหตุขั้นต่ำต่อคน (ประกาศ 20 ก.ย. 2561) — สตางค์ */
const INSURANCE_FLOOR = { deathDisabilitySatang: 100_000_000, injurySatang: 50_000_000 } as const;
/** W26 แขกสูงสุดต่อผู้ควบคุม 1 คน (ประกาศ ทส. 2568) */
const DIVE_RATIO_CAP = { scuba: 4, trial: 2, course: 4, snorkel: 20 } as const;
const DIVE_RATIO_TH = "ดำน้ำลึก 1:4 · ทดลองเรียน 1:2 · คอร์ส 1:4 · ดำน้ำตื้น 1:20";
/** W29 วันที่ร้านยืนยันตารางค่าอุทยานเก่ากว่านี้ ⇒ เตือน (ข้อเสนอ) */
const PARK_FEE_STALE_DAYS = 180;
/** W30 ช่วงอายุ/ความสูงตามระเบียบกรมอุทยานฯ 2564 */
const PARK_AGE_BANDS = { freeBelow: 3, childFrom: 3, childTo: 14, adultFrom: 15, thaiSeniorFreeFrom: 60, childByHeightCm: 140 } as const;
const PARK_AGE_TH: Record<keyof typeof PARK_AGE_BANDS, string> = {
  freeBelow: "ฟรีต่ำกว่า 3 ปี",
  childFrom: "เด็กตั้งแต่ 3 ปี",
  childTo: "เด็กถึง 14 ปี",
  adultFrom: "ผู้ใหญ่ตั้งแต่ 15 ปี",
  thaiSeniorFreeFrom: "คนไทย 60 ปีขึ้นไปฟรี",
  childByHeightCm: "เด็กตามความสูงไม่เกิน 140 ซม.",
};
/** W33 เอกสารภาษีเก็บไม่น้อยกว่า 5 ปี (ประมวลรัษฎากร ม.87/3) — วัน */
const TAX_DOCS_MIN_DAYS = 1825;
const RETENTION_FIELDS = ["passportImageDays", "medicalFormDays", "riskAckDays", "consentAccessLogDays", "manifestDays", "taxDocsDays"] as const;
const TIERS_W02 = ["EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"] as const;

/** W38 ถ้อยคำยกเว้นความรับผิดทุกกรณี/ต่อชีวิตร่างกาย (เทียบแบบตัดช่องว่าง · ตัวพิมพ์เล็ก) */
export const WAIVER_FORBIDDEN_TERMS: readonly string[] = [
  "ไม่รับผิดชอบทุกกรณี",
  "ไม่รับผิดชอบใดๆทั้งสิ้น",
  "ไม่รับผิดชอบใด ๆ ทั้งสิ้น",
  "สละสิทธิ์เรียกร้อง",
  "สละสิทธิเรียกร้อง",
  "ยกเว้นความรับผิด",
  "ไม่ต้องรับผิดต่อชีวิต",
  "waive all claims",
  "not liable for any",
  "release from all liability",
  "hold harmless",
];

// ─────────────────── ตัวช่วยอ่านอินพุต (ไม่โยน · ผิดรูป ⇒ null) ───────────────────

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const own = (o: Rec, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
/** ออบเจกต์ที่มีเฉพาะคีย์ที่อนุญาต (คีย์บังคับต้องมีครบ) */
const shapeOk = (o: unknown, required: readonly string[], optional: readonly string[] = []): o is Rec => {
  if (!isRec(o)) return false;
  for (const k of required) if (!own(o, k)) return false;
  const allowed = new Set([...required, ...optional]);
  return Object.keys(o).every((k) => allowed.has(k));
};
/** เทียบถ้อยคำ: NFKC (ตัวเต็มความกว้าง → ปกติ) · ตัดอักขระมองไม่เห็น (zero-width · soft hyphen · BOM) · ตัดช่องว่าง · ตัวพิมพ์เล็ก */
const normalizeText = (s: string): string => s.normalize("NFKC").replace(/[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "").toLowerCase().replace(/\s+/g, "");
const ymdUtc = (s: unknown): number | null => {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : null;
};
const DAY_MS = 86_400_000;
const BKK_OFFSET_MS = 7 * 3_600_000;
/** วันนี้ตามเวลาไทย (เที่ยงคืน UTC ของวันที่ไทยนั้น) — ไม่ใช้ getDay/getDate ของเครื่อง */
const bkkTodayUtc = (now: Date): number => Math.floor((now.getTime() + BKK_OFFSET_MS) / DAY_MS) * DAY_MS;

type LadderStep = { fromDaysBefore: number; refundPct: number };
const readLadder = (v: unknown): LadderStep[] | null => {
  if (!Array.isArray(v)) return null;
  const out: LadderStep[] = [];
  for (const s of v) {
    if (!shapeOk(s, ["fromDaysBefore", "refundPct"]) || !isInt(s.fromDaysBefore, 0, 100_000) || !isInt(s.refundPct, 0, 100)) return null;
    out.push({ fromDaysBefore: s.fromDaysBefore, refundPct: s.refundPct });
  }
  return out;
};
/** ช่วงวันที่ตารางคืนน้อยกว่าขั้นต่ำ (ว่าง = ไม่ต่ำกว่า) — refund(d) = ขั้นที่ fromDaysBefore มากที่สุดที่ ≤ d (ไม่มีขั้น = 0) */
const ladderShortfalls = (ladder: readonly LadderStep[]): string[] => {
  const steps = [...ladder].sort((a, b) => b.fromDaysBefore - a.fromDaysBefore);
  const refund = (d: number): number => steps.find((s) => s.fromDaysBefore <= d)?.refundPct ?? 0;
  const floorAt = (d: number) => REFUND_FLOOR.find((f) => d >= f.fromDaysBefore);
  const points = new Set<number>(REFUND_FLOOR.map((f) => f.fromDaysBefore));
  for (const s of steps) points.add(s.fromDaysBefore);
  const hit = new Set<string>();
  for (const d of points) {
    const f = floorAt(d);
    if (f && refund(d) < f.minPct) hit.add(f.rangeTh);
  }
  return REFUND_FLOOR.map((f) => f.rangeTh).filter((r) => hit.has(r));
};
const readEnum = <T extends string>(v: unknown, values: readonly T[]): T | null => (typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : null);
const readRuntime = (v: unknown): TourRuntimeInput | null => {
  if (!shapeOk(v, ["hit"], ["vars", "variant"]) || typeof v.hit !== "boolean") return null;
  if (v.variant !== undefined && typeof v.variant !== "string") return null;
  const variant = typeof v.variant === "string" ? { variant: v.variant } : {};
  if (v.vars === undefined) return { hit: v.hit, ...variant };
  if (!isRec(v.vars)) return null;
  const vars: Record<string, string | number> = Object.create(null) as Record<string, string | number>; // ไม่มี prototype (คีย์ "__proto__" จากอินพุตไม่ปน)
  for (const [k, x] of Object.entries(v.vars)) {
    if (typeof x === "string" || (typeof x === "number" && Number.isFinite(x))) vars[k] = x;
    else return null;
  }
  return { hit: v.hit, vars, ...variant };
};
const fill = (text: string, vars: Record<string, string | number> | undefined): string =>
  text.replace(/\{([^{}]+)\}/g, (m, name: string) => {
    const x = vars?.[name.trim()];
    void m;
    return x === undefined ? "—" : String(x); // ตัวแปรที่ผู้เรียกไม่ส่ง ⇒ "—" (ไม่ปล่อย {…} ให้ผู้ใช้เห็น)
  });

// ─────────────────── ทะเบียน rule ───────────────────

type Meta = { severity: TourSeverity; checkpoint: TourCheckpoint; messageTh: string; citation: string; pendingReview?: true };
/** ผลของตัวประเมินเฉพาะ rule: null = อินพุตผิดรูป · false = ไม่เตือน · { vars } = เตือน (vars แทนในข้อความ) */
type Judge = (input: unknown, now: Date, opts: TourEvalOpts) => null | false | { vars?: Record<string, string | number>; messageTh?: string };

const META: Record<TourRuleId, Meta> = {
  W01: {
    severity: "HIGH",
    checkpoint: "SETTINGS",
    messageTh: "ตารางนี้คืนเงินน้อยกว่าอัตราขั้นต่ำตามประกาศคณะกรรมการธุรกิจนำเที่ยวและมัคคุเทศก์ พ.ศ. 2563 (ม.28) ในช่วง {ช่วงวัน} — ถ้าต้องหักเพิ่ม หักได้เฉพาะค่าใช้จ่ายที่จ่ายจริงและมีหลักฐาน",
    citation: "ประกาศคณะกรรมการธุรกิจนำเที่ยวและมัคคุเทศก์ เรื่องการคืนเงิน พ.ศ. 2563 · พ.ร.บ.ธุรกิจนำเที่ยวและมัคคุเทศก์ ม.28 (TRIPS-DEFAULTS §4 · L8 · N17 · T-TOUR-05)",
  },
  W02: {
    severity: "HIGH",
    checkpoint: "SETTINGS",
    messageTh: "การยกเลิกที่ไม่ได้มาจากลูกค้าควรคืนเงินเต็มจำนวน (ประกาศคืนเงิน พ.ศ. 2563 ข้อ 5 · ม.28 วรรคสอง)",
    citation: "ประกาศคืนเงิน พ.ศ. 2563 ข้อ 5 · พ.ร.บ.ธุรกิจนำเที่ยวฯ ม.28 วรรคสอง (N17 · LG §3.4)",
  },
  W03: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "มัดจำที่ริบได้สูงเกินส่วน ศาลลดให้เหลือเท่าความเสียหายจริงได้ (พ.ร.บ.ข้อสัญญาที่ไม่เป็นธรรม ม.7)",
    citation: "พ.ร.บ.ว่าด้วยข้อสัญญาที่ไม่เป็นธรรม พ.ศ. 2540 ม.7 (N25 · LG §6.2 · §8.4 ข้อ 4)",
  },
  W04: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "รายการหักนี้ยังไม่มีหลักฐาน — ประกาศคืนเงินให้หักได้เฉพาะค่าใช้จ่ายที่จ่ายจริงและแสดงหลักฐานให้ลูกค้าทราบ",
    citation: "ประกาศคืนเงิน พ.ศ. 2563 ข้อ 6 (LG §3.4 ข้อ 6 · T-TOUR-04)",
  },
  W05: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "บรรทัดนี้ติดธงเก็บแทน แต่ยอดไม่ตรงอัตราทางการ/ยังไม่มีหลักฐาน — อาจต้องรวมเป็นฐาน VAT โปรดตรวจกับนักบัญชีของร้าน",
    citation: "ประมวลรัษฎากร ม.79 (เงินที่รับแทน) (L5 · LG §1.3 · T-VAT-04)",
    pendingReview: true,
  },
  W06: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "เงินเก็บแทนต้องเก็บเท่าที่จ่ายจริง และส่วนลดที่ได้ต้องคืนลูกค้าทั้งหมด — บวกเพิ่มแม้เล็กน้อยทำให้ทั้งก้อนเข้าฐาน VAT",
    citation: "ประมวลรัษฎากร ม.79 (เงินที่รับแทน · เงื่อนไข 2 และ 4) (N11 · LG §1.3)",
  },
  W07: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ค่านายหน้าที่จ่ายให้บุคคลธรรมดาหักตาม ม.50(1) อัตราก้าวหน้า ยื่น ภ.ง.ด.1 (เว้นผู้รับทำเป็นธุรกิจ) — โปรดยืนยันกับนักบัญชีของร้าน",
    citation: "ประมวลรัษฎากร ม.50(1) (N1 · LG §8.4 ข้อ 6 · T-WHT-02)",
    pendingReview: true,
  },
  W08: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ผู้รับอยู่ต่างประเทศ: ค่าเริ่มต้นไม่หัก ณ ที่จ่าย แต่แหล่งข้อมูลทางการยังขัดกันบางกรณี — โปรดให้นักบัญชีของร้านยืนยัน",
    citation: "ประมวลรัษฎากร ม.70 · ข้อหารือกรมสรรพากร (N6 · LG §2.1 · T-WHT-04)",
    pendingReview: true,
  },
  W09: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ร้านที่เป็นบุคคลธรรมดาไม่มีหน้าที่หักภาษีเมื่อจ่ายค่านายหน้าให้บริษัท (ท.ป.4/2528 ข้อ 3/1) — ถ้าหักไว้ ผู้รับอาจขอคืนกับร้าน",
    citation: "คำสั่งกรมสรรพากร ท.ป.4/2528 ข้อ 3/1 (N3 · T-WHT-03)",
  },
  W10: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "รายการนี้ยังไม่ได้กรอกภาษีหัก ณ ที่จ่าย (ม.50(1)) — ระบบเสนอยอดจากยอดสะสมทั้งปีให้ โปรดยืนยันกับนักบัญชี",
    citation: "ประมวลรัษฎากร ม.50(1) (N1 · LG §9 ข้อ 2)",
    pendingReview: true,
  },
  W11: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "อัตรา e-Withholding 1% ใช้ถึง 31 ธ.ค. 2570 — รายการนี้ระบบใช้ 3%",
    citation: "มาตรการ e-Withholding Tax (N4 · T-WHT-05)",
  },
  W12: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ยังไม่มีราคาที่เอเจนซี่ขายจริง — ร้านต้องใช้ตัวเลขนี้ออกใบกำกับให้ลูกค้าและคิดภาษีหักจากผลต่าง",
    citation: "ประมวลรัษฎากร ม.86/6 · ม.40(2) (N8 · T-VAT-09 · T-WHT-08)",
  },
  W13: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "โหมดเอเจนซี่ซื้อมาขายไปในนามตัวเอง ยังไม่มีแนวทางทางการตอบตรง — ข้อสัญญากับเอเจนซี่เป็นตัวตัดสิน โปรดตรวจกับนักบัญชีของร้าน",
    citation: "LEGAL-TRIPS-TH §9 ข้อ 5 (TA §13.1 L7)",
    pendingReview: true,
  },
  W14: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "ใบกำกับที่ออกผ่านตัวแทนต้องเป็นแบบเต็มรูป (ม.86/6 วรรคสอง)",
    citation: "ประมวลรัษฎากร ม.86/6 วรรคสอง (N10)",
  },
  W15: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "ยังไม่มีแนวทางทางการเรื่องริบมัดจำหลังออกใบกำกับ — โปรดตรวจกับนักบัญชีของร้านก่อนใช้ค่านี้",
    citation: "LEGAL-TRIPS-TH §9 ข้อ 4 (N12)",
    pendingReview: true,
  },
  W16: {
    severity: "HIGH",
    checkpoint: "SETTINGS",
    messageTh: "ภาษีของบริการเกิดเมื่อรับเงิน รวมมัดจำ (ม.78/1(1)) — ปิดค่านี้แล้วงวดมัดจำจะไม่มีใบกำกับ",
    citation: "ประมวลรัษฎากร ม.78/1(1) (L4 · T-VAT-01)",
  },
  W17: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "เงินค่าเสียหายจากการยกเลิกโดยทั่วไปไม่อยู่ในบังคับ VAT และไม่หัก ณ ที่จ่าย — ใช้ค่านี้เมื่อเป็นค่าตอบแทนงานที่ทำแล้วจริง",
    citation: "LEGAL-TRIPS-TH §1.5 (T-VAT-07)",
  },
  W18: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "บริการนำเที่ยวเสีย VAT 7% ทั้งก้อน รวมทริปออกนอกประเทศ (ไม่มีอัตรา 0%) — ตัวเลือกยกเว้นใช้กับรับส่งล้วนหรือพิพิธภัณฑ์/สวนสัตว์",
    citation: "ประมวลรัษฎากร ม.81(1)(ณ) · ม.80/1 (N13 · N15 · T-VAT-02)",
  },
  W19: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ยอดขายปีนี้ใกล้เกณฑ์จดทะเบียน VAT 1,800,000 บาท/ปี (ม.81/1)",
    citation: "ประมวลรัษฎากร ม.81/1 (LG §1.4 · skill §4)",
  },
  W20: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "ร้านควรใช้แหล่งอัตราแลกเปลี่ยนวิธีเดียวตลอด — การจองเดิมยังใช้อัตราที่จดไว้",
    citation: "ประมวลรัษฎากร ม.79/4 (LG §1.4 · T-VAT-08)",
  },
  W21: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ข้อมูลที่เอกสารชี้ชวนควรมียังขาด: {รายการ}",
    citation: "พ.ร.บ.ธุรกิจนำเที่ยวฯ ม.26 (L9 · LG §3.3 · T-TOUR-02)",
  },
  W22: {
    severity: "HIGHEST",
    checkpoint: "RUNTIME",
    messageTh: "ราคานี้ต่ำกว่าต้นทุนของรอบ — ม.31 ห้ามจัดนำเที่ยวโดยเก็บค่าบริการไม่เพียงพอกับค่าใช้จ่าย (มีโทษจำคุก/ปรับ)",
    citation: "พ.ร.บ.ธุรกิจนำเที่ยวและมัคคุเทศก์ ม.31 (L10 · N20 · T-TOUR-06)",
  },
  W23: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "การจองนี้รับเงินแล้ว — การเปลี่ยนรายการต้องแจ้งลูกค้าและได้รับความยินยอม (ม.27 · ม.29) และเก็บเงินเพิ่มได้เฉพาะรายการที่ตกลงไว้ (ม.30)",
    citation: "พ.ร.บ.ธุรกิจนำเที่ยวฯ ม.27 · ม.29 · ม.30 (LG §3.3 · T-TOUR-07)",
  },
  W24: {
    severity: "HIGH",
    checkpoint: "RUNTIME",
    messageTh: "ประกันอุบัติเหตุของรอบนี้ยังไม่ครบ: {สิ่งที่ขาด} — ธุรกิจนำเที่ยวต้องจัดประกันไม่ต่ำกว่า 1,000,000/500,000 บาทต่อคน และทริปดำน้ำลึกต้องคุ้มครองการดำน้ำ",
    citation: "ประกาศคณะกรรมการธุรกิจนำเที่ยวฯ เรื่องประกันอุบัติเหตุ (20 ก.ย. 2561) (L14 · N19 · T-TOUR-08)",
  },
  W25: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "วงเงินนี้ต่ำกว่าที่ประกาศกำหนด (ประกาศ 20 ก.ย. 2561)",
    citation: "ประกาศคณะกรรมการธุรกิจนำเที่ยวฯ เรื่องประกันอุบัติเหตุ (20 ก.ย. 2561) (N19)",
  },
  W26: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "กลุ่มนี้มีแขกต่อผู้ควบคุมเกินอัตราในประกาศกระทรวง ทส. พ.ศ. 2568 ({อัตรา})",
    citation: "ประกาศกระทรวงทรัพยากรธรรมชาติและสิ่งแวดล้อม พ.ศ. 2568 (N22 · T-MAR-05)",
  },
  W27: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ลูกค้าคนนี้ยังไม่ถึงเกณฑ์นำกล้องลงดำน้ำลึก (AOW หรือ 40 ไดฟ์ขึ้นไป)",
    citation: "ประกาศ ทส. พ.ศ. 2568 ข้อ 5(8) (N22 · LG §4.5)",
  },
  W28: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ผู้โดยสารเกินจำนวนในใบอนุญาตใช้เรือ (ม.169) · เรือ 60 ตันกรอสส์ขึ้นไปต้องแจ้งกำหนดออกเรือล่วงหน้าไม่น้อยกว่า 6 ชั่วโมง (ม.21)",
    citation: "พ.ร.บ.การเดินเรือในน่านน้ำไทย ม.169 · ม.21 (LG §4.1 · T-MAR-06)",
  },
  W29: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "โปรดตรวจอัตราปัจจุบันกับกรมอุทยานฯ (ร้านยืนยันล่าสุด {วันที่})",
    citation: "ระเบียบกรมอุทยานแห่งชาติ สัตว์ป่า และพันธุ์พืช พ.ศ. 2564 (LG §4.3–4.4 · §8.4 ข้อ 11)",
    pendingReview: true,
  },
  W30: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "ค่านี้ต่างจากระเบียบกรมอุทยานฯ พ.ศ. 2564 ({ค่าในระเบียบ})",
    citation: "ระเบียบกรมอุทยานแห่งชาติ สัตว์ป่า และพันธุ์พืช พ.ศ. 2564 (N21 · T-MAR-01..02)",
  },
  W31: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ส่งออก ตม.3/1 ยังไม่ครบ: {รายชื่อและช่องที่ขาด}",
    citation: "แบบ ตม.3/1 (N23 · T-MAR-04)",
  },
  W32: {
    severity: "HIGH",
    checkpoint: "RUNTIME",
    messageTh: "ข้อมูลสุขภาพเก็บได้เมื่อจำเป็นกับกิจกรรมและได้รับความยินยอมชัดแจ้งแยกจากข้อตกลงอื่น (PDPA ม.19 · ม.26)",
    citation: "พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ม.19 · ม.26 (LG §5.1–5.2 · T-PDPA-01)",
  },
  W33: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "ข้อมูลส่วนบุคคลต้องลบเมื่อพ้นกำหนดเก็บ (ม.37(3))",
    citation: "พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล ม.37(3) · ประมวลรัษฎากร ม.87/3 (LG §5.3 · T-PDPA-05)",
  },
  W34: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "เอเจนซี่ที่ขายไม่จำเป็นต้องเห็นข้อมูลสุขภาพ — เปิดแล้วร้านต้องแจ้งลูกค้าในประกาศความเป็นส่วนตัว (ม.23(4) · ม.27)",
    citation: "พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล ม.23(4) · ม.27 (L12 · T-PDPA-03)",
  },
  W35: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ร้านที่เก็บข้อมูลสุขภาพต้องทำบันทึกรายการกิจกรรมประมวลผล (ม.39) — ระบบร่างให้แล้ว",
    citation: "พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล ม.39 (N24 · LG §5.4)",
  },
  W36: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "คำขอของ {ชื่อ} ครบกำหนด {วันที่}",
    citation: "พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล ม.30 · ประกาศ สคส. 2567 (T-PDPA-06)",
  },
  W37: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ผู้เดินทางอายุไม่เกิน 10 ปี ผู้ปกครองต้องให้ความยินยอมแทน (ม.20)",
    citation: "พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล ม.20 (N24 · T-PDPA-02)",
  },
  W38: {
    severity: "NORMAL",
    checkpoint: "SETTINGS",
    messageTh: "ข้อยกเว้นความรับผิดต่อชีวิต ร่างกาย หรืออนามัยใช้อ้างไม่ได้ (พ.ร.บ.ข้อสัญญาที่ไม่เป็นธรรม ม.8) — เอกสารยังใช้พิสูจน์ว่าแจ้งความเสี่ยงแล้วได้",
    citation: "พ.ร.บ.ว่าด้วยข้อสัญญาที่ไม่เป็นธรรม พ.ศ. 2540 ม.8 (L11 · T-SIGN-02)",
  },
  W39: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "กิจการนำเที่ยวต้องมีใบอนุญาตตาม พ.ร.บ.ธุรกิจนำเที่ยวและมัคคุเทศก์ — SHARK ไม่ตรวจสิทธิ์ให้ ค่าเริ่มต้นด้านภาษีและการคืนเงินตั้งตามแนวปฏิบัติทั่วไป โปรดตรวจกับนักบัญชีของร้าน",
    citation: "พ.ร.บ.ธุรกิจนำเที่ยวและมัคคุเทศก์ พ.ศ. 2551 (L15 · LG §8.4 ข้อ 1 · T-TOUR-01)",
  },
  W40: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ใบอนุญาตนำเที่ยวหมดอายุ {วันที่} — ยื่นต่ออายุได้ภายใน 30 วันก่อนหมดอายุ (ม.22/1)",
    citation: "พ.ร.บ.ธุรกิจนำเที่ยวฯ ม.22/1 (N18)",
  },
  W41: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ร้านที่ขายออนไลน์: โปรดตรวจว่าขึ้นทะเบียน SME หรือจดทะเบียนตลาดแบบตรงแล้ว",
    citation: "พ.ร.บ.ขายตรงและตลาดแบบตรง (LG §6.3 · §8.4 ข้อ 14)",
    pendingReview: true,
  },
  W42: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "โปรดตรวจกับ ตม. ท้องที่ว่าต้องแจ้งที่พัก (ตม.30) หรือไม่",
    citation: "พ.ร.บ.คนเข้าเมือง ม.38 (LG §4.2)",
    pendingReview: true,
  },
  W43: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "การนับเกณฑ์ 1,000 บาทต่อสัญญาสำหรับค่าคอมฯ รายใบจองยังไม่มีแนวทางตอบตรง — โปรดตรวจกับนักบัญชีของร้าน",
    citation: "คำสั่งกรมสรรพากร ท.ป.4/2528 (LG §2.2 · §9 ข้อ 8)",
    pendingReview: true,
  },
  W44: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "ร้านยังมีหน้าที่หักภาษีแม้เอเจนซี่เป็นผู้เก็บเงิน (กค 0811/11473) — ให้เอเจนซี่นำส่งแทนได้เมื่อมีหนังสือแต่งตั้งและมอบอำนาจเป็นลายลักษณ์อักษร · สูตรยอดส่งร้านโปรดยืนยันกับนักบัญชี",
    citation: "ข้อหารือกรมสรรพากร กค 0811/11473 (N7 · LG §2.4)",
    pendingReview: true,
  },
  W45: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "บันทึกส่วนต่าง 3% เป็น \"ถูกหัก ณ ที่จ่าย\" ได้ — อย่าลืมรับหนังสือรับรอง 50 ทวิ จากลูกค้า",
    citation: "ประมวลรัษฎากร ม.50 ทวิ · ท.ป.4/2528 (N9 · T-WHT-10 · LG §9 ข้อ 5)",
    pendingReview: true,
  },
  W46: {
    severity: "NORMAL",
    checkpoint: "RUNTIME",
    messageTh: "เอเจนซี่ {ชื่อ} ใช้วงเงินเกิน/ค้างชำระเกินกำหนด {ยอด}",
    citation: "กติกาการค้าตามสัญญาเอเจนซี่ (TA §2.4 · ภาพ 10)",
  },
};

/** ตัวประเมินของ rule จุดตรวจ SETTINGS (อินพุต = ค่าของคีย์ที่ผูก `legal` · ใบสั่ง §3.3 · §4.4) */
const SETTINGS_JUDGES: Partial<Record<TourRuleId, Judge>> = {
  W01: (input) => {
    const ladder = readLadder(input);
    if (!ladder) return null;
    const short = ladderShortfalls(ladder);
    return short.length ? { vars: { "ช่วงวัน": short.join(" และ ") } } : false;
  },
  W02: (input) => {
    if (!shapeOk(input, TIERS_W02)) return null;
    if (!TIERS_W02.every((k) => isInt(input[k], 0, 100))) return null;
    return TIERS_W02.some((k) => (input[k] as number) < 100) ? {} : false;
  },
  W03: (input) => {
    if (!shapeOk(input, ["ladder", "depositPct"])) return null;
    const ladder = readLadder(input.ladder);
    if (!ladder || !isInt(input.depositPct, 0, 100)) return null;
    return input.depositPct > 0 && ladderShortfalls(ladder).length > 0 ? {} : false;
  },
  W14: (input) => {
    const forms = ["SHORT_UPGRADE_ON_REQUEST", "FULL_ONLY"] as const;
    if (!shapeOk(input, ["direct", "viaAgent"]) || !readEnum(input.direct, forms) || !readEnum(input.viaAgent, forms)) return null;
    return input.viaAgent !== "FULL_ONLY" ? {} : false;
  },
  W15: (input) => {
    const v = readEnum(input, ["NO_AUTO_CREDIT_NOTE", "CREDIT_NOTE_PLUS_DAMAGES_RECEIPT"] as const);
    if (!v) return null;
    return v === "CREDIT_NOTE_PLUS_DAMAGES_RECEIPT" ? {} : false;
  },
  W16: (input) => (typeof input !== "boolean" ? null : input === false ? {} : false),
  W17: (input) => {
    const v = readEnum(input, ["DAMAGES_NO_VAT_NO_WHT", "SERVICE_WITH_VAT"] as const);
    if (!v) return null;
    return v === "SERVICE_WITH_VAT" ? {} : false;
  },
  W18: (input) => {
    if (!shapeOk(input, ["mode", "rateBp"]) || !readEnum(input.mode, ["STANDARD", "EXEMPT_81_1_N"] as const) || !isInt(input.rateBp, 0, 10_000)) return null;
    return input.mode === "EXEMPT_81_1_N" ? {} : false;
  },
  W20: (input) => {
    const v = readEnum(input, ["BANK_DAILY_BUY", "BOT_REF"] as const);
    if (!v) return null;
    return v === "BANK_DAILY_BUY" ? {} : false;
  },
  W25: (input) => {
    if (!shapeOk(input, ["deathDisabilitySatang", "injurySatang"]) || !isInt(input.deathDisabilitySatang) || !isInt(input.injurySatang)) return null;
    return input.deathDisabilitySatang < INSURANCE_FLOOR.deathDisabilitySatang || input.injurySatang < INSURANCE_FLOOR.injurySatang ? {} : false;
  },
  W26: (input) => {
    const keys = Object.keys(DIVE_RATIO_CAP) as (keyof typeof DIVE_RATIO_CAP)[];
    if (!shapeOk(input, keys) || !keys.every((k) => isInt(input[k], 0, 10_000))) return null;
    return keys.some((k) => (input[k] as number) > DIVE_RATIO_CAP[k]) ? { vars: { "อัตรา": DIVE_RATIO_TH } } : false;
  },
  W29: (input, now, opts) => {
    if (!shapeOk(input, ["confirmedAt", "groups", "diveSatangPerPaxDay", "mooring"], ["shopRates"])) return null;
    if (input.shopRates !== undefined && !Array.isArray(input.shopRates)) return null;
    if (!Array.isArray(input.groups) || !input.groups.every((g) => isRec(g) && typeof g.code === "string")) return null;
    if (!isInt(input.diveSatangPerPaxDay) || !isRec(input.mooring)) return null;
    if (input.confirmedAt === null) return false; // ยังไม่เคยยืนยัน = ไม่เตือน (ใบสั่ง §7 ข้อ 6)
    const t = ymdUtc(input.confirmedAt);
    if (t === null) return null;
    if (opts.skipTimeDependent) return false; // ตัวตรวจทะเบียน: ไม่ขึ้นกับวันนี้
    const age = (bkkTodayUtc(now) - t) / DAY_MS;
    if (age < 0) return { vars: { "วันที่": String(input.confirmedAt) }, messageTh: TOUR_RULE_VARIANTS.W29?.FUTURE_DATE };
    return age > PARK_FEE_STALE_DAYS ? { vars: { "วันที่": String(input.confirmedAt) } } : false;
  },
  W30: (input) => {
    const keys = Object.keys(PARK_AGE_BANDS) as (keyof typeof PARK_AGE_BANDS)[];
    if (!shapeOk(input, keys) || !keys.every((k) => isInt(input[k], 0, 1_000))) return null;
    const diff = keys.filter((k) => input[k] !== PARK_AGE_BANDS[k]);
    return diff.length ? { vars: { "ค่าในระเบียบ": diff.map((k) => PARK_AGE_TH[k]).join(" · ") } } : false;
  },
  W33: (input) => {
    if (!shapeOk(input, RETENTION_FIELDS)) return null;
    if (!RETENTION_FIELDS.every((k) => input[k] === null || isInt(input[k], 1, 100_000))) return null;
    const keep = RETENTION_FIELDS.some((k) => input[k] === null);
    const taxShort = typeof input.taxDocsDays === "number" && input.taxDocsDays < TAX_DOCS_MIN_DAYS;
    if (!keep && !taxShort) return false;
    const parts = [...(keep ? [META.W33.messageTh] : []), ...(taxShort ? [TOUR_RULE_VARIANTS.W33?.TAX_DOCS_SHORT ?? ""] : [])];
    return { messageTh: parts.join(" · ") };
  },
  W38: (input) => {
    if (!shapeOk(input, ["th"], ["en"]) || typeof input.th !== "string" || (input.en !== undefined && typeof input.en !== "string")) return null;
    const text = normalizeText([input.th, typeof input.en === "string" ? input.en : ""].join(" "));
    return WAIVER_FORBIDDEN_TERMS.some((t) => text.includes(normalizeText(t))) ? {} : false;
  },
};

/** ข้อความทางเลือกต่อ rule (TRIPS-DEFAULTS §4 คอลัมน์ข้อความที่มีหลายประโยค) — เลือกด้วย variant ในอินพุตรูป RUNTIME */
export const TOUR_RULE_VARIANTS: Readonly<Partial<Record<TourRuleId, Readonly<Record<string, string>>>>> = {
  W26: { GROUP_OVER_RATIO: "กลุ่มนี้มีแขกต่อผู้ควบคุมเกินอัตราในประกาศกระทรวง ทส. พ.ศ. 2568 ({อัตรา})" },
  W28: {
    OVER_LICENCE: "ผู้โดยสารเกินจำนวนในใบอนุญาตใช้เรือ (ม.169)",
    DEPARTURE_NOTICE: "เรือ 60 ตันกรอสส์ขึ้นไปต้องแจ้งกำหนดออกเรือล่วงหน้าไม่น้อยกว่า 6 ชั่วโมง (ม.21)",
  },
  W29: {
    ETICKET_MISMATCH: "จำนวน/สัญชาติไม่ตรงกับ e-ticket ที่แนบ",
    PARK_STAY_OVER_5_DAYS: "พักในอุทยานได้ไม่เกิน 5 วันต่อคราว",
    FUTURE_DATE: "วันที่ร้านยืนยันตารางค่าอุทยาน ({วันที่}) อยู่หลังวันนี้ — โปรดตรวจวันที่อีกครั้ง",
  },
  W33: {
    NO_DELETE: "ข้อมูลส่วนบุคคลต้องลบเมื่อพ้นกำหนดเก็บ (ม.37(3))",
    TAX_DOCS_SHORT: "เอกสารภาษีต้องเก็บไม่น้อยกว่า 5 ปี (ประมวลรัษฎากร ม.87/3)",
  },
  W45: {
    LIVEABOARD:
      "บันทึกส่วนต่าง 3% เป็น \"ถูกหัก ณ ที่จ่าย\" ได้ — อย่าลืมรับหนังสือรับรอง 50 ทวิ จากลูกค้า · ทริปเรือค้างคืนยังไม่มีแนวทางว่าลูกค้าต้องหักหรือไม่ โปรดตรวจกับนักบัญชี",
  },
};

const runtimeJudgeOf =
  (id: TourRuleId): Judge =>
  (input) => {
    const r = readRuntime(input);
    if (!r) return null;
    if (r.variant !== undefined && TOUR_RULE_VARIANTS[id]?.[r.variant] === undefined) return null; // variant ไม่รู้จัก = อินพุตผิดรูป
    if (!r.hit) return false;
    return { vars: r.vars, ...(r.variant !== undefined ? { messageTh: TOUR_RULE_VARIANTS[id]?.[r.variant] } : {}) };
  };
const looksRuntime = (v: unknown): boolean => isRec(v) && own(v, "hit");

const invalidVerdict = (): TourVerdict => ({
  level: "WARN",
  code: INVALID_INPUT_WARN,
  messageTh: "ระบบอ่านค่าที่ใช้ตรวจคำเตือนนี้ไม่ได้ — ค่ายังบันทึกได้ โปรดตรวจรูปแบบค่าอีกครั้ง",
  citation: "TRIPS-CORE-CONTRACT §E.5 ข้อ 1",
  severity: "NORMAL",
});

function buildRule(id: TourRuleId): TourRule {
  const m = META[id];
  const runtime = runtimeJudgeOf(id);
  const settingsJudge = SETTINGS_JUDGES[id] ?? (() => null);
  // rule ชั้นค่าตั้งรับรูป RUNTIME ได้ด้วย (เงื่อนไขที่เกิดตอนทำงานจริง · รีวิว MINOR-3) — ค่าตั้งจริงไม่มีช่อง "hit"
  const judge: Judge = m.checkpoint === "SETTINGS" ? (input, now, o) => (looksRuntime(input) ? runtime(input, now, o) : settingsJudge(input, now, o)) : runtime;
  return {
    id,
    maxLevel: "WARN",
    severity: m.severity,
    checkpoint: m.checkpoint,
    messageTh: m.messageTh,
    citation: m.citation,
    ...(m.pendingReview ? { pendingReview: true as const } : {}),
    evaluate(input: unknown, opts?: TourEvalOpts): TourVerdict {
      let out: ReturnType<Judge>;
      try {
        const now = opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
        out = judge(input, now, opts ?? {});
      } catch {
        return invalidVerdict();
      }
      if (out === null) return invalidVerdict();
      if (out === false) return { level: "OK", code: "OK", messageTh: "", citation: m.citation, severity: m.severity };
      return {
        level: "WARN",
        code: id,
        messageTh: fill(out.messageTh ?? m.messageTh, out.vars),
        citation: m.citation,
        severity: m.severity,
        ...(m.pendingReview ? { pendingReview: true as const } : {}),
      };
    },
  };
}

export const TH_TOUR_2569_RULES: Readonly<Record<TourRuleId, TourRule>> = Object.freeze(
  Object.fromEntries(TOUR_RULE_IDS.map((id) => [id, buildRule(id)])) as Record<TourRuleId, TourRule>,
);

const TOUR_ID_SET: ReadonlySet<string> = new Set(TOUR_RULE_IDS);
export const isTourRuleId = (id: unknown): id is TourRuleId => typeof id === "string" && TOUR_ID_SET.has(id);

/**
 * ประเมินคำเตือนทัวร์ — ไม่โยนในทุกกรณี · ผลได้แค่ OK / WARN
 * id ไม่รู้จัก · อินพุตผิดรูป · ตัวประเมินโยน ⇒ WARN "INVALID_INPUT_WARN" severity NORMAL
 */
export function evaluateTourRule(id: string, input: unknown, opts?: TourEvalOpts): TourVerdict {
  try {
    if (!isTourRuleId(id)) return invalidVerdict();
    return TH_TOUR_2569_RULES[id].evaluate(input, opts);
  } catch {
    return invalidVerdict();
  }
}
