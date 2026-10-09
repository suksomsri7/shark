// staff-pin.ts — PIN พนักงานต่อสาขา · โทเคนผู้ขายบนเครื่อง · รายชื่อพนักงานของจอล็อก (POS P1.15 · R1 R2 R8 · CD1 CD2)
// สัญญา = scripts/qc-pos-p1.15.mts (PN0–PN8 · TK1–TK5) · brief ledger/pos-briefs/pos-brief-P1.15.md · ตารางชื่อ ledger/wo-notes/pos-P1.15-oracle.md
//
// 🔴 ผู้เขียนตาราง PosStaffPin ที่เดียว · ไม่ใช่ไฟล์ "use server" (action อยู่ที่ staff-pin-actions.ts)
// 🔴 ไม่เก็บ PIN ดิบ: pinHash = "<salt 16 ไบต์ hex>:<scrypt(pin, salt) hex>" (พารามิเตอร์ปริยายของ node) · ไม่มีการสุ่มด้วย Math
//    ทางรับคำขอใช้ scrypt แบบ async เท่านั้น (fix รอบ 1 F6 — ไม่บล็อก event loop) · ตัวแบบ sync มีไว้ให้สคริปต์เท่านั้น
// 🔴 log ขัดข้องพิมพ์แค่ชื่อ/รหัสของ error (ไม่พิมพ์อาร์กิวเมนต์ที่อาจมี pinHash/salt)
// 🔴 PIN ซ้ำในสาขาเดียวกันไม่ได้ (PIN_TAKEN) ⇒ ใส่ PIN แบบไม่ระบุคนจับได้ไม่เกิน 1 แถว · คำปฏิเสธไม่บอกว่าเป็นของใคร
// 🔴 ผิดติดกัน 5 ครั้ง (นับเฉพาะเมื่อระบุ userId — มติผู้คุมงาน 1) ⇒ lockedUntil = ตอนนี้ + 15 นาที · ผู้จัดการปลดได้ (unlockStaffPin)
//    ไม่ระบุคน = จับทุกแถวของสาขาและไม่นับให้ใคร (ด่านกันเดาแบบต่อเครื่อง = งานตามหลัง)
// 🔴 โทเคนผู้ขาย = HMAC-SHA256 ไร้สถานะ (CD2): body = base64url({u, e, v}) · ลายเซ็นครอบ (ร้าน · สาขา · เครื่อง · body) ด้วย SESSION_SECRET ·
//    อายุ 12 ชม. · v = รุ่นของ PIN (แฮชของ pinHash — เปลี่ยนเฉพาะตอนตั้ง PIN ใหม่ ⇒ โทเคนเก่าตาย) ·
//    คนในโทเคนต้องยังมี pos.sale.create ที่สาขานั้น ณ ตอนใช้ · เครื่องถูกเพิกถอน = โทเคนตาย
//    (ไม่ใช้ updatedAt ของแถวเป็นรุ่น: ตัวนับผิด/ปลดล็อกก็ขยับ updatedAt ⇒ คนอื่นกด PIN ผิดแล้วพนักงานที่ใช้งานอยู่หลุด)
// 🔴 คำปฏิเสธ "คืน" {ok:false, code, message ไทย} — ไม่ throw (ขัดข้องที่ไม่คาดคิด = INTERNAL)
import { createHash, createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { prisma } from "./db";
import { isPosDeviceCode, posDeviceRevoked } from "./device";
import {
  STAFF_PIN_DEVICE_THROTTLE_AFTER,
  STAFF_PIN_DEVICE_THROTTLE_MS,
  STAFF_PIN_LOCK_AFTER,
  STAFF_PIN_LOCK_MS,
  STAFF_PIN_RE,
  STAFF_TOKEN_TTL_MS,
  type ListStaffForDeviceResult,
  type RegisterActor,
  type RegisterRefusal,
  type RegisterRefusalCode,
  type RegisterRole,
  type StaffListItem,
  type StaffPinOk,
  type VerifyStaffPinOk,
} from "./register-shared";

type Db = PrismaClient;
/** ขอบเขตของคำขอ (ctx ของหน้าขาย — deviceId ไม่บังคับ) */
export type StaffPinCtx = { tenantId: string; systemId: string; unitId: string; deviceId?: string };
type UnitScope = { tenantId: string; systemId: string; unitId: string };

const WEAK_PINS: ReadonlySet<string> = new Set(["0000", "1234", "1111", "123456", "000000"]);
const HASH_BYTES = 32;
const TOKEN_MAX = 1_000;
const STAFF_PERMISSION = "pos.sale.create";
const MANAGE_PERMISSION = "pos.staff.manage";

const MSG: Partial<Record<RegisterRefusalCode, string>> = {
  NOT_FOUND: "ไม่พบสาขานี้ หรือพนักงานคนนี้ขายที่สาขานี้ไม่ได้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์จัดการ PIN ของพนักงานคนอื่น — ให้ผู้จัดการทำรายการ",
  VALIDATION: "PIN ต้องเป็นตัวเลข 4–6 หลัก",
  WEAK_PIN: "PIN นี้เดาง่ายเกินไป — เลือก PIN อื่น",
  PIN_TAKEN: "PIN นี้มีคนในสาขาใช้อยู่แล้ว — เลือก PIN อื่น",
  PIN_INVALID: "PIN ไม่ถูกต้อง",
  PIN_LOCKED: "PIN นี้ถูกล็อกชั่วคราวเพราะใส่ผิดหลายครั้ง — ให้ผู้จัดการปลดล็อก หรือรอ 15 นาที",
  PIN_THROTTLED: "ลองผิดหลายครั้ง — รอ 15 นาทีแล้วลองใหม่", // POS P1.18 ▸ K1 ◂
  DEVICE_REVOKED: "เครื่องนี้ถูกเพิกถอนแล้ว — ใช้งานไม่ได้ ติดต่อผู้จัดการ",
  INTERNAL: "ระบบ PIN ขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: RegisterRefusalCode, message?: string): RegisterRefusal => ({ ok: false, code, message: message ?? MSG[code] ?? "ทำรายการไม่ได้" });
const isRefusal = (v: unknown): v is RegisterRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | RegisterRefusal> {
  try {
    return await body();
  } catch (e) {
    logSafe(name, e);
    return refuse("INTERNAL");
  }
}

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}
const canSellAt = (a: RegisterActor, unitId: string) => canAccessUnit(a, unitId) && evaluate(a, { module: "pos", action: STAFF_PERMISSION, unitId });

/** ขอบเขต: ระบบ POS ที่เปิดใช้ของร้านนี้ · สาขาผูกระบบนี้ · สาขาไม่เก็บถาวร — อื่น = NOT_FOUND */
async function unitScope(db: Db, ctx: unknown): Promise<UnitScope | RegisterRefusal> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
  const { tenantId, systemId, unitId } = ctx as UnitScope;
  const [sys, link, unit] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { id: true } }),
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }),
  ]);
  if (!sys || !link || link.systemId !== systemId || !unit) return refuse("NOT_FOUND");
  return { tenantId, systemId, unitId };
}

