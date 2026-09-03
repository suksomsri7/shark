import type { AccountDocType, AccountPayChannel, AccountWhtIncomeType } from "@prisma/client";
import {
  recordPayment,
  voidPayment,
  issueDocument,
  paymentTargetOf,
  listDocPayments,
  attachDraftReceiptPayments,
  findPaymentsByKeys,
  DOC_LABEL,

} from "./service";
import { recordVendorPayment, voidVendorPayment } from "./expense";
import { listFinanceAccounts } from "./finance";
import { createCheque } from "./cheque";
import { issueWhtCreditCertStandalone } from "./wht";

// ─────────────────────────────────────────────────────────────
// payment.ts — ส่วน F ของ DESIGN-SPEC-V2 §5.2 "รับชำระเงิน / บันทึกจ่าย" (WO 1.4)
// ภาพตายตัว: g2-receipt-payment.png (ครั้งที่ 1..n · ขั้นสูง: WHT/ค่าธรรมเนียม/เช็ค · ยอดคงค้าง)
//
// ที่นี่ทำหน้าที่ "ตัวประสาน" อย่างเดียว — ตรรกะเงิน/บัญชีของจริงยังอยู่ที่เดิมทั้งหมด:
//   ฝั่งรับ  → service.recordPayment  (Dr เงิน + Dr 1160 + Dr 6500 / Cr 1100)
//   ฝั่งจ่าย → expense.recordVendorPayment (Dr 2100 / Cr เงิน + Cr 2130 + 50 ทวิ)
//   เช็ค     → cheque.createCheque (ทะเบียนเช็ค · JV ลงที่ payment แล้ว จึงส่ง paymentId เข้าไป)
// 🔴 ห้ามเขียน posting ใหม่ในไฟล์นี้เด็ดขาด
// ─────────────────────────────────────────────────────────────

export type ChequeDraft = { chequeNo: string; bankName: string; chequeDate: string };

/** 1 กล่อง "ครั้งที่ n" ในฟอร์ม (§5.2 F) — ค่าที่ browser ส่งมา (ยังไม่เชื่อถือ) */
export type PaymentDraft = {
  paidAt: string; // ISO yyyy-mm-dd
  financeAccountId: string | null;
  amountSatang: number; // เงินเข้า/ออกจริง (ไม่รวม WHT)
  note: string; // ≤20 ตาม g2
  whtIncomeType: AccountWhtIncomeType | null;
  whtRateBp: number | null;
  whtAmountSatang: number;
  feeSatang: number;
  cheque: ChequeDraft | null;
};

export type RecordPaymentsResult =
  | {
      ok: true;
      /** เอกสารที่ถูกตัดหนี้จริง (ใบเสร็จของใบแจ้งหนี้ → ตัดที่ใบแจ้งหนี้) */
      targetDocId: string;
      status: string;
      paidTotal: number;
      outstanding: number;
      certNos: string[];
      recorded: number;
    }
  | { ok: false; reason: string };

/** ชนิดเอกสารที่ "รับชำระ/บันทึกจ่าย" ได้ (§3 ทำรายการ) */
// 🔴 WO 1.7: **ไม่มี** BILLING_NOTE / COMBINED_PAYMENT ในลิสต์นี้ — เอกสารกลุ่มไม่มีลูกหนี้/เจ้าหนี้ของ
//    ตัวเอง (ตั้งไว้ที่ใบลูกแล้ว) ⇒ รับ/จ่ายที่ตัวกลุ่มตรง ๆ จะสร้าง JV ลอย (Dr 2100 ที่ไม่เคยมี Cr 2100)
//    ต้องผ่าน `group.ts:recordGroupPayment` ซึ่งกระจายไปบันทึกที่ใบลูกทีละใบเท่านั้น
export const PAYABLE_DOC_TYPES: readonly AccountDocType[] = [
  "INVOICE",
  "DEPOSIT_RECEIPT",
  "DEBIT_NOTE",
  "PURCHASE",
  "EXPENSE",
  "ASSET_PURCHASE",
  "DEPOSIT_PAYMENT",
  "DEBIT_NOTE_RECEIVED",
];

/** ชนิด "เอกสารกลุ่ม" (§5.2 K) — จ่าย/รับที่ตัวมันเองไม่ได้ ต้องกระจายลงใบลูก */
export const GROUP_DOC_TYPES: readonly AccountDocType[] = ["BILLING_NOTE", "COMBINED_PAYMENT"];

const clampNote = (v: string | null | undefined) => (v ?? "").trim().slice(0, 20) || null;

