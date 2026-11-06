// svc-qc-hotel-rates-scene.mts — SVC H.1 · ฉากจอราคาโรงแรม (ภาพ 15) บนร้าน svcqc หน่วย bansuan-hotel
//
// ใช้ (ต้อง seed ร้าน svcqc ก่อน — scripts/seed-svc-qc.mts):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-rates-scene.mts            # สร้าง/ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-rates-scene.mts --clear    # ลบเฉพาะแถวของฉาก
//
// ฉาก (ค่าจาก SQC_HOTEL_RATES เท่านั้น · วันที่สัมพัทธ์วันนี้ไทย — ใบสั่ง h.1 §8):
//   • แผน STANDARD (default) / BREAKFAST / NONREF + ขั้นบันไดยกเลิก · description = mark (แผน code เดียวกันที่มีอยู่แล้ว เช่นแผนที่จอสร้างอัตโนมัติ ⇒ รับมาเป็นของฉาก)
//   • ฤดู "ไฮซีซัน" / "ปีใหม่" (ชื่อตามฟิกซ์เจอร์ · ปีของฤดูที่ยังไม่จบ ณ วันนี้) · วันหยุด 12-05 / 04-13 ของปีนี้และปีหน้า (ชื่อตามฟิกซ์เจอร์)
//   • matrix: STANDARD × 3 ประเภท × (ปกติ + 2 ฤดู) · BREAKFAST/NONREF แถวปกติ (+อาหารเช้า × baseOccupancy / −10% ปัดลงเป็นบาท)
//   • แก้มือ ดีลักซ์ ทุกแผน "วันที่ 14" ของเดือนนี้ (ถ้าวันนี้ > 14 ⇒ เดือนหน้า) · reason = เหตุผลตามฟิกซ์เจอร์ (ตัวระบุแถวฉาก · มติ #8)
//   • ไม่สร้างการจอง (เหลือขายใช้การจองที่มีจากฟิกซ์เจอร์) · ไม่เขียนค่าตั้ง (SettingValue) ชั้นใด ๆ
// --clear: แผนระบุจาก code + description = mark · แก้มือจาก reason ตามฟิกซ์เจอร์ · ฤดู/วันหยุดระบุจาก "ชื่อตามฟิกซ์เจอร์" — ⚠️ ฤดู/วันหยุดชื่อเดียวกันที่ร้านตั้งเองถูกลบด้วย (ใช้บนร้าน svcqc เท่านั้น)
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_HOTEL_RATES as FX } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-hotel-rates-scene";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างฉากจอราคาโรงแรมบนร้าน svcqc · --clear ลบเฉพาะแถวฉาก`);
  process.exit(0);
}
const unknownArgs = argv.filter((a) => a !== "--clear");
if (unknownArgs.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknownArgs.join(" ")} (ใช้ได้: --clear · --help)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);

const { prisma } = await import("@/lib/core/db");

const MARK = FX.mark;
const tenantId = SQC.tenant.id;
const unitId = SQC.units[FX.unit].id;
const ownerU = SQC.users.find((u) => u.key === "owner")!;
const sum = { created: 0, updated: 0, removed: 0 };

const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const Y = Number(today.slice(0, 4));
const md = today.slice(5);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const sceneDay = (() => {
  const d = Number(today.slice(8, 10));
  if (d <= 14) return `${today.slice(0, 7)}-14`;
  const m = Number(today.slice(5, 7));
  return m === 12 ? `${Y + 1}-01-14` : `${Y}-${String(m + 1).padStart(2, "0")}-14`;
})();
/** ช่วงฤดูที่ยังไม่จบ ณ วันนี้ (ฤดูข้ามปี + วันนี้อยู่ช่วงต้นปีก่อนวันจบ ⇒ เริ่มปีที่แล้ว) */
const seasonRange = (s: { start: string; end: string }) => {
  const cross = s.end < s.start;
  const y = cross && md <= s.end ? Y - 1 : Y;
  return { dateStart: `${y}-${s.start}`, dateEnd: cross ? `${y + 1}-${s.end}` : `${y}-${s.end}` };
};
type Cell = { weekday: number; weekend: number; holiday: number | null };
const floor90 = (x: number) => Math.floor((x * (10_000 - FX.nonrefDiscountBp)) / 10_000 / 100) * 100;
const adj = (c: Cell, bp: number): Cell => ({
  weekday: Math.round((c.weekday * (10_000 + bp)) / 10_000),
  weekend: Math.round((c.weekend * (10_000 + bp)) / 10_000),
  holiday: c.holiday === null ? null : Math.round((c.holiday * (10_000 + bp)) / 10_000),
});
const planCell = (planKey: string, c: Cell, occ: number): Cell => {
  const f = planKey === "breakfast" ? (x: number) => x + FX.breakfastPerPersonSatang * occ : planKey === "nonref" ? floor90 : (x: number) => x;
  return { weekday: f(c.weekday), weekend: f(c.weekend), holiday: c.holiday === null ? null : f(c.holiday) };
};

