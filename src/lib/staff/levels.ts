// levels.ts — ระดับสิทธิ์ต่อโมดูล ปิด/ดู/ใช้งาน + แชท 3 ระดับ (ใบ S1.25 · แบบ G3 · RESOLUTIONS Q10 · R-K14)
//
// ชั้นแปลอย่างเดียว: ระดับ → PermissionMap แล้วส่งให้ `updateStaffAccess` เดิม (RBAC/การยกระดับสิทธิ์ตรวจซ้ำที่นั่นทุกข้อ)
//   OFF  = ไม่มีคีย์ของโมดูล
//   VIEW = เฉพาะคีย์อ่าน (action ลงท้าย .read/.view/.list) ที่ไม่ใช่คีย์อ่อนไหว
//   USE  = ทุกคีย์ของโมดูล **ยกเว้น** คีย์อ่อนไหว (`isSensitiveKey` · R-S1.25e) — ต้องให้รายคีย์ (extraPermissions)
//   คีย์ลิมิต `_…` คงไว้ทุกระดับ (R-S1.25f) · ระดับที่โมดูลมีจริง = `levelsAvailableFor` (R-S1.25g) · แชทใช้ CHAT_LEVELS เท่านั้น (R-S1.25h)
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

/** R-S1.25e: คีย์อ่อนไหว — ไม่มีระดับใดให้ (ต้องให้รายคีย์ผ่าน extraPermissions · ตัวตรวจยกระดับเดิมยังกันอยู่) */
const SENSITIVE_PARTS = [
  // เงิน
  ".money", ".refund", ".void", ".payment.record", ".doc.approve", ".period.close", ".journal.adjust", ".point.adjust", ".giftcard.", ".priceoverride", ".setprice", ".sell",
  // ทำลาย/ขนข้อมูล
  ".delete", ".merge", ".cancel", ".import", ".export",
  // แอดมิน
  "api.key.", "webhook.", ".api.manage", ".object.manage", ".visibility.manage", ".team.manage", "settings.", "branding.", "privacy.manage", "payadjust", "payroll",
  // เพิ่มจากรายการ §P (ผู้คุมชี้ขาดได้): ยืนยันสลิป = เงินเข้า · ตั้งนโยบายอนุมัติ / ทะเบียนระบบ = แอดมินโครงสร้างร้าน
  ".slip.review", "approval.policy.", "systems.",
  // re-check N1 (RESOLUTIONS P.2) — ข้อมูลอ่อนไหว/เบอร์เต็ม · งวดบัญชี/ภาษีหัก ณ ที่จ่าย · รับเงินมือ/มัดจำ/ยกเว้น/ยึด/ตัดหนี้/จำหน่ายทรัพย์สิน · คอมมิชชัน · โอนแต้ม · เครดิต/การเงิน · สร้างระบบ
  ".sensitive.", ".phonefull", ".period.", ".wht.", ".markpaid", ".payment.manual", ".deposit.", ".waive", ".forfeit", ".writeoff", ".dispose",
  ".commission.approve", ".point.transfer", ".credit.manage", ".finance.manage", "system.system.",
  // เพิ่มเอง (oracle L-6): เช็ค (ผ่าน/เด้ง) · รับชำระค่าเรียน
  ".cheque.", ".enrollment.pay",
] as const;
/** W-12 (RESOLUTIONS §V · S1.14b): คีย์เต็มที่อ่อนไหว (exact match · ตัวพิมพ์เล็ก) — ส่วนย่อยของมันไม่อ่อนไหวพอจะใส่ใน SENSITIVE_PARTS
 *  (เช่น `.staff.manage` `.job.runany` จะลากคีย์ปกติของโมดูลอื่นไปด้วย) ⇒ ระบุทีละคีย์ */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "pos.staff.manage", // ตั้งพนักงาน/PIN ของ POS = แอดมินร้าน
  "pos.device.manage", // ผูก/ถอดเครื่อง POS
  "booking.service.setdeposit", // ตั้งมัดจำบริการ = เงิน
  "account.approve.limit", // เพดานอนุมัติบัญชี = เงิน
  "account.chart.manage", // ผังบัญชี = โครงสร้างบัญชี
  "crm.quota.manage", // เป้าขาย/ค่าคอม
  "crm.report.all", // รายงานทุกคน (ข้อมูลยอดขายของคนอื่น)
  "booking.job.runany", // สั่งงานแทนคนอื่น
]);
export function isSensitiveKey(key: string): boolean {
  const k = String(key ?? "").toLowerCase();
  if (SENSITIVE_KEYS.has(k)) return true;
  if (SENSITIVE_PARTS.some((p) => k.includes(p) || (p.startsWith(".") && k.startsWith(p.slice(1))))) return true;
  // ของรอบแรก (กันคีย์ชื่อแปลก): ส่วนใดขึ้นต้น delete/money/refund/void · เป็น setting(s)
  return k.split(".").some((s) => /^(delete|money|refund|void)/.test(s) || /^settings?$/.test(s));
}

