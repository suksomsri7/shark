"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PosPayType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { requireTenant, type Auth } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { createSale, closeDayCsv } from "@/lib/modules/pos/service";
import { posUnitIsLinked, resolvePosLinks, setItemSalePrice } from "@/lib/modules/pos/register";
import type {
  PosMemberChoicesInput,
  PosMemberQuote,
  PosMemberRights,
  PosMemberVoucher,
} from "@/lib/modules/pos/register";
import { getPaymentProfile } from "@/lib/payment/service";
import { promptpayPayload } from "@/lib/payment/promptpay";
import * as coupon from "@/lib/modules/coupon/service";
import * as member from "@/lib/modules/member";
import { toMemberActor } from "@/lib/modules/member";
import * as point from "@/lib/modules/point";

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
  /** M2.8 — สิทธิ์สมาชิกที่ติ๊กไว้บนแผงขวา (voucher / แต้ม / บัตรกำนัล) */
  memberChoices?: PosMemberChoicesInput;
  couponCode?: string;
  idempotencyKey: string;
};
type QuoteInput = Omit<SaleInput, "payType" | "cashReceivedSatang" | "idempotencyKey">;

export type QuoteState =
  | {
      ok: true;
      subtotalSatang: number;
      billDiscountSatang: number;
      couponDiscountSatang: number;
      /** ส่วนลดจากสิทธิ์สมาชิก (ระดับ + voucher + แต้ม + บัตรกำนัล) — 0 เมื่อไม่ได้เลือกสมาชิก */
      memberDiscountSatang: number;
      grandTotalSatang: number;
      promptpayPayload: string | null;
      member: PosMemberQuote | null;
    }
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

// ═══════════ M2.8 · แผงสิทธิ์สมาชิกที่หน้าขาย (ภาพ 06) ═══════════
//
// 🔴 ลำดับส่วนลด (ระดับ → voucher → คูปอง → แต้ม → บัตรกำนัล) และกติกากันซ้อน **คิดที่เดียว**
//    คือ `member.quoteApply` — ที่นี่แค่แปลงตะกร้าของหน้าขายให้เป็นรูปที่กระเป๋าสิทธิ์เข้าใจ
//    ห้ามคิดส่วนลดเองซ้ำ ไม่งั้นยอดบนหน้าจอกับยอดที่ตัดจริงจะเพี้ยนกันเงียบ ๆ
// 🔴 ส่วนลดคูปองยังเป็นของ POS (เส้นเดิม) — บรรทัด COUPON ที่กระเป๋าคืนมาจึงถูกหักออก ไม่นับซ้ำ

const baht = (satang: number): string => (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const thaiDate = (d: Date): string =>
  new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(d);

/** "สมาชิกมา 2 ปี 3 เดือน" — บอกความสัมพันธ์เป็นภาษาคน ไม่ใช่วันที่ดิบ */
function memberSinceLabel(createdAt: Date): string {
  const months = Math.max(0, Math.round((Date.now() - createdAt.getTime()) / (30 * 24 * 3600_000)));
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years <= 0 && rest <= 0) return "สมาชิกใหม่วันนี้";
  if (years <= 0) return `สมาชิกมา ${rest} เดือน`;
  return rest > 0 ? `สมาชิกมา ${years} ปี ${rest} เดือน` : `สมาชิกมา ${years} ปี`;
}

function voucherValueLabel(v: { kind: string; value: number }): string {
  if (v.kind === "PERCENT") return `${v.value}%`;
  if (v.kind === "FREE_ITEM") return "ของฟรี";
  return `฿${baht(v.value)}`;
}

/** ตะกร้าของหน้าขาย → ตะกร้าของกระเป๋าสิทธิ์ (ชนิดเดียวกับที่ `createSale` ส่งเข้า `applyOnSale`) */
function walletCart(unitId: string, lines: CartLine[], couponCode: string | undefined) {
  return {
    unitId,
    couponCode: couponCode?.trim().toUpperCase() || null,
    lines: lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      itemId: l.itemId ?? null,
      serviceId: l.serviceId ?? null,
    })),
  };
}

/**
 * กระเป๋าสิทธิ์ของสมาชิกที่พนักงานเพิ่งเลือก — โหลดครั้งเดียวต่อคน (ไม่ใช่ทุกครั้งที่ตะกร้าเปลี่ยน)
 * คืน null = สาขานี้ไม่ได้เปิดใช้ระบบสมาชิก หรือคนนี้ไม่ได้อยู่ในระบบสมาชิกของสาขานี้
 */
