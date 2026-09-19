// ops/companies.ts — op ของบริษัท (ใบ C1.10 · CRM-API §2.2)
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการ `companies.ts` ของใบ C1.3 เท่านั้น (ไม่มี prisma ในไฟล์นี้)
// AUDIT-CLASS X1: id ของบริษัท/ผู้ติดต่อ/ผู้ใช้ถูกตัดสินโดยบริการ (companyWhere · ผู้ใช้ต้องเป็นสมาชิกของร้าน) — ของคนอื่น = 404
// AUDIT-CLASS X6: เว็บไซต์รับเฉพาะ http/https (schema.httpUrl)
// AUDIT-CLASS X9: archive · merge = danger

import { z } from "zod";
import * as companies from "../../companies";
import { crmActorOf, crmCtxOf } from "../actor";
import { assertOwnerInFilter, teamInFilter } from "../filters";
import { defineCrmOp, type ApiOp } from "../op";
import { cursor, fieldsBag, flag, httpUrl, idStr, isOn, optId, optText, pageCursor, pageOfCursor, reason, take, text } from "../schema";

const SIZES = ["MICRO", "SMALL", "MEDIUM", "LARGE", "ENTERPRISE"] as const;
const ROLES = ["DECISION_MAKER", "INFLUENCER", "COORDINATOR", "BILLING", "TECHNICAL", "END_USER", "OTHER"] as const;
const SORTS = ["name", "-name", "createdAt", "-createdAt", "lastActivityAt", "-lastActivityAt", "openDealCount", "-openDealCount", "wonValueSatang", "-wonValueSatang"] as const;
const MERGE_FIELDS = ["legalName", "industry", "size", "website", "phone", "email", "emailDomain", "note"] as const;

const list = defineCrmOp({
  id: "companies.list",
  method: "GET",
  path: "/companies",
  kind: "read",
  action: "crm.company.read",
  summary: "List the companies this key can see, with filters and cursor paging.",
  label: "รายชื่อบริษัท",
  input: z
    .object({
      take,
      cursor,
      q: text(100).optional(),
      owner: text(64).optional(),
      team: text(64).optional(),
      industry: text(100).optional(),
      size: z.enum(SIZES).optional(),
      hasOpenDeals: flag,
      includeArchived: flag,
      sort: z.enum(SORTS).optional(),
    })
    .strict(),
  test: "C1.10-X6.2",
  async handler({ actor, input }) {
    const pageSize = input.take ?? 50;
    const page = pageOfCursor(input.cursor);
    const { take: _t, cursor: _c, hasOpenDeals, includeArchived, ...filters } = input;
    const r = await companies.listCompanies(crmCtxOf(actor), crmActorOf(actor), {
      ...filters,
      ...(hasOpenDeals !== undefined ? { hasOpenDeals: isOn(hasOpenDeals) } : {}),
      includeArchived: isOn(includeArchived),
      page,
      pageSize,
    });
    return { items: r.items, total: r.total, nextCursor: r.page * r.pageSize < r.total ? pageCursor(r.page + 1) : null };
  },
});

const get = defineCrmOp({
  id: "companies.get",
  method: "GET",
  path: "/companies/{id}",
  kind: "read",
  action: "crm.company.read",
  summary: "One company in full: details, contacts and their roles, deals, documents, custom fields and timeline.",
  label: "บริษัท 360",
  tool: { name: "crm_company_360", hint: "Use to read everything about one company (people, open deals, money owed) before answering." },
  test: "C1.10-X1.1",
  async handler({ actor, params }) {
    return companies.getCompany360(crmCtxOf(actor), crmActorOf(actor), params.id ?? "");
  },
});

const body = {
  legalName: optText(200),
  taxId: optText(20),
  branchCode: optText(10),
  emailDomain: optText(200),
  industry: optText(200),
  size: z.enum(SIZES).nullable().optional(),
  website: httpUrl.nullable().optional(),
  phone: optText(40),
  email: optText(200),
  note: optText(4000),
  fields: fieldsBag.nullable().optional(),
};

const create = defineCrmOp({
  id: "companies.create",
  method: "POST",
  path: "/companies",
  kind: "write",
  action: "crm.company.create",
  summary: "Create a company. A company with the same tax id, e-mail domain or a very similar name comes back as created: false with candidates.",
  label: "เพิ่มบริษัท",
  input: z.object({ name: text(200).min(1), ...body, ownerUserId: optId, teamId: optId, parentCompanyId: optId }).strict(),
  tool: { name: "crm_create_company", hint: "Use when the user wants to add a business customer; give the company name and the tax id if known." },
  test: "C1.10-X6.4",
  async handler({ actor, input }) {
    // AUDIT-CLASS X2: บริษัทใหม่ต้องลงในขอบเขตของคีย์ (ผู้ดูแล · ทีม — ตัวกรองทีมเดียว = ใช้ทีมนั้นให้)
    assertOwnerInFilter(actor, input.ownerUserId ?? actor.userId ?? null);
    const teamId = teamInFilter(actor, input.teamId ?? null);
    const r = await companies.createCompany(crmCtxOf(actor), crmActorOf(actor), { ...input, ...(teamId !== undefined ? { teamId } : {}) });
    return { companyId: r.company.id, created: r.created, company: r.company, duplicateOf: r.duplicateOf, candidates: r.candidates.map((c) => ({ companyId: c.companyId, reason: c.reason })) };
  },
});

