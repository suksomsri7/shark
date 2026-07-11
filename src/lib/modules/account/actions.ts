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
import {
  createDocument,
  updateDocument,
  issueDocument,
  convertDocument,
  recordPayment,
  voidDocument,
  setQuotationResponse,
  createContact,
  updateContact,
  archiveContact,
  saveSettings,
  type LineInput,
} from "./service";

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
  const { tenantId, userId } = await loadAccountSystem(systemId);
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
    discountAmount: Math.round((num(formData, "discountAmount") ?? 0) * 100),
    note: str(formData, "note") || null,
    adjustReason: str(formData, "adjustReason") || null,
    lines,
    createdById: userId,
  });
  revalidatePath(docPath(systemId, docType));
  redirect(`${docPath(systemId, docType)}/${doc.id}`);
}

export async function updateDocumentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const { tenantId } = await loadAccountSystem(systemId);
  await updateDocument(tenantId, systemId, id, {
    contactId: str(formData, "contactId") || null,
    issueDate: date(formData, "issueDate"),
    dueDate: date(formData, "dueDate") ?? null,
    validUntil: date(formData, "validUntil") ?? null,
    vatMode: (str(formData, "vatMode") as AccountVatMode) || undefined,
    discountAmount: Math.round((num(formData, "discountAmount") ?? 0) * 100),
    note: str(formData, "note") || null,
    lines: parseLines(formData),
  });
  revalidatePath(`${docPath(systemId, docType)}/${id}`);
  redirect(`${docPath(systemId, docType)}/${id}`);
}

export async function issueDocumentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const { tenantId } = await loadAccountSystem(systemId);
  const res = await issueDocument(tenantId, systemId, id);
  const path = `${docPath(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function convertDocumentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const toDocType = str(formData, "toDocType") as AccountDocType;
  const { tenantId, userId } = await loadAccountSystem(systemId);
  const res = await convertDocument(tenantId, systemId, id, toDocType, userId);
  if (!res.ok) {
    redirect(`${docPath(systemId, docType)}/${id}?err=${encodeURIComponent(res.reason)}`);
  }
  revalidatePath(docPath(systemId, toDocType));
  redirect(`${docPath(systemId, toDocType)}/${res.newId}`);
}

export async function recordPaymentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const { tenantId, userId } = await loadAccountSystem(systemId);
  const res = await recordPayment(tenantId, systemId, id, {
    paidAt: date(formData, "paidAt"),
    channel: (str(formData, "channel") as AccountPayChannel) || "TRANSFER",
    amount: Math.round((num(formData, "amount") ?? 0) * 100),
    note: str(formData, "note") || null,
    createdById: userId,
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
  const { tenantId } = await loadAccountSystem(systemId);
  await setQuotationResponse(tenantId, systemId, id, accepted);
  const path = `${docPath(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(path);
}

export async function voidDocumentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType");
  const id = str(formData, "id");
  const { tenantId } = await loadAccountSystem(systemId);
  await voidDocument(tenantId, systemId, id, str(formData, "reason"));
  const path = `${docPath(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(path);
}

// ─────────────────── ผู้ติดต่อ ───────────────────

export async function createContactAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { tenantId } = await loadAccountSystem(systemId);
  const name = str(formData, "name");
  if (name.length < 1) redirect(`/app/sys/${systemId}/account/contacts?err=name`);
  await createContact({
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
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
  redirect(`/app/sys/${systemId}/account/contacts`);
}

export async function updateContactAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const id = str(formData, "id");
  const { tenantId } = await loadAccountSystem(systemId);
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
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
  redirect(`/app/sys/${systemId}/account/contacts`);
}

export async function archiveContactAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const id = str(formData, "id");
  const { tenantId } = await loadAccountSystem(systemId);
  await archiveContact(tenantId, systemId, id);
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
}

// ─────────────────── ตั้งค่า ───────────────────

export async function saveSettingsAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { tenantId } = await loadAccountSystem(systemId);
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
    vatRegistered: str(formData, "vatRegistered") === "1",
    vatRateBp: num(formData, "vatRateBp") ?? 700,
    defaultDueDays: num(formData, "defaultDueDays") ?? 30,
    defaultValidDays: num(formData, "defaultValidDays") ?? 30,
    footerNote: str(formData, "footerNote") || null,
  });
  revalidatePath(`/app/sys/${systemId}/account/settings`);
  revalidatePath(`/app/sys/${systemId}`);
  redirect(`/app/sys/${systemId}/account/settings?saved=1`);
}
