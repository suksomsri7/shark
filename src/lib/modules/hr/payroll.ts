import { tenantDb } from "@/lib/core/db";
import type { Prisma } from "@prisma/client";
import { postPayrollJV } from "@/lib/modules/account";
import { ssoContribution, monthlyWhtSatang, type WhtDeductions } from "./payroll-rules";

// Payroll ไทย — service ชั้นประกอบ (system-scoped HR) · WO-0036
// สเปคเต็ม docs/sds/modules/future-payroll-tax.md §A · v1 = MONTHLY เท่านั้น
// เงิน = สตางค์ Int · สูตรทั้งหมดมาจาก payroll-rules.ts (สมอง FREEZE)
// ⚠️ create ใส่ tenantId+systemId ตรง ๆ (ไม่พึ่ง tenantDb injection) — ทำงานใน tx ได้
// การลงบัญชี: เรียก gl (ensureAccounting + postManualJV) อย่างเดียว — ไม่แตะ gl.ts/coa.ts

export type Ctx = { tenantId: string; systemId: string };

// mapping ผังบัญชี (6000/1010/2100/2130) ย้ายไปอยู่ account/gl.ts postPayrollJV — hr ไม่ล้วง ledger เอง

// ── โปรไฟล์เงินเดือน (1/พนักงาน) — find→update/create (ห้าม upsert) ──
export type SetSalaryProfileInput = {
  employeeId: string;
  baseSalarySatang: number;
  ssoEligible?: boolean;
  taxId?: string | null;
  deductions?: WhtDeductions;
};

export async function setSalaryProfile(ctx: Ctx, input: SetSalaryProfileInput): Promise<{ id: string }> {
  const deductionJson = {
    spouse: input.deductions?.spouse ?? false,
    children: Math.max(0, input.deductions?.children ?? 0),
  } as Prisma.InputJsonValue;

  const existing = await tenantDb(ctx).hrSalaryProfile.findFirst({
    where: { systemId: ctx.systemId, employeeId: input.employeeId },
    select: { id: true },
  });

  if (existing) {
    await tenantDb(ctx).hrSalaryProfile.update({
      where: { id: existing.id },
      data: {
        baseSalarySatang: input.baseSalarySatang,
        ssoEligible: input.ssoEligible ?? true,
        taxId: input.taxId?.trim() || null,
        personalDeductionJson: deductionJson,
      },
    });
    return { id: existing.id };
  }

  const created = await tenantDb(ctx).hrSalaryProfile.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      employeeId: input.employeeId,
      baseSalarySatang: input.baseSalarySatang,
      ssoEligible: input.ssoEligible ?? true,
      taxId: input.taxId?.trim() || null,
      personalDeductionJson: deductionJson,
    },
    select: { id: true },
  });
  return { id: created.id };
}

export function listSalaryProfiles(ctx: Ctx) {
  return tenantDb(ctx).hrSalaryProfile.findMany({
    where: { systemId: ctx.systemId },
    orderBy: { createdAt: "asc" },
  });
}

// ── คำนวณ 1 พนักงาน (pure ต่อยอดจาก rules) ──
function computeItem(profile: {
  employeeId: string;
  baseSalarySatang: number;
  ssoEligible: boolean;
  personalDeductionJson: Prisma.JsonValue;
}): {
  employeeId: string;
  grossSatang: number;
  ssoBaseSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
  whtSatang: number;
  netSatang: number;
  snapshot: Record<string, unknown>;
} {
  const gross = profile.baseSalarySatang;
  const sso = profile.ssoEligible
    ? ssoContribution(gross)
    : { baseSatang: 0, employeeSatang: 0, employerSatang: 0 };

  const d = (profile.personalDeductionJson ?? {}) as { spouse?: boolean; children?: number };
  const deductions: WhtDeductions = { spouse: !!d.spouse, children: Math.max(0, d.children ?? 0) };

  const ssoEmployeeYearSatang = sso.employeeSatang * 12;
  const wht = monthlyWhtSatang({ monthlySalarySatang: gross, ssoEmployeeYearSatang, deductions });
  const net = gross - sso.employeeSatang - wht;

  return {
    employeeId: profile.employeeId,
    grossSatang: gross,
    ssoBaseSatang: sso.baseSatang,
    ssoEmployeeSatang: sso.employeeSatang,
    ssoEmployerSatang: sso.employerSatang,
    whtSatang: wht,
    netSatang: net,
    snapshot: {
      baseSalarySatang: gross,
      ssoEligible: profile.ssoEligible,
      ssoEmployeeYearSatang,
      deductions,
      computedAt: new Date().toISOString(),
    },
  };
}