// ═══════════ สมาชิกของร้าน → ผู้กระทำ (RegisterActor) ═══════════
type MemberRow = { userId: string; role: string; unitAccess: unknown; permissions: unknown };
function memberToActor(m: MemberRow): RegisterActor | null {
  const unitAccess = Array.isArray(m.unitAccess) ? m.unitAccess.filter((x): x is string => typeof x === "string") : [];
  const permissions = isRecord(m.permissions) ? m.permissions : {};
  return actorOf({ userId: m.userId, role: m.role, unitAccess, permissions });
}
/**
 * สิทธิ์ปัจจุบันของผู้ใช้ในร้าน (membership ที่ตอบรับแล้วเท่านั้น — แบบ core/context) · ไม่ใช่สมาชิก = null
 * ใช้กับคนในโทเคน / ผู้จัดการที่ใส่ PIN (สิทธิ์อ่านสดจาก DB ทุกครั้ง ไม่เชื่อค่าจากคำขอ)
 */
export async function posMemberActor(tenantId: string, userId: string, client?: Db): Promise<RegisterActor | null> {
  if (!isId(tenantId) || !isId(userId)) return null;
  const db = client ?? prisma;
  const m = await db.membership.findFirst({ where: { tenantId, userId, acceptedAt: { not: null } }, select: { userId: true, role: true, unitAccess: true, permissions: true } });
  return m ? memberToActor(m) : null;
}