/** ช่องทางจากชนิดบัญชีเงิน (ไม่มี flag "ใช้รับเงิน/ใช้จ่ายเงิน" ในโมเดล → ใช้ได้ทุกใบ) */
function channelOfFinanceType(type: string | null | undefined): AccountPayChannel {
  switch (type) {
    case "CASH":
    case "PETTY_CASH":
      return "CASH";
    case "E_WALLET":
      return "E_WALLET";
    default:
      return "TRANSFER";
  }
}

export type FinanceOption = { id: string; name: string; type: string; bankName: string | null; accountNo: string | null };

/** ช่องทางการเงินให้ dropdown "ช่องทาง" (§10.1) */
export async function listPaymentChannels(tenantId: string, systemId: string): Promise<FinanceOption[]> {
  const rows = await listFinanceAccounts(tenantId, systemId);
  return rows.map((f) => ({ id: f.id, name: f.name, type: f.type, bankName: f.bankName, accountNo: f.accountNo }));
}

export type PaymentRowView = {
  id: string;
  paidAt: Date;
  channel: string;
  financeName: string | null;
  amount: number;
  whtAmount: number;
  feeAmount: number;
  note: string | null;
  chequeNo: string | null;
  certNo: string | null;
  voidedAt: Date | null;
};

export type PaymentPanelData = {
  docId: string;
  docType: AccountDocType;
  docNo: string | null;
  docLabel: string;
  direction: "IN" | "OUT";
  contactName: string;
  grandTotal: number;
  paidTotal: number;
  outstanding: number;
  /** ฐานคำนวณภาษีหัก ณ ที่จ่าย = ยอดก่อน VAT หลังหักส่วนลด (ฟอร์มใช้เติมค่าอัตโนมัติ) */
  whtBaseSatang: number;
  status: string;
  /** เอกสารที่การชำระจะไปตัดหนี้จริง (ใบเสร็จของใบแจ้งหนี้ → ใบแจ้งหนี้) */
  targetDocId: string;
  targetDocNo: string | null;
  canRecord: boolean;
  payments: PaymentRowView[];
  channels: FinanceOption[];
};

export async function paymentPanelData(
  tenantId: string,
  systemId: string,
  docId: string,
): Promise<PaymentPanelData | null> {
  const found = await paymentTargetOf(tenantId, systemId, docId);
  if (!found) return null;
  const { doc, target } = found;
  const [payments, channels] = await Promise.all([
    listDocPayments(tenantId, systemId, target.id),
    listPaymentChannels(tenantId, systemId),
  ]);
  const outstanding = Math.max(0, target.grandTotal - target.paidTotal);
  return {
    docId: doc.id,
    docType: doc.docType,
    docNo: doc.docNo,
    docLabel: DOC_LABEL[doc.docType] ?? doc.docType,
    direction: target.direction as "IN" | "OUT",
    contactName: doc.contactName ?? "—",
    grandTotal: doc.grandTotal,
    paidTotal: target.paidTotal,
    outstanding,
    whtBaseSatang: Math.max(0, target.subTotal - target.discountAmount),
    status: target.status,
    targetDocId: target.id,
    targetDocNo: target.docNo,
    canRecord: ["AWAITING_PAYMENT", "PARTIAL"].includes(target.status),
    payments,
    channels,
  };
}

