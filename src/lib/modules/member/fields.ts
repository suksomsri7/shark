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
//
// ── CRM v2 (ใบ C1.2a · พิมพ์เขียว 20-crm-v2 §5.1 §11.2 · มติ R-E1) — engine เดียวรับ `ctx.objectKey` ──
// 🔴 `FieldCtx.objectKey` (ไม่ส่ง = "customer") บอกว่าเป็นฟิลด์ของวัตถุไหน:
//      "customer"                 → ระบบ **MEMBER** · ค่าใน MemberFieldValue (ทางเดิมทุกบรรทัด — ผลต้องเหมือนเดิมทุกไบต์)
//      "contact"|"company"|"deal" → ระบบ **CRM** · ค่าใน CustomRecordValue (recordType CONTACT/COMPANY/DEAL)
//      key ของ CustomObject        → ระบบ **CRM** · ค่าใน CustomRecordValue (recordType CUSTOM)
//    ส่วน/ฟิลด์ของวัตถุที่ไม่ใช่ customer เป็นแถวของ MemberSection/MemberField ที่ systemId = ระบบ CRM
// 🔴 ทุกฟังก์ชัน resolve ระบบใหม่จาก tenant + ชนิด (MEMBER ↔ customer · CRM ↔ ที่เหลือ) — คู่ที่ไม่ตรงกัน = ปฏิเสธ
//    (ห้ามเชื่อ systemId/objectKey จากผู้เรียก: ฟิลด์ของระบบ CRM อื่นหรือร้านอื่นต้อง "มองไม่เห็น")
// 🔴 ค่าที่อ่อนไหวของวัตถุ CRM: ผู้อ่านส่ง `ctx.actor` · ตัดสินด้วย `evaluateSensitiveAccess` (privacy.ts) ตัวเดียว
//    ไม่มี actor = ตัดทิ้ง (fail closed) · เห็นจริง = มีแถว MemberAccessLog

import { Prisma } from "@prisma/client";
import type { Customer, CustomRecordType, MemberAddress, MemberConsentSource, MemberField, MemberFieldType, MemberLookupTarget, MemberSection, PrismaClient } from "@prisma/client";
import { z } from "zod";
// prisma ดิบผ่าน `./db` ซึ่ง re-export มาจาก "@/lib/core/db" (จุดเดียวของโมดูลนี้ที่ล้วง core — ดู member/db.ts)
import { prisma } from "./db";
import type { MemberActor } from "./access";
import type { SensitiveDecision, SensitiveTargetType } from "./privacy";
import { MemberInputError, MemberNotFoundError } from "./errors";
import { MEMBER_LIMITS, memberLimitError } from "./limits";
import { TEMPLATES, type MemberTemplateField, type MemberTemplateSection } from "./templates";

// ───────────────────────── ชนิดข้อมูลสาธารณะ ─────────────────────────

/** ผู้เรียกส่ง client ของ transaction ตัวเองเข้ามาได้ (ทุกฟังก์ชันในไฟล์นี้รับ `tx?`) */
type Client = PrismaClient | Prisma.TransactionClient;

export type FieldCtx = {
  tenantId: string;
  systemId: string;
  actorUserId: string | null;
  /** วัตถุของฟิลด์ — ไม่ส่ง = "customer" (ระบบสมาชิก) · "contact" | "company" | "deal" | key ของ CustomObject (ระบบ CRM) */
  objectKey?: string;
  /** ผู้อ่าน/ผู้เขียน — ใช้ตัดสินค่าอ่อนไหวของวัตถุ CRM (D8) · ไม่ส่ง = ค่าอ่อนไหวถูกตัดทิ้ง */
  actor?: MemberActor;
};

/** where-fragment ที่ `fieldFilterWhere` คืนให้วัตถุ CRM — ใช้ได้กับ CrmContact / CrmCompany / CrmDeal / CustomRecord */
export type CrmRecordWhere = Prisma.CrmContactWhereInput & Prisma.CrmCompanyWhereInput & Prisma.CrmDealWhereInput & Prisma.CustomRecordWhereInput;

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
  /** LOOKUP target CUSTOM (วัตถุ CRM เท่านั้น) — key ของ CustomObject ปลายทางในระบบ CRM เดียวกัน */
  objectKey?: string;
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
/** ปลายทาง LOOKUP ของฟิลด์วัตถุ CRM — ของเดิม 6 + ผู้ติดต่อ/บริษัท/ดีล/วัตถุกำหนดเอง (ฟิลด์สมาชิกยังเลือกได้แค่ 6 ตัวเดิม) */
const CRM_LOOKUP_TARGETS: readonly MemberLookupTarget[] = [...LOOKUP_TARGETS, "CONTACT", "COMPANY", "DEAL", "CUSTOM"];
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
const crmLookupOptionsSchema = z.object({
  target: z.enum(CRM_LOOKUP_TARGETS as readonly [MemberLookupTarget, ...MemberLookupTarget[]]),
  objectKey: z.string().trim().max(MEMBER_LIMITS.keyLength).optional(),
});

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** ตรวจ/ทำความสะอาด options ตามชนิด — ผิดรูป = throw ไทย (บอกว่าต้องมีอะไร ไม่ใช่ว่า "ข้อมูลไม่ถูกต้อง") */
export function normalizeFieldOptions(type: MemberFieldType, raw: unknown): MemberFieldOptions {
  return normalizeOptionsIn(type, raw, false);
}

/**
 * ตัวจริงของ `normalizeFieldOptions` · `crm` = ฟิลด์ของวัตถุ CRM (LOOKUP เลือกปลายทาง CRM ได้ + `objectKey` ของ CUSTOM)
 * การตรวจว่าวัตถุปลายทางมีจริง/ไม่วนตัวเอง ต้องยิง DB จึงอยู่ที่ `normalizeOptionsScoped`
 */
function normalizeOptionsIn(type: MemberFieldType, raw: unknown, crm: boolean): MemberFieldOptions {
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
  if (type === "LOOKUP" && crm) {
    const parsed = crmLookupOptionsSchema.safeParse(o);
    if (!parsed.success) {
      throw new MemberInputError(`ฟิลด์ชนิดเชื่อมข้อมูลต้องระบุปลายทาง (target) ว่าเชื่อมกับอะไร — เลือกได้ ${CRM_LOOKUP_TARGETS.join(" / ")}`);
    }
    if (parsed.data.target === "CUSTOM") {
      const objectKey = parsed.data.objectKey ?? "";
      if (!objectKey) throw new MemberInputError("ฟิลด์ที่เชื่อมกับวัตถุกำหนดเองต้องระบุว่าเชื่อมกับวัตถุไหน (objectKey) — เลือกวัตถุจากรายการ");
      return { target: "CUSTOM", objectKey };
    }
    return { target: parsed.data.target };
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

// ───────────────────────── วัตถุ (ctx.objectKey) → ระบบ + ที่เก็บค่า (C1.2a) ─────────────────────────

type CrmBuiltin = "contact" | "company" | "deal";
const CRM_BUILTIN_TYPES: Record<CrmBuiltin, CustomRecordType> = { contact: "CONTACT", company: "COMPANY", deal: "DEAL" };
const CRM_BUILTIN_PLACE: Record<CrmBuiltin, string> = {
  contact: "ข้อมูลผู้ติดต่อของระบบ CRM นี้",
  company: "ข้อมูลบริษัทของระบบ CRM นี้",
  deal: "ข้อมูลดีลของระบบ CRM นี้",
};

function isCrmBuiltin(key: string): key is CrmBuiltin {
  return key === "contact" || key === "company" || key === "deal";
}

/**
 * วัตถุที่ ctx ชี้อยู่ (resolve ใหม่ทุกครั้ง — ห้ามเชื่อคู่ systemId/objectKey จากผู้เรียก)
 * `place` = คำที่ใช้ในข้อความ error ("ระบบสมาชิกนี้" ของทางเดิม — ข้อความเดิมจึงเหมือนเดิมทุกตัวอักษร)
 */
type ObjectScope =
  | { kind: "customer"; objectKey: "customer"; place: string }
  | { kind: "crm"; objectKey: CrmBuiltin; recordType: CustomRecordType; place: string }
  | { kind: "custom"; objectKey: string; recordType: CustomRecordType; objectId: string; place: string };

type CrmScope = Exclude<ObjectScope, { kind: "customer" }>;

async function resolveScope(ctx: FieldCtx, db: Client): Promise<ObjectScope> {
  const raw = ctx.objectKey;
  const objectKey = raw === undefined || raw === null ? "customer" : String(raw).trim();
  if (objectKey === "customer") {
    // AUDIT-CLASS X1: ทางสมาชิกต้องเป็นระบบ MEMBER ของร้านนี้จริง — systemId ของระบบ CRM/ร้านอื่นที่ส่งมา
    //   (โดยตั้งใจหรือพลาด) ถูกปฏิเสธ ไม่ใช่ "อ่านแถว customer ที่หลงอยู่ในระบบนั้น"
    const sys = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "MEMBER" }, select: { id: true } });
    if (!sys) throw new MemberNotFoundError("ไม่พบระบบสมาชิกนี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
    return { kind: "customer", objectKey: "customer", place: "ระบบสมาชิกนี้" };
  }
  // AUDIT-CLASS X1: วัตถุที่ไม่ใช่ customer อยู่ใต้ระบบ CRM ของร้านนี้เท่านั้น (ระบบ MEMBER + "contact" = ปฏิเสธ)
  const sys = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } });
  if (!sys) throw new MemberNotFoundError("ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  if (isCrmBuiltin(objectKey)) {
    return { kind: "crm", objectKey, recordType: CRM_BUILTIN_TYPES[objectKey], place: CRM_BUILTIN_PLACE[objectKey] };
  }
  // K5: key อื่น = CustomObject ที่ยังใช้งานอยู่ของระบบ CRM นี้ (ของระบบอื่น/ร้านอื่น/ถูกเก็บถาวร = ไม่พบ)
  const obj = await db.customObject.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, key: objectKey, archivedAt: null },
    select: { id: true, label: true },
  });
  if (!obj) throw new MemberNotFoundError(`ไม่พบวัตถุ "${objectKey}" ในระบบ CRM นี้ (อาจถูกเก็บถาวรหรือลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่`);
  return { kind: "custom", objectKey, recordType: "CUSTOM", objectId: obj.id, place: `วัตถุ "${obj.label}" ของระบบ CRM นี้` };
}

