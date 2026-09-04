// permissions-service.ts — อ่าน/เขียน "บทบาทบัญชี + สิทธิ์รายคน + เพดานอนุมัติ" (WO 8.3 · SPEC §9.4 · เฟรม g13)
//
// 🔴 สายบังคับใช้จริง (ห้ามลัด): หน้าจอ → ตารางสิทธิ์ (permissions-matrix.ts) → **`Membership.permissions`**
//    → `evaluate()` → `assertAccountCan()` ⇒ ปิดช่อง "รับ/จ่ายเงิน" แล้วปุ่มหาย **และ** action ถูกปฏิเสธ
//    เพราะเป็นค่าตัวเดียวกัน ไม่ใช่ค่าคนละชุดที่ต้องคอยซิงก์
//
// 🔴 ทำไมเขียนผ่าน `staff/service.updateStaffAccess` ไม่เขียน Membership ตรง ๆ:
//    ตัวนั้นมีด่านความปลอดภัยครบอยู่แล้ว — validate คีย์กับทะเบียนกลาง · ห้ามให้สิทธิ์ที่ตัวเองไม่มี
//    (`checkNoEscalation`) · ห้ามแก้สิทธิ์ตัวเอง · `canAssignRole` · OWNER คนสุดท้าย · เขียน AuditLog
//    ถ้าเขียนเองจะต้องลอกด่านทั้ง 6 ข้อมาไว้อีกที่ = วันหนึ่งจะหลุดข้อใดข้อหนึ่ง
//
// ⚠️ กับดักที่เจอตอนทำ: `updateStaffAccess` ใช้ `mergePermissions(current, next)` ซึ่งเก็บเฉพาะคีย์ที่
//    "ทะเบียนไม่รู้จัก" ของเดิมไว้ ⇒ คีย์ของโมดูลอื่น (pos.* / chat.*) ที่ไม่ได้ส่งไปด้วย **จะหายทันที**
//    ⇒ `buildPermissionMap()` ต้องแนบคีย์เดิมของโมดูลอื่น + ค่าพารามิเตอร์เดิมกลับไปทุกครั้ง (มีด่าน qc คุม)

import type { Prisma, Role } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { ROLE_LABELS, listStaffAccess, updateStaffAccess } from "@/lib/staff/service";
import {
  ACCOUNT_PERMISSION_KEYS,
  APPROVE_CAP_KEY,
  allRoles,
  cellsToPermissionKeys,
  hasAnyAccountPermission,
  nextRoleKey,
  parseCells,
  parseRoleMembers,
  parseRoles,
  permissionKeysToCells,
  summarizeCells,
  type AccountRole,
  type MatrixCells,
} from "./permissions-matrix";

export type Ctx = { tenantId: string; systemId: string };

type Db = ReturnType<typeof tenantDb>;
const dbOf = (ctx: Ctx): Db => tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });

export type PermissionsResult = { ok: true } | { ok: false; reason: string };

const ACCOUNT_KEY_SET = new Set<string>([...ACCOUNT_PERMISSION_KEYS, "account.*"]);

// ─────────────────────────── อ่านทะเบียนบทบาท ───────────────────────────

export type PermissionSettings = { roles: AccountRole[]; members: Record<string, string> };

/** บทบาททั้งหมด (ระบบ 2 + ของร้าน) + ตาราง "ใครอยู่บทบาทไหน" */
export async function getPermissionSettings(ctx: Ctx): Promise<PermissionSettings> {
  const row = await dbOf(ctx).accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: { accountRoles: true, accountRoleMembers: true },
  });
  return {
    roles: allRoles(row?.accountRoles),
    members: parseRoleMembers(row?.accountRoleMembers),
  };
}

async function writeSettings(
  ctx: Ctx,
  data: { accountRoles?: Prisma.InputJsonValue; accountRoleMembers?: Prisma.InputJsonValue },
): Promise<void> {
  const db = dbOf(ctx);
  const existing = await db.accountSettings.findFirst({ where: { systemId: ctx.systemId }, select: { id: true } });
  if (existing) {
    await db.accountSettings.update({ where: { id: existing.id }, data });
    return;
  }
  await db.accountSettings.create({ data: { ...data } as Prisma.AccountSettingsCreateInput });
}

// ─────────────────────────── ผู้ใช้งาน (ตาราง §9.4) ───────────────────────────

