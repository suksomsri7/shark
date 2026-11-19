// QC — TRIPS T1.7a · ต้นทุนรอบ · กำไรขั้นต้น · รายงาน (ยอดขาย · อัตราเต็ม · ระยะจองล่วงหน้า · ช่องทาง) · การ์ดเงินแผงรอบ · CSV (ภาพ 11 :56–:57)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/T1.7.md (T1.7 แยก a/m — ไฟล์นี้ = T1.7a ไม่มี migration) · สัญญา ledger/TRIPS-CORE-CONTRACT.md §G §H · ภาพ ledger/design-trips/11-departures-calendar.*
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน · พิสูจน์ฟิกซ์เจอร์ด้วยการคิดซ้ำจากแถวดิบ)   S ไฟล์/กติกาโค้ด (static)   P ตัวช่วยบริสุทธิ์ report-core (สูตรถึงสตางค์)
//   CT บริการต้นทุน (ร้านชั่วคราว): สิทธิ์ · token/CAS · ส่งซ้ำ · พร้อมกัน 10 ทาง · อินพุตอันตราย · แยกหน่วย/ร้าน · audit
//   RP รายงาน (ร้านชั่วคราว · now ฉีด): ตัวเลขภาพ 11 · รวมเดือน · อัตราเต็ม · ระยะจอง · ช่องทาง · ช่วงเวลา · ฐานวันจอง · ตัวกรอง · สิทธิ์ · เขตเวลา · seed อ่านอย่างเดียว
//   PN การ์ดเงินแผงรอบ (loadDeparturePanelVM.money · departureMoneySummary)   EX ส่งออก CSV   X ช่วงใหญ่ (2,050 รอบ) · ข้ามร้าน/หน่วย
//
// 🔴 ที่ตรวจไม่ได้ที่นี่ (ไม่มี server/เบราว์เซอร์) = ด่านภาพ + กดจริงผ่าน Next ของผู้คุม (scripts/visual-trips.mts t1.7)
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t17-*` (ผู้ใช้ `trips-t17-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ร้าน seed อ่านอย่างเดียว (ค่าคาดหวังของ seed คิดซ้ำจากแถวดิบ ไม่ตรึงเลข)
// 🔴 นาฬิกา: บริการได้ `now` ที่ฉีด (NOW_R + ช่วงห่าง) เท่านั้น · ข้อสอบไม่เทียบกับนาฬิกาฐานข้อมูล · createdAt ของการจองฝังค่าตายตัว
// 🔴 ยังไม่มีโมดูล/ฟังก์ชัน = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception · ห้ามรันพร้อมข้อสอบ TRIPS อื่นบนฐานเดียวกัน
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t1.7.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน T1.7a: PC เขียว · S-11 (ฉากภาพที่ผู้เขียนใส่) เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";
import { fromMainMerge, TRIPS_MAIN_MERGE_SHA } from "./trips-main-merge.mjs";

const LABEL = "qc-trips-t1.7";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t1.4) ═══════════════
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
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t17qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const SLUG = "trips-t17-";
const EMAIL_PREFIX = "trips-t17-";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
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
/** ปัดครึ่งออกจากศูนย์ แบบ money-math divHalfUp (คิดซ้ำอิสระด้วย BigInt) */
const Z = BigInt(0), TWO = BigInt(2);
const halfUp = (num: bigint, den: bigint): number => { const neg = (num < Z) !== (den < Z); const a = num < Z ? -num : num; const b = den < Z ? -den : den; const q = (TWO * a + b) / (TWO * b); return Number(neg ? -q : q); };
const vatIncl = (x: number) => halfUp(BigInt(x) * BigInt(700), BigInt(10_700));

// ═══════════════ สเปก (ใบสั่ง T1.7 · ส่วน a) ═══════════════
const BASE_SHA = "c3650f79c99ee4d5a27144f78086bea52f700fe6"; // wip/trips-t1.7 = session/trips ตอนเขียนใบสั่ง (รวม origin/main แล้ว · T0.4d รับแล้ว)
const APP = "src/app/app/u/[unitSlug]/trips";
const COST_PAGE = `${APP}/departures/[departureId]/costs/page.tsx`;
const REPORT_PAGE = `${APP}/reports/page.tsx`;
const MOD = "src/lib/modules/trips/";
const PURE = MOD + "report-core.ts";
const COSTS = MOD + "costs.ts";
const REPORTS = MOD + "reports.ts";
const ACTIONS = MOD + "report-actions.ts";
const OWN_MOD = [PURE, COSTS, REPORTS, ACTIONS];
const COMP = "src/components/trips";
const PANEL = `${COMP}/DeparturePanel.tsx`;
const DEPSCREEN = `${COMP}/DeparturesScreen.tsx`;
const PERMS = "src/lib/core/permissions.ts";
const FACADE_FNS = ["loadDepartureCostsVM", "saveDepartureCosts", "loadTripReportVM", "exportTripReportCsv", "departureMoneySummary",
  "bookingMoneyOf", "sumMoney", "profitOf", "loadFactorBp", "leadDaysOf", "leadBucketOf", "periodKeyOf", "reportRangeOf", "reportGroupOf", "channelGroupOf", "departureReportStateOf",
  "parseCostRows", "costContentKey", "reportCsv", "reportFileName"];
const FACADE_CONSTS = ["TRIP_COST_KINDS", "TRIP_COST_ROWS_MAX", "TRIP_COST_AMOUNT_MAX", "TRIP_COST_NOTE_MAX", "REPORT_LIVE_STATUSES", "REPORT_PENDING_STATUSES", "REPORT_TABS", "REPORT_GROUPS", "REPORT_BASES",
  "REPORT_RANGE_MAX_DAYS", "REPORT_PAGE_SIZE", "REPORT_PAGE_MAX", "TRIPS_REPORT_CSV_CAP", "LEAD_BUCKETS", "CHANNEL_GROUPS", "REPORT_CSV_COLUMNS", "REPORT_CSV_COST_COLUMNS", "DEPARTURE_REPORT_STATES"];
const COST_KINDS = ["BOAT", "FUEL", "GUIDE", "FOOD", "PARK_FEE", "TRANSPORT", "EQUIPMENT", "OTHER"];
const LIVE = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
const TABS = ["sales", "load", "lead", "channel"];
const GROUPS = ["day", "week", "month"];
const BASES = ["travel", "booked"];
const LEAD_KEYS = ["D0", "D1_2", "D3_7", "D8_14", "D15_30", "D31_60", "D61P"];
const DEP_STATES = ["UPCOMING", "ENDED_NOT_CLOSED", "CLOSED", "CANCELLED"];
const CSV_COLS = ["date", "product", "option", "state", "capacity", "sold", "loadFactorPct", "bookings", "cancelledBookings", "sales", "passThrough", "vat", "revenueExVat", "collected", "outstanding", "commission", "cost", "grossProfit", "marginPct"];
const CSV_COST_COLS = ["commission", "cost", "grossProfit", "marginPct"];
const WARN_CODES = ["PARK_FEE_WITH_PASS_THROUGH", "SUPPLIER_COSTS_NOT_INCLUDED", "SNAPSHOT_FALLBACK", "FX_BOOKINGS"];
const NEW_PERMS = ["trips.report.view", "trips.cost.view", "trips.cost.edit"];
const COST_KEY_RE = /^(commission\w*|cost\w*|grossProfit\w*|margin\w*|netAfterCommission\w*|perSeat\w*|byKind)$/;
const TESTIDS_FIXED = ["trips-dep-money", "trips-dep-money-detail", "trips-dep-money-estimate", "trips-dep-costs", "trips-dep-reports", "trips-cost", "trips-cost-back", "trips-cost-title", "trips-cost-state",
  "trips-cost-kpis", "trips-cost-kpi-sales", "trips-cost-kpi-revenue", "trips-cost-kpi-commission", "trips-cost-kpi-cost", "trips-cost-kpi-profit", "trips-cost-kpi-load", "trips-cost-breakdown", "trips-cost-editor",
  "trips-cost-rows", "trips-cost-add", "trips-cost-save", "trips-cost-conflict", "trips-cost-error", "trips-cost-vat-note", "trips-cost-channels", "trips-rp", "trips-rp-title", "trips-rp-from", "trips-rp-to",
  "trips-rp-preset-month", "trips-rp-preset-last30", "trips-rp-preset-next30", "trips-rp-basis", "trips-rp-product", "trips-rp-channel", "trips-rp-apply", "trips-rp-export", "trips-rp-export-error",
  "trips-rp-tab-sales", "trips-rp-tab-load", "trips-rp-tab-lead", "trips-rp-tab-channel", "trips-rp-estimate-note", "trips-rp-accounting-note", "trips-rp-basis-note", "trips-rp-fx-note", "trips-rp-range-error",
  "trips-rp-kpis", "trips-rp-sales", "trips-rp-load", "trips-rp-lead", "trips-rp-channel", "trips-rp-deps", "trips-rp-empty", "trips-rp-page-prev", "trips-rp-page-next"];
