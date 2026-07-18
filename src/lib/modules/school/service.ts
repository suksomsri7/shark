// School/คอร์สเรียน (WO-0051) — คอร์ส·รอบเรียน·สมัคร·ชำระ→เส้นเงิน C-2·เช็คชื่อ
//
// ctx = { tenantId, unitId } — ทุก query ผ่าน tenantDb(ctx) (defense-in-depth ชั้น 2) · unit type SCHOOL
// เงินต้องเข้าเสมอ: รับชำระค่าเรียน = เปิดบิลผ่าน POS (บังคับ · ไม่มี POS = โยน + revert)
// มีระบบสมาชิก (MEMBER) → ผูกนักเรียนเข้า Customer จากเบอร์ · ไม่มี = customerId null (ไม่บังคับ)
import { prisma, tenantDb } from "@/lib/core/db";
import * as pos from "@/lib/modules/pos/service";
import * as member from "@/lib/modules/member/service";
import { listSystems } from "@/lib/modules/system/service";
import { promptpayPayload } from "@/lib/payment/promptpay";

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

export async function enroll(ctx: SchoolCtx, input: EnrollInput): Promise<{ id: string; publicToken: string | null }> {
  const db = tenantDb(ctx);
  // ตรวจรอบเรียนก่อน (นอก tx) — ไม่พบ → โยนก่อน ไม่แตะระบบสมาชิก
  const clPre = await db.schoolClass.findFirst({ where: { id: input.classId } });
  if (!clPre) throw new Error("ไม่พบรอบเรียน");

  const name = input.studentName?.trim();
  if (!name) throw new Error("กรุณาระบุชื่อนักเรียน");

  // มีระบบสมาชิก → หา/สร้าง Customer จากเบอร์ แล้วผูก customerId · ไม่มี = null (นอก tx — mirror ไม่ผูก tx สมาชิก)
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

  // กันสมัครเกิน capacity แบบ race-safe (mirror rental FOR UPDATE / ticket atomic):
  //   ล็อกแถวรอบเรียน (pessimistic row-lock) ต้น tx → 2 request สมัครรอบเดียวกันพร้อมกัน serialize
  //   → count ภายใน tx เดียวกันเห็น enrollment ที่ commit แล้วของคนแรก → คนที่เกินโดน reject
  //   (ตาราง "SchoolClass" — schema ไม่มี @@map)
  return prisma.$transaction(async (tx) => {
    const cl = await tx.schoolClass.findFirst({
      where: { id: input.classId, tenantId: ctx.tenantId, unitId: ctx.unitId },
      include: { course: true },
    });
    if (!cl) throw new Error("ไม่พบรอบเรียน");

    await tx.$queryRaw`SELECT id FROM "SchoolClass" WHERE id = ${input.classId} FOR UPDATE`;

    // capacity เต็ม (นับที่ยัง active = ENROLLED + PAID) → คนถัดไปสมัครไม่ได้
    if (cl.capacity !== null) {
      const taken = await tx.schoolEnrollment.count({
        where: { tenantId: ctx.tenantId, unitId: ctx.unitId, classId: input.classId, status: { in: ["ENROLLED", "PAID"] } },
      });
      if (taken >= cl.capacity) throw new Error("รอบเรียนนี้เต็มแล้ว");
    }

    const en = await tx.schoolEnrollment.create({
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
    return { id: en.id, publicToken: en.publicToken };
  });
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

// ── คืนเงินค่าเรียน (PAID → REFUNDED) — void PosSale + คืนที่นั่ง (ห้ามลบ record) ──
// mirror ของ shop.refundOrder / hotel.refundStay:
//   1) claim อะตอมมิก PAID→REFUNDED (idempotent — คืนซ้ำ/สถานะอื่น → ok:false ไม่กลับเส้นเงินซ้ำ)
//   2) กลับเส้นเงิน pos.voidSale (คืนบัญชี+แต้ม) "นอก tx" — voidSale เปิด tx เอง (ไม่ nested) · เฉพาะบิลที่ยัง PAID
//   3) ที่นั่ง: คืนอัตโนมัติ — capacity นับเฉพาะ ENROLLED+PAID → REFUNDED ไม่ถูกนับ (คนใหม่สมัครแทนได้)
// cross-tenant: tenantDb(ctx) กรอง tenantId → claim ไม่ match → ok:false (record ร้านอื่นไม่ถูกแตะ)
export async function refundEnrollment(
  ctx: SchoolCtx,
  enrollmentId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = tenantDb(ctx);

  // 1) claim อะตอมมิก: PAID → REFUNDED
  const claim = await db.schoolEnrollment.updateMany({
    where: { id: enrollmentId, status: "PAID" },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
  if (claim.count === 0) {
    const cur = await db.schoolEnrollment.findFirst({ where: { id: enrollmentId } });
    if (!cur) return { ok: false, reason: "ไม่พบการสมัคร" };
    if (cur.status === "REFUNDED") return { ok: false, reason: "การสมัครนี้คืนเงินแล้ว" };
    if (cur.status === "ENROLLED") return { ok: false, reason: "การสมัครนี้ยังไม่ได้ชำระเงิน (ใช้ปุ่มยกเลิกแทน)" };
    return { ok: false, reason: "คืนเงินได้เฉพาะการสมัครที่ชำระเงินแล้ว" };
  }

  const en = await db.schoolEnrollment.findFirst({ where: { id: enrollmentId } });
  if (!en) return { ok: false, reason: "ไม่พบการสมัคร" };

  // 2) กลับเส้นเงิน — void PosSale (เฉพาะบิลที่ยัง PAID — กัน void ซ้ำหลัง retry)
  if (en.posSaleId) {
    const sale = await prisma.posSale.findFirst({ where: { id: en.posSaleId, tenantId: ctx.tenantId } });
    if (sale && sale.status === "PAID") {
      await pos.voidSale(ctx.tenantId, ctx.unitId, en.posSaleId);
    }
  }

  // 3) ที่นั่งคืนเองผ่านการเปลี่ยนสถานะเป็น REFUNDED (ไม่มี side effect เพิ่ม)
  return { ok: true };
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

// ───────────────────────── Public storefront (ผู้ปกครองสมัครเรียน+จ่ายค่าเรียนเอง · no-auth) ─────────────────────────
// resolve unit จาก slug (public) → tenantId+unitId · unit ต้อง ACTIVE + type=SCHOOL (กันสวมร้าน/ประเภทผิด)
// mirror resolveRentalUnit / resolveUnit(ticket)
export async function resolveSchoolUnit(tenantSlug: string, unitSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const unit = await prisma.businessUnit.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: unitSlug } },
  });
  if (!unit || unit.status !== "ACTIVE" || unit.type !== "SCHOOL") return null;
  return { tenant, unit };
}

// รอบเรียนที่เปิดรับสมัคร (คอร์ส active) + ค่าเรียน + ที่ว่างคงเหลือ (สำหรับหน้าผู้ปกครอง)
// remaining: capacity - (ENROLLED+PAID) · capacity null = ไม่จำกัด (remaining=null) · full = ไม่มีที่ว่าง
export type PublicSchoolClass = {
  id: string;
  courseName: string;
  className: string;
  description: string | null;
  priceSatang: number;
  startDate: Date | null;
  remaining: number | null; // null = ไม่จำกัด
  full: boolean;
};

export async function listPublicClasses(ctx: SchoolCtx): Promise<PublicSchoolClass[]> {
  const db = tenantDb(ctx);
  const classes = await db.schoolClass.findMany({
    where: { course: { active: true } },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    include: { course: true },
    take: 100,
  });
  if (classes.length === 0) return [];
  // นับผู้สมัคร active ต่อรอบ (query เดียว) → คำนวณที่ว่างใน memory
  const counts = await db.schoolEnrollment.groupBy({
    by: ["classId"],
    where: { classId: { in: classes.map((c) => c.id) }, status: { in: ["ENROLLED", "PAID"] } },
    _count: { _all: true },
  });
  const takenBy = new Map(counts.map((c) => [c.classId, c._count._all]));
  return classes.map((cl) => {
    const taken = takenBy.get(cl.id) ?? 0;
    const remaining = cl.capacity === null ? null : Math.max(0, cl.capacity - taken);
    return {
      id: cl.id,
      courseName: cl.course.name,
      className: cl.name,
      description: cl.course.description,
      priceSatang: cl.course.priceSatang,
      startDate: cl.startDate,
      remaining,
      full: remaining !== null && remaining < 1,
    };
  });
}

// สถานะการสมัคร + ค่าเรียน (public จาก publicToken) — กัน cross-tenant: token ต้องเป็นของ unit นี้ (กัน leak PII/ข้อมูลร้านอื่น)
// mirror getPublicOrder / getPublicBooking
export async function getPublicEnrollment(unitId: string, publicToken: string) {
  const token = (publicToken ?? "").trim();
  if (!token) return null;
  const en = await prisma.schoolEnrollment.findUnique({
    where: { publicToken: token },
    include: { class: { include: { course: { select: { name: true } } } } },
  });
  if (!en || en.unitId !== unitId) return null;
  return en;
}

// PromptPay payload สำหรับจ่ายค่าเรียนการสมัครนี้ (ยอด = priceSatang) — ร้านยังไม่ตั้งเลข/ยอด 0 → null
// mirror promptpayForOrder
export async function promptpayForEnrollment(
  ctx: SchoolCtx,
  enrollmentId: string,
): Promise<{ payload: string; displayName: string } | null> {
  const db = tenantDb(ctx);
  const en = await db.schoolEnrollment.findFirst({ where: { id: enrollmentId } });
  if (!en || en.priceSatang <= 0) return null;
  const profile = await db.paymentProfile.findFirst({ where: {} });
  if (!profile?.promptpayId) return null;
  const payload = promptpayPayload({ id: profile.promptpayId, amountSatang: en.priceSatang });
  return { payload, displayName: profile.displayName ?? "" };
}
