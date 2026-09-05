// ops/contacts-write.ts — WRITE ของผู้ติดต่อ/กลุ่ม/รวมซ้ำ/เชื่อมระบบ (WO C3)
//
// 10 op: สร้าง/แก้/ปิดใช้งาน/เปิดใช้งานคืน/รวมซ้ำ(danger)/ข้ามคู่ซ้ำ/เชื่อมสมาชิก-CRM ·
//        สร้างกลุ่ม/เพิ่มสมาชิก/ลบสมาชิกออกจากกลุ่ม
//
// 🔴 กติกาของชั้นนี้ (เหมือน `documents-write.ts`):
//   1) ห้ามแตะ prisma ตรง ๆ — เรียกผ่าน service เท่านั้น (fitness F5) · ผลลัพธ์ผ่าน `../serialize-master.ts`
//   2) เลขภาษี+สาขาซ้ำ = บันทึกไม่ได้แน่นอน (DB มี unique index กันอยู่) ⇒ 409 `duplicate` ก่อนแม้แต่จะลองเขียน
//      · เบอร์/ชื่อซ้ำ = แค่ "เตือน" — REST ไม่มีคนกดปุ่ม "บันทึกต่อไหม" เหมือนหน้าจอ ⇒ สร้างให้เสร็จ
//        แล้วแนบ `warnings[]` กลับไป (ไม่สนนโยบาย §9.3 warn/block — นโยบายนั้นออกแบบมาคู่กับ UI ที่มีคนตัดสินใจ)
//   3) ที่อยู่รับได้ 2 แบบ: สตริงเดียว หรืออ็อบเจ็กต์แยกช่อง — ต้องส่งต่อแบบ "มีคีย์เมื่อผู้เรียกตั้งใจแตะเท่านั้น"
//      (`service.ts contactAddressFields`/`contactExtraWriteFields` ใช้ `key in input` ตัดสิน ไม่ใช่ `!== undefined`
//      ⇒ ใส่คีย์เปล่า ๆ ที่ค่าเป็น undefined ในตอนแก้ไข = ล้างข้อมูลเดิมโดยไม่ตั้งใจ — ระวังจุดนี้เป็นพิเศษ)

import { AccountContactKind, AccountLegalType } from "@prisma/client";
import { z } from "zod";
import { ERR } from "../../errors";
import {
  addContactsToGroup,
  createContactGroup,
  getContactDetail,
  getContactGroup,
  removeContactFromGroup,
  setContactGroups,
  type ContactDetail,
  type Ctx,
} from "../../contacts-list";
import { dismissMergeCandidate, mergeContacts } from "../../contact-merge";
import { linkContactTo } from "../../contact-links";
import {
  archiveContact,
  checkContactDuplicates,
  createContact,
  getContact,
  normalizePhoneTh,
  restoreContact,
  updateContact,
  type ContactDuplicateHit,
} from "../../service";
import { defineOp, type ApiOp } from "../op";
import { ApiError } from "../respond";
import { contactRow } from "../serialize-master";

/** เบอร์ที่ผู้เรียกส่งมา → รูปแบบเดียว (`08-1234-5678` → `0812345678`) — REST คืนค่าที่ normalize แล้วเสมอ
 *  (ต่างจากหน้าจอที่เก็บของดิบไว้โชว์ตามที่พิมพ์ — ผู้เรียก API ต้องการรูปแบบที่จับคู่ซ้ำได้แน่นอนกว่า) */
function normalizePhoneInput(phone: string | null | undefined): string | null | undefined {
  if (phone === undefined || phone === null) return phone;
  return normalizePhoneTh(phone) || phone;
}

/** แถวผู้ติดต่อของ REST write ops — B2 row + ฟิลด์ที่ modal เขียนได้แต่ B2 (รายการ) ไม่ต้องแสดง */
function contactWriteRow(d: ContactDetail) {
  return { ...contactRow(d), address: d.address, creditTermDays: d.creditTermDays, note: d.note };
}

// ── ตัวช่วยร่วม ─────────────────────────────────────────────────────────────

function notFoundContact(): ApiError {
  return new ApiError(404, "not_found", ERR.CONTACT_NOT_FOUND, "No such contact in this accounting book.");
}

function notFoundGroup(): ApiError {
  return new ApiError(404, "not_found", "ไม่พบกลุ่มผู้ติดต่อนี้", "No such contact group in this book.");
}

