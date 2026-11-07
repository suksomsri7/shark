// SVC H.4 ▸ ทะเบียนผู้เข้าพัก = บัตรทะเบียนผู้พัก (ร.ร.3) อิเล็กทรอนิกส์ + ทะเบียนผู้พัก (ร.ร.4) (ใบสั่ง ledger/svc-briefs/svc-brief-h.4.md §0 §2 §3.2)
//   • แหล่งกฎหมาย: พ.ร.บ.โรงแรม พ.ศ. 2547 มาตรา 35 (ผู้จัดการต้องจัดให้ผู้พักลงทะเบียนตามแบบ ร.ร.3 ทันทีที่เข้าพัก · จัดทำทะเบียนผู้พักตามแบบ ร.ร.4 ·
//     เก็บไว้ไม่น้อยกว่า 1 ปี) + กฎกระทรวง/ประกาศกระทรวงมหาดไทยเรื่องแบบบัตรทะเบียนผู้พัก (ร.ร.3) และทะเบียนผู้พัก (ร.ร.4) ฉบับปัจจุบัน
//     (ให้จัดทำในรูปข้อมูลอิเล็กทรอนิกส์ได้) — RR3_FIELDS ข้างล่างไล่ตามช่องของแบบ ร.ร.3 · 🔴 ที่ปรึกษากฎหมาย (J3) ตรวจแบบที่พิมพ์ก่อนใช้จริง (Q-H4-2)
//   • PDPA (Q6): เลขบัตร/พาสปอร์ต + ข้อมูลอ่อนไหวอื่น (เพศ · อาชีพ · ที่อยู่ · ตรวจลงตรา · ตม.6) อยู่ใน "กล่องลับ" idNumberEnc เท่านั้น
//     (sealIntegrationSecret · AAD = recordId) · คอลัมน์ที่อ่านได้ทั่วไป = ชื่อ · สัญชาติ · ชนิดเอกสาร · 4 ตัวท้าย · วันเกิด · มาจาก/ไปต่อ
//     เปิดเลขเต็ม = revealGuestId (สิทธิ์ hotel.guest.viewId · AuditLog ทุกครั้ง · ไม่ cache ใน DTO) · DTO/AuditLog/outbox/ชื่อไฟล์ไม่มีเลขดิบ
//   • รูปเอกสาร/ลายเซ็น = ไฟล์ private (uploadFile visibility private · ลิงก์ผ่าน privateFileUrl ที่ผูกผู้ดู · ลบด้วย deleteFileAsset)
//   • เก็บถึง retainUntil = วันออก + rooms.hotel.guest.retainYears · พ้นแล้ว purgeExpiredGuestRecords ล้างกล่องลับ/ไฟล์ (คงชื่อ · 4 ตัวท้าย · สัญชาติ · วันเข้าออก)
//   • เลขบัตร ร.ร.3 = RR3-<พ.ศ.>-NNNNNN ลำดับตาม createdAt ต่อหน่วยต่อปี (มติใบ §2 ข้อ 3 · ไม่มีคอลัมน์ถาวร)
//   • ทุกฟังก์ชันรับ (actor, ctx {tenantId}, input) · ด่าน: หน่วย HOTEL ของร้าน → เข้าหน่วยได้ (ไม่ได้ ⇒ NOT_FOUND) → สิทธิ์ (FORBIDDEN) · ไม่ throw
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { bkkParts, bkkYmd } from "@/lib/core/quiet-hours";
import { getDef, resolveSettings } from "@/lib/core/settings";
import { integrationSecretKeyConfigured, openIntegrationSecret, sealIntegrationSecret } from "@/lib/core/integrations/secret-box";
import { deleteFileAsset, privateFileUrl, uploadFile } from "@/lib/storage/service";
import { GUEST_ID_TYPES, idLast4, isForeigner, maskFromLast4, nationalityTh, validateIdNumber, type GuestIdType, type Tm30Status } from "./guest-shared";

export { maskId, isForeigner, nationalityTh } from "./guest-shared";

// ───────────────────────── ชนิด ─────────────────────────
export type HotelGuestActor = MembershipCtx & { userId: string };
export type GuestFail = { ok: false; code: string; reason: string };
export type GuestGate = { tenantId: string; unitId: string; unitName: string; actor: HotelGuestActor };
export type GuestInput = {
  fullName: string;
  nationality: string;
  idType: GuestIdType;
  idNumber: string;
  dob?: string | null;
  sex?: "M" | "F" | "X" | null;
  occupation?: string | null;
  address?: string | null;
  arrivedFrom?: string | null;
  nextDestination?: string | null;
  visaType?: string | null;
  visaNo?: string | null;
  arrivalDate?: string | null;
  portOfEntry?: string | null;
  tm6No?: string | null;
  docExpiry?: string | null;
  idImage?: { data: Uint8Array; contentType: string } | null;
  keepIdImage?: boolean;
  aiProposed?: boolean;
  confirmed?: boolean;
};
/** ข้อมูลอ่อนไหวที่อยู่ในกล่องลับ (ไม่มีคอลัมน์ · ไม่ออกนอกเซิร์ฟเวอร์ยกเว้นแบบพิมพ์ ร.ร.3/ไฟล์ ตม.30) */
export type GuestSecret = {
  id: string;
  sex: string | null;
  occupation: string | null;
  address: string | null;
  visaType: string | null;
  visaNo: string | null;
  arrivalDate: string | null;
  portOfEntry: string | null;
  tm6No: string | null;
  docExpiry: string | null;
};
export type GuestDto = {
  id: string;
  reservationId: string;
  reservationCode: string;
  fullName: string;
  nationality: string | null;
  nationalityTh: string | null;
  idType: string | null;
  idNumberLast4: string | null;
  idMasked: string;
  isForeigner: boolean;
  tm30Status: string;
  tm30DueAt: string | null;
  tm30Ref: string | null;
  tm30FiledAt: string | null;
  rr3SignedAt: string | null;
  signed: boolean;
  hasIdImage: boolean;
  purged: boolean;
  dob: string | null;
  arrivedFrom: string | null;
  nextDestination: string | null;
  checkIn: string;
  checkOut: string;
  reservationStatus: string;
  roomNumber: string | null;
  createdAt: string;
};

type Tx = Prisma.TransactionClient;
type GuestRow = NonNullable<Awaited<ReturnType<Tx["hotelGuestRecord"]["findFirst"]>>>;

// ───────────────────────── ค่าคงที่ ─────────────────────────
export const GUEST_FILE_MAX_BYTES = 8 * 1024 * 1024;
export const GUEST_TX = { maxWait: 10_000, timeout: 30_000 } as const;
const SYSTEM_ACTOR_ID = "module:hotel";
const DELETE_WINDOW_MS = 10 * 60_000;
const PURGE_BATCH = 200;
const TM30_WINDOW_MS = 24 * 3_600_000;
export const GUEST_KEY = {
  requireRegistration: "rooms.hotel.guest.requireRegistration",
  keepIdImageDefault: "rooms.hotel.guest.keepIdImageDefault",
  retainYears: "rooms.hotel.guest.retainYears",
  maskIdForStaff: "rooms.hotel.guest.maskIdForStaff",
  aiIdReader: "rooms.hotel.guest.aiIdReader",
  rr3OnScreen: "rooms.hotel.rr3OnScreen",
  tm30Enabled: "rooms.hotel.tm30.enabled",
  tm30ReminderHours: "rooms.hotel.tm30ReminderHours",
  tm30Columns: "rooms.hotel.tm30.exportColumns",
  licenseNo: "rooms.hotel.license.no",
  licenseName: "rooms.hotel.license.name",
  registrarOffice: "rooms.hotel.license.registrarOffice",
  inspectionRequired: "rooms.hotel.inspectionRequired",
  secDepEnabled: "rooms.hotel.securityDeposit.enabled",
  secDepAppliesTo: "rooms.hotel.securityDeposit.appliesTo",
  secDepAmount: "rooms.hotel.securityDeposit",
} as const;

export const R = {
  notFound: "ไม่พบผู้เข้าพัก การจอง หรือโรงแรมนี้ (หรืออยู่นอกสาขาที่คุณดูแล)",
  forbidden: "คุณยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน",
  busy: "ระบบไม่ว่าง ลองใหม่อีกครั้ง",
  noKey: "ระบบเข้ารหัสข้อมูลผู้เข้าพักยังไม่พร้อม — แจ้งผู้ดูแลระบบ (ยังไม่บันทึกอะไร)",
  afterCheckout: "หลังเช็กเอาต์แล้ว แก้ทะเบียนผู้พักได้เฉพาะผู้จัดการหรือเจ้าของร้าน",
};

