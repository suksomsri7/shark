// SVC D.15-K2 ▸ ตั้งค่า "อาคาร · ชั้น · ห้อง" + "ประเภทห้อง · ค่าเช่า" ของหอ (จอ /dorm/settings/rooms) — ก่อนนี้สร้างห้องได้ทางนำเข้า (D.4) เท่านั้น
//   • อาคาร: ผ่าน facade `@/lib/modules/rooms` (createBuilding · updateBuilding · deleteBuilding) · ห้อง/ประเภทห้อง: ตาราง HotelRoom/HotelRoomType
//     ของแกนห้อง R0.8 ผ่าน tenantDb (แบบเดียวกับ import.ts — rooms facade ยังไม่มีตัวสร้างห้อง/ประเภท) · ค่าเช่ารายเดือนผ่าน `setRoomTypeRent`
//   • ด่าน (X1): หน่วย DORM ของร้าน + Membership สด · ดู = dormAccess().board (dorm.view) · แก้ = dormAccess().settings (dorm.settings.edit)
//     ขอบเขตอาคาร = dormActorScope (ตัวตัดสินเดียวกับทางเขียนของมิเตอร์ D.15) — ถูกจำกัดอาคาร ⇒ เห็น/แก้ห้องเฉพาะอาคารตัวเอง ·
//     อาคารและประเภทห้อง (ใช้ทั้งหน่วย) แก้ได้เฉพาะผู้ที่เห็นทั้งหน่วย · ไม่ผ่าน/id เดา/ข้ามร้าน ⇒ NOT_FOUND เหตุผลเดียวกัน · ไม่ throw
//   • ลบ = ปิดใช้งาน (active=false) เท่านั้น · ห้องที่มีสัญญา/การครองห้องที่ยังไม่จบ ปิดไม่ได้ · ปิดห้อง ⇒ ถอดมิเตอร์ที่ยังใช้งานของห้องนั้น (แบบย้อนนำเข้า)
//     เลขห้องซ้ำกับห้องที่ปิดไว้ ⇒ เปิดห้องเดิมกลับ (unique unitId+number)
//   • เพิ่ม/เปิดห้อง ⇒ สร้างมิเตอร์ไฟ+น้ำของห้องผ่าน `createMeter` (D.6 · เลขเริ่มจากฟอร์ม · มีอยู่แล้ว = ข้าม) — ไม่งั้นห้องทำมือจดมิเตอร์/คิดน้ำไฟไม่ได้
//   • เปลี่ยนค่าเช่าของประเภทห้อง ไม่กระทบสัญญาเดิม (ค่าเช่าล็อกในสัญญา — RENT_LOCKED_IN_LEASE) · ใช้กับสัญญาใหม่
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { tenantDb } from "@/lib/core/db";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { createBuilding, deleteBuilding, setRoomTypeRent, updateBuilding } from "@/lib/modules/rooms";
import { dormAccess } from "./access";
import { createMeter } from "./meter";
import { dormActorScope, dormLiveMember, dormUnitOf, type DormBuildingScope } from "./scope";

export const DORM_SETUP_NF_REASON = "ไม่พบหอ อาคาร ห้อง หรือประเภทห้องที่ระบุ หรือบัญชีนี้ไม่มีสิทธิ์แก้ไข";

export type DormSetupCtx = { tenantId: string; actorUserId: string };
export type DormSetupResult = { ok: true; id: string } | { ok: false; code: string; reason: string };
export type DormSetupModel = {
  unitId: string;
  unitName: string;
  basePath: string;
  /** แก้ห้องได้ (dorm.settings.edit) */
  canEdit: boolean;
  /** แก้อาคาร/ประเภทห้องได้ (dorm.settings.edit + เห็นทั้งหน่วย) */
  canEditUnit: boolean;
  /** ถูกจำกัดอาคาร (เห็นบางอาคาร) */
  limited: boolean;
  buildings: { id: string; name: string; floors: number; sortOrder: number; roomCount: number }[];
  roomTypes: { id: string; name: string; monthlyRateSatang: number | null; rentMode: string; roomCount: number }[];
  rooms: { id: string; number: string; buildingId: string | null; buildingName: string | null; floorNo: number | null; roomTypeId: string; roomTypeName: string; inUse: boolean }[];
};

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const NF: DormSetupResult = { ok: false, code: "NOT_FOUND", reason: DORM_SETUP_NF_REASON };
const bad = (code: string, reason: string): DormSetupResult => ({ ok: false, code, reason });
const LIVE_LEASE = ["DRAFT", "ACTIVE", "NOTICE"];
const NAME_MAX = 60;
const ROOM_NO = /^[\p{L}\p{N}][\p{L}\p{N}\-/. ]{0,19}$/u;
const RATE_MAX = 100_000_000; // ฿1,000,000/เดือน — กันพิมพ์ผิด