const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "HOTEL" }, select: { id: true } });
if (!unit) {
  console.error(`🔴 ${LABEL}: ไม่พบหน่วยโรงแรม svcqc (${unitId}) — รัน scripts/seed-svc-qc.mts ก่อน`);
  process.exit(3);
}
const W = { tenantId, unitId };
const codes = FX.plans.map((p) => p.code);
const seasonNames = FX.seasons.map((s) => s.name);
const holidayNames = [...new Set(FX.holidays.map((h) => h.name))];

if (clear) {
  const plans = await prisma.hotelRatePlan.findMany({ where: { ...W, code: { in: codes }, description: MARK }, select: { id: true } });
  const pids = plans.map((p) => p.id);
  sum.removed += (await prisma.hotelRateOverride.deleteMany({ where: { ...W, reason: FX.override.reason } })).count;
  if (pids.length) {
    sum.removed += (await prisma.hotelRate.deleteMany({ where: { ...W, ratePlanId: { in: pids } } })).count;
    sum.removed += (await prisma.hotelCancelRule.deleteMany({ where: { ...W, ratePlanId: { in: pids } } })).count;
    sum.removed += (await prisma.hotelRatePlan.deleteMany({ where: { ...W, id: { in: pids } } })).count;
  }
  const seasons = await prisma.hotelSeason.findMany({ where: { ...W, name: { in: seasonNames } }, select: { id: true } });
  if (seasons.length) {
    const sids = seasons.map((s) => s.id);
    sum.removed += (await prisma.hotelRate.deleteMany({ where: { ...W, seasonId: { in: sids } } })).count;
    sum.removed += (await prisma.hotelSeason.deleteMany({ where: { ...W, id: { in: sids } } })).count;
  }
  sum.removed += (await prisma.hotelHoliday.deleteMany({ where: { ...W, name: { in: holidayNames } } })).count;
  console.log(`${LABEL}: --clear ลบแถวฉาก ${sum.removed} แถว`);
  console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
  await prisma.$disconnect();
  process.exit(0);
}

// ── ประเภทห้อง ──
const types = await prisma.hotelRoomType.findMany({ where: { ...W, name: { in: Object.keys(FX.base) } }, select: { id: true, name: true, baseOccupancy: true } });
if (types.length !== Object.keys(FX.base).length) {
  console.error(`🔴 ${LABEL}: ประเภทห้อง svcqc ไม่ครบ (${types.map((t) => t.name).join(", ")}) — reseed ก่อน`);
  process.exit(3);
}
const typeId = Object.fromEntries(types.map((t) => [t.name, t.id])) as Record<string, string>;
const occOf = Object.fromEntries(types.map((t) => [t.name, t.baseOccupancy])) as Record<string, number>;

// ── แผน (แผนเริ่มต้นอื่นที่ไม่ใช่ของฉาก ⇒ ปลด default ก่อน · partial unique 1 แผนต่อหน่วย) ──
const defPlan = FX.plans.find((p) => p.isDefault)!;
const otherDefault = await prisma.hotelRatePlan.findMany({ where: { ...W, isDefault: true, NOT: { code: defPlan.code } }, select: { id: true } });
if (otherDefault.length) {
  await prisma.hotelRatePlan.updateMany({ where: { ...W, id: { in: otherDefault.map((p) => p.id) } }, data: { isDefault: false } });
  sum.updated += otherDefault.length;
}
const planId: Record<string, string> = {};
for (const p of FX.plans) {
  const want = {
    name: p.name,
    isDefault: p.isDefault,
    includeBreakfast: p.includeBreakfast,
    depositKind: p.depositKind,
    depositValue: p.depositValue,
    visibility: [...p.visibility],
    minNights: p.minNights,
    status: "ACTIVE",
    description: MARK,
  };
  const cur = await prisma.hotelRatePlan.findFirst({ where: { ...W, code: p.code } });
  if (!cur) {
    planId[p.key] = (await prisma.hotelRatePlan.create({ data: { ...W, code: p.code, ...want } })).id;
    sum.created++;
  } else {
    planId[p.key] = cur.id;
    const have = { name: cur.name, isDefault: cur.isDefault, includeBreakfast: cur.includeBreakfast, depositKind: cur.depositKind, depositValue: cur.depositValue, visibility: cur.visibility, minNights: cur.minNights, status: cur.status, description: cur.description };
    if (!isDeepStrictEqual(have, want)) {
      await prisma.hotelRatePlan.update({ where: { id: cur.id }, data: want });
      sum.updated++;
    }
  }
  const rules = await prisma.hotelCancelRule.findMany({ where: { ...W, ratePlanId: planId[p.key] }, orderBy: { daysBefore: "desc" }, select: { daysBefore: true, refundBp: true } });
  const wantRules = [...p.cancelRules].sort((a, b) => b.daysBefore - a.daysBefore).map((r) => ({ daysBefore: r.daysBefore, refundBp: r.refundBp }));
  if (!isDeepStrictEqual(rules, wantRules)) {
    sum.removed += (await prisma.hotelCancelRule.deleteMany({ where: { ...W, ratePlanId: planId[p.key] } })).count;
    await prisma.hotelCancelRule.createMany({ data: wantRules.map((r) => ({ ...W, ratePlanId: planId[p.key], ...r })) });
    sum.created += wantRules.length;
  }
}

