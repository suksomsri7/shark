// hr-qc-env.mts — ตัวโหลด env + ค่าคงที่ (สัญญาชุดข้อมูล) ของชุด QC "HR V2" (ใบ H0.4 · HR-V2-MASTER-PLAN §4)
//
// ใช้คู่กับ `scripts/seed-hr-qc.mts` (ผู้สร้าง) · ข้อสอบ `scripts/qc-hr-*.mts` ของใบหลัง · `scripts/visual-hr.mts`
// แบบอย่าง: `member-qc-env.mts` (MQC) · `crm-qc-env.mts` (CQC) · `pos-qc-env.mts` (PQC บน session/pos) — ต่างกันโดยตั้งใจ:
//   1) ร้าน QC ของ HR **แยก** จากร้าน QC สมาชิก/CRM (`siam-dive-member-qc`) และของ POS (`pos-qc-*`) — slug `qc-hr-v2`
//      seed ลบ/สร้างเฉพาะร้านนี้ (บทเรียน reference_shark_qc_member_seed_wipes_crm)
//   2) **ไม่มีวันที่ตายตัว** (X7): ทุกวันที่คิดจาก "วันนี้ตามเวลาไทย" ตอนรัน (`hqcDates()`) — HQC เก็บแค่ระยะห่าง (offset)
//
// 🔴 ไฟล์นี้ไม่ import prisma และไม่ import โมดูลที่ถึง DB — ผู้เรียกส่ง PrismaClient เข้ามาเอง
//    (`visual-hr.mts --dry` import ไฟล์นี้ได้โดยไม่มี env/DB) · import ได้แค่ `@/lib/ui/date` (ฟังก์ชันล้วน)
// 🔴 ฐานข้อมูล: QC4 เท่านั้น (`scripts/qc4.sh` · host ep-frosty-lab) — `loadHrQcEnv()` ปฏิเสธ host อื่นทุกตัว (exit 4)
// 🔴 เงิน = สตางค์ (Int) ทุกตัวในไฟล์นี้ · PIN ในไฟล์นี้เป็นค่าทดสอบของร้าน QC เท่านั้น (ห้ามพิมพ์ออกจอ)

import { thaiDateKey } from "@/lib/ui/date";

// ═══════════════════ 1. env + ด่านกันฐานผิด ═══════════════════

/** host ของ QC4 (`wo-pos-qc4`) — ฐานเดียวที่ RUN HR เขียนได้ (hr-brief-COMMON §A.4) */
import { hrQcHostMark } from "./hr-qc-hosts.mjs"; // 11 พ.ย.: ฐาน QC ต่อเลนใน allowlist (qc-hr.sh) · ค่าเริ่ม = QC4
export const HR_QC_HOST_MARK = hrQcHostMark();

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^.*@/, "").split("/")[0] ?? "(อ่าน host ไม่ได้)";
  }
}

/**
 * โหลด env ผ่าน `acc-v2-env.loadQcEnv()` (ด่าน prod + APP_ENV ตัวเดียวกับทุก seed) แล้วบังคับ QC4 —
 * เรียกบรรทัดแรกของทุกสคริปต์ HR ที่แตะ DB · พิมพ์แค่ host (ไม่พิมพ์ URL/รหัสผ่าน)
 * env ที่ export มาก่อน (จาก `scripts/qc4.sh`) ชนะไฟล์ `.env.qc` เสมอ (พฤติกรรมของ process.loadEnvFile)
 */
export async function loadHrQcEnv(label: string): Promise<{ host: string }> {
  const acc = (await import("./acc-v2-env.mjs")) as { loadQcEnv: () => { host: string } };
  const { host } = acc.loadQcEnv();
  for (const [name, url] of [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]] as const) {
    if ((name === "DATABASE_URL" || url) && !url.includes(HR_QC_HOST_MARK)) {
      console.error(
        `🔴 หยุด! ${label}: ${name} host ${safeHost(url) || "(ว่าง)"} ไม่ใช่ QC4 (${HR_QC_HOST_MARK}) — ไม่ได้เขียนอะไร\n` +
          `   รัน: bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/<file>.mts`,
      );
      process.exit(4);
    }
  }
  console.log(`[env] ${label} · DB ${host} (QC4)`);
  return { host };
}

