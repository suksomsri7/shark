// stock-issue-reasons.ts — สาเหตุการเบิกสินค้าครบชุด + ผลทางบัญชี/VAT ของแต่ละสาเหตุ (ACC T4.8 · H3) · pure (จอ/ข้อสอบใช้ได้)
//
// skill domain-shark-accounting-cases §5: ของแถมพร้อมการขาย ฉ.40 ข้อ 2(1) [V] · ตัวอย่าง ข้อ 2(7) [V] · อาหารพนักงาน ข้อ 2(8) [V] ·
//   ใช้ส่วนตัวเจ้าของ = ขาย ม.77/1(8)(ง) ราคาตลาด ม.79/3 [V] · ของเสีย/ทำลาย ป.79/2541 ข้อ 3(3.1) [V] (ผล VAT [S]) · ขาดไม่ทราบสาเหตุ ป.86/2542 ข้อ 3(3) [V]/[U]
// ข้อความที่เก็บใน `AccountDocument.adjustReason` = ป้ายไทย (คงค่าเดิม 5 ตัว) · รหัสเก็บที่ `adjustReasonCode`
// บัญชีเดบิตปริยาย: สาเหตุเดิม 5 ตัวคง 5300 (ไม่เปลี่ยน GL เดิม) · สาเหตุใหม่ใช้บัญชีเฉพาะ (mapping key) — ร้านเปลี่ยนบัญชีบนฟอร์มได้
import { legalWarning, type LegalWarning, type LegalWarningCode } from "@/lib/core/settings/legal/warnings";

export type GoodsIssueReasonDef = {
  code: string;
  labelTh: string;
  /** mapping key ของบัญชีเดบิตปริยาย */
  mappingKey: string;
  /** รหัสบัญชีปริยายในผังมาตรฐาน */
  defaultCode: string;
  /** คำเตือนผลทางบัญชี/ภาษี */
  warning: LegalWarningCode | null;
  /** ควรมีผู้อนุมัติแยกจากผู้ทำ (ของเสีย/ทำลาย · ขาด · ใช้ส่วนตัว) */
  separateApprover: boolean;
  /** ถือเป็นการขาย (คิดภาษีขาย) ตามกฎ */
  deemedSale: boolean;
};

export const GOODS_ISSUE_REASON_DEFS: readonly GoodsIssueReasonDef[] = [
  { code: "BUSINESS_USE", labelTh: "ใช้ในกิจการ", mappingKey: "GOODS_ISSUE_EXPENSE", defaultCode: "5300", warning: null, separateApprover: false, deemedSale: false },
  { code: "SAMPLE", labelTh: "ตัวอย่าง/แจก", mappingKey: "GOODS_ISSUE_EXPENSE", defaultCode: "5300", warning: "STOCK_ISSUE_SAMPLE", separateApprover: false, deemedSale: false },
  { code: "DAMAGED", labelTh: "ชำรุด/สูญหาย", mappingKey: "GOODS_ISSUE_EXPENSE", defaultCode: "5300", warning: "STOCK_ISSUE_WASTE", separateApprover: true, deemedSale: false },
  { code: "TRANSFER", labelTh: "โอนสาขา", mappingKey: "GOODS_ISSUE_EXPENSE", defaultCode: "5300", warning: null, separateApprover: false, deemedSale: false },
  { code: "GIVEAWAY", labelTh: "ของแถม", mappingKey: "PROMO_GOODS", defaultCode: "6310", warning: "STOCK_ISSUE_GIVEAWAY", separateApprover: false, deemedSale: false },
  { code: "STAFF_MEAL", labelTh: "อาหารพนักงาน", mappingKey: "STAFF_WELFARE", defaultCode: "6050", warning: "STOCK_ISSUE_STAFF_MEAL", separateApprover: false, deemedSale: false },
  { code: "PERSONAL_USE", labelTh: "ใช้ส่วนตัวเจ้าของ", mappingKey: "OWNER_DRAWINGS", defaultCode: "3100", warning: "STOCK_ISSUE_PERSONAL_USE", separateApprover: true, deemedSale: true },
  { code: "WASTE", labelTh: "ของเสีย/ทำลาย", mappingKey: "GOODS_WASTE", defaultCode: "5330", warning: "STOCK_ISSUE_WASTE", separateApprover: true, deemedSale: false },
  { code: "SHORTAGE", labelTh: "สินค้าขาด (นับแล้วขาด)", mappingKey: "GOODS_WASTE", defaultCode: "5330", warning: "STOCK_ISSUE_SHORTAGE", separateApprover: true, deemedSale: true },
  { code: "OTHER", labelTh: "อื่น ๆ", mappingKey: "GOODS_ISSUE_EXPENSE", defaultCode: "5300", warning: null, separateApprover: false, deemedSale: false },
];

/** ป้ายไทยตามลำดับบนฟอร์ม (คงชื่อ GOODS_ISSUE_REASONS เดิม — ค่าเดิม 5 ตัวยังอยู่ครบ) */
export const GOODS_ISSUE_REASON_LABELS = GOODS_ISSUE_REASON_DEFS.map((d) => d.labelTh);

/** รหัสหรือป้ายไทย → นิยาม · ไม่รู้จัก = null (ข้อความอิสระของใบเก่า) */
export function goodsIssueReasonOf(v: string | null | undefined): GoodsIssueReasonDef | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return GOODS_ISSUE_REASON_DEFS.find((d) => d.code === t || d.labelTh === t) ?? null;
}

/**
 * คำเตือนของใบเบิก: ผลทางบัญชี/VAT ของสาเหตุ + ผู้อนุมัติคนเดียวกับผู้ทำ (สาเหตุที่ควรมีผู้อนุมัติแยก)
 *   `approverId` ไม่ส่ง = ยังไม่อนุมัติ (ร่าง) ⇒ ไม่ตรวจข้อผู้อนุมัติ
 */
export function goodsIssueWarnings(reason: string | null | undefined, who: { createdById?: string | null; approverId?: string | null } = {}, extra: { vat?: string } = {}): LegalWarning[] {
  const d = goodsIssueReasonOf(reason);
  if (!d) return [];
  const out: LegalWarning[] = [];
  if (d.warning) out.push(legalWarning(d.warning, extra.vat ? { vat: extra.vat } : {}));
  if (d.separateApprover && who.approverId && who.createdById && who.approverId === who.createdById) out.push(legalWarning("STOCK_ISSUE_APPROVER_SAME"));
  return out;
}