/** ผลลัพธ์ `{ ok:false, reason }` ของ service → error ที่ `mapError` แปลต่อได้ (ข้อความไทยเดิม) */
function failWith(reason: string): never {
  throw new Error(reason);
}

const addressObjectField = z
  .object({
    addressLine: z.string().max(200).nullish(),
    subdistrict: z.string().max(100).nullish(),
    district: z.string().max(100).nullish(),
    province: z.string().max(100).nullish(),
    postcode: z.string().max(10).nullish(),
    country: z.string().max(60).nullish(),
  })
  .strict();

type AddressObject = z.infer<typeof addressObjectField>;

const addressField = z
  .union([z.string().max(500), addressObjectField])
  .optional()
  .describe(
    "Either a single printable address string, or a breakdown object (addressLine/subdistrict/district/province/postcode/country). " +
      "The breakdown is joined into a single printable address automatically.",
  );

/** ที่อยู่ของคำขอ → คีย์ของ service — คืน `{}` เมื่อผู้เรียกไม่แตะช่องที่อยู่เลย (สำคัญตอนแก้ไขบางส่วน) */
function addressFieldsOf(address: string | AddressObject | undefined): Record<string, string | null> {
  if (address === undefined) return {};
  if (typeof address === "string") return { address };
  return {
    addressLine: address.addressLine ?? null,
    subdistrict: address.subdistrict ?? null,
    district: address.district ?? null,
    province: address.province ?? null,
    postcode: address.postcode ?? null,
    ...(address.country !== undefined ? { country: address.country ?? null } : {}),
  };
}

const contactFields = {
  kind: z.nativeEnum(AccountContactKind).describe("CUSTOMER, VENDOR or BOTH."),
  legalType: z.nativeEnum(AccountLegalType).optional().describe("COMPANY or PERSON. Default COMPANY."),
  name: z.string().min(1).max(200),
  taxId: z.string().max(20).nullish().describe("Thai juristic/person tax id, 13 digits. Any other length or shape returns 422."),
  taxIdCountry: z.string().max(4).nullish().describe('ISO country code of the tax id. "TH" (default) requires 13 digits; anything else skips that check.'),
  branchCode: z.string().max(10).nullish().describe('Branch code, e.g. "00000" for head office. Default "00000".'),
  branchName: z.string().max(120).nullish(),
  address: addressField,
  phone: z.string().max(40).nullish().describe("Any Thai phone format; it is normalized for duplicate matching, e.g. `08-1234-5678` becomes `0812345678`."),
  email: z.string().max(200).nullish(),
  website: z.string().max(200).nullish(),
  lineId: z.string().max(80).nullish(),
  contactPerson: z.string().max(120).nullish(),
  creditTermDays: z.number().int().min(0).max(365).optional(),
  note: z.string().max(2000).nullish(),
  code: z.string().max(20).nullish().describe('Contact number, e.g. "C00019". Omit to let the book assign the next one.'),
  groupIds: z.array(z.string().max(40)).max(50).optional().describe("Custom contact groups this contact belongs to. Replaces the whole set."),
} as const;

const contactsCreateInput = z.object(contactFields).strict();
const contactsUpdateInput = z
  .object({ ...contactFields, kind: contactFields.kind.optional(), name: contactFields.name.optional() })
  .strict();

const DUP_REASON_TH: Record<ContactDuplicateHit["reason"], (h: ContactDuplicateHit) => string> = {
  taxId: (h) => `เลขประจำตัวผู้เสียภาษี+สาขานี้มีผู้ติดต่ออยู่แล้ว: ${h.code ?? h.id}`,
  phone: (h) => `เบอร์โทรนี้ซ้ำกับผู้ติดต่อ ${h.name} (${h.code ?? h.id})`,
  name: (h) => `ชื่อนี้ซ้ำกับผู้ติดต่อ ${h.code ?? h.id}`,
};

// ── 1. สร้าง / แก้ไข ───────────────────────────────────────────────────────

