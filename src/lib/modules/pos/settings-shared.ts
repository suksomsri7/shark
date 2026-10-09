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
};
/** แพตช์ของ updatePosGeneralSettings — คีย์ตรงตัว (คีย์อื่น = VALIDATION field ชื่อคีย์) · shift รวมทับบางส่วน · weighedBarcode ต้องส่งครบทั้งสองช่อง */
export type PosGeneralSettingsPatch = {
  heldCartExpireDays?: number;
  autoLockMinutes?: number;
  shift?: { requiredRegister?: boolean; requiredOtherSources?: boolean; blindClose?: boolean; overShortReasonSatang?: number; forceCloseAfterHours?: number };
  weighedBarcode?: WeighedBarcodeSettings;
  receiptLocale?: PosReceiptLocale;
  dayCutoffMinutes?: number;
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
