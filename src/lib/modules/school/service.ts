// School/คอร์สเรียน (WO-0051) — คอร์ส·รอบเรียน·สมัคร·ชำระ→เส้นเงิน C-2·เช็คชื่อ
//
// ctx = { tenantId, unitId } — ทุก query ผ่าน tenantDb(ctx) (defense-in-depth ชั้น 2) · unit type SCHOOL
// เงินต้องเข้าเสมอ: รับชำระค่าเรียน = เปิดบิลผ่าน POS (บังคับ · ไม่มี POS = โยนก่อนแตะสถานะ — CRM C2.9)
// มีระบบสมาชิก (MEMBER) → ผูกนักเรียนเข้า Customer จากเบอร์ · ไม่มี = customerId null (ไม่บังคับ)
import { prisma, tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox"; // CRM C2.9 ▸ เหตุการณ์ "ชำระค่าเรียนแล้ว" ใน tx เดียวกับสถานะ ◂
import * as pos from "@/lib/modules/pos/service";
import * as member from "@/lib/modules/member/service";
import { normalizePartyPhone, safeFindOrCreate } from "@/lib/modules/party";
import { listSystems } from "@/lib/modules/system/service";
import { promptpayPayload } from "@/lib/payment/promptpay";
import { resolvePublicUnit } from "@/lib/core/storefront";

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
  const res = await prisma.$transaction(async (tx) => {
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
  await linkPartyAfterCommit(ctx.tenantId, res.id, name, phone); // CRM v2 C1.1 (C11)
  return res;
}

// ── รับชำระค่าเรียน (ENROLLED → PAID) — เส้นเงิน C-2 ผ่าน pos.createSale ──
export async function markPaid(
  ctx: SchoolCtx,
  enrollmentId: string,
): Promise<{ ok: boolean; posSaleId?: string }> {
  const db = tenantDb(ctx);

  const en = await db.schoolEnrollment.findFirst({ where: { id: enrollmentId }, include: { class: { include: { course: true } } } });
  if (!en || en.status !== "ENROLLED") return { ok: false };

  // CRM C2.9 ▸ (มติผู้คุมงาน · ใบ C2.9) ด่าน POS ต้องอยู่ **ก่อน** การ claim:
  //   เดิม claim (ENROLLED→PAID) + ยิง event ก่อน แล้วจึงหา AppSystem type POS · ไม่มี POS = revert + โยน ⇒
  //   การรับชำระที่ถูกยกเลิกไปแล้วยังทิ้ง event ค้างไว้ (และกิจกรรม VISIT ใน CRM หลังคิวระบาย) = ไทม์ไลน์โกหกว่าจ่ายแล้ว
  //   ย้ายขึ้นมาเป็น pre-check ก่อนเขียนอะไรทั้งสิ้น ⇒ ไม่มี POS = โยนโดยไม่แตะสถานะ ไม่มี event ไม่มีกิจกรรม
  //   ข้อความไทยเดิมทุกตัวอักษร · ลำดับเดิมคงไว้: สถานะไม่ใช่ ENROLLED → ok:false มาก่อนด่าน POS
  const posSystems = await listSystems(ctx.tenantId, "POS");
  const posSys = posSystems[0];
  if (!posSys) throw new Error("เปิดระบบขาย (POS) ก่อนรับชำระค่าเรียน");

  // 1) claim อะตอมมิก: ENROLLED → PAID (แพ้แข่ง/จ่ายแล้ว/ยกเลิก → ok:false ไม่ทำเส้นเงินซ้ำ)
  //   (มติ C11 · ใบ C2.9 · R-B: โมดูลเรียนยิงเหตุการณ์เดียว = ตอน "ชำระค่าเรียนแล้ว" ไม่มี `school.completed`)
  //   ห่อ **เฉพาะ** การ claim + `emitOutbox(tx, …)` ไว้ใน transaction เดียวกัน ⇒ รับเงินสำเร็จ = มี event เสมอ ·
  //   event เขียนไม่ได้ = การรับชำระถูกยกเลิกทั้งก้อน (ยังเป็น ENROLLED) · `pos.createSale` ยังอยู่นอก tx เหมือนเดิม
  //   payload = id ล้วน + ราคาสตางค์ที่ snapshot ไว้ (X8: ไม่มีชื่อ/เบอร์นักเรียน)
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.schoolEnrollment.updateMany({
      where: { id: enrollmentId, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "ENROLLED" },
      data: { status: "PAID", paidAt: new Date() },
    });
    if (claim.count === 0) return false;
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      type: "school.enrolled",
      idempotencyKey: `school.enrolled#${enrollmentId}`,
      payload: { enrollmentId, unitId: ctx.unitId, partyId: en.partyId, classId: en.classId, priceSatang: en.priceSatang },
    });
    return true;
  });
  if (!claimed) return { ok: false };
  // ◂ CRM C2.9

  // 2) ด่าน POS ผ่านแล้วตั้งแต่ก่อน claim (บล็อก CRM C2.9 ด้านบน) — ไม่มีการ revert สถานะหลังยิง event อีกต่อไป

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
  // คิวรีเดียว (เดิมยิง tenant แล้ว unit เรียงกัน = 2 round-trip ไปสิงคโปร์)
  return resolvePublicUnit(tenantSlug, unitSlug, "SCHOOL");
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