/** R-S1.25f: คีย์ตัวเลข/ลิมิต (ส่วนใดขึ้นต้น `_` เช่น `_maxApproveSatang` `crm._maxReassignPerDay`) — คงไว้ทุกระดับ · ไม่นับเป็นระดับ */
function isLimitKey(key: string): boolean {
  return key.split(".").some((s) => s.startsWith("_"));
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

/** คีย์ที่ระดับให้ได้ของโมดูล (ไม่รวมคีย์อ่อนไหว) แยกอ่าน/เขียน */
function grantableKeys(module: string): { read: string[]; write: string[] } {
  const keys = (moduleView(module)?.actions ?? []).map((a) => a.key).filter((k) => !isSensitiveKey(k) && !isLimitKey(k));
  return { read: keys.filter((k) => READ_ACTION.test(k)), write: keys.filter((k) => !READ_ACTION.test(k)) };
}

/**
 * R-S1.25g: ระดับที่โมดูลนี้มีจริง — ไม่มีคีย์อ่าน ⇒ ไม่มี VIEW · ไม่มีคีย์เขียนที่ให้ได้ ⇒ ไม่มี USE · มีแต่คีย์อ่อนไหว ⇒ [OFF]
 * แชทไม่ใช้ระดับโมดูล (ใช้ CHAT_LEVELS) ⇒ [] · โมดูลที่ไม่รู้จัก ⇒ [OFF]
 */
export function levelsAvailableFor(module: string): ModuleLevel[] {
  if (module === CHAT_MODULE) return [];
  const g = grantableKeys(module);
  return ["OFF", ...(g.read.length ? (["VIEW"] as const) : []), ...(g.write.length ? (["USE"] as const) : [])];
}

/** ระดับของโมดูลจากชุดสิทธิ์ (pure) · คีย์ลิมิต `_…` ไม่นับ */
export function levelOfModule(permissions: PermissionMap, module: string): ModuleLevel {
  let any = false;
  for (const [k, v] of Object.entries(permissions ?? {})) {
    if (keyModule(k) !== module || isLimitKey(k) || !granted(v)) continue;
    if (k === `${module}.*` || typeof v === "number" || !READ_ACTION.test(k)) return "USE";
    any = true;
  }
  return any ? "VIEW" : "OFF";
}

/** ชุดสิทธิ์ใหม่เมื่อตั้งโมดูลเป็นระดับนี้ (pure) · base = สิทธิ์เดิม (โมดูลอื่น + คีย์ลิมิตของโมดูลนี้คงไว้) */
export function permissionsForLevel(module: string, level: ModuleLevel, base: PermissionMap = {}): PermissionMap {
  const out: PermissionMap = {};
  const keptSensitive: PermissionMap = {};
  for (const [k, v] of Object.entries(base ?? {})) {
    if (keyModule(k) !== module || isLimitKey(k)) out[k] = v;
    else if (isSensitiveKey(k) && granted(v)) keptSensitive[k] = v;
  }
  const g = grantableKeys(module);
  if (level === "VIEW") for (const k of g.read) out[k] = true;
  if (level === "USE") {
    for (const k of [...g.read, ...g.write]) out[k] = true;
    Object.assign(out, keptSensitive); // คีย์อ่อนไหวที่เคยให้รายคีย์ไว้ ไม่ถอนเงียบ ๆ (ระดับไม่ "ให้" เพิ่ม)
  }
  return out;
}

/** ตั้งแชท 3 ระดับ (pure) — NONE/VIEW ถอนคีย์แชททั้งโมดูล · REPLY ถอนแค่ `chat.*` แล้วใส่ 4 คีย์ (คีย์แชทอื่นที่ให้รายคีย์คงไว้) · คีย์ลิมิตคงไว้ */
export function permissionsForChat(level: ChatLevel, base: PermissionMap = {}): PermissionMap {
  const out: PermissionMap = {};
  for (const [k, v] of Object.entries(base)) {
    if (keyModule(k) !== CHAT_MODULE || isLimitKey(k)) out[k] = v;
    else if (level === "REPLY" && k !== `${CHAT_MODULE}.*`) out[k] = v;
  }
  for (const k of CHAT_LEVELS[level]) out[k] = true;
  return out;
}

/** อ่านระดับแชท (R-S1.25h): REPLY = `chat.*` หรือครบ 4 คีย์ · VIEW = มี read · อื่น ๆ = NONE */
function chatLevelOf(p: PermissionMap): ChatLevel {
  if (p[`${CHAT_MODULE}.*`] === true) return "REPLY";
  if (CHAT_LEVELS.REPLY.every((k) => p[k] === true)) return "REPLY";
  return p["chat.conversation.read"] === true ? "VIEW" : "NONE";
}

/** มุมมองของหน้าสิทธิ์ (D1/S2.22) — `levels` ไม่มีแชท (ดู `chat`) · OWNER/MANAGER = ระดับสูงสุดที่โมดูลมี + REPLY (ตรงกับ evaluate) */
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
  for (const mod of PERMISSION_MODULES) {
    if (mod.module === CHAT_MODULE) continue;
    levels[mod.module] = full ? (levelsAvailableFor(mod.module).at(-1) ?? "OFF") : levelOfModule(p, mod.module);
  }
  return { role: String(m.role), units, levels, chat: full ? "REPLY" : chatLevelOf(p) };
}