/**
 * แบบบัตรทะเบียนผู้พัก (ร.ร.3) — ช่องตามแบบท้ายประกาศกระทรวงมหาดไทยว่าด้วยแบบ ร.ร.3/ร.ร.4 ฉบับปัจจุบัน (ออกตาม พ.ร.บ.โรงแรม 2547 ม.35)
 * ลำดับ = ลำดับบนแบบพิมพ์ · source = ที่มาของค่าในระบบ · 🔴 ที่ปรึกษากฎหมายตรวจเทียบแบบท้ายประกาศจริงก่อนรับใบ (J3 · Q-H4-2)
 */
export const RR3_FIELDS: readonly { key: string; label: string; source: string }[] = [
  { key: "hotelName", label: "ชื่อโรงแรม (ตามใบอนุญาต) / license", source: "ค่าตั้ง rooms.hotel.license.name" },
  { key: "licenseNo", label: "เลขที่ใบอนุญาตประกอบธุรกิจโรงแรม", source: "ค่าตั้ง rooms.hotel.license.no" },
  { key: "cardNo", label: "เลขที่บัตร ร.ร.3 (ลำดับต่อปี)", source: "ลำดับ createdAt ต่อหน่วยต่อปี พ.ศ." },
  { key: "checkInAt", label: "วันเวลาที่เข้าพัก", source: "HotelReservation.checkedInAt" },
  { key: "checkOutDate", label: "วันที่ออก (กำหนด)", source: "HotelReservation.checkOutDate" },
  { key: "roomNumber", label: "ห้องพักเลขที่", source: "ห้องที่เช็กอิน" },
  { key: "fullName", label: "ชื่อตัว ชื่อสกุล", source: "HotelGuestRecord.fullName" },
  { key: "nationality", label: "สัญชาติ", source: "HotelGuestRecord.nationality (ISO-3 + ชื่อไทย)" },
  { key: "dob", label: "วันเดือนปีเกิด", source: "HotelGuestRecord.dob" },
  { key: "occupation", label: "อาชีพ", source: "กล่องลับ" },
  { key: "idDocument", label: "ชนิดและเลขที่บัตรประจำตัวประชาชน/หนังสือเดินทาง (idType · idNumber)", source: "idType + กล่องลับ (แสดง 4 ตัวท้าย)" },
  { key: "address", label: "ที่อยู่ปัจจุบัน", source: "กล่องลับ" },
  { key: "arrivedFrom", label: "มาจาก (from)", source: "HotelGuestRecord.arrivedFrom" },
  { key: "nextDestination", label: "จะไปที่ (destination)", source: "HotelGuestRecord.nextDestination" },
  { key: "companions", label: "จำนวนผู้พักร่วม (guests)", source: "แถวผู้พักของการจองเดียวกัน" },
  { key: "signature", label: "ลายมือชื่อผู้พัก (sign)", source: "ไฟล์ลายเซ็น private หรือ ลงชื่อบนกระดาษ" },
  { key: "recordedBy", label: "ผู้บันทึก (staff)", source: "AuditLog hotel.guest.registered" },
];

// ───────────────────────── ตัวช่วยทั่วไป ─────────────────────────
export const gfail = (code: string, reason: string): GuestFail => ({ ok: false, code, reason });
export const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const isGuestFail = (v: unknown): v is GuestFail => isRec(v) && v.ok === false;
export const ymdOfDb = (d: Date): string => d.toISOString().slice(0, 10);
export const dbDate = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);
export const jsonOf = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
export const zodReason = (e: z.ZodError): string => {
  const m = e.issues[0]?.message ?? "";
  return /[฀-๿]/.test(m) ? m : "ข้อมูลผู้เข้าพักไม่ครบหรือไม่ถูกต้อง";
};
/** ธุรกรรมชน/หมดเวลา/deadlock ⇒ BUSY (แบบ booking.ts) */
export function isTxBusy(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    for (const c of [o.code, o.originalCode]) if (c === "P2028" || c === "P2034" || c === "40P01") return true;
    const meta = o.meta && typeof o.meta === "object" ? (o.meta as { code?: unknown; driverAdapterError?: unknown }) : null;
    if (meta?.code === "40P01") return true;
    if (typeof o.message === "string" && /deadlock detected|40P01/i.test(o.message)) return true;
    cur = o.cause ?? meta?.driverAdapterError;
  }
  return false;
}
/** ย้อนทั้ง tx พร้อมผลปฏิเสธ */
export class GuestAbort extends Error {
  constructor(readonly result: GuestFail) {
    super(result.code);
  }
}
/** createdAt เพิ่มขึ้นเสมอในโพรเซสเดียว (ลำดับ ร.ร.3 ไม่ชนกันเมื่อบันทึกหลายคนใน tx เดียว) */
let lastStamp = 0;
export function nextCreatedAt(): Date {
  const t = Math.max(Date.now(), lastStamp + 1);
  lastStamp = t;
  return new Date(t);
}
/** นาฬิกาฉาก: input.at/now ใช้เฉพาะเมื่อ SVC_QC_CLOCK = "1" (อ่านทุกครั้ง) · อื่น ⇒ เวลาเครื่อง */
export function guestClock(input: unknown, key: "at" | "now" = "at"): Date {
  if (process.env.SVC_QC_CLOCK === "1" && isRec(input)) {
    const v = input[key];
    const d = v instanceof Date ? v : typeof v === "string" ? new Date(v) : null;
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
export function actorOfInput(a: unknown): HotelGuestActor | null {
  if (!isRec(a) || !isStr(a.role) || !isStr(a.userId)) return null;
  return {
    role: a.role as MembershipCtx["role"],
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter(isStr) : [],
    permissions: isRec(a.permissions) ? a.permissions : {},
    userId: a.userId,
  };
}
export const canDo = (g: { actor: HotelGuestActor; unitId: string }, action: string): boolean => evaluate(g.actor, { module: "hotel", action, unitId: g.unitId });
export const isManagerRole = (a: HotelGuestActor): boolean => a.role === "OWNER" || a.role === "MANAGER";
export const tenantOf = (ctx: unknown): string | null => (isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : null);

/** หน่วยโรงแรมของร้าน (ไม่ใช่ HOTEL/ร้านอื่น ⇒ null) */
export async function hotelUnitOf(tenantId: string, unitId: unknown): Promise<{ id: string; name: string } | null> {
  if (!isStr(unitId)) return null;
  return tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true, name: true } });
}
/**
 * ด่าน: ร้าน → หน่วย HOTEL → ผู้กระทำเข้าหน่วยได้ (ไม่ได้ ⇒ NOT_FOUND เหมือนไม่มี · X1) → สิทธิ์ (ข้อใดข้อหนึ่งใน need ⇒ ผ่าน · ไม่ผ่าน ⇒ FORBIDDEN)
 */
export async function guestGate(actorIn: unknown, ctx: unknown, unitId: unknown, need: readonly string[] | null): Promise<GuestGate | GuestFail> {
  const tenantId = tenantOf(ctx);
  const actor = actorOfInput(actorIn);
  if (!tenantId || !actor) return gfail("NOT_FOUND", R.notFound);
  const unit = await hotelUnitOf(tenantId, unitId);
  if (!unit) return gfail("NOT_FOUND", R.notFound);
  if (!canAccessUnit(actor, unit.id)) return gfail("NOT_FOUND", R.notFound);
  const g: GuestGate = { tenantId, unitId: unit.id, unitName: unit.name, actor };
  if (need && need.length && !need.some((k) => canDo(g, k))) return gfail("FORBIDDEN", R.forbidden);
  return g;
}
/** หน่วยของการจอง (ในร้านนี้) — SQL อ่านอย่างเดียว ก่อนรู้หน่วย */
export async function unitOfReservation(tenantId: string, reservationId: unknown): Promise<string | null> {
  if (!isStr(reservationId) || reservationId.length > 64) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<{ unitId: string }[]>`SELECT "unitId" FROM "HotelReservation" WHERE "id" = ${reservationId} AND "tenantId" = ${tenantId} LIMIT 1`;
  return rows[0]?.unitId ?? null;
}
/** หน่วย/การจองของแถวผู้พัก (ในร้านนี้) */
export async function locateGuest(tenantId: string, guestId: unknown): Promise<{ unitId: string; reservationId: string } | null> {
  if (!isStr(guestId) || guestId.length > 64) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<{ unitId: string; reservationId: string }[]>`SELECT "unitId", "reservationId" FROM "HotelGuestRecord" WHERE "id" = ${guestId} AND "tenantId" = ${tenantId} LIMIT 1`;
  return rows[0] ?? null;
}