export type AccountUserRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  /** บทบาทบัญชีที่กำหนดไว้ (key) — "" = ยังไม่กำหนด */
  accountRoleKey: string;
  accountRoleName: string;
  /** สรุปสิทธิ์บัญชีเป็นภาษาคน */
  summary: string;
  /** เพดานอนุมัติเป็นสตางค์ · null = ไม่จำกัด */
  capSatang: number | null;
  cells: MatrixCells;
  active: boolean;
};

const capOf = (permissions: Record<string, unknown>): number | null => {
  const v = permissions[APPROVE_CAP_KEY];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null;
};

/**
 * ผู้ใช้งานที่เกี่ยวกับบัญชี (§9.4: ตารางจาก /app/settings/staff **กรองเฉพาะที่มีสิทธิ์บัญชี**)
 * — OWNER/MANAGER เข้าเสมอ (มีสิทธิ์ทุกอย่างโดยบทบาท) · STAFF เข้าเมื่อมีคีย์ account.* อย่างน้อย 1 ข้อ
 */
export async function listAccountUsers(ctx: Ctx): Promise<AccountUserRow[]> {
  const [rows, settings] = await Promise.all([listStaffAccess(ctx.tenantId), getPermissionSettings(ctx)]);
  const roleByKey = new Map(settings.roles.map((r) => [r.key, r]));
  const out: AccountUserRow[] = [];
  for (const r of rows) {
    const isPrivileged = r.role === "OWNER" || r.role === "MANAGER";
    if (!isPrivileged && !hasAnyAccountPermission(r.permissions)) continue;
    const assigned = isPrivileged ? r.role : (settings.members[r.membershipId] ?? "");
    const cells = isPrivileged
      ? (roleByKey.get(r.role)?.cells ?? {})
      : permissionKeysToCells(r.permissions as Record<string, unknown>);
    out.push({
      membershipId: r.membershipId,
      userId: r.userId,
      name: r.name,
      email: r.email,
      role: r.role,
      roleLabel: ROLE_LABELS[r.role],
      accountRoleKey: assigned,
      accountRoleName: roleByKey.get(assigned)?.name ?? (isPrivileged ? ROLE_LABELS[r.role] : "กำหนดเอง"),
      summary: isPrivileged ? "ทำได้ทุกอย่างในบัญชี" : summarizeCells(cells),
      capSatang: isPrivileged ? null : capOf(r.permissions as Record<string, unknown>),
      cells,
      active: r.active,
    });
  }
  return out;
}

// ─────────────────────────── เขียนสิทธิ์ลง Membership ───────────────────────────

/**
 * ประกอบชุดสิทธิ์ที่จะส่งให้ `updateStaffAccess`
 *   · คีย์ของโมดูลอื่น + ค่าพารามิเตอร์อื่น = **แนบกลับทั้งหมด** (ไม่งั้นหายเงียบ ตาม mergePermissions)
 *   · คีย์ account.* = แทนที่ด้วยชุดใหม่จากตาราง
 *   · เพดานอนุมัติ = ใส่เมื่อมีค่า (ไม่ใส่ = ไม่จำกัด)
 */
export function buildPermissionMap(
  current: Record<string, unknown>,
  accountKeys: readonly string[],
  capSatang: number | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current)) {
    if (ACCOUNT_KEY_SET.has(k)) continue; // ชุดบัญชีมาจากตารางใหม่ทั้งชุด
    if (k === APPROVE_CAP_KEY) continue; // เพดานมาจากพารามิเตอร์ใหม่
    if (v === true || typeof v === "number") next[k] = v;
  }
  for (const k of accountKeys) next[k] = true;
  if (capSatang !== null && capSatang > 0) next[APPROVE_CAP_KEY] = capSatang;
  return next;
}

async function membershipsOf(ctx: Ctx, membershipIds: string[]) {
  if (membershipIds.length === 0) return [];
  return dbOf(ctx).membership.findMany({
    where: { id: { in: membershipIds }, tenantId: ctx.tenantId },
    select: { id: true, role: true, permissions: true },
  });
}

/** เขียนสิทธิ์ให้ 1 คน (ผ่านด่านของ staff/service) */
async function applyToMembership(
  ctx: Ctx,
  actorUserId: string,
  membershipId: string,
  current: Record<string, unknown>,
  accountKeys: readonly string[],
  capSatang: number | null,
): Promise<PermissionsResult> {
  const res = await updateStaffAccess({
    tenantId: ctx.tenantId,
    actorUserId,
    membershipId,
    permissions: buildPermissionMap(current, accountKeys, capSatang),
  });
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}

