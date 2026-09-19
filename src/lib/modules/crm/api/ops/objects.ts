// ops/objects.ts — op ของวัตถุกำหนดเองและรายการ `/objects/{key}/records…` (ใบ C1.10 · CRM-API §2.7)
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการ `objects.ts` ของใบ C1.2b (engine ฟิลด์ตัวเดียวของระบบผ่าน member facade)
// 🔴 `{key}` ถูกตัดสินตอนรัน (dispatch → บริการ `findObject`) — วัตถุที่ไม่มี/ของระบบอื่น/ถูกเก็บถาวร = 404
// 🔴 C1.2b: การ "ออกแบบวัตถุ" (สร้าง/แก้/เก็บถาวรวัตถุ · คีย์ `crm.object.manage`) **ไม่เปิดให้คีย์ API** — ไม่มี op ในทะเบียนเลย
//    (POST /objects = 405 · POST /objects/{key}/archive = 404) และบริการเองก็ปฏิเสธคีย์ API ซ้ำอีกชั้น (assertDesigner)
// AUDIT-CLASS X1: รายการของวัตถุอื่น (key ผิด)/ระบบอื่น/ร้านอื่น = 404 · แม่ของรายการต้องเป็นของระบบนี้และมองเห็นได้

import { z } from "zod";
import * as objects from "../../objects";
import { crmActorOf, crmCtxOf } from "../actor";
import { assertAdminKeyForExport, defineCrmOp, type ApiOp } from "../op";
import { cursor, fieldsBag, flag, idStr, isOn, optId, optText, pageCursor, pageOfCursor, reason, take, text } from "../schema";

const RECORD_SORTS = ["title", "-title", "createdAt", "-createdAt", "updatedAt", "-updatedAt"] as const;

const list = defineCrmOp({
  id: "objects.list",
  method: "GET",
  path: "/objects",
  kind: "read",
  action: "crm.record.read",
  summary: "The custom objects of this CRM system (key, labels, parent type, title field, record count).",
  label: "วัตถุกำหนดเอง",
  input: z.object({}).strict(),
  test: "C1.10-S5.1",
  async handler({ actor }) {
    const items = await objects.list(crmCtxOf(actor), crmActorOf(actor));
    return { items };
  },
});

const recordsList = defineCrmOp({
  id: "records.list",
  method: "GET",
  path: "/objects/{key}/records",
  kind: "read",
  action: "crm.record.read",
  summary: "Records of one custom object this key can see (follows the parent's visibility), with search and cursor paging.",
  label: "รายการของวัตถุ",
  input: z
    .object({ take, cursor, parentId: idStr.optional(), q: text(100).optional(), sort: z.enum(RECORD_SORTS).optional(), includeArchived: flag })
    .strict(),
  tool: { name: "crm_records_query", hint: "Use to look up custom object records (cars, contracts, pets, ...) by object key, parent or text." },
  test: "C1.10-S5.1",
  async handler({ actor, params, input }) {
    const pageSize = input.take ?? 50;
    const r = await objects.records.list(crmCtxOf(actor), crmActorOf(actor), params.key ?? "", {
      parentId: input.parentId ?? null,
      q: input.q ?? null,
      ...(input.sort ? { sort: input.sort } : {}),
      includeArchived: isOn(input.includeArchived),
      page: pageOfCursor(input.cursor),
      pageSize,
    });
    return { items: r.items, total: r.total, nextCursor: r.page * r.pageSize < r.total ? pageCursor(r.page + 1) : null };
  },
});

const recordsGet = defineCrmOp({
  id: "records.get",
  method: "GET",
  path: "/objects/{key}/records/{id}",
  kind: "read",
  action: "crm.record.read",
  summary: "One record with its field values (sensitive values follow the shop's policy).",
  label: "รายการ 1 รายการ",
  test: "C1.10-S5.3",
  async handler({ actor, params }) {
    return objects.records.get(crmCtxOf(actor), crmActorOf(actor), params.key ?? "", params.id ?? "");
  },
});

const recordsCreate = defineCrmOp({
  id: "records.create",
  method: "POST",
  path: "/objects/{key}/records",
  kind: "write",
  action: "crm.record.create",
  summary: "Create a record under its parent (contact, company, deal or member, per the object); the title comes from the object's title field.",
  label: "เพิ่มรายการ",
  input: z.object({ parentId: optId, title: optText(200), values: fieldsBag.optional(), unitId: optId, ownerUserId: optId }).strict(),
  test: "C1.10-S5.2",
  async handler({ actor, params, input }) {
    const rec = await objects.records.create(crmCtxOf(actor), crmActorOf(actor), params.key ?? "", { ...input, values: input.values ?? {} });
    return { recordId: rec.id, record: rec };
  },
});

const recordsUpdate = defineCrmOp({
  id: "records.update",
  method: "PATCH",
  path: "/objects/{key}/records/{id}",
  kind: "write",
  action: "crm.record.update",
  summary: "Change a record's field values (only the keys sent are touched).",
  label: "แก้ไขรายการ",
  input: z.object({ title: optText(200), values: fieldsBag.optional() }).strict(),
  test: "C1.10-S5.2",
  async handler({ actor, params, input }) {
    const rec = await objects.records.update(crmCtxOf(actor), crmActorOf(actor), params.key ?? "", params.id ?? "", input);
    return { recordId: rec.id, record: rec };
  },
});

const recordsArchive = defineCrmOp({
  id: "records.archive",
  method: "POST",
  path: "/objects/{key}/records/{id}/archive",
  kind: "write",
  action: "crm.record.delete",
  summary: "Archive one record (kept for history, hidden from lists).",
  label: "เก็บถาวรรายการ",
  input: z.object({}).strict(),
  test: "C1.10-S5.3",
  async handler({ actor, params }) {
    const rec = await objects.records.archive(crmCtxOf(actor), crmActorOf(actor), params.key ?? "", params.id ?? "");
    return { recordId: rec.id, archivedAt: rec.archivedAt };
  },
});

const recordsExport = defineCrmOp({
  id: "records.export",
  method: "POST",
  path: "/objects/{key}/records/export",
  kind: "danger",
  action: "crm.record.read",
  summary: "Export the records of one object as CSV text (formula cells neutralised). Needs confirm: true and a reason.",
  label: "ส่งออกรายการ",
  input: z.object({ reason, parentId: idStr.optional(), q: text(100).optional() }).strict(),
  test: "C1.10-S5.3",
  async handler({ actor, params, input }) {
    assertAdminKeyForExport(actor);
    // AUDIT-CLASS X6: ทุกแถวผ่าน csvRow ของบริการ
    const csv = await objects.records.export(crmCtxOf(actor), crmActorOf(actor), params.key ?? "", { parentId: input.parentId ?? null, q: input.q ?? null });
    return { csv };
  },
});

export const OBJECTS_OPS: ApiOp[] = [list, recordsList, recordsExport, recordsGet, recordsCreate, recordsUpdate, recordsArchive];
