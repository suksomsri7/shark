import { tenantDb } from "@/lib/core/db";
import type { Prisma } from "@prisma/client";
// CRM C3.3 ▸ `hr.payroll.paid` ยิงใน tx เดียวกับการปิดรอบ (markPaid) ◂
import { emitOutbox } from "@/lib/core/outbox";
import { postPayrollJV, reverseEntry } from "@/lib/modules/account";
import { writeAudit } from "@/lib/core/audit"; // HF-HR-0 ▸ รอบ 5c (F1): ประวัติการลบรายการเงิน (ตัวเดียวกับ hr/service.ts) ◂
import { bkkParts } from "./service"; // H0.1 ▸ CR14: เวลาไทยจากตัวช่วยกลางของ HR (ไม่บวก +7 เองซ้ำ) ◂
import { payrollItemsDigest, PAYROLL_DIGEST_SELECT } from "./payroll-digest"; // H0.1 ▸ CR16: ลายนิ้วมือแถวพนักงาน (โมดูลกลาง ไม่ใช่ "use server") ◂
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
// H0.2 ▸ R4 (D12): ตัวเดียวกันทั้ง service (createPayrollRun · requestAdjustment) และ action (createPayrollRunAction) — เดือน 01–12 เท่านั้น ◂
export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
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
  // H0.2 ▸ R2 (D5): กติกาเดียวกับทาง CRM (มติผู้คุมงาน S4) — งวดที่มีรอบจ่ายแล้ว (ทุกสถานะ รวมร่าง) จะไม่ถูกดึงรายการอีก ⇒ ไม่รับรายการใหม่
  //   ข้อความเดียวกับทาง CRM ทุกตัวอักษร · ตรวจก่อนอ่านอะไรที่ขึ้นกับเงินเดือน (อัตรา OT) ⇒ ไม่เป็นช่องเดาเงินเดือน ◂
  {
    const p = input.periodKey.trim();
    const closed = await tenantDb(ctx).hrPayrollRun.findFirst({ where: { systemId: ctx.systemId, periodKey: p }, select: { id: true } });
    if (closed) return { ok: false, code: "PERIOD_CLOSED", reason: `งวด ${p} มีรอบจ่ายเงินเดือนแล้ว — ยื่นเข้างวดถัดไปแทน` };
  }

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
  //   runId IS NULL · งวดเดิม) ◂
  // H0.2 ▸ R2 (D5): ใช้กับ **ทุกรายการ** (ปกติ + CRM) — เดิมเฉพาะ CRM ⇒ รายการปกติที่อนุมัติหลังงวดมีรอบ = APPROVED แต่ไม่มีวันถูกจ่าย ·
  //   การอนุมัติทำใน tx เดียว ใต้ล็อกงวด (advisory คีย์เดียวกับ createPayrollRun) ⇒ อนุมัติ ∥ สร้างรอบของงวดเดียวกัน ต่อคิวกัน:
  //   อนุมัติก่อน = รอบดึงแถวไป · สร้างรอบก่อน = การอนุมัติเห็นรอบแล้วย้ายงวด (ไม่มีแถวค้างโดยไม่มีใครเห็น) · งวดปลายทางล็อกต่อ
  //   (เดือนหลังเสมอ ⇒ ลำดับล็อกจากน้อยไปมาก ไม่วนรอ) แล้วตรวจซ้ำว่ายังไม่มีรอบ · ปฏิเสธ (REJECTED) ไม่ย้าย ทางเดิม ◂
  if (status === "APPROVED") {
    return tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
      await lockRunPeriod(tx, ctx, row.periodKey);
      const runs = new Set((await tx.hrPayrollRun.findMany({ where: scope, select: { periodKey: true }, take: 2_000 })).map((r) => r.periodKey));
      let moveTo: string | null = null;
      if (runs.has(row.periodKey)) {
        moveTo = nextRunlessPeriod(row.periodKey, runs);
        if (!moveTo) return { ok: false, reason: `งวด ${row.periodKey} มีรอบจ่ายแล้ว และหางวดถัดไปที่ยังไม่มีรอบจ่ายไม่พบ — ตรวจรอบจ่ายเงินเดือน` };
        await lockRunPeriod(tx, ctx, moveTo);
        const taken = await tx.hrPayrollRun.findFirst({ where: { ...scope, periodKey: moveTo }, select: { id: true } });
        if (taken) return { ok: false, reason: "รอบจ่ายเพิ่งเปลี่ยนระหว่างอนุมัติ — กรุณาลองอีกครั้ง" };
      }
      const claim = await tx.hrPayAdjustment.updateMany({
        where: { ...scope, id, status: "PENDING", runId: null, periodKey: row.periodKey },
        data: { status, decidedById: decider.userId ?? null, decidedAt: new Date(), ...(moveTo ? { periodKey: moveTo } : {}) },
      });
      if (claim.count === 0) return { ok: false, reason: "รายการนี้ตัดสินไปแล้ว" };
      // รีวิวเงิน note (c): ผู้เรียก (payroll-actions) ลง audit การย้ายงวด from → to จาก movedFrom/movedTo
      return moveTo ? { ok: true, reason: `งวด ${row.periodKey} มีรอบจ่ายแล้ว — อนุมัติและย้ายรายการไปงวด ${moveTo}`, movedFrom: row.periodKey, movedTo: moveTo } : { ok: true };
    }, { maxWait: 20_000, timeout: 60_000 });
  }
  const claim = await tenantDb(ctx).hrPayAdjustment.updateMany({
    where: { id, status: "PENDING", runId: null },
    data: { status, decidedById: decider.userId ?? null, decidedAt: new Date() },
  });
  if (claim.count === 0) return { ok: false, reason: "รายการนี้ตัดสินไปแล้ว" };
  return { ok: true };
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
// H0.2 ▸ CR-H0.2-1 (OQ-1): รายการที่ผูกกับรอบ **ร่าง** (DRAFT · ยังไม่มี JV) ลบได้จากหน้าเงินเดือน (มีผู้ใช้) — ลบ + คำนวณรอบร่างใหม่
//   ใน tx เดียว ใต้ล็อกงวดของรอบ (cancelBoundDraftAdjustment) ⇒ ยอดรวม = Σ รายการ · ลายนิ้วมือเปลี่ยน · NEGATIVE_NET หายเมื่อไม่ติดลบแล้ว ·
//   ผูกกับรอบที่อนุมัติ/จ่าย/กลับรายการแล้ว = ปฏิเสธ (ข้อความใหม่ — เดิมบอกให้ "กลับรายการ" แม้เป็นร่าง ซึ่งทำไม่ได้) ·
//   ทางระบบ (ไม่ส่ง actor — hr facade / CRM) ยังลบได้เฉพาะรายการที่ไม่เข้ารอบ ตามสัญญาของ facade (ไม่มีผู้ใช้ให้ลงประวัติการคำนวณใหม่) ◂
const CANCEL_BOUND_APPROVED = "รายการนี้อยู่ในรอบจ่ายที่อนุมัติแล้ว ลบไม่ได้ (ใช้กลับรายการรอบจ่ายแทน)";
const CANCEL_BOUND_DRAFT_SYSTEM = "รายการนี้อยู่ในรอบจ่ายร่าง — ลบได้จากหน้าเงินเดือนเท่านั้น (ระบบจะคำนวณรอบร่างใหม่ให้)";
// H0.2 ▸ CR-H0.2-3: รายการที่มาจาก CRM (คอมมิชชัน/หักคืน · มี crmCommissionId) ลบจาก HR ไม่ได้ทุกกรณี (ยังไม่เข้ารอบ · ผูกรอบร่าง · อื่น ๆ)
//   ทั้งทางมี actor และไม่มี actor — ไม่ลบอะไร · CrmCommission.hrPayAdjustmentId คงเดิม · ไม่ลง audit (ไม่มีอะไรเปลี่ยน) ·
//   ทางถอน/ย้ายงวดของ CRM = withdrawCommissionAdjustment / moveCommissionAdjustmentPeriod (ไม่ผ่านฟังก์ชันนี้) ◂
const CANCEL_FROM_CRM = "รายการนี้มาจาก CRM — ถอนหรือแก้ที่ CRM แล้วระบบจะถอนออกจากรอบจ่ายให้เอง";
export async function cancelAdjustment(ctx: Ctx, id: string, actor?: { userId?: string | null; isOwner: boolean }): Promise<{ ok: boolean; reason?: string }> {
  const row = await tenantDb(ctx).hrPayAdjustment.findFirst({ where: { id } });
  if (!row) return { ok: false, reason: "ไม่พบรายการ" };
  if (row.crmCommissionId != null) return { ok: false, reason: CANCEL_FROM_CRM };
  let boundDraft: { id: string; periodKey: string } | null = null;
  if (row.runId) {
    const run = await tenantDb(ctx).hrPayrollRun.findFirst({ where: { id: row.runId, systemId: ctx.systemId }, select: { id: true, periodKey: true, status: true, journalEntryId: true } });
    if (!run || run.status !== "DRAFT" || run.journalEntryId) return { ok: false, reason: CANCEL_BOUND_APPROVED };
    if (!actor) return { ok: false, reason: CANCEL_BOUND_DRAFT_SYSTEM };
    boundDraft = { id: run.id, periodKey: run.periodKey };
  }
  const uid = typeof actor?.userId === "string" ? actor.userId.trim() : "";
  if (actor && !actor.isOwner) {
    if (!uid) return { ok: false, reason: "ระบบไม่ทราบผู้ลบรายการนี้ จึงยังลบไม่ได้ — กรุณาลบในหน้าเงินเดือน" };
    const subject = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: row.employeeId }, select: { linkedUserId: true } });
    const ownPendingAdd = row.status === "PENDING" && row.requestedById === uid && isAddKind(row.kind);
    if (subject?.linkedUserId === uid && !ownPendingAdd) return { ok: false, reason: "ลบรายการของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านดำเนินการ" };
  }
  if (boundDraft) return cancelBoundDraftAdjustment(ctx, row, boundDraft, { userId: uid || null, isOwner: !!actor?.isOwner });
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

