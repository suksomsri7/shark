// ─────────────────────────────────────────────────────────────
// wht-cert-print.ts — ACC T3.3 · ข้อมูลของหน้าพิมพ์ 50 ทวิ ตามแบบทางการ (pure ล้วน · ข้อสอบเรนเดอร์ได้โดยไม่มีเซิร์ฟเวอร์)
//   ฝ่ายตามทิศของใบ: IN (เราหักผู้ขาย) ผู้หัก = ร้าน · OUT (WTI ลูกค้าหักเรา) ผู้หัก = ลูกค้า
//   design note ledger/wo-notes/T3.3.md
// ─────────────────────────────────────────────────────────────
import { bahtText } from "./totals";
import {
  CERT_PART_LABEL_TH,
  certBookNo,
  certIncomeRow,
  partyKindTh,
  whtConditionOf,
  whtFormOf,
  type CertPart,
  type PndFormNumber,
  type RecipientFacts,
} from "./wht-forms";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";

export type CertParty = { name: string; taxId: string; address: string; branch: string; kindTh: string };

export type CertPrintInput = {
  docNo: string | null;
  issueDate: Date;
  direction: "IN" | "OUT";
  status: string;
  voidReason: string | null;
  voidedAt: Date | null;
  whtIncomeType: string | null;
  whtRateBp: number | null;
  /** ฐานเงินได้ที่จ่าย (สตางค์) */
  subTotal: number;
  whtAmount: number;
  whtCondition: number | null;
  /** ผู้ติดต่อ (สำเนาที่ตรึงตอนออก) */
  contact: { name: string; taxId: string | null; address: string | null; branchCode: string | null; branchName?: string | null } & RecipientFacts;
  /** ร้าน (สำเนาผู้ขายที่ตรึง T2.9 หรือค่าตั้งปัจจุบัน) */
  shop: { name: string; taxId: string | null; address: string | null; branch: string; entityLegalType: "PERSON" | "COMPANY" };
  /** ลำดับที่ในแบบ (คิดจากรายงาน ภ.ง.ด. ของเดือน) */
  seq: number | null;
  /** ใบแทน: เลข/วันที่ของฉบับเดิม */
  replaces: { docNo: string | null; issueDate: Date; reason: string | null } | null;
  /** ใบนี้ถูกแทนแล้ว */
  replacedByNo: string | null;
  /** พิมพ์ซ้ำครั้งที่ (null = ครั้งแรก) */
  reprintNo: number | null;
  /** WTI: วันที่ได้รับหนังสือรับรองจริง (T3.5) */
  receivedAt: Date | null;
};

export type CertPrintModel = {
  docNo: string;
  bookNo: string;
  direction: "IN" | "OUT";
  cancelled: boolean;
  cancelLine: string | null;
  replacesLine: string | null;
  replacedByLine: string | null;
  payer: CertParty;
  payee: CertParty;
  form: PndFormNumber;
  formBox: number | null;
  noBoxNote: string | null;
  seq: number | null;
  incomeRow: 1 | 2 | 3 | 4 | 5 | 6;
  incomeDetail: string;
  paidDate: Date;
  amount: number;
  tax: number;
  taxWords: string;
  condition: 1 | 2 | 3 | 4;
  reprintLine: string | null;
  /** WTI เท่านั้น */
  recordBanner: string | null;
  warnings: LegalWarning[];
};

const branchLabel = (code: string | null | undefined, name?: string | null): string =>
  name?.trim() ? name.trim() : !code || code === "00000" ? "สำนักงานใหญ่" : `สาขา ${code}`;

export function buildCertPrint(x: CertPrintInput, incomeLabelTh: (t: string | null) => string, fmtDate: (d: Date) => string): CertPrintModel {
  const contactParty: CertParty = {
    name: x.contact.name,
    taxId: x.contact.taxId ?? "",
    address: x.contact.address ?? "",
    // สาขาเป็นเรื่องของผู้ประกอบการ (นิติบุคคล) — บุคคลธรรมดาไม่พิมพ์ "สำนักงานใหญ่"
    branch: x.contact.legalType === "PERSON" ? "" : branchLabel(x.contact.branchCode, x.contact.branchName),
    kindTh: partyKindTh(x.contact.legalType),
  };
  const shopParty: CertParty = { name: x.shop.name, taxId: x.shop.taxId ?? "", address: x.shop.address ?? "", branch: x.shop.branch, kindTh: partyKindTh(x.shop.entityLegalType) };
  const payer = x.direction === "IN" ? shopParty : contactParty;
  const payee = x.direction === "IN" ? contactParty : shopParty;
  // แบบ ภ.ง.ด. คิดจากผู้ถูกหัก: IN = ผู้ติดต่อ · OUT = ร้าน (ผู้จ่ายเป็นคนยื่นแบบของเขา — เพื่อแสดงช่องให้ตรง)
  const pick = whtFormOf(x.whtIncomeType, x.direction === "IN" ? x.contact : { legalType: x.shop.entityLegalType });
  const cancelled = x.status === "VOIDED" || x.status === "CANCELLED";
  const rate = x.whtRateBp != null ? ` อัตราร้อยละ ${(x.whtRateBp / 100).toFixed(x.whtRateBp % 100 ? 2 : 0)}` : "";
  return {
    docNo: x.docNo ?? "—",
    bookNo: certBookNo(x.issueDate),
    direction: x.direction,
    cancelled,
    cancelLine: cancelled ? `ยกเลิก${x.voidedAt ? `เมื่อ ${fmtDate(x.voidedAt)}` : ""}${x.voidReason ? ` · ${x.voidReason}` : ""}` : null,
    replacesLine: x.replaces ? `ออกแทนฉบับเลขที่ ${x.replaces.docNo ?? "—"} ลงวันที่ ${fmtDate(x.replaces.issueDate)}${x.replaces.reason ? ` (เหตุ: ${x.replaces.reason})` : ""}` : null,
    replacedByLine: x.replacedByNo ? `ออกใบแทนแล้ว เลขที่ ${x.replacedByNo}` : null,
    payer,
    payee,
    form: pick.form,
    formBox: pick.row.certBox,
    noBoxNote: pick.row.certBox == null ? `แบบนี้ไม่มีช่อง ${pick.form === 54 ? "ภ.ง.ด.54" : `ภ.ง.ด.${pick.form}`} — รายการนำส่งด้วย ภ.ง.ด.${pick.form}` : null,
    seq: x.seq,
    incomeRow: certIncomeRow(x.whtIncomeType),
    incomeDetail: `${incomeLabelTh(x.whtIncomeType)}${rate}`,
    paidDate: x.issueDate,
    amount: x.subTotal,
    tax: x.whtAmount,
    taxWords: bahtText(x.whtAmount),
    condition: whtConditionOf(x.whtCondition),
    reprintLine: x.reprintNo ? `พิมพ์ซ้ำครั้งที่ ${x.reprintNo}` : null,
    recordBanner:
      x.direction === "OUT"
        ? `บันทึกของผู้ถูกหัก (ลูกค้าหักภาษีไว้) — หนังสือรับรองตัวจริงออกโดยผู้จ่ายเงิน · ${x.receivedAt ? `ได้รับหนังสือรับรองแล้ว ${fmtDate(x.receivedAt)}` : "ยังไม่ได้รับหนังสือรับรองจากลูกค้า"}`
        : null,
    warnings: pick.warnings,
  };
}

export const certPartLabel = (p: CertPart): string => CERT_PART_LABEL_TH[p];
