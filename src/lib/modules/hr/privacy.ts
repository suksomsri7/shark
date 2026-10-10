// HF-HR-0 (1 ต.ค. 2026) — ด่านสิทธิ์ + ตัวสร้าง DTO ของข้อมูลพนักงาน/สลิป/ใบลา (server เท่านั้น)
// เหตุ: หน้าโปรไฟล์เคยส่ง "แถว HrEmployee ทั้งแถว" (เลขบัตร · บัญชี · PIN · URL เอกสาร) ให้ client component
//       และหน้าสลิปเปิดได้ทุกคนในร้านที่รู้ id — ทุกหน้าที่แสดงข้อมูลพวกนี้ต้องผ่านไฟล์นี้ (oracle qc-hf-hr-privacy)
// กติกา:
//   • ผู้ดูเงินเดือน = OWNER หรือ hr.payroll.read (canViewPayroll — แคบกว่า evaluate โดยตั้งใจ · MANAGER ไม่ผ่านเอง)
//   • ตัวพนักงานเอง = HrEmployee.linkedUserId ตรงกับบัญชีผู้ดู (ผูกโดย staff/service เท่านั้น)
//   • ไม่ผ่านด่าน = คืน null ⇒ หน้าเรียก notFound() (404 ไม่ใช่ 403 — ไม่บอกว่ามีข้อมูลอยู่)
import { tenantDb } from "@/lib/core/db";
import { canViewPayroll, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { listLeaves, pendingLeaves, type Ctx, type EmployeeProfileInput } from "./service";
import { payslipData } from "./payroll";
import type { EmployeeDocDto, EmployeeProfileDto, LeaveItemDto } from "./privacy-shared";

export type HrViewer = MembershipCtx & { userId: string };

/** แปลงผลของ requireTenant() เป็นผู้ดู (รับแบบโครงสร้าง — ไฟล์นี้ไม่ import context เพื่อให้ oracle เรียกได้ตรง) */
export function hrViewerOf(auth: {
  user: { id: string };
  active: { role: MembershipCtx["role"]; unitAccess: unknown; permissions: unknown };
}): HrViewer {
  return {
    role: auth.active.role,
    unitAccess: (Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess : []) as string[],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.user.id,
  };
}

/** สิทธิ์อ่านของผู้ดูในระบบ HR — จุดตัดสินเดียวของหน้าจอ */
export function hrAccessOf(v: HrViewer): { seeSensitive: boolean; readLeave: boolean; openProfile: boolean } {
  const can = (action: string) => evaluate(v, { module: "hr", action });
  const seeSensitive = canViewPayroll(v);
  return {
    seeSensitive,
    readLeave: can("hr.leave.read"),
    // ผู้แก้ทะเบียน · ผู้อ่านข้อมูล HR (คีย์เดียวกับลิงก์การ์ดพนักงานบนบอร์ดงาน) · ผู้ดูเงินเดือน
    openProfile: can("hr.employee.create") || can("hr.leave.read") || seeSensitive,
  };
}

/** โปรไฟล์พนักงาน 1 คนในรูป DTO — null = ไม่มีสิทธิ์/ไม่พบ/ข้ามร้าน */
export async function loadEmployeeProfileForViewer(
  ctx: Ctx,
  v: HrViewer,
  employeeId: string,
): Promise<{ profile: EmployeeProfileDto; docs: EmployeeDocDto[]; canSeeSensitive: boolean } | null> {
  const access = hrAccessOf(v);
  if (!access.openProfile || !employeeId) return null;
  const db = tenantDb(ctx);
  const row = await db.hrEmployee.findFirst({ where: { id: employeeId } });
  if (!row) return null;
  // สร้างทีละช่องจาก whitelist (privacy-shared) — ห้าม spread แถวดิบ
  const profile: EmployeeProfileDto = {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    code: row.code,
    phone: row.phone,
    email: row.email,
    gender: row.gender,
    birthDate: row.birthDate,
    maritalStatus: row.maritalStatus,
    position: row.position,
    department: row.department,
    employmentType: row.employmentType,
    startDate: row.startDate,
    endDate: row.endDate,
    addressLine: row.addressLine,
    subdistrict: row.subdistrict,
    district: row.district,
    province: row.province,
    postcode: row.postcode,
    emergencyName: row.emergencyName,
    emergencyPhone: row.emergencyPhone,
    emergencyRelation: row.emergencyRelation,
    note: row.note,
    active: row.active,
    hasPin: !!row.pinCode,
  };
  if (access.seeSensitive) {
    profile.nationalId = row.nationalId;
    profile.ssoNumber = row.ssoNumber;
    profile.houseRegAddress = row.houseRegAddress;
    profile.bankName = row.bankName;
    profile.bankAccountNo = row.bankAccountNo;
    profile.bankAccountName = row.bankAccountName;
  }
  // เอกสารแนบ (สำเนาบัตร/ทะเบียนบ้าน) = อ่อนไหวทั้งชุด — ไม่มีสิทธิ์ = ไม่โหลดเลย
  const docs: EmployeeDocDto[] = access.seeSensitive
    ? (
        await db.hrEmployeeDoc.findMany({
          where: { employeeId: row.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, kind: true, title: true, url: true, note: true },
        })
      ).map((d) => ({ id: d.id, kind: String(d.kind), title: d.title, url: d.url, note: d.note }))
    : [];
  return { profile, docs, canSeeSensitive: access.seeSensitive };
}

/**
 * สลิปเงินเดือน — ผู้ดูเงินเดือนเห็นทุกคน · ตัวพนักงานเองเห็นเฉพาะของตัวเองในรอบที่อนุมัติ/จ่ายแล้ว
 * (รอบร่างยังคำนวณใหม่ได้ ตัวเลขยังไม่ใช่ของจริง) · อื่น ๆ = null
 */
export async function loadPayslipForViewer(ctx: Ctx, v: HrViewer, runId: string, employeeId: string) {
  const payrollViewer = canViewPayroll(v);
  if (!runId || !employeeId) return null;
  if (!payrollViewer) {
    const uid = (v.userId ?? "").trim();
    if (!uid) return null;
    const own = await tenantDb(ctx).hrEmployee.findFirst({
      where: { id: employeeId, linkedUserId: uid },
      select: { id: true },
    });
    if (!own) return null;
  }
  const { run, item, employee } = await payslipData(ctx, runId, employeeId);
  if (!run || !item || !employee) return null;
  if (!payrollViewer && run.status !== "APPROVED" && run.status !== "PAID") return null;
  return { run, item, employee };
}

/** รายการใบลาของหน้าจอ — เหตุผลการลาใส่เฉพาะผู้มี hr.leave.read */
export async function leaveItemsForViewer(
  ctx: Ctx,
  v: HrViewer,
): Promise<{ pending: LeaveItemDto[]; history: LeaveItemDto[]; canReadReason: boolean }> {
  const canReadReason = hrAccessOf(v).readLeave;
  const [pending, history] = await Promise.all([pendingLeaves(ctx), listLeaves(ctx)]);
  const toItem = (l: (typeof history)[number]): LeaveItemDto => ({
    id: l.id,
    employeeName: l.employee.name,
    type: String(l.type),
    fromDate: l.fromDate,
    toDate: l.toDate,
    status: String(l.status),
    ...(canReadReason ? { reason: l.reason } : {}),
  });
  return { pending: pending.map(toItem), history: history.map(toItem), canReadReason };
}

/**
 * ฟอร์มโปรไฟล์ → input ของ saveEmployeeProfile — ช่องที่ไม่ส่งมา = ไม่แตะ
 * 🔒 ช่องอ่อนไหว 6 ช่องผ่านเฉพาะผู้ดูเงินเดือน (ไม่มีสิทธิ์ = ไม่ส่งเข้า service เลย ค่าเดิมคงอยู่ ไม่ถูกล้าง)
 */
export function employeeProfileInputFromForm(form: FormData, v: HrViewer): EmployeeProfileInput {
  const f = (k: string) => (form.has(k) ? String(form.get(k) ?? "") : undefined);
  return {
    name: f("name"),
    nickname: f("nickname"),
    code: f("code"),
    phone: f("phone"),
    email: f("email"),
    gender: (f("gender") || null) as EmployeeProfileInput["gender"],
    birthDate: f("birthDate"),
    maritalStatus: (f("maritalStatus") || null) as EmployeeProfileInput["maritalStatus"],
    position: f("position"),
    department: f("department"),
    employmentType: (f("employmentType") || null) as EmployeeProfileInput["employmentType"],
    startDate: f("startDate"),
    endDate: f("endDate"),
    addressLine: f("addressLine"),
    subdistrict: f("subdistrict"),
    district: f("district"),
    province: f("province"),
    postcode: f("postcode"),
    emergencyName: f("emergencyName"),
    emergencyPhone: f("emergencyPhone"),
    emergencyRelation: f("emergencyRelation"),
    note: f("note"),
    ...(canViewPayroll(v)
      ? {
          nationalId: f("nationalId"),
          ssoNumber: f("ssoNumber"),
          houseRegAddress: f("houseRegAddress"),
          bankName: f("bankName"),
          bankAccountNo: f("bankAccountNo"),
          bankAccountName: f("bankAccountName"),
        }
      : {}),
  };
}

// ข้อความปฏิเสธกลาง (ผู้ยื่นที่ไม่ใช่ผู้ดูเงินเดือน) — ใช้ร่วมกันเพื่อให้ทุกทางปฏิเสธได้ไบต์เดียวกัน
const ADJUST_REFUSED_GENERIC = "ยื่นรายการนี้ไม่ได้ในตอนนี้ — กรุณาแจ้งผู้ดูแลงานบุคคลให้ตรวจข้อมูลพนักงานคนนี้";
/**
 * คำตอบของการยื่นรายการเพิ่ม/หักเงิน — ผู้ยื่นที่ไม่ใช่ผู้ดูเงินเดือนต้องไม่รู้ยอดที่ระบบคิดจากเงินเดือน (OT)
 * และไม่รู้ว่าพนักงานคนนั้นมีโปรไฟล์เงินเดือนหรือไม่ · ผู้ดูเงินเดือน = คำตอบเดิมทุกตัวอักษร
 */
export function adjustmentReplyForViewer(
  payrollViewer: boolean,
  res: { ok: boolean; reason?: string; amountSatang?: number },
  // รอบ 4 (R4.6): byHours = ยื่น OT แบบกรอกชั่วโมง (ระบบคิดยอดจากเงินเดือนเอง)
  req: { byHours?: boolean } = {},
): { status: "ok" | "error"; message: string } {
  if (payrollViewer) {
    return res.ok
      ? { status: "ok", message: `ยื่นแล้ว ${((res.amountSatang ?? 0) / 100).toLocaleString("th-TH")} บาท — รออนุมัติ` }
      : { status: "error", message: res.reason ?? "ยื่นไม่ได้" };
  }
  if (res.ok) return { status: "ok", message: "ยื่นแล้ว — รออนุมัติ (ผู้ดูแลเงินเดือนจะเห็นยอดที่คำนวณ)" };
  // รอบ 4 (R4.6): OT ตามชั่วโมงที่ถูกปฏิเสธ — ทุกเหตุผล (ไม่มีเงินเดือน · ยอดปัดเป็น 0 · อื่น ๆ) ตอบข้อความเดียวกันทุกไบต์
  //   ไม่งั้นลองชั่วโมงเล็ก ๆ ไล่หาจุดที่ข้อความเปลี่ยน = เดาอัตราค่าจ้างได้
  if (req.byHours) return { status: "error", message: ADJUST_REFUSED_GENERIC };
  // เหตุผลที่ขึ้นกับข้อมูลเงินเดือน → ข้อความกลาง · เหตุผลจากข้อมูลที่ผู้ยื่นกรอกเอง (งวด/ยอด/ชนิด) แสดงตามเดิม
  if (/เงินเดือน/.test(res.reason ?? "")) {
    return { status: "error", message: ADJUST_REFUSED_GENERIC };
  }
  return { status: "error", message: res.reason ?? "ยื่นไม่ได้" };
}

// HF-HR-0 ▸ รอบ 5 (R5.2): ชั่วโมง OT ที่ผู้ยื่น "ที่ไม่ใช่ผู้ดูเงินเดือน" กรอกได้ = ทีละ 0.25 ชม. ตั้งแต่ 0.25 ถึง 744 (31 วัน × 24 ชม.)
//   นอกนั้น (เศษ · 0/ติดลบ · เกิน · ไม่ใช่ตัวเลข) ⇒ คำปฏิเสธกลางเดียวกับ R4.6 ทุกไบต์ — ผู้เรียกตรวจที่นี่ **ก่อน** อ่านอะไรที่ขึ้นกับเงินเดือน
//   ทำไม: ไล่ชั่วโมงเล็กลงเรื่อย ๆ (สำเร็จ vs "ยอดปัดเป็น 0") หรือใหญ่ขึ้นเรื่อย ๆ (สำเร็จ vs ยอดล้นช่อง Int) = หาอัตราค่าจ้างต่อชั่วโมงได้แม่น
//   บนตารางนี้: อัตรา ≥ 2 สตางค์/ชม. ทุกค่าสำเร็จ (0.25 × 2 = 0.5 → ปัดเป็น 1) · ล้นช่อง Int ต้องอัตรา > 2,886,402 สตางค์/ชม. (เงินเดือน ~4.6 ล้านบาท)
//   ผู้ดูเงินเดือน / รายการที่ไม่ใช่ OT / OT ที่ไม่กรอกชั่วโมง = ไม่ผ่านด่านนี้ (พฤติกรรมเดิม)
export const OT_HOURS_STEP = 0.25;
export const OT_HOURS_MAX = 744;
export function screenOtHoursForViewer(
  payrollViewer: boolean,
  req: { kind: string; hours?: number },
): { status: "error"; message: string } | null {
  if (payrollViewer || req.kind !== "OT" || req.hours === undefined) return null;
  const h = req.hours;
  const onGrid = Number.isFinite(h) && h >= OT_HOURS_STEP && h <= OT_HOURS_MAX && Number.isInteger(h / OT_HOURS_STEP);
  return onGrid ? null : { status: "error", message: ADJUST_REFUSED_GENERIC };
}
// ◂ HF-HR-0
