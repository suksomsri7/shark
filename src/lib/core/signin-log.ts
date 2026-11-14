// signin-log.ts — log การเข้า/ออกระบบ (ACC T4.4 · G7) · ไม่ import next/* (ใช้ได้จาก core/auth.ts และสคริปต์)
import { prisma } from "./db";

/**
 * ACC T4.4 (G7) ▸ log การเข้าระบบ — AuditLog `auth.*` (ระดับผู้ใช้ · tenantId null) · trigger ฐานข้อมูลกันแก้/ลบ (migration acc_t44_ledger_guard)
 *   เขียนล้ม = ไม่ทำให้การเข้าระบบล้ม (กลืน error เหมือน writeAudit) ◂
 */
export async function writeSignInLog(input: { action: "auth.signin" | "auth.signout" | "auth.signin.failed"; userId?: string | null; method?: string; ip?: string | null; userAgent?: string | null; targetId?: string; reason?: string }): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: null,
        actorType: input.userId ? "USER" : "SYSTEM",
        actorId: input.userId ?? null,
        action: input.action,
        targetType: input.targetId ? "AuthEmail" : "User",
        targetId: input.targetId ?? input.userId ?? null,
        ip: input.ip ?? null,
        after: { method: input.method ?? null, userAgent: (input.userAgent ?? "").slice(0, 200) || null, ...(input.reason ? { reason: input.reason } : {}) },
      },
    });
  } catch {
    /* log ล้มห้ามทำให้การเข้าระบบล้ม */
  }
}