// ───────── CRM v2 ใบ C1.1 (C11) — ผูก Party กลางให้ SchoolEnrollment ─────────
// 🔴 เรียก "หลัง commit" เท่านั้น: รายการที่ล้ม (เต็ม/ชน/ไม่พบ) ต้องไม่ทิ้ง Party ของคนที่ไม่ได้เป็นลูกค้า (PDPA · เก็บเท่าที่จำเป็น)
//    และไม่ถือ connection ที่สองขณะ transaction ธุรกิจถือ lock อยู่
// 🔴 กุญแจต้องเชื่อถือได้: เบอร์ normalize ≥ 9 หลัก — ไม่งั้นไม่ผูก (party.findOrCreate สร้างใหม่ทุกครั้งเมื่อเบอร์ < 8 หลัก ⇒ Party ขยะ)
// 🔴 ไม่มีวัน throw เข้าหาผู้เรียก · ล้ม = ปล่อย partyId ว่างให้ backfill party-links เก็บตก
// AUDIT-CLASS X8: log แค่ชื่อตาราง + tenant ไม่มีเบอร์/อีเมล/ชื่อ
async function linkPartyAfterCommit(tenantId: string, id: string, name: string | null | undefined, phone: string | null | undefined): Promise<void> {
  try {
    const phoneOk = normalizePartyPhone(phone).length >= 9;
    if (!phoneOk) return;
    const partyId = await safeFindOrCreate(tenantId, { name: name?.trim() || "ลูกค้าไม่ระบุชื่อ", phone: phoneOk ? phone : null });
    if (partyId) await prisma.schoolEnrollment.updateMany({ where: { id, tenantId, partyId: null }, data: { partyId } });
    else console.warn(`[party-link] SchoolEnrollment tenant=${tenantId}: ไม่ได้ partyId — ปล่อยว่าง`);
  } catch {
    console.warn(`[party-link] SchoolEnrollment tenant=${tenantId}: ผูก Party ไม่สำเร็จ — ปล่อยว่าง`);
  }
}