type Gate = { tenantId: string; unitId: string; unitName: string; slug: string; actorUserId: string; scope: DormBuildingScope; canEdit: boolean; canEditUnit: boolean };

async function gate(ctx: DormSetupCtx, unitId: unknown): Promise<Gate | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId)) return null;
  const unit = await dormUnitOf(ctx.tenantId, unitId);
  if (!unit) return null;
  const mem = await dormLiveMember(ctx.tenantId, ctx.actorUserId);
  if (!mem) return null;
  const acc = dormAccess(mem.ctx, unit.id);
  if (!acc.board) return null;
  const scope = await dormActorScope(ctx.tenantId, unit.id, ctx.actorUserId);
  return {
    tenantId: ctx.tenantId,
    unitId: unit.id,
    unitName: unit.name,
    slug: unit.slug,
    actorUserId: ctx.actorUserId,
    scope,
    canEdit: acc.settings,
    canEditUnit: acc.settings && scope.all,
  };
}
const inScope = (g: Gate, buildingId: string | null) => g.scope.all || (!!buildingId && g.scope.buildingIds.includes(buildingId));
const dbOf = (g: Gate) => tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
const cleanName = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!s || s.length > NAME_MAX || /^[=+\-@]/.test(s)) return null;
  return s;
};
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
async function audit(g: Gate, action: string, targetType: string, targetId: string, after: unknown) {
  await writeAudit({ tenantId: g.tenantId, actorId: g.actorUserId, action, targetType, targetId, after });
}

/** ห้องที่ยังมีสัญญา (ร่าง/อยู่/แจ้งออก) หรือการครองห้องที่ยังไม่จบ */
async function roomsInUse(g: Gate, roomIds: string[]): Promise<Set<string>> {
  if (roomIds.length === 0) return new Set();
  const db = dbOf(g);
  const today = new Date(`${bkkYmd(new Date())}T00:00:00.000Z`);
  const [leases, occs] = await Promise.all([
    db.dormLease.findMany({ where: { roomId: { in: roomIds }, status: { in: LIVE_LEASE } }, select: { roomId: true } }),
    db.roomOccupancy.findMany({ where: { roomId: { in: roomIds }, active: true, endDate: { gt: today } }, select: { roomId: true } }),
  ]);
  return new Set([...leases.map((l) => l.roomId), ...occs.map((o) => o.roomId)]);
}

// ───────────────────────── โมเดลจอ ─────────────────────────
export async function dormSetupModel(ctx: DormSetupCtx, input: { unitId: string }): Promise<DormSetupModel | null> {
  const g = await gate(ctx, isRec(input) ? input.unitId : null);
  if (!g) return null;
  const db = dbOf(g);
  const [bAll, types, rAll] = await Promise.all([
    db.roomBuilding.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, floors: true, sortOrder: true } }),
    db.hotelRoomType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, monthlyRateSatang: true, rentMode: true } }),
    db.hotelRoom.findMany({ where: { active: true }, orderBy: [{ number: "asc" }], select: { id: true, number: true, buildingId: true, floorNo: true, roomTypeId: true } }),
  ]);
  const buildings = bAll.filter((b) => inScope(g, b.id));
  const rooms = rAll.filter((r) => inScope(g, r.buildingId));
  const used = await roomsInUse(g, rooms.map((r) => r.id));
  const bName = new Map(bAll.map((b) => [b.id, b.name]));
  const tName = new Map(types.map((t) => [t.id, t.name]));
  const count = <K extends string>(rows: { k: K | null }[]) => rows.reduce((m, r) => (r.k ? m.set(r.k, (m.get(r.k) ?? 0) + 1) : m), new Map<K, number>());
  const perB = count(rAll.map((r) => ({ k: r.buildingId })));
  const perT = count(rAll.map((r) => ({ k: r.roomTypeId })));
  return {
    unitId: g.unitId,
    unitName: g.unitName,
    basePath: `/app/u/${g.slug}/dorm`,
    canEdit: g.canEdit,
    canEditUnit: g.canEditUnit,
    limited: !g.scope.all,
    buildings: buildings.map((b) => ({ ...b, roomCount: perB.get(b.id) ?? 0 })),
    roomTypes: types.map((t) => ({ ...t, roomCount: perT.get(t.id) ?? 0 })),
    rooms: rooms.map((r) => ({
      id: r.id,
      number: r.number,
      buildingId: r.buildingId,
      buildingName: r.buildingId ? (bName.get(r.buildingId) ?? null) : null,
      floorNo: r.floorNo,
      roomTypeId: r.roomTypeId,
      roomTypeName: tName.get(r.roomTypeId) ?? "—",
      inUse: used.has(r.id),
    })),
  };
}

