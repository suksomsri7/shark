// QC — SVC H.1 · ราคาโรงแรม (แผนราคา · ฤดู · วันหยุด · แก้มือรายวัน) + นโยบาย (มัดจำ · ขั้นบันไดยกเลิก · ภาษี) + จอราคา (ภาพ 15) + จอตั้งค่าโรงแรม + แท็บโรงแรม
//      oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes → ผู้คุม ORACLE-EDIT)
// สัญญา: ledger/svc-briefs/svc-brief-h.1.md (§2 มติ 10 ข้อ · §3 pricing.ts pure + ตัวเลขฉาก · §4 rates.ts · §5 จอราคา · §6 จอตั้งค่า · §7 แท็บ · §8 ฉาก · §9 G/X · §10 โครงข้อสอบ)
//        ยืนบน H.0: ledger/svc-briefs/svc-brief-h.0.md §2.4–2.9 (ตาราง) §6 (คีย์) §7 (สิทธิ์) · ฟิกซ์เจอร์ scripts/svc-qc-data.mts บล็อก "SVC H.0 / H.1" (SQC_HOTEL_RATES · SQC_VISUAL_SPECS["h.1"] · frontdesk)
//        แบบ: ledger/design-dorm/15-hotel-rates.body.html (ข้อความ/โครงจอราคา) · หอ 17 (จอตั้งค่า) · DormTabs/dorm-home-shared (แท็บ)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน): ฟิกซ์เจอร์ H สอดคล้องกันเอง (oracle ของ oracle) · ฐาน QC ต่อได้ · หน่วย hotel + frontdesk มี hotel.rates.read · คีย์ค่าตั้งเดิมที่ H.1 พึ่ง · ภาพ --list
//   P  pricing.ts pure (ไม่ต่อฐาน · ฉีด today · ctx จาก SQC_HOTEL_RATES ในหน่วยความจำ): resolution 4 กรณี S:1133 · override · fallback · null · dow ไม่ใช้ getDay (สลับ TZ) · ฤดูรวมวันจบ
//      quoteStay ขอบ (MIN/MAX/CTA/TOO_FAR/NO_RATE · minNights ฤดู · เตียงเสริม) · depositFor 5 kind + กลุ่ม FIRST_NIGHT · refundFor 3 tier + ขอบ · taxLines 2 โหมด + ปัดทุกขั้น + 1,234.50 · fuzz 300 เทียบตัวอ้างอิง
//      มติผู้คุม §11 (7 พ.ย.): ctx.roomTypes · ctx.fallback ต่อ roomTypeId · HotelSeason.minNights · data-scroll-hint ตายตัว
//   R  rates.ts server (ร้านชั่วคราว `svc-h1-*`): CRUD แผน/ฤดู/วันหยุด/matrix/override · default auto · DEFAULT_PLAN · archive ไม่ลบ · tx ล้มทั้งชุด · NULLS NOT DISTINCT · ≤ 8 คิวรี · ratePreview · AuditLog
//   B  ด่าน/ข้ามร้าน/สิทธิ์ (X1 · X9 · X10) · S ค่าตั้ง (loadHotelSettings/saveHotelSettings · RATE_PLAN · reset · ownerOnly · history · taxSnapshot เดิม)
//   U  UI สถิต (ไทยทั้งหมด · แท็บ · read-only · ตัวบอกเลื่อน · ป้ายภาษี · 'use client' ไม่ลาก prisma · "use server" ไม่ export type · UNIT_NAV) · F ไฟล์ที่แตะ (git)
//   Q  ฉาก svcqc (svc-qc-hotel-rates-scene) · V ภาพ (QC_BASE) · Z ล้าง · G regression (--no-regression = SKIP)
//
// 🔴 ผลที่ถูกต้องก่อนมีงาน: PC เขียว · P/R/B/S/U แดงเหตุผล "ยังไม่มี…" (ไฟล์/ตาราง H.0) · Q/V/G SKIP · ร้านชั่วคราว `svc-h1-*` ลบใน finally (+ กวาดค้างตอนเริ่ม)
// 🔴 นับคิวรี: ข้อสอบตั้ง globalThis.prisma = PrismaClient ที่ดัก $on("query") ก่อนโหลด @/lib/core/db (db.ts ใช้ singleton จาก globalThis) — โมดูลทุกตัวจึงวิ่งผ่านตัวดักเดียวกัน
// รัน: cd /root/projects/shark-svc-l1 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.1.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill · ห้าม export CI · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_HOTEL_TYPES, SQC_HOTEL_RATES, SQC_VISUAL_SPECS } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-h.1";
const SUITE = "qc-svc-h.1";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_H1_NO_REGRESSION === "1";
const SLUG = "svc-h1-";
const MAIL = "svc-h1-";
const F = {
  pricing: "src/lib/modules/hotel/pricing.ts",
  rates: "src/lib/modules/hotel/rates.ts",
  hsettings: "src/lib/modules/hotel/hotel-settings.ts",
  index: "src/lib/modules/hotel/index.ts",
  actions: "src/lib/modules/hotel/actions.ts",
  ratesScreen: "src/components/hotel/RatesScreen.tsx",
  ratesShared: "src/components/hotel/rates-shared.ts",
  hsComp: "src/components/hotel/HotelSettings.tsx",
  hsShared: "src/components/hotel/hotel-settings-shared.ts",
  tabs: "src/components/hotel/HotelTabs.tsx",
  tabsShared: "src/components/hotel/hotel-tabs-shared.ts",
  layout: "src/app/app/u/[unitSlug]/hotel/layout.tsx",
  ratesPage: "src/app/app/u/[unitSlug]/hotel/rates/page.tsx",
  settingsPage: "src/app/app/u/[unitSlug]/hotel/settings/page.tsx",
  unitHome: "src/app/app/u/[unitSlug]/page.tsx",
  scene: "scripts/svc-qc-hotel-rates-scene.mts",
  sds: "docs/sds/modules/hotel.md",
  defs: "src/lib/core/settings/defs/rooms.ts",
} as const;

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);

// ═══════════════ ตัวช่วย harness ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 300) ?? String(v); } catch { return String(v); } };
const J = (v: unknown): string => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`, sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const has = (rel: string) => existsSync(join(ROOT, rel));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (has(rel) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f;
};
const valOf = (load: { mod: Any; err: string }, name: string, rel: string): Any => {
  const v = load.mod?.[name];
  if (v === undefined) throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return v;
};
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? r?.error ?? J(r)?.slice(0, 80));
const failCode = (r: Any): string | null => (r && r.ok === false ? String(r.code ?? r.error ?? "") : null);
const DENIED = new Set(["FORBIDDEN", "NO_PERMISSION", "PERMISSION", "PERMISSION_DENIED"]);
const isDenied = (r: Any) => { const c = failCode(r); return c !== null && DENIED.has(c); };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${codeOf(r)} ${r?.reason ?? ""}`.trim()); return r; };
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const ymdOfDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOfDay(dayNo(ymd) + n);
/** วันในสัปดาห์จากสตริง (0=อาทิตย์) · pure · ไม่ใช้ getDay (1970-01-01 = พฤหัส = 4) */
const dowOf = (ymd: string) => (((dayNo(ymd) + 4) % 7) + 7) % 7;
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOfDb = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Rounding = "SATANG" | "BAHT_HALF_UP" | "BAHT_DOWN";
/** ปัดตาม rooms.money.rounding (จำนวนไม่ลบ) */
const roundBy = (x: number, mode: Rounding): number => {
  if (mode === "BAHT_DOWN") return Math.floor(x / 100) * 100;
  if (mode === "BAHT_HALF_UP") return Math.floor(x / 100 + 0.5) * 100;
  return Math.floor(x + 0.5);
};
const floor90 = (s: number) => Math.floor((s * (10_000 - SQC_HOTEL_RATES.nonrefDiscountBp)) / 10_000 / 100) * 100;
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const groupOf = (id: string) => id.split("-")[0];

// ═══════════════ ฟิกซ์เจอร์ H → ctx ในหน่วยความจำ (ปี 2026 · today = 2 พ.ย. 2569 ตามภาพ 15) ═══════════════
const FX = SQC_HOTEL_RATES;
const TODAY = "2026-11-02"; // จ. 2 พ.ย. 2569 (ภาพ 15)
const TYPE_ID: Record<string, string> = { "ซูพีเรีย": SQC_HOTEL_TYPES.superior.id, "ดีลักซ์": SQC_HOTEL_TYPES.deluxe.id, "แฟมิลี": SQC_HOTEL_TYPES.family.id };
const T = { sup: TYPE_ID["ซูพีเรีย"], dlx: TYPE_ID["ดีลักซ์"], fam: TYPE_ID["แฟมิลี"], suite: "svcqc-rt-hotel-suite-nofx" };
const PLAN_ID: Record<string, string> = { standard: "svcqc-rp-standard", breakfast: "svcqc-rp-breakfast", nonref: "svcqc-rp-nonref" };
const SEASON_ID: Record<string, string> = { high: "svcqc-ss-high", newyear: "svcqc-ss-newyear" };
type Cell = { weekday: number; weekend: number; holiday: number | null };
const BF = FX.breakfastPerPersonSatang * 2; // baseOccupancy 2 (H.0 §2.2 ค่าเริ่ม)
/** แปลงช่องราคามาตรฐานเป็นของแผน: BREAKFAST = +20,000×2 · NONREF = −10% ปัดลงเป็นบาท (ฟิกซ์เจอร์) */
const planCell = (planKey: string, c: Cell): Cell => {
  const f = planKey === "breakfast" ? (x: number) => x + BF : planKey === "nonref" ? floor90 : (x: number) => x;
  return { weekday: f(c.weekday), weekend: f(c.weekend), holiday: c.holiday === null ? null : f(c.holiday) };
};
const adj = (c: Cell, bp: number): Cell => ({ weekday: Math.round((c.weekday * (10_000 + bp)) / 10_000), weekend: Math.round((c.weekend * (10_000 + bp)) / 10_000), holiday: c.holiday === null ? null : Math.round((c.holiday * (10_000 + bp)) / 10_000) });
/** ช่องราคาของ (แผน, ประเภท, ฤดู|null) ตามฟิกซ์เจอร์ */
const cellOf = (planKey: string, typeName: string, seasonKey: string | null): Cell | null => {
  const base = FX.base[typeName];
  if (!base) return null;
  if (seasonKey === null) return planCell(planKey, base);
  const s = FX.seasons.find((x) => x.key === seasonKey)!;
  if (s.fixed) return s.fixed[typeName] ? planCell(planKey, s.fixed[typeName]) : null;
  return planCell(planKey, adj(base, s.adjustBp ?? 0));
};
const seasonRange = (s: { start: string; end: string }, y = 2026) => { const dateStart = `${y}-${s.start}`; const dateEnd = s.end < s.start ? `${y + 1}-${s.end}` : `${y}-${s.end}`; return { dateStart, dateEnd }; };
type RoomTypeInfo = { baseOccupancy: number; maxOccupancy: number | null; extraBedAllowed: boolean; extraBedPriceSatang: number };
type Fallback = { baseRateSatang: number | null; dayOfWeekAdjustBp: number[] };
type Ctx = { weekendDays: number[]; rounding: Rounding; today: string; roomTypes: Record<string, RoomTypeInfo>; plans: Any[]; seasons: Any[]; holidays: Set<string>; rates: Any[]; overrides: Any[]; fallback: Record<string, Fallback> };
const NO_FALLBACK = (): Record<string, Fallback> => Object.fromEntries([T.sup, T.dlx, T.fam, T.suite].map((id) => [id, { baseRateSatang: null, dayOfWeekAdjustBp: [0, 0, 0, 0, 0, 0, 0] }]));
/** ประเภทห้อง (มติ #2): ดีลักซ์ เตียงเสริมได้ 30,000 · max 3 · ซูพีเรียไม่ให้เตียงเสริม · แฟมิลี base 4 max 5 */
const ROOM_TYPES = (): Record<string, RoomTypeInfo> => ({ [T.sup]: { baseOccupancy: 2, maxOccupancy: 2, extraBedAllowed: false, extraBedPriceSatang: 0 }, [T.dlx]: { baseOccupancy: 2, maxOccupancy: 3, extraBedAllowed: true, extraBedPriceSatang: 30_000 }, [T.fam]: { baseOccupancy: 4, maxOccupancy: 5, extraBedAllowed: true, extraBedPriceSatang: 30_000 }, [T.suite]: { baseOccupancy: 2, maxOccupancy: null, extraBedAllowed: true, extraBedPriceSatang: 50_000 } });
const mkCtx = (o: Partial<Ctx> = {}): Ctx => {
  const plans = FX.plans.map((p) => ({ id: PLAN_ID[p.key], code: p.code, name: p.name, isDefault: p.isDefault, includeBreakfast: p.includeBreakfast, minNights: p.minNights, maxNights: null, depositKind: p.depositKind, depositValue: p.depositValue, status: "ACTIVE", visibility: [...p.visibility] }));
  const seasons = FX.seasons.map((s) => ({ id: SEASON_ID[s.key], name: s.name, ...seasonRange(s), priority: s.priority, minNights: s.minNights ?? null, status: "ACTIVE" }));
  const rates: Any[] = [];
  for (const p of FX.plans) for (const typeName of Object.keys(FX.base)) for (const sk of [null, ...FX.seasons.map((s) => s.key)]) {
    const c = cellOf(p.key, typeName, sk);
    if (c) rates.push({ ratePlanId: PLAN_ID[p.key], roomTypeId: TYPE_ID[typeName], seasonId: sk ? SEASON_ID[sk] : null, priceWeekdaySatang: c.weekday, priceWeekendSatang: c.weekend, priceHolidaySatang: c.holiday });
  }
  const holidays = new Set<string>(["2026-12-05", "2026-04-13", "2027-04-13"]);
  const overrides = [{ roomTypeId: T.dlx, ratePlanId: null, date: "2026-11-14", priceSatang: FX.override.priceSatang, reason: FX.override.reason, setById: "svcqc-user-owner" }];
  return { weekendDays: [...FX.weekendDays], rounding: "SATANG", today: TODAY, roomTypes: ROOM_TYPES(), plans, seasons, holidays, rates, overrides, fallback: NO_FALLBACK(), ...o };
};
/** ตัวอ้างอิง (oracle ของ oracle): คิดราคา 1 คืนตามใบสั่ง §2 ข้อ 1–2 จาก ctx */
const refNight = (ctx: Ctx, roomTypeId: string, ratePlanId: string, date: string): { priceSatang: number; source: string; seasonId: string | null; bucket: string | null } | null => {
  const ov = ctx.overrides.find((o) => o.roomTypeId === roomTypeId && o.ratePlanId === ratePlanId && o.date === date) ?? ctx.overrides.find((o) => o.roomTypeId === roomTypeId && o.ratePlanId === null && o.date === date);
  if (ov) return { priceSatang: ov.priceSatang, source: "OVERRIDE", seasonId: null, bucket: null };
  const inS = ctx.seasons.filter((s) => s.status === "ACTIVE" && s.dateStart <= date && date <= s.dateEnd).sort((a, b) => b.priority - a.priority || (b.dateStart < a.dateStart ? -1 : b.dateStart > a.dateStart ? 1 : 0));
  const season = inS[0] ?? null;
  const row = (season ? ctx.rates.find((r) => r.ratePlanId === ratePlanId && r.roomTypeId === roomTypeId && r.seasonId === season.id) : undefined) ?? ctx.rates.find((r) => r.ratePlanId === ratePlanId && r.roomTypeId === roomTypeId && r.seasonId === null);
  if (row) {
    const dow = dowOf(date);
    if (ctx.holidays.has(date) && row.priceHolidaySatang !== null) return { priceSatang: row.priceHolidaySatang, source: "RATE", seasonId: season?.id ?? null, bucket: "holiday" };
    if (ctx.weekendDays.includes(dow)) return { priceSatang: row.priceWeekendSatang, source: "RATE", seasonId: season?.id ?? null, bucket: "weekend" };
    return { priceSatang: row.priceWeekdaySatang, source: "RATE", seasonId: season?.id ?? null, bucket: "weekday" };
  }
  const fb = ctx.fallback[roomTypeId];
  if (!fb || fb.baseRateSatang === null) return null;
  const bp = fb.dayOfWeekAdjustBp[dowOf(date)] ?? 0;
  return { priceSatang: roundBy((fb.baseRateSatang * (10_000 + bp)) / 10_000, ctx.rounding), source: "FALLBACK", seasonId: null, bucket: null };
};
const nightsOf = (checkIn: string, checkOut: string) => { const out: string[] = []; for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d); return out; };
const LIMITS = { minNights: null as number | null, maxNights: null as number | null, closedToArrival: false, maxAdvanceBookingDays: 365 };
const Q2_RULES = [{ daysBefore: 7, refundBp: 10_000 }, { daysBefore: 3, refundBp: 5_000 }, { daysBefore: 0, refundBp: 0 }];

// ═══════════════ โหลดโมดูล (หลัง env) — ตัวดักคิวรีก่อน db ═══════════════
const SQL_LOG: string[] = [];
let spyInstalled = false;
{
  const pc = await tryImport("@prisma/client");
  const ad = await tryImport("@prisma/adapter-pg");
  if (pc.mod?.PrismaClient && ad.mod?.PrismaPg && !(globalThis as Any).prisma) {
    try {
      const spy = new pc.mod.PrismaClient({ adapter: new ad.mod.PrismaPg({ connectionString: process.env.DATABASE_URL }), transactionOptions: { timeout: 30_000, maxWait: 10_000 }, log: [{ emit: "event", level: "query" }] });
      spy.$on("query", (e: Any) => SQL_LOG.push(String(e?.query ?? "")));
      (globalThis as Any).prisma = spy;
      spyInstalled = true;
    } catch (e) { console.log(`  ⚠️ ติดตั้งตัวดักคิวรีไม่ได้: ${errMsg(e)}`); }
  }
}
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
if (spyInstalled && prisma !== (globalThis as Any).prisma) spyInstalled = false;
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const RBAC = (await tryImport("@/lib/core/rbac")).mod as Any;
const pricingL = await loadIf(F.pricing);
const ratesL = await loadIf(F.rates);
const hsL = await loadIf(F.hsettings);
const hotelL = await loadIf(F.index);
const tabsSharedL = await loadIf(F.tabsShared);
const ratesSharedL = await loadIf(F.ratesShared);
const hsSharedL = await loadIf(F.hsShared);
const PR = {
  season: () => fnOf(pricingL, "resolveSeason", F.pricing),
  night: () => fnOf(pricingL, "resolveNightPrice", F.pricing),
  quote: () => fnOf(pricingL, "quoteStay", F.pricing),
  deposit: () => fnOf(pricingL, "depositFor", F.pricing),
  refund: () => fnOf(pricingL, "refundFor", F.pricing),
  tax: () => fnOf(pricingL, "taxLines", F.pricing),
};
const RT = (name: string) => fnOf(ratesL, name, F.rates);
const HS = (name: string) => fnOf(hsL, name, F.hsettings);
const sqlCount = (from: number) => SQL_LOG.slice(from).filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET |SAVEPOINT|RELEASE)/i.test(q)).length;

// ═══════════════ ฐานข้อมูล: ตาราง H.0 · ล้าง ═══════════════
const H0_TABLES = ["HotelRatePlan", "HotelSeason", "HotelHoliday", "HotelRate", "HotelRateOverride", "HotelCancelRule", "HotelBookingNight"];
let H0_OK = false;
let H0_WHY = "";
try {
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, H0_TABLES);
  const have = new Set(rows.map((r) => r.t));
  const miss = H0_TABLES.filter((t) => !have.has(t));
  const col: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HotelReservation' AND column_name IN ('taxSnapshot','policySnapshot','ratePlanId')`);
  const colOk = Number(col[0]?.n ?? 0) === 3;
  H0_OK = miss.length === 0 && colOk && typeof prisma.hotelRatePlan?.findMany === "function";
  H0_WHY = miss.length ? `ยังไม่มีตาราง H.0 บนฐาน l1: ${miss.join(", ")} (migration svc_h ยังไม่ลง)` : !colOk ? "HotelReservation ยังไม่มีคอลัมน์ H.0 (taxSnapshot/policySnapshot/ratePlanId)" : typeof prisma.hotelRatePlan?.findMany !== "function" ? "Prisma client ของเลนนี้ยังไม่มี model HotelRatePlan (ยังไม่ generate หลัง H.0)" : "";
} catch (e) { H0_WHY = `อ่าน information_schema ไม่ได้: ${errMsg(e)}`; }
const needH0 = () => ok(H0_OK, H0_WHY);
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: MAIL } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string; membershipId?: string };

