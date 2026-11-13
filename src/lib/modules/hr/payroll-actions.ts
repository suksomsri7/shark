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
  deleteDraftRun,
  recomputeDraftRun,
  markPaid,
  moveStrandedAdjustment,
  PayrollInputError,
  PERIOD_RE,
  requestAdjustment,
  reverseRun,
  setSalaryProfile,
  type AdjustKind,
  type ApproveExpect,
  type Ctx,
} from "./payroll";
import { adjustmentReplyForViewer, screenOtHoursForViewer } from "./privacy";
import { confirmBranchHours, createPayrollRunV2, RUN2_TEXT, setAdjustmentConsent, setPayrollEngine } from "./payroll"; // HR H3.4 ▸ รอบจ่ายรุ่น 2 ◂
import { hrViewerOf } from "./privacy"; // HR H3.4 ◂
import { h37PageText, markPaidRun, setPayrollBook, setPayrollPayAccount, setPayrollPosting } from "./payroll"; // HR H3.7 ▸ จ่าย = ลงบัญชีจ่าย (สมุดของรอบ) · ตั้งสมุด/บัญชีจ่ายเงินเดือน (เจ้าของร้าน) ◂
// HR H1.1 ▸ R5 ขอบเขตสาขา — สาขาของพนักงานเป้าหมายอ่านจาก DB · รอบจ่ายเป็นของทั้งระบบ HR (HQ20 · มติ 8) ◂
import { employeeIdOfAdjustment, employeeUnitsOf, HrBranchError, hrScopeOf, isAllBranches, unitTargetOf } from "./scope";

// Actions โมดูล Payroll (system-scoped HR) — assertCan "hr.payroll.<verb>" ทุกจุดที่แตะเงิน
// convention action = "hr.<entity>.<verb>" · OWNER/MANAGER ผ่าน · STAFF ตาม permission
// HR H1.1 ▸ unitId = สาขาของพนักงานเป้าหมาย ส่งต่อเข้า assertCan · ไม่ส่ง = ระดับระบบ HR (มีหมายเหตุ "ทุกสาขา" กำกับ) ◂
function assertHrCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string, unitId?: string) {
  const membership = {
    role: auth.active.role,
    unitAccess: (Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess : []) as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  assertCan(membership, { module: "hr", action, ...(unitId ? { unitId } : {}) });
  // 🔒 PDPA: ทุก action ที่แตะเงินเดือนต้องผ่านด่านข้อมูลอ่อนไหว (OWNER/hr.payroll.read) — MANAGER ทั่วไปไม่ผ่าน
  if (!canViewPayroll(membership)) throw new ForbiddenError({ module: "hr", action });
}

/** HR H1.1 ▸ ข้อความไทยคงที่ของ HrBranchError (ข้อความที่ scope.ts เขียนเอง — ไม่ใช่ข้อความระบบ) · อื่น ๆ = null ⇒ ผู้เรียก throw ต่อ ◂ */
function branchText(x: unknown): string | null {
  return x instanceof HrBranchError ? x.message : null;
}
// HR H1.1 R12 ▸ R12.3 (M-2): รอบจ่าย = ทั้งระบบ HR (HQ20 · มติ 8 = รูปร่างของรอบ) ⇒ สร้าง/อนุมัติ/จ่าย/กลับรายการ/ลบร่าง/คำนวณใหม่
//   ต้องเป็นผู้ดูแลทุกสาขา (OWNER · "*" · []) · ผู้ดูเงินเดือนที่จำกัดสาขาเป็นรายการ ⇒ ข้อความคงที่ ไม่เขียนอะไร ◂
const RUN_ALL_BRANCHES_TH = "รอบจ่ายเงินเดือนครอบคลุมทุกสาขา — ต้องเป็นผู้ดูแลทุกสาขาจึงทำรายการได้";
function assertRunAllBranches(auth: Awaited<ReturnType<typeof requireTenant>>): void {
  if (!isAllBranches(hrScopeOf({ role: auth.active.role, unitAccess: auth.active.unitAccess }))) throw new HrBranchError(RUN_ALL_BRANCHES_TH);
}
/** HR H1.1 ▸ สาขาของพนักงานเป้าหมาย (ระดับพนักงาน = สาขาประจำ · `day` = รวมยืมตัวที่ครอบวันนั้น) — นอกสาขา = HrBranchError ◂ */
async function payTarget(auth: Awaited<ReturnType<typeof requireTenant>>, ctx: Ctx, employeeId: string | null, day?: Date): Promise<{ unitId?: string }> {
  const emp = employeeId ? await employeeUnitsOf(ctx, employeeId) : null;
  if (!emp) return {};
  const t = unitTargetOf(hrScopeOf({ role: auth.active.role, unitAccess: auth.active.unitAccess }), emp, day);
  if (!t.ok) throw new HrBranchError(t.reason);
  return t.unitId ? { unitId: t.unitId } : {};
}

const revalidate = (systemId: string) => revalidatePath(`/app/sys/${systemId}`);

// ── ตั้งเงินเดือนพนักงาน (บาท → สตางค์) ──
export async function setSalaryProfileAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ + ด่านเงินเดือนระดับระบบ HR — สาขาประจำของพนักงานตรวจด้วย payTarget ด้านล่าง
  assertHrCan(auth, "hr.payroll.create");
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const baseBaht = Number(String(formData.get("baseSalaryBaht") ?? "").replace(/,/g, "").trim());
  if (!systemId || !employeeId || !Number.isFinite(baseBaht) || baseBaht < 0) return;
  const t = await payTarget(auth, { tenantId: auth.active.tenantId, systemId }, employeeId); // HR H1.1 ▸ สาขาประจำ ◂
  assertHrCan(auth, "hr.payroll.create", t.unitId);

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
    ...otHourlyRateOf(formData), // HR H2.9 ▸ #18 ◂
  });
  revalidate(systemId);
}
// HR H2.9 ▸ #18: ช่อง otHourlyRateBaht — ไม่มีช่อง = คงเดิม · ว่าง = ล้าง (null) · บาท (ทศนิยม ≤ 2 ตำแหน่ง) → สตางค์จำนวนเต็มจากสตริง (ไม่ผ่านทศนิยม) ·
//   รูปแบบผิด = 0 ⇒ service ปฏิเสธด้วยข้อความคงที่ (rateBad) · ต่ำกว่ากฎหมาย = rateBelowLaw (PayrollInputError) ◂
function otHourlyRateOf(formData: FormData): { otHourlyRateSatang?: number | null } {
  if (!formData.has("otHourlyRateBaht")) return {};
  const raw = String(formData.get("otHourlyRateBaht") ?? "").replace(/,/g, "").trim();
  if (!raw) return { otHourlyRateSatang: null };
  const m = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(raw);
  return { otHourlyRateSatang: m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : 0 };
}