// ── สร้างรอบจ่าย (DRAFT) — คำนวณทุกพนักงานที่มีโปรไฟล์ ในธุรกรรมเดียว ──
export async function createPayrollRun(
  ctx: Ctx,
  input: { periodKey: string; payDate: Date },
): Promise<{ id: string }> {
  const periodKey = input.periodKey.trim();

  const dup = await tenantDb(ctx).hrPayrollRun.findFirst({
    where: { systemId: ctx.systemId, periodKey },
    select: { id: true },
  });
  if (dup) throw new Error(`มีรอบจ่ายงวด ${periodKey} อยู่แล้ว — ลบหรือเลือกงวดอื่น`);

  const profiles = await tenantDb(ctx).hrSalaryProfile.findMany({
    where: { systemId: ctx.systemId },
    select: { employeeId: true, baseSalarySatang: true, ssoEligible: true, personalDeductionJson: true },
  });
  if (profiles.length === 0)
    throw new Error("ยังไม่มีโปรไฟล์เงินเดือน — ตั้งเงินเดือนพนักงานก่อนสร้างรอบจ่าย");

  const items = profiles.map(computeItem);
  const totals = items.reduce(
    (t, i) => ({
      gross: t.gross + i.grossSatang,
      ssoEmployee: t.ssoEmployee + i.ssoEmployeeSatang,
      ssoEmployer: t.ssoEmployer + i.ssoEmployerSatang,
      wht: t.wht + i.whtSatang,
      net: t.net + i.netSatang,
    }),
    { gross: 0, ssoEmployee: 0, ssoEmployer: 0, wht: 0, net: 0 },
  );

  const run = await tenantDb(ctx).hrPayrollRun.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      periodKey,
      payDate: input.payDate,
      status: "DRAFT",
      totalGrossSatang: totals.gross,
      totalSsoEmployeeSatang: totals.ssoEmployee,
      totalSsoEmployerSatang: totals.ssoEmployer,
      totalWhtSatang: totals.wht,
      totalNetSatang: totals.net,
      items: {
        create: items.map((i) => ({
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          employeeId: i.employeeId,
          grossSatang: i.grossSatang,
          ssoBaseSatang: i.ssoBaseSatang,
          ssoEmployeeSatang: i.ssoEmployeeSatang,
          ssoEmployerSatang: i.ssoEmployerSatang,
          whtSatang: i.whtSatang,
          netSatang: i.netSatang,
          snapshotJson: i.snapshot as Prisma.InputJsonValue,
        })),
      },
    },
    select: { id: true },
  });
  return { id: run.id };
}

