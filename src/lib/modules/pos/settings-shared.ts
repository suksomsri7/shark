// settings-shared.ts — ตัวอ่านบริสุทธิ์ + ชนิดข้อมูลของหน้าตั้งค่า POS (P1.18 S · R2 R3 R12 R16 · มติ Q7 Q9)
//
// 🔴 ไฟล์นี้ client component import ได้: ห้าม import prisma / db / ไฟล์ฝั่งเซิร์ฟเวอร์ของ pos (ข้อสอบ isPureSrc)
//    import ได้แค่ชนิดข้อมูล (type-only) จากไฟล์อื่น
// 🔴 ตัวอ่านเดียวต่อคีย์: posReceiptLocale (settings.pos.receiptLocale) · posDayCutoffMinutes (settings.pos.reports.dayCutoffMinutes)
//    ตัวเขียน (settings-general.ts) ตรวจค่าด้วยช่วงเดียวกันนี้ ⇒ เขียนแล้วอ่านกลับได้ค่าเดิมเสมอ (กฎไป-กลับ R3)
// 🔴 คำปฏิเสธ = {ok:false, code, message(ไทย · ไว้ดู log), field?} — จอแปลงรหัสเป็นคีย์ผ่าน settingsRefusalMessageKey (ไม่แสดง message)

import type { PosShiftSettings } from "./shift";
import type { WeighedBarcodeSettings } from "./scan-shared";
import type { PosDiscountCaps } from "./register-shared";

// ═══════════ ค่าตั้งทั่วไป (R3) ═══════════
export type PosReceiptLocale = "th" | "en";
/** ภาษาใบเสร็จที่พิมพ์ (มติ Q7: ต่อระบบ POS) — ค่าที่ใช้ได้ = "en" ตรงตัวเท่านั้น · อื่นทั้งหมด = th (ค่าปริยายเดิม) */
export function posReceiptLocale(settings: unknown): PosReceiptLocale {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  return pos?.receiptLocale === "en" ? "en" : "th";
}

/** ตัดวันธุรกิจ (นาทีหลังเที่ยงคืนเวลาไทย · มติ Q9) — จำนวนเต็ม 0–360 · ไม่ตั้ง/ผิดรูป = 0 (ตัดเที่ยงคืนแบบเดิม) */
export const POS_DAY_CUTOFF_MAX = 360;
export function posDayCutoffMinutes(settings: unknown): number {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const rep = pos && isRecord(pos.reports) ? pos.reports : null;
  const v = rep?.dayCutoffMinutes;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= POS_DAY_CUTOFF_MAX ? v : 0;
}