// H0.1 ▸ R1: ส่วน "สร้างแถว" ของรอบจ่าย แยกออกจาก createPayrollRun เพื่อให้ recomputeDraftRun ใช้สูตรเดียวกันทุกตัวอักษร
//   (โปรไฟล์ → รายการ APPROVED ที่ยังไม่เข้ารอบของงวด ล็อก `FOR UPDATE` → เฉพาะพนักงานที่มีโปรไฟล์ → computeItem ต่อคน → ยอดรวม)
//   🔴 ผู้เรียกต้องถือล็อกงวด (advisory `hr:payroll:run:<systemId>:<periodKey>`) และส่ง tx ของตัวเองเข้ามา — ทุกคำสั่งใช้ tx นี้
//   ไม่มีโปรไฟล์เลย = คืน items ว่าง (ไม่ล็อกรายการ) ⇒ ผู้เรียกตัดสินข้อความเอง · การเช็กงวดซ้ำอยู่ใน createPayrollRun เท่านั้น ◂
type RunItemRow = ReturnType<typeof computeItem>;
type RunTotals = { gross: number; ssoEmployee: number; ssoEmployer: number; wht: number; net: number; add: number; deduct: number };

// ─────────── H0.2 ▸ R1 (D1) ใครอยู่ในรอบจ่ายของงวด · R3 (D6) flag ของแถว ───────────
//   งวด = เดือนตามปฏิทินกรุงเทพของ periodKey (วันแรก…วันสุดท้าย เทียบเป็นสตริง YYYY-MM-DD กับคอลัมน์ @db.Date — ไม่มีเรื่องเขตเวลา) ·
//   อยู่ในรอบเมื่อ (a) ไม่มีวันเริ่ม หรือเริ่ม ≤ วันสุดท้าย · (b) ไม่มีวันสิ้นสุด หรือสิ้นสุด ≥ วันแรก · (c) active หรือมีวันสิ้นสุด
//   (ถูกลบโดยไม่มีวันสิ้นสุด = ไม่รู้ว่าออกเมื่อไร ⇒ ไม่จ่าย + รายงาน — ไม่จ่ายเงียบ ๆ) · เข้า/ออกกลางเดือน = ยอดเต็มเดือนเดิม (ยังไม่คิดสัดส่วน — HQ6)
//   + flag PARTIAL_MONTH · โปรไฟล์ที่ไม่มีแถวพนักงาน = อยู่ในรอบตามเดิม (ไม่เปลี่ยนพฤติกรรมของข้อมูลที่ไม่มีวันที่ให้ตัดสิน) ◂
export type RunExclusionReason = "ENDED_BEFORE" | "STARTS_AFTER" | "REMOVED_NO_END_DATE";
export type RunExclusion = { employeeId: string; name: string; reason: RunExclusionReason };
export type RunFlag = "PARTIAL_MONTH" | "NEGATIVE_NET";

/** วันแรก/วันสุดท้ายของงวด "YYYY-MM" เป็น "YYYY-MM-DD" · งวดผิดรูปแบบ = null */
function periodBounds(periodKey: string): { firstDay: string; lastDay: string } | null {
  if (!PERIOD_RE.test(periodKey)) return null;
  const [y, m] = periodKey.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้ (ปฏิทินล้วน ไม่ขึ้นกับเขตเวลา)
  return { firstDay: `${periodKey}-01`, lastDay: `${periodKey}-${String(days).padStart(2, "0")}` };
}
const dayOf = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null); // @db.Date มาเป็นเที่ยงคืน UTC ของวันนั้น

async function periodMembership(
  db: Prisma.TransactionClient,
  ctx: Ctx,
  periodKey: string,
  employeeIds: string[],
): Promise<{ included: Set<string>; partial: Set<string>; exclusions: RunExclusion[] }> {
  const included = new Set<string>();
  const partial = new Set<string>();
  const exclusions: RunExclusion[] = [];
  const b = periodBounds(periodKey);
  if (!b || employeeIds.length === 0) return { included, partial, exclusions };
  const emps = await db.hrEmployee.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: employeeIds } },
    select: { id: true, name: true, active: true, startDate: true, endDate: true },
  });
  const byId = new Map(emps.map((e) => [e.id, e]));
  for (const id of employeeIds) {
    const e = byId.get(id);
    if (!e) {
      included.add(id);
      continue;
    }
    const start = dayOf(e.startDate);
    const end = dayOf(e.endDate);
    const reason: RunExclusionReason | null =
      end !== null && end < b.firstDay ? "ENDED_BEFORE" : start !== null && start > b.lastDay ? "STARTS_AFTER" : !e.active && end === null ? "REMOVED_NO_END_DATE" : null;
    if (reason) {
      exclusions.push({ employeeId: e.id, name: e.name, reason });
      continue;
    }
    included.add(id);
    if ((start !== null && start > b.firstDay) || (end !== null && end < b.lastDay)) partial.add(id);
  }
  exclusions.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : x.employeeId < y.employeeId ? -1 : 1));
  return { included, partial, exclusions };
}

/** flag ของแถว (snapshot.flags) — ไม่มี flag = ไม่ใส่คีย์ (แถวปกติเหมือนเดิมทุกไบต์) · NEGATIVE_NET = สุทธิติดลบ ⇒ approveRun ไม่อนุมัติ (R3) */
function withRunFlags(item: RunItemRow, partialMonth: boolean): RunItemRow {
  const flags: RunFlag[] = [];
  if (partialMonth) flags.push("PARTIAL_MONTH");
  if (item.netSatang < 0) flags.push("NEGATIVE_NET");
  return flags.length ? { ...item, snapshot: { ...item.snapshot, flags } } : item;
}
// ◂ H0.2

