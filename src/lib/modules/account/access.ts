// Account — helper สิทธิ์ (can) + audit สำหรับทุก action ที่แตะเงิน/เอกสารมีผล/ผัง/ตั้งค่า
// ใช้ร่วมทุกไฟล์ในโมดูล account (QC5 Gate A-A5: can() + AuditLog ทุกจุดเงิน)
import type { Membership, Tenant } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";

type ActiveAuth = { user: { id: string }; active: Membership & { tenant: Tenant } };

/** MembershipCtx จาก requireTenant() auth */
export function mc(auth: ActiveAuth): MembershipCtx {
  return {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
}

/** ตรวจสิทธิ์ action ของโมดูลบัญชี — โยน ForbiddenError ถ้าไม่ผ่าน (action = "account.doc.issue" ฯลฯ) */
export function assertAccountCan(auth: ActiveAuth, action: string): void {
  assertCan(mc(auth), { module: "account", action });
}

/** เขียน AuditLog (fire-and-forget ปลอดภัย — ไม่ throw ล้ม action หลัก) */
export async function writeAudit(input: {
  tenantId: string;
  actorId?: string | null;
  action: string; // "account.doc.issue" | "account.payment.record" | ...
  targetType?: string; // "AccountDocument" | ...
  targetId?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorType: "USER",
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
      },
    });
  } catch {
    // audit ล้มเหลวห้ามทำ action หลักพัง
  }
}
