// fields.ts — เอนจินส่วน/ฟิลด์/ค่า/ประวัติของ "ระบบสมาชิก v2" (D14 · พิมพ์เขียว §5.3 §11.2 · แบบ K2.6)
//
// สิ่งที่ไฟล์นี้เป็นเจ้าของ
//   • นิยาม: `MemberSection` (กล่องบนหน้าโปรไฟล์) + `MemberField` (ฟิลด์ 11 ชนิด)
//   • ค่า:   `MemberFieldValue` (คอลัมน์แยกชนิด — กรอง/เรียงด้วย index จริงได้)
//   • ประวัติ: `MemberFieldValueHistory` (เฉพาะฟิลด์ที่เปิด `trackHistory`)
//   • เทมเพลตกิจการ: `applyTemplate` (ข้อมูลอยู่ที่ `./templates`)
//
// 🔴 ฟิลด์ระบบ (`isSystem` · `systemKey`) = **ตัวชี้** ไปคอลัมน์จริงของ `Customer`/`MemberAddress`
//    ไม่ใช่ที่เก็บค่าอีกชุด ⇒ `setFieldValues` เขียนลงคอลัมน์เดิม · `getFieldValues` อ่านจากคอลัมน์เดิม
//    และ **ห้าม** สร้างแถว `MemberFieldValue` ให้ฟิลด์ระบบ (ถ้าก๊อปไว้สองที่ วันหนึ่งสองที่จะไม่ตรงกันแน่นอน)
// 🔴 `null` = ลบแถวค่า (ค่าที่ไม่มีความหมาย = ไม่มีแถว — แบบเดียวกับ `kanban/fields.ts`)
// 🔴 ตรวจ **ทุกค่าให้ครบก่อน** แล้วค่อยเขียนใน transaction เดียว: ค่าผิด 1 ตัว = ไม่เขียนอะไรเลย
//    (ผู้ใช้กรอกฟอร์ม 10 ช่อง แล้วบันทึกครึ่งเดียว = ข้อมูลพังแบบตามไม่เจอ)
// 🔴 วันที่: DATE เก็บ "เที่ยงคืน UTC ของวันนั้น" และอ่านกลับด้วย getUTC* เสมอ
//    (บทเรียน reference_thai_date_getday_trap — ใช้ getDate() บนเครื่อง UTC = เพี้ยน 1 วัน)

import { Prisma } from "@prisma/client";
import type { Customer, MemberAddress, MemberConsentSource, MemberField, MemberFieldType, MemberLookupTarget, MemberSection, PrismaClient } from "@prisma/client";
import { z } from "zod";
// prisma ดิบผ่าน `./db` ซึ่ง re-export มาจาก "@/lib/core/db" (จุดเดียวของโมดูลนี้ที่ล้วง core — ดู member/db.ts)
import { prisma } from "./db";
import { MEMBER_LIMITS, memberLimitError } from "./limits";
import { TEMPLATES, type MemberTemplateField, type MemberTemplateSection } from "./templates";

// ───────────────────────── ชนิดข้อมูลสาธารณะ ─────────────────────────

/** ผู้เรียกส่ง client ของ transaction ตัวเองเข้ามาได้ (ทุกฟังก์ชันในไฟล์นี้รับ `tx?`) */
type Client = PrismaClient | Prisma.TransactionClient;

export type FieldCtx = { tenantId: string; systemId: string; actorUserId: string | null };

export type MemberFieldChoice = { value: string; label: string; color?: string };

/** options ต่อชนิด (เก็บเป็น Json) — SELECT/MULTI: choices · NUMBER/MONEY: unit/decimals/min/max · TEXT: pattern/maxLength · LOOKUP: target */
export type MemberFieldOptions = {
  choices?: MemberFieldChoice[];
  unit?: string;
  decimals?: number;
  min?: number;
  max?: number;
  pattern?: string;
  maxLength?: number;
  target?: MemberLookupTarget;
};

/** ค่าฟิลด์ในรูปแบบที่ผู้เรียกส่งเข้า/รับกลับ (เหมือนกันทั้งขาเขียนและขาอ่าน) */
export type MemberFieldValueInput = string | number | boolean | string[] | null;

export type FieldDef = {
  id: string;
  sectionId: string;
  key: string;
  label: string;
  description: string | null;
  type: MemberFieldType;
  options: MemberFieldOptions;
  required: boolean;
  unique: boolean;
  filterable: boolean;
  showInList: boolean;
  showOnCard: boolean;
  customerEditable: boolean;
  sensitive: boolean;
  trackHistory: boolean;
  isSystem: boolean;
  systemKey: string | null;
  sortOrder: number;
  archivedAt: Date | null;
  defaultValue: MemberFieldValueInput;
};

export type SectionDef = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  columns: number;
  sortOrder: number;
  isSystem: boolean;
  sensitive: boolean;
  collapsed: boolean;
  fields: FieldDef[];
};

const FIELD_TYPES: readonly MemberFieldType[] = [
  "TEXT", "LONG_TEXT", "NUMBER", "MONEY", "DATE", "DATETIME", "SELECT", "MULTI_SELECT", "BOOLEAN", "FILE", "LOOKUP",
];
const LOOKUP_TARGETS: readonly MemberLookupTarget[] = ["PRODUCT", "SERVICE", "EMPLOYEE", "UNIT", "CUSTOMER", "USER"];
const CONSENT_SOURCES: readonly MemberConsentSource[] = ["SIGNUP_FORM", "LIFF", "STAFF", "IMPORT", "API", "CUSTOMER_SELF"];

function clientOf(tx?: Client): Client {
  return tx ?? prisma;
}

// ───────────────────────── ตัวช่วยพื้นฐาน (key · ป้าย · วันที่) ─────────────────────────

// 🔴 อนุญาต camelCase หลังตัวแรก: ฟิลด์ระบบ 26 ตัว (`firstName` `memberCode` `addressLine1`) และเทมเพลตกิจการ
//    (`certLevel` `medicalCertFile`) ใช้รูปแบบนี้ทั้งหมด · ตัวแรกต้องเป็นตัวพิมพ์เล็ก และห้ามเว้นวรรค/อักษรไทย
const KEY_RE = /^[a-z][a-zA-Z0-9_]*$/;

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(MEMBER_LIMITS.keyLength)
  .regex(KEY_RE);

function normalizeKey(raw: unknown, what: string): string {
  const parsed = keySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `ชื่ออ้างอิง (key) ของ${what}ใช้ได้เฉพาะ a–z, A–Z, 0–9 และ _ โดยขึ้นต้นด้วยตัวพิมพ์เล็ก ยาวไม่เกิน ${MEMBER_LIMITS.keyLength} ตัว — เช่น "certLevel"`,
    );
  }
  return parsed.data;
}

function normalizeLabel(raw: unknown, what: string): string {
  const label = typeof raw === "string" ? raw.trim() : "";
  if (!label) throw new Error(`ต้องตั้งชื่อ${what}ก่อนจึงบันทึกได้`);
  if (label.length > 120) throw new Error(`ชื่อ${what}ยาวเกิน 120 ตัวอักษร — ตั้งให้สั้นลง`);
  return label;
}

function normalizeDescription(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return text ? text.slice(0, 500) : null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})?$/;

