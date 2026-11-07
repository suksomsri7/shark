// SVC H.6 ▸ แม่บ้าน (housekeeping) ฝั่งเซิร์ฟเวอร์ — ใบสั่ง ledger/svc-briefs/svc-brief-h.6.md (§0 หลัก · §2 มติ · §3 สัญญา · §9 มติผู้คุม)
//   • แหล่งความจริงสถานะห้อง = HotelRoom.hkStatus ผ่าน rooms.setHkStatus เท่านั้น · ทุก transition ลง HotelHousekeepingLog (from/to/by/reservationId/note JSON)
//   • state machine = hk-state.ts (pure) · OUT_OF_ORDER เข้า/ออกเฉพาะระบบ (BLOCK ของ H.2 · night audit) — คนกด ⇒ USE_BLOCK
//   • งานห้องวันนี้ = มุมมองคำนวณสด (ไม่มีตารางงาน) · ≤ 4 คำสั่ง SQL ต่อบอร์ด (ห้อง+หน่วย 1 · การจอง+BLOCK 1 · ค่าตั้ง 2)
//   • hkNote = JSON {assignedTo, startedAt, guestRequest} (ไม่ขอคอลัมน์ใหม่) · ข้อความเดิมที่ไม่ใช่ JSON อ่านเป็นคำขอแขก
//   • ความพร้อมกัน: ล็อกต่อห้อง pg_try_advisory_xact_lock + ลองซ้ำ (ผู้รอไม่ถือ connection ค้าง — setHkStatus ของแกนห้องเปิด connection ของตัวเอง)
//     ⇒ กดพร้อมกันหลายทาง = log 1 · idempotencyKey ซ้ำ = คืนผลเดิม (ค้นจาก note.key ของ log ห้องนั้น)
//   • มินิบาร์ → folio ผ่าน postFolioItem(MINIBAR) ของ H.5 (ราคา/ชื่อจากค่าตั้ง #75 ณ เวลาโพสต์ · ไม่ตัดสต็อก) · ไม่มีแขกพักอยู่ ⇒ minibar_unbilled
//   • แจ้งของเสีย: BLOCK = blockRoom ของ H.2 · REPAIR = ใบซ่อมของหอ (dorm facade createStaffRepair · ด่าน DORM|HOTEL)
//   • realtime: publish(hotel:hk:<tenant>:<unit>, EV_HOTEL_HK, {roomId, hkStatus, at}) หลัง commit · publish ไม่ throw
//   • ผิดทุกแบบ = {ok:false, code, reason ไทย} ไม่ throw · ข้ามร้าน/หน่วย/ห้องหอ ⇒ NOT_FOUND · เวลาไทยด้วย bkkYmd
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox, emitOutboxMany } from "@/lib/core/outbox";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import { setHkStatus } from "@/lib/modules/rooms";
import { EV_HOTEL_HK, hotelHkChannel, publish } from "@/lib/realtime";
import { uploadFile } from "@/lib/storage/service";
import { blockRoom } from "./block";
import { postFolioItem } from "./folio";
import { canHkTransition, hkPriority, parseHkNote, serializeHkNote, type HkContext, type HkNote, type HkRole, type HkState } from "./hk-state";
import { addDaysYmd, isYmd } from "./pricing";

type Tx = Prisma.TransactionClient;
type UnitCtx = { tenantId: string; unitId: string };
export type HkActor = MembershipCtx & { userId: string };
export type HkFailCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "INVALID_TRANSITION"
  | "USE_BLOCK"
  | "TAKEN"
  | "ROOM_OOO"
  | "INVALID_FILE"
  | "ROOM_TAKEN"
  | "UPLOAD_FAILED"
  | "BUSY";
export type HkFail = { ok: false; code: HkFailCode; reason: string; conflicts?: { code: string; guestName: string }[]; suggest?: "REPAIR" };

export const HK_EVENTS = { changed: "hotel.hk.changed", minibarPosted: "hotel.hk.minibar_posted", minibarUnbilled: "hotel.hk.minibar_unbilled", defect: "hotel.hk.defect" } as const;
const K_HK = "hotel.housekeeping";
const K_INSPECT = "hotel.housekeeping.inspect";
const K_BOOKING = "hotel.booking.manage";
const MB_REF = "HotelHousekeeping";
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
const LOCK_TRIES = 120;
const PHOTO_MAX = 3;
const PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const UPCOMING_DAYS = 7;
const KEY_RE = /^[A-Za-z0-9_.:-]{8,100}$/;

const R = {
  notFound: "ไม่พบห้องนี้ในโรงแรม (หรืออยู่นอกสาขาที่คุณดูแล)",
  forbidden: "คุณยังไม่มีสิทธิ์งานแม่บ้าน — ขอสิทธิ์จากเจ้าของร้าน",
  inspect: "การตรวจห้องต้องเป็นหัวหน้าแม่บ้าน (สิทธิ์ตรวจห้อง)",
  useBlock: "ห้องปิดซ่อมเปลี่ยนสถานะเองไม่ได้ — ใช้ปิดห้อง/ปล่อยห้องในปฏิทินห้อง",
  transition: "เปลี่ยนสถานะห้องแบบนี้ไม่ได้ (สถานะห้องอาจเปลี่ยนไปแล้ว — ดึงหน้าใหม่)",
  taken: "ห้องนี้มีแม่บ้านคนอื่นกำลังทำอยู่ — ให้หัวหน้าโอนงานถ้าต้องการรับแทน",
  ooo: "ห้องนี้ปิดซ่อมอยู่ — ยังทำห้องไม่ได้",
  busy: "ระบบไม่ว่าง ลองใหม่อีกครั้ง",
  file: "แนบได้เฉพาะรูป JPEG, PNG หรือ WebP ไม่เกินรูปละ 8 MB",
};
const fail = (code: HkFailCode, reason: string, extra: Partial<HkFail> = {}): HkFail => ({ ok: false, code, reason, ...extra });
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isHkFail = (v: unknown): v is HkFail => isRec(v) && v.ok === false && typeof v.code === "string";
const zodReason = (e: z.ZodError): string => {
  const m = e.issues[0]?.message ?? "";
  return /[฀-๿]/.test(m) ? m : "ข้อมูลไม่ครบหรือไม่ถูกต้อง";
};
const today = (): string => bkkYmd(new Date());
/** เที่ยงคืนเวลาไทยของวัน ymd เป็น Date (ขอบช่วงเวลา log/เช็กเอาต์วันนี้) */
const bkkStart = (ymd: string): Date => new Date(`${ymd}T00:00:00+07:00`);
const firstName = (name: string | null | undefined): string | null => {
  const t = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  return t ? t.slice(0, 40) : null;
};

class HkAbort extends Error {
  constructor(readonly result: HkFail) {
    super(result.code);
  }
}
class LockBusy extends Error {}
function isTxBusy(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (o.code === "P2028" || o.code === "P2034" || o.code === "40P01") return true;
    if (typeof o.message === "string" && /deadlock detected|40P01|Transaction already closed|expired transaction|Unable to start a transaction/i.test(o.message)) return true;
    const meta = o.meta && typeof o.meta === "object" ? (o.meta as { code?: unknown; driverAdapterError?: unknown }) : null;
    if (meta?.code === "40P01") return true;
    cur = o.cause ?? meta?.driverAdapterError;
  }
  return false;
}
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/**
 * ธุรกรรมที่ถือล็อกของ "ชื่อ" หนึ่ง (ต่อห้อง) — pg_try_advisory_xact_lock ไม่สำเร็จ ⇒ ปล่อย connection แล้วลองใหม่
 *   (ผู้ถือล็อกต้องใช้ connection ที่สองให้ setHkStatus/postFolioItem — ผู้รอจึงห้ามจอด connection ค้าง)
 */