// ─────────────────────────── บทบาท ───────────────────────────

export type SaveRoleInput = { key: string; name: string; cells: MatrixCells; capSatang: number | null };

/**
 * บันทึกบทบาท 1 ตัว แล้ว **ลงมือเขียนสิทธิ์จริง** ให้ทุกคนที่อยู่บทบาทนั้น
 * (บทบาทระบบ OWNER/MANAGER แก้ไม่ได้ — ป้ายในเฟรม g13 บอกไว้แล้ว)
 */
export async function saveRole(ctx: Ctx, actorUserId: string, input: SaveRoleInput): Promise<PermissionsResult> {
  const key = input.key.trim();
  if (!key) return { ok: false, reason: "ไม่รู้ว่ากำลังแก้บทบาทไหน กรุณารีเฟรชหน้าแล้วลองใหม่" };
  if (key === "OWNER" || key === "MANAGER")
    return { ok: false, reason: "บทบาทระบบ (เจ้าของ/ผู้จัดการ) แก้ไม่ได้ — ทั้งสองมีสิทธิ์ทุกอย่างอยู่แล้ว" };
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "กรุณาตั้งชื่อบทบาท เช่น พนักงานขาย" };
  if (input.capSatang !== null && (!Number.isInteger(input.capSatang) || input.capSatang < 0))
    return { ok: false, reason: "เพดานอนุมัติต้องเป็นจำนวนเงินที่ไม่ติดลบ" };

  const settings = await getPermissionSettings(ctx);
  const custom = settings.roles.filter((r) => !r.system);
  const idx = custom.findIndex((r) => r.key === key);
  const cells = parseCells(input.cells as unknown);
  const nextRole: AccountRole = { key, name, capSatang: input.capSatang, cells };
  if (idx >= 0) custom[idx] = nextRole;
  else custom.push(nextRole);

  await writeSettings(ctx, { accountRoles: custom as unknown as Prisma.InputJsonValue });

  // ลงมือเขียนสิทธิ์จริงให้ทุกคนในบทบาทนี้ (STAFF เท่านั้น — OWNER/MANAGER ไม่ได้ใช้ permissions)
  const memberIds = Object.entries(settings.members)
    .filter(([, v]) => v === key)
    .map(([k]) => k);
  const members = await membershipsOf(ctx, memberIds);
  const accountKeys = accountKeysOf(cells);
  for (const m of members) {
    if (m.role !== "STAFF") continue;
    const res = await applyToMembership(
      ctx,
      actorUserId,
      m.id,
      (m.permissions ?? {}) as Record<string, unknown>,
      accountKeys,
      input.capSatang,
    );
    if (!res.ok) return res;
  }
  return { ok: true };
}

/** เพิ่มบทบาทใหม่ (ปุ่ม "+ เพิ่มบทบาท" ในเฟรม g13) — คืน key ที่สร้าง */
export async function addRole(
  ctx: Ctx,
  name: string,
  cells: MatrixCells = {},
  capSatang: number | null = null,
): Promise<{ ok: true; key: string } | { ok: false; reason: string }> {
  const clean = name.trim();
  if (!clean) return { ok: false, reason: "กรุณาตั้งชื่อบทบาท เช่น พนักงานขาย" };
  const settings = await getPermissionSettings(ctx);
  if (settings.roles.some((r) => r.name === clean))
    return { ok: false, reason: `มีบทบาทชื่อ “${clean}” อยู่แล้ว — ใช้ชื่ออื่นหรือแก้บทบาทเดิมแทน` };
  const key = nextRoleKey(settings.roles);
  const custom = [...settings.roles.filter((r) => !r.system), { key, name: clean, capSatang, cells: parseCells(cells) }];
  await writeSettings(ctx, { accountRoles: custom as unknown as Prisma.InputJsonValue });
  return { ok: true, key };
}

/** คีย์สิทธิ์ที่ตารางนี้ให้ (ผ่านกฎ "ต้องมี ดู ก่อน" แล้ว) */
export function accountKeysOf(cells: MatrixCells): string[] {
  return cellsToPermissionKeys(cells);
}

// ─────────────────────────── สิทธิ์รายคน ───────────────────────────

