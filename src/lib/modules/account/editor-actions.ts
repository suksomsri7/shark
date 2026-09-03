"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountDocType, AccountVatTiming, AccountWhtIncomeType } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit } from "./access";
// 🔴 ไฟล์นี้ **ไม่ import prisma** โดยเจตนา — ทุกการแตะ DB ผ่าน service/product/expense (fitness F5)
import {
  createDocument,
  updateDocument,
  issueDocument,
  getSettings,
  isVisibleDocType,
  applyEditorExtras,
  assertEditorRefs,
  cancelDraft,
  getDraftMeta,
  saveDocFavorite,
  searchContactPickerRows,
  getDocRef,
  listDocumentsPaged,
  STATUS_LABEL,
  type LineInput,
} from "./service";
import { searchProductPickerRows } from "./product";
import { computeDocTotals, type AmountOrPercent, type PriceMode } from "./totals";
import { createExpenseDoc, updateExpenseDoc, issueExpenseDoc, listExpenseDocsPaged, EXP_ROUTE, WHT_INCOME_LABEL } from "./expense";
import { createAttachment, deleteAttachment } from "./attachment";
import { uploadFile, storageEnabled } from "@/lib/storage/service";
import { editorDetailPath, editorListPath, sideOf, isAdjustType, adjustRefDocTypesFor } from "./doc-editor-config";
import type {
  ContactOption,
  DocDraftPayload,
  ProductOption,
  SaveDraftResult,
} from "@/components/account-v2/doc-editor-types";
import { packDescription, packAdjustReason } from "@/components/account-v2/doc-editor-types";

// ─────────────────────────────────────────────────────────────
// editor-actions.ts — server actions ของฟอร์มเอกสาร V2 (WO 1.3)
//
// กติกาความปลอดภัยที่ทุก action ในไฟล์นี้ต้องทำ **ตามลำดับนี้เสมอ**:
//   1) loadAccountSystem(systemId)  → ผูก tenant + ยืนยันว่าระบบนี้เป็น ACCOUNT ของ tenant ที่ล็อกอินอยู่
//   2) assertAccountCan(auth, …)    → สิทธิ์ (ห้ามพึ่งว่า "หน้าไม่โชว์ปุ่ม")
//   3) ทุก query ผูก { tenantId, systemId } — id ที่ client ส่งมาเป็นแค่ "คำขอ" ไม่ใช่ความจริง
//   4) **ตัวเลขคำนวณใหม่ฝั่ง server ทุกครั้ง** ด้วย computeDocTotals — ค่ายอดจากจอใช้เพื่อโชว์เท่านั้น
// ─────────────────────────────────────────────────────────────

