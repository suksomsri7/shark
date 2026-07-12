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
  saveSettings,
  isVisibleDocType,
  ensurePublicTaxInvoiceLink,
  CONFIGURABLE_DOC_TYPES,
  type LineInput,
  type DocTypeConfig,
} from "./service";
import type { AccountVatTiming } from "@prisma/client";

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
