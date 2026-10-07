// device.ts — ทะเบียนเครื่องขาย POS (P1.10 · มติ R1–R3 + R7 · ledger/pos-briefs/pos-brief-P1.10.md)
// สัญญา = scripts/qc-pos-p1.10.mts (G1–G7 · V1–V2 · A1–A2 · D1) · โน้ต ledger/wo-notes/pos-P1.10.md
//
// 🔴 ผู้เขียนเดียวของตาราง PosDevice · ไม่ใช่ไฟล์ "use server" (action อยู่ที่ device-actions.ts)
// 🔴 ทุกฟังก์ชันที่รับ (ctx, actor) "คืน" คำปฏิเสธ {ok:false, code, message} ไม่ throw · ctx = RegisterCtx
//    ขอบเขตผิด (ร้าน/ระบบ POS/สาขา) = NOT_FOUND · เครื่องของสาขาอื่น/ร้านอื่น/id มั่ว = DEVICE_NOT_FOUND (ไม่บอกว่ามีอยู่)
// 🔴 ลงทะเบียน = "ตั้งชื่อให้รหัสเครื่องของเบราว์เซอร์นี้" (deviceCode = รหัส P1.9) ไม่ใช่ออกรหัสใหม่ ·
//    รหัสเดิมซ้ำ = แถวเดิม (ไม่เปลี่ยนชื่อ) · รหัสที่ถูกเพิกถอน = DEVICE_REVOKED (เพิกถอนแล้วกลับมาเองไม่ได้)
// 🔴 เครื่องที่ไม่ได้ลงทะเบียน "ขายต่อได้" (Q3) — การ์ดปฏิเสธเฉพาะรหัสที่ REVOKED ของสาขานั้น (posDeviceRevoked)
// 🔴 ไม่มี outbox/event (R8) · เปลี่ยนแปลงทะเบียน = AuditLog (pos.device.register/update/revoke)
import { Prisma, type PosDevice, type PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { prisma } from "./db";
import {
  parsePrinterConfig,
  POS_DEVICE_CODE_RE,
  POS_DEVICE_DEFAULT_LIMIT,
  POS_DEVICE_HEARTBEAT_THROTTLE_MS,
  POS_DEVICE_NAME_MAX,
  POS_DEVICE_ONLINE_MS,
  POS_PRINTER_DEFAULTS,
  POS_REG_NO_MAX,
  type HeartbeatResult,
  type ListDevicesResult,
  type PosDeviceListItem,
  type PosDeviceRefusal,
  type PosDeviceRefusalCode,
  type PosDeviceResult,
  type PosDeviceStatus,
  type PosDeviceView,
} from "./device-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Db = PrismaClient | Prisma.TransactionClient;

const MSG: Record<PosDeviceRefusalCode, string> = {
  NOT_FOUND: "ไม่พบสาขานี้ หรือบัญชีนี้เข้าสาขานี้ไม่ได้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์จัดการเครื่องขาย — ขอสิทธิ์จากเจ้าของร้าน",
  VALIDATION: "ข้อมูลเครื่องไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  DEVICE_REVOKED: "เครื่องนี้ถูกเพิกถอนแล้ว — ใช้ขายหรือเปิดกะไม่ได้ ติดต่อผู้จัดการ",
  DEVICE_LIMIT: "ลงทะเบียนเครื่องครบจำนวนที่แพ็กเกจให้แล้ว — เพิกถอนเครื่องที่ไม่ใช้ก่อน",
  DEVICE_NOT_FOUND: "ไม่พบเครื่องนี้ในสาขานี้",
  INTERNAL: "ระบบทะเบียนเครื่องขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: PosDeviceRefusalCode, message?: string, field?: string): PosDeviceRefusal =>
  field ? { ok: false, code, message: message ?? MSG[code], field } : { ok: false, code, message: message ?? MSG[code] };
const isRefusal = (v: unknown): v is PosDeviceRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));
const isUniqueViolation = (e: unknown): boolean => {
  const o = e as { code?: unknown; message?: unknown } | null;
  return o?.code === "P2002" || /\b23505\b|Unique constraint/i.test(String(o?.message ?? ""));
};

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | PosDeviceRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/device] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}