export async function posMemberRightsAction(input: {
  systemId: string;
  unitId: string;
  memberId: string;
}): Promise<PosMemberRights | null> {
  const auth = await requireTenant();
  if (!(await posUnitIsLinked(auth.active.tenantId, input.systemId, input.unitId))) return null;
  assertPosCan(auth, input.unitId);
  const tenantId = auth.active.tenantId;

  const links = await resolvePosLinks(tenantId, input.unitId);
  if (!links.memberSystemId) return null;
  const row = await prisma.customer.findFirst({
    where: { id: String(input.memberId ?? ""), tenantId, memberSystemId: links.memberSystemId },
    select: { id: true, name: true, memberCode: true, createdAt: true },
  });
  if (!row) return null;

  const ctx = { tenantId, systemId: links.memberSystemId, actorUserId: auth.user.id };
  const actor = toMemberActor(auth.user.id, auth.active);
  const [wallet, settings] = await Promise.all([
    member.getWallet(ctx, actor, row.id, { cart: { unitId: input.unitId, lines: [] } }),
    point.getPointSettings(tenantId),
  ]);

  const vouchers: PosMemberVoucher[] = wallet.vouchers.map((v) => ({
    id: v.id,
    name: v.name,
    code: v.code,
    valueLabel: voucherValueLabel(v),
    expiresLabel: `ใช้ได้ถึง ${thaiDate(v.expiresAt)}`,
    applicable: v.status === "ACTIVE",
    reason: v.status === "ACTIVE" ? null : "ใบนี้ใช้ไม่ได้แล้ว",
  }));

  return {
    memberId: row.id,
    name: row.name ?? "สมาชิก",
    memberCode: row.memberCode ?? "",
    tierName: wallet.tierBenefits.tier?.name ?? null,
    tierDiscountPct: wallet.tierBenefits.discountPct,
    tierDiscountFixedSatang: wallet.tierBenefits.discountFixedSatang,
    memberSinceLabel: memberSinceLabel(row.createdAt),
    pointBalance: wallet.points.balance,
    burnRateSatang: settings.burnRateSatang,
    burnMinPoints: settings.burnMinPoints,
    burnMaxPct: settings.burnMaxPct,
    vouchers,
    giftCards: wallet.giftCards
      .filter((g) => g.status === "ACTIVE" && g.balanceSatang > 0)
      .map((g) => ({ numberMasked: g.numberMasked, balanceSatang: g.balanceSatang })),
    stamps: wallet.stamps.map((s) => ({ cardId: s.cardId, name: s.name, stamps: s.stamps, slots: s.slots })),
  };
}

/** ใบเสนอราคาสิทธิ์สมาชิกของตะกร้าปัจจุบัน — null = ไม่มีสมาชิก/ระบบสมาชิก หรือคนนี้ไม่อยู่ในระบบ */
async function memberQuoteOf(
  auth: Auth & { active: NonNullable<Auth["active"]> },
  memberSystemId: string,
  unitId: string,
  memberId: string,
  lines: CartLine[],
  couponCode: string | undefined,
  choices: PosMemberChoicesInput | undefined,
): Promise<PosMemberQuote | null> {
  const actorUserId = auth.user.id;
  const ctx = { tenantId: auth.active.tenantId, systemId: memberSystemId, actorUserId };
  const actor = toMemberActor(actorUserId, auth.active);
  try {
    const q = await member.quoteApply(ctx, actor, memberId, walletCart(unitId, lines, couponCode), {
      voucherIds: choices?.voucherIds ?? [],
      points: choices?.points ?? 0,
      giftCard: choices?.giftCard ?? null,
    });
    return {
      order: [...q.order],
      lines: q.lines.map((l) => ({ kind: l.kind, ref: l.ref, label: l.label, discountSatang: l.discountSatang, note: l.note ?? null })),
      conflicts: q.conflicts.map((c) => ({ kind: c.kind, ref: c.ref ?? null, message: c.message })),
      totalDiscountSatang: q.totalDiscountSatang,
      netSatang: q.netSatang,
      pointsToEarn: q.pointsToEarn,
      stampsToAdd: q.stampsToAdd,
    };
  } catch {
    return null; // คนนี้ไม่ได้อยู่ในระบบสมาชิกของสาขานี้ → ขายต่อได้ตามปกติ แค่ไม่มีแผงสิทธิ์
  }
}

