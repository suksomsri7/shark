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
  requestAdjustment,
  reverseRun,
  setSalaryProfile,
  type AdjustKind,
  type ApproveExpect,
  type Ctx,
} from "./payroll";
import { adjustmentReplyForViewer, screenOtHoursForViewer } from "./privacy";

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
    assertHrCan(auth, "hr.payroll.approve");
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
    const reason =
      res.code === "STALE"
        ? APPROVE_STALE_TH
        : res.code === "POST_FAILED"
          ? APPROVE_POST_FAILED_TH
          : res.code === "DRAFT_HAS_JV"
            ? APPROVE_DRAFT_HAS_JV_TH
            : APPROVE_NOT_DRAFT_TH;
    return { ok: false, reason };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, reason: FORBIDDEN_TH };
    throw e;
  }
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
  assertHrCan(auth, "hr.payadjust.approve");
  const systemId = String(formData.get("systemId") ?? "");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!systemId || !id || (status !== "APPROVED" && status !== "REJECTED")) return { ok: false, reason: "คำสั่งไม่ถูกต้อง" };
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
  assertHrCan(auth, "hr.payadjust.approve");
  const systemId = String(formData.get("systemId") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!systemId || !id) return { ok: false, reason: "คำสั่งไม่ถูกต้อง" };
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
    assertHrCan(auth, "hr.payroll.create");
    const systemId = String(formData.get("systemId") ?? "");
    const runId = String(formData.get("runId") ?? "");
    if (!systemId || !runId) return { ok: false, reason: BAD_REQUEST_TH };
    const res = await deleteDraftRun({ tenantId: auth.active.tenantId, systemId }, runId, { userId: auth.active.userId, isOwner: auth.active.role === "OWNER" });
    revalidate(systemId);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, reason: FORBIDDEN_TH };
    throw e;
  }
}

export async function recomputeDraftRunAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  try {
    assertHrCan(auth, "hr.payroll.create");
    const systemId = String(formData.get("systemId") ?? "");
    const runId = String(formData.get("runId") ?? "");
    if (!systemId || !runId) return { ok: false, reason: BAD_REQUEST_TH };
    const res = await recomputeDraftRun({ tenantId: auth.active.tenantId, systemId }, runId, { userId: auth.active.userId, isOwner: auth.active.role === "OWNER" });
    revalidate(systemId);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, reason: FORBIDDEN_TH };
    throw e;
  }
}
