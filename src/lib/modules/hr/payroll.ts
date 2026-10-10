import { tenantDb } from "@/lib/core/db";
import type { Prisma } from "@prisma/client";
// CRM C3.3 ▸ `hr.payroll.paid` ยิงใน tx เดียวกับการปิดรอบ (markPaid) ◂
import { emitOutbox } from "@/lib/core/outbox";
import { postPayrollJV, reverseEntry } from "@/lib/modules/account";
import { writeAudit } from "@/lib/core/audit"; // HF-HR-0 ▸ รอบ 5c (F1): ประวัติการลบรายการเงิน (ตัวเดียวกับ hr/service.ts) ◂
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
const OT_HOURS_MAX_ALL = 744; // HF-HR-0 ▸ รอบ 5b (H5) — ค่าเดียวกับ privacy.OT_HOURS_MAX (privacy import ไฟล์นี้ ⇒ ประกาศซ้ำแทนการ import วน) ◂

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
  // CRM C3.3 ▸ ลิงก์อ่อนไปยัง CrmCommission (ไม่มี FK — HR ไม่พึ่ง CRM) · partial unique ⇒ 1 คอมมิชชัน = 1 รายการเท่านั้น ◂
  crmCommissionId?: string | null;
};

/** ยื่นรายการ — สถานะเริ่มต้น PENDING เสมอ (แม้ผู้ยื่นจะเป็นเจ้าของ) เพื่อให้มีร่องรอยการอนุมัติ */
export async function requestAdjustment(
  ctx: Ctx,
  input: RequestAdjustInput,
  // CRM C3.3 ▸ `tx` = ผู้เรียก (คอมมิชชัน CRM) ถือล็อกแถวคอมมิชชันอยู่ ⇒ เขียนใน tx เดียวกัน (ห้ามเปิด connection ที่สองใต้ล็อก) ◂
  opts: { tx?: Prisma.TransactionClient } = {},
): Promise<{ ok: boolean; reason?: string; id?: string; amountSatang?: number; code?: string }> {
  if (!ADJUST_KINDS.includes(input.kind)) return { ok: false, reason: "ชนิดรายการไม่ถูกต้อง" };
  if (!PERIOD_RE.test(input.periodKey.trim())) return { ok: false, reason: "งวดต้องเป็นรูปแบบ YYYY-MM" };
  // CRM C3.3 ▸ รายการจากคอมมิชชัน CRM — ทางแยกของตัวเอง (ทางเดิมข้างล่างไม่เปลี่ยนแม้แต่บรรทัดเดียว)
  const crmCommissionId = typeof input.crmCommissionId === "string" && input.crmCommissionId.trim() ? input.crmCommissionId.trim() : null;
  if (crmCommissionId || opts.tx) return requestCommissionAdjustment(ctx, input, crmCommissionId, opts.tx);
  // ◂ CRM C3.3
  // HF-HR-0 ▸ รอบ 5b (H5): ชั่วโมง OT ต่อรายการไม่เกิน 744 (31 วัน × 24 ชม. = privacy.OT_HOURS_MAX) สำหรับทุกคน — เกินแล้วเคยได้ error ดิบ
  //   (ยอดล้นช่อง Int) · ผู้ดูเงินเดือนเห็นข้อความนี้ · ผู้ไม่ดูได้คำปฏิเสธกลางจาก adjustmentReplyForViewer (byHours) ตามเดิม ◂
  if (input.kind === "OT" && typeof input.hours === "number" && input.hours > OT_HOURS_MAX_ALL) {
    return { ok: false, reason: `ชั่วโมง OT ต่อรายการต้องไม่เกิน ${OT_HOURS_MAX_ALL} ชม. (31 วัน × 24 ชม.) — แยกเป็นหลายรายการแทน` };
  }
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
): Promise<{ ok: boolean; reason?: string; movedFrom?: string; movedTo?: string }> {
  const row = await tenantDb(ctx).hrPayAdjustment.findFirst({ where: { id } });
  if (!row) return { ok: false, reason: "ไม่พบรายการ" };
  if (row.status !== "PENDING") return { ok: false, reason: "รายการนี้ตัดสินไปแล้ว" };
  if (row.runId) return { ok: false, reason: "รายการนี้เข้ารอบจ่ายแล้ว" };
  if (!decider.isOwner && decider.userId && row.requestedById === decider.userId) {
    return { ok: false, reason: "อนุมัติรายการที่ตัวเองยื่นไม่ได้ — ให้เจ้าของหรือผู้มีสิทธิ์อนุมัติแทน" };
  }
  // HF-HR-0 ▸ รอบ 5b (H1): "เงินของใคร" ไม่ใช่แค่ "ใครยื่น" — ผู้อนุมัติที่ไม่ใช่เจ้าของร้าน อนุมัติรายการของแถวพนักงานที่ผูกกับบัญชีตัวเองไม่ได้
  //   (แม้คนอื่นเป็นผู้ยื่น) · ไม่รู้ตัวผู้อนุมัติ = ตรวจไม่ได้ ⇒ ไม่อนุมัติ · ปฏิเสธ (REJECTED) ยังทำได้ — ไม่มีใครเสียประโยชน์ ◂
  // HF-HR-0 ▸ รอบ 5c (F1): ปฏิเสธ (REJECTED) รายการที่ "หักเงิน" (ไม่ใช่ isAddKind: DEDUCTION · ADVANCE · ชนิดที่ไม่รู้จัก) ของแถวตัวเอง
  //   = เพิ่มเงินให้ตัวเอง ⇒ กติกาเดียวกับอนุมัติ · ปฏิเสธรายการเพิ่มเงิน (OT · COMMISSION · BONUS · ALLOWANCE) ของตัวเองยังทำได้ ◂
  if (!decider.isOwner && (status === "APPROVED" || !isAddKind(row.kind))) {
    const uid = typeof decider.userId === "string" ? decider.userId.trim() : "";
    if (!uid) return { ok: false, reason: status === "APPROVED" ? "ระบบไม่ทราบผู้อนุมัติรายการนี้ จึงยังอนุมัติไม่ได้ — กรุณาอนุมัติในหน้าเงินเดือน" : "ระบบไม่ทราบผู้ตัดสินรายการนี้ จึงยังปฏิเสธไม่ได้ — กรุณาตัดสินในหน้าเงินเดือน" };
    const subject = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: row.employeeId }, select: { linkedUserId: true } });
    if (subject?.linkedUserId === uid) return { ok: false, reason: status === "APPROVED" ? "อนุมัติรายการของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านตัดสิน" : "ปฏิเสธรายการหักเงินของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านตัดสิน" };
  }
  // CRM C3.3-fix H5 ▸ รายการคอมมิชชัน CRM ที่งวดของมัน "มีรอบจ่ายแล้ว" (รอบถูกสร้างก่อนอนุมัติ) — อนุมัติในงวดเดิม = ค้างถาวร
  //   (createPayrollRun ดึงรายการของงวดได้ครั้งเดียว) ⇒ ย้ายไปงวดถัดไปที่ยังไม่มีรอบ **ในคำสั่งเดียวกับการอนุมัติ** (guard: PENDING ·
  //   runId IS NULL · งวดเดิม) · รายการที่ไม่ผูกคอมมิชชันใช้ทางเดิม ◂
  let moveTo: string | null = null;
  if (status === "APPROVED" && row.crmCommissionId) {
    const runs = new Set((await tenantDb(ctx).hrPayrollRun.findMany({ where: { systemId: ctx.systemId }, select: { periodKey: true }, take: 2_000 })).map((r) => r.periodKey));
    if (runs.has(row.periodKey)) {
      moveTo = nextRunlessPeriod(row.periodKey, runs);
      if (!moveTo) return { ok: false, reason: `งวด ${row.periodKey} มีรอบจ่ายแล้ว และหางวดถัดไปที่ยังไม่มีรอบจ่ายไม่พบ — ตรวจรอบจ่ายเงินเดือน` };
    }
  }
  const claim = await tenantDb(ctx).hrPayAdjustment.updateMany({
    where: { id, status: "PENDING", runId: null, ...(moveTo ? { periodKey: row.periodKey } : {}) },
    data: { status, decidedById: decider.userId ?? null, decidedAt: new Date(), ...(moveTo ? { periodKey: moveTo } : {}) },
  });
  if (claim.count === 0) return { ok: false, reason: "รายการนี้ตัดสินไปแล้ว" };
  // รีวิวเงิน note (c): ผู้เรียก (payroll-actions) ลง audit การย้ายงวด from → to จาก movedFrom/movedTo
  return moveTo ? { ok: true, reason: `งวด ${row.periodKey} มีรอบจ่ายแล้ว — อนุมัติและย้ายรายการไปงวด ${moveTo}`, movedFrom: row.periodKey, movedTo: moveTo } : { ok: true };
}

