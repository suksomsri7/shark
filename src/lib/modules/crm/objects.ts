// objects.ts — บริการ "วัตถุกำหนดเอง" ของ CRM v2 (ใบ C1.2b · พิมพ์เขียว §5.8 §10 §11.2 · มติ C8 · R-A · R-C.8 · R-C.12)
//
// ของที่ไฟล์นี้เป็นเจ้าของ
//   • นิยามวัตถุ `CustomObject`: create/update/archive/restore/reorder/list/get (+ warnings = ป้ายเตือนหน้าตั้งค่า)
//   • รายการ `CustomRecord`: records.create/update/archive/get/list/move/bulk/import/export
//   • `tabsFor(parentType, parentId)` (แท็บในหน้า 360) · `timelineFor(recordId)` (หน้ารายการเดี่ยว)
//   • event `custom.record.created/updated/archived` (ยิงใน tx เดียวกับการเขียน) + ตัวรับ `onRecordCreated` (ไทม์ไลน์สมาชิก)
//
// 🔴 ฟิลด์/ส่วน/ค่า/ประวัติ/ตัวกรอง = engine ตัวเดียวของระบบ (member facade `fields` · ใบ C1.2a) — ห้ามมี engine ที่สอง
//    เรียกด้วย `{ ...ctx, objectKey: <key ของวัตถุ>, actor }` ทุกครั้ง (ไม่มี actor = engine ตัดค่าอ่อนไหวทิ้ง — K2)
// 🔴 วัตถุที่ถูกเก็บถาวร = engine มองว่า "ไม่พบ" (รวม listLayout) ⇒ `restore` ต้องปลดเก็บถาวรแถววัตถุ **ก่อน** อ่านอะไรจาก engine
// 🔴 ทุก query ใส่ tenantId + systemId เอง (client ดิบ — เหตุผลอยู่ที่ `./db.ts`) · systemId resolve ใหม่จาก tenant + ชนิด CRM ทุกครั้ง
// 🔴 `recordCount` = จำนวนรายการที่ยังไม่ถูกเก็บถาวร · เปลี่ยนได้ด้วย increment/decrement คำสั่งเดียวเท่านั้น (X3)

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { CustomObject, CustomParent, CustomRecord } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { csvRow, parseCsv } from "@/lib/core/csv";
import { logOps } from "@/lib/core/ops";
import { emitOutbox } from "@/lib/core/outbox";
// 🔴 engine ฟิลด์ผ่าน member facade เท่านั้น (ไม่ล้วง member/fields ตรง) — **โหลดตอนใช้** (dynamic import):
//    crm facade ถูก import จากทะเบียน AI (`crm_create_lead`) และโมดูลบัญชี ⇒ ถ้า import member facade ที่หัวไฟล์
//    กราฟจะวนกลับเข้าบัญชีกลางทาง (member → … → account) แล้วตัวแปรระดับไฟล์ของบัญชีถูกอ่านก่อนประกาศ (TDZ — fitness F10.1)
import type { MemberActor } from "@/lib/modules/member";
const memberFacade = () => import("@/lib/modules/member");
/** engine ฟิลด์ตัวเดียวของระบบ (member facade → namespace `fields` · ใบ C1.2a) */
const engine = async () => (await memberFacade()).fields;
import { prisma } from "./db";
import {
  OBJECT_BULK_MAX,
  OBJECT_EXPORT_MAX_ROWS,
  OBJECT_IMPORT_MAX_BYTES,
  OBJECT_IMPORT_MAX_ROWS,
  OBJECT_KEY_MAX,
  OBJECT_KEY_RE,
  OBJECT_PARENT_LABEL,
  OBJECT_PARENT_TYPES,
  OBJECT_REASON_MIN,
  OBJECT_TEMPLATES,
  OBJECT_WARN_AT,
  ObjectsError,
  RECORD_WARN_AT,
  RESERVED_OBJECT_KEYS,
  type ObjectDto,
  type ObjectParentType,
  type ObjectTab,
  type ObjectTimelineItem,
  type ObjectValue,
  type ObjectWarnings,
  type RecordDto,
} from "./objects-shared";

export { OBJECT_TEMPLATES, OBJECT_EXPORT_MAX_ROWS, OBJECT_IMPORT_MAX_ROWS, OBJECT_IMPORT_MAX_BYTES, OBJECT_BULK_MAX, OBJECT_WARN_AT, RECORD_WARN_AT, ObjectsError };

// ───────────────────────── ชนิด ─────────────────────────

export type ObjectsCtx = { tenantId: string; systemId: string; actorUserId: string | null };
type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

export type CreateObjectInput = {
  key: string;
  label: string;
  labelPlural?: string;
  icon?: string | null;
  parentType: ObjectParentType;
  titleFieldKey: string;
  showAsTab?: boolean;
  portalVisible?: boolean;
  templateKey?: string | null;
  unitScoped?: boolean;
};

export type UpdateObjectInput = Partial<Omit<CreateObjectInput, "templateKey">>;

export type CreateRecordInput = {
  parentId?: string | null;
  title?: string | null;
  values?: Record<string, unknown>;
  unitId?: string | null;
  ownerUserId?: string | null;
};

export type UpdateRecordInput = { title?: string | null; values?: Record<string, unknown> };

export type ListRecordsInput = {
  parentId?: string | null;
  q?: string | null;
  /** ตัวกรอง `f.{fieldKey}` (รูปแบบของ engine: "คำ" · "=ตรงตัว" · "a..b" · "a.." · "true") */
  f?: Record<string, string>;
  sort?: "title" | "-title" | "createdAt" | "-createdAt" | "updatedAt" | "-updatedAt";
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
};

export type BulkRecordsInput = { action: "archive"; ids: string[]; confirm?: boolean; reason?: string | null };

export type ImportRecordsResult = { created: number; skipped: number; errors: { row: number; reason: string }[] };

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

const LIST_PAGE_MAX = 200;
const EXPORT_BATCH = 1_000;
const TITLE_MAX = 200;
const EVENT_TYPES = { created: "custom.record.created", updated: "custom.record.updated", archived: "custom.record.archived" } as const;

const fail = (code: ObjectsError["code"], message: string) => new ObjectsError(code, message);

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** error จาก engine ฟิลด์ → ObjectsError (`.code` ที่ผู้เรียกของใบนี้ใช้) · error ของฐานข้อมูลโยนต่อตามจริง */
function engineError(e: unknown): unknown {
  if (e instanceof ObjectsError) return e;
  if (
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientUnknownRequestError ||
    e instanceof Prisma.PrismaClientValidationError
  ) {
    return e;
  }
  // ชนิด error ของโมดูลสมาชิก (errors.ts) ตัดสินจากชื่อคลาส — facade โหลดแบบ lazy จึงไม่ใช้ instanceof
  const name = e instanceof Error ? e.name : "";
  if (name === "MemberNotFoundError") return fail("NOT_FOUND", (e as Error).message);
  if (name === "MemberInputError") return fail("VALIDATION", (e as Error).message);
  if (name === "MemberForbiddenError") return fail("FORBIDDEN", (e as Error).message);
  // engine ใช้ Error ธรรมดา (ข้อความไทย) กับค่าที่กรอกผิดรูป/เกินเพดาน (normalizeValue · normalizeKey)
  if (e instanceof Error && e.constructor === Error && /[ก-๙]/.test(e.message)) return fail("VALIDATION", e.message);
  return e;
}

async function viaEngine<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw engineError(e);
  }
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const isNotMatched = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";

function assertActor(actor: MemberActor | null | undefined): asserts actor is MemberActor {
  // ลูกค้า (role CUSTOMER) ไม่มีทางเข้าบริการนี้ — ตอบ "ไม่พบ" (404-not-403)
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", "ไม่พบข้อมูลนี้ในระบบ CRM ที่เปิดอยู่");
}

/** ออกแบบวัตถุ (สร้าง/แก้/เก็บถาวร/เรียง) = งานตั้งค่า — เจ้าของร้านหรือผู้จัดการ */
/** บทบาทของคีย์ API (ตัวพิมพ์ใหญ่) — ตรรกะเดียวกับ `member/access.ts#apiRoleOf` (facade ไม่ได้ export ⇒ อ่าน `actor.apiRole`) */
function apiRoleOfActor(actor: MemberActor): "READONLY" | "OPERATE" | "ADMIN" | null {
  const r = typeof actor.apiRole === "string" ? actor.apiRole.toUpperCase() : "";
  return r === "READONLY" || r === "OPERATE" || r === "ADMIN" ? r : null;
}

/** ทุกการเขียน (ออกแบบวัตถุ + รายการ): คีย์ API แบบอ่านอย่างเดียว = ปฏิเสธ */
function assertCanWrite(actor: MemberActor): void {
  if (apiRoleOfActor(actor) === "READONLY") {
    throw fail("FORBIDDEN", "คีย์ API นี้เป็นแบบอ่านอย่างเดียว จึงเพิ่มหรือแก้ข้อมูลไม่ได้ — ใช้คีย์ที่มีสิทธิ์ทำรายการ");
  }
}

function assertDesigner(actor: MemberActor): void {
  assertCanWrite(actor);
  // คีย์ API (แม้ ADMIN) ทำได้แค่รายการ — การออกแบบวัตถุ (โครงสร้างข้อมูลของร้าน) ต้องเป็นคนในหน้าตั้งค่า
  if (apiRoleOfActor(actor) !== null) {
    throw fail("FORBIDDEN", "การตั้งค่าวัตถุกำหนดเองทำผ่านคีย์ API ไม่ได้ — ให้เจ้าของร้านหรือผู้จัดการตั้งค่าจากหน้าตั้งค่า CRM");
  }
  if (actor.role !== "OWNER" && actor.role !== "MANAGER") {
    throw fail("FORBIDDEN", "การตั้งค่าวัตถุกำหนดเองทำได้เฉพาะเจ้าของร้านหรือผู้จัดการ — ขอให้ผู้ดูแลช่วยตั้งค่าให้");
  }
}

/** AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ **CRM** ของร้านนี้จริง (ระบบร้านอื่น/ระบบชนิดอื่น = ไม่พบ) — ห้ามเชื่อ id จากผู้เรียก */
async function resolveSystem(ctx: ObjectsCtx, db: Db = prisma): Promise<void> {
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string"
      ? await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
}

/** ctx ของ engine ฟิลด์สำหรับวัตถุนี้ (R-E.1 · K1: actor เดินทางไปกับ ctx) */
function fctx(ctx: ObjectsCtx, objectKey: string, actor: MemberActor) {
  return { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId, objectKey, actor };
}

async function findObject(ctx: ObjectsCtx, key: unknown, db: Db, opts: { includeArchived?: boolean } = {}): Promise<CustomObject> {
  const k = typeof key === "string" ? key.trim() : "";
  // AUDIT-CLASS X1: วัตถุของระบบ CRM นี้เท่านั้น (key เดียวกันในระบบอื่น/ร้านอื่น = ไม่พบ)
  const row = k
    ? await db.customObject.findFirst({
        where: { tenantId: ctx.tenantId, systemId: ctx.systemId, key: k, ...(opts.includeArchived ? {} : { archivedAt: null }) },
      })
    : null;
  if (!row) throw fail("NOT_FOUND", `ไม่พบวัตถุ "${k}" ในระบบ CRM นี้ (อาจถูกเก็บถาวรไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่`);
  return row;
}

function objectDto(row: CustomObject): ObjectDto {
  return {
    id: row.id,
    key: row.key,
    objectKey: row.key,
    label: row.label,
    labelPlural: row.labelPlural,
    icon: row.icon,
    parentType: row.parentType as ObjectParentType,
    titleFieldKey: row.titleFieldKey,
    showAsTab: row.showAsTab,
    portalVisible: row.portalVisible,
    unitScoped: row.unitScoped,
    sortOrder: row.sortOrder,
    templateKey: row.templateKey,
    recordCount: row.recordCount,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  };
}

function normalizeObjectKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key || key.length > OBJECT_KEY_MAX || !OBJECT_KEY_RE.test(key)) {
    throw fail(
      "VALIDATION",
      `ชื่ออ้างอิง (key) ของวัตถุใช้ได้เฉพาะ a–z, A–Z, 0–9 และ _ โดยขึ้นต้นด้วยตัวพิมพ์เล็ก ยาวไม่เกิน ${OBJECT_KEY_MAX} ตัว — เช่น "vehicle"`,
    );
  }
  if (RESERVED_OBJECT_KEYS.includes(key)) {
    throw fail("VALIDATION", `ชื่ออ้างอิง "${key}" สงวนไว้ให้ข้อมูลหลักของระบบ (สมาชิก/ผู้ติดต่อ/บริษัท/ดีล) — ตั้งชื่ออื่น เช่น "${key}Info"`);
  }
  return key;
}

function normalizeText(raw: unknown, what: string, max = 120): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw fail("VALIDATION", `ต้องตั้ง${what}ก่อนจึงบันทึกได้`);
  if (text.length > max) throw fail("VALIDATION", `${what}ยาวเกิน ${max} ตัวอักษร — ตั้งให้สั้นลง`);
  return text;
}

function normalizeParentType(raw: unknown): ObjectParentType {
  if (typeof raw === "string" && (OBJECT_PARENT_TYPES as readonly string[]).includes(raw)) return raw as ObjectParentType;
  throw fail("VALIDATION", "เลือกว่ารายการของวัตถุนี้เป็นของใคร: สมาชิก · ผู้ติดต่อ · บริษัท · ดีล · หรือไม่ผูกกับใคร");
}

function normalizeTitleFieldKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key || key.length > OBJECT_KEY_MAX || !OBJECT_KEY_RE.test(key)) {
    throw fail("VALIDATION", "เลือกฟิลด์ที่ใช้เป็นชื่อรายการ (ชื่ออ้างอิงของฟิลด์ เช่น \"plate\") ก่อนบันทึก");
  }
  return key;
}

function normalizeReason(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  return text.length >= OBJECT_REASON_MIN ? text.slice(0, 500) : null;
}

/** ค่า → ข้อความชื่อรายการ (ค่าว่าง = null) */
function titleOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = Array.isArray(value) ? value.map((v) => String(v)).join(", ") : String(value);
  const t = text.trim();
  return t ? t.slice(0, TITLE_MAX) : null;
}

const fallbackTitle = (obj: CustomObject) => `${obj.label} (ยังไม่ตั้งชื่อ)`;

type LayoutLike = { sections: { sensitive: boolean; fields: { key: string; sensitive: boolean }[] }[] };

/** ฟิลด์ชื่อรายการเป็นข้อมูลอ่อนไหวไหม (ฟิลด์ sensitive หรืออยู่ในส่วน sensitive) — D8: ค่าอ่อนไหวห้ามไปเป็นชื่อรายการ */
function isSensitiveField(layout: LayoutLike, key: string): boolean {
  for (const s of layout.sections) for (const f of s.fields) if (f.key === key) return s.sensitive || f.sensitive;
  return false;
}

/** ขอบเขตสาขาของวัตถุที่ตั้ง `unitScoped` — actor ที่ถูกจำกัดสาขาเห็นเฉพาะรายการของสาขาตน + รายการที่ไม่ระบุสาขา */
function unitWhere(obj: CustomObject, actor: MemberActor): Prisma.CustomRecordWhereInput {
  if (!obj.unitScoped || actor.role === "OWNER" || actor.unitAccess.includes("*")) return {};
  return { OR: [{ unitId: null }, { unitId: { in: actor.unitAccess } }] };
}

function coversUnit(obj: CustomObject, actor: MemberActor, unitId: string | null): boolean {
  if (!obj.unitScoped || !unitId || actor.role === "OWNER" || actor.unitAccess.includes("*")) return true;
  return actor.unitAccess.includes(unitId);
}

// ───────────────────────── แม่ของรายการ ─────────────────────────

type ParentInfo = { parentId: string | null; partyId: string | null };

/**
 * แม่ของรายการตามชนิดที่วัตถุกำหนด + partyId ที่รายการรับช่วงมา
 * AUDIT-CLASS X1: แม่ชนิด CONTACT/COMPANY/DEAL ต้องอยู่ **ระบบ CRM เดียวกัน** (ฐานข้อมูลไม่มี FK ให้พึ่ง — ข้อสังเกตรีวิว C1.1)
 *   แม่ชนิด CUSTOMER = สมาชิกของร้านนี้ (ระบบสมาชิกไหนก็ได้) · แม่ที่ไม่พบ/ผิดชนิด/ของระบบอื่น = VALIDATION (ไม่บอกว่ามีอยู่ที่อื่น)
 */
async function resolveParent(ctx: ObjectsCtx, parentType: ObjectParentType, rawParentId: unknown, db: Db): Promise<ParentInfo> {
  const parentId = str(rawParentId);
  if (parentType === "NONE") {
    if (parentId) throw fail("VALIDATION", "วัตถุนี้ตั้งไว้ว่า \"ไม่ผูกกับใคร\" จึงระบุเจ้าของรายการไม่ได้ — เอาช่องเจ้าของออกแล้วบันทึกใหม่");
    return { parentId: null, partyId: null };
  }
  const label = OBJECT_PARENT_LABEL[parentType];
  if (!parentId) throw fail("VALIDATION", `ต้องเลือก${label}ที่เป็นเจ้าของรายการนี้ก่อนบันทึก`);
  const notFound = () => fail("VALIDATION", `ไม่พบ${label}ที่เลือกในระบบ CRM นี้ — เลือกใหม่จากรายการ`);
  const base = { id: parentId, tenantId: ctx.tenantId };
  switch (parentType) {
    case "CONTACT": {
      const row = await db.crmContact.findFirst({ where: { ...base, systemId: ctx.systemId }, select: { partyId: true, archivedAt: true } });
      if (!row) throw notFound();
      if (row.archivedAt) throw fail("VALIDATION", "ผู้ติดต่อที่เลือกถูกเก็บถาวรแล้ว — กู้คืนผู้ติดต่อก่อน หรือเลือกคนอื่น");
      return { parentId, partyId: row.partyId };
    }
    case "COMPANY": {
      const row = await db.crmCompany.findFirst({ where: { ...base, systemId: ctx.systemId }, select: { partyId: true, archivedAt: true } });
      if (!row) throw notFound();
      if (row.archivedAt) throw fail("VALIDATION", "บริษัทที่เลือกถูกเก็บถาวรแล้ว — กู้คืนบริษัทก่อน หรือเลือกบริษัทอื่น");
      return { parentId, partyId: row.partyId };
    }
    case "DEAL": {
      const row = await db.crmDeal.findFirst({ where: { ...base, systemId: ctx.systemId }, select: { contact: { select: { partyId: true } } } });
      if (!row) throw notFound();
      return { parentId, partyId: row.contact?.partyId ?? null };
    }
    case "CUSTOMER":
    default: {
      const row = await db.customer.findFirst({ where: base, select: { partyId: true, status: true } });
      if (!row) throw fail("VALIDATION", "ไม่พบสมาชิกที่เลือกในร้านนี้ — เลือกใหม่จากรายการ");
      // สมาชิกที่ถูกรวมเข้าคนอื่น/ปิดบัญชีแล้ว ไม่ใช่เจ้าของรายการใหม่ได้ (รายการจะค้างกับตัวตนที่ไม่มีใครเปิดดู)
      if (row.status === "MERGED") throw fail("VALIDATION", "สมาชิกที่เลือกถูกรวมเข้ากับสมาชิกอีกคนแล้ว — เลือกสมาชิกคนที่รวมไว้แทน");
      if (row.status === "CLOSED") throw fail("VALIDATION", "สมาชิกที่เลือกปิดบัญชีแล้ว — เลือกสมาชิกคนอื่น");
      return { parentId, partyId: row.partyId };
    }
  }
}

