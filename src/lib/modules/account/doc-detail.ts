// ─────────────────────────────────────────────────────────────
// doc-detail.ts — WO 1.5 · โหลด+ประกอบข้อมูล "หน้าเอกสาร V2" (DocDetailPage) ให้ทั้ง 2 ฝั่ง
// (รายรับ 8 ชนิด + รายจ่าย 9 ชนิด — VISIBLE_DOC_TYPES + EXPENSE_LIST_TYPES) ใช้จุดเดียวกัน
// อ้าง DESIGN-SPEC-V2 §5.3 · BLUEPRINT §1 (ห้าม schema ใหม่ — ประกอบจากของที่มีอยู่ทั้งหมด)
// ─────────────────────────────────────────────────────────────
import type { AccountDocStatus, AccountDocType } from "@prisma/client";
import { getExpenseDoc, EXP_DOC_LABEL } from "./expense";
import { DOC_LABEL, STATUS_LABEL, isOverdue, listDocPayments, getDocRef, type DocPaymentRow } from "./service";
import { listJournalEntriesForDocument } from "./gl";
import { LIST_TABS } from "./list-tabs";
import { listDocumentAttachmentFiles, humanSize } from "./attachment";
import { listDocAuditLogs, auditActionLabelTh } from "./access";
// WO 1.7 — เอกสารกลุ่ม (BN/CP): ตาราง "เอกสารในกลุ่ม" + ชิป "อยู่ในใบวางบิล/ใบรวมจ่าย" ของใบลูก
import { groupChipOfChild, groupDefOf, groupPanelData, isGroupDocType, type GroupChildView, type GroupMembershipChip } from "./group";
import type { AuditLogRow } from "./access";
// WO 5.5 — ลิงก์+QR PromptPay ของเอกสารใบนี้ (§0.3 ข้อ 5)
import { listPaymentRequests, PAYMENT_REQUEST_DOC_TYPES, type PaymentRequestView } from "./payment-request";
import type { AttachmentView } from "@/components/account-v2/doc-editor-types";

export function docLabelOf(docType: AccountDocType): string {
  return DOC_LABEL[docType] ?? EXP_DOC_LABEL[docType] ?? docType;
}

// ─────────────────── เอกสารที่เกี่ยวข้อง (§5.3 "แถบเอกสารที่เกี่ยวข้อง") ───────────────────

export type RelatedDocRef = { id: string; docType: AccountDocType; docNo: string | null; status: AccountDocStatus };
export type RelatedSlot = { kind: string; label: string; doc: RelatedDocRef | null };

const SLOT_KIND_FOR_DOCTYPE: Partial<Record<AccountDocType, string>> = {
  QUOTATION: "QT",
  INVOICE: "IV",
  RECEIPT: "RE",
  TAX_INVOICE: "TX",
  DEPOSIT_RECEIPT: "DR",
  CREDIT_NOTE: "CN",
  DEBIT_NOTE: "DN",
  BILLING_NOTE: "BN",
  PURCHASE_ORDER: "PO",
  ASSET_PURCHASE_ORDER: "APO",
  PURCHASE: "PUR",
  EXPENSE: "EXP",
  ASSET_PURCHASE: "AP",
  PURCHASE_TAX_INVOICE: "PTX",
  DEPOSIT_PAYMENT: "DP",
  CREDIT_NOTE_RECEIVED: "CNR",
  DEBIT_NOTE_RECEIVED: "DNR",
  COMBINED_PAYMENT: "CP",
  WHT_CERT: "WHT",
};

function downstreamLabel(dt: AccountDocType): string {
  switch (dt) {
    case "INVOICE":
      return "ใบแจ้งหนี้";
    case "RECEIPT":
      return "ใบเสร็จ";
    case "TAX_INVOICE":
    case "PURCHASE_TAX_INVOICE":
      return "ใบกำกับ";
    case "CREDIT_NOTE":
    case "CREDIT_NOTE_RECEIVED":
      return "ใบลดหนี้";
    case "DEBIT_NOTE":
    case "DEBIT_NOTE_RECEIVED":
      return "ใบเพิ่มหนี้";
    case "BILLING_NOTE":
    case "COMBINED_PAYMENT":
      return "ใบวางบิล";
    case "DEPOSIT_RECEIPT":
    case "DEPOSIT_PAYMENT":
      return "ใบมัดจำ";
    case "PURCHASE":
    case "ASSET_PURCHASE":
      return "บันทึกซื้อ";
    case "WHT_CERT":
      return "หนังสือรับรองหัก ณ ที่จ่าย";
    default:
      return docLabelOf(dt);
  }
}