// POS P2.12 ▸ AN เกณฑ์จุดผิดปกติ (§3 มติ 3 · CD-6): settings.pos.reports.anomaly = {enabled, rules:{A1…A10}} ต่อระบบ POS ·
//   ตัวอ่านเดียว posAnomalyThresholds — จำนวนเต็มนอกช่วง = ตัดเข้าขอบ · ไม่ใช่จำนวนเต็ม/ไม่ใช่ตัวเลข = ค่าปริยาย · กฎ/ช่องที่ไม่รู้จัก = ไม่สน ·
//   enabled ไม่ใช่ boolean = true · ผลมี A1…A10 ครบเสมอ · ตัวเขียน (settings-general.ts) ปฏิเสธค่านอกช่วงด้วยช่วงเดียวกันนี้ ◂
export const POS_ANOMALY_RULES = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"] as const; // POS P3.9 ▸ R11 มติ 6: + A11 ข้ามตารางงานบ่อย ◂
export type PosAnomalyRule = (typeof POS_ANOMALY_RULES)[number];
/** ช่องของเกณฑ์: count = ครั้ง/ใบ/บรรทัด/กะ · satang = สตางค์ · bp = 1/100 % */
export type PosAnomalyField = "count" | "satang" | "bp";
export type PosAnomalyRules = {
  A1: { count: number; satang: number };
  A2: { count: number; satang: number };
  A3: { bp: number };
  A4: { bp: number };
  A5: { count: number };
  A6: { count: number };
  A7: { count: number };
  A8: { satang: number };
  A9: { count: number };
  A10: { count: number };
  A11: { count: number }; // POS P3.9 ▸ R11 ◂
};
export type PosAnomalyThresholds = { enabled: boolean; rules: PosAnomalyRules };
/** ค่าปริยาย (มติ 3 · รอเจ้าของยืนยัน — POS-OWNER-PENDING) · A3 = 15% เท่าธงเดิมของการ์ดพนักงาน (HIGH_DISCOUNT_BP) */
export const POS_ANOMALY_DEFAULTS: Readonly<PosAnomalyRules> = {
  A1: { count: 3, satang: 100_000 },
  A2: { count: 3, satang: 100_000 },
  A3: { bp: 1500 },
  A4: { bp: 5000 },
  A5: { count: 3 },
  A6: { count: 5 },
  A7: { count: 2 },
  A8: { satang: 10_000 },
  A9: { count: 2 },
  A10: { count: 3 },
  // POS P3.9 ▸ R11 มติ 6 (W14): ผู้อนุมัติให้พนักงานเข้ากะนอกตารางงาน (audit pos.staff.schedule_override) ≥ 3 ครั้ง/สาขา/วัน ◂
  A11: { count: 3 },
};
export const POS_ANOMALY_LIMITS: Readonly<Record<PosAnomalyField, { min: number; max: number }>> = {
  count: { min: 1, max: 1000 },
  satang: { min: 1, max: 100_000_000 },
  bp: { min: 1, max: 10_000 },
};
export function posAnomalyThresholds(settings: unknown): PosAnomalyThresholds {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const rep = pos && isRecord(pos.reports) ? pos.reports : null;
  const raw = rep && isRecord(rep.anomaly) ? rep.anomaly : null;
  const rawRules = raw && isRecord(raw.rules) ? raw.rules : null;
  const rules = {} as Record<PosAnomalyRule, Record<string, number>>;
  for (const id of POS_ANOMALY_RULES) {
    const def = POS_ANOMALY_DEFAULTS[id] as Record<string, number>;
    const got = rawRules && isRecord(rawRules[id]) ? rawRules[id] : null;
    const out: Record<string, number> = {};
    for (const f of Object.keys(def)) {
      const v = got?.[f];
      const lim = POS_ANOMALY_LIMITS[f as PosAnomalyField];
      out[f] = typeof v === "number" && Number.isInteger(v) ? Math.min(lim.max, Math.max(lim.min, v)) : def[f]!;
    }
    rules[id] = out;
  }
  return { enabled: typeof raw?.enabled === "boolean" ? raw.enabled : true, rules: rules as unknown as PosAnomalyRules };
}

// POS P3.9 ▸ R10 มติ 4 5: ค่าตั้งผู้ช่วย AI ของระบบ POS — settings.pos.ai = {enabled, brief:{enabled, hourBkk, email, managerUserIds}, anomalyInBrief} ·
//   ตัวอ่านเดียว (บริสุทธิ์) · ค่าปริยาย = ปิด (enabled false) · hourBkk จำนวนเต็ม 0–23 (อื่น = 6) · managerUserIds = สตริงไม่ว่าง ไม่ซ้ำ คงลำดับ (≤ 50) ·
//   ชนิดผิด = ค่าปริยาย · ตัวเขียน = ai-settings-actions.ts (เจ้าของร้านเท่านั้น) ◂
export type PosAiBriefSettings = { enabled: boolean; hourBkk: number; email: boolean; managerUserIds: string[] };
export type PosAiSettings = { enabled: boolean; brief: PosAiBriefSettings; anomalyInBrief: boolean };
export const POS_AI_BRIEF_HOUR_DEFAULT = 6;
export const POS_AI_MANAGERS_MAX = 50;
export function posAiSettings(settings: unknown): PosAiSettings {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const ai = pos && isRecord(pos.ai) ? pos.ai : null;
  const b = ai && isRecord(ai.brief) ? ai.brief : null;
  const h = b?.hourBkk;
  const ids: string[] = [];
  if (Array.isArray(b?.managerUserIds)) {
    for (const v of b.managerUserIds as unknown[]) {
      if (typeof v !== "string" || !v.trim() || v.length > 64 || ids.includes(v)) continue;
      ids.push(v);
      if (ids.length >= POS_AI_MANAGERS_MAX) break;
    }
  }
  return {
    enabled: typeof ai?.enabled === "boolean" ? ai.enabled : false,
    brief: {
      enabled: typeof b?.enabled === "boolean" ? b.enabled : true,
      hourBkk: typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23 ? h : POS_AI_BRIEF_HOUR_DEFAULT,
      email: typeof b?.email === "boolean" ? b.email : false,
      managerUserIds: ids,
    },
    anomalyInBrief: typeof ai?.anomalyInBrief === "boolean" ? ai.anomalyInBrief : true,
  };
}