// H0.1 ▸ CR15 (ความเป็นส่วนตัว): รอบที่มีพนักงานเข้ารอบคนเดียว ยอดรวมของรอบ = เงินเดือนของคนนั้น (เห็นได้จากรายการรอบ)
//   ยอมรับได้ เพราะทุกคนที่เห็นรายการรอบจ่ายผ่าน canViewPayroll อยู่แล้ว (OWNER หรือ hr.payroll.read) — ไม่เปลี่ยนพฤติกรรม ◂
async function buildRunRows(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  periodKey: string,
): Promise<{ items: RunItemRow[]; totals: RunTotals; adjustmentIds: string[]; exclusions: RunExclusion[] }> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const allProfiles = await tx.hrSalaryProfile.findMany({
    where: scope,
    select: { employeeId: true, baseSalarySatang: true, ssoEligible: true, personalDeductionJson: true },
  });
  if (allProfiles.length === 0)
    return { items: [], totals: { gross: 0, ssoEmployee: 0, ssoEmployer: 0, wht: 0, net: 0, add: 0, deduct: 0 }, adjustmentIds: [], exclusions: [] };
  // H0.2 ▸ R1 (D1): ใครอยู่ในรอบของงวดนี้ — ตัวเดียวกับ runExclusions (periodMembership) ⇒ สร้าง/คำนวณใหม่/หน้าจอ ตรงกันเสมอ ·
  //   คนที่ถูกตัด = ไม่มีแถว และรายการของเขาไม่ถูกผูก (กติกาเดียวกับ H4 ข้างล่าง) · เข้า/ออกกลางเดือน = ยอดเต็มเดือนเดิม + flag PARTIAL_MONTH ◂
  const member = await periodMembership(tx, ctx, periodKey, allProfiles.map((p) => p.employeeId));
  const profiles = allProfiles.filter((p) => member.included.has(p.employeeId));
  if (profiles.length === 0)
    return { items: [], totals: { gross: 0, ssoEmployee: 0, ssoEmployer: 0, wht: 0, net: 0, add: 0, deduct: 0 }, adjustmentIds: [], exclusions: member.exclusions };
  // CRM C3.3-fix H4 ▸ เฉพาะรายการของพนักงานที่ "มีแถวในรอบนี้" (มีโปรไฟล์เงินเดือน) — รายการของคนที่ไม่มีโปรไฟล์ไม่ได้ถูกจ่าย
  //   ผูก runId ให้ = ถือว่าจ่ายแล้วทั้งที่ไม่มีใครได้เงิน (และคอมมิชชัน CRM จะกลายเป็น PAID) ⇒ ปล่อยไว้ให้รอบถัดไป/ตัวกวาด ◂
  const paidEmployees = new Set(profiles.map((p) => p.employeeId));

  // รายการเพิ่ม/หักที่ "อนุมัติแล้ว" ของงวดนี้ และยังไม่ถูกดึงเข้ารอบไหน (กันนับซ้ำข้ามงวด) — ล็อกแถว (race fix ของ createPayrollRun)
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
    return withRunFlags(
      computeItem({
        ...p,
        addSatang,
        deductSatang,
        adjustDetail: rows.map((r) => ({ kind: r.kind, amountSatang: r.amountSatang, note: r.note })),
      }),
      member.partial.has(p.employeeId),
    );
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
  return { items, totals, adjustmentIds: adjustments.map((a) => a.id), exclusions: member.exclusions };
}

/** คอลัมน์ยอดรวมของรอบ (ชื่อคอลัมน์ HrPayrollRun) จากยอดของ buildRunRows */
function runTotalsData(totals: RunTotals) {
  return {
    totalGrossSatang: totals.gross,
    totalSsoEmployeeSatang: totals.ssoEmployee,
    totalSsoEmployerSatang: totals.ssoEmployer,
    totalWhtSatang: totals.wht,
    totalNetSatang: totals.net,
    totalAddSatang: totals.add,
    totalDeductSatang: totals.deduct,
  };
}

/** ข้อมูลแถว HrPayrollItem 1 คน (ไม่รวม runId) */
function runItemData(scope: { tenantId: string; systemId: string }, i: RunItemRow) {
  return {
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
  };
}

// H0.2 ▸ R4: ข้อผิดพลาดที่ "ผู้ใช้แก้ได้" ของการสร้างรอบ (งวด/วันที่จ่ายไม่ถูกต้อง · งวดซ้ำ · ไม่มีใครต้องจ่าย) — ข้อความไทยคงที่ที่เขียนในไฟล์นี้
//   ⇒ createPayrollRunAction คืน message นี้ใน { ok:false, reason } ได้ (ไม่ใช่ข้อความดิบของฐานข้อมูล) · ข้อผิดพลาดอื่นยัง throw ตามเดิม ◂
export class PayrollInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollInputError";
  }
}
const PERIOD_INVALID_TH = "งวดต้องเป็นปี-เดือน (YYYY-MM) และเดือนอยู่ระหว่าง 01–12";
const PAYDATE_INVALID_TH = "วันที่จ่ายไม่ถูกต้อง — เลือกวันที่จ่ายใหม่";
// H0.2 ▸ CR-H0.2-4 (แก้โดยผู้คุมงาน: ±1 ปี): วันที่จ่ายต้องอยู่ใน [วันแรกของงวด − 365 วัน, วันสุดท้ายของงวด + 365 วัน] —
//   เทียบ "วันที่" ตามปฏิทินไทย (bkkParts) ไม่ใช่เวลา · ขอบทั้งสองข้างรับ ◂
const PAYDATE_WINDOW_TH = "วันที่จ่ายต้องอยู่ภายใน 1 ปีของงวดนี้";
const PAYDATE_WINDOW_DAYS = 365;
const DAY_MS = 86_400_000;
/** ช่วงวันที่จ่ายที่รับของงวด "YYYY-MM" เป็นสตริง YYYY-MM-DD (เทียบแบบสตริงได้) */
function payDateWindow(periodKey: string): { from: string; to: string } {
  const y = Number(periodKey.slice(0, 4));
  const m = Number(periodKey.slice(5, 7));
  const first = Date.UTC(y, m - 1, 1);
  const last = Date.UTC(y, m, 0);
  return { from: new Date(first - PAYDATE_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10), to: new Date(last + PAYDATE_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10) };
}
const noMembersText = (periodKey: string) => `ไม่มีพนักงานที่ต้องจ่ายในงวด ${periodKey} — ทุกคนที่ตั้งเงินเดือนไว้ออกก่อนงวดหรือเริ่มงานหลังงวด`;

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
  // H0.2 ▸ R4 (D12): งวด "YYYY-MM" เดือน 01–12 และวันที่จ่ายที่เป็นวันจริง — ตรวจก่อนเปิด tx (ไม่มีแถวใดถูกเขียน) · ข้อความไทยคงที่ ◂
  const periodKey = typeof input.periodKey === "string" ? input.periodKey.trim() : "";
  if (!PERIOD_RE.test(periodKey)) throw new PayrollInputError(PERIOD_INVALID_TH);
  if (!(input.payDate instanceof Date) || !Number.isFinite(input.payDate.getTime())) throw new PayrollInputError(PAYDATE_INVALID_TH);
  {
    const day = bkkParts(input.payDate).dateStr;
    const win = payDateWindow(periodKey);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < win.from || day > win.to) throw new PayrollInputError(PAYDATE_WINDOW_TH);
  }
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  return tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Prisma.TransactionClient;
    // สองการสร้างรอบของงวดเดียวกันต่อคิวกัน (unique (systemId, periodKey) เป็นด่านสุดท้าย — ล็อกนี้ทำให้ได้ข้อความไทยแทน error ของฐาน)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:payroll:run:${ctx.systemId}:${periodKey}`}, 0))`;
    const dup = await tx.hrPayrollRun.findFirst({ where: { ...scope, periodKey }, select: { id: true } });
    if (dup) throw new PayrollInputError(`มีรอบจ่ายงวด ${periodKey} อยู่แล้ว — ลบหรือเลือกงวดอื่น`);

    // H0.1 ▸ R1: แถว + ยอดรวม + รายการที่ล็อกไว้ มาจาก buildRunRows (ตัวเดียวกับ recomputeDraftRun) — ผลลัพธ์เท่าเดิมทุกไบต์ ◂
    const { items, totals, adjustmentIds, exclusions } = await buildRunRows(tx, ctx, periodKey);
    if (items.length === 0)
      throw new PayrollInputError(exclusions.length > 0 ? noMembersText(periodKey) : "ยังไม่มีโปรไฟล์เงินเดือน — ตั้งเงินเดือนพนักงานก่อนสร้างรอบจ่าย");

    const run = await tx.hrPayrollRun.create({
      data: {
        ...scope,
        periodKey,
        payDate: input.payDate,
        status: "DRAFT",
        ...runTotalsData(totals),
        items: { create: items.map((i) => runItemData(scope, i)) },
      },
      select: { id: true },
    });
    // ผูกรายการที่ถูกดึงเข้ารอบนี้ → งวดหน้าไม่นับซ้ำ และลบไม่ได้แล้ว — UPDATE เดียว guard runId IS NULL + APPROVED · ต้องครบทุกแถว
    if (adjustmentIds.length > 0) {
      const bound = await tx.hrPayAdjustment.updateMany({
        where: { ...scope, id: { in: adjustmentIds }, runId: null, status: "APPROVED" },
        data: { runId: run.id },
      });
      if (bound.count !== adjustmentIds.length) throw new Error(`รายการปรับเงินของงวด ${periodKey} ถูกเปลี่ยนระหว่างสร้างรอบ — ลองสร้างรอบใหม่อีกครั้ง`);
    }
    return { id: run.id };
  }, { maxWait: 20_000, timeout: 60_000 });
}