/** กำหนดบทบาทบัญชีให้ผู้ใช้ 1 คน (เขียนสิทธิ์จริงตามบทบาทนั้นทันที) */
export async function assignRole(
  ctx: Ctx,
  actorUserId: string,
  membershipId: string,
  roleKey: string,
): Promise<PermissionsResult> {
  const settings = await getPermissionSettings(ctx);
  const role = settings.roles.find((r) => r.key === roleKey && !r.system);
  if (!role) return { ok: false, reason: "ไม่พบบทบาทนี้ — กรุณารีเฟรชหน้าแล้วเลือกใหม่" };
  const [m] = await membershipsOf(ctx, [membershipId]);
  if (!m) return { ok: false, reason: "ไม่พบผู้ใช้งานคนนี้ในกิจการนี้" };
  if (m.role !== "STAFF")
    return {
      ok: false,
      reason: "เจ้าของกิจการและผู้จัดการมีสิทธิ์ทุกอย่างอยู่แล้ว จึงกำหนดบทบาทบัญชีให้ไม่ได้",
    };

  const res = await applyToMembership(
    ctx,
    actorUserId,
    membershipId,
    (m.permissions ?? {}) as Record<string, unknown>,
    accountKeysOf(role.cells),
    role.capSatang,
  );
  if (!res.ok) return res;
  await writeSettings(ctx, {
    accountRoleMembers: { ...settings.members, [membershipId]: roleKey } as unknown as Prisma.InputJsonValue,
  });
  return { ok: true };
}

/** ตั้งเพดานอนุมัติรายคน (บาท → สตางค์ ทำที่ชั้น action) · null = ไม่จำกัด */
export async function setApprovalCap(
  ctx: Ctx,
  actorUserId: string,
  membershipId: string,
  capSatang: number | null,
): Promise<PermissionsResult> {
  if (capSatang !== null && (!Number.isInteger(capSatang) || capSatang < 0))
    return { ok: false, reason: "เพดานอนุมัติต้องเป็นจำนวนเงินที่ไม่ติดลบ" };
  const [m] = await membershipsOf(ctx, [membershipId]);
  if (!m) return { ok: false, reason: "ไม่พบผู้ใช้งานคนนี้ในกิจการนี้" };
  const current = (m.permissions ?? {}) as Record<string, unknown>;
  const accountKeys = ACCOUNT_PERMISSION_KEYS.filter((k) => current[k] === true);
  return applyToMembership(ctx, actorUserId, membershipId, current, accountKeys, capSatang);
}

/** ถอดสิทธิ์บัญชีทั้งหมดของคนหนึ่ง (คนยังอยู่ในร้าน ทำงานระบบอื่นได้เหมือนเดิม) */
export async function revokeAccountAccess(
  ctx: Ctx,
  actorUserId: string,
  membershipId: string,
): Promise<PermissionsResult> {
  const [m] = await membershipsOf(ctx, [membershipId]);
  if (!m) return { ok: false, reason: "ไม่พบผู้ใช้งานคนนี้ในกิจการนี้" };
  if (m.role !== "STAFF")
    return { ok: false, reason: "ถอดสิทธิ์บัญชีของเจ้าของ/ผู้จัดการไม่ได้ — ให้เปลี่ยนบทบาทที่หน้าผู้ใช้งานของร้านแทน" };
  const res = await applyToMembership(ctx, actorUserId, membershipId, (m.permissions ?? {}) as Record<string, unknown>, [], null);
  if (!res.ok) return res;
  const settings = await getPermissionSettings(ctx);
  const members = { ...settings.members };
  delete members[membershipId];
  await writeSettings(ctx, { accountRoleMembers: members as unknown as Prisma.InputJsonValue });
  return { ok: true };
}

// ─────────────────────────── เพดานอนุมัติ (อ่านค่าไปใช้) ───────────────────────────

/** เพดานอนุมัติของ membership นี้ (สตางค์) — undefined = ไม่จำกัด */
export function approvalCapOf(permissions: Record<string, unknown>): number | undefined {
  const v = permissions[APPROVE_CAP_KEY];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : undefined;
}

/** ป้ายไทยของเพดาน ("฿50,000.00" · "ไม่จำกัด") */
export function capLabel(capSatang: number | null | undefined): string {
  if (capSatang === null || capSatang === undefined) return "ไม่จำกัด";
  return `฿${(capSatang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export { parseRoles };
