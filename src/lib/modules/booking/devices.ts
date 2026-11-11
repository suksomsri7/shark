// SVC B.6 — อุปกรณ์หน้าร้านของโหมดแถวเดียว (จอทีวี · ตู้รับบัตร) = แถว QueueDisplay ของหน่วย BOOKING
// สัญญา: ledger/svc-briefs/svc-brief-b.6.md §3.1 · มติผู้คุม Q1–Q6
//
// 🔴 token ดิบ = randomBytes(32) base64url (43 ตัว · 256 บิต) คืน "ครั้งเดียว" ตอนสร้าง/เปลี่ยน — ไม่เก็บ ไม่ log ·
//    ฐานเก็บ displayToken = "sha256:" + sha256hex(token) · settings เก็บแค่ { kind } (นโยบายรายเครื่อง = ทะเบียนค่าตั้งชั้น DEVICE)
// 🔴 ขอบเขต (X1): ทุกคิวรีผูก tenantId + unitId ของ ctx (tenantDb) · ของร้าน/สาขาอื่น = NOT_FOUND
// 🔴 deviceByToken: token ใช้ไม่ได้ทุกกรณี (รูปผิด · ไม่พบ · ถอนแล้ว · ผิดชนิด · หน่วยไม่ใช่ BOOKING แถวเดียว) ⇒ null เหมือนกัน (X7)
// 🔴 audit ไม่มี token/hash (after = { kind, name })
import { createHash, randomBytes } from "node:crypto";
import { prisma, tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { lineSettingsOf } from "./planner-run";

export type DeviceKind = "TV" | "KIOSK";
export type BookingDevice = { id: string; unitId: string; kind: DeviceKind; name: string; createdAt: Date };
export type DeviceCtx = { tenantId: string; unitId: string; actorUserId?: string };
export type DeviceFail = "NOT_FOUND" | "NOT_SINGLE_LINE" | "BAD_INPUT" | "DUPLICATE";

const R = {
  NOT_FOUND: "ไม่พบอุปกรณ์นี้ในสาขานี้",
  UNIT_NOT_FOUND: "ไม่พบสาขานี้",
  NOT_SINGLE_LINE: "เปิดโหมดคิวแถวเดียวของสาขาก่อน จึงเพิ่มจอทีวีหรือตู้รับบัตรได้",
  BAD_KIND: "กรุณาเลือกชนิดอุปกรณ์ (จอทีวี หรือ ตู้รับบัตร)",
  BAD_NAME: "กรุณาตั้งชื่ออุปกรณ์ (ไม่เกิน 60 ตัวอักษร)",
  DUPLICATE: "มีอุปกรณ์ชื่อนี้ในสาขาแล้ว (รวมเครื่องที่ถอนไปแล้ว) — ตั้งชื่ออื่น",
} as const;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const NAME_MAX = 60;

const okCtx = (ctx: DeviceCtx | null | undefined): ctx is DeviceCtx =>
  !!ctx && typeof ctx.tenantId === "string" && !!ctx.tenantId && typeof ctx.unitId === "string" && !!ctx.unitId;
const fail = <C extends string>(code: C, reason: string) => ({ ok: false as const, code, reason });
const newToken = () => randomBytes(32).toString("base64url");
const storedOf = (token: string) => `sha256:${createHash("sha256").update(token).digest("hex")}`;

/** settings.kind ของแถว QueueDisplay (ไม่ใช่อุปกรณ์ B.6 ⇒ null) */
export function deviceKindOf(settings: unknown): DeviceKind | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const k = (settings as { kind?: unknown }).kind;
  return k === "TV" || k === "KIOSK" ? k : null;
}

/** หน่วยของ ctx เป็น BOOKING ที่เปิดโหมดแถวเดียว */
export async function isSingleLineUnit(ctx: DeviceCtx): Promise<boolean> {
  if (!okCtx(ctx)) return false;
  return (await lineSettingsOf(ctx.tenantId, ctx.unitId)) !== null;
}

type Row = { id: string; unitId: string; name: string; settings: unknown; createdAt: Date };
const toDevice = (r: Row): BookingDevice | null => {
  const kind = deviceKindOf(r.settings);
  return kind ? { id: r.id, unitId: r.unitId, kind, name: r.name, createdAt: r.createdAt } : null;
};

