import { notFound, redirect } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { thaiDateKey } from "@/lib/ui/date";
import { storageEnabled } from "@/lib/storage/service";
import { getAccMode } from "@/components/account-v2/mode";
import { DocEditorV2 } from "@/components/account-v2/DocEditorV2";
import {
  newLineDraft,
  unpackDescription,
  unpackAdjustReason,
  type AttachmentView,
  type DocDraftValue,
  type FavoriteSet,
  type LineDraft,
  type StepView,
} from "@/components/account-v2/doc-editor-types";
import { requireAccountPage } from "./guard";
// 🔴 หน้านี้ **ไม่ import prisma** — ทุกการอ่าน DB ผ่านชั้น service/product (fitness F5)
import {
  docChainMap,
  getDocFavorites,
  getDocument,
  getDocRef,
  getSettings,
  listContacts,
  listTenantMembers,
  listUsedTags,
  outstandingByContacts,
  previewNextDocNo,
  priceModeOf,
  creditAvailableNow,
} from "./service";
import { previewNextExpenseDocNo, creditAvailableExpenseNow } from "./expense";
import { listPaymentChannels } from "./payment";
import { listExpenseAccounts, listIncomeAccounts, listProducts, listUnits } from "./product";
import { listAttachments } from "./attachment";
import {
  canCreateDirect,
  dueLabelOf,
  editorDefOf,
  editorDetailPath,
  editorListPath,
  requiresLineAccount,
  sideOf,
  STEP_CODE,
  stepChainFor,
  stepLabelOf,
  isAdjustType,
  adjustRefDocTypesFor,
  adjustRefLabelFor,
  adjustSeedContact,
} from "./doc-editor-config";

// ─────────────────────────────────────────────────────────────
// DocEditorPage — ตัวประกอบหน้า (server) ของฟอร์ม V2
// route ทั้ง 20 เส้น (รายรับ 8 × [new|edit] ผ่าน [docType] + รายจ่าย 9 × [new|edit]) เรียกตัวนี้ตัวเดียว
// ⇒ กติกาสิทธิ์/การโหลดข้อมูล/ค่าเริ่มต้น อยู่ที่เดียว ไม่มีทางหลุดไปทีละหน้า
// ─────────────────────────────────────────────────────────────

/** ISO + n วัน (คำนวณบนสตริง ไม่พึ่ง TZ ของเครื่อง) */
function isoPlusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isoOf = (d: Date | null | undefined) => (d ? thaiDateKey(d) : "");