const update = defineCrmOp({
  id: "companies.update",
  method: "PATCH",
  path: "/companies/{id}",
  kind: "write",
  action: "crm.company.update",
  summary: "Change a company's details or custom fields. A tax id that belongs to another company fails with 409.",
  label: "แก้ไขบริษัท",
  input: z.object({ name: optText(200), ...body }).strict(),
  test: "C1.10-S4.3",
  async handler({ actor, params, input }) {
    const company = await companies.updateCompany(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", input);
    return { companyId: company.id, company };
  },
});

const setOwner = defineCrmOp({
  id: "companies.setOwner",
  method: "PUT",
  path: "/companies/{id}/owner",
  kind: "write",
  action: "crm.company.update",
  summary: "Give the company to another owner (a user of this shop), or null for no owner.",
  label: "ตั้งผู้ดูแลบริษัท",
  input: z.object({ userId: idStr.nullable() }).strict(),
  test: "C1.10-S2.3",
  async handler({ actor, params, input }) {
    assertOwnerInFilter(actor, input.userId);
    const company = await companies.setOwner(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", input.userId);
    return { companyId: company.id, ownerUserId: company.ownerUserId };
  },
});

const addContact = defineCrmOp({
  id: "companies.contacts.add",
  method: "POST",
  path: "/companies/{id}/contacts",
  kind: "write",
  action: "crm.company.update",
  summary: "Link a contact to the company with a role; isPrimary makes it the contact's main company.",
  label: "เพิ่มผู้ติดต่อเข้าบริษัท",
  input: z.object({ contactId: idStr, role: z.enum(ROLES).nullable().optional(), jobTitle: optText(200), isPrimary: z.boolean().nullable().optional() }).strict(),
  test: "C1.10-X1.3",
  async handler({ actor, params, input }) {
    return companies.addContact(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", input);
  },
});

const removeContact = defineCrmOp({
  id: "companies.contacts.remove",
  method: "DELETE",
  path: "/companies/{id}/contacts/{contactId}",
  kind: "write",
  action: "crm.company.update",
  summary: "Unlink a contact from the company (the contact itself is kept).",
  label: "นำผู้ติดต่อออกจากบริษัท",
  test: "C1.10-S2.3",
  async handler({ actor, params }) {
    return companies.removeContact(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", params.contactId ?? "");
  },
});

const archive = defineCrmOp({
  id: "companies.archive",
  method: "POST",
  path: "/companies/{id}/archive",
  kind: "danger",
  action: "crm.company.delete",
  summary: "Archive a company (hidden from lists; contacts, deals and history are kept). Needs confirm: true and a reason.",
  label: "เก็บถาวรบริษัท",
  input: z.object({ reason }).strict(),
  test: "C1.10-X9.2",
  async handler({ actor, params, input }) {
    const company = await companies.archiveCompany(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { confirm: true, reason: input.reason });
    return { companyId: company.id, archivedAt: company.archivedAt };
  },
});

const duplicates = defineCrmOp({
  id: "companies.duplicates.list",
  method: "GET",
  path: "/companies/duplicates",
  kind: "read",
  action: "crm.company.merge",
  summary: "Pairs of companies that look like the same business (tax id, e-mail domain or name).",
  label: "บริษัทที่อาจซ้ำ",
  input: z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }).strict(),
  test: "C1.10-X2.1",
  async handler({ actor, input }) {
    return companies.findDuplicates(crmCtxOf(actor), crmActorOf(actor), { limit: input.limit });
  },
});

const merge = defineCrmOp({
  id: "companies.merge",
  method: "POST",
  path: "/companies/{id}/merge",
  kind: "danger",
  action: "crm.company.merge",
  summary: "Merge another company (mergeId) into this one; contacts, deals and records move over. Needs confirm: true and a reason.",
  label: "รวมบริษัท",
  input: z
    .object({
      mergeId: idStr,
      fieldChoices: z.partialRecord(z.enum(MERGE_FIELDS), z.enum(["keep", "merge"])).nullable().optional(),
      reason,
    })
    .strict(),
  test: "C1.10-S11.6",
  async handler({ actor, params, input }) {
    return companies.mergeCompanies(crmCtxOf(actor), crmActorOf(actor), { keepId: params.id ?? "", mergeId: input.mergeId, fieldChoices: input.fieldChoices ?? null, confirm: true, reason: input.reason });
  },
});

export const COMPANIES_OPS: ApiOp[] = [list, duplicates, get, create, update, setOwner, addContact, removeContact, archive, merge];
