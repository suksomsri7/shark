"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canViewPayroll, ForbiddenError } from "@/lib/core/rbac";
// ประวัติการแก้ไข (WO Wave6-B): เขียน AuditLog จุดเงินสำคัญของเงินเดือน ผ่าน account facade
// (F2.2 — hr แตะ account ได้เฉพาะผ่าน @/lib/modules/account · edge hr→account อนุญาตแล้ว)
import { writeAudit } from "@/lib/modules/account";
import {
  approveRun,
  cancelAdjustment,
  createPayrollRun,
  decideAdjustment,
  markPaid,
  requestAdjustment,
  reverseRun,
  setSalaryProfile,
  type AdjustKind,
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

// ─────────── รายการเพิ่ม/หัก: OT · คอมมิชชั่น · โบนัส · เบี้ยเลี้ยง · หักเงิน · เบิกล่วงหน้า ───────────
// (13 ส.ค. 2026 · เจ้าของสั่งข้อ 5+7) — สิทธิ์แยก 2 ชั้นตามที่เจ้าของสั่ง:
//   ยื่น    = hr.payadjust.request (หัวหน้างาน/ธุรการยื่นได้ ไม่ต้องเห็นเงินเดือนคนอื่น)
//   อนุมัติ = hr.payadjust.approve + ต้องผ่านด่านข้อมูลอ่อนไหว (OWNER หรือ hr.payroll.read)
// 🔴 คนยื่น ≠ คนอนุมัติ (service บังคับอีกชั้นด้วย isOwner)
function assertRequestAdjust(auth: Awaited<ReturnType<typeof requireTenant>>) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "hr", action: "hr.payadjust.request" },
  );
}

export type AdjustState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

export async function requestAdjustmentAction(
  systemId: string,
  _prev: AdjustState,
  formData: FormData,
): Promise<AdjustState> {
  const auth = await requireTenant();
  assertRequestAdjust(auth);
  const employeeId = String(formData.get("employeeId") ?? "");
  const periodKey = String(formData.get("periodKey") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as AdjustKind;
  const hoursRaw = String(formData.get("hours") ?? "").trim();
  const amountRaw = String(formData.get("amountBaht") ?? "").replace(/,/g, "").trim();
  if (!employeeId || !periodKey) return { status: "error", message: "เลือกพนักงานและงวดก่อน" };
  const hours = hoursRaw ? Number(hoursRaw) : undefined;
  const amountBaht = amountRaw ? Number(amountRaw) : undefined;
  if (hours !== undefined && !Number.isFinite(hours)) return { status: "error", message: "ชั่วโมงไม่ถูกต้อง" };
  if (amountBaht !== undefined && !Number.isFinite(amountBaht)) return { status: "error", message: "จำนวนเงินไม่ถูกต้อง" };

  const res = await requestAdjustment(
    { tenantId: auth.active.tenantId, systemId },
    {
      employeeId,
      periodKey,
      kind,
      ...(amountBaht !== undefined ? { amountSatang: Math.round(amountBaht * 100) } : {}),
      ...(hours !== undefined ? { hours } : {}),
      note: String(formData.get("note") ?? ""),
      requestedById: auth.active.userId,
    },
  );
  if (!res.ok) return { status: "error", message: res.reason ?? "ยื่นไม่ได้" };
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  return { status: "ok", message: `ยื่นแล้ว ${((res.amountSatang ?? 0) / 100).toLocaleString("th-TH")} บาท — รออนุมัติ` };
}

export async function decideAdjustmentAction(formData: FormData) {
  const auth = await requireTenant();
  // อนุมัติ = สิทธิ์แตะเงินเดือน (ผ่านด่าน PDPA เหมือน action เงินเดือนอื่น)
  assertHrCan(auth, "hr.payadjust.approve");
  const systemId = String(formData.get("systemId") ?? "");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!systemId || !id || (status !== "APPROVED" && status !== "REJECTED")) return;
  const res = await decideAdjustment({ tenantId: auth.active.tenantId, systemId }, id, status, {
    userId: auth.active.userId,
    isOwner: auth.active.role === "OWNER",
  });
  if (res.ok) {
    await writeAudit({
      tenantId: auth.active.tenantId,
      actorId: auth.user.id,
      action: status === "APPROVED" ? "hr.payadjust.approve" : "hr.payadjust.reject",
      targetType: "HrPayAdjustment",
      targetId: id,
    });
  }
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
}

export async function cancelAdjustmentAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.payadjust.approve");
  const systemId = String(formData.get("systemId") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!systemId || !id) return;
  await cancelAdjustment({ tenantId: auth.active.tenantId, systemId }, id);
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
}