// ═══════════════════ 2. ชื่อตารางจริงที่ HR/payroll ใช้วันนี้ ═══════════════════
// ตรวจกับ prisma/schema/hr.prisma + payroll.prisma (+ ตารางร่วมที่ HR เขียนถึง) ณ session/hr d43bdcb8 (8 ต.ค. 2569)
// key = delegate ของ Prisma (camelCase) · `tenantId` = ตารางมีคอลัมน์ tenantId (seed ลบด้วยคอลัมน์นี้ได้)
// 🔴 ตารางของใบหลัง **ยังไม่มีจริง** — ห้ามเติมจนกว่า migration ลง (HR H1.2 ▸ ตารางเวลา/การลา 8 ตัวลงแล้ว ◂ · HR H1.3 ▸ เงิน/กฎหมาย 4 ตัวลงแล้ว ◂)
//    (HR H1.1 ▸ HrEmployee.unitId/employmentStatus · HrEmployeeUnit · HrSalaryProfile.payType ลงแล้ว — migration 20261204000000_hr_org_axis ◂)
export const HR_TABLES = {
  // ── prisma/schema/hr.prisma ──
  hrEmployee: { model: "HrEmployee", file: "hr.prisma", tenantId: true, role: "ทะเบียนพนักงาน (PIN · linkedUserId · ช่องอ่อนไหว PDPA)" },
  hrEmployeeDoc: { model: "HrEmployeeDoc", file: "hr.prisma", tenantId: true, role: "เอกสารแนบพนักงาน" },
  hrAttendance: { model: "HrAttendance", file: "hr.prisma", tenantId: true, role: "ลงเวลาเข้า/ออก + คำตัดสินสาย (snapshot)" },
  hrLeave: { model: "HrLeave", file: "hr.prisma", tenantId: true, role: "ใบลา (PENDING/APPROVED/REJECTED/CANCELLED)" },
  hrWorkSchedule: { model: "HrWorkSchedule", file: "hr.prisma", tenantId: true, role: "ตารางงานรายวันในสัปดาห์" },
  hrEmployeeUnit: { model: "HrEmployeeUnit", file: "hr.prisma", tenantId: true, role: "ยืมตัวไปช่วยสาขาอื่น (HR H1.1)" },
  // HR H1.2 ▸ เวลาและการลา (migration 20261205000000_hr_time_leave_model) ◂
  hrShift: { model: "HrShift", file: "hr.prisma", tenantId: true, role: "กะของร้าน (ทั้งร้าน/รายสาขา · ข้ามเที่ยงคืนได้) (HR H1.2)" },
  hrRosterEntry: { model: "HrRosterEntry", file: "hr.prisma", tenantId: true, role: "ตารางงานรายวัน (snapshot เวลากะ) (HR H1.2)" },
  hrShiftSwapRequest: { model: "HrShiftSwapRequest", file: "hr.prisma", tenantId: true, role: "คำขอแลก/ยกกะ (HR H1.2)" },
  hrTimeCorrection: { model: "HrTimeCorrection", file: "hr.prisma", tenantId: true, role: "คำขอแก้เวลา (HR H1.2)" },
  hrOtRequest: { model: "HrOtRequest", file: "hr.prisma", tenantId: true, role: "คำขอ OT (HR H1.2)" },
  hrLeavePolicy: { model: "HrLeavePolicy", file: "hr.prisma", tenantId: true, role: "ประเภทการลาของร้าน (category = HrLeaveType) (HR H1.2)" },
  hrLeaveBalanceTxn: { model: "HrLeaveBalanceTxn", file: "hr.prisma", tenantId: true, role: "สมุดวันลา (ledger · sourceKey กันซ้ำ) (HR H1.2)" },
  hrHoliday: { model: "HrHoliday", file: "hr.prisma", tenantId: true, role: "วันหยุด (ทั้งร้าน/รายสาขา) (HR H1.2)" },
  // HR H2.5 ▸ ผลตัดสินรายวัน + การเตือน (migration 20261230000000_hr_judgement) ◂
  hrAttendanceDay: { model: "HrAttendanceDay", file: "hr.prisma", tenantId: true, role: "ผลตัดสินการลงเวลารายวัน (snapshot ของตัวปิดวัน) (HR H2.5)" },
  hrAttendanceAlert: { model: "HrAttendanceAlert", file: "hr.prisma", tenantId: true, role: "การเตือนยังไม่เข้างาน/ไม่มา (HR H2.5)" },
  // ── prisma/schema/payroll.prisma ──
  hrSalaryProfile: { model: "HrSalaryProfile", file: "payroll.prisma", tenantId: true, role: "โปรไฟล์เงินเดือน (รายเดือนเท่านั้นวันนี้)" },
  hrPayAdjustment: { model: "HrPayAdjustment", file: "payroll.prisma", tenantId: true, role: "รายการเพิ่ม/หัก (OT · BONUS · DEDUCTION · COMMISSION …)" },
  hrPayrollRun: { model: "HrPayrollRun", file: "payroll.prisma", tenantId: true, role: "รอบจ่าย (DRAFT/APPROVED/PAID/REVERSED · journalEntryId)" },
  hrPayrollItem: { model: "HrPayrollItem", file: "payroll.prisma", tenantId: true, role: "แถวพนักงานในรอบจ่าย" },
  // HR H1.3 ▸ เงินและกฎหมาย (migration 20261206000000_hr_money_law_model) — seed ไม่เขียน 4 ตารางนี้ ◂
  hrWorkEntry: { model: "HrWorkEntry", file: "payroll.prisma", tenantId: true, role: "นาทีทำงานต่อวันต่อชนิด (H3.1 เขียน · ว่างใน H1.3) (HR H1.3)" },
  hrWorkDay: { model: "HrWorkDay", file: "payroll.prisma", tenantId: true, role: "หัววันทำงาน 1 แถวต่อพนักงานต่อวัน (snapshot ต่องวด) (HR H3.1)" },
  hrAttendanceDeduction: { model: "HrAttendanceDeduction", file: "payroll.prisma", tenantId: true, role: "หัวรายการหักสาย/ขาดงาน 1 แถวต่อ HrPayAdjustment (HR H3.2)" },
  // HR H3.5 ▸ ไฟล์โอนเงินเดือน — seed ไม่เขียน 3 ตารางนี้ ◂
  hrBankProfile: { model: "HrBankProfile", file: "payroll.prisma", tenantId: true, role: "บัญชีต้นทาง + รูปแบบไฟล์ธนาคารที่เปิด 1 แถวต่อระบบ HR (HR H3.5)" },
  hrBankExportPreset: { model: "HrBankExportPreset", file: "payroll.prisma", tenantId: true, role: "ชุดคอลัมน์ CSV/XLSX ของร้าน (HR H3.5)" },
  hrBankFile: { model: "HrBankFile", file: "payroll.prisma", tenantId: true, role: "ใบกำกับไฟล์โอนเงินเดือนที่สร้าง (sha · ยอด · ไม่มีไบต์/เลขบัญชี) (HR H3.5)" },
  // HR H3.6 ▸ แบบยื่นภาษี/ประกันสังคม — seed ไม่เขียน 4 ตารางนี้ ◂
  hrFilingProfile: { model: "HrFilingProfile", file: "payroll.prisma", tenantId: true, role: "ข้อมูลผู้จ่ายเงิน + ตัวเลือกไฟล์ยื่น 1 แถวต่อระบบ HR (HR H3.6)" },
  hrFilingPerson: { model: "HrFilingPerson", file: "payroll.prisma", tenantId: true, role: "ชื่อ/คำนำหน้า/ที่อยู่แยกช่องของพนักงานสำหรับแบบยื่น (HR H3.6)" },
  hrFilingFile: { model: "HrFilingFile", file: "payroll.prisma", tenantId: true, role: "ใบกำกับไฟล์ ภ.ง.ด.1/1ก/สปส.1-10 ที่สร้าง (sha · ยอด · ไม่มีไบต์/เลขประจำตัว) (HR H3.6)" },
  hrTaxCertificate: { model: "HrTaxCertificate", file: "payroll.prisma", tenantId: true, role: "หนังสือรับรอง 50 ทวิ ที่ออกแล้ว (เนื้อหาแช่แข็ง + sha) (HR H3.6)" },
  hrSalaryCertificate: { model: "HrSalaryCertificate", file: "payroll.prisma", tenantId: true, role: "คำขอ/หนังสือรับรองเงินเดือนที่ออก (เนื้อหาแช่แข็ง + sha) — seed ไม่เขียน (HR H3.8)" }, // HR H3.8 ◂
  hrEmployeeRegister: { model: "HrEmployeeRegister", file: "hr.prisma", tenantId: true, role: "ทะเบียนลูกจ้าง: สัญชาติ + ประโยชน์ตอบแทนอย่างอื่น 1 แถว/พนักงาน (HR H3.9 · seed ไม่เขียน)" }, // HR H3.9 ◂
  hrPayrollOpeningYtd: { model: "HrPayrollOpeningYtd", file: "payroll.prisma", tenantId: true, role: "ยอดยกมาต้นปีก่อนใช้ระบบ ต่อพนักงานต่อปีภาษี (append-only rev · seed ไม่เขียน) (HR H3.4-YTD)" }, // HR H3.4-YTD ◂
  hrReviewNote: { model: "HrReviewNote", file: "hr.prisma", tenantId: true, role: "บันทึก/ตักเตือน/ประเมิน (H4.4 · ว่างใน H1.3) (HR H1.3)" },
  hrOnboardingTask: { model: "HrOnboardingTask", file: "hr.prisma", tenantId: true, role: "งานรับเข้า/ออกจากงาน (H4.4 · ว่างใน H1.3) (HR H1.3)" },
  hrLawTable: { model: "HrLawTable", file: "payroll.prisma", tenantId: false, role: "ตารางกฎหมายกลางของทั้ง SHARK — ไม่ลบตามร้าน · แถว v1:* จาก hr-seed-law-draft (HR H1.3)" },
  // ── ตารางร่วมที่ HR เขียนถึง ──
  approvalPolicy: { model: "ApprovalPolicy", file: "approval.prisma", tenantId: true, role: "สายอนุมัติ (entityType HrLeave)" },
  approvalStep: { model: "ApprovalStep", file: "approval.prisma", tenantId: true, role: "ขั้นของสายอนุมัติ" },
  approvalRequest: { model: "ApprovalRequest", file: "approval.prisma", tenantId: true, role: "คำขอในสาย (ใบลา)" },
  approvalDecision: { model: "ApprovalDecision", file: "approval.prisma", tenantId: true, role: "การตัดสินในสาย" },
  auditLog: { model: "AuditLog", file: "core.prisma", tenantId: true, role: "ประวัติ hr.leave.decide · hr.payroll.* · membership.access.grant (tenant onDelete SetNull ⇒ ต้องลบเอง)" },
  outboxEvent: { model: "OutboxEvent", file: "outbox.prisma", tenantId: true, role: "hr.leave.submitted · hr.payroll.paid" },
  membership: { model: "Membership", file: "core.prisma", tenantId: true, role: "บทบาท/สิทธิ์ hr.* ของผู้ใช้ในร้าน" },
  businessUnit: { model: "BusinessUnit", file: "core.prisma", tenantId: true, role: "สาขา (HrEmployee.unitId มาใน H1.1)" },
  appSystem: { model: "AppSystem", file: "app_system.prisma", tenantId: true, role: "ระบบ HR / ACCOUNT" },
  accountJournalEntry: { model: "AccountJournalEntry", file: "account_gl.prisma", tenantId: true, role: "JV เงินเดือน (postPayrollJV)" },
  accountJournalLine: { model: "AccountJournalLine", file: "account_gl.prisma", tenantId: true, role: "บรรทัด JV (Dr = Cr)" },
  // ── ไม่มี tenantId (ลบด้วยกุญแจอื่น) ──
  session: { model: "Session", file: "core.prisma", tenantId: false, role: "session ผู้ใช้ (ลบตามผู้ใช้ QC · visual-hr ลบเฉพาะของรอบตัวเอง)" },
  chatRateBucket: { model: "ChatRateBucket", file: "chat.prisma", tenantId: false, role: "ตัวจำกัดอัตราแบบ DB (hr-setpin:<tenant>:… · hr-kiosk:emp|sys:<tenant>:…)" },
} as const;
export type HrTableKey = keyof typeof HR_TABLES;

