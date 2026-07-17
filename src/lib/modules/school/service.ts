// School/คอร์สเรียน (WO-0051) — คอร์ส·รอบเรียน·สมัคร·ชำระ→เส้นเงิน C-2·เช็คชื่อ
//
// ctx = { tenantId, unitId } — ทุก query ผ่าน tenantDb(ctx) (defense-in-depth ชั้น 2) · unit type SCHOOL
// เงินต้องเข้าเสมอ: รับชำระค่าเรียน = เปิดบิลผ่าน POS (บังคับ · ไม่มี POS = โยน + revert)
// มีระบบสมาชิก (MEMBER) → ผูกนักเรียนเข้า Customer จากเบอร์ · ไม่มี = customerId null (ไม่บังคับ)
import { tenantDb } from "@/lib/core/db";
import * as pos from "@/lib/modules/pos/service";
import * as member from "@/lib/modules/member/service";
import { listSystems } from "@/lib/modules/system/service";

export type SchoolCtx = { tenantId: string; unitId: string };

// ── คอร์ส (course) ─────────────────────────────────────────────
export type CreateCourseInput = {
  name: string;
  priceSatang: number;
  description?: string | null;
};

export async function createCourse(ctx: SchoolCtx, input: CreateCourseInput): Promise<{ id: string }> {
  const name = input.name?.trim();
  if (!name) throw new Error("กรุณาระบุชื่อคอร์ส");
  const priceSatang = Math.round(input.priceSatang);
  if (!Number.isFinite(priceSatang) || priceSatang < 0) throw new Error("ค่าเรียนต้องไม่ติดลบ");

  const c = await tenantDb(ctx).schoolCourse.create({
    data: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      name,
      priceSatang,
      description: input.description?.trim() || null,
    },
  });
  return { id: c.id };
}

export type UpdateCoursePatch = Partial<{
  name: string;
  priceSatang: number;
  description: string | null;
  active: boolean;
}>;

export async function updateCourse(ctx: SchoolCtx, id: string, patch: UpdateCoursePatch): Promise<{ id: string }> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name?.trim();
    if (!name) throw new Error("กรุณาระบุชื่อคอร์ส");
    data.name = name;
  }
  if (patch.priceSatang !== undefined) {
    const v = Math.round(patch.priceSatang);
    if (!Number.isFinite(v) || v < 0) throw new Error("ค่าเรียนต้องไม่ติดลบ");
    data.priceSatang = v;
  }
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.active !== undefined) data.active = patch.active;

  await tenantDb(ctx).schoolCourse.updateMany({ where: { id }, data });
  return { id };
}

export async function listCourses(ctx: SchoolCtx, opts: { activeOnly?: boolean } = {}) {
  return tenantDb(ctx).schoolCourse.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

// ── รอบเรียน (class) ───────────────────────────────────────────
export type CreateClassInput = {
  courseId: string;
  name: string;
  startDate?: Date | null;
  capacity?: number | null;
};

export async function createClass(ctx: SchoolCtx, input: CreateClassInput): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  const course = await db.schoolCourse.findFirst({ where: { id: input.courseId } });
  if (!course) throw new Error("ไม่พบคอร์ส");
  const name = input.name?.trim();
  if (!name) throw new Error("กรุณาระบุชื่อรอบเรียน");
  const capacity =
    input.capacity === undefined || input.capacity === null ? null : Math.round(input.capacity);
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) {
    throw new Error("จำนวนที่รับต้องไม่ติดลบ");
  }

  const cl = await db.schoolClass.create({
    data: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      courseId: input.courseId,
      name,
      startDate: input.startDate ?? null,
      capacity,
    },
  });
  return { id: cl.id };
}

export async function listClasses(ctx: SchoolCtx, courseId?: string) {
  return tenantDb(ctx).schoolClass.findMany({
    where: courseId ? { courseId } : {},
    orderBy: { createdAt: "desc" },
    include: { course: true, _count: { select: { enrollments: true } } },
    take: 200,
  });
}

export async function listEnrollments(ctx: SchoolCtx, classId?: string) {
  return tenantDb(ctx).schoolEnrollment.findMany({
    where: classId ? { classId } : {},
    orderBy: { createdAt: "desc" },
    include: { class: { include: { course: true } } },
    take: 500,
  });
}

// ── สมัครเรียน (enroll) ────────────────────────────────────────
export type EnrollInput = {
  classId: string;
  studentName: string;
  studentPhone: string;
};

