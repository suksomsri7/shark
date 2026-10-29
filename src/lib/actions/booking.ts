"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { assertBookingActionAllowed } from "@/lib/modules/booking/access"; // SVC B.11 ▸ ด่านสิทธิ์ต่อ action ◂
import { tenantDb } from "@/lib/core/db";
import * as member from "@/lib/modules/member/service";
import * as pos from "@/lib/modules/pos/service";
import { CatalogError } from "@/lib/modules/pos";
import * as booking from "@/lib/modules/booking/service";
import { systemForUnit } from "@/lib/modules/system/service";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { logOps } from "@/lib/core/ops"; // POS P5.1 ▸ RC F5 (CD-P51-O10) ◂

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

// ตรวจสิทธิ์ระดับหน่วยต่อ action (SVC B.11 §7.2 · OWNER/MANAGER ผ่าน · STAFF ถือคีย์ใดคีย์หนึ่งของ action นี้)
// เรียกก่อนอ่าน/เขียนฐานทุกครั้ง · ไม่ผ่าน ⇒ throw ForbiddenError (ด่านเดียวกับ access.ts)
function assertBookingAction(auth: UnitAuth, unitId: string, action: string, input?: { status?: unknown }) {
  const m = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  assertBookingActionAllowed(m, unitId, action, input);
}

// 🔴 13 ส.ค. 2026 (เจ้าของสั่งข้อ 15): สร้าง/แก้/ลบบริการ ทำที่ระบบสินค้า/บริการ "ที่เดียว"
// action addService/editService ที่เคยอยู่ตรงนี้ถูกถอดออกโดยเจตนา — หน้าจองคิวเหลือแค่ติ๊กเปิด/ปิดรับจอง
// (ของเดิม: บริการสร้างได้ทั้งที่จองคิวและที่ POS → ราคาไม่ตรงกัน แก้ที่หนึ่งอีกที่ไม่รู้)

const depositSchema = z.object({
  id: z.string().min(1),
  depositBaht: z.coerce.number().min(0).max(1_000_000),
});

export async function setServiceDepositAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "setServiceDepositAction");
  const p = depositSchema.safeParse({
    id: formData.get("id"),
    depositBaht: formData.get("depositBaht"),
  });
  if (!p.success) return;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  await booking.setServiceDeposit(ctx, p.data.id, Math.round(p.data.depositBaht * 100));
  revalidatePath(`/app/u/${unitSlug}/booking/services`);
}

export async function recordDepositAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "recordDepositAction");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  await booking.recordDeposit(ctx, id);
  revalidatePath(`/app/u/${unitSlug}/booking`);
}

export async function refundDepositAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "refundDepositAction");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  await booking.refundDeposit(ctx, id);
  revalidatePath(`/app/u/${unitSlug}/booking`);
}

export async function addStaffAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "addStaffAction");
  const name = String(formData.get("name") ?? "").trim();
  const employeeId = String(formData.get("employeeId") ?? "").trim() || undefined;
  // ต้องมีอย่างใดอย่างหนึ่ง: เลือกจาก HR หรือพิมพ์ชื่อเอง
  if (!employeeId && name.length < 1) return;
  await booking.createStaff({ tenantId: auth.active.tenantId, unitId: unit.id, name, employeeId });
  revalidatePath(`/app/u/${unitSlug}/booking/staff`);
}

const HOURS_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
function hhmmToMin(v: string): number | null {
  const m = HOURS_RE.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export async function setBookingHoursAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "setBookingHoursAction");
  const rows = Array.from({ length: 7 }, (_, weekday) => {
    const closed = formData.get(`closed-${weekday}`) != null;
    const openMin = hhmmToMin(String(formData.get(`open-${weekday}`) ?? "")) ?? 600;
    const closeMin = hhmmToMin(String(formData.get(`close-${weekday}`) ?? "")) ?? 1200;
    return { weekday, openMin, closeMin, closed };
  });
  await booking.setUnitHours(auth.active.tenantId, unit.id, rows);
  revalidatePath(`/app/u/${unitSlug}/booking/hours`);
}

export async function removeStaffAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "removeStaffAction");
  const id = String(formData.get("id") ?? "");
  const db = tenantDb({ tenantId: auth.active.tenantId, unitId: unit.id });
  await db.bookingStaff.update({ where: { id }, data: { active: false } });
  revalidatePath(`/app/u/${unitSlug}/booking/setup`);
}

