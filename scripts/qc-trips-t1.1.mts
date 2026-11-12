// QC — TRIPS T1.1 · จอสินค้าทัวร์ (ภาพ 16) · โซนรับส่ง (บริการใหม่) · จอค่าตั้ง trips (ภาพ 17) · ธรรมเนียมจอ TRIPS
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/T1.1.md · สัญญา ledger/TRIPS-CORE-CONTRACT.md §A §E §N.5 · ภาพ ledger/design-trips/16 17 (+ README)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน)   S ไฟล์/กติกาโค้ด (static)   PZ โซนรับส่ง pure (zod · ช่วงเวลา)   PS บริการโซนรับส่งบนฐาน
//   X1 แยกร้าน/หน่วย   X3 ยิงพร้อมกัน   NAV แถบนำทาง + ด่านหน้า   LV รายการสินค้า (seed)   EV ตัวแก้สินค้า ราชา (seed · ตัวเลขภาพ 16)
//   ET ตัวแก้สินค้า (ร้านชั่วคราว · สิทธิ์/สถานะ/หนี้ T0.2-T0.5)   SET จอค่าตั้ง (ภาพ 17)   SD ส่วนขยาย seed
//
// 🔴 ที่ตรวจไม่ได้ที่นี่ (ไม่มี server/เบราว์เซอร์) = ด่านภาพของผู้คุม: ผัง · ป้ายรูปทรง · ขนาดตัวอักษร/ปุ่ม · ล้นจอ · กล่องคำเตือนจริง · คลิก/ฟอร์ม
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t11-*` (ผู้ใช้ `trips-t11-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ร้าน seed อ่านอย่างเดียว
// 🔴 ยังไม่มีโมดูล/ฟังก์ชัน = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t1.1.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน T1.1: PC เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t1.1";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t0.5) ═══════════════
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
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t11qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SLUG = "trips-t11-";
const EMAIL_PREFIX = "trips-t11-";
const PSLUG = (tag: string) => `t11qc-${tag}-${STAMP}`;
const DAY = 86_400_000;
const now = () => new Date();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** ไฟล์ใต้โฟลเดอร์ (เรียกซ้ำ) — ไม่มีโฟลเดอร์ = [] */
const walk = (rel: string): string[] => {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const n of readdirSync(abs)) {
    const p = join(rel, n);
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mts)$/.test(n)) out.push(p);
  }
  return out;
};

// ═══════════════ สเปก (ใบสั่ง T1.1) ═══════════════
const APP = "src/app/app/u/[unitSlug]/trips";
const PAGE_KEYS = ["products", "departures", "bookings", "agents", "channels", "settings"] as const;
const STUB_KEYS = ["departures", "bookings", "agents", "channels"] as const;
const PAGES = [`${APP}/page.tsx`, ...PAGE_KEYS.map((k) => `${APP}/${k}/page.tsx`)];
const MOD = "src/lib/modules/trips/";
const OWN_MOD = ["pickup-core.ts", "pickup.ts", "pickup-actions.ts", "screens.ts", "trips-settings.ts", "screen-actions.ts"].map((f) => MOD + f);
const SERVER_ACTION_FILES = [MOD + "pickup-actions.ts", MOD + "screen-actions.ts"];
const COMP = "src/components/trips";
const SHARED = `${COMP}/trips-shared.ts`;
const FACADE_T11 = ["listPickupZones", "createPickupZone", "updatePickupZone", "setPickupZoneActive", "reorderPickupZones", "pickupWindowFor", "pickupZoneInputSchema",
  "PICKUP_ZONE_KINDS", "PICKUP_ERROR_CODES", "PICKUP_ZONE_LIMIT", "tripsPageGate", "loadTripsNav", "loadProductListVM", "loadProductEditorVM", "loadTripsSettingsVM", "saveTripsSettings", "resetTripsSetting"];
const NO_DELETE = ["deletePickupZone", "removePickupZone", "destroyPickupZone"];
const PICKUP_ERRORS = ["INVALID_INPUT", "NOT_FOUND", "FORBIDDEN", "UNIT_NOT_TRIPS", "NAME_TAKEN", "ZONE_LIMIT", "BUSY"];
const T0X_FILES = ["products.ts", "products-core.ts", "product-actions.ts", "departures.ts", "departures-core.ts", "departure-actions.ts", "resources.ts", "jobs.ts", "pricing.ts", "pricing-core.ts",
  "prices.ts", "pricing-actions.ts", "promo.ts", "snapshot.ts", "money-math.ts", "sellable-impl.ts", "json-schemas.ts"].map((f) => MOD + f);
const FROZEN_DIRS = ["src/lib/core/settings", "src/components/settings"];
const BASE_COMMIT = "2fd4c1509"; // ORACLE-EDIT (ผู้คุม 12 พ.ย.): ฐานเลื่อนเป็น session/trips หลังรับ T0.4 (เดิม fc9e373ec นับบรรทัดที่ T0.4 ลบว่า T1.1 ลบ) · session/trips ตอนเขียนใบสั่ง (T0.1 T0.2 T0.3 T0.5 merge แล้ว)
const TESTIDS_FIXED = ["trips-nav", ...PAGE_KEYS.map((k) => `trips-nav-${k}`), "trips-not-yet", "trips-forbidden", "trips-loading", "trips-error",
  "trips-product-list", "trips-product-search", "trips-product-filter-all", "trips-product-filter-tour", "trips-product-filter-liveaboard", "trips-product-filter-archived", "trips-product-add", "trips-product-empty",
  "trips-product-editor", "trips-product-status", "trips-product-preview", "trips-product-save", "trips-product-publish", "trips-product-unpublish", "trips-product-archive", "trips-product-restore",
  "trips-option-add", "trips-season-add", "trips-departure-price-add", "trips-extra-add", "trips-extra-warning", "trips-pickup-add",
  "trips-content-table", "trips-content-draft-translate", "trips-brochure", "trips-applied", "trips-applied-edit", "trips-example", "trips-example-departure", "trips-example-total",
  "trips-settings", "trips-settings-scope", "trips-settings-only-changed", "trips-settings-history"];
const TESTID_PATTERNS = ["trips-product-item-", "trips-editor-tab-", "trips-option-row-", "trips-option-toggle-", "trips-pax-row-", "trips-pax-age-from-", "trips-pax-age-to-", "trips-season-row-",
  "trips-departure-price-row-", "trips-extra-row-", "trips-extra-toggle-", "trips-pickup-row-", "trips-pickup-edit-", "trips-pickup-toggle-", "trips-pickup-up-", "trips-pickup-down-",
  "trips-content-edit-", "trips-settings-section-", "trips-settings-product-", "trips-settings-warning-"];
