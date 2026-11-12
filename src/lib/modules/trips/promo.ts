// ─────────────────────────────────────────────────────────────
// trips/promo.ts — ตัดสิทธิ์/คืนสิทธิ์โค้ดส่วนลดในธุรกรรมของผู้เรียก (RUN TRIPS T0.5 · ผู้เรียก = T0.6 ตอนยืนยัน/ยกเลิก)
// ใบสั่ง ledger/trips-briefs/T0.5.md §5.3 §8 · มติ §13 (ตาราง TripPromoRedemption · usedCount)
//
// 🔴 ไม่เปิด/ไม่ commit ธุรกรรมเอง · ปฏิเสธ = throw PricingAbort (ผู้เรียก rollback)
// 🔴 ตัดสิทธิ์ด้วย "คำสั่งเดียว" ที่มีเงื่อนไขเพดาน + ตรวจจำนวนแถวที่ได้ (ห้ามอ่านค่าแล้วเขียนค่าที่คำนวณเอง)
// 🔴 ทุกคำสั่งมี "tenantId" + "unitId" · ผู้ติดต่อเก็บเป็นแฮชเท่านั้น · event ไม่มีโค้ด/ผู้ติดต่อ
// ─────────────────────────────────────────────────────────────
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { emitOutbox } from "@/lib/core/outbox";
import type { SellCtx, SellResult } from "@/lib/core/sellable";
import { PricingAbort } from "./pricing-core";

type Tx = Prisma.TransactionClient;
const INT4 = 2_147_483_647;
const ID = z.string().min(1).max(200);
const CTX = z.object({ tenantId: ID, unitId: ID });
const REDEEM = z.strictObject({ ruleId: ID, contactKey: z.string().trim().min(1).max(200), bookingId: ID, discountSatang: z.number().int().min(0).max(INT4) });
const RELEASE = z.strictObject({ bookingId: ID });

const contactHash = (tenantId: string, key: string) => createHash("sha256").update(`${tenantId}:${key.trim().toLowerCase()}`).digest("hex");
function scope(ctx: SellCtx): { tenantId: string; unitId: string } {
  const c = CTX.safeParse(ctx);
  if (!c.success) throw new PricingAbort("NOT_FOUND", "NOT_FOUND", "ไม่พบรายการนี้ในหน่วยที่เลือก");
  return c.data;
}

export type Redemption = { redemptionId: string; ruleId: string; bookingId: string; discountSatang: number; usedCount: number | null; replay: boolean };

/**
 * ตัดสิทธิ์โค้ด 1 ครั้งต่อการจอง: (1) ล็อกต่อ (กฎ, ผู้ติดต่อ) แล้วนับสิทธิ์ต่อผู้ติดต่อ (2) UPDATE เดียวมีเพดาน · 0 แถว = หมด
 * (3) INSERT TripPromoRedemption · การจองเดิมซ้ำ = คืนผลเดิม ไม่นับเพิ่ม
 */
