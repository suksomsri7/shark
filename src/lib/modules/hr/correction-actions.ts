"use server";
// HR H2.6 ▸ server actions ของคำขอแก้เวลา (brief §5) — ร้าน/ผู้ใช้มาจาก session เสมอ · ระบบ HR จากฟอร์มตรวจว่าเป็นของร้านนี้ ·
//   ยื่นของตัวเองไม่รับรหัสพนักงานจากฟอร์ม (§C.7 — service หาเองจากบัญชีที่ผูก) · ยื่นแทน/ตัดสิน/ยกเลิก: สิทธิ์ สาขา ตัวเอง ตัดสินใน service (correction.ts) ·
//   เวลาในฟอร์ม = วันเวลาไทย (YYYY-MM-DDTHH:mm) · ไม่ส่งเวลาปัจจุบันเข้า service · ผลลัพธ์ = { ok, … } | { ok:false, reason ไทยคงที่ } ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "./privacy";
import { cancelCorrection, decideCorrection, requestCorrection } from "./correction";
import { CORRECTION_TEXT } from "./correction-rules";

type Auth = Awaited<ReturnType<typeof requireTenant>>;
const field = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
async function ctxOf(auth: Auth, fd: FormData): Promise<{ tenantId: string; systemId: string } | null> {
  const systemId = field(fd, "systemId");
  if (!systemId) return null;
  const sys = await tenantDb({ tenantId: auth.active.tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } });
  return sys ? { tenantId: auth.active.tenantId, systemId: sys.id } : null;
}
/** วันเวลาไทยจากช่อง datetime-local → Date (ไม่ตรงรูป = null ⇒ service ตอบ "ข้อมูลไม่ครบ") */
function bkkAt(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+07:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}
const formInput = (fd: FormData) => ({ action: field(fd, "action"), kind: field(fd, "kind") || null, attendanceId: field(fd, "attendanceId") || null, at: bkkAt(field(fd, "at")), reason: field(fd, "reason") });
/** ด่านคีย์ระดับร้าน (OWNER · MANAGER · hr.employee.create) ของการยื่นแทน/ตัดสิน — service ตรวจซ้ำละเอียดกว่า (สาขา · ผู้ตัดสินตรง · ของตัวเอง) */
function keyGate(auth: Auth): boolean {
  try {
    assertCan(hrViewerOf(auth), { module: "hr", action: "hr.employee.create" });
    return true;
  } catch {
    return false;
  }
}
const done = (systemId: string) => revalidatePath(`/app/sys/${systemId}/hr/attendance`);
type Result = { ok: true; status: string } | { ok: false; reason: string };

/** ยื่นของตัวเอง (พนักงานจากบัญชีที่ผูก) */
export async function requestMyCorrectionAction(fd: FormData): Promise<Result> {
  const auth = await requireTenant();
  const ctx = await ctxOf(auth, fd);
  if (!ctx) return { ok: false, reason: CORRECTION_TEXT.badInput };
  const r = await requestCorrection(ctx, hrViewerOf(auth), formInput(fd));
  if (!r.ok) return r;
  done(ctx.systemId);
  return { ok: true, status: r.status };
}

/** ยื่นแทนพนักงาน (เจ้าของ · ผู้จัดการ/คีย์ในสาขา — service ตรวจ) */
export async function requestCorrectionForAction(fd: FormData): Promise<Result> {
  const auth = await requireTenant();
  const ctx = await ctxOf(auth, fd);
  if (!ctx || !keyGate(auth)) return { ok: false, reason: CORRECTION_TEXT.empNf };
  const employeeId = field(fd, "employeeId");
  if (!employeeId) return { ok: false, reason: CORRECTION_TEXT.empNf };
  const r = await requestCorrection(ctx, hrViewerOf(auth), { ...formInput(fd), employeeId });
  if (!r.ok) return r;
  done(ctx.systemId);
  return { ok: true, status: r.status };
}

/** อนุมัติ/ไม่อนุมัติ (ผู้ตัดสินตรง — คำขอในสายอนุมัติตัดสินที่หน้าอนุมัติ) */
export async function decideCorrectionAction(fd: FormData): Promise<Result> {
  const auth = await requireTenant();
  const ctx = await ctxOf(auth, fd);
  if (!ctx) return { ok: false, reason: CORRECTION_TEXT.stale };
  if (!keyGate(auth)) return { ok: false, reason: CORRECTION_TEXT.noPerm };
  const decision = field(fd, "decision") === "APPROVED" ? "APPROVED" : field(fd, "decision") === "REJECTED" ? "REJECTED" : null;
  const r = await decideCorrection(ctx, hrViewerOf(auth), field(fd, "correctionId"), { decision });
  if (!r.ok) return r;
  done(ctx.systemId);
  return { ok: true, status: r.status };
}

/** ยกเลิก (ผู้ยื่นหรือพนักงานเอง · ยังรออยู่เท่านั้น) */
export async function cancelCorrectionAction(fd: FormData): Promise<Result> {
  const auth = await requireTenant();
  const ctx = await ctxOf(auth, fd);
  if (!ctx) return { ok: false, reason: CORRECTION_TEXT.notOwn };
  const r = await cancelCorrection(ctx, hrViewerOf(auth), field(fd, "correctionId"));
  if (!r.ok) return r;
  done(ctx.systemId);
  return { ok: true, status: "CANCELLED" };
}