const trim = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown) => {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const dateOf = (v: unknown) => {
  const s = trim(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const PRICE_MODES: PriceMode[] = ["EXCL_VAT", "INCL_VAT", "NO_VAT"];
const VAT_BPS = new Set([700, 0, -1]);

function amountOrPercent(v: unknown): AmountOrPercent {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    mode: o.mode === "percent" ? "percent" : "amount",
    satang: Math.max(0, int(o.satang)),
    percentBp: Math.min(1_000_000, Math.max(0, int(o.percentBp))),
  };
}

/** ตรวจ payload ที่มาจากเบราว์เซอร์ให้เหลือแต่ค่าที่ยอมรับได้ (ห้ามยัดค่าดิบลง prisma) */
function sanitize(payload: DocDraftPayload) {
  const v = payload.value ?? ({} as DocDraftPayload["value"]);
  const priceMode: PriceMode = PRICE_MODES.includes(v.priceMode as PriceMode)
    ? (v.priceMode as PriceMode)
    : "EXCL_VAT";
  const lines = (Array.isArray(v.lines) ? v.lines : []).slice(0, 200).map((l) => {
    const rate = int(l.vatRateBp);
    const whtRateBp = l.whtRateBp == null ? null : Math.min(10000, Math.max(0, int(l.whtRateBp)));
    const whtType = l.whtIncomeType && whtTypeOk(l.whtIncomeType) ? (l.whtIncomeType as AccountWhtIncomeType) : null;
    return {
      productId: l.productId ? trim(l.productId, 40) : null,
      name: trim(l.name, 300),
      description: trim(l.description, 1000),
      accountId: l.accountId ? trim(l.accountId, 40) : null,
      qty: Math.max(0, Number(l.qty) || 0),
      unitName: trim(l.unitName, 40),
      unitPriceSatang: Math.max(0, int(l.unitPriceSatang)),
      discount: amountOrPercent(l.discount),
      vatRateBp: VAT_BPS.has(rate) ? rate : 700,
      whtIncomeType: whtType,
      whtRateBp: whtType ? (whtRateBp ?? 0) : null,
    };
  });
  return {
    docNo: trim(v.docNo, 40),
    contactId: v.contactId ? trim(v.contactId, 40) : null,
    issueDate: dateOf(v.issueDate),
    dueDate: dateOf(v.dueDate),
    reference: trim(v.reference, 35),
    priceMode,
    autoTaxInvoice: v.autoTaxInvoice === true,
    recognizeVatNow: v.recognizeVatNow !== false,
    salesUserId: v.salesUserId ? trim(v.salesUserId, 40) : null,
    tags: (Array.isArray(v.tags) ? v.tags : []).slice(0, 20).map((t) => trim(t, 40)).filter(Boolean),
    docDiscount: amountOrPercent(v.docDiscount),
    note: trim(v.note, 2000),
    internalNote: trim(v.internalNote, 2000),
    adjustReasonCode: trim(v.adjustReasonCode, 30),
    adjustReasonText: trim(v.adjustReasonText, 500),
    lines: lines.filter((l) => l.name.length > 0),
  };
}

function whtTypeOk(v: unknown): boolean {
  return typeof v === "string" && v in WHT_INCOME_LABEL;
}

// ─────────────────── บันทึกร่าง (autosave 2 วิ + ปุ่ม) ───────────────────

/**
 * บันทึกร่าง — ครั้งแรกสร้างใหม่, ครั้งถัด ๆ ไปทับร่างเดิม (`docId` เดิม)
 * 🔴 ไม่จองเลขที่เอกสาร: เลขรันเกิดตอน `issueDocument`/`issueExpenseDoc` เท่านั้น
 *    ⇒ กดบันทึกร่าง 50 ครั้ง เลขที่ก็ยังไม่ถูกใช้ไป 50 เลข (บั๊กคลาสสิกของฟอร์มที่จองเลขตอนสร้าง)
 */
export async function saveDraftAction(payload: DocDraftPayload): Promise<SaveDraftResult> {
  const systemId = trim(payload?.systemId, 40);
  const docType = trim(payload?.docType, 40) as AccountDocType;
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(systemId);
    assertAccountCan(auth, "account.doc.create");
    const side = sideOf(docType);
    if (side === "revenue" ? !isVisibleDocType(docType) : !EXP_ROUTE[docType]) {
      return { ok: false, reason: "ยังไม่เปิดใช้เอกสารชนิดนี้" };
    }
    const v = sanitize(payload);
    if (v.lines.length === 0) return { ok: false, reason: "ต้องมีรายการอย่างน้อย 1 รายการ" };
    await assertEditorRefs(tenantId, systemId, {
      contactId: v.contactId,
      productIds: v.lines.map((l) => l.productId).filter((x): x is string => !!x),
      accountIds: v.lines.map((l) => l.accountId).filter((x): x is string => !!x),
      salesUserId: v.salesUserId,
    });

    const settings = await getSettings(tenantId, systemId);
    // 🔵 คำนวณใหม่ฝั่ง server — ยอดที่จอส่งมาไม่ถูกใช้เลย
    const totals = computeDocTotals({
      lines: v.lines.map((l) => ({
        qty: l.qty,
        unitPriceSatang: l.unitPriceSatang,
        discount: l.discount,
        vatRateBp: l.vatRateBp,
        whtRateBp: l.whtRateBp,
      })),
      priceMode: v.priceMode,
      vatRegistered: settings.vatRegistered,
      vatRateBp: settings.vatRateBp,
      docDiscount: v.docDiscount,
    });

    const lineInputs: (LineInput & { accountId: string | null; productId: string | null })[] = v.lines.map(
      (l, i) => ({
        description: packDescription(l.name, l.description),
        qty: l.qty,
        unitName: l.unitName || null,
        unitPrice: l.unitPriceSatang,
        discount: totals.lines[i]?.lineDiscount ?? 0,
        vatRateBp: l.vatRateBp,
        accountId: l.accountId,
        productId: l.productId,
      }),
    );
    const vatTiming: AccountVatTiming = v.recognizeVatNow ? "ON_ISSUE" : "ON_PAYMENT";

    // ── WO 1.6 §5.2 J — เอกสารปรับปรุงหนี้: เหตุผล (เก็บเป็นข้อความก้อนเดียวใน `adjustReason`) ──
    const isAdjust = isAdjustType(docType);
    const adjustReason = isAdjust ? packAdjustReason(v.adjustReasonCode, v.adjustReasonText) || null : null;

    let docId = trim(payload?.docId, 40);
    if (docId) {
      // ต้องเป็นร่างของระบบนี้เท่านั้น (ตรวจก่อนแตะ — updateDocument ตรวจซ้ำอีกชั้น)
      const cur = await getDraftMeta(tenantId, systemId, docId, docType);
      if (!cur) return { ok: false, reason: "ไม่พบร่างเอกสารนี้" };
      if (cur.status !== "DRAFT") return { ok: false, reason: "เอกสารที่ออกแล้วแก้ไขไม่ได้" };
      const res =
        side === "revenue"
          ? await updateDocument(tenantId, systemId, docId, {
              contactId: v.contactId,
              issueDate: v.issueDate,
              dueDate: docType === "QUOTATION" ? null : (v.dueDate ?? null),
              validUntil: docType === "QUOTATION" ? (v.dueDate ?? null) : null,
              vatMode: totals.vatMode,
              vatTiming,
              discountAmount: totals.discountAmount,
              note: v.note || null,
              adjustReason: isAdjust ? adjustReason : undefined,
              lines: lineInputs,
            })
          : await updateExpenseDoc(tenantId, systemId, docId, {
              contactId: v.contactId,
              issueDate: v.issueDate,
              dueDate: v.dueDate ?? null,
              vatMode: totals.vatMode,
              discountAmount: totals.discountAmount,
              note: v.note || null,
              adjustReason: isAdjust ? adjustReason : undefined,
              lines: lineInputs,
            });
      if (!res.ok) return { ok: false, reason: res.reason };
    } else {
      // เอกสารอ้างอิงของ wizard ขั้น ① — ตรวจว่าเป็นของ tenant/system นี้จริง + เป็นชนิดที่อนุญาตให้อ้างอิงเท่านั้น
      // (ไม่เชื่อ id ที่ client ส่งมาเฉย ๆ — กันข้ามระบบ/ปลอมชนิดเอกสาร)
      let sourceDocId: string | null = null;
      if (isAdjust && payload.refId) {
        const ref = await getDocRef(tenantId, systemId, trim(payload.refId, 40));
        if (ref && adjustRefDocTypesFor(docType).includes(ref.docType)) sourceDocId = ref.id;
      }
      const doc =
        side === "revenue"
          ? await createDocument({
              tenantId,
              systemId,
              docType,
              contactId: v.contactId,
              issueDate: v.issueDate,
              dueDate: docType === "QUOTATION" ? null : (v.dueDate ?? null),
              validUntil: docType === "QUOTATION" ? (v.dueDate ?? null) : null,
              vatMode: totals.vatMode,
              vatTiming,
              discountAmount: totals.discountAmount,
              note: v.note || null,
              adjustReason,
              sourceDocId,
              lines: lineInputs,
              createdById: userId,
            })
          : await createExpenseDoc({
              tenantId,
              systemId,
              docType,
              contactId: v.contactId,
              issueDate: v.issueDate,
              dueDate: v.dueDate ?? null,
              vatMode: totals.vatMode,
              discountAmount: totals.discountAmount,
              note: v.note || null,
              adjustReason,
              sourceDocId,
              lines: lineInputs,
              createdById: userId,
            });
      docId = doc.id;
      await writeAudit({
        tenantId,
        actorId: userId,
        action: "account.doc.create",
        targetType: "AccountDocument",
        targetId: docId,
        after: { docType, source: "editor-v2" },
      });
    }

    // ── ฟิลด์ V2 ที่ service เดิมยังไม่รู้จัก (WO 0.3 + WO 1.3) + WHT ต่อบรรทัด ──
    const after = await applyEditorExtras(tenantId, systemId, docId, {
      reference: v.reference || null,
      priceMode: v.priceMode,
      discountMode: v.docDiscount.mode === "percent" ? "PERCENT" : "AMOUNT",
      salesUserId: v.salesUserId,
      tags: v.tags,
      internalNote: v.internalNote || null,
      autoTaxInvoice: settings.vatRegistered ? v.autoTaxInvoice : null,
      whtAmount: totals.whtTotal, // พรีวิว WHT (ตัวจริงเกิดตอนรับ/จ่ายชำระ — WO 1.4)
      lineWht: v.lines.map((l) => ({ whtIncomeType: l.whtIncomeType, whtRateBp: l.whtRateBp })),
    });
    return {
      ok: true,
      docId,
      docNo: after?.docNo ?? null,
      grandTotal: after?.grandTotal ?? totals.grandTotal,
      dueTotal: totals.dueTotal,
      savedAt: Date.now(),
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกร่างไม่สำเร็จ" };
  }
}

// ─────────────────── อนุมัติ (ออกเอกสาร + จองเลข + ลง JV) ───────────────────

/**
 * อนุมัติเอกสาร = ใช้ flow เดิม (issueDocument / issueExpenseDoc) ห้ามเขียน posting ใหม่
 * `next` = สิ่งที่จะทำต่อบนหน้าเอกสาร (pay|print|email) — WO 1.4/1.5 เป็นคนรับช่วง
 */
export async function approveDocAction(formData: FormData) {
  const systemId = trim(formData.get("systemId"), 40);
  const docType = trim(formData.get("docType"), 40) as AccountDocType;
  const id = trim(formData.get("id"), 40);
  const nextRaw = trim(formData.get("next"), 10);
  const next = ["pay", "print", "email"].includes(nextRaw) ? nextRaw : "";
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.issue");

  const base = `/app/sys/${systemId}/account`;
  const detail = editorDetailPath(base, docType, id);
  const doc = await getDraftMeta(tenantId, systemId, id, docType);
  if (!doc) redirect(`${editorListPath(base, docType)}?err=${encodeURIComponent("ไม่พบเอกสาร")}`);

  const res =
    sideOf(docType) === "revenue"
      ? await issueDocument(tenantId, systemId, id)
      : await issueExpenseDoc(tenantId, systemId, id);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.issue",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { docNo: res.docNo, next } : { error: res.reason },
  });
  revalidatePath(detail);
  if (!res.ok) redirect(`${base}/${docTypeEditSuffix(docType, id)}?err=${encodeURIComponent(res.reason)}`);
  redirect(next ? `${detail}?next=${next}` : detail);
}

