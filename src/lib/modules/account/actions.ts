"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  AccountDocType,
  AccountVatMode,
  AccountPayChannel,
  AccountContactKind,
  AccountLegalType,
} from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit } from "./access";
import {
  createDocument,
  updateDocument,
  issueDocument,
  convertDocument,
  recordPayment,
  voidPayment,
  voidDocument,
  setQuotationResponse,
  createContact,
  updateContact,
  archiveContact,
  checkContactDuplicates,
  saveSettings,
  isVisibleDocType,
  ensurePublicTaxInvoiceLink,
  CONFIGURABLE_DOC_TYPES,
  ORG_PREFIXES,
  type LineInput,
  type DocTypeConfig,
} from "./service";
import type { AccountVatTiming, AccountPriceMode } from "@prisma/client";
// WO 3.3 — ชนิดของผลลัพธ์ที่ action คืนให้ client (type-only: ไม่ดึงโค้ดเข้ามาใน bundle ของ action)
import type { DbdLookupResult } from "./dbd";
import type { LinkSuggestions, LinkResult } from "./contact-links";
// WO 3.4 — type-only เช่นกัน (โค้ดจริง import แบบ dynamic ในตัว action)
import type { ContactProfile, ProfileTab } from "./contact-profile";
import type { MergeFieldChoices, MergeResult, DismissResult } from "./contact-merge";
import type { AccountDocStatus } from "@prisma/client";

// ─────────────────── helpers ───────────────────

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? undefined : Number(v);
};
const date = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v ? new Date(v) : undefined;
};

function parseLines(fd: FormData): LineInput[] {
  const raw = String(fd.get("lines") ?? "[]");
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      const l = x as Record<string, unknown>;
      return {
        description: String(l.description ?? "").trim(),
        qty: Number(l.qty ?? 0),
        unitName: l.unitName ? String(l.unitName) : null,
        // ราคาป้อนเป็นบาท → เก็บเป็นสตางค์
        unitPrice: Math.round(Number(l.unitPrice ?? 0) * 100),
        discount: Math.round(Number(l.discount ?? 0) * 100),
        vatRateBp: l.vatRateBp !== undefined ? Number(l.vatRateBp) : undefined,
      } as LineInput;
    })
    .filter((l) => l.description.length > 0);
}

const docPath = (systemId: string, docType: string) =>
  `/app/sys/${systemId}/account/docs/${docType}`;

// ─────────────────── เอกสาร ───────────────────

export async function createDocumentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  // A5: บล็อกสร้าง docType ที่ยังซ่อน (flow ไม่ครบ)
  if (!isVisibleDocType(docType)) redirect(`/app/sys/${systemId}/account`);
  const lines = parseLines(formData);
  if (lines.length === 0) redirect(`${docPath(systemId, docType)}?err=empty`);
  const doc = await createDocument({
    tenantId,
    systemId,
    docType,
    contactId: str(formData, "contactId") || null,
    issueDate: date(formData, "issueDate"),
    dueDate: date(formData, "dueDate") ?? null,
    validUntil: date(formData, "validUntil") ?? null,
    vatMode: (str(formData, "vatMode") as AccountVatMode) || "EXCLUDE",
    vatTiming: (str(formData, "vatTiming") as AccountVatTiming) || undefined,
    discountAmount: Math.round((num(formData, "discountAmount") ?? 0) * 100),
    note: str(formData, "note") || null,
    adjustReason: str(formData, "adjustReason") || null,
    lines,
    createdById: userId,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.create",
    targetType: "AccountDocument",
    targetId: doc.id,
    after: { docType, grandTotal: doc.grandTotal },
  });
  revalidatePath(docPath(systemId, docType));
  redirect(`${docPath(systemId, docType)}/${doc.id}`);
}

export async function updateDocumentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  await updateDocument(tenantId, systemId, id, {
    contactId: str(formData, "contactId") || null,
    issueDate: date(formData, "issueDate"),
    dueDate: date(formData, "dueDate") ?? null,
    validUntil: date(formData, "validUntil") ?? null,
    vatMode: (str(formData, "vatMode") as AccountVatMode) || undefined,
    vatTiming: (str(formData, "vatTiming") as AccountVatTiming) || undefined,
    discountAmount: Math.round((num(formData, "discountAmount") ?? 0) * 100),
    note: str(formData, "note") || null,
    lines: parseLines(formData),
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.create",
    targetType: "AccountDocument",
    targetId: id,
  });
  revalidatePath(`${docPath(systemId, docType)}/${id}`);
  redirect(`${docPath(systemId, docType)}/${id}`);
}

