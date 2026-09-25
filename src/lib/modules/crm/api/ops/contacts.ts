// ops/contacts.ts — op ของผู้ติดต่อ (ใบ C1.10 · CRM-API §2.1 · สัญญา CONTRACT BLOCK ของ qc-crm-c1.10)
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการ `contacts.ts` ของใบ C1.4 (ผ่าน C1.7 การมองเห็น · C1.8 event) เท่านั้น
//    ไม่มี prisma / tenantDb ในไฟล์นี้ (ข้อสอบ S0.5 ตรวจ)
// AUDIT-CLASS X1: ทุก id มาจาก path/body แล้วถูกตัดสินโดยบริการผ่าน `contactWhere` (ระบบอื่น/ร้านอื่น/ทีมอื่น = 404)
// AUDIT-CLASS X9: archive · merge · export = danger (dispatch ของแกนบังคับ confirm:true + reason ≥ 5 ตัว · reason ลง audit)

import { z } from "zod";
import * as contacts from "../../contacts";
import { CONSENT_SOURCES, CONTACT_SORTS, CONTACT_SOURCES, IMPORT_DUPLICATE_MODES, LEAD_STATUSES, LIFECYCLE_STAGES, MERGE_CHOICE_FIELDS, SCORE_BANDS } from "../../contacts-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { crmApiError } from "../http-errors";
import { assertNoTeamFilter, assertOwnerInFilter } from "../filters";
import { assertAdminKeyForExport, defineCrmOp, type ApiOp } from "../op";
import { cursor, fieldsBag, flag, idStr, isOn, optId, optText, reason, tags, take, text } from "../schema";

const listQuery = z
  .object({
    take,
    cursor,
    q: text(100).optional(),
    stage: z.enum(LIFECYCLE_STAGES).optional(),
    leadStatus: z.enum(LEAD_STATUSES).optional(),
    owner: text(64).optional(),
    team: text(64).optional(),
    scoreBand: z.enum(SCORE_BANDS).optional(),
    source: z.enum(CONTACT_SOURCES).optional(),
    companyId: idStr.optional(),
    includeArchived: flag,
    sort: z.enum(CONTACT_SORTS).optional(),
  })
  .strict();

const list = defineCrmOp({
  id: "contacts.list",
  method: "GET",
  path: "/contacts",
  kind: "read",
  action: "crm.contact.read",
  summary: "List the contacts this key can see, newest first, with filters and cursor paging.",
  label: "รายชื่อผู้ติดต่อ",
  input: listQuery,
  test: "C1.10-X6.2",
  async handler({ actor, input }) {
    const r = await contacts.listContacts(crmCtxOf(actor), crmActorOf(actor), {
      ...input,
      includeArchived: isOn(input.includeArchived),
      pageSize: input.take ?? 50,
    });
    return { items: r.items, nextCursor: r.nextCursor };
  },
});

const search = defineCrmOp({
  id: "contacts.search",
  method: "GET",
  path: "/contacts/search",
  kind: "read",
  action: "crm.contact.read",
  summary: "Find contacts by name, phone or e-mail (up to 20 matches).",
  label: "ค้นหาผู้ติดต่อ",
  input: z.object({ q: text(100).min(1), take }).strict(),
  test: "C1.10-X8.2",
  async handler({ actor, input }) {
    const r = await contacts.listContacts(crmCtxOf(actor), crmActorOf(actor), { q: input.q, pageSize: Math.min(20, input.take ?? 20) });
    return { items: r.items, nextCursor: null };
  },
});

