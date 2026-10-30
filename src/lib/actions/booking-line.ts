"use server";

// SVC B.5 — server actions ของจอคิววันนี้แถวเดียว (ใบสั่ง §3.5) · ทุกตัว (unitSlug, formData):
//   requireUnit → lineAccess(membership, unit) → authorizeLineOp (ด่านเดียวกับปุ่ม · งานของตัวเองตรวจด้วย myStaffIds) → facade (ctx มี actorUserId)
//   ล้ม/ไม่มีสิทธิ์ ⇒ redirect กลับหน้าเดิม ?err= (เหตุผลไทย ≤ 300) · สำเร็จ ⇒ scheduleDrain + revalidatePath /booking · /booking/mine · /booking/day
//   🔴 นาฬิกา QC: ฟิลด์ `at` ใช้เฉพาะเมื่อ process.env.SVC_QC_CLOCK === "1" (prod ไม่ตั้ง ⇒ นาฬิกาจริงเสมอ)
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { logOps } from "@/lib/core/ops";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { assertLineAccess, canCancelStale, type LineMember } from "@/lib/modules/booking/line-access";
import { authorizeLineOp, type LineViewer } from "@/lib/modules/booking/today-line";
import { moveJobStaff, recallJob, skipJob } from "@/lib/modules/booking/line-ops";
import { callJob, cancelByShop, checkIn, createWalkIn, startJob } from "@/lib/modules/booking/queue-line";
import { amendServiceBill, authorizeServiceBillOp, cancelServiceBill, finishJob, markPaidWithoutPos, voidPaidServiceBill, type ExtraLine, type ServiceBillOp } from "@/lib/modules/booking/finish"; // SVC B.10 ◂
import { setAppointmentStatus } from "@/lib/modules/booking/service";

type Auth = Awaited<ReturnType<typeof requireUnit>>["auth"];
type Unit = Awaited<ReturnType<typeof requireUnit>>["unit"];
type Gate = { ctx: { tenantId: string; unitId: string; actorUserId: string }; viewer: LineViewer; now: Date; id: string; back: string; qcAt: string | null };

/** ผู้ดู + นาฬิกา + ปลายทางกลับ (ไม่แตะฐาน — ด่านจริงคือ authorizeLineOp ที่ผู้เรียกเรียกถัดไป) */
function gateOf(auth: Auth, unit: Unit, unitSlug: string, formData: FormData): Gate {
  const m: LineMember = {
    role: auth.active.role as LineMember["role"],
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  const qcRaw = process.env.SVC_QC_CLOCK === "1" ? String(formData.get("at") ?? "") : "";
  const qcDate = qcRaw ? new Date(qcRaw) : null;
  const qcOk = !!qcDate && !Number.isNaN(qcDate.getTime());
  const from = String(formData.get("from") ?? "");
  const back = `/app/u/${unitSlug}/booking${from === "mine" ? "/mine" : ""}`;
  return {
    ctx: { tenantId: auth.active.tenantId, unitId: unit.id, actorUserId: auth.user.id },
    viewer: { userId: auth.user.id, access: assertLineAccess(m, unit.id), cancelStale: canCancelStale(m, unit.id) },
    now: qcOk ? qcDate! : new Date(),
    id: String(formData.get("appointmentId") ?? ""),
    back,
    qcAt: qcOk ? qcRaw : null,
  };
}

/** ไม่ผ่านด่าน/facade ล้ม ⇒ กลับหน้าเดิมพร้อมเหตุผล (redirect โยน control-flow ของ Next — ห้ามครอบ try) */
function bounce(g: Gate, reason: string): never {
  const q = new URLSearchParams({ err: (reason || "ทำรายการไม่สำเร็จ").slice(0, 300) });
  if (g.qcAt) q.set("at", g.qcAt);
  redirect(`${g.back}?${q.toString()}`);
}

function after(unitSlug: string, g: Gate, r: { ok: boolean; reason?: string }): void {
  if (!r.ok) bounce(g, r.reason ?? "");
  scheduleDrain();
  revalidatePath(`/app/u/${unitSlug}/booking`);
  revalidatePath(`/app/u/${unitSlug}/booking/mine`);
  revalidatePath(`/app/u/${unitSlug}/booking/day`);
}

export async function callJobAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeLineOp(g.ctx, g.viewer, "call", g.id, { now: g.now });
  if (!a.ok) bounce(g, a.reason);
  after(unitSlug, g, await callJob(g.ctx, g.id, { now: g.now }));
}

export async function recallJobAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeLineOp(g.ctx, g.viewer, "recall", g.id, { now: g.now });
  if (!a.ok) bounce(g, a.reason);
  after(unitSlug, g, await recallJob(g.ctx, g.id, { now: g.now }));
}

export async function skipJobAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeLineOp(g.ctx, g.viewer, "skip", g.id, { now: g.now });
  if (!a.ok) bounce(g, a.reason);
  after(unitSlug, g, await skipJob(g.ctx, g.id, { now: g.now }));
}

export async function startJobAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeLineOp(g.ctx, g.viewer, "start", g.id, { now: g.now });
  if (!a.ok) bounce(g, a.reason);
  after(unitSlug, g, await startJob(g.ctx, g.id, { now: g.now }));
}

