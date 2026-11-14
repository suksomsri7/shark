import type { LegalWarning } from "@/lib/core/settings/legal/warnings";
import type { AccountDocType, AccountPayChannel, AccountWhtIncomeType } from "@prisma/client";
import { accountNow } from "./clock";
import {
  recordPayment,
  voidPayment,
  issueDocument,
  paymentTargetOf,
  paymentOutstandingOf,
  listDocPayments,
  findPaymentsByKeys,
  DRAFT_RECEIPT_ALREADY_ATTACHED_MSG,
  DOC_LABEL,

} from "./service";
import { EXP_DOC_LABEL, recordVendorPayment, voidVendorPayment } from "./expense";
import { listFinanceAccounts } from "./finance";
import { attachReceiptPaymentsWithChequesInOneTx, chequeDraftProblem, recordPaymentWithChequeInOneTx } from "./cheque";
import { issueWhtCreditCertStandalone } from "./wht";
import { legalUiOptionsAt, loadBookLegal } from "./legal-values";
import { whtDocContext, whtInstalmentBaseOf } from "./service";
import { evaluateWhtRow, whtPanelContextFrom, type WhtPanelContext, type WhtRowEval } from "./wht-context";
import { instalmentWhtBase, whtIncomeCodeOf, whtParentOf } from "./wht-calc";
import { legalAmbient } from "@/lib/core/legal-ambient";
import { LegalAckRequiredError, unacknowledged } from "@/lib/core/settings/legal/warnings";
import type { WhtCondition } from "@/lib/core/settings/legal/th-tax-2569";
import { getPolicy } from "./policy";

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
  /** ACC T3.1 ▸ รหัสประเภทเงินได้แบบขยาย (ADVERTISING · TRANSPORT …) — ส่งแทน/คู่กับ whtIncomeType ◂ */
  whtIncomeCode?: string | null;
  /** ACC T3.7 ▸ NORMAL | EWHT (นำส่งผ่าน e-WHT — ร้านต้องเปิดค่าตั้ง) ◂ */
  whtChannel?: string | null;
  /** ACC T3.6 ▸ WITHHOLD | PAY_ALWAYS | PAY_ONCE (ออกภาษีให้: whtAmountSatang = ภาษีที่ร้านออกแทน ไม่ตัดหนี้) ◂ */
  whtCondition?: string | null;
  ewhtRef?: string | null;
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
      /**
       * WO API-C2 (additive): id ของรายการชำระที่เพิ่งบันทึก เรียงตามลำดับ `drafts`
       * REST คืนค่านี้ให้ผู้เรียกเก็บไว้ยิง `POST /payments/{paymentId}/void` ได้ตรง ๆ
       * (เดิมต้องไปไล่หาเองจากรายการชำระของเอกสาร ซึ่งแยกไม่ออกว่าแถวไหนของคำขอนี้)
       * ยิงคีย์กันซ้ำเดิมซ้ำ → คืน id ชุดเดิม (ไม่ใช่ค่าว่าง) เพื่อให้ผลลัพธ์ของการ retry เท่ากัน
       */
      paymentIds: string[];
      /** ACC T2.6 (additive) ▸ คำเตือนกฎหมายที่ไม่บล็อก (เช่น รับเงินย้อนเดือน → ใบกำกับลงเดือนนั้น) — รูปเดียวของทะเบียนกลาง ◂ */
      warnings?: LegalWarning[];
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
  /** WO API-C2 (additive): id ของช่องทางเงิน — REST คืน `financeAccount { id, name }` ให้ผู้เรียกอ้างต่อได้ */
  financeAccountId: string | null;
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
  /** ACC T0.2 ▸ อัตราหัก ณ ที่จ่ายแนะนำต่อประเภทเงินได้ (ตารางค่ากฎหมาย + นโยบายร้าน) ◂ */
  whtSuggest: Record<string, number>;
  /** ACC T3 ▸ ก้อนหัก ณ ที่จ่ายของใบนี้ (อัตราตามตาราง × ผู้จ่าย × ผู้รับ × ช่องทาง · ฐานรายบรรทัด · ขั้นต่ำ · ออกภาษีให้ · e-WHT) ◂ */
  wht: WhtPanelContext | null;
};

