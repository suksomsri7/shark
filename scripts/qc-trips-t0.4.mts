// QC — TRIPS T0.4 · ที่ว่าง (R2) · ถือที่ · ตัดที่คำสั่งเดียว · ตัวกวาดหมดเวลา · เพดานถือ · รายการรอ + เสนอที่
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/T0.4.md · ledger/TRIPS-CORE-CONTRACT.md §C §D.0–§D.6 §J.1 §J.2 §J.3 · ผลตรวจ r1 M-1 M-2 M-3 · r2 N-8 N-9 N-11 · MP §5 (ก)
//
// กลุ่มข้อ:
//   PC ตัวควบคุมบวก (เขียวก่อนมีงาน · ใช้ตารางชั่วคราวของข้อสอบเอง): ตัวช่วยอ่าน-แล้ว-เขียนต้องขายเกิน · คำสั่งเดียวต้องไม่เกิน · ล็อกสลับต้องได้ 40P01 · ตัวสุ่มอ่านต้องจับค่าผิดได้
//   S ไฟล์/facade/กติกาโค้ด (ตัวนับคำสั่งเดียว · ตรวจจำนวนแถว · ไม่มีตัวเลขธุรกิจ)   C ฟังก์ชันบริสุทธิ์
//   AV ที่ว่าง R2 (ตารางภาพ 20)   H วงจร hold   SW ตัวกวาด (X5)   RC ยิงพร้อมกันบนฐานจริง (MP §5 ก)   DL ลำดับล็อก §D.5
//   RS คืน/ย้าย/ครึ่งฝั่งรอบของโควตา + Sellable เฟส 1   CAP เพดานถือ §D.6   WL รายการรอ (X4)   X1 แยกร้าน/หน่วย   X7 rate limit   EV event (X8)   R seed
//
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t04-*` ลบใน finally + กวาดค้างตอนเริ่ม · ตารางควบคุม `_qc_t04_ctl_*` สร้าง/ลบเอง · ไม่แตะร้าน seed (R อ่านอย่างเดียว)
// 🔴 สินค้า/ตัวเลือก/รอบสร้างด้วย SQL ดิบตามรูปตารางของใบ T0.1 (T0.2/T0.3 ยังไม่มี) · ยังไม่มีตาราง/โมดูล = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception
// 🔴 นาฬิกา = ctx.now / พารามิเตอร์ now ของงาน (ไม่หลับเกินไม่กี่วินาที) · ข้อสอบไม่ตรึง "ตัวนับ = จำนวนคำขอที่สำเร็จ" ด้วยตัวนับแยก — ตรวจกับแถว TripHold จริง
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t0.4.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมี T0.4 (และก่อน T0.1/T0.3 ลงทรีนี้): PC เขียว · S-14 เขียวได้ · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t0.4";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t0.3) ═══════════════
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
const stripStrings = (s: string) => s.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""');
const THAI = /[฀-๿]/;
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t04qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const SLUG = "trips-t04-";
const EMAIL_PREFIX = "trips-t04-";
const CTL_PREFIX = "_qc_t04_ctl_";
const Z = (s: string) => new Date(s);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : typeof d === "string" ? new Date(d).toISOString() : String(d));
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const addMin = (d: Date | string, m: number) => new Date(new Date(d).getTime() + m * 60_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═══════════════ สเปก (ใบสั่ง T0.4 §3) ═══════════════
const SVC_FNS = ["getAvailability", "listAvailability", "placeHold", "extendHold", "releaseHold", "releaseHoldInTx", "convertHold", "convertHoldInTx",
  "returnSold", "returnSoldInTx", "moveSold", "moveSoldInTx", "reserveSeatsInTx", "unreserveSeatsInTx", "holdFromReservedInTx", "unholdToReservedInTx",
  "capacityRowsOf", "reserveInTx", "acquireHoldCapInTx", "rekeyHoldsToContactInTx", "holdCapKeyHash", "holdRequestHash",
  "joinWaitlist", "leaveWaitlist", "declineWaitlistOffer", "offerWaitlist", "listWaitlist", "onWaitlistTrigger", "runExpireHolds", "runWaitlistOffers"];
const PURE_FNS = ["canTransitionHold", "canTransitionWaitlist", "publicLeftOf", "holdExpiresAt", "sortCapacityRows", "idemKeyFor"];
const FACADE_CONSTS = ["HOLD_STATUSES", "HOLD_PURPOSES", "WAITLIST_STATUSES", "CapacityAbort", "tripSellable"];
const HOLD_STATUSES = ["ACTIVE", "CONVERTED", "EXPIRED", "RELEASED"];
const HOLD_PURPOSES = ["PAYMENT", "SHOP_CONFIRM", "AGENT_REQUEST", "SUPPLIER_REQUEST", "WAITLIST_OFFER", "AGENT_HOLD"];
const WAITLIST_STATUSES = ["WAITING", "OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"];
const SELL_CODES = ["VALIDATION", "NOT_FOUND", "FORBIDDEN", "KIND_NOT_SUPPORTED", "CURRENCY_NOT_ALLOWED", "SOLD_OUT", "INSUFFICIENT_ALLOTMENT", "BERTH_TAKEN", "SLOT_CLOSED", "CUTOFF_PASSED",
  "PRICE_CHANGED", "BELOW_MIN_SELL_PRICE", "DISCOUNT_OVER_CAP", "HOLD_EXPIRED", "HOLD_NOT_FOUND", "HOLD_LIMIT", "AGENT_SUSPENDED", "CREDIT_LIMIT", "REQUIRES_APPROVAL",
  "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "BUSY", "STATE_CONFLICT"];
const OWN_FILES = ["src/lib/modules/trips/capacity-core.ts", "src/lib/modules/trips/capacity.ts", "src/lib/modules/trips/waitlist.ts",
  "src/lib/modules/trips/capacity-actions.ts", "src/lib/modules/trips/sellable-impl.ts", "src/lib/modules/trips/jobs.ts", "src/lib/platform/sellables.ts"];
const T04_SRC = OWN_FILES.filter((f) => f.includes("/modules/trips/") && !f.endsWith("capacity-actions.ts"));
const EVENTS = ["trips.hold.created", "trips.hold.expired", "trips.waitlist.offered", "trips.booking.expired"];
const PERM_KEYS = ["trips.seat.sell", "trips.seat.manage"];
const K = { T5: "trips.sell.holdMinutes", T6: "trips.sell.cutoff", T9: "trips.sell.waitlistHoldMinutes", X2: "trips.sell.shopConfirmHours", X6: "trips.public.showLeftAtOrBelow", X8: "trips.public.rateLimits", X10: "trips.public.holdCapPerContact" };
const NOW0 = "2027-03-01T00:00:00.000Z"; // ก่อนปิดรับทุกช่องทางของรอบ 10 มี.ค.
const DATE = "2027-03-10";
const WEB_CUT = "2027-03-09T11:00:00.000Z"; // 1 วันก่อน 18:00 ไทย (T6 ค่าเริ่ม)
const AFTER_WEB = "2027-03-09T12:00:00.000Z"; // ปิดรับเว็บแล้ว · หน้าร้าน (0 วัน 07:00) ยังเปิด

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
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]); if (l.length) return l; }
  return [];
};
/** INSERT ค่าขั้นต่ำ — NOT NULL ไม่มี default เติมให้ (แบบ qc-trips-t0.3) · คืน {sql, params, id} */
async function insertSql(table: string, vals: Rec): Promise<{ sql: string; params: unknown[]; id: string }> {
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
  return { sql: `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, params: keys.map((k) => v[k]), id: String(v.id ?? "") };
}
async function insertRow(table: string, vals: Rec): Promise<string> { const s = await insertSql(table, vals); await pool.query(s.sql, s.params); return s.id; }

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
async function dropControlTables() {
  try { for (const r of await q<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = current_schema() AND tablename LIKE $1`, [`${CTL_PREFIX}%`])) await pool.query(`DROP TABLE IF EXISTS "${r.t}"`); } catch (e) { console.log(`  ⚠️ ลบตารางควบคุม: ${errMsg(e)}`); }
}
async function rateKeysCleanup() { try { await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, ["trips:hold:t04qc_%"]); } catch { /* ไม่มี */ } }
const tenantIds: string[] = [];

// ═══════════════ ตัวสุ่มอ่านค่าคงที่ระหว่างยิง ═══════════════
type Sample = { n: number; viol: string[]; maxActive: number };
function sampler(table: string, ids: string[]): () => Promise<Sample> {
  let stop = false; const viol: string[] = []; let n = 0; let maxActive = 0;
  const loop = (async () => {
    while (!stop) {
      try {
        const rows = await q<{ id: string; capacity: number; sold: number; held: number; reserved: number }>(`SELECT id, capacity, sold, held, reserved FROM "${table}" WHERE id = ANY($1::text[])`, [ids]);
        for (const r of rows) if (r.sold < 0 || r.held < 0 || r.reserved < 0 || r.sold + r.held + r.reserved > r.capacity) viol.push(`${r.id.slice(-6)} c${r.capacity} s${r.sold} h${r.held} r${r.reserved}`);
        const a = await q<{ n: number }>(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid()`);
        maxActive = Math.max(maxActive, a[0]?.n ?? 0);
        n++;
      } catch { await sleep(5); }
    }
  })();
  return async () => { stop = true; await loop; return { n, viol, maxActive }; };
}
const withTimer = async <T,>(p: Promise<T>, ms: number, what: string): Promise<T> => {
  let t: NodeJS.Timeout | undefined;
  try { return await Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new AssertFail(`${what}: ค้างเกิน ${ms / 1000} วินาที (สงสัย deadlock/รอล็อกไม่จบ)`)), ms); })]); }
  finally { if (t) clearTimeout(t); }
};
const isDeadlockish = (r: Rec) => /40P01|deadlock|P2034|55P03/i.test(`${r.e ?? ""} ${r.pg ?? ""} ${r.messageTh ?? ""}`);

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers(); await dropControlTables(); await rateKeysCleanup();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  // ── โมดูล (นำเข้าครั้งเดียว · ไม่มี = ข้อที่ใช้แดงพร้อมเหตุผล) ──
  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const SET = SETI.mod;
  const DBI = await tryImport("@/lib/core/db");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name}`); return f as AnyFn; };
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  /** เรียกบริการ · throw = {ok:"THROW"} (ข้อสอบตัดสินเอง) */
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e), pg: String((e as { code?: unknown }).code ?? "") }; }
  };
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const codeR = (r: Rec, code: string | string[], what: string) => { const cs = Array.isArray(code) ? code : [code]; ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`); };
  /** ฟังก์ชัน *InTx ใน tx ของข้อสอบ (tenantDb) · CapacityAbort ⇒ {ok:false, code, thrown} */
  const inTx = async (tenantId: string, unitId: string, body: (tx: unknown) => Promise<unknown>): Promise<Rec> => {
    const td = DBI.mod?.tenantDb;
    if (typeof td !== "function") throw new AssertFail(`โหลด tenantDb ไม่ได้ (${DBI.err.slice(0, 80)})`);
    const db = asRec((td as AnyFn)({ tenantId, unitId })) ?? {};
    const tr = db.$transaction as ((f: (tx: unknown) => Promise<unknown>, o?: Rec) => Promise<unknown>) | undefined;
    if (typeof tr !== "function") throw new AssertFail("tenantDb ไม่มี $transaction");
    try { const r = await tr.call(db, body, { timeout: 60_000, maxWait: 60_000 }); return asRec(r) ?? { ok: true }; }
    catch (e) { const c = (e as { code?: unknown }).code; return typeof c === "string" && SELL_CODES.includes(c) ? { ok: false, code: c, thrown: true } : { ok: "THROW", e: errMsg(e), pg: String(c ?? "") }; }
  };
  const fnTx = (name: string) => (tx: unknown, ctx: Rec, input: unknown) => (fn(name) as (...a: unknown[]) => Promise<unknown>)(tx, ctx, input);
  const par = async (n: number, f: (i: number) => Promise<Rec>): Promise<Rec[]> => Promise.all(Array.from({ length: n }, (_, i) => f(i).catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec)));

  // ═══════════════ PC. ตัวควบคุมบวก ═══════════════
  console.log("\n── PC: ตัวควบคุมบวก (ตารางของข้อสอบเอง) ──");
  const CTL = `${CTL_PREFIX}${STAMP}`;
  let ctlReady = "";
  try {
    await pool.query(`CREATE TABLE "${CTL}" (id text PRIMARY KEY, capacity int NOT NULL, sold int NOT NULL DEFAULT 0, held int NOT NULL DEFAULT 0, reserved int NOT NULL DEFAULT 0)`);
  } catch (e) { ctlReady = errMsg(e); }
  const ctlRow = async (cap: number) => { const id = rid("ctl"); await pool.query(`INSERT INTO "${CTL}" (id, capacity) VALUES ($1, $2)`, [id, cap]); return id; };
  /** ตัวช่วยที่ผิดโดยเจตนา: อ่าน → หน่วง → เขียนค่าที่คำนวณเอง (ห้ามมีในโค้ดจริง) */
  const nonAtomicHold = async (id: string): Promise<boolean> => {
    const c = await pool.connect();
    try {
      const r = (await c.query<{ held: number; capacity: number }>(`SELECT held, capacity FROM "${CTL}" WHERE id = $1`, [id])).rows[0];
      if (!r || r.held + 1 > r.capacity) return false;
      await c.query(`SELECT pg_sleep(0.02)`);
      await c.query(`UPDATE "${CTL}" SET held = $2 WHERE id = $1`, [id, r.held + 1]);
      return true;
    } finally { c.release(); }
  };
  const atomicHold = async (id: string): Promise<boolean> => (await q(`UPDATE "${CTL}" SET held = held + 1 WHERE id = $1 AND sold + held + reserved + 1 <= capacity RETURNING held`, [id])).length === 1;
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed P0.1 (andaman-dive) อยู่ · สร้างตารางควบคุมได้", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = 'andaman-dive'`))[0]?.n, 1, "ร้าน andaman-dive");
    ok(!ctlReady, `สร้างตารางควบคุมไม่ได้: ${ctlReady}`);
  });
  await st("PC-2", "ฟิกซ์เจอร์/README :42 สูตร R2: ส.14 24−15=9 · อา.15 24−21=3 · จ.16 24−4−10=10 · พฤ.19 24−3−10=11 · โควตา PTD 10 · ถือ 15 นาที", () => {
    const W = FX.CALENDAR_WEEK_1111.rows.racha;
    const s = (d: string) => W.find((r) => r.date === d)?.sold ?? -1;
    const cap = FX.PRODUCT_RACHA.capacity, quota = FX.PRODUCT_RACHA.ptdQuota.seats;
    eq([cap - s("2026-11-14"), cap - s("2026-11-15"), cap - s("2026-11-16") - quota, cap - 3 - quota, FX.PRODUCT_RACHA.holdMinutes], [9, 3, 10, 11, 15], "R2");
  });
  await st("PC-3", "ตัวช่วยอ่าน-แล้ว-เขียน (ผิดโดยเจตนา) ขายเกินภายใต้ 50 คำขอพร้อมกันบนที่ว่าง 24 (≤ 3 ครั้ง · ไม่เกิน = control inconclusive)", async () => {
    ok(!ctlReady, `ไม่มีตารางควบคุม: ${ctlReady}`);
    const seen: number[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = await ctlRow(24);
      const r = await Promise.all(Array.from({ length: 50 }, () => nonAtomicHold(id).catch(() => false)));
      const wins = r.filter(Boolean).length; seen.push(wins);
      if (wins > 24) return;
    }
    throw new AssertFail(`control inconclusive: สำเร็จ ${seen.join("/")} ไม่เกิน 24 — ข้อสอบยิงพร้อมกันอาจไม่จริงพอ`);
  });
  await st("PC-4", "คำสั่งเดียว UPDATE … WHERE sold+held+reserved+1 <= capacity RETURNING: 50 คำขอพร้อมกัน ⇒ สำเร็จ 24 พอดี · ตัวสุ่มอ่านไม่เจอค่าเกิน", async () => {
    ok(!ctlReady, `ไม่มีตารางควบคุม: ${ctlReady}`);
    const id = await ctlRow(24);
    const stop = sampler(CTL, [id]);
    const r = await Promise.all(Array.from({ length: 50 }, () => atomicHold(id)));
    const s = await stop();
    eq([r.filter(Boolean).length, (await q<{ held: number }>(`SELECT held FROM "${CTL}" WHERE id = $1`, [id]))[0]?.held, s.viol.length], [24, 24, 0], "สำเร็จ/held/ค่าผิด");
  });
  await st("PC-5", "ล็อกสลับลำดับ (A: r1→r2 · B: r2→r1) ⇒ Postgres ตอบ 40P01 (ตัวตรวจ deadlock ของข้อสอบมองเห็นได้จริง)", async () => {
    ok(!ctlReady, `ไม่มีตารางควบคุม: ${ctlReady}`);
    const r1 = await ctlRow(1), r2 = await ctlRow(1);
    const a = await pool.connect(), b = await pool.connect();
    const codes: string[] = [];
    try {
      await a.query("BEGIN"); await b.query("BEGIN");
      await a.query(`SELECT 1 FROM "${CTL}" WHERE id = $1 FOR UPDATE`, [r1]);
      await b.query(`SELECT 1 FROM "${CTL}" WHERE id = $1 FOR UPDATE`, [r2]);
      const pa = a.query(`SELECT 1 FROM "${CTL}" WHERE id = $1 FOR UPDATE`, [r2]).then(() => "ok", (e) => String((e as { code?: string }).code));
      await sleep(150);
      const pb = b.query(`SELECT 1 FROM "${CTL}" WHERE id = $1 FOR UPDATE`, [r1]).then(() => "ok", (e) => String((e as { code?: string }).code));
      codes.push(...(await withTimer(Promise.all([pa, pb]), 20_000, "PC-5")));
    } finally { await a.query("ROLLBACK").catch(() => undefined); await b.query("ROLLBACK").catch(() => undefined); a.release(); b.release(); }
    ok(codes.includes("40P01"), `ไม่เห็น 40P01: ${codes.join(",")}`);
  });
  await st("PC-6", "ตัวสุ่มอ่านจับค่าผิดได้: ตั้ง held > capacity ชั่วขณะ ⇒ viol > 0", async () => {
    ok(!ctlReady, `ไม่มีตารางควบคุม: ${ctlReady}`);
    const id = await ctlRow(5);
    const stop = sampler(CTL, [id]);
    await pool.query(`UPDATE "${CTL}" SET held = 9 WHERE id = $1`, [id]); await sleep(120);
    await pool.query(`UPDATE "${CTL}" SET held = 0 WHERE id = $1`, [id]);
    const s = await stop();
    ok(s.viol.length > 0 && s.n > 0, `ตัวสุ่มอ่านไม่จับ: ${fmt(s)}`);
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์ · facade · กติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด ──");
  const srcOf = (p: string) => stripComments(read(p));
  const tripsFiles = (): string[] => { const d = join(ROOT, "src/lib/modules/trips"); return existsSync(d) ? readdirSync(d, { recursive: true }).map(String).filter((f) => f.endsWith(".ts")).map((f) => `src/lib/modules/trips/${f}`) : []; };
  /** คำสั่ง UPDATE "TripDeparture" ที่ SET ตัวนับ (sold/held/reserved) — คืน [ไฟล์, ข้อความคำสั่ง, ข้อความหลังคำสั่ง] */
  const counterStmts = (files: string[]) => {
    const out: { f: string; sql: string; after: string }[] = [];
    for (const f of files) {
      const s = srcOf(f);
      for (const m of s.matchAll(/UPDATE\s+"TripDeparture"\s+SET([\s\S]*?)`/g)) {
        const body = m[1];
        if (!/"(sold|held|reserved)"\s*=/.test(body.split(/\bWHERE\b/i)[0] ?? "")) continue;
        const end = (m.index ?? 0) + m[0].length;
        out.push({ f, sql: `UPDATE "TripDeparture" SET${body}`, after: s.slice(Math.max(0, (m.index ?? 0) - 140), m.index ?? 0) + s.slice(end, end + 320) });
      }
    }
    return out;
  };
  const badCounterWrite = (s: string): string[] => {
    const bad: string[] = [];
    for (const m of s.matchAll(/tripDeparture\.(update|updateMany|upsert)\s*\(([\s\S]{0,500}?)\)\s*;/g)) if (/\b(sold|held|reserved)\b/.test(m[2])) bad.push(`ORM ${m[1]}`);
    for (const m of s.matchAll(/"(sold|held|reserved)"\s*=\s*(\$\{|\$\d)/g)) bad.push(`SET "${m[1]}" = ค่าจากแอป`);
    return bad;
  };
  await st("S-1", "ไฟล์เจ้าของครบ: capacity-core · capacity · waitlist · capacity-actions · sellable-impl · jobs (ต่อท้าย) · platform/sellables", () => {
    const miss = OWN_FILES.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
  await st("S-2", `facade ส่งออก ${SVC_FNS.length + PURE_FNS.length} ฟังก์ชัน + ค่าคงที่ · บล็อก "// TRIPS T0.4 ▸" · ไม่มี export * · ค่าสถานะตรง CC`, () => {
    const t = needTrips();
    const miss = [...SVC_FNS, ...PURE_FNS].filter((n) => typeof t[n] !== "function").concat(FACADE_CONSTS.filter((n) => t[n] === undefined));
    ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 10).join(", ")}`);
    const idx = read("src/lib/modules/trips/index.ts");
    ok(/\/\/\s*TRIPS T0\.4 ▸/.test(idx), "ไม่มีบล็อก // TRIPS T0.4 ▸ … ◂");
    ok(!/export\s*\*\s*from/.test(stripComments(idx)), "มี export * ใน facade");
    eq([t.HOLD_STATUSES, t.HOLD_PURPOSES, t.WAITLIST_STATUSES], [HOLD_STATUSES, HOLD_PURPOSES, WAITLIST_STATUSES], "ค่าสถานะ");
  });
  await st("S-3", "capacity-actions.ts: \"use server\" · ส่งออกเฉพาะ async function · requireUnit + assertCan · ไม่รับ now", () => {
    const raw = read("src/lib/modules/trips/capacity-actions.ts");
    ok(raw, "ยังไม่มีไฟล์");
    const s = stripComments(raw);
    ok(/^\s*["']use server["'];?/.test(s.trimStart()), "ไม่ขึ้นต้น \"use server\"");
    const exps = [...s.matchAll(/^export\s+(?!async\s+function\b)(\S+)/gm)].map((m) => m[1]);
    ok(exps.length === 0, `export ที่ไม่ใช่ async function: ${exps.join(", ")}`);
    ok(/assertCan\(/.test(s) && /requireUnit\(/.test(s), "ไม่มี requireUnit/assertCan (F6)");
    ok(/trips\.seat\.sell/.test(s) && /trips\.seat\.manage/.test(s), "ไม่ใช้คีย์สิทธิ์ trips.seat.sell/manage");
    ok(!/\bnow\s*:/.test(stripStrings(s)), "action รับ/ส่ง now");
  });
  await st("S-4", "ไม่มี any · ไม่มี console.* · ไม่มี DELETE/.delete( ในไฟล์ของใบ", () => {
    const bad: string[] = [];
    for (const f of OWN_FILES) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (/(:\s*any\b|\bas\s+any\b|<any>|any\[\])/.test(s)) bad.push(`${f}: any`);
      if (/\bconsole\.(log|info|warn|error|debug)\s*\(/.test(s)) bad.push(`${f}: console`);
      if (/\.(delete|deleteMany)\s*\(|DELETE\s+FROM/i.test(s)) bad.push(`${f}: ลบแถว`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-5", "import: @/lib/core/* zod @prisma/client ./ node:crypto เท่านั้นในโมดูล · prisma ดิบเฉพาะ jobs.ts · capacity-core บริสุทธิ์", () => {
    const bad: string[] = [];
    for (const f of T04_SRC) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (!f.endsWith("jobs.ts") && /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(s)) bad.push(`${f}: prisma ดิบ`);
      for (const m of s.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g)) {
        const sp = m[1];
        if (!(sp.startsWith("@/lib/core/") || sp === "zod" || sp === "@prisma/client" || sp.startsWith("./") || sp === "node:crypto" || sp === "next/cache")) bad.push(`${f}→${sp}`);
      }
      for (const m of s.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) if (!m[1].startsWith("./") && !m[1].startsWith("@/lib/core/")) bad.push(`${f}→${m[1]}`);
    }
    for (const m of srcOf("src/lib/modules/trips/capacity-core.ts").matchAll(/^import\s+(?!type\b)[^;]*from\s*["']([^"']+)["']/gm)) if (m[1] !== "./departures-core") bad.push(`capacity-core ไม่บริสุทธิ์: ${m[1]}`);
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-6", "ตัวนับ = คำสั่งเดียว: ไม่มี ORM แตะ sold/held/reserved · ไม่มี SET \"held\" = ค่าจากแอป · ทุก UPDATE ตัวนับมีเงื่อนไขใน WHERE + RETURNING · (ตัวควบคุม: โค้ดผิดตัวอย่างต้องถูกจับ)", () => {
    eq(badCounterWrite(`await tx.tripDeparture.update({ where: { id }, data: { held: d.held + n } });\nawait tx.$queryRaw\`UPDATE "TripDeparture" SET "held" = \${x} WHERE id = 1\`;`).length, 2, "ตัวควบคุม regex");
    const files = tripsFiles();
    ok(files.length > 0, "ยังไม่มีโมดูล trips");
    const bad: string[] = [];
    for (const f of files) for (const b of badCounterWrite(srcOf(f))) bad.push(`${f}: ${b}`);
    const stmts = counterStmts(files);
    ok(stmts.length >= 8, `พบคำสั่งตัวนับแค่ ${stmts.length} (ต้องมี ถือ แปลง ปล่อย คืน ย้าย×2 จอง/คืนโควตา กวาด)`);
    for (const x of stmts) {
      const [set, where = ""] = x.sql.split(/\bWHERE\b/i);
      for (const m of set.matchAll(/"(sold|held|reserved)"\s*=\s*([^,]+)/g)) if (!new RegExp(`^\\s*"${m[1]}"\\s*[+-]`).test(m[2])) bad.push(`${x.f}: SET "${m[1]}" ไม่ใช่แบบสัมพัทธ์`);
      if (!/(>=|<=)/.test(where)) bad.push(`${x.f}: WHERE ไม่มีเงื่อนไขกันเกิน/ติดลบ`);
      if (!/RETURNING/i.test(where)) bad.push(`${x.f}: ไม่มี RETURNING`);
      if (!/"tenantId"/.test(where)) bad.push(`${x.f}: WHERE ไม่มี tenantId`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-7", "ทุกคำสั่งตัวนับตรวจจำนวนแถวด้วย expectRows( ทันทีหลังคำสั่ง · มี class CapacityAbort (มี .code) · TripHold CAS มี status='ACTIVE' + RETURNING", () => {
    const stmts = counterStmts(T04_SRC);
    ok(stmts.length > 0, "ไม่พบคำสั่งตัวนับในไฟล์ของใบ");
    const bad = stmts.filter((x) => !/expectRows\s*\(/.test(x.after)).map((x) => `${x.f}: ไม่ตรวจจำนวนแถว`);
    const cap = srcOf("src/lib/modules/trips/capacity.ts");
    ok(/class\s+CapacityAbort\b/.test(cap) && /\bcode\b/.test(cap.slice(cap.indexOf("class CapacityAbort"), cap.indexOf("class CapacityAbort") + 400)), "ไม่มี class CapacityAbort ที่มี code");
    for (const f of T04_SRC) for (const m of srcOf(f).matchAll(/UPDATE\s+"TripHold"\s+SET\s+"status"([\s\S]*?)`/g)) if (!/"status"\s*=\s*'ACTIVE'/.test(m[1]) || !/RETURNING/i.test(m[1])) bad.push(`${f}: CAS TripHold ไม่ครบ`);
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-8", "ไม่มีตัวเลขธุรกิจตายตัว (นาทีถือ/ชั่วโมงยืนยัน/เพดาน/เกณฑ์ \"เหลือ N\") · ไม่มี now() ของฐานในเงื่อนไขเวลา", () => {
    ok(srcOf("src/lib/modules/trips/capacity.ts"), "ยังไม่มี capacity.ts");
    const bad: string[] = [];
    for (const f of T04_SRC) {
      const raw = srcOf(f); if (!raw) continue;
      const s = stripStrings(raw);
      for (const m of s.matchAll(/\b(holdMinutes|waitlistHoldMinutes|shopConfirmHours|holdCapPerContact|showLeftAtOrBelow|holdPerHourPerContact|maxConcurrent)\s*[:=]\s*[1-9]\d*/g)) bad.push(`${f}: ${m[0]}`);
      for (const m of s.matchAll(/\b(15|30|12|48|5)\s*\*\s*60/g)) bad.push(`${f}: ${m[0]}`);
      for (const m of raw.matchAll(/"expiresAt"\s*(<=|>|<|>=)\s*now\(\)/g)) bad.push(`${f}: ${m[0]}`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-9", "minute-jobs: trips.expireHolds (1 นาที) + trips.waitlistOffers (5) · โหลด facade trips ตอนรัน", () => {
    const s = stripComments(read("src/lib/platform/minute-jobs.ts"));
    const blk = (name: string) => { const i = s.indexOf(`"${name}"`); return i < 0 ? "" : s.slice(i, i + 600); };
    const a = blk("trips.expireHolds"), b = blk("trips.waitlistOffers");
    ok(a && /everyMinutes:\s*1\b/.test(a) && /@\/lib\/modules\/trips["']/.test(a) && /runExpireHolds/.test(a), "trips.expireHolds ไม่ครบ");
    ok(b && /everyMinutes:\s*5\b/.test(b) && /@\/lib\/modules\/trips["']/.test(b) && /runWaitlistOffers/.test(b), "trips.waitlistOffers ไม่ครบ");
  });
  await st("S-10", "event 4 ตัวลง 3 ทะเบียน (ป้ายไทย) · consumer trips.hold.expired เรียก onWaitlistTrigger", async () => {
    const cons = stripComments(read("src/lib/outbox-consumers.ts"));
    const ae = asArr((await tryImport("@/lib/automation/labels")).mod?.AUTOMATION_EVENTS), we = asArr((await tryImport("@/lib/webhooks/labels")).mod?.WEBHOOK_EVENTS);
    const bad: string[] = [];
    for (const e of EVENTS) {
      if (!new RegExp(`["']${e.replace(/\./g, "\\.")}["']\\s*:`).test(cons)) bad.push(`${e}(consumer)`);
      const a = ae.find((x) => x.value === e); if (!a || !THAI.test(String(a.label))) bad.push(`${e}(automation)`);
      if (!we.some((x) => x.value === e)) bad.push(`${e}(webhook)`);
    }
    const i = cons.indexOf(`"trips.hold.expired"`);
    if (i < 0 || !/onWaitlistTrigger/.test(cons.slice(i, i + 400))) bad.push("trips.hold.expired ไม่เรียก onWaitlistTrigger");
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-11", "สิทธิ์ trips.seat.sell + trips.seat.manage ใน MODULE_DEFS โมดูล trips (ป้ายไทย)", async () => {
    const P = (await tryImport("@/lib/core/permissions")).mod;
    const isKey = P?.isPermissionKey as ((k: string) => boolean) | undefined, label = P?.permissionLabel as ((k: string) => string) | undefined, mod = P?.moduleOfPermissionKey as ((k: string) => string) | undefined;
    ok(isKey && label && mod, "โหลด permissions ไม่ได้");
    const miss = PERM_KEYS.filter((k) => !isKey?.(k) || !THAI.test(String(label?.(k) ?? "")) || mod?.(k) !== "trips");
    ok(miss.length === 0, `ยังไม่ลงทะเบียน: ${miss.join(", ")}`);
  });
  await st("S-12", "platform/sellables.ts: sellableFor(\"TRIP\") ⇒ ok · kind TRIP · availability/capacityRowsOf/reserveInTx · HOTEL/TICKET ⇒ KIND_NOT_SUPPORTED · TRIP.hold ⇒ KIND_NOT_SUPPORTED (T0.6)", async () => {
    const m = await tryImport("@/lib/platform/sellables");
    const sf = m.mod?.sellableFor as ((k: string) => Promise<unknown>) | undefined;
    ok(typeof sf === "function", `ไม่มี sellableFor (${m.err.slice(0, 80)})`);
    const t = asRec(await sf!("TRIP")) ?? {};
    const v = asRec(t.value) ?? {};
    ok(t.ok === true && v.kind === "TRIP" && ["availability", "capacityRowsOf", "reserveInTx", "hold"].every((k) => typeof v[k] === "function"), `TRIP: ${fmt(t)}`);
    for (const k of ["HOTEL", "TICKET"]) codeR(asRec(await sf!(k)) ?? {}, "KIND_NOT_SUPPORTED", k);
    codeR(asRec(await (v.hold as AnyFn)({ tenantId: "x", unitId: "x", channel: "WEB", actor: { kind: "SYSTEM", job: "qc" } }, {})) ?? {}, "KIND_NOT_SUPPORTED", "TRIP.hold");
  });
  await st("S-13", "zod strict ใน capacity.ts + waitlist.ts · CAS ล็อกรอบด้วย FOR UPDATE ก่อน CAS hold (ลำดับ §D.5)", () => {
    const c = srcOf("src/lib/modules/trips/capacity.ts"), w = srcOf("src/lib/modules/trips/waitlist.ts");
    ok(c && w, "ยังไม่มีไฟล์");
    for (const [n, s] of [["capacity", c], ["waitlist", w]] as const) ok(/from\s*["']zod["']/.test(s) && /(z\.strictObject\(|\.strict\(\))/.test(s), `${n}: ไม่มี zod strict`);
    ok(/FROM\s+"TripDeparture"[\s\S]{0,300}?FOR\s+UPDATE/i.test(c), "capacity.ts ไม่ล็อกแถวรอบ FOR UPDATE");
    ok(/pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'trips-holdcap:'/.test(c), "ไม่มี advisory lock ของเพดาน (§D.6)");
  });
  await st("S-14", "ไม่แตะไฟล์ต้องห้ามเทียบ session/trips: prisma/ · core/settings/ · ไฟล์ของ T0.2/T0.3 · โมดูลเดิม · ข้อสอบ p0.1/t0.1–t0.4", () => {
    const base = git(["merge-base", "HEAD", "session/trips"]).trim();
    ok(base, "หา merge-base กับ session/trips ไม่ได้");
    const paths = ["prisma", "src/lib/core/settings", /* ORACLE-EDIT S-14 (ผู้คุม 12 พ.ย.): departures.ts ออกจากรายการ — มติข้อ 13 ให้แก้ doc comment ของสูตรสถานะ */ "src/lib/modules/trips/departures-core.ts", "src/lib/modules/trips/resources.ts", "src/lib/modules/trips/products.ts",
      "src/lib/modules/pos", "src/lib/modules/rooms", "src/lib/modules/hotel", "src/lib/modules/booking", "src/lib/modules/ticket",
      "scripts/qc-trips-p0.1.mts", "scripts/qc-trips-t0.1.mts", "scripts/qc-trips-t0.2.mts", "scripts/qc-trips-t0.3.mts"];
    const changed = [...new Set([...git(["diff", "--name-only", base, "--", ...paths]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n")].filter(Boolean))];
    if (git(["ls-tree", "--name-only", "session/trips", "scripts/qc-trips-t0.4.mts"]).trim() && git(["show", "session/trips:scripts/qc-trips-t0.4.mts"]) !== read("scripts/qc-trips-t0.4.mts")) changed.push("scripts/qc-trips-t0.4.mts");
    ok(changed.length === 0, `แตะ: ${changed.slice(0, 6).join(", ")}`);
  });
  groupLine("S");

  // ═══════════════ C. ฟังก์ชันบริสุทธิ์ ═══════════════
  console.log("\n── C: ฟังก์ชันบริสุทธิ์ ──");
  await st("C-1", "canTransitionHold: ACTIVE → CONVERTED/EXPIRED/RELEASED · สถานะอื่นจบ (ไม่มีทางกลับ)", () => {
    const can = (a: string, b: string) => fn("canTransitionHold")(a, b) === true;
    const bad: string[] = [];
    for (const a of HOLD_STATUSES) for (const b of HOLD_STATUSES) { const want = a === "ACTIVE" && b !== "ACTIVE"; if (can(a, b) !== want) bad.push(`${a}>${b}`); }
    ok(bad.length === 0, bad.join(" "));
  });
  await st("C-2", "canTransitionWaitlist: WAITING→OFFERED|CANCELLED|EXPIRED · OFFERED→ACCEPTED|DECLINED|EXPIRED|CANCELLED · ที่เหลือจบ", () => {
    const allow: Record<string, string[]> = { WAITING: ["OFFERED", "CANCELLED", "EXPIRED"], OFFERED: ["ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"] };
    const bad: string[] = [];
    for (const a of WAITLIST_STATUSES) for (const b of WAITLIST_STATUSES) if ((fn("canTransitionWaitlist")(a, b) === true) !== (allow[a] ?? []).includes(b)) bad.push(`${a}>${b}`);
    ok(bad.length === 0, bad.join(" "));
  });
  await st("C-3", "publicLeftOf = capacity − sold − held − reserved ตรงตัว (ภาพ 20 ทั้ง 4 แถว · ไม่ clamp เมื่อข้อมูลผิด)", () => {
    const L = (c: number, s: number, h: number, r: number) => fn("publicLeftOf")({ capacity: c, sold: s, held: h, reserved: r });
    eq([L(24, 15, 0, 0), L(24, 21, 0, 0), L(24, 4, 0, 10), L(24, 3, 0, 10), L(24, 2, 3, 4), L(5, 4, 3, 0)], [9, 3, 10, 11, 15, -2], "publicLeft");
  });
  await st("C-4", "holdExpiresAt: PAYMENT = holdMinutes · SHOP_CONFIRM = shopConfirmHours · WAITLIST_OFFER = waitlistHoldMinutes · ค่าที่ต้องใช้ไม่มี ⇒ null", () => {
    const now = Z(NOW0), d = { holdMinutes: 15, waitlistHoldMinutes: 30, shopConfirmHours: 12 };
    const E = (p: string, dd: Rec = d) => { const r = fn("holdExpiresAt")(p, dd, now); return r instanceof Date ? r.toISOString() : r; };
    eq([E("PAYMENT"), E("SHOP_CONFIRM"), E("WAITLIST_OFFER"), E("AGENT_HOLD"), E("PAYMENT", { shopConfirmHours: 12 })],
      [addMin(now, 15).toISOString(), addMin(now, 720).toISOString(), addMin(now, 30).toISOString(), null, null], "expiresAt");
  });
  await st("C-5", "sortCapacityRows เรียง (layer, kindIndex, table, sortKey, id) · ไม่แก้ array เดิม", () => {
    const rows = [{ layer: "1b", table: "AgentAllotment", id: "a2", sortKey: "a2" }, { layer: "1a", table: "TripDeparture", id: "d9", sortKey: "d9" }, { layer: "1a", table: "TripDeparture", id: "d1", sortKey: "d1" }, { layer: "1c", table: "TripUnit", id: "u1", sortKey: "x" }];
    const copy = JSON.stringify(rows);
    const r = asArr(fn("sortCapacityRows")(rows));
    eq(r.map((x) => x.id), ["d1", "d9", "a2", "u1"], "ลำดับ");
    eq(JSON.stringify(rows), copy, "array เดิมถูกแก้");
  });
  await st("C-6", "idemKeyFor: pub:<basket>:<k> · ag:<agent>:<k> · st:<user>:<k> · sys:<job>:<k> (กันชนข้ามผู้เรียก)", () => {
    const f = fn("idemKeyFor");
    eq([f({ kind: "PUBLIC", clientKey: "c" }, "key12345", "bh"), f({ kind: "AGENT", agentAccountId: "ag1", agentUserId: "u" }, "key12345"), f({ kind: "STAFF", userId: "u1" }, "key12345"), f({ kind: "SYSTEM", job: "j" }, "key12345")],
      ["pub:bh:key12345", "ag:ag1:key12345", "st:u1:key12345", "sys:j:key12345"], "namespace");
  });
  await st("C-7", "holdCapKeyHash/holdRequestHash: sha256 hex 64 · คงที่ · ไม่ขึ้นกับลำดับคีย์ · ไม่มีข้อความเดิมในผล", () => {
    const h = fn("holdCapKeyHash"), r = fn("holdRequestHash");
    const a = String(h("contact:0812345678")), b = String(h("contact:0812345678"));
    ok(/^[0-9a-f]{64}$/.test(a) && a === b && !a.includes("0812345678"), `capKey: ${a}`);
    ok(String(h("basket:x")) !== a, "แฮชชนกัน");
    const x = String(r({ departureId: "d", qty: 2, purpose: "PAYMENT" })), y = String(r({ purpose: "PAYMENT", qty: 2, departureId: "d" }));
    ok(/^[0-9a-f]{64}$/.test(x) && x === y && x !== String(r({ departureId: "d", qty: 3, purpose: "PAYMENT" })), "requestHash");
  });
  groupLine("C");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uC = rid("uC"), uBk = rid("uBk"), uB = rid("uB");
  let setupErr = "";
  const U: Record<string, { role: string; unitAccess: string[]; permissions: Rec; userId: string }> = {};
  const P: Record<string, { id: string; opt: string; unit: string; tenant: string }> = {};
  const PARTY: Record<string, string> = {};
  let seq = 0;
  try {
    await needTable("TripDeparture"); await needTable("TripHold"); await needTable("TripWaitlist");
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T0.4 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    const mkUnit = async (id: string, tenantId: string, type: string, tag: string) => {
      try { await insertRow("BusinessUnit", { id, tenantId, type, name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: "{}", updatedAt: new Date() }); }
      catch (e) { throw new Error(type === "TRIPS" ? `สร้างหน่วย TRIPS ไม่ได้ (enum ของ T0.1 ยังไม่ลง): ${errMsg(e).slice(0, 80)}` : errMsg(e)); }
    };
    await mkUnit(uBk, tA, "BOOKING", "abk"); await mkUnit(uA, tA, "TRIPS", "a"); await mkUnit(uA2, tA, "TRIPS", "a2"); await mkUnit(uC, tA, "TRIPS", "c"); await mkUnit(uB, tB, "TRIPS", "b");
    for (const [tag, tenantId] of [["oa", tA], ["ob", tB]] as const) {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id };
    }
    const mkProd = async (key: string, tenantId: string, unitId: string) => {
      const id = rid(`p${key}`), o = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t04qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}`, en: `QC ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
      await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      P[key] = { id, opt: o, unit: unitId, tenant: tenantId };
    };
    await mkProd("A", tA, uA); await mkProd("A20", tA, uA); await mkProd("A2", tA, uA2); await mkProd("C", tA, uC); await mkProd("B", tB, uB);
    for (let i = 1; i <= 14; i++) PARTY[`a${i}`] = await insertRow("Party", { id: rid(`pa${i}`), tenantId: tA, name: `ผู้รอ ${i} สมหญิง`, phone: `08${String(10000000 + i * 7919).slice(0, 8)}`, updatedAt: new Date() });
    PARTY.b1 = await insertRow("Party", { id: rid("pb1"), tenantId: tB, name: "ผู้รอร้านบี", updatedAt: new Date() });
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  let settingsErr = "";
  const setV = async (changes: Rec[]) => {
    const r = asRec(await S("setSettings")(U.oa, { tenantId: tA }, changes, {})) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  try { if (!setupErr) await setV([{ key: K.T6, scope: "UNIT", scopeId: uA, value: { daysBefore: 1, atMin: 1080, perChannel: { COUNTER: { daysBefore: 0, atMin: 420 } } } }, { key: K.T6, scope: "UNIT", scopeId: uC, value: { daysBefore: 1, atMin: 1080, perChannel: { COUNTER: { daysBefore: 0, atMin: 420 } } } }]); }
  catch (e) { settingsErr = e instanceof Error ? e.message : String(e); console.log(`  ⚠️ ตั้ง T6 ต่อหน่วยไม่สำเร็จ: ${settingsErr}`); }
  const needDb = async () => { needTrips(); await needTable("TripDeparture"); ok(!setupErr && P.A, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); ok(!settingsErr, `ตั้ง T6 ไม่ได้: ${settingsErr}`); };

  // ── ตัวสร้างรอบ (SQL ดิบตามรูป T0.1 §B.1) ──
  type DepOpt = { key?: string; date?: string; capacity?: number; sold?: number; held?: number; reserved?: number; status?: string; minPax?: number | null; stopSell?: Rec | null; startsAt?: Date };
  const mkDep = async (o: DepOpt = {}): Promise<string> => {
    const p = P[o.key ?? "A"]; const date = o.date ?? DATE;
    const startsAt = o.startsAt ?? addMin(BKK(date, "08:00"), (seq++ % 600));
    const counterCut = BKK(date, "07:00");
    const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: addMin(startsAt, 480),
      status: o.status ?? "OPEN", capacity: o.capacity ?? 24, sold: o.sold ?? 0, held: o.held ?? 0, reserved: o.reserved ?? 0, minPax: o.minPax ?? null,
      cutoffAt: counterCut < startsAt ? counterCut : startsAt, stopSell: o.stopSell ? JSON.stringify(o.stopSell) : null, version: 0, updatedAt: new Date() });
    return id;
  };
  type DepRow = { id: string; capacity: number; sold: number; held: number; reserved: number; status: string; version: number };
  const dep = async (id: string) => (await q<DepRow>(`SELECT id, capacity, sold, held, reserved, status, version FROM "TripDeparture" WHERE id = $1`, [id]))[0];
  const activeSum = async (id: string) => (await q<{ s: number }>(`SELECT COALESCE(sum("qtyPublic" + "qtyAllot"), 0)::int AS s FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [id]))[0]?.s ?? -1;
  /** ค่าคงที่ §4 ข้อ 2 · คืนแถว */
  const inv = async (id: string, what = "ค่าคงที่"): Promise<DepRow> => {
    const d = await dep(id); ok(d, `${what}: ไม่มีรอบ`);
    ok(d.sold >= 0 && d.held >= 0 && d.reserved >= 0 && d.sold + d.held + d.reserved <= d.capacity, `${what}: ตัวนับผิด ${fmt(d)}`);
    const s = await activeSum(id); ok(s === d.held, `${what}: held ${d.held} ≠ Σ hold ACTIVE ${s}`);
    return d;
  };
  const hold = async (id: string) => (await q<Rec>(`SELECT id, status, purpose, channel, "qtyPublic", "qtyAllot", "expiresAt", "capKeyHash", "idempotencyKey", "requestHash", "bookingId", "departureId", "releasedReason" FROM "TripHold" WHERE id = $1`, [id]))[0];
  const holdsOf = async (depId: string) => q<Rec>(`SELECT id, status, purpose, "qtyPublic", "expiresAt", "capKeyHash" FROM "TripHold" WHERE "departureId" = $1 ORDER BY "createdAt", id`, [depId]);
  /** hold ดิบ (ปรับ held ของรอบด้วย) — ใช้กับ purpose ที่บริการของใบนี้ยังสร้างไม่ได้/ปริมาณมาก */
  const rawHold = async (depId: string, o: { qty?: number; expiresAt: Date | string; purpose?: string; bookingId?: string | null; capKeyHash?: string; tenant?: string; unit?: string; status?: string }): Promise<string> => {
    const qty = o.qty ?? 1; const id = rid("h");
    await insertRow("TripHold", { id, tenantId: o.tenant ?? tA, unitId: o.unit ?? uA, departureId: depId, bookingId: o.bookingId ?? null, channel: "COUNTER", qtyPublic: qty, qtyAllot: 0, unitIds: [], purpose: o.purpose ?? "PAYMENT",
      capKeyHash: o.capKeyHash ?? hex(32), requestHash: hex(32), idempotencyKey: `qc:${id}`, status: o.status ?? "ACTIVE", expiresAt: new Date(o.expiresAt), updatedAt: new Date() });
    if ((o.status ?? "ACTIVE") === "ACTIVE") await pool.query(`UPDATE "TripDeparture" SET held = held + $2 WHERE id = $1`, [depId, qty]);
    return id;
  };
  const outbox = async (field: string, value: string, type?: string) => q<{ type: string; payload: Rec; idempotencyKey: string }>(
    `SELECT type, payload, "idempotencyKey" FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND payload->>'${field}' = $2 ${type ? "AND type = $3" : ""} ORDER BY "createdAt"`, type ? [[tA, tB], value, type] : [[tA, tB], value]);

  // ── ctx ──
  type CtxO = { tenant?: string; unit?: string; ch?: string; actor?: Rec; now?: string | Date };
  const C = (o: CtxO = {}): Rec => ({ tenantId: o.tenant ?? tA, unitId: o.unit ?? uA, channel: o.ch ?? "COUNTER", actor: o.actor ?? { kind: "STAFF", userId: U.oa?.userId ?? "x" }, now: new Date(o.now ?? NOW0), locale: "th" });
  const PUB = (now: string | Date = NOW0, ch = "WEB", unit = uA, clientKey = `ck${hex()}`): Rec => C({ ch, unit, now, actor: { kind: "PUBLIC", clientKey } });
  const SYS = (now: string | Date = NOW0, unit = uA): Rec => C({ unit, now, actor: { kind: "SYSTEM", job: "qc" } });
  const key = () => `qck${hex(8)}`;
  const basket = () => `basket:${hex(16)}`;
  const staffHold = async (depId: string, qty: number, o: { now?: string | Date; purpose?: string; unit?: string } = {}) =>
    call("placeHold", C({ now: o.now, unit: o.unit }), { departureId: depId, qty, idempotencyKey: key(), ...(o.purpose ? { purpose: o.purpose } : {}) });
  const pubHold = async (depId: string, qty: number, o: { now?: string | Date; capKey?: string; ctx?: Rec; idk?: string } = {}) =>
    call("placeHold", o.ctx ?? PUB(o.now), { departureId: depId, qty, idempotencyKey: o.idk ?? key(), capKey: o.capKey ?? basket() });
  const hid = (r: Rec) => String(asRec(r.value)?.holdId ?? "");
  const sweep = async (now: string | Date, o: Rec = {}) => asRec(await fn("runExpireHolds")(new Date(now), { tenantIds: [tA], ...o })) ?? {};
  const avail = async (depId: string, ctx: Rec = C()) => V(await call("getAvailability", ctx, { departureId: depId }), "getAvailability");

  // ═══════════════ AV. ที่ว่าง R2 ═══════════════
  console.log("\n── AV: ที่ว่าง (R2 · ภาพ 20) ──");
  await st("AV-1", "ภาพ 20 (24 ที่): (15,0,0)=9 · (21,0,0)=3 \"เหลือ N\" · (4,0,10)=10 · พฤ.19 (0,0,10)=14 → ขายหน้าร้าน 3 (ถือ+แปลง) = 11 · showLeft เฉพาะ 3", async () => {
    await needDb();
    const now = FX.TRIPS_AS_OF;
    const d14 = await mkDep({ date: "2026-11-14", sold: 15 }), d15 = await mkDep({ date: "2026-11-15", sold: 21 }), d16 = await mkDep({ date: "2026-11-16", sold: 4, reserved: 10 }), d19 = await mkDep({ date: "2026-11-19", reserved: 10 });
    const before19 = await avail(d19, PUB(now));
    const h = await staffHold(d19, 3, { now });
    V(await call("convertHold", C({ now }), { holdId: hid(h) }), "convertHold");
    const rows = [];
    for (const d of [d14, d15, d16, d19]) rows.push(await avail(d, PUB(now)));
    eq([before19.publicLeft, ...rows.map((r) => r.publicLeft)], [14, 9, 3, 10, 11], "ว่าง");
    eq(rows.map((r) => r.showLeft), [false, true, false, false], "showLeft (≤ X6=5)");
    eq(rows.map((r) => r.saleBlock), [null, null, null, null], "saleBlock");
    eq([(await inv(d19)).sold, (await dep(d19)).reserved], [3, 10], "พฤ. 19 หลังขาย");
  });
  await st("AV-2", "เลขสาธารณะ = เลขจริงทุกแถว: 12 รอบตัวนับสุ่ม ⇒ publicLeft = capacity − sold − held − reserved ของแถวในฐาน", async () => {
    await needDb();
    const bad: string[] = [];
    for (let i = 0; i < 12; i++) {
      const cap = 10 + (i % 7) * 5, s = (i * 3) % 9, h = i % 4, r = i % 3 === 0 ? 0 : (i % 5);
      const id = await mkDep({ capacity: cap, sold: s, held: 0, reserved: r });
      for (let k = 0; k < h; k++) await rawHold(id, { expiresAt: addMin(NOW0, 60) });
      const d = await dep(id); const a = await avail(id, PUB());
      if (a.publicLeft !== d.capacity - d.sold - d.held - d.reserved) bad.push(`${fmt(d)} → ${a.publicLeft}`);
    }
    ok(bad.length === 0, bad.slice(0, 3).join(" · "));
  });
  await st("AV-3", "ปิดรับต่อช่องทาง: หลัง 18:00 วันก่อน ⇒ WEB saleBlock CUTOFF publicLeft 0 · COUNTER (0 วัน 07:00) ยังขาย = เลขจริง · cutoffAt ของช่องทาง", async () => {
    await needDb();
    const id = await mkDep({ sold: 5 });
    const w = await avail(id, PUB(AFTER_WEB)), c = await avail(id, C({ now: AFTER_WEB }));
    eq([w.saleBlock, w.publicLeft, c.saleBlock, c.publicLeft, iso(w.cutoffAt), iso(c.cutoffAt)], ["CUTOFF", 0, null, 19, WEB_CUT, BKK(DATE, "07:00").toISOString()], "WEB/COUNTER");
  });
  await st("AV-4", "หยุดขาย: stopSell {channels:[WEB]} ⇒ WEB STOP_SELL 0 · COUNTER เลขจริง · until ผ่านแล้ว ⇒ ไม่หยุด", async () => {
    await needDb();
    const a = await mkDep({ stopSell: { channels: ["WEB"], reason: "เรือซ่อม" } }), b = await mkDep({ stopSell: { channels: [], reason: "x", until: "2027-02-01T00:00:00Z" } });
    const w = await avail(a, PUB()), c = await avail(a, C()), u = await avail(b, PUB());
    eq([w.saleBlock, w.publicLeft, c.saleBlock, c.publicLeft, u.saleBlock, u.publicLeft], ["STOP_SELL", 0, null, 24, null, 24], "stopSell");
  });
  await st("AV-5", "สถานะ: CLOSED/CANCELLED ⇒ STATUS 0 · FULL ⇒ ไม่บล็อกแต่ 0 ตามสูตร · GUARANTEED ขายได้ · belowMin ตาม minPax · เริ่มแล้ว ⇒ STARTED", async () => {
    await needDb();
    const cl = await mkDep({ status: "CLOSED" }), ca = await mkDep({ status: "CANCELLED" }), fu = await mkDep({ status: "FULL", capacity: 6, sold: 6 }), gu = await mkDep({ status: "GUARANTEED", sold: 9, minPax: 8 }), lo = await mkDep({ sold: 3, minPax: 8 });
    const r = await Promise.all([cl, ca, fu, gu, lo].map((d) => avail(d, PUB())));
    eq(r.map((x) => [x.saleBlock, x.publicLeft]), [["STATUS", 0], ["STATUS", 0], [null, 0], [null, 15], [null, 21]], "สถานะ");
    eq([r[3].belowMin, r[4].belowMin], [false, true], "belowMin");
    eq((await avail(lo, C({ now: "2027-03-10T12:00:00Z" }))).saleBlock, "STARTED", "เริ่มแล้ว");
  });
  await st("AV-6", "ตัวควบคุมบวก X6: ตั้ง showLeftAtOrBelow ชั้น PRODUCT = 2 ⇒ เหลือ 3 ไม่ขึ้น \"เหลือ N\" · คืนค่า", async () => {
    await needDb();
    const id = await mkDep({ sold: 21 });
    ok((await avail(id, PUB())).showLeft === true, "ก่อนตั้ง showLeft ต้อง true");
    await setV([{ key: K.X6, scope: "PRODUCT", scopeId: P.A.id, value: 2 }]);
    try { eq((await avail(id, PUB())).showLeft, false, "หลังตั้ง 2"); } finally { await setV([{ key: K.X6, scope: "PRODUCT", scopeId: P.A.id, value: 5 }]); }
  });
  await st("AV-7", "listAvailability: เฉพาะสินค้า/ช่วงวัน · เรียง startsAt · รวม CANCELLED (STATUS) · ช่วง > 62 วัน = VALIDATION", async () => {
    await needDb();
    const ids = [await mkDep({ key: "A20", date: "2027-04-03" }), await mkDep({ key: "A20", date: "2027-04-01", status: "CANCELLED" }), await mkDep({ key: "A20", date: "2027-04-02", sold: 4 })];
    await mkDep({ key: "A20", date: "2027-04-20" });
    const r = await call("listAvailability", PUB(), { productId: P.A20.id, from: "2027-04-01", to: "2027-04-05" });
    const rows = Array.isArray(r.value) ? asArr(r.value) : [];
    eq(rows.map((x) => [x.slotId, x.localDate, x.publicLeft, x.saleBlock ?? null]), [[ids[1], "2027-04-01", 0, "STATUS"], [ids[2], "2027-04-02", 20, null], [ids[0], "2027-04-03", 24, null]], "แถว");
    codeR(await call("listAvailability", PUB(), { productId: P.A20.id, from: "2027-04-01", to: "2027-07-01" }), "VALIDATION", "ช่วงยาว");
  });
  groupLine("AV");

  // ═══════════════ H. วงจร hold ═══════════════
  console.log("\n── H: วงจร hold ──");
  await st("H-1", "placeHold PUBLIC: แถว PAYMENT/ACTIVE/WEB · expiresAt = now+15 (T5) · capKeyHash แฮช 64 ไม่ใช่ข้อความ basket · คีย์ pub: · held +2 · publicLeft คืนถูก · event hold.created", async () => {
    await needDb();
    const id = await mkDep({ sold: 4 });
    const cap = basket();
    const r = await pubHold(id, 2, { capKey: cap });
    const v = V(r, "placeHold");
    const h = await hold(String(v.holdId));
    eq([h?.purpose, h?.status, h?.channel, h?.qtyPublic, iso(h?.expiresAt), v.publicLeft, v.duplicated, (await inv(id)).held], ["PAYMENT", "ACTIVE", "WEB", 2, addMin(NOW0, 15).toISOString(), 18, false, 2], "แถว/ตัวนับ");
    ok(/^[0-9a-f]{64}$/.test(String(h?.capKeyHash)) && !String(h?.capKeyHash).includes(cap.slice(7)), `capKeyHash: ${h?.capKeyHash}`);
    ok(String(h?.idempotencyKey).startsWith("pub:"), `idempotencyKey: ${h?.idempotencyKey}`);
    eq((await outbox("holdId", String(v.holdId), "trips.hold.created")).length, 1, "event hold.created");
  });
  await st("H-2", "ตัวควบคุมบวก T5: ตั้ง holdMinutes ชั้น PRODUCT = 20 ⇒ expiresAt = now+20 · คืนค่า", async () => {
    await needDb();
    const id = await mkDep();
    await setV([{ key: K.T5, scope: "PRODUCT", scopeId: P.A.id, value: 20 }]);
    try { eq(iso((await hold(hid(await staffHold(id, 1))))?.expiresAt), addMin(NOW0, 20).toISOString(), "expiresAt"); }
    finally { await setV([{ key: K.T5, scope: "PRODUCT", scopeId: P.A.id, value: 15 }]); }
  });
  await st("H-3", "กันซ้ำ: คีย์+คำขอเดิม ⇒ hold เดิม duplicated ไม่นับซ้ำ · คีย์เดิมคำขอต่าง ⇒ IDEMPOTENCY_CONFLICT · คีย์เดียวกันคนละ basket ⇒ hold ใหม่", async () => {
    await needDb();
    const id = await mkDep();
    const ctx = PUB(), cap = basket(), k = key();
    const a = V(await pubHold(id, 2, { ctx, capKey: cap, idk: k }), "ครั้งแรก"), b = V(await pubHold(id, 2, { ctx, capKey: cap, idk: k }), "ซ้ำ");
    eq([b.holdId, b.duplicated, (await inv(id)).held], [a.holdId, true, 2], "ซ้ำ");
    codeR(await pubHold(id, 3, { ctx, capKey: cap, idk: k }), "IDEMPOTENCY_CONFLICT", "คำขอต่าง");
    const c = V(await pubHold(id, 2, { ctx: PUB(), capKey: basket(), idk: k }), "อีก basket");
    ok(c.holdId !== a.holdId && (await inv(id)).held === 4, "namespace ไม่แยก");
  });
  await st("H-4", "10 คำขอคีย์เดียวพร้อมกัน ⇒ hold 1 แถว · held ขยับครั้งเดียว · ทุกคำตอบ holdId เดียวกัน", async () => {
    await needDb();
    const id = await mkDep(); const k = key();
    const rs = await par(10, () => call("placeHold", C(), { departureId: id, qty: 3, idempotencyKey: k }));
    const ids = new Set(rs.map((r) => String(asRec(r.value)?.holdId ?? `x${fmt(r)}`)));
    eq([ids.size, (await holdsOf(id)).length, (await inv(id)).held], [1, 1, 3], "แถว/held");
  });
  await st("H-5", "VALIDATION: คีย์สั้น · qty 0/51/1.5 · ช่องแปลก · PUBLIC ช่องทาง COUNTER · PUBLIC purpose SHOP_CONFIRM · PUBLIC ไม่มี capKey · AGENT ⇒ FORBIDDEN · ไม่มีอะไรเปลี่ยน", async () => {
    await needDb();
    const id = await mkDep();
    const base = { departureId: id, qty: 1, idempotencyKey: key(), capKey: basket() };
    for (const [n, ctx, inp] of [["คีย์สั้น", PUB(), { ...base, idempotencyKey: "abc" }], ["qty0", PUB(), { ...base, qty: 0 }], ["qty51", PUB(), { ...base, qty: 51 }], ["qty1.5", PUB(), { ...base, qty: 1.5 }],
      ["ช่องแปลก", PUB(), { ...base, bogus: 1 }], ["PUBLIC COUNTER", PUB(NOW0, "COUNTER"), base], ["PUBLIC SHOP_CONFIRM", PUB(), { ...base, purpose: "SHOP_CONFIRM" }], ["ไม่มี capKey", PUB(), { departureId: id, qty: 1, idempotencyKey: key() }]] as const)
      codeR(await call("placeHold", ctx, inp), "VALIDATION", n);
    codeR(await call("placeHold", C({ ch: "AGENT_PORTAL", actor: { kind: "AGENT", agentAccountId: "ag", agentUserId: "u" } }), { departureId: id, qty: 1, idempotencyKey: key() }), "FORBIDDEN", "AGENT");
    eq([(await inv(id)).held, (await holdsOf(id)).length], [0, 0], "ไม่เปลี่ยน");
  });
  await st("H-6", "บล็อก: WEB หลังปิดรับ ⇒ CUTOFF_PASSED (COUNTER ยังได้) · CLOSED/CANCELLED/หยุดขาย ⇒ SLOT_CLOSED · เริ่มแล้ว ⇒ CUTOFF_PASSED · ไม่มีอะไรเปลี่ยน", async () => {
    await needDb();
    const a = await mkDep(), cl = await mkDep({ status: "CLOSED" }), ca = await mkDep({ status: "CANCELLED" }), ss = await mkDep({ stopSell: { channels: [], reason: "x" } });
    codeR(await pubHold(a, 1, { now: AFTER_WEB }), "CUTOFF_PASSED", "WEB หลังปิดรับ");
    V(await staffHold(a, 1, { now: AFTER_WEB }), "COUNTER หลังปิดรับเว็บ");
    for (const [n, d] of [["CLOSED", cl], ["CANCELLED", ca], ["หยุดขาย", ss]] as const) codeR(await staffHold(d, 1), "SLOT_CLOSED", n);
    codeR(await staffHold(a, 1, { now: "2027-03-10T12:00:00Z" }), "CUTOFF_PASSED", "เริ่มแล้ว");
    eq([(await inv(a)).held, (await inv(cl)).held, (await inv(ss)).held], [1, 0, 0], "held");
  });
  await st("H-7", "SOLD_OUT + details.publicLeft · โควตาค้าง (reserved) ถูกเคารพ: ความจุ 10 ขาย 4 โควตา 5 ⇒ ขอ 2 ไม่ได้ · ขอ 1 ได้", async () => {
    await needDb();
    const id = await mkDep({ capacity: 10, sold: 4, reserved: 5 });
    const r = await staffHold(id, 2);
    codeR(r, "SOLD_OUT", "ขอ 2"); eq(asRec(r.details)?.publicLeft, 1, "details.publicLeft");
    V(await staffHold(id, 1), "ขอ 1");
    eq([(await inv(id)).held, (await dep(id)).reserved], [1, 5], "held/reserved");
  });
  await st("H-8", "FULL ในคำสั่งเดียว: ถือจนเต็ม ⇒ FULL · ปล่อย ⇒ OPEN · มี minPax และ sold ถึง ⇒ GUARANTEED · มีโควตาค้าง ⇒ ไม่ FULL", async () => {
    await needDb();
    const a = await mkDep({ capacity: 5, sold: 2 }), g = await mkDep({ capacity: 5, sold: 4, minPax: 3, status: "GUARANTEED" }), r = await mkDep({ capacity: 5, sold: 1, reserved: 2 });
    const ha = await staffHold(a, 3), hg = await staffHold(g, 1); await staffHold(r, 2);
    eq([(await dep(a)).status, (await dep(g)).status, (await dep(r)).status], ["FULL", "FULL", "OPEN"], "เต็ม");
    V(await call("releaseHold", C(), { holdId: hid(ha), reason: "ลูกค้าเปลี่ยนใจ" }), "release a"); V(await call("releaseHold", C(), { holdId: hid(hg), reason: "x" }), "release g");
    eq([(await inv(a)).status, (await inv(g)).status], ["OPEN", "GUARANTEED"], "หลังปล่อย");
  });
  await st("H-9", "convertHold: CAS hold → CONVERTED · sold +q held −q ด้วย q ของแถว hold · หลังหมดเวลา (now ฉีด) ⇒ HOLD_EXPIRED ไม่เปลี่ยนอะไร", async () => {
    await needDb();
    const id = await mkDep({ sold: 1 });
    const h1 = hid(await staffHold(id, 3)), h2 = hid(await staffHold(id, 2));
    const v = V(await call("convertHold", C({ now: addMin(NOW0, 5) }), { holdId: h1 }), "convert");
    eq([v.qty, v.sold, (await hold(h1))?.status], [3, 4, "CONVERTED"], "convert");
    codeR(await call("convertHold", C({ now: addMin(NOW0, 16) }), { holdId: h2 }), "HOLD_EXPIRED", "หมดเวลา");
    const d = await inv(id); eq([d.sold, d.held, (await hold(h2))?.status], [4, 2, "ACTIVE"], "ไม่เปลี่ยน");
  });
  await st("H-10", "ผังสถานะ hold: แปลงซ้ำ ⇒ STATE_CONFLICT · ปล่อยหลังแปลง ⇒ STATE_CONFLICT · แปลงหลังปล่อย ⇒ HOLD_EXPIRED · ปล่อยซ้ำ ⇒ duplicated · ตัวนับขยับครั้งเดียว", async () => {
    await needDb();
    const id = await mkDep();
    const a = hid(await staffHold(id, 2)), b = hid(await staffHold(id, 1));
    V(await call("convertHold", C(), { holdId: a }), "แปลง a");
    codeR(await call("convertHold", C(), { holdId: a }), "STATE_CONFLICT", "แปลงซ้ำ");
    codeR(await call("releaseHold", C(), { holdId: a, reason: "x" }), "STATE_CONFLICT", "ปล่อยหลังแปลง");
    V(await call("releaseHold", C(), { holdId: b, reason: "x" }), "ปล่อย b");
    eq(asRec((await call("releaseHold", C(), { holdId: b, reason: "x" })).value)?.duplicated, true, "ปล่อยซ้ำ");
    codeR(await call("convertHold", C(), { holdId: b }), "HOLD_EXPIRED", "แปลงหลังปล่อย");
    const d = await inv(id); eq([d.sold, d.held, (await hold(b))?.releasedReason], [2, 0, "x"], "ตัวนับ");
  });
  await st("H-11", "extendHold: SHOP_CONFIRM ⇒ expiresAt = now ใหม่ + X2 · PAYMENT ⇒ STATE_CONFLICT · หมดเวลาแล้ว ⇒ HOLD_EXPIRED", async () => {
    await needDb();
    const id = await mkDep();
    const sc = hid(await staffHold(id, 1, { purpose: "SHOP_CONFIRM" })), pay = hid(await staffHold(id, 1));
    const t = addMin(NOW0, 60);
    eq(iso(V(await call("extendHold", C({ now: t }), { holdId: sc }), "extend").expiresAt), addMin(t, 720).toISOString(), "ต่ออายุ");
    codeR(await call("extendHold", C({ now: t }), { holdId: pay }), "STATE_CONFLICT", "PAYMENT");
    codeR(await call("extendHold", C({ now: addMin(t, 721) }), { holdId: sc }), "HOLD_EXPIRED", "หมดแล้ว");
  });
  await st("H-12", "SHOP_CONFIRM ใช้ X2 (12 ชม.) ไม่ใช่ T5 · ตัวควบคุมบวก: ตั้ง X2 ชั้น PRODUCT = 2 ⇒ +2 ชม. · คืนค่า", async () => {
    await needDb();
    const id = await mkDep();
    eq(iso((await hold(hid(await staffHold(id, 1, { purpose: "SHOP_CONFIRM" }))))?.expiresAt), addMin(NOW0, 720).toISOString(), "X2 ค่าเริ่ม");
    await setV([{ key: K.X2, scope: "PRODUCT", scopeId: P.A.id, value: 2 }]);
    try { eq(iso((await hold(hid(await staffHold(id, 1, { purpose: "SHOP_CONFIRM" }))))?.expiresAt), addMin(NOW0, 120).toISOString(), "X2 = 2"); }
    finally { await setV([{ key: K.X2, scope: "PRODUCT", scopeId: P.A.id, value: 12 }]); }
  });
  await st("H-13", "0 แถวไม่ถูกปล่อยผ่าน (D.0.2): held ถูกทำให้ไม่ตรง (0) ⇒ convert = STATE_CONFLICT · rollback ทั้ง tx (hold ยัง ACTIVE · sold ไม่เปลี่ยน)", async () => {
    await needDb();
    const id = await mkDep({ sold: 2 });
    const h = hid(await staffHold(id, 2));
    await pool.query(`UPDATE "TripDeparture" SET held = 0 WHERE id = $1`, [id]);
    codeR(await call("convertHold", C(), { holdId: h }), "STATE_CONFLICT", "convert");
    eq([(await hold(h))?.status, (await dep(id)).sold], ["ACTIVE", 2], "rollback");
    await pool.query(`UPDATE "TripDeparture" SET held = 2 WHERE id = $1`, [id]);
  });
  await st("H-14", "convert บนรอบ CANCELLED ⇒ SLOT_CLOSED (hold ยัง ACTIVE) · convert หลังปิดรับ (ถือไว้ก่อน) ⇒ ได้ (§11 ข้อ 9)", async () => {
    await needDb();
    const a = await mkDep(), b = await mkDep();
    const ha = hid(await staffHold(a, 1)), hb = hid(await pubHold(b, 1, { now: "2027-03-09T10:55:00Z" }));
    await pool.query(`UPDATE "TripDeparture" SET status = 'CANCELLED' WHERE id = $1`, [a]);
    codeR(await call("convertHold", C(), { holdId: ha }), "SLOT_CLOSED", "CANCELLED");
    eq((await hold(ha))?.status, "ACTIVE", "hold");
    V(await call("convertHold", C({ now: "2027-03-09T11:05:00Z" }), { holdId: hb }), "convert หลังปิดรับเว็บ ก่อนหมดเวลาถือ");
  });
  groupLine("H");

  // ═══════════════ SW. ตัวกวาด ═══════════════
  console.log("\n── SW: ตัวกวาดหมดเวลา (§D.4 · X5) ──");
  await st("SW-1", "กวาด (now = +16 นาที): hold ครบกำหนด 3 แถว ⇒ EXPIRED · held คืน · hold ยังไม่ครบไม่แตะ · event hold.expired ครั้งเดียวต่อแถว", async () => {
    await needDb();
    const id = await mkDep();
    const due = [hid(await staffHold(id, 1)), hid(await staffHold(id, 2)), hid(await staffHold(id, 1))];
    const later = hid(await staffHold(id, 2, { now: addMin(NOW0, 10) }));
    const r = await sweep(addMin(NOW0, 16));
    ok(Number(r.expired) >= 3, `expired: ${fmt(r)}`);
    eq(await Promise.all([...due, later].map(async (h) => (await hold(h))?.status)), ["EXPIRED", "EXPIRED", "EXPIRED", "ACTIVE"], "สถานะ");
    eq((await inv(id)).held, 2, "held");
    eq(await Promise.all(due.map(async (h) => (await outbox("holdId", h, "trips.hold.expired")).length)), [1, 1, 1], "event");
  });
  await st("SW-2", "ระยะถือแยกตาม purpose (M-3): SHOP_CONFIRM ไม่หลุดที่ +16 นาที · หลุดที่ +12 ชม. 1 นาที", async () => {
    await needDb();
    const id = await mkDep();
    const sc = hid(await staffHold(id, 2, { purpose: "SHOP_CONFIRM" }));
    await sweep(addMin(NOW0, 16));
    eq((await hold(sc))?.status, "ACTIVE", "+16 นาที");
    await sweep(addMin(NOW0, 721));
    eq([(await hold(sc))?.status, (await inv(id)).held], ["EXPIRED", 0], "+12 ชม.");
  });
  await st("SW-3", "การจองที่ผูก: HOLD และ PENDING ⇒ EXPIRED (version +1 · event booking.expired) · CONFIRMED ไม่แตะ", async () => {
    await needDb(); await needTable("TripBooking");
    const id = await mkDep();
    const mkB = async (status: string) => insertRow("TripBooking", { id: rid("bk"), tenantId: tA, unitId: uA, code: `TR-QC-${hex(3)}`, publicTokenHash: hex(32), status, productId: P.A.id, departureId: id, travelDate: DATE,
      channel: "WEB", collectMode: "SHOP", payMethod: "PAY_NOW", marketingEligible: true, contactRoute: "DIRECT", currency: "THB", policySnapshot: "{}", version: 0, updatedAt: new Date() });
    const bH = await mkB("HOLD"), bP = await mkB("PENDING"), bC = await mkB("CONFIRMED");
    for (const b of [bH, bP, bC]) await rawHold(id, { expiresAt: addMin(NOW0, -1), bookingId: b, purpose: b === bP ? "SHOP_CONFIRM" : "PAYMENT" });
    await sweep(NOW0);
    const st2 = async (b: string) => (await q<{ status: string; version: number }>(`SELECT status, version FROM "TripBooking" WHERE id = $1`, [b]))[0];
    eq([await st2(bH), await st2(bP), await st2(bC)], [{ status: "EXPIRED", version: 1 }, { status: "EXPIRED", version: 1 }, { status: "CONFIRMED", version: 0 }], "การจอง");
    eq([(await outbox("bookingId", bH, "trips.booking.expired")).length, (await outbox("bookingId", bC, "trips.booking.expired")).length], [1, 0], "event");
    eq((await inv(id)).held, 0, "held");
  });
  await st("SW-4", "รันซ้ำ = ไม่มีงาน (expired 0) · ตัวนับ/แถว/event ไม่เปลี่ยน", async () => {
    await needDb();
    const id = await mkDep();
    const h = await rawHold(id, { expiresAt: addMin(NOW0, -5), qty: 2 });
    await sweep(NOW0);
    const before = [await dep(id), (await outbox("holdId", h)).length];
    const r = await sweep(NOW0);
    eq([r.expired, await dep(id), (await outbox("holdId", h)).length], [0, ...before], "รันซ้ำ");
  });
  await st("SW-5", "X5: ตัวกวาด 4 ตัวซ้อนกันบน 30 hold ครบกำหนด ⇒ ทุกแถว EXPIRED ครั้งเดียว · held คืนครั้งเดียว · event 1 ต่อแถว", async () => {
    await needDb();
    const id = await mkDep({ capacity: 40 });
    const hs: string[] = []; for (let i = 0; i < 30; i++) hs.push(await rawHold(id, { expiresAt: addMin(NOW0, -1) }));
    await mkDep(); // รอบอื่นในชุดเดียวกัน
    const rs = await withTimer(Promise.all(Array.from({ length: 4 }, () => sweep(NOW0).catch((e) => ({ err: errMsg(e) }) as Rec))), 90_000, "SW-5");
    ok(rs.every((r) => !r.err), `งานล้ม: ${fmt(rs)}`);
    eq([rs.reduce((t, r) => t + Number(r.expired ?? 0), 0), (await inv(id)).held], [30, 0], "รวม expired/held");
    const ev = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'trips.hold.expired' AND payload->>'holdId' = ANY($2::text[])`, [tA, hs]);
    eq(ev[0]?.n, 30, "event");
  });
  await st("SW-6", "tenantIds จำกัดร้าน: hold ครบกำหนดของร้าน B ไม่ถูกแตะเมื่อรันด้วย [ร้าน A]", async () => {
    await needDb();
    const b = await mkDep({ key: "B" });
    const h = await rawHold(b, { expiresAt: addMin(NOW0, -1), tenant: tB, unit: uB });
    await sweep(NOW0);
    eq([(await hold(h))?.status, (await dep(b)).held], ["ACTIVE", 1], "ร้าน B");
    await fn("runExpireHolds")(Z(NOW0), { tenantIds: [tB] });
    eq([(await hold(h))?.status, (await inv(b)).held], ["EXPIRED", 0], "รันร้าน B");
  });
  await st("SW-7", "signal ที่ยกเลิกแล้ว ⇒ ไม่ทำงาน ไม่ค้างครึ่งทาง · มากกว่า 200 แถว (LIMIT 200) ⇒ วนหน้าจนหมด", async () => {
    await needDb();
    const id = await mkDep({ capacity: 260 });
    const hs: string[] = []; for (let i = 0; i < 205; i++) hs.push(await rawHold(id, { expiresAt: addMin(NOW0, -1) }));
    const ac = new AbortController(); ac.abort();
    const r0 = asRec(await fn("runExpireHolds")(Z(NOW0), { tenantIds: [tA], signal: ac.signal })) ?? {};
    eq([Number(r0.expired ?? 0), (await inv(id)).held], [0, 205], "signal ยกเลิก");
    await sweep(NOW0);
    eq([(await inv(id)).held, (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripHold" WHERE id = ANY($1::text[]) AND status = 'EXPIRED'`, [hs]))[0]?.n], [0, 205], "205 แถว");
  });
  await st("SW-8", "รอบ FULL ⇒ กวาดแล้วกลับ OPEN ในคำสั่งเดียวกับคืนตัวนับ", async () => {
    await needDb();
    const id = await mkDep({ capacity: 4, sold: 2 });
    await staffHold(id, 2);
    eq((await dep(id)).status, "FULL", "เต็ม");
    await sweep(addMin(NOW0, 16));
    eq([(await inv(id)).status, (await dep(id)).held], ["OPEN", 0], "หลังกวาด");
  });
  groupLine("SW");

  // ═══════════════ RC. ยิงพร้อมกันบนฐานจริง (MP §5 ก) ═══════════════
  console.log("\n── RC: ยิงพร้อมกัน (ฐานจริง · หลาย connection) ──");
  const raceCheck = async (id: string, s: Sample, what: string) => { ok(s.viol.length === 0, `${what}: ตัวสุ่มอ่านเจอค่าผิด ${s.viol.slice(0, 3).join(" · ")}`); return inv(id, what); };
  const noThrow = (rs: Rec[], what: string, allowed: string[]) => {
    const bad = rs.filter((r) => !(r.ok === true || (r.ok === false && allowed.includes(String(r.code)))));
    ok(bad.length === 0, `${what}: ผลนอกที่อนุญาต ${fmt(bad.slice(0, 2))}`);
    ok(!rs.some(isDeadlockish), `${what}: เจอ deadlock ${fmt(rs.find(isDeadlockish))}`);
  };
  await st("RC-1", "(ก) 50 คำขอถือ 1 ที่พร้อมกันบนรอบว่าง 24 ⇒ สำเร็จ 24 พอดี · 26 ได้ SOLD_OUT · ไม่เกินความจุทุกจังหวะที่สุ่มอ่าน · held = Σ hold ACTIVE · มีหลาย backend ทำงานพร้อมกันจริง", async () => {
    await needDb();
    const id = await mkDep();
    const stop = sampler("TripDeparture", [id]);
    const rs = await withTimer(par(50, () => staffHold(id, 1)), 120_000, "RC-1");
    const s = await stop();
    noThrow(rs, "RC-1", ["SOLD_OUT"]);
    eq([rs.filter((r) => r.ok === true).length, rs.filter((r) => r.code === "SOLD_OUT").length], [24, 26], "สำเร็จ/แพ้");
    const d = await raceCheck(id, s, "RC-1"); eq([d.held, d.status], [24, "FULL"], "held/status");
    ok(s.maxActive >= 2, `ไม่เห็น backend พร้อมกัน (max ${s.maxActive}) — ข้อสอบไม่ได้ยิงพร้อมกันจริง`);
  });
  await st("RC-2", "(ก) ซ้ำ 3 รอบบนรอบใหม่ (ความเสถียร) ⇒ 24/26 ทุกรอบ", async () => {
    await needDb();
    const got: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await mkDep(); const stop = sampler("TripDeparture", [id]);
      const rs = await withTimer(par(50, () => pubHold(id, 1)), 120_000, `RC-2 รอบ ${i + 1}`);
      const s = await stop(); noThrow(rs, "RC-2", ["SOLD_OUT"]); await raceCheck(id, s, "RC-2");
      got.push(`${rs.filter((r) => r.ok === true).length}`);
    }
    eq(got, ["24", "24", "24"], "สำเร็จต่อรอบ");
  });
  await st("RC-3", "(ก) ขนาดปน 1–4 ที่ 50 คำขอ ⇒ ผลรวมที่ได้ ≤ 24 · ผู้แพ้ทุกรายขนาด > ที่เหลือสุดท้าย · ค่าคงที่ทุกจังหวะ", async () => {
    await needDb();
    const id = await mkDep(); const stop = sampler("TripDeparture", [id]);
    const sizes = Array.from({ length: 50 }, (_, i) => (i % 4) + 1);
    const rs = await withTimer(par(50, (i) => staffHold(id, sizes[i])), 120_000, "RC-3");
    const s = await stop(); noThrow(rs, "RC-3", ["SOLD_OUT"]);
    const d = await raceCheck(id, s, "RC-3");
    const won = rs.reduce((t, r, i) => t + (r.ok === true ? sizes[i] : 0), 0); const left = d.capacity - d.sold - d.held - d.reserved;
    const loserMin = Math.min(...rs.map((r, i) => (r.ok === true ? 99 : sizes[i])));
    ok(won === d.held && won <= 24 && left < loserMin, `won ${won} held ${d.held} left ${left} loserMin ${loserMin}`);
  });
  await st("RC-4", "(ก) ถือ + ขายตรง (ถือ→แปลง) + โควตาค้าง 6 ขาย 5: 50 คำขอ ⇒ ไม่เกิน · reserved คงที่ 6 · sold+held ≤ 18", async () => {
    await needDb();
    const id = await mkDep({ sold: 5, reserved: 6 }); const stop = sampler("TripDeparture", [id]);
    const rs = await withTimer(par(50, async (i) => {
      const h = await staffHold(id, 1 + (i % 2));
      if (h.ok !== true || i % 3 !== 0) return h;
      return call("convertHold", C(), { holdId: hid(h) });
    }), 120_000, "RC-4");
    const s = await stop(); noThrow(rs, "RC-4", ["SOLD_OUT"]);
    const d = await raceCheck(id, s, "RC-4");
    ok(d.reserved === 6 && d.sold + d.held <= 18 && d.sold >= 5, `ผล ${fmt(d)}`);
  });
  const prepHolds = async (n: number, cap = 40) => {
    const id = await mkDep({ capacity: cap });
    const hs: string[] = [];
    for (let i = 0; i < n; i++) { const r = await staffHold(id, 1); V(r, "ถือ"); hs.push(hid(r)); }
    return { id, hs };
  };
  const exp = addMin(NOW0, 15);
  await st("RC-5", "แปลง ∥ ตัวกวาด บน hold เดียวกัน (20 คู่) ⇒ แต่ละแถวมีผลเดียว: CONVERTED ⇔ แปลงสำเร็จ · ที่เหลือ EXPIRED · held 0 · sold = จำนวนที่แปลง", async () => {
    const { id, hs } = await prepHolds(20);
    const stop = sampler("TripDeparture", [id]);
    const [conv] = await withTimer(Promise.all([par(20, (i) => call("convertHold", C({ now: addMin(exp, -0.01) }), { holdId: hs[i] })), par(3, () => sweep(addMin(exp, 0.01)).then((r) => ({ ok: true, r }) as Rec))]), 120_000, "RC-5");
    const s = await stop(); noThrow(conv, "RC-5", ["HOLD_EXPIRED"]);
    const sts = await Promise.all(hs.map(async (h) => (await hold(h))?.status));
    const bad = hs.filter((_, i) => (conv[i].ok === true) !== (sts[i] === "CONVERTED") || !["CONVERTED", "EXPIRED"].includes(String(sts[i])));
    ok(bad.length === 0, `ผลไม่ตรง ${bad.length}`);
    const d = await raceCheck(id, s, "RC-5"); eq([d.held, d.sold], [0, conv.filter((r) => r.ok === true).length], "ตัวนับ");
  });
  await st("RC-6", "ยกเลิก (ปล่อย) ∥ ตัวกวาด บน hold เดียวกัน (20 คู่) ⇒ RELEASED ⇔ ปล่อยสำเร็จ (ไม่ duplicated) · held 0 · ไม่มีการคืนซ้ำ", async () => {
    const { id, hs } = await prepHolds(20);
    const stop = sampler("TripDeparture", [id]);
    const [rel] = await withTimer(Promise.all([par(20, (i) => call("releaseHold", C({ now: addMin(exp, 0.01) }), { holdId: hs[i], reason: "ลูกค้ายกเลิก" })), par(3, () => sweep(addMin(exp, 0.01)).then(() => ({ ok: true }) as Rec))]), 120_000, "RC-6");
    const s = await stop(); noThrow(rel, "RC-6", ["HOLD_EXPIRED"]);
    const sts = await Promise.all(hs.map(async (h) => (await hold(h))?.status));
    ok(hs.every((_, i) => (rel[i].ok === true) === (sts[i] === "RELEASED")), `ผลไม่ตรง ${fmt(sts)}`);
    eq((await raceCheck(id, s, "RC-6")).held, 0, "held");
  });
  await st("RC-7", "ปล่อย ∥ แปลง บน hold เดียวกัน (20 คู่) ⇒ ฝ่ายเดียวชนะต่อแถว (แปลงชนะ ⇒ ปล่อย STATE_CONFLICT · ปล่อยชนะ ⇒ แปลง HOLD_EXPIRED) · sold = จำนวน CONVERTED", async () => {
    const { id, hs } = await prepHolds(20);
    const stop = sampler("TripDeparture", [id]);
    const [cv, rl] = await withTimer(Promise.all([par(20, (i) => call("convertHold", C(), { holdId: hs[i] })), par(20, (i) => call("releaseHold", C(), { holdId: hs[i], reason: "x" }))]), 120_000, "RC-7");
    const s = await stop(); noThrow(cv, "RC-7 แปลง", ["HOLD_EXPIRED"]); noThrow(rl, "RC-7 ปล่อย", ["STATE_CONFLICT"]);
    ok(hs.every((_, i) => (cv[i].ok === true) !== (rl[i].ok === true)), "มีแถวที่ชนะทั้งคู่/แพ้ทั้งคู่");
    const d = await raceCheck(id, s, "RC-7"); eq([d.held, d.sold], [0, cv.filter((r) => r.ok === true).length], "ตัวนับ");
  });
  await st("RC-8", "แปลงซ้อน 2 ทางบน hold เดียวกัน (20 แถว) ⇒ ชนะทางเดียวต่อแถว อีกทาง STATE_CONFLICT · sold 20 · held 0", async () => {
    const { id, hs } = await prepHolds(20);
    const stop = sampler("TripDeparture", [id]);
    const [a, b] = await withTimer(Promise.all([par(20, (i) => call("convertHold", C(), { holdId: hs[i] })), par(20, (i) => call("convertHold", C(), { holdId: hs[i] }))]), 120_000, "RC-8");
    const s = await stop(); noThrow([...a, ...b], "RC-8", ["STATE_CONFLICT"]);
    ok(hs.every((_, i) => (a[i].ok === true) !== (b[i].ok === true)), "แปลงสำเร็จสองครั้ง/ไม่สำเร็จเลย");
    const d = await raceCheck(id, s, "RC-8"); eq([d.sold, d.held], [20, 0], "ตัวนับ");
  });
  await st("RC-9", "ย้าย 20 ทางพร้อมกัน สลับทิศ (D1→D2 ×10 · D2→D1 ×10) × 2 ชุด ⇒ ไม่ค้าง (ตัวจับเวลา 90 วิ) ไม่มี 40P01 · ผลรวม sold คงที่ 20 · ไม่เกินความจุ", async () => {
    await needDb();
    const d1 = await mkDep({ capacity: 30, sold: 10 }), d2 = await mkDep({ capacity: 30, sold: 10 });
    const stop = sampler("TripDeparture", [d1, d2]);
    const rs = await withTimer(par(40, (i) => call("moveSold", C(), i % 2 === 0 ? { fromDepartureId: d1, toDepartureId: d2, qty: 1 } : { fromDepartureId: d2, toDepartureId: d1, qty: 1 })), 90_000, "RC-9");
    const s = await stop(); noThrow(rs, "RC-9", ["BUSY"]);
    const a = await raceCheck(d1, s, "RC-9 D1"), b = await raceCheck(d2, s, "RC-9 D2");
    eq(a.sold + b.sold, 20, "ผลรวม sold");
    ok(rs.filter((r) => r.ok === true).length >= 36, `สำเร็จน้อยเกิน (BUSY มาก): ${rs.filter((r) => r.ok === true).length}/40`);
  });
  await st("RC-10", "ร้านลดความจุ (T0.3 setDepartureCapacity) ∥ 30 คำขอถือ ⇒ ไม่เกินทุกจังหวะ · ความจุสุดท้าย ≥ ที่ใช้ · ผลความจุ = ok หรือ CAPACITY_BELOW_USED", async () => {
    await needDb();
    const id = await mkDep({ capacity: 24 }); const stop = sampler("TripDeparture", [id]);
    const caps = [20, 18, 22, 16, 24, 14];
    const [hs, cs] = await withTimer(Promise.all([par(30, () => staffHold(id, 1)), par(caps.length, (i) => call("setDepartureCapacity", { tenantId: tA, actorUserId: U.oa.userId }, { unitId: uA, departureId: id, capacity: caps[i] }))]), 120_000, "RC-10");
    const s = await stop(); noThrow(hs, "RC-10 ถือ", ["SOLD_OUT"]);
    ok(cs.every((r) => r.ok === true || r.code === "CAPACITY_BELOW_USED"), `ผลความจุ: ${fmt(cs)}`);
    const d = await raceCheck(id, s, "RC-10"); eq(d.held, hs.filter((r) => r.ok === true).length, "held");
  });
  await st("RC-11", "คืนที่ขายแล้ว (ยกเลิก) ∥ คำขอถือ บนรอบเต็ม: 5 คืน ∥ 20 ถือ ⇒ ถือได้ ≤ 5 · sold 5 · ไม่เกินทุกจังหวะ", async () => {
    await needDb();
    const id = await mkDep({ capacity: 10, sold: 10, status: "FULL" }); const stop = sampler("TripDeparture", [id]);
    const [rt, hs] = await withTimer(Promise.all([par(5, () => call("returnSold", C(), { departureId: id, qty: 1 })), par(20, () => staffHold(id, 1))]), 120_000, "RC-11");
    const s = await stop(); noThrow(rt, "RC-11 คืน", []); noThrow(hs, "RC-11 ถือ", ["SOLD_OUT"]);
    const d = await raceCheck(id, s, "RC-11"); ok(d.sold === 5 && d.held === hs.filter((r) => r.ok === true).length && d.held <= 5, fmt(d));
  });
  await st("RC-12", "สาธารณะ 40 basket (คนละ clientKey) พร้อมกันบนรอบว่าง 20 ⇒ สำเร็จ 20 พอดี · ที่เหลือ SOLD_OUT · ไม่มี HOLD_LIMIT/RATE_LIMITED", async () => {
    await needDb();
    const id = await mkDep({ capacity: 25, sold: 5 }); const stop = sampler("TripDeparture", [id]);
    const rs = await withTimer(par(40, () => pubHold(id, 1)), 120_000, "RC-12");
    const s = await stop(); noThrow(rs, "RC-12", ["SOLD_OUT"]);
    eq([rs.filter((r) => r.ok === true).length, (await raceCheck(id, s, "RC-12")).held], [20, 20], "สำเร็จ/held");
  });
  groupLine("RC");

  // ═══════════════ DL. ลำดับล็อก §D.5 ═══════════════
  console.log("\n── DL: ลำดับล็อก (เส้นทางสลับของ §D.5 ที่ใบนี้ทำได้ · ตั๋ว = K1.1) ──");
  /** capacityRowsOf คืน CapacityRowRef[] (CC :337) — รับทั้งแบบ array ตรงและแบบ SellResult */
  const rowsRaw = async (ctx: Rec, arg: Rec): Promise<unknown[]> => { const r = await (fn("capacityRowsOf") as AnyFn)(ctx, arg); return Array.isArray(r) ? r : Array.isArray(asRec(r)?.value) ? (asRec(r)?.value as unknown[]) : []; };
  const rowsOf = async (ctx: Rec, depId: string) => rowsRaw(ctx, { productKind: "TRIP", unitId: ctx.unitId, productId: P.A.id, slotId: depId, pax: [] });
  await st("DL-1", "ตะกร้า [D1,D2] ใต้ล็อกเพดาน capKey เดียว ∥ ถือเดี่ยว D2 capKey เดียวกัน · 50 รอบพร้อมกัน ⇒ ไม่มี 40P01 · ตัวนับ = จำนวนที่สำเร็จ", async () => {
    await needDb();
    const d1 = await mkDep({ capacity: 200 }), d2 = await mkDep({ capacity: 200 });
    const ctx = C(); const capKey = basket();
    const rows = asArr(fn("sortCapacityRows")([...(await rowsOf(ctx, d2)), ...(await rowsOf(ctx, d1))]));
    ok(rows.length === 2 && rows.every((r) => r.layer === "1a" && r.table === "TripDeparture"), `capacityRowsOf: ${fmt(rows)}`);
    const intent = { op: "HOLD", qtyPublic: 1, qtyAllot: 0 };
    const basketTx2 = () => inTx(tA, uA, async (tx) => { await fnTx("acquireHoldCapInTx")(tx, ctx, { capKey, mode: "HOLDS", add: 0, limit: 1000 }); for (const r of rows) await (fn("reserveInTx") as AnyFn)(tx, ctx, [r], intent); return { ok: true }; });
    const single = () => inTx(tA, uA, async (tx) => { await fnTx("acquireHoldCapInTx")(tx, ctx, { capKey, mode: "HOLDS", add: 0, limit: 1000 }); await (fn("reserveInTx") as AnyFn)(tx, ctx, [rows.find((r) => r.id === d2)], intent); return { ok: true }; });
    const rs = await withTimer(par(100, (i) => (i % 2 === 0 ? basketTx2() : single())), 120_000, "DL-1");
    noThrow(rs, "DL-1", ["BUSY"]);
    const okB = rs.filter((r, i) => i % 2 === 0 && r.ok === true).length, okS = rs.filter((r, i) => i % 2 === 1 && r.ok === true).length;
    eq([(await dep(d1)).held, (await dep(d2)).held], [okB, okB + okS], "held");
  });
  await st("DL-2", "ตะกร้าสองใบลำดับกลับกัน [D1,D2] / [D2,D1] ผ่าน sortCapacityRows · 30 คู่ ⇒ ไม่มี 40P01 · ไม่ค้าง", async () => {
    await needDb();
    const d1 = await mkDep({ capacity: 200 }), d2 = await mkDep({ capacity: 200 });
    const ctx = C(); const r1 = await rowsOf(ctx, d1), r2 = await rowsOf(ctx, d2);
    const intent = { op: "HOLD", qtyPublic: 1, qtyAllot: 0 };
    const tx = (order: unknown[]) => inTx(tA, uA, async (t) => { for (const r of asArr(fn("sortCapacityRows")(order))) { await (fn("reserveInTx") as AnyFn)(t, ctx, [r], intent); await sleep(3); } return { ok: true }; });
    const rs = await withTimer(par(60, (i) => tx(i % 2 === 0 ? [...r1, ...r2] : [...r2, ...r1])), 120_000, "DL-2");
    noThrow(rs, "DL-2", ["BUSY"]);
    const n = rs.filter((r) => r.ok === true).length;
    eq([(await dep(d1)).held, (await dep(d2)).held], [n, n], "held");
  });
  await st("DL-3", "ยกเลิก (คืน) ∥ ตัวกวาด ∥ คืนโควตา (unreserve) ∥ ยืนยัน (แปลง) บนรอบเดียว 50 รอบ ⇒ ไม่มี 40P01 · ค่าคงที่ D.3 ถูก", async () => {
    await needDb();
    const id = await mkDep({ capacity: 300, sold: 60, reserved: 60 });
    const hs: string[] = []; for (let i = 0; i < 50; i++) { const r = await staffHold(id, 1); V(r, "ถือ"); hs.push(hid(r)); }
    for (let i = 0; i < 25; i++) await rawHold(id, { expiresAt: addMin(NOW0, -1) });
    const stop = sampler("TripDeparture", [id]);
    const ops: (() => Promise<Rec>)[] = [];
    for (let i = 0; i < 50; i++) {
      ops.push(() => call("convertHold", C(), { holdId: hs[i] }));
      ops.push(() => call("returnSold", C(), { departureId: id, qty: 1 }));
      ops.push(() => inTx(tA, uA, (tx) => fnTx("unreserveSeatsInTx")(tx, C(), { departureId: id, qty: 1 }) as Promise<unknown>));
      if (i % 5 === 0) ops.push(() => sweep(NOW0).then(() => ({ ok: true }) as Rec));
    }
    const rs = await withTimer(Promise.all(ops.map((o) => o().catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec))), 150_000, "DL-3");
    const s = await stop(); noThrow(rs, "DL-3", ["BUSY"]);
    const d = await raceCheck(id, s, "DL-3");
    eq([d.reserved, d.held, d.sold], [10, 0, 60], "ตัวนับ (reserved 60−50 · held 0 · sold 60+50−50)");
  });
  await st("DL-4", "ปล่อย (เสนอรายการรอ) ∥ ออกจากรายการรอ ∥ ตัวกวาด บนรอบเดียว ⇒ ไม่มี 40P01 · คนละ ≤ 1 ข้อเสนอ · ค่าคงที่ถูก", async () => {
    await needDb();
    const id = await mkDep({ capacity: 20, sold: 10 });
    const hs: string[] = []; for (let i = 0; i < 10; i++) { const r = await staffHold(id, 1); V(r, "ถือ"); hs.push(hid(r)); }
    const wl: string[] = []; for (let i = 1; i <= 10; i++) wl.push(String(V(await call("joinWaitlist", PUB(), { departureId: id, qty: 1, partyId: PARTY[`a${i}`], idempotencyKey: key() }), "join").waitlistId));
    const stop = sampler("TripDeparture", [id]);
    const rs = await withTimer(Promise.all([
      ...hs.map((h) => call("releaseHold", C(), { holdId: h, reason: "x" })),
      ...wl.slice(5).map((w) => call("leaveWaitlist", C() /* ORACLE-EDIT (ผู้คุม 12 พ.ย.): มติข้อ 9 */, { waitlistId: w })),
      sweep(NOW0).then(() => ({ ok: true }) as Rec),
    ]), 120_000, "DL-4");
    const s = await stop(); noThrow(rs, "DL-4", ["STATE_CONFLICT", "BUSY"]);
    await raceCheck(id, s, "DL-4");
    const offers = await q<{ partyId: string; n: number }>(`SELECT w."partyId", count(h.id)::int AS n FROM "TripWaitlist" w JOIN "TripHold" h ON h.id = w."offerHoldId" WHERE w."departureId" = $1 AND h.status = 'ACTIVE' GROUP BY w."partyId"`, [id]);
    ok(offers.every((o) => o.n <= 1), `ข้อเสนอซ้อน: ${fmt(offers)}`);
  });
  groupLine("DL");

  // ═══════════════ RS. คืน · ย้าย · ครึ่งฝั่งรอบของโควตา · Sellable เฟส 1 ═══════════════
  console.log("\n── RS: คืน/ย้าย/โควตาฝั่งรอบ/เฟส 1 ──");
  const txOn = (name: string, input: Rec, ctx: Rec = C()) => inTx(String(ctx.tenantId), String(ctx.unitId), (tx) => fnTx(name)(tx, ctx, input) as Promise<unknown>);
  await st("RS-1", "returnSold สาธารณะ: sold −2 · FULL → OPEN · คืนเกิน sold ⇒ STATE_CONFLICT ไม่เปลี่ยน", async () => {
    await needDb();
    const id = await mkDep({ capacity: 6, sold: 6, status: "FULL" });
    V(await call("returnSold", C(), { departureId: id, qty: 2 }), "คืน 2");
    eq([(await inv(id)).sold, (await dep(id)).status], [4, "OPEN"], "หลังคืน");
    codeR(await call("returnSold", C(), { departureId: id, qty: 5 }), "STATE_CONFLICT", "คืนเกิน");
    eq((await dep(id)).sold, 4, "ไม่เปลี่ยน");
  });
  await st("RS-2", "returnSold toReserved (D.1 5b ครึ่งรอบ): sold −2 reserved +2 · publicLeft เท่าเดิม", async () => {
    await needDb();
    const id = await mkDep({ sold: 8, reserved: 4 });
    const before = (await avail(id, PUB())).publicLeft;
    V(await txOn("returnSoldInTx", { departureId: id, qty: 2, toReserved: true }), "returnSoldInTx");
    const d = await inv(id); eq([d.sold, d.reserved, (await avail(id, PUB())).publicLeft], [6, 6, before], "ตัวนับ");
  });
  await st("RS-3", "moveSold: ผลรวมคงที่ · ปลายทางเต็ม ⇒ SOLD_OUT ต้นทางไม่เปลี่ยน (rollback) · ปลายทาง CLOSED ⇒ SLOT_CLOSED · ต้นทางไม่พอ ⇒ STATE_CONFLICT", async () => {
    await needDb();
    const a = await mkDep({ sold: 5 }), b = await mkDep({ sold: 2 }), full = await mkDep({ capacity: 3, sold: 3, status: "FULL" }), cl = await mkDep({ status: "CLOSED" });
    V(await call("moveSold", C(), { fromDepartureId: a, toDepartureId: b, qty: 3 }), "ย้าย 3");
    eq([(await inv(a)).sold, (await inv(b)).sold], [2, 5], "หลังย้าย");
    codeR(await call("moveSold", C(), { fromDepartureId: b, toDepartureId: full, qty: 1 }), "SOLD_OUT", "ปลายทางเต็ม");
    codeR(await call("moveSold", C(), { fromDepartureId: b, toDepartureId: cl, qty: 1 }), "SLOT_CLOSED", "ปลายทางปิด");
    codeR(await call("moveSold", C(), { fromDepartureId: a, toDepartureId: b, qty: 9 }), "STATE_CONFLICT", "ต้นทางไม่พอ");
    eq([(await dep(a)).sold, (await dep(b)).sold, (await dep(full)).sold], [2, 5, 3], "ไม่เปลี่ยน");
  });
  await st("RS-4", "reserveSeatsInTx (D.1 7) กันเกินความจุ ⇒ SOLD_OUT · unreserveSeatsInTx เกิน reserved ⇒ STATE_CONFLICT ไม่ปล่อยผ่าน (M-1) · ไม่เปลี่ยน", async () => {
    await needDb();
    const id = await mkDep({ capacity: 10, sold: 3 });
    V(await txOn("reserveSeatsInTx", { departureId: id, qty: 6 }), "จอง 6");
    codeR(await txOn("reserveSeatsInTx", { departureId: id, qty: 2 }), "SOLD_OUT", "เกินความจุ");
    V(await txOn("unreserveSeatsInTx", { departureId: id, qty: 4 }), "คืน 4");
    codeR(await txOn("unreserveSeatsInTx", { departureId: id, qty: 3 }), "STATE_CONFLICT", "คืนเกิน");
    eq((await inv(id)).reserved, 2, "reserved");
  });
  await st("RS-5", "holdFromReservedInTx (D.1 2 ครึ่งรอบ): held +n reserved −n · เกิน reserved / หลังปิดรับ ⇒ INSUFFICIENT_ALLOTMENT · unholdToReservedInTx กลับด้าน", async () => {
    await needDb();
    const id = await mkDep({ capacity: 10, reserved: 4 });
    V(await txOn("holdFromReservedInTx", { departureId: id, qty: 3 }), "ถือจากโควตา");
    let d = await dep(id); eq([d.held, d.reserved], [3, 1], "ตัวนับ");
    codeR(await txOn("holdFromReservedInTx", { departureId: id, qty: 2 }), "INSUFFICIENT_ALLOTMENT", "เกิน");
    codeR(await txOn("holdFromReservedInTx", { departureId: id, qty: 1 }, C({ now: "2027-03-10T00:30:00Z" })), ["INSUFFICIENT_ALLOTMENT", "CUTOFF_PASSED"], "หลังปิดรับ");
    V(await txOn("unholdToReservedInTx", { departureId: id, qty: 3 }), "คืนเข้าโควตา");
    d = await dep(id); eq([d.held, d.reserved], [0, 4], "กลับ");
  });
  await st("RS-6", "capacityRowsOf: บรรทัด ⇒ [{layer 1a · TripDeparture · id}] · {holdId} ⇒ แถวรอบของ hold · reserveInTx HOLD ⇒ held +2 · คืน Reservation {kind TRIP · slotId · qtyPublic 2}", async () => {
    await needDb();
    const id = await mkDep(); const ctx = C();
    const rows = asArr(await rowsOf(ctx, id));
    eq(rows.map((r) => [r.layer, r.table, r.id]), [["1a", "TripDeparture", id]], "บรรทัด");
    const h = hid(await staffHold(id, 1));
    eq(asArr(await rowsRaw(ctx, { holdId: h })).map((r) => r.id), [id], "จาก holdId");
    const r = await inTx(tA, uA, async (tx) => (fn("reserveInTx") as AnyFn)(tx, ctx, rows, { op: "HOLD", qtyPublic: 2, qtyAllot: 0 }));
    const v = asRec(r.value) ?? {};
    eq([r.ok, v.kind, v.slotId, v.qtyPublic, (await dep(id)).held], [true, "TRIP", id, 2, 3], "Reservation");
  });
  await st("RS-7", "reserveInTx เกินที่ว่าง ⇒ SOLD_OUT และ tx ของผู้เรียก rollback (แถวรอบไม่เปลี่ยน แม้ผู้เรียกเขียนอย่างอื่นก่อนหน้า)", async () => {
    await needDb();
    const id = await mkDep({ capacity: 3, sold: 2 }); const ctx = C();
    const rows = asArr(await rowsOf(ctx, id));
    const before = await dep(id);
    const r = await inTx(tA, uA, async (tx) => { await (fn("reserveInTx") as AnyFn)(tx, ctx, rows, { op: "HOLD", qtyPublic: 1, qtyAllot: 0 }); return (fn("reserveInTx") as AnyFn)(tx, ctx, rows, { op: "HOLD", qtyPublic: 1, qtyAllot: 0 }); });
    codeR(r, "SOLD_OUT", "ครั้งที่สอง");
    eq(await dep(id), before, "rollback");
  });
  groupLine("RS");

  // ═══════════════ CAP. เพดานถือ §D.6 ═══════════════
  console.log("\n── CAP: เพดานถือ (§D.6 · N-11) ──");
  const pubC = (now: string | Date = NOW0) => PUB(now, "WEB", uC);
  await st("CAP-1", "basket เดียว: X10 = 3 ⇒ ครั้งที่ 4 HOLD_LIMIT · held ไม่เพิ่ม · basket อื่นยังถือได้", async () => {
    await needDb();
    const id = await mkDep({ key: "C" }); const cap = basket();
    for (let i = 0; i < 3; i++) V(await pubHold(id, 1, { ctx: pubC(), capKey: cap }), `ถือ ${i + 1}`);
    codeR(await pubHold(id, 1, { ctx: pubC(), capKey: cap }), "HOLD_LIMIT", "ครั้งที่ 4");
    V(await pubHold(id, 1, { ctx: pubC(), capKey: basket() }), "basket อื่น");
    eq((await inv(id)).held, 4, "held");
  });
  await st("CAP-2", "นับเฉพาะ ACTIVE ที่ expiresAt > now: hold 3 แถวหมดเวลาแต่ตัวกวาดยังไม่มา ⇒ ถือใหม่ได้ (now = +16 นาที)", async () => {
    await needDb();
    const id = await mkDep({ key: "C" }); const cap = basket();
    for (let i = 0; i < 3; i++) V(await pubHold(id, 1, { ctx: pubC(), capKey: cap }), `ถือ ${i + 1}`);
    V(await pubHold(id, 1, { ctx: pubC(addMin(NOW0, 16)), capKey: cap }), "หลังหมดเวลา");
  });
  await st("CAP-3", "basket เดียว 10 คำขอพร้อมกัน ⇒ สำเร็จ 3 พอดี · 7 HOLD_LIMIT (นับ+INSERT ใต้ advisory lock เดียว)", async () => {
    await needDb();
    const id = await mkDep({ key: "C" }); const cap = basket();
    const rs = await withTimer(par(10, () => pubHold(id, 1, { ctx: pubC(), capKey: cap })), 60_000, "CAP-3");
    noThrow(rs, "CAP-3", ["HOLD_LIMIT"]);
    eq([rs.filter((r) => r.ok === true).length, (await inv(id)).held], [3, 3], "สำเร็จ/held");
  });
  await st("CAP-4", "ตัวควบคุมบวก X10 = 1 (ชั้น UNIT) ⇒ ครั้งที่ 2 HOLD_LIMIT · คืน 3", async () => {
    await needDb();
    const id = await mkDep({ key: "C" }); const cap = basket();
    await setV([{ key: K.X10, scope: "UNIT", scopeId: uC, value: 1 }]);
    try { V(await pubHold(id, 1, { ctx: pubC(), capKey: cap }), "ครั้งแรก"); codeR(await pubHold(id, 1, { ctx: pubC(), capKey: cap }), "HOLD_LIMIT", "ครั้งที่ 2"); }
    finally { await setV([{ key: K.X10, scope: "UNIT", scopeId: uC, value: 3 }]); }
  });
  await st("CAP-5", "ตรวจซ้ำด้วยผู้ติดต่อตอน confirm (rekeyHoldsToContactInTx): ผู้ติดต่อมี 3 แถว ACTIVE ⇒ basket ใหม่ HOLD_LIMIT ไม่แก้ capKeyHash · แถวหมดเวลาไม่นับ", async () => {
    await needDb();
    const id = await mkDep({ key: "C" }); const contact = `contact:${hex(5)}`; const ctx = SYS(NOW0, uC);
    const mine: string[] = [];
    for (let i = 0; i < 3; i++) { const h = hid(await pubHold(id, 1, { ctx: pubC(), capKey: basket() })); mine.push(h); V(await inTx(tA, uC, (tx) => fnTx("rekeyHoldsToContactInTx")(tx, ctx, { holdIds: [h], contactKey: contact }) as Promise<unknown>), `rekey ${i + 1}`); }
    const extra = hid(await pubHold(id, 1, { ctx: pubC(), capKey: basket() }));
    const before = (await hold(extra))?.capKeyHash;
    codeR(await inTx(tA, uC, (tx) => fnTx("rekeyHoldsToContactInTx")(tx, ctx, { holdIds: [extra], contactKey: contact }) as Promise<unknown>), "HOLD_LIMIT", "ครั้งที่ 4");
    eq((await hold(extra))?.capKeyHash, before, "capKeyHash ไม่เปลี่ยน");
    const later = SYS(addMin(NOW0, 16), uC);
    const fresh = hid(await pubHold(id, 1, { ctx: pubC(addMin(NOW0, 16)), capKey: basket() }));
    V(await inTx(tA, uC, (tx) => fnTx("rekeyHoldsToContactInTx")(tx, later, { holdIds: [fresh], contactKey: contact }) as Promise<unknown>), "หลังของเดิมหมดเวลา");
    eq((await hold(mine[0]))?.capKeyHash, (await hold(fresh))?.capKeyHash, "แฮชผู้ติดต่อเดียวกัน");
  });
  await st("CAP-6", "เส้นทางไม่นับ: พนักงานหน้าร้านถือ 5 ครั้ง (ไม่ติด X10) · ข้อเสนอรายการรอไม่ถูกนับในเพดานของใคร", async () => {
    await needDb();
    const id = await mkDep({ key: "C", capacity: 30 });
    for (let i = 0; i < 5; i++) V(await staffHold(id, 1, { unit: uC }), `ถือหน้าร้าน ${i + 1}`);
    const full = await mkDep({ key: "C", capacity: 2, sold: 1 });
    const h = hid(await staffHold(full, 1, { unit: uC }));
    V(await call("joinWaitlist", pubC(), { departureId: full, qty: 1, partyId: PARTY.a14, idempotencyKey: key() }), "join");
    V(await call("releaseHold", C({ unit: uC }), { holdId: h, reason: "x" }), "ปล่อย");
    const offer = (await holdsOf(full)).find((x) => x.purpose === "WAITLIST_OFFER");
    ok(offer, "ไม่มีข้อเสนอ");
    const n = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripHold" WHERE "capKeyHash" = $1 AND status = 'ACTIVE'`, [offer?.capKeyHash]);
    eq(n[0]?.n, 1, "ข้อเสนอใช้ capKeyHash ของตัวเอง ไม่ปนกับ basket ใด");
  });
  await st("CAP-7", "เพดานแบบที่นั่ง (เอเจนซี่ · acquireHoldCapInTx SEATS limit 20): 10 tx พร้อมกัน ขอ 3 ที่ + INSERT hold ใต้ล็อก ⇒ สำเร็จ 6 พอดี (18 ≤ 20)", async () => {
    await needDb();
    const id = await mkDep({ capacity: 60 }); const capKey = `agent:${hex(4)}`; const ctx = SYS();
    const h = String(fn("holdCapKeyHash")(capKey));
    const rs = await withTimer(par(10, () => inTx(tA, uA, async (tx) => {
      const r = asRec(await fnTx("acquireHoldCapInTx")(tx, ctx, { capKey, mode: "SEATS", add: 3, limit: 20 })) ?? {};
      if (r.ok === false) return r;
      const ins = await insertSql("TripHold", { id: rid("h"), tenantId: tA, unitId: uA, departureId: id, channel: "AGENT_PORTAL", qtyPublic: 3, qtyAllot: 0, unitIds: [], purpose: "AGENT_HOLD", capKeyHash: h, requestHash: hex(32), idempotencyKey: `qc:${hex(8)}`, status: "ACTIVE", expiresAt: addMin(NOW0, 60), updatedAt: new Date() });
      const keep: unknown[] = [];
      const sql = ins.sql.replace(/\$(\d+)/g, (_, d: string) => { const v = ins.params[Number(d) - 1]; if (Array.isArray(v)) return "'{}'::text[]"; keep.push(v); return `$${keep.length}`; });
      await (asRec(tx)?.$executeRawUnsafe as AnyFn).call(tx, sql, ...keep);
      return { ok: true };
    })), 60_000, "CAP-7");
    noThrow(rs, "CAP-7", ["HOLD_LIMIT"]);
    eq(rs.filter((r) => r.ok === true).length, 6, "สำเร็จ");
  });
  groupLine("CAP");

  // ═══════════════ WL. รายการรอ ═══════════════
  console.log("\n── WL: รายการรอ + เสนอที่ (ภาพ 07ก · X4) ──");
  const joinWl = async (depId: string, party: string, qty = 1, now: string | Date = NOW0) => call("joinWaitlist", PUB(now), { departureId: depId, qty, partyId: PARTY[party], idempotencyKey: key() });
  const wl = async (id: string) => (await q<Rec>(`SELECT id, status, "offerHoldId", "offerExpiresAt", qty FROM "TripWaitlist" WHERE id = $1`, [id]))[0];
  const wlId = (r: Rec) => String(asRec(r.value)?.waitlistId ?? "");
  /** รอบเต็มที่มี hold ของร้าน n ที่ (ไว้ปล่อย) */
  const fullDep = async (cap: number, heldQty: number) => { const id = await mkDep({ capacity: cap, sold: cap - heldQty }); const h = hid(await staffHold(id, heldQty)); return { id, h }; };
  await st("WL-1", "join เมื่อเต็ม ⇒ WAITING position 1,2 · ยังมีที่พอ ⇒ STATE_CONFLICT + details.publicLeft · listWaitlist ไม่มีข้อมูลบุคคล", async () => {
    await needDb();
    const { id } = await fullDep(6, 2);
    const a = V(await joinWl(id, "a1", 2), "join 1"), b = V(await joinWl(id, "a2"), "join 2");
    eq([a.status, a.position, b.position], ["WAITING", 1, 2], "position");
    const open = await mkDep({ capacity: 6, sold: 3 });
    const r = await joinWl(open, "a1", 2); codeR(r, "STATE_CONFLICT", "ยังว่าง"); eq(asRec(r.details)?.publicLeft, 3, "publicLeft");
    const l = V(await call("listWaitlist", C(), { departureId: id }), "listWaitlist");
    ok(!/สมหญิง|08\d{8}/.test(JSON.stringify(l)), `มีข้อมูลบุคคล: ${fmt(l)}`);
  });
  await st("WL-2", "join ซ้ำคนเดิม ⇒ แถวเดิม duplicated · party ร้านอื่น ⇒ NOT_FOUND · หลังปิดรับเว็บ ⇒ CUTOFF_PASSED · รอบยกเลิก ⇒ SLOT_CLOSED", async () => {
    await needDb();
    const { id } = await fullDep(4, 1);
    const a = V(await joinWl(id, "a3"), "join"), b = V(await joinWl(id, "a3"), "join ซ้ำ");
    eq([b.waitlistId, b.duplicated], [a.waitlistId, true], "ซ้ำ");
    codeR(await joinWl(id, "b1"), "NOT_FOUND", "party ร้าน B");
    codeR(await joinWl(id, "a4", 1, AFTER_WEB), "CUTOFF_PASSED", "ปิดรับ");
    const ca = await mkDep({ status: "CANCELLED", capacity: 2, sold: 2 });
    codeR(await joinWl(ca, "a4"), "SLOT_CLOSED", "ยกเลิก");
  });
  await st("WL-3", "FIFO เมื่อปล่อยที่: ปล่อย 2 ⇒ คนแรก (2 ที่) OFFERED · hold WAITLIST_OFFER channel WEB expiresAt = now+30 (T9) · คนที่สองยัง WAITING · held คงที่ · event waitlist.offered", async () => {
    await needDb();
    const { id, h } = await fullDep(6, 2);
    const w1 = wlId(await joinWl(id, "a1", 2)), w2 = wlId(await joinWl(id, "a2"));
    const t = addMin(NOW0, 5);
    V(await call("releaseHold", C({ now: t }), { holdId: h, reason: "ลูกค้ายกเลิก" }), "ปล่อย");
    const r1 = await wl(w1), r2 = await wl(w2);
    const oh = await hold(String(r1?.offerHoldId));
    eq([r1?.status, r2?.status, oh?.purpose, oh?.channel, oh?.qtyPublic, iso(oh?.expiresAt), iso(r1?.offerExpiresAt), (await inv(id)).held], ["OFFERED", "WAITING", "WAITLIST_OFFER", "WEB", 2, addMin(t, 30).toISOString(), addMin(t, 30).toISOString(), 2], "ข้อเสนอ");
    const ev = await outbox("waitlistId", w1, "trips.waitlist.offered");
    eq([ev.length, Object.keys(ev[0]?.payload ?? {}).sort()], [1, ["departureId", "holdId", "waitlistId"]], "event");
  });
  await st("WL-4", "FIFO เคร่ง: หัวคิวขอ 3 · คนถัดไปขอ 1 · ว่าง 1 ⇒ ไม่เสนอใคร (ไม่ข้ามหัวคิว)", async () => {
    await needDb();
    const { id, h } = await fullDep(6, 1);
    const w1 = wlId(await joinWl(id, "a5", 3)), w2 = wlId(await joinWl(id, "a6", 1));
    V(await call("releaseHold", C(), { holdId: h, reason: "x" }), "ปล่อย");
    eq([(await wl(w1))?.status, (await wl(w2))?.status, (await inv(id)).held], ["WAITING", "WAITING", 0], "ไม่เสนอ");
  });
  await st("WL-5", "เสนอโดยตัวกวาด: hold หมดเวลา ⇒ ที่ว่าง ⇒ คนแรก OFFERED ในรอบกวาดเดียวกัน (expiresAt = now ของตัวกวาด + 30)", async () => {
    await needDb();
    const { id } = await fullDep(5, 1);
    const w = wlId(await joinWl(id, "a7"));
    const t = addMin(NOW0, 16);
    const r = await sweep(t);
    const row = await wl(w);
    eq([row?.status, iso(row?.offerExpiresAt), (await inv(id)).held], ["OFFERED", addMin(t, 30).toISOString(), 1], "ข้อเสนอ");
    ok(Number(r.offered ?? 0) >= 1, `offered: ${fmt(r)}`);
  });
  await st("WL-6", "เสนอเมื่อความจุเพิ่ม: ร้านเพิ่มความจุ 2 ⇒ runWaitlistOffers ⇒ คนแรก OFFERED · รันซ้ำไม่เสนอซ้ำ", async () => {
    await needDb();
    const id = await mkDep({ capacity: 4, sold: 4, status: "FULL" });
    const w1 = wlId(await joinWl(id, "a8")), w2 = wlId(await joinWl(id, "a9"));
    await pool.query(`UPDATE "TripDeparture" SET capacity = 5, status = 'OPEN' WHERE id = $1`, [id]);
    await fn("runWaitlistOffers")(Z(NOW0), { tenantIds: [tA] });
    await fn("runWaitlistOffers")(Z(NOW0), { tenantIds: [tA] });
    eq([(await wl(w1))?.status, (await wl(w2))?.status, (await holdsOf(id)).filter((x) => x.purpose === "WAITLIST_OFFER").length, (await inv(id)).held], ["OFFERED", "WAITING", 1, 1], "ข้อเสนอ");
  });
  await st("WL-7", "ข้อเสนอหมดเวลา ⇒ แถว EXPIRED + hold EXPIRED ⇒ เสนอคนถัดไปในรอบกวาดเดียวกัน", async () => {
    await needDb();
    const { id, h } = await fullDep(5, 1);
    const w1 = wlId(await joinWl(id, "a10")), w2 = wlId(await joinWl(id, "a11"));
    V(await call("releaseHold", C(), { holdId: h, reason: "x" }), "ปล่อย");
    const o1 = String((await wl(w1))?.offerHoldId);
    await sweep(addMin(NOW0, 31));
    const r2 = await wl(w2);
    eq([(await wl(w1))?.status, (await hold(o1))?.status, r2?.status, (await inv(id)).held], ["EXPIRED", "EXPIRED", "OFFERED", 1], "ส่งต่อ");
  });
  await st("WL-8", "ไม่เสนอเมื่อปิดรับเว็บแล้ว: ปล่อยหลังปิดรับ ⇒ ไม่มีข้อเสนอ · runWaitlistOffers ⇒ WAITING → EXPIRED", async () => {
    await needDb();
    const { id, h } = await fullDep(5, 1);
    const w = wlId(await joinWl(id, "a12"));
    V(await call("releaseHold", C({ now: AFTER_WEB }), { holdId: h, reason: "x" }), "ปล่อย");
    eq([(await wl(w))?.status, (await holdsOf(id)).filter((x) => x.purpose === "WAITLIST_OFFER").length], ["WAITING", 0], "ไม่เสนอ");
    await fn("runWaitlistOffers")(Z(AFTER_WEB), { tenantIds: [tA] });
    eq((await wl(w))?.status, "EXPIRED", "หมดอายุ");
  });
  await st("WL-9", "คนเดียวไม่ได้ 2 ข้อเสนอในรอบเดียว: join ซ้ำ + ที่ว่างเกิดหลายครั้ง ⇒ ข้อเสนอของ party นั้น = 1 · DECLINED แล้วไม่ถูกเสนอซ้ำอัตโนมัติ", async () => {
    await needDb();
    const id = await mkDep({ capacity: 6, sold: 3 });
    const hs = [hid(await staffHold(id, 1)), hid(await staffHold(id, 1)), hid(await staffHold(id, 1))];
    const w = wlId(await joinWl(id, "a13")); await joinWl(id, "a13");
    for (const h of hs.slice(0, 2)) V(await call("releaseHold", C(), { holdId: h, reason: "x" }), "ปล่อย");
    const offers = async () => q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripHold" WHERE "departureId" = $1 AND purpose = 'WAITLIST_OFFER'`, [id]);
    eq([(await offers())[0]?.n, (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripWaitlist" WHERE "departureId" = $1 AND "partyId" = $2`, [id, PARTY.a13]))[0]?.n], [1, 1], "ข้อเสนอ/แถว");
    V(await call("declineWaitlistOffer", C() /* ORACLE-EDIT (ผู้คุม 12 พ.ย.): มติรอบแก้ข้อ 9 — PUBLIC ถูกปฏิเสธจนกว่าจะมี token ของรายการรอ (T1/W1) */, { waitlistId: w }), "ปฏิเสธ");
    V(await call("releaseHold", C(), { holdId: hs[2], reason: "x" }), "ปล่อยอีก");
    await fn("runWaitlistOffers")(Z(NOW0), { tenantIds: [tA] });
    eq([(await wl(w))?.status, (await offers())[0]?.n], ["DECLINED", 1], "ไม่เสนอซ้ำ");
  });
  await st("WL-10", "ปฏิเสธข้อเสนอ ⇒ DECLINED + hold RELEASED + เสนอคนถัดไป · ออกจากคิว WAITING ⇒ CANCELLED · ปฏิเสธแถว WAITING ⇒ STATE_CONFLICT", async () => {
    await needDb();
    const { id, h } = await fullDep(5, 1);
    const w1 = wlId(await joinWl(id, "a1")), w2 = wlId(await joinWl(id, "a2")), w3 = wlId(await joinWl(id, "a3"));
    V(await call("releaseHold", C(), { holdId: h, reason: "x" }), "ปล่อย");
    codeR(await call("declineWaitlistOffer", C() /* ORACLE-EDIT (ผู้คุม 12 พ.ย.): มติรอบแก้ข้อ 9 — PUBLIC ถูกปฏิเสธจนกว่าจะมี token ของรายการรอ (T1/W1) */, { waitlistId: w3 }), "STATE_CONFLICT", "ปฏิเสธแถว WAITING");
    const o1 = String((await wl(w1))?.offerHoldId);
    V(await call("declineWaitlistOffer", C() /* ORACLE-EDIT (ผู้คุม 12 พ.ย.): มติรอบแก้ข้อ 9 — PUBLIC ถูกปฏิเสธจนกว่าจะมี token ของรายการรอ (T1/W1) */, { waitlistId: w1 }), "ปฏิเสธ");
    V(await call("leaveWaitlist", C() /* ORACLE-EDIT (ผู้คุม 12 พ.ย.): มติข้อ 9 */, { waitlistId: w3 }), "ออก");
    eq([(await wl(w1))?.status, (await hold(o1))?.status, (await wl(w2))?.status, (await wl(w3))?.status, (await inv(id)).held], ["DECLINED", "RELEASED", "OFFERED", "CANCELLED", 1], "ผล");
  });
  await st("WL-11", "X4: onWaitlistTrigger ด้วย event เดียวกันซ้ำ 3 ครั้ง (2 พร้อมกัน + 1 ตามหลัง) ⇒ ข้อเสนอ 1 · event waitlist.offered 1", async () => {
    await needDb();
    const id = await mkDep({ capacity: 4, sold: 4, status: "FULL" });
    const w = wlId(await joinWl(id, "a4"));
    await pool.query(`UPDATE "TripDeparture" SET sold = 3, status = 'OPEN' WHERE id = $1`, [id]);
    const evt = { id: rid("ev"), tenantId: tA, unitId: uA, type: "trips.hold.expired", idempotencyKey: `trips.hold.expired:${hex(4)}`, payload: { holdId: rid("hx"), departureId: id, qty: 1, channel: "WEB" }, createdAt: new Date() };
    await Promise.all([fn("onWaitlistTrigger")(evt), fn("onWaitlistTrigger")(evt)]);
    await fn("onWaitlistTrigger")(evt);
    eq([(await wl(w))?.status, (await holdsOf(id)).filter((x) => x.purpose === "WAITLIST_OFFER").length, (await outbox("waitlistId", w, "trips.waitlist.offered")).length, (await inv(id)).held], ["OFFERED", 1, 1, 1], "ครั้งเดียว");
  });
  await st("WL-12", "แปลง hold ของข้อเสนอ ⇒ แถวรายการรอ ACCEPTED · sold +1", async () => {
    await needDb();
    const { id, h } = await fullDep(5, 1);
    const w = wlId(await joinWl(id, "a5"));
    V(await call("releaseHold", C(), { holdId: h, reason: "x" }), "ปล่อย");
    V(await call("convertHold", C(), { holdId: String((await wl(w))?.offerHoldId) }), "แปลง");
    eq([(await wl(w))?.status, (await inv(id)).sold], ["ACCEPTED", 5], "ACCEPTED");
  });
  groupLine("WL");

  // ═══════════════ X1. แยกร้าน/หน่วย ═══════════════
  console.log("\n── X1: แยกร้าน/หน่วย ──");
  await st("X1-1", "รอบของร้าน B ผ่าน ctx ร้าน A (getAvailability · placeHold · joinWaitlist) ⇒ NOT_FOUND ข้อความเดียวกับ id ที่ไม่มีจริง · ไม่เปลี่ยนอะไร", async () => {
    await needDb();
    const b = await mkDep({ key: "B" });
    const ghost = rid("ghost");
    for (const [n, f] of [["getAvailability", (d: string) => call("getAvailability", PUB(), { departureId: d })], ["placeHold", (d: string) => staffHold(d, 1)], ["joinWaitlist", (d: string) => joinWl(d, "a1")]] as const) {
      const r1 = await f(b), r2 = await f(ghost);
      codeR(r1, "NOT_FOUND", `${n} ร้าน B`); codeR(r2, "NOT_FOUND", `${n} ไม่มีจริง`);
      eq(r1.messageTh, r2.messageTh, `${n} ข้อความ`);
    }
    eq([(await dep(b)).held, (await holdsOf(b)).length], [0, 0], "ร้าน B");
  });
  await st("X1-2", "หน่วยอื่นของร้านเดียวกัน (uA2) และหน่วย BOOKING ⇒ NOT_FOUND บนรอบของ uA", async () => {
    await needDb();
    const id = await mkDep();
    codeR(await call("placeHold", C({ unit: uA2 }), { departureId: id, qty: 1, idempotencyKey: key() }), "NOT_FOUND", "uA2");
    codeR(await call("getAvailability", C({ unit: uBk }), { departureId: id }), "NOT_FOUND", "BOOKING");
    eq((await dep(id)).held, 0, "ไม่เปลี่ยน");
  });
  await st("X1-3", "hold ของร้าน B: convert/release/extend ผ่าน ctx ร้าน A ⇒ HOLD_NOT_FOUND · แถวไม่เปลี่ยน", async () => {
    await needDb();
    const b = await mkDep({ key: "B" });
    const h = await rawHold(b, { expiresAt: addMin(NOW0, 30), tenant: tB, unit: uB, purpose: "SHOP_CONFIRM" });
    for (const [n, inp] of [["convertHold", { holdId: h }], ["releaseHold", { holdId: h, reason: "x" }], ["extendHold", { holdId: h }]] as const) codeR(await call(n, C(), inp), "HOLD_NOT_FOUND", n);
    eq([(await hold(h))?.status, (await dep(b)).held], ["ACTIVE", 1], "ไม่เปลี่ยน");
  });
  await st("X1-4", "returnSold/moveSold ข้ามร้าน ⇒ NOT_FOUND · ย้ายข้ามหน่วย (uA → uA2) ⇒ NOT_FOUND · listAvailability สินค้าร้าน B ⇒ ว่างหรือ NOT_FOUND", async () => {
    await needDb();
    const a = await mkDep({ sold: 3 }), b = await mkDep({ key: "B", sold: 3 }), a2 = await mkDep({ key: "A2", sold: 1 });
    codeR(await call("returnSold", C(), { departureId: b, qty: 1 }), "NOT_FOUND", "returnSold");
    codeR(await call("moveSold", C(), { fromDepartureId: a, toDepartureId: b, qty: 1 }), "NOT_FOUND", "moveSold ข้ามร้าน");
    codeR(await call("moveSold", C(), { fromDepartureId: a, toDepartureId: a2, qty: 1 }), "NOT_FOUND", "moveSold ข้ามหน่วย");
    const l = await call("listAvailability", PUB(), { productId: P.B.id, from: DATE, to: DATE });
    ok((l.ok === true && Array.isArray(l.value) && l.value.length === 0) || l.code === "NOT_FOUND", `listAvailability: ${fmt(l)}`);
    eq([(await dep(a)).sold, (await dep(b)).sold, (await dep(a2)).sold], [3, 3, 1], "ไม่เปลี่ยน");
  });
  groupLine("X1");

  // ═══════════════ X7. rate limit ═══════════════
  console.log("\n── X7: rate limit ถือที่สาธารณะ ──");
  await st("X7-1", "clientKey เดียว: 10 ครั้ง/ชม. (X8) ⇒ ครั้งที่ 11 RATE_LIMITED retryable · id ที่ไม่มี/ของร้าน B กินโควตาและได้ NOT_FOUND ข้อความเดียวกัน · พนักงานไม่ถูกจำกัด", async () => {
    await needDb();
    const id = await mkDep({ key: "C", capacity: 40 }), b = await mkDep({ key: "B" });
    const ck = `ck${hex()}`; const ctx = () => PUB(NOW0, "WEB", uC, ck);
    const rs: Rec[] = [];
    for (let i = 0; i < 10; i++) rs.push(await pubHold(i < 6 ? id : i < 8 ? rid("ghost") : b, 1, { ctx: ctx() }));
    ok(rs.slice(0, 6).every((r) => r.ok === true), `6 ครั้งแรก: ${fmt(rs.slice(0, 6))}`);
    ok(rs.slice(6).every((r) => r.code === "NOT_FOUND") && new Set(rs.slice(6).map((r) => r.messageTh)).size === 1, `id ไม่มี/ร้าน B: ${fmt(rs.slice(6))}`);
    const r11 = await pubHold(id, 1, { ctx: ctx() });
    codeR(r11, "RATE_LIMITED", "ครั้งที่ 11"); eq(r11.retryable, true, "retryable");
    codeR(await pubHold(rid("ghost"), 1, { ctx: ctx() }), "RATE_LIMITED", "ครั้งที่ 12 (id ไม่มี)");
    for (let i = 0; i < 12; i++) V(await staffHold(id, 1, { unit: uC }), `พนักงาน ${i + 1}`);
  });
  await st("X7-2", "ตัวควบคุมบวก X8: ตั้ง holdPerHourPerContact = 12 ⇒ ครั้งที่ 11–12 ผ่าน · 13 RATE_LIMITED · คืนค่า", async () => {
    await needDb();
    const id = await mkDep({ key: "C", capacity: 40 });
    await setV([{ key: K.X8, scope: "UNIT", scopeId: uC, value: { holdPerHourPerContact: 12, otpPer15Min: 5, tokenPerHourPerDevice: 30 } }]);
    try {
      const ck = `ck${hex()}`; const rs: Rec[] = [];
      for (let i = 0; i < 13; i++) rs.push(await pubHold(id, 1, { ctx: PUB(NOW0, "WEB", uC, ck) }));
      eq(rs.map((r) => (r.ok === true ? "ok" : String(r.code))), [...Array(12).fill("ok"), "RATE_LIMITED"], "ผล");
    } finally { await setV([{ key: K.X8, scope: "UNIT", scopeId: uC, value: { holdPerHourPerContact: 10, otpPer15Min: 5, tokenPerHourPerDevice: 30 } }]); }
  });
  groupLine("X7");

  // ═══════════════ EV. event + X8 ═══════════════
  console.log("\n── EV: event (3 ทะเบียน · ไม่มีข้อมูลบุคคล) ──");
  await st("EV-1", "hold.created / hold.expired: payload ตรงชุด {holdId departureId qty channel} · qty = รวม · key …:<holdId>", async () => {
    await needDb();
    const id = await mkDep();
    const h = hid(await staffHold(id, 3));
    await sweep(addMin(NOW0, 16));
    const evs = await outbox("holdId", h);
    eq(evs.map((e) => e.type).sort(), ["trips.hold.created", "trips.hold.expired"], "ชนิด");
    for (const e of evs) { eq(Object.keys(e.payload).sort(), ["channel", "departureId", "holdId", "qty"], `${e.type} keys`); eq([e.payload.qty, e.payload.channel, e.idempotencyKey], [3, "COUNTER", `${e.type}:${h}`], `${e.type} ค่า`); }
  });
  await st("EV-2", "booking.expired payload ⊆ {bookingId unitId departureId status channel amountSatang agentAccountId} มี bookingId/departureId/status · waitlist.offered ตรงชุด", async () => {
    await needDb();
    const evs = await q<{ type: string; payload: Rec }>(`SELECT type, payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type IN ('trips.booking.expired', 'trips.waitlist.offered')`, [tA]);
    const be = evs.filter((e) => e.type === "trips.booking.expired"), wo = evs.filter((e) => e.type === "trips.waitlist.offered");
    ok(be.length > 0 && wo.length > 0, `ยังไม่มี event (SW-3/WL ต้องผ่านก่อน): booking.expired ${be.length} · waitlist.offered ${wo.length}`);
    const allow = new Set(["bookingId", "unitId", "departureId", "status", "channel", "amountSatang", "agentAccountId"]);
    for (const e of be) ok(Object.keys(e.payload).every((k) => allow.has(k)) && ["bookingId", "departureId", "status"].every((k) => k in e.payload), `booking.expired: ${fmt(e.payload)}`);
    for (const e of wo) eq(Object.keys(e.payload).sort(), ["departureId", "holdId", "waitlistId"], "waitlist.offered");
  });
  await st("EV-3", "X8: ทุก event trips.* ของร้านทดสอบไม่มีชื่อ/เบอร์/อีเมล/partyId/capKey ดิบ", async () => {
    await needDb();
    const evs = await q<{ type: string; payload: Rec }>(`SELECT type, payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type LIKE 'trips.%'`, [tA]);
    ok(evs.length > 0, "ไม่มี event ให้ตรวจ");
    const partyIds = Object.values(PARTY);
    const bad = evs.filter((e) => { const s = JSON.stringify(e.payload); return /สมหญิง|@|(?<![0-9A-Za-z_])0[689]\d{8}(?![0-9A-Za-z])|basket:|contact:/.test(s) /* ORACLE-EDIT EV-3 (ผู้คุม 12 พ.ย.): เดิม /08\d{8}/ ชนเลขสุ่มใน holdId (th_…0840239416…) = ผลลวง — จับเฉพาะเบอร์ที่เป็นคำเดี่ยว */ || partyIds.some((p) => s.includes(p)); });
    ok(bad.length === 0, `มีข้อมูลบุคคล: ${fmt(bad.slice(0, 2))}`);
  });
  await st("EV-4", "แถว TripHold/TripWaitlist ไม่เก็บ capKey/ผู้ติดต่อดิบ (capKeyHash = hex 64 ทุกแถวของร้านทดสอบ)", async () => {
    await needDb();
    const rows = await q<{ c: string }>(`SELECT "capKeyHash" AS c FROM "TripHold" WHERE "tenantId" = $1 AND "idempotencyKey" NOT LIKE 'qc:%'`, [tA]);
    ok(rows.length > 0, "ไม่มีแถวให้ตรวจ");
    ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.c)), `capKeyHash ผิดรูป: ${fmt(rows.find((r) => !/^[0-9a-f]{64}$/.test(r.c)))}`);
  });
  groupLine("EV");

  // ═══════════════ R. seed ═══════════════
  console.log("\n── R: seed (อ่านอย่างเดียว) ──");
  await st("R-1", "รอบของร้าน seed ทุกรอบ: ตัวนับ ≥ 0 · sold+held+reserved ≤ capacity · held = Σ hold ACTIVE", async () => {
    await needTable("TripDeparture"); await needTable("TripHold");
    const seedT = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug IN ('andaman-dive', 'andaman-aquarium')`)).map((r) => r.id);
    const rows = await q<DepRow & { s: number }>(`SELECT d.id, d.capacity, d.sold, d.held, d.reserved, d.status, d.version, COALESCE((SELECT sum(h."qtyPublic" + h."qtyAllot") FROM "TripHold" h WHERE h."departureId" = d.id AND h.status = 'ACTIVE'), 0)::int AS s FROM "TripDeparture" d WHERE d."tenantId" = ANY($1::text[])`, [seedT]);
    ok(rows.length > 0, "ร้าน seed ยังไม่มีรอบ (seed ของ T0.3 ยังไม่รัน)");
    const bad = rows.filter((r) => r.sold < 0 || r.held < 0 || r.reserved < 0 || r.sold + r.held + r.reserved > r.capacity || r.held !== r.s);
    ok(bad.length === 0, `ผิด ${bad.length}: ${fmt(bad.slice(0, 2))}`);
  });
  await st("R-2", "seed ไม่เขียน TripHold/TripWaitlist ตรง (§8 ค่าเริ่ม: ไม่เพิ่ม) · ไม่มีเงิน", () => {
    const s = stripComments(read("scripts/seed-trips-qc.mts"));
    ok(s, "ไม่มี seed");
    ok(!/tripHold\.|tripWaitlist\.|INSERT\s+INTO\s+"Trip(Hold|Waitlist)"/i.test(s), "seed เขียน TripHold/TripWaitlist ตรง");
    ok(!/placeHold|joinWaitlist/.test(s), "seed ถือที่/รายการรอ (§8 ค่าเริ่ม: ไม่เพิ่ม · §11 ข้อ 6)");
  });
  groupLine("R");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); await dropControlTables(); await rateKeysCleanup(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T0.4 · ที่ว่าง · ถือที่ · ตัดที่ · ตัวกวาด · เพดาน · รายการรอ =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