const brief = defineCrmOp({
  id: "contacts.brief",
  method: "GET",
  path: "/contacts/brief",
  kind: "read",
  action: "crm.contact.read",
  summary: "Short cards (no phone or e-mail) for up to 50 contact ids, comma separated.",
  label: "การ์ดย่อผู้ติดต่อ",
  input: z.object({ ids: text(3300).min(1) }).strict(),
  test: "C1.10-X1.1",
  async handler({ actor, input }) {
    const ids = [...new Set(input.ids.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 50);
    const c = crmCtxOf(actor);
    const a = crmActorOf(actor);
    const items = [];
    for (const id of ids) {
      const b = await contacts.briefFor(c, a, { contactId: id });
      if (b) items.push(b);
    }
    return { items };
  },
});

const byParty = defineCrmOp({
  id: "contacts.byParty",
  method: "GET",
  path: "/contacts/by-party/{partyId}",
  kind: "read",
  action: "crm.contact.read",
  summary: "The contact card linked to a shared customer identity (Party id), or null when this key cannot see one.",
  label: "ผู้ติดต่อจากตัวตนลูกค้า",
  test: "C1.10-X1.2",
  async handler({ actor, params }) {
    // AUDIT-CLASS X1: Party ของร้านอื่น/ระบบอื่น/นอกการมองเห็น = null (ไม่บอกว่ามีอยู่)
    const contact = await contacts.briefFor(crmCtxOf(actor), crmActorOf(actor), { partyId: params.partyId ?? "" });
    return { contact };
  },
});

const get = defineCrmOp({
  id: "contacts.get",
  method: "GET",
  path: "/contacts/{id}",
  kind: "read",
  action: "crm.contact.read",
  summary: "One contact in full: details, owner, company, deals, custom fields, recent timeline and consent.",
  label: "ผู้ติดต่อ 360",
  tool: { name: "crm_contact_360", hint: "Use after crm_search to read everything about one contact before answering." },
  test: "C1.10-X8.3",
  async handler({ actor, params }) {
    return contacts.getContact360(crmCtxOf(actor), crmActorOf(actor), params.id ?? "");
  },
});

const createInput = z
  .object({
    firstName: text(200).min(1),
    lastName: optText(200),
    titleTh: optText(40),
    phone: optText(40),
    email: optText(200),
    companyId: optId,
    jobTitle: optText(200),
    department: optText(200),
    sourceKind: z.enum(CONTACT_SOURCES).nullable().optional(),
    sourceChannel: optText(60),
    sourceDetail: z.record(z.string().max(40), z.string().max(500)).refine((o) => Object.keys(o).length <= 50, { message: "sourceDetail มีได้ไม่เกิน 50 ช่อง" }).nullable().optional(),
    fields: fieldsBag.nullable().optional(),
    tags: tags.nullable().optional(),
    ownerUserId: optId,
    lineUserId: optText(100),
    force: z.boolean().optional(),
  })
  .strict();

const create = defineCrmOp({
  id: "contacts.create",
  method: "POST",
  path: "/contacts",
  kind: "write",
  action: "crm.contact.create",
  summary: "Create a contact (lead). A matching phone or e-mail returns the existing contact with created: false unless force is true.",
  label: "เพิ่มผู้ติดต่อ (lead)",
  input: createInput,
  tool: { name: "crm_create_lead", hint: "Use when the user wants to save a new lead or contact; give at least the first name." },
  test: "C1.10-S3.1",
  async handler({ actor, input }) {
    // AUDIT-CLASS X2: คีย์ที่มีตัวกรอง — ผู้ติดต่อใหม่ต้องลงในขอบเขตของคีย์
    assertNoTeamFilter(actor, "ผู้ติดต่อ");
    assertOwnerInFilter(actor, input.ownerUserId ?? actor.userId ?? null);
    const r = await contacts.createContact(crmCtxOf(actor), crmActorOf(actor), { ...input, sourceKind: input.sourceKind ?? "API" });
    return { contactId: r.contact.id, created: r.created, contact: r.contact, duplicates: r.duplicates.map((d) => ({ contactId: d.contactId, reason: d.reason })), warnings: r.warnings };
  },
});

const update = defineCrmOp({
  id: "contacts.update",
  method: "PATCH",
  path: "/contacts/{id}",
  kind: "write",
  action: "crm.contact.update",
  summary: "Change a contact's details or custom fields. moveOpenDeals also moves the open deals when the main company changes.",
  label: "แก้ไขผู้ติดต่อ",
  input: z
    .object({
      firstName: optText(200),
      lastName: optText(200),
      titleTh: optText(40),
      phone: optText(40),
      email: optText(200),
      jobTitle: optText(200),
      department: optText(200),
      lineUserId: optText(100),
      companyId: optId,
      moveOpenDeals: z.boolean().nullable().optional(),
      fields: fieldsBag.nullable().optional(),
    })
    .strict(),
  test: "C1.10-S2.3",
  async handler({ actor, params, input }) {
    const contact = await contacts.updateContact(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", input);
    return { contactId: contact.id, contact };
  },
});

const setLeadStatus = defineCrmOp({
  id: "contacts.setLeadStatus",
  method: "PUT",
  path: "/contacts/{id}/lead-status",
  kind: "write",
  action: "crm.contact.update",
  summary: "Set the lead status (NEW, CONTACTED, QUALIFIED, UNQUALIFIED, NURTURE).",
  label: "ตั้งสถานะ lead",
  input: z.object({ leadStatus: z.enum(LEAD_STATUSES) }).strict(),
  test: "C1.10-S2.3",
  async handler({ actor, params, input }) {
    const contact = await contacts.setLeadStatus(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", input.leadStatus);
    return { contactId: contact.id, contact };
  },
});

const assign = defineCrmOp({
  id: "contacts.assign",
  method: "PUT",
  path: "/contacts/{id}/owner",
  kind: "write",
  action: "crm.contact.update",
  summary: "Give the contact to another owner (a user of this shop), or null for no owner.",
  label: "มอบผู้ติดต่อให้ผู้ดูแล",
  input: z.object({ userId: idStr.nullable() }).strict(),
  // CRM C2.11 ▸ tool `crm_assign` (ข้อเสนอ) — ไม่เปิดประตูที่สอง: ใช้ op เดิมของใบ C1.10 ตัวนี้ตรง ๆ ◂
  tool: { name: "crm_assign", hint: "Use to propose giving a contact to another owner (a user of this shop); send userId null to take the owner away." },
  test: "C1.10-X1.3",
  async handler({ actor, params, input }) {
    // AUDIT-CLASS X1: บริการโหลดผู้ติดต่อผ่านการมองเห็นก่อนตรวจผู้ดูแลปลายทาง (มองไม่เห็น = 404) · X2: ผู้ดูแลใหม่ต้องอยู่ในตัวกรองของคีย์
    if (!(await contacts.briefFor(crmCtxOf(actor), crmActorOf(actor), { contactId: params.id ?? "" }))) throw crmApiError(404, "not_found", "ไม่พบผู้ติดต่อนี้ในระบบ CRM นี้", "The contact was not found in this CRM system.");
    assertOwnerInFilter(actor, input.userId);
    const contact = await contacts.assignContact(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { userId: input.userId });
    return { contactId: contact.id, contact };
  },
});

const setTags = defineCrmOp({
  id: "contacts.setTags",
  method: "PUT",
  path: "/contacts/{id}/tags",
  kind: "write",
  action: "crm.contact.update",
  summary: "Add and remove tags on a contact in one call.",
  label: "ตั้งแท็กผู้ติดต่อ",
  input: z.object({ add: tags.optional(), remove: tags.optional() }).strict(),
  test: "C1.10-S2.3",
  async handler({ actor, params, input }) {
    const c = crmCtxOf(actor);
    const a = crmActorOf(actor);
    const id = params.id ?? "";
    // แท็กปัจจุบันอ่านผ่านบริการ (มองไม่เห็น = 404 ก่อนเขียน) แล้วตั้งทั้งชุดด้วย setTags ของบริการ
    const cur = (await contacts.getContact360(c, a, id)).contact.tags;
    const drop = new Set((input.remove ?? []).map((t) => t.trim().toLowerCase()));
    const next = [...cur.filter((t) => !drop.has(t.toLowerCase())), ...(input.add ?? [])];
    const contact = await contacts.setTags(c, a, id, next);
    return { contactId: contact.id, tags: contact.tags };
  },
});

const setOptOut = defineCrmOp({
  id: "contacts.setOptOut",
  method: "PUT",
  path: "/contacts/{id}/opt-out",
  kind: "write",
  action: "crm.contact.update",
  summary: "Record that the contact does (true) or no longer does (false) refuse marketing messages.",
  label: "ตั้งไม่รับข่าวสาร",
  input: z.object({ optOut: z.boolean(), source: z.enum(CONSENT_SOURCES).optional() }).strict(),
  test: "C1.10-S2.3",
  async handler({ actor, params, input }) {
    const contact = await contacts.setOptOut(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { optOut: input.optOut, source: input.source ?? "API" });
    return { contactId: contact.id, marketingOptOut: contact.marketingOptOut };
  },
});

const archive = defineCrmOp({
  id: "contacts.archive",
  method: "POST",
  path: "/contacts/{id}/archive",
  kind: "danger",
  action: "crm.contact.delete",
  summary: "Archive a contact (hidden from lists; history is kept). Needs confirm: true and a reason.",
  label: "เก็บถาวรผู้ติดต่อ",
  // AUDIT-CLASS X9: confirm ถูกถอดโดย dispatch ก่อนถึงสคีมา · เหตุผลส่งต่อให้บริการ (และลง audit ของ REST)
  input: z.object({ reason }).strict(),
  test: "C1.10-X9.2",
  async handler({ actor, params, input }) {
    const contact = await contacts.archiveContact(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { confirm: true, reason: input.reason });
    return { contactId: contact.id, archivedAt: contact.archivedAt };
  },
});

const convertInput = z
  .object({
    member: z.object({ systemId: idStr }).strict().nullable().optional(),
    company: z.union([z.object({ id: idStr }).strict(), z.object({ new: z.object({ name: text(200).min(1) }).strict() }).strict()]).nullable().optional(),
    deal: z
      .object({ pipelineId: idStr, stageId: optId, title: text(200).min(1), valueSatang: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional() })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

const convert = defineCrmOp({
  id: "contacts.convert",
  method: "POST",
  path: "/contacts/{id}/convert",
  kind: "write",
  action: "crm.contact.convert",
  summary: "Convert a lead: optionally make them a member, link or create a company and open a deal. The Idempotency-Key makes a retry return the same result.",
  label: "แปลง lead",
  input: convertInput,
  tool: { name: "crm_convert", hint: "Use when a lead becomes a real customer: link or create the company and open the first deal in one step." },
  test: "C1.10-X3.2",
  async handler({ actor, params, input, idempotencyKey, requestId }) {
    // AUDIT-CLASS X2: สมัครสมาชิกผ่านการแปลง = งานของระบบสมาชิก ⇒ คีย์ต้องถือ member.customer.create ด้วย
    if (input.member && actor.kind === "apikey" && !actor.scopes.includes("member.customer.create") && !actor.scopes.includes("member.*")) {
      throw crmApiError(403, "scope_missing", "การแปลงที่สมัครสมาชิกให้ด้วย ต้องใช้คีย์ที่มีสิทธิ์เพิ่มสมาชิก (member.customer.create) — เอาตัวเลือกสมาชิกออก หรือเพิ่มสิทธิ์ให้คีย์", "Converting with a member needs the member.customer.create scope.", "ต้องการสิทธิ์ member.customer.create");
    }
    if (input.company || input.deal) assertNoTeamFilter(actor, input.deal ? "ดีล" : "บริษัท");
    assertOwnerInFilter(actor, actor.userId ?? null);
    // X3: คีย์กันซ้ำของบริการ = Idempotency-Key ของคำขอ (retry หลังแถวกันซ้ำของ REST หมดอายุก็ยังไม่สร้างดีลซ้ำ)
    return contacts.convertContact(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { ...input, idempotencyKey: idempotencyKey ?? requestId });
  },
});

const duplicates = defineCrmOp({
  id: "contacts.duplicates.list",
  method: "GET",
  path: "/contacts/duplicates",
  kind: "read",
  action: "crm.contact.merge",
  summary: "Pairs of contacts that look like the same person (same phone, e-mail or name).",
  label: "ผู้ติดต่อที่อาจซ้ำ",
  input: z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }).strict(),
  test: "C1.10-X2.1",
  async handler({ actor, input }) {
    return contacts.findDuplicates(crmCtxOf(actor), crmActorOf(actor), { limit: input.limit });
  },
});

const merge = defineCrmOp({
  id: "contacts.merge",
  method: "POST",
  path: "/contacts/{id}/merge",
  kind: "danger",
  action: "crm.contact.merge",
  summary: "Merge another contact (mergeId) into this one; deals, activities, companies and records move over. Needs confirm: true and a reason.",
  label: "รวมผู้ติดต่อ",
  input: z
    .object({
      mergeId: idStr,
      fieldChoices: z.partialRecord(z.enum(MERGE_CHOICE_FIELDS), z.enum(["keep", "merge"])).nullable().optional(),
      reason,
    })
    .strict(),
  test: "C1.10-S11.6",
  async handler({ actor, params, input }) {
    return contacts.mergeContacts(crmCtxOf(actor), crmActorOf(actor), { keepId: params.id ?? "", mergeId: input.mergeId, fieldChoices: input.fieldChoices ?? null, confirm: true, reason: input.reason });
  },
});

const importStart = defineCrmOp({
  id: "contacts.import.start",
  method: "POST",
  path: "/contacts/import",
  kind: "write",
  action: "crm.contact.import",
  summary: "Import up to 5,000 contact rows: rows are objects of column -> text, mapping says which column feeds which field.",
  label: "นำเข้าผู้ติดต่อ",
  input: z
    .object({
      // มติผู้คุมงาน C1.10 S3: ≤ 200 คอลัมน์ต่อแถว · ≤ 200 คู่ใน mapping (ทุกค่ามีเพดาน)
      rows: z.array(z.record(z.string().max(100), z.string().max(2000)).refine((o) => Object.keys(o).length <= 200, { message: "แถวหนึ่งมีได้ไม่เกิน 200 คอลัมน์" })).min(1).max(5000),
      mapping: z.record(z.string().max(100), z.string().max(100)).refine((o) => Object.keys(o).length <= 200, { message: "จับคู่คอลัมน์ได้ไม่เกิน 200 คู่" }),
      options: z.object({ onDuplicate: z.enum(IMPORT_DUPLICATE_MODES).nullable().optional(), source: z.enum(CONTACT_SOURCES).nullable().optional() }).strict().nullable().optional(),
    })
    .strict(),
  test: "C1.10-S2.3",
  async handler({ actor, input }) {
    assertNoTeamFilter(actor, "ผู้ติดต่อ");
    assertOwnerInFilter(actor, actor.userId ?? null);
    return contacts.importContacts(crmCtxOf(actor), crmActorOf(actor), { rows: input.rows, mapping: input.mapping, options: input.options ?? { source: "API" } });
  },
});

const exportCsv = defineCrmOp({
  id: "contacts.export",
  method: "POST",
  path: "/contacts/export",
  kind: "danger",
  action: "crm.contact.export",
  summary: "Export the contacts this key can see as CSV text (formula cells neutralised). Needs confirm: true and a reason.",
  label: "ส่งออกผู้ติดต่อ",
  input: z
    .object({
      reason,
      q: text(100).optional(),
      stage: z.enum(LIFECYCLE_STAGES).optional(),
      leadStatus: z.enum(LEAD_STATUSES).optional(),
      owner: text(64).optional(),
      companyId: idStr.optional(),
    })
    .strict(),
  test: "C1.10-X6.1",
  async handler({ actor, input }) {
    assertAdminKeyForExport(actor);
    const { reason: why, ...filters } = input;
    // AUDIT-CLASS X6: ทุกแถวผ่าน csvRow ของบริการ (กันสูตรในสเปรดชีต)
    const csv = await contacts.exportContacts(crmCtxOf(actor), crmActorOf(actor), { ...filters, confirm: true, reason: why });
    return { csv };
  },
});

export const CONTACTS_OPS: ApiOp[] = [
  list,
  search,
  brief,
  duplicates,
  importStart,
  exportCsv,
  byParty,
  get,
  create,
  update,
  setLeadStatus,
  assign,
  setTags,
  setOptOut,
  archive,
  convert,
  merge,
];
