// objects-shared.ts — ค่าคงที่/ชนิด/ข้อผิดพลาด ของบริการวัตถุกำหนดเอง (CRM v2 · ใบ C1.2b · พิมพ์เขียว §5.8 §11.2 · มติ C8)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์** (ไม่แตะ prisma/next/server-only) — หน้า UI ('use client') ของใบ C1.9 import ได้ตรง ๆ
//    (บทเรียน reference_next_client_component_imports_server_module: client import โมดูลที่ถึง prisma = build พัง)
// 🔴 เพดานทุกตัวเป็นค่าคงที่มีชื่อ เพื่อให้หน้าจอบอกผู้ใช้ได้ก่อนกด (ไม่ใช่รู้ตอนโดนปฏิเสธ)

export { OBJECT_TEMPLATES } from "./templates/objects";
export type { ObjectStarterRule, ObjectTemplate, ObjectTemplateField, ObjectTemplateParent, ObjectTemplateSection } from "./templates/objects";

/** นำเข้า CSV ได้ไม่เกินกี่แถวต่อครั้ง (เกิน = ปฏิเสธทั้งไฟล์ ไม่สร้างสักแถว) */
export const OBJECT_IMPORT_MAX_ROWS = 5_000;
/** ขนาดไฟล์ CSV สูงสุด (วัดเป็นไบต์ UTF-8 — อักษรไทย 3 ไบต์/ตัว) */
export const OBJECT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** ส่งออก CSV ได้ไม่เกินกี่รายการต่อไฟล์ (เกิน = ให้ใส่ตัวกรองแล้วส่งออกทีละส่วน) */
export const OBJECT_EXPORT_MAX_ROWS = 50_000;
/** งานกลุ่ม (เก็บถาวรหลายรายการ) ได้ไม่เกินกี่ id ต่อครั้ง */
export const OBJECT_BULK_MAX = 500;
/** ไม่มีเพดานจำนวนวัตถุ (มติ C8) — เกินค่านี้ต่อระบบ CRM = เตือน (OpsEvent WARN + ป้ายเตือนหน้าตั้งค่า) */
export const OBJECT_WARN_AT = 30;
/** ไม่มีเพดานจำนวนรายการ — เกินค่านี้ต่อวัตถุ = เตือน */
export const RECORD_WARN_AT = 200_000;
/** เหตุผลของการกระทำที่อันตราย (เก็บถาวรวัตถุที่มีรายการ · งานกลุ่ม) ยาวอย่างน้อยกี่ตัวอักษร */
export const OBJECT_REASON_MIN = 5;

/** key ของวัตถุ: ตัวแรกพิมพ์เล็ก ตามด้วย a–z A–Z 0–9 _ (รูปแบบเดียวกับ key ฟิลด์ของ engine) */
export const OBJECT_KEY_RE = /^[a-z][a-zA-Z0-9_]*$/;
export const OBJECT_KEY_MAX = 40;
/** key สงวน = objectKey ของ engine ฟิลด์เอง (วัตถุชื่อ "contact" จะไปใช้ฟิลด์ร่วมกับผู้ติดต่อ) */
export const RESERVED_OBJECT_KEYS: readonly string[] = ["customer", "contact", "company", "deal"];

// CRM C1.9 ▸ มติผู้คุมงาน C1.9 ข้อ 1 (ใบ C1.9 X6): กติกา key ของวัตถุ "ตัวเดียว" สำหรับ UI + REST ตอนสร้าง/เปลี่ยนชื่อ
//   `^[a-z][a-z0-9_]{1,30}$` (พิมพ์เล็กล้วน 2–31 ตัว — อยู่ใน URL `/crm/objects/<key>` และตัวกรอง) + key สงวน 4 ตัวข้างบน
//   🔴 `OBJECT_KEY_RE` ข้างบน **ยังคงเดิม** เพราะ objects.ts ใช้ตัวเดียวกันตรวจ `titleFieldKey` (= key ของฟิลด์ แบบ camelCase
//      เช่น "petName" ของเทมเพลต 8 ชุด) — เปลี่ยนตัวนั้นเท่ากับเทมเพลตทุกชุดสร้างไม่ได้ (ดูรายงาน C1.9 · ผู้คุมงานตัดสิน)
//   key เดิมที่ไม่ผ่านกติกานี้ยังอ่าน/ใช้งานได้ตามปกติ — ตรวจเฉพาะตอนสร้างและเปลี่ยนชื่อ
export const OBJECT_KEY_STRICT_RE = /^[a-z][a-z0-9_]{1,30}$/;
/** AUDIT-CLASS X6: key ของวัตถุใช้ไม่ได้เพราะอะไร (ภาษาไทย ไม่โทษผู้ใช้) · ใช้ได้ = null */
export function objectKeyProblem(raw: unknown): string | null {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (RESERVED_OBJECT_KEYS.includes(key)) {
    return `ชื่ออ้างอิง "${key}" สงวนไว้ให้ข้อมูลหลักของระบบ (สมาชิก/ผู้ติดต่อ/บริษัท/ดีล) — ตั้งชื่ออื่น เช่น "${key}_info"`;
  }
  if (!OBJECT_KEY_STRICT_RE.test(key)) {
    return "ชื่ออ้างอิง (key) ของวัตถุใช้ได้เฉพาะ a–z ตัวพิมพ์เล็ก ตัวเลข และ _ ขึ้นต้นด้วยตัวอักษร ยาว 2–31 ตัว — เช่น \"vehicle\" หรือ \"pet_record\"";
  }
  return null;
}
// ◂ CRM C1.9