/** "YYYY-MM-DD" → เที่ยงคืน UTC ของวันนั้น · null = รูปแบบผิดหรือวันไม่มีจริง (2026-02-30) */
function parseYmd(raw: string): Date | null {
  if (!YMD_RE.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** Date → "YYYY-MM-DD" อ่านด้วย getUTC* เสมอ (ค่าที่เก็บคือเที่ยงคืน UTC ของวันนั้น) */
function ymdOf(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// ───────────────────────── options ต่อชนิด ─────────────────────────

const choiceSchema = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  color: z.string().trim().max(20).optional(),
});

const choicesSchema = z.object({ choices: z.array(choiceSchema).min(1).max(MEMBER_LIMITS.choices) });
const numberOptionsSchema = z.object({
  unit: z.string().trim().max(20).optional(),
  decimals: z.number().int().min(0).max(4).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
});
const textOptionsSchema = z.object({
  pattern: z.string().max(200).optional(),
  maxLength: z.number().int().min(1).max(MEMBER_LIMITS.longText).optional(),
});
const lookupOptionsSchema = z.object({ target: z.enum(LOOKUP_TARGETS as readonly [MemberLookupTarget, ...MemberLookupTarget[]]) });

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** ตรวจ/ทำความสะอาด options ตามชนิด — ผิดรูป = throw ไทย (บอกว่าต้องมีอะไร ไม่ใช่ว่า "ข้อมูลไม่ถูกต้อง") */
export function normalizeFieldOptions(type: MemberFieldType, raw: unknown): MemberFieldOptions {
  const o = asRecord(raw);
  if (type === "SELECT" || type === "MULTI_SELECT") {
    const parsed = choicesSchema.safeParse(o);
    if (!parsed.success) {
      throw new Error(`ฟิลด์ชนิดตัวเลือกต้องมีรายการให้เลือกอย่างน้อย 1 ตัว และไม่เกิน ${MEMBER_LIMITS.choices} ตัว (แต่ละตัวมีค่า value และป้ายที่แสดง)`);
    }
    const seen = new Set<string>();
    const choices: MemberFieldChoice[] = [];
    for (const c of parsed.data.choices) {
      if (seen.has(c.value)) throw new Error(`ตัวเลือก "${c.value}" ซ้ำกันในฟิลด์เดียวกัน — ให้เหลือตัวเดียว`);
      seen.add(c.value);
      choices.push(c.color ? { value: c.value, label: c.label, color: c.color } : { value: c.value, label: c.label });
    }
    return { choices };
  }
  if (type === "NUMBER" || type === "MONEY") {
    const parsed = numberOptionsSchema.safeParse(o);
    if (!parsed.success) throw new Error("ค่าตั้งของฟิลด์ตัวเลขรับได้เฉพาะ หน่วย (unit) · ทศนิยม (decimals 0–4) · ต่ำสุด (min) · สูงสุด (max)");
    const { unit, decimals, min, max } = parsed.data;
    if (min !== undefined && max !== undefined && min > max) throw new Error("ค่าต่ำสุดต้องไม่มากกว่าค่าสูงสุด");
    return {
      ...(unit ? { unit } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
    };
  }
  if (type === "TEXT" || type === "LONG_TEXT") {
    const parsed = textOptionsSchema.safeParse(o);
    if (!parsed.success) throw new Error(`ค่าตั้งของฟิลด์ข้อความรับได้เฉพาะ รูปแบบ (pattern) และความยาวสูงสุด (maxLength ไม่เกิน ${MEMBER_LIMITS.longText})`);
    const { pattern, maxLength } = parsed.data;
    if (pattern) {
      try {
        new RegExp(pattern);
      } catch {
        throw new Error(`รูปแบบ (pattern) "${pattern}" ไม่ใช่นิพจน์ที่ระบบอ่านได้ — ตรวจอีกครั้งหรือเว้นว่างไว้`);
      }
    }
    return { ...(pattern ? { pattern } : {}), ...(maxLength !== undefined ? { maxLength } : {}) };
  }
  if (type === "LOOKUP") {
    const parsed = lookupOptionsSchema.safeParse(o);
    if (!parsed.success) {
      throw new Error(`ฟิลด์ชนิดเชื่อมข้อมูลต้องระบุปลายทาง (target) ว่าเชื่อมกับอะไร — เลือกได้ ${LOOKUP_TARGETS.join(" / ")}`);
    }
    return { target: parsed.data.target };
  }
  return {};
}

function optionsOf(field: Pick<MemberField, "options">): MemberFieldOptions {
  const o = field.options;
  return o && typeof o === "object" && !Array.isArray(o) ? (o as MemberFieldOptions) : {};
}

function normalizeType(raw: unknown): MemberFieldType {
  const found = FIELD_TYPES.find((t) => t === raw);
  if (!found) throw new Error(`ชนิดฟิลด์ "${String(raw)}" ยังไม่มีในระบบ — เลือกได้ ${FIELD_TYPES.join(" / ")}`);
  return found;
}

function normalizeVia(raw: unknown): MemberConsentSource {
  const found = CONSENT_SOURCES.find((s) => s === raw);
  if (!found) throw new Error(`ที่มาของการบันทึก "${String(raw)}" ไม่อยู่ในรายการ — เลือกได้ ${CONSENT_SOURCES.join(" / ")}`);
  return found;
}

// ───────────────────────── ฟิลด์ระบบ = ตัวชี้ไปคอลัมน์จริง (§11.2) ─────────────────────────
// `systemKey` (ตั้งโดย scripts/member-backfill-fields.mts) → คอลัมน์ปลายทาง
//   • customer: คอลัมน์ของตาราง Customer
//   • address : คอลัมน์ของ MemberAddress (ที่อยู่หลักของสมาชิก)
//   • none    : ยังไม่มีคอลัมน์รองรับในสคีมา (ตอนนี้ไม่เหลือแล้ว — phone2/facebook ได้คอลัมน์จริงที่ M1.4)

type SystemTarget = { store: "customer"; column: keyof Customer } | { store: "address"; column: keyof MemberAddress } | { store: "none" };

const SYSTEM_FIELD_TARGETS: Record<string, SystemTarget> = {
  memberCode: { store: "customer", column: "memberCode" },
  firstName: { store: "customer", column: "firstName" },
  lastName: { store: "customer", column: "lastName" },
  nickname: { store: "customer", column: "nickname" },
  titleTh: { store: "customer", column: "titleTh" },
  birthDate: { store: "customer", column: "birthDate" },
  gender: { store: "customer", column: "gender" },
  nationality: { store: "customer", column: "nationality" },
  avatar: { store: "customer", column: "avatarFileId" },
  phone: { store: "customer", column: "phone" },
  email: { store: "customer", column: "email" },
  lineUserId: { store: "customer", column: "lineUserId" },
  locale: { store: "customer", column: "locale" },
  preferredChannel: { store: "customer", column: "preferredChannel" },
  tags: { store: "customer", column: "tags" },
  note: { store: "customer", column: "note" },
  source: { store: "customer", column: "source" },
  ownerUserId: { store: "customer", column: "ownerUserId" },
  homeUnitId: { store: "customer", column: "homeUnitId" },
  addressLine1: { store: "address", column: "line1" },
  addressSubdistrict: { store: "address", column: "subdistrict" },
  addressDistrict: { store: "address", column: "district" },
  addressProvince: { store: "address", column: "province" },
  addressPostcode: { store: "address", column: "postcode" },
  // M1.4 (`member_v2_b`) — ได้คอลัมน์จริงแล้ว (หนี้จาก M1.2 ปิดที่ใบนี้)
  phone2: { store: "customer", column: "phone2" },
  facebook: { store: "customer", column: "facebook" },
};

function targetOf(field: MemberField): SystemTarget {
  const key = field.systemKey ?? field.key;
  return SYSTEM_FIELD_TARGETS[key] ?? { store: "none" };
}

// ───────────────────────── ค่า: ตรวจ · แปลงลงคอลัมน์ · อ่านกลับ ─────────────────────────

/** ค่าที่ผ่านการตรวจแล้ว พร้อมลงคอลัมน์ของ MemberFieldValue */
type ValueCell = {
  valueText: string | null;
  valueNumber: number | null;
  valueDate: Date | null;
  valueBool: boolean | null;
  valueOptions: string[];
  valueRef: string | null;
  valueFileId: string | null;
};

const EMPTY_CELL: ValueCell = {
  valueText: null, valueNumber: null, valueDate: null, valueBool: null, valueOptions: [], valueRef: null, valueFileId: null,
};

function isBlank(value: MemberFieldValueInput): boolean {
  if (value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

const stringSchema = z.string();
const numberSchema = z.number().finite();
const boolSchema = z.boolean();
const stringArraySchema = z.array(z.string());

/**
 * ตรวจค่าดิบตามชนิดของฟิลด์ → ค่ามาตรฐาน (string | number | boolean | string[] | null)
 * ข้อความ error บอกว่า "ต้องเป็นอะไร" เสมอ ไม่ใช่ "ค่าที่กรอกไม่ถูกต้อง"
 */
function normalizeValue(field: MemberField, raw: unknown): MemberFieldValueInput {
  const label = field.label;
  if (raw === null || raw === undefined) return null;
  const options = optionsOf(field);

  switch (field.type) {
    case "TEXT":
    case "LONG_TEXT": {
      const parsed = stringSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`ค่าของฟิลด์ "${label}" ต้องเป็นข้อความ`);
      const text = parsed.data.trim();
      if (text === "") return null;
      const max = options.maxLength ?? (field.type === "LONG_TEXT" ? MEMBER_LIMITS.longText : MEMBER_LIMITS.textLength);
      const ceiling = Math.min(max, MEMBER_LIMITS.longText);
      if (text.length > ceiling) throw new Error(`ค่าของฟิลด์ "${label}" ยาว ${text.length} ตัวอักษร เกินที่กำหนดไว้ ${ceiling} ตัวอักษร`);
      if (options.pattern && !new RegExp(options.pattern).test(text)) {
        throw new Error(`ค่าของฟิลด์ "${label}" ยังไม่ตรงรูปแบบที่ร้านกำหนดไว้`);
      }
      return text;
    }
    case "NUMBER":
    case "MONEY": {
      const parsed = numberSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`ค่าของฟิลด์ "${label}" ต้องเป็นตัวเลข`);
      const num = parsed.data;
      if (options.min !== undefined && num < options.min) throw new Error(`ค่าของฟิลด์ "${label}" ต้องไม่น้อยกว่า ${options.min}`);
      if (options.max !== undefined && num > options.max) throw new Error(`ค่าของฟิลด์ "${label}" ต้องไม่เกิน ${options.max}`);
      const decimals = options.decimals ?? (field.type === "MONEY" ? 2 : 4);
      if (Number(num.toFixed(decimals)) !== num) {
        throw new Error(decimals === 0 ? `ค่าของฟิลด์ "${label}" ต้องเป็นจำนวนเต็ม` : `ค่าของฟิลด์ "${label}" มีทศนิยมได้ไม่เกิน ${decimals} ตำแหน่ง`);
      }
      return num;
    }
    case "DATE": {
      const parsed = stringSchema.safeParse(raw);
      if (!parsed.success || !parseYmd(parsed.data.trim())) {
        throw new Error(`ค่าของฟิลด์ "${label}" ต้องเป็นวันที่รูปแบบ ปี-เดือน-วัน เช่น 2026-03-15`);
      }
      return parsed.data.trim();
    }
    case "DATETIME": {
      const parsed = stringSchema.safeParse(raw);
      const text = parsed.success ? parsed.data.trim() : "";
      if (!text || !ISO_RE.test(text) || Number.isNaN(Date.parse(text))) {
        throw new Error(`ค่าของฟิลด์ "${label}" ต้องเป็นวันที่และเวลารูปแบบ ISO เช่น 2026-03-15T09:30:00+07:00`);
      }
      return new Date(text).toISOString();
    }
    case "SELECT": {
      const parsed = stringSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`ค่าของฟิลด์ "${label}" ต้องเป็นตัวเลือกเดียวจากรายการที่ตั้งไว้`);
      const value = parsed.data.trim();
      if (value === "") return null;
      const choices = options.choices ?? [];
      if (!choices.some((c) => c.value === value)) {
        throw new Error(`ค่า "${value}" ไม่อยู่ในตัวเลือกของฟิลด์ "${label}" — เลือกได้ ${choices.map((c) => c.value).join(" / ")}`);
      }
      return value;
    }
    case "MULTI_SELECT": {
      const parsed = stringArraySchema.safeParse(raw);
      if (!parsed.success) throw new Error(`ค่าของฟิลด์ "${label}" ต้องเป็นรายการตัวเลือก (ส่งเป็น array แม้เลือกตัวเดียว)`);
      const choices = options.choices ?? [];
      const picked: string[] = [];
      for (const v of parsed.data) {
        const value = v.trim();
        if (value === "") continue;
        if (!choices.some((c) => c.value === value)) {
          throw new Error(`ค่า "${value}" ไม่อยู่ในตัวเลือกของฟิลด์ "${label}" — เลือกได้ ${choices.map((c) => c.value).join(" / ")}`);
        }
        if (!picked.includes(value)) picked.push(value);
      }
      return picked;
    }
    case "BOOLEAN": {
      const parsed = boolSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`ค่าของฟิลด์ "${label}" ต้องเป็นใช่/ไม่ใช่ (true หรือ false)`);
      return parsed.data;
    }
    case "FILE": {
      const parsed = stringSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`ค่าของฟิลด์ "${label}" ต้องเป็นรหัสไฟล์ที่อัปโหลดไว้แล้ว`);
      const value = parsed.data.trim();
      return value === "" ? null : value;
    }
    case "LOOKUP":
    default: {
      const parsed = stringSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`ค่าของฟิลด์ "${label}" ต้องเป็นรหัสของรายการที่เชื่อมไว้`);
      const value = parsed.data.trim();
      return value === "" ? null : value;
    }
  }
}