function toRef(d: { id: string; docType: AccountDocType; docNo: string | null; status: AccountDocStatus }): RelatedDocRef {
  return { id: d.id, docType: d.docType, docNo: d.docNo, status: d.status };
}

type RelLoadedDoc = {
  id: string;
  docType: AccountDocType;
  sourceDocId: string | null;
  relationsFrom: { type: string; to: { id: string; docType: AccountDocType; docNo: string | null; status: AccountDocStatus } }[];
  relationsTo: { type: string; from: { id: string; docType: AccountDocType; docNo: string | null; status: AccountDocStatus } }[];
};

/**
 * แถบเอกสารที่เกี่ยวข้อง — คำนวณจริงจาก AccountDocumentRelation (CONVERT/ADJUST/TAX_FOR/BILL/PAY_GROUP/DEPOSIT_APPLY)
 * + fallback `sourceDocId` (CNR/DNR ที่ยังสร้างตรง ๆ ไม่ผ่าน relation ตาราง — รอ wizard WO 1.6)
 * ใบแจ้งหนี้ (g4 mockup): เติมช่องอ้างอิง/ใบเสร็จ/ใบกำกับ/ใบลดหนี้ให้ครบ 4 เสมอ (ว่าง = "—") ให้ตรงภาพที่อนุมัติ
 */
export async function relatedSlotsFor(tenantId: string, systemId: string, doc: RelLoadedDoc): Promise<RelatedSlot[]> {
  const slots: RelatedSlot[] = [];

  const upstreamRel = doc.relationsTo.find((r) => r.type === "CONVERT" || r.type === "ADJUST" || r.type === "TAX_FOR");
  let refDoc: RelatedDocRef | null = upstreamRel ? toRef(upstreamRel.from) : null;
  if (!refDoc && doc.sourceDocId) {
    refDoc = await getDocRef(tenantId, systemId, doc.sourceDocId);
  }
  if (refDoc) slots.push({ kind: "REFERENCE", label: "อ้างอิง", doc: refDoc });

  // WO 1.7: เอกสารกลุ่มมีใบลูกหลายใบ — ไม่ยุบเป็นชิปเดียว (ตาราง "เอกสารในกลุ่ม" แสดงครบอยู่แล้ว)
  const isGroup = isGroupDocType(doc.docType);
  const downstream = new Map<AccountDocType, RelatedDocRef>();
  for (const r of doc.relationsFrom) {
    if (!["CONVERT", "ADJUST", "TAX_FOR", "BILL", "PAY_GROUP"].includes(r.type)) continue;
    if (isGroup && (r.type === "BILL" || r.type === "PAY_GROUP")) continue;
    downstream.set(r.to.docType, toRef(r.to));
  }
  // WO 1.7: ใบลูก → ชิป "อยู่ในใบวางบิล BN-…" / "อยู่ในใบรวมจ่าย CP-…" (relation ทิศทาง กลุ่ม→ลูก)
  const memberRel = doc.relationsTo.find((r) => r.type === "BILL" || r.type === "PAY_GROUP");
  if (memberRel && memberRel.from.status !== "VOIDED" && memberRel.from.status !== "CANCELLED") {
    slots.push({
      kind: SLOT_KIND_FOR_DOCTYPE[memberRel.from.docType] ?? "GROUP",
      label: groupDefOf(memberRel.from.docType)?.texts.memberChip ?? "อยู่ในกลุ่ม",
      doc: toRef(memberRel.from),
    });
  }
  for (const [dt, ref] of downstream) {
    slots.push({ kind: SLOT_KIND_FOR_DOCTYPE[dt] ?? dt, label: downstreamLabel(dt), doc: ref });
  }

  const depositRel = doc.relationsTo.find((r) => r.type === "DEPOSIT_APPLY");
  if (depositRel) {
    slots.push({ kind: SLOT_KIND_FOR_DOCTYPE[depositRel.from.docType] ?? "DEPOSIT", label: "ใบมัดจำ", doc: toRef(depositRel.from) });
  }

  // g4 parity: ใบแจ้งหนี้ต้องเห็นช่องอ้างอิง/ใบเสร็จ/ใบกำกับ/ใบลดหนี้เสมอ (ไม่มีของจริง = "—")
  if (doc.docType === "INVOICE") {
    for (const [kind, label] of [
      ["RE", "ใบเสร็จ"],
      ["TX", "ใบกำกับ"],
      ["CN", "ใบลดหนี้"],
    ] as const) {
      if (!slots.some((s) => s.kind === kind)) slots.push({ kind, label, doc: null });
    }
  }
  return slots;
}