const contactsCreate = defineOp({
  id: "contacts.create",
  method: "POST",
  path: "/contacts",
  kind: "write",
  action: "account.contact.manage",
  summary: "Create a customer or vendor. A matching tax id + branch code returns 409; a matching phone or name still creates the contact but returns warnings.",
  label: "สร้างผู้ติดต่อ",
  tool: { name: "account_create_contact", hint: "Use when the customer or vendor is not in the book yet. Proposed for confirmation." },
  input: contactsCreateInput,
  test: "C3-M1.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    const dup = await checkContactDuplicates(tenantId, systemId, {
      taxId: input.taxId,
      branchCode: input.branchCode,
      phone: input.phone,
      name: input.name,
    });
    const taxDup = dup.blocking.find((b) => b.reason === "taxId");
    if (taxDup) {
      throw new ApiError(409, "duplicate", DUP_REASON_TH.taxId(taxDup), "A contact with this tax id and branch code already exists.", taxDup.id);
    }
    const created = await createContact({
      tenantId,
      systemId,
      kind: input.kind,
      legalType: input.legalType,
      name: input.name,
      taxId: input.taxId ?? null,
      branchCode: input.branchCode ?? null,
      branchName: input.branchName ?? null,
      phone: normalizePhoneInput(input.phone) ?? null,
      email: input.email ?? null,
      creditTermDays: input.creditTermDays,
      note: input.note ?? null,
      code: input.code ?? undefined,
      ...(input.taxIdCountry !== undefined ? { taxIdCountry: input.taxIdCountry } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.lineId !== undefined ? { lineId: input.lineId } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
      ...addressFieldsOf(input.address),
    });
    if (input.groupIds && input.groupIds.length > 0) {
      await setContactGroups({ tenantId, systemId } satisfies Ctx, created.id, input.groupIds);
    }
    const detail = await getContactDetail({ tenantId, systemId } satisfies Ctx, created.id);
    if (!detail) throw notFoundContact();
    const warnings = dup.warnings.map((w) => DUP_REASON_TH[w.reason](w));
    return { ...contactWriteRow(detail), warnings };
  },
});

const contactsUpdate = defineOp({
  id: "contacts.update",
  method: "PATCH",
  path: "/contacts/{id}",
  kind: "write",
  action: "account.contact.manage",
  summary: "Change a contact. Only the fields that are sent are changed.",
  label: "แก้ไขผู้ติดต่อ",
  tool: { name: "account_update_contact", hint: "Only the fields sent are changed. Proposed for confirmation." },
  input: contactsUpdateInput,
  test: "C3-M1.5",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getContact(tenantId, systemId, id);
    if (!current) throw notFoundContact();
    // Fable probe (C3): แก้เลขภาษี/สาขาให้ชนกับผู้ติดต่ออื่น → DB unique index เด้งเป็น P2002 → ผู้เรียกได้ 422 ข้อความกลาง ๆ
    // ("ลองใหม่อีกครั้ง" ทั้งที่ลองกี่ครั้งก็ไม่ผ่าน) ⇒ ตรวจซ้ำก่อนเขียนให้ตอบ 409 duplicate ชี้ตัวเดิม เหมือนตอนสร้าง
    if (input.taxId !== undefined || input.branchCode !== undefined) {
      const dup = await checkContactDuplicates(tenantId, systemId, {
        taxId: input.taxId !== undefined ? input.taxId : current.taxId,
        branchCode: input.branchCode !== undefined ? input.branchCode : current.branchCode,
        excludeId: id,
      });
      const taxDup = dup.blocking.find((b) => b.reason === "taxId");
      if (taxDup) {
        throw new ApiError(409, "duplicate", DUP_REASON_TH.taxId(taxDup), "Another contact already has this tax id and branch code.", taxDup.id);
      }
    }
    await updateContact(tenantId, systemId, id, {
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.legalType !== undefined ? { legalType: input.legalType } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
      ...(input.branchCode !== undefined ? { branchCode: input.branchCode } : {}),
      ...(input.branchName !== undefined ? { branchName: input.branchName } : {}),
      ...(input.phone !== undefined ? { phone: normalizePhoneInput(input.phone) } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.creditTermDays !== undefined ? { creditTermDays: input.creditTermDays } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.taxIdCountry !== undefined ? { taxIdCountry: input.taxIdCountry } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.lineId !== undefined ? { lineId: input.lineId } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
      ...addressFieldsOf(input.address),
    });
    if (input.groupIds) await setContactGroups({ tenantId, systemId } satisfies Ctx, id, input.groupIds);
    const detail = await getContactDetail({ tenantId, systemId } satisfies Ctx, id);
    if (!detail) throw notFoundContact();
    return contactWriteRow(detail);
  },
});

