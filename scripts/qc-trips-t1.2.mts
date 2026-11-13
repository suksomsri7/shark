// QC — TRIPS T1.2 · ปฏิทินรอบและที่ว่าง ฝั่งร้าน (ภาพ 11) · แผงรอบ · ต่ำกว่าขั้นต่ำ → ออกขาดทุน/รวมรอบ/ยกเลิก · ปิดรับ · ราคาเฉพาะรอบ
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/T1.2.md · สัญญา ledger/TRIPS-CORE-CONTRACT.md §B.1 §D §J · ภาพ ledger/design-trips/11-departures-calendar.* (+ README)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน)   S ไฟล์/กติกาโค้ด (static)   P ตัวช่วยบริสุทธิ์ (สถานะช่อง · วันของสัปดาห์/เดือน)
//   CV ปฏิทิน seed (ตัวเลขภาพ 11 · now = TRIPS_AS_OF)   PV แผงรอบ seed   DA ตัดสินต่ำกว่าขั้นต่ำ (ร้านชั่วคราว · พร้อมกัน)
//   CT ปฏิทิน/แผงบนร้านชั่วคราว (เต็มจากตัวนับ · ค่าตั้ง · เขตเวลา · เพดาน · สิทธิ์ · แยกร้าน · ความจุ/ทรัพยากร/ราคารอบ · กฎซ้ำ)
//
// 🔴 ที่ตรวจไม่ได้ที่นี่ (ไม่มี server/เบราว์เซอร์) = ด่านภาพของผู้คุม: ผังตาราง+แผงที่ 1440 · 390 ไม่ล้น · รูปทรงสถานะ · ปุ่ม 2 คอลัมน์ · กล่องโต้ตอบ · คลิก
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t12-*` (ผู้ใช้ `trips-t12-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ร้าน seed อ่านอย่างเดียว (ไม่เรียกตัวเขียนกับ seed)
// 🔴 ยังไม่มีโมดูล/ฟังก์ชัน = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t1.2.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน T1.2: PC เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t1.2";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t1.1) ═══════════════
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
const rid = (p: string) => `t12qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SLUG = "trips-t12-";
const EMAIL_PREFIX = "trips-t12-";
const PSLUG = (tag: string) => `t12qc-${tag}-${STAMP}`;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = () => new Date();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const bkkYmd = (d: Date) => new Date(d.getTime() + 7 * HOUR).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(new Date(Date.parse(`${s}T00:00:00.000Z`) + n * DAY));
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

// ═══════════════ สเปก (ใบสั่ง T1.2) ═══════════════
const APP = "src/app/app/u/[unitSlug]/trips";
const PAGE = `${APP}/departures/page.tsx`;
const MOD = "src/lib/modules/trips/";
const OWN_MOD = ["departure-view-core.ts", "departure-screens.ts", "departure-desk.ts", "departure-screen-actions.ts"].map((f) => MOD + f);
const PURE = MOD + "departure-view-core.ts";
const LOADER = MOD + "departure-screens.ts";
const DESK = MOD + "departure-desk.ts";
const ACTIONS = MOD + "departure-screen-actions.ts";
const COMP = "src/components/trips";
const SHARED = `${COMP}/trips-shared.ts`;
const FACADE_T12 = ["loadDepartureCalendarVM", "loadDeparturePanelVM", "loadDepartureSchedulesVM", "decideBelowMin", "DEPARTURE_CELL_STATES", "DEPARTURE_DESK_ERROR_CODES",
  "departureCellState", "calendarWeekDays", "calendarMonthDays", "defaultWeekStart", "TRIPS_CALENDAR_DEPARTURE_CAP", "TRIPS_CALENDAR_PRODUCT_CAP"];
const CELL_STATES = ["CANCELLED", "PAST", "DEPARTED_TODAY", "FULL", "CLOSED", "BELOW_MIN", "GUARANTEED", "LOW", "OPEN"];
const DESK_CODES = ["NOT_BELOW_MIN", "MERGE_NEEDS_BOOKINGS", "MERGE_TARGET_INVALID"];
const ACTION_KEYS = ["close", "reopen", "guarantee", "unguarantee", "run", "merge", "cancel", "capacity", "resources", "price", "stopSell", "manifest", "book"];
const T0X_FILES = ["products.ts", "products-core.ts", "product-actions.ts", "departures.ts", "departures-core.ts", "departure-actions.ts", "resources.ts", "jobs.ts", "pricing.ts", "pricing-core.ts",
  "prices.ts", "pricing-actions.ts", "promo.ts", "snapshot.ts", "money-math.ts", "sellable-impl.ts", "json-schemas.ts", "capacity.ts", "capacity-core.ts", "capacity-service.ts", "capacity-actions.ts", "waitlist.ts"].map((f) => MOD + f);
const ADDITIVE_ONLY = [MOD + "index.ts", "src/lib/core/permissions.ts", "scripts/seed-trips-qc.mts", "scripts/trips-fixture.mts"];
const FROZEN_DIRS = ["src/lib/core/settings", "src/components/settings"];
const BASE_COMMIT = "a26a41e2d"; // session/trips ตอนเขียนใบสั่ง (P0.1–T0.5 + T1.1 รับแล้ว · T0.6 ยังไม่ merge)
const TESTIDS_FIXED = ["trips-cal", "trips-cal-range", "trips-cal-prev", "trips-cal-next", "trips-cal-today", "trips-cal-view-week", "trips-cal-view-month", "trips-cal-view-trips",
  "trips-cal-filter-all", "trips-cal-filter-tour", "trips-cal-filter-dive", "trips-cal-attention", "trips-cal-cancelled", "trips-cal-week", "trips-cal-daylist", "trips-cal-month", "trips-cal-trips",
  "trips-cal-legend", "trips-cal-truncated", "trips-cal-empty", "trips-dep-add", "trips-dep-schedules", "trips-dep-panel", "trips-dep-panel-close", "trips-dep-status", "trips-dep-counts",
  "trips-dep-actions", "trips-dep-manifest", "trips-dep-book", "trips-dep-close", "trips-dep-reopen", "trips-dep-guarantee", "trips-dep-unguarantee", "trips-dep-capacity", "trips-dep-resources",
  "trips-dep-price", "trips-dep-stopsell", "trips-dep-cancel", "trips-dep-decide", "trips-dep-bookings-note", "trips-dep-money-note", "trips-decisions", "trips-decide-dialog", "trips-decide-run",
  "trips-decide-merge", "trips-decide-cancel", "trips-decide-confirm", "trips-cancel-dialog", "trips-cancel-reason", "trips-capacity-dialog", "trips-capacity-input", "trips-resource-dialog",
  "trips-price-dialog", "trips-stopsell-dialog", "trips-dep-create-dialog", "trips-schedule-dialog", "trips-schedule-add"];
const TESTID_PATTERNS = ["trips-cal-row-", "trips-cal-cell-", "trips-cal-none-", "trips-cal-day-", "trips-cal-next-trip-", "trips-decision-", "trips-merge-target-", "trips-price-row-",
  "trips-resource-row-", "trips-schedule-row-", "trips-schedule-materialize-", "trips-schedule-pause-"];
const SELL_CHANNELS = ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "OTA", "API", "IMPORT", "CHAT_AI"];
const I18N_REQUIRED = [
  "departures.title", "departures.view.week", "departures.view.month", "departures.view.trips", "departures.filter.all", "departures.filter.tour", "departures.filter.dive", "departures.today",
  "departures.attention", "departures.cancelledChip", "departures.legend.number", "departures.legend.full", "departures.legend.belowMin", "departures.legend.cancelled", "departures.legend.past",
  ...CELL_STATES.map((s) => `departures.state.${s}`),
  ...["used", "left", "leftLow", "belowMin", "shortBy", "waitlist", "noDeparture", "skipped", "nextTrip"].map((k) => `departures.cell.${k}`),
  ...SELL_CHANNELS.map((c) => `departures.channel.${c}`),
  ...["BOAT", "VAN", "GUIDE", "OTHER"].map((k) => `departures.resourceKind.${k}`),
  ...["close", "reopen", "guarantee", "unguarantee", "cancel", "capacity", "resources", "price", "stopSell", "manifest", "book", "decide", "add", "schedules"].map((k) => `departures.actions.${k}`),
  ...["run", "merge", "cancel", "confirm"].map((k) => `departures.decide.${k}`),
  "departures.notYet.bookings", "departures.notYet.money",
  ...["NOT_BELOW_MIN", "MERGE_NEEDS_BOOKINGS", "MERGE_TARGET_INVALID", "HAS_BOOKINGS", "CAPACITY_BELOW_USED", "RESOURCE_CLASH", "PAST_DEPARTURE", "FORBIDDEN_TRANSITION"].map((c) => `errors.${c}`),
];
const VISUAL_SCENES = ["calendar-week", "calendar-month", "departure-panel", "belowmin-decision"];
// seed / ภาพ 11
const AS_OF = new Date(FX.TRIPS_AS_OF);
const WEEK = FX.CALENDAR_WEEK_1111;
const WEEK_DAYS = WEEK.rows.racha.map((c) => c.date);
const DIVE_TENANT = FX.SHOP_DIVE.tenant.id;
const DIVE_TRIPS_UNIT = FX.SHOP_DIVE.units.trips;
const DIVE_OWNER_ID = "tripsqc-user-dive-owner";
const SEED_SLUGS = { racha: "racha-yai-day-trip", phiphi: "phiphi-khai-speedboat", deep3: "racha-noi-3-dives", similan: "similan-4-nights" } as const;
type SeedKey = keyof typeof SEED_SLUGS;
const DEC31 = FX.RACHA_DEPARTURE_PRICE_1231;
const SIM = FX.TRIP_SIMILAN;

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

  // seed ids
  const seedProducts: Record<string, string> = {};
  for (const r of await q<{ id: string; slug: string }>(`SELECT id, slug FROM "TripProduct" WHERE "tenantId" = $1 AND slug = ANY($2::text[])`, [DIVE_TENANT, Object.values(SEED_SLUGS)])) seedProducts[r.slug] = r.id;
  const pid = (k: SeedKey): string => { const id = seedProducts[SEED_SLUGS[k]]; if (!id) throw new AssertFail(`ไม่มีสินค้า seed ${k}`); return id; };
  const seedDeps = await q<{ id: string; productId: string; d: string }>(`SELECT id, "productId", "localDate"::text AS d FROM "TripDeparture" WHERE "tenantId" = $1 AND "unitId" = $2 AND ("localDate" BETWEEN '2026-11-11' AND '2026-11-17' OR "localDate" IN ($3::date, $4::date))`, [DIVE_TENANT, DIVE_TRIPS_UNIT.id, DEC31.date, SIM.start]);
  const did = (k: SeedKey, date: string): string => { const p = seedProducts[SEED_SLUGS[k]]; const r = seedDeps.find((x) => x.productId === p && x.d === date); if (!r) throw new AssertFail(`ไม่มีรอบ seed ${k} ${date}`); return r.id; };

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed andaman-dive + หน่วย TRIPS andaman-dive-trips อยู่", async () => {
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "BusinessUnit" WHERE id = $1 AND "tenantId" = $2 AND type::text = 'TRIPS'`, [DIVE_TRIPS_UNIT.id, DIVE_TENANT]);
    eq(r[0]?.n, 1, "หน่วย TRIPS ของ seed");
  });
  await st("PC-2", "seed สัปดาห์ 11–17 พ.ย.: ราชา/พีพี/ดำน้ำลึก 20 รอบ · ยกเลิก ศ. 13 = 3 · ตัวนับทั้งหมด 0 · สิมิลัน 14 ก.พ. 2570 · ราชา 31 ธ.ค. OPEN ขั้นต่ำ 8", async () => {
    const w = seedDeps.filter((x) => x.d >= WEEK_DAYS[0] && x.d <= WEEK_DAYS[6] && [pid("racha"), pid("phiphi"), pid("deep3")].includes(x.productId));
    eq(w.length, 20, "รอบในสัปดาห์");
    const c = await q<{ n: number; used: number }>(`SELECT count(*) FILTER (WHERE status = 'CANCELLED' AND "localDate" = '2026-11-13')::int AS n, coalesce(sum(sold + held + reserved), 0)::int AS used FROM "TripDeparture" WHERE id = ANY($1::text[])`, [w.map((x) => x.id)]);
    eq([c[0]?.n, c[0]?.used], [3, 0], "ยกเลิก/ตัวนับ");
    did("similan", SIM.start);
    const d = await q<{ status: string; minPax: number | null }>(`SELECT status, "minPax" FROM "TripDeparture" WHERE id = $1`, [did("racha", DEC31.date)]);
    eq([d[0]?.status, d[0]?.minPax], ["OPEN", FX.PRODUCT_RACHA.minPax], "ราชา 31 ธ.ค.");
  });
  await st("PC-3", "ฟิกซ์เจอร์: TRIPS_AS_OF = พฤ. 12 พ.ย. 2569 18:00 · CALENDAR_WEEK_1111 7 วัน 11–17 · คำนวณถูก", () => {
    eq([AS_OF.toISOString(), WEEK_DAYS[0], WEEK_DAYS[6], WEEK_DAYS.length], ["2026-11-12T11:00:00.000Z", "2026-11-11", "2026-11-17", 7], "as-of/สัปดาห์");
    ok(FX.assertFixtureArithmetic().checks > 20, "assertFixtureArithmetic");
  });
  await st("PC-4", "ทะเบียนค่าตั้งมี trips.public.showLeftAtOrBelow · trips.sell.minToDepart · trips.sell.cutoff", () => {
    const keys = asArr(S("listDefs")("trips")).map((d) => d.key);
    const miss = ["trips.public.showLeftAtOrBelow", "trips.sell.minToDepart", "trips.sell.cutoff"].filter((k) => !keys.includes(k));
    ok(miss.length === 0, `ขาด ${miss.join(", ")}`);
  });
  await st("PC-5", "บริการ T0.3/T0.4/T0.5 ที่ใบนี้เรียกมีใน facade (setDepartureStatus · cancelDeparture · setDepartureCapacity · assignResource · listSchedules · materializeSchedule · listDepartures · publicLeftOf · setPrice · removePrice)", () => {
    for (const n of ["setDepartureStatus", "cancelDeparture", "setDepartureCapacity", "assignResource", "listSchedules", "materializeSchedule", "listDepartures", "publicLeftOf", "setPrice", "removePrice", "tripsPageGate"]) fn(n);
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์และกติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด (static) ──");
  const compFiles = walk(COMP);
  const appFiles = walk(APP);
  const uiFiles = [...compFiles, ...appFiles];
  const allSrc = uiFiles.map((f) => read(f)).join("\n");
  const t12Comp = compFiles.filter((f) => /^Departure/.test(basename(f)));
  const t12Files = [...OWN_MOD, ...t12Comp, PAGE].filter((f) => existsSync(join(ROOT, f)));
  await st("S-1", "ไฟล์เจ้าของครบ: departure-view-core · departure-screens · departure-desk · departure-screen-actions · คอมโพเนนต์ Departure*.tsx", () => {
    const miss = OWN_MOD.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
    ok(t12Comp.some((f) => f.endsWith(".tsx")), "ยังไม่มีคอมโพเนนต์ src/components/trips/Departure*.tsx");
  });
  await st("S-2", `facade trips: บล็อก "// TRIPS T1.2 ▸" ส่งออก ${FACADE_T12.length} ชื่อ · ไม่มี export *`, () => {
    const src = read(MOD + "index.ts");
    ok(/\/\/ TRIPS T1\.2 ▸/.test(src), "ไม่มีบล็อก // TRIPS T1.2 ▸");
    ok(!/export\s+\*/.test(stripComments(src)), "มี export *");
    const t = needTrips();
    const miss = FACADE_T12.filter((n) => t[n] === undefined);
    ok(miss.length === 0, `ยังไม่ส่งออก: ${miss.join(", ")}`);
  });
  await st("S-3", "หน้า departures: ไม่ใช่ TripsNotYet · requireUnit + tripsPageGate(page \"departures\") + loadDepartureCalendarVM · ไม่ส่ง now · TRIPS_NAV.departures available", () => {
    const s = stripComments(read(PAGE));
    ok(s && !/TripsNotYet/.test(s), "หน้า departures ยังเป็น TripsNotYet");
    ok(/requireUnit\(/.test(s) && /tripsPageGate\(/.test(s) && /["']departures["']/.test(s) && /loadDepartureCalendarVM\(/.test(s), "หน้าไม่ผ่านด่าน/ไม่เรียกตัวโหลด");
    ok(!/\bnow\s*:/.test(s), "หน้าส่ง now (ต้องใช้นาฬิกาจริง)");
    const nav = asArr(SHI.mod?.TRIPS_NAV).find((x) => x.key === "departures");
    eq([nav?.available, nav?.wo], [true, "T1.2"], "TRIPS_NAV.departures");
  });
  await st("S-4", "ไม่มี prisma ในหน้า/คอมโพเนนต์ · ไฟล์โมดูลใหม่ไม่ import prisma ตรง (tenantDb ในโมดูลเท่านั้น)", () => {
    ok(t12Comp.length > 0, "ยังไม่มีคอมโพเนนต์");
    const badUi = uiFiles.filter((f) => /@\/lib\/core\/db|@prisma\/client["']|\bprisma\./.test(stripComments(read(f)).replace(/import\s+type[^;]+;/g, "")));
    const badMod = OWN_MOD.filter((f) => /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']|@prisma\/client["']/.test(stripComments(read(f)).replace(/import\s+type[^;]+;/g, "")));
    ok(badUi.length === 0 && badMod.length === 0, `prisma: ${[...badUi, ...badMod].join(", ")}`);
  });
  await st("S-5", "ไม่มี any ในไฟล์ของใบ (โมดูล · คอมโพเนนต์ Departure* · หน้า)", () => {
    ok(t12Files.length >= OWN_MOD.length + 2, "ไฟล์ยังไม่ครบ");
    const bad = t12Files.filter((f) => /:\s*any\b|\bas\s+any\b|<any>|\bany\[\]/.test(stripComments(read(f))));
    ok(bad.length === 0, `มี any: ${bad.join(", ")}`);
  });
  await st("S-6", "'use client' ไม่ import ของที่ลากถึง prisma (ตามเข้าไป 1 ชั้นใน src/lib/modules/trips)", () => {
    const clients = t12Comp.filter((f) => /^\s*["']use client["']/.test(read(f)));
    ok(clients.length > 0, "ยังไม่มีไฟล์ 'use client' ของ T1.2");
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
  await st("S-7", `data-testid ครบในซอร์ส: ตายตัว ${TESTIDS_FIXED.length} + แพตเทิร์น ${TESTID_PATTERNS.length}`, () => {
    const miss = TESTIDS_FIXED.filter((t) => !new RegExp(`data-testid=\\{?["'\`]${t}["'\`]`).test(allSrc));
    const missP = TESTID_PATTERNS.filter((p) => !allSrc.includes(`\`${p}\${`) && !allSrc.includes(`"${p}" +`) && !allSrc.includes(`'${p}' +`));
    ok(miss.length === 0 && missP.length === 0, `ขาด: ${[...miss, ...missP.map((p) => p + "*")].slice(0, 12).join(", ")}${miss.length + missP.length > 12 ? " …" : ""}`);
  });
  await st("S-8", "ทะเบียนปุ่ม: แถว wo T1.2 ครอบ testid ของใบ · page /app/u/[unitSlug]/trips/departures · roles ถูก · ไม่มีแถวผีทั้งไฟล์", () => {
    const raw = read("scripts/trips-ui-inventory.json");
    ok(raw, "ไม่มี scripts/trips-ui-inventory.json");
    const rows = asArr(asRec(JSON.parse(raw))?.rows);
    const mine = rows.filter((r) => r.wo === "T1.2");
    ok(mine.length > 0, "ยังไม่มีแถว wo T1.2");
    const kinds = ["button", "link", "menu", "tab", "toggle", "drag", "form", "filter", "input", "textarea", "select", "notice"];
    const bad = mine.filter((r) => typeof r.page !== "string" || !String(r.page).startsWith("/app/u/[unitSlug]/trips/departures") || typeof r.testid !== "string" || !kinds.includes(String(r.kind))
      || !Array.isArray(r.roles) || (r.roles as unknown[]).length === 0 || !(r.roles as unknown[]).every((x) => ["owner", "editor", "viewer"].includes(String(x))) || r.system !== "TRIPS" || !asRec(r.expect)?.type);
    ok(bad.length === 0, `แถวพิการ ${bad.length}: ${fmt(bad[0])}`);
    const ids = mine.map((r) => String(r.testid));
    const miss = [...TESTIDS_FIXED.filter((t) => !ids.includes(t)), ...TESTID_PATTERNS.filter((p) => !ids.includes(`${p}*`)).map((p) => `${p}*`)];
    ok(miss.length === 0, `ไม่มีแถว: ${miss.slice(0, 10).join(", ")}`);
    const ghost = rows.map((r) => String(r.testid)).filter((t) => (t.endsWith("*") ? !allSrc.includes(t.slice(0, -1)) : !allSrc.includes(t)));
    ok(ghost.length === 0, `แถวผี: ${ghost.slice(0, 8).join(", ")}`);
  });
  await st("S-9", "i18n: th/en คีย์ตรงกัน · คีย์ขั้นต่ำของใบครบ (สถานะช่องครบ 9 · ช่องทางครบ 12 · รหัสผิดพลาด) · ค่าอังกฤษใต้ departures ไม่มีอักษรไทย", () => {
    const flat = (o: unknown, p = ""): [string, unknown][] => { const r = asRec(o); return r ? Object.entries(r).flatMap(([k, v]) => (asRec(v) ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v] as [string, unknown]])) : []; };
    const th = read("src/messages/th/trips.json"), en = read("src/messages/en/trips.json");
    ok(th && en, "ไม่มี trips.json");
    const kt = flat(JSON.parse(th)).map(([k]) => k).sort(), fe = flat(JSON.parse(en));
    eq(kt, fe.map(([k]) => k).sort(), "คีย์ th = en");
    const miss = I18N_REQUIRED.filter((k) => !kt.includes(k));
    ok(miss.length === 0, `คีย์ขาด ${miss.length}: ${miss.slice(0, 10).join(", ")}`);
    const thaiEn = fe.filter(([k, v]) => k.startsWith("departures.") && typeof v === "string" && /[฀-๿]/.test(v)).map(([k]) => k);
    ok(thaiEn.length === 0, `en มีอักษรไทย: ${thaiEn.slice(0, 5).join(", ")}`);
  });
  await st("S-10", "ไม่แสดงรหัสดิบบนจอ: คอมโพเนนต์ Departure* ไม่มี {x.status|state|code|kind|channel} เป็นข้อความ JSX (แอตทริบิวต์ได้)", () => {
    ok(t12Comp.length > 0, "ยังไม่มีคอมโพเนนต์");
    const bad = t12Comp.filter((f) => /[^=\s$]\s*\{\s*[\w.?]+\.(status|state|code|kind|channel|ruleKind)\s*\}/.test(stripComments(read(f))));
    ok(bad.length === 0, `แสดงรหัสดิบ: ${bad.join(", ")}`);
  });
  await st("S-11", "วันเวลา: ไฟล์ของใบไม่ใช้ getDay/getDate/getHours/getMinutes/getMonth/getFullYear (เวลาเครื่อง) หรือ toLocaleDateString/TimeString", () => {
    ok(OWN_MOD.every((f) => existsSync(join(ROOT, f))) && t12Comp.length > 0, "ไฟล์ของใบยังไม่ครบ");
    const bad = t12Files.filter((f) => /\.(getDay|getDate|getHours|getMinutes|getMonth|getFullYear)\(|toLocale(Date|Time)String\(/.test(stripComments(read(f))));
    ok(bad.length === 0, `ใช้เวลาเครื่อง: ${bad.join(", ")}`);
  });
  await st("S-12", "action ใหม่: \"use server\" · ส่งออก async function เท่านั้น · ทุกตัวผ่าน requireUnit · decideBelowMinAction มีอยู่", () => {
    const s = stripComments(read(ACTIONS));
    ok(s, `ยังไม่มี ${ACTIONS}`);
    ok(/^\s*["']use server["']/.test(read(ACTIONS)), "ไม่มี \"use server\"");
    ok(!/export\s+(const|let|type|interface|class|function\s)/.test(s.replace(/export\s+async\s+function/g, "")), "ส่งออกสิ่งที่ไม่ใช่ async function");
    ok(/export\s+async\s+function\s+decideBelowMinAction\b/.test(s), "ไม่มี decideBelowMinAction");
    const bodies = s.split(/export\s+async\s+function\s+/).slice(1);
    const noGate = bodies.filter((b) => !/requireUnit\(|enter\(|guard\(|gate\(/.test(b.slice(0, 600))).map((b) => b.slice(0, 30));
    ok(noGate.length === 0, `action ไม่ผ่านด่าน: ${noGate.join(", ")}`);
  });
  await st("S-13", `ขอบเขต (เทียบ ${BASE_COMMIT}): ไฟล์ T0.x ของโมดูลไม่เปลี่ยนเลย · index/permissions/seed/ฟิกซ์เจอร์ เพิ่มอย่างเดียว · settings กลาง/SettingsForm ไม่แตะ`, () => {
    let out = "";
    try { out = execFileSync("git", ["diff", "--numstat", BASE_COMMIT, "--", ...T0X_FILES, ...ADDITIVE_ONLY, ...FROZEN_DIRS], { cwd: ROOT, encoding: "utf8" }); } catch (e) { throw new AssertFail(`git diff ไม่ได้: ${errMsg(e)}`); }
    const rows = out.trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
    const t0 = rows.filter(([, , f]) => T0X_FILES.includes(f)).map(([a, d, f]) => `${f} +${a}/−${d}`);
    const del = rows.filter(([, d, f]) => ADDITIVE_ONLY.includes(f) && Number(d) > 0).map(([, d, f]) => `${f} −${d}`);
    const frozen = rows.filter(([, , f]) => FROZEN_DIRS.some((dir) => f.startsWith(dir))).map(([a, d, f]) => `${f} +${a}/−${d}`);
    ok(t0.length === 0 && del.length === 0 && frozen.length === 0, [...t0, ...del, ...frozen].join(" · "));
  });
  await st("S-14", "ไม่ลบ/ไม่เขียนตาราง Trip* ตรง ในไฟล์โมดูลของใบ (เขียนผ่านบริการ T0.3/T0.5 เท่านั้น)", () => {
    const files = OWN_MOD.filter((f) => existsSync(join(ROOT, f)));
    ok(files.length === OWN_MOD.length, "ไฟล์โมดูลยังไม่ครบ");
    const bad = files.filter((f) => /\.(delete|deleteMany|create|createMany|update|updateMany|upsert)\(|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"Trip/i.test(stripComments(read(f))));
    ok(bad.length === 0, `เขียนตรง: ${bad.join(", ")}`);
  });
  await st("S-15", "ไม่แตะการจอง/เงิน: ไฟล์ของใบไม่อ้าง TripBooking · TripPassenger · TripMoneyEvent · TripPaymentDue · TripRefundRequest · โมดูล account/pos · ไม่เรียก moveSold/returnSold/placeHold/convertHold", () => {
    ok(OWN_MOD.every((f) => existsSync(join(ROOT, f))) && t12Comp.length > 0, "ไฟล์ของใบยังไม่ครบ");
    const bad = t12Files.filter((f) => /tripBooking|TripBooking|tripPassenger|TripPassenger|tripMoneyEvent|TripMoneyEvent|tripPaymentDue|TripPaymentDue|tripRefundRequest|TripRefundRequest|modules\/account|modules\/pos|\b(moveSold|returnSold|placeHold|convertHold)\w*\(/.test(stripComments(read(f))));
    ok(bad.length === 0, `อ้างการจอง/เงิน: ${bad.join(", ")}`);
  });
  await st("S-16", "ตัวโหลดมีเพดาน + ไม่ N+1: ใช้ listDepartures ช่วงเดียว · มี take · ไม่ await getDeparture/listDepartures/quoteTripLine ในลูป · อ่านค่าตั้ง trips.public.showLeftAtOrBelow", () => {
    const s = stripComments(read(LOADER));
    ok(s, "ยังไม่มี departure-screens.ts");
    ok(/listDepartures\(/.test(s) && /\btake\s*:/.test(s), "ไม่ใช้ listDepartures/ไม่มี take");
    ok(!/for\s*\([^)]*\)\s*\{[^}]{0,400}await\s+(dep\.)?(getDeparture|listDepartures|quoteTripLine|loadPricingInput)\(/.test(s), "await ในลูป (N+1)");
    ok(/["']trips\.public\.showLeftAtOrBelow["']/.test(s), "ไม่อ่านค่าตั้งเหลือ N");
  });
  await st("S-17", "กล่องโต้ตอบ: ไฟล์ Departure* ที่มี role=dialog ต้องจัดการ Escape · อย่างน้อยหนึ่งไฟล์ใช้ <Dialog ของ T1.1", () => {
    ok(t12Comp.length > 0, "ยังไม่มีคอมโพเนนต์");
    const own = t12Comp.filter((f) => /role=["{'`]+dialog/.test(read(f)) && !/Escape/.test(read(f)));
    ok(own.length === 0, `กล่องเขียนเองไม่มี Escape: ${own.join(", ")}`);
    ok(t12Comp.some((f) => /<Dialog\b/.test(read(f))), "ไม่ใช้ Dialog ของ ProductsScreenParts");
  });
  await st("S-18", "ปุ่มแผงกะทัดรัด (trips-dep-actions อยู่ในกริด 2 คอลัมน์) · มือถือ: มี trips-cal-daylist + ตารางสัปดาห์ซ่อนใต้ md · ไม่มี sr-only ในไฟล์ที่มี <table", () => {
    const src = t12Comp.map((f) => read(f)).join("\n");
    const at = src.indexOf("trips-dep-actions");
    ok(at >= 0, "ไม่มี trips-dep-actions");
    ok(/grid-cols-2/.test(src.slice(Math.max(0, at - 400), at + 400)), "trips-dep-actions ไม่ใช่กริด 2 คอลัมน์");
    ok(src.includes("trips-cal-daylist"), "ไม่มีรายการต่อวันของมือถือ");
    const wk = src.indexOf("trips-cal-week");
    ok(wk >= 0 && /hidden\s+md:|max-md:hidden/.test(src.slice(Math.max(0, wk - 400), wk + 400)), "ตารางสัปดาห์ไม่ซ่อนใต้ md");
    const srTable = t12Comp.filter((f) => /<table/.test(read(f)) && /sr-only/.test(read(f)));
    ok(srTable.length === 0, `sr-only ในไฟล์ตาราง: ${srTable.join(", ")}`);
  });
  await st("S-19", "เครื่องมือภาพ: visual-trips มีสเปก t1.2 4 ฉาก (mockup 11 · racha1231) · parity-trips.sh รู้จัก 11", () => {
    const v = read("scripts/visual-trips.mts");
    ok(/["']t1\.2["']/.test(v), "ไม่มีสเปก t1.2");
    const miss = VISUAL_SCENES.filter((n) => !v.includes(`"${n}"`) && !v.includes(`'${n}'`));
    ok(miss.length === 0, `ฉากขาด: ${miss.join(", ")}`);
    ok(/["']11["']/.test(v) && /racha1231/.test(v), "ไม่มี mockup 11 / racha1231");
    ok(/11-departures-calendar/.test(read("scripts/parity-trips.sh")), "parity-trips.sh ไม่รู้จัก 11");
  });
  await st("S-20", "pure: departure-view-core.ts import ได้เฉพาะ import type + ./departures-core + ./capacity-core · ไม่อ่าน new Date() / Date.now()", () => {
    const s = stripComments(read(PURE));
    ok(s, "ยังไม่มี departure-view-core.ts");
    const imps = [...s.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s*["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
    const bad = imps.filter((x) => x !== "./departures-core" && x !== "./capacity-core");
    ok(bad.length === 0, `import ไม่บริสุทธิ์: ${bad.join(", ")}`);
    ok(!/new Date\(\s*\)|Date\.now\(/.test(s), "อ่านนาฬิกาเครื่อง");
  });
  await st("S-21", "ราคาในแผงจากตัวคิดราคาจริง (loadPricingInput + resolveTripPrice / quoteTripLine) · ไม่คูณ % เอง", () => {
    const s = stripComments(read(LOADER));
    ok(s, "ยังไม่มี departure-screens.ts");
    ok(/resolveTripPrice\(|quoteTripLine\(/.test(s), "ไม่เรียกตัวคิดราคา");
    ok(!/mulBpHalfUp|mulDivHalfUp|\*\s*0\.7\b|\b70\s*\/\s*100|\/\s*100\s*\*\s*70/.test(s), "คูณ % เอง");
  });
  groupLine("S");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ (สถานะช่อง · วัน) ──");
  const cellState = (d: Rec, c: Rec = {}): string => String(fn("departureCellState")(
    { status: "OPEN", capacity: 24, sold: 0, held: 0, reserved: 0, minPax: null, localDate: "2026-11-20", startsAt: "2026-11-20T01:00:00.000Z", ...d },
    { now: new Date("2026-11-12T11:00:00.000Z"), today: "2026-11-12", lowAtOrBelow: 5, ...c },
  ));
  await st("P-1", "DEPARTURE_CELL_STATES ตามลำดับตัดสิน · DEPARTURE_DESK_ERROR_CODES = NOT_BELOW_MIN/MERGE_NEEDS_BOOKINGS/MERGE_TARGET_INVALID", () => {
    eq(needTrips().DEPARTURE_CELL_STATES, CELL_STATES, "สถานะช่อง");
    eq([...((needTrips().DEPARTURE_DESK_ERROR_CODES as string[] | undefined) ?? [])].sort(), [...DESK_CODES].sort(), "รหัส");
  });
  await st("P-2", "เต็มจากตัวนับ ไม่ใช่สถานะ: OPEN 20+4/24 ⇒ FULL · 10 ขาย + 4 ถือ + 10 โควตา/24 ⇒ FULL · สถานะ FULL แต่ 24/30 ⇒ ไม่ FULL (OPEN)", () => {
    eq(cellState({ sold: 20, held: 4 }), "FULL", "ขาย+ถือ");
    eq(cellState({ sold: 10, held: 4, reserved: 10 }), "FULL", "รวมโควตา");
    eq(cellState({ status: "FULL", capacity: 30, sold: 24 }), "OPEN", "สถานะ FULL มีที่ว่าง");
  });
  await st("P-3", "ต่ำกว่าขั้นต่ำ: OPEN ขั้นต่ำ 8 ขาย 4 ⇒ BELOW_MIN · ขาย 8 ⇒ OPEN · GUARANTEED ขาย 0 ⇒ GUARANTEED · CLOSED ⇒ CLOSED · ไม่มีขั้นต่ำ ⇒ OPEN", () => {
    eq([cellState({ minPax: 8, sold: 4 }), cellState({ minPax: 8, sold: 8 }), cellState({ status: "GUARANTEED", minPax: 8 }), cellState({ status: "CLOSED", minPax: 8 }), cellState({})],
      ["BELOW_MIN", "OPEN", "GUARANTEED", "CLOSED", "OPEN"], "สถานะ");
  });
  await st("P-4", "ลำดับ: ที่นั่งหมด (ถือ) ชนะต่ำกว่าขั้นต่ำ · cap 10 ขาย 2 ถือ 8 ขั้นต่ำ 5 ⇒ FULL · GUARANTEED เหลือ 3 ⇒ GUARANTEED (ไม่ใช่ LOW)", () => {
    eq(cellState({ capacity: 10, sold: 2, held: 8, minPax: 5 }), "FULL", "เต็มก่อนขั้นต่ำ");
    eq(cellState({ status: "GUARANTEED", sold: 21 }), "GUARANTEED", "ยืนยันก่อนเหลือน้อย");
  });
  await st("P-5", "เหลือ N จากค่าตั้ง: 21/24 (เหลือ 3) ⇒ LOW · เหลือ 5 ⇒ LOW · เหลือ 6 ⇒ OPEN · lowAtOrBelow null/0 ⇒ OPEN", () => {
    eq([cellState({ sold: 21, minPax: 8 }), cellState({ sold: 19 }), cellState({ sold: 18 }), cellState({ sold: 21 }, { lowAtOrBelow: null }), cellState({ sold: 21 }, { lowAtOrBelow: 0 })],
      ["LOW", "LOW", "OPEN", "OPEN", "OPEN"], "เหลือ");
  });
  await st("P-6", "เวลา: เริ่มแล้ววันนี้ ⇒ DEPARTED_TODAY · วันก่อน ⇒ PAST · ยกเลิกที่ผ่านแล้ว ⇒ CANCELLED · CLOSED/เต็มที่ผ่านแล้ว ⇒ PAST · ยังไม่ถึงเวลาออกวันนี้ ⇒ ไม่ผ่าน", () => {
    const today = { localDate: "2026-11-12", startsAt: "2026-11-12T01:00:00.000Z" };
    const past = { localDate: "2026-11-11", startsAt: "2026-11-11T01:00:00.000Z" };
    eq([cellState(today), cellState(past), cellState({ ...past, status: "CANCELLED" }), cellState({ ...past, status: "CLOSED" }), cellState({ ...past, sold: 24 }),
      cellState({ localDate: "2026-11-12", startsAt: "2026-11-12T12:00:00.000Z" })], ["DEPARTED_TODAY", "PAST", "CANCELLED", "PAST", "PAST", "OPEN"], "ช่วงเวลา");
  });
  await st("P-7", "startsAt รับได้ทั้ง Date และ ISO · ผลเหมือนกัน", () => {
    eq(cellState({ startsAt: new Date("2026-11-12T01:00:00.000Z"), localDate: "2026-11-12" }), "DEPARTED_TODAY", "Date");
  });
  await st("P-8", "calendarWeekDays: 7 วันต่อกัน ข้ามปี (2026-12-29 → 2027-01-04) · วันที่ไม่มีจริง ⇒ []", () => {
    eq(fn("calendarWeekDays")("2026-12-29"), ["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04"], "ข้ามปี");
    eq(fn("calendarWeekDays")("2026-02-30"), [], "วันผิด");
  });
  await st("P-9", "calendarMonthDays เริ่มวันจันทร์ ครบสัปดาห์: 2026-11 = 42 วัน (26 ต.ค.–6 ธ.ค.) · 2026-12 = 35 (30 พ.ย.–3 ม.ค.) · 2027-02 = 28 · 2026-13 ⇒ []", () => {
    const m = (s: string) => { const a = (fn("calendarMonthDays")(s) as string[]) ?? []; return [a.length, a[0], a[a.length - 1]]; };
    eq(m("2026-11"), [42, "2026-10-26", "2026-12-06"], "พ.ย.");
    eq(m("2026-12"), [35, "2026-11-30", "2027-01-03"], "ธ.ค.");
    eq(m("2027-02"), [28, "2027-02-01", "2027-02-28"], "ก.พ. 2570");
    eq(fn("calendarMonthDays")("2026-13"), [], "เดือนผิด");
  });
  await st("P-10", "defaultWeekStart = วันนี้ − 1 (ภาพ 11: ดู ณ 12 พ.ย. เริ่ม 11) · ข้ามปี 2027-01-01 ⇒ 2026-12-31", () => {
    eq([fn("defaultWeekStart")("2026-11-12"), fn("defaultWeekStart")("2027-01-01")], ["2026-11-11", "2026-12-31"], "เริ่มสัปดาห์");
  });
  groupLine("P");

  // ═══════════════ CV. ปฏิทิน seed (ภาพ 11) ═══════════════
  console.log("\n── CV: ปฏิทิน seed (ภาพ 11 · now = TRIPS_AS_OF) ──");
  const SEED: Ctx = { tenantId: DIVE_TENANT, actorUserId: DIVE_OWNER_ID };
  const U0 = DIVE_TRIPS_UNIT.id;
  const calVM = async (ctx: Ctx, input: Rec, at: Date = AS_OF): Promise<Rec> => { const r = await call("loadDepartureCalendarVM", ctx, input, { now: at }); okR(r, "loadDepartureCalendarVM"); return asRec(r.vm) ?? {}; };
  const panelVM = async (ctx: Ctx, input: Rec, at: Date = AS_OF): Promise<Rec> => { const r = await call("loadDeparturePanelVM", ctx, input, { now: at }); okR(r, "loadDeparturePanelVM"); return asRec(r.vm) ?? {}; };
  const cellOf = (vm: Rec, id: string): Rec => { const c = asArr(vm.cells).find((x) => x.departureId === id); if (!c) throw new AssertFail(`ไม่มีช่องของรอบ ${id}`); return c; };
  let wk: Rec = {};
  await st("CV-1", "สัปดาห์ start 2026-11-11: 7 วัน 11–17 · today 2026-11-12 · tz Asia/Bangkok", async () => {
    wk = await calVM(SEED, { unitId: U0, view: "week", start: "2026-11-11" });
    eq(asRec(wk.range)?.days, WEEK_DAYS, "วัน");
    eq([asRec(wk.unit)?.today, asRec(wk.unit)?.tz], ["2026-11-12", "Asia/Bangkok"], "unit");
  });
  await st("CV-2", "ไม่ส่ง start ⇒ ปริยาย today − 1 = 2026-11-11 (ภาพ :7 \"11–17 พ.ย. 2569\") · view ปริยาย week", async () => {
    const v = await calVM(SEED, { unitId: U0 });
    eq([v.view, asRec(v.range)?.from, asRec(v.range)?.to], ["week", "2026-11-11", "2026-11-17"], "ปริยาย");
  });
  await st("CV-3", "แถวสินค้าเรียง ราชา · พีพี · ดำน้ำลึก · สิมิลัน (TOUR ก่อน LIVEABOARD · สร้างก่อนมาก่อน)", () => {
    eq(asArr(wk.products).map((p) => p.id), [pid("racha"), pid("phiphi"), pid("deep3"), pid("similan")], "ลำดับ");
  });
  await st("CV-4", "หัวแถว (:17 :25 :33): ราชา เรือราชา 1 · 24 · ขั้นต่ำ 8 · พีพี สปีดโบ๊ต 2 ลำ · 30 · 10 · ดำน้ำลึก เรือดำน้ำ 1 · 12 · 4 · หน่วยที่นั่ง SEAT", () => {
    const h = (k: SeedKey) => asRec(asArr(wk.products).find((p) => p.id === pid(k))?.header) ?? {};
    eq([h("racha").boats, h("racha").capacity, h("racha").minPax, h("racha").unitWord], [["เรือราชา 1"], 24, 8, "SEAT"], "ราชา");
    eq([(h("phiphi").boats as unknown[] | undefined)?.length, h("phiphi").capacity, h("phiphi").minPax], [2, 30, 10], "พีพี");
    eq([h("deep3").boats, h("deep3").capacity, h("deep3").minPax], [["เรือดำน้ำ 1"], 12, 4], "ดำน้ำลึก");
  });
  await st("CV-5", "ช่องในสัปดาห์ = 20 รอบ seed · ทุกช่อง sold/held/reserved 0 · used 0 · seatsLeft = ความจุ · timeText ราชา 08:00–16:30", () => {
    const cells = asArr(wk.cells);
    eq(cells.length, 20, "จำนวนช่อง");
    ok(cells.every((c) => c.sold === 0 && c.held === 0 && c.reserved === 0 && c.used === 0 && c.seatsLeft === c.capacity), `ตัวนับ: ${fmt(cells.find((c) => c.sold !== 0 || c.seatsLeft !== c.capacity))}`);
    eq(cellOf(wk, did("racha", "2026-11-14")).timeText, "08:00–16:30", "เวลา");
  });
  await st("CV-6", "สถานะช่อง (:18–:24 :26–:39): 11 PAST · 12 DEPARTED_TODAY · 13 CANCELLED คลื่นลม · 14 ราชา/พีพี GUARANTEED · ดำน้ำลึก 14 + ที่เหลือ OPEN ⇒ BELOW_MIN", () => {
    const states = (k: SeedKey, days: string[]) => days.map((d) => cellOf(wk, did(k, d)).state);
    const tail = ["BELOW_MIN", "BELOW_MIN", "BELOW_MIN"];
    eq(states("racha", WEEK_DAYS), ["PAST", "DEPARTED_TODAY", "CANCELLED", "GUARANTEED", ...tail], "ราชา");
    eq(states("phiphi", WEEK_DAYS), ["PAST", "DEPARTED_TODAY", "CANCELLED", "GUARANTEED", ...tail], "พีพี");
    eq(states("deep3", WEEK_DAYS.slice(0, 6)), ["PAST", "DEPARTED_TODAY", "CANCELLED", "BELOW_MIN", "BELOW_MIN", "BELOW_MIN"], "ดำน้ำลึก");
    eq(cellOf(wk, did("racha", "2026-11-13")).cancelReason, FX.TRIPS_SEED_CANCEL_REASON, "เหตุยกเลิก");
    eq([cellOf(wk, did("racha", "2026-11-16")).minPax, cellOf(wk, did("racha", "2026-11-16")).shortBy], [8, 8], "ต่ำกว่าขั้นต่ำ 8");
  });
  await st("CV-7", "ดำน้ำลึก อ. 17 ไม่มีรอบ (:40) ⇒ emptyDays SKIPPED จากข้อยกเว้นของกฎ · ไม่มีช่อง", () => {
    ok(!asArr(wk.cells).some((c) => c.productId === pid("deep3") && c.localDate === "2026-11-17"), "มีช่องดำน้ำลึก 17");
    ok(asArr(wk.emptyDays).some((e) => e.productId === pid("deep3") && e.localDate === "2026-11-17" && e.reason === "SKIPPED"), `emptyDays: ${fmt(wk.emptyDays)}`);
  });
  await st("CV-8", "ต้องตัดสินใจ = 8 รอบ (ภาพ 3 — ขายแล้วจาก T0.6) เรียงเวลาตัดสินแล้วเวลาออก · ไม่มีรอบเลยเวลาตัดสิน ณ 12 พ.ย. 18:00", () => {
    const d = asArr(wk.decisions);
    const want = [["deep3", "2026-11-15"], ["racha", "2026-11-15"], ["phiphi", "2026-11-15"], ["deep3", "2026-11-16"], ["racha", "2026-11-16"], ["phiphi", "2026-11-16"], ["racha", "2026-11-17"], ["phiphi", "2026-11-17"]] as const;
    eq(d.map((x) => x.departureId), want.map(([k, day]) => did(k, day)), "ลำดับ");
    eq(asRec(wk.counts)?.belowMin, 8, "counts.belowMin");
    ok(d.every((x) => x.overdue === false), "overdue");
  });
  await st("CV-9", "เวลาตัดสิน จ. 16 ราชา = อา. 15 18:00 (2026-11-15T11:00Z · ภาพ :62) · used 0 · shortBy 8", () => {
    const x = asArr(wk.decisions).find((y) => y.departureId === did("racha", "2026-11-16"));
    eq([x?.decisionAt, x?.used, x?.shortBy, x?.minPax], ["2026-11-15T11:00:00.000Z", 0, 8, 8], "รายการ");
  });
  await st("CV-10", "now = อา. 15 19:00: ราชา 15 ออกเรือแล้ว · ราชา 16 เลยเวลาตัดสิน (overdue) · ราชา 17 ยัง · start ปริยาย = 14", async () => {
    const at = new Date("2026-11-15T12:00:00.000Z");
    const v = await calVM(SEED, { unitId: U0 }, at);
    eq(asRec(v.range)?.from, "2026-11-14", "start");
    eq(cellOf(v, did("racha", "2026-11-15")).state, "DEPARTED_TODAY", "ราชา 15");
    const dd = asArr(v.decisions);
    eq([dd.find((x) => x.departureId === did("racha", "2026-11-16"))?.overdue, dd.find((x) => x.departureId === did("racha", "2026-11-17"))?.overdue], [true, false], "overdue");
  });
  await st("CV-11", "ชิปยกเลิก (:10): 3 รอบ · 0 คน (ยกเลิกได้เฉพาะรอบว่าง) · เหตุผล คลื่นลม × 3", () => {
    eq(asRec(asRec(wk.counts)?.cancelled), { departures: 3, pax: 0, reasons: [{ text: FX.TRIPS_SEED_CANCEL_REASON, n: 3 }] }, "cancelled");
  });
  await st("CV-12", "สิมิลัน (:41–:42): ไม่มีช่องในสัปดาห์ · nextTrip 2027-02-14 ถึง 2027-02-18 · 0/20 · หน่วย BERTH", () => {
    ok(!asArr(wk.cells).some((c) => c.productId === pid("similan")), "มีช่องสิมิลัน");
    const p = asArr(wk.products).find((x) => x.id === pid("similan")) ?? {};
    const n = asRec(p.nextTrip) ?? {};
    eq([n.departureId, n.localDate, n.endDate, n.capacity, n.sold, asRec(p.header)?.unitWord], [did("similan", SIM.start), SIM.start, SIM.end, 20, 0, "BERTH"], "nextTrip");
    eq(asRec(asArr(wk.products).find((x) => x.id === pid("racha"))?.nextTrip ?? null), null, "ราชามีช่อง ⇒ nextTrip null");
  });
  await st("CV-13", "ตัวกรอง (:11): tour = ราชา พีพี · dive = ดำน้ำลึก สิมิลัน · ช่องตามแถว", async () => {
    const t = await calVM(SEED, { unitId: U0, start: "2026-11-11", filter: "tour" });
    const d = await calVM(SEED, { unitId: U0, start: "2026-11-11", filter: "dive" });
    eq(asArr(t.products).map((p) => p.id), [pid("racha"), pid("phiphi")], "tour");
    eq(asArr(d.products).map((p) => p.id), [pid("deep3"), pid("similan")], "dive");
    eq([asArr(t.cells).length, asArr(d.cells).length], [14, 6], "ช่อง");
  });
  await st("CV-14", "เดือน 2026-11: 42 วัน 26 ต.ค.–6 ธ.ค. · ช่อง 20 · decisions เดียวกับสัปดาห์", async () => {
    const m = await calVM(SEED, { unitId: U0, view: "month", month: "2026-11" });
    const days = (asRec(m.range)?.days as string[] | undefined) ?? [];
    eq([m.view, days.length, days[0], days[41], asArr(m.cells).length, asArr(m.decisions).length], ["month", 42, "2026-10-26", "2026-12-06", 20, 8], "เดือน");
  });
  await st("CV-15", "เดือน 2026-12: ราชา 31 ธ.ค. BELOW_MIN · hasDeparturePrice (4,500 ราคารอบ) · ขั้นต่ำ 8", async () => {
    const m = await calVM(SEED, { unitId: U0, view: "month", month: "2026-12" });
    const c = cellOf(m, did("racha", DEC31.date));
    eq([c.state, c.hasDeparturePrice, c.minPax, c.localDate], ["BELOW_MIN", true, 8, DEC31.date], "31 ธ.ค.");
  });
  await st("CV-16", "ทริปหลายวัน: มีสิมิลัน (multiDay) · ไม่มีเดย์ทริป", async () => {
    const v = await calVM(SEED, { unitId: U0, view: "trips" });
    const ids = asArr(v.trips).map((x) => x.departureId);
    ok(ids.includes(did("similan", SIM.start)), `trips: ${fmt(ids)}`);
    ok(!asArr(v.trips).some((x) => x.productId === pid("racha")), "มีเดย์ทริป");
  });
  await st("CV-17", "input ผิด ⇒ INVALID_INPUT: start 2026-02-30 · month 2026-13 · view year · คีย์แปลก tenantId", async () => {
    for (const bad of [{ start: "2026-02-30" }, { view: "month", month: "2026-13" }, { view: "year" }, { tenantId: "x" }]) codeR(await call("loadDepartureCalendarVM", SEED, { unitId: U0, ...bad }, { now: AS_OF }), "INVALID_INPUT", fmt(bad));
  });
  await st("CV-18", "เจ้าของร้าน: flags canEdit/canStatus/canPrice/canSeePrices = true · ไม่ถูกตัด (truncated false · shown = total)", () => {
    const f = asRec(wk.flags) ?? {};
    eq([f.canEdit, f.canStatus, f.canPrice, f.canSeePrices, wk.truncated, wk.shown === wk.total], [true, true, true, true, false, true], "flags");
  });
  await st("CV-19", "ปุ่มช่วงวัน: สัปดาห์ 11 พ.ย. ⇒ prev 4 · next 18 · วันนี้ 11 · เดือน 2026-11 ⇒ 2026-10 / 2026-12 / 2026-11", async () => {
    eq([asRec(wk.nav)?.prev, asRec(wk.nav)?.next, asRec(wk.nav)?.today], ["2026-11-04", "2026-11-18", "2026-11-11"], "สัปดาห์");
    const m = await calVM(SEED, { unitId: U0, view: "month", month: "2026-11" });
    eq([asRec(m.nav)?.prev, asRec(m.nav)?.next, asRec(m.nav)?.today], ["2026-10", "2026-12", "2026-11"], "เดือน");
  });
  groupLine("CV");

  // ═══════════════ PV. แผงรอบ seed ═══════════════
  console.log("\n── PV: แผงรอบ seed ──");
  let p14: Rec = {};
  const actOf = (vm: Rec) => { const a = asRec(vm.actions) ?? {}; return Object.fromEntries(ACTION_KEYS.map((k) => [k, a[k]])); };
  const allFalse = Object.fromEntries(ACTION_KEYS.map((k) => [k, false]));
  await st("PV-1", "ส. 14 ราชา (:48–:49): GUARANTEED · 08:00–16:30 · เรือราชา 1 · รถตู้ 2 · ไกด์ 2", async () => {
    p14 = await panelVM(SEED, { unitId: U0, departureId: did("racha", "2026-11-14") });
    const d = asRec(p14.departure) ?? {};
    const rs = asRec(d.resourceSummary) ?? {};
    eq([d.state, d.timeText, d.localDate, rs.boats, rs.vans, rs.guides], ["GUARANTEED", "08:00–16:30", "2026-11-14", ["เรือราชา 1"], 2, 2], "หัวแผง");
  });
  await st("PV-2", "ตัวเลข (:50 :55): ความจุ 24 · ขาย 0 · ถือ 0 · โควตา 0 · ว่าง 24 · รายการรอ 0/0", () => {
    const c = asRec(p14.counts) ?? {};
    eq([c.capacity, c.sold, c.held, c.reserved, c.used, c.seatsLeft, c.waitlistWaiting, c.waitlistOffered], [24, 0, 0, 0, 0, 24, 0, 0], "counts");
  });
  await st("PV-3", "ปิดรับต่อช่องทาง: หน้าร้าน ส. 14 07:00 (00:00Z · ปรับที่หน่วย) · เว็บ ศ. 13 18:00 (11:00Z) · กลุ่มครบ 12 ช่องทาง", () => {
    const g = asArr(asRec(p14.departure)?.cutoffGroups);
    const at = (ch: string) => g.find((x) => Array.isArray(x.channels) && (x.channels as string[]).includes(ch))?.atIso;
    eq([at("COUNTER"), at("WEB")], ["2026-11-14T00:00:00.000Z", "2026-11-13T11:00:00.000Z"], "ปิดรับ");
    eq(g.flatMap((x) => (x.channels as string[]) ?? []).sort(), [...SELL_CHANNELS].sort(), "ช่องทางครบไม่ซ้ำ");
  });
  await st("PV-4", "ปุ่มเจ้าของบนรอบ GUARANTEED อนาคต: ปิดรับ/ถอนยืนยัน/ยกเลิก/ความจุ/ทรัพยากร/ราคา/หยุดขาย · ไม่มี ยืนยัน/ออกขาดทุน/รวม · ใบรายชื่อ/จองให้ลูกค้า false", () => {
    eq(actOf(p14), { close: true, reopen: false, guarantee: false, unguarantee: true, run: false, merge: false, cancel: true, capacity: true, resources: true, price: true, stopSell: true, manifest: false, book: false }, "actions");
    eq(p14.cancelBlocked, false, "cancelBlocked");
  });
  await st("PV-5", "ไม่แต่งข้อมูลการจอง/เงิน: bookings = null · money = null (T1.3/T1.7)", () => {
    eq([p14.bookings, p14.money], [null, null], "null");
  });
  await st("PV-6", "ราคา ส. 14: ผู้ใหญ่ 3,500 · เด็ก 2,450 · ไม่ใช่ราคารอบ", () => {
    const rows = asArr(asRec(p14.price)?.rows);
    const r = (c: string) => rows.find((x) => x.code === c) ?? {};
    eq([r("ADULT").satang, r("CHILD").satang], [350_000, 245_000], "ราคา");
    ok(r("ADULT").source !== "DEPARTURE" && r("ADULT").departurePriceId === null, `source ${fmt(r("ADULT"))}`);
  });
  await st("PV-7", "ราคา 31 ธ.ค. (ราคาเฉพาะรอบ): ผู้ใหญ่ 4,500 source DEPARTURE + departurePriceId · เด็ก 3,150", async () => {
    const v = await panelVM(SEED, { unitId: U0, departureId: did("racha", DEC31.date) });
    const rows = asArr(asRec(v.price)?.rows);
    const a = rows.find((x) => x.code === "ADULT") ?? {}, c = rows.find((x) => x.code === "CHILD") ?? {};
    eq([a.satang, a.source, typeof a.departurePriceId, c.satang], [DEC31.adultSatang, "DEPARTURE", "string", DEC31.childSatang], "ราคารอบ");
  });
  await st("PV-8", "รอบที่ผ่านแล้ว (พ. 11): state PAST · ไม่มีปุ่มทำรายการเลย", async () => {
    const v = await panelVM(SEED, { unitId: U0, departureId: did("racha", "2026-11-11") });
    eq([asRec(v.departure)?.state, actOf(v)], ["PAST", allFalse], "ผ่านแล้ว");
  });
  await st("PV-9", "รอบยกเลิก (ศ. 13): เหตุผล คลื่นลม · ไม่มีปุ่มทำรายการเลย", async () => {
    const v = await panelVM(SEED, { unitId: U0, departureId: did("racha", "2026-11-13") });
    eq([asRec(v.departure)?.cancelReason, actOf(v)], [FX.TRIPS_SEED_CANCEL_REASON, allFalse], "ยกเลิก");
  });
  await st("PV-10", "จ. 16 ราชา ต่ำกว่าขั้นต่ำ (:62): ออกขาดทุน/รวม/ยกเลิก · เป้ารวม = พีพี 16 + ดำน้ำลึก 16 (วันเดียวกัน · ไม่ใช่ตัวเอง)", async () => {
    const v = await panelVM(SEED, { unitId: U0, departureId: did("racha", "2026-11-16") });
    const a = actOf(v);
    eq([a.run, a.merge, a.cancel, a.guarantee, a.close], [true, true, true, false, true], "actions");
    eq(asArr(v.mergeTargets).map((x) => String(x.departureId)).sort(), [did("phiphi", "2026-11-16"), did("deep3", "2026-11-16")].sort(), "เป้า");
  });
  await st("PV-11", "รอบที่ไม่มี/ไม่ใช่ของหน่วย ⇒ NOT_FOUND · คีย์แปลก ⇒ INVALID_INPUT", async () => {
    codeR(await call("loadDeparturePanelVM", SEED, { unitId: U0, departureId: "nope" }, { now: AS_OF }), "NOT_FOUND", "ไม่มี");
    codeR(await call("loadDeparturePanelVM", SEED, { unitId: U0, departureId: did("racha", "2026-11-14"), x: 1 }, { now: AS_OF }), "INVALID_INPUT", "คีย์แปลก");
  });
  groupLine("PV");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uL = rid("uL"), uT = rid("uT"), uBk = rid("uBk"), uB = rid("uB");
  let setupErr = "";
  const U: Record<string, Actor> = {};
  const DV = ["trips.departure.view"];
  try {
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) {
      await insertRow("Tenant", { id, name: `ทดสอบ T1.2 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: now() });
      tenantIds.push(id);
    }
    const mkUnit = async (id: string, tenantId: string, type: string, tag: string, settings?: Rec) => {
      try { await insertRow("BusinessUnit", { id, tenantId, type, name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, updatedAt: now(), ...(settings ? { settings: JSON.stringify(settings) } : {}) }); }
      catch (e) { throw new Error(`สร้างหน่วย ${type} ไม่ได้: ${errMsg(e).slice(0, 80)}`); }
    };
    await mkUnit(uA, tA, "TRIPS", "a"); await mkUnit(uA2, tA, "TRIPS", "a2"); await mkUnit(uL, tA, "TRIPS", "lim"); await mkUnit(uT, tA, "TRIPS", "tokyo", { timezone: "Asia/Tokyo" });
    await mkUnit(uBk, tA, "BOOKING", "abk"); await mkUnit(uB, tB, "TRIPS", "b");
    const mkUser = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], perms: string[]): Promise<void> => {
      const id = rid(`u${tag}`);
      const permissions = Object.fromEntries(perms.map((p) => [p, true]));
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: now() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: now(), updatedAt: now() });
      U[tag] = { role, unitAccess, permissions, userId: id };
    };
    await mkUser("oa", tA, "OWNER", ["*"], []);
    await mkUser("ob", tB, "OWNER", ["*"], []);
    await mkUser("dv", tA, "STAFF", [uA], DV);
    await mkUser("de", tA, "STAFF", [uA], [...DV, "trips.departure.edit"]);
    await mkUser("ds", tA, "STAFF", [uA], [...DV, "trips.departure.status"]);
    await mkUser("pv", tA, "STAFF", [uA], [...DV, "trips.product.view"]);
    await mkUser("pe", tA, "STAFF", [uA], [...DV, "trips.product.view", "trips.price.edit"]);
    await mkUser("pvo", tA, "STAFF", [uA], ["trips.product.view"]);
    await mkUser("none", tA, "STAFF", [uA], []);
    await mkUser("a2", tA, "STAFF", [uA2], [...DV, "trips.departure.edit", "trips.departure.status"]);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const ctxOf = (tag: string): Ctx => {
    const a = U[tag];
    if (!a) throw new AssertFail(`ไม่มีร้าน/ผู้ใช้ชั่วคราว (${setupErr || "ยังไม่ตั้ง"})`);
    return { tenantId: tag === "ob" ? tB : tA, actorUserId: a.userId };
  };
  const OA = () => ctxOf("oa");
  const sellCtx = (unitId: string, tag = "oa") => ({ tenantId: tag === "ob" ? tB : tA, unitId, channel: "COUNTER", actor: { kind: "STAFF", userId: U[tag]?.userId ?? "" }, locale: "th" });
  const P: Record<string, { id: string; optionId: string; title: string }> = {};
  const mkProduct = async (tag: string, unitId = uA, extra: Rec = {}): Promise<{ id: string; optionId: string; title: string }> => {
    const title = `ทดสอบ ${tag}`;
    const r = await call("createProduct", OA(), { unitId, slug: PSLUG(tag), productType: "TOUR", title: { th: title, en: `Test ${tag}` }, ...extra });
    okR(r, `createProduct ${tag}`);
    const o = await call("createOption", OA(), { unitId, productId: String(r.id), name: { th: "ร่วมกลุ่ม", en: "Join-in" }, durationMin: 480 });
    okR(o, `createOption ${tag}`);
    return { id: String(r.id), optionId: String(o.id), title };
  };
  const today0 = Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), now().getUTCDate());
  const depCount = { n: 0 };
  /** รอบ +days วัน เวลา 08:00 BKK (01:00Z) + นาที offMin · ค่าเริ่ม OPEN ความจุ 10 ขั้นต่ำ 5 */
  const mkDep = async (p: { id: string; optionId: string }, days: number, o: Rec = {}, unitId = uA, offMin = 0): Promise<string> => {
    const id = rid("dep");
    const start = new Date(today0 + days * DAY + HOUR + offMin * 60_000);
    await insertRow("TripDeparture", { id, tenantId: tA, unitId, productId: p.id, optionId: p.optionId, localDate: bkkYmd(start), startsAt: start, endsAt: new Date(start.getTime() + 8 * HOUR), status: "OPEN", capacity: 10, sold: 0, held: 0, reserved: 0, minPax: 5, updatedAt: now(), ...o });
    depCount.n++;
    return id;
  };
  const depRow = async (id: string) => (await q<{ status: string; version: number; sold: number; held: number; reserved: number; cancelReason: string | null }>(`SELECT status, version, sold, held, reserved, "cancelReason" FROM "TripDeparture" WHERE id = $1`, [id]))[0];
  const decide = (tag: string, input: Rec) => call("decideBelowMin", ctxOf(tag), { unitId: uA, ...input });
  try {
    P.p1 = await mkProduct("p1"); P.p2 = await mkProduct("p2"); P.p3 = await mkProduct("p3");
    P.a2 = await mkProduct("a2", uA2); P.l = await mkProduct("lim", uL); P.t = await mkProduct("tokyo", uT);
  } catch (e) { console.log(`  ⚠️ สร้างสินค้าทดสอบไม่ได้: ${errMsg(e)}`); }
  const needP = (...k: string[]) => ok(k.every((x) => P[x]?.id), `ไม่มีสินค้าทดสอบ ${k.join(",")} (${setupErr || "createProduct ล้ม"})`);

  // ═══════════════ DA. ตัดสินต่ำกว่าขั้นต่ำ ═══════════════
  console.log("\n── DA: decideBelowMin (ร้านชั่วคราว) ──");
  const DD = 3; // วันของรอบ DA
  const DA_IDS: Record<string, string> = {};
  await st("DA-1", "RUN (ออกขาดทุน) โดยผู้มี departure.status ⇒ GUARANTEED · event status_changed · audit trips.departure.status", async () => {
    needP("p1");
    const d = await mkDep(P.p1, DD);
    DA_IDS.run = d;
    okR(await decide("ds", { departureId: d, decision: "RUN" }), "RUN");
    eq((await depRow(d))?.status, "GUARANTEED", "สถานะ");
    eq((await q(`SELECT 1 FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'trips.departure.status_changed' AND "idempotencyKey" LIKE $2`, [tA, `%${d}%`])).length > 0, true, "event");
    eq((await q(`SELECT 1 FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.departure.status' AND "targetId" = $2`, [tA, d])).length > 0, true, "audit");
  });
  await st("DA-2", "ไม่ใช่ต่ำกว่าขั้นต่ำ ⇒ NOT_BELOW_MIN ไม่เปลี่ยน: ขายถึงขั้นต่ำ · ไม่มีขั้นต่ำ · GUARANTEED · CLOSED", async () => {
    needP("p1");
    const cases = [await mkDep(P.p1, DD, { sold: 6 }, uA, 10), await mkDep(P.p1, DD, { minPax: null }, uA, 20), await mkDep(P.p1, DD, { status: "GUARANTEED" }, uA, 30), await mkDep(P.p1, DD, { status: "CLOSED" }, uA, 40)];
    for (const d of cases) {
      const before = await depRow(d);
      codeR(await decide("ds", { departureId: d, decision: "RUN" }), "NOT_BELOW_MIN", d);
      eq((await depRow(d))?.version, before?.version, "version");
    }
  });
  await st("DA-3", "CANCEL + เหตุผล ⇒ CANCELLED · cancelReason · ปล่อยทรัพยากร · event trips.departure.cancelled", async () => {
    needP("p1");
    const d = await mkDep(P.p1, DD, {}, uA, 50);
    DA_IDS.cancel = d;
    const res = await call("createResource", OA(), { unitId: uA, kind: "BOAT", name: `เรือ DA3 ${STAMP}`, seats: 10 });
    okR(res, "createResource");
    okR(await call("assignResource", OA(), { unitId: uA, departureId: d, resourceId: String(res.id) }), "assign");
    okR(await decide("ds", { departureId: d, decision: "CANCEL", reason: "ไม่ถึงขั้นต่ำ" }), "CANCEL");
    const r = await depRow(d);
    eq([r?.status, r?.cancelReason], ["CANCELLED", "ไม่ถึงขั้นต่ำ"], "แถว");
    eq((await q(`SELECT 1 FROM "TripResourceUse" WHERE "departureId" = $1 AND active`, [d])).length, 0, "ทรัพยากรยังผูก");
    eq((await q(`SELECT 1 FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'trips.departure.cancelled' AND "idempotencyKey" LIKE $2`, [tA, `%${d}%`])).length, 1, "event");
  });
  await st("DA-4", "input ผิด ⇒ INVALID_INPUT ไม่เปลี่ยน: CANCEL ไม่มีเหตุผล · เหตุผล 2 ตัว · MERGE ไม่มีเป้า · RUN ส่งเป้า · decision แปลก · คีย์ tenantId", async () => {
    needP("p1");
    const d = await mkDep(P.p1, DD, {}, uA, 60);
    for (const bad of [{ decision: "CANCEL" }, { decision: "CANCEL", reason: "ab" }, { decision: "MERGE" }, { decision: "RUN", targetDepartureId: d }, { decision: "DELETE" }, { decision: "RUN", tenantId: tB }]) {
      codeR(await decide("ds", { departureId: d, ...bad }), "INVALID_INPUT", fmt(bad));
    }
    eq((await depRow(d))?.status, "OPEN", "สถานะ");
  });
  await st("DA-5", "CANCEL รอบที่มีคนถือที่ (held 2) ⇒ HAS_BOOKINGS (บริการ T0.3) ไม่เปลี่ยน", async () => {
    needP("p1");
    const d = await mkDep(P.p1, DD, { held: 2 }, uA, 70);
    codeR(await decide("ds", { departureId: d, decision: "CANCEL", reason: "ไม่ถึงขั้นต่ำ" }), "HAS_BOOKINGS", "held");
    const r = await depRow(d);
    eq([r?.status, r?.held], ["OPEN", 2], "แถว");
  });
  let TGT = "";
  await st("DA-6", "MERGE รอบที่มีคน (held 1) ⇒ MERGE_NEEDS_BOOKINGS · ทั้งสองรอบไม่เปลี่ยน · ไม่มีแถว TripHold/TripBooking เกิด", async () => {
    needP("p1", "p2");
    TGT = await mkDep(P.p2, DD + 2);
    const s = await mkDep(P.p1, DD + 2, { held: 1 });
    const [b1, b2] = [await depRow(s), await depRow(TGT)];
    codeR(await decide("ds", { departureId: s, decision: "MERGE", targetDepartureId: TGT }), "MERGE_NEEDS_BOOKINGS", "merge");
    eq([(await depRow(s))?.version, (await depRow(TGT))?.version], [b1?.version, b2?.version], "version");
    const n = await q<{ h: number; b: number }>(`SELECT (SELECT count(*)::int FROM "TripHold" WHERE "tenantId" = $1) h, (SELECT count(*)::int FROM "TripBooking" WHERE "tenantId" = $1) b`, [tA]);
    eq([n[0]?.h, n[0]?.b], [0, 0], "แถวการจอง/ถือ");
  });
  await st("DA-7", "MERGE รอบว่างเข้าพีพีวันเดียวกัน (ต่างสินค้า) ⇒ ต้นทางยกเลิก เหตุผลชี้ชื่อเป้า · เป้าไม่ถูกแตะ", async () => {
    needP("p1", "p2");
    ok(TGT, "ไม่มีเป้าจาก DA-6");
    const s = await mkDep(P.p1, DD + 2, {}, uA, 15);
    const bt = await depRow(TGT);
    const r = await decide("ds", { departureId: s, decision: "MERGE", targetDepartureId: TGT, reason: "ลูกค้าน้อย" });
    okR(r, "merge");
    const a = await depRow(s);
    eq(a?.status, "CANCELLED", "ต้นทาง");
    ok(String(a?.cancelReason ?? "").includes(P.p2.title), `เหตุผลไม่ชี้เป้า: ${a?.cancelReason}`);
    const t = await depRow(TGT);
    eq([t?.status, t?.version], [bt?.status, bt?.version], "เป้า");
  });
  await st("DA-8", "เป้าผิด ⇒ MERGE_TARGET_INVALID: ต่างวัน · ยกเลิกแล้ว · ตัวเอง · เต็ม · ปิดรับ", async () => {
    needP("p1", "p2", "p3");
    const s = await mkDep(P.p1, DD + 2, {}, uA, 25);
    const other = await mkDep(P.p2, DD + 4);
    const cancelled = await mkDep(P.p3, DD + 2, { status: "CANCELLED" });
    const full = await mkDep(P.p3, DD + 2, { sold: 10 }, uA, 30);
    const closed = await mkDep(P.p3, DD + 2, { status: "CLOSED" }, uA, 60);
    for (const t of [other, cancelled, s, full, closed]) codeR(await decide("ds", { departureId: s, decision: "MERGE", targetDepartureId: t }), "MERGE_TARGET_INVALID", t);
    eq((await depRow(s))?.status, "OPEN", "ต้นทางไม่เปลี่ยน");
  });
  await st("DA-9", "เป้าของหน่วยอื่น (A2) ⇒ NOT_FOUND · รอบต้นทางของหน่วยอื่นผ่านหน่วย A ⇒ NOT_FOUND", async () => {
    needP("p1", "a2");
    const s = await mkDep(P.p1, DD + 2, {}, uA, 35);
    const t2 = await mkDep(P.a2, DD + 2, {}, uA2);
    codeR(await decide("ds", { departureId: s, decision: "MERGE", targetDepartureId: t2 }), "NOT_FOUND", "เป้า A2");
    codeR(await decide("ds", { departureId: t2, decision: "RUN" }), "NOT_FOUND", "ต้นทาง A2");
  });
  await st("DA-10", "สิทธิ์: view-only ⇒ FORBIDDEN · edit (ไม่มี status) ⇒ FORBIDDEN · ไม่มีสิทธิ์ ⇒ FORBIDDEN · ร้าน B ⇒ NOT_FOUND · ไม่เปลี่ยน", async () => {
    needP("p1");
    const d = await mkDep(P.p1, DD, {}, uA, 80);
    for (const tag of ["dv", "de", "none"]) codeR(await decide(tag, { departureId: d, decision: "RUN" }), "FORBIDDEN", tag);
    codeR(await call("decideBelowMin", ctxOf("ob"), { unitId: uA, departureId: d, decision: "RUN" }), "NOT_FOUND", "ร้าน B");
    eq((await depRow(d))?.status, "OPEN", "สถานะ");
  });
  await st("DA-11", "รอบที่เริ่มแล้ว (ต่ำกว่าขั้นต่ำ) ⇒ NOT_BELOW_MIN หรือ PAST_DEPARTURE ไม่เปลี่ยน", async () => {
    needP("p1");
    const id = rid("dep");
    const start = new Date(Date.now() - 2 * HOUR);
    await insertRow("TripDeparture", { id, tenantId: tA, unitId: uA, productId: P.p1.id, optionId: P.p1.optionId, localDate: bkkYmd(start), startsAt: start, endsAt: new Date(start.getTime() + 8 * HOUR), status: "OPEN", capacity: 10, minPax: 5, updatedAt: now() });
    depCount.n++;
    codeR(await decide("ds", { departureId: id, decision: "RUN" }), ["NOT_BELOW_MIN", "PAST_DEPARTURE"], "เริ่มแล้ว");
    eq((await depRow(id))?.status, "OPEN", "สถานะ");
  });
  await st("DA-12", "พร้อมกัน 10 คำขอ CANCEL รอบเดียว ⇒ สำเร็จ 1 · ที่เหลือ NOT_BELOW_MIN|FORBIDDEN_TRANSITION|BAD_STATE|BUSY · event ยกเลิก 1", async () => {
    needP("p1");
    const d = await mkDep(P.p1, DD, {}, uA, 90);
    const rs = await Promise.all(Array.from({ length: 10 }, () => decide("ds", { departureId: d, decision: "CANCEL", reason: "ไม่ถึงขั้นต่ำ" }).catch((e: unknown) => ({ ok: false, code: `THROW ${errMsg(e)}` } as Rec))));
    eq(rs.filter((r) => r.ok === true).length, 1, "สำเร็จ");
    const okCodes = ["NOT_BELOW_MIN", "FORBIDDEN_TRANSITION", "BAD_STATE", "BUSY"];
    ok(rs.every((r) => r.ok === true || okCodes.includes(String(r.code))), `ผลแปลก ${fmt(rs.find((r) => r.ok !== true && !okCodes.includes(String(r.code))))}`);
    eq((await q(`SELECT 1 FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'trips.departure.cancelled' AND "idempotencyKey" LIKE $2`, [tA, `%${d}%`])).length, 1, "event");
  });
  await st("DA-13", "พร้อมกัน RUN ×5 + MERGE ×5 ⇒ ไม่ throw · สถานะสุดท้าย GUARANTEED หรือ CANCELLED · ตัวนับ 0 · เป้าไม่ถูกแตะ", async () => {
    needP("p1", "p2");
    const s = await mkDep(P.p1, DD + 5);
    const t = await mkDep(P.p2, DD + 5);
    const bt = await depRow(t);
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => decide("ds", i % 2 ? { departureId: s, decision: "RUN" } : { departureId: s, decision: "MERGE", targetDepartureId: t }).catch((e: unknown) => ({ ok: false, code: `THROW ${errMsg(e)}` } as Rec))));
    ok(!rs.some((r) => String(r.code ?? "").startsWith("THROW")), `throw: ${fmt(rs.find((r) => String(r.code ?? "").startsWith("THROW")))}`);
    ok(rs.some((r) => r.ok === true), "ไม่มีใครสำเร็จ");
    const a = await depRow(s);
    ok(["GUARANTEED", "CANCELLED"].includes(String(a?.status)), `สถานะ ${a?.status}`);
    eq([a?.sold, a?.held, a?.reserved, (await depRow(t))?.version], [0, 0, 0, bt?.version], "ตัวนับ/เป้า");
  });
  await st("DA-14", "ไม่ลบแถว: จำนวน TripDeparture ของร้านชั่วคราว = ที่สร้าง (หลังตัดสินครบทุกแบบ)", async () => {
    fn("decideBelowMin");
    eq((await q<{ n: number }>(`SELECT count(*)::int n FROM "TripDeparture" WHERE "tenantId" = $1`, [tA]))[0]?.n, depCount.n, "แถว");
  });
  await st("DA-15", "ปฏิทินสะท้อนผลตัดสิน: รอบที่ออกขาดทุน ⇒ GUARANTEED ไม่อยู่ใน decisions · รอบที่ยกเลิก ⇒ CANCELLED เหตุผล \"ไม่ถึงขั้นต่ำ\"", async () => {
    ok(DA_IDS.run && DA_IDS.cancel, "ไม่มีรอบจาก DA-1/DA-3");
    const r = await call("loadDepartureCalendarVM", OA(), { unitId: uA, view: "week", start: bkkYmd(new Date(today0 + DD * DAY + HOUR)) });
    okR(r, "cal");
    const v = asRec(r.vm) ?? {};
    eq([cellOf(v, DA_IDS.run).state, cellOf(v, DA_IDS.cancel).state, cellOf(v, DA_IDS.cancel).cancelReason], ["GUARANTEED", "CANCELLED", "ไม่ถึงขั้นต่ำ"], "ช่อง");
    ok(!asArr(v.decisions).some((x) => x.departureId === DA_IDS.run || x.departureId === DA_IDS.cancel), "ยังอยู่ใน decisions");
  });
  groupLine("DA");

  // ═══════════════ CT. ปฏิทิน/แผงบนร้านชั่วคราว ═══════════════
  console.log("\n── CT: ปฏิทิน/แผง (ร้านชั่วคราว) ──");
  const CD = 10;
  const ctStart = bkkYmd(new Date(today0 + CD * DAY + HOUR));
  const D: Record<string, string> = {};
  try {
    needP("p1", "p2", "p3");
    D.f1 = await mkDep(P.p3, CD, { sold: 6, held: 2, reserved: 2, minPax: null });
    D.f2 = await mkDep(P.p3, CD, { status: "FULL", sold: 5, minPax: null }, uA, 120);
    D.l1 = await mkDep(P.p2, CD + 1, { sold: 5, minPax: null });
    D.l2 = await mkDep(P.p2, CD + 1, { sold: 8, minPax: null }, uA, 120);
    D.w = await mkDep(P.p1, CD + 2, { minPax: null });
    D.w2 = await mkDep(P.p2, CD + 2, { minPax: null });
  } catch (e) { console.log(`  ⚠️ สร้างรอบ CT ไม่ได้: ${errMsg(e)}`); }
  const needD = (...k: string[]) => ok(k.every((x) => D[x]), `ไม่มีรอบ CT ${k.join(",")}`);
  const ctCal = async (tag = "oa", extra: Rec = {}) => { const r = await call("loadDepartureCalendarVM", ctxOf(tag), { unitId: uA, view: "week", start: ctStart, ...extra }); okR(r, `cal ${tag}`); return asRec(r.vm) ?? {}; };
  const ctPanel = async (tag: string, id: string) => { const r = await call("loadDeparturePanelVM", ctxOf(tag), { unitId: uA, departureId: id }); okR(r, `panel ${tag}`); return asRec(r.vm) ?? {}; };
  await st("CT-1", "เต็มจากตัวนับ: OPEN 6 ขาย + 2 ถือ + 2 โควตา /10 ⇒ FULL ว่าง 0 used 8 · สถานะ FULL แต่ 5/10 ⇒ ไม่ FULL ว่าง 5", async () => {
    needD("f1", "f2");
    const v = await ctCal();
    const a = cellOf(v, D.f1), b = cellOf(v, D.f2);
    eq([a.state, a.seatsLeft, a.used], ["FULL", 0, 8], "f1");
    ok(b.state !== "FULL" && b.seatsLeft === 5, `f2 ${fmt(b)}`);
  });
  await st("CT-2", "เหลือ N จากค่าตั้ง trips.public.showLeftAtOrBelow: ค่าเริ่ม ⇒ เหลือ 5 = LOW · ตั้งหน่วย = 2 ⇒ เหลือ 5 = OPEN · เหลือ 2 = LOW", async () => {
    needD("l1", "l2");
    eq(cellOf(await ctCal(), D.l1).state, "LOW", "ค่าเริ่ม");
    const a = U.oa;
    const r = asRec(await S("setSettings")({ role: a.role, unitAccess: a.unitAccess, permissions: a.permissions, userId: a.userId }, { tenantId: tA }, [{ key: "trips.public.showLeftAtOrBelow", scope: "UNIT", scopeId: uA, value: 2 }], { ackLegalWarn: true })) ?? {};
    okR(r, "setSettings");
    const v = await ctCal();
    eq([cellOf(v, D.l1).state, cellOf(v, D.l2).state], ["OPEN", "LOW"], "หลังตั้ง 2");
  });
  await st("CT-3", "รายการรอ: WAITING 2 + OFFERED 1 (+ CANCELLED 5 ไม่นับ) ⇒ ช่อง waitlist 3 · แผง waitlistWaiting 2 waitlistOffered 1", async () => {
    needD("f1");
    for (const [status, qty] of [["WAITING", 2], ["OFFERED", 1], ["CANCELLED", 5]] as const) await insertRow("TripWaitlist", { tenantId: tA, unitId: uA, departureId: D.f1, qty, status, updatedAt: now() });
    eq(cellOf(await ctCal(), D.f1).waitlist, 3, "ช่อง");
    const c = asRec((await ctPanel("oa", D.f1)).counts) ?? {};
    eq([c.waitlistWaiting, c.waitlistOffered], [2, 1], "แผง");
  });
  await st("CT-4", "เขตเวลาหน่วย Asia/Tokyo: วันนี้/วันที่รอบ/เวลา ตาม tz (07:00 JST = 22:00Z วันก่อน) · today จาก tz", async () => {
    needP("t");
    const Dd = ymd(new Date(today0 + 5 * DAY));
    const base = Date.parse(`${Dd}T00:00:00.000Z`);
    const id = rid("dep");
    const start = new Date(base - 2 * HOUR);
    await insertRow("TripDeparture", { id, tenantId: tA, unitId: uT, productId: P.t.id, optionId: P.t.optionId, localDate: Dd, startsAt: start, endsAt: new Date(start.getTime() + 8 * HOUR), status: "OPEN", capacity: 10, updatedAt: now() });
    depCount.n++;
    const r = await call("loadDepartureCalendarVM", OA(), { unitId: uT, view: "week", start: addDays(Dd, -1) }, { now: new Date(base - 8.5 * HOUR) });
    okR(r, "cal tokyo");
    const v = asRec(r.vm) ?? {};
    const c = cellOf(v, id);
    eq([asRec(v.unit)?.tz, asRec(v.unit)?.today, c.localDate, c.timeText], ["Asia/Tokyo", Dd, Dd, "07:00–15:00"], "tz");
  });
  await st("CT-5", "เพดานรอบ: หน่วยที่มี TRIPS_CALENDAR_DEPARTURE_CAP + 6 รอบในสัปดาห์ ⇒ truncated · shown ≤ cap · ช่อง = shown · total > cap · shownUntil อยู่ในช่วง", async () => {
    needP("l");
    const cap = Number(needTrips().TRIPS_CALENDAR_DEPARTURE_CAP);
    ok(Number.isInteger(cap) && cap >= 100 && cap <= 1000, `cap ${cap}`);
    const pcap = Number(needTrips().TRIPS_CALENDAR_PRODUCT_CAP);
    ok(Number.isInteger(pcap) && pcap >= 10 && pcap <= 500, `product cap ${pcap}`);
    const tpl = await mkDep(P.l, 20, { minPax: null }, uL);
    const names = (await cols("TripDeparture")).map((c) => c.column_name);
    const expr = names.map((c) => c === "id" ? `'t12qcb_' || $2 || '_' || g` : c === "localDate" ? `t."localDate" + (g % 7)` : c === "startsAt" || c === "endsAt" ? `t."${c}" + make_interval(days => g % 7, mins => g / 7)` : `t."${c}"`);
    await pool.query(`INSERT INTO "TripDeparture" (${names.map((c) => `"${c}"`).join(", ")}) SELECT ${expr.join(", ")} FROM "TripDeparture" t, generate_series(1, $3::int) g WHERE t.id = $1`, [tpl, STAMP, cap + 5]);
    depCount.n += cap + 5;
    const lStart = (await q<{ d: string }>(`SELECT "localDate"::text d FROM "TripDeparture" WHERE id = $1`, [tpl]))[0]?.d ?? "";
    const r = await call("loadDepartureCalendarVM", OA(), { unitId: uL, view: "week", start: lStart });
    okR(r, "cal lim");
    const v = asRec(r.vm) ?? {};
    const shown = Number(v.shown);
    ok(v.truncated === true && shown <= cap && shown > 0 && asArr(v.cells).length === shown && Number(v.total) > cap, `ไม่ตัด: ${fmt({ truncated: v.truncated, shown, total: v.total, cells: asArr(v.cells).length })}`);
    ok(typeof v.shownUntil === "string" && String(v.shownUntil) >= lStart && String(v.shownUntil) < addDays(lStart, 7), `shownUntil ${fmt(v.shownUntil)}`);
  });
  await st("CT-6", "สินค้า ARCHIVED ไม่อยู่ในแถว และรอบของมันไม่อยู่ในช่อง", async () => {
    needP("p1");
    const ar = await mkProduct("arch");
    const dA = await mkDep(ar, CD);
    await pool.query(`UPDATE "TripProduct" SET status = 'ARCHIVED' WHERE id = $1 AND "tenantId" = $2`, [ar.id, tA]);
    const v = await ctCal();
    ok(!asArr(v.products).some((p) => p.id === ar.id) && !asArr(v.cells).some((c) => c.departureId === dA), "ยังเห็นสินค้าที่เก็บ");
  });
  await st("CT-7", "สิทธิ์ในจอ: view-only ⇒ flags false · แผงไม่มีปุ่ม · price null · product.view เห็นราคาแก้ไม่ได้ · price.edit แก้ได้", async () => {
    needD("w");
    const f = asRec((await ctCal("dv")).flags) ?? {};
    eq([f.canEdit, f.canStatus, f.canPrice, f.canSeePrices], [false, false, false, false], "flags dv");
    const pdv = await ctPanel("dv", D.w);
    eq([actOf(pdv), pdv.price], [allFalse, null], "แผง dv");
    eq(asRec((await ctPanel("pv", D.w)).price)?.canEdit, false, "pv");
    eq(asRec((await ctPanel("pe", D.w)).price)?.canEdit, true, "pe");
    const a = actOf(await ctPanel("de", D.w));
    eq([a.capacity, a.resources, a.stopSell, a.close, a.cancel, a.run], [true, true, true, false, false, false], "de");
  });
  await st("CT-8", "ไม่มีสิทธิ์รอบ (product.view อย่างเดียว / ไม่มีเลย) ⇒ ตัวโหลด 3 ตัว FORBIDDEN · tripsPageGate departures FORBIDDEN", async () => {
    needD("w");
    for (const tag of ["pvo", "none"]) {
      codeR(await call("loadDepartureCalendarVM", ctxOf(tag), { unitId: uA }), "FORBIDDEN", `${tag} cal`);
      codeR(await call("loadDeparturePanelVM", ctxOf(tag), { unitId: uA, departureId: D.w }), "FORBIDDEN", `${tag} panel`);
      codeR(await call("loadDepartureSchedulesVM", ctxOf(tag), { unitId: uA }), "FORBIDDEN", `${tag} schedules`);
    }
    codeR(await call("tripsPageGate", ctxOf("pvo"), { unitId: uA, page: "departures" }), "FORBIDDEN", "gate pvo");
    okR(await call("tripsPageGate", ctxOf("dv"), { unitId: uA, page: "departures" }), "gate dv");
  });
  await st("CT-9", "แยกร้าน/หน่วย: ร้าน B ⇒ NOT_FOUND · ผู้ใช้ A2 เปิดหน่วย A ⇒ NOT_FOUND · รอบของ A2 ผ่านหน่วย A ⇒ NOT_FOUND · หน่วย BOOKING ⇒ UNIT_NOT_TRIPS|NOT_FOUND", async () => {
    needP("a2");
    codeR(await call("loadDepartureCalendarVM", ctxOf("ob"), { unitId: uA }), "NOT_FOUND", "ร้าน B");
    codeR(await call("loadDepartureCalendarVM", ctxOf("a2"), { unitId: uA }), "NOT_FOUND", "a2");
    const t2 = await mkDep(P.a2, CD, {}, uA2);
    codeR(await call("loadDeparturePanelVM", OA(), { unitId: uA, departureId: t2 }), "NOT_FOUND", "รอบ A2");
    codeR(await call("loadDepartureCalendarVM", OA(), { unitId: uBk }), ["UNIT_NOT_TRIPS", "NOT_FOUND"], "BOOKING");
  });
  await st("CT-10", "ความจุผ่านบริการ: ลดต่ำกว่าที่ใช้ ⇒ CAPACITY_BELOW_USED · เพิ่มเป็น 12 ⇒ แผง capacity 12 ว่าง 2", async () => {
    needD("f1");
    codeR(await call("setDepartureCapacity", OA(), { unitId: uA, departureId: D.f1, capacity: 5 }), "CAPACITY_BELOW_USED", "ลด");
    okR(await call("setDepartureCapacity", OA(), { unitId: uA, departureId: D.f1, capacity: 12 }), "เพิ่ม");
    const c = asRec((await ctPanel("oa", D.f1)).counts) ?? {};
    eq([c.capacity, c.seatsLeft], [12, 2], "แผง");
  });
  let BOAT = "";
  await st("CT-11", "ความจุเกินที่นั่งเรือ ⇒ warnings CAPACITY_OVER_SEATS (เรือ 8 ที่ · ความจุ 10) · ไม่บล็อก", async () => {
    needD("w");
    const r = await call("createResource", OA(), { unitId: uA, kind: "BOAT", name: `เรือ CT ${STAMP}`, seats: 8 });
    okR(r, "createResource");
    BOAT = String(r.id);
    okR(await call("assignResource", OA(), { unitId: uA, departureId: D.w, resourceId: BOAT }), "assign");
    const w = asArr((await ctPanel("oa", D.w)).warnings);
    ok(w.some((x) => x.code === "CAPACITY_OVER_SEATS" && x.seats === 8), `warnings ${fmt(w)}`);
  });
  await st("CT-12", "เรือชนรอบอื่นเวลาเดียวกัน ⇒ RESOURCE_CLASH พร้อม conflict.departureId (ข้อมูลที่กล่องเปลี่ยนเรือแสดง)", async () => {
    needD("w", "w2");
    ok(BOAT, "ไม่มีเรือจาก CT-11");
    const r = await call("assignResource", OA(), { unitId: uA, departureId: D.w2, resourceId: BOAT });
    codeR(r, "RESOURCE_CLASH", "ชน");
    eq(asRec(r.conflict)?.departureId, D.w, "conflict");
  });
  await st("CT-13", "ราคาเฉพาะรอบผ่าน setPrice/removePrice (T0.5): ตั้ง 1,234 ⇒ แผง ADULT source DEPARTURE · ลบ (เหตุผล) ⇒ ไม่ใช่ DEPARTURE", async () => {
    needD("w");
    const adult = (await q<{ id: string }>(`SELECT id FROM "TripPaxType" WHERE "productId" = $1 AND code = 'ADULT'`, [P.p1.id]))[0]?.id;
    ok(adult, "ไม่มีประเภทคน ADULT");
    const r = asRec(await fn("setPrice")(sellCtx(uA, "pe"), { productId: P.p1.id, paxTypeId: adult, departureId: D.w, currency: "THB", amountMinor: 123_400 })) ?? {};
    okR(r, "setPrice");
    const priceId = String(asRec(r.value)?.id ?? "");
    const row = asArr(asRec((await ctPanel("pe", D.w)).price)?.rows).find((x) => x.code === "ADULT") ?? {};
    eq([row.satang, row.source, row.departurePriceId], [123_400, "DEPARTURE", priceId], "หลังตั้ง");
    okR(asRec(await fn("removePrice")(sellCtx(uA, "pe"), { id: priceId, reason: "ทดสอบลบราคารอบ" })) ?? {}, "removePrice");
    const after = asArr(asRec((await ctPanel("pe", D.w)).price)?.rows).find((x) => x.code === "ADULT") ?? {};
    ok(after.source !== "DEPARTURE" && after.departurePriceId === null, `หลังลบ ${fmt(after)}`);
  });
  await st("CT-14", "กฎซ้ำ: createSchedule WEEKLY [1,3] 08:00 ⇒ loadDepartureSchedulesVM มีแถว (timeText 08:00 · paused false) · pauseSchedule ⇒ paused true", async () => {
    needP("p2");
    const from = ymd(new Date(today0 + 40 * DAY));
    const r = await call("createSchedule", OA(), { unitId: uA, productId: P.p2.id, optionId: P.p2.optionId, rule: { kind: "WEEKLY", weekdays: [1, 3] }, departTimeMin: 480, capacity: 10, dateFrom: from, dateTo: addDays(from, 20) });
    okR(r, "createSchedule");
    const sid = String(r.id);
    const vm1 = asRec((await call("loadDepartureSchedulesVM", OA(), { unitId: uA })).vm) ?? {};
    const it = asArr(vm1.items).find((x) => x.scheduleId === sid) ?? {};
    eq([it.productId, it.timeText, it.weekdays, it.paused, vm1.canEdit], [P.p2.id, "08:00", [1, 3], false, true], "แถว");
    okR(await call("pauseSchedule", OA(), { unitId: uA, scheduleId: sid }), "pause");
    const vm2 = asRec((await call("loadDepartureSchedulesVM", OA(), { unitId: uA })).vm) ?? {};
    eq(asArr(vm2.items).find((x) => x.scheduleId === sid)?.paused, true, "หลังพัก");
    eq(asRec((await call("loadDepartureSchedulesVM", ctxOf("dv"), { unitId: uA })).vm)?.canEdit, false, "dv canEdit");
  });
  await st("CT-15", "แถบนำทาง: loadTripsNav เจ้าของร้าน seed ⇒ departures available true · visible true", async () => {
    const r = await call("loadTripsNav", SEED, { unitId: U0 });
    okR(r, "nav");
    const e = asArr(asRec(r.nav)?.entries).find((x) => x.key === "departures");
    eq([e?.available, e?.visible, e?.href], [true, true, `/app/u/${DIVE_TRIPS_UNIT.slug}/trips/departures`], "departures");
  });
  await st("CT-16", "หยุดขายบางช่องทาง (setDepartureStopSell ของ T0.3): ปิดเว็บ ⇒ แผง stopSellInfo WEB + เหตุผล · ช่อง stopSell true · ล้าง ⇒ null/false", async () => {
    needD("l1");
    okR(await call("setDepartureStopSell", OA(), { unitId: uA, departureId: D.l1, stopSell: { channels: ["WEB"], reason: "ปิดเว็บชั่วคราว" } }), "ตั้ง");
    const si = asRec(asRec((await ctPanel("oa", D.l1)).departure)?.stopSellInfo) ?? {};
    eq([si.channels, si.reason, cellOf(await ctCal(), D.l1).stopSell], [["WEB"], "ปิดเว็บชั่วคราว", true], "หลังตั้ง");
    okR(await call("setDepartureStopSell", OA(), { unitId: uA, departureId: D.l1, stopSell: null }), "ล้าง");
    eq([asRec((await ctPanel("oa", D.l1)).departure)?.stopSellInfo, cellOf(await ctCal(), D.l1).stopSell], [null, false], "หลังล้าง");
  });
  groupLine("CT");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

console.log(`\nเหลือให้ด่านภาพ (ผู้คุม · scripts/visual-trips.mts t1.2 + parity-trips.sh 11): ตาราง+แผงที่ 1440 ในเปลือกแอปไม่อัด · ตัวเลข §10 · รูปทรงสถานะ 5 แบบ · ปุ่มแผง 2 คอลัมน์ · กล่องตัดสิน/ราคารอบ · 390 ไม่มีตาราง 7 คอลัมน์ ไม่ล้น · ตัวอักษร ≥ 14 · ปุ่ม ≥ 44 px · ไม่มีรหัสดิบ`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T1.2 · ปฏิทินรอบและที่ว่าง · แผงรอบ · ต่ำกว่าขั้นต่ำ =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
