// ops/contacts-read.ts — READ ของผู้ติดต่อ: รายการ/โปรไฟล์/กลุ่ม/คู่ซ้ำ/ข้อเสนอเชื่อม/DBD (WO B2)
//
// ทุก op ที่นี่ `kind: "read"` — ห้ามแตะ prisma ตรง ๆ (fitness F5) เรียกผ่าน service เท่านั้น
// ทุกก้อนผ่าน `../serialize-master.ts` เสมอ (ห้าม spread แถว prisma — อ่านกติกาในหัวไฟล์นั้น)
//
// เรื่องที่พลาดง่ายและถูกดักไว้ตรงนี้:
//   · ค่าเริ่มต้นของ `group` (ไม่ส่ง `group` มาเลย) ต้อง = "ใช้งานอยู่" (ไม่รวมปิดใช้งาน) ไม่ใช่ "ทั้งหมด"
//     ของหน้าจอ — ผู้เรียก REST ที่ไม่กรองอะไรเลยไม่ควรได้ผู้ติดต่อที่ปิดใช้งานปนมาแบบไม่รู้ตัว
//   · DBD ไม่มีกุญแจ/ล่ม/timeout **ไม่ใช่** ข้อมูลผิด (422) — เป็นปัญหาที่ปลายทางเรา (503 upstream_unavailable)
//   · เลขทะเบียนนิติบุคคลต้อง 13 หลักพอดีก่อนยิงออกไปข้างนอกเลย (กันยิง DBD ทิ้งเปล่า ๆ)

import { z } from "zod";
import { AccountDocType } from "@prisma/client";
// 🔴 ห้าม import แบบ static: `contact-profile.ts` ลาก `./ui`/`doc-editor-config` ที่แตะ session/env ตอนโหลด
//    ⇒ ทะเบียน op (ซึ่ง fitness/CI โหลดโดยไม่มี .env) จะพังตั้งแต่ import — โหลดตอนใช้จริงเท่านั้น (บทเรียน WO 1.9/8.2)
const loadProfileSvc = () => import("../../contact-profile");
import { getContactForLinking, suggestLinks } from "../../contact-links";
import { listMergeCandidates } from "../../contact-merge";
import { loadContactsSidebar, listContactsPage, type ContactGroupKey } from "../../contacts-list";
import { DBD_REASON, lookupJuristic } from "../../dbd";
import { ERR } from "../../errors";
import { listDocumentsPaged } from "../../service";
import { defineOp, type ApiOp } from "../op";
import { ApiError, paged, type PagedInfo } from "../respond";
import { docRow } from "../serialize";
import { contactProfileView, contactRow, linkSuggestionsView, mergeCandidateView } from "../serialize-master";

const noQuery = z.object({}).strict();

/** ซองแบ่งหน้าจากรูปแบบ `{rows,total,page,pageSize,pageCount}` ที่ service เกือบทุกตัวคืน — คำนวณ `hasMore` ที่เดียว */
function pageInfoOf(res: { page: number; pageSize: number; pageCount: number; total: number }): PagedInfo {
  return { page: res.page, pageSize: res.pageSize, pageCount: res.pageCount, total: res.total, hasMore: res.page < res.pageCount };
}

// ── group ของ contacts.list ───────────────────────────────────────────────
// ครอบคลุมค่าที่คู่มือประกาศเป๊ะ ๆ ("active" เป็นค่าเริ่มต้นภายในเท่านั้น ไม่ใช่ค่าที่เอกสารให้ผู้เรียกพิมพ์เอง)
const GROUP_RE = /^(all|customer|regular|vendor|archived|custom:[^:]+|source:(member|crm|chat|pos|imported))$/;

const contactsListInput = z
  .object({
    q: z.string().max(200).optional().describe("Free text: name, tax id, phone or email."),
    group: z
      .string()
      .max(80)
      .regex(GROUP_RE, 'Unknown group. Use "all", "customer", "regular", "vendor", "archived", "custom:<groupId>" or "source:<member|crm|chat|pos|imported>".')
      .optional()
      .describe('Sidebar group filter. Default: contacts that are not archived (equivalent to "all" minus "archived").'),
    legalType: z.enum(["COMPANY", "PERSON"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().optional(),
  })
  .strict();

const contactsList = defineOp({
  id: "contacts.list",
  method: "GET",
  path: "/contacts",
  kind: "read",
  action: "account.doc.view",
  paged: true,
  summary: "List contacts (customers and vendors) with the sidebar filters, search and paging.",
  label: "รายการผู้ติดต่อ",
  input: contactsListInput,
  test: "B2-C1.1",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const sidebar = await loadContactsSidebar(ctx);
    const group: ContactGroupKey = (input.group as ContactGroupKey | undefined) ?? "active";
    const result = await listContactsPage(
      ctx,
      { q: input.q, group, legalType: input.legalType, page: input.page, pageSize: input.pageSize },
      sidebar,
    );
    return paged(result.rows.map(contactRow), pageInfoOf(result), {
      summary: {
        all: sidebar.counts.all,
        customer: sidebar.counts.customer,
        vendor: sidebar.counts.vendor,
        archived: sidebar.counts.archived,
        active: sidebar.counts.all - sidebar.counts.archived,
        regular: sidebar.counts.regular,
      },
    });
  },
});

const contactsGet = defineOp({
  id: "contacts.get",
  method: "GET",
  path: "/contacts/{id}",
  kind: "read",
  action: "account.doc.view",
  summary: "One contact profile: header, info, KPI, latest documents, custom groups and links to member/CRM/chat.",
  label: "โปรไฟล์ผู้ติดต่อ",
  input: noQuery,
  test: "B2-C2.1",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const ctx = { tenantId, systemId };
    const id = params.id ?? "";
    // tab "links" คำนวณ header/info/kpi เหมือนทุก tab + เติม linksTab.cards (ต้องใช้ตัดสิน `links.*`)
    const profile = await (await loadProfileSvc()).contactProfile(ctx, id, { tab: "links", base: "" });
    if (!profile) throw new Error(ERR.CONTACT_NOT_FOUND);
    const [groups, docsPage] = await Promise.all([
      loadProfileSvc().then((m) => m.listContactGroupsOf(ctx, id)),
      listDocumentsPaged(tenantId, systemId, { contactId: id, page: 1, pageSize: 10 }),
    ]);
    return contactProfileView(profile, groups, docsPage.rows);
  },
});