/** ธุรกรรม — client ที่เป็น tx อยู่แล้ว (ผู้เรียกส่ง tx มา) = ทำในtx นั้นเลย */
function runTx<T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return "$transaction" in db ? (db as PrismaClient).$transaction((tx) => fn(tx), { timeout: 20_000, maxWait: 10_000 }) : fn(db);
}

// ═══════════ ตัวตรวจ ═══════════
const charLen = (s: string) => [...s].length;
/** ชื่อเครื่อง 1–60 ตัวอักษร · ไม่มีตัวควบคุม */
function nameOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || charLen(t) > POS_DEVICE_NAME_MAX || /[\u0000-\u001F\u007F]/.test(t)) return null;
  return t;
}
/** เลขประจำเครื่อง POS: null/ว่าง = ล้าง · ข้อความ ≤ 40 ตัว ไม่มีตัวควบคุม · อื่น = false */
function regNoOf(v: unknown): string | null | false {
  if (v === null) return null;
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (!t) return null;
  if (charLen(t) > POS_REG_NO_MAX || /[\u0000-\u001F\u007F]/.test(t)) return false;
  return t;
}
export const isPosDeviceCode = (v: unknown): v is string => typeof v === "string" && POS_DEVICE_CODE_RE.test(v);

/** เพดานเครื่อง ACTIVE ต่อสาขา จาก `Tenant.limits.posDevices` (จำนวนเต็ม 1–1000) · ไม่ตั้ง/ค่าเพี้ยน = 3 (R2) — บริสุทธิ์ */
export function posDeviceLimit(tenant: { limits?: unknown } | null | undefined): number {
  const l = tenant && isRecord(tenant) ? tenant.limits : undefined;
  const v = isRecord(l) ? l.posDevices : undefined;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 1000 ? v : POS_DEVICE_DEFAULT_LIMIT;
}

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

// ═══════════ ขอบเขต + สิทธิ์ ═══════════
type Scope = { tenantId: string; systemId: string; unitId: string; actor: RegisterActor };

/**
 * ctx ผิดรูป / ระบบไม่ใช่ POS ที่เปิดใช้ของร้านนี้ / สาขาไม่ผูกระบบนี้ / สาขาเก็บถาวร / เข้าสาขาไม่ได้ = NOT_FOUND ·
 * actor ผิดรูป หรือไม่มีสิทธิ์ `action` ที่สาขานี้ = PERMISSION_DENIED
 */
async function scopeOf(db: Db, ctx: unknown, actorRaw: unknown, action: "pos.device.manage" | "pos.sale.create"): Promise<Scope | PosDeviceRefusal> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
  const { tenantId, systemId, unitId } = ctx as RegisterCtx;
  const actor = actorOf(actorRaw);
  if (!actor) return refuse("PERMISSION_DENIED");
  const [sys, link, unit] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { id: true } }),
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }),
  ]);
  if (!sys || !link || link.systemId !== systemId || !unit) return refuse("NOT_FOUND");
  if (!canAccessUnit(actor, unitId)) return refuse("NOT_FOUND");
  if (!evaluate(actor, { module: "pos", action, unitId })) return refuse("PERMISSION_DENIED");
  return { tenantId, systemId, unitId, actor };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/** แถว → มุมมอง (printerConfig ที่เก็บพัง = ค่าปริยาย ไม่โยน) */
export function posDeviceView(r: PosDevice): PosDeviceView {
  const pc = parsePrinterConfig(r.printerConfig ?? undefined);
  return {
    id: r.id,
    unitId: r.unitId,
    systemId: r.systemId,
    name: r.name,
    deviceCode: r.deviceCode,
    status: r.status as PosDeviceStatus,
    posRegNo: r.posRegNo,
    printerConfig: pc.ok ? pc.config : { ...POS_PRINTER_DEFAULTS },
    registeredByUserId: r.registeredByUserId,
    lastSeenAt: iso(r.lastSeenAt),
    revokedAt: iso(r.revokedAt),
    createdAt: r.createdAt.toISOString(),
  };
}

/** เครื่องของขอบเขตนี้ตาม id (ร้าน + ระบบ + สาขา) — อื่น = null (DEVICE_NOT_FOUND) */
async function deviceInScope(db: Db, s: Scope, id: unknown): Promise<PosDevice | null> {
  if (!isId(id)) return null;
  return db.posDevice.findFirst({ where: { id, tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId } });
}