/** แม่ที่ต้องเป็นของระบบนี้ (ใช้กับ tabsFor) — ไม่พบ = NOT_FOUND */
async function assertParentVisible(ctx: ObjectsCtx, parentType: ObjectParentType, parentId: unknown): Promise<string> {
  try {
    return await resolveParentForRead(ctx, parentType, parentId);
  } catch (e) {
    if (e instanceof ObjectsError) throw fail("NOT_FOUND", `ไม่พบ${OBJECT_PARENT_LABEL[parentType]}นี้ในระบบ CRM ที่เปิดอยู่`);
    throw e;
  }
}

async function resolveParentForRead(ctx: ObjectsCtx, parentType: ObjectParentType, rawParentId: unknown): Promise<string> {
  const parentId = str(rawParentId);
  if (!parentId || parentType === "NONE") throw fail("VALIDATION", "ต้องระบุเจ้าของ");
  const base = { id: parentId, tenantId: ctx.tenantId };
  const n =
    parentType === "CONTACT"
      ? await prisma.crmContact.count({ where: { ...base, systemId: ctx.systemId } })
      : parentType === "COMPANY"
        ? await prisma.crmCompany.count({ where: { ...base, systemId: ctx.systemId } })
        : parentType === "DEAL"
          ? await prisma.crmDeal.count({ where: { ...base, systemId: ctx.systemId } })
          : await prisma.customer.count({ where: base });
  if (n === 0) throw fail("VALIDATION", "ไม่พบเจ้าของ");
  return parentId;
}

// ───────────────────────── event (ใน tx เดียวกับการเขียน) ─────────────────────────

// AUDIT-CLASS X8: payload = id/key ล้วน (COMMON) — ห้ามชื่อรายการ/ค่าฟิลด์/ชื่อ-เบอร์-อีเมลของแม่ (ชื่อรายการอาจเป็นชื่อเด็ก/ทะเบียนรถ)
function recordPayload(rec: Pick<CustomRecord, "id" | "parentType" | "parentId" | "partyId" | "unitId">, obj: CustomObject, extra: Record<string, unknown> = {}) {
  return {
    recordId: rec.id,
    objectId: obj.id,
    objectKey: obj.key,
    parentType: rec.parentType,
    parentId: rec.parentId,
    partyId: rec.partyId,
    ...extra,
  };
}

/**
 * AUDIT-CLASS X4: idempotencyKey `custom.record.<type>#<recordId>#<seq>` (R-C.8) — seq ต่างกันทุกการเขียน
 *   (คีย์ที่มีแค่ recordId จะกลืนทุกการแก้ไขหลังครั้งแรก) · emit ใน tx ของการเขียน ⇒ เขียนไม่สำเร็จ = ไม่มี event
 *   และ event เขียนไม่ได้ = การเขียนทั้งก้อนถูกยกเลิก
 */
async function emitRecordEvent(
  tx: Tx,
  ctx: ObjectsCtx,
  kind: keyof typeof EVENT_TYPES,
  rec: Pick<CustomRecord, "id" | "parentType" | "parentId" | "partyId" | "unitId">,
  obj: CustomObject,
  seq: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const type = EVENT_TYPES[kind];
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    unitId: rec.unitId ?? null,
    type,
    idempotencyKey: `${type}#${rec.id}#${seq}`,
    payload: recordPayload(rec, obj, extra),
  });
}

const newSeq = () => randomUUID().replace(/-/g, "");

// ───────────────────────── คำเตือนประสิทธิภาพ (ไม่มีเพดาน — มติ C8) ─────────────────────────

/** > OBJECT_WARN_AT วัตถุต่อระบบ CRM (มติผู้คุมงาน ข้อ 2: นับต่อระบบ) → OpsEvent WARN (ทุก 10 วัตถุที่เพิ่ม ไม่ถล่ม log) */
async function warnObjectCount(ctx: ObjectsCtx): Promise<void> {
  const n = await prisma.customObject.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null } });
  if (n > OBJECT_WARN_AT && (n - OBJECT_WARN_AT - 1) % 10 === 0) {
    await logOps("WARN", "crm.objects", `ระบบ CRM นี้มีวัตถุกำหนดเอง ${n} วัตถุ (เกิน ${OBJECT_WARN_AT}) — ยังใช้งานได้ปกติ แต่หน้ารายการและตัวกรองอาจช้าลง`, {
      tenantId: ctx.tenantId,
      detail: `systemId=${ctx.systemId} objects=${n}`,
    });
  }
}

/** > RECORD_WARN_AT รายการต่อวัตถุ → OpsEvent WARN (ครั้งแรกที่ข้าม แล้วทุก 10,000 รายการ) */
async function warnRecordCount(ctx: ObjectsCtx, obj: CustomObject, count: number): Promise<void> {
  if (count > RECORD_WARN_AT && (count - RECORD_WARN_AT - 1) % 10_000 === 0) {
    await logOps("WARN", "crm.objects", `วัตถุ "${obj.key}" มีรายการ ${count.toLocaleString("th-TH")} รายการ (เกิน ${RECORD_WARN_AT.toLocaleString("th-TH")}) — ยังรับรายการใหม่ได้ แต่ค้นหา/ส่งออกอาจช้าลง`, {
      tenantId: ctx.tenantId,
      detail: `systemId=${ctx.systemId} objectId=${obj.id} records=${count}`,
    });
  }
}

// ═════════════════════════ วัตถุ ═════════════════════════

export async function create(ctx: ObjectsCtx, actor: MemberActor, input: CreateObjectInput): Promise<ObjectDto> {
  assertActor(actor);
  assertDesigner(actor);
  await resolveSystem(ctx);
  const key = normalizeObjectKey(input?.key);
  const label = normalizeText(input?.label, "ชื่อวัตถุ");
  const labelPlural = input?.labelPlural === undefined || input?.labelPlural === null ? label : normalizeText(input.labelPlural, "ชื่อเรียกหลายรายการ");
  const parentType = normalizeParentType(input?.parentType);
  const titleFieldKey = normalizeTitleFieldKey(input?.titleFieldKey);
  const templateKey = str(input?.templateKey);
  const template = templateKey ? OBJECT_TEMPLATES.find((t) => t.key === templateKey) : null;
  if (templateKey && !template) {
    throw fail("VALIDATION", `ไม่รู้จักเทมเพลตวัตถุ "${templateKey}" — เลือกได้ ${OBJECT_TEMPLATES.map((t) => t.key).join(" / ")}`);
  }
  if (template && !template.sections.some((s) => s.fields.some((f) => f.key === titleFieldKey))) {
    throw fail("VALIDATION", `ฟิลด์ชื่อรายการ "${titleFieldKey}" ไม่มีในเทมเพลต "${template.label}" — เลือกฟิลด์ข้อความของเทมเพลตนี้`);
  }
  const dupMsg = `มีวัตถุที่ใช้ชื่ออ้างอิง "${key}" อยู่แล้วในระบบ CRM นี้ — ตั้งชื่ออ้างอิงอื่น`;
  const dup = await prisma.customObject.findFirst({ where: { systemId: ctx.systemId, key }, select: { id: true } });
  if (dup) throw fail("DUPLICATE", dupMsg);

  let row: CustomObject;
  try {
    row = await prisma.$transaction(async (tx) => {
      const last = await tx.customObject.aggregate({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, _max: { sortOrder: true } });
      const obj = await tx.customObject.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          key,
          label,
          labelPlural,
          icon: str(input?.icon),
          parentType: parentType as CustomParent,
          titleFieldKey,
          showAsTab: input?.showAsTab ?? true,
          portalVisible: input?.portalVisible ?? false,
          unitScoped: input?.unitScoped ?? false,
          templateKey: template?.key ?? null,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      if (template) {
        // ฟิลด์ของเทมเพลตสร้างผ่าน engine ตัวเดียว (ตรวจชุดเดียวกับที่ผู้ใช้สร้างเอง) ใน tx เดียวกับวัตถุ — ครึ่ง ๆ กลาง ๆ ไม่มี
        const fc = fctx(ctx, key, actor);
        for (const section of template.sections) {
          const sec = await (await engine()).createSection(fc, { key: section.key, label: section.label }, tx);
          for (const f of section.fields) {
            await (await engine()).createField(
              fc,
              {
                sectionId: sec.id,
                key: f.key,
                label: f.label,
                type: f.type,
                options: f.options ?? {},
                filterable: f.filterable ?? false,
                showInList: f.showInList ?? false,
                trackHistory: f.trackHistory ?? false,
              },
              tx,
            );
          }
        }
      }
      return obj;
    });
  } catch (e) {
    // AUDIT-CLASS X3: สร้าง key เดียวกันพร้อมกัน — unique (systemId, key) ตัดสิน ผู้แพ้ได้ข้อความไทย ไม่ใช่ P2002 ดิบ
    if (isUniqueViolation(e)) throw fail("DUPLICATE", dupMsg);
    throw engineError(e);
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "crm.object.create",
    targetType: "CustomObject",
    targetId: row.id,
    after: { systemId: ctx.systemId, key, parentType, titleFieldKey, templateKey: row.templateKey },
  });
  await warnObjectCount(ctx);
  return objectDto(row);
}

