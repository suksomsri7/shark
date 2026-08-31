// ผู้ใช้งานของร้าน + สิทธิ์ (WO-CW2 · ปิดช่องโหว่ G6/G7)
//
// เรื่องเดิม: `prisma.membership.create/update` ไม่มีที่ไหนในรีโปเลย นอกจาก account-deletion.ts
// (ตอนส่งมอบ OWNER) ⇒ ร้านมีผู้ใช้งานได้แค่คนที่ "สมัครเอง" · และ `HrEmployee.linkedUserId`
// เป็นฟิลด์ตายที่ไม่มีโค้ดไหนอ่านหรือเขียนเลย ⇒ ทะเบียนพนักงาน HR กับ "คนที่ล็อกอินได้" ไม่เคยเชื่อมกัน
//
// มติเจ้าของ (W2 · 31 ส.ค. 2026): **ไม่มีพิธีเชิญ** — แอดมินเลือกพนักงานจากทะเบียน HR
// แล้วกดให้สิทธิ์ได้เลย · พนักงานล็อกอินเองด้วย magic link/OTP ที่มีอยู่แล้ว (ระบบเป็น passwordless)
//
// 🔴 กติกาความปลอดภัยของไฟล์นี้ (fail-closed ทุกข้อ)
//   1. สิทธิ์ของ "ผู้สั่ง" อ่านจาก DB เสมอ — ห้ามเชื่อ role/permissions ที่ส่งมาจากฟอร์ม
//   2. ห้ามให้สิทธิ์ที่ตัวเองไม่มี (ไม่งั้นคนเดียวยกระดับตัวเองผ่านบัญชีอื่นได้)
//   3. ห้ามแก้สิทธิ์ตัวเอง ยกเว้น OWNER
//   4. OWNER คนสุดท้ายห้ามถูกลดสิทธิ์/ถอนออก (แบบเดียวกับมติใน platform/account-deletion.ts)
//   5. คีย์ที่เขียนลง `Membership.permissions` (คอลัมน์ Json) ต้องอยู่ในทะเบียน core/permissions.ts
//   6. ถอนสิทธิ์ = **ไม่ลบแถว** (ประวัติ `ChatMessage.senderUserId` / AuditLog ต้องยังอ้างชื่อคนได้)
//
// 📌 ทำไมใช้ `prisma` ตรง ไม่ใช่ `tenantDb`:
//   · `Membership` / `User` เป็นแกน **global** ในทะเบียน core/scope.ts (auth ต้อง list ข้ามร้านได้)
//   · `HrEmployee` เป็นแกน **system** ⇒ `tenantDb({tenantId})` จะโยนเพราะไม่มี systemId
//     แต่งานนี้ต้องรวมพนักงานจาก **ทุกระบบ HR** ของร้าน ⇒ query ด้วย tenantId ตรง
//     ทุก where ด้านล่างจึงมี `tenantId` กำกับมือเสมอ (fail-closed ด้วยตัวเอง)

import type { Membership, Prisma, Role, User } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import {
  canAssignRole,
  canGrantPermission,
  canGrantPermissionValue,
  canGrantUnitAccess,
  evaluate,
  type MembershipCtx,
} from "@/lib/core/rbac";
import {
  isPermissionKey,
  isPermissionParamKey,
  moduleOfPermissionKey,
  permissionLabel,
} from "@/lib/core/permissions";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "เจ้าของกิจการ",
  MANAGER: "ผู้จัดการ",
  STAFF: "พนักงาน",
};

export const ROLE_HINTS: Record<Role, string> = {
  OWNER: "ทำได้ทุกอย่างในร้าน รวมถึงตั้งสิทธิ์คนอื่น",
  MANAGER: "ทำได้ทุกอย่างเฉพาะในสาขาที่ดูแล",
  STAFF: "ทำได้เฉพาะข้อที่ติ๊กให้เท่านั้น",
};

/** action ที่ต้องมีถึงจะจัดการผู้ใช้งานคนอื่นได้ — ตรงกับทะเบียน core/permissions.ts */
export const STAFF_ADMIN_ACTION = "settings.staff.write";
export const STAFF_READ_ACTION = "settings.staff.read";
const STAFF_MODULE = "settings";

