// ─────────────────────────────────────────────────────────────
// trips/json-schemas.ts — รูป JSON ของคอลัมน์ Json ในตาราง trips (zod v4) · RUN TRIPS T0.1
// สัญญา: ledger/TRIPS-CORE-CONTRACT.md §N.2 (คัดตรงตัว) · ใบสั่ง ledger/trips-briefs/T0.1.md §4.3
//
// 🔴 pure ล้วน: import ได้แค่ zod + @/lib/core/sellable (ข้อสอบ S-5)
// วันที่ = "YYYY-MM-DD" (ต้องเป็นวันที่มีจริง) · weekday 0–6 (0 = อาทิตย์) · discountBp 0–10000 · เงิน ≥ 0
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { SELL_CHANNELS } from "@/lib/core/sellable";

/** "YYYY-MM-DD" ที่เป็นวันที่มีจริงในปฏิทิน (ไม่ใช้เวลาเครื่อง — เทียบ UTC ล้วน) */
export function isYmd(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

const YMD = z.string().refine(isYmd, { message: "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว และเป็นวันที่มีจริง" });
const WEEKDAY = z.number().int().min(0).max(6);
const MIN_OF_DAY = z.number().int().min(0).max(1439);
const COUNT = z.number().int().min(0);
const BP = z.number().int().min(0).max(10_000);
const MINOR = z.number().int().min(0);
const SATANG = z.number().int().min(0);
const CHANNEL = z.enum(SELL_CHANNELS);
const ISO_DATETIME = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "เวลาต้องเป็นรูปแบบ ISO" });

/** TripSchedule.rule */
export const tripScheduleRuleSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("DAILY") }),
  z.strictObject({ kind: z.literal("WEEKLY"), weekdays: z.array(WEEKDAY).min(1).max(7) }),
  z.strictObject({ kind: z.literal("DATES"), dates: z.array(YMD).min(1) }),
]);
export type TripScheduleRule = z.infer<typeof tripScheduleRuleSchema>;

/** TripSchedule.exceptions */
export const tripScheduleExceptionsSchema = z
  .array(
    z.strictObject({
      date: YMD,
      action: z.enum(["SKIP", "OVERRIDE"]),
      departTimeMin: MIN_OF_DAY.optional(),
      capacity: COUNT.optional(),
      minPax: z.number().int().min(1).nullable().optional(), // r2 ▸ 0 ไม่มีความหมาย (null = ไม่กำหนด) ◂
    }),
  )
  .refine((a) => new Set(a.map((x) => x.date)).size === a.length, { message: "วันที่ยกเว้นซ้ำ" });
export type TripScheduleExceptions = z.infer<typeof tripScheduleExceptionsSchema>;

const APPLIES_TO = z
  .strictObject({
    optionIds: z.array(z.string().min(1)).optional(),
    paxTypeCodes: z.array(z.string().min(1)).optional(),
    channels: z.array(CHANNEL).optional(),
  })
  .optional();

const groupTiers = z
  .array(z.strictObject({ minPax: z.number().int().min(1), discountBp: BP }))
  .min(1)
  .refine((ts) => ts.every((t, i) => i === 0 || t.minPax > ts[i - 1].minPax), { message: "ขั้นราคากลุ่มต้องเรียงจำนวนคนจากน้อยไปมาก" });

/** TripPriceRule.params — r2 ▸ ส่วนลดต้องระบุอย่างใดอย่างหนึ่ง (bp หรือจำนวนเงิน) · ช่วงวันปิด from ≤ to ◂ */
export const tripPriceRuleParamsSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("EARLY_BIRD"), appliesTo: APPLIES_TO, minDaysBefore: COUNT, discountBp: BP.optional(), discountMinor: MINOR.optional() }),
  z.strictObject({ kind: z.literal("LAST_MINUTE"), appliesTo: APPLIES_TO, maxHoursBefore: COUNT, discountBp: BP.optional(), discountMinor: MINOR.optional() }),
  z.strictObject({ kind: z.literal("GROUP_TIER"), appliesTo: APPLIES_TO, tiers: groupTiers }),
  z.strictObject({ kind: z.literal("FREE_LEADER"), appliesTo: APPLIES_TO, everyPaid: z.number().int().min(1), freeQty: z.number().int().min(1), paxTypeCode: z.string().min(1) }),
  z.strictObject({ kind: z.literal("BLACKOUT"), appliesTo: APPLIES_TO, dates: z.array(YMD), ranges: z.array(z.strictObject({ from: YMD, to: YMD })) }),
  z.strictObject({
    kind: z.literal("PROMO_CODE"),
    appliesTo: APPLIES_TO,
    code: z.string().min(1).max(64),
    discountBp: BP.optional(),
    discountMinor: MINOR.optional(),
    maxUses: COUNT.optional(),
    perContact: COUNT.optional(),
    validFrom: YMD.optional(),
    validTo: YMD.optional(),
  }),
]).superRefine((v, ctx) => {
  if (v.kind === "EARLY_BIRD" || v.kind === "LAST_MINUTE" || v.kind === "PROMO_CODE") {
    if ((v.discountBp === undefined) === (v.discountMinor === undefined)) ctx.addIssue({ code: "custom", message: "ระบุส่วนลดเป็นเปอร์เซ็นต์หรือจำนวนเงินอย่างใดอย่างหนึ่ง" });
  }
  if (v.kind === "BLACKOUT" && v.ranges.some((r) => r.from > r.to)) ctx.addIssue({ code: "custom", message: "ช่วงวันปิดต้องเริ่มก่อนหรือตรงวันสิ้นสุด" });
  if (v.kind === "PROMO_CODE" && v.validFrom !== undefined && v.validTo !== undefined && v.validFrom > v.validTo) ctx.addIssue({ code: "custom", message: "วันเริ่มใช้โค้ดต้องไม่หลังวันหมดอายุ" });
});
export type TripPriceRuleParams = z.infer<typeof tripPriceRuleParamsSchema>;

/** TripDeparture.stopSell — null = ขายปกติ · channels [] = ทุกช่องทาง */
export const tripDepartureStopSellSchema = z
  .strictObject({
    channels: z.array(CHANNEL),
    agentAccountIds: z.array(z.string().min(1)).optional(),
    reason: z.string().min(1).max(500),
    until: ISO_DATETIME.optional(),
  })
  .nullable();
export type TripDepartureStopSell = z.infer<typeof tripDepartureStopSellSchema>;

/** TripDeparture.insurance — null = ยังไม่มีกรมธรรม์ของรอบ */
export const tripDepartureInsuranceSchema = z
  .strictObject({
    insurer: z.string().min(1).max(200),
    policyNo: z.string().min(1).max(100),
    sumDeathSatang: SATANG,
    sumMedicalSatang: SATANG,
    coversDeepDive: z.boolean(),
    fileId: z.string().min(1).optional(),
  })
  .nullable();
export type TripDepartureInsurance = z.infer<typeof tripDepartureInsuranceSchema>;