export async function update(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, patch: UpdateObjectInput): Promise<ObjectDto> {
  assertActor(actor);
  assertDesigner(actor);
  await resolveSystem(ctx);
  const current = await findObject(ctx, objectKey, prisma);
  const p = patch ?? {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  let row: CustomObject;
  try {
    row = await prisma.$transaction(async (tx) => {
      // ล็อกแถววัตถุ: การตรวจ "มีรายการหรือยัง" กับการเปลี่ยน key/parentType ต้องเห็นโลกเดียวกัน
      await tx.$queryRaw`SELECT id FROM "CustomObject" WHERE id = ${current.id} FOR UPDATE`;
      const obj = await findObject(ctx, current.key, tx);
      const data: Prisma.CustomObjectUncheckedUpdateInput = {};
      const hasRecords = async () => (await tx.customRecord.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectId: obj.id } })) > 0;

      if (p.key !== undefined) {
        const key = normalizeObjectKey(p.key);
        if (key !== obj.key) {
          // §11.2: key เปลี่ยนไม่ได้หลังมีรายการ (URL/ตัวกรอง/กฎที่อ้าง key จะพัง)
          if (await hasRecords()) throw fail("VALIDATION", `วัตถุ "${obj.label}" มีรายการแล้ว จึงเปลี่ยนชื่ออ้างอิง (key) ไม่ได้ — เปลี่ยนได้เฉพาะชื่อที่แสดง`);
          // ฟิลด์ LOOKUP ในระบบนี้ที่ชี้วัตถุนี้ด้วย key เดิม ⇒ เปลี่ยน key แล้วจะชี้ไปที่ว่าง — ปฏิเสธจนกว่าจะแก้ฟิลด์นั้นก่อน
          const refs = await tx.memberField.findMany({
            where: { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "LOOKUP", options: { path: ["objectKey"], equals: obj.key } },
            select: { label: true, objectKey: true },
            take: 5,
          });
          if (refs.length > 0) {
            const owners = await tx.customObject.findMany({ where: { systemId: ctx.systemId, key: { in: refs.map((r) => r.objectKey) } }, select: { key: true, label: true } });
            const nameOf = (k: string) => owners.find((o) => o.key === k)?.label ?? k;
            throw fail(
              "VALIDATION",
              `เปลี่ยนชื่ออ้างอิงไม่ได้: ฟิลด์ ${refs.map((r) => `"${r.label}" ของ${nameOf(r.objectKey)}`).join(", ")} เชื่อมมาที่วัตถุนี้ด้วยชื่อเดิม — เปลี่ยนปลายทางของฟิลด์นั้นก่อน (ฟิลด์ที่เก็บเข้าคลังก็นับ เพราะกู้คืนได้)`,
            );
          }
          const taken = await tx.customObject.findFirst({ where: { systemId: ctx.systemId, key }, select: { id: true } });
          if (taken) throw fail("DUPLICATE", `มีวัตถุที่ใช้ชื่ออ้างอิง "${key}" อยู่แล้วในระบบ CRM นี้ — ตั้งชื่ออ้างอิงอื่น`);
          // ฟิลด์/ส่วนของวัตถุผูกด้วย objectKey (นิยามของ engine) ⇒ ย้ายตาม key ใหม่ใน tx เดียวกัน (มติผู้คุมงาน ข้อ 4 · S9.1)
          //   ยังไม่มีรายการ ⇒ ไม่มีแถวค่าให้ย้าย (ค่าผูก fieldId ไม่ใช่ key อยู่แล้ว)
          await tx.memberSection.updateMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: obj.key }, data: { objectKey: key } });
          await tx.memberField.updateMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: obj.key }, data: { objectKey: key } });
          data.key = key;
          before.key = obj.key;
          after.key = key;
        }
      }
      if (p.parentType !== undefined) {
        const parentType = normalizeParentType(p.parentType);
        if (parentType !== obj.parentType) {
          if (await hasRecords()) {
            throw fail("VALIDATION", `วัตถุ "${obj.label}" มีรายการแล้ว จึงเปลี่ยนชนิดเจ้าของรายการไม่ได้ (รายการเดิมจะชี้ไปเจ้าของผิดชนิด)`);
          }
          data.parentType = parentType as CustomParent;
          before.parentType = obj.parentType;
          after.parentType = parentType;
        }
      }
      if (p.label !== undefined) data.label = normalizeText(p.label, "ชื่อวัตถุ");
      if (p.labelPlural !== undefined) data.labelPlural = normalizeText(p.labelPlural, "ชื่อเรียกหลายรายการ");
      if (p.icon !== undefined) data.icon = str(p.icon);
      if (p.titleFieldKey !== undefined) {
        const tfk = normalizeTitleFieldKey(p.titleFieldKey);
        // AUDIT-CLASS X8 (D8): ชื่อรายการห้ามมาจากฟิลด์อ่อนไหว
        const layout = await (await engine()).listLayout(fctx(ctx, obj.key, actor), { includeArchived: true }, tx);
        if (isSensitiveField(layout, tfk)) {
          throw fail("VALIDATION", `ฟิลด์ "${tfk}" เป็นข้อมูลอ่อนไหว จึงใช้เป็นชื่อรายการไม่ได้ (ชื่อรายการแสดงให้ทุกคนเห็น) — เลือกฟิลด์อื่น`);
        }
        data.titleFieldKey = tfk;
      }
      if (p.showAsTab !== undefined) data.showAsTab = !!p.showAsTab;
      if (p.portalVisible !== undefined) data.portalVisible = !!p.portalVisible;
      if (p.unitScoped !== undefined) data.unitScoped = !!p.unitScoped;
      for (const k of ["label", "labelPlural", "icon", "titleFieldKey", "showAsTab", "portalVisible", "unitScoped"] as const) {
        if (k in data) {
          before[k] = obj[k];
          after[k] = data[k];
        }
      }
      if (Object.keys(data).length === 0) return obj;
      return tx.customObject.update({ where: { id: obj.id }, data });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw fail("DUPLICATE", "ชื่ออ้างอิงนี้ถูกใช้ไปแล้วในระบบ CRM นี้ — ตั้งชื่ออ้างอิงอื่น");
    throw engineError(e);
  }
  if (Object.keys(after).length > 0) {
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.object.update", targetType: "CustomObject", targetId: row.id, before, after });
  }
  return objectDto(row);
}

/**
 * เก็บถาวรวัตถุ = ซ่อนทั้งแท็บ/หน้ารายการ/การเพิ่มรายการ (กู้ได้) · รายการ **ถูกเก็บไว้ครบ** (archive ≠ delete)
 * AUDIT-CLASS X9: วัตถุที่มีรายการ ⇒ ต้องพิมพ์ key ยืนยัน + เหตุผล ≥ 5 ตัวอักษร (มติผู้คุมงาน ข้อ 3) · วัตถุว่างเก็บได้เลย
 */
export async function archive(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, opts: { confirmKey?: string | null; reason?: string | null } = {}): Promise<ObjectDto> {
  assertActor(actor);
  assertDesigner(actor);
  await resolveSystem(ctx);
  const current = await findObject(ctx, objectKey, prisma, { includeArchived: true });
  if (current.archivedAt) return objectDto(current);
  const reason = normalizeReason(opts?.reason);
  const out = await prisma.$transaction(async (tx) => {
    // ล็อกแถววัตถุก่อนนับ: รายการที่กำลังถูกสร้างพร้อมกันต้องรอ (ตัวนับของมันแตะแถวนี้) — "ว่าง" ที่นับได้จึงว่างจริง
    await tx.$queryRaw`SELECT id FROM "CustomObject" WHERE id = ${current.id} FOR UPDATE`;
    const live = await tx.customRecord.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectId: current.id, archivedAt: null } });
    if (live > 0) {
      if (str(opts?.confirmKey) !== current.key) {
        throw fail("CONFIRM_REQUIRED", `วัตถุ "${current.label}" มีรายการอยู่ ${live} รายการ — พิมพ์ชื่ออ้างอิง "${current.key}" เพื่อยืนยันการเก็บถาวร (รายการไม่ถูกลบ กู้คืนได้)`);
      }
      if (!reason) throw fail("CONFIRM_REQUIRED", `ใส่เหตุผลของการเก็บถาวรอย่างน้อย ${OBJECT_REASON_MIN} ตัวอักษร เพื่อให้ทีมย้อนดูได้ว่าทำไม`);
    }
    const res = await tx.customObject.updateMany({ where: { id: current.id, tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, data: { archivedAt: new Date() } });
    return { live, changed: res.count > 0 };
  });
  const row = await findObject(ctx, current.key, prisma, { includeArchived: true });
  if (out.changed) {
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.actorUserId,
      action: "crm.object.archive",
      targetType: "CustomObject",
      targetId: current.id,
      before: { archivedAt: null, liveRecords: out.live },
      after: { archivedAt: row.archivedAt, reason: reason ?? null },
    });
  }
  return objectDto(row);
}

/** กู้คืนวัตถุ — 🔴 ปลดเก็บถาวรแถววัตถุ **ก่อน** อ่านอะไรจาก engine (engine มองวัตถุที่เก็บถาวรว่า "ไม่พบ") */
export async function restore(ctx: ObjectsCtx, actor: MemberActor, objectKey: string): Promise<ObjectDto> {
  assertActor(actor);
  assertDesigner(actor);
  await resolveSystem(ctx);
  const obj = await findObject(ctx, objectKey, prisma, { includeArchived: true });
  const res = await prisma.customObject.updateMany({ where: { id: obj.id, tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: { not: null } }, data: { archivedAt: null } });
  if (res.count > 0) {
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.object.restore", targetType: "CustomObject", targetId: obj.id, before: { archivedAt: obj.archivedAt }, after: { archivedAt: null } });
  }
  return objectDto(await findObject(ctx, obj.key, prisma));
}

/** เรียงวัตถุ: key ที่ส่งมาขึ้นก่อนตามลำดับ ที่เหลือต่อท้ายตามลำดับเดิม */
export async function reorder(ctx: ObjectsCtx, actor: MemberActor, objectKeys: string[]): Promise<{ ok: true }> {
  assertActor(actor);
  assertDesigner(actor);
  await resolveSystem(ctx);
  if (!Array.isArray(objectKeys)) throw fail("VALIDATION", "ส่งรายการชื่ออ้างอิงของวัตถุตามลำดับที่ต้องการ");
  await prisma.$transaction(async (tx) => {
    const rows = await tx.customObject.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, key: true } });
    const byKey = new Map(rows.map((r) => [r.key, r.id]));
    const unknown = objectKeys.filter((k) => !byKey.has(k));
    if (unknown.length > 0) throw fail("NOT_FOUND", `ไม่พบวัตถุ ${unknown.map((k) => `"${k}"`).join(", ")} ในระบบ CRM นี้ — รีเฟรชหน้าแล้วลองใหม่`);
    const order = [...new Set(objectKeys)];
    for (const r of rows) if (!order.includes(r.key)) order.push(r.key);
    for (const [i, k] of order.entries()) {
      await tx.customObject.update({ where: { id: byKey.get(k) as string }, data: { sortOrder: i } });
    }
  });
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.object.reorder", targetType: "AppSystem", targetId: ctx.systemId, after: { order: objectKeys } });
  return { ok: true };
}

