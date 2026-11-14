// HR H3.9 ▸ รายงาน HR + ทะเบียนลูกจ้าง (ม.112–115 [V2]) — ชั้น pure (ไม่มี db / นาฬิกา / สุ่ม) · brief hr-brief-H3.9 R2
//   แคตตาล็อกคอลัมน์ (key · ชั้น P ธรรมดา / $ เงิน / I เลขประจำตัว · รวมไหม · หัวไทย/อังกฤษ) = fixture ของข้อสอบ คัดลอกตรงตัว
//   ไฟล์ CSV/XLSX เขียนด้วยตัวเขียนของ H3.5 เท่านั้น (bank-files/generic#csvBytes · bank-files/xlsx#xlsxBytes) — ไม่มีตัวเขียนชุดที่สอง
//   ตัวเลขทุกตัวอ่านจากค่าที่เก็บไว้ (รายการเงินเดือน · ผลตัดสินรายวัน · คำขอ OT) — ไม่มีสูตรคิดเงิน/ภาษี/ประกันสังคมในไฟล์นี้ ◂
import { cellWritable, csvBytes, formulaLike } from "./bank-files/generic";
import { xlsxBytes } from "./bank-files/xlsx";

export const REPORT_IDS = ["time", "leave", "ot", "payroll-month", "payroll-year", "tax-month", "tax-year", "wages", "register"] as const;
export type ReportId = (typeof REPORT_IDS)[number];
export const isReportId = (r: unknown): r is ReportId => typeof r === "string" && (REPORT_IDS as readonly string[]).includes(r);
export type ColumnClass = "P" | "$" | "I";
export type ReportColumn = { key: string; cls: ColumnClass; sum: boolean; th: string; en: string };
export type ReportDef = { period: "month" | "year" | "day"; totals: boolean; thaiOnly: boolean; columns: ReportColumn[] };
export const REPORT_LIMITS = { employees: 2000 } as const;
/** รหัสบรรทัดรุ่น 2 ที่นับเป็น "ค่าจ้าง" ในเอกสารการจ่ายค่าจ้าง ม.114 (OT / ทำงานวันหยุด แยกช่อง · รายการเพิ่มอื่น/หักอื่นไม่นับ) */
export const WAGE_CODES_V2 = ["BASE", "PRORATION", "DAY_WAGE", "HOUR_WAGE", "HOLIDAY_PAY", "UNPAID_LEAVE", "UNPAID_CAP", "LATE_RULE", "ABSENT_RULE"] as const;
/** ช่องที่ทะเบียนลูกจ้างต้องมี (ม.113) — นับแถวที่ว่างเป็นคำเตือน */
export const REGISTER_STATUTORY = ["gender", "nationality", "birthDate", "address", "startDate", "position", "rate"] as const;
/** ป้ายภาษาไทย (ทะเบียน · เอกสารการจ่ายค่าจ้าง) */
export const REPORT_LABELS = {
  gender: { MALE: "ชาย", FEMALE: "หญิง", OTHER: "อื่น ๆ" } as Record<string, string>,
  payType: { MONTHLY: "รายเดือน", DAILY: "รายวัน", HOURLY: "รายชั่วโมง" } as Record<string, string>,
  status: { PROBATION: "ทดลองงาน", ACTIVE: "ทำงาน", ENDED: "สิ้นสุด" } as Record<string, string>,
};

