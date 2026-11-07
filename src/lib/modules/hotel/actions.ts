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
import * as hotelBooking from "./booking"; // SVC H.3
import * as hotelTape from "./tape"; // SVC H.2
import * as hotelBlock from "./block"; // SVC H.2
import * as hotelCheckin from "./checkin"; // SVC H.4
import * as hotelGuest from "./guest"; // SVC H.4
import * as hotelTm30 from "./tm30"; // SVC H.4
import * as hotelIdAi from "./guest-id-ai"; // SVC H.4

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

export type ReservationFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
  code?: string;
};

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

// SVC H.3 ▸ จอง V2 (ใบสั่ง h.3 §3.5) — ร้าน/ผู้กระทำ/สิทธิ์จาก session เท่านั้น · ด่าน type HOTEL + assertHotelCan ทุกตัว · ผลเป็นข้อมูล ไม่ throw
//   สิทธิ์: สร้าง = hotel.reservation.create · ยกเลิก = hotel.reservation.cancel (+ hotel.booking.manage เมื่อมีคืน/ริบเงิน — ตรวจใน booking.ts)
//   อื่น = hotel.booking.manage (ย้อน «ไม่มา» ต้องเป็นผู้จัดการ/เจ้าของ — ตรวจใน booking.ts) · input รับเฉพาะคีย์ที่รู้จัก (นาฬิกาฉากไม่ผ่านทางนี้)
type BookingActionResult = { ok: boolean; code?: string; reason?: string };
const NOT_HOTEL_BOOKING = { ok: false, code: "NOT_FOUND", reason: "การจองห้องพักใช้ได้กับหน่วยโรงแรมเท่านั้น" } as const;
const BOOKING_INPUT_KEYS = new Set([
  "reservationId", "id", "groupId", "rooms", "checkIn", "checkOut", "ratePlanId", "source", "guest", "note", "couponCode", "hold", "channelRef",
  "payType", "amountSatang", "reference", "reason", "newCheckOut", "roomId",
]);
function bookingInputOf(input: unknown, unitId: string): Record<string, unknown> {
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return { ...Object.fromEntries(Object.entries(src).filter(([k]) => BOOKING_INPUT_KEYS.has(k))), unitId };
}
type BookingFn = (actor: unknown, ctx: unknown, input: unknown) => Promise<BookingActionResult>;
async function runBooking(unitSlug: string, auth: UnitAuth, unitId: string, input: unknown, fn: BookingFn): Promise<BookingActionResult> {
  const r = await fn(hotelActorOf(auth), { tenantId: auth.active.tenantId }, bookingInputOf(input, unitId));
  if (r.ok) {
    revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
    revalidatePath(`/app/u/${unitSlug}/hotel`);
  }
  return r;
}

export async function createBookingAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.reservation.create"))) return NO_RIGHT;
  return runBooking(unitSlug, auth, unit.id, input, (a, c, i) => hotelBooking.createBooking(a, c, i));
}

export async function takeBookingDepositAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  return runBooking(unitSlug, auth, unit.id, input, hotelBooking.takeBookingDeposit);
}

export async function confirmBookingAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  return runBooking(unitSlug, auth, unit.id, input, hotelBooking.confirmBooking);
}

export async function cancelBookingAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.reservation.cancel"))) return NO_RIGHT;
  return runBooking(unitSlug, auth, unit.id, input, hotelBooking.cancelBooking);
}

export async function extendBookingAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  return runBooking(unitSlug, auth, unit.id, input, hotelBooking.extendBooking);
}

export async function shortenBookingAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  return runBooking(unitSlug, auth, unit.id, input, hotelBooking.shortenBooking);
}

export async function assignRoomAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  return runBooking(unitSlug, auth, unit.id, input, hotelBooking.assignRoom);
}

export async function rescheduleBookingAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  return runBooking(unitSlug, auth, unit.id, input, hotelBooking.rescheduleBooking);
}

export async function markNoShowAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  return runBooking(unitSlug, auth, unit.id, input, hotelBooking.markNoShow);
}

export async function undoNoShowAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  return runBooking(unitSlug, auth, unit.id, input, hotelBooking.undoNoShow);
}

export async function quoteExtendBookingAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  return hotelBooking.quoteExtension(hotelActorOf(auth), { tenantId: auth.active.tenantId }, bookingInputOf(input, unit.id));
}
// ◂ SVC H.3