// ── สร้างรอบจ่าย ──
// H0.2 ▸ R4 (D12): งวดตรวจด้วย PERIOD_RE ตัวเดียวกับ service (เดือน 01–12) · วันที่จ่ายต้องเป็นวันจริงตามปฏิทิน (2026-02-31 ไม่ปัดเป็น 3 มี.ค.) ·
//   คืน { ok, reason } ให้ฟอร์ม (CreateRunForm) แสดงเหตุผล — งวดผิด/วันผิด/งวดซ้ำ/ไม่มีใครต้องจ่าย ไม่เป็นหน้า error อีก ·
//   reason = ข้อความคงที่ของไฟล์นี้หรือของ PayrollInputError (ข้อความไทยที่ service เขียนเอง) เท่านั้น · ไม่มีสิทธิ์ = ข้อความในฟอร์ม ◂
const PERIOD_INVALID_FORM_TH = "เลือกงวด (ปี-เดือน) ให้ถูกต้อง — เดือนต้องอยู่ระหว่าง 01–12";
const PAYDATE_INVALID_FORM_TH = "วันที่จ่ายไม่ถูกต้อง — เลือกวันที่จ่ายใหม่";
function payDateFromForm(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v ? d : null;
}
export async function createPayrollRunAction(_prev: { ok: boolean; reason?: string } | null, formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  try {
    // ทุกสาขา: รอบจ่ายเป็นของทั้งระบบ HR (HQ20 · มติ 8)
    assertHrCan(auth, "hr.payroll.create");
    assertRunAllBranches(auth); // HR H1.1 R12 ▸ R12.3 รอบจ่ายครอบคลุมทุกสาขา ◂
    const systemId = String(formData.get("systemId") ?? "");
    const periodKey = String(formData.get("periodKey") ?? "").trim();
    const payDateStr = String(formData.get("payDate") ?? "").trim();
    if (!systemId) return { ok: false, reason: BAD_REQUEST_TH };
    if (!PERIOD_RE.test(periodKey)) return { ok: false, reason: PERIOD_INVALID_FORM_TH };
    const payDate = payDateFromForm(payDateStr);
    if (!payDate) return { ok: false, reason: PAYDATE_INVALID_FORM_TH };
    const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
    await createPayrollRun(ctx, { periodKey, payDate });
    revalidate(systemId);
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, reason: FORBIDDEN_TH };
    if (branchText(e)) return { ok: false, reason: branchText(e)! }; // HR H1.1 R12 ◂
    if (e instanceof PayrollInputError) return { ok: false, reason: e.message };
    throw e;
  }
}