export async function issueDocumentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.issue");
  const res = await issueDocument(tenantId, systemId, id);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.issue",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { docNo: res.docNo } : { error: res.reason },
  });
  const path = `${docPath(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function convertDocumentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const toDocType = str(formData, "toDocType") as AccountDocType;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  // A5: ห้ามแปลงไป docType ที่ซ่อน
  if (!isVisibleDocType(toDocType)) {
    redirect(`${docPath(systemId, docType)}/${id}?err=${encodeURIComponent("ยังไม่เปิดใช้เอกสารชนิดนี้")}`);
  }
  const res = await convertDocument(tenantId, systemId, id, toDocType, userId);
  if (!res.ok) {
    redirect(`${docPath(systemId, docType)}/${id}?err=${encodeURIComponent(res.reason)}`);
  }
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.create",
    targetType: "AccountDocument",
    targetId: res.newId,
    after: { convertedFrom: id, toDocType },
  });
  revalidatePath(docPath(systemId, toDocType));
  redirect(`${docPath(systemId, toDocType)}/${res.newId}`);
}

export async function recordPaymentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.payment.record");
  const res = await recordPayment(tenantId, systemId, id, {
    paidAt: date(formData, "paidAt"),
    channel: (str(formData, "channel") as AccountPayChannel) || "TRANSFER",
    financeAccountId: str(formData, "financeAccountId") || null,
    amount: Math.round((num(formData, "amount") ?? 0) * 100),
    whtAmountSatang: Math.round((num(formData, "whtAmount") ?? 0) * 100),
    whtRateBp: num(formData, "whtRateBp") ?? null,
    feeAmount: Math.round((num(formData, "feeAmount") ?? 0) * 100),
    note: str(formData, "note") || null,
    createdById: userId,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.payment.record",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { status: res.status } : { error: res.reason },
  });
  const path = `${docPath(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function voidPaymentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const paymentId = str(formData, "paymentId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.payment.void");
  const res = await voidPayment(tenantId, systemId, id, paymentId, str(formData, "reason"));
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.payment.void",
    targetType: "AccountDocumentPayment",
    targetId: paymentId,
    after: res.ok ? { ok: true } : { error: res.reason },
  });
  const path = `${docPath(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function quotationResponseAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const accepted = str(formData, "accepted") === "1";
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  await setQuotationResponse(tenantId, systemId, id, accepted);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.create",
    targetType: "AccountDocument",
    targetId: id,
    after: { quotationResponse: accepted ? "ACCEPTED" : "REJECTED" },
  });
  const path = `${docPath(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(path);
}

export async function voidDocumentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.void");
  const res = await voidDocument(tenantId, systemId, id, str(formData, "reason"));
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.void",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { ok: true } : { error: res.reason },
  });
  const path = `${docPath(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

// ─────────────────── ผู้ติดต่อ ───────────────────

// ═════════════ WO 3.3 — modal ผู้ติดต่อ (SPEC §7.2 · ภาพ g5) ═════════════
//
// 🔴 ทำไม action ชุดนี้รับ object แทน FormData แล้ว **คืนค่า** แทน redirect:
//    modal ต้องขึ้นแถบเตือน "มีอยู่แล้ว: C00012" โดย**ไม่ทำให้สิ่งที่ผู้ใช้พิมพ์หาย**
//    ถ้า redirect กลับหน้าเดิม ข้อมูลในฟอร์มหายทั้งหมด = ผู้ใช้ต้องพิมพ์ใหม่ (ผิด BLUEPRINT §0.3 ข้อ 9)
//    ⇒ client เรียกผ่าน useTransition แล้วตัดสินใจเองว่าจะโชว์เตือนหรือปิด modal (pattern เดียวกับ
//      getOrCreatePublicLinkAction / ShareLinkButton)

/** ค่าที่ modal §7.2 ส่งกลับมา — ชื่อคีย์ตรงกับชื่อคอลัมน์เพื่อไล่ตามง่าย */
export type ContactFormPayload = {
  /** มี = แก้ไข · ไม่มี = เพิ่มใหม่ */
  id?: string;
  kind: string;
  legalType: string;
  name: string;
  code?: string;
  taxId?: string;
  taxIdCountry?: string;
  branchCode?: string;
  officeType?: string;
  legalEntityType?: string;
  personTitle?: string;
  contactPerson?: string;
  addressLine?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
  website?: string;
  fax?: string;
  lineId?: string;
  creditTermDays?: number;
  defaultPriceMode?: string;
  defaultWhtType?: string;
  defaultWhtRateBp?: number | null;
  bankAccountNote?: string;
  arAccountCode?: string;
  apAccountCode?: string;
  ownerUserId?: string;
  note?: string;
  tags?: string[];
  /** id ของ AccountContactGroup ที่ติ๊กไว้ (กลุ่มกำหนดเอง) — แทนที่ชุดเดิมทั้งหมด */
  groupIds?: string[];
  /** ผู้ใช้เห็นแถบเตือนซ้ำแล้วยืนยันว่า "คนละราย" → บันทึกต่อ (ใช้กับซ้ำระดับเตือนเท่านั้น) */
  confirmDuplicate?: boolean;
};

export type SaveContactResult =
  | { ok: true; id: string; code: string | null }
  | { ok: false; error: "validation"; fields: Record<string, string> }
  | {
      ok: false;
      error: "duplicate";
      /** ซ้ำกับใคร — UI เอาไปทำลิงก์ "เปิด C00012" */
      duplicate: { id: string; code: string | null; name: string; reason: string };
      /** true = นโยบาย §9.3 ตั้งเป็น "ห้าม" → ปุ่ม "บันทึกต่อไป" ต้องไม่มี */
      blocked: boolean;
    }
  | { ok: false; error: "save"; reason: string };

const CONTACT_MAXLEN: Record<string, number> = {
  name: 256, contactPerson: 100, addressLine: 200, email: 50, phone: 20,
  website: 50, fax: 20, lineId: 50, subdistrict: 100, district: 100, province: 100,
};

/** ตรวจฝั่ง server ซ้ำกับที่ modal ตรวจ inline — ห้ามเชื่อ client (ยาว/ไทย/emoji/ตัดผ่าน devtools) */
function validateContactPayload(p: ContactFormPayload): Record<string, string> {
  const f: Record<string, string> = {};
  const name = (p.name ?? "").trim();
  if (!name) f.name = "จำเป็นต้องกรอก";
  const phone = (p.phone ?? "").trim();
  if (!phone) f.phone = "จำเป็นต้องกรอก";
  for (const [k, max] of Object.entries(CONTACT_MAXLEN)) {
    const v = String((p as Record<string, unknown>)[k] ?? "");
    if (v.length > max) f[k] = `ยาวเกิน ${max} ตัวอักษร`;
  }
  const email = (p.email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) f.email = "รูปแบบอีเมลไม่ถูกต้อง";
  const taxId = (p.taxId ?? "").replace(/\D/g, "");
  if ((p.taxIdCountry ?? "TH") === "TH" && taxId && taxId.length !== 13)
    f.taxId = "เลขทะเบียนไทยต้องเป็นตัวเลข 13 หลัก";
  const branch = (p.branchCode ?? "").trim();
  if (branch && !/^\d{5}$/.test(branch)) f.branchCode = "เลขสาขาต้องเป็นตัวเลข 5 หลัก";
  if (p.creditTermDays !== undefined && (!Number.isInteger(p.creditTermDays) || p.creditTermDays < 0 || p.creditTermDays > 365))
    f.creditTermDays = "เครดิตเทอมต้องเป็นจำนวนวัน 0–365";
  const post = (p.postcode ?? "").trim();
  if (post && !/^\d{5}$/.test(post)) f.postcode = "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก";
  return f;
}

const trimOrNull = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/** เพิ่ม/แก้ไขผู้ติดต่อจาก modal §7.2 — ตรวจสิทธิ์ → ตรวจฟิลด์ → ตรวจซ้ำ → บันทึก → ผูกกลุ่ม */
export async function saveContactAction(systemId: string, payload: ContactFormPayload): Promise<SaveContactResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");

  const fields = validateContactPayload(payload);
  if (Object.keys(fields).length > 0) return { ok: false, error: "validation", fields };

  // ── ตรวจซ้ำ (SPEC §7.2 · นโยบาย §9.3) ──
  const dup = await checkContactDuplicates(tenantId, systemId, {
    taxId: payload.taxId,
    branchCode: payload.branchCode,
    phone: payload.phone,
    name: payload.name,
    excludeId: payload.id ?? null,
  });
  const hardHit = dup.blocking[0] ?? null; // เลขภาษีซ้ำ = DB ไม่ยอมอยู่แล้ว ยืนยันข้ามไม่ได้
  const softHit = dup.warnings[0] ?? null;
  if (hardHit || (softHit && !payload.confirmDuplicate)) {
    const hit = hardHit ?? softHit!;
    const blocked = !!hardHit || dup.policy === "block";
    return {
      ok: false,
      error: "duplicate",
      duplicate: { id: hit.id, code: hit.code, name: hit.name, reason: hit.reason },
      blocked,
    };
  }
  if (softHit && dup.policy === "block") {
    return {
      ok: false,
      error: "duplicate",
      duplicate: { id: softHit.id, code: softHit.code, name: softHit.name, reason: softHit.reason },
      blocked: true,
    };
  }

  const common = {
    kind: ((payload.kind || "CUSTOMER") as AccountContactKind),
    legalType: ((payload.legalType || "COMPANY") as AccountLegalType),
    name: payload.name.trim(),
    taxId: trimOrNull(payload.taxId),
    taxIdCountry: (payload.taxIdCountry || "TH").trim(),
    branchCode: trimOrNull(payload.branchCode),
    officeType: trimOrNull(payload.officeType),
    legalEntityType: trimOrNull(payload.legalEntityType),
    personTitle: trimOrNull(payload.personTitle),
    contactPerson: trimOrNull(payload.contactPerson),
    addressLine: trimOrNull(payload.addressLine),
    subdistrict: trimOrNull(payload.subdistrict),
    district: trimOrNull(payload.district),
    province: trimOrNull(payload.province),
    postcode: trimOrNull(payload.postcode),
    country: (payload.country || "TH").trim(),
    email: trimOrNull(payload.email),
    phone: trimOrNull(payload.phone),
    website: trimOrNull(payload.website),
    fax: trimOrNull(payload.fax),
    lineId: trimOrNull(payload.lineId),
    creditTermDays: payload.creditTermDays ?? 0,
    defaultPriceMode: (trimOrNull(payload.defaultPriceMode) as AccountPriceMode | null),
    defaultWhtType: trimOrNull(payload.defaultWhtType),
    defaultWhtRateBp: payload.defaultWhtRateBp ?? null,
    bankAccountNote: trimOrNull(payload.bankAccountNote),
    arAccountCode: trimOrNull(payload.arAccountCode),
    apAccountCode: trimOrNull(payload.apAccountCode),
    ownerUserId: trimOrNull(payload.ownerUserId),
    note: trimOrNull(payload.note),
    tags: payload.tags ?? [],
  };

  let id = payload.id ?? "";
  let code: string | null = null;
  try {
    if (id) {
      await updateContact(tenantId, systemId, id, { ...common, code: trimOrNull(payload.code) });
      code = trimOrNull(payload.code);
    } else {
      const created = await createContact({ tenantId, systemId, ...common, code: trimOrNull(payload.code) });
      id = created.id;
      code = created.code;
    }
  } catch (e) {
    // 🔴 ห้าม log ข้อมูลลูกค้า — ข้อความ error ของ Prisma มีค่าที่ชนอยู่ในนั้น
    const isUnique = (e as { code?: string })?.code === "P2002";
    console.error(`[account] บันทึกผู้ติดต่อไม่สำเร็จ (system=${systemId}) — ${isUnique ? "P2002" : "error"}`);
    return {
      ok: false,
      error: "save",
      reason: isUnique
        ? "เลขที่หรือเลขทะเบียนนี้มีอยู่แล้วในระบบ — เปลี่ยนค่าแล้วลองใหม่"
        : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง",
    };
  }

  if (payload.groupIds) {
    const { setContactGroups } = await import("./contacts-list");
    await setContactGroups({ tenantId, systemId }, id, payload.groupIds);
  }

  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.contact.manage",
    targetType: "AccountContact",
    targetId: id,
    after: { mode: payload.id ? "update" : "create" },
  });
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
  return { ok: true, id, code };
}

/** ค้นหานิติบุคคลจากกรมพัฒน์ฯ (ปุ่ม "ค้นหา" ข้างเลขทะเบียน · §7.2) — ไม่มีกุญแจ = { ok:false, reason } */
export async function dbdLookupAction(systemId: string, taxId: string): Promise<DbdLookupResult> {
  const { auth } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  const { lookupJuristic } = await import("./dbd");
  return lookupJuristic(taxId);
}

/** ผลลัพธ์ที่ระบบเดาให้ในบล็อก "เชื่อมกับ" (§7.2) */
export async function suggestContactLinksAction(
  systemId: string,
  input: { phone?: string; email?: string; taxId?: string; partyId?: string },
): Promise<LinkSuggestions> {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  const { suggestLinks } = await import("./contact-links");
  return suggestLinks({ tenantId, systemId }, input);
}

/** ปุ่ม "ใช่ คนเดียวกัน" — ผูก Party เดียวกันให้ผู้ติดต่อบัญชี + สมาชิก/CRM */
export async function linkContactAction(
  systemId: string,
  input: { contactId: string; target: "member" | "crm"; targetId: string },
): Promise<LinkResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  const { linkContactTo } = await import("./contact-links");
  const res = await linkContactTo({ tenantId, systemId }, input);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.contact.manage",
    targetType: "AccountContact",
    targetId: input.contactId,
    after: res.ok ? { linked: input.target } : { error: res.reason },
  });
  if (res.ok) revalidatePath(`/app/sys/${systemId}/account/contacts`);
  return res;
}

export async function createContactAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  const name = str(formData, "name");
  if (name.length < 1) redirect(`/app/sys/${systemId}/account/contacts?err=name`);
  const created = await createContact({
    tenantId,
    systemId,
    kind: (str(formData, "kind") as AccountContactKind) || "CUSTOMER",
    legalType: (str(formData, "legalType") as AccountLegalType) || "COMPANY",
    name,
    taxId: str(formData, "taxId") || null,
    branchCode: str(formData, "branchCode") || null,
    branchName: str(formData, "branchName") || null,
    address: str(formData, "address") || null,
    phone: str(formData, "phone") || null,
    email: str(formData, "email") || null,
    creditTermDays: num(formData, "creditTermDays") ?? 0,
    note: str(formData, "note") || null,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.contact.manage",
    targetType: "AccountContact",
    targetId: created.id,
    after: { name },
  });
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
  redirect(`/app/sys/${systemId}/account/contacts`);
}

export async function updateContactAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  await updateContact(tenantId, systemId, id, {
    kind: (str(formData, "kind") as AccountContactKind) || undefined,
    legalType: (str(formData, "legalType") as AccountLegalType) || undefined,
    name: str(formData, "name") || undefined,
    taxId: str(formData, "taxId") || null,
    branchCode: str(formData, "branchCode") || null,
    branchName: str(formData, "branchName") || null,
    address: str(formData, "address") || null,
    phone: str(formData, "phone") || null,
    email: str(formData, "email") || null,
    creditTermDays: num(formData, "creditTermDays"),
    note: str(formData, "note") || null,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.contact.manage",
    targetType: "AccountContact",
    targetId: id,
  });
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
  redirect(`/app/sys/${systemId}/account/contacts`);
}

export async function archiveContactAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  await archiveContact(tenantId, systemId, id);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.contact.manage",
    targetType: "AccountContact",
    targetId: id,
    after: { archived: true },
  });
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
}

// ─────────────────── ผู้ติดต่อ V2 (WO 3.2 — กลุ่ม/ผู้ติดต่อยอดนิยม) ───────────────────

export async function createContactGroupAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const name = str(formData, "name");
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  if (!name) redirect(`/app/sys/${systemId}/account/contacts?err=groupname#new-group`);
  const { createContactGroup } = await import("./contacts-list");
  await createContactGroup({ tenantId, systemId }, { name, color: str(formData, "color") || null });
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
  redirect(`/app/sys/${systemId}/account/contacts`);
}

