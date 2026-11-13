// HR H3.5 ▸ ไฟล์โอนเงินเดือน — ข้อความคงที่ + รหัสธนาคาร (pure · ไม่มี db/เวลา/สุ่ม) — brief hr-brief-H3.5 R2 R4 §4
//   BANK_TEXT = scripts/fixtures/hr-h3.5-texts.json (th + reasons + warnings) ไบต์ตรง · ข้อความไม่มีจำนวนเงิน/เลขบัญชี/id
//   resolveBankCode: เฉพาะ 4 รหัสที่มีหลักฐาน [V] (002 กรุงเทพ · 004 กสิกรไทย · 006 กรุงไทย · 014 ไทยพาณิชย์) — ชื่ออื่น = null (Q5) ◂

export const BANK_TEXT = {
  no: "ไม่พบรอบจ่ายนี้ หรือคุณไม่มีสิทธิ์จัดการไฟล์โอนเงินเดือน",
  status: "สร้างไฟล์โอนเงินได้เฉพาะรอบที่อนุมัติแล้วหรือจ่ายแล้ว",
  mismatch: "ยอดสุทธิของรอบไม่ตรงกับรายการพนักงาน — สร้างไฟล์ไม่ได้ ตรวจรอบจ่ายก่อน",
  negative: "มีพนักงานที่ยอดสุทธิติดลบ — สร้างไฟล์ไม่ได้",
  empty: "ไม่มีพนักงานที่ส่งในไฟล์นี้ได้ — ดูรายการ \"ไม่อยู่ในไฟล์\"",
  formatOff: "รูปแบบไฟล์นี้ยังไม่เปิดใช้ — เจ้าของร้านเปิดได้ที่ ตั้งค่า HR › ไฟล์โอนเงินเดือน",
  profile: "ข้อมูลบัญชีต้นทางของร้านยังไม่ครบหรือไม่ตรงกับรูปแบบนี้ — เจ้าของร้านตั้งค่าได้ที่ ตั้งค่า HR › ไฟล์โอนเงินเดือน",
  options: "ตัวเลือกไฟล์ไม่ถูกต้อง — กรุณาเปิดหน้านี้ใหม่แล้วลองอีกครั้ง",
  encoding: "ชื่อของพนักงานต่อไปนี้มีอักขระที่ไฟล์นี้ใช้ไม่ได้: {names} — แก้ชื่อบัญชีในทะเบียนพนักงาน หรือเลือกการเข้ารหัสแบบอื่น",
  formula: "ข้อมูลของพนักงานต่อไปนี้ขึ้นต้นด้วย = + - @ ซึ่งโปรแกรมตารางอาจอ่านเป็นสูตร: {names} — แก้ข้อมูลในทะเบียนพนักงานก่อน",
  expired: "ไฟล์นี้หมดอายุแล้ว — สร้างไฟล์ใหม่จากรอบจ่าย",
  changed: "ข้อมูลรอบจ่าย บัญชีพนักงาน หรือบัญชีต้นทางเปลี่ยนไปหลังสร้างไฟล์ — สร้างไฟล์ใหม่",
  profileOwner: "เฉพาะเจ้าของร้านเท่านั้นที่ตั้งค่าบัญชีต้นทางและรูปแบบไฟล์โอนเงินเดือนได้",
  profileInput: "ข้อมูลไม่ถูกต้อง: เลขบัญชี 10 หลัก · รหัสสาขา 4 หลัก · ชื่อบริษัทภาษาอังกฤษไม่เกิน 50 ตัวอักษร · รหัสบริษัท KTB ไม่เกิน 16 ตัวอักษร",
  ackUntested: "ต้องยืนยันว่ารับทราบว่ารูปแบบนี้ยังไม่ทดสอบกับธนาคารจริง ก่อนเปิดใช้",
  presetName: "ชื่อชุดคอลัมน์ต้องมี 1–60 ตัวอักษร และไม่ซ้ำกับชุดอื่นในระบบนี้",
  presetColumns: "เลือกคอลัมน์ 1–30 คอลัมน์จากรายการ (หัวคอลัมน์ไม่เกิน 60 ตัวอักษร · ค่าคงที่ไม่เกิน 40 ตัวอักษร)",
  untested: "ยังไม่ทดสอบกับธนาคารจริง",
  untestedLong: "รูปแบบนี้สร้างจากข้อมูลสาธารณะ ยังไม่ทดสอบกับธนาคารจริง — ใช้การตรวจไฟล์หรือนำเข้าทดลองในระบบของธนาคารก่อนอนุมัติโอนทุกครั้ง",
  legal: "ตรวจกับนักบัญชีของร้าน: การจ่ายค่าจ้างเข้าบัญชีธนาคารอาจต้องมีความยินยอมเป็นหนังสือของลูกจ้าง (พ.ร.บ.คุ้มครองแรงงาน ม.55 · ม.77)",
  // HR H3.5 fix r1 ▸ F1/F2: บรรทัดผิดความยาว (ด่านสุดท้าย) · ยอดเกินช่อง ◂
  layout: "ไฟล์ที่สร้างมีความยาวบรรทัดไม่ตรงรูปแบบของธนาคาร — ระบบไม่บันทึกไฟล์นี้ กรุณาแจ้งผู้ดูแลระบบ",
  amount: "ยอดเงินเกินช่องของไฟล์นี้: {names} — แยกจ่ายเป็นหลายไฟล์ หรือใช้ไฟล์ CSV/Excel",
  amountTotal: "ยอดรวมของไฟล์",
  reasons: {
    NET_ZERO: "ยอดสุทธิ 0 บาท",
    NO_ACCOUNT: "ไม่มีเลขบัญชีในทะเบียนพนักงาน",
    ACCOUNT_FORMAT: "เลขบัญชีไม่ตรงรูปแบบของไฟล์นี้",
    BANK_UNKNOWN: "ระบบไม่รู้จักชื่อธนาคารในทะเบียนพนักงาน",
    NOT_THIS_BANK: "บัญชีไม่ใช่ธนาคารที่ไฟล์นี้รับ",
    SAME_BANK: "บัญชีกรุงไทยต้องใช้ไฟล์แบบ Direct",
    NO_EMPLOYEE: "ไม่พบข้อมูลพนักงาน",
  },
  warnings: {
    BANK_UNKNOWN: "ระบบไม่รู้จักชื่อธนาคาร — ช่องรหัสธนาคารว่าง",
    NAME_FROM_PROFILE: "ไม่มีชื่อบัญชีในทะเบียน — ใช้ชื่อพนักงานแทน",
    NAME_CUT: "ชื่อยาวเกินช่องของไฟล์ — ตัดให้พอดีช่อง",
    OVER_LIMIT: "ยอดเกินเพดานต่อรายการที่ธนาคารประกาศ",
    DUP_ACCOUNT: "เลขบัญชีซ้ำกับพนักงานคนอื่นในไฟล์นี้",
    EFFECTIVE_PAST: "วันที่โอนอยู่ก่อนวันที่สร้างไฟล์",
  },
} as const;

