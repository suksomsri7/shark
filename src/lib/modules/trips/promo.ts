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
import { PricingAbort, TRIP_DEFAULT_TZ, tripLocalYmd, tripTzValid } from "./pricing-core";

type Tx = Prisma.TransactionClient;
const INT4 = 2_147_483_647;
const ID = z.string().min(1).max(200);
const CTX = z.object({ tenantId: ID, unitId: ID, now: z.date().optional() });
const REDEEM = z.strictObject({ ruleId: ID, contactKey: z.string().trim().min(1).max(200), bookingId: ID, discountSatang: z.number().int().min(0).max(INT4) });
const RELEASE = z.strictObject({ bookingId: ID });

const contactHash = (tenantId: string, key: string) => createHash("sha256").update(`${tenantId}:${key.trim().toLowerCase()}`).digest("hex");
const NOT_FOUND_TH = "ไม่พบรายการนี้ในหน่วยที่เลือก";
function scope(ctx: SellCtx): { tenantId: string; unitId: string; now: Date } {
  const c = CTX.safeParse(ctx);
  if (!c.success) throw new PricingAbort("NOT_FOUND", "NOT_FOUND", NOT_FOUND_TH);
  return { tenantId: c.data.tenantId, unitId: c.data.unitId, now: c.data.now ?? new Date() };
}

export type Redemption = { redemptionId: string; ruleId: string; bookingId: string; discountSatang: number; usedCount: number | null; replay: boolean };

type RuleRow = { active: boolean; kind: string; perContact: number | null; validFrom: string | null; validTo: string | null; tz: string | null };

/**
 * ตัดสิทธิ์โค้ด 1 ครั้งต่อการจอง (ใน tx ของผู้เรียก · T0.6 เรียกเป็นขั้นท้ายหลังล็อกการจอง):
 * (1) ล็อกต่อ (กฎ, ผู้ติดต่อ) · ตรวจกฎยังเปิด + อยู่ในช่วง validFrom/validTo ณ ctx.now (วันของหน่วย) · นับสิทธิ์ต่อผู้ติดต่อ
 * (2) UPDATE เดียวมีเพดาน · 0 แถว = หมด (หรือถูกปิดระหว่างทาง ⇒ PROMO_INACTIVE)
 * (3) INSERT TripPromoRedemption — การจองเดิมที่ ACTIVE = คืนผลเดิม ไม่นับเพิ่ม · ที่ RELEASED = นับใหม่ผ่านเส้นทางเดียวกันแล้วเปิดแถวเดิม
 */
