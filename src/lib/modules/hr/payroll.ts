import { tenantDb } from "@/lib/core/db";
import type { Prisma } from "@prisma/client";
import { postPayrollJV, reverseEntry } from "@/lib/modules/account";
import {
  ssoContribution,
  monthlyWhtSatang,
  otHourlyRateSatang,
  otAmountSatang,
  sumAdjustments,
  payableGrossSatang,
  isAddKind,
  type WhtDeductions,
} from "./payroll-rules";

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

// ─────────── รายการเพิ่ม/หักในงวด: OT · คอมมิชชั่น · โบนัส · เบี้ยเลี้ยง · หักเงิน · เบิกล่วงหน้า ───────────
// (13 ส.ค. 2026 · เจ้าของสั่งข้อ 5+7) — 🔴 คนยื่น ≠ คนอนุมัติ (ยื่นแล้วรออนุมัติเสมอ ไม่เข้าเงินเดือนเอง)
export type AdjustKind = "OT" | "COMMISSION" | "BONUS" | "ALLOWANCE" | "DEDUCTION" | "ADVANCE";
const ADJUST_KINDS: AdjustKind[] = ["OT", "COMMISSION", "BONUS", "ALLOWANCE", "DEDUCTION", "ADVANCE"];
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** อัตรา OT ต่อชั่วโมงของพนักงานคนนี้ (ตั้งเองในโปรไฟล์ หรือคิดจากเงินเดือน ÷30 ÷8 ×1.5) */
export async function otRateFor(ctx: Ctx, employeeId: string): Promise<number> {
  const p = await tenantDb(ctx).hrSalaryProfile.findFirst({
    where: { systemId: ctx.systemId, employeeId },
    select: { baseSalarySatang: true, otHourlyRateSatang: true },
  });
  if (!p) return 0;
  return p.otHourlyRateSatang ?? otHourlyRateSatang(p.baseSalarySatang);
}

export type RequestAdjustInput = {
  employeeId: string;
  periodKey: string; // "2026-08"
  kind: AdjustKind;
  amountSatang?: number; // ระบุยอดตรง ๆ
  hours?: number; // หรือระบุชั่วโมง (เฉพาะ OT — คิดยอดจากอัตราให้)
  note?: string | null;
  requestedById?: string | null;
};

/** ยื่นรายการ — สถานะเริ่มต้น PENDING เสมอ (แม้ผู้ยื่นจะเป็นเจ้าของ) เพื่อให้มีร่องรอยการอนุมัติ */
export async function requestAdjustment(
  ctx: Ctx,
  input: RequestAdjustInput,
): Promise<{ ok: boolean; reason?: string; id?: string; amountSatang?: number }> {
  if (!ADJUST_KINDS.includes(input.kind)) return { ok: false, reason: "ชนิดรายการไม่ถูกต้อง" };
  if (!PERIOD_RE.test(input.periodKey.trim())) return { ok: false, reason: "งวดต้องเป็นรูปแบบ YYYY-MM" };
  const emp = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: input.employeeId } });
  if (!emp) return { ok: false, reason: "ไม่พบพนักงาน" };

  let amount = Math.round(input.amountSatang ?? 0);
  let rate: number | null = null;
  if (input.kind === "OT" && input.hours && input.hours > 0) {
    rate = await otRateFor(ctx, input.employeeId);
    if (rate <= 0) return { ok: false, reason: "ตั้งเงินเดือนของพนักงานคนนี้ก่อน จึงคิดค่า OT ได้" };
    amount = otAmountSatang(input.hours, rate);
  }
  if (amount <= 0) return { ok: false, reason: "ระบุจำนวนเงิน (หรือชั่วโมง OT) ให้มากกว่า 0" };

  const row = await tenantDb(ctx).hrPayAdjustment.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      employeeId: input.employeeId,
      periodKey: input.periodKey.trim(),
      kind: input.kind,
      amountSatang: amount,
      hours: input.kind === "OT" ? (input.hours ?? null) : null,
      rateSatang: rate,
      note: input.note?.trim() || null,
      requestedById: input.requestedById ?? null,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id, amountSatang: amount };
}

/**
 * อนุมัติ/ปฏิเสธรายการ — 🔴 กติกา 4 ตา: คนที่ไม่ใช่เจ้าของกิจการ อนุมัติรายการที่ตัวเองยื่นไม่ได้
 * (ผู้เรียกส่ง isOwner มาจากชั้น action — service ไม่รู้จัก session)
 */