// H0.1 ▸ CR3: ตัวเลขที่ผู้อนุมัติเห็นในแถว (hidden `expectNet` = ยอดจ่ายสุทธิรวม · `expectItems` = จำนวนคน) ◂
// H0.1 ▸ CR11: `expectGross` (เงินเดือนรวมที่เห็น) ไม่บังคับ — เป็นจำนวนเต็มเท่านั้นจึงส่งต่อ · ไม่มี/อ่านไม่ได้ = ไม่ใส่ (ไม่ปฏิเสธเพราะช่องนี้) ◂
// H0.1 ▸ CR16: `expectDigest` (ลายนิ้วมือแถวพนักงานที่หน้าคำนวณฝั่ง server) — sha256 hex 64 ตัวเท่านั้นจึงส่งต่อ · ไม่มี/รูปแบบผิด = ไม่ใส่ ◂
// H0.1 ▸ CR18: `expectNet` หรือ `expectItems` ไม่มี/ไม่ใช่จำนวนเต็ม = undefined ⇒ action ปฏิเสธ (ไม่อนุมัติแบบไม่มีตัวเลขที่เห็นเด็ดขาด) ◂
function approveExpectFromForm(formData: FormData): ApproveExpect | undefined {
  const int = (v: FormDataEntryValue | null) => {
    const n = typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN;
    return Number.isSafeInteger(n) ? n : undefined;
  };
  const net = int(formData.get("expectNet"));
  const items = int(formData.get("expectItems"));
  if (net === undefined || items === undefined) return undefined;
  const gross = int(formData.get("expectGross"));
  const digestRaw = formData.get("expectDigest");
  const digest = typeof digestRaw === "string" && /^[0-9a-f]{64}$/.test(digestRaw.trim()) ? digestRaw.trim() : undefined;
  return { totalNetSatang: net, itemCount: items, ...(gross !== undefined ? { totalGrossSatang: gross } : {}), ...(digest !== undefined ? { itemsDigest: digest } : {}) };
}

// H0.1 ▸ CR12 · CR13: ข้อความคงที่ที่แถวแสดง (ไม่ส่ง note/e.message ดิบถึงจอ) ◂
const FORBIDDEN_TH = "คุณไม่มีสิทธิ์ทำรายการนี้";
const BAD_REQUEST_TH = "คำสั่งไม่ถูกต้อง";
const APPROVE_STALE_TH = "ตัวเลขของรอบนี้เปลี่ยนไปแล้ว กรุณาดูยอดใหม่แล้วกดอนุมัติอีกครั้ง";
const APPROVE_NOT_DRAFT_TH = "รอบนี้ไม่ใช่ร่างแล้ว";
const APPROVE_POST_FAILED_TH = "ลงบัญชีไม่สำเร็จ รอบนี้ยังเป็นร่าง — ลองอนุมัติอีกครั้ง หรือให้ผู้ดูแลบัญชีตรวจสอบ";
const APPROVE_DRAFT_HAS_JV_TH = "รอบนี้มีเอกสารบัญชีค้างอยู่ ต้องให้ผู้ดูแลตรวจสอบก่อน"; // CR17
const APPROVE_MISSING_EXPECT_TH = "ไม่พบตัวเลขที่คุณเห็นบนหน้าจอ กรุณาโหลดหน้าใหม่แล้วกดอนุมัติอีกครั้ง"; // CR18

// ── อนุมัติรอบ (+ลงบัญชี) ──
//   H0.1 ▸ CR12: คืน { ok, reason } ให้แถว (RunRowActions) แสดงเหตุผลเมื่อไม่สำเร็จ (ตัวเลขเปลี่ยน · ไม่ใช่ร่างแล้ว · ลงบัญชีล้ม) ·
//   CR13: ไม่มีสิทธิ์ = คืนข้อความในแถว · ข้อผิดพลาดอื่น throw ตามเดิม (หน้า error) ◂
export async function approvePayrollRunAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  try {
    // ทุกสาขา: รอบจ่ายเป็นของทั้งระบบ HR (HQ20 · มติ 8)
    assertHrCan(auth, "hr.payroll.approve");
    assertRunAllBranches(auth); // HR H1.1 R12 ▸ R12.3 รอบจ่ายครอบคลุมทุกสาขา ◂
    const systemId = String(formData.get("systemId") ?? "");
    const runId = String(formData.get("runId") ?? "");
    if (!systemId || !runId) return { ok: false, reason: BAD_REQUEST_TH };
    const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
    const expect = approveExpectFromForm(formData);
    // CR18: ไม่มีตัวเลขที่ผู้กดเห็น = ไม่เรียก approveRun เลย (service ที่ไม่มี expect มีไว้ให้สคริปต์/ข้อสอบเท่านั้น)
    if (expect === undefined) return { ok: false, reason: APPROVE_MISSING_EXPECT_TH };
    // CR19: ส่งผู้ใช้ใน session ⇒ service ลงประวัติคำปฏิเสธ (hr.payroll.approve.refused) พร้อมตัวเลขที่เห็น/ตัวเลขจริง
    const res = await approveRun(ctx, runId, expect, { userId: auth.active.userId, isOwner: auth.active.role === "OWNER" });
    await writeAudit({
      tenantId: auth.active.tenantId,
      actorId: auth.user.id,
      action: "hr.payroll.approve",
      targetType: "HrPayrollRun",
      targetId: runId,
      after: { ok: res.ok, note: res.note },
    });
    revalidate(systemId);
    if (res.ok) return { ok: true };
    if (res.code === "WORK_ENTRIES") return { ok: false, reason: res.note }; // HR H3.1 ▸ ข้อความคงที่ WE_TEXT.approveBlocked ของ service ◂
    if (String(res.code ?? "").startsWith("ATTENDANCE_")) return { ok: false, reason: res.note }; // HR H3.2 ◂ ข้อความคงที่ของด่านหักสาย/ขาด (ATT_TEXT)
    const reason =
      res.code === "STALE"
        ? APPROVE_STALE_TH
        : res.code === "POST_FAILED"
          ? APPROVE_POST_FAILED_TH
          : res.code === "DRAFT_HAS_JV"
            ? APPROVE_DRAFT_HAS_JV_TH
            : res.code === "NEGATIVE_NET"
              ? res.note // H0.2 ▸ R3: ข้อความคงที่ของ service (approveNegativeNetText · N คน) — ไม่ใช่ข้อความดิบของ error ◂
              : APPROVE_NOT_DRAFT_TH;
    return { ok: false, reason };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, reason: FORBIDDEN_TH };
    if (branchText(e)) return { ok: false, reason: branchText(e)! }; // HR H1.1 R12 ◂
    throw e;
  }
}