/** HR H3.5 fix r1 ▸ F7: ชุดข้อความภาษาอังกฤษ (รูปร่างเดียวกับ BANK_TEXT · fixture hr-h3.5-texts.json "en") — ข้อความ [U] ใช้ถ้อยคำกลาง ๆ เหมือนฉบับไทย ◂ */
export const BANK_TEXT_EN: { [K in keyof typeof BANK_TEXT]: (typeof BANK_TEXT)[K] extends string ? string : { [J in keyof (typeof BANK_TEXT)[K]]: string } } = {
  no: "This pay run was not found, or you do not have the right to manage salary transfer files",
  status: "Transfer files can only be made for approved or paid runs",
  mismatch: "The run's net total does not match its employee rows — no file can be made; check the pay run first",
  negative: "An employee has a negative net amount — no file can be made",
  empty: "No employee can be put in this file — see the \"not in the file\" list",
  formatOff: "This file layout is not enabled — the shop owner can enable it in HR settings › Salary transfer file",
  profile: "The shop's source account is incomplete or does not fit this layout — the shop owner can set it in HR settings › Salary transfer file",
  options: "Invalid file options — please reload this page and try again",
  encoding: "These employees' names contain characters this file cannot carry: {names} — fix the account name in the employee register or pick another encoding",
  formula: "These employees' data start with = + - @, which a spreadsheet may read as a formula: {names} — fix the employee register first",
  expired: "This file has expired — make a new file from the pay run",
  changed: "The pay run, an employee account or the source account changed after the file was made — make a new file",
  profileOwner: "Only the shop owner can set the source account and the salary transfer layouts",
  profileInput: "Invalid data: account number 10 digits · branch code 4 digits · English company name up to 50 characters · KTB company ID up to 16 characters",
  ackUntested: "Confirm that you understand this layout is not yet tested with a real bank before enabling it",
  presetName: "The column set name needs 1–60 characters and must differ from the other sets in this system",
  presetColumns: "Choose 1–30 columns from the list (header up to 60 characters · fixed value up to 40 characters)",
  untested: "Not yet tested with a real bank",
  untestedLong: "This layout was built from public information and is not yet tested with a real bank — use the bank's file check or a trial import before approving every transfer",
  legal: "Check with the shop's accountant: paying wages into a bank account may need the employee's written consent (Labour Protection Act s.55 · s.77)",
  layout: "The generated file's line length does not match the bank layout — nothing was saved; please contact support",
  amount: "An amount does not fit this file's field: {names} — split the payment into several files or use a CSV/Excel file",
  amountTotal: "the file total",
  reasons: {
    NET_ZERO: "Net amount is 0 baht",
    NO_ACCOUNT: "No account number in the employee register",
    ACCOUNT_FORMAT: "The account number does not fit this file's format",
    BANK_UNKNOWN: "The bank name in the employee register is not recognised",
    NOT_THIS_BANK: "The account is not at a bank this file accepts",
    SAME_BANK: "Krungthai accounts need the Direct file",
    NO_EMPLOYEE: "Employee data not found",
  },
  warnings: {
    BANK_UNKNOWN: "Bank name not recognised — the bank code cell is blank",
    NAME_FROM_PROFILE: "No account name in the register — the employee name is used",
    NAME_CUT: "The name is longer than the file's field — cut to fit",
    OVER_LIMIT: "The amount is above the per-item limit the bank publishes",
    DUP_ACCOUNT: "The account number is the same as another employee's in this file",
    EFFECTIVE_PAST: "The transfer date is before the date the file was made",
  },
};
export type BankTexts = typeof BANK_TEXT_EN;
/** ชุดข้อความตามภาษาของผู้ดู (next-intl locale) — ไม่รู้จัก = ไทย */
export const bankTextFor = (locale: string | null | undefined): BankTexts => (locale === "en" ? BANK_TEXT_EN : BANK_TEXT);