/**
 * ลำดับลบของ seed (ลูกก่อนแม่) — ตาราง HR/payroll/approval/audit/outbox/บัญชีที่ seed นี้สร้างได้ ·
 * seed กวาดตารางอื่นที่มี tenantId ตามหลังอีกรอบ (information_schema) แล้วตรวจว่าเหลือ 0 ทุกตาราง
 */
export const HR_DELETE_ORDER = [
  // payroll
  "hrPayrollItem", "hrPayAdjustment", "hrPayrollRun", "hrSalaryProfile",
  // hr
  // HR H1.2 ▸ ลูกก่อนแม่: คำขอ/สมุดวันลา → ตารางงาน → (ลงเวลา/ใบลา) → กะ/ประเภทการลา/วันหยุด ◂
  "hrAttendanceAlert", "hrAttendanceDay", // HR H2.5 ▸ ลูกของพนักงาน (ไม่มี FK อื่น) ◂
  "hrShiftSwapRequest", "hrTimeCorrection", "hrOtRequest", "hrLeaveBalanceTxn", "hrRosterEntry",
  "hrEmployeeDoc", "hrAttendance", "hrLeave", "hrWorkSchedule", "hrEmployeeUnit",
  "hrShift", "hrLeavePolicy", "hrHoliday",
  // HR H1.3 ▸ ลูกของพนักงาน (ก่อน hrEmployee) · hrLawTable ไม่อยู่ในลำดับนี้ (ตารางกลาง ไม่มี tenantId) ◂
  "hrWorkEntry", "hrReviewNote", "hrOnboardingTask",
  "hrWorkDay", // HR H3.1 ▸ หัววัน (แถวชนิดถูกลบก่อน — FK CASCADE) ◂
  "hrAttendanceDeduction", // HR H3.2 ▸ หัวรายการหักสาย/ขาด (ไม่มี FK) ◂
  "hrBankFile", "hrBankExportPreset", "hrBankProfile", // HR H3.5 ▸ ไฟล์โอนเงินเดือน (ไม่มี FK) ◂
  "hrTaxCertificate", "hrFilingFile", "hrFilingPerson", "hrFilingProfile", // HR H3.6 ▸ แบบยื่น (FK RESTRICT ไป hrEmployee ⇒ ก่อนพนักงาน) ◂
  "hrSalaryCertificate", // HR H3.8 ▸ หนังสือรับรองเงินเดือน (FK RESTRICT ไป hrEmployee ⇒ ก่อนพนักงาน) ◂
  "hrEmployeeRegister", // HR H3.9 ▸ ทะเบียนลูกจ้าง (ไม่มี FK) ◂
  "hrPayrollOpeningYtd", // HR H3.4-YTD ▸ ยอดยกมาต้นปี (FK RESTRICT ไป hrEmployee ⇒ ก่อนพนักงาน) ◂
  // สายอนุมัติ / ประวัติ / คิว / แจ้งเตือน
  "approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy",
  "auditLog", "outboxEvent", "appNotification", "automationRun", "automationRule",
  // บัญชี (ensureAccounting + JV เงินเดือน)
  "accountJournalLine", "accountJournalEntry", "accountLedger", "accountMapping", "accountPeriod",
  "accountDocSequence", "accountSettings", "accountCategory", "accountUnit",
  // แกนกลาง
  "hrEmployee", "party", "membership", "appSystemUnit", "appSystem", "businessUnit",
] as const;

// ═══════════════════ 3. สัญญาชุดข้อมูล (seed-hr-qc ต้องสร้างให้ตรงนี้) ═══════════════════