// ─────────── H0.1 ▸ วงจรรอบร่าง (DRAFT): ลบร่าง · คำนวณใหม่ (ใบ H0.1 R2 · R3 · R5) ───────────
// เดิมไม่มีทางลบ/คำนวณรอบร่างใหม่เลย ⇒ ร่างที่ผิด 1 รอบ = งวดนั้นติดตาย (unique systemId+periodKey)
// กติกาทั้งคู่: ล็อกงวดด้วยคีย์ advisory เดียวกับ createPayrollRun → อ่านรอบใหม่ใต้ `FOR UPDATE` → ต้องยังเป็น DRAFT และไม่มี JV
//   → เขียนทุกคำสั่งด้วย tx เดียว (ห้ามเปิด connection ที่สองใต้ล็อก) → guard updateMany/deleteMany + เช็ก count
//   ⇒ ลบ ∥ สร้าง (งวดเดียวกัน) · คำนวณใหม่ ∥ คำนวณใหม่ ต่อคิวที่ล็อกงวด · ลบ/คำนวณใหม่ ∥ อนุมัติ ต่อคิวที่ล็อกแถวรอบ
//   คำปฏิเสธ = คืนค่า { ok:false, reason } ภาษาไทย (ไม่ throw) · ผู้ทำ (actor) ลงประวัติ AuditLog หลัง commit
export type PayrollActor = { userId: string | null; isOwner: boolean };

const RUN_NOT_FOUND = "ไม่พบรอบจ่าย";
const RUN_CHANGED = "รอบนี้เปลี่ยนไปแล้ว กรุณาเปิดดูใหม่";
const DELETE_ONLY_DRAFT = "ลบได้เฉพาะรอบที่ยังเป็นร่าง";
const RECOMPUTE_ONLY_DRAFT = "คำนวณใหม่ได้เฉพาะรอบที่ยังเป็นร่าง";
// รอบร่างที่มี journalEntryId ค้าง (ลงบัญชีแล้วแต่สถานะถูกคืนเป็นร่าง) — ลบ/คำนวณใหม่ = ยอดในบัญชีไม่ตรงกับรอบ ⇒ ไม่ทำ
const DRAFT_HAS_JV = "รอบนี้มีรายการบัญชีผูกอยู่แล้ว จึงแก้ร่างไม่ได้ — ให้ผู้ดูแลบัญชีตรวจสอบรายการบัญชีของงวดนี้ก่อน";
const RECOMPUTE_NO_PROFILE = "ยังไม่มีโปรไฟล์เงินเดือน — ตั้งเงินเดือนพนักงานก่อนคำนวณใหม่";

/** คำปฏิเสธที่เกิดหลังเริ่มเขียนใน tx — throw เพื่อย้อนทั้ง tx แล้วแปลงกลับเป็น { ok:false } ที่ผู้เรียก (ไม่หลุดออกนอกไฟล์นี้) */
class RunRefusal extends Error {}

type LockedRun = {
  id: string;
  periodKey: string;
  status: string;
  journalEntryId: string | null;
  totalGrossSatang: number;
  totalAddSatang: number;
  totalDeductSatang: number;
  totalNetSatang: number;
};

/** ล็อกงวด — คีย์เดียวกับ createPayrollRun ทุกตัวอักษร (สร้าง · ลบ · คำนวณใหม่ ของงวดเดียวกันต่อคิวกัน) */
async function lockRunPeriod(tx: Prisma.TransactionClient, ctx: Ctx, periodKey: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:payroll:run:${ctx.systemId}:${periodKey}`}, 0))`;
}

/** อ่านแถวรอบใหม่ใต้ `FOR UPDATE` (ผูก tenantId + systemId เอง — raw SQL ไม่ผ่านตัวกรองของ tenantDb) */
async function lockRunRow(tx: Prisma.TransactionClient, ctx: Ctx, runId: string): Promise<LockedRun | null> {
  const rows = await tx.$queryRaw<LockedRun[]>`
    SELECT "id", "periodKey", "status"::text AS "status", "journalEntryId",
           "totalGrossSatang", "totalAddSatang", "totalDeductSatang", "totalNetSatang"
    FROM "HrPayrollRun"
    WHERE "id" = ${runId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
    FOR UPDATE`;
  const r = rows[0];
  return r ? { ...r, totalGrossSatang: Number(r.totalGrossSatang), totalAddSatang: Number(r.totalAddSatang), totalDeductSatang: Number(r.totalDeductSatang), totalNetSatang: Number(r.totalNetSatang) } : null;
}

// H0.1 ▸ CR19: คำปฏิเสธ (อนุมัติ · ลบร่าง · คำนวณใหม่) ลงประวัติพร้อมตัวเลข — `seen` = ตัวเลขที่ผู้กดส่งมา (ไม่มี = null) ·
//   `actual` = ตัวเลขจริงของรอบ อ่านใต้ล็อกแถวรอบใน tx เดียวกับการตัดสิน (ยอดสุทธิ · จำนวนคน · เงินเดือนรวม · ลายนิ้วมือ) ·
//   ผู้ทำ = ผู้ใช้ใน session ที่ action ส่งมา (สคริปต์/ทางเดิมที่ไม่ส่ง actor = actorId null) ◂
type RunActual = { net: number; items: number; gross: number; digest: string };
type RunSeen = { net: number; items: number; gross?: number; digest?: string } | null;
// H0.2 ▸ R3: + NEGATIVE_NET (มีแถวสุทธิติดลบ · `negative` = จำนวนแถว) ◂
type RunRefused = { code: "NOT_DRAFT" | "DRAFT_HAS_JV" | "STALE" | "NEGATIVE_NET"; actual: RunActual; negative?: number };

async function runActual(tx: Prisma.TransactionClient, ctx: Ctx, cur: LockedRun): Promise<RunActual> {
  const items = await tx.hrPayrollItem.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, runId: cur.id }, select: PAYROLL_DIGEST_SELECT });
  return { net: cur.totalNetSatang, items: items.length, gross: cur.totalGrossSatang, digest: payrollItemsDigest(items) };
}

async function auditRefusal(ctx: Ctx, actor: PayrollActor | undefined, action: string, runId: string, refused: RunRefused, seen: RunSeen): Promise<void> {
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: actor?.userId ?? null,
    action,
    targetType: "HrPayrollRun",
    targetId: runId,
    after: { code: refused.code, seen, actual: refused.actual, ...(refused.negative !== undefined ? { negative: refused.negative } : {}) },
  });
}

/** เวลาไทย รูปแบบ "YYYY-MM-DD HH:mm น." — H0.1 ▸ CR14: ใช้ bkkParts (hr/service.ts) ตัวกลางของ HR ◂ */
function bkkStamp(at: Date): string {
  const { dateStr, minOfDay } = bkkParts(at);
  const hh = String(Math.floor(minOfDay / 60)).padStart(2, "0");
  const mm = String(minOfDay % 60).padStart(2, "0");
  return `${dateStr} ${hh}:${mm} น.`;
}