// ── กลับรายการเงินเดือน (APPROVED/PAID → REVERSED + กลับ JV) — WO Wave2-K ──
// สิทธิ์ hr.payroll.approve (คนที่อนุมัติได้ = กลับรายการได้) + ด่าน canViewPayroll ใน assertHrCan
export async function reverseRunAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: รอบจ่ายเป็นของทั้งระบบ HR (HQ20 · มติ 8)
  assertHrCan(auth, "hr.payroll.reverse"); // HR H3.4 ▸ R8: กลับรายการ = คีย์ของตัวเอง (เดิมใช้คีย์อนุมัติ) ◂
  assertRunAllBranches(auth); // HR H1.1 R12 ▸ R12.3 รอบจ่ายครอบคลุมทุกสาขา ◂
  const systemId = String(formData.get("systemId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  if (!systemId || !runId) return;
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  // HR H0.6 ▸ R2 · OQ-5: ผู้กด (actor) ส่งเข้า service — reverseRun ลงประวัติเอง (สำเร็จ `hr.payroll.reverse` · ปฏิเสธ `hr.payroll.reverse.refused`)
  //   ⇒ ไม่ลง audit ซ้ำที่ชั้น action (เดิมกดครั้งเดียวได้ 2 แถว) · สิทธิ์เดิม hr.payroll.approve + canViewPayroll (ไม่เปลี่ยน) ◂
  await reverseRun(ctx, runId, reason, { userId: auth.active.userId, isOwner: auth.active.role === "OWNER" });
  revalidate(systemId);
}

// ── จ่ายแล้ว ──
export async function markPaidAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: รอบจ่ายเป็นของทั้งระบบ HR (HQ20 · มติ 8)
  assertHrCan(auth, "hr.payroll.pay");
  assertRunAllBranches(auth); // HR H1.1 R12 ▸ R12.3 รอบจ่ายครอบคลุมทุกสาขา ◂
  const systemId = String(formData.get("systemId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  if (!systemId || !runId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const res = await markPaidRun(ctx, runId, { actor: { userId: auth.active.userId, isOwner: auth.active.role === "OWNER" } }); // HR H3.7 ▸ รุ่น 1 = markPaid เดิม · รุ่น 2 ที่ลงบัญชีแล้ว = ลงรายการจ่าย (บัญชีจ่ายที่ตั้งไว้) ◂
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
function membershipOf(auth: Awaited<ReturnType<typeof requireTenant>>) {
  return {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
}
function assertRequestAdjust(auth: Awaited<ReturnType<typeof requireTenant>>) {
  assertCan(membershipOf(auth), { module: "hr", action: "hr.payadjust.request" });
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
  // HR H1.1 ▸ R5: ยื่นให้ได้เฉพาะพนักงานในสาขาของผู้ยื่น (สาขาประจำ หรือยืมตัวที่เปิดวันนี้) — ตรวจก่อนอ่านอะไรที่ขึ้นกับเงินเดือน ◂
  try {
    const t = await payTarget(auth, { tenantId: auth.active.tenantId, systemId }, employeeId, new Date());
    assertCan(membershipOf(auth), { module: "hr", action: "hr.payadjust.request", ...(t.unitId ? { unitId: t.unitId } : {}) });
  } catch (e) {
    if (branchText(e)) return { status: "error", message: branchText(e)! };
    throw e;
  }
  const hours = hoursRaw ? Number(hoursRaw) : undefined;
  // HF-HR-0 ▸ รอบ 5 (R5.2): ผู้ไม่ดูเงินเดือน — ชั่วโมง OT นอกตาราง 0.25 (0.25–744) ⇒ คำปฏิเสธกลาง ก่อนอ่านอะไรที่ขึ้นกับเงินเดือน ◂
  const offGrid = screenOtHoursForViewer(canViewPayroll(membershipOf(auth)), { kind, hours });
  if (offGrid) return offGrid;
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
  // HF-HR-0: ผู้ยื่นที่ไม่ใช่ผู้ดูเงินเดือน ไม่เห็นยอดที่คิดจากเงินเดือน และไม่รู้ว่ามีโปรไฟล์เงินเดือนไหม
  const reply = adjustmentReplyForViewer(canViewPayroll(membershipOf(auth)), res, { byHours: kind === "OT" && hours !== undefined }); // HF-HR-0 ▸ รอบ 4 (R4.6) ◂
  if (res.ok) revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  return reply;
}

// HF-HR-0 ▸ รอบ 5c (F5 · F3): ปุ่มอนุมัติ/ไม่อนุมัติ/ลบ คืนผลเป็นข้อมูล { ok, reason } — เหตุผลที่ถูกปฏิเสธ (H1/E1/F1) ต้องถึงจอ
//   (แสดงในแถวโดย PayAdjustRowActions) · ข้อผิดพลาดที่ไม่คาดคิด = console.error + ข้อความกลาง (ห้ามคืน e.message — production ไม่ปิดข้อมูลที่คืน) ◂
const UNEXPECTED_TH = "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง";

export async function decideAdjustmentAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  // อนุมัติ = สิทธิ์แตะเงินเดือน (ผ่านด่าน PDPA เหมือน action เงินเดือนอื่น)
  // ทุกสาขา: ด่านคีย์ระดับระบบ HR — สาขาของเจ้าของรายการตรวจด้วย payTarget ด้านล่าง
  const decision = String(formData.get("status") ?? ""); // HR H3.4 ▸ R8: ปฏิเสธ = hr.payadjust.reject · อนุมัติ = hr.payadjust.approve ◂
  if (decision === "REJECTED") assertHrCan(auth, "hr.payadjust.reject"); // HR H3.4 ◂ ทุกสาขา: ด่านคีย์ก่อน — สาขาของเจ้าของรายการ = payTarget + assertHrCan(…, t.unitId) ด้านล่าง
  else assertHrCan(auth, "hr.payadjust.approve"); // HR H3.4 ◂ ทุกสาขา: ด่านคีย์ก่อน — สาขาของเจ้าของรายการ = payTarget + assertHrCan(…, t.unitId) ด้านล่าง
  const systemId = String(formData.get("systemId") ?? "");
  const id = String(formData.get("id") ?? "");
  const status = decision; // HR H3.4 ◂
  if (!systemId || !id || (status !== "APPROVED" && status !== "REJECTED")) return { ok: false, reason: "คำสั่งไม่ถูกต้อง" };
  try {
    const ctx0: Ctx = { tenantId: auth.active.tenantId, systemId };
    const t = await payTarget(auth, ctx0, await employeeIdOfAdjustment(ctx0, id), new Date()); // HR H1.1 ▸ ◂
    assertHrCan(auth, decision === "REJECTED" ? "hr.payadjust.reject" : "hr.payadjust.approve", t.unitId); // HR H3.4 ◂
  } catch (e) {
    if (branchText(e)) return { ok: false, reason: branchText(e)! };
    throw e;
  }
  try {
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
        // CRM C3.3-fix (รีวิวเงิน note c): รายการคอมมิชชันที่งวดเดิมมีรอบจ่ายแล้วถูกย้ายงวดพร้อมการอนุมัติ ⇒ บันทึก from → to
        ...(res.movedTo ? { before: { periodKey: res.movedFrom }, after: { periodKey: res.movedTo, reason: res.reason } } : {}),
      });
    }
    revalidatePath(`/app/sys/${systemId}/hr/payroll`);
    return res.ok ? { ok: true, ...(res.reason ? { reason: res.reason } : {}) } : { ok: false, reason: res.reason ?? "ตัดสินรายการไม่สำเร็จ" };
  } catch (e) {
    console.error("[hr.payadjust.decide]", e);
    return { ok: false, reason: UNEXPECTED_TH };
  }
}