// ═══════════ ตัวช่วยของการ์ด/heartbeat (ผู้เรียก: register.ts · shift.ts · held-cart.ts — ขอบเขตตรวจแล้วที่ผู้เรียก) ═══════════

/** รหัสนี้เป็นเครื่องที่ถูกเพิกถอนของสาขานี้หรือไม่ (R2 การ์ด) — ไม่ได้ลงทะเบียน/ACTIVE/รหัสผิดรูป = false */
export async function posDeviceRevoked(db: Db, tenantId: string, unitId: string, deviceCode: unknown): Promise<boolean> {
  if (!isPosDeviceCode(deviceCode)) return false;
  const r = await db.posDevice.findUnique({ where: { unitId_deviceCode: { unitId, deviceCode } }, select: { tenantId: true, status: true } });
  return !!r && r.tenantId === tenantId && r.status === "REVOKED";
}

/**
 * เขียน lastSeenAt ของเครื่อง ACTIVE (ไม่ถี่กว่า 30 วินาที — UPDATE … WHERE lastSeenAt เก่ากว่าเกณฑ์ ⇒ ยิงซ้อนกันเขียนครั้งเดียว) ·
 * ไม่ได้ลงทะเบียน = ไม่สร้างแถว · คืน { row, written }
 */
export async function touchPosDevice(db: Db, tenantId: string, unitId: string, deviceCode: string, now = new Date()): Promise<{ row: PosDevice | null; written: boolean }> {
  if (!isPosDeviceCode(deviceCode)) return { row: null, written: false };
  const row = await db.posDevice.findUnique({ where: { unitId_deviceCode: { unitId, deviceCode } } });
  if (!row || row.tenantId !== tenantId) return { row: null, written: false };
  if (row.status !== "ACTIVE") return { row, written: false };
  const cutoff = new Date(now.getTime() - POS_DEVICE_HEARTBEAT_THROTTLE_MS);
  const n = await db.posDevice.updateMany({
    where: { id: row.id, status: "ACTIVE", OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }] },
    data: { lastSeenAt: now },
  });
  return n.count === 1 ? { row: { ...row, lastSeenAt: now }, written: true } : { row, written: false };
}

// ═══════════ API ═══════════

