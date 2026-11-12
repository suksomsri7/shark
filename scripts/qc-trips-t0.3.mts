// QC — TRIPS T0.3 · รอบ: กฎซ้ำ + ข้อยกเว้น · รอบเดี่ยว · สถานะรอบ · ทรัพยากรกันชนข้ามสินค้า · ขั้นต่ำออกเดินทาง · ปิดรับต่อช่องทาง
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/T0.3.md · ledger/TRIPS-CORE-CONTRACT.md §B.1 §D.1(8) §D.5 §J.1 §J.2 §N.2 · ledger/TRIPS-DEFAULTS.md T6 T7 T8
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน)   S ไฟล์/facade/กติกาโค้ด   C ฟังก์ชันบริสุทธิ์ (รันใต้ TZ เครื่อง = Pacific/Chatham เพื่อจับตัวอ่านเวลาตามเครื่อง)
//   SC กฎซ้ำ → รอบ (วัน · ช่วง · ข้อยกเว้น · รันซ้ำ · ระยะล่วงหน้าจากค่าตั้ง · พัก)   TZ เที่ยงคืนไทย + ร้านเขตเวลาอื่น (DST)
//   D รอบเดี่ยว CRUD   ST ผังสถานะรอบ (ทุกทาง + กรณีลบ)   CAP ความจุ (คำสั่งเดียว · X3 20 ทางพร้อมกัน)
//   RS ทรัพยากรกันชนข้ามสินค้า (บริการ + ฐาน · X3 10 ทาง)   MP ขั้นต่ำ ณ เวลาตัดสิน (X5 งานซ้อน = ผลเดียว)
//   CO ปิดรับต่อช่องทาง (+ ตัวควบคุมบวก: เปลี่ยนค่าตั้ง ⇒ ผลเปลี่ยน) · หยุดขาย   PM สิทธิ์   X1 แยกร้าน/หน่วย   X9 ยกเลิกรอบที่มีคน = ปฏิเสธ (T1.6)
//   EV event 3 ทะเบียน + payload ไม่มีข้อมูลบุคคล   R seed สัปดาห์ฟิกซ์เจอร์ (จอ 11 · README)
//
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t03-*` (ผู้ใช้ `trips-t03-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ไม่แตะร้าน seed (R อ่านอย่างเดียว)
// 🔴 ยังไม่มีตาราง/โมดูล = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception (import แบบกัน · needTable)
// 🔴 ตัวนับ sold/held/reserved ตั้งด้วย SQL ดิบในข้อสอบ (T0.4 ยังไม่มี) — บริการของ T0.3 ห้ามเขียนตัวนับเอง
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t0.3.mts
//      (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมี T0.3 (และก่อน T0.1/T0.2 ลงทรีนี้): PC เขียว · S-13 เขียวได้ · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t0.3";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t0.2) ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
type Rec = Record<string, unknown>;
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 260); } catch { return String(v); } };
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
const stripStrings = (s: string) => s.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
const THAI = /[฀-๿]/;
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
type AnyFn = (...a: unknown[]) => unknown;
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t03qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SLUG = "trips-t03-";
const EMAIL_PREFIX = "trips-t03-";
const now = () => new Date();
const Z = (s: string) => new Date(s); // ISO เต็มเสมอ
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : typeof d === "string" ? new Date(d).toISOString() : String(d));
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);

// ═══════════════ สเปก (ใบสั่ง T0.3 §3) ═══════════════
const SVC_FNS = ["createSchedule", "updateSchedule", "pauseSchedule", "resumeSchedule", "listSchedules", "materializeSchedule",
  "createDeparture", "updateDeparture", "setDepartureCapacity", "setDepartureStatus", "cancelDeparture", "getDeparture", "listDepartures",
  "refreshDeparturePolicy", "setDepartureStopSell", "evaluateMinPax",
  "createResource", "updateResource", "setResourceActive", "listResources", "assignResource", "unassignResource",
  "runGenerateDepartures", "runMinPaxCheck"];
const PURE_FNS = ["canTransitionDeparture", "normalizeTimezone", "localToUtc", "utcToLocal", "weekdayOfYmd", "addDaysYmd", "expandSchedule",
  "cutoffFor", "cutoffAtColumn", "decisionAtFor", "needsDecision", "stopSellBlocks", "saleBlockReason"];
const FACADE_CONSTS = ["DEPARTURE_STATUSES", "DEPARTURE_TRANSITIONS", "TRIP_DEPARTURE_ERROR_CODES"];
const ERROR_CODES = ["INVALID_INPUT", "NOT_FOUND", "FORBIDDEN", "UNIT_NOT_TRIPS", "PRODUCT_ARCHIVED", "NO_DURATION", "SCHEDULE_PAUSED", "HORIZON_OFF",
  "DUPLICATE_DEPARTURE", "PAST_DEPARTURE", "BAD_STATE", "FORBIDDEN_TRANSITION", "HAS_BOOKINGS", "CAPACITY_BELOW_USED", "CONFIRM_REQUIRED",
  "RESOURCE_CLASH", "RESOURCE_INACTIVE", "RESOURCE_IN_USE", "AGENT_STOP_SELL_NOT_SUPPORTED", "BUSY"];
const STATUSES = ["OPEN", "GUARANTEED", "FULL", "CLOSED", "CANCELLED"];
const PERM_KEYS = ["trips.departure.view", "trips.departure.edit", "trips.departure.status", "trips.resource.edit"];
const EVENTS = ["trips.departure.created", "trips.departure.status_changed", "trips.departure.below_min", "trips.departure.cancelled"];
const PAYLOAD_KEYS = ["departureId", "minPax", "paxSold", "productId", "status", "unitId"];
const OWN_FILES = ["src/lib/modules/trips/departures-core.ts", "src/lib/modules/trips/departures.ts", "src/lib/modules/trips/resources.ts",
  "src/lib/modules/trips/departure-actions.ts", "src/lib/modules/trips/jobs.ts"];
