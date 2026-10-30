"use server";
// SVC D.10 ▸ action จอรับเงิน — ร้าน/ผู้กระทำจาก session เท่านั้น · ไม่รับรหัสร้าน/ยอดคาดหวัง/ยอดค้างจากฟอร์ม (ยอดเงินสดที่พนักงานพิมพ์เท่านั้น)
//   สิทธิ์ละเอียด (dorm.slip.review · dorm.payment.manual) ตรวจสดใน dorm-pay ทุกครั้ง — ไม่ผ่าน ⇒ NOT_FOUND
import { revalidatePath } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { parseBahtToSatang } from "@/lib/modules/dorm";
import { attachChatSlip, dismissChatSlip, recordDormPayment, resolveHeldSlip, reviewDormSlip, voidDormReceipt, type DormReviewAction } from "@/lib/platform/dorm-pay";

const NO_ACCESS = { ok: false as const, code: "NOT_FOUND", reason: "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการรับเงิน" };
const str = (fd: FormData, k: string): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

async function gate(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id };
}
async function refresh(unitSlug: string) {
  revalidatePath(`/app/u/${unitSlug}/dorm/payments`);
}

export async function reviewSlipAction(unitSlug: string, _prev: unknown, fd: FormData) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const r = await reviewDormSlip(g.ctx, { slipId: str(fd, "slipId"), action: str(fd, "action") as DormReviewAction, reason: str(fd, "reason"), transRef: str(fd, "transRef") || null });
  await refresh(unitSlug);
  return r;
}

export async function resolveHeldAction(unitSlug: string, _prev: unknown, fd: FormData) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const r = await resolveHeldSlip(g.ctx, { slipId: str(fd, "slipId"), action: str(fd, "action") as "CREDIT" | "REFUND_DUE", reason: str(fd, "reason") });
  await refresh(unitSlug);
  return r;
}

export async function recordCashAction(unitSlug: string, _prev: unknown, fd: FormData) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const satang = parseBahtToSatang(str(fd, "amount"));
  const r = await recordDormPayment(g.ctx, {
    unitId: g.unitId,
    billId: str(fd, "billId"),
    amountSatang: typeof satang === "number" ? satang : 0,
    channel: str(fd, "channel") === "TRANSFER" ? "TRANSFER" : "CASH",
    idempotencyKey: str(fd, "idempotencyKey"),
    note: str(fd, "note") || null,
  });
  await refresh(unitSlug);
  return r;
}

export async function voidReceiptAction(unitSlug: string, _prev: unknown, fd: FormData) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const r = await voidDormReceipt(g.ctx, { receiptId: str(fd, "receiptId"), reason: str(fd, "reason") });
  await refresh(unitSlug);
  return r;
}

export async function attachChatAction(unitSlug: string, _prev: unknown, fd: FormData) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const r = await attachChatSlip(g.ctx, { itemId: str(fd, "itemId"), billId: str(fd, "billId") });
  await refresh(unitSlug);
  return r;
}

export async function dismissChatAction(unitSlug: string, _prev: unknown, fd: FormData) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const r = await dismissChatSlip(g.ctx, { itemId: str(fd, "itemId"), reason: str(fd, "reason") });
  await refresh(unitSlug);
  return r;
}
