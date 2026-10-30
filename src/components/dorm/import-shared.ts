// SVC D.4 ▸ ป้ายไทยของจอ หอ 12 "นำเข้าข้อมูลหอ" — pure ล้วน (ไม่มี directive · ไม่ import โมดูลฝั่ง server)
//   ใช้ร่วม: ImportScreen.tsx (client) · หน้า/route (server) — ภาพ ledger/design-dorm/12-import-excel.png

export type ImportStepKey = "UPLOAD" | "MAP" | "CHECK" | "CREATE";
export const IMPORT_STEPS: { key: ImportStepKey; labelTh: string }[] = [
  { key: "UPLOAD", labelTh: "อัปโหลด" },
  { key: "MAP", labelTh: "จับคู่คอลัมน์" },
  { key: "CHECK", labelTh: "ตรวจ" },
  { key: "CREATE", labelTh: "นำเข้า" },
];

/** ป้ายของช่องในระบบ (ตัวเลือกในตารางจับคู่ — ตามภาพ 12) */
export const IMPORT_FIELD_LABEL_TH: Record<string, string> = {
  room: "เลขห้อง (ชั้นคิดจากเลขแรก)",
  building: "อาคาร",
  floor: "ชั้น",
  roomType: "ประเภทห้อง",
  tenantName: "ชื่อผู้เช่า",
  phone: "เบอร์โทร (หาคนซ้ำ)",
  idCard: "เลขบัตรประชาชน (หาคนซ้ำ)",
  startDate: "วันเริ่มสัญญา · พ.ศ. วัน/เดือน/ปี",
  months: "ระยะสัญญา (เดือน)",
  rent: "ค่าห้อง/เดือน",
  deposit: "เงินประกันที่ถือไว้",
  advanceRent: "ค่าเช่าล่วงหน้า",
  elecReading: "มิเตอร์เริ่ม ไฟ",
  waterReading: "มิเตอร์เริ่ม น้ำ",
  arrears: "ยอดค้างยกมา",
  note: "บันทึกของห้อง",
  IGNORE: "ไม่นำเข้า (ผูกด้วยรหัสผูกห้อง)",
};
export const IMPORT_FIELD_ORDER: string[] = [
  "room",
  "tenantName",
  "phone",
  "idCard",
  "startDate",
  "months",
  "rent",
  "deposit",
  "advanceRent",
  "elecReading",
  "waterReading",
  "arrears",
  "note",
  "building",
  "floor",
  "roomType",
  "IGNORE",
];

export const IMPORT_SEVERITY_TH: Record<string, string> = { MUST_FIX: "ต้องแก้", WARN: "เตือน", INFO: "ข้อมูล" };

/** ป้ายสั้นของรหัสปัญหา (หัวรายการในการ์ดผลตรวจ) */
export const IMPORT_ISSUE_TH: Record<string, string> = {
  ROOM_INVALID: "เลขห้องไม่ถูกต้อง",
  ROOM_DUP_IN_FILE: "เลขห้องซ้ำในไฟล์",
  ROOM_INACTIVE: "ห้องถูกปิดใช้งาน",
  ROOM_NOT_MONTHLY: "ห้องรายคืน",
  ROOM_OCCUPIED: "ห้องมีผู้เช่าคนอื่น",
  BUILDING_REQUIRED: "ต้องระบุอาคาร",
  FLOOR_INVALID: "ชั้นไม่ถูกต้อง",
  CELL_TOO_LONG: "ข้อความยาวเกิน",
  TEXT_TOO_LONG: "ข้อความยาวเกิน",
  TEXT_NEUTRALIZED: "ข้อความขึ้นต้นด้วยเครื่องหมายสูตร",
  PHONE_INVALID: "เบอร์โทรไม่ถูกต้อง",
  PHONE_DUP_IN_FILE: "เบอร์ซ้ำในไฟล์",
  IDCARD_INVALID: "เลขบัตรไม่ถูกต้อง",
  TENANT_CONTACT_REQUIRED: "ไม่มีเบอร์/เลขบัตร",
  TENANT_MATCH_CONFIRM: "ผู้เช่าชนกับผู้ติดต่อเดิม",
  DATE_INVALID: "วันเข้าอยู่ไม่ถูกต้อง",
  START_IN_FUTURE: "วันเข้าอยู่ยังไม่ถึง",
  MONTHS_INVALID: "ระยะสัญญาไม่ถูกต้อง",
  LEASE_ENDED_IN_FILE: "สัญญาในไฟล์ครบกำหนดแล้ว",
  MONEY_INVALID: "ยอดเงินอ่านไม่ได้",
  RENT_REQUIRED: "ไม่มีค่าเช่า",
  DEPOSIT_LEGAL: "เงินประกันตามกฎหมาย",
  CONTRACT_LEGAL: "ข้อความสัญญา",
  METER_INVALID: "เลขมิเตอร์ไม่ถูกต้อง",
  METER_OUTLIER: "เลขมิเตอร์สูงผิดปกติ",
  METER_CONFLICT: "เลขมิเตอร์ไม่ตรงกับในระบบ",
  VACANT_WITH_RENT: "ไม่มีชื่อแต่มีค่าเช่า",
  ROOM_ONLY: "ห้องว่าง",
  ROOM_TYPE_ASSUMED: "ใช้ประเภทห้องที่พบบ่อย",
  ARREARS_NOT_IMPORTED: "ยอดค้างยกมา",
  SKIP_EXISTS: "มีอยู่แล้ว",
};

/** สตางค์ ⇒ "฿4,500" (ทศนิยมเฉพาะเมื่อมีสตางค์) */
export function importBaht(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  const st = a % 100;
  return `${satang < 0 ? "-" : ""}฿${Math.floor(a / 100).toLocaleString("en-US")}${st ? `.${String(st).padStart(2, "0")}` : ""}`;
}
/** ข้อความหน้าต่างย้อนกลับ (อ่านจากค่าตั้ง rooms.import.undoDays — RULING-3) */
export function importUndoWindowTh(undoDays: number): string {
  return undoDays > 0 ? `ภายใน ${undoDays} วัน` : "ภายในวันนี้";
}
