"use server";

import { revalidatePath } from "next/cache";
import type { PosPayType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { requireTenant, type Auth } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { createSale, closeDayCsv } from "@/lib/modules/pos/service";
import { posUnitIsLinked, resolvePosLinks } from "@/lib/modules/pos/register";
import { getPaymentProfile } from "@/lib/payment/service";
import { promptpayPayload } from "@/lib/payment/promptpay";
import * as coupon from "@/lib/modules/coupon/service";

// ── รูปแบบข้อมูลที่ client ส่งมา ──
// itemId = InvItem.id จาก catalog (ตัดสต็อก) · undefined = รายการเพิ่มเอง (ไม่ตัดสต็อก)
export type CartLine = { name: string; qty: number; unitPriceSatang: number; itemId?: string };
type SaleInput = {
  systemId: string;
  unitId: string;
  lines: CartLine[];
  billDiscountSatang?: number;
  payType: "CASH" | "PROMPTPAY" | "TRANSFER";
  cashReceivedSatang?: number;
  memberId?: string;
  couponCode?: string;
  idempotencyKey: string;
};
type QuoteInput = Omit<SaleInput, "payType" | "cashReceivedSatang" | "idempotencyKey">;

export type QuoteState =
  | { ok: true; subtotalSatang: number; billDiscountSatang: number; couponDiscountSatang: number; grandTotalSatang: number; promptpayPayload: string | null }
  | { ok: false; message: string };

export type RegisterSaleState =
  | { status: "idle" }
  | { status: "ok"; receiptNo: string | null; grandTotalSatang: number; pointEarned: number; changeSatang: number }
  | { status: "error"; message: string };

function assertPosCan(auth: Auth & { active: NonNullable<Auth["active"]> }, unitId: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "pos", action: "pos.sale.create", unitId },
  );
}

// ── normalize + validate lines/ยอด (ใช้ทั้ง quote และ sale) — คืน error ไทยถ้าไม่ผ่าน ──
function normalizeLines(raw: CartLine[]): { ok: true; lines: CartLine[]; subtotal: number } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, message: "ยังไม่มีสินค้าในตะกร้า" };
  const lines: CartLine[] = [];
  for (const l of raw) {
    const name = String(l?.name ?? "").trim();
    const qty = Math.round(Number(l?.qty));
    const unitPriceSatang = Math.round(Number(l?.unitPriceSatang));
    if (!name) return { ok: false, message: "ทุกรายการต้องมีชื่อสินค้า" };
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, message: `จำนวนของ "${name}" ต้องมากกว่า 0` };
    if (!Number.isFinite(unitPriceSatang) || unitPriceSatang < 0) return { ok: false, message: `ราคาของ "${name}" ติดลบไม่ได้` };
    const itemId = String(l?.itemId ?? "").trim() || undefined; // ผูกสินค้าคลัง (ตัดสต็อก) · ว่าง = รายการเพิ่มเอง
    lines.push({ name, qty, unitPriceSatang, itemId });
  }
  const subtotal = lines.reduce((s, l) => s + l.unitPriceSatang * l.qty, 0);
  return { ok: true, lines, subtotal };
}

// ── ตรวจ + คิดยอด (subtotal/ส่วนลด/คูปอง) แบบเดียวกับ createSale engine ──
// คืน { grandTotal, couponDiscount, couponSystemId } หรือ error ไทย
async function computeTotals(
  tenantId: string,
  unitId: string,
  lines: CartLine[],
  subtotal: number,
  billDiscountRaw: number | undefined,
  memberId: string | undefined,
  couponCodeRaw: string | undefined,
): Promise<
  | { ok: true; billDiscount: number; couponDiscount: number; grandTotal: number; couponSystemId: string | null }
  | { ok: false; message: string }
> {
  const billDiscount = Math.min(Math.max(0, Math.round(billDiscountRaw ?? 0)), subtotal);
  const couponBase = subtotal - billDiscount;
  const couponCode = couponCodeRaw?.trim().toUpperCase() || "";
  if (!couponCode) return { ok: true, billDiscount, couponDiscount: 0, grandTotal: couponBase, couponSystemId: null };

  const links = await resolvePosLinks(tenantId, unitId);
  if (!links.couponSystemId) {
    return { ok: false, message: "จุดขายนี้ยังไม่ได้เชื่อมระบบคูปอง — เชื่อมกิจการเดียวกันกับระบบคูปองก่อน" };
  }
  const v = await coupon.validate({
    code: couponCode,
    tenantId,
    systemId: links.couponSystemId,
    memberId: memberId ?? null,
    amountSatang: couponBase,
    unitId,
  });
  if (!v.ok) return { ok: false, message: `คูปองใช้ไม่ได้: ${coupon.couponReasonText(v.reason)}` };
  return { ok: true, billDiscount, couponDiscount: v.discountSatang, grandTotal: couponBase - v.discountSatang, couponSystemId: links.couponSystemId };
}

// ตรวจ member ว่าเป็นของร้านจริง (กันแนบ customer ข้ามร้าน) — คืน id ที่ปลอดภัย หรือ null ถ้าไม่ระบุ
async function safeMemberId(tenantId: string, memberIdRaw: string | undefined): Promise<{ ok: true; memberId: string | undefined } | { ok: false; message: string }> {
  const id = memberIdRaw?.trim();
  if (!id) return { ok: true, memberId: undefined };
  const c = await prisma.customer.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!c) return { ok: false, message: "ไม่พบสมาชิกที่เลือก" };
  return { ok: true, memberId: c.id };
}