export async function list(ctx: ObjectsCtx, actor: MemberActor, opts: { includeArchived?: boolean } = {}): Promise<ObjectDto[]> {
  assertActor(actor);
  await resolveSystem(ctx);
  const rows = await prisma.customObject.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...(opts?.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(objectDto);
}

/** วัตถุ 1 ตัว (รวมที่เก็บถาวร — หน้าตั้งค่าต้องเปิดดู/กู้คืนได้) */
export async function get(ctx: ObjectsCtx, actor: MemberActor, objectKey: string): Promise<ObjectDto> {
  assertActor(actor);
  await resolveSystem(ctx);
  return objectDto(await findObject(ctx, objectKey, prisma, { includeArchived: true }));
}

/** ป้ายเตือนหน้าตั้งค่า (คำนวณสด — ไม่มีสถานะค้างใน settings ให้เพี้ยน) */
export async function warnings(ctx: ObjectsCtx, actor: MemberActor): Promise<ObjectWarnings> {
  assertActor(actor);
  await resolveSystem(ctx);
  const rows = await prisma.customObject.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null },
    select: { key: true, recordCount: true },
  });
  return {
    objectCount: rows.length,
    tooManyObjects: rows.length > OBJECT_WARN_AT,
    bigObjects: rows.filter((r) => r.recordCount > RECORD_WARN_AT).map((r) => r.key),
  };
}

// ═════════════════════════ รายการ ═════════════════════════

async function findRecord(ctx: ObjectsCtx, obj: CustomObject, recordId: unknown, db: Db): Promise<CustomRecord> {
  const id = str(recordId);
  // AUDIT-CLASS X1: รายการของวัตถุนี้ในระบบ CRM นี้เท่านั้น — ของระบบอื่น/ร้านอื่น (key เดียวกัน) = ไม่พบ (ไม่ echo ชื่อรายการ)
  const row = id ? await db.customRecord.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId, objectId: obj.id } }) : null;
  if (!row) throw fail("NOT_FOUND", `ไม่พบรายการนี้ใน${obj.label}ของระบบ CRM นี้ — รีเฟรชหน้าแล้วลองใหม่`);
  return row;
}

function recordDto(obj: CustomObject, row: CustomRecord, values: Record<string, ObjectValue>): RecordDto {
  return {
    id: row.id,
    objectId: obj.id,
    objectKey: obj.key,
    title: row.title,
    parentType: row.parentType as ObjectParentType,
    parentId: row.parentId,
    partyId: row.partyId,
    unitId: row.unitId,
    ownerUserId: row.ownerUserId,
    status: row.status,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    values,
  };
}

async function valuesOf(ctx: ObjectsCtx, obj: CustomObject, actor: MemberActor, ids: string[], db?: Db): Promise<Record<string, Record<string, ObjectValue>>> {
  if (ids.length === 0) return {};
  return viaEngine(async () => (await engine()).getFieldValues(fctx(ctx, obj.key, actor), ids, db));
}

type CreateCore = { obj: CustomObject; row: CustomRecord; count: number };

/** แกนของการสร้างรายการ (ใช้ร่วม create + import) — ไม่เขียน audit */
async function createRecordCore(ctx: ObjectsCtx, actor: MemberActor, obj: CustomObject, input: CreateRecordInput, via: "STAFF" | "IMPORT"): Promise<CreateCore> {
  const parent = await resolveParent(ctx, obj.parentType as ObjectParentType, input?.parentId, prisma);
  const unitId = str(input?.unitId);
  if (unitId) {
    const unit = await prisma.businessUnit.count({ where: { id: unitId, tenantId: ctx.tenantId } });
    if (unit === 0) throw fail("VALIDATION", "ไม่พบสาขาที่เลือกในร้านนี้ — เลือกใหม่จากรายการ");
  }
  if (!coversUnit(obj, actor, unitId)) throw fail("VALIDATION", "สาขาที่เลือกอยู่นอกสาขาที่คุณดูแล — เลือกสาขาของคุณ");
  const ownerUserId = str(input?.ownerUserId);
  if (ownerUserId) {
    const m = await prisma.membership.count({ where: { tenantId: ctx.tenantId, userId: ownerUserId } });
    if (m === 0) throw fail("VALIDATION", "ผู้ดูแลที่เลือกไม่ได้อยู่ในร้านนี้ — เลือกใหม่จากรายชื่อทีม");
  }
  const explicitTitle = input?.title === undefined || input?.title === null ? null : titleOf(input.title);
  const rawValues: Record<string, unknown> = { ...(input?.values ?? {}) };
  const fc = fctx(ctx, obj.key, actor);

  try {
    return await prisma.$transaction(async (tx) => {
      // ฟิลด์ที่ต้องกรอก + ค่าเริ่มต้น (engine ตรวจเฉพาะ key ที่ส่งมา — การ "ไม่ส่งเลย" ต้องตรวจที่นี่)
      const layout = await (await engine()).listLayout(fc, {}, tx);
      for (const section of layout.sections) {
        for (const f of section.fields) {
          if (f.isSystem) continue;
          const given = rawValues[f.key];
          const blank = given === undefined || given === null || (typeof given === "string" && given.trim() === "") || (Array.isArray(given) && given.length === 0);
          if (blank && f.defaultValue !== null && f.defaultValue !== undefined && given === undefined) rawValues[f.key] = f.defaultValue;
          else if (blank && f.required) throw fail("VALIDATION", `ฟิลด์ "${f.label}" เป็นข้อมูลที่ต้องกรอก — ใส่ค่าก่อนบันทึก`);
        }
      }
      // AUDIT-CLASS X8 (D8): ฟิลด์ชื่อรายการที่อ่อนไหว ⇒ ใช้ชื่อสำรอง ไม่เอาค่ามาเป็นชื่อ (ชื่อรายการโชว์ทุกที่ ไม่ผ่านด่าน D8)
      const titleSensitive = isSensitiveField(layout, obj.titleFieldKey);
      const provisional = explicitTitle ?? (titleSensitive ? null : titleOf(rawValues[obj.titleFieldKey])) ?? fallbackTitle(obj);
      const rec = await tx.customRecord.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          objectId: obj.id,
          parentType: obj.parentType,
          parentId: parent.parentId,
          partyId: parent.partyId,
          title: provisional,
          unitId,
          ownerUserId: ownerUserId ?? ctx.actorUserId ?? null,
          createdById: ctx.actorUserId,
        },
      });
      if (Object.keys(rawValues).length > 0) {
        await (await engine()).setFieldValues(fc, rec.id, rawValues, { via, byUserId: ctx.actorUserId }, tx);
      }
      // AUDIT-CLASS X3: ตัวนับด้วยคำสั่งเดียว (ห้ามอ่าน → บวกในแอป → เขียน) · where ผูก "ยังไม่เก็บถาวร + ชนิดแม่เดิม"
      //   ⇒ วัตถุถูกเก็บถาวร/เปลี่ยนชนิดแม่ระหว่างทาง = P2025 → ทั้งก้อนถูกยกเลิก (ไม่มีรายการหลงเข้าวัตถุที่ปิดแล้ว)
      const counted = await tx.customObject.update({
        where: { id: obj.id, archivedAt: null, parentType: obj.parentType },
        data: { recordCount: { increment: 1 } },
        select: { recordCount: true },
      });
      await emitRecordEvent(tx, ctx, "created", rec, obj, "1");
      return { obj, row: rec, count: counted.recordCount };
    });
  } catch (e) {
    if (isNotMatched(e)) throw fail("NOT_FOUND", `วัตถุ "${obj.label}" ถูกเก็บถาวรหรือเปลี่ยนการตั้งค่าไประหว่างบันทึก — รีเฟรชหน้าแล้วลองใหม่`);
    throw engineError(e);
  }
}

async function createRecord(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, input: CreateRecordInput): Promise<RecordDto> {
  assertActor(actor);
  assertCanWrite(actor);
  await resolveSystem(ctx);
  const obj = await findObject(ctx, objectKey, prisma);
  const { row, count } = await createRecordCore(ctx, actor, obj, input, "STAFF");
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "crm.record.create",
    targetType: "CustomRecord",
    targetId: row.id,
    after: { objectId: obj.id, objectKey: obj.key, parentType: row.parentType, parentId: row.parentId, fields: Object.keys(input?.values ?? {}) },
  });
  await warnRecordCount(ctx, obj, count);
  return getRecord(ctx, actor, obj.key, row.id);
}

async function updateRecord(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, recordId: string, patch: UpdateRecordInput): Promise<RecordDto> {
  assertActor(actor);
  assertCanWrite(actor);
  await resolveSystem(ctx);
  const obj = await findObject(ctx, objectKey, prisma);
  const current = await findRecord(ctx, obj, recordId, prisma);
  if (!coversUnit(obj, actor, current.unitId)) throw fail("NOT_FOUND", `ไม่พบรายการนี้ใน${obj.label}ของระบบ CRM นี้ — รีเฟรชหน้าแล้วลองใหม่`);
  if (current.archivedAt) throw fail("VALIDATION", "รายการนี้ถูกเก็บถาวรแล้ว จึงแก้ไขไม่ได้");
  const values: Record<string, unknown> = { ...(patch?.values ?? {}) };
  const explicitTitle = patch?.title === undefined || patch?.title === null ? null : titleOf(patch.title);
  const fc = fctx(ctx, obj.key, actor);
  let changed: string[] = [];
  let titleChanged = false;
  try {
    await prisma.$transaction(async (tx) => {
      const rec = await findRecord(ctx, obj, current.id, tx);
      if (rec.archivedAt) throw fail("VALIDATION", "รายการนี้ถูกเก็บถาวรแล้ว จึงแก้ไขไม่ได้");
      if (Object.keys(values).length > 0) {
        changed = (await (await engine()).setFieldValues(fc, rec.id, values, { via: "STAFF", byUserId: ctx.actorUserId }, tx)).changed;
      }
      // ชื่อรายการตาม titleFieldKey (ส่งชื่อมาเอง = ชื่อนั้นชนะ) · ฟิลด์อื่นเปลี่ยน = ชื่อเดิม
      let title = rec.title;
      if (explicitTitle) title = explicitTitle;
      else if (changed.includes(obj.titleFieldKey)) {
        // AUDIT-CLASS X8 (D8): ฟิลด์ชื่อที่ (กลายเป็น) อ่อนไหว ⇒ ชื่อสำรอง
        const titleSensitive = isSensitiveField(await (await engine()).listLayout(fc, { includeArchived: true }, tx), obj.titleFieldKey);
        title = (titleSensitive ? null : titleOf(values[obj.titleFieldKey])) ?? fallbackTitle(obj);
      }
      titleChanged = title !== rec.title;
      if (!titleChanged && changed.length === 0) return;
      const updated = await tx.customRecord.update({ where: { id: rec.id }, data: { title } });
      await emitRecordEvent(tx, ctx, "updated", updated, obj, newSeq(), { changed });
    });
  } catch (e) {
    throw engineError(e);
  }
  if (changed.length > 0 || titleChanged) {
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.actorUserId,
      action: "crm.record.update",
      targetType: "CustomRecord",
      targetId: current.id,
      after: { objectKey: obj.key, changed, titleChanged },
    });
  }
  return getRecord(ctx, actor, obj.key, current.id);
}

