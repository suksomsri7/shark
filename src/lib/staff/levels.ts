// levels.ts — ระดับสิทธิ์ต่อโมดูล ปิด/ดู/ใช้งาน + แชท 3 ระดับ (ใบ S1.25 · แบบ G3 · RESOLUTIONS Q10 · R-K14)
//
// ชั้นแปลอย่างเดียว: ระดับ → PermissionMap แล้วส่งให้ `updateStaffAccess` เดิม (RBAC/การยกระดับสิทธิ์ตรวจซ้ำที่นั่นทุกข้อ)
//   OFF  = ไม่มีคีย์ของโมดูล
//   VIEW = เฉพาะคีย์อ่าน (action ลงท้าย .read/.view/.list) ที่ไม่ใช่คีย์อ่อนไหว
//   USE  = ทุกคีย์ของโมดูล **ยกเว้น** คีย์อ่อนไหว (ลบ/เงิน/คืนเงิน/ยกเลิกบิล/ตั้งค่า/เงินเดือน) — ต้องให้รายคีย์ (extraPermissions)
//          คีย์อ่อนไหวที่เคยให้รายคีย์ไว้แล้ว คงไว้ตอนตั้ง USE ซ้ำ (ไม่ถอนเงียบ ๆ) · ตั้ง VIEW/OFF = ถอน
// 🔴 ระดับเป็นแค่ "ทางลัดของหน้าจอ" — ตัวตัดสินสิทธิ์จริงยังเป็น `evaluate` (rbac.ts) บนคีย์ที่เขียนลง Membership เหมือนเดิม
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { PERMISSION_MODULES, isPermissionKey, isPermissionParamKey, moduleOfPermissionKey } from "@/lib/core/permissions";
import { listTenantUnits, revokeStaffAccess, updateStaffAccess, type StaffResult } from "./service";

export type ModuleLevel = "OFF" | "VIEW" | "USE";
type PermissionMap = Record<string, unknown>;
type LevelCtx = { tenantId: string; actorUserId: string; membership: MembershipCtx };

export const MODULE_LEVELS: readonly ModuleLevel[] = ["OFF", "VIEW", "USE"];
const CHAT_MODULE = "chat";
/** R-K14: ตอบแชท = `chat.message.send` (ไม่มีคีย์ใหม่) · R-S1.25a: แอปใช้คีย์เว็บ ⇒ VIEW มี markRead · REPLY มี markRead+setStatus
 *  (assign / customer.link ไม่อยู่ในระดับ — ให้รายคีย์ผ่าน extraPermissions หรือบทบาท MANAGER) */
export const CHAT_LEVELS = {
  NONE: [],
  VIEW: ["chat.conversation.read", "chat.conversation.markRead"],
  REPLY: ["chat.conversation.read", "chat.conversation.markRead", "chat.message.send", "chat.conversation.setStatus"],
} as const;
export type ChatLevel = keyof typeof CHAT_LEVELS;

const READ_ACTION = /\.(read|view|list)$/;
/** คีย์อ่อนไหว: ส่วนใดของคีย์เป็น ลบ/เงิน/คืนเงิน/ยกเลิกบิล · ตั้งค่า (settings/setting) · หรือมีคำว่า payroll */
function isSensitiveKey(key: string): boolean {
  return key.split(".").some((s) => /^(delete|money|refund|void)/i.test(s) || /^settings?$/i.test(s) || /payroll/i.test(s));
}

/** โมดูลของคีย์ — ทะเบียนก่อน · คีย์ที่ทะเบียนไม่รู้จัก (ของเก่า) ใช้ส่วนหน้าจุดแรก */
function keyModule(key: string): string {
  return moduleOfPermissionKey(key) ?? key.split(".")[0] ?? "";
}

function granted(v: unknown): boolean {
  return v === true || (typeof v === "number" && v > 0);
}

function moduleView(module: string) {
  return PERMISSION_MODULES.find((m) => m.module === module);
}

/** ระดับของโมดูลจากชุดสิทธิ์ (pure) */
export function levelOfModule(permissions: PermissionMap, module: string): ModuleLevel {
  let any = false;
  for (const [k, v] of Object.entries(permissions ?? {})) {
    if (keyModule(k) !== module || !granted(v)) continue;
    if (k === `${module}.*` || typeof v === "number" || !READ_ACTION.test(k)) return "USE";
    any = true;
  }
  return any ? "VIEW" : "OFF";
}