// POS P3.5 ▸ R3 R6 R12 มติ 1 3 12: ค่าตั้งพนักงาน × HR ต่อระบบ POS — ตัวอ่านเดียวต่อคีย์ (บริสุทธิ์) · ตัวเขียน (settings-general.ts) ปฏิเสธค่านอกช่วงเดียวกันนี้
//   settings.pos.staff.scheduleGate = {enabled, earlyMin, lateMin, overrideTtlMin} (ค่าปริยายปิด · 30/30/240) · จำนวนเต็มนอกช่วง = ตัดเข้าขอบ ·
//   ไม่ใช่จำนวนเต็ม/ชนิดผิด = ค่าปริยาย · คีย์แปลก = ไม่ออก
//   settings.pos.staffCommission = {enabled, defaultBp, byCategory, byProduct, sellerRoles} (ค่าปริยายปิด) · แถวละ {bp?, fixedSatang?} · ≤ 500 แถวรวม ·
//   bp 0–5000 · fixed 0–100000 สตางค์ต่อหน่วย · บทบาทที่ไม่รู้จักถูกตัด
//   settings.pos.staff.clockOnShift = "OFF" | "ASK" (ไม่ตั้ง = ASK เมื่อร้านมีระบบ HR · ไม่มี = OFF) ◂
export type PosScheduleGate = { enabled: boolean; earlyMin: number; lateMin: number; overrideTtlMin: number };
export const POS_SCHEDULE_GATE_DEFAULTS: Readonly<PosScheduleGate> = { enabled: false, earlyMin: 30, lateMin: 30, overrideTtlMin: 240 };
export const POS_SCHEDULE_GATE_LIMITS = { earlyMin: { min: 0, max: 180 }, lateMin: { min: 0, max: 180 }, overrideTtlMin: { min: 0, max: 720 } } as const;
const clampInt = (v: unknown, lim: { min: number; max: number }, def: number): number =>
  typeof v === "number" && Number.isInteger(v) ? Math.min(lim.max, Math.max(lim.min, v)) : def;
