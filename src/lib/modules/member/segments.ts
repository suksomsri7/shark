// segments.ts — "กลุ่มลูกค้า" (segment) ของระบบสมาชิก v2 (M3.1 · พิมพ์เขียว §5.9 §4.3 · ภาพ 21 ขั้น 1)
//
// สิ่งที่ไฟล์นี้เป็นเจ้าของ
//   • listSegmentFields — ทะเบียนฟิลด์ที่ใช้ตั้งเงื่อนไขได้ (ฟิลด์ระบบ · `f.{key}` ที่เปิด "ใช้กรองได้" ·
//     ระดับ · แต้ม · ไม่ซื้อ/ไม่จอง N วัน · ยอด 12 เดือน · จำนวนครั้ง · voucher · ยินยอมรายช่องทาง ·
//     ที่มา · สาขา · แท็ก · เดือนเกิด · ขั้นลูกค้าใน CRM)
//   • evaluateSegment — นิยาม → `Prisma.CustomerWhereInput` (เงื่อนไขในกลุ่ม AND · ข้ามกลุ่ม OR)
//   • countSegment / sampleSegment / segmentMembers — นับ · สุ่มตัวอย่าง · ไล่รายชื่อ
//   • saveSegment / listSegments / deleteSegment — กลุ่มที่บันทึกไว้ (TEAM/PRIVATE)
//
// 🔴 ผู้ใช้จริงของทะเบียนนี้ไม่ใช่แค่หน้า segment: แคมเปญ (M3.2) · journey (M3.3) · การออก voucher
//    แบบ "เป็นกลุ่ม" (M2.5) ถามคำถามเดียวกันหมด ⇒ ตรรกะอยู่ที่นี่ที่เดียว โมดูลอื่นเรียกผ่าน facade
//    `member/index.ts` (marketing/segments.ts = ทางเข้าเดิมของฝั่งการตลาด · re-export ล้วน)
// 🔴 "ค่าที่ไม่รู้จัก" ≠ "ฟิลด์ที่ไม่รู้จัก": พิมพ์ชื่อฟิลด์/ช่องทาง/ตัวดำเนินการผิด = โยนข้อความไทยบอกตรง ๆ
//    แต่ "ค่า" ที่ไม่อยู่ในทะเบียนตัวเลือก (ระดับที่ถูกลบไปแล้ว/ที่มาที่สะกดไม่ตรง) = แปลว่า "ไม่ตรงใคร"
//    ไม่ใช่ทำหน้าแตก (กติกาเดียวกับตัวกรองหน้ารวมสมาชิกของ M1.5 — ตัวกรองที่ยังพิมพ์ไม่สุดต้องไม่พัง)
// 🔴 unit scope (§6.1): พนักงานที่ถูกจำกัดสาขา นับเฉพาะสมาชิกที่ `homeUnitId` อยู่ในสิทธิ์ตน
//    (ต่างจากหน้ารวมสมาชิกที่ OR กับ "เคยมีกิจกรรมที่สาขาตน" — ตัวเลขของแคมเปญต้องเท่ากับคนที่ส่งถึงจริง
//     ไม่ใช่คนที่บังเอิญเคยเดินผ่านสาขา)
// 🔴 prisma ผ่าน `./db` (จุดเดียวของโมดูลที่ล้วง core — F5 ratchet)