export async function cancelAdjustmentAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับระบบ HR — สาขาของเจ้าของรายการตรวจด้วย payTarget ด้านล่าง
  assertHrCan(auth, "hr.payadjust.approve");
  const systemId = String(formData.get("systemId") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!systemId || !id) return { ok: false, reason: "คำสั่งไม่ถูกต้อง" };
  try {
    const ctx0: Ctx = { tenantId: auth.active.tenantId, systemId };
    const t = await payTarget(auth, ctx0, await employeeIdOfAdjustment(ctx0, id), new Date()); // HR H1.1 ▸ ◂
    assertHrCan(auth, "hr.payadjust.approve", t.unitId);
  } catch (e) {
    if (branchText(e)) return { ok: false, reason: branchText(e)! };
    throw e;
  }
  try {
    // HF-HR-0 ▸ รอบ 5c (F1): ส่งผู้ใช้จริง ⇒ service ตรวจ "แถวของตัวเอง" + เขียนประวัติการลบ ◂
    const res = await cancelAdjustment({ tenantId: auth.active.tenantId, systemId }, id, { userId: auth.active.userId, isOwner: auth.active.role === "OWNER" });
    revalidatePath(`/app/sys/${systemId}/hr/payroll`);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason ?? "ลบรายการไม่สำเร็จ" };
  } catch (e) {
    console.error("[hr.payadjust.delete]", e);
    return { ok: false, reason: UNEXPECTED_TH };
  }
}

