// SVC rel-fix ▸ บิล POS ของการจองโรงแรม V2 — ย้ายจาก booking.ts แบบคำต่อคำ (ไม่เปลี่ยนพฤติกรรม)
//   ทำไมแยก: กติกา POS P2.1 CD2 = "ไฟล์ของโมดูลธุรกิจที่เรียก createSale ห้ามแตะช่องทางขายของ POS" (qc-pos-p2.1 ST3 ตรวจรายไฟล์) ·
//   booking.ts ถือเลขการจองของช่องทาง OTA (คอลัมน์ HotelReservation · คนละความหมายกับช่องทางขาย POS) ⇒ ชื่อชนกัน จึงแยกจุดออกบิลมาที่นี่
//   ทุกบิลที่นี่ไม่ส่งช่องทางขาย ⇒ POS ใช้ช่องทาง STORE ของสาขา (defaultChannelCode: HOTEL → STORE) เหมือนเดิม
//   ในธุรกรรมของผู้เรียก = callerTx(tx) เสมอ (HF-TX HT6.1)
import { callerTx } from "@/lib/core/caller-tx";
import * as pos from "@/lib/modules/pos/service";
import type { DepositForfeitSell, ModuleDepositSell } from "@/lib/modules/pos/deposit";

type Ctx = { tenantId: string; unitId: string };

/** บิลริบมัดจำของการจอง (ส่งให้ moduleForfeitDeposit · ในธุรกรรมของ POS deposit) */
export const forfeitSellFor = (c: Ctx, systemId: string, reservationId: string): DepositForfeitSell =>
  (tx, p) =>
    pos.createSale({ ...c, systemId, sourceModule: "HOTEL", sourceId: reservationId, ...p }, callerTx(tx));

/** บิลค่าธรรมเนียมยกเลิก (จ่ายด้วยแถว DEPOSIT อ้างใบรับ · คีย์ dep-forfeit:<มัดจำ> ที่ผู้เรียกเลือกแล้ว · นอกธุรกรรม) */
export function cancelFeeSale(
  c: Ctx,
  p: { systemId: string; reservationId: string; code: string; idempotencyKey: string; amountSatang: number; receiptSaleId: string; customerId: string | null },
) {
  return pos.createSale({
    ...c,
    systemId: p.systemId,
    sourceModule: "HOTEL",
    sourceId: p.reservationId,
    idempotencyKey: p.idempotencyKey,
    lines: [{ name: `ค่าธรรมเนียมยกเลิก ${p.code}`, qty: 1, unitPriceSatang: p.amountSatang }],
    payMethods: [{ type: "DEPOSIT", amountSatang: p.amountSatang, refSaleId: p.receiptSaleId }],
    ...(p.customerId ? { memberId: p.customerId, memberAttachOnly: true as const } : {}),
  });
}

/** ใบรับมัดจำห้อง (ส่งให้ moduleTakeDeposit · ในธุรกรรมของใบรับ) */
export const depositSellFor = (c: Ctx, p: { systemId: string; code: string; amountSatang: number; reference?: string | null }): ModuleDepositSell =>
  (tx, k) =>
    pos.createSale(
      {
        ...c,
        systemId: p.systemId,
        sourceModule: k.sourceModule,
        sourceId: k.sourceId,
        idempotencyKey: k.idempotencyKey,
        lines: [{ name: `มัดจำห้อง ${p.code}`, qty: 1, unitPriceSatang: p.amountSatang }],
        payMethods: [{ type: k.payType, amountSatang: p.amountSatang, ...(p.reference ? { reference: p.reference } : {}) }],
      },
      callerTx(tx),
    );