export async function createDevice(
  ctx: DeviceCtx,
  i: { kind: DeviceKind; name: string },
): Promise<{ ok: true; device: BookingDevice; token: string } | { ok: false; code: DeviceFail; reason: string }> {
  if (!okCtx(ctx)) return fail("NOT_FOUND", R.UNIT_NOT_FOUND);
  const unit = await prisma.businessUnit.findFirst({ where: { id: ctx.unitId, tenantId: ctx.tenantId, type: "BOOKING" }, select: { id: true } });
  if (!unit) return fail("NOT_FOUND", R.UNIT_NOT_FOUND);
  if (!(await isSingleLineUnit(ctx))) return fail("NOT_SINGLE_LINE", R.NOT_SINGLE_LINE);
  const kind = i?.kind;
  if (kind !== "TV" && kind !== "KIOSK") return fail("BAD_INPUT", R.BAD_KIND);
  const name = typeof i?.name === "string" ? i.name.trim() : "";
  if (!name || name.length > NAME_MAX) return fail("BAD_INPUT", R.BAD_NAME);
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  // @@unique([unitId, name]) นับแถวที่ถอนแล้วด้วย
  if (await db.queueDisplay.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, name }, select: { id: true } })) return fail("DUPLICATE", R.DUPLICATE);
  const token = newToken();
  let row: Row;
  try {
    row = await db.queueDisplay.create({
      data: { tenantId: ctx.tenantId, unitId: ctx.unitId, name, displayToken: storedOf(token), settings: { kind } },
      select: { id: true, unitId: true, name: true, settings: true, createdAt: true },
    });
  } catch (e) {
    if ((e as { code?: unknown })?.code === "P2002") return fail("DUPLICATE", R.DUPLICATE);
    throw e;
  }
  await writeAudit({
    tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? null, action: "booking.device.created",
    targetType: "QueueDisplay", targetId: row.id, after: { kind, name },
  });
  return { ok: true, device: { id: row.id, unitId: row.unitId, kind, name: row.name, createdAt: row.createdAt }, token };
}

/** อุปกรณ์ที่ยังไม่ถอนของหน่วย (เฉพาะแถวที่มี settings.kind) · เรียง createdAt, id */
export async function listDevices(ctx: DeviceCtx): Promise<BookingDevice[]> {
  if (!okCtx(ctx)) return [];
  const rows = await tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).queueDisplay.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, revokedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, unitId: true, name: true, settings: true, createdAt: true },
  });
  return rows.map(toDevice).filter((d): d is BookingDevice => d !== null);
}

/** อุปกรณ์ที่ใช้อยู่ของ ctx (มี kind · ยังไม่ถอน) */
async function activeDevice(ctx: DeviceCtx, deviceId: unknown): Promise<(BookingDevice & { displayToken: string }) | null> {
  if (!okCtx(ctx) || typeof deviceId !== "string" || !deviceId) return null;
  const r = await tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).queueDisplay.findFirst({
    where: { id: deviceId, tenantId: ctx.tenantId, unitId: ctx.unitId, revokedAt: null },
    select: { id: true, unitId: true, name: true, settings: true, createdAt: true, displayToken: true },
  });
  const d = r ? toDevice(r) : null;
  return d && r ? { ...d, displayToken: r.displayToken } : null;
}

export async function rotateDeviceToken(ctx: DeviceCtx, deviceId: string): Promise<{ ok: true; token: string } | { ok: false; code: "NOT_FOUND"; reason: string }> {
  const d = await activeDevice(ctx, deviceId);
  if (!d) return fail("NOT_FOUND", R.NOT_FOUND);
  const token = newToken();
  // CAS: แถวยังไม่ถอน และ token ที่เก็บยังเป็นตัวที่อ่าน
  const w = await tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).queueDisplay.updateMany({
    where: { id: d.id, tenantId: ctx.tenantId, unitId: ctx.unitId, revokedAt: null, displayToken: d.displayToken },
    data: { displayToken: storedOf(token) },
  });
  if (w.count !== 1) return fail("NOT_FOUND", R.NOT_FOUND);
  await writeAudit({
    tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? null, action: "booking.device.rotated",
    targetType: "QueueDisplay", targetId: d.id, after: { kind: d.kind, name: d.name },
  });
  return { ok: true, token };
}

/** ถอน = revokedAt = now (ค่าตั้งชั้น DEVICE คงไว้) */
export async function revokeDevice(ctx: DeviceCtx, deviceId: string): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND"; reason: string }> {
  const d = await activeDevice(ctx, deviceId);
  if (!d) return fail("NOT_FOUND", R.NOT_FOUND);
  const w = await tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).queueDisplay.updateMany({
    where: { id: d.id, tenantId: ctx.tenantId, unitId: ctx.unitId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (w.count !== 1) return fail("NOT_FOUND", R.NOT_FOUND);
  await writeAudit({
    tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? null, action: "booking.device.revoked",
    targetType: "QueueDisplay", targetId: d.id, after: { kind: d.kind, name: d.name },
  });
  return { ok: true };
}

/** token ดิบ → อุปกรณ์ · ใช้ไม่ได้ทุกกรณี ⇒ null (รูปผิด ⇒ null ก่อนแตะฐาน) */
export async function deviceByToken(token: unknown, kind: DeviceKind): Promise<{ tenantId: string; unitId: string; deviceId: string; name: string } | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  if (kind !== "TV" && kind !== "KIOSK") return null;
  const r = await prisma.queueDisplay.findUnique({
    where: { displayToken: storedOf(token) },
    select: { id: true, tenantId: true, unitId: true, name: true, settings: true, revokedAt: true },
  });
  if (!r || r.revokedAt || deviceKindOf(r.settings) !== kind) return null;
  if ((await lineSettingsOf(r.tenantId, r.unitId)) === null) return null;
  return { tenantId: r.tenantId, unitId: r.unitId, deviceId: r.id, name: r.name };
}
