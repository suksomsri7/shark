// ops/records-dynamic.ts — "รายการของวัตถุกำหนดเองทุกตัว" แบบไดนามิก (ใบ C3.8 · CRM-RUN §2 C3.8 "records dynamic ทุกวัตถุ")
//
// op ของรายการ (`/objects/{key}/records…` — ops/objects.ts ของ C1.10) ตัดสิน `{key}` ตอนรันอยู่แล้ว ⇒ วัตถุที่เพิ่งสร้างใช้ได้ทันที
// (ไม่ต้อง restart ไม่ต้องแก้ทะเบียน) · ไฟล์นี้เติมสิ่งที่ผู้เชื่อมต่อ/agent ขาด: **รูปของค่า** ต่อวัตถุ
//   objectValueSchema(ctx, actor, key)  → JSON schema ของฟิลด์ที่ยังใช้อยู่ (ชนิด · ตัวเลือก · ต้องกรอก) — ฟิลด์อ่อนไหวมีเฉพาะผู้ที่ดูได้
//   crmObjectsOpenApi({tenantId, systemId}, { actor? }) → path จริงต่อวัตถุ (`/objects/<key>/records` · `/objects/<key>/records/{id}` …)
//                                           + `objects[{ key, fields[] }]` — route `/api/v1/crm/openapi.json` รวมเข้าเอกสารเมื่อมีคีย์ CRM
//   op `objects.schema.get` GET /objects/{key}/schema (crm.record.read)
// 🔴 ไม่มี engine ที่สอง: ฟิลด์มาจาก engine ฟิลด์ตัวเดียว (member facade `fields.listLayout`) · คำตัดสินค่าอ่อนไหว = `canViewSensitive`
//    (privacy ของสมาชิก — ตัวตัดสินตัวเดียวของระบบ · ผู้ช่วย AI/คีย์ readonly/operate = ไม่เห็นเสมอ) · ไม่มี actor = ตัดฟิลด์อ่อนไหวทิ้ง (fail closed)
// 🔴 ไม่ import `../openapi` (openapi → registry → ไฟล์นี้ = วงโหลด) — ใช้ตัวสร้าง OpenAPI ของแกนกลางตรง ๆ
// AUDIT-CLASS X1: วัตถุของระบบ CRM นี้เท่านั้น (key ของระบบอื่น/ร้านอื่น/เก็บถาวร = 404) · AUDIT-CLASS X8: ไม่มีค่า (value) ใด ๆ ในผล — มีแต่รูป
import { z } from "zod";
import { buildOpenApi as coreBuildOpenApi, type JsonSchema, type OpenApiOperation } from "@/lib/api/openapi";
import type { MemberActor } from "@/lib/modules/member";
import { liveObjectsOf, objectValueSchema, valueSchemaOf, visibleFields } from "../../object-schema";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { OBJECTS_OPS } from "./objects";

/** สัญญาข้อสอบ C3.8 (addendum ข้อ 2): ไฟล์นี้ export `objectValueSchema` — ตัวจริงอยู่ชั้นบริการ (`crm/object-schema.ts` · ไฟล์ op ห้ามแตะ prisma) */
export { objectValueSchema };

/** op ของรายการ (C1.10) ที่มี path ใต้ `/objects/{key}/records` — ต้นแบบของ path จริงต่อวัตถุ */
const RECORD_OPS = (): ApiOp[] => OBJECTS_OPS.filter((o) => o.path.startsWith("/objects/{key}/records"));

export type CrmObjectsOpenApi = {
  paths: Record<string, Record<string, OpenApiOperation>>;
  objects: { key: string; label: string; parentType: string; fields: { key: string; label: string; type: string; required: boolean }[] }[];
};

/**
 * path จริงต่อวัตถุของระบบนี้ (ใช้ op ของรายการตัวเดิม — ไม่มีประตูที่สอง) · `values` ของ body = schema ของวัตถุนั้น
 * ไม่ส่ง actor = ไม่มีฟิลด์อ่อนไหวในเอกสาร (fail closed) · เรียกใหม่ทุกครั้ง (วัตถุใหม่ปรากฏทันที ไม่มีแคช)
 */
export async function crmObjectsOpenApi(sys: { tenantId: string; systemId: string }, opts: { actor?: MemberActor | null; requireV2?: boolean } = {}): Promise<CrmObjectsOpenApi> {
  const rows = await liveObjectsOf(sys, { requireV2: opts.requireV2 === true });
  const ctx = { tenantId: sys.tenantId, systemId: sys.systemId, actorUserId: opts.actor?.userId || null };
  const templates = RECORD_OPS();
  const paths: CrmObjectsOpenApi["paths"] = {};
  const out: CrmObjectsOpenApi["objects"] = [];
  for (const o of rows) {
    const fields = await visibleFields(ctx, o.key, opts.actor ?? null);
    const values: JsonSchema = { type: "object", properties: Object.fromEntries(fields.map((f) => [f.key, valueSchemaOf(f)])), additionalProperties: false };
    const concrete = templates.map((op) => ({ ...op, id: `${op.id}.${o.key}`, path: op.path.replace("{key}", o.key), summary: `${op.summary} Object: ${o.label} (${o.key}).` }));
    const doc = coreBuildOpenApi(concrete, { title: "", version: "", serverUrl: "", description: "", securityDescription: "" });
    for (const [p, item] of Object.entries(doc.paths)) {
      for (const op of Object.values(item)) {
        const body = op.requestBody?.content?.["application/json"]?.schema as { properties?: Record<string, JsonSchema> } | undefined;
        if (body?.properties && "values" in body.properties) body.properties.values = values;
      }
      paths[p] = item;
    }
    out.push({ key: o.key, label: o.label, parentType: o.parentType, fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })) });
  }
  return { paths, objects: out };
}

const schemaGet = defineCrmOp({
  id: "objects.schema.get",
  method: "GET",
  path: "/objects/{key}/schema",
  kind: "read",
  action: "crm.record.read",
  summary:
    "JSON schema of one custom object's record values (what `values` of POST/PATCH /objects/{key}/records accepts): every live field with its type, " +
    "choices and whether it is required. Works for objects created a moment ago. Sensitive fields appear only for callers allowed to see them.",
  label: "รูปแบบข้อมูลของวัตถุ",
  input: z.object({}).strict(),
  test: "C3.8-S3.2",
  async handler({ actor, params }) {
    return objectValueSchema(crmCtxOf(actor), crmActorOf(actor), params.key ?? "");
  },
});

export const RECORDS_DYNAMIC_OPS: ApiOp[] = [schemaGet];