export async function decideAdjustment(
  ctx: Ctx,
  id: string,
  status: "APPROVED" | "REJECTED",
  decider: { userId?: string | null; isOwner: boolean },
): Promise<{ ok: boolean; reason?: string }> {
  const row = await tenantDb(ctx).hrPayAdjustment.findFirst({ where: { id } });
  if (!row) return { ok: false, reason: "ไม่พบรายการ" };
  if (row.status !== "PENDING") return { ok: false, reason: "รายการนี้ตัดสินไปแล้ว" };
  if (row.runId) return { ok: false, reason: "รายการนี้เข้ารอบจ่ายแล้ว" };
  if (!decider.isOwner && decider.userId && row.requestedById === decider.userId) {
    return { ok: false, reason: "อนุมัติรายการที่ตัวเองยื่นไม่ได้ — ให้เจ้าของหรือผู้มีสิทธิ์อนุมัติแทน" };
  }
  const claim = await tenantDb(ctx).hrPayAdjustment.updateMany({
    where: { id, status: "PENDING" },
    data: { status, decidedById: decider.userId ?? null, decidedAt: new Date() },
  });
  if (claim.count === 0) return { ok: false, reason: "รายการนี้ตัดสินไปแล้ว" };
  return { ok: true };
}

export async function cancelAdjustment(ctx: Ctx, id: string): Promise<{ ok: boolean; reason?: string }> {
  const row = await tenantDb(ctx).hrPayAdjustment.findFirst({ where: { id } });
  if (!row) return { ok: false, reason: "ไม่พบรายการ" };
  if (row.runId) return { ok: false, reason: "รายการนี้เข้ารอบจ่ายแล้ว ลบไม่ได้ (ใช้กลับรายการรอบจ่ายแทน)" };
  await tenantDb(ctx).hrPayAdjustment.deleteMany({ where: { id } });
  return { ok: true };
}

export function listAdjustments(ctx: Ctx, periodKey?: string, take = 200) {
  return tenantDb(ctx).hrPayAdjustment.findMany({
    where: { systemId: ctx.systemId, ...(periodKey ? { periodKey } : {}) },
    orderBy: [{ createdAt: "desc" }],
    take,
  });
}

// ── คำนวณ 1 พนักงาน (pure ต่อยอดจาก rules) ──
function computeItem(profile: {
  employeeId: string;
  baseSalarySatang: number;
  ssoEligible: boolean;
  personalDeductionJson: Prisma.JsonValue;
  addSatang?: number;
  deductSatang?: number;
  adjustDetail?: { kind: string; amountSatang: number; note: string | null }[];
}): {
  employeeId: string;
  grossSatang: number;
  ssoBaseSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
  whtSatang: number;
  netSatang: number;
  addSatang: number;
  deductSatang: number;
  snapshot: Record<string, unknown>;
} {
  // 🔴 ฐาน ปสส./ภงด.1 = เงินเดือนประจำ (ไม่รวมรายการผันแปร) — ดูเหตุผลใน payroll-rules.payableGrossSatang
  const addSatang = Math.max(0, Math.round(profile.addSatang ?? 0));
  const deductSatang = Math.max(0, Math.round(profile.deductSatang ?? 0));
  const base = profile.baseSalarySatang;
  const gross = payableGrossSatang({ baseSalarySatang: base, addSatang, deductSatang });
  const sso = profile.ssoEligible
    ? ssoContribution(base)
    : { baseSatang: 0, employeeSatang: 0, employerSatang: 0 };

  const d = (profile.personalDeductionJson ?? {}) as { spouse?: boolean; children?: number };
  const deductions: WhtDeductions = { spouse: !!d.spouse, children: Math.max(0, d.children ?? 0) };

  const ssoEmployeeYearSatang = sso.employeeSatang * 12;
  const wht = monthlyWhtSatang({ monthlySalarySatang: base, ssoEmployeeYearSatang, deductions });
  const net = gross - sso.employeeSatang - wht;

  return {
    employeeId: profile.employeeId,
    grossSatang: gross,
    ssoBaseSatang: sso.baseSatang,
    ssoEmployeeSatang: sso.employeeSatang,
    ssoEmployerSatang: sso.employerSatang,
    whtSatang: wht,
    netSatang: net,
    addSatang,
    deductSatang,
    snapshot: {
      baseSalarySatang: base,
      addSatang,
      deductSatang,
      adjustments: profile.adjustDetail ?? [],
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

  // รายการเพิ่ม/หักที่ "อนุมัติแล้ว" ของงวดนี้ และยังไม่ถูกดึงเข้ารอบไหน (กันนับซ้ำข้ามงวด)
  const adjustments = await tenantDb(ctx).hrPayAdjustment.findMany({
    where: { systemId: ctx.systemId, periodKey, status: "APPROVED", runId: null },
    select: { id: true, employeeId: true, kind: true, amountSatang: true, note: true },
  });
  const adjByEmp = new Map<string, typeof adjustments>();
  for (const a of adjustments) adjByEmp.set(a.employeeId, [...(adjByEmp.get(a.employeeId) ?? []), a]);

  const items = profiles.map((p) => {
    const rows = adjByEmp.get(p.employeeId) ?? [];
    const { addSatang, deductSatang } = sumAdjustments(rows);
    return computeItem({
      ...p,
      addSatang,
      deductSatang,
      adjustDetail: rows.map((r) => ({ kind: r.kind, amountSatang: r.amountSatang, note: r.note })),
    });
  });
  const totals = items.reduce(
    (t, i) => ({
      gross: t.gross + i.grossSatang,
      ssoEmployee: t.ssoEmployee + i.ssoEmployeeSatang,
      ssoEmployer: t.ssoEmployer + i.ssoEmployerSatang,
      wht: t.wht + i.whtSatang,
      net: t.net + i.netSatang,
      add: t.add + i.addSatang,
      deduct: t.deduct + i.deductSatang,
    }),
    { gross: 0, ssoEmployee: 0, ssoEmployer: 0, wht: 0, net: 0, add: 0, deduct: 0 },
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
      totalAddSatang: totals.add,
      totalDeductSatang: totals.deduct,
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
          addSatang: i.addSatang,
          deductSatang: i.deductSatang,
          snapshotJson: i.snapshot as Prisma.InputJsonValue,
        })),
      },
    },
    select: { id: true },
  });
  // ผูกรายการที่ถูกดึงเข้ารอบนี้ → งวดหน้าไม่นับซ้ำ และลบไม่ได้แล้ว
  if (adjustments.length > 0) {
    await tenantDb(ctx).hrPayAdjustment.updateMany({
      where: { id: { in: adjustments.map((a) => a.id) } },
      data: { runId: run.id },
    });
  }
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

