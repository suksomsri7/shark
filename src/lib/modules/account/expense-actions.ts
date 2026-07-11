"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  AccountDocType,
  AccountVatMode,
  AccountPayChannel,
  AccountWhtIncomeType,
} from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit, mc } from "./access";
import { permissionValue } from "@/lib/core/rbac";
import {
  createExpenseDoc,
  updateExpenseDoc,
  issueExpenseDoc,
  recordVendorPayment,
  voidVendorPayment,
  voidExpenseDoc,
  receivePurchaseTaxInvoice,
  markAssetReceived,
  createPurchaseOrder,
  submitForApproval,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  convertPurchaseOrder,
  EXP_DOC_PREFIX,
  type ExpLineInput,
  type VatPurchaseMode,
} from "./expense";

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

// route slug ต่อ docType (โฟลเดอร์ที่ subagent P2 เป็นเจ้าของ)
const ROUTE_FOR: Partial<Record<AccountDocType, string>> = {
  PURCHASE: "purchase",
  EXPENSE: "expense",
  PURCHASE_ORDER: "po",
  ASSET_PURCHASE_ORDER: "po",
  ASSET_PURCHASE: "asset-buy",
  PURCHASE_TAX_INVOICE: "asset-buy",
};

function pathFor(systemId: string, docType: AccountDocType): string {
  const slug = ROUTE_FOR[docType] ?? "purchase";
  return `/app/sys/${systemId}/account/${slug}`;
}

function parseLines(fd: FormData): ExpLineInput[] {
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
        unitPrice: Math.round(Number(l.unitPrice ?? 0) * 100),
        discount: Math.round(Number(l.discount ?? 0) * 100),
        vatRateBp: l.vatRateBp !== undefined ? Number(l.vatRateBp) : undefined,
        accountId: l.accountId ? String(l.accountId) : null,
        productId: l.productId ? String(l.productId) : null,
      } as ExpLineInput;
    })
    .filter((l) => l.description.length > 0);
}

// ─────────────────── สร้าง / แก้ ───────────────────

export async function createExpenseDocAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  if (!(docType in EXP_DOC_PREFIX)) redirect(`/app/sys/${systemId}/account/purchases`);
  const lines = parseLines(formData);
  const base = pathFor(systemId, docType);
  if (lines.length === 0) redirect(`${base}?docType=${docType}&err=empty`);

  const isPO = docType === "PURCHASE_ORDER" || docType === "ASSET_PURCHASE_ORDER";
  const common = {
    tenantId,
    systemId,
    docType,
    contactId: str(formData, "contactId") || null,
    issueDate: date(formData, "issueDate"),
    dueDate: date(formData, "dueDate") ?? null,
    vatMode: (str(formData, "vatMode") as AccountVatMode) || "EXCLUDE",
    discountAmount: Math.round((num(formData, "discountAmount") ?? 0) * 100),
    note: str(formData, "note") || null,
    adjustReason: str(formData, "adjustReason") || null,
    sourceDocId: str(formData, "sourceDocId") || null,
    lines,
    createdById: userId,
  };
  const doc = isPO
    ? await createPurchaseOrder({ ...common, docType: docType as "PURCHASE_ORDER" | "ASSET_PURCHASE_ORDER" })
    : await createExpenseDoc({
        ...common,
        vatPurchaseMode: (str(formData, "vatPurchaseMode") as VatPurchaseMode) || "CLAIM",
      });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.create",
    targetType: "AccountDocument",
    targetId: doc.id,
    after: { docType, grandTotal: doc.grandTotal },
  });
  revalidatePath(base);
  redirect(`${base}/${doc.id}`);
}