/** R3 — ตัวอ่านเดียวของ settings.pos.staff.scheduleGate */
export function posScheduleGate(settings: unknown): PosScheduleGate {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const staff = pos && isRecord(pos.staff) ? pos.staff : null;
  const g = staff && isRecord(staff.scheduleGate) ? staff.scheduleGate : null;
  const d = POS_SCHEDULE_GATE_DEFAULTS;
  return {
    enabled: typeof g?.enabled === "boolean" ? g.enabled : d.enabled,
    earlyMin: clampInt(g?.earlyMin, POS_SCHEDULE_GATE_LIMITS.earlyMin, d.earlyMin),
    lateMin: clampInt(g?.lateMin, POS_SCHEDULE_GATE_LIMITS.lateMin, d.lateMin),
    overrideTtlMin: clampInt(g?.overrideTtlMin, POS_SCHEDULE_GATE_LIMITS.overrideTtlMin, d.overrideTtlMin),
  };
}
export type PosClockOnShift = "OFF" | "ASK";
/** R12 — ถามลงเวลาหลังเปิด/ปิดกะไหม · ไม่ตั้ง/ผิดรูป = ASK เมื่อร้านมีระบบ HR · ไม่มี HR = OFF เสมอ */
export function posClockOnShift(settings: unknown, hrLinked: boolean): PosClockOnShift {
  if (!hrLinked) return "OFF";
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const staff = pos && isRecord(pos.staff) ? pos.staff : null;
  return staff?.clockOnShift === "OFF" ? "OFF" : "ASK";
}
export const POS_STAFF_ROLES = ["OWNER", "MANAGER", "STAFF"] as const;
export type PosStaffRole = (typeof POS_STAFF_ROLES)[number];
export type PosStaffCommissionRate = { bp?: number; fixedSatang?: number };
export type PosStaffCommissionConfig = {
  enabled: boolean;
  defaultBp: number;
  byCategory: Record<string, PosStaffCommissionRate>;
  byProduct: Record<string, PosStaffCommissionRate>;
  sellerRoles: PosStaffRole[];
  // POS P3.6 ▸ R12 มติ 10: บิลที่ผูกดีล CRM (crmDealId) ไม่ลงค่าคอมฯ พนักงาน (ค่าคอมฯ ของดีลจ่ายทาง CRM) — ปริยาย true · false = ลงทั้งคู่ ◂
  skipDealBills: boolean;
};
export const POS_STAFF_COMMISSION_LIMITS = { bp: { min: 0, max: 5_000 }, fixedSatang: { min: 0, max: 100_000 }, entries: 500 } as const;
const STAFF_COMMISSION_DEFAULT_ROLES: readonly PosStaffRole[] = ["STAFF", "MANAGER"];
const RATE_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** แถวอัตรา → {bp?, fixedSatang?} ที่ถูกตัดเข้าช่วง · ไม่มีช่องที่ใช้ได้ = null */
function rateOf(v: unknown): PosStaffCommissionRate | null {
  if (!isRecord(v)) return null;
  const out: PosStaffCommissionRate = {};
  if (typeof v.bp === "number" && Number.isInteger(v.bp)) out.bp = clampInt(v.bp, POS_STAFF_COMMISSION_LIMITS.bp, 0);
  if (typeof v.fixedSatang === "number" && Number.isInteger(v.fixedSatang)) out.fixedSatang = clampInt(v.fixedSatang, POS_STAFF_COMMISSION_LIMITS.fixedSatang, 0);
  return out.bp === undefined && out.fixedSatang === undefined ? null : out;
}
/** R6 — ตัวอ่านเดียวของ settings.pos.staffCommission (สินค้าก่อนหมวด เมื่อรวมเกิน 500 แถว) */
export function posStaffCommission(settings: unknown): PosStaffCommissionConfig {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const c = pos && isRecord(pos.staffCommission) ? pos.staffCommission : null;
  let left: number = POS_STAFF_COMMISSION_LIMITS.entries;
  const table = (v: unknown): Record<string, PosStaffCommissionRate> => {
    const out: Record<string, PosStaffCommissionRate> = {};
    if (!isRecord(v)) return out;
    for (const [k, x] of Object.entries(v)) {
      if (left <= 0) break;
      if (!RATE_KEY_RE.test(k)) continue;
      const r = rateOf(x);
      if (!r) continue;
      out[k] = r;
      left--;
    }
    return out;
  };
  const byProduct = table(c?.byProduct);
  const byCategory = table(c?.byCategory);
  const roles = Array.isArray(c?.sellerRoles)
    ? [...new Set((c!.sellerRoles as unknown[]).filter((x): x is PosStaffRole => typeof x === "string" && (POS_STAFF_ROLES as readonly string[]).includes(x)))]
    : [...STAFF_COMMISSION_DEFAULT_ROLES];
  return {
    enabled: typeof c?.enabled === "boolean" ? c.enabled : false,
    defaultBp: clampInt(c?.defaultBp, POS_STAFF_COMMISSION_LIMITS.bp, 0),
    byCategory,
    byProduct,
    sellerRoles: roles,
    skipDealBills: typeof c?.skipDealBills === "boolean" ? c.skipDealBills : true, // POS P3.6 ▸ R12 ◂
  };
}