async function withLock<T>(c: UnitCtx, name: string, fn: (tx: Tx) => Promise<T>): Promise<T | HkFail> {
  for (let attempt = 0; attempt < LOCK_TRIES; attempt++) {
    try {
      return await tenantDb({ tenantId: c.tenantId, unitId: c.unitId }).$transaction(async (t) => {
        const tx = t as unknown as Tx;
        const got = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`hotel.hk:${c.tenantId}:${name}`}, 0)) AS ok`;
        if (got[0]?.ok !== true) throw new LockBusy("busy");
        return fn(tx);
      }, TX_OPTS);
    } catch (e) {
      if (e instanceof HkAbort) return e.result;
      if (e instanceof LockBusy || isTxBusy(e)) {
        await sleep(25 + Math.floor(Math.random() * 60));
        continue;
      }
      throw e;
    }
  }
  return fail("BUSY", R.busy);
}

function actorOf(a: unknown): HkActor | null {
  if (!isRec(a) || !isStr(a.role) || !isStr(a.userId)) return null;
  return {
    role: a.role as MembershipCtx["role"],
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter(isStr) : [],
    permissions: isRec(a.permissions) ? a.permissions : {},
    userId: a.userId,
  };
}
const can = (actor: HkActor, unitId: string, action: string): boolean => evaluate(actor, { module: "hotel", action, unitId });
/** ผู้กระทำที่ได้สิทธิ์ชั่วคราวเฉพาะเส้นที่ใบอนุญาต (แม่บ้านโพสต์ MINIBAR · แม่บ้านปิดห้องเมื่อ hk.canBlock) — ตรวจสิทธิ์ของใบนี้แล้วก่อนเรียก */
const elevate = (actor: HkActor, key: string): HkActor => ({ ...actor, permissions: { ...actor.permissions, [key]: true } });

type RoomRow = { id: string; unitId: string; number: string; roomTypeId: string; hkStatus: string; hkNote: string | null; status: string };
type RoomGate = UnitCtx & { actor: HkActor; room: RoomRow };

/** ด่าน: ห้องของร้าน (ctx.tenantId) → หน่วย HOTEL → เข้าหน่วยได้ (ไม่ได้ ⇒ NOT_FOUND) → สิทธิ์ (FORBIDDEN) */
async function roomGate(actorIn: unknown, ctx: unknown, roomId: unknown, need: (a: HkActor, unitId: string) => boolean): Promise<RoomGate | HkFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const actor = actorOf(actorIn);
  if (!isStr(tenantId) || !actor || !isStr(roomId) || roomId.length > 64) return fail("NOT_FOUND", R.notFound);
  const unitId = await unitOfRoom(tenantId, roomId);
  if (!unitId || !canAccessUnit(actor, unitId)) return fail("NOT_FOUND", R.notFound);
  const room = await tenantDb({ tenantId, unitId }).hotelRoom.findFirst({
    where: { id: roomId, active: true },
    select: { id: true, unitId: true, number: true, roomTypeId: true, hkStatus: true, hkNote: true, status: true },
  });
  if (!room) return fail("NOT_FOUND", R.notFound);
  if (!need(actor, unitId)) return fail("FORBIDDEN", R.forbidden);
  return { tenantId, unitId, actor, room: { ...room, status: String(room.status) } };
}
/** หน่วยโรงแรมของห้อง (ข้อมูลร้านนี้เท่านั้น · SQL ระบุ tenantId ตรง) — ห้องหอ/ร้านอื่น ⇒ null */
async function unitOfRoom(tenantId: string, roomId: string): Promise<string | null> {
  const rows = await tenantDb({ tenantId }).$queryRaw<{ unitId: string }[]>`
    SELECT r."unitId" FROM "HotelRoom" r JOIN "BusinessUnit" u ON u.id = r."unitId" AND u."tenantId" = r."tenantId"
    WHERE r.id = ${roomId} AND r."tenantId" = ${tenantId} AND u.type::text = 'HOTEL' LIMIT 1`;
  return rows[0]?.unitId ?? null;
}
async function hotelUnitOf(ctx: unknown, unitId: unknown): Promise<UnitCtx | null> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!isStr(tenantId) || !isStr(unitId) || unitId.length > 64) return null;
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true } });
  return unit ? { tenantId, unitId: unit.id } : null;
}

/** สัญญาณ realtime (หลัง commit · ไม่ throw) */
async function signal(c: UnitCtx, roomId: string, hkStatus: string): Promise<void> {
  await publish(hotelHkChannel(c.tenantId, c.unitId), EV_HOTEL_HK, { roomId, hkStatus, at: Date.now() });
}

/** เขียนเฉพาะ hkNote (+ เวลาแม่บ้านอัปเดต) — สถานะห้องเขียนผ่าน rooms.setHkStatus เท่านั้น */
async function writeRoomNote(tx: Tx, c: UnitCtx, roomId: string, note: string | null, touch: boolean): Promise<void> {
  await tx.hotelRoom.updateMany({ where: { id: roomId, tenantId: c.tenantId, unitId: c.unitId }, data: touch ? { hkNote: note, hkUpdatedAt: new Date() } : { hkNote: note } });
}

// ═════════════════════════ แกนเปลี่ยนสถานะ (ใต้ล็อกห้อง) ═════════════════════════
type TransitionIn = {
  c: UnitCtx;
  roomId: string;
  to: HkState;
  role: HkRole;
  byUserId: string | null;
  key?: string | null;
  reservationId?: string | null;
  /** สถานะต้นทางที่ยอม (ไม่ตรง ⇒ INVALID_TRANSITION) */
  expectFrom?: readonly string[];
  /** ตรวจเพิ่มใต้ล็อก (เช่น TAKEN) — คืน HkFail ⇒ ยกเลิก */
  check?: (room: { hkStatus: string; note: HkNote }) => HkFail | null;
  /** ส่วนของ note JSON ใน log */
  logNote: (room: { hkStatus: string; note: HkNote }) => Record<string, unknown>;
  /** hkNote ใหม่ (ไม่ส่ง = คงเดิม) */
  patch?: (note: HkNote) => HkNote;
};
/** log ที่ใช้ idempotencyKey นี้แล้ว (ทั้งหน่วย · 30 วันล่าสุด) — ห้องเดิม = ส่งซ้ำ · ห้องอื่น = ชนคีย์ */
const KEY_WINDOW_MS = 30 * 86_400_000;
const keyQuery = (c: UnitCtx, key: string) =>
  ({
    where: { tenantId: c.tenantId, unitId: c.unitId, createdAt: { gte: new Date(Date.now() - KEY_WINDOW_MS) }, note: { contains: `"key":${JSON.stringify(key)}` } },
    orderBy: { createdAt: "desc" },
    select: { roomId: true, fromStatus: true, toStatus: true },
  }) as const;
type TransitionOk = { ok: true; roomId: string; from: string; to: string; replayed?: true; logNote?: Record<string, unknown> };

async function transition(t: TransitionIn): Promise<TransitionOk | HkFail> {
  const { c, roomId, to } = t;
  const out = await withLock(c, `room:${roomId}`, async (tx) => {
    if (t.key) {
      const prev = await tx.hotelHousekeepingLog.findFirst(keyQuery(c, t.key));
      if (prev && prev.roomId !== roomId) throw new HkAbort(fail("INVALID_INPUT", "รหัสกันส่งซ้ำนี้ถูกใช้กับห้องอื่นแล้ว — ดึงหน้าใหม่แล้วลองอีกครั้ง"));
      if (prev) return { replay: true as const, from: prev.fromStatus, to: prev.toStatus };
    }
    const room = await tx.hotelRoom.findFirst({ where: { id: roomId, tenantId: c.tenantId, unitId: c.unitId }, select: { hkStatus: true, hkNote: true } });
    if (!room) throw new HkAbort(fail("NOT_FOUND", R.notFound));
    const from = room.hkStatus;
    const cur = { hkStatus: from, note: parseHkNote(room.hkNote) };
    if (from === "OUT_OF_ORDER" && t.role !== "SYSTEM") throw new HkAbort(fail("USE_BLOCK", R.useBlock));
    if (t.expectFrom && !t.expectFrom.includes(from)) throw new HkAbort(fail("INVALID_TRANSITION", R.transition));
    if (!canHkTransition(from, to, { role: t.role })) throw new HkAbort(fail("INVALID_TRANSITION", R.transition));
    const extra = t.check?.(cur);
    if (extra) throw new HkAbort(extra);
    const logNote = { ...(t.key ? { key: t.key } : {}), ...t.logNote(cur) };
    const log = await tx.hotelHousekeepingLog.create({
      data: { tenantId: c.tenantId, unitId: c.unitId, roomId, fromStatus: from, toStatus: to, byUserId: t.byUserId, reservationId: t.reservationId ?? null, note: JSON.stringify(logNote) },
      select: { id: true },
    });
    await emitOutbox(tx, { tenantId: c.tenantId, unitId: c.unitId, type: HK_EVENTS.changed, idempotencyKey: `${HK_EVENTS.changed}:${log.id}`, payload: { roomId, from, to, byUserId: t.byUserId } });
    // แหล่งความจริงเดียว: แกนห้อง (connection ของตัวเอง · ล้ม ⇒ ย้อน log ทั้งก้อน)
    const hk = await setHkStatus({ tenantId: c.tenantId }, { unitId: c.unitId, roomId, hkStatus: to });
    if (!hk.ok) throw new HkAbort(fail(hk.code === "NOT_FOUND" ? "NOT_FOUND" : "BUSY", hk.code === "NOT_FOUND" ? R.notFound : R.busy));
    const next = t.patch ? serializeHkNote(t.patch(cur.note)) : room.hkNote;
    await writeRoomNote(tx, c, roomId, next, true);
    return { replay: false as const, from, to, logNote };
  });
  if (isHkFail(out)) return out;
  if (out.replay) return { ok: true, roomId, from: out.from, to: out.to, replayed: true };
  await signal(c, roomId, to);
  return { ok: true, roomId, from: out.from, to: out.to, logNote: out.logNote };
}

const roleOf = (actor: HkActor, unitId: string): HkRole => (can(actor, unitId, K_INSPECT) ? "INSPECTOR" : "MAID");
const keyOk = (v: unknown): v is string => typeof v === "string" && KEY_RE.test(v);
const qcAt = (v: unknown): Date | null => {
  if (process.env.SVC_QC_CLOCK !== "1" || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

// ═════════════════════════ §3 hkSetStatus ═════════════════════════
const SetInput = z.object({
  roomId: z.string().min(1).max(64),
  to: z.enum(["DIRTY", "CLEAN", "INSPECTED", "OUT_OF_ORDER"], { message: "สถานะแม่บ้านไม่ถูกต้อง" }),
  note: z.string().trim().max(300, { message: "หมายเหตุยาวเกิน 300 ตัวอักษร" }).optional().nullable(),
  idempotencyKey: z.string().regex(KEY_RE, { message: "รหัสกันส่งซ้ำไม่ถูกต้อง — ดึงหน้าใหม่แล้วลองอีกครั้ง" }),
});

/** เปลี่ยนสถานะแม่บ้าน (offline retry ได้ด้วย idempotencyKey · ซ้ำ = ผลเดิม ไม่ log ซ้ำ) */
export async function hkSetStatus(actorIn: unknown, ctx: unknown, input: unknown): Promise<TransitionOk | HkFail> {
  const p = SetInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const d = p.data;
  const g = await roomGate(actorIn, ctx, d.roomId, (a, u) => can(a, u, K_HK));
  if (isHkFail(g)) return g;
  if (d.to === "OUT_OF_ORDER") return fail("USE_BLOCK", R.useBlock);
  if (d.to === "INSPECTED" && !can(g.actor, g.unitId, K_INSPECT)) return fail("FORBIDDEN", R.inspect);
  return transition({
    c: g,
    roomId: g.room.id,
    to: d.to,
    role: roleOf(g.actor, g.unitId),
    byUserId: g.actor.userId,
    key: d.idempotencyKey,
    logNote: () => (d.note ? { note: d.note } : {}),
  });
}

// ═════════════════════════ §3 hkStart / hkRelease ═════════════════════════
const StartInput = z.object({ roomId: z.string().min(1).max(64), override: z.boolean().optional(), at: z.string().max(40).optional() });

/** เริ่มทำ = เก็บ {assignedTo, startedAt} ใน hkNote (ไม่ใช่ transition) · คนอื่นกำลังทำ ⇒ TAKEN (หัวหน้า override ได้) · `at` เฉพาะใต้ SVC_QC_CLOCK=1 */
export async function hkStart(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; roomId: string; assignedTo: string; startedAt: string } | HkFail> {
  const p = StartInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const d = p.data;
  const g = await roomGate(actorIn, ctx, d.roomId, (a, u) => can(a, u, K_HK));
  if (isHkFail(g)) return g;
  const at = d.at === undefined ? null : qcAt(d.at);
  if (d.at !== undefined && !at) return fail("INVALID_INPUT", "ระบุเวลาเริ่มเองไม่ได้ — ระบบใช้เวลาตอนกดเริ่ม");
  const mayOverride = d.override === true && can(g.actor, g.unitId, K_INSPECT);
  const me = g.actor.userId;
  const out = await withLock(g, `room:${g.room.id}`, async (tx) => {
    const room = await tx.hotelRoom.findFirst({ where: { id: g.room.id, tenantId: g.tenantId, unitId: g.unitId }, select: { hkStatus: true, hkNote: true } });
    if (!room) throw new HkAbort(fail("NOT_FOUND", R.notFound));
    if (room.hkStatus === "OUT_OF_ORDER") throw new HkAbort(fail("ROOM_OOO", R.ooo));
    const note = parseHkNote(room.hkNote);
    if (note.assignedTo === me && note.startedAt) return { assignedTo: me, startedAt: note.startedAt, changed: false };
    if (note.assignedTo && note.assignedTo !== me && !mayOverride) throw new HkAbort(fail("TAKEN", R.taken));
    const startedAt = (at ?? new Date()).toISOString();
    await writeRoomNote(tx, g, g.room.id, serializeHkNote({ ...note, assignedTo: me, startedAt }), false);
    return { assignedTo: me, startedAt, changed: true };
  });
  if (isHkFail(out)) return out;
  if (out.changed) await signal(g, g.room.id, g.room.hkStatus);
  return { ok: true, roomId: g.room.id, assignedTo: out.assignedTo, startedAt: out.startedAt };
}

/** เลิกทำ (คืนห้องเข้ากอง) — คนที่เริ่มเอง หรือหัวหน้า · คงคำขอแขก */
export async function hkRelease(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; roomId: string } | HkFail> {
  const roomId = isRec(input) ? input.roomId : null;
  const g = await roomGate(actorIn, ctx, roomId, (a, u) => can(a, u, K_HK));
  if (isHkFail(g)) return g;
  const lead = can(g.actor, g.unitId, K_INSPECT);
  const out = await withLock(g, `room:${g.room.id}`, async (tx) => {
    const room = await tx.hotelRoom.findFirst({ where: { id: g.room.id, tenantId: g.tenantId, unitId: g.unitId }, select: { hkNote: true } });
    if (!room) throw new HkAbort(fail("NOT_FOUND", R.notFound));
    const note = parseHkNote(room.hkNote);
    if (!note.assignedTo) return false;
    if (note.assignedTo !== g.actor.userId && !lead) throw new HkAbort(fail("TAKEN", R.taken));
    await writeRoomNote(tx, g, g.room.id, serializeHkNote({ guestRequest: note.guestRequest }), false);
    return true;
  });
  if (isHkFail(out)) return out;
  if (out) await signal(g, g.room.id, g.room.hkStatus);
  return { ok: true, roomId: g.room.id };
}

/** คำขอแขก (มติ §9 ข้อ 2) — แม่บ้านหรือหน้าเคาน์เตอร์ (hotel.reservation.create) · null/"" = ล้าง */
export async function setGuestRequest(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; roomId: string; guestRequest: string | null } | HkFail> {
  const roomId = isRec(input) ? input.roomId : null;
  const raw = isRec(input) ? input.text : undefined;
  if (raw !== null && raw !== undefined && typeof raw !== "string") return fail("INVALID_INPUT", "คำขอแขกต้องเป็นข้อความ");
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length > 200) return fail("INVALID_INPUT", "คำขอแขกยาวเกิน 200 ตัวอักษร");
  const g = await roomGate(actorIn, ctx, roomId, (a, u) => can(a, u, K_HK) || can(a, u, "hotel.reservation.create"));
  if (isHkFail(g)) return g;
  const out = await withLock(g, `room:${g.room.id}`, async (tx) => {
    const room = await tx.hotelRoom.findFirst({ where: { id: g.room.id, tenantId: g.tenantId, unitId: g.unitId }, select: { hkNote: true } });
    if (!room) throw new HkAbort(fail("NOT_FOUND", R.notFound));
    const note = parseHkNote(room.hkNote);
    if ((note.guestRequest ?? "") === text) return false;
    await writeRoomNote(tx, g, g.room.id, serializeHkNote({ ...note, guestRequest: text || undefined }), false);
    return true;
  });
  if (isHkFail(out)) return out;
  if (out) await signal(g, g.room.id, g.room.hkStatus);
  return { ok: true, roomId: g.room.id, guestRequest: text || null };
}

// ═════════════════════════ มินิบาร์ (§2 ข้อ 4) ═════════════════════════
export type MinibarItem = { key: string; name: string; priceSatang: number };
const MinibarLine = z.object({ key: z.string().min(1).max(32), qty: z.number().int({ message: "จำนวนต้องเป็นจำนวนเต็ม" }).min(1, { message: "จำนวนต้องตั้งแต่ 1" }).max(20, { message: "จำนวนต่อรายการไม่เกิน 20" }) }).strict();
const MinibarLines = z.array(MinibarLine).max(20, { message: "รายการมินิบาร์มากเกินไป" });
type MinibarSummary = { posted: number; unbilled: number; amountSatang: number; reservationId: string | null; items: { key: string; name: string; qty: number; priceSatang: number }[] };

/** รายการมินิบาร์จากค่าตั้ง #75 (เฉพาะรูป {key,name,priceSatang} · รูป productId ยังไม่รองรับในจอแม่บ้าน) */
export async function minibarItemsOf(tenantId: string, unitId: string): Promise<MinibarItem[]> {
  const v = (await resolveSettings({ tenantId }, ["rooms.hotel.minibar"], { unitId }))["rooms.hotel.minibar"]?.value;
  if (!Array.isArray(v)) return [];
  const out: MinibarItem[] = [];
  for (const x of v) if (isRec(x) && isStr(x.key) && isStr(x.name) && typeof x.priceSatang === "number" && Number.isInteger(x.priceSatang) && x.priceSatang >= 0) out.push({ key: x.key, name: x.name, priceSatang: x.priceSatang });
  return out;
}

/** แขกที่พักอยู่ในห้องนี้วันนี้ (CHECKED_IN) — มี = ลง folio ได้ */
async function inHouseOf(c: UnitCtx, roomId: string): Promise<{ id: string } | null> {
  const t = today();
  return tenantDb(c).hotelReservation.findFirst({
    where: { roomId, status: "CHECKED_IN", checkInDate: { lte: new Date(`${t}T00:00:00.000Z`) }, checkOutDate: { gte: new Date(`${t}T00:00:00.000Z`) } },
    orderBy: { checkInDate: "desc" },
    select: { id: true },
  });
}

/** แกนมินิบาร์ (ผู้เรียกตรวจด่านแล้ว) — ลง folio ต่อรายการ (กันซ้ำต่อ ห้อง/วัน/รายการ[/คีย์ client]) · ไม่มีแขกพัก/บิลปิด ⇒ ค้างเก็บ */
async function minibarCore(g: RoomGate, lines: { key: string; qty: number }[], opts: { log: boolean; clientKey?: string | null }): Promise<MinibarSummary | HkFail> {
  if (!lines.length) return { posted: 0, unbilled: 0, amountSatang: 0, reservationId: null, items: [] };
  const keys = lines.map((l) => l.key);
  if (new Set(keys).size !== keys.length) return fail("INVALID_INPUT", "รายการมินิบาร์ซ้ำกัน — รวมจำนวนเป็นบรรทัดเดียว");
  const catalog = await minibarItemsOf(g.tenantId, g.unitId);
  const items: MinibarSummary["items"] = [];
  for (const l of lines) {
    const it = catalog.find((x) => x.key === l.key);
    if (!it) return fail("INVALID_INPUT", "มีรายการมินิบาร์ที่ไม่อยู่ในค่าตั้งของโรงแรม — ดึงหน้าใหม่");
    items.push({ key: it.key, name: it.name, qty: l.qty, priceSatang: it.priceSatang });
  }
  const ymd = today();
  const suffix = opts.clientKey ? `-${opts.clientKey}` : "";
  const refOf = (k: string) => `svc-h6-minibar-${g.room.id}-${ymd}-${k}${suffix}`.slice(0, 200);
  const rv = await inHouseOf(g, g.room.id);
  if (rv) {
    const folioActor = elevate(g.actor, "hotel.folio.post");
    const res = await withLock(g, `minibar:${g.room.id}`, async (tx) => {
      let posted = 0;
      let amount = 0;
      const left: MinibarSummary["items"] = [];
      for (const it of items) {
        const dup = await tx.hotelFolioItem.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, type: "MINIBAR", refType: MB_REF, refId: refOf(it.key), voidedAt: null }, select: { id: true } });
        if (dup) continue;
        const r = await postFolioItem(folioActor, { tenantId: g.tenantId }, { reservationId: rv.id, type: "MINIBAR", description: `มินิบาร์ · ${it.name}`, qty: it.qty, unitAmountSatang: it.priceSatang, refType: MB_REF, refId: refOf(it.key) });
        if (r.ok) {
          posted++;
          amount += it.qty * it.priceSatang;
        } else if (r.code === "FOLIO_CLOSED") left.push(it);
        else throw new HkAbort(fail(r.code === "INVALID_INPUT" ? "INVALID_INPUT" : r.code === "NOT_FOUND" ? "NOT_FOUND" : "BUSY", r.reason));
      }
      if (posted > 0) {
        await emitOutbox(tx, {
          tenantId: g.tenantId,
          unitId: g.unitId,
          type: HK_EVENTS.minibarPosted,
          idempotencyKey: `${HK_EVENTS.minibarPosted}:${randomUUID()}`,
          payload: { reservationId: rv.id, roomId: g.room.id, items: posted, amountSatang: amount },
        });
      }
      return { posted, amount, left };
    });
    if (isHkFail(res)) return res;
    if (!res.left.length) return { posted: res.posted, unbilled: 0, amountSatang: res.amount, reservationId: rv.id, items };
    const u = await unbilled(g, res.left, ymd, suffix, opts.log);
    if (isHkFail(u)) return u;
    return { posted: res.posted, unbilled: res.left.length, amountSatang: res.amount, reservationId: rv.id, items };
  }
  const u = await unbilled(g, items, ymd, suffix, opts.log);
  if (isHkFail(u)) return u;
  return { posted: 0, unbilled: items.length, amountSatang: 0, reservationId: null, items };
}

/** มินิบาร์ค้างเก็บ (แขกออกไปแล้ว/บิลปิด) — event ครั้งเดียวต่อชุด + log หมายเหตุ (หน้าเคาน์เตอร์เลือก เรียกเก็บ/ยกให้) */
async function unbilled(g: RoomGate, items: MinibarSummary["items"], ymd: string, suffix: string, log: boolean): Promise<true | HkFail> {
  const sig = items.map((i) => `${i.key}:${i.qty}`).sort().join(",");
  const amount = items.reduce((s, i) => s + i.qty * i.priceSatang, 0);
  const out = await withLock(g, `room:${g.room.id}`, async (tx) => {
    const n = await emitOutboxMany(tx, [
      {
        tenantId: g.tenantId,
        unitId: g.unitId,
        type: HK_EVENTS.minibarUnbilled,
        idempotencyKey: `${HK_EVENTS.minibarUnbilled}:${g.room.id}:${ymd}:${sig}${suffix}`.slice(0, 250),
        payload: { roomId: g.room.id, items: items.length, amountSatang: amount },
      },
    ]);
    if (n === 0 || !log) return true as const;
    const room = await tx.hotelRoom.findFirst({ where: { id: g.room.id, tenantId: g.tenantId, unitId: g.unitId }, select: { hkStatus: true } });
    const st = room?.hkStatus ?? g.room.hkStatus;
    await tx.hotelHousekeepingLog.create({
      data: { tenantId: g.tenantId, unitId: g.unitId, roomId: g.room.id, fromStatus: st, toStatus: st, byUserId: g.actor.userId, note: JSON.stringify({ minibar: { unbilled: true, status: "PENDING", items, amountSatang: amount } }) },
    });
    return true as const;
  });
  return out;
}

const MinibarInput = z.object({ roomId: z.string().min(1).max(64), items: z.unknown(), idempotencyKey: z.string().regex(KEY_RE).optional().nullable() });

/** มินิบาร์ที่ใช้ → ลงบิลห้องแขก (สิทธิ์ hotel.housekeeping · ราคาจากค่าตั้งเท่านั้น) */
export async function postMinibar(actorIn: unknown, ctx: unknown, input: unknown): Promise<({ ok: true } & MinibarSummary) | HkFail> {
  const p = MinibarInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const lines = MinibarLines.safeParse(p.data.items);
  if (!lines.success) return fail("INVALID_INPUT", zodReason(lines.error));
  if (!lines.data.length) return fail("INVALID_INPUT", "เลือกรายการมินิบาร์อย่างน้อย 1 รายการ");
  const g = await roomGate(actorIn, ctx, p.data.roomId, (a, u) => can(a, u, K_HK));
  if (isHkFail(g)) return g;
  const r = await minibarCore(g, lines.data, { log: true, clientKey: p.data.idempotencyKey ?? null });
  if (isHkFail(r)) return r;
  return { ok: true, ...r };
}

// ═════════════════════════ §3 hkFinish / hkInspect ═════════════════════════
const FinishInput = z.object({
  roomId: z.string().min(1).max(64),
  checklist: z.array(z.object({ key: z.string().min(1).max(120), done: z.boolean() }), { message: "เช็กลิสต์ไม่ถูกต้อง" }).max(60),
  minibar: z.unknown().optional(),
  note: z.string().trim().max(300, { message: "หมายเหตุยาวเกิน 300 ตัวอักษร" }).optional().nullable(),
  idempotencyKey: z.string().regex(KEY_RE).optional().nullable(),
});

/** เสร็จ · ส่งให้ตรวจ = มินิบาร์ (ถ้ามี) + DIRTY→CLEAN + ล้างผู้ทำ (คงคำขอแขก) + log {checklist, durationSec} */
export async function hkFinish(actorIn: unknown, ctx: unknown, input: unknown): Promise<(TransitionOk & { durationSec: number | null; minibar: MinibarSummary | null }) | HkFail> {
  const p = FinishInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const d = p.data;
  const mbLines = MinibarLines.safeParse(d.minibar ?? []);
  if (!mbLines.success) return fail("INVALID_INPUT", zodReason(mbLines.error));
  const g = await roomGate(actorIn, ctx, d.roomId, (a, u) => can(a, u, K_HK));
  if (isHkFail(g)) return g;
  const lead = can(g.actor, g.unitId, K_INSPECT);
  const me = g.actor.userId;
  const key = d.idempotencyKey ?? null;
  const takenCheck = (note: HkNote): HkFail | null => (note.assignedTo && note.assignedTo !== me && !lead ? fail("TAKEN", R.taken) : null);
  // ตรวจก่อนแตะเงิน (ใต้ล็อกตรวจซ้ำอีกรอบ) — ส่งซ้ำด้วยคีย์เดิมข้ามไปคืนผลเดิม
  const replay = key ? await tenantDb(g).hotelHousekeepingLog.findFirst(keyQuery(g, key)) : null;
  if (replay && replay.roomId !== g.room.id) return fail("INVALID_INPUT", "รหัสกันส่งซ้ำนี้ถูกใช้กับห้องอื่นแล้ว — ดึงหน้าใหม่แล้วลองอีกครั้ง");
  if (!replay) {
    if (g.room.hkStatus === "OUT_OF_ORDER") return fail("USE_BLOCK", R.useBlock);
    if (g.room.hkStatus !== "DIRTY") return fail("INVALID_TRANSITION", R.transition);
    const t = takenCheck(parseHkNote(g.room.hkNote));
    if (t) return t;
  }
  let mb: MinibarSummary | null = null;
  if (!replay && mbLines.data.length) {
    const r = await minibarCore(g, mbLines.data, { log: false, clientKey: key });
    if (isHkFail(r)) return r;
    mb = r;
  }
  let durationSec: number | null = null;
  const res = await transition({
    c: g,
    roomId: g.room.id,
    to: "CLEAN",
    role: lead ? "INSPECTOR" : "MAID",
    byUserId: me,
    key,
    expectFrom: ["DIRTY"],
    check: (room) => takenCheck(room.note),
    logNote: (room) => {
      const startMs = room.note.startedAt ? Date.parse(room.note.startedAt) : Number.NaN;
      durationSec = Number.isFinite(startMs) ? Math.max(0, Math.round((Date.now() - startMs) / 1000)) : null;
      return {
        checklist: d.checklist,
        durationSec,
        ...(room.note.assignedTo ? { startedBy: room.note.assignedTo } : {}),
        ...(mb && mb.items.length ? { minibar: { posted: mb.posted, unbilled: mb.unbilled, amountSatang: mb.amountSatang, items: mb.items } } : {}),
        ...(d.note ? { note: d.note } : {}),
      };
    },
    patch: (n) => ({ guestRequest: n.guestRequest }),
  });
  if (isHkFail(res)) return res;
  return { ...res, durationSec, minibar: mb };
}

const InspectInput = z.object({
  roomId: z.string().min(1).max(64),
  pass: z.boolean({ message: "ระบุผลตรวจ ผ่าน หรือ ไม่ผ่าน" }),
  note: z.string().trim().max(300, { message: "หมายเหตุยาวเกิน 300 ตัวอักษร" }).optional().nullable(),
  idempotencyKey: z.string().regex(KEY_RE).optional().nullable(),
});

/** ตรวจห้อง (hotel.housekeeping.inspect): ผ่าน ⇒ INSPECTED · ไม่ผ่าน ⇒ DIRTY + เหตุผล (บังคับ) */
export async function hkInspect(actorIn: unknown, ctx: unknown, input: unknown): Promise<TransitionOk | HkFail> {
  const p = InspectInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const d = p.data;
  const g = await roomGate(actorIn, ctx, d.roomId, (a, u) => can(a, u, K_INSPECT));
  if (isHkFail(g)) return g;
  if (!d.pass && !d.note) return fail("INVALID_INPUT", "ไม่ผ่านต้องบอกเหตุผลให้แม่บ้านแก้");
  return transition({
    c: g,
    roomId: g.room.id,
    to: d.pass ? "INSPECTED" : "DIRTY",
    role: "INSPECTOR",
    byUserId: g.actor.userId,
    key: d.idempotencyKey ?? null,
    expectFrom: ["CLEAN"],
    logNote: () => ({ inspect: d.pass ? "PASS" : "FAIL", ...(d.note ? { note: d.note } : {}) }),
  });
}

// ═════════════════════════ §3 แจ้งของเสีย ═════════════════════════
type PhotoIn = { data: Uint8Array; contentType: string };
function sniff(ct: string, b: Uint8Array): boolean {
  const at = (i: number) => (i < b.length ? b[i] : -1);
  const ascii = (off: number, s: string) => [...s].every((ch, i) => at(off + i) === ch.charCodeAt(0));
  if (ct === "image/jpeg") return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
  if (ct === "image/png") return at(0) === 0x89 && ascii(1, "PNG") && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a;
  if (ct === "image/webp") return ascii(0, "RIFF") && ascii(8, "WEBP");
  return false;
}
/** รูปแจ้งของเสีย (X6): ≤ 3 รูป · ชนิด jpeg/png/webp · ≤ 8 MB · ไบต์หัวตรงชนิด */
function photosOf(v: unknown): PhotoIn[] | HkFail {
  const list = v === undefined || v === null ? [] : v;
  if (!Array.isArray(list)) return fail("INVALID_INPUT", "รูปไม่ถูกต้อง");
  if (list.length > PHOTO_MAX) return fail("INVALID_INPUT", `แนบรูปได้ไม่เกิน ${PHOTO_MAX} รูป`);
  const out: PhotoIn[] = [];
  for (const f of list) {
    if (!isRec(f) || !(f.data instanceof Uint8Array)) return fail("INVALID_FILE", R.file);
    const ct = typeof f.contentType === "string" ? f.contentType.split(";")[0]!.trim().toLowerCase() : "";
    if (!(PHOTO_TYPES as readonly string[]).includes(ct) || f.data.length < 8 || f.data.length > PHOTO_BYTES || !sniff(ct, f.data)) return fail("INVALID_FILE", R.file);
    out.push({ data: f.data, contentType: ct });
  }
  return out;
}

const DefectInput = z.object({
  roomId: z.string().min(1).max(64),
  text: z.string({ message: "เล่าอาการของเสีย/ของหาย" }).trim().min(1, { message: "เล่าอาการของเสีย/ของหาย" }).max(500, { message: "ข้อความยาวเกิน 500 ตัวอักษร" }),
  action: z.enum(["BLOCK", "REPAIR"], { message: "เลือก ปิดห้องซ่อม หรือ แจ้งช่าง" }),
  blockDays: z.number().int().min(1).max(30).optional().nullable(),
  category: z.string().max(24).optional().nullable(),
  photos: z.unknown().optional(),
  idempotencyKey: z.string().regex(KEY_RE).optional().nullable(),
});

/** log บันทึก (from=to) + event hotel.hk.defect ครั้งเดียวต่อใบซ่อม/การปิดห้อง */
async function defectLog(g: RoomGate, note: Record<string, unknown>, ev: { action: "BLOCK" | "REPAIR"; repairId?: string; blockId?: string }): Promise<true | HkFail> {
  return withLock(g, `room:${g.room.id}`, async (tx) => {
    const room = await tx.hotelRoom.findFirst({ where: { id: g.room.id, tenantId: g.tenantId, unitId: g.unitId }, select: { hkStatus: true } });
    const st = room?.hkStatus ?? g.room.hkStatus;
    const n = await emitOutboxMany(tx, [
      {
        tenantId: g.tenantId,
        unitId: g.unitId,
        type: HK_EVENTS.defect,
        idempotencyKey: `${HK_EVENTS.defect}:${ev.repairId ?? ev.blockId ?? randomUUID()}`,
        payload: { roomId: g.room.id, action: ev.action, ...(ev.repairId ? { repairId: ev.repairId } : {}), ...(ev.blockId ? { blockId: ev.blockId } : {}) },
      },
    ]);
    if (n === 0) return true as const;
    await tx.hotelHousekeepingLog.create({ data: { tenantId: g.tenantId, unitId: g.unitId, roomId: g.room.id, fromStatus: st, toStatus: st, byUserId: g.actor.userId, note: JSON.stringify(note) } });
    return true as const;
  });
}

/**
 * แจ้งของเสีย/ของหาย: REPAIR = ใบซ่อม (dorm/repair เส้นพนักงาน · ไม่เปลี่ยน hkStatus) · BLOCK = ปิดห้องซ่อม N วัน (blockRoom ของ H.2 ⇒ OUT_OF_ORDER)
 *   สิทธิ์: REPAIR = hotel.housekeeping · BLOCK = hotel.booking.manage หรือ (hotel.housekeeping + rooms.hotel.hk.canBlock)
 */
export async function reportDefect(
  actorIn: unknown,
  ctx: unknown,
  input: unknown,
): Promise<{ ok: true; action: "BLOCK" | "REPAIR"; repairId?: string; blockId?: string } | HkFail> {
  const p = DefectInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const d = p.data;
  if (d.action === "BLOCK" && (d.blockDays === undefined || d.blockDays === null)) return fail("INVALID_INPUT", "ระบุจำนวนวันที่ปิดห้อง (1–30 วัน)");
  const photos = photosOf(d.photos);
  if (isHkFail(photos)) return photos;
  const g = await roomGate(actorIn, ctx, d.roomId, (a, u) => can(a, u, K_HK) || (d.action === "BLOCK" && can(a, u, K_BOOKING)));
  if (isHkFail(g)) return g;
  if (d.action === "REPAIR") {
    if (!can(g.actor, g.unitId, K_HK)) return fail("FORBIDDEN", R.forbidden);
    const dorm = await import("@/lib/modules/dorm");
    const r = await dorm.createStaffRepair(g.actor, { tenantId: g.tenantId }, { unitId: g.unitId, roomId: g.room.id, category: d.category ?? null, text: d.text, photos, allowEntry: true, idempotencyKey: d.idempotencyKey ?? null });
    if (!r.ok) {
      const code: HkFailCode = r.code === "INVALID_FILE" || r.code === "INVALID_INPUT" || r.code === "NOT_FOUND" || r.code === "FORBIDDEN" || r.code === "UPLOAD_FAILED" ? r.code : "BUSY";
      return fail(code, r.reason);
    }
    const lg = await defectLog(g, { defect: "REPAIR", text: d.text, repairId: r.repairId }, { action: "REPAIR", repairId: r.repairId });
    if (isHkFail(lg)) return lg;
    return { ok: true, action: "REPAIR", repairId: r.repairId };
  }
  // BLOCK
  const byBooking = can(g.actor, g.unitId, K_BOOKING);
  if (!byBooking) {
    const cb = (await resolveSettings({ tenantId: g.tenantId }, ["rooms.hotel.hk.canBlock"], { unitId: g.unitId }))["rooms.hotel.hk.canBlock"]?.value;
    if (cb !== true) return fail("FORBIDDEN", "แม่บ้านปิดห้องเองไม่ได้ในโรงแรมนี้ — เลือก \"แจ้งช่าง\" หรือแจ้งหน้าเคาน์เตอร์");
  }
  const from = today();
  const to = addDaysYmd(from, d.blockDays ?? 1);
  const b = await blockRoom(byBooking ? g.actor : elevate(g.actor, K_BOOKING), { tenantId: g.tenantId }, { unitId: g.unitId, roomId: g.room.id, from, to, reason: d.text });
  if (!b.ok) {
    if (b.code === "ROOM_TAKEN") return fail("ROOM_TAKEN", "ห้องนี้มีแขกพัก/จองอยู่ในช่วงที่จะปิด — เลือก \"แจ้งช่าง\" แทน", { conflicts: b.conflicts, suggest: "REPAIR" });
    const code: HkFailCode = b.code === "NOT_FOUND" || b.code === "FORBIDDEN" || b.code === "BUSY" ? b.code : "INVALID_INPUT";
    return fail(code, b.reason);
  }
  const fileIds: string[] = [];
  for (const [i, ph] of photos.entries()) {
    const up = await uploadFile({ tenantId: g.tenantId }, { kind: "ATTACHMENT", visibility: "private", filename: `defect-${b.blockId}-${i + 1}.${ph.contentType.split("/")[1] ?? "bin"}`, contentType: ph.contentType, data: ph.data, maxBytes: PHOTO_BYTES });
    if (up.ok) fileIds.push(up.assetId);
  }
  const lg = await defectLog(g, { defect: "BLOCK", text: d.text, blockId: b.blockId, days: d.blockDays, ...(fileIds.length ? { photos: fileIds } : {}) }, { action: "BLOCK", blockId: b.blockId });
  if (isHkFail(lg)) return lg;
  await signal(g, g.room.id, b.hkStatus ?? "OUT_OF_ORDER");
  return { ok: true, action: "BLOCK", blockId: b.blockId };
}

// ═════════════════════════ §3 บอร์ดงานวันนี้ (มุมมอง) ═════════════════════════
export type HkBoardRow = {
  roomId: string;
  number: string;
  floor: number | null;
  typeName: string;
  roomTypeId: string;
  hkStatus: string;
  context: HkContext;
  arrivalTime: string | null;
  arrivalName: string | null;
  guestRequest: string | null;
  assignedTo: string | null;
  startedAt: string | null;
  departedAt: string | null;
  hkUpdatedAt: string | null;
  priority: number;
  done: boolean;
  /** ห้องว่างที่ตรวจแล้วและมีจองเข้าใน 7 วัน (ป้าย "พร้อมรับ") — มีเฉพาะเมื่อจริง */
  upcoming?: true;
  upcomingDate?: string;
};
export type HkBoard = { ok: true; unitId: string; today: string; inspectionRequired: boolean; counts: { mine: number; total: number; done: number }; rooms: HkBoardRow[] };

type BoardRoomSql = { unitId: string; roomId: string | null; number: string | null; floorNo: number | null; hkStatus: string | null; hkNote: string | null; hkUpdatedAt: Date | null; roomTypeId: string | null; typeName: string | null; rentMode: string | null };
type BoardResSql = { k: string; id: string; roomId: string; status: string; startDate: Date; endDate: Date; checkedOutAt: Date | null; guestName: string | null };
const ymdOfDb = (d: Date): string => d.toISOString().slice(0, 10);
/** ห้องในงานวันนี้ (มติ §9 ข้อ 4): มีบริบท (ไม่ว่าง) หรือว่างแต่ยังไม่สะอาด หรือว่างที่ตรวจแล้วรอแขก · ไม่รวมปิดซ่อม */
export const inWork = (r: { context: string; hkStatus: string; upcoming?: boolean }): boolean => r.context !== "OOO" && (r.context !== "VACANT" || r.hkStatus === "DIRTY" || r.upcoming === true);
const numCmp = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });

async function buildBoard(c: UnitCtx, mine: string | null): Promise<HkBoard | HkFail> {
  const db = tenantDb({ tenantId: c.tenantId });
  const t = today();
  const until = addDaysYmd(t, UPCOMING_DAYS);
  const rooms = await db.$queryRaw<BoardRoomSql[]>`
    SELECT u.id AS "unitId", r.id AS "roomId", r.number, r."floorNo", r."hkStatus", r."hkNote", r."hkUpdatedAt", r."roomTypeId", rt.name AS "typeName",
           COALESCE(r."rentMode", rt."rentMode") AS "rentMode"
    FROM "BusinessUnit" u
    LEFT JOIN "HotelRoom" r ON r."unitId" = u.id AND r."tenantId" = u."tenantId" AND r.active = true
    LEFT JOIN "HotelRoomType" rt ON rt.id = r."roomTypeId"
    WHERE u.id = ${c.unitId} AND u."tenantId" = ${c.tenantId} AND u.type::text = 'HOTEL'`;
  if (!rooms.length) return fail("NOT_FOUND", "ไม่พบโรงแรมนี้");
  const list = rooms.filter((r): r is BoardRoomSql & { roomId: string; number: string; hkStatus: string; roomTypeId: string } => !!r.roomId && !!r.number && !!r.hkStatus && !!r.roomTypeId && r.rentMode !== "MONTHLY");
  const typeIds = [...new Set(list.map((r) => r.roomTypeId))];
  const [res, settings] = await Promise.all([
    list.length
      ? db.$queryRaw<BoardResSql[]>`
        SELECT 'R' AS k, rv.id, rv."roomId", rv.status::text AS status, rv."checkInDate" AS "startDate", rv."checkOutDate" AS "endDate", rv."checkedOutAt", rv."guestName"
        FROM "HotelReservation" rv
        WHERE rv."tenantId" = ${c.tenantId} AND rv."unitId" = ${c.unitId} AND rv."roomId" IS NOT NULL
          AND (
            (rv.status::text = 'CHECKED_IN' AND rv."checkInDate" <= ${t}::date AND rv."checkOutDate" >= ${t}::date)
            OR (rv.status::text IN ('CONFIRMED', 'HOLD', 'BOOKED') AND rv."checkInDate" >= ${t}::date AND rv."checkInDate" <= ${until}::date)
            OR (rv.status::text IN ('CHECKED_OUT', 'REFUNDED') AND (rv."checkOutDate" = ${t}::date OR rv."checkedOutAt" >= ${bkkStart(t)}))
          )
        UNION ALL
        SELECT 'B' AS k, o.id, o."roomId", 'BLOCK' AS status, o."startDate", o."endDate", NULL::timestamp AS "checkedOutAt", NULL::text AS "guestName"
        FROM "RoomOccupancy" o
        WHERE o."tenantId" = ${c.tenantId} AND o."unitId" = ${c.unitId} AND o.kind = 'BLOCK' AND o.active = true AND o."startDate" <= ${t}::date AND o."endDate" > ${t}::date`
      : Promise.resolve([] as BoardResSql[]),
    resolveSettingsMany({ tenantId: c.tenantId }, ["rooms.hotel.checkInTime", "rooms.hotel.inspectionRequired"], [{ unitId: c.unitId }, ...typeIds.map((roomTypeId) => ({ unitId: c.unitId, roomTypeId }))]),
  ]);
  const inspectionRequired = settings[0]?.["rooms.hotel.inspectionRequired"]?.value === true;
  const ciTime = new Map<string, string>();
  typeIds.forEach((id, i) => {
    const v = settings[i + 1]?.["rooms.hotel.checkInTime"]?.value;
    ciTime.set(id, typeof v === "string" ? v : "14:00");
  });
  const byRoom = new Map<string, BoardResSql[]>();
  for (const r of res) (byRoom.get(r.roomId) ?? byRoom.set(r.roomId, []).get(r.roomId)!).push(r);
  const out: HkBoardRow[] = list.map((room) => {
    const rs = byRoom.get(room.roomId) ?? [];
    const blocked = rs.some((x) => x.k === "B");
    const inHouse = rs.filter((x) => x.k === "R" && x.status === "CHECKED_IN");
    const stay = inHouse.find((x) => ymdOfDb(x.endDate) > t);
    const leaving = inHouse.find((x) => ymdOfDb(x.endDate) === t);
    const departed = rs.filter((x) => x.k === "R" && (x.status === "CHECKED_OUT" || x.status === "REFUNDED")).sort((a, b) => (b.checkedOutAt?.getTime() ?? 0) - (a.checkedOutAt?.getTime() ?? 0))[0];
    const future = rs.filter((x) => x.k === "R" && (x.status === "CONFIRMED" || x.status === "HOLD" || x.status === "BOOKED")).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const arrival = future.find((x) => ymdOfDb(x.startDate) === t);
    let context: HkContext;
    if (room.hkStatus === "OUT_OF_ORDER" || blocked) context = "OOO";
    else if (stay) context = "STAYOVER";
    else if (leaving) context = "DEPARTING";
    else if (departed) context = "DEPARTED";
    else if (arrival) context = "ARRIVING";
    else context = "VACANT";
    const note = parseHkNote(room.hkNote);
    const arrivalTime = arrival && context !== "OOO" && context !== "STAYOVER" ? (ciTime.get(room.roomTypeId) ?? "14:00") : null;
    const next = context === "VACANT" && room.hkStatus === "INSPECTED" ? future.find((x) => ymdOfDb(x.startDate) > t) : undefined;
    const row: HkBoardRow = {
      roomId: room.roomId,
      number: room.number,
      floor: room.floorNo,
      typeName: room.typeName ?? "",
      roomTypeId: room.roomTypeId,
      hkStatus: room.hkStatus,
      context,
      arrivalTime,
      arrivalName: arrivalTime ? firstName(arrival?.guestName) : next ? firstName(next.guestName) : null,
      guestRequest: note.guestRequest ?? null,
      assignedTo: note.assignedTo ?? null,
      startedAt: note.assignedTo ? (note.startedAt ?? null) : null,
      departedAt: context === "DEPARTED" && departed?.checkedOutAt ? departed.checkedOutAt.toISOString() : null,
      hkUpdatedAt: room.hkUpdatedAt ? room.hkUpdatedAt.toISOString() : null,
      priority: 0,
      done: false,
      ...(next ? { upcoming: true as const, upcomingDate: ymdOfDb(next.startDate) } : {}),
    };
    row.priority = hkPriority(row);
    row.done = inWork(row) && (row.hkStatus === "CLEAN" || row.hkStatus === "INSPECTED") && !row.guestRequest;
    return row;
  });
  out.sort((a, b) => a.priority - b.priority || (a.arrivalTime ?? "99:99").localeCompare(b.arrivalTime ?? "99:99") || numCmp(a.number, b.number));
  const work = out.filter(inWork);
  return {
    ok: true,
    unitId: c.unitId,
    today: t,
    inspectionRequired,
    counts: { mine: mine ? out.filter((r) => r.assignedTo === mine).length : 0, total: work.length, done: work.filter((r) => r.done).length },
    rooms: out,
  };
}

/** งานห้องวันนี้ (อ่านอย่างเดียว · สิทธิ์ตรวจที่หน้า/action) · mine = userId สำหรับนับ "ของฉัน" */
export async function hkBoard(ctx: unknown, input: unknown): Promise<HkBoard | HkFail> {
  const unitId = isRec(input) ? input.unitId : null;
  const mine = isRec(input) && isStr(input.mine) ? input.mine : null;
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!isStr(tenantId) || !isStr(unitId) || unitId.length > 64) return fail("NOT_FOUND", "ไม่พบโรงแรมนี้");
  return buildBoard({ tenantId, unitId }, mine);
}

export type HkRoomView = { ok: true; room: HkBoardRow; inspectionRequired: boolean; checklist: string[]; minibar: MinibarItem[]; inHouse: boolean; today: string };
/** หน้าทำห้อง: แถวของห้อง + เช็กลิสต์ตามประเภทห้อง (#74) + มินิบาร์ (#75) + มีแขกพักอยู่ไหม (ลงบิลได้) */
export async function hkRoom(ctx: unknown, input: unknown): Promise<HkRoomView | HkFail> {
  const unitId = isRec(input) ? input.unitId : null;
  const roomId = isRec(input) ? input.roomId : null;
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!isStr(tenantId) || !isStr(unitId) || !isStr(roomId)) return fail("NOT_FOUND", R.notFound);
  const b = await buildBoard({ tenantId, unitId }, null);
  if (!b.ok) return b;
  const room = b.rooms.find((r) => r.roomId === roomId);
  if (!room) return fail("NOT_FOUND", R.notFound);
  const [cl, minibar, rv] = await Promise.all([
    resolveSettings({ tenantId }, ["rooms.hotel.housekeepingChecklist"], { unitId, roomTypeId: room.roomTypeId }),
    minibarItemsOf(tenantId, unitId),
    inHouseOf({ tenantId, unitId }, roomId),
  ]);
  const raw = cl["rooms.hotel.housekeepingChecklist"]?.value;
  const checklist = Array.isArray(raw) ? raw.filter(isStr) : [];
  return { ok: true, room, inspectionRequired: b.inspectionRequired, checklist, minibar, inHouse: !!rv, today: b.today };
}

// ═════════════════════════ §3 ประวัติ ═════════════════════════
export type HkLogRow = { id: string; roomId: string; roomNumber: string; fromStatus: string; toStatus: string; byUserId: string | null; byName: string | null; reservationId: string | null; note: string | null; createdAt: string };
const LOG_MAX = 500;

/** ประวัติแม่บ้าน {unitId | roomId, from, to (วันไทย รวมปลาย), userId?} — ข้ามร้าน/หน่วยอื่น ⇒ NOT_FOUND */
export async function hkLogs(ctx: unknown, input: unknown): Promise<{ ok: true; rows: HkLogRow[] } | HkFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!isStr(tenantId) || !isRec(input)) return fail("NOT_FOUND", R.notFound);
  const t = today();
  const from = isYmd(input.from) ? input.from : addDaysYmd(t, -6);
  const to = isYmd(input.to) ? input.to : t;
  if (to < from || addDaysYmd(from, 92) < to) return fail("INVALID_INPUT", "ช่วงวันไม่ถูกต้อง (ไม่เกิน 92 วัน)");
  let unitId = isStr(input.unitId) ? input.unitId : null;
  const roomId = isStr(input.roomId) ? input.roomId : null;
  if (roomId) {
    const ru = roomId.length <= 64 ? await unitOfRoom(tenantId, roomId) : null;
    if (!ru || (unitId && unitId !== ru)) return fail("NOT_FOUND", R.notFound);
    unitId = ru;
  }
  const u = await hotelUnitOf(ctx, unitId);
  if (!u) return fail("NOT_FOUND", "ไม่พบโรงแรมนี้");
  const userId = isStr(input.userId) ? input.userId : null;
  const db = tenantDb(u);
  const rows = await db.hotelHousekeepingLog.findMany({
    where: { ...(roomId ? { roomId } : {}), ...(userId ? { byUserId: userId } : {}), createdAt: { gte: bkkStart(from), lt: bkkStart(addDaysYmd(to, 1)) } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LOG_MAX,
    select: { id: true, roomId: true, fromStatus: true, toStatus: true, byUserId: true, reservationId: true, note: true, createdAt: true, room: { select: { number: true } } },
  });
  const uids = [...new Set(rows.map((r) => r.byUserId).filter((x): x is string => !!x))];
  const users = uids.length ? await tenantDb({ tenantId }).user.findMany({ where: { id: { in: uids } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(users.map((x) => [x.id, x.name ?? null]));
  return {
    ok: true,
    rows: rows.map((r) => ({
      id: r.id,
      roomId: r.roomId,
      roomNumber: r.room?.number ?? "",
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      byUserId: r.byUserId,
      byName: r.byUserId ? firstName(nameOf.get(r.byUserId) ?? null) : null,
      reservationId: r.reservationId,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ═════════════════════════ night audit (H.7 เรียก) ═════════════════════════
/** ปิดห้องที่ถึงวัน ⇒ OUT_OF_ORDER · ปิดห้องที่หมดช่วง (จบภายใน 7 วัน ไม่มีปิดอื่นครอบ) ⇒ DIRTY — หนี้ H.2 (BLOCK อนาคตไม่พลิก OOO เมื่อถึงวัน) */
export async function syncBlockedRooms(ctx: unknown, input: unknown): Promise<{ ok: true; toOoo: number; toDirty: number } | HkFail> {
  const businessDate = isRec(input) ? input.businessDate : null;
  if (!isYmd(businessDate)) return fail("INVALID_INPUT", "วันที่ธุรกิจต้องเป็น YYYY-MM-DD");
  const u = await hotelUnitOf(ctx, isRec(input) ? input.unitId : null);
  if (!u) return fail("NOT_FOUND", "ไม่พบโรงแรมนี้");
  const db = tenantDb(u);
  const bd = new Date(`${businessDate}T00:00:00.000Z`);
  const [covering, ended, rooms] = await Promise.all([
    db.roomOccupancy.findMany({ where: { kind: "BLOCK", active: true, startDate: { lte: bd }, endDate: { gt: bd } }, select: { roomId: true, refId: true } }),
    db.roomOccupancy.findMany({ where: { kind: "BLOCK", active: true, endDate: { lte: bd, gt: new Date(`${addDaysYmd(businessDate, -7)}T00:00:00.000Z`) } }, select: { roomId: true } }),
    db.hotelRoom.findMany({ where: { active: true }, select: { id: true, hkStatus: true } }),
  ]);
  const cover = new Set(covering.map((o) => o.roomId));
  const endedSet = new Set(ended.map((o) => o.roomId));
  let toOoo = 0;
  let toDirty = 0;
  for (const r of rooms) {
    if (cover.has(r.id) && r.hkStatus !== "OUT_OF_ORDER") {
      const x = await transition({ c: u, roomId: r.id, to: "OUT_OF_ORDER", role: "SYSTEM", byUserId: null, logNote: () => ({ note: `night audit ${businessDate}: ถึงวันปิดห้องซ่อม` }) });
      if (x.ok && !x.replayed) toOoo++;
    } else if (!cover.has(r.id) && r.hkStatus === "OUT_OF_ORDER" && endedSet.has(r.id)) {
      const x = await transition({ c: u, roomId: r.id, to: "DIRTY", role: "SYSTEM", byUserId: null, expectFrom: ["OUT_OF_ORDER"], logNote: () => ({ note: `night audit ${businessDate}: หมดช่วงปิดห้อง — รอแม่บ้านตรวจก่อนขาย` }) });
      if (x.ok && !x.replayed) toDirty++;
    }
  }
  return { ok: true, toOoo, toDirty };
}

/**
 * ห้องที่แขกพักข้ามคืน businessDate (CHECKED_IN · checkIn ≤ วันนั้น < checkOut) และ dailyHousekeeping เปิด (ชั้นประเภทห้อง) ⇒ DIRTY (by=null · note "night audit")
 *   idempotent ตามสถานะ (ห้องที่ DIRTY อยู่แล้วข้าม · พร้อมกัน 2 ทาง = log 1) · ปิดห้องที่ถึงวัน/หมดช่วงซิงก์ไปด้วย (syncBlockedRooms)
 */
export async function markStayoversDirty(ctx: unknown, input: unknown): Promise<{ ok: true; changed: number; toOoo: number; toDirty: number } | HkFail> {
  const businessDate = isRec(input) ? input.businessDate : null;
  if (!isYmd(businessDate)) return fail("INVALID_INPUT", "วันที่ธุรกิจต้องเป็น YYYY-MM-DD");
  const u = await hotelUnitOf(ctx, isRec(input) ? input.unitId : null);
  if (!u) return fail("NOT_FOUND", "ไม่พบโรงแรมนี้");
  const sync = await syncBlockedRooms(u, { unitId: u.unitId, businessDate });
  if (!sync.ok) return sync;
  const bd = new Date(`${businessDate}T00:00:00.000Z`);
  const stays = await tenantDb(u).hotelReservation.findMany({
    where: { status: "CHECKED_IN", roomId: { not: null }, checkInDate: { lte: bd }, checkOutDate: { gt: bd } },
    select: { id: true, roomId: true, room: { select: { roomTypeId: true, hkStatus: true } } },
  });
  const typeIds = [...new Set(stays.map((s) => s.room?.roomTypeId).filter(isStr))];
  const st = typeIds.length ? await resolveSettingsMany({ tenantId: u.tenantId }, ["rooms.hotel.dailyHousekeeping"], typeIds.map((roomTypeId) => ({ unitId: u.unitId, roomTypeId }))) : [];
  const daily = new Map(typeIds.map((id, i) => [id, st[i]?.["rooms.hotel.dailyHousekeeping"]?.value !== false]));
  let changed = 0;
  const seen = new Set<string>();
  for (const s of stays) {
    if (!s.roomId || !s.room || seen.has(s.roomId)) continue;
    seen.add(s.roomId);
    if (!daily.get(s.room.roomTypeId)) continue;
    if (s.room.hkStatus !== "CLEAN" && s.room.hkStatus !== "INSPECTED") continue;
    const x = await transition({
      c: u,
      roomId: s.roomId,
      to: "DIRTY",
      role: "SYSTEM",
      byUserId: null,
      reservationId: s.id,
      expectFrom: ["CLEAN", "INSPECTED"],
      logNote: () => ({ note: `night audit ${businessDate}: ห้องค้างต่อ ทำความสะอาดประจำวัน` }),
    });
    if (x.ok && !x.replayed) changed++;
  }
  return { ok: true, changed, toOoo: sync.toOoo, toDirty: sync.toDirty };
}