/**
 * ลบรอบร่าง (ใบ H0.1 R2) — เฉพาะ DRAFT ที่ยังไม่มี JV · รายการเพิ่ม/หักที่ผูกอยู่กลับเป็น "ยังไม่เข้ารอบ" (สถานะคงเดิม) ·
 * ลบแถวพนักงานของรอบ + ตัวรอบ ⇒ สร้างรอบของงวดนี้ใหม่ได้ (และดึงรายการเหล่านั้นกลับเข้ารอบใหม่) · ประวัติ `hr.payroll.delete_draft`
 */
export async function deleteDraftRun(ctx: Ctx, runId: string, actor: PayrollActor): Promise<{ ok: true } | { ok: false; reason: string }> {
  const id = typeof runId === "string" ? runId.trim() : "";
  if (!id) return { ok: false, reason: RUN_NOT_FOUND };
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  type Before = { periodKey: string; totalAddSatang: number; totalDeductSatang: number; totalNetSatang: number; itemCount: number; adjustmentIds: string[] };
  let res: { ok: true; before: Before } | { ok: false; reason: string; refused?: RunRefused };
  try {
    res = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      const pre = await tx.hrPayrollRun.findFirst({ where: { ...scope, id }, select: { periodKey: true } });
      if (!pre) return { ok: false as const, reason: RUN_NOT_FOUND };
      await lockRunPeriod(tx, ctx, pre.periodKey);
      const cur = await lockRunRow(tx, ctx, id);
      if (!cur || cur.periodKey !== pre.periodKey) return { ok: false as const, reason: RUN_CHANGED };
      if (cur.status !== "DRAFT") return { ok: false as const, reason: DELETE_ONLY_DRAFT, refused: { code: "NOT_DRAFT" as const, actual: await runActual(tx, ctx, cur) } };
      if (cur.journalEntryId) return { ok: false as const, reason: DRAFT_HAS_JV, refused: { code: "DRAFT_HAS_JV" as const, actual: await runActual(tx, ctx, cur) } };

      const itemCount = await tx.hrPayrollItem.count({ where: { ...scope, runId: id } });
      const bound = await tx.hrPayAdjustment.findMany({ where: { ...scope, runId: id }, select: { id: true }, orderBy: { id: "asc" } });
      // ปลดรายการออกจากรอบ — สถานะ/ชนิด/ยอด/งวด ไม่แตะ (APPROVED ยังเป็น APPROVED · รอบใหม่ของงวดนี้ดึงกลับได้)
      if (bound.length > 0) {
        const un = await tx.hrPayAdjustment.updateMany({ where: { ...scope, runId: id }, data: { runId: null } });
        if (un.count !== bound.length) throw new RunRefusal(RUN_CHANGED);
      }
      await tx.hrPayrollItem.deleteMany({ where: { ...scope, runId: id } });
      const del = await tx.hrPayrollRun.deleteMany({ where: { ...scope, id, status: "DRAFT", journalEntryId: null } });
      if (del.count !== 1) throw new RunRefusal(RUN_CHANGED);
      return {
        ok: true as const,
        before: { periodKey: cur.periodKey, totalAddSatang: cur.totalAddSatang, totalDeductSatang: cur.totalDeductSatang, totalNetSatang: cur.totalNetSatang, itemCount, adjustmentIds: bound.map((b) => b.id) },
      };
    }, { maxWait: 20_000, timeout: 60_000 });
  } catch (e) {
    if (e instanceof RunRefusal) return { ok: false, reason: e.message };
    throw e;
  }
  if (!res.ok) {
    if (res.refused) await auditRefusal(ctx, actor, "hr.payroll.delete_draft.refused", id, res.refused, null); // CR19
    return { ok: false, reason: res.reason };
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: actor?.userId ?? null,
    action: "hr.payroll.delete_draft",
    targetType: "HrPayrollRun",
    targetId: id,
    before: res.before,
  });
  return { ok: true };
}

type DraftSnap = { totalAddSatang: number; totalDeductSatang: number; totalNetSatang: number; itemCount: number };
/**
 * ตัวในของ "คำนวณใหม่" (ใบ H0.1 R3) — ผู้เรียกถือล็อกงวด + ล็อกแถวรอบ (`cur` อ่านใต้ FOR UPDATE · ต้องเป็น DRAFT ไม่มี JV) ใน tx เดียวกัน:
 * ปลดรายการทั้งหมดของรอบ → ลบแถวพนักงาน → buildRunRows ใหม่ → สร้างแถว → ยอดรวม + note → ผูกรายการกลับ (guard + count) ·
 * คำปฏิเสธ = throw RunRefusal (ย้อนทั้ง tx) · H0.2 ▸ CR-H0.2-1: cancelAdjustment ของรายการในรอบร่างใช้ตัวเดียวกันนี้ ◂
 */
async function rebuildDraftRun(tx: Prisma.TransactionClient, ctx: Ctx, cur: LockedRun, note: string): Promise<{ before: DraftSnap; after: DraftSnap }> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const id = cur.id;
  const itemCountBefore = await tx.hrPayrollItem.count({ where: { ...scope, runId: id } });
  // ปลดรายการทั้งหมดของรอบ (แถวถูกล็อกด้วย UPDATE นี้จน commit) → buildRunRows เห็นมันเป็น "ยังไม่เข้ารอบ" ใน tx เดียวกัน
  await tx.hrPayAdjustment.updateMany({ where: { ...scope, runId: id }, data: { runId: null } });
  await tx.hrPayrollItem.deleteMany({ where: { ...scope, runId: id } });
  const { items, totals, adjustmentIds, exclusions } = await buildRunRows(tx, ctx, cur.periodKey);
  // H0.2 ▸ R1: ทุกคนที่มีโปรไฟล์ถูกตัดออกจากงวดนี้ = ไม่มีแถวให้จ่าย ⇒ ไม่คำนวณใหม่ (บอกเหตุผลจริง ไม่ใช่ "ยังไม่มีโปรไฟล์") ◂
  if (items.length === 0) throw new RunRefusal(exclusions.length > 0 ? noMembersText(cur.periodKey) : RECOMPUTE_NO_PROFILE);
  await tx.hrPayrollItem.createMany({ data: items.map((i) => ({ ...runItemData(scope, i), runId: id })) });
  const upd = await tx.hrPayrollRun.updateMany({
    where: { ...scope, id, status: "DRAFT", journalEntryId: null },
    data: { ...runTotalsData(totals), note },
  });
  if (upd.count !== 1) throw new RunRefusal(RUN_CHANGED);
  if (adjustmentIds.length > 0) {
    const bound = await tx.hrPayAdjustment.updateMany({
      where: { ...scope, id: { in: adjustmentIds }, runId: null, status: "APPROVED" },
      data: { runId: id },
    });
    if (bound.count !== adjustmentIds.length) throw new RunRefusal(RUN_CHANGED);
  }
  return {
    before: { totalAddSatang: cur.totalAddSatang, totalDeductSatang: cur.totalDeductSatang, totalNetSatang: cur.totalNetSatang, itemCount: itemCountBefore },
    after: { totalAddSatang: totals.add, totalDeductSatang: totals.deduct, totalNetSatang: totals.net, itemCount: items.length },
  };
}

/**
 * H0.2 ▸ CR-H0.2-1 (OQ-1): ลบรายการเพิ่ม/หักที่ผูกกับรอบ **ร่าง** แล้วคำนวณรอบร่างนั้นใหม่ — tx เดียว: ล็อกงวดของรอบ (คีย์เดียวกับสร้าง/ลบ/คำนวณใหม่)
 * → อ่านรอบใหม่ใต้ FOR UPDATE ต้องยังเป็น DRAFT ไม่มี JV → ลบแถวด้วย guard (id · runId · สถานะที่อ่านมา · count = 1) → rebuildDraftRun ·
 * ประวัติ `hr.payadjust.delete` (+ runId) และ `hr.payroll.recompute` หลัง commit · ผู้เรียก (cancelAdjustment) ตรวจสิทธิ์ "แถวของตัวเอง" มาแล้ว
 */