export type HqcUnit = "huahin" | "suanphueng";
export type HqcPayType = "MONTHLY" | "DAILY" | "HOURLY";
export type HqcShift = "morning" | "afternoon" | "closing";
export type HqcUserKey = "owner" | "manager" | "payroll" | "staff" | "kiosk" | "member" | "payrollSelf" | "manager-branch";
export type HqcEmployee = {
  key: string;
  name: string;
  code: string;
  position: string;
  department: string;
  /** สาขาประจำ (สตริงกุญแจ) — HR H1.1 ▸ seed เขียนลง HrEmployee.unitId (สาขาตาม slug ของ HQC.units) ◂ */
  unit: HqcUnit;
  /** ยืมตัวไปช่วยสาขาอื่น (ข้อมูลภาพ 02) — HR H1.1 ▸ seed สร้าง HrEmployeeUnit ที่ยังเปิด (ตั้งแต่วันเริ่มงาน) ◂ */
  borrowedTo?: HqcUnit;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "PROBATION";
  /** ประเภทค่าจ้างที่ตั้งใจ — seed ยังตั้งโปรไฟล์รายเดือนทุกคน (`baseSalarySatang` · มติผู้คุมงาน H1.1 ข้อ 9: รอบจ่าย DAILY/HOURLY = H3.4) */
  payType: HqcPayType;
  /** อัตรารายวัน/รายชั่วโมงที่ตั้งใจ (สตางค์) สำหรับ H1.1 · null = รายเดือน */
  rateSatang: number | null;
  /** โปรไฟล์รายเดือนที่ seed วันนี้ (สตางค์) */
  baseSalarySatang: number;
  /** วันเริ่มงาน = วันนี้ − N วัน (ลบ = อนาคต) · ดู `start` สำหรับกรณีพิเศษ */
  startDaysAgo: number;
  /** กรณีพิเศษของวันเริ่ม/สิ้นสุด (คิดจากวันนี้ตอนรัน) */
  start?: "firstOfNextMonth" | "firstOfThisMonth";
  end?: "lastDayOfMonthBeforePaidRun";
  active: boolean;
  /** PIN ทดสอบ (ไม่ซ้ำในร้าน) · null = ไม่ตั้ง PIN */
  pin: string | null;
  /** ผูกบัญชีผู้ใช้ (ผ่าน grantStaffAccess) */
  linkedUser: HqcUserKey | null;
  /** กะประจำ (ตารางงาน 7 วัน) + ลงเวลา 7 วันย้อนหลัง · null = ไม่มีตาราง/ไม่มีลงเวลา */
  shift: HqcShift | null;
  /** มาจากภาพ 02/06 (9 คน) หรือเป็นกรณีขอบ (5 คน) */
  origin: "mockup" | "edge";
  /** ป้ายสำหรับข้อสอบ (กรณีขอบ / ข้อมูลภาพ) */
  flags: readonly string[];
  /** โน้ตในทะเบียน (ข้อความวันที่คิดตอน seed) */
  note?: "probationEnds+14" | "contractEndsEndOfThisMonth";
  /** ใส่ช่องอ่อนไหว (PDPA) ตัวอย่าง — ใช้พิสูจน์ field-absence ของผู้ไม่มีสิทธิ์ */
  sensitive?: { nationalId: string; ssoNumber: string; bankName: string; bankAccountNo: string; bankAccountName: string; addressLine: string; birthYearsAgo: number };
};

const B = (baht: number) => Math.round(baht * 100);
/** สิทธิ์ของผู้ดูเงินเดือน — ใช้ร่วมกันระหว่าง `payroll` (ผู้ดูล้วน) และ `payrollSelf` (ผู้ดูที่มีแถวของตัวเอง — ก้อย) */
const PAYROLL_KEYS: Record<string, boolean> = {
  "hr.payroll.read": true,
  "hr.payroll.create": true,
  "hr.payroll.approve": true,
  "hr.payroll.pay": true,
  "hr.payroll.reverse": true,
  "hr.payadjust.request": true,
  "hr.payadjust.approve": true,
  "hr.payadjust.reject": true,
};