// ───────────────────────── อาคาร (ทั้งหน่วย) ─────────────────────────
export async function saveDormBuilding(ctx: DormSetupCtx, input: { unitId: string; buildingId?: string | null; name: unknown; floors: unknown }): Promise<DormSetupResult> {
  const g = await gate(ctx, isRec(input) ? input.unitId : null);
  if (!g || !g.canEditUnit) return NF;
  const name = cleanName(input.name);
  if (!name) return bad("INVALID_INPUT", `ชื่ออาคารต้องมี 1–${NAME_MAX} ตัวอักษร และไม่ขึ้นต้นด้วย = + - @`);
  const floors = input.floors;
  if (!isInt(floors) || floors < 1 || floors > 99) return bad("INVALID_INPUT", "จำนวนชั้นต้องเป็นจำนวนเต็ม 1–99");
  const dup = await dbOf(g).roomBuilding.findFirst({ where: { name, ...(isStr(input.buildingId) ? { id: { not: input.buildingId } } : {}) }, select: { id: true } });
  if (dup) return bad("DUPLICATE", `มีอาคารชื่อ "${name}" อยู่แล้ว`);
  const r = isStr(input.buildingId)
    ? await updateBuilding({ tenantId: g.tenantId }, { unitId: g.unitId, buildingId: input.buildingId, name, floors })
    : await createBuilding({ tenantId: g.tenantId }, { unitId: g.unitId, name, floors });
  if (!r.ok) return r.code === "NOT_FOUND" ? NF : bad(r.code, r.message);
  const id = r.id ?? (isStr(input.buildingId) ? input.buildingId : "");
  await audit(g, isStr(input.buildingId) ? "dorm.setup.building.updated" : "dorm.setup.building.created", "RoomBuilding", id, { name, floors });
  return { ok: true, id };
}

export async function removeDormBuilding(ctx: DormSetupCtx, input: { unitId: string; buildingId: string }): Promise<DormSetupResult> {
  const g = await gate(ctx, isRec(input) ? input.unitId : null);
  if (!g || !g.canEditUnit || !isStr(input.buildingId)) return NF;
  const db = dbOf(g);
  const b = await db.roomBuilding.findFirst({ where: { id: input.buildingId }, select: { id: true } });
  if (!b) return NF;
  if ((await db.hotelRoom.count({ where: { buildingId: b.id, active: true } })) > 0) return bad("BUILDING_IN_USE", "ยังมีห้องในอาคารนี้ — ย้ายหรือปิดห้องก่อน");
  // ห้องที่ปิดใช้งานแล้วยังชี้อาคารนี้ ⇒ ปลดออก (ไม่งั้นลบไม่ได้ตลอดไป) · ห้องเปิดกลับภายหลังต้องเลือกอาคารใหม่
  await db.hotelRoom.updateMany({ where: { buildingId: b.id, active: false }, data: { buildingId: null } });
  const r = await deleteBuilding({ tenantId: g.tenantId }, { unitId: g.unitId, buildingId: b.id });
  if (!r.ok) return r.code === "NOT_FOUND" ? NF : bad(r.code, r.message);
  await audit(g, "dorm.setup.building.removed", "RoomBuilding", b.id, null);
  return { ok: true, id: b.id };
}