// ═══════════ hash ═══════════
const scryptAsync = promisify(scrypt) as (pin: string, salt: Buffer, len: number) => Promise<Buffer>;
async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await scryptAsync(pin, salt, HASH_BYTES)).toString("hex")}`;
}
async function pinMatches(pin: string, stored: string): Promise<boolean> {
  const m = /^([0-9a-f]{32}):([0-9a-f]{32,256})$/.exec(stored);
  if (!m || m[2]!.length % 2) return false;
  const want = Buffer.from(m[2]!, "hex");
  const got = await scryptAsync(pin, Buffer.from(m[1]!, "hex"), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}
/**
 * แบบ sync สำหรับสคริปต์ (seed/ซ่อมข้อมูล) เท่านั้น — ห้ามเรียกจากทางรับคำขอ (fix รอบ 1 F6) · รูปแบบเดียวกับ hashPin
 */
export function hashStaffPinForScript(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pin, salt, HASH_BYTES).toString("hex")}`;
}
/** log ขัดข้องแบบไม่มีข้อมูลลับ: ชื่อ + รหัสของ error เท่านั้น */
function logSafe(where: string, e: unknown): void {
  const o = (e ?? {}) as { name?: unknown; code?: unknown };
  console.error(`[pos/staff-pin] ${where} INTERNAL ${typeof o.name === "string" ? o.name : "Error"}${typeof o.code === "string" ? ` ${o.code}` : ""}`);
}
/** รุ่นของ PIN ในโทเคน — เปลี่ยนทุกครั้งที่ตั้ง PIN ใหม่ (salt ใหม่) · ไม่เปิดเผย hash */
const pinVersionOf = (pinHash: string) => createHash("sha256").update(`pos-staff-pin-version:${pinHash}`).digest("base64url").slice(0, 16);

// ═══════════ ตั้ง PIN (R1) ═══════════
/**
 * ตั้ง/เปลี่ยน PIN — ตัวเอง (ต้องมี pos.sale.create ที่สาขานี้) หรือผู้ที่มี pos.staff.manage (OWNER/MANAGER) ตั้งให้คนในสาขา ·
 * ผู้ถูกตั้งต้องขายที่สาขานี้ได้ · ตั้งซ้ำ = แทนแถวเดิม (salt ใหม่ · ล้างตัวนับ/ล็อก ⇒ โทเคนเก่าของคนนั้นตาย)
 */
export async function setStaffPin(ctx: StaffPinCtx, actor: RegisterActor, input: { userId: string; pin: string }, client?: Db): Promise<StaffPinOk | RegisterRefusal> {
  return guard("setStaffPin", async (): Promise<StaffPinOk | RegisterRefusal> => {
    const db = client ?? prisma;
    const s = await unitScope(db, ctx);
    if (isRefusal(s)) return s;
    const a = actorOf(actor);
    if (!a) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !isId(input.userId)) return refuse("VALIDATION", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
    const userId = input.userId;
    const self = userId === a.userId;
    const allowed = self ? canSellAt(a, s.unitId) : canAccessUnit(a, s.unitId) && evaluate(a, { module: "pos", action: MANAGE_PERMISSION, unitId: s.unitId });
    if (!allowed) return refuse("PERMISSION_DENIED", self ? "บัญชีนี้ยังขายที่สาขานี้ไม่ได้ — ตั้ง PIN ไม่ได้" : undefined);
    const pin = input.pin;
    if (typeof pin !== "string" || !STAFF_PIN_RE.test(pin)) return refuse("VALIDATION");
    if (WEAK_PINS.has(pin)) return refuse("WEAK_PIN");
    const target = self ? a : await posMemberActor(s.tenantId, userId, db);
    if (!target || !canSellAt(target, s.unitId)) return refuse("NOT_FOUND", "พนักงานคนนี้ยังขายที่สาขานี้ไม่ได้ — ให้สิทธิ์ขายก่อนตั้ง PIN");
    // CD1 + R2: PIN ซ้ำในสาขาเดียวกันไม่ได้ (เทียบกับทุกแถวของสาขายกเว้นแถวของคนนี้เอง) — ข้อความไม่บอกว่าเป็นของใคร
    // POS P1.18 ▸ K2 (มติ 1 · ทางสำรอง): คงความไม่ซ้ำต่อสาขา (จอ PIN แบบไม่ระบุคนต้องจับได้ไม่เกิน 1 แถว) แต่ปฏิเสธด้วย
    //   {code, message} เดียวกับ PIN อ่อนทุกตัวอักษร ⇒ แยกไม่ออกว่ามีคนใช้ PIN นี้อยู่ (ไม่คืน PIN_TAKEN แล้ว) ◂
    const others = await db.posStaffPin.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, userId: { not: userId } }, select: { pinHash: true } });
    for (const r of others) if (await pinMatches(pin, r.pinHash)) return refuse("WEAK_PIN");
    const pinHash = await hashPin(pin);
    const row = await db.posStaffPin.upsert({
      where: { unitId_userId: { unitId: s.unitId, userId } },
      create: { tenantId: s.tenantId, unitId: s.unitId, userId, pinHash, failedCount: 0, lockedUntil: null, setById: a.userId },
      update: { pinHash, failedCount: 0, lockedUntil: null, setById: a.userId },
      select: { id: true, tenantId: true },
    });
    if (row.tenantId !== s.tenantId) return refuse("NOT_FOUND"); // สาขาเป็นของร้านนี้แล้วจาก unitScope — กันไว้อีกชั้น
    await writeAudit({ tenantId: s.tenantId, actorId: a.userId, action: "pos.staff.pin_set", targetType: "PosStaffPin", targetId: row.id, after: { userId, unitId: s.unitId, self } });
    return { ok: true };
  });
}