// ───────────────────────── ค่าตั้ง ─────────────────────────
export type GuestSettings = {
  requireRegistration: boolean;
  keepIdImageDefault: boolean;
  retainYears: number;
  maskIdForStaff: boolean;
  aiIdReader: boolean;
  rr3OnScreen: boolean;
  tm30Enabled: boolean;
  tm30ReminderHours: number;
  tm30Columns: unknown;
  licenseNo: string | null;
  licenseName: string | null;
  registrarOffice: string | null;
  inspectionRequired: boolean;
  secDepEnabled: boolean;
  secDepAppliesTo: string;
  secDepAmount: number;
};
const fallbackOf = (key: string): unknown => getDef(key)?.defaults?._fallback;
export async function guestSettings(tenantId: string, unitId: string): Promise<GuestSettings> {
  const keys = Object.values(GUEST_KEY) as string[];
  let v: Record<string, unknown> = {};
  try {
    const r = await resolveSettings({ tenantId }, keys, { unitId });
    v = Object.fromEntries(keys.map((k) => [k, r[k]?.value]));
  } catch {
    v = Object.fromEntries(keys.map((k) => [k, fallbackOf(k)]));
  }
  const b = (k: string): boolean => (typeof v[k] === "boolean" ? (v[k] as boolean) : fallbackOf(k) === true);
  const n = (k: string, d: number): number => (typeof v[k] === "number" && Number.isFinite(v[k]) ? (v[k] as number) : typeof fallbackOf(k) === "number" ? (fallbackOf(k) as number) : d);
  const s = (k: string): string | null => (typeof v[k] === "string" && (v[k] as string).trim() ? (v[k] as string).trim() : null);
  return {
    requireRegistration: b(GUEST_KEY.requireRegistration),
    keepIdImageDefault: b(GUEST_KEY.keepIdImageDefault),
    retainYears: Math.max(1, Math.round(n(GUEST_KEY.retainYears, 2))),
    maskIdForStaff: b(GUEST_KEY.maskIdForStaff),
    aiIdReader: b(GUEST_KEY.aiIdReader),
    rr3OnScreen: b(GUEST_KEY.rr3OnScreen),
    tm30Enabled: b(GUEST_KEY.tm30Enabled),
    tm30ReminderHours: Math.max(0, n(GUEST_KEY.tm30ReminderHours, 6)),
    tm30Columns: v[GUEST_KEY.tm30Columns] ?? fallbackOf(GUEST_KEY.tm30Columns),
    licenseNo: s(GUEST_KEY.licenseNo),
    licenseName: s(GUEST_KEY.licenseName),
    registrarOffice: s(GUEST_KEY.registrarOffice),
    inspectionRequired: b(GUEST_KEY.inspectionRequired),
    secDepEnabled: b(GUEST_KEY.secDepEnabled),
    secDepAppliesTo: typeof v[GUEST_KEY.secDepAppliesTo] === "string" ? (v[GUEST_KEY.secDepAppliesTo] as string) : "ALL",
    secDepAmount: Math.max(0, Math.round(n(GUEST_KEY.secDepAmount, 0))),
  };
}
/** วันเก็บถึง = วันออก + N ปี (ปฏิทิน UTC ของวันที่ @db.Date) */
export function retainUntilOf(checkOut: Date, years: number): Date {
  return new Date(Date.UTC(checkOut.getUTCFullYear() + years, checkOut.getUTCMonth(), checkOut.getUTCDate()));
}

// ───────────────────────── ไฟล์ (X6 · X10) ─────────────────────────
export type ValidFile = { data: Uint8Array; contentType: string };
const MAGIC: Record<string, (d: Uint8Array) => boolean> = {
  "image/png": (d) => d.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => d[i] === b),
  "image/jpeg": (d) => d.length >= 3 && d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff,
  "image/webp": (d) => d.length >= 12 && d[0] === 0x52 && d[1] === 0x49 && d[2] === 0x46 && d[3] === 0x46 && d[8] === 0x57 && d[9] === 0x45 && d[10] === 0x42 && d[11] === 0x50,
  "application/pdf": (d) => d.length >= 5 && d[0] === 0x25 && d[1] === 0x50 && d[2] === 0x44 && d[3] === 0x46 && d[4] === 0x2d,
};
/** ไฟล์ที่รับ: ชนิดในรายการ + ไบต์หัวตรงชนิด + ขนาด 1 ไบต์–8 MB · ผิด ⇒ INVALID_FILE (ข้อความไทย) */
export function checkFile(v: unknown, kinds: readonly string[]): ValidFile | GuestFail {
  if (!isRec(v) || !(v.data instanceof Uint8Array) || typeof v.contentType !== "string") return gfail("INVALID_FILE", "ไฟล์ไม่ถูกต้อง — ใช้รูป PNG หรือ JPEG");
  const ct = v.contentType.split(";")[0]!.trim().toLowerCase();
  if (!kinds.includes(ct)) return gfail("INVALID_FILE", kinds.includes("application/pdf") ? "ชนิดไฟล์นี้ใช้ไม่ได้ — ใช้รูป PNG/JPEG หรือ PDF" : "ชนิดไฟล์นี้ใช้ไม่ได้ — ใช้รูป PNG หรือ JPEG");
  if (v.data.length < 1) return gfail("INVALID_FILE", "ไฟล์ว่างเปล่า");
  if (v.data.length > GUEST_FILE_MAX_BYTES) return gfail("INVALID_FILE", "ไฟล์ใหญ่เกิน 8 MB — ย่อขนาดรูปก่อนอัปโหลด");
  if (!MAGIC[ct]?.(v.data)) return gfail("INVALID_FILE", "เนื้อไฟล์ไม่ตรงกับชนิดไฟล์ — ถ่ายรูปใหม่หรือเลือกไฟล์อื่น");
  return { data: v.data, contentType: ct };
}
export const IMAGE_KINDS = ["image/png", "image/jpeg", "image/webp"] as const;
export const SIGNATURE_KINDS = ["image/png", "image/jpeg"] as const;
export const EVIDENCE_KINDS = ["image/png", "image/jpeg", "application/pdf"] as const;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };
/** อัปไฟล์ส่วนตัว (ชื่อไฟล์ไม่มีชื่อ/เลขแขก · path สุ่มของ storage) */
export async function uploadGuestFile(tenantId: string, f: ValidFile, label: "doc" | "sign" | "tm30"): Promise<{ ok: true; fileId: string } | GuestFail> {
  const up = await uploadFile({ tenantId }, { kind: "ATTACHMENT", filename: `hotel-${label}.${EXT[f.contentType] ?? "bin"}`, contentType: f.contentType, data: f.data, maxBytes: GUEST_FILE_MAX_BYTES, visibility: "private" });
  if (!up.ok) return gfail("UPLOAD_FAILED", up.error);
  return { ok: true, fileId: up.assetId };
}
/** ลบไฟล์ (best-effort · ไม่โยน) */
export async function dropGuestFile(tenantId: string, fileId: string | null | undefined): Promise<void> {
  if (!fileId) return;
  try {
    await deleteFileAsset({ tenantId }, fileId);
  } catch {
    /* best-effort — แถวในฐานล้างแล้ว */
  }
}
/** ลิงก์ไฟล์ส่วนตัวอายุ ≤ 15 นาที ผูกผู้ดู (พนักงาน) — ผู้เรียกตรวจสิทธิ์แล้ว */
function fileLink(fileId: string | null | undefined, viewerUserId: string | null): string | null {
  if (!fileId || !viewerUserId) return null;
  try {
    return privateFileUrl(fileId, { kind: "STAFF", id: viewerUserId });
  } catch {
    return null;
  }
}