/**
 * เก็บถาวร 1 รายการใน tx ที่ให้มา — คืน true ถ้ารอบนี้เป็นคนเก็บจริง
 * AUDIT-CLASS X3: เปลี่ยนสถานะแบบมีเงื่อนไข (archivedAt IS NULL) ⇒ เก็บซ้ำ/พร้อมกันหลายทาง = ลดตัวนับครั้งเดียว
 */
async function archiveInTx(tx: Tx, ctx: ObjectsCtx, obj: CustomObject, rec: CustomRecord): Promise<boolean> {
  const at = new Date();
  const res = await tx.customRecord.updateMany({
    where: { id: rec.id, tenantId: ctx.tenantId, systemId: ctx.systemId, objectId: obj.id, archivedAt: null },
    data: { archivedAt: at },
  });
  if (res.count === 0) return false;
  await emitRecordEvent(tx, ctx, "archived", rec, obj, String(at.getTime()));
  return true;
}

async function archiveRecord(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, recordId: string): Promise<RecordDto> {
  assertActor(actor);
  assertCanWrite(actor);
  await resolveSystem(ctx);
  const obj = await findObject(ctx, objectKey, prisma);
  const current = await findRecord(ctx, obj, recordId, prisma);
  if (!coversUnit(obj, actor, current.unitId)) throw fail("NOT_FOUND", `ไม่พบรายการนี้ใน${obj.label}ของระบบ CRM นี้ — รีเฟรชหน้าแล้วลองใหม่`);
  const archived = await prisma.$transaction(async (tx) => {
    const done = await archiveInTx(tx, ctx, obj, current);
    // AUDIT-CLASS X3: ลดตัวนับด้วยคำสั่งเดียว เฉพาะรอบที่เก็บจริง
    if (done) await tx.customObject.update({ where: { id: obj.id }, data: { recordCount: { decrement: 1 } } });
    return done;
  });
  if (archived) {
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.record.archive", targetType: "CustomRecord", targetId: current.id, after: { objectKey: obj.key } });
  }
  return getRecord(ctx, actor, obj.key, current.id);
}

async function getRecord(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, recordId: string): Promise<RecordDto> {
  assertActor(actor);
  await resolveSystem(ctx);
  const obj = await findObject(ctx, objectKey, prisma);
  const row = await findRecord(ctx, obj, recordId, prisma);
  if (!coversUnit(obj, actor, row.unitId)) throw fail("NOT_FOUND", `ไม่พบรายการนี้ใน${obj.label}ของระบบ CRM นี้ — รีเฟรชหน้าแล้วลองใหม่`);
  const values = await valuesOf(ctx, obj, actor, [row.id]);
  return recordDto(obj, row, values[row.id] ?? {});
}

const SORTS: Record<NonNullable<ListRecordsInput["sort"]>, Prisma.CustomRecordOrderByWithRelationInput[]> = {
  title: [{ title: "asc" }, { id: "asc" }],
  "-title": [{ title: "desc" }, { id: "desc" }],
  createdAt: [{ createdAt: "asc" }, { id: "asc" }],
  "-createdAt": [{ createdAt: "desc" }, { id: "desc" }],
  updatedAt: [{ updatedAt: "asc" }, { id: "asc" }],
  "-updatedAt": [{ updatedAt: "desc" }, { id: "desc" }],
};

async function recordsWhere(ctx: ObjectsCtx, actor: MemberActor, obj: CustomObject, input: ListRecordsInput): Promise<Prisma.CustomRecordWhereInput> {
  const AND: Prisma.CustomRecordWhereInput[] = [
    // AUDIT-CLASS X1: ขอบเขตร้าน + ระบบ CRM + วัตถุ ทุกครั้ง (C1.7 จะเติม visibleWhere ผ่าน crm/where.ts)
    { tenantId: ctx.tenantId, systemId: ctx.systemId, objectId: obj.id },
    unitWhere(obj, actor),
  ];
  if (!input?.includeArchived) AND.push({ archivedAt: null });
  const parentId = str(input?.parentId);
  if (parentId) AND.push({ parentId });
  const q = str(input?.q);
  if (q) AND.push({ title: { contains: q.slice(0, 200), mode: "insensitive" } });
  const filters = input?.f ?? {};
  if (Object.keys(filters).length > 0) {
    // ตัวกรอง f.{key} = engine ตัวเดียว · key ที่วัตถุไม่มี = VALIDATION (ไม่มีทาง "คืนทุกแถว" เพราะตัวกรองหาย)
    const frag = await viaEngine(async () => (await engine()).fieldFilterWhere({ ...fctx(ctx, obj.key, actor), objectKey: obj.key }, filters));
    AND.push(frag as Prisma.CustomRecordWhereInput);
  }
  return { AND };
}

async function listRecords(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, input: ListRecordsInput = {}): Promise<{ items: RecordDto[]; total: number; page: number; pageSize: number }> {
  assertActor(actor);
  await resolveSystem(ctx);
  const obj = await findObject(ctx, objectKey, prisma);
  const where = await recordsWhere(ctx, actor, obj, input ?? {});
  const pageSize = Math.min(LIST_PAGE_MAX, Math.max(1, Math.floor(Number(input?.pageSize) || 50)));
  const page = Math.max(1, Math.floor(Number(input?.page) || 1));
  const sortKey = input?.sort ?? "-createdAt";
  if (typeof sortKey !== "string" || !Object.hasOwn(SORTS, sortKey)) {
    throw fail("VALIDATION", `เรียงลำดับได้ตาม ${Object.keys(SORTS).join(" / ")} เท่านั้น`);
  }
  const orderBy = SORTS[sortKey];
  const [total, rows] = await Promise.all([
    prisma.customRecord.count({ where }),
    prisma.customRecord.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const values = await valuesOf(ctx, obj, actor, rows.map((r) => r.id));
  return { items: rows.map((r) => recordDto(obj, r, values[r.id] ?? {})), total, page, pageSize };
}

async function moveRecord(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, recordId: string, newParentId: string): Promise<RecordDto> {
  assertActor(actor);
  assertCanWrite(actor);
  await resolveSystem(ctx);
  const obj = await findObject(ctx, objectKey, prisma);
  const current = await findRecord(ctx, obj, recordId, prisma);
  if (!coversUnit(obj, actor, current.unitId)) throw fail("NOT_FOUND", `ไม่พบรายการนี้ใน${obj.label}ของระบบ CRM นี้ — รีเฟรชหน้าแล้วลองใหม่`);
  if (current.archivedAt) throw fail("VALIDATION", "รายการนี้ถูกเก็บถาวรแล้ว จึงย้ายไม่ได้");
  // แม่ใหม่ต้องเป็นชนิดเดียวกับที่วัตถุกำหนด และอยู่ระบบ CRM นี้ (X1) · partyId รับช่วงจากแม่ใหม่
  const parent = await resolveParent(ctx, obj.parentType as ObjectParentType, newParentId, prisma);
  if (parent.parentId === current.parentId && parent.partyId === current.partyId) return getRecord(ctx, actor, obj.key, current.id);
  await prisma.$transaction(async (tx) => {
    const res = await tx.customRecord.updateMany({
      where: { id: current.id, tenantId: ctx.tenantId, systemId: ctx.systemId, objectId: obj.id, archivedAt: null },
      data: { parentId: parent.parentId, partyId: parent.partyId },
    });
    if (res.count === 0) throw fail("VALIDATION", "รายการนี้ถูกเก็บถาวรไประหว่างย้าย — รีเฟรชหน้าแล้วลองใหม่");
    await emitRecordEvent(tx, ctx, "updated", { ...current, parentId: parent.parentId, partyId: parent.partyId }, obj, newSeq(), {
      moved: true,
      fromParentId: current.parentId,
    });
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "crm.record.move",
    targetType: "CustomRecord",
    targetId: current.id,
    before: { parentId: current.parentId, partyId: current.partyId },
    after: { parentId: parent.parentId, partyId: parent.partyId },
  });
  return getRecord(ctx, actor, obj.key, current.id);
}

/**
 * งานกลุ่ม (ตอนนี้: เก็บถาวรหลายรายการ)
 * AUDIT-CLASS X9: ต้องยืนยัน (`confirm: true`) + เหตุผล ≥ 5 ตัวอักษร · เพดาน OBJECT_BULK_MAX id ต่อครั้ง (ตรวจก่อนแตะอะไร)
 * AUDIT-CLASS X1: id ที่ไม่ใช่รายการของวัตถุนี้ในระบบนี้ (ระบบอื่น/ร้านอื่น/ไม่มีจริง) = ข้าม ไม่แตะ และนับใน `skipped`
 */
async function bulkRecords(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, input: BulkRecordsInput): Promise<{ count: number; skipped: number }> {
  assertActor(actor);
  assertCanWrite(actor);
  await resolveSystem(ctx);
  const obj = await findObject(ctx, objectKey, prisma);
  if (input?.action !== "archive") throw fail("VALIDATION", "งานกลุ่มที่ทำได้ตอนนี้คือ \"เก็บถาวร\" (archive) เท่านั้น");
  const ids = Array.isArray(input?.ids) ? [...new Set(input.ids.filter((x): x is string => typeof x === "string" && x.trim() !== ""))] : [];
  if (ids.length === 0) throw fail("VALIDATION", "เลือกรายการอย่างน้อย 1 รายการก่อนทำงานกลุ่ม");
  if (ids.length > OBJECT_BULK_MAX) {
    throw fail("VALIDATION", `งานกลุ่มทำได้ครั้งละไม่เกิน ${OBJECT_BULK_MAX.toLocaleString("th-TH")} รายการ (เลือกมา ${ids.length.toLocaleString("th-TH")}) — แบ่งทำเป็นหลายรอบ`);
  }
  const reason = normalizeReason(input?.reason);
  if (input?.confirm !== true || !reason) {
    throw fail("CONFIRM_REQUIRED", `ยืนยันการเก็บถาวร ${ids.length} รายการ และใส่เหตุผลอย่างน้อย ${OBJECT_REASON_MIN} ตัวอักษร (รายการไม่ถูกลบ กู้คืนได้)`);
  }
  const rows = await prisma.customRecord.findMany({
    where: { AND: [{ id: { in: ids }, tenantId: ctx.tenantId, systemId: ctx.systemId, objectId: obj.id, archivedAt: null }, unitWhere(obj, actor)] },
    // ลำดับคงที่ ⇒ งานกลุ่มสองชุดที่ทับกันล็อกแถวตามลำดับเดียวกัน (ไม่ deadlock)
    orderBy: { id: "asc" },
  });
  const done: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const rec of rows) if (await archiveInTx(tx, ctx, obj, rec)) done.push(rec.id);
    // AUDIT-CLASS X3: ลดตัวนับด้วยคำสั่งเดียวเท่าจำนวนที่เก็บจริง
    if (done.length > 0) await tx.customObject.update({ where: { id: obj.id }, data: { recordCount: { decrement: done.length } } });
  });
  for (const id of done) {
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.record.archive", targetType: "CustomRecord", targetId: id, after: { objectKey: obj.key, bulk: true, reason } });
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "crm.record.bulk.archive",
    targetType: "CustomObject",
    targetId: obj.id,
    after: { reason, requested: ids.length, archived: done.length, recordIds: done },
  });
  return { count: done.length, skipped: ids.length - done.length };
}

