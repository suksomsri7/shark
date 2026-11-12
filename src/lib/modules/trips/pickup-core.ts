// ─────────────────────────────────────────────────────────────
// trips/pickup-core.ts — โซนรับส่งของหน่วย TRIPS: ชนิด · ค่าคงที่ · zod · ช่วงเวลารับ (RUN TRIPS T1.1 §5)
// 🔴 บริสุทธิ์: ไม่มี I/O · ไม่ import prisma/db/next/โมดูลอื่น
// 🔴 ตาราง TripPickupZone มีแค่ name · pickupOffsetMin · surchargeSatang · polygon · sortOrder ⇒ มติผู้คุม Q1 (ชั่วคราว):
//    รายละเอียดที่จอใช้ (ชนิด · ชื่ออังกฤษ · พื้นที่ · ช่วงเวลา · เปิดปิด · ฐานคิด) เก็บใน `polygon` เป็น JSON v1 ผ่าน zod
//    หนี้: แตกเป็นคอลัมน์จริงใน migration ของ A1.1 · `name` = ชื่อไทย (ตัวคิดราคา T0.5 อ่านคอลัมน์นี้เป็นป้ายบรรทัด)
// ─────────────────────────────────────────────────────────────
import { z } from "zod";

export const PICKUP_ZONE_KINDS = ["ZONE", "SELF"] as const;
export type PickupZoneKind = (typeof PICKUP_ZONE_KINDS)[number];
export const PICKUP_ERROR_CODES = ["INVALID_INPUT", "NOT_FOUND", "FORBIDDEN", "UNIT_NOT_TRIPS", "NAME_TAKEN", "ZONE_LIMIT", "BUSY"] as const;
export type PickupErrorCode = (typeof PICKUP_ERROR_CODES)[number];
/** เพดานทางเทคนิคของโซนที่เปิดอยู่ต่อหน่วย (ไม่ใช่ตัวเลขธุรกิจ) */
export const PICKUP_ZONE_LIMIT = 50;
export const PICKUP_BASIS = "PER_BOOKING" as const;

const INT4 = 2_147_483_647;
const DAY_MIN = 1440;
const ID = z.string().min(1).max(100);

const NAME_IN = z.strictObject({
  th: z.string().trim().min(1).max(100),
  en: z.string().trim().max(100).nullable().optional(),
});
const AREAS_IN = z
  .strictObject({
    th: z.string().trim().max(300).nullable().optional(),
    en: z.string().trim().max(300).nullable().optional(),
  })
  .nullable();
const FIELDS = {
  kind: z.enum(PICKUP_ZONE_KINDS),
  name: NAME_IN,
  areas: AREAS_IN.optional(),
  pickupOffsetMin: z.number().int().min(0).max(DAY_MIN - 1),
  windowMin: z.number().int().min(0).max(720),
  surchargeSatang: z.number().int().min(0).max(INT4),
};

type Shape = { kind: PickupZoneKind; pickupOffsetMin: number; windowMin: number; surchargeSatang: number };
/** กติกาข้ามช่อง: ช่วงรับไม่เกินเวลาล่วงหน้า · มาเอง = ไม่มีช่วงเวลาและไม่มีค่าบวกเพิ่ม */
export function pickupShapeIssue(v: Shape): string | null {
  if (v.windowMin > v.pickupOffsetMin) return "ช่วงเวลารับต้องไม่ยาวกว่าเวลาที่รับล่วงหน้า";
  if (v.kind === "SELF" && (v.windowMin !== 0 || v.surchargeSatang !== 0)) return "จุดนัด (มาเอง) ไม่มีช่วงเวลารับและไม่มีค่าบวกเพิ่ม";
  return null;
}

export const pickupZoneInputSchema = z
  .strictObject({ unitId: ID, ...FIELDS })
  .superRefine((v, ctx) => {
    const issue = pickupShapeIssue(v);
    if (issue) ctx.addIssue({ code: "custom", message: issue });
  });
export type PickupZoneInput = z.output<typeof pickupZoneInputSchema>;

/** แก้บางช่อง — ตรวจกติกาข้ามช่องหลังรวมกับค่าเดิม (บริการทำ) */
export const pickupZonePatchSchema = z.strictObject({
  unitId: ID,
  zoneId: ID,
  kind: FIELDS.kind.optional(),
  name: NAME_IN.optional(),
  areas: AREAS_IN.optional(),
  pickupOffsetMin: FIELDS.pickupOffsetMin.optional(),
  windowMin: FIELDS.windowMin.optional(),
  surchargeSatang: FIELDS.surchargeSatang.optional(),
});
export const pickupZoneActiveSchema = z.strictObject({ unitId: ID, zoneId: ID, active: z.boolean() });
export const pickupZoneReorderSchema = z.strictObject({ unitId: ID, ids: z.array(ID).min(1).max(500) });
export const pickupZoneListSchema = z.strictObject({ unitId: ID, includeInactive: z.boolean().optional() });