import type { MemberField, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { consentChannels, getChannel } from "@/lib/core/channels";
import { systemForUnit, unitsForSystem } from "@/lib/modules/system";
import { canReadMember, hasMemberPerm, isUnitScoped, type MemberActor } from "./access";
import { prisma } from "./db";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import { MEMBER_LIMITS, memberLimitError } from "./limits";
import { MEMBER_SOURCE_LABELS } from "./member-source-labels";
import type { MemberCtx } from "./privacy";
import { briefFor, type MemberBrief } from "./profile";
// 🔴 ชนิดข้อมูล/ทะเบียนป้ายไทย/ตัวช่วยสร้างประโยค อยู่ที่ `segments-shared.ts` (ไฟล์บริสุทธิ์)
//    เพื่อให้ client component ใช้ได้โดยไม่ลากไฟล์นี้ (และ prisma) เข้าบันเดิลเบราว์เซอร์
import {
  boolOf,
  describeDefinition,
  parseDefinition,
  SEGMENT_OPS,
  SEGMENT_OP_LABELS,
  valueList,
  type SegmentCondition,
  type SegmentDefinition,
  type SegmentFieldDef,
  type SegmentFieldKind,
  type SegmentFieldOption,
  type SegmentGroup,
  type SegmentOp,
  type SegmentScope,
} from "./segments-shared";
import { listTierDefs } from "./tiers";

export {
  /** ตัวดำเนินการทั้งหมด + ป้ายไทย (หน้าจอใช้ตัวเดียวกับเอนจิน) */
  SEGMENT_OPS,
  SEGMENT_OP_LABELS,
  /** ตรวจรูปทรงนิยาม / ประโยคไทยย่อ */
  parseDefinition,
  describeDefinition,
} from "./segments-shared";
export type {
  SegmentOp,
  SegmentFieldKind,
  SegmentFieldOption,
  SegmentFieldDef,
  SegmentCondition,
  SegmentGroup,
  SegmentDefinition,
  SegmentScope,
} from "./segments-shared";

// ───────────────────────── ชนิดข้อมูลของฝั่งเซิร์ฟเวอร์ (ต้องถามฐานข้อมูล) ─────────────────────────

export type SegmentDto = {
  id: string;
  name: string;
  definition: SegmentDefinition;
  scope: SegmentScope;
  ownerUserId: string | null;
  ownerName: string | null;
  lastCount: number | null;
  lastCountAt: Date | null;
  /** ประโยคไทยย่อของเงื่อนไข (รายการหน้าแรกโชว์บรรทัดนี้) */
  summary: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CountSegmentResult = {
  count: number;
  /** ยอดซื้อ 12 เดือนเฉลี่ยต่อคน (สตางค์) */
  avgSpend12mSatang: number;
  sample: MemberBrief[];
};

export type SampleSegmentOptions = { take?: number; cursor?: string | null };
export type SampleSegmentResult = { items: MemberBrief[]; nextCursor: string | null };

export type SaveSegmentInput = {
  id?: string | null;
  name: string;
  definition: unknown;
  scope?: SegmentScope | string | null;
};

// ───────────────────────── ชุดตัวดำเนินการต่อชนิดฟิลด์ ─────────────────────────

const OPS_TEXT: SegmentOp[] = ["contains", "eq", "neq", "in", "nin", "isNull", "notNull"];
const OPS_NUMBER: SegmentOp[] = ["gte", "gt", "lte", "lt", "eq", "neq"];
const OPS_DATE: SegmentOp[] = ["after", "before", "isNull", "notNull"];
const OPS_SELECT: SegmentOp[] = ["in", "nin", "eq", "neq", "isNull", "notNull"];
const OPS_SELECT_FIXED: SegmentOp[] = ["in", "nin", "eq", "neq"];
const OPS_MULTI: SegmentOp[] = ["hasAny", "hasAll"];
const OPS_BOOL: SegmentOp[] = ["eq"];

// ───────────────────────── ตัวเลือกมาตรฐาน ─────────────────────────

const GENDER_OPTIONS: SegmentFieldOption[] = [
  { value: "MALE", label: "ชาย" },
  { value: "FEMALE", label: "หญิง" },
  { value: "OTHER", label: "อื่น ๆ" },
  { value: "UNSPECIFIED", label: "ไม่ระบุ" },
];

const STATUS_OPTIONS: SegmentFieldOption[] = [
  { value: "ACTIVE", label: "ใช้งานอยู่" },
  { value: "SUSPENDED", label: "ระงับชั่วคราว" },
  { value: "CLOSED", label: "ปิดบัญชีแล้ว" },
];

const SOURCE_OPTIONS: SegmentFieldOption[] = Object.entries(MEMBER_SOURCE_LABELS).map(([value, label]) => ({ value, label }));

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTH_OPTIONS: SegmentFieldOption[] = THAI_MONTHS.map((label, i) => ({ value: String(i + 1), label }));

const LIFECYCLE_OPTIONS: SegmentFieldOption[] = [
  { value: "LEAD", label: "ผู้สนใจ" },
  { value: "PROSPECT", label: "กำลังคุย" },
  { value: "CUSTOMER", label: "ลูกค้าแล้ว" },
  { value: "LOST", label: "ไม่ไปต่อ" },
];

// ───────────────────────── ฟิลด์ระบบ (คอลัมน์ของ Customer) ─────────────────────────

type SystemSpec = {
  key: string;
  label: string;
  kind: SegmentFieldKind;
  ops: SegmentOp[];
  /** คอลัมน์เดียวของ Customer ที่เงื่อนไขนี้ลง */
  column: string;
  /** ค่าที่ทะเบียนรู้จัก — ค่าที่ไม่อยู่ในนี้แปลว่า "ไม่ตรงใคร" (ไม่ throw) */
  values?: readonly string[];
  options?: SegmentFieldOption[];
  /** ฟิลด์ข้อความที่ต้องค้นหลายคอลัมน์พร้อมกัน (ชื่อ = name/firstName/lastName/nickname) */
  alsoColumns?: readonly string[];
};

/**
 * ฟิลด์ระบบที่ตั้งเงื่อนไขได้ — เป็น "ทะเบียนคงที่" ไม่ใช่แถว `MemberField`
 * เหตุผล: คอลัมน์พวกนี้มีอยู่ทุกร้านเสมอ (ไม่ขึ้นกับว่าร้านเผลอปิดสวิตช์ "ใช้กรองได้" ของฟิลด์ระบบตัวไหน)
 * และ segment ต้องตอบคำถามธุรกิจได้เหมือนกันทุกร้าน — ฟิลด์ที่ร้าน **สร้างเอง** ต่างหากที่ต้องเปิดสวิตช์ก่อน
 */
const SYSTEM_SPECS: readonly SystemSpec[] = [
  { key: "memberCode", label: "รหัสสมาชิก", kind: "text", ops: OPS_TEXT, column: "memberCode" },
  { key: "name", label: "ชื่อ", kind: "text", ops: ["contains", "eq"], column: "name", alsoColumns: ["firstName", "lastName", "nickname"] },
  { key: "phone", label: "เบอร์โทร", kind: "text", ops: ["contains", "eq", "isNull", "notNull"], column: "phone" },
  { key: "email", label: "อีเมล", kind: "text", ops: ["contains", "eq", "isNull", "notNull"], column: "email" },
  { key: "gender", label: "เพศ", kind: "select", ops: OPS_SELECT, column: "gender", values: GENDER_OPTIONS.map((o) => o.value), options: GENDER_OPTIONS },
  { key: "nationality", label: "สัญชาติ", kind: "text", ops: OPS_TEXT, column: "nationality" },
  { key: "birthDate", label: "วันเกิด", kind: "date", ops: OPS_DATE, column: "birthDate" },
  { key: "status", label: "สถานะสมาชิก", kind: "select", ops: OPS_SELECT_FIXED, column: "status", values: ["ACTIVE", "SUSPENDED", "CLOSED"], options: STATUS_OPTIONS },
  { key: "createdAt", label: "วันที่สมัคร", kind: "date", ops: ["after", "before"], column: "createdAt" },
  { key: "ownerUserId", label: "พนักงานที่ดูแล", kind: "text", ops: ["eq", "neq", "in", "nin", "isNull", "notNull"], column: "ownerUserId" },
  { key: "referredById", label: "ผู้แนะนำ", kind: "text", ops: ["eq", "in", "isNull", "notNull"], column: "referredById" },
];

// ───────────────────────── ที่มาของแต่ละเงื่อนไข ─────────────────────────

type FieldSource =
  | { kind: "column"; spec: SystemSpec }
  | { kind: "tier"; idByKey: Map<string, string> }
  | { kind: "points" }
  | { kind: "inactiveDays" }
  | { kind: "lastActivityAt" }
  | { kind: "spent12m" }
  | { kind: "visits12m" }
  | { kind: "voucherCount" }
  | { kind: "consent"; channel: string }
  | { kind: "source" }
  | { kind: "unit" }
  | { kind: "tags" }
  | { kind: "birthdayMonth" }
  | { kind: "lifecycle" }
  | { kind: "custom"; field: MemberField };

type FieldEntry = { def: SegmentFieldDef; source: FieldSource };

type Registry = {
  list: SegmentFieldDef[];
  byKey: Map<string, FieldEntry>;
  /** ฟิลด์ที่ร้านสร้างเองทั้งหมด (รวมที่ยังไม่เปิด "ใช้กรองได้") — ไว้บอกเหตุผลที่ถูกต้องตอน throw */
  customByKey: Map<string, MemberField>;
};

const CUSTOM_PREFIX = "f.";
const CONSENT_PREFIX = "consent.";

function customFieldOps(type: MemberField["type"]): SegmentOp[] {
  switch (type) {
    case "NUMBER":
    case "MONEY":
      return OPS_NUMBER;
    case "DATE":
    case "DATETIME":
      return OPS_DATE;
    case "SELECT":
      return OPS_SELECT;
    case "MULTI_SELECT":
      return OPS_MULTI;
    case "BOOLEAN":
      return OPS_BOOL;
    case "FILE":
      return ["isNull", "notNull"];
    case "LOOKUP":
      return ["eq", "in", "isNull", "notNull"];
    default:
      return OPS_TEXT;
  }
}

function customFieldKind(type: MemberField["type"]): SegmentFieldKind {
  switch (type) {
    case "NUMBER":
      return "number";
    case "MONEY":
      return "money";
    case "DATE":
    case "DATETIME":
      return "date";
    case "SELECT":
    case "LOOKUP":
      return "select";
    case "MULTI_SELECT":
      return "multi";
    case "BOOLEAN":
      return "boolean";
    default:
      return "text";
  }
}

function choicesOf(field: MemberField): SegmentFieldOption[] | undefined {
  const raw = field.options;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const choices = (raw as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return undefined;
  const out: SegmentFieldOption[] = [];
  for (const c of choices) {
    if (!c || typeof c !== "object") continue;
    const value = (c as Record<string, unknown>).value;
    const label = (c as Record<string, unknown>).label;
    if (typeof value !== "string") continue;
    out.push({ value, label: typeof label === "string" && label ? label : value });
  }
  return out.length ? out : undefined;
}

function unitOptionOf(field: MemberField): string | undefined {
  const raw = field.options;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const unit = (raw as Record<string, unknown>).unit;
  return typeof unit === "string" && unit ? unit : undefined;
}

/** ทะเบียนฟิลด์ของร้านนี้ (อ่านครั้งเดียวต่อการประเมิน 1 ครั้ง) */
async function loadRegistry(ctx: MemberCtx): Promise<Registry> {
  const [tiers, fieldRows, unitIds] = await Promise.all([
    listTierDefs(ctx).catch(() => []),
    prisma.memberField.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    unitsForSystem(ctx.tenantId, ctx.systemId).catch(() => [] as string[]),
  ]);
  const units = unitIds.length
    ? await prisma.businessUnit.findMany({ where: { tenantId: ctx.tenantId, id: { in: unitIds } }, orderBy: { name: "asc" } })
    : [];

  const list: SegmentFieldDef[] = [];
  const byKey = new Map<string, FieldEntry>();
  const customByKey = new Map<string, MemberField>();
  const add = (def: SegmentFieldDef, source: FieldSource) => {
    if (byKey.has(def.key)) return;
    byKey.set(def.key, { def, source });
    list.push(def);
  };

  // 1) ระดับ + ความภักดี (คำถามที่ร้านถามบ่อยที่สุดอยู่บนสุดของรายการ)
  add(
    {
      key: "tier",
      label: "ระดับ",
      kind: "select",
      ops: OPS_SELECT,
      options: tiers.map((t) => ({ value: t.key, label: t.name })),
    },
    { kind: "tier", idByKey: new Map(tiers.map((t) => [t.key, t.id])) },
  );
  add({ key: "points", label: "แต้มคงเหลือ", kind: "number", ops: OPS_NUMBER, unit: "แต้ม" }, { kind: "points" });
  add({ key: "inactiveDays", label: "ไม่ซื้อ/ไม่จอง", kind: "number", ops: ["gt", "gte", "lt", "lte"], unit: "วัน" }, { kind: "inactiveDays" });
  add({ key: "lastActivityAt", label: "มาล่าสุด", kind: "date", ops: OPS_DATE }, { kind: "lastActivityAt" });
  add({ key: "spent12m", label: "ยอดซื้อ 12 เดือน", kind: "money", ops: OPS_NUMBER, unit: "บาท" }, { kind: "spent12m" });
  add({ key: "visits12m", label: "จำนวนครั้ง 12 เดือน", kind: "number", ops: OPS_NUMBER, unit: "ครั้ง" }, { kind: "visits12m" });
  add({ key: "voucherCount", label: "voucher ที่ถืออยู่", kind: "number", ops: OPS_NUMBER, unit: "ใบ" }, { kind: "voucherCount" });

  // 2) ที่มา · สาขา · แท็ก · เดือนเกิด · ขั้นลูกค้าใน CRM
  add({ key: "source", label: "ที่มา", kind: "select", ops: OPS_SELECT, options: SOURCE_OPTIONS }, { kind: "source" });
  add(
    { key: "unit", label: "สาขาหลัก", kind: "select", ops: OPS_SELECT, options: units.map((u) => ({ value: u.id, label: u.name })) },
    { kind: "unit" },
  );
  add({ key: "tags", label: "แท็ก", kind: "multi", ops: OPS_MULTI }, { kind: "tags" });
  add({ key: "birthdayMonth", label: "เดือนเกิด", kind: "select", ops: OPS_SELECT_FIXED, options: MONTH_OPTIONS }, { kind: "birthdayMonth" });
  add({ key: "lifecycle", label: "ขั้นลูกค้า (CRM)", kind: "select", ops: OPS_SELECT_FIXED, options: LIFECYCLE_OPTIONS }, { kind: "lifecycle" });

  // 3) ยินยอมรับข่าวสารรายช่องทาง (D19 — เพิ่มช่องทางที่ทะเบียนกลาง = โผล่ที่นี่เอง)
  for (const ch of consentChannels()) {
    add(
      { key: `${CONSENT_PREFIX}${ch.key}`, label: `ยินยอมรับข่าวสารทาง ${ch.label}`, kind: "boolean", ops: OPS_BOOL },
      { kind: "consent", channel: ch.key },
    );
  }

  // 4) ฟิลด์ระบบ (คอลัมน์ของ Customer)
  for (const spec of SYSTEM_SPECS) {
    add({ key: spec.key, label: spec.label, kind: spec.kind, ops: spec.ops, ...(spec.options ? { options: spec.options } : {}) }, { kind: "column", spec });
  }

  // 5) ฟิลด์ที่ร้านสร้างเอง — เฉพาะที่เปิด "ใช้กรองได้" (§11 — เหตุผลคือ index ไม่ใช่การขายของ)
  for (const f of fieldRows) {
    if (f.isSystem) continue;
    customByKey.set(f.key, f);
    if (!f.filterable) continue;
    const options = choicesOf(f);
    const unit = unitOptionOf(f);
    add(
      {
        key: `${CUSTOM_PREFIX}${f.key}`,
        label: `${f.label} (กำหนดเอง)`,
        kind: customFieldKind(f.type),
        ops: customFieldOps(f.type),
        ...(options ? { options } : {}),
        ...(unit ? { unit } : {}),
      },
      { kind: "custom", field: f },
    );
  }

  return { list, byKey, customByKey };
}

/** ฟิลด์ทั้งหมดที่ตั้งเงื่อนไขได้ในร้านนี้ (ตัวสร้างเงื่อนไขบนหน้าจอใช้ทะเบียนนี้ตรง ๆ) */
export async function listSegmentFields(ctx: MemberCtx): Promise<SegmentFieldDef[]> {
  const reg = await loadRegistry(ctx);
  return reg.list;
}

// ───────────────────────── ตัวช่วยอ่านค่า ─────────────────────────

function numberOf(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) throw new MemberInputError(`เงื่อนไข "${label}" ต้องกรอกเป็นตัวเลข`);
  return n;
}

function dateOf(value: unknown, label: string): Date {
  const raw = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(raw.getTime())) throw new MemberInputError(`เงื่อนไข "${label}" ต้องกรอกเป็นวันที่`);
  return raw;
}

/** ไม่มีสมาชิกคนไหนตรง (ใช้เมื่อค่าที่ส่งมาไม่อยู่ในทะเบียนตัวเลือก) */
const MATCH_NONE: Prisma.CustomerWhereInput = { id: { in: [] } };
const MATCH_ALL: Prisma.CustomerWhereInput = {};

function idsWhere(ids: string[], negate: boolean): Prisma.CustomerWhereInput {
  if (negate) return ids.length ? { id: { notIn: ids } } : MATCH_ALL;
  return ids.length ? { id: { in: ids } } : MATCH_NONE;
}

/** ตัวเปรียบเทียบตัวเลข + ตัวกลับข้าง (ใช้กับตารางที่ "ไม่มีแถว = ศูนย์" เช่น แต้ม/voucher) */
function numberFilter(op: SegmentOp, n: number): { filter: Prisma.IntFilter; matchesZero: boolean; inverse: Prisma.IntFilter } {
  switch (op) {
    case "gt":
      return { filter: { gt: n }, matchesZero: 0 > n, inverse: { lte: n } };
    case "gte":
      return { filter: { gte: n }, matchesZero: 0 >= n, inverse: { lt: n } };
    case "lt":
      return { filter: { lt: n }, matchesZero: 0 < n, inverse: { gte: n } };
    case "lte":
      return { filter: { lte: n }, matchesZero: 0 <= n, inverse: { gt: n } };
    case "neq":
      return { filter: { not: n }, matchesZero: 0 !== n, inverse: { equals: n } };
    default:
      return { filter: { equals: n }, matchesZero: 0 === n, inverse: { not: n } };
  }
}

// ───────────────────────── เงื่อนไข → where ─────────────────────────

function columnWhere(spec: SystemSpec, op: SegmentOp, value: unknown): Prisma.CustomerWhereInput {
  const at = (cond: unknown): Prisma.CustomerWhereInput => ({ [spec.column]: cond }) as Prisma.CustomerWhereInput;
  const known = (list: string[]): string[] => (spec.values ? list.filter((v) => spec.values!.includes(v)) : list);

  switch (op) {
    case "isNull":
      return at(null);
    case "notNull":
      return at({ not: null });
    case "contains": {
      const text = valueList(value)[0] ?? "";
      if (!text) return MATCH_ALL;
      const cols = [spec.column, ...(spec.alsoColumns ?? [])];
      return { OR: cols.map((c) => ({ [c]: { contains: text, mode: "insensitive" } }) as Prisma.CustomerWhereInput) };
    }
    case "before":
      return at({ lt: dateOf(value, spec.label) });
    case "after":
      // "ตั้งแต่วันที่" — ใช้ `gte` เพื่อให้ "หลังวันนี้" กับ "ก่อนวันนี้" รวมกันแล้วได้ทุกคนพอดี
      return at({ gte: dateOf(value, spec.label) });
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return at({ [op]: numberOf(value, spec.label) });
    case "in":
    case "nin": {
      const list = known(valueList(value));
      if (list.length === 0) return op === "in" ? MATCH_NONE : MATCH_ALL;
      // "ไม่อยู่ในกลุ่มนี้" นับคนที่ยังไม่มีค่าด้วย (ไม่มีสาขาหลัก = ไม่ได้อยู่สาขากะตะ)
      return op === "in" ? at({ in: list }) : { OR: [at({ notIn: list }), at(null)] };
    }
    case "eq":
    case "neq": {
      const list = known(valueList(value));
      const one = list[0];
      if (one === undefined) return op === "eq" ? MATCH_NONE : MATCH_ALL;
      return op === "eq" ? at(one) : { OR: [at({ not: one }), at(null)] };
    }
    default:
      throw new MemberInputError(`เงื่อนไข "${spec.label}" ยังไม่รองรับการเปรียบเทียบแบบนี้`);
  }
}

async function customFieldWhere(ctx: MemberCtx, field: MemberField, op: SegmentOp, value: unknown): Promise<Prisma.CustomerWhereInput> {
  const label = field.label;
  let where: Prisma.MemberFieldValueWhereInput | null = null;
  let negate = false;

  switch (field.type) {
    case "NUMBER":
    case "MONEY": {
      const n = numberOf(value, label);
      if (op === "neq") {
        where = { valueNumber: { not: n } };
      } else if (op === "eq") {
        where = { valueNumber: n };
      } else {
        where = { valueNumber: { [op]: n } as Prisma.DecimalFilter };
      }
      break;
    }
    case "DATE":
    case "DATETIME": {
      if (op === "isNull") {
        where = { valueDate: { not: null } };
        negate = true;
      } else if (op === "notNull") {
        where = { valueDate: { not: null } };
      } else {
        const at = dateOf(value, label);
        where = { valueDate: op === "before" ? { lt: at } : { gte: at } };
      }
      break;
    }
    case "BOOLEAN":
      where = { valueBool: boolOf(value) };
      break;
    case "SELECT":
    case "MULTI_SELECT": {
      if (op === "isNull" || op === "notNull") {
        where = { valueOptions: { isEmpty: false } };
        negate = op === "isNull";
        break;
      }
      const list = valueList(value);
      if (list.length === 0) return op === "nin" || op === "neq" ? MATCH_ALL : MATCH_NONE;
      where = op === "hasAll" ? { valueOptions: { hasEvery: list } } : { valueOptions: { hasSome: list } };
      negate = op === "nin" || op === "neq";
      break;
    }
    case "LOOKUP": {
      if (op === "isNull" || op === "notNull") {
        where = { valueRef: { not: null } };
        negate = op === "isNull";
        break;
      }
      const list = valueList(value);
      if (list.length === 0) return MATCH_NONE;
      where = { valueRef: { in: list } };
      break;
    }
    case "FILE":
      where = { valueFileId: { not: null } };
      negate = op === "isNull";
      break;
    default: {
      // TEXT / LONG_TEXT
      if (op === "isNull" || op === "notNull") {
        where = { valueText: { not: null } };
        negate = op === "isNull";
        break;
      }
      const list = valueList(value);
      if (list.length === 0) return op === "nin" || op === "neq" ? MATCH_ALL : MATCH_NONE;
      if (op === "contains") where = { valueText: { contains: list[0]!, mode: "insensitive" } };
      else if (op === "in" || op === "nin") where = { valueText: { in: list } };
      else where = { valueText: list[0]! };
      negate = op === "nin" || op === "neq";
      break;
    }
  }

  const rows = await prisma.memberFieldValue.findMany({
    where: { tenantId: ctx.tenantId, fieldId: field.id, ...(where ?? {}) },
    select: { customerId: true },
  });
  return idsWhere([...new Set(rows.map((r) => r.customerId))], negate);
}

/** ระบบแต้มที่ผูกสาขาเดียวกับระบบสมาชิกนี้ (ร้านที่ยังไม่เปิดแต้ม = ทุกคนมี 0 แต้ม) */
async function pointSystemOf(ctx: MemberCtx): Promise<string | null> {
  const units = await unitsForSystem(ctx.tenantId, ctx.systemId).catch(() => [] as string[]);
  for (const unitId of units) {
    const id = await systemForUnit(ctx.tenantId, unitId, "POINT");
    if (id) return id;
  }
  return null;
}

async function pointsWhere(ctx: MemberCtx, op: SegmentOp, value: unknown): Promise<Prisma.CustomerWhereInput> {
  const n = numberOf(value, "แต้มคงเหลือ");
  const systemId = await pointSystemOf(ctx);
  const { filter, matchesZero, inverse } = numberFilter(op, n);
  // ร้านที่ยังไม่มีระบบแต้ม = ทุกคนมี 0 แต้ม (ตอบตามความจริง ไม่ใช่ "ไม่มีใครเลย")
  if (!systemId) return matchesZero ? MATCH_ALL : MATCH_NONE;
  // คนที่ยังไม่มีแถวยอดแต้ม = 0 แต้ม ⇒ ถ้าศูนย์เข้าเงื่อนไข ต้องถามกลับข้าง ("ทุกคน ยกเว้นคนที่ยอดไม่เข้าเกณฑ์")
  const rows = await prisma.pointBalance.findMany({
    where: { systemId, balance: matchesZero ? inverse : filter },
    select: { customerId: true },
  });
  return idsWhere([...new Set(rows.map((r) => r.customerId))], matchesZero);
}

async function voucherCountWhere(ctx: MemberCtx, op: SegmentOp, value: unknown): Promise<Prisma.CustomerWhereInput> {
  const n = numberOf(value, "voucher ที่ถืออยู่");
  const { matchesZero } = numberFilter(op, n);
  // 🔴 อ่านตาราง voucher ตรง ๆ (ไม่ผ่าน facade): คำถามคือ "ทุกคนในร้านถือกี่ใบ" ซึ่งเป็นคำถามแบบชุด
  //    facade ของ voucher ตอบได้ทีละคน — ยิงทีละคน 50,000 ครั้งเพื่อทำ segment เดียวไม่ใช่ทางเลือก
  const rows = await prisma.voucher.groupBy({
    by: ["customerId"],
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    _count: { _all: true },
  });
  const counted = new Map(rows.map((r) => [r.customerId, r._count._all]));
  const matchIds: string[] = [];
  const failIds: string[] = [];
  for (const [customerId, c] of counted) {
    if (compareNumber(op, c, n)) matchIds.push(customerId);
    else failIds.push(customerId);
  }
  // คนที่ไม่มีใบเลย = 0 ใบ ⇒ ถ้า 0 เข้าเงื่อนไข ให้ตอบเป็น "ทุกคน ยกเว้นคนที่ถือแล้วไม่เข้าเกณฑ์"
  return matchesZero ? idsWhere(failIds, true) : idsWhere(matchIds, false);
}

function compareNumber(op: SegmentOp, actual: number, expected: number): boolean {
  switch (op) {
    case "gt": return actual > expected;
    case "gte": return actual >= expected;
    case "lt": return actual < expected;
    case "lte": return actual <= expected;
    case "neq": return actual !== expected;
    default: return actual === expected;
  }
}

async function consentWhere(ctx: MemberCtx, channel: string, value: unknown): Promise<Prisma.CustomerWhereInput> {
  const rows = await prisma.memberConsent.findMany({
    where: { tenantId: ctx.tenantId, channel, granted: true },
    select: { customerId: true },
  });
  const ids = [...new Set(rows.map((r) => r.customerId))];
  // ไม่มีแถว = ยังไม่ได้ให้ความยินยอม (กติกา §7.1 — เงียบไม่เท่ากับยินยอม)
  return idsWhere(ids, !boolOf(value));
}

async function lifecycleWhere(ctx: MemberCtx, op: SegmentOp, value: unknown): Promise<Prisma.CustomerWhereInput> {
  const list = valueList(value).filter((v) => LIFECYCLE_OPTIONS.some((o) => o.value === v));
  const negate = op === "nin" || op === "neq";
  if (list.length === 0) return negate ? MATCH_ALL : MATCH_NONE;
  const rows = await prisma.crmContact.findMany({
    where: { tenantId: ctx.tenantId, archivedAt: null, lifecycleStage: { in: list as Prisma.EnumCrmLifecycleStageFilter["in"] } },
    select: { partyId: true, memberCustomerId: true },
  });
  const partyIds = [...new Set(rows.map((r) => r.partyId).filter((x): x is string => !!x))];
  const customerIds = [...new Set(rows.map((r) => r.memberCustomerId).filter((x): x is string => !!x))];
  if (partyIds.length === 0 && customerIds.length === 0) return negate ? MATCH_ALL : MATCH_NONE;
  const match: Prisma.CustomerWhereInput = {
    OR: [...(partyIds.length ? [{ partyId: { in: partyIds } }] : []), ...(customerIds.length ? [{ id: { in: customerIds } }] : [])],
  };
  return negate ? { NOT: match } : match;
}

async function birthdayMonthWhere(ctx: MemberCtx, op: SegmentOp, value: unknown): Promise<Prisma.CustomerWhereInput> {
  const months = new Set(valueList(value).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12));
  const negate = op === "nin" || op === "neq";
  if (months.size === 0) return negate ? MATCH_ALL : MATCH_NONE;
  // `birthDate` เป็นชนิด date ล้วน ⇒ อ่านเดือนจากส่วน UTC (ไม่มีเวลา จึงไม่มีปัญหาเขตเวลา)
  // อ่านทั้งระบบครั้งเดียวแล้วคัดในหน่วยความจำ: Prisma ยังกรอง "เดือนของคอลัมน์วันที่" ตรง ๆ ไม่ได้
  const rows = await prisma.customer.findMany({
    where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, birthDate: { not: null } },
    select: { id: true, birthDate: true },
  });
  const ids = rows.filter((r) => months.has(r.birthDate!.getUTCMonth() + 1)).map((r) => r.id);
  return idsWhere(ids, negate);
}