export async function enroll(ctx: SchoolCtx, input: EnrollInput): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  const cl = await db.schoolClass.findFirst({ where: { id: input.classId }, include: { course: true } });
  if (!cl) throw new Error("ไม่พบรอบเรียน");

  const name = input.studentName?.trim();
  if (!name) throw new Error("กรุณาระบุชื่อนักเรียน");

  // capacity เต็ม (นับที่ยัง active = ENROLLED + PAID) → คนถัดไปสมัครไม่ได้
  if (cl.capacity !== null) {
    const taken = await db.schoolEnrollment.count({
      where: { classId: input.classId, status: { in: ["ENROLLED", "PAID"] } },
    });
    if (taken >= cl.capacity) throw new Error("รอบเรียนนี้เต็มแล้ว");
  }

  // มีระบบสมาชิก → หา/สร้าง Customer จากเบอร์ แล้วผูก customerId · ไม่มี = null
  let customerId: string | null = null;
  const phone = input.studentPhone?.trim() || "";
  const memberSystems = await listSystems(ctx.tenantId, "MEMBER");
  const memberSys = memberSystems[0];
  if (memberSys && phone) {
    const cust = await member.findOrCreate({
      tenantId: ctx.tenantId,
      memberSystemId: memberSys.id,
      phone,
      name,
      source: "STAFF",
    });
    customerId = cust.id;
  }

  const en = await db.schoolEnrollment.create({
    data: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      classId: input.classId,
      customerId,
      studentName: name,
      studentPhone: phone,
      priceSatang: cl.course.priceSatang, // snapshot ราคาตอนสมัคร
    },
  });
  return { id: en.id };
}

// ── รับชำระค่าเรียน (ENROLLED → PAID) — เส้นเงิน C-2 ผ่าน pos.createSale ──
export async function markPaid(
  ctx: SchoolCtx,
  enrollmentId: string,
): Promise<{ ok: boolean; posSaleId?: string }> {
  const db = tenantDb(ctx);

  const en = await db.schoolEnrollment.findFirst({ where: { id: enrollmentId }, include: { class: { include: { course: true } } } });
  if (!en || en.status !== "ENROLLED") return { ok: false };

  // 1) claim อะตอมมิก: ENROLLED → PAID (แพ้แข่ง/จ่ายแล้ว/ยกเลิก → ok:false ไม่ทำเส้นเงินซ้ำ)
  const claim = await db.schoolEnrollment.updateMany({
    where: { id: enrollmentId, status: "ENROLLED" },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (claim.count === 0) return { ok: false };

  // 2) หา AppSystem type POS ตัวแรก — ไม่มี = revert แล้วโยน (เงินเข้าไม่ได้ถ้าไม่มีจุดตัดเงิน)
  const posSystems = await listSystems(ctx.tenantId, "POS");
  const posSys = posSystems[0];
  if (!posSys) {
    await db.schoolEnrollment.updateMany({
      where: { id: enrollmentId, status: "PAID", posSaleId: null },
      data: { status: "ENROLLED", paidAt: null },
    });
    throw new Error("เปิดระบบขาย (POS) ก่อนรับชำระค่าเรียน");
  }

  // 3) เส้นเงิน C-2 — pos.createSale (idempotent ต่อ `school-<enrollmentId>`)
  const sale = await pos.createSale({
    tenantId: ctx.tenantId,
    unitId: ctx.unitId,
    systemId: posSys.id,
    sourceModule: "SCHOOL",
    sourceId: enrollmentId,
    idempotencyKey: `school-${enrollmentId}`,
    lines: [
      { name: `ค่าเรียน ${en.class.course.name} (${en.class.name})`, qty: 1, unitPriceSatang: en.priceSatang },
    ],
    payMethods: [{ type: "CASH", amountSatang: en.priceSatang }],
  });

  await db.schoolEnrollment.updateMany({ where: { id: enrollmentId }, data: { posSaleId: sale.saleId } });

  return { ok: true, posSaleId: sale.saleId };
}

// ── ยกเลิกการสมัคร (ENROLLED เท่านั้น) ──────────────────────────
export async function cancelEnrollment(ctx: SchoolCtx, id: string): Promise<boolean> {
  const res = await tenantDb(ctx).schoolEnrollment.updateMany({
    where: { id, status: "ENROLLED" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return res.count > 0;
}

// ── เช็คชื่อ (upsert-เอง: find→update/create · unique [enrollmentId,date]) ──
export async function checkIn(
  ctx: SchoolCtx,
  enrollmentId: string,
  date: Date,
  present: boolean = true,
): Promise<{ ok: boolean }> {
  const db = tenantDb(ctx);
  const existing = await db.schoolAttendance.findFirst({ where: { enrollmentId, date } });
  if (existing) {
    await db.schoolAttendance.updateMany({ where: { id: existing.id }, data: { present } });
  } else {
    await db.schoolAttendance.create({
      data: { tenantId: ctx.tenantId, enrollmentId, date, present },
    });
  }
  return { ok: true };
}

// ── ใบเช็คชื่อรายวัน — ทุกคนในรอบ (ไม่รวมยกเลิก) + สถานะเช็ควันนั้น (present|null) ──
export async function attendanceSheet(
  ctx: SchoolCtx,
  classId: string,
  date: Date,
): Promise<{ enrollmentId: string; studentName: string; present: boolean | null }[]> {
  const db = tenantDb(ctx);
  const enrollments = await db.schoolEnrollment.findMany({
    where: { classId, status: { in: ["ENROLLED", "PAID"] } },
    orderBy: { createdAt: "asc" },
  });
  const marks = await db.schoolAttendance.findMany({
    where: { date, enrollmentId: { in: enrollments.map((e) => e.id) } },
  });
  const byEnrollment = new Map(marks.map((m) => [m.enrollmentId, m.present]));
  return enrollments.map((e) => ({
    enrollmentId: e.id,
    studentName: e.studentName,
    present: byEnrollment.has(e.id) ? byEnrollment.get(e.id)! : null,
  }));
}
