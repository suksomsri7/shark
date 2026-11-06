"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { HotelRoomStatus } from "@prisma/client";
import * as hotel from "./service";
import * as hotelRates from "./rates"; // SVC H.1
import { resetHotelSetting, saveHotelSettings } from "./hotel-settings"; // SVC H.1
import type { RemoveResult, SetResult } from "@/lib/core/settings"; // SVC H.1

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

function ctxOf(auth: UnitAuth, unitId: string) {
  return { tenantId: auth.active.tenantId, unitId };
}

// ตรวจสิทธิ์ระดับหน่วย (OWNER ผ่าน · MANAGER ผ่านในหน่วยที่คุม · STAFF ต้องมี permission)
function assertHotelCan(auth: UnitAuth, unitId: string, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "hotel", action, unitId },
  );
}

// ───────────────────────── Room types ─────────────────────────
const roomTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(16).optional(),
  capacity: z.coerce.number().int().min(1).max(20),
  rateBaht: z.coerce.number().min(0).max(1_000_000),
  depositBaht: z.coerce.number().min(0).max(1_000_000).optional(),
});

export async function addRoomTypeAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") throw new Error("NOT_HOTEL_UNIT"); // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.roomType.create");
  const p = roomTypeSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") || undefined,
    capacity: formData.get("capacity"),
    rateBaht: formData.get("rateBaht"),
    depositBaht: formData.get("depositBaht") || undefined,
  });
  if (!p.success) return;
  await hotel.createRoomType({
    ...ctxOf(auth, unit.id),
    name: p.data.name,
    code: p.data.code,
    capacity: p.data.capacity,
    baseRateSatang: Math.round(p.data.rateBaht * 100),
    depositSatang: Math.round((p.data.depositBaht ?? 0) * 100),
  });
  revalidatePath(`/app/u/${unitSlug}/hotel/setup`);
}

export async function removeRoomTypeAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") throw new Error("NOT_HOTEL_UNIT"); // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.roomType.delete");
  const id = String(formData.get("id") ?? "");
  await hotel.archiveRoomType(auth.active.tenantId, unit.id, id);
  revalidatePath(`/app/u/${unitSlug}/hotel/setup`);
}

// ───────────────────────── Rooms ─────────────────────────
const roomSchema = z.object({
  roomTypeId: z.string().trim().min(1),
  number: z.string().trim().min(1).max(16),
  floor: z.string().trim().max(16).optional(),
});

export async function addRoomAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") throw new Error("NOT_HOTEL_UNIT"); // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.room.create");
  const p = roomSchema.safeParse({
    roomTypeId: formData.get("roomTypeId"),
    number: formData.get("number"),
    floor: formData.get("floor") || undefined,
  });
  if (!p.success) return;
  await hotel.createRoom({ ...ctxOf(auth, unit.id), ...p.data });
  revalidatePath(`/app/u/${unitSlug}/hotel/setup`);
}

export async function removeRoomAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") throw new Error("NOT_HOTEL_UNIT"); // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.room.delete");
  const id = String(formData.get("id") ?? "");
  await hotel.archiveRoom(auth.active.tenantId, unit.id, id);
  revalidatePath(`/app/u/${unitSlug}/hotel/setup`);
}

export async function setRoomStatusAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") throw new Error("NOT_HOTEL_UNIT"); // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.room.setStatus");
  const id = String(formData.get("id") ?? "");
  const parsed = z.nativeEnum(HotelRoomStatus).safeParse(formData.get("status"));
  if (!parsed.success) return;
  await hotel.setRoomStatus(auth.active.tenantId, unit.id, id, parsed.data);
  revalidatePath(`/app/u/${unitSlug}/hotel/setup`);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
}

// ───────────────────────── Reservations ─────────────────────────
const reservationSchema = z.object({
  roomTypeId: z.string().trim().min(1),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestName: z.string().trim().min(1).max(120),
  guestPhone: z.string().trim().max(32).optional(),
  guestEmail: z.string().trim().max(120).optional(),
  adults: z.coerce.number().int().min(1).max(20).optional(),
  children: z.coerce.number().int().min(0).max(20).optional(),
  note: z.string().trim().max(500).optional(),
});

type ReservationFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
  code?: string;
};

// SVC H.1 · ไฟล์ "use server" ไม่ประกาศ export type (ข้อสอบ h.1 U-13) — ส่งออกชนิดแบบ type-only specifier (ถูกลบตอนคอมไพล์) ให้ reservation-form.tsx ใช้ต่อ
export { type ReservationFormState };