export async function addContactsToGroupAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const groupId = str(formData, "groupId");
  const ids = str(formData, "contactIds").split(",").map((s) => s.trim()).filter(Boolean);
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  const { addContactsToGroup } = await import("./contacts-list");
  const res = await addContactsToGroup({ tenantId, systemId }, groupId, ids);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.contact.manage",
    targetType: "AccountContactGroup",
    targetId: groupId,
    after: { addedContactIds: ids, added: res.added },
  });
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
  redirect(`/app/sys/${systemId}/account/contacts?group=custom:${groupId}`);
}

export async function removeContactFromGroupAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const groupId = str(formData, "groupId");
  const contactId = str(formData, "contactId");
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  const { removeContactFromGroup } = await import("./contacts-list");
  await removeContactFromGroup({ tenantId, systemId }, groupId, contactId);
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
}

// "+ เพิ่มผู้ติดต่อยอดนิยม" (§7.1) — เลือกได้หลายราย ดัชนีอ้าง POPULAR_VENDORS · dedupe ด้วย taxId ในชั้น data layer
export async function insertPopularVendorsAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const indexes = formData.getAll("vendorIndex").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0);
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  const { insertPopularVendors } = await import("./contacts-list");
  const res = await insertPopularVendors({ tenantId, systemId }, indexes);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.contact.manage",
    targetType: "AccountContact",
    targetId: "popular-vendors",
    after: res,
  });
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
  redirect(`/app/sys/${systemId}/account/contacts`);
}