/**
 * ตรวจค่า 1 ฟิลด์แบบ **ไม่เขียน** (M1.6 — ตัวนำเข้า CSV ใช้ก่อนสร้าง/แก้ไขจริง เพื่อไม่ต้องพิมพ์กติกาตรวจซ้ำ)
 * รับ field จาก `listLayout()` ตรง ๆ (`options` เป็น `MemberFieldOptions` ที่แกะ JSON แล้ว — `normalizeValue`
 * อ่านผ่าน `optionsOf()` ซึ่งรับอ็อบเจ็กต์ที่แกะแล้วได้อยู่แล้ว) ผิดรูป/ตัวเลือกไม่มี/บังคับว่าง → throw ข้อความไทย
 * เดียวกับ `setFieldValues` (สองไฟล์ไม่มีวันตรวจไม่ตรงกัน เพราะเรียก `normalizeValue` ตัวเดียวกัน)
 */
export function checkFieldValue(field: Pick<FieldDef, "label" | "type" | "options" | "required">, raw: unknown): MemberFieldValueInput {
  const value = normalizeValue(field as unknown as MemberField, raw);
  if (field.required && isBlank(value)) throw new Error(`ฟิลด์ "${field.label}" เป็นข้อมูลที่ต้องกรอก — ใส่ค่าก่อนบันทึก`);
  return value;
}

/** ค่ามาตรฐาน → คอลัมน์ของ MemberFieldValue (คอลัมน์ที่ไม่ตรงชนิดต้องเป็น null เสมอ) */
function cellOf(type: MemberFieldType, value: MemberFieldValueInput): ValueCell {
  const cell: ValueCell = { ...EMPTY_CELL, valueOptions: [] };
  if (value === null) return cell;
  switch (type) {
    case "TEXT":
    case "LONG_TEXT":
      cell.valueText = String(value);
      return cell;
    case "NUMBER":
    case "MONEY":
      cell.valueNumber = Number(value);
      return cell;
    case "DATE":
      cell.valueDate = parseYmd(String(value));
      return cell;
    case "DATETIME":
      cell.valueDate = new Date(String(value));
      return cell;
    case "SELECT":
      cell.valueOptions = [String(value)];
      return cell;
    case "MULTI_SELECT":
      cell.valueOptions = Array.isArray(value) ? value : [String(value)];
      return cell;
    case "BOOLEAN":
      cell.valueBool = Boolean(value);
      return cell;
    case "FILE":
      cell.valueFileId = String(value);
      return cell;
    case "LOOKUP":
    default:
      cell.valueRef = String(value);
      return cell;
  }
}

type ValueRow = {
  valueText: string | null;
  valueNumber: Prisma.Decimal | number | null;
  valueDate: Date | null;
  valueBool: boolean | null;
  valueOptions: string[];
  valueRef: string | null;
  valueFileId: string | null;
};

/** แถวค่า → ค่ามาตรฐาน (รูปแบบเดียวกับขาเขียน) */
function readCell(type: MemberFieldType, row: ValueRow | null | undefined): MemberFieldValueInput {
  if (!row) return null;
  switch (type) {
    case "NUMBER":
    case "MONEY":
      return row.valueNumber === null || row.valueNumber === undefined ? null : Number(row.valueNumber);
    case "DATE":
      return row.valueDate ? ymdOf(row.valueDate) : null;
    case "DATETIME":
      return row.valueDate ? row.valueDate.toISOString() : null;
    case "BOOLEAN":
      return row.valueBool === null || row.valueBool === undefined ? null : row.valueBool;
    case "SELECT":
      return row.valueOptions[0] ?? null;
    case "MULTI_SELECT":
      return row.valueOptions ?? [];
    case "FILE":
      return row.valueFileId;
    case "LOOKUP":
      return row.valueRef;
    case "TEXT":
    case "LONG_TEXT":
    default:
      return row.valueText;
  }
}

function sameValue(a: MemberFieldValueInput, b: MemberFieldValueInput): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const xa = Array.isArray(a) ? a : [];
    const xb = Array.isArray(b) ? b : [];
    return xa.length === xb.length && xa.every((v, i) => v === xb[i]);
  }
  return a === b;
}

function toJson(value: MemberFieldValueInput): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null) return Prisma.DbNull;
  if (Array.isArray(value)) return [...value];
  return value;
}

// ───────────────────────── อ่าน/เขียนค่าของ "ฟิลด์ระบบ" ─────────────────────────

type CustomerRow = Customer & Record<string, unknown>;
type AddressRow = MemberAddress & Record<string, unknown>;

function readSystemValue(field: MemberField, customer: CustomerRow, address: AddressRow | null): MemberFieldValueInput {
  const target = targetOf(field);
  if (target.store === "none") return null;
  const raw = target.store === "customer" ? customer[target.column as string] : address?.[target.column as string];
  if (raw === null || raw === undefined) return field.type === "MULTI_SELECT" ? [] : null;
  if (field.type === "DATE") return raw instanceof Date ? ymdOf(raw) : String(raw);
  if (field.type === "DATETIME") return raw instanceof Date ? raw.toISOString() : String(raw);
  if (field.type === "MULTI_SELECT") return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  if (field.type === "NUMBER" || field.type === "MONEY") return Number(raw);
  if (field.type === "BOOLEAN") return Boolean(raw);
  return String(raw);
}

/** ค่ามาตรฐาน → ค่าที่ลงคอลัมน์จริงของ Customer/MemberAddress */
function systemColumnValue(field: MemberField, value: MemberFieldValueInput): unknown {
  if (value === null) return field.type === "MULTI_SELECT" ? [] : null;
  if (field.type === "DATE") return parseYmd(String(value));
  if (field.type === "DATETIME") return new Date(String(value));
  if (field.type === "MULTI_SELECT") return Array.isArray(value) ? [...value] : [];
  return value;
}

// ───────────────────────── DTO ─────────────────────────

function fieldDto(row: MemberField): FieldDef {
  const value = row.defaultValue;
  const defaultValue: MemberFieldValueInput =
    value === null || value === undefined
      ? null
      : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? value
        : Array.isArray(value)
          ? value.filter((v): v is string => typeof v === "string")
          : null;
  return {
    id: row.id,
    sectionId: row.sectionId,
    key: row.key,
    label: row.label,
    description: row.description,
    type: row.type,
    options: optionsOf(row),
    required: row.required,
    unique: row.unique,
    filterable: row.filterable,
    showInList: row.showInList,
    showOnCard: row.showOnCard,
    customerEditable: row.customerEditable,
    sensitive: row.sensitive,
    trackHistory: row.trackHistory,
    isSystem: row.isSystem,
    systemKey: row.systemKey,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    defaultValue,
  };
}

function sectionDto(row: MemberSection, fields: FieldDef[]): SectionDef {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    columns: row.columns,
    sortOrder: row.sortOrder,
    isSystem: row.isSystem,
    sensitive: row.sensitive,
    collapsed: row.collapsed,
    fields,
  };
}