// ── กลับรายการเงินเดือน (APPROVED/PAID → REVERSED) + กลับ JV — WO Wave2-K ──
// immutable ledger: กลับ JV ด้วย reversal เท่านั้น (reverseEntry สร้าง entry ตรงข้าม + mark เดิม REVERSED)
// DRAFT/ไม่มี JV → ok:false (ไม่มีอะไรกลับ — ลบร่างได้เลย)
export async function reverseRun(
  ctx: Ctx,
  runId: string,
  reason?: string,
): Promise<{ ok: boolean; note: string }> {
  const db = tenantDb(ctx);
  const run = await db.hrPayrollRun.findFirst({ where: { id: runId, systemId: ctx.systemId } });
  if (!run) return { ok: false, note: "ไม่พบรอบจ่าย" };
  if (run.status === "REVERSED") return { ok: false, note: "รอบนี้กลับรายการไปแล้ว" };
  if (!run.journalEntryId)
    return { ok: false, note: "รอบนี้ยังไม่ได้ลงบัญชี — ไม่มีรายการให้กลับ (ลบร่างได้เลย)" };

  const prevStatus = run.status; // APPROVED | PAID (คืนสถานะถ้ากลับ JV ล้ม)
  // claim อะตอมมิก → REVERSED — กันกลับซ้ำ/แข่งกัน (เฉพาะที่มี JV และยัง APPROVED/PAID)
  const claim = await db.hrPayrollRun.updateMany({
    where: {
      id: runId,
      systemId: ctx.systemId,
      status: { in: ["APPROVED", "PAID"] },
      journalEntryId: { not: null },
    },
    data: { status: "REVERSED" },
  });
  if (claim.count === 0) return { ok: false, note: "รอบนี้กลับรายการไปแล้ว หรือสถานะเปลี่ยน" };

  const acct = await db.appSystem.findFirst({ where: { type: "ACCOUNT" }, select: { id: true } });
  const why = reason?.trim() || `กลับรายการเงินเดือนงวด ${run.periodKey}`;
  try {
    // กลับ JV ผ่าน account facade (idempotent ต่อ entry — กลับซ้ำไม่เบิ้ล)
    if (acct) await reverseEntry({ tenantId: ctx.tenantId, systemId: acct.id }, run.journalEntryId, why);
    await db.hrPayrollRun.update({ where: { id: runId }, data: { note: `กลับรายการแล้ว: ${why}` } });
    return { ok: true, note: "กลับรายการเงินเดือนเรียบร้อย — ลง JV กลับรายการในบัญชีแล้ว" };
  } catch (e) {
    // กลับ JV ล้ม → คืนสถานะเดิม (ยังไม่กลับจริง) ให้กดใหม่ได้ — ห้ามค้าง REVERSED ลอย
    await db.hrPayrollRun.updateMany({
      where: { id: runId, status: "REVERSED" },
      data: { status: prevStatus },
    });
    return { ok: false, note: e instanceof Error ? e.message : "กลับรายการไม่สำเร็จ" };
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