/**
 * POS P1.15U ▸ fix รอบ 1 F1: ตั้ง PIN "ของตัวเอง" ครั้งแรกจากจอล็อก — ผู้ถูกตั้ง = actor เสมอ (ไม่รับ userId) ·
 * มี PIN อยู่แล้ว = ALREADY_SET (เปลี่ยน PIN = ตั้งค่า → พนักงาน) · ที่เหลือกติกาเดียวกับ setStaffPin ◂
 */
export async function setOwnStaffPin(ctx: StaffPinCtx, actor: RegisterActor, input: { pin: string }, client?: Db): Promise<StaffPinOk | RegisterRefusal> {
  return guard("setOwnStaffPin", async (): Promise<StaffPinOk | RegisterRefusal> => {
    const db = client ?? prisma;
    const s = await unitScope(db, ctx);
    if (isRefusal(s)) return s;
    const a = actorOf(actor);
    if (!a) return refuse("PERMISSION_DENIED");
    const has = await db.posStaffPin.findUnique({ where: { unitId_userId: { unitId: s.unitId, userId: a.userId } }, select: { tenantId: true } });
    if (has && has.tenantId === s.tenantId) return refuse("ALREADY_SET", "ตั้ง PIN ไว้แล้ว — เปลี่ยน PIN ได้ที่ ตั้งค่า → พนักงาน");
    return setStaffPin(ctx, a, { userId: a.userId, pin: isRecord(input) && typeof input.pin === "string" ? input.pin : "" }, db);
  });
}

// ═══════════ จับ PIN (แกนร่วมของ verifyStaffPin · PIN ผู้จัดการ) ═══════════
type Matched = { ok: true; rowId: string; pinHash: string; actor: RegisterActor };

/** ผิด 1 ครั้งบนแถวนี้ (อะตอมมิกแบบมองโลกในแง่ดี) — ครบ 5 = ล็อก 15 นาที · ล็อกที่หมดเวลาแล้วเริ่มนับใหม่ */
async function countFailure(db: Db, rowId: string, now: Date): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const cur = await db.posStaffPin.findUnique({ where: { id: rowId }, select: { failedCount: true, lockedUntil: true } });
    if (!cur) return;
    const expired = !!cur.lockedUntil && cur.lockedUntil.getTime() <= now.getTime();
    if (cur.lockedUntil && !expired) return; // ล็อกอยู่แล้ว
    const next = (expired ? 0 : cur.failedCount) + 1;
    const n = await db.posStaffPin.updateMany({
      where: { id: rowId, failedCount: cur.failedCount, lockedUntil: cur.lockedUntil },
      data: { failedCount: next, lockedUntil: next >= STAFF_PIN_LOCK_AFTER ? new Date(now.getTime() + STAFF_PIN_LOCK_MS) : null },
    });
    if (n.count === 1) return;
  }
}
async function clearFailures(db: Db, row: { id: string; failedCount: number; lockedUntil: Date | null }): Promise<void> {
  if (row.failedCount !== 0 || row.lockedUntil !== null) await db.posStaffPin.updateMany({ where: { id: row.id }, data: { failedCount: 0, lockedUntil: null } });
}