const fail = (reason: string): StaffResult => ({ ok: false, reason });
const MSG_ROLE_ONLY = "เฉพาะเจ้าของกิจการหรือผู้จัดการเท่านั้นที่ตั้งสิทธิ์พนักงานได้";
const MSG_NOT_FOUND = "ไม่พบผู้ใช้งานคนนี้ในกิจการนี้ — กรุณารีเฟรชหน้าแล้วลองใหม่";
const MSG_MANAGER_STAFF_ONLY = "ผู้จัดการตั้งสิทธิ์/ระงับได้เฉพาะ “พนักงาน” — ให้เจ้าของกิจการเป็นผู้ทำรายการนี้";

/** ผู้สั่ง (อ่านจาก DB · ไม่เชื่อ ctx.membership) ต้องเป็น OWNER/MANAGER · เป้าหมายต้องอยู่ในร้าน · MANAGER แตะได้เฉพาะ STAFF (R-S1.25d) */
async function gate(ctx: LevelCtx, membershipId: string) {
  const actor = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.actorUserId, acceptedAt: { not: null } },
    select: { role: true },
  });
  if (!actor || (actor.role !== "OWNER" && actor.role !== "MANAGER")) return { ok: false as const, res: fail(MSG_ROLE_ONLY) };
  const target = await prisma.membership.findFirst({ where: { id: membershipId, tenantId: ctx.tenantId } });
  if (!target) return { ok: false as const, res: fail(MSG_NOT_FOUND) };
  if (actor.role === "MANAGER" && target.role !== "STAFF") return { ok: false as const, res: fail(MSG_MANAGER_STAFF_ONLY) };
  return { ok: true as const, target, actorRole: actor.role };
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
  if (g.actorRole === "MANAGER" && input.role !== undefined && input.role !== "STAFF") return fail(MSG_MANAGER_STAFF_ONLY);

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
      if (mod === CHAT_MODULE) return fail("ตั้งสิทธิ์แชทด้วยช่อง “แชท” (ไม่เห็น / ดูได้ / ตอบได้) แทนระดับโมดูล");
      if (!moduleView(mod)) return fail(`ระบบไม่รู้จักโมดูล “${mod}”`);
      if (!MODULE_LEVELS.includes(lvl) || !levelsAvailableFor(mod).includes(lvl)) return fail("ระดับนี้ไม่มีในระบบนี้ — เลือก ปิด / ดู / ใช้งาน ตามที่หน้าจอแสดง");
      next = permissionsForLevel(mod, lvl, next);
    }
    if (input.chat !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(CHAT_LEVELS, input.chat)) return fail("ระดับแชทต้องเป็น ไม่เห็น / ดูได้ / ตอบได้");
      next = permissionsForChat(input.chat, next);
    }
    // SEC S3a.1-S2 ▸ R-Z15 (เหมือน R-S1.14b-f): extraPermissions ห้ามคีย์ wildcard (`*` · `<module>.*`) — ให้ได้ทีละคีย์เท่านั้น ◂
    const wild = Object.keys(input.extraPermissions ?? {}).find((k) => k === "*" || k.endsWith(".*") || k.includes("*"));
    if (wild) return fail("ให้สิทธิ์แบบทั้งระบบ (*) ผ่านช่องนี้ไม่ได้ — เลือกระดับของระบบนั้น หรือติ๊กสิทธิ์ทีละข้อ");
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
  // R-S1.25j + re-check N5: ล้าง PushDevice.tenantId อยู่ใน revokeStaffAccess (เว็บก็ได้ด้วย)
  return revokeStaffAccess({ tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, membershipId: g.target.id });
}

/** เอาออก = ระงับ + ถอนออกจากห้องเลขาทุกห้องของร้าน + ลบคำเชิญค้างของเบอร์เขาในร้านนี้ · ไม่ลบ Membership (ประวัติ) */
export async function removeStaff(ctx: LevelCtx, membershipId: string): Promise<StaffResult> {
  const g = await gate(ctx, membershipId);
  if (!g.ok) return g.res;
  const r = await revokeStaffAccess({ tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, membershipId: g.target.id });
  if (!r.ok) return r;
  const userId = g.target.userId;
  await prisma.pushDevice.updateMany({ where: { userId, tenantId: ctx.tenantId }, data: { tenantId: null } }); // ถอนไปก่อนหน้าแล้ว (revoke คืนเร็ว) ก็ยังล้าง
  await prisma.aiRoomMember.deleteMany({ where: { tenantId: ctx.tenantId, userId } });
  const phone = await prisma.userPhone.findUnique({ where: { userId }, select: { phone: true } });
  if (phone) await prisma.staffInvite.deleteMany({ where: { tenantId: ctx.tenantId, phone: phone.phone, acceptedAt: null } });
  return r;
}