function tagsWhere(op: SegmentOp, value: unknown): Prisma.CustomerWhereInput {
  const list = valueList(value);
  if (list.length === 0) return MATCH_NONE;
  const each = list.map((t) => ({ tags: { array_contains: [t] } }) as Prisma.CustomerWhereInput);
  return op === "hasAll" ? { AND: each } : { OR: each };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function inactiveWhere(op: SegmentOp, value: unknown): Prisma.CustomerWhereInput {
  const days = numberOf(value, "ไม่ซื้อ/ไม่จอง");
  const cutoff = daysAgo(days);
  switch (op) {
    // "ไม่ซื้อ/ไม่จองมากกว่า N วัน" รวมคนที่ **ไม่เคย** มีกิจกรรมเลยด้วย (คนหายไปตั้งแต่วันแรกก็คือคนหาย)
    case "gt":
      return { OR: [{ lastActivityAt: { lt: cutoff } }, { lastActivityAt: null }] };
    case "gte":
      return { OR: [{ lastActivityAt: { lte: cutoff } }, { lastActivityAt: null }] };
    case "lt":
      return { lastActivityAt: { gt: cutoff } };
    default:
      return { lastActivityAt: { gte: cutoff } };
  }
}

async function conditionWhere(ctx: MemberCtx, reg: Registry, raw: unknown): Promise<Prisma.CustomerWhereInput> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MemberInputError("เงื่อนไขต้องเป็นชุดข้อมูล { field, op, value } — ลองสร้างเงื่อนไขใหม่จากหน้าจอ");
  }
  const cond = raw as { field?: unknown; op?: unknown; value?: unknown };
  const key = String(cond.field ?? "").trim();
  const op = String(cond.op ?? "").trim() as SegmentOp;
  const entry = reg.byKey.get(key);

  if (!entry) {
    if (key.startsWith(CUSTOM_PREFIX)) {
      const field = reg.customByKey.get(key.slice(CUSTOM_PREFIX.length));
      if (field) {
        throw new MemberInputError(
          `ฟิลด์ "${field.label}" ยังไม่ได้เปิด "ใช้กรองได้" — เปิดที่หน้าตั้งค่าฟิลด์ก่อน จึงจะใช้ตั้งเงื่อนไขกลุ่มได้`,
        );
      }
    }
    if (key.startsWith(CONSENT_PREFIX)) {
      throw new MemberInputError(
        `ยังไม่มีช่องทาง "${key.slice(CONSENT_PREFIX.length)}" ที่เก็บความยินยอมได้ — เลือกช่องทางจากรายการที่หน้าจอแสดง`,
      );
    }
    throw new MemberInputError(`ไม่รู้จักเงื่อนไข "${key || "(ว่าง)"}" — เลือกฟิลด์จากรายการที่หน้าจอแสดงเท่านั้น`);
  }

  if (!SEGMENT_OPS.includes(op)) {
    throw new MemberInputError(`ไม่รู้จักการเปรียบเทียบ "${op || "(ว่าง)"}" ของเงื่อนไข "${entry.def.label}"`);
  }
  if (!entry.def.ops.includes(op)) {
    const allowed = entry.def.ops.map((o) => SEGMENT_OP_LABELS[o]).join(" / ");
    throw new MemberInputError(`เงื่อนไข "${entry.def.label}" ใช้การเปรียบเทียบแบบนี้ไม่ได้ — เลือกได้เป็น ${allowed}`);
  }

  const src = entry.source;
  switch (src.kind) {
    case "column":
      return columnWhere(src.spec, op, cond.value);
    case "tier": {
      const ids = valueList(cond.value)
        .map((v) => src.idByKey.get(v) ?? ([...src.idByKey.values()].includes(v) ? v : null))
        .filter((x): x is string => !!x);
      const negate = op === "nin" || op === "neq";
      if (op === "isNull") return { tierDefId: null };
      if (op === "notNull") return { tierDefId: { not: null } };
      if (ids.length === 0) return negate ? MATCH_ALL : MATCH_NONE;
      return negate ? { OR: [{ tierDefId: { notIn: ids } }, { tierDefId: null }] } : { tierDefId: { in: ids } };
    }
    case "points":
      return pointsWhere(ctx, op, cond.value);
    case "inactiveDays":
      return inactiveWhere(op, cond.value);
    case "lastActivityAt":
      return columnWhere({ key: "lastActivityAt", label: "มาล่าสุด", kind: "date", ops: OPS_DATE, column: "lastActivityAt" }, op, cond.value);
    case "spent12m":
      return columnWhere({ key: "spent12m", label: "ยอดซื้อ 12 เดือน", kind: "money", ops: OPS_NUMBER, column: "spent12mSatang" }, op, cond.value);
    case "visits12m":
      return columnWhere({ key: "visits12m", label: "จำนวนครั้ง 12 เดือน", kind: "number", ops: OPS_NUMBER, column: "visits12m" }, op, cond.value);
    case "voucherCount":
      return voucherCountWhere(ctx, op, cond.value);
    case "consent":
      return consentWhere(ctx, src.channel, cond.value);
    case "source":
      return columnWhere(
        { key: "source", label: "ที่มา", kind: "select", ops: OPS_SELECT, column: "source", values: SOURCE_OPTIONS.map((o) => o.value) },
        op,
        cond.value,
      );
    case "unit":
      return columnWhere({ key: "unit", label: "สาขาหลัก", kind: "select", ops: OPS_SELECT, column: "homeUnitId" }, op, cond.value);
    case "tags":
      return tagsWhere(op, cond.value);
    case "birthdayMonth":
      return birthdayMonthWhere(ctx, op, cond.value);
    case "lifecycle":
      return lifecycleWhere(ctx, op, cond.value);
    case "custom":
      return customFieldWhere(ctx, src.field, op, cond.value);
    default:
      return MATCH_NONE;
  }
}