const contactsDocumentsInput = z
  .object({
    type: z.nativeEnum(AccountDocType).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().optional(),
  })
  .strict();

const contactsDocuments = defineOp({
  id: "contacts.documents",
  method: "GET",
  path: "/contacts/{id}/documents",
  kind: "read",
  action: "account.doc.view",
  paged: true,
  summary: "Documents of one contact, any type, newest first.",
  label: "เอกสารของผู้ติดต่อรายนี้",
  input: contactsDocumentsInput,
  test: "B2-C2.7",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const res = await listDocumentsPaged(tenantId, systemId, {
      contactId: id,
      docType: input.type,
      page: input.page,
      pageSize: input.pageSize,
    });
    return paged(res.rows.map(docRow), pageInfoOf(res));
  },
});

const contactGroupsList = defineOp({
  id: "contact-groups.list",
  method: "GET",
  path: "/contact-groups",
  kind: "read",
  action: "account.doc.view",
  summary: "Custom contact groups of this accounting book, with member counts.",
  label: "กลุ่มผู้ติดต่อที่กำหนดเอง",
  input: noQuery,
  test: "B2-C1.9",
  async handler({ actor }) {
    const sidebar = await loadContactsSidebar({ tenantId: actor.tenantId, systemId: actor.systemId });
    return sidebar.counts.custom.map((g) => ({ id: g.id, name: g.name, color: g.color, count: g.count }));
  },
});

const mergeCandidates = defineOp({
  id: "contacts.merge-candidates",
  method: "GET",
  path: "/contacts/merge-candidates",
  kind: "read",
  action: "account.contact.merge",
  summary: "Pairs of contacts that look like duplicates (same tax id, same phone, or a very similar name).",
  label: "คู่ผู้ติดต่อที่อาจซ้ำกัน",
  input: noQuery,
  test: "B2-C3.1",
  async handler({ actor }) {
    const rows = await listMergeCandidates({ tenantId: actor.tenantId, systemId: actor.systemId });
    return rows.map(mergeCandidateView);
  },
});

const linkSuggestions = defineOp({
  id: "contacts.link-suggestions",
  method: "GET",
  path: "/contacts/{id}/link-suggestions",
  kind: "read",
  action: "account.contact.manage",
  summary: "Member and CRM records that might be the same person as this contact, guessed from phone/email/tax id.",
  label: "ข้อเสนอเชื่อมกับสมาชิก/CRM",
  input: noQuery,
  test: "B2-C3.3",
  async handler({ actor, params }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const id = params.id ?? "";
    const contact = await getContactForLinking(ctx, id);
    if (!contact) throw new Error(ERR.CONTACT_NOT_FOUND);
    const suggestions = await suggestLinks(ctx, {
      phone: contact.phone,
      email: contact.email,
      taxId: contact.taxId,
      partyId: contact.partyId,
    });
    return linkSuggestionsView(suggestions);
  },
});

const lookupTaxId = defineOp({
  id: "contacts.lookup-tax-id",
  method: "GET",
  path: "/contacts/lookup-tax-id/{taxId}",
  kind: "read",
  action: "account.contact.manage",
  summary: "Look up a Thai juristic person by 13 digit tax id at the Department of Business Development (DBD).",
  label: "ค้นหานิติบุคคลจากกรมพัฒนาธุรกิจการค้า",
  input: noQuery,
  test: "B2-C3.4",
  async handler({ params }) {
    const taxId = params.taxId ?? "";
    if (!/^\d{13}$/.test(taxId)) throw new Error(DBD_REASON.badTaxId);
    const result = await lookupJuristic(taxId);
    if (result.ok) {
      return { taxId: result.taxId, name: result.name, nameEn: result.nameEn, address: result.address, status: result.status };
    }
    // "ไม่พบ..." → mapError จับคำนี้เป็น 404 not_found เอง (ไม่ต้องคิดรหัสเอง)
    if (result.reason === DBD_REASON.notFound) throw new Error(result.reason);
    // ไม่มีกุญแจ / ยิงไม่ถึง / เกินเวลา — ไม่ใช่ความผิดของคำขอ ⇒ 503 ไม่ใช่ 422
    throw new ApiError(
      503,
      "upstream_unavailable",
      result.reason,
      "The DBD company registry lookup is not configured or not reachable right now.",
    );
  },
});

export const CONTACTS_READ_OPS: ApiOp[] = [
  contactsList,
  contactsGet,
  contactsDocuments,
  contactGroupsList,
  mergeCandidates,
  linkSuggestions,
  lookupTaxId,
];