// CRM C2.4 ▸ facade อ่านอย่างเดียว "รอบเรียนที่ Party นี้สมัครไว้" ให้ปฏิทิน CRM (มติผู้คุมงาน C2.4 ข้อ 8 · เส้น crm→school)
//   🔴 นับเฉพาะ `ENROLLED` / `PAID` (ยกเลิก/คืนเงินไม่ใช่นัดที่ยังอยู่) · เวลาของแถว = `SchoolClass.startDate`
//      (รอบที่ยังไม่กำหนดวันเริ่ม = ไม่มีวันในปฏิทิน ⇒ ข้าม)
//   🔴 AUDIT-CLASS X8: คืนแค่ id · เวลา · ชื่อคอร์ส+ชื่อรอบ · สถานะ — **ไม่มี** `studentName` / `studentPhone` / ราคา
//   🔴 AUDIT-CLASS X1: ผูก `tenantId` ของผู้เรียก + กรองสาขาตามขอบเขตของผู้ดู
//   รูปข้อมูลตรงกับ `PartyAppointment` ใน `src/lib/modules/crm/activities-shared.ts` (ประกาศซ้ำ — school ห้าม import จาก crm)
export type PartyAppointmentRow = {
  source: "SCHOOL";
  id: string;
  partyId: string;
  unitId: string;
  startAt: Date;
  endAt: Date | null;
  title: string;
  status: string;
};

/**
 * ใบ C2.4 รอบ 2 (F5): `partyIds` รับ `null` = **ทุก Party ในหน้าต่างเวลานี้** (ผู้เรียกกรองด้วยการมองเห็นทีหลัง)
 * 🔴 ทำไมต้องมีทาง `null`: ของเดิมผู้เรียกต้องส่งรายชื่อ Party มาก่อน ⇒ ปฏิทิน CRM ต้องหยิบผู้ติดต่อ 1,000 คนแรกมาทำรายชื่อ
 *    ร้านที่มีลูกค้า 5,000 คนจะไม่เห็นนัดของลูกค้าคนที่ 1,001 ขึ้นไป **เงียบ ๆ** (นัดพรุ่งนี้หายจากปฏิทิน)
 *    ⇒ ทางที่ถูกคือ "ถามช่วงเวลาก่อน แล้วค่อยตัดด้วยการมองเห็น" — เพดานอยู่ที่จำนวนแถวที่ตอบ (`opts.take`) ไม่ใช่จำนวนลูกค้า
 * `partyIds = []` (อาร์เรย์ว่าง) = ไม่มีอะไรให้ถาม ⇒ คืน [] เหมือนเดิม
 */
export async function appointmentsByParty(
  tenantId: string,
  partyIds: string[] | null | undefined,
  range: { from: Date; to: Date },
  opts?: { unitIds?: string[] | "*"; take?: number },
): Promise<PartyAppointmentRow[]> {
  const all = partyIds === null || partyIds === undefined;
  const ids = all ? [] : [...new Set(partyIds.filter((x): x is string => typeof x === "string" && !!x))];
  if (!tenantId || (!all && ids.length === 0)) return [];
  const units = opts?.unitIds;
  if (Array.isArray(units) && units.length === 0) return [];
  const take = Math.min(Math.max(Math.round(Number(opts?.take ?? 500) || 500), 1), 5_000);
  const rows = await prisma.schoolEnrollment.findMany({
    where: {
      tenantId,
      ...(all ? { partyId: { not: null } } : { partyId: { in: ids } }),
      status: { in: ["ENROLLED", "PAID"] },
      class: { startDate: { gte: range.from, lt: range.to } },
      ...(Array.isArray(units) ? { unitId: { in: units } } : {}),
    },
    select: { id: true, unitId: true, partyId: true, status: true, class: { select: { name: true, startDate: true, course: { select: { name: true } } } } },
    orderBy: [{ id: "asc" }],
    take,
  });
  return rows
    .filter((r): r is typeof r & { partyId: string } => !!r.partyId && !!r.class?.startDate)
    .map((r) => ({
      source: "SCHOOL" as const,
      id: r.id,
      partyId: r.partyId,
      unitId: r.unitId,
      startAt: r.class.startDate as Date,
      endAt: null,
      title: [r.class.course?.name?.trim(), r.class.name?.trim()].filter(Boolean).join(" · ") || "รอบเรียน",
      status: r.status,
    }))
    .sort((a, b) => (a.startAt.getTime() === b.startAt.getTime() ? a.id.localeCompare(b.id) : a.startAt.getTime() - b.startAt.getTime()));
}
// ◂ CRM C2.4