function docTypeEditSuffix(docType: AccountDocType, id: string): string {
  const list = editorListPath("", docType).replace(/^\//, "");
  return `${list}/${id}/edit`;
}

// ─────────────────── wizard เอกสารปรับปรุงหนี้ ขั้น ① (WO 1.6 §5.2 J) ───────────────────

export type AdjustCandidateRow = {
  id: string;
  docNo: string | null;
  issueDate: Date;
  dueDate: Date | null;
  contactName: string | null;
  grandTotalSatang: number;
  outstandingSatang: number;
  statusLabel: string;
};

export type AdjustCandidatePage = {
  rows: AdjustCandidateRow[];
  total: number;
  page: number;
  pageCount: number;
};

const EMPTY_CANDIDATES: AdjustCandidatePage = { rows: [], total: 0, page: 1, pageCount: 1 };

/**
 * แกนของขั้น ① (ไม่มีด่านสิทธิ์ — เรียกได้ตรง ๆ จากข้อสอบ house harness เพราะไม่แตะ `next/headers`)
 * `searchAdjustCandidatesAction` ด้านล่างคือชั้นห่อที่ผ่านด่าน loadAccountSystem/assertAccountCan ก่อนเรียกตัวนี้
 */
export async function buildAdjustCandidatePage(
  tenantId: string,
  systemId: string,
  docType: string,
  refDocType: string,
  filters: { contactId?: string; from?: string; to?: string; q?: string; page?: number },
): Promise<AdjustCandidatePage> {
  const dt = trim(docType, 40) as AccountDocType;
  const refDt = trim(refDocType, 40) as AccountDocType;
  if (!isAdjustType(dt) || !adjustRefDocTypesFor(dt).includes(refDt)) return EMPTY_CANDIDATES;

  const input = {
    docType: refDt,
    status: "ALL" as const,
    contactId: filters.contactId ? trim(filters.contactId, 40) : undefined,
    from: filters.from,
    to: filters.to,
    q: filters.q ? trim(filters.q, 80) : undefined,
    page: filters.page ?? 1,
    pageSize: 20,
    sort: "issueDate" as const,
  };
  const page =
    sideOf(dt) === "revenue"
      ? await listDocumentsPaged(tenantId, systemId, input)
      : await listExpenseDocsPaged(tenantId, systemId, input);

  return {
    rows: page.rows
      // ร่าง/ยกเลิก ไม่ใช่เอกสารที่อ้างอิงได้ (ยังไม่มีผลทางบัญชี หรือถูกยกเลิกไปแล้ว)
      .filter((r) => r.status !== "DRAFT" && r.status !== "CANCELLED" && r.status !== "VOIDED")
      .map((r) => ({
        id: r.id,
        docNo: r.docNo,
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        contactName: r.contact?.name ?? null,
        grandTotalSatang: r.grandTotal,
        outstandingSatang: Math.max(0, r.grandTotal - r.paidTotal),
        statusLabel: STATUS_LABEL[r.status] ?? r.status,
      })),
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
  };
}

/**
 * ขั้น ① ของ wizard CN/DN/CNR/DNR — รายการเอกสารอ้างอิงที่เลือกได้ (ระบบเดียวกัน + สิทธิ์เดียวกับสร้างเอกสาร)
 * `refDocType` ต้องอยู่ใน `adjustRefDocTypesFor(docType)` เท่านั้น (กันเลือกชนิดที่ไม่เกี่ยวข้อง)
 */
export async function searchAdjustCandidatesAction(
  systemId: string,
  docType: string,
  refDocType: string,
  filters: { contactId?: string; from?: string; to?: string; q?: string; page?: number },
): Promise<AdjustCandidatePage> {
  const { auth, tenantId } = await loadAccountSystem(trim(systemId, 40));
  assertAccountCan(auth, "account.doc.create");
  return buildAdjustCandidatePage(tenantId, systemId, docType, refDocType, filters);
}

// ─────────────────── lookup (ผู้ติดต่อ / สินค้า) ───────────────────

export async function searchContactsAction(systemId: string, q: string): Promise<ContactOption[]> {
  const { auth, tenantId } = await loadAccountSystem(trim(systemId, 40));
  assertAccountCan(auth, "account.doc.create");
  const rows = await searchContactPickerRows(tenantId, systemId, trim(q, 80));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sub: [r.taxId, r.phone].filter(Boolean).join(" · ") || undefined,
    outstandingSatang: r.outstandingSatang,
    creditTermDays: r.creditTermDays,
    priceMode: (r.defaultPriceMode as PriceMode | null) ?? null,
  }));
}