export async function DocEditorPage({
  systemId,
  docType,
  docId,
  refId,
}: {
  systemId: string;
  docType: AccountDocType;
  docId?: string;
  /** WO 1.6 §5.2 J — เอกสารอ้างอิงที่เลือกจากขั้น ① ของ wizard (เฉพาะตอนสร้างใหม่ `?ref=<id>`) */
  refId?: string;
}) {
  const def = editorDefOf(docType);
  if (!def) notFound();
  const { tenantId } = await requireAccountPage(systemId, "account.doc.create");
  const base = `/app/sys/${systemId}/account`;
  const listPath = editorListPath(base, docType);
  const adjustMode = isAdjustType(docType);

  const settings = await getSettings(tenantId, systemId);
  // โหมดง่าย/นักบัญชี ตัดสินฝั่ง server จากคุกกี้ (§0.3-1) แล้วส่งลงเป็น prop — ห้ามให้ client เดาเอง
  const accMode = await getAccMode();
  if (docType === "TAX_INVOICE" && !settings.vatRegistered) notFound();
  if (!docId && !canCreateDirect(docType)) {
    // ชนิดที่เกิดจากการแปลงเท่านั้น — เข้าหน้า "สร้าง" ตรง ๆ ไม่ได้ (§5.1)
    redirect(`${listPath}?err=${encodeURIComponent("เอกสารชนิดนี้สร้างได้จากการแปลงเอกสารต้นทางเท่านั้น")}`);
  }

  const doc = docId ? await getDocument(tenantId, systemId, docId) : null;
  if (docId && (!doc || doc.docType !== docType)) notFound();
  if (doc && doc.status !== "DRAFT") redirect(editorDetailPath(base, docType, doc.id));

  // ── WO 1.6 §5.2 J — เอกสารอ้างอิงของ wizard ปรับปรุงหนี้ (ขั้น ②) ──
  // ร่างเดิม (docId มีค่า) → อ้างอิงมาจาก doc.sourceDocId ที่ persist ไว้แล้วเสมอ (ตัด `?ref=` ทิ้ง กันคนแก้ผ่าน URL)
  // สร้างใหม่ (docId ไม่มีค่า) → อ้างอิงมาจาก query `?ref=` ของ wizard ขั้น ①
  const effectiveRefId = docId ? (doc?.sourceDocId ?? null) : adjustMode && refId ? refId : null;
  let refDoc: Awaited<ReturnType<typeof getDocument>> | null = null;
  let capSatang: number | null = null;
  if (adjustMode && effectiveRefId) {
    const refRow = await getDocRef(tenantId, systemId, effectiveRefId);
    // เชื่อ id จาก query ไม่ได้เฉย ๆ — ต้องเป็นของ tenant/system นี้ + เป็นชนิดที่อนุญาตให้อ้างอิงของ docType นี้เท่านั้น
    if (refRow && adjustRefDocTypesFor(docType).includes(refRow.docType)) {
      refDoc = await getDocument(tenantId, systemId, effectiveRefId);
      if (refDoc) {
        if (docType === "CREDIT_NOTE") capSatang = await creditAvailableNow(systemId, effectiveRefId, docId);
        if (docType === "CREDIT_NOTE_RECEIVED") capSatang = await creditAvailableExpenseNow(systemId, effectiveRefId, docId);
      }
    }
  }

  const side = sideOf(docType);
  const today = thaiDateKey(new Date());
  const issueDate = isoOf(doc?.issueDate) || today;

  const [contactRows, productRows, units, incomeAccounts, expenseAccounts, salesUsers, tagOptions, attachments, outstanding, favorites] =
    await Promise.all([
      listContacts(tenantId, systemId),
      listProducts(tenantId, systemId),
      listUnits(tenantId, systemId),
      listIncomeAccounts(tenantId, systemId),
      listExpenseAccounts(tenantId, systemId),
      listTenantMembers(tenantId),
      listUsedTags(tenantId, systemId),
      doc ? listAttachments(tenantId, systemId, { documentId: doc.id }) : Promise.resolve([]),
      outstandingByContacts(tenantId, systemId),
      getDocFavorites(tenantId, systemId),
    ]);

  // ── ป้ายเลขที่เอกสาร: พรีวิว "เลขถัดไป" (ไม่จอง — ร่างต้องไม่กินเลข) ──
  const docNoPreview =
    doc?.docNo ??
    (side === "revenue"
      ? await previewNextDocNo(systemId, docType, new Date(`${issueDate}T00:00:00.000Z`))
      : await previewNextExpenseDocNo(systemId, docType, new Date(`${issueDate}T00:00:00.000Z`)));

  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const accounts = (side === "revenue" ? incomeAccounts : expenseAccounts).map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
  }));

  // ── stepper (§5.2 A) ──
  const chain = stepChainFor(docType);
  const related = await docChainMap(tenantId, systemId, doc);
  const steps: StepView[] = chain.map((dt) => {
    const hit = related.get(dt);
    return {
      code: STEP_CODE[dt] ?? dt,
      label: stepLabelOf(dt),
      docNo: dt === docType ? undefined : (hit?.docNo ?? undefined),
      href: hit ? editorDetailPath(base, dt, hit.id) : undefined,
      state: dt === docType ? "current" : hit ? "done" : "next",
    };
  });

  // ── ค่าเริ่มต้นของฟอร์ม ──
  // WO 1.6: สร้างใหม่จาก wizard (ไม่มี doc ของตัวเองแต่มี refDoc) → ผู้ติดต่อ/รายการ ดึงมาจากเอกสารอ้างอิงให้แก้ไข
  const seededContact = adjustSeedContact(doc, refDoc);
  const contactId = seededContact.contactId;
  const contactRow = contactRows.find((c) => c.id === contactId);
  const dueDays = docType === "QUOTATION" ? settings.defaultValidDays : (contactRow?.creditTermDays || settings.defaultDueDays);
  const lineSourceDoc = doc ?? (!doc ? refDoc : null);
  const lines: LineDraft[] = lineSourceDoc?.lines.length
    ? lineSourceDoc.lines.map((l) => {
        const { name, description } = unpackDescription(l.description);
        const qty = Number(l.qty) || 0;
        return {
          ...newLineDraft(settings.vatRateBp),
          productId: l.productId,
          name,
          description,
          descriptionOpen: description.length > 0,
          accountId: l.accountId,
          qty,
          unitName: l.unitName ?? "",
          unitPriceSatang: l.unitPrice,
          discount: { mode: "amount" as const, satang: qty > 0 ? Math.round(l.discount / qty) : l.discount, percentBp: 0 },
          vatRateBp: l.vatRateBp,
          whtIncomeType: l.whtIncomeType,
          whtRateBp: l.whtRateBp,
        };
      })
    : [newLineDraft(settings.vatRateBp)];

  const lineBaseSum = lines.reduce((s, l) => s + Math.max(0, Math.round(l.qty * l.unitPriceSatang) - l.discount.satang * l.qty), 0);
  const docDiscountAmount = doc?.discountAmount ?? 0;
  const reasonSeed = unpackAdjustReason(doc?.adjustReason);
  const initial: DocDraftValue = {
    docNo: docNoPreview,
    contactId,
    contactLabel: seededContact.contactLabel,
    issueDate,
    dueDate:
      isoOf(docType === "QUOTATION" ? doc?.validUntil : doc?.dueDate) || isoPlusDays(issueDate, dueDays),
    reference: doc?.reference ?? "",
    priceMode: doc ? priceModeOf(doc.vatMode) : settings.vatRegistered ? "EXCL_VAT" : "NO_VAT",
    autoTaxInvoice: doc?.autoTaxInvoice ?? false,
    recognizeVatNow: doc ? doc.vatTiming !== "ON_PAYMENT" : settings.taxPointBasis !== "ON_PAYMENT",
    salesUserId: doc?.salesUserId ?? null,
    tags: doc?.tags ?? [],
    lines,
    docDiscount:
      doc?.discountMode === "PERCENT" && lineBaseSum > 0
        ? { mode: "percent", satang: 0, percentBp: Math.round((docDiscountAmount * 10000) / lineBaseSum) }
        : { mode: "amount", satang: docDiscountAmount, percentBp: 0 },
    note: doc?.note ?? settings.footerNote ?? "",
    internalNote: doc?.internalNote ?? "",
    adjustReasonCode: reasonSeed.code,
    adjustReasonText: reasonSeed.text,
  };

  // ── WO 1.4 ส่วน D/F ──
  // D: หักเงินมัดจำได้เฉพาะ IV/RE (ขาย) และ PUR/EXP (ซื้อ) ตาม §5.2 D
  const depositEnabled = (["INVOICE", "RECEIPT", "PURCHASE", "EXPENSE"] as AccountDocType[]).includes(docType);
  const depositApplied = (doc?.relationsTo ?? [])
    .filter((r) => r.type === "DEPOSIT_APPLY")
    .map((r) => ({ depositId: r.from.id, docNo: r.from.docNo, amountSatang: r.amount ?? 0 }));
  // F: บล็อก "รับชำระเงิน" อยู่บนฟอร์มใบเสร็จรับเงิน (ภาพ g2) — ชนิดอื่นใช้แผงจากหน้าเอกสาร (§5.3)
  const paymentEnabled = docType === "RECEIPT";
  const paymentChannels = paymentEnabled ? await listPaymentChannels(tenantId, systemId) : [];
  const sourceRel = (doc?.relationsTo ?? []).find((r) => r.from.docType === "INVOICE");
  const sourceDoc =
    paymentEnabled && sourceRel
      ? {
          docNo: sourceRel.from.docNo,
          href: editorDetailPath(base, "INVOICE", sourceRel.from.id),
          label: "ใบแจ้งหนี้",
        }
      : null;

  // WO 1.6 §5.2 J — chip "อ้างอิง<label> <docNo>" + เพดานยอดคงเหลือ (cap-line) ในหัวฟอร์มขั้น ②
  const refDocView = refDoc
    ? {
        id: refDoc.id,
        docNo: refDoc.docNo,
        href: editorDetailPath(base, refDoc.docType, refDoc.id),
        label: adjustRefLabelFor(docType),
        outstandingSatang: Math.max(0, refDoc.grandTotal - refDoc.paidTotal),
      }
    : null;

  const attachmentViews: AttachmentView[] = attachments.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    fileUrl: a.fileUrl,
    mimeType: a.mimeType ?? "application/octet-stream",
    sizeBytes: a.sizeBytes ?? 0,
  }));

  // 🔴 ไม่มีลิงก์ "← <ชนิดเอกสาร>" เหนือ h1 — breadcrumb ของ shell V2 (§1) ให้ทางกลับอยู่แล้ว
  //    (Fable QC ภาพจริง 3 ก.ย.: ซ้ำซ้อนกับ breadcrumb · g1 ไม่มีบรรทัดนี้)
  return (
    <div className="flex flex-col gap-3">
      <DocEditorV2
        systemId={systemId}
        docType={docType}
        docLabel={def.label}
        side={side}
        accMode={accMode}
        basePath={base}
        listPath={listPath}
        detailPathFor={listPath}
        docId={doc?.id}
        steps={steps}
        vatRegistered={settings.vatRegistered}
        vatRateBp={settings.vatRateBp}
        branchName={settings.branchName ?? "สำนักงานใหญ่"}
        dueLabel={dueLabelOf(docType)}
        contacts={contactRows.slice(0, 20).map((c) => ({
          id: c.id,
          name: c.name,
          sub: [c.taxId, c.phone].filter(Boolean).join(" · ") || undefined,
          outstandingSatang: outstanding.get(c.id) ?? 0,
          creditTermDays: c.creditTermDays,
          priceMode: c.defaultPriceMode ?? null,
        }))}
        products={productRows.slice(0, 20).map((p) => ({
          id: p.id,
          name: p.name,
          sub: p.sku ?? undefined,
          priceSatang: (side === "revenue" ? p.salePrice : p.buyPrice) ?? p.salePrice ?? 0,
          unitName: p.unitId ? (unitName.get(p.unitId) ?? null) : null,
          vatRateBp: p.vatRateBp,
          accountId: (side === "revenue" ? p.incomeAccountId : p.expenseAccountId) ?? null,
        }))}
        accounts={accounts}
        salesUsers={salesUsers}
        tagOptions={tagOptions}
        favorites={favorites as FavoriteSet[]}
        attachments={attachmentViews}
        storageEnabled={storageEnabled()}
        requireLineAccount={requiresLineAccount(docType)}
        initial={initial}
        depositDeductedSatang={doc?.depositDeducted ?? 0}
        depositEnabled={depositEnabled}
        depositApplied={depositApplied}
        paymentEnabled={paymentEnabled}
        paymentChannels={paymentChannels}
        sourceDoc={sourceDoc}
        adjustMode={adjustMode}
        refDoc={refDocView}
        capSatang={capSatang}
      />
    </div>
  );
}

export default DocEditorPage;