// SVC H.2 ▸ ปฏิทินห้อง (ใบสั่ง h.2 §3.4) — ลาก/ยืด/ปิดห้อง เรียก H.3 (rescheduleBooking · extendBooking/shortenBooking) และ block.ts เท่านั้น ไม่มีเส้นเขียนใหม่
//   ด่าน type HOTEL + assertHotelCan(hotel.booking.manage) ทุกตัว · ร้าน/ผู้กระทำจาก session · input รับเฉพาะคีย์ที่รู้จัก (นาฬิกาฉากไม่ผ่านทางนี้)
function revalidateCalendar(unitSlug: string, ok: boolean) {
  if (!ok) return;
  revalidatePath(`/app/u/${unitSlug}/hotel/calendar`);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
}
function pickKeys(input: unknown, keys: string[], unitId: string): Record<string, unknown> {
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return { ...Object.fromEntries(Object.entries(src).filter(([k]) => keys.includes(k))), unitId };
}

/** ลากแถบ = ย้ายห้อง และ/หรือเลื่อนวัน ใน tx เดียว (rescheduleBooking ของ H.3) · ล้ม ⇒ ไม่เปลี่ยนอะไร (แถบเด้งกลับ) */
export async function moveBookingAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  // มติผู้คุม 7 พ.ย.: การลากต้องไม่ย้ายการจองคนอื่นเงียบ ๆ ⇒ moveBooking = rescheduleBooking ของ H.3 แบบ repack: false (ห้องปลายทางไม่ว่าง = ROOM_BUSY แถบเด้งกลับ)
  const r = await runBooking(unitSlug, auth, unit.id, pickKeys(input, ["id", "roomId", "checkIn", "checkOut"], unit.id), (a, c, i) => hotelBooking.moveBooking(a, c, i));
  revalidateCalendar(unitSlug, r.ok);
  return r;
}

/** ลากขอบขวา = ยืด/ย่นคืน (extendBooking · ย่นใช้ shortenBooking ซึ่งปฏิเสธคืนที่ปิดวันแล้ว) */
export async function resizeBookingAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  const clean = pickKeys(input, ["id", "newCheckOut"], unit.id);
  const actor = hotelActorOf(auth);
  const ctx = { tenantId: auth.active.tenantId };
  const cur = await hotelBooking.getBooking(actor, ctx, { unitId: unit.id, id: clean.id });
  const curOut = cur.ok ? cur.booking.checkOut : "";
  const longer = typeof clean.newCheckOut === "string" && curOut !== "" && clean.newCheckOut > curOut;
  const r = longer ? await hotelBooking.extendBooking(actor, ctx, clean) : await hotelBooking.shortenBooking(actor, ctx, clean);
  revalidateCalendar(unitSlug, r.ok);
  return r;
}

/** ราคาก่อนยืนยันการลาก (อ่านอย่างเดียว · ไดอะล็อกยืนยัน) */
export async function previewMoveAction(unitSlug: string, input: unknown): Promise<hotelTape.MovePreview> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return { ok: false, code: "NOT_FOUND", reason: NOT_HOTEL_BOOKING.reason };
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return { ok: false, code: "NOT_FOUND", reason: NO_RIGHT.reason };
  return hotelTape.previewMove({ tenantId: auth.active.tenantId }, pickKeys(input, ["id", "roomId", "checkIn", "checkOut"], unit.id));
}

/** ปิดห้อง (BLOCK) ช่วง [from, to) พร้อมเหตุผล · ชนการจอง ⇒ ROOM_TAKEN + รายชื่อ · เกินจอง ⇒ ok + warning */
export async function blockRoomAction(unitSlug: string, input: unknown): Promise<hotelBlock.BlockOk | hotelBlock.BlockFail | BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  const r = await hotelBlock.blockRoom(hotelActorOf(auth), { tenantId: auth.active.tenantId }, pickKeys(input, ["roomId", "from", "to", "reason"], unit.id));
  revalidateCalendar(unitSlug, r.ok);
  return r;
}

/** ปล่อยห้องที่ปิดไว้ (ห้องกลับเป็น DIRTY ให้แม่บ้านตรวจ) */
export async function releaseBlockAction(unitSlug: string, input: unknown): Promise<BookingActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_BOOKING;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  const r = await hotelBlock.releaseBlock(hotelActorOf(auth), { tenantId: auth.active.tenantId }, pickKeys(input, ["blockId"], unit.id));
  revalidateCalendar(unitSlug, r.ok);
  return r;
}
// ◂ SVC H.2

