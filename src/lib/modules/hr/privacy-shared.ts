// HF-HR-0 (1 ต.ค. 2026) — รูปข้อมูลพนักงาน/ใบลา "ที่อนุญาตให้ออกไปถึงเบราว์เซอร์" (DTO whitelist)
// 🔴 ไฟล์นี้ client component import ได้ ⇒ ห้าม import อะไรที่ไปถึง prisma (db/service/payroll) — type ล้วน + ค่าคงที่
// หลัก: server สร้าง DTO รายช่องจากรายการด้านล่างเท่านั้น (ไม่ส่งแถวดิบ) —
//   ช่องอ่อนไหวใส่เฉพาะผู้ดูเงินเดือน (OWNER / hr.payroll.read) · PIN ไม่ออกจาก server เลย (มีแค่ hasPin)
//   ช่องที่ไม่อยู่ในรายการ (pinCode · linkedUserId · partyId · tenantId · systemId · docs · createdAt/updatedAt) = ไม่ส่งเสมอ

/** ช่องทั่วไปที่ผู้เปิดหน้าโปรไฟล์ได้ทุกคนเห็น */
export const EMPLOYEE_PROFILE_FIELDS = [
  "id",
  "name",
  "nickname",
  "code",
  "phone",
  "email",
  "gender",
  "birthDate",
  "maritalStatus",
  "position",
  "department",
  "employmentType",
  "startDate",
  "endDate",
  "addressLine",
  "subdistrict",
  "district",
  "province",
  "postcode",
  "emergencyName",
  "emergencyPhone",
  "emergencyRelation",
  "note",
  "active",
  "hasPin",
  // HR H1.1 ▸ R7 — แกนสาขา + สถานะการจ้าง (ไม่อ่อนไหว) · payType ไม่อยู่ในรายการนี้ (เฉพาะผู้ดูเงินเดือน) ◂
  "unitId",
  "unitName",
  "employmentStatus",
  "probationEndAt",
  "contractEndAt",
] as const;

/** 🔒 ช่องอ่อนไหว (PDPA) — ต้องตรงกับ SENSITIVE_EMPLOYEE_FIELDS ใน service.ts (oracle qc-hf-hr-privacy เทียบให้) */
export const EMPLOYEE_SENSITIVE_FIELDS = [
  "nationalId",
  "ssoNumber",
  "houseRegAddress",
  "bankName",
  "bankAccountNo",
  "bankAccountName",
] as const;

/** HR H1.1 ▸ 🔒 ช่องเงินเดือนในโปรไฟล์ (ไม่ใช่ PDPA 6 ช่อง แต่บอกโครงสร้างค่าจ้าง) — มีคีย์เฉพาะผู้ดูเงินเดือน ◂ */
export const EMPLOYEE_PAYROLL_FIELDS = ["payType"] as const;

export type EmployeeProfileDto = {
  id: string;
  name: string;
  nickname: string | null;
  code: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birthDate: Date | null;
  maritalStatus: string | null;
  position: string | null;
  department: string | null;
  employmentType: string | null;
  startDate: Date | null;
  endDate: Date | null;
  addressLine: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postcode: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  note: string | null;
  active: boolean;
  /** PIN ลงเวลา: ตั้งแล้วหรือยัง — ตัวเลข PIN ไม่ถูกส่งออกจาก server */
  hasPin: boolean;
  // HR H1.1 ▸ R7 ◂
  unitId: string | null;
  unitName: string | null;
  employmentStatus: string | null;
  probationEndAt: Date | null;
  contractEndAt: Date | null;
  /** HR H1.1 ▸ 🔒 รูปแบบค่าจ้าง (MONTHLY/DAILY/HOURLY) — มีคีย์เฉพาะผู้ดูเงินเดือน ◂ */
  payType?: string | null;
  // 🔒 มีคีย์เหล่านี้เฉพาะเมื่อผู้ดูมีสิทธิ์ดูเงินเดือน (ไม่มีสิทธิ์ = ไม่มีคีย์เลย ไม่ใช่ค่าว่าง)
  nationalId?: string | null;
  ssoNumber?: string | null;
  houseRegAddress?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
};

/** HR H1.1 ▸ id ของฟอร์มโปรไฟล์ — ช่อง "สาขาประจำ" อยู่บนหน้า (server) แล้วผูกเข้าฟอร์มด้วย form={…} จึงต้องใช้ id เดียวกัน ◂ */
export const profileFormId = (employeeId: string) => `hr-profile-form-${employeeId}`;

/** HR H1.1 ▸ แถวยืมตัวไปสาขาอื่น (ไม่อ่อนไหว) — ส่งคู่กับโปรไฟล์ (ไม่อยู่ใน EmployeeProfileDto) ◂ */
export type EmployeeBorrowingDto = { id: string; unitId: string; unitName: string | null; fromDate: Date; toDate: Date | null };

/** เอกสารแนบ — โหลดเฉพาะผู้ดูเงินเดือน (ผู้อื่นได้รายการว่าง) */
export type EmployeeDocDto = { id: string; kind: string; title: string; url: string; note: string | null };

/** รายการใบลาสำหรับหน้าจอ — `reason` มีเฉพาะผู้มีสิทธิ์ hr.leave.read (เหตุผลลาป่วย = ข้อมูลสุขภาพ) */
export type LeaveItemDto = {
  id: string;
  employeeName: string;
  type: string;
  fromDate: Date;
  toDate: Date;
  status: string;
  reason?: string | null;
  filedBy?: string; // HR H0.7 ▸ R9: "ยื่นโดย <ชื่อ>" เฉพาะผู้มี hr.leave.read (ผู้จัดการ/HR) และเฉพาะใบที่มีคนยื่นแทน ◂
};