const SELL_CHANNELS = ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "OTA", "API", "IMPORT", "CHAT_AI"];
const T6 = "trips.sell.cutoff", T7 = "trips.sell.minToDepart", T8 = "trips.sell.departureHorizonDays";
const DIVE_TRIPS_UNIT = "tripsqc-unit-dive-trips";
const SEED_SLUGS = { racha: "racha-yai-day-trip", phiphi: "phiphi-khai-speedboat", deep3: "racha-noi-3-dives", similan: "similan-4-nights" } as const;

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const needTable = async (t: string) => { if ((await cols(t)).length === 0) throw new AssertFail(`ยังไม่มีตาราง ${t} (migration ของ T0.1 ยังไม่ลงฐานนี้)`); };
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]); if (l.length) return l; }
  return [];
};
/** INSERT ค่าขั้นต่ำ — NOT NULL ไม่มี default เติมให้ (แบบ qc-trips-t0.1/t0.2) · คืน id */
async function insertRow(table: string, vals: Rec): Promise<string> {
  await needTable(table);
  const v: Rec = { ...vals };
  const names = new Set((await cols(table)).map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (t === "text" || t.startsWith("character")) { const l = await checkLits(table, c.column_name); v[c.column_name] = l[0] ?? `qc${randomBytes(4).toString("hex")}`; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}"
      : t.startsWith("timestamp") ? "2027-01-01 00:00:00" : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id ?? "");
}
const pgCode = async (fn: () => Promise<unknown>): Promise<string> => { try { await fn(); return ""; } catch (e) { return String((e as { code?: string }).code ?? errMsg(e)); } };

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

  // ── โมดูล (นำเข้าครั้งเดียว · ไม่มี = ข้อที่ใช้แดงพร้อมเหตุผล) ──
  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const SET = SETI.mod;
  const PERMS = (await tryImport("@/lib/core/permissions")).mod;
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name}`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => asRec(await fn(name)(...a)) ?? {};
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const okR = (r: Rec, what: string) => ok(r.ok === true, `${what}: ${fmt(r)}`);
  const codeR = (r: Rec, code: string, what: string) => ok(r.ok === false && r.code === code, `${what}: ต้อง ${code} ได้ ${fmt(r)}`);
  /** ใต้ TZ เครื่องแปลก (UTC+13:45) — ตัวอ่านเวลาตามเครื่องจะเพี้ยนทันที */
  const underOddTz = <T,>(f: () => T): T => { const old = process.env.TZ; process.env.TZ = "Pacific/Chatham"; try { return f(); } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; } };

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed P0.1 (andaman-dive) อยู่", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = 'andaman-dive'`))[0]?.n, 1, "ร้าน andaman-dive");
  });
  await st("PC-2", "ฟิกซ์เจอร์ (README จอ 11): ราชา 7 รอบ ความจุ 24 ขั้นต่ำ 8 · พีพี 7/30/10 · ดำน้ำลึก 6/12/4 · ศ. 13 ยกเลิก 3 รอบ 44 คน", () => {
    const W = FX.CALENDAR_WEEK_1111;
    eq([W.rows.racha.length, W.rows.phiphi.length, W.rows.deep3.length], [7, 7, 6], "จำนวนรอบ");
    eq([FX.PRODUCT_RACHA.capacity, FX.PRODUCT_RACHA.minPax, FX.PRODUCT_PHIPHI.capacity, FX.PRODUCT_PHIPHI.minPax, FX.PRODUCT_DEEP3.capacity, FX.PRODUCT_DEEP3.minPax], [24, 8, 30, 10, 12, 4], "ความจุ/ขั้นต่ำ");
    const c13 = [...W.rows.racha, ...W.rows.phiphi, ...W.rows.deep3].filter((r) => r.date === "2026-11-13");
    eq([c13.length, c13.reduce((t, r) => t + (r.cancelledPax ?? 0), 0), W.cancelled13.departures, W.cancelled13.pax], [3, 44, 3, 44], "ศ. 13");
  });
  await st("PC-3", "ทะเบียนค่าตั้งเดิมโหลดได้ (resolveSetting · setSettings)", () => { S("resolveSetting"); S("setSettings"); });
  await st("PC-4", "Intl ของเครื่องรู้ DST: 2027-03-28T07:00Z ที่ Europe/Berlin = 09:00 · 2027-03-27T08:00Z = 09:00 (ตัวควบคุมของ TZ-2)", () => {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    eq([f.format(Z("2027-03-28T07:00:00Z")), f.format(Z("2027-03-27T08:00:00Z"))], ["09:00", "09:00"], "Berlin");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์ · facade · กติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด ──");
  const srcOf = (p: string) => stripComments(read(p));
  await st("S-1", "ไฟล์เจ้าของครบ: departures-core.ts · departures.ts · resources.ts · departure-actions.ts · jobs.ts", () => {
    const miss = OWN_FILES.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
  await st("S-2", `facade ส่งออก ${SVC_FNS.length + PURE_FNS.length} ฟังก์ชัน + ${FACADE_CONSTS.length} ค่าคงที่ · บล็อก "// TRIPS T0.3 ▸" · ไม่มี export * · รหัสพลาดครบ · สถานะ 5 ค่า`, () => {
    const t = needTrips();
    const miss = [...SVC_FNS, ...PURE_FNS].filter((n) => typeof t[n] !== "function").concat(FACADE_CONSTS.filter((n) => t[n] === undefined));
    ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 8).join(", ")}`);
    const idx = read("src/lib/modules/trips/index.ts");
    ok(/\/\/\s*TRIPS T0\.3 ▸/.test(idx), "ไม่มีบล็อก // TRIPS T0.3 ▸ … ◂ ใน index.ts");
    ok(!/export\s*\*\s*from/.test(stripComments(idx)), "มี export * ใน facade");
    const codes = Array.isArray(t.TRIP_DEPARTURE_ERROR_CODES) ? (t.TRIP_DEPARTURE_ERROR_CODES as string[]) : [];
    const missC = ERROR_CODES.filter((c) => !codes.includes(c));
    ok(missC.length === 0, `TRIP_DEPARTURE_ERROR_CODES ขาด: ${missC.join(", ")}`);
    eq(t.DEPARTURE_STATUSES, STATUSES, "DEPARTURE_STATUSES");
  });
  await st("S-3", "departure-actions.ts: บรรทัดแรก \"use server\" · ส่งออกเฉพาะ export async function · requireUnit + assertCan · ≥ 15 action · ไม่รับ now", () => {
    const raw = read("src/lib/modules/trips/departure-actions.ts");
    ok(raw, "ยังไม่มีไฟล์");
    ok(/^\s*["']use server["'];?/.test(stripComments(raw).trimStart()), "ไม่ขึ้นต้น \"use server\"");
    const s = stripComments(raw);
    const exps = [...s.matchAll(/^export\s+(?!async\s+function\b)(\S+)/gm)].map((m) => m[1]);
    ok(exps.length === 0, `export ที่ไม่ใช่ async function: ${exps.join(", ")}`);
    const n = [...s.matchAll(/^export\s+async\s+function\b/gm)].length;
    ok(n >= 15, `action น้อยเกินไป (${n})`);
    ok(/assertCan\(/.test(s) && /requireUnit\(/.test(s), "ไม่มี requireUnit/assertCan (fitness F6)");
    ok(!/\bnow\s*:/.test(stripStrings(s)), "action รับ/ส่ง now (ใบสั่ง §2 ข้อ 5)");
  });
  await st("S-4", "ไม่มี any (ชนิด/แคสต์) ในไฟล์ของใบ", () => {
    const bad: string[] = [];
    for (const f of OWN_FILES) { const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; } if (/(:\s*any\b|\bas\s+any\b|<any>|any\[\])/.test(s)) bad.push(f); }
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-5", "import: แค่ @/lib/core/* zod @prisma/client ./ next/cache (ไม่ import hotel/โมดูลอื่น) · prisma ดิบเฉพาะ jobs.ts · departures-core บริสุทธิ์", () => {
    const bad: string[] = [];
    for (const f of OWN_FILES) {
      const s = srcOf(f);
      if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (!f.endsWith("jobs.ts") && /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(s)) bad.push(`${f}: prisma ดิบ`);
      for (const m of s.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g)) {
        const sp = m[1];
        if (!(sp.startsWith("@/lib/core/") || sp === "zod" || sp === "@prisma/client" || sp.startsWith("./") || sp === "next/cache")) bad.push(`${f}→${sp}`);
      }
      for (const m of s.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) if (m[1].startsWith("@/lib/modules/") && !m[1].startsWith("@/lib/modules/trips")) bad.push(`${f}→${m[1]}`);
    }
    const core = srcOf("src/lib/modules/trips/departures-core.ts");
    for (const m of core.matchAll(/^import\s+(?!type\b)[^;]*from\s*["']([^"']+)["']/gm)) if (m[1] !== "./json-schemas") bad.push(`departures-core ไม่บริสุทธิ์: ${m[1]}`);
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-6", "ไม่มีตัวอ่านเวลาตามเครื่อง (getDay/getDate/getHours/getMinutes/getMonth/getFullYear/setHours/toLocale*String ไม่มี timeZone)", () => {
    const bad: string[] = [];
    for (const f of OWN_FILES) {
      const s = srcOf(f);
      if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      for (const m of s.matchAll(/\.(getDay|getDate|getHours|getMinutes|getMonth|getFullYear|setHours|setDate|setMinutes|getTimezoneOffset)\s*\(/g)) bad.push(`${f}: .${m[1]}(`);
    }
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-7", "ไม่มีตัวเลขธุรกิจตายตัว (ปิดรับ/ขั้นต่ำ/ระยะล่วงหน้า/ความจุ) — มาจาก T6 T7 T8 หรือ input", () => {
    const bad: string[] = [];
    for (const f of OWN_FILES) {
      const s = stripStrings(srcOf(f));
      if (!s) continue;
      for (const m of s.matchAll(/\b(minPax|daysBefore|atMin|decideDaysBefore|decideAtMin|horizon\w*|capacity|departTimeMin)\s*[:=]\s*[1-9]\d*/g)) bad.push(`${f}: ${m[0]}`);
      for (const m of s.matchAll(/\b(1080|420|510|480|90|24|30|12)\b/g)) bad.push(`${f}: ${m[0]}`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-8", "ไม่มีการลบแถว Trip*: ไม่มี .delete( / .deleteMany( / DELETE FROM · facade ไม่ส่งออก delete*", () => {
    const bad: string[] = [];
    for (const f of OWN_FILES) { const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; } if (/\.(delete|deleteMany)\s*\(|DELETE\s+FROM/i.test(s)) bad.push(f); }
    const t = needTrips();
    for (const k of Object.keys(t)) if (/^delete(Schedule|Departure|Resource)/.test(k)) bad.push(`facade ${k}`);
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-9", "ความจุ = คำสั่งเดียว: departures.ts มี UPDATE \"TripDeparture\" … \"sold\" + \"held\" + \"reserved\" <= … RETURNING (CC §D.1 ข้อ 8)", () => {
    const s = srcOf("src/lib/modules/trips/departures.ts");
    ok(s, "ยังไม่มีไฟล์");
    ok(/UPDATE\s+"TripDeparture"[\s\S]{0,600}?"sold"\s*\+\s*"held"\s*\+\s*"reserved"\s*<=[\s\S]{0,300}?RETURNING/i.test(s), "ไม่พบคำสั่งเดียวที่มีเงื่อนไขในตัว");
  });
  await st("S-10", "สิทธิ์ 4 คีย์ใน MODULE_DEFS โมดูล trips (ป้ายไทย)", () => {
    ok(PERMS, "โหลด permissions ไม่ได้");
    const isKey = PERMS?.isPermissionKey as ((k: string) => boolean) | undefined;
    const label = PERMS?.permissionLabel as ((k: string) => string) | undefined;
    ok(typeof isKey === "function" && typeof label === "function", "ไม่มี isPermissionKey/permissionLabel");
    const miss = PERM_KEYS.filter((k) => !isKey?.(k) || !THAI.test(String(label?.(k) ?? "")));
    ok(miss.length === 0, `ยังไม่ลงทะเบียน/ไม่มีป้ายไทย: ${miss.join(", ")}`);
    eq(PERM_KEYS.map((k) => (PERMS?.moduleOfPermissionKey as (k: string) => string)?.(k)), ["trips", "trips", "trips", "trips"], "โมดูล");
  });
  await st("S-11", "event 4 ตัวลง 3 ทะเบียน (consumer · automation labels · webhook events) ป้ายไทย", async () => {
    const cons = stripComments(read("src/lib/outbox-consumers.ts"));
    const auto = (await tryImport("@/lib/automation/labels")).mod;
    const hook = (await tryImport("@/lib/webhooks/labels")).mod;
    const ae = asArr(auto?.AUTOMATION_EVENTS), we = asArr(hook?.WEBHOOK_EVENTS);
    const bad: string[] = [];
    for (const e of EVENTS) {
      if (!new RegExp(`["']${e.replace(/\./g, "\\.")}["']\\s*:`).test(cons)) bad.push(`${e}(consumer)`);
      const a = ae.find((x) => x.value === e);
      if (!a || !THAI.test(String(a.label))) bad.push(`${e}(automation)`);
      if (!we.some((x) => x.value === e)) bad.push(`${e}(webhook)`);
    }
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-12", "minute-jobs.ts ลงทะเบียน trips.generateDepartures (daily) + trips.minPaxCheck (15 นาที) · โหลด facade trips ตอนรัน", () => {
    const s = stripComments(read("src/lib/platform/minute-jobs.ts"));
    const blk = (name: string) => { const i = s.indexOf(`"${name}"`); return i < 0 ? "" : s.slice(i, i + 700); };
    const g = blk("trips.generateDepartures"), m = blk("trips.minPaxCheck");
    ok(g && /everyMinutes:\s*1440/.test(g) && /cadence:\s*["']daily["']/.test(g) && /@\/lib\/modules\/trips["']/.test(g), "trips.generateDepartures ไม่ครบ");
    ok(m && /everyMinutes:\s*15\b/.test(m) && /@\/lib\/modules\/trips["']/.test(m), "trips.minPaxCheck ไม่ครบ");
  });
  await st("S-13", "ไม่แตะไฟล์ต้องห้ามเทียบ session/trips: prisma/ · core/settings/ · โมดูลเดิม · ข้อสอบ p0.1/t0.1/t0.2/t0.3", () => {
    const base = git(["merge-base", "HEAD", "session/trips"]).trim();
    ok(base, "หา merge-base กับ session/trips ไม่ได้");
    const paths = ["prisma", "src/lib/core/settings", "src/lib/modules/pos", "src/lib/modules/rooms", "src/lib/modules/hotel", "src/lib/modules/dorm", "src/lib/modules/booking", "src/lib/modules/ticket",
      "scripts/qc-trips-p0.1.mts", "scripts/qc-trips-t0.1.mts", "scripts/qc-trips-t0.2.mts"];
    const changed = [...new Set([
      ...git(["diff", "--name-only", base, "--", ...paths]).split("\n"),
      ...git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n"),
    ].filter(Boolean))];
    const inBase = git(["ls-tree", "--name-only", "session/trips", "scripts/qc-trips-t0.3.mts"]).trim() !== "";
    if (inBase && git(["show", "session/trips:scripts/qc-trips-t0.3.mts"]) !== read("scripts/qc-trips-t0.3.mts")) changed.push("scripts/qc-trips-t0.3.mts");
    ok(changed.length === 0, `แตะ: ${changed.slice(0, 6).join(", ")}`);
  });
  await st("S-14", "zod strict ใน departures.ts + resources.ts · resources.ts จับ 23P01 ใต้ SAVEPOINT (EXCLUDE = ด่านสุดท้าย)", () => {
    const d = srcOf("src/lib/modules/trips/departures.ts"), r = srcOf("src/lib/modules/trips/resources.ts");
    ok(d && r, "ยังไม่มีไฟล์");
    for (const [n, s] of [["departures", d], ["resources", r]] as const) ok(/from\s*["']zod["']/.test(s) && /(z\.strictObject\(|\.strict\(\))/.test(s), `${n}: ไม่มี zod strict`);
    ok(/23P01/.test(read("src/lib/modules/trips/resources.ts")) && /SAVEPOINT/i.test(r), "resources.ts ไม่จับ 23P01/SAVEPOINT");
  });
  groupLine("S");

  // ═══════════════ C. ฟังก์ชันบริสุทธิ์ (ใต้ TZ เครื่อง Pacific/Chatham) ═══════════════
  console.log("\n── C: ฟังก์ชันบริสุทธิ์ (TZ เครื่อง = Pacific/Chatham) ──");
  const T6D = { daysBefore: 1, atMin: 1080 };
  await st("C-1", "ผังสถานะรอบ: ทางที่ได้ (STAFF/SYSTEM) · ทางที่ไม่ได้ · CANCELLED จบ", () => {
    const can = (a: string, b: string, who: string) => fn("canTransitionDeparture")(a, b, who) === true;
    const yes: [string, string, string][] = [["OPEN", "GUARANTEED", "STAFF"], ["OPEN", "GUARANTEED", "SYSTEM"], ["GUARANTEED", "OPEN", "STAFF"], ["OPEN", "CLOSED", "STAFF"], ["GUARANTEED", "CLOSED", "STAFF"], ["FULL", "CLOSED", "STAFF"],
      ["CLOSED", "OPEN", "STAFF"], ["OPEN", "FULL", "SYSTEM"], ["FULL", "OPEN", "SYSTEM"], ["FULL", "GUARANTEED", "SYSTEM"], ["OPEN", "CANCELLED", "STAFF"], ["CLOSED", "CANCELLED", "STAFF"], ["FULL", "CANCELLED", "STAFF"]];
    const no: [string, string, string][] = [["OPEN", "FULL", "STAFF"], ["FULL", "OPEN", "STAFF"], ["CLOSED", "GUARANTEED", "STAFF"], ["CANCELLED", "OPEN", "STAFF"], ["CANCELLED", "OPEN", "SYSTEM"], ["CANCELLED", "CLOSED", "STAFF"],
      ["GUARANTEED", "OPEN", "SYSTEM"], ["OPEN", "CLOSED", "SYSTEM"], ["OPEN", "CANCELLED", "SYSTEM"]];
    const bad = [...yes.filter((x) => !can(...x)).map((x) => `ต้องได้ ${x.join(">")}`), ...no.filter((x) => can(...x)).map((x) => `ต้องไม่ได้ ${x.join(">")}`)];
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("C-2", "weekdayOfYmd / addDaysYmd ไม่ขึ้นกับ TZ เครื่อง: 2027-03-01=จันทร์(1) · 2026-11-14=เสาร์(6) · 2024-02-29=พฤ.(4) · +1 ข้ามเดือน/อธิกสุรทิน", () => underOddTz(() => {
    eq(["2027-03-01", "2026-11-14", "2024-02-29", "2027-02-28"].map((d) => fn("weekdayOfYmd")(d)), [1, 6, 4, 0], "weekday");
    eq([fn("addDaysYmd")("2027-02-28", 1), fn("addDaysYmd")("2024-02-28", 1), fn("addDaysYmd")("2026-12-31", 1), fn("addDaysYmd")("2027-03-01", -1)], ["2027-03-01", "2024-02-29", "2027-01-01", "2027-02-28"], "addDays");
  }));
  await st("C-3", "localToUtc/utcToLocal Bangkok: 2027-03-02 00:10 = 2027-03-01T17:10Z (วันไทยไม่เลื่อน) · 2026-11-14 08:00 = 01:00Z · กลับทางได้ · tz เพี้ยน ⇒ Bangkok", () => underOddTz(() => {
    eq([iso(fn("localToUtc")("Asia/Bangkok", "2027-03-02", 10)), iso(fn("localToUtc")("Asia/Bangkok", "2026-11-14", 480))], ["2027-03-01T17:10:00.000Z", "2026-11-14T01:00:00.000Z"], "ไป");
    eq(fn("utcToLocal")("Asia/Bangkok", Z("2027-03-01T17:10:00Z")), { ymd: "2027-03-02", minutes: 10 }, "กลับ");
    eq([fn("normalizeTimezone")("Mars/Base"), fn("normalizeTimezone")(""), fn("normalizeTimezone")(null), fn("normalizeTimezone")("Europe/Berlin")], ["Asia/Bangkok", "Asia/Bangkok", "Asia/Bangkok", "Europe/Berlin"], "normalize");
  }));
  await st("C-4", "localToUtc Europe/Berlin (DST): 27 มี.ค. 09:00=08:00Z · 28 มี.ค. 09:00=07:00Z · 02:30 ไม่มีจริง ⇒ 03:30 CEST=01:30Z · 31 ต.ค. 02:30 ซ้ำ ⇒ ตัวแรก 00:30Z", () => underOddTz(() => {
    const L = (d: string, m: number) => iso(fn("localToUtc")("Europe/Berlin", d, m));
    eq([L("2027-03-27", 540), L("2027-03-28", 540), L("2027-03-28", 150), L("2027-10-31", 150)], ["2027-03-27T08:00:00.000Z", "2027-03-28T07:00:00.000Z", "2027-03-28T01:30:00.000Z", "2027-10-31T00:30:00.000Z"], "Berlin");
    eq(fn("utcToLocal")("Europe/Berlin", Z("2027-03-28T07:00:00Z")), { ymd: "2027-03-28", minutes: 540 }, "กลับ");
  }));
  const SCH = { rule: { kind: "WEEKLY", weekdays: [1, 3, 5] }, exceptions: [{ date: "2027-03-03", action: "SKIP" }, { date: "2027-03-05", action: "OVERRIDE", departTimeMin: 600, capacity: 7, minPax: null }],
    dateFrom: "2027-03-01", dateTo: "2027-03-14", departTimeMin: 480, capacity: 20, minPax: 6 };
  await st("C-5", "expandSchedule WEEKLY จ/พ/ศ 1–14 มี.ค. 2570: SKIP 3 · OVERRIDE 5 (10:00 · ความจุ 7 · ขั้นต่ำ null) ⇒ 1 5 8 10 12", () => underOddTz(() => {
    const r = asArr(fn("expandSchedule")(SCH, { fromYmd: "2027-03-01", toYmdExclusive: "2027-03-15" }));
    eq(r.map((x) => [x.localDate, x.departTimeMin, x.capacity, x.minPax]), [["2027-03-01", 480, 20, 6], ["2027-03-05", 600, 7, null], ["2027-03-08", 480, 20, 6], ["2027-03-10", 480, 20, 6], ["2027-03-12", 480, 20, 6]], "วัน");
  }));
  await st("C-6", "expandSchedule ตัดด้วยหน้าต่าง/dateFrom/dateTo · DAILY · DATES นอกช่วงทิ้ง · ขั้นต่ำกฎ null ⇒ undefined (ใช้ค่าตั้ง)", () => underOddTz(() => {
    const d = asArr(fn("expandSchedule")({ ...SCH, rule: { kind: "DAILY" }, exceptions: [], minPax: null }, { fromYmd: "2027-03-13", toYmdExclusive: "2027-03-20" }));
    eq(d.map((x) => x.localDate), ["2027-03-13", "2027-03-14"], "DAILY ตัดด้วย dateTo");
    ok(d.every((x) => x.minPax === undefined), `minPax ต้อง undefined: ${fmt(d)}`);
    const t = asArr(fn("expandSchedule")({ ...SCH, rule: { kind: "DATES", dates: ["2027-02-27", "2027-03-09", "2027-03-02", "2027-04-01"] }, exceptions: [] }, { fromYmd: "2027-03-01", toYmdExclusive: "2027-03-15" }));
    eq(t.map((x) => x.localDate), ["2027-03-02", "2027-03-09"], "DATES เรียง + ตัด");
  }));
  await st("C-7", "cutoffFor/cutoffAtColumn: 1 วันก่อน 18:00 ไทย · หน้าร้าน 0 วัน 07:00 · ไม่เกินเวลาออก · คอลัมน์ = ช่องทางที่ปิดช้าสุด", () => underOddTz(() => {
    const dep = { localDate: "2027-03-10", startsAt: Z("2027-03-10T01:00:00Z") };
    const t6 = { ...T6D, perChannel: { COUNTER: { daysBefore: 0, atMin: 420 } } };
    eq([iso(fn("cutoffFor")(dep, t6, "WEB", "Asia/Bangkok")), iso(fn("cutoffFor")(dep, t6, "COUNTER", "Asia/Bangkok")), iso(fn("cutoffAtColumn")(dep, t6, "Asia/Bangkok"))],
      ["2027-03-09T11:00:00.000Z", "2027-03-10T00:00:00.000Z", "2027-03-10T00:00:00.000Z"], "ราชาแบบจอ 17");
    const early = { localDate: "2027-03-10", startsAt: Z("2027-03-09T23:00:00Z") }; // 06:00 ไทย
    eq(iso(fn("cutoffFor")(early, t6, "COUNTER", "Asia/Bangkok")), "2027-03-09T23:00:00.000Z", "ไม่เกินเวลาออก");
  }));
  await st("C-8", "decisionAtFor + needsDecision: ต่ำกว่าขั้นต่ำหลังเวลาตัดสิน = true · ก่อนเวลา/GUARANTEED/ขั้นต่ำ null/ถึงขั้นต่ำ/เริ่มแล้ว = false", () => underOddTz(() => {
    const dep = { localDate: "2027-04-10", startsAt: Z("2027-04-10T01:00:00Z") };
    const da = fn("decisionAtFor")(dep, { decideDaysBefore: 1, decideAtMin: 1080 }, "Asia/Bangkok") as Date;
    eq(iso(da), "2027-04-09T11:00:00.000Z", "เวลาตัดสิน");
    const N = (o: Rec, t: string) => fn("needsDecision")({ status: "OPEN", minPax: 8, sold: 4, startsAt: dep.startsAt, ...o }, da, Z(t));
    eq([N({}, "2027-04-09T12:00:00Z"), N({}, "2027-04-09T10:59:00Z"), N({ status: "GUARANTEED" }, "2027-04-09T12:00:00Z"), N({ minPax: null }, "2027-04-09T12:00:00Z"), N({ sold: 8 }, "2027-04-09T12:00:00Z"), N({}, "2027-04-10T01:00:00Z")],
      [true, false, false, false, false, false], "กรณี");
  }));
  await st("C-9", "stopSellBlocks + saleBlockReason: [] = ทุกช่องทาง · เฉพาะ WEB · until หมดแล้ว = ไม่หยุด · จำกัดเอเจนซี่ · ลำดับเหตุ STATUS > STARTED > CUTOFF > STOP_SELL", () => underOddTz(() => {
    const B = (s: unknown, ch: string, ag: string | null, t = "2027-04-01T00:00:00Z") => fn("stopSellBlocks")(s, ch, ag, Z(t));
    eq([B(null, "WEB", null), B({ channels: [], reason: "x" }, "COUNTER", null), B({ channels: ["WEB"], reason: "x" }, "WEB", null), B({ channels: ["WEB"], reason: "x" }, "COUNTER", null),
      B({ channels: [], reason: "x", until: "2027-03-31T00:00:00Z" }, "WEB", null), B({ channels: [], agentAccountIds: ["ag1"], reason: "x" }, "AGENT_PORTAL", "ag1"), B({ channels: [], agentAccountIds: ["ag1"], reason: "x" }, "AGENT_PORTAL", "ag2")],
      [false, true, true, false, false, true, false], "stopSell");
    const d = { status: "OPEN", startsAt: Z("2027-04-10T01:00:00Z"), cutoffs: Object.fromEntries(SELL_CHANNELS.map((c) => [c, c === "COUNTER" ? "2027-04-10T00:00:00.000Z" : "2027-04-09T11:00:00.000Z"])), stopSell: { channels: ["LIFF"], reason: "x" } };
    const R = (o: Rec, ch: string, t: string) => fn("saleBlockReason")({ ...d, ...o }, ch, null, Z(t));
    eq([R({}, "WEB", "2027-04-09T10:00:00Z"), R({}, "WEB", "2027-04-09T12:00:00Z"), R({}, "COUNTER", "2027-04-09T12:00:00Z"), R({}, "LIFF", "2027-04-09T10:00:00Z"), R({ status: "CLOSED" }, "WEB", "2027-04-09T10:00:00Z"), R({}, "COUNTER", "2027-04-10T02:00:00Z")],
      [null, "CUTOFF", null, "STOP_SELL", "STATUS", "STARTED"], "saleBlockReason");
  }));
  groupLine("C");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uM = rid("uM"), uZ = rid("uZ"), uBk = rid("uBk"), uB = rid("uB");
  let setupErr = "";
  const U: Record<string, Actor> = {};
  const P: Record<string, { id: string; opt: string }> = {};
  const PT: Record<string, string> = {}; // ชื่อไทยของสินค้า
  try {
    await needTable("TripDeparture");
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) {
      await insertRow("Tenant", { id, name: `ทดสอบ T0.3 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: now() });
      tenantIds.push(id);
    }
    const mkUnit = async (id: string, tenantId: string, type: string, tag: string, settings: Rec = {}) => {
      try { await insertRow("BusinessUnit", { id, tenantId, type, name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify(settings), updatedAt: now() }); }
      catch (e) { throw new Error(type === "TRIPS" ? `สร้างหน่วยชนิด TRIPS ไม่ได้ (enum ของ T0.1 ยังไม่ลง): ${errMsg(e).slice(0, 80)}` : errMsg(e)); }
    };
    await mkUnit(uBk, tA, "BOOKING", "abk");
    await mkUnit(uA, tA, "TRIPS", "a"); await mkUnit(uA2, tA, "TRIPS", "a2"); await mkUnit(uM, tA, "TRIPS", "m");
    await mkUnit(uZ, tA, "TRIPS", "z", { timezone: "Europe/Berlin" }); await mkUnit(uB, tB, "TRIPS", "b");
    const mkUser = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], perms: string[]): Promise<void> => {
      const id = rid(`u${tag}`);
      const permissions = Object.fromEntries(perms.map((p) => [p, true]));
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: now() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: now(), updatedAt: now() });
      U[tag] = { role, unitAccess, permissions, userId: id };
    };
    await mkUser("oa", tA, "OWNER", ["*"], []);
    await mkUser("ob", tB, "OWNER", ["*"], []);
    await mkUser("se", tA, "STAFF", [uA], ["trips.departure.view", "trips.departure.edit"]);
    await mkUser("ss", tA, "STAFF", [uA], ["trips.departure.view", "trips.departure.status"]);
    await mkUser("sv", tA, "STAFF", [uA], ["trips.departure.view"]);
    await mkUser("sn", tA, "STAFF", [uA], []);
    await mkUser("s2", tA, "STAFF", [uA2], PERM_KEYS);
    // สินค้า + ตัวเลือก ด้วย SQL ดิบ (ไม่พึ่ง facade ของ T0.2)
    const mkProd = async (key: string, tenantId: string, unitId: string, titleTh: string, status = "ACTIVE", opt: Rec = { durationMin: 480 }) => {
      const id = rid(`p${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t03qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status, title: JSON.stringify({ th: titleTh, en: `QC ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: now() });
      const o = rid(`o${key}`);
      await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม" }), durationMin: null, nights: null, sortOrder: 1, active: true, updatedAt: now(), ...opt });
      P[key] = { id, opt: o }; PT[key] = titleTh;
    };
    await mkProd("A1", tA, uA, "เรือทดสอบ ก"); await mkProd("A2", tA, uA, "เรือทดสอบ ข"); await mkProd("A3", tA, uA, "เรือทดสอบ ค");
    await mkProd("AC", tA, uA, "ทดสอบปิดรับ"); await mkProd("AH", tA, uA, "ทดสอบระยะล่วงหน้า");
    await mkProd("AR", tA, uA, "สินค้าเก็บแล้ว", "ARCHIVED"); await mkProd("AN", tA, uA, "ไม่มีระยะเวลา", "ACTIVE", { durationMin: null, nights: null });
    await mkProd("AL", tA, uA, "ค้างคืน", "ACTIVE", { durationMin: null, nights: 2 });
    await mkProd("X2", tA, uA2, "หน่วยสอง"); await mkProd("M1", tA, uM, "ขั้นต่ำหนึ่ง"); await mkProd("M2", tA, uM, "ขั้นต่ำสอง");
    await mkProd("Z1", tA, uZ, "เบอร์ลิน", "ACTIVE", { durationMin: 240 }); await mkProd("B1", tB, uB, "ร้านบี");
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const ctxOf = (tag: string): Ctx => {
    const a = U[tag];
    if (!a) throw new AssertFail(`ไม่มีร้าน/ผู้ใช้ชั่วคราว (${setupErr || "ยังไม่ตั้ง"})`);
    return { tenantId: tag === "ob" ? tB : tA, actorUserId: a.userId };
  };
  const OA = () => ctxOf("oa");
  const needDb = async () => { needTrips(); await needTable("TripDeparture"); ctxOf("oa"); ok(P.A1, `ไม่มีสินค้าทดสอบ (${setupErr})`); };
  const setV = async (changes: Rec[]) => {
    const r = asRec(await S("setSettings")(U.oa, { tenantId: tA }, changes, {})) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  const DEP_SQL = `SELECT id, "productId", "optionId", "scheduleId", to_char("localDate",'YYYY-MM-DD') AS "localDate", to_char("startsAt",'YYYY-MM-DD"T"HH24:MI:SS".000Z"') AS "startsAt",
    to_char("endsAt",'YYYY-MM-DD"T"HH24:MI:SS".000Z"') AS "endsAt", to_char("cutoffAt",'YYYY-MM-DD"T"HH24:MI:SS".000Z"') AS "cutoffAt", status, capacity, sold, held, reserved, "minPax", version, "unitId", "tenantId", "stopSell" FROM "TripDeparture"`;
  const dep = async (id: string) => (await q(`${DEP_SQL} WHERE id = $1`, [id]))[0] ?? null;
  const depsOfSchedule = async (sid: string) => q(`${DEP_SQL} WHERE "scheduleId" = $1 ORDER BY "localDate", "startsAt"`, [sid]);
  const setCounters = (id: string, c: { sold?: number; held?: number; reserved?: number; status?: string }) =>
    pool.query(`UPDATE "TripDeparture" SET sold = COALESCE($2, sold), held = COALESCE($3, held), reserved = COALESCE($4, reserved), status = COALESCE($5, status) WHERE id = $1`, [id, c.sold ?? null, c.held ?? null, c.reserved ?? null, c.status ?? null]);
  const outbox = async (depId: string, type?: string) => q<{ type: string; payload: Rec; unitId: string | null; idempotencyKey: string }>(
    `SELECT type, payload, "unitId", "idempotencyKey" FROM "OutboxEvent" WHERE "tenantId" = $1 AND payload->>'departureId' = $2 ${type ? "AND type = $3" : ""} ORDER BY "createdAt"`, type ? [tA, depId, type] : [tA, depId]);
  const audits = async (depId: string) => q<{ action: string; actorId: string | null; after: Rec | null }>(`SELECT action, "actorId", after FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2 ORDER BY "createdAt"`, [tA, depId]).catch(() => []);
  const mkDep = async (k: string, localDate: string, timeMin: number, extra: Rec = {}, unitId = uA, ctx: Ctx = OA(), opts?: Rec): Promise<string> => {
    const r = await call("createDeparture", ctx, { unitId, productId: P[k].id, optionId: P[k].opt, localDate, departTimeMin: timeMin, capacity: 20, ...extra }, ...(opts ? [opts] : []));
    okR(r, `createDeparture ${k} ${localDate}`);
    return String(r.id);
  };
  const mkSched = async (k: string, input: Rec, unitId = uA): Promise<string> => {
    const r = await call("createSchedule", OA(), { unitId, productId: P[k].id, optionId: P[k].opt, exceptions: [], capacity: 20, departTimeMin: 480, ...input });
    okR(r, `createSchedule ${k}`);
    return String(r.id);
  };
  const mat = async (sid: string, nowIso: string, unitId = uA) => call("materializeSchedule", OA(), { unitId, scheduleId: sid }, { now: Z(nowIso) });

  // ═══════════════ SC. กฎซ้ำ → รอบ ═══════════════
  console.log("\n── SC: กฎซ้ำ → รอบ ──");
  let S1 = "", S5 = "";
  await st("SC-1", "createSchedule WEEKLY จ/พ/ศ + ข้อยกเว้น ⇒ {id} · ยังไม่สร้างรอบเอง · listSchedules เห็น paused=false", async () => {
    await needDb();
    S1 = await mkSched("A1", { rule: SCH.rule, exceptions: SCH.exceptions, dateFrom: SCH.dateFrom, dateTo: SCH.dateTo, capacity: 20, minPax: 6 });
    eq((await depsOfSchedule(S1)).length, 0, "รอบก่อน materialize");
    const l = await call("listSchedules", OA(), { unitId: uA, productId: P.A1.id });
    const it = asArr(l.items).find((x) => x.id === S1);
    eq([it?.paused, asRec(it?.rule)?.kind, asArr(it?.exceptions).length], [false, "WEEKLY", 2], "listSchedules");
  });
  await st("SC-2", "materializeSchedule (now = 1 มี.ค. 2570 00:00 ไทย) ⇒ 5 รอบ 1 5 8 10 12 · OVERRIDE 5 = 10:00 ความจุ 7 ขั้นต่ำ null · อื่น 08:00 ความจุ 20 ขั้นต่ำ 6 · ตัวนับ 0 · OPEN", async () => {
    ok(S1, "ไม่มีกฎจาก SC-1");
    const r = await mat(S1, "2027-03-01T00:00:00+07:00");
    okR(r, "materialize");
    eq(asArr(r.created).length || (Array.isArray(r.created) ? r.created.length : -1), 5, "created");
    const rows = await depsOfSchedule(S1);
    eq(rows.map((x) => [x.localDate, x.startsAt, x.capacity, x.minPax, x.status, x.sold + x.held + x.reserved, x.optionId]), [
      ["2027-03-01", "2027-03-01T01:00:00.000Z", 20, 6, "OPEN", 0, P.A1.opt], ["2027-03-05", "2027-03-05T03:00:00.000Z", 7, null, "OPEN", 0, P.A1.opt], ["2027-03-08", "2027-03-08T01:00:00.000Z", 20, 6, "OPEN", 0, P.A1.opt],
      ["2027-03-10", "2027-03-10T01:00:00.000Z", 20, 6, "OPEN", 0, P.A1.opt], ["2027-03-12", "2027-03-12T01:00:00.000Z", 20, 6, "OPEN", 0, P.A1.opt]], "รอบ");
    eq(rows[0]?.endsAt, "2027-03-01T09:00:00.000Z", "endsAt = เริ่ม + durationMin ของตัวเลือก (480)");
  });
  await st("SC-3", "รันซ้ำ ⇒ created [] · แถวยังเท่าเดิม (idempotent)", async () => {
    ok(S1, "ไม่มีกฎ");
    const before = (await depsOfSchedule(S1)).map((x) => [x.id, x.version]);
    const r = await mat(S1, "2027-03-01T00:00:00+07:00");
    okR(r, "materialize ซ้ำ");
    eq(Array.isArray(r.created) ? r.created.length : -1, 0, "created");
    eq((await depsOfSchedule(S1)).map((x) => [x.id, x.version]), before, "แถว/เวอร์ชัน");
  });
  await st("SC-4", "X5 materialize กฎเดียวกันพร้อมกัน 4 ทาง ⇒ แถวชุดเดียว (3 วัน · ไม่มีวันซ้ำ) · ไม่มีทาง throw", async () => {
    await needDb();
    const sid = await mkSched("A3", { rule: { kind: "DAILY" }, dateFrom: "2027-06-01", dateTo: "2027-06-03", departTimeMin: 420 });
    const rs = await Promise.all(Array.from({ length: 4 }, () => mat(sid, "2027-06-01T00:00:00+07:00").catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec)));
    ok(rs.every((r) => r.ok === true || r.code === "BUSY"), `ผล: ${fmt(rs)}`);
    const rows = await depsOfSchedule(sid);
    eq([rows.length, new Set(rows.map((x) => x.localDate)).size, rs.reduce((t, r) => t + (Array.isArray(r.created) ? r.created.length : 0), 0)], [3, 3, 3], "แถว/วัน/รวม created");
  });
  await st("SC-5", "ระยะล่วงหน้าจากค่าตั้ง T8 ชั้น PRODUCT = 3 ⇒ 3 วัน (รวมวันนี้) · ตัวควบคุมบวก: ตั้ง 5 ⇒ รันซ้ำได้เพิ่ม 2", async () => {
    await needDb();
    S5 = await mkSched("AH", { rule: { kind: "DAILY" }, dateFrom: "2027-05-01", dateTo: "2027-05-31", departTimeMin: 540 });
    await setV([{ key: T8, scope: "PRODUCT", scopeId: P.AH.id, value: 3 }]);
    okR(await mat(S5, "2027-05-01T00:00:00+07:00"), "materialize T8=3");
    eq((await depsOfSchedule(S5)).map((x) => x.localDate), ["2027-05-01", "2027-05-02", "2027-05-03"], "T8=3");
    await setV([{ key: T8, scope: "PRODUCT", scopeId: P.AH.id, value: 5 }]);
    const r = await mat(S5, "2027-05-01T00:00:00+07:00");
    eq([Array.isArray(r.created) ? r.created.length : -1, (await depsOfSchedule(S5)).length], [2, 5], "T8=5");
  });
  await st("SC-6", "T8 = null (สร้างทีละทริป) ⇒ HORIZON_OFF ไม่สร้างอะไร", async () => {
    ok(S5, "ไม่มีกฎจาก SC-5");
    await setV([{ key: T8, scope: "PRODUCT", scopeId: P.AH.id, value: null }]);
    codeR(await mat(S5, "2027-05-01T00:00:00+07:00"), "HORIZON_OFF", "T8 null");
    eq((await depsOfSchedule(S5)).length, 5, "แถวไม่เพิ่ม");
    await setV([{ key: T8, scope: "PRODUCT", scopeId: P.AH.id, value: 7 }]);
  });
  await st("SC-7", "พักกฎ ⇒ SCHEDULE_PAUSED · งานรายวันไม่สร้าง · รอบเดิม (มีคนจอง sold=3) ไม่ถูกแตะ · พักซ้ำ BAD_STATE · เปิดต่อ ⇒ สร้างวันที่ 6–7", async () => {
    ok(S5, "ไม่มีกฎจาก SC-5");
    const first = (await depsOfSchedule(S5))[0];
    await setCounters(String(first.id), { sold: 3 });
    const snap = await dep(String(first.id));
    okR(await call("pauseSchedule", OA(), { unitId: uA, scheduleId: S5 }), "pause");
    codeR(await call("pauseSchedule", OA(), { unitId: uA, scheduleId: S5 }), "BAD_STATE", "พักซ้ำ");
    codeR(await mat(S5, "2027-05-01T00:00:00+07:00"), "SCHEDULE_PAUSED", "materialize ตอนพัก");
    await fn("runGenerateDepartures")(Z("2027-05-01T00:00:00+07:00"), { tenantIds: [tA] });
    eq([(await depsOfSchedule(S5)).length, fmt(await dep(String(first.id)))], [5, fmt(snap)], "ไม่สร้างเพิ่ม + รอบเดิมเหมือนเดิม");
    ok(asArr((await call("listSchedules", OA(), { unitId: uA, productId: P.AH.id })).items).find((x) => x.id === S5)?.paused === true, "listSchedules ไม่แสดง paused");
    okR(await call("resumeSchedule", OA(), { unitId: uA, scheduleId: S5 }), "resume");
    okR(await mat(S5, "2027-05-01T00:00:00+07:00"), "materialize หลังเปิด");
    eq((await depsOfSchedule(S5)).map((x) => x.localDate).slice(5), ["2027-05-06", "2027-05-07"], "สร้างต่อ");
  });
  await st("SC-8", "updateSchedule เปลี่ยนเป็นจันทร์อย่างเดียว ⇒ mismatched = รอบ 5 10 12 · รอบที่มีอยู่ไม่ถูกแก้", async () => {
    ok(S1, "ไม่มีกฎ");
    const before = await depsOfSchedule(S1);
    const r = await call("updateSchedule", OA(), { unitId: uA, scheduleId: S1, rule: { kind: "WEEKLY", weekdays: [1] } });
    okR(r, "updateSchedule");
    const want = before.filter((x) => ["2027-03-05", "2027-03-10", "2027-03-12"].includes(String(x.localDate))).map((x) => x.id).sort();
    eq([...(Array.isArray(r.mismatched) ? (r.mismatched as string[]) : [])].sort(), want, "mismatched");
    eq((await depsOfSchedule(S1)).map((x) => [x.id, x.status, x.version]), before.map((x) => [x.id, x.status, x.version]), "รอบเดิม");
  });
  await st("SC-9", "ตรวจ input: dateFrom > dateTo · weekday 7 · ช่องแปลก ⇒ INVALID_INPUT · ตัวเลือกไม่มีระยะเวลา ⇒ NO_DURATION · สินค้าเก็บแล้ว ⇒ PRODUCT_ARCHIVED · ตัวเลือกของสินค้าอื่น ⇒ NOT_FOUND", async () => {
    await needDb();
    const base = { unitId: uA, productId: P.A1.id, optionId: P.A1.opt, rule: { kind: "DAILY" }, exceptions: [], departTimeMin: 480, capacity: 10, dateFrom: "2027-07-01", dateTo: "2027-07-05" };
    const C = (o: Rec) => call("createSchedule", OA(), { ...base, ...o });
    codeR(await C({ dateFrom: "2027-07-06" }), "INVALID_INPUT", "dateFrom > dateTo");
    codeR(await C({ rule: { kind: "WEEKLY", weekdays: [7] } }), "INVALID_INPUT", "weekday 7");
    codeR(await C({ bogus: 1 }), "INVALID_INPUT", "ช่องแปลก");
    codeR(await C({ productId: P.AN.id, optionId: P.AN.opt }), "NO_DURATION", "ไม่มีระยะเวลา");
    codeR(await C({ productId: P.AR.id, optionId: P.AR.opt }), "PRODUCT_ARCHIVED", "ARCHIVED");
    codeR(await C({ optionId: P.A2.opt }), "NOT_FOUND", "ตัวเลือกของสินค้าอื่น");
    codeR(await C({ exceptions: [{ date: "2027-07-02", action: "SKIP" }, { date: "2027-07-02", action: "OVERRIDE", capacity: 3 }] }), "INVALID_INPUT", "ข้อยกเว้นวันซ้ำ");
  });
  await st("SC-10", "งาน runGenerateDepartures (tenantIds=[ร้าน A]) สร้างรอบให้กฎที่ยังไม่สร้าง · สองงานซ้อนกัน ⇒ ไม่ซ้ำ", async () => {
    await needDb();
    const sid = await mkSched("A2", { rule: { kind: "DAILY" }, dateFrom: "2027-06-10", dateTo: "2027-06-12", departTimeMin: 360 });
    const nowJ = Z("2027-06-10T00:00:00+07:00");
    await Promise.all([fn("runGenerateDepartures")(nowJ, { tenantIds: [tA] }), fn("runGenerateDepartures")(nowJ, { tenantIds: [tA] })]);
    const rows = await depsOfSchedule(sid);
    eq([rows.length, new Set(rows.map((x) => x.localDate)).size], [3, 3], "แถว");
  });
  await st("SC-11", "กฎที่มีทรัพยากรชนกับรอบอื่นวันหนึ่ง ⇒ ไม่สร้างวันนั้น + conflicts บอกวัน/ทรัพยากร/รอบที่ชน · วันอื่นสร้างตามปกติ", async () => {
    await needDb();
    const boat = await call("createResource", OA(), { unitId: uA, kind: "BOAT", name: `เรือกฎ ${STAMP}`, seats: 20 });
    okR(boat, "createResource");
    const busy = await mkDep("A1", "2027-08-11", 480, { resourceIds: [String(boat.id)] });
    const sid = await mkSched("A2", { rule: { kind: "DAILY" }, dateFrom: "2027-08-10", dateTo: "2027-08-12", departTimeMin: 540, resourceIds: [String(boat.id)] });
    const r = await mat(sid, "2027-08-10T00:00:00+07:00");
    okR(r, "materialize");
    eq((await depsOfSchedule(sid)).map((x) => x.localDate), ["2027-08-10", "2027-08-12"], "วันที่สร้าง");
    const c = asArr(r.conflicts);
    eq(c.map((x) => [x.localDate, x.resourceId, x.departureId]), [["2027-08-11", String(boat.id), busy]], "conflicts");
  });
  groupLine("SC");

  // ═══════════════ TZ. เขตเวลา ═══════════════
  console.log("\n── TZ: เที่ยงคืนไทย · ร้านเขตเวลาอื่น ──");
  await st("TZ-1", "เที่ยงคืนไทย: กฎ 00:10 วันที่ 1–2 ก.ค. (now 30 มิ.ย. 23:50 ไทย) ⇒ localDate 07-01 เริ่ม 06-30T17:10Z · 07-02 เริ่ม 07-01T17:10Z (วันไทยไม่เลื่อนตาม UTC)", async () => {
    await needDb();
    const sid = await mkSched("A3", { rule: { kind: "DAILY" }, dateFrom: "2027-07-01", dateTo: "2027-07-02", departTimeMin: 10 });
    okR(await mat(sid, "2027-06-30T23:50:00+07:00"), "materialize");
    eq((await depsOfSchedule(sid)).map((x) => [x.localDate, x.startsAt]), [["2027-07-01", "2027-06-30T17:10:00.000Z"], ["2027-07-02", "2027-07-01T17:10:00.000Z"]], "รอบ");
  });
  await st("TZ-2", "ร้าน Europe/Berlin: กฎ 09:00 วันที่ 27–29 มี.ค. 2570 ⇒ 08:00Z · 07:00Z · 07:00Z (DST) · localDate ตามเวลาร้าน", async () => {
    await needDb();
    const sid = await mkSched("Z1", { rule: { kind: "DAILY" }, dateFrom: "2027-03-27", dateTo: "2027-03-29", departTimeMin: 540 }, uZ);
    okR(await mat(sid, "2027-03-26T00:00:00Z", uZ), "materialize");
    eq((await depsOfSchedule(sid)).map((x) => [x.localDate, x.startsAt, x.endsAt]), [["2027-03-27", "2027-03-27T08:00:00.000Z", "2027-03-27T12:00:00.000Z"], ["2027-03-28", "2027-03-28T07:00:00.000Z", "2027-03-28T11:00:00.000Z"], ["2027-03-29", "2027-03-29T07:00:00.000Z", "2027-03-29T11:00:00.000Z"]], "รอบ");
  });
  await st("TZ-3", "ปิดรับในเขตเวลาร้าน: Berlin รอบ 28 มี.ค. ⇒ WEB = 27 มี.ค. 18:00 CET = 17:00Z (cutoffAt คอลัมน์เท่ากัน) · Bangkok รอบ 10 มี.ค. 08:00 ⇒ 9 มี.ค. 11:00Z", async () => {
    await needDb();
    const z = await mkDep("Z1", "2027-03-28", 600, {}, uZ);
    const g = await call("getDeparture", OA(), { unitId: uZ, departureId: z });
    okR(g, "getDeparture");
    const d = asRec(g.departure) ?? {};
    eq([asRec(d.cutoffs)?.WEB, (await dep(z))?.cutoffAt], ["2027-03-27T17:00:00.000Z", "2027-03-27T17:00:00.000Z"], "Berlin");
    const b = await mkDep("A3", "2027-03-10", 480);
    eq((await dep(b))?.cutoffAt, "2027-03-09T11:00:00.000Z", "Bangkok");
  });
  await st("TZ-4", "แก้เวลาเป็น 23:59 และ 00:00 ⇒ localDate ไม่เปลี่ยน · startsAt ตามวันเดิมของร้าน", async () => {
    await needDb();
    const id = await mkDep("A3", "2027-09-15", 480);
    okR(await call("updateDeparture", OA(), { unitId: uA, departureId: id, departTimeMin: 1439 }), "23:59");
    const a = await dep(id);
    okR(await call("updateDeparture", OA(), { unitId: uA, departureId: id, departTimeMin: 0 }), "00:00");
    const b = await dep(id);
    eq([a?.localDate, a?.startsAt, b?.localDate, b?.startsAt], ["2027-09-15", "2027-09-15T16:59:00.000Z", "2027-09-15", "2027-09-14T17:00:00.000Z"], "เวลา");
  });
  await st("TZ-5", "\"วันนี้\" ของร้าน: now = 1 ส.ค. 08:30 ไทย กฎ 08:00 ⇒ ข้ามวันที่ 1 (เลยเวลาแล้ว) เริ่ม 2 ส.ค.", async () => {
    await needDb();
    const sid = await mkSched("A3", { rule: { kind: "DAILY" }, dateFrom: "2027-08-01", dateTo: "2027-08-03", departTimeMin: 480 });
    okR(await mat(sid, "2027-08-01T08:30:00+07:00"), "materialize");
    eq((await depsOfSchedule(sid)).map((x) => x.localDate), ["2027-08-02", "2027-08-03"], "วัน");
  });
  groupLine("TZ");

  // ═══════════════ D. รอบเดี่ยว ═══════════════
  console.log("\n── D: รอบเดี่ยว ──");
  let D1 = "";
  await st("D-1", "createDeparture ⇒ OPEN · ตัวนับ 0 · scheduleId null · endsAt จากตัวเลือก · ขั้นต่ำจากค่าตั้ง (fallback DIVE_SHOP = null) · version 0", async () => {
    await needDb();
    D1 = await mkDep("A1", "2027-04-01", 480, { capacity: 10 });
    const r = await dep(D1);
    eq([r?.status, r?.sold, r?.held, r?.reserved, r?.scheduleId, r?.startsAt, r?.endsAt, r?.capacity, r?.minPax, r?.version, r?.localDate],
      ["OPEN", 0, 0, 0, null, "2027-04-01T01:00:00.000Z", "2027-04-01T09:00:00.000Z", 10, null, 0, "2027-04-01"], "แถว");
  });
  await st("D-2", "รอบซ้ำ (สินค้า/ตัวเลือก/เวลาเดียวกัน) ⇒ DUPLICATE_DEPARTURE ไม่ throw · วันเดียวกันต่างเวลา ⇒ ได้", async () => {
    ok(D1, "ไม่มีรอบ D-1");
    codeR(await call("createDeparture", OA(), { unitId: uA, productId: P.A1.id, optionId: P.A1.opt, localDate: "2027-04-01", departTimeMin: 480, capacity: 10 }), "DUPLICATE_DEPARTURE", "ซ้ำ");
    await mkDep("A1", "2027-04-01", 780, { capacity: 10 });
  });
  await st("D-3", "รอบในอดีต ⇒ PAST_DEPARTURE (เวลาจริง และ opts.now)", async () => {
    await needDb();
    codeR(await call("createDeparture", OA(), { unitId: uA, productId: P.A1.id, optionId: P.A1.opt, localDate: "2026-01-05", departTimeMin: 480, capacity: 10 }), "PAST_DEPARTURE", "อดีตจริง");
    codeR(await call("createDeparture", OA(), { unitId: uA, productId: P.A1.id, optionId: P.A1.opt, localDate: "2027-10-01", departTimeMin: 480, capacity: 10 }, { now: Z("2027-10-01T02:00:00Z") }), "PAST_DEPARTURE", "opts.now");
  });
  await st("D-4", "getDeparture DTO ครบ (cutoffs ทุก 12 ช่องทาง · resources · decisionAt · needsDecision) · listDepartures เรียงเวลา · ช่วง > 62 วัน ⇒ INVALID_INPUT", async () => {
    ok(D1, "ไม่มีรอบ D-1");
    const g = await call("getDeparture", OA(), { unitId: uA, departureId: D1 });
    okR(g, "getDeparture");
    const d = asRec(g.departure) ?? {};
    const keys = ["id", "productId", "optionId", "scheduleId", "localDate", "startsAt", "endsAt", "status", "capacity", "sold", "held", "reserved", "minPax", "cutoffAt", "stopSell", "version", "resources", "cutoffs", "decisionAt", "needsDecision"];
    eq(keys.filter((k) => !(k in d)), [], "คีย์ที่ขาด");
    eq([Object.keys(asRec(d.cutoffs) ?? {}).sort(), d.localDate, d.needsDecision], [[...SELL_CHANNELS].sort(), "2027-04-01", false], "DTO");
    const l = await call("listDepartures", OA(), { unitId: uA, from: "2027-04-01", to: "2027-04-01", productId: P.A1.id });
    eq(asArr(l.items).map((x) => iso(x.startsAt)), ["2027-04-01T01:00:00.000Z", "2027-04-01T06:00:00.000Z"], "list");
    codeR(await call("listDepartures", OA(), { unitId: uA, from: "2027-01-01", to: "2027-04-01" }), "INVALID_INPUT", "ช่วงยาวเกิน");
  });
  await st("D-5", "updateDeparture ขั้นต่ำ/ระยะเวลา ⇒ บันทึก + endsAt ใหม่ · ช่องแปลก ⇒ INVALID_INPUT", async () => {
    ok(D1, "ไม่มีรอบ D-1");
    okR(await call("updateDeparture", OA(), { unitId: uA, departureId: D1, minPax: 5, durationMin: 300 }), "update");
    const r = await dep(D1);
    eq([r?.minPax, r?.endsAt], [5, "2027-04-01T06:00:00.000Z"], "แถว");
    codeR(await call("updateDeparture", OA(), { unitId: uA, departureId: D1, capacity: 3 }), "INVALID_INPUT", "capacity ไม่ใช่ช่องของ updateDeparture");
  });
  await st("D-6", "ตัวเลือกค้างคืน (nights 2) ⇒ endsAt = เริ่ม + 2,880 นาที · ตัวเลือกไม่มีระยะเวลา: ไม่ส่ง durationMin ⇒ NO_DURATION · ส่ง ⇒ ได้", async () => {
    await needDb();
    const a = await mkDep("AL", "2027-04-02", 1080);
    eq([(await dep(a))?.startsAt, (await dep(a))?.endsAt], ["2027-04-02T11:00:00.000Z", "2027-04-04T11:00:00.000Z"], "ค้างคืน");
    codeR(await call("createDeparture", OA(), { unitId: uA, productId: P.AN.id, optionId: P.AN.opt, localDate: "2027-04-02", departTimeMin: 480, capacity: 5 }), "NO_DURATION", "ไม่มีระยะเวลา");
    await mkDep("AN", "2027-04-02", 480, { durationMin: 120 });
  });
  await st("D-7", "แก้เวลารอบที่มีคน (sold>0) ไม่ส่ง confirm ⇒ CONFIRM_REQUIRED ไม่เปลี่ยน · confirm:true ⇒ เปลี่ยน · CANCELLED ⇒ BAD_STATE", async () => {
    await needDb();
    const id = await mkDep("A2", "2027-04-03", 480);
    await setCounters(id, { sold: 2 });
    codeR(await call("updateDeparture", OA(), { unitId: uA, departureId: id, departTimeMin: 540 }), "CONFIRM_REQUIRED", "ไม่ confirm");
    eq((await dep(id))?.startsAt, "2027-04-03T01:00:00.000Z", "ไม่เปลี่ยน");
    okR(await call("updateDeparture", OA(), { unitId: uA, departureId: id, departTimeMin: 540, confirm: true }), "confirm");
    eq((await dep(id))?.startsAt, "2027-04-03T02:00:00.000Z", "เปลี่ยน");
    const c = await mkDep("A2", "2027-04-04", 480);
    okR(await call("cancelDeparture", OA(), { unitId: uA, departureId: c, reason: "ทดสอบยกเลิก" }), "cancel");
    codeR(await call("updateDeparture", OA(), { unitId: uA, departureId: c, minPax: 3 }), "BAD_STATE", "CANCELLED");
  });
  groupLine("D");

  // ═══════════════ ST. ผังสถานะรอบ ═══════════════
  console.log("\n── ST: ผังสถานะรอบ ──");
  const SS = (id: string, status: string, ctx: Ctx = OA(), opts?: Rec) => call("setDepartureStatus", ctx, { unitId: uA, departureId: id, status }, ...(opts ? [opts] : []));
  let STd = "";
  await st("ST-1", "OPEN → GUARANTEED (STAFF) ⇒ version +1 · event status_changed 1 ตัว", async () => {
    await needDb();
    STd = await mkDep("A2", "2027-04-20", 480);
    const r = await SS(STd, "GUARANTEED");
    okR(r, "OPEN→GUARANTEED");
    eq([(await dep(STd))?.status, (await dep(STd))?.version, (await outbox(STd, "trips.departure.status_changed")).length], ["GUARANTEED", 1, 1], "ผล");
  });
  await st("ST-2", "GUARANTEED → OPEN · OPEN → CLOSED · CLOSED → OPEN (STAFF) ได้ทั้งหมด", async () => {
    ok(STd, "ไม่มีรอบ");
    for (const s of ["OPEN", "CLOSED", "OPEN"]) okR(await SS(STd, s), `→${s}`);
    eq((await dep(STd))?.status, "OPEN", "สถานะ");
  });
  await st("ST-3", "CLOSED → GUARANTEED ⇒ FORBIDDEN_TRANSITION (ต้องเปิดก่อน) · สถานะไม่เปลี่ยน", async () => {
    ok(STd, "ไม่มีรอบ");
    okR(await SS(STd, "CLOSED"), "→CLOSED");
    codeR(await SS(STd, "GUARANTEED"), "FORBIDDEN_TRANSITION", "CLOSED→GUARANTEED");
    eq((await dep(STd))?.status, "CLOSED", "สถานะ");
    okR(await SS(STd, "OPEN"), "→OPEN");
  });
  await st("ST-4", "STAFF ขอ FULL หรือ CANCELLED ผ่าน setDepartureStatus ⇒ FORBIDDEN_TRANSITION (FULL = ระบบ · ยกเลิก = cancelDeparture)", async () => {
    ok(STd, "ไม่มีรอบ");
    codeR(await SS(STd, "FULL"), "FORBIDDEN_TRANSITION", "→FULL");
    codeR(await SS(STd, "CANCELLED"), "FORBIDDEN_TRANSITION", "→CANCELLED");
  });
  await st("ST-5", "สถานะเดิม ⇒ BAD_STATE · สถานะแปลก ⇒ INVALID_INPUT", async () => {
    ok(STd, "ไม่มีรอบ");
    codeR(await SS(STd, "OPEN"), "BAD_STATE", "OPEN→OPEN");
    codeR(await SS(STd, "DEPARTED"), "INVALID_INPUT", "สถานะแปลก");
  });
  await st("ST-6", "FULL (ระบบตั้ง) → CLOSED ได้ · FULL → OPEN โดย STAFF ⇒ FORBIDDEN_TRANSITION", async () => {
    await needDb();
    const id = await mkDep("A2", "2027-04-21", 480, { capacity: 4 });
    await setCounters(id, { sold: 4, status: "FULL" });
    codeR(await SS(id, "OPEN"), "FORBIDDEN_TRANSITION", "FULL→OPEN");
    okR(await SS(id, "CLOSED"), "FULL→CLOSED");
  });
  await st("ST-7", "CANCELLED จบ: → OPEN ⇒ FORBIDDEN_TRANSITION · ยกเลิกซ้ำ ⇒ FORBIDDEN_TRANSITION", async () => {
    await needDb();
    const id = await mkDep("A2", "2027-04-22", 480);
    okR(await call("cancelDeparture", OA(), { unitId: uA, departureId: id, reason: "คลื่นลม" }), "cancel");
    codeR(await SS(id, "OPEN"), "FORBIDDEN_TRANSITION", "CANCELLED→OPEN");
    codeR(await call("cancelDeparture", OA(), { unitId: uA, departureId: id, reason: "คลื่นลม" }), "FORBIDDEN_TRANSITION", "ยกเลิกซ้ำ");
  });
  await st("ST-8", "รอบที่เริ่มแล้ว: CLOSED → OPEN / OPEN → GUARANTEED ⇒ PAST_DEPARTURE · ปิดรับรอบที่เริ่มแล้วได้", async () => {
    await needDb();
    const id = await mkDep("A2", "2027-04-23", 480);
    const after = { now: Z("2027-04-23T02:00:00Z") };
    codeR(await SS(id, "GUARANTEED", OA(), after), "PAST_DEPARTURE", "OPEN→GUARANTEED หลังเริ่ม");
    okR(await SS(id, "CLOSED", OA(), after), "ปิดรับหลังเริ่ม");
    codeR(await SS(id, "OPEN", OA(), after), "PAST_DEPARTURE", "เปิดคืนหลังเริ่ม");
  });
  await st("ST-9", "X3 CAS: ยืนยันออกพร้อมกัน 6 ทาง ⇒ สำเร็จ 1 · ที่เหลือ BAD_STATE · version +1 ครั้งเดียว · event 1 ตัว", async () => {
    await needDb();
    const id = await mkDep("A2", "2027-04-24", 480);
    const rs = await Promise.all(Array.from({ length: 6 }, () => SS(id, "GUARANTEED").catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec)));
    eq([rs.filter((r) => r.ok === true).length, rs.filter((r) => r.ok === false && r.code === "BAD_STATE").length], [1, 5], `ผล ${fmt(rs.filter((r) => r.ok !== true).slice(0, 1))}`);
    eq([(await dep(id))?.version, (await outbox(id, "trips.departure.status_changed")).length], [1, 1], "version/event");
  });
  groupLine("ST");

  // ═══════════════ CAP. ความจุ ═══════════════
  console.log("\n── CAP: ความจุ ──");
  const CAPc = (id: string, capacity: number, ctx: Ctx = OA()) => call("setDepartureCapacity", ctx, { unitId: uA, departureId: id, capacity });
  await st("CAP-1", "ใช้แล้ว 8 (sold 5 held 2 reserved 1): ลดเป็น 7 ⇒ CAPACITY_BELOW_USED used 8 ไม่เปลี่ยน · ลดเป็น 8 ⇒ ได้ · ตัวนับไม่ถูกแตะ", async () => {
    await needDb();
    const id = await mkDep("A3", "2027-05-10", 480, { capacity: 20 });
    await setCounters(id, { sold: 5, held: 2, reserved: 1 });
    const r = await CAPc(id, 7);
    codeR(r, "CAPACITY_BELOW_USED", "ลดเป็น 7");
    eq([r.used, (await dep(id))?.capacity], [8, 20], "used/ความจุ");
    okR(await CAPc(id, 8), "ลดเป็น 8");
    const d = await dep(id);
    eq([d?.capacity, d?.sold, d?.held, d?.reserved], [8, 5, 2, 1], "หลังลด");
  });
  await st("CAP-2", "เพิ่มความจุได้ · รอบ CANCELLED ⇒ BAD_STATE · ค่าติดลบ ⇒ INVALID_INPUT", async () => {
    await needDb();
    const id = await mkDep("A3", "2027-05-11", 480, { capacity: 10 });
    okR(await CAPc(id, 30), "เพิ่ม");
    eq((await dep(id))?.capacity, 30, "ความจุ");
    codeR(await CAPc(id, -1), "INVALID_INPUT", "ติดลบ");
    okR(await call("cancelDeparture", OA(), { unitId: uA, departureId: id, reason: "ทดสอบยกเลิก" }), "cancel");
    codeR(await CAPc(id, 40), "BAD_STATE", "CANCELLED");
  });
  await st("CAP-3", "FULL แล้วเพิ่มความจุ ⇒ OPEN (ขั้นต่ำ null) / GUARANTEED (sold ≥ ขั้นต่ำ) ในคำสั่งเดียว", async () => {
    await needDb();
    const a = await mkDep("A3", "2027-05-12", 480, { capacity: 4 });
    const b = await mkDep("A3", "2027-05-13", 480, { capacity: 4, minPax: 3 });
    for (const id of [a, b]) await setCounters(id, { sold: 4, status: "FULL" });
    okR(await CAPc(a, 6), "a"); okR(await CAPc(b, 6), "b");
    eq([(await dep(a))?.status, (await dep(b))?.status], ["OPEN", "GUARANTEED"], "สถานะ");
  });
  await st("CAP-4", "X3: ลดความจุ 20 ทาง (5..24) พร้อมกับตัดที่ด้วย SQL ดิบ 10 ทาง ⇒ ไม่มี throw · ผลมีแต่ ok/CAPACITY_BELOW_USED · ท้ายสุด capacity ≥ sold+held+reserved", async () => {
    await needDb();
    const id = await mkDep("A3", "2027-05-14", 480, { capacity: 30 });
    await setCounters(id, { sold: 12 });
    const reds = Array.from({ length: 20 }, (_, i) => CAPc(id, 5 + i).catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec));
    const incs = Array.from({ length: 10 }, () => pool.query(`UPDATE "TripDeparture" SET sold = sold + 1 WHERE id = $1 AND sold + held + reserved + 1 <= capacity`, [id]).then((r) => r.rowCount ?? 0));
    const [rs, ns] = await Promise.all([Promise.all(reds), Promise.all(incs)]);
    ok(rs.every((r) => r.ok === true || (r.ok === false && r.code === "CAPACITY_BELOW_USED")), `ผลแปลก: ${fmt(rs.filter((r) => r.ok !== true && r.code !== "CAPACITY_BELOW_USED").slice(0, 2))}`);
    ok(rs.filter((r) => r.ok === false).length >= 7, "ค่า 5..11 ต้องถูกปฏิเสธทั้งหมด (ใช้แล้ว ≥ 12)");
    const d = await dep(id);
    ok(Number(d?.capacity) >= Number(d?.sold) + Number(d?.held) + Number(d?.reserved), `capacity ${d?.capacity} < ใช้แล้ว ${d?.sold} (ตัดได้ ${ns.reduce((a, b) => a + b, 0)})`);
  });
  await st("CAP-5", "X3 ซ้ำ 5 รอบ (ลดเป็นค่าเท่ายอดใช้ + ตัดที่พร้อมกัน) ⇒ ไม่เคยเกิน capacity", async () => {
    await needDb();
    const bad: string[] = [];
    for (let k = 0; k < 5; k++) {
      const id = await mkDep("A3", `2027-05-${String(15 + k).padStart(2, "0")}`, 480, { capacity: 20 });
      await setCounters(id, { sold: 10 });
      await Promise.all([...Array.from({ length: 5 }, () => CAPc(id, 10).catch(() => ({}))), ...Array.from({ length: 5 }, () => pool.query(`UPDATE "TripDeparture" SET held = held + 1 WHERE id = $1 AND sold + held + reserved + 1 <= capacity`, [id]))]);
      const d = await dep(id);
      if (Number(d?.capacity) < Number(d?.sold) + Number(d?.held) + Number(d?.reserved)) bad.push(fmt(d));
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  groupLine("CAP");

  // ═══════════════ RS. ทรัพยากรกันชน ═══════════════
  console.log("\n── RS: ทรัพยากรกันชนข้ามสินค้า ──");
  let BOAT = "", RP1 = "", RP2 = "";
  const assign = (departureId: string, resourceId: string, ctx: Ctx = OA(), unitId = uA) => call("assignResource", ctx, { unitId, departureId, resourceId });
  const activeUses = async (resourceId: string) => q(`SELECT "departureId", to_char("startsAt",'YYYY-MM-DD"T"HH24:MI:SS".000Z"') AS s, to_char("endsAt",'YYYY-MM-DD"T"HH24:MI:SS".000Z"') AS e FROM "TripResourceUse" WHERE "resourceId" = $1 AND active ORDER BY "startsAt"`, [resourceId]);
  await st("RS-1", "createResource / updateResource / listResources · ชนิดแปลก ⇒ INVALID_INPUT", async () => {
    await needDb();
    const r = await call("createResource", OA(), { unitId: uA, kind: "BOAT", name: "เรือทดสอบ 1", seats: 24 });
    okR(r, "create");
    BOAT = String(r.id);
    okR(await call("updateResource", OA(), { unitId: uA, resourceId: BOAT, name: "เรือราชา QC" }), "update");
    const l = await call("listResources", OA(), { unitId: uA, kind: "BOAT" });
    eq(asArr(l.items).filter((x) => x.id === BOAT).map((x) => [x.name, x.kind, x.seats]), [["เรือราชา QC", "BOAT", 24]], "list");
    codeR(await call("createResource", OA(), { unitId: uA, kind: "SUBMARINE", name: "x" }), "INVALID_INPUT", "ชนิดแปลก");
  });
  await st("RS-2", "มอบเรือให้รอบสินค้า ก (09:00–17:00) ⇒ ได้ · มอบซ้ำ ⇒ useId เดิม · แถว active 1 · ช่วงเวลา = ของรอบ", async () => {
    ok(BOAT, "ไม่มีเรือ");
    RP1 = await mkDep("A1", "2027-06-20", 540);
    const a = await assign(RP1, BOAT), b = await assign(RP1, BOAT);
    okR(a, "มอบ"); okR(b, "มอบซ้ำ");
    eq(b.useId, a.useId, "useId");
    eq(await activeUses(BOAT), [{ departureId: RP1, s: "2027-06-20T02:00:00.000Z", e: "2027-06-20T10:00:00.000Z" }], "แถว");
  });
  await st("RS-3", "เรือลำเดียวกันกับรอบสินค้า ข ที่ทับเวลา (12:00–14:00) ⇒ RESOURCE_CLASH · conflict ชี้รอบ ก · ข้อความไทยมีชื่อสินค้า ก · ไม่มีแถวใหม่", async () => {
    ok(RP1, "ไม่มีรอบ RS-2");
    RP2 = await mkDep("A2", "2027-06-20", 720, { durationMin: 120 });
    const r = await assign(RP2, BOAT);
    codeR(r, "RESOURCE_CLASH", "ชน");
    eq([asRec(r.conflict)?.departureId, asRec(r.conflict)?.productId, asRec(r.conflict)?.localDate, asRec(r.conflict)?.resourceId], [RP1, P.A1.id, "2027-06-20", BOAT], "conflict");
    ok(typeof r.message === "string" && r.message.includes(PT.A1) && THAI.test(r.message), `ข้อความต้องมีชื่อ "${PT.A1}": ${fmt(r.message)}`);
    eq((await activeUses(BOAT)).length, 1, "แถว active");
  });
  await st("RS-4", "ต่อกันพอดี (สินค้า ข 17:00–19:00) ⇒ ได้ ([) ไม่ซ้อน)", async () => {
    ok(BOAT, "ไม่มีเรือ");
    const id = await mkDep("A2", "2027-06-20", 1020, { durationMin: 120 });
    okR(await assign(id, BOAT), "ต่อกัน");
  });
  await st("RS-5", "ด่านสุดท้ายในฐาน: INSERT ดิบ TripResourceUse ทับเวลา active ⇒ 23P01 (EXCLUDE ของ T0.1)", async () => {
    ok(RP1, "ไม่มีรอบ");
    const code = await pgCode(() => insertRow("TripResourceUse", { tenantId: tA, unitId: uA, resourceId: BOAT, departureId: RP2, startsAt: "2027-06-20 05:00:00", endsAt: "2027-06-20 07:00:00", active: true, updatedAt: "2027-01-01 00:00:00" }));
    eq(code, "23P01", "SQLSTATE");
  });
  await st("RS-6", "X3: มอบเรือลำใหม่ให้ 10 รอบที่ทับกัน (2 สินค้า) พร้อมกัน ⇒ สำเร็จ 1 · RESOURCE_CLASH 9 · ไม่มี throw · แถว active 1", async () => {
    await needDb();
    const b = await call("createResource", OA(), { unitId: uA, kind: "BOAT", name: `เรือแย่ง ${STAMP}`, seats: 10 });
    okR(b, "createResource");
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push(await mkDep(i % 2 ? "A1" : "A2", "2027-06-25", 480 + i * 10));
    const rs = await Promise.all(ids.map((id) => assign(id, String(b.id)).catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec)));
    eq([rs.filter((r) => r.ok === true).length, rs.filter((r) => r.ok === false && r.code === "RESOURCE_CLASH").length, (await activeUses(String(b.id))).length], [1, 9, 1], `ผล ${fmt(rs.filter((r) => r.ok !== true && r.code !== "RESOURCE_CLASH").slice(0, 1))}`);
  });
  await st("RS-7", "แก้เวลารอบให้ไปทับรอบอื่นที่ใช้เรือ ⇒ RESOURCE_CLASH และไม่มีอะไรเปลี่ยน · แก้ไปช่วงว่าง ⇒ แถวใช้เรือย้ายตาม", async () => {
    ok(BOAT, "ไม่มีเรือ");
    const id = await mkDep("A2", "2027-06-20", 1200, { durationMin: 60 }); // 20:00–21:00
    okR(await assign(id, BOAT), "มอบ");
    const before = await dep(id);
    codeR(await call("updateDeparture", OA(), { unitId: uA, departureId: id, departTimeMin: 600 }), "RESOURCE_CLASH", "ย้ายไปทับ");
    eq([(await dep(id))?.startsAt, (await activeUses(BOAT)).find((u) => u.departureId === id)?.s], [before?.startsAt, before?.startsAt], "ไม่เปลี่ยน");
    okR(await call("updateDeparture", OA(), { unitId: uA, departureId: id, departTimeMin: 1260 }), "ย้ายไปช่วงว่าง");
    eq((await activeUses(BOAT)).find((u) => u.departureId === id)?.s, "2027-06-20T14:00:00.000Z", "แถวใช้เรือย้าย");
  });
  await st("RS-8", "ยกเลิกรอบ ก ⇒ แถวใช้เรือ active=false (ไม่ลบ) · รอบ ข ที่เคยชนมอบได้แล้ว", async () => {
    ok(RP1 && RP2, "ไม่มีรอบ");
    okR(await call("cancelDeparture", OA(), { unitId: uA, departureId: RP1, reason: "เรือเสีย" }), "cancel");
    eq((await q(`SELECT active FROM "TripResourceUse" WHERE "departureId" = $1 AND "resourceId" = $2`, [RP1, BOAT])).map((r) => r.active), [false], "แถวรอบ ก");
    okR(await assign(RP2, BOAT), "มอบให้ ข");
  });
  await st("RS-9", "ถอนเรือ ⇒ active=false แถวยังอยู่ · ปิดใช้เรือที่ยังมีรอบอนาคต ⇒ RESOURCE_IN_USE (+departureIds) · เรือปิดแล้วมอบ ⇒ RESOURCE_INACTIVE", async () => {
    ok(RP2, "ไม่มีรอบ");
    okR(await call("unassignResource", OA(), { unitId: uA, departureId: RP2, resourceId: BOAT }), "ถอน");
    eq((await q(`SELECT active FROM "TripResourceUse" WHERE "departureId" = $1 AND "resourceId" = $2`, [RP2, BOAT])).map((r) => r.active), [false], "แถวยังอยู่");
    const r = await call("setResourceActive", OA(), { unitId: uA, resourceId: BOAT, active: false });
    codeR(r, "RESOURCE_IN_USE", "ปิดใช้ตอนยังมีรอบ");
    ok(Array.isArray(r.departureIds) && (r.departureIds as unknown[]).length >= 1, `departureIds: ${fmt(r.departureIds)}`);
    const g = await call("createResource", OA(), { unitId: uA, kind: "GUIDE", name: "ไกด์ปิดใช้" });
    okR(await call("setResourceActive", OA(), { unitId: uA, resourceId: String(g.id), active: false }), "ปิดใช้ไกด์ว่าง");
    codeR(await assign(RP2, String(g.id)), "RESOURCE_INACTIVE", "มอบตัวที่ปิด");
  });
  groupLine("RS");

  // ═══════════════ MP. ขั้นต่ำ ณ เวลาตัดสิน ═══════════════
  console.log("\n── MP: ขั้นต่ำออกเดินทาง ──");
  const evalM = (nowIso: string) => call("evaluateMinPax", OA(), { unitId: uM }, { now: Z(nowIso) });
  const getM = async (id: string, nowIso: string) => asRec((await call("getDeparture", OA(), { unitId: uM, departureId: id }, { now: Z(nowIso) })).departure) ?? {};
  let MPd = "";
  // รอบ 10 เม.ย. 2570 08:00 ไทย · ค่าตั้ง fallback (DIVE_SHOP) ตัดสิน 1 วันก่อน 18:00 ⇒ 9 เม.ย. 11:00Z
  await st("MP-1", "ก่อนเวลาตัดสิน ⇒ ไม่มี event · needsDecision false · decisionAt = 9 เม.ย. 11:00Z", async () => {
    await needDb();
    MPd = await mkDep("M1", "2027-04-10", 480, { minPax: 8, capacity: 24 }, uM);
    await setCounters(MPd, { sold: 4 });
    okR(await evalM("2027-04-09T10:00:00Z"), "evaluate ก่อนเวลา");
    const d = await getM(MPd, "2027-04-09T10:00:00Z");
    eq([(await outbox(MPd, "trips.departure.below_min")).length, d.needsDecision, iso(d.decisionAt)], [0, false, "2027-04-09T11:00:00.000Z"], "ก่อนเวลา");
  });
  await st("MP-2", "หลังเวลาตัดสิน sold 4 < 8 ⇒ belowMin มีรอบนี้ · event below_min 1 ตัว · needsDecision true · สถานะยัง OPEN", async () => {
    ok(MPd, "ไม่มีรอบ");
    const r = await evalM("2027-04-09T12:00:00Z");
    okR(r, "evaluate");
    ok(Array.isArray(r.belowMin) && (r.belowMin as string[]).includes(MPd), `belowMin: ${fmt(r.belowMin)}`);
    eq([(await outbox(MPd, "trips.departure.below_min")).length, (await getM(MPd, "2027-04-09T12:00:00Z")).needsDecision, (await dep(MPd))?.status], [1, true, "OPEN"], "ผล");
  });
  await st("MP-3", "ประเมินซ้ำ (เวลาเดียวกัน/ช้ากว่า) ⇒ ไม่มี event ที่สอง", async () => {
    ok(MPd, "ไม่มีรอบ");
    okR(await evalM("2027-04-09T12:00:00Z"), "ซ้ำ 1"); okR(await evalM("2027-04-09T20:00:00Z"), "ซ้ำ 2");
    eq((await outbox(MPd, "trips.departure.below_min")).length, 1, "event");
  });
  await st("MP-4", "X5 งาน runMinPaxCheck สองตัวซ้อนกันบนรอบต่ำกว่าขั้นต่ำใหม่ ⇒ event below_min 1 ตัวพอดี", async () => {
    await needDb();
    const id = await mkDep("M1", "2027-04-11", 480, { minPax: 8 }, uM);
    await setCounters(id, { sold: 2 });
    const t = Z("2027-04-10T12:00:00Z");
    await Promise.all([fn("runMinPaxCheck")(t, { tenantIds: [tA] }), fn("runMinPaxCheck")(t, { tenantIds: [tA] }), fn("runMinPaxCheck")(t, { tenantIds: [tA] })]);
    eq((await outbox(id, "trips.departure.below_min")).length, 1, "event");
  });
  await st("MP-5", "ถึงขั้นต่ำทีหลัง (sold 8) ⇒ ประเมิน ⇒ GUARANTEED โดยระบบ · status_changed 1 · needsDecision false · below_min ยัง 1", async () => {
    ok(MPd, "ไม่มีรอบ");
    await setCounters(MPd, { sold: 8 });
    const r = await evalM("2027-04-09T22:00:00Z");
    okR(r, "evaluate");
    ok(Array.isArray(r.guaranteed) && (r.guaranteed as string[]).includes(MPd), `guaranteed: ${fmt(r.guaranteed)}`);
    eq([(await dep(MPd))?.status, (await outbox(MPd, "trips.departure.status_changed")).length, (await getM(MPd, "2027-04-09T22:00:00Z")).needsDecision, (await outbox(MPd, "trips.departure.below_min")).length], ["GUARANTEED", 1, false, 1], "ผล");
  });
  await st("MP-6", "X5 ถึงขั้นต่ำ ณ เวลาตัดสิน + ประเมินพร้อมกัน 3 ทาง ⇒ GUARANTEED ครั้งเดียว (version +1 · event 1)", async () => {
    await needDb();
    const id = await mkDep("M1", "2027-04-12", 480, { minPax: 5 }, uM);
    await setCounters(id, { sold: 6 });
    const v0 = Number((await dep(id))?.version);
    await Promise.all([evalM("2027-04-11T12:00:00Z"), evalM("2027-04-11T12:00:00Z"), fn("runMinPaxCheck")(Z("2027-04-11T12:00:00Z"), { tenantIds: [tA] })]);
    eq([(await dep(id))?.status, Number((await dep(id))?.version) - v0, (await outbox(id, "trips.departure.status_changed")).length, (await outbox(id, "trips.departure.below_min")).length], ["GUARANTEED", 1, 1, 0], "ผล");
  });
  await st("MP-7", "ขั้นต่ำ null ⇒ ไม่ทำอะไร · GUARANTEED แล้วยอดลด ⇒ ไม่ย้อน", async () => {
    await needDb();
    const a = await mkDep("M1", "2027-04-13", 480, { minPax: null }, uM);
    await setCounters(a, { sold: 1 });
    okR(await evalM("2027-04-12T12:00:00Z"), "evaluate");
    eq([(await dep(a))?.status, (await outbox(a)).filter((e) => e.type !== "trips.departure.created").length], ["OPEN", 0], "null");
    ok(MPd, "ไม่มีรอบ MP");
    await setCounters(MPd, { sold: 2 });
    okR(await evalM("2027-04-09T23:00:00Z"), "evaluate");
    eq((await dep(MPd))?.status, "GUARANTEED", "ไม่ย้อน");
  });
  await st("MP-8", "ขั้นต่ำจากค่าตั้ง T7 ชั้น PRODUCT {6, 2 วัน, 10:00} ⇒ รอบใหม่ minPax 6 · decisionAt = 2 วันก่อน 10:00 ไทย · ตัวควบคุมบวก: เปลี่ยน T7 ⇒ รอบเดิม minPax คงเดิม · decisionAt เปลี่ยน · รอบใหม่ได้ค่าใหม่", async () => {
    await needDb();
    await setV([{ key: T7, scope: "PRODUCT", scopeId: P.M2.id, value: { minPax: 6, decideDaysBefore: 2, decideAtMin: 600 } }]);
    const a = await mkDep("M2", "2027-04-20", 480, {}, uM);
    eq([(await dep(a))?.minPax, iso((await getM(a, "2027-04-01T00:00:00Z")).decisionAt)], [6, "2027-04-18T03:00:00.000Z"], "ค่าแรก");
    await setV([{ key: T7, scope: "PRODUCT", scopeId: P.M2.id, value: { minPax: 9, decideDaysBefore: 1, decideAtMin: 1080 } }]);
    const b = await mkDep("M2", "2027-04-21", 480, {}, uM);
    eq([(await dep(a))?.minPax, iso((await getM(a, "2027-04-01T00:00:00Z")).decisionAt), (await dep(b))?.minPax], [6, "2027-04-19T11:00:00.000Z", 9], "หลังเปลี่ยน");
  });
  await st("MP-9", "ขั้นต่ำจาก OVERRIDE ของกฎ ชนะค่าตั้ง · กฎ minPax ชนะค่าตั้ง (ลำดับ ข้อยกเว้น > กฎ > ค่าตั้ง)", async () => {
    await needDb();
    const sid = await mkSched("M2", { rule: { kind: "DAILY" }, dateFrom: "2027-05-01", dateTo: "2027-05-02", minPax: 3, exceptions: [{ date: "2027-05-02", action: "OVERRIDE", minPax: null }] }, uM);
    okR(await mat(sid, "2027-05-01T00:00:00+07:00", uM), "materialize");
    eq((await depsOfSchedule(sid)).map((x) => [x.localDate, x.minPax]), [["2027-05-01", 3], ["2027-05-02", null]], "minPax");
  });
  groupLine("MP");

  // ═══════════════ CO. ปิดรับต่อช่องทาง · หยุดขาย ═══════════════
  console.log("\n── CO: ปิดรับต่อช่องทาง · หยุดขาย ──");
  let COd = "";
  const cutoffsOf = async (id: string) => asRec(asRec((await call("getDeparture", OA(), { unitId: uA, departureId: id })).departure)?.cutoffs) ?? {};
  await st("CO-1", "ค่าเริ่ม (fallback DIVE_SHOP 1 วันก่อน 18:00): รอบ 10 มี.ค. 08:00 ⇒ ทุกช่องทาง 9 มี.ค. 11:00Z · cutoffAt เท่ากัน", async () => {
    await needDb();
    COd = await mkDep("AC", "2027-03-10", 480);
    const c = await cutoffsOf(COd);
    eq([new Set(Object.values(c)).size, c.WEB, (await dep(COd))?.cutoffAt], [1, "2027-03-09T11:00:00.000Z", "2027-03-09T11:00:00.000Z"], "ค่าเริ่ม");
  });
  await st("CO-2", "T6 ชั้น PRODUCT perChannel COUNTER {0 วัน 07:00} (แบบจอ 17) ⇒ COUNTER = 10 มี.ค. 00:00Z · WEB เดิม · refreshDeparturePolicy ⇒ cutoffAt = ช่องทางที่ปิดช้าสุด", async () => {
    ok(COd, "ไม่มีรอบ");
    await setV([{ key: T6, scope: "PRODUCT", scopeId: P.AC.id, value: { daysBefore: 1, atMin: 1080, perChannel: { COUNTER: { daysBefore: 0, atMin: 420 } } } }]);
    const c = await cutoffsOf(COd);
    eq([c.COUNTER, c.WEB, c.AGENT_PORTAL], ["2027-03-10T00:00:00.000Z", "2027-03-09T11:00:00.000Z", "2027-03-09T11:00:00.000Z"], "สด");
    const r = await call("refreshDeparturePolicy", OA(), { unitId: uA, productId: P.AC.id });
    okR(r, "refresh");
    eq([(await dep(COd))?.cutoffAt, Number(r.updated) >= 1], ["2027-03-10T00:00:00.000Z", true], "คอลัมน์");
  });
  await st("CO-3", "ตัวควบคุมบวก: T6 PRODUCT 2 วันก่อน 18:00 ⇒ WEB 8 มี.ค. 11:00Z (เลื่อนตามค่าตั้ง)", async () => {
    ok(COd, "ไม่มีรอบ");
    await setV([{ key: T6, scope: "PRODUCT", scopeId: P.AC.id, value: { daysBefore: 2, atMin: 1080 } }]);
    eq((await cutoffsOf(COd)).WEB, "2027-03-08T11:00:00.000Z", "WEB");
  });
  await st("CO-4", "ไม่เกินเวลาออก: รอบ 06:00 ไทย หน้าร้าน 0 วัน 07:00 ⇒ COUNTER = startsAt", async () => {
    await needDb();
    await setV([{ key: T6, scope: "PRODUCT", scopeId: P.AC.id, value: { daysBefore: 1, atMin: 1080, perChannel: { COUNTER: { daysBefore: 0, atMin: 420 } } } }]);
    const id = await mkDep("AC", "2027-03-11", 360);
    eq([(await cutoffsOf(id)).COUNTER, (await dep(id))?.startsAt, (await dep(id))?.cutoffAt], ["2027-03-10T23:00:00.000Z", "2027-03-10T23:00:00.000Z", "2027-03-10T23:00:00.000Z"], "cap");
  });
  await st("CO-5", "refreshDeparturePolicy ไม่แตะรอบ CANCELLED", async () => {
    await needDb();
    const id = await mkDep("AC", "2027-03-12", 480);
    const before = (await dep(id))?.cutoffAt;
    okR(await call("cancelDeparture", OA(), { unitId: uA, departureId: id, reason: "ทดสอบยกเลิก" }), "cancel");
    await setV([{ key: T6, scope: "PRODUCT", scopeId: P.AC.id, value: { daysBefore: 3, atMin: 600 } }]);
    okR(await call("refreshDeparturePolicy", OA(), { unitId: uA, productId: P.AC.id }), "refresh");
    eq((await dep(id))?.cutoffAt, before, "CANCELLED ไม่เปลี่ยน");
  });
  await st("CO-6", "setDepartureStopSell: ช่องทางเว็บ บันทึก/อ่านกลับ · มี agentAccountIds ⇒ AGENT_STOP_SELL_NOT_SUPPORTED · ช่องทางแปลก ⇒ INVALID_INPUT · null = ล้าง", async () => {
    ok(COd, "ไม่มีรอบ");
    const SSL = (stopSell: unknown) => call("setDepartureStopSell", OA(), { unitId: uA, departureId: COd, stopSell });
    okR(await SSL({ channels: ["WEB"], reason: "เรือเต็มจากหน้าร้าน" }), "ตั้ง");
    eq(asRec((await dep(COd))?.stopSell)?.channels, ["WEB"], "อ่านกลับ");
    codeR(await SSL({ channels: [], agentAccountIds: ["ag1"], reason: "x" }), "AGENT_STOP_SELL_NOT_SUPPORTED", "เอเจนซี่");
    codeR(await SSL({ channels: ["FAX"], reason: "x" }), "INVALID_INPUT", "ช่องทางแปลก");
    okR(await SSL(null), "ล้าง");
    eq((await dep(COd))?.stopSell, null, "ล้างแล้ว");
  });
  groupLine("CO");

  // ═══════════════ PM. สิทธิ์ ═══════════════
  console.log("\n── PM: สิทธิ์ ──");
  await st("PM-1", "ดูอย่างเดียว: get/list ได้ · สร้างรอบ/เปลี่ยนสถานะ/ยกเลิก/สร้างทรัพยากร ⇒ FORBIDDEN และไม่มีแถวใหม่", async () => {
    await needDb();
    const sv = ctxOf("sv");
    const id = await mkDep("A3", "2027-07-20", 480);
    okR(await call("getDeparture", sv, { unitId: uA, departureId: id }), "get");
    okR(await call("listDepartures", sv, { unitId: uA, from: "2027-07-20", to: "2027-07-20" }), "list");
    const n0 = (await q(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "unitId" = $1`, [uA]))[0]?.n;
    codeR(await call("createDeparture", sv, { unitId: uA, productId: P.A3.id, optionId: P.A3.opt, localDate: "2027-07-21", departTimeMin: 480, capacity: 5 }), "FORBIDDEN", "สร้าง");
    codeR(await call("setDepartureStatus", sv, { unitId: uA, departureId: id, status: "CLOSED" }), "FORBIDDEN", "สถานะ");
    codeR(await call("cancelDeparture", sv, { unitId: uA, departureId: id, reason: "ทดสอบสิทธิ์" }), "FORBIDDEN", "ยกเลิก");
    codeR(await call("createResource", sv, { unitId: uA, kind: "VAN", name: "รถตู้" }), "FORBIDDEN", "ทรัพยากร");
    eq([(await q(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "unitId" = $1`, [uA]))[0]?.n, (await dep(id))?.status], [n0, "OPEN"], "ไม่เขียน");
  });
  await st("PM-2", "edit (ไม่มี status/resource): สร้างรอบได้ · เปลี่ยนสถานะ/ยกเลิก ⇒ FORBIDDEN · สร้างทรัพยากร ⇒ FORBIDDEN", async () => {
    await needDb();
    const se = ctxOf("se");
    const r = await call("createDeparture", se, { unitId: uA, productId: P.A3.id, optionId: P.A3.opt, localDate: "2027-07-22", departTimeMin: 480, capacity: 5 });
    okR(r, "สร้าง");
    codeR(await call("setDepartureStatus", se, { unitId: uA, departureId: String(r.id), status: "GUARANTEED" }), "FORBIDDEN", "สถานะ");
    codeR(await call("cancelDeparture", se, { unitId: uA, departureId: String(r.id), reason: "ทดสอบสิทธิ์" }), "FORBIDDEN", "ยกเลิก");
    codeR(await call("createResource", se, { unitId: uA, kind: "VAN", name: "รถตู้" }), "FORBIDDEN", "ทรัพยากร");
  });
  await st("PM-3", "status (ไม่มี edit): เปลี่ยนสถานะได้ · แก้ความจุ ⇒ FORBIDDEN", async () => {
    await needDb();
    const ss = ctxOf("ss");
    const id = await mkDep("A3", "2027-07-23", 480);
    okR(await call("setDepartureStatus", ss, { unitId: uA, departureId: id, status: "GUARANTEED" }), "สถานะ");
    codeR(await call("setDepartureCapacity", ss, { unitId: uA, departureId: id, capacity: 3 }), "FORBIDDEN", "ความจุ");
  });
  await st("PM-4", "ไม่มีสิทธิ์ trips.departure.* ⇒ อ่านก็ FORBIDDEN", async () => {
    await needDb();
    const id = await mkDep("A3", "2027-07-24", 480);
    codeR(await call("getDeparture", ctxOf("sn"), { unitId: uA, departureId: id }), "FORBIDDEN", "get");
  });
  groupLine("PM");

  // ═══════════════ X1. แยกร้าน/แยกหน่วย ═══════════════
  console.log("\n── X1: แยกร้าน/แยกหน่วย ──");
  let XD = "";
  await st("X1-1", "ร้าน B อ่าน/แก้รอบของร้าน A (ด้วยหน่วย A หรือหน่วยของตัวเอง) ⇒ NOT_FOUND · แถวไม่เปลี่ยน", async () => {
    await needDb();
    XD = await mkDep("A3", "2027-07-25", 480);
    const ob = ctxOf("ob");
    codeR(await call("getDeparture", ob, { unitId: uA, departureId: XD }), "NOT_FOUND", "หน่วย A");
    codeR(await call("getDeparture", ob, { unitId: uB, departureId: XD }), "NOT_FOUND", "หน่วย B + id ของ A");
    codeR(await call("setDepartureCapacity", ob, { unitId: uB, departureId: XD, capacity: 1 }), "NOT_FOUND", "แก้ข้ามร้าน");
    codeR(await call("cancelDeparture", ob, { unitId: uA, departureId: XD, reason: "ข้ามร้าน" }), "NOT_FOUND", "ยกเลิกข้ามร้าน");
    eq([(await dep(XD))?.capacity, (await dep(XD))?.status], [20, "OPEN"], "แถว");
  });
  await st("X1-2", "พนักงานหน่วย A2: list หน่วย A ⇒ NOT_FOUND · สร้างกฎในหน่วย A2 ด้วยสินค้าของหน่วย A ⇒ NOT_FOUND", async () => {
    await needDb();
    const s2 = ctxOf("s2");
    codeR(await call("listDepartures", s2, { unitId: uA, from: "2027-07-25", to: "2027-07-25" }), "NOT_FOUND", "list หน่วย A");
    codeR(await call("createSchedule", s2, { unitId: uA2, productId: P.A1.id, optionId: P.A1.opt, rule: { kind: "DAILY" }, exceptions: [], departTimeMin: 480, capacity: 5, dateFrom: "2027-08-01", dateTo: "2027-08-02" }), "NOT_FOUND", "สินค้าข้ามหน่วย");
  });
  await st("X1-3", "ทรัพยากรหน่วย A2 มอบให้รอบหน่วย A ⇒ NOT_FOUND · กฎหน่วย A อ้างทรัพยากร A2 ⇒ NOT_FOUND", async () => {
    ok(XD, "ไม่มีรอบ");
    const r = await call("createResource", ctxOf("s2"), { unitId: uA2, kind: "BOAT", name: "เรือหน่วยสอง" });
    okR(r, "createResource A2");
    codeR(await assign(XD, String(r.id)), "NOT_FOUND", "มอบข้ามหน่วย");
    codeR(await call("createSchedule", OA(), { unitId: uA, productId: P.A1.id, optionId: P.A1.opt, rule: { kind: "DAILY" }, exceptions: [], departTimeMin: 480, capacity: 5, dateFrom: "2027-08-01", dateTo: "2027-08-02", resourceIds: [String(r.id)] }), "NOT_FOUND", "กฎอ้างข้ามหน่วย");
  });
  await st("X1-4", "หน่วย BOOKING ของร้าน ⇒ UNIT_NOT_TRIPS", async () => {
    await needDb();
    codeR(await call("listDepartures", OA(), { unitId: uBk, from: "2027-07-25", to: "2027-07-25" }), "UNIT_NOT_TRIPS", "list");
    codeR(await call("createResource", OA(), { unitId: uBk, kind: "BOAT", name: "x" }), "UNIT_NOT_TRIPS", "createResource");
  });
  await st("X1-5", "materialize กฎของร้าน A ด้วยร้าน B ⇒ NOT_FOUND ไม่มีแถว · งาน tenantIds=[B] ไม่สร้างรอบของร้าน A", async () => {
    await needDb();
    const sid = await mkSched("A3", { rule: { kind: "DAILY" }, dateFrom: "2027-09-01", dateTo: "2027-09-02" });
    codeR(await call("materializeSchedule", ctxOf("ob"), { unitId: uB, scheduleId: sid }, { now: Z("2027-09-01T00:00:00+07:00") }), "NOT_FOUND", "ข้ามร้าน");
    await fn("runGenerateDepartures")(Z("2027-09-01T00:00:00+07:00"), { tenantIds: [tB] });
    eq((await depsOfSchedule(sid)).length, 0, "แถว");
  });
  await st("X1-6", "listDepartures หน่วย A คืนเฉพาะหน่วย A (มีรอบหน่วย A2 วันเดียวกัน)", async () => {
    await needDb();
    await mkDep("X2", "2027-07-25", 480, {}, uA2, ctxOf("s2"));
    const l = await call("listDepartures", OA(), { unitId: uA, from: "2027-07-25", to: "2027-07-25" });
    okR(l, "list");
    const ids = asArr(l.items).map((x) => String(x.id));
    const units = ids.length ? (await q(`SELECT DISTINCT "unitId" FROM "TripDeparture" WHERE id = ANY($1::text[])`, [ids])).map((r) => r.unitId) : [];
    eq(units, [uA], "หน่วย");
  });
  await st("X1-7", "evaluateMinPax ของหน่วย M ไม่แตะรอบหน่วยอื่น (รอบหน่วย A ต่ำกว่าขั้นต่ำไม่มี event)", async () => {
    await needDb();
    const id = await mkDep("A3", "2027-07-26", 480, { minPax: 9 });
    await setCounters(id, { sold: 1 });
    okR(await call("evaluateMinPax", OA(), { unitId: uM }, { now: Z("2027-07-25T12:00:00Z") }), "evaluate M");
    eq((await outbox(id, "trips.departure.below_min")).length, 0, "event");
  });
  groupLine("X1");

  // ═══════════════ X9. ยกเลิกรอบที่มีคน ═══════════════
  console.log("\n── X9: ยกเลิกรอบที่มีคนจอง/ถือที่ = ปฏิเสธ (T1.6) ──");
  await st("X9-1", "sold > 0 ⇒ HAS_BOOKINGS (+used) · สถานะ/แถวใช้ทรัพยากรไม่เปลี่ยน · ไม่มี event cancelled", async () => {
    await needDb();
    const id = await mkDep("A3", "2027-08-20", 480);
    const v = await call("createResource", OA(), { unitId: uA, kind: "VAN", name: `รถตู้ X9 ${STAMP}` });
    okR(await assign(id, String(v.id)), "มอบ");
    await setCounters(id, { sold: 3 });
    const r = await call("cancelDeparture", OA(), { unitId: uA, departureId: id, reason: "คลื่นลม" });
    codeR(r, "HAS_BOOKINGS", "sold");
    eq([r.used, (await dep(id))?.status, (await activeUses(String(v.id))).length, (await outbox(id, "trips.departure.cancelled")).length], [3, "OPEN", 1, 0], "ไม่เปลี่ยน");
  });
  await st("X9-2", "มีแถว TripHold ACTIVE (ตัวนับ 0) ⇒ HAS_BOOKINGS", async () => {
    await needDb();
    const id = await mkDep("A3", "2027-08-21", 480);
    await insertRow("TripHold", { tenantId: tA, unitId: uA, departureId: id, channel: "WEB", qtyPublic: 1, qtyAllot: 0, purpose: "PAYMENT", status: "ACTIVE", expiresAt: "2027-08-20 00:00:00", idempotencyKey: rid("hk"), capKeyHash: "x", requestHash: "x", updatedAt: "2027-01-01 00:00:00" });
    codeR(await call("cancelDeparture", OA(), { unitId: uA, departureId: id, reason: "คลื่นลม" }), "HAS_BOOKINGS", "hold");
    eq((await dep(id))?.status, "OPEN", "สถานะ");
  });
  await st("X9-3", "มี TripBooking CONFIRMED (ตัวนับ 0) ⇒ HAS_BOOKINGS · การจอง EXPIRED อย่างเดียว ⇒ ยกเลิกได้", async () => {
    await needDb();
    const a = await mkDep("A3", "2027-08-22", 480), b = await mkDep("A3", "2027-08-23", 480);
    const bk = (departureId: string, status: string, travelDate: string) => insertRow("TripBooking", { tenantId: tA, unitId: uA, departureId, productId: P.A3.id, travelDate, status, code: rid("bk"), publicTokenHash: rid("pt"), channel: "WEB", collectMode: "SHOP", payMethod: "PAY_NOW", contactRoute: "DIRECT", accountingState: "NONE", currency: "THB", marketingEligible: false, policySnapshot: "{}", updatedAt: "2027-01-01 00:00:00" });
    await bk(a, "CONFIRMED", "2027-08-22"); await bk(b, "EXPIRED", "2027-08-23");
    codeR(await call("cancelDeparture", OA(), { unitId: uA, departureId: a, reason: "คลื่นลม" }), "HAS_BOOKINGS", "CONFIRMED");
    okR(await call("cancelDeparture", OA(), { unitId: uA, departureId: b, reason: "คลื่นลม" }), "EXPIRED อย่างเดียว");
  });
  await st("X9-4", "รอบว่าง ⇒ CANCELLED · event cancelled 1 · audit มีเหตุผล · เหตุผลสั้นเกิน ⇒ INVALID_INPUT", async () => {
    await needDb();
    const id = await mkDep("A3", "2027-08-24", 480);
    codeR(await call("cancelDeparture", OA(), { unitId: uA, departureId: id, reason: " ฝ " }), "INVALID_INPUT", "เหตุผลสั้น");
    okR(await call("cancelDeparture", OA(), { unitId: uA, departureId: id, reason: "คลื่นลม" }), "cancel");
    const au = (await audits(id)).find((a) => a.action === "trips.departure.cancel");
    eq([(await dep(id))?.status, (await outbox(id, "trips.departure.cancelled")).length, au?.actorId, JSON.stringify(au?.after ?? {}).includes("คลื่นลม")], ["CANCELLED", 1, U.oa?.userId, true], "ผล");
  });
  groupLine("X9");

  // ═══════════════ EV. event ═══════════════
  console.log("\n── EV: event + audit ──");
  const evIds: Record<string, string> = {};
  await st("EV-1", "trips.departure.created: payload ตรง 6 คีย์ {departureId productId unitId status paxSold minPax} · paxSold 0 · unitId ของแถว outbox ตรง", async () => {
    await needDb();
    evIds.c = await mkDep("A3", "2027-08-30", 480, { minPax: 4 });
    const e = await outbox(evIds.c, "trips.departure.created");
    eq(e.length, 1, "จำนวน");
    eq([Object.keys(e[0].payload).sort(), e[0].payload.paxSold, e[0].payload.minPax, e[0].payload.status, e[0].payload.productId, e[0].payload.unitId, e[0].unitId], [PAYLOAD_KEYS, 0, 4, "OPEN", P.A3.id, uA, uA], "payload");
  });
  await st("EV-2", "status_changed · cancelled · below_min: payload ตรง 6 คีย์ทุกตัว · key ไม่ซ้ำ", async () => {
    await needDb();
    const evs = (await q<{ type: string; payload: Rec; idempotencyKey: string }>(`SELECT type, payload, "idempotencyKey" FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = ANY($2::text[])`, [tA, EVENTS]));
    const types = new Set(evs.map((e) => e.type));
    eq(EVENTS.filter((t) => !types.has(t)), [], "ชนิดที่ยังไม่เคยเกิด");
    const bad = evs.filter((e) => !isDeepStrictEqual(Object.keys(e.payload).sort(), PAYLOAD_KEYS));
    ok(bad.length === 0, `payload ผิด: ${fmt(bad.slice(0, 2))}`);
    eq(new Set(evs.map((e) => e.idempotencyKey)).size, evs.length, "key ซ้ำ");
  });
  await st("EV-3", "ไม่มีข้อมูลบุคคลใน payload: ค่าเป็น id/สถานะ/ตัวเลข/null เท่านั้น (ไม่มีอักษรไทย · @ · ช่องว่าง)", async () => {
    await needDb();
    const evs = await q<{ payload: Rec }>(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type LIKE 'trips.departure.%'`, [tA]);
    ok(evs.length > 0, "ไม่มี event");
    const bad = evs.filter((e) => Object.values(e.payload).some((v) => !(v === null || typeof v === "number" || (typeof v === "string" && !THAI.test(v) && !/[@\s]/.test(v)))));
    ok(bad.length === 0, `มีค่าแปลก: ${fmt(bad.slice(0, 2))}`);
  });
  await st("EV-4", "audit: trips.departure.create / status / capacity · trips.schedule.create · trips.resource.assign มี actorId = ผู้กระทำ", async () => {
    await needDb();
    const rows = await q<{ action: string; actorId: string | null }>(`SELECT action, "actorId" FROM "AuditLog" WHERE "tenantId" = $1 AND action LIKE 'trips.%'`, [tA]).catch(() => []);
    const acts = new Set(rows.filter((r) => r.actorId).map((r) => r.action));
    eq(["trips.departure.create", "trips.departure.status", "trips.departure.capacity", "trips.departure.cancel", "trips.schedule.create", "trips.schedule.pause", "trips.resource.create", "trips.resource.assign"].filter((a) => !acts.has(a)), [], "audit ที่ขาด");
  });
  groupLine("EV");

  // ═══════════════ R. seed สัปดาห์ฟิกซ์เจอร์ (อ่านอย่างเดียว) ═══════════════
  console.log("\n── R: seed สัปดาห์ 11–17 พ.ย. 2569 (จอ 11) ──");
  const D_T = FX.SHOP_DIVE.tenant.id;
  const ownerDive: Ctx = { tenantId: D_T, actorUserId: String((FX.SHOP_DIVE.users[0] as { userId?: string }).userId ?? "") };
  const seedProd = async (k: keyof typeof SEED_SLUGS) => (await q<{ id: string }>(`SELECT id FROM "TripProduct" WHERE "tenantId" = $1 AND "unitId" = $2 AND slug = $3`, [D_T, DIVE_TRIPS_UNIT, SEED_SLUGS[k]]).catch(() => []))[0]?.id ?? "";
  const seedWeek = async (k: keyof typeof SEED_SLUGS) => {
    await needTable("TripDeparture");
    const pid = await seedProd(k);
    if (!pid) throw new AssertFail(`ไม่มีสินค้า seed ${SEED_SLUGS[k]} (T0.2 seed ยังไม่ลง)`);
    return q(`${DEP_SQL} WHERE "tenantId" = $1 AND "productId" = $2 AND "localDate" BETWEEN '2026-11-11' AND '2026-11-17' ORDER BY "localDate"`, [D_T, pid]);
  };
  const W = FX.CALENDAR_WEEK_1111.rows;
  const statusOf = (s: string) => (s.startsWith("ยกเลิก") ? "CANCELLED" : s === "เดินทางแล้ว" || s === "ออกเรือแล้ว" ? "CLOSED" : s === "ยืนยันออก" ? "GUARANTEED" : "OPEN");
  await st("R-1", "จำนวนรอบต่อวันตรงจอ 11: ราชา 11–17 (7) · พีพี 11–17 (7) · ดำน้ำลึก 11–16 (6 · 17 ไม่มีรอบ เรือเข้าซ่อม) · วันละ 1 รอบ", async () => {
    for (const k of ["racha", "phiphi", "deep3"] as const) {
      const rows = await seedWeek(k);
      eq(rows.map((r) => r.localDate), W[k].map((c) => c.date), `${k} วันที่`);
    }
  });
  await st("R-2", "ความจุ 24/30/12 · ขั้นต่ำ 8/10/4 · ตัวนับ 0 ทุกรอบ (ยอดขาย = T0.4/T0.6 seed)", async () => {
    const want = { racha: [FX.PRODUCT_RACHA.capacity, FX.PRODUCT_RACHA.minPax], phiphi: [FX.PRODUCT_PHIPHI.capacity, FX.PRODUCT_PHIPHI.minPax], deep3: [FX.PRODUCT_DEEP3.capacity, FX.PRODUCT_DEEP3.minPax] } as const;
    for (const k of ["racha", "phiphi", "deep3"] as const) {
      const rows = await seedWeek(k);
      ok(rows.length > 0, `${k}: ไม่มีรอบ`);
      const bad = rows.filter((r) => r.capacity !== want[k][0] || r.minPax !== want[k][1] || r.sold + r.held + r.reserved !== 0);
      ok(bad.length === 0, `${k}: ${fmt(bad.map((r) => [r.localDate, r.capacity, r.minPax, r.sold, r.held, r.reserved]))}`);
    }
  });
  await st("R-3", "สถานะตามจอ 11: 11–12 CLOSED · ศ. 13 CANCELLED 3 รอบ (สินค้าละ 1) · ส. 14 ราชา+พีพี GUARANTEED · ที่เหลือ OPEN", async () => {
    let cancelled = 0;
    for (const k of ["racha", "phiphi", "deep3"] as const) {
      const rows = await seedWeek(k);
      eq(rows.map((r) => [r.localDate, r.status]), W[k].map((c) => [c.date, statusOf(c.status)]), `${k} สถานะ`);
      cancelled += rows.filter((r) => r.status === "CANCELLED" && r.localDate === "2026-11-13").length;
    }
    eq(cancelled, FX.CALENDAR_WEEK_1111.cancelled13.departures, "ยกเลิก ศ. 13");
  });
  await st("R-4", "ส. 14 ราชา: 08:00–16:30 ไทย (01:00Z–09:30Z) · มาจากกฎซ้ำ · เรือราชา 1 ถูกมอบ (active)", async () => {
    const r = (await seedWeek("racha")).find((x) => x.localDate === FX.DEPARTURE_RACHA_1114.date);
    ok(r, "ไม่มีรอบ ส. 14");
    eq([r?.startsAt, r?.endsAt, r?.scheduleId !== null], ["2026-11-14T01:00:00.000Z", "2026-11-14T09:30:00.000Z", true], "เวลา");
    const res = await q<{ name: string; kind: string }>(`SELECT r.name, r.kind FROM "TripResourceUse" u JOIN "TripResource" r ON r.id = u."resourceId" WHERE u."departureId" = $1 AND u.active`, [r?.id]);
    ok(res.some((x) => x.name === FX.PRODUCT_RACHA.boat && x.kind === "BOAT"), `ทรัพยากร: ${fmt(res)}`);
  });
  await st("R-5", "ปิดรับ ส. 14 ราชา (ภาพ 17): WEB = ศ. 13 18:00 ไทย (11:00Z) · COUNTER = ส. 14 07:00 ไทย (00:00Z) · cutoffAt = 00:00Z", async () => {
    const r = (await seedWeek("racha")).find((x) => x.localDate === "2026-11-14");
    ok(r, "ไม่มีรอบ");
    const g = await call("getDeparture", ownerDive, { unitId: DIVE_TRIPS_UNIT, departureId: r?.id });
    okR(g, "getDeparture (เจ้าของร้านดำน้ำ)");
    const c = asRec(asRec(g.departure)?.cutoffs) ?? {};
    eq([c.WEB, c.COUNTER, r?.cutoffAt], ["2026-11-13T11:00:00.000Z", "2026-11-14T00:00:00.000Z", "2026-11-14T00:00:00.000Z"], "ปิดรับ");
  });
  await st("R-6", "ค่าตั้ง seed: T7 ชั้น PRODUCT ราชา/พีพี/ดำน้ำลึก = 8/10/4 ตัดสิน 1 วัน 18:00 · T6 หน่วย COUNTER {0, 420}", async () => {
    const res = async (key: string, refs: Rec) => asRec(asRec(await S("resolveSetting")({ tenantId: D_T }, key, refs))?.value) ?? {};
    const out: unknown[] = [];
    for (const k of ["racha", "phiphi", "deep3"] as const) { const v = await res(T7, { unitId: DIVE_TRIPS_UNIT, productId: await seedProd(k) }); out.push([v.minPax, v.decideDaysBefore, v.decideAtMin]); }
    eq(out, [[8, 1, 1080], [10, 1, 1080], [4, 1, 1080]], "T7");
    eq(asRec(asRec((await res(T6, { unitId: DIVE_TRIPS_UNIT })).perChannel)?.COUNTER), { daysBefore: 0, atMin: 420 }, "T6 COUNTER");
  });
  await st("R-7", "สิมิลัน: รอบเดี่ยว 14 ก.พ. 2570 18:00 ไทย (11:00Z) · ความจุ 20 · ไม่มีกฎซ้ำ", async () => {
    await needTable("TripDeparture");
    const pid = await seedProd("similan");
    ok(pid, "ไม่มีสินค้า similan (T0.2 seed)");
    const rows = await q(`${DEP_SQL} WHERE "tenantId" = $1 AND "productId" = $2`, [D_T, pid]);
    eq(rows.map((r) => [r.localDate, r.startsAt, r.capacity, r.scheduleId, r.status]), [[FX.TRIP_SIMILAN.start, "2027-02-14T11:00:00.000Z", 20, null, "OPEN"]], "สิมิลัน");
  });
  await st("R-8", "กฎดำน้ำลึกมีข้อยกเว้น SKIP 2026-11-17 · ทรัพยากร seed มีเรือ 5 ลำ รถตู้ 3 ไกด์ 2 (มิ้นท์ · โจ)", async () => {
    await needTable("TripSchedule");
    const pid = await seedProd("deep3");
    const ex = (await q<{ exceptions: unknown }>(`SELECT exceptions FROM "TripSchedule" WHERE "tenantId" = $1 AND "productId" = $2`, [D_T, pid]))[0]?.exceptions;
    ok(asArr(ex).some((e) => e.date === "2026-11-17" && e.action === "SKIP"), `exceptions: ${fmt(ex)}`);
    const rs = await q<{ kind: string; name: string }>(`SELECT kind, name FROM "TripResource" WHERE "tenantId" = $1 AND "unitId" = $2 AND active ORDER BY kind, name`, [D_T, DIVE_TRIPS_UNIT]);
    const by = (k: string) => rs.filter((r) => r.kind === k).length;
    eq([by("BOAT"), by("VAN"), by("GUIDE"), rs.filter((r) => r.kind === "GUIDE").map((r) => r.name).sort()], [5, 3, 2, ["มิ้นท์", "โจ"].sort()], "ทรัพยากร");
  });
  await st("R-9", "seed สร้างผ่าน facade (createSchedule · materializeSchedule · cancelDeparture · setDepartureStatus · createResource) ไม่เขียน TripDeparture ตรง · ฟิกซ์เจอร์มี TRIPS_SEED_RESOURCES/TRIPS_SEED_SCHEDULES", () => {
    const s = stripComments(read("scripts/seed-trips-qc.mts"));
    const miss = ["createSchedule", "materializeSchedule", "cancelDeparture", "setDepartureStatus", "createResource", "createDeparture"].filter((f) => !s.includes(f));
    ok(miss.length === 0 && /@\/lib\/modules\/trips["']/.test(s), `seed ไม่เรียก: ${miss.join(", ")}`);
    ok(!/tripDeparture\.(create|update|upsert|createMany)|INSERT\s+INTO\s+"TripDeparture"/i.test(s), "seed เขียน TripDeparture ตรง");
    const fx = read("scripts/trips-fixture.mts");
    ok(/TRIPS_SEED_RESOURCES/.test(fx) && /TRIPS_SEED_SCHEDULES/.test(fx), "ฟิกซ์เจอร์ไม่มีค่าคงที่ seed ของ T0.3");
  });
  groupLine("R");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T0.3 · รอบ · กฎซ้ำ · สถานะ · ทรัพยากร · ขั้นต่ำ · ปิดรับ =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