/**
 * จับ PIN ในสาขา (มติผู้คุมงาน 1): ระบุ userId = ตรวจแถวนั้นแถวเดียว ผิดนับบนแถวนั้น · ไม่ระบุ = จับทุกแถวที่เจ้าของยังขายที่สาขานี้ได้ ไม่นับให้ใคร ·
 * ล็อกอยู่ = PIN_LOCKED (PIN ถูกก็ไม่ผ่าน) · เจ้าของไม่มีสิทธิ์ขายแล้ว = PIN_INVALID
 */
export async function matchStaffPin(scope: { tenantId: string; unitId: string }, pin: unknown, userId?: string | null, client?: Db): Promise<Matched | RegisterRefusal> {
  const db = client ?? prisma;
  if (typeof pin !== "string" || !STAFF_PIN_RE.test(pin)) return refuse("PIN_INVALID");
  const now = new Date();
  const locked = (r: { lockedUntil: Date | null }) => !!r.lockedUntil && r.lockedUntil.getTime() > now.getTime();
  if (userId !== undefined && userId !== null) {
    if (!isId(userId)) return refuse("PIN_INVALID");
    const row = await db.posStaffPin.findUnique({ where: { unitId_userId: { unitId: scope.unitId, userId } } });
    if (!row || row.tenantId !== scope.tenantId) return refuse("PIN_INVALID");
    const actor = await posMemberActor(scope.tenantId, userId, db);
    if (!actor || !canSellAt(actor, scope.unitId)) return refuse("PIN_INVALID");
    if (locked(row)) return refuse("PIN_LOCKED");
    if (!(await pinMatches(pin, row.pinHash))) {
      await countFailure(db, row.id, now);
      return refuse("PIN_INVALID");
    }
    await clearFailures(db, row);
    return { ok: true, rowId: row.id, pinHash: row.pinHash, actor };
  }
  const rows = await db.posStaffPin.findMany({ where: { tenantId: scope.tenantId, unitId: scope.unitId }, orderBy: { createdAt: "asc" } });
  for (const row of rows) {
    if (!(await pinMatches(pin, row.pinHash))) continue;
    const actor = await posMemberActor(scope.tenantId, row.userId, db);
    if (!actor || !canSellAt(actor, scope.unitId)) continue;
    // fix รอบ 1 F3: ไม่ระบุคน + แถวที่ล็อกอยู่ = PIN_INVALID (ไม่บอกว่า PIN นี้มีเจ้าของที่ถูกล็อก)
    if (locked(row)) return refuse("PIN_INVALID");
    await clearFailures(db, row);
    return { ok: true, rowId: row.id, pinHash: row.pinHash, actor };
  }
  return refuse("PIN_INVALID");
}

// ═══════════ โทเคนผู้ขาย (CD2) ═══════════
function tokenKey(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? `pos-staff-token:v1:${s}` : null;
}
function signBody(key: string, tenantId: string, unitId: string, deviceId: string, body: string): string {
  return createHmac("sha256", key).update(`${tenantId}|${unitId}|${deviceId}|${body}`).digest("base64url");
}
function makeToken(key: string, tenantId: string, unitId: string, deviceId: string, userId: string, pinHash: string | null, now: number): { staffToken: string; expiresAt: string } {
  const exp = now + STAFF_TOKEN_TTL_MS;
  const body = Buffer.from(JSON.stringify({ u: userId, e: exp, v: pinHash ? pinVersionOf(pinHash) : "-" })).toString("base64url");
  return { staffToken: `${body}.${signBody(key, tenantId, unitId, deviceId, body)}`, expiresAt: new Date(exp).toISOString() };
}

/**
 * ออกโทเคนผู้ขาย (ตัวเซ็นตัวเดียวกับ verifyStaffPin) — ใช้ภายในเซิร์ฟเวอร์เท่านั้น (ไม่มี action) · `opts.now` เลื่อนนาฬิกา (ข้อสอบหมดอายุ)
 * ไม่ตรวจ PIN — ผู้เรียกต้องยืนยันตัวตนมาแล้ว · ไม่มี SESSION_SECRET (≥ 32) = throw
 */