// ── 2. ปิดใช้งาน / เปิดใช้งานคืน ────────────────────────────────────────────

const noBody = z.object({}).strict();

const contactsArchive = defineOp({
  id: "contacts.archive",
  method: "DELETE",
  path: "/contacts/{id}",
  kind: "write",
  action: "account.contact.manage",
  summary: "Deactivate a contact (soft delete). Its documents and history are kept untouched.",
  label: "ปิดใช้งานผู้ติดต่อ",
  input: noBody,
  test: "C3-M1.16",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getContact(tenantId, systemId, id))) throw notFoundContact();
    await archiveContact(tenantId, systemId, id);
    return { id, archived: true };
  },
});

const contactsRestore = defineOp({
  id: "contacts.restore",
  method: "POST",
  path: "/contacts/{id}/restore",
  kind: "write",
  action: "account.contact.manage",
  summary: "Reactivate a contact that was deactivated.",
  label: "เปิดใช้งานผู้ติดต่อคืน",
  input: noBody,
  test: "C3-M1.17",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getContact(tenantId, systemId, id))) throw notFoundContact();
    await restoreContact(tenantId, systemId, id);
    return { id, archived: false };
  },
});

// ── 3. รวมผู้ติดต่อซ้ำ (danger) / ข้ามคู่ที่ไม่ใช่คนเดียวกัน ──────────────────

const fieldChoiceValue = z.enum(["primary", "secondary"]);
const fieldChoicesInput = z
  .object({
    name: fieldChoiceValue.optional(),
    taxId: fieldChoiceValue.optional(),
    branchCode: fieldChoiceValue.optional(),
    address: fieldChoiceValue.optional(),
    phone: fieldChoiceValue.optional(),
    email: fieldChoiceValue.optional(),
    creditTermDays: fieldChoiceValue.optional(),
    note: fieldChoiceValue.optional(),
    partyId: fieldChoiceValue.optional(),
  })
  .strict();

// `confirm` ถูกตรวจและถอดออกที่ dispatch กลางแล้ว — schema เห็นแค่ reason
const mergeInput = z
  .object({
    keepId: z.string().min(1).max(40).describe("Id of the contact to keep."),
    mergeId: z.string().min(1).max(40).describe("Id of the contact to merge into the one to keep. It is archived and its documents move over."),
    reason: z.string().min(5).max(500).describe("Why these two are the same contact, at least 5 characters."),
    fieldChoices: fieldChoicesInput.optional().describe('Per field, pick whose value wins: "primary" (default, the one to keep) or "secondary".'),
  })
  .strict();

const contactsMerge = defineOp({
  id: "contacts.merge",
  method: "POST",
  path: "/contacts/merge",
  kind: "danger",
  action: "account.contact.merge",
  summary: "Merge two contacts into one. Every document, ledger line, group and recurring rule of the second contact moves to the first; the second is archived and points to the first.",
  label: "รวมผู้ติดต่อซ้ำ",
  tool: { name: "account_merge_contacts", hint: "Irreversible: everything of the merged contact moves to the kept one. Needs a reason and a double confirmation." },
  input: mergeInput,
  test: "C3-M1.15",
  async handler({ actor, input }) {
    const ctx: Ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const res = await mergeContacts(ctx, {
      primaryId: input.keepId,
      secondaryId: input.mergeId,
      actorId: null,
      fieldChoices: input.fieldChoices,
    });
    if (!res.ok) failWith(res.reason);
    return { primaryId: res.primaryId, secondaryId: res.secondaryId, moved: res.moved, partyMerged: res.partyMerged };
  },
});

const dismissMergeInput = z
  .object({
    aId: z.string().min(1).max(40),
    bId: z.string().min(1).max(40),
  })
  .strict();

const contactsDismissMerge = defineOp({
  id: "contacts.dismiss-merge",
  method: "POST",
  path: "/contacts/merge-candidates/dismiss",
  kind: "write",
  action: "account.contact.merge",
  summary: "Mark a suggested pair as not the same contact, so it stops showing up as a merge candidate.",
  label: "ข้ามคู่ที่ไม่ใช่คนเดียวกัน",
  input: dismissMergeInput,
  // ไม่มีข้อสอบพฤติกรรมเฉพาะใน C3 (oracle ยังไม่มี call ตรง) — ครอบด้วย C3-M5.2 (ทะเบียน id/kind/action)
  test: "C3-M5.2",
  async handler({ actor, input }) {
    const ctx: Ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const res = await dismissMergeCandidate(ctx, input.aId, input.bId);
    if (!res.ok) failWith(res.reason);
    return { ok: true };
  },
});

