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
export const HR_QC_HOST_MARK = "ep-frosty-lab";

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
// 🔴 ตารางของใบหลัง (HrSalaryProfile.payType · HrShift · HrRoster · HrLeaveBalance · HrLawValue …) **ยังไม่มีจริง** — ห้ามเติมจนกว่า migration ลง
export const HR_TABLES = {
  // ── prisma/schema/hr.prisma ──
  hrEmployee: { model: "HrEmployee", file: "hr.prisma", tenantId: true, role: "ทะเบียนพนักงาน (pinCode · linkedUserId · ช่องอ่อนไหว PDPA)" },
  hrEmployeeDoc: { model: "HrEmployeeDoc", file: "hr.prisma", tenantId: true, role: "เอกสารแนบพนักงาน" },
  hrAttendance: { model: "HrAttendance", file: "hr.prisma", tenantId: true, role: "ลงเวลาเข้า/ออก + คำตัดสินสาย (snapshot)" },
  hrLeave: { model: "HrLeave", file: "hr.prisma", tenantId: true, role: "ใบลา (PENDING/APPROVED/REJECTED/CANCELLED)" },
  hrWorkSchedule: { model: "HrWorkSchedule", file: "hr.prisma", tenantId: true, role: "ตารางงานรายวันในสัปดาห์" },
  // ── prisma/schema/payroll.prisma ──
  hrSalaryProfile: { model: "HrSalaryProfile", file: "payroll.prisma", tenantId: true, role: "โปรไฟล์เงินเดือน (รายเดือนเท่านั้นวันนี้)" },
  hrPayAdjustment: { model: "HrPayAdjustment", file: "payroll.prisma", tenantId: true, role: "รายการเพิ่ม/หัก (OT · BONUS · DEDUCTION · COMMISSION …)" },
  hrPayrollRun: { model: "HrPayrollRun", file: "payroll.prisma", tenantId: true, role: "รอบจ่าย (DRAFT/APPROVED/PAID/REVERSED · journalEntryId)" },
  hrPayrollItem: { model: "HrPayrollItem", file: "payroll.prisma", tenantId: true, role: "แถวพนักงานในรอบจ่าย" },
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
  "hrEmployeeDoc", "hrAttendance", "hrLeave", "hrWorkSchedule",
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
export type HqcUserKey = "owner" | "manager" | "payroll" | "staff" | "kiosk" | "member";
export type HqcEmployee = {
  key: string;
  name: string;
  code: string;
  position: string;
  department: string;
  /** สาขาประจำ (สตริงกุญแจ) — **ยังไม่เขียนลง DB** (HrEmployee.unitId มาใน H1.1 · ใช้ backfill) */
  unit: HqcUnit;
  /** ยืมตัวไปช่วยสาขาอื่น (ข้อมูลภาพ 02) — H1.1/H2.x */
  borrowedTo?: HqcUnit;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "PROBATION";
  /** ประเภทค่าจ้างที่ตั้งใจ (H1.1) — วันนี้ seed โปรไฟล์รายเดือนทุกคน (`baseSalarySatang`) */
  payType: HqcPayType;
  /** อัตรารายวัน/รายชั่วโมงที่ตั้งใจ (สตางค์) สำหรับ H1.1 · null = รายเดือน */
  rateSatang: number | null;
  /** โปรไฟล์รายเดือนที่ seed วันนี้ (สตางค์) */
  baseSalarySatang: number;
  /** วันเริ่มงาน = วันนี้ − N วัน (ลบ = อนาคต) · ดู `start` สำหรับกรณีพิเศษ */
  startDaysAgo: number;
  /** กรณีพิเศษของวันเริ่ม/สิ้นสุด (คิดจากวันนี้ตอนรัน) */
  start?: "firstOfNextMonth";
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
  sensitive?: { nationalId: string; ssoNumber: string; bankName: string; bankAccountNo: string; bankAccountName: string; birthDate: string; addressLine: string };
};

const B = (baht: number) => Math.round(baht * 100);

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
  employees: [
    // ── 9 คนจากภาพ 02/06 (ชื่อ · ตำแหน่ง · เงินเดือน) ──
    { key: "keng", name: "พี่เก่ง", code: "EMP-001", position: "ผู้จัดการ", department: "บริหาร", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(32_000), startDaysAgo: 1460, active: true, pin: "4101", linkedUser: null, shift: "morning", origin: "mockup", flags: ["manager-in-mockup"] },
    { key: "namfon", name: "น้ำฝน", code: "EMP-002", position: "แคชเชียร์", department: "หน้าร้าน", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(16_000), startDaysAgo: 1335, active: true, pin: "4102", linkedUser: "staff", shift: "morning", origin: "mockup", flags: ["self-service", "late-18min", "ot-6h-paid-run"],
      sensitive: { nationalId: "1100000000021", ssoNumber: "1100000000021", bankName: "KBank", bankAccountNo: "0000004321", bankAccountName: "น้ำฝน ใจดี", birthDate: "1998-05-14", addressLine: "12/3 ถ.ดำเนินเกษม" } },
    { key: "prae", name: "แพร", code: "EMP-003", position: "แคชเชียร์", department: "หน้าร้าน", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(15_500), startDaysAgo: 845, active: true, pin: "4103", linkedUser: null, shift: "morning", origin: "mockup", flags: ["leave-approved-last-week"] },
    { key: "ton", name: "ต้น", code: "EMP-004", position: "พ่อครัว", department: "ครัว", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(17_000), startDaysAgo: 1430, active: true, pin: "4104", linkedUser: null, shift: "morning", origin: "mockup", flags: ["early-out"] },
    { key: "por", name: "ปอ", code: "EMP-005", position: "ผู้ช่วยครัว", department: "ครัว", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(13_000), startDaysAgo: 640, active: true, pin: "4105", linkedUser: null, shift: "morning", origin: "mockup", flags: ["deduction-500-paid-run", "salary-not-in-mockup"] },
    { key: "nat", name: "นัท", code: "EMP-006", position: "บาริสต้า", department: "บาร์", unit: "huahin", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(16_500), startDaysAgo: 920, active: true, pin: "4106", linkedUser: null, shift: "afternoon", origin: "mockup", flags: ["absent-one-day", "salary-not-in-mockup"] },
    { key: "mint", name: "มิ้นท์", code: "EMP-007", position: "พนักงานเสิร์ฟ", department: "หน้าร้าน", unit: "huahin", employmentType: "DAILY", payType: "DAILY", rateSatang: B(400), baseSalarySatang: B(8_800), startDaysAgo: 272, active: true, pin: "4107", linkedUser: null, shift: "closing", origin: "mockup", flags: ["daily-rate", "leave-pending-next-week", "deduction-pending-this-month"] },
    { key: "bow", name: "โบว์", code: "EMP-009", position: "บาริสต้า", department: "บาร์", unit: "huahin", employmentType: "PROBATION", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(14_000), startDaysAgo: 76, active: true, pin: "4109", linkedUser: null, shift: "morning", origin: "mockup", flags: ["probation-ends-in-14-days", "bonus-1000-paid-run"], note: "probationEnds+14",
      sensitive: { nationalId: "1100000000621", ssoNumber: "1100000000621", bankName: "KBank", bankAccountNo: "0000014321", bankAccountName: "พิมพ์ชนก ใจดี", birthDate: "2003-03-12", addressLine: "88/12 ถ.เพชรเกษม ต.หัวหิน" } },
    { key: "jay", name: "เจ", code: "EMP-012", position: "บาริสต้า", department: "บาร์", unit: "suanphueng", borrowedTo: "huahin", employmentType: "PART_TIME", payType: "HOURLY", rateSatang: B(65), baseSalarySatang: B(4_680), startDaysAgo: 160, active: true, pin: "4112", linkedUser: null, shift: "afternoon", origin: "mockup", flags: ["hourly-rate", "borrowed", "contract-ends-end-of-month", "ot-pending-this-month"], note: "contractEndsEndOfThisMonth" },
    // ── 5 กรณีขอบ ──
    { key: "fai", name: "ฝ้าย", code: "EMP-010", position: "พนักงานเสิร์ฟ", department: "หน้าร้าน", unit: "huahin", employmentType: "DAILY", payType: "DAILY", rateSatang: B(400), baseSalarySatang: B(8_800), startDaysAgo: 217, end: "lastDayOfMonthBeforePaidRun", active: false, pin: null, linkedUser: null, shift: null, origin: "edge", flags: ["leaver", "excluded-ENDED_BEFORE"] },
    { key: "om", name: "ออม", code: "EMP-013", position: "พนักงานเสิร์ฟ", department: "หน้าร้าน", unit: "suanphueng", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(12_000), startDaysAgo: 0, start: "firstOfNextMonth", active: true, pin: "4113", linkedUser: null, shift: null, origin: "edge", flags: ["future-starter", "excluded-STARTS_AFTER"] },
    { key: "kong", name: "ก้อง", code: "EMP-011", position: "พ่อครัว", department: "ครัว", unit: "suanphueng", employmentType: "PROBATION", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(18_000), startDaysAgo: 45, active: true, pin: "4111", linkedUser: null, shift: null, origin: "edge", flags: ["probation-hire-45-days"] },
    { key: "pui", name: "ปุ้ย", code: "EMP-008", position: "หัวหน้าบาริสต้า", department: "บาร์", unit: "suanphueng", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(22_000), startDaysAgo: 700, active: true, pin: null, linkedUser: null, shift: null, origin: "edge", flags: ["no-pin"] },
    { key: "koy", name: "ก้อย", code: "EMP-014", position: "ธุรการ/บุคคล", department: "สำนักงาน", unit: "suanphueng", employmentType: "FULL_TIME", payType: "MONTHLY", rateSatang: null, baseSalarySatang: B(20_000), startDaysAgo: 500, active: true, pin: "4114", linkedUser: "payroll", shift: null, origin: "edge", flags: ["linked-staff-user", "payroll-viewer-own-row"] },
  ] as readonly HqcEmployee[],
  /**
   * ผู้ใช้ 6 บทบาท (passwordless — สร้าง User + Membership ตรงแบบ seed-crm-qc / seed-member-qc · ล็อกอินด้วย OTP)
   * keys = permissions ของ Membership (OWNER/MANAGER ผ่าน evaluate ทุกคีย์อยู่แล้ว ⇒ {})
   */
  users: {
    owner: { email: "hr-qc-owner@shark.local", name: "เจ้าของร้าน (QC HR)", role: "OWNER", keys: {} },
    manager: { email: "hr-qc-manager@shark.local", name: "ผู้จัดการร้าน (QC HR)", role: "MANAGER", keys: {} },
    payroll: {
      email: "hr-qc-payroll@shark.local",
      name: "ก้อย ฝ่ายบุคคล (QC HR)",
      role: "STAFF",
      keys: {
        "hr.payroll.read": true,
        "hr.payroll.create": true,
        "hr.payroll.approve": true,
        "hr.payroll.pay": true,
        "hr.payroll.reverse": true,
        "hr.payadjust.request": true,
        "hr.payadjust.approve": true,
        "hr.payadjust.reject": true,
      },
    },
    staff: { email: "hr-qc-staff@shark.local", name: "น้ำฝน (QC HR)", role: "STAFF", keys: { "hr.leave.request": true } },
    kiosk: { email: "hr-qc-kiosk@shark.local", name: "แท็บเล็ตหน้าร้าน (QC HR)", role: "STAFF", keys: { "hr.attendance.clock": true } },
    member: { email: "hr-qc-member@shark.local", name: "สมาชิกในร้าน (QC HR)", role: "STAFF", keys: {} },
  } as Record<HqcUserKey, { email: string; name: string; role: "OWNER" | "MANAGER" | "STAFF"; keys: Record<string, boolean> }>,
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
    startOf: (e: HqcEmployee) => (e.start === "firstOfNextMonth" ? firstDayOf(addMonths(thisMonth, 1)) : addDays(today, -e.startDaysAgo)),
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