// ─────────────────── ตั้งค่า ───────────────────

// §5.6 สร้างลิงก์สาธารณะให้ลูกค้าขอใบกำกับภาษี (QR/ลิงก์บนใบเสร็จ)
export async function ensurePublicLinkAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.issue");
  const res = await ensurePublicTaxInvoiceLink(tenantId, systemId, id);
  const path = `/app/sys/${systemId}/account/docs/${docType}/${id}`;
  if (!res.ok) redirect(`${path}?err=${encodeURIComponent(res.reason)}`);
  await writeAudit({ tenantId, actorId: userId, action: "account.doc.public_link", targetType: "AccountDocument", targetId: id });
  revalidatePath(path);
  redirect(path);
}

// WO 1.5 — ปุ่ม "แชร์ลิงก์" บนหน้าเอกสาร V2: สร้าง token ถ้ายังไม่มี แล้วคืนค่าตรง ๆ (ไม่ redirect)
// ให้ client component คัดลอกลิงก์เข้าคลิปบอร์ดได้ทันทีโดยไม่รีโหลดหน้า — ใช้ ensurePublicTaxInvoiceLink เดิม
export async function getOrCreatePublicLinkAction(
  systemId: string,
  docId: string,
): Promise<{ ok: true; token: string } | { ok: false; reason: string }> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.issue");
  const res = await ensurePublicTaxInvoiceLink(tenantId, systemId, docId);
  if (res.ok) {
    await writeAudit({ tenantId, actorId: userId, action: "account.doc.public_link", targetType: "AccountDocument", targetId: docId });
  }
  return res;
}

