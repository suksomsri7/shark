// ops/fields.ts — op ของ "ฟิลด์กำหนดเอง" (MEMBER-API §2.2 · M1.11)
//
// 🔴 ด่านสิทธิ์ของหมวดนี้อยู่ที่ `action` ของ op (`member.settings.manage`) ซึ่งแกน REST ตรวจให้
//    ก่อนเรียก handler — บริการ `fields.ts` รับ `FieldCtx` ล้วน ๆ ไม่มี actor โดยตั้งใจ
//    (มันเป็นเครื่องมือของหน้าตั้งค่า ไม่ใช่ตัวตัดสินสิทธิ์) ⇒ ห้ามเปิด op ของหมวดนี้ด้วย action ที่อ่อนกว่านี้

import { z } from "zod";
import { FIELD_TYPE_ORDER } from "../../field-types";
import * as fields from "../../fields";
import { replaceChoice } from "../../choices";
import { TEMPLATES } from "../../templates";
import { memberActorOf, memberCtxOf } from "../actor";
import { jsonSafe } from "../serialize";
import { defineMemberOp, type ApiOp } from "../op";

const FIELD_TYPES = FIELD_TYPE_ORDER as unknown as [string, ...string[]];

/** `MemberCtx` ของโมดูล = `FieldCtx` ทุกช่อง (tenantId/systemId/actorUserId) */
const fieldCtx = (a: Parameters<typeof memberCtxOf>[0]): fields.FieldCtx => memberCtxOf(a);

const requiredId = (v: string | undefined): string => (v ?? "").trim();

const fieldFlags = {
  description: z.string().trim().max(300).nullish(),
  options: z.record(z.string(), z.unknown()).optional().describe("Type specific settings: { choices: [{ value, label, color? }] } for SELECT, { min, max, unit } for NUMBER, { target } for LOOKUP."),
  required: z.boolean().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
  unique: z.boolean().optional().describe("No two members may hold the same value."),
  filterable: z.boolean().optional().describe("Can be used as a filter in GET /members (`f.<key>=`)."),
  showInList: z.boolean().optional().describe("Appears as a column on the member list."),
  showOnCard: z.boolean().optional().describe("Appears on the small member card used by other modules."),
  customerEditable: z.boolean().optional().describe("The customer may edit it themself in the self service pages."),
  sensitive: z.boolean().optional().describe("Sensitive: hidden from read and operate keys, and from staff outside the shop's policy."),
  trackHistory: z.boolean().optional().describe("Keep a history of every change of this field."),
} as const;

const layout = defineMemberOp({
  id: "fields.layout",
  method: "GET",
  path: "/fields/layout",
  kind: "read",
  action: "member.customer.read",
  summary:
    "Every section and field of the member profile, in display order: the exact shape to build a signup or edit form from, including types, choices, validation flags and which fields are sensitive.",
  label: "ผังฟิลด์ของสมาชิก",
  tool: { name: "member_field_layout", hint: "Read this before writing custom fields, to learn the field keys and their allowed values." },
  input: z
    .object({
      audience: z.enum(["staff", "customer"]).optional().describe("`customer` returns only what the shop lets customers see and edit. Default `staff`."),
      includeArchived: z.coerce.boolean().optional().describe("Include fields that were archived (their stored values still exist)."),
    })
    .strict(),
  test: "M1.11-S2.7",
  async handler({ actor, input }) {
    const res = await fields.listLayout(fieldCtx(actor), {
      ...(input.audience ? { audience: input.audience } : {}),
      ...(input.includeArchived ? { includeArchived: true } : {}),
    });
    return jsonSafe(res);
  },
});