/** CRM C3.3-fix H5 ▸ เดือนแรก > `periodKey` ที่ยังไม่มีรอบจ่าย (ค้นไม่เกิน 240 เดือน) · ไม่พบ = null */
function nextRunlessPeriod(periodKey: string, runs: Set<string>): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]);
  for (let i = 0; i < 240; i += 1) {
    mo += 1;
    if (mo > 12) { mo = 1; y += 1; }
    const k = `${y}-${String(mo).padStart(2, "0")}`;
    if (!runs.has(k)) return k;
  }
  return null;
}

// HF-HR-0 ▸ รอบ 5c (F1): `actor` = ผู้ใช้ที่กดลบ (หน้าเงินเดือน — สิทธิ์ hr.payadjust.approve เดียวกับอนุมัติ ตรวจที่ action) ·
//   ไม่ส่ง = ทางระบบ (hr facade / CRM — ไม่มีผู้ใช้) ทำงานเหมือนเดิม · ผู้ใช้ที่ไม่ใช่เจ้าของร้าน ลบรายการของแถวพนักงานที่ผูกกับบัญชีตัวเองไม่ได้
//   (ยกเว้นผู้ยื่นยกเลิกคำขอเพิ่มเงินที่ยังรอของตัวเอง) · ไม่รู้ตัวผู้ใช้ = ตรวจไม่ได้ ⇒ ไม่ลบ · ลบด้วยเงื่อนไขสถานะที่อ่านมา + ประวัติทุกครั้ง ◂
export async function cancelAdjustment(ctx: Ctx, id: string, actor?: { userId?: string | null; isOwner: boolean }): Promise<{ ok: boolean; reason?: string }> {
  const row = await tenantDb(ctx).hrPayAdjustment.findFirst({ where: { id } });
  if (!row) return { ok: false, reason: "ไม่พบรายการ" };
  if (row.runId) return { ok: false, reason: "รายการนี้เข้ารอบจ่ายแล้ว ลบไม่ได้ (ใช้กลับรายการรอบจ่ายแทน)" };
  const uid = typeof actor?.userId === "string" ? actor.userId.trim() : "";
  if (actor && !actor.isOwner) {
    if (!uid) return { ok: false, reason: "ระบบไม่ทราบผู้ลบรายการนี้ จึงยังลบไม่ได้ — กรุณาลบในหน้าเงินเดือน" };
    const subject = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: row.employeeId }, select: { linkedUserId: true } });
    const ownPendingAdd = row.status === "PENDING" && row.requestedById === uid && isAddKind(row.kind);
    if (subject?.linkedUserId === uid && !ownPendingAdd) return { ok: false, reason: "ลบรายการของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านดำเนินการ" };
  }
  const del = await tenantDb(ctx).hrPayAdjustment.deleteMany({ where: { id, runId: null, status: row.status } });
  if (del.count === 0) return { ok: false, reason: "รายการนี้เปลี่ยนไปแล้ว กรุณาเปิดดูใหม่" };
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: actor ? "USER" : "SYSTEM",
    actorId: actor ? uid || null : null,
    action: "hr.payadjust.delete",
    targetType: "HrPayAdjustment",
    targetId: id,
    before: { employeeId: row.employeeId, kind: row.kind, amountSatang: row.amountSatang, status: row.status, periodKey: row.periodKey, requestedById: row.requestedById, decidedById: row.decidedById },
  });
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
// CRM C3.3-fix (race ถอน ↔ สร้างรอบ · 27 ก.ย.) ▸ ทั้งฟังก์ชันอยู่ใน **ธุรกรรมเดียว**: ล็อกงวด (advisory) → อ่านรายการ APPROVED ที่ยังไม่เข้ารอบ
//   ด้วย `SELECT … FOR UPDATE` → คำนวณ → สร้างรอบ → ผูก runId ด้วย UPDATE เดียวที่ guard `runId IS NULL AND status = APPROVED` (ต้องผูกได้ครบ
//   ทุกแถวที่ล็อกไว้ ไม่งั้นย้อนทั้งรอบ) ⇒ ใครถึงแถวก่อนชนะ: ถอน/ย้ายงวดของ CRM ที่มาก่อน = แถวหายหรือไม่ตรงเงื่อนไข ⇒ ไม่ถูกนับเข้ารอบ ·
//   สร้างรอบที่มาก่อน = ถอน/ย้ายของ CRM รอล็อกแล้วเห็น runId ⇒ ไม่ถอน (กลายเป็น DEDUCTION) · เดิมอ่าน → สร้างรอบ → ผูก เป็นคนละคำสั่ง
//   ⇒ รายการที่ถูกถอนตรงกลางยังอยู่ในยอดของรอบ แต่ไม่มีใครหักคืน (จ่ายเกิน — probe `.qc-shots/c33fix/probe-race-before-slow.log`) ◂
export async function createPayrollRun(
  ctx: Ctx,
  input: { periodKey: string; payDate: Date },
): Promise<{ id: string }> {
  const periodKey = input.periodKey.trim();
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };

  return tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Prisma.TransactionClient;
    // สองการสร้างรอบของงวดเดียวกันต่อคิวกัน (unique (systemId, periodKey) เป็นด่านสุดท้าย — ล็อกนี้ทำให้ได้ข้อความไทยแทน error ของฐาน)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:payroll:run:${ctx.systemId}:${periodKey}`}, 0))`;
    const dup = await tx.hrPayrollRun.findFirst({ where: { ...scope, periodKey }, select: { id: true } });
    if (dup) throw new Error(`มีรอบจ่ายงวด ${periodKey} อยู่แล้ว — ลบหรือเลือกงวดอื่น`);

    const profiles = await tx.hrSalaryProfile.findMany({
      where: scope,
      select: { employeeId: true, baseSalarySatang: true, ssoEligible: true, personalDeductionJson: true },
    });
    if (profiles.length === 0)
      throw new Error("ยังไม่มีโปรไฟล์เงินเดือน — ตั้งเงินเดือนพนักงานก่อนสร้างรอบจ่าย");
    // CRM C3.3-fix H4 ▸ เฉพาะรายการของพนักงานที่ "มีแถวในรอบนี้" (มีโปรไฟล์เงินเดือน) — รายการของคนที่ไม่มีโปรไฟล์ไม่ได้ถูกจ่าย
    //   ผูก runId ให้ = ถือว่าจ่ายแล้วทั้งที่ไม่มีใครได้เงิน (และคอมมิชชัน CRM จะกลายเป็น PAID) ⇒ ปล่อยไว้ให้รอบถัดไป/ตัวกวาด ◂
    const paidEmployees = new Set(profiles.map((p) => p.employeeId));

    // รายการเพิ่ม/หักที่ "อนุมัติแล้ว" ของงวดนี้ และยังไม่ถูกดึงเข้ารอบไหน (กันนับซ้ำข้ามงวด) — ล็อกแถว (race fix ข้างบน)
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "HrPayAdjustment"
      WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} AND "periodKey" = ${periodKey}
        AND "status"::text = 'APPROVED' AND "runId" IS NULL
      ORDER BY "id" FOR UPDATE`;
    const lockedIds = locked.map((r) => r.id).filter(Boolean);
    const adjustments = lockedIds.length
      ? (await tx.hrPayAdjustment.findMany({
          where: { ...scope, id: { in: lockedIds } },
          select: { id: true, employeeId: true, kind: true, amountSatang: true, note: true },
          orderBy: { id: "asc" },
        })).filter((a) => paidEmployees.has(a.employeeId))
      : [];
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
      (t2, i) => ({
        gross: t2.gross + i.grossSatang,
        ssoEmployee: t2.ssoEmployee + i.ssoEmployeeSatang,
        ssoEmployer: t2.ssoEmployer + i.ssoEmployerSatang,
        wht: t2.wht + i.whtSatang,
        net: t2.net + i.netSatang,
        add: t2.add + i.addSatang,
        deduct: t2.deduct + i.deductSatang,
      }),
      { gross: 0, ssoEmployee: 0, ssoEmployer: 0, wht: 0, net: 0, add: 0, deduct: 0 },
    );

    const run = await tx.hrPayrollRun.create({
      data: {
        ...scope,
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
            ...scope,
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
    // ผูกรายการที่ถูกดึงเข้ารอบนี้ → งวดหน้าไม่นับซ้ำ และลบไม่ได้แล้ว — UPDATE เดียว guard runId IS NULL + APPROVED · ต้องครบทุกแถว
    if (adjustments.length > 0) {
      const bound = await tx.hrPayAdjustment.updateMany({
        where: { ...scope, id: { in: adjustments.map((a) => a.id) }, runId: null, status: "APPROVED" },
        data: { runId: run.id },
      });
      if (bound.count !== adjustments.length) throw new Error(`รายการปรับเงินของงวด ${periodKey} ถูกเปลี่ยนระหว่างสร้างรอบ — ลองสร้างรอบใหม่อีกครั้ง`);
    }
    return { id: run.id };
  }, { maxWait: 20_000, timeout: 60_000 });
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
// CRM C3.3 ▸ AUDIT-CLASS X4: การเปลี่ยน APPROVED→PAID ที่มี guard + event `hr.payroll.paid` อยู่ใน **ธุรกรรมเดียวกัน**
//   ⇒ ยิงเฉพาะเมื่อคำสั่งนี้เป็นคนเปลี่ยนสถานะจริง (count = 1) · ล้มหลังเปลี่ยนสถานะ = ย้อนทั้งสถานะและ event (ไม่มี event ลอย/หาย)
//   key `hr.payroll.paid#<runId>` (R-C.8) · payload = { runId, periodKey } เท่านั้น (X8 — ไม่มีชื่อ/ยอดรายคน) · systemId = ระบบ HR
//   ผู้บริโภค: คอมมิชชัน CRM (`crm-bridges/commissions.ts#onPayrollPaid`) — APPROVED → PAID ของรายการที่อยู่ในรอบนี้
//   🔴 tenantDb().$transaction (ไม่ import prisma ดิบ — ratchet F5.1 เต็มเพดาน) · tx ของ client ที่ $extends ส่งเข้า emitOutbox
//      ได้ทางชนิดเท่านั้น (runtime มี outboxEvent ครบ และ OutboxEvent อยู่ในทะเบียน scope แบบ tenant)
export async function markPaid(ctx: Ctx, runId: string): Promise<{ ok: boolean; note: string }> {
  const paid = await tenantDb(ctx).$transaction(async (tx) => {
    const upd = await tx.hrPayrollRun.updateMany({
      where: { id: runId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "APPROVED" },
      data: { status: "PAID" },
    });
    if (upd.count === 0) return false;
    const run = await tx.hrPayrollRun.findFirst({ where: { id: runId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { periodKey: true } });
    await emitOutbox(tx as unknown as Prisma.TransactionClient, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      type: "hr.payroll.paid",
      idempotencyKey: `hr.payroll.paid#${runId}`,
      payload: { runId, periodKey: run?.periodKey ?? null },
    });
    return true;
  });
  if (!paid) return { ok: false, note: "ต้องอนุมัติรอบก่อนจึงจ่ายได้" };
  return { ok: true, note: "บันทึกจ่ายเงินเดือนแล้ว" };
}
// ◂ CRM C3.3

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