export async function setStatusAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const status = String(formData.get("status") ?? "");
  assertBookingAction(auth, unit.id, "setStatusAction", { status }); // SVC B.11 ▸ คีย์ตามสถานะปลายทาง (§7.2) ◂
  const id = String(formData.get("id") ?? "");
  // SVC B.0 ▸ รับเฉพาะ 6 สถานะเดิม — QUEUED/IN_SERVICE/LATE ตั้งได้ทางเครื่องสถานะ B.4 เท่านั้น ◂
  const parsed = z.enum(["PENDING", "CONFIRMED", "ARRIVED", "DONE", "NO_SHOW", "CANCELLED"]).safeParse(status);
  if (!parsed.success) return;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const db = tenantDb(ctx);
  // M3.7 — เปลี่ยนสถานะผ่าน service จุดเดียว (`setAppointmentStatus` ยิง booking.completed / booking.no_show)
  //   🔴 เดิม action อัปเดตแถวตรง ⇒ event ไม่เคยเกิดจากปุ่มบนจอ: สแตมป์ "จองที่มาจริง" (M2.3) · journey
  //      "จองแล้วไม่มา" (M3.3) · ไทม์ไลน์ มา/ไม่มา + แต้ม CHECKIN + ขอรีวิว (M3.7) ทำงานเฉพาะในข้อสอบ
  const st = await booking.setAppointmentStatus(ctx.tenantId, ctx.unitId, id, parsed.data, { actorUserId: auth.user.id }); // POS P5.1 ▸ RC F10a ◂
  // POS P5.1 ▸ RC F4 F5 (CD-P51-O10): ไม่ได้เปลี่ยนสถานะ (void บิลริบไม่ได้) / ริบมัดจำไม่สำเร็จ ⇒ จอจองแสดงเหตุผล (?err=) · ริบล้ม = logOps WARN ◂
  if (st.ok === false) {
    if (!("unforfeit" in st)) await logOps("WARN", "pos.deposit.forfeit_failed", `ริบมัดจำนัด ${id} ไม่สำเร็จ`, { tenantId: ctx.tenantId, detail: st.reason });
    scheduleDrain();
    revalidatePath(`/app/u/${unitSlug}/booking`);
    redirect(`/app/u/${unitSlug}/booking?err=${encodeURIComponent(st.reason.slice(0, 300))}`);
  }
  const appt = await db.appointment.findFirst({ where: { id }, include: { service: true } });
  if (!appt) return;
  // มาใช้บริการจริง → ระบบที่ "เชื่อมไว้" ทำงานตามนั้น (member/pos/point เป็นการเชื่อมแบบเลือกได้)
  if (parsed.data === "DONE") {
    // ราคาที่คิดจริง = ราคา ณ วันจอง (snapshot) — ร้านขึ้นราคาทีหลังต้องไม่ย้อนไปคิดกับนัดเก่า
    // -1 = นัดที่จองก่อนมีฟิลด์นี้ → ใช้ราคาบริการปัจจุบันตามพฤติกรรมเดิม
    const spent = appt.priceSatang >= 0 ? appt.priceSatang : appt.service.priceSatang;
    const [posSystemId, pointSystemId] = await Promise.all([
      systemForUnit(ctx.tenantId, ctx.unitId, "POS"),
      systemForUnit(ctx.tenantId, ctx.unitId, "POINT"),
    ]);
    if (appt.customerId) {
      await member.recordVisit(ctx.tenantId, appt.customerId);
      // M3.7 — แถวไทม์ไลน์ VISIT ย้ายไปที่ consumer `booking.completed` (recordOnce + บริการ/ช่าง/เวลานัด)
      //   เขียนตรงที่นี่อีก = แถวซ้ำ 2 บรรทัดต่อการมา 1 ครั้ง
    }
    if (spent > 0 && posSystemId) {
      // POS P5.1 ▸ MA2 (F2): มัดจำที่รับเป็นใบรับ (POS_DEPOSIT) จ่ายเป็นแถว DEPOSIT อ้างใบรับ + ส่วนที่เหลือเงินสด ⇒ Σ รายได้ = ราคา · VAT ครั้งเดียว ·
      //   มัดจำแบบเดิม (ก่อน P5.1 · ไม่มี PosDeposit) = คิดเต็มเงินสดแบบเดิม ·
      //   กด DONE ซ้ำ: บิลของคีย์มีแล้ว = ไม่ส่งซ้ำ (มัดจำถูกใช้ไปแล้ว ⇒ payload ใหม่จะไม่ตรงบิลเดิม) — เดิม createSale คืนบิลเดิมเหมือนกัน ◂
      const dep = await (await import("@/lib/modules/pos/deposit")).moduleDepositForBill(ctx.tenantId, ctx.unitId, appt.depositPaidAt ? appt.depositSaleId : null, spent);
      if ((await pos.saleStatusByKey(ctx.tenantId, `booking-sale-${appt.id}`)) === null) await pos.createSale({
        tenantId: ctx.tenantId,
        unitId: ctx.unitId,
        systemId: posSystemId,
        pointSystemId: pointSystemId ?? undefined,
        memberId: appt.customerId ?? undefined,
        sourceModule: "BOOKING",
        sourceId: appt.id,
        idempotencyKey: `booking-sale-${appt.id}`,
        // ผูก serviceId → รายงานแยก "บริการ" ได้ตรงกับที่ขายผ่านหน้าขาย (ไม่งั้นนัดจะไปกอง "รายการอื่น")
        lines: [{ name: appt.service.name, qty: 1, unitPriceSatang: spent, serviceId: appt.serviceId }],
        payMethods: dep
          ? [{ type: "DEPOSIT", amountSatang: dep.satang, refSaleId: dep.refSaleId }, ...(spent > dep.satang ? [{ type: "CASH" as const, amountSatang: spent - dep.satang }] : [])]
          : [{ type: "CASH", amountSatang: spent }],
      });
    }
  }
  // M3.7 — ระบายคิวหลังตอบ (after()) ให้สแตมป์/ไทม์ไลน์/journey ของนัดนี้ตามมาทันที ไม่ต้องรอ cron รายชั่วโมง
  scheduleDrain();
  revalidatePath(`/app/u/${unitSlug}/booking`);
}