// POS P3.6 ▸ R3 มติ 9: วางบิล (เครดิตเทอม) — settings.pos.credit = {enabled, requireBuyer} ต่อระบบ POS · ตัวอ่านเดียว (บริสุทธิ์) ·
//   ปริยาย = ปิด (enabled false ⇒ ไม่มีไทล์ · ON_ACCOUNT = CREDIT_DISABLED · ทุกทางเหมือนเดิม) · requireBuyer ปริยาย true (บิลวางบิลต้องมีผู้ซื้อใบกำกับ) ·
//   ชนิดผิด = ค่าปริยาย · คีย์อื่นไม่ออก · ตัวเขียน = เจ้าของร้าน (การ์ด "ลูกค้าเครดิต" ของ P3.6U) ◂
export type PosCreditSettings = { enabled: boolean; requireBuyer: boolean };
export function posCreditSettings(settings: unknown): PosCreditSettings {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const c = pos && isRecord(pos.credit) ? pos.credit : null;
  return { enabled: typeof c?.enabled === "boolean" ? c.enabled : false, requireBuyer: typeof c?.requireBuyer === "boolean" ? c.requireBuyer : true };
}
// POS P3.6 ▸ R13 มติ 8 (W17): สมาชิกบนบิลออเดอร์ (settings.pos.orders.memberOnBill · ปริยาย true) — ออเดอร์ที่มีสมาชิก ⇒ บิลแนบสมาชิก (attach-only · ไม่ลดราคา) ◂
export function posOrderMemberOnBill(settings: unknown): boolean {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const o = pos && isRecord(pos.orders) ? pos.orders : null;
  return typeof o?.memberOnBill === "boolean" ? o.memberOnBill : true;
}

/** ช่วงของตัวเขียนทั่วไป (= ช่วงของตัวอ่านแต่ละตัว) */
export const POS_GENERAL_LIMITS = {
  heldCartExpireDays: { min: 1, max: 365 },
  autoLockMinutes: { min: 0, max: 60 },
  overShortReasonSatang: { min: 0, max: 10_000_000 },
  forceCloseAfterHours: { min: 1, max: 72 },
  dayCutoffMinutes: { min: 0, max: POS_DAY_CUTOFF_MAX },
} as const;

export type PosGeneralSettings = {
  heldCartExpireDays: number;
  autoLockMinutes: number;
  shift: PosShiftSettings;
  weighedBarcode: WeighedBarcodeSettings;
  receiptLocale: PosReceiptLocale;
  dayCutoffMinutes: number;
  /** POS P2.12 ▸ เกณฑ์จุดผิดปกติ (ตัวอ่าน posAnomalyThresholds) ◂ */
  anomaly: PosAnomalyThresholds;
};
/** แพตช์ของ updatePosGeneralSettings — คีย์ตรงตัว (คีย์อื่น = VALIDATION field ชื่อคีย์) · shift รวมทับบางส่วน · weighedBarcode ต้องส่งครบทั้งสองช่อง */
export type PosGeneralSettingsPatch = {
  heldCartExpireDays?: number;
  autoLockMinutes?: number;
  shift?: { requiredRegister?: boolean; requiredOtherSources?: boolean; blindClose?: boolean; overShortReasonSatang?: number; forceCloseAfterHours?: number };
  weighedBarcode?: WeighedBarcodeSettings;
  receiptLocale?: PosReceiptLocale;
  dayCutoffMinutes?: number;
  /** POS P2.12 ▸ รวมทับบางส่วน: rules.A#.<ช่อง> ที่ส่งมาเท่านั้น (ช่วง POS_ANOMALY_LIMITS) ◂ */
  anomaly?: { enabled?: boolean; rules?: Partial<{ [K in PosAnomalyRule]: Partial<PosAnomalyRules[K]> }> };
};
export type PosDiscountCapsPatch = { STAFF?: number; MANAGER?: number };
export type PosOversellPolicy = "ALLOW_NEGATIVE" | "BLOCK";