// ───────────────────────── โหลด/ตรวจของที่มีอยู่ ─────────────────────────

async function loadSections(ctx: FieldCtx, db: Client): Promise<MemberSection[]> {
  const rows = await db.memberSection.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows;
}

async function loadFields(ctx: FieldCtx, db: Client): Promise<MemberField[]> {
  const rows = await db.memberField.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows;
}

async function requireSection(ctx: FieldCtx, db: Client, id: string): Promise<MemberSection> {
  const row = await db.memberSection.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!row) throw new Error("ไม่พบส่วนนี้ในระบบสมาชิกนี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่");
  return row;
}

async function requireField(ctx: FieldCtx, db: Client, id: string): Promise<MemberField> {
  const row = await db.memberField.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!row) throw new Error("ไม่พบฟิลด์นี้ในระบบสมาชิกนี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่");
  return row;
}

async function assertSectionCapacity(ctx: FieldCtx, db: Client, adding: number): Promise<void> {
  const n = await db.memberSection.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (n + adding > MEMBER_LIMITS.sections) {
    throw memberLimitError(`ระบบสมาชิกนี้มีส่วนครบ ${MEMBER_LIMITS.sections} ส่วนแล้ว — รวมฟิลด์เข้าส่วนเดิมหรือลบส่วนที่ไม่ได้ใช้ก่อน`);
  }
}

async function assertFieldCapacity(ctx: FieldCtx, db: Client, adding: number): Promise<void> {
  const n = await db.memberField.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null } });
  if (n + adding > MEMBER_LIMITS.fields) {
    throw memberLimitError(`ระบบสมาชิกนี้มีฟิลด์ครบ ${MEMBER_LIMITS.fields} ฟิลด์แล้ว — เก็บฟิลด์ที่ไม่ได้ใช้เข้าคลังก่อนจึงเพิ่มใหม่ได้`);
  }
}

/**
 * เพดาน "ฟิลด์ที่กรองได้" บังคับตอน **เปิดสวิตช์กรอง** (updateField)
 * 🔴 ตั้งใจไม่บังคับตอน createField/applyTemplate: ชุดฟิลด์มาตรฐาน (ฟิลด์ระบบ 8 + เทมเพลตกิจการ)
 *    ถูกสร้างมาพร้อมสวิตช์กรองอยู่แล้ว การปฏิเสธตั้งแต่ตอนสร้าง = ร้านเปิดเทมเพลตไม่ได้เลย
 *    (สัญญาข้อสอบ M1.2-S1.4 / S5.1 / S6.2 ก็ยืนบนเส้นแบ่งนี้)
 */
async function assertFilterableCapacity(ctx: FieldCtx, db: Client): Promise<void> {
  const n = await db.memberField.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, filterable: true, archivedAt: null } });
  if (n + 1 > MEMBER_LIMITS.filterable) {
    throw memberLimitError(`เปิด "ใช้กรองได้" พร้อมกันได้สูงสุด ${MEMBER_LIMITS.filterable} ฟิลด์ (ข้อจำกัดของ index) — ปิดฟิลด์ที่ไม่ได้ใช้กรองก่อน`);
  }
}

// ───────────────────────── ส่วน (MemberSection) ─────────────────────────

export type CreateSectionInput = {
  key: string;
  label: string;
  description?: string | null;
  columns?: number;
  sensitive?: boolean;
  collapsed?: boolean;
};

export async function createSection(ctx: FieldCtx, input: CreateSectionInput, tx?: Client): Promise<SectionDef> {
  const db = clientOf(tx);
  const key = normalizeKey(input.key, "ส่วน");
  const label = normalizeLabel(input.label, "ส่วน");
  const columns = input.columns === undefined ? 2 : Math.min(4, Math.max(1, Math.floor(input.columns)));

  await assertSectionCapacity(ctx, db, 1);
  const dup = await db.memberSection.findFirst({ where: { systemId: ctx.systemId, key }, select: { id: true } });
  if (dup) throw new Error(`มีส่วนที่ใช้ชื่ออ้างอิง "${key}" อยู่แล้วในระบบสมาชิกนี้ — ตั้งชื่ออ้างอิงอื่น`);

  const last = await db.memberSection.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const row = await db.memberSection.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      key,
      label,
      description: normalizeDescription(input.description),
      columns,
      sensitive: input.sensitive ?? false,
      collapsed: input.collapsed ?? false,
      isSystem: false,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  return sectionDto(row, []);
}

export type UpdateSectionInput = {
  label?: string;
  description?: string | null;
  columns?: number;
  sensitive?: boolean;
  collapsed?: boolean;
  sortOrder?: number;
};

export async function updateSection(ctx: FieldCtx, id: string, patch: UpdateSectionInput, tx?: Client): Promise<SectionDef> {
  const db = clientOf(tx);
  const section = await requireSection(ctx, db, id);
  const data: Prisma.MemberSectionUpdateInput = {};
  if (patch.label !== undefined) data.label = normalizeLabel(patch.label, "ส่วน");
  if (patch.description !== undefined) data.description = normalizeDescription(patch.description);
  if (patch.columns !== undefined) data.columns = Math.min(4, Math.max(1, Math.floor(patch.columns)));
  if (patch.collapsed !== undefined) data.collapsed = patch.collapsed;
  if (patch.sortOrder !== undefined) data.sortOrder = Math.max(0, Math.floor(patch.sortOrder));
  if (patch.sensitive !== undefined) {
    if (section.isSystem && patch.sensitive !== section.sensitive) {
      throw new Error(`ส่วน "${section.label}" เป็นส่วนมาตรฐานของระบบ จึงเปลี่ยนสถานะ "ข้อมูลอ่อนไหว" ไม่ได้`);
    }
    data.sensitive = patch.sensitive;
  }
  if (Object.keys(data).length === 0) return sectionDto(section, []);
  const row = await db.memberSection.update({ where: { id: section.id }, data });
  return sectionDto(row, []);
}

/** ลากเรียงส่วน — ids ที่ส่งมาได้ sortOrder ตามลำดับ · ส่วนที่ไม่ส่งมาต่อท้ายตามลำดับเดิม */
export async function reorderSections(ctx: FieldCtx, ids: string[], tx?: Client): Promise<{ ok: true }> {
  const db = clientOf(tx);
  const all = await loadSections(ctx, db);
  const known = new Set(all.map((s) => s.id));
  const ordered = [...ids.filter((id) => known.has(id)), ...all.map((s) => s.id).filter((id) => !ids.includes(id))];
  const write = async (t: Client) => {
    for (let i = 0; i < ordered.length; i += 1) {
      await t.memberSection.update({ where: { id: ordered[i]! }, data: { sortOrder: i } });
    }
  };
  if (tx) await write(tx);
  else await prisma.$transaction(async (t) => write(t));
  return { ok: true };
}

/** ลบส่วน — ได้เฉพาะส่วนที่ไม่ใช่ของระบบ และไม่มีฟิลด์เหลืออยู่ (ฟิลด์ที่เก็บเข้าคลังก็นับ) */
export async function deleteSection(ctx: FieldCtx, id: string, tx?: Client): Promise<{ ok: true }> {
  const db = clientOf(tx);
  const section = await requireSection(ctx, db, id);
  if (section.isSystem) throw new Error(`ส่วน "${section.label}" เป็นส่วนมาตรฐานของระบบ ลบไม่ได้ — ซ่อนฟิลด์ที่ไม่ใช้แทนได้`);
  const n = await db.memberField.count({ where: { tenantId: ctx.tenantId, sectionId: section.id } });
  if (n > 0) throw new Error(`ส่วน "${section.label}" ยังมีฟิลด์อยู่ ${n} ฟิลด์ — ย้ายหรือลบฟิลด์ออกให้หมดก่อนจึงลบส่วนได้`);
  await db.memberSection.delete({ where: { id: section.id } });
  return { ok: true };
}

// ───────────────────────── ฟิลด์ (MemberField) ─────────────────────────

export type CreateFieldInput = {
  sectionId: string;
  key: string;
  label: string;
  type: string;
  description?: string | null;
  options?: unknown;
  required?: boolean;
  defaultValue?: MemberFieldValueInput;
  unique?: boolean;
  filterable?: boolean;
  showInList?: boolean;
  showOnCard?: boolean;
  customerEditable?: boolean;
  sensitive?: boolean;
  trackHistory?: boolean;
};