// CRM C3.3 ▸ ทางเข้าของคอมมิชชัน CRM (ใบ C3.3 · addendum ข้อ 8 · 10) — อ่าน/เขียนผ่านไฟล์นี้เท่านั้น (CRM ห้ามแตะตาราง HR ตรง)
//   • requestCommissionAdjustment — ยื่นรายการ COMMISSION/DEDUCTION ที่ผูก `crmCommissionId` · 🔴 partial unique
//     `HrPayAdjustment("crmCommissionId") WHERE NOT NULL` เป็นตัวตัดสิน: ใส่ด้วย `ON CONFLICT DO NOTHING` (createManyAndReturn +
//     skipDuplicates) ⇒ ครั้งที่สองของคอมมิชชันเดียวกัน = ok:false (ไม่ throw · ไม่ทำให้ tx ของผู้เรียก abort)
//   • payrollEmployeeOfUser — พนักงาน **ที่ยังทำงานอยู่** ที่ผูกกับผู้ใช้ (MASTER-PLAN C0.3: `employeeOfUser` คืนคนที่ลาออกด้วย)
//   • payrollRunPeriods · adjustmentOfCommission · adjustmentsOfRun — ตัวอ่านของงวด/ลิงก์/รอบจ่าย (hr.payroll.paid)
//   AUDIT-CLASS X1: ทุกคำสั่งผูก tenantId (+ systemId ของ HR) · AUDIT-CLASS X8: `note` มาจากผู้เรียกเป็นข้อความกลาง (ไม่มีชื่อลูกค้า)
const HR_INT_MAX = 2_147_483_647;
type HrDb = Prisma.TransactionClient;