// ─────────────────── ไทม์ไลน์เอกสาร (§5.3 "ไทม์ไลน์เอกสาร") ───────────────────

export type TimelineStep = {
  code: string;
  label: string;
  date: Date | null;
  note?: string;
  state: "done" | "current" | "next";
};

type TimelineDoc = {
  docType: AccountDocType;
  status: AccountDocStatus;
  createdAt: Date;
  issueDate: Date;
  payments: { paidAt: Date; voidedAt: Date | null }[];
};

/** ไทม์ไลน์ = ลำดับแท็บ "ทางเดินหลัก" ของ LIST_TABS (ตัด ทั้งหมด/พ้นกำหนด/ยกเลิก) + วันที่จริงเท่าที่รู้ได้ */
export function timelineStepsFor(doc: TimelineDoc): TimelineStep[] {
  const tabs = (LIST_TABS[doc.docType] ?? []).filter((t) => !["all", "overdue", "cancelled"].includes(t.key));
  if (tabs.length === 0) return [];
  const activePayments = doc.payments.filter((p) => !p.voidedAt).sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());

  const statusIndex = tabs.findIndex((t) => {
    const s = t.filter.status;
    if (s === "ALL" || s === "OVERDUE") return false;
    if (Array.isArray(s)) return s.includes(doc.status);
    return s === doc.status;
  });
  const curIdx = statusIndex >= 0 ? statusIndex : tabs.length - 1;

  return tabs.map((t, i) => {
    const state: TimelineStep["state"] = i < curIdx ? "done" : i === curIdx ? "current" : "next";
    let date: Date | null = null;
    let note: string | undefined;
    if (t.key === "draft") {
      date = doc.createdAt;
    } else if (state !== "next") {
      if (t.key === "partial") {
        date = activePayments[0]?.paidAt ?? null;
        if (state === "current" && activePayments.length > 0) note = `รับชำระ ${activePayments.length}`;
      } else if (["paid", "deducted", "received", "approved", "issued"].includes(t.key)) {
        date = activePayments.at(-1)?.paidAt ?? doc.issueDate;
      } else {
        date = doc.issueDate;
        if (t.key === "awaiting" || t.key === "awaiting_approval") note = "อนุมัติ";
      }
    }
    return { code: t.key, label: t.label, date, note, state };
  });
}

// ─────────────────── สมุดรายวัน (§5.3 "บัญชี") ───────────────────

export type JvLineView = { id: string; accountCode: string; accountName: string; debit: number; credit: number };
export type JvEntryView = {
  id: string;
  docNo: string;
  date: Date;
  memo: string | null;
  needsReview: boolean;
  status: string;
  lines: JvLineView[];
};

async function loadJvEntries(systemId: string, docId: string, paymentIds: string[]): Promise<JvEntryView[]> {
  const entries = await listJournalEntriesForDocument(systemId, docId, paymentIds);
  return entries.map((e) => ({
    id: e.id,
    docNo: e.docNo,
    date: e.date,
    memo: e.memo,
    needsReview: e.needsReview,
    status: e.status,
    lines: e.lines.map((l) => ({
      id: l.id,
      accountCode: l.account.code,
      accountName: l.account.name,
      debit: l.debit,
      credit: l.credit,
    })),
  }));
}

// ─────────────────── ก้อนข้อมูลรวม ───────────────────

export type DocDetailData = {
  id: string;
  docType: AccountDocType;
  docNo: string | null;
  status: AccountDocStatus;
  label: string;
  createdAt: Date;
  issueDate: Date;
  dueDate: Date | null;
  validUntil: Date | null;
  /** WO 1.9 — `email` ใช้ตัดสินว่าปุ่ม ⋯ "เตือนชำระ" กดได้ไหม (ไม่มีอีเมล = ปุ่มจาง + บอกเหตุผล) */
  contact: { id: string; name: string; taxId: string | null; email: string | null } | null;
  lines: {
    id: string;
    description: string;
    qty: number;
    unitName: string | null;
    unitPrice: number;
    discount: number;
    vatRateBp: number;
    amount: number;
    account: { code: string; name: string } | null;
  }[];
  subTotal: number;
  discountAmount: number;
  vatAmount: number;
  whtAmount: number;
  depositDeducted: number;
  grandTotal: number;
  paidTotal: number;
  note: string | null;
  internalNote: string | null;
  /** WO 9.4 §0.3 ข้อ 8/9 — แท็กอิสระของเอกสาร (ลบทีละแท็กได้ที่หน้านี้ — เลิกทำได้ภายใน 5 นาที) */
  tags: string[];
  publicToken: string | null;
  overdue: boolean;
  remain: number;
  payments: DocPaymentRow[];
  related: RelatedSlot[];
  timeline: TimelineStep[];
  jv: JvEntryView[];
  attachments: AttachmentView[];
  auditLogs: AuditLogRow[];
  /** WO 1.7 — เอกสารกลุ่ม (BN/CP): ใบลูกพร้อมยอดค้าง (แทนตารางรายการสินค้า) · ชนิดอื่น = null */
  groupChildren: GroupChildView[] | null;
  /** WO 1.7 — ใบลูกที่อยู่ในกลุ่มที่ยังไม่ถูกยกเลิก (ใช้ทำชิป/ปิดปุ่มรับชำระซ้ำซ้อน) */
  groupChip: GroupMembershipChip | null;
  /** WO 5.5 — คำขอชำระเงิน (ลิงก์+QR PromptPay) ของเอกสารนี้ · ชนิดที่ยังไม่รองรับ = [] */
  paymentRequests: PaymentRequestView[];
};