export async function createField(ctx: FieldCtx, input: CreateFieldInput, tx?: Client): Promise<FieldDef> {
  const db = clientOf(tx);
  const section = await requireSection(ctx, db, input.sectionId);
  const key = normalizeKey(input.key, "ฟิลด์");
  const label = normalizeLabel(input.label, "ฟิลด์");
  const type = normalizeType(input.type);
  const options = normalizeFieldOptions(type, input.options);

  await assertFieldCapacity(ctx, db, 1);
  const dup = await db.memberField.findFirst({ where: { systemId: ctx.systemId, key }, select: { id: true, label: true } });
  if (dup) throw new Error(`มีฟิลด์ที่ใช้ชื่ออ้างอิง "${key}" อยู่แล้วในระบบสมาชิกนี้ — ตั้งชื่ออ้างอิงอื่น`);

  const last = await db.memberField.findFirst({
    where: { tenantId: ctx.tenantId, sectionId: section.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const row = await db.memberField.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      sectionId: section.id,
      key,
      label,
      description: normalizeDescription(input.description),
      type,
      options: options as Prisma.InputJsonValue,
      required: input.required ?? false,
      defaultValue: input.defaultValue === undefined || input.defaultValue === null ? Prisma.DbNull : toJson(input.defaultValue),
      unique: input.unique ?? false,
      filterable: input.filterable ?? false,
      showInList: input.showInList ?? false,
      showOnCard: input.showOnCard ?? false,
      customerEditable: input.customerEditable ?? false,
      sensitive: input.sensitive ?? section.sensitive,
      trackHistory: input.trackHistory ?? false,
      isSystem: false,
      systemKey: null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  return fieldDto(row);
}

export type UpdateFieldInput = {
  sectionId?: string;
  key?: string;
  label?: string;
  description?: string | null;
  type?: string;
  options?: unknown;
  required?: boolean;
  defaultValue?: MemberFieldValueInput;
  unique?: boolean;
  filterable?: boolean;
  showInList?: boolean;
  showOnCard?: boolean;
  customerEditable?: boolean;
  sensitive?: boolean;
  trackHistory?: boolean;
  sortOrder?: number;
};

/** สิ่งที่ฟิลด์ระบบแก้ได้ (§5.3) — นอกรายการนี้คือคอลัมน์จริงของ Customer จึงเปลี่ยนไม่ได้ */
const SYSTEM_EDITABLE_KEYS = new Set<keyof UpdateFieldInput>([
  "label", "description", "sortOrder", "showInList", "showOnCard", "required", "trackHistory", "customerEditable", "filterable", "sensitive", "sectionId",
]);

export async function updateField(ctx: FieldCtx, id: string, patch: UpdateFieldInput, tx?: Client): Promise<FieldDef> {
  const db = clientOf(tx);
  const field = await requireField(ctx, db, id);

  if (field.isSystem) {
    const blocked = (Object.keys(patch) as (keyof UpdateFieldInput)[]).filter((k) => patch[k] !== undefined && !SYSTEM_EDITABLE_KEYS.has(k));
    if (blocked.length > 0) {
      throw new Error(
        `ฟิลด์ "${field.label}" เป็นฟิลด์มาตรฐานของระบบ (ค่าอยู่ในข้อมูลลูกค้าโดยตรง) จึงเปลี่ยนชนิด/ชื่ออ้างอิง/ตัวเลือก/การห้ามซ้ำไม่ได้ — เปลี่ยนได้เฉพาะป้าย คำอธิบาย ลำดับ และสวิตช์การแสดงผล`,
      );
    }
    if (patch.required === true && !field.required) {
      throw new Error(`ฟิลด์ "${field.label}" เป็นฟิลด์มาตรฐานของระบบ จึงตั้งเป็น "ต้องกรอก" เพิ่มเองไม่ได้ (ข้อมูลเดิมบางคนยังว่างอยู่)`);
    }
  }

  const data: Prisma.MemberFieldUpdateInput = {};
  if (patch.sectionId !== undefined) {
    const section = await requireSection(ctx, db, patch.sectionId);
    data.sectionId = section.id;
  }
  if (patch.label !== undefined) data.label = normalizeLabel(patch.label, "ฟิลด์");
  if (patch.description !== undefined) data.description = normalizeDescription(patch.description);
  if (patch.key !== undefined) {
    const key = normalizeKey(patch.key, "ฟิลด์");
    if (key !== field.key) {
      const dup = await db.memberField.findFirst({ where: { systemId: ctx.systemId, key, id: { not: field.id } }, select: { id: true } });
      if (dup) throw new Error(`มีฟิลด์ที่ใช้ชื่ออ้างอิง "${key}" อยู่แล้วในระบบสมาชิกนี้ — ตั้งชื่ออ้างอิงอื่น`);
      data.key = key;
    }
  }
  if (patch.type !== undefined) {
    const type = normalizeType(patch.type);
    if (type !== field.type) {
      const used = await db.memberFieldValue.count({ where: { tenantId: ctx.tenantId, fieldId: field.id } });
      if (used > 0) throw new Error(`ฟิลด์ "${field.label}" มีข้อมูลของสมาชิกอยู่แล้ว ${used} คน จึงเปลี่ยนชนิดฟิลด์ไม่ได้ — สร้างฟิลด์ใหม่แล้วเก็บฟิลด์เดิมเข้าคลังแทน`);
      data.type = type;
      data.options = normalizeFieldOptions(type, patch.options ?? {}) as Prisma.InputJsonValue;
    }
  }
  if (patch.options !== undefined && data.options === undefined) {
    const type = (data.type as MemberFieldType | undefined) ?? field.type;
    data.options = normalizeFieldOptions(type, patch.options) as Prisma.InputJsonValue;
  }
  if (patch.required !== undefined) data.required = patch.required;
  if (patch.defaultValue !== undefined) data.defaultValue = toJson(patch.defaultValue);
  if (patch.showInList !== undefined) data.showInList = patch.showInList;
  if (patch.showOnCard !== undefined) data.showOnCard = patch.showOnCard;
  if (patch.customerEditable !== undefined) {
    const sensitive = patch.sensitive ?? field.sensitive;
    if (patch.customerEditable === true && sensitive) {
      throw new Error(`ฟิลด์ "${field.label}" เป็นข้อมูลอ่อนไหว จึงเปิดให้ลูกค้าแก้เองไม่ได้`);
    }
    data.customerEditable = patch.customerEditable;
  }
  if (patch.sensitive !== undefined) data.sensitive = patch.sensitive;
  if (patch.trackHistory !== undefined) data.trackHistory = patch.trackHistory;
  if (patch.sortOrder !== undefined) data.sortOrder = Math.max(0, Math.floor(patch.sortOrder));
  if (patch.unique !== undefined && patch.unique !== field.unique) {
    if (patch.unique === true) await assertNoDuplicateValues(ctx, db, field);
    data.unique = patch.unique;
  }
  if (patch.filterable !== undefined && patch.filterable !== field.filterable) {
    if (patch.filterable === true) await assertFilterableCapacity(ctx, db);
    data.filterable = patch.filterable;
  }

  if (Object.keys(data).length === 0) return fieldDto(field);
  const row = await db.memberField.update({ where: { id: field.id }, data });
  return fieldDto(row);
}

/** เปิด "ห้ามซ้ำ" ได้ต่อเมื่อข้อมูลเดิมยังไม่มีค่าซ้ำ (§11.2) */
async function assertNoDuplicateValues(ctx: FieldCtx, db: Client, field: MemberField): Promise<void> {
  if (field.isSystem) return;
  const rows = await db.memberFieldValue.findMany({ where: { tenantId: ctx.tenantId, fieldId: field.id } });
  const seen = new Set<string>();
  for (const row of rows) {
    const value = readCell(field.type, row);
    if (value === null || (Array.isArray(value) && value.length === 0)) continue;
    const token = JSON.stringify(value);
    if (seen.has(token)) {
      throw new Error(`เปิด "ห้ามซ้ำ" ให้ฟิลด์ "${field.label}" ยังไม่ได้ เพราะมีสมาชิกที่ใช้ค่าเดียวกันอยู่แล้ว — แก้ค่าที่ซ้ำก่อน`);
    }
    seen.add(token);
  }
}

export async function archiveField(ctx: FieldCtx, id: string, tx?: Client): Promise<FieldDef> {
  const db = clientOf(tx);
  const field = await requireField(ctx, db, id);
  if (field.isSystem) throw new Error(`ฟิลด์ "${field.label}" เป็นฟิลด์มาตรฐานของระบบ จึงเก็บเข้าคลังไม่ได้ — ปิดสวิตช์ "แสดงในรายการ" แทนได้`);
  if (field.archivedAt) return fieldDto(field);
  const row = await db.memberField.update({ where: { id: field.id }, data: { archivedAt: new Date() } });
  return fieldDto(row);
}

export async function restoreField(ctx: FieldCtx, id: string, tx?: Client): Promise<FieldDef> {
  const db = clientOf(tx);
  const field = await requireField(ctx, db, id);
  if (!field.archivedAt) return fieldDto(field);
  await assertFieldCapacity(ctx, db, 1);
  const row = await db.memberField.update({ where: { id: field.id }, data: { archivedAt: null } });
  return fieldDto(row);
}

/** ลากเรียงฟิลด์ในส่วนเดียว — ฟิลด์ที่ไม่ส่งมาต่อท้ายตามลำดับเดิม */
export async function reorderFields(ctx: FieldCtx, sectionId: string, ids: string[], tx?: Client): Promise<{ ok: true }> {
  const db = clientOf(tx);
  const section = await requireSection(ctx, db, sectionId);
  const all = await db.memberField.findMany({
    where: { tenantId: ctx.tenantId, sectionId: section.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const known = new Set(all.map((f) => f.id));
  const ordered = [...ids.filter((id) => known.has(id)), ...all.map((f) => f.id).filter((id) => !ids.includes(id))];
  const write = async (t: Client) => {
    for (let i = 0; i < ordered.length; i += 1) {
      await t.memberField.update({ where: { id: ordered[i]! }, data: { sortOrder: i } });
    }
  };
  if (tx) await write(tx);
  else await prisma.$transaction(async (t) => write(t));
  return { ok: true };
}

// ───────────────────────── เลย์เอาต์ ─────────────────────────

export type ListLayoutOptions = { audience?: "staff" | "customer"; includeArchived?: boolean };

/**
 * เลย์เอาต์ของหน้าโปรไฟล์: ส่วนเรียงตาม sortOrder · ฟิลด์ในส่วนเรียงตาม sortOrder
 * audience "customer" = หน้าฝั่งลูกค้า (`/m/*`) → เห็นเฉพาะฟิลด์ที่เปิดให้ลูกค้าแก้เอง และไม่มีส่วน/ฟิลด์อ่อนไหว
 */
export async function listLayout(ctx: FieldCtx, opts: ListLayoutOptions = {}, tx?: Client): Promise<{ sections: SectionDef[] }> {
  const db = clientOf(tx);
  const [sections, fields] = await Promise.all([loadSections(ctx, db), loadFields(ctx, db)]);
  const forCustomer = opts.audience === "customer";
  const bySection = new Map<string, FieldDef[]>();
  for (const f of fields) {
    if (f.archivedAt && !opts.includeArchived) continue;
    if (forCustomer && (!f.customerEditable || f.sensitive)) continue;
    const list = bySection.get(f.sectionId) ?? [];
    list.push(fieldDto(f));
    bySection.set(f.sectionId, list);
  }
  const out: SectionDef[] = [];
  for (const s of sections) {
    if (forCustomer && s.sensitive) continue;
    const list = (bySection.get(s.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    if (forCustomer && list.length === 0) continue;
    out.push(sectionDto(s, list));
  }
  return { sections: out };
}

// ───────────────────────── ค่าฟิลด์: อ่าน ─────────────────────────

/**
 * อ่านค่าฟิลด์ทั้งหมด (กำหนดเอง + ฟิลด์ระบบที่อ่านจากคอลัมน์จริง) ของสมาชิกหลายคนในครั้งเดียว
 * คืน record ของ "ทุก id ที่ขอมา" เสมอ (คนที่ไม่มีค่า = {}) เพื่อให้ผู้เรียกไม่ต้องเช็ค undefined สองชั้น
 */
export async function getFieldValues(
  ctx: FieldCtx,
  customerIds: string[],
  tx?: Client,
): Promise<Record<string, Record<string, MemberFieldValueInput>>> {
  const db = clientOf(tx);
  const out: Record<string, Record<string, MemberFieldValueInput>> = {};
  const ids = [...new Set(customerIds.filter((id) => typeof id === "string" && id))];
  for (const id of ids) out[id] = {};
  if (ids.length === 0) return out;

  const fields = await db.memberField.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null } });
  const byId = new Map(fields.map((f) => [f.id, f]));
  const [customers, addresses, values] = await Promise.all([
    db.customer.findMany({ where: { id: { in: ids }, tenantId: ctx.tenantId, memberSystemId: ctx.systemId } }),
    db.memberAddress.findMany({ where: { tenantId: ctx.tenantId, customerId: { in: ids } }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    db.memberFieldValue.findMany({ where: { tenantId: ctx.tenantId, customerId: { in: ids }, fieldId: { in: fields.filter((f) => !f.isSystem).map((f) => f.id) } } }),
  ]);

  const addressOf = new Map<string, AddressRow>();
  for (const a of addresses) if (!addressOf.has(a.customerId)) addressOf.set(a.customerId, a as AddressRow);

  for (const customer of customers) {
    const bag = out[customer.id] ?? {};
    for (const field of fields) {
      if (!field.isSystem) continue;
      const value = readSystemValue(field, customer as CustomerRow, addressOf.get(customer.id) ?? null);
      if (value !== null && !(Array.isArray(value) && value.length === 0)) bag[field.key] = value;
    }
    out[customer.id] = bag;
  }
  for (const row of values) {
    const field = byId.get(row.fieldId);
    if (!field) continue;
    const bag = out[row.customerId];
    if (!bag) continue;
    const value = readCell(field.type, row);
    if (value !== null) bag[field.key] = value;
  }
  return out;
}

// ───────────────────────── ค่าฟิลด์: เขียน ─────────────────────────

export type SetFieldValuesOptions = { via: MemberConsentSource | string; byUserId?: string | null };

type PendingWrite = {
  field: MemberField;
  value: MemberFieldValueInput;
  oldValue: MemberFieldValueInput;
  changed: boolean;
};

/**
 * ตรวจการมีอยู่ของปลายทาง LOOKUP "ในร้านนี้"
 * 🔴 อ่าน prisma ตรง (ไม่ผ่าน facade ของโมดูลอื่น) โดยตั้งใจ: เป็นการอ่านอย่างเดียวเพื่อ
 *    ยืนยัน "id นี้มีจริงและอยู่ในร้านเดียวกันไหม" ไม่มีตรรกะธุรกิจของโมดูลปลายทางเข้ามาเกี่ยว
 *    (ถ้าเรียกผ่าน facade จะกลายเป็นเส้น import ข้ามโมดูลถาวรของ member → hr/inventory/booking)
 */
async function lookupExists(ctx: FieldCtx, db: Client, target: MemberLookupTarget, id: string): Promise<boolean> {
  const where = { id, tenantId: ctx.tenantId };
  switch (target) {
    case "EMPLOYEE":
      return (await db.hrEmployee.count({ where })) > 0;
    // M1.4 — "ผู้ใช้ระบบ" ไม่ใช่ id ของตาราง User เปล่า ๆ แต่ต้อง **มี Membership ในร้านนี้**
    // (ผู้ใช้ของร้านอื่นจึงถูกตั้งเป็นผู้ดูแลสมาชิกของเราไม่ได้ — กันข้อมูลรั่วข้ามร้าน)
    case "USER":
      return (await db.membership.count({ where: { tenantId: ctx.tenantId, userId: id } })) > 0;
    case "UNIT":
      return (await db.businessUnit.count({ where })) > 0;
    case "PRODUCT":
      return (await db.invItem.count({ where })) > 0;
    case "SERVICE":
      return (await db.bookingService.count({ where })) > 0;
    case "CUSTOMER":
    default:
      return (await db.customer.count({ where: { ...where, memberSystemId: ctx.systemId } })) > 0;
  }
}

const LOOKUP_LABEL: Record<MemberLookupTarget, string> = {
  EMPLOYEE: "พนักงาน",
  USER: "ผู้ใช้ระบบ",
  UNIT: "สาขา",
  PRODUCT: "สินค้า",
  SERVICE: "บริการ",
  CUSTOMER: "สมาชิก",
};

/**
 * เขียนค่าฟิลด์หลายตัวของสมาชิก 1 คน
 * ลำดับ: ตรวจครบทุกค่า → อ่านค่าเดิม → เขียนทั้งชุดใน transaction เดียว → คืน key ที่ค่าเปลี่ยนจริง
 */
export async function setFieldValues(
  ctx: FieldCtx,
  customerId: string,
  values: Record<string, unknown>,
  opts: SetFieldValuesOptions,
  tx?: Client,
): Promise<{ changed: string[] }> {
  const db = clientOf(tx);
  const via = normalizeVia(opts?.via);
  const byUserId = opts?.byUserId ?? ctx.actorUserId ?? null;
  const keys = Object.keys(values ?? {});
  if (keys.length === 0) return { changed: [] };

  const customer = (await db.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
  })) as CustomerRow | null;
  if (!customer) throw new Error("ไม่พบสมาชิกคนนี้ในระบบสมาชิกนี้ — ตรวจว่าเปิดจากร้าน/ระบบเดียวกันหรือไม่");

  const fields = await db.memberField.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, key: { in: keys } } });
  const byKey = new Map(fields.map((f) => [f.key, f]));

  // ── 1. ตรวจให้ครบก่อน (ค่าผิดตัวเดียว = ไม่เขียนอะไรเลย) ──
  const checked: { field: MemberField; value: MemberFieldValueInput }[] = [];
  for (const key of keys) {
    const field = byKey.get(key);
    if (!field) throw new Error(`ไม่มีฟิลด์ชื่ออ้างอิง "${key}" ในระบบสมาชิกนี้ — ตรวจการตั้งค่าฟิลด์อีกครั้ง`);
    if (field.archivedAt) throw new Error(`ฟิลด์ "${field.label}" ถูกเก็บเข้าคลังไว้ จึงบันทึกค่าใหม่ไม่ได้ — กู้คืนฟิลด์ก่อน`);
    if (via === "CUSTOMER_SELF" && !field.customerEditable) {
      throw new Error(`ฟิลด์ "${field.label}" ให้เจ้าหน้าที่ร้านเป็นผู้กรอก ลูกค้าจึงแก้เองไม่ได้`);
    }
    const value = normalizeValue(field, values[key]);
    if (field.required && isBlank(value)) throw new Error(`ฟิลด์ "${field.label}" เป็นข้อมูลที่ต้องกรอก — ใส่ค่าก่อนบันทึก`);
    if (field.isSystem && targetOf(field).store === "none" && value !== null) {
      throw new Error(`ฟิลด์ "${field.label}" ยังไม่มีที่เก็บในฐานข้อมูลรุ่นนี้ จึงบันทึกค่าไม่ได้ — แจ้งผู้ดูแลระบบเพื่อเปิดใช้`);
    }
    checked.push({ field, value });
  }

  // ── 2. ตรวจปลายทาง LOOKUP + ค่าซ้ำ (ทั้งสองอย่างต้องยิง DB จึงแยกออกมาหลังตรวจรูปแบบ) ──
  for (const { field, value } of checked) {
    if (value === null) continue;
    if (field.type === "LOOKUP") {
      const target = optionsOf(field).target ?? "CUSTOMER";
      const ok = await lookupExists(ctx, db, target, String(value));
      if (!ok) throw new Error(`ไม่พบ${LOOKUP_LABEL[target]}ที่เลือกไว้ในฟิลด์ "${field.label}" ภายในร้านนี้ — เลือกใหม่จากรายการ`);
    }
    if (field.unique) await assertValueNotTaken(ctx, db, field, value, customerId);
  }

  // ── 3. อ่านค่าเดิม → หาว่าอะไรเปลี่ยนจริง ──
  const customIds = checked.filter((c) => !c.field.isSystem).map((c) => c.field.id);
  const existing = customIds.length
    ? await db.memberFieldValue.findMany({ where: { tenantId: ctx.tenantId, customerId, fieldId: { in: customIds } } })
    : [];
  const existingBy = new Map(existing.map((row) => [row.fieldId, row]));
  const needAddress = checked.some((c) => c.field.isSystem && targetOf(c.field).store === "address");
  const address = needAddress
    ? ((await db.memberAddress.findFirst({
        where: { tenantId: ctx.tenantId, customerId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      })) as AddressRow | null)
    : null;

  const pending: PendingWrite[] = checked.map(({ field, value }) => {
    const oldValue = field.isSystem
      ? readSystemValue(field, customer, address)
      : readCell(field.type, existingBy.get(field.id) ?? null);
    return { field, value, oldValue, changed: !sameValue(oldValue, value) };
  });
  const changedWrites = pending.filter((p) => p.changed);
  if (changedWrites.length === 0) return { changed: [] };

  // ── 4. เขียนทั้งชุดใน transaction เดียว ──
  const customerData: Record<string, unknown> = {};
  const addressData: Record<string, unknown> = {};
  const write = async (t: Client) => {
    for (const item of changedWrites) {
      const { field, value } = item;
      if (field.isSystem) {
        const target = targetOf(field);
        if (target.store === "customer") customerData[target.column as string] = systemColumnValue(field, value);
        else if (target.store === "address") addressData[target.column as string] = systemColumnValue(field, value);
      } else if (value === null) {
        await t.memberFieldValue.deleteMany({ where: { tenantId: ctx.tenantId, customerId, fieldId: field.id } });
      } else {
        const cell = cellOf(field.type, value);
        await t.memberFieldValue.upsert({
          where: { customerId_fieldId: { customerId, fieldId: field.id } },
          create: { tenantId: ctx.tenantId, customerId, fieldId: field.id, ...cell, updatedById: byUserId },
          update: { ...cell, updatedById: byUserId },
        });
      }
    }
    if (Object.keys(customerData).length > 0) {
      await t.customer.update({ where: { id: customerId }, data: customerData as Prisma.CustomerUpdateInput });
    }
    if (Object.keys(addressData).length > 0) {
      if (address) {
        await t.memberAddress.update({ where: { id: address.id }, data: addressData as Prisma.MemberAddressUpdateInput });
      } else {
        await t.memberAddress.create({
          data: {
            tenantId: ctx.tenantId,
            customerId,
            kind: "HOME",
            isDefault: true,
            line1: typeof addressData.line1 === "string" ? addressData.line1 : "",
            ...addressData,
          } as Prisma.MemberAddressUncheckedCreateInput,
        });
      }
    }
    const history = changedWrites.filter((p) => p.field.trackHistory);
    if (history.length > 0) {
      await t.memberFieldValueHistory.createMany({
        data: history.map((p) => ({
          tenantId: ctx.tenantId,
          customerId,
          fieldId: p.field.id,
          oldValue: toJson(p.oldValue),
          newValue: toJson(p.value),
          changedById: byUserId,
          changedVia: via,
        })),
      });
    }
  };
  if (tx) await write(tx);
  else await prisma.$transaction(async (t) => write(t));

  return { changed: changedWrites.map((p) => p.field.key) };
}

/** ค่าซ้ำกับสมาชิกคนอื่นในระบบเดียวกันหรือยัง (ค่าเดิมของคนเดิม = ผ่าน) */
async function assertValueNotTaken(
  ctx: FieldCtx,
  db: Client,
  field: MemberField,
  value: MemberFieldValueInput,
  customerId: string,
): Promise<void> {
  const shown = Array.isArray(value) ? value.join(", ") : String(value);
  if (field.isSystem) {
    const target = targetOf(field);
    if (target.store !== "customer") return;
    const taken = await db.customer.count({
      where: {
        tenantId: ctx.tenantId,
        memberSystemId: ctx.systemId,
        id: { not: customerId },
        ...({ [target.column as string]: systemColumnValue(field, value) } as Prisma.CustomerWhereInput),
      },
    });
    if (taken > 0) throw new Error(`มีสมาชิกคนอื่นใช้ ${field.label} "${shown}" อยู่แล้ว — ตรวจว่าเป็นคนเดียวกันหรือไม่`);
    return;
  }
  const cell = cellOf(field.type, value);
  const match: Prisma.MemberFieldValueWhereInput = { tenantId: ctx.tenantId, fieldId: field.id, customerId: { not: customerId } };
  switch (field.type) {
    case "NUMBER":
    case "MONEY":
      match.valueNumber = cell.valueNumber;
      break;
    case "DATE":
    case "DATETIME":
      match.valueDate = cell.valueDate;
      break;
    case "BOOLEAN":
      match.valueBool = cell.valueBool;
      break;
    case "SELECT":
    case "MULTI_SELECT":
      match.valueOptions = { equals: cell.valueOptions };
      break;
    case "FILE":
      match.valueFileId = cell.valueFileId;
      break;
    case "LOOKUP":
      match.valueRef = cell.valueRef;
      break;
    default:
      match.valueText = cell.valueText;
      break;
  }
  const taken = await db.memberFieldValue.count({ where: match });
  if (taken > 0) throw new Error(`มีสมาชิกคนอื่นใช้ค่า "${shown}" ในฟิลด์ "${field.label}" อยู่แล้ว — ฟิลด์นี้ตั้งไว้ว่าห้ามซ้ำ`);
}

// ───────────────────────── ตัวกรอง → Prisma where ของ Customer ─────────────────────────

const TRUE_WORDS = new Set(["true", "1", "yes", "ใช่"]);
const FALSE_WORDS = new Set(["false", "0", "no", "ไม่ใช่"]);

function parseRange(raw: string): { from: string | null; to: string | null; eq: string | null } {
  const text = raw.trim();
  if (text.startsWith("=")) return { from: null, to: null, eq: text.slice(1).trim() };
  const idx = text.indexOf("..");
  if (idx < 0) return { from: null, to: null, eq: text };
  const from = text.slice(0, idx).trim();
  const to = text.slice(idx + 2).trim();
  return { from: from || null, to: to || null, eq: null };
}

function numberOr(raw: string | null, label: string): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`ตัวกรองของฟิลด์ "${label}" ต้องเป็นตัวเลข เช่น 10..50 หรือ =42`);
  return n;
}

function ymdOrThrow(raw: string | null, label: string): Date | null {
  if (raw === null) return null;
  const d = parseYmd(raw) ?? (ISO_RE.test(raw) && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : null);
  if (!d) throw new Error(`ตัวกรองของฟิลด์ "${label}" ต้องเป็นวันที่รูปแบบ ปี-เดือน-วัน เช่น 2026-01-01..2026-03-31`);
  return d;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** เงื่อนไขบนคอลัมน์ค่า (MemberFieldValue) ของ 1 ตัวกรอง · negate = "ไม่มีค่านี้" (เช่น FILE=false) */
function valueWhereOf(field: MemberField, raw: string): { where: Prisma.MemberFieldValueWhereInput; negate: boolean } {
  const text = String(raw ?? "").trim();
  const label = field.label;
  switch (field.type) {
    case "NUMBER":
    case "MONEY": {
      const { from, to, eq } = parseRange(text);
      if (eq !== null) return { where: { valueNumber: numberOr(eq, label) }, negate: false };
      const gte = numberOr(from, label);
      const lte = numberOr(to, label);
      return { where: { valueNumber: { ...(gte !== null ? { gte } : {}), ...(lte !== null ? { lte } : {}) } }, negate: false };
    }
    case "DATE":
    case "DATETIME": {
      const { from, to, eq } = parseRange(text);
      if (eq !== null) {
        const at = ymdOrThrow(eq, label);
        return { where: { valueDate: at ? { gte: at, lt: new Date(at.getTime() + DAY_MS) } : null }, negate: false };
      }
      const gte = ymdOrThrow(from, label);
      const toDate = ymdOrThrow(to, label);
      return {
        where: { valueDate: { ...(gte ? { gte } : {}), ...(toDate ? { lt: new Date(toDate.getTime() + DAY_MS) } : {}) } },
        negate: false,
      };
    }
    case "BOOLEAN": {
      const lower = text.toLowerCase();
      if (TRUE_WORDS.has(lower)) return { where: { valueBool: true }, negate: false };
      if (FALSE_WORDS.has(lower)) return { where: { valueBool: false }, negate: false };
      throw new Error(`ตัวกรองของฟิลด์ "${label}" ต้องเป็น true หรือ false`);
    }
    case "SELECT":
    case "MULTI_SELECT": {
      const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) throw new Error(`ตัวกรองของฟิลด์ "${label}" ต้องมีอย่างน้อย 1 ตัวเลือก (คั่นหลายตัวด้วยจุลภาค)`);
      return { where: { valueOptions: { hasSome: parts } }, negate: false };
    }
    case "FILE": {
      const lower = text.toLowerCase();
      if (TRUE_WORDS.has(lower)) return { where: { NOT: { valueFileId: null } }, negate: false };
      if (FALSE_WORDS.has(lower)) return { where: { NOT: { valueFileId: null } }, negate: true };
      return { where: { valueFileId: text }, negate: false };
    }
    case "LOOKUP":
      return { where: { valueRef: text }, negate: false };
    case "TEXT":
    case "LONG_TEXT":
    default: {
      if (text.startsWith("=")) return { where: { valueText: text.slice(1) }, negate: false };
      return { where: { valueText: { contains: text } }, negate: false };
    }
  }
}

/** เงื่อนไขของฟิลด์ระบบ = กรองที่คอลัมน์ของ Customer ตรง ๆ (ไม่ต้องผ่านตารางค่า) */
function systemWhereOf(field: MemberField, column: string, raw: string): Prisma.CustomerWhereInput {
  const text = String(raw ?? "").trim();
  const label = field.label;
  const at = (cond: unknown): Prisma.CustomerWhereInput => ({ [column]: cond }) as Prisma.CustomerWhereInput;
  switch (field.type) {
    case "NUMBER":
    case "MONEY": {
      const { from, to, eq } = parseRange(text);
      if (eq !== null) return at(numberOr(eq, label));
      const gte = numberOr(from, label);
      const lte = numberOr(to, label);
      return at({ ...(gte !== null ? { gte } : {}), ...(lte !== null ? { lte } : {}) });
    }
    case "DATE":
    case "DATETIME": {
      const { from, to, eq } = parseRange(text);
      if (eq !== null) {
        const day = ymdOrThrow(eq, label);
        return at(day ? { gte: day, lt: new Date(day.getTime() + DAY_MS) } : null);
      }
      const gte = ymdOrThrow(from, label);
      const toDate = ymdOrThrow(to, label);
      return at({ ...(gte ? { gte } : {}), ...(toDate ? { lt: new Date(toDate.getTime() + DAY_MS) } : {}) });
    }
    case "BOOLEAN": {
      const lower = text.toLowerCase();
      if (TRUE_WORDS.has(lower)) return at(true);
      if (FALSE_WORDS.has(lower)) return at(false);
      throw new Error(`ตัวกรองของฟิลด์ "${label}" ต้องเป็น true หรือ false`);
    }
    case "SELECT": {
      const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
      return at({ in: parts });
    }
    case "MULTI_SELECT": {
      const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
      // คอลัมน์ tags ของ Customer เป็น Json array — เทียบทีละค่าแล้วรวมด้วย OR
      return { OR: parts.map((p) => at({ array_contains: [p] })) };
    }
    case "FILE": {
      const lower = text.toLowerCase();
      if (TRUE_WORDS.has(lower)) return at({ not: null });
      if (FALSE_WORDS.has(lower)) return at(null);
      return at(text);
    }
    case "LOOKUP":
      return at(text);
    case "TEXT":
    case "LONG_TEXT":
    default:
      return text.startsWith("=") ? at(text.slice(1)) : at({ contains: text });
  }
}

/**
 * แปลงตัวกรองฟิลด์ (`f.<key>` ของหน้ารวมสมาชิก) → `Prisma.CustomerWhereInput`
 *
 * 🔴 `Customer` **ไม่มี relation** ไป `MemberFieldValue` (มติ M1.1 — ตารางใหม่ไม่ผูก FK ข้ามโมดูล)
 *    จึงกรองด้วยวิธี "หา customerId จากตารางค่าก่อน แล้วค่อยส่งเป็น id in (...)" ทีละตัวกรอง
 *    ตารางค่ามี index (fieldId, valueText/valueNumber/valueDate) ⇒ แต่ละตัวกรองอ่านด้วย index จริง
 */
export async function fieldFilterWhere(
  ctx: FieldCtx,
  filters: Record<string, string>,
  tx?: Client,
): Promise<Prisma.CustomerWhereInput> {
  const db = clientOf(tx);
  const keys = Object.keys(filters ?? {});
  if (keys.length === 0) return {};
  const fields = await db.memberField.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, key: { in: keys } } });
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const AND: Prisma.CustomerWhereInput[] = [];
  for (const key of keys) {
    const field = byKey.get(key);
    if (!field) throw new Error(`ไม่มีฟิลด์ชื่ออ้างอิง "${key}" ในระบบสมาชิกนี้ จึงใช้กรองไม่ได้`);
    if (!field.filterable) throw new Error(`ฟิลด์ "${field.label}" ยังไม่ได้เปิด "ใช้กรองได้" — เปิดที่หน้าตั้งค่าฟิลด์ก่อนจึงกรองด้วยฟิลด์นี้ได้`);
    const raw = String(filters[key] ?? "");

    if (field.isSystem) {
      const target = targetOf(field);
      if (target.store === "customer") {
        AND.push(systemWhereOf(field, target.column as string, raw));
        continue;
      }
      if (target.store === "address") {
        const rows = await db.memberAddress.findMany({
          where: {
            tenantId: ctx.tenantId,
            ...({ [target.column as string]: raw.startsWith("=") ? raw.slice(1) : { contains: raw } } as Prisma.MemberAddressWhereInput),
          },
          select: { customerId: true },
        });
        AND.push({ id: { in: [...new Set(rows.map((r) => r.customerId))] } });
        continue;
      }
      throw new Error(`ฟิลด์ "${field.label}" ยังไม่มีที่เก็บในฐานข้อมูลรุ่นนี้ จึงใช้กรองไม่ได้`);
    }

    const { where, negate } = valueWhereOf(field, raw);
    const rows = await db.memberFieldValue.findMany({
      where: { tenantId: ctx.tenantId, fieldId: field.id, ...where },
      select: { customerId: true },
    });
    const ids = [...new Set(rows.map((r) => r.customerId))];
    AND.push(negate ? { id: { notIn: ids } } : { id: { in: ids } });
  }
  return { AND };
}