// SVC H.4 ▸ เช็กอิน V2 · ทะเบียนผู้พัก · ร.ร.3 · AI อ่านเอกสาร · ตม.30 (ใบสั่ง h.4 §3.5) — ร้าน/ผู้กระทำ/สิทธิ์จาก session เท่านั้น · ด่าน type HOTEL + assertHotelCan ทุกตัว
//   สิทธิ์: เช็กอิน = hotel.reservation.checkIn · ทะเบียน/ลงชื่อ/ตม.30/อ่านเอกสาร = hotel.guest.register · เลขเต็ม = hotel.guest.viewId
//   (ร้านปิดการซ่อนเลข ⇒ guest.register ก็เปิดได้ — ตัดสินใน guest.ts) · ข้ามเงื่อนไข/ย้อน = hotel.booking.manage (ตรวจซ้ำใน checkin.ts)
//   input รับเฉพาะคีย์ที่รู้จัก (ไม่มีนาฬิกาฉาก) · รูปจากจอมาเป็น data URL (base64) แล้วแปลงเป็นไบต์ที่นี่ · ผลเป็นข้อมูล ไม่ throw
type GuestActionResult = { ok: boolean; code?: string; reason?: string; [k: string]: unknown };
const NOT_HOTEL_GUEST = { ok: false, code: "NOT_FOUND", reason: "ทะเบียนผู้เข้าพักใช้ได้กับหน่วยโรงแรมเท่านั้น" } as const;
const GUEST_FILE_MAX_CHARS = Math.ceil((8 * 1024 * 1024 + 1) / 3) * 4 + 200;
/** ไฟล์จากจอ: { dataUrl } | { data (base64), contentType } ⇒ { data: Uint8Array, contentType } · ผิดรูป ⇒ undefined (ด่านไฟล์ในโมดูลปฏิเสธเอง) */
function fileFromClient(v: unknown): { data: Uint8Array; contentType: string } | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  let ct = typeof o.contentType === "string" ? o.contentType : "";
  let b64 = "";
  if (typeof o.dataUrl === "string" && o.dataUrl.length <= GUEST_FILE_MAX_CHARS) {
    const m = /^data:([a-z0-9.+/-]+);base64,(.*)$/i.exec(o.dataUrl);
    if (!m) return undefined;
    ct = m[1] ?? "";
    b64 = m[2] ?? "";
  } else if (typeof o.data === "string" && o.data.length <= GUEST_FILE_MAX_CHARS) b64 = o.data;
  else return undefined;
  if (!ct || !/^[A-Za-z0-9+/=]*$/.test(b64)) return undefined;
  return { data: new Uint8Array(Buffer.from(b64, "base64")), contentType: ct };
}
const GUEST_FIELDS = ["fullName", "nationality", "idType", "idNumber", "dob", "sex", "occupation", "address", "arrivedFrom", "nextDestination", "visaType", "visaNo", "arrivalDate", "portOfEntry", "tm6No", "docExpiry", "keepIdImage", "aiProposed", "confirmed"];
function guestFromClient(v: unknown): Record<string, unknown> {
  const src = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: Record<string, unknown> = Object.fromEntries(Object.entries(src).filter(([k]) => GUEST_FIELDS.includes(k)));
  const img = fileFromClient(src.idImage);
  if (img) out.idImage = img;
  else if (src.idImage) out.idImage = { data: new Uint8Array(0), contentType: "application/octet-stream" };
  return out;
}
function pickGuestKeys(input: unknown, keys: string[]): Record<string, unknown> {
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return Object.fromEntries(Object.entries(src).filter(([k]) => keys.includes(k)));
}
function revalidateGuests(unitSlug: string, r: { ok: boolean }, reservationId?: unknown) {
  if (!r.ok) return;
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/guests`);
  revalidatePath(`/app/u/${unitSlug}/hotel/tm30`);
  if (typeof reservationId === "string" && reservationId) revalidatePath(`/app/u/${unitSlug}/hotel/reservations/${reservationId}`);
}

export async function checkInV2Action(unitSlug: string, input: unknown): Promise<GuestActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_GUEST;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.reservation.checkIn"))) return NO_RIGHT;
  const x = pickGuestKeys(input, ["reservationId", "roomId", "force", "earlyOverride", "occupancyOverride", "memberOptIn"]);
  const guests = input && typeof input === "object" && Array.isArray((input as Record<string, unknown>).guests) ? ((input as Record<string, unknown>).guests as unknown[]).slice(0, 20).map(guestFromClient) : [];
  const r = await hotelCheckin.checkInV2(hotelActorOf(auth), { tenantId: auth.active.tenantId }, { ...x, guests });
  revalidateGuests(unitSlug, r, x.reservationId);
  return r;
}

export async function undoCheckInAction(unitSlug: string, input: unknown): Promise<GuestActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_GUEST;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.booking.manage"))) return NO_RIGHT;
  const x = pickGuestKeys(input, ["reservationId", "reason"]);
  const r = await hotelCheckin.undoCheckIn(hotelActorOf(auth), { tenantId: auth.active.tenantId }, x);
  revalidateGuests(unitSlug, r, x.reservationId);
  return r;
}

export async function upsertGuestAction(unitSlug: string, input: unknown): Promise<GuestActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_GUEST;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.guest.register"))) return NO_RIGHT;
  const x = pickGuestKeys(input, ["reservationId", "guestId"]);
  const g = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>).guest : undefined;
  const r = await hotelGuest.upsertGuestRecord(hotelActorOf(auth), { tenantId: auth.active.tenantId }, { ...x, guest: guestFromClient(g) });
  revalidateGuests(unitSlug, r, x.reservationId);
  return r;
}

export async function deleteGuestAction(unitSlug: string, input: unknown): Promise<GuestActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_GUEST;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.guest.register"))) return NO_RIGHT;
  const r = await hotelGuest.deleteGuestRecord(hotelActorOf(auth), { tenantId: auth.active.tenantId }, pickGuestKeys(input, ["guestId"]));
  revalidateGuests(unitSlug, r);
  return r;
}

export async function revealGuestIdAction(unitSlug: string, input: unknown): Promise<GuestActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_GUEST;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.guest.viewId")) && !canHotel(() => assertHotelCan(auth, unit.id, "hotel.guest.register"))) return NO_RIGHT;
  return hotelGuest.revealGuestId(hotelActorOf(auth), { tenantId: auth.active.tenantId }, pickGuestKeys(input, ["guestId"]));
}

export async function signRr3Action(unitSlug: string, input: unknown): Promise<GuestActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_GUEST;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.guest.register"))) return NO_RIGHT;
  const x = pickGuestKeys(input, ["guestId", "method", "note"]);
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const png = fileFromClient(src.signaturePng);
  const r = await hotelGuest.signRr3(hotelActorOf(auth), { tenantId: auth.active.tenantId }, { ...x, ...(png ? { signaturePng: png } : {}) });
  revalidateGuests(unitSlug, r);
  return r;
}

export async function readIdDocumentAction(unitSlug: string, input: unknown): Promise<GuestActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_GUEST;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.guest.register"))) return NO_RIGHT;
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return hotelIdAi.readIdDocument(hotelActorOf(auth), { tenantId: auth.active.tenantId }, { unitId: unit.id, image: fileFromClient(src.image) ?? null });
}

export async function tm30ExportAction(unitSlug: string, input: unknown): Promise<GuestActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_GUEST;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.guest.register"))) return NO_RIGHT;
  const r = await hotelTm30.tm30Export(hotelActorOf(auth), { tenantId: auth.active.tenantId }, { ...pickGuestKeys(input, ["guestIds", "format"]), unitId: unit.id });
  if (!r.ok) return r;
  return { ok: true, count: r.count, name: r.file.name, contentType: r.file.contentType, base64: Buffer.from(r.file.bytes).toString("base64") };
}

export async function markTm30FiledAction(unitSlug: string, input: unknown): Promise<GuestActionResult> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "HOTEL") return NOT_HOTEL_GUEST;
  if (!canHotel(() => assertHotelCan(auth, unit.id, "hotel.guest.register"))) return NO_RIGHT;
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const ev = fileFromClient(src.evidence);
  const r = await hotelTm30.markTm30Filed(hotelActorOf(auth), { tenantId: auth.active.tenantId }, { ...pickGuestKeys(input, ["guestIds", "tm30Ref", "filedAt"]), ...(ev ? { evidence: ev } : {}) });
  revalidateGuests(unitSlug, r);
  return r;
}
// ◂ SVC H.4