// ── 4. เชื่อมกับสมาชิก/CRM ──────────────────────────────────────────────────

const linkInput = z
  .object({
    target: z.enum(["member", "crm"]).describe("Which system to link to."),
    targetId: z.string().min(1).max(60).describe("Id of the member or CRM contact record in that system."),
  })
  .strict();

const contactsLink = defineOp({
  id: "contacts.link",
  method: "POST",
  path: "/contacts/{id}/links",
  kind: "write",
  action: "account.contact.manage",
  summary: "Link this contact to a member or CRM record: both start pointing at the same underlying identity.",
  label: "เชื่อมผู้ติดต่อกับสมาชิก/CRM",
  input: linkInput,
  // ไม่มีข้อสอบพฤติกรรมเฉพาะใน C3 (oracle ยังไม่มี call ตรง) — ครอบด้วย C3-M5.2 (ทะเบียน id/kind/action)
  test: "C3-M5.2",
  async handler({ actor, params, input }) {
    const ctx: Ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const res = await linkContactTo(ctx, { contactId: params.id ?? "", target: input.target, targetId: input.targetId });
    if (!res.ok) failWith(res.reason);
    return { ok: true, partyId: res.partyId };
  },
});

// ── 5. กลุ่มผู้ติดต่อที่กำหนดเอง ─────────────────────────────────────────────

const groupCreateInput = z
  .object({
    name: z.string().min(1).max(80),
    color: z.string().max(20).nullish(),
  })
  .strict();

const contactGroupsCreate = defineOp({
  id: "contact-groups.create",
  method: "POST",
  path: "/contact-groups",
  kind: "write",
  action: "account.contact.manage",
  summary: "Create a custom contact group.",
  label: "สร้างกลุ่มผู้ติดต่อ",
  input: groupCreateInput,
  test: "C3-M1.8",
  async handler({ actor, input }) {
    const ctx: Ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const res = await createContactGroup(ctx, { name: input.name, color: input.color ?? null });
    return { id: res.id, name: input.name, color: input.color ?? null, count: 0 };
  },
});

const addMembersInput = z
  .object({
    contactIds: z.array(z.string().min(1).max(40)).min(1).max(500),
  })
  .strict();

const contactGroupsAddMembers = defineOp({
  id: "contact-groups.add-members",
  method: "POST",
  path: "/contact-groups/{id}/members",
  kind: "write",
  action: "account.contact.manage",
  summary: "Add contacts to a group. Contacts already in the group are skipped; adding the same set twice adds 0.",
  label: "เพิ่มสมาชิกเข้ากลุ่ม",
  input: addMembersInput,
  test: "C3-M1.9",
  async handler({ actor, params, input }) {
    const ctx: Ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const groupId = params.id ?? "";
    if (!(await getContactGroup(ctx, groupId))) throw notFoundGroup();
    const res = await addContactsToGroup(ctx, groupId, input.contactIds);
    return { added: res.added };
  },
});

const contactGroupsRemoveMember = defineOp({
  id: "contact-groups.remove-member",
  method: "DELETE",
  path: "/contact-groups/{id}/members/{contactId}",
  kind: "write",
  action: "account.contact.manage",
  summary: "Remove one contact from a group.",
  label: "ลบสมาชิกออกจากกลุ่ม",
  input: noBody,
  test: "C3-M1.11",
  async handler({ actor, params }) {
    const ctx: Ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    // Fable probe (C3): กลุ่มของร้านอื่น → tenantDb ทำให้ลบไม่โดนอยู่แล้ว แต่เคยตอบ 200 ok หลอก ⇒ ตอบ 404 ให้ตรงความจริง
    if (!(await getContactGroup(ctx, params.id ?? ""))) throw notFoundGroup();
    await removeContactFromGroup(ctx, params.id ?? "", params.contactId ?? "");
    return { ok: true };
  },
});

export const CONTACTS_WRITE_OPS: ApiOp[] = [
  contactsCreate,
  contactsUpdate,
  contactsArchive,
  contactsRestore,
  contactsMerge,
  contactsDismissMerge,
  contactsLink,
  contactGroupsCreate,
  contactGroupsAddMembers,
  contactGroupsRemoveMember,
];