const sectionsCreate = defineMemberOp({
  id: "fields.sections.create",
  method: "POST",
  path: "/fields/sections",
  kind: "write",
  action: "member.settings.manage",
  summary: "Add a section to the member profile. A sensitive section hides every field inside it from read and operate keys.",
  label: "เพิ่มส่วนของฟิลด์",
  input: z
    .object({
      key: z.string().trim().min(1).max(40).describe("Stable reference, lowercase letters, digits and underscore."),
      label: z.string().trim().min(1).max(60).describe("What staff see on screen."),
      description: z.string().trim().max(300).nullish(),
      columns: z.coerce.number().int().min(1).max(4).optional().describe("How many columns the section is laid out in. Default 2."),
      sensitive: z.boolean().optional(),
      collapsed: z.boolean().optional().describe("Start folded on the profile page."),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    return jsonSafe(await fields.createSection(fieldCtx(actor), input));
  },
});

const sectionsUpdate = defineMemberOp({
  id: "fields.sections.update",
  method: "PATCH",
  path: "/fields/sections/{id}",
  kind: "write",
  action: "member.settings.manage",
  summary: "Rename a section, change its layout, or turn its sensitivity on or off.",
  label: "แก้ไขส่วนของฟิลด์",
  input: z
    .object({
      label: z.string().trim().min(1).max(60).optional(),
      description: z.string().trim().max(300).nullish(),
      columns: z.coerce.number().int().min(1).max(4).optional(),
      sensitive: z.boolean().optional(),
      collapsed: z.boolean().optional(),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    return jsonSafe(await fields.updateSection(fieldCtx(actor), requiredId(params.id), input));
  },
});

const sectionsReorder = defineMemberOp({
  id: "fields.sections.reorder",
  method: "PUT",
  path: "/fields/sections/order",
  kind: "write",
  action: "member.settings.manage",
  summary: "Set the display order of the sections. Send every section id, in the order you want.",
  label: "เรียงลำดับส่วนของฟิลด์",
  input: z.object({ ids: z.array(z.string().trim().min(1).max(40)).min(1).max(50) }).strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    return fields.reorderSections(fieldCtx(actor), input.ids);
  },
});

const sectionsDelete = defineMemberOp({
  id: "fields.sections.delete",
  method: "DELETE",
  path: "/fields/sections/{id}",
  kind: "write",
  action: "member.settings.manage",
  summary: "Delete an empty section. A section that still holds fields cannot be deleted: archive or move the fields first.",
  label: "ลบส่วนของฟิลด์",
  test: "M1.11-S1.2",
  async handler({ actor, params }) {
    return fields.deleteSection(fieldCtx(actor), requiredId(params.id));
  },
});

const fieldsCreate = defineMemberOp({
  id: "fields.create",
  method: "POST",
  path: "/fields",
  kind: "write",
  action: "member.settings.manage",
  summary: "Add a custom field to a section. The type decides which `options` apply and what a value may look like.",
  label: "เพิ่มฟิลด์",
  tool: { name: "member_field_create", hint: "Only when the shop owner asked for a new field on the member profile." },
  input: z
    .object({
      sectionId: z.string().trim().min(1).max(40),
      key: z.string().trim().min(1).max(40).describe("Stable reference used in `fields: { ... }` everywhere else."),
      label: z.string().trim().min(1).max(60),
      type: z.enum(FIELD_TYPES).describe("One of the member field types."),
      ...fieldFlags,
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    return jsonSafe(await fields.createField(fieldCtx(actor), input));
  },
});

const fieldsUpdate = defineMemberOp({
  id: "fields.update",
  method: "PATCH",
  path: "/fields/{id}",
  kind: "write",
  action: "member.settings.manage",
  summary:
    "Change a field. A system field (the ones backed by a real column such as phone or first name) only accepts label, description, order and the display or privacy switches.",
  label: "แก้ไขฟิลด์",
  input: z
    .object({
      sectionId: z.string().trim().min(1).max(40).optional(),
      key: z.string().trim().min(1).max(40).optional(),
      label: z.string().trim().min(1).max(60).optional(),
      type: z.enum(FIELD_TYPES).optional(),
      sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
      ...fieldFlags,
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    return jsonSafe(await fields.updateField(fieldCtx(actor), requiredId(params.id), input));
  },
});

const fieldsReorder = defineMemberOp({
  id: "fields.reorder",
  method: "PUT",
  path: "/fields/order",
  kind: "write",
  action: "member.settings.manage",
  summary: "Set the display order of the fields inside one section.",
  label: "เรียงลำดับฟิลด์",
  input: z
    .object({
      sectionId: z.string().trim().min(1).max(40),
      ids: z.array(z.string().trim().min(1).max(40)).min(1).max(100),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    return fields.reorderFields(fieldCtx(actor), input.sectionId, input.ids);
  },
});

const fieldsArchive = defineMemberOp({
  id: "fields.archive",
  method: "POST",
  path: "/fields/{id}/archive",
  kind: "write",
  action: "member.settings.manage",
  summary: "Hide a field from every form and list. Values already stored are kept, so archiving can be undone without losing data.",
  label: "ซ่อนฟิลด์",
  test: "M1.11-S1.2",
  async handler({ actor, params }) {
    return jsonSafe(await fields.archiveField(fieldCtx(actor), requiredId(params.id)));
  },
});

const fieldsChoicesReplace = defineMemberOp({
  id: "fields.choices.replace",
  method: "POST",
  path: "/fields/{id}/choices/replace",
  kind: "write",
  action: "member.settings.manage",
  summary:
    "Move every member sitting on one choice of a select field to another choice. Run it after you removed or renamed a choice, so no member is left pointing at a value that no longer exists.",
  label: "ย้ายค่าของตัวเลือก",
  input: z
    .object({
      from: z.string().trim().min(1).max(120).describe("The choice value being retired."),
      to: z.string().trim().min(1).max(120).describe("The choice value to move those members to. Must already exist on the field."),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    return replaceChoice(fieldCtx(actor), memberActorOf(actor), requiredId(params.id), input);
  },
});

const templatesApply = defineMemberOp({
  id: "fields.templates.apply",
  method: "POST",
  path: "/fields/templates/{key}/apply",
  kind: "write",
  action: "member.settings.manage",
  summary:
    "Apply an industry template to the member profile: it adds the sections and fields that are missing and never overwrites what the shop already changed, so running it twice does nothing the second time.",
  label: "ใช้เทมเพลตกิจการ",
  input: z
    .object({
      onlyFieldKeys: z.array(z.string().trim().min(1).max(40)).max(100).optional().describe("Add only these field keys from the template."),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    return fields.applyTemplate(fieldCtx(actor), requiredId(params.key), {
      ...(input.onlyFieldKeys ? { onlyFieldKeys: input.onlyFieldKeys } : {}),
    });
  },
});

/** รายชื่อเทมเพลตกิจการที่มีให้ (ให้เอกสาร/หน้าจออ้างถึงได้ · ไม่ใช่ op) */
export const TEMPLATE_KEYS: string[] = Object.keys(TEMPLATES);

export const FIELDS_OPS: ApiOp[] = [
  layout,
  sectionsCreate,
  sectionsUpdate,
  sectionsReorder,
  sectionsDelete,
  fieldsCreate,
  fieldsUpdate,
  fieldsReorder,
  fieldsArchive,
  fieldsChoicesReplace,
  templatesApply,
];