export type StaffOk = { ok: true; userId?: string; membershipId?: string };
export type StaffFail = { ok: false; reason: string };
export type StaffResult = StaffOk | StaffFail;

const fail = (reason: string): StaffFail => ({ ok: false, reason });

// ─────────────────────────────────────────────────────────────────────────────
// ตัวช่วยภายใน
// ─────────────────────────────────────────────────────────────────────────────

type PermissionMap = Record<string, unknown>;

function ctxOf(m: Pick<Membership, "role" | "unitAccess" | "permissions">): MembershipCtx {
  return {
    role: m.role,
    unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as string[]) : [],
    permissions: (m.permissions ?? {}) as PermissionMap,
  };
}

/** อ่านสิทธิ์ของผู้สั่งจาก DB + ตรวจด่านของหน้าตั้งสิทธิ์เอง (ไม่เชื่อค่าที่ส่งเข้ามา) */
async function loadActor(
  tenantId: string,
  actorUserId: string,
): Promise<{ ok: true; membership: Membership; ctx: MembershipCtx } | StaffFail> {
  if (!tenantId || !actorUserId) return fail("ระบบยังไม่รู้ว่าคุณกำลังทำรายการในกิจการไหน กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
  const membership = await prisma.membership.findFirst({
    where: { userId: actorUserId, tenantId, acceptedAt: { not: null } },
  });
  if (!membership) return fail("บัญชีของคุณยังไม่ได้อยู่ในกิจการนี้ กรุณาเข้าสู่ระบบใหม่ หรือให้เจ้าของร้านเพิ่มคุณเข้ากิจการก่อน");
  const ctx = ctxOf(membership);
  if (!evaluate(ctx, { module: STAFF_MODULE, action: STAFF_ADMIN_ACTION })) {
    return fail("บัญชีของคุณยังไม่ได้รับสิทธิ์ “จัดการผู้ใช้งาน” ให้เจ้าของร้านหรือผู้จัดการเปิดสิทธิ์นี้ให้ก่อน");
  }
  return { ok: true, membership, ctx };
}

/** นับ OWNER คนอื่นที่ยังใช้งานอยู่ในร้าน (ไม่รวมคนที่กำลังจะถูกแก้) */
async function countOtherActiveOwners(tenantId: string, exceptUserId: string): Promise<number> {
  return prisma.membership.count({
    where: { tenantId, role: "OWNER", acceptedAt: { not: null }, userId: { not: exceptUserId } },
  });
}

const LAST_OWNER_REASON =
  "คนนี้เป็นเจ้าของกิจการคนสุดท้าย ถ้าลดสิทธิ์หรือถอนออกจะไม่มีใครเข้าไปตั้งค่าร้านได้อีกเลย — ตั้งให้อีกคนเป็นเจ้าของกิจการก่อน แล้วค่อยกลับมาทำรายการนี้";

/** เขียน AuditLog แบบไม่ทำให้งานหลักพัง (แพตเทิร์นเดียวกับ modules/account/access.ts) */
async function writeStaffAudit(input: {
  tenantId: string;
  actorId: string;
  action: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorType: "USER",
        actorId: input.actorId,
        action: input.action,
        targetType: "Membership",
        targetId: input.targetId,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
      },
    });
  } catch {
    // audit ล้มเหลวห้ามทำให้การตั้งสิทธิ์พัง (แต่ก็ห้ามเงียบจนไม่มีร่องรอย — ดู ops log ที่ชั้นบน)
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (v: string) => v.trim().toLowerCase();

/** ล้าง unitAccess ให้เหลือค่าที่ใช้ได้จริง — `["*"]` = ทุกสาขา */
function normalizeUnitAccess(input: string[]): string[] {
  const clean = [...new Set(input.map((s) => String(s).trim()).filter(Boolean))];
  return clean.includes("*") ? ["*"] : clean;
}

export type PermissionValidation =
  | { ok: true; value: PermissionMap }
  | { ok: false; reason: string };

/**
 * ตรวจว่าคีย์ที่รับมาอยู่ในทะเบียนกลางจริง — `Membership.permissions` เป็น Json
 * ถ้าไม่กั้นตรงนี้ จะเขียนคีย์อะไรก็ได้ลง DB แล้วไม่มีวันตรงกับ assertCan (สิทธิ์ผี)
 */
export function validatePermissionInput(input: PermissionMap): PermissionValidation {
  const value: PermissionMap = {};
  for (const [key, raw] of Object.entries(input)) {
    if (isPermissionParamKey(key)) {
      if (raw === null || raw === undefined || raw === "") continue; // ไม่กรอก = ไม่จำกัด
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, reason: `ค่าของ “${permissionLabel(key)}” ต้องเป็นตัวเลขที่ไม่ติดลบ` };
      }
      value[key] = Math.trunc(n);
      continue;
    }
    if (!isPermissionKey(key)) {
      return {
        ok: false,
        reason: `ระบบไม่รู้จักสิทธิ์ “${key}” จึงยังบันทึกให้ไม่ได้ — กรุณารีเฟรชหน้านี้แล้วติ๊กใหม่อีกครั้ง`,
      };
    }
    if (raw === true || raw === "true" || raw === "on" || raw === "1") value[key] = true;
    // ค่าอื่น (false / ไม่ติ๊ก) = ไม่ให้สิทธิ์ → ไม่เขียนคีย์ลงไปเลย
  }
  return { ok: true, value };
}