/** ค่าดิบจาก CSV → ชนิดที่ engine รับ (ตรวจจริงเป็นของ engine) · ว่าง = ไม่ส่งค่า */
function coerceCsv(type: string, raw: string): unknown {
  const t = raw.trim();
  if (t === "") return undefined;
  switch (type) {
    case "NUMBER":
    case "MONEY": {
      const n = Number(t.replace(/,/g, ""));
      return Number.isFinite(n) ? n : t;
    }
    case "BOOLEAN": {
      const v = t.toLowerCase();
      if (["true", "1", "yes", "ใช่"].includes(v)) return true;
      if (["false", "0", "no", "ไม่ใช่"].includes(v)) return false;
      return t;
    }
    case "MULTI_SELECT":
      return t.split(",").map((s) => s.trim()).filter(Boolean);
    default:
      return t;
  }
}

/**
 * นำเข้า CSV (แถวหัว = key ของฟิลด์ · คอลัมน์พิเศษ `title` · `parentId`)
 * AUDIT-CLASS X6: เพดานขนาด (ไบต์ UTF-8) และจำนวนแถว ตรวจก่อนแตะฐานข้อมูล — เกิน = ปฏิเสธทั้งไฟล์ ไม่สร้างสักแถว
 *   คอลัมน์ที่วัตถุไม่มี = ปฏิเสธทั้งไฟล์ (ไม่เงียบข้าม — ข้อมูลหายแบบไม่รู้ตัว) · แถวที่ค่าผิด = ข้ามแถวนั้น + บอกเหตุผล
 */
async function importRecords(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, input: { csv: string }): Promise<ImportRecordsResult> {
  assertActor(actor);
  assertCanWrite(actor);
  await resolveSystem(ctx);
  const obj = await findObject(ctx, objectKey, prisma);
  const csv = typeof input?.csv === "string" ? input.csv : "";
  if (!csv.trim()) throw fail("VALIDATION", "ไฟล์ว่าง — ใส่แถวหัว (ชื่ออ้างอิงของฟิลด์) และข้อมูลอย่างน้อย 1 แถว");
  const bytes = Buffer.byteLength(csv, "utf8");
  if (bytes > OBJECT_IMPORT_MAX_BYTES) {
    throw fail("VALIDATION", `ไฟล์ใหญ่ ${(bytes / 1024 / 1024).toFixed(1)} MB เกินเพดาน ${(OBJECT_IMPORT_MAX_BYTES / 1024 / 1024).toFixed(0)} MB ต่อครั้ง — แบ่งไฟล์แล้วนำเข้าทีละส่วน`);
  }
  const table = parseCsv(csv);
  if (table.headers.length === 0 || table.rows.length === 0) throw fail("VALIDATION", "ไม่พบข้อมูลในไฟล์ — ใส่แถวหัว (ชื่ออ้างอิงของฟิลด์) และข้อมูลอย่างน้อย 1 แถว");
  if (table.rows.length > OBJECT_IMPORT_MAX_ROWS) {
    throw fail("VALIDATION", `ไฟล์มี ${table.rows.length.toLocaleString("th-TH")} แถว เกินเพดาน ${OBJECT_IMPORT_MAX_ROWS.toLocaleString("th-TH")} แถวต่อครั้ง — แบ่งไฟล์แล้วนำเข้าทีละส่วน`);
  }
  const layout = await viaEngine(async () => (await engine()).listLayout(fctx(ctx, obj.key, actor), {}));
  const typeOf = new Map<string, string>();
  for (const s of layout.sections) for (const f of s.fields) if (!f.isSystem) typeOf.set(f.key, f.type);
  const unknown = table.headers.filter((h) => h && !typeOf.has(h) && h !== "title" && h !== "parentId");
  if (unknown.length > 0) {
    throw fail("VALIDATION", `คอลัมน์ ${unknown.map((h) => `"${h}"`).join(", ")} ไม่ตรงกับฟิลด์ของ${obj.label} — ตั้งหัวคอลัมน์เป็นชื่ออ้างอิงของฟิลด์ (ส่งออกไฟล์ตัวอย่างดูได้)`);
  }
  const result: ImportRecordsResult = { created: 0, skipped: 0, errors: [] };
  let lastCount = obj.recordCount;
  let aborted = true;
  try {
    for (const [i, cells] of table.rows.entries()) {
      const values: Record<string, unknown> = {};
      let title: string | null = null;
      let parentId: string | null = null;
      for (const [c, h] of table.headers.entries()) {
        const raw = cells[c] ?? "";
        if (typeOf.has(h)) {
          const v = coerceCsv(typeOf.get(h) as string, raw);
          if (v !== undefined) values[h] = v;
        } else if (h === "title") title = str(raw);
        else if (h === "parentId") parentId = str(raw);
      }
      try {
        const made = await createRecordCore(ctx, actor, obj, { values, title, parentId }, "IMPORT");
        result.created += 1;
        lastCount = made.count;
      } catch (e) {
        if (!(e instanceof ObjectsError)) throw e;
        result.skipped += 1;
        if (result.errors.length < 200) result.errors.push({ row: i + 2, reason: e.message });
      }
    }
    aborted = false;
  } catch (e) {
    // แถวที่สร้างแล้วอยู่จริง (แต่ละแถว = tx ของตัวเอง) ⇒ บอกจำนวนให้ผู้ใช้รู้ว่าต้องนำเข้าต่อจากแถวไหน
    throw new Error(
      `นำเข้าหยุดกลางทางเพราะระบบขัดข้อง — สร้างไปแล้ว ${result.created} รายการ (ข้าม ${result.skipped} แถว) · ลองนำเข้าแถวที่เหลือใหม่อีกครั้ง`,
      { cause: e },
    );
  } finally {
    // audit ลงเสมอ แม้หยุดกลางทาง (จำนวนที่สร้างจริง + ธง aborted)
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.actorUserId,
      action: "crm.record.import",
      targetType: "CustomObject",
      targetId: obj.id,
      after: { created: result.created, skipped: result.skipped, bytes, aborted },
    });
  }
  if (result.created > 0) await warnRecordCount(ctx, obj, lastCount);
  return result;
}

/** ค่า → ช่อง CSV (อาร์เรย์คั่นด้วยจุลภาค · ตัวเลขคงเป็นตัวเลข) — ทุกช่องผ่าน `csvRow` (กันสูตร) */
function csvValue(v: ObjectValue | undefined): string | number | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "true" : "false";
  return v;
}

/**
 * ส่งออก CSV — แถวหัว = `title` (+ `parentId`) + key ของฟิลด์ (นำกลับเข้าได้ด้วย import)
 * AUDIT-CLASS X6: ทุกบรรทัดสร้างด้วย `csvRow` (ช่องที่ขึ้นต้น = + - @ ถูกทำให้เป็นข้อความ) · ขอบเขตระบบ/วัตถุ/สาขาเดียวกับ list
 * ค่าอ่อนไหวผ่านด่าน D8 ของ engine (ไม่มีสิทธิ์ = ช่องว่าง · เห็นจริง = มีบันทึกการเข้าถึง)
 */