export type ObjectParentType = "CUSTOMER" | "CONTACT" | "COMPANY" | "DEAL" | "NONE";
export const OBJECT_PARENT_TYPES: readonly ObjectParentType[] = ["CUSTOMER", "CONTACT", "COMPANY", "DEAL", "NONE"];
export const OBJECT_PARENT_LABEL: Record<ObjectParentType, string> = {
  CUSTOMER: "สมาชิก",
  CONTACT: "ผู้ติดต่อ",
  COMPANY: "บริษัท",
  DEAL: "ดีล",
  NONE: "ไม่ผูกกับใคร",
};

export type ObjectValue = string | number | boolean | string[] | null;

export type ObjectDto = {
  id: string;
  key: string;
  /** = key (ชื่อเดียวกับ `FieldCtx.objectKey` ของ engine ฟิลด์) */
  objectKey: string;
  label: string;
  labelPlural: string;
  icon: string | null;
  parentType: ObjectParentType;
  titleFieldKey: string;
  showAsTab: boolean;
  portalVisible: boolean;
  unitScoped: boolean;
  sortOrder: number;
  templateKey: string | null;
  /** รายการที่ยังไม่ถูกเก็บถาวร (แคช — บวก/ลบด้วยคำสั่งเดียวเสมอ) */
  recordCount: number;
  archivedAt: Date | null;
  createdAt: Date;
};

export type RecordDto = {
  id: string;
  objectId: string;
  objectKey: string;
  title: string;
  parentType: ObjectParentType;
  parentId: string | null;
  partyId: string | null;
  unitId: string | null;
  ownerUserId: string | null;
  status: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** ค่าฟิลด์ keyed ด้วย key ของฟิลด์ (ค่าอ่อนไหวถูกตัดถ้าผู้อ่านไม่มีสิทธิ์ — กติกา D8 ของ engine) */
  values: Record<string, ObjectValue>;
};

export type ObjectTab = { objectKey: string; key: string; label: string; labelPlural: string; icon: string | null; count: number };

export type ObjectTimelineItem = {
  at: Date;
  kind: "CREATED" | "UPDATED" | "MOVED" | "ARCHIVED" | "VALUE_CHANGED" | "IMPORTED";
  actorUserId: string | null;
  /** ประโยคไทยสั้น ๆ สำหรับแสดงผล */
  summary: string;
  fieldKey?: string;
  oldValue?: unknown;
  newValue?: unknown;
};

export type ObjectWarnings = {
  objectCount: number;
  tooManyObjects: boolean;
  /** key ของวัตถุที่มีรายการเกิน RECORD_WARN_AT */
  bigObjects: string[];
};

export type ObjectsErrorCode = "NOT_FOUND" | "VALIDATION" | "DUPLICATE" | "CONFIRM_REQUIRED" | "FORBIDDEN";

const STATUS_OF: Record<ObjectsErrorCode, number> = { NOT_FOUND: 404, VALIDATION: 400, DUPLICATE: 409, CONFIRM_REQUIRED: 428, FORBIDDEN: 403 };

/** ข้อผิดพลาดของบริการวัตถุ — ข้อความไทยเสมอ และไม่โทษผู้ใช้ (บอกสิ่งที่เกิด + ทางไปต่อ) */
export class ObjectsError extends Error {
  readonly code: ObjectsErrorCode;
  readonly status: number;
  constructor(code: ObjectsErrorCode, message: string) {
    super(message);
    this.name = "ObjectsError";
    this.code = code;
    this.status = STATUS_OF[code];
  }
}