export async function redeemPromoInTx(tx: unknown, ctx: SellCtx, input: unknown): Promise<SellResult<Redemption>> {
  const t = tx as Tx;
  const { tenantId, unitId } = scope(ctx);
  const p = REDEEM.safeParse(input);
  if (!p.success) throw new PricingAbort("VALIDATION", "INVALID_INPUT", "ข้อมูลการใช้โค้ดส่วนลดไม่ครบ");
  const { ruleId, bookingId, discountSatang } = p.data;
  const hash = contactHash(tenantId, p.data.contactKey);
  await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`trips:promo:${ruleId}:${hash}`}, 0))`;
  const rule = (
    await t.$queryRaw<{ active: boolean; kind: string; perContact: number | null }[]>`
      SELECT active, kind, ("params"->>'perContact')::int AS "perContact" FROM "TripPriceRule"
      WHERE id = ${ruleId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId}`
  )[0];
  if (!rule || rule.kind !== "PROMO_CODE") throw new PricingAbort("NOT_FOUND", "NOT_FOUND", "ไม่พบโค้ดส่วนลดนี้ในหน่วยที่เลือก");
  const prior = (
    await t.$queryRaw<{ id: string; discountSatang: number }[]>`
      SELECT id, "discountSatang" FROM "TripPromoRedemption"
      WHERE "ruleId" = ${ruleId} AND "bookingId" = ${bookingId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId}`
  )[0];
  if (prior) return { ok: true, value: { redemptionId: prior.id, ruleId, bookingId, discountSatang: prior.discountSatang, usedCount: null, replay: true } };
  if (!rule.active) throw new PricingAbort("VALIDATION", "PROMO_INACTIVE");
  if (rule.perContact !== null) {
    const used = (
      await t.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "TripPromoRedemption"
        WHERE "ruleId" = ${ruleId} AND "contactKeyHash" = ${hash} AND status = 'ACTIVE' AND "tenantId" = ${tenantId} AND "unitId" = ${unitId}`
    )[0];
    if ((used?.n ?? 0) >= rule.perContact) throw new PricingAbort("VALIDATION", "PROMO_PER_CONTACT");
  }
  // คำสั่งเดียว: เพิ่มตัวนับเฉพาะเมื่อยังไม่ถึงเพดาน (ล็อกแถวของ UPDATE ตัดสินลำดับ · READ COMMITTED ประเมิน WHERE ใหม่หลังรอ)
  const bumped = await t.$queryRaw<{ usedCount: number; maxUses: number | null }[]>`
    UPDATE "TripPriceRule" SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
    WHERE id = ${ruleId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND active AND kind = 'PROMO_CODE'
      AND ("params"->>'maxUses' IS NULL OR "usedCount" < ("params"->>'maxUses')::int)
    RETURNING "usedCount", ("params"->>'maxUses')::int AS "maxUses"`;
  if (bumped.length !== 1) throw new PricingAbort("VALIDATION", "PROMO_EXHAUSTED");
  const id = `tpr_${randomBytes(12).toString("hex")}`;
  const ins = await t.$queryRaw<{ id: string }[]>`
    INSERT INTO "TripPromoRedemption" (id, "tenantId", "unitId", "ruleId", "contactKeyHash", "bookingId", "discountSatang", status, "createdAt")
    VALUES (${id}, ${tenantId}, ${unitId}, ${ruleId}, ${hash}, ${bookingId}, ${discountSatang}, 'ACTIVE', now())
    ON CONFLICT ("ruleId", "bookingId") DO NOTHING
    RETURNING id`;
  if (ins.length !== 1) throw new PricingAbort("STATE_CONFLICT", "DUPLICATE_BOOKING", "การจองนี้ใช้โค้ดนี้ไปแล้ว — โหลดใหม่แล้วลองอีกครั้ง");
  await emitOutbox(t, { tenantId, unitId, type: "trips.promo.redeemed", idempotencyKey: `trips.promo.redeemed:${id}`, payload: { ruleId, bookingId, discountSatang } });
  const { usedCount, maxUses } = bumped[0];
  if (maxUses !== null && usedCount >= maxUses) {
    await emitOutbox(t, { tenantId, unitId, type: "trips.promo.exhausted", idempotencyKey: `trips.promo.exhausted:${ruleId}`, payload: { ruleId, unitId, maxUses } });
  }
  return { ok: true, value: { redemptionId: id, ruleId, bookingId, discountSatang, usedCount, replay: false } };
}

/** คืนสิทธิ์โค้ดของการจอง (ยกเลิก) — RELEASED + ลดตัวนับ 1 (ไม่ต่ำกว่า 0 · ครั้งเดียวต่อ redemption) */
export async function releasePromoInTx(tx: unknown, ctx: SellCtx, input: unknown): Promise<SellResult<{ released: number }>> {
  const t = tx as Tx;
  const { tenantId, unitId } = scope(ctx);
  const p = RELEASE.safeParse(input);
  if (!p.success) throw new PricingAbort("VALIDATION", "INVALID_INPUT", "ต้องระบุการจองที่จะคืนสิทธิ์โค้ด");
  const rows = await t.$queryRaw<{ id: string; ruleId: string }[]>`
    UPDATE "TripPromoRedemption" SET status = 'RELEASED', "releasedAt" = now()
    WHERE "bookingId" = ${p.data.bookingId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND status = 'ACTIVE'
    RETURNING id, "ruleId"`;
  for (const r of rows) {
    await t.$executeRaw`
      UPDATE "TripPriceRule" SET "usedCount" = GREATEST("usedCount" - 1, 0), "updatedAt" = now()
      WHERE id = ${r.ruleId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId}`;
  }
  return { ok: true, value: { released: rows.length } };
}