// ─────────────────── วันหยุด/เวลาพิเศษรายวัน ───────────────────
// เดิมตั้งได้แค่รายสัปดาห์ → ปิดปีใหม่/สงกรานต์/ลาพักร้อน ทำไม่ได้ (เจ้าของทัก 11 ส.ค. 2026)

export async function addClosureAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "addClosureAction");
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const date = String(formData.get("date") ?? "").trim();
  const mode = String(formData.get("mode") ?? "closed");
  const note = String(formData.get("note") ?? "").trim() || null;
  const toMin = (v: FormDataEntryValue | null): number | null => {
    const [h, m] = String(v ?? "").split(":");
    const hh = Number(h);
    const mm = Number(m);
    return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
  };
  await booking.setClosure(ctx, {
    date,
    closed: mode !== "open",
    openMin: toMin(formData.get("openAt")),
    closeMin: toMin(formData.get("closeAt")),
    note,
  });
  revalidatePath(`/app/u/${unitSlug}/booking/hours`);
}

export async function removeClosureAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "removeClosureAction");
  await booking.removeClosure({ tenantId: auth.active.tenantId, unitId: unit.id }, String(formData.get("id") ?? ""));
  revalidatePath(`/app/u/${unitSlug}/booking/hours`);
}

/** รวมช่างที่ยังไม่ผูกทะเบียนพนักงาน — ปุ่มบนหน้าพนักงานของระบบจอง */
// ── บริการ: ติ๊กเปิดรับจองจากแคตตาล็อกกลาง + ย้ายบริการเก่าเข้าแคตตาล็อก (ข้อ 12-15) ──
export async function setServiceOfferedAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "setServiceOfferedAction");
  const itemId = String(formData.get("itemId") ?? "");
  const offered = String(formData.get("offered") ?? "") === "1";
  if (!itemId) return;
  await booking.setServiceOffered({ tenantId: auth.active.tenantId, unitId: unit.id }, itemId, offered);
  revalidatePath(`/app/u/${unitSlug}/booking/services`);
}

export async function importServicesToCatalogAction(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "importServicesToCatalogAction");
  try {
    await booking.importServicesToCatalog({ tenantId: auth.active.tenantId, unitId: unit.id, actorUserId: auth.user.id });
  } catch (e) {
    // POS P1.1b G11: แคตตาล็อกปฏิเสธ (เช่น BUSY ระหว่าง backfill — สร้างบริการผ่าน inventory.createItem) คืนเป็น ?err= — ไม่ throw ถึงผู้ใช้
    if (!(e instanceof CatalogError)) throw e;
    redirect(`/app/u/${unitSlug}/booking/services?err=${encodeURIComponent(e.message)}`);
  }
  revalidatePath(`/app/u/${unitSlug}/booking/services`);
}

// ติ๊ก "รับคิวที่สาขานี้" ให้พนักงาน HR คนหนึ่ง (มติเจ้าของ 13 ส.ค.: เพิ่ม/ลบคนทำที่ HR ที่เดียว)
export async function setStaffReceivingAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "setStaffReceivingAction");
  const employeeId = String(formData.get("employeeId") ?? "");
  const receiving = String(formData.get("receiving") ?? "") === "1";
  if (!employeeId) return;
  await booking.setStaffReceiving({ tenantId: auth.active.tenantId, unitId: unit.id }, employeeId, receiving);
  revalidatePath(`/app/u/${unitSlug}/booking/staff`);
}

export async function linkStaffToHrAction(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "linkStaffToHrAction");
  await booking.linkStaffToHr({ tenantId: auth.active.tenantId, unitId: unit.id });
  revalidatePath(`/app/u/${unitSlug}/booking/staff`);
}