/** ชุดสิทธิ์ใหม่เมื่อตั้งโมดูลเป็นระดับนี้ (pure) · base = สิทธิ์เดิม (โมดูลอื่นคงไว้) */
export function permissionsForLevel(module: string, level: ModuleLevel, base: PermissionMap = {}): PermissionMap {
  const out: PermissionMap = {};
  const keptSensitive: PermissionMap = {};
  for (const [k, v] of Object.entries(base ?? {})) {
    if (keyModule(k) !== module) out[k] = v;
    else if (isSensitiveKey(k) && granted(v)) keptSensitive[k] = v;
  }
  const keys = (moduleView(module)?.actions ?? []).map((a) => a.key).filter((k) => !isSensitiveKey(k));
  if (level === "VIEW") for (const k of keys) if (READ_ACTION.test(k)) out[k] = true;
  if (level === "USE") {
    for (const k of keys) out[k] = true;
    Object.assign(out, keptSensitive);
  }
  return out;
}

/** ตั้งแชท 3 ระดับ (pure) — NONE/VIEW ถอนคีย์แชททั้งโมดูล · REPLY ถอนแค่ `chat.*` แล้วใส่ read+send (คีย์แชทอื่นที่ให้รายคีย์คงไว้) */
function permissionsForChat(level: ChatLevel, base: PermissionMap): PermissionMap {
  const out: PermissionMap = {};
  for (const [k, v] of Object.entries(base)) {
    if (keyModule(k) !== CHAT_MODULE) out[k] = v;
    else if (level === "REPLY" && k !== `${CHAT_MODULE}.*`) out[k] = v;
  }
  for (const k of CHAT_LEVELS[level]) out[k] = true;
  return out;
}

/** อ่านระดับแชท (ฝั่งอ่านผ่อน: ตัดสินจาก read/send — แถวเก่าที่ไม่มี markRead/setStatus ยังแสดงตรงกับ evaluate ของคีย์หลัก) */
function chatLevelOf(p: PermissionMap): ChatLevel {
  if (p[`${CHAT_MODULE}.*`] === true) return "REPLY";
  const read = p["chat.conversation.read"] === true;
  if (read && p["chat.message.send"] === true) return "REPLY";
  return read ? "VIEW" : "NONE";
}

/** มุมมองของหน้าสิทธิ์ (D1/S2.22) — OWNER/MANAGER = ทุกโมดูล USE + แชท REPLY (ตรงกับ evaluate) */
export function staffViewOf(m: { role: Role | string; unitAccess: unknown; permissions: unknown }): {
  role: string;
  units: string[];
  levels: Record<string, ModuleLevel>;
  chat: ChatLevel;
} {
  const p = m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions) ? (m.permissions as PermissionMap) : {};
  const units = Array.isArray(m.unitAccess) ? (m.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [];
  const full = m.role === "OWNER" || m.role === "MANAGER";
  const levels: Record<string, ModuleLevel> = {};
  for (const mod of PERMISSION_MODULES) levels[mod.module] = full ? "USE" : levelOfModule(p, mod.module);
  return { role: String(m.role), units, levels, chat: full ? "REPLY" : chatLevelOf(p) };
}

const fail = (reason: string): StaffResult => ({ ok: false, reason });
const MSG_ROLE_ONLY = "เฉพาะเจ้าของกิจการหรือผู้จัดการเท่านั้นที่ตั้งสิทธิ์พนักงานได้";
const MSG_NOT_FOUND = "ไม่พบผู้ใช้งานคนนี้ในกิจการนี้ — กรุณารีเฟรชหน้าแล้วลองใหม่";
const MSG_OWNER_TARGET = "ผู้จัดการแก้สิทธิ์ของเจ้าของกิจการไม่ได้ — ให้เจ้าของกิจการเป็นผู้ทำรายการนี้";

/** ผู้สั่ง (อ่านจาก DB · ไม่เชื่อ ctx.membership) ต้องเป็น OWNER/MANAGER · เป้าหมายต้องอยู่ในร้าน · MANAGER ห้ามแตะ OWNER */
async function gate(ctx: LevelCtx, membershipId: string) {
  const actor = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.actorUserId, acceptedAt: { not: null } },
    select: { role: true },
  });
  if (!actor || (actor.role !== "OWNER" && actor.role !== "MANAGER")) return { ok: false as const, res: fail(MSG_ROLE_ONLY) };
  const target = await prisma.membership.findFirst({ where: { id: membershipId, tenantId: ctx.tenantId } });
  if (!target) return { ok: false as const, res: fail(MSG_NOT_FOUND) };
  if (actor.role === "MANAGER" && target.role === "OWNER") return { ok: false as const, res: fail(MSG_OWNER_TARGET) };
  return { ok: true as const, target };
}