export async function searchProductsAction(systemId: string, q: string): Promise<ProductOption[]> {
  const { auth, tenantId } = await loadAccountSystem(trim(systemId, 40));
  assertAccountCan(auth, "account.doc.create");
  const rows = await searchProductPickerRows(tenantId, systemId, trim(q, 80));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sub: r.sku ?? undefined,
    priceSatang: r.salePrice ?? r.buyPrice ?? 0,
    unitName: r.unitName,
    vatRateBp: r.vatRateBp,
    accountId: r.incomeAccountId ?? r.expenseAccountId ?? null,
  }));
}

// ─────────────────── แนบไฟล์ (§5.2 H) ───────────────────

/** อัปโหลดจริง → FileAsset (คลังไฟล์ของ tenant) → AccountAttachment ผูกกับร่างเอกสาร */
export async function uploadDocAttachmentAction(
  formData: FormData,
): Promise<{ ok: true; id: string; fileName: string; fileUrl: string; mimeType: string; sizeBytes: number } | { ok: false; reason: string }> {
  const systemId = trim(formData.get("systemId"), 40);
  const documentId = trim(formData.get("documentId"), 40);
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(systemId);
    assertAccountCan(auth, "account.doc.create");
    if (!storageEnabled()) return { ok: false, reason: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (storage) — ติดต่อผู้ดูแลระบบ" };
    if (!documentId) return { ok: false, reason: "กรุณาบันทึกร่างก่อนแนบไฟล์" };
    // ไม่ต้องเช็คเอกสารเองที่นี่ — createAttachment ตรวจว่า documentId เป็นของ tenant+system นี้จริง
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, reason: "ไม่พบไฟล์ที่เลือก" };
    const up = await uploadFile(
      { tenantId },
      {
        kind: "ATTACHMENT",
        filename: file.name,
        contentType: file.type,
        data: new Uint8Array(await file.arrayBuffer()),
      },
    );
    if (!up.ok) return { ok: false, reason: up.error };
    const att = await createAttachment({
      tenantId,
      systemId,
      documentId,
      fileName: file.name.slice(0, 200),
      fileUrl: up.cdnUrl,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: userId,
    });
    if (!att.ok) return { ok: false, reason: att.reason };
    return {
      ok: true,
      id: att.id,
      fileName: file.name,
      fileUrl: up.cdnUrl,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "แนบไฟล์ไม่สำเร็จ" };
  }
}