export const REPORT_CATALOG: Record<ReportId, ReportDef> = {
  "time": {
    period: "month", totals: true, thaiOnly: false,
    columns: [
      { key: "code", cls: "P", sum: false, th: "รหัส", en: "Code" },
      { key: "name", cls: "P", sum: false, th: "ชื่อ", en: "Name" },
      { key: "unit", cls: "P", sum: false, th: "สาขา", en: "Branch" },
      { key: "slots", cls: "P", sum: true, th: "กะที่มี", en: "Shifts" },
      { key: "workedDays", cls: "P", sum: true, th: "วันที่มาทำงาน", en: "Days worked" },
      { key: "lateCount", cls: "P", sum: true, th: "สาย (ครั้ง)", en: "Late (times)" },
      { key: "lateMin", cls: "P", sum: true, th: "สาย (นาที)", en: "Late (min)" },
      { key: "earlyOutCount", cls: "P", sum: true, th: "ออกก่อน (ครั้ง)", en: "Early out (times)" },
      { key: "earlyOutMin", cls: "P", sum: true, th: "ออกก่อน (นาที)", en: "Early out (min)" },
      { key: "absentDays", cls: "P", sum: true, th: "ขาด (วัน)", en: "Absent (days)" },
      { key: "absentMin", cls: "P", sum: true, th: "ขาด (นาที)", en: "Absent (min)" },
      { key: "leaveDays", cls: "P", sum: true, th: "ลา (วัน)", en: "Leave (days)" },
      { key: "workedMin", cls: "P", sum: true, th: "เวลาทำงาน (นาที)", en: "Worked (min)" },
      { key: "measuredOtMin", cls: "P", sum: true, th: "เกินเวลาที่วัดได้ (นาที)", en: "Measured overtime (min)" },
      { key: "missingOut", cls: "P", sum: true, th: "ไม่ได้ลงเวลาออก", en: "Missing clock-out" },
      { key: "corrections", cls: "P", sum: true, th: "แก้เวลาที่อนุมัติ", en: "Approved corrections" },
    ],
  },
  "leave": {
    period: "year", totals: false, thaiOnly: false,
    columns: [
      { key: "code", cls: "P", sum: false, th: "รหัส", en: "Code" },
      { key: "name", cls: "P", sum: false, th: "ชื่อ", en: "Name" },
      { key: "unit", cls: "P", sum: false, th: "สาขา", en: "Branch" },
      { key: "policy", cls: "P", sum: false, th: "นโยบายลา", en: "Leave policy" },
      { key: "category", cls: "P", sum: false, th: "ประเภท", en: "Category" },
      { key: "unlimited", cls: "P", sum: false, th: "ไม่จำกัด", en: "Unlimited" },
      { key: "granted", cls: "P", sum: false, th: "ได้รับ", en: "Granted" },
      { key: "carried", cls: "P", sum: false, th: "ยกมา", en: "Carried" },
      { key: "used", cls: "P", sum: false, th: "ใช้ไป", en: "Used" },
      { key: "adjusted", cls: "P", sum: false, th: "ปรับ", en: "Adjusted" },
      { key: "expired", cls: "P", sum: false, th: "หมดอายุ", en: "Expired" },
      { key: "balance", cls: "P", sum: false, th: "คงเหลือ", en: "Balance" },
      { key: "pending", cls: "P", sum: false, th: "รออนุมัติ", en: "Pending" },
    ],
  },
  "ot": {
    period: "month", totals: true, thaiOnly: false,
    columns: [
      { key: "code", cls: "P", sum: false, th: "รหัส", en: "Code" },
      { key: "name", cls: "P", sum: false, th: "ชื่อ", en: "Name" },
      { key: "unit", cls: "P", sum: false, th: "สาขา", en: "Branch" },
      { key: "pending", cls: "P", sum: true, th: "รออนุมัติ", en: "Pending" },
      { key: "approved", cls: "P", sum: true, th: "อนุมัติ", en: "Approved" },
      { key: "rejected", cls: "P", sum: true, th: "ปฏิเสธ", en: "Rejected" },
      { key: "approvedMin", cls: "P", sum: true, th: "นาทีที่อนุมัติ", en: "Approved (min)" },
      { key: "otWorkdayMin", cls: "P", sum: true, th: "OT วันทำงาน (นาที)", en: "Workday OT (min)" },
      { key: "holidayWorkMin", cls: "P", sum: true, th: "ทำงานวันหยุด (นาที)", en: "Holiday work (min)" },
      { key: "otHolidayMin", cls: "P", sum: true, th: "OT วันหยุด (นาที)", en: "Holiday OT (min)" },
      { key: "keptHolidayWorkMin", cls: "P", sum: true, th: "ทำงานวันหยุดที่คงจ่าย (นาที)", en: "Kept holiday work (min)" },
      { key: "otWorkdayAmt", cls: "$", sum: true, th: "OT วันทำงาน (บาท)", en: "Workday OT (THB)" },
      { key: "holidayWorkAmt", cls: "$", sum: true, th: "ทำงานวันหยุด (บาท)", en: "Holiday work (THB)" },
      { key: "otHolidayAmt", cls: "$", sum: true, th: "OT วันหยุด (บาท)", en: "Holiday OT (THB)" },
      { key: "keptHolidayWorkAmt", cls: "$", sum: true, th: "ทำงานวันหยุดที่คงจ่าย (บาท)", en: "Kept holiday work (THB)" },
      { key: "amount", cls: "$", sum: true, th: "รวม (บาท)", en: "Total (THB)" },
    ],
  },
  "payroll-month": {
    period: "month", totals: true, thaiOnly: false,
    columns: [
      { key: "code", cls: "P", sum: false, th: "รหัส", en: "Code" },
      { key: "name", cls: "P", sum: false, th: "ชื่อ", en: "Name" },
      { key: "unit", cls: "P", sum: false, th: "สาขา", en: "Branch" },
      { key: "status", cls: "P", sum: false, th: "สถานะรอบ", en: "Run status" },
      { key: "engine", cls: "P", sum: false, th: "รุ่นเครื่องคิด", en: "Engine" },
      { key: "gross", cls: "$", sum: true, th: "ยอดก่อนหัก", en: "Gross" },
      { key: "add", cls: "$", sum: true, th: "รายการเพิ่ม", en: "Additions" },
      { key: "deduct", cls: "$", sum: true, th: "รายการหัก", en: "Deductions" },
      { key: "ssoEmployee", cls: "$", sum: true, th: "ประกันสังคม (ลูกจ้าง)", en: "SSO (employee)" },
      { key: "ssoEmployer", cls: "$", sum: true, th: "ประกันสังคม (นายจ้าง)", en: "SSO (employer)" },
      { key: "wht", cls: "$", sum: true, th: "ภาษีหัก ณ ที่จ่าย", en: "Withholding tax" },
      { key: "net", cls: "$", sum: true, th: "สุทธิ", en: "Net pay" },
    ],
  },
  "payroll-year": {
    period: "year", totals: true, thaiOnly: false,
    columns: [
      { key: "code", cls: "P", sum: false, th: "รหัส", en: "Code" },
      { key: "name", cls: "P", sum: false, th: "ชื่อ", en: "Name" },
      { key: "unit", cls: "P", sum: false, th: "สาขา", en: "Branch" },
      { key: "runs", cls: "P", sum: true, th: "จำนวนรอบ", en: "Runs" },
      { key: "gross", cls: "$", sum: true, th: "ยอดก่อนหัก", en: "Gross" },
      { key: "add", cls: "$", sum: true, th: "รายการเพิ่ม", en: "Additions" },
      { key: "deduct", cls: "$", sum: true, th: "รายการหัก", en: "Deductions" },
      { key: "ssoEmployee", cls: "$", sum: true, th: "ประกันสังคม (ลูกจ้าง)", en: "SSO (employee)" },
      { key: "ssoEmployer", cls: "$", sum: true, th: "ประกันสังคม (นายจ้าง)", en: "SSO (employer)" },
      { key: "wht", cls: "$", sum: true, th: "ภาษีหัก ณ ที่จ่าย", en: "Withholding tax" },
      { key: "net", cls: "$", sum: true, th: "สุทธิ", en: "Net pay" },
    ],
  },
  "tax-month": {
    period: "month", totals: true, thaiOnly: false,
    columns: [
      { key: "code", cls: "P", sum: false, th: "รหัส", en: "Code" },
      { key: "name", cls: "P", sum: false, th: "ชื่อ", en: "Name" },
      { key: "unit", cls: "P", sum: false, th: "สาขา", en: "Branch" },
      { key: "citizenId", cls: "I", sum: false, th: "เลขประจำตัวประชาชน", en: "National ID" },
      { key: "income", cls: "$", sum: true, th: "เงินได้ 40(1)", en: "Income 40(1)" },
      { key: "wht", cls: "$", sum: true, th: "ภาษีหัก ณ ที่จ่าย", en: "Withholding tax" },
      { key: "ssoBase", cls: "$", sum: true, th: "ฐานประกันสังคม", en: "SSO wage base" },
      { key: "ssoEmployee", cls: "$", sum: true, th: "ประกันสังคม (ลูกจ้าง)", en: "SSO (employee)" },
      { key: "ssoEmployer", cls: "$", sum: true, th: "ประกันสังคม (นายจ้าง)", en: "SSO (employer)" },
    ],
  },
  "tax-year": {
    period: "year", totals: true, thaiOnly: false,
    columns: [
      { key: "code", cls: "P", sum: false, th: "รหัส", en: "Code" },
      { key: "name", cls: "P", sum: false, th: "ชื่อ", en: "Name" },
      { key: "unit", cls: "P", sum: false, th: "สาขา", en: "Branch" },
      { key: "citizenId", cls: "I", sum: false, th: "เลขประจำตัวประชาชน", en: "National ID" },
      { key: "months", cls: "P", sum: true, th: "จำนวนเดือน", en: "Months" },
      { key: "income", cls: "$", sum: true, th: "เงินได้ 40(1)", en: "Income 40(1)" },
      { key: "wht", cls: "$", sum: true, th: "ภาษีหัก ณ ที่จ่าย", en: "Withholding tax" },
      { key: "ssoEmployee", cls: "$", sum: true, th: "ประกันสังคม (ลูกจ้าง)", en: "SSO (employee)" },
      { key: "ssoEmployer", cls: "$", sum: true, th: "ประกันสังคม (นายจ้าง)", en: "SSO (employer)" },
    ],
  },
  "wages": {
    period: "month", totals: true, thaiOnly: false,
    columns: [
      { key: "code", cls: "P", sum: false, th: "รหัส", en: "Code" },
      { key: "name", cls: "P", sum: false, th: "ชื่อ", en: "Name" },
      { key: "unit", cls: "P", sum: false, th: "สาขา", en: "Branch" },
      { key: "payType", cls: "P", sum: false, th: "รูปแบบค่าจ้าง", en: "Pay type" },
      { key: "rate", cls: "$", sum: false, th: "อัตราค่าจ้าง", en: "Wage rate" },
      { key: "workedDays", cls: "P", sum: true, th: "วันที่มาทำงาน", en: "Days worked" },
      { key: "workedMin", cls: "P", sum: true, th: "เวลาทำงาน (นาที)", en: "Worked (min)" },
      { key: "wage", cls: "$", sum: true, th: "ค่าจ้าง", en: "Wage" },
      { key: "ot", cls: "$", sum: true, th: "ค่าล่วงเวลา", en: "Overtime pay" },
      { key: "holidayWork", cls: "$", sum: true, th: "ค่าทำงานในวันหยุด", en: "Holiday work pay" },
      { key: "add", cls: "$", sum: true, th: "รายการเพิ่ม", en: "Additions" },
      { key: "deduct", cls: "$", sum: true, th: "รายการหัก", en: "Deductions" },
      { key: "gross", cls: "$", sum: true, th: "ยอดก่อนหัก", en: "Gross" },
      { key: "net", cls: "$", sum: true, th: "สุทธิ", en: "Net pay" },
      { key: "payDate", cls: "P", sum: false, th: "วันจ่าย", en: "Pay date" },
    ],
  },
  "register": {
    period: "day", totals: false, thaiOnly: true,
    columns: [
      { key: "code", cls: "P", sum: false, th: "รหัส", en: "Code" },
      { key: "name", cls: "P", sum: false, th: "ชื่อตัวและชื่อสกุล", en: "First and last name" },
      { key: "gender", cls: "P", sum: false, th: "เพศ", en: "Sex" },
      { key: "nationality", cls: "P", sum: false, th: "สัญชาติ", en: "Nationality" },
      { key: "birthDate", cls: "P", sum: false, th: "วันเดือนปีเกิด", en: "Date of birth" },
      { key: "age", cls: "P", sum: false, th: "อายุ", en: "Age" },
      { key: "address", cls: "P", sum: false, th: "ที่อยู่ปัจจุบัน", en: "Current address" },
      { key: "startDate", cls: "P", sum: false, th: "วันที่เริ่มจ้าง", en: "Start date" },
      { key: "position", cls: "P", sum: false, th: "ตำแหน่งหรืองานในหน้าที่", en: "Position or duty" },
      { key: "payType", cls: "P", sum: false, th: "รูปแบบค่าจ้าง", en: "Pay type" },
      { key: "rate", cls: "$", sum: false, th: "อัตราค่าจ้าง", en: "Wage rate" },
      { key: "otherBenefits", cls: "$", sum: false, th: "ประโยชน์ตอบแทนอย่างอื่น", en: "Other benefits" },
      { key: "endDate", cls: "P", sum: false, th: "วันสิ้นสุดการจ้าง", en: "End of employment" },
      { key: "status", cls: "P", sum: false, th: "สถานะการจ้าง", en: "Employment status" },
      { key: "citizenId", cls: "I", sum: false, th: "เลขประจำตัวประชาชน", en: "National ID" },
    ],
  },
};
export const REPORT_TEXT = {
  "no": "ไม่พบรายงานนี้ หรือคุณไม่มีสิทธิ์ดูรายงานนี้",
  "input": "ช่วงเวลาหรือรูปแบบไฟล์ไม่ถูกต้อง",
  "formula": "มีข้อความที่โปรแกรมตารางอาจอ่านเป็นสูตร — แก้ข้อความก่อนส่งออก", // HR PRIV-2 ▸ R5: ข้อความคงที่ ไม่ต่อชื่อพนักงาน ◂
  "encoding": "มีอักขระพิเศษที่เขียนลงไฟล์ไม่ได้ — แก้ข้อความก่อนส่งออก", // HR PRIV-2 ▸ R5: ข้อความคงที่ ไม่ต่อชื่อพนักงาน ◂
  "limit": "ข้อมูลมากเกินกว่าจะแสดงในรายงานเดียว — เลือกสาขาหรือช่วงเวลาให้แคบลง",
  "total": "รวม",
  "registerDuty": "ทะเบียนลูกจ้างตาม พ.ร.บ.คุ้มครองแรงงาน ม.112–113 (นายจ้างที่มีลูกจ้างตั้งแต่ 10 คน · ทำเป็นภาษาไทย) — อ้างจากฉบับรวมแก้ไข โปรดตรวจกับที่ปรึกษาแรงงาน",
  "registerUnder10": "ร้านนี้มีพนักงานที่ยังทำงานน้อยกว่า 10 คน — ม.112 ให้นายจ้างที่มีลูกจ้างตั้งแต่ 10 คนจัดทำทะเบียน (อ้างจากฉบับรวมแก้ไข โปรดตรวจกับที่ปรึกษาแรงงาน)",
  "registerRetention": "ม.115: เก็บทะเบียนไว้ไม่น้อยกว่า 2 ปีนับแต่วันสิ้นสุดการจ้างของลูกจ้างแต่ละราย — SHARK ไม่ลบประวัติพนักงานที่สิ้นสุดการจ้าง",
  "registerMissing": "ข้อมูลที่ทะเบียนต้องมียังไม่ครบ — เพิ่มได้ในหน้าพนักงาน",
  "registerInput": "สัญชาติยาวได้ไม่เกิน 60 ตัวอักษร และประโยชน์ตอบแทนอย่างอื่นไม่เกิน 500 ตัวอักษร (ไม่มีอักขระพิเศษ)",
  "s114Note": "เอกสารการจ่ายค่าจ้าง (ม.114): วันและเวลาทำงาน อัตราและจำนวนค่าจ้าง ค่าล่วงเวลา และค่าทำงานในวันหยุด — ค่าล่วงเวลาในวันหยุดแยกดูได้ในรายงาน OT · โปรดตรวจกับที่ปรึกษาว่าครบตามที่ต้องเก็บ",
  "taxNote": "ตัวเลขจากรอบเงินเดือนที่อนุมัติแล้ว (ไม่คิดใหม่) — ไฟล์ยื่น ภ.ง.ด.1 / สปส.1-10 อยู่ในงานยื่นแบบ",
  "timeNote": "เกินเวลาที่วัดได้ = เวลาที่อยู่เกินกะตามการลงเวลา ยังไม่ใช่ OT ที่อนุมัติ",
  "title.time": "รายงานเวลาทำงาน",
  "title.leave": "รายงานวันลา",
  "title.ot": "รายงาน OT",
  "title.payroll-month": "สรุปเงินเดือนรายงวด",
  "title.payroll-year": "สรุปเงินเดือนรายปี",
  "title.tax-month": "ภาษีและประกันสังคมรายเดือน",
  "title.tax-year": "ภาษีและประกันสังคมทั้งปี",
  "title.wages": "เอกสารการจ่ายค่าจ้าง",
  "title.register": "ทะเบียนลูกจ้าง",
  "fullIdWarning": "ไฟล์ทะเบียนที่มีเลขประจำตัวประชาชนเต็มเป็นการเปิดเผยข้อมูลส่วนบุคคลเพิ่มขึ้น และไฟล์ที่ดาวน์โหลดแล้วอยู่นอกการดูแลของระบบ — เปิดเฉพาะเมื่อจำเป็น และโปรดตรวจกับที่ปรึกษาด้านคุ้มครองข้อมูลส่วนบุคคลของร้าน",
  "ackFullId": "กรุณาติ๊กรับทราบคำเตือนก่อนเปิดการใส่เลขประจำตัวประชาชนเต็ม",
  "settingOwner": "เฉพาะเจ้าของร้านตั้งค่านี้ได้",
  "fullIdLabel": "ใส่เลขประจำตัวประชาชนเต็มในไฟล์ทะเบียนลูกจ้าง",
} as const;
export const REPORT_TEXT_EN = {
  "no": "Report not found, or you do not have access to this report",
  "input": "The period or file format is not valid",
  "formula": "Some text could be read as a spreadsheet formula — fix the text before exporting", // HR PRIV-2 ▸ fixed text, no employee names ◂
  "encoding": "Some characters cannot be written to the file — fix the text before exporting", // HR PRIV-2 ▸ fixed text, no employee names ◂
  "limit": "Too much data for one report — choose a branch or a shorter period",
  "total": "Total",
  "registerDuty": "Employee register under the Labour Protection Act s.112–113 (employers with 10 or more employees · kept in Thai) — quoted from a consolidated text, please check with a labour adviser",
  "registerUnder10": "This shop has fewer than 10 active employees — s.112 asks employers with 10 or more employees to keep a register (quoted from a consolidated text, please check with a labour adviser)",
  "registerRetention": "s.115: keep the register for at least 2 years after each employee's employment ends — SHARK does not delete records of former employees",
  "registerMissing": "Some register fields are still missing — add them on the employee page",
  "registerInput": "Nationality can be up to 60 characters and other benefits up to 500 characters (no special characters)",
  "s114Note": "Wage payment record (s.114): working days and hours, wage rate and amount, overtime pay and holiday work pay — holiday overtime is shown in the OT report · please check with an adviser that this covers what you must keep",
  "taxNote": "Figures from approved payroll runs (never recalculated) — PND.1 / SPS.1-10 files are in the filings work",
  "timeNote": "Measured overtime = time past the shift by the clock records, not approved OT",
  "title.time": "Time report",
  "title.leave": "Leave report",
  "title.ot": "OT report",
  "title.payroll-month": "Payroll summary by period",
  "title.payroll-year": "Payroll summary by year",
  "title.tax-month": "Tax and social security by month",
  "title.tax-year": "Tax and social security for the year",
  "title.wages": "Wage payment record",
  "title.register": "Employee register",
  "fullIdWarning": "A register file with full national ID numbers discloses more personal data, and a downloaded file is outside the system's care — turn this on only when needed, and please check with the shop's data-protection adviser",
  "ackFullId": "Please tick to acknowledge the warning before including full national ID numbers",
  "settingOwner": "Only the shop owner can change this setting",
  "fullIdLabel": "Include full national ID numbers in the employee register export",
} as const;