// ───────────────────────── อินพุตผู้พัก ─────────────────────────
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validYmd = (s: string) => YMD.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const ymdZ = z.string().regex(YMD, "วันที่ต้องอยู่ในรูป ปปปป-ดด-วว").refine(validYmd, "วันที่ไม่ถูกต้อง");
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `ข้อความยาวเกิน ${max} ตัวอักษร`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const GuestZ = z.object({
  fullName: z.string({ error: "กรอกชื่อ-สกุลผู้เข้าพัก" }).trim().min(1, "กรอกชื่อ-สกุลผู้เข้าพัก").max(200, "ชื่อ-สกุลยาวเกิน 200 ตัวอักษร"),
  nationality: z.string({ error: "เลือกสัญชาติของผู้เข้าพัก" }).regex(/^[A-Z]{3}$/, "สัญชาติต้องเป็นรหัส 3 ตัวอักษรพิมพ์ใหญ่ เช่น THA หรือ DEU"),
  idType: z.enum(["PASSPORT", "THAI_ID", "OTHER"], { error: "เลือกชนิดเอกสาร (หนังสือเดินทาง · บัตรประชาชน · อื่น ๆ)" }),
  idNumber: z.string({ error: "กรอกเลขเอกสารของผู้เข้าพัก" }).trim().min(1, "กรอกเลขเอกสารของผู้เข้าพัก").max(40, "เลขเอกสารยาวเกินไป"),
  dob: ymdZ.optional().nullable(),
  sex: z.enum(["M", "F", "X"], { error: "เพศไม่ถูกต้อง" }).optional().nullable(),
  occupation: optText(120),
  address: optText(300),
  arrivedFrom: optText(120),
  nextDestination: optText(120),
  visaType: optText(40),
  visaNo: optText(40),
  arrivalDate: ymdZ.optional().nullable(),
  portOfEntry: optText(80),
  tm6No: optText(40),
  docExpiry: ymdZ.optional().nullable(),
  idImage: z.unknown().optional().nullable(),
  keepIdImage: z.boolean().optional(),
  aiProposed: z.boolean().optional(),
  confirmed: z.boolean().optional(),
});
export type PreparedGuest = {
  fullName: string;
  nationality: string;
  idType: GuestIdType;
  idValue: string;
  last4: string;
  dob: string | null;
  arrivedFrom: string | null;
  nextDestination: string | null;
  secret: GuestSecret;
  image: ValidFile | null;
  keepImage: boolean;
};
/** ผู้พักหลักต้องมีชื่อ · สัญชาติ · ชนิด+เลขเอกสาร (มติ 1) — ขาด ⇒ GUEST_REQUIRED */
export function hasRequiredGuestFields(raw: unknown): boolean {
  return isRec(raw) && isStr(raw.fullName) && isStr(raw.nationality) && isStr(raw.idType) && isStr(raw.idNumber);
}
/** ตรวจ/ทำรูปอินพุตผู้พัก 1 คน (ยังไม่เขียนอะไร) */
export function prepareGuest(raw: unknown, keepDefault: boolean, today: string): PreparedGuest | GuestFail {
  const src = isRec(raw) ? { ...raw } : {};
  if (src.docExpiry === undefined && typeof src.expiry === "string") src.docExpiry = src.expiry;
  const p = GuestZ.safeParse(src);
  if (!p.success) return gfail("INVALID_INPUT", zodReason(p.error));
  const g = p.data;
  if (!(GUEST_ID_TYPES as readonly string[]).includes(g.idType)) return gfail("INVALID_INPUT", "เลือกชนิดเอกสาร");
  if (g.dob && g.dob > today) return gfail("INVALID_INPUT", "วันเกิดเป็นวันในอนาคตไม่ได้");
  if (g.aiProposed === true && g.confirmed !== true) return gfail("INVALID_INPUT", "ข้อมูลนี้ระบบอ่านจากรูปให้ — พนักงานต้องตรวจและกดยืนยันทุกช่องก่อนบันทึก");
  const id = validateIdNumber(g.idType, g.idNumber);
  if (!id.ok) return gfail("INVALID_ID", id.reason);
  if (g.idType === "THAI_ID" && g.nationality !== "THA") return gfail("INVALID_ID", "บัตรประชาชนไทยใช้กับผู้เข้าพักสัญชาติไทยเท่านั้น — ชาวต่างชาติใช้หนังสือเดินทาง");
  let image: ValidFile | null = null;
  if (g.idImage !== undefined && g.idImage !== null) {
    const f = checkFile(g.idImage, IMAGE_KINDS);
    if (isGuestFail(f)) return f;
    image = f;
  }
  return {
    fullName: g.fullName,
    nationality: g.nationality,
    idType: g.idType,
    idValue: id.value,
    last4: idLast4(id.value),
    dob: g.dob ?? null,
    arrivedFrom: g.arrivedFrom,
    nextDestination: g.nextDestination,
    secret: {
      id: id.value,
      sex: g.sex ?? null,
      occupation: g.occupation,
      address: g.address,
      visaType: g.visaType,
      visaNo: g.visaNo,
      arrivalDate: g.arrivalDate ?? null,
      portOfEntry: g.portOfEntry,
      tm6No: g.tm6No,
      docExpiry: g.docExpiry ?? null,
    },
    image,
    keepImage: g.keepIdImage ?? keepDefault,
  };
}
/** อ่านกล่องลับของแถว (AAD = recordId) · ล้างแล้ว/เปิดไม่ได้ ⇒ null */
export function openGuestSecret(row: { id: string; idNumberEnc: string | null }): GuestSecret | null {
  const o = openIntegrationSecret(row.idNumberEnc, row.id);
  if (!o || typeof o.id !== "string") return null;
  const s = (k: string): string | null => (typeof o[k] === "string" && (o[k] as string) ? (o[k] as string) : null);
  return { id: o.id, sex: s("sex"), occupation: s("occupation"), address: s("address"), visaType: s("visaType"), visaNo: s("visaNo"), arrivalDate: s("arrivalDate"), portOfEntry: s("portOfEntry"), tm6No: s("tm6No"), docExpiry: s("docExpiry") };
}
/** มุมมองที่ลง AuditLog — ไม่มีชื่อ/เลขเต็ม (แค่ 4 ตัวท้าย + สถานะ) */
export function guestAuditView(r: { nationality: string | null; idType: string | null; idNumberLast4: string | null; isForeigner: boolean; tm30Status: string; rr3SignedAt: Date | null; idImageFileId: string | null; signatureFileId: string | null; arrivedFrom?: string | null; nextDestination?: string | null }) {
  return {
    nationality: r.nationality,
    idType: r.idType,
    idNumberLast4: r.idNumberLast4,
    idMasked: maskFromLast4(r.idNumberLast4),
    isForeigner: r.isForeigner,
    tm30Status: r.tm30Status,
    signed: !!r.rr3SignedAt,
    hasIdImage: !!r.idImageFileId,
    hasSignature: !!r.signatureFileId,
  };
}
export async function guestAudit(tx: Tx, c: { tenantId: string; unitId: string }, actorId: string | null, action: string, targetId: string, before: unknown, after: unknown): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: c.tenantId,
      unitId: c.unitId,
      actorType: actorId ? "USER" : "SYSTEM",
      actorId: actorId ?? SYSTEM_ACTOR_ID,
      action,
      targetType: "HotelGuestRecord",
      targetId,
      before: before === null ? undefined : jsonOf(before),
      after: after === null ? undefined : jsonOf(after),
    },
  });
}
/** ตม.30 ของผู้พักคนนี้ ณ ตอนบันทึก: ไม่ใช่ต่างด้าว/ปิดระบบ ⇒ NOT_REQUIRED · ต่างด้าว ⇒ PENDING (ครบกำหนด = เวลาเข้าพัก + 24 ชม. · ยังไม่เช็กอิน = ยังไม่มีกำหนด) */
export function tm30Initial(nationality: string, enabled: boolean, arrivedAt: Date | null): { status: Tm30Status; dueAt: Date | null } {
  if (!isForeigner(nationality) || !enabled) return { status: "NOT_REQUIRED", dueAt: null };
  return { status: "PENDING", dueAt: arrivedAt ? new Date(arrivedAt.getTime() + TM30_WINDOW_MS) : null };
}

/**
 * เขียนแถวผู้พักใหม่ใน tx ของผู้เรียก (กล่องลับ AAD = id ของแถว · AuditLog แบบ mask · outbox hotel.guest.registered ไม่มี PII)
 * signedAt = เวลาลงชื่อ (ปกติ null — ลงชื่อผ่าน signRr3)
 */
export async function insertGuestTx(
  tx: Tx,
  c: { tenantId: string; unitId: string },
  rv: { id: string; checkOutDate: Date },
  g: PreparedGuest,
  o: { actorId: string; imageFileId: string | null; tm30: { status: Tm30Status; dueAt: Date | null }; retainYears: number; signedAt: Date | null; via: string },
): Promise<string> {
  const row = await tx.hotelGuestRecord.create({
    data: {
      tenantId: c.tenantId,
      unitId: c.unitId,
      reservationId: rv.id,
      fullName: g.fullName,
      nationality: g.nationality,
      idType: g.idType,
      idNumberLast4: g.last4,
      dob: g.dob ? dbDate(g.dob) : null,
      arrivedFrom: g.arrivedFrom,
      nextDestination: g.nextDestination,
      idImageFileId: o.imageFileId,
      isForeigner: isForeigner(g.nationality),
      tm30Status: o.tm30.status,
      tm30DueAt: o.tm30.dueAt,
      rr3SignedAt: o.signedAt,
      retainUntil: retainUntilOf(rv.checkOutDate, o.retainYears),
      createdAt: nextCreatedAt(),
    },
  });
  const enc = sealIntegrationSecret({ ...g.secret }, row.id);
  const after = await tx.hotelGuestRecord.update({ where: { id: row.id }, data: { idNumberEnc: enc } });
  await guestAudit(tx, c, o.actorId, "hotel.guest.registered", row.id, {}, { ...guestAuditView(after), reservationId: rv.id, via: o.via });
  await emitOutbox(tx, {
    tenantId: c.tenantId,
    unitId: c.unitId,
    type: "hotel.guest.registered",
    idempotencyKey: `hotel.guest.registered#${row.id}`,
    payload: { tenantId: c.tenantId, unitId: c.unitId, guestId: row.id, reservationId: rv.id, isForeigner: after.isForeigner },
  });
  return row.id;
}

