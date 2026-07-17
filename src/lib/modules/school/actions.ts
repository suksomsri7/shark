"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import * as school from "./service";

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

function ctxOf(auth: UnitAuth, unitId: string) {
  return { tenantId: auth.active.tenantId, unitId };
}

function assertSchoolCan(auth: UnitAuth, unitId: string, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "school", action, unitId },
  );
}

// ───────────────────────── คอร์ส ─────────────────────────
const courseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  priceBaht: z.coerce.number().min(0).max(10_000_000),
  description: z.string().trim().max(500).optional(),
});

export async function createCourseAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertSchoolCan(auth, unit.id, "school.course.create");
  const p = courseSchema.safeParse({
    name: formData.get("name"),
    priceBaht: formData.get("priceBaht"),
    description: formData.get("description") || undefined,
  });
  if (!p.success) return;
  await school.createCourse(ctxOf(auth, unit.id), {
    name: p.data.name,
    priceSatang: Math.round(p.data.priceBaht * 100),
    description: p.data.description,
  });
  revalidatePath(`/app/u/${unitSlug}/school`);
}

export async function toggleCourseAction(unitSlug: string, courseId: string, active: boolean) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertSchoolCan(auth, unit.id, "school.course.update");
  await school.updateCourse(ctxOf(auth, unit.id), courseId, { active });
  revalidatePath(`/app/u/${unitSlug}/school`);
}

// ───────────────────────── รอบเรียน ─────────────────────────
const classSchema = z.object({
  courseId: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  startDate: z.string().trim().optional(),
  capacity: z.coerce.number().int().min(0).max(100_000).optional(),
});

export async function createClassAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertSchoolCan(auth, unit.id, "school.class.create");
  const p = classSchema.safeParse({
    courseId: formData.get("courseId"),
    name: formData.get("name"),
    startDate: formData.get("startDate") || undefined,
    capacity: formData.get("capacity") || undefined,
  });
  if (!p.success) return;
  await school.createClass(ctxOf(auth, unit.id), {
    courseId: p.data.courseId,
    name: p.data.name,
    startDate: p.data.startDate ? new Date(p.data.startDate) : null,
    capacity: p.data.capacity ?? null,
  });
  revalidatePath(`/app/u/${unitSlug}/school`);
}

// ───────────────────────── สมัคร / ชำระ / ยกเลิก ─────────────────────────
const enrollSchema = z.object({
  classId: z.string().trim().min(1).max(40),
  studentName: z.string().trim().min(1).max(120),
  studentPhone: z.string().trim().max(30).optional(),
});

export async function enrollAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertSchoolCan(auth, unit.id, "school.enrollment.create");
  const p = enrollSchema.safeParse({
    classId: formData.get("classId"),
    studentName: formData.get("studentName"),
    studentPhone: formData.get("studentPhone") || undefined,
  });
  if (!p.success) return;
  try {
    await school.enroll(ctxOf(auth, unit.id), {
      classId: p.data.classId,
      studentName: p.data.studentName,
      studentPhone: p.data.studentPhone ?? "",
    });
  } catch {
    // เต็ม/ข้อมูลไม่ถูกต้อง → กลับหน้าเดิม (validation ชั้น service)
  }
  revalidatePath(`/app/u/${unitSlug}/school`);
}

export async function markPaidAction(unitSlug: string, enrollmentId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertSchoolCan(auth, unit.id, "school.enrollment.pay");
  try {
    await school.markPaid(ctxOf(auth, unit.id), enrollmentId);
  } catch {
    // ไม่มี POS → กลับหน้าเดิม
  }
  revalidatePath(`/app/u/${unitSlug}/school`);
}

export async function cancelEnrollmentAction(unitSlug: string, enrollmentId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertSchoolCan(auth, unit.id, "school.enrollment.cancel");
  await school.cancelEnrollment(ctxOf(auth, unit.id), enrollmentId);
  revalidatePath(`/app/u/${unitSlug}/school`);
}

// คืนเงินค่าเรียนหลังชำระ — void PosSale + คืนที่นั่ง · error inline ผ่าน ?err=
export async function refundEnrollmentAction(unitSlug: string, enrollmentId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertSchoolCan(auth, unit.id, "school.enrollment.refund");
  const res = await school.refundEnrollment(ctxOf(auth, unit.id), enrollmentId);
  revalidatePath(`/app/u/${unitSlug}/school`);
  if (!res.ok) {
    redirect(`/app/u/${unitSlug}/school?err=${encodeURIComponent(res.reason ?? "คืนเงินไม่สำเร็จ")}`);
  }
}

// ───────────────────────── เช็คชื่อ ─────────────────────────
export async function checkInAction(
  unitSlug: string,
  enrollmentId: string,
  dateStr: string,
  present: boolean,
) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertSchoolCan(auth, unit.id, "school.attendance.mark");
  await school.checkIn(ctxOf(auth, unit.id), enrollmentId, new Date(dateStr), present);
  revalidatePath(`/app/u/${unitSlug}/school`);
}