/** ลงทะเบียนเครื่อง (R2) — รหัสเดิม ACTIVE = แถวเดิม (ไม่เปลี่ยนชื่อ) · REVOKED = DEVICE_REVOKED · เต็มเพดาน = DEVICE_LIMIT */
export async function registerDevice(ctx: RegisterCtx, actor: RegisterActor, input: { name: string; deviceCode: string }, client?: Db): Promise<PosDeviceResult> {
  return guard("registerDevice", async (): Promise<PosDeviceResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "pos.device.manage");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !onlyKeys(input, ["name", "deviceCode"])) return refuse("VALIDATION");
    const name = nameOf(input.name);
    if (!name) return refuse("VALIDATION", `ชื่อเครื่องต้องยาว 1–${POS_DEVICE_NAME_MAX} ตัวอักษร`, "name");
    if (!isPosDeviceCode(input.deviceCode)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง (A-Z a-z 0-9 _ - ยาว 8–64 ตัว)", "deviceCode");
    const deviceCode = input.deviceCode;

    const existing = (row: PosDevice | null): PosDeviceResult | null => {
      if (!row) return null;
      if (row.tenantId !== s.tenantId) return refuse("DEVICE_NOT_FOUND");
      return row.status === "REVOKED" ? refuse("DEVICE_REVOKED") : { ok: true, device: posDeviceView(row) };
    };
    const byCode = () => db.posDevice.findUnique({ where: { unitId_deviceCode: { unitId: s.unitId, deviceCode } } });
    const prior = existing(await byCode());
    if (prior) return prior;

    let created: { row: PosDevice; fresh: boolean } | PosDeviceRefusal;
    try {
      created = await runTx(db, async (tx) => {
        // คิวต่อสาขา: นับเพดาน + สร้าง ในล็อกเดียว (สองเครื่องลงพร้อมกันตอนเหลือที่เดียว = ได้เครื่องเดียว)
        await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext('pos-device:' || ${s.unitId}::text))) l`;
        const again = await tx.posDevice.findUnique({ where: { unitId_deviceCode: { unitId: s.unitId, deviceCode } } });
        if (again) return { row: again, fresh: false };
        const [tenant, active] = await Promise.all([
          tx.tenant.findUnique({ where: { id: s.tenantId }, select: { limits: true } }),
          tx.posDevice.count({ where: { tenantId: s.tenantId, unitId: s.unitId, status: "ACTIVE" } }),
        ]);
        const limit = posDeviceLimit(tenant);
        if (active >= limit) return refuse("DEVICE_LIMIT", `ลงทะเบียนเครื่องครบ ${limit} เครื่องต่อสาขาแล้ว — เพิกถอนเครื่องที่ไม่ใช้ก่อน`);
        const row = await tx.posDevice.create({
          data: { tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId, name, deviceCode, status: "ACTIVE", registeredByUserId: s.actor.userId },
        });
        return { row, fresh: true };
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // แพ้การแข่งลงรหัสเดียวกัน — แถวของผู้ชนะ
      return existing(await byCode()) ?? refuse("INTERNAL");
    }
    if (isRefusal(created)) return created;
    if (created.fresh) {
      await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.device.register", targetType: "PosDevice", targetId: created.row.id, after: { name, deviceCode, unitId: s.unitId } });
    }
    return existing(created.row) ?? refuse("INTERNAL");
  });
}

/** แก้ชื่อ / เลขประจำเครื่อง POS / ค่าตั้งเครื่องพิมพ์ (parse แล้วเก็บ) — เครื่องที่ถูกเพิกถอน = DEVICE_REVOKED */
export async function updateDevice(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: { id: string; name?: string; posRegNo?: string | null; printerConfig?: unknown },
  client?: Db,
): Promise<PosDeviceResult> {
  return guard("updateDevice", async (): Promise<PosDeviceResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "pos.device.manage");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !onlyKeys(input, ["id", "name", "posRegNo", "printerConfig"])) return refuse("VALIDATION");
    const row = await deviceInScope(db, s, input.id);
    if (!row) return refuse("DEVICE_NOT_FOUND");
    const data: Prisma.PosDeviceUpdateInput = {};
    if (input.name !== undefined) {
      const name = nameOf(input.name);
      if (!name) return refuse("VALIDATION", `ชื่อเครื่องต้องยาว 1–${POS_DEVICE_NAME_MAX} ตัวอักษร`, "name");
      data.name = name;
    }
    if (input.posRegNo !== undefined) {
      const reg = regNoOf(input.posRegNo);
      if (reg === false) return refuse("VALIDATION", `เลขประจำเครื่อง POS ยาวได้ไม่เกิน ${POS_REG_NO_MAX} ตัวอักษร`, "posRegNo");
      data.posRegNo = reg;
    }
    if (input.printerConfig !== undefined) {
      const pc = parsePrinterConfig(input.printerConfig);
      if (!pc.ok) return refuse("VALIDATION", pc.message, pc.field ?? "printerConfig");
      data.printerConfig = pc.config as unknown as Prisma.InputJsonValue;
    }
    if (row.status === "REVOKED") return refuse("DEVICE_REVOKED");
    if (Object.keys(data).length === 0) return { ok: true, device: posDeviceView(row) };
    const n = await db.posDevice.updateMany({ where: { id: row.id, tenantId: s.tenantId, unitId: s.unitId, status: "ACTIVE" }, data: data as Prisma.PosDeviceUpdateManyMutationInput });
    if (n.count !== 1) return refuse("DEVICE_REVOKED"); // ถูกเพิกถอนระหว่างทาง
    const after = await db.posDevice.findUnique({ where: { id: row.id } });
    if (!after) return refuse("DEVICE_NOT_FOUND");
    await writeAudit({
      tenantId: s.tenantId,
      actorId: s.actor.userId,
      action: "pos.device.update",
      targetType: "PosDevice",
      targetId: row.id,
      before: { name: row.name, posRegNo: row.posRegNo, printerConfig: row.printerConfig },
      after: { name: after.name, posRegNo: after.posRegNo, printerConfig: after.printerConfig },
    });
    return { ok: true, device: posDeviceView(after) };
  });
}

/** เพิกถอนเครื่อง — REVOKED + revokedAt · กะ OPEN ของเครื่องนี้ไม่ถูกแตะ (ผู้จัดการปิดเองที่หน้ากะ) · ซ้ำ = ok แถวเดิม */
export async function revokeDevice(ctx: RegisterCtx, actor: RegisterActor, input: { id: string }, client?: Db): Promise<PosDeviceResult> {
  return guard("revokeDevice", async (): Promise<PosDeviceResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "pos.device.manage");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !onlyKeys(input, ["id"])) return refuse("VALIDATION");
    const row = await deviceInScope(db, s, input.id);
    if (!row) return refuse("DEVICE_NOT_FOUND");
    if (row.status === "REVOKED") return { ok: true, device: posDeviceView(row) };
    const now = new Date();
    const n = await db.posDevice.updateMany({ where: { id: row.id, tenantId: s.tenantId, unitId: s.unitId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: now } });
    const after = await db.posDevice.findUnique({ where: { id: row.id } });
    if (!after) return refuse("DEVICE_NOT_FOUND");
    if (n.count === 1) {
      await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.device.revoke", targetType: "PosDevice", targetId: row.id, before: { status: "ACTIVE" }, after: { status: "REVOKED", deviceCode: row.deviceCode } });
    }
    return { ok: true, device: posDeviceView(after) };
  });
}

/** เครื่องของสาขา ctx (ทุกสถานะ · เก่าก่อน) + online (เห็นภายใน 120 วิ) + กะ OPEN ของเครื่อง + เพดาน */
export async function listDevices(ctx: RegisterCtx, actor: RegisterActor, client?: Db): Promise<ListDevicesResult> {
  return guard("listDevices", async (): Promise<ListDevicesResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "pos.device.manage");
    if (isRefusal(s)) return s;
    const [rows, tenant] = await Promise.all([
      db.posDevice.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 500 }),
      db.tenant.findUnique({ where: { id: s.tenantId }, select: { limits: true } }),
    ]);
    const codes = rows.map((r) => r.deviceCode);
    const shifts = codes.length
      ? await db.posShift.findMany({
          where: { tenantId: s.tenantId, unitId: s.unitId, status: "OPEN", deviceId: { in: codes } },
          orderBy: { openedAt: "desc" },
          select: { id: true, deviceId: true, shiftNo: true, openedAt: true },
        })
      : [];
    const shiftOf = new Map<string, { id: string; shiftNo: number; openedAt: string }>();
    for (const sh of shifts) if (!shiftOf.has(sh.deviceId)) shiftOf.set(sh.deviceId, { id: sh.id, shiftNo: sh.shiftNo, openedAt: sh.openedAt.toISOString() });
    const now = Date.now();
    const items: PosDeviceListItem[] = rows.map((r) => ({
      ...posDeviceView(r),
      online: r.status === "ACTIVE" && !!r.lastSeenAt && now - r.lastSeenAt.getTime() <= POS_DEVICE_ONLINE_MS,
      openShift: shiftOf.get(r.deviceCode) ?? null,
    }));
    return { ok: true, items, limit: posDeviceLimit(tenant), activeCount: rows.filter((r) => r.status === "ACTIVE").length };
  });
}

/**
 * heartbeat ของหน้าขาย (สิทธิ์ pos.sale.create) — เครื่อง ACTIVE: เขียน lastSeenAt (throttle 30 วิ) ·
 * ไม่ได้ลงทะเบียน = ok registered:false (ไม่สร้างแถว) · ถูกเพิกถอน = DEVICE_REVOKED · คืนแถว (หน้าขายใช้ printerConfig)
 */
export async function heartbeat(ctx: RegisterCtx, actor: RegisterActor, input: { deviceCode: string }, client?: Db): Promise<HeartbeatResult> {
  return guard("heartbeat", async (): Promise<HeartbeatResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "pos.sale.create");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !onlyKeys(input, ["deviceCode"])) return refuse("VALIDATION");
    if (!isPosDeviceCode(input.deviceCode)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง", "deviceCode");
    const t = await touchPosDevice(db, s.tenantId, s.unitId, input.deviceCode);
    if (!t.row) return { ok: true, registered: false, written: false, device: null };
    if (t.row.status === "REVOKED") return refuse("DEVICE_REVOKED");
    return { ok: true, registered: true, written: t.written, device: posDeviceView(t.row) };
  });
}