// ───────────────────────── เทมเพลตกิจการ ─────────────────────────

export type ApplyTemplateOptions = {
  /** จำกัดให้เพิ่มเฉพาะฟิลด์ตาม key ที่ระบุ (ใช้ตอน seed ชุด QC ให้เหมือนร้านที่ตั้งค่าด้วยเทมเพลตรุ่นก่อน) */
  onlyFieldKeys?: string[];
};

/**
 * เปิดใช้เทมเพลตกิจการ: เพิ่ม "ส่วน/ฟิลด์ที่ยังไม่มี" เท่านั้น (เทียบด้วย key)
 * ไม่ทับ label/options/สวิตช์ของที่ร้านแก้ไว้ · รันซ้ำได้ผลเท่าเดิม · ผ่าน validate ชุดเดียวกับ createSection/createField
 */
export async function applyTemplate(
  ctx: FieldCtx,
  templateKey: string,
  opts: ApplyTemplateOptions = {},
  tx?: Client,
): Promise<{ added: { sections: number; fields: number } }> {
  const db = clientOf(tx);
  const template = TEMPLATES[templateKey];
  if (!template) {
    throw new Error(`ไม่รู้จักเทมเพลตกิจการ "${templateKey}" — เลือกได้ ${Object.keys(TEMPLATES).join(" / ")}`);
  }
  const only = opts.onlyFieldKeys ? new Set(opts.onlyFieldKeys) : null;

  const [sections, fields] = await Promise.all([loadSections(ctx, db), loadFields(ctx, db)]);
  const sectionByKey = new Map(sections.map((s) => [s.key, s.id]));
  const fieldKeys = new Set(fields.map((f) => f.key));

  const added = { sections: 0, fields: 0 };
  for (const tplSection of template.sections as MemberTemplateSection[]) {
    const wanted = tplSection.fields.filter((f) => (only ? only.has(f.key) : true) && !fieldKeys.has(f.key));
    let sectionId = sectionByKey.get(tplSection.key);
    if (!sectionId) {
      if (wanted.length === 0) continue; // ไม่มีอะไรจะใส่ในส่วนนั้น = ไม่ต้องสร้างส่วนเปล่า
      const created = await createSection(
        ctx,
        {
          key: tplSection.key,
          label: tplSection.label,
          description: tplSection.description ?? null,
          columns: tplSection.columns,
          sensitive: tplSection.sensitive ?? false,
        },
        tx,
      );
      sectionId = created.id;
      sectionByKey.set(tplSection.key, created.id);
      added.sections += 1;
    }
    for (const tplField of wanted as MemberTemplateField[]) {
      await createField(
        ctx,
        {
          sectionId,
          key: tplField.key,
          label: tplField.label,
          type: tplField.type,
          options: tplField.options ?? {},
          required: tplField.required ?? false,
          unique: tplField.unique ?? false,
          filterable: tplField.filterable ?? false,
          showInList: tplField.showInList ?? false,
          showOnCard: tplField.showOnCard ?? false,
          customerEditable: tplField.customerEditable ?? false,
          sensitive: tplField.sensitive ?? tplSection.sensitive ?? false,
          trackHistory: tplField.trackHistory ?? false,
        },
        tx,
      );
      fieldKeys.add(tplField.key);
      added.fields += 1;
    }
  }
  return { added };
}