/** เงื่อนไขของแถวนิยาม (ส่วน/ฟิลด์) ที่เป็นของวัตถุนี้ในระบบนี้ */
function defWhere(ctx: FieldCtx, scope: ObjectScope): { tenantId: string; systemId: string; objectKey: string } {
  return { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: scope.objectKey };
}

// ── ฟิลด์ระบบของวัตถุ CRM (§11.2 · contact 14 · company 12 · deal 12) ──
// 🔴 ตัวชี้ไปคอลัมน์จริงของ CrmContact / CrmCompany / CrmDeal (key = systemKey = ชื่อคอลัมน์) — ไม่มีสำเนาใน
//    CustomRecordValue เด็ดขาด (กติกาเดียวกับฟิลด์ระบบของสมาชิก) · ชนิดฟิลด์ต้องเข้ากับชนิดคอลัมน์
//    (SELECT บนคอลัมน์ enum ใช้ค่า enum ตรงตัว) · `notNull` = คอลัมน์ NOT NULL ⇒ ห้ามเขียน null แม้ร้านปิด "ต้องกรอก"
// 🔴 เลือกเฉพาะคอลัมน์ข้อมูลที่คนกรอก — ไม่รวมตัวเลขที่ระบบคำนวณเอง (score · openDealCount · paidSatang ·
//    wonValueSatang · stageId/kind · lastActivityAt …) เพราะ service ของ CRM เป็นเจ้าของการเปลี่ยนค่าพวกนั้น
//   contact (14): firstName · lastName · titleTh · phone · email · lineUserId · jobTitle · department · leadStatus ·
//                 sourceKind · sourceChannel · locale · marketingOptOut · note
//   company (12): name · legalName · taxId · branchCode · industry · size · website (http/https เท่านั้น) · phone ·
//                 email · employeeCount · foundedYear · note
//   deal    (12): title · contactId · companyId · ownerUserId · valueSatang · expectedCloseAt · forecastCategory ·
//                 probabilityOverride · nextStep · currency · sourceKind · lostReason
type CrmSystemSpec = {
  key: string;
  label: string;
  type: MemberFieldType;
  options?: MemberFieldOptions;
  required?: boolean;
  notNull?: boolean;
  filterable?: boolean;
  showInList?: boolean;
  showOnCard?: boolean;
};

const choicesOf = (pairs: [string, string][]): MemberFieldOptions => ({ choices: pairs.map(([value, label]) => ({ value, label })) });
const SOURCE_KIND_OPTIONS = choicesOf([
  ["WALK_IN", "เดินเข้าร้าน"], ["POS", "ขายหน้าร้าน"], ["BOOKING", "ระบบจอง"], ["LINE_OA", "LINE OA"], ["LIFF", "LINE (LIFF)"],
  ["WEB_FORM", "ฟอร์มบนเว็บ"], ["CHAT", "แชท"], ["REFERRAL", "เพื่อนแนะนำ"], ["IMPORT", "นำเข้าไฟล์"], ["CRM", "CRM"],
  ["CAMPAIGN", "แคมเปญ"], ["API", "ระบบภายนอก (API)"], ["MARKETPLACE", "มาร์เก็ตเพลส"], ["APP", "แอป"], ["OTHER", "อื่น ๆ"],
]);

const CRM_SYSTEM_TEMPLATE: Record<CrmBuiltin, { section: { key: string; label: string; description: string }; fields: CrmSystemSpec[] }> = {
  contact: {
    section: { key: "system", label: "ข้อมูลผู้ติดต่อ", description: "ชื่อ ช่องทางติดต่อ ตำแหน่งงาน และที่มา" },
    fields: [
      { key: "firstName", label: "ชื่อจริง", type: "TEXT", showInList: true, showOnCard: true },
      { key: "lastName", label: "นามสกุล", type: "TEXT", showInList: true },
      { key: "titleTh", label: "คำนำหน้า", type: "TEXT", options: { maxLength: 40 } },
      { key: "phone", label: "เบอร์โทร", type: "TEXT", showInList: true, showOnCard: true },
      { key: "email", label: "อีเมล", type: "TEXT", showInList: true },
      { key: "lineUserId", label: "LINE user id", type: "TEXT" },
      { key: "jobTitle", label: "ตำแหน่งงาน", type: "TEXT", showInList: true },
      { key: "department", label: "แผนก", type: "TEXT" },
      {
        key: "leadStatus", label: "สถานะ lead", type: "SELECT", required: true, notNull: true, filterable: true, showInList: true,
        options: choicesOf([["NEW", "ใหม่"], ["CONTACTED", "ติดต่อแล้ว"], ["QUALIFIED", "มีโอกาส"], ["UNQUALIFIED", "ไม่ตรงกลุ่ม"], ["NURTURE", "รอบ่มเพาะ"]]),
      },
      { key: "sourceKind", label: "ที่มา", type: "SELECT", filterable: true, options: SOURCE_KIND_OPTIONS },
      { key: "sourceChannel", label: "ช่องทางที่มา", type: "TEXT" },
      { key: "locale", label: "ภาษาที่ใช้ติดต่อ", type: "TEXT", options: { maxLength: 10 } },
      { key: "marketingOptOut", label: "ไม่รับข่าวสารการตลาด", type: "BOOLEAN", required: true, notNull: true, filterable: true },
      { key: "note", label: "โน้ต", type: "LONG_TEXT" },
    ],
  },
  company: {
    section: { key: "system", label: "ข้อมูลบริษัท", description: "ชื่อ เลขภาษี ช่องทางติดต่อ และขนาดกิจการ" },
    fields: [
      { key: "name", label: "ชื่อบริษัท", type: "TEXT", required: true, notNull: true, showInList: true, showOnCard: true },
      { key: "legalName", label: "ชื่อตามทะเบียน", type: "TEXT" },
      { key: "taxId", label: "เลขประจำตัวผู้เสียภาษี", type: "TEXT", showInList: true, options: { maxLength: 20 } },
      { key: "branchCode", label: "รหัสสาขา", type: "TEXT", options: { maxLength: 10 } },
      { key: "industry", label: "อุตสาหกรรม", type: "TEXT", filterable: true },
      {
        key: "size", label: "ขนาดกิจการ", type: "SELECT", filterable: true,
        options: choicesOf([["MICRO", "รายย่อย"], ["SMALL", "เล็ก"], ["MEDIUM", "กลาง"], ["LARGE", "ใหญ่"], ["ENTERPRISE", "องค์กรใหญ่"]]),
      },
      { key: "website", label: "เว็บไซต์", type: "TEXT" },
      { key: "phone", label: "เบอร์โทร", type: "TEXT", showInList: true },
      { key: "email", label: "อีเมล", type: "TEXT" },
      { key: "employeeCount", label: "จำนวนพนักงาน", type: "NUMBER", options: { decimals: 0, min: 0, max: 10_000_000, unit: "คน" } },
      { key: "foundedYear", label: "ปีที่ก่อตั้ง (ค.ศ.)", type: "NUMBER", options: { decimals: 0, min: 1800, max: 2600 } },
      { key: "note", label: "โน้ต", type: "LONG_TEXT" },
    ],
  },
  deal: {
    section: { key: "system", label: "ข้อมูลดีล", description: "ชื่อดีล มูลค่า ผู้ดูแล และกำหนดปิด" },
    fields: [
      { key: "title", label: "ชื่อดีล", type: "TEXT", required: true, notNull: true, showInList: true, showOnCard: true },
      { key: "contactId", label: "ผู้ติดต่อหลัก", type: "LOOKUP", required: true, notNull: true, options: { target: "CONTACT" } },
      { key: "companyId", label: "บริษัท", type: "LOOKUP", showInList: true, options: { target: "COMPANY" } },
      { key: "ownerUserId", label: "ผู้ดูแล", type: "LOOKUP", filterable: true, showInList: true, options: { target: "USER" } },
      { key: "valueSatang", label: "มูลค่า (สตางค์)", type: "MONEY", required: true, notNull: true, showInList: true, options: { decimals: 0, min: 0, max: 2_147_483_647, unit: "สตางค์" } },
      { key: "expectedCloseAt", label: "วันที่คาดว่าจะปิด", type: "DATE", filterable: true, showInList: true },
      {
        key: "forecastCategory", label: "หมวดพยากรณ์", type: "SELECT", required: true, notNull: true, filterable: true,
        options: choicesOf([["PIPELINE", "อยู่ในไปป์ไลน์"], ["BEST_CASE", "มีลุ้น"], ["COMMIT", "มั่นใจ"], ["OMITTED", "ไม่นับ"]]),
      },
      { key: "probabilityOverride", label: "โอกาสปิด (%)", type: "NUMBER", options: { decimals: 0, min: 0, max: 100, unit: "%" } },
      { key: "nextStep", label: "ขั้นถัดไป", type: "TEXT" },
      { key: "currency", label: "สกุลเงิน", type: "TEXT", required: true, notNull: true, options: { pattern: "^[A-Z]{3}$", maxLength: 3 } },
      { key: "sourceKind", label: "ที่มา", type: "SELECT", filterable: true, options: SOURCE_KIND_OPTIONS },
      { key: "lostReason", label: "หมายเหตุเหตุผลที่แพ้", type: "LONG_TEXT" },
    ],
  },
};

