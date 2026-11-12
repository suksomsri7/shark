// QC — TRIPS T0.5 · ตัวเลือกราคา 8 ขั้น · ฤดูกาล/ราคารายรอบ · กฎราคา 6 ชนิด · โค้ดส่วนลด (อะตอม) · แต้ม/คูปอง (port) · ราคาแก้มือ · ปัดเศษ · snapshot + recompute
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/T0.5.md · ledger/TRIPS-CORE-CONTRACT.md §C §F §H.2–§H.4 §N.2 §N.3 §J.1 · MP §5 (ข)
//
// กลุ่มข้อ:
//   PC ตัวควบคุมบวก (เขียวก่อนมีงาน)   S ไฟล์/facade/กติกาโค้ด   C ตัวช่วยเงินบริสุทธิ์   F ตัวเลขฟิกซ์เจอร์/ภาพ ผ่าน resolver ถึงสตางค์
//   RS ขั้นตัวเลือกราคาทับกัน + trace   PT บรรทัดเก็บแทน   RU กฎราคา 6 ชนิด + ขอบ   PR โค้ด/แต้ม (บริสุทธิ์)   MO ราคาแก้มือ
//   RD คุณสมบัติการปัดเศษ (สุ่มมีเมล็ด)   SN snapshot + recompute   SE ฤดูกาล/ราคา CRUD (ฐาน)   PD โค้ดบนฐานจริง (X3 ยิงพร้อมกัน)
//   MB ข้อสอบบังคับ (ข)   X1 แยกร้าน/หน่วย   X9 การกระทำอันตราย   EV event   Q quote ของ Sellable   SD seed
//
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t05-*` ลบใน finally + กวาดค้างตอนเริ่ม · ตารางควบคุม `_qc_t05_ctl_*` สร้าง/ลบเอง · ไม่แตะร้าน seed (SD อ่านอย่างเดียว)
// 🔴 สินค้า/ประเภทคน/รายการเสริม/รอบ/ราคา สร้างด้วย SQL ดิบตามรูปตารางของใบ T0.1 (T0.2/T0.3 ยังไม่มี) · ยังไม่มีตาราง/โมดูล = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception
// 🔴 ตัวเลขคาด import จาก scripts/trips-fixture.mts · ตัวเลขภาพ 16 อ่านจาก README · 7,108.00/7,179.44 อ่านจากสัญญา (ไม่พิมพ์ซ้ำ)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t0.5.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมี T0.5 (และก่อน T0.1–T0.4 ลงทรีนี้): PC เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t0.5";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t0.4) ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
type Rec = Record<string, unknown>;
type AnyFn = (...a: unknown[]) => unknown;
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 300); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string) => {
  cks.push({ id, res, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); record(id, name, "PASS", ""); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`); }
};
const groupLine = (g: string) => {
  const mine = cks.filter((c) => c.id.replace(/-\d+$/, "") === g);
  console.log(`  ── สรุป ${g}: ผ่าน ${mine.filter((c) => c.res === "PASS").length}/${mine.length}`);
};
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const stripStrings = (s: string) => s.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""').replace(/`(?:\\.|[^`\\])*`/g, "``");
const THAI = /[฀-๿]/;
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t05qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const SLUG = "trips-t05-";
const EMAIL_PREFIX = "trips-t05-";
const CTL_PREFIX = "_qc_t05_ctl_";
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const addDaysYmd = (ymd: string, n: number) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n)).toISOString().slice(0, 10);
const bkkYmd = (d: unknown) => new Date(new Date(String(d instanceof Date ? d.toISOString() : d)).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const deepFreeze = <T,>(v: T): T => { if (v && typeof v === "object") { for (const k of Object.keys(v as object)) deepFreeze((v as Rec)[k]); Object.freeze(v); } return v; };

// ═══════════════ ตัวเลขอ้างอิง (ฟิกซ์เจอร์ · README · สัญญา) ═══════════════
const R = FX.PRODUCT_RACHA;
const VAT_BP = FX.RECEIPT_RC_0588.vatBp;
const AC = FX.AGENCY_CASE_2ADULTS;
const LB = FX.BOOKING_LB_0031;
const SIM = FX.TRIP_SIMILAN;
const RF = FX.REFUND_TR_0188;
const baht = (s: string) => Math.round(Number(s.replace(/,/g, "")) * 100);
const README = read("ledger/design-trips/README.md");
const CC = read("ledger/TRIPS-CORE-CONTRACT.md");
const M16 = (() => {
  const m = /หลัก ([\d,]+)\/([\d,]+) · ปีใหม่ ([\d,]+)\/([\d,]+) · นอกฤดู ([\d,]+)\/([\d,]+)\) \+ ราคารอบ 31 ธ.ค. ([\d,]+)\/([\d,]+)/.exec(README);
  if (!m) return null;
  const v = m.slice(1).map(baht);
  return { main: [v[0], v[1]], ny: [v[2], v[3]], off: [v[4], v[5]], dec31: [v[6], v[7]] };
})();
const CC_EXCL = (() => { const m = /`EXCLUSIVE`:[^\n]*?= \*\*([\d,.]+)\*\*/.exec(CC); return m ? baht(m[1]) : null; })();
const CC_INCL = (() => { const m = /`INCLUSIVE`:[^\n]*?ส่งร้าน \*\*([\d,.]+)\*\*/.exec(CC); return m ? baht(m[1]) : null; })();
const NY = FX.AGENCY_DEFAULTS.peakNewYear; // 20 ธ.ค. – 5 ม.ค. (ภาพ 10/16 ช่วงเดียวกัน)
// วันฤดูกาลหลัก/นอกฤดู จากภาพ 16 (ไม่ใช่เงิน)
const MAIN_FROM = "2026-11-01", MAIN_TO = "2027-04-30", OFF_FROM = "2027-05-01", OFF_TO = "2027-10-31";
const SNAP_KEYS = ["trips.general.currencies", "trips.fx.rateSource", "trips.fx.rates", "trips.pay.depositPct", "trips.pay.depositBase", "trips.pay.balanceDueDaysBefore", "trips.pay.overdueAction",
  "trips.pay.overdueGraceHours", "trips.cancel.ladder", "trips.cancel.shopCancelRefund", "trips.cancel.shopCancelOptions", "trips.cancel.refundForm", "trips.cancel.deductions", "trips.cancel.nameChangeFree",
  "trips.cancel.changeDateFee", "trips.cancel.creditBonusPct", "trips.cancel.creditValidityMonths", "trips.cancel.moveFreeWithinDays", "trips.pax.childAgeBand", "trips.pax.childPricePct",
  "trips.tax.vatRegistered", "trips.tax.priceIncludesVat", "trips.tax.vatRate", "trips.tax.invoiceOnEachPayment", "trips.tax.invoiceForm", "trips.tax.cancelFeeVat", "trips.tax.forfeitAfterInvoice",
  "trips.tax.refundCreditNote", "trips.tax.corporateCustomerWht", "trips.consumer.withdraw7Days", "trips.line.defaults", "trips.parkFee.table", "trips.parkFee.ageBands", "trips.parkFee.exemptFlags", "trips.parkFee.countMode"];

// ═══════════════ สเปก (ใบสั่ง T0.5 §1 §3 §5) ═══════════════
const PURE_FNS = ["resolveTripPrice", "toTripsSnapshot", "recomputeFromSnapshot", "snapshotValue", "priceFingerprint", "mulBpHalfUp", "mulDivHalfUp", "divCeil", "vatOfInclusive", "vatOfExclusive", "minorToSatang", "allocateLastRemainder"];
const SVC_FNS = ["loadPricingInput", "quoteTripLine", "quoteTrips", "buildTripBookingSnapshot", "registerAgencyPricingPort", "registerTripPromoProvider", "listSeasons", "saveSeason", "archiveSeason",
  "listPrices", "setPrice", "removePrice", "savePriceRule", "setPriceRuleActive", "redeemPromoInTx", "releasePromoInTx"];
const CONSTS = ["PRICE_STEPS", "tripPricingInputSchema", "PricingAbort", "SnapshotKeyMissing"];
const STEPS = ["RETAIL", "SEASON", "DEPARTURE", "RULE", "TIER", "CONTRACT", "PROMO", "MANUAL"];
const D = "src/lib/modules/trips/";
const OWN = ["money-math.ts", "pricing-core.ts", "snapshot.ts", "pricing.ts", "prices.ts", "promo.ts", "pricing-actions.ts"].map((f) => D + f);
const PURE_FILES = ["money-math.ts", "pricing-core.ts", "snapshot.ts"].map((f) => D + f);
const PRICING_FILES = ["pricing-core.ts", "snapshot.ts", "pricing.ts", "prices.ts", "promo.ts", "pricing-actions.ts"].map((f) => D + f);
const EVENTS = ["trips.price.changed", "trips.promo.redeemed", "trips.promo.exhausted"];
const PERM_KEYS = ["trips.price.edit", "trips.price.override"];
const SELL_CODES = ["VALIDATION", "NOT_FOUND", "FORBIDDEN", "KIND_NOT_SUPPORTED", "CURRENCY_NOT_ALLOWED", "SOLD_OUT", "INSUFFICIENT_ALLOTMENT", "BERTH_TAKEN", "SLOT_CLOSED", "CUTOFF_PASSED",
  "PRICE_CHANGED", "BELOW_MIN_SELL_PRICE", "DISCOUNT_OVER_CAP", "HOLD_EXPIRED", "HOLD_NOT_FOUND", "HOLD_LIMIT", "AGENT_SUSPENDED", "CREDIT_LIMIT", "REQUIRES_APPROVAL",
  "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "BUSY", "STATE_CONFLICT"];

// ═══════════════ ตัวคำนวณอ้างอิงของข้อสอบ (BigInt · ไม่พึ่งโค้ดที่ตรวจ) ═══════════════
const halfUp = (num: bigint, den: bigint): bigint => { const s = (num < BigInt(0)) !== (den < BigInt(0)) ? -BigInt(1) : BigInt(1); const a = num < BigInt(0) ? -num : num, b = den < BigInt(0) ? -den : den; return s * ((BigInt(2) * a + b) / (BigInt(2) * b)); }; // ORACLE-EDIT (ผู้คุม 12 พ.ย.): BigInt() แทน literal — tsconfig target < ES2020
const refMulDiv = (a: number, b: number, c: number) => Number(halfUp(BigInt(a) * BigInt(b), BigInt(c)));
const refVatIncl = (amt: number, bp: number) => refMulDiv(amt, bp, 10_000 + bp);
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 40 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const needTable = async (t: string) => { if ((await cols(t)).length === 0) throw new AssertFail(`ยังไม่มีตาราง ${t} (migration ของ T0.1 ยังไม่ลงฐานนี้)`); };
const needCol = async (t: string, c: string, why: string) => { await needTable(t); if (!(await cols(t)).some((x) => x.column_name === c)) throw new AssertFail(`ยังไม่มีคอลัมน์ ${t}.${c} (${why})`); };
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]); if (l.length) return l; }
  return [];
};
async function insertRow(table: string, vals: Rec): Promise<string> {
  await needTable(table);
  const v: Rec = { ...vals };
  const names = new Set((await cols(table)).map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (c.column_name === "updatedAt" || c.column_name === "createdAt") { v[c.column_name] = new Date(); continue; }
    if (t === "text" || t.startsWith("character")) { const l = await checkLits(table, c.column_name); v[c.column_name] = l[0] ?? `qc${hex(4)}`; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}"
      : t.startsWith("timestamp") ? "2027-01-01 00:00:00" : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id ?? "");
}