// ─────────── H0.1 ▸ R6: ลบร่าง / คำนวณใหม่ ของรอบจ่ายที่ยังเป็นร่าง (DRAFT) ───────────
//   สิทธิ์ hr.payroll.create (คนสร้างรอบได้ = แก้ร่างได้) + ด่าน canViewPayroll ใน assertHrCan (OWNER หรือผู้ดูเงินเดือน) ·
//   ผู้ทำ = ผู้ใช้ใน session เท่านั้น · คืน { ok, reason } ให้แถว (RunRowActions) แสดงเหตุผล · ประวัติเขียนใน service
//   (hr.payroll.delete_draft / hr.payroll.recompute) · CR13: ไม่มีสิทธิ์ (ForbiddenError) = คืนข้อความในแถว · ข้อผิดพลาดอื่น throw (หน้า error)
//   — ไม่มีทางไหนคืนข้อความดิบของ error ◂
export async function deleteDraftRunAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  try {
    // ทุกสาขา: รอบจ่ายเป็นของทั้งระบบ HR (HQ20 · มติ 8)
    assertHrCan(auth, "hr.payroll.create");
    assertRunAllBranches(auth); // HR H1.1 R12 ▸ R12.3 รอบจ่ายครอบคลุมทุกสาขา ◂
    const systemId = String(formData.get("systemId") ?? "");
    const runId = String(formData.get("runId") ?? "");
    if (!systemId || !runId) return { ok: false, reason: BAD_REQUEST_TH };
    const res = await deleteDraftRun({ tenantId: auth.active.tenantId, systemId }, runId, { userId: auth.active.userId, isOwner: auth.active.role === "OWNER" });
    revalidate(systemId);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, reason: FORBIDDEN_TH };
    if (branchText(e)) return { ok: false, reason: branchText(e)! }; // HR H1.1 R12 ◂
    throw e;
  }
}

export async function recomputeDraftRunAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  try {
    // ทุกสาขา: รอบจ่ายเป็นของทั้งระบบ HR (HQ20 · มติ 8)
    assertHrCan(auth, "hr.payroll.create");
    assertRunAllBranches(auth); // HR H1.1 R12 ▸ R12.3 รอบจ่ายครอบคลุมทุกสาขา ◂
    const systemId = String(formData.get("systemId") ?? "");
    const runId = String(formData.get("runId") ?? "");
    if (!systemId || !runId) return { ok: false, reason: BAD_REQUEST_TH };
    const res = await recomputeDraftRun({ tenantId: auth.active.tenantId, systemId }, runId, { userId: auth.active.userId, isOwner: auth.active.role === "OWNER" });
    revalidate(systemId);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, reason: FORBIDDEN_TH };
    if (branchText(e)) return { ok: false, reason: branchText(e)! }; // HR H1.1 R12 ◂
    throw e;
  }
}

// ─────────── H0.2 ▸ R2: "ย้ายไปงวดถัดไป" ของรายการค้าง (งวดมีรอบจ่ายแล้ว · รายการปกติ) ───────────
//   สิทธิ์เดียวกับอนุมัติรายการ (hr.payadjust.approve + ด่าน canViewPayroll) · ผู้ทำ = ผู้ใช้ใน session · คืน { ok, reason } ให้แถวแสดง ·
//   ประวัติ `hr.payadjust.move` เขียนใน service · ไม่มีสิทธิ์ = ข้อความในแถว · ข้อผิดพลาดอื่น throw (ไม่คืนข้อความดิบ) ◂
export async function moveStrandedAdjustmentAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  try {
    // ทุกสาขา: ด่านคีย์ระดับระบบ HR — สาขาของเจ้าของรายการตรวจด้วย payTarget ด้านล่าง
    assertHrCan(auth, "hr.payadjust.approve");
    const systemId = String(formData.get("systemId") ?? "");
    const id = String(formData.get("id") ?? "");
    if (!systemId || !id) return { ok: false, reason: BAD_REQUEST_TH };
    const ctx0: Ctx = { tenantId: auth.active.tenantId, systemId };
    const t = await payTarget(auth, ctx0, await employeeIdOfAdjustment(ctx0, id), new Date()); // HR H1.1 ▸ ◂
    assertHrCan(auth, "hr.payadjust.approve", t.unitId);
    const res = await moveStrandedAdjustment({ tenantId: auth.active.tenantId, systemId }, id, { userId: auth.active.userId, isOwner: auth.active.role === "OWNER" });
    revalidatePath(`/app/sys/${systemId}/hr/payroll`);
    return res.ok ? { ok: true, reason: `ย้ายไปงวด ${res.movedTo} แล้ว` } : { ok: false, reason: res.reason };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, reason: FORBIDDEN_TH };
    if (branchText(e)) return { ok: false, reason: branchText(e)! }; // HR H1.1 ◂
    throw e;
  }
}