/** ทำความสะอาดค่าจากเบราว์เซอร์ (ยอดเป็นสตางค์ integer เสมอ · ไม่มีค่าติดลบ) */
function clean(d: PaymentDraft): PaymentDraft {
  const int = (v: unknown) => {
    const n = Math.round(Number(v ?? 0));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const wht = int(d.whtAmountSatang);
  return {
    paidAt: /^\d{4}-\d{2}-\d{2}$/.test(String(d.paidAt ?? "")) ? d.paidAt : new Date().toISOString().slice(0, 10),
    financeAccountId: d.financeAccountId ? String(d.financeAccountId).slice(0, 40) : null,
    amountSatang: int(d.amountSatang),
    note: String(d.note ?? "").trim().slice(0, 20),
    whtIncomeType: wht > 0 ? (d.whtIncomeType ?? null) : null,
    whtRateBp: wht > 0 ? (d.whtRateBp == null ? null : Math.min(10000, Math.max(0, int(d.whtRateBp)))) : null,
    whtAmountSatang: wht,
    feeSatang: int(d.feeSatang),
    cheque:
      d.cheque && String(d.cheque.chequeNo ?? "").trim()
        ? {
            chequeNo: String(d.cheque.chequeNo).trim().slice(0, 40),
            bankName: String(d.cheque.bankName ?? "").trim().slice(0, 80),
            chequeDate: /^\d{4}-\d{2}-\d{2}$/.test(String(d.cheque.chequeDate ?? "")) ? d.cheque.chequeDate : d.paidAt,
          }
        : null,
  };
}

const dateOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * บันทึกการรับ/จ่ายชำระหลายครั้งในคำสั่งเดียว (§5.2 F)
 * `keyBase` = คีย์กันซ้ำของ "ชุด" นี้ (ฟอร์มสร้างมาครั้งเดียวต่อการกดปุ่ม) → ครั้งที่ n ได้ `<keyBase>:<n>`
 */
export async function recordPayments(
  tenantId: string,
  systemId: string,
  docId: string,
  drafts: PaymentDraft[],
  opts: { userId?: string | null; keyBase?: string | null },
): Promise<RecordPaymentsResult> {
  const found = await paymentTargetOf(tenantId, systemId, docId);
  if (!found) return { ok: false, reason: "ไม่พบเอกสาร" };
  const { doc, target } = found;
  if (GROUP_DOC_TYPES.includes(target.docType))
    return {
      ok: false,
      reason:
        target.docType === "BILLING_NOTE"
          ? "ใบวางบิลรวมต้องรับชำระผ่านปุ่ม “รับชำระ” ของใบวางบิล (ระบบจะกระจายเข้าใบแจ้งหนี้ลูกให้เอง)"
          : "ใบรวมจ่ายต้องบันทึกจ่ายผ่านปุ่ม “บันทึกจ่าย” ของใบรวมจ่าย (ระบบจะกระจายให้บิลลูกเอง)",
    };
  if (!PAYABLE_DOC_TYPES.includes(target.docType))
    return { ok: false, reason: "เอกสารชนิดนี้บันทึกรับ/จ่ายชำระไม่ได้" };

  const rows = drafts.map(clean).filter((d) => d.amountSatang + d.whtAmountSatang > 0);
  if (rows.length === 0) return { ok: false, reason: "กรุณากรอกจำนวนเงินอย่างน้อย 1 ครั้ง" };

  // 🔴 idempotency ต้องมาก่อนด่านสถานะ — ยิงชุดเดิมซ้ำหลังเอกสารเป็น "ชำระแล้ว" ต้องคืนผลเดิม
  //    (ไม่ใช่เด้งว่า "รับชำระไม่ได้ในสถานะปัจจุบัน" ซึ่งทำให้ผู้ใช้ไม่รู้ว่าเงินเข้าไปแล้วหรือยัง)
  if (opts.keyBase) {
    const keys = rows.map((_r, i) => `${opts.keyBase}:${i}`);
    const done = await findPaymentsByKeys(tenantId, systemId, keys);
    if (done.length === keys.length) {
      const after = (await paymentTargetOf(tenantId, systemId, target.id))?.target;
      return {
        ok: true,
        targetDocId: target.id,
        status: after?.status ?? target.status,
        paidTotal: after?.paidTotal ?? 0,
        outstanding: Math.max(0, (after?.grandTotal ?? 0) - (after?.paidTotal ?? 0)),
        certNos: [],
        recorded: 0,
      };
    }
  }

  // ใบเสร็จร่างที่ยังไม่ผูกใบแจ้งหนี้ (ขายสด) — ต้องอนุมัติผ่าน `approveReceiptWithPayments`
  if (target.status === "DRAFT") return { ok: false, reason: "ต้องอนุมัติเอกสารก่อนจึงบันทึกการชำระได้" };
  if (!["AWAITING_PAYMENT", "PARTIAL"].includes(target.status))
    return { ok: false, reason: "เอกสารนี้รับ/จ่ายชำระไม่ได้ในสถานะปัจจุบัน" };

  const financeTypes = new Map(
    (await listPaymentChannels(tenantId, systemId)).map((f) => [f.id, f.type]),
  );
  const isPayable = target.direction === "IN";
  const certNos: string[] = [];
  let recorded = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.financeAccountId && !financeTypes.has(r.financeAccountId))
      return { ok: false, reason: "ช่องทางการเงินไม่ถูกต้อง" };
    if (r.cheque && r.feeSatang > 0)
      return { ok: false, reason: "การชำระด้วยเช็คยังไม่รองรับค่าธรรมเนียมธนาคาร" };
    const channel: AccountPayChannel = r.cheque ? "CHEQUE" : channelOfFinanceType(financeTypes.get(r.financeAccountId ?? ""));
    const idempotencyKey = opts.keyBase ? `${opts.keyBase}:${i}` : null;
    const common = {
      paidAt: dateOf(r.paidAt),
      channel,
      // เช็ค: เงินยังไม่เข้าบัญชีจริง → ไม่ผูกบัญชีเงิน (GL พักที่ 1040/2300 ตาม gl.financeLedgerId)
      financeAccountId: r.cheque ? null : r.financeAccountId,
      amount: r.amountSatang,
      whtAmountSatang: r.whtAmountSatang,
      whtRateBp: r.whtRateBp,
      feeAmount: r.feeSatang,
      note: clampNote(r.note),
      createdById: opts.userId ?? null,
      idempotencyKey,
    };
    const res = isPayable
      ? await recordVendorPayment(tenantId, systemId, target.id, { ...common, whtIncomeType: r.whtIncomeType })
      : await recordPayment(tenantId, systemId, target.id, { ...common, whtIncomeType: r.whtIncomeType });
    if (!res.ok) return { ok: false, reason: `ครั้งที่ ${i + 1}: ${res.reason}` };
    recorded++;
    // ฝั่งขายคืนเลขใบภาษีถูกหัก (WTI) มาด้วย · ฝั่งจ่ายออก 50 ทวิ เองภายใน recordVendorPayment
    const certNo = (res as { whtCertNo?: string }).whtCertNo;
    if (certNo) certNos.push(certNo);
    if (r.cheque && res.paymentId) {
      const cq = await createCheque({
        tenantId,
        systemId,
        direction: isPayable ? "OUT" : "IN",
        chequeNo: r.cheque.chequeNo,
        bankName: r.cheque.bankName,
        chequeDate: dateOf(r.cheque.chequeDate),
        amount: r.amountSatang,
        financeAccountId: r.financeAccountId,
        documentId: target.id,
        paymentId: res.paymentId,
        note: clampNote(r.note),
      });
      if (!cq.ok) return { ok: false, reason: `ครั้งที่ ${i + 1}: ${cq.reason}` };
    }
  }

  const after = (await paymentTargetOf(tenantId, systemId, target.id))?.target;
  return {
    ok: true,
    targetDocId: target.id,
    status: after?.status ?? target.status,
    paidTotal: after?.paidTotal ?? 0,
    outstanding: Math.max(0, (after?.grandTotal ?? 0) - (after?.paidTotal ?? 0)),
    certNos,
    recorded,
  };
}