// ───────────────────────── นิยาม → where ─────────────────────────

/**
 * นิยาม → เงื่อนไขค้นหาสมาชิก (ยังไม่ผสมขอบเขตสาขาของผู้ใช้ — count/sample เป็นคนผสมให้)
 * กลุ่มว่าง (หรือกลุ่มที่ไม่มีเงื่อนไขเลย) = สมาชิกทุกคนในระบบนี้ ยกเว้นคนที่ถูกรวมไปแล้ว
 */
export async function evaluateSegment(ctx: MemberCtx, definition: unknown): Promise<Prisma.CustomerWhereInput> {
  const def = parseDefinition(definition);
  const base: Prisma.CustomerWhereInput = {
    tenantId: ctx.tenantId,
    memberSystemId: ctx.systemId,
    status: { not: "MERGED" },
  };
  if (def.groups.length === 0 || def.groups.some((g) => g.conditions.length === 0)) return base;

  const reg = await loadRegistry(ctx);
  const groups = await Promise.all(
    def.groups.map(async (g) => {
      const parts = await Promise.all(g.conditions.map((c) => conditionWhere(ctx, reg, c)));
      return { AND: parts } as Prisma.CustomerWhereInput;
    }),
  );
  return groups.length === 1 ? { ...base, ...groups[0] } : { ...base, OR: groups };
}