/**
 * รวมชุดสิทธิ์ใหม่กับของเดิม — เก็บคีย์เก่าที่ทะเบียน "ยังไม่รู้จัก" ไว้ตามเดิม
 * เหตุผล: ถ้าลบทิ้ง จะเป็นการถอนสิทธิ์/ถอนเพดานเงียบ ๆ ตอนแอดมินแค่มากดบันทึกหน้าเดิม
 * (เช่นเพดานวงเงินอนุมัติที่หายไป = จากจำกัด กลายเป็นไม่จำกัด — อันตรายกว่าเก็บไว้)
 */
function mergePermissions(current: PermissionMap, next: PermissionMap): PermissionMap {
  const legacy: PermissionMap = {};
  for (const [k, v] of Object.entries(current)) {
    if (!isPermissionKey(k) && !isPermissionParamKey(k)) legacy[k] = v;
  }
  return { ...legacy, ...next };
}

/** ตรวจการยกระดับสิทธิ์: ทุกข้อที่ "เพิ่มขึ้นจากของเดิม" ผู้สั่งต้องมีเองก่อน */
function checkNoEscalation(actor: MembershipCtx, current: PermissionMap, next: PermissionMap): StaffFail | null {
  for (const [key, val] of Object.entries(next)) {
    if (val === true) {
      if (current[key] === true) continue; // มีอยู่แล้ว ไม่ใช่การเพิ่ม
      const moduleName = moduleOfPermissionKey(key);
      if (!moduleName) return fail(`ระบบไม่รู้จักสิทธิ์ “${key}” จึงยังบันทึกให้ไม่ได้`);
      if (!canGrantPermission(actor, moduleName, key)) {
        return fail(
          `คุณยังไม่มีสิทธิ์ “${permissionLabel(key)}” จึงมอบให้คนอื่นไม่ได้ — ให้เจ้าของร้านเป็นผู้เปิดสิทธิ์ข้อนี้แทน`,
        );
      }
      continue;
    }
    if (typeof val === "number") {
      const cur = typeof current[key] === "number" ? (current[key] as number) : undefined;
      if (cur !== undefined && val <= cur) continue; // ลดลง/เท่าเดิม ไม่ใช่การเพิ่ม
      if (!canGrantPermissionValue(actor, key, val)) {
        return fail(
          `ค่าของ “${permissionLabel(key)}” ที่ตั้งให้เกินเพดานของคุณเอง — ให้เจ้าของร้านเป็นผู้ตั้งค่านี้แทน`,
        );
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// อ่านข้อมูลสำหรับหน้าจอ
// ─────────────────────────────────────────────────────────────────────────────

export type StaffAccessRow = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  /** ["*"] = ทุกสาขา */
  unitAccess: string[];
  permissions: PermissionMap;
  /** false = ถูกถอนสิทธิ์ (แถวยังอยู่ ประวัติยังอ้างชื่อได้) */
  active: boolean;
  joinedAt: Date;
  /** พนักงานในทะเบียน HR ที่ผูกกับบัญชีนี้ (ปิดหนี้ G7) */
  employee: { id: string; name: string; position: string | null; systemId: string } | null;
};

/** ผู้ใช้งานทั้งหมดของร้าน (รวมคนที่ถูกถอนสิทธิ์ เพื่อให้เปิดคืนได้) */
export async function listStaffAccess(tenantId: string): Promise<StaffAccessRow[]> {
  const memberships = await prisma.membership.findMany({
    where: { tenantId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const userIds = memberships.map((m) => m.userId);
  const employees = userIds.length
    ? await prisma.hrEmployee.findMany({ where: { tenantId, linkedUserId: { in: userIds } } })
    : [];
  const empByUser = new Map(employees.map((e) => [e.linkedUserId as string, e]));

  return memberships.map((m) => {
    const u = (m as Membership & { user: User }).user;
    const emp = empByUser.get(m.userId);
    return {
      membershipId: m.id,
      userId: m.userId,
      email: u?.email ?? "",
      name: u?.name?.trim() || (u?.email ?? "").split("@")[0] || "ผู้ใช้งาน",
      role: m.role,
      unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as string[]) : [],
      permissions: (m.permissions ?? {}) as PermissionMap,
      active: m.acceptedAt != null,
      joinedAt: m.createdAt,
      employee: emp ? { id: emp.id, name: emp.name, position: emp.position, systemId: emp.systemId } : null,
    };
  });
}

/** ชื่ออื่นที่คงไว้ให้เรียกได้ตามสัญญาของแผน §4.2 */
export const listStaffWithAccess = listStaffAccess;

export type GrantableEmployee = {
  id: string;
  name: string;
  position: string | null;
  email: string | null;
  systemId: string;
  systemName: string;
};

/**
 * พนักงานในทะเบียน HR ที่ยังไม่มีบัญชีเข้าใช้งาน — รวมจาก **ทุกระบบ HR** ของร้าน
 * (ร้านหนึ่งเปิดระบบ HR ได้หลายชุด · HrEmployee ผูก systemId)
 */
export async function listGrantableEmployees(tenantId: string): Promise<GrantableEmployee[]> {
  const employees = await prisma.hrEmployee.findMany({
    where: { tenantId, active: true, linkedUserId: null },
    orderBy: { name: "asc" },
  });
  if (employees.length === 0) return [];
  const systems = await prisma.appSystem.findMany({
    where: { tenantId, id: { in: [...new Set(employees.map((e) => e.systemId))] } },
    select: { id: true, name: true },
  });
  const nameById = new Map(systems.map((s) => [s.id, s.name]));
  return employees.map((e) => ({
    id: e.id,
    name: e.name,
    position: e.position,
    email: e.email,
    systemId: e.systemId,
    systemName: nameById.get(e.systemId) ?? "งานบุคคล",
  }));
}

/** สาขาของร้าน (ให้หน้าจอวาดช่องติ๊ก "เข้าถึงสาขาไหนได้บ้าง") */
export async function listTenantUnits(tenantId: string): Promise<{ id: string; name: string }[]> {
  const units = await prisma.businessUnit.findMany({
    where: { tenantId, status: { not: "ARCHIVED" } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });
  return units;
}

// ─────────────────────────────────────────────────────────────────────────────
// เขียน
// ─────────────────────────────────────────────────────────────────────────────

/** error ภายในทรานแซกชัน — ใช้พาเหตุผลภาษาไทยออกมาแล้ว rollback ทั้งก้อน */
class StaffRuleError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "StaffRuleError";
  }
}

export type GrantStaffAccessInput = {
  tenantId: string;
  actorUserId: string;
  /** HrEmployee.id ในร้านนี้ */
  employeeId: string;
  email: string;
};

/**
 * ให้พนักงานในทะเบียน HR เข้าใช้งานระบบได้ (มติ W2 — ไม่มีพิธีเชิญ)
 *
 * 🔴 ทั้งก้อนอยู่ในทรานแซกชันเดียว: สร้าง User สำเร็จแต่ Membership ล้ม = ผู้ใช้ผีที่ล็อกอินได้
 *    แต่ไม่มีร้าน และพนักงานคนนั้นจะถูกกันออกจากการให้สิทธิ์รอบหน้าเพราะอีเมลถูกใช้ไปแล้ว
 */
export async function grantStaffAccess(input: GrantStaffAccessInput): Promise<StaffResult> {
  const actor = await loadActor(input.tenantId, input.actorUserId);
  if (!actor.ok) return actor;

  const email = normalizeEmail(String(input.email ?? ""));
  if (!EMAIL_RE.test(email)) {
    return fail("กรุณากรอกอีเมลที่ใช้เข้าระบบได้จริง เช่น somchai@example.com (พนักงานจะใช้อีเมลนี้รับลิงก์เข้าระบบ)");
  }
  if (!input.employeeId) return fail("กรุณาเลือกพนักงานจากทะเบียนก่อน");

  try {
    const out = await prisma.$transaction(async (tx) => {
      // 1) พนักงานต้องอยู่ในร้านนี้จริง (กันส่ง employeeId ของร้านอื่นมาจากฟอร์ม)
      const employee = await tx.hrEmployee.findFirst({
        where: { id: input.employeeId, tenantId: input.tenantId },
      });
      if (!employee) {
        throw new StaffRuleError("ไม่พบพนักงานคนนี้ในทะเบียนของกิจการนี้ — กรุณารีเฟรชหน้าแล้วเลือกใหม่อีกครั้ง");
      }
      if (!employee.active) {
        throw new StaffRuleError(`“${employee.name}” ถูกปิดสถานะในทะเบียนพนักงานอยู่ — เปิดสถานะในระบบงานบุคคลก่อน แล้วค่อยให้สิทธิ์เข้าใช้งาน`);
      }

      // 2) upsert User ตามอีเมล — ระบบเป็น passwordless ไม่มีรหัสผ่านให้ตั้ง
      //    มีบัญชีอยู่แล้ว = ใช้ตัวเดิม (คนเดียวอยู่ได้หลายร้าน)
      const user = await tx.user.upsert({
        where: { email },
        update: {},
        create: { email, name: employee.name },
      });

      if (employee.linkedUserId && employee.linkedUserId !== user.id) {
        throw new StaffRuleError(`“${employee.name}” ผูกกับบัญชีผู้ใช้อื่นไปแล้ว — ถ้าต้องการเปลี่ยนอีเมล ให้แก้ที่หน้าผู้ใช้งานคนนั้นแทน`);
      }

      // 3) Membership — มีอยู่แล้วในร้านนี้ใช้ตัวเดิม (@@unique([userId, tenantId]))
      const existing = await tx.membership.findFirst({
        where: { userId: user.id, tenantId: input.tenantId },
      });
      let membershipId: string;
      let createdNew = false;
      if (existing) {
        membershipId = existing.id;
        if (existing.acceptedAt == null) {
          // เคยถูกถอนสิทธิ์ไว้ → เปิดคืน (คงบทบาท/สิทธิ์เดิมไว้ ไม่รีเซ็ตให้เสียของ)
          await tx.membership.updateMany({
            where: { id: existing.id, tenantId: input.tenantId },
            data: { acceptedAt: new Date() },
          });
        }
      } else {
        // 🔴 fail-closed: เริ่มจากไม่มีสิทธิ์อะไรเลย แอดมินค่อยเปิดทีละข้อ
        const created = await tx.membership.create({
          data: {
            userId: user.id,
            tenantId: input.tenantId,
            role: "STAFF",
            unitAccess: [],
            permissions: {},
            acceptedAt: new Date(),
          },
        });
        membershipId = created.id;
        createdNew = true;
      }

      // 4) ปิดหนี้ G7 — ผูกทะเบียนพนักงานเข้ากับบัญชีที่ล็อกอินได้
      await tx.hrEmployee.updateMany({
        where: { id: employee.id, tenantId: input.tenantId },
        data: { linkedUserId: user.id },
      });

      return { userId: user.id, membershipId, createdNew, employeeName: employee.name };
    });

    await writeStaffAudit({
      tenantId: input.tenantId,
      actorId: input.actorUserId,
      action: "membership.access.grant",
      targetId: out.membershipId,
      after: { email, employeeId: input.employeeId, role: "STAFF", createdNew: out.createdNew },
    });

    return { ok: true, userId: out.userId, membershipId: out.membershipId };
  } catch (e) {
    if (e instanceof StaffRuleError) return fail(e.reason);
    return fail("บันทึกไม่สำเร็จ ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง");
  }
}

export type UpdateStaffAccessInput = {
  tenantId: string;
  actorUserId: string;
  membershipId: string;
  role?: Role;
  unitAccess?: string[];
  permissions?: PermissionMap;
};

/** แก้บทบาท / สาขาที่เข้าถึงได้ / สิทธิ์รายข้อ ของผู้ใช้งานคนหนึ่ง */
export async function updateStaffAccess(input: UpdateStaffAccessInput): Promise<StaffResult> {
  const actor = await loadActor(input.tenantId, input.actorUserId);
  if (!actor.ok) return actor;

  const target = await prisma.membership.findFirst({
    where: { id: input.membershipId, tenantId: input.tenantId },
  });
  if (!target) return fail("ไม่พบผู้ใช้งานคนนี้ในกิจการนี้ — กรุณารีเฟรชหน้าแล้วลองใหม่");

  // กติกา 3: ห้ามแก้สิทธิ์ตัวเอง (ยกเว้น OWNER) — กันคนตั้งสิทธิ์ยกระดับตัวเองตรง ๆ
  if (target.userId === input.actorUserId && actor.membership.role !== "OWNER") {
    return fail("คุณแก้สิทธิ์ของตัวเองไม่ได้ ให้เจ้าของกิจการเป็นผู้แก้ให้");
  }

  // Json columns → ต้องเป็น Prisma.InputJsonValue (Record<string, unknown> ไม่ผ่าน type ของ Prisma 7)
  const data: { role?: Role; unitAccess?: Prisma.InputJsonValue; permissions?: Prisma.InputJsonValue } = {};

  if (input.role !== undefined && input.role !== target.role) {
    if (!canAssignRole(actor.membership.role, input.role)) {
      return fail(
        `คุณตั้งบทบาท “${ROLE_LABELS[input.role]}” ให้คนอื่นไม่ได้ เพราะสูงกว่าสิทธิ์ของคุณเอง — ให้เจ้าของกิจการเป็นผู้ตั้งแทน`,
      );
    }
    // กติกา 4: OWNER คนสุดท้าย
    if (target.role === "OWNER" && input.role !== "OWNER") {
      if ((await countOtherActiveOwners(input.tenantId, target.userId)) === 0) return fail(LAST_OWNER_REASON);
    }
    data.role = input.role;
  }

  if (input.unitAccess !== undefined) {
    const units = normalizeUnitAccess(input.unitAccess);
    if (!canGrantUnitAccess(actor.ctx, units)) {
      return fail("คุณให้สิทธิ์เข้าถึงสาขาที่ตัวเองยังเข้าไม่ถึงไม่ได้ — ให้เจ้าของกิจการเป็นผู้เพิ่มสาขาให้");
    }
    data.unitAccess = units;
  }

  if (input.permissions !== undefined) {
    const parsed = validatePermissionInput(input.permissions);
    if (!parsed.ok) return fail(parsed.reason);
    const current = (target.permissions ?? {}) as PermissionMap;
    const escalation = checkNoEscalation(actor.ctx, current, parsed.value);
    if (escalation) return escalation;
    data.permissions = mergePermissions(current, parsed.value) as Prisma.InputJsonValue;
  }

  if (Object.keys(data).length === 0) return { ok: true, membershipId: target.id };

  await prisma.membership.updateMany({
    where: { id: target.id, tenantId: input.tenantId },
    data,
  });

  await writeStaffAudit({
    tenantId: input.tenantId,
    actorId: input.actorUserId,
    action: data.role ? "membership.role.changed" : "membership.access.update",
    targetId: target.id,
    before: { role: target.role, unitAccess: target.unitAccess, permissions: target.permissions },
    after: data,
  });

  return { ok: true, membershipId: target.id };
}

export type RevokeStaffAccessInput = { tenantId: string; actorUserId: string; membershipId: string };

/**
 * ถอนสิทธิ์เข้าใช้งาน — **ไม่ลบแถว Membership**
 *
 * วิธีที่เลือก: ตั้ง `acceptedAt = null`
 *   · เป็นฟิลด์เดียวที่มีอยู่แล้วซึ่ง "ทุกทางเข้า" ของระบบเช็คอยู่จริง
 *     (core/context.ts getAuth · mobile/auth.ts · api/mobile/me · chat/meeting/kanban/pages staff list)
 *     ⇒ ถอนแล้วมีผลทันทีทุกทาง ไม่ต้องไล่แก้ callsite ใหม่ทั้งระบบ
 *   · แถวยังอยู่ ⇒ `ChatMessage.senderUserId` / AuditLog ยังหาชื่อคนได้ตามเดิม
 *   ⚖️ ข้อแลกเปลี่ยน: `acceptedAt` เดิมแปลว่า "ตอบรับคำเชิญแล้ว" ⇒ หลังจากนี้ค่า null
 *     มีความหมายทับกัน 2 อย่าง ("ยังไม่ตอบรับ" กับ "ถูกถอนสิทธิ์") แยกไม่ออกจากฟิลด์เดียว
 *     วันนี้ไม่กระทบเพราะระบบไม่มีพิธีเชิญแล้ว (มติ W2) — ถ้าวันหน้าจะทำคำเชิญจริง
 *     ต้องเพิ่มฟิลด์ใหม่ใน core.prisma (แช่แข็งอยู่ในรอบนี้ ⇒ ไม่ทำ)
 */
export async function revokeStaffAccess(input: RevokeStaffAccessInput): Promise<StaffResult> {
  const actor = await loadActor(input.tenantId, input.actorUserId);
  if (!actor.ok) return actor;

  const target = await prisma.membership.findFirst({
    where: { id: input.membershipId, tenantId: input.tenantId },
  });
  if (!target) return fail("ไม่พบผู้ใช้งานคนนี้ในกิจการนี้ — กรุณารีเฟรชหน้าแล้วลองใหม่");

  if (target.userId === input.actorUserId && actor.membership.role !== "OWNER") {
    return fail("คุณถอนสิทธิ์ของตัวเองไม่ได้ ให้เจ้าของกิจการเป็นผู้ทำให้");
  }
  if (target.role === "OWNER" && (await countOtherActiveOwners(input.tenantId, target.userId)) === 0) {
    return fail(LAST_OWNER_REASON);
  }
  if (target.acceptedAt == null) return { ok: true, membershipId: target.id }; // ถอนไปแล้ว

  await prisma.membership.updateMany({
    where: { id: target.id, tenantId: input.tenantId },
    data: { acceptedAt: null },
  });

  await writeStaffAudit({
    tenantId: input.tenantId,
    actorId: input.actorUserId,
    action: "membership.access.revoke",
    targetId: target.id,
    before: { active: true, role: target.role },
    after: { active: false },
  });

  return { ok: true, membershipId: target.id };
}

/** เปิดสิทธิ์คืนให้คนที่เคยถูกถอน (บทบาท/สิทธิ์เดิมยังอยู่ครบ) */
export async function restoreStaffAccess(input: RevokeStaffAccessInput): Promise<StaffResult> {
  const actor = await loadActor(input.tenantId, input.actorUserId);
  if (!actor.ok) return actor;

  const target = await prisma.membership.findFirst({
    where: { id: input.membershipId, tenantId: input.tenantId },
  });
  if (!target) return fail("ไม่พบผู้ใช้งานคนนี้ในกิจการนี้ — กรุณารีเฟรชหน้าแล้วลองใหม่");
  if (target.acceptedAt != null) return { ok: true, membershipId: target.id };

  // เปิดคืนให้ OWNER ได้เฉพาะคนที่ตั้ง OWNER ได้อยู่แล้ว (ไม่งั้นเป็นช่องยกระดับผ่านคนที่ถูกถอน)
  if (!canAssignRole(actor.membership.role, target.role)) {
    return fail(
      `คุณเปิดสิทธิ์คืนให้ “${ROLE_LABELS[target.role]}” ไม่ได้ เพราะสูงกว่าสิทธิ์ของคุณเอง — ให้เจ้าของกิจการเป็นผู้ทำแทน`,
    );
  }

  await prisma.membership.updateMany({
    where: { id: target.id, tenantId: input.tenantId },
    data: { acceptedAt: new Date() },
  });

  await writeStaffAudit({
    tenantId: input.tenantId,
    actorId: input.actorUserId,
    action: "membership.access.restore",
    targetId: target.id,
    after: { active: true, role: target.role },
  });

  return { ok: true, membershipId: target.id };
}