// ใช้กับ useActionState (client) — คืน state เพื่อโชว์ error/สำเร็จ inline
export async function createReservationAction(
  _prev: ReservationFormState,
  formData: FormData,
): Promise<ReservationFormState> {
  const unitSlug = String(formData.get("unitSlug") ?? "");
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") return { status: "error", message: "การจองห้องพักใช้ได้กับหน่วยโรงแรมเท่านั้น" }; // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.reservation.create");
  const p = reservationSchema.safeParse({
    roomTypeId: formData.get("roomTypeId"),
    checkInDate: formData.get("checkInDate"),
    checkOutDate: formData.get("checkOutDate"),
    guestName: formData.get("guestName"),
    guestPhone: formData.get("guestPhone") || undefined,
    guestEmail: formData.get("guestEmail") || undefined,
    adults: formData.get("adults") || undefined,
    children: formData.get("children") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!p.success) return { status: "error", message: "ข้อมูลไม่ครบหรือไม่ถูกต้อง" };
  const res = await hotel.createReservation({
    ...ctxOf(auth, unit.id),
    ...p.data,
    createdById: auth.user.id,
  });
  if (!res.ok) return { status: "error", message: res.reason };
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
  return { status: "ok", code: res.code };
}

export async function checkInAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") throw new Error("NOT_HOTEL_UNIT"); // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.reservation.checkIn");
  const id = String(formData.get("id") ?? "");
  const roomId = String(formData.get("roomId") ?? "");
  await hotel.checkIn(auth.active.tenantId, unit.id, id, roomId);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
}

export async function checkOutAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") throw new Error("NOT_HOTEL_UNIT"); // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.reservation.checkOut");
  const id = String(formData.get("id") ?? "");
  await hotel.checkOut(auth.active.tenantId, unit.id, id);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
}

export async function cancelReservationAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") throw new Error("NOT_HOTEL_UNIT"); // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.reservation.cancel");
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "") || undefined;
  await hotel.cancelReservation(auth.active.tenantId, unit.id, id, reason);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
}

// ร้านยืนยันรับมัดจำ (เปิดบิล POS DEPOSIT Dr 2110 + ปั๊ม depositPaidAt) — เฉพาะการจองที่มีมัดจำและยังไม่จ่าย
export async function recordDepositAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") throw new Error("NOT_HOTEL_UNIT"); // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.reservation.checkIn"); // สิทธิ์ระดับหน้างาน (รับเงินหน้าเคาน์เตอร์)
  const id = String(formData.get("id") ?? "");
  await hotel.recordDeposit(auth.active.tenantId, unit.id, id);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
}

// คืนเงินหลังเช็คเอาท์ (void POS bill → คืนบัญชี/แต้ม) — เฉพาะการจอง CHECKED_OUT ที่มีบิล
export async function refundStayAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") throw new Error("NOT_HOTEL_UNIT"); // SVC H.0 ▸ ด่าน type HOTEL ◂
  assertHotelCan(auth, unit.id, "hotel.reservation.refund");
  const id = String(formData.get("id") ?? "");
  await hotel.refundStay(auth.active.tenantId, unit.id, id);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
}

// SVC H.1 ▸ ราคาโรงแรม + ตั้งค่าโรงแรม (ใบสั่ง h.1 §4.4) — ร้าน/ผู้กระทำ/สิทธิ์จาก session เท่านั้น · ด่าน type HOTEL + assertHotelCan ทุกตัว
//   คืนผลเป็นข้อมูล ({ ok:false, code, reason }) ไม่ throw ให้หน้าแสดงข้อความ · บันทึกสำเร็จ ⇒ revalidate หน้าราคา/ตั้งค่า
type RatesActionResult = { ok: boolean; code?: string; reason?: string };
const NOT_HOTEL = { ok: false, code: "NOT_FOUND", reason: "ราคาห้องพักใช้ได้กับหน่วยโรงแรมเท่านั้น" } as const;
const NO_RIGHT = { ok: false, code: "FORBIDDEN", reason: "คุณยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน" } as const;
function hotelActorOf(auth: UnitAuth) {
  return {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
}
/** ด่านสิทธิ์เดิมของโมดูล (assertHotelCan โยน ForbiddenError) → ผลเป็น boolean ให้ action ตอบเป็นข้อมูล */
function canHotel(check: () => void): boolean {
  try {
    check();
    return true;
  } catch {
    return false;
  }
}
const inputOf = (input: unknown, unitId: string) => ({ ...(input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}), unitId });
function revalidateRates(unitSlug: string, r: { ok: boolean }) {
  if (r.ok) revalidatePath(`/app/u/${unitSlug}/hotel/rates`);
}
type RatesFn = (actor: unknown, ctx: unknown, input: unknown) => Promise<RatesActionResult>;
async function runRates(unitSlug: string, auth: UnitAuth, unitId: string, input: unknown, fn: RatesFn): Promise<RatesActionResult> {
  const r = await fn(hotelActorOf(auth), { tenantId: auth.active.tenantId }, inputOf(input, unitId));
  revalidateRates(unitSlug, r);
  return r;
}