export async function issueStaffToken(
  ctx: StaffPinCtx,
  input: { unitId: string; deviceId: string; userId: string },
  opts?: { now?: Date },
  client?: Db,
): Promise<{ staffToken: string; expiresAt: string }> {
  const db = client ?? prisma;
  const key = tokenKey();
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า SESSION_SECRET — ออกโทเคนผู้ขายไม่ได้");
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isRecord(input) || !isId(input.unitId) || !isId(input.userId) || !isPosDeviceCode(input.deviceId)) throw new Error("ข้อมูลออกโทเคนไม่ถูกต้อง");
  if ((ctx.unitId !== undefined && ctx.unitId !== input.unitId) || (ctx.deviceId !== undefined && ctx.deviceId !== input.deviceId)) throw new Error("สาขา/เครื่องของโทเคนไม่ตรงกับคำขอ");
  const row = await db.posStaffPin.findUnique({ where: { unitId_userId: { unitId: input.unitId, userId: input.userId } }, select: { tenantId: true, pinHash: true } });
  const pinHash = row && row.tenantId === ctx.tenantId ? row.pinHash : null;
  const now = opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now.getTime() : Date.now();
  return makeToken(key, ctx.tenantId, input.unitId, input.deviceId, input.userId, pinHash, now);
}

/**
 * โทเคน → ผู้กระทำ (สิทธิ์สดจาก membership) · null = ลายเซ็นผิด (ร้าน/สาขา/เครื่องอื่น · ถูกแก้) · หมดอายุ · ตั้ง PIN ใหม่แล้ว ·
 * ไม่มี pos.sale.create ที่สาขานี้แล้ว · เครื่องถูกเพิกถอน · ไม่มี SESSION_SECRET
 */
export async function staffActorFromToken(ctx: unknown, token: unknown, client?: Db): Promise<RegisterActor | null> {
  try {
    const db = client ?? prisma;
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.unitId) || !isPosDeviceCode(ctx.deviceId)) return null;
    if (typeof token !== "string" || token.length > TOKEN_MAX) return null;
    const key = tokenKey();
    if (!key) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [body, sig] = parts as [string, string];
    const want = Buffer.from(signBody(key, ctx.tenantId, ctx.unitId, ctx.deviceId, body));
    const got = Buffer.from(sig);
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const p: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!isRecord(p) || !isId(p.u) || typeof p.e !== "number" || typeof p.v !== "string") return null;
    if (!(p.e > Date.now())) return null;
    const row = await db.posStaffPin.findUnique({ where: { unitId_userId: { unitId: ctx.unitId, userId: p.u } }, select: { tenantId: true, pinHash: true } });
    if (!row || row.tenantId !== ctx.tenantId || pinVersionOf(row.pinHash) !== p.v) return null;
    const actor = await posMemberActor(ctx.tenantId, p.u, db);
    if (!actor || !canSellAt(actor, ctx.unitId)) return null;
    if (await posDeviceRevoked(db, ctx.tenantId, ctx.unitId, ctx.deviceId)) return null;
    return actor;
  } catch {
    return null;
  }
}

/** โทเคน → { userId } | null (ctx = { tenantId, systemId, unitId, deviceId }) — กติกาเดียวกับ staffActorFromToken */
export async function staffFromToken(ctx: StaffPinCtx, token: string, client?: Db): Promise<{ userId: string } | null> {
  const a = await staffActorFromToken(ctx, token, client);
  return a ? { userId: a.userId } : null;
}

// ═══════════ POS P1.18 ▸ K1 ด่านต่อเครื่อง (PIN แบบไม่ระบุคน) ◂ ═══════════
const PIN_FAILED_AUDIT = "pos.staff.pin_failed";
/** จำนวนครั้งที่ใส่ PIN แบบไม่ระบุคนผิดบนเครื่องนี้ (สาขานี้) ภายในหน้าต่าง STAFF_PIN_DEVICE_THROTTLE_MS */
async function anonymousPinFailures(db: Db, s: UnitScope, deviceId: string): Promise<number> {
  const since = new Date(Date.now() - STAFF_PIN_DEVICE_THROTTLE_MS);
  return db.auditLog.count({
    where: {
      tenantId: s.tenantId,
      action: PIN_FAILED_AUDIT,
      createdAt: { gte: since },
      AND: [{ after: { path: ["deviceId"], equals: deviceId } }, { after: { path: ["unitId"], equals: s.unitId } }],
    },
  });
}

// ═══════════ ยืนยัน PIN บนเครื่อง (R2) ═══════════
/**
 * ใส่ PIN ที่เครื่อง (ไม่มี actor — เครื่องคือผู้เรียก · deviceId = รหัสเครื่องของ P1.9/P1.10) → โทเคนผู้ขาย 12 ชม. ·
 * PIN_INVALID (ไม่บอกว่าของใคร) · PIN_LOCKED · DEVICE_REVOKED · ผ่าน = AuditLog pos.staff.pin_verified (userId เท่านั้น)
 */