/**
 * คอลัมน์ของ CrmContact / CrmCompany / CrmDeal ที่ **service ของ CRM เป็นเจ้าของการเขียน** (C1.3–C1.5) — engine ฟิลด์
 * อ่าน/กรอง/แสดงในเลย์เอาต์ได้ แต่ `setFieldValues` ปฏิเสธ (fail closed) เพราะแต่ละตัวมีอย่างน้อยหนึ่งข้อ:
 * กติกาธุรกิจ (lifecycle/leadStatus/stage/forecast) · ผูก Party หรือชื่อแสดง (`name` สร้างจาก first/last · phone/email/taxId
 * → party.updateContactInfo) · ความยินยอม/PDPA (optOut · bounce · lineUserId) · หน้าที่ต้องมี audit/event (มอบหมาย ·
 * ย้ายบริษัท/ผู้ติดต่อ · reassign) · ตัวเลข/แคชที่คำนวณ (valueSatang จาก lines · score · openDealCount · paid/won)
 * คอลัมน์ที่ไม่มีฟิลด์ระบบวันนี้ก็อยู่ในรายการ เพื่อกันการเพิ่ม spec ทีหลังแล้วลืมกั้น
 * 🔴 export ให้ service ของ CRM รู้ว่าคอลัมน์ไหน "ของตัวเอง" (เขียนผ่านหน้าจอ/ฟังก์ชันเฉพาะ ไม่ใช่ผ่าน engine ฟิลด์)
 */
export const GOVERNED_CRM_SYSTEM_KEYS: Readonly<Record<CrmBuiltin, ReadonlySet<string>>> = Object.freeze({
  contact: new Set<string>([
    "name", "firstName", "lastName", "phone", "email", "previousEmails", "company", "companyId", "lineUserId",
    "lifecycleStage", "leadStatus", "ownerUserId", "teamId", "assignedAt", "assignedBy",
    "emailOptOut", "emailBouncedAt", "marketingOptOut",
    "sourceKind", "sourceDetail", "attributionId", "source",
    "score", "scoreUpdatedAt", "scoreBand", "lastActivityAt", "nextActivityAt", "convertedAt", "portalAccessAt",
    "memberCustomerId", "partyId", "mergedIntoId", "archivedAt", "tags",
  ]),
  company: new Set<string>([
    "name", "taxId", "branchCode", "partyId", "phone", "email", "emailDomain", "lineOaId",
    "ownerUserId", "teamId", "parentCompanyId", "accountContactId", "memberCustomerId", "lifecycleStage",
    "score", "lastActivityAt", "openDealCount", "wonValueSatang", "outstandingSatang", "mergedIntoId", "archivedAt", "logoFileId", "tags",
  ]),
  deal: new Set<string>([
    "valueSatang", "discountBp", "currency", "ownerUserId", "teamId", "collaboratorUserIds", "companyId", "contactId",
    "pipelineId", "stageId", "kind", "stageEnteredAt", "stalledAt", "closedAt", "reopenedCount", "forecastCategory",
    "lostReasonId", "wonValueSatang", "paidSatang", "quotationDocId", "invoiceDocId", "kanbanCardId",
    "pendingLines", "pendingApprovalRequestId", "sourceKind", "sourceDetail", "lastActivityAt", "nextActivityAt", "tags",
  ]),
});

const CRM_OBJECT_NOUN: Record<CrmBuiltin, string> = { contact: "ผู้ติดต่อ", company: "บริษัท", deal: "ดีล" };

