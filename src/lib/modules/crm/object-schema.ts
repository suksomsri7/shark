// object-schema.ts — รูปของค่ารายการของวัตถุกำหนดเอง (ใบ C3.8 · ชั้นบริการของ `api/ops/records-dynamic.ts`)
//
//   objectValueSchema(ctx, actor, key) → JSON schema ของฟิลด์ที่ยังใช้อยู่ (ชนิด · ตัวเลือก · ต้องกรอก) — ฟิลด์อ่อนไหวมีเฉพาะผู้ที่ดูได้
//   liveObjectsOf({tenantId, systemId})  → วัตถุที่ยังใช้อยู่ของระบบ CRM นี้ (ระบบต้องเป็น CRM ของร้าน + uiVersion 2)
//   visibleFields(ctx, key, actor|null)  → ฟิลด์ที่ actor เห็นได้ · valueSchemaOf(field) → schema ของค่า 1 ช่อง
// 🔴 ไม่มี engine ที่สอง: ฟิลด์มาจาก engine ฟิลด์ตัวเดียว (member facade `fields.listLayout`) · คำตัดสินค่าอ่อนไหว = `canViewSensitive`
//    (privacy ของสมาชิก — ตัวตัดสินตัวเดียวของระบบ · ผู้ช่วย AI/คีย์ readonly/operate = ไม่เห็นเสมอ) · ไม่มี actor = ตัดฟิลด์อ่อนไหวทิ้ง (fail closed)
// 🔴 ไฟล์ op (`api/ops/*`) ห้ามแตะ prisma (C1.10-S0.5 · C2.11-S1.3) ⇒ การอ่านฐานของ C3.8 อยู่ที่นี่
// AUDIT-CLASS X1: วัตถุของระบบ CRM นี้เท่านั้น (key ของระบบอื่น/ร้านอื่น/เก็บถาวร = NOT_FOUND) · AUDIT-CLASS X8: ไม่มีค่า (value) ใด ๆ ในผล — มีแต่รูป
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage } from "./access";
import * as objects from "./objects";
import { ObjectsError } from "./objects-shared";
import { parseCrmSettings } from "./settings";
import { CrmV2DisabledError } from "./ui-version";

export type JsonSchema = Record<string, unknown>;
const memberFacade = () => import("@/lib/modules/member");

export type ObjectSchemaCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
export type FieldLike = { id: string; key: string; label: string; description: string | null; type: string; required: boolean; sensitive: boolean; options: Record<string, unknown> };
type SectionLike = { id: string; sensitive: boolean; fields: FieldLike[] };

/** ฟิลด์ที่ยังใช้อยู่ของวัตถุ + ธงอ่อนไหว (ส่วนอ่อนไหว ⇒ ทุกฟิลด์ในส่วนนั้นอ่อนไหว) — ผ่าน engine ตัวเดียว */
async function liveFields(ctx: ObjectSchemaCtx, objectKey: string, actor: MemberActor | null): Promise<{ field: FieldLike; target: { targetType: "SECTION" | "FIELD"; targetId: string } | null }[]> {
  const m = await memberFacade();
  const layout = (await m.fields.listLayout({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null, objectKey, ...(actor ? { actor } : {}) }, {})) as unknown as { sections: SectionLike[] };
  const out: { field: FieldLike; target: { targetType: "SECTION" | "FIELD"; targetId: string } | null }[] = [];
  for (const s of layout.sections) {
    for (const f of s.fields) {
      const target = s.sensitive ? { targetType: "SECTION" as const, targetId: s.id } : f.sensitive ? { targetType: "FIELD" as const, targetId: f.id } : null;
      out.push({ field: f, target });
    }
  }
  return out;
}

/** ฟิลด์ที่ actor นี้เห็นได้ (ไม่มี actor = ตัดฟิลด์อ่อนไหวทั้งหมด — AUDIT-CLASS X8) */
export async function visibleFields(ctx: ObjectSchemaCtx, objectKey: string, actor: MemberActor | null): Promise<(FieldLike & { sensitive: boolean })[]> {
  const rows = await liveFields(ctx, objectKey, actor);
  const m = rows.some((r) => r.target) && actor ? await memberFacade() : null;
  const cache = new Map<string, boolean>();
  const out: (FieldLike & { sensitive: boolean })[] = [];
  for (const { field, target } of rows) {
    if (target) {
      if (!actor || !m) continue;
      const k = `${target.targetType}:${target.targetId}`;
      let ok = cache.get(k);
      if (ok === undefined) {
        ok = await m.canViewSensitive({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null }, actor, { ...target, customerId: "" });
        cache.set(k, ok);
      }
      if (!ok) continue;
    }
    out.push({ ...field, sensitive: !!target });
  }
  return out;
}