export async function deleteDocAttachmentAction(
  systemId: string,
  attachmentId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const { auth, tenantId } = await loadAccountSystem(trim(systemId, 40));
    assertAccountCan(auth, "account.doc.create");
    return await deleteAttachment(tenantId, systemId, trim(attachmentId, 40));
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ลบไฟล์ไม่สำเร็จ" };
  }
}

// ─────────────────── รายการโปรด (ชุดบรรทัดที่บันทึกไว้ · §5.2 C) ───────────────────
// เก็บใน AccountSettings.docConfig.favorites — ไม่ต้องมีตารางใหม่ (ข้อมูลเล็ก ต่อร้าน)

export async function saveFavoriteLinesAction(
  systemId: string,
  name: string,
  lines: DocDraftPayload["value"]["lines"],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const { auth, tenantId } = await loadAccountSystem(trim(systemId, 40));
    assertAccountCan(auth, "account.doc.create");
    const label = trim(name, 60);
    if (!label) return { ok: false, reason: "กรุณาตั้งชื่อชุดรายการ" };
    const clean = sanitize({ systemId, docType: "INVOICE", value: { lines } as DocDraftPayload["value"] }).lines;
    if (clean.length === 0) return { ok: false, reason: "ไม่มีรายการให้บันทึก" };
    return await saveDocFavorite(tenantId, systemId, { name: label, lines: clean });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกรายการโปรดไม่สำเร็จ" };
  }
}

/** ยกเลิกร่างที่ autosave สร้างไว้แต่ผู้ใช้กด "ยกเลิก" (ไม่ลบ — ตั้งเป็น CANCELLED ตามกติกา) */
export async function discardDraftAction(formData: FormData) {
  const systemId = trim(formData.get("systemId"), 40);
  const docType = trim(formData.get("docType"), 40) as AccountDocType;
  const id = trim(formData.get("id"), 40);
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  const base = `/app/sys/${systemId}/account`;
  if (id) {
    const cancelled = await cancelDraft(tenantId, systemId, id);
    if (cancelled) {
      await writeAudit({
        tenantId,
        actorId: userId,
        action: "account.doc.create",
        targetType: "AccountDocument",
        targetId: id,
        after: { cancelledDraft: true },
      });
    }
  }
  revalidatePath(editorListPath(base, docType));
  redirect(editorListPath(base, docType));
}
