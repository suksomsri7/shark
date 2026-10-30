"use server";
// SVC D.12 ▸ action ย้ายออก · คืนประกัน · ย้ายห้อง · ต่อสัญญา — ร้าน/ผู้กระทำมาจาก session เท่านั้น (ไม่รับรหัสร้าน/ผู้ใช้จากอินพุต) · ด่าน requireUnit + หน่วย DORM
//   สิทธิ์ละเอียด (dorm.moveout.manage · dorm.lease.manage · dorm.deposit.deduct.approve) + ขอบเขตอาคาร ตรวจสดใน facade ทุกครั้ง — ไม่ผ่าน ⇒ NOT_FOUND · ไม่ throw
import { revalidatePath } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import {
  addMoveOutFiles,
  cancelMoveOut,
  giveMoveOutNotice,
  recordMoveOutInspection,
  renewLease,
  reopenMoveOutSummary,
  sendMoveOutSummary,
  settleMoveOut,
  transferRoom,
} from "@/lib/modules/dorm";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isSafeInteger(v) ? v : undefined);
const refuse = (code: string, reason: string) => ({ ok: false as const, code, reason });
const NO_ACCESS = refuse("NOT_FOUND", "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการย้ายออก");
const BAD_INPUT = refuse("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");

async function gate(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id };
}
const refresh = (unitSlug: string) => {
  revalidatePath(`/app/u/${unitSlug}/dorm/moveout`);
  revalidatePath(`/app/u/${unitSlug}/dorm/tenants`);
};
const readings = (v: unknown) => (Array.isArray(v) ? v.filter(isRec).map((r) => ({ meterId: str(r.meterId), value: int(r.value) ?? -1 })) : []);

export async function giveMoveOutNoticeAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await giveMoveOutNotice(g.ctx, { unitId: g.unitId, leaseId: str(input.leaseId), moveOutDate: str(input.moveOutDate), shortNoticeReason: str(input.shortNoticeReason) || null });
  refresh(unitSlug);
  return r;
}

export async function cancelMoveOutAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await cancelMoveOut(g.ctx, { unitId: g.unitId, moveOutId: str(input.moveOutId), reason: str(input.reason) });
  refresh(unitSlug);
  return r;
}

export async function addMoveOutFilesAction(unitSlug: string, form: FormData) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!(form instanceof FormData)) return BAD_INPUT;
  const files: { data: Uint8Array; contentType: string; filename?: string }[] = [];
  for (const f of form.getAll("files")) if (f instanceof File) files.push({ data: new Uint8Array(await f.arrayBuffer()), contentType: f.type, filename: f.name });
  const r = await addMoveOutFiles(g.ctx, { unitId: g.unitId, moveOutId: str(form.get("moveOutId")), files });
  refresh(unitSlug);
  return r;
}

export async function recordMoveOutInspectionAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || !Array.isArray(input.items)) return BAD_INPUT;
  const items = input.items.filter(isRec).map((x) => ({
    key: str(x.key),
    labelTh: str(x.labelTh),
    verdict: x.verdict === "DAMAGE" ? ("DAMAGE" as const) : ("NORMAL" as const),
    damageCode: str(x.damageCode) || null,
    amountSatang: int(x.amountSatang),
    evidenceFileIds: Array.isArray(x.evidenceFileIds) ? x.evidenceFileIds.map(str).filter(Boolean) : [],
    note: str(x.note) || null,
  }));
  const r = await recordMoveOutInspection(g.ctx, { unitId: g.unitId, moveOutId: str(input.moveOutId), items, meterReadings: readings(input.meterReadings) });
  refresh(unitSlug);
  return r;
}

export async function sendMoveOutSummaryAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await sendMoveOutSummary(g.ctx, { unitId: g.unitId, moveOutId: str(input.moveOutId) });
  refresh(unitSlug);
  return r;
}

export async function settleMoveOutAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const ch = input.channel === "CASH" || input.channel === "PROMPTPAY" ? input.channel : "TRANSFER";
  const r = await settleMoveOut(g.ctx, { unitId: g.unitId, moveOutId: str(input.moveOutId), refund: { channel: ch, financeAccountId: str(input.financeAccountId) || null } });
  refresh(unitSlug);
  return r;
}

export async function reopenMoveOutSummaryAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await reopenMoveOutSummary(g.ctx, { unitId: g.unitId, moveOutId: str(input.moveOutId), reason: str(input.reason) });
  refresh(unitSlug);
  return r;
}

export async function transferRoomAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await transferRoom(g.ctx, {
    unitId: g.unitId,
    leaseId: str(input.leaseId),
    toRoomId: str(input.toRoomId),
    effectiveDate: str(input.effectiveDate),
    rentSatang: int(input.rentSatang),
    meterReadings: readings(input.meterReadings),
  });
  refresh(unitSlug);
  return r;
}

export async function renewLeaseAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await renewLease(g.ctx, { unitId: g.unitId, leaseId: str(input.leaseId), months: int(input.months) ?? 0, rentSatang: int(input.rentSatang) });
  refresh(unitSlug);
  return r;
}