export async function redeemPromoInTx(tx: unknown, ctx: SellCtx, input: unknown): Promise<SellResult<Redemption>> {
  const t = tx as Tx;
  const { tenantId, unitId, now } = scope(ctx);
  const p = REDEEM.safeParse(input);
  if (!p.success) throw new PricingAbort("VALIDATION", "INVALID_INPUT", "ข้อมูลการใช้โค้ดส่วนลดไม่ครบ");
  const { ruleId, bookingId, discountSatang } = p.data;
  const hash = contactHash(tenantId, p.data.contactKey);
  await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`trips:promo:${ruleId}:${hash}`}, 0))`;
  const rule = (
    await t.$queryRaw<RuleRow[]>`
      SELECT r.active, r.kind,
        LEAST((r."params"->>'perContact')::bigint, 2147483647)::int AS "perContact",
        r."params"->>'validFrom' AS "validFrom", r."params"->>'validTo' AS "validTo",
        u.settings->>'timezone' AS tz
      FROM "TripPriceRule" r JOIN "BusinessUnit" u ON u.id = r."unitId" AND u."tenantId" = r."tenantId"
      WHERE r.id = ${ruleId} AND r."tenantId" = ${tenantId} AND r."unitId" = ${unitId}`
  )[0];
  if (!rule || rule.kind !== "PROMO_CODE") throw new PricingAbort("NOT_FOUND", "NOT_FOUND", NOT_FOUND_TH);
  const prior = (
    await t.$queryRaw<{ id: string; discountSatang: number; status: string }[]>`
      SELECT id, "discountSatang", status FROM "TripPromoRedemption"
      WHERE "ruleId" = ${ruleId} AND "bookingId" = ${bookingId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId}`
  )[0];
  if (prior && prior.status === "ACTIVE") return { ok: true, value: { redemptionId: prior.id, ruleId, bookingId, discountSatang: prior.discountSatang, usedCount: null, replay: true } };
  if (!rule.active) throw new PricingAbort("VALIDATION", "PROMO_INACTIVE");
  const tz = rule.tz && rule.tz.trim() ? rule.tz.trim() : TRIP_DEFAULT_TZ;
  if (!tripTzValid(tz)) throw new PricingAbort("VALIDATION", "SETTINGS_INVALID");
  const today = tripLocalYmd(tz, now);
  if ((rule.validTo !== null && rule.validTo < today) || (rule.validFrom !== null && rule.validFrom > today)) throw new PricingAbort("VALIDATION", "PROMO_EXPIRED");
  if (rule.perContact !== null) {
    const used = (
      await t.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "TripPromoRedemption"
        WHERE "ruleId" = ${ruleId} AND "contactKeyHash" = ${hash} AND status = 'ACTIVE' AND "tenantId" = ${tenantId} AND "unitId" = ${unitId}`
    )[0];
    if ((used?.n ?? 0) >= rule.perContact) throw new PricingAbort("VALIDATION", "PROMO_PER_CONTACT");
  }
  // คำสั่งเดียว: เพิ่มตัวนับเฉพาะเมื่อกฎยังเปิดและยังไม่ถึงเพดาน (ล็อกแถวของ UPDATE ตัดสินลำดับ · READ COMMITTED ประเมิน WHERE ใหม่หลังรอ)
  const bumped = await t.$queryRaw<{ usedCount: number; maxUses: number | null }[]>`
    UPDATE "TripPriceRule" SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
    WHERE id = ${ruleId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND active AND kind = 'PROMO_CODE'
      AND ("params"->>'maxUses' IS NULL OR "usedCount" < ("params"->>'maxUses')::bigint)
    RETURNING "usedCount", LEAST(("params"->>'maxUses')::bigint, 2147483647)::int AS "maxUses"`;
  if (bumped.length !== 1) {
    // แยกเหตุ (อ่านเพื่อรายงานเท่านั้น — ไม่ได้ใช้ค่าที่อ่านไปเขียน): ถูกปิดระหว่างทาง ≠ ใช้ครบ
    const now2 = (await t.$queryRaw<{ active: boolean }[]>`SELECT active FROM "TripPriceRule" WHERE id = ${ruleId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId}`)[0];
    throw new PricingAbort("VALIDATION", now2 && !now2.active ? "PROMO_INACTIVE" : "PROMO_EXHAUSTED");
  }
  let id: string;
  let eventKey: string;
  if (prior) {
    // เคยคืนสิทธิ์แล้ว (RELEASED) ⇒ นับใหม่แล้ว (ด้านบน) เปิดแถวเดิม
    const re = await t.$queryRaw<{ id: string }[]>`
      UPDATE "TripPromoRedemption" SET status = 'ACTIVE', "releasedAt" = NULL, "contactKeyHash" = ${hash}, "discountSatang" = ${discountSatang}
      WHERE id = ${prior.id} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND status = 'RELEASED'
      RETURNING id`;
    if (re.length !== 1) throw new PricingAbort("STATE_CONFLICT", "DUPLICATE_BOOKING", "การจองนี้ใช้โค้ดนี้ไปแล้ว — โหลดใหม่แล้วลองอีกครั้ง");
    id = prior.id;
    eventKey = `trips.promo.redeemed:${id}:${now.getTime()}`;
  } else {
    id = `tpr_${randomBytes(12).toString("hex")}`;
    const ins = await t.$queryRaw<{ id: string }[]>`
      INSERT INTO "TripPromoRedemption" (id, "tenantId", "unitId", "ruleId", "contactKeyHash", "bookingId", "discountSatang", status, "createdAt")
      VALUES (${id}, ${tenantId}, ${unitId}, ${ruleId}, ${hash}, ${bookingId}, ${discountSatang}, 'ACTIVE', now())
      ON CONFLICT ("ruleId", "bookingId") DO NOTHING
      RETURNING id`;
    if (ins.length !== 1) throw new PricingAbort("STATE_CONFLICT", "DUPLICATE_BOOKING", "การจองนี้ใช้โค้ดนี้ไปแล้ว — โหลดใหม่แล้วลองอีกครั้ง");
    eventKey = `trips.promo.redeemed:${id}`;
  }
  await emitOutbox(t, { tenantId, unitId, type: "trips.promo.redeemed", idempotencyKey: eventKey, payload: { ruleId, bookingId, discountSatang } });
  const { usedCount, maxUses } = bumped[0];
  if (maxUses !== null && usedCount >= maxUses) {
    await emitOutbox(t, { tenantId, unitId, type: "trips.promo.exhausted", idempotencyKey: `trips.promo.exhausted:${ruleId}`, payload: { ruleId, unitId, maxUses } });
  }
  return { ok: true, value: { redemptionId: id, ruleId, bookingId, discountSatang, usedCount, replay: false } };
}

/** คืนสิทธิ์โค้ดของการจอง (ยกเลิก) — RELEASED + ลดตัวนับ 1 (ไม่ต่ำกว่า 0 · ครั้งเดียวต่อ redemption) · ล็อกแถวกฎเรียงตาม id ก่อน (กัน deadlock) */
export async function releasePromoInTx(tx: unknown, ctx: SellCtx, input: unknown): Promise<SellResult<{ released: number }>> {
  const t = tx as Tx;
  const { tenantId, unitId } = scope(ctx);
  const p = RELEASE.safeParse(input);
  if (!p.success) throw new PricingAbort("VALIDATION", "INVALID_INPUT", "ต้องระบุการจองที่จะคืนสิทธิ์โค้ด");
  const ruleIds = (
    await t.$queryRaw<{ ruleId: string }[]>`
      SELECT DISTINCT "ruleId" FROM "TripPromoRedemption"
      WHERE "bookingId" = ${p.data.bookingId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND status = 'ACTIVE'
      ORDER BY "ruleId"`
  ).map((r) => r.ruleId);
  if (!ruleIds.length) return { ok: true, value: { released: 0 } };
  await t.$queryRaw`SELECT id FROM "TripPriceRule" WHERE id = ANY(${ruleIds}::text[]) AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} ORDER BY id FOR UPDATE`;
  const rows = await t.$queryRaw<{ id: string; ruleId: string }[]>`
    UPDATE "TripPromoRedemption" SET status = 'RELEASED', "releasedAt" = now()
    WHERE "bookingId" = ${p.data.bookingId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND status = 'ACTIVE'
    RETURNING id, "ruleId"`;
  for (const r of [...rows].sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0))) {
    await t.$executeRaw`
      UPDATE "TripPriceRule" SET "usedCount" = GREATEST("usedCount" - 1, 0), "updatedAt" = now()
      WHERE id = ${r.ruleId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId}`;
  }
  return { ok: true, value: { released: rows.length } };
}