/** JSON v1 ในคอลัมน์ polygon (มติ Q1) */
export const pickupPolygonV1Schema = z.object({
  v: z.literal(1),
  kind: z.enum(PICKUP_ZONE_KINDS),
  nameEn: z.string().nullable(),
  areas: z.object({ th: z.string().nullable().optional(), en: z.string().nullable().optional() }).nullable(),
  windowMin: z.number().int().min(0).max(720),
  active: z.boolean(),
  basis: z.literal(PICKUP_BASIS),
});
export type PickupPolygonV1 = z.output<typeof pickupPolygonV1Schema>;

export type PickupAreas = { th: string | null; en: string | null } | null;
export type PickupZoneDTO = {
  id: string;
  unitId: string;
  kind: PickupZoneKind;
  name: { th: string; en: string | null };
  areas: PickupAreas;
  pickupOffsetMin: number;
  windowMin: number;
  surchargeSatang: number;
  basis: typeof PICKUP_BASIS;
  active: boolean;
  sortOrder: number;
};

const textOrNull = (v: string | null | undefined): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
export function cleanAreas(a: { th?: string | null; en?: string | null } | null | undefined): PickupAreas {
  if (!a) return null;
  const th = textOrNull(a.th);
  const en = textOrNull(a.en);
  return th === null && en === null ? null : { th, en };
}

/** แถวฐาน → DTO (polygon อ่านไม่ได้ ⇒ ค่าปลอดภัย: ZONE · ไม่มีช่วงเวลา · เปิด) */
export function pickupZoneFromRow(row: { id: string; unitId: string; name: string; pickupOffsetMin: number; surchargeSatang: number; polygon: unknown; sortOrder: number }): PickupZoneDTO {
  const p = pickupPolygonV1Schema.safeParse(row.polygon);
  const poly: PickupPolygonV1 = p.success ? p.data : { v: 1, kind: "ZONE", nameEn: null, areas: null, windowMin: 0, active: true, basis: PICKUP_BASIS };
  return {
    id: row.id,
    unitId: row.unitId,
    kind: poly.kind,
    name: { th: row.name, en: textOrNull(poly.nameEn) },
    areas: cleanAreas(poly.areas),
    pickupOffsetMin: row.pickupOffsetMin,
    windowMin: poly.windowMin,
    surchargeSatang: row.surchargeSatang,
    basis: PICKUP_BASIS,
    active: poly.active,
    sortOrder: row.sortOrder,
  };
}

/** DTO → JSON v1 ของ polygon */
export function pickupPolygonOf(z1: Pick<PickupZoneDTO, "kind" | "name" | "areas" | "windowMin" | "active">): PickupPolygonV1 {
  return { v: 1, kind: z1.kind, nameEn: z1.name.en, areas: z1.areas, windowMin: z1.windowMin, active: z1.active, basis: PICKUP_BASIS };
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** นาทีของวัน (ติดลบ/เกินวันได้) → "HH:MM" 24 ชม. */
export function hmOf(min: number): string {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export type PickupWindow =
  | { kind: "WINDOW"; fromMin: number; toMin: number; fromHm: string; toHm: string; dayBefore: boolean }
  | { kind: "MEET"; atMin: number; atHm: string };

/**
 * ช่วงเวลารับของโซน เมื่อรอบออกเวลา departTimeMin (นาทีของวัน)
 * ZONE: from = เวลาออก − รับล่วงหน้า · to = from + ช่วงรับ · from ติดลบ = วันก่อน · SELF: พบที่จุดนัด = เวลาออก − รับล่วงหน้า
 */
export function pickupWindowFor(zone: { kind: string; pickupOffsetMin: number; windowMin: number }, departTimeMin: number): PickupWindow {
  const from = departTimeMin - zone.pickupOffsetMin;
  if (zone.kind === "SELF") return { kind: "MEET", atMin: from, atHm: hmOf(from) };
  const to = from + zone.windowMin;
  return { kind: "WINDOW", fromMin: from, toMin: to, fromHm: hmOf(from), toHm: hmOf(to), dayBefore: from < 0 };
}