async function requestCommissionAdjustment(
  ctx: Ctx,
  input: RequestAdjustInput,
  crmCommissionId: string | null,
  tx: HrDb | undefined,
): Promise<{ ok: boolean; reason?: string; id?: string; amountSatang?: number; code?: string }> {
  if (input.kind === "OT") return { ok: false, reason: "รายการ OT ยื่นผ่านหน้าจอ HR เท่านั้น" };
  const amount = Math.round(input.amountSatang ?? 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: "ระบุจำนวนเงินให้มากกว่า 0" };
  if (amount > HR_INT_MAX) return { ok: false, reason: "ยอดเงินสูงเกินกว่าที่ระบบเงินเดือนรับได้ต่อรายการ — แยกเป็นหลายรายการแทน" };
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const data = {
    ...scope,
    employeeId: input.employeeId,
    periodKey: input.periodKey.trim(),
    kind: input.kind,
    amountSatang: amount,
    note: input.note?.trim() || null,
    requestedById: input.requestedById ?? null,
    crmCommissionId,
  };
  const write = async (db: HrDb) => {
    const emp = await db.hrEmployee.findFirst({ where: { id: input.employeeId, ...scope }, select: { id: true } });
    if (!emp) return { ok: false, reason: "ไม่พบพนักงาน" };
    // มติผู้คุมงาน S4: งวดที่มีรอบจ่ายแล้ว (ทุกสถานะ) จะไม่ถูกดึงอีก ⇒ ห้ามยื่นเข้าไป (ผู้เรียกเลื่อนไปเดือนถัดไปที่ว่าง)
    const closed = await db.hrPayrollRun.findFirst({ where: { ...scope, periodKey: data.periodKey }, select: { id: true } });
    if (closed) return { ok: false, code: "PERIOD_CLOSED", reason: `งวด ${data.periodKey} มีรอบจ่ายเงินเดือนแล้ว — ยื่นเข้างวดถัดไปแทน` };
    const made = await db.hrPayAdjustment.createManyAndReturn({ data: [data], skipDuplicates: true, select: { id: true } });
    if (made.length === 0) return { ok: false, reason: "คอมมิชชันรายการนี้ถูกส่งเข้างวดเงินเดือนไปแล้ว (มีได้รายการเดียว)" };
    return { ok: true, id: made[0]!.id, amountSatang: amount };
  };
  if (tx) return write(tx);
  return tenantDb(ctx).$transaction(async (t) => write(t as unknown as HrDb));
}