export async function saveSettingsAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.settings.manage");
  // §3.8 per-docType config จากฟอร์ม (dt_{DOCTYPE}_prefix / _auto / _public)
  const docTypes: Record<string, DocTypeConfig> = {};
  for (const dt of CONFIGURABLE_DOC_TYPES) {
    const prefix = str(formData, `dt_${dt}_prefix`);
    const autoTaxInvoice = formData.get(`dt_${dt}_auto`) === "on";
    const publicLink = formData.get(`dt_${dt}_public`) === "on";
    if (prefix || autoTaxInvoice || publicLink) {
      docTypes[dt] = {
        ...(prefix ? { prefix } : {}),
        ...(autoTaxInvoice ? { autoTaxInvoice: true } : {}),
        ...(publicLink ? { publicLink: true } : {}),
      };
    }
  }
  await saveSettings(tenantId, systemId, {
    // รับเฉพาะค่าที่อยู่ในรายการ — กันค่าที่ยิงตรงมาจากนอกฟอร์ม
    orgPrefix: (ORG_PREFIXES as readonly string[]).includes(str(formData, "orgPrefix"))
      ? str(formData, "orgPrefix") || null
      : null,
    orgName: str(formData, "orgName"),
    orgNameEn: str(formData, "orgNameEn") || null,
    taxId: str(formData, "taxId") || null,
    branchCode: str(formData, "branchCode") || "00000",
    branchName: str(formData, "branchName") || null,
    address: str(formData, "address") || null,
    phone: str(formData, "phone") || null,
    email: str(formData, "email") || null,
    website: str(formData, "website") || null,
    logoUrl: str(formData, "logoUrl") || null,
    stampUrl: str(formData, "stampUrl") || null,
    signatureUrl: str(formData, "signatureUrl") || null,
    vatRegistered: str(formData, "vatRegistered") === "1",
    vatRateBp: num(formData, "vatRateBp") ?? 700,
    taxPointBasis: (str(formData, "taxPointBasis") as AccountVatTiming) || "ON_ISSUE",
    defaultDueDays: num(formData, "defaultDueDays") ?? 30,
    defaultValidDays: num(formData, "defaultValidDays") ?? 30,
    footerNote: str(formData, "footerNote") || null,
    docTypes,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "AccountSettings",
    targetId: systemId,
  });
  revalidatePath(`/app/sys/${systemId}/account/settings`);
  revalidatePath(`/app/sys/${systemId}`);
  redirect(`/app/sys/${systemId}/account/settings?saved=1`);
}

