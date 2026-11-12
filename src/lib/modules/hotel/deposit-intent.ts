// SVC H.8 r3 ▸ (deposit-intent.ts) เงินจากสลิปมัดจำเว็บที่ลงเป็นมัดจำของการจองไม่ได้ + ยอดมัดจำที่ต้องรับเดิม (ผู้ตรวจรอบ 2 เงิน B-1/B-2/B-3/B-9 · มติผู้คุม)
//   ผู้เรียกเดียว = `src/lib/platform/hotel-web.ts` (consumer payment.slip.approved สาขา HOTEL · ผ่าน facade index.ts)
//   • recordUnappliedSlipMoney: เส้นเดียวกับ "จ่ายช้าแต่ห้องเต็ม" (takeBookingDeposit → deposit_after_expiry) — รับเงินเป็นใบรับมัดจำ POS
//     (PROMPTPAY · reference slip:<id>) แล้วคืนเต็มอัตโนมัติทันที ⇒ เงินที่แขกโอนมีบันทึกเสมอ · ไม่แตะสถานะ/มัดจำของการจอง
//     คีย์ใบรับ hotel-slip-<slipId> (ไม่ชนคีย์มัดจำของการจอง hotel-deposit-<group|id>) · กันทำซ้ำที่ผู้เรียก (สลิปที่มี PosPayment slip:<id> แล้ว = settled)
//   • keepDepositRequired: อนุมัติบางส่วน ⇒ จด policySnapshot.depositRequiredSatang (ยอดที่ต้องรับเดิม) ก่อน takeBookingDeposit เขียน depositSatang = ยอดรับจริง
//   • webSlipSlot: ลำดับช่องสลิปของการจอง (= จำนวนสลิปที่ตัดสินแล้ว) ⇒ กุญแจสลิปต่อช่อง — แนบพร้อมกันหลายทางเข้าคิวล็อกเดียวของ submitSlip (B-9)
import type { PosPayType } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { callerTx } from "@/lib/core/caller-tx";
import * as pos from "@/lib/modules/pos/service";
import { moduleRefundDeposit, moduleTakeDeposit } from "@/lib/modules/pos/deposit";
import { systemForUnit } from "@/lib/modules/system/service";

const SYSTEM_ACTOR_ID = "module:hotel";
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export type UnappliedSlipMoney = {
  /** ใบรับเงินจากสลิป (null = ไม่มี POS/ออกใบรับไม่ได้ ⇒ พนักงานจัดการมือ) */
  saleId: string | null;
  /** คืนเต็มสำเร็จ */
  refunded: boolean;
  refundSaleId: string | null;
  error: string | null;
};

/**
 * เงินจากสลิปที่อนุมัติแล้วแต่ลงเป็นมัดจำของการจองไม่ได้ (การจองยกเลิกแล้ว · ได้มัดจำจากทางอื่นแล้ว · สลิปใบที่สอง ฯลฯ)
 * ⇒ ใบรับมัดจำ POS (PROMPTPAY · reference slip:<id>) + คืนเต็มอัตโนมัติ · ไม่ throw (ล้ม = error ให้ผู้เรียกยิง event ให้พนักงาน)
 */
export async function recordUnappliedSlipMoney(
  tenantId: string,
  input: { unitId: string; reservationId: string; slipId: string; amountSatang: number; reason: string },
): Promise<UnappliedSlipMoney> {
  const none = (error: string): UnappliedSlipMoney => ({ saleId: null, refunded: false, refundSaleId: null, error });
  try {
    if (!isStr(tenantId) || !isStr(input.unitId) || !isStr(input.slipId) || !Number.isSafeInteger(input.amountSatang) || input.amountSatang <= 0) return none("INVALID_INPUT");
    const c = { tenantId, unitId: input.unitId };
    const rv = await tenantDb(c).hotelReservation.findFirst({ where: { id: input.reservationId }, select: { id: true, code: true, customerId: true, guestName: true } });
    if (!rv) return none("NOT_FOUND");
    const systemId = await systemForUnit(tenantId, input.unitId, "POS");
    if (!systemId) return none("NO_POS");
    const amount = input.amountSatang;
    const reference = `slip:${input.slipId}`.slice(0, 64);
    const label = `เงินโอนจากสลิป (ลงมัดจำไม่ได้) ${rv.code}`;
    const sale = await moduleTakeDeposit(
      { ...c, systemId, keyBase: `hotel-slip-${input.slipId}`, amountSatang: amount, payType: "PROMPTPAY" as PosPayType, customerId: rv.customerId ?? null, customerName: rv.guestName ?? null, note: label, createdBy: SYSTEM_ACTOR_ID },
      (tx, k) =>
        pos.createSale(
          {
            ...c,
            systemId,
            sourceModule: k.sourceModule,
            sourceId: k.sourceId,
            idempotencyKey: k.idempotencyKey,
            lines: [{ name: label, qty: 1, unitPriceSatang: amount }],
            payMethods: [{ type: k.payType, amountSatang: amount, reference }],
          },
          callerTx(tx),
        ),
    );
    const r = await moduleRefundDeposit({ ...c, receiptSaleId: sale.saleId, reason: `คืนเงินโอนจากสลิปอัตโนมัติ ${rv.code} (${input.reason})`.slice(0, 200), actorId: SYSTEM_ACTOR_ID });
    if (!r.ok) return { saleId: sale.saleId, refunded: false, refundSaleId: null, error: r.message.slice(0, 160) };
    return { saleId: sale.saleId, refunded: true, refundSaleId: r.refundSaleId, error: null };
  } catch (e) {
    return none(e instanceof Error ? e.message.slice(0, 160) : "FAILED");
  }
}