// ───────────────────────── สิทธิ์ ─────────────────────────

function requireRead(actor: MemberActor): void {
  // อ่าน/นับกลุ่ม = สิทธิ์อ่านโมดูลสมาชิก (read-โดยนัย แบบเดียวกับหน้ารวมสมาชิกของ M1.5)
  if (!canReadMember(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าโมดูลสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

/**
 * บันทึก/ลบกลุ่มลูกค้าได้ไหม
 * 🔴 คีย์หลักคือ `member.promo.manage` (§6.1) **หรือ** `marketing.campaign.create` —
 *    เพราะกลุ่มลูกค้าคือ "ขั้นที่ 1 ของการสร้างแคมเปญ" (ภาพ 21) คนที่ร้านมอบหมายให้ทำแคมเปญ
 *    ต้องบันทึกกลุ่มเป้าหมายของแคมเปญตัวเองได้ ไม่งั้นทำงานที่ได้รับมอบหมายไม่จบสักงาน
 *    (พนักงานหน้าร้านที่มีแค่ member.customer.* ยังบันทึกไม่ได้เหมือนเดิม)
 */
export function canManageSegments(actor: MemberActor): boolean {
  return hasMemberPerm(actor, "member.promo.manage") || hasMemberPerm(actor, "marketing.campaign.create");
}

function requireManage(actor: MemberActor): void {
  if (!canManageSegments(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์บันทึกกลุ่มลูกค้า — ขอสิทธิ์ member.promo.manage จากเจ้าของร้านก่อน");
  }
}

/** ขอบเขตสาขาของผู้ใช้ (§6.1) — ผสมกับเงื่อนไขของกลุ่มด้วย AND เสมอ */
function scopeWhere(actor: MemberActor): Prisma.CustomerWhereInput | null {
  if (!isUnitScoped(actor)) return null;
  return { homeUnitId: { in: actor.unitAccess } };
}

async function whereForActor(ctx: MemberCtx, actor: MemberActor, definition: unknown): Promise<Prisma.CustomerWhereInput> {
  const where = await evaluateSegment(ctx, definition);
  const scope = scopeWhere(actor);
  return scope ? { AND: [where, scope] } : where;
}

const SAMPLE_ORDER: Prisma.CustomerOrderByWithRelationInput[] = [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { id: "asc" }];

// ───────────────────────── นับ / ตัวอย่าง ─────────────────────────

/** กี่คนเข้าเงื่อนไข + ยอดซื้อเฉลี่ย + ตัวอย่าง 5 ชื่อ (กล่องฟ้าใต้ตัวสร้างเงื่อนไข) */
export async function countSegment(ctx: MemberCtx, actor: MemberActor, definition: unknown): Promise<CountSegmentResult> {
  requireRead(actor);
  const where = await whereForActor(ctx, actor, definition);
  const [count, agg, rows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.aggregate({ where, _sum: { spent12mSatang: true } }),
    prisma.customer.findMany({ where, orderBy: SAMPLE_ORDER, take: 5, select: { id: true } }),
  ]);
  const sum = Number(agg._sum.spent12mSatang ?? 0);
  const sample = await briefFor(ctx, actor, rows.map((r) => r.id));
  return { count, avgSpend12mSatang: count > 0 ? Math.round(sum / count) : 0, sample };
}

/** ไล่รายชื่อคนที่เข้าเงื่อนไขทีละหน้า (แคมเปญ/การออก voucher เป็นกลุ่ม ใช้ตัวนี้) */
export async function sampleSegment(
  ctx: MemberCtx,
  actor: MemberActor,
  definition: unknown,
  opts: SampleSegmentOptions = {},
): Promise<SampleSegmentResult> {
  requireRead(actor);
  const take = opts.take ?? 20;
  if (take > 50) throw new MemberInputError("ขอรายชื่อได้ครั้งละไม่เกิน 50 คน — ลดจำนวนแล้วลองใหม่");
  if (take < 1) throw new MemberInputError("จำนวนรายชื่อต่อครั้งต้องมากกว่า 0");
  const where = await whereForActor(ctx, actor, definition);
  const cursor = opts.cursor ?? null;
  const rows = await prisma.customer.findMany({
    where,
    orderBy: SAMPLE_ORDER,
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true },
  });
  const page = rows.slice(0, take);
  const items = await briefFor(ctx, actor, page.map((r) => r.id));
  return { items, nextCursor: rows.length > take ? (page[page.length - 1]?.id ?? null) : null };
}

// ───────────────────────── กลุ่มที่บันทึกไว้ ─────────────────────────

function scopeOf(raw: unknown): SegmentScope {
  return String(raw ?? "").toUpperCase() === "PRIVATE" ? "PRIVATE" : "TEAM";
}

type SegmentRow = {
  id: string;
  name: string;
  definition: Prisma.JsonValue;
  scope: string;
  ownerUserId: string | null;
  lastCount: number | null;
  lastCountAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function safeDefinition(raw: Prisma.JsonValue): SegmentDefinition {
  try {
    return parseDefinition(raw);
  } catch {
    return { groups: [] };
  }
}

async function toDtos(ctx: MemberCtx, rows: SegmentRow[]): Promise<SegmentDto[]> {
  if (rows.length === 0) return [];
  const ownerIds = [...new Set(rows.map((r) => r.ownerUserId).filter((x): x is string => !!x))];
  const [users, defs] = await Promise.all([
    ownerIds.length ? prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    listSegmentFields(ctx),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name?.trim() || u.email]));
  return rows.map((r) => {
    const definition = safeDefinition(r.definition);
    return {
      id: r.id,
      name: r.name,
      definition,
      scope: scopeOf(r.scope),
      ownerUserId: r.ownerUserId,
      ownerName: r.ownerUserId ? (nameOf.get(r.ownerUserId) ?? null) : null,
      lastCount: r.lastCount,
      lastCountAt: r.lastCountAt,
      summary: describeDefinition(defs, definition),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });
}

/** กลุ่มที่ผู้ใช้คนนี้เห็น — ของทีมเห็นทุกคน · ของส่วนตัวเห็นเฉพาะเจ้าของ */
export async function listSegments(ctx: MemberCtx, actor: MemberActor): Promise<SegmentDto[]> {
  requireRead(actor);
  const rows = await prisma.memberSegment.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      OR: [{ scope: "TEAM" }, { ownerUserId: actor.userId }],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: MEMBER_LIMITS.segments,
  });
  return toDtos(ctx, rows);
}

async function requireSegmentRow(ctx: MemberCtx, actor: MemberActor, id: string): Promise<SegmentRow> {
  const row = await prisma.memberSegment.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  // มองไม่เห็น = ไม่พบ (กติกา 404-not-403 §6.4 — ไม่บอกว่ากลุ่มส่วนตัวของคนอื่นมีอยู่จริง)
  if (!row || (scopeOf(row.scope) === "PRIVATE" && row.ownerUserId !== actor.userId)) {
    throw new MemberNotFoundError("ไม่พบกลุ่มลูกค้ากลุ่มนี้ — อาจถูกลบไปแล้ว");
  }
  return row;
}

/** กลุ่ม 1 กลุ่มพร้อมประโยคย่อ (หน้าตัวสร้างเงื่อนไขโหลดตัวนี้) */
export async function getSegment(ctx: MemberCtx, actor: MemberActor, id: string): Promise<SegmentDto> {
  requireRead(actor);
  const row = await requireSegmentRow(ctx, actor, id);
  return (await toDtos(ctx, [row]))[0]!;
}

/** สร้าง/แก้กลุ่ม แล้วนับจำนวนคนเก็บไว้ให้รายการโชว์ได้ทันที */
export async function saveSegment(ctx: MemberCtx, actor: MemberActor, input: SaveSegmentInput): Promise<SegmentDto> {
  requireManage(actor);
  const name = String(input?.name ?? "").trim();
  if (!name) throw new MemberInputError("ตั้งชื่อกลุ่มก่อนบันทึก — ชื่อช่วยให้ทีมรู้ว่ากลุ่มนี้เอาไว้ทำอะไร");
  if (name.length > 120) throw new MemberInputError("ชื่อกลุ่มยาวเกินไป — ใช้ได้ไม่เกิน 120 ตัวอักษร");
  const scope = scopeOf(input.scope);
  const definition = parseDefinition(input.definition);
  const counted = await countSegment(ctx, actor, definition);
  const now = new Date();
  const data = {
    name,
    definition: definition as unknown as Prisma.InputJsonValue,
    scope,
    lastCount: counted.count,
    lastCountAt: now,
  };

  let row: SegmentRow;
  if (input.id) {
    const current = await requireSegmentRow(ctx, actor, input.id);
    row = await prisma.memberSegment.update({ where: { id: current.id }, data });
  } else {
    const used = await prisma.memberSegment.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId } });
    if (used >= MEMBER_LIMITS.segments) {
      throw memberLimitError(`บันทึกกลุ่มลูกค้าได้สูงสุด ${MEMBER_LIMITS.segments} กลุ่มต่อระบบสมาชิก — ลบกลุ่มที่ไม่ได้ใช้แล้วออกก่อน`);
    }
    row = await prisma.memberSegment.create({
      data: { ...data, tenantId: ctx.tenantId, systemId: ctx.systemId, ownerUserId: actor.userId },
    });
  }

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? undefined,
    action: input.id ? "member.segment.update" : "member.segment.create",
    targetType: "MemberSegment",
    targetId: row.id,
    after: { name, scope, count: counted.count },
  });

  return (await toDtos(ctx, [row]))[0]!;
}

/** ลบกลุ่ม — เจ้าของกลุ่มลบของตัวเองได้เสมอ · คนอื่นต้องมีสิทธิ์จัดการโปรโมชัน */
export async function deleteSegment(ctx: MemberCtx, actor: MemberActor, id: string): Promise<{ ok: true }> {
  requireRead(actor);
  const row = await requireSegmentRow(ctx, actor, id);
  const isOwner = !!row.ownerUserId && row.ownerUserId === actor.userId;
  if (!isOwner) requireManage(actor);
  await prisma.memberSegment.delete({ where: { id: row.id } });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? undefined,
    action: "member.segment.delete",
    targetType: "MemberSegment",
    targetId: row.id,
    after: { name: row.name },
  });
  return { ok: true };
}

/** รายชื่อสมาชิกในกลุ่มที่บันทึกไว้ (ทีละหน้า) */
export async function segmentMembers(
  ctx: MemberCtx,
  actor: MemberActor,
  id: string,
  opts: SampleSegmentOptions = {},
): Promise<SampleSegmentResult> {
  requireRead(actor);
  const row = await requireSegmentRow(ctx, actor, id);
  return sampleSegment(ctx, actor, safeDefinition(row.definition), opts);
}