// ───────────────────────── ประเภทห้อง · ค่าเช่า (ทั้งหน่วย) ─────────────────────────
export async function saveDormRoomType(ctx: DormSetupCtx, input: { unitId: string; roomTypeId?: string | null; name: unknown; monthlyRateSatang: unknown }): Promise<DormSetupResult> {
  const g = await gate(ctx, isRec(input) ? input.unitId : null);
  if (!g || !g.canEditUnit) return NF;
  const name = cleanName(input.name);
  if (!name) return bad("INVALID_INPUT", `ชื่อประเภทห้องต้องมี 1–${NAME_MAX} ตัวอักษร และไม่ขึ้นต้นด้วย = + - @`);
  const rate = input.monthlyRateSatang;
  if (!isInt(rate) || rate < 0 || rate > RATE_MAX) return bad("INVALID_INPUT", "ค่าเช่ารายเดือนต้องเป็นจำนวนเงินไม่ติดลบ (ไม่เกิน ฿1,000,000)");
  const db = dbOf(g);
  try {
    if (isStr(input.roomTypeId)) {
      const t = await db.hotelRoomType.findFirst({ where: { id: input.roomTypeId, active: true }, select: { id: true, rentMode: true } });
      if (!t) return NF;
      await db.hotelRoomType.update({ where: { id: t.id }, data: { name } });
      // หอ = รายเดือน · ประเภทที่เคยเป็น BOTH คงไว้ (ใช้ร่วมรายคืน)
      const r = await setRoomTypeRent({ tenantId: g.tenantId }, { unitId: g.unitId, roomTypeId: t.id, rentMode: t.rentMode === "BOTH" ? "BOTH" : "MONTHLY", monthlyRateSatang: rate });
      if (!r.ok) return r.code === "NOT_FOUND" ? NF : bad(r.code, r.message);
      await audit(g, "dorm.setup.roomType.updated", "HotelRoomType", t.id, { name, monthlyRateSatang: rate });
      return { ok: true, id: t.id };
    }
    const old = await db.hotelRoomType.findFirst({ where: { name, active: false }, select: { id: true } });
    const id = old
      ? (await db.hotelRoomType.update({ where: { id: old.id }, data: { active: true, rentMode: "MONTHLY", monthlyRateSatang: rate }, select: { id: true } })).id
      : (
          await db.hotelRoomType.create({
            data: { tenantId: g.tenantId, unitId: g.unitId, name, capacity: 2, baseRateSatang: 0, depositSatang: 0, rentMode: "MONTHLY", monthlyRateSatang: rate },
            select: { id: true },
          })
        ).id;
    await audit(g, "dorm.setup.roomType.created", "HotelRoomType", id, { name, monthlyRateSatang: rate });
    return { ok: true, id };
  } catch (e) {
    if (isUnique(e)) return bad("DUPLICATE", `มีประเภทห้องชื่อ "${name}" อยู่แล้ว`);
    throw e;
  }
}

export async function archiveDormRoomType(ctx: DormSetupCtx, input: { unitId: string; roomTypeId: string }): Promise<DormSetupResult> {
  const g = await gate(ctx, isRec(input) ? input.unitId : null);
  if (!g || !g.canEditUnit || !isStr(input.roomTypeId)) return NF;
  const db = dbOf(g);
  const t = await db.hotelRoomType.findFirst({ where: { id: input.roomTypeId, active: true }, select: { id: true } });
  if (!t) return NF;
  if ((await db.hotelRoom.count({ where: { roomTypeId: t.id, active: true } })) > 0) return bad("TYPE_IN_USE", "ยังมีห้องใช้ประเภทนี้ — เปลี่ยนประเภทของห้องก่อน");
  await db.hotelRoomType.update({ where: { id: t.id }, data: { active: false } });
  await audit(g, "dorm.setup.roomType.archived", "HotelRoomType", t.id, null);
  return { ok: true, id: t.id };
}