// ───────────────────────── upsertGuestRecord ─────────────────────────
const UpsertZ = z.object({ reservationId: z.string().min(1).max(64), guestId: z.string().min(1).max(64).optional().nullable() });
const EDITABLE = new Set(["HOLD", "CONFIRMED", "BOOKED", "CHECKED_IN", "CHECKED_OUT"]);

/**
 * เพิ่ม/แก้ทะเบียนผู้พัก (สิทธิ์ hotel.guest.register) — ก่อนเข้าพัก (ลงทะเบียนล่วงหน้า) · ระหว่างพัก (ผู้พักร่วม) · หลังเช็กเอาต์ = ผู้จัดการ/เจ้าของเท่านั้น (มติ 4)
 * รูปเอกสาร: เก็บเมื่อ keepIdImage (ค่าเริ่มจากค่าตั้ง) · รูปใหม่แทนรูปเดิม ⇒ ลบไฟล์เดิม · ไม่เก็บ ⇒ ไม่อัป
 */
export async function upsertGuestRecord(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; guestId: string; created: boolean } | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const unitId = await unitOfReservation(tenantId, input.reservationId);
  const g = await guestGate(actorIn, ctx, unitId, ["hotel.guest.register"]);
  if (isGuestFail(g)) return g;
  const p = UpsertZ.safeParse(input);
  if (!p.success) return gfail("INVALID_INPUT", zodReason(p.error));
  if (!integrationSecretKeyConfigured()) return gfail("NOT_CONFIGURED", R.noKey);
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const rv = await db.hotelReservation.findFirst({ where: { id: p.data.reservationId }, select: { id: true, status: true, checkedInAt: true, checkOutDate: true } });
  if (!rv) return gfail("NOT_FOUND", R.notFound);
  if (!EDITABLE.has(rv.status)) return gfail("INVALID_STATUS", "การจองนี้ถูกยกเลิก/ไม่มาเข้าพัก — ลงทะเบียนผู้พักไม่ได้");
  if (rv.status === "CHECKED_OUT" && !isManagerRole(g.actor)) return gfail("FORBIDDEN", R.afterCheckout);
  const st = await guestSettings(g.tenantId, g.unitId);
  const now = new Date();
  const prep = prepareGuest(input.guest, st.keepIdImageDefault, bkkYmd(now));
  if (isGuestFail(prep)) return prep;
  const existing = p.data.guestId ? await db.hotelGuestRecord.findFirst({ where: { id: p.data.guestId, reservationId: rv.id } }) : null;
  if (p.data.guestId && !existing) return gfail("NOT_FOUND", R.notFound);
  let newFile: string | null = null;
  if (prep.image && prep.keepImage) {
    const up = await uploadGuestFile(g.tenantId, prep.image, "doc");
    if (isGuestFail(up)) return up;
    newFile = up.fileId;
  }
  try {
    const out = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      if (!existing) {
        // ผู้พักที่เพิ่มระหว่างพัก: ตม.30 ครบกำหนด = เวลาลงทะเบียน (= เวลาที่แจ้งว่าเข้าพัก) + 24 ชม. · นาฬิกาฉาก input.at ใต้ SVC_QC_CLOCK เท่านั้น
        //   ลงชื่อแทนห้อง (มติ 2) ครอบคลุมผู้พักที่มีอยู่ตอนลงชื่อ — คนที่เพิ่มทีหลังลงชื่อเองหรือให้ผู้พักหลักลงใหม่
        const arrivedAt = rv.status === "CHECKED_IN" ? guestClock(input, "at") : null;
        const id = await insertGuestTx(tx, c, rv, prep, {
          actorId: g.actor.userId,
          imageFileId: newFile,
          tm30: tm30Initial(prep.nationality, st.tm30Enabled, arrivedAt),
          retainYears: st.retainYears,
          signedAt: null,
          via: rv.status === "CHECKED_IN" ? "IN_STAY" : rv.status === "CHECKED_OUT" ? "AFTER_CHECKOUT" : "PRE_ARRIVAL",
        });
        return { guestId: id, created: true, oldFile: null as string | null };
      }
      const cur = await tx.hotelGuestRecord.findFirst({ where: { id: existing.id } });
      if (!cur) throw new GuestAbort(gfail("NOT_FOUND", R.notFound));
      const before = guestAuditView(cur);
      const prevSecret = openGuestSecret(cur);
      const changed: string[] = [];
      if (cur.fullName !== prep.fullName) changed.push("fullName");
      if (cur.nationality !== prep.nationality) changed.push("nationality");
      if (cur.idType !== prep.idType || prevSecret?.id !== prep.idValue) changed.push("idNumber");
      if ((cur.dob ? ymdOfDb(cur.dob) : null) !== prep.dob) changed.push("dob");
      if (cur.arrivedFrom !== prep.arrivedFrom) changed.push("arrivedFrom");
      if (cur.nextDestination !== prep.nextDestination) changed.push("nextDestination");
      for (const k of ["sex", "occupation", "address", "visaType", "visaNo", "arrivalDate", "portOfEntry", "tm6No", "docExpiry"] as const) if ((prevSecret?.[k] ?? null) !== prep.secret[k]) changed.push(k);
      if (newFile) changed.push("idImage");
      const foreign = isForeigner(prep.nationality);
      const tm30 = cur.tm30Status === "FILED" ? null : foreign && st.tm30Enabled ? (cur.tm30Status === "NOT_REQUIRED" ? tm30Initial(prep.nationality, true, rv.status === "CHECKED_IN" ? now : null) : null) : { status: "NOT_REQUIRED" as Tm30Status, dueAt: null };
      const after = await tx.hotelGuestRecord.update({
        where: { id: cur.id },
        data: {
          fullName: prep.fullName,
          nationality: prep.nationality,
          idType: prep.idType,
          idNumberLast4: prep.last4,
          idNumberEnc: sealIntegrationSecret({ ...prep.secret }, cur.id),
          dob: prep.dob ? dbDate(prep.dob) : null,
          arrivedFrom: prep.arrivedFrom,
          nextDestination: prep.nextDestination,
          isForeigner: foreign,
          ...(tm30 ? { tm30Status: tm30.status, tm30DueAt: tm30.dueAt } : {}),
          ...(newFile ? { idImageFileId: newFile } : {}),
        },
      });
      await guestAudit(tx, c, g.actor.userId, "hotel.guest.updated", cur.id, before, { ...guestAuditView(after), changed, afterCheckout: rv.status === "CHECKED_OUT" });
      return { guestId: cur.id, created: false, oldFile: newFile && cur.idImageFileId !== newFile ? cur.idImageFileId : null };
    }, GUEST_TX);
    if (out.oldFile) await dropGuestFile(g.tenantId, out.oldFile);
    return { ok: true, guestId: out.guestId, created: out.created };
  } catch (e) {
    await dropGuestFile(g.tenantId, newFile);
    if (e instanceof GuestAbort) return e.result;
    if (isTxBusy(e)) return gfail("BUSY", R.busy);
    throw e;
  }
}