export const HQC = {
  tenantName: "บ้านกาแฟสวนผึ้ง (QC HR)",
  tenantSlug: "qc-hr-v2",
  expectedPath: "scripts/hr-expected.json",
  shotsDir: ".qc-shots/hr",
  units: {
    huahin: { name: "สาขาหัวหิน", slug: "qc-hr-v2-huahin", type: "SHOP" },
    suanphueng: { name: "สาขาสวนผึ้ง", slug: "qc-hr-v2-suanphueng", type: "SHOP" },
  },
  /** ระบบของร้าน (Q1: ระบบ HR ระบบเดียว · ACCOUNT ให้รอบที่จ่ายแล้วมี JV) — ไม่มี POS/BOOKING/CRM (X8) */
  systems: {
    HR: { name: "พนักงาน" },
    ACCOUNT: { name: "บัญชี" },
  },
  /** กะ (นาทีจากเที่ยงคืนเวลาไทย) — ภาพ 01 · ผ่อนผัน 15 นาที (ค่าปริยายของ schema) */
  shifts: {
    morning: { startMin: 7 * 60, endMin: 15 * 60, graceMin: 15 },
    afternoon: { startMin: 12 * 60, endMin: 20 * 60, graceMin: 15 },
    closing: { startMin: 15 * 60, endMin: 23 * 60, graceMin: 15 },
  },
  // HR H1.2 ▸ R11 ตั้งค่าเวลาและการลา (seed เขียนผ่าน hr/settings ในนามเจ้าของ) — ไม่มีตารางงาน/สมุดวันลา/คำขอ (H2.x seed เอง)
  //   shiftRows = HQC.shifts 3 กะเดิมเป็นแถว HrShift ทั้งร้าน (สี shift-1..3) + กะดึก QC 22:00–06:00 ข้ามเที่ยงคืน (ไม่มีใครถูกจัด)
  //   policies = ค่าแนะนำของ HQ12 — 🔴 ค่าตั้งต้นรอเจ้าของยืนยัน (HQ12) · holidays = ราชการ 1 วัน (presetYear) + วันหยุดร้านเฉพาะสาขาหัวหิน ◂
  timeLeave: {
    hq12Note: "ค่าตั้งต้นรอเจ้าของยืนยัน (HQ12)",
    shiftRows: [
      { shift: "morning", name: "กะเช้า", colour: "shift-1", sortOrder: 1 },
      { shift: "afternoon", name: "กะบ่าย", colour: "shift-2", sortOrder: 2 },
      { shift: "closing", name: "กะปิดร้าน", colour: "shift-3", sortOrder: 3 },
    ],
    nightShift: { name: "กะดึก (QC ข้ามเที่ยงคืน)", startMin: 22 * 60, endMin: 6 * 60, graceMin: 15, colour: "shift-4", sortOrder: 4 },
    policies: [
      { category: "SICK", name: "ลาป่วย", paid: true, quotaDays: 30, attachmentAfterDays: 3, sortOrder: 1 },
      { category: "PERSONAL", name: "ลากิจ", paid: true, quotaDays: 3, sortOrder: 2 },
      { category: "VACATION", name: "ลาพักร้อน", paid: true, quotaDays: 6, minServiceDays: 365, carryMaxDays: 6, carryExpiresMonthDay: "03-31", sortOrder: 3 },
      { category: "OTHER", name: "ลาไม่รับค่าจ้าง", paid: false, quotaDays: null, sortOrder: 4 },
    ],
    /** monthDay ของปีปัจจุบัน (เวลาไทย) · unit null = ทั้งร้าน */
    holidays: [
      { kind: "PUBLIC", name: "วันสงกรานต์", monthDay: "04-13", unit: null, preset: true },
      { kind: "SHOP", name: "วันหยุดประจำปีสาขาหัวหิน", monthDay: "06-15", unit: "huahin", preset: false },
    ],
  },
  employees: [
    // ── 9 คนจากภาพ 02/06 (ชื่อ · ตำแหน่ง · เงินเดือน) ──
    { key: "keng", name: "พี่เก่ง", code: "EMP-001", position: "ผู้จัดการ", department: "บริหาร", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(32_000), startDaysAgo: 1460, active: true, pin: "4101", linkedUser: null, shift: "morning", origin: "mockup", flags: ["manager-in-mockup"] },
    { key: "namfon", name: "น้ำฝน", code: "EMP-002", position: "แคชเชียร์", department: "หน้าร้าน", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(16_000), startDaysAgo: 1335, active: true, pin: "4102", linkedUser: "staff", shift: "morning", origin: "mockup", flags: ["self-service", "late-18min", "ot-6h-paid-run"],
      sensitive: { nationalId: "1100000000021", ssoNumber: "1100000000021", bankName: "KBank", bankAccountNo: "0000004321", bankAccountName: "น้ำฝน ใจดี", addressLine: "12/3 ถ.ดำเนินเกษม", birthYearsAgo: 28 } },
    { key: "prae", name: "แพร", code: "EMP-003", position: "แคชเชียร์", department: "หน้าร้าน", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(15_500), startDaysAgo: 845, active: true, pin: "4103", linkedUser: null, shift: "morning", origin: "mockup", flags: ["leave-approved-last-week"] },
    { key: "ton", name: "ต้น", code: "EMP-004", position: "พ่อครัว", department: "ครัว", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(17_000), startDaysAgo: 1430, active: true, pin: "4104", linkedUser: null, shift: "morning", origin: "mockup", flags: ["early-out"] },
    { key: "por", name: "ปอ", code: "EMP-005", position: "ผู้ช่วยครัว", department: "ครัว", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(13_000), startDaysAgo: 640, active: true, pin: "4105", linkedUser: null, shift: "morning", origin: "mockup", flags: ["deduction-500-paid-run", "salary-not-in-mockup"] },
    { key: "nat", name: "นัท", code: "EMP-006", position: "บาริสต้า", department: "บาร์", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(16_500), startDaysAgo: 920, active: true, pin: "4106", linkedUser: null, shift: "afternoon", origin: "mockup", flags: ["absent-one-day", "salary-not-in-mockup"] },
    { key: "mint", name: "มิ้นท์", code: "EMP-007", position: "พนักงานเสิร์ฟ", department: "หน้าร้าน", unit: "huahin", employmentType: "DAILY", payType: "DAILY", rateSatang: B(400), baseSalarySatang: B(8_800), startDaysAgo: 272, active: true, pin: "4107", linkedUser: null, shift: "closing", origin: "mockup", flags: ["daily-rate", "leave-pending-next-week", "deduction-pending-this-month"] },
    { key: "bow", name: "โบว์", code: "EMP-009", position: "บาริสต้า", department: "บาร์", unit: "huahin", employmentType: "PROBATION", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(14_000), startDaysAgo: 76, active: true, pin: "4109", linkedUser: null, shift: "morning", origin: "mockup", flags: ["probation-ends-in-14-days", "bonus-1000-paid-run"], note: "probationEnds+14",
      sensitive: { nationalId: "1100000000621", ssoNumber: "1100000000621", bankName: "KBank", bankAccountNo: "0000014321", bankAccountName: "พิมพ์ชนก ใจดี", addressLine: "88/12 ถ.เพชรเกษม ต.หัวหิน", birthYearsAgo: 23 } },
    { key: "jay", name: "เจ", code: "EMP-012", position: "บาริสต้า", department: "บาร์", unit: "suanphueng", borrowedTo: "huahin", employmentType: "PART_TIME", payType: "HOURLY", rateSatang: B(65), baseSalarySatang: B(4_680), startDaysAgo: 160, active: true, pin: "4112", linkedUser: null, shift: "afternoon", origin: "mockup", flags: ["hourly-rate", "borrowed", "contract-ends-end-of-month", "ot-pending-this-month"], note: "contractEndsEndOfThisMonth" },
    // ── 5 กรณีขอบ ──
    { key: "fai", name: "ฝ้าย", code: "EMP-010", position: "พนักงานเสิร์ฟ", department: "หน้าร้าน", unit: "huahin", employmentType: "DAILY", payType: "DAILY", rateSatang: B(400), baseSalarySatang: B(8_800), startDaysAgo: 217, end: "lastDayOfMonthBeforePaidRun", active: false, pin: null, linkedUser: null, shift: null, origin: "edge", flags: ["leaver", "excluded-ENDED_BEFORE"] },
    { key: "om", name: "ออม", code: "EMP-013", position: "พนักงานเสิร์ฟ", department: "หน้าร้าน", unit: "suanphueng", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(12_000), startDaysAgo: 0, start: "firstOfNextMonth", active: true, pin: "4113", linkedUser: null, shift: null, origin: "edge", flags: ["future-starter", "excluded-STARTS_AFTER"] },
    { key: "kong", name: "ก้อง", code: "EMP-011", position: "พ่อครัว", department: "ครัว", unit: "suanphueng", employmentType: "PROBATION", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(18_000), startDaysAgo: 0, start: "firstOfThisMonth", active: true, pin: "4111", linkedUser: null, shift: null, origin: "edge", flags: ["probation-hire-this-month", "excluded-STARTS_AFTER"] },
    { key: "pui", name: "ปุ้ย", code: "EMP-008", position: "หัวหน้าบาริสต้า", department: "บาร์", unit: "suanphueng", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(22_000), startDaysAgo: 700, active: true, pin: null, linkedUser: null, shift: null, origin: "edge", flags: ["no-pin"] },
    { key: "koy", name: "ก้อย", code: "EMP-014", position: "ธุรการ/บุคคล", department: "สำนักงาน", unit: "suanphueng", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(20_000), startDaysAgo: 500, active: true, pin: "4114", linkedUser: "payrollSelf", shift: null, origin: "edge", flags: ["linked-staff-user", "payroll-viewer-own-row"] },
  ] as readonly HqcEmployee[],
  /**
   * ผู้ใช้ 7 คน = 6 บทบาทของ brief (ไม่ผูกพนักงาน ยกเว้น staff ↔ น้ำฝน) + `payrollSelf` (ผู้ดูเงินเดือนที่มีแถวของตัวเอง ↔ ก้อย · มติ H0.4 r2)
   * (passwordless — สร้าง User + Membership ตรงแบบ seed-crm-qc / seed-member-qc · ล็อกอินด้วย OTP)
   * keys = permissions ของ Membership (OWNER/MANAGER ผ่าน evaluate ทุกคีย์อยู่แล้ว ⇒ {})
   * 🔴 MANAGER ผ่าน `evaluate` ของทุก action `hr.payroll.*` (rbac.ts:36) — มีแค่ `canViewPayroll` ที่กันไว้ ⇒ ข้อสอบต้องยิง action ด้วย ไม่ใช่ดูแค่หน้า
   */
  users: {
    owner: { email: "hr-qc-owner@shark.local", name: "เจ้าของร้าน (QC HR)", role: "OWNER", keys: {} },
    manager: { email: "hr-qc-manager@shark.local", name: "ผู้จัดการร้าน (QC HR)", role: "MANAGER", keys: {} },
    payroll: { email: "hr-qc-payroll@shark.local", name: "ฝ่ายเงินเดือน (QC HR)", role: "STAFF", keys: PAYROLL_KEYS },
    staff: { email: "hr-qc-staff@shark.local", name: "น้ำฝน (QC HR)", role: "STAFF", keys: { "hr.leave.request": true } },
    kiosk: { email: "hr-qc-kiosk@shark.local", name: "แท็บเล็ตหน้าร้าน (QC HR)", role: "STAFF", keys: { "hr.attendance.clock": true } },
    member: { email: "hr-qc-member@shark.local", name: "สมาชิกในร้าน (QC HR)", role: "STAFF", keys: {} },
    payrollSelf: { email: "hr-qc-payroll-self@shark.local", name: "ก้อย ฝ่ายบุคคล (QC HR)", role: "STAFF", keys: PAYROLL_KEYS },
    // HR H1.1 ▸ มติผู้คุมงานข้อ 10: ผู้จัดการสาขา (unitAccess = [สาขาหัวหิน]) — ภาพ register-branch-manager · ไม่ผูกพนักงาน ◂
    "manager-branch": { email: "hr-qc-manager-branch@shark.local", name: "ผู้จัดการสาขาหัวหิน (QC HR)", role: "MANAGER", keys: {}, units: ["huahin"] },
  } as Record<HqcUserKey, { email: string; name: string; role: "OWNER" | "MANAGER" | "STAFF"; keys: Record<string, boolean>; units?: readonly HqcUnit[] }>,
  payroll: {
    /** รอบที่จ่ายแล้ว = เดือนที่แล้ว (offset −1) · วันจ่าย = วันสุดท้ายของงวด */
    paidRunMonthOffset: -1,
    /** รายการที่อนุมัติแล้ว (ยื่นโดย payroll · อนุมัติโดย owner — 4 ตา) → ถูกดึงเข้ารอบที่จ่ายแล้ว */
    approved: [
      { employee: "namfon", kind: "OT", hours: 6, note: "OT วันทำงาน 3 วัน วันละ 2 ชม." },
      { employee: "bow", kind: "BONUS", amountSatang: B(1_000), note: "โบนัสยอดขายเวิร์กช็อป" },
      { employee: "por", kind: "DEDUCTION", amountSatang: B(500), note: "หักเบิกล่วงหน้า" },
    ],
    /** รายการรออนุมัติของเดือนนี้ (ไม่ผูกรอบ — Q2: ไม่มีรอบร่างเดือนนี้) */
    pending: [
      { employee: "jay", kind: "OT", hours: 4, note: "OT ช่วยกะบ่าย" },
      { employee: "mint", kind: "DEDUCTION", amountSatang: B(200), note: "หักทำแก้วแตก" },
    ],
    /** พนักงานที่ต้องไม่อยู่ในรอบที่จ่ายแล้ว (H0.2 runExclusions) */
    excluded: [
      { employee: "fai", reason: "ENDED_BEFORE" },
      { employee: "om", reason: "STARTS_AFTER" },
      /** ผู้ทดลองงานเริ่มวันที่ 1 ของเดือนนี้ ⇒ ไม่อยู่ในงวดที่จ่ายเสมอ (มติ H0.4 r2 FIX F — ไม่มี PARTIAL_MONTH ที่ขึ้นกับวันที่ของเดือน) */
      { employee: "kong", reason: "STARTS_AFTER" },
    ],
  },
  attendance: {
    /** ย้อนหลัง 7 วัน (วันนี้ −7 … −1) ของทุกคนที่มี `shift` */
    days: 7,
    /** น้ำฝนสาย +18 นาที ที่วันนี้ −1 */
    late: { employee: "namfon", dayOffset: -1, lateMin: 18 },
    /** ต้นออกก่อนเวลา 60 นาที ที่วันนี้ −2 */
    earlyOut: { employee: "ton", dayOffset: -2, earlyMin: 60 },
    /** นัทขาด 1 วัน (ไม่มีแถว) ที่วันนี้ −3 */
    absent: { employee: "nat", dayOffset: -3 },
  },
  leave: {
    /** อนุมัติแล้ว: แพร ลาพักร้อน 2 วันเมื่อสัปดาห์ก่อน (วันนี้ −6 … −5 · ไม่มีลงเวลา 2 วันนั้น) */
    approved: { employee: "prae", type: "VACATION", fromOffset: -6, toOffset: -5, reason: "ลาพักร้อนกลับบ้าน" },
    /** รออนุมัติ: มิ้นท์ ลากิจ สัปดาห์หน้า (วันนี้ +7) */
    pending: { employee: "mint", type: "PERSONAL", fromOffset: 7, toOffset: 7, reason: "ธุระที่ว่าการอำเภอ" },
    /** ผู้ตัดสิน (ห้ามตัดสินใบของตัวเอง — hotfix) */
    decider: "manager" as HqcUserKey,
  },
  // HR H2.2 ▸ Q14 สัปดาห์ของภาพ 03 บน "จันทร์ถัดไป" ตามเวลาไทย (rosterWeek — ไม่ใช่วันที่ตายตัว X7) · เขียนผ่านเครื่องยนต์ H2.1 ในนามเจ้าของ
  //   week = 7 ตัวอักษรต่อคน จันทร์→อาทิตย์: m เช้า · a บ่าย · c ปิดร้าน · - หยุด · override = "<ตัวอักษร>@HH-HH" ต่อวันใน `times`
  //   ลำดับ: ลงทั้งสัปดาห์ → เผยแพร่ (event 1) → แก้ 3 จุด (edits) ⇒ แถบ "ยังไม่เผยแพร่ (แก้ 3 จุด)" · พี่เก่งได้แถวเช้าแทนกิ๊ฟ (หนี้ D10) ◂
  roster: {
    shiftNames: { m: "กะเช้า", a: "กะบ่าย", c: "กะปิดร้าน" },
    week: {
      keng: "mmmmm--",
      namfon: "-mmmm--",
      prae: "mm-mm--",
      ton: "mmm-mmm",
      por: "a-aaaaa",
      nat: "aaa-aaa",
      bow: "mmmmm--",
      mint: "ccccccc",
      jay: "----aaa",
    } as Record<string, string>,
    /** เวลาที่ระบุเอง (Q7) ของเจ: ศ. 14–20 · ส.–อา. 12–18 */
    times: { jay: { 4: [14 * 60, 20 * 60], 5: [12 * 60, 18 * 60], 6: [12 * 60, 18 * 60] } } as Record<string, Record<number, readonly [number, number]>>,
    /** หลังเผยแพร่: น้ำฝน ส. เพิ่มเช้า · นัท ส. เปลี่ยนเป็นปิดร้าน · พี่เก่ง อา. เพิ่มเช้า */
    edits: [
      { employee: "namfon", dow: 5, op: "add", shift: "m" },
      { employee: "nat", dow: 5, op: "change", shift: "c" },
      { employee: "keng", dow: 6, op: "add", shift: "m" },
    ],
    // HR H2.2 r2 ▸ Q14 แพร ลาพักร้อนรออนุมัติในสัปดาห์ภาพ 03 (ชิปลาเส้นประ + "รออนุมัติ" ในภาพ) ◂
    // HR H2.7 r2 ▸ ย้ายไปวันศุกร์ที่แพรมีกะ (dow 4 · 1.0 วัน — มติผู้คุม) · เดิม ส.–อา. = วันหยุดของแพรในสัปดาห์ที่ประกาศแล้ว ⇒ 0 วัน ⇒ zeroDays ◂
    pendingLeave: { employee: "prae", type: "VACATION", fromDow: 4, toDow: 4, reason: "ไปงานแต่งเพื่อนต่างจังหวัด" },
  },
  // HR H2.5 ▸ Q9 ตารางกะที่ประกาศแล้วของ 7 วันที่ลงเวลาย้อนหลัง (วันนี้ −7 … −1) ของทุกคนที่มี `shift` (กะประจำ = HQC.shifts) ·
  //   seed เขียนแถวตรง (เครื่องยนต์ตารางกะไม่รับวันย้อนหลัง — แบบเดียวกับ insertHistoricalClock) แล้วรันตัวปิดวัน (runAttendanceJobs) ครั้งเดียว ⇒
  //   hr-expected.json `attendanceDays` (ผลบันทึกแล้ว: น้ำฝนสาย · ต้นออกก่อน · นัทขาด · แพรลา) ◂
  attendanceRoster: {
    days: 7,
    shiftNames: { morning: "กะเช้า", afternoon: "กะบ่าย", closing: "กะปิดร้าน" } as Record<HqcShift, string>,
    /** VIS-1 A4: ตารางกะของ "วันนี้" (ประกาศแล้ว · ไม่มีการลงเวลา — S7.3 ของ H1.2 นับลงเวลา 120 แถวคงที่) ⇒ จอทีมรายวันของวันนี้เห็นสถานะสด ·
     *  กะเช้า 2 คนยิงการเตือน "ยังไม่ลงเวลาเข้า" ตอน 07:30 (เวลาคงที่ ไม่ขึ้นกับเวลาที่รัน seed) ⇒ แถบเตือน · ที่เหลือกะบ่าย/ปิดร้าน = ยังไม่ถึงเวลา/ยังไม่มา ตามเวลาที่เปิดดู */
    today: { keng: "morning", namfon: "morning", prae: "afternoon", ton: "afternoon", por: "afternoon", nat: "afternoon", jay: "afternoon", mint: "closing", bow: "closing" } as Record<string, HqcShift>,
    todayAlertAtMin: 7 * 60 + 30,
  },
  // HR H4.4 ▸ วงจรพนักงาน (ภาพ 02 — ผ่าน hr/lifecycle.ts ในนามเจ้าของ): ทดลองงานครบ today+14 (โบว์) · สัญญาพาร์ทไทม์ถึงสิ้นเดือน (เจ) ·
  //   รายการรับพนักงานใหม่ของโบว์ 5/7 · ตักเตือนด้วยวาจา 1 ใบที่พนักงานเห็น (นัท · ยังทำงาน) · ผู้ลาออก (ฝ้าย) สิ้นสุดผ่าน offboardEmployee (RESIGNED · leaverEnd)
  //   ⇒ แถวที่คาด: งาน 7 + 6 = 13 · บันทึก 1 (ML1 ของ seed) · บอร์ดงานปิด (ค่าปริยาย) ⇒ ไม่มีการ์ด ◂
  lifecycle: {
    probation: { employee: "bow", endsInDays: 14 },
    contract: { employee: "jay" },
    onboarding: { employee: "bow", done: ["id_card", "sso", "bank", "pin", "roster"] },
    warning: { employee: "nat", kind: "VERBAL_WARNING", title: "มาสายเกิน 3 ครั้งในเดือนนี้", body: "แจ้งด้วยวาจาแล้ว ให้เข้างานตรงเวลาตั้งแต่สัปดาห์หน้า" },
    leaver: { employee: "fai", reason: "RESIGNED" },
    expect: { tasks: 13, notes: 1, onboardingDone: 5, offboardingTasks: 6 },
  },
  // HR H2.11 ▸ กล่องคำขอรวม (ภาพ 05/01) — คำขอรออนุมัติครบ 5 ชนิดสำหรับภาพ (ผ่านฟังก์ชันยื่นของแต่ละชนิด · ไม่ตัดสิน):
  //   ลา = ใบเดิม (มิ้นท์ · แพร) · OT ของต้น (ผู้จัดการยื่นแทน · พุธของ rosterWeek 15:00–17:00) · ยกกะ (GIVE) พฤหัสของน้ำฝน → ก้อย (ยืมตัวมาหัวหินวันนั้น · ก้อยตอบรับ) ·
  //   แก้เวลาเข้าของน้ำฝนวันที่สาย (−1) เร็วขึ้น 5 นาที (ยื่นเอง) · เบิกล่วงหน้าของต้น ฿2,000 (ผู้จัดการยื่น) · หักค่าแก้วแตกของมิ้นท์ ฿150 (เจ้าของยื่น · หนังสือยินยอม) ◂
  inbox: {
    ot: { employee: "ton", dow: 2, start: "15:00", end: "17:00", reason: "ช่วยเตรียมของงานเลี้ยง", by: "manager" as HqcUserKey },
    swap: { requester: "namfon", dow: 3, target: "koy", borrowUnit: "huahin" as HqcUnit, by: "staff" as HqcUserKey, peer: "payrollSelf" as HqcUserKey },
    correction: { employee: "namfon", by: "staff" as HqcUserKey, earlierMin: 5, reason: "มาถึงแล้วแต่เครื่องลงเวลาค้าง" },
    advance: { employee: "ton", amountSatang: B(2_000), note: "เบิกล่วงหน้า หักคืนงวดนี้", by: "manager" as HqcUserKey },
    stock: { employee: "mint", amountSatang: B(150), description: "แก้วกาแฟแตก 1 ใบ", consentRef: "ยินยอม-QC-001" },
    expect: { otPending: 1, swapPending: 1, correctionPending: 1, adjustmentsPending: 2, stockCharges: 1 },
  },
} as const;