export async function paymentPanelData(
  tenantId: string,
  systemId: string,
  docId: string,
): Promise<PaymentPanelData | null> {
  const found = await paymentTargetOf(tenantId, systemId, docId);
  if (!found) return null;
  const { doc, target } = found;
  const [payments, channels, policy] = await Promise.all([
    listDocPayments(tenantId, systemId, target.id),
    listPaymentChannels(tenantId, systemId),
    getPolicy({ tenantId, systemId }),
  ]);
  const outstanding = paymentOutstandingOf(target) /* CRM C5.4-C ▸ − ใบลดหนี้ (F-05) ◂ */;
  const [legal, bookLegal, wctx] = await Promise.all([
    legalUiOptionsAt({ tenantId, systemId }, accountNow(), policy.whtDefaults, target.direction === "IN" ? "SHOP_PAYS" : "CUSTOMER_PAYS"),
    loadBookLegal({ tenantId, systemId }),
    whtDocContext(tenantId, systemId, target.id),
  ]);
  const wht = wctx ? whtPanelContextFrom(bookLegal, wctx, accountNow(), target.direction === "IN" ? "SHOP_PAYS" : "CUSTOMER_PAYS") : null;
  return {
    docId: doc.id,
    docType: doc.docType,
    docNo: doc.docNo,
    // ACC T3 (ดูจอ) ▸ เอกสารฝั่งจ่ายไม่มีใน DOC_LABEL (ฝั่งขาย) — เดิมขึ้นรหัสดิบ "ยอดEXPENSE" ◂
    docLabel: DOC_LABEL[doc.docType] ?? EXP_DOC_LABEL[doc.docType] ?? doc.docType,
    direction: target.direction as "IN" | "OUT",
    contactName: doc.contactName ?? "—",
    grandTotal: doc.grandTotal,
    paidTotal: target.paidTotal,
    outstanding,
    // ACC T3.2 ▸ ฐานของยอดค้างทั้งก้อน (ก่อน VAT · เฉพาะรายการที่หัก · สัดส่วนสะสม) — เดิม subTotal − ส่วนลด ทั้งใบ ◂
    whtBaseSatang: wht ? instalmentWhtBase(wht.base.full, wht.grandTotal, wht.paidBefore, outstanding) : Math.max(0, target.subTotal - target.discountAmount),
    status: target.status,
    targetDocId: target.id,
    targetDocNo: target.docNo,
    canRecord: ["AWAITING_PAYMENT", "PARTIAL"].includes(target.status),
    payments,
    channels,
    whtSuggest: legal.whtSuggest,
    wht,
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
    whtIncomeCode: wht > 0 && d.whtIncomeCode && whtIncomeCodeOf(d.whtIncomeCode) ? d.whtIncomeCode : null,
    whtChannel: d.whtChannel === "EWHT" ? "EWHT" : "NORMAL",
    whtCondition: d.whtCondition === "PAY_ALWAYS" || d.whtCondition === "PAY_ONCE" ? d.whtCondition : "WITHHOLD",
    ewhtRef: d.ewhtRef ? String(d.ewhtRef).trim().slice(0, 60) || null : null,
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

/** ม.40 ของงวด: รหัสขยาย → enum (ADVERTISING → M40_8 ฯลฯ) · ไม่มีรหัสขยาย = ค่าที่ส่งมา */
function incomeTypeOf(r: PaymentDraft, ev: WhtRowEval | null | undefined): AccountWhtIncomeType | null {
  if (r.whtAmountSatang <= 0) return null;
  return (ev?.parent ?? whtParentOf(r.whtIncomeCode) ?? r.whtIncomeType ?? null) as AccountWhtIncomeType | null;
}

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
      // เรียง id ตามลำดับคีย์ (ลำดับของ drafts) ไม่ใช่ตามที่ฐานข้อมูลคืนมา — ผู้เรียกยึดตำแหน่งได้
      const idByKey = new Map(done.map((d) => [d.idempotencyKey, d.id]));
      return {
        ok: true,
        targetDocId: target.id,
        status: after?.status ?? target.status,
        paidTotal: after?.paidTotal ?? 0,
        outstanding: (after ? paymentOutstandingOf(after) : 0) /* CRM C5.4-C ◂ */,
        certNos: [],
        recorded: 0,
        paymentIds: keys.map((k) => idByKey.get(k)).filter((v): v is string => !!v),
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
  const paymentIds: string[] = [];
  const warnings: LegalWarning[] = [];
  let recorded = 0;

  // ACC T3 ▸ หัก ณ ที่จ่ายของแต่ละงวด: ประเภทเงินได้ (รหัสขยาย → ม.40) · ฐานรายบรรทัด × สัดส่วนสะสม · ช่องทาง (e-WHT/ตัวแทน) · ออกภาษีให้ ·
  //   คำเตือนจากตาราง (ไม่บล็อก) · ผู้รับต่างประเทศไม่หัก = ต้องยืนยันข้อเท็จจริง (ด่านของคำขอ — งานเบื้องหลังไม่บล็อก) ◂
  const needsWht = rows.some((r) => r.whtAmountSatang > 0 || r.feeSatang > 0) || isPayable;
  const wctx = needsWht ? await whtDocContext(tenantId, systemId, target.id) : null;
  const wpanel = wctx ? whtPanelContextFrom(await loadBookLegal({ tenantId, systemId }), wctx, accountNow(), isPayable ? "SHOP_PAYS" : "CUSTOMER_PAYS") : null;
  const evals: (WhtRowEval | null)[] = [];
  {
    let paidBefore = wctx?.paidTotal ?? 0;
    const pending: LegalWarning[] = [];
    for (const r of rows) {
      const code = r.whtIncomeCode ?? r.whtIncomeType ?? null;
      const ev = wpanel
        ? evaluateWhtRow(wpanel, { code, rateBp: r.whtRateBp, whtAmount: r.whtAmountSatang, cash: r.amountSatang, fee: r.feeSatang, channel: r.whtChannel === "EWHT" ? "EWHT" : "NORMAL", condition: (r.whtCondition as WhtCondition) ?? "WITHHOLD", ewhtRef: r.ewhtRef }, paidBefore)
        : null;
      evals.push(ev);
      paidBefore += ev ? ev.tieOff : r.amountSatang + r.whtAmountSatang;
      for (const w of ev?.warnings ?? []) {
        if (w.ack) pending.push(w);
        else if (!warnings.some((x) => x.code === w.code && x.messageTh === w.messageTh)) warnings.push(w);
      }
    }
    const amb = legalAmbient();
    if (amb && pending.length) {
      const missing = unacknowledged(pending, amb.ack.codes);
      if (missing.length) throw new LegalAckRequiredError(pending);
    }
  }

  // CRM C5.4-C ▸ round 10 · มติ B (R9-5): ด่านที่ไม่ต้องเขียนอะไร ตรวจครบ **ทุกครั้ง** ก่อนบันทึกครั้งแรก (เดิมตรวจทีละครั้งกลางลูป) ◂
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.financeAccountId && !financeTypes.has(r.financeAccountId))
      return { ok: false, reason: "ช่องทางการเงินไม่ถูกต้อง" };
    if (r.cheque && r.feeSatang > 0)
      return { ok: false, reason: "การชำระด้วยเช็คยังไม่รองรับค่าธรรมเนียมธนาคาร" };
    const bad = r.cheque ? chequeDraftProblem({ chequeNo: r.cheque.chequeNo, bankName: r.cheque.bankName, amount: r.amountSatang }) : null;
    if (bad) return { ok: false, reason: rows.length > 1 ? `ครั้งที่ ${i + 1}: ${bad}` : bad };
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const channel: AccountPayChannel = r.cheque ? "CHEQUE" : channelOfFinanceType(financeTypes.get(r.financeAccountId ?? ""));
    const idempotencyKey = opts.keyBase ? `${opts.keyBase}:${i}` : null;
    const common = {
      paidAt: dateOf(r.paidAt),
      channel,
      // เช็ค: เงินยังไม่เข้าบัญชีจริง → ไม่ผูกบัญชีเงิน (GL พักที่ 1040/2300 ตาม gl.financeLedgerId)
      financeAccountId: r.cheque ? null : r.financeAccountId,
      amount: r.amountSatang,
      // ACC T3.6 ▸ ออกภาษีให้: ภาษีไม่ตัดหนี้ (borne) · หัก ณ ที่จ่ายปกติ = ตัดหนี้ ◂
      whtAmountSatang: evals[i] ? evals[i]!.withheld : r.whtAmountSatang,
      whtRateBp: r.whtRateBp,
      feeAmount: r.feeSatang,
      note: clampNote(r.note),
      createdById: opts.userId ?? null,
      idempotencyKey,
      wht: evals[i] && (r.whtAmountSatang > 0)
        ? { code: evals[i]!.code, baseSatang: evals[i]!.base, channel: evals[i]!.channel, condition: r.whtCondition ?? "WITHHOLD", borneSatang: evals[i]!.borne, ewhtRef: r.ewhtRef ?? null }
        : null,
      // ACC T2.8 ▸ รับเงินผ่านใบเสร็จที่แปลงจากใบแจ้งหนี้ (ทาง ①) = ใบเสร็จมีอยู่แล้ว ⇒ ไม่ออกใบเสร็จอัตโนมัติซ้ำ ◂
      skipAutoReceipt: doc.id !== target.id && doc.docType === "RECEIPT",
    };
    // CRM C5.4-C ▸ round 10 · มติ B (R9-4): รับ/จ่ายด้วยเช็ค = งวด + เช็ค + ผูก ในธุรกรรมเดียว (ไม่มีช่องให้ยกเลิกงวดแทรกก่อนผูก · เช็คล้ม = งวดไม่เกิด) ◂
    const res = r.cheque
      ? await recordPaymentWithChequeInOneTx(tenantId, systemId, target.id, isPayable ? "expense" : "revenue", { ...common, whtIncomeType: incomeTypeOf(r, evals[i]) }, {
          chequeNo: r.cheque.chequeNo,
          bankName: r.cheque.bankName,
          chequeDate: dateOf(r.cheque.chequeDate),
          amount: r.amountSatang,
          financeAccountId: r.financeAccountId,
          note: clampNote(r.note),
        })
      : isPayable
        ? await recordVendorPayment(tenantId, systemId, target.id, { ...common, whtIncomeType: incomeTypeOf(r, evals[i]) })
        : await recordPayment(tenantId, systemId, target.id, { ...common, whtIncomeType: incomeTypeOf(r, evals[i]) });
    if (!res.ok) return { ok: false, reason: `ครั้งที่ ${i + 1}: ${res.reason}` };
    recorded++;
    if (res.paymentId) paymentIds.push(res.paymentId);
    // ฝั่งขายคืนเลขใบภาษีถูกหัก (WTI) มาด้วย · ฝั่งจ่ายออก 50 ทวิ เองภายใน recordVendorPayment
    const certNo = (res as { whtCertNo?: string }).whtCertNo;
    if (certNo) certNos.push(certNo);
    for (const w of (res as { warnings?: LegalWarning[] }).warnings ?? []) if (!warnings.some((x) => x.code === w.code && x.messageTh === w.messageTh)) warnings.push(w);
  }

  const after = (await paymentTargetOf(tenantId, systemId, target.id))?.target;
  return {
    ok: true,
    targetDocId: target.id,
    status: after?.status ?? target.status,
    paidTotal: after?.paidTotal ?? 0,
    outstanding: (after ? paymentOutstandingOf(after) : 0) /* CRM C5.4-C ◂ */,
    certNos,
    recorded,
    paymentIds,
    ...(warnings.length ? { warnings } : {}),
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
  // CRM C5.4-C ▸ round 10 · มติ B: ร่างเช็คตรวจก่อนผูกรายการ/ออกเอกสาร (round 11: ผูกรายการ + เช็ค เป็นธุรกรรมเดียวแล้ว — ออกเอกสาร/หนังสือรับรองยังเป็นขั้นแยก) ◂
  for (const r of rows) {
    const bad = r.cheque ? chequeDraftProblem({ chequeNo: r.cheque.chequeNo, bankName: r.cheque.bankName, amount: r.amountSatang }) : null;
    if (bad) return { ok: false, reason: bad };
  }

  // CRM C5.4-C ▸ round 11 · R10-6: รายการรับเงิน + เช็ค + ผูกเช็ค ในธุรกรรมเดียว (รายการรับที่เป็นเช็คไม่มีวันไม่มีเช็ค) ·
  //   กดอนุมัติซ้ำหลังขั้นออกเอกสารล้ม (คีย์ชุดเดิมผูกไว้ครบแล้ว) ⇒ ข้ามการผูก ไปออกเอกสารต่อ (เดิมติด "บันทึกชุดนี้ไปแล้ว" ถาวร) ◂
  const keys = opts.keyBase ? rows.map((_r, i) => `${opts.keyBase}:${i}`) : [];
  const already = keys.length ? await findPaymentsByKeys(tenantId, systemId, keys) : [];
  // round 12 · R11-1: รายการชุดเดิมถูกยกเลิกไปแล้ว (เช่น เช็คเด้งขณะใบเสร็จยังเป็นร่าง) ⇒ ห้ามข้ามไปออกเอกสารโดยไม่มีเงิน — ให้กรอกการรับเงินใหม่
  if (keys.length > 0 && already.length === keys.length && already.some((p) => p.voidedAt))
    return { ok: false, reason: "รายการรับเงินของร่างใบเสร็จนี้ถูกยกเลิกไปแล้ว (เช่น เช็คเด้ง) — กรอกการรับเงินใหม่แล้วกดอนุมัติอีกครั้ง" };
  // round 13 · R12-1: ร่างมีรายการรับที่ยังมีผลอยู่แล้ว (ผูกสำเร็จแต่ออกเอกสารล้ม แล้วกลับมากดใหม่ด้วยคีย์ใหม่) —
  //   รายการที่ส่งมาตรงกับที่ผูกไว้ (ยอด · WHT · ช่องทาง/บัญชีเงิน · เลขเช็ค) ⇒ ข้ามการผูก ไปออกเอกสาร · ไม่ตรง ⇒ ปฏิเสธ (ไม่ผูกชุดที่สอง)
  //   (รายการว่าง ⇒ ออกเอกสารตรง ๆ ด้านบนแล้ว — ใช้รายการที่ผูกไว้)
  const sameKeyRetry = keys.length > 0 && already.length === keys.length && already.every((p) => p.documentId === docId);
  let matchedIds: string[] | null = null;
  if (!sameKeyRetry) {
    const live = (await listDocPayments(tenantId, systemId, docId)).filter((p) => !p.voidedAt);
    if (live.length > 0) {
      const sig = (x: { amount: number; wht: number; cheque: string | null; fin: string | null }) => `${x.amount}|${x.wht}|${x.cheque ?? `fin:${x.fin ?? ""}`}`;
      const want = rows.map((r) => sig({ amount: r.amountSatang, wht: r.whtAmountSatang, cheque: r.cheque ? r.cheque.chequeNo : null, fin: r.financeAccountId }));
      const have = live.map((p) => ({ id: p.id, s: sig({ amount: p.amount, wht: p.whtAmount, cheque: p.chequeNo, fin: p.financeAccountId }) }));
      const pool = [...have];
      const ids: string[] = [];
      for (const w of want) { const i = pool.findIndex((h) => h.s === w); if (i < 0) break; ids.push(pool[i].id); pool.splice(i, 1); }
      if (ids.length !== want.length || pool.length > 0) return { ok: false, reason: DRAFT_RECEIPT_ALREADY_ATTACHED_MSG };
      matchedIds = ids;
    }
  }
  const attached =
    sameKeyRetry
      ? { ok: true as const, paymentIds: keys.map((k) => already.find((p) => p.idempotencyKey === k)!.id) }
      : matchedIds
        ? { ok: true as const, paymentIds: matchedIds }
        : await attachReceiptPaymentsWithChequesInOneTx(
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
            idempotencyKey: keys[i] ?? null,
            cheque: r.cheque ? { chequeNo: r.cheque.chequeNo, bankName: r.cheque.bankName, chequeDate: dateOf(r.cheque.chequeDate) } : null,
            chequeFinanceAccountId: r.financeAccountId,
          })),
        );
  if (!attached.ok) return { ok: false, reason: attached.reason };

  const issued = await issueDocument(tenantId, systemId, docId);
  if (!issued.ok) return { ok: false, reason: issued.reason };

  // เอกสารภาษีถูกหัก (WTI) + ทะเบียนเช็ค — ทำหลังออกเอกสาร (ต้องมีเลขที่/สถานะจริงแล้ว)
  const certNos: string[] = [];
  // ACC T3.2 ▸ ฐานของงวด = ก่อน VAT เฉพาะรายการที่ถูกหัก × สัดส่วนสะสม (ตัวเดียวกับทางรับชำระ) — เดิม subTotal ทั้งใบ × สัดส่วน ปัดต่องวด ◂
  const wctxR = rows.some((r) => r.whtAmountSatang > 0) ? await whtDocContext(tenantId, systemId, docId) : null;
  let paidBeforeR = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const paymentId = attached.paymentIds[i];
    const tieOffR = r.amountSatang + r.whtAmountSatang;
    const baseR = wctxR ? whtInstalmentBaseOf({ ...wctxR, paidTotal: paidBeforeR }, tieOffR) : null;
    paidBeforeR += tieOffR;
    const code = r.whtIncomeCode ?? r.whtIncomeType;
    if (r.whtAmountSatang > 0 && code) {
      const base =
        baseR ?? (doc.grandTotal > 0
          ? Math.round((doc.subTotal * (r.amountSatang + r.whtAmountSatang)) / doc.grandTotal)
          : r.amountSatang + r.whtAmountSatang);
      const cert = await issueWhtCreditCertStandalone(
        { tenantId, systemId },
        {
          documentId: docId,
          paymentId,
          whtAmount: r.whtAmountSatang,
          whtRateBp: r.whtRateBp,
          incomeType: (whtParentOf(code) ?? r.whtIncomeType) as AccountWhtIncomeType,
          base,
          issueDate: dateOf(r.paidAt),
        },
      );
      if (!cert.ok) return { ok: false, reason: cert.reason };
      certNos.push(cert.docNo);
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