/** ส่วนลดสิทธิ์ที่ POS ต้องหักเพิ่ม = ทุกบรรทัดของกระเป๋า **ยกเว้นคูปอง** (คูปอง POS หักไปแล้ว) */
function memberDiscountOf(q: PosMemberQuote | null): number {
  if (!q) return 0;
  return q.lines.reduce((s, l) => (l.kind === "COUPON" ? s : s + l.discountSatang), 0);
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

  // ── สิทธิ์สมาชิก (M2.8) — ลำดับ/กันซ้อน/เพดาน คิดที่ `member.quoteApply` ที่เดียว ──
  const links = await resolvePosLinks(tenantId, input.unitId);
  const memberQuote =
    mem.memberId && links.memberSystemId
      ? await memberQuoteOf(auth, links.memberSystemId, input.unitId, mem.memberId, norm.lines, input.couponCode, input.memberChoices)
      : null;
  const memberDiscount = memberDiscountOf(memberQuote);
  const grandTotal = Math.max(0, totals.grandTotal - memberDiscount);

  // payload PromptPay (dynamic — ล็อกยอด) จาก PromptPay ID ของร้าน (ไม่ตั้ง/เพี้ยน → null)
  let payload: string | null = null;
  const profile = await getPaymentProfile({ tenantId });
  if (profile?.promptpayId && grandTotal > 0) {
    try {
      payload = promptpayPayload({ id: profile.promptpayId, amountSatang: grandTotal });
    } catch {
      payload = null;
    }
  }

  return {
    ok: true,
    subtotalSatang: norm.subtotal,
    billDiscountSatang: totals.billDiscount,
    couponDiscountSatang: totals.couponDiscount,
    memberDiscountSatang: memberDiscount,
    grandTotalSatang: grandTotal,
    promptpayPayload: payload,
    member: memberQuote,
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

  const links = await resolvePosLinks(tenantId, input.unitId);
  // ── สิทธิ์สมาชิก (M2.8): คิดยอดที่ต้องเก็บด้วยเส้นเดียวกับที่ `createSale` จะตัดจริง ──
  // (ยอดต่าง = `createSale` โยน PAYMENT_MISMATCH — ตั้งใจให้ล้มเสียงดัง ไม่ใช่ขายเงียบด้วยยอดผิด)
  const memberQuote =
    mem.memberId && links.memberSystemId
      ? await memberQuoteOf(auth, links.memberSystemId, input.unitId, mem.memberId, norm.lines, input.couponCode, input.memberChoices)
      : null;
  const grandTotal = Math.max(0, totals.grandTotal - memberDiscountOf(memberQuote));

  // เงินสด: เงินรับต้องพอ (ถ้าส่งมา) → คำนวณเงินทอน (โชว์เฉย ๆ · payMethod = ยอดสุทธิเป๊ะตาม engine)
  let changeSatang = 0;
  if (payType === "CASH") {
    const received = Math.round(Number(input.cashReceivedSatang ?? grandTotal));
    if (Number.isFinite(received) && received > 0) {
      if (received < grandTotal) return { status: "error", message: "เงินรับน้อยกว่ายอดที่ต้องชำระ" };
      changeSatang = received - grandTotal;
    }
  }
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
      memberSystemId: links.memberSystemId ?? undefined,
      memberChoices: mem.memberId ? input.memberChoices : undefined,
      sourceModule: "POS",
      idempotencyKey,
      lines: safeLines.map((l) => ({ name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, itemId: l.itemId, serviceId: l.serviceId })),
      billDiscountSatang: totals.billDiscount,
      couponSystemId: totals.couponSystemId ?? undefined,
      couponCode: totals.couponSystemId ? input.couponCode?.trim().toUpperCase() : undefined,
      payMethods: [{ type: payType, amountSatang: grandTotal }],
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

// 🔴 13 ส.ค. 2026 (เจ้าของสั่งข้อ 15): จัดการบริการ/สินค้า ทำได้ที่ระบบสินค้า/บริการ "ที่เดียว"
// action เพิ่ม/แก้ราคา/ลบบริการ ที่เคยอยู่ตรงนี้ถูกถอดออกโดยเจตนา — หน้า POS อ่านอย่างเดียว
// (ของเดิมทำให้มีบริการ 2 ต้นฉบับ: ตั้งที่ POS กับที่จองคิว แล้วราคาไม่ตรงกัน)