const TESTID_PATTERNS = ["trips-cost-row-", "trips-cost-remove-", "trips-cost-warn-", "trips-rp-period-", "trips-rp-load-", "trips-rp-lead-", "trips-rp-chgroup-", "trips-rp-ch-", "trips-rp-dep-"];
const I18N_REQUIRED = [
  "costs.title", "costs.back", ...COST_KINDS.map((k) => `costs.kind.${k}`), ...DEP_STATES.map((k) => `costs.state.${k}`),
  ...["sales", "revenue", "commission", "cost", "perSeat", "profit", "load"].map((k) => `costs.kpi.${k}`),
  ...["sales", "vat", "revenue", "commission", "cost", "profit", "passThrough", "collected", "outstanding"].map((k) => `costs.breakdown.${k}`),
  ...["kind", "amount", "note", "add", "remove", "save", "saved", "limit", "vatNote", "reload"].map((k) => `costs.editor.${k}`),
  "costs.conflict", "costs.empty", "costs.readOnly", "costs.channels.title", ...WARN_CODES.map((k) => `costs.warn.${k}`),
  "report.title", ...TABS.map((k) => `report.tab.${k}`), ...BASES.map((k) => `report.basis.${k}`), ...GROUPS.map((k) => `report.group.${k}`),
  ...["from", "to", "product", "channel", "allProducts", "allChannels", "apply", "export"].map((k) => `report.filter.${k}`), ...["month", "last30", "next30"].map((k) => `report.preset.${k}`),
  ...["sales", "revenue", "passThrough", "commission", "cost", "profit", "margin", "load", "departures", "bookings", "seats"].map((k) => `report.kpi.${k}`),
  ...LEAD_KEYS.map((k) => `report.lead.${k}`), "report.lead.median", ...["DIRECT", "AGENT", "OTHER"].map((k) => `report.chgroup.${k}`),
  ...["estimate", "accounting", "basis", "fx", "range"].map((k) => `report.note.${k}`), "report.empty", "report.page", ...CSV_COLS.map((k) => `report.csv.${k}`), "report.csv.truncated", "report.export.error",
  ...["sales", "detail", "estimate", "noCost", "costs"].map((k) => `departures.money.${k}`), "departures.actions.reports",
  ...["COST_ROWS_LIMIT", "COST_AMOUNT_INVALID", "RANGE_TOO_LARGE", "STATE_CONFLICT"].map((k) => `errors.${k}`),
];
const RAW_CODES = new Set([...DEP_STATES, ...LEAD_KEYS, ...COST_KINDS, "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "CHAT_AI", "COUNTER", "PER_PAX", "LIVE", "EXCLUDED", ...WARN_CODES]);
const VISUAL_SCENES = ["panel-money", "departure-costs", "reports-sales", "reports-load", "reports-lead", "reports-channel"];
/** ไฟล์เดิมที่แก้ได้แบบจำกัด: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด (null = ไม่จำกัด)] */
const LIMITED: [string, number, number | null][] = [[MOD + "index.ts", 0, null], [MOD + "departure-screens.ts", 3, 30], [PANEL, 8, 50], [DEPSCREEN, 2, 12], [`${COMP}/ProductsScreenParts.tsx`, 3, null],
  [PERMS, 0, 6], ["src/messages/th/trips.json", 2, null], ["src/messages/en/trips.json", 2, null], ["scripts/trips-ui-inventory.json", 4, null], ["scripts/visual-trips.mts", 12, null], ["scripts/parity-trips.sh", 4, null]];
const LIMITED_SET = new Set(LIMITED.map(([f]) => f));
// seed / ภาพ 11
const DIVE_TENANT = FX.SHOP_DIVE.tenant.id;
const U0 = FX.SHOP_DIVE.units.trips.id;
const SEED = { tenantId: DIVE_TENANT, actorUserId: "tripsqc-user-dive-owner" };
const AS_OF = new Date(FX.TRIPS_AS_OF);
const R14 = FX.DEPARTURE_RACHA_1114;
// ร้านชั่วคราว · นาฬิกาฉีด
const NOW_R = new Date("2027-04-15T05:00:00.000Z"); // หลังรอบ 10–12 เม.ย. จบ · ก่อนรอบ 20 เม.ย.
const APR = { from: "2027-04-01", to: "2027-04-30" };
const ADULT = 350_000, CHILD = 245_000, PARK_A = 60_000, PARK_C = 30_000;

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 30 });
const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const needTable = async (t: string) => { if ((await cols(t)).length === 0) throw new AssertFail(`ยังไม่มีตาราง ${t}`); };
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1] ?? ""); if (l.length) return l; }
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
    if (t === "USER-DEFINED") { v[c.column_name] = (await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid WHERE ty.typname = $1 ORDER BY e.enumsortorder LIMIT 1`, [c.udt_name]))[0]?.l ?? null; continue; }
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
const tenantIds: string[] = [];
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
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.7a ยังไม่สร้าง)`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };
  const pure = (name: string, ...a: unknown[]): unknown => fn(name)(...a);
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const VM = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.vm) ?? {}; };
  const codeR = (r: Rec, codes: string | string[], what: string) => { const cs = Array.isArray(codes) ? codes : [codes]; ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`); };
  const constOf = (name: string): unknown => { const v = needTrips()[name]; if (v === undefined) throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.7a ยังไม่สร้าง)`); return v; };
  /** สแกนทั้งต้นไม้: คีย์ต้นทุน/คอมฯ/กำไรต้องเป็น null (หรือไม่มี) */
  const costLeaks = (v: unknown, path = "vm"): string[] => {
    if (Array.isArray(v)) return v.flatMap((x, i) => costLeaks(x, `${path}[${i}]`));
    const r = asRec(v); if (!r) return [];
    return Object.entries(r).flatMap(([k, x]) => (COST_KEY_RE.test(k) && x !== null && x !== undefined && !(Array.isArray(x) && x.length === 0) && typeof x !== "boolean" ? [`${path}.${k}=${fmt(x)}`] : costLeaks(x, `${path}.${k}`)));
  };

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "ฟิกซ์เจอร์ภาพ 11: ยอดจอง 50,400 = 13×3,500 + 2×2,450 · อุทยาน 8,400 = 13×600 + 2×300 · คอมฯ 4,095 = PTD 3,150 + Blue Planet 945 · กำไร (ภาพ · รวม VAT) 24,805 = 50,400 − 21,500 − 4,095", () => {
    eq([R14.adults, R14.children, R14.capacity, R14.sold], [13, 2, 24, 15], "คน/ความจุ");
    eq(13 * ADULT + 2 * CHILD, R14.revenueSatang, "ยอดจอง"); eq(13 * PARK_A + 2 * PARK_C, R14.parkSatang, "อุทยาน");
    eq(R14.commission.ptdSatang + R14.commission.bluePlanetSatang, R14.commission.totalSatang, "คอมฯ");
    eq(R14.revenueSatang - R14.commission.totalSatang - R14.costSatang, R14.grossProfitSatang, "กำไรภาพ");
    eq([R14.revenueSatang, R14.parkSatang, R14.commission.totalSatang, R14.costSatang, R14.grossProfitSatang], [5_040_000, 840_000, 409_500, 2_150_000, 2_480_500], "ค่าภาพ");
  });
  await st("PC-2", "คิดซ้ำอิสระ: VAT รวมราคา 7% ต่อการจอง (ปัดครึ่งออกจากศูนย์) รวม 329,718 · ก่อน VAT 4,710,282 · กำไรก่อน VAT 2,150,782 · ส่วนต่างกับภาพ = VAT พอดี · มาร์จิน 4566 bp · อัตราเต็ม 15/24 = 6250", () => {
    const per = [945_000, 700_000, 1_400_000, 700_000, 945_000, 350_000].map(vatIncl);
    eq(per, [61_822, 45_794, 91_589, 45_794, 61_822, 22_897], "VAT ต่อการจอง");
    const vat = per.reduce((a, b) => a + b, 0);
    eq(vat, 329_718, "VAT รวม");
    const rev = R14.revenueSatang - vat; eq(rev, 4_710_282, "ก่อน VAT");
    const gp = rev - R14.commission.totalSatang - R14.costSatang; eq(gp, 2_150_782, "กำไรก่อน VAT");
    eq(R14.grossProfitSatang - gp, vat, "ส่วนต่าง = VAT");
    eq(halfUp(BigInt(gp) * BigInt(10_000), BigInt(rev)), 4566, "มาร์จิน"); eq(halfUp(BigInt(150_000), BigInt(24)), 6250, "อัตราเต็ม");
    eq(vatIncl(995_000), 65_093, "ภาพ 13 ใบ 0142 (มีกล้อง) VAT 650.93");
  });
  await st("PC-3", "ตาราง TripCost ตรงที่ใบสั่งอ้าง (ไม่มี migration ในใบนี้): คอลัมน์ id tenantId unitId departureId kind amountSatang note createdAt updatedAt · CHECK kind 8 ค่า · amountSatang ≥ 0 · ดัชนี departureId", async () => {
    eq((await cols("TripCost")).map((c) => c.column_name).sort(), ["amountSatang", "createdAt", "departureId", "id", "kind", "note", "tenantId", "unitId", "updatedAt"], "คอลัมน์");
    eq((await checkLits("TripCost", "kind")).sort(), [...COST_KINDS].sort(), "CHECK kind");
    const defs = (await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'TripCost' AND c.contype = 'c'`)).map((r) => r.def).join(" ");
    ok(/"amountSatang" >= 0/.test(defs), `CHECK amount: ${defs}`);
    const idx = (await q<{ i: string }>(`SELECT indexname AS i FROM pg_indexes WHERE tablename = 'TripCost'`)).map((r) => r.i);
    ok(idx.includes("TripCost_departureId_idx"), "ดัชนี departureId");
  });
  await st("PC-4", "ผู้อ่านต้นทุนเดิม: pricing.ts อ่าน Σ TripCost.amountSatang ของรอบ (W22 ถือทุกแถวเป็นยอดรวม) — ใบนี้ไม่แตะ", () => {
    const s = read(MOD + "pricing.ts");
    ok(/tripCost\.findMany\(\{ where: \{ tenantId, unitId, departureId: dep\.id \}/.test(s), "pricing.ts ไม่อ่าน TripCost ต่อรอบแบบเดิม");
    ok(/costSatang: costs\.reduce\(\(s, x\) => s \+ x\.amountSatang, 0\)/.test(s), "pricing.ts ไม่รวม amountSatang");
  });
  await st("PC-5", "ของที่ใบนี้ต่อยอดมีจริง: facade loadDeparturePanelVM · tripsPageGate · outstandingOf · parseAmountSatang · csvCell · manifestCsv · ตัวช่วย money-math mulDivHalfUp", async () => {
    for (const n of ["loadDeparturePanelVM", "tripsPageGate", "outstandingOf", "parseAmountSatang", "csvCell", "manifestCsv"]) fn(n);
    const mm = (await tryImport("@/lib/modules/trips/money-math")).mod;
    ok(typeof mm?.mulDivHalfUp === "function", "money-math.mulDivHalfUp");
    eq((mm?.mulDivHalfUp as AnyFn)(-1, 10_000, 20_000), -1, "ปัดครึ่งออกจากศูนย์ (ค่าลบ)");
  });
  await st("PC-6", "ตัวช่วยขอบเขต trips-main-merge: positive control (ไฟล์บน main ที่ TRIPS ไม่แตะ ⇒ true) · negative control (ไฟล์ของใบนี้/ไม่มีบน main ⇒ false)", () => {
    const pos = ["src/lib/modules/kanban/", "src/lib/modules/crm/", "src/lib/modules/member/", "src/lib/"].flatMap((d) => git(["ls-tree", "-r", "--name-only", TRIPS_MAIN_MERGE_SHA, d]).split("\n").filter(Boolean).slice(0, 40))
      .find((f) => git(["diff", "--name-only", TRIPS_MAIN_MERGE_SHA, "--", f]).trim() === "" && git(["diff", "--name-only", BASE_SHA, "--", f]).trim() === "");
    ok(pos, "หาไฟล์ควบคุมบน main ไม่ได้");
    eq(fromMainMerge(ROOT, String(pos)), true, `positive ${pos}`);
    eq(fromMainMerge(ROOT, "ledger/trips-briefs/T1.7.md"), false, "negative ใบสั่ง");
    eq(fromMainMerge(ROOT, PURE), false, "negative report-core");
  });
  // seed: คิดซ้ำจากแถวดิบ (ไม่ตรึงเลข)
  const seedDep = (await q<{ id: string }>(`SELECT d.id FROM "TripDeparture" d JOIN "TripProduct" p ON p.id = d."productId" WHERE d."tenantId" = $1 AND d."unitId" = $2 AND d."localDate" = $3::date AND p.slug = 'racha-yai-day-trip' ORDER BY d."startsAt" LIMIT 1`, [DIVE_TENANT, U0, R14.date]).catch(() => []))[0]?.id ?? "";
  const seedCounts = async () => (await q<Rec>(`SELECT (SELECT count(*) FROM "TripCost" WHERE "tenantId" = $1)::int AS c, (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = $1)::int AS a, (SELECT count(*) FROM "TripBooking" WHERE "tenantId" = $1)::int AS b`, [DIVE_TENANT]))[0];
  const seedBefore = await seedCounts().catch(() => ({}));
  type RawMoney = { sales: number; pt: number; vat: number; commission: number; live: number };
  const rawSeedMoney = async (depId: string): Promise<RawMoney> => (await q<RawMoney>(
    `SELECT COALESCE(sum((b."policySnapshot"->'totals'->>'payableSatang')::bigint - b."passThroughSatang"), 0)::bigint::float8 AS sales, COALESCE(sum(b."passThroughSatang"), 0)::float8 AS pt,
            COALESCE(sum(b."vatSatang"), 0)::float8 AS vat, COALESCE(sum(b."commissionSatang"), 0)::float8 AS commission, count(*)::int AS live
       FROM "TripBooking" b WHERE b."departureId" = $1 AND b."tenantId" = $2 AND b.status = ANY($3::text[])`, [depId, DIVE_TENANT, LIVE]))[0] ?? { sales: 0, pt: 0, vat: 0, commission: 0, live: 0 };
  let seedRaw: RawMoney | null = null;
  await st("PC-7", "seed อ่านอย่างเดียว: ร้าน andaman-dive มีรอบราชา 14 พ.ย. · คิดยอดจากแถวดิบได้ (snapshot payable − เก็บแทน · VAT · คอมฯ) · ไม่มีแถว TripCost ของ seed (ใบนี้ไม่เพิ่ม seed)", async () => {
    ok(seedDep, "ไม่พบรอบราชา 14 พ.ย. ใน seed");
    seedRaw = await rawSeedMoney(seedDep);
    ok(seedRaw.live >= 1 && seedRaw.sales > 0, `seed ไม่มีการจองที่นับ: ${fmt(seedRaw)}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripCost" WHERE "departureId" = $1`, [seedDep]))[0]?.n, 0, "TripCost ของ seed");
  });
  await st("PC-8", "เขตเวลา (คิดอิสระด้วย Intl): 2027-04-09T16:30Z = 9 เม.ย. 23:30 กรุงเทพ / 10 เม.ย. 01:30 โตเกียว · 2027-03-31T17:30Z = 1 เม.ย. 00:30 กรุงเทพ · 2027-03-31T15:30Z = 1 เม.ย. 00:30 โตเกียว / 31 มี.ค. กรุงเทพ", () => {
    const ymd = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
    eq([ymd("2027-04-09T16:30:00Z", "Asia/Bangkok"), ymd("2027-04-09T16:30:00Z", "Asia/Tokyo")], ["2027-04-09", "2027-04-10"], "16:30Z");
    eq(ymd("2027-03-31T17:30:00Z", "Asia/Bangkok"), "2027-04-01", "17:30Z กรุงเทพ");
    eq([ymd("2027-03-31T15:30:00Z", "Asia/Tokyo"), ymd("2027-03-31T15:30:00Z", "Asia/Bangkok")], ["2027-04-01", "2027-03-31"], "15:30Z");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์/กติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด ──");
  const compFiles = walk(COMP).filter((f) => /^(Cost|Report)/.test(basename(f)));
  const ownFiles = [...OWN_MOD, COST_PAGE, REPORT_PAGE, ...compFiles];
  const needOwn = () => { const miss = [...OWN_MOD, COST_PAGE, REPORT_PAGE].filter((f) => !existsSync(join(ROOT, f))); ok(miss.length === 0, `ยังไม่มีไฟล์: ${miss.join(", ")}`); ok(compFiles.length > 0, "ยังไม่มีคอมโพเนนต์ Cost*/Report*"); };
  await st("S-1", "ไฟล์ของใบมีครบ: report-core · costs · reports · report-actions · หน้า costs · หน้า reports · คอมโพเนนต์ Cost*/Report*", () => needOwn());
  await st("S-2", `facade trips ส่งออก ${FACADE_FNS.length} ฟังก์ชัน + ${FACADE_CONSTS.length} ค่าคงที่ (บล็อก T1.7 ใน index.ts · รายชื่อชัด ไม่มี export *)`, () => {
    const miss = [...FACADE_FNS.filter((n) => typeof needTrips()[n] !== "function"), ...FACADE_CONSTS.filter((n) => needTrips()[n] === undefined)];
    ok(miss.length === 0, `ยังไม่มี: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` …(+${miss.length - 8})` : ""}`);
    const idx = read(MOD + "index.ts");
    ok(/T1\.7/.test(idx) && !/export \* from "\.\/(report-core|costs|reports)"/.test(idx), "index.ts ต้องมีบล็อก T1.7 แบบรายชื่อชัด");
  });
  await st("S-3", "report-core.ts บริสุทธิ์: import เฉพาะ ./money-math ./departures-core ./manifest-core (+ import type) · ไม่มี prisma/db/fs · ไม่อ่านนาฬิกา (Date.now · new Date() ไม่มีอาร์กิวเมนต์) · ไม่ใช้ getDay/getDate/getHours/getMonth/getFullYear", () => {
    needOwn(); const s = stripComments(read(PURE));
    const imps = [...s.matchAll(/^import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
    const bad = imps.filter((p) => !["./money-math", "./departures-core", "./manifest-core"].includes(p));
    ok(bad.length === 0, `import ต้องห้าม: ${bad.join(", ")}`);
    ok(!/Date\.now\(|new Date\(\s*\)|\.get(Day|Date|Hours|Month|FullYear)\(/.test(s), "อ่านนาฬิกา/ใช้ getter เวลาเครื่อง");
    ok(!/\bprisma\b|tenantDb|\$queryRaw|node:fs/.test(s), "มี I/O");
  });
  await st("S-4", "report-actions.ts: \"use server\" · ส่งออกเฉพาะ async function 2 ตัว (saveDepartureCostsAction · exportTripReportCsvAction) · ทุกตัว requireUnit · ใช้ assertCan + จับ ForbiddenError · ไม่รับ/ไม่ส่ง now", () => {
    needOwn(); const s = stripComments(read(ACTIONS));
    ok(/^\s*["']use server["']/.test(read(ACTIONS)), "ไม่มี \"use server\" บรรทัดแรก");
    const exps = [...s.matchAll(/export\s+(async\s+function|function|const|let|class|type|interface|default)\s+(\w+)?/g)].map((m) => [m[1], m[2]]);
    ok(exps.every(([k]) => k === "async function"), `ส่งออกอย่างอื่น: ${fmt(exps.filter(([k]) => k !== "async function"))}`);
    eq(exps.map(([, n]) => n).sort(), ["exportTripReportCsvAction", "saveDepartureCostsAction"], "ชื่อ action");
    ok((s.match(/requireUnit\(/g) ?? []).length >= 2 || /async function enter\b[\s\S]*requireUnit\(/.test(s), "ทุก action ต้อง requireUnit");
    ok(/assertCan\(/.test(s) && /ForbiddenError/.test(s), "ต้อง assertCan + ForbiddenError (fitness F6.1)");
    ok(!/\bnow\s*[:=]/.test(s) && !/new Date\(/.test(s), "action รับ/สร้างเวลา");
  });
  await st("S-5", "สิทธิ์ใหม่ 3 คีย์ในบล็อก trips ของ permissions.ts (report.view · cost.view · cost.edit) · ป้ายไทยไม่ว่าง · ไม่มีคีย์ trips.cost/report อื่น", () => {
    const s = read(PERMS);
    const block = s.slice(s.indexOf('module: "trips"'), s.indexOf('module: "agency"'));
    for (const k of NEW_PERMS) ok(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"[^"]{4,}"`).test(block), `ไม่มีคีย์ ${k} ในบล็อก trips`);
    const extra = [...block.matchAll(/"(trips\.(?:cost|report)\.[\w.]+)"/g)].map((m) => m[1]).filter((k) => !NEW_PERMS.includes(k));
    ok(extra.length === 0, `คีย์เกิน: ${extra.join(", ")}`);
  });
  await st("S-6", "หน้า: costs/page.tsx + reports/page.tsx ใช้ requireUnit → tripsPageGate(page \"departures\") → ตัวโหลดของใบ · ไม่ import prisma/db · ไม่มี 'use client' · ตัวโหลดผิดรูป ⇒ notFound()/TripsForbidden", () => {
    needOwn();
    for (const [f, loader] of [[COST_PAGE, "loadDepartureCostsVM"], [REPORT_PAGE, "loadTripReportVM"]] as const) {
      const s = stripComments(read(f));
      ok(/requireUnit\(/.test(s) && /tripsPageGate\(/.test(s) && /["']departures["']/.test(s), `${f}: ด่านหน้า`);
      ok(new RegExp(`\\b${loader}\\(`).test(s), `${f}: ไม่เรียก ${loader}`);
      ok(!/@\/lib\/core\/db|@prisma\/client|\bprisma\./.test(s) && !/["']use client["']/.test(s), `${f}: prisma/use client`);
      ok(/TripsForbidden/.test(s), `${f}: ไม่มี TripsForbidden`);
    }
    ok(/notFound\(/.test(stripComments(read(COST_PAGE))), "costs page ต้อง notFound() เมื่อรอบไม่พบ");
  });
  await st("S-7", "คอมโพเนนต์ Cost*/Report*: ไม่ import prisma/บริการ (นอกจาก action + import type) · ใช้ formatBaht · ไม่คิดเลขเงิน (ไม่มี xxxSatang +-*/ · ไม่มี reduce บนยอด) · ไม่มีคำ POS · ไม่ใช้ sr-only ในไฟล์ที่มี <table", () => {
    needOwn(); const bad: string[] = [];
    for (const f of compFiles) {
      const s = stripComments(read(f));
      if (/from\s+["']@\/lib\/(core\/db|modules\/trips\/(costs|reports|report-core|pricing|booking|money)[^"']*)["']/.test(s.replace(/import\s+type[^;]+;/g, ""))) bad.push(`${f}: import บริการ/ฐาน`);
      if (/\w+Satang\s*[-+*/](?!=)|[-+*/]\s*\w+\.\w+Satang\b|\.reduce\(/.test(s)) bad.push(`${f}: คิดเลขเงิน`);
      if (/\bPOS\b/.test(s.replace(/data-[\w-]+=/g, ""))) bad.push(`${f}: คำว่า POS`);
      if (/<table/.test(s) && /sr-only/.test(s)) bad.push(`${f}: sr-only ในไฟล์ตาราง`);
    }
    ok(compFiles.some((f) => /formatBaht\(/.test(read(f))), "ไม่มีการใช้ formatBaht");
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  const th = asRec((() => { try { return JSON.parse(read("src/messages/th/trips.json")); } catch { return null; } })()) ?? {};
  const en = asRec((() => { try { return JSON.parse(read("src/messages/en/trips.json")); } catch { return null; } })()) ?? {};
  const flat = (o: Rec, p = ""): Record<string, string> => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (asRec(v) ? Object.entries(flat(asRec(v) ?? {}, `${p}${k}.`)) : [[`${p}${k}`, String(v)]])));
  const fth = flat(th), fen = flat(en);
  await st("S-8", "ข้อความใต้ costs.* report.* departures.money.*: ไม่มีรหัสดิบ/รหัสใบงาน (T1.x OQ.. A1.x) และไม่มีคำว่า POS · อังกฤษไม่มีอักษรไทย", () => {
    const mine = (f: Record<string, string>) => Object.entries(f).filter(([k]) => /^(costs|report)\./.test(k) || k.startsWith("departures.money."));
    const mt = mine(fth), me = mine(fen);
    ok(mt.length > 0, "ยังไม่มีข้อความของใบ");
    const bad = [...mt, ...me].filter(([, v]) => /\bPOS\b|\b[TAWKLSCX]\d\.\d+[a-z]?\b|\bOQ\d+\b/.test(v) || v.split(/[^A-Z_0-9]+/).some((w) => RAW_CODES.has(w)));
    ok(bad.length === 0, `ข้อความต้องห้าม: ${fmt(bad.slice(0, 4))}`);
    const thaiInEn = me.filter(([, v]) => /[฀-๿]/.test(v));
    ok(thaiInEn.length === 0, `อังกฤษมีอักษรไทย: ${fmt(thaiInEn.slice(0, 3))}`);
  });
  await st("S-9", `คีย์ภาษาขั้นต่ำ ${I18N_REQUIRED.length} คีย์มีทั้งไทยและอังกฤษ · ชุดคีย์ใต้ costs/report/departures.money เท่ากันสองภาษา`, () => {
    const miss = I18N_REQUIRED.filter((k) => !fth[k] || !fen[k]);
    ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 8).join(", ")}`);
    const ks = (f: Record<string, string>) => Object.keys(f).filter((k) => /^(costs|report)\./.test(k) || k.startsWith("departures.money.")).sort();
    eq(ks(fth), ks(fen), "ชุดคีย์สองภาษา");
  });
  await st("S-10", `testid ตายตัว ${TESTIDS_FIXED.length} + แพตเทิร์น ${TESTID_PATTERNS.length} อยู่ในซอร์ส · มีแถวในทะเบียนปุ่ม (wo T1.7 · needs = คีย์จริง) · ไม่มีแถวผี`, () => {
    needOwn();
    const src = [...compFiles, PANEL, DEPSCREEN, COST_PAGE, REPORT_PAGE].map((f) => read(f)).join("\n");
    const missFixed = TESTIDS_FIXED.filter((t) => !src.includes(`"${t}"`) && !src.includes(`'${t}'`));
    const missPat = TESTID_PATTERNS.filter((p) => !src.includes(`\`${p}\${`) && !src.includes(`"${p}" +`));
    ok(missFixed.length === 0 && missPat.length === 0, `ไม่พบ: ${[...missFixed, ...missPat].slice(0, 8).join(", ")}`);
    const inv = asRec((() => { try { return JSON.parse(read("scripts/trips-ui-inventory.json")); } catch { return null; } })()) ?? {};
    const rows = asArr(inv.rows).filter((r) => r.wo === "T1.7");
    const ids = new Set(rows.map((r) => String(r.testid)));
    const missInv = [...TESTIDS_FIXED, ...TESTID_PATTERNS.map((p) => `${p}*`)].filter((t) => !ids.has(t));
    ok(missInv.length === 0, `ทะเบียนปุ่มขาด: ${missInv.slice(0, 6).join(", ")}`);
    const permKeys = new Set([...read(PERMS).matchAll(/"(trips\.[\w.*]+)":/g)].map((m) => m[1]));
    const badNeeds = rows.filter((r) => String(r.needs ?? "").split("+").some((k) => k && !permKeys.has(k)));
    ok(badNeeds.length === 0, `needs ไม่ใช่คีย์จริง: ${fmt(badNeeds.slice(0, 2).map((r) => r.needs))}`);
  });
  await st("S-11", `ฉากภาพ TRIPS_VISUAL_SPECS["t1.7"] = ${VISUAL_SCENES.join(" · ")} (mockup 11) · parity-trips.sh รับ 11`, () => {
    const s = read("scripts/visual-trips.mts");
    const blk = s.slice(s.indexOf('"t1.7": ['));
    ok(s.includes('"t1.7": ['), "ไม่มีกลุ่ม t1.7");
    for (const n of VISUAL_SCENES) ok(new RegExp(`name: "${n}", mockup: "11"`).test(blk) || new RegExp(`name: "${n}",\\s*mockup: "11"`).test(blk), `ไม่มีฉาก ${n}`);
    ok(/11-departures-calendar\.png|\b11\)/.test(read("scripts/parity-trips.sh")), "parity-trips.sh ไม่รู้จักภาพ 11");
  });
  await st("S-12", "ไม่ใช้นาฬิกาฐานข้อมูล: costs.ts/reports.ts ไม่มี now() · CURRENT_DATE · CURRENT_TIMESTAMP · LOCALTIMESTAMP · statement_timestamp · ใช้ AT TIME ZONE กับ createdAt (ฐานวันจอง)", () => {
    needOwn(); const s = stripComments(read(COSTS)) + stripComments(read(REPORTS));
    ok(!/\bnow\(\)|CURRENT_DATE|CURRENT_TIMESTAMP|LOCALTIMESTAMP|statement_timestamp|clock_timestamp|transaction_timestamp/i.test(s), "มีนาฬิกาฐานข้อมูล");
    ok(/AT TIME ZONE/i.test(stripComments(read(REPORTS))), "reports.ts ไม่แปลงเขตเวลาของ createdAt ใน SQL");
  });
  await st("S-13", `ขอบเขต (เทียบ BASE ${BASE_SHA.slice(0, 9)} · ไม่นับไฟล์ที่ตรงกับ session/trips หรือ commit ฝั่ง main ที่รวมแล้ว): ไม่แตะ prisma/core(ยกเว้น permissions จำกัด)/platform/payment/api/โมดูลอื่น/ไฟล์บริการ trips เดิม/คอมโพเนนต์เดิม/route เดิม/ข้อสอบเดิม/seed · ไฟล์จำกัดอยู่ในงบบรรทัด`, () => {
    needOwn();
    ok(git(["cat-file", "-t", BASE_SHA]).trim() === "commit", `หา BASE ${BASE_SHA} ไม่เจอ`);
    const lit = (p: string) => `:(literal)${p}`;
    const atBase = (dir: string) => git(["ls-tree", "-r", "--name-only", BASE_SHA, `${dir}/`]).split("\n").filter(Boolean);
    const forbidden = ["prisma", ...atBase("src/lib/core").filter((f) => !LIMITED_SET.has(f)), "src/lib/platform", "src/lib/payment", "src/app/api", "src/lib/outbox-consumers.ts", "src/lib/automation", "src/lib/webhooks",
      ...["pos", "account", "party", "approval", "hotel", "rooms", "booking", "dorm", "queue", "ticket", "agency", "supplier", "hr", "inventory"].map((m) => `src/lib/modules/${m}`),
      ...atBase("src/lib/modules/trips").filter((f) => !LIMITED_SET.has(f)), ...atBase(COMP).filter((f) => !LIMITED_SET.has(f)), ...atBase(APP),
      ...atBase("scripts").filter((f) => /^scripts\/(qc-trips-[\w.]+\.mts|probe-trips-[\w.-]+\.mts)$/.test(f) && f !== "scripts/qc-trips-t1.7.mts"), "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/seed-trips-qc.mts",
      "scripts/trips-fixture.mts", "scripts/iso.sh", "scripts/qc-trips.sh", "scripts/trips-main-merge.mts"];
    const sameAsSession = (f: string) => git(["diff", "--name-only", "session/trips", "--", lit(f)]).trim() === "" && git(["ls-files", "--others", "--exclude-standard", "--", lit(f)]).trim() === "";
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...forbidden.map(lit)]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...forbidden.filter((p) => !/\.\w+$/.test(p)).map(lit)]).split("\n")].filter(Boolean))];
    const touched = changed.filter((f) => !sameAsSession(f) && !fromMainMerge(ROOT, f));
    ok(touched.length === 0, `แตะไฟล์ต้องห้าม: ${touched.slice(0, 6).join(", ")}`);
    const over: string[] = [];
    for (const [f, maxDel, maxAdd] of LIMITED) {
      const line = git(["diff", "--numstat", BASE_SHA, "--", lit(f)]).trim();
      if (!line || sameAsSession(f) || fromMainMerge(ROOT, f)) continue;
      const [a, d] = line.split("\t").map(Number);
      if (d > maxDel || (maxAdd !== null && a > maxAdd)) over.push(`${f} +${a}/−${d} (ได้ +${maxAdd ?? "∞"}/−${maxDel})`);
    }
    ok(over.length === 0, over.join(" · "));
    const newMod = git(["ls-files", "--others", "--exclude-standard", "--", lit("src/lib/modules/trips")]).split("\n").filter(Boolean).filter((f) => !OWN_MOD.includes(f));
    ok(newMod.length === 0, `ไฟล์โมดูลใหม่นอกรายการ: ${newMod.join(", ")}`);
    const newComp = git(["ls-files", "--others", "--exclude-standard", "--", lit(COMP)]).split("\n").filter(Boolean).filter((f) => !/^(Cost|Report)/.test(basename(f)));
    ok(newComp.length === 0, `คอมโพเนนต์ใหม่ที่ไม่ขึ้นต้น Cost/Report: ${newComp.join(", ")}`);
    const newRoutes = git(["ls-files", "--others", "--exclude-standard", "--", lit(APP)]).split("\n").filter(Boolean).filter((f) => f !== COST_PAGE && f !== REPORT_PAGE);
    ok(newRoutes.length === 0, `route ใหม่นอกรายการ: ${newRoutes.join(", ")}`);
  });
  await st("S-14", "วินัยการเขียน: costs.ts เขียนได้เฉพาะ TripCost + AuditLog · reports.ts เขียนได้เฉพาะ AuditLog · ไม่ส่ง outbox/event · ไม่มี console.* · ไม่ update/delete ตาราง Trip* อื่น", () => {
    needOwn();
    const c = stripComments(read(COSTS)), r = stripComments(read(REPORTS)), p = stripComments(read(PURE));
    const writesOf = (s: string) => [...s.matchAll(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(\w+)"/gi)].map((m) => m[1]).concat([...s.matchAll(/\b(trip[A-Z]\w*|auditLog)\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\(/g)].map((m) => m[1][0].toUpperCase() + m[1].slice(1)));
    const badC = writesOf(c).filter((t) => t !== "TripCost" && t !== "AuditLog");
    const badR = writesOf(r + p).filter((t) => t !== "AuditLog");
    ok(badC.length === 0 && badR.length === 0, `เขียนตารางต้องห้าม: costs ${badC.join(",")} · reports ${badR.join(",")}`);
    ok(!/outboxEvent|OutboxEvent|emitTx\(|publishEvent\(|enqueue\w*\(/.test(c + r), "ส่ง outbox/event");
    ok(!/console\.(log|info|debug|warn|error)\(/.test(c + r + p), "มี console.*");
  });
  await st("S-15", "ไม่แตะระบบอื่น: ไฟล์ของใบไม่ import modules/{pos,account,hotel,rooms,dorm,approval,agency,supplier,hr} หรือ @/lib/payment · ไม่ import pricing* (W22 คงเดิม)", () => {
    needOwn();
    const bad = ownFiles.filter((f) => /from\s*["']@\/lib\/modules\/(pos|account|hotel|rooms|dorm|approval|agency|supplier|hr)\b|from\s*["']@\/lib\/payment|from\s*["']\.\/pricing/.test(stripComments(read(f))));
    ok(bad.length === 0, `import ต้องห้าม: ${bad.join(", ")}`);
  });
  await st("S-16", "ผลรวมใน SQL + ไม่ N+1: reports.ts มี SUM(...) และ GROUP BY · LIMIT/take ผูก REPORT_PAGE_SIZE/TRIPS_REPORT_CSV_CAP · ไม่มี await ในลูป for/while · ไม่มี .map(async / forEach(async ใน costs.ts/reports.ts", () => {
    needOwn(); const r = stripComments(read(REPORTS)), c = stripComments(read(COSTS));
    ok(/\bsum\(/i.test(r) && /GROUP BY/i.test(r), "ไม่มี SUM/GROUP BY");
    ok(/REPORT_PAGE_SIZE/.test(r) && /TRIPS_REPORT_CSV_CAP/.test(r), "เพดานไม่ผูกค่าคงที่");
    for (const [f, s] of [[REPORTS, r], [COSTS, c]] as const) {
      ok(!/\.(map|forEach)\(\s*async/.test(s), `${f}: .map(async`);
      const loops = [...s.matchAll(/\b(for|while)\s*\([^)]*\)\s*\{([^{}]|\{[^{}]*\})*\}/g)].map((m) => m[0]);
      ok(!loops.some((l) => /\bawait\b/.test(l)), `${f}: await ในลูป`);
    }
  });
  await st("S-17", "ล็อกต่อรอบตอนบันทึกต้นทุน: pg_advisory_xact_lock สองอาร์กิวเมนต์ (hashtext('trips.cost'), hashtext(departureId)) ใน costs.ts · มี sha256 สำหรับ token", () => {
    needOwn(); const c = stripComments(read(COSTS));
    ok(/pg_advisory_xact_lock\(\s*hashtext\(\s*'trips\.cost'\s*\)\s*,\s*hashtext\(/.test(c), "ไม่มีล็อกสองอาร์กิวเมนต์");
    ok(/sha256/.test(c), "ไม่มี sha256");
  });
  await st("S-18", "ไม่มี migration ในใบนี้: โฟลเดอร์ prisma/migrations และ prisma/schema ตรงกับ BASE (ไม่มีโฟลเดอร์ใหม่ · ไม่มีไฟล์ untracked)", () => {
    const d = git(["diff", "--name-only", BASE_SHA, "--", "prisma"]).trim();
    const u = git(["ls-files", "--others", "--exclude-standard", "--", "prisma"]).trim();
    ok(!d && !u, `prisma เปลี่ยน: ${(d + " " + u).trim().slice(0, 200)}`);
  });
  await st("S-19", "ไม่มี any · ไม่มี @ts-ignore/@ts-expect-error ในไฟล์ของใบ", () => {
    needOwn();
    const bad = ownFiles.filter((f) => /:\s*any\b|<any>|as any\b|@ts-ignore|@ts-expect-error/.test(stripComments(read(f))));
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-20", "ไม่เพิ่มแท็บในแถบ trips: trips-shared.ts TRIPS_NAV_KEYS = 6 ค่าเดิม · TripsNav.tsx ไม่เปลี่ยน", () => {
    const s = read(`${COMP}/trips-shared.ts`);
    ok(/TRIPS_NAV_KEYS = \["products", "departures", "bookings", "agents", "channels", "settings"\] as const/.test(s), "TRIPS_NAV_KEYS เปลี่ยน");
    ok(git(["diff", "--name-only", BASE_SHA, "--", `${COMP}/TripsNav.tsx`]).trim() === "", "TripsNav.tsx เปลี่ยน");
  });
  groupLine("S");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ (report-core) ──");
  await st("P-1", "ค่าคงที่: ชนิดต้นทุน 8 · เพดาน 30/1e9/200 · สถานะนับ 5 · รอ 2 · แท็บ 4 · กลุ่ม 3 · ฐาน 2 · 366 วัน · หน้า 50/200 · CSV 2,000 · ช่องระยะจอง 7 · กลุ่มช่องทาง 3 (ครบ 12 ช่องทาง) · คอลัมน์ CSV 19 (ต้นทุน 4)", () => {
    eq(constOf("TRIP_COST_KINDS"), COST_KINDS, "TRIP_COST_KINDS");
    eq([constOf("TRIP_COST_ROWS_MAX"), constOf("TRIP_COST_AMOUNT_MAX"), constOf("TRIP_COST_NOTE_MAX")], [30, 1_000_000_000, 200], "เพดานต้นทุน");
    eq(constOf("REPORT_LIVE_STATUSES"), LIVE, "LIVE"); eq(constOf("REPORT_PENDING_STATUSES"), ["HOLD", "PENDING"], "PENDING");
    eq([constOf("REPORT_TABS"), constOf("REPORT_GROUPS"), constOf("REPORT_BASES")], [TABS, GROUPS, BASES], "แท็บ/กลุ่ม/ฐาน");
    eq([constOf("REPORT_RANGE_MAX_DAYS"), constOf("REPORT_PAGE_SIZE"), constOf("REPORT_PAGE_MAX"), constOf("TRIPS_REPORT_CSV_CAP")], [366, 50, 200, 2000], "เพดานรายงาน");
    eq(asArr(constOf("LEAD_BUCKETS")).map((b) => [b.key, b.min, b.max]), [["D0", 0, 0], ["D1_2", 1, 2], ["D3_7", 3, 7], ["D8_14", 8, 14], ["D15_30", 15, 30], ["D31_60", 31, 60], ["D61P", 61, null]], "LEAD_BUCKETS");
    const cg = asRec(constOf("CHANNEL_GROUPS")) ?? {};
    eq(cg, { DIRECT: ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "CHAT_AI"], AGENT: ["AGENT_PORTAL", "AGENT_LINK", "AGENT_API"], OTHER: ["OTA", "API", "IMPORT"] }, "CHANNEL_GROUPS");
    eq([constOf("REPORT_CSV_COLUMNS"), constOf("REPORT_CSV_COST_COLUMNS"), constOf("DEPARTURE_REPORT_STATES")], [CSV_COLS, CSV_COST_COLS, DEP_STATES], "CSV/สถานะ");
  });
  const bm = (o: Partial<Rec>): Rec => asRec(pure("bookingMoneyOf", { status: "CONFIRMED", seats: 0, payableSatang: 0, passThroughSatang: 0, vatSatang: 0, commissionSatang: 0, paidSatang: 0, refundedSatang: 0, retained: [], ...o })) ?? {};
  const pick = (r: Rec, ks: string[]) => ks.map((k) => r[k]);
  const MK = ["counted", "seats", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "commissionSatang", "collectedSatang", "outstandingSatang"];
  await st("P-2", "bookingMoneyOf LIVE (0148 ลิงก์ PTD 4 ผู้ใหญ่ · จ่ายบางส่วน 500,000): ยอดขาย 1,400,000 · เก็บแทน 240,000 · VAT 91,589 · ก่อน VAT 1,308,411 · คอมฯ 210,000 · รับแล้ว 500,000 · ค้าง 1,140,000", () => {
    eq(pick(bm({ status: "PART_PAID", seats: 4, payableSatang: 1_640_000, passThroughSatang: 240_000, vatSatang: 91_589, commissionSatang: 210_000, paidSatang: 500_000 }), MK),
      ["LIVE", 4, 1_400_000, 240_000, 91_589, 1_308_411, 210_000, 500_000, 1_140_000], "0148");
  });
  await st("P-3", "bookingMoneyOf CANCELLED = ส่วนที่ร้านเก็บ (RETAINED) ก่อน VAT · คอมฯ 0 · ค้าง 0 · ที่นั่ง 0 · ยกเลิกยังไม่จ่าย = 0 · HOLD/PENDING/EXPIRED = EXCLUDED ศูนย์ทุกช่อง", () => {
    eq(pick(bm({ status: "CANCELLED", seats: 2, payableSatang: 820_000, passThroughSatang: 120_000, vatSatang: 45_794, commissionSatang: 99_000, paidSatang: 820_000, refundedSatang: 470_000,
      retained: [{ amountSatang: 300_000, vatSatang: 19_626, passThroughSatang: 0 }, { amountSatang: 60_000, vatSatang: 3_271, passThroughSatang: 10_000 }] }), MK),
      ["CANCELLED", 0, 350_000, 10_000, 22_897, 327_103, 0, 350_000, 0], "ยกเลิกเก็บไว้ 2 ใบ");
    eq(pick(bm({ status: "CANCELLED", seats: 1, payableSatang: 410_000, passThroughSatang: 60_000, vatSatang: 22_897 }), MK), ["CANCELLED", 0, 0, 0, 0, 0, 0, 0, 0], "ยกเลิกยังไม่จ่าย");
    for (const s of ["HOLD", "PENDING", "EXPIRED"]) eq(pick(bm({ status: s, seats: 2, payableSatang: 820_000, passThroughSatang: 120_000, vatSatang: 45_794, commissionSatang: 5, paidSatang: 100 }), MK), ["EXCLUDED", 0, 0, 0, 0, 0, 0, 0, 0], s);
  });
  await st("P-4", "bookingMoneyOf: TRAVELLED/NO_SHOW นับเต็ม · จ่ายเกิน ⇒ ค้าง 0 (ไม่ติดลบ) · คืนบางส่วนบน LIVE ⇒ รับแล้ว = จ่าย − คืน", () => {
    eq(pick(bm({ status: "NO_SHOW", seats: 2, payableSatang: 820_000, passThroughSatang: 120_000, vatSatang: 45_794, paidSatang: 820_000 }), MK), ["LIVE", 2, 700_000, 120_000, 45_794, 654_206, 0, 820_000, 0], "NO_SHOW");
    eq(pick(bm({ status: "TRAVELLED", seats: 1, payableSatang: 410_000, passThroughSatang: 60_000, vatSatang: 22_897, paidSatang: 500_000, refundedSatang: 90_000 }), MK), ["LIVE", 1, 350_000, 60_000, 22_897, 327_103, 0, 410_000, 0], "จ่ายเกิน+คืน");
  });
  await st("P-5", "sumMoney: บวกทีละช่อง · bookings = LIVE · cancelledBookings = CANCELLED · EXCLUDED ไม่นับ", () => {
    const xs = [bm({ status: "PAID", seats: 3, payableSatang: 1_095_000, passThroughSatang: 150_000, vatSatang: 61_822, paidSatang: 1_095_000 }), bm({ status: "CANCELLED", retained: [{ amountSatang: 350_000, vatSatang: 22_897, passThroughSatang: 0 }], paidSatang: 820_000, refundedSatang: 470_000 }), bm({ status: "HOLD", payableSatang: 9 })];
    const t = asRec(pure("sumMoney", xs)) ?? {};
    eq(pick(t, ["bookings", "cancelledBookings", "seats", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "commissionSatang", "collectedSatang", "outstandingSatang"]),
      [1, 1, 3, 1_295_000, 150_000, 84_719, 1_210_281, 0, 1_445_000, 0], "รวม");
  });
  await st("P-6", "profitOf: ภาพ 11 ⇒ 2,150,782 / 4566 bp · รายได้ 0 ⇒ margin null (กำไรติดลบได้) · ปัดครึ่งออกจากศูนย์ (+0.5 ⇒ 1 · −0.5 ⇒ −1)", () => {
    const p = (r: number, c: number, k: number) => { const x = asRec(pure("profitOf", { revenueExVatSatang: r, commissionSatang: c, costSatang: k })) ?? {}; return [x.grossProfitSatang, x.marginBp]; };
    eq(p(4_710_282, 409_500, 2_150_000), [2_150_782, 4566], "ภาพ 11");
    eq(p(0, 0, 120_000), [-120_000, null], "รอบยกเลิก"); eq(p(20_000, 0, 19_999), [1, 1], "+0.5"); eq(p(20_000, 0, 20_001), [-1, -1], "−0.5");
    eq(p(6_018_694, 409_500, 2_770_000), [2_839_194, 4717], "เดือน เม.ย.");
  });
  await st("P-7", "loadFactorBp: 15/24 = 6250 · 18/46 = 3913 · 1/3 = 3333 · 2/3 = 6667 · 0/10 = 0 · ความจุ 0 ⇒ null", () => {
    eq([[15, 24], [18, 46], [1, 3], [2, 3], [0, 10], [0, 0]].map(([s, c]) => pure("loadFactorBp", s, c)), [6250, 3913, 3333, 6667, 0, null], "bp");
  });
  await st("P-8", "leadDaysOf ตามวันปฏิทินในเขตเวลาหน่วย: 16:30Z 9 เม.ย. → 10 เม.ย. = 1 (กรุงเทพ) / 0 (โตเกียว) · 17:30Z 31 มี.ค. → 10 เม.ย. = 9 (กรุงเทพ) · จองหลังวันเดินทาง = ติดลบ · ข้ามปี", () => {
    const L = (iso: string, d: string, tz: string) => pure("leadDaysOf", new Date(iso), d, tz);
    eq([L("2027-04-09T16:30:00Z", "2027-04-10", "Asia/Bangkok"), L("2027-04-09T16:30:00Z", "2027-04-10", "Asia/Tokyo"), L("2027-03-31T17:30:00Z", "2027-04-10", "Asia/Bangkok"),
      L("2027-04-12T03:00:00Z", "2027-04-10", "Asia/Bangkok"), L("2026-12-31T18:00:00Z", "2027-01-02", "Asia/Bangkok")], [1, 0, 9, -2, 1], "lead");
  });
  await st("P-9", "leadBucketOf ขอบช่อง: −1,0→D0 · 1,2→D1_2 · 3,7→D3_7 · 8,14→D8_14 · 15,30→D15_30 · 31,60→D31_60 · 61,1000→D61P", () => {
    eq([-1, 0, 1, 2, 3, 7, 8, 14, 15, 30, 31, 60, 61, 1000].map((d) => pure("leadBucketOf", d)), ["D0", "D0", "D1_2", "D1_2", "D3_7", "D3_7", "D8_14", "D8_14", "D15_30", "D15_30", "D31_60", "D31_60", "D61P", "D61P"], "ช่อง");
  });
  await st("P-10", "periodKeyOf: day = วันนั้น · week = วันจันทร์ ISO (เสาร์ 10 เม.ย. → 5 เม.ย. · อาทิตย์ 11 → 5 · จันทร์ 12 → 12 · ศุกร์ 1 ม.ค. 2570 → 28 ธ.ค. 2569) · month = YYYY-MM", () => {
    const P = (d: string, g: string) => pure("periodKeyOf", d, g);
    eq([P("2027-04-10", "day"), P("2027-04-10", "week"), P("2027-04-11", "week"), P("2027-04-12", "week"), P("2027-01-01", "week"), P("2027-04-30", "month")],
      ["2027-04-10", "2027-04-05", "2027-04-05", "2027-04-12", "2026-12-28", "2027-04"], "คีย์");
  });
  await st("P-11", "reportRangeOf: ว่าง ⇒ เดือนของวันนี้ · from อย่างเดียว ⇒ สิ้นเดือนของ from · to อย่างเดียว ⇒ ต้นเดือนของ to · from > to / วันไม่จริง ⇒ INVALID_INPUT · 366 วันได้ · 367 ⇒ RANGE_TOO_LARGE · 29 ก.พ. 2571 ได้", () => {
    const R = (f: string | null, t: string | null, today = "2027-04-15") => { const r = asRec(pure("reportRangeOf", { from: f, to: t }, today)) ?? {}; return r.ok === true ? [r.from, r.to, r.days] : r.code; };
    eq(R(null, null), ["2027-04-01", "2027-04-30", 30], "ปริยาย"); eq(R("2027-02-10", null), ["2027-02-10", "2027-02-28", 19], "from อย่างเดียว");
    eq(R(null, "2027-05-20"), ["2027-05-01", "2027-05-20", 20], "to อย่างเดียว"); eq(R("2027-04-02", "2027-04-01"), "INVALID_INPUT", "กลับด้าน");
    eq(R("2027-02-30", null), "INVALID_INPUT", "30 ก.พ."); eq(R("2027-01-01", "2028-01-01"), ["2027-01-01", "2028-01-01", 366], "366");
    eq(R("2027-01-01", "2028-01-02"), "RANGE_TOO_LARGE", "367"); eq(R("2028-02-29", "2028-02-29"), ["2028-02-29", "2028-02-29", 1], "อธิกสุรทิน"); eq(R("2027-4-1", null), "INVALID_INPUT", "รูปแบบ");
  });
  await st("P-12", "reportGroupOf: 1/31 ⇒ day · 32/92 ⇒ week · 93/366 ⇒ month · channelGroupOf ครบ 12 ช่องทาง + ไม่รู้จัก ⇒ OTHER", () => {
    eq([1, 31, 32, 92, 93, 366].map((d) => pure("reportGroupOf", d)), ["day", "day", "week", "week", "month", "month"], "กลุ่ม");
    const all = ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "CHAT_AI", "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "OTA", "API", "IMPORT", "XX"];
    eq(all.map((c) => pure("channelGroupOf", c)), ["DIRECT", "DIRECT", "DIRECT", "DIRECT", "DIRECT", "DIRECT", "AGENT", "AGENT", "AGENT", "OTHER", "OTHER", "OTHER", "OTHER"], "ช่องทาง");
  });
  await st("P-13", "departureReportStateOf: ยกเลิก ⇒ CANCELLED (แม้จบแล้ว) · now < endsAt ⇒ UPCOMING · จบแล้วยังมีการจองเปิด ⇒ ENDED_NOT_CLOSED · จบแล้วไม่มี ⇒ CLOSED · now = endsAt ⇒ จบแล้ว", () => {
    const end = new Date("2027-04-10T09:30:00Z");
    const S = (status: string, openLive: number, now: Date) => pure("departureReportStateOf", { status, endsAt: end, openLive }, now);
    eq([S("CANCELLED", 3, NOW_R), S("GUARANTEED", 3, new Date("2027-04-10T09:29:59Z")), S("GUARANTEED", 3, NOW_R), S("OPEN", 0, NOW_R), S("OPEN", 1, end)],
      ["CANCELLED", "UPCOMING", "ENDED_NOT_CLOSED", "CLOSED", "ENDED_NOT_CLOSED"], "สถานะ");
  });
  const PCR = (raw: unknown): Rec => asRec(pure("parseCostRows", raw)) ?? {};
  await st("P-14", "parseCostRows ปกติ: trim หมายเหตุ · ว่าง/ไม่มี ⇒ null · ไม่มี id ⇒ null · คงลำดับ · 30 แถวได้", () => {
    const r = PCR([{ kind: "BOAT", amountSatang: 1_200_000, note: "  เรือราชา 1  " }, { id: "c1", kind: "FOOD", amountSatang: 150_000, note: "   " }, { kind: "OTHER", amountSatang: 1 }]);
    ok(r.ok === true, fmt(r));
    eq(r.rows, [{ id: null, kind: "BOAT", amountSatang: 1_200_000, note: "เรือราชา 1" }, { id: "c1", kind: "FOOD", amountSatang: 150_000, note: null }, { id: null, kind: "OTHER", amountSatang: 1, note: null }], "แถว");
    eq(PCR(Array.from({ length: 30 }, () => ({ kind: "FUEL", amountSatang: 100 }))).ok, true, "30 แถว");
  });
  await st("P-15", "parseCostRows ปฏิเสธ: ไม่ใช่อาร์เรย์/kind นอกชุด/คีย์เกิน/ทศนิยม/สตริง/NaN/id ซ้ำ/note มี \\n \\t NUL DEL/note 201 ตัว ⇒ INVALID_INPUT · 0/−1/1e9+1/Σ>int4 ⇒ COST_AMOUNT_INVALID · 31 แถว ⇒ COST_ROWS_LIMIT", () => {
    const row = (o: Rec) => [{ kind: "BOAT", amountSatang: 100, ...o }];
    const cases: [unknown, string][] = [[{}, "INVALID_INPUT"], [null, "INVALID_INPUT"], [row({ kind: "COMMISSION" }), "INVALID_INPUT"], [row({ extra: 1 }), "INVALID_INPUT"], [row({ amountSatang: 1.5 }), "INVALID_INPUT"],
      [row({ amountSatang: "100" }), "INVALID_INPUT"], [row({ amountSatang: Number.NaN }), "INVALID_INPUT"], [[{ id: "x", kind: "BOAT", amountSatang: 1 }, { id: "x", kind: "FUEL", amountSatang: 2 }], "INVALID_INPUT"],
      [row({ note: "a\nb" }), "INVALID_INPUT"], [row({ note: "a\tb" }), "INVALID_INPUT"], [row({ note: "a\u0000" }), "INVALID_INPUT"], [row({ note: "a\u007f" }), "INVALID_INPUT"], [row({ note: "ก".repeat(201) }), "INVALID_INPUT"],
      [row({ id: "" }), "INVALID_INPUT"], [row({ amountSatang: 0 }), "COST_AMOUNT_INVALID"], [row({ amountSatang: -1 }), "COST_AMOUNT_INVALID"], [row({ amountSatang: 1_000_000_001 }), "COST_AMOUNT_INVALID"],
      [Array.from({ length: 3 }, () => ({ kind: "BOAT", amountSatang: 1_000_000_000 })), "COST_AMOUNT_INVALID"], [Array.from({ length: 31 }, () => ({ kind: "FUEL", amountSatang: 100 })), "COST_ROWS_LIMIT"]];
    const bad = cases.map(([raw, code], i) => { const r = PCR(raw); return r.ok === false && r.code === code ? null : `#${i} ${fmt(raw).slice(0, 40)} ⇒ ${fmt(r)}`; }).filter(Boolean);
    ok(bad.length === 0, bad.slice(0, 3).join(" · "));
    eq(PCR(row({ note: "ก".repeat(200) })).ok, true, "200 ตัวได้");
  });
  await st("P-16", "costContentKey: ไม่ขึ้นกับลำดับ · นับซ้ำ (2 แถวเหมือนกัน ≠ 1 แถว) · หมายเหตุ/ชนิด/ยอดต่าง ⇒ ต่าง · null กับไม่มีหมายเหตุเท่ากัน", () => {
    const K = (rows: Rec[]) => String(pure("costContentKey", rows));
    const a = { kind: "BOAT", amountSatang: 100, note: "x" }, b = { kind: "FUEL", amountSatang: 50, note: null };
    eq(K([a, b]), K([b, a]), "ลำดับ"); ok(K([a, a]) !== K([a]), "นับซ้ำ"); ok(K([a]) !== K([{ ...a, note: "y" }]) && K([a]) !== K([{ ...a, kind: "FUEL" }]) && K([a]) !== K([{ ...a, amountSatang: 101 }]), "ต่าง");
    eq(K([{ kind: "FUEL", amountSatang: 50, note: null }]), K([b]), "null");
  });
  await st("P-17", "reportCsv: BOM + บรรทัดแจ้ง (ถ้ามี) + หัว + CRLF ทุกบรรทัด · สตริงกันสูตร (=,+,-,@ ⇒ ') · {satang} ⇒ บาท 2 ตำแหน่ง ไม่มีตัวคั่น ไม่ใส่ ' (−120000 ⇒ -1200.00 · 5 ⇒ 0.05 · −5 ⇒ -0.05) · {bp} ⇒ % 2 ตำแหน่ง · null ⇒ ว่าง", () => {
    const s = String(pure("reportCsv", ["a", "b", "c", "d"], [["=1+1", { satang: -120_000 }, { bp: 6250 }, null], ["-x", { satang: 5 }, { bp: -1 }, 7], ["ก,\"ข\"", { satang: -5 }, { bp: 10_000 }, "@y"]], "แจ้ง"));
    eq(s, "﻿แจ้ง,,,\r\na,b,c,d\r\n'=1+1,-1200.00,62.50,\r\n'-x,0.05,-0.01,7\r\n\"ก,\"\"ข\"\"\",-0.05,100.00,'@y\r\n", "ไฟล์");
    eq(String(pure("reportCsv", ["h"], [])), "﻿h\r\n", "ไม่มีแถว");
  });
  await st("P-18", "reportFileName: trips-report-<from>-<to>.csv · วันไม่จริง/มีอักขระแปลก ⇒ trips-report.csv · ผลตรง /^[A-Za-z0-9.-]{1,60}$/", () => {
    eq([pure("reportFileName", "2027-04-01", "2027-04-30"), pure("reportFileName", "2027-02-30", "2027-03-01"), pure("reportFileName", "../x", "y")], ["trips-report-2027-04-01-2027-04-30.csv", "trips-report.csv", "trips-report.csv"], "ชื่อ");
  });
  groupLine("P");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uT = rid("uT"), uB = rid("uB");
  let setupErr = "";
  const U: Record<string, { userId: string; tenantId: string }> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; adult: string; child: string }> = {};
  let seq = 0;
  const DEP: Record<string, string> = {};
  const BK: Record<string, string> = {};
  let codeSeq = 0;
  const MARK = 777_700; // ยอดขายเครื่องหมายของหน่วย/ร้านอื่น
  try {
    for (const t of ["TripProduct", "TripOption", "TripPaxType", "TripDeparture", "TripBooking", "TripBookingItem", "TripMoneyEvent", "TripCost", "AuditLog"]) await needTable(t);
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T1.7 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag, tz] of [[uA, tA, "a", "Asia/Bangkok"], [uA2, tA, "a2", "Asia/Bangkok"], [uT, tA, "tokyo", "Asia/Tokyo"], [uB, tB, "b", "Asia/Bangkok"]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify({ timezone: tz }), updatedAt: new Date() });
    const mkUser = async (tag: string, tenantId: string, role: string, unitAccess: string[], perms: string[]) => {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(Object.fromEntries(perms.map((p) => [p, true]))), acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { userId: id, tenantId };
    };
    const DV = "trips.departure.view";
    await mkUser("oa", tA, "OWNER", ["*"], []);
    await mkUser("ob", tB, "OWNER", ["*"], []);
    await mkUser("mg", tA, "MANAGER", [uA], []);
    await mkUser("rv", tA, "STAFF", [uA], [DV, "trips.report.view"]);
    await mkUser("cv", tA, "STAFF", [uA], [DV, "trips.report.view", "trips.cost.view"]);
    await mkUser("ce", tA, "STAFF", [uA], [DV, "trips.cost.edit"]);
    await mkUser("cvo", tA, "STAFF", [uA], [DV, "trips.cost.view"]);
    await mkUser("bv", tA, "STAFF", [uA], [DV, "trips.booking.view"]);
    await mkUser("dv", tA, "STAFF", [uA], [DV]);
    await mkUser("nodv", tA, "STAFF", [uA], ["trips.report.view", "trips.cost.view", "trips.cost.edit"]);
    await mkUser("wild", tA, "STAFF", [uA], ["trips.*"]);
    await mkUser("none", tA, "STAFF", [uA], []);
    await mkUser("a2", tA, "STAFF", [uA2], [DV, "trips.report.view", "trips.cost.view", "trips.cost.edit"]);
    await mkUser("tk", tA, "STAFF", [uT], [DV, "trips.report.view", "trips.cost.view"]);
    const mkProd = async (key: string, tenantId: string, unitId: string, o: { title?: string; source?: string } = {}) => {
      const id = rid(`p${key}`), opt = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t17qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: o.source ?? "OWN", status: "ACTIVE",
        title: JSON.stringify({ th: o.title ?? `ทดสอบ ${key}`, en: o.title ?? `Test ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
      await insertRow("TripOption", { id: opt, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const adult = await insertRow("TripPaxType", { id: rid("pta"), tenantId, unitId, productId: id, code: "ADULT", label: JSON.stringify({ th: "ผู้ใหญ่", en: "Adult" }), countsCapacity: true, active: true, sortOrder: 0, updatedAt: new Date() });
      const child = await insertRow("TripPaxType", { id: rid("ptc"), tenantId, unitId, productId: id, code: "CHILD", label: JSON.stringify({ th: "เด็ก", en: "Child" }), countsCapacity: true, active: true, sortOrder: 1, updatedAt: new Date() });
      PRD[key] = { id, opt, unit: unitId, tenant: tenantId, adult, child };
    };
    await mkProd("PR", tA, uA, { title: "ราชาทดสอบ" });
    await mkProd("PX", tA, uA, { title: `=HYPERLINK("http://evil.example/${STAMP}","x")` });
    await mkProd("PS", tA, uA, { title: "ทริปผู้ให้บริการ", source: "SUPPLIER" });
    await mkProd("PA2", tA, uA2); await mkProd("PT", tA, uT); await mkProd("PB", tB, uB);
    const mkDep = async (key: string, prod: string, date: string, o: { cap?: number; sold?: number; held?: number; status?: string; hm?: string; hours?: number } = {}) => {
      const p = PRD[prod]; const startsAt = new Date(BKK(date, o.hm ?? "08:00").getTime() + (seq++ % 600) * 60_000);
      const tzShift = p.unit === uT ? -2 * HOUR : 0; // โตเกียวเร็วกว่ากรุงเทพ 2 ชม. (เวลาเริ่มตามท้องถิ่น ~08:00)
      const id = rid(`d${key}`);
      await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt: new Date(startsAt.getTime() + tzShift),
        endsAt: new Date(startsAt.getTime() + tzShift + (o.hours ?? 8.5) * HOUR), status: o.status ?? "GUARANTEED", capacity: o.cap ?? 24, sold: o.sold ?? 0, held: o.held ?? 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
      DEP[key] = id; return id;
    };
    type BkIn = { dep: string; prod: string; status: string; channel: string; adults: number; children?: number; paid?: number; refunded?: number; commission?: number; created: string; collectMode?: string; currency?: string;
      retained?: { amountSatang: number; vatSatang: number; passThroughSatang: number }[]; snapshot?: "ok" | "missing" };
    const mkBk = async (key: string, b: BkIn) => {
      const p = PRD[b.prod]; const ch = b.children ?? 0;
      const sales = b.adults * ADULT + ch * CHILD, pt = b.adults * PARK_A + ch * PARK_C, vat = vatIncl(sales), payable = sales + pt;
      const id = rid(`b${key}`);
      const snap = b.snapshot === "missing" ? {} : { currency: "THB", totals: { grossSatang: payable, discountSatang: 0, agentDiscountSatang: 0, passThroughSatang: pt, vatSatang: vat, payableSatang: payable } };
      await insertRow("TripBooking", { id, tenantId: p.tenant, unitId: p.unit, code: `T17-${STAMP}-${++codeSeq}`, publicTokenHash: `t17${hex(12)}`, status: b.status, productId: p.id, departureId: b.dep,
        travelDate: (await q<{ d: string }>(`SELECT "localDate"::text AS d FROM "TripDeparture" WHERE id = $1`, [b.dep]))[0]?.d, channel: b.channel, collectMode: b.collectMode ?? "SHOP", payMethod: "PAY_LATER",
        contactRoute: b.channel.startsWith("AGENT") ? "VIA_AGENT" : "DIRECT", currency: b.currency ?? "THB", grossSatang: payable, discountSatang: 0, agentDiscountSatang: 0, passThroughSatang: pt, vatSatang: vat,
        commissionSatang: b.commission ?? 0, commissionVatSatang: 0, whtSatang: 0, netToShopSatang: payable - (b.commission ?? 0), paidSatang: b.paid ?? 0, refundedSatang: b.refunded ?? 0,
        accountingState: "NONE", policySnapshot: JSON.stringify(snap), version: 0, marketingEligible: false, createdAt: new Date(b.created), updatedAt: new Date(b.created) });
      const item = async (kind: string, qty: number, amount: number, o: { pax?: string; ptf?: boolean; vat?: number } = {}) => {
        if (qty <= 0) return;
        await insertRow("TripBookingItem", { id: rid("it"), tenantId: p.tenant, unitId: p.unit, bookingId: id, departureId: b.dep, kind, paxTypeId: o.pax ?? null, qty, unitPriceMinor: Math.round(amount / qty), amountMinor: amount, amountSatang: amount,
          vatSatang: o.vat ?? 0, commissionable: !o.ptf, discountable: !o.ptf, passThrough: !!o.ptf, taxKind: o.ptf ? "NONE" : "VAT7", priceSource: "RETAIL", active: true, updatedAt: new Date() });
      };
      await item("SEAT", b.adults, b.adults * ADULT, { pax: p.adult }); await item("SEAT", ch, ch * CHILD, { pax: p.child }); await item("EXTRA", b.adults + ch, pt, { ptf: true });
      for (const [i, r] of (b.retained ?? []).entries()) await insertRow("TripMoneyEvent", { id: rid("me"), tenantId: p.tenant, unitId: p.unit, bookingId: id, kind: "RETAINED", amountSatang: r.amountSatang, vatSatang: r.vatSatang,
        passThroughSatang: r.passThroughSatang, tender: "CASH", postingStatus: "UNPOSTED", postingAttempts: 0, idempotencyKey: `t17-ret-${id}-${i}`, createdAt: new Date(b.created), updatedAt: new Date(b.created) });
      BK[key] = id; return id;
    };
    const mkCost = async (dep: string, prod: string, kind: string, amount: number, note: string | null = null) => {
      const p = PRD[prod]; return insertRow("TripCost", { id: rid("c"), tenantId: p.tenant, unitId: p.unit, departureId: dep, kind, amountSatang: amount, note, createdAt: new Date(Date.parse("2027-03-01T00:00:00Z") + (seq++) * 1000), updatedAt: new Date("2027-03-01T00:00:00Z") });
    };
    // ── dR = แผงรอบภาพ 11 (6 การจอง 15 คน) + ถือ/รอ/หมดเวลา (ไม่นับเงิน) ──
    const dR = await mkDep("R", "PR", "2027-04-10", { cap: 24, sold: 15, held: 2 });
    await mkBk("0142", { dep: dR, prod: "PR", status: "PAID", channel: "LIFF", adults: 2, children: 1, paid: 1_095_000, created: "2027-03-01T03:00:00Z" });
    await mkBk("0151", { dep: dR, prod: "PR", status: "CONFIRMED", channel: "AGENT_PORTAL", adults: 2, commission: 105_000, created: "2027-03-31T17:30:00Z" });
    await mkBk("0148", { dep: dR, prod: "PR", status: "PART_PAID", channel: "AGENT_LINK", adults: 4, paid: 500_000, commission: 210_000, created: "2027-04-05T03:00:00Z" });
    await mkBk("0155", { dep: dR, prod: "PR", status: "PAID", channel: "WEB", adults: 2, paid: 820_000, created: "2027-04-09T16:30:00Z" });
    await mkBk("0157", { dep: dR, prod: "PR", status: "CONFIRMED", channel: "AGENT_PORTAL", adults: 2, children: 1, commission: 94_500, created: "2027-01-20T03:00:00Z" });
    await mkBk("0160", { dep: dR, prod: "PR", status: "CONFIRMED", channel: "COUNTER", adults: 1, created: "2027-04-10T00:30:00Z" });
    await mkBk("hold", { dep: dR, prod: "PR", status: "HOLD", channel: "WEB", adults: 2, created: "2027-04-02T03:00:00Z" });
    await mkBk("pend", { dep: dR, prod: "PR", status: "PENDING", channel: "WEB", adults: 1, created: "2027-04-03T03:00:00Z" });
    await mkBk("exp", { dep: dR, prod: "PR", status: "EXPIRED", channel: "WEB", adults: 1, paid: 0, created: "2027-04-04T03:00:00Z" });
    for (const [k, a, n] of [["BOAT", 1_200_000, "เรือราชา 1"], ["FUEL", 350_000, null], ["GUIDE", 300_000, "ไกด์ 2 คน"], ["FOOD", 150_000, null], ["TRANSPORT", 150_000, "รถตู้ 2 คัน"]] as const) await mkCost(dR, "PR", k, a, n);
    // ── dN: เดินทางแล้ว + ไม่มา + ยกเลิกเก็บไว้ · ต้นทุนเรือ 400,000 + อุทยานของไกด์ 100,000 ──
    const dN = await mkDep("N", "PR", "2027-04-11", { cap: 12, sold: 3 });
    await mkBk("trav", { dep: dN, prod: "PR", status: "TRAVELLED", channel: "COUNTER", adults: 1, paid: 410_000, created: "2027-04-10T03:00:00Z" });
    await mkBk("nosh", { dep: dN, prod: "PR", status: "NO_SHOW", channel: "WEB", adults: 2, paid: 820_000, created: "2027-03-20T03:00:00Z" });
    await mkBk("cxlN", { dep: dN, prod: "PR", status: "CANCELLED", channel: "COUNTER", adults: 2, paid: 820_000, refunded: 470_000, created: "2027-03-25T03:00:00Z", retained: [{ amountSatang: 350_000, vatSatang: 22_897, passThroughSatang: 0 }] });
    await mkCost(dN, "PR", "BOAT", 400_000); await mkCost(dN, "PR", "PARK_FEE", 100_000, "อุทยานของไกด์");
    // ── dX: รอบยกเลิก (การจองยกเลิกยังไม่จ่าย) · ต้นทุนน้ำมัน 120,000 · dP: ไม่มีการจอง (สินค้า PX ชื่อแบบสูตร) · dOut: นอกช่วง ──
    const dX = await mkDep("X", "PR", "2027-04-12", { cap: 24, sold: 0, status: "CANCELLED" });
    await mkBk("cxlX", { dep: dX, prod: "PR", status: "CANCELLED", channel: "WEB", adults: 3, created: "2027-03-26T03:00:00Z" });
    await mkCost(dX, "PR", "FUEL", 120_000);
    await mkDep("P", "PX", "2027-04-20", { cap: 10, sold: 0, status: "OPEN" });
    const dOut = await mkDep("Out", "PR", "2027-05-05", { cap: 24, sold: 2 });
    await mkBk("out", { dep: dOut, prod: "PR", status: "PAID", channel: "WEB", adults: 2, paid: 820_000, created: "2027-04-06T03:00:00Z" });
    await mkCost(dOut, "PR", "BOAT", 900_000);
    // ── dC: รอบสำหรับบริการต้นทุน (ไม่มีการจอง) · dS: สินค้าผู้ให้บริการ ──
    await mkDep("C", "PR", "2027-06-15", { cap: 20, sold: 0, status: "OPEN" }); // นอกช่วง เม.ย. (ไม่กระทบยอดรายงาน)
    const dS = await mkDep("S", "PS", "2027-06-16", { cap: 10, sold: 1, status: "OPEN" });
    await mkBk("sup", { dep: dS, prod: "PS", status: "CONFIRMED", channel: "COUNTER", adults: 1, created: "2027-05-20T03:00:00Z", currency: "USD" });
    // ── หน่วย/ร้านอื่น (เครื่องหมาย 777,700 ที่นั่งเดียว + ต้นทุน 999,900) ──
    for (const [k, prod, date] of [["A2", "PA2", "2027-04-10"], ["T", "PT", "2027-04-10"], ["B", "PB", "2027-04-10"]] as const) {
      const d = await mkDep(k, prod, date, { cap: 30, sold: 2 });
      await mkCost(d, prod, "BOAT", 999_900);
    }
    for (const k of ["A2", "B"]) {
      const p = PRD[k === "A2" ? "PA2" : "PB"];
      await insertRow("TripBooking", { id: rid(`bm${k}`), tenantId: p.tenant, unitId: p.unit, code: `T17-${STAMP}-${++codeSeq}`, publicTokenHash: `t17${hex(12)}`, status: "PAID", productId: p.id, departureId: DEP[k], travelDate: "2027-04-10",
        channel: "WEB", collectMode: "SHOP", payMethod: "PAY_LATER", contactRoute: "DIRECT", currency: "THB", grossSatang: MARK, discountSatang: 0, agentDiscountSatang: 0, passThroughSatang: 0, vatSatang: 0, commissionSatang: 0,
        commissionVatSatang: 0, whtSatang: 0, netToShopSatang: MARK, paidSatang: MARK, refundedSatang: 0, accountingState: "NONE", policySnapshot: JSON.stringify({ totals: { payableSatang: MARK, passThroughSatang: 0, vatSatang: 0 } }),
        version: 0, marketingEligible: false, createdAt: new Date("2027-04-02T03:00:00Z"), updatedAt: new Date() });
    }
    await mkBk("tk1", { dep: DEP.T, prod: "PT", status: "CONFIRMED", channel: "WEB", adults: 1, created: "2027-04-09T16:30:00Z" });
    await mkBk("tk2", { dep: DEP.T, prod: "PT", status: "CONFIRMED", channel: "WEB", adults: 1, created: "2027-03-31T15:30:00Z" });
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const needSetup = () => { ok(!setupErr, `ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); };
  const ctxOf = (tag: string): Ctx => { const a = U[tag]; if (!a) throw new AssertFail(`ไม่มีผู้ใช้ชั่วคราว ${tag} (${setupErr || "ยังไม่ตั้ง"})`); return { tenantId: a.tenantId, actorUserId: a.userId }; };
  const optsR = { now: NOW_R };
  const costRowsDb = async (dep: string) => q<{ id: string; kind: string; amountSatang: number; note: string | null; updatedAt: Date }>(`SELECT id, kind, "amountSatang", note, "updatedAt" FROM "TripCost" WHERE "departureId" = $1 ORDER BY "createdAt", id`, [dep]);
  const auditCount = async (action: string, target: string) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = $1 AND "targetId" = $2`, [action, target]))[0]?.n ?? 0;
  const content = (rows: { kind: string; amountSatang: number; note: string | null }[]) => rows.map((r) => `${r.kind}|${r.amountSatang}|${r.note ?? ""}`).sort();
  const loadCosts = (tag: string, dep: string, unit = uA) => call("loadDepartureCostsVM", ctxOf(tag), { unitId: unit, departureId: dep }, optsR);
  const save = (tag: string, dep: string, token: unknown, rows: unknown, unit = uA) => call("saveDepartureCosts", ctxOf(tag), { unitId: unit, departureId: dep, expectedToken: token, rows }, optsR);
  const tokenOf = async (dep: string, tag = "oa") => String(asRec(VM(await loadCosts(tag, dep), "loadDepartureCostsVM").costs)?.token ?? "");

  // ═══════════════ CT. บริการต้นทุน ═══════════════
  console.log("\n── CT: บันทึกต้นทุนรอบ ──");
  const DESIGN_ROWS = [{ kind: "BOAT", amountSatang: 1_200_000, note: `เรือ ${STAMP}-NOTE` }, { kind: "FUEL", amountSatang: 350_000 }, { kind: "GUIDE", amountSatang: 300_000, note: "ไกด์ 2 คน" }, { kind: "FOOD", amountSatang: 150_000 }, { kind: "TRANSPORT", amountSatang: 150_000 }];
  let tok0 = "", tok1 = "";
  await st("CT-1", "รอบที่ยังไม่มีต้นทุน (OWNER): rows [] · total 0 · token สตริง ≥ 16 ตัว · byKind [] · perSeat null (ขาย 0) · ไม่เขียนฐาน", async () => {
    needSetup(); const n0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1`, [tA]))[0]?.n;
    const vm = VM(await loadCosts("oa", DEP.C), "load"); const c = asRec(vm.costs) ?? {};
    eq([asArr(c.rows).length, c.totalSatang, asArr(c.byKind).length, c.perSeatSatang], [0, 0, 0, null], "ว่าง");
    tok0 = String(c.token ?? ""); ok(tok0.length >= 16 && tok0.length <= 128, `token ${tok0}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1`, [tA]))[0]?.n, n0, "audit (ตัวโหลดไม่เขียน)");
  });
  await st("CT-2", "บันทึก 5 แถว (ภาพ 11 แตก): applied true · total 2,150,000 · แถวในฐานตรงชุด · token ใหม่ · audit trips.cost.saved 1 แถว (after count 5 total 2,150,000 · byKind) ไม่มีข้อความหมายเหตุ", async () => {
    needSetup(); const v = V(await save("oa", DEP.C, tok0, DESIGN_ROWS), "save");
    eq([v.applied, v.totalSatang, asArr(v.rows).length], [true, 2_150_000, 5], "ผล");
    eq(content(await costRowsDb(DEP.C)), content(DESIGN_ROWS.map((r) => ({ ...r, note: r.note ?? null }))), "แถวในฐาน");
    tok1 = String(v.token ?? ""); ok(tok1 && tok1 !== tok0, "token ต้องเปลี่ยน");
    const au = await q<{ after: Rec; before: Rec; targetType: string; unitId: string; actorId: string }>(`SELECT after, before, "targetType", "unitId", "actorId" FROM "AuditLog" WHERE action = 'trips.cost.saved' AND "targetId" = $1`, [DEP.C]);
    eq(au.length, 1, "audit"); const a = au[0];
    eq([a.targetType, a.unitId, a.actorId, asRec(a.after)?.count, asRec(a.after)?.totalSatang, asRec(asRec(a.after)?.byKind)?.BOAT, asRec(a.before)?.totalSatang], ["TripDeparture", uA, U.oa.userId, 5, 2_150_000, 1_200_000, 0], "audit");
    ok(!JSON.stringify(au).includes(`${STAMP}-NOTE`) && !JSON.stringify(au).includes("ไกด์ 2 คน"), "audit มีข้อความหมายเหตุ");
  });
  await st("CT-3", "ส่งซ้ำ (token เก่า เนื้อหาเดิม): ok · applied false · ไม่เขียนแถว (id/updatedAt เดิม) · audit ไม่เพิ่ม", async () => {
    needSetup(); const before = await costRowsDb(DEP.C);
    const v = V(await save("oa", DEP.C, tok0, DESIGN_ROWS), "resend");
    eq([v.applied, v.token, v.totalSatang], [false, tok1, 2_150_000], "ผล");
    eq((await costRowsDb(DEP.C)).map((r) => [r.id, r.updatedAt.toISOString()]), before.map((r) => [r.id, r.updatedAt.toISOString()]), "แถว");
    eq(await auditCount("trips.cost.saved", DEP.C), 1, "audit");
  });
  await st("CT-4", "token เก่า เนื้อหาต่าง ⇒ STATE_CONFLICT · ไม่เขียน", async () => {
    needSetup(); const before = content(await costRowsDb(DEP.C));
    codeR(await save("oa", DEP.C, tok0, [{ kind: "BOAT", amountSatang: 1 }]), "STATE_CONFLICT", "ชนกัน");
    eq(content(await costRowsDb(DEP.C)), before, "แถว"); eq(await auditCount("trips.cost.saved", DEP.C), 1, "audit");
  });
  await st("CT-5", "แก้ด้วย token ปัจจุบัน: เปลี่ยนยอดแถวเรือ · ลบแถวรถ · เพิ่มแถวใหม่ ⇒ แถวที่คงไว้ id เดิม · ชุดในฐานตรง · audit +1 (before 2,150,000 → after 2,200,000)", async () => {
    needSetup(); const cur = await costRowsDb(DEP.C); const tok = await tokenOf(DEP.C);
    const boat = cur.find((r) => r.kind === "BOAT"), drop = cur.find((r) => r.kind === "TRANSPORT"); ok(boat && drop, `ไม่พบแถว BOAT/TRANSPORT: ${fmt(cur)}`);
    const keep = cur.filter((r) => r.id !== boat?.id && r.id !== drop?.id);
    const want = [{ id: String(boat?.id), kind: "BOAT", amountSatang: 1_300_000, note: boat?.note ?? null }, ...keep.map((r) => ({ id: r.id, kind: r.kind, amountSatang: r.amountSatang, note: r.note })), { kind: "EQUIPMENT", amountSatang: 100_000, note: "ถังอากาศ" }];
    const v = V(await save("oa", DEP.C, tok, want), "edit");
    eq([v.applied, v.totalSatang], [true, 2_200_000], "ผล");
    const after = await costRowsDb(DEP.C);
    ok([boat, ...keep].every((r) => after.some((x) => x.id === r?.id)) && !after.some((x) => x.id === drop?.id), "id ที่คงไว้/ลบ");
    eq(content(after), content(want.map((r) => ({ ...r, note: r.note ?? null }))), "ชุด");
    const a = (await q<{ before: Rec; after: Rec }>(`SELECT before, after FROM "AuditLog" WHERE action = 'trips.cost.saved' AND "targetId" = $1 ORDER BY "createdAt" DESC, id DESC LIMIT 1`, [DEP.C]))[0];
    eq([await auditCount("trips.cost.saved", DEP.C), asRec(a?.before)?.totalSatang, asRec(a?.after)?.totalSatang, asRec(a?.after)?.count], [2, 2_150_000, 2_200_000, 5], "audit");
  });
  await st("CT-6", "บันทึกชุดเดิมด้วย token ปัจจุบัน ⇒ applied false · ไม่มี audit · token ไม่เปลี่ยน", async () => {
    needSetup(); const tok = await tokenOf(DEP.C); const cur = await costRowsDb(DEP.C);
    const v = V(await save("oa", DEP.C, tok, cur.map((r) => ({ id: r.id, kind: r.kind, amountSatang: r.amountSatang, note: r.note }))), "same");
    eq([v.applied, v.token], [false, tok], "ผล"); eq(await auditCount("trips.cost.saved", DEP.C), 2, "audit");
  });
  await st("CT-7", "พร้อมกัน 10 ทาง token เดียวกัน เนื้อหาต่างกัน ⇒ สำเร็จ 1 · STATE_CONFLICT 9 · แถวสุดท้าย = ของผู้ชนะ · audit +1", async () => {
    needSetup(); const tok = await tokenOf(DEP.C);
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => save(i % 2 ? "oa" : "ce", DEP.C, tok, [{ kind: "OTHER", amountSatang: 10_000 + i, note: `ทาง ${i}` }])));
    const wins = rs.map((r, i) => [r, i] as const).filter(([r]) => r.ok === true && asRec(r.value)?.applied === true);
    eq([wins.length, rs.filter((r) => r.ok === false && r.code === "STATE_CONFLICT").length], [1, 9], `ผล ${fmt(rs.map((r) => r.code ?? asRec(r.value)?.applied))}`);
    const w = wins[0][1];
    eq(content(await costRowsDb(DEP.C)), [`OTHER|${10_000 + w}|ทาง ${w}`], "แถวของผู้ชนะ"); eq(await auditCount("trips.cost.saved", DEP.C), 3, "audit");
  });
  await st("CT-8", "พร้อมกัน 10 ทาง เนื้อหาเหมือนกัน ⇒ applied true 1 · applied false 9 (ทุกตัว ok) · ไม่มีแถวซ้ำ · audit +1", async () => {
    needSetup(); const tok = await tokenOf(DEP.C);
    const same = [{ kind: "FUEL", amountSatang: 55_500, note: "เหมือนกัน" }, { kind: "FOOD", amountSatang: 44_400 }];
    const rs = await Promise.all(Array.from({ length: 10 }, () => save("oa", DEP.C, tok, same)));
    eq([rs.filter((r) => r.ok === true).length, rs.filter((r) => asRec(r.value)?.applied === true).length], [10, 1], `ผล ${fmt(rs.map((r) => r.code ?? asRec(r.value)?.applied))}`);
    eq(content(await costRowsDb(DEP.C)), content(same.map((r) => ({ ...r, note: r.note ?? null }))), "แถว"); eq(await auditCount("trips.cost.saved", DEP.C), 4, "audit");
  });
  await st("CT-9", "ตารางสิทธิ์: OWNER/MANAGER/trips.*/cost.edit บันทึกได้ · cost.view อ่านได้ บันทึก FORBIDDEN · report.view/booking.view/departure.view/ไม่มีสิทธิ์/ขาด departure.view ⇒ อ่านและบันทึก FORBIDDEN · ไม่มีการเขียนจากผู้ถูกปฏิเสธ", async () => {
    needSetup();
    for (const t of ["oa", "mg", "wild", "ce", "cv", "cvo"]) ok(VM(await loadCosts(t, DEP.C), `load ${t}`).costs, `${t} อ่าน`);
    for (const t of ["rv", "bv", "dv", "none", "nodv"]) codeR(await loadCosts(t, DEP.C), "FORBIDDEN", `load ${t}`);
    eq(asRec(VM(await loadCosts("cv", DEP.C), "cv").flags)?.canEdit, false, "cv canEdit"); eq(asRec(VM(await loadCosts("ce", DEP.C), "ce").flags)?.canEdit, true, "ce canEdit");
    const before = content(await costRowsDb(DEP.C)); const tok = await tokenOf(DEP.C);
    for (const t of ["cv", "cvo", "rv", "bv", "dv", "none", "nodv"]) codeR(await save(t, DEP.C, tok, [{ kind: "BOAT", amountSatang: 5 }]), "FORBIDDEN", `save ${t}`);
    eq(content(await costRowsDb(DEP.C)), before, "ไม่เขียน");
    for (const t of ["mg", "wild", "ce"]) { const tk = await tokenOf(DEP.C); ok(V(await save(t, DEP.C, tk, [{ kind: "OTHER", amountSatang: 1000 + t.length }]), `save ${t}`).applied === true, `${t} บันทึก`); }
  });
  await st("CT-10", "อินพุตอันตรายผ่านบริการ: kind นอกชุด · ทศนิยม · note มี NUL/ขึ้นบรรทัด · 0 · เกินเพดาน · 31 แถว · token ไม่ใช่สตริง/ยาว 129 · คีย์เกิน · departureId มี NUL ⇒ รหัสตามใบสั่ง · ไม่เขียน", async () => {
    needSetup(); const before = content(await costRowsDb(DEP.C)); const tok = await tokenOf(DEP.C);
    codeR(await save("oa", DEP.C, tok, [{ kind: "COMMISSION", amountSatang: 1 }]), "INVALID_INPUT", "kind"); codeR(await save("oa", DEP.C, tok, [{ kind: "BOAT", amountSatang: 1.25 }]), "INVALID_INPUT", "ทศนิยม");
    codeR(await save("oa", DEP.C, tok, [{ kind: "BOAT", amountSatang: 1, note: "a\u0000" }]), "INVALID_INPUT", "NUL"); codeR(await save("oa", DEP.C, tok, [{ kind: "BOAT", amountSatang: 1, note: "=1+1\n@x" }]), "INVALID_INPUT", "LF");
    codeR(await save("oa", DEP.C, tok, [{ kind: "BOAT", amountSatang: 0 }]), "COST_AMOUNT_INVALID", "0"); codeR(await save("oa", DEP.C, tok, [{ kind: "BOAT", amountSatang: 1_000_000_001 }]), "COST_AMOUNT_INVALID", "เกิน");
    codeR(await save("oa", DEP.C, tok, Array.from({ length: 31 }, () => ({ kind: "FUEL", amountSatang: 1 }))), "COST_ROWS_LIMIT", "31");
    codeR(await save("oa", DEP.C, 12345, []), "INVALID_INPUT", "token ตัวเลข"); codeR(await save("oa", DEP.C, "x".repeat(129), []), "INVALID_INPUT", "token ยาว");
    codeR(await call("saveDepartureCosts", ctxOf("oa"), { unitId: uA, departureId: DEP.C, expectedToken: tok, rows: [], extra: 1 }, optsR), "INVALID_INPUT", "คีย์เกิน");
    codeR(await save("oa", `${DEP.C}\u0000`, tok, []), ["INVALID_INPUT", "NOT_FOUND"], "departureId NUL");
    eq(content(await costRowsDb(DEP.C)), before, "ไม่เขียน"); eq(await tokenOf(DEP.C), tok, "token เดิม");
  });
  await st("CT-11", "แยกหน่วย/ร้าน: id แถวของรอบอื่น (dR) ⇒ NOT_FOUND ไม่เขียน · รอบของหน่วย a2 ส่งด้วย unitId a ⇒ NOT_FOUND · ผู้ใช้หน่วย a2 / เจ้าของร้าน B กับรอบหน่วย a ⇒ NOT_FOUND (อ่าน+บันทึก)", async () => {
    needSetup(); const tok = await tokenOf(DEP.C); const foreign = (await costRowsDb(DEP.R))[0];
    const before = content(await costRowsDb(DEP.C)), beforeR = content(await costRowsDb(DEP.R));
    codeR(await save("oa", DEP.C, tok, [{ id: foreign.id, kind: "BOAT", amountSatang: 1 }]), "NOT_FOUND", "id ของรอบอื่น");
    eq([content(await costRowsDb(DEP.C)), content(await costRowsDb(DEP.R))], [before, beforeR], "ไม่เขียน");
    codeR(await loadCosts("oa", DEP.A2, uA), "NOT_FOUND", "รอบหน่วยอื่น"); codeR(await save("oa", DEP.A2, "x", [], uA), "NOT_FOUND", "บันทึกรอบหน่วยอื่น");
    codeR(await loadCosts("a2", DEP.C), "NOT_FOUND", "ผู้ใช้หน่วยอื่น"); codeR(await save("a2", DEP.C, tok, []), "NOT_FOUND", "a2 บันทึก");
    codeR(await call("loadDepartureCostsVM", ctxOf("ob"), { unitId: uA, departureId: DEP.C }, optsR), "NOT_FOUND", "ร้าน B");
    codeR(await call("saveDepartureCosts", ctxOf("ob"), { unitId: uA, departureId: DEP.C, expectedToken: tok, rows: [] }, optsR), "NOT_FOUND", "ร้าน B บันทึก");
    eq((await costRowsDb(DEP.A2)).length, 1, "แถวหน่วย a2 คงเดิม");
  });
  await st("CT-12", "รอบยกเลิก (dX) แก้ต้นทุนได้ (OWNER) · ลบจนว่าง ⇒ applied true · คืนแถวเดิม", async () => {
    needSetup(); let tok = await tokenOf(DEP.X); const cur = await costRowsDb(DEP.X);
    ok(V(await save("oa", DEP.X, tok, []), "ลบหมด").applied === true, "ลบหมด"); eq((await costRowsDb(DEP.X)).length, 0, "ว่าง");
    tok = await tokenOf(DEP.X); ok(V(await save("oa", DEP.X, tok, cur.map((r) => ({ kind: r.kind, amountSatang: r.amountSatang, note: r.note }))), "คืน").applied === true, "คืน");
    eq(content(await costRowsDb(DEP.X)), content(cur), "ชุดเดิม");
  });
  await st("CT-13", "VM ของ dR (แถว seed ของข้อสอบ): rows เรียง createdAt · byKind เรียงตาม TRIP_COST_KINDS เฉพาะที่มี · total 2,150,000 · ต่อที่นั่ง round(2,150,000/15) = 143,333 · money.costSatang = total · state ENDED_NOT_CLOSED · estimate true", async () => {
    needSetup(); const vm = VM(await loadCosts("cvo", DEP.R), "dR"); const c = asRec(vm.costs) ?? {};
    eq(asArr(c.rows).map((r) => [r.kind, r.amountSatang]), [["BOAT", 1_200_000], ["FUEL", 350_000], ["GUIDE", 300_000], ["FOOD", 150_000], ["TRANSPORT", 150_000]], "rows");
    eq(asArr(c.byKind).map((r) => [r.kind, r.amountSatang]), [["BOAT", 1_200_000], ["FUEL", 350_000], ["GUIDE", 300_000], ["FOOD", 150_000], ["TRANSPORT", 150_000]], "byKind");
    eq([c.totalSatang, c.perSeatSatang, asRec(vm.money)?.costSatang, asRec(vm.departure)?.state, asRec(vm.departure)?.estimate], [2_150_000, 143_333, 2_150_000, "ENDED_NOT_CLOSED", true], "ค่า");
  });
  await st("CT-14", "คำเตือน: dN (มีเงินเก็บแทน + แถว PARK_FEE) ⇒ PARK_FEE_WITH_PASS_THROUGH · dR ไม่มี · dS (สินค้าผู้ให้บริการ · การจอง USD) ⇒ SUPPLIER_COSTS_NOT_INCLUDED + FX_BOOKINGS n=1", async () => {
    needSetup();
    const codes = async (d: string) => asArr(VM(await loadCosts("oa", d), d).warnings).map((w) => String(w.code));
    ok((await codes(DEP.N)).includes("PARK_FEE_WITH_PASS_THROUGH"), "dN"); ok(!(await codes(DEP.R)).includes("PARK_FEE_WITH_PASS_THROUGH"), "dR ไม่ควรเตือน");
    const ws = asArr(VM(await loadCosts("oa", DEP.S), "dS").warnings);
    ok(ws.some((w) => w.code === "SUPPLIER_COSTS_NOT_INCLUDED") && ws.some((w) => w.code === "FX_BOOKINGS" && w.n === 1), `dS ${fmt(ws)}`);
  });
  await st("CT-15", "ช่องทางของรอบ dR (จอต้นทุน): ขายตรง LIFF 1/3 · WEB 1/2 · COUNTER 1/1 · เอเจนซี่ AGENT_PORTAL 2/5 คอมฯ 199,500 · AGENT_LINK 1/4 คอมฯ 210,000 · เรียงกลุ่ม DIRECT→AGENT", async () => {
    needSetup(); const ch = asArr(VM(await loadCosts("oa", DEP.R), "dR").channels);
    eq(ch.map((c) => [c.channel, c.group, c.bookings, c.seats, c.salesSatang, c.commissionSatang]),
      [["WEB", "DIRECT", 1, 2, 700_000, 0], ["LIFF", "DIRECT", 1, 3, 945_000, 0], ["COUNTER", "DIRECT", 1, 1, 350_000, 0], ["AGENT_PORTAL", "AGENT", 2, 5, 1_645_000, 199_500], ["AGENT_LINK", "AGENT", 1, 4, 1_400_000, 210_000]], "ช่องทาง");
  });
  groupLine("CT");

  // ═══════════════ RP. รายงาน ═══════════════
  console.log("\n── RP: รายงาน ──");
  const rep = (tag: string, input: Rec = {}, opts: Rec = optsR, unit = uA) => call("loadTripReportVM", ctxOf(tag), { unitId: unit, from: APR.from, to: APR.to, ...input }, opts);
  const depRow = (vm: Rec, id: string) => asArr(asRec(vm.departures)?.rows).find((r) => r.departureId === id) ?? null;
  const T = (vm: Rec) => asRec(vm.totals) ?? {};
  const RK = ["salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "commissionSatang", "costSatang", "grossProfitSatang", "marginBp"];
  await st("RP-1", "แถวรอบ dR = แผงรอบภาพ 11: ยอดขาย 5,040,000 · เก็บแทน 840,000 · VAT 329,718 · ก่อน VAT 4,710,282 · คอมฯ 409,500 · ต้นทุน 2,150,000 · กำไร 2,150,782 · 4566 bp · 15/24 = 6250 · 6 การจอง · รับแล้ว 2,415,000 · ค้าง 3,465,000 · ENDED_NOT_CLOSED", async () => {
    needSetup(); const r = depRow(VM(await rep("oa"), "owner"), DEP.R); ok(r, "ไม่มีแถว dR");
    eq(pick(r ?? {}, RK), [5_040_000, 840_000, 329_718, 4_710_282, 409_500, 2_150_000, 2_150_782, 4566], "เงิน");
    eq(pick(r ?? {}, ["capacity", "sold", "loadFactorBp", "bookings", "cancelledBookings", "collectedSatang", "outstandingSatang", "state", "estimate"]), [24, 15, 6250, 6, 0, 2_415_000, 3_465_000, "ENDED_NOT_CLOSED", true], "อื่น");
  });
  await st("RP-2", "รวมเดือน เม.ย. (§3.3 ค): รอบ 4 (ยกเลิก 1 · ประมาณการ 2) · ความจุ 46 ขาย 18 = 3913 · ยอดขาย 6,440,000 · เก็บแทน 1,020,000 · VAT 421,306 · ก่อน VAT 6,018,694 · คอมฯ 409,500 · ต้นทุน 2,770,000 · กำไร 2,839,194 · 4717 bp · LIVE 8 · ยกเลิก 2 · คน 18 · รับแล้ว 3,995,000 · ค้าง 3,465,000 · รอ 2", async () => {
    needSetup(); const t = T(VM(await rep("oa"), "owner"));
    eq(pick(t, ["departures", "cancelledDepartures", "estimateDepartures", "capacity", "sold", "loadFactorBp"]), [4, 1, 2, 46, 18, 3913], "รอบ");
    eq(pick(t, RK), [6_440_000, 1_020_000, 421_306, 6_018_694, 409_500, 2_770_000, 2_839_194, 4717], "เงิน");
    eq(pick(t, ["bookings", "cancelledBookings", "seats", "collectedSatang", "outstandingSatang", "pendingBookings"]), [8, 2, 18, 3_995_000, 3_465_000, 2], "การจอง");
  });
  await st("RP-3", "แท็บอัตราเต็ม: ต่อสินค้าไม่นับรอบยกเลิก · ราชาทดสอบ 2 รอบ 36 ที่ ขาย 18 = 5000 · PX 1 รอบ 10 ที่ ขาย 0 = 0 · เรียงมาก→น้อย", async () => {
    needSetup(); const l = asArr(asRec(VM(await rep("oa", { tab: "load" }), "load").load)?.byProduct);
    eq(l.map((x) => [x.productId, x.departures, x.capacity, x.sold, x.loadFactorBp]), [[PRD.PR.id, 2, 36, 18, 5000], [PRD.PX.id, 1, 10, 0, 0]], "ต่อสินค้า");
  });
  await st("RP-4", "แท็บระยะจอง (LIVE 8 การจอง · กรุงเทพ): D0 1/1 · D1_2 2/3 · D3_7 1/4 · D8_14 1/2 (0151 จอง 1 เม.ย. 00:30 ตามเวลาร้าน) · D15_30 1/2 · D31_60 1/3 · D61P 1/3 · ค่ากลาง 5 วัน · ติดลบ 0", async () => {
    needSetup(); const l = asRec(VM(await rep("oa", { tab: "lead" }), "lead").lead) ?? {};
    eq(asArr(l.buckets).map((b) => [b.key, b.bookings, b.seats]), [["D0", 1, 1], ["D1_2", 2, 3], ["D3_7", 1, 4], ["D8_14", 1, 2], ["D15_30", 1, 2], ["D31_60", 1, 3], ["D61P", 1, 3]], "ช่อง");
    eq([l.bookings, l.medianDays, l.negative], [8, 5, 0], "สรุป");
  });
  await st("RP-5", "แท็บช่องทาง: แถวช่องทาง (การจอง/ยกเลิก/คน/ยอดขาย/ก่อน VAT/คอมฯ/สุทธิหลังคอมฯ) + 3 กลุ่ม · ขายตรง 5/9 · เอเจนซี่ 3/9 · อื่น 0 · Σ ยอดขายช่องทาง = ยอดรวม", async () => {
    needSetup(); const vm = VM(await rep("oa", { tab: "channel" }), "channel"); const c = asRec(vm.channel) ?? {};
    const rows = Object.fromEntries(asArr(c.rows).map((r) => [String(r.channel), [r.group, r.bookings, r.cancelledBookings, r.seats, r.salesSatang, r.revenueExVatSatang, r.commissionSatang, r.netAfterCommissionSatang]]));
    eq(rows, {
      WEB: ["DIRECT", 2, 1, 4, 1_400_000, 1_308_412, 0, 1_308_412], LIFF: ["DIRECT", 1, 0, 3, 945_000, 883_178, 0, 883_178], COUNTER: ["DIRECT", 2, 1, 2, 1_050_000, 981_309, 0, 981_309],
      AGENT_PORTAL: ["AGENT", 2, 0, 5, 1_645_000, 1_537_384, 199_500, 1_337_884], AGENT_LINK: ["AGENT", 1, 0, 4, 1_400_000, 1_308_411, 210_000, 1_098_411],
    }, "แถว");
    eq(asArr(c.groups).map((g) => [g.group, g.bookings, g.seats, g.salesSatang]), [["DIRECT", 5, 9, 3_395_000], ["AGENT", 3, 9, 3_045_000], ["OTHER", 0, 0, 0]], "กลุ่ม");
    eq(asArr(c.rows).reduce((s, r) => s + Number(r.salesSatang), 0), T(vm).salesSatang, "Σ = รวม");
  });
  await st("RP-6", "ช่วงเวลา: 30 วัน ⇒ กลุ่ม day 30 ช่วงต่อเนื่อง (วันไม่มีรอบ = 0) · group week ⇒ 5 ช่วง (29 มี.ค. ตัดเริ่ม 1 เม.ย. · 5 เม.ย. ยอดขาย 6,440,000 ต้นทุน 2,650,000 กำไร 2,959,194 · 12 เม.ย. กำไร −120,000 · 19 · 26) · month ⇒ 1 ช่วง", async () => {
    needSetup();
    const d = asRec(VM(await rep("oa"), "day").filters)?.group; eq(d, "day", "กลุ่มปริยาย");
    const dayP = asArr(asRec(VM(await rep("oa"), "day").sales)?.periods); eq([dayP.length, dayP[0]?.key, dayP[29]?.key, dayP[9]?.salesSatang, dayP[1]?.salesSatang], [30, "2027-04-01", "2027-04-30", 5_040_000, 0], "day");
    const w = asArr(asRec(VM(await rep("oa", { group: "week" }), "week").sales)?.periods);
    eq(w.map((p) => [p.key, p.from, p.to]), [["2027-03-29", "2027-04-01", "2027-04-04"], ["2027-04-05", "2027-04-05", "2027-04-11"], ["2027-04-12", "2027-04-12", "2027-04-18"], ["2027-04-19", "2027-04-19", "2027-04-25"], ["2027-04-26", "2027-04-26", "2027-04-30"]], "ช่วง");
    eq(pick(w[1] ?? {}, ["departures", "sold", "salesSatang", "costSatang", "grossProfitSatang"]), [2, 18, 6_440_000, 2_650_000, 2_959_194], "5 เม.ย.");
    eq(pick(w[2] ?? {}, ["departures", "salesSatang", "costSatang", "grossProfitSatang"]), [1, 0, 120_000, -120_000], "12 เม.ย.");
    eq(asArr(asRec(VM(await rep("oa", { group: "month" }), "month").sales)?.periods).map((p) => p.key), ["2027-04"], "month");
  });
  await st("RP-7", "ฐานวันจอง (booked · เวลาร้าน): การจองที่สร้าง 1–30 เม.ย. = 0151 (17:30Z 31 มี.ค.) · 0148 · 0155 · 0160 · trav · out (รอบ พ.ค.) ⇒ 6 การจอง ยอดขาย 4,200,000 · คอมฯ 315,000 · ต้นทุน/กำไร/มาร์จิน null · ไม่นับ HOLD/PENDING/EXPIRED", async () => {
    needSetup(); const t = T(VM(await rep("oa", { basis: "booked" }), "booked"));
    eq(pick(t, ["bookings", "salesSatang", "commissionSatang", "costSatang", "grossProfitSatang", "marginBp"]), [6, 4_200_000, 315_000, null, null, null], "booked");
  });
  await st("RP-8", "ตัวกรอง: สินค้า PX ⇒ 1 รอบ ยอด 0 · ช่องทาง AGENT_PORTAL ⇒ 2 การจอง ยอด 1,645,000 คอมฯ 199,500 · ต้นทุน/กำไร null (แยกต้นทุนตามช่องทางไม่ได้) · รอบยังนับ 4 · สินค้าหน่วยอื่น ⇒ NOT_FOUND", async () => {
    needSetup();
    eq(pick(T(VM(await rep("oa", { productId: PRD.PX.id }), "px")), ["departures", "salesSatang", "costSatang"]), [1, 0, 0], "PX");
    eq(pick(T(VM(await rep("oa", { channel: "AGENT_PORTAL" }), "ch")), ["departures", "bookings", "salesSatang", "commissionSatang", "costSatang", "grossProfitSatang"]), [4, 2, 1_645_000, 199_500, null, null], "AGENT_PORTAL");
    codeR(await rep("oa", { productId: PRD.PA2.id }), "NOT_FOUND", "สินค้าหน่วยอื่น");
  });
  await st("RP-9", "สิทธิ์: report.view ⇒ ไม่มีต้นทุน/คอมฯ/กำไรในทุกระดับของ VM (สแกนทั้งต้นไม้) แต่ยอดขายครบ · report+cost ⇒ ครบ · MANAGER/trips.* ⇒ ครบ · booking.view/departure.view/ไม่มีสิทธิ์/cost อย่างเดียว ⇒ FORBIDDEN", async () => {
    needSetup(); const vr = VM(await rep("rv"), "rv");
    eq(T(vr).salesSatang, 6_440_000, "rv ยอดขาย"); eq(asRec(vr.flags)?.canCost, false, "canCost");
    const leak = [...costLeaks(vr), ...costLeaks(VM(await rep("rv", { tab: "channel" }), "rv ch")), ...costLeaks(VM(await rep("rv", { group: "week" }), "rv wk"))];
    ok(leak.length === 0, `รั่ว: ${leak.slice(0, 4).join(" · ")}`);
    for (const t of ["cv", "mg", "wild", "oa"]) eq(T(VM(await rep(t), t)).grossProfitSatang, 2_839_194, `${t} กำไร`);
    for (const t of ["bv", "dv", "none", "cvo", "ce"]) codeR(await rep(t), "FORBIDDEN", t);
  });
  await st("RP-10", "แยกหน่วย/ร้าน: รายงานหน่วย a ไม่มียอด 777,700/ต้นทุน 999,900 ของหน่วย a2/โตเกียว/ร้าน B · หน่วย a2 เห็นของตัวเอง · ผู้ใช้หน่วย a2/ร้าน B ขอหน่วย a ⇒ NOT_FOUND", async () => {
    needSetup(); const s = JSON.stringify(VM(await rep("oa"), "a"));
    ok(!s.includes(String(MARK)) && !s.includes("999900"), "หน่วย a มีตัวเลขของหน่วยอื่น");
    eq(pick(T(VM(await rep("a2", {}, optsR, uA2), "a2")), ["salesSatang", "costSatang"]), [MARK, 999_900], "a2");
    codeR(await rep("a2"), "NOT_FOUND", "a2 → a"); codeR(await call("loadTripReportVM", ctxOf("ob"), { unitId: uA, from: APR.from, to: APR.to }, optsR), "NOT_FOUND", "B → a");
  });
  await st("RP-11", "นาฬิกาฉีด: now 10 เม.ย. 00:00Z (ก่อน dR จบ) ⇒ dR/dN UPCOMING · ประมาณการ 3 · now 1 พ.ค. ⇒ dP (จบแล้ว ไม่มีการจอง) CLOSED · dN CLOSED · dX CANCELLED · ประมาณการ 1 (dR ยังมีการจองเปิด)", async () => {
    needSetup();
    const a = VM(await rep("oa", {}, { now: new Date("2027-04-10T00:00:00.000Z") }), "early");
    eq([depRow(a, DEP.R)?.state, depRow(a, DEP.N)?.state, T(a).estimateDepartures], ["UPCOMING", "UPCOMING", 3], "ต้นเดือน");
    const b = VM(await rep("oa", {}, { now: new Date("2027-05-01T00:00:00.000Z") }), "late");
    eq([depRow(b, DEP.P)?.state, depRow(b, DEP.N)?.state, depRow(b, DEP.X)?.state, T(b).estimateDepartures], ["CLOSED", "CLOSED", "CANCELLED", 1], "สิ้นเดือน");
  });
  await st("RP-12", "เขตเวลาหน่วยโตเกียว: ระยะจอง tk1 (16:30Z 9 เม.ย.) = D0 · tk2 (15:30Z 31 มี.ค.) = D8_14 · ฐานวันจอง เม.ย. นับทั้งสอง (tk2 = 1 เม.ย. เวลาโตเกียว)", async () => {
    needSetup();
    const l = asRec(VM(await rep("tk", { tab: "lead" }, optsR, uT), "tk lead").lead) ?? {};
    eq(asArr(l.buckets).filter((b) => Number(b.bookings) > 0).map((b) => [b.key, b.bookings]), [["D0", 1], ["D8_14", 1]], "โตเกียว");
    eq(T(VM(await rep("tk", { basis: "booked" }, optsR, uT), "tk booked")).bookings, 2, "booked โตเกียว");
  });
  await st("RP-13", "อินพุตเสีย: 367 วัน ⇒ RANGE_TOO_LARGE · from > to / วันไม่จริง / tab group basis channel นอกชุด / page 0, 201, 1.5 / คีย์เกิน ⇒ INVALID_INPUT · productId มี NUL ⇒ INVALID_INPUT|NOT_FOUND · ไม่ throw", async () => {
    needSetup();
    codeR(await rep("oa", { from: "2027-01-01", to: "2028-01-02" }), "RANGE_TOO_LARGE", "367");
    for (const [inp, w] of [[{ from: "2027-04-30", to: "2027-04-01" }, "กลับด้าน"], [{ from: "2027-02-30" }, "30 ก.พ."], [{ tab: "profit" }, "tab"], [{ group: "year" }, "group"], [{ basis: "paid" }, "basis"],
      [{ channel: "XX" }, "channel"], [{ page: 0 }, "page 0"], [{ page: 201 }, "page 201"], [{ page: 1.5 }, "page 1.5"], [{ extra: 1 }, "คีย์เกิน"]] as const) codeR(await rep("oa", inp as Rec), "INVALID_INPUT", w);
    codeR(await rep("oa", { productId: "x\u0000y" }), ["INVALID_INPUT", "NOT_FOUND"], "NUL");
  });
  await st("RP-14", "ตัวโหลดไม่เขียนฐาน (TripCost/AuditLog/TripBooking ของร้าน a คงเดิมหลังเรียกรายงาน 4 แท็บ + จอต้นทุน + แผงเงิน)", async () => {
    needSetup(); const cnt = async () => (await q<Rec>(`SELECT (SELECT count(*) FROM "TripCost" WHERE "tenantId" = $1)::int AS c, (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = $1)::int AS a, (SELECT max("updatedAt") FROM "TripCost" WHERE "tenantId" = $1)::text AS u, (SELECT count(*) FROM "TripBooking" WHERE "tenantId" = $1)::int AS b`, [tA]))[0];
    const b0 = await cnt();
    for (const tab of TABS) await rep("oa", { tab });
    await loadCosts("oa", DEP.R); await call("departureMoneySummary", ctxOf("oa"), { unitId: uA, departureId: DEP.R }, optsR);
    eq(await cnt(), b0, "จำนวน/เวลาแก้");
  });
  await st("RP-15", "ร้าน seed อ่านอย่างเดียว: รายงานวัน 14 พ.ย. 2569 ของ andaman-dive (OWNER · now TRIPS_AS_OF) — แถวราชา 14 พ.ย. ตรงยอดที่คิดซ้ำจากแถวดิบ (ยอดขาย · เก็บแทน · VAT · ก่อน VAT · คอมฯ) · ต้นทุน 0 · ไม่เขียนฐาน seed", async () => {
    ok(seedRaw, "PC-7 ต้องผ่านก่อน"); const raw = seedRaw ?? { sales: 0, pt: 0, vat: 0, commission: 0, live: 0 };
    const vm = VM(await call("loadTripReportVM", SEED, { unitId: U0, from: R14.date, to: R14.date }, { now: AS_OF }), "seed");
    const r = depRow(vm, seedDep); ok(r, "ไม่มีแถวรอบราชา 14 พ.ย.");
    eq(pick(r ?? {}, ["bookings", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "commissionSatang", "costSatang"]), [raw.live, raw.sales, raw.pt, raw.vat, raw.sales - raw.vat, raw.commission, 0], "seed");
    eq(await seedCounts(), seedBefore, "seed ไม่ถูกเขียน");
  });
  groupLine("RP");

  // ═══════════════ PN. การ์ดเงินแผงรอบ ═══════════════
  console.log("\n── PN: การ์ดเงินแผงรอบ ──");
  const panel = (tag: string, dep = DEP.R) => call("loadDeparturePanelVM", ctxOf(tag), { unitId: uA, departureId: dep }, optsR);
  const MONEY_K = ["salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "commissionSatang", "costSatang", "costRows", "grossProfitSatang", "marginBp", "bookings", "seats", "pendingBookings", "state", "estimate"];
  await st("PN-1", "OWNER: แผงรอบ dR money = ภาพ 11 (ยอดจอง 5,040,000 · อุทยาน 840,000 · VAT 329,718 · ก่อน VAT 4,710,282 · คอมฯ 409,500 · ต้นทุน 2,150,000 (5 แถว) · กำไรก่อน VAT 2,150,782 · 4566 bp · 6 การจอง 15 คน · รอ 2 · ประมาณการ) · actions.costs true", async () => {
    needSetup(); const vm = VM(await panel("oa"), "panel");
    eq(pick(asRec(vm.money) ?? {}, MONEY_K), [5_040_000, 840_000, 329_718, 4_710_282, 409_500, 2_150_000, 5, 2_150_782, 4566, 6, 15, 2, "ENDED_NOT_CLOSED", true], "money");
    eq(asRec(vm.actions)?.costs, true, "actions.costs");
  });
  await st("PN-2", "พนักงานขาย (departure.view + booking.view): money มียอดขาย/เก็บแทน/VAT/ก่อน VAT · ต้นทุน คอมฯ กำไร มาร์จิน costRows = null · actions.costs false", async () => {
    needSetup(); const vm = VM(await panel("bv"), "bv"); const m = asRec(vm.money) ?? {};
    eq(pick(m, MONEY_K), [5_040_000, 840_000, 329_718, 4_710_282, null, null, null, null, null, 6, 15, 2, "ENDED_NOT_CLOSED", true], "money");
    eq(asRec(vm.actions)?.costs, false, "actions.costs");
  });
  await st("PN-3", "departure.view อย่างเดียว ⇒ money null + actions.costs false · report.view ⇒ money ไม่มีต้นทุน · cost.view (ไม่มี booking/report) ⇒ money ครบ (ต้นทุน 2,150,000) + actions.costs true", async () => {
    needSetup();
    const d = VM(await panel("dv"), "dv"); eq([d.money, asRec(d.actions)?.costs], [null, false], "dv");
    eq(costLeaks(VM(await panel("rv"), "rv").money), [], "rv ไม่มีต้นทุน"); eq(asRec(VM(await panel("rv"), "rv").money)?.salesSatang, 5_040_000, "rv ยอดขาย");
    const c = VM(await panel("cvo"), "cvo"); eq([asRec(c.money)?.costSatang, asRec(c.money)?.grossProfitSatang, asRec(c.actions)?.costs], [2_150_000, 2_150_782, true], "cvo");
  });
  await st("PN-4", "departureMoneySummary ตรงตัวคิดเดียวกับรายงาน (dN: ยอดขาย 1,400,000 · VAT 91,588 · ก่อน VAT 1,308,412 · ต้นทุน 500,000 · กำไร 808,412 · CLOSED · estimate false) · dv ⇒ FORBIDDEN · รอบหน่วยอื่น ⇒ NOT_FOUND", async () => {
    needSetup(); const r = await call("departureMoneySummary", ctxOf("oa"), { unitId: uA, departureId: DEP.N }, optsR);
    ok(r.ok === true, fmt(r)); const m = asRec(r.value) ?? asRec(r.vm) ?? {};
    eq(pick(m, ["salesSatang", "vatSatang", "revenueExVatSatang", "costSatang", "grossProfitSatang", "cancelledBookings", "state", "estimate"]), [1_400_000, 91_588, 1_308_412, 500_000, 808_412, 1, "CLOSED", false], "dN");
    eq(pick(depRow(VM(await rep("oa"), "rep"), DEP.N) ?? {}, ["salesSatang", "grossProfitSatang"]), [1_400_000, 808_412], "ตรงกับรายงาน");
    codeR(await call("departureMoneySummary", ctxOf("dv"), { unitId: uA, departureId: DEP.N }, optsR), "FORBIDDEN", "dv");
    codeR(await call("departureMoneySummary", ctxOf("oa"), { unitId: uA, departureId: DEP.A2 }, optsR), "NOT_FOUND", "หน่วยอื่น");
  });
  groupLine("PN");

  // ═══════════════ EX. CSV ═══════════════
  console.log("\n── EX: ส่งออก CSV ──");
  const exp = (tag: string, input: Rec = {}, unit = uA) => call("exportTripReportCsv", ctxOf(tag), { unitId: unit, from: APR.from, to: APR.to, ...input }, optsR);
  const lines = (csv: string) => csv.replace(/^﻿/, "").split("\r\n").filter((l, i, a) => !(i === a.length - 1 && l === ""));
  await st("EX-1", "OWNER: ชื่อไฟล์ trips-report-2027-04-01-2027-04-30.csv · BOM · หัวไทยตาม report.csv.* 19 คอลัมน์ · 4 แถว (เรียงวัน) · แถว dR มี 50400.00 · 21507.82 · 62.50 · 45.66 · แถว dX กำไร -1200.00 (ไม่มี ') · withCost true", async () => {
    needSetup(); const v = V(await exp("oa"), "export"); const csv = String(v.csv ?? "");
    eq([v.filename, v.rows, v.truncated, v.withCost], ["trips-report-2027-04-01-2027-04-30.csv", 4, false, true], "ค่า");
    ok(csv.startsWith("﻿"), "BOM"); const L = lines(csv);
    eq(L[0], CSV_COLS.map((k) => fth[`report.csv.${k}`]).join(","), "หัวไทย"); eq(L.length, 5, "จำนวนบรรทัด");
    ok(L[1].startsWith("2027-04-10,") && ["50400.00", "21507.82", "62.50", "45.66", "8400.00", "3297.18"].every((x) => L[1].split(",").includes(x)), `แถว dR: ${L[1]}`);
    ok(L[3].startsWith("2027-04-12,") && L[3].split(",").includes("-1200.00") && !L[3].includes("'-"), `แถว dX: ${L[3]}`);
  });
  await st("EX-2", "report.view อย่างเดียว: ไม่มีคอลัมน์คอมฯ/ต้นทุน/กำไร/มาร์จิน (15 คอลัมน์) · ไม่มี 21507.82/4095.00/21500.00 ในไฟล์ · withCost false", async () => {
    needSetup(); const v = V(await exp("rv"), "rv"); const csv = String(v.csv ?? ""); const L = lines(csv);
    eq([v.withCost, L[0].split(",").length], [false, 15], "คอลัมน์"); eq(L[0], CSV_COLS.filter((k) => !CSV_COST_COLS.includes(k)).map((k) => fth[`report.csv.${k}`]).join(","), "หัว");
    ok(!["21507.82", "4095.00", "21500.00", "28391.94"].some((x) => csv.includes(x)), "ไฟล์มีตัวเลขต้นทุน/กำไร");
  });
  await st("EX-3", "ชื่อสินค้าแบบสูตร (=HYPERLINK…) ถูกนำหน้าด้วย ' · locale en ⇒ หัวอังกฤษ (ไม่มีอักษรไทย) · สถานะเป็นข้อความตามภาษา ไม่ใช่รหัสดิบ", async () => {
    needSetup(); const L = lines(String(V(await exp("oa"), "th").csv ?? ""));
    const px = L.find((l) => l.startsWith("2027-04-20,")) ?? ""; ok(/,"?'=HYPERLINK/.test(px), `แถว PX: ${px}`);
    ok(!DEP_STATES.some((s) => L.slice(1).some((l) => l.split(",").includes(s))), "มีรหัสสถานะดิบ");
    const E = lines(String(V(await exp("oa", { locale: "en" }), "en").csv ?? ""));
    eq(E[0], CSV_COLS.map((k) => fen[`report.csv.${k}`]).join(","), "หัวอังกฤษ"); ok(!/[฀-๿]/.test(E[0]), "หัวอังกฤษมีอักษรไทย");
  });
  await st("EX-4", "audit trips.report.exported ก่อนคืนไฟล์: targetType BusinessUnit · targetId หน่วย · after { from, to, basis, rows 4, truncated false, withCost } ไม่มียอดเงิน/ชื่อ · เรียกซ้ำ = ไฟล์เดิมทุกไบต์ + audit ใหม่", async () => {
    needSetup(); const n0 = await auditCount("trips.report.exported", uA);
    const a = String(V(await exp("cv"), "1").csv ?? ""), b = String(V(await exp("cv"), "2").csv ?? "");
    eq(a, b, "ไฟล์เดิม"); eq(await auditCount("trips.report.exported", uA), n0 + 2, "audit +2");
    const r = (await q<{ after: Rec; targetType: string; actorId: string }>(`SELECT after, "targetType", "actorId" FROM "AuditLog" WHERE action = 'trips.report.exported' AND "targetId" = $1 ORDER BY "createdAt" DESC, id DESC LIMIT 1`, [uA]))[0];
    eq(pick(asRec(r?.after) ?? {}, ["from", "to", "basis", "rows", "truncated", "withCost"]), [APR.from, APR.to, "travel", 4, false, true], "after");
    eq([r?.targetType, r?.actorId], ["BusinessUnit", U.cv.userId], "เป้า/ผู้ทำ");
    ok(!/5040000|50400|2150782|ราชาทดสอบ/.test(JSON.stringify(r?.after)), "after มียอดเงิน/ชื่อ");
  });
  await st("EX-5", "ส่งออกไม่มีสิทธิ์รายงาน (booking.view · cost.view อย่างเดียว · ไม่มีสิทธิ์) ⇒ FORBIDDEN ไม่เขียน audit · หน่วยอื่น ⇒ NOT_FOUND", async () => {
    needSetup(); const n0 = await auditCount("trips.report.exported", uA);
    for (const t of ["bv", "cvo", "none"]) codeR(await exp(t), "FORBIDDEN", t);
    codeR(await exp("a2"), "NOT_FOUND", "a2"); eq(await auditCount("trips.report.exported", uA), n0, "audit");
  });
  groupLine("EX");

  // ═══════════════ X. ช่วงใหญ่ · ข้ามร้าน ═══════════════
  console.log("\n── X: ช่วงใหญ่และขอบเขต ──");
  let bigErr = "";
  try {
    if (!setupErr) {
      const p = PRD.PA2;
      // 2,050 รอบใน 2027-09-01..2027-12-31 (122 วัน · ~17 รอบ/วัน · เวลาเริ่มต่างกันทีละนาที) + ต้นทุน 1,000 ต่อรอบ
      await pool.query(`INSERT INTO "TripDeparture" (id, "tenantId", "unitId", "productId", "optionId", "localDate", "startsAt", "endsAt", status, capacity, sold, held, reserved, version, "createdAt", "updatedAt")
        SELECT 't17big_' || $5 || '_' || g, $1, $2, $3, $4, (DATE '2027-09-01' + ((g - 1) % 122)), TIMESTAMP '2027-09-01 00:00:00' + ((g - 1) % 122) * INTERVAL '1 day' + ((g - 1) / 122) * INTERVAL '1 minute',
               TIMESTAMP '2027-09-01 08:00:00' + ((g - 1) % 122) * INTERVAL '1 day' + ((g - 1) / 122) * INTERVAL '1 minute', 'OPEN', 10, 2, 0, 0, 0, TIMESTAMP '2027-01-01 00:00:00', TIMESTAMP '2027-01-01 00:00:00'
          FROM generate_series(1, 2050) AS g`, [p.tenant, p.unit, p.id, p.opt, STAMP]);
      await pool.query(`INSERT INTO "TripCost" (id, "tenantId", "unitId", "departureId", kind, "amountSatang", "createdAt", "updatedAt")
        SELECT 't17bigc_' || d.id, d."tenantId", d."unitId", d.id, 'BOAT', 1000, TIMESTAMP '2027-01-01 00:00:00', TIMESTAMP '2027-01-01 00:00:00' FROM "TripDeparture" d WHERE d.id LIKE $1`, [`t17big_${STAMP}_%`]);
    }
  } catch (e) { bigErr = errMsg(e); console.log(`  ⚠️ สร้างรอบจำนวนมากไม่สำเร็จ: ${bigErr}`); }
  const BIG = { from: "2027-09-01", to: "2027-12-31" };
  await st("X-1", "ช่วง 122 วัน 2,050 รอบ (หน่วย a2): รวม รอบ 2,050 · ความจุ 20,500 · ขาย 4,100 = 2000 bp · ต้นทุน 2,050,000 · กำไร −2,050,000 · กลุ่มปริยาย month 4 ช่วง · แถวหน้า 1 = 50 · pageCount 41 · หน้า 41 = 50 · หน้า 42 = 0 · ตอบภายใน 20 วินาที", async () => {
    needSetup(); ok(!bigErr, bigErr);
    const t0 = Date.now(); const vm = VM(await rep("a2", BIG, optsR, uA2), "big"); const ms = Date.now() - t0;
    eq(pick(T(vm), ["departures", "capacity", "sold", "loadFactorBp", "costSatang", "grossProfitSatang"]), [2050, 20_500, 4_100, 2000, 2_050_000, -2_050_000], "รวม");
    eq(asArr(asRec(vm.sales)?.periods).map((x) => x.key), ["2027-09", "2027-10", "2027-11", "2027-12"], "ช่วง");
    const d = asRec(vm.departures) ?? {}; eq([asArr(d.rows).length, d.total, d.pageCount, d.pageSize], [50, 2050, 41, 50], "หน้า 1");
    eq(asArr(asRec(VM(await rep("a2", { ...BIG, page: 41 }), "p41").departures)?.rows).length, 50, "หน้า 41");
    eq(asArr(asRec(VM(await rep("a2", { ...BIG, page: 42 }), "p42").departures)?.rows).length, 0, "หน้า 42");
    ok(ms < 20_000, `ช้า ${ms} ms`);
  });
  await st("X-2", "CSV ช่วงใหญ่: 2,000 แถว (TRIPS_REPORT_CSV_CAP) · truncated true · บรรทัดแจ้งก่อนหัวบอก 2,000 จาก 2,050", async () => {
    needSetup(); ok(!bigErr, bigErr);
    const v = V(await exp("a2", BIG, uA2), "big csv"); const L = lines(String(v.csv ?? ""));
    eq([v.rows, v.truncated, L.length], [2000, true, 2002], "แถว"); ok(/2[,.]?000/.test(L[0]) && /2[,.]?050/.test(L[0]), `บรรทัดแจ้ง: ${L[0]}`);
  });
  await st("X-3", "ข้ามร้าน: เจ้าของร้าน B เรียกบริการทั้ง 5 ตัวด้วยหน่วย a ⇒ NOT_FOUND ทุกตัว · ไม่มีตัวเลขหลุดในข้อความ", async () => {
    needSetup(); const c = ctxOf("ob");
    const rs = [await call("loadDepartureCostsVM", c, { unitId: uA, departureId: DEP.R }, optsR), await call("saveDepartureCosts", c, { unitId: uA, departureId: DEP.R, expectedToken: "x", rows: [] }, optsR),
      await call("loadTripReportVM", c, { unitId: uA }, optsR), await call("exportTripReportCsv", c, { unitId: uA }, optsR), await call("departureMoneySummary", c, { unitId: uA, departureId: DEP.R }, optsR)];
    rs.forEach((r, i) => codeR(r, "NOT_FOUND", `บริการ ${i}`));
    ok(!/5040000|2150000/.test(JSON.stringify(rs)), "ผลปฏิเสธมีตัวเลข");
  });
  await st("X-4", "ข้ามหน่วยในร้านเดียวกัน: ผู้ใช้หน่วย a2 เรียกบริการทั้ง 5 ตัวกับรอบ/หน่วย a ⇒ NOT_FOUND · OWNER ส่ง departureId ของหน่วย a2 พร้อม unitId a ⇒ NOT_FOUND", async () => {
    needSetup(); const c = ctxOf("a2");
    for (const r of [await call("loadDepartureCostsVM", c, { unitId: uA, departureId: DEP.R }, optsR), await call("saveDepartureCosts", c, { unitId: uA, departureId: DEP.R, expectedToken: "x", rows: [] }, optsR),
      await call("loadTripReportVM", c, { unitId: uA }, optsR), await call("exportTripReportCsv", c, { unitId: uA }, optsR), await call("departureMoneySummary", c, { unitId: uA, departureId: DEP.R }, optsR)]) codeR(r, "NOT_FOUND", "a2");
    codeR(await call("departureMoneySummary", ctxOf("oa"), { unitId: uA, departureId: DEP.A2 }, optsR), "NOT_FOUND", "รอบ a2 กับหน่วย a");
  });
  groupLine("X");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

console.log(`\nเหลือให้ด่านภาพ + การกดจริง (ผู้คุม · scripts/visual-trips.mts t1.7 + parity-trips.sh 11): การ์ดเงินแผงรอบ 2 บรรทัดแบบภาพ :56–:57 · ป้ายประมาณการเส้นประ · กำไรติดลบมีเครื่องหมาย+ไอคอน · ตารางรายงาน 1440 ไม่เลื่อน · 390 การ์ดไม่ล้น · บันทึกต้นทุน 2 แท็บพร้อมกัน · CSV เปิดใน LibreOffice`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T1.7a · ต้นทุนรอบ · กำไรขั้นต้น · รายงาน · CSV =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