// ───────────────────────── ห้อง (ตามขอบเขตอาคาร) ─────────────────────────
export async function saveDormRoom(
  ctx: DormSetupCtx,
  input: { unitId: string; roomId?: string | null; number: unknown; buildingId: unknown; floorNo: unknown; roomTypeId: unknown; elecStart?: unknown; waterStart?: unknown },
): Promise<DormSetupResult> {
  const g = await gate(ctx, isRec(input) ? input.unitId : null);
  if (!g || !g.canEdit) return NF;
  const number = typeof input.number === "string" ? input.number.trim() : "";
  if (!ROOM_NO.test(number)) return bad("INVALID_INPUT", "เลขห้องต้องมี 1–20 ตัว (ตัวอักษร ตัวเลข - / .) และขึ้นต้นด้วยตัวอักษรหรือตัวเลข");
  if (!isStr(input.buildingId) || !inScope(g, input.buildingId)) return NF;
  const db = dbOf(g);
  const b = await db.roomBuilding.findFirst({ where: { id: input.buildingId }, select: { id: true, floors: true } });
  if (!b) return NF;
  const floorNo = input.floorNo;
  if (!isInt(floorNo) || floorNo < 1 || floorNo > b.floors) return bad("INVALID_FLOOR", `ชั้นต้องอยู่ระหว่าง 1–${b.floors}`);
  if (!isStr(input.roomTypeId)) return NF;
  const t = await db.hotelRoomType.findFirst({ where: { id: input.roomTypeId, active: true }, select: { id: true } });
  if (!t) return NF;
  const data = { number, buildingId: b.id, floorNo, floor: String(floorNo), roomTypeId: t.id };
  const startOf = (v: unknown): number | null => (v === undefined || v === null ? 0 : isInt(v) && v >= 0 && v <= 2_000_000_000 ? v : null);
  const elecStart = startOf(input.elecStart);
  const waterStart = startOf(input.waterStart);
  if (!isStr(input.roomId) && (elecStart === null || waterStart === null)) return bad("INVALID_INPUT", "เลขมิเตอร์เริ่มต้นต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  try {
    if (isStr(input.roomId)) {
      const room = await db.hotelRoom.findFirst({ where: { id: input.roomId, active: true }, select: { id: true, buildingId: true } });
      if (!room || !inScope(g, room.buildingId)) return NF;
      const clash = await db.hotelRoom.findFirst({ where: { number, id: { not: room.id } }, select: { active: true } });
      if (clash) return bad("DUPLICATE", clash.active ? `มีห้อง ${number} อยู่แล้ว` : `เลขห้อง ${number} เคยใช้กับห้องที่ปิดไว้ — เพิ่มห้องเลขนี้ใหม่เพื่อเปิดห้องเดิมกลับ`);
      await db.hotelRoom.update({ where: { id: room.id }, data });
      await audit(g, "dorm.setup.room.updated", "HotelRoom", room.id, data);
      return { ok: true, id: room.id };
    }
    const old = await db.hotelRoom.findFirst({ where: { number }, select: { id: true, active: true } });
    if (old?.active) return bad("DUPLICATE", `มีห้อง ${number} อยู่แล้ว`);
    const id = old
      ? (await db.hotelRoom.update({ where: { id: old.id }, data: { ...data, active: true }, select: { id: true } })).id
      : (await db.hotelRoom.create({ data: { tenantId: g.tenantId, unitId: g.unitId, ...data }, select: { id: true } })).id;
    // มิเตอร์ไฟ+น้ำของห้อง (ห้องเปิดกลับที่มิเตอร์ถูกถอดตอนปิด ⇒ สร้างตัวใหม่) · DUPLICATE = มีอยู่แล้ว ข้าม
    const meters: string[] = [];
    for (const [kind, start] of [["ELEC", elecStart ?? 0], ["WATER", waterStart ?? 0]] as const) {
      const m = await createMeter({ tenantId: g.tenantId, actorUserId: g.actorUserId }, { unitId: g.unitId, kind, roomId: id, startReading: start, note: "setup" });
      if (m.ok) meters.push(kind);
    }
    await audit(g, old ? "dorm.setup.room.reopened" : "dorm.setup.room.created", "HotelRoom", id, { ...data, meters });
    return { ok: true, id };
  } catch (e) {
    if (isUnique(e)) return bad("DUPLICATE", `มีห้อง ${number} อยู่แล้ว`);
    throw e;
  }
}

export async function archiveDormRoom(ctx: DormSetupCtx, input: { unitId: string; roomId: string }): Promise<DormSetupResult> {
  const g = await gate(ctx, isRec(input) ? input.unitId : null);
  if (!g || !g.canEdit || !isStr(input.roomId)) return NF;
  const db = dbOf(g);
  const room = await db.hotelRoom.findFirst({ where: { id: input.roomId, active: true }, select: { id: true, buildingId: true } });
  if (!room || !inScope(g, room.buildingId)) return NF;
  if ((await roomsInUse(g, [room.id])).size > 0) return bad("ROOM_IN_USE", "ห้องนี้ยังมีสัญญาหรือการจองที่ยังไม่จบ — ปิดห้องไม่ได้");
  const meters = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).$transaction(async (tx) => {
    const T = { tenantId: g.tenantId, unitId: g.unitId };
    const n = await tx.hotelRoom.updateMany({ where: { ...T, id: room.id, active: true }, data: { active: false } });
    if (n.count !== 1) return -1;
    return (await tx.dormMeter.updateMany({ where: { ...T, roomId: room.id, removedAt: null }, data: { removedAt: new Date() } })).count;
  });
  if (meters < 0) return NF;
  await audit(g, "dorm.setup.room.archived", "HotelRoom", room.id, { metersRemoved: meters });
  return { ok: true, id: room.id };
}