/**
 * พนักงานที่ยังทำงานอยู่ (active) ที่ผูกกับผู้ใช้คนนี้ **และมีโปรไฟล์เงินเดือน** — ระบบ HR ที่เก่าที่สุดก่อน · ไม่มี/ลาออกแล้ว/ไม่มีโปรไฟล์ = null
 * (ห้ามจ่ายผิดคน · C3.3-fix H4: พนักงานที่ไม่มีโปรไฟล์ไม่มีแถวในรอบจ่าย ⇒ รายการของเขาไม่มีวันถูกจ่าย — ต้องรอจนกว่า HR ตั้งเงินเดือน)
 */
export async function payrollEmployeeOfUser(tenantId: string, userId: string): Promise<{ employeeId: string; systemId: string } | null> {
  const uid = (userId ?? "").trim();
  if (!tenantId || !uid) return null;
  const systems = await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "HR" }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 });
  for (const s of systems) {
    const db = tenantDb({ tenantId, systemId: s.id });
    const rows = await db.hrEmployee.findMany({
      where: { linkedUserId: uid, active: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, systemId: true },
      take: 50,
    });
    if (rows.length === 0) continue;
    const withProfile = new Set((await db.hrSalaryProfile.findMany({ where: { systemId: s.id, employeeId: { in: rows.map((r) => r.id) } }, select: { employeeId: true }, take: 50 })).map((p) => p.employeeId));
    const row = rows.find((r) => withProfile.has(r.id));
    if (row) return { employeeId: row.id, systemId: row.systemId };
  }
  return null;
}

