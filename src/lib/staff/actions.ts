"use server";

import type { StaffFormState } from "./form-state";

// Server actions ของหน้า "ผู้ใช้งานและสิทธิ์" (/app/settings/staff · WO-CW2)
//
// 🔴 tenantId และ "ตัวตนของผู้สั่ง" มาจาก session (`requireTenant`) เท่านั้น — ห้ามรับจาก FormData
//    (ฟอร์มแก้ได้ในเบราว์เซอร์ ⇒ ถ้าเชื่อ tenantId จากฟอร์ม = ตั้งสิทธิ์ในร้านคนอื่นได้)
// 🔴 ทุก action ผ่าน `assertCan` ก่อนเสมอ — UI ที่ซ่อนปุ่มไม่ใช่ความปลอดภัย
//    (service ยังตรวจซ้ำจาก DB อีกชั้นหนึ่ง: ชั้นนี้กันคนนอก · ชั้นนั้นกันตรรกะยกระดับสิทธิ์)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import {
  PERMISSION_PARAMS,
  isPermissionKey,
  permissionParamToStored,
} from "@/lib/core/permissions";
import {
  STAFF_ADMIN_ACTION,
  grantStaffAccess,
  restoreStaffAccess,
  revokeStaffAccess,
  updateStaffAccess,
} from "./service";
import type { Role } from "@prisma/client";

const STAFF_PATH = "/app/settings/staff";

type Auth = Awaited<ReturnType<typeof requireTenant>>;

function ctxOf(auth: Auth): MembershipCtx {
  return {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
}

// 🔴 ชนิด/ค่าเริ่มต้นของฟอร์มย้ายไป `./form-state` แล้ว — ไฟล์ "use server" export ได้เฉพาะ async function
//    (export object ที่นี่ = `next build` ล้ม โดยที่ typecheck และข้อสอบไม่มีทางจับได้)
export type { StaffFormState } from "./form-state";

const ROLES = new Set<string>(["OWNER", "MANAGER", "STAFF"]);

/** ติ๊กสิทธิ์: `<input type="checkbox" name="perm" value="<key>">` — คีย์ที่ทะเบียนไม่รู้จักถูกทิ้งที่นี่ */
function readPermissions(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const raw of formData.getAll("perm")) {
    const key = String(raw);
    if (isPermissionKey(key)) out[key] = true;
  }
  for (const def of PERMISSION_PARAMS) {
    const raw = String(formData.get(`param:${def.key}`) ?? "").trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    out[def.key] = permissionParamToStored(def, n);
  }
  return out;
}

/** สาขา: `<input type="checkbox" name="unit" value="<unitId>|*">` */
function readUnitAccess(formData: FormData): string[] {
  return formData.getAll("unit").map((v) => String(v));
}

/** ให้พนักงานในทะเบียน HR เข้าใช้งานได้ (ไม่มีพิธีเชิญ — มติ W2) */
export async function grantStaffAccessAction(
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const auth = await requireTenant();
  assertCan(ctxOf(auth), { module: "settings", action: STAFF_ADMIN_ACTION });

  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!employeeId) return { status: "error", message: "กรุณาเลือกพนักงานที่ต้องการให้เข้าใช้งาน" };
  if (!email) return { status: "error", message: "กรุณากรอกอีเมลที่พนักงานคนนี้จะใช้เข้าระบบ" };

  const res = await grantStaffAccess({
    tenantId: auth.active.tenantId,
    actorUserId: auth.user.id,
    employeeId,
    email,
  });
  if (!res.ok) return { status: "error", message: res.reason };

  revalidatePath(STAFF_PATH);
  return {
    status: "ok",
    message: `เปิดสิทธิ์เข้าใช้งานให้เรียบร้อย — แจ้งให้เขาเข้า /login แล้วกรอกอีเมล ${email} เพื่อรับลิงก์เข้าระบบ · ตอนนี้ยังไม่มีสิทธิ์ใช้งานอะไรเลย ให้เปิดสิทธิ์ทีละข้อในหน้าแก้ไข`,
  };
}

/** แก้บทบาท / สาขา / สิทธิ์รายข้อ ของผู้ใช้งานหนึ่งคน */
export async function updateStaffAccessAction(
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const auth = await requireTenant();
  assertCan(ctxOf(auth), { module: "settings", action: STAFF_ADMIN_ACTION });

  const membershipId = String(formData.get("membershipId") ?? "").trim();
  if (!membershipId) return { status: "error", message: "ไม่พบผู้ใช้งานที่ต้องการแก้ไข กรุณากลับไปเลือกใหม่" };
  const roleRaw = String(formData.get("role") ?? "").trim();

  const res = await updateStaffAccess({
    tenantId: auth.active.tenantId,
    actorUserId: auth.user.id,
    membershipId,
    ...(ROLES.has(roleRaw) ? { role: roleRaw as Role } : {}),
    unitAccess: readUnitAccess(formData),
    permissions: readPermissions(formData),
  });
  if (!res.ok) return { status: "error", message: res.reason };

  revalidatePath(STAFF_PATH);
  revalidatePath(`${STAFF_PATH}/${membershipId}`);
  return { status: "ok", message: "บันทึกสิทธิ์เรียบร้อย" };
}

/** ถอนสิทธิ์เข้าใช้งาน — ไม่ลบแถว ประวัติยังอ้างชื่อได้ (ใช้กับ ConfirmDialog) */
export async function revokeStaffAccessAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  assertCan(ctxOf(auth), { module: "settings", action: STAFF_ADMIN_ACTION });

  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const res = await revokeStaffAccess({
    tenantId: auth.active.tenantId,
    actorUserId: auth.user.id,
    membershipId,
  });
  revalidatePath(STAFF_PATH);
  if (!res.ok) throw new Error(res.reason);
}

/** เปิดสิทธิ์คืนให้คนที่เคยถูกถอน */
export async function restoreStaffAccessAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  assertCan(ctxOf(auth), { module: "settings", action: STAFF_ADMIN_ACTION });

  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const res = await restoreStaffAccess({
    tenantId: auth.active.tenantId,
    actorUserId: auth.user.id,
    membershipId,
  });
  revalidatePath(STAFF_PATH);
  if (!res.ok) throw new Error(res.reason);
}
