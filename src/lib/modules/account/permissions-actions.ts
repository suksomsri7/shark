"use server";

// permissions-actions.ts — server actions ของหน้า "ตั้งค่า › สิทธิ์ผู้ใช้งาน" (WO 8.3 · §9.4 · เฟรม g13)
//
// ด่าน 2 ชั้นทุกตัว:
//   1) `assertAccountCan(auth, "account.settings.manage")` — เข้ามาถึงหน้านี้ได้ไหม
//   2) ด่านของ `staff/service.updateStaffAccess` — แจกสิทธิ์ให้คนอื่นได้ไหม (ต้องมี `settings.staff.write`
//      · ห้ามแจกสิทธิ์ที่ตัวเองไม่มี · ห้ามแก้ของตัวเอง · OWNER คนสุดท้าย) ⇒ ข้อความปฏิเสธเป็นภาษาคน
//
// 🔴 ชั้นที่ 2 ตั้งใจให้เข้มกว่าหน้าจอ: คนที่ตั้งค่าบัญชีได้ ไม่ได้แปลว่าแจกสิทธิ์ให้คนอื่นได้

import { revalidatePath } from "next/cache";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit } from "./access";
import { bahtFieldToSatang, parseCells, type MatrixCells, MATRIX_COLUMNS, MATRIX_GROUPS } from "./permissions-matrix";
import {
  addRole,
  assignRole,
  revokeAccountAccess,
  saveRole,
  setApprovalCap,
  type PermissionsResult,
} from "./permissions-service";

const PATH = (systemId: string) => `/app/sys/${systemId}/account/settings/permissions`;

async function gate(systemId: string) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.settings.manage");
  return { tenantId, systemId, userId };
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** ฟอร์ม matrix ส่งช่องเป็น `cell:<group>:<col>` = "on" */
function cellsFromForm(fd: FormData): MatrixCells {
  const raw: Record<string, Record<string, boolean>> = {};
  for (const g of MATRIX_GROUPS) {
    const row: Record<string, boolean> = {};
    for (const c of MATRIX_COLUMNS) if (fd.get(`cell:${g.key}:${c.key}`) !== null) row[c.key] = true;
    raw[g.key] = row;
  }
  return parseCells(raw);
}

/** บันทึกตารางสิทธิ์ของบทบาทหนึ่ง (+ เพดานอนุมัติของบทบาทนั้น) */
export async function saveRoleAction(fd: FormData): Promise<PermissionsResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const cap = bahtFieldToSatang(s(fd, "capBaht"));
  if (cap === "invalid") return { ok: false, reason: "เพดานอนุมัติต้องเป็นจำนวนเงินที่ไม่ติดลบ (เว้นว่าง = ไม่จำกัด)" };
  const key = s(fd, "roleKey");
  const res = await saveRole({ tenantId, systemId }, userId, {
    key,
    name: s(fd, "roleName"),
    cells: cellsFromForm(fd),
    capSatang: cap,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "AccountRole",
    targetId: key,
    after: res.ok ? { savedRole: key, capSatang: cap } : { error: res.reason },
  });
  if (res.ok) revalidatePath(PATH(systemId));
  return res;
}

/** เพิ่มบทบาทใหม่ (ปุ่ม "+ เพิ่มบทบาท") */
export async function addRoleAction(fd: FormData): Promise<{ ok: true; key: string } | { ok: false; reason: string }> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const res = await addRole({ tenantId, systemId }, s(fd, "roleName"));
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "AccountRole",
    targetId: res.ok ? res.key : "",
    after: res.ok ? { addedRole: res.key } : { error: res.reason },
  });
  if (res.ok) revalidatePath(PATH(systemId));
  return res;
}

/** กำหนดบทบาทบัญชีให้ผู้ใช้ 1 คน */
export async function assignRoleAction(fd: FormData): Promise<PermissionsResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const membershipId = s(fd, "membershipId");
  const res = await assignRole({ tenantId, systemId }, userId, membershipId, s(fd, "roleKey"));
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "Membership",
    targetId: membershipId,
    after: res.ok ? { accountRole: s(fd, "roleKey") } : { error: res.reason },
  });
  if (res.ok) revalidatePath(PATH(systemId));
  return res;
}

/** ตั้งเพดานอนุมัติรายคน (บาท) */
export async function setCapAction(fd: FormData): Promise<PermissionsResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const cap = bahtFieldToSatang(s(fd, "capBaht"));
  if (cap === "invalid") return { ok: false, reason: "เพดานอนุมัติต้องเป็นจำนวนเงินที่ไม่ติดลบ (เว้นว่าง = ไม่จำกัด)" };
  const membershipId = s(fd, "membershipId");
  const res = await setApprovalCap({ tenantId, systemId }, userId, membershipId, cap);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "Membership",
    targetId: membershipId,
    after: res.ok ? { capSatang: cap } : { error: res.reason },
  });
  if (res.ok) revalidatePath(PATH(systemId));
  return res;
}

/** ถอดสิทธิ์บัญชีของผู้ใช้ 1 คน */
export async function revokeAction(fd: FormData): Promise<PermissionsResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const membershipId = s(fd, "membershipId");
  const res = await revokeAccountAccess({ tenantId, systemId }, userId, membershipId);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "Membership",
    targetId: membershipId,
    after: res.ok ? { revokedAccountAccess: true } : { error: res.reason },
  });
  if (res.ok) revalidatePath(PATH(systemId));
  return res;
}