// ───────────────────────── deleteGuestRecord (มติ 4 · §9 ข้อ 8) ─────────────────────────
/** ลบแถวที่สร้างผิด: คนเดิม · ภายใน 10 นาที · ยังไม่ลงชื่อ · ยังไม่แจ้ง ตม. · ไม่ทำให้การจองที่พักอยู่เหลือ 0 คน */
export async function deleteGuestRecord(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true } | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const loc = await locateGuest(tenantId, input.guestId);
  const g = await guestGate(actorIn, ctx, loc?.unitId ?? null, ["hotel.guest.register"]);
  if (isGuestFail(g) || !loc) return isGuestFail(g) ? g : gfail("NOT_FOUND", R.notFound);
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const row = await db.hotelGuestRecord.findFirst({ where: { id: String(input.guestId) } });
  if (!row) return gfail("NOT_FOUND", R.notFound);
  const reg = await tenantDb({ tenantId: g.tenantId }).auditLog.findFirst({ where: { action: "hotel.guest.registered", targetType: "HotelGuestRecord", targetId: row.id }, orderBy: { createdAt: "asc" }, select: { actorId: true } });
  if (!reg || reg.actorId !== g.actor.userId) return gfail("FORBIDDEN", "ลบได้เฉพาะคนที่บันทึกแถวนี้ ภายใน 10 นาทีหลังบันทึก — นอกนั้นให้แก้ไขแทน (ทะเบียนต้องเก็บตามกฎหมาย)");
  if (Date.now() - row.createdAt.getTime() > DELETE_WINDOW_MS) return gfail("NOT_EDITABLE", "เกิน 10 นาทีหลังบันทึกแล้ว — ลบไม่ได้ (ทะเบียนผู้พักต้องเก็บตามกฎหมาย) ให้แก้ไขแทน");
  if (row.rr3SignedAt || row.signatureFileId || row.tm30Status === "FILED") return gfail("NOT_EDITABLE", "ผู้พักลงชื่อหรือแจ้ง ตม.30 แล้ว — ลบไม่ได้");
  try {
    const out = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      const rv = await tx.hotelReservation.findFirst({ where: { id: row.reservationId }, select: { status: true } });
      const n = await tx.hotelGuestRecord.count({ where: { reservationId: row.reservationId } });
      if (rv?.status === "CHECKED_IN" && n <= 1) throw new GuestAbort(gfail("NOT_EDITABLE", "การจองที่พักอยู่ต้องมีผู้พักอย่างน้อย 1 คนในทะเบียน"));
      const del = await tx.hotelGuestRecord.deleteMany({ where: { id: row.id, rr3SignedAt: null, signatureFileId: null } });
      if (del.count !== 1) throw new GuestAbort(gfail("NOT_EDITABLE", "แถวนี้เพิ่งถูกเปลี่ยน — โหลดใหม่แล้วลองอีกครั้ง"));
      await guestAudit(tx, c, g.actor.userId, "hotel.guest.deleted", row.id, guestAuditView(row), { reservationId: row.reservationId, reason: "สร้างผิดภายใน 10 นาที" });
      return row.idImageFileId;
    }, GUEST_TX);
    await dropGuestFile(g.tenantId, out);
    return { ok: true };
  } catch (e) {
    if (e instanceof GuestAbort) return e.result;
    if (isTxBusy(e)) return gfail("BUSY", R.busy);
    throw e;
  }
}

// ───────────────────────── listGuests ─────────────────────────
const ListZ = z.object({
  unitId: z.string().min(1),
  from: ymdZ.optional().nullable(),
  to: ymdZ.optional().nullable(),
  q: z.string().trim().max(80).optional().nullable(),
  tm30: z.enum(["NOT_REQUIRED", "PENDING", "FILED", "LATE"]).optional().nullable(),
  reservationId: z.string().min(1).max(64).optional().nullable(),
  limit: z.number().int().min(1).max(2000).optional(),
});
const LIST_PERMS = ["hotel.guest.register", "hotel.guest.viewId", "hotel.reservation.checkIn", "hotel.reservation.checkOut"];
type ListRow = GuestRow & { reservation: { code: string; status: string; checkInDate: Date; checkOutDate: Date; room: { number: string } | null } };
function toDto(r: ListRow): GuestDto {
  return {
    id: r.id,
    reservationId: r.reservationId,
    reservationCode: r.reservation.code,
    fullName: r.fullName,
    nationality: r.nationality,
    nationalityTh: nationalityTh(r.nationality),
    idType: r.idType,
    idNumberLast4: r.idNumberLast4,
    idMasked: maskFromLast4(r.idNumberLast4),
    isForeigner: r.isForeigner,
    tm30Status: r.tm30Status,
    tm30DueAt: r.tm30DueAt?.toISOString() ?? null,
    tm30Ref: r.tm30Ref,
    tm30FiledAt: r.tm30FiledAt?.toISOString() ?? null,
    rr3SignedAt: r.rr3SignedAt?.toISOString() ?? null,
    signed: !!r.rr3SignedAt,
    hasIdImage: !!r.idImageFileId,
    purged: !r.idNumberEnc && !!r.idType,
    dob: r.dob ? ymdOfDb(r.dob) : null,
    arrivedFrom: r.arrivedFrom,
    nextDestination: r.nextDestination,
    checkIn: ymdOfDb(r.reservation.checkInDate),
    checkOut: ymdOfDb(r.reservation.checkOutDate),
    reservationStatus: r.reservation.status,
    roomNumber: r.reservation.room?.number ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}
/** ทะเบียนผู้พักของหน่วย (กรองช่วงวันเข้า · ชื่อ/4 ตัวท้าย · สถานะ ตม.30) — DTO ไม่มีเลขเต็ม/กล่องลับ (เลขบัตรไม่เข้าการค้นหา) */
export async function listGuests(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; rows: GuestDto[] } | GuestFail> {
  const g = await guestGate(actorIn, ctx, isRec(input) ? input.unitId : null, LIST_PERMS);
  if (isGuestFail(g)) return g;
  const p = ListZ.safeParse(input);
  if (!p.success) return gfail("INVALID_INPUT", zodReason(p.error));
  const q = p.data.q?.trim() ?? "";
  const rvWhere: Prisma.HotelReservationWhereInput = {};
  if (p.data.from || p.data.to) rvWhere.checkInDate = { ...(p.data.from ? { gte: dbDate(p.data.from) } : {}), ...(p.data.to ? { lte: dbDate(p.data.to) } : {}) };
  const where: Prisma.HotelGuestRecordWhereInput = {
    ...(p.data.reservationId ? { reservationId: p.data.reservationId } : {}),
    ...(Object.keys(rvWhere).length ? { reservation: rvWhere } : {}),
    ...(p.data.tm30 ? { tm30Status: p.data.tm30 } : {}),
    ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, ...(/^[A-Za-z0-9]{4}$/.test(q) ? [{ idNumberLast4: q.toUpperCase() }] : [])] } : {}),
  };
  const rows = (await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).hotelGuestRecord.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: p.data.limit ?? 500,
    include: { reservation: { select: { code: true, status: true, checkInDate: true, checkOutDate: true, room: { select: { number: true } } } } },
  })) as ListRow[];
  return { ok: true, rows: rows.map(toDto) };
}

// ───────────────────────── revealGuestId ─────────────────────────
/** เปิดเลขเอกสารเต็มทีละครั้ง (hotel.guest.viewId · หรือ guest.register เมื่อร้านปิดการซ่อนเลข) — AuditLog + outbox ทุกครั้ง · ไม่ cache */
export async function revealGuestId(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; idNumber: string } | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const loc = await locateGuest(tenantId, input.guestId);
  const g = await guestGate(actorIn, ctx, loc?.unitId ?? null, null);
  if (isGuestFail(g)) return g;
  if (!loc) return gfail("NOT_FOUND", R.notFound);
  let allowed = canDo(g, "hotel.guest.viewId");
  if (!allowed && canDo(g, "hotel.guest.register")) allowed = !(await guestSettings(g.tenantId, g.unitId)).maskIdForStaff;
  if (!allowed) return gfail("FORBIDDEN", "ดูเลขบัตร/พาสปอร์ตเต็มต้องมีสิทธิ์ \"ดูเลขบัตร/พาสปอร์ตเต็ม\" — ขอสิทธิ์จากเจ้าของร้าน");
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const row = await db.hotelGuestRecord.findFirst({ where: { id: String(input.guestId) } });
  if (!row) return gfail("NOT_FOUND", R.notFound);
  const sec = openGuestSecret(row);
  if (!sec) return gfail("NO_DATA", row.idNumberEnc ? "เปิดข้อมูลเลขเอกสารไม่ได้ — แจ้งผู้ดูแลระบบ" : "ข้อมูลเลขเอกสารถูกลบตามระยะเวลาเก็บแล้ว (เหลือ 4 ตัวท้าย)");
  try {
    await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await guestAudit(tx, c, g.actor.userId, "hotel.guest.id_revealed", row.id, null, { idNumberLast4: row.idNumberLast4, idType: row.idType, reservationId: row.reservationId });
      await emitOutbox(tx, {
        tenantId: c.tenantId,
        unitId: c.unitId,
        type: "hotel.guest.id_revealed",
        idempotencyKey: `hotel.guest.id_revealed#${row.id}#${randomUUID()}`,
        payload: { tenantId: c.tenantId, unitId: c.unitId, guestId: row.id, byUserId: g.actor.userId },
      });
    }, GUEST_TX);
  } catch (e) {
    if (isTxBusy(e)) return gfail("BUSY", R.busy);
    throw e;
  }
  return { ok: true, idNumber: sec.id };
}