// HR H3.4-YTD ▸ หมายเหตุคงที่ของรายงานภาษีทั้งปีเมื่อรวมยอดยกมาต้นปี (แยกจาก REPORT_TEXT — ชุดข้อความเดิมคงทุกไบต์) ◂
export const REPORT_YTD_NOTE = {
  th: "รวมยอดยกมาต้นปี (เงินได้ ภาษี และเงินสมทบที่จ่ายก่อนใช้ระบบ) ตามที่บันทึกในหน้าเงินเดือน",
  en: "Includes the opening year-to-date figures (income, tax and contributions paid before using the system) recorded on the payroll page",
} as const;
// ◂ HR H3.4-YTD
export type ReportText = { readonly [K in keyof typeof REPORT_TEXT]: string };
/** ข้อความตามภาษา (en = อังกฤษ · อื่น ๆ = ไทย) */
export function reportTextFor(locale: string | null | undefined): ReportText {
  return locale === "en" ? REPORT_TEXT_EN : REPORT_TEXT;
}

// ═════════════ ตัวช่วยค่าเซลล์ ═════════════
const isInt = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);
const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});

/** เลขประจำตัว → •••+เลข 4 ตัวท้าย (นับเฉพาะตัวเลข · น้อยกว่า 4 ตัว ⇒ "") */
export function maskCitizenId(raw: unknown): string {
  const d = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
  return d.length >= 4 ? `•••${d.slice(-4)}` : "";
}
/** สตางค์ → บาท 2 ตำแหน่ง ไม่มีตัวคั่น (ติดลบได้) */
export function bahtText(satang: number): string {
  const n = isInt(satang) ? satang : 0;
  const a = Math.abs(n);
  return `${n < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}
/** หนึ่งในสิบ → ทศนิยม 1 ตำแหน่ง (วันลา) */
export function tenthsText(tenths: number): string {
  const n = isInt(tenths) ? tenths : 0;
  const a = Math.abs(n);
  return `${n < 0 ? "-" : ""}${Math.floor(a / 10)}.${a % 10}`;
}
/** ที่อยู่ปัจจุบัน: ตัดช่องว่างหัวท้ายของแต่ละส่วน · ข้ามส่วนว่าง · ต่อด้วยช่องว่างหนึ่งตัว */
export function addressOf(parts: readonly unknown[]): string {
  return (Array.isArray(parts) ? parts : [])
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p !== "")
    .join(" ");
}
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const validDay = (s: unknown): s is string => {
  const m = typeof s === "string" ? DAY_RE.exec(s) : null;
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dim = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]!;
  return d <= dim;
};
/** อายุเต็มปี ณ วันที่ (นับวันเกิดเมื่อถึงเดือน-วัน · 29 ก.พ. ปีปกติ ⇒ นับ 1 มี.ค.) · ไม่มี/เกิดหลังวันนั้น ⇒ null */
export function ageOn(birth: string | null | undefined, on: string): number | null {
  if (!validDay(birth) || !validDay(on) || birth > on) return null;
  const years = Number(on.slice(0, 4)) - Number(birth.slice(0, 4));
  return on.slice(5) < birth.slice(5) ? years - 1 : years;
}
/** นาทีขาดงาน 1 แถว = ⌊ช่วงกะ × (1 − ส่วนที่ลา)⌋ · ช่วงกะ = จบ − เริ่ม (+1440 ข้ามเที่ยงคืน) · ไม่หักพัก (Q8) */
export function absentMinOf(d: { startMin?: unknown; endMin?: unknown; crossesMidnight?: unknown; leaveFraction?: unknown }): number {
  const s = d?.startMin;
  const e = d?.endMin;
  if (!isInt(s) || !isInt(e)) return 0;
  const span = d.crossesMidnight === true || e < s ? e - s + 1440 : e - s;
  if (span <= 0) return 0;
  const lf = Math.round(Number(d.leaveFraction ?? 0) * 10);
  const t = Number.isFinite(lf) ? Math.min(10, Math.max(0, lf)) : 0;
  return Math.floor((span * (10 - t)) / 10);
}
/** ส่วนที่ลาของแถวเป็นหนึ่งในสิบ (Decimal(2,1) · string · number) */
export function leaveTenthsOf(v: unknown): number {
  const n = Math.round(Number(v ?? 0) * 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
/**
 * เงินได้ 40(1) ของรายการเงินเดือน — กติกาเดียวกับยอดสะสมก่อนงวดของ H3.4: รุ่น ≥ 2 = snapshot.whtIncomeSatang ·
 * รุ่น 1 = snapshot.baseSalarySatang + addSatang · ไม่ใช่จำนวนเต็ม/ติดลบ ⇒ 0 (ไม่คิดใหม่)
 */
export function whtIncomeOf(i: { engineVersion: unknown; addSatang: unknown; snapshot: unknown }): number {
  const snap = obj(i?.snapshot);
  if (Number(i?.engineVersion) >= 2) {
    const w = snap.whtIncomeSatang;
    return isInt(w) && w >= 0 ? w : 0;
  }
  const base = snap.baseSalarySatang;
  const add = isInt(i?.addSatang) ? i.addSatang : 0;
  if (!isInt(base) || base < 0) return 0;
  return Math.max(0, base + add);
}
export type WageParts = { payType: string; rateSatang: number | null; wageSatang: number; otSatang: number; holidayWorkSatang: number };
/**
 * ส่วนของเอกสารการจ่ายค่าจ้าง (ม.114) จากรายการที่เก็บไว้ — รุ่น 1: อัตรา = ค่าจ้าง = baseSalarySatang · OT = Σ รายการเพิ่มชนิด OT ·
 * รุ่น 2: อัตรา = Σ บรรทัด BASE (ไม่มี ⇒ null) · ค่าจ้าง = Σ บรรทัดใน WAGE_CODES_V2 · OT = Σ OT · ทำงานวันหยุด = Σ HOLIDAY_WORK
 */
export function wagePartsOf(i: { engineVersion: unknown; snapshot: unknown }): WageParts {
  const snap = obj(i?.snapshot);
  if (Number(i?.engineVersion) >= 2) {
    const lines = (Array.isArray(snap.lines) ? snap.lines : []).map(obj).filter((l) => typeof l.code === "string" && isInt(l.amountSatang));
    const sum = (codes: readonly string[]) => lines.filter((l) => codes.includes(l.code as string)).reduce((a, l) => a + (l.amountSatang as number), 0);
    const hasBase = lines.some((l) => l.code === "BASE");
    return {
      payType: typeof snap.payType === "string" && snap.payType in REPORT_LABELS.payType ? snap.payType : "MONTHLY",
      rateSatang: hasBase ? sum(["BASE"]) : null,
      wageSatang: sum(WAGE_CODES_V2),
      otSatang: sum(["OT"]),
      holidayWorkSatang: sum(["HOLIDAY_WORK"]),
    };
  }
  const base = snap.baseSalarySatang;
  const adj = (Array.isArray(snap.adjustments) ? snap.adjustments : []).map(obj);
  return {
    payType: "MONTHLY",
    rateSatang: isInt(base) ? base : null,
    wageSatang: isInt(base) ? base : 0,
    otSatang: adj.filter((a) => a.kind === "OT" && isInt(a.amountSatang)).reduce((s, a) => s + (a.amountSatang as number), 0),
    holidayWorkSatang: 0,
  };
}

// ═════════════ คอลัมน์ / ช่วงเวลา ═════════════
/** คีย์คอลัมน์ที่ผู้ดูได้รับ: ทั้งแคตตาล็อก ยกเว้นชั้น $ เมื่อไม่มีสิทธิ์เงิน · เลขประจำตัว (I) อยู่เสมอ — fullId เปลี่ยนแค่ค่า ไม่เปลี่ยนรายการคีย์ */
export function columnsFor(report: ReportId, access: { money: boolean; fullId: boolean }, surface: "page" | "export"): string[] {
  void surface;
  const def = REPORT_CATALOG[report];
  if (!def) return [];
  return def.columns.filter((c) => access?.money === true || c.cls !== "$").map((c) => c.key);
}
/** ช่วงเวลาถูกรูปตามชนิดรายงาน (เดือน YYYY-MM · ปี YYYY · วัน YYYY-MM-DD ที่มีจริง) ปี 2000–2600 */
export function periodOk(report: unknown, period: unknown): boolean {
  if (!isReportId(report) || typeof period !== "string") return false;
  const kind = REPORT_CATALOG[report].period;
  const y = Number(period.slice(0, 4));
  if (!/^\d{4}/.test(period) || y < 2000 || y > 2600) return false;
  if (kind === "year") return /^\d{4}$/.test(period);
  if (kind === "month") return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
  return validDay(period);
}

// ═════════════ ตาราง / ไบต์ ═════════════
export type ReportRowValues = Record<string, string>;
/** ตารางไฟล์: หัว (ภาษาผู้ดู · ทะเบียน = ไทยเสมอ ม.112) + แถว + แถวรวม ("รวม"/"Total") เมื่อรายงานมีรวมและส่ง totals มา */
export function reportTable(t: { report: ReportId; keys: readonly string[]; rows: readonly ReportRowValues[]; totals: Record<string, string> | null; locale?: string | null }): string[][] {
  const def = REPORT_CATALOG[t.report];
  const byKey = new Map(def.columns.map((c) => [c.key, c] as const));
  const en = !def.thaiOnly && t.locale === "en";
  const header = t.keys.map((k) => (en ? (byKey.get(k)?.en ?? k) : (byKey.get(k)?.th ?? k)));
  const body = t.rows.map((r) => t.keys.map((k) => (typeof r[k] === "string" ? r[k]! : "")));
  const out = [header, ...body];
  if (def.totals && t.totals) out.push(t.keys.map((k, i) => (i === 0 ? reportTextFor(t.locale).total : typeof t.totals![k] === "string" ? t.totals![k]! : "")));
  return out;
}
/** ตาราง → ไบต์ผ่านตัวเขียนของ H3.5 (CSV UTF-8 BOM · XLSX ชีต "Report") — ไม่แก้ตารางที่ส่งมา */
export function reportBytes(table: string[][], format: "CSV" | "XLSX"): Uint8Array {
  const copy = table.map((r) => [...r]);
  return format === "XLSX" ? xlsxBytes(copy, "Report") : csvBytes(copy, "UTF8_BOM");
}
const EXEMPT = /^(-?\d+(\.\d+)?|\d{4}-\d{2}-\d{2})$/;
/**
 * ตรวจเซลล์ของแถวข้อมูลก่อนส่งออก (ไม่แก้ให้เงียบ ๆ): เซลล์ตัวเลข/วันที่ไม่ตรวจ · เขียนลงไฟล์ไม่ได้ ⇒ ENCODING (ตรวจก่อน) ·
 * อาจถูกอ่านเป็นสูตร ⇒ FORMULA · names = ชื่อของแถวที่มีปัญหา ตามลำดับแถว (ไม่ซ้ำ) · null = ส่งออกได้
 */
export function exportProblem(bodyRows: readonly (readonly string[])[], names: readonly string[]): { code: "ENCODING" | "FORMULA"; names: string[] } | null {
  const pick = (bad: (s: string) => boolean) => {
    const out: string[] = [];
    bodyRows.forEach((row, i) => {
      if (row.some((c) => typeof c === "string" && !EXEMPT.test(c) && bad(c))) {
        const n = String(names[i] ?? "");
        if (!out.includes(n)) out.push(n);
      }
    });
    return out;
  };
  const enc = pick((c) => !cellWritable(c, "UTF8_BOM") || !cellWritable(c, "XLSX"));
  if (enc.length) return { code: "ENCODING", names: enc };
  const f = pick((c) => formulaLike(c));
  return f.length ? { code: "FORMULA", names: f } : null;
}
// ◂ HR H3.9