/** ชนิดฟิลด์ของ engine → JSON schema ของค่าที่ `values.<key>` รับ (ตรงกับที่ engine ตรวจจริง) */
export function valueSchemaOf(f: FieldLike): JsonSchema {
  const o = f.options ?? {};
  const choices = Array.isArray(o.choices) ? (o.choices as unknown[]).map((c) => (typeof c === "object" && c !== null ? String((c as { value?: unknown }).value ?? "") : String(c))).filter(Boolean) : [];
  const num = (k: string) => (typeof o[k] === "number" ? { [k === "min" ? "minimum" : "maximum"]: o[k] as number } : {});
  const base: JsonSchema = { title: f.label, "x-shark-field-type": f.type, ...(f.description ? { description: f.description } : {}), ...(f.sensitive ? { "x-shark-sensitive": true } : {}) };
  switch (f.type) {
    case "NUMBER":
      return { ...base, type: ["number", "null"], ...num("min"), ...num("max") };
    case "MONEY":
      return { ...base, type: ["number", "null"], ...num("min"), ...num("max"), ...(typeof o.unit === "string" ? { "x-shark-unit": o.unit } : {}) };
    case "BOOLEAN":
      return { ...base, type: ["boolean", "null"] };
    case "DATE":
      return { ...base, type: ["string", "null"], format: "date" };
    case "DATETIME":
      return { ...base, type: ["string", "null"], format: "date-time" };
    case "SELECT":
      return { ...base, type: ["string", "null"], ...(choices.length ? { enum: [...choices, null] } : {}) };
    case "MULTI_SELECT":
      return { ...base, type: "array", items: choices.length ? { type: "string", enum: choices } : { type: "string", maxLength: 500 }, maxItems: 100 };
    case "FILE":
      return { ...base, type: ["string", "null"], maxLength: 64, description: `${f.description ? `${f.description} ` : ""}(file id)` };
    case "LOOKUP":
      return { ...base, type: ["string", "null"], maxLength: 64, ...(typeof o.target === "string" ? { "x-shark-lookup": o.target } : {}), ...(typeof o.objectKey === "string" ? { "x-shark-lookup-object": o.objectKey } : {}) };
    default:
      return { ...base, type: ["string", "null"], maxLength: typeof o.maxLength === "number" ? o.maxLength : 5000, ...(typeof o.pattern === "string" ? { pattern: o.pattern } : {}) };
  }
}

/**
 * ระบบ CRM ของร้านนี้ (ไม่พบ/ไม่ใช่ CRM/ร้านอื่น = NOT_FOUND) · `requireV2` = รุ่น 1 ตอบ CrmV2DisabledError
 * (บริการรายการของ C1.2b ไม่มีประตูรุ่นในตัว — ประตูอยู่ที่ทางเข้า: REST = altAuth ของ config.ts · เอกสารต่อคีย์ = requireV2)
 */
async function crmSystem(ctx: ObjectSchemaCtx, opts: { requireV2?: boolean } = {}): Promise<void> {
  const sys =
    ctx && typeof ctx.tenantId === "string" && typeof ctx.systemId === "string" && ctx.tenantId && ctx.systemId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { settings: true } })
      : null;
  if (!sys) throw new ObjectsError("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  if (opts.requireV2 && parseCrmSettings(sys.settings).uiVersion !== 2) throw new CrmV2DisabledError();
}

/**
 * JSON schema ของค่ารายการของวัตถุ `objectKey` (สิ่งที่ `values` ของ records.create/update รับ) — ฟิลด์ที่ยังใช้อยู่ทุกตัวที่ actor เห็นได้
 * คีย์ `crm.record.read` · วัตถุต้องไม่ถูกเก็บถาวร · ไม่มีค่าใด ๆ ของรายการในผล
 */
export async function objectValueSchema(ctx: ObjectSchemaCtx, actor: MemberActor, objectKey: string): Promise<JsonSchema> {
  if (!actor || actor.role === "CUSTOMER") throw new ObjectsError("NOT_FOUND", "ไม่พบข้อมูลนี้ในระบบ CRM ที่เปิดอยู่");
  if (!crmCan(actor, "crm.record.read")) throw new ObjectsError("FORBIDDEN", crmForbiddenMessage("crm.record.read"));
  const octx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? actor.userId ?? null };
  await crmSystem(octx); // AUDIT-CLASS X1: ระบบ CRM ของร้านนี้เท่านั้น (ประตูรุ่นอยู่ที่ทางเข้า REST)
  const obj = await objects.get(octx, actor, objectKey);
  if (obj.archivedAt) throw new ObjectsError("NOT_FOUND", `ไม่พบวัตถุ "${objectKey}" ในระบบ CRM นี้ (อาจถูกเก็บถาวรไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่`);
  const fields = await visibleFields(octx, obj.key, actor);
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const f of fields) {
    properties[f.key] = valueSchemaOf(f);
    if (f.required) required.push(f.key);
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: obj.label,
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
    "x-shark-object": { key: obj.key, label: obj.label, labelPlural: obj.labelPlural, parentType: obj.parentType, titleFieldKey: obj.titleFieldKey },
  };
}


/** วัตถุที่ยังใช้อยู่ของระบบนี้ (ระบบต้องเป็น CRM ของร้าน + uiVersion 2) — เรียงแบบหน้าตั้งค่า · เพดาน 200 */
export async function liveObjectsOf(sys: { tenantId: string; systemId: string }, opts: { requireV2?: boolean } = {}): Promise<{ key: string; label: string; parentType: string }[]> {
  await crmSystem(sys, opts);
  const rows = await prisma.customObject.findMany({
    where: { tenantId: sys.tenantId, systemId: sys.systemId, archivedAt: null },
    select: { key: true, label: true, parentType: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  return rows.map((r) => ({ key: r.key, label: r.label, parentType: String(r.parentType) }));
}