export type HqcEmployeeKey = (typeof HQC.employees)[number]["key"];
export const hqcEmployee = (key: string): HqcEmployee => {
  const e = HQC.employees.find((x) => x.key === key);
  if (!e) throw new Error(`HQC: ไม่มีพนักงาน key ${key}`);
  return e;
};
export const HQC_EMAILS: readonly string[] = Object.values(HQC.users).map((u) => u.email);

// ═══════════════════ 4. วันที่ (เวลาไทย · คิดตอนรัน — X7) ═══════════════════
const DAY_MS = 86_400_000;
const BKK_OFFSET_MS = 7 * 3_600_000; // เวลาไทยคงที่ +7 (กติกาเดียวกับ hr/service.ts bkkParts)

/** "YYYY-MM-DD" + n วัน (ปฏิทินล้วน) */
export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** งวด "YYYY-MM" + n เดือน */
export function addMonths(periodKey: string, n: number): string {
  const [y, m] = periodKey.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
export const firstDayOf = (periodKey: string) => `${periodKey}-01`;
export function lastDayOf(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
/** instant ของ "วัน dayKey เวลา minOfDay นาที (เวลาไทย)" */
export function atBkk(dayKey: string, minOfDay: number): Date {
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 0, minOfDay) - BKK_OFFSET_MS);
}
/** Date ของวันนี้ + n วัน เวลา hourBkk:00 น. (ค่าปริยายเที่ยงวัน — กันข้ามวันไทย) — แบบ dayFromToday ของ member-qc-env */
export function dayFromToday(n: number, hourBkk = 12, now = new Date()): Date {
  return atBkk(addDays(thaiDateKey(now), n), hourBkk * 60);
}
/** "15 ต.ค." (ข้อความโน้ตแบบภาพ 02) */
export function thaiShort(dayKey: string): string {
  return atBkk(dayKey, 12 * 60).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}