/** งวดที่มีรอบจ่ายแล้ว (ทุกสถานะ — `createPayrollRun` ดึงรายการของงวดได้ครั้งเดียว) ของระบบ HR นี้ · `tx` = อ่านใต้ล็อกของผู้เรียก */
export async function payrollRunPeriods(ctx: Ctx, opts: { tx?: HrDb } = {}): Promise<string[]> {
  const where = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const rows = opts.tx
    ? await opts.tx.hrPayrollRun.findMany({ where, select: { periodKey: true }, take: 2_000 })
    : await tenantDb(ctx).hrPayrollRun.findMany({ where, select: { periodKey: true }, take: 2_000 });
  return rows.map((r) => r.periodKey);
}

export type CommissionAdjustmentRef = {
  id: string;
  systemId: string;
  employeeId: string;
  periodKey: string;
  kind: string;
  status: string;
  runId: string | null;
  amountSatang: number;
  note: string | null;
  requestedById: string | null;
  crmCommissionId: string | null;
};

/** รายการปรับเงินที่ผูกกับคอมมิชชันนี้ (มีได้รายการเดียว) — ผูกร้านเสมอ · `tx` = อ่านใต้ล็อกของผู้เรียก */
export async function adjustmentOfCommission(tenantId: string, crmCommissionId: string, opts: { tx?: HrDb } = {}): Promise<CommissionAdjustmentRef | null> {
  if (!tenantId || !crmCommissionId) return null;
  const where = { tenantId, crmCommissionId };
  const select = { id: true, systemId: true, employeeId: true, periodKey: true, kind: true, status: true, runId: true, amountSatang: true, note: true, requestedById: true, crmCommissionId: true } as const;
  if (opts.tx) {
    const row = await opts.tx.hrPayAdjustment.findFirst({ where, select });
    return row ? { ...row, kind: String(row.kind), status: String(row.status) } : null;
  }
  // HrPayAdjustment เป็น system-scoped ⇒ tenantDb ต้องมี systemId — ไล่ระบบ HR ของร้าน (มีไม่กี่ระบบ)
  const systems = await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "HR" }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 });
  for (const s of systems) {
    const row = await tenantDb({ tenantId, systemId: s.id }).hrPayAdjustment.findFirst({ where, select });
    if (row) return { ...row, kind: String(row.kind), status: String(row.status) };
  }
  return null;
}

