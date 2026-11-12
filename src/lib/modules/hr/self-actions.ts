"use server";
// HR H2.10 ▸ server actions ของหน้า "ของฉัน" — ตัวห่อบาง ๆ: เซสชัน (requireTenant + requireMembership) → actor → hr/self.ts เท่านั้น
//   ทุกฟังก์ชันเปิดได้ด้วย POST ตรง (Next data-security) ⇒ ตัวตนมาจากเซสชันทุกครั้ง · ไม่อ่านรหัสพนักงาน/ผู้ใช้/ระบบ/ร้านจากผู้เรียก ·
//   ค่าที่รับ = ช่องของฟอร์มทีละช่อง (ไม่ส่งต่อทั้งก้อน) · ไม่แตะฐานข้อมูลในไฟล์นี้ · ไม่ส่งเวลาให้ facade (เวลาจริงของเซิร์ฟเวอร์) ◂
import { revalidatePath } from "next/cache";
import { requireMembership, requireTenant } from "@/lib/core/context";
import * as self from "./self";

const ME = "/app/me/hr";
type Auth = Awaited<ReturnType<typeof requireTenant>>;
/** ผู้กด = บัญชีในเซสชัน + สมาชิกภาพของร้านที่เปิดอยู่ (บทบาท/สาขา/คีย์อ่านจาก Membership ไม่ใช่จากผู้เรียก) */
async function actorOf(auth: Auth): Promise<self.SelfActor> {
  const m = await requireMembership(auth.active.tenantId);
  return { tenantId: m.tenantId, userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions };
}
const s = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const n = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
function done<T extends { ok: boolean }>(r: T): T {
  if (r.ok) revalidatePath(ME, "layout");
  return r;
}

// ── อ่าน (ฟอร์มที่ต้องถามระหว่างกรอก) ──
export async function myLeavePreviewAction(input: { policyId?: unknown; fromDate?: unknown; toDate?: unknown; halfDay?: unknown; hours?: unknown }) {
  const a = await actorOf(await requireTenant());
  return self.myLeavePreview(a, { policyId: s(input?.policyId), fromDate: s(input?.fromDate), toDate: s(input?.toDate), halfDay: s(input?.halfDay), hours: n(input?.hours) });
}
export async function mySwapTargetsAction(fromEntryId: unknown) {
  const a = await actorOf(await requireTenant());
  return self.mySwapTargets(a, { fromEntryId: s(fromEntryId) });
}

// ── เขียน ──
export async function selfClockAction(input: { kind?: unknown; latitude?: unknown; longitude?: unknown; accuracy?: unknown }) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfClock(a, { kind: s(input?.kind), latitude: n(input?.latitude), longitude: n(input?.longitude), accuracy: n(input?.accuracy) }));
}
export async function selfRequestLeaveAction(input: { policyId?: unknown; fromDate?: unknown; toDate?: unknown; halfDay?: unknown; hours?: unknown; reason?: unknown }) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfRequestLeave(a, { policyId: s(input?.policyId), fromDate: s(input?.fromDate), toDate: s(input?.toDate), halfDay: s(input?.halfDay), hours: n(input?.hours), reason: s(input?.reason) }));
}
export async function selfCancelLeaveAction(id: unknown) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfCancelLeave(a, s(id)));
}
export async function selfRequestOtAction(input: { date?: unknown; start?: unknown; end?: unknown; reason?: unknown }) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfRequestOt(a, { date: s(input?.date), start: s(input?.start), end: s(input?.end), reason: s(input?.reason) }));
}
export async function selfCancelOtAction(id: unknown) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfCancelOt(a, s(id)));
}
export async function selfRequestSwapAction(input: { fromEntryId?: unknown; targetEmployeeId?: unknown; toEntryId?: unknown; reason?: unknown }) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfRequestSwap(a, { fromEntryId: s(input?.fromEntryId), targetEmployeeId: s(input?.targetEmployeeId), toEntryId: s(input?.toEntryId), reason: s(input?.reason) }));
}
export async function selfRespondSwapAction(id: unknown, accept: unknown) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfRespondSwap(a, s(id), accept === true));
}
export async function selfCancelSwapAction(id: unknown) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfCancelSwap(a, s(id)));
}
export async function selfRequestCorrectionAction(input: { action?: unknown; attendanceId?: unknown; kind?: unknown; at?: unknown; reason?: unknown }) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfRequestCorrection(a, { action: s(input?.action), attendanceId: s(input?.attendanceId), kind: s(input?.kind), at: s(input?.at), reason: s(input?.reason) }));
}
export async function selfCancelCorrectionAction(id: unknown) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfCancelCorrection(a, s(id)));
}
export async function selfRequestAdvanceAction(input: { amountBaht?: unknown; note?: unknown }) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfRequestAdvance(a, { amountBaht: n(input?.amountBaht), note: s(input?.note) }));
}
export async function selfCancelAdvanceAction(id: unknown) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfCancelAdvance(a, s(id)));
}
export async function selfAcknowledgeNoteAction(id: unknown) {
  const a = await actorOf(await requireTenant());
  return done(await self.selfAcknowledgeNote(a, s(id)));
}