async function cancelBoundDraftAdjustment(
  ctx: Ctx,
  row: { id: string; employeeId: string; kind: string; amountSatang: number; status: string; periodKey: string; requestedById: string | null; decidedById: string | null },
  run: { id: string; periodKey: string },
  actor: PayrollActor,
): Promise<{ ok: boolean; reason?: string }> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  let res: { note: string; before: DraftSnap; after: DraftSnap };
  try {
    res = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      await lockRunPeriod(tx, ctx, run.periodKey);
      const cur = await lockRunRow(tx, ctx, run.id);
      if (!cur || cur.periodKey !== run.periodKey) throw new RunRefusal(RUN_CHANGED);
      if (cur.status !== "DRAFT" || cur.journalEntryId) throw new RunRefusal(CANCEL_BOUND_APPROVED);
      const del = await tx.hrPayAdjustment.deleteMany({ where: { ...scope, id: row.id, runId: run.id, status: row.status as "PENDING" | "APPROVED" | "REJECTED" } });
      if (del.count !== 1) throw new RunRefusal(RUN_CHANGED);
      const note = `คำนวณใหม่ ${bkkStamp(new Date())}`;
      const r = await rebuildDraftRun(tx, ctx, cur, note);
      return { note, ...r };
    }, { maxWait: 20_000, timeout: 60_000 });
  } catch (e) {
    if (e instanceof RunRefusal) return { ok: false, reason: e.message };
    throw e;
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: actor.userId,
    action: "hr.payadjust.delete",
    targetType: "HrPayAdjustment",
    targetId: row.id,
    before: { employeeId: row.employeeId, kind: row.kind, amountSatang: row.amountSatang, status: row.status, periodKey: row.periodKey, requestedById: row.requestedById, decidedById: row.decidedById, runId: run.id },
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: actor.userId,
    action: "hr.payroll.recompute",
    targetType: "HrPayrollRun",
    targetId: run.id,
    before: res.before,
    after: { ...res.after, cause: "hr.payadjust.delete", adjustmentId: row.id },
  });
  return { ok: true };
}

/**
 * คำนวณรอบร่างใหม่ (ใบ H0.1 R3) — id รอบ · งวด · วันที่จ่าย คงเดิม (ลิงก์/สลิปยังใช้ได้) · ปลดรายการ → ลบแถวพนักงาน →
 * buildRunRows ใหม่ (เงินเดือนปัจจุบัน · พนักงานที่มีโปรไฟล์ตอนนี้ · รายการ APPROVED ที่ยังไม่เข้ารอบของงวด) → สร้างแถว → ยอดรวมใหม่ →
 * ผูกรายการกลับด้วย guard + เช็ก count · ประวัติ `hr.payroll.recompute` (ยอด + จำนวนคน ก่อน/หลัง)
 */
export async function recomputeDraftRun(ctx: Ctx, runId: string, actor: PayrollActor): Promise<{ ok: true; note: string } | { ok: false; reason: string }> {
  const id = typeof runId === "string" ? runId.trim() : "";
  if (!id) return { ok: false, reason: RUN_NOT_FOUND };
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  type Snap = { totalAddSatang: number; totalDeductSatang: number; totalNetSatang: number; itemCount: number };
  let res: { ok: true; note: string; before: Snap; after: Snap } | { ok: false; reason: string; refused?: RunRefused };
  try {
    res = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      const pre = await tx.hrPayrollRun.findFirst({ where: { ...scope, id }, select: { periodKey: true } });
      if (!pre) return { ok: false as const, reason: RUN_NOT_FOUND };
      await lockRunPeriod(tx, ctx, pre.periodKey);
      const cur = await lockRunRow(tx, ctx, id);
      if (!cur || cur.periodKey !== pre.periodKey) return { ok: false as const, reason: RUN_CHANGED };
      if (cur.status !== "DRAFT") return { ok: false as const, reason: RECOMPUTE_ONLY_DRAFT, refused: { code: "NOT_DRAFT" as const, actual: await runActual(tx, ctx, cur) } };
      if (cur.journalEntryId) return { ok: false as const, reason: DRAFT_HAS_JV, refused: { code: "DRAFT_HAS_JV" as const, actual: await runActual(tx, ctx, cur) } };

      const note = `คำนวณใหม่ ${bkkStamp(new Date())}`;
      const r = await rebuildDraftRun(tx, ctx, cur, note);
      return { ok: true as const, note, before: r.before, after: r.after };
    }, { maxWait: 20_000, timeout: 60_000 });
  } catch (e) {
    if (e instanceof RunRefusal) return { ok: false, reason: e.message };
    throw e;
  }
  if (!res.ok) {
    if (res.refused) await auditRefusal(ctx, actor, "hr.payroll.recompute.refused", id, res.refused, null); // CR19
    return { ok: false, reason: res.reason };
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: actor?.userId ?? null,
    action: "hr.payroll.recompute",
    targetType: "HrPayrollRun",
    targetId: id,
    before: res.before,
    after: res.after,
  });
  return { ok: true, note: res.note };
}
const APPROVE_STALE = "ตัวเลขของรอบนี้เปลี่ยนไปแล้ว (มีการคำนวณใหม่) — กรุณาเปิดดูและอนุมัติอีกครั้ง";
const APPROVE_NOT_DRAFT = "รอบนี้อนุมัติหรือจ่ายไปแล้ว";
const APPROVE_DRAFT_HAS_JV = "รอบนี้มีเอกสารบัญชีค้างอยู่ ต้องให้ผู้ดูแลตรวจสอบก่อน"; // H0.1 ▸ CR17 ◂
/** H0.1 ▸ CR12: เหตุที่อนุมัติไม่สำเร็จ (ให้ approvePayrollRunAction เลือกข้อความคงที่ — POST_FAILED = ลงบัญชีล้ม รอบกลับเป็นร่าง) ◂
 *  H0.1 ▸ CR17: DRAFT_HAS_JV = ร่างที่มี journalEntryId ค้าง (ลงบัญชีไปแล้วแต่สถานะถูกคืนเป็นร่าง) ⇒ ไม่ลงบัญชีซ้ำ ◂ */
export type ApproveFailCode = "NOT_FOUND" | "NOT_DRAFT" | "STALE" | "POST_FAILED" | "DRAFT_HAS_JV" | "NEGATIVE_NET";
// H0.2 ▸ R3 (D6): ข้อความคงที่ (N = จำนวนแถวที่สุทธิติดลบ) — action ส่งต่อถึงจอได้ (ไม่มีข้อความดิบของ error) ◂
export const approveNegativeNetText = (n: number) => `มีพนักงาน ${n} คนที่ยอดสุทธิติดลบ (รายการหักมากกว่าเงินได้) — แก้รายการหักแล้วกด 'คำนวณใหม่'`;

/**
 * H0.1 R4 · R5 — claim DRAFT→APPROVED เฉพาะเมื่อรอบ "ยังเป็นตัวเลขที่ผู้อนุมัติเห็น" (ยอดจ่ายสุทธิรวม + จำนวนคน) แบบอะตอมมิก:
 *   ล็อกแถวรอบ `FOR UPDATE` (ตัวเดียวกับที่ลบ/คำนวณใหม่ถือตลอด tx ⇒ ไม่มีการคำนวณใหม่ค้างกลางทาง) → นับแถวพนักงานใต้ล็อกนั้น →
 *   UPDATE เดียวที่ guard `status = DRAFT AND totalNetSatang = ที่เห็น` ⇒ อนุมัติที่รอคิวอยู่หลังการคำนวณใหม่ เห็นตัวเลขใหม่แล้วปฏิเสธ
 */