// ───────────────────────── signRr3 (มติ 2 · §9 ข้อ 9) ─────────────────────────
const SignZ = z.object({ guestId: z.string().min(1).max(64), method: z.enum(["SCREEN", "PAPER"]).optional(), note: z.string().trim().max(300).optional().nullable() });
/** ลงชื่อ ร.ร.3: ลายเซ็นบนจอ (PNG/JPEG private) หรือ ลงชื่อบนกระดาษ (method PAPER + note) · คนหนึ่งลงชื่อแทนห้องได้ (rr3SignedAt ทุกคนที่ยังไม่ลง) */
export async function signRr3(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; signedAt: string; method: "SCREEN" | "PAPER"; alreadySigned?: boolean } | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const loc = await locateGuest(tenantId, input.guestId);
  const g = await guestGate(actorIn, ctx, loc?.unitId ?? null, ["hotel.guest.register"]);
  if (isGuestFail(g)) return g;
  if (!loc) return gfail("NOT_FOUND", R.notFound);
  const p = SignZ.safeParse(input);
  if (!p.success) return gfail("INVALID_INPUT", zodReason(p.error));
  const paper = p.data.method === "PAPER";
  let sig: ValidFile | null = null;
  if (!paper) {
    const f = checkFile(input.signaturePng, SIGNATURE_KINDS);
    if (isGuestFail(f)) return f;
    sig = f;
  }
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const row = await db.hotelGuestRecord.findFirst({ where: { id: p.data.guestId }, include: { reservation: { select: { status: true } } } });
  if (!row) return gfail("NOT_FOUND", R.notFound);
  if (!EDITABLE.has(row.reservation.status)) return gfail("INVALID_STATUS", "การจองนี้ถูกยกเลิก/ไม่มาเข้าพัก — ลงชื่อไม่ได้");
  if (row.reservation.status === "CHECKED_OUT" && !isManagerRole(g.actor)) return gfail("FORBIDDEN", R.afterCheckout);
  if (!paper && row.signatureFileId) return { ok: true, signedAt: (row.rr3SignedAt ?? row.updatedAt).toISOString(), method: "SCREEN", alreadySigned: true };
  if (paper && row.rr3SignedAt) return { ok: true, signedAt: row.rr3SignedAt.toISOString(), method: "PAPER", alreadySigned: true };
  let fileId: string | null = null;
  if (sig) {
    const up = await uploadGuestFile(g.tenantId, sig, "sign");
    if (isGuestFail(up)) return up;
    fileId = up.fileId;
  }
  const now = new Date();
  try {
    const out = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      const upd = await tx.hotelGuestRecord.updateMany({
        where: { id: row.id, ...(paper ? { rr3SignedAt: null } : { signatureFileId: null }) },
        data: paper ? { rr3SignedAt: now } : { signatureFileId: fileId, rr3SignedAt: row.rr3SignedAt ?? now },
      });
      if (upd.count !== 1) return { raced: true };
      const others = await tx.hotelGuestRecord.updateMany({ where: { reservationId: row.reservationId, id: { not: row.id }, rr3SignedAt: null }, data: { rr3SignedAt: now } });
      await guestAudit(tx, c, g.actor.userId, "hotel.guest.rr3_signed", row.id, { signed: !!row.rr3SignedAt }, {
        signed: true,
        method: paper ? "PAPER" : "SCREEN",
        ...(paper ? { note: p.data.note || "ลงชื่อบนกระดาษแล้ว" } : { signatureFile: true }),
        coveredCompanions: others.count,
      });
      return { raced: false };
    }, GUEST_TX);
    if (out.raced) {
      await dropGuestFile(g.tenantId, fileId);
      return { ok: true, signedAt: now.toISOString(), method: paper ? "PAPER" : "SCREEN", alreadySigned: true };
    }
    return { ok: true, signedAt: now.toISOString(), method: paper ? "PAPER" : "SCREEN" };
  } catch (e) {
    await dropGuestFile(g.tenantId, fileId);
    if (isTxBusy(e)) return gfail("BUSY", R.busy);
    throw e;
  }
}

