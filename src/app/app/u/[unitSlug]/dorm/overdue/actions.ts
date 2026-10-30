"use server";
// SVC D.11 ▸ action จอค้างชำระ — ร้าน/ผู้กระทำมาจาก session เท่านั้น (ไม่รับรหัสร้าน/ผู้ใช้จากอินพุต) · ด่าน requireUnit + หน่วย DORM
//   สิทธิ์ละเอียด (dorm.bill.send · dorm.latefee.waive · dorm.bill.run · dorm.view) ตรวจสดใน facade ทุกครั้ง — ไม่ผ่าน ⇒ NOT_FOUND · ไม่ throw ให้ผู้ใช้เห็น stack
import { revalidatePath } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { sendDunningNow, setPaymentPromise, waiveLateFee } from "@/lib/modules/dorm";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const refuse = (code: string, reason: string) => ({ ok: false as const, code, reason });
const NO_ACCESS = refuse("NOT_FOUND", "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการค้างชำระ");
const BAD_INPUT = refuse("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");

async function gate(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id };
}
const refresh = (unitSlug: string) => revalidatePath(`/app/u/${unitSlug}/dorm/overdue`);

export async function sendDunningNowAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await sendDunningNow(g.ctx, { unitId: g.unitId, billId: str(input.billId) });
  refresh(unitSlug);
  return r;
}

export async function waiveLateFeeAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await waiveLateFee(g.ctx, { unitId: g.unitId, sourceBillId: str(input.sourceBillId), reason: str(input.reason) });
  refresh(unitSlug);
  return r;
}

export async function setPaymentPromiseAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const p = input.promiseDate === null || input.promiseDate === "" ? null : str(input.promiseDate);
  const r = await setPaymentPromise(g.ctx, { unitId: g.unitId, billId: str(input.billId), promiseDate: p, note: str(input.note) || null });
  refresh(unitSlug);
  return r;
}