//   H0.1 ▸ CR11: ส่ง totalGrossSatang (เงินเดือนรวมที่เห็น) มาด้วย ⇒ ต้องตรงด้วย (เช็กใต้ล็อก + อยู่ใน where ของ UPDATE) · ไม่ส่ง = ไม่เช็ก ·
//   ส่งมาแต่ไม่ใช่จำนวนเต็ม = ถือว่าตัวเลขเปลี่ยน (ไม่อนุมัติแบบเดา — แบบเดียวกับยอดสุทธิ/จำนวนคน) ◂
//   H0.1 ▸ CR16: `itemsDigest` (ลายนิ้วมือแถวพนักงานที่เห็น · payroll-digest.ts) ⇒ คำนวณใหม่จากแถวที่อ่านใต้ล็อกเดียวกัน ไม่ตรง = STALE ·
//   ส่งมาแต่ไม่ใช่ sha256 hex 64 ตัว = STALE · ไม่ส่ง = ไม่เช็ก (ผู้เรียกเก่า) ◂
//   H0.1 ▸ CR17: ทั้งทางที่มี expect และไม่มี — ใต้ล็อกต้องเป็น DRAFT ที่ `journalEntryId` ว่าง และ where ของ UPDATE มี `journalEntryId: null` ด้วย ◂
//   H0.1 ▸ CR19: คำปฏิเสธคืนตัวเลขจริงที่อ่านใต้ล็อก (actual) ให้ approveRun ลงประวัติ ◂
export type ApproveExpect = { totalNetSatang: number; itemCount: number; totalGrossSatang?: number; itemsDigest?: string };
const DIGEST_RE = /^[0-9a-f]{64}$/;
type ClaimResult = { code: "OK" } | { code: "NOT_FOUND" } | RunRefused;
async function claimApproveExpected(ctx: Ctx, runId: string, expect: ApproveExpect | undefined): Promise<ClaimResult> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  return tenantDb(ctx).$transaction(async (t): Promise<ClaimResult> => {
    const tx = t as unknown as Prisma.TransactionClient;
    const cur = await lockRunRow(tx, ctx, runId);
    if (!cur) return { code: "NOT_FOUND" };
    if (cur.status !== "DRAFT") return { code: "NOT_DRAFT", actual: await runActual(tx, ctx, cur) };
    if (cur.journalEntryId) return { code: "DRAFT_HAS_JV", actual: await runActual(tx, ctx, cur) };
    let guard: { totalNetSatang?: number; totalGrossSatang?: number } = {};
    if (expect !== undefined) {
      const actual = await runActual(tx, ctx, cur);
      const gross = expect.totalGrossSatang;
      const digest = expect.itemsDigest;
      const stale =
        !Number.isSafeInteger(expect.totalNetSatang) ||
        !Number.isSafeInteger(expect.itemCount) ||
        (gross !== undefined && !Number.isSafeInteger(gross)) ||
        (digest !== undefined && !(typeof digest === "string" && DIGEST_RE.test(digest))) ||
        actual.net !== expect.totalNetSatang ||
        actual.items !== expect.itemCount ||
        (gross !== undefined && actual.gross !== gross) ||
        (digest !== undefined && actual.digest !== digest);
      if (stale) return { code: "STALE", actual };
      guard = { totalNetSatang: expect.totalNetSatang, ...(gross !== undefined ? { totalGrossSatang: gross } : {}) };
    }
    // H0.2 ▸ R3 (D6): แถวที่สุทธิติดลบ (หักมากกว่าเงินได้) = ไม่อนุมัติ ทั้งทางที่มี/ไม่มี expect — นับใต้ล็อกแถวรอบเดียวกับที่คำนวณใหม่/ลบถือตลอด tx
    //   ⇒ คำนวณใหม่แทรกระหว่างการนับกับ UPDATE ไม่ได้ · UPDATE มี guard "ไม่มีแถวติดลบ" ซ้ำอีกชั้น (เดิม JV ปฏิเสธเฉพาะยอดรวมติดลบ
    //   — แถวเดียวติดลบในยอดรวมบวก ลงบัญชีและจ่ายขาดได้) ◂
    const negative = await tx.hrPayrollItem.count({ where: { ...scope, runId, netSatang: { lt: 0 } } });
    if (negative > 0) return { code: "NEGATIVE_NET", actual: await runActual(tx, ctx, cur), negative };
    const claim = await tx.hrPayrollRun.updateMany({
      where: { ...scope, id: runId, status: "DRAFT", journalEntryId: null, ...guard, items: { none: { netSatang: { lt: 0 } } } },
      data: { status: "APPROVED" },
    });
    return claim.count === 1 ? { code: "OK" } : { code: "NOT_DRAFT", actual: await runActual(tx, ctx, cur) };
  }, { maxWait: 20_000, timeout: 60_000 });
}
// ◂ H0.1

// ── อนุมัติรอบ (DRAFT→APPROVED) + ลงบัญชี ถ้ามีระบบ ACCOUNT ──
export async function approveRun(
  ctx: Ctx,
  runId: string,
  // H0.1 ▸ R4: "อนุมัติเฉพาะตัวเลขที่เห็น" — หน้าเว็บส่งยอดจ่ายสุทธิรวม + จำนวนคน (+ เงินเดือนรวม · CR11 · ลายนิ้วมือ · CR16) ของแถวที่แสดงมาเสมอ ·
  //   ไม่ส่ง = ทางเดิม (ผู้เรียกเก่า/สคริปต์) · `code` = เหตุที่ไม่สำเร็จแบบอ่านด้วยโปรแกรม ⇒ action แปลงเป็นข้อความคงที่ (CR12 — ไม่ส่ง note ดิบถึงจอ) ◂
  expect?: ApproveExpect,
  // H0.1 ▸ CR19: ผู้กดใน session — ใช้ลงประวัติคำปฏิเสธ `hr.payroll.approve.refused` (ไม่ส่ง = actorId null) ◂
  actor?: PayrollActor,
): Promise<{ ok: boolean; note: string; code?: ApproveFailCode }> {
  const db = tenantDb(ctx);
  const claimed = await claimApproveExpected(ctx, runId, expect);
  if (claimed.code === "NOT_FOUND") {
    // ทางเดิม (ไม่มี expect) ตอบแบบเดิม: หาไม่เจอ = "ไม่ใช่ร่าง"
    return expect !== undefined ? { ok: false, note: RUN_NOT_FOUND, code: "NOT_FOUND" } : { ok: false, note: APPROVE_NOT_DRAFT, code: "NOT_DRAFT" };
  }
  if (claimed.code !== "OK") {
    const seen: RunSeen =
      expect === undefined
        ? null
        : {
            net: expect.totalNetSatang,
            items: expect.itemCount,
            ...(expect.totalGrossSatang !== undefined ? { gross: expect.totalGrossSatang } : {}),
            ...(expect.itemsDigest !== undefined ? { digest: expect.itemsDigest } : {}),
          };
    await auditRefusal(ctx, actor, "hr.payroll.approve.refused", runId, claimed, seen); // CR19
    if (claimed.code === "STALE") return { ok: false, note: APPROVE_STALE, code: "STALE" };
    if (claimed.code === "DRAFT_HAS_JV") return { ok: false, note: APPROVE_DRAFT_HAS_JV, code: "DRAFT_HAS_JV" };
    if (claimed.code === "NEGATIVE_NET") return { ok: false, note: approveNegativeNetText(claimed.negative ?? 0), code: "NEGATIVE_NET" };
    return { ok: false, note: APPROVE_NOT_DRAFT, code: "NOT_DRAFT" };
  }

  const run = await db.hrPayrollRun.findFirst({ where: { id: runId } });
  if (!run) return { ok: false, note: "ไม่พบรอบจ่าย", code: "NOT_FOUND" };

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
    return { ok: false, note: e instanceof Error ? e.message : "ลงบัญชีไม่สำเร็จ", code: "POST_FAILED" };
  }
}

