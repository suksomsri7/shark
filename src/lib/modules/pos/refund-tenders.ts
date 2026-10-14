// refund-tenders.ts — POS P2.9U ▸ ตัวอ่านตัวเลือกคืนเงินเข้าบัตร/เครดิตร้านของจอ 12 (อ่านอย่างเดียว · มติผู้คุม P2.9U ข้อ 8 · hunt H1) ◂
// 🔴 ขอบเขต/สิทธิ์ = saleForRefund (ตัวเดียวกับจอคืนเงิน: บิลของสาขา + pos.sale.refund|create) ก่อนอ่านอะไรเพิ่ม · ไม่เขียน
// 🔴 บัตรผ่าน member facade เท่านั้น (import แบบไดนามิก — แบบ tender.ts · ห้าม import โมดูลบัตรตรงใน modules/pos)
// 🔴 เพดานที่นี่ = ตัวเลขแสดงผล — refundSale (planRefundTenders) ตรวจซ้ำในtx เสมอ

import { prisma } from "./db";
import { saleForRefund } from "./refund";
import type { RegisterActor, RegisterCtx } from "./register-shared";
import type { RefundTenderCard, RefundTenderOptionsResult } from "./refund-tenders-shared";

const CASH_LIKE: ReadonlySet<string> = new Set(["CASH", "PROMPTPAY", "TRANSFER", "CARD"]);

export async function refundTenderOptions(ctx: RegisterCtx, actor: RegisterActor, input: { saleId: string }): Promise<RefundTenderOptionsResult> {
  const base = await saleForRefund(ctx, actor, input);
  if (!base.ok) return base;
  const saleId = base.sale.id;
  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId: ctx.tenantId, docType: "SALE" },
    select: { id: true, tenantId: true, unitId: true, memberId: true, tipSatang: true, payments: { select: { type: true, amountSatang: true, giftCardId: true, giftCardTxnId: true }, orderBy: { id: "asc" } } },
  });
  if (!sale) return { ok: false, code: "SALE_NOT_FOUND", message: "ไม่พบบิลนี้ในสาขานี้" };
  const tender = sale.payments.some((p) => p.type === "GIFT_CARD" || p.type === "STORE_CREDIT");
  if (!tender) return { ok: true, cards: [], memberBill: !!sale.memberId, cashLikeCapSatang: null, stuckCardSatang: 0 };
  const prior = await prisma.posSale.findMany({
    where: { tenantId: sale.tenantId, unitId: sale.unitId, docType: "REFUND", refSaleId: sale.id },
    select: { payments: { select: { type: true, amountSatang: true, giftCardId: true } } },
  });
  const priorPays = prior.flatMap((d) => d.payments);
  const paid = new Map<string, { satang: number; txnId: string | null }>();
  for (const p of sale.payments) {
    if (p.type !== "GIFT_CARD" || !p.giftCardId) continue;
    const cur = paid.get(p.giftCardId);
    paid.set(p.giftCardId, { satang: (cur?.satang ?? 0) + p.amountSatang, txnId: cur?.txnId ?? p.giftCardTxnId ?? null });
  }
  const back = new Map<string, number>();
  for (const p of priorPays) if (p.type === "GIFT_CARD" && p.giftCardId) back.set(p.giftCardId, (back.get(p.giftCardId) ?? 0) + p.amountSatang);
  const member = await import("@/lib/modules/member");
  const txnIds = [...paid.values()].map((v) => v.txnId).filter((x): x is string => !!x);
  const info = new Map((await member.tenderCardInfo(sale.tenantId, txnIds)).map((c) => [c.txnId, c]));
  const cards: RefundTenderCard[] = [];
  let stuck = 0;
  for (const [giftCardId, v] of paid) {
    const refundedSatang = back.get(giftCardId) ?? 0;
    const capSatang = Math.max(0, v.satang - refundedSatang);
    const refundable = await member.giftCardRefundable(sale.tenantId, giftCardId);
    if (!refundable) stuck += capSatang;
    cards.push({ giftCardId, numberMasked: (v.txnId && info.get(v.txnId)?.numberMasked) || "GC-••••", paidSatang: v.satang, refundedSatang, capSatang, refundable: !!refundable });
  }
  const cashPaid = sale.payments.filter((p) => CASH_LIKE.has(p.type)).reduce((t, p) => t + p.amountSatang, 0) - Math.max(0, sale.tipSatang);
  const cashBack = priorPays.filter((p) => CASH_LIKE.has(p.type)).reduce((t, p) => t + p.amountSatang, 0);
  return { ok: true, cards, memberBill: !!sale.memberId, cashLikeCapSatang: Math.max(0, cashPaid - cashBack), stuckCardSatang: stuck };
}