/** วันที่ทั้งหมดของชุดข้อมูล คิดจาก "วันนี้ตามเวลาไทย" — seed/ข้อสอบ/visual เรียกตัวเดียวกัน */
export function hqcDates(now = new Date()) {
  const today = thaiDateKey(now);
  const thisMonth = today.slice(0, 7);
  const paidRunPeriod = addMonths(thisMonth, HQC.payroll.paidRunMonthOffset);
  return {
    today,
    thisMonth,
    paidRunPeriod,
    /** วันจ่ายของรอบที่จ่ายแล้ว = วันสุดท้ายของงวด (อดีตเสมอ) */
    paidRunPayDate: lastDayOf(paidRunPeriod),
    /** ผู้ลาออก: วันสุดท้ายของเดือนก่อนงวดที่จ่าย ⇒ H0.2 ตัดออก (ENDED_BEFORE) — แบบภาพ 02 (ฝ้าย สิ้นสุด 31 ส.ค. · รอบ ก.ย.) */
    leaverEnd: lastDayOf(addMonths(paidRunPeriod, -1)),
    /** ผู้เริ่มงานอนาคต: วันที่ 1 ของเดือนหน้า ⇒ H0.2 ตัดออกจากรอบที่จ่าย (STARTS_AFTER) */
    futureStart: firstDayOf(addMonths(thisMonth, 1)),
    endOfThisMonth: lastDayOf(thisMonth),
    /** ผู้ทดลองงาน: วันที่ 1 ของเดือนนี้ (เวลาไทย) ⇒ หลังงวดที่จ่ายเสมอ (STARTS_AFTER) */
    probationStart: firstDayOf(thisMonth),
    startOf: (e: HqcEmployee) =>
      e.start === "firstOfNextMonth" ? firstDayOf(addMonths(thisMonth, 1)) : e.start === "firstOfThisMonth" ? firstDayOf(thisMonth) : addDays(today, -e.startDaysAgo),
    /** วันเกิด = วันนี้ − N ปี (เดือน/วันเดียวกัน · 29 ก.พ. → 28 ก.พ.) — ไม่มีวันที่ตายตัวในชุดข้อมูล (X7) */
    yearsAgo: (n: number) => {
      const [y, m, d] = today.split("-").map(Number) as [number, number, number];
      const last = new Date(Date.UTC(y - n, m, 0)).getUTCDate();
      return `${String(y - n).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
    },
    dayKey: (offset: number) => addDays(today, offset),
  };
}
export type HqcDates = ReturnType<typeof hqcDates>;

// ═══════════════════ 5. helper ═══════════════════

type MinimalPrisma = {
  tenant: { findFirst: (a: unknown) => Promise<{ id: string; name: string } | null> };
  appSystem: { findMany: (a: unknown) => Promise<{ id: string; type: string }[]> };
};
export type HrQcScope = { tenantId: string; hrSystemId: string; accountSystemId: string | null };

/** ร้าน QC ของ HR (null = ยังไม่ได้ seed-hr-qc ในฐานนี้) — ข้อสอบใช้เป็น SKIP guard · ชื่อร้านต้องตรงด้วย (กันชน slug) */
export async function findQcTenant(prisma: MinimalPrisma): Promise<HrQcScope | null> {
  const t = await prisma.tenant.findFirst({ where: { slug: HQC.tenantSlug }, select: { id: true, name: true } });
  if (!t || t.name !== HQC.tenantName) return null;
  const rows = await prisma.appSystem.findMany({ where: { tenantId: t.id }, select: { id: true, type: true }, orderBy: { createdAt: "asc" } });
  const hr = rows.find((r) => r.type === "HR");
  if (!hr) return null;
  return { tenantId: t.id, hrSystemId: hr.id, accountSystemId: rows.find((r) => r.type === "ACCOUNT")?.id ?? null };
}

export type HrSev = "CRITICAL" | "MAJOR" | "MINOR";
export type HrCheck = { id: string; title: string; ok: boolean; expected: string; actual: string; sev: HrSev };

/**
 * chk() + summary() ทรงบ้าน — `chk(id, title, ok, expected, actual, sev?)` · บรรทัดท้าย `JSON_SUMMARY {"total","passed","findings",…}`
 * ใช้: const q = makeChecker("seed-hr-qc"); q.chk(...); process.exitCode = q.summary({ counts });
 */
export function makeChecker(suite: string) {
  const checks: HrCheck[] = [];
  return {
    checks,
    chk(id: string, title: string, ok: boolean, expected: unknown, actual: unknown, sev: HrSev = "MAJOR"): boolean {
      const c = { id, title, ok, expected: String(expected), actual: String(actual), sev };
      checks.push(c);
      console.log(`  ${ok ? "✅" : "❌"} [${id}] ${title}${ok ? "" : ` — expected ${c.expected} | actual ${c.actual}`}`);
      return ok;
    },
    /** พิมพ์สรุป + คืน exit code (CRITICAL/MAJOR แดง = 1) */
    summary(extra: Record<string, unknown> = {}): number {
      const failed = checks.filter((c) => !c.ok);
      console.log(`\n===== ${suite} ===== ผ่าน ${checks.length - failed.length}/${checks.length}`);
      console.log(
        "JSON_SUMMARY " +
          JSON.stringify({
            suite,
            total: checks.length,
            passed: checks.length - failed.length,
            findings: failed.map((c) => ({ id: c.id, title: c.title, expected: c.expected, actual: c.actual, sev: c.sev })),
            ...extra,
          }),
      );
      return failed.some((c) => c.sev !== "MINOR") ? 1 : 0;
    },
  };
}

/** สตางค์ → ข้อความบาท (log เท่านั้น) */
export const bahtText = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
