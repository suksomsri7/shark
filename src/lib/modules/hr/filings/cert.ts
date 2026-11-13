// HR H3.6 ▸ หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ — เนื้อหา (pure) · brief R11 · wo-notes/hr-H3.6-oracle.md §7
//   taxCertContent = เนื้อหาที่แช่แข็งลง HrTaxCertificate.contentJson ตอนออก (PDF สร้างใหม่จากเนื้อหานี้ทุกครั้ง — cert-pdf.tsx)
//   เลขที่ = เครื่องออกเลขของบัญชี: formatDocNo("<prefix>-{ปี}-{0000}", 31 ธ.ค. ของปีภาษี 12:00 เวลาไทย) · เล่มที่ = ปีภาษี พ.ศ.
//   ชื่อผู้ถูกหัก = คำนำหน้า ชื่อ สกุล คั่นช่องว่างเดียว (ไม่มีคำนำหน้า = ข้าม) · ที่อยู่ = ส่วนที่กรอกแยกช่อง (หรือบรรทัดที่อยู่) + ตำบล อำเภอ จังหวัด รหัสไปรษณีย์
//   ไม่มี db/เวลา/สุ่ม ◂
import { bahtText } from "@/lib/modules/account/totals";
import { formatDocNo } from "@/lib/modules/account/doc-numbering";
import { clean, type FilingEmployer, type FilingPerson } from "./rd";

export const CERT_ROW1_LABEL = "เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)";

export type TaxCertContent = {
  v: 1;
  kind: "ANNUAL" | "LEAVER";
  taxYear: number;
  taxYearBe: number;
  bookNo: string;
  docNo: string;
  formType: "PND1A";
  formSeq: number;
  payer: { taxId: string; branchNo: string; name: string; address: string };
  payee: { taxId: string; name: string; address: string };
  rows: { row: "1"; label: string; paidWhen: string; amountSatang: number; taxSatang: number }[];
  totalSatang: number;
  totalTaxSatang: number;
  totalTaxText: string;
  funds: { govSatang: number; ssoSatang: number; providentSatang: number };
  payCondition: 1;
  issueDate: string;
  signerName: string;
};
export type TaxCertInput = {
  kind: "ANNUAL" | "LEAVER";
  taxYear: number;
  seq: number;
  formSeq: number;
  issueDate: string;
  employer: FilingEmployer;
  person: FilingPerson;
  figures: { incomeSatang: number; taxSatang: number; ssoSatang: number };
};

/** เลขที่หนังสือรับรอง (ผ่าน formatDocNo ของเครื่องออกเลข) — วันที่ของเลข = 31 ธ.ค. ของปีภาษี 12:00 เวลาไทย */
export function taxCertDocNo(prefix: string, taxYearCE: number, seq: number): string {
  return formatDocNo(`${prefix}-{ปี}-{0000}`, { prefix, date: new Date(Date.UTC(taxYearCE, 11, 31, 5, 0, 0)), seq });
}
/** ชื่อผู้ถูกหัก: คำนำหน้า ชื่อ สกุล (ส่วนที่ว่าง = ข้าม) */
export const payeeNameOf = (p: FilingPerson) => [clean(p.title), clean(p.firstName), clean(p.lastName)].filter(Boolean).join(" ");
/** ที่อยู่ผู้ถูกหัก (กฎ §7) */
export function payeeAddressOf(p: FilingPerson): string {
  const a = p.address ?? ({} as FilingPerson["address"]);
  const parts = [clean(a.building), a.room && clean(a.room) ? `ห้อง ${clean(a.room)}` : "", a.floor && clean(a.floor) ? `ชั้น ${clean(a.floor)}` : "", clean(a.village),
    a.houseNo && clean(a.houseNo) ? `เลขที่ ${clean(a.houseNo)}` : "", a.moo && clean(a.moo) ? `หมู่ ${clean(a.moo)}` : "", clean(a.soi), a.street && clean(a.street) ? `ถนน ${clean(a.street)}` : ""].filter(Boolean);
  const head = parts.length ? parts : [clean(a.line)].filter(Boolean);
  return [...head, clean(a.subdistrict), clean(a.district), clean(a.province), clean(a.postcode)].filter(Boolean).join(" ");
}

export function taxCertContent(i: TaxCertInput): TaxCertContent {
  const be = i.taxYear + 543;
  return {
    v: 1,
    kind: i.kind,
    taxYear: i.taxYear,
    taxYearBe: be,
    bookNo: String(be),
    docNo: taxCertDocNo(clean(i.employer.certPrefix) || "HR50", i.taxYear, i.seq),
    formType: "PND1A",
    formSeq: i.formSeq,
    payer: { taxId: clean(i.employer.taxId), branchNo: clean(i.employer.branchNo), name: clean(i.employer.employerName), address: clean(i.employer.employerAddress) },
    payee: { taxId: clean(i.person.nationalId), name: payeeNameOf(i.person), address: payeeAddressOf(i.person) },
    rows: [{ row: "1", label: CERT_ROW1_LABEL, paidWhen: String(be), amountSatang: i.figures.incomeSatang, taxSatang: i.figures.taxSatang }],
    totalSatang: i.figures.incomeSatang,
    totalTaxSatang: i.figures.taxSatang,
    totalTaxText: bahtText(i.figures.taxSatang),
    funds: { govSatang: 0, ssoSatang: i.figures.ssoSatang, providentSatang: 0 },
    payCondition: 1,
    issueDate: i.issueDate,
    signerName: clean(i.employer.signerName),
  };
}