// ── ฤดู ──
const seasonId: Record<string, string> = {};
for (const s of FX.seasons) {
  const r = seasonRange(s);
  const want = { dateStart: r.dateStart, dateEnd: r.dateEnd, priority: s.priority, minNights: s.minNights ?? null, status: "ACTIVE" };
  const cur = await prisma.hotelSeason.findFirst({ where: { ...W, name: s.name }, orderBy: [{ status: "asc" }, { createdAt: "asc" }] });
  if (!cur) {
    seasonId[s.key] = (await prisma.hotelSeason.create({ data: { ...W, name: s.name, ...want, dateStart: dbDate(want.dateStart), dateEnd: dbDate(want.dateEnd) } })).id;
    sum.created++;
  } else {
    seasonId[s.key] = cur.id;
    const have = { dateStart: ymdOf(cur.dateStart), dateEnd: ymdOf(cur.dateEnd), priority: cur.priority, minNights: cur.minNights, status: cur.status };
    if (!isDeepStrictEqual(have, want)) {
      await prisma.hotelSeason.update({ where: { id: cur.id }, data: { ...want, dateStart: dbDate(want.dateStart), dateEnd: dbDate(want.dateEnd) } });
      sum.updated++;
    }
  }
}

// ── วันหยุด (ปีนี้ + ปีหน้า · วันที่มีของคนอื่นอยู่แล้ว = ข้าม) ──
for (const y of [Y, Y + 1]) {
  for (const h of FX.holidays) {
    const date = dbDate(`${y}-${h.date}`);
    const cur = await prisma.hotelHoliday.findFirst({ where: { ...W, date } });
    if (!cur) {
      await prisma.hotelHoliday.create({ data: { ...W, date, name: h.name } });
      sum.created++;
    }
  }
}

// ── ตารางราคา ──
const combos: [string, string | null][] = [["standard", null], ["standard", "high"], ["standard", "newyear"], ["breakfast", null], ["nonref", null]];
for (const typeName of Object.keys(FX.base)) {
  const base = FX.base[typeName];
  for (const [pk, sk] of combos) {
    const s = sk ? FX.seasons.find((x) => x.key === sk)! : null;
    const fixed = s && "fixed" in s && s.fixed ? (s.fixed as Record<string, Cell>)[typeName] : undefined;
    const raw: Cell = s ? (fixed ?? adj(base, s.adjustBp ?? 0)) : base;
    const c = planCell(pk, raw, occOf[typeName] ?? 2);
    const where = { ...W, ratePlanId: planId[pk], roomTypeId: typeId[typeName], seasonId: sk ? seasonId[sk] : null };
    const cur = await prisma.hotelRate.findFirst({ where });
    const data = { priceWeekdaySatang: c.weekday, priceWeekendSatang: c.weekend, priceHolidaySatang: c.holiday };
    if (!cur) {
      await prisma.hotelRate.create({ data: { ...where, ...data } });
      sum.created++;
    } else if (cur.priceWeekdaySatang !== c.weekday || cur.priceWeekendSatang !== c.weekend || (cur.priceHolidaySatang ?? null) !== c.holiday) {
      await prisma.hotelRate.update({ where: { id: cur.id }, data });
      sum.updated++;
    }
  }
}

// ── แก้มือ (วันที่ 14 ของฉาก · แถวฉากวันอื่นที่ค้าง = ลบ) ──
const ovType = typeId[FX.override.roomType];
sum.removed += (await prisma.hotelRateOverride.deleteMany({ where: { ...W, reason: FX.override.reason, NOT: { roomTypeId: ovType, ratePlanId: null, date: dbDate(sceneDay) } } })).count;
const ov = await prisma.hotelRateOverride.findFirst({ where: { ...W, roomTypeId: ovType, ratePlanId: null, date: dbDate(sceneDay) } });
const ovData = { priceSatang: FX.override.priceSatang, reason: FX.override.reason, setById: ownerU.userId };
if (!ov) {
  await prisma.hotelRateOverride.create({ data: { ...W, roomTypeId: ovType, ratePlanId: null, date: dbDate(sceneDay), ...ovData } });
  sum.created++;
} else if (ov.priceSatang !== ovData.priceSatang || ov.reason !== ovData.reason || ov.setById !== ovData.setById) {
  await prisma.hotelRateOverride.update({ where: { id: ov.id }, data: ovData });
  sum.updated++;
}

console.log(`${LABEL}: ฉากพร้อม (วันแก้มือ ${sceneDay} · แผน ${codes.join("/")})`);
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
await prisma.$disconnect();
process.exit(0);