// ═══════════ คำปฏิเสธ (R16) ═══════════
export type PosSettingsRefusalCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "UNKNOWN" | "SETTINGS_SECTION_LOCKED" | "CONFIRM_REQUIRED";
export type PosSettingsRefusal = { ok: false; code: PosSettingsRefusalCode; message: string; field?: string };

const SETTINGS_REFUSAL_KEY: Readonly<Record<PosSettingsRefusalCode, string>> = {
  NOT_FOUND: "errors.notFound",
  PERMISSION_DENIED: "errors.permissionDenied",
  VALIDATION: "errors.validation",
  UNKNOWN: "errors.unknown",
  SETTINGS_SECTION_LOCKED: "errors.settingsSectionLocked",
  CONFIRM_REQUIRED: "errors.confirmRequired",
};
/** รหัสปฏิเสธ → คีย์ข้อความใต้ `pos.settings` · รหัสที่ไม่รู้จัก = errors.unknown (จอห้ามแสดงรหัสดิบ/ข้อความไทยของเซิร์ฟเวอร์) */
export function settingsRefusalMessageKey(code: string): string {
  return Object.prototype.hasOwnProperty.call(SETTINGS_REFUSAL_KEY, code) ? SETTINGS_REFUSAL_KEY[code as PosSettingsRefusalCode] : "errors.unknown";
}

// ═══════════ ผลของตัวเขียน/ตัวอ่าน (ชนิดสำหรับ P1.18U) ═══════════
export type PosGeneralSettingsResult = { ok: true; general: PosGeneralSettings } | PosSettingsRefusal;
export type PosDiscountCapsResult = { ok: true; caps: PosDiscountCaps } | PosSettingsRefusal;
export type PosUnitStockPolicyResult = { ok: true; unitStock: { unitId: string; oversellPolicy: PosOversellPolicy } } | PosSettingsRefusal;
/** ประวัติ (R9) — summary = พารามิเตอร์ของประโยค (ไม่มี before/after ดิบ · ไม่มีเลขพร้อมเพย์) */
export type PosSettingsHistoryItem = {
  id: string;
  at: string;
  actorName: string | null;
  action: string;
  section: string | null;
  summary: Record<string, string | number | boolean | null>;
};
export type PosSettingsHistoryResult = { ok: true; items: PosSettingsHistoryItem[]; nextCursor: string | null } | PosSettingsRefusal;
export type PosSettingsCanEdit = { general: boolean; caps: boolean; unitStock: boolean; staff: boolean; payment: boolean; receipt: boolean };

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** R6 — before/after ของ audit "pos.settings.updated": เฉพาะคีย์บนสุดที่เปลี่ยนจริง · null = ไม่เปลี่ยน (ไม่ต้องลง audit) */
export function settingsAuditDiff(section: string, before: Record<string, unknown>, after: Record<string, unknown>): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => canonJson(before[k]) !== canonJson(after[k]));
  if (!keys.length) return null;
  const pick = (o: Record<string, unknown>) => Object.fromEntries([["section", section], ...keys.map((k) => [k, o[k] ?? null])]);
  return { before: pick(before), after: pick(after) };
}
/** POS P1.18 ▸ F5: ค่าในประวัติ/บันทึกตรวจสอบห้ามมีเบอร์โทรดิบ — ทุกคีย์ชื่อ "phone" (ชั้นบนหรือใต้ก้อนซ้อน เช่น header.phone) ผ่านตัวปิดบังที่ผู้เรียกส่งมา
 *  (ผู้เรียกใช้ maskPhone ของ facade member — รูปแบบเดียวกับที่อื่น) · ไม่แก้ก้อนเดิม คืนสำเนา ◂ */
export function maskAuditPhones<T>(v: T, mask: (phone: string) => string): T {
  if (Array.isArray(v)) return v.map((x) => maskAuditPhones(x, mask)) as T;
  if (!isRecord(v)) return v;
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k, k === "phone" && typeof x === "string" && x ? mask(x) : maskAuditPhones(x, mask)]),
  ) as T;
}
function canonJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonJson).join(",")}]`;
  if (isRecord(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
