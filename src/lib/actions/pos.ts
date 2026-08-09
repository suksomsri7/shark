"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PosPayType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { requireTenant, type Auth } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { createSale, closeDayCsv } from "@/lib/modules/pos/service";
import { posUnitIsLinked, resolvePosLinks, setItemSalePrice } from "@/lib/modules/pos/register";
import { getPaymentProfile } from "@/lib/payment/service";
import { promptpayPayload } from "@/lib/payment/promptpay";
import * as coupon from "@/lib/modules/coupon/service";

// ── รูปแบบข้อมูลที่ client ส่งมา ──
// itemId = InvItem.id จาก catalog (ตัดสต็อก) · undefined = รายการเพิ่มเอง (ไม่ตัดสต็อก)
// serviceId = BookingService.id (บริการ) — server ตรวจซ้ำว่าเป็นของ unit นี้จริงก่อนบันทึก
export type CartLine = { name: string; qty: number; unitPriceSatang: number; itemId?: string; serviceId?: string };
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
    const serviceId = String(l?.serviceId ?? "").trim() || undefined; // ผูกบริการ (ไม่ตัดสต็อก) — ตรวจของจริงอีกชั้นด้านล่าง
    lines.push({ name, qty, unitPriceSatang, itemId, serviceId });
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
  // serviceId ที่ client ส่งมา ต้องเป็นบริการของ unit นี้จริง — ไม่งั้นทิ้ง id ทิ้ง (ขายต่อได้ แต่ไม่ผูกผิดตัว)
  // client ส่ง id มั่วแล้วรายงานจะเพี้ยน · ราคายังคิดจากที่ส่งมาเหมือนเดิม (พนักงานแก้ราคาได้อยู่แล้ว)
  const wantSvc = [...new Set(norm.lines.map((l) => l.serviceId).filter((x): x is string => !!x))];
  const okSvc = wantSvc.length
    ? new Set(
        (
          await prisma.bookingService.findMany({
            where: { tenantId, unitId: input.unitId, id: { in: wantSvc } },
            select: { id: true },
          })
        ).map((r) => r.id),
      )
    : new Set<string>();
  const safeLines = norm.lines.map((l) => (l.serviceId && !okSvc.has(l.serviceId) ? { ...l, serviceId: undefined } : l));

  try {
    const res = await createSale({
      tenantId,
      unitId: input.unitId,
      systemId: input.systemId,
      pointSystemId: links.pointSystemId ?? undefined,
      memberId: mem.memberId,
      sourceModule: "POS",
      idempotencyKey,
      lines: safeLines.map((l) => ({ name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, itemId: l.itemId, serviceId: l.serviceId })),
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

// ── ตั้งราคาขายต่อสินค้า (หน้า "สินค้า/ราคา") — ราคาบาทจากฟอร์ม → สตางค์ · redirect กลับพร้อม ?err/?ok ──
// gate: ระบบต้องเป็น POS ของ tenant นี้ + สิทธิ์ pos.product.setPrice (OWNER/MANAGER ผ่าน · STAFF ต้องมี permission)
export async function setItemSalePriceAction(formData: FormData): Promise<void> {
  const systemId = String(formData.get("systemId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const priceRaw = String(formData.get("salePrice") ?? "").trim();

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
    { module: "pos", action: "pos.product.setPrice" },
  );

  const base = `/app/sys/${systemId}/pos/products`;
  const priceBaht = Number(priceRaw);
  if (priceRaw === "" || !Number.isFinite(priceBaht) || priceBaht < 0) {
    redirect(`${base}?err=${encodeURIComponent("กรอกราคาขายเป็นตัวเลขไม่ติดลบ")}`);
  }
  const res = await setItemSalePrice(tenantId, systemId, itemId, Math.round(priceBaht * 100));
  if (!res.ok) redirect(`${base}?err=${encodeURIComponent(res.reason)}`);

  revalidatePath(base);
  revalidatePath(`/app/sys/${systemId}/pos/register`);
  redirect(`${base}?ok=1`);
}

// ═══════════ บริการหน้าร้าน (WO 9 ส.ค. — ร้านตัดผม/นวด/คลินิก) ═══════════
// ปัญหาที่เจ้าของร้านเจอ: เปิด "ขายหน้าร้าน" มาแล้วมีแต่สินค้า ทั้งที่ร้านบริการขายบริการเป็นหลัก
// บริการเก็บที่ BookingService (ผูก unit) — ตัวเดียวกับที่ระบบจองใช้ จึงไม่มีข้อมูลซ้ำสองที่
// (ตั้งราคาที่ไหนก็เห็นเหมือนกันทั้งหน้าขายและหน้าจอง)

function assertPosServiceCan(auth: Auth & { active: NonNullable<Auth["active"]> }) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "pos", action: "pos.product.setPrice" },
  );
}

/** ตรวจว่า POS นี้ผูกกับ unit ที่อ้างจริง — กันยิง unitId ของกิจการอื่นเข้ามา */
async function posOwnedUnit(tenantId: string, systemId: string, unitId: string): Promise<void> {
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true } });
  if (!sys) throw new Error("ไม่พบระบบขายนี้");
  if (!(await posUnitIsLinked(tenantId, systemId, unitId))) throw new Error("ระบบขายนี้ไม่ได้ผูกกับหน้างานที่ระบุ");
}