/** spec ของฟิลด์ระบบ CRM ตัวนี้ (null = systemKey ไม่รู้จัก ⇒ ไม่มีที่เก็บ — อ่านได้ null · เขียน/กรองไม่ได้) */
function crmSystemSpecOf(scope: CrmScope, field: MemberField): CrmSystemSpec | null {
  if (scope.kind !== "crm" || !field.isSystem) return null;
  const key = field.systemKey ?? field.key;
  return CRM_SYSTEM_TEMPLATE[scope.objectKey].fields.find((f) => f.key === key) ?? null;
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

/** systemKey ของฟิลด์ระบบที่เป็นลิงก์เว็บ (ปัจจุบันมีแค่ `website` ของบริษัท CRM — K4: ไม่มีชนิดฟิลด์ URL แยก) */
const URL_SYSTEM_KEYS = new Set<string>(["website"]);

function assertHttpUrl(label: string, text: string): void {
  let ok = false;
  try {
    const url = new URL(text);
    ok = (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname && !/\s/.test(text);
  } catch {
    ok = false;
  }
  if (!ok) throw new Error(`ค่าของฟิลด์ "${label}" ต้องเป็นลิงก์เว็บที่ขึ้นต้นด้วย http:// หรือ https:// เช่น https://example.co.th`);
}

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
      // AUDIT-CLASS X6: ช่อง URL (ฟิลด์ระบบ `website` ของบริษัท CRM) รับเฉพาะ http/https — กัน javascript:/data:/file:
      //   ที่หน้าจอเอาไปทำเป็นลิงก์ให้คนกด (ฟิลด์สมาชิกไม่มี systemKey นี้ ⇒ ทางเดิมไม่เปลี่ยน)
      if (field.isSystem && field.systemKey && URL_SYSTEM_KEYS.has(field.systemKey)) assertHttpUrl(label, text);
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
export function checkFieldValue(
  field: Pick<FieldDef, "label" | "type" | "options" | "required"> & Partial<Pick<FieldDef, "isSystem" | "systemKey">>,
  raw: unknown,
): MemberFieldValueInput {
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
  return columnToValue(field, raw);
}

/** ค่าดิบจากคอลัมน์จริง (Customer · MemberAddress · CrmContact/CrmCompany/CrmDeal) → ค่ามาตรฐานของฟิลด์ */
function columnToValue(field: MemberField, raw: unknown): MemberFieldValueInput {
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

async function loadSections(ctx: FieldCtx, scope: ObjectScope, db: Client): Promise<MemberSection[]> {
  const rows = await db.memberSection.findMany({
    where: defWhere(ctx, scope),
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows;
}

async function loadFields(ctx: FieldCtx, scope: ObjectScope, db: Client): Promise<MemberField[]> {
  const rows = await db.memberField.findMany({
    where: defWhere(ctx, scope),
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows;
}

// AUDIT-CLASS X1: ทุกการหา "ส่วน/ฟิลด์ตาม id" กรอง tenant + ระบบ + วัตถุ ⇒ id ของวัตถุอื่น/ระบบ CRM อื่น/ร้านอื่น = ไม่พบ
async function requireSection(ctx: FieldCtx, scope: ObjectScope, db: Client, id: string): Promise<MemberSection> {
  const row = await db.memberSection.findFirst({ where: { id, ...defWhere(ctx, scope) } });
  if (!row) throw new Error(`ไม่พบส่วนนี้ใน${scope.place} (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่`);
  return row;
}

async function requireField(ctx: FieldCtx, scope: ObjectScope, db: Client, id: string): Promise<MemberField> {
  const row = await db.memberField.findFirst({ where: { id, ...defWhere(ctx, scope) } });
  if (!row) throw new Error(`ไม่พบฟิลด์นี้ใน${scope.place} (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่`);
  return row;
}

// เพดานนับ "ต่อวัตถุ" (K6 · §11.2 ฟิลด์ 60/วัตถุ · กรองได้ ≤ 20/วัตถุ · ส่วน 12/วัตถุ) — ระบบสมาชิกมีวัตถุเดียว (customer)
// จึงเท่ากับเพดานต่อระบบแบบเดิมทุกประการ
async function assertSectionCapacity(ctx: FieldCtx, scope: ObjectScope, db: Client, adding: number): Promise<void> {
  const n = await db.memberSection.count({ where: defWhere(ctx, scope) });
  if (n + adding > MEMBER_LIMITS.sections) {
    throw memberLimitError(`${scope.place}มีส่วนครบ ${MEMBER_LIMITS.sections} ส่วนแล้ว — รวมฟิลด์เข้าส่วนเดิมหรือลบส่วนที่ไม่ได้ใช้ก่อน`);
  }
}

async function assertFieldCapacity(ctx: FieldCtx, scope: ObjectScope, db: Client, adding: number): Promise<void> {
  const n = await db.memberField.count({ where: { ...defWhere(ctx, scope), archivedAt: null } });
  if (n + adding > MEMBER_LIMITS.fields) {
    throw memberLimitError(`${scope.place}มีฟิลด์ครบ ${MEMBER_LIMITS.fields} ฟิลด์แล้ว — เก็บฟิลด์ที่ไม่ได้ใช้เข้าคลังก่อนจึงเพิ่มใหม่ได้`);
  }
}

/**
 * เพดาน "ฟิลด์ที่กรองได้" บังคับตอน **เปิดสวิตช์กรอง** (updateField)
 * 🔴 ตั้งใจไม่บังคับตอน createField/applyTemplate: ชุดฟิลด์มาตรฐาน (ฟิลด์ระบบ 8 + เทมเพลตกิจการ)
 *    ถูกสร้างมาพร้อมสวิตช์กรองอยู่แล้ว การปฏิเสธตั้งแต่ตอนสร้าง = ร้านเปิดเทมเพลตไม่ได้เลย
 *    (สัญญาข้อสอบ M1.2-S1.4 / S5.1 / S6.2 ก็ยืนบนเส้นแบ่งนี้)
 */
async function assertFilterableCapacity(ctx: FieldCtx, scope: ObjectScope, db: Client): Promise<void> {
  const n = await db.memberField.count({ where: { ...defWhere(ctx, scope), filterable: true, archivedAt: null } });
  if (n + 1 > MEMBER_LIMITS.filterable) {
    throw memberLimitError(`เปิด "ใช้กรองได้" พร้อมกันได้สูงสุด ${MEMBER_LIMITS.filterable} ฟิลด์ (ข้อจำกัดของ index) — ปิดฟิลด์ที่ไม่ได้ใช้กรองก่อน`);
  }
}

/**
 * options ของฟิลด์ตามวัตถุ: ทางสมาชิก = `normalizeFieldOptions` ตัวเดิมทุกประการ ·
 * วัตถุ CRM = LOOKUP เลือกปลายทาง CRM ได้ และ target CUSTOM ต้องชี้ CustomObject ที่ยังใช้งานของ **ระบบ CRM เดียวกัน**
 * ที่ไม่ใช่ตัวเอง (§11.2 "LOOKUP ไปวัตถุอื่นได้ ห้ามวนตัวเอง")
 */
async function normalizeOptionsScoped(
  ctx: FieldCtx,
  scope: ObjectScope,
  db: Client,
  type: MemberFieldType,
  raw: unknown,
): Promise<MemberFieldOptions> {
  if (scope.kind === "customer") return normalizeFieldOptions(type, raw);
  const options = normalizeOptionsIn(type, raw, true);
  if (type === "LOOKUP" && options.target === "CUSTOM") {
    const target = options.objectKey ?? "";
    if (target === scope.objectKey) {
      throw new MemberInputError(`ฟิลด์เชื่อมข้อมูลของ${scope.place}ชี้กลับมาที่วัตถุเดียวกันไม่ได้ — เลือกวัตถุอื่นเป็นปลายทาง`);
    }
    if (target === "customer" || isCrmBuiltin(target)) {
      throw new MemberInputError(`"${target}" ไม่ใช่วัตถุกำหนดเอง — ถ้าจะเชื่อมกับสมาชิก/ผู้ติดต่อ/บริษัท/ดีล ให้เลือกปลายทางชนิดนั้นโดยตรง`);
    }
    const obj = await db.customObject.findFirst({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, key: target, archivedAt: null },
      select: { id: true },
    });
    if (!obj) throw new MemberInputError(`ไม่พบวัตถุ "${target}" ในระบบ CRM นี้ — เลือกวัตถุปลายทางจากรายการที่มีอยู่`);
  }
  return options;
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
  const scope = await resolveScope(ctx, db);
  const key = normalizeKey(input.key, "ส่วน");
  const label = normalizeLabel(input.label, "ส่วน");
  const columns = input.columns === undefined ? 2 : Math.min(4, Math.max(1, Math.floor(input.columns)));

  await assertSectionCapacity(ctx, scope, db, 1);
  // key ห้ามซ้ำ "ต่อวัตถุ" (unique [systemId, objectKey, key]) — ส่วน `sales` ของผู้ติดต่อกับของบริษัทอยู่ร่วมกันได้
  const dup = await db.memberSection.findFirst({ where: { systemId: ctx.systemId, objectKey: scope.objectKey, key }, select: { id: true } });
  if (dup) throw new Error(`มีส่วนที่ใช้ชื่ออ้างอิง "${key}" อยู่แล้วใน${scope.place} — ตั้งชื่ออ้างอิงอื่น`);

  const last = await db.memberSection.findFirst({
    where: defWhere(ctx, scope),
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const row = await db.memberSection.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      objectKey: scope.objectKey,
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
  const scope = await resolveScope(ctx, db);
  const section = await requireSection(ctx, scope, db, id);
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
  const scope = await resolveScope(ctx, db);
  const all = await loadSections(ctx, scope, db);
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
  const scope = await resolveScope(ctx, db);
  const section = await requireSection(ctx, scope, db, id);
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
  const scope = await resolveScope(ctx, db);
  // AUDIT-CLASS X1: ส่วนต้องเป็นของวัตถุ/ระบบเดียวกัน — ฟิลด์บริษัทไปนั่งในส่วนของผู้ติดต่อไม่ได้
  const section = await requireSection(ctx, scope, db, input.sectionId);
  const key = normalizeKey(input.key, "ฟิลด์");
  const label = normalizeLabel(input.label, "ฟิลด์");
  const type = normalizeType(input.type);
  const options = await normalizeOptionsScoped(ctx, scope, db, type, input.options);

  await assertFieldCapacity(ctx, scope, db, 1);
  const dup = await db.memberField.findFirst({ where: { systemId: ctx.systemId, objectKey: scope.objectKey, key }, select: { id: true, label: true } });
  if (dup) throw new Error(`มีฟิลด์ที่ใช้ชื่ออ้างอิง "${key}" อยู่แล้วใน${scope.place} — ตั้งชื่ออ้างอิงอื่น`);

  const last = await db.memberField.findFirst({
    where: { tenantId: ctx.tenantId, sectionId: section.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const row = await db.memberField.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      objectKey: scope.objectKey,
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
  const scope = await resolveScope(ctx, db);
  const field = await requireField(ctx, scope, db, id);

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
    const section = await requireSection(ctx, scope, db, patch.sectionId);
    data.sectionId = section.id;
  }
  if (patch.label !== undefined) data.label = normalizeLabel(patch.label, "ฟิลด์");
  if (patch.description !== undefined) data.description = normalizeDescription(patch.description);
  if (patch.key !== undefined) {
    const key = normalizeKey(patch.key, "ฟิลด์");
    if (key !== field.key) {
      const dup = await db.memberField.findFirst({ where: { systemId: ctx.systemId, objectKey: scope.objectKey, key, id: { not: field.id } }, select: { id: true } });
      if (dup) throw new Error(`มีฟิลด์ที่ใช้ชื่ออ้างอิง "${key}" อยู่แล้วใน${scope.place} — ตั้งชื่ออ้างอิงอื่น`);
      data.key = key;
    }
  }
  if (patch.type !== undefined) {
    const type = normalizeType(patch.type);
    if (type !== field.type) {
      if (scope.kind === "customer") {
        const used = await db.memberFieldValue.count({ where: { tenantId: ctx.tenantId, fieldId: field.id } });
        if (used > 0) throw new Error(`ฟิลด์ "${field.label}" มีข้อมูลของสมาชิกอยู่แล้ว ${used} คน จึงเปลี่ยนชนิดฟิลด์ไม่ได้ — สร้างฟิลด์ใหม่แล้วเก็บฟิลด์เดิมเข้าคลังแทน`);
      } else {
        const used = await db.customRecordValue.count({ where: { tenantId: ctx.tenantId, fieldId: field.id } });
        if (used > 0) throw new MemberInputError(`ฟิลด์ "${field.label}" มีข้อมูลบันทึกไว้แล้ว ${used} รายการ จึงเปลี่ยนชนิดฟิลด์ไม่ได้ — สร้างฟิลด์ใหม่แล้วเก็บฟิลด์เดิมเข้าคลังแทน`);
      }
      data.type = type;
      data.options = (await normalizeOptionsScoped(ctx, scope, db, type, patch.options ?? {})) as Prisma.InputJsonValue;
    }
  }
  if (patch.options !== undefined && data.options === undefined) {
    const type = (data.type as MemberFieldType | undefined) ?? field.type;
    data.options = (await normalizeOptionsScoped(ctx, scope, db, type, patch.options)) as Prisma.InputJsonValue;
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
    if (patch.unique === true) await assertNoDuplicateValues(ctx, scope, db, field);
    data.unique = patch.unique;
  }
  if (patch.filterable !== undefined && patch.filterable !== field.filterable) {
    if (patch.filterable === true) await assertFilterableCapacity(ctx, scope, db);
    data.filterable = patch.filterable;
  }

  if (Object.keys(data).length === 0) return fieldDto(field);
  const row = await db.memberField.update({ where: { id: field.id }, data });
  return fieldDto(row);
}

/** เปิด "ห้ามซ้ำ" ได้ต่อเมื่อข้อมูลเดิมยังไม่มีค่าซ้ำ (§11.2) */
async function assertNoDuplicateValues(ctx: FieldCtx, scope: ObjectScope, db: Client, field: MemberField): Promise<void> {
  if (field.isSystem) return;
  const rows: ValueRow[] =
    scope.kind === "customer"
      ? await db.memberFieldValue.findMany({ where: { tenantId: ctx.tenantId, fieldId: field.id } })
      : await db.customRecordValue.findMany({ where: { tenantId: ctx.tenantId, fieldId: field.id, recordType: scope.recordType } });
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
  const scope = await resolveScope(ctx, db);
  const field = await requireField(ctx, scope, db, id);
  if (field.isSystem) throw new Error(`ฟิลด์ "${field.label}" เป็นฟิลด์มาตรฐานของระบบ จึงเก็บเข้าคลังไม่ได้ — ปิดสวิตช์ "แสดงในรายการ" แทนได้`);
  if (field.archivedAt) return fieldDto(field);
  const row = await db.memberField.update({ where: { id: field.id }, data: { archivedAt: new Date() } });
  return fieldDto(row);
}

export async function restoreField(ctx: FieldCtx, id: string, tx?: Client): Promise<FieldDef> {
  const db = clientOf(tx);
  const scope = await resolveScope(ctx, db);
  const field = await requireField(ctx, scope, db, id);
  if (!field.archivedAt) return fieldDto(field);
  await assertFieldCapacity(ctx, scope, db, 1);
  const row = await db.memberField.update({ where: { id: field.id }, data: { archivedAt: null } });
  return fieldDto(row);
}

/** ลากเรียงฟิลด์ในส่วนเดียว — ฟิลด์ที่ไม่ส่งมาต่อท้ายตามลำดับเดิม */
export async function reorderFields(ctx: FieldCtx, sectionId: string, ids: string[], tx?: Client): Promise<{ ok: true }> {
  const db = clientOf(tx);
  const scope = await resolveScope(ctx, db);
  const section = await requireSection(ctx, scope, db, sectionId);
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
  const scope = await resolveScope(ctx, db);
  const [sections, fields] = await Promise.all([loadSections(ctx, scope, db), loadFields(ctx, scope, db)]);
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
 * `ctx.objectKey` ≠ customer ⇒ `customerIds` คือ id ของผู้ติดต่อ/บริษัท/ดีล/รายการวัตถุ (ดู `getRecordValues`)
 */
export async function getFieldValues(
  ctx: FieldCtx,
  customerIds: string[],
  tx?: Client,
): Promise<Record<string, Record<string, MemberFieldValueInput>>> {
  const db = clientOf(tx);
  const scope = await resolveScope(ctx, db);
  if (scope.kind !== "customer") return getRecordValues(ctx, scope, customerIds, db);
  const out: Record<string, Record<string, MemberFieldValueInput>> = {};
  const ids = [...new Set(customerIds.filter((id) => typeof id === "string" && id))];
  for (const id of ids) out[id] = {};
  if (ids.length === 0) return out;

  const fields = await db.memberField.findMany({ where: { ...defWhere(ctx, scope), archivedAt: null } });
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
  // CRM v2 (crm_v2_a · C1.1) — ป้ายเท่านั้น · ใบ C1.2a เป็นเจ้าของการตรวจค่า LOOKUP ของปลายทางเหล่านี้
  CONTACT: "ผู้ติดต่อ",
  COMPANY: "บริษัท",
  DEAL: "ดีล",
  CUSTOM: "รายการ",
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
  const scope = await resolveScope(ctx, db);
  if (scope.kind !== "customer") return setRecordValues(ctx, scope, customerId, values, opts, db, tx);
  const via = normalizeVia(opts?.via);
  const byUserId = opts?.byUserId ?? ctx.actorUserId ?? null;
  const keys = Object.keys(values ?? {});
  if (keys.length === 0) return { changed: [] };

  const customer = (await db.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
  })) as CustomerRow | null;
  if (!customer) throw new Error("ไม่พบสมาชิกคนนี้ในระบบสมาชิกนี้ — ตรวจว่าเปิดจากร้าน/ระบบเดียวกันหรือไม่");

  const fields = await db.memberField.findMany({ where: { ...defWhere(ctx, scope), key: { in: keys } } });
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
  ctx: FieldCtx & { objectKey?: "customer" },
  filters: Record<string, string>,
  tx?: Client,
): Promise<Prisma.CustomerWhereInput>;
export async function fieldFilterWhere(ctx: FieldCtx & { objectKey: string }, filters: Record<string, string>, tx?: Client): Promise<CrmRecordWhere>;
/** ผู้เรียกเดิมของโมดูลสมาชิกที่ถือ `FieldCtx` (objectKey ไม่ระบุ = customer) — ชนิดผลลัพธ์เดิม */
export async function fieldFilterWhere(ctx: FieldCtx, filters: Record<string, string>, tx?: Client): Promise<Prisma.CustomerWhereInput>;
export async function fieldFilterWhere(
  ctx: FieldCtx,
  filters: Record<string, string>,
  tx?: Client,
): Promise<Prisma.CustomerWhereInput | CrmRecordWhere> {
  const db = clientOf(tx);
  const scope = await resolveScope(ctx, db);
  if (scope.kind !== "customer") return recordFilterWhere(ctx, scope, filters, db);
  const keys = Object.keys(filters ?? {});
  if (keys.length === 0) return {};
  const fields = await db.memberField.findMany({ where: { ...defWhere(ctx, scope), key: { in: keys } } });
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
): Promise<{ added: { sections: number; fields: number }; created: { sectionIds: string[]; fieldIds: string[] } }> {
  const db = clientOf(tx);
  const scope = await resolveScope(ctx, db);
  if (scope.kind !== "customer") return applySystemTemplate(ctx, scope, templateKey, opts, db);
  const template = TEMPLATES[templateKey];
  if (!template) {
    throw new Error(`ไม่รู้จักเทมเพลตกิจการ "${templateKey}" — เลือกได้ ${Object.keys(TEMPLATES).join(" / ")}`);
  }
  const only = opts.onlyFieldKeys ? new Set(opts.onlyFieldKeys) : null;

  const [sections, fields] = await Promise.all([loadSections(ctx, scope, db), loadFields(ctx, scope, db)]);
  const sectionByKey = new Map(sections.map((s) => [s.key, s.id]));
  const fieldKeys = new Set(fields.map((f) => f.key));

  const added = { sections: 0, fields: 0 };
  // 🔴 M3.9 — เก็บ id ของส่วน/ฟิลด์ที่ "สร้างจริง" รอบนี้ ให้ templates-service.ts ประกอบเป็น `created` รวมกับ
  //    tiers/stamps/journeys (ผู้เรียกเดิมที่อ่านแค่ `.added` ไม่ต้องแก้อะไร — เพิ่มคีย์ ไม่ทับของเดิม)
  const created = { sectionIds: [] as string[], fieldIds: [] as string[] };
  for (const tplSection of template.sections as MemberTemplateSection[]) {
    const wanted = tplSection.fields.filter((f) => (only ? only.has(f.key) : true) && !fieldKeys.has(f.key));
    let sectionId = sectionByKey.get(tplSection.key);
    if (!sectionId) {
      if (wanted.length === 0) continue; // ไม่มีอะไรจะใส่ในส่วนนั้น = ไม่ต้องสร้างส่วนเปล่า
      const createdSection = await createSection(
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
      sectionId = createdSection.id;
      sectionByKey.set(tplSection.key, createdSection.id);
      added.sections += 1;
      created.sectionIds.push(createdSection.id);
    }
    for (const tplField of wanted as MemberTemplateField[]) {
      const createdField = await createField(
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
      created.fieldIds.push(createdField.id);
    }
  }
  return { added, created };
}

// ═════════════════════════ วัตถุ CRM (C1.2a) — ค่า · ตัวกรอง · ฟิลด์ระบบ ═════════════════════════
// ทุกฟังก์ชันด้านล่างรับ `scope` ที่ resolve แล้ว (ระบบ CRM ของร้านนี้ + วัตถุที่มีจริง) — เรียกจากฟังก์ชันสาธารณะด้านบนเท่านั้น

type RecordRow = Record<string, unknown> & { id: string };

/** แถวของผู้ติดต่อ/บริษัท/ดีล/รายการวัตถุ ที่เป็นของ "ระบบ CRM นี้ + วัตถุนี้" จริง — id อื่นหายไปเงียบ ๆ */
async function loadRecordRows(ctx: FieldCtx, scope: CrmScope, db: Client, ids: string[]): Promise<RecordRow[]> {
  if (ids.length === 0) return [];
  // AUDIT-CLASS X1: tenant + ระบบ CRM (+ วัตถุ) — id ของระบบ CRM อื่น/ร้านอื่น/วัตถุอื่น ไม่มีวันผ่าน
  const where = { id: { in: ids }, tenantId: ctx.tenantId, systemId: ctx.systemId };
  if (scope.kind === "custom") {
    return (await db.customRecord.findMany({ where: { ...where, objectId: scope.objectId } })) as unknown as RecordRow[];
  }
  switch (scope.objectKey) {
    case "contact":
      return (await db.crmContact.findMany({ where })) as unknown as RecordRow[];
    case "company":
      return (await db.crmCompany.findMany({ where })) as unknown as RecordRow[];
    case "deal":
    default:
      return (await db.crmDeal.findMany({ where })) as unknown as RecordRow[];
  }
}

async function requireRecord(ctx: FieldCtx, scope: CrmScope, db: Client, id: string): Promise<RecordRow> {
  const row = typeof id === "string" && id ? (await loadRecordRows(ctx, scope, db, [id]))[0] : undefined;
  if (!row) throw new MemberNotFoundError(`ไม่พบรายการนี้ใน${scope.place} — ตรวจว่าเปิดจากร้าน/ระบบเดียวกันหรือไม่`);
  return row;
}

/** เขียนคอลัมน์จริงของผู้ติดต่อ/บริษัท/ดีล (ฟิลด์ระบบ = ตัวชี้ · ไม่มีสำเนาใน CustomRecordValue) */
async function updateRecordColumns(t: Client, scope: CrmScope, id: string, data: Record<string, unknown>): Promise<void> {
  if (scope.kind !== "crm") return;
  switch (scope.objectKey) {
    case "contact":
      await t.crmContact.update({ where: { id }, data: data as Prisma.CrmContactUncheckedUpdateInput });
      return;
    case "company":
      await t.crmCompany.update({ where: { id }, data: data as Prisma.CrmCompanyUncheckedUpdateInput });
      return;
    case "deal":
    default:
      await t.crmDeal.update({ where: { id }, data: data as Prisma.CrmDealUncheckedUpdateInput });
  }
}

/**
 * ปลายทาง LOOKUP ของฟิลด์วัตถุ CRM "มีจริงในร้าน/ระบบนี้ไหม"
 * CONTACT/COMPANY/DEAL/CUSTOM = ตาราง CRM ของ **ระบบ CRM เดียวกัน** · CUSTOM ต้องเป็นรายการของวัตถุใน `options.objectKey`
 * CUSTOMER = สมาชิกของร้านนี้ (ระบบสมาชิกไหนก็ได้ — ฟิลด์ CRM ไม่ได้อยู่ใต้ระบบสมาชิก) · ที่เหลือใช้ตัวเดิม
 */
async function recordLookupExists(ctx: FieldCtx, db: Client, field: MemberField, id: string): Promise<boolean> {
  const options = optionsOf(field);
  const target = options.target ?? "CUSTOMER";
  const base = { id, tenantId: ctx.tenantId };
  switch (target) {
    case "CONTACT":
      return (await db.crmContact.count({ where: { ...base, systemId: ctx.systemId } })) > 0;
    case "COMPANY":
      return (await db.crmCompany.count({ where: { ...base, systemId: ctx.systemId } })) > 0;
    case "DEAL":
      return (await db.crmDeal.count({ where: { ...base, systemId: ctx.systemId } })) > 0;
    case "CUSTOM":
      return (await db.customRecord.count({ where: { ...base, systemId: ctx.systemId, object: { key: options.objectKey ?? "", archivedAt: null } } })) > 0;
    case "CUSTOMER":
      return (await db.customer.count({ where: base })) > 0;
    default:
      return lookupExists(ctx, db, target, id);
  }
}

/** เงื่อนไข "ค่าเท่ากัน" บนคอลัมน์ค่าตามชนิด (ใช้ตรวจห้ามซ้ำของ CustomRecordValue) */
function cellEquals(type: MemberFieldType, cell: ValueCell): Prisma.CustomRecordValueWhereInput {
  switch (type) {
    case "NUMBER":
    case "MONEY":
      return { valueNumber: cell.valueNumber };
    case "DATE":
    case "DATETIME":
      return { valueDate: cell.valueDate };
    case "BOOLEAN":
      return { valueBool: cell.valueBool };
    case "SELECT":
    case "MULTI_SELECT":
      return { valueOptions: { equals: cell.valueOptions } };
    case "FILE":
      return { valueFileId: cell.valueFileId };
    case "LOOKUP":
      return { valueRef: cell.valueRef };
    default:
      return { valueText: cell.valueText };
  }
}

async function assertRecordValueNotTaken(
  ctx: FieldCtx,
  scope: CrmScope,
  db: Client,
  field: MemberField,
  value: MemberFieldValueInput,
  recordId: string,
): Promise<void> {
  if (field.isSystem) return; // ฟิลด์ระบบของ CRM ไม่มีตัวไหนตั้ง "ห้ามซ้ำ" (ความซ้ำของผู้ติดต่อ/บริษัทเป็นงานของ service CRM)
  const taken = await db.customRecordValue.count({
    where: { tenantId: ctx.tenantId, recordType: scope.recordType, fieldId: field.id, recordId: { not: recordId }, ...cellEquals(field.type, cellOf(field.type, value)) },
  });
  if (taken > 0) {
    const shown = Array.isArray(value) ? value.join(", ") : String(value);
    throw new MemberInputError(`มีรายการอื่นใช้ค่า "${shown}" ในฟิลด์ "${field.label}" อยู่แล้ว — ฟิลด์นี้ตั้งไว้ว่าห้ามซ้ำ`);
  }
}

// ── อ่าน ──

/**
 * ค่าฟิลด์ของรายการ CRM หลายตัว (ฟิลด์ระบบอ่านจากคอลัมน์จริง · ฟิลด์กำหนดเองจาก CustomRecordValue)
 * id ที่ไม่ใช่รายการของวัตถุนี้ในระบบ CRM นี้ = ถุงว่าง (ไม่ error — แบบเดียวกับทางสมาชิก)
 */
async function getRecordValues(
  ctx: FieldCtx,
  scope: CrmScope,
  recordIds: string[],
  db: Client,
): Promise<Record<string, Record<string, MemberFieldValueInput>>> {
  const out: Record<string, Record<string, MemberFieldValueInput>> = {};
  const ids = [...new Set(recordIds.filter((id) => typeof id === "string" && id))];
  for (const id of ids) out[id] = {};
  if (ids.length === 0) return out;

  const [fields, sensitiveSections, rows] = await Promise.all([
    db.memberField.findMany({ where: { ...defWhere(ctx, scope), archivedAt: null } }),
    db.memberSection.findMany({ where: { ...defWhere(ctx, scope), sensitive: true }, select: { id: true } }),
    loadRecordRows(ctx, scope, db, ids),
  ]);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const customIds = fields.filter((f) => !f.isSystem).map((f) => f.id);
  const validIds = rows.map((r) => r.id);
  const values =
    validIds.length > 0 && customIds.length > 0
      ? await db.customRecordValue.findMany({
          where: { tenantId: ctx.tenantId, recordType: scope.recordType, recordId: { in: validIds }, fieldId: { in: customIds } },
        })
      : [];

  for (const row of rows) {
    const bag = out[row.id] ?? {};
    for (const field of fields) {
      if (!field.isSystem) continue;
      const spec = crmSystemSpecOf(scope, field);
      if (!spec) continue;
      const value = columnToValue(field, row[spec.key]);
      if (value !== null && !(Array.isArray(value) && value.length === 0)) bag[field.key] = value;
    }
    out[row.id] = bag;
  }
  for (const row of values) {
    const field = byId.get(row.fieldId);
    const bag = out[row.recordId];
    if (!field || !bag) continue;
    const value = readCell(field.type, row);
    if (value !== null) bag[field.key] = value;
  }
  await dropSensitiveValues(ctx, scope, db, fields, new Set(sensitiveSections.map((s) => s.id)), out);
  return out;
}

/**
 * D8 บนวัตถุ CRM — ค่าอ่อนไหว (ฟิลด์ `sensitive` หรือฟิลด์ในส่วน `sensitive`) ออกไปได้เฉพาะเมื่อ `evaluateSensitiveAccess`
 * (privacy.ts · ตัวตัดสินตัวเดียวของทั้งระบบ) อนุญาต · ไม่มี actor = ตัดทิ้ง (K2 fail closed) · เห็นจริง + นโยบายสั่งบันทึก
 * = แถว MemberAccessLog ต่อ (รายการ × เป้าหมาย) — เป้าหมายตามกติกาเดียวกับหน้ารวม/ส่งออกของสมาชิก
 * (ฟิลด์ในส่วนอ่อนไหว ⇒ SECTION/id ของส่วน · ฟิลด์อ่อนไหว ⇒ FIELD/id ของฟิลด์)
 * 🔴 K3: `MemberAccessLog.customerId` เป็น String ไม่มี FK ⇒ เก็บ **id ของรายการ CRM** (ผู้ติดต่อ/บริษัท/ดีล/รายการวัตถุ —
 *    มีเสมอ ต่างจาก partyId/สมาชิกที่ผูก) และ `page` = "crm.<objectKey>" บอกว่าไม่ใช่ id สมาชิก
 *    ไม่ยิง event `member.sensitive.viewed` (payload ของ event นั้นประกาศว่า customerId คือสมาชิก — ส่ง id ผู้ติดต่อไป = ข้อมูลผิดความหมาย)
 */
async function dropSensitiveValues(
  ctx: FieldCtx,
  scope: CrmScope,
  db: Client,
  fields: MemberField[],
  sensitiveSectionIds: Set<string>,
  bags: Record<string, Record<string, MemberFieldValueInput>>,
): Promise<void> {
  const targets = new Map<string, { targetType: SensitiveTargetType; targetId: string }>();
  for (const f of fields) {
    if (sensitiveSectionIds.has(f.sectionId)) targets.set(f.key, { targetType: "SECTION", targetId: f.sectionId });
    else if (f.sensitive) targets.set(f.key, { targetType: "FIELD", targetId: f.id });
  }
  if (targets.size === 0) return;

  const actor = ctx.actor;
  const privacy = actor ? await import("./privacy") : null;
  const judgeCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId };
  const cache = new Map<string, SensitiveDecision>();
  const shown = new Map<string, { customerId: string; targetType: SensitiveTargetType; targetId: string; decision: SensitiveDecision }>();
  for (const [recordId, bag] of Object.entries(bags)) {
    for (const [key, target] of targets) {
      if (!(key in bag)) continue;
      // AUDIT-CLASS X8: ค่าอ่อนไหวของวัตถุ CRM ไม่ออกจาก engine ถ้าไม่มีคำตัดสินว่า "เห็นได้" (ไม่มี actor = ไม่เห็น)
      if (!actor || !privacy) {
        delete bag[key];
        continue;
      }
      // คำตัดสินไม่ขึ้นกับรายการ ยกเว้น actor ที่เป็นลูกค้าเอง (เทียบ customerId) — cache ต่อเป้าหมายจึงปลอดภัย
      const cacheKey = actor.role === "CUSTOMER" ? `${target.targetType}:${target.targetId}:${recordId}` : `${target.targetType}:${target.targetId}`;
      let decision = cache.get(cacheKey);
      if (!decision) {
        decision = await privacy.evaluateSensitiveAccess(judgeCtx, actor, { ...target, customerId: recordId }, db);
        cache.set(cacheKey, decision);
      }
      if (!decision.allowed) {
        delete bag[key];
        continue;
      }
      if (decision.shouldLog) shown.set(`${recordId}|${target.targetType}|${target.targetId}`, { customerId: recordId, ...target, decision });
    }
  }
  if (!actor || shown.size === 0) return;
  // ผู้กระทำ: คนจริง = User.id · คีย์ API ที่ไม่มีคนผูก = "apikey:<id>" (กติกาเดียวกับ privacy.logAccess — AUDIT L8)
  const actorRef = actor.userId || (typeof actor.keyId === "string" && actor.keyId.trim() ? `apikey:${actor.keyId.trim()}` : "");
  if (!actorRef) return;
  await db.memberAccessLog.createMany({
    data: [...shown.values()].map((r) => ({
      tenantId: ctx.tenantId,
      customerId: r.customerId,
      userId: actorRef,
      hrEmployeeId: r.decision.hrEmployeeId,
      hrPosition: r.decision.hrPosition,
      targetType: r.targetType,
      targetId: r.targetId,
      page: `crm.${scope.objectKey}`,
    })),
  });
}

// ── เขียน ──

async function setRecordValues(
  ctx: FieldCtx,
  scope: CrmScope,
  recordId: string,
  values: Record<string, unknown>,
  opts: SetFieldValuesOptions,
  db: Client,
  tx?: Client,
): Promise<{ changed: string[] }> {
  const via = normalizeVia(opts?.via);
  const byUserId = opts?.byUserId ?? ctx.actorUserId ?? null;
  const keys = Object.keys(values ?? {});
  if (keys.length === 0) return { changed: [] };

  // AUDIT-CLASS X1: รายการต้องเป็นของวัตถุนี้ในระบบ CRM นี้ (id ดีลที่ส่งมาในฐานะผู้ติดต่อ = ไม่พบ)
  await requireRecord(ctx, scope, db, recordId);
  const fields = await db.memberField.findMany({ where: { ...defWhere(ctx, scope), key: { in: keys } } });
  const byKey = new Map(fields.map((f) => [f.key, f]));

  // ── 1. ตรวจให้ครบก่อน (ค่าผิดตัวเดียว = ไม่เขียนอะไรเลย) ──
  const checked: { field: MemberField; value: MemberFieldValueInput; spec: CrmSystemSpec | null }[] = [];
  for (const key of keys) {
    const field = byKey.get(key);
    if (!field) throw new MemberInputError(`ไม่มีฟิลด์ชื่ออ้างอิง "${key}" ใน${scope.place} — ตรวจการตั้งค่าฟิลด์อีกครั้ง`);
    if (field.archivedAt) throw new MemberInputError(`ฟิลด์ "${field.label}" ถูกเก็บเข้าคลังไว้ จึงบันทึกค่าใหม่ไม่ได้ — กู้คืนฟิลด์ก่อน`);
    if (via === "CUSTOMER_SELF" && !field.customerEditable) {
      throw new MemberInputError(`ฟิลด์ "${field.label}" ให้เจ้าหน้าที่ร้านเป็นผู้กรอก ลูกค้าจึงแก้เองไม่ได้`);
    }
    // AUDIT-CLASS X6: เพดานความยาว (TEXT 500 · LONG_TEXT 4,000 · maxLength) · SELECT/MULTI ต้องเป็นตัวเลือกที่ตั้งไว้ ·
    //   ช่อง URL http/https เท่านั้น — ตัวตรวจตัวเดียวกับทางสมาชิก (normalizeValue)
    const value = normalizeValue(field, values[key]);
    if (field.required && isBlank(value)) throw new MemberInputError(`ฟิลด์ "${field.label}" เป็นข้อมูลที่ต้องกรอก — ใส่ค่าก่อนบันทึก`);
    const spec = field.isSystem ? crmSystemSpecOf(scope, field) : null;
    if (field.isSystem && !spec && value !== null) {
      throw new MemberInputError(`ฟิลด์ "${field.label}" ยังไม่มีที่เก็บในฐานข้อมูลรุ่นนี้ จึงบันทึกค่าไม่ได้ — แจ้งผู้ดูแลระบบเพื่อเปิดใช้`);
    }
    if (spec?.notNull && isBlank(value)) throw new MemberInputError(`ฟิลด์ "${field.label}" ต้องมีค่าเสมอ — ใส่ค่าก่อนบันทึก`);
    // คอลัมน์ที่ service CRM เป็นเจ้าของ (GOVERNED_CRM_SYSTEM_KEYS) — ตรวจหลังเพดาน/รูปแบบ เพื่อให้ค่าผิดรูปได้ข้อความเดิม
    if (spec && scope.kind === "crm" && GOVERNED_CRM_SYSTEM_KEYS[scope.objectKey].has(spec.key)) {
      throw new MemberInputError(
        `ฟิลด์ "${field.label}" แก้ได้จากหน้าข้อมูล${CRM_OBJECT_NOUN[scope.objectKey]}โดยตรง เพราะมีขั้นตอนเฉพาะของมัน (เช่น ประวัติ การแจ้งเตือน หรือการเชื่อมข้อมูล) — ในแบบฟอร์มฟิลด์นี้จึงแสดงค่าอย่างเดียว`,
      );
    }
    checked.push({ field, value, spec });
  }

  // ── 2. ปลายทาง LOOKUP + ค่าซ้ำ ──
  for (const { field, value } of checked) {
    if (value === null) continue;
    if (field.type === "LOOKUP") {
      const ok = await recordLookupExists(ctx, db, field, String(value));
      if (!ok) {
        const target = optionsOf(field).target ?? "CUSTOMER";
        throw new MemberInputError(`ไม่พบ${LOOKUP_LABEL[target]}ที่เลือกไว้ในฟิลด์ "${field.label}" ภายในระบบนี้ — เลือกใหม่จากรายการ`);
      }
    }
    if (field.unique) await assertRecordValueNotTaken(ctx, scope, db, field, value, recordId);
  }

  // ── 3. อ่านค่าเดิม → เขียน → ประวัติ ใน transaction เดียว ──
  const customIds = checked.filter((c) => !c.field.isSystem).map((c) => c.field.id);
  const hasSystem = checked.some((c) => c.spec !== null);
  let changed: string[] = [];
  const write = async (t: Prisma.TransactionClient) => {
    // AUDIT-CLASS X3: เขียนพร้อมกันหลายทาง (หลายโพรเซส) บนรายการเดียวกัน ⇒ ล็อกระดับ transaction ต่อรายการ **ใน DB**
    //   แล้วค่อยอ่านค่าเดิม — ค่าเดิมที่ใช้ทำประวัติจึงเป็นค่าล่าสุดจริงเสมอ (ไม่มีสองคนอ่าน "ค่าเดิม" ตัวเดียวกัน =
    //   ประวัติไม่แตกกิ่ง/ไม่ขาดช่วง · แถวค่ามีแถวเดียวต่อ record+field ตาม unique [recordId, fieldId])
    //   เวลาในประวัติใช้ clock_timestamp() หลังได้ล็อก (now() = เวลาเริ่ม transaction ซึ่งอาจก่อนคนที่ถือล็อกอยู่)
    await lockRecordForFieldWrite(t, recordId);
    const clock = await t.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const at = clock[0]?.now ?? new Date();
    const existing = customIds.length
      ? await t.customRecordValue.findMany({ where: { tenantId: ctx.tenantId, recordId, fieldId: { in: customIds } } })
      : [];
    const existingBy = new Map(existing.map((row) => [row.fieldId, row]));
    const row = hasSystem ? (await loadRecordRows(ctx, scope, t, [recordId]))[0] ?? null : null;
    if (hasSystem && !row) throw new MemberNotFoundError(`ไม่พบรายการนี้ใน${scope.place} — ตรวจว่าเปิดจากร้าน/ระบบเดียวกันหรือไม่`);

    const pending = checked.map(({ field, value, spec }) => {
      const oldValue = spec ? columnToValue(field, row?.[spec.key]) : readCell(field.type, existingBy.get(field.id) ?? null);
      return { field, value, spec, oldValue, changed: !sameValue(oldValue, value) };
    });
    const changedWrites = pending.filter((p) => p.changed);
    if (changedWrites.length === 0) return;

    const columnData: Record<string, unknown> = {};
    for (const { field, value, spec } of changedWrites) {
      if (spec) {
        columnData[spec.key] = systemColumnValue(field, value);
      } else if (field.isSystem) {
        continue; // ฟิลด์ระบบที่ไม่รู้จักคอลัมน์ — ค่า null ผ่านการตรวจได้แต่ไม่มีที่ให้เขียน
      } else if (value === null) {
        await t.customRecordValue.deleteMany({ where: { tenantId: ctx.tenantId, recordId, fieldId: field.id } });
      } else {
        const cell = cellOf(field.type, value);
        await t.customRecordValue.upsert({
          where: { recordId_fieldId: { recordId, fieldId: field.id } },
          create: { tenantId: ctx.tenantId, recordType: scope.recordType, recordId, fieldId: field.id, ...cell, updatedById: byUserId },
          update: { ...cell, updatedById: byUserId },
        });
      }
    }
    if (Object.keys(columnData).length > 0) await updateRecordColumns(t, scope, recordId, columnData);
    const history = changedWrites.filter((p) => p.field.trackHistory);
    if (history.length > 0) {
      await t.customRecordValueHistory.createMany({
        data: history.map((p) => ({
          tenantId: ctx.tenantId,
          recordId,
          fieldId: p.field.id,
          oldValue: toJson(p.oldValue),
          newValue: toJson(p.value),
          changedById: byUserId,
          createdAt: at,
        })),
      });
    }
    changed = changedWrites.map((p) => p.field.key);
  };
  // `tx` ของผู้เรียกใช้ได้เฉพาะเมื่อเป็น transaction จริง — ถ้าส่ง PrismaClient เปล่ามา (ชนิด Client อนุญาต) ล็อกระดับ
  // transaction จะหลุดทันทีหลังคำสั่ง (autocommit) ⇒ เปิด transaction ของเราเองแทน
  //   (ตัวแยก: client ของ interactive transaction ไม่มี `$connect` — ตรวจแล้วบน Prisma ของโปรเจกต์นี้ · `$transaction` มีทั้งสองแบบ)
  const inTx = tx && typeof (tx as { $connect?: unknown }).$connect !== "function" ? (tx as Prisma.TransactionClient) : null;
  if (inTx) await write(inTx);
  else await prisma.$transaction(async (t) => write(t));
  return { changed };
}

/**
 * ล็อกการเขียนค่าฟิลด์ของรายการ CRM 1 รายการ (advisory lock ระดับ transaction · key เดียวกับที่ `setFieldValues` ใช้)
 * 🔴 ลำดับล็อก: ผู้เรียกที่ใน transaction เดียวกัน **ล็อกแถว/อัปเดตแถวของรายการนั้นด้วย** (SELECT … FOR UPDATE ·
 *    update CrmContact/CrmCompany/CrmDeal/CustomRecord) แล้วค่อยเรียก `setFieldValues(…, tx)` ต้องเรียกฟังก์ชันนี้
 *    **ก่อน** ล็อก/อัปเดตแถวนั้น — ไม่งั้นสองทางที่ถือล็อกคนละลำดับ (แถว→advisory กับ advisory→แถว) จะ deadlock กัน
 *    เรียกซ้ำใน transaction เดียวกันได้ (advisory lock ซ้อนได้ ปล่อยพร้อมกันตอนจบ transaction)
 */
export async function lockRecordForFieldWrite(tx: Prisma.TransactionClient, recordId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`member-fields:${recordId}`}, 0))`;
}

// ── ตัวกรอง ──

/**
 * ตัวกรอง `f.<key>` ของวัตถุ CRM → where-fragment ของ CrmContact / CrmCompany / CrmDeal / CustomRecord
 * ฟิลด์กำหนดเอง = `id IN (recordId ของ CustomRecordValue ที่ fieldId = ฟิลด์นี้ + recordType + tenant)` ทุกชนิด
 * ฟิลด์ระบบ = เงื่อนไขบนคอลัมน์จริง (ห่อด้วยขอบเขต tenant + ระบบ ⇒ fragment ปลอดภัยแม้ผู้เรียกลืมใส่ขอบเขตเอง)
 * key ไม่รู้จัก / ไม่เปิดกรอง / ของวัตถุอื่น = ปฏิเสธ (VALIDATION) — ไม่มีทาง "คืนทุกแถว" เพราะตัวกรองหาย
 */
async function recordFilterWhere(ctx: FieldCtx, scope: CrmScope, filters: Record<string, string>, db: Client): Promise<CrmRecordWhere> {
  const keys = Object.keys(filters ?? {});
  if (keys.length === 0) return {};
  const fields = await db.memberField.findMany({ where: { ...defWhere(ctx, scope), key: { in: keys } } });
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const scopeWhere: Record<string, unknown> =
    scope.kind === "custom"
      ? { tenantId: ctx.tenantId, systemId: ctx.systemId, objectId: scope.objectId }
      : { tenantId: ctx.tenantId, systemId: ctx.systemId };

  const sensitiveSections = new Set(
    (await db.memberSection.findMany({ where: { ...defWhere(ctx, scope), sensitive: true }, select: { id: true } })).map((r) => r.id),
  );

  const AND: Record<string, unknown>[] = [];
  for (const key of keys) {
    const field = byKey.get(key);
    // AUDIT-CLASS X1: ค้นฟิลด์ด้วย tenant + ระบบ CRM + วัตถุ ⇒ key ของระบบอื่น/วัตถุอื่น = ไม่รู้จัก
    if (!field) throw new MemberInputError(`ไม่มีฟิลด์ชื่ออ้างอิง "${key}" ใน${scope.place} จึงใช้กรองไม่ได้`);
    if (field.archivedAt) throw new MemberInputError(`ฟิลด์ "${field.label}" ถูกเก็บเข้าคลังไว้ จึงใช้กรองไม่ได้ — กู้คืนฟิลด์ก่อน`);
    if (!field.filterable) throw new MemberInputError(`ฟิลด์ "${field.label}" ยังไม่ได้เปิด "ใช้กรองได้" — เปิดที่หน้าตั้งค่าฟิลด์ก่อนจึงกรองด้วยฟิลด์นี้ได้`);
    await assertMayFilterSensitive(ctx, db, field, sensitiveSections);
    const raw = String(filters[key] ?? "");

    if (field.isSystem) {
      const spec = crmSystemSpecOf(scope, field);
      if (!spec) throw new MemberInputError(`ฟิลด์ "${field.label}" ยังไม่มีที่เก็บในฐานข้อมูลรุ่นนี้ จึงใช้กรองไม่ได้`);
      if (field.type === "SELECT") {
        // คอลัมน์ enum: ค่าที่ไม่อยู่ในตัวเลือกทำให้ฐานข้อมูลตอบ error ที่อ่านไม่ออก — ตรวจเป็นภาษาไทยก่อน
        const choices = optionsOf(field).choices ?? [];
        const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
        if (parts.length === 0) throw new MemberInputError(`ตัวกรองของฟิลด์ "${field.label}" ต้องมีอย่างน้อย 1 ตัวเลือก (คั่นหลายตัวด้วยจุลภาค)`);
        const off = parts.filter((p) => !choices.some((c) => c.value === p));
        if (off.length > 0) {
          throw new MemberInputError(`ค่า "${off.join(", ")}" ไม่อยู่ในตัวเลือกของฟิลด์ "${field.label}" — เลือกได้ ${choices.map((c) => c.value).join(" / ")}`);
        }
      }
      AND.push({ AND: [scopeWhere, systemWhereOf(field, spec.key, raw) as Record<string, unknown>] });
      continue;
    }

    const { where, negate } = valueWhereOf(field, raw);
    const rows = await db.customRecordValue.findMany({
      where: { tenantId: ctx.tenantId, recordType: scope.recordType, fieldId: field.id, ...(where as Prisma.CustomRecordValueWhereInput) },
      select: { recordId: true },
    });
    const ids = [...new Set(rows.map((r) => r.recordId))];
    AND.push(negate ? { AND: [scopeWhere, { id: { notIn: ids } }] } : { id: { in: ids } });
  }
  return { AND } as CrmRecordWhere;
}

/**
 * AUDIT-CLASS X8: กรองด้วยฟิลด์อ่อนไหว = ถามค่าได้ทีละคำถาม (กรอง "เบาหวาน" แล้วดูว่าใครโผล่) ⇒ ต้องผ่านคำตัดสินเดียวกับ
 * การอ่านค่า (`evaluateSensitiveAccess`) · ไม่มี actor = ปฏิเสธ (K2 fail closed) · ทางสมาชิกไม่เปลี่ยน (หนี้บันทึกไว้ให้ C3.9)
 */
async function assertMayFilterSensitive(ctx: FieldCtx, db: Client, field: MemberField, sensitiveSections: Set<string>): Promise<void> {
  const target: { targetType: SensitiveTargetType; targetId: string } | null = sensitiveSections.has(field.sectionId)
    ? { targetType: "SECTION", targetId: field.sectionId }
    : field.sensitive
      ? { targetType: "FIELD", targetId: field.id }
      : null;
  if (!target) return;
  const refuse = () =>
    new MemberInputError(`ฟิลด์ "${field.label}" เป็นข้อมูลอ่อนไหว บัญชีที่ใช้อยู่จึงใช้กรองด้วยฟิลด์นี้ไม่ได้ — ขอสิทธิ์ดูข้อมูลอ่อนไหวจากเจ้าของร้านก่อน`);
  const actor = ctx.actor;
  if (!actor) throw refuse();
  const privacy = await import("./privacy");
  const decision = await privacy.evaluateSensitiveAccess(
    { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId },
    actor,
    { ...target, customerId: "" },
    db,
  );
  if (!decision.allowed) throw refuse();
}

// ── ฟิลด์ระบบ ──

/**
 * `applyTemplate(ctx{objectKey:"contact"|"company"|"deal"}, "system")` — สร้างส่วน "system" + ฟิลด์ระบบ (ตัวชี้คอลัมน์จริง)
 * ที่ยังไม่มี (เทียบด้วย key) · รันซ้ำได้ผลเท่าเดิม · 🔴 ไม่ผ่านทะเบียน TEMPLATES ของสมาชิก (ทะเบียนนั้นป้อนตัวเลือก
 * เทมเพลตที่เจ้าของร้านเห็น — G1.10) และไม่ผ่าน createField (ฟิลด์ระบบต้องมี isSystem + systemKey ซึ่งผู้ใช้ตั้งเองไม่ได้)
 */
async function applySystemTemplate(
  ctx: FieldCtx,
  scope: CrmScope,
  templateKey: string,
  opts: ApplyTemplateOptions,
  db: Client,
): Promise<{ added: { sections: number; fields: number }; created: { sectionIds: string[]; fieldIds: string[] } }> {
  if (scope.kind !== "crm") {
    throw new MemberInputError(`${scope.place}ไม่มีฟิลด์ระบบ — สร้างส่วนและฟิลด์เองได้จากตัวออกแบบฟิลด์`);
  }
  if (templateKey !== "system") throw new MemberInputError(`ไม่รู้จักเทมเพลต "${templateKey}" ของ${scope.place} — ใช้ได้ system`);
  const tpl = CRM_SYSTEM_TEMPLATE[scope.objectKey];
  const only = opts.onlyFieldKeys ? new Set(opts.onlyFieldKeys) : null;
  const added = { sections: 0, fields: 0 };
  const created = { sectionIds: [] as string[], fieldIds: [] as string[] };

  const [sections, fields] = await Promise.all([loadSections(ctx, scope, db), loadFields(ctx, scope, db)]);
  const fieldKeys = new Set(fields.map((f) => f.key));
  const wanted = tpl.fields.filter((f) => (only ? only.has(f.key) : true) && !fieldKeys.has(f.key));
  if (wanted.length === 0) return { added, created };

  let sectionId = sections.find((s) => s.key === tpl.section.key)?.id;
  if (!sectionId) {
    await assertSectionCapacity(ctx, scope, db, 1);
    const row = await db.memberSection.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        objectKey: scope.objectKey,
        key: tpl.section.key,
        label: tpl.section.label,
        description: tpl.section.description,
        columns: 2,
        isSystem: true,
        sortOrder: sections.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1,
      },
    });
    sectionId = row.id;
    added.sections += 1;
    created.sectionIds.push(row.id);
  }
  await assertFieldCapacity(ctx, scope, db, wanted.length);
  let sortOrder = fields.filter((f) => f.sectionId === sectionId).reduce((m, f) => Math.max(m, f.sortOrder), -1) + 1;
  for (const f of wanted) {
    const row = await db.memberField.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        objectKey: scope.objectKey,
        sectionId,
        key: f.key,
        label: f.label,
        type: f.type,
        options: (f.options ?? {}) as Prisma.InputJsonValue,
        required: f.required ?? false,
        filterable: f.filterable ?? false,
        showInList: f.showInList ?? false,
        showOnCard: f.showOnCard ?? false,
        isSystem: true,
        systemKey: f.key,
        sortOrder,
      },
    });
    sortOrder += 1;
    added.fields += 1;
    created.fieldIds.push(row.id);
  }
  return { added, created };
}