// ── อนุมัติรอบ (DRAFT→APPROVED) + ลงบัญชี ถ้ามีระบบ ACCOUNT ──
export async function approveRun(ctx: Ctx, runId: string): Promise<{ ok: boolean; note: string }> {
  const db = tenantDb(ctx);
  // claim อะตอมมิก DRAFT→APPROVED — กันอนุมัติซ้ำ/ลงบัญชีเบิ้ล
  const claim = await db.hrPayrollRun.updateMany({
    where: { id: runId, status: "DRAFT" },
    data: { status: "APPROVED" },
  });
  if (claim.count === 0) return { ok: false, note: "รอบนี้อนุมัติหรือจ่ายไปแล้ว" };

  const run = await db.hrPayrollRun.findFirst({ where: { id: runId } });
  if (!run) return { ok: false, note: "ไม่พบรอบจ่าย" };

  // ระบบบัญชีของกิจการ (type ACCOUNT) — ไม่มี = อนุมัติเฉย ๆ ไม่ลงบัญชี
  const acct = await db.appSystem.findFirst({ where: { type: "ACCOUNT" }, select: { id: true } });
  if (!acct) {
    await db.hrPayrollRun.update({
      where: { id: runId },
      data: { note: "อนุมัติแล้ว (ยังไม่ได้เปิดระบบบัญชี — ไม่ได้ลงบัญชี)" },
    });
    return { ok: true, note: "อนุมัติแล้ว — ยังไม่ได้เปิดระบบบัญชี จึงไม่ได้ลงบัญชี" };
  }

  try {
    // ลงบัญชีผ่าน account facade เท่านั้น (postPayrollJV มี tx ภายในตัว)
    const { entryId } = await postPayrollJV(
      { tenantId: ctx.tenantId, systemId: acct.id },
      {
        payDate: run.payDate,
        periodKey: run.periodKey,
        grossSatang: run.totalGrossSatang,
        ssoEmployeeSatang: run.totalSsoEmployeeSatang,
        ssoEmployerSatang: run.totalSsoEmployerSatang,
        whtSatang: run.totalWhtSatang,
        netSatang: run.totalNetSatang,
      },
    );
    await db.hrPayrollRun.update({
      where: { id: runId },
      data: { journalEntryId: entryId, note: "อนุมัติและลงบัญชีแล้ว" },
    });
    return { ok: true, note: "อนุมัติและลงบัญชีเรียบร้อย" };
  } catch (e) {
    // ลงบัญชีล้ม → คืนสถานะ DRAFT (เฉพาะที่ยังไม่มี JV) ให้แก้แล้วกดใหม่ได้ — ห้ามค้าง APPROVED ลอย
    await db.hrPayrollRun.updateMany({
      where: { id: runId, status: "APPROVED", journalEntryId: null },
      data: { status: "DRAFT" },
    });
    return { ok: false, note: e instanceof Error ? e.message : "ลงบัญชีไม่สำเร็จ" };
  }
}

// ── จ่ายแล้ว (APPROVED→PAID) ──
export async function markPaid(ctx: Ctx, runId: string): Promise<{ ok: boolean; note: string }> {
  const upd = await tenantDb(ctx).hrPayrollRun.updateMany({
    where: { id: runId, systemId: ctx.systemId, status: "APPROVED" },
    data: { status: "PAID" },
  });
  if (upd.count === 0) return { ok: false, note: "ต้องอนุมัติรอบก่อนจึงจ่ายได้" };
  return { ok: true, note: "บันทึกจ่ายเงินเดือนแล้ว" };
}

// ── reads (UI + สลิป) ──
export function listRuns(ctx: Ctx, take = 50) {
  return tenantDb(ctx).hrPayrollRun.findMany({
    where: { systemId: ctx.systemId },
    orderBy: { periodKey: "desc" },
    take,
    include: {
      items: {
        select: { id: true, employeeId: true, grossSatang: true, netSatang: true },
        orderBy: { id: "asc" },
      },
    },
  });
}

export async function payslipData(ctx: Ctx, runId: string, employeeId: string) {
  const [run, item, employee] = await Promise.all([
    tenantDb(ctx).hrPayrollRun.findFirst({ where: { id: runId, systemId: ctx.systemId } }),
    tenantDb(ctx).hrPayrollItem.findFirst({ where: { runId, employeeId, systemId: ctx.systemId } }),
    tenantDb(ctx).hrEmployee.findFirst({
      where: { id: employeeId, systemId: ctx.systemId },
      select: { id: true, name: true, position: true },
    }),
  ]);
  return { run, item, employee };
}