/**
 * อนุมัติใบเสร็จรับเงิน "พร้อมการรับชำระ" (หน้าสร้าง RE — ภาพ g2)
 *
 * 2 เส้นทาง:
 *  ① RE ที่แปลงมาจากใบแจ้งหนี้ → ออกใบเสร็จ (ไม่ลง GL ที่ตัวใบเสร็จ) แล้วรับชำระ **ที่ใบแจ้งหนี้**
 *  ② RE ขายสด (ไม่มีต้นทาง) → ผูกรายการรับเงินไว้กับร่างก่อน แล้วค่อยออกเอกสาร
 *     (gl.postDocument case RECEIPT อ่านรายการเหล่านี้ไปเดบิตตามช่องทางจริง + Dr 1160 ให้ครบ)
 */
export async function approveReceiptWithPayments(
  tenantId: string,
  systemId: string,
  docId: string,
  drafts: PaymentDraft[],
  opts: { userId?: string | null; keyBase?: string | null },
): Promise<{ ok: true; docNo: string; outstanding: number; certNos: string[] } | { ok: false; reason: string }> {
  const doc = (await paymentTargetOf(tenantId, systemId, docId))?.doc;
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (doc.docType !== "RECEIPT") return { ok: false, reason: "ใช้ได้เฉพาะใบเสร็จรับเงิน" };
  if (doc.status !== "DRAFT") return { ok: false, reason: "ใบเสร็จนี้ออกแล้ว" };

  const rows = drafts.map(clean).filter((d) => d.amountSatang + d.whtAmountSatang > 0);
  const tieOff = rows.reduce((s, r) => s + r.amountSatang + r.whtAmountSatang, 0);
  if (rows.length > 0 && tieOff !== doc.grandTotal)
    return {
      ok: false,
      reason: `ยอดรับชำระรวม (รวมภาษีถูกหัก) ต้องเท่ากับยอดใบเสร็จ ฿${(doc.grandTotal / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
    };

  // ① ใบเสร็จของใบแจ้งหนี้ → ออกเอกสารก่อน (GL ข้ามให้เอง) แล้วรับชำระที่ใบแจ้งหนี้
  if (doc.sourceDocId) {
    const issued = await issueDocument(tenantId, systemId, docId);
    if (!issued.ok) return { ok: false, reason: issued.reason };
    if (rows.length === 0) return { ok: true, docNo: issued.docNo, outstanding: 0, certNos: [] };
    const res = await recordPayments(tenantId, systemId, docId, rows, opts);
    if (!res.ok) return { ok: false, reason: res.reason };
    return { ok: true, docNo: issued.docNo, outstanding: res.outstanding, certNos: res.certNos };
  }

  // ② ขายสด — ผูกรายการรับเงินกับร่าง แล้วออกเอกสาร (posting อ่านรายการเหล่านี้)
  if (rows.length === 0) {
    const issued = await issueDocument(tenantId, systemId, docId);
    return issued.ok ? { ok: true, docNo: issued.docNo, outstanding: 0, certNos: [] } : { ok: false, reason: issued.reason };
  }
  const financeTypes = new Map((await listPaymentChannels(tenantId, systemId)).map((f) => [f.id, f.type]));
  for (const r of rows)
    if (r.financeAccountId && !financeTypes.has(r.financeAccountId))
      return { ok: false, reason: "ช่องทางการเงินไม่ถูกต้อง" };

  const attached = await attachDraftReceiptPayments(
    tenantId,
    systemId,
    docId,
    rows.map((r, i) => ({
      paidAt: dateOf(r.paidAt),
      channel: (r.cheque ? "CHEQUE" : channelOfFinanceType(financeTypes.get(r.financeAccountId ?? ""))) as AccountPayChannel,
      financeAccountId: r.cheque ? null : r.financeAccountId,
      amount: r.amountSatang,
      whtAmountSatang: r.whtAmountSatang,
      whtRateBp: r.whtRateBp,
      feeAmount: r.feeSatang,
      note: clampNote(r.note),
      createdById: opts.userId ?? null,
      idempotencyKey: opts.keyBase ? `${opts.keyBase}:${i}` : null,
    })),
  );
  if (!attached.ok) return { ok: false, reason: attached.reason };

  const issued = await issueDocument(tenantId, systemId, docId);
  if (!issued.ok) return { ok: false, reason: issued.reason };

  // เอกสารภาษีถูกหัก (WTI) + ทะเบียนเช็ค — ทำหลังออกเอกสาร (ต้องมีเลขที่/สถานะจริงแล้ว)
  const certNos: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const paymentId = attached.paymentIds[i];
    if (r.whtAmountSatang > 0 && r.whtIncomeType) {
      const base =
        doc.grandTotal > 0
          ? Math.round((doc.subTotal * (r.amountSatang + r.whtAmountSatang)) / doc.grandTotal)
          : r.amountSatang + r.whtAmountSatang;
      const cert = await issueWhtCreditCertStandalone(
        { tenantId, systemId },
        {
          documentId: docId,
          paymentId,
          whtAmount: r.whtAmountSatang,
          whtRateBp: r.whtRateBp,
          incomeType: r.whtIncomeType,
          base,
          issueDate: dateOf(r.paidAt),
        },
      );
      if (!cert.ok) return { ok: false, reason: cert.reason };
      certNos.push(cert.docNo);
    }
    if (r.cheque) {
      const cq = await createCheque({
        tenantId,
        systemId,
        direction: "IN",
        chequeNo: r.cheque.chequeNo,
        bankName: r.cheque.bankName,
        chequeDate: dateOf(r.cheque.chequeDate),
        amount: r.amountSatang,
        financeAccountId: r.financeAccountId,
        documentId: docId,
        paymentId,
        note: clampNote(r.note),
      });
      if (!cq.ok) return { ok: false, reason: cq.reason };
    }
  }
  return { ok: true, docNo: issued.docNo, outstanding: 0, certNos };
}

/** ยกเลิกการชำระ — ส่งต่อไปตัวจริงตามทิศทางเอกสาร (ทั้งคู่ทำ reversal ไม่ลบ) */
export async function voidPaymentAny(
  tenantId: string,
  systemId: string,
  documentId: string,
  paymentId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doc = (await paymentTargetOf(tenantId, systemId, documentId))?.doc;
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  return doc.direction === "IN"
    ? voidVendorPayment(tenantId, systemId, documentId, paymentId, reason)
    : voidPayment(tenantId, systemId, documentId, paymentId, reason);
}