const I18N_REQUIRED = [...PAGE_KEYS.map((k) => `nav.${k}`), "notYet.title", "notYet.body", "forbidden.title", "forbidden.body", "products.title", "products.add", "products.search", "products.empty", "settings.title"];
const SECTION_KEYS = ["sell", "pay", "cancel", "pax", "tax", "line", "dive", "pdpa", "msg"];
const SETTING_KEY_RE = /["'`]trips\.(general|fx|sell|price|public|ops|supplier|pay|cash|cancel|pax|tax|giftcard|consumer|line|parkFee|dive|insurance|license|prospectus|marine|pdpa|waiver|msg)\.[A-Za-z]/;
// ภาพ 16/README (ตัวเลข · ไม่ใช่ค่าตั้ง)
const R = FX.PRODUCT_RACHA;
const SEASONS_EXPECT = FX.RACHA_SEASONS.map((s) => ({ name: s.name, adult: s.adultSatang, child: s.childSatang }));
const DEC31 = FX.RACHA_DEPARTURE_PRICE_1231;
const B0142 = FX.BOOKING_TR_0142;
const ZONES_EXPECT = [
  { name: "ในโซน", kind: "ZONE", from: "06:45", to: "07:35", surcharge: 0 },
  { name: "นอกโซน", kind: "ZONE", from: "06:15", to: "06:40", surcharge: R.extras.outOfZonePickup.satang },
  { name: "มาเอง", kind: "SELF", meet: "08:00", surcharge: 0 },
];
const ACCOUNTANT_EXPECT = ["trips.fx.rates", "trips.cancel.changeDateFee", "trips.tax.vatRate", "trips.tax.invoiceForm", "trips.tax.forfeitAfterInvoice", "trips.tax.corporateCustomerWht", "trips.line.defaults"].sort(); // TRIPS-DEFAULTS §5.1 (T26 T35 T37 T39 T41 T44) + ภาคผนวก ก X5 · T42 ซ่อนถึงเฟส 2
const CONFIRM_TH = "{ร้าน} ยืนยันการจอง {รหัสจอง} · {สินค้า} วันที่ {วันเดินทาง} · รถรับ {เวลารับ} ที่ {จุดนัด} · ทีมงานรอพบนะคะ";
const SIMILAN_LADDER = [{ fromDaysBefore: 60, refundPct: 50 }, { fromDaysBefore: 31, refundPct: 30 }, { fromDaysBefore: 0, refundPct: 0 }];
// seed
const DIVE_TENANT = FX.SHOP_DIVE.tenant.id;
const DIVE_TRIPS_UNIT = FX.SHOP_DIVE.units.trips;
const DIVE_OWNER_ID = "tripsqc-user-dive-owner";
const SEED_SLUGS = { racha: "racha-yai-day-trip", phiphi: "phiphi-khai-speedboat", deep3: "racha-noi-3-dives", similan: "similan-4-nights" } as const;

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 30 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const needTable = async (t: string) => { if ((await cols(t)).length === 0) throw new AssertFail(`ยังไม่มีตาราง ${t}`); };
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]); if (l.length) return l; }
  return [];
};
async function insertRow(table: string, vals: Rec): Promise<void> {
  await needTable(table);
  const v: Rec = { ...vals };
  const names = new Set((await cols(table)).map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (t === "text" || t.startsWith("character")) { const l = await checkLits(table, c.column_name); v[c.column_name] = l[0] ?? `qc${randomBytes(3).toString("hex")}`; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}"
      : t.startsWith("timestamp") ? new Date() : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}

// ═══════════════ ร้านชั่วคราว ═══════════════
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
const tenantIds: string[] = [];
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type Ctx = { tenantId: string; actorUserId: string };

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const SET = SETI.mod;
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name}`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => asRec(await fn(name)(...a)) ?? {};
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const okR = (r: Rec, what: string) => ok(r.ok === true, `${what}: ${fmt(r)}`);
  const codeR = (r: Rec, codes: string | string[], what: string) => { const cs = Array.isArray(codes) ? codes : [codes]; ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`); };
  const SHI = await tryImport("@/components/trips/trips-shared");
  const shared = (name: string): unknown => { const v = SHI.mod?.[name]; if (v === undefined) throw new AssertFail(`${SHARED} ยังไม่มี ${name} (${SHI.err.slice(0, 100)})`); return v; };

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed andaman-dive + หน่วย TRIPS andaman-dive-trips อยู่", async () => {
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "BusinessUnit" WHERE id = $1 AND "tenantId" = $2 AND type::text = 'TRIPS'`, [DIVE_TRIPS_UNIT.id, DIVE_TENANT]);
    eq(r[0]?.n, 1, "หน่วย TRIPS ของ seed");
  });
  await st("PC-2", "seed T0.2/T0.3/T0.5 ลงฐานนี้แล้ว: สินค้า 4 · ฤดูกาลราชา 3 · รอบราชา 31 ธ.ค.", async () => {
    const p = await q<{ n: number }>(`SELECT count(*)::int n FROM "TripProduct" WHERE "tenantId" = $1 AND slug = ANY($2::text[])`, [DIVE_TENANT, Object.values(SEED_SLUGS)]);
    const s = await q<{ n: number }>(`SELECT count(*)::int n FROM "TripSeason" WHERE "tenantId" = $1 AND status = 'ACTIVE'`, [DIVE_TENANT]);
    const d = await q<{ n: number }>(`SELECT count(*)::int n FROM "TripDeparture" d JOIN "TripProduct" p ON p.id = d."productId" WHERE p.slug = $1 AND d."localDate" = $2::date`, [SEED_SLUGS.racha, DEC31.date]);
    eq([p[0]?.n, s[0]?.n, d[0]?.n], [4, 3, 1], "สินค้า/ฤดู/รอบ");
  });
  await st("PC-3", "ฟิกซ์เจอร์คำนวณถูก · 0142 = 11,450.00 · ฤดูกาล 3 แถว", () => {
    const r = FX.assertFixtureArithmetic();
    ok(r.checks > 20, `checks=${r.checks}`);
    eq([B0142.totalSatang, SEASONS_EXPECT.length], [1_145_000, 3], "ตัวเลข");
  });
  await st("PC-4", "ทะเบียนค่าตั้งโหลดได้ (loadSettingsForm · setSettings · listDefs trips)", () => {
    S("loadSettingsForm"); S("setSettings");
    ok(asArr(S("listDefs")("trips")).length > 50, "defs trips");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์และกติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด (static) ──");
  const compFiles = walk(COMP);
  const appFiles = walk(APP);
  const uiFiles = [...compFiles, ...appFiles];
  const allSrc = uiFiles.map((f) => read(f)).join("\n");
  await st("S-1", "ไฟล์เจ้าของของโมดูลครบ: pickup-core · pickup · pickup-actions · screens · trips-settings · screen-actions", () => {
    const miss = OWN_MOD.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
  await st("S-2", `facade trips: บล็อก "// TRIPS T1.1 ▸" ส่งออก ${FACADE_T11.length} ชื่อ · ไม่มี export * · ไม่มีฟังก์ชันลบโซน`, () => {
    const src = read(MOD + "index.ts");
    ok(/\/\/ TRIPS T1\.1 ▸/.test(src), "ไม่มีบล็อก // TRIPS T1.1 ▸");
    ok(!/export\s+\*/.test(stripComments(src)), "มี export *");
    const t = needTrips();
    const miss = FACADE_T11.filter((n) => t[n] === undefined);
    ok(miss.length === 0, `ยังไม่ส่งออก: ${miss.join(", ")}`);
    const del = NO_DELETE.filter((n) => t[n] !== undefined || new RegExp(`\\b${n}\\b`).test(stripComments(read(MOD + "pickup.ts"))));
    ok(del.length === 0, `มีฟังก์ชันลบ: ${del.join(", ")}`);
  });
  await st("S-3", "route ครบ: layout · loading · error · page.tsx ×7 (index + 6 แท็บ) · หน้า stub 4 ตัวใช้ <TripsNotYet>", () => {
    const need = [`${APP}/layout.tsx`, `${APP}/loading.tsx`, `${APP}/error.tsx`, ...PAGES];
    const miss = need.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
    const notStub = STUB_KEYS.filter((k) => !/TripsNotYet/.test(read(`${APP}/${k}/page.tsx`)));
    ok(notStub.length === 0, `หน้า stub ไม่ใช้ TripsNotYet: ${notStub.join(", ")}`);
  });
  await st("S-4", "ทุก page.tsx ใต้ trips: requireUnit( + tripsPageGate( · layout ตรวจชนิดหน่วย TRIPS + notFound", () => {
    const bad = PAGES.filter((f) => { const s = stripComments(read(f)); return !s || !/requireUnit\(/.test(s) || !/tripsPageGate\(/.test(s); });
    ok(bad.length === 0, `ไม่ผ่านด่าน: ${bad.join(", ")}`);
    const lay = stripComments(read(`${APP}/layout.tsx`));
    ok(/requireUnit\(/.test(lay) && /["']TRIPS["']/.test(lay) && /notFound\(/.test(lay), "layout ไม่ตรวจ TRIPS/notFound");
  });
  await st("S-5", "ไม่มี prisma ใน หน้า/คอมโพเนนต์ trips และไฟล์ใหม่ของโมดูล (ใช้ tenantDb ในโมดูลเท่านั้น)", () => {
    ok(uiFiles.length > 0, "ยังไม่มีไฟล์ UI ของ trips");
    const badUi = uiFiles.filter((f) => /@\/lib\/core\/db|@prisma\/client["']|\bprisma\./.test(stripComments(read(f)).replace(/import\s+type[^;]+;/g, "")));
    const badMod = OWN_MOD.filter((f) => /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(read(f)));
    ok(badUi.length === 0 && badMod.length === 0, `prisma: ${[...badUi, ...badMod].join(", ")}`);
  });
  await st("S-6", "ไม่มี any ในไฟล์ของใบ (โมดูล · คอมโพเนนต์ · หน้า)", () => {
    const files = [...OWN_MOD, ...uiFiles].filter((f) => existsSync(join(ROOT, f)));
    ok(files.length >= OWN_MOD.length, "ไฟล์ยังไม่ครบ");
    const bad = files.filter((f) => /:\s*any\b|\bas\s+any\b|<any>|\bany\[\]/.test(stripComments(read(f))));
    ok(bad.length === 0, `มี any: ${bad.join(", ")}`);
  });
  await st("S-7", "'use client' ไม่ import ของที่ลากถึง prisma (ตามเข้าไป 1 ชั้นใน src/lib/modules/trips)", () => {
    const clients = uiFiles.filter((f) => /^\s*["']use client["']/.test(read(f)));
    ok(clients.length > 0, "ยังไม่มีไฟล์ 'use client' ของ trips");
    const bad: string[] = [];
    for (const f of clients) {
      const src = stripComments(read(f));
      for (const m of src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s*["']([^"']+)["']/gm)) {
        if (m[1]) continue;
        const spec = m[2];
        if (/^@\/lib\/core\/db|^@prisma\/client$|^@\/lib\/core\/settings$|^@\/lib\/core\/settings\/(service|form|index)|^@\/lib\/modules\/trips$|^@\/lib\/modules\/trips\/index/.test(spec)) { bad.push(`${f} → ${spec}`); continue; }
        const mm = /^@\/lib\/modules\/trips\/([\w-]+)$/.exec(spec);
        if (mm) {
          const dep = read(`${MOD}${mm[1]}.ts`);
          const isServerAction = /^\s*["']use server["']/.test(dep);
          if (!isServerAction && /@\/lib\/core\/db|tenantDb|@prisma\/client["']/.test(stripComments(dep).replace(/import\s+type[^;]+;/g, ""))) bad.push(`${f} → ${spec} (ลาก db)`);
        }
      }
    }
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-8", `data-testid ครบในซอร์ส: ตายตัว ${TESTIDS_FIXED.length} + แพตเทิร์น ${TESTID_PATTERNS.length}`, () => {
    const miss = TESTIDS_FIXED.filter((t) => !new RegExp(`data-testid=\\{?["'\`]${t}["'\`]`).test(allSrc));
    const missP = TESTID_PATTERNS.filter((p) => !allSrc.includes(`\`${p}\${`) && !allSrc.includes(`"${p}" +`) && !allSrc.includes(`'${p}' +`));
    ok(miss.length === 0 && missP.length === 0, `ขาด: ${[...miss, ...missP.map((p) => p + "*")].slice(0, 12).join(", ")}${miss.length + missP.length > 12 ? " …" : ""}`);
  });
  await st("S-9", "จอค่าตั้งใช้ SettingsForm กลาง + loadSettingsForm · ไม่มีคีย์ค่าตั้ง trips เขียนเองในคอมโพเนนต์/หน้า", () => {
    const tsx = compFiles.filter((f) => /from\s*["']@\/components\/settings\/SettingsForm["']/.test(read(f)));
    ok(tsx.length > 0, "ไม่มีคอมโพเนนต์ trips ที่ import SettingsForm");
    ok(/loadSettingsForm\(/.test(stripComments(read(MOD + "screens.ts")) + stripComments(read(MOD + "trips-settings.ts"))), "screens/trips-settings ไม่เรียก loadSettingsForm");
    const bad = uiFiles.filter((f) => SETTING_KEY_RE.test(stripComments(read(f))));
    ok(bad.length === 0, `มีคีย์ค่าตั้งใน UI: ${bad.join(", ")}`);
  });
  await st("S-10", "i18n: src/messages/{th,en}/trips.json คีย์ตรงกัน · คีย์ขั้นต่ำครบ · ไม่มีจีน · request.ts โหลด namespace trips", () => {
    const flat = (o: unknown, p = ""): string[] => { const r = asRec(o); return r ? Object.entries(r).flatMap(([k, v]) => (asRec(v) ? flat(v, `${p}${k}.`) : [`${p}${k}`])) : []; };
    const th = read("src/messages/th/trips.json"), en = read("src/messages/en/trips.json");
    ok(th && en, "ยังไม่มีไฟล์ trips.json สองภาษา");
    const kt = flat(JSON.parse(th)).sort(), ke = flat(JSON.parse(en)).sort();
    eq(kt, ke, "คีย์ th = en");
    const miss = I18N_REQUIRED.filter((k) => !kt.includes(k));
    ok(miss.length === 0, `คีย์ขาด: ${miss.join(", ")}`);
    const enNav = asRec(asRec(JSON.parse(en))?.nav) ?? {};
    ok(Object.values(enNav).every((v) => typeof v === "string" && !/[฀-๿]/.test(v)), "en nav มีภาษาไทย");
    ok(!existsSync(join(ROOT, "src/messages/zh")) && !/zh|中文/.test(th + en), "มีภาษาจีน");
    ok(/trips\.json/.test(read("src/i18n/request.ts")), "request.ts ไม่โหลด trips.json");
  });
  await st("S-11", "ลงทะเบียนเมนู: childrenFor case \"TRIPS\" (layout แอป) ชี้ /trips/* · UNIT_NAV.TRIPS (หน้าหน่วย)", () => {
    const lay = read("src/app/app/layout.tsx");
    const at = lay.indexOf('case "TRIPS"');
    ok(at > 0, "layout.tsx ไม่มี case \"TRIPS\"");
    ok(/\/trips\/|TRIPS_NAV|tripsNav/.test(lay.slice(at, at + 1500)), "case TRIPS ไม่ชี้ /trips/*");
    const unit = read("src/app/app/u/[unitSlug]/page.tsx");
    ok(/TRIPS:\s*\[[\s\S]{0,400}\/trips\/products[\s\S]{0,400}\/trips\/settings/.test(unit), "UNIT_NAV.TRIPS ไม่มี /trips/products + /trips/settings");
  });
  await st("S-12", "ทะเบียนปุ่ม scripts/trips-ui-inventory.json: สคีมาครบ · ครอบ testid ตายตัว/แพตเทิร์น · ไม่มีแถวผี", () => {
    const raw = read("scripts/trips-ui-inventory.json");
    ok(raw, "ยังไม่มี scripts/trips-ui-inventory.json");
    const rows = asArr(asRec(JSON.parse(raw))?.rows);
    ok(rows.length > 0, "rows ว่าง");
    const kinds = ["button", "link", "menu", "tab", "toggle", "drag", "form", "filter", "input", "textarea", "select", "notice"];
    const bad = rows.filter((r) => typeof r.page !== "string" || !String(r.page).startsWith("/app/u/[unitSlug]/trips") || typeof r.testid !== "string" || !kinds.includes(String(r.kind))
      || !Array.isArray(r.roles) || (r.roles as unknown[]).length === 0 || !(r.roles as unknown[]).every((x) => ["owner", "editor", "viewer"].includes(String(x))) || r.wo !== "T1.1" || r.system !== "TRIPS" || !asRec(r.expect)?.type);
    ok(bad.length === 0, `แถวพิการ ${bad.length}: ${fmt(bad[0])}`);
    const ids = rows.map((r) => String(r.testid));
    const miss = [...TESTIDS_FIXED.filter((t) => !ids.includes(t)), ...TESTID_PATTERNS.filter((p) => !ids.includes(`${p}*`)).map((p) => `${p}*`)];
    ok(miss.length === 0, `ไม่มีแถว: ${miss.slice(0, 10).join(", ")}`);
    const ghost = ids.filter((t) => (t.endsWith("*") ? !allSrc.includes(t.slice(0, -1)) : !allSrc.includes(t)));
    ok(ghost.length === 0, `แถวผี: ${ghost.slice(0, 8).join(", ")}`);
  });
  await st("S-13", "เครื่องมือภาพ: scripts/visual-trips.mts (loadTripsQcEnv · สเปก t1.1 · 1440 · ฉาก 3) + scripts/parity-trips.sh", () => {
    const v = read("scripts/visual-trips.mts");
    ok(v, "ยังไม่มี scripts/visual-trips.mts");
    ok(/loadTripsQcEnv/.test(v) && !/loadSvcQcEnv/.test(v), "ไม่ใช้ loadTripsQcEnv");
    ok(/["']t1\.1["']/.test(v) && /1440/.test(v), "ไม่มีสเปก t1.1 / 1440");
    const scenes = ["products-racha", "settings-unit", "settings-similan-warning"].filter((n) => !v.includes(n));
    ok(scenes.length === 0, `ฉากขาด: ${scenes.join(", ")}`);
    ok(/finally/.test(v) && /session\.deleteMany/.test(v), "ไม่ลบ session ใน finally");
    const p = read("scripts/parity-trips.sh");
    ok(p && /16-shop-products|design-trips/.test(p), "ยังไม่มี scripts/parity-trips.sh ที่อ่านภาพ design-trips");
  });
  await st("S-14", `ไม่แก้ไฟล์ T0.x (ห้ามลบบรรทัด) · ไม่แตะ settings กลาง/SettingsForm เลย (เทียบ ${BASE_COMMIT})`, () => {
    let out = "";
    try { out = execFileSync("git", ["diff", "--numstat", BASE_COMMIT, "--", ...T0X_FILES, ...FROZEN_DIRS], { cwd: ROOT, encoding: "utf8" }); } catch (e) { throw new AssertFail(`git diff ไม่ได้: ${errMsg(e)}`); }
    const rows = out.trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
    const del = rows.filter(([, d, f]) => T0X_FILES.includes(f) && Number(d) > 0).map(([, d, f]) => `${f} −${d}`);
    const frozen = rows.filter(([, d, f]) => FROZEN_DIRS.some((dir) => f.startsWith(dir)) && !(f === "src/lib/core/settings/defs/trips.ts" && Number(d) <= 1)) /* ORACLE-EDIT S-14 (ผู้คุม 12 พ.ย.): มติรอบแก้ r3 — เพิ่มป้ายแสดงผลของช่องย่อยใน defs/trips.ts ได้ (เพิ่มอย่างเดียว · ลบได้ 1 บรรทัด = import ชนิด) · คีย์/ค่าเริ่ม/ชั้น ตรึงโดย t0.1 กลุ่ม R */.map(([a, d, f]) => `${f} +${a}/−${d}`);
    ok(del.length === 0 && frozen.length === 0, `${[...del, ...frozen].join(" · ")}`);
  });
  await st("S-15", "action ใหม่: \"use server\" · ส่งออก async function เท่านั้น · ทุกตัวผ่าน requireUnit", () => {
    for (const f of SERVER_ACTION_FILES) {
      const s = stripComments(read(f));
      ok(s, `ยังไม่มี ${f}`);
      ok(/^\s*["']use server["']/.test(read(f)), `${f} ไม่มี "use server"`);
      ok(!/export\s+(const|let|type|interface|class|function\s)/.test(s.replace(/export\s+async\s+function/g, "")), `${f} ส่งออกสิ่งที่ไม่ใช่ async function`);
      const fns = [...s.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
      ok(fns.length > 0, `${f} ไม่มี action`);
      const bodies = s.split(/export\s+async\s+function\s+/).slice(1);
      const noGate = bodies.filter((b) => !/requireUnit\(|guard\(|gate\(/.test(b.slice(0, 600))).map((b) => b.slice(0, 30));
      ok(noGate.length === 0, `${f} action ไม่ผ่านด่าน: ${noGate.join(", ")}`);
    }
  });
  await st("S-16", "loading.tsx มี trips-loading · error.tsx เป็น 'use client' มี trips-error · ตัวโหลดคิดราคาด้วยตัวคิดราคาจริง ไม่คูณ % เอง", () => {
    ok(/trips-loading/.test(read(`${APP}/loading.tsx`)), "loading.tsx");
    const er = read(`${APP}/error.tsx`);
    ok(/^\s*["']use client["']/.test(er) && /trips-error/.test(er), "error.tsx");
    const sc = stripComments(read(MOD + "screens.ts"));
    ok(/quoteTripLine\(|resolveTripPrice\(/.test(sc), "screens.ts ไม่เรียก quoteTripLine/resolveTripPrice");
    ok(!/mulBpHalfUp|mulDivHalfUp|\*\s*0\.7\b|\b70\s*\/\s*100|\/\s*100\s*\*\s*70/.test(sc), "screens.ts คูณ % เอง");
  });
  groupLine("S");

  // ═══════════════ PZ. โซนรับส่ง pure ═══════════════
  console.log("\n── PZ: โซนรับส่ง (pure) ──");
  const zSchema = (): { safeParse: (v: unknown) => { success: boolean } } => {
    const s = asRec(needTrips().pickupZoneInputSchema);
    if (!s || typeof s.safeParse !== "function") throw new AssertFail("ยังไม่มี pickupZoneInputSchema");
    return s as unknown as { safeParse: (v: unknown) => { success: boolean } };
  };
  const zIn = (o: Rec = {}): Rec => ({ unitId: "u_x", kind: "ZONE", name: { th: "ในโซน", en: "In zone" }, areas: { th: "กะตะ · กะรน" }, pickupOffsetMin: 75, windowMin: 50, surchargeSatang: 0, ...o });
  const parses = (v: unknown) => zSchema().safeParse(v).success;
  await st("PZ-1", "ค่าคงที่: PICKUP_ZONE_KINDS = ZONE/SELF · PICKUP_ERROR_CODES ครบ 7 · PICKUP_ZONE_LIMIT เป็นจำนวนเต็มบวก", () => {
    const t = needTrips();
    eq(t.PICKUP_ZONE_KINDS, ["ZONE", "SELF"], "ชนิด");
    eq([...(t.PICKUP_ERROR_CODES as string[] ?? [])].sort(), [...PICKUP_ERRORS].sort(), "รหัส error");
    ok(Number.isInteger(t.PICKUP_ZONE_LIMIT) && Number(t.PICKUP_ZONE_LIMIT) > 0, `limit ${fmt(t.PICKUP_ZONE_LIMIT)}`);
  });
  await st("PZ-2", "zod ผ่าน: โซนปกติ · มาเอง (SELF offset 0 window 0 ฟรี) · ค่าบวกเพิ่ม 2,147,483,647 (int4 สูงสุด)", () => {
    ok(parses(zIn()), "โซนปกติ");
    ok(parses(zIn({ kind: "SELF", pickupOffsetMin: 0, windowMin: 0, surchargeSatang: 0, areas: null })), "SELF");
    ok(parses(zIn({ surchargeSatang: 2_147_483_647 })), "int4 max");
  });
  await st("PZ-3", "zod ปฏิเสธขอบตัวเลข: offset 1440 · offset −1 · offset 1.5 · window > offset · surcharge 2,147,483,648 · surcharge −1", () => {
    const bad = [{ pickupOffsetMin: 1440 }, { pickupOffsetMin: -1 }, { pickupOffsetMin: 1.5 }, { pickupOffsetMin: 30, windowMin: 60 }, { surchargeSatang: 2_147_483_648 }, { surchargeSatang: -1 }];
    const passed = bad.filter((b) => parses(zIn(b)));
    ok(passed.length === 0, `ผ่านทั้งที่ผิด: ${fmt(passed)}`);
  });
  await st("PZ-4", "zod ปฏิเสธ: ชื่อไทยว่าง/ช่องว่าง · ชื่อ 101 ตัว · SELF มีค่าบวกเพิ่ม · SELF มีช่วงเวลา · ชนิดแปลก · คีย์แปลก (tenantId)", () => {
    const bad = [{ name: { th: "   " } }, { name: { th: "ก".repeat(101) } }, { kind: "SELF", pickupOffsetMin: 0, windowMin: 0, surchargeSatang: 100 }, { kind: "SELF", pickupOffsetMin: 30, windowMin: 30 }, { kind: "BUS" }, { tenantId: "t_other" }];
    const passed = bad.filter((b) => parses(zIn(b)));
    ok(passed.length === 0, `ผ่านทั้งที่ผิด: ${fmt(passed)}`);
  });
  const win = (z: Rec, dep: number) => asRec(fn("pickupWindowFor")(z, dep)) ?? {};
  await st("PZ-5", "pickupWindowFor: ออก 08:00 · ในโซน offset 75 window 50 ⇒ 06:45–07:35 · นอกโซน 105/25 ⇒ 06:15–06:40 (ภาพ 16)", () => {
    const a = win({ kind: "ZONE", pickupOffsetMin: 75, windowMin: 50 }, 480), b = win({ kind: "ZONE", pickupOffsetMin: 105, windowMin: 25 }, 480);
    eq([a.kind, a.fromHm, a.toHm, a.fromMin, a.toMin, a.dayBefore], ["WINDOW", "06:45", "07:35", 405, 455, false], "ในโซน");
    eq([b.fromHm, b.toHm], ["06:15", "06:40"], "นอกโซน");
  });
  await st("PZ-6", "pickupWindowFor: มาเอง ⇒ MEET 08:00 · ออก 00:30 offset 75 ⇒ 23:15 วันก่อน · ออก 07:30 (ดำน้ำลึก) ในโซน ⇒ 06:15–07:05", () => {
    const m = win({ kind: "SELF", pickupOffsetMin: 0, windowMin: 0 }, 480);
    eq([m.kind, m.atHm], ["MEET", "08:00"], "มาเอง");
    const n = win({ kind: "ZONE", pickupOffsetMin: 75, windowMin: 0 }, 30);
    eq([n.fromHm, n.dayBefore], ["23:15", true], "ข้ามเที่ยงคืน");
    const d = win({ kind: "ZONE", pickupOffsetMin: 75, windowMin: 50 }, 450);
    eq([d.fromHm, d.toHm], ["06:15", "07:05"], "ดำน้ำลึก");
  });
  await st("PZ-7", "pure: pickup-core.ts ไม่ import prisma/db/next/โมดูลอื่น", () => {
    const s = read(MOD + "pickup-core.ts");
    ok(s, "ยังไม่มี pickup-core.ts");
    ok(!/@\/lib\/core\/db|@prisma\/client|from\s*["']next|@\/lib\/modules\/(?!trips)/.test(stripComments(s)), "pickup-core ไม่บริสุทธิ์");
  });
  groupLine("PZ");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uL = rid("uL"), uBk = rid("uBk"), uB = rid("uB");
  let setupErr = "";
  const U: Record<string, Actor> = {};
  const P_VIEW = ["trips.product.view"], P_EDIT = ["trips.product.view", "trips.product.edit"];
  try {
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) {
      await insertRow("Tenant", { id, name: `ทดสอบ T1.1 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: now() });
      tenantIds.push(id);
    }
    const mkUnit = async (id: string, tenantId: string, type: string, tag: string) => {
      try { await insertRow("BusinessUnit", { id, tenantId, type, name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, updatedAt: now() }); }
      catch (e) { throw new Error(`สร้างหน่วย ${type} ไม่ได้: ${errMsg(e).slice(0, 80)}`); }
    };
    await mkUnit(uA, tA, "TRIPS", "a"); await mkUnit(uA2, tA, "TRIPS", "a2"); await mkUnit(uL, tA, "TRIPS", "lim"); await mkUnit(uBk, tA, "BOOKING", "abk"); await mkUnit(uB, tB, "TRIPS", "b");
    const mkUser = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], perms: string[]): Promise<void> => {
      const id = rid(`u${tag}`);
      const permissions = Object.fromEntries(perms.map((p) => [p, true]));
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: now() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: now(), updatedAt: now() });
      U[tag] = { role, unitAccess, permissions, userId: id };
    };
    await mkUser("oa", tA, "OWNER", ["*"], []);
    await mkUser("ob", tB, "OWNER", ["*"], []);
    await mkUser("vw", tA, "STAFF", [uA], P_VIEW);
    await mkUser("ed", tA, "STAFF", [uA], P_EDIT);
    await mkUser("edp", tA, "STAFF", [uA], [...P_EDIT, "trips.price.edit"]);
    await mkUser("se", tA, "STAFF", [uA], ["trips.settings.edit"]);
    await mkUser("sm", tA, "STAFF", [uA], ["trips.settings.money"]);
    await mkUser("none", tA, "STAFF", [uA], []);
    await mkUser("a2", tA, "STAFF", [uA2], [...P_EDIT, "trips.price.edit", "trips.product.publish"]);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const ctxOf = (tag: string): Ctx => {
    const a = U[tag];
    if (!a) throw new AssertFail(`ไม่มีร้าน/ผู้ใช้ชั่วคราว (${setupErr || "ยังไม่ตั้ง"})`);
    return { tenantId: tag === "ob" ? tB : tA, actorUserId: a.userId };
  };
  const OA = () => ctxOf("oa");
  const SEED: Ctx = { tenantId: DIVE_TENANT, actorUserId: DIVE_OWNER_ID };
  const sellCtx = (unitId: string, tag = "oa") => ({ tenantId: tag === "ob" ? tB : tA, unitId, channel: "COUNTER", actor: { kind: "STAFF", userId: U[tag]?.userId ?? "" }, locale: "th" });
  const mkProduct = async (tag: string, extra: Rec = {}, unitId = uA): Promise<{ id: string; optionId: string }> => {
    const r = await call("createProduct", OA(), { unitId, slug: PSLUG(tag), productType: "TOUR", title: { th: `ทดสอบ ${tag}`, en: `Test ${tag}` }, ...extra });
    okR(r, `createProduct ${tag}`);
    const o = await call("createOption", OA(), { unitId, productId: String(r.id), name: { th: "ร่วมกลุ่ม", en: "Join-in" }, durationMin: 480 });
    okR(o, `createOption ${tag}`);
    return { id: String(r.id), optionId: String(o.id) };
  };
  const mkDeparture = async (productId: string, optionId: string, days: number, o: Rec = {}, unitId = uA): Promise<string> => {
    const id = rid("dep");
    const start = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), now().getUTCDate() + days, 1, 0, 0));
    await insertRow("TripDeparture", { id, tenantId: tA, unitId, productId, optionId, localDate: ymd(start), startsAt: start, endsAt: new Date(start.getTime() + 8 * 3_600_000), status: "OPEN", capacity: 10, sold: 0, updatedAt: now(), ...o });
    return id;
  };
  const zone = (o: Rec = {}, unitId = uA): Rec => ({ unitId, kind: "ZONE", name: { th: `โซน ${randomBytes(2).toString("hex")}` }, areas: null, pickupOffsetMin: 60, windowMin: 30, surchargeSatang: 0, ...o });
  const editorVM = async (ctx: Ctx, input: Rec, opts?: Rec): Promise<Rec> => { const r = await call("loadProductEditorVM", ctx, input, opts); okR(r, "loadProductEditorVM"); return asRec(r.vm) ?? {}; };
  const settingsVM = async (ctx: Ctx, input: Rec): Promise<Rec> => { const r = await call("loadTripsSettingsVM", ctx, input); okR(r, "loadTripsSettingsVM"); return asRec(r.vm) ?? {}; };
  const fieldsOf = (vm: Rec): Rec[] => asArr(asRec(vm.form)?.groups).flatMap((g) => asArr(g.fields));
  const field = (vm: Rec, key: string): Rec => { const f = fieldsOf(vm).find((x) => x.key === key); if (!f) throw new AssertFail(`ฟอร์มไม่มีช่อง ${key}`); return f; };

  // ═══════════════ PS. บริการโซนรับส่ง ═══════════════
  console.log("\n── PS: บริการโซนรับส่ง (ฐาน) ──");
  let Z1 = "", Z2 = "";
  await st("PS-1", "createPickupZone (เจ้าของ) ⇒ ok · แถว TripPickupZone: name = ชื่อไทย · offset · surcharge · polygon v1 มี kind/windowMin/active", async () => {
    const r = await call("createPickupZone", OA(), zone({ name: { th: "ในโซน", en: "In zone" }, areas: { th: "กะตะ · กะรน", en: "Kata · Karon" }, pickupOffsetMin: 75, windowMin: 50 }));
    okR(r, "create");
    Z1 = String(r.id);
    const row = (await q<{ name: string; pickupOffsetMin: number; surchargeSatang: number; polygon: Rec | null; tenantId: string; unitId: string }>(`SELECT name, "pickupOffsetMin", "surchargeSatang", polygon, "tenantId", "unitId" FROM "TripPickupZone" WHERE id = $1`, [Z1]))[0];
    ok(row, "ไม่มีแถว");
    eq([row.name, row.pickupOffsetMin, row.surchargeSatang, row.tenantId, row.unitId], ["ในโซน", 75, 0, tA, uA], "คอลัมน์");
    eq([row.polygon?.v, row.polygon?.kind, row.polygon?.windowMin, row.polygon?.active, row.polygon?.nameEn], [1, "ZONE", 50, true, "In zone"], "polygon v1");
  });
  await st("PS-2", "listPickupZones ⇒ DTO ครบช่อง เรียง sortOrder · update บางช่องคงช่องอื่น", async () => {
    const r2 = await call("createPickupZone", OA(), zone({ name: { th: "มาเอง" }, kind: "SELF", pickupOffsetMin: 0, windowMin: 0 }));
    okR(r2, "create 2");
    Z2 = String(r2.id);
    okR(await call("updatePickupZone", OA(), { unitId: uA, zoneId: Z1, windowMin: 40 }), "update");
    const l = await call("listPickupZones", OA(), { unitId: uA });
    okR(l, "list");
    const items = asArr(l.items);
    eq(items.map((x) => x.id), [Z1, Z2], "ลำดับ");
    const a = items[0];
    eq([asRec(a.name)?.th, asRec(a.name)?.en, a.kind, a.pickupOffsetMin, a.windowMin, a.surchargeSatang, a.active, a.basis, a.sortOrder], ["ในโซน", "In zone", "ZONE", 75, 40, 0, true, "PER_BOOKING", 0], "DTO");
  });
  await st("PS-3", "ไม่มีการลบ: setPickupZoneActive(false) ⇒ ไม่อยู่ในรายการปริยาย · includeInactive เห็น · แถวยังอยู่", async () => {
    okR(await call("setPickupZoneActive", OA(), { unitId: uA, zoneId: Z2, active: false }), "ปิด");
    const d = asArr((await call("listPickupZones", OA(), { unitId: uA })).items).map((x) => x.id);
    const all = asArr((await call("listPickupZones", OA(), { unitId: uA, includeInactive: true })).items).map((x) => x.id);
    eq([d.includes(Z2), all.includes(Z2)], [false, true], "ปริยาย/ทั้งหมด");
    eq((await q(`SELECT 1 FROM "TripPickupZone" WHERE id = $1`, [Z2])).length, 1, "แถว");
    okR(await call("setPickupZoneActive", OA(), { unitId: uA, zoneId: Z2, active: true }), "เปิดคืน");
  });
  await st("PS-4", "ชื่อไทยซ้ำกับโซนที่เปิดอยู่ ⇒ NAME_TAKEN · ปิดโซนเดิมแล้วสร้างชื่อเดิมได้", async () => {
    const n = { th: `ซ้ำ ${STAMP}` };
    const a = await call("createPickupZone", OA(), zone({ name: n }));
    okR(a, "ครั้งแรก");
    codeR(await call("createPickupZone", OA(), zone({ name: n })), "NAME_TAKEN", "ซ้ำ");
    okR(await call("setPickupZoneActive", OA(), { unitId: uA, zoneId: String(a.id), active: false }), "ปิด");
    okR(await call("createPickupZone", OA(), zone({ name: n })), "หลังปิด");
  });
  await st("PS-5", "ข้อมูลเข้าผิด ⇒ INVALID_INPUT (ไม่ throw · ไม่มีแถว): surcharge 2,147,483,648 · offset 1440 · คีย์ tenantId · update ด้วย unitId ปลอมในเนื้อ", async () => {
    const before = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripPickupZone" WHERE "tenantId" = $1`, [tA]))[0]?.n;
    codeR(await call("createPickupZone", OA(), zone({ surchargeSatang: 2_147_483_648 })), "INVALID_INPUT", "int4+1");
    codeR(await call("createPickupZone", OA(), zone({ pickupOffsetMin: 1440 })), "INVALID_INPUT", "1440");
    codeR(await call("createPickupZone", OA(), { ...zone(), tenantId: tB }), "INVALID_INPUT", "tenantId");
    codeR(await call("updatePickupZone", OA(), { unitId: uA, zoneId: Z1, tenantId: tB, name: { th: "ย้าย" } }), "INVALID_INPUT", "update tenantId");
    eq((await q<{ n: number }>(`SELECT count(*)::int n FROM "TripPickupZone" WHERE "tenantId" = $1`, [tA]))[0]?.n, before, "จำนวนแถว");
    eq((await q<{ tenantId: string }>(`SELECT "tenantId" FROM "TripPickupZone" WHERE id = $1`, [Z1]))[0]?.tenantId, tA, "ไม่ย้ายร้าน");
  });
  await st("PS-6", "สิทธิ์อ่าน: viewer อ่านได้ · ไม่มีสิทธิ์ trips ⇒ FORBIDDEN", async () => {
    okR(await call("listPickupZones", ctxOf("vw"), { unitId: uA }), "viewer");
    codeR(await call("listPickupZones", ctxOf("none"), { unitId: uA }), "FORBIDDEN", "none");
  });
  await st("PS-7", "สิทธิ์เขียน: viewer สร้าง/ปิด ⇒ FORBIDDEN · editor สร้าง (ฟรี) ได้", async () => {
    codeR(await call("createPickupZone", ctxOf("vw"), zone()), "FORBIDDEN", "viewer create");
    codeR(await call("setPickupZoneActive", ctxOf("vw"), { unitId: uA, zoneId: Z1, active: false }), "FORBIDDEN", "viewer active");
    okR(await call("createPickupZone", ctxOf("ed"), zone()), "editor ฟรี");
  });
  await st("PS-8", "ค่าบวกเพิ่ม = เรื่องราคา: editor ไม่มี trips.price.edit สร้าง +600 / เปลี่ยนค่า ⇒ FORBIDDEN · มี price.edit ⇒ ok", async () => {
    codeR(await call("createPickupZone", ctxOf("ed"), zone({ surchargeSatang: 60_000 })), "FORBIDDEN", "ed +600");
    codeR(await call("updatePickupZone", ctxOf("ed"), { unitId: uA, zoneId: Z1, surchargeSatang: 1 }), "FORBIDDEN", "ed เปลี่ยนค่า");
    okR(await call("updatePickupZone", ctxOf("ed"), { unitId: uA, zoneId: Z1, areas: { th: "กะตะ" } }), "ed แก้พื้นที่");
    okR(await call("createPickupZone", ctxOf("edp"), zone({ surchargeSatang: 60_000 })), "edp +600");
  });
  await st("PS-9", "หน่วยไม่ใช่ TRIPS ⇒ UNIT_NOT_TRIPS (หรือ NOT_FOUND) · ไม่มีแถว", async () => {
    codeR(await call("createPickupZone", OA(), zone({}, uBk)), ["UNIT_NOT_TRIPS", "NOT_FOUND"], "BOOKING");
    eq((await q(`SELECT 1 FROM "TripPickupZone" WHERE "unitId" = $1`, [uBk])).length, 0, "แถว");
  });
  await st("PS-10", "reorderPickupZones: ลำดับใหม่ครบชุด ⇒ sortOrder 0..n−1 · ขาด/ซ้ำ ⇒ INVALID_INPUT · id หน่วยอื่น ⇒ NOT_FOUND", async () => {
    const all = asArr((await call("listPickupZones", OA(), { unitId: uA, includeInactive: true })).items).map((x) => String(x.id));
    ok(all.length >= 3, `โซน ${all.length}`);
    const rev = [...all].reverse();
    okR(await call("reorderPickupZones", OA(), { unitId: uA, ids: rev }), "reorder");
    const got = await q<{ id: string; sortOrder: number }>(`SELECT id, "sortOrder" FROM "TripPickupZone" WHERE "unitId" = $1 ORDER BY "sortOrder", id`, [uA]);
    eq(got.map((x) => x.id), rev, "ลำดับ");
    eq(got.map((x) => x.sortOrder), rev.map((_, i) => i), "0..n−1");
    codeR(await call("reorderPickupZones", OA(), { unitId: uA, ids: rev.slice(1) }), "INVALID_INPUT", "ขาด");
    codeR(await call("reorderPickupZones", OA(), { unitId: uA, ids: [...rev.slice(1), rev[1]] }), "INVALID_INPUT", "ซ้ำ");
    const z2 = await call("createPickupZone", OA(), zone({}, uA2));
    okR(z2, "โซน A2");
    codeR(await call("reorderPickupZones", OA(), { unitId: uA, ids: [...rev.slice(1), String(z2.id)] }), ["NOT_FOUND", "INVALID_INPUT"], "id หน่วยอื่น");
  });
  await st("PS-11", "เพดานโซนที่เปิดอยู่: สร้างถึง PICKUP_ZONE_LIMIT แล้วตัวถัดไป ⇒ ZONE_LIMIT (หน่วย uL)", async () => {
    const lim = Number(needTrips().PICKUP_ZONE_LIMIT);
    ok(Number.isInteger(lim) && lim > 0 && lim <= 200, `limit ${lim}`);
    for (let i = 0; i < lim; i++) okR(await call("createPickupZone", OA(), zone({ name: { th: `ล${i}` } }, uL)), `สร้าง ${i}`);
    codeR(await call("createPickupZone", OA(), zone({ name: { th: "เกิน" } }, uL)), "ZONE_LIMIT", "เกิน");
  });
  await st("PS-12", "audit: ทุกการเขียนลง AuditLog action trips.pickup.* ของร้าน", async () => {
    const r = await q<{ action: string }>(`SELECT DISTINCT action FROM "AuditLog" WHERE "tenantId" = $1 AND action LIKE 'trips.pickup.%'`, [tA]);
    const got = r.map((x) => x.action).sort();
    const want = ["trips.pickup.active", "trips.pickup.create", "trips.pickup.reorder", "trips.pickup.update"];
    ok(want.every((w) => got.includes(w)), `ได้ ${fmt(got)}`);
  });
  groupLine("PS");

  // ═══════════════ X1. แยกร้าน/หน่วย ═══════════════
  console.log("\n── X1: แยกร้าน/หน่วย ⇒ NOT_FOUND ──");
  let PA = { id: "", optionId: "" }, PA2 = { id: "", optionId: "" };
  try { PA = await mkProduct("pa"); PA2 = await mkProduct("pa2", {}, uA2); } catch (e) { console.log(`  ⚠️ สร้างสินค้าทดสอบไม่ได้: ${errMsg(e)}`); }
  const needP = () => ok(PA.id && PA2.id, "ไม่มีสินค้าทดสอบ (T0.2 บนฐานนี้?)");
  await st("X1-1", "ร้าน B: list/update โซนของหน่วย A ⇒ NOT_FOUND · แถวไม่เปลี่ยน", async () => {
    codeR(await call("listPickupZones", ctxOf("ob"), { unitId: uA }), "NOT_FOUND", "list");
    codeR(await call("updatePickupZone", ctxOf("ob"), { unitId: uB, zoneId: Z1, windowMin: 10 }), "NOT_FOUND", "update ผ่านหน่วย B");
    eq((await q<{ polygon: Rec }>(`SELECT polygon FROM "TripPickupZone" WHERE id = $1`, [Z1]))[0]?.polygon?.windowMin, 40, "ไม่เปลี่ยน");
  });
  await st("X1-2", "ผู้ใช้หน่วย A2 (ไม่มีสิทธิ์เข้า A) ⇒ NOT_FOUND ทั้งโซน/ตัวโหลดสินค้า/ค่าตั้ง", async () => {
    needP();
    codeR(await call("listPickupZones", ctxOf("a2"), { unitId: uA }), "NOT_FOUND", "โซน");
    codeR(await call("loadProductEditorVM", ctxOf("a2"), { unitId: uA, productId: PA.id }), "NOT_FOUND", "ตัวแก้");
    codeR(await call("loadProductListVM", ctxOf("a2"), { unitId: uA }), "NOT_FOUND", "รายการ");
  });
  await st("X1-3", "โซนของหน่วย A2 อ้างผ่านหน่วย A ⇒ NOT_FOUND", async () => {
    const z = asArr((await call("listPickupZones", OA(), { unitId: uA2 })).items)[0];
    ok(z?.id, "ไม่มีโซน A2");
    codeR(await call("updatePickupZone", OA(), { unitId: uA, zoneId: String(z.id), windowMin: 5 }), "NOT_FOUND", "update");
    codeR(await call("setPickupZoneActive", OA(), { unitId: uA, zoneId: String(z.id), active: false }), "NOT_FOUND", "active");
  });
  await st("X1-4", "ตัวแก้สินค้า: สินค้าของ A2 ผ่านหน่วย A ⇒ NOT_FOUND · ร้าน B เปิดสินค้า A ⇒ NOT_FOUND · exampleDepartureId ของสินค้าอื่น ⇒ NOT_FOUND", async () => {
    needP();
    codeR(await call("loadProductEditorVM", OA(), { unitId: uA, productId: PA2.id }), "NOT_FOUND", "A2 ผ่าน A");
    codeR(await call("loadProductEditorVM", ctxOf("ob"), { unitId: uB, productId: PA.id }), "NOT_FOUND", "ร้าน B");
    const dOther = await mkDeparture(PA2.id, PA2.optionId, 9, {}, uA2).catch(() => "");
    ok(dOther, "สร้างรอบไม่ได้");
    codeR(await call("loadProductEditorVM", OA(), { unitId: uA, productId: PA.id, exampleDepartureId: dOther }), "NOT_FOUND", "รอบสินค้าอื่น");
  });
  await st("X1-5", "ร้าน B: loadProductListVM/loadTripsNav/loadTripsSettingsVM ของหน่วย A ⇒ NOT_FOUND", async () => {
    for (const [n, i] of [["loadProductListVM", { unitId: uA }], ["loadTripsNav", { unitId: uA }], ["loadTripsSettingsVM", { unitId: uA }]] as const) codeR(await call(n, ctxOf("ob"), i), "NOT_FOUND", n);
  });
  await st("X1-6", "ค่าตั้งชั้นสินค้า: productId ของ A2 กับหน่วย A ⇒ NOT_FOUND (อ่าน) · บันทึก ⇒ ปฏิเสธ ไม่มีแถว", async () => {
    needP();
    codeR(await call("loadTripsSettingsVM", OA(), { unitId: uA, scope: "PRODUCT", productId: PA2.id }), "NOT_FOUND", "อ่าน");
    const r = await call("saveTripsSettings", OA(), { unitId: uA, changes: [{ key: "trips.sell.holdMinutes", scope: "PRODUCT", scopeId: PA2.id, value: 20 }] });
    ok(r.ok === false, `บันทึกผ่าน: ${fmt(r)}`);
    eq((await q(`SELECT 1 FROM "SettingValue" WHERE "scopeId" = $1`, [PA2.id])).length, 0, "แถว");
  });
  await st("X1-7", "หน่วยไม่ใช่ TRIPS: loadTripsNav / tripsPageGate ⇒ UNIT_NOT_TRIPS หรือ NOT_FOUND", async () => {
    codeR(await call("loadTripsNav", OA(), { unitId: uBk }), ["UNIT_NOT_TRIPS", "NOT_FOUND"], "nav");
    codeR(await call("tripsPageGate", OA(), { unitId: uBk, page: "products" }), ["UNIT_NOT_TRIPS", "NOT_FOUND"], "gate");
  });
  groupLine("X1");

  // ═══════════════ X3. ยิงพร้อมกัน ═══════════════
  console.log("\n── X3: ยิงพร้อมกัน ──");
  await st("X3-1", "สร้างชื่อเดียวกันพร้อมกัน 10 ทาง ⇒ สำเร็จ 1 · ที่เหลือ NAME_TAKEN/BUSY · แถวเปิดชื่อนี้ = 1", async () => {
    const n = { th: `พร้อม ${STAMP}` };
    const rs = await Promise.all(Array.from({ length: 10 }, () => call("createPickupZone", OA(), zone({ name: n }, uA2)).catch((e: unknown) => ({ ok: false, code: `THROW ${errMsg(e)}` } as Rec))));
    eq(rs.filter((r) => r.ok === true).length, 1, "สำเร็จ");
    ok(rs.every((r) => r.ok === true || ["NAME_TAKEN", "BUSY"].includes(String(r.code))), `ผลแปลก ${fmt(rs.filter((r) => r.ok !== true && !["NAME_TAKEN", "BUSY"].includes(String(r.code))))}`);
    eq((await q(`SELECT 1 FROM "TripPickupZone" WHERE "unitId" = $1 AND name = $2`, [uA2, n.th])).length, 1, "แถว");
  });
  await st("X3-2", "สร้างพร้อมกัน 10 ทางเมื่อเหลือที่ 3 ⇒ สำเร็จ 3 · เปิดอยู่ไม่เกินเพดาน", async () => {
    const lim = Number(needTrips().PICKUP_ZONE_LIMIT);
    const open = asArr((await call("listPickupZones", OA(), { unitId: uL })).items);
    for (const z of open.slice(0, 3)) okR(await call("setPickupZoneActive", OA(), { unitId: uL, zoneId: String(z.id), active: false }), "ปิด 3");
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => call("createPickupZone", OA(), zone({ name: { th: `พก${i}` } }, uL)).catch((e: unknown) => ({ ok: false, code: `THROW ${errMsg(e)}` } as Rec))));
    eq(rs.filter((r) => r.ok === true).length, 3, "สำเร็จ");
    ok(rs.every((r) => r.ok === true || ["ZONE_LIMIT", "BUSY"].includes(String(r.code))), `ผลแปลก ${fmt(rs.find((r) => r.ok !== true && !["ZONE_LIMIT", "BUSY"].includes(String(r.code))))}`);
    eq(asArr((await call("listPickupZones", OA(), { unitId: uL })).items).length, lim, "เปิดอยู่");
  });
  await st("X3-3", "reorder พร้อมกัน 10 ทาง (ลำดับต่างกัน) ⇒ ok/BUSY · ผลสุดท้าย sortOrder 0..n−1 ไม่ซ้ำ", async () => {
    const all = asArr((await call("listPickupZones", OA(), { unitId: uA, includeInactive: true })).items).map((x) => String(x.id));
    const perms = Array.from({ length: 10 }, (_, k) => [...all.slice(k % all.length), ...all.slice(0, k % all.length)]);
    const rs = await Promise.all(perms.map((ids) => call("reorderPickupZones", OA(), { unitId: uA, ids }).catch((e: unknown) => ({ ok: false, code: `THROW ${errMsg(e)}` } as Rec))));
    ok(rs.every((r) => r.ok === true || r.code === "BUSY"), `ผลแปลก ${fmt(rs.find((r) => r.ok !== true && r.code !== "BUSY"))}`);
    const so = (await q<{ sortOrder: number }>(`SELECT "sortOrder" FROM "TripPickupZone" WHERE "unitId" = $1 ORDER BY "sortOrder"`, [uA])).map((x) => x.sortOrder);
    eq(so, so.map((_, i) => i), "0..n−1");
  });
  groupLine("X3");

  // ═══════════════ NAV. แถบนำทาง + ด่านหน้า ═══════════════
  console.log("\n── NAV: แถบนำทาง + tripsPageGate ──");
  const navOf = async (ctx: Ctx, unitId: string) => { const r = await call("loadTripsNav", ctx, { unitId }); okR(r, "loadTripsNav"); return asArr(asRec(r.nav)?.entries); };
  await st("NAV-1", "เจ้าของร้าน seed: 6 แท็บตามลำดับภาพ · href /app/u/andaman-dive-trips/trips/<key> · available เฉพาะ products/settings · wo ของแท็บที่ยังไม่เปิด", async () => {
    const e = await navOf(SEED, DIVE_TRIPS_UNIT.id);
    eq(e.map((x) => x.key), [...PAGE_KEYS], "ลำดับ");
    eq(e.map((x) => x.href), PAGE_KEYS.map((k) => `/app/u/${DIVE_TRIPS_UNIT.slug}/trips/${k}`), "href");
    eq(e.map((x) => x.available), [true, false, false, false, false, true], "available");
    eq(e.map((x) => x.visible), [true, true, true, true, true, true], "visible (เจ้าของ)");
    eq(e.filter((x) => !x.available).map((x) => x.wo), ["T1.2", "T1.3", "A1.2", "W1.1"], "wo");
  });
  await st("NAV-2", "viewer (product.view): เห็น products/bookings/agents/channels · ไม่เห็น departures (ไม่มี departure.view) · ไม่เห็น settings", async () => {
    const e = await navOf(ctxOf("vw"), uA);
    eq(e.map((x) => [x.key, x.visible]), [["products", true], ["departures", false], ["bookings", true], ["agents", true], ["channels", true], ["settings", false]], "visible");
  });
  await st("NAV-3", "settings-only: products ไม่เห็น · settings เห็น · ไม่มีสิทธิ์ trips ⇒ FORBIDDEN", async () => {
    const e = await navOf(ctxOf("se"), uA);
    eq([e.find((x) => x.key === "products")?.visible, e.find((x) => x.key === "settings")?.visible], [false, true], "se");
    codeR(await call("loadTripsNav", ctxOf("none"), { unitId: uA }), "FORBIDDEN", "none");
  });
  await st("NAV-4", "tripsPageGate ตามตารางสิทธิ์: vw products ok / settings FORBIDDEN / departures FORBIDDEN / bookings ok · se products FORBIDDEN / settings ok · sm settings ok", async () => {
    const g = async (tag: string, page: string) => call("tripsPageGate", ctxOf(tag), { unitId: uA, page });
    okR(await g("vw", "products"), "vw products");
    codeR(await g("vw", "settings"), "FORBIDDEN", "vw settings");
    codeR(await g("vw", "departures"), "FORBIDDEN", "vw departures");
    okR(await g("vw", "bookings"), "vw bookings");
    codeR(await g("se", "products"), "FORBIDDEN", "se products");
    okR(await g("se", "settings"), "se settings");
    okR(await g("sm", "settings"), "sm settings");
    codeR(await g("oa", "nope"), "INVALID_INPUT", "หน้าที่ไม่รู้จัก");
  });
  await st("NAV-5", "TRIPS_NAV ใน trips-shared (pure) = 6 key เดียวกัน path /trips/<key> · ไฟล์ไม่มี directive/ไม่ import ค่า", () => {
    const nav = asArr(shared("TRIPS_NAV"));
    eq(nav.map((x) => x.key), [...PAGE_KEYS], "key");
    eq(nav.map((x) => x.path), PAGE_KEYS.map((k) => `/trips/${k}`), "path");
    const src = stripComments(read(SHARED));
    ok(!/^\s*["']use (client|server)["']/.test(read(SHARED)) && !/^\s*import\s+(?!type\b)/m.test(src), "trips-shared ไม่บริสุทธิ์");
  });
  groupLine("NAV");

  // ═══════════════ LV. รายการสินค้า (seed) ═══════════════
  console.log("\n── LV: รายการสินค้า (ร้าน seed · ภาพ 16 ซ้าย) ──");
  const listVM = async (ctx: Ctx, input: Rec) => { const r = await call("loadProductListVM", ctx, input); okR(r, "loadProductListVM"); return asRec(r.vm) ?? {}; };
  await st("LV-1", "นับ: ทั้งหมด 4 · ทัวร์ 3 · Liveaboard 1 · canCreate (เจ้าของ)", async () => {
    const vm = await listVM(SEED, { unitId: DIVE_TRIPS_UNIT.id });
    const c = asRec(vm.counts) ?? {};
    eq([c.all, c.TOUR, c.LIVEABOARD, asArr(vm.items).length, vm.canCreate], [4, 3, 1, 4, true], "นับ");
  });
  await st("LV-2", "แถวราชา: เปิดขาย · ชี้ชวน 7/9 · EN ยังไม่แปล 2 ส่วน · ความจุ 24", async () => {
    const vm = await listVM(SEED, { unitId: DIVE_TRIPS_UNIT.id });
    const r = asArr(vm.items).find((x) => x.slug === SEED_SLUGS.racha);
    ok(r, "ไม่มีราชา");
    eq([r?.status, asRec(r?.prospectus)?.done, asRec(r?.prospectus)?.total, r?.enMissing, r?.capacity], ["ACTIVE", 7, 9, 2, R.capacity], "ราชา");
  });
  await st("LV-3", "กรอง type=LIVEABOARD ⇒ สิมิลัน 1 · ค้น q=\"ราชา\" ⇒ ราชาใหญ่ + ราชาน้อย (counts ไม่เปลี่ยนตามตัวกรอง)", async () => {
    const la = await listVM(SEED, { unitId: DIVE_TRIPS_UNIT.id, type: "LIVEABOARD" });
    eq(asArr(la.items).map((x) => x.slug), [SEED_SLUGS.similan], "LA");
    const s = await listVM(SEED, { unitId: DIVE_TRIPS_UNIT.id, q: "ราชา" });
    eq(asArr(s.items).map((x) => x.slug).sort(), [SEED_SLUGS.racha, SEED_SLUGS.deep3].sort(), "ค้น");
    eq(asRec(s.counts)?.all, 4, "counts");
  });
  await st("LV-4", "viewer อ่านรายการได้ (canCreate=false) · ไม่มีสิทธิ์สินค้า ⇒ FORBIDDEN", async () => {
    needP();
    const vm = await listVM(ctxOf("vw"), { unitId: uA });
    eq(vm.canCreate, false, "canCreate");
    codeR(await call("loadProductListVM", ctxOf("se"), { unitId: uA }), "FORBIDDEN", "se");
  });
  groupLine("LV");

  // ═══════════════ EV. ตัวแก้สินค้า ราชา (seed · ตัวเลขภาพ 16) ═══════════════
  console.log("\n── EV: ตัวแก้สินค้า ราชา (ร้าน seed · ภาพ 16) ──");
  const rachaId = (await q<{ id: string }>(`SELECT id FROM "TripProduct" WHERE "tenantId" = $1 AND slug = $2`, [DIVE_TENANT, SEED_SLUGS.racha]).catch(() => []))[0]?.id ?? "";
  const similanId = (await q<{ id: string }>(`SELECT id FROM "TripProduct" WHERE "tenantId" = $1 AND slug = $2`, [DIVE_TENANT, SEED_SLUGS.similan]).catch(() => []))[0]?.id ?? "";
  const ASOF = { now: new Date(FX.TRIPS_AS_OF) };
  let RV: Rec | null = null;
  const racha = async (): Promise<Rec> => { if (!RV) { ok(rachaId, "ไม่มีสินค้าราชาใน seed"); RV = await editorVM(SEED, { unitId: DIVE_TRIPS_UNIT.id, productId: rachaId }, ASOF); } return RV; };
  await st("EV-1", "ราชา: สถานะเปิดขาย · flags เจ้าของ (แก้/เปิดขาย/ราคา/ที่นั่ง) · ทัวร์ไม่มีตัวเลือกสกุลเงิน · ภาษา th/en เท่านั้น", async () => {
    const v = await racha();
    const f = asRec(v.flags) ?? {};
    eq([asRec(v.product)?.status, f.canEdit, f.canPublish, f.canEditPrices, f.showSeatCounts, f.readOnly, f.showCurrency], ["ACTIVE", true, true, true, true, false, false], "flags");
    eq(v.locales, ["th", "en"], "locales");
  });
  await st("EV-2", "ตัวเลือก: ร่วมกลุ่ม (เปิด · 24 ที่/รอบ) · เหมาเรือส่วนตัว (ปิด)", async () => {
    const o = asArr((await racha()).options);
    eq(o.map((x) => [x.nameTh, x.active]), [["ร่วมกลุ่ม", true], ["เหมาเรือส่วนตัว", false]], "ตัวเลือก");
    eq(o[0]?.capacity, R.capacity, "ความจุ");
  });
  await st("EV-3", "ประเภทคน: ผู้ใหญ่ 12+ 3,500 ตั้งเอง · เด็ก 4–11 2,450 = 70% (ช่วงอายุจากค่าตั้ง) · ทารก <4 ไม่ใช้ที่นั่ง ฟรี", async () => {
    const p = asArr((await racha()).paxRows);
    const by = (c: string) => p.find((x) => x.code === c) ?? {};
    const A = by("ADULT"), C = by("CHILD"), I = by("INFANT");
    eq([A.priceSatang, A.priceBasis, A.ageFrom], [R.adultSatang, "SET", R.childAge.max + 1], "ผู้ใหญ่");
    eq([C.priceSatang, C.priceBasis, C.derivedPct, C.ageFrom, C.ageTo, C.bandSource, C.equalsSetting], [R.childSatang, "DERIVED_PCT", 70, R.childAge.min, R.childAge.max, "PRODUCT", true], "เด็ก"); // ORACLE-EDIT EV-3 (ผู้คุม 12 พ.ย.): ช่วงอายุถูกคัดลงสินค้าตอนสร้าง (มติ T0.2 §11 ข้อ 5) ⇒ แหล่ง = PRODUCT + equalsSetting
    eq([I.priceSatang, I.priceBasis, I.countsCapacity, I.ageTo], [0, "FREE", false, R.childAge.min - 1], "ทารก");
  });
  await st("EV-4", "ฤดูกาล 3 แถว: หลัก 3,500/2,450 · ปีใหม่ 3,900/2,730 · นอกฤดู 2,900/2,030 · เด็กคิด 70% · มีผลตอนนี้ = ฤดูกาลหลัก", async () => {
    const s = asArr((await racha()).seasons);
    const got = SEASONS_EXPECT.map((e) => { const r = s.find((x) => x.name === e.name); return r ? [r.adultSatang, r.childSatang, r.childBasis] : null; });
    eq(got, SEASONS_EXPECT.map((e) => [e.adult, e.child, "DERIVED_PCT"]), "ฤดูกาล");
    eq(s.filter((x) => x.inEffect === true).map((x) => x.name), [FX.RACHA_SEASONS[0].name], "มีผล");
  });
  await st("EV-5", "ราคารายรอบ: 2 รอบถัดไป = ส. 14 / อา. 15 พ.ย. (ฤดูกาลหลัก 3,500/2,450 · ศ. 13 ยกเลิกไม่แสดง) + 31 ธ.ค. 4,500/3,150 ราคาเฉพาะรอบ ทับ \"ปีใหม่\"", async () => {
    const d = asArr((await racha()).departures);
    const normal = d.filter((x) => x.source !== "DEPARTURE");
    eq(normal.slice(0, 2).map((x) => x.localDate), ["2026-11-14", "2026-11-15"], "2 รอบถัดไป");
    ok(!d.some((x) => x.localDate === "2026-11-13"), "ยังแสดงรอบที่ยกเลิก");
    eq([normal[0]?.adultSatang, normal[0]?.childSatang, normal[0]?.source, normal[0]?.seasonName], [R.adultSatang, R.childSatang, "SEASON", FX.RACHA_SEASONS[0].name], "14 พ.ย.");
    const x = d.find((r) => r.localDate === DEC31.date) ?? {};
    eq([x.adultSatang, x.childSatang, x.source, x.overridesSeasonName], [DEC31.adultSatang, DEC31.childSatang, "DEPARTURE", FX.RACHA_SEASONS[1].name], "31 ธ.ค.");
    ok(d.every((r) => typeof r.full === "boolean" && typeof r.sold === "number"), "full/sold");
  });
  await st("EV-6", "รายการเสริม 3 ธง: ค่าอุทยาน 600/300 ต่อคน บังคับ เก็บแทน ไม่คิดคอมฯ ลดไม่ได้ · กล้อง 500 ต่อการจอง คอมฯ 50% ลดได้ · ทดลองดำน้ำ 1,900 ต่อคน คอมฯ ✓ ลดได้ · ไม่มีคำเตือน", async () => {
    const v = await racha();
    const x = asArr(v.extras);
    const k = (kind: string) => x.find((e) => e.kind === kind) ?? {};
    const park = k("PARK_FEE"), cam = k("EQUIPMENT"), dive = k("COURSE");
    eq([park.basis, park.mandatory, park.passThrough, park.commissionable, park.discountable, park.paxPrices], ["PER_PAX", true, true, false, false, { ADULT: R.parkAdultSatang, CHILD: R.parkChildSatang }], "อุทยาน");
    eq([cam.basis, cam.priceSatang, cam.commissionPct, cam.discountable, cam.passThrough], ["PER_BOOKING", R.extras.camera.satang, 50, true, false], "กล้อง");
    eq([dive.basis, dive.priceSatang, dive.commissionable, dive.discountable], ["PER_PAX", R.extras.introDive.satang, true, true], "ทดลองดำน้ำ");
    eq(asArr(v.extraWarnings).length, 0, "คำเตือน");
  });
  await st("EV-7", "รับส่ง (ภาพ 16): ออก 08:00 · ในโซน ฟรี 06:45–07:35 · นอกโซน +600 06:15–06:40 · มาเอง พบ 08:00", async () => {
    const p = asRec((await racha()).pickup) ?? {};
    eq(p.departTimeMin, 480, "เวลาออก");
    const z = asArr(p.zones);
    const got = z.map((x) => { const w = asRec(x.window) ?? {}; return x.kind === "SELF" ? { name: asRec(x.name)?.th, kind: x.kind, meet: w.atHm, surcharge: x.surchargeSatang } : { name: asRec(x.name)?.th, kind: x.kind, from: w.fromHm, to: w.toHm, surcharge: x.surchargeSatang }; });
    eq(got, ZONES_EXPECT, "โซน");
  });
  await st("EV-8", "เนื้อหา: 6 แถว (ชื่อ · คำบรรยาย · กำหนดการ · รวม/ไม่รวม · จุดนัดพบ · เงื่อนไขอัตโนมัติ) · ยังไม่แปล = กำหนดการ + จุดนัดพบ", async () => {
    const c = asRec((await racha()).content) ?? {};
    const rows = asArr(c.rows);
    eq(rows.map((r) => r.section), ["title", "summary", "itinerary", "includes", "meeting", "policy"], "แถว");
    eq(rows.map((r) => r.en), ["TRANSLATED", "TRANSLATED", "NOT_TRANSLATED", "TRANSLATED", "NOT_TRANSLATED", "AUTO"], "en");
    eq(c.untranslated, ["itinerary", "meeting"], "untranslated");
  });
  await st("EV-9", "ชี้ชวน 9 ข้อ: 7/9 = 78% · ขาด OPERATOR_LICENSE + INSURANCE · enabled", async () => {
    const b = asRec((await racha()).brochure) ?? {};
    eq([b.enabled, b.done, b.total, b.pct], [true, 7, 9, 78], "ชี้ชวน");
    eq(asArr(b.items).filter((i) => i.done !== true).map((i) => i.code).sort(), ["INSURANCE", "OPERATOR_LICENSE"], "ที่ขาด");
  });
  await st("EV-10", "ค่าที่ใช้กับสินค้านี้: ถือ 15 นาที · ปิดรับ 1 วันก่อน 18:00 · ขั้นต่ำ 8 (ตั้งที่สินค้า) · ยกเลิก 100/50/0 · มัดจำ 100", async () => {
    const a = asArr((await racha()).applied);
    const v = (k: string) => a.find((x) => x.key === k) ?? {};
    eq(a.map((x) => x.key), ["trips.sell.holdMinutes", "trips.sell.cutoff", "trips.sell.minToDepart", "trips.cancel.ladder", "trips.pay.depositPct"], "คีย์");
    const cut = asRec(v("trips.sell.cutoff").value) ?? {};
    eq([v("trips.sell.holdMinutes").value, cut.daysBefore, cut.atMin], [R.holdMinutes, 1, 1080], "ถือ/ปิดรับ");
    eq([asRec(v("trips.sell.minToDepart").value)?.minPax, v("trips.sell.minToDepart").source, v("trips.sell.minToDepart").atProduct], [R.minPax, "PRODUCT", true], "ขั้นต่ำ");
    eq([asArr(v("trips.cancel.ladder").value).map((s) => s.refundPct), v("trips.pay.depositPct").value, v("trips.pay.depositPct").atProduct], [[100, 50, 0], 100, false], "ยกเลิก/มัดจำ");
  });
  await st("EV-11", "ลูกค้าจะเห็น (ตัวคิดราคาจริง): ส. 14 พ.ย. · 7,000.00 + 2,450.00 + อุทยาน 1,500.00 + กล้อง 500.00 = 11,450.00", async () => {
    const ex = asRec((await racha()).example) ?? {};
    eq([ex.localDate, ex.totalSatang, ex.totalText, ex.error ?? null], [B0142.date, B0142.totalSatang, "11,450.00", null], "รวม");
    eq(asArr(ex.lines).map((l) => Number(l.amountSatang)).sort((a, b) => a - b), [50_000, 150_000, 245_000, 700_000], "บรรทัด");
  });
  await st("EV-12", "ตัวอย่างรอบ 31 ธ.ค. (exampleDepartureId) ⇒ 2×4,500 + 3,150 + 1,500 + 500 = 14,150.00", async () => {
    ok(rachaId, "ไม่มีราชา");
    const dec = (await q<{ id: string }>(`SELECT id FROM "TripDeparture" WHERE "productId" = $1 AND "localDate" = $2::date`, [rachaId, DEC31.date]))[0]?.id;
    ok(dec, "ไม่มีรอบ 31 ธ.ค.");
    const v = await editorVM(SEED, { unitId: DIVE_TRIPS_UNIT.id, productId: rachaId, exampleDepartureId: dec }, ASOF);
    const ex = asRec(v.example) ?? {};
    const want = 2 * DEC31.adultSatang + DEC31.childSatang + 2 * R.parkAdultSatang + R.parkChildSatang + R.extras.camera.satang;
    eq([ex.localDate, ex.totalSatang, ex.totalText], [DEC31.date, want, "14,150.00"], "31 ธ.ค.");
  });
  await st("EV-13", "formatBaht (trips-shared): 1,145,000 สตางค์ ⇒ \"11,450.00\" · 5 ⇒ \"0.05\" · formatBahtShort 350,000 ⇒ \"3,500\"", () => {
    const f = shared("formatBaht") as AnyFn, g = shared("formatBahtShort") as AnyFn;
    eq([f(1_145_000), f(5), f(0), g(350_000)], ["11,450.00", "0.05", "0.00", "3,500"], "รูป");
  });
  await st("EV-14", "ตะกร้าตัวอย่าง TRIPS_PRICE_EXAMPLE_DEFAULT = ผู้ใหญ่ 2 · เด็ก 1 · EQUIPMENT 1 (ตัวอย่างจอ 01/18)", () => {
    const d = asRec(shared("TRIPS_PRICE_EXAMPLE_DEFAULT")) ?? {};
    eq([asRec(d.pax)?.ADULT, asRec(d.pax)?.CHILD, d.extraKinds], [B0142.adults, B0142.children, ["EQUIPMENT"]], "ตะกร้า");
  });
  groupLine("EV");

  // ═══════════════ ET. ตัวแก้สินค้า (ร้านชั่วคราว) ═══════════════
  console.log("\n── ET: ตัวแก้สินค้า (ร้านชั่วคราว · สิทธิ์ · สถานะ · หนี้ T0.2/T0.5) ──");
  let depFull = "", depFakeFull = "";
  try {
    if (PA.id) {
      const sp = await call("setPrice", sellCtx(uA), { productId: PA.id, currency: "THB", amountMinor: 100_000 });
      if (sp.ok !== true) console.log(`  ⚠️ setPrice: ${fmt(sp)}`);
      depFull = await mkDeparture(PA.id, PA.optionId, 5, { capacity: 10, sold: 10, status: "OPEN" });
      depFakeFull = await mkDeparture(PA.id, PA.optionId, 6, { capacity: 10, sold: 3, status: "FULL" });
    }
  } catch (e) { console.log(`  ⚠️ เตรียมรอบ/ราคา: ${errMsg(e)}`); }
  await st("ET-1", "สิทธิ์ใน flags: viewer อ่านได้ แก้/เปิดขาย/ราคา/ที่นั่ง = false · readOnly · editor แก้ได้แต่ราคาไม่ได้ · ไม่มีสิทธิ์ ⇒ FORBIDDEN", async () => {
    needP();
    const v = asRec((await editorVM(ctxOf("vw"), { unitId: uA, productId: PA.id })).flags) ?? {};
    eq([v.canEdit, v.canPublish, v.canEditPrices, v.showSeatCounts, v.readOnly], [false, false, false, false, true], "viewer");
    const e = asRec((await editorVM(ctxOf("ed"), { unitId: uA, productId: PA.id })).flags) ?? {};
    eq([e.canEdit, e.canEditPrices, e.readOnly], [true, false, false], "editor");
    codeR(await call("loadProductEditorVM", ctxOf("none"), { unitId: uA, productId: PA.id }), "FORBIDDEN", "none");
    const vd = asArr((await editorVM(ctxOf("vw"), { unitId: uA, productId: PA.id })).departures);
    ok(vd.length > 0 && vd.every((d) => d.sold === null), `viewer เห็นจำนวนขาย: ${fmt(vd)}`);
  });
  await st("ET-2", "\"เต็ม\" ตัดสินจากจำนวน: รอบ OPEN ขายครบ ⇒ full=true · รอบสถานะ FULL แต่ยังว่าง ⇒ full=false", async () => {
    ok(depFull && depFakeFull, "ไม่มีรอบทดสอบ");
    const d = asArr((await editorVM(OA(), { unitId: uA, productId: PA.id })).departures);
    const a = d.find((x) => x.departureId === depFull), b = d.find((x) => x.departureId === depFakeFull);
    eq([a?.full, b?.full], [true, false], "full");
  });
  await st("ET-3", "ราคาเด็ก 70% เฉพาะจากแถว ADULT: แถวไม่ระบุประเภทคน 1,000 ⇒ เด็ก 1,000 (SET) ไม่ใช่ 700", async () => {
    needP();
    const p = asArr((await editorVM(OA(), { unitId: uA, productId: PA.id })).paxRows);
    const c = p.find((x) => x.code === "CHILD") ?? {}, a = p.find((x) => x.code === "ADULT") ?? {};
    eq([a.priceSatang, c.priceSatang, c.priceBasis], [100_000, 100_000, "SET"], "เด็ก");
  });
  await st("ET-4", "รายการเสริมของร้าน (บังคับ) ถูกแทนด้วยของสินค้าชนิดเดียวกัน ⇒ extraWarnings UNIT_EXTRA_SUPPRESSED", async () => {
    needP();
    const u = await call("createExtra", OA(), { unitId: uA, productId: null, kind: "PORT_FEE", basis: "PER_BOOKING", mandatory: true, priceMinor: 10_000, name: { th: "ค่าท่าเรือ" } });
    okR(u, "unit extra");
    const p = await call("createExtra", OA(), { unitId: uA, productId: PA.id, kind: "PORT_FEE", basis: "PER_BOOKING", mandatory: false, priceMinor: 5_000, name: { th: "ค่าท่าเรือ (สินค้า)" } });
    okR(p, "product extra");
    const w = asArr((await editorVM(OA(), { unitId: uA, productId: PA.id })).extraWarnings);
    eq(w.map((x) => [x.code, x.kind, x.unitExtraId, x.productExtraId]), [["UNIT_EXTRA_SUPPRESSED", "PORT_FEE", String(u.id), String(p.id)]], "คำเตือน");
    ok(typeof w[0]?.messageTh === "string" && /[฀-๿]/.test(String(w[0]?.messageTh)), "ข้อความไทย");
  });
  await st("ET-5", "สกุลเงิน: Liveaboard ร่างไม่มีราคา ⇒ showCurrency · ไม่ล็อก · หลังตั้งราคา ⇒ currencyLocked", async () => {
    const la = await mkProduct("la", { productType: "LIVEABOARD" });
    const f1 = asRec((await editorVM(OA(), { unitId: uA, productId: la.id })).flags) ?? {};
    eq([f1.showCurrency, f1.currencyLocked], [true, false], "ก่อน");
    okR(await call("setPrice", sellCtx(uA), { productId: la.id, currency: "THB", amountMinor: 3_000_000 }), "setPrice");
    const f2 = asRec((await editorVM(OA(), { unitId: uA, productId: la.id })).flags) ?? {};
    eq(f2.currencyLocked, true, "หลัง");
  });
  await st("ET-6", "เก็บแล้ว (archive): รายการปริยายไม่มี · includeArchived มี · ตัวแก้ archived + readOnly", async () => {
    const ar = await mkProduct("ar");
    okR(await call("archiveProduct", OA(), { unitId: uA, productId: ar.id }), "archive");
    const d = asArr((await listVM(OA(), { unitId: uA })).items).map((x) => x.id);
    const a = asArr((await listVM(OA(), { unitId: uA, includeArchived: true })).items).map((x) => x.id);
    eq([d.includes(ar.id), a.includes(ar.id)], [false, true], "รายการ");
    const v = await editorVM(OA(), { unitId: uA, productId: ar.id });
    eq([asRec(v.product)?.archived, asRec(v.flags)?.readOnly], [true, true], "ตัวแก้");
  });
  await st("ET-7", "ร่าง (DRAFT) ขึ้นในรายการของพนักงานพร้อมสถานะ · ไม่มีชี้ชวนเมื่อ T58 ปิดที่ชั้นสินค้า", async () => {
    needP();
    const it = asArr((await listVM(OA(), { unitId: uA })).items).find((x) => x.id === PA.id);
    eq(it?.status, "DRAFT", "สถานะ");
    okR(asRec(await S("setSettings")(U.oa, { tenantId: tA }, [{ key: "trips.prospectus.checklist", scope: "PRODUCT", scopeId: PA.id, value: false }], {})) ?? {}, "ปิด T58");
    const b = asRec((await editorVM(OA(), { unitId: uA, productId: PA.id })).brochure) ?? {};
    eq(b.enabled, false, "enabled");
  });
  await st("ET-8", "รูปสินค้า (หนี้ T0.2): นับเฉพาะ FileAsset ของร้านนี้ · id ร้านอื่น/ไม่มีจริง = invalid", async () => {
    needP();
    const fa = rid("fa"), fb = rid("fb");
    await insertRow("FileAsset", { id: fa, tenantId: tA, kind: "ATTACHMENT", path: `t/${tA}/a.jpg`, cdnUrl: "https://x/a.jpg", contentType: "image/jpeg", bytes: 10 });
    await insertRow("FileAsset", { id: fb, tenantId: tB, kind: "ATTACHMENT", path: `t/${tB}/b.jpg`, cdnUrl: "https://x/b.jpg", contentType: "image/jpeg", bytes: 10 });
    okR(await call("updateProduct", OA(), { unitId: uA, productId: PA.id, body: { photoFileIds: [fa, fb, "nofile_x"] } }), "update photos");
    const p = asRec((await editorVM(OA(), { unitId: uA, productId: PA.id })).photos) ?? {};
    eq([p.count, p.invalid], [1, 2], "รูป");
  });
  await st("ET-9", "productUpdatePayload (pure · หนี้ T0.2): แก้ช่องเดียวของ disclosure/meetingPoint ⇒ ส่งก้อนเต็ม · ไม่มี tenantId/unitId จากฟอร์ม", () => {
    const f = shared("productUpdatePayload") as AnyFn;
    const cur = { id: "p1", unitId: "u1", title: { th: "ก" }, disclosure: { accommodationMeals: { th: "อาหาร 1 มื้อ" }, guides: { th: "ไกด์ 2" } }, meetingPoint: { text: { th: "ท่าเรือ" }, lat: 7.8, lng: 98.3 } };
    const a = asRec(f(cur, { disclosure: { guides: { th: "ไกด์ 3" } } })) ?? {};
    eq(a.disclosure, { accommodationMeals: { th: "อาหาร 1 มื้อ" }, guides: { th: "ไกด์ 3" } }, "disclosure");
    const b = asRec(f(cur, { meetingPoint: { text: { th: "ท่าเรือใหม่" } } })) ?? {};
    eq(b.meetingPoint, { text: { th: "ท่าเรือใหม่" }, lat: 7.8, lng: 98.3 }, "meetingPoint");
    ok(!("tenantId" in a) && !("disclosure" in b && "tenantId" in b), "มี tenantId");
  });
  groupLine("ET");

  // ═══════════════ SET. จอค่าตั้ง (ภาพ 17) ═══════════════
  console.log("\n── SET: จอค่าตั้ง trips (ภาพ 17) ──");
  await st("SET-1", "TRIPS_SETTINGS_SECTIONS: 9 หมวดตาม TRIPS-DEFAULTS §1.1–1.9 · ครอบทุกกลุ่มของทะเบียน trips ครั้งเดียว", () => {
    const secs = asArr(shared("TRIPS_SETTINGS_SECTIONS"));
    eq(secs.map((s) => s.key), SECTION_KEYS, "ลำดับ");
    const groups = secs.flatMap((s) => (Array.isArray(s.groups) ? (s.groups as string[]) : []));
    const reg = [...new Set(asArr(S("listDefs")("trips")).map((d) => String(d.group)))].sort();
    eq([...groups].sort(), reg, "กลุ่ม");
    eq(new Set(groups).size, groups.length, "ไม่ซ้ำ");
  });
  let UV: Rec | null = null;
  const unitSV = async (): Promise<Rec> => { if (!UV) UV = await settingsVM(SEED, { unitId: DIVE_TRIPS_UNIT.id }); return UV; };
  await st("SET-2", "ชั้นหน่วย (seed): แม่แบบ ร้านดำน้ำ · ต่างจากแม่แบบ 3 · ตั้งรายสินค้า 6 · ฟอร์มจากทะเบียน (scope UNIT · โดเมน trips)", async () => {
    const v = await unitSV();
    const h = asRec(v.header) ?? {};
    const form = asRec(v.form) ?? {};
    eq([h.templateKey, h.differsCount, h.productOverrideCount, form.scope, form.domains], ["DIVE_SHOP", 3, 6, "UNIT", ["trips"]], "หัว");
    const differs = fieldsOf(v).filter((f) => f.differsFromTemplate === true).map((f) => f.key).sort();
    eq(differs, ["trips.msg.confirmation", "trips.parkFee.table", "trips.sell.cutoff"], "ต่างจากแม่แบบ");
  });
  await st("SET-3", "ปิดรับหน้าร้าน 0 วัน 07:00 (perChannel.COUNTER) ตั้งที่หน่วย · ถือที่ 15 นาที = ค่าแม่แบบ", async () => {
    const v = await unitSV();
    const c = field(v, "trips.sell.cutoff");
    eq([c.hasOwn, c.source, asRec(asRec(asRec(c.value)?.perChannel)?.COUNTER)], [true, "UNIT", { ...FX.TRIPS_SEED_COUNTER_CUTOFF }], "cutoff");
    const h = field(v, "trips.sell.holdMinutes");
    eq([h.hasOwn, h.differsFromTemplate, h.source, h.value], [false, false, "TEMPLATE", 15], "hold");
  });
  await st("SET-4", "ป้าย \"ตรวจกับนักบัญชีของร้าน\" ตรงคีย์ที่ TRIPS-DEFAULTS ติดป้าย (7 คีย์ที่แสดง) · ไม่มีคีย์อื่น", async () => {
    const got = fieldsOf(await unitSV()).filter((f) => f.reviewHint === "ACCOUNTANT").map((f) => String(f.key)).sort();
    eq(got, ACCOUNTANT_EXPECT, "ป้ายนักบัญชี");
  });
  await st("SET-5", "ตารางค่าอุทยาน: ป้ายหน่วยงาน \"กรมอุทยานฯ\" · ตั้งที่หน่วย · อัตราของร้าน 2 แถว (ราชา 600/300 · สิมิลัน 1,800)", async () => {
    const f = field(await unitSV(), "trips.parkFee.table");
    eq([f.reviewHint, f.reviewAuthorityTh, f.hasOwn], ["AUTHORITY", "กรมอุทยานฯ", true], "ป้าย");
    const rates = asArr(asRec(f.value)?.shopRates);
    const r1 = rates.find((x) => /ราชา/.test(String(x.label))), r2 = rates.find((x) => /สิมิลัน/.test(String(x.label)));
    eq([rates.length, r1?.adultSatang, r1?.childSatang, r2?.adultSatang], [2, R.parkAdultSatang, R.parkChildSatang, FX.TRIP_SIMILAN.parkPerPersonSatang], "อัตราของร้าน");
  });
  await st("SET-6", "ข้อความยืนยันการจอง ตั้งที่หน่วย = ข้อความภาพ 17 (ไทย + อังกฤษ)", async () => {
    const f = field(await unitSV(), "trips.msg.confirmation");
    eq([f.hasOwn, asRec(f.value)?.th, typeof asRec(f.value)?.en === "string" && String(asRec(f.value)?.en).length > 0], [true, CONFIRM_TH, true], "ข้อความ");
  });
  await st("SET-7", "ค่ารายสินค้าในการ์ดชั้นหน่วย: ขั้นต่ำ ราชา 8 · พีพี 10 · ดำน้ำลึก 4 · มัดจำสิมิลัน 30", async () => {
    const o = asArr((await unitSV()).productOverrides);
    const ids = Object.fromEntries((await q<{ slug: string; id: string }>(`SELECT slug, id FROM "TripProduct" WHERE "tenantId" = $1`, [DIVE_TENANT])).map((r) => [r.slug, r.id]));
    const mp = (slug: string) => asRec(o.find((x) => x.key === "trips.sell.minToDepart" && x.productId === ids[slug])?.value)?.minPax;
    eq([mp(SEED_SLUGS.racha), mp(SEED_SLUGS.phiphi), mp(SEED_SLUGS.deep3)], [FX.PRODUCT_RACHA.minPax, FX.PRODUCT_PHIPHI.minPax, FX.PRODUCT_DEEP3.minPax], "ขั้นต่ำ");
    eq(o.find((x) => x.key === "trips.pay.depositPct" && x.productId === ids[SEED_SLUGS.similan])?.value, 30, "มัดจำสิมิลัน");
  });
  await st("SET-8", "ชั้นสินค้าสิมิลัน: มัดจำ 30 · ที่เหลือ 60 วันก่อน · เตือน [7, 1] ตั้งที่สินค้า · ถือที่ไม่ได้ตั้ง (มาจากชั้นบน)", async () => {
    ok(similanId, "ไม่มีสิมิลันใน seed");
    const v = await settingsVM(SEED, { unitId: DIVE_TRIPS_UNIT.id, scope: "PRODUCT", productId: similanId });
    eq([asRec(v.form)?.scope, asRec(v.form)?.scopeId], ["PRODUCT", similanId], "ชั้น");
    const g = (k: string) => { const f = field(v, k); return [f.value, f.hasOwn]; };
    eq([g("trips.pay.depositPct"), g("trips.pay.balanceDueDaysBefore"), g("trips.pay.reminderDaysBefore"), field(v, "trips.sell.holdMinutes").hasOwn],
      [[FX.TRIP_SIMILAN.depositBp / 100, true], [FX.TRIP_SIMILAN.balanceDaysBefore, true], [[7, 1], true], false], "ค่า");
  });
  let LA2 = "";
  await st("SET-9", "บันทึกตารางยกเลิก Liveaboard 50/30/0 (มัดจำ 30) โดยไม่รับทราบ ⇒ NEEDS_APPROVAL · W01 (HIGH) + W03 (NORMAL) · ไม่มีแถว", async () => {
    const la = await mkProduct("la2", { productType: "LIVEABOARD" });
    LA2 = la.id;
    okR(asRec(await S("setSettings")(U.oa, { tenantId: tA }, [{ key: "trips.pay.depositPct", scope: "PRODUCT", scopeId: LA2, value: 30 }], { ackLegalWarn: true })) ?? {}, "มัดจำ 30");
    const r = await call("saveTripsSettings", OA(), { unitId: uA, changes: [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: LA2, value: SIMILAN_LADDER }] });
    eq(r.code, "NEEDS_APPROVAL", `ผล ${fmt(r)}`);
    const iss = asArr(r.issues).map((i) => [i.code, i.severity]).filter(([c]) => c === "W01" || c === "W03").sort();
    eq(iss, [["W01", "HIGH"], ["W03", "NORMAL"]], "คำเตือน");
    eq((await q(`SELECT 1 FROM "SettingValue" WHERE key = 'trips.cancel.ladder' AND "scopeId" = $1`, [LA2])).length, 0, "ไม่มีแถว");
  });
  await st("SET-10", "รับทราบโดยไม่มีเหตุผล ⇒ บันทึกได้ (OQ3) · SettingChange legalLevel WARN · standingWarnings ชั้นสินค้ามี W01/W03 พร้อม severity", async () => {
    ok(LA2, "ไม่มีสินค้า LA");
    okR(await call("saveTripsSettings", OA(), { unitId: uA, changes: [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: LA2, value: SIMILAN_LADDER }], ackLegalWarn: true }), "ack");
    const ch = await q<{ legalLevel: string }>(`SELECT "legalLevel" FROM "SettingChange" WHERE key = 'trips.cancel.ladder' AND "scopeId" = $1 ORDER BY "at" DESC LIMIT 1`, [LA2]);
    eq(ch[0]?.legalLevel, "WARN", "legalLevel");
    const v = await settingsVM(OA(), { unitId: uA, scope: "PRODUCT", productId: LA2 });
    const w = asArr(v.standingWarnings).filter((x) => x.key === "trips.cancel.ladder").map((x) => [x.code, x.severity]).sort();
    eq(w, [["W01", "HIGH"], ["W03", "NORMAL"]], "standingWarnings");
    const unitW = asArr((await settingsVM(OA(), { unitId: uA })).standingWarnings).filter((x) => x.key === "trips.cancel.ladder");
    eq(unitW.length, 0, "ชั้นหน่วยไม่มีคำเตือนของสินค้า");
  });
  await st("SET-11", "สิทธิ์ต่อช่อง (จาก engine): settings.edit ⇒ ถือที่แก้ได้ · มัดจำล็อก · ภาษีล็อก (เจ้าของ) · PDPA ซ่อนค่า · settings.money ⇒ มัดจำแก้ได้ ถือที่ล็อก", async () => {
    const v = await settingsVM(ctxOf("se"), { unitId: uA });
    const pd = fieldsOf(v).find((f) => String(f.key).startsWith("trips.pdpa."));
    eq([field(v, "trips.sell.holdMinutes").editable, field(v, "trips.pay.depositPct").editable, field(v, "trips.tax.invoiceForm").editable, pd?.masked, pd?.value ?? null], [true, false, false, true, null], "se");
    ok(typeof field(v, "trips.pay.depositPct").lockedReasonTh === "string", "ไม่มีเหตุผลล็อก");
    const m = await settingsVM(ctxOf("sm"), { unitId: uA });
    eq([field(m, "trips.pay.depositPct").editable, field(m, "trips.sell.holdMinutes").editable], [true, false], "sm");
  });
  await st("SET-12", "เห็นจอค่าตั้ง ⇔ settings.edit/money: viewer ⇒ FORBIDDEN · ไม่มีสิทธิ์ ⇒ FORBIDDEN · บันทึกโดย viewer ⇒ ปฏิเสธ", async () => {
    codeR(await call("loadTripsSettingsVM", ctxOf("vw"), { unitId: uA }), "FORBIDDEN", "vw");
    codeR(await call("loadTripsSettingsVM", ctxOf("none"), { unitId: uA }), "FORBIDDEN", "none");
    const r = await call("saveTripsSettings", ctxOf("vw"), { unitId: uA, changes: [{ key: "trips.sell.holdMinutes", scope: "UNIT", scopeId: uA, value: 20 }] });
    ok(r.ok === false, `viewer บันทึกได้: ${fmt(r)}`);
  });
  await st("SET-13", "saveTripsSettings รับเฉพาะโดเมน trips และชั้นของหน่วยนี้: คีย์โดเมนอื่น / scope หน่วยอื่น / TENANT ⇒ ปฏิเสธทั้งชุด ไม่มีแถว", async () => {
    const other = asArr(S("listDefs")("rooms"))[0]?.key ?? asArr(S("listDefs")("booking"))[0]?.key;
    ok(other, "ไม่มีคีย์โดเมนอื่นให้ทดสอบ");
    const cases: Rec[][] = [
      [{ key: String(other), scope: "UNIT", scopeId: uA, value: 1 }],
      [{ key: "trips.sell.holdMinutes", scope: "UNIT", scopeId: uA2, value: 21 }],
      [{ key: "trips.sell.holdMinutes", scope: "TENANT", scopeId: tA, value: 22 }],
      [{ key: "trips.sell.holdMinutes", scope: "UNIT", scopeId: uA, value: 23 }, { key: "trips.sell.holdMinutes", scope: "UNIT", scopeId: uA2, value: 23 }],
    ];
    for (const ch of cases) { const r = await call("saveTripsSettings", OA(), { unitId: uA, changes: ch }); ok(r.ok === false, `ผ่าน: ${fmt(ch)}`); }
    eq((await q(`SELECT 1 FROM "SettingValue" WHERE "tenantId" = $1 AND key = 'trips.sell.holdMinutes' AND value::text IN ('21','22','23')`, [tA])).length, 0, "แถว");
  });
  await st("SET-14", "resetTripsSetting: ลบค่าชั้นสินค้าของหน่วยนี้ได้ (กลับไปใช้ชั้นบน) · ของหน่วยอื่น ⇒ ปฏิเสธ", async () => {
    ok(LA2, "ไม่มีสินค้า LA");
    okR(await call("resetTripsSetting", OA(), { unitId: uA, key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: LA2 }), "reset");
    eq((await q(`SELECT 1 FROM "SettingValue" WHERE key = 'trips.cancel.ladder' AND "scopeId" = $1`, [LA2])).length, 0, "แถว");
    const r = await call("resetTripsSetting", OA(), { unitId: uA, key: "trips.sell.holdMinutes", scope: "PRODUCT", scopeId: PA2.id });
    ok(r.ok === false, `ผ่าน: ${fmt(r)}`);
  });
  await st("SET-15", "ฟอร์มกลางใช้คำของแอปจริง \"ต่างจากแม่แบบ\" (OQ4) · ไม่มีคำ \"ปรับแล้ว\" เป็นป้ายในคอมโพเนนต์ trips", () => {
    ok(/ต่างจากแม่แบบ/.test(read("src/components/settings/SettingsForm.tsx")), "SettingsForm เปลี่ยนคำ");
    ok(compFiles.length > 0 && !/>\s*ปรับแล้ว\s*</.test(compFiles.map((f) => read(f)).join("\n")), "trips ใช้ป้าย ปรับแล้ว");
  });
  groupLine("SET");

  // ═══════════════ SD. ส่วนขยาย seed ═══════════════
  console.log("\n── SD: ส่วนขยาย seed (ใบสั่ง §10) ──");
  await st("SD-1", "ฟิกซ์เจอร์ TRIPS_SEED_PICKUP_ZONES 3 โซน: ในโซน 75/50 ฟรี · นอกโซน 105/25 +600 · มาเอง SELF", () => {
    const z = asArr((FX as unknown as Rec).TRIPS_SEED_PICKUP_ZONES);
    eq(z.map((x) => [asRec(x.name)?.th ?? x.name, x.kind, x.pickupOffsetMin, x.windowMin, x.surchargeSatang]),
      [["ในโซน", "ZONE", 75, 50, 0], ["นอกโซน", "ZONE", 105, 25, R.extras.outOfZonePickup.satang], ["มาเอง", "SELF", 0, 0, 0]], "ฟิกซ์เจอร์");
  });
  await st("SD-2", "ฐาน: หน่วย TRIPS ของ seed มีโซน 3 แถว (ไม่ซ้ำ · เปิด) ตามลำดับ", async () => {
    const r = await q<{ name: string; polygon: Rec | null }>(`SELECT name, polygon FROM "TripPickupZone" WHERE "tenantId" = $1 AND "unitId" = $2 ORDER BY "sortOrder", id`, [DIVE_TENANT, DIVE_TRIPS_UNIT.id]);
    eq(r.map((x) => [x.name, x.polygon?.active]), [["ในโซน", true], ["นอกโซน", true], ["มาเอง", true]], "โซน");
  });
  await st("SD-3", "ฐาน: ราคาปลีก INFANT ราชา = 0 แถวเดียว · ไม่มีราคาเด็ก · ค่าตั้งที่ seed ลง 1 แถวต่อ (คีย์, ชั้น, id)", async () => {
    const inf = await q<{ amountMinor: number }>(`SELECT p."amountMinor" FROM "TripPrice" p JOIN "TripPaxType" x ON x.id = p."paxTypeId" JOIN "TripProduct" t ON t.id = p."productId" WHERE t.slug = $1 AND t."tenantId" = $2 AND x.code = 'INFANT'`, [SEED_SLUGS.racha, DIVE_TENANT]);
    eq(inf.map((x) => x.amountMinor), [0], "INFANT");
    const ch = await q<{ n: number }>(`SELECT count(*)::int n FROM "TripPrice" p JOIN "TripPaxType" x ON x.id = p."paxTypeId" WHERE p."tenantId" = $1 AND x.code = 'CHILD'`, [DIVE_TENANT]);
    eq(ch[0]?.n, 0, "ราคาเด็ก");
    const rows = await q<{ key: string; scope: string; n: number }>(`SELECT key, scope, count(*)::int n FROM "SettingValue" WHERE "tenantId" = $1 AND key = ANY($2::text[]) GROUP BY key, scope ORDER BY key, scope`, [DIVE_TENANT,
      ["trips.sell.cutoff", "trips.sell.minToDepart", "trips.parkFee.table", "trips.msg.confirmation", "trips.pay.depositPct", "trips.pay.balanceDueDaysBefore", "trips.pay.reminderDaysBefore"]]);
    eq(rows.map((r) => `${r.key}@${r.scope}×${r.n}`), ["trips.msg.confirmation@UNIT×1", "trips.parkFee.table@UNIT×1", "trips.pay.balanceDueDaysBefore@PRODUCT×1", "trips.pay.depositPct@PRODUCT×1",
      "trips.pay.reminderDaysBefore@PRODUCT×1", "trips.sell.cutoff@UNIT×1", "trips.sell.minToDepart@PRODUCT×3"], "แถวค่าตั้งของ seed (ไม่ซ้ำ ไม่ขาด)");
  });
  await st("SD-4", "seed ใช้บริการ (createPickupZone · setSettings · setPrice) ไม่เขียน TripPickupZone/SettingValue ตรง · บล็อก // ── T1.1 screens ──", () => {
    const s = stripComments(read("scripts/seed-trips-qc.mts"));
    ok(/createPickupZone/.test(s), "seed ไม่เรียก createPickupZone");
    ok(!/tripPickupZone\.(create|update|upsert)|INSERT INTO "TripPickupZone"|settingValue\.(create|update|upsert)/.test(s), "seed เขียนตาราง ตรง");
    ok(/── T1\.1 screens ──/.test(read("scripts/seed-trips-qc.mts")), "ไม่มีบล็อก T1.1");
  });
  groupLine("SD");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

console.log(`\nเหลือให้ด่านภาพ (ผู้คุม · scripts/visual-trips.mts t1.1 + parity-trips.sh): ผังสามคอลัมน์ภาพ 16 · ตัวเลขบนจอ · ป้ายสถานะแยกรูปทรง · เมนู 9 หมวด/ป้ายภาพ 17 · กล่องคำเตือน W01→W03 + ติ๊กรับทราบ · ตัวอักษร ≥ 14 · ปุ่ม ≥ 44 px · ไม่ล้นจอ · คลิกแท็บ anchor · ปุ่มที่ซ่อนตามสิทธิ์`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T1.1 · จอสินค้า · โซนรับส่ง · จอค่าตั้ง =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
