import { notFound } from "next/navigation";
import type { Role } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { canAssignRole, evaluate } from "@/lib/core/rbac";
import { permissionModulesByGroup } from "@/lib/core/permissions";
import {
  listStaffAccess,
  listTenantUnits,
  ROLE_HINTS,
  ROLE_LABELS,
  STAFF_ADMIN_ACTION,
} from "@/lib/staff/service";
import { AccessForm } from "./AccessForm";
import { PageHeader } from "@/components/ui/PageHeader";

// แก้สิทธิ์รายคน — บทบาท · สาขาที่เข้าถึงได้ · ติ๊กสิทธิ์รายข้อ
// ตัวเลือกทั้งหมดคำนวณจาก "สิทธิ์ของคนที่กำลังแก้" เพื่อไม่ให้เห็นช่องที่กดไปก็ถูกปฏิเสธ
// (ด่านจริงอยู่ที่ actions/service เสมอ — ตรงนี้แค่ทำให้หน้าจอไม่หลอกคนใช้)

export default async function StaffAccessPage({
  params,
}: {
  params: Promise<{ membershipId: string }>;
}) {
  const { membershipId } = await params;
  const auth = await requireTenant();
  const ctx = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  const canWrite = evaluate(ctx, { module: "settings", action: STAFF_ADMIN_ACTION });

  const [rows, units] = await Promise.all([listStaffAccess(auth.active.tenantId), listTenantUnits(auth.active.tenantId)]);
  const row = rows.find((r) => r.membershipId === membershipId);
  if (!row) notFound();

  const back = { href: "/app/settings/staff", label: "ผู้ใช้งานและสิทธิ์" };

  if (!canWrite) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title={row.name} back={back} />
        <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">
          หน้านี้ต้องได้รับสิทธิ์ “ให้/แก้/ถอนสิทธิ์การเข้าใช้งานของคนอื่น” ก่อน — ขอให้เจ้าของร้านเปิดสิทธิ์นี้ให้คุณ
        </div>
      </div>
    );
  }

  const isSelf = row.userId === auth.user.id;
  const selfLocked = isSelf && auth.active.role !== "OWNER";
  const activeOwners = rows.filter((r) => r.active && r.role === "OWNER").length;
  const lastOwner = row.role === "OWNER" && activeOwners <= 1;

  // บทบาทที่ "คนกำลังแก้" ตั้งให้ได้จริง (MANAGER ตั้ง OWNER ไม่ได้)
  const roleOptions = (["OWNER", "MANAGER", "STAFF"] as Role[])
    .filter((r) => canAssignRole(auth.active.role, r) || r === row.role)
    .map((r) => ({
      value: r,
      label: ROLE_LABELS[r],
      hint: ROLE_HINTS[r],
      disabled: !canAssignRole(auth.active.role, r) || (lastOwner && r !== "OWNER"),
    }));

  // สาขาที่ให้ได้ = สาขาที่ตัวเองเข้าถึง (OWNER / ["*"] เห็นหมด)
  const canGrantAll = auth.active.role === "OWNER" || ctx.unitAccess.includes("*");
  const unitOptions = units
    .filter((u) => canGrantAll || ctx.unitAccess.includes(u.id))
    .map((u) => ({ id: u.id, name: u.name }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={row.name}
        back={back}
        desc={`${row.email}${row.employee ? ` · พนักงาน: ${row.employee.name}` : ""}${row.active ? "" : " · ถูกถอนสิทธิ์อยู่"}`}
      />

      {selfLocked && (
        <div className="card text-sm text-[color:var(--color-muted)]">
          นี่คือบัญชีของคุณเอง ระบบไม่ให้แก้สิทธิ์ตัวเอง (กันการยกระดับสิทธิ์ตัวเอง) — ให้เจ้าของกิจการเป็นผู้แก้ให้
        </div>
      )}
      {lastOwner && (
        <div className="card text-sm text-[color:var(--color-muted)]">
          คนนี้เป็นเจ้าของกิจการคนสุดท้าย ระบบจึงล็อกบทบาทไว้ — ตั้งอีกคนเป็นเจ้าของกิจการก่อน ถึงจะเปลี่ยนของคนนี้ได้
        </div>
      )}

      <AccessForm
        membershipId={row.membershipId}
        role={row.role}
        roleOptions={roleOptions}
        unitAccess={row.unitAccess}
        unitOptions={unitOptions}
        canGrantAllUnits={canGrantAll}
        permissions={row.permissions}
        groups={permissionModulesByGroup()}
        actorPermissions={ctx.permissions}
        actorIsFullAccess={auth.active.role === "OWNER" || auth.active.role === "MANAGER"}
        disabled={selfLocked}
      />
    </div>
  );
}