/** โหลด+ประกอบข้อมูลหน้าเอกสาร 1 ใบ — ใช้ร่วมทั้งฝั่งรายรับและรายจ่าย (getExpenseDoc คิวรีได้ทั้งคู่) */
export async function getDocDetailData(
  tenantId: string,
  systemId: string,
  docId: string,
): Promise<DocDetailData | null> {
  const doc = await getExpenseDoc(tenantId, systemId, docId);
  if (!doc) return null;

  // listDocPayments คืนทุกครั้งที่ชำระ (รวมที่ voided แล้ว) — ใช้ id ชุดนี้หา JV ของ payment ได้ครบ ไม่ต้องคิวรีซ้ำ
  const [payments, attachmentRows, auditLogs] = await Promise.all([
    listDocPayments(tenantId, systemId, docId),
    listDocumentAttachmentFiles(tenantId, systemId, docId),
    listDocAuditLogs(tenantId, docId),
  ]);
  const jv = await loadJvEntries(systemId, docId, payments.map((p) => p.id));
  const related = await relatedSlotsFor(tenantId, systemId, doc);
  const isGroup = isGroupDocType(doc.docType);
  const [groupPanel, groupChip] = await Promise.all([
    isGroup ? groupPanelData(tenantId, systemId, docId) : Promise.resolve(null),
    isGroup ? Promise.resolve(null) : groupChipOfChild(tenantId, systemId, docId),
  ]);
  const paymentRequests = PAYMENT_REQUEST_DOC_TYPES.includes(doc.docType)
    ? await listPaymentRequests({ tenantId, systemId }, docId)
    : [];
  const timeline = timelineStepsFor({
    docType: doc.docType,
    status: doc.status,
    createdAt: doc.createdAt,
    issueDate: doc.issueDate,
    payments: payments.map((p) => ({ paidAt: p.paidAt, voidedAt: p.voidedAt })),
  });

  return {
    id: doc.id,
    docType: doc.docType,
    docNo: doc.docNo,
    status: doc.status,
    label: docLabelOf(doc.docType),
    createdAt: doc.createdAt,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    validUntil: doc.validUntil,
    contact: doc.contact
      ? { id: doc.contact.id, name: doc.contact.name, taxId: doc.contact.taxId, email: doc.contact.email }
      : null,
    lines: doc.lines.map((l) => ({
      id: l.id,
      description: l.description,
      qty: Number(l.qty),
      unitName: l.unitName,
      unitPrice: l.unitPrice,
      discount: l.discount,
      vatRateBp: l.vatRateBp,
      amount: l.amount,
      account: l.account ? { code: l.account.code, name: l.account.name } : null,
    })),
    subTotal: doc.subTotal,
    discountAmount: doc.discountAmount,
    vatAmount: doc.vatAmount,
    whtAmount: doc.whtAmount,
    depositDeducted: doc.depositDeducted,
    grandTotal: doc.grandTotal,
    paidTotal: doc.paidTotal,
    note: doc.note,
    internalNote: doc.internalNote,
    tags: doc.tags,
    publicToken: doc.publicToken,
    overdue: isOverdue(doc),
    remain: Math.max(0, doc.grandTotal - doc.paidTotal),
    payments,
    related,
    timeline,
    jv,
    attachments: attachmentRows.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
    auditLogs,
    groupChildren: groupPanel?.children ?? null,
    groupChip,
    paymentRequests,
  };
}

export { STATUS_LABEL, auditActionLabelTh, humanSize };