/**
 * รายการที่ผูกคอมมิชชัน CRM ในรอบจ่ายนี้ + สถานะของรอบ (ผู้บริโภค `hr.payroll.paid`)
 * C3.3-fix H4: เฉพาะรายการของพนักงานที่ **มีแถวเงินเดือน (HrPayrollItem) ในรอบนี้** — ผูก runId แต่ไม่มีแถว = ไม่มีใครได้เงิน ⇒ ห้ามนับว่าจ่ายแล้ว
 */
export async function adjustmentsOfRun(ctx: Ctx, runId: string): Promise<{ status: string | null; items: { id: string; crmCommissionId: string }[] }> {
  const run = await tenantDb(ctx).hrPayrollRun.findFirst({ where: { id: runId, systemId: ctx.systemId }, select: { status: true } });
  if (!run) return { status: null, items: [] };
  const rows = await tenantDb(ctx).hrPayAdjustment.findMany({
    where: { systemId: ctx.systemId, runId, crmCommissionId: { not: null } },
    select: { id: true, crmCommissionId: true, employeeId: true },
    take: 10_000,
  });
  const paid = rows.length
    ? new Set((await tenantDb(ctx).hrPayrollItem.findMany({ where: { systemId: ctx.systemId, runId, employeeId: { in: [...new Set(rows.map((r) => r.employeeId))] } }, select: { employeeId: true }, take: 10_000 })).map((i) => i.employeeId))
    : new Set<string>();
  return { status: String(run.status), items: rows.flatMap((r) => (r.crmCommissionId && paid.has(r.employeeId) ? [{ id: r.id, crmCommissionId: r.crmCommissionId }] : [])) };
}

/**
 * ถอนรายการของคอมมิชชันที่ **ยังไม่ถูกจ่าย** (มติผู้คุมงาน B3 · S1 · S4) — ลบแบบมี guard: ต้องเป็นรายการของคอมมิชชันนี้ ·
 * ยังไม่เข้ารอบจ่าย (`runId` null) · สถานะอยู่ในชุดที่ผู้เรียกระบุ (ปริยาย PENDING เท่านั้น — HR ยังไม่อนุมัติ)
 * คืน true = ถอนแล้ว · false = HR ตัดสิน/ดึงเข้ารอบไปแล้วระหว่างนั้น (ผู้เรียกต้องหักคืนแทน)
 */
export async function withdrawCommissionAdjustment(
  ctx: Ctx,
  input: { adjustmentId: string; crmCommissionId: string; statuses?: ("PENDING" | "APPROVED")[] },
  opts: { tx?: HrDb } = {},
): Promise<boolean> {
  const where = {
    id: input.adjustmentId,
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    crmCommissionId: input.crmCommissionId,
    runId: null,
    status: { in: input.statuses && input.statuses.length ? input.statuses : (["PENDING"] as ("PENDING" | "APPROVED")[]) },
  };
  // CRM C3.3-fix (race ถอน ↔ สร้างรอบ) ▸ อ่านแถวใหม่ใต้ `FOR UPDATE` (ล็อกเดียวกับที่ createPayrollRun ถือตอนดึงรายการเข้ารอบ) แล้วลบด้วย guard
  //   เดียวกัน (runId IS NULL + สถานะ) ⇒ รอบที่ commit ก่อน = เห็น runId แล้วคืน false (ผู้เรียกหักคืนแทน) · ถอนก่อน = รอบไม่เห็นแถวนี้ ◂
  const run = async (db: HrDb) => {
    const cur = await db.$queryRaw<{ runId: string | null; status: string }[]>`
      SELECT "runId", "status"::text AS "status" FROM "HrPayAdjustment"
      WHERE "id" = ${input.adjustmentId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} AND "crmCommissionId" = ${input.crmCommissionId}
      FOR UPDATE`;
    if (cur.length !== 1 || cur[0]!.runId !== null || !where.status.in.includes(cur[0]!.status as "PENDING" | "APPROVED")) return false;
    const n = await db.hrPayAdjustment.deleteMany({ where });
    return n.count === 1;
  };
  if (opts.tx) return run(opts.tx);
  return tenantDb(ctx).$transaction(async (t) => run(t as unknown as HrDb));
}

/**
 * ย้ายงวดของรายการคอมมิชชันที่ค้าง (รีวิวรอบ 2 S-c) — แก้ `periodKey` ในที่เดิม ด้วย guard คำสั่งเดียว:
 * รายการของคอมมิชชันนี้ · ยังไม่เข้ารอบ (`runId IS NULL`) · สถานะ PENDING หรือ APPROVED (C3.3-fix H5: รายการที่อนุมัติหลังรอบของงวดถูกสร้าง
 * ค้างถาวรเหมือนกัน — งวดเดิมมีรอบแล้ว createPayrollRun ของงวดนั้นไม่มีวันเกิดซ้ำ ⇒ ย้ายไม่เสี่ยงจ่ายซ้ำ) · งวดปลายทางต้องยังไม่มีรอบ
 */