/** ตั้งบทบาท/สาขา/ระดับต่อโมดูล/แชท ของพนักงาน 1 คน — แปลงเป็นคีย์แล้วเรียก `updateStaffAccess` เดิม */
export async function setStaffLevels(
  ctx: LevelCtx,
  membershipId: string,
  input: { role?: Role; unitIds?: string[]; levels?: Record<string, ModuleLevel>; chat?: ChatLevel; extraPermissions?: PermissionMap },
): Promise<StaffResult> {
  const g = await gate(ctx, membershipId);
  if (!g.ok) return g.res;
  if (input.role !== undefined && !["OWNER", "MANAGER", "STAFF"].includes(input.role)) return fail("บทบาทนี้ไม่มีในระบบ");

  let unitAccess: string[] | undefined;
  if (input.unitIds !== undefined) {
    if (!Array.isArray(input.unitIds)) return fail("รายการสาขาไม่ถูกต้อง");
    const ids = [...new Set(input.unitIds.map((u) => String(u).trim()).filter(Boolean))];
    if (!ids.includes("*")) {
      const own = new Set((await listTenantUnits(ctx.tenantId)).map((u) => u.id));
      if (ids.some((u) => !own.has(u))) return fail("มีสาขาที่ไม่อยู่ในกิจการนี้ — กรุณารีเฟรชหน้าแล้วเลือกใหม่");
    }
    unitAccess = ids;
  }

  let permissions: PermissionMap | undefined;
  if (input.levels !== undefined || input.chat !== undefined || input.extraPermissions !== undefined) {
    // เริ่มจากคีย์ที่ทะเบียนรู้จักของเดิม (คีย์เก่าที่ไม่รู้จัก updateStaffAccess เก็บไว้เอง — ส่งเข้าไปจะถูกปฏิเสธ)
    const cur = (g.target.permissions ?? {}) as PermissionMap;
    let next: PermissionMap = {};
    for (const [k, v] of Object.entries(cur)) if (isPermissionKey(k) || isPermissionParamKey(k)) next[k] = v;
    for (const [mod, lvl] of Object.entries(input.levels ?? {})) {
      if (!moduleView(mod)) return fail(`ระบบไม่รู้จักโมดูล “${mod}”`);
      if (!MODULE_LEVELS.includes(lvl)) return fail("ระดับสิทธิ์ต้องเป็น ปิด / ดู / ใช้งาน");
      next = permissionsForLevel(mod, lvl, next);
    }
    if (input.chat !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(CHAT_LEVELS, input.chat)) return fail("ระดับแชทต้องเป็น ไม่เห็น / ดูได้ / ตอบได้");
      next = permissionsForChat(input.chat, next);
    }
    permissions = { ...next, ...(input.extraPermissions ?? {}) };
  }

  return updateStaffAccess({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    membershipId: g.target.id,
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(unitAccess !== undefined ? { unitAccess } : {}),
    ...(permissions !== undefined ? { permissions } : {}),
  });
}

/** ระงับ = `revokeStaffAccess` เดิม (acceptedAt null · ทุกทางเข้ากรองอยู่แล้ว) — เปิดคืนด้วย restoreStaffAccess */
export async function suspendStaff(ctx: LevelCtx, membershipId: string): Promise<StaffResult> {
  const g = await gate(ctx, membershipId);
  if (!g.ok) return g.res;
  return revokeStaffAccess({ tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, membershipId: g.target.id });
}

/** เอาออก = ระงับ + ถอนออกจากห้องเลขาทุกห้องของร้าน + ลบคำเชิญค้างของเบอร์เขาในร้านนี้ · ไม่ลบ Membership (ประวัติ) */
export async function removeStaff(ctx: LevelCtx, membershipId: string): Promise<StaffResult> {
  const g = await gate(ctx, membershipId);
  if (!g.ok) return g.res;
  const r = await revokeStaffAccess({ tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, membershipId: g.target.id });
  if (!r.ok) return r;
  const userId = g.target.userId;
  await prisma.aiRoomMember.deleteMany({ where: { tenantId: ctx.tenantId, userId } });
  const phone = await prisma.userPhone.findUnique({ where: { userId }, select: { phone: true } });
  if (phone) await prisma.staffInvite.deleteMany({ where: { tenantId: ctx.tenantId, phone: phone.phone, acceptedAt: null } });
  return r;
}