export async function saveRatePlanAction(unitSlug: string, input: unknown): Promise<RatesActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.rates.write"))) return NO_RIGHT;
  return runRates(unitSlug, auth, unit.id, input, hotelRates.saveRatePlan);
}

export async function archiveRatePlanAction(unitSlug: string, input: unknown): Promise<RatesActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.rates.write"))) return NO_RIGHT;
  return runRates(unitSlug, auth, unit.id, input, hotelRates.archiveRatePlan);
}

export async function saveCancelRulesAction(unitSlug: string, input: unknown): Promise<RatesActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.rates.write"))) return NO_RIGHT;
  return runRates(unitSlug, auth, unit.id, input, hotelRates.saveCancelRules);
}

export async function saveSeasonAction(unitSlug: string, input: unknown): Promise<RatesActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.rates.write"))) return NO_RIGHT;
  return runRates(unitSlug, auth, unit.id, input, hotelRates.saveSeason);
}

export async function archiveSeasonAction(unitSlug: string, input: unknown): Promise<RatesActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.rates.write"))) return NO_RIGHT;
  return runRates(unitSlug, auth, unit.id, input, hotelRates.archiveSeason);
}

export async function saveHolidaysAction(unitSlug: string, input: unknown): Promise<RatesActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.rates.write"))) return NO_RIGHT;
  return runRates(unitSlug, auth, unit.id, input, hotelRates.saveHolidays);
}

export async function removeHolidayAction(unitSlug: string, input: unknown): Promise<RatesActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.rates.write"))) return NO_RIGHT;
  return runRates(unitSlug, auth, unit.id, input, hotelRates.removeHoliday);
}

export async function saveRatesAction(unitSlug: string, input: unknown): Promise<RatesActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.rates.write"))) return NO_RIGHT;
  return runRates(unitSlug, auth, unit.id, input, hotelRates.saveRates);
}

export async function setOverrideAction(unitSlug: string, input: unknown): Promise<RatesActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.rates.write"))) return NO_RIGHT;
  return runRates(unitSlug, auth, unit.id, input, hotelRates.setOverride);
}

export async function clearOverrideAction(unitSlug: string, input: unknown): Promise<RatesActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.rates.write"))) return NO_RIGHT;
  return runRates(unitSlug, auth, unit.id, input, hotelRates.clearOverride);
}

export async function saveHotelSettingsAction(unitSlug: string, changes: unknown, opts?: { ackLegalWarn?: boolean }): Promise<SetResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return { ok: false, code: "NOT_FOUND", issues: [{ code: "NOT_FOUND", messageTh: NOT_HOTEL.reason }] };
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.settings.edit"))) return { ok: false, code: "PERMISSION", issues: [{ code: "NO_PERMISSION", messageTh: NO_RIGHT.reason }] };
  const r = await saveHotelSettings(hotelActorOf(auth), { tenantId: auth.active.tenantId }, { unitId: unit.id, changes, ackLegalWarn: opts?.ackLegalWarn === true });
  if (r.ok) revalidatePath(`/app/u/${unitSlug}/hotel/settings`);
  return r;
}

export async function resetHotelSettingAction(unitSlug: string, target: unknown): Promise<RemoveResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return { ok: false, code: "NOT_FOUND", issues: [{ code: "NOT_FOUND", messageTh: NOT_HOTEL.reason }] };
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.settings.edit"))) return { ok: false, code: "PERMISSION", issues: [{ code: "NO_PERMISSION", messageTh: NO_RIGHT.reason }] };
  const t = target && typeof target === "object" ? (target as Record<string, unknown>) : {};
  const r = await resetHotelSetting(hotelActorOf(auth), { tenantId: auth.active.tenantId }, { unitId: unit.id, key: t.key, scope: t.scope, scopeId: t.scopeId });
  if (r.ok) revalidatePath(`/app/u/${unitSlug}/hotel/settings`);
  return r;
}
// ◂ SVC H.1