export async function updateExpenseDocAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  await updateExpenseDoc(tenantId, systemId, id, {
    contactId: str(formData, "contactId") || null,
    issueDate: date(formData, "issueDate"),
    dueDate: date(formData, "dueDate") ?? null,
    vatMode: (str(formData, "vatMode") as AccountVatMode) || undefined,
    vatPurchaseMode: (str(formData, "vatPurchaseMode") as VatPurchaseMode) || undefined,
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
  const base = pathFor(systemId, docType);
  revalidatePath(`${base}/${id}`);
  redirect(`${base}/${id}`);
}

// ─────────────────── บันทึก/ออกเอกสาร ───────────────────

export async function issueExpenseDocAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.issue");
  const res = await issueExpenseDoc(tenantId, systemId, id);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.issue",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { docNo: res.docNo } : { error: res.reason },
  });
  const path = `${pathFor(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function recordVendorPaymentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.payment.record");
  const res = await recordVendorPayment(tenantId, systemId, id, {
    paidAt: date(formData, "paidAt"),
    channel: (str(formData, "channel") as AccountPayChannel) || "TRANSFER",
    financeAccountId: str(formData, "financeAccountId") || null,
    amount: Math.round((num(formData, "amount") ?? 0) * 100),
    whtAmountSatang: Math.round((num(formData, "whtAmount") ?? 0) * 100),
    whtRateBp: num(formData, "whtRateBp") ?? null,
    whtIncomeType: (str(formData, "whtIncomeType") as AccountWhtIncomeType) || null,
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
  const path = `${pathFor(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function voidVendorPaymentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const id = str(formData, "id");
  const paymentId = str(formData, "paymentId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.payment.void");
  const res = await voidVendorPayment(tenantId, systemId, id, paymentId, str(formData, "reason"));
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.payment.void",
    targetType: "AccountDocumentPayment",
    targetId: paymentId,
    after: res.ok ? { ok: true } : { error: res.reason },
  });
  const path = `${pathFor(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function voidExpenseDocAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.void");
  const res = await voidExpenseDoc(tenantId, systemId, id, str(formData, "reason"));
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.void",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { ok: true } : { error: res.reason },
  });
  const path = `${pathFor(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

// ─────────────────── ใบกำกับภาษีซื้อ / สินทรัพย์ ───────────────────

export async function receivePtxAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.payment.record");
  const res = await receivePurchaseTaxInvoice(tenantId, systemId, id);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.issue",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { received: true } : { error: res.reason },
  });
  const path = `${pathFor(systemId, "PURCHASE_TAX_INVOICE")}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function markAssetReceivedAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.issue");
  const res = await markAssetReceived(tenantId, systemId, id);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.issue",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { received: true } : { error: res.reason },
  });
  const path = `${pathFor(systemId, "ASSET_PURCHASE")}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

// ─────────────────── PO workflow ───────────────────

export async function submitApprovalAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  const res = await submitForApproval(tenantId, systemId, id);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.issue",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { docNo: res.docNo } : { error: res.reason },
  });
  const path = `${pathFor(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function approvePOAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.approve");
  // วงเงินอนุมัติ (permissionValue) — ไม่มีค่า = ไม่จำกัด (OWNER/MANAGER)
  const maxSatang = permissionValue(mc(auth), "_maxApproveSatang");
  const res = await approvePurchaseOrder(tenantId, systemId, id, userId, { maxSatang });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.approve",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { approved: true } : { error: res.reason },
  });
  const path = `${pathFor(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function rejectPOAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.approve");
  const res = await rejectPurchaseOrder(tenantId, systemId, id, str(formData, "reason"));
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.approve",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { rejected: true } : { error: res.reason },
  });
  const path = `${pathFor(systemId, docType)}/${id}`;
  revalidatePath(path);
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function convertPOAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const docType = str(formData, "docType") as AccountDocType;
  const id = str(formData, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  const res = await convertPurchaseOrder(tenantId, systemId, id, userId);
  if (!res.ok) {
    const path = `${pathFor(systemId, docType)}/${id}`;
    redirect(`${path}?err=${encodeURIComponent(res.reason)}`);
  }
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.create",
    targetType: "AccountDocument",
    targetId: res.newId,
    after: { convertedFrom: id, toDocType: res.toDocType },
  });
  const dest = pathFor(systemId, res.toDocType);
  revalidatePath(dest);
  redirect(`${dest}/${res.newId}`);
}