// ═══════════════════════════════════════════════════════════════
// WO 3.4 — โปรไฟล์ผู้ติดต่อ 360° + รวมผู้ติดต่อซ้ำ (SPEC §7.1/§7.3 · ภาพ g6/g7/g19)
// ═══════════════════════════════════════════════════════════════

/** โหลดข้อมูลแผงโปรไฟล์ 360° ให้ฝั่ง client (แผงเลื่อนในหน้ารายการเปิดตอนคลิกแถว — ไม่โหลดล่วงหน้าทุกแถว) */
export async function loadContactProfileAction(
  systemId: string,
  contactId: string,
  opts?: { tab?: ProfileTab; docType?: AccountDocType | null; status?: AccountDocStatus | null; page?: number },
): Promise<ContactProfile | null> {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  const { contactProfile } = await import("./contact-profile");
  return contactProfile({ tenantId, systemId }, contactId, {
    base: `/app/sys/${systemId}/account`,
    tab: opts?.tab,
    docType: opts?.docType ?? null,
    status: opts?.status ?? null,
    page: opts?.page,
  });
}

/** ปุ่ม "รวมผู้ติดต่อ" (g7) — สิทธิ์แยกจากการแก้ผู้ติดต่อทั่วไป (account.contact.merge · WO 0.3) */
export async function mergeContactsAction(
  systemId: string,
  input: { primaryId: string; secondaryId: string; fieldChoices?: MergeFieldChoices },
): Promise<MergeResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.merge");
  const { mergeContacts } = await import("./contact-merge");
  const res = await mergeContacts({ tenantId, systemId }, { ...input, actorId: userId });
  if (res.ok) {
    revalidatePath(`/app/sys/${systemId}/account/contacts`);
    revalidatePath(`/app/sys/${systemId}/account/contacts/merge`);
  }
  return res;
}

/** ปุ่ม "ข้าม" (= ไม่ใช่คนเดียวกัน) ของ g7 */
export async function dismissMergeCandidateAction(
  systemId: string,
  input: { aId: string; bId: string },
): Promise<DismissResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.merge");
  const { dismissMergeCandidate } = await import("./contact-merge");
  const res = await dismissMergeCandidate({ tenantId, systemId }, input.aId, input.bId);
  if (res.ok) {
    await writeAudit({
      tenantId,
      actorId: userId,
      action: "account.contact.merge",
      targetType: "AccountContact",
      targetId: input.aId,
      after: { dismissedWith: input.bId },
    });
    revalidatePath(`/app/sys/${systemId}/account/contacts/merge`);
  }
  return res;
}