export async function moveCommissionAdjustmentPeriod(
  ctx: Ctx,
  input: { adjustmentId: string; crmCommissionId: string; periodKey: string },
  opts: { tx?: HrDb } = {},
): Promise<boolean> {
  if (!PERIOD_RE.test(input.periodKey)) return false;
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const db = opts.tx;
  const closed = db
    ? await db.hrPayrollRun.findFirst({ where: { ...scope, periodKey: input.periodKey }, select: { id: true } })
    : await tenantDb(ctx).hrPayrollRun.findFirst({ where: { ...scope, periodKey: input.periodKey }, select: { id: true } });
  if (closed) return false;
  const where = { id: input.adjustmentId, ...scope, crmCommissionId: input.crmCommissionId, runId: null, status: { in: ["PENDING", "APPROVED"] as ("PENDING" | "APPROVED")[] } };
  const n = db ? await db.hrPayAdjustment.updateMany({ where, data: { periodKey: input.periodKey } }) : await tenantDb(ctx).hrPayAdjustment.updateMany({ where, data: { periodKey: input.periodKey } });
  return n.count === 1;
}

/** ผู้ใช้กลุ่มนี้คนไหนมีพนักงาน **active ที่มีโปรไฟล์เงินเดือน** ผูกไว้ (ตัวกรองคิว "ส่ง payroll" — มติผู้คุมงาน S3 · C3.3-fix H4 ตรงกับ payrollEmployeeOfUser) */
export async function activeLinkedUserIds(tenantId: string, userIds: string[]): Promise<string[]> {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 1_000);
  if (!tenantId || ids.length === 0) return [];
  const systems = await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "HR" }, select: { id: true }, take: 50 });
  const out = new Set<string>();
  for (const sys of systems) {
    const db = tenantDb({ tenantId, systemId: sys.id });
    const rows = await db.hrEmployee.findMany({ where: { linkedUserId: { in: ids }, active: true }, select: { id: true, linkedUserId: true }, take: 1_000 });
    if (rows.length === 0) continue;
    const withProfile = new Set((await db.hrSalaryProfile.findMany({ where: { systemId: sys.id, employeeId: { in: rows.map((r) => r.id) } }, select: { employeeId: true }, take: 1_000 })).map((p) => p.employeeId));
    for (const r of rows) if (r.linkedUserId && withProfile.has(r.id)) out.add(r.linkedUserId);
  }
  return [...out];
}

/**
 * รายการของคอมมิชชันที่ "ค้าง" (มติผู้คุมงาน S4): ยังไม่เข้ารอบ แต่งวดของมันมีรอบจ่ายแล้ว ⇒ จะไม่มีวันถูกดึง
 * (รอบถูกสร้างหลังจากยื่น) — ตัวกวาดของ CRM ย้ายงวดในที่เดิมไปเดือนถัดไปที่ว่าง · C3.3-fix H5: PENDING **และ APPROVED**
 * (อนุมัติหลังรอบถูกสร้าง หรือพนักงานยังไม่มีโปรไฟล์ตอนสร้างรอบ ⇒ ไม่ถูกผูก)
 */
export async function strandedCommissionAdjustments(tenantId: string, limit = 100): Promise<CommissionAdjustmentRef[]> {
  if (!tenantId) return [];
  const systems = await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "HR" }, select: { id: true }, take: 50 });
  const out: CommissionAdjustmentRef[] = [];
  for (const sys of systems) {
    const db = tenantDb({ tenantId, systemId: sys.id });
    const runs = (await db.hrPayrollRun.findMany({ where: { systemId: sys.id }, select: { periodKey: true }, take: 2_000 })).map((r) => r.periodKey);
    if (runs.length === 0) continue;
    const rows = await db.hrPayAdjustment.findMany({
      // C3.3-fix H5 (แทนรีวิวรอบ 2 S-c): PENDING + APPROVED ที่ยังไม่เข้ารอบในงวดที่มีรอบแล้ว (runId IS NULL = ไม่เคยถูกจ่าย)
      where: { systemId: sys.id, runId: null, crmCommissionId: { not: null }, status: { in: ["PENDING", "APPROVED"] }, periodKey: { in: runs } },
      select: { id: true, systemId: true, employeeId: true, periodKey: true, kind: true, status: true, runId: true, amountSatang: true, note: true, requestedById: true, crmCommissionId: true },
      orderBy: { id: "asc" },
      take: Math.max(1, limit - out.length),
    });
    out.push(...rows.map((r) => ({ ...r, kind: String(r.kind), status: String(r.status) })));
    if (out.length >= limit) break;
  }
  return out;
}
// ◂ CRM C3.3
