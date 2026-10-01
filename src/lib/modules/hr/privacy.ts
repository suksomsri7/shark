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

/**
 * คำตอบของการยื่นรายการเพิ่ม/หักเงิน — ผู้ยื่นที่ไม่ใช่ผู้ดูเงินเดือนต้องไม่รู้ยอดที่ระบบคิดจากเงินเดือน (OT)
 * และไม่รู้ว่าพนักงานคนนั้นมีโปรไฟล์เงินเดือนหรือไม่ · ผู้ดูเงินเดือน = คำตอบเดิมทุกตัวอักษร
 */
export function adjustmentReplyForViewer(
  payrollViewer: boolean,
  res: { ok: boolean; reason?: string; amountSatang?: number },
): { status: "ok" | "error"; message: string } {
  if (payrollViewer) {
    return res.ok
      ? { status: "ok", message: `ยื่นแล้ว ${((res.amountSatang ?? 0) / 100).toLocaleString("th-TH")} บาท — รออนุมัติ` }
      : { status: "error", message: res.reason ?? "ยื่นไม่ได้" };
  }
  if (res.ok) return { status: "ok", message: "ยื่นแล้ว — รออนุมัติ (ผู้ดูแลเงินเดือนจะเห็นยอดที่คำนวณ)" };
  // เหตุผลที่ขึ้นกับข้อมูลเงินเดือน → ข้อความกลาง · เหตุผลจากข้อมูลที่ผู้ยื่นกรอกเอง (งวด/ยอด/ชนิด) แสดงตามเดิม
  if (/เงินเดือน/.test(res.reason ?? "")) {
    return { status: "error", message: "ยื่นรายการนี้ไม่ได้ในตอนนี้ — กรุณาแจ้งผู้ดูแลงานบุคคลให้ตรวจข้อมูลพนักงานคนนี้" };
  }
  return { status: "error", message: res.reason ?? "ยื่นไม่ได้" };
}
