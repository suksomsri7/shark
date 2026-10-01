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
  // 🔒 มีคีย์เหล่านี้เฉพาะเมื่อผู้ดูมีสิทธิ์ดูเงินเดือน (ไม่มีสิทธิ์ = ไม่มีคีย์เลย ไม่ใช่ค่าว่าง)
  nationalId?: string | null;
  ssoNumber?: string | null;
  houseRegAddress?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
};

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
};