// ═══════════════ ร้านชั่วคราว + กวาด ═══════════════
async function tablesWithTenant(): Promise<string[]> {
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  return rows.map((r) => r.t).filter((t) => t !== "Tenant");
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  let pending = await tablesWithTenant();
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])).map((r) => r.id);
    if (!us.length) return;
    for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* ไม่มีคอลัมน์ */ } }
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
async function dropControlTables() {
  try { for (const r of await q<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = current_schema() AND tablename LIKE $1`, [`${CTL_PREFIX}%`])) await pool.query(`DROP TABLE IF EXISTS "${r.t}"`); } catch (e) { console.log(`  ⚠️ ลบตารางควบคุม: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
const unregister: (() => void)[] = [];

// ═══════════════ อินพุตบริสุทธิ์ (ใบสั่ง §3.1) ═══════════════
const LADDER_T20 = FX.REFUND_POLICY_TEMPLATE.map((s) => ({ fromDaysBefore: s.minDays, refundPct: s.refundBp / 100 }));
const PARK_TABLE = {
  confirmedAt: null,
  groups: [{ code: "G1", nameTh: "กลุ่ม 1", thaiChildSatang: 1_000, thaiAdultSatang: 2_000, foreignChildSatang: 5_000, foreignAdultSatang: 10_000 }],
  diveSatangPerPaxDay: 20_000, mooring: { upTo20Satang: 100_000, from21Satang: 200_000 },
  shopRates: [{ label: "เกาะราชา", adultSatang: R.parkAdultSatang, childSatang: R.parkChildSatang, diverSatang: null, effectiveFrom: "2026-11-01" },
    { label: "สิมิลัน", adultSatang: SIM.parkPerPersonSatang, childSatang: SIM.parkPerPersonSatang, diverSatang: null, effectiveFrom: "2026-11-01" }],
};
const LINE_DEFAULTS = {
  PARK_FEE: { passThrough: true, commissionPct: 0, discountable: false }, PORT_FEE: { passThrough: false, commissionPct: 0, discountable: false }, FUEL: { passThrough: false, commissionPct: 0, discountable: false },
  EQUIPMENT: { passThrough: false, commissionPct: 50, discountable: true }, NITROX: { passThrough: false, commissionPct: 50, discountable: true }, TRANSFER: { passThrough: false, commissionPct: 100, discountable: true },
  COURSE: { passThrough: false, commissionPct: 100, discountable: true }, INSURANCE: { passThrough: false, commissionPct: 100, discountable: true }, OTHER: { passThrough: false, commissionPct: 100, discountable: true },
};
const POLICY = (o: Rec = {}): Rec => ({
  "trips.general.currencies": ["THB"], "trips.fx.rateSource": "BOT_REF", "trips.fx.rates": [],
  "trips.pay.depositPct": 100, "trips.pay.depositBase": "TRIP_ONLY", "trips.pay.balanceDueDaysBefore": null, "trips.pay.overdueAction": "NOTIFY_SHOP", "trips.pay.overdueGraceHours": 24,
  "trips.cancel.ladder": LADDER_T20, "trips.cancel.shopCancelRefund": { EXTERNAL: 100, MIN_NOT_MET: 100, SHOP_FAULT: 100 }, "trips.cancel.shopCancelOptions": { options: ["MOVE_DATE", "REFUND_100"], autoRefundAfterDays: 2 },
  "trips.cancel.refundForm": "MONEY", "trips.cancel.deductions": { categories: ["VISA", "AIR_DEPOSIT", "OTHER_NECESSARY"], evidenceRequired: true }, "trips.cancel.nameChangeFree": true, "trips.cancel.changeDateFee": null,
  "trips.cancel.creditBonusPct": RF.creditBonusBp / 100, "trips.cancel.creditValidityMonths": 12, "trips.cancel.moveFreeWithinDays": 90,
  "trips.pax.childAgeBand": { infantBelow: 4, childFrom: R.childAge.min, childTo: R.childAge.max }, "trips.pax.childPricePct": R.childPriceBp / 100,
  "trips.tax.vatRegistered": { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 }, "trips.tax.priceIncludesVat": true, "trips.tax.vatRate": { mode: "STANDARD", rateBp: VAT_BP },
  "trips.tax.invoiceOnEachPayment": true, "trips.tax.invoiceForm": { direct: "SHORT_UPGRADE_ON_REQUEST", viaAgent: "FULL_ONLY" }, "trips.tax.cancelFeeVat": "DAMAGES_NO_VAT_NO_WHT",
  "trips.tax.forfeitAfterInvoice": "NO_AUTO_CREDIT_NOTE", "trips.tax.refundCreditNote": true, "trips.tax.corporateCustomerWht": { enabled: true, rateBp: AC.whtBp },
  "trips.consumer.withdraw7Days": false, "trips.line.defaults": LINE_DEFAULTS, "trips.parkFee.table": PARK_TABLE,
  "trips.parkFee.ageBands": { freeBelow: 3, childFrom: 3, childTo: 14, adultFrom: 15, thaiSeniorFreeFrom: 60, childByHeightCm: 140 }, "trips.parkFee.exemptFlags": ["MONK", "DISABLED", "THAI_STUDENT_CHILD_RATE"], "trips.parkFee.countMode": "PER_ENTRY",
  "trips.price.manualOverrideApprovalPct": 10, "trips.price.costWarnMarginPct": 0, "trips.sell.holdMinutes": R.holdMinutes,
  ...o,
});
const PAXT = [{ id: "pt_A", code: "ADULT", countsCapacity: true, active: true }, { id: "pt_C", code: "CHILD", countsCapacity: true, active: true }, { id: "pt_I", code: "INFANT", countsCapacity: false, active: true }];
const X_PARK = { id: "x_park", kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: R.parkAdultSatang, paxPrices: { ADULT: R.parkAdultSatang, CHILD: R.parkChildSatang }, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE", label: "ค่าอุทยาน" };
const X_CAM = { id: "x_cam", kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: R.extras.camera.satang, paxPrices: null, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7", label: R.extras.camera.name };
const X_PORT = { id: "x_port", kind: "PORT_FEE", basis: "PER_BOOKING", mandatory: true, priceMinor: 10_000, paxPrices: null, currency: "THB", commissionable: false, discountable: false, passThrough: false, taxKind: "VAT7", label: "ค่าท่าเรือ" };
type PriceO = { id?: string; paxTypeId?: string | null; seasonId?: string | null; departureId?: string | null; optionId?: string | null; amount: number; currency?: string; weekdayMask?: number | null; bookFrom?: string | null; bookTo?: string | null; travelFrom?: string | null; travelTo?: string | null; priority?: number };
const price = (o: PriceO) => ({ id: o.id ?? `pr_${hex(3)}`, optionId: o.optionId ?? null, paxTypeId: o.paxTypeId === undefined ? "pt_A" : o.paxTypeId, cabinTypeId: null, seasonId: o.seasonId ?? null, departureId: o.departureId ?? null,
  currency: o.currency ?? "THB", amountMinor: o.amount, weekdayMask: o.weekdayMask ?? null, bookFrom: o.bookFrom ?? null, bookTo: o.bookTo ?? null, travelFrom: o.travelFrom ?? null, travelTo: o.travelTo ?? null, priority: o.priority ?? 0 });
const RETAIL = price({ id: "pr_retail_A", amount: R.adultSatang });
const season = (id: string, from: string, to: string, priority = 0) => ({ id, dateStart: from, dateEnd: to, priority, status: "ACTIVE" });
const rule = (id: string, params: Rec, o: Rec = {}) => ({ id, productId: null, kind: String(params.kind), params, dateFrom: null, dateTo: null, bookFrom: null, bookTo: null, priority: 0, active: true, usedCount: 0, ...o });
type MkO = { date?: string; now?: string | Date; adults?: number; children?: number; camera?: number; extras?: Rec[]; prices?: Rec[]; seasons?: Rec[]; rules?: Rec[]; promoCode?: string | null;
  providers?: Rec[]; agency?: Rec | null; agentDiscount?: number; overrides?: Rec[]; canOverride?: boolean; approvals?: Rec[]; policy?: Rec; channel?: string; actor?: string; productType?: string;
  currency?: string; depId?: string; cost?: number; minPax?: number | null; sold?: number; days?: number; nights?: number; pax?: Rec[] };
const mk = (o: MkO = {}): Rec => {
  const date = o.date ?? FX.BOOKING_TR_0142.date;
  const pax = o.pax ?? [{ paxTypeId: "pt_A", qty: o.adults ?? 2 }, { paxTypeId: "pt_C", qty: o.children ?? 0 }].filter((p) => (p.qty as number) > 0);
  return {
    now: new Date(o.now ?? FX.TRIPS_AS_OF).toISOString(), tz: "Asia/Bangkok", unitId: "u_qc", channel: o.channel ?? "WEB", actor: o.actor ?? "PUBLIC", currency: o.currency ?? "THB",
    product: { id: "p_racha", productType: o.productType ?? "TOUR", currency: "THB" },
    departure: { id: o.depId ?? `d_${date}`, localDate: date, startsAt: BKK(date, "08:00").toISOString(), optionId: "o_join", capacity: 60, sold: o.sold ?? 0, held: 0, reserved: 0, minPax: o.minPax === undefined ? R.minPax : o.minPax,
      days: o.days ?? 1, nights: o.nights ?? 0, costSatang: o.cost ?? 0, deckPlanVersionId: null },
    paxTypes: PAXT, pax, extras: o.extras ?? [X_PARK, X_CAM], requestedExtras: (o.camera ?? 0) > 0 ? [{ extraId: "x_cam", qty: o.camera }] : [], pickup: null,
    prices: o.prices ?? [RETAIL], seasons: o.seasons ?? [], rules: o.rules ?? [], promoCode: o.promoCode ?? null, promoProviders: o.providers ?? [],
    agency: o.agency ?? null, agentDiscountSatang: o.agentDiscount ?? 0, overrides: o.overrides ?? [], overrideGrant: { canOverride: o.canOverride ?? false, approvals: o.approvals ?? [] },
    policy: POLICY(o.policy ?? {}),
  };
};
type AgO = { rateBp?: number; collector?: string; vatMode?: string; wht?: boolean; contract?: Rec | null; tierPrice?: Record<string, number> | null; mode?: string; discEnabled?: boolean; actualSale?: number | null; vatRegistered?: boolean };
const agency = (o: AgO = {}): Rec => ({
  agentAccountId: "ag_ptd", agentTierId: "tier_B", vatRegistered: o.vatRegistered ?? false,
  tier: { refId: "tier_B", mode: o.mode ?? "COMMISSION_PCT", rateBp: o.rateBp ?? FX.AGENCY_TIERS.B.tourBp, fixedSatang: null, unitMinorByPaxCode: o.tierPrice ?? null, minSellMinor: null, markupCapBp: null },
  contract: o.contract ?? null,
  terms: { collector: o.collector ?? "AGENT_COLLECTS", sellerOfRecord: "SHOP_PRINCIPAL", vatMode: o.vatMode ?? "NONE", vatRateBp: VAT_BP,
    wht: { applies: o.wht ?? true, mode: "RATE", rateBp: AC.whtBp, eWht: false, grossUp: true, minPerContractSatang: 100_000, continuous: "EVERY_PAYMENT", remitter: "SHOP", payerType: "JURISTIC", payeeType: "THAI_JURISTIC" },
    discountFromCommission: { enabled: o.discEnabled ?? false, capPct: FX.AGENCY_PTD.maxDiscountFromCommissionBp / 100 }, earnedAt: "AFTER_TRAVEL", clawbackOnCancel: true, actualSaleSatang: o.actualSale ?? null },
  policySnapshot: null,
});
const tripsPolicySnap = (o: Rec = {}): Rec => { const p = POLICY(o); const values: Rec = {}; const sources: Rec = {}; for (const k of SNAP_KEYS) { values[k] = p[k] ?? null; sources[k] = "TEMPLATE"; } return { v: 1, domain: "trips", at: new Date(FX.TRIPS_AS_OF).toISOString(), template: { key: "DIVE_SHOP", version: 1 }, values, sources }; };

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers(); await dropControlTables();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const SET = SETI.mod;
  const DBI = await tryImport("@/lib/core/db");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name}`); return f as AnyFn; };
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e), name: (e as { name?: string }).name, code: (e as { code?: unknown }).code }; }
  };
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const codeR = (r: Rec, code: string, what: string, reason?: string) => {
    ok(r.ok === false && r.code === code, `${what}: ต้อง ${code} ได้ ${fmt(r)}`);
    if (reason) eq(asRec(r.details)?.reason, reason, `${what} details.reason`);
  };
  const resolve = (inp: Rec): Rec => { const f = fn("resolveTripPrice"); try { return asRec(f(inp)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } };
  const P = (o: MkO = {}, what = "resolveTripPrice"): Rec => V(resolve(mk(o)), what);
  const items = (v: Rec) => asArr(v.items);
  const item = (v: Rec, ref: string): Rec => { const i = items(v).find((x) => x.itemRef === ref); ok(i, `ไม่มีบรรทัด ${ref} ใน ${fmt(items(v).map((x) => x.itemRef))}`); return i as Rec; };
  const tot = (v: Rec) => asRec(v.totals) ?? {};
  const com = (v: Rec) => asRec(v.commission) ?? {};
  const steps = (i: Rec) => asArr(i.priceTrace).map((t) => String(t.step));
  const warns = (v: Rec) => asArr(v.warnings).map((w) => String(w.code));
  const inTx = async (tenantId: string, unitId: string, body: (tx: unknown) => Promise<unknown>): Promise<Rec> => {
    const td = DBI.mod?.tenantDb;
    if (typeof td !== "function") throw new AssertFail(`โหลด tenantDb ไม่ได้ (${DBI.err.slice(0, 80)})`);
    const db = asRec((td as AnyFn)({ tenantId, unitId })) ?? {};
    const tr = db.$transaction as ((f: (tx: unknown) => Promise<unknown>, o?: Rec) => Promise<unknown>) | undefined;
    if (typeof tr !== "function") throw new AssertFail("tenantDb ไม่มี $transaction");
    try { const r = await tr.call(db, body, { timeout: 60_000, maxWait: 60_000 }); return asRec(r) ?? { ok: true }; }
    catch (e) { const c = (e as { code?: unknown }).code; const det = asRec((e as { details?: unknown }).details); return typeof c === "string" && SELL_CODES.includes(c) ? { ok: false, code: c, details: det ?? {}, thrown: true } : { ok: "THROW", e: errMsg(e), pg: String(c ?? "") }; }
  };

  // ═══════════════ PC. ตัวควบคุมบวก ═══════════════
  console.log("\n── PC: ตัวควบคุมบวก ──");
  const CTL = `${CTL_PREFIX}${STAMP}`;
  let ctlErr = "";
  try { await pool.query(`CREATE TABLE "${CTL}" (id text PRIMARY KEY, used int NOT NULL DEFAULT 0, max int NOT NULL)`); } catch (e) { ctlErr = errMsg(e); }
  const ctlRow = async (max: number) => { const id = rid("ctl"); await pool.query(`INSERT INTO "${CTL}" (id, max) VALUES ($1, $2)`, [id, max]); return id; };
  /** ผิดโดยเจตนา: อ่าน → หน่วง → เขียนค่าที่คำนวณเอง (ห้ามมีในโค้ดจริง) */
  const nonAtomicRedeem = async (id: string): Promise<boolean> => {
    const c = await pool.connect();
    try {
      const r = (await c.query<{ used: number; max: number }>(`SELECT used, max FROM "${CTL}" WHERE id = $1`, [id])).rows[0];
      if (!r || r.used >= r.max) return false;
      await c.query(`SELECT pg_sleep(0.02)`);
      await c.query(`UPDATE "${CTL}" SET used = $2 WHERE id = $1`, [id, r.used + 1]);
      return true;
    } finally { c.release(); }
  };
  const atomicRedeem = async (id: string): Promise<boolean> => (await q(`UPDATE "${CTL}" SET used = used + 1 WHERE id = $1 AND used < max RETURNING used`, [id])).length === 1;
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed andaman-dive อยู่ · สร้างตารางควบคุมได้", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = 'andaman-dive'`))[0]?.n, 1, "ร้าน andaman-dive");
    ok(!ctlErr, `สร้างตารางควบคุมไม่ได้: ${ctlErr}`);
  });
  await st("PC-2", "ฟิกซ์เจอร์: assertFixtureArithmetic ผ่าน · ฉบับแก้ 11,450 → 11,451 ต้อง throw (ตัวตรวจจับได้จริง)", () => {
    const r = FX.assertFixtureArithmetic(); ok(r.checks > 20, `ตรวจน้อยไป ${r.checks}`);
    const bad = clone(FX.TRIPS_FIXTURE) as unknown as FX.TripsFixture; (bad.booking0142 as { totalSatang: number }).totalSatang += 1;
    let threw = false; try { FX.assertFixtureArithmetic(bad); } catch { threw = true; }
    ok(threw, "ฟิกซ์เจอร์ที่ผิดไม่ถูกจับ");
  });
  await st("PC-3", "ค่าคาดที่ข้อสอบคำนวณเอง: §H.4 ของสัญญา (7,108.00 · 7,179.44) = สูตรจากส่วนประกอบฟิกซ์เจอร์ · README ภาพ 16 อ่านได้ และเด็ก = 70% ทุกฤดู · ใบเสร็จ 13ค ด้วยตัวคำนวณอ้างอิง", () => {
    ok(CC_EXCL !== null && CC_INCL !== null, "อ่านตัวเลข §H.4 จากสัญญาไม่ได้");
    const C = AC.commissionSatang, Ci = C, Cx = FX.preVat(Ci, VAT_BP);
    eq([AC.collectSatang - C - FX.pct(C, VAT_BP) + FX.pct(C, AC.whtBp), AC.collectSatang - Ci + FX.pct(Cx, AC.whtBp)], [CC_EXCL, CC_INCL], "EXCLUSIVE/INCLUSIVE");
    ok(M16, "อ่านตัวเลขฤดูกาลจาก README :24 ไม่ได้");
    for (const [a, c] of [M16!.main, M16!.ny, M16!.off, M16!.dec31]) eq(c, FX.pct(a, R.childPriceBp), `เด็ก 70% ของ ${a}`);
    eq(M16!.main, [R.adultSatang, R.childSatang], "ฤดูหลัก = ราคาฐานราชา");
    eq([refVatIncl(FX.RECEIPT_RC_0588.serviceInclVatSatang, VAT_BP), FX.RECEIPT_RC_0588.serviceInclVatSatang - refVatIncl(FX.RECEIPT_RC_0588.serviceInclVatSatang, VAT_BP)], [FX.RECEIPT_RC_0588.vatSatang, FX.RECEIPT_RC_0588.preVatSatang], "13ค");
  });
  await st("PC-4", "ตัวควบคุมไม่อะตอม (อ่าน-แล้ว-เขียน) ใช้โค้ดเกินภายใต้ 30 คำขอพร้อมกันบนสิทธิ์ 5 (≤ 3 ครั้ง · ไม่เกิน = control inconclusive)", async () => {
    ok(!ctlErr, `ไม่มีตารางควบคุม: ${ctlErr}`);
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) { const id = await ctlRow(5); const r = await Promise.all(Array.from({ length: 30 }, () => nonAtomicRedeem(id).catch(() => false))); const w = r.filter(Boolean).length; seen.push(w); if (w > 5) return; }
    throw new AssertFail(`control inconclusive: สำเร็จ ${seen.join("/")} ไม่เกิน 5 — ข้อสอบยิงพร้อมกันอาจไม่จริงพอ`);
  });
  await st("PC-5", "คำสั่งเดียว UPDATE … SET used = used + 1 WHERE used < max RETURNING: 30 คำขอพร้อมกัน ⇒ สำเร็จ 5 พอดี", async () => {
    ok(!ctlErr, `ไม่มีตารางควบคุม: ${ctlErr}`);
    const id = await ctlRow(5);
    const r = await Promise.all(Array.from({ length: 30 }, () => atomicRedeem(id)));
    eq([r.filter(Boolean).length, (await q<{ used: number }>(`SELECT used FROM "${CTL}" WHERE id = $1`, [id]))[0]?.used], [5, 5], "สำเร็จ/used");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์ · facade · กติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด ──");
  const srcOf = (p: string) => stripComments(read(p));
  const importsOf = (s: string) => [...s.matchAll(/^\s*import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: Boolean(m[1]), spec: m[2] }));
  await st("S-1", "ไฟล์เจ้าของครบ: money-math · pricing-core · snapshot · pricing · prices · promo · pricing-actions", () => {
    const miss = OWN.filter((f) => !existsSync(join(ROOT, f))); ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
  await st("S-2", `facade ส่งออก ${PURE_FNS.length + SVC_FNS.length} ฟังก์ชัน + ${CONSTS.join("/")} · บล็อก "// TRIPS T0.5 ▸" · ไม่มี export *`, () => {
    const m = needTrips();
    const miss = [...PURE_FNS, ...SVC_FNS].filter((k) => typeof m[k] !== "function").concat(CONSTS.filter((k) => m[k] === undefined));
    ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
    const idx = read(D + "index.ts"); ok(/\/\/ TRIPS T0\.5 ▸/.test(idx), "ไม่มีบล็อก // TRIPS T0.5 ▸"); ok(!/export\s+\*/.test(stripComments(idx)), "มี export *");
  });
  await st("S-3", "money-math · pricing-core · snapshot บริสุทธิ์: ไม่ import prisma/db/next/node:fs/โมดูลอื่น · ค่าตั้งได้แค่ import type", () => {
    const bad: string[] = [];
    for (const f of PURE_FILES) {
      const s = srcOf(f); if (!s) { bad.push(`${f}: ไม่มีไฟล์`); continue; }
      for (const i of importsOf(s)) {
        const allowed = i.spec === "zod" || /^\.\/(money-math|json-schemas|departures-core)$/.test(i.spec) || (i.typeOnly && /^@\/lib\/core\/(sellable|settings)/.test(i.spec));
        if (!allowed) bad.push(`${f}: ${i.typeOnly ? "type " : ""}${i.spec}`);
      }
      if (/\bprisma\b|tenantDb|\$queryRaw|process\.env/.test(s)) bad.push(`${f}: แตะฐาน/env`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-4", "เส้นคำนวณย้อนหลัง (snapshot.ts) ไม่อ่านค่าตั้งสด: ไม่ import @/lib/core/settings (value) · ไม่เรียก resolveSetting*/snapshotPolicy · ไม่ import ./pricing ./prices ./promo", () => {
    const s = srcOf(D + "snapshot.ts"); ok(s, "ไม่มี snapshot.ts");
    const bad = importsOf(s).filter((i) => (!i.typeOnly && /core\/settings/.test(i.spec)) || /^\.\/(pricing|prices|promo)$/.test(i.spec)).map((i) => i.spec);
    if (/resolveSetting|resolveSettings|snapshotPolicy|getTemplate/.test(s)) bad.push("เรียกตัวอ่านค่าตั้ง");
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-5", "ไม่มี any · ไม่มี prisma ดิบ · ไม่ import โมดูลอื่น (agency/member/approval/account/pos) ในไฟล์ของใบ", () => {
    const bad: string[] = [];
    for (const f of OWN) {
      const s = srcOf(f); if (!s) { bad.push(`${f}: ไม่มี`); continue; }
      if (/:\s*any\b|as\s+any\b|<any>|any\[\]/.test(stripStrings(s))) bad.push(`${f}: any`);
      if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(s)) bad.push(`${f}: prisma ดิบ`);
      for (const i of importsOf(s)) if (/^@\/lib\/modules\/(?!trips)/.test(i.spec)) bad.push(`${f}: ${i.spec}`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-6", "ไม่มีเงินทศนิยม: Math.round/floor/ceil · toFixed · parseFloat · `/ 100` `/ 10000` `/ 1e6` · `* 0.x` อยู่ได้เฉพาะ money-math.ts", () => {
    const bad: string[] = [];
    for (const f of PRICING_FILES) {
      const s = stripStrings(srcOf(f)); if (!s) { bad.push(`${f}: ไม่มี`); continue; }
      for (const m of s.matchAll(/Math\.(round|floor|ceil|trunc)\s*\(|\.toFixed\s*\(|parseFloat\s*\(|\/\s*(100|10_?000|1e6|1_000_000|107)\b|\*\s*0\.\d/g)) bad.push(`${f}: ${m[0]}`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-7", "ไม่มีอัตรา/เกณฑ์ตายตัวในไฟล์ราคา (VAT 700/107/10700/0.07 · WHT 300/0.03 · คอมฯ 1500/2000/1000 · มัดจำ 30 · ฯลฯ)", () => {
    const bad: string[] = [];
    for (const f of PRICING_FILES) {
      const s = stripStrings(srcOf(f)); if (!s) { bad.push(`${f}: ไม่มี`); continue; }
      for (const m of s.matchAll(/(?<![\w.])(700|107|10_?700|0\.07|1\.07|0\.03|300|1_?500|2_?000|1_?000|7_?000|0\.7|0\.15|0\.3|0\.5)(?![\w.])/g)) bad.push(`${f}: ${m[0]}`);
      for (const m of s.matchAll(/(?:depositPct|childPricePct|manualOverrideApprovalPct|costWarnMarginPct|rateBp|whtBp|vatBp)\s*[:=?]{1,2}\s*\d/g)) bad.push(`${f}: ${m[0]}`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-8", "promo.ts: คำสั่งเดียว UPDATE \"TripPriceRule\" SET \"usedCount\" = \"usedCount\" + 1 … WHERE … \"usedCount\" < … RETURNING · มี tenantId · ไม่มีการเขียนค่าที่อ่านมา", () => {
    const s = srcOf(D + "promo.ts"); ok(s, "ไม่มี promo.ts");
    ok(/UPDATE\s+"TripPriceRule"\s+SET\s+"usedCount"\s*=\s*"usedCount"\s*\+\s*1[\s\S]{0,600}?WHERE[\s\S]{0,600}?"usedCount"\s*<[\s\S]{0,400}?RETURNING/i.test(s), "ไม่พบคำสั่งเดียวแบบมีเงื่อนไข");
    ok(/UPDATE\s+"TripPriceRule"[\s\S]{0,700}?"tenantId"/.test(s), "คำสั่งไม่มี tenantId");
    ok(!/"usedCount"\s*=\s*\$\{|usedCount:\s*[a-zA-Z_]+\s*\+\s*1|tripPriceRule\.update/.test(s), "พบการเขียนค่า usedCount ที่คำนวณในแอป");
    ok(/pg_advisory_xact_lock/.test(s), "ไม่มี advisory lock ต่อผู้ติดต่อ");
  });
  await st("S-9", "ไม่ลบฤดูกาล/กฎ (ไม่มี DELETE FROM \"TripSeason\"/\"TripPriceRule\"/\"TripPromoRedemption\" · .delete/.deleteMany) · ไม่มีไฟล์ใดของใบเขียน policySnapshot", () => {
    const bad: string[] = [];
    for (const f of OWN) {
      const s = srcOf(f);
      if (/DELETE\s+FROM\s+"Trip(Season|PriceRule|PromoRedemption)"|trip(Season|PriceRule|PromoRedemption)\.(delete|deleteMany)\s*\(/.test(s)) bad.push(`${f}: ลบแถว`);
      if (/policySnapshot/.test(s) && /(UPDATE\s+"TripBooking"|tripBooking\.(update|create|upsert))/.test(s)) bad.push(`${f}: เขียน policySnapshot`);
    }
    ok(OWN.some((f) => srcOf(f)), "ยังไม่มีไฟล์"); ok(bad.length === 0, bad.join(" · "));
  });
  await st("S-10", "pricing-actions.ts: \"use server\" · ทุก export เป็น async function · requireUnit + assertCan · canOverride ส่งหลัง assertCan(\"trips.price.override\") เท่านั้น · ไม่รับ now", () => {
    const s = srcOf(D + "pricing-actions.ts"); ok(s, "ไม่มีไฟล์");
    ok(/^\s*["']use server["']/.test(read(D + "pricing-actions.ts")), "ไม่มี use server");
    ok(!/export\s+(const|let|class|\{)/.test(s), "มี export ที่ไม่ใช่ async function");
    const fns = [...s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)\{([\s\S]*?)\n\}/g)];
    ok(fns.length >= 5, `action น้อยไป ${fns.length}`);
    const bad = fns.filter((m) => !/requireUnit/.test(m[3]) || !/assertCan/.test(m[3]) || /\bnow\b/.test(m[2])).map((m) => m[1]);
    for (const m of fns) if (/canOverride\s*:\s*true/.test(m[3])) { const a = m[3].indexOf("trips.price.override"), b = m[3].search(/canOverride\s*:\s*true/); if (a < 0 || a > b) bad.push(`${m[1]}: canOverride ก่อนตรวจสิทธิ์`); }
    ok(bad.length === 0, `ไม่ครบ: ${bad.join(", ")}`);
  });
  await st("S-11", "สิทธิ์ trips.price.edit + trips.price.override ใน MODULE_DEFS โมดูล trips (ป้ายไทย)", async () => {
    const Pm = (await tryImport("@/lib/core/permissions")).mod;
    const isKey = Pm?.isPermissionKey as ((k: string) => boolean) | undefined, label = Pm?.permissionLabel as ((k: string) => string) | undefined, mod = Pm?.moduleOfPermissionKey as ((k: string) => string) | undefined;
    ok(isKey && label && mod, "โหลด permissions ไม่ได้");
    const miss = PERM_KEYS.filter((k) => !isKey?.(k) || !THAI.test(String(label?.(k) ?? "")) || mod?.(k) !== "trips");
    ok(miss.length === 0, `ยังไม่ลงทะเบียน: ${miss.join(", ")}`);
  });
  await st("S-12", "event 3 ตัวลง 3 ทะเบียน (consumer · automation ป้ายไทย · webhook)", async () => {
    const cons = stripComments(read("src/lib/outbox-consumers.ts"));
    const ae = asArr((await tryImport("@/lib/automation/labels")).mod?.AUTOMATION_EVENTS), we = asArr((await tryImport("@/lib/webhooks/labels")).mod?.WEBHOOK_EVENTS);
    const bad: string[] = [];
    for (const e of EVENTS) {
      if (!new RegExp(`["']${e.replace(/\./g, "\\.")}["']\\s*:`).test(cons)) bad.push(`${e}(consumer)`);
      const a = ae.find((x) => x.value === e); if (!a || !THAI.test(String(a.label))) bad.push(`${e}(automation)`);
      if (!we.some((x) => x.value === e)) bad.push(`${e}(webhook)`);
    }
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-13", "sellable-impl: quote เรียก quoteTrips (ไม่ใช่ KIND_NOT_SUPPORTED) · zod strictObject ใน prices.ts/pricing-core.ts", () => {
    const s = srcOf(D + "sellable-impl.ts"); ok(s, "ไม่มี sellable-impl.ts");
    const i = s.search(/\bquote\s*[:(]/); ok(i >= 0 && /quoteTrips/.test(s.slice(i, i + 400)), "quote ยังไม่เรียก quoteTrips");
    ok(/strictObject/.test(srcOf(D + "prices.ts")) && /strictObject/.test(srcOf(D + "pricing-core.ts")), "ไม่มี z.strictObject");
  });
  groupLine("S");

  // ═══════════════ C. ตัวช่วยเงิน ═══════════════
  console.log("\n── C: ตัวช่วยเงินบริสุทธิ์ ──");
  await st("C-1", "PRICE_STEPS = RETAIL SEASON DEPARTURE RULE TIER CONTRACT PROMO MANUAL (CC §F.1 ตรงลำดับ)", () => eq(needTrips().PRICE_STEPS, STEPS, "PRICE_STEPS"));
  await st("C-2", "mulBpHalfUp / mulDivHalfUp: 105,000×300bp = 3,150 · 98,131×300bp = 2,943.93→2,944 · ครึ่งพอดีปัดขึ้น · ค่าลบสมมาตร · ค่าใหญ่ไม่เพี้ยน (BigInt)", () => {
    const mb = fn("mulBpHalfUp"), md = fn("mulDivHalfUp");
    eq([mb(105_000, 300), mb(98_131, 300), mb(50, 5_000), mb(1, 5_000), mb(-1, 5_000), md(995_000, 700, 10_700), md(9_007_199_254, 9_999, 10_007)], [3_150, 2_944, 25, 1, -1, 65_093, refMulDiv(9_007_199_254, 9_999, 10_007)], "ผล");
  });
  await st("C-3", "vatOfInclusive(9,950, 700) = 650.93 (ภาพ 13ค) · vatOfExclusive(10,000, 700) = 700.00 · divCeil(21,500.00, 15) = 1,433.34", () => {
    eq([fn("vatOfInclusive")(FX.RECEIPT_RC_0588.serviceInclVatSatang, VAT_BP), fn("vatOfExclusive")(1_000_000, VAT_BP), fn("divCeil")(FX.DEPARTURE_RACHA_1114.costSatang, FX.DEPARTURE_RACHA_1114.sold)],
      [FX.RECEIPT_RC_0588.vatSatang, 70_000, 143_334], "ผล");
  });
  await st("C-4", "allocateLastRemainder: ผลรวมตรง · บรรทัดสุดท้ายรับเศษ · น้ำหนัก 0 ได้ 0 · กำหนดได้ซ้ำ", () => {
    const al = fn("allocateLastRemainder");
    const a = al(100_001, [700_000, 245_000, 50_000]) as number[], b = al(100_001, [700_000, 245_000, 50_000]) as number[];
    eq(a.reduce((x, y) => x + y, 0), 100_001, "ผลรวม"); eq(a, b, "ซ้ำ"); eq(a.slice(0, 2), [refMulDiv(100_001, 700_000, 995_000), refMulDiv(100_001, 245_000, 995_000)], "บรรทัดก่อนสุดท้าย");
    eq(al(10, [0, 5, 0]) as number[], [0, 10, 0], "น้ำหนัก 0");
  });
  await st("C-5", "minorToSatang(cent, rateMicros): 100 USD × 35.5 = 3,550 บาท · ปัดครึ่งขึ้นต่อบรรทัด", () => {
    eq([fn("minorToSatang")(10_000, 35_500_000), fn("minorToSatang")(1, 35_500_000), fn("minorToSatang")(3, 33_333_333)], [355_000, 36, 100], "ผล");
  });
  await st("C-6", "อินพุตเข้ม: ช่องแปลก / qty ไม่ใช่จำนวนเต็ม / policy ขาดคีย์ที่ใช้ ⇒ VALIDATION (ไม่ throw)", () => {
    const a = mk(); (a as Rec).extra = 1;
    const b = mk(); (b.pax as Rec[])[0].qty = 1.5;
    const c = mk(); delete (c.policy as Rec)["trips.tax.vatRate"];
    for (const [x, w] of [[a, "ช่องแปลก"], [b, "qty"], [c, "คีย์ขาด"]] as const) codeR(resolve(x), "VALIDATION", w);
    ok(fmt(resolve(c).details).includes("trips.tax.vatRate"), "details ไม่บอกคีย์ที่ขาด");
  });
  groupLine("C");

  // ═══════════════ F. ตัวเลขภาพ/ฟิกซ์เจอร์ ═══════════════
  console.log("\n── F: ตัวเลขฟิกซ์เจอร์/ภาพ ผ่าน resolver ถึงสตางค์ ──");
  const B0142 = FX.BOOKING_TR_0142;
  const v01 = () => P({ adults: B0142.adults, children: B0142.children, camera: 1 });
  await st("F-1", "ภาพ 01 (TR-6911-0142): 2 ผู้ใหญ่ 3,500 + เด็ก 2,450 + อุทยาน 2×600 + 1×300 + กล้อง 500 = 11,450 · บรรทัดตรงฟิกซ์เจอร์ (จำนวน×ราคา=ยอด)", () => {
    const v = v01();
    eq(tot(v).payableSatang, B0142.totalSatang, "payable");
    const got = items(v).map((i) => [i.qty, i.unitMinor, i.amountSatang]).map(String).sort(), want = B0142.lines.map((l) => [l.qty, l.unitSatang, l.totalSatang]).map(String).sort();
    eq(got, want, "บรรทัด");
    eq(item(v, "seat:CHILD").unitMinor, R.childSatang, "เด็ก = 70%");
  });
  await st("F-2", "ภาพ 13ค: VAT ต่อเอกสาร 650.93 · ฐาน 9,299.07 · เก็บแทน 1,500 นอกฐาน · vatable 9,950", () => {
    const t = tot(v01()), r = FX.RECEIPT_RC_0588;
    eq([t.vatableSatang, t.vatSatang, t.vatBaseSatang, t.passThroughSatang], [r.serviceInclVatSatang, r.vatSatang, r.preVatSatang, r.parkPassThroughSatang], "VAT");
  });
  await st("F-3", "VAT ต่อบรรทัด = ปันจาก VAT เอกสาร (บรรทัดสุดท้ายรับเศษ) · Σ = 650.93 · บรรทัดเก็บแทน VAT 0 taxKind NONE", () => {
    const v = v01();
    eq(items(v).reduce((s, i) => s + Number(i.vatSatang), 0), FX.RECEIPT_RC_0588.vatSatang, "Σ vat บรรทัด");
    for (const i of items(v).filter((x) => x.passThrough)) eq([i.vatSatang, i.taxKind], [0, "NONE"], `${i.itemRef}`);
    eq(item(v, "seat:ADULT").vatSatang, refMulDiv(FX.RECEIPT_RC_0588.vatSatang, 700_000, FX.RECEIPT_RC_0588.serviceInclVatSatang), "ปันบรรทัดแรก");
  });
  const vAg = (o: AgO = {}, mo: MkO = {}) => P({ adults: AC.adults, channel: "AGENT_PORTAL", actor: "AGENT", agency: agency(o), ...mo });
  await st("F-4", "ภาพ 04/10: ระดับ B 15% ของ 7,000 = 1,050 · เก็บลูกค้า 8,200 · ค่าอุทยานไม่อยู่ในฐาน", () => {
    const v = vAg(), c = com(v);
    eq([c.baseSatang, c.rateBp, c.commissionSatang, tot(v).payableSatang, c.collectFromCustomerSatang], [AC.commissionBaseSatang, AC.commissionBp, AC.commissionSatang, AC.collectSatang, AC.collectSatang], "คอมฯ");
  });
  await st("F-5", "ไม่หัก ณ ที่จ่าย (wht.applies=false) ⇒ ส่งร้าน 7,150 (README)", () => eq(com(vAg({ wht: false })).remitToShopSatang, AC.toShopNoWhtSatang, "ส่งร้าน"));
  await st("F-6", "หัก 3% (gross-up) ⇒ W 31.50 · ส่งร้าน 7,181.50 · เอเจนซี่ได้ 1,050 (จอ 04ค/05/10)", () => {
    const c = com(vAg()); eq([asRec(c.wht)?.whtSatang, c.remitToShopSatang, c.agentEarnsSatang, c.commissionVatSatang], [AC.whtSatang, AC.toShopSatang, AC.commissionSatang, 0], "WHT");
  });
  await st("F-7", "VAT คอมฯ EXCLUSIVE (§H.4) ⇒ Vc 73.50 · ส่งร้าน 7,108.00", () => {
    const c = com(vAg({ vatMode: "EXCLUSIVE", vatRegistered: true })); eq([c.commissionVatSatang, c.remitToShopSatang], [FX.pct(AC.commissionSatang, VAT_BP), CC_EXCL], "EXCLUSIVE");
  });
  await st("F-8", "VAT คอมฯ INCLUSIVE (§H.4) ⇒ C 981.31 · Vc 68.69 · W 29.44 · ส่งร้าน 7,179.44", () => {
    const c = com(vAg({ vatMode: "INCLUSIVE", vatRegistered: true })), Cx = FX.preVat(AC.commissionSatang, VAT_BP);
    eq([c.commissionSatang, c.commissionVatSatang, asRec(c.wht)?.whtSatang, c.remitToShopSatang], [Cx, AC.commissionSatang - Cx, FX.pct(Cx, AC.whtBp), CC_INCL], "INCLUSIVE");
  });
  await st("F-9", "ระดับ A/B/C (20/15/10%) บน 7,000 ⇒ 1,400 / 1,050 / 700 (ภาพ 10)", () => {
    const got = (["A", "B", "C"] as const).map((k) => com(vAg({ rateBp: FX.AGENCY_TIERS[k].tourBp })).commissionSatang);
    eq(got, (["A", "B", "C"] as const).map((k) => FX.pct(AC.saleSatang, FX.AGENCY_TIERS[k].tourBp)), "คอมฯ");
  });
  await st("F-10", "กล้องคิดคอมฯ 50% (T44 EQUIPMENT · ภาพ 10): ฐาน 7,000 + 250 = 7,250 · คอมฯ 1,087.50 · commissionBp กล้อง 5000 · อุทยาน 0", () => {
    const v = vAg({}, { camera: 1 }), c = com(v);
    eq([c.baseSatang, c.commissionSatang, item(v, "extra:x_cam").commissionBp, item(v, "extra:x_park:ADULT").commissionBp], [AC.saleSatang + R.extras.camera.satang / 2, FX.pct(AC.saleSatang + R.extras.camera.satang / 2, AC.commissionBp), 5_000, 0], "ฐาน");
  });
  const vLA = (o: MkO = {}) => P({ productType: "LIVEABOARD", date: SIM.start, now: BKK(LB.bookedOn, "12:00"), adults: LB.persons, days: SIM.nights + 1, nights: SIM.nights,
    prices: [price({ amount: LB.cabinPerPersonSatang })], extras: [{ ...X_PARK, paxPrices: { ADULT: SIM.parkPerPersonSatang } }],
    policy: { "trips.pay.depositPct": SIM.depositBp / 100, "trips.pay.balanceDueDaysBefore": SIM.balanceDaysBefore }, ...o });
  await st("F-11", "ภาพ 03 (LB-7002-0031): 2 × 32,900 + อุทยาน 2 × 1,800 = 69,400 · มัดจำ 30% ของค่าเคบิน 19,740 · งวด 2 49,660 ครบ 16 ธ.ค. 2569 (ร้าน) · อุทยานอยู่งวดสุดท้าย", () => {
    const v = vLA(), s = asArr(v.paymentSchedule);
    eq(tot(v).payableSatang, LB.totalSatang, "รวม");
    eq(s.map((x) => [x.seq, x.kind, x.amountSatang, x.passThroughSatang]), [[1, "DEPOSIT", LB.depositSatang, 0], [2, "BALANCE", LB.balanceSatang, LB.parkSatang]], "งวด");
    eq([bkkYmd(s[1]?.dueAt), bkkYmd(s[0]?.dueAt)], [LB.balanceDue, LB.bookedOn], "วันครบกำหนด (เวลาร้าน)");
    for (const x of s) eq(Number(x.vatableSatang) + Number(x.passThroughSatang), x.amountSatang, `งวด ${x.seq} แยกยอด`);
  });
  const SEAS = [season("s_main", MAIN_FROM, MAIN_TO, 0), season("s_ny", NY.from, NY.to, 10), season("s_off", OFF_FROM, OFF_TO, 0)];
  const seasonPrices = () => [price({ id: "pr_retail_A", amount: M16?.main[0] ?? -1 }), price({ id: "pr_main_A", seasonId: "s_main", amount: M16?.main[0] ?? -1 }), price({ id: "pr_ny_A", seasonId: "s_ny", amount: M16?.ny[0] ?? -1 }),
    price({ id: "pr_off_A", seasonId: "s_off", amount: M16?.off[0] ?? -1 }), price({ id: "pr_d1231_A", departureId: "d_1231", amount: M16?.dec31[0] ?? -1 })];
  const vS = (date: string, depId?: string, extra: Rec[] = []) => P({ date, depId, adults: 1, children: 1, prices: [...seasonPrices(), ...extra], seasons: SEAS });
  await st("F-12", "ภาพ 16: 14 พ.ย. ฤดูหลัก 3,500/2,450 (SEASON) · 25 ธ.ค. ปีใหม่ 3,900/2,730 · 31 ธ.ค. ราคารอบ 4,500/3,150 ทับ \"ปีใหม่\" (DEPARTURE) · 10 มิ.ย. 70 นอกฤดู 2,900/2,030 · พ.ย. 70 นอกทุกฤดู = ปลีก", () => {
    ok(M16, "อ่าน README ไม่ได้");
    const cases: [string, string | undefined, number[], string][] = [["2026-11-14", undefined, M16!.main, "SEASON"], ["2026-12-25", undefined, M16!.ny, "SEASON"], ["2026-12-31", "d_1231", M16!.dec31, "DEPARTURE"], ["2027-06-10", undefined, M16!.off, "SEASON"], ["2027-11-15", undefined, M16!.main, "RETAIL"]];
    for (const [d, dep, want, src] of cases) { const v = vS(d, dep); eq([item(v, "seat:ADULT").unitMinor, item(v, "seat:CHILD").unitMinor, item(v, "seat:ADULT").priceSource], [...want, src], d); }
  });
  await st("F-13", "เด็ก 70% = ค่าปริยาย (trace note CHILD_PCT) · ราคาเด็กตั้งเองในระดับเดียวกันชนะ · ระดับหลัง (รอบ 31 ธ.ค. ผู้ใหญ่อย่างเดียว) ชนะเด็กตั้งเองของฤดู · T28 null ⇒ ไม่มีราคาเด็ก = PRICE_MISSING", () => {
    const childNY = price({ id: "pr_ny_C", seasonId: "s_ny", paxTypeId: "pt_C", amount: 280_000 });
    const a = vS("2026-12-25", undefined, [childNY]), b = vS("2026-12-31", "d_1231", [childNY]), c = vS("2026-12-25");
    eq([item(a, "seat:CHILD").unitMinor, item(b, "seat:CHILD").unitMinor], [280_000, M16?.dec31[1]], "เด็ก");
    ok(asArr(item(c, "seat:CHILD").priceTrace).some((t) => t.note === "CHILD_PCT") && !asArr(item(a, "seat:CHILD").priceTrace).some((t) => t.step === "SEASON" && t.note === "CHILD_PCT"), "note CHILD_PCT");
    codeR(resolve(mk({ adults: 1, children: 1, policy: { "trips.pax.childPricePct": null } })), "VALIDATION", "T28 null", "PRICE_MISSING");
  });
  const snapOf = (inp: Rec, pol: Rec = {}): Rec => {
    const pr = resolve(inp); const priced = V(pr, "resolve");
    const s = fn("toTripsSnapshot")({ input: inp, priced, policy: { trips: tripsPolicySnap(pol), agency: null } });
    ok(asRec(s), `toTripsSnapshot: ${fmt(s)}`); return s as Rec;
  };
  const rec = (snap: Rec, ev: Rec): Rec => { const r = fn("recomputeFromSnapshot")(snap, ev); return asRec(asRec(r)?.ok === true ? asRec(r)?.value : r) ?? {}; };
  const in15 = () => mk({ date: RF.travelDate, now: BKK(RF.bookedOn, "12:00"), adults: 2, children: 1, camera: 1 });
  await st("F-14", "ภาพ 15 (TR-6912-0188) จาก snapshot อย่างเดียว: 23 วัน ⇒ 50% · คืน 6,475 · ร้านเก็บ 4,975 · VAT คืน 325.47 (ฐาน 4,649.53) · บรรทัดตามฟิกซ์เจอร์", () => {
    const r = rec(snapOf(in15()), { kind: "CANCEL", at: RF.requestedAt, reasonKind: "CUSTOMER" });
    eq([r.daysBefore, r.refundBp, r.refundSatang, r.keptSatang, r.refundPassThroughSatang], [RF.daysBefore, RF.refundBp, RF.refundSatang, RF.keptSatang, RF.lines[2].refundSatang], "คืน");
    const vatRefund = refVatIncl(RF.lines[0].refundSatang + RF.lines[1].refundSatang, VAT_BP);
    eq([r.refundVatSatang, r.keptVatSatang], [vatRefund, FX.RECEIPT_RC_0588.vatSatang - vatRefund], "VAT");
  });
  await st("F-15", "ตารางการจอง PTD (จอ 05): 0151 · 0146 พีพี · LB-7002-0029 · 0139 — เก็บลูกค้า / ส่งร้าน / คอมฯ ตรงทุกแถว", () => {
    const bad: string[] = [];
    for (const row of FX.PTD_BOOKINGS_TABLE.filter((x) => x.collectSatang !== null && ["racha", "phiphi", "liveaboard"].includes(x.product))) {
      const n = Number((/(\d+) (ผู้ใหญ่|คน)/.exec(row.pax) ?? [])[1]);
      const la = row.product === "liveaboard", phi = row.product === "phiphi";
      const unit = la ? FX.CABIN_TYPES.S.perPersonSatang : phi ? FX.PRODUCT_PHIPHI.adultSatang : R.adultSatang;
      const park = la ? SIM.parkPerPersonSatang : R.parkAdultSatang;
      const v = P({ adults: n, date: row.date, productType: la ? "LIVEABOARD" : "TOUR", channel: "AGENT_PORTAL", actor: "AGENT", prices: [price({ amount: unit })],
        extras: phi ? [] : [{ ...X_PARK, paxPrices: { ADULT: park } }], agency: agency({ rateBp: la ? FX.AGENCY_TIERS.B.liveaboardBp : FX.AGENCY_PTD.commissionBp }) }, row.ref);
      const got = [tot(v).payableSatang, com(v).remitToShopSatang, com(v).commissionSatang], want = [row.collectSatang, row.toShopSatang, row.earnSatang];
      if (!isDeepStrictEqual(got, want)) bad.push(`${row.ref}: ${fmt(got)} ≠ ${fmt(want)}`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("F-16", "รอบ ส. 14 พ.ย. (README :39): 6 การจอง ⇒ ค่าทริป 50,400 · อุทยาน 8,400 · คอมฯ PTD 3,150 (รวมลิงก์ร้านเก็บ) + Blue Planet ระดับ C 945", () => {
    const DEP = FX.DEPARTURE_RACHA_1114; let rev = 0, park = 0, ptd = 0, bp = 0;
    for (const b of DEP.bookings) {
      const ag = b.agency === "PTD" ? agency({ rateBp: FX.AGENCY_PTD.commissionBp, collector: b.channel === "AGENCY_LINK" ? "SHOP_COLLECTS" : "AGENT_COLLECTS" }) : b.agency === "BLUE_PLANET" ? agency({ rateBp: FX.AGENCY_BLUE_PLANET.commissionBp }) : null;
      const v = P({ adults: b.adults, children: b.children, agency: ag, channel: ag ? "AGENT_PORTAL" : "WEB", actor: ag ? "AGENT" : "PUBLIC" }, b.ref);
      for (const i of items(v)) { if (i.passThrough) park += Number(i.amountSatang); else rev += Number(i.amountSatang); }
      if (b.agency === "PTD") ptd += Number(com(v).commissionSatang); if (b.agency === "BLUE_PLANET") bp += Number(com(v).commissionSatang);
    }
    eq([rev, park, ptd, bp, ptd + bp], [DEP.revenueSatang, DEP.parkSatang, DEP.commission.ptdSatang, DEP.commission.bluePlanetSatang, DEP.commission.totalSatang], "รอบ");
  });
  groupLine("F");

  // ═══════════════ RS. ขั้นทับกัน + trace ═══════════════
  console.log("\n── RS: ขั้นตัวเลือกราคา (ตัวท้ายชนะ · trace) ──");
  const FULL_PRICES = [price({ id: "rs_r", amount: 350_000 }), price({ id: "rs_s", seasonId: "s_ny", amount: 390_000 }), price({ id: "rs_d", departureId: "d_rs", amount: 450_000 })];
  const EB = (bp = 1_000, o: Rec = {}) => rule("ru_eb", { kind: "EARLY_BIRD", minDaysBefore: 1, discountBp: bp }, o);
  const PROMO = (o: Rec = {}) => rule("ru_code", { kind: "PROMO_CODE", code: "SEA10", discountBp: 1_000, ...o });
  const rsIn = (o: MkO = {}) => ({ date: "2026-12-31", depId: "d_rs", adults: 2, seasons: [season("s_ny", NY.from, NY.to, 10)], prices: FULL_PRICES, extras: [X_PARK], ...o });
  const adultOf = (o: MkO) => item(P(rsIn(o)), "seat:ADULT");
  await st("RS-1", "ปลีกอย่างเดียว ⇒ priceSource RETAIL · trace [RETAIL] refId แถวราคา", () => { const a = adultOf({ seasons: [], prices: [FULL_PRICES[0]] }); eq([a.unitMinor, a.priceSource, steps(a), asArr(a.priceTrace)[0]?.refId], [350_000, "RETAIL", ["RETAIL"], "rs_r"], "RETAIL"); });
  await st("RS-2", "ฤดูกาลทับปลีก ⇒ SEASON · trace [RETAIL, SEASON]", () => { const a = adultOf({ prices: FULL_PRICES.slice(0, 2) }); eq([a.unitMinor, a.priceSource, steps(a)], [390_000, "SEASON", ["RETAIL", "SEASON"]], "SEASON"); });
  await st("RS-3", "ราคารอบทับฤดูกาล ⇒ DEPARTURE · trace 3 ขั้น", () => { const a = adultOf({}); eq([a.unitMinor, a.priceSource, steps(a)], [450_000, "DEPARTURE", ["RETAIL", "SEASON", "DEPARTURE"]], "DEPARTURE"); });
  await st("RS-4", "กฎ (EARLY_BIRD 10%) ทับราคารอบ ⇒ 405,000 · RULE refId กฎ", () => { const a = adultOf({ rules: [EB()] }); eq([a.unitMinor, a.priceSource, steps(a).at(-1), asArr(a.priceTrace).at(-1)?.refId], [405_000, "RULE", "RULE", "ru_eb"], "RULE"); });
  await st("RS-5", "ระดับเอเจนซี่ที่มีราคา ⇒ TIER ทับกฎ · ระดับที่ไม่มีราคา = ไม่แตะราคา (ไม่มี TIER ใน trace)", () => {
    const a = adultOf({ rules: [EB()], agency: agency({ tierPrice: { ADULT: 400_000 } }), actor: "AGENT", channel: "AGENT_PORTAL" });
    const b = adultOf({ agency: agency(), actor: "AGENT", channel: "AGENT_PORTAL" });
    eq([a.unitMinor, a.priceSource, steps(a).at(-1), b.unitMinor, steps(b).includes("TIER")], [400_000, "TIER", "TIER", 450_000, false], "TIER");
  });
  await st("RS-6", "สัญญาเอเจนซี่ทับระดับ ⇒ CONTRACT (ราคา + อัตราคอมฯ ของสัญญา)", () => {
    const contract = { refId: "ct_ptd", mode: "COMMISSION_PCT", rateBp: NY && FX.AGENCY_DEFAULTS.peakNewYear.tourBp, fixedSatang: null, unitMinorByPaxCode: { ADULT: 380_000 }, minSellMinor: null, markupCapBp: null };
    const v = P(rsIn({ agency: agency({ tierPrice: { ADULT: 400_000 }, contract }), actor: "AGENT", channel: "AGENT_PORTAL" })), a = item(v, "seat:ADULT");
    eq([a.unitMinor, a.priceSource, com(v).rateSource, com(v).rateBp, com(v).commissionSatang], [380_000, "CONTRACT", "CONTRACT", FX.AGENCY_DEFAULTS.peakNewYear.tourBp, FX.pct(760_000, FX.AGENCY_DEFAULTS.peakNewYear.tourBp)], "CONTRACT");
  });
  await st("RS-7", "โค้ดส่วนลดทับต่อ ⇒ PROMO · ราคาต่อหน่วยคง · discountSatang = 10% ของยอด", () => {
    const a = adultOf({ promoCode: "SEA10", rules: [PROMO()] });
    eq([a.unitMinor, a.discountSatang, a.amountSatang, a.priceSource, steps(a).at(-1)], [450_000, 90_000, 810_000, "PROMO", "PROMO"], "PROMO");
  });
  await st("RS-8", "ครบ 8 ขั้น ⇒ trace ตามลำดับ PRICE_STEPS · ราคาแก้มือชนะทั้งหมด (ล้างส่วนลดโค้ดของบรรทัด) · priceSource MANUAL", () => {
    const contract = { refId: "ct", mode: "COMMISSION_PCT", rateBp: 1_000, fixedSatang: null, unitMinorByPaxCode: { ADULT: 380_000 }, minSellMinor: null, markupCapBp: null };
    const a = adultOf({ rules: [EB(), PROMO()], promoCode: "SEA10", agency: agency({ tierPrice: { ADULT: 400_000 }, contract }), actor: "STAFF", channel: "COUNTER", canOverride: true,
      overrides: [{ itemRef: "seat:ADULT", unitMinor: 370_000, reason: "ลูกค้าประจำ ตกลงราคาพิเศษ" }] });
    eq([steps(a), a.unitMinor, a.discountSatang, a.priceSource], [STEPS, 370_000, 0, "MANUAL"], "ครบ");
  });
  await st("RS-9", "ขั้นที่ไม่มีข้อมูล = ข้ามไป (มีฤดูแต่ไม่มีราคาของสินค้านี้ · ไม่มีราคารอบ) · ไม่มีราคาใดเลย ⇒ VALIDATION PRICE_MISSING", () => {
    const a = adultOf({ prices: [FULL_PRICES[0]] }); eq([steps(a), a.unitMinor], [["RETAIL"], 350_000], "ข้าม");
    codeR(resolve(mk({ prices: [] })), "VALIDATION", "ไม่มีราคา", "PRICE_MISSING");
  });
  await st("RS-10", "ตัวกรองแถวราคา: weekdayMask (พฤ. 31 ธ.ค. = บิต 4) · bookFrom/bookTo (วันจองร้าน) · travelFrom/travelTo", () => {
    const wk = (mask: number) => adultOf({ seasons: [], prices: [FULL_PRICES[0], price({ id: "w", amount: 300_000, weekdayMask: mask, priority: 5 })] }).unitMinor;
    eq([wk(1 << 4), wk(1 << 5)], [300_000, 350_000], "weekday");
    const bw = (from: string, to: string) => adultOf({ seasons: [], prices: [FULL_PRICES[0], price({ id: "b", amount: 320_000, bookFrom: from, bookTo: to, priority: 5 })] }).unitMinor;
    eq([bw("2026-11-12", "2026-11-12"), bw("2026-11-13", "2026-12-01")], [320_000, 350_000], "ช่วงจอง");
    const tw = (from: string, to: string) => adultOf({ seasons: [], prices: [FULL_PRICES[0], price({ id: "t", amount: 330_000, travelFrom: from, travelTo: to, priority: 5 })] }).unitMinor;
    eq([tw("2026-12-31", "2026-12-31"), tw("2027-01-01", "2027-01-31")], [330_000, 350_000], "ช่วงเดินทาง");
  });
  await st("RS-11", "ระดับเดียวกัน: optionId ตรงชนะ null · paxTypeId ตรงชนะ null · priority สูงชนะ", () => {
    const a = adultOf({ seasons: [], prices: [price({ id: "n", amount: 350_000 }), price({ id: "o", amount: 340_000, optionId: "o_join" }), price({ id: "x", amount: 100_000, optionId: "o_other", priority: 99 })] });
    const b = adultOf({ seasons: [], prices: [price({ id: "any", amount: 360_000, paxTypeId: null, priority: 9 }), price({ id: "ad", amount: 350_000 })] });
    const c = adultOf({ seasons: [], prices: [price({ id: "p0", amount: 350_000 }), price({ id: "p1", amount: 355_000, weekdayMask: 127, priority: 1 })] });
    eq([a.unitMinor, b.unitMinor, c.unitMinor], [340_000, 350_000, 355_000], "ความเจาะจง");
  });
  groupLine("RS");

  // ═══════════════ PT. บรรทัดเก็บแทน ═══════════════
  console.log("\n── PT: บรรทัดเก็บแทน (ข้ามขั้น 4–8) ──");
  const parkAmts = (v: Rec) => items(v).filter((i) => i.passThrough).map((i) => [i.itemRef, i.unitMinor, i.amountSatang, i.discountSatang, i.commissionBp, i.priceSource]);
  await st("PT-1", "อุทยานไม่เปลี่ยนภายใต้ กฎ/ระดับ/สัญญา/โค้ด/แก้มือ — ทุกกรณีเท่ากับกรณีปลีก", () => {
    const base = parkAmts(P(rsIn({ adults: 2 })));
    const all = parkAmts(P(rsIn({ adults: 2, rules: [EB(5_000), PROMO({ discountBp: 5_000 })], promoCode: "SEA10", agency: agency({ tierPrice: { ADULT: 1 } }), actor: "STAFF", channel: "COUNTER", canOverride: true,
      overrides: [{ itemRef: "seat:ADULT", unitMinor: 1_000, reason: "ทดสอบราคาแก้มือยาวพอ" }] })));
    eq(all, base, "อุทยาน");
  });
  await st("PT-2", "เก็บแทนไม่อยู่ในฐานคอมฯ: ขึ้นค่าอุทยาน 10 เท่า ⇒ ฐาน/คอมฯ เท่าเดิม · ส่งร้านเพิ่มเท่าส่วนต่างพอดี", () => {
    const a = vAg(), b = vAg({}, { extras: [{ ...X_PARK, paxPrices: { ADULT: R.parkAdultSatang * 10 } }] });
    eq([com(b).baseSatang, com(b).commissionSatang, Number(com(b).remitToShopSatang) - Number(com(a).remitToShopSatang)], [com(a).baseSatang, com(a).commissionSatang, AC.parkSatang * 9], "PT");
  });
  await st("PT-3", "เก็บแทนไม่อยู่ในฐานส่วนลด: โค้ด 50% ⇒ อุทยานไม่ลด · ส่วนลดเงินก้อนเกินยอดลดได้ ⇒ ลดเท่ายอดลดได้ อุทยานเต็ม", () => {
    const a = P({ adults: 2, camera: 1, rules: [PROMO({ discountBp: 5_000 })], promoCode: "SEA10" });
    const b = P({ adults: 2, camera: 1, rules: [rule("ru_m", { kind: "PROMO_CODE", code: "BIG", discountMinor: 99_999_999 })], promoCode: "BIG" });
    eq([item(a, "extra:x_park:ADULT").discountSatang, tot(a).discountSatang, tot(b).discountSatang, tot(b).payableSatang], [0, 375_000, 750_000, AC.parkSatang], "PT");
  });
  await st("PT-4", "แก้มือบรรทัดเก็บแทน ⇒ VALIDATION PASS_THROUGH_LOCKED", () => {
    codeR(resolve(mk({ actor: "STAFF", channel: "COUNTER", canOverride: true, overrides: [{ itemRef: "extra:x_park:ADULT", unitMinor: 1, reason: "ทดสอบแก้ค่าอุทยาน" }] })), "VALIDATION", "PT override", "PASS_THROUGH_LOCKED");
  });
  await st("PT-5", "W05: อุทยานต่อคนไม่ตรงค่าใดของ T45 ⇒ คำเตือน W05 (ไม่บล็อก) · ตรง shopRates ⇒ ไม่มี W05", () => {
    eq([warns(P({})).includes("W05"), warns(P({ extras: [{ ...X_PARK, paxPrices: { ADULT: 65_000 } }] })).includes("W05")], [false, true], "W05");
  });
  groupLine("PT");

  // ═══════════════ RU. กฎราคา 6 ชนิด ═══════════════
  console.log("\n── RU: กฎราคา + ขอบ ──");
  const T = "2027-03-10";
  const ru = (rules: Rec[], o: MkO = {}) => item(P({ date: T, adults: 2, extras: [], rules, ...o }), "seat:ADULT");
  const EB30 = rule("eb30", { kind: "EARLY_BIRD", minDaysBefore: 30, discountBp: 1_000 });
  await st("RU-1", "EARLY_BIRD: จองก่อน 30 วันพอดี ⇒ ลด · 29 วัน ⇒ ไม่ลด", () => {
    eq([ru([EB30], { now: BKK(addDaysYmd(T, -30), "12:00") }).unitMinor, ru([EB30], { now: BKK(addDaysYmd(T, -29), "12:00") }).unitMinor], [315_000, 350_000], "EB");
  });
  await st("RU-2", "EARLY_BIRD ขอบเที่ยงคืนเขตเวลาร้าน: 23:59:59 (30 วัน) ⇒ ลด · 00:00:00 (29 วัน) ⇒ ไม่ลด", () => {
    const d = addDaysYmd(T, -30);
    eq([ru([EB30], { now: `${d}T16:59:59.000Z` }).unitMinor, ru([EB30], { now: `${d}T17:00:00.000Z` }).unitMinor], [315_000, 350_000], "เที่ยงคืน");
  });
  await st("RU-3", "LAST_MINUTE 24 ชม.: เหลือ 24:00 พอดี ⇒ ลด · 24:01 ⇒ ไม่ลด · หลังออกเดินทาง ⇒ ไม่ลด", () => {
    const LM = rule("lm", { kind: "LAST_MINUTE", maxHoursBefore: 24, discountMinor: 50_000 }); const s = BKK(T, "08:00").getTime();
    eq([ru([LM], { now: new Date(s - 24 * 3_600_000) }).unitMinor, ru([LM], { now: new Date(s - 24 * 3_600_000 - 60_000) }).unitMinor, ru([LM], { now: new Date(s + 60_000) }).unitMinor], [300_000, 350_000, 350_000], "LM");
  });
  const GT = rule("gt", { kind: "GROUP_TIER", tiers: [{ minPax: 4, discountBp: 500 }, { minPax: 10, discountBp: 1_000 }] });
  await st("RU-4", "GROUP_TIER: 3 คน ⇒ 0 · 9 คน ⇒ 5% · 10 คนพอดี ⇒ 10%", () => {
    eq([3, 9, 10].map((n) => ru([GT], { adults: n }).unitMinor), [350_000, 332_500, 315_000], "กลุ่ม");
  });
  const FL = rule("fl", { kind: "FREE_LEADER", everyPaid: FX.AGENCY_DEFAULTS.groupFreeSeat.minPax, freeQty: FX.AGENCY_DEFAULTS.groupFreeSeat.freeSeats, paxTypeCode: "ADULT" });
  await st("RU-5", "FREE_LEADER (ภาพ 10 กลุ่ม 10 ฟรี 1): 10 ⇒ จ่าย 9 + ฟรี 1 บรรทัด seat:ADULT:free ราคา 0 · 9 ⇒ ไม่มีฟรี · 20 ⇒ ฟรี 2 · ที่นั่งฟรีไม่อยู่ในฐานคอมฯ", () => {
    const f = (n: number, ag: Rec | null = null) => P({ date: T, adults: n, extras: [], rules: [FL], agency: ag, actor: ag ? "AGENT" : "PUBLIC", channel: ag ? "AGENT_PORTAL" : "WEB" });
    const v10 = f(10), v9 = f(9), v20 = f(20), va = f(10, agency());
    eq([item(v10, "seat:ADULT").qty, item(v10, "seat:ADULT:free").qty, item(v10, "seat:ADULT:free").amountSatang, item(v10, "seat:ADULT:free").priceSource], [9, 1, 0, "RULE"], "10");
    eq([items(v9).some((i) => i.itemRef === "seat:ADULT:free"), item(v20, "seat:ADULT:free").qty, com(va).baseSatang], [false, 2, 9 * 350_000], "9/20/ฐาน");
  });
  await st("RU-6", "BLACKOUT วันเดินทาง ⇒ ไม่ใช้กฎขั้น 4 และไม่ใช้โค้ด · ราคาฤดูกาลยังใช้ · คำเตือน BLACKOUT_APPLIED", () => {
    const BO = rule("bo", { kind: "BLACKOUT", dates: [T], ranges: [] });
    const v = P({ date: T, adults: 2, extras: [], now: BKK("2027-01-01", "12:00"), seasons: [season("s_x", "2027-03-01", "2027-03-31", 1)], prices: [RETAIL, price({ seasonId: "s_x", amount: 380_000 })], rules: [EB30, BO, PROMO()], promoCode: "SEA10" });
    eq([item(v, "seat:ADULT").unitMinor, tot(v).discountSatang, item(v, "seat:ADULT").priceSource, warns(v).includes("BLACKOUT_APPLIED")], [380_000, 0, "SEASON", true], "blackout");
  });
  await st("RU-7", "appliesTo: paxTypeCodes [CHILD] ⇒ ลดเด็กอย่างเดียว · channels [COUNTER] บนช่อง WEB ⇒ ไม่ลด · optionIds อื่น ⇒ ไม่ลด", () => {
    const now = BKK("2027-01-01", "12:00");
    const v = P({ date: T, now, adults: 1, children: 1, extras: [], rules: [rule("c", { kind: "EARLY_BIRD", minDaysBefore: 1, discountBp: 1_000, appliesTo: { paxTypeCodes: ["CHILD"] } })] });
    eq([item(v, "seat:ADULT").unitMinor, item(v, "seat:CHILD").unitMinor], [350_000, 220_500], "เด็กเท่านั้น");
    eq([ru([rule("ch", { kind: "EARLY_BIRD", minDaysBefore: 1, discountBp: 1_000, appliesTo: { channels: ["COUNTER"] } })], { now }).unitMinor,
      ru([rule("op", { kind: "EARLY_BIRD", minDaysBefore: 1, discountBp: 1_000, appliesTo: { optionIds: ["o_other"] } })], { now }).unitMinor], [350_000, 350_000], "ช่องทาง/ตัวเลือก");
  });
  await st("RU-8", "ไม่ซ้อนในขั้น 4: EARLY_BIRD 10% + GROUP_TIER 5% ⇒ 315,000 (ตัวต่ำสุดชนะ ไม่ใช่ 299,250) · trace refId = eb30", () => {
    const a = ru([EB30, GT], { adults: 9, now: BKK("2027-01-01", "12:00") });
    eq([a.unitMinor, asArr(a.priceTrace).filter((t) => t.step === "RULE").map((t) => t.refId)], [315_000, ["eb30"]], "best-of");
  });
  await st("RU-9", "FREE_LEADER ซ้อนหลังตัวชนะ: 10 คน + EARLY_BIRD 10% ⇒ 9 × 315,000 + ฟรี 1", () => {
    const v = P({ date: T, adults: 10, extras: [], rules: [EB30, FL], now: BKK("2027-01-01", "12:00") });
    eq([item(v, "seat:ADULT").qty, item(v, "seat:ADULT").unitMinor, tot(v).payableSatang], [9, 315_000, 9 * 315_000], "ซ้อน");
  });
  await st("RU-10", "ช่วงเดินทาง (dateFrom/dateTo) ไม่ครอบ ⇒ ไม่ใช้ · ช่วงจอง (bookFrom/bookTo) ไม่ครอบวันจองร้าน ⇒ ไม่ใช้ · ครอบทั้งคู่ ⇒ ใช้", () => {
    const now = BKK("2027-01-01", "12:00"); const g = (o: Rec) => ru([rule("w", { kind: "EARLY_BIRD", minDaysBefore: 1, discountBp: 1_000 }, o)], { now }).unitMinor;
    eq([g({ dateFrom: "2027-04-01", dateTo: "2027-04-30" }), g({ bookFrom: "2027-01-02", bookTo: "2027-01-31" }), g({ dateFrom: "2027-03-01", dateTo: "2027-03-31", bookFrom: "2027-01-01", bookTo: "2027-01-01" })], [350_000, 350_000, 315_000], "ช่วง");
  });
  await st("RU-11", "productId ของสินค้าอื่น ⇒ ไม่ใช้ · null = ทั้งหน่วย · active=false ⇒ ไม่ใช้", () => {
    const now = BKK("2027-01-01", "12:00");
    eq([ru([rule("o", { kind: "EARLY_BIRD", minDaysBefore: 1, discountBp: 1_000 }, { productId: "p_other" })], { now }).unitMinor, ru([rule("m", { kind: "EARLY_BIRD", minDaysBefore: 1, discountBp: 1_000 }, { productId: "p_racha" })], { now }).unitMinor,
      ru([rule("i", { kind: "EARLY_BIRD", minDaysBefore: 1, discountBp: 1_000 }, { active: false })], { now }).unitMinor], [350_000, 315_000, 350_000], "ขอบเขต");
  });
  await st("RU-12", "ส่วนลดเงินก้อนเกินราคา ⇒ ราคา 0 ไม่ติดลบ + W22 (HIGHEST) แต่ยังจองได้", () => {
    const v = P({ date: T, adults: 2, extras: [], cost: FX.DEPARTURE_RACHA_1114.costSatang, now: BKK("2027-01-01", "12:00"), rules: [rule("z", { kind: "EARLY_BIRD", minDaysBefore: 1, discountMinor: 999_999 })] });
    const w = asArr(v.warnings).find((x) => x.code === "W22");
    eq([item(v, "seat:ADULT").unitMinor, w?.severity], [0, "HIGHEST"], "0 + W22");
  });
  groupLine("RU");

  // ═══════════════ PR. โค้ด/แต้ม (บริสุทธิ์) ═══════════════
  console.log("\n── PR: โค้ดส่วนลด + ช่องแต้ม/คูปอง (บริสุทธิ์) ──");
  const prv = (code: string | null, r: Rec, o: MkO = {}) => P({ adults: 2, camera: 1, extras: [X_PARK, X_CAM, X_PORT], rules: [r], promoCode: code, ...o });
  const notApplied = (v: Rec, reason: string) => { const w = asArr(v.warnings).find((x) => x.code === "PROMO_NOT_APPLIED"); ok(w, `ไม่มี PROMO_NOT_APPLIED: ${fmt(v.warnings)}`); eq(asRec(w?.details)?.reason ?? w?.reason, reason, "reason"); eq(tot(v).discountSatang, 0, "ส่วนลด"); };
  await st("PR-1", "โค้ด \" sea10 \" (ตัดช่องว่าง · ไม่สนตัวพิมพ์) ⇒ ลด 10% เฉพาะบรรทัดลดได้: ที่นั่ง + กล้อง · ค่าท่าเรือ (ลดไม่ได้) และอุทยาน = 0 · promo.ruleId", () => {
    const v = prv(" sea10 ", PROMO());
    eq([item(v, "seat:ADULT").discountSatang, item(v, "extra:x_cam").discountSatang, item(v, "extra:x_port").discountSatang, item(v, "extra:x_park:ADULT").discountSatang, asRec(v.promo)?.ruleId], [70_000, 5_000, 0, 0, "ru_code"], "ลด");
  });
  await st("PR-2", "โค้ดหมดอายุ (validTo เมื่อวานของร้าน) ⇒ EXPIRED · ยังไม่เริ่ม (validFrom พรุ่งนี้) ⇒ NOT_YET · quote ยังสำเร็จ", () => {
    notApplied(prv("SEA10", PROMO({ validTo: "2026-11-11" })), "EXPIRED"); notApplied(prv("SEA10", PROMO({ validFrom: "2026-11-13" })), "NOT_YET");
  });
  await st("PR-3", "โค้ดไม่รู้จัก ⇒ UNKNOWN (คำเตือน ไม่ใช่ error)", () => notApplied(prv("NOPE", PROMO()), "UNKNOWN"));
  await st("PR-4", "usedCount = maxUses ⇒ EXHAUSTED · active=false ⇒ UNKNOWN", () => {
    notApplied(prv("SEA10", { ...PROMO({ maxUses: 5 }), usedCount: 5 }), "EXHAUSTED"); notApplied(prv("SEA10", { ...PROMO(), active: false }), "UNKNOWN");
  });
  await st("PR-5", "ส่วนลดเงินก้อน 1,000.01 ปันลงบรรทัดลดได้ตามสัดส่วน (บรรทัดสุดท้ายรับเศษ) · Σ = 100,001 สตางค์พอดี", () => {
    const v = prv("M", rule("m", { kind: "PROMO_CODE", code: "M", discountMinor: 100_001 }));
    const ds = items(v).map((i) => Number(i.discountSatang));
    eq([ds.reduce((a, b) => a + b, 0), tot(v).discountSatang, ds.every(Number.isInteger)], [100_001, 100_001, true], "ปัน");
  });
  await st("PR-6", "ช่องแต้ม/คูปอง (port X.2): provider 200.00 ⇒ ลดบนบรรทัดลดได้ · trace PROMO refId = ref ของ provider · ไม่มี provider ⇒ ไม่มีส่วนลด · facade มี registerTripPromoProvider", () => {
    const v = P({ adults: 2, camera: 1, providers: [{ key: "MEMBER_POINTS", ref: "pts_1", label: "แต้มสมาชิก", discountSatang: 20_000 }] });
    eq([tot(v).discountSatang, items(v).filter((i) => i.passThrough).every((i) => i.discountSatang === 0), items(v).some((i) => asArr(i.priceTrace).some((t) => t.step === "PROMO" && t.refId === "pts_1"))], [20_000, true, true], "provider");
    ok(typeof needTrips().registerTripPromoProvider === "function", "ไม่มี registerTripPromoProvider");
  });
  await st("PR-7", "โปรกับสกุลต่างประเทศ (Liveaboard USD) ⇒ PROMO_NOT_APPLIED CURRENCY", () => {
    notApplied(P({ productType: "LIVEABOARD", currency: "USD", adults: 2, extras: [], prices: [price({ amount: 90_000, currency: "USD" })], rules: [PROMO()], promoCode: "SEA10",
      policy: { "trips.general.currencies": ["THB", "USD"], "trips.fx.rates": [{ currency: "USD", rateMicros: 35_500_000 }] } }), "CURRENCY");
  });
  groupLine("PR");

  // ═══════════════ MO. ราคาแก้มือ ═══════════════
  console.log("\n── MO: ราคาแก้มือ ──");
  const ov = (unitMinor: number, o: MkO = {}) => resolve(mk({ actor: "STAFF", channel: "COUNTER", canOverride: true, overrides: [{ itemRef: "seat:ADULT", unitMinor, reason: "ลูกค้าประจำ ขอราคาพิเศษ" }], ...o }));
  await st("MO-1", "ผู้กระทำ PUBLIC / AGENT ส่งราคาแก้มือ ⇒ FORBIDDEN (แม้ canOverride=true)", () => {
    codeR(ov(300_000, { actor: "PUBLIC", channel: "WEB" }), "FORBIDDEN", "PUBLIC"); codeR(ov(300_000, { actor: "AGENT", channel: "AGENT_PORTAL", agency: agency() }), "FORBIDDEN", "AGENT");
  });
  await st("MO-2", "STAFF ไม่ได้ canOverride จาก action ⇒ FORBIDDEN", () => codeR(ov(300_000, { canOverride: false }), "FORBIDDEN", "ไม่มีสิทธิ์"));
  await st("MO-3", "เหตุผลสั้นกว่า 10 ตัวอักษร ⇒ VALIDATION REASON_REQUIRED", () => codeR(resolve(mk({ actor: "STAFF", channel: "COUNTER", canOverride: true, overrides: [{ itemRef: "seat:ADULT", unitMinor: 340_000, reason: "  สั้น  " }] })), "VALIDATION", "เหตุผล", "REASON_REQUIRED"));
  await st("MO-4", "เพดาน T11 10%: 315,000 (เท่าขีด) ⇒ ผ่าน · 314,999 ⇒ REQUIRES_APPROVAL (entityType trips.price_override) · มี approval ตรงบรรทัด+ราคา ⇒ ผ่าน trace MANUAL refId = approvalId", () => {
    eq(V(ov(315_000), "315,000").items && item(V(ov(315_000), "x"), "seat:ADULT").unitMinor, 315_000, "เท่าขีด");
    const r = ov(314_999); codeR(r, "REQUIRES_APPROVAL", "เกินเพดาน"); eq(asRec(r.details)?.entityType, "trips.price_override", "entityType");
    const a = item(V(ov(314_999, { approvals: [{ approvalId: "ap_1", itemRef: "seat:ADULT", unitMinor: 314_999 }] }), "อนุมัติ"), "seat:ADULT");
    eq([a.unitMinor, asArr(a.priceTrace).at(-1)?.step, asArr(a.priceTrace).at(-1)?.refId], [314_999, "MANUAL", "ap_1"], "อนุมัติแล้ว");
    codeR(ov(314_999, { approvals: [{ approvalId: "ap_2", itemRef: "seat:ADULT", unitMinor: 300_000 }] }), "REQUIRES_APPROVAL", "approval ราคาไม่ตรง");
  });
  await st("MO-5", "ต่ำกว่าต้นทุนรอบ ⇒ W22 HIGHEST (ไม่บล็อก) · ราคาปกติ = ไม่มี W22 (ต้นทุน 20,000 · ขั้นต่ำ 8 คน)", () => {
    const base = mk({ adults: 2, children: 1, cost: 2_000_000 });
    ok(!warns(V(resolve(base), "ปกติ")).includes("W22"), "ราคาปกติไม่ควรเตือน");
    const v = V(ov(100_000, { adults: 2, children: 1, cost: 2_000_000, approvals: [{ approvalId: "ap", itemRef: "seat:ADULT", unitMinor: 100_000 }] }), "ต่ำกว่าทุน");
    eq(asArr(v.warnings).find((w) => w.code === "W22")?.severity, "HIGHEST", "W22");
  });
  await st("MO-6", "ขึ้นราคา (400,000) ⇒ ไม่ต้องอนุมัติ · priceSource MANUAL", () => { const a = item(V(ov(400_000), "ขึ้นราคา"), "seat:ADULT"); eq([a.unitMinor, a.priceSource], [400_000, "MANUAL"], "ขึ้นราคา"); });
  groupLine("MO");

  // ═══════════════ RD. คุณสมบัติการปัดเศษ ═══════════════
  console.log("\n── RD: ปัดเศษ (สุ่มมีเมล็ด 180 ชุด) ──");
  const N = 180;
  const gen = (seed: number): Rec => {
    const r = rng(seed); const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
    const adults = ri(1, 12), children = ri(0, 5), incl = r() < 0.7, vat = ri(0, 1_500);
    const ag = r() < 0.5 ? agency({ rateBp: ri(0, 3_000), collector: r() < 0.5 ? "AGENT_COLLECTS" : "SHOP_COLLECTS", wht: r() < 0.5, vatMode: ["NONE", "EXCLUSIVE", "INCLUSIVE"][ri(0, 2)] }) : null;
    return mk({ adults, children, camera: ri(0, 3), date: "2027-03-10", now: BKK("2027-01-01", "12:00"),
      prices: [price({ amount: ri(1, 999_999) })], extras: [{ ...X_PARK, paxPrices: { ADULT: ri(0, 200_000), CHILD: ri(0, 100_000) } }, { ...X_CAM, priceMinor: ri(1, 99_999) }, { ...X_PORT, priceMinor: ri(0, 9_999) }],
      rules: r() < 0.5 ? [GT, rule("pc", { kind: "PROMO_CODE", code: "R", discountBp: ri(1, 9_999) })] : [rule("pm", { kind: "PROMO_CODE", code: "R", discountMinor: ri(1, 300_000) })], promoCode: "R",
      agency: ag, actor: ag ? "AGENT" : "PUBLIC", channel: ag ? "AGENT_PORTAL" : "WEB",
      policy: { "trips.tax.priceIncludesVat": incl, "trips.tax.vatRate": { mode: "STANDARD", rateBp: vat }, "trips.pax.childPricePct": ri(0, 100) } });
  };
  const runAll = (f: (inp: Rec, v: Rec, i: number) => string | null) => { needTrips(); const bad: string[] = []; for (let i = 0; i < N; i++) { const inp = gen(1000 + i); const r = resolve(inp); if (r.ok !== true) { bad.push(`#${i} ${fmt(r).slice(0, 120)}`); continue; } const m = f(inp, r.value as Rec, i); if (m) bad.push(`#${i} ${m}`); if (bad.length > 3) break; } ok(bad.length === 0, bad.join(" · ")); };
  await st("RD-1", "Σ amountSatang (+VAT เมื่อราคาไม่รวม VAT) = payable · gross − ส่วนลด − ส่วนลดเอเจนซี่ = Σ amount", () => runAll((inp, v) => {
    const t = tot(v), s = items(v).reduce((a, i) => a + Number(i.amountSatang), 0), incl = asRec(inp.policy)?.["trips.tax.priceIncludesVat"];
    if (Number(t.payableSatang) !== s + (incl ? 0 : Number(t.vatSatang))) return `payable ${t.payableSatang} ≠ ${s}`;
    return Number(t.grossSatang) - Number(t.discountSatang) - Number(t.agentDiscountSatang) === s ? null : "gross−disc ≠ Σ";
  }));
  await st("RD-2", "VAT ครั้งเดียวต่อเอกสาร = ตัวคำนวณอ้างอิง BigInt · vatBase + vat = vatable (รวม VAT) / vatBase = vatable (ไม่รวม)", () => runAll((inp, v) => {
    const t = tot(v), pol = asRec(inp.policy) ?? {}, bp = Number(asRec(pol["trips.tax.vatRate"])?.rateBp), incl = pol["trips.tax.priceIncludesVat"];
    const va = items(v).filter((i) => i.taxKind === "VAT7").reduce((a, i) => a + Number(i.amountSatang), 0);
    const want = incl ? refVatIncl(va, bp) : refMulDiv(va, bp, 10_000);
    if (Number(t.vatableSatang) !== va || Number(t.vatSatang) !== want) return `vat ${t.vatSatang} ≠ ${want}`;
    return Number(t.vatBaseSatang) === (incl ? va - want : va) ? null : "vatBase";
  }));
  await st("RD-3", "คอมฯ/ส่วนลดไม่ขึ้นกับเก็บแทน: เปลี่ยนค่าอุทยาน ⇒ ฐานคอมฯ · คอมฯ · ส่วนลด เท่าเดิม", () => runAll((inp, v) => {
    const b = clone(inp); (asArr(b.extras)[0].paxPrices as Rec).ADULT = 777_777; const w = V(resolve(b), "alt");
    return isDeepStrictEqual([com(v).baseSatang ?? null, com(v).commissionSatang ?? null, tot(v).discountSatang], [com(w).baseSatang ?? null, com(w).commissionSatang ?? null, tot(w).discountSatang]) ? null : "เปลี่ยนตามอุทยาน";
  }));
  await st("RD-4", "ไม่มีเศษสตางค์: ทุกตัวเลขในผลลัพธ์เป็นจำนวนเต็ม", () => runAll((_i, v) => { const bad: string[] = []; const walk = (x: unknown, p: string) => { if (typeof x === "number" && !Number.isInteger(x)) bad.push(p); else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) walk(y, `${p}.${k}`); }; walk(v, "v"); return bad.length ? bad.slice(0, 2).join(",") : null; }));
  await st("RD-5", "ไม่ขึ้นกับลำดับอินพุต: กลับลำดับ pax/extras/prices/rules/paxTypes ⇒ ผลเหมือนเดิมทุกไบต์", () => runAll((inp, v) => {
    const b = clone(inp); for (const k of ["pax", "extras", "prices", "rules", "paxTypes"]) (b[k] as unknown[]).reverse(); return isDeepStrictEqual(V(resolve(b), "rev"), v) ? null : "ลำดับเปลี่ยนผล";
  }));
  await st("RD-6", "VAT ต่อบรรทัด: Σ = VAT เอกสาร · เก็บแทน/EXEMPT = 0", () => runAll((_i, v) => {
    const s = items(v).reduce((a, i) => a + Number(i.vatSatang), 0); if (s !== Number(tot(v).vatSatang)) return `Σ ${s}`;
    return items(v).some((i) => i.taxKind !== "VAT7" && i.vatSatang !== 0) ? "บรรทัดไม่ VAT มี vat" : null;
  }));
  await st("RD-7", "งวดจ่าย (Liveaboard สุ่ม % มัดจำ/วัน/ฐาน): Σ งวด = payable · ทุกงวด vatable + passThrough = amount · TRIP_ONLY มัดจำไม่มีเก็บแทน · ALL_LINES Σ เก็บแทน = รวม", () => {
    needTrips(); const bad: string[] = []; const r = rng(77);
    for (let i = 0; i < 80 && bad.length < 3; i++) {
      const base = r() < 0.5 ? "TRIP_ONLY" : "ALL_LINES";
      const v = V(resolve(mk({ productType: "LIVEABOARD", date: "2027-06-01", adults: 1 + Math.floor(r() * 6), prices: [price({ amount: 1 + Math.floor(r() * 9_999_999) })], extras: [{ ...X_PARK, paxPrices: { ADULT: Math.floor(r() * 500_000) } }],
        policy: { "trips.pay.depositPct": 1 + Math.floor(r() * 99), "trips.pay.depositBase": base, "trips.pay.balanceDueDaysBefore": 1 + Math.floor(r() * 120) } })), `#${i}`);
      const s = asArr(v.paymentSchedule), t = tot(v);
      if (s.reduce((a, x) => a + Number(x.amountSatang), 0) !== t.payableSatang) bad.push(`#${i} Σ งวด`);
      if (s.some((x) => Number(x.vatableSatang) + Number(x.passThroughSatang) !== x.amountSatang)) bad.push(`#${i} แยกยอด`);
      if (base === "TRIP_ONLY" && s.length === 2 && s[0].passThroughSatang !== 0) bad.push(`#${i} มัดจำมีเก็บแทน`);
      if (s.reduce((a, x) => a + Number(x.passThroughSatang), 0) !== t.passThroughSatang) bad.push(`#${i} Σ เก็บแทน`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  groupLine("RD");

  // ═══════════════ SN. snapshot + recompute (บริสุทธิ์) ═══════════════
  console.log("\n── SN: snapshot + recompute ──");
  const F2_KEYS = ["v", "productKind", "at", "refs", "policy", "currency", "fx", "lines", "totals", "commission", "cancelLadder", "cancelMinimumLadder", "shopCancelRefundBpByReason", "refundCredit", "refundForm",
    "nameChangeFree", "changeDateFee", "paymentSchedule", "tax", "deckPlanVersionId", "flags", "warnings", "travel"];
  const LINE_KEYS = ["itemRef", "kind", "label", "qty", "unitMinor", "amountMinor", "amountSatang", "vatSatang", "agentDiscountSatang", "commissionable", "discountable", "passThrough", "taxKind", "priceSource", "priceTrace", "commissionBp", "discountSatang"];
  await st("SN-1", "toTripsSnapshot: v=1 · productKind TRIP · คีย์บนสุดของ CC §F.2 ครบ + travel {localDate, startsAt, tz} · บรรทัดมีธง/taxKind/priceSource/priceTrace/commissionBp", () => {
    const s = snapOf(in15());
    const miss = F2_KEYS.filter((k) => !(k in s)); ok(miss.length === 0, `ขาด ${miss.join(",")}`);
    eq([s.v, s.productKind, asRec(s.travel)?.localDate, asRec(s.travel)?.tz], [1, "TRIP", RF.travelDate, "Asia/Bangkok"], "หัว");
    const lm = LINE_KEYS.filter((k) => !asArr(s.lines).every((l) => k in l)); ok(lm.length === 0, `บรรทัดขาด ${lm.join(",")}`);
  });
  await st("SN-2", "snapshot เป็น JSON ล้วน (ไป-กลับเท่าเดิม) · cancelLadder = T20 ×100 bp เรียงมาก→น้อย · ไม่จดเวลาถือ (trips.sell.holdMinutes)", () => {
    const s = snapOf(in15()); eq(JSON.parse(JSON.stringify(s)), s, "JSON");
    eq(s.cancelLadder, FX.REFUND_POLICY_TEMPLATE.map((x) => ({ daysBefore: x.minDays, refundBp: x.refundBp })), "ladder");
    ok(!JSON.stringify(s).includes("trips.sell.holdMinutes"), "จดเวลาถือ");
  });
  await st("SN-3", "recompute TOTALS = totals ที่จด · ไม่แก้อินพุต (snapshot แช่แข็งลึกยังทำงาน)", () => {
    const s = deepFreeze(snapOf(in15())); const before = JSON.stringify(s);
    eq(rec(s, { kind: "TOTALS" }).totals, s.totals, "totals"); rec(s, { kind: "CANCEL", at: RF.requestedAt, reasonKind: "CUSTOMER" }); eq(JSON.stringify(s), before, "อินพุตเปลี่ยน");
  });
  await st("SN-4", "คีย์ที่ไม่ได้จด ⇒ throw SnapshotKeyMissing (code SNAPSHOT_KEY_MISSING) — ไม่ตกไปอ่านค่าตั้งสด", () => {
    const s = clone(snapOf(in15())); delete (asRec(asRec(asRec(s.policy)?.trips)?.values) as Rec)["trips.tax.vatRate"];
    let e: unknown = null; try { fn("recomputeFromSnapshot")(s, { kind: "CANCEL", at: RF.requestedAt, reasonKind: "CUSTOMER" }); } catch (x) { e = x; }
    ok(e, "ไม่ throw"); eq((e as { code?: string; name?: string }).code ?? (e as { name?: string }).name, "SNAPSHOT_KEY_MISSING", "รหัส");
    let e2: unknown = null; try { fn("snapshotValue")(s, "trips", "trips.tax.vatRate"); } catch (x) { e2 = x; } ok(e2, "snapshotValue ไม่ throw");
  });
  const agSnap = () => { const inp = mk({ adults: AC.adults, channel: "AGENT_PORTAL", actor: "AGENT", agency: agency() }); const pr = V(resolve(inp), "ag"); return fn("toTripsSnapshot")({ input: inp, priced: pr, policy: { trips: tripsPolicySnap(), agency: null } }) as Rec; };
  await st("SN-5", "ดึงคอมฯ บางส่วน (CC :639): ยกเลิก 1 ใน 2 ผู้ใหญ่ ⇒ ฐานที่เหลือ 3,500 · คอมฯ 525 · ดึงคืน 525 · คอมฯ ครบ = 1,050 / ส่งร้าน 7,181.50", () => {
    const s = agSnap(); const all = rec(s, { kind: "COMMISSION" }), half = rec(s, { kind: "COMMISSION", remainingQtyByItemRef: { "seat:ADULT": 1 } });
    eq([all.commissionSatang, all.remitToShopSatang, half.baseSatang, half.commissionSatang, half.clawbackSatang], [AC.commissionSatang, AC.toShopSatang, R.adultSatang, AC.commissionSatang / 2, AC.commissionSatang / 2], "คอมฯ");
  });
  await st("SN-6", "recompute SCHEDULE = paymentSchedule ที่จด (Liveaboard 19,740 / 49,660)", () => {
    const inp = mk({ productType: "LIVEABOARD", date: SIM.start, now: BKK(LB.bookedOn, "12:00"), adults: LB.persons, prices: [price({ amount: LB.cabinPerPersonSatang })], extras: [{ ...X_PARK, paxPrices: { ADULT: SIM.parkPerPersonSatang } }],
      policy: { "trips.pay.depositPct": SIM.depositBp / 100, "trips.pay.balanceDueDaysBefore": SIM.balanceDaysBefore } });
    const s = fn("toTripsSnapshot")({ input: inp, priced: V(resolve(inp), "LA"), policy: { trips: tripsPolicySnap(), agency: null } }) as Rec;
    eq(asArr(rec(s, { kind: "SCHEDULE" }).paymentSchedule).map((x) => x.amountSatang), [LB.depositSatang, LB.balanceSatang], "งวด");
  });
  await st("SN-7", "ร้านยกเลิก (EXTERNAL · T21 100%) ⇒ คืนเต็ม 11,450 แม้เหลือ 23 วัน", () => {
    const r = rec(snapOf(in15()), { kind: "CANCEL", at: RF.requestedAt, reasonKind: "EXTERNAL" }); eq([r.refundSatang, r.keptSatang], [RF.paidSatang, 0], "EXTERNAL");
  });
  await st("SN-8", "ขอบขั้นบันได: 30 วัน 100% · 29 วัน 50% · 15 วัน 50% · 14 วัน 0% (วันตามเขตเวลาร้าน)", () => {
    const s = snapOf(in15());
    eq([30, 29, 15, 14].map((d) => rec(s, { kind: "CANCEL", at: BKK(addDaysYmd(RF.travelDate, -d), "23:30").toISOString(), reasonKind: "CUSTOMER" }).refundBp), [10_000, 5_000, 5_000, 0], "ขั้น");
  });
  await st("SN-9", "ยกเลิกหลังจ่ายมัดจำอย่างเดียว (Liveaboard 19,740) ⇒ คืนจากส่วนที่จ่าย · ไม่มีเก็บแทนให้คืน · deductions ไม่ทำให้ติดลบ", () => {
    const inp = mk({ productType: "LIVEABOARD", date: SIM.start, now: BKK(LB.bookedOn, "12:00"), adults: LB.persons, prices: [price({ amount: LB.cabinPerPersonSatang })], extras: [{ ...X_PARK, paxPrices: { ADULT: SIM.parkPerPersonSatang } }],
      policy: { "trips.pay.depositPct": SIM.depositBp / 100, "trips.pay.balanceDueDaysBefore": SIM.balanceDaysBefore } });
    const s = fn("toTripsSnapshot")({ input: inp, priced: V(resolve(inp), "LA"), policy: { trips: tripsPolicySnap(), agency: null } }) as Rec;
    const r = rec(s, { kind: "CANCEL", at: BKK(LB.bookedOn, "13:00").toISOString(), reasonKind: "CUSTOMER", paidSatang: LB.depositSatang });
    const r2 = rec(s, { kind: "CANCEL", at: BKK(LB.bookedOn, "13:00").toISOString(), reasonKind: "CUSTOMER", paidSatang: LB.depositSatang, deductionsSatang: 99_999_999 });
    eq([r.refundSatang, r.refundPassThroughSatang, r2.refundSatang], [LB.depositSatang, 0, 0], "มัดจำ");
  });
  groupLine("SN");

  // ═══════════════ ตั้งร้านชั่วคราว (SQL ดิบตามรูป T0.1–T0.3) ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uB = rid("uB");
  let setupErr = "", settingsErr = "";
  const U: Record<string, Rec> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; pt: Record<string, string>; park: string; cam: string }> = {};
  let seq = 0;
  try {
    for (const t of ["TripProduct", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "TripSeason", "TripPriceRule"]) await needTable(t);
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T0.5 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag] of [[uA, tA, "a"], [uA2, tA, "a2"], [uB, tB, "b"]] as const) {
      try { await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: "{}", updatedAt: new Date() }); }
      catch (e) { throw new Error(`สร้างหน่วย TRIPS ไม่ได้ (enum ของ T0.1 ยังไม่ลง): ${errMsg(e).slice(0, 80)}`); }
    }
    for (const [tag, tenantId] of [["oa", tA], ["ob", tB]] as const) {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id };
    }
    const mkProd = async (key: string, tenantId: string, unitId: string, type = "TOUR") => {
      const id = rid(`p${key}`), o = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t05qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: type, sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
      await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const pt: Record<string, string> = {};
      for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code }), countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
      const park = await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: R.parkAdultSatang, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
        name: JSON.stringify({ th: "ค่าอุทยาน" }), paxPrices: JSON.stringify({ ADULT: R.parkAdultSatang, CHILD: R.parkChildSatang }), active: true, updatedAt: new Date() });
      const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: R.extras.camera.satang, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
        name: JSON.stringify({ th: R.extras.camera.name }), active: true, updatedAt: new Date() });
      PRD[key] = { id, opt: o, unit: unitId, tenant: tenantId, pt, park, cam };
    };
    await mkProd("A", tA, uA); await mkProd("A2", tA, uA2); await mkProd("B", tB, uB);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const setV = async (tenantId: string, changes: Rec[], who = "oa") => {
    const r = asRec(await S("setSettings")(U[who], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  const getV = async (key: string, unitId = uA, tenantId = tA) => asRec(await S("resolveSetting")({ tenantId }, key, { unitId }))?.value;
  try {
    if (!setupErr) {
      const park = asRec(await getV("trips.parkFee.table")) ?? {};
      await setV(tA, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uA, value: { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 } },
        { key: "trips.parkFee.table", scope: "UNIT", scopeId: uA, value: { ...park, shopRates: PARK_TABLE.shopRates } }]);
    }
  } catch (e) { settingsErr = e instanceof Error ? e.message : String(e); console.log(`  ⚠️ ตั้งค่าตั้งหน่วยไม่สำเร็จ: ${settingsErr}`); }
  const needDb = async () => { needTrips(); ok(!setupErr && PRD.A, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); ok(!settingsErr, `ตั้งค่าตั้งไม่ได้: ${settingsErr}`); };
  const mkDep = async (date: string, key = "A"): Promise<string> => {
    const p = PRD[key]; const startsAt = new Date(BKK(date, "08:00").getTime() + (seq++ % 500) * 60_000); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      status: "OPEN", capacity: 24, sold: 0, held: 0, reserved: 0, minPax: R.minPax, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  const rawPrice = async (o: { key?: string; amount: number; pax?: string | null; seasonId?: string | null; departureId?: string | null }) => {
    const p = PRD[o.key ?? "A"];
    return insertRow("TripPrice", { id: rid("pr"), tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: null, paxTypeId: o.pax === null ? null : p.pt[o.pax ?? "ADULT"], cabinTypeId: null, seasonId: o.seasonId ?? null, departureId: o.departureId ?? null,
      currency: "THB", amountMinor: o.amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
  };
  const rawSeason = async (from: string, to: string, priority = 0, unit = uA, tenant = tA) => insertRow("TripSeason", { id: rid("s"), tenantId: tenant, unitId: unit, name: `ฤดู ${from}`, dateStart: from, dateEnd: to, priority, status: "ACTIVE", updatedAt: new Date() });
  const rawRule = async (params: Rec, o: Rec = {}) => insertRow("TripPriceRule", { id: rid("ru"), tenantId: tA, unitId: uA, productId: null, kind: params.kind, params: JSON.stringify(params), priority: 0, active: true, usedCount: 0, updatedAt: new Date(), ...o });
  const C = (o: { tenant?: string; unit?: string; ch?: string; actor?: Rec; now?: string | Date } = {}): Rec => ({ tenantId: o.tenant ?? tA, unitId: o.unit ?? uA, channel: o.ch ?? "COUNTER", actor: o.actor ?? { kind: "STAFF", userId: String(U.oa?.userId ?? "x") }, now: new Date(o.now ?? FX.TRIPS_AS_OF), locale: "th" });
  const line = (depId: string, o: { key?: string; adults?: number; children?: number; camera?: boolean; promoCode?: string; currency?: string } = {}): Rec => {
    const p = PRD[o.key ?? "A"];
    return { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: depId, optionId: p.opt, pax: [{ paxTypeId: p.pt.ADULT, qty: o.adults ?? 2 }, ...((o.children ?? 1) > 0 ? [{ paxTypeId: p.pt.CHILD, qty: o.children ?? 1 }] : [])],
      extras: o.camera === false ? [] : [{ extraId: p.cam, qty: 1 }], ...(o.promoCode ? { promoCode: o.promoCode } : {}), ...(o.currency ? { currency: o.currency } : {}) };
  };
  const quote = async (ctx: Rec, ln: Rec, opts: Rec = {}) => call("quoteTripLine", ctx, ln, opts);
  const snapDb = async (ctx: Rec, ln: Rec, priced: Rec): Promise<Rec> => V(await call("buildTripBookingSnapshot", ctx, ln, priced, {}), "buildTripBookingSnapshot");
  const outbox = async (type: string) => q<{ payload: Rec; idempotencyKey: string }>(`SELECT payload, "idempotencyKey" FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = $2 ORDER BY "createdAt"`, [tA, type]).catch(() => []);
  const DATE_DB = "2027-03-10";

  // ═══════════════ SE. ฤดูกาล/ราคา CRUD ═══════════════
  console.log("\n── SE: ฤดูกาลและราคา (ฐาน) ──");
  await st("SE-1", "saveSeason: ซ้อน priority เท่ากัน ⇒ VALIDATION SEASON_OVERLAP · priority ต่าง ⇒ ได้ · ไม่ซ้อน ⇒ ได้", async () => {
    await needDb();
    V(await call("saveSeason", C(), { name: "หลัก", dateStart: "2028-11-01", dateEnd: "2029-04-30", priority: 0 }), "หลัก");
    codeR(await call("saveSeason", C(), { name: "ซ้อน", dateStart: "2028-12-20", dateEnd: "2029-01-05", priority: 0 }), "VALIDATION", "ซ้อน", "SEASON_OVERLAP");
    V(await call("saveSeason", C(), { name: "ปีใหม่", dateStart: "2028-12-20", dateEnd: "2029-01-05", priority: 10 }), "priority ต่าง");
    V(await call("saveSeason", C(), { name: "นอก", dateStart: "2029-05-01", dateEnd: "2029-10-31", priority: 0 }), "ไม่ซ้อน");
  });
  await st("SE-2", "dateEnd < dateStart ⇒ VALIDATION BAD_RANGE · ช่องแปลก ⇒ VALIDATION", async () => {
    await needDb();
    codeR(await call("saveSeason", C(), { name: "กลับด้าน", dateStart: "2029-12-31", dateEnd: "2029-12-01", priority: 0 }), "VALIDATION", "กลับด้าน", "BAD_RANGE");
    codeR(await call("saveSeason", C(), { name: "x", dateStart: "2029-12-01", dateEnd: "2029-12-31", priority: 0, hack: 1 }), "VALIDATION", "ช่องแปลก");
  });
  await st("SE-3", "setPrice upsert บนคีย์ NND (ตั้งซ้ำ = แถวเดียว ค่าใหม่) · TOUR สกุล USD ⇒ CURRENCY_NOT_ALLOWED", async () => {
    await needDb(); const p = PRD.A;
    const a = V(await call("setPrice", C(), { productId: p.id, paxTypeId: p.pt.INFANT, currency: "THB", amountMinor: 1_000 }), "ครั้งแรก");
    const b = V(await call("setPrice", C(), { productId: p.id, paxTypeId: p.pt.INFANT, currency: "THB", amountMinor: 2_000 }), "ครั้งสอง");
    const rows = await q<{ amountMinor: number }>(`SELECT "amountMinor" FROM "TripPrice" WHERE "productId" = $1 AND "paxTypeId" = $2`, [p.id, p.pt.INFANT]);
    eq([a.id === b.id, rows.map((r) => r.amountMinor)], [true, [2_000]], "upsert");
    codeR(await call("setPrice", C(), { productId: p.id, paxTypeId: p.pt.ADULT, currency: "USD", amountMinor: 10_000 }), "CURRENCY_NOT_ALLOWED", "USD บน TOUR");
  });
  let depSeason = "";
  await st("SE-4", "quoteTripLine บนฐาน: ราคารอบ 4,500 ทับฤดูกาล 3,900 (DEPARTURE) · เด็กคิด 70% ของราคารอบ · 2A+1C+กล้อง+อุทยาน", async () => {
    await needDb();
    await rawPrice({ amount: R.adultSatang }); const s = await rawSeason("2027-03-01", "2027-03-31", 5); await rawPrice({ amount: 390_000, seasonId: s });
    depSeason = await mkDep(DATE_DB); await rawPrice({ amount: 450_000, departureId: depSeason });
    const v = V(await quote(C(), line(depSeason)), "quote");
    eq([item(v, "seat:ADULT").unitMinor, item(v, "seat:ADULT").priceSource, item(v, "seat:CHILD").unitMinor, tot(v).payableSatang], [450_000, "DEPARTURE", 315_000, 900_000 + 315_000 + 50_000 + 150_000], "quote");
  });
  await st("SE-5", "archiveSeason ที่ถูกอ้าง: ไม่มีเหตุผล ⇒ REASON_REQUIRED · มีเหตุผล ⇒ ARCHIVED (แถวยังอยู่) · quote ถัดไปไม่ใช้ฤดูนั้น", async () => {
    await needDb(); const d = await mkDep("2027-08-10");
    const s = await rawSeason("2027-08-01", "2027-08-31", 3); await rawPrice({ amount: 280_000, seasonId: s });
    eq(item(V(await quote(C(), line(d)), "ก่อน"), "seat:ADULT").unitMinor, 280_000, "ก่อน archive");
    codeR(await call("archiveSeason", C(), { id: s }), "VALIDATION", "ไม่มีเหตุผล", "REASON_REQUIRED");
    V(await call("archiveSeason", C(), { id: s, reason: "เลิกใช้ฤดูนี้แล้ว ทดสอบ" }), "archive");
    eq((await q<{ status: string }>(`SELECT status FROM "TripSeason" WHERE id = $1`, [s]))[0]?.status, "ARCHIVED", "สถานะ");
    eq(item(V(await quote(C(), line(d)), "หลัง"), "seat:ADULT").unitMinor, R.adultSatang, "หลัง archive");
  });
  await st("SE-6", "savePriceRule: มีทั้ง discountBp และ discountMinor ⇒ RULE_DISCOUNT_SHAPE · params.kind ไม่ตรง kind ⇒ VALIDATION · โค้ดเก็บตัวใหญ่ · โค้ด active ซ้ำในหน่วย ⇒ CODE_TAKEN", async () => {
    await needDb();
    codeR(await call("savePriceRule", C(), { kind: "EARLY_BIRD", params: { kind: "EARLY_BIRD", minDaysBefore: 3, discountBp: 100, discountMinor: 100 } }), "VALIDATION", "ทั้งคู่", "RULE_DISCOUNT_SHAPE");
    codeR(await call("savePriceRule", C(), { kind: "LAST_MINUTE", params: { kind: "EARLY_BIRD", minDaysBefore: 3, discountBp: 100 } }), "VALIDATION", "kind ไม่ตรง");
    const r = V(await call("savePriceRule", C(), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: `qc${hex(2)}x`, discountBp: 500 } }), "โค้ด");
    const row = (await q<{ params: Rec }>(`SELECT params FROM "TripPriceRule" WHERE id = $1`, [r.id]))[0];
    const code = String(row?.params?.code ?? ""); eq(code, code.toUpperCase(), "ตัวใหญ่");
    codeR(await call("savePriceRule", C(), { kind: "PROMO_CODE", params: { kind: "PROMO_CODE", code: code.toLowerCase(), discountBp: 900 } }), "VALIDATION", "ซ้ำ", "CODE_TAKEN");
  });
  groupLine("SE");

  // ═══════════════ PD. โค้ดบนฐานจริง ═══════════════
  console.log("\n── PD: ตัดสิทธิ์โค้ดบนฐานจริง (X3) ──");
  const redeem = (ruleId: string, contactKey: string, bookingId = rid("bk")) => inTx(tA, uA, (tx) => fn("redeemPromoInTx")(tx, C(), { ruleId, contactKey, bookingId, discountSatang: 35_000 }) as Promise<unknown>);
  const used = async (id: string) => (await q<{ u: number }>(`SELECT "usedCount" AS u FROM "TripPriceRule" WHERE id = $1`, [id]))[0]?.u;
  const redemptions = async (id: string, status = "ACTIVE") => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripPromoRedemption" WHERE "ruleId" = $1 AND status = $2`, [id, status]))[0]?.n;
  let rule5 = "";
  await st("PD-1", "X3: โค้ดเหลือ 5 สิทธิ์ ยิงพร้อมกัน 30 tx (ผู้ติดต่อต่างกัน) ⇒ สำเร็จ 5 พอดี · ที่เหลือ PROMO_EXHAUSTED · usedCount 5 · redemption ACTIVE 5", async () => {
    await needDb(); await needCol("TripPriceRule", "usedCount", "ใบสั่ง §11 ข้อ 1ก"); await needTable("TripPromoRedemption");
    rule5 = await rawRule({ kind: "PROMO_CODE", code: `X3${hex(2)}`.toUpperCase(), discountBp: 1_000, maxUses: 5 });
    const r = await Promise.all(Array.from({ length: 30 }, (_, i) => redeem(rule5, `contact-${i}`).catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec)));
    const okN = r.filter((x) => x.ok === true).length, ex = r.filter((x) => x.ok === false && asRec(x.details)?.reason === "PROMO_EXHAUSTED").length;
    eq([okN, ex, await used(rule5), await redemptions(rule5)], [5, 25, 5, 5], `สำเร็จ/หมด/used/แถว (${fmt(r.find((x) => x.ok !== true && asRec(x.details)?.reason !== "PROMO_EXHAUSTED"))})`);
  });
  await st("PD-2", "ต่อผู้ติดต่อ 2 สิทธิ์: ผู้ติดต่อเดียวยิงพร้อมกัน 10 ⇒ สำเร็จ 2 พอดี (PROMO_PER_CONTACT) · ผู้ติดต่ออื่นยังใช้ได้", async () => {
    await needDb(); await needTable("TripPromoRedemption");
    const id = await rawRule({ kind: "PROMO_CODE", code: `PC${hex(2)}`.toUpperCase(), discountBp: 1_000, maxUses: 100, perContact: 2 });
    const r = await Promise.all(Array.from({ length: 10 }, () => redeem(id, "same-contact")));
    eq([r.filter((x) => x.ok === true).length, r.filter((x) => asRec(x.details)?.reason === "PROMO_PER_CONTACT").length], [2, 8], "ต่อผู้ติดต่อ");
    ok((await redeem(id, "other-contact")).ok === true, "ผู้ติดต่ออื่นใช้ไม่ได้");
  });
  await st("PD-3", "bookingId เดิมซ้ำ (ยิงพร้อมกัน 5) ⇒ redemption แถวเดียว · usedCount +1 ครั้งเดียว", async () => {
    await needDb(); await needTable("TripPromoRedemption");
    const id = await rawRule({ kind: "PROMO_CODE", code: `ID${hex(2)}`.toUpperCase(), discountBp: 1_000, maxUses: 50 }); const bk = rid("bk");
    await Promise.all(Array.from({ length: 5 }, () => redeem(id, "c-dup", bk)));
    eq([await used(id), await redemptions(id)], [1, 1], "กันซ้ำ");
  });
  await st("PD-4", "releasePromoInTx: RELEASED + usedCount −1 · ปล่อยซ้ำ = ไม่ลดอีก · ไม่ต่ำกว่า 0", async () => {
    await needDb(); await needTable("TripPromoRedemption");
    const id = await rawRule({ kind: "PROMO_CODE", code: `RL${hex(2)}`.toUpperCase(), discountBp: 1_000, maxUses: 5 }); const bk = rid("bk");
    ok((await redeem(id, "c-rel", bk)).ok === true, "redeem");
    for (let i = 0; i < 2; i++) await inTx(tA, uA, (tx) => fn("releasePromoInTx")(tx, C(), { bookingId: bk }) as Promise<unknown>);
    eq([await used(id), await redemptions(id, "RELEASED"), await redemptions(id)], [0, 1, 0], "ปล่อย");
  });
  await st("PD-5", "quote บนฐานหลังโค้ดหมด (PD-1) ⇒ PROMO_NOT_APPLIED EXHAUSTED ส่วนลด 0 · โค้ดที่ยังเหลือ ⇒ ลด", async () => {
    await needDb(); ok(rule5, "PD-1 ไม่ผ่าน");
    const code = String((await q<{ c: string }>(`SELECT params->>'code' AS c FROM "TripPriceRule" WHERE id = $1`, [rule5]))[0]?.c);
    const v = V(await quote(C(), line(depSeason || (await mkDep(DATE_DB)), { promoCode: code })), "quote");
    eq([tot(v).discountSatang, asArr(v.warnings).some((w) => w.code === "PROMO_NOT_APPLIED")], [0, true], "หมด");
  });
  groupLine("PD");

  // ═══════════════ MB. ข้อสอบบังคับ (ข) ═══════════════
  console.log("\n── MB: แก้ราคา/สัญญา/ค่าตั้งหลังจอง → การจองเดิมไม่เปลี่ยน ──");
  const mbState: { dep?: string; snap?: Rec; priced?: Rec } = {};
  const mbBase = async () => {
    await needDb();
    if (!mbState.snap) {
      const p = PRD.A;
      if (!(await q(`SELECT 1 FROM "TripPrice" WHERE "productId" = $1 AND "paxTypeId" = $2 AND "seasonId" IS NULL AND "departureId" IS NULL`, [p.id, p.pt.ADULT])).length) await rawPrice({ amount: R.adultSatang });
      const d = await mkDep("2027-09-15"); mbState.dep = d;
      const ctx = C({ now: BKK("2027-08-23", "12:00") });
      const priced = V(await quote(ctx, line(d)), "quote ก่อนแก้"); mbState.priced = priced;
      mbState.snap = await snapDb(ctx, line(d), priced);
    }
    return { ctx: C({ now: BKK("2027-08-23", "12:00") }), d: mbState.dep as string, snap: mbState.snap as Rec, priced: mbState.priced as Rec };
  };
  await st("MB-1", "quote → buildTripBookingSnapshot: policy.trips.values มีคีย์ CC §N.3 ครบ 35 · totals ตรง quote · ยอด 11,450 ด้วยราคาปลีกบนฐาน", async () => {
    const { snap, priced } = await mbBase();
    const vals = asRec(asRec(asRec(snap.policy)?.trips)?.values) ?? {};
    const miss = SNAP_KEYS.filter((k) => !(k in vals)); ok(miss.length === 0, `ขาด ${miss.join(",")}`);
    eq([asRec(snap.totals)?.payableSatang, tot(priced).payableSatang], [B0142.totalSatang, B0142.totalSatang], "ยอด");
  });
  await st("MB-2", "แก้ราคาปลีก (3,500 → 4,000) หลังจอง ⇒ recompute TOTALS บน snapshot เดิม = 11,450 · quote ใหม่ = ยอดใหม่", async () => {
    const { ctx, d, snap } = await mbBase(); const p = PRD.A;
    await pool.query(`UPDATE "TripPrice" SET "amountMinor" = 400000 WHERE "productId" = $1 AND "paxTypeId" = $2 AND "seasonId" IS NULL AND "departureId" IS NULL`, [p.id, p.pt.ADULT]);
    try {
      eq(asRec(rec(snap, { kind: "TOTALS" }).totals)?.payableSatang, B0142.totalSatang, "เดิม");
      eq(tot(V(await quote(ctx, line(d)), "ใหม่")).payableSatang, B0142.totalSatang + 2 * 50_000 + 35_000, "ใหม่");
    } finally { await pool.query(`UPDATE "TripPrice" SET "amountMinor" = $3 WHERE "productId" = $1 AND "paxTypeId" = $2 AND "seasonId" IS NULL AND "departureId" IS NULL`, [p.id, p.pt.ADULT, R.adultSatang]); }
  });
  await st("MB-3", "แก้ตารางยกเลิก T20 ({30,100},{0,0}) + T21 หลังจอง ⇒ ยกเลิก 23 วันบน snapshot เดิมยัง 50% (6,475) · snapshot ใหม่ = ตารางใหม่", async () => {
    const { ctx, d, snap } = await mbBase();
    await setV(tA, [{ key: "trips.cancel.ladder", scope: "UNIT", scopeId: uA, value: [{ fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 0, refundPct: 0 }] }, { key: "trips.cancel.shopCancelRefund", scope: "UNIT", scopeId: uA, value: { EXTERNAL: 90, MIN_NOT_MET: 100, SHOP_FAULT: 100 } }]);
    const r = rec(snap, { kind: "CANCEL", at: BKK("2027-08-23", "12:00").toISOString(), reasonKind: "CUSTOMER" });
    eq([r.refundBp, r.refundSatang, rec(snap, { kind: "CANCEL", at: BKK("2027-08-23", "12:00").toISOString(), reasonKind: "EXTERNAL" }).refundSatang], [RF.refundBp, RF.refundSatang, RF.paidSatang], "เดิม");
    const s2 = await snapDb(ctx, line(d), V(await quote(ctx, line(d)), "ใหม่"));
    eq(s2.cancelLadder, [{ daysBefore: 30, refundBp: 10_000 }, { daysBefore: 0, refundBp: 0 }], "ใหม่");
  });
  await st("MB-4", "แก้ตารางค่าอุทยาน T45 + ช่วงอายุเด็ก T27 หลังจอง ⇒ ค่าใน snapshot เดิมไม่เปลี่ยน · snapshot ใหม่มีค่าใหม่", async () => {
    const { ctx, d, snap } = await mbBase(); const before = clone(snap);
    const park = asRec(await getV("trips.parkFee.table")) ?? {};
    await setV(tA, [{ key: "trips.parkFee.table", scope: "UNIT", scopeId: uA, value: { ...park, shopRates: [{ ...PARK_TABLE.shopRates[0], adultSatang: 70_000 }] } }, { key: "trips.pax.childAgeBand", scope: "UNIT", scopeId: uA, value: { infantBelow: 3, childFrom: 3, childTo: 12 } }]);
    eq(snap, before, "snapshot เดิม");
    const s2 = await snapDb(ctx, line(d), V(await quote(ctx, line(d)), "ใหม่")); const v2 = asRec(asRec(asRec(s2.policy)?.trips)?.values) ?? {};
    eq([asRec(v2["trips.pax.childAgeBand"])?.childTo, asArr(asRec(v2["trips.parkFee.table"])?.shopRates)[0]?.adultSatang], [12, 70_000], "ใหม่");
  });
  await st("MB-5", "แก้อัตรา VAT T35 (10%) หลังจอง ⇒ recompute บน snapshot เดิมยัง VAT 7% (คืน VAT 325.47) · quote ใหม่ VAT = vatOfInclusive(9,950, 1000)", async () => {
    const { ctx, d, snap } = await mbBase();
    await setV(tA, [{ key: "trips.tax.vatRate", scope: "UNIT", scopeId: uA, value: { mode: "STANDARD", rateBp: 1_000 } }]);
    eq(rec(snap, { kind: "CANCEL", at: BKK("2027-08-23", "12:00").toISOString(), reasonKind: "CUSTOMER" }).refundVatSatang, refVatIncl(RF.lines[0].refundSatang + RF.lines[1].refundSatang, VAT_BP), "เดิม");
    eq(tot(V(await quote(ctx, line(d)), "ใหม่")).vatSatang, refVatIncl(FX.RECEIPT_RC_0588.serviceInclVatSatang, 1_000), "ใหม่");
  });
  await st("MB-6", "เอเจนซี่ (port ฉีด): จองที่ระดับ 15% WHT 3% ⇒ 1,050 / 7,181.50 · แก้เป็น 20% WHT 1% หลังจอง ⇒ recompute เดิม = 1,050 / 7,181.50 · quote ใหม่ = 1,400", async () => {
    await needDb(); const d = await mkDep("2027-09-20");
    let cur = agency(); const off = fn("registerAgencyPricingPort")({ load: async () => cur }) as () => void; if (typeof off === "function") unregister.push(off);
    const ctx = C({ ch: "AGENT_PORTAL", actor: { kind: "AGENT", agentAccountId: "ag_ptd", agentUserId: "agu_1" } });
    const ln = line(d, { children: 0, camera: false });
    const priced = V(await quote(ctx, ln), "quote เอเจนซี่"); const snap = await snapDb(ctx, ln, priced);
    eq([com(priced).commissionSatang, com(priced).remitToShopSatang], [AC.commissionSatang, AC.toShopSatang], "ตอนจอง");
    cur = agency({ rateBp: FX.AGENCY_TIERS.A.tourBp }); (asRec(asRec(cur.terms)?.wht) as Rec).rateBp = 100;
    const r = rec(snap, { kind: "COMMISSION" });
    eq([r.commissionSatang, r.remitToShopSatang], [AC.commissionSatang, AC.toShopSatang], "เดิม");
    eq(com(V(await quote(ctx, ln), "ใหม่")).commissionSatang, FX.pct(AC.saleSatang, FX.AGENCY_TIERS.A.tourBp), "ใหม่");
  });
  groupLine("MB");

  // ═══════════════ X1. แยกร้าน/หน่วย ═══════════════
  console.log("\n── X1: แยกร้าน/หน่วย ──");
  await st("X1-1", "listSeasons: ร้าน B และหน่วย A2 ไม่เห็นฤดูกาลของหน่วย A", async () => {
    await needDb(); const s = await rawSeason("2030-01-01", "2030-01-31", 1);
    const ids = async (ctx: Rec) => asArr(V(await call("listSeasons", ctx, { includeArchived: true }), "list")).map((x) => x.id);
    eq([(await ids(C())).includes(s), (await ids(C({ unit: uA2 }))).includes(s), (await ids(C({ tenant: tB, unit: uB, actor: { kind: "STAFF", userId: String(U.ob?.userId) } }))).includes(s)], [true, false, false], "เห็น");
  });
  await st("X1-2", "quote สินค้าของหน่วย A ด้วย ctx หน่วย A2 / ร้าน B ⇒ NOT_FOUND · สินค้า A2 ไม่มีราคาของตัวเอง (ราคา A ไม่รั่ว) ⇒ PRICE_MISSING", async () => {
    await needDb(); const d = await mkDep("2027-10-05"); const d2 = await mkDep("2027-10-05", "A2");
    codeR(await quote(C({ unit: uA2 }), line(d)), "NOT_FOUND", "หน่วยอื่น"); codeR(await quote(C({ tenant: tB, unit: uB }), line(d)), "NOT_FOUND", "ร้านอื่น");
    codeR(await quote(C({ unit: uA2 }), line(d2, { key: "A2" })), "VALIDATION", "ไม่มีราคา A2", "PRICE_MISSING");
  });
  await st("X1-3", "โค้ดของหน่วย A ใช้ในหน่วย A2 ไม่ได้ (PROMO_NOT_APPLIED · ส่วนลด 0)", async () => {
    await needDb(); const code = `XU${hex(2)}`.toUpperCase(); await rawRule({ kind: "PROMO_CODE", code, discountBp: 5_000 });
    await rawPrice({ key: "A2", amount: R.adultSatang }); const d2 = await mkDep("2027-10-06", "A2");
    const v = V(await quote(C({ unit: uA2 }), line(d2, { key: "A2", promoCode: code })), "quote A2");
    eq([tot(v).discountSatang, asArr(v.warnings).some((w) => w.code === "PROMO_NOT_APPLIED")], [0, true], "ไม่รั่ว");
  });
  await st("X1-4", "CRUD ข้ามร้าน: archiveSeason/setPrice/setPriceRuleActive ด้วย id ของร้าน A จาก ctx ร้าน B ⇒ NOT_FOUND · แถวไม่เปลี่ยน", async () => {
    await needDb(); const s = await rawSeason("2031-01-01", "2031-01-31", 1); const r = await rawRule({ kind: "EARLY_BIRD", minDaysBefore: 5, discountBp: 100 });
    const cb = C({ tenant: tB, unit: uB, actor: { kind: "STAFF", userId: String(U.ob?.userId) } });
    codeR(await call("archiveSeason", cb, { id: s, reason: "พยายามข้ามร้าน ทดสอบ" }), "NOT_FOUND", "season");
    codeR(await call("setPrice", cb, { productId: PRD.A.id, paxTypeId: PRD.A.pt.ADULT, currency: "THB", amountMinor: 1 }), "NOT_FOUND", "price");
    codeR(await call("setPriceRuleActive", cb, { id: r, active: false, reason: "พยายามข้ามร้าน ทดสอบ" }), "NOT_FOUND", "rule");
    eq([(await q<{ status: string }>(`SELECT status FROM "TripSeason" WHERE id = $1`, [s]))[0]?.status, (await q<{ active: boolean }>(`SELECT active FROM "TripPriceRule" WHERE id = $1`, [r]))[0]?.active], ["ACTIVE", true], "ไม่เปลี่ยน");
  });
  groupLine("X1");

  // ═══════════════ X9. การกระทำอันตราย ═══════════════
  console.log("\n── X9: การกระทำอันตราย ──");
  await st("X9-1", "archive ฤดูกาล: จำนวนแถว TripSeason ไม่ลด · AuditLog trips.price.* มี actorId · after ไม่มีข้อมูลบุคคล", async () => {
    await needDb(); const n0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripSeason" WHERE "tenantId" = $1`, [tA]))[0]?.n;
    const s = await rawSeason("2032-01-01", "2032-01-31", 1); await rawPrice({ amount: 100_000, seasonId: s });
    V(await call("archiveSeason", C(), { id: s, reason: "ปิดฤดูกาลนี้ ทดสอบ X9" }), "archive");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripSeason" WHERE "tenantId" = $1`, [tA]))[0]?.n, (n0 ?? 0) + 1, "แถว");
    const a = await q<{ action: string; actorId: string | null; after: Rec | null }>(`SELECT action, "actorId", after FROM "AuditLog" WHERE "tenantId" = $1 AND action LIKE 'trips.price.%'`, [tA]).catch(() => []);
    ok(a.length > 0 && a.every((x) => x.actorId), `audit: ${fmt(a.slice(0, 2))}`); ok(!/@|\b0\d{8,9}\b/.test(JSON.stringify(a.map((x) => x.after))), "audit มีข้อมูลบุคคล");
  });
  await st("X9-2", "ปิดโค้ดที่ถูกใช้แล้ว: ต้องมีเหตุผล (REASON_REQUIRED) · ปิดแล้ว redemption ยังอยู่ · ไม่มีการลบ", async () => {
    await needDb(); ok(rule5, "PD-1 ไม่ผ่าน");
    codeR(await call("setPriceRuleActive", C(), { id: rule5, active: false }), "VALIDATION", "ไม่มีเหตุผล", "REASON_REQUIRED");
    V(await call("setPriceRuleActive", C(), { id: rule5, active: false, reason: "ปิดโค้ดโปรหมดแคมเปญ" }), "ปิด");
    eq([(await q<{ active: boolean }>(`SELECT active FROM "TripPriceRule" WHERE id = $1`, [rule5]))[0]?.active, await redemptions(rule5)], [false, 5], "คงแถว");
  });
  await st("X9-3", "removePrice ต้องมีเหตุผล ≥ 10 ตัวอักษร · มีเหตุผล ⇒ ลบได้ + audit เก็บค่าก่อนลบ (amountMinor)", async () => {
    await needDb(); const id = await rawPrice({ amount: 123_400, pax: "INFANT", departureId: await mkDep("2027-11-11") });
    codeR(await call("removePrice", C(), { id, reason: "สั้น" }), "VALIDATION", "สั้น", "REASON_REQUIRED");
    V(await call("removePrice", C(), { id, reason: "ตั้งราคาผิดรอบ ทดสอบลบ" }), "ลบ");
    const a = await q<{ before: Rec | null }>(`SELECT before FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2`, [tA, id]).catch(() => []);
    ok(a.some((x) => JSON.stringify(x.before ?? {}).includes("123400")), `audit ไม่มีค่าก่อนลบ: ${fmt(a)}`);
  });
  groupLine("X9");

  // ═══════════════ EV. event ═══════════════
  console.log("\n── EV: event (payload ไม่มีข้อมูลบุคคล) ──");
  await st("EV-1", "trips.price.changed: payload ตรงชุด {unitId productId seasonId departureId scope count} · scope ∈ SEASON/PRICE/RULE", async () => {
    await needDb(); V(await call("setPrice", C(), { productId: PRD.A.id, paxTypeId: PRD.A.pt.INFANT, currency: "THB", amountMinor: 3_000 }), "setPrice");
    const ev = await outbox("trips.price.changed"); ok(ev.length > 0, "ไม่มี event");
    for (const e of ev) { eq(Object.keys(e.payload).sort(), ["count", "departureId", "productId", "scope", "seasonId", "unitId"], "keys"); ok(["SEASON", "PRICE", "RULE"].includes(String(e.payload.scope)), "scope"); }
  });
  await st("EV-2", "trips.promo.redeemed: payload ตรงชุด {ruleId bookingId discountSatang} · ไม่มีตัวโค้ด/ผู้ติดต่อ · key ไม่ซ้ำ", async () => {
    await needDb(); const ev = await outbox("trips.promo.redeemed"); ok(ev.length >= 5, `event ${ev.length}`);
    for (const e of ev) { eq(Object.keys(e.payload).sort(), ["bookingId", "discountSatang", "ruleId"], "keys"); ok(!/contact|code/i.test(JSON.stringify(e.payload)), "มีโค้ด/ผู้ติดต่อ"); }
    eq(new Set(ev.map((e) => e.idempotencyKey)).size, ev.length, "key");
  });
  await st("EV-3", "trips.promo.exhausted ครั้งเดียวต่อโค้ด (PD-1 ใช้ครบ 5) · payload {ruleId unitId maxUses}", async () => {
    await needDb(); ok(rule5, "PD-1 ไม่ผ่าน");
    const ev = (await outbox("trips.promo.exhausted")).filter((e) => e.payload.ruleId === rule5);
    eq([ev.length, ev[0] && Object.keys(ev[0].payload).sort(), ev[0]?.payload.maxUses], [1, ["maxUses", "ruleId", "unitId"], 5], "exhausted");
  });
  groupLine("EV");

  // ═══════════════ Q. quote ของ Sellable ═══════════════
  console.log("\n── Q: tripSellable.quote ──");
  const sq = async (ctx: Rec, lines: Rec[]) => { const ts = asRec(needTrips().tripSellable); const f = ts?.quote; if (typeof f !== "function") throw new AssertFail("ไม่มี tripSellable.quote"); try { return asRec(await (f as AnyFn).call(ts, ctx, { lines })) ?? {}; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } };
  await st("Q-1", "quote: รูป Quote ของ CC §C · quoteId sha256 hex · ซ้ำได้ค่าเดิม · ราคาเปลี่ยน ⇒ quoteId เปลี่ยน · holdMinutes = T5", async () => {
    await needDb(); const d = await mkDep("2027-10-20"); const ln = line(d);
    const a = V(await sq(C(), [ln]), "quote"), b = V(await sq(C(), [ln]), "quote ซ้ำ");
    ok(/^[0-9a-f]{64}$/.test(String(a.quoteId)) && a.quoteId === b.quoteId, `quoteId ${a.quoteId} / ${b.quoteId}`);
    eq([asRec(asRec(a.totals)?.payable)?.satang, a.holdMinutes, Array.isArray(a.lines), Array.isArray(a.cancelLadder)], [B0142.totalSatang, R.holdMinutes, true, true], "รูป");
    const pid = await rawPrice({ amount: 360_000, departureId: d });
    try { ok(V(await sq(C(), [ln]), "หลังแก้").quoteId !== a.quoteId, "quoteId ไม่เปลี่ยน"); } finally { await pool.query(`DELETE FROM "TripPrice" WHERE id = $1`, [pid]); }
  });
  await st("Q-2", "สกุล USD บน TOUR ⇒ CURRENCY_NOT_ALLOWED", async () => { await needDb(); const d = await mkDep("2027-10-21"); codeR(await sq(C(), [line(d, { currency: "USD" })]), "CURRENCY_NOT_ALLOWED", "USD"); });
  await st("Q-3", "quote ไม่เขียนฐาน: OutboxEvent · AuditLog · usedCount · TripPromoRedemption ของร้าน A เท่าเดิม (รวมเมื่อมีโค้ด)", async () => {
    await needDb(); const d = await mkDep("2027-10-22"); const code = `QW${hex(2)}`.toUpperCase(); await rawRule({ kind: "PROMO_CODE", code, discountBp: 1_000, maxUses: 9 });
    const snapC = async () => Promise.all([`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1`, `SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1`, `SELECT COALESCE(sum("usedCount"),0)::int AS n FROM "TripPriceRule" WHERE "tenantId" = $1`]
      .map(async (s) => (await q<{ n: number }>(s, [tA]).catch(() => [{ n: -1 }]))[0]?.n));
    const b0 = await snapC(); V(await sq(C(), [line(d, { promoCode: code })]), "quote"); eq(await snapC(), b0, "ตัวนับ");
  });
  groupLine("Q");

  // ═══════════════ SD. seed (อ่านอย่างเดียว) ═══════════════
  console.log("\n── SD: seed + ฟิกซ์เจอร์ ──");
  const FXR = FX as unknown as Rec;
  await st("SD-1", "ฟิกซ์เจอร์ RACHA_SEASONS + RACHA_DEPARTURE_PRICE_1231 = ตัวเลข README ภาพ 16 · ปีใหม่ = ช่วง peakNewYear · เด็ก = 70%", () => {
    const ss = asArr(FXR.RACHA_SEASONS), dp = asRec(FXR.RACHA_DEPARTURE_PRICE_1231); ok(ss.length === 3 && dp, "ฟิกซ์เจอร์ยังไม่มี RACHA_SEASONS/RACHA_DEPARTURE_PRICE_1231"); ok(M16, "README");
    const by = (k: string) => ss.find((s) => s.key === k) ?? {};
    eq([[by("MAIN").adultSatang, by("MAIN").childSatang], [by("NEW_YEAR").adultSatang, by("NEW_YEAR").childSatang], [by("OFF").adultSatang, by("OFF").childSatang], [dp?.adultSatang, dp?.childSatang]], [M16!.main, M16!.ny, M16!.off, M16!.dec31], "ตัวเลข");
    eq([by("NEW_YEAR").from, by("NEW_YEAR").to, by("MAIN").from, by("MAIN").to, by("OFF").from, by("OFF").to, dp?.date], [NY.from, NY.to, MAIN_FROM, MAIN_TO, OFF_FROM, OFF_TO, "2026-12-31"], "วัน");
  });
  const seedT = async () => (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'andaman-dive'`))[0]?.id ?? "";
  await st("SD-2", "seed: ฤดูกาล 3 แถวของร้าน andaman-dive ตามภาพ 16 (วัน · priority ปีใหม่ > หลัก) + ราคาผู้ใหญ่ต่อฤดู · ไม่มีราคาเด็ก (คิด 70%)", async () => {
    await needTable("TripSeason"); const t = await seedT();
    const rows = await q<{ name: string; s: string; e: string; priority: number; a: number | null }>(`SELECT s.name, to_char(s."dateStart",'YYYY-MM-DD') s, to_char(s."dateEnd",'YYYY-MM-DD') e, s.priority,
      (SELECT p."amountMinor" FROM "TripPrice" p JOIN "TripPaxType" x ON x.id = p."paxTypeId" WHERE p."seasonId" = s.id AND x.code = 'ADULT' LIMIT 1) a FROM "TripSeason" s WHERE s."tenantId" = $1 AND s.status = 'ACTIVE' ORDER BY s."dateStart"`, [t]);
    ok(rows.length >= 3, `ฤดูกาล seed ${rows.length}`);
    const f = (from: string) => rows.find((r) => r.s === from);
    eq([f(MAIN_FROM)?.e, f(NY.from)?.e, f(OFF_FROM)?.e, f(MAIN_FROM)?.a, f(NY.from)?.a, f(OFF_FROM)?.a], [MAIN_TO, NY.to, OFF_TO, M16?.main[0], M16?.ny[0], M16?.off[0]], "ฤดูกาล");
    ok((f(NY.from)?.priority ?? 0) > (f(MAIN_FROM)?.priority ?? 0), "priority ปีใหม่ไม่สูงกว่า");
    eq((await q<{ n: number }>(`SELECT count(*)::int n FROM "TripPrice" p JOIN "TripPaxType" x ON x.id = p."paxTypeId" WHERE p."tenantId" = $1 AND x.code = 'CHILD'`, [t]))[0]?.n, 0, "ราคาเด็ก");
  });
  await st("SD-3", "seed: รอบราชา 31 ธ.ค. 2569 มีราคารอบผู้ใหญ่ 4,500 · ไม่มีโค้ดส่วนลดใน seed", async () => {
    await needTable("TripPrice"); const t = await seedT();
    const r = await q<{ a: number }>(`SELECT p."amountMinor" a FROM "TripPrice" p JOIN "TripDeparture" d ON d.id = p."departureId" JOIN "TripPaxType" x ON x.id = p."paxTypeId" WHERE p."tenantId" = $1 AND d."localDate" = '2026-12-31' AND x.code = 'ADULT'`, [t]);
    eq(r.map((x) => x.a), [M16?.dec31[0]], "ราคารอบ");
    eq((await q<{ n: number }>(`SELECT count(*)::int n FROM "TripPriceRule" WHERE "tenantId" = $1 AND kind = 'PROMO_CODE'`, [t]))[0]?.n, 0, "โค้ด");
  });
  groupLine("SD");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  for (const f of unregister) { try { f(); } catch { /* ignore */ } }
  try { await cleanupTenants(tenantIds); await cleanupUsers(); await dropControlTables(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T0.5 · ตัวเลือกราคา · ฤดูกาล · กฎราคา · โค้ดส่วนลด · ราคาแก้มือ · snapshot =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