export async function verifyStaffPin(
  ctx: StaffPinCtx,
  input: { unitId: string; deviceId: string; pin: string; userId?: string | null },
  client?: Db,
): Promise<VerifyStaffPinOk | RegisterRefusal> {
  return guard("verifyStaffPin", async (): Promise<VerifyStaffPinOk | RegisterRefusal> => {
    const db = client ?? prisma;
    const s = await unitScope(db, ctx);
    if (isRefusal(s)) return s;
    if (!isRecord(input) || input.unitId !== s.unitId) return refuse("VALIDATION", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
    const deviceId = input.deviceId;
    if (!isPosDeviceCode(deviceId) || (ctx.deviceId !== undefined && ctx.deviceId !== deviceId)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    if (await posDeviceRevoked(db, s.tenantId, s.unitId, deviceId)) return refuse("DEVICE_REVOKED");
    const key = tokenKey();
    if (!key) return refuse("INTERNAL");
    // POS P1.18 ▸ K1 (มติ 2): ด่านกันเดาต่อเครื่องของการใส่ PIN แบบไม่ระบุคน — นับแถว AuditLog pos.staff.pin_failed ของเครื่องนี้
    //   ในหน้าต่าง "ก่อน" ตรวจ PIN · ครบ N = PIN_THROTTLED (PIN ถูกก็ไม่ผ่าน · ไม่เขียนแถวผิดเพิ่ม ⇒ หน้าต่างหมดเอง) ·
    //   ระบุคน (userId) ไม่ผ่านด่านนี้ (ใช้ตัวนับ/ล็อกต่อแถวเดิม) · เก็บใน AuditLog ⇒ ไม่มี migration และถูกต้องข้ามหลายเครื่องเซิร์ฟเวอร์ ◂
    const anonymous = input.userId === undefined || input.userId === null;
    if (anonymous && (await anonymousPinFailures(db, s, deviceId)) >= STAFF_PIN_DEVICE_THROTTLE_AFTER) return refuse("PIN_THROTTLED");
    const m = await matchStaffPin(s, input.pin, input.userId ?? null, db);
    if (isRefusal(m)) {
      if (anonymous && m.code === "PIN_INVALID")
        await writeAudit({ tenantId: s.tenantId, actorId: null, action: PIN_FAILED_AUDIT, targetType: "PosDevice", after: { deviceId, unitId: s.unitId } });
      return m;
    }
    const t = makeToken(key, s.tenantId, s.unitId, deviceId, m.actor.userId, m.pinHash, Date.now());
    await writeAudit({ tenantId: s.tenantId, actorId: m.actor.userId, action: "pos.staff.pin_verified", targetType: "PosStaffPin", targetId: m.rowId, after: { userId: m.actor.userId, unitId: s.unitId, deviceId } });
    return { ok: true, userId: m.actor.userId, role: m.actor.role, staffToken: t.staffToken, expiresAt: t.expiresAt };
  });
}

/**
 * PIN ผู้จัดการที่เครื่องนี้ (managerPin + managerUserId บังคับ — มติผู้คุมงาน 1 · fix รอบ 1 F2) → ผู้กระทำของผู้จัดการ (สิทธิ์สด) ·
 * ไม่มี managerUserId = VALIDATION · ผิด = PIN_INVALID (+1 บนแถวของ managerUserId) · ล็อก = PIN_LOCKED · เครื่องถูกเพิกถอน = DEVICE_REVOKED · ไม่ออกโทเคน ไม่เขียน pin_verified
 */
export async function verifyManagerPin(
  scope: { tenantId: string; unitId: string; deviceId?: string | null },
  input: { managerPin: unknown; managerUserId?: unknown },
  client?: Db,
): Promise<{ ok: true; actor: RegisterActor } | RegisterRefusal> {
  try {
    const db = client ?? prisma;
    // fix รอบ 1 F2: PIN ผู้จัดการต้องระบุผู้จัดการเสมอ (ไม่มีทาง "จับทุกแถว") ⇒ ทุกครั้งที่ผิดนับบนแถวของคนนั้น
    const uid = input.managerUserId;
    if (uid === undefined || uid === null || !isId(uid)) return refuse("VALIDATION", "เลือกผู้จัดการก่อนใส่ PIN");
    if (scope.deviceId && (await posDeviceRevoked(db, scope.tenantId, scope.unitId, scope.deviceId))) return refuse("DEVICE_REVOKED");
    const m = await matchStaffPin(scope, input.managerPin, uid, db);
    return isRefusal(m) ? m : { ok: true, actor: m.actor };
  } catch (e) {
    logSafe("verifyManagerPin", e);
    return refuse("INTERNAL");
  }
}

// ═══════════ ปลดล็อก (R2) ═══════════
export async function unlockStaffPin(ctx: StaffPinCtx, actor: RegisterActor, input: { userId: string }, client?: Db): Promise<StaffPinOk | RegisterRefusal> {
  return guard("unlockStaffPin", async (): Promise<StaffPinOk | RegisterRefusal> => {
    const db = client ?? prisma;
    const s = await unitScope(db, ctx);
    if (isRefusal(s)) return s;
    const a = actorOf(actor);
    if (!a || !canAccessUnit(a, s.unitId) || !evaluate(a, { module: "pos", action: MANAGE_PERMISSION, unitId: s.unitId })) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !isId(input.userId)) return refuse("VALIDATION", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
    const row = await db.posStaffPin.findUnique({ where: { unitId_userId: { unitId: s.unitId, userId: input.userId } }, select: { id: true, tenantId: true, failedCount: true, lockedUntil: true } });
    if (!row || row.tenantId !== s.tenantId) return refuse("NOT_FOUND", "พนักงานคนนี้ยังไม่ได้ตั้ง PIN ที่สาขานี้");
    await db.posStaffPin.updateMany({ where: { id: row.id }, data: { failedCount: 0, lockedUntil: null } });
    await writeAudit({ tenantId: s.tenantId, actorId: a.userId, action: "pos.staff.pin_unlocked", targetType: "PosStaffPin", targetId: row.id, before: { failedCount: row.failedCount, lockedUntil: row.lockedUntil?.toISOString() ?? null }, after: { userId: input.userId, failedCount: 0 } });
    return { ok: true };
  });
}

// ═══════════ รายชื่อพนักงานของจอล็อก (R8) ═══════════
/** สมาชิกของสาขาที่มี pos.sale.create (ชื่อแสดงได้ — จอพนักงานบนเครื่องของร้าน) · hasPin · กะ OPEN ของคนนั้นในสาขานี้ */
export async function listStaffForDevice(ctx: StaffPinCtx, input: { unitId: string }, client?: Db): Promise<ListStaffForDeviceResult> {
  return guard("listStaffForDevice", async (): Promise<ListStaffForDeviceResult> => {
    const db = client ?? prisma;
    const s = await unitScope(db, ctx);
    if (isRefusal(s)) return s;
    if (!isRecord(input) || input.unitId !== s.unitId) return refuse("VALIDATION", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
    if (ctx.deviceId !== undefined && (await posDeviceRevoked(db, s.tenantId, s.unitId, ctx.deviceId))) return refuse("DEVICE_REVOKED");
    const members = await db.membership.findMany({
      where: { tenantId: s.tenantId, acceptedAt: { not: null } },
      select: { userId: true, role: true, unitAccess: true, permissions: true, user: { select: { name: true } } },
    });
    const sellers = members.flatMap((m) => {
      const a = memberToActor(m);
      return a && canSellAt(a, s.unitId) ? [{ actor: a, name: m.user?.name ?? null }] : [];
    });
    const ids = sellers.map((x) => x.actor.userId);
    const [pins, shifts] = ids.length
      ? await Promise.all([
          db.posStaffPin.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, userId: { in: ids } }, select: { userId: true } }),
          db.posShift.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, status: "OPEN", openedByUserId: { in: ids } }, orderBy: [{ openedAt: "desc" }, { id: "desc" }], select: { id: true, openedAt: true, openedByUserId: true } }),
        ])
      : [[], []];
    const hasPin = new Set(pins.map((p) => p.userId));
    const shiftOf = new Map<string, { id: string; openedAt: string }>();
    for (const sh of shifts) if (!shiftOf.has(sh.openedByUserId)) shiftOf.set(sh.openedByUserId, { id: sh.id, openedAt: sh.openedAt.toISOString() });
    const items: StaffListItem[] = sellers
      .map(({ actor, name }) => ({ userId: actor.userId, name, role: actor.role as RegisterRole, hasPin: hasPin.has(actor.userId), shift: shiftOf.get(actor.userId) ?? null }))
      .sort((x, y) => (x.name ?? "").localeCompare(y.name ?? "", "th") || (x.userId < y.userId ? -1 : 1));
    return { ok: true, items };
  });
}