export async function addPosServiceAction(formData: FormData): Promise<void> {
  const systemId = String(formData.get("systemId") ?? "").trim();
  const unitId = String(formData.get("unitId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const priceRaw = String(formData.get("priceBaht") ?? "").trim();
  const durRaw = String(formData.get("durationMin") ?? "").trim();
  // ติ๊ก = ให้ลูกค้าจองล่วงหน้าได้ (บริการมีคิว) · ไม่ติ๊ก = ขายหน้าร้านอย่างเดียว (ค่าจัดส่ง/ห่อของขวัญ)
  const bookable = String(formData.get("bookable") ?? "") === "on";

  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  assertPosServiceCan(auth);
  await posOwnedUnit(tenantId, systemId, unitId);

  const base = `/app/sys/${systemId}/pos/products`;
  const priceBaht = Number(priceRaw);
  // ระยะเวลาใช้เฉพาะตอนจองคิว — รายการที่ขายหน้าร้านอย่างเดียวไม่ต้องมีเวลา (0 = ไม่ระบุ)
  const durationMin = bookable ? (durRaw === "" ? 30 : Number(durRaw)) : 0;
  if (!name) redirect(`${base}?err=${encodeURIComponent("ใส่ชื่อบริการก่อน")}`);
  if (!Number.isFinite(priceBaht) || priceBaht < 0) {
    redirect(`${base}?err=${encodeURIComponent("กรอกราคาบริการเป็นตัวเลขไม่ติดลบ")}`);
  }
  if (bookable && (!Number.isFinite(durationMin) || durationMin < 5 || durationMin > 600)) {
    redirect(`${base}?err=${encodeURIComponent("บริการที่ให้จองล่วงหน้าต้องระบุเวลา 5-600 นาที")}`);
  }

  await prisma.bookingService.create({
    data: {
      tenantId,
      unitId,
      name: name.slice(0, 80),
      durationMin: Math.round(durationMin),
      priceSatang: Math.round(priceBaht * 100),
      bookable,
    },
  });
  revalidatePath(base);
  redirect(`${base}?ok=${encodeURIComponent(`เพิ่มบริการ "${name}" แล้ว`)}`);
}

export async function setPosServicePriceAction(formData: FormData): Promise<void> {
  const systemId = String(formData.get("systemId") ?? "").trim();
  const unitId = String(formData.get("unitId") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const priceRaw = String(formData.get("priceBaht") ?? "").trim();

  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  assertPosServiceCan(auth);
  await posOwnedUnit(tenantId, systemId, unitId);

  const base = `/app/sys/${systemId}/pos/products`;
  const priceBaht = Number(priceRaw);
  if (priceRaw === "" || !Number.isFinite(priceBaht) || priceBaht < 0) {
    redirect(`${base}?err=${encodeURIComponent("กรอกราคาเป็นตัวเลขไม่ติดลบ")}`);
  }
  // updateMany + เงื่อนไข tenant/unit = กันแก้ของกิจการอื่นแม้ส่ง id มามั่ว
  const res = await prisma.bookingService.updateMany({
    where: { id: serviceId, tenantId, unitId },
    data: { priceSatang: Math.round(priceBaht * 100) },
  });
  if (res.count === 0) redirect(`${base}?err=${encodeURIComponent("ไม่พบบริการนี้")}`);
  revalidatePath(base);
  redirect(`${base}?ok=${encodeURIComponent("บันทึกราคาบริการแล้ว")}`);
}

export async function removePosServiceAction(formData: FormData): Promise<void> {
  const systemId = String(formData.get("systemId") ?? "").trim();
  const unitId = String(formData.get("unitId") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "").trim();

  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  assertPosServiceCan(auth);
  await posOwnedUnit(tenantId, systemId, unitId);

  // ปิดการใช้งาน ไม่ลบจริง — นัดหมายเก่าที่อ้างบริการนี้ต้องยังอ่านชื่อได้
  await prisma.bookingService.updateMany({ where: { id: serviceId, tenantId, unitId }, data: { active: false } });
  const base = `/app/sys/${systemId}/pos/products`;
  revalidatePath(base);
  redirect(`${base}?ok=${encodeURIComponent("เอาบริการออกจากหน้าขายแล้ว")}`);
}