// ── กลับรายการเงินเดือน (APPROVED/PAID → REVERSED) + กลับ JV — WO Wave2-K ──
// immutable ledger: กลับ JV ด้วย reversal เท่านั้น (reverseEntry สร้าง entry ตรงข้าม + mark เดิม REVERSED)
// DRAFT/ไม่มี JV → ok:false (ไม่มีอะไรกลับ) · H0.1 CR8: รอบร่างบอกชื่อปุ่มจริง "ลบร่าง" (deleteDraftRun)
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
    return { ok: false, note: "รอบนี้ยังไม่ได้ลงบัญชี — ไม่มีรายการให้กลับ (รอบที่ยังเป็นร่าง ยกเลิกได้ด้วยปุ่ม \"ลบร่าง\")" };

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
        // H0.1 ▸ CR16: + คอลัมน์ของลายนิ้วมือ (เพิ่ม/หัก/ปสส. 2 ช่อง/ภาษี) ⇒ หน้ารอบจ่ายคำนวณ itemsDigest ฝั่ง server ส่งไปกับปุ่มอนุมัติ ◂
        // H0.2 ▸ R1/R3: + snapshotJson (flags PARTIAL_MONTH / NEGATIVE_NET ของแถว) — หน้าเงินเดือน (หลังด่าน canViewPayroll) ใช้ทำเครื่องหมาย "ต้องตรวจ"/"ติดลบ"
        //   ฝั่ง server เท่านั้น (แถวไม่ถูกส่งถึง client นอกจากลายนิ้วมือและป้ายข้อความ) ◂
        select: { id: true, ...PAYROLL_DIGEST_SELECT, snapshotJson: true },
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

// ─────────── H0.2 ▸ ตัวอ่าน/ตัวย้ายของหน้าเงินเดือน (เฉพาะผู้ดูเงินเดือน — หน้า PayrollSection เรียกหลังด่าน canViewPayroll) ───────────
/**
 * R1: คนที่มีโปรไฟล์เงินเดือนแต่ "ไม่อยู่ในรอบ" ของงวดนี้ + เหตุผล (ENDED_BEFORE · STARTS_AFTER · REMOVED_NO_END_DATE) —
 * กติกาเดียวกับ buildRunRows (periodMembership) · ผูกร้าน + ระบบ HR · งวดผิดรูปแบบ = []
 */
export async function runExclusions(ctx: Ctx, periodKey: string): Promise<RunExclusion[]> {
  const p = typeof periodKey === "string" ? periodKey.trim() : "";
  if (!PERIOD_RE.test(p)) return [];
  return tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Prisma.TransactionClient;
    const profiles = await tx.hrSalaryProfile.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { employeeId: true }, take: 5_000 });
    return (await periodMembership(tx, ctx, p, profiles.map((x) => x.employeeId))).exclusions;
  });
}

export type StrandedAdjustment = {
  id: string;
  employeeId: string;
  periodKey: string;
  kind: string;
  status: string;
  amountSatang: number;
  note: string | null;
  crmCommissionId: string | null;
};
/**
 * R2: รายการ "ค้าง" ของระบบ HR นี้ — ปกติ + CRM · PENDING/APPROVED · ยังไม่เข้ารอบ (`runId IS NULL`) · งวดของมันมีรอบจ่ายแล้ว (ทุกสถานะ)
 * ⇒ createPayrollRun ของงวดนั้นไม่มีวันเกิดซ้ำ จึงจะไม่ถูกจ่ายถ้าไม่มีใครย้าย (CR-H0.2-2: รวมรายการของคนที่ถูกตัดออกจากงวด) ·
 * `strandedCommissionAdjustments` (ของ CRM) ไม่เปลี่ยน
 */
export async function strandedAdjustments(ctx: Ctx, limit = 200): Promise<StrandedAdjustment[]> {
  const db = tenantDb(ctx);
  const runs = (await db.hrPayrollRun.findMany({ where: { systemId: ctx.systemId }, select: { periodKey: true }, take: 2_000 })).map((r) => r.periodKey);
  if (runs.length === 0) return [];
  const rows = await db.hrPayAdjustment.findMany({
    where: { systemId: ctx.systemId, runId: null, status: { in: ["PENDING", "APPROVED"] }, periodKey: { in: runs } },
    select: { id: true, employeeId: true, periodKey: true, kind: true, status: true, amountSatang: true, note: true, crmCommissionId: true },
    orderBy: [{ periodKey: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(limit, 1_000)),
  });
  return rows.map((r) => ({ ...r, kind: String(r.kind), status: String(r.status) }));
}

/**
 * R2: ปุ่ม "ย้ายไปงวดถัดไป" ของรายการค้าง **ปกติ** (ไม่ผูกคอมมิชชัน — ของ CRM ตัวกวาดของ CRM ย้ายเอง · moveCommissionAdjustmentPeriod)
 * ความหมายเดียวกับ moveCommissionAdjustmentPeriod: แก้ periodKey ในที่เดิม · guard runId IS NULL + PENDING/APPROVED + งวดเดิม ·
 * ปลายทาง = เดือนแรกหลังงวดเดิมที่ยังไม่มีรอบ — tx เดียว ใต้ล็อกงวดเดิมแล้วงวดปลายทาง (น้อยไปมาก) ⇒ ไม่ชนกับสร้างรอบปลายทาง ·
 * ผู้ใช้ที่ไม่ใช่เจ้าของร้าน ย้ายรายการของแถวพนักงานที่ผูกกับบัญชีตัวเองไม่ได้ (กติกาเดียวกับลบ) · ประวัติ `hr.payadjust.move`
 */
export async function moveStrandedAdjustment(ctx: Ctx, id: string, actor: PayrollActor): Promise<{ ok: boolean; reason?: string; movedFrom?: string; movedTo?: string }> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const row = await tenantDb(ctx).hrPayAdjustment.findFirst({ where: { id }, select: { id: true, employeeId: true, periodKey: true, status: true, runId: true, crmCommissionId: true } });
  if (!row) return { ok: false, reason: "ไม่พบรายการ" };
  if (row.crmCommissionId) return { ok: false, reason: "รายการคอมมิชชันจาก CRM ระบบ CRM ย้ายงวดให้เอง" };
  if (row.runId || (row.status !== "PENDING" && row.status !== "APPROVED")) return { ok: false, reason: "รายการนี้ไม่ได้ค้างแล้ว กรุณาเปิดดูใหม่" };
  if (!actor.isOwner) {
    const uid = typeof actor.userId === "string" ? actor.userId.trim() : "";
    if (!uid) return { ok: false, reason: "ระบบไม่ทราบผู้ย้ายรายการนี้ จึงยังย้ายไม่ได้ — กรุณาย้ายในหน้าเงินเดือน" };
    const subject = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: row.employeeId }, select: { linkedUserId: true } });
    if (subject?.linkedUserId === uid) return { ok: false, reason: "ย้ายรายการของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านดำเนินการ" };
  }
  const res = await tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Prisma.TransactionClient;
    await lockRunPeriod(tx, ctx, row.periodKey);
    const runs = new Set((await tx.hrPayrollRun.findMany({ where: scope, select: { periodKey: true }, take: 2_000 })).map((r) => r.periodKey));
    if (!runs.has(row.periodKey)) return { ok: false as const, reason: "งวดของรายการนี้ยังไม่มีรอบจ่าย — ไม่ต้องย้าย" };
    const to = nextRunlessPeriod(row.periodKey, runs);
    if (!to) return { ok: false as const, reason: `หางวดถัดไปที่ยังไม่มีรอบจ่ายหลังงวด ${row.periodKey} ไม่พบ — ตรวจรอบจ่ายเงินเดือน` };
    await lockRunPeriod(tx, ctx, to);
    if (await tx.hrPayrollRun.findFirst({ where: { ...scope, periodKey: to }, select: { id: true } })) return { ok: false as const, reason: "รอบจ่ายเพิ่งเปลี่ยน — กรุณาลองอีกครั้ง" };
    const n = await tx.hrPayAdjustment.updateMany({
      where: { ...scope, id, runId: null, crmCommissionId: null, periodKey: row.periodKey, status: { in: ["PENDING", "APPROVED"] } },
      data: { periodKey: to },
    });
    if (n.count !== 1) return { ok: false as const, reason: "รายการนี้เปลี่ยนไปแล้ว กรุณาเปิดดูใหม่" };
    return { ok: true as const, to };
  }, { maxWait: 20_000, timeout: 60_000 });
  if (!res.ok) return { ok: false, reason: res.reason };
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: actor.userId,
    action: "hr.payadjust.move",
    targetType: "HrPayAdjustment",
    targetId: id,
    before: { periodKey: row.periodKey, status: row.status },
    after: { periodKey: res.to },
  });
  return { ok: true, movedFrom: row.periodKey, movedTo: res.to };
}
// ◂ H0.2

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