async function exportRecords(ctx: ObjectsCtx, actor: MemberActor, objectKey: string, opts: ListRecordsInput = {}): Promise<string> {
  assertActor(actor);
  await resolveSystem(ctx);
  const obj = await findObject(ctx, objectKey, prisma);
  const layout = await viaEngine(async () => (await engine()).listLayout(fctx(ctx, obj.key, actor), {}));
  const keys: string[] = [];
  for (const s of layout.sections) for (const f of s.fields) if (!f.isSystem) keys.push(f.key);
  const withParent = obj.parentType !== "NONE";
  const lines = [csvRow(["title", ...(withParent ? ["parentId"] : []), ...keys])];
  const where = await recordsWhere(ctx, actor, obj, { ...(opts ?? {}), page: undefined, pageSize: undefined });
  // AUDIT-CLASS X6: เพดานส่งออก — นับก่อนสร้างไฟล์ (ไฟล์ใหญ่เกิน = หน่วยความจำ/เวลาเกินของเครื่องเดียว)
  const total = await prisma.customRecord.count({ where });
  if (total > OBJECT_EXPORT_MAX_ROWS) {
    throw fail(
      "VALIDATION",
      `มีรายการที่จะส่งออก ${total.toLocaleString("th-TH")} รายการ เกินเพดาน ${OBJECT_EXPORT_MAX_ROWS.toLocaleString("th-TH")} รายการต่อไฟล์ — ใส่ตัวกรอง (เช่น ช่วงวันที่หรือเจ้าของ) แล้วส่งออกทีละส่วน`,
    );
  }
  let cursor: string | null = null;
  for (;;) {
    const rows: CustomRecord[] = await prisma.customRecord.findMany({
      where,
      orderBy: { id: "asc" },
      take: EXPORT_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    const values = await valuesOf(ctx, obj, actor, rows.map((r) => r.id));
    for (const r of rows) {
      const bag = values[r.id] ?? {};
      lines.push(csvRow([r.title, ...(withParent ? [r.parentId] : []), ...keys.map((k) => csvValue(bag[k]))]));
    }
    cursor = rows[rows.length - 1]?.id ?? null;
    if (rows.length < EXPORT_BATCH) break;
  }
  return `${lines.join("\n")}\n`;
}

export const records = {
  create: createRecord,
  update: updateRecord,
  archive: archiveRecord,
  get: getRecord,
  list: listRecords,
  move: moveRecord,
  bulk: bulkRecords,
  import: importRecords,
  export: exportRecords,
};

// ═════════════════════════ แท็บ · ไทม์ไลน์ ═════════════════════════

/** แท็บของหน้า 360 (ผู้ติดต่อ/บริษัท/ดีล/สมาชิก): วัตถุที่ showAsTab + ชนิดแม่ตรง + ยังไม่เก็บถาวร พร้อมจำนวนรายการที่ยังใช้งานของแม่คนนี้ */
export async function tabsFor(ctx: ObjectsCtx, actor: MemberActor, parentType: ObjectParentType, parentId: string): Promise<ObjectTab[]> {
  assertActor(actor);
  await resolveSystem(ctx);
  const type = normalizeParentType(parentType);
  if (type === "NONE") throw fail("VALIDATION", "วัตถุที่ไม่ผูกกับใครไม่มีแท็บในหน้ารายละเอียด");
  const id = await assertParentVisible(ctx, type, parentId);
  const objs = await prisma.customObject.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, parentType: type as CustomParent, showAsTab: true, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const counts = await Promise.all(
    objs.map((o) =>
      prisma.customRecord.count({
        where: { AND: [{ tenantId: ctx.tenantId, systemId: ctx.systemId, objectId: o.id, parentId: id, archivedAt: null }, unitWhere(o, actor)] },
      }),
    ),
  );
  return objs.map((o, i) => ({ objectKey: o.key, key: o.key, label: o.label, labelPlural: o.labelPlural, icon: o.icon, count: counts[i] ?? 0 }));
}

const AUDIT_KIND: Record<string, ObjectTimelineItem["kind"]> = {
  "crm.record.update": "UPDATED",
  "crm.record.move": "MOVED",
  "crm.record.archive": "ARCHIVED",
};

/** ไทม์ไลน์ของรายการ 1 ตัว: สร้าง · แก้ไข/ย้าย/เก็บถาวร (AuditLog) · ประวัติค่าฟิลด์ที่เปิด trackHistory (ค่าอ่อนไหวไม่แสดงค่า) */
export async function timelineFor(ctx: ObjectsCtx, actor: MemberActor, recordId: string): Promise<{ items: ObjectTimelineItem[] }> {
  assertActor(actor);
  await resolveSystem(ctx);
  const id = str(recordId);
  const rec = id ? await prisma.customRecord.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, include: { object: true } }) : null;
  // AUDIT-CLASS X1: รายการของระบบอื่น/ร้านอื่น/วัตถุที่เก็บถาวร = ไม่พบ
  if (!rec || rec.object.archivedAt || !coversUnit(rec.object, actor, rec.unitId)) {
    throw fail("NOT_FOUND", "ไม่พบรายการนี้ในระบบ CRM ที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  }
  const obj = rec.object;
  const layout = await viaEngine(async () => (await engine()).listLayout(fctx(ctx, obj.key, actor), { includeArchived: true }));
  const fieldById = new Map<string, { key: string; label: string; hidden: boolean }>();
  for (const s of layout.sections) for (const f of s.fields) fieldById.set(f.id, { key: f.key, label: f.label, hidden: s.sensitive || f.sensitive });
  const [audits, history] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId, targetType: "CustomRecord", targetId: rec.id, action: { in: Object.keys(AUDIT_KIND) } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.customRecordValueHistory.findMany({ where: { tenantId: ctx.tenantId, recordId: rec.id }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const items: ObjectTimelineItem[] = [
    { at: rec.createdAt, kind: "CREATED", actorUserId: rec.createdById, summary: `สร้าง${obj.label}` },
  ];
  for (const a of audits) {
    const kind = AUDIT_KIND[a.action] ?? "UPDATED";
    const summary = kind === "MOVED" ? "ย้ายไปอยู่กับเจ้าของใหม่" : kind === "ARCHIVED" ? "เก็บถาวร" : "แก้ไขข้อมูล";
    items.push({ at: a.createdAt, kind, actorUserId: a.actorId, summary });
  }
  for (const h of history) {
    const f = fieldById.get(h.fieldId);
    if (!f) continue;
    items.push({
      at: h.createdAt,
      kind: "VALUE_CHANGED",
      actorUserId: h.changedById,
      summary: f.hidden ? `เปลี่ยนค่า "${f.label}" (ข้อมูลอ่อนไหว ไม่แสดงค่า)` : `เปลี่ยนค่า "${f.label}"`,
      fieldKey: f.key,
      ...(f.hidden ? {} : { oldValue: h.oldValue, newValue: h.newValue }),
    });
  }
  items.sort((x, y) => y.at.getTime() - x.at.getTime());
  return { items };
}

// ═════════════════════════ ตัวรับ event (composition root เรียกผ่าน facade) ═════════════════════════

type OutboxEvt = { id: string; tenantId: string; type: string; payload: unknown; systemId: string | null; unitId: string | null };

/** สมาชิกที่ผูกกับแม่ของรายการ — ผู้ติดต่อ: memberCustomerId · ดีล: ผ่านผู้ติดต่อหลัก · สมาชิก: ตัวเอง · บริษัท/ไม่ผูก: ไม่มี */
async function memberOfParent(tenantId: string, rec: CustomRecord): Promise<string | null> {
  if (!rec.parentId) return null;
  switch (rec.parentType) {
    case "CUSTOMER": {
      const c = await prisma.customer.findFirst({ where: { id: rec.parentId, tenantId }, select: { id: true } });
      return c?.id ?? null;
    }
    case "CONTACT": {
      const c = await prisma.crmContact.findFirst({ where: { id: rec.parentId, tenantId, systemId: rec.systemId }, select: { memberCustomerId: true } });
      return c?.memberCustomerId ?? null;
    }
    case "DEAL": {
      const d = await prisma.crmDeal.findFirst({ where: { id: rec.parentId, tenantId, systemId: rec.systemId }, select: { contact: { select: { memberCustomerId: true } } } });
      return d?.contact?.memberCustomerId ?? null;
    }
    default:
      return null;
  }
}

/**
 * `custom.record.created` → แถวไทม์ไลน์ของสมาชิกที่เป็น/ผูกกับแม่ (MemberActivity)
 * AUDIT-CLASS X4: `member.recordOnce` ถือ advisory lock ต่อ (customer, module, type, refId) + ตรวจซ้ำ ⇒ ส่งซ้ำ/ส่งพร้อมกัน = 1 แถว
 * มติผู้คุมงาน ข้อ 1: แม่ที่ไม่ผูกสมาชิก = ไม่เขียนอะไร และไม่ throw (`MemberActivity.customerId` NOT NULL — ไทม์ไลน์ CRM ล้วนเป็นงาน C1.6/C1.8)
 */
export async function onRecordCreated(evt: OutboxEvt): Promise<void> {
  const p = evt.payload && typeof evt.payload === "object" ? (evt.payload as Record<string, unknown>) : {};
  const recordId = str(p.recordId);
  if (!recordId) return;
  const rec = await prisma.customRecord.findFirst({ where: { id: recordId, tenantId: evt.tenantId }, include: { object: true } });
  if (!rec) return;
  const customerId = await memberOfParent(evt.tenantId, rec);
  if (!customerId) return;
  // AUDIT-CLASS X8 (D8): ชื่อรายการไปอยู่ในไทม์ไลน์เฉพาะเมื่อฟิลด์ชื่อไม่อ่อนไหว (อ่านไม่ได้/วัตถุถูกปิด = ไม่ใส่ชื่อ — fail closed)
  let titleShown = false;
  try {
    const layout = await (await engine()).listLayout({ tenantId: evt.tenantId, systemId: rec.systemId, actorUserId: null, objectKey: rec.object.key }, { includeArchived: true });
    titleShown = !isSensitiveField(layout, rec.object.titleFieldKey);
  } catch {
    titleShown = false;
  }
  await (await memberFacade()).recordOnce(
    { tenantId: evt.tenantId },
    {
      customerId,
      module: "crm.object",
      type: "CUSTOM_RECORD_CREATED",
      refType: "CustomRecord",
      refId: rec.id,
      summary: titleShown ? `เพิ่ม${rec.object.label}: ${rec.title}` : `เพิ่ม${rec.object.label}ใหม่`,
      data: { objectKey: rec.object.key, objectId: rec.objectId, recordId: rec.id, systemId: rec.systemId },
      unitId: rec.unitId,
      actorUserId: rec.createdById,
      at: rec.createdAt,
    },
  );
}
