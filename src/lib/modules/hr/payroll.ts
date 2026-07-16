import { prisma } from "@/lib/core/db";
import type { Prisma } from "@prisma/client";
import { ensureAccounting, postManualJV, type GlCtx } from "@/lib/modules/account/gl";
import { ssoContribution, monthlyWhtSatang, type WhtDeductions } from "./payroll-rules";

// Payroll ไทย — service ชั้นประกอบ (system-scoped HR) · WO-0036
// สเปคเต็ม docs/sds/modules/future-payroll-tax.md §A · v1 = MONTHLY เท่านั้น
// เงิน = สตางค์ Int · สูตรทั้งหมดมาจาก payroll-rules.ts (สมอง FREEZE)
// ⚠️ create ใส่ tenantId+systemId ตรง ๆ (ไม่พึ่ง tenantDb injection) — ทำงานใน tx ได้
// การลงบัญชี: เรียก gl (ensureAccounting + postManualJV) อย่างเดียว — ไม่แตะ gl.ts/coa.ts

export type Ctx = { tenantId: string; systemId: string };

// ── mapping ผังบัญชี (เลือก code ที่มีจริงใน coa.ts CHART) ──
// เหตุผลการเลือก (เขียนไว้ให้ auditor):
//   6000 "เงินเดือนและค่าแรง" (EXPENSE) → Dr เงินเดือน (gross) + Dr เงินสมทบ ปสส.ฝั่งนายจ้าง
//       (ทั้งสองเป็นต้นทุนบุคลากร → ลงบัญชีค่าใช้จ่ายเดียวกัน แยกบรรทัด/หมายเหตุเพื่อ audit)
//   1010 "เงินฝากธนาคาร" (ASSET)     → Cr เงินเดือนสุทธิที่จ่าย (จ่ายผ่านธนาคารตามธรรมเนียม payroll)
//   2100 "เจ้าหนี้การค้า" (LIABILITY) → Cr ประกันสังคมค้างนำส่ง (ลูกจ้าง+นายจ้าง)
//       ⚠️ ผัง SME ไทยมาตรฐานยังไม่มีบัญชี "ประกันสังคมค้างนำส่ง" เฉพาะ → ใช้เจ้าหนี้ทั่วไป (2100)
//         เป็นบัญชีคุมยอดหนี้สินที่ต้องนำส่ง สปส. · แนะนำ Fable เพิ่ม code 2140 ในภายหลัง
//   2130 "ภาษีหัก ณ ที่จ่ายค้างนำส่ง" (LIABILITY) → Cr ภงด.1 ที่หักไว้ (ตรงความหมาย 100%)
// สมดุล: Dr(gross + ssoEmployer) = Cr(net + ssoEmployee + ssoEmployer + wht)
//   เพราะ net = gross − ssoEmployee − wht  →  ทั้งสองฝั่ง = gross + ssoEmployer
const SALARY_EXPENSE_CODE = "6000";
const BANK_CODE = "1010";
const SSO_PAYABLE_CODE = "2100";
const WHT_PAYABLE_CODE = "2130";

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

  const existing = await prisma.hrSalaryProfile.findFirst({
    where: { systemId: ctx.systemId, employeeId: input.employeeId },
    select: { id: true },
  });

  if (existing) {
    await prisma.hrSalaryProfile.update({
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

  const created = await prisma.hrSalaryProfile.create({
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
  return prisma.hrSalaryProfile.findMany({
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

  const dup = await prisma.hrPayrollRun.findFirst({
    where: { systemId: ctx.systemId, periodKey },
    select: { id: true },
  });
  if (dup) throw new Error(`มีรอบจ่ายงวด ${periodKey} อยู่แล้ว — ลบหรือเลือกงวดอื่น`);

  const profiles = await prisma.hrSalaryProfile.findMany({
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

  const run = await prisma.hrPayrollRun.create({
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
  return prisma.$transaction(async (tx) => {
    // updateMany เงื่อนไขสถานะ = กันอนุมัติซ้ำ/ลงบัญชีเบิ้ล (atomic)
    const upd = await tx.hrPayrollRun.updateMany({
      where: { id: runId, systemId: ctx.systemId, status: "DRAFT" },
      data: { status: "APPROVED" },
    });
    if (upd.count === 0) return { ok: false, note: "รอบนี้อนุมัติหรือจ่ายไปแล้ว" };

    const run = await tx.hrPayrollRun.findFirst({
      where: { id: runId, systemId: ctx.systemId },
      select: {
        payDate: true,
        periodKey: true,
        totalGrossSatang: true,
        totalSsoEmployeeSatang: true,
        totalSsoEmployerSatang: true,
        totalWhtSatang: true,
        totalNetSatang: true,
      },
    });
    if (!run) return { ok: false, note: "ไม่พบรอบจ่าย" };

    // ระบบบัญชีของกิจการเดียวกัน (type ACCOUNT) — ไม่มี = อนุมัติเฉย ๆ ไม่ลงบัญชี
    const acct = await tx.appSystem.findFirst({
      where: { tenantId: ctx.tenantId, type: "ACCOUNT" },
      select: { id: true },
    });
    if (!acct) {
      await tx.hrPayrollRun.update({
        where: { id: runId },
        data: { note: "อนุมัติแล้ว (ยังไม่ได้เปิดระบบบัญชี — ไม่ได้ลงบัญชี)" },
      });
      return { ok: true, note: "อนุมัติแล้ว — ยังไม่ได้เปิดระบบบัญชี จึงไม่ได้ลงบัญชี" };
    }

    const glCtx: GlCtx = { tenantId: ctx.tenantId, systemId: acct.id };
    await ensureAccounting(glCtx, tx);

    // resolve ledger id จาก code (หลัง seed ผังบัญชีแล้ว)
    const ledgers = await tx.accountLedger.findMany({
      where: {
        systemId: acct.id,
        code: { in: [SALARY_EXPENSE_CODE, BANK_CODE, SSO_PAYABLE_CODE, WHT_PAYABLE_CODE] },
      },
      select: { id: true, code: true },
    });
    const idByCode = new Map(ledgers.map((l) => [l.code, l.id]));
    const acctId = (code: string): string => {
      const id = idByCode.get(code);
      if (!id) throw new Error(`ไม่พบบัญชี ${code} ในผังบัญชี`);
      return id;
    };

    const ssoPayable = run.totalSsoEmployeeSatang + run.totalSsoEmployerSatang;
    const { entryId } = await postManualJV(
      glCtx,
      {
        date: run.payDate,
        book: "PAYMENTS",
        memo: `เงินเดือนงวด ${run.periodKey}`,
        lines: [
          { accountId: acctId(SALARY_EXPENSE_CODE), debit: run.totalGrossSatang, credit: 0, note: "เงินเดือน" },
          { accountId: acctId(SALARY_EXPENSE_CODE), debit: run.totalSsoEmployerSatang, credit: 0, note: "เงินสมทบประกันสังคม (นายจ้าง)" },
          { accountId: acctId(BANK_CODE), debit: 0, credit: run.totalNetSatang, note: "เงินเดือนสุทธิ (จ่ายผ่านธนาคาร)" },
          { accountId: acctId(SSO_PAYABLE_CODE), debit: 0, credit: ssoPayable, note: "ประกันสังคมค้างนำส่ง (ลูกจ้าง+นายจ้าง)" },
          { accountId: acctId(WHT_PAYABLE_CODE), debit: 0, credit: run.totalWhtSatang, note: "ภาษีหัก ณ ที่จ่ายค้างนำส่ง (ภงด.1)" },
        ],
      },
      tx,
    );

    await tx.hrPayrollRun.update({
      where: { id: runId },
      data: { journalEntryId: entryId, note: "อนุมัติและลงบัญชีแล้ว" },
    });
    return { ok: true, note: "อนุมัติและลงบัญชีเรียบร้อย" };
  });
}

// ── จ่ายแล้ว (APPROVED→PAID) ──
export async function markPaid(ctx: Ctx, runId: string): Promise<{ ok: boolean; note: string }> {
  const upd = await prisma.hrPayrollRun.updateMany({
    where: { id: runId, systemId: ctx.systemId, status: "APPROVED" },
    data: { status: "PAID" },
  });
  if (upd.count === 0) return { ok: false, note: "ต้องอนุมัติรอบก่อนจึงจ่ายได้" };
  return { ok: true, note: "บันทึกจ่ายเงินเดือนแล้ว" };
}

// ── reads (UI + สลิป) ──
export function listRuns(ctx: Ctx, take = 50) {
  return prisma.hrPayrollRun.findMany({
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
    prisma.hrPayrollRun.findFirst({ where: { id: runId, systemId: ctx.systemId } }),
    prisma.hrPayrollItem.findFirst({ where: { runId, employeeId, systemId: ctx.systemId } }),
    prisma.hrEmployee.findFirst({
      where: { id: employeeId, systemId: ctx.systemId },
      select: { id: true, name: true, position: true },
    }),
  ]);
  return { run, item, employee };
}