// ── ใบเสนอราคา (quote) — คิดยอดสุทธิ + payload PromptPay ให้ client โชว์ QR/เงินทอนที่ถูกต้อง ──
export async function posQuoteAction(input: QuoteInput): Promise<QuoteState> {
  const auth = await requireTenant();
  if (!(await posUnitIsLinked(auth.active.tenantId, input.systemId, input.unitId))) {
    return { ok: false, message: "ไม่พบจุดขายนี้" };
  }
  assertPosCan(auth, input.unitId);
  const tenantId = auth.active.tenantId;

  const norm = normalizeLines(input.lines);
  if (!norm.ok) return { ok: false, message: norm.message };
  const mem = await safeMemberId(tenantId, input.memberId);
  if (!mem.ok) return { ok: false, message: mem.message };

  const totals = await computeTotals(tenantId, input.unitId, norm.lines, norm.subtotal, input.billDiscountSatang, mem.memberId, input.couponCode);
  if (!totals.ok) return { ok: false, message: totals.message };

  // payload PromptPay (dynamic — ล็อกยอด) จาก PromptPay ID ของร้าน (ไม่ตั้ง/เพี้ยน → null)
  let payload: string | null = null;
  const profile = await getPaymentProfile({ tenantId });
  if (profile?.promptpayId && totals.grandTotal > 0) {
    try {
      payload = promptpayPayload({ id: profile.promptpayId, amountSatang: totals.grandTotal });
    } catch {
      payload = null;
    }
  }

  return {
    ok: true,
    subtotalSatang: norm.subtotal,
    billDiscountSatang: totals.billDiscount,
    couponDiscountSatang: totals.couponDiscount,
    grandTotalSatang: totals.grandTotal,
    promptpayPayload: payload,
  };
}

// ── export CSV ปิดวัน (รายการบิลวันนั้น + สรุป · BOM) ──
// gate: ระบบต้องเป็น POS ของ tenant นี้ + สิทธิ์ pos.sale.create (คนที่ขายได้ ปิดวัน/ดูสรุปได้)
export async function exportDaySalesCsvAction(systemId: string, businessDate?: string): Promise<string> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true } });
  if (!sys) throw new Error("ไม่พบระบบขายนี้");
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "pos", action: "pos.sale.create" },
  );
  const date = businessDate?.trim() || undefined;
  return closeDayCsv({ tenantId, systemId }, date);
}

// ── ยืนยันขาย (createSale — PAID_NOW) → คืนเลขใบเสร็จ + แต้ม + เงินทอน หรือ error inline ──
export async function registerSaleAction(input: SaleInput): Promise<RegisterSaleState> {
  const auth = await requireTenant();
  if (!(await posUnitIsLinked(auth.active.tenantId, input.systemId, input.unitId))) {
    return { status: "error", message: "ไม่พบจุดขายนี้" };
  }
  assertPosCan(auth, input.unitId);
  const tenantId = auth.active.tenantId;

  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!idempotencyKey) return { status: "error", message: "ข้อมูลบิลไม่ครบ ลองใหม่อีกครั้ง" };

  // idempotent short-circuit: บิลนี้เคยบันทึกแล้ว (กดยืนยันซ้ำ) → คืนผลเดิม ไม่คิดคูปอง/ยอดซ้ำ
  const existing = await prisma.posSale.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    select: { receiptNo: true, grandTotalSatang: true, pointEarned: true },
  });
  if (existing) {
    return { status: "ok", receiptNo: existing.receiptNo, grandTotalSatang: existing.grandTotalSatang, pointEarned: existing.pointEarned, changeSatang: 0 };
  }

  const norm = normalizeLines(input.lines);
  if (!norm.ok) return { status: "error", message: norm.message };
  const mem = await safeMemberId(tenantId, input.memberId);
  if (!mem.ok) return { status: "error", message: mem.message };

  const totals = await computeTotals(tenantId, input.unitId, norm.lines, norm.subtotal, input.billDiscountSatang, mem.memberId, input.couponCode);
  if (!totals.ok) return { status: "error", message: totals.message };

  const payType: PosPayType = input.payType === "PROMPTPAY" ? "PROMPTPAY" : input.payType === "TRANSFER" ? "TRANSFER" : "CASH";

  // เงินสด: เงินรับต้องพอ (ถ้าส่งมา) → คำนวณเงินทอน (โชว์เฉย ๆ · payMethod = ยอดสุทธิเป๊ะตาม engine)
  let changeSatang = 0;
  if (payType === "CASH") {
    const received = Math.round(Number(input.cashReceivedSatang ?? totals.grandTotal));
    if (Number.isFinite(received) && received > 0) {
      if (received < totals.grandTotal) return { status: "error", message: "เงินรับน้อยกว่ายอดที่ต้องชำระ" };
      changeSatang = received - totals.grandTotal;
    }
  }

  const links = await resolvePosLinks(tenantId, input.unitId);

  try {
    const res = await createSale({
      tenantId,
      unitId: input.unitId,
      systemId: input.systemId,
      pointSystemId: links.pointSystemId ?? undefined,
      memberId: mem.memberId,
      sourceModule: "POS",
      idempotencyKey,
      lines: norm.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, itemId: l.itemId })),
      billDiscountSatang: totals.billDiscount,
      couponSystemId: totals.couponSystemId ?? undefined,
      couponCode: totals.couponSystemId ? input.couponCode?.trim().toUpperCase() : undefined,
      payMethods: [{ type: payType, amountSatang: totals.grandTotal }],
    });
    revalidatePath(`/app/sys/${input.systemId}/pos/register`);
    revalidatePath(`/app/sys/${input.systemId}/pos/sales`);
    revalidatePath(`/app/sys/${input.systemId}`);
    return { status: "ok", receiptNo: res.receiptNo, grandTotalSatang: res.grandTotalSatang, pointEarned: res.pointEarned, changeSatang };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "ขายไม่สำเร็จ ลองอีกครั้ง" };
  }
}