export async function completeJobAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeLineOp(g.ctx, g.viewer, "done", g.id, { now: g.now });
  if (!a.ok) bounce(g, a.reason);
  // SVC B.10 ▸ ปุ่ม "เสร็จ" บนจอคิว = finishJob ไม่มีของเพิ่ม (เปิดบิลจากคิวในธุรกรรมเดียวกับ DONE · สาขาเดิม/ไม่มี POS = เสร็จอย่างเดียว) ◂
  after(unitSlug, g, await finishJob(g.ctx, g.id, { now: g.now }));
}

// ───────────────── SVC B.10 ▸ แผ่นจบงาน (ภาพ 07 ก) · บิลจากคิว — ด่าน authorizeServiceBillOp (อ่าน Membership สดทุกครั้ง) ◂ ─────────────────
/** ของที่ทำเพิ่มจากฟอร์ม (`extras` = JSON [{kind, serviceId|productId, qty, staffId}]) — ราคาไม่ถูกรับ (server คิดเอง) · ผิดรูป = null */
function extrasOf(formData: FormData): ExtraLine[] | null {
  const raw = String(formData.get("extras") ?? "").trim();
  if (!raw) return [];
  if (raw.length > 8_000) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as ExtraLine[]) : null;
  } catch {
    return null;
  }
}
async function billGate(unitSlug: string, formData: FormData, op: ServiceBillOp): Promise<Gate> {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeServiceBillOp(g.ctx, auth.user.id, op, g.id);
  if (!a.ok) bounce(g, a.reason);
  return g;
}

export async function finishJobAction(unitSlug: string, formData: FormData) {
  const g = await billGate(unitSlug, formData, "finish");
  const extras = extrasOf(formData);
  if (!extras) bounce(g, "รายการที่ทำเพิ่มไม่ถูกต้อง");
  after(unitSlug, g, await finishJob(g.ctx, g.id, { extras, now: g.now }));
}

export async function amendServiceBillAction(unitSlug: string, formData: FormData) {
  const g = await billGate(unitSlug, formData, "amend");
  const extras = extrasOf(formData);
  if (!extras) bounce(g, "รายการที่ทำเพิ่มไม่ถูกต้อง");
  after(unitSlug, g, await amendServiceBill(g.ctx, g.id, { extras }));
}

export async function cancelServiceBillAction(unitSlug: string, formData: FormData) {
  const g = await billGate(unitSlug, formData, "cancel");
  after(unitSlug, g, await cancelServiceBill(g.ctx, g.id, { reason: String(formData.get("reason") ?? "") }));
}

export async function markPaidAction(unitSlug: string, formData: FormData) {
  const g = await billGate(unitSlug, formData, "markPaid");
  after(unitSlug, g, await markPaidWithoutPos(g.ctx, g.id, { now: g.now }));
}

export async function moveJobStaffAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeLineOp(g.ctx, g.viewer, "move", g.id, { now: g.now });
  if (!a.ok) bounce(g, a.reason);
  after(unitSlug, g, await moveJobStaff(g.ctx, g.id, String(formData.get("toStaffId") ?? ""), { now: g.now }));
}

export async function checkInAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeLineOp(g.ctx, g.viewer, "checkin", g.id, { now: g.now });
  if (!a.ok) bounce(g, a.reason);
  after(unitSlug, g, await checkIn(g.ctx, { appointmentId: g.id }, { via: "STAFF", now: g.now }));
}

export async function noShowAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeLineOp(g.ctx, g.viewer, "noshow", g.id, { now: g.now });
  if (!a.ok) bounce(g, a.reason);
  const st = await setAppointmentStatus(g.ctx.tenantId, g.ctx.unitId, g.id, "NO_SHOW", { actorUserId: g.ctx.actorUserId });
  // สถานะ NO_SHOW บันทึกแล้วแต่ริบมัดจำล้ม (ผลมี forfeit) ⇒ log แบบจอเดิม · ล้มอย่างอื่นไม่ใช่เรื่องริบ
  if (!st.ok && "forfeit" in st) await logOps("WARN", "pos.deposit.forfeit_failed", `ริบมัดจำนัด ${g.id} ไม่สำเร็จ`, { tenantId: g.ctx.tenantId, detail: st.reason });
  after(unitSlug, g, st);
}

export async function cancelJobAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeLineOp(g.ctx, g.viewer, "cancel", g.id, { now: g.now });
  if (!a.ok) bounce(g, a.reason);
  after(unitSlug, g, await cancelByShop(g.ctx, g.id, { now: g.now }));
}

export async function walkInAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  const g = gateOf(auth, unit, unitSlug, formData);
  const a = await authorizeLineOp(g.ctx, g.viewer, "walkin", null, { now: g.now });
  if (!a.ok) bounce(g, a.reason);
  const staffId = String(formData.get("staffId") ?? "").trim();
  const name = String(formData.get("customerName") ?? "").trim();
  const phone = String(formData.get("customerPhone") ?? "").trim();
  after(unitSlug, g, await createWalkIn(g.ctx, {
    serviceId: String(formData.get("serviceId") ?? ""),
    staffId: staffId || null,
    channel: "STAFF",
    ...(name ? { customerName: name } : {}),
    ...(phone ? { customerPhone: phone } : {}),
  }, { now: g.now }));
}

/** fix Q11: ยกเลิกบิลจากคิวที่รับเงินแล้ว (booking.job.runAny + เหตุผล · POS voidSale ทางเดิม + audit) */
export async function voidPaidServiceBillAction(unitSlug: string, formData: FormData) {
  const g = await billGate(unitSlug, formData, "void");
  after(unitSlug, g, await voidPaidServiceBill(g.ctx, g.id, { reason: String(formData.get("reason") ?? "") }));
}