// ─────────── HR H3.4 ▸ รอบจ่ายรุ่น 2 (ภาพ 06) — ทุกปุ่มคืนผลเป็นข้อมูล { ok, reason/note } (ข้อความคงที่ของ service) · รอบจ่ายครอบคลุมทุกสาขา ───────────
//   สร้าง/ดึงข้อมูลใหม่ = hr.payroll.create · อนุมัติ = hr.payroll.approve · รุ่นเครื่อง = เจ้าของร้าน (service) · ยืนยันสาขา = ผู้จัดการสาขา/เจ้าของ (service) ·
//   หนังสือยินยอม = hr.payadjust.approve ในสาขา (service ตรวจซ้ำ) · ผู้กด (actor) = ผู้ใช้ใน session เสมอ
const H34_UNEXPECTED = "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง";
async function h34Guard<T>(fn: () => Promise<T>): Promise<T | { ok: false; reason: string }> {
  try {
    return await fn();
  } catch (e) {
    if (branchText(e)) return { ok: false, reason: branchText(e)! };
    if (e instanceof ForbiddenError) return { ok: false, reason: RUN2_TEXT.no };
    console.error("[hr.run2]", e);
    return { ok: false, reason: H34_UNEXPECTED };
  }
}
const h34Actor = (auth: Awaited<ReturnType<typeof requireTenant>>) => ({ userId: auth.active.userId, isOwner: auth.active.role === "OWNER" });
const h34Day = (v: FormDataEntryValue | null): Date | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00+07:00`) : null);
export async function createPayrollRunV2Action(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    // HR H3.4 ▸ ทุกสาขา: รอบจ่ายครอบคลุมทุกสาขา (HQ20 · มติ 8) — ผู้จำกัดสาขาถูกปฏิเสธด้วย assertRunAllBranches บรรทัดถัดไป ◂
    assertHrCan(auth, "hr.payroll.create");
    assertRunAllBranches(auth);
    const systemId = String(formData.get("systemId") ?? "");
    const periodKey = String(formData.get("periodKey") ?? "").trim();
    const payDate = h34Day(formData.get("payDate"));
    if (!systemId) return { ok: false as const, reason: "คำสั่งไม่ถูกต้อง" };
    const r = await createPayrollRunV2({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { periodKey, payDate: payDate as Date }, { actor: h34Actor(auth) });
    revalidate(systemId);
    return r.ok ? { ok: true as const, id: r.id } : { ok: false as const, reason: r.reason };
  });
}
export async function recomputeRunV2Action(formData: FormData): Promise<{ ok: true; note: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    // HR H3.4 ▸ ทุกสาขา: รอบจ่ายครอบคลุมทุกสาขา (HQ20 · มติ 8) — ผู้จำกัดสาขาถูกปฏิเสธด้วย assertRunAllBranches บรรทัดถัดไป ◂
    assertHrCan(auth, "hr.payroll.create");
    assertRunAllBranches(auth);
    const systemId = String(formData.get("systemId") ?? "");
    const runId = String(formData.get("runId") ?? "");
    if (!systemId || !runId) return { ok: false as const, reason: "คำสั่งไม่ถูกต้อง" };
    const fn = recomputeDraftRun as unknown as (c: Ctx, id: string, a: { userId: string | null; isOwner: boolean }, o: { viewer: ReturnType<typeof hrViewerOf> }) => ReturnType<typeof recomputeDraftRun>;
    const r = await fn({ tenantId: auth.active.tenantId, systemId }, runId, h34Actor(auth), { viewer: hrViewerOf(auth) });
    revalidate(systemId);
    return r;
  });
}
export async function approveRunV2Action(formData: FormData): Promise<{ ok: boolean; note?: string; reason?: string }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    // HR H3.4 ▸ ทุกสาขา: รอบจ่ายครอบคลุมทุกสาขา (HQ20 · มติ 8) — ผู้จำกัดสาขาถูกปฏิเสธด้วย assertRunAllBranches บรรทัดถัดไป ◂
    assertHrCan(auth, "hr.payroll.approve");
    assertRunAllBranches(auth);
    const systemId = String(formData.get("systemId") ?? "");
    const runId = String(formData.get("runId") ?? "");
    const net = Number(formData.get("net"));
    const items = Number(formData.get("items"));
    if (!systemId || !runId) return { ok: false, reason: "คำสั่งไม่ถูกต้อง" };
    const r = await approveRun({ tenantId: auth.active.tenantId, systemId }, runId, Number.isSafeInteger(net) && Number.isSafeInteger(items) ? { totalNetSatang: net, itemCount: items } : undefined, h34Actor(auth));
    revalidate(systemId);
    return r.ok ? { ok: true, note: r.note } : { ok: false, reason: h37PageText(r) }; // HR H3.7 ▸ ข้อความที่มีค่า (งวด/ชื่อบัญชี) → ข้อความคงที่ ◂
  });
}
// fix r1 F7: จ่าย/กลับรายการของหน้ารอบรุ่น 2 คืนผลจริง (ไม่ใช่ "บันทึกแล้ว" เสมอ) — ไม่มีสิทธิ์ = ข้อความคงที่ในหน้า
export async function payRunV2Action(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    // HR H3.4 ▸ ทุกสาขา: รอบจ่ายครอบคลุมทุกสาขา (HQ20 · มติ 8) — ผู้จำกัดสาขาถูกปฏิเสธด้วย assertRunAllBranches บรรทัดถัดไป ◂
    assertHrCan(auth, "hr.payroll.pay");
    assertRunAllBranches(auth);
    const systemId = String(formData.get("systemId") ?? "");
    const runId = String(formData.get("runId") ?? "");
    if (!systemId || !runId) return { ok: false, reason: "คำสั่งไม่ถูกต้อง" };
    const r = await markPaidRun({ tenantId: auth.active.tenantId, systemId }, runId, { financeAccountId: String(formData.get("financeAccountId") ?? "").trim() || null, paidOn: String(formData.get("paidOn") ?? "").trim() || null, actor: h34Actor(auth) }); // HR H3.7 ◂
    revalidate(systemId);
    return r.ok ? { ok: true } : { ok: false, reason: h37PageText(r) }; // HR H3.7 ◂
  });
}
export async function reverseRunV2Action(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    // HR H3.4 ▸ ทุกสาขา: รอบจ่ายครอบคลุมทุกสาขา (HQ20 · มติ 8) — ผู้จำกัดสาขาถูกปฏิเสธด้วย assertRunAllBranches บรรทัดถัดไป ◂
    assertHrCan(auth, "hr.payroll.reverse");
    assertRunAllBranches(auth);
    const systemId = String(formData.get("systemId") ?? "");
    const runId = String(formData.get("runId") ?? "");
    if (!systemId || !runId) return { ok: false, reason: "คำสั่งไม่ถูกต้อง" };
    const r = await reverseRun({ tenantId: auth.active.tenantId, systemId }, runId, String(formData.get("reason") ?? "").trim() || undefined, h34Actor(auth));
    revalidate(systemId);
    return r.ok ? { ok: true } : { ok: false, reason: r.note };
  });
}
export async function confirmBranchHoursAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    const systemId = String(formData.get("systemId") ?? "");
    const r = await confirmBranchHours({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { runId: String(formData.get("runId") ?? ""), unitId: String(formData.get("unitId") ?? "") });
    if (systemId) revalidate(systemId);
    return r;
  });
}
export async function setPayrollEngineAction(formData: FormData): Promise<{ ok: boolean; reason?: string; warnings?: string[] }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    const systemId = String(formData.get("systemId") ?? "");
    const pct = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v === "" ? undefined : /^\d{1,3}(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : -1; };
    const r = await setPayrollEngine({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { engineVersion: Number(formData.get("engineVersion")), catCapBp: pct("catCapPct"), totalCapBp: pct("totalCapPct") });
    revalidatePath(`/app/sys/${systemId}/hr/settings`);
    return r.ok ? { ok: true, warnings: r.warnings } : { ok: false, reason: r.reason };
  });
}
export async function setAdjustmentConsentAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    const systemId = String(formData.get("systemId") ?? "");
    const r = await setAdjustmentConsent({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { id: String(formData.get("id") ?? ""), consent: formData.get("consent") === "1" });
    if (systemId) revalidate(systemId);
    return r;
  });
}
// ◂ HR H3.4

// ═══════════════════ HR H3.7 ▸ สมุดบัญชีเงินเดือน + บัญชีจ่ายเงินเดือน (เจ้าของร้านเท่านั้น — service ตรวจบทบาทเอง · ไม่มี assertHrCan) ═══════════════════
export async function setPayrollBookAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    const systemId = String(formData.get("systemId") ?? "");
    if (!systemId) return { ok: false, reason: "คำสั่งไม่ถูกต้อง" };
    const raw = String(formData.get("accountSystemId") ?? "").trim();
    const r = await setPayrollBook({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { accountSystemId: raw || null });
    revalidatePath(`/app/sys/${systemId}/hr/settings`);
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  });
}
export async function setPayrollPayAccountAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    const systemId = String(formData.get("systemId") ?? "");
    if (!systemId) return { ok: false, reason: "คำสั่งไม่ถูกต้อง" };
    const raw = String(formData.get("financeAccountId") ?? "").trim();
    const r = await setPayrollPayAccount({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { financeAccountId: raw || null });
    revalidatePath(`/app/sys/${systemId}/hr/settings`);
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  });
}
export async function setPayrollPostingAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  return h34Guard(async () => {
    const systemId = String(formData.get("systemId") ?? "");
    if (!systemId) return { ok: false, reason: "คำสั่งไม่ถูกต้อง" };
    const r = await setPayrollPosting({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { on: formData.get("on") === "1" });
    revalidatePath(`/app/sys/${systemId}/hr/settings`);
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  });
}
// ◂ HR H3.7
