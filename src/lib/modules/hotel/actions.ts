"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { HotelRoomStatus } from "@prisma/client";
import * as hotel from "./service";

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
  assertHotelCan(auth, unit.id, "hotel.room.delete");
  const id = String(formData.get("id") ?? "");
  await hotel.archiveRoom(auth.active.tenantId, unit.id, id);
  revalidatePath(`/app/u/${unitSlug}/hotel/setup`);
}

export async function setRoomStatusAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
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
  assertHotelCan(auth, unit.id, "hotel.reservation.checkIn");
  const id = String(formData.get("id") ?? "");
  const roomId = String(formData.get("roomId") ?? "");
  await hotel.checkIn(auth.active.tenantId, unit.id, id, roomId);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
}

export async function checkOutAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertHotelCan(auth, unit.id, "hotel.reservation.checkOut");
  const id = String(formData.get("id") ?? "");
  await hotel.checkOut(auth.active.tenantId, unit.id, id);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
}

export async function cancelReservationAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
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
  assertHotelCan(auth, unit.id, "hotel.reservation.checkIn"); // สิทธิ์ระดับหน้างาน (รับเงินหน้าเคาน์เตอร์)
  const id = String(formData.get("id") ?? "");
  await hotel.recordDeposit(auth.active.tenantId, unit.id, id);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
}

// คืนเงินหลังเช็คเอาท์ (void POS bill → คืนบัญชี/แต้ม) — เฉพาะการจอง CHECKED_OUT ที่มีบิล
export async function refundStayAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertHotelCan(auth, unit.id, "hotel.reservation.refund");
  const id = String(formData.get("id") ?? "");
  await hotel.refundStay(auth.active.tenantId, unit.id, id);
  revalidatePath(`/app/u/${unitSlug}/hotel`);
  revalidatePath(`/app/u/${unitSlug}/hotel/reservations`);
}