/**
 * อนุมัติบางส่วน (ยอดรับ < มัดจำที่ต้องรับ) ⇒ จดยอดที่ต้องรับเดิมไว้ใน policySnapshot.depositRequiredSatang ของทุกแถวในกลุ่ม
 * (ครั้งแรกเท่านั้น · ยังไม่ได้รับมัดจำ) — takeBookingDeposit เขียน depositSatang = ยอดรับจริงตามเดิม · ไม่ throw
 */
export async function keepDepositRequired(tenantId: string, unitId: string, headId: string, receivedSatang: number): Promise<void> {
  if (!isStr(tenantId) || !isStr(unitId) || !isStr(headId) || !Number.isSafeInteger(receivedSatang)) return;
  try {
    await tenantDb({ tenantId }).$executeRaw`
      UPDATE "HotelReservation" AS r
         SET "policySnapshot" = jsonb_set(CASE WHEN jsonb_typeof(r."policySnapshot"::jsonb) = 'object' THEN r."policySnapshot"::jsonb ELSE '{}'::jsonb END, '{depositRequiredSatang}', to_jsonb(h."depositSatang")),
             "updatedAt" = NOW()
        FROM "HotelReservation" AS h
       WHERE h."id" = ${headId} AND h."tenantId" = ${tenantId} AND h."unitId" = ${unitId}
         AND h."depositPaidAt" IS NULL AND h."depositSatang" > ${receivedSatang}
         AND r."tenantId" = ${tenantId} AND r."unitId" = ${unitId}
         AND (r."id" = h."id" OR (h."groupId" IS NOT NULL AND r."groupId" = h."groupId"))
         AND (r."policySnapshot"::jsonb -> 'depositRequiredSatang') IS NULL`;
  } catch (e) {
    console.error(`[hotel.web] จดยอดมัดจำที่ต้องรับไม่สำเร็จ (${e instanceof Error ? e.name : "Error"})`);
  }
}

/** ยอดมัดจำที่ต้องรับเดิม (อนุมัติบางส่วน) จาก policySnapshot — ไม่มี/ไม่ใช่จำนวนเต็มบวก = null */
export function depositRequiredOfSnapshot(snapshot: unknown): number | null {
  const v = isRec(snapshot) ? snapshot.depositRequiredSatang : undefined;
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;
}

/** ลำดับช่องสลิปของการจอง = จำนวนสลิปมัดจำ (HOTEL) ของแถวในกลุ่มที่ตัดสินแล้ว (ไม่ใช่ PENDING/NEEDS_REVIEW) */
export async function webSlipSlot(tenantId: string, unitId: string, reservationIds: string[]): Promise<number> {
  const ids = reservationIds.filter(isStr);
  if (!isStr(tenantId) || !ids.length) return 0;
  return tenantDb({ tenantId, unitId }).paymentSlip.count({ where: { domain: "HOTEL", refType: "HOTEL_DEPOSIT", refId: { in: ids }, status: { notIn: ["PENDING", "NEEDS_REVIEW"] } } });
}

export type PartialDepositRow = { id: string; code: string; requiredSatang: number; paidSatang: number; dueSatang: number };
/**
 * การจองที่ยังใช้งานอยู่ซึ่งรับมัดจำไม่ครบ (อนุมัติสลิปบางส่วน · policySnapshot.depositRequiredSatang > depositSatang) — แถบ «มัดจำรับไม่ครบ» หน้ารายการการจอง
 * ผู้เรียกตรวจสิทธิ์ดูการจองของหน่วยแล้ว (listBookings ok) · สูงสุด 20 แถว
 */
export async function partialDepositsOf(tenantId: string, unitId: string): Promise<PartialDepositRow[]> {
  if (!isStr(tenantId) || !isStr(unitId)) return [];
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; code: string; required: number; paid: number }[]>`
    SELECT "id", "code", ("policySnapshot"::jsonb ->> 'depositRequiredSatang')::int AS "required", "depositSatang" AS "paid"
      FROM "HotelReservation"
     WHERE "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND "depositPaidAt" IS NOT NULL
       AND "status"::text IN ('HOLD', 'CONFIRMED', 'CHECKED_IN')
       AND jsonb_typeof("policySnapshot"::jsonb -> 'depositRequiredSatang') = 'number'
       AND ("policySnapshot"::jsonb ->> 'depositRequiredSatang')::numeric > "depositSatang"
     ORDER BY "checkInDate" ASC, "code" ASC
     LIMIT 20`;
  return rows.map((r) => ({ id: r.id, code: r.code, requiredSatang: Number(r.required), paidSatang: Number(r.paid), dueSatang: Math.max(0, Number(r.required) - Number(r.paid)) }));
}