export type BankCause = keyof typeof BANK_TEXT.reasons;
export type BankWarning = keyof typeof BANK_TEXT.warnings;

/** รหัสธนาคารที่มีหลักฐาน [V] เท่านั้น (research A0) */
export const BANK_CODES = ["002", "004", "006", "014"] as const;
export type BankCode = (typeof BANK_CODES)[number];

const ALIASES: Record<string, BankCode> = {
  "002": "002",
  กรุงเทพ: "002",
  bangkokbank: "002",
  bbl: "002",
  "004": "004",
  กสิกรไทย: "004",
  กสิกร: "004",
  kasikorn: "004",
  kasikornbank: "004",
  kbank: "004",
  "006": "006",
  กรุงไทย: "006",
  krungthai: "006",
  krungthaibank: "006",
  ktb: "006",
  "014": "014",
  ไทยพาณิชย์: "014",
  siamcommercial: "014",
  siamcommercialbank: "014",
  scb: "014",
};
const SUFFIXES = ["จำกัด(มหาชน)", "(มหาชน)", "จำกัด", "publiccompanylimited", "pcl"];

/** ชื่อธนาคารอิสระในทะเบียนพนักงาน → รหัส 3 หลัก หรือ null (R4) */
export function resolveBankCode(name: string | null | undefined): BankCode | null {
  if (typeof name !== "string") return null;
  let s = name.toLowerCase().replace(/\s+/g, "");
  if (s.startsWith("ธนาคาร")) s = s.slice("ธนาคาร".length);
  else if (s.startsWith("ธ.")) s = s.slice(2);
  s = s.replace(/[-.]/g, "");
  for (let again = true; again && s; ) {
    again = false;
    for (const suf of SUFFIXES) {
      if (s.length > suf.length && s.endsWith(suf)) {
        s = s.slice(0, -suf.length);
        again = true;
      }
    }
  }
  return Object.prototype.hasOwnProperty.call(ALIASES, s) ? ALIASES[s]! : null;
}