// ═══════════════ ตัวช่วยสถิต (UI) ═══════════════
const EN_ALLOW = /^(VAT|SC|OTA|LINE|PDPA|POS|ID|QR|AI|SHARK|HR|STANDARD|BREAKFAST|NONREF|WEB|COUNTER|TM|RR|px|rem|em|svg|a|x)$/;
/** ข้อความที่ผู้ใช้เห็นใน JSX (ระหว่าง > กับ <) + ค่า placeholder/title/aria-label — คืนรายการคำอังกฤษ (นอกรายการยกเว้น) */
const englishInJsx = (src: string): string[] => {
  const s = stripComments(src);
  const texts: string[] = [];
  for (const m of s.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) texts.push(m[1]);
  for (const m of s.matchAll(/(?:placeholder|title|aria-label|alt)=["']([^"']*)["']/g)) texts.push(m[1]);
  const bad: string[] = [];
  for (const t of texts) for (const w of t.match(/[A-Za-z][A-Za-z.'-]{1,}/g) ?? []) if (!EN_ALLOW.test(w) && !/^[A-Z]{2,5}$/.test(w)) bad.push(w);
  return [...new Set(bad)];
};
const importSpecs = (src: string): { spec: string; typeOnly: boolean }[] => {
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const m of stripComments(src).matchAll(/import\s+(type\s+)?[^'";]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|export\s+(type\s+)?[^'";]*?from\s*["']([^"']+)["']/g)) {
    const spec = m[2] ?? m[3] ?? m[5];
    if (spec) out.push({ spec, typeOnly: !!(m[1] || m[4]) });
  }
  return out;
};
const resolveSpec = (fromRel: string, spec: string): string | null => {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolvePath(join(ROOT, dirname(fromRel)), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && !c.endsWith("/")) { try { if (readFileSync(c, "utf8") !== undefined) return c.slice(ROOT.length + 1); } catch { /* โฟลเดอร์ */ } }
  return null;
};
/** เดินกราฟ import (ค่า ไม่ใช่ type) จากไฟล์ client จนถึงขอบ "use server" — คืนเส้นที่ลากถึง prisma/db/โมดูล server */
const clientReach = (startRel: string): string[] => {
  const seen = new Set<string>();
  const bad: string[] = [];
  const walk = (rel: string, path: string[]) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = read(rel);
    if (!src) return;
    if (rel !== startRel && /^\s*["']use server["']/m.test(src)) return;
    for (const { spec, typeOnly } of importSpecs(src)) {
      if (typeOnly) continue;
      if (spec === "@prisma/client" || spec === "server-only" || spec === "@/lib/core/db" || /^@prisma\//.test(spec)) { bad.push([...path, rel, spec].join(" → ")); continue; }
      const r = resolveSpec(rel, spec);
      if (!r) continue;
      if (/^src\/lib\/modules\/hotel\/(rates|hotel-settings|service)\.ts$/.test(r) || r === "src/lib/core/db.ts") { bad.push([...path, rel, r].join(" → ")); continue; }
      walk(r, [...path, rel]);
    }
  };
  walk(startRel, []);
  return bad;
};
const nearWrite = (src: string, literal: string, guard: RegExp) => { const i = src.indexOf(literal); if (i < 0) return false; return guard.test(src.slice(Math.max(0, i - 600), i)); };

console.log(`\n(ฐาน ${process.env.SVC_QC_HOST ?? "?"} · ตัวดักคิวรี ${spyInstalled ? "ติดตั้งแล้ว" : "ไม่ได้ติดตั้ง"} · ตาราง H.0 ${H0_OK ? "มี" : `ยังไม่มี (${H0_WHY})`})`);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฟิกซ์เจอร์ H: 3 แผน (default = STANDARD 1 แผน · BREAKFAST includeBreakfast · NONREF FULL) · 2 ฤดู (ไฮซีซัน p10 +20% · ปีใหม่ p20 ราคาเฉพาะ 3 ประเภท) · 2 วันหยุด (12-05 · 04-13) · override ดีลักซ์ วันที่ 14 = 169,000 · base 3 ประเภทตรงชื่อ/ราคา SQC_HOTEL_TYPES · weekendDays [5,6]", () => {
    eq(FX.plans.map((p) => p.code), ["STANDARD", "BREAKFAST", "NONREF"], "แผน");
    eq(FX.plans.filter((p) => p.isDefault).map((p) => p.code), ["STANDARD"], "default");
    ok(FX.plans[1].includeBreakfast && !FX.plans[0].includeBreakfast && FX.plans[2].depositKind === "FULL", "ลักษณะแผน");
    eq(FX.seasons.map((s) => [s.key, s.priority, s.adjustBp]), [["high", 10, 2000], ["newyear", 20, null]], "ฤดู");
    ok(FX.seasons[1].fixed && Object.keys(FX.seasons[1].fixed).length === 3, "ปีใหม่ ราคาเฉพาะ 3 ประเภท");
    eq(FX.holidays.map((h) => h.date), ["12-05", "04-13"], "วันหยุด");
    eq([FX.override.roomType, FX.override.dayOfMonth, FX.override.priceSatang], ["ดีลักซ์", 14, 169_000], "override");
    for (const [k, t] of Object.entries(SQC_HOTEL_TYPES)) { const c = FX.base[t.name]; ok(c && c.weekday === t.baseRateSatang, `base ${k}: ${J(c)} vs ${t.baseRateSatang}`); }
    eq([...FX.weekendDays], [5, 6], "weekendDays");
    eq(FX.mark, "SvcQcScene:h1", "mark");
  });
  await st("PC-2", "oracle ของ oracle: ตัวเลข expect ของฟิกซ์เจอร์คำนวณได้จาก base/adjustBp/fixed/override ด้วยสูตร §2 (ศ.+ส. มาตรฐาน · มัดจำคืนแรก · NONREF −10% ปัดลง · ไฮซีซัน ×1.2 · ปีใหม่ priority 20 · override · ซูพีเรียวันหยุด)", () => {
    const d = FX.base["ดีลักซ์"], s = FX.base["ซูพีเรีย"];
    const calc = {
      deluxeFriSatStandard: d.weekend * 2,
      deluxeFirstNightDeposit: d.weekend,
      deluxeFriSatNonref: floor90(d.weekend) * 2,
      deluxeHighWeekday: adj(d, 2000).weekday,
      deluxeNewYear: FX.seasons[1].fixed!["ดีลักซ์"].weekday,
      deluxeOverride: FX.override.priceSatang,
      superiorHoliday: s.holiday === null ? s.weekday : s.holiday, // holiday null ⇒ ตกไปช่องวัน (นอกฤดู)
    };
    eq(calc, { ...FX.expect }, "expect");
    // ตัวอ้างอิงในข้อสอบให้ตัวเลขเดียวกัน
    const ctx = mkCtx();
    eq(refNight(ctx, T.dlx, PLAN_ID.standard, "2026-11-06")!.priceSatang + refNight(ctx, T.dlx, PLAN_ID.standard, "2026-11-07")!.priceSatang, FX.expect.deluxeFriSatStandard, "ref ศ.+ส.");
    eq(refNight(ctx, T.dlx, PLAN_ID.nonref, "2026-11-06")!.priceSatang + refNight(ctx, T.dlx, PLAN_ID.nonref, "2026-11-07")!.priceSatang, FX.expect.deluxeFriSatNonref, "ref NONREF");
    eq(refNight(ctx, T.dlx, PLAN_ID.standard, "2026-12-02")!.priceSatang, FX.expect.deluxeHighWeekday, "ref ไฮซีซัน");
    eq(refNight(ctx, T.dlx, PLAN_ID.standard, "2026-12-31"), { priceSatang: FX.expect.deluxeNewYear, source: "RATE", seasonId: SEASON_ID.newyear, bucket: "weekday" }, "ref ปีใหม่");
    eq(refNight(ctx, T.dlx, PLAN_ID.standard, "2026-11-14")!.priceSatang, FX.expect.deluxeOverride, "ref override");
    eq(refNight(ctx, T.sup, PLAN_ID.standard, "2027-04-13")!.priceSatang, FX.expect.superiorHoliday, "ref ซูพีเรีย สงกรานต์");
    eq([dowOf("2026-11-02"), dowOf("2026-11-14"), dowOf("2026-12-05"), dowOf("2026-12-31"), dowOf("2027-04-13")], [1, 6, 6, 4, 2], "ปฏิทินข้อสอบ (จ. ส. ส. พฤ. อ.)");
  });
  await st("PC-3", "ฐาน QC ต่อได้ (SELECT 1 · host = เลน l1 ep-royal-lake) · ตัวดักคิวรีติดตั้งก่อน db (globalThis.prisma)", async () => {
    const r: { one: number }[] = await prisma.$queryRawUnsafe("SELECT 1::int AS one");
    eq(r[0]?.one, 1, "SELECT 1");
    ok(/^(ep-mute-scene|ep-royal-lake|ep-weathered-mode|ep-royal-bar)/.test(process.env.SVC_QC_HOST ?? ""), `host ${process.env.SVC_QC_HOST} ไม่ใช่ฐาน QC ของ SVC`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h1-PC3-anylane): regression ของ H.3+ รันบนเลนอื่น/ฐานหลัก
    ok(spyInstalled, "ตัวดักคิวรีไม่ได้ติดตั้ง (R-14 นับไม่ได้)");
  });
  await st("PC-4", "ฟิกซ์เจอร์: หน่วย hotel (bansuan-hotel · HOTEL) + ผู้ใช้ frontdesk มี hotel.rates.read ไม่มี rates.write/settings.edit · บนฐาน (ถ้า seed แล้ว) membership ตรงฟิกซ์เจอร์", async () => {
    eq([SQC_UNITS.hotel.type, SQC_UNITS.hotel.slug], ["HOTEL", "bansuan-hotel"], "หน่วย");
    const fd = SQC_USERS.find((u) => u.key === "frontdesk");
    ok(fd && fd.permissions["hotel.rates.read"] === true && !fd.permissions["hotel.rates.write"] && !fd.permissions["hotel.settings.edit"] && fd.unitAccess.includes(SQC_UNITS.hotel.id), `frontdesk ${J(fd)}`);
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    if (!t) throw new AssertFail("ร้าน svcqc ยังไม่ seed บนฐาน l1 — ผู้คุมรัน scripts/seed-svc-qc.mts ก่อน (Q/V ต้องใช้)");
    const mb = await prisma.membership.findUnique({ where: { id: fd!.membershipId }, select: { permissions: true, unitAccess: true } });
    ok(mb && (mb.permissions as Any)?.["hotel.rates.read"] === true, `membership frontdesk บนฐานยังไม่มี hotel.rates.read (reseed): ${J(mb)}`);
  }, "MAJOR");
  await st("PC-5", "คีย์ค่าตั้งเดิมที่ H.1 พึ่ง (ก่อน H.0): rooms.hotel.baseRate RT_RP null · dayOfWeekAdjustBp 7 ช่อง · defaultRatePlan STANDARD · minNights/closedToArrival RP · cancelPolicy/deposit · rooms.money.rounding enum 3 ค่า", () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k}`); return x; };
    eq([d("rooms.hotel.baseRate").defaults._fallback, [...d("rooms.hotel.baseRate").chain]], [null, ["ROOM_TYPE", "RATE_PLAN"]], "baseRate");
    eq(d("rooms.hotel.dayOfWeekAdjustBp").defaults._fallback, [0, 0, 0, 0, 0, 0, 0], "dayOfWeekAdjustBp");
    eq(d("rooms.hotel.defaultRatePlan").defaults._fallback, "STANDARD", "defaultRatePlan");
    eq([[...d("rooms.hotel.minNights").chain], [...d("rooms.hotel.closedToArrival").chain]], [["RATE_PLAN"], ["RATE_PLAN"]], "RP");
    ok(d("rooms.hotel.cancelPolicy") && d("rooms.hotel.deposit"), "cancelPolicy/deposit");
    const r = d("rooms.money.rounding");
    ok(["SATANG", "BAHT_HALF_UP", "BAHT_DOWN"].every((v) => r.schema.safeParse(v).success), "rounding enum");
    ok(SET?.SCOPE_KINDS?.includes("RATE_PLAN"), "SCOPE_KINDS ไม่มี RATE_PLAN");
  });
  await st("PC-6", "ภาพ: SQC_VISUAL_SPECS[\"h.1\"] = 4 ใบ (/hotel/rates · ?tab=plans · ?tab=seasons · /hotel/settings) · visual-svc h.1 --list พิมพ์ครบ (ไม่ต่อ server)", () => {
    const specs = SQC_VISUAL_SPECS["h.1"] ?? [];
    eq(specs.map((s) => s.name), ["hotel-rates-calendar", "hotel-rates-plans", "hotel-rates-seasons", "hotel-settings"], "ชื่อภาพ");
    ok(specs.every((s) => s.path.startsWith(`/app/u/${SQC_UNITS.hotel.slug}/hotel/`)), "path");
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.1", "--list"], { cwd: ROOT, env: { ...process.env, QC_BASE: "" }, encoding: "utf8" });
    ok(r.status === 0 && (r.stdout ?? "").includes("/hotel/rates") && (r.stdout ?? "").includes("/hotel/settings"), `--list exit ${r.status}`);
  }, "MAJOR");

  // ═══════════════ P pricing pure ═══════════════
  console.log("\n── P pricing.ts (pure) ──");
  await st("P-1", "pricing.ts มี 6 export: resolveSeason · resolveNightPrice · quoteStay · depositFor · refundFor · taxLines (ฟังก์ชันทั้งหมด)", () => {
    const names = ["resolveSeason", "resolveNightPrice", "quoteStay", "depositFor", "refundFor", "taxLines"];
    ok(pricingL.mod, pricingL.err);
    const miss = names.filter((n) => typeof pricingL.mod[n] !== "function");
    eq(miss, [], "ขาด");
  });
  const C0 = mkCtx();
  const night = (ctx: Ctx, roomTypeId: string, ratePlanId: string, date: string, extra: Any = {}) => PR.night()(ctx, { roomTypeId, ratePlanId, date, ...extra });
  const pick = (r: Any) => (r ? { priceSatang: r.priceSatang, source: r.source, seasonId: r.seasonId ?? null, bucket: r.bucket ?? null } : null);
  await st("P-2", "resolveSeason: นอกฤดู null · 1 ธ.ค. ไฮซีซัน · 28 ก.พ. ยังไฮซีซัน (รวมวันจบ) · 1 มี.ค. null · 29 ธ.ค.–2 ม.ค. ปีใหม่ (priority 20 ชนะ 10) · 3 ม.ค. ไฮซีซัน · ฤดู ARCHIVED ไม่นับ · priority เสมอ ⇒ dateStart ล่าสุด", () => {
    const f = PR.season();
    const id = (r: Any) => r?.id ?? null;
    eq([id(f(C0.seasons, "2026-11-02")), id(f(C0.seasons, "2026-12-01")), id(f(C0.seasons, "2027-02-28")), id(f(C0.seasons, "2027-03-01"))], [null, SEASON_ID.high, SEASON_ID.high, null], "ไฮซีซัน/ขอบ");
    eq([id(f(C0.seasons, "2026-12-29")), id(f(C0.seasons, "2027-01-02")), id(f(C0.seasons, "2027-01-03"))], [SEASON_ID.newyear, SEASON_ID.newyear, SEASON_ID.high], "ปีใหม่");
    const arch = C0.seasons.map((s) => (s.id === SEASON_ID.newyear ? { ...s, status: "ARCHIVED" } : s));
    eq(id(f(arch, "2026-12-31")), SEASON_ID.high, "ARCHIVED ไม่นับ");
    const tie = [{ id: "a", name: "ก", dateStart: "2026-11-01", dateEnd: "2026-11-30", priority: 5, status: "ACTIVE" }, { id: "b", name: "ข", dateStart: "2026-11-10", dateEnd: "2026-11-20", priority: 5, status: "ACTIVE" }];
    eq([id(f(tie, "2026-11-15")), id(f(tie, "2026-11-05"))], ["b", "a"], "เสมอ ⇒ dateStart ล่าสุด");
  });
  await st("P-3", "S:1133 กรณี 1 ปกติ: จ. 2 พ.ย. ดีลักซ์ มาตรฐาน = 129,000 · RATE · ไม่มีฤดู · weekday", () => eq(pick(night(C0, T.dlx, PLAN_ID.standard, "2026-11-02")), { priceSatang: 129_000, source: "RATE", seasonId: null, bucket: "weekday" }, "คืน"));
  await st("P-4", "S:1133 กรณี 2 เสาร์: ส. 7 พ.ย. ดีลักซ์ = 149,000 weekend · ศ. 6 พ.ย. = 149,000 (weekendDays [5,6]) · อา. 8 พ.ย. = 129,000 weekday · แฟมิลี ศ. = 219,000 · ซูพีเรียทุกวัน 99,000", () => {
    eq(pick(night(C0, T.dlx, PLAN_ID.standard, "2026-11-07")), { priceSatang: 149_000, source: "RATE", seasonId: null, bucket: "weekend" }, "เสาร์");
    eq(pick(night(C0, T.dlx, PLAN_ID.standard, "2026-11-06"))?.priceSatang, 149_000, "ศุกร์");
    eq(pick(night(C0, T.dlx, PLAN_ID.standard, "2026-11-08")), { priceSatang: 129_000, source: "RATE", seasonId: null, bucket: "weekday" }, "อาทิตย์");
    eq(pick(night(C0, T.fam, PLAN_ID.standard, "2026-11-06"))?.priceSatang, 219_000, "แฟมิลี ศ.");
    eq(["2026-11-02", "2026-11-06", "2026-11-07"].map((d) => night(C0, T.sup, PLAN_ID.standard, d)?.priceSatang), [99_000, 99_000, 99_000], "ซูพีเรีย");
  });
  await st("P-5", "S:1133 กรณี 3 วันหยุดในฤดู: ส. 5 ธ.ค. (ไฮซีซัน) ดีลักซ์ = 178,800 (149,000×1.2) · bucket holiday · seasonId ไฮซีซัน · ซูพีเรีย (holiday null) = 118,800 weekend", () => {
    eq(pick(night(C0, T.dlx, PLAN_ID.standard, "2026-12-05")), { priceSatang: 178_800, source: "RATE", seasonId: SEASON_ID.high, bucket: "holiday" }, "ดีลักซ์");
    eq(pick(night(C0, T.sup, PLAN_ID.standard, "2026-12-05")), { priceSatang: 118_800, source: "RATE", seasonId: SEASON_ID.high, bucket: "weekend" }, "ซูพีเรีย");
  });
  await st("P-6", "วันหยุดนอกฤดู: อ. 13 เม.ย. 2570 (สงกรานต์) ดีลักซ์ = 149,000 holiday (ราคาเสาร์ตามภาพ 15) · ซูพีเรีย = 99,000 = expect.superiorHoliday (holiday null ⇒ ตกช่องวัน weekday)", () => {
    eq(pick(night(C0, T.dlx, PLAN_ID.standard, "2027-04-13")), { priceSatang: 149_000, source: "RATE", seasonId: null, bucket: "holiday" }, "ดีลักซ์");
    eq(pick(night(C0, T.sup, PLAN_ID.standard, "2027-04-13")), { priceSatang: FX.expect.superiorHoliday, source: "RATE", seasonId: null, bucket: "weekday" }, "ซูพีเรีย");
  });
  await st("P-7", "S:1133 กรณี 4 ปีใหม่ทับไฮซีซัน: พฤ. 31 ธ.ค. ดีลักซ์ = 199,000 (priority 20 ชนะ) = expect.deluxeNewYear · ศ. 1 ม.ค. = 199,000 · 2 ม.ค. (วันจบ) = 199,000 · อา. 3 ม.ค. = 154,800 ไฮซีซัน · ซูพีเรีย/แฟมิลี ปีใหม่ 149,000/299,000", () => {
    eq(pick(night(C0, T.dlx, PLAN_ID.standard, "2026-12-31")), { priceSatang: FX.expect.deluxeNewYear, source: "RATE", seasonId: SEASON_ID.newyear, bucket: "weekday" }, "31 ธ.ค.");
    eq(night(C0, T.dlx, PLAN_ID.standard, "2027-01-01")?.priceSatang, 199_000, "1 ม.ค.");
    eq(night(C0, T.dlx, PLAN_ID.standard, "2027-01-02")?.priceSatang, 199_000, "2 ม.ค.");
    eq(pick(night(C0, T.dlx, PLAN_ID.standard, "2027-01-03")), { priceSatang: 154_800, source: "RATE", seasonId: SEASON_ID.high, bucket: "weekday" }, "3 ม.ค.");
    eq([night(C0, T.sup, PLAN_ID.standard, "2026-12-31")?.priceSatang, night(C0, T.fam, PLAN_ID.standard, "2026-12-31")?.priceSatang], [149_000, 299_000], "ประเภทอื่น");
  });
  await st("P-8", "ไฮซีซันธรรมดา: พ. 2 ธ.ค. ดีลักซ์ = 154,800 = expect.deluxeHighWeekday · ส. 5 ธ.ค. แฟมิลี = 262,800 · 28 ก.พ. 2570 (อา. · วันจบรวม) ดีลักซ์ = 154,800 · 1 มี.ค. = 129,000", () => {
    eq(night(C0, T.dlx, PLAN_ID.standard, "2026-12-02")?.priceSatang, FX.expect.deluxeHighWeekday, "2 ธ.ค.");
    eq(night(C0, T.fam, PLAN_ID.standard, "2026-12-05")?.priceSatang, 262_800, "แฟมิลี 5 ธ.ค.");
    eq(pick(night(C0, T.dlx, PLAN_ID.standard, "2027-02-28")), { priceSatang: 154_800, source: "RATE", seasonId: SEASON_ID.high, bucket: "weekday" }, "28 ก.พ.");
    eq(pick(night(C0, T.dlx, PLAN_ID.standard, "2027-03-01")), { priceSatang: 129_000, source: "RATE", seasonId: null, bucket: "weekday" }, "1 มี.ค.");
  });
  await st("P-9", "override ทุกแผน (ratePlanId null): ส. 14 พ.ย. ดีลักซ์ = 169,000 OVERRIDE ทั้ง STANDARD/BREAKFAST/NONREF = expect.deluxeOverride · ซูพีเรียวันเดียวกันไม่โดน (99,000) · 13 พ.ย. ไม่โดน", () => {
    for (const p of Object.values(PLAN_ID)) eq(pick(night(C0, T.dlx, p, "2026-11-14"))?.priceSatang, FX.expect.deluxeOverride, `แผน ${p}`);
    eq(night(C0, T.dlx, PLAN_ID.standard, "2026-11-14")?.source, "OVERRIDE", "source");
    eq([night(C0, T.sup, PLAN_ID.standard, "2026-11-14")?.priceSatang, night(C0, T.dlx, PLAN_ID.standard, "2026-11-13")?.priceSatang], [99_000, 149_000], "ไม่โดน");
  });
  await st("P-10", "override เฉพาะแผนชนะ override ทุกแผน: เพิ่ม (ดีลักซ์, BREAKFAST, 14 พ.ย., 100,000) ⇒ BREAKFAST 100,000 · STANDARD ยัง 169,000", () => {
    const c = mkCtx({ overrides: [...C0.overrides, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.breakfast, date: "2026-11-14", priceSatang: 100_000, reason: "โปรเฉพาะแผน" }] });
    eq([night(c, T.dlx, PLAN_ID.breakfast, "2026-11-14")?.priceSatang, night(c, T.dlx, PLAN_ID.standard, "2026-11-14")?.priceSatang], [100_000, 169_000], "ราคา");
  });
  await st("P-11", "override ทับฤดู: override ดีลักซ์ 31 ธ.ค. = 250,000 ⇒ OVERRIDE ชนะปีใหม่ · ลบ override ⇒ กลับ 199,000 (มติ 7)", () => {
    const c = mkCtx({ overrides: [{ roomTypeId: T.dlx, ratePlanId: null, date: "2026-12-31", priceSatang: 250_000, reason: "เคานต์ดาวน์" }] });
    eq(pick(night(c, T.dlx, PLAN_ID.standard, "2026-12-31"))?.priceSatang, 250_000, "override");
    eq(night(c, T.dlx, PLAN_ID.standard, "2026-12-31")?.source, "OVERRIDE", "source");
    eq(night(mkCtx({ overrides: [] }), T.dlx, PLAN_ID.standard, "2026-12-31")?.priceSatang, 199_000, "ลบแล้ว");
  });
  await st("P-12", "ไม่มีแถวฤดูของประเภทนั้น ⇒ ใช้แถว seasonId null (มติ 1 ข้อ 2): ตัดแถวปีใหม่ของแฟมิลี/STANDARD ⇒ 31 ธ.ค. แฟมิลี = 189,000 (พฤ. แถวปกติ) source RATE", () => {
    const c = mkCtx();
    c.rates = c.rates.filter((r) => !(r.roomTypeId === T.fam && r.ratePlanId === PLAN_ID.standard && r.seasonId === SEASON_ID.newyear));
    const r = night(c, T.fam, PLAN_ID.standard, "2026-12-31");
    eq([r?.priceSatang, r?.source], [189_000, "RATE"], "แฟมิลี");
  });
  await st("P-13", "fallback ต่อประเภท (มติ #3 · ctx.fallback[roomTypeId]): «สวีท» ไม่มีแถว HotelRate · baseRate 250,000 + dayOfWeekAdjustBp [0,0,0,0,0,1000,1000] ⇒ จ. 250,000 · ส. 275,000 · source FALLBACK · seasonId null · ประเภทอื่นที่ fallback null ไม่ติดไปด้วย", () => {
    const c = mkCtx({ fallback: { ...NO_FALLBACK(), [T.suite]: { baseRateSatang: 250_000, dayOfWeekAdjustBp: [0, 0, 0, 0, 0, 1000, 1000] } } });
    const mon = night(c, T.suite, PLAN_ID.standard, "2026-11-02"), sat = night(c, T.suite, PLAN_ID.standard, "2026-11-07");
    eq([mon?.priceSatang, mon?.source, mon?.seasonId ?? null], [250_000, "FALLBACK", null], "จันทร์");
    eq([sat?.priceSatang, sat?.source], [275_000, "FALLBACK"], "เสาร์");
    // ประเภทที่มีตารางยังใช้ตาราง ไม่ใช่ fallback
    eq(night(c, T.dlx, PLAN_ID.standard, "2026-11-02")?.source, "RATE", "ดีลักซ์ยัง RATE");
    const c2 = mkCtx({ fallback: { ...NO_FALLBACK(), [T.dlx]: { baseRateSatang: 250_000, dayOfWeekAdjustBp: [0, 0, 0, 0, 0, 0, 0] } } });
    eq(night(c2, T.suite, PLAN_ID.standard, "2026-11-02"), null, "fallback ของดีลักซ์ต้องไม่ใช้กับสวีท");
  });
  await st("P-14", "ไม่มีราคาเลย: ไม่มีแถว HotelRate และ baseRate null ⇒ null (ขายไม่ได้) · มี override วันนั้นก็ยังขายได้ (OVERRIDE)", () => {
    eq(night(C0, T.suite, PLAN_ID.standard, "2026-11-02"), null, "null");
    const c = mkCtx({ overrides: [{ roomTypeId: T.suite, ratePlanId: null, date: "2026-11-02", priceSatang: 300_000, reason: "ขายมือ" }] });
    eq(pick(night(c, T.suite, PLAN_ID.standard, "2026-11-02"))?.source, "OVERRIDE", "override บนประเภทไม่มีราคา");
  });
  await st("P-15", "weekendDays ตั้งได้ (ไม่ฝังค่า): weekendDays [0,6] ⇒ ศ. 6 พ.ย. ดีลักซ์ 129,000 weekday · อา. 8 พ.ย. 149,000 weekend · weekendDays [] ⇒ เสาร์ 129,000", () => {
    const c = mkCtx({ weekendDays: [0, 6] });
    eq([pick(night(c, T.dlx, PLAN_ID.standard, "2026-11-06"))?.bucket, night(c, T.dlx, PLAN_ID.standard, "2026-11-08")?.priceSatang], ["weekday", 149_000], "[0,6]");
    eq(night(mkCtx({ weekendDays: [] }), T.dlx, PLAN_ID.standard, "2026-11-07")?.priceSatang, 129_000, "[]");
  });
  await st("P-16", "dow ไม่ใช้ getDay เวลาเครื่อง (มติ 2): สลับ TZ=America/Los_Angeles (เที่ยงคืน UTC = วันก่อน) ⇒ อา. 15 พ.ย. ยัง weekday 129,000 · ส. 14 พ.ย. (ไม่มี override) ยัง weekend · จ. 16 พ.ย. weekday — มี positive control ว่ากับดักมีจริงใน TZ นั้น", () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const trap = new Date("2026-11-15").getDay(); // UTC เที่ยงคืน อา. = ส. ที่ LA ⇒ 6
      const c = mkCtx({ overrides: [] });
      const sun = night(c, T.dlx, PLAN_ID.standard, "2026-11-15"), sat = night(c, T.dlx, PLAN_ID.standard, "2026-11-14"), mon = night(c, T.dlx, PLAN_ID.standard, "2026-11-16");
      ok(trap === 6 || trap === 0, `positive control: getDay(2026-11-15) ที่ LA = ${trap}`);
      eq([sun?.priceSatang, sun?.bucket, sat?.priceSatang, sat?.bucket, mon?.priceSatang], [129_000, "weekday", 149_000, "weekend", 129_000], `TZ LA (trap getDay=${trap})`);
    } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
  });
  await st("P-17", "dow ไม่ใช้ getDay (ฝั่ง +): TZ=Pacific/Kiritimati (+14) ⇒ ศ. 13 พ.ย. weekend 149,000 · อา. 15 พ.ย. weekday · และ TZ=Asia/Bangkok ปกติ · ผลเท่ากันทุก TZ", () => {
    const prev = process.env.TZ;
    const run = () => { const c = mkCtx({ overrides: [] }); return ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"].map((d) => `${night(c, T.dlx, PLAN_ID.standard, d)?.priceSatang}:${night(c, T.dlx, PLAN_ID.standard, d)?.bucket}`); };
    try {
      process.env.TZ = "Pacific/Kiritimati"; const a = run();
      process.env.TZ = "Asia/Bangkok"; const b = run();
      process.env.TZ = "UTC"; const cc = run();
      eq(a, ["149000:weekend", "149000:weekend", "129000:weekday", "129000:weekday"], "+14");
      eq([b, cc], [a, a], "เท่ากันทุก TZ");
    } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
  });
  const quote = (ctx: Ctx, i: Any) => PR.quote()(ctx, { limits: LIMITS, ...i });
  await st("P-18", "quoteStay ศ.–อา. 6–8 พ.ย. ดีลักซ์ มาตรฐาน = 2 คืน 149,000+149,000 = 298,000 = expect.deluxeFriSatStandard · nights[] มี date/priceSatang/source ตามคืน", () => {
    const q = quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-06", checkOut: "2026-11-08" });
    ok(q?.ok === true, `quote ${codeOf(q)}`);
    eq(q.nightsTotal, FX.expect.deluxeFriSatStandard, "nightsTotal");
    eq((q.nights as Any[]).map((n) => [n.date, n.priceSatang, n.source]), [["2026-11-06", 149_000, "RATE"], ["2026-11-07", 149_000, "RATE"]], "nights");
  });
  await st("P-19", "quoteStay NONREF ศ.–อา. เดียวกัน = 268,200 = expect.deluxeFriSatNonref (134,100×2 · −10% ปัดลงเป็นบาท) · BREAKFAST จ.–พ. 2–4 พ.ย. = 338,000 (169,000×2)", () => {
    eq(okRes(quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.nonref, checkIn: "2026-11-06", checkOut: "2026-11-08" }), "NONREF").nightsTotal, FX.expect.deluxeFriSatNonref, "NONREF");
    eq(okRes(quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.breakfast, checkIn: "2026-11-02", checkOut: "2026-11-04" }), "BREAKFAST").nightsTotal, 338_000, "BREAKFAST");
  });
  await st("P-20", "quoteStay ข้ามขอบฤดู 30 พ.ย.–2 ธ.ค. ดีลักซ์ = 129,000 (จ. ปกติ) + 154,800 (อ. ไฮซีซัน) = 283,800 · คืน 13–15 พ.ย. = 149,000 + 169,000 (override) = 318,000 และ nights[1].source = OVERRIDE", () => {
    eq(okRes(quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-30", checkOut: "2026-12-02" }), "ขอบฤดู").nightsTotal, 283_800, "ขอบฤดู");
    const q = okRes(quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-13", checkOut: "2026-11-15" }), "override");
    eq([q.nightsTotal, q.nights[1]?.source], [318_000, "OVERRIDE"], "override ในช่วง");
  });
  await st("P-21", "quoteStay NO_RATE: ประเภทไม่มีราคา (ไม่มี fallback) ⇒ {ok:false, error:\"NO_RATE\", dates:[ทุกคืนที่ null]} · มีราคาบางคืน ⇒ dates เฉพาะคืนที่ไม่มี", () => {
    const q = quote(C0, { roomTypeId: T.suite, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-04" });
    eq([q?.ok, q?.error], [false, "NO_RATE"], "ผล");
    eq([...(q?.dates ?? [])].sort(), ["2026-11-02", "2026-11-03"], "dates");
    const c = mkCtx({ overrides: [{ roomTypeId: T.suite, ratePlanId: null, date: "2026-11-02", priceSatang: 300_000, reason: "ขายมือ" }] });
    eq([...(quote(c, { roomTypeId: T.suite, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-04" })?.dates ?? [])], ["2026-11-03"], "บางคืน");
  });
  await st("P-22", "MIN_NIGHTS: ค่าตั้ง minNights 2 ⇒ 1 คืนไม่ผ่าน · แผนกำหนด minNights 3 (แผน > ค่าตั้ง) ⇒ 2 คืนไม่ผ่าน · 3 คืนผ่าน · แผน minNights null ⇒ ใช้ค่าตั้ง", () => {
    const one = PR.quote()(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-03", limits: { ...LIMITS, minNights: 2 } });
    eq([one?.ok, one?.error], [false, "MIN_NIGHTS"], "ค่าตั้ง 2");
    const c = mkCtx(); c.plans = c.plans.map((p) => (p.id === PLAN_ID.standard ? { ...p, minNights: 3 } : p));
    const two = PR.quote()(c, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-04", limits: { ...LIMITS, minNights: 1 } });
    eq([two?.ok, two?.error], [false, "MIN_NIGHTS"], "แผน 3");
    ok(PR.quote()(c, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-05", limits: { ...LIMITS, minNights: 1 } })?.ok === true, "3 คืนผ่าน");
    ok(PR.quote()(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-04", limits: { ...LIMITS, minNights: 2 } })?.ok === true, "แผน null ใช้ค่าตั้ง 2 ⇒ 2 คืนผ่าน");
  });
  await st("P-23", "MAX_NIGHTS: แผน maxNights 2 ⇒ 3 คืนไม่ผ่าน · 2 คืนผ่าน · ค่าตั้ง maxNights 1 (แผน null) ⇒ 2 คืนไม่ผ่าน", () => {
    const c = mkCtx(); c.plans = c.plans.map((p) => (p.id === PLAN_ID.standard ? { ...p, maxNights: 2 } : p));
    const r = quote(c, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-05" });
    eq([r?.ok, r?.error], [false, "MAX_NIGHTS"], "แผน 2");
    ok(quote(c, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-04" })?.ok === true, "2 คืนผ่าน");
    const s = PR.quote()(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-04", limits: { ...LIMITS, maxNights: 1 } });
    eq([s?.ok, s?.error], [false, "MAX_NIGHTS"], "ค่าตั้ง 1");
  });
  await st("P-24", "CLOSED_TO_ARRIVAL: limits.closedToArrival true ⇒ ไม่ผ่าน · false ⇒ ผ่าน", () => {
    const r = PR.quote()(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-04", limits: { ...LIMITS, closedToArrival: true } });
    eq([r?.ok, r?.error], [false, "CLOSED_TO_ARRIVAL"], "CTA");
    ok(PR.quote()(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-02", checkOut: "2026-11-04", limits: { ...LIMITS, closedToArrival: false } })?.ok === true, "เปิด");
  });
  await st("P-25", "TOO_FAR: today 2 พ.ย. · maxAdvanceBookingDays 30 ⇒ เข้า 5 ธ.ค. ไม่ผ่าน · เข้า 2 ธ.ค. (30 วันพอดี) ผ่าน · ไม่ใช้วันที่เครื่อง (today ในสตริงเท่านั้น)", () => {
    const far = PR.quote()(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-12-05", checkOut: "2026-12-06", limits: { ...LIMITS, maxAdvanceBookingDays: 30 } });
    eq([far?.ok, far?.error], [false, "TOO_FAR"], "ไกล");
    ok(PR.quote()(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-12-02", checkOut: "2026-12-03", limits: { ...LIMITS, maxAdvanceBookingDays: 30 } })?.ok === true, "30 วันพอดี");
    const c = mkCtx({ today: "2026-12-01" });
    ok(PR.quote()(c, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-12-05", checkOut: "2026-12-06", limits: { ...LIMITS, maxAdvanceBookingDays: 30 } })?.ok === true, "today ขยับ ⇒ ผ่าน");
  });
  await st("P-26", "quoteStay ช่วงผิด: checkOut ≤ checkIn ⇒ ok:false (มี error ไม่ว่าง) · ไม่ throw", () => {
    for (const [i, o] of [["2026-11-03", "2026-11-03"], ["2026-11-04", "2026-11-03"]]) { const r = quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: i, checkOut: o }); ok(r?.ok === false && typeof r?.error === "string" && r.error, `${i}→${o}: ${J(r)}`); }
  }, "MAJOR");
  const quoteOk = (roomTypeId: string, ratePlanId: string, checkIn: string, checkOut: string, ctx: Ctx = C0) => okRes(quote(ctx, { roomTypeId, ratePlanId, checkIn, checkOut }), "quote");
  await st("P-27", "depositFor FIRST_NIGHT: ห้องเดียว ศ.–อา. ดีลักซ์ = 149,000 = expect.deluxeFirstNightDeposit · กลุ่ม 2 ห้อง (ดีลักซ์+แฟมิลี) = 149,000+219,000 = 368,000 (S:218 รวมทุกห้อง) · กลุ่มว่าง = 0", () => {
    const f = PR.deposit();
    const q1 = quoteOk(T.dlx, PLAN_ID.standard, "2026-11-06", "2026-11-08"), q2 = quoteOk(T.fam, PLAN_ID.standard, "2026-11-06", "2026-11-08");
    eq(f([q1], { kind: "FIRST_NIGHT" }, "SATANG"), FX.expect.deluxeFirstNightDeposit, "ห้องเดียว");
    eq(f([q1, q2], { kind: "FIRST_NIGHT" }, "SATANG"), 368_000, "กลุ่ม");
    eq(f([], { kind: "FIRST_NIGHT" }, "SATANG"), 0, "ว่าง");
  });
  await st("P-28", "depositFor PERCENT 3333 bp ของ 268,200 (NONREF ศ.–อา.) ปัดตาม rounding: SATANG 89,391 · BAHT_HALF_UP 89,400 · BAHT_DOWN 89,300 · 5000 bp ของ 298,000 = 149,000", () => {
    const f = PR.deposit();
    const q = quoteOk(T.dlx, PLAN_ID.nonref, "2026-11-06", "2026-11-08");
    eq([f([q], { kind: "PERCENT", percentBp: 3333 }, "SATANG"), f([q], { kind: "PERCENT", percentBp: 3333 }, "BAHT_HALF_UP"), f([q], { kind: "PERCENT", percentBp: 3333 }, "BAHT_DOWN")], [89_391, 89_400, 89_300], "3333 bp");
    eq(f([quoteOk(T.dlx, PLAN_ID.standard, "2026-11-06", "2026-11-08")], { kind: "PERCENT", percentBp: 5000 }, "SATANG"), 149_000, "50%");
  });
  await st("P-29", "depositFor FIXED_AMOUNT amountSatang 50,000 ⇒ 50,000 (ไม่ขึ้นกับยอด) · FULL ⇒ 298,000 (ยอดรวม) · กลุ่ม FULL = ผลรวมทุกห้อง · NONE ⇒ 0", () => {
    const f = PR.deposit();
    const q1 = quoteOk(T.dlx, PLAN_ID.standard, "2026-11-06", "2026-11-08"), q2 = quoteOk(T.fam, PLAN_ID.standard, "2026-11-06", "2026-11-08");
    eq(f([q1], { kind: "FIXED_AMOUNT", amountSatang: 50_000 }, "SATANG"), 50_000, "FIXED");
    eq(f([q1], { kind: "FULL" }, "SATANG"), 298_000, "FULL");
    eq(f([q1, q2], { kind: "FULL" }, "SATANG"), 298_000 + 438_000, "FULL กลุ่ม");
    eq(f([q1], { kind: "NONE" }, "SATANG"), 0, "NONE");
  });
  const refund = (paidSatang: number, checkInDate: string, cancelAt: string, rules: Any[] = Q2_RULES) => PR.refund()({ paidSatang, checkInDate, cancelAt, rules });
  await st("P-30", "refundFor ขั้นบันได Q2 [7:100% · 3:50% · 0:0%] จ่าย 149,000 เข้า 20 พ.ย.: ยกเลิก 10 พ.ย. (10 วัน) 149,000 · 13 พ.ย. (7 วันพอดี) 149,000 · 15 พ.ย. (5) 74,500 · 17 พ.ย. (3 พอดี) 74,500 · 18 พ.ย. (2) 0 · 20 พ.ย. (วันเดียวกัน=0) 0 · daysBefore ถูก · ruleUsed ถูก", () => {
    const cases: [string, number, number, number][] = [["2026-11-10", 10, 149_000, 7], ["2026-11-13", 7, 149_000, 7], ["2026-11-15", 5, 74_500, 3], ["2026-11-17", 3, 74_500, 3], ["2026-11-18", 2, 0, 0], ["2026-11-20", 0, 0, 0]];
    for (const [at, days, exp, rule] of cases) { const r = refund(149_000, "2026-11-20", at); eq([r?.refundSatang, r?.daysBefore, r?.ruleUsed?.daysBefore ?? null], [exp, days, rule], `ยกเลิก ${at}`); }
  });
  await st("P-31", "refundFor ขอบ: กฎว่าง ⇒ 0 ruleUsed null · ยกเลิกหลังวันเข้า (22 พ.ย.) ⇒ 0 · ไม่มีกฎเข้า (กฎเริ่ม 3 วัน · ยกเลิก 1 วัน) ⇒ 0 · ปัดลง 100,001×50% = 50,000 · กฎสลับลำดับผลเท่าเดิม · NONREF [{0,0}] 30 วันก่อน = 0", () => {
    eq([refund(149_000, "2026-11-20", "2026-11-10", [])?.refundSatang, refund(149_000, "2026-11-20", "2026-11-10", [])?.ruleUsed ?? null], [0, null], "กฎว่าง");
    const after = refund(149_000, "2026-11-20", "2026-11-22");
    eq([after?.refundSatang, after?.ruleUsed ?? null], [0, null], "หลังวันเข้า");
    eq(refund(149_000, "2026-11-20", "2026-11-19", [{ daysBefore: 3, refundBp: 10_000 }])?.refundSatang, 0, "ไม่มีกฎเข้า");
    eq(refund(100_001, "2026-11-20", "2026-11-15")?.refundSatang, 50_000, "ปัดลง");
    eq(refund(149_000, "2026-11-20", "2026-11-15", [Q2_RULES[2], Q2_RULES[0], Q2_RULES[1]])?.refundSatang, 74_500, "สลับลำดับ");
    eq(refund(268_200, "2026-11-20", "2026-10-21", [{ daysBefore: 0, refundBp: 0 }])?.refundSatang, 0, "NONREF");
  });
  const tax = (sub: number, t: Any, rounding: Rounding = "SATANG") => PR.tax()(sub, t, rounding);
  await st("P-32", "taxLines INCLUSIVE 298,000 vat 700: lines ว่าง (ไม่บวก) · total 298,000 · vatIncludedSatang = round(298,000×700/10,700) = 19,495 · SC ไม่เกี่ยวในโหมดรวม", () => {
    const r = tax(298_000, { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 1000 });
    eq([r?.lines?.length ?? -1, r?.totalSatang, r?.vatIncludedSatang], [0, 298_000, 19_495], "INCLUSIVE");
  });
  await st("P-33", "taxLines EXCLUSIVE sc 1000 vat 700 บน 298,000: SERVICE_CHARGE 29,800 → TAX 7% ของ (298,000+29,800) = 22,946 → total 350,746 · ลำดับ SC ก่อน VAT · vatIncludedSatang 0", () => {
    const r = tax(298_000, { mode: "EXCLUSIVE", vatBp: 700, serviceChargeBp: 1000 });
    eq((r?.lines ?? []).map((l: Any) => [l.type, l.amountSatang]), [["SERVICE_CHARGE", 29_800], ["TAX", 22_946]], "lines");
    eq([r?.totalSatang, r?.vatIncludedSatang ?? 0], [350_746, 0], "total");
  });
  await st("P-34", "ปัดทุกขั้นตาม rounding (1,234.50 = 123,450 สตางค์ · EXCLUSIVE sc 10% vat 7%): SATANG 12,345/9,506/145,301 · BAHT_HALF_UP 12,300/9,500/145,250 · BAHT_DOWN 12,300/9,500/145,250 · INCLUSIVE vatIncluded 8,076", () => {
    const x = (m: Rounding) => { const r = tax(123_450, { mode: "EXCLUSIVE", vatBp: 700, serviceChargeBp: 1000 }, m); return [r?.lines?.[0]?.amountSatang, r?.lines?.[1]?.amountSatang, r?.totalSatang]; };
    eq(x("SATANG"), [12_345, 9_506, 145_301], "SATANG");
    eq(x("BAHT_HALF_UP"), [12_300, 9_500, 145_250], "BAHT_HALF_UP");
    eq(x("BAHT_DOWN"), [12_300, 9_500, 145_250], "BAHT_DOWN");
    eq(tax(123_450, { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 0 }, "SATANG")?.vatIncludedSatang, 8_076, "INCLUSIVE 1,234.50");
  });
  await st("P-35", "ภาษี 0: EXCLUSIVE vat 0 sc 0 ⇒ total = subtotal · ไม่มีบรรทัดยอดบวก · INCLUSIVE vat 0 ⇒ vatIncluded 0 · subtotal 0 ⇒ ทุกอย่าง 0", () => {
    const r = tax(298_000, { mode: "EXCLUSIVE", vatBp: 0, serviceChargeBp: 0 });
    ok(r?.totalSatang === 298_000 && (r?.lines ?? []).every((l: Any) => l.amountSatang === 0), `EXCLUSIVE 0: ${J(r)}`);
    eq(tax(298_000, { mode: "INCLUSIVE", vatBp: 0, serviceChargeBp: 0 })?.vatIncludedSatang, 0, "INCLUSIVE 0");
    const z = tax(0, { mode: "EXCLUSIVE", vatBp: 700, serviceChargeBp: 1000 });
    ok(z?.totalSatang === 0 && (z?.lines ?? []).every((l: Any) => l.amountSatang === 0), `subtotal 0: ${J(z)}`);
  });
  await st("P-36", "สตางค์ Int ทุกจุด: fuzz 200 ชุด (subtotal/vat/sc/rounding สุ่ม) ⇒ amountSatang/totalSatang/vatIncludedSatang เป็นจำนวนเต็ม ≥ 0 · total = subtotal + Σ lines (EXCLUSIVE) · deposit PERCENT เป็นจำนวนเต็ม", () => {
    let seed = 20261102;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const modes: Rounding[] = ["SATANG", "BAHT_HALF_UP", "BAHT_DOWN"];
    const f = PR.tax(), d = PR.deposit();
    const q = quoteOk(T.dlx, PLAN_ID.standard, "2026-11-06", "2026-11-08");
    for (let i = 0; i < 200; i++) {
      const sub = rnd(10_000_000), vat = rnd(2001), sc = rnd(2001), m = modes[rnd(3)];
      const r = f(sub, { mode: i % 2 ? "EXCLUSIVE" : "INCLUSIVE", vatBp: vat, serviceChargeBp: sc }, m);
      const nums = [r.totalSatang, r.vatIncludedSatang, ...r.lines.map((l: Any) => l.amountSatang)];
      ok(nums.every((n: Any) => Number.isInteger(n) && n >= 0), `ไม่ใช่จำนวนเต็ม ${J({ sub, vat, sc, m, r })}`);
      if (i % 2) eq(r.totalSatang, sub + r.lines.reduce((a: number, l: Any) => a + l.amountSatang, 0), `total ≠ subtotal+lines ${J({ sub, vat, sc, m })}`);
      else eq(r.totalSatang, sub, "INCLUSIVE total");
      const dep = d([q], { kind: "PERCENT", percentBp: rnd(10_001) }, m);
      ok(Number.isInteger(dep) && dep >= 0 && dep <= q.nightsTotal, `deposit ${dep}`);
    }
  });
  await st("P-37", "fuzz 300 คืน (วัน × ประเภท × แผน · ปี 2569–2570 · override สุ่ม 20 จุด · fallback สุ่ม) ⇒ resolveNightPrice ตรงตัวอ้างอิง §2 ทุกช่อง (price/source/seasonId/bucket)", () => {
    let seed = 1133;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const ctx = mkCtx({ fallback: { ...NO_FALLBACK(), [T.suite]: { baseRateSatang: 250_000, dayOfWeekAdjustBp: [0, 0, 0, 0, 500, 1000, 1000] }, [T.fam]: { baseRateSatang: 180_000, dayOfWeekAdjustBp: [0, 0, 0, 0, 0, 1500, 1500] } } });
    const types = [T.sup, T.dlx, T.fam, T.suite], plans = Object.values(PLAN_ID);
    for (let i = 0; i < 20; i++) ctx.overrides.push({ roomTypeId: types[rnd(4)], ratePlanId: rnd(3) === 0 ? null : plans[rnd(3)], date: ymdOfDay(dayNo("2026-11-01") + rnd(500)), priceSatang: 100_000 + rnd(300) * 100, reason: "สุ่ม" });
    const diffs: string[] = [];
    for (let i = 0; i < 300; i++) {
      const date = ymdOfDay(dayNo("2026-11-01") + rnd(500)), roomTypeId = types[rnd(4)], ratePlanId = plans[rnd(3)];
      const exp = refNight(ctx, roomTypeId, ratePlanId, date), got = pick(night(ctx, roomTypeId, ratePlanId, date));
      const cmp = (a: Any) => (a ? { priceSatang: a.priceSatang, source: a.source, ...(a.source === "RATE" ? { seasonId: a.seasonId, bucket: a.bucket } : {}) } : null);
      if (!isDeepStrictEqual(cmp(exp), cmp(got))) diffs.push(`${date} ${roomTypeId.slice(-6)} ${ratePlanId.slice(-6)}: ได้ ${J(got)} ต้อง ${J(exp)}`);
    }
    ok(!diffs.length, `${diffs.length} ช่องต่าง: ${diffs.slice(0, 3).join(" | ")}`);
  });
  await st("P-38", "pure: เรียกซ้ำผลเท่าเดิม · ไม่แก้ ctx (JSON ก่อน/หลังเท่ากัน · Set holidays ไม่เปลี่ยน) · ไม่เรียก Date เวลาเครื่อง (ซอร์สไม่มี new Date()/Date.now/getDay/toLocale) · import เฉพาะ type", () => {
    const ctx = mkCtx();
    const snap = () => J({ ...ctx, holidays: [...ctx.holidays].sort() });
    const before = snap();
    const a = quote(ctx, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-06", checkOut: "2026-11-08" });
    const b = quote(ctx, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-06", checkOut: "2026-11-08" });
    eq(a, b, "เรียกซ้ำ");
    eq(snap(), before, "ctx ถูกแก้");
    const s = stripComments(read(F.pricing));
    ok(s, "ยังไม่มี pricing.ts");
    ok(!/new\s+Date\s*\(|Date\.now\s*\(|\.getDay\s*\(|\.getDate\s*\(|toLocale(Date|Time)?String|Intl\./.test(s), "pricing.ts ใช้ Date เวลาเครื่อง/getDay");
    const vals = importSpecs(read(F.pricing)).filter((i) => !i.typeOnly);
    eq(vals.map((v) => v.spec), [], "import ค่า (ต้องเป็น import type เท่านั้น)");
  });
  await st("P-39", "ผลลัพธ์ทั้งหมดเป็นจำนวนเต็มสตางค์: quote/deposit/refund/tax บนทุกกรณีข้างบน ไม่มีทศนิยม · nightsTotal = Σ nights.priceSatang", () => {
    const qs = [quoteOk(T.dlx, PLAN_ID.standard, "2026-11-06", "2026-11-08"), quoteOk(T.dlx, PLAN_ID.nonref, "2026-11-28", "2027-01-05"), quoteOk(T.fam, PLAN_ID.breakfast, "2026-12-30", "2027-01-04")];
    for (const q of qs) { ok(Number.isInteger(q.nightsTotal) && (q.nights as Any[]).every((n) => Number.isInteger(n.priceSatang)), J(q).slice(0, 200)); eq(q.nightsTotal, (q.nights as Any[]).reduce((a, n) => a + n.priceSatang, 0), "Σ"); }
    eq(qs[1].nights.length, nightsOf("2026-11-28", "2027-01-05").length, "จำนวนคืนข้ามปี");
  });
  await st("P-40", "เตียงเสริม (มติ 1 ข้อ 4 · §11 #2 ctx.roomTypes): ดีลักซ์ extraBeds 1 ⇒ คืน +30,000 (จ. 159,000 · override 14 พ.ย. 199,000) · quote ศ.–อา. +60,000 = 358,000 · extraBeds 0/ไม่ส่ง เท่าเดิม · ซูพีเรีย (extraBedAllowed false) ⇒ EXTRA_BED_NOT_ALLOWED · ดีลักซ์ 2 เตียง (2+2 > max 3) ⇒ OVER_OCCUPANCY · แฟมิลี 1 เตียง (4+1 ≤ 5) ผ่าน", () => {
    eq(night(C0, T.dlx, PLAN_ID.standard, "2026-11-02", { extraBeds: 1 })?.priceSatang, 159_000, "จันทร์ +1 เตียง");
    eq(night(C0, T.dlx, PLAN_ID.standard, "2026-11-14", { extraBeds: 1 })?.priceSatang, 199_000, "override +1 เตียง");
    eq(night(C0, T.dlx, PLAN_ID.standard, "2026-11-02", { extraBeds: 0 })?.priceSatang, 129_000, "0 เตียง");
    const q = okRes(quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-06", checkOut: "2026-11-08", extraBeds: 1 }), "quote เตียงเสริม");
    eq(q.nightsTotal, 358_000, "quote +60,000");
    const na = quote(C0, { roomTypeId: T.sup, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-06", checkOut: "2026-11-08", extraBeds: 1 });
    eq([na?.ok, na?.error], [false, "EXTRA_BED_NOT_ALLOWED"], "ซูพีเรีย");
    const ov = quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-06", checkOut: "2026-11-08", extraBeds: 2 });
    eq([ov?.ok, ov?.error], [false, "OVER_OCCUPANCY"], "เกิน max");
    ok(quote(C0, { roomTypeId: T.fam, ratePlanId: PLAN_ID.standard, checkIn: "2026-11-06", checkOut: "2026-11-08", extraBeds: 1 })?.ok === true, "แฟมิลี 1 เตียงผ่าน");
  });
  await st("P-41", "ขั้นต่ำคืนของฤดู (§11 #4 · ปีใหม่ minNights 2 · ขั้นต่ำจริง = max(แผน, ฤดูที่ครอบคืนแรก, limits)): 31 ธ.ค. 1 คืน ⇒ MIN_NIGHTS · 2 คืนผ่าน · 2 ม.ค. (วันจบฤดู) 1 คืน ⇒ MIN_NIGHTS · 3 ม.ค. (ไฮซีซัน ไม่มี minNights) 1 คืนผ่าน · แผน minNights 3 + ฤดู 2 ⇒ 2 คืนไม่ผ่าน 3 คืนผ่าน · limits 4 ⇒ 3 คืนไม่ผ่าน", () => {
    const one = quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-12-31", checkOut: "2027-01-01" });
    eq([one?.ok, one?.error], [false, "MIN_NIGHTS"], "31 ธ.ค. 1 คืน");
    ok(quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-12-31", checkOut: "2027-01-02" })?.ok === true, "2 คืนผ่าน");
    eq(quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2027-01-02", checkOut: "2027-01-03" })?.error, "MIN_NIGHTS", "2 ม.ค.");
    ok(quote(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2027-01-03", checkOut: "2027-01-04" })?.ok === true, "3 ม.ค. ผ่าน");
    const c = mkCtx(); c.plans = c.plans.map((p) => (p.id === PLAN_ID.standard ? { ...p, minNights: 3 } : p));
    eq(quote(c, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-12-31", checkOut: "2027-01-02" })?.error, "MIN_NIGHTS", "แผน 3 ชนะฤดู 2");
    ok(quote(c, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-12-31", checkOut: "2027-01-03" })?.ok === true, "3 คืนผ่าน");
    eq(PR.quote()(C0, { roomTypeId: T.dlx, ratePlanId: PLAN_ID.standard, checkIn: "2026-12-31", checkOut: "2027-01-03", limits: { ...LIMITS, minNights: 4 } })?.error, "MIN_NIGHTS", "limits 4");
  });

  // ═══════════════ ร้านชั่วคราว (R/B/S) ═══════════════
  console.log("\n── R rates.ts (server) ──");
  const mkTenant = async (name: string) => { const r = await prisma.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC H1 ร้าน A");
  const tB = await mkTenant("QC H1 ร้าน B");
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, type: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UH = await mkUnit(tA, "HOTEL", "โรงแรมทดสอบ H1");
  const UH2 = await mkUnit(tA, "HOTEL", "โรงแรมที่สอง H1");
  const UD = await mkUnit(tA, "DORM", "หอทดสอบ H1");
  const UHB = await mkUnit(tB, "HOTEL", "โรงแรมร้าน B H1");
  const mkType = async (tenantId: string, unitId: string, name: string, base: number) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name, rentMode: "NIGHTLY", baseRateSatang: base } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string) => (await prisma.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId } })).id as string;
  const RTA: Record<string, string> = { sup: await mkType(tA, UH, "ซูพีเรีย", 99_000), dlx: await mkType(tA, UH, "ดีลักซ์", 129_000), fam: await mkType(tA, UH, "แฟมิลี", 189_000), suite: await mkType(tA, UH, "สวีท", 0) };
  const ROOMS: Record<string, number> = { sup: 2, dlx: 3, fam: 1, suite: 1 };
  for (const [k, n] of Object.entries(ROOMS)) for (let i = 1; i <= n; i++) await mkRoom(tA, UH, `${k.toUpperCase()}${i}`, RTA[k]);
  const RT_U2 = await mkType(tA, UH2, "ดีลักซ์", 129_000);
  const RT_B = await mkType(tB, UHB, "ดีลักซ์", 129_000);
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-h1-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@shark.local`, name: `QC h1 ${tag}` } });
    const mb = await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const MGR = await mkMember("mgr", tA, "MANAGER", [UH]);
  const READER = await mkMember("reader", tA, "STAFF", [UH], { "hotel.rates.read": true, "hotel.reservation.checkIn": true });
  const WRITER = await mkMember("writer", tA, "STAFF", [UH], { "hotel.rates.read": true, "hotel.rates.write": true });
  const SEDIT = await mkMember("sedit", tA, "STAFF", [UH], { "hotel.rates.read": true, "hotel.settings.edit": true });
  const NONE = await mkMember("none", tA, "STAFF", [UH], { "hotel.reservation.checkIn": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const TODAY_R = bkkToday();
  const inWin = (n: number) => addDays(TODAY_R, n);
  const auditCount = (tid: string) => prisma.auditLog.count({ where: { tenantId: tid } }) as Promise<number>;
  const lastAudit = (tid: string) => prisma.auditLog.findFirst({ where: { tenantId: tid }, orderBy: { createdAt: "desc" } }) as Promise<Any>;
  /** เรียกฟังก์ชันเขียนแล้วตรวจ AuditLog เพิ่ม ≥ 1 (action hotel.* · before/after) */
  const audited = async (what: string, fn: () => Promise<Any>) => {
    const c0 = await auditCount(tA);
    const r = await fn();
    const c1 = await auditCount(tA);
    const a = await lastAudit(tA);
    if (r?.ok === true) ok(c1 > c0 && typeof a?.action === "string" && /^hotel\./.test(a.action) && (a.before !== null || a.after !== null), `${what}: AuditLog ${c1 - c0} แถว · ล่าสุด ${J({ action: a?.action, before: a?.before !== null, after: a?.after !== null })}`);
    return r;
  };
  const ids: Record<string, string> = {};
  const planByCode = async (unitId: string, code: string) => prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId, code } });
  /** แถว matrix สำหรับร้านชั่วคราว (ตามฟิกซ์เจอร์ · ประเภท 3 ตัว) */
  const rowsFor = (planKey: string, seasonId: string | null, seasonKey: string | null) => Object.entries({ sup: "ซูพีเรีย", dlx: "ดีลักซ์", fam: "แฟมิลี" }).map(([k, name]) => { const c = cellOf(planKey, name, seasonKey)!; return { roomTypeId: RTA[k], seasonId, priceWeekdaySatang: c.weekday, priceWeekendSatang: c.weekend, priceHolidaySatang: c.holiday }; });

  await st("R-1", "listRatePlans หน่วย HOTEL ใหม่ ⇒ สร้างแผน default อัตโนมัติ 1 แผน (code จาก rooms.hotel.defaultRatePlan = STANDARD · isDefault · ACTIVE) · เรียกซ้ำไม่สร้างเพิ่ม · AuditLog มีแถวตอนสร้าง", async () => {
    needH0();
    const r = okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH }), "list");
    const rows = await prisma.hotelRatePlan.findMany({ where: { tenantId: tA, unitId: UH } });
    eq(rows.map((p: Any) => [p.code, p.isDefault, p.status]), [["STANDARD", true, "ACTIVE"]], "แถว");
    ok(Array.isArray(r.plans) && r.plans.length === 1 && r.plans[0].code === "STANDARD", `plans ${J(r.plans)}`);
    okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH }), "list 2");
    eq(await prisma.hotelRatePlan.count({ where: { tenantId: tA, unitId: UH } }), 1, "ไม่สร้างเพิ่ม");
    ids.std = rows[0].id;
    ok((await auditCount(tA)) >= 1, "AuditLog");
  });
  await st("R-2", "saveRatePlan: สร้าง BREAKFAST (includeBreakfast · visibility WEB/LINE) และ NONREF (FULL · visibility WEB) · code ซ้ำในหน่วยเดียว ⇒ ok:false · code เดียวกันคนละหน่วยได้ · แก้ชื่อด้วย id · AuditLog before/after", async () => {
    needH0();
    const bf = await audited("สร้าง BREAKFAST", () => RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "BREAKFAST", name: "รวมอาหารเช้า", includeBreakfast: true, depositKind: "FIRST_NIGHT", depositValue: 0, visibility: ["WEB", "LINE"] }));
    okRes(bf, "BREAKFAST");
    const nr = okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "NONREF", name: "จ่ายก่อน ไม่คืนเงิน", includeBreakfast: false, depositKind: "FULL", depositValue: 0, visibility: ["WEB"] }), "NONREF");
    ids.bf = (await planByCode(UH, "BREAKFAST"))!.id; ids.nr = (await planByCode(UH, "NONREF"))!.id;
    void nr;
    const dup = await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "BREAKFAST", name: "ซ้ำ" });
    ok(dup?.ok === false, `code ซ้ำต้อง ok:false ได้ ${codeOf(dup)}`);
    eq(await prisma.hotelRatePlan.count({ where: { tenantId: tA, unitId: UH } }), 3, "3 แผน");
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH2, code: "BREAKFAST", name: "รวมอาหารเช้า (หน่วย 2)" }), "คนละหน่วย");
    okRes(await audited("แก้ชื่อ", () => RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, id: ids.bf, code: "BREAKFAST", name: "รวมอาหารเช้า 2 ท่าน" })), "แก้ชื่อ");
    eq((await prisma.hotelRatePlan.findUnique({ where: { id: ids.bf } }))?.name, "รวมอาหารเช้า 2 ท่าน", "ชื่อใหม่");
    const bfRow = await prisma.hotelRatePlan.findUnique({ where: { id: ids.bf } });
    ok(bfRow.includeBreakfast === true && isDeepStrictEqual(bfRow.visibility, ["WEB", "LINE"]), `แถว BREAKFAST ${J(bfRow)}`);
  });
  await st("R-3", "setDefault ย้ายแผนเริ่มต้น: ตั้ง BREAKFAST เป็น default ⇒ STANDARD เลิกเป็น default · มี isDefault ACTIVE หน่วยละ 1 เสมอ (partial unique H.0) · ตั้งกลับ", async () => {
    needH0();
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, id: ids.bf, code: "BREAKFAST", name: "รวมอาหารเช้า 2 ท่าน", setDefault: true }), "setDefault");
    eq((await prisma.hotelRatePlan.findMany({ where: { tenantId: tA, unitId: UH, isDefault: true, status: "ACTIVE" } })).map((p: Any) => p.code), ["BREAKFAST"], "default ใหม่");
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, id: ids.std, code: "STANDARD", name: "ราคามาตรฐาน", setDefault: true }), "ตั้งกลับ");
    eq((await prisma.hotelRatePlan.findMany({ where: { tenantId: tA, unitId: UH, isDefault: true, status: "ACTIVE" } })).map((p: Any) => p.code), ["STANDARD"], "กลับ STANDARD");
  });
  await st("R-4", "archiveRatePlan: แผน default ⇒ ปฏิเสธ DEFAULT_PLAN (เหตุผลไทย) ไม่เปลี่ยนแถว · แผนธรรมดา (NONREF) ⇒ status ARCHIVED แถวยังอยู่ · listRatePlans ไม่แสดง ARCHIVED (หรือระบุ status) · AuditLog", async () => {
    needH0();
    const r = await RT("archiveRatePlan")(OWNER, ctxA, { unitId: UH, id: ids.std });
    eq(failCode(r), "DEFAULT_PLAN", `archive default: ${J(r)}`);
    ok(typeof r?.reason === "string" && THAI.test(r.reason), "เหตุผลไทย");
    eq((await prisma.hotelRatePlan.findUnique({ where: { id: ids.std } }))?.status, "ACTIVE", "default ยัง ACTIVE");
    okRes(await audited("archive NONREF", () => RT("archiveRatePlan")(OWNER, ctxA, { unitId: UH, id: ids.nr })), "archive NONREF");
    eq((await prisma.hotelRatePlan.findUnique({ where: { id: ids.nr } }))?.status, "ARCHIVED", "ARCHIVED");
    const l = okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH }), "list");
    ok((l.plans as Any[]).every((p) => p.id !== ids.nr || p.status === "ARCHIVED"), "list ยังแสดง NONREF เป็น ACTIVE");
  });
  await st("R-5", "archive แผนที่มี HotelBookingNight อ้าง (S:1114) = archive เท่านั้น: สร้าง NONREF2 + การจอง + คืน ratePlanId=แผน ⇒ archive ok · แถวแผนอยู่ · คืนอยู่ · ratePlanId ของคืนไม่เปลี่ยน", async () => {
    needH0();
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "NONREF2", name: "จ่ายก่อน 2" }), "สร้าง");
    const p = (await planByCode(UH, "NONREF2"))!;
    const res = await prisma.hotelReservation.create({ data: { tenantId: tA, unitId: UH, code: `HR-QC-${RUN}`, guestName: "ผู้เข้าพักทดสอบ", roomTypeId: RTA.dlx, checkInDate: dbDate(inWin(2)), checkOutDate: dbDate(inWin(3)), nights: 1, ratePlanId: p.id, taxSnapshot: { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 0 } } });
    ids.res = res.id;
    await prisma.hotelBookingNight.create({ data: { tenantId: tA, unitId: UH, reservationId: res.id, roomTypeId: RTA.dlx, date: dbDate(inWin(2)), priceSatang: 129_000, ratePlanId: p.id, priceSource: "RATE" } });
    okRes(await RT("archiveRatePlan")(OWNER, ctxA, { unitId: UH, id: p.id }), "archive");
    eq((await prisma.hotelRatePlan.findUnique({ where: { id: p.id } }))?.status, "ARCHIVED", "แผน");
    eq((await prisma.hotelBookingNight.findMany({ where: { reservationId: res.id } })).map((n: Any) => n.ratePlanId), [p.id], "คืน");
  });
  await st("R-6", "saveCancelRules แทนทั้งชุด: ตั้ง 3 ขั้น (7/3/0) ⇒ แถว = ชุด · ตั้งใหม่ 2 ขั้น ⇒ แถวเก่าหาย · daysBefore ซ้ำ ⇒ ok:false · refundBp 10,001 ⇒ ok:false · daysBefore 366 ⇒ ok:false · ชุดว่างตามใบ (อนุญาต/ไม่) ไม่ throw · AuditLog", async () => {
    needH0();
    okRes(await audited("กฎ 3 ขั้น", () => RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: Q2_RULES })), "3 ขั้น");
    const rows = async () => (await prisma.hotelCancelRule.findMany({ where: { ratePlanId: ids.std }, orderBy: { daysBefore: "desc" } })).map((r: Any) => [r.daysBefore, r.refundBp]);
    eq(await rows(), [[7, 10_000], [3, 5_000], [0, 0]], "3 ขั้น");
    okRes(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: [{ daysBefore: 3, refundBp: 10_000 }, { daysBefore: 0, refundBp: 0 }] }), "2 ขั้น");
    eq(await rows(), [[3, 10_000], [0, 0]], "แทนทั้งชุด");
    for (const bad of [[{ daysBefore: 3, refundBp: 1 }, { daysBefore: 3, refundBp: 2 }], [{ daysBefore: 3, refundBp: 10_001 }], [{ daysBefore: 366, refundBp: 0 }], [{ daysBefore: -1, refundBp: 0 }]]) {
      const r = await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: bad });
      ok(r?.ok === false, `กฎผิด ${J(bad)} ต้อง ok:false`);
    }
    eq(await rows(), [[3, 10_000], [0, 0]], "กฎผิดไม่เขียน");
    const e = await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: [] });
    ok(e && typeof e.ok === "boolean", "ชุดว่าง throw");
    okRes(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: Q2_RULES }), "คืนค่า 3 ขั้น");
  });
  await st("R-7", "ฤดู: saveSeason ไฮซีซัน (p10) + ปีใหม่ (p20) · listSeasons เรียง priority · dateEnd < dateStart ⇒ ok:false · archiveSeason ⇒ ARCHIVED แถวอยู่ + หายจาก ACTIVE ของ loadPricingContext · AuditLog", async () => {
    needH0();
    const y = Number(TODAY_R.slice(0, 4));
    const hi = seasonRange(FX.seasons[0], y), ny = seasonRange(FX.seasons[1], y);
    okRes(await audited("ฤดู", () => RT("saveSeason")(OWNER, ctxA, { unitId: UH, name: "ไฮซีซัน", dateStart: hi.dateStart, dateEnd: hi.dateEnd, priority: 10 })), "ไฮซีซัน");
    okRes(await RT("saveSeason")(OWNER, ctxA, { unitId: UH, name: "ปีใหม่", dateStart: ny.dateStart, dateEnd: ny.dateEnd, priority: 20, minNights: 2 }), "ปีใหม่");
    okRes(await RT("saveSeason")(OWNER, ctxA, { unitId: UH, name: "ชั่วคราว", dateStart: inWin(40), dateEnd: inWin(45), priority: 1 }), "ชั่วคราว");
    const bad = await RT("saveSeason")(OWNER, ctxA, { unitId: UH, name: "กลับหัว", dateStart: "2026-12-10", dateEnd: "2026-12-01", priority: 1 });
    ok(bad?.ok === false, "dateEnd < dateStart");
    const l = okRes(await RT("listSeasons")(OWNER, ctxA, { unitId: UH }), "list");
    const names = (l.seasons as Any[]).map((s) => s.name);
    ok(names.includes("ไฮซีซัน") && names.includes("ปีใหม่") && names.includes("ชั่วคราว") && !names.includes("กลับหัว"), `list ${J(names)}`);
    const rows = await prisma.hotelSeason.findMany({ where: { tenantId: tA, unitId: UH } });
    ids.high = rows.find((s: Any) => s.name === "ไฮซีซัน").id; ids.ny = rows.find((s: Any) => s.name === "ปีใหม่").id; ids.tmp = rows.find((s: Any) => s.name === "ชั่วคราว").id;
    eq([ymdOfDb(rows.find((s: Any) => s.name === "ไฮซีซัน").dateStart), ymdOfDb(rows.find((s: Any) => s.name === "ไฮซีซัน").dateEnd)], [hi.dateStart, hi.dateEnd], "วันที่ฤดู");
    okRes(await RT("archiveSeason")(OWNER, ctxA, { unitId: UH, id: ids.tmp }), "archive");
    eq((await prisma.hotelSeason.findUnique({ where: { id: ids.tmp } }))?.status, "ARCHIVED", "ARCHIVED");
    const pc = await RT("loadPricingContext")(ctxA, UH, { from: TODAY_R, to: inWin(60) });
    ok((pc.seasons as Any[]).every((s) => s.id !== ids.tmp), "ARCHIVED ยังอยู่ใน ctx");
  });
  await st("R-21", "ฤดูมี minNights (§11 #4 · HotelSeason.minNights Int? CHECK ≥ 1): ปีใหม่ที่สร้างมี minNights 2 ในแถวและใน ctx.seasons · แก้เป็น null ได้ · minNights 0 ⇒ ok:false ไม่เขียน · insert ดิบ minNights 0 ⇒ ฐานปฏิเสธ (CHECK)", async () => {
    needH0();
    eq((await prisma.hotelSeason.findUnique({ where: { id: ids.ny } }))?.minNights, 2, "แถว");
    const pc = await RT("loadPricingContext")(ctxA, UH, { from: TODAY_R, to: inWin(60) });
    eq((pc.seasons as Any[]).find((s) => s.id === ids.ny)?.minNights, 2, "ctx");
    okRes(await RT("saveSeason")(OWNER, ctxA, { unitId: UH, id: ids.ny, name: "ปีใหม่", dateStart: ymdOfDb((await prisma.hotelSeason.findUnique({ where: { id: ids.ny } })).dateStart), dateEnd: ymdOfDb((await prisma.hotelSeason.findUnique({ where: { id: ids.ny } })).dateEnd), priority: 20, minNights: null }), "แก้เป็น null");
    eq((await prisma.hotelSeason.findUnique({ where: { id: ids.ny } }))?.minNights ?? null, null, "null");
    const bad = await RT("saveSeason")(OWNER, ctxA, { unitId: UH, id: ids.ny, name: "ปีใหม่", dateStart: ymdOfDb((await prisma.hotelSeason.findUnique({ where: { id: ids.ny } })).dateStart), dateEnd: ymdOfDb((await prisma.hotelSeason.findUnique({ where: { id: ids.ny } })).dateEnd), priority: 20, minNights: 0 });
    ok(bad?.ok === false, `minNights 0 ผ่าน ${J(bad)}`);
    let err = "";
    try { await prisma.$executeRawUnsafe(`INSERT INTO "HotelSeason" ("id","tenantId","unitId","name","dateStart","dateEnd","priority","minNights","updatedAt") VALUES ($1,$2,$3,'เช็ค',$4::date,$5::date,1,0,now())`, `qc-ss-${RUN}`, tA, UH, inWin(80), inWin(81)); } catch (e) { err = errMsg(e); }
    ok(/check|23514/i.test(err), `CHECK minNights ≥ 1 ไม่ทำงาน: ${err || "insert ผ่าน!"}`);
    okRes(await RT("saveSeason")(OWNER, ctxA, { unitId: UH, id: ids.ny, name: "ปีใหม่", dateStart: ymdOfDb((await prisma.hotelSeason.findUnique({ where: { id: ids.ny } })).dateStart), dateEnd: ymdOfDb((await prisma.hotelSeason.findUnique({ where: { id: ids.ny } })).dateEnd), priority: 20, minNights: 2 }), "คืนค่า 2");
  });
  await st("R-8", "วันหยุด: saveHolidays bulk 3 วัน ⇒ 3 แถว · bulk ซ้ำ (idempotent) ไม่เพิ่ม · removeHoliday ⇒ เหลือ 2 · วันที่ผิดรูป ⇒ ok:false · AuditLog", async () => {
    needH0();
    const ds = [inWin(3), inWin(10), `${TODAY_R.slice(0, 4)}-12-05`];
    okRes(await audited("วันหยุด", () => RT("saveHolidays")(OWNER, ctxA, { unitId: UH, dates: ds, name: "วันหยุดทดสอบ" })), "bulk");
    eq(await prisma.hotelHoliday.count({ where: { tenantId: tA, unitId: UH } }), 3, "3 แถว");
    okRes(await RT("saveHolidays")(OWNER, ctxA, { unitId: UH, dates: ds, name: "วันหยุดทดสอบ" }), "bulk ซ้ำ");
    eq(await prisma.hotelHoliday.count({ where: { tenantId: tA, unitId: UH } }), 3, "ไม่เพิ่ม");
    okRes(await RT("removeHoliday")(OWNER, ctxA, { unitId: UH, date: inWin(10) }), "remove");
    eq((await prisma.hotelHoliday.findMany({ where: { tenantId: tA, unitId: UH } })).map((h: Any) => ymdOfDb(h.date)).sort(), [ds[0], ds[2]].sort(), "เหลือ 2");
    ok((await RT("saveHolidays")(OWNER, ctxA, { unitId: UH, dates: ["32/13/2569"], name: "ผิด" }))?.ok === false, "วันที่ผิดรูป");
    ids.holi = ds[0];
  });
  await st("R-9", "getRateMatrix: rows = ประเภทห้อง (4) × (ฤดู ACTIVE 2 + null) = 12 ช่อง · ยังไม่ตั้ง = ราคา null · แต่ละแถวมี roomTypeId/seasonId/price 3 ตัว", async () => {
    needH0();
    const m = okRes(await RT("getRateMatrix")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std }), "matrix");
    const rows = m.rows as Any[];
    eq(rows.length, 12, "จำนวนช่อง");
    ok(rows.every((r) => typeof r.roomTypeId === "string" && "seasonId" in r && "priceWeekdaySatang" in r && "priceWeekendSatang" in r && "priceHolidaySatang" in r), `รูปแถว ${J(rows[0])}`);
    ok(rows.every((r) => r.priceWeekdaySatang === null), "ยังไม่ตั้งต้อง null");
    eq(new Set(rows.map((r) => r.seasonId ?? null)), new Set([null, ids.high, ids.ny]), "ฤดู");
  });
  await st("R-10", "saveRates บันทึกทั้งชุด + unique NULLS NOT DISTINCT: บันทึก 9 แถว (3 ประเภท × null/ไฮ/ปีใหม่) ⇒ 9 แถว · บันทึกซ้ำชุดเดิม ⇒ ยัง 9 (update ไม่ซ้ำแถว) · เปลี่ยนราคา 1 ช่อง ⇒ 9 แถว ค่าใหม่ · insert ดิบซ้ำ (plan,type,NULL) ⇒ ฐานปฏิเสธ · AuditLog", async () => {
    needH0();
    const rows = [...rowsFor("standard", null, null), ...rowsFor("standard", ids.high, "high"), ...rowsFor("standard", ids.ny, "newyear")];
    okRes(await audited("saveRates", () => RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows })), "บันทึก");
    const cnt = () => prisma.hotelRate.count({ where: { ratePlanId: ids.std } });
    eq(await cnt(), 9, "9 แถว");
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows }), "ซ้ำ");
    eq(await cnt(), 9, "ซ้ำไม่เพิ่ม");
    const rows2 = rows.map((r) => (r.roomTypeId === RTA.dlx && r.seasonId === null ? { ...r, priceWeekdaySatang: 131_000 } : r));
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows: rows2 }), "เปลี่ยน");
    eq(await cnt(), 9, "ยัง 9");
    eq((await prisma.hotelRate.findFirst({ where: { ratePlanId: ids.std, roomTypeId: RTA.dlx, seasonId: null } }))?.priceWeekdaySatang, 131_000, "ค่าใหม่");
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows }), "คืนค่า");
    let dupErr = "";
    try { await prisma.$executeRawUnsafe(`INSERT INTO "HotelRate" ("id","tenantId","unitId","ratePlanId","roomTypeId","seasonId","priceWeekdaySatang","priceWeekendSatang","updatedAt") VALUES ($1,$2,$3,$4,$5,NULL,1,1,now())`, `qc-dup-${RUN}`, tA, UH, ids.std, RTA.dlx); } catch (e) { dupErr = errMsg(e); }
    ok(/unique|duplicate|23505/i.test(dupErr), `insert ดิบซ้ำต้องถูกปฏิเสธ (NULLS NOT DISTINCT): ${dupErr || "ผ่าน!"}`);
    eq(await cnt(), 9, "หลัง insert ดิบ");
    // แผนอื่น: BREAKFAST ชุด null-season
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.bf, rows: rowsFor("breakfast", null, null) }), "BREAKFAST");
  });
  await st("R-11", "saveRates tx ล้มทั้งชุด (มติ 9): ชุดที่มี 1 แถวราคาลบ ⇒ INVALID_PRICE · ไม่มีแถวใดเปลี่ยน (snapshot ก่อน/หลังเท่ากัน) · holiday null ยอม · roomTypeId ไม่มีในหน่วย ⇒ NOT_FOUND ไม่เขียน", async () => {
    needH0();
    const snap = async () => J((await prisma.hotelRate.findMany({ where: { ratePlanId: ids.std }, orderBy: [{ roomTypeId: "asc" }, { seasonId: "asc" }] })).map((r: Any) => [r.roomTypeId, r.seasonId, r.priceWeekdaySatang, r.priceWeekendSatang, r.priceHolidaySatang]));
    const s0 = await snap();
    const rows = rowsFor("standard", null, null).map((r, i) => (i === 0 ? { ...r, priceWeekdaySatang: 150_000 } : i === 2 ? { ...r, priceWeekendSatang: -1 } : r));
    const r = await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows });
    eq(failCode(r), "INVALID_PRICE", `ราคาลบ ${J(r)}`);
    eq(await snap(), s0, "แถวเปลี่ยนทั้งที่ tx ต้องล้ม");
    const nf = await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows: [{ roomTypeId: RT_U2, seasonId: null, priceWeekdaySatang: 1, priceWeekendSatang: 1, priceHolidaySatang: null }] });
    eq(failCode(nf), "NOT_FOUND", `ประเภทหน่วยอื่น ${J(nf)}`);
    eq(await snap(), s0, "หน่วยอื่นเขียน");
  });
  await st("R-12", "setOverride/clearOverride: ตั้ง (ดีลักซ์, ทุกแผน, วันที่ +5, 169,000, เหตุผล) ⇒ 1 แถว reason + setById = ผู้ทำ · ตั้งซ้ำคีย์เดิมราคาใหม่ ⇒ ยัง 1 แถว (NULLS NOT DISTINCT) · ราคาลบ ⇒ INVALID_PRICE · clear ⇒ 0 แถว · AuditLog", async () => {
    needH0();
    const d = inWin(5);
    okRes(await audited("override", () => RT("setOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, ratePlanId: null, date: d, priceSatang: 169_000, reason: "งานวิ่งในเมือง" })), "ตั้ง");
    const rows = () => prisma.hotelRateOverride.findMany({ where: { tenantId: tA, unitId: UH, roomTypeId: RTA.dlx } });
    let r = await rows();
    eq([r.length, r[0]?.priceSatang, r[0]?.reason, r[0]?.setById, r[0]?.ratePlanId ?? null, ymdOfDb(r[0]?.date)], [1, 169_000, "งานวิ่งในเมือง", OWNER.userId, null, d], "แถว");
    okRes(await RT("setOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, ratePlanId: null, date: d, priceSatang: 179_000, reason: "ปรับอีกครั้ง" }), "ตั้งซ้ำ");
    r = await rows();
    eq([r.length, r[0]?.priceSatang], [1, 179_000], "update ไม่ซ้ำแถว");
    eq(failCode(await RT("setOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, ratePlanId: null, date: d, priceSatang: -5, reason: "ลบ" })), "INVALID_PRICE", "ราคาลบ");
    okRes(await audited("clear", () => RT("clearOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, ratePlanId: null, date: d })), "clear");
    eq((await rows()).length, 0, "ลบแล้ว");
    okRes(await RT("setOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, ratePlanId: null, date: d, priceSatang: 169_000, reason: "งานวิ่งในเมือง" }), "ตั้งคืน (ใช้ใน R-15)");
    ids.ovDate = d;
  });
  await st("R-13", "loadPricingContext รูปตรง §3: weekendDays [5,6] (ค่าตั้ง) · rounding SATANG · today = วันนี้ไทย · plans ACTIVE (ไม่มี ARCHIVED) · seasons ACTIVE dateStart/dateEnd สตริง YYYY-MM-DD · holidays Set · rates 12 แถว · overrides 1 · fallback {baseRateSatang null, dayOfWeekAdjustBp 7}", async () => {
    needH0();
    const c = await RT("loadPricingContext")(ctxA, UH, { from: TODAY_R, to: inWin(13) });
    eq([c.weekendDays, c.rounding, c.today], [[5, 6], "SATANG", TODAY_R], "ค่าตั้ง/today");
    ok(Array.isArray(c.plans) && c.plans.every((p: Any) => p.status === "ACTIVE") && c.plans.some((p: Any) => p.code === "STANDARD"), `plans ${J(c.plans?.map((p: Any) => [p.code, p.status]))}`);
    ok(Array.isArray(c.seasons) && c.seasons.length === 2 && c.seasons.every((s: Any) => /^\d{4}-\d{2}-\d{2}$/.test(s.dateStart) && /^\d{4}-\d{2}-\d{2}$/.test(s.dateEnd) && typeof s.priority === "number"), `seasons ${J(c.seasons)}`);
    ok(c.holidays instanceof Set && c.holidays.has(ids.holi), `holidays ${J([...(c.holidays ?? [])])}`);
    eq(c.rates?.length, 12, "rates");
    ok(c.overrides?.length === 1 && c.overrides[0].date === ids.ovDate && c.overrides[0].priceSatang === 169_000, `overrides ${J(c.overrides)}`);
    ok(c.fallback && typeof c.fallback === "object" && Object.keys(RTA).every((k) => c.fallback[RTA[k]] && c.fallback[RTA[k]].baseRateSatang === null && c.fallback[RTA[k]].dayOfWeekAdjustBp?.length === 7), `fallback ต่อประเภท ${J(c.fallback)}`);
    ok(c.roomTypes && Object.keys(RTA).every((k) => typeof c.roomTypes[RTA[k]]?.baseOccupancy === "number" && typeof c.roomTypes[RTA[k]]?.extraBedAllowed === "boolean" && typeof c.roomTypes[RTA[k]]?.extraBedPriceSatang === "number"), `roomTypes ${J(c.roomTypes)}`);
    ok(c.seasons.every((s: Any) => "minNights" in s), "seasons ไม่มี minNights");
    ids.ctxJson = J({ ...c, holidays: [...c.holidays] });
  });
  await st("R-14", "N+1: loadPricingContext 14 วัน = คำสั่ง SQL ≤ 8 (นับผ่านตัวดัก $on(\"query\") · ไม่นับ BEGIN/COMMIT) · และไม่โตตามจำนวนวัน (60 วัน ≤ 14 วัน + 1)", async () => {
    needH0();
    ok(spyInstalled, "ตัวดักคิวรีไม่ได้ติดตั้ง");
    const count = async (days: number) => { await sleep(30); const i0 = SQL_LOG.length; await RT("loadPricingContext")(ctxA, UH, { from: TODAY_R, to: inWin(days - 1) }); await sleep(60); return sqlCount(i0); };
    const n14 = await count(14), n60 = await count(60);
    console.log(`     (loadPricingContext: 14 วัน = ${n14} คำสั่ง · 60 วัน = ${n60} คำสั่ง)`);
    ok(n14 > 0 && n14 <= 8, `14 วัน = ${n14} คำสั่ง (ต้อง ≤ 8)`);
    ok(n60 <= n14 + 1, `60 วัน = ${n60} โตตามจำนวนวัน`);
  });
  await st("R-15", "ratePreview 14 วัน: days 14 เรียงวัน · byType ทุกประเภท (4) มี priceSatang/source/remaining · remaining = จำนวนห้องของประเภท (ไม่มีการจองนับ) · วัน override ดีลักซ์ = 169,000 OVERRIDE · สวีท (ไม่มีราคา) priceSatang null · ราคาทุกช่อง = resolveNightPrice บน ctx ที่โหลด", async () => {
    needH0();
    const r = await RT("ratePreview")(ctxA, UH, { from: TODAY_R, to: inWin(13) });
    const days = (r?.days ?? r?.value?.days) as Any[];
    ok(Array.isArray(days) && days.length === 14, `days ${days?.length}`);
    eq(days.map((d) => d.date), nightsOf(TODAY_R, inWin(14)), "วัน");
    for (const d of days) for (const k of Object.keys(RTA)) { const c = d.byType?.[RTA[k]]; ok(c && "priceSatang" in c && "source" in c && typeof c.remaining === "number", `${d.date} ${k}: ${J(c)}`); }
    const d0 = days[0];
    eq(Object.keys(RTA).map((k) => d0.byType[RTA[k]].remaining), Object.keys(RTA).map((k) => ROOMS[k]), "remaining = จำนวนห้อง");
    const ov = days.find((d) => d.date === ids.ovDate);
    eq([ov?.byType?.[RTA.dlx]?.priceSatang, ov?.byType?.[RTA.dlx]?.source], [169_000, "OVERRIDE"], "override");
    ok(days.every((d) => d.byType[RTA.suite].priceSatang === null), "สวีทต้อง null");
    const ctx = await RT("loadPricingContext")(ctxA, UH, { from: TODAY_R, to: inWin(13) });
    const std = ctx.plans.find((p: Any) => p.isDefault)?.id ?? ids.std;
    const diffs: string[] = [];
    for (const d of days) for (const k of ["sup", "dlx", "fam"]) { const exp = PR.night()(ctx, { roomTypeId: RTA[k], ratePlanId: std, date: d.date }); const got = d.byType[RTA[k]]; if ((exp?.priceSatang ?? null) !== got.priceSatang || (exp?.source ?? null) !== (got.source ?? null)) diffs.push(`${d.date} ${k} ${J(got)} ≠ ${J(exp)}`); }
    eq(diffs, [], "preview ≠ pure");
    const dow = dowOf(days[1].date);
    const expDlx = refNight({ ...mkCtx(), weekendDays: [5, 6] } as Ctx, T.dlx, PLAN_ID.standard, "2026-11-02");
    void dow; void expDlx;
  });
  await st("R-16", "ratePreview ระบุ ratePlanId BREAKFAST ⇒ ดีลักซ์วันธรรมดา = 169,000 (+200×2) · แผน ARCHIVED (NONREF) ⇒ ok:false/NOT_FOUND ไม่ throw · ช่วง > 62 วัน ⇒ ไม่ throw (ตัด/ปฏิเสธ)", async () => {
    needH0();
    const r = await RT("ratePreview")(ctxA, UH, { from: TODAY_R, to: inWin(13), ratePlanId: ids.bf });
    const days = (r?.days ?? r?.value?.days) as Any[];
    const wd = days.find((d) => ![5, 6].includes(dowOf(d.date)) && d.date !== ids.ovDate && !(d.byType[RTA.dlx].source === "RATE" && false));
    const ctx = await RT("loadPricingContext")(ctxA, UH, { from: TODAY_R, to: inWin(13) });
    const exp = PR.night()(ctx, { roomTypeId: RTA.dlx, ratePlanId: ids.bf, date: wd.date });
    eq(wd.byType[RTA.dlx].priceSatang, exp?.priceSatang, "BREAKFAST = pure");
    ok(!ctx.seasons.some((s: Any) => s.dateStart <= wd.date && wd.date <= s.dateEnd) ? wd.byType[RTA.dlx].priceSatang === 169_000 : true, `นอกฤดูต้อง 169,000 ได้ ${wd.byType[RTA.dlx].priceSatang}`);
    const a = await RT("ratePreview")(ctxA, UH, { from: TODAY_R, to: inWin(13), ratePlanId: ids.nr });
    ok(a && (a.ok === false || Array.isArray(a.days)), `ARCHIVED: ${J(a).slice(0, 120)}`);
    const big = await RT("ratePreview")(ctxA, UH, { from: TODAY_R, to: inWin(120) });
    ok(big && (big.ok === false || (Array.isArray(big.days) && big.days.length <= 121)), "ช่วงยาว throw");
  }, "MAJOR");
  await st("R-17", "archiveSeason ที่มีแถว HotelRate อ้าง: seasonId ของแถวคงอยู่ (SetNull เฉพาะลบ) · ฤดู ARCHIVED · ราคาวันในฤดูนั้นตกไปแถว null (pure บน ctx ใหม่) · ยกเลิก archive ไม่มี (สร้างใหม่แทน)", async () => {
    needH0();
    okRes(await RT("archiveSeason")(OWNER, ctxA, { unitId: UH, id: ids.ny }), "archive ปีใหม่");
    eq(await prisma.hotelRate.count({ where: { ratePlanId: ids.std, seasonId: ids.ny } }), 3, "แถวราคายังอ้างฤดู");
    const ctx = await RT("loadPricingContext")(ctxA, UH, { from: TODAY_R, to: inWin(13) });
    ok(!ctx.seasons.some((s: Any) => s.id === ids.ny), "ctx ยังมีฤดู ARCHIVED");
    const y = Number(TODAY_R.slice(0, 4));
    const nyDate = `${y}-12-31`;
    const got = PR.night()(ctx, { roomTypeId: RTA.dlx, ratePlanId: ids.std, date: nyDate });
    const inHigh = ctx.seasons.some((s: Any) => s.id === ids.high && s.dateStart <= nyDate && nyDate <= s.dateEnd);
    eq(got?.seasonId ?? null, inHigh ? ids.high : null, "31 ธ.ค. ตกไปไฮซีซัน/ปกติ");
    okRes(await RT("saveSeason")(OWNER, ctxA, { unitId: UH, name: "ปีใหม่", dateStart: seasonRange(FX.seasons[1], y).dateStart, dateEnd: seasonRange(FX.seasons[1], y).dateEnd, priority: 20, minNights: 2 }), "สร้างใหม่");
  }, "MAJOR");
  await st("R-18", "saveRatePlan ตรวจค่า: depositKind นอกชุด ⇒ ok:false · depositValue ลบ ⇒ ok:false · visibility นอก WEB/LINE/COUNTER/OTA ⇒ ok:false · minNights > maxNights ⇒ ok:false · code ว่าง/ยาว 41 ⇒ ok:false · ไม่สร้างแถว", async () => {
    needH0();
    const n0 = await prisma.hotelRatePlan.count({ where: { tenantId: tA } });
    const bads: Any[] = [
      { unitId: UH, code: "X1", name: "ผิด", depositKind: "HALF" },
      { unitId: UH, code: "X2", name: "ผิด", depositKind: "PERCENT", depositValue: -1 },
      { unitId: UH, code: "X3", name: "ผิด", visibility: ["WEB", "TIKTOK"] },
      { unitId: UH, code: "X4", name: "ผิด", minNights: 5, maxNights: 2 },
      { unitId: UH, code: "", name: "ผิด" },
      { unitId: UH, code: "X".repeat(41), name: "ผิด" },
    ];
    for (const b of bads) { const r = await RT("saveRatePlan")(OWNER, ctxA, b); ok(r?.ok === false && typeof (r.reason ?? "") === "string", `${J(b).slice(0, 60)} ⇒ ${J(r).slice(0, 80)}`); }
    eq(await prisma.hotelRatePlan.count({ where: { tenantId: tA } }), n0, "สร้างแถว");
  }, "MAJOR");
  await st("R-19", "listRatePlans ให้ข้อมูลการ์ดแผน (§5 แผนราคา): ทุกแผนมี cancelRules[] (STANDARD = 3 ขั้น Q2) · depositKind/depositValue · visibility · includeBreakfast · isDefault", async () => {
    needH0();
    const l = okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH }), "list");
    const std = (l.plans as Any[]).find((p) => p.code === "STANDARD");
    ok(std && Array.isArray(std.cancelRules), `STANDARD ไม่มี cancelRules ${J(std)}`);
    eq((std.cancelRules as Any[]).map((r) => [r.daysBefore, r.refundBp]).sort((a, b) => b[0] - a[0]), [[7, 10_000], [3, 5_000], [0, 0]], "กฎ");
    ok(["depositKind", "depositValue", "visibility", "includeBreakfast", "isDefault"].every((k) => k in std), `ฟิลด์ ${Object.keys(std)}`);
  }, "MAJOR");
  await st("R-20", "AuditLog ทุกการเขียน (CC §8): หลังชุด R มีแถว action hotel.* ครอบ แผน/ฤดู/วันหยุด/ราคา/override/กฎยกเลิก (≥ 6 action ต่างกัน) · ทุกแถวมี before หรือ after · ไม่มี PII (ชื่อแขก/เบอร์)", async () => {
    needH0();
    const rows = await prisma.auditLog.findMany({ where: { tenantId: tA, action: { startsWith: "hotel." } } });
    const acts = new Set(rows.map((r: Any) => r.action));
    ok(acts.size >= 6, `action ต่างกัน ${acts.size}: ${[...acts].join(", ")}`);
    ok(rows.every((r: Any) => r.before !== null || r.after !== null), "แถวไม่มี before/after");
    const txt = J(rows.map((r: Any) => [r.before, r.after]));
    ok(!/ผู้เข้าพักทดสอบ|guestName|guestPhone|guestEmail/.test(txt), "PII ใน AuditLog");
  }, "MAJOR");

  // ═══════════════ B ด่าน / ข้ามร้าน / สิทธิ์ (X1 · X9 · X10) ═══════════════
  console.log("\n── B ด่าน/ข้ามร้าน/สิทธิ์ ──");
  const noPlanRows = async (unitId: string, tid: string) => prisma.hotelRatePlan.count({ where: { tenantId: tid, unitId } });
  await st("B-1", "ด่าน HOTEL: หน่วย DORM เรียก listRatePlans/saveRatePlan/saveSeason/ratePreview ⇒ NOT_FOUND (ไม่ auto-create แผน · ไม่ throw)", async () => {
    needH0();
    for (const [n, f] of [["list", () => RT("listRatePlans")(OWNER, ctxA, { unitId: UD })], ["save", () => RT("saveRatePlan")(OWNER, ctxA, { unitId: UD, code: "STANDARD", name: "x" })], ["season", () => RT("saveSeason")(OWNER, ctxA, { unitId: UD, name: "x", dateStart: "2026-12-01", dateEnd: "2026-12-02", priority: 1 })]] as [string, () => Promise<Any>][]) {
      const r = await f(); eq(failCode(r), "NOT_FOUND", `${n} ${J(r)}`);
    }
    const pv = await RT("ratePreview")(ctxA, UD, { from: TODAY_R, to: inWin(3) });
    ok(pv && (pv.ok === false || (Array.isArray(pv.days) && pv.days.every((d: Any) => !Object.keys(d.byType ?? {}).length))), `preview DORM ${J(pv).slice(0, 100)}`);
    eq(await noPlanRows(UD, tA), 0, "สร้างแผนให้หอ");
  });
  await st("B-2", "X1 ข้ามร้าน: เจ้าของร้าน B ขอหน่วยโรงแรมร้าน A (list/save/matrix/preview) ⇒ NOT_FOUND · ไม่มีแถวใหม่ · เจ้าของ A ขอหน่วยร้าน B ⇒ NOT_FOUND", async () => {
    needH0();
    const n0 = await prisma.hotelRatePlan.count({ where: { unitId: UH } });
    eq(failCode(await RT("listRatePlans")(OWNER_B, ctxB, { unitId: UH })), "NOT_FOUND", "B list A");
    eq(failCode(await RT("saveRatePlan")(OWNER_B, ctxB, { unitId: UH, code: "HACK", name: "x" })), "NOT_FOUND", "B save A");
    eq(failCode(await RT("getRateMatrix")(OWNER_B, ctxB, { unitId: UH, ratePlanId: ids.std })), "NOT_FOUND", "B matrix A");
    const pv = await RT("ratePreview")(ctxB, UH, { from: TODAY_R, to: inWin(3) });
    ok(pv && (pv.ok === false || (Array.isArray(pv.days) && pv.days.every((d: Any) => !Object.keys(d.byType ?? {}).length))), `preview ข้ามร้าน ${J(pv).slice(0, 100)}`);
    eq(await prisma.hotelRatePlan.count({ where: { unitId: UH } }), n0, "แถวใหม่");
    eq(failCode(await RT("listRatePlans")(OWNER, ctxA, { unitId: UHB })), "NOT_FOUND", "A list B");
    eq(await prisma.hotelRatePlan.count({ where: { unitId: UHB } }), 0, "auto-create ให้ร้าน B");
  });
  await st("B-3", "X1 ข้ามหน่วย/ร้านใน input: saveRates ด้วย roomTypeId หน่วยอื่น (UH2) ⇒ NOT_FOUND · setOverride ด้วย roomTypeId ร้าน B ⇒ NOT_FOUND · ไม่มีแถวใหม่ · ไม่รั่วชื่อประเภทในเหตุผล", async () => {
    needH0();
    const n0 = [await prisma.hotelRate.count({ where: { tenantId: tA } }), await prisma.hotelRateOverride.count()];
    const a = await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows: [{ roomTypeId: RT_U2, seasonId: null, priceWeekdaySatang: 1, priceWeekendSatang: 1, priceHolidaySatang: null }] });
    eq(failCode(a), "NOT_FOUND", `saveRates ${J(a)}`);
    const b = await RT("setOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RT_B, ratePlanId: null, date: inWin(2), priceSatang: 1, reason: "x" });
    eq(failCode(b), "NOT_FOUND", `override ${J(b)}`);
    eq([await prisma.hotelRate.count({ where: { tenantId: tA } }), await prisma.hotelRateOverride.count()], n0, "แถวใหม่");
    ok(!J([a, b]).includes(RT_B) && !J([a, b]).includes(RT_U2), "รั่ว id ในคำตอบ");
  });
  await st("B-4", "X1 แผนราคาร้าน B ใน input ของร้าน A: สร้างแผนบนร้าน B ตรง ⇒ saveRates/saveCancelRules/getRateMatrix/setOverride(ratePlanId) ด้วย id นั้น ⇒ NOT_FOUND · แผน/ฤดู/วันหยุดร้าน B ไม่โผล่ใน loadPricingContext ของ A", async () => {
    needH0();
    const pb = await prisma.hotelRatePlan.create({ data: { tenantId: tB, unitId: UHB, code: "STANDARD", name: "ร้าน B", isDefault: true } });
    await prisma.hotelSeason.create({ data: { tenantId: tB, unitId: UHB, name: "ฤดูร้าน B", dateStart: dbDate(inWin(1)), dateEnd: dbDate(inWin(9)), priority: 99 } });
    await prisma.hotelHoliday.create({ data: { tenantId: tB, unitId: UHB, date: dbDate(inWin(4)), name: "หยุดร้าน B" } });
    eq(failCode(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: pb.id, rows: rowsFor("standard", null, null) })), "NOT_FOUND", "saveRates");
    eq(failCode(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: pb.id, rules: Q2_RULES })), "NOT_FOUND", "cancelRules");
    eq(failCode(await RT("getRateMatrix")(OWNER, ctxA, { unitId: UH, ratePlanId: pb.id })), "NOT_FOUND", "matrix");
    eq(failCode(await RT("setOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, ratePlanId: pb.id, date: inWin(2), priceSatang: 1, reason: "x" })), "NOT_FOUND", "override");
    eq(await prisma.hotelRate.count({ where: { ratePlanId: pb.id } }), 0, "แถวบนแผนร้าน B");
    const c = await RT("loadPricingContext")(ctxA, UH, { from: TODAY_R, to: inWin(13) });
    ok(!c.plans.some((p: Any) => p.id === pb.id) && !c.seasons.some((s: Any) => s.name === "ฤดูร้าน B") && !c.holidays.has(inWin(4)), "ข้อมูลร้าน B รั่วใน ctx ของ A");
  });
  await st("B-5", "X9 สิทธิ์อ่าน: STAFF hotel.rates.read (frontdesk) อ่านได้ (list/matrix/seasons) · เขียนทุกตัว ⇒ ปฏิเสธ (FORBIDDEN/NO_PERMISSION) ไม่มีแถวใหม่: saveRatePlan · archiveRatePlan · saveCancelRules · saveSeason · saveHolidays · saveRates · setOverride · clearOverride", async () => {
    needH0();
    okRes(await RT("listRatePlans")(READER, ctxA, { unitId: UH }), "list");
    okRes(await RT("getRateMatrix")(READER, ctxA, { unitId: UH, ratePlanId: ids.std }), "matrix");
    okRes(await RT("listSeasons")(READER, ctxA, { unitId: UH }), "seasons");
    const snap = async () => J([await prisma.hotelRatePlan.count({ where: { tenantId: tA } }), await prisma.hotelSeason.count({ where: { tenantId: tA } }), await prisma.hotelHoliday.count({ where: { tenantId: tA } }), await prisma.hotelRate.count({ where: { tenantId: tA } }), await prisma.hotelRateOverride.count({ where: { tenantId: tA } }), await prisma.hotelCancelRule.count()]);
    const s0 = await snap();
    const writes: [string, () => Promise<Any>][] = [
      ["saveRatePlan", () => RT("saveRatePlan")(READER, ctxA, { unitId: UH, code: "RD", name: "x" })],
      ["archiveRatePlan", () => RT("archiveRatePlan")(READER, ctxA, { unitId: UH, id: ids.bf })],
      ["saveCancelRules", () => RT("saveCancelRules")(READER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: [{ daysBefore: 0, refundBp: 0 }] })],
      ["saveSeason", () => RT("saveSeason")(READER, ctxA, { unitId: UH, name: "x", dateStart: "2026-12-01", dateEnd: "2026-12-02", priority: 1 })],
      ["saveHolidays", () => RT("saveHolidays")(READER, ctxA, { unitId: UH, dates: [inWin(20)], name: "x" })],
      ["saveRates", () => RT("saveRates")(READER, ctxA, { unitId: UH, ratePlanId: ids.std, rows: rowsFor("standard", null, null) })],
      ["setOverride", () => RT("setOverride")(READER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, ratePlanId: null, date: inWin(7), priceSatang: 1, reason: "x" })],
      ["clearOverride", () => RT("clearOverride")(READER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, ratePlanId: null, date: ids.ovDate })],
    ];
    const bad: string[] = [];
    for (const [n, f] of writes) { const r = await f(); if (!isDenied(r)) bad.push(`${n}=${codeOf(r)}`); }
    eq(bad, [], "เขียนผ่านทั้งที่ไม่มีสิทธิ์");
    eq(await snap(), s0, "แถวเปลี่ยน");
    eq((await prisma.hotelRateOverride.findFirst({ where: { tenantId: tA, roomTypeId: RTA.dlx } }))?.priceSatang, 169_000, "override เดิมหาย");
  });
  await st("B-6", "X9 สิทธิ์เขียน: STAFF hotel.rates.write เขียนได้ (saveSeason + setOverride + clear) · MANAGER คุมหน่วยเขียนได้ · OWNER ได้ · STAFF ไม่มีสิทธิ์โรงแรมราคาเลย ⇒ อ่านก็ไม่ได้ · STAFF ของหน่วยอื่น (unitAccess UH2) ⇒ NOT_FOUND/ปฏิเสธ", async () => {
    needH0();
    okRes(await RT("saveSeason")(WRITER, ctxA, { unitId: UH, name: "โดยพนักงาน", dateStart: inWin(70), dateEnd: inWin(72), priority: 1 }), "writer season");
    okRes(await RT("setOverride")(MGR, ctxA, { unitId: UH, roomTypeId: RTA.sup, ratePlanId: null, date: inWin(8), priceSatang: 109_000, reason: "ผู้จัดการ" }), "manager override");
    okRes(await RT("clearOverride")(WRITER, ctxA, { unitId: UH, roomTypeId: RTA.sup, ratePlanId: null, date: inWin(8) }), "writer clear");
    const none = await RT("listRatePlans")(NONE, ctxA, { unitId: UH });
    ok(none?.ok === false, `ไม่มีสิทธิ์อ่านได้: ${J(none).slice(0, 80)}`);
    const other: Actor = { ...WRITER, unitAccess: [UH2] };
    ok((await RT("saveSeason")(other, ctxA, { unitId: UH, name: "x", dateStart: inWin(70), dateEnd: inWin(72), priority: 1 }))?.ok === false, "staff หน่วยอื่นเขียนได้");
  });
  await st("B-7", "X10 ไม่มี PII ในโมเดลราคา: JSON ของ loadPricingContext · ratePreview · listRatePlans · getRateMatrix ไม่มีคีย์ guest*/phone/email/idNumber และไม่มีข้อความ «ผู้เข้าพักทดสอบ»", async () => {
    needH0();
    const blobs = [await RT("loadPricingContext")(ctxA, UH, { from: TODAY_R, to: inWin(13) }), await RT("ratePreview")(ctxA, UH, { from: TODAY_R, to: inWin(13) }), await RT("listRatePlans")(OWNER, ctxA, { unitId: UH }), await RT("getRateMatrix")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std })];
    const keys = new Set<string>();
    const walk = (v: Any) => { if (v instanceof Set) return; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); } };
    walk(blobs);
    const bad = [...keys].filter((k) => /guest|phone|email|idNumber|passport|customer/i.test(k));
    eq(bad, [], "คีย์ PII");
    ok(!J(blobs.map((b) => (b?.holidays instanceof Set ? { ...b, holidays: [...b.holidays] } : b))).includes("ผู้เข้าพักทดสอบ"), "ชื่อแขกรั่ว");
  });
  await st("B-8", "ด่านไม่เชื่อ input: saveRates/getRateMatrix ด้วย ratePlanId ของหน่วย UH2 (ร้านเดียวกัน คนละหน่วย) ⇒ NOT_FOUND · removeHoliday วันที่ไม่มี ⇒ ok (idempotent) หรือ NOT_FOUND ไม่ throw · archiveRatePlan id มั่ว ⇒ NOT_FOUND", async () => {
    needH0();
    const p2 = await planByCode(UH2, "BREAKFAST");
    eq(failCode(await RT("getRateMatrix")(OWNER, ctxA, { unitId: UH, ratePlanId: p2!.id })), "NOT_FOUND", "matrix แผนหน่วยอื่น");
    eq(failCode(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: p2!.id, rows: rowsFor("standard", null, null) })), "NOT_FOUND", "saveRates แผนหน่วยอื่น");
    const rh = await RT("removeHoliday")(OWNER, ctxA, { unitId: UH, date: inWin(300) });
    ok(rh && typeof rh.ok === "boolean", "removeHoliday throw");
    eq(failCode(await RT("archiveRatePlan")(OWNER, ctxA, { unitId: UH, id: "ไม่มี-id" })), "NOT_FOUND", "archive id มั่ว");
  }, "MAJOR");

  // ═══════════════ S ค่าตั้ง ═══════════════
  console.log("\n── S ค่าตั้งโรงแรม ──");
  const H0_KEYS: [string, unknown][] = [["rooms.hotel.bookingMode", "DEPOSIT_REQUIRED"], ["rooms.hotel.weekendDays", [5, 6]], ["rooms.hotel.dailyHousekeeping", true], ["rooms.hotel.inspectionRequired", false], ["rooms.hotel.maxAdvanceBookingDays", 365], ["rooms.hotel.codePrefix", "HR"], ["rooms.hotel.tax.mode", "INCLUSIVE"], ["rooms.hotel.tax.vatBp", 700], ["rooms.hotel.tax.serviceChargeBp", 0], ["rooms.hotel.tax.invoiceFromPos", true], ["rooms.hotel.securityDeposit.enabled", false], ["rooms.hotel.securityDeposit.appliesTo", "ALL"], ["rooms.hotel.guest.retainYears", 2], ["rooms.hotel.guest.maskIdForStaff", true], ["rooms.hotel.guest.aiIdReader", false], ["rooms.hotel.notify.channel", "EMAIL"], ["rooms.hotel.storefront.customDomain", false]];
  const CARD_KEYS: Record<string, string[]> = {
    "เช็กอิน/เอาต์": ["rooms.hotel.checkInTime", "rooms.hotel.checkOutTime", "rooms.hotel.dailyHousekeeping", "rooms.hotel.inspectionRequired"],
    "การจอง": ["rooms.hotel.bookingMode", "rooms.hotel.holdMinutesOnline", "rooms.hotel.holdMinutesCounter", "rooms.hotel.maxAdvanceBookingDays", "rooms.hotel.codePrefix", "rooms.hotel.noShow"],
    "มัดจำ & ยกเลิก": ["rooms.hotel.deposit", "rooms.hotel.cancelPolicy"],
    "ภาษี": ["rooms.hotel.tax.mode", "rooms.hotel.tax.vatBp", "rooms.hotel.tax.serviceChargeBp", "rooms.hotel.tax.invoiceFromPos"],
    "เงินประกันห้อง": ["rooms.hotel.securityDeposit.enabled", "rooms.hotel.securityDeposit", "rooms.hotel.securityDeposit.appliesTo"],
    "ผู้เข้าพัก/PDPA": ["rooms.hotel.guest.retainYears", "rooms.hotel.guest.maskIdForStaff", "rooms.hotel.guest.aiIdReader", "rooms.hotel.rr3OnScreen", "rooms.hotel.tm30ReminderHours"],
    "แจ้งแขก": ["rooms.hotel.notify.channel"],
    "หน้าจอง": ["rooms.hotel.storefront.customDomain"],
    "แม่บ้าน": ["rooms.hotel.housekeepingChecklist", "rooms.hotel.minibar"],
  };
  await st("S-1", "H.1 ยืนบน H.0 §6.1: คีย์ใหม่ 17 ตัวมี def + ค่าเริ่ม/ป้ายไทย · ไม่ซ่อน hiddenUntil PHASE_H · deposit schema รับ FIXED_AMOUNT+amountSatang · cancelPolicy ค่าเริ่ม Q2 3 ขั้น · editPermission ทุกคีย์ rooms.hotel.* = hotel.settings.edit", () => {
    const bad: string[] = [];
    for (const [k, def] of H0_KEYS) { const d = SET?.getDef?.(k); if (!d) { bad.push(`${k} ไม่มี`); continue; } if (!isDeepStrictEqual(d.defaults?._fallback, def)) bad.push(`${k} ค่าเริ่ม ${J(d.defaults?._fallback)}`); if (!THAI.test(d.labelTh ?? "")) bad.push(`${k} ป้าย`); if (d.hiddenUntil === "PHASE_H") bad.push(`${k} ยังซ่อน`); }
    const dep = SET?.getDef?.("rooms.hotel.deposit");
    if (!dep?.schema?.safeParse?.({ kind: "FIXED_AMOUNT", amountSatang: 50_000 })?.success) bad.push("deposit ไม่รับ FIXED_AMOUNT");
    const cp = SET?.getDef?.("rooms.hotel.cancelPolicy");
    if (!isDeepStrictEqual(cp?.defaults?._fallback, Q2_RULES)) bad.push(`cancelPolicy ค่าเริ่ม ${J(cp?.defaults?._fallback)}`);
    for (const d of (SET?.listDefs?.() ?? []) as Any[]) if (d.key.startsWith("rooms.hotel.") && d.editPermission !== "hotel.settings.edit") bad.push(`${d.key} editPermission=${d.editPermission}`);
    if (SET?.getDef?.("rooms.hotel.checkInTime")?.hiddenUntil === "PHASE_H") bad.push("คีย์เดิมยังซ่อน PHASE_H");
    eq(bad, [], "H.0 §6.1");
  });
  await st("S-2", "loadHotelSettings(owner · หน่วย HOTEL) คืนการ์ด 9 ใบตาม §6 (ป้ายไทย · fieldKeys ครอบคีย์ของการ์ด) · form.scope UNIT · ทุก field มี editable/lockedReasonTh/ownerOnly · canEdit true สำหรับเจ้าของ · หน่วย DORM ⇒ null/NOT_FOUND", async () => {
    needH0();
    const m = await HS("loadHotelSettings")(OWNER, ctxA, { unitId: UH });
    ok(m && Array.isArray(m.cards), `โมเดล ${J(m).slice(0, 120)}`);
    const labels = (m.cards as Any[]).map((c) => c.labelTh);
    const miss = Object.keys(CARD_KEYS).filter((l) => !labels.some((x: string) => x.replace(/\s+/g, "") === l.replace(/\s+/g, "")));
    eq(miss, [], `การ์ดขาด (มี: ${labels.join(" · ")})`);
    const bad: string[] = [];
    for (const [l, keys] of Object.entries(CARD_KEYS)) { const c = (m.cards as Any[]).find((x) => x.labelTh.replace(/\s+/g, "") === l.replace(/\s+/g, "")); for (const k of keys) if (!(c?.fieldKeys ?? []).includes(k)) bad.push(`${l}:${k}`); }
    eq(bad, [], "คีย์ในการ์ด");
    eq(m.form?.scope, "UNIT", "scope");
    const fields = (m.form?.groups ?? []).flatMap((g: Any) => g.fields) as Any[];
    ok(fields.length >= 20 && fields.every((f) => typeof f.editable === "boolean" && "lockedReasonTh" in f && typeof f.ownerOnly === "boolean"), `fields ${fields.length}`);
    ok(m.canEdit === true, "canEdit เจ้าของ");
    const d = await HS("loadHotelSettings")(OWNER, ctxA, { unitId: UD });
    ok(d === null || d?.ok === false, `หอต้อง null/ไม่ผ่าน ได้ ${J(d).slice(0, 80)}`);
  });
  await st("S-3", "saveHotelSettings ชั้น UNIT: ตั้ง maxAdvanceBookingDays 180 + tax.serviceChargeBp 1000 ⇒ resolveSetting = ค่าใหม่ source UNIT · settingHistory มีแถว before/after · loadPricingContext ไม่กระทบ (ค่าอื่น) · ค่านอกช่วง (731) ⇒ VALIDATION ไม่เขียน", async () => {
    needH0();
    const r = await HS("saveHotelSettings")(OWNER, ctxA, { unitId: UH, changes: [{ key: "rooms.hotel.maxAdvanceBookingDays", scope: "UNIT", scopeId: UH, value: 180 }, { key: "rooms.hotel.tax.serviceChargeBp", scope: "UNIT", scopeId: UH, value: 1000 }] });
    okRes(r, "save");
    const a = await SET.resolveSetting(ctxA, "rooms.hotel.maxAdvanceBookingDays", { unitId: UH });
    eq([a.value, a.source], [180, "UNIT"], "maxAdvance");
    eq((await SET.resolveSetting(ctxA, "rooms.hotel.tax.serviceChargeBp", { unitId: UH })).value, 1000, "sc");
    const h = await SET.settingHistory(ctxA, { unitId: UH, key: "rooms.hotel.maxAdvanceBookingDays" });
    ok(h.length >= 1 && h[0].after === 180, `history ${J(h[0])}`);
    const bad = await HS("saveHotelSettings")(OWNER, ctxA, { unitId: UH, changes: [{ key: "rooms.hotel.maxAdvanceBookingDays", scope: "UNIT", scopeId: UH, value: 731 }] });
    ok(bad?.ok === false, `731 ต้องไม่ผ่าน ${J(bad)}`);
    eq((await SET.resolveSetting(ctxA, "rooms.hotel.maxAdvanceBookingDays", { unitId: UH })).value, 180, "ยัง 180");
  });
  await st("S-4", "scope RATE_PLAN ใช้ได้จริง (H.0 §6.3 · §6 ช่อง «ตั้งเฉพาะแผน»): ตั้ง rooms.hotel.cancelPolicy ที่ชั้น RATE_PLAN ของ BREAKFAST ⇒ resolveSetting({unitId, ratePlanId}) = ค่านั้น source RATE_PLAN · แผนอื่น (STANDARD) ยังค่าเริ่ม · ratePlanId ร้าน B ⇒ ไม่ผ่าน (NOT_FOUND/SCOPE)", async () => {
    needH0();
    const rules = [{ daysBefore: 1, refundBp: 10_000 }, { daysBefore: 0, refundBp: 0 }];
    const r = await HS("saveHotelSettings")(OWNER, ctxA, { unitId: UH, changes: [{ key: "rooms.hotel.cancelPolicy", scope: "RATE_PLAN", scopeId: ids.bf, value: rules }] });
    okRes(r, "save RATE_PLAN");
    const a = await SET.resolveSetting(ctxA, "rooms.hotel.cancelPolicy", { unitId: UH, ratePlanId: ids.bf });
    eq([a.value, a.source], [rules, "RATE_PLAN"], "BREAKFAST");
    eq((await SET.resolveSetting(ctxA, "rooms.hotel.cancelPolicy", { unitId: UH, ratePlanId: ids.std })).value, Q2_RULES, "STANDARD ค่าเริ่ม");
    const pb = await prisma.hotelRatePlan.findFirst({ where: { tenantId: tB } });
    const x = await HS("saveHotelSettings")(OWNER, ctxA, { unitId: UH, changes: [{ key: "rooms.hotel.cancelPolicy", scope: "RATE_PLAN", scopeId: pb.id, value: rules }] });
    ok(x?.ok === false, `แผนร้าน B ผ่าน ${J(x)}`);
    eq(await prisma.settingValue.count({ where: { tenantId: tA, scope: "RATE_PLAN", scopeId: pb.id } }), 0, "เขียนข้ามร้าน");
  });
  await st("S-5", "คืนค่าเริ่มต้น: resetHotelSetting/ resetSetting(key maxAdvanceBookingDays · UNIT) ⇒ resolve กลับ 365 source ไม่ใช่ UNIT · reset RATE_PLAN cancelPolicy ⇒ กลับ Q2 · history มีแถว after = null", async () => {
    needH0();
    const resetFn = typeof hsL.mod?.resetHotelSetting === "function" ? (t: Any) => hsL.mod.resetHotelSetting(OWNER, ctxA, { unitId: UH, ...t }) : (t: Any) => SET.resetSetting(OWNER, ctxA, t);
    okRes(await resetFn({ key: "rooms.hotel.maxAdvanceBookingDays", scope: "UNIT", scopeId: UH }), "reset UNIT");
    const a = await SET.resolveSetting(ctxA, "rooms.hotel.maxAdvanceBookingDays", { unitId: UH });
    ok(a.value === 365 && a.source !== "UNIT", `หลัง reset ${J(a)}`);
    okRes(await resetFn({ key: "rooms.hotel.cancelPolicy", scope: "RATE_PLAN", scopeId: ids.bf }), "reset RATE_PLAN");
    eq((await SET.resolveSetting(ctxA, "rooms.hotel.cancelPolicy", { unitId: UH, ratePlanId: ids.bf })).value, Q2_RULES, "กลับ Q2");
    const h = await SET.settingHistory(ctxA, { unitId: UH, key: "rooms.hotel.maxAdvanceBookingDays" });
    ok(h.some((x: Any) => x.after === null && x.before === 180), `history reset ${J(h.slice(0, 2))}`);
  });
  await st("S-6", "ownerOnly/sensitivity ตาม def: ทุก field ของ loadHotelSettings มี ownerOnly = isOwnerOnly(def) และ sensitivity = def.sensitivity · STAFF hotel.settings.edit: ตั้ง checkInTime ได้ · ตั้งคีย์ MONEY (tax.vatBp) ได้ตาม editPermission · ตั้งคีย์ ownerOnly/LEGAL ⇒ PERMISSION", async () => {
    needH0();
    const m = await HS("loadHotelSettings")(OWNER, ctxA, { unitId: UH });
    const fields = (m.form.groups as Any[]).flatMap((g) => g.fields) as Any[];
    const bad = fields.filter((f) => f.ownerOnly !== !!SET.isOwnerOnly(SET.getDef(f.key)) || (f.sensitivity ?? null) !== (SET.getDef(f.key)?.sensitivity ?? null)).map((f) => f.key);
    eq(bad, [], "ป้ายไม่ตรง def");
    okRes(await HS("saveHotelSettings")(SEDIT, ctxA, { unitId: UH, changes: [{ key: "rooms.hotel.checkInTime", scope: "UNIT", scopeId: UH, value: "15:00" }] }), "staff checkInTime");
    eq((await SET.resolveSetting(ctxA, "rooms.hotel.checkInTime", { unitId: UH })).value, "15:00", "15:00");
    okRes(await HS("saveHotelSettings")(SEDIT, ctxA, { unitId: UH, changes: [{ key: "rooms.hotel.tax.vatBp", scope: "UNIT", scopeId: UH, value: 700 }] }), "staff MONEY");
    const oo = fields.find((f) => f.ownerOnly && f.key.startsWith("rooms."));
    if (oo) { const r = await HS("saveHotelSettings")(SEDIT, ctxA, { unitId: UH, changes: [{ key: oo.key, scope: "UNIT", scopeId: UH, value: oo.value }] }); ok(r?.ok === false && (r.code === "PERMISSION" || isDenied(r)), `ownerOnly ${oo.key} ${J(r)}`); }
    okRes(await SET.resetSetting(OWNER, ctxA, { key: "rooms.hotel.checkInTime", scope: "UNIT", scopeId: UH }), "คืนค่า");
  });
  await st("S-7", "สิทธิ์จอตั้งค่า: STAFF ไม่มี hotel.settings.edit (frontdesk) ⇒ saveHotelSettings PERMISSION ไม่เขียน · loadHotelSettings ให้ canEdit false (หรือ null) · เจ้าของร้าน B ⇒ null/NOT_FOUND", async () => {
    needH0();
    const n0 = await prisma.settingValue.count({ where: { tenantId: tA } });
    const r = await HS("saveHotelSettings")(READER, ctxA, { unitId: UH, changes: [{ key: "rooms.hotel.checkInTime", scope: "UNIT", scopeId: UH, value: "16:00" }] });
    ok(r?.ok === false && (r.code === "PERMISSION" || isDenied(r)), `frontdesk เขียนได้ ${J(r)}`);
    eq(await prisma.settingValue.count({ where: { tenantId: tA } }), n0, "เขียน");
    const m = await HS("loadHotelSettings")(READER, ctxA, { unitId: UH });
    ok(m === null || m?.ok === false || m.canEdit === false, `frontdesk canEdit ${J(m?.canEdit)}`);
    const b = await HS("loadHotelSettings")(OWNER_B, ctxB, { unitId: UH });
    ok(b === null || b?.ok === false, "ร้าน B เห็นค่าตั้ง A");
  });
  await st("S-8", "เปลี่ยน tax.mode ไม่กระทบ taxSnapshot เดิม (มติ 6): ตั้ง EXCLUSIVE ⇒ HotelReservation ไม่ถูกเขียน (count/updatedAt/taxSnapshot ของการจอง R-5 เท่าเดิม) · resolve = EXCLUSIVE · ตั้งกลับ INCLUSIVE", async () => {
    needH0();
    const before = await prisma.hotelReservation.findUnique({ where: { id: ids.res } });
    const n0 = await prisma.hotelReservation.count({ where: { tenantId: tA } });
    okRes(await HS("saveHotelSettings")(OWNER, ctxA, { unitId: UH, changes: [{ key: "rooms.hotel.tax.mode", scope: "UNIT", scopeId: UH, value: "EXCLUSIVE" }] }), "EXCLUSIVE");
    eq((await SET.resolveSetting(ctxA, "rooms.hotel.tax.mode", { unitId: UH })).value, "EXCLUSIVE", "resolve");
    const after = await prisma.hotelReservation.findUnique({ where: { id: ids.res } });
    eq([await prisma.hotelReservation.count({ where: { tenantId: tA } }), after.taxSnapshot, String(after.updatedAt)], [n0, { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 0 }, String(before.updatedAt)], "การจองเดิม");
    okRes(await HS("saveHotelSettings")(OWNER, ctxA, { unitId: UH, changes: [{ key: "rooms.hotel.tax.mode", scope: "UNIT", scopeId: UH, value: "INCLUSIVE" }] }), "กลับ");
  });
  await st("S-9", "loadHotelSettings สะท้อนค่าที่ตั้ง: หลังตั้ง tax.serviceChargeBp 1000 (S-3) field.value = 1000 · hasOwn true · differsFromTemplate · การ์ดภาษีมีคำเตือน «การจองเดิมใช้ค่าตอนจอง» / มัดจำมี «แผนราคาทับค่านี้ได้» (ข้อความในโมเดลหรือ shared)", async () => {
    needH0();
    const m = await HS("loadHotelSettings")(OWNER, ctxA, { unitId: UH });
    const f = (m.form.groups as Any[]).flatMap((g) => g.fields).find((x: Any) => x.key === "rooms.hotel.tax.serviceChargeBp");
    ok(f && f.value === 1000 && f.hasOwn === true, `field ${J(f)}`);
    const txt = J(m) + read(F.hsShared) + read(F.hsComp);
    ok(txt.includes("การจองเดิมใช้ค่าตอนจอง"), "ไม่มีคำเตือนภาษี");
    ok(txt.includes("แผนราคาทับค่านี้ได้"), "ไม่มีป้ายมัดจำ");
    okRes(await SET.resetSetting(OWNER, ctxA, { key: "rooms.hotel.tax.serviceChargeBp", scope: "UNIT", scopeId: UH }), "คืนค่า");
  }, "MAJOR");
  await st("S-10", "snapshotPolicy kind reservation (H.0 §6.2) ครอบคีย์ภาษี 3 ตัว + rounding + deposit + cancelPolicy ⇒ H.3 จด taxSnapshot ได้จากค่าตั้งสด · fromSnapshot อ่านกลับได้", async () => {
    needH0();
    const snap = await SET.snapshotPolicy(ctxA, "reservation", { unitId: UH });
    const keys = ["rooms.hotel.tax.mode", "rooms.hotel.tax.vatBp", "rooms.hotel.tax.serviceChargeBp", "rooms.money.rounding", "rooms.hotel.deposit", "rooms.hotel.cancelPolicy"];
    const miss = keys.filter((k) => SET.fromSnapshot(snap, k) === undefined);
    eq(miss, [], `snapshot ขาด (keys ${J(Object.keys(snap?.values ?? snap ?? {})).slice(0, 200)})`);
    eq(SET.fromSnapshot(snap, "rooms.hotel.tax.mode"), "INCLUSIVE", "mode");
  }, "MAJOR");

  // ═══════════════ U UI สถิต ═══════════════
  console.log("\n── U UI สถิต ──");
  await st("U-1", "ไฟล์ของใบครบ (§1): pricing · rates · hotel-settings · index · RatesScreen · rates-shared · HotelSettings · hotel-settings-shared · HotelTabs · hotel-tabs-shared · layout · rates/page · settings/page · ฉาก · docs/sds/modules/hotel.md", () => {
    const need = [F.pricing, F.rates, F.hsettings, F.index, F.ratesScreen, F.ratesShared, F.hsComp, F.hsShared, F.tabs, F.tabsShared, F.layout, F.ratesPage, F.settingsPage, F.scene, F.sds];
    eq(need.filter((f) => !has(f)), [], "ขาด");
  });
  await st("U-2", "ไทยทั้งหมด: ข้อความที่ผู้ใช้เห็นใน RatesScreen/HotelSettings/HotelTabs/2 หน้า ไม่มีคำอังกฤษ (ยกเว้นโค้ด/ชื่อเฉพาะ VAT · OTA · LINE · PDPA · POS)", () => {
    const bad: string[] = [];
    for (const f of [F.ratesScreen, F.hsComp, F.tabs, F.ratesPage, F.settingsPage]) { const s = read(f); if (!s) { bad.push(`${f}: ยังไม่มี`); continue; } const en = englishInJsx(s); if (en.length) bad.push(`${f}: ${en.slice(0, 6).join(", ")}`); }
    eq(bad, [], "อังกฤษ");
  });
  await st("U-3", "hotel-tabs-shared (pure): HOTEL_TABS 7 แท็บเรียงตามภาพ (ปฏิทินห้อง /hotel/calendar · การจอง /hotel/reservations · หน้าเคาน์เตอร์ /hotel · แม่บ้าน /hotel/housekeeping · ราคา /hotel/rates · รายงาน /hotel/reports · ตั้งค่า /hotel/settings) · available: ราคา/ตั้งค่า/การจอง/หน้าเคาน์เตอร์ true · ปฏิทิน/แม่บ้าน/รายงาน false (ใบยังไม่มา)", () => {
    const tabs = valOf(tabsSharedL, "HOTEL_TABS", F.tabsShared) as Any[];
    eq(tabs.map((t) => [t.labelTh, t.path]), [["ปฏิทินห้อง", "/hotel/calendar"], ["การจอง", "/hotel/reservations"], ["หน้าเคาน์เตอร์", "/hotel"], ["แม่บ้าน", "/hotel/housekeeping"], ["ราคา", "/hotel/rates"], ["รายงาน", "/hotel/reports"], ["ตั้งค่า", "/hotel/settings"]], "ลำดับ/ป้าย/path");
    eq(tabs.map((t) => t.available), [false, true, true, false, true, false, true], "available");
    ok(tabs.every((t) => typeof t.key === "string"), "key");
    const s = stripComments(read(F.tabsShared));
    ok(!/["']use (client|server)["']/.test(s) && !/^\s*import\s/m.test(s), "shared ต้อง pure (ไม่มี directive/import)");
  });
  await st("U-4", "hotelTabsFor ตามสิทธิ์ (§7): ซ่อน available:false · ราคา ⇔ ratesRead · ตั้งค่า ⇔ settingsEdit · frontdesk (ratesRead true · settingsEdit false) ⇒ การจอง · หน้าเคาน์เตอร์ · ราคา · ไม่มีสิทธิ์เลย ⇒ แท็บฐาน (การจอง/หน้าเคาน์เตอร์) หรือว่าง · href = base + path · ผลเป็น {key,labelTh,href}", () => {
    const f = fnOf(tabsSharedL, "hotelTabsFor", F.tabsShared);
    const base = "/app/u/bansuan-hotel";
    const fd = f({ ratesRead: true, settingsEdit: false }, base) as Any[];
    eq(fd.map((t) => t.labelTh), ["การจอง", "หน้าเคาน์เตอร์", "ราคา"], "frontdesk");
    ok(fd.every((t) => t.href.startsWith(base) && typeof t.key === "string"), "href/key");
    const own = f({ ratesRead: true, settingsEdit: true }, base) as Any[];
    eq(own.map((t) => t.labelTh), ["การจอง", "หน้าเคาน์เตอร์", "ราคา", "ตั้งค่า"], "เจ้าของ");
    const none = f({ ratesRead: false, settingsEdit: false }, base) as Any[];
    ok(!none.some((t) => t.labelTh === "ราคา" || t.labelTh === "ตั้งค่า"), "ไม่มีสิทธิ์เห็นราคา/ตั้งค่า");
    ok(!own.some((t) => ["ปฏิทินห้อง", "แม่บ้าน", "รายงาน"].includes(t.labelTh)), "แท็บที่ยังไม่มีหน้าโผล่");
  });
  await st("U-5", "HotelTabs.tsx แบบ DormTabs ทุกประการ: 'use client' · <nav data-hotel-tabs aria-label ไทย> · print:hidden · useSyncExternalStore (location หลัง mount) · ไม่ใช้ next/navigation · <a data-tab aria-current> · ว่าง ⇒ null", () => {
    const s = read(F.tabs);
    ok(s, "ยังไม่มี HotelTabs.tsx");
    const need: [string, RegExp][] = [["use client", /^\s*["']use client["']/m], ["data-hotel-tabs", /data-hotel-tabs/], ["aria-label ไทย", /aria-label=["'][^"']*[฀-๿]/], ["print:hidden", /print:hidden/], ["useSyncExternalStore", /useSyncExternalStore/], ["data-tab", /data-tab=/], ["aria-current", /aria-current/], ["overflow-x-auto", /overflow-x-auto/]];
    eq(need.filter(([, re]) => !re.test(s)).map(([n]) => n), [], "ขาด");
    ok(!/next\/navigation|usePathname|useRouter/.test(s), "ใช้ hook ของ Next");
  });
  await st("U-6", "layout โมดูลโรงแรม: requireUnit · \"HOTEL\" · notFound · HotelTabs · hotelTabsFor · สิทธิ์จาก evaluate/assertCan ด้วยคีย์ hotel.rates.read + hotel.settings.edit (ไม่อ่านจาก URL)", () => {
    const s = stripComments(read(F.layout));
    ok(s, "ยังไม่มี layout.tsx");
    const miss = ["requireUnit", "\"HOTEL\"", "notFound", "HotelTabs", "hotelTabsFor", "hotel.rates.read", "hotel.settings.edit"].filter((w) => !s.includes(w));
    eq(miss, [], "ขาด");
    ok(!/searchParams/.test(s), "อ่าน searchParams");
  });
  await st("U-7", "หน้า /hotel/rates + /hotel/settings: requireUnit · \"HOTEL\" · notFound · import ผ่าน facade @/lib/modules/hotel (ไม่ชี้ rates.ts/hotel-settings.ts ตรง) · หน้า rates ส่งสิทธิ์เขียนจาก hotel.rates.write · หน้า settings ใช้ loadHotelSettings + action save/reset ของโรงแรม", () => {
    const r = stripComments(read(F.ratesPage)), sp = stripComments(read(F.settingsPage));
    ok(r && sp, "ยังไม่มีหน้า");
    const bad: string[] = [];
    for (const [n, s] of [["rates", r], ["settings", sp]] as [string, string][]) for (const w of ["requireUnit", "\"HOTEL\"", "notFound"]) if (!s.includes(w)) bad.push(`${n}: ${w}`);
    if (/@\/lib\/modules\/hotel\/(rates|hotel-settings)["']/.test(r + sp)) bad.push("import ตรงไฟล์ server (ต้องผ่าน facade)");
    if (!r.includes("hotel.rates.write")) bad.push("rates: ไม่คำนวณสิทธิ์เขียนจาก hotel.rates.write");
    if (!/loadHotelSettings/.test(sp)) bad.push("settings: ไม่ใช้ loadHotelSettings");
    if (!/saveHotelSettingsAction/.test(sp) || !/resetHotelSettingAction/.test(sp)) bad.push("settings: ไม่ใช้ saveHotelSettingsAction/resetHotelSettingAction");
    if (/searchParams[^\n]*perm|permissions[^\n]*searchParams/.test(r + sp)) bad.push("อ่านสิทธิ์จาก URL");
    eq(bad, [], "หน้า");
  });
  await st("U-8", "จอราคา (ภาพ 15): แท็บย่อย 4 «ปฏิทินราคา · แผนราคา · ฤดู · วันพิเศษ · กติกา» · «เหลือขาย» · «แก้มือ» · «เต็ม» · «ปรับราคาหลายวัน» · «เพิ่มแผน» · «ใช้ปฏิทินวันหยุดไทย» · ตารางประเภท × 14 วัน (data-rate-grid หรือ <table) · ช่องแก้มือไฮไลต์ (class/data) · ลิงก์ไปตั้งค่าในแท็บกติกา", () => {
    const s = read(F.ratesScreen) + read(F.ratesShared);
    ok(read(F.ratesScreen), "ยังไม่มี RatesScreen.tsx");
    const miss = ["ปฏิทินราคา", "แผนราคา", "ฤดู", "วันพิเศษ", "กติกา", "เหลือขาย", "แก้มือ", "เต็ม", "ปรับราคาหลายวัน", "เพิ่มแผน", "ใช้ปฏิทินวันหยุดไทย", "/hotel/settings"].filter((w) => !s.includes(w));
    eq(miss, [], "ข้อความขาด");
    ok(/data-rate-grid|<table/.test(read(F.ratesScreen)), "ไม่มีตาราง");
    ok(/data-override|data-source|isOverride|source === ["']OVERRIDE["']/.test(read(F.ratesScreen)), "ช่องแก้มือไม่มีตัวบ่งชี้");
  });
  await st("U-9", "read-only ไม่ render ปุ่มเขียน (§5 สิทธิ์): ปุ่ม «ปรับราคาหลายวัน» «เพิ่มแผน» «ใช้ปฏิทินวันหยุดไทย» และการกดช่องแก้มือ อยู่ใต้เงื่อนไข prop (canEdit/canWrite/readOnly) ในซอร์ส · prop นั้นประกาศใน Props", () => {
    const s = stripComments(read(F.ratesScreen));
    ok(s, "ยังไม่มี RatesScreen.tsx");
    const guard = /canEdit|canWrite|readOnly|writable/;
    ok(guard.test(s), "ไม่มี prop สิทธิ์เขียน");
    const bad = ["ปรับราคาหลายวัน", "เพิ่มแผน", "ใช้ปฏิทินวันหยุดไทย"].filter((lit) => !nearWrite(s, lit, guard));
    eq(bad, [], "ปุ่มเขียนไม่มีเงื่อนไขสิทธิ์ใกล้เคียง (600 ตัวอักษรก่อนหน้า)");
    ok(/(canEdit|canWrite|readOnly|writable)\s*[?:]|\b(canEdit|canWrite|writable)\s*&&|!readOnly\s*&&|readOnly\s*\?/.test(s), "ไม่มีการใช้ prop เป็นเงื่อนไข render");
  });
  await st("U-10", "มือถือ 390 เลื่อนแนวนอนมีตัวบอก (หนี้ B.12 ห้ามซ้ำ · §11 #9): ตารางราคาอยู่ในกรอบ overflow-x-auto และมี attribute ชื่อตายตัว `data-scroll-hint` ใน RatesScreen (ข้อความ «เลื่อนดูวันถัดไป →» เป็นตัวเสริม ไม่บังคับ)", () => {
    const s = read(F.ratesScreen);
    ok(s, "ยังไม่มี RatesScreen.tsx");
    ok(/overflow-x-auto/.test(s), "ไม่มี overflow-x-auto");
    ok(/data-scroll-hint/.test(s), "ไม่มี attribute data-scroll-hint (ชื่อตายตัวตามมติ §11 #9)");
  });
  await st("U-11", "ป้ายโหมดภาษีใต้หัวข้อ (มติ 6): มีทั้ง «ราคารวมภาษี» และ «ยังไม่รวม VAT» (+ SC) เลือกตามโหมด · ตัวเลขจากค่าตั้ง (vatBp/serviceChargeBp ในสตริงแม่แบบ ไม่ฝัง 7%/10% ตายตัว)", () => {
    const s = read(F.ratesScreen) + read(F.ratesShared);
    ok(read(F.ratesScreen), "ยังไม่มี RatesScreen.tsx");
    ok(s.includes("ราคารวมภาษี"), "ไม่มี «ราคารวมภาษี»");
    ok(/ยังไม่รวม\s*VAT/.test(s), "ไม่มี «ยังไม่รวม VAT»");
    ok(/vatBp|serviceChargeBp/.test(s), "ป้ายไม่อ่านค่าตั้งภาษี");
    ok(!/ยังไม่รวม VAT 7%\s*\+\s*SC 10%["'`]/.test(stripComments(s)), "ฝัง 7%/10% ตายตัวในป้าย");
  });
  await st("U-12", "'use client' ไม่ลาก prisma: RatesScreen/HotelSettings/HotelTabs เดินกราฟ import (ค่า) ไม่ถึง @/lib/core/db · @prisma/client · rates.ts/hotel-settings.ts/service.ts (หยุดที่ขอบ \"use server\") · rates-shared/hotel-settings-shared ไม่มี import ถึง server", () => {
    const bad: string[] = [];
    for (const f of [F.ratesScreen, F.hsComp, F.tabs]) { const s = read(f); if (!s) { bad.push(`${f} ยังไม่มี`); continue; } if (!/^\s*["']use client["']/m.test(s)) bad.push(`${f} ไม่มี 'use client'`); bad.push(...clientReach(f)); }
    eq(bad, [], "เส้นลากถึง server");
  });
  await st("U-13", "\"use server\" ไม่ export type: hotel/actions.ts (+ actions ของหน้า ถ้ามี) export เฉพาะ async function · มี 12 action ของ §4.4 ในบล็อก // SVC H.1 ▸ … ◂ · ด่าน HOTEL + assertHotelCan ในทุก action ใหม่", () => {
    const s = read(F.actions);
    ok(s, "ยังไม่มี actions.ts");
    ok(/^\s*["']use server["']/m.test(s), "ไม่มี \"use server\"");
    ok(!/^export\s+(type|interface|const|let|class)\b/m.test(stripComments(s).split("\n").filter((l) => !/ReservationFormState/.test(l)).join("\n")), "export ที่ไม่ใช่ async function"); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h1-U13-p1-type): `export type ReservationFormState` ของ P1 มีอยู่ก่อนและ build ผ่านมาแล้ว — ข้อนี้คุมเฉพาะบรรทัดที่ H.1 เพิ่ม
    const blk = /SVC H\.1 ▸([\s\S]*?)◂/.exec(s)?.[1] ?? "";
    ok(blk, "ไม่มีบล็อก // SVC H.1 ▸ … ◂");
    const names = ["saveRatePlanAction", "archiveRatePlanAction", "saveCancelRulesAction", "saveSeasonAction", "archiveSeasonAction", "saveHolidaysAction", "removeHolidayAction", "saveRatesAction", "setOverrideAction", "clearOverrideAction", "saveHotelSettingsAction", "resetHotelSettingAction"];
    eq(names.filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(blk)), [], "action ขาด/อยู่นอกบล็อก");
    const fns = blk.split(/export\s+async\s+function\s+/).slice(1);
    const noGate = fns.filter((b) => !/assertHotelCan\s*\(/.test(b) || !/HOTEL/.test(b)).map((b) => b.split("(")[0]);
    eq(noGate, [], "action ไม่มีด่าน HOTEL/assertHotelCan");
  });
  await st("U-14", "UNIT_NAV.HOTEL มี /hotel/rates และ /hotel/settings (ป้ายไทย) · ของเดิม /hotel · /hotel/setup ยังอยู่", () => {
    const s = read(F.unitHome);
    const blk = /HOTEL:\s*\[([\s\S]*?)\]/.exec(s)?.[1] ?? "";
    ok(blk, "ไม่มี UNIT_NAV.HOTEL");
    eq(["/hotel\"", "/hotel/setup", "/hotel/rates", "/hotel/settings"].filter((p) => !blk.includes(p)), [], "ขาด");
    ok(!/label:\s*["'][^"']*[A-Za-z]{3,}/.test(blk.replace(/→/g, "")), "ป้ายอังกฤษ");
  });
  await st("U-15", "rates-shared: ตารางวันหยุดไทยคงที่ (≥ 10 รายการ · {date MM-DD หรือ month/day, name ไทย} · มีวันพ่อ 12-05 + สงกรานต์ 04-13) · ตัวจัดรูปเงิน round-trip: 123,450 → «1,234.50» · 129,000 → «1,290» (ไม่มี .00) · 1,690,000 → «16,900»", () => {
    const mod = ratesSharedL.mod;
    ok(mod, ratesSharedL.err);
    const lists = Object.values(mod).filter((v) => Array.isArray(v) && v.length >= 10 && v.every((x: Any) => x && typeof x === "object" && typeof x.name === "string")) as Any[][];
    ok(lists.length >= 1, "ไม่มีตารางวันหยุดไทย (array ≥ 10 ที่มี name)");
    const txt = J(lists);
    ok(/12-05|"month":12[^}]*"day":5/.test(txt) && /04-13|"month":4[^}]*"day":13/.test(txt), "ขาดวันพ่อ/สงกรานต์");
    ok(lists.some((l) => l.every((x) => THAI.test(x.name))), "ชื่อวันหยุดไม่ไทย");
    const fns = Object.values(mod).filter((v) => typeof v === "function") as ((...a: Any[]) => Any)[];
    const fmtFn = fns.find((f) => { try { return f(123_450) === "1,234.50" && f(129_000) === "1,290"; } catch { return false; } });
    ok(fmtFn, "ไม่มีฟังก์ชันจัดรูปเงินที่ให้ 123450→«1,234.50» และ 129000→«1,290»");
    eq([fmtFn!(1_690_000), fmtFn!(0), fmtFn!(99_000)], ["16,900", "0", "990"], "ตัวอย่างเพิ่ม");
  });
  await st("U-16", "จอตั้งค่าโรงแรม (แบบหอ 17): HotelSettings ใช้ SettingsForm ของเครื่องยนต์ + กริดการ์ด 3 คอลัมน์ (lg:grid-cols-3 หรือเทียบเท่า) · ป้าย 9 การ์ดอยู่ใน hotel-settings-shared (ไม่พิมพ์คีย์ rooms.hotel.* ใน .tsx) · ปุ่ม «คืนค่าเริ่มต้น» · ลิงก์ /app/settings/domain · ประวัติ (history) · aiIdReader «ต้องเชื่อมตัวต่อ»", () => {
    const c = read(F.hsComp), sh = read(F.hsShared);
    ok(c && sh, "ยังไม่มี HotelSettings/hotel-settings-shared");
    const bad: string[] = [];
    if (!/SettingsForm/.test(c)) bad.push("ไม่ใช้ SettingsForm");
    if (!/grid-cols-3|columns-3/.test(c + sh)) bad.push("ไม่มีกริด 3 คอลัมน์");
    if (/rooms\.hotel\.[a-zA-Z.]+/.test(stripComments(c))) bad.push("คีย์ค่าตั้งใน .tsx");
    for (const l of Object.keys(CARD_KEYS)) if (!(sh + c).replace(/\s+/g, "").includes(l.replace(/\s+/g, ""))) bad.push(`การ์ด ${l}`);
    if (!/คืนค่าเริ่มต้น/.test(c)) bad.push("ปุ่มคืนค่าเริ่มต้น");
    if (!/\/app\/settings\/domain/.test(c + sh)) bad.push("ลิงก์โดเมน");
    if (!/history/.test(c)) bad.push("ประวัติ");
    if (!/ต้องเชื่อมตัวต่อ/.test(c + sh)) bad.push("ข้อความ aiIdReader");
    eq(bad, [], "จอตั้งค่า");
  });
  await st("U-17", "rates.ts/hotel-settings.ts ฝั่ง server: ใช้ tenantDb (ไม่ import { prisma } ดิบ) · $transaction ใน saveRates · ไม่ใช้ .upsert( ของ Prisma บน hotelRate/hotelRateOverride (มติ 9) · writeAudit/auditLog ทุกฟังก์ชันเขียน · อ่าน rooms.hotel.weekendDays/baseRate/dayOfWeekAdjustBp/defaultRatePlan จากค่าตั้ง (ไม่ฝัง [5,6]/\"STANDARD\")", () => {
    const r = stripComments(read(F.rates)), h = stripComments(read(F.hsettings));
    ok(r && h, "ยังไม่มี rates.ts/hotel-settings.ts");
    const bad: string[] = [];
    if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(r + h)) bad.push("import prisma ดิบ");
    if (!/tenantDb\s*\(/.test(r)) bad.push("rates ไม่ใช้ tenantDb");
    if (!/\$transaction\s*\(/.test(r)) bad.push("ไม่มี $transaction");
    if (/hotelRate(Override)?\.upsert\s*\(/.test(r)) bad.push("ใช้ upsert บน NULLS NOT DISTINCT");
    if (!/writeAudit\s*\(|auditLog\.create\s*\(/.test(r)) bad.push("ไม่มี AuditLog");
    for (const k of ["rooms.hotel.weekendDays", "rooms.hotel.baseRate", "rooms.hotel.dayOfWeekAdjustBp", "rooms.hotel.defaultRatePlan", "rooms.money.rounding"]) if (!r.includes(k)) bad.push(`ไม่อ่าน ${k}`);
    if (/weekendDays\s*[:=]\s*\[\s*5\s*,\s*6\s*\]|\?\?\s*\[\s*5\s*,\s*6\s*\]|\?\?\s*["']STANDARD["']/.test(r)) bad.push("ฝังค่าเริ่ม weekendDays/STANDARD");
    if (!/loadSettingsForm|setSettings|resetSetting/.test(h)) bad.push("hotel-settings ไม่ครอบ settings core");
    eq(bad, [], "server");
  });
  await st("U-18", "facade hotel/index.ts export ครบ: pricing 6 ตัว · rates 15 ตัว (§4) · hotel-settings 2 ตัว · โหลดได้จริง (ไม่ throw ตอน import)", () => {
    ok(hotelL.mod, hotelL.err);
    const names = ["resolveSeason", "resolveNightPrice", "quoteStay", "depositFor", "refundFor", "taxLines", "listRatePlans", "saveRatePlan", "archiveRatePlan", "saveCancelRules", "listSeasons", "saveSeason", "archiveSeason", "saveHolidays", "removeHoliday", "getRateMatrix", "saveRates", "setOverride", "clearOverride", "loadPricingContext", "ratePreview", "loadHotelSettings", "saveHotelSettings"];
    eq(names.filter((n) => typeof hotelL.mod[n] !== "function"), [], "ขาด");
  });
  await st("U-19", "docs/sds/modules/hotel.md §ราคา: มีสูตร resolution (override → ฤดู → ตาราง → fallback) · ภาษี 2 โหมด · ตัวเลขฉาก (1,290 · 1,490 · 1,690 · 154,800/1,548 · 199,000/1,990)", () => {
    const s = read(F.sds);
    ok(s, "ยังไม่มี docs/sds/modules/hotel.md");
    const miss = ["OVERRIDE", "FALLBACK", "INCLUSIVE", "EXCLUSIVE", "1,290", "1,490", "1,690"].filter((w) => !s.includes(w));
    eq(miss, [], "ขาด");
  }, "MINOR");

  // ═══════════════ F ไฟล์ที่แตะ (git · ตอนรับใบ) ═══════════════
  console.log("\n── F ไฟล์ที่แตะ (git) ──");
  const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  const OWN = new Set<string>([F.pricing, F.rates, F.hsettings, F.index, F.actions, F.ratesScreen, F.ratesShared, F.hsComp, F.hsShared, F.tabs, F.tabsShared, F.layout, F.ratesPage, F.settingsPage, F.unitHome, F.scene, F.sds, "src/lib/core/settings/types.ts", "src/lib/core/settings/form.ts", "src/lib/core/settings/defs/rooms.ts"]); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h1-F1-settings-core): ใบ §6.1
  {
    const ch = dirty(["src", "prisma", "public", "scripts", "docs"]).filter((f) => f !== "scripts/qc-svc-h.1.mts");
    const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.pricing}`]); return true; } catch { return false; } })();
    if (ch.length === 0 && headHas) skip("F-1", "แตะเฉพาะไฟล์ของใบ (§1)", "H.1 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
    else await st("F-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ) · ไม่แตะ prisma/** · service.ts · rooms/** · settings core · defs/rooms.ts · oracle", () => {
      const outside = ch.filter((f) => !OWN.has(f));
      eq(outside.slice(0, 10), [], "ไฟล์นอกใบ");
    });
  }
  await st("F-2", "แก้ไฟล์ร่วมแบบเพิ่มอย่างเดียว: actions.ts (ของเดิมห้ามแตะ) · หน้าแรกหน่วย (UNIT_NAV) ไม่ลบบรรทัด · index.ts ถ้ามีเดิมไม่ลบบรรทัด", () => {
    const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim()).length;
    const bad: string[] = [];
    for (const f of [F.actions, F.unitHome]) if (dirty([f]).length && rm(f) > 0) bad.push(`${f} ลบ ${rm(f)}`);
    eq(bad, [], "ลบบรรทัด");
  }, "MAJOR");
  await st("F-3", "ไม่แตะชิ้นต้องห้าม: prisma · src/lib/core (ทั้งหมด รวม defs/rooms.ts) · modules/rooms · hotel/service.ts · components/dorm · oracle/ข้อสอบ · svc-qc-data.mts", () => {
    // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h1-F3-settings-core): ใบ h.1 §6.1 (เพิ่มหลังเขียนข้อสอบ) ให้แตะ settings core 3 ไฟล์ได้ (types.ts · form.ts · defs/rooms.ts) — ชิ้นอื่นใน src/lib/core ยังห้าม
    const banned = dirty(["prisma", "src/lib/core", "src/lib/modules/rooms", "src/lib/modules/hotel/service.ts", "src/components/dorm", "scripts/svc-qc-data.mts", "scripts/qc-svc-h.0.mts"]).filter((f) => !/^src\/lib\/core\/settings\/(types|form)\.ts$|^src\/lib\/core\/settings\/defs\/rooms\.ts$/.test(f));
    eq(banned, [], "ไฟล์");
  });
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `svc-h1-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (รวม Hotel*/AuditLog/SettingValue) · ผู้ใช้ทดสอบ 0", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: MAIL } } }), 0, "user");
  }, "MAJOR");
}

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc (svc-qc-hotel-rates-scene) ──");
{
  let why = "";
  let unitId = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.hotel.slug, type: "HOTEL" }, select: { id: true } }) : null;
    const nt = u ? await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id } }) : 0;
    if (!t || !u || nt < 3) why = "ร้าน svcqc/หน่วย hotel ยังไม่ seed บนฐาน l1 (scripts/seed-svc-qc.mts)";
    else if (!H0_OK) why = H0_WHY;
    else if (!has(F.scene)) why = `ยังไม่มี ${F.scene}`;
    else unitId = u.id;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScene = (args: string[] = []) => spawnSync("pnpm", ["exec", "tsx", F.scene, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const settingsSig = async () => J((await prisma.settingValue.findMany({ where: { tenantId: SQC_TENANT.id }, orderBy: [{ key: "asc" }, { scope: "asc" }, { scopeId: "asc" }], select: { key: true, scope: true, scopeId: true, value: true } })));
  const otherSig = async () => J([await prisma.hotelRatePlan.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelSeason.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelRate.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelRateOverride.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelReservation.count({ where: { tenantId: SQC_TENANT.id } })]);
  const scenePlans = () => prisma.hotelRatePlan.findMany({ where: { tenantId: SQC_TENANT.id, unitId, code: { in: ["STANDARD", "BREAKFAST", "NONREF"] } } });
  const n1 = `ฉาก ${F.scene}: รันได้ (exit 0 · SCENE_SUMMARY {created,updated,removed}) · เขียนแผน 3 (STANDARD default) · ฤดู 2 · วันหยุด ≥ 2 · matrix STANDARD ครบ 3 ประเภท × (null+2 ฤดู) ตามฟิกซ์เจอร์ · BREAKFAST/NONREF แถว null = +40,000 / −10% · override ดีลักซ์ วันที่ 14 = 169,000 reason ฟิกซ์เจอร์ · ไม่เขียน SettingValue/HotelReservation · ร้านอื่นไม่เปลี่ยน`;
  const n2 = "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0 · แถวไม่เพิ่ม";
  const n3 = "--clear ลบเฉพาะแถวฉาก (แผน/ฤดู/วันหยุด/ราคา/override ของฉาก = 0) · ประเภทห้อง/ห้อง/การจอง svcqc คงเดิม · ร้านอื่นไม่เปลี่ยน · รันคืน";
  const n4 = "ratePreview บนฉาก svcqc (เจ้าของ · 14 วัน): ดีลักซ์วันที่ 14 ของฉาก = 169,000 OVERRIDE · ซูพีเรียทุกวัน 99,000 (นอกฤดู) · frontdesk อ่าน listRatePlans ได้ · เขียนไม่ได้";
  if (why) { for (const [id, n] of [["Q-1", n1], ["Q-2", n2], ["Q-3", n3], ["Q-4", n4]]) skip(id, n, why, "MAJOR"); }
  else {
    const ownerU = SQC_USERS.find((u) => u.key === "owner")!, fdU = SQC_USERS.find((u) => u.key === "frontdesk")!;
    const owner: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ownerU.userId };
    const fd: Actor = { role: "STAFF", unitAccess: [...fdU.unitAccess], permissions: { ...fdU.permissions }, userId: fdU.userId };
    const c = { tenantId: SQC_TENANT.id };
    const typeIdByName = async () => Object.fromEntries((await prisma.hotelRoomType.findMany({ where: { tenantId: SQC_TENANT.id, unitId } })).map((t: Any) => [t.name, t.id])) as Record<string, string>;
    const sceneDay = (() => { const t = bkkToday(); const d = Number(t.slice(8, 10)); const ym = d > 14 ? (() => { const [y, m] = t.slice(0, 7).split("-").map(Number); const n = y * 12 + (m - 1) + 1; return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`; })() : t.slice(0, 7); return `${ym}-14`; })();
    await st("Q-1", n1, async () => {
      runScene(["--clear"]);
      const s0 = await settingsSig(), o0 = await otherSig();
      const a = runScene();
      const sum = summary(`${a.stdout}`);
      ok(a.status === 0 && sum && ["created", "updated", "removed"].every((k) => typeof sum[k] === "number"), `exit=${a.status} ${sum ? fmt(sum) : `${a.stdout}${a.stderr}`.split("\n").slice(-3).join(" | ").slice(0, 240)}`);
      const plans = await scenePlans();
      eq(plans.map((p: Any) => [p.code, p.isDefault, p.status]).sort(), [["BREAKFAST", false, "ACTIVE"], ["NONREF", false, "ACTIVE"], ["STANDARD", true, "ACTIVE"]], "แผน");
      const seasons = await prisma.hotelSeason.findMany({ where: { tenantId: SQC_TENANT.id, unitId, status: "ACTIVE" } });
      eq(seasons.map((s: Any) => [s.name, s.priority, s.minNights ?? null]).sort(), [["ปีใหม่", 20, 2], ["ไฮซีซัน", 10, null]], "ฤดู (+minNights ปีใหม่ 2)");
      ok((await prisma.hotelHoliday.count({ where: { tenantId: SQC_TENANT.id, unitId } })) >= 2, "วันหยุด");
      const tid = await typeIdByName();
      const std = plans.find((p: Any) => p.code === "STANDARD");
      const sid: Record<string, string | null> = { high: seasons.find((s: Any) => s.name === "ไฮซีซัน").id, newyear: seasons.find((s: Any) => s.name === "ปีใหม่").id };
      const rates = await prisma.hotelRate.findMany({ where: { ratePlanId: { in: plans.map((p: Any) => p.id) } } });
      const bad: string[] = [];
      for (const typeName of Object.keys(FX.base)) for (const [pk, sk] of [["standard", null], ["standard", "high"], ["standard", "newyear"], ["breakfast", null], ["nonref", null]] as [string, string | null][]) {
        const exp = cellOf(pk, typeName, sk)!;
        const pid = plans.find((p: Any) => p.code === pk.toUpperCase())!.id;
        const row = rates.find((r: Any) => r.ratePlanId === pid && r.roomTypeId === tid[typeName] && (r.seasonId ?? null) === (sk ? sid[sk] : null));
        if (!row) { bad.push(`${pk}/${typeName}/${sk ?? "null"} ไม่มีแถว`); continue; }
        if (row.priceWeekdaySatang !== exp.weekday || row.priceWeekendSatang !== exp.weekend || (row.priceHolidaySatang ?? null) !== exp.holiday) bad.push(`${pk}/${typeName}/${sk ?? "null"} ${J([row.priceWeekdaySatang, row.priceWeekendSatang, row.priceHolidaySatang])} ≠ ${J(exp)}`);
      }
      eq(bad, [], "matrix");
      void std;
      const ov = await prisma.hotelRateOverride.findMany({ where: { tenantId: SQC_TENANT.id, unitId, roomTypeId: tid["ดีลักซ์"] } });
      ok(ov.length === 1 && ov[0].priceSatang === 169_000 && ov[0].reason === FX.override.reason && ymdOfDb(ov[0].date) === sceneDay, `override ${J(ov.map((o: Any) => [ymdOfDb(o.date), o.priceSatang, o.reason]))} (คาด ${sceneDay})`);
      eq([await settingsSig(), await otherSig()], [s0, o0], "SettingValue/ร้านอื่น/การจองเปลี่ยน");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const n0 = [await prisma.hotelRate.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.hotelRateOverride.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.hotelHoliday.count({ where: { tenantId: SQC_TENANT.id } })];
      const b = runScene();
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      eq([await prisma.hotelRate.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.hotelRateOverride.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.hotelHoliday.count({ where: { tenantId: SQC_TENANT.id } })], n0, "แถวเพิ่ม");
    }, "MAJOR");
    await st("Q-4", n4, async () => {
      const r = await RT("ratePreview")(c, unitId, { from: bkkToday(), to: addDays(bkkToday(), 13) });
      const days = (r?.days ?? []) as Any[];
      ok(days.length === 14, `days ${days.length}`);
      const tid = await typeIdByName();
      const d14 = days.find((d) => d.date === sceneDay);
      if (d14) eq([d14.byType[tid["ดีลักซ์"]]?.priceSatang, d14.byType[tid["ดีลักซ์"]]?.source], [169_000, "OVERRIDE"], "วันที่ 14");
      const ctx = await RT("loadPricingContext")(c, unitId, { from: bkkToday(), to: addDays(bkkToday(), 13) });
      for (const d of days) if (!ctx.seasons.some((s: Any) => s.dateStart <= d.date && d.date <= s.dateEnd)) eq(d.byType[tid["ซูพีเรีย"]]?.priceSatang, 99_000, `ซูพีเรีย ${d.date}`);
      okRes(await RT("listRatePlans")(fd, c, { unitId }), "frontdesk อ่าน");
      ok(isDenied(await RT("setOverride")(fd, c, { unitId, roomTypeId: tid["ดีลักซ์"], ratePlanId: null, date: addDays(bkkToday(), 3), priceSatang: 1, reason: "x" })), "frontdesk เขียนได้");
    }, "MAJOR");
    await st("Q-3", n3, async () => {
      const o0 = await otherSig();
      const nt = await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId } }), nr = await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId } });
      const cl = runScene(["--clear"]);
      ok(cl.status === 0, `--clear exit=${cl.status}`);
      eq((await scenePlans()).length, 0, "แผนฉากค้าง");
      eq(await prisma.hotelSeason.count({ where: { tenantId: SQC_TENANT.id, unitId, name: { in: ["ไฮซีซัน", "ปีใหม่"] } } }), 0, "ฤดูค้าง");
      eq(await prisma.hotelRateOverride.count({ where: { tenantId: SQC_TENANT.id, unitId, reason: FX.override.reason } }), 0, "override ค้าง");
      eq([await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId } }), await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId } }), await otherSig()], [nt, nr, o0], "ลบเกิน");
      const back = runScene();
      ok(back.status === 0 && (await scenePlans()).length === 3, "รันคืน");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const name = "visual-svc h.1 ด้วย owner และ frontdesk (read-only) · 4 ใบ × 1440/390 · HTTP < 400 · ไม่ล้นแนวนอน — ผู้คุมเทียบ PARITY ภาพ 15 + settings เทียบหอ 17 เชิงโครง";
  if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก H.1 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
  else {
    const bad: string[] = [];
    for (const user of ["owner", "frontdesk"]) {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.1", "--user", user, "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      if (r.status !== 0) bad.push(`${user} exit=${r.status} ${`${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => l.includes("❌")).slice(0, 2).join(" | ").slice(0, 200)}`);
    }
    record("V-1", name, bad.length ? "FAIL" : "PASS", bad.join(" · "), "MAJOR");
  }
}

// ═══════════════ G regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression ──");
const summaryOf = (out: string): { failed: string[] } | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as { failed: string[] }; } catch { return null; }
};
const judgeNoFail = (out: string) => (summaryOf(out)?.failed.length ?? 1) === 0;
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-h.0", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-hotel-money", note: "เส้นจองเดิมไม่เปลี่ยน" },
  { s: "qc-hotel-public" },
  { s: "qc-hotel-refund" },
  { s: "qc-svc-r0.3", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.4", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (แท็บหอไม่เปลี่ยน)" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof pricingL.mod?.quoteStay === "function" && typeof ratesL.mod?.saveRates === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (pricing.ts quoteStay / rates.ts saveRates) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_H1_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-h1-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const byGroup: Record<string, { total: number; passed: number; failed: number; skipped: number }> = {};
for (const c of cks) { const g = (byGroup[groupOf(c.id)] ??= { total: 0, passed: 0, failed: 0, skipped: 0 }); g.total++; if (c.res === "PASS") g.passed++; else if (c.res === "FAIL") g.failed++; else g.skipped++; }
console.log(`\n===== QC SVC H.1 · ราคาโรงแรม + นโยบาย + จอราคา/ตั้งค่า =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`กลุ่ม: ${Object.entries(byGroup).map(([g, v]) => `${g} ${v.passed}/${v.total}${v.skipped ? ` (skip ${v.skipped})` : ""}`).join(" · ")}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id), byGroup })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed/ยังไม่มีฉาก · F-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
