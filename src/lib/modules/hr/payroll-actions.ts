"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canViewPayroll, ForbiddenError } from "@/lib/core/rbac";
// ประวัติการแก้ไข (WO Wave6-B): เขียน AuditLog จุดเงินสำคัญของเงินเดือน ผ่าน account facade
// (F2.2 — hr แตะ account ได้เฉพาะผ่าน @/lib/modules/account · edge hr→account อนุญาตแล้ว)
import { writeAudit } from "@/lib/modules/account";
import {
  approveRun,
  createPayrollRun,
  markPaid,
  reverseRun,
  setSalaryProfile,
  type Ctx,
} from "./payroll";

// Actions โมดูล Payroll (system-scoped HR) — assertCan "hr.payroll.<verb>" ทุกจุดที่แตะเงิน
// convention action = "hr.<entity>.<verb>" · OWNER/MANAGER ผ่าน · STAFF ตาม permission
function assertHrCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  const membership = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  assertCan(membership, { module: "hr", action });
  // 🔒 PDPA: ทุก action ที่แตะเงินเดือนต้องผ่านด่านข้อมูลอ่อนไหว (OWNER/hr.payroll.read) — MANAGER ทั่วไปไม่ผ่าน
  if (!canViewPayroll(membership)) throw new ForbiddenError({ module: "hr", action });
}

const revalidate = (systemId: string) => revalidatePath(`/app/sys/${systemId}`);

// ── ตั้งเงินเดือนพนักงาน (บาท → สตางค์) ──
export async function setSalaryProfileAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.payroll.create");
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const baseBaht = Number(String(formData.get("baseSalaryBaht") ?? "").replace(/,/g, "").trim());
  if (!systemId || !employeeId || !Number.isFinite(baseBaht) || baseBaht < 0) return;

  const children = Math.max(0, Math.trunc(Number(formData.get("children") ?? 0)) || 0);
  const spouse = String(formData.get("spouse") ?? "") === "on";
  const ssoEligible = String(formData.get("ssoEligible") ?? "on") !== "off";

  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await setSalaryProfile(ctx, {
    employeeId,
    baseSalarySatang: Math.round(baseBaht * 100),
    ssoEligible,
    taxId: String(formData.get("taxId") ?? "").trim() || null,
    deductions: { spouse, children },
  });
  revalidate(systemId);
}

// ── สร้างรอบจ่าย ──
export async function createPayrollRunAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.payroll.create");
  const systemId = String(formData.get("systemId") ?? "");
  const periodKey = String(formData.get("periodKey") ?? "").trim();
  const payDateStr = String(formData.get("payDate") ?? "").trim();
  if (!systemId || !/^\d{4}-\d{2}$/.test(periodKey) || !payDateStr) return;

  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await createPayrollRun(ctx, { periodKey, payDate: new Date(`${payDateStr}T00:00:00Z`) });
  revalidate(systemId);
}

// ── อนุมัติรอบ (+ลงบัญชี) ──
export async function approvePayrollRunAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.payroll.approve");
  const systemId = String(formData.get("systemId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  if (!systemId || !runId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const res = await approveRun(ctx, runId);
  await writeAudit({
    tenantId: auth.active.tenantId,
    actorId: auth.user.id,
    action: "hr.payroll.approve",
    targetType: "HrPayrollRun",
    targetId: runId,
    after: { ok: res.ok, note: res.note },
  });
  revalidate(systemId);
}

// ── กลับรายการเงินเดือน (APPROVED/PAID → REVERSED + กลับ JV) — WO Wave2-K ──
// สิทธิ์ hr.payroll.approve (คนที่อนุมัติได้ = กลับรายการได้) + ด่าน canViewPayroll ใน assertHrCan
export async function reverseRunAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.payroll.approve");
  const systemId = String(formData.get("systemId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  if (!systemId || !runId) return;
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const res = await reverseRun(ctx, runId, reason);
  await writeAudit({
    tenantId: auth.active.tenantId,
    actorId: auth.user.id,
    action: "hr.payroll.reverse",
    targetType: "HrPayrollRun",
    targetId: runId,
    after: { ok: res.ok, note: res.note, reason: reason ?? null },
  });
  revalidate(systemId);
}

// ── จ่ายแล้ว ──
export async function markPaidAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.payroll.pay");
  const systemId = String(formData.get("systemId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  if (!systemId || !runId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const res = await markPaid(ctx, runId);
  await writeAudit({
    tenantId: auth.active.tenantId,
    actorId: auth.user.id,
    action: "hr.payroll.pay",
    targetType: "HrPayrollRun",
    targetId: runId,
    after: { ok: res.ok, note: res.note },
  });
  revalidate(systemId);
}