// ───────────────────────── เลขบัตร ร.ร.3 (มติ 3) ─────────────────────────
const BKK_MS = 7 * 3_600_000;
const beYearOf = (d: Date): number => bkkParts(d).y + 543;
const yearStart = (ce: number): Date => new Date(Date.UTC(ce, 0, 1) - BKK_MS);
export const rr3CardNo = (beYear: number, seq: number): string => `RR3-${beYear}-${String(seq).padStart(6, "0")}`;
/** เลขบัตรของแถวที่ให้มา: ลำดับตาม (createdAt, id) ของแขกทุกคนของหน่วยในปี พ.ศ. เดียวกัน เริ่ม 000001 */
async function cardNosOf(c: { tenantId: string; unitId: string }, rows: { id: string; createdAt: Date }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const years = [...new Set(rows.map((r) => beYearOf(r.createdAt)))];
  const db = tenantDb(c);
  for (const be of years) {
    const ce = be - 543;
    const all = await db.hotelGuestRecord.findMany({ where: { createdAt: { gte: yearStart(ce), lt: yearStart(ce + 1) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
    all.forEach((r, i) => out.set(r.id, rr3CardNo(be, i + 1)));
  }
  return out;
}

// ───────────────────────── rr3Card / rr4Register ─────────────────────────
export type Rr3View = {
  ok: true;
  guestId: string;
  cardNo: string;
  hotel: { name: string; licenseName: string | null; licenseNo: string | null; registrarOffice: string | null };
  reservationId: string;
  reservationCode: string;
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  checkedInAt: string | null;
  fullName: string;
  nationality: string | null;
  nationalityTh: string | null;
  dob: string | null;
  sex: string | null;
  occupation: string | null;
  idType: string | null;
  idNumberLast4: string | null;
  idMasked: string;
  address: string | null;
  arrivedFrom: string | null;
  nextDestination: string | null;
  companions: number;
  guestsCount: number;
  isPrimary: boolean;
  signed: boolean;
  signedAt: string | null;
  signedByGuestId: string | null;
  signatureUrl: string | null;
  signedOnPaper: boolean;
  idImageUrl: string | null;
  recordedBy: { userId: string | null; name: string | null };
  recordedAt: string;
  tm30Status: string;
  tm30Ref: string | null;
  purged: boolean;
};
/**
 * บัตร ร.ร.3 ของผู้พัก 1 คน (แบบพิมพ์/จอ) — ไม่มีเลขเต็ม (4 ตัวท้าย) · ลิงก์รูป/ลายเซ็น = /api/files ผูกผู้ดู (ctx.userId · ไม่ส่ง = ผู้บันทึก) อายุ ≤ 15 นาที
 * 🔴 ผู้เรียก (หน้า) ตรวจสิทธิ์ทะเบียนก่อนเรียก (ลิงก์ = ใบผ่าน)
 */
export async function rr3Card(ctx: unknown, input: unknown): Promise<Rr3View | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const loc = await locateGuest(tenantId, input.guestId);
  if (!loc) return gfail("NOT_FOUND", R.notFound);
  const unit = await hotelUnitOf(tenantId, loc.unitId);
  if (!unit) return gfail("NOT_FOUND", R.notFound);
  const c = { tenantId, unitId: unit.id };
  const db = tenantDb(c);
  const row = await db.hotelGuestRecord.findFirst({ where: { id: String(input.guestId) }, include: { reservation: { select: { id: true, code: true, checkInDate: true, checkOutDate: true, checkedInAt: true, room: { select: { number: true } } } } } });
  if (!row) return gfail("NOT_FOUND", R.notFound);
  const party = await db.hotelGuestRecord.findMany({ where: { reservationId: row.reservationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, signatureFileId: true, rr3SignedAt: true } });
  const primary = party[0] ?? null;
  const signer = row.signatureFileId ? { id: row.id, fileId: row.signatureFileId } : (() => {
    const s = party.find((x) => x.signatureFileId);
    return s && row.rr3SignedAt ? { id: s.id, fileId: s.signatureFileId } : null;
  })();
  const st = await guestSettings(tenantId, unit.id);
  const sec = openGuestSecret(row);
  const reg = await tenantDb({ tenantId }).auditLog.findFirst({ where: { action: "hotel.guest.registered", targetType: "HotelGuestRecord", targetId: row.id }, orderBy: { createdAt: "asc" }, select: { actorId: true, actorType: true } });
  const recorderId = reg && reg.actorType === "USER" ? reg.actorId : null;
  const recorder = recorderId ? await tenantDb({ tenantId }).user.findFirst({ where: { id: recorderId }, select: { name: true } }) : null;
  const viewer = isRec(ctx) && isStr(ctx.userId) ? ctx.userId : recorderId;
  const nos = await cardNosOf(c, [row]);
  return {
    ok: true,
    guestId: row.id,
    cardNo: nos.get(row.id) ?? rr3CardNo(beYearOf(row.createdAt), 1),
    hotel: { name: unit.name, licenseName: st.licenseName, licenseNo: st.licenseNo, registrarOffice: st.registrarOffice },
    reservationId: row.reservationId,
    reservationCode: row.reservation.code,
    roomNumber: row.reservation.room?.number ?? null,
    checkIn: ymdOfDb(row.reservation.checkInDate),
    checkOut: ymdOfDb(row.reservation.checkOutDate),
    checkedInAt: row.reservation.checkedInAt?.toISOString() ?? null,
    fullName: row.fullName,
    nationality: row.nationality,
    nationalityTh: nationalityTh(row.nationality),
    dob: row.dob ? ymdOfDb(row.dob) : null,
    sex: sec?.sex ?? null,
    occupation: sec?.occupation ?? null,
    idType: row.idType,
    idNumberLast4: row.idNumberLast4,
    idMasked: maskFromLast4(row.idNumberLast4),
    address: sec?.address ?? null,
    arrivedFrom: row.arrivedFrom,
    nextDestination: row.nextDestination,
    companions: Math.max(0, party.length - 1),
    guestsCount: party.length,
    isPrimary: primary?.id === row.id,
    signed: !!row.rr3SignedAt,
    signedAt: row.rr3SignedAt?.toISOString() ?? null,
    signedByGuestId: signer && signer.id !== row.id ? signer.id : row.rr3SignedAt ? row.id : null,
    signatureUrl: fileLink(signer?.fileId, viewer),
    signedOnPaper: !!row.rr3SignedAt && !signer,
    idImageUrl: fileLink(row.idImageFileId, viewer),
    recordedBy: { userId: recorderId, name: recorder?.name ?? null },
    recordedAt: row.createdAt.toISOString(),
    tm30Status: row.tm30Status,
    tm30Ref: row.tm30Ref,
    purged: !row.idNumberEnc && !!row.idType,
  };
}
export type Rr4Row = {
  guestId: string;
  cardNo: string;
  fullName: string;
  nationality: string | null;
  nationalityTh: string | null;
  idType: string | null;
  idNumberLast4: string | null;
  idMasked: string;
  roomNumber: string | null;
  reservationCode: string;
  checkIn: string;
  checkOut: string;
  checkedInAt: string | null;
  arrivedFrom: string | null;
  nextDestination: string | null;
  signed: boolean;
  rr3SignedAt: string | null;
  purged: boolean;
};
const Rr4Z = z.object({ unitId: z.string().min(1), from: ymdZ, to: ymdZ });
/** ทะเบียนผู้พัก (ร.ร.4) = แถว ร.ร.3 ของหน่วยที่วันเข้าอยู่ในช่วง เรียงตามเลขบัตร · ไม่มีเลขเต็ม · รวมแถวที่ล้างข้อมูลอ่อนไหวแล้ว */
export async function rr4Register(ctx: unknown, input: unknown): Promise<{ ok: true; rows: Rr4Row[]; hotel: { name: string; licenseName: string | null; licenseNo: string | null; registrarOffice: string | null } } | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const unit = await hotelUnitOf(tenantId, input.unitId);
  if (!unit) return gfail("NOT_FOUND", R.notFound);
  const p = Rr4Z.safeParse(input);
  if (!p.success) return gfail("INVALID_INPUT", zodReason(p.error));
  if (p.data.to < p.data.from) return gfail("INVALID_INPUT", "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  const c = { tenantId, unitId: unit.id };
  const rows = await tenantDb(c).hotelGuestRecord.findMany({
    where: { reservation: { checkInDate: { gte: dbDate(p.data.from), lte: dbDate(p.data.to) } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 5000,
    include: { reservation: { select: { code: true, checkInDate: true, checkOutDate: true, checkedInAt: true, room: { select: { number: true } } } } },
  });
  const nos = await cardNosOf(c, rows);
  const st = await guestSettings(tenantId, unit.id);
  return {
    ok: true,
    hotel: { name: unit.name, licenseName: st.licenseName, licenseNo: st.licenseNo, registrarOffice: st.registrarOffice },
    rows: rows.map((r) => ({
      guestId: r.id,
      cardNo: nos.get(r.id) ?? "",
      fullName: r.fullName,
      nationality: r.nationality,
      nationalityTh: nationalityTh(r.nationality),
      idType: r.idType,
      idNumberLast4: r.idNumberLast4,
      idMasked: maskFromLast4(r.idNumberLast4),
      roomNumber: r.reservation.room?.number ?? null,
      reservationCode: r.reservation.code,
      checkIn: ymdOfDb(r.reservation.checkInDate),
      checkOut: ymdOfDb(r.reservation.checkOutDate),
      checkedInAt: r.reservation.checkedInAt?.toISOString() ?? null,
      arrivedFrom: r.arrivedFrom,
      nextDestination: r.nextDestination,
      signed: !!r.rr3SignedAt,
      rr3SignedAt: r.rr3SignedAt?.toISOString() ?? null,
      purged: !r.idNumberEnc && !!r.idType,
    })),
  };
}

// ───────────────────────── purgeExpiredGuestRecords (Q6 · X5) ─────────────────────────
/**
 * ล้างข้อมูลอ่อนไหวของแถวที่พ้น retainUntil (ข้ามร้าน · งานรายวัน): กล่องลับ (เลขเต็ม/ที่อยู่/ตรวจลงตรา) · รูปเอกสาร · ลายเซ็น
 * คงชื่อ · 4 ตัวท้าย · สัญชาติ · วันเข้าออก (ร.ร.4 ย้อนหลังที่ไม่มีข้อมูลอ่อนไหว) · AuditLog SYSTEM ต่อแถว + outbox hotel.guest.purged {count} ต่อหน่วย
 * idempotent + ซ้อนกันได้: UPDATE มีเงื่อนไขค่าเดิม ⇒ แต่ละแถวถูกนับ/ลบไฟล์ครั้งเดียว
 */
export async function purgeExpiredGuestRecords(input?: unknown): Promise<{ ok: true; purged: number }> {
  const now = guestClock(input, "now");
  const cap = isRec(input) && typeof input.limit === "number" && Number.isInteger(input.limit) && input.limit > 0 ? Math.min(input.limit, PURGE_BATCH) : PURGE_BATCH;
  const today = dbDate(bkkYmd(now));
  const scan = tenantDb({ tenantId: "hotel-guest-purge" });
  const rows = await scan.$queryRaw<{ id: string; tenantId: string; unitId: string; idNumberEnc: string | null; idImageFileId: string | null; signatureFileId: string | null }[]>`
    SELECT "id", "tenantId", "unitId", "idNumberEnc", "idImageFileId", "signatureFileId" FROM "HotelGuestRecord"
     WHERE "retainUntil" IS NOT NULL AND "retainUntil" < ${today}
       AND ("idNumberEnc" IS NOT NULL OR "idImageFileId" IS NOT NULL OR "signatureFileId" IS NOT NULL)
     ORDER BY "retainUntil" ASC, "id" ASC LIMIT ${cap}`;
  let purged = 0;
  const perUnit = new Map<string, { tenantId: string; unitId: string; n: number }>();
  for (const r of rows) {
    const c = { tenantId: r.tenantId, unitId: r.unitId };
    const won = await tenantDb(c).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      const upd = await tx.hotelGuestRecord.updateMany({
        where: { id: r.id, idNumberEnc: r.idNumberEnc, idImageFileId: r.idImageFileId, signatureFileId: r.signatureFileId },
        data: { idNumberEnc: null, idImageFileId: null, signatureFileId: null },
      });
      if (upd.count !== 1) return false;
      await guestAudit(tx, c, null, "hotel.guest.purged", r.id, { hadSecret: !!r.idNumberEnc, hadIdImage: !!r.idImageFileId, hadSignature: !!r.signatureFileId }, { purged: true, reason: "พ้นระยะเวลาเก็บ (rooms.hotel.guest.retainYears)" });
      return true;
    }, GUEST_TX);
    if (!won) continue;
    purged++;
    await dropGuestFile(r.tenantId, r.idImageFileId);
    await dropGuestFile(r.tenantId, r.signatureFileId);
    const k = `${r.tenantId}|${r.unitId}`;
    const cur = perUnit.get(k) ?? { tenantId: r.tenantId, unitId: r.unitId, n: 0 };
    cur.n++;
    perUnit.set(k, cur);
  }
  for (const u of perUnit.values()) {
    await tenantDb({ tenantId: u.tenantId }).$transaction(async (t) => {
      await emitOutbox(t as unknown as Tx, { tenantId: u.tenantId, unitId: u.unitId, type: "hotel.guest.purged", idempotencyKey: `hotel.guest.purged#${u.unitId}#${randomUUID()}`, payload: { tenantId: u.tenantId, unitId: u.unitId, count: u.n } });
    });
  }
  return { ok: true, purged };
}

/** สถานะ ตม.30 ที่แจ้งได้ */
export const TM30_OPEN: readonly Tm30Status[] = ["PENDING", "LATE"];
