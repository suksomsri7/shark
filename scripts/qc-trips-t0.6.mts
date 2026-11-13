// QC — TRIPS T0.6 · การจอง: ตะกร้า · ถือ → ยืนยันในธุรกรรมเดียว · ผังสถานะ · เลขจอง · โค้ดส่วนลดครั้งเดียว · แก้ไข/เลื่อนวัน · ยกเลิกก่อนจ่าย
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/T0.6.md · ledger/TRIPS-CORE-CONTRACT.md §C §D.0–§D.6 §F.2 §G §J.1 §K · wo-notes trips-T0.4.md / -review-r2 §(d) · trips-T0.5.md / -review-r3 · MP :174 (ก)(ข)(ง)
//
// กลุ่มข้อ:
//   PC ตัวควบคุมบวก (เขียวก่อนมีงาน)   S ไฟล์/facade/กติกาโค้ด (เทียบ BASE_SHA)   ST ผังสถานะบริสุทธิ์ (ตารางเต็ม)   NU เลขจอง
//   H ถือผ่านตะกร้า   CF ยืนยัน   PR โค้ดส่วนลด (ครั้งเดียว · ล้ม = rollback)   CN ยกเลิกก่อนจ่าย   MV แก้คน/เลื่อนวัน   BK platform/basket
//   RC ยิงพร้อมกัน (ที่สุดท้าย · ยืนยัน∥ตัวกวาด · ยกเลิก∥อนุมัติ)   NC ไม่มี connection ที่สองในธุรกรรม (14 ขนาน · pool 10)
//   X1 แยกร้าน/หน่วย   PM สิทธิ์   EV event/audit   SD seed (อ่านอย่างเดียว)   LT ข้อที่ใช้นาฬิกาปลาย (ตัวกวาดข้ามร้าน — รันท้ายสุด)
//
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t06-*` ลบใน finally + กวาดค้างตอนเริ่ม (แบบ qc-trips-t0.4/t0.5) · ตารางควบคุม `_qc_t06_ctl_*` · ไม่แตะร้าน seed (SD อ่านอย่างเดียว)
// 🔴 สินค้า/ประเภทคน/รายการเสริม/รอบ/ราคา สร้างด้วย SQL ดิบตามรูปตาราง T0.1 · ราคา/hold/ตัวนับ ผ่านบริการ T0.4/T0.5 ที่ merge แล้ว · การจองผ่านบริการ T0.6 เท่านั้น
// 🔴 นาฬิกา = ctx.now (ตัวกวาด runExpireHolds เป็นงานข้ามร้าน — ใช้เฉพาะกลุ่ม LT ท้ายไฟล์ ด้วยนาฬิกาที่ไกลกว่าทุกข้อก่อนหน้า)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t0.6.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมี T0.6: PC เขียว · S-14/S-15 เขียวได้ (ยังไม่มีการแก้) · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t0.6";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** ปลาย wip/trips-t0.6 ตอนเขียนข้อสอบ (session/trips + T0.1–T0.5) — ฐานของ S-14/S-15 */
const BASE_SHA = "2fd4c150910a4a1824fd8dbab6b05e3c0ed69e14";

loadTripsQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
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
const stripStrings = (s: string) => s.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""');
const THAI = /[฀-๿]/;
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t06qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const tok = () => randomBytes(24).toString("base64url"); // token ตะกร้าของหน้าจอง (32 ตัว)
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SLUG = "trips-t06-";
const EMAIL_PREFIX = "trips-t06-";
const CTL_PREFIX = "_qc_t06_ctl_";
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const addMin = (d: Date | string, m: number) => new Date(new Date(d).getTime() + m * 60_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const refPeriod = (ymd: string) => `${String((Number(ymd.slice(0, 4)) + 543) % 100).padStart(2, "0")}${ymd.slice(5, 7)}`;
const halfUpBp = (a: number, bp: number) => Number((BigInt(2) * BigInt(a) * BigInt(bp) + BigInt(10_000)) / BigInt(20_000));

// ═══════════════ ตัวเลขอ้างอิง (ฟิกซ์เจอร์ · README · สัญญา) ═══════════════
const R = FX.PRODUCT_RACHA;
const B0142 = FX.BOOKING_TR_0142;
const RC = FX.RECEIPT_RC_0588;
const README = read("ledger/design-trips/README.md");
const EXPECTED = (() => { try { return JSON.parse(read("scripts/trips-expected.json")) as Rec; } catch { return {} as Rec; } })();
const TOTAL_0142 = B0142.totalSatang; // 1,145,000 (README :31)
const PARK_0142 = B0142.parkSatang; // 150,000
const VAT_0142 = RC.vatSatang; // 65,093 (จอ 13ค)
const SNAP_KEYS_N = 35; // CC §N.3 "trips.booking" (ใบ T0.5 §7)

// ═══════════════ สเปก (ใบสั่ง T0.6 §1 §3–§5) ═══════════════
const D = "src/lib/modules/trips/";
const OWN = ["state.ts", "booking-core.ts", "numbering.ts", "booking.ts", "booking-actions.ts"].map((f) => D + f).concat(["src/lib/platform/basket.ts"]);
const PURE = [D + "state.ts", D + "booking-core.ts"];
const FNS = ["canTransitionBooking", "initialBookingStatus", "contactKeyOf", "bookingPeriodOf", "formatBookingCode", "nextSeqInTx", "nextBookingCodeInTx",
  "holdTrips", "confirmTrips", "bookTripsNow", "cancelTripBooking", "approveTripBooking", "changeTripBooking", "getTripBooking", "listTripBookings",
  "transitionBookingInTx", "finalizeTripsInTx", "prepareTripConfirm", "onTripBookingExpired"];
const CONSTS = ["BOOKING_STATUSES", "BOOKING_TERMINAL_STATUSES", "BOOKING_TRANSITIONS", "BOOKING_CODE_RE"];
const STATUSES = ["HOLD", "PENDING", "CONFIRMED", "PART_PAID", "PAID", "EXPIRED", "CANCELLED", "TRAVELLED", "NO_SHOW"];
const TERMINAL = ["EXPIRED", "CANCELLED", "TRAVELLED", "NO_SHOW"];
const ACTORS = ["PUBLIC", "AGENT", "STAFF", "SYSTEM"];
/** ตารางคาดของ CC §G.1 :685–:697 (ใบสั่ง §3) — [from, to[], actors[]] */
const TRANS: [string, string[], string[]][] = [
  ["NEW", ["HOLD", "PENDING", "CONFIRMED"], ["PUBLIC", "AGENT", "STAFF"]],
  ["HOLD", ["CONFIRMED", "PART_PAID", "PAID"], ["SYSTEM", "STAFF"]],
  ["HOLD", ["EXPIRED"], ["SYSTEM"]], ["PENDING", ["EXPIRED"], ["SYSTEM"]],
  ["HOLD", ["CANCELLED"], ["PUBLIC", "AGENT", "STAFF", "SYSTEM"]], ["PENDING", ["CANCELLED"], ["PUBLIC", "AGENT", "STAFF", "SYSTEM"]],
  ["PENDING", ["HOLD", "CONFIRMED"], ["STAFF", "SYSTEM"]],
  ["CONFIRMED", ["PART_PAID", "PAID"], ["SYSTEM", "STAFF"]], ["PART_PAID", ["PAID"], ["SYSTEM", "STAFF"]],
  ...(["CONFIRMED", "PART_PAID", "PAID"].map((f) => [f, ["CANCELLED", "TRAVELLED"], ["STAFF", "SYSTEM"]] as [string, string[], string[]])),
  ...(["CONFIRMED", "PART_PAID", "PAID"].map((f) => [f, ["NO_SHOW"], ["STAFF"]] as [string, string[], string[]])),
  ["NO_SHOW", ["TRAVELLED"], ["STAFF"]],
];
const allowed = (f: string, t: string, a: string) => TRANS.some(([ff, ts, as]) => ff === f && ts.includes(t) && as.includes(a));
const EVENTS = ["trips.booking.created", "trips.booking.confirmed", "trips.booking.cancelled", "trips.booking.changed"];
const PAYLOAD_KEYS = ["amountSatang", "bookingId", "channel", "departureId", "status", "unitId"];
const PERM_KEYS = ["trips.booking.view", "trips.booking.create", "trips.booking.edit", "trips.booking.approve", "trips.booking.cancel"];
const SOLD_ST = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
const SELL_CODES = ["VALIDATION", "NOT_FOUND", "FORBIDDEN", "KIND_NOT_SUPPORTED", "CURRENCY_NOT_ALLOWED", "SOLD_OUT", "INSUFFICIENT_ALLOTMENT", "BERTH_TAKEN", "SLOT_CLOSED", "CUTOFF_PASSED",
  "PRICE_CHANGED", "BELOW_MIN_SELL_PRICE", "DISCOUNT_OVER_CAP", "HOLD_EXPIRED", "HOLD_NOT_FOUND", "HOLD_LIMIT", "AGENT_SUSPENDED", "CREDIT_LIMIT", "REQUIRES_APPROVAL",
  "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "BUSY", "STATE_CONFLICT"];
const NOW0 = "2027-03-01T03:00:00.000Z"; // ก่อนปิดรับเว็บของทุกรอบในไฟล์ (รอบ ≥ 10 มี.ค. · T6 ค่าเริ่ม 1 วันก่อน 18:00)
const NOW_RC = "2027-03-03T03:00:00.000Z"; // กลุ่ม RC-3 (ตัวกวาด) — หลังทุก hold ของกลุ่มก่อนหน้าหมดอายุแล้ว
const NOW_LATE = "2027-03-05T03:00:00.000Z"; // กลุ่ม LT

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 40 });
const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
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

// ═══════════════ ร้านชั่วคราว + กวาด (แบบ t0.4/t0.5: ลบเฉพาะแถวของร้านชั่วคราว slug trips-t06-*) ═══════════════
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
async function rateKeysCleanup() { try { await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, ["trips:hold:t06qc_%"]); } catch { /* ไม่มี */ } }
const tenantIds: string[] = [];

// ═══════════════ ตัวสุ่มอ่านค่าคงที่ระหว่างยิง ═══════════════
type Sample = { n: number; viol: string[] };
function sampler(table: string, ids: string[]): () => Promise<Sample> {
  let stop = false; const viol: string[] = []; let n = 0;
  const loop = (async () => {
    while (!stop) {
      try {
        const rows = await q<{ id: string; capacity: number; sold: number; held: number; reserved: number }>(`SELECT id, capacity, sold, held, reserved FROM "${table}" WHERE id = ANY($1::text[])`, [ids]);
        for (const r of rows) if (r.sold < 0 || r.held < 0 || r.reserved < 0 || r.sold + r.held + r.reserved > r.capacity) viol.push(`${r.id.slice(-6)} c${r.capacity} s${r.sold} h${r.held}`);
        n++;
      } catch { await sleep(5); }
    }
  })();
  return async () => { stop = true; await loop; return { n, viol }; };
}
const withTimer = async <T,>(p: Promise<T>, ms: number, what: string): Promise<T> => {
  let t: NodeJS.Timeout | undefined;
  try { return await Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new AssertFail(`${what}: ค้างเกิน ${ms / 1000} วินาที (สงสัย pool ค้าง/รอล็อกไม่จบ)`)), ms); })]); }
  finally { if (t) clearTimeout(t); }
};
const badOutcome = (r: Rec) => r.ok === "THROW" || r.code === "BUSY" || /40P01|deadlock|P2028|P2034|55P03|Transaction already closed|Unable to start a transaction/i.test(`${r.e ?? ""} ${r.pg ?? ""}`);

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers(); await dropControlTables(); await rateKeysCleanup();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const SET = SETI.mod;
  const DBI = await tryImport("@/lib/core/db");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name} (T0.6 ยังไม่สร้าง)`); return f as AnyFn; };
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e), pg: String((e as { code?: unknown }).code ?? "") }; }
  };
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const VA = (r: Rec, what: string): Rec[] => { ok(r.ok === true && Array.isArray(r.value), `${what}: ${fmt(r)}`); return asArr(r.value); };
  const codeR = (r: Rec, code: string | string[], what: string, reason?: string) => {
    const cs = Array.isArray(code) ? code : [code];
    ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`);
    if (reason) eq(asRec(r.details)?.reason, reason, `${what} details.reason`);
  };
  /** ฟังก์ชันใน tx ภายใต้ tx ของข้อสอบ (tenantDb) · error ที่มี code ของ SellErrorCode ⇒ {ok:false, code} */
  const inTx = async (tenantId: string, unitId: string, body: (tx: unknown) => Promise<unknown>): Promise<Rec> => {
    const td = DBI.mod?.tenantDb;
    if (typeof td !== "function") throw new AssertFail(`โหลด tenantDb ไม่ได้ (${DBI.err.slice(0, 80)})`);
    const db = asRec((td as AnyFn)({ tenantId, unitId })) ?? {};
    const tr = db.$transaction as ((f: (tx: unknown) => Promise<unknown>, o?: Rec) => Promise<unknown>) | undefined;
    if (typeof tr !== "function") throw new AssertFail("tenantDb ไม่มี $transaction");
    try { const r = await tr.call(db, body, { timeout: 60_000, maxWait: 60_000 }); return asRec(r) ?? { ok: true, value: r }; }
    catch (e) { const c = (e as { code?: unknown }).code; const det = asRec((e as { details?: unknown }).details); return typeof c === "string" && SELL_CODES.includes(c) ? { ok: false, code: c, details: det ?? {}, thrown: true } : { ok: "THROW", e: errMsg(e), pg: String(c ?? "") }; }
  };
  const par = async (n: number, f: (i: number) => Promise<Rec>): Promise<Rec[]> => Promise.all(Array.from({ length: n }, (_, i) => f(i).catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec)));

  // ═══════════════ PC. ตัวควบคุมบวก ═══════════════
  console.log("\n── PC: ตัวควบคุมบวก (ตารางของข้อสอบเอง) ──");
  const CTL = `${CTL_PREFIX}${STAMP}`, CTLN = `${CTL_PREFIX}n_${STAMP}`, CTLC = `${CTL_PREFIX}c_${STAMP}`;
  let ctlReady = "";
  try {
    await pool.query(`CREATE TABLE "${CTL}" (id text PRIMARY KEY, capacity int NOT NULL, sold int NOT NULL DEFAULT 0, held int NOT NULL DEFAULT 0, reserved int NOT NULL DEFAULT 0)`);
    await pool.query(`CREATE TABLE "${CTLN}" (id serial PRIMARY KEY, grp text NOT NULL, seq int NOT NULL)`);
    await pool.query(`CREATE TABLE "${CTLC}" (grp text PRIMARY KEY, seq int NOT NULL)`);
  } catch (e) { ctlReady = errMsg(e); }
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed andaman-dive อยู่ · สร้างตารางควบคุมได้", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = 'andaman-dive'`))[0]?.n, 1, "ร้าน andaman-dive");
    ok(!ctlReady, `สร้างตารางควบคุมไม่ได้: ${ctlReady}`);
  });
  await st("PC-2", "ฟิกซ์เจอร์/README: TR-6911-0142 = 2×3,500 + 2,450 + อุทยาน 1,500 + กล้อง 500 = 11,450 · VAT 650.93 · งวดเลขจอง = เดือนเดินทาง พ.ศ. (0142 → 6911 · LB-7002-0031 → 7002)", () => {
    eq(B0142.adults * R.adultSatang + B0142.children * R.childSatang + B0142.parkSatang + R.extras.camera.satang, TOTAL_0142, "ยอด 0142");
    eq(Number((BigInt(2) * BigInt(RC.serviceInclVatSatang) * BigInt(RC.vatBp) + BigInt(10_000 + RC.vatBp)) / BigInt(2 * (10_000 + RC.vatBp))), VAT_0142, "VAT ต่อเอกสาร");
    ok(/TR-6911-0142/.test(README) && /LB-7002-0031/.test(README), "README ไม่มีเลขจองตัวอย่าง");
    eq([refPeriod(B0142.date), refPeriod(FX.TRIP_SIMILAN.start), refPeriod("2026-12-31"), refPeriod("2027-01-01")], ["6911", "7002", "6912", "7001"], "งวด");
  });
  await st("PC-3", "ตัวควบคุม: เลขแบบ max+1 (อ่านแล้วเขียน) ชนกันภายใต้ 30 คำขอพร้อมกัน (≤ 3 ครั้ง · ไม่ชน = control inconclusive)", async () => {
    ok(!ctlReady, `ไม่มีตารางควบคุม: ${ctlReady}`);
    const seen: number[] = [];
    for (let a = 0; a < 3; a++) {
      const g = `g${a}${hex(2)}`;
      await Promise.all(Array.from({ length: 30 }, async () => {
        const c = await pool.connect();
        try { const m = (await c.query<{ m: number }>(`SELECT COALESCE(max(seq),0)::int AS m FROM "${CTLN}" WHERE grp = $1`, [g])).rows[0]?.m ?? 0; await c.query(`SELECT pg_sleep(0.01)`); await c.query(`INSERT INTO "${CTLN}" (grp, seq) VALUES ($1, $2)`, [g, m + 1]); } finally { c.release(); }
      }));
      const d = (await q<{ n: number }>(`SELECT (count(*) - count(DISTINCT seq))::int AS n FROM "${CTLN}" WHERE grp = $1`, [g]))[0]?.n ?? 0;
      seen.push(d);
      if (d > 0) return;
    }
    throw new AssertFail(`control inconclusive: ซ้ำ ${seen.join("/")} — ข้อสอบยิงพร้อมกันอาจไม่จริงพอ`);
  });
  await st("PC-4", "ตัวควบคุม: คำสั่งเดียว INSERT … ON CONFLICT DO UPDATE SET seq = seq + 1 RETURNING (CC §K :995) 50 พร้อมกัน ⇒ 1..50 ไม่ซ้ำไม่ขาด", async () => {
    ok(!ctlReady, `ไม่มีตารางควบคุม: ${ctlReady}`);
    const g = `a${hex(3)}`;
    const r = await Promise.all(Array.from({ length: 50 }, async () => (await q<{ seq: number }>(`INSERT INTO "${CTLC}" (grp, seq) VALUES ($1, 1) ON CONFLICT (grp) DO UPDATE SET seq = "${CTLC}".seq + 1 RETURNING seq`, [g]))[0]?.seq ?? -1));
    eq([...r].sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1), "ลำดับ");
  });
  await st("PC-5", "ตัวควบคุม: ล็อกสลับลำดับ (A: r1→r2 · B: r2→r1) ⇒ Postgres ตอบ 40P01", async () => {
    ok(!ctlReady, `ไม่มีตารางควบคุม: ${ctlReady}`);
    const r1 = rid("c1"), r2 = rid("c2");
    await pool.query(`INSERT INTO "${CTL}" (id, capacity) VALUES ($1, 1), ($2, 1)`, [r1, r2]);
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
  await st("PC-6", "ตัวควบคุม: ผู้ถือ tx ที่ขอ connection ที่สองจาก pool เดียวกัน (max 3 · 3 tx ขนาน) ⇒ ค้างจนตัวจับเวลาของข้อสอบจับได้ (ตัวตรวจ NC มองเห็นอาการ pool ค้างจริง)", async () => {
    const small = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 0 });
    const held: pg.PoolClient[] = [];
    let stalled = false;
    try {
      for (let i = 0; i < 3; i++) { const c = await small.connect(); await c.query("BEGIN"); held.push(c); }
      try { await withTimer(Promise.all(held.map(() => small.connect().then((c2) => { c2.release(); }))), 3_000, "PC-6"); } catch (e) { stalled = e instanceof AssertFail; }
    } finally { for (const c of held) { await c.query("ROLLBACK").catch(() => undefined); c.release(); } await small.end().catch(() => undefined); }
    ok(stalled, "ไม่ค้าง — ตัวตรวจ pool ใช้ไม่ได้");
  });
  await st("PC-7", "ตัวสุ่มอ่านจับค่าผิดได้: ตั้ง held > capacity ชั่วขณะ ⇒ viol > 0", async () => {
    ok(!ctlReady, `ไม่มีตารางควบคุม: ${ctlReady}`);
    const id = rid("c7"); await pool.query(`INSERT INTO "${CTL}" (id, capacity) VALUES ($1, 5)`, [id]);
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
  await st("S-1", "ไฟล์เจ้าของครบ: state · booking-core · numbering · booking · booking-actions · platform/basket", () => {
    const miss = OWN.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
  await st("S-2", `facade ส่งออก ${FNS.length} ฟังก์ชัน + ${CONSTS.length} ค่าคงที่ · บล็อก "// TRIPS T0.6 ▸" · ไม่มี export *`, () => {
    const t = needTrips();
    const miss = FNS.filter((n) => typeof t[n] !== "function").concat(CONSTS.filter((n) => t[n] === undefined));
    ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 10).join(", ")}`);
    const idx = read(D + "index.ts");
    ok(/\/\/\s*TRIPS T0\.6 ▸/.test(idx), "ไม่มีบล็อก // TRIPS T0.6 ▸ … ◂");
    ok(!/export\s*\*\s*from/.test(stripComments(idx)), "มี export * ใน facade");
  });
  await st("S-3", "state.ts + booking-core.ts บริสุทธิ์ (import ได้แค่ zod / import type / ./state ./booking-core) · numbering.ts ไม่ import db/settings", () => {
    const bad: string[] = [];
    for (const f of PURE) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      for (const m of s.matchAll(/^import\s+(?!type\b)[^;]*?from\s*["']([^"']+)["']/gm)) if (!["zod", "./state", "./booking-core"].includes(m[1])) bad.push(`${f}→${m[1]}`);
      if (/\b(prisma|tenantDb|\$queryRaw|\$transaction|Date\.now\(\)|new Date\(\))/.test(s)) bad.push(`${f}: ไม่บริสุทธิ์`);
    }
    const n = srcOf(D + "numbering.ts"); if (!n) bad.push("numbering.ts(ไม่มีไฟล์)");
    if (/from\s*["']@\/lib\/core\/(db|settings)["']/.test(n)) bad.push("numbering.ts import db/settings");
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-4", "booking-actions.ts: \"use server\" · ส่งออกเฉพาะ async function · requireUnit + assertCan · ไม่รับ now", () => {
    const raw = read(D + "booking-actions.ts"); ok(raw, "ยังไม่มีไฟล์");
    const s = stripComments(raw);
    ok(/^\s*["']use server["'];?/.test(s.trimStart()), "ไม่ขึ้นต้น \"use server\"");
    const exps = [...s.matchAll(/^export\s+(?!async\s+function\b)(\S+)/gm)].map((m) => m[1]);
    ok(exps.length === 0, `export ที่ไม่ใช่ async function: ${exps.join(", ")}`);
    ok(/assertCan\(/.test(s) && /requireUnit\(/.test(s), "ไม่มี requireUnit/assertCan (F6)");
    ok(!/\bnow\s*:/.test(stripStrings(s)), "action รับ/ส่ง now");
  });
  await st("S-5", "ไม่มี any · console.* · DELETE / .delete( ในไฟล์ของใบ (ไม่ลบแถว Trip*)", () => {
    const bad: string[] = [];
    for (const f of OWN) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (/(:\s*any\b|\bas\s+any\b|<any>|any\[\])/.test(s)) bad.push(`${f}: any`);
      if (/\bconsole\.(log|info|warn|error|debug)\s*\(/.test(s)) bad.push(`${f}: console`);
      if (/\.(delete|deleteMany)\s*\(|DELETE\s+FROM/i.test(s)) bad.push(`${f}: ลบแถว`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-6", "import ของ booking/numbering/basket: @/lib/core/* zod @prisma/client ./ node:crypto + facade party/approval เท่านั้น · ไม่มี prisma ดิบ (F5 +0) · ไม่แตะ pos/hotel/dorm/booking/queue", () => {
    const bad: string[] = [];
    const okSpec = (sp: string) => sp.startsWith("@/lib/core/") || sp === "zod" || sp === "@prisma/client" || sp.startsWith("./") || sp === "node:crypto" || sp === "@/lib/modules/party" || sp === "@/lib/modules/approval";
    for (const f of [D + "booking.ts", D + "numbering.ts", D + "booking-actions.ts"]) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(s)) bad.push(`${f}: prisma ดิบ`);
      for (const m of s.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g)) if (!okSpec(m[1]) && !(f.endsWith("actions.ts") && (m[1].startsWith("@/lib/") || m[1].startsWith("next/")))) bad.push(`${f}→${m[1]}`);
      for (const m of s.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) if (!okSpec(m[1])) bad.push(`${f}→${m[1]}`);
    }
    const b = srcOf("src/lib/platform/basket.ts");
    if (b && /@\/lib\/modules\/(pos|hotel|rooms|dorm|booking|queue)\b/.test(b)) bad.push("basket.ts แตะโมดูลต้องห้าม");
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-7", "ทุกคำสั่งเปลี่ยนสถานะการจอง = CAS: UPDATE \"TripBooking\" SET \"status\" … WHERE มี \"status\" + \"version\" + RETURNING · ไม่มี ORM tripBooking.update(Many) ที่แตะ status (ตัวควบคุม regex ต้องจับโค้ดผิดได้)", () => {
    const badOf = (s: string): string[] => {
      const out: string[] = [];
      for (const m of s.matchAll(/UPDATE\s+"TripBooking"[^`]*?SET([\s\S]*?)`/g)) {
        const [set, where = ""] = m[1].split(/\bWHERE\b/i);
        if (!/"status"\s*=/.test(set)) continue;
        if (!/"status"\s*(=|IN)/.test(where) || !/"version"\s*=/.test(where) || !/RETURNING/i.test(where)) out.push("CAS ไม่ครบ");
      }
      for (const m of s.matchAll(/tripBooking\.(update|updateMany|upsert)\s*\(([\s\S]{0,400}?)\)\s*;/g)) if (/\bstatus\b/.test(m[2])) out.push(`ORM ${m[1]} status`);
      return out;
    };
    eq(badOf("await tx.$queryRaw`UPDATE \"TripBooking\" SET \"status\" = 'CANCELLED' WHERE \"id\" = ${id}`;\nawait tx.tripBooking.update({ where: { id }, data: { status: 'PAID' } });").length, 2, "ตัวควบคุม regex");
    const s = srcOf(D + "booking.ts"); ok(s, "ยังไม่มี booking.ts");
    ok(/UPDATE\s+"TripBooking"/.test(s), "ไม่พบคำสั่ง UPDATE \"TripBooking\"");
    const bad = [D + "booking.ts", D + "numbering.ts"].flatMap((f) => badOf(srcOf(f)).map((x) => `${f}: ${x}`));
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-8", "OQ18: ไม่ส่ง object ของผู้เรียกเข้า Prisma data (data: input/req/args/body/raw/p.data · ...input ใน data) · zod strict ใน booking.ts + booking-core.ts", () => {
    const bad: string[] = [];
    for (const f of [D + "booking.ts", D + "booking-core.ts", D + "numbering.ts"]) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (/\bdata\s*:\s*(input|req|args|body|raw|params|payload|p\.data|parsed\.data)\b/.test(s)) bad.push(`${f}: data = object ผู้เรียก`);
      if (/\bdata\s*:\s*\{\s*\.\.\.(input|req|args|body|raw|params|payload|p\.data)\b/.test(s)) bad.push(`${f}: ...object ผู้เรียกใน data`);
    }
    ok(/(z\.strictObject\(|\.strict\(\))/.test(srcOf(D + "booking.ts") + srcOf(D + "booking-core.ts")), "ไม่มี zod strict");
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-9", "เลขจอง = คำสั่งเดียว CC §K :995 (INSERT \"SellCounter\" … ON CONFLICT (\"tenantId\",\"series\",\"period\") DO UPDATE SET \"seq\" = \"SellCounter\".\"seq\" + 1 RETURNING) · ไม่มี max(/count( ทำเลข", () => {
    const s = srcOf(D + "numbering.ts"); ok(s, "ยังไม่มี numbering.ts");
    ok(/INSERT\s+INTO\s+"SellCounter"[\s\S]{0,400}?ON\s+CONFLICT\s*\(\s*"tenantId"\s*,\s*"series"\s*,\s*"period"\s*\)\s*DO\s+UPDATE\s+SET\s+"seq"\s*=\s*"SellCounter"\."seq"\s*\+\s*1[\s\S]{0,80}?RETURNING/i.test(s), "ไม่ใช่คำสั่ง CC §K");
    const bad = [D + "numbering.ts", D + "booking.ts"].filter((f) => /\b(max|count)\s*\(\s*"?(seq|code)"?/i.test(srcOf(f)) || /pg_advisory_xact_lock[\s\S]{0,200}max\(/i.test(srcOf(f)));
    ok(bad.length === 0, `ใช้ max/count ทำเลข: ${bad.join(", ")}`);
  });
  await st("S-10", "ไม่มีค่าธุรกิจตายตัว: prefix \"TR\"/\"LB\" · ชั่วโมงยืนยัน/นาทีถือ/เพดานถือ เป็นตัวเลข · ระดับกฎหมาย BLOCK", () => {
    const bad: string[] = [];
    for (const f of [D + "booking.ts", D + "booking-core.ts", D + "numbering.ts", D + "state.ts"]) {
      const raw = srcOf(f); if (!raw) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (/["'`](TR|LB|TK)["'`]/.test(raw)) bad.push(`${f}: prefix ตายตัว`);
      const s = stripStrings(raw);
      for (const m of s.matchAll(/\b(holdMinutes|shopConfirmHours|holdCap\w*|codePrefix|confirmMode)\s*[:=]\s*[0-9"']/g)) bad.push(`${f}: ${m[0]}`);
      if (/\bBLOCK\b/.test(raw) && /legal/i.test(raw)) bad.push(`${f}: ระดับ BLOCK`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-11", "ฟังก์ชัน *InTx ของ booking.ts ไม่เปิด connection เอง: ไม่มี quoteTrips/buildTripBookingSnapshot/capacityRowsOf/loadCapacityPolicies/resolveSettings/safeFindOrCreate/requestStatuses/tenantDb/runTx/$transaction ในตัวฟังก์ชัน", () => {
    const s = srcOf(D + "booking.ts"); ok(s, "ยังไม่มี booking.ts");
    const heads = [...s.matchAll(/(?:export\s+)?async\s+function\s+(\w+InTx)\s*\(/g)];
    ok(heads.length >= 2, `พบ *InTx แค่ ${heads.length} (ต้องมี transitionBookingInTx + finalizeTripsInTx)`);
    const bad: string[] = [];
    for (const h of heads) {
      const start = h.index ?? 0; const rest = s.slice(start + h[0].length);
      const end = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+|\nexport\s+const\s+/);
      const body = end < 0 ? rest : rest.slice(0, end);
      for (const k of ["quoteTrips(", "buildTripBookingSnapshot(", "capacityRowsOf(", "loadCapacityPolicies(", "resolveSettings", "safeFindOrCreate(", "requestStatuses(", "tenantDb(", "runTx(", "$transaction("]) if (body.includes(k)) bad.push(`${h[1]}: ${k}`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-12", "event 4 ตัวลง 3 ทะเบียน (ป้ายไทย) · consumer trips.booking.expired เรียก onTripBookingExpired", async () => {
    const cons = stripComments(read("src/lib/outbox-consumers.ts"));
    const ae = asArr((await tryImport("@/lib/automation/labels")).mod?.AUTOMATION_EVENTS), we = asArr((await tryImport("@/lib/webhooks/labels")).mod?.WEBHOOK_EVENTS);
    const bad: string[] = [];
    for (const e of EVENTS) {
      if (!new RegExp(`["']${e.replace(/\./g, "\\.")}["']\\s*:`).test(cons)) bad.push(`${e}(consumer)`);
      const a = ae.find((x) => x.value === e); if (!a || !THAI.test(String(a.label))) bad.push(`${e}(automation)`);
      if (!we.some((x) => x.value === e)) bad.push(`${e}(webhook)`);
    }
    const i = cons.indexOf(`"trips.booking.expired"`);
    if (i < 0 || !/onTripBookingExpired/.test(cons.slice(i, i + 500))) bad.push("trips.booking.expired ไม่เรียก onTripBookingExpired");
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-13", "สิทธิ์ 5 คีย์ trips.booking.* ในโมดูล trips (ป้ายไทย)", async () => {
    const P = (await tryImport("@/lib/core/permissions")).mod;
    const isKey = P?.isPermissionKey as ((k: string) => boolean) | undefined, label = P?.permissionLabel as ((k: string) => string) | undefined, mod = P?.moduleOfPermissionKey as ((k: string) => string) | undefined;
    ok(isKey && label && mod, "โหลด permissions ไม่ได้");
    const miss = PERM_KEYS.filter((k) => !isKey?.(k) || !THAI.test(String(label?.(k) ?? "")) || mod?.(k) !== "trips");
    ok(miss.length === 0, `ยังไม่ลงทะเบียน: ${miss.join(", ")}`);
  });
  await st("S-14", `ไม่แตะไฟล์ต้องห้ามเทียบ BASE_SHA ${BASE_SHA.slice(0, 9)}: prisma/ · core/settings · core/sellable · ไฟล์ T0.1–T0.5 (ยกเว้น index/sellable-impl/snapshot/pricing) · pos/hotel/rooms/booking/dorm/queue/ticket · ข้อสอบเดิม`, () => {
    ok(git(["cat-file", "-t", BASE_SHA]).trim() === "commit", `หา BASE_SHA ${BASE_SHA} ไม่เจอ`);
    const trips = ["capacity-core.ts", /* ORACLE-EDIT S-14 (ผู้คุม 13 พ.ย.): capacity.ts ออก — มติ R9 (ปล่อย hold ที่ผูกการจอง ⇒ HOLD_HAS_BOOKING) · ข้อสอบ t0.1/t0.3/t0.4 ออก — ผู้คุมแก้เอง */ "capacity-service.ts", "capacity-actions.ts", "pricing-core.ts", "promo.ts", "prices.ts", "pricing-actions.ts", "products.ts", "products-core.ts", "product-actions.ts",
      "departures.ts", "departures-core.ts", "departure-actions.ts", "resources.ts", "waitlist.ts", "jobs.ts", "money-math.ts", "json-schemas.ts"].map((f) => D + f);
    const paths = ["prisma", "src/lib/core/settings", "src/lib/core/sellable.ts", "src/lib/platform/sellables.ts", ...trips,
      "src/lib/modules/pos", "src/lib/modules/rooms", "src/lib/modules/hotel", "src/lib/modules/booking", "src/lib/modules/dorm", "src/lib/modules/queue", "src/lib/modules/ticket",
      "scripts/qc-trips-p0.1.mts", "scripts/qc-trips-t0.2.mts", "scripts/qc-trips-t0.5.mts"];
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...paths]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n")].filter(Boolean))];
    if (git(["ls-tree", "--name-only", "session/trips", "scripts/qc-trips-t0.6.mts"]).trim() && git(["show", "session/trips:scripts/qc-trips-t0.6.mts"]) !== read("scripts/qc-trips-t0.6.mts")) changed.push("scripts/qc-trips-t0.6.mts");
    ok(changed.length === 0, `แตะ: ${changed.slice(0, 6).join(", ")}`);
  });
  await st("S-15", "snapshot.ts + pricing.ts แก้ได้แบบเพิ่มอย่างเดียว (git diff --numstat เทียบ BASE_SHA: ลบ 0 บรรทัด)", () => {
    ok(git(["cat-file", "-t", BASE_SHA]).trim() === "commit", "หา BASE_SHA ไม่เจอ");
    const rows = git(["diff", "--numstat", BASE_SHA, "--", D + "snapshot.ts", D + "pricing.ts"]).split("\n").filter(Boolean).map((l) => l.split("\t"));
    const del = rows.filter((r) => Number(r[1]) > (r[2].endsWith("pricing.ts") ? 1 : 0)).map( /* ORACLE-EDIT S-15 (ผู้คุม 13 พ.ย.): pricing.ts แก้ได้ 1 บรรทัด (OPTS.overrideApprovals รับ resolvedMinor · มติ R14) */ (r) => `${r[2]} −${r[1]}`);
    ok(del.length === 0, `ลบ/แก้บรรทัดเดิม: ${del.join(", ")}`);
  });
  await st("S-16", "Sellable: sellableFor(\"TRIP\") hold/confirm/cancel/finalizeInTx ไม่ใช่ตัวปิด NOT_IMPLEMENTED_YET แล้ว · platform/basket.ts ส่งออก basketHold + basketConfirm", async () => {
    const m = await tryImport("@/lib/platform/sellables");
    const sf = m.mod?.sellableFor as ((k: string) => Promise<unknown>) | undefined;
    ok(typeof sf === "function", `ไม่มี sellableFor (${m.err.slice(0, 80)})`);
    const v = asRec(asRec(await sf!("TRIP"))?.value) ?? {};
    const sys = { tenantId: "x", unitId: "x", channel: "WEB", actor: { kind: "SYSTEM", job: "qc" }, now: new Date(NOW0) };
    for (const k of ["hold", "confirm", "cancel"]) {
      let r: Rec; try { r = asRec(await (v[k] as AnyFn)(sys, {})) ?? {}; } catch (e) { r = { ok: "THROW", e: errMsg(e) }; }
      ok(!(r.ok === false && asRec(r.details)?.reason === "NOT_IMPLEMENTED_YET"), `${k} ยังเป็นตัวปิด`);
      ok(r.ok !== "THROW", `${k} throw กับอินพุตเสีย: ${fmt(r)}`);
    }
    ok(!/finalizeInTx:\s*notYet/.test(srcOf(D + "sellable-impl.ts")), "finalizeInTx ยังเป็น notYet");
    const b = await tryImport("@/lib/platform/basket");
    ok(typeof b.mod?.basketHold === "function" && typeof b.mod?.basketConfirm === "function", `basket.ts ไม่ครบ (${b.err.slice(0, 80)})`);
  });
  groupLine("S");

  // ═══════════════ ST. ผังสถานะบริสุทธิ์ ═══════════════
  console.log("\n── ST: ผังสถานะ (บริสุทธิ์) ──");
  await st("ST-1", "BOOKING_STATUSES = CHECK TripBooking_status_check ตรงลำดับ CC · BOOKING_TERMINAL_STATUSES = EXPIRED CANCELLED TRAVELLED NO_SHOW", async () => {
    const t = needTrips();
    eq(await checkLits("TripBooking", "status"), STATUSES, "CHECK ในฐาน");
    eq([t.BOOKING_STATUSES, t.BOOKING_TERMINAL_STATUSES], [STATUSES, TERMINAL], "ค่าคงที่");
  });
  await st("ST-2", `canTransitionBooking ตารางเต็ม ${(STATUSES.length + 1) * STATUSES.length * ACTORS.length} กรณี (NEW + 9 สถานะ × 9 × ผู้กระทำ 4) ตรง CC §G.1`, () => {
    const can = fn("canTransitionBooking");
    const bad: string[] = [];
    for (const f of ["NEW", ...STATUSES]) for (const t of STATUSES) for (const a of ACTORS) if ((can(f, t, a) === true) !== allowed(f, t, a)) bad.push(`${f}>${t}@${a}`);
    ok(bad.length === 0, `${bad.length} ผิด: ${bad.slice(0, 8).join(" ")}`);
  });
  await st("ST-3", "สถานะไม่รู้จัก/ผู้กระทำไม่รู้จัก ⇒ false · สถานะจบไม่มีทางออก ยกเว้น NO_SHOW→TRAVELLED (STAFF) · ตาราง BOOKING_TRANSITIONS ครอบคู่ที่ยอมทุกคู่", () => {
    const can = fn("canTransitionBooking");
    eq([can("HOLD", "BOGUS", "STAFF"), can("XX", "HOLD", "STAFF"), can("HOLD", "CANCELLED", "ROBOT"), can("HOLD", "HOLD", "STAFF")], [false, false, false, false], "ไม่รู้จัก");
    const outs = TERMINAL.flatMap((f) => STATUSES.flatMap((t) => ACTORS.filter((a) => can(f, t, a) === true).map((a) => `${f}>${t}@${a}`)));
    eq(outs, ["NO_SHOW>TRAVELLED@STAFF"], "ทางออกของสถานะจบ");
    const rows = asArr(needTrips().BOOKING_TRANSITIONS);
    const miss = TRANS.flatMap(([f, ts, as]) => ts.flatMap((t) => as.filter((a) => !rows.some((r) => r.from === f && r.to === t && Array.isArray(r.actors) && (r.actors as string[]).includes(a))).map((a) => `${f}>${t}@${a}`)));
    ok(miss.length === 0, `ตารางขาด: ${miss.slice(0, 6).join(" ")}`);
  });
  await st("ST-4", "initialBookingStatus ตาม G.0 (ใบสั่ง §3 ข้อ 1–4): PUBLIC PAY_NOW ค้างจ่าย ⇒ HOLD/KEEP · ไม่มียอดตอนจอง ⇒ CONFIRMED/CONVERT · STAFF PAY_LATER ⇒ CONFIRMED · SHOP_CONFIRMS (ไม่ใช่ STAFF) ⇒ PENDING/SHOP_CONFIRM", () => {
    const f = fn("initialBookingStatus");
    const o = (actorKind: string, payMethod: string, confirmMode: string, dueNowSatang: number) => { const r = asRec(f({ actorKind, payMethod, confirmMode, dueNowSatang })) ?? {}; return r.ok === true ? `${r.status}/${r.hold}` : `${r.code}:${r.reason}`; };
    eq([o("PUBLIC", "PAY_NOW", "AUTO", TOTAL_0142), o("PUBLIC", "PAY_NOW", "AUTO", 0), o("STAFF", "PAY_LATER", "AUTO", TOTAL_0142), o("STAFF", "PAY_NOW", "AUTO", 100),
      o("PUBLIC", "PAY_NOW", "SHOP_CONFIRMS", 100), o("STAFF", "PAY_LATER", "SHOP_CONFIRMS", 100), o("STAFF", "PAY_NOW", "SHOP_CONFIRMS", 100)],
    ["HOLD/KEEP", "CONFIRMED/CONVERT", "CONFIRMED/CONVERT", "HOLD/KEEP", "PENDING/SHOP_CONFIRM", "CONFIRMED/CONVERT", "HOLD/KEEP"], "ผล");
  });
  await st("ST-5", "initialBookingStatus ปฏิเสธ: PUBLIC PAY_LATER ⇒ VALIDATION PAY_LATER_STAFF_ONLY (แม้ SHOP_CONFIRMS) · WALLET/CREDIT/ผู้กระทำ AGENT ⇒ FORBIDDEN AGENCY_NOT_ENABLED", () => {
    const f = fn("initialBookingStatus");
    const o = (actorKind: string, payMethod: string, confirmMode = "AUTO") => { const r = asRec(f({ actorKind, payMethod, confirmMode, dueNowSatang: 100 })) ?? {}; return r.ok === true ? `${r.status}` : `${r.code}:${r.reason}`; };
    eq([o("PUBLIC", "PAY_LATER"), o("PUBLIC", "PAY_LATER", "SHOP_CONFIRMS"), o("PUBLIC", "WALLET"), o("STAFF", "CREDIT"), o("AGENT", "PAY_NOW")],
      ["VALIDATION:PAY_LATER_STAFF_ONLY", "VALIDATION:PAY_LATER_STAFF_ONLY", "FORBIDDEN:AGENCY_NOT_ENABLED", "FORBIDDEN:AGENCY_NOT_ENABLED", "FORBIDDEN:AGENCY_NOT_ENABLED"], "ปฏิเสธ");
  });
  await st("ST-6", "contactKeyOf กติกาเดียว: เบอร์ไทยทุกรูป ⇒ tel:+66… · ไม่มีเบอร์ ⇒ line: · ไม่มี ⇒ mail:ตัวเล็ก · เบอร์มาก่อนอีเมล · ไม่มี ⇒ null · ไม่ใช้ partyId", () => {
    const f = fn("contactKeyOf");
    const k = (b: Rec) => f({ name: "ทดสอบ", ...b });
    eq([k({ phone: "081-234-5678" }), k({ phone: "+66 81 234 5678" }), k({ phone: "66812345678" }), k({ phone: "0812345678", email: "X@Y.co" }), k({ lineUserId: "Uabc123" }), k({ email: "Some.One@Mail.COM" }), k({}), k({ partyId: "p1" })],
      ["tel:+66812345678", "tel:+66812345678", "tel:+66812345678", "tel:+66812345678", "line:Uabc123", "mail:some.one@mail.com", null, null], "คีย์");
  });
  await st("ST-7", "ฟังก์ชันบริสุทธิ์ไม่แก้อินพุต (object แช่แข็งยังทำงาน) · ผลซ้ำได้ค่าเดิม", () => {
    const b = Object.freeze({ name: "ก", phone: "0812345678" });
    const i = Object.freeze({ actorKind: "PUBLIC", payMethod: "PAY_NOW", confirmMode: "AUTO", dueNowSatang: 5 });
    eq([fn("contactKeyOf")(b), fn("contactKeyOf")(b)], ["tel:+66812345678", "tel:+66812345678"], "contactKeyOf");
    eq(fn("initialBookingStatus")(i), fn("initialBookingStatus")(i), "initialBookingStatus");
  });
  groupLine("ST");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uB = rid("uB");
  let setupErr = "", settingsErr = "";
  const U: Record<string, Rec> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; pt: Record<string, string>; park: string; cam: string }> = {};
  const PARTY: Record<string, string> = {};
  let seq = 0;
  try {
    for (const t of ["TripProduct", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "TripPriceRule", "TripHold", "TripBooking", "TripBookingItem", "SellBasket", "SellCounter"]) await needTable(t);
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T0.6 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag] of [[uA, tA, "a"], [uA2, tA, "a2"], [uB, tB, "b"]] as const) await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: "{}", updatedAt: new Date() });
    for (const [tag, tenantId] of [["oa", tA], ["ob", tB]] as const) {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id };
    }
    const mkProd = async (key: string, tenantId: string, unitId: string) => {
      const id = rid(`p${key}`), o = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t06qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
      await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const pt: Record<string, string> = {};
      for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code }), countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
      const park = await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: R.parkAdultSatang, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
        name: JSON.stringify({ th: "ค่าอุทยาน" }), paxPrices: JSON.stringify({ ADULT: R.parkAdultSatang, CHILD: R.parkChildSatang }), active: true, updatedAt: new Date() });
      const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: R.extras.camera.satang, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
        name: JSON.stringify({ th: R.extras.camera.name }), active: true, updatedAt: new Date() });
      for (const [code, amount] of [["ADULT", R.adultSatang], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, opt: o, unit: unitId, tenant: tenantId, pt, park, cam };
    };
    await mkProd("A", tA, uA); await mkProd("A2", tA, uA); await mkProd("C", tA, uA2); await mkProd("B", tB, uB);
    PARTY.b1 = await insertRow("Party", { id: rid("pb1"), tenantId: tB, name: "ลูกค้าร้านบี", updatedAt: new Date() });
    PARTY.a1 = await insertRow("Party", { id: rid("pa1"), tenantId: tA, name: "ลูกค้าประจำร้านเอ", updatedAt: new Date() });
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const setV = async (tenantId: string, changes: Rec[], who = "oa") => {
    const r = asRec(await S("setSettings")(U[who], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  const VATREG = { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 };
  try {
    if (!setupErr) {
      await setV(tA, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uA, value: VATREG }, { key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uA2, value: VATREG }]);
      await setV(tB, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uB, value: VATREG }], "ob");
    }
  } catch (e) { settingsErr = e instanceof Error ? e.message : String(e); console.log(`  ⚠️ ตั้งค่าตั้งหน่วยไม่สำเร็จ: ${settingsErr}`); }
  const needDb = async () => { needTrips(); ok(!setupErr && PRD.A, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); ok(!settingsErr, `ตั้งค่าตั้งไม่ได้: ${settingsErr}`); };
  const mkDep = async (date: string, key = "A", capacity = 24): Promise<string> => {
    const p = PRD[key]; const startsAt = new Date(BKK(date, "08:00").getTime() + (seq++ % 600) * 60_000); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      status: "OPEN", capacity, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  const rawRule = async (params: Rec, unitId = uA) => insertRow("TripPriceRule", { id: rid("ru"), tenantId: tA, unitId, productId: null, kind: params.kind, code: params.code ?? null, params: JSON.stringify(params), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });

  // ── ctx · บรรทัด · ผู้จอง ──
  const staff = (o: { tenant?: string; unit?: string; ch?: string; now?: string | Date; who?: string } = {}): Rec => ({ tenantId: o.tenant ?? tA, unitId: o.unit ?? uA, channel: o.ch ?? "COUNTER", actor: { kind: "STAFF", userId: String(U[o.who ?? "oa"]?.userId ?? "x") }, now: new Date(o.now ?? NOW0), locale: "th" });
  let pubN = 0;
  const pub = (o: { tenant?: string; unit?: string; ch?: string; now?: string | Date } = {}): Rec => ({ tenantId: o.tenant ?? tA, unitId: o.unit ?? uA, channel: o.ch ?? "WEB", actor: { kind: "PUBLIC", clientKey: `t06qc_c${pubN++}_${hex(3)}` }, now: new Date(o.now ?? NOW0), locale: "th" });
  const withNow = (ctx: Rec, now: string | Date): Rec => ({ ...ctx, now: new Date(now) });
  const line = (dep: string, o: { key?: string; a?: number; c?: number; i?: number; camera?: boolean; promo?: string } = {}): Rec => {
    const p = PRD[o.key ?? "A"];
    const pax = [["ADULT", o.a ?? 2], ["CHILD", o.c ?? 1], ["INFANT", o.i ?? 0]].filter(([, n]) => Number(n) > 0).map(([code, n]) => ({ paxTypeId: p.pt[String(code)], qty: Number(n) }));
    return { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: dep, optionId: p.opt, pax, extras: o.camera === false ? [] : [{ extraId: p.cam, qty: 1 }], ...(o.promo ? { promoCode: o.promo } : {}) };
  };
  let bkN = 0;
  const booker = (o: Rec = {}): Rec => { bkN++; return { name: `ลูกค้าทดสอบ ${bkN}`, phone: `08${String(10_000_000 + bkN * 7_919 + Number.parseInt(hex(2), 16)).slice(-8)}`, ...o }; };
  const quoteOf = async (ctx: Rec, lines: Rec[], opts: Rec = {}): Promise<Rec> => V(await call("quoteTrips", ctx, { lines }, opts), "quoteTrips (T0.5)");
  type H = { r: Rec; v: Rec; quote: Rec; token?: string; lines: Rec[]; ctx: Rec; key: string };
  const holdT = async (ctx: Rec, lines: Rec[], o: { token?: string | null; key?: string; quote?: Rec; quoteExpiresAt?: string } = {}): Promise<H> => {
    const quote = o.quote ?? (await quoteOf(ctx, lines));
    const key = o.key ?? `h${hex(6)}`;
    const isPub = asRec(ctx.actor)?.kind === "PUBLIC";
    const token = o.token === null ? undefined : (o.token ?? (isPub ? tok() : undefined));
    const r = await call("holdTrips", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: o.quoteExpiresAt ?? quote.expiresAt, idempotencyKey: key, ...(token ? { basketToken: token } : {}) }, {});
    return { r, v: asRec(r.value) ?? {}, quote, token, lines, ctx, key };
  };
  const holdOk = async (ctx: Rec, lines: Rec[], o: { token?: string | null; key?: string } = {}): Promise<H> => { const h = await holdT(ctx, lines, o); V(h.r, "holdTrips"); return h; };
  const confirmT = async (h: H, o: { ctx?: Rec; key?: string; booker?: Rec; pay?: string; quoteId?: string; token?: string | null; lines?: Rec[]; extra?: Rec } = {}): Promise<Rec> => {
    const token = o.token === null ? undefined : (o.token ?? h.token);
    return call("confirmTrips", o.ctx ?? h.ctx, { basketId: h.v.basketId, holdIds: h.v.holdIds, idempotencyKey: o.key ?? `c${hex(6)}`, quoteId: o.quoteId ?? h.quote.quoteId, quote: { lines: o.lines ?? h.lines },
      booker: o.booker ?? booker(), pay: { method: o.pay ?? (asRec(h.ctx.actor)?.kind === "STAFF" ? "PAY_LATER" : "PAY_NOW") }, ...(token ? { basketToken: token } : {}), ...(o.extra ?? {}) }, {});
  };
  const bookNow = async (ctx: Rec, lines: Rec[], o: { key?: string; booker?: Rec; pay?: string; overrides?: Rec[]; approvals?: Rec[]; canOverride?: boolean; passengers?: Rec[]; quote?: Rec } = {}): Promise<{ q: Rec; r: Rec }> => {
    const qopts: Rec = { ...(o.overrides ? { overrides: o.overrides } : {}), ...(o.approvals ? { overrideApprovals: o.approvals.map((a) => ({ approvalId: a.approvalId, itemRef: a.itemRef, unitMinor: a.unitMinor })) } : {}), ...(o.canOverride ? { canOverride: true } : {}) }; // T0.5 OPTS ไม่รับ resolvedMinor (pricing.ts :89) — ใบสั่ง §5.2 ข้อ 6
    const quote = o.quote ?? (await quoteOf(ctx, lines, qopts));
    const r = await call("bookTripsNow", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: o.key ?? `n${hex(6)}`, booker: o.booker ?? booker(), pay: { method: o.pay ?? "PAY_LATER" },
      ...(o.passengers ? { passengers: o.passengers } : {}), ...(o.overrides ? { priceOverrides: o.overrides } : {}), ...(o.approvals ? { overrideApprovals: o.approvals } : {}) }, o.canOverride ? { canOverride: true } : {});
    return { q: quote, r };
  };
  const ref0 = (r: Rec): Rec => asArr(r.value)[0] ?? {};
  const bk = async (id: unknown): Promise<Rec> => (await q<Rec>(`SELECT * FROM "TripBooking" WHERE id = $1`, [String(id)]))[0] ?? {};
  const bksOfBasket = async (basketId: unknown) => q<Rec>(`SELECT * FROM "TripBooking" WHERE "basketId" = $1 ORDER BY id`, [String(basketId)]);
  const dep = async (id: string): Promise<Rec> => (await q<Rec>(`SELECT capacity, sold, held, reserved, status FROM "TripDeparture" WHERE id = $1`, [id]))[0] ?? {};
  const holdRow = async (id: unknown): Promise<Rec> => (await q<Rec>(`SELECT * FROM "TripHold" WHERE id = $1`, [String(id)]))[0] ?? {};
  const basket = async (id: unknown): Promise<Rec> => (await q<Rec>(`SELECT * FROM "SellBasket" WHERE id = $1`, [String(id)]))[0] ?? {};
  const items = async (bid: unknown) => q<Rec>(`SELECT i.*, p.code AS "paxCode" FROM "TripBookingItem" i LEFT JOIN "TripPaxType" p ON p.id = i."paxTypeId" WHERE i."bookingId" = $1 ORDER BY i.kind, p.code NULLS LAST, i."amountSatang" DESC, i.id`, [String(bid)]);
  const outbox = async (type: string, tenantId = tA) => q<{ payload: Rec; idempotencyKey: string }>(`SELECT payload, "idempotencyKey" FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = $2 ORDER BY "createdAt"`, [tenantId, type]).catch(() => []);
  const seqSum = async (tenantId = tA) => (await q<{ n: number }>(`SELECT COALESCE(sum(seq),0)::int AS n FROM "SellCounter" WHERE "tenantId" = $1`, [tenantId]))[0]?.n ?? 0;
  const bookingCount = async (tenantId = tA) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" WHERE "tenantId" = $1`, [tenantId]))[0]?.n ?? 0;
  /** ค่าคงที่ D.3 (ใบสั่ง §13 ข้อ 1): sold = Σ ที่นั่งนับที่ของการจองที่ขายแล้ว · held = Σ hold ACTIVE */
  const inv = async (deps: string[]): Promise<string[]> => {
    const bad: string[] = [];
    for (const d of deps) {
      const c = await dep(d);
      const s = (await q<{ n: number }>(`SELECT COALESCE(sum(i.qty),0)::int AS n FROM "TripBookingItem" i JOIN "TripBooking" b ON b.id = i."bookingId" LEFT JOIN "TripPaxType" p ON p.id = i."paxTypeId"
        WHERE i."departureId" = $1 AND i.active AND i.kind IN ('SEAT','BERTH') AND COALESCE(p."countsCapacity", true) AND b.status = ANY($2::text[])`, [d, SOLD_ST]))[0]?.n ?? -1;
      const h = (await q<{ n: number }>(`SELECT COALESCE(sum("qtyPublic" + "qtyAllot"),0)::int AS n FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [d]))[0]?.n ?? -1;
      if (c.sold !== s || c.held !== h) bad.push(`${d.slice(-6)} sold ${c.sold}/${s} held ${c.held}/${h}`);
    }
    return bad;
  };
  const invOk = async (deps: string[], what: string) => { const b = await inv(deps); ok(b.length === 0, `${what} ค่าคงที่ D.3: ${b.slice(0, 4).join(" · ")}`); };

  // ═══════════════ NU. เลขจอง ═══════════════
  console.log("\n── NU: เลขจอง (CC §K · L-15) ──");
  await st("NU-1", "bookingPeriodOf = ปี พ.ศ. 2 หลัก + เดือนของวันเดินทาง: 2026-11-14 → 6911 · 2027-02-14 → 7002 · 2026-12-31 → 6912 · 2027-01-01 → 7001", () => {
    const f = fn("bookingPeriodOf");
    eq(["2026-11-14", "2027-02-14", "2026-12-31", "2027-01-01"].map((d) => f(d)), ["6911", "7002", "6912", "7001"], "งวด");
  });
  await st("NU-2", "formatBookingCode: TR-6911-0142 (README :31) · 0001 · 9999 · ครบ 10000 ⇒ 5 หลักไม่ล้ม · BOOKING_CODE_RE รับทุกตัว ไม่รับ tr-6911-1", () => {
    const f = fn("formatBookingCode"); const re = needTrips().BOOKING_CODE_RE;
    const out = [f("TR", "6911", 142), f("TR", "6911", 1), f("LB", "7002", 9999), f("TR", "6911", 10000)];
    eq(out, ["TR-6911-0142", "TR-6911-0001", "LB-7002-9999", "TR-6911-10000"], "รูปเลข");
    ok(re instanceof RegExp && out.every((x) => re.test(String(x))) && !re.test("tr-6911-1"), "BOOKING_CODE_RE");
  });
  await st("NU-3", "nextSeqInTx: 50 tx พร้อมกัน (ร้านเดียว series/period เดียว) ⇒ 1..50 ไม่ซ้ำไม่ขาด", async () => {
    await needDb(); const series = `Q${hex(1).toUpperCase().replace(/[^A-Z]/g, "X")}N`;
    const r = await Promise.all(Array.from({ length: 50 }, () => inTx(tA, uA, async (tx) => ({ ok: true, value: await fn("nextSeqInTx")(tx, { tenantId: tA, series, period: "7003" }) }))));
    ok(r.every((x) => x.ok === true), `ล้ม: ${fmt(r.find((x) => x.ok !== true))}`);
    eq(r.map((x) => Number(x.value)).sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1), "ลำดับ");
  });
  await st("NU-4", "ตัวนับแยกต่อ (ร้าน, series, period): ร้าน B / งวดอื่น / series อื่น เริ่ม 1 · tx ล้มหลังจองเลข ⇒ เลขคืน (ครั้งถัดไปได้เลขเดิม)", async () => {
    await needDb();
    const one = async (t: string, u: string, series: string, period: string) => { const r = await inTx(t, u, async (tx) => ({ ok: true, value: await fn("nextSeqInTx")(tx, { tenantId: t, series, period }) })); return Number(r.value); };
    const s = `R${hex(1).toUpperCase().replace(/[^A-Z]/g, "Y")}N`;
    eq([await one(tA, uA, s, "7003"), await one(tA, uA, s, "7003"), await one(tB, uB, s, "7003"), await one(tA, uA, s, "7004"), await one(tA, uA, `${s}Z`, "7003")], [1, 2, 1, 1, 1], "แยกชุด");
    const rolled = await inTx(tA, uA, async (tx) => { await fn("nextSeqInTx")(tx, { tenantId: tA, series: s, period: "7003" }); throw new Error("rollback-on-purpose"); });
    ok(rolled.ok === "THROW", "tx ไม่ล้มตามที่ตั้งใจ");
    eq(await one(tA, uA, s, "7003"), 3, "เลขหลัง rollback");
  });
  await st("NU-5", "เลขจองจริง = prefix ค่าตั้ง X3 (ค่าเริ่ม TR) + เดือนเดินทาง (ไม่ใช่เดือนที่จอง): จอง 1 มี.ค. 2570 สำหรับรอบ 10 เม.ย. 2570 ⇒ TR-7004-NNNN", async () => {
    await needDb(); const d = await mkDep("2027-04-10");
    const r = await bookNow(staff(), [line(d)]);
    V(r.r, "bookTripsNow");
    ok(/^TR-7004-\d{4,}$/.test(String(ref0(r.r).code)), `เลข ${fmt(ref0(r.r))}`);
    eq((await bk(ref0(r.r).bookingId)).code, ref0(r.r).code, "เลขในแถว");
  });
  await st("NU-6", "เปลี่ยน prefix ของหน่วย (X3 = QT) ⇒ ชุดใหม่เริ่ม QT-<งวด>-0001 · หน่วยอื่นไม่เปลี่ยน", async () => {
    await needDb();
    await setV(tA, [{ key: "trips.sell.codePrefix", scope: "UNIT", scopeId: uA2, value: "QT" }]);
    const d = await mkDep("2027-03-12", "C");
    const r = await bookNow(staff({ unit: uA2 }), [line(d, { key: "C" })]);
    eq(String(ref0(r.r).code), "QT-7003-0001", `เลข (${fmt(r.r)})`);
    const d2 = await mkDep("2027-03-12");
    ok(/^TR-7003-\d{4,}$/.test(String(ref0((await bookNow(staff(), [line(d2)])).r).code)), "หน่วย A ได้ prefix อื่น");
  });
  await st("NU-7", "50 การจองพร้อมกันบนรอบความจุ 60 ⇒ สำเร็จ 50 · เลข 50 ตัวไม่ซ้ำ ตรง BOOKING_CODE_RE และต่อเนื่อง (max − min = 49)", async () => {
    await needDb(); const d = await mkDep("2027-03-13", "A", 60);
    const rs = await par(50, async () => (await bookNow(staff(), [line(d, { a: 1, c: 0, camera: false })])).r);
    ok(rs.every((x) => x.ok === true), `ล้ม ${rs.filter((x) => x.ok !== true).length}: ${fmt(rs.find((x) => x.ok !== true))}`);
    const codes = rs.map((x) => String(ref0(x).code));
    eq(new Set(codes).size, 50, "เลขซ้ำ");
    const nums = codes.map((c) => Number(c.split("-")[2])).sort((a, b) => a - b);
    eq(nums[49] - nums[0], 49, "ต่อเนื่อง");
    await invOk([d], "NU-7");
  });
  await st("NU-8", "เลขไม่ซ้ำข้ามร้านไม่จำเป็น แต่ unique (tenantId, code) ต้องไม่ชน: ร้าน B จองรอบเดือนเดียวกันได้ TR-7003-0001 ของตัวเอง", async () => {
    await needDb(); const d = await mkDep("2027-03-14", "B");
    const r = await bookNow(staff({ tenant: tB, unit: uB, who: "ob" }), [line(d, { key: "B" })]);
    eq(String(ref0(r.r).code), "TR-7003-0001", `เลขร้าน B (${fmt(r.r)})`);
  });
  groupLine("NU");

  // ═══════════════ H. ถือผ่านตะกร้า ═══════════════
  console.log("\n── H: ถือที่ผ่านตะกร้า ──");
  let H1: H | null = null; let dH1 = "";
  await st("H-1", "PUBLIC holdTrips 2 ผู้ใหญ่ 1 เด็ก 1 ทารก ⇒ SellBasket OPEN (WEB · unitIds · publicTokenHash = sha256(token) · expiresAt) + TripHold ACTIVE qty 3 (ทารกไม่นับ) PAYMENT ผูก basketId · รอบ held +3", async () => {
    await needDb(); dH1 = await mkDep("2027-03-10");
    H1 = await holdOk(pub(), [line(dH1, { i: 1 })]);
    const v = H1.v; ok(typeof v.basketId === "string" && Array.isArray(v.holdIds) && (v.holdIds as unknown[]).length === 1 && typeof v.expiresAt === "string", `รูป Hold ${fmt(v)}`);
    const b = await basket(v.basketId), h = await holdRow((v.holdIds as string[])[0]);
    eq([b.status, b.channel, b.unitIds, b.publicTokenHash, b.tenantId], ["OPEN", "WEB", [uA], sha256hex(String(H1.token)), tA], "ตะกร้า");
    eq([h.status, h.qtyPublic, h.purpose, h.basketId, h.departureId], ["ACTIVE", 3, "PAYMENT", v.basketId, dH1], "hold");
    eq((await dep(dH1)).held, 3, "held");
  });
  await st("H-2", "quoteId ไม่ตรงราคาปัจจุบัน ⇒ PRICE_CHANGED + details.quote (quoteId ใหม่) · ไม่เขียน SellBasket/TripHold/ตัวนับ", async () => {
    await needDb(); const d = await mkDep("2027-03-10"); const ln = [line(d)];
    const q0 = await quoteOf(pub(), ln);
    const b0 = (await q<{ n: number }>(`SELECT count(*)::int n FROM "SellBasket" WHERE "tenantId" = $1`, [tA]))[0]?.n;
    const h = await holdT(pub(), ln, { quote: { ...q0, quoteId: "0".repeat(64) } });
    codeR(h.r, "PRICE_CHANGED", "hold");
    ok(asRec(asRec(h.r.details)?.quote)?.quoteId === q0.quoteId, `details.quote ${fmt(h.r.details)}`);
    eq([(await q<{ n: number }>(`SELECT count(*)::int n FROM "SellBasket" WHERE "tenantId" = $1`, [tA]))[0]?.n, (await dep(d)).held], [b0, 0], "ไม่เขียน");
  });
  await st("H-3", "ใบเสนอราคาหมดอายุ (ctx.now > quoteExpiresAt) ⇒ PRICE_CHANGED reason QUOTE_EXPIRED · ไม่เขียน", async () => {
    await needDb(); const d = await mkDep("2027-03-10");
    const h = await holdT(pub({ now: addMin(NOW0, 60) }), [line(d)], { quote: await quoteOf(pub(), [line(d)]) });
    codeR(h.r, "PRICE_CHANGED", "hold", "QUOTE_EXPIRED");
    eq((await dep(d)).held, 0, "held");
  });
  await st("H-4", "กันซ้ำ: คีย์เดิม + คำขอเดิม ยิง 5 พร้อมกัน ⇒ ตะกร้า/hold ชุดเดียว (held +3 ครั้งเดียว) · คีย์เดิม คำขอต่าง ⇒ IDEMPOTENCY_CONFLICT", async () => {
    await needDb(); const d = await mkDep("2027-03-10"); const ctx = pub(); const ln = [line(d)];
    const quote = await quoteOf(ctx, ln); const key = `dup${hex(5)}`; const token = tok();
    const rs = await par(5, async () => (await holdT(ctx, ln, { quote, key, token })).r);
    ok(rs.every((x) => x.ok === true), `ล้ม: ${fmt(rs.find((x) => x.ok !== true))}`);
    eq(new Set(rs.map((x) => asRec(x.value)?.basketId)).size, 1, "ตะกร้า");
    eq((await dep(d)).held, 3, "held");
    const other = await holdT(ctx, [line(d, { a: 1 })], { key, token });
    codeR(other.r, "IDEMPOTENCY_CONFLICT", "คำขอต่าง");
  });
  await st("H-5", "ตะกร้า 2 สินค้า 2 รอบ ⇒ ตะกร้าเดียว · hold 2 แถวเรียงตามบรรทัด · unitIds = [uA] · expiresAt = ช้าสุด", async () => {
    await needDb(); const d1 = await mkDep("2027-03-11"), d2 = await mkDep("2027-03-11", "A2");
    const h = await holdOk(pub(), [line(d2, { key: "A2", a: 1, c: 0 }), line(d1, { a: 2, c: 0 })]);
    const ids = h.v.holdIds as string[];
    eq([ids.length, (await holdRow(ids[0])).departureId, (await holdRow(ids[1])).departureId, (await holdRow(ids[0])).basketId, (await basket(h.v.basketId)).unitIds], [2, d2, d1, h.v.basketId, [uA]], "ตะกร้า");
    eq([(await dep(d1)).held, (await dep(d2)).held], [2, 1], "held");
  });
  await st("H-6", "PUBLIC ไม่มี basketToken ⇒ VALIDATION · ผู้กระทำ AGENT ⇒ FORBIDDEN AGENCY_NOT_ENABLED · ไม่เขียน", async () => {
    await needDb(); const d = await mkDep("2027-03-10");
    codeR((await holdT(pub(), [line(d)], { token: null })).r, "VALIDATION", "ไม่มี token");
    const ag = { tenantId: tA, unitId: uA, channel: "AGENT_PORTAL", actor: { kind: "AGENT", agentAccountId: "ag1", agentUserId: "au1" }, now: new Date(NOW0) };
    const r = await call("holdTrips", ag, { quote: { lines: [line(d)] }, quoteId: "0".repeat(64), quoteExpiresAt: addMin(NOW0, 15).toISOString(), idempotencyKey: `ag${hex(5)}` }, {});
    codeR(r, "FORBIDDEN", "AGENT", "AGENCY_NOT_ENABLED");
    eq((await dep(d)).held, 0, "held");
  });
  await st("H-7", "เพดานถือ X10 (DS = 3) นับที่ชั้น 0: ตะกร้า PUBLIC 4 บรรทัด ⇒ HOLD_LIMIT · ไม่มีแถวใดถูกเขียน", async () => {
    await needDb(); const ds = [await mkDep("2027-03-15"), await mkDep("2027-03-16"), await mkDep("2027-03-17"), await mkDep("2027-03-18")];
    codeR((await holdT(pub(), ds.map((d) => line(d, { a: 1, c: 0, camera: false })))).r, "HOLD_LIMIT", "4 บรรทัด");
    eq(await Promise.all(ds.map(async (d) => (await dep(d)).held)), [0, 0, 0, 0], "held");
  });
  await st("H-8", "ที่ไม่พอ ⇒ SOLD_OUT · ตะกร้าไม่ถูกสร้าง (rollback ชั้น 0)", async () => {
    await needDb(); const d = await mkDep("2027-03-10", "A", 2); const token = tok();
    codeR((await holdT(pub(), [line(d)], { token })).r, "SOLD_OUT", "3 จาก 2");
    eq((await q<{ n: number }>(`SELECT count(*)::int n FROM "SellBasket" WHERE "publicTokenHash" = $1`, [sha256hex(token)]))[0]?.n, 0, "ตะกร้า");
  });
  await st("H-9", "token ตะกร้าใช้ได้ครั้งเดียว: token เดิมกับคีย์ใหม่ ⇒ VALIDATION BASKET_TOKEN_USED", async () => {
    await needDb(); const d = await mkDep("2027-03-10"); const token = tok();
    await holdOk(pub(), [line(d, { a: 1, c: 0 })], { token });
    codeR((await holdT(pub(), [line(d, { a: 1, c: 0 })], { token })).r, "VALIDATION", "token ซ้ำ", "BASKET_TOKEN_USED");
  });
  groupLine("H");

  // ═══════════════ CF. ยืนยัน ═══════════════
  console.log("\n── CF: ยืนยันการจอง ──");
  let CF1: Rec = {}; let CF1Booker: Rec = {};
  await st("CF-1", "PUBLIC confirmTrips PAY_NOW (DS มัดจำ 100% ⇒ ค้างจ่ายตอนจอง) ⇒ BookingRef[1]: HOLD · เลข TR-7003-NNNN · publicToken ≥ 22 ตัว เก็บแค่ sha256 · dues Σ = 11,450", async () => {
    await needDb(); ok(H1, "H-1 ไม่ผ่าน");
    CF1Booker = booker();
    const r = await confirmT(H1 as H, { booker: CF1Booker });
    const refs = VA(r, "confirmTrips"); eq(refs.length, 1, "จำนวน BookingRef");
    CF1 = refs[0];
    ok(CF1.productKind === "TRIP" && CF1.status === "HOLD" && /^TR-7003-\d{4,}$/.test(String(CF1.code)), `ref ${fmt(CF1)}`);
    const t = String(CF1.publicToken ?? ""); const row = await bk(CF1.bookingId);
    ok(t.length >= 22 && row.publicTokenHash === sha256hex(t) && row.publicTokenHash !== t, "publicToken/hash");
    eq(asArr(CF1.dues).reduce((s, d) => s + Number(asRec(d.amount)?.satang ?? 0), 0), TOTAL_0142, "Σ งวด");
  });
  await st("CF-2", "แถว TripBooking: ยอด = snapshot (gross 11,450 · เก็บแทน 1,500 · VAT 650.93 · ส่วนลด 0) · SHOP/PAY_NOW/DIRECT · THB · NONE · paid 0 · version 0 · travelDate · basketId · channel WEB · createdById null", async () => {
    ok(H1 && CF1.bookingId, "H-1/CF-1 ไม่ผ่าน"); const b = await bk(CF1.bookingId); ok(b.id, "ไม่มีแถว");
    eq([b.status, b.grossSatang, b.passThroughSatang, b.vatSatang, b.discountSatang, b.agentDiscountSatang, b.commissionSatang, b.netToShopSatang, b.collectMode, b.payMethod, b.contactRoute, b.currency, b.accountingState, b.paidSatang, b.refundedSatang, b.version, b.channel, b.createdById, b.basketId, b.departureId, b.productId],
      ["HOLD", TOTAL_0142, PARK_0142, VAT_0142, 0, 0, 0, TOTAL_0142, "SHOP", "PAY_NOW", "DIRECT", "THB", "NONE", 0, 0, 0, "WEB", null, (H1 as H).v.basketId, dH1, PRD.A.id], "คอลัมน์");
    eq(new Date(String(b.travelDate)).toISOString().slice(0, 10), "2027-03-10", "travelDate");
  });
  await st("CF-3", "TripBookingItem จาก snapshot: SEAT ผู้ใหญ่ 2×3,500 · เด็ก 1×2,450 · ทารก 1×0 · อุทยาน 1,200 + 300 (passThrough NONE) · กล้อง 500 VAT7 · Σ amountSatang = 11,450 · departureId ทุกแถว", async () => {
    const its = await items(CF1.bookingId);
    const pick = (kind: string, code: string | null, passThrough?: boolean) => its.find((i) => i.kind === kind && (code === null || i.paxCode === code) && (passThrough === undefined || i.passThrough === passThrough));
    const seatA = pick("SEAT", "ADULT"), seatC = pick("SEAT", "CHILD"), seatI = pick("SEAT", "INFANT"), cam = its.find((i) => i.kind === "EXTRA" && i.taxKind === "VAT7");
    eq([seatA?.qty, seatA?.unitPriceMinor, seatC?.qty, seatC?.unitPriceMinor, seatI?.qty, seatI?.amountSatang, cam?.amountSatang, cam?.passThrough],
      [2, R.adultSatang, 1, R.childSatang, 1, 0, R.extras.camera.satang, false], "ที่นั่ง/กล้อง");
    const park = its.filter((i) => i.kind === "EXTRA" && i.passThrough === true);
    eq([park.reduce((s, i) => s + Number(i.amountSatang), 0), park.every((i) => i.taxKind === "NONE")], [PARK_0142, true], "อุทยาน");
    eq([its.reduce((s, i) => s + Number(i.amountSatang), 0), its.every((i) => i.departureId === dH1 && i.active === true)], [TOTAL_0142, true], "รวม");
  });
  await st("CF-4", "policySnapshot = TripsBookingSnapshot v1 ของ buildTripBookingSnapshot: v 1 · refs.slotId · quote.fingerprint sha256 · totals.payableSatang 11,450 · policy.trips.values 35 คีย์ (CC §N.3)", async () => {
    const s = asRec((await bk(CF1.bookingId)).policySnapshot) ?? {};
    eq([s.v, asRec(s.refs)?.slotId, /^[0-9a-f]{64}$/.test(String(asRec(s.quote)?.fingerprint)), asRec(s.totals)?.payableSatang, Object.keys(asRec(asRec(asRec(s.policy)?.trips)?.values) ?? {}).length >= SNAP_KEYS_N],
      [1, dH1, true, TOTAL_0142, true], "snapshot");
  });
  await st("CF-5", "หลังยืนยัน (HOLD): hold ยัง ACTIVE ผูก bookingId · purpose PAYMENT · รอบ held 3 sold 0 (HOLD ไม่นับ sold · L-24) · ตะกร้า CHECKED_OUT", async () => {
    ok(H1 && CF1.bookingId, "H-1/CF-1 ไม่ผ่าน");
    const h = await holdRow(((H1 as H).v.holdIds as string[])[0]);
    eq([h.status, h.bookingId, h.purpose], ["ACTIVE", CF1.bookingId, "PAYMENT"], "hold");
    eq([(await dep(dH1)).held, (await dep(dH1)).sold, (await basket((H1 as H).v.basketId)).status], [3, 0, "CHECKED_OUT"], "รอบ/ตะกร้า");
    await invOk([dH1], "CF-5");
  });
  await st("CF-6", "rekey ก่อนแปลง (D.6 · r2 §d ข้อ 3): capKeyHash ของ hold = holdCapKeyHash(\"contact:\" + contactKeyOf(ผู้จอง))", async () => {
    ok(H1 && CF1.bookingId, "H-1/CF-1 ไม่ผ่าน");
    const h = await holdRow(((H1 as H).v.holdIds as string[])[0]);
    eq(h.capKeyHash, fn("holdCapKeyHash")(`contact:${String(fn("contactKeyOf")(CF1Booker))}`), "capKeyHash");
  });
  let CF7: Rec = {}; let dCF7 = "";
  await st("CF-7", "STAFF bookTripsNow PAY_LATER ⇒ CONFIRMED · hold CONVERTED ผูก bookingId · sold +3 held 0 · createdById = salesStaffId = พนักงาน · ตะกร้า CHECKED_OUT", async () => {
    await needDb(); dCF7 = await mkDep("2027-03-19");
    const r = await bookNow(staff(), [line(dCF7)]); CF7 = ref0(r.r);
    ok(r.r.ok === true && CF7.status === "CONFIRMED", `ผล ${fmt(r.r)}`);
    const b = await bk(CF7.bookingId); const hs = await q<Rec>(`SELECT * FROM "TripHold" WHERE "bookingId" = $1`, [CF7.bookingId]);
    eq([b.status, b.payMethod, b.createdById, b.salesStaffId, hs.length, hs[0]?.status, (await dep(dCF7)).sold, (await dep(dCF7)).held, (await basket(b.basketId)).status],
      ["CONFIRMED", "PAY_LATER", U.oa.userId, U.oa.userId, 1, "CONVERTED", 3, 0, "CHECKED_OUT"], "แถว");
    await invOk([dCF7], "CF-7");
  });
  let CF8: Rec = {};
  await st("CF-8", "ยืนยันซ้ำ: คีย์เดิม 6 ครั้งพร้อมกัน ⇒ สำเร็จทุกครั้ง bookingId/เลข/publicToken เดียวกัน · TripBooking ของตะกร้า 1 แถว · คีย์เดิมคำขอต่าง ⇒ IDEMPOTENCY_CONFLICT", async () => {
    await needDb(); const d = await mkDep("2027-03-20"); const h = await holdOk(pub(), [line(d)]); const key = `cf8${hex(5)}`; const bkr = booker();
    const rs = await par(6, () => confirmT(h, { key, booker: bkr }));
    ok(rs.every((x) => x.ok === true), `ล้ม: ${fmt(rs.find((x) => x.ok !== true))}`);
    CF8 = ref0(rs[0]);
    eq([new Set(rs.map((x) => ref0(x).bookingId)).size, new Set(rs.map((x) => ref0(x).code)).size, new Set(rs.map((x) => ref0(x).publicToken)).size, (await bksOfBasket(h.v.basketId)).length], [1, 1, 1, 1], "ซ้ำ");
    codeR(await confirmT(h, { key, booker: { ...bkr, name: "ชื่ออื่น" } }), "IDEMPOTENCY_CONFLICT", "คำขอต่าง");
    (CF8 as Rec).__h = h;
  });
  await st("CF-9", "ตะกร้า CHECKED_OUT + คีย์ใหม่ ⇒ STATE_CONFLICT BASKET_CHECKED_OUT · ไม่มีการจองเพิ่ม", async () => {
    const h = asRec(CF8.__h) as unknown as H; ok(h, "CF-8 ไม่ผ่าน");
    codeR(await confirmT(h), "STATE_CONFLICT", "คีย์ใหม่", "BASKET_CHECKED_OUT");
    eq((await bksOfBasket(h.v.basketId)).length, 1, "จำนวนการจอง");
  });
  await st("CF-10", "PUBLIC ส่ง token ตะกร้าผิด ⇒ HOLD_NOT_FOUND · hold ยัง ACTIVE ไม่ผูกการจอง · ตะกร้า OPEN", async () => {
    await needDb(); const d = await mkDep("2027-03-20"); const h = await holdOk(pub(), [line(d)]);
    codeR(await confirmT(h, { token: tok() }), ["HOLD_NOT_FOUND", "NOT_FOUND"], "token ผิด");
    const hr = await holdRow((h.v.holdIds as string[])[0]);
    eq([hr.status, hr.bookingId, (await basket(h.v.basketId)).status, (await bksOfBasket(h.v.basketId)).length], ["ACTIVE", null, "OPEN", 0], "ไม่เขียน");
  });
  await st("CF-11", "บรรทัดตอนยืนยันไม่ตรง hold (3 ที่ → 2 ที่) ⇒ VALIDATION HOLD_MISMATCH · ไม่เขียน", async () => {
    await needDb(); const d = await mkDep("2027-03-20"); const ctx = pub(); const h = await holdOk(ctx, [line(d)]);
    const ln2 = [line(d, { c: 0 })]; const q2 = await quoteOf(ctx, ln2);
    codeR(await confirmT(h, { lines: ln2, quoteId: String(q2.quoteId) }), "VALIDATION", "ไม่ตรง", "HOLD_MISMATCH");
    eq((await bksOfBasket(h.v.basketId)).length, 0, "การจอง");
  });
  await st("CF-12", "ราคาเปลี่ยนหลังถือ (ราคารอบผู้ใหญ่ 3,600) ⇒ PRICE_CHANGED + details.quote ใหม่ · ไม่เขียน · ยืนยันด้วย quoteId ใหม่ ⇒ gross 11,720 (2×3,600 + 2,520 + 1,500 + 500)", async () => {
    await needDb(); const d = await mkDep("2027-03-21"); const h = await holdOk(pub(), [line(d)]);
    await insertRow("TripPrice", { id: rid("pr"), tenantId: tA, unitId: uA, productId: PRD.A.id, optionId: null, paxTypeId: PRD.A.pt.ADULT, cabinTypeId: null, seasonId: null, departureId: d, currency: "THB", amountMinor: 360_000, weekdayMask: null, priority: 0, updatedAt: new Date() });
    const r = await confirmT(h); codeR(r, "PRICE_CHANGED", "ราคาเปลี่ยน");
    const nq = asRec(asRec(r.details)?.quote) ?? {}; ok(typeof nq.quoteId === "string" && nq.quoteId !== h.quote.quoteId, "details.quote");
    eq([(await bksOfBasket(h.v.basketId)).length, (await holdRow((h.v.holdIds as string[])[0])).status], [0, "ACTIVE"], "ไม่เขียน");
    const r2 = await confirmT(h, { quoteId: String(nq.quoteId) });
    eq((await bk(ref0(r2).bookingId)).grossSatang, 2 * 360_000 + halfUpBp(360_000, 7000) + PARK_0142 + R.extras.camera.satang, `gross (${fmt(r2)})`);
  });
  await st("CF-13", "บริบทต้องเหมือนตอนเสนอราคา: เสนอ/ถือที่ WEB แล้วยืนยันด้วย ctx LIFF + quoteId เดิม ⇒ PRICE_CHANGED · ไม่เขียน", async () => {
    await needDb(); const d = await mkDep("2027-03-21"); const h = await holdOk(pub(), [line(d)]);
    codeR(await confirmT(h, { ctx: { ...pub({ ch: "LIFF" }) } }), "PRICE_CHANGED", "ช่องทางต่าง");
    eq((await bksOfBasket(h.v.basketId)).length, 0, "การจอง");
  });
  await st("CF-14", "PUBLIC เลือก PAY_LATER ⇒ VALIDATION PAY_LATER_STAFF_ONLY · ไม่เขียน", async () => {
    await needDb(); const d = await mkDep("2027-03-21"); const h = await holdOk(pub(), [line(d)]);
    codeR(await confirmT(h, { pay: "PAY_LATER" }), "VALIDATION", "PAY_LATER", "PAY_LATER_STAFF_ONLY");
    eq((await bksOfBasket(h.v.basketId)).length, 0, "การจอง");
  });
  let PEND: Rec[] = []; let dPend = "";
  await st("CF-15", "X1 = SHOP_CONFIRMS (ชั้นสินค้า A2) ⇒ PUBLIC ได้ PENDING · hold purpose SHOP_CONFIRM หมดเวลา = now + X2 (DS 12 ชม.) · ผูก bookingId · มี event created ไม่มี confirmed", async () => {
    await needDb(); await setV(tA, [{ key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: PRD.A2.id, value: "SHOP_CONFIRMS" }]);
    dPend = await mkDep("2027-03-22", "A2");
    for (let i = 0; i < 3; i++) { const h = await holdOk(pub(), [line(dPend, { key: "A2", a: 1, c: 0 })]); const r = await confirmT(h); PEND.push({ ...ref0(r), holdId: (h.v.holdIds as string[])[0], r }); }
    ok(PEND.every((p) => p.status === "PENDING"), `สถานะ ${fmt(PEND.map((p) => p.status ?? p.r))}`);
    const h = await holdRow(PEND[0].holdId);
    eq([h.purpose, h.status, h.bookingId, new Date(String(h.expiresAt)).toISOString()], ["SHOP_CONFIRM", "ACTIVE", PEND[0].bookingId, addMin(NOW0, 12 * 60).toISOString()], "hold");
    eq([(await outbox("trips.booking.created")).some((e) => e.payload.bookingId === PEND[0].bookingId), (await outbox("trips.booking.confirmed")).some((e) => e.payload.bookingId === PEND[0].bookingId)], [true, false], "event");
  });
  await st("CF-16", "อนุมัติ PENDING (STAFF) ⇒ HOLD · version 0→1 · hold CAS purpose PAYMENT หมดเวลา = now + T5 (DS 15 นาที)", async () => {
    ok(PEND.length === 3, "CF-15 ไม่ผ่าน"); const now = addMin(NOW0, 30);
    const r = await call("approveTripBooking", staff({ now }), { bookingId: PEND[0].bookingId, expectedVersion: 0, decision: "APPROVE" });
    V(r, "approve");
    const b = await bk(PEND[0].bookingId), h = await holdRow(PEND[0].holdId);
    eq([b.status, b.version, h.purpose, h.status, new Date(String(h.expiresAt)).toISOString()], ["HOLD", 1, "PAYMENT", "ACTIVE", addMin(now, 15).toISOString()], "หลังอนุมัติ");
  });
  await st("CF-17", "อนุมัติด้วยเวอร์ชันเก่า ⇒ STATE_CONFLICT ไม่เปลี่ยน · ปฏิเสธ PENDING ⇒ CANCELLED · hold RELEASED · held ลด", async () => {
    ok(PEND.length === 3, "CF-15 ไม่ผ่าน");
    codeR(await call("approveTripBooking", staff(), { bookingId: PEND[1].bookingId, expectedVersion: 5, decision: "APPROVE" }), "STATE_CONFLICT", "เวอร์ชันเก่า");
    eq((await bk(PEND[1].bookingId)).status, "PENDING", "ไม่เปลี่ยน");
    const held0 = Number((await dep(dPend)).held);
    V(await call("approveTripBooking", staff(), { bookingId: PEND[1].bookingId, expectedVersion: 0, decision: "REJECT", reason: "เรือเต็มช่วงนี้ ขออภัย" }), "reject");
    eq([(await bk(PEND[1].bookingId)).status, (await holdRow(PEND[1].holdId)).status, Number((await dep(dPend)).held)], ["CANCELLED", "RELEASED", held0 - 1], "ปฏิเสธ");
    await invOk([dPend], "CF-17");
  });
  await st("CF-18", "hold หมดเวลาตอนยืนยัน (onExpired ค่าเริ่ม FAIL) ⇒ HOLD_EXPIRED · rollback ทั้งก้อน: ไม่มีการจอง · เลขไม่ถูกใช้ · ตะกร้า OPEN", async () => {
    await needDb(); const d = await mkDep("2027-03-23"); const h = await holdOk(pub(), [line(d)]);
    const s0 = await seqSum(), n0 = await bookingCount();
    codeR(await confirmT(h, { ctx: withNow(h.ctx, addMin(NOW0, 16)) }), "HOLD_EXPIRED", "หมดเวลา");
    eq([await seqSum(), await bookingCount(), (await basket(h.v.basketId)).status], [s0, n0, "OPEN"], "rollback");
  });
  await st("CF-19", "onExpired REHOLD (STAFF) ในธุรกรรมใหม่ ⇒ CONFIRMED · hold เดิมไม่ ACTIVE แล้ว · hold ใหม่ CONVERTED ของการจอง · ค่าคงที่ D.3", async () => {
    await needDb(); const d = await mkDep("2027-03-23"); const h = await holdOk(staff(), [line(d)]); const old = (h.v.holdIds as string[])[0];
    const r = await confirmT(h, { ctx: withNow(h.ctx, addMin(NOW0, 20)), extra: { onExpired: "REHOLD" } });
    const ref = ref0(r); ok(r.ok === true && ref.status === "CONFIRMED", `ผล ${fmt(r)}`);
    const nh = await q<Rec>(`SELECT * FROM "TripHold" WHERE "bookingId" = $1`, [ref.bookingId]);
    eq([(await holdRow(old)).status !== "ACTIVE", nh.some((x) => x.status === "CONVERTED" && x.id !== old), (await dep(d)).sold, (await dep(d)).held], [true, true, 3, 0], "rehold");
    await invOk([d], "CF-19");
  });
  await st("CF-20", "REHOLD เมื่อที่ถูกขายไปแล้ว ⇒ SOLD_OUT ไม่เขียนอะไร (ความจุ 3 · hold เดิมถูกปล่อย · คนอื่นจองครบ)", async () => {
    await needDb(); const d = await mkDep("2027-03-24", "A", 3); const h = await holdOk(staff(), [line(d)]); const old = (h.v.holdIds as string[])[0];
    V(await call("releaseHold", staff({ now: addMin(NOW0, 17) }), { holdId: old, reason: "qc ปล่อยก่อน" }), "releaseHold (T0.4)");
    ok((await bookNow(staff({ now: addMin(NOW0, 18) }), [line(d)])).r.ok === true, "คนอื่นจองไม่ได้");
    const n0 = await bookingCount();
    codeR(await confirmT(h, { ctx: withNow(h.ctx, addMin(NOW0, 20)), extra: { onExpired: "REHOLD" } }), "SOLD_OUT", "rehold");
    eq([await bookingCount(), (await dep(d)).sold, (await dep(d)).held], [n0, 3, 0], "ไม่เขียน");
  });
  const OVR = (unit = 200_000) => [{ itemRef: "seat:ADULT", unitMinor: unit, reason: "ลูกค้าประจำ ส่วนลดพิเศษจากเจ้าของ" }];
  let resolved = 0;
  await st("CF-21", "ราคาแก้มือต่ำกว่า T11 (10%) ⇒ REQUIRES_APPROVAL (details.resolvedMinor) · คำอนุมัติไม่มี resolvedMinor ⇒ VALIDATION APPROVAL_RESOLVED_REQUIRED", async () => {
    await needDb(); const d = await mkDep("2027-03-25");
    const ra = await call("quoteTrips", staff(), { lines: [line(d)] }, { overrides: OVR(), canOverride: true });
    codeR(ra, "REQUIRES_APPROVAL", "quote (T0.5)"); resolved = Number(asRec(ra.details)?.resolvedMinor); eq(resolved, R.adultSatang, "resolvedMinor");
    const q0 = await quoteOf(staff(), [line(d)], { overrides: OVR(), canOverride: true, overrideApprovals: [{ approvalId: "fake-1", itemRef: "seat:ADULT", unitMinor: 200_000 }] });
    const r = (await bookNow(staff(), [line(d)], { overrides: OVR(), approvals: [{ approvalId: "fake-1", itemRef: "seat:ADULT", unitMinor: 200_000 }], canOverride: true, quote: q0 })).r;
    codeR(r, "VALIDATION", "ไม่มี resolvedMinor", "APPROVAL_RESOLVED_REQUIRED");
  });
  await st("CF-22", "คำอนุมัติที่ไม่มีจริง/ไม่ APPROVED (มี resolvedMinor) ⇒ FORBIDDEN APPROVAL_NOT_APPROVED · ไม่เขียน", async () => {
    await needDb(); const d = await mkDep("2027-03-25"); const n0 = await bookingCount();
    const pend = await insertRow("ApprovalRequest", { id: rid("ap"), tenantId: tA, policyId: rid("pol"), entityType: "trips.price_override", entityId: rid("e"), unitId: uA, status: "PENDING", requestedById: String(U.oa.userId), idempotencyKey: `qc-${hex(6)}` });
    for (const id of ["no-such-approval", pend]) {
      const ap = [{ approvalId: id, itemRef: "seat:ADULT", unitMinor: 200_000, resolvedMinor: R.adultSatang }];
      codeR((await bookNow(staff(), [line(d)], { overrides: OVR(), approvals: ap, canOverride: true })).r, "FORBIDDEN", `approval ${id.slice(0, 8)}`, "APPROVAL_NOT_APPROVED");
    }
    eq(await bookingCount(), n0, "ไม่เขียน");
  });
  await st("CF-23", "คำอนุมัติ APPROVED จริง + resolvedMinor ⇒ CONFIRMED · ที่นั่งผู้ใหญ่ 2,000 priceSource MANUAL · audit trips.booking.price_override", async () => {
    await needDb(); const d = await mkDep("2027-03-25");
    const apId = await insertRow("ApprovalRequest", { id: rid("ap"), tenantId: tA, policyId: rid("pol"), entityType: "trips.price_override", entityId: String(fn("tripPriceOverrideEntityId")({ unitId: uA, departureId: d, itemRef: "seat:ADULT", unitMinor: 200_000, resolvedMinor: R.adultSatang })) /* ORACLE-EDIT CF-23 (ผู้คุม 13 พ.ย.): มติ R1 — คำอนุมัติต้องผูกรอบ/รายการ/ยอด */, unitId: uA, status: "APPROVED", requestedById: String(U.oa.userId), decidedAt: new Date(), idempotencyKey: `qc-${hex(6)}` });
    const ap = [{ approvalId: apId, itemRef: "seat:ADULT", unitMinor: 200_000, resolvedMinor: R.adultSatang }];
    const r = (await bookNow(staff(), [line(d)], { overrides: OVR(), approvals: ap, canOverride: true })).r;
    const id = ref0(r).bookingId; ok(r.ok === true, `ผล ${fmt(r)}`);
    const a = (await items(id)).find((i) => i.kind === "SEAT" && i.paxCode === "ADULT");
    eq([a?.unitPriceMinor, a?.priceSource], [200_000, "MANUAL"], "ที่นั่ง");
    ok((await q<{ n: number }>(`SELECT count(*)::int n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.booking.price_override' AND "targetId" = $2`, [tA, id]))[0]?.n === 1, "ไม่มี audit");
    // ORACLE-EDIT CF-23 (ผู้คุม 13 พ.ย.): มติ R1 — ใช้คำอนุมัติเดิมซ้ำ ⇒ APPROVAL_USED · ไม่เขียน
    const n1 = await bookingCount();
    codeR((await bookNow(staff(), [line(d)], { overrides: OVR(), approvals: ap, canOverride: true })).r, "FORBIDDEN", "ใช้คำอนุมัติซ้ำ", "APPROVAL_USED");
    eq(await bookingCount(), n1, "ใช้ซ้ำแล้วไม่เขียน");
  });
  await st("CF-24", "แก้ราคามือโดยไม่มี canOverride (action ไม่ได้ assertCan) ⇒ FORBIDDEN · ไม่เขียน", async () => {
    await needDb(); const d = await mkDep("2027-03-25"); const n0 = await bookingCount();
    const q0 = await quoteOf(staff(), [line(d)]);
    const r = await call("bookTripsNow", staff(), { quote: { lines: [line(d)] }, quoteId: q0.quoteId, quoteExpiresAt: q0.expiresAt, idempotencyKey: `ov${hex(5)}`, booker: booker(), pay: { method: "PAY_LATER" }, priceOverrides: OVR(400_000) }, {});
    codeR(r, "FORBIDDEN", "ไม่มีสิทธิ์");
    eq(await bookingCount(), n0, "ไม่เขียน");
  });
  await st("CF-25", "ผู้เดินทาง: 2 คน ⇒ TripPassenger 2 แถว (ชื่อ · bookingId · itemId ของที่นั่ง) · 4 คนบน 3 ที่ ⇒ VALIDATION TOO_MANY_PASSENGERS ไม่เขียน", async () => {
    await needDb(); const d = await mkDep("2027-03-26"); const ad = PRD.A.pt.ADULT;
    const r = (await bookNow(staff(), [line(d)], { passengers: [{ name: "สมชาย ทดสอบ", paxTypeId: ad }, { name: "สมหญิง ทดสอบ", paxTypeId: ad }] })).r;
    const id = ref0(r).bookingId; ok(r.ok === true, `ผล ${fmt(r)}`);
    const ps = await q<Rec>(`SELECT p."fullName", p."itemId", i.kind FROM "TripPassenger" p LEFT JOIN "TripBookingItem" i ON i.id = p."itemId" WHERE p."bookingId" = $1 ORDER BY p."fullName"`, [id]);
    eq([ps.length, ps.map((p) => p.fullName), ps.every((p) => p.kind === "SEAT")], [2, ["สมชาย ทดสอบ", "สมหญิง ทดสอบ"], true], "ผู้เดินทาง");
    const n0 = await bookingCount();
    codeR((await bookNow(staff(), [line(d)], { passengers: Array.from({ length: 4 }, (_, i) => ({ name: `คน ${i}`, paxTypeId: ad })) })).r, "VALIDATION", "เกินที่นั่ง", "TOO_MANY_PASSENGERS");
    eq(await bookingCount(), n0, "ไม่เขียน");
  });
  await st("CF-26", "PUBLIC ไม่มีช่องติดต่อ (เบอร์/LINE/อีเมล) ⇒ VALIDATION CONTACT_REQUIRED · STAFF ไม่มีช่องติดต่อ (ไม่มีโค้ด) ⇒ จองได้", async () => {
    await needDb(); const d = await mkDep("2027-03-26"); const h = await holdOk(pub(), [line(d, { a: 1, c: 0 })]);
    codeR(await confirmT(h, { booker: { name: "ไม่มีเบอร์" } }), "VALIDATION", "PUBLIC", "CONTACT_REQUIRED");
    ok((await bookNow(staff(), [line(d, { a: 1, c: 0 })], { booker: { name: "ลูกค้าเดินเข้า" } })).r.ok === true, "STAFF ไม่มีเบอร์จองไม่ได้");
  });
  await st("CF-27", "ผู้จอง = Party ของร้าน: bookerPartyId ตั้ง · เบอร์เดียวกันคนละรูป ⇒ Party เดียวกัน · STAFF ส่ง partyId ของร้านอื่น ⇒ NOT_FOUND ไม่เขียน", async () => {
    await needDb(); const d = await mkDep("2027-03-27");
    const b1 = (await bookNow(staff(), [line(d, { a: 1, c: 0 })], { booker: { name: "นภา ทดสอบ", phone: "0899990011" } })).r;
    const b2 = (await bookNow(staff(), [line(d, { a: 1, c: 0 })], { booker: { name: "นภา ทดสอบ", phone: "+66 89 999 0011" } })).r;
    const p1 = (await bk(ref0(b1).bookingId)).bookerPartyId, p2 = (await bk(ref0(b2).bookingId)).bookerPartyId;
    ok(typeof p1 === "string" && p1 === p2, `partyId ${p1} / ${p2}`);
    eq((await q<Rec>(`SELECT "tenantId" FROM "Party" WHERE id = $1`, [p1]))[0]?.tenantId, tA, "Party ของร้าน");
    const n0 = await bookingCount();
    codeR((await bookNow(staff(), [line(d, { a: 1, c: 0 })], { booker: { name: "ข้ามร้าน", partyId: PARTY.b1 } })).r, ["NOT_FOUND", "VALIDATION"], "partyId ร้านอื่น");
    eq(await bookingCount(), n0, "ไม่เขียน");
    ok((await bookNow(staff(), [line(d, { a: 1, c: 0 })], { booker: { name: "ลูกค้าประจำ", partyId: PARTY.a1 } })).r.ok === true, "partyId ของร้านเองใช้ไม่ได้");
  });
  await st("CF-28", "ค่าคงที่ D.3 ของทุกรอบที่ใช้ในกลุ่ม CF (sold = Σ ที่นั่งนับที่ของการจองที่ขายแล้ว · held = Σ hold ACTIVE)", async () => {
    await needDb(); ok((await bookingCount()) >= 20, `การจองของกลุ่ม CF มีแค่ ${await bookingCount()} (ข้อนี้ต้องมีการจองจริงก่อน)`);
    const deps = (await q<{ id: string }>(`SELECT id FROM "TripDeparture" WHERE "tenantId" = $1`, [tA])).map((r) => r.id);
    await invOk(deps, "CF");
  });
  groupLine("CF");

  // ═══════════════ PR. โค้ดส่วนลด ═══════════════
  console.log("\n── PR: โค้ดส่วนลด (ตัดครั้งเดียว · ล้ม = rollback) ──");
  const redemptions = async (ruleId: string, status = "ACTIVE") => q<Rec>(`SELECT * FROM "TripPromoRedemption" WHERE "ruleId" = $1 AND status = $2`, [ruleId, status]);
  const used = async (ruleId: string) => Number((await q<{ u: number }>(`SELECT "usedCount" u FROM "TripPriceRule" WHERE id = $1`, [ruleId]))[0]?.u);
  let PR1: Rec = {}; let PR1rule = ""; let dPR1 = "";
  await st("PR-1", "โค้ด 10% ⇒ ส่วนลด 99,500 สต. (ที่นั่ง 9,450 + กล้อง 500 = 9,950 × 10%) = snapshot.totals.discountSatang = redemption.discountSatang · usedCount 1 · event trips.promo.redeemed", async () => {
    await needDb(); const code = `P1${hex(2)}`.toUpperCase(); PR1rule = await rawRule({ kind: "PROMO_CODE", code, discountBp: 1_000, maxUses: 10 });
    dPR1 = await mkDep("2027-03-28"); const h = await holdOk(pub(), [line(dPR1, { promo: code })]);
    const r = await confirmT(h); PR1 = ref0(r); ok(r.ok === true, `ผล ${fmt(r)}`);
    const b = await bk(PR1.bookingId); const want = halfUpBp(2 * R.adultSatang, 1000) + halfUpBp(R.childSatang, 1000) + halfUpBp(R.extras.camera.satang, 1000);
    const rd = await redemptions(PR1rule);
    eq([b.discountSatang, asRec(asRec(b.policySnapshot)?.totals)?.discountSatang, rd.length, rd[0]?.discountSatang, rd[0]?.bookingId, await used(PR1rule)], [want, want, 1, want, PR1.bookingId, 1], "ส่วนลด");
    ok((await outbox("trips.promo.redeemed")).some((e) => e.payload.bookingId === PR1.bookingId && e.payload.discountSatang === want), "ไม่มี event redeemed");
  });
  await st("PR-2", "maxUses 1 · ลูกค้า 2 คนยืนยันพร้อมกัน ⇒ ได้ส่วนลด 1 การจองพอดี · อีกคน PRICE_CHANGED (ไม่มีการจอง · hold ยัง ACTIVE) · usedCount 1 · redemption 1", async () => {
    await needDb(); const code = `P2${hex(2)}`.toUpperCase(); const rule = await rawRule({ kind: "PROMO_CODE", code, discountBp: 1_000, maxUses: 1 });
    const d = await mkDep("2027-03-28"); const hs = [await holdOk(pub(), [line(d, { promo: code })]), await holdOk(pub(), [line(d, { promo: code })])];
    const rs = await Promise.all(hs.map((h) => confirmT(h)));
    eq([rs.filter((x) => x.ok === true).length, rs.filter((x) => x.ok === false && x.code === "PRICE_CHANGED").length, await used(rule), (await redemptions(rule)).length], [1, 1, 1, 1], `ผล ${fmt(rs.map((x) => x.code ?? x.ok))}`);
    const loser = hs[rs.findIndex((x) => x.ok !== true)];
    eq([(await bksOfBasket(loser.v.basketId)).length, (await holdRow((loser.v.holdIds as string[])[0])).status], [0, "ACTIVE"], "ผู้แพ้");
  });
  let PR3rule = ""; let PR3code = "";
  await st("PR-3", "perContact 1 · ผู้ติดต่อเดียว (0812345678 เว็บ → +66 81-234-5678 หน้าร้าน) ⇒ ครั้งที่ 2 PRICE_CHANGED (PROMO_PER_CONTACT) · usedCount 1 (contactKey กติกาเดียวทุกช่องทาง)", async () => {
    await needDb(); PR3code = `P3${hex(2)}`.toUpperCase(); PR3rule = await rawRule({ kind: "PROMO_CODE", code: PR3code, discountBp: 1_000, maxUses: 10, perContact: 1 });
    const d = await mkDep("2027-03-29"); const h = await holdOk(pub(), [line(d, { promo: PR3code })]);
    ok((await confirmT(h, { booker: { name: "คนเดิม", phone: "0812345678" } })).ok === true, "ครั้งแรก");
    const r2 = (await bookNow(staff(), [line(d, { promo: PR3code })], { booker: { name: "คนเดิม", phone: "+66 81-234-5678" } })).r;
    codeR(r2, "PRICE_CHANGED", "ครั้งที่ 2");
    eq(await used(PR3rule), 1, "usedCount");
  });
  await st("PR-4", "ยืนยันซ้ำคีย์เดิม 5 ครั้งพร้อมกันพร้อมโค้ด ⇒ usedCount +1 ครั้งเดียว · redemption 1 แถว", async () => {
    await needDb(); const code = `P4${hex(2)}`.toUpperCase(); const rule = await rawRule({ kind: "PROMO_CODE", code, discountBp: 500, maxUses: 50 });
    const d = await mkDep("2027-03-29"); const h = await holdOk(pub(), [line(d, { promo: code })]); const key = `pr4${hex(5)}`; const b = booker();
    const rs = await par(5, () => confirmT(h, { key, booker: b }));
    ok(rs.every((x) => x.ok === true), `ล้ม ${fmt(rs.find((x) => x.ok !== true))}`);
    eq([await used(rule), (await redemptions(rule)).length], [1, 1], "ครั้งเดียว");
  });
  await st("PR-5", "ตัดสิทธิ์ล้มในธุรกรรม (perContact ครบ) ⇒ PRICE_CHANGED reason PROMO_PER_CONTACT + details.quote · rollback: เลขไม่ถูกใช้ · ไม่มีการจอง · hold ACTIVE ไม่ผูก · held เท่าเดิม", async () => {
    await needDb(); ok(PR3rule, "PR-3 ไม่ผ่าน"); const d = await mkDep("2027-03-30"); const h = await holdOk(pub(), [line(d, { promo: PR3code })]);
    const s0 = await seqSum(), n0 = await bookingCount(), held0 = (await dep(d)).held;
    const r = await confirmT(h, { booker: { name: "คนเดิม", phone: "081 234 5678" } });
    codeR(r, "PRICE_CHANGED", "per contact", "PROMO_PER_CONTACT");
    ok(typeof asRec(asRec(r.details)?.quote)?.quoteId === "string", "ไม่มี details.quote (ราคาไม่มีโค้ด)");
    const hr = await holdRow((h.v.holdIds as string[])[0]);
    eq([await seqSum(), await bookingCount(), hr.status, hr.bookingId, (await dep(d)).held], [s0, n0, "ACTIVE", null, held0], "rollback");
  });
  await st("PR-6", "STAFF ยกเลิกการจอง HOLD ที่มีโค้ด ⇒ CANCELLED · hold RELEASED (held −3) · redemption RELEASED · usedCount กลับ 0", async () => {
    await needDb(); ok(PR1.bookingId, "PR-1 ไม่ผ่าน"); const held0 = Number((await dep(dPR1)).held);
    V(await call("cancelTripBooking", staff(), { bookingId: PR1.bookingId, mode: "EXECUTE", reason: "ลูกค้าขอยกเลิกก่อนจ่าย", idempotencyKey: `cn${hex(5)}` }), "cancel");
    eq([(await bk(PR1.bookingId)).status, Number((await dep(dPR1)).held), (await redemptions(PR1rule, "RELEASED")).length, await used(PR1rule)], ["CANCELLED", held0 - 3, 1, 0], "ยกเลิก");
    await invOk([dPR1], "PR-6");
  });
  await st("PR-7", "ลำดับยกเลิก (r2 §d ข้อ 4): ในฟังก์ชันยกเลิก/ปฏิเสธ คืนที่นั่ง (releaseHoldInTx/returnSoldInTx) มาก่อน releasePromoInTx ในซอร์ส", () => {
    const s = srcOf(D + "booking.ts"); ok(s, "ยังไม่มี booking.ts");
    const i = s.indexOf("releasePromoInTx("); ok(i > 0, "ไม่เรียก releasePromoInTx");
    const before = s.lastIndexOf("releaseHoldInTx(", i);
    ok(before > 0 && before < i, "releasePromoInTx มาก่อนคืนที่นั่ง");
  });
  groupLine("PR");

  // ═══════════════ CN. ยกเลิกก่อนจ่าย ═══════════════
  console.log("\n── CN: ยกเลิก (HOLD/PENDING เท่านั้น · หลังขาย = T0.7) ──");
  await st("CN-1", "STAFF ยกเลิก HOLD ⇒ CANCELLED · cancelReason · cancelledAt · version +1 · event trips.booking.cancelled · audit trips.booking.cancel", async () => {
    await needDb(); const d = await mkDep("2027-04-01"); const h = await holdOk(pub(), [line(d)]); const id = ref0(await confirmT(h)).bookingId;
    V(await call("cancelTripBooking", staff(), { bookingId: id, mode: "EXECUTE", reason: "ลูกค้าโทรมาขอยกเลิก", idempotencyKey: `cn${hex(5)}` }), "cancel");
    const b = await bk(id);
    eq([b.status, b.cancelReason, b.cancelledAt !== null, b.version, (await dep(d)).held], ["CANCELLED", "ลูกค้าโทรมาขอยกเลิก", true, 1, 0], "แถว");
    ok((await outbox("trips.booking.cancelled")).some((e) => e.payload.bookingId === id && e.payload.status === "CANCELLED"), "ไม่มี event");
    ok((await q<{ n: number }>(`SELECT count(*)::int n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.booking.cancel' AND "targetId" = $2`, [tA, id]))[0]?.n === 1, "ไม่มี audit");
  });
  await st("CN-2", "STAFF ยกเลิก PENDING ⇒ CANCELLED · hold SHOP_CONFIRM ถูกปล่อย", async () => {
    ok(PEND.length === 3, "CF-15 ไม่ผ่าน");
    V(await call("cancelTripBooking", staff(), { bookingId: PEND[2].bookingId, mode: "EXECUTE", reason: "ร้านไม่สะดวกรับ", idempotencyKey: `cn${hex(5)}` }), "cancel");
    eq([(await bk(PEND[2].bookingId)).status, (await holdRow(PEND[2].holdId)).status], ["CANCELLED", "RELEASED"], "ยกเลิก");
    await invOk([dPend], "CN-2");
  });
  await st("CN-3", "ยกเลิกการจองที่ขายแล้ว (CONFIRMED) ⇒ STATE_CONFLICT REFUND_REQUIRED · ไม่เปลี่ยน (version · sold)", async () => {
    ok(CF7.bookingId, "CF-7 ไม่ผ่าน"); const v0 = (await bk(CF7.bookingId)).version;
    codeR(await call("cancelTripBooking", staff(), { bookingId: CF7.bookingId, mode: "EXECUTE", reason: "ลูกค้าขอยกเลิก", idempotencyKey: `cn${hex(5)}` }), "STATE_CONFLICT", "CONFIRMED", "REFUND_REQUIRED");
    eq([(await bk(CF7.bookingId)).status, (await bk(CF7.bookingId)).version, (await dep(dCF7)).sold], ["CONFIRMED", v0, 3], "ไม่เปลี่ยน");
  });
  await st("CN-4", "cancel mode QUOTE ⇒ computed จาก snapshot (source SNAPSHOT) ไม่เขียนอะไร", async () => {
    ok(CF7.bookingId, "CF-7 ไม่ผ่าน"); const v0 = (await bk(CF7.bookingId)).version;
    const r = V(await call("cancelTripBooking", staff(), { bookingId: CF7.bookingId, mode: "QUOTE", reason: "ขอดูยอดคืน", idempotencyKey: `cq${hex(5)}` }), "quote");
    eq([asRec(r.computed)?.source, typeof asRec(r.computed)?.refundSatang, (await bk(CF7.bookingId)).version], ["SNAPSHOT", "number", v0], "QUOTE");
  });
  await st("CN-5", "PUBLIC ยกเลิกเอง (ยังไม่มี OTP · W1.3) ⇒ FORBIDDEN OTP_REQUIRED · ไม่เปลี่ยน", async () => {
    await needDb(); const d = await mkDep("2027-04-01"); const h = await holdOk(pub(), [line(d)]); const id = ref0(await confirmT(h)).bookingId;
    codeR(await call("cancelTripBooking", h.ctx, { bookingId: id, mode: "EXECUTE", reason: "ขอยกเลิก", idempotencyKey: `cp${hex(5)}` }), "FORBIDDEN", "PUBLIC", "OTP_REQUIRED");
    eq((await bk(id)).status, "HOLD", "ไม่เปลี่ยน");
  });
  await st("CN-6", "ยกเลิกซ้ำคีย์เดิม 5 ครั้งพร้อมกัน ⇒ สำเร็จทุกครั้ง · เปลี่ยนสถานะครั้งเดียว (version 1) · event cancelled 1 · คีย์ใหม่หลังยกเลิก ⇒ STATE_CONFLICT", async () => {
    await needDb(); const d = await mkDep("2027-04-02"); const h = await holdOk(pub(), [line(d)]); const id = ref0(await confirmT(h)).bookingId; const key = `cn6${hex(5)}`;
    const rs = await par(5, () => call("cancelTripBooking", staff(), { bookingId: id, mode: "EXECUTE", reason: "ยกเลิกซ้ำ ทดสอบ", idempotencyKey: key }));
    ok(rs.every((x) => x.ok === true), `ล้ม ${fmt(rs.find((x) => x.ok !== true))}`);
    eq([(await bk(id)).version, (await outbox("trips.booking.cancelled")).filter((e) => e.payload.bookingId === id).length, (await dep(d)).held], [1, 1, 0], "ครั้งเดียว");
    codeR(await call("cancelTripBooking", staff(), { bookingId: id, mode: "EXECUTE", reason: "ยกเลิกอีก", idempotencyKey: `cn${hex(5)}` }), "STATE_CONFLICT", "คีย์ใหม่");
  });
  groupLine("CN");

  // ═══════════════ MV. แก้คน / เลื่อนวัน ═══════════════
  console.log("\n── MV: แก้คน/เลื่อนวัน (หน่วย A2 · prefix QT) ──");
  const lineC = (d: string, a = 2, c = 1) => line(d, { key: "C", a, c });
  const change = async (id: unknown, ln: Rec, o: { version?: number; ctx?: Rec; quoteId?: string; useCurrentPolicy?: boolean; reason?: string } = {}) => {
    const ctx = o.ctx ?? staff({ unit: uA2 });
    const qv = await quoteOf(ctx, [ln]);
    const v = o.version ?? Number((await bk(id)).version);
    return call("changeTripBooking", ctx, { bookingId: id, expectedVersion: v, line: ln, quoteId: o.quoteId ?? qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `mv${hex(5)}`, ...(o.useCurrentPolicy ? { useCurrentPolicy: true } : {}), ...(o.reason ? { reason: o.reason } : {}) }, {});
  };
  let MV: Rec = {}; let m1 = "", m2 = "";
  await st("MV-1", "เลื่อน CONFIRMED 3 คน D1→D2 ⇒ sold D1 −3 D2 +3 · เลขเดิม (L-15) · สถานะเดิม · version +1 · departureId/travelDate ใหม่ · รายการเดิม active=false (ไม่ลบ) + รายการใหม่บน D2", async () => {
    await needDb(); m1 = await mkDep("2027-04-05", "C"); m2 = await mkDep("2027-04-06", "C");
    MV = ref0((await bookNow(staff({ unit: uA2 }), [lineC(m1)])).r); ok(MV.bookingId, "จองไม่ได้");
    const n0 = (await items(MV.bookingId)).length;
    V(await change(MV.bookingId, lineC(m2)), "change");
    const b = await bk(MV.bookingId); const its = await items(MV.bookingId);
    eq([b.code, b.status, b.version, b.departureId, new Date(String(b.travelDate)).toISOString().slice(0, 10), (await dep(m1)).sold, (await dep(m2)).sold], [MV.code, "CONFIRMED", 1, m2, "2027-04-06", 0, 3], "หลังเลื่อน");
    eq([its.length, its.filter((i) => i.active === false && i.departureId === m1).length, its.filter((i) => i.active === true && i.departureId === m2).length], [2 * n0, n0, n0], "รายการ");
    await invOk([m1, m2], "MV-1");
  });
  await st("MV-2", "เลื่อนวันคงตารางยกเลิกของ snapshot เดิม (แก้ค่าตั้ง T20 หลังจอง) · useCurrentPolicy + เหตุผล ≥ 10 ตัว ⇒ ใช้ตารางปัจจุบัน · เหตุผลสั้น ⇒ VALIDATION", async () => {
    ok(MV.bookingId, "MV-1 ไม่ผ่าน");
    const old = asRec((await bk(MV.bookingId)).policySnapshot)?.cancelLadder;
    await setV(tA, [{ key: "trips.cancel.ladder", scope: "UNIT", scopeId: uA2, value: [{ fromDaysBefore: 7, refundPct: 100 }, { fromDaysBefore: 0, refundPct: 0 }] }]);
    V(await change(MV.bookingId, lineC(m1)), "change กลับ");
    eq(asRec((await bk(MV.bookingId)).policySnapshot)?.cancelLadder, old, "ตารางเดิม");
    codeR(await change(MV.bookingId, lineC(m2), { useCurrentPolicy: true, reason: "สั้น" }), "VALIDATION", "เหตุผลสั้น");
    V(await change(MV.bookingId, lineC(m2), { useCurrentPolicy: true, reason: "ลูกค้าขอใช้เงื่อนไขใหม่ของร้าน" }), "useCurrentPolicy");
    eq(asRec((await bk(MV.bookingId)).policySnapshot)?.cancelLadder, [{ daysBefore: 7, refundBp: 10000 }, { daysBefore: 0, refundBp: 0 }], "ตารางปัจจุบัน");
  });
  await st("MV-3", "audit trips.booking.change (before/after มีรอบ · ไม่มีชื่อ/เบอร์) · event trips.booking.changed payload ตรงชุด · คีย์มี version", async () => {
    ok(MV.bookingId, "MV-1 ไม่ผ่าน");
    const a = await q<Rec>(`SELECT before, after FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.booking.change' AND "targetId" = $2`, [tA, MV.bookingId]);
    ok(a.length >= 1 && /departureId/.test(JSON.stringify(a[0])) && !/ลูกค้าทดสอบ|08\d{8}/.test(JSON.stringify(a)), `audit ${fmt(a[0])}`);
    const ev = (await outbox("trips.booking.changed")).filter((e) => e.payload.bookingId === MV.bookingId);
    ok(ev.length >= 1, "ไม่มี event changed");
    eq(Object.keys(ev[0].payload).sort(), PAYLOAD_KEYS, "payload");
    ok(new Set(ev.map((e) => e.idempotencyKey)).size === ev.length && ev.every((e) => /^trips\.booking\.changed:/.test(e.idempotencyKey)), "คีย์ event");
  });
  await st("MV-4", "เลื่อนไปรอบที่เต็ม ⇒ SOLD_OUT · ไม่เปลี่ยนอะไร (version · รอบ · ตัวนับ)", async () => {
    ok(MV.bookingId, "MV-1 ไม่ผ่าน"); const full = await mkDep("2027-04-07", "C", 2); const b0 = await bk(MV.bookingId);
    codeR(await change(MV.bookingId, lineC(full)), "SOLD_OUT", "เต็ม");
    const b1 = await bk(MV.bookingId);
    eq([b1.version, b1.departureId, (await dep(full)).sold, (await dep(String(b0.departureId))).sold], [b0.version, b0.departureId, 0, 3], "ไม่เปลี่ยน");
  });
  await st("MV-5", "expectedVersion เก่า ⇒ STATE_CONFLICT · quoteId ไม่ตรง ⇒ PRICE_CHANGED · ไม่เปลี่ยน", async () => {
    ok(MV.bookingId, "MV-1 ไม่ผ่าน"); const b0 = await bk(MV.bookingId); const d = await mkDep("2027-04-08", "C");
    codeR(await change(MV.bookingId, lineC(d), { version: Number(b0.version) - 1 }), "STATE_CONFLICT", "เวอร์ชันเก่า");
    codeR(await change(MV.bookingId, lineC(d), { quoteId: "f".repeat(64) }), "PRICE_CHANGED", "quoteId");
    eq([(await bk(MV.bookingId)).version, (await dep(d)).sold], [b0.version, 0], "ไม่เปลี่ยน");
  });
  await st("MV-6", "เพิ่มคน 3→4 รอบเดิม ⇒ sold +1 · gross ใหม่ · ลด 4→2 ⇒ sold −2 · เลขเดิม", async () => {
    await needDb(); const d = await mkDep("2027-04-09", "C"); const r = ref0((await bookNow(staff({ unit: uA2 }), [lineC(d)])).r); ok(r.bookingId, "จองไม่ได้");
    V(await change(r.bookingId, lineC(d, 3, 1)), "เพิ่ม");
    eq([(await dep(d)).sold, (await bk(r.bookingId)).grossSatang], [4, 3 * R.adultSatang + R.childSatang + 3 * R.parkAdultSatang + R.parkChildSatang + R.extras.camera.satang], "เพิ่ม");
    V(await change(r.bookingId, lineC(d, 2, 0)), "ลด");
    eq([(await dep(d)).sold, (await bk(r.bookingId)).code], [2, r.code], "ลด");
    await invOk([d], "MV-6");
  });
  await st("MV-7", "แก้การจอง HOLD ⇒ STATE_CONFLICT CHANGE_BEFORE_CONFIRM · แก้โดย PUBLIC ⇒ FORBIDDEN", async () => {
    await needDb(); const d = await mkDep("2027-04-10", "C"); const h = await holdOk(pub({ unit: uA2 }), [lineC(d)]); const id = ref0(await confirmT(h)).bookingId; ok(id, "จอง HOLD ไม่ได้");
    codeR(await change(id, lineC(d, 1, 0)), "STATE_CONFLICT", "HOLD", "CHANGE_BEFORE_CONFIRM");
    codeR(await change(MV.bookingId, lineC(m1), { ctx: pub({ unit: uA2 }) }), ["FORBIDDEN", "NOT_FOUND"], "PUBLIC");
  });
  await st("MV-8", "เลื่อนสลับทิศพร้อมกัน 8 คู่ (P: E1→E2 ∥ Q: E2→E1) ⇒ ไม่มี THROW/BUSY/deadlock · ค่าคงที่ D.3", async () => {
    await needDb(); const e1 = await mkDep("2027-04-11", "C", 60), e2 = await mkDep("2027-04-12", "C", 60);
    const P: Rec[] = [], Qs: Rec[] = [];
    for (let i = 0; i < 8; i++) { P.push(ref0((await bookNow(staff({ unit: uA2 }), [lineC(e1, 1, 0)])).r)); Qs.push(ref0((await bookNow(staff({ unit: uA2 }), [lineC(e2, 1, 0)])).r)); }
    ok([...P, ...Qs].every((x) => x.bookingId), "จองตั้งต้นไม่ได้");
    const rs = await withTimer(Promise.all([...P.map((x) => change(x.bookingId, lineC(e2, 1, 0))), ...Qs.map((x) => change(x.bookingId, lineC(e1, 1, 0)))]), 120_000, "MV-8");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    ok(rs.every((x) => x.ok === true), `ล้ม ${fmt(rs.find((x) => x.ok !== true))}`);
    await invOk([e1, e2], "MV-8");
  });
  groupLine("MV");

  // ═══════════════ BK. platform/basket ═══════════════
  console.log("\n── BK: platform/basket.ts ──");
  const B = await tryImport("@/lib/platform/basket");
  const bcall = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = B.mod?.[name]; if (typeof f !== "function") throw new AssertFail(`platform/basket ยังไม่มี ${name} (${B.err.slice(0, 80)})`);
    try { return asRec(await (f as AnyFn)(...a)) ?? {}; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };
  await st("BK-1", "basketHold + basketConfirm (ตะกร้า TRIP ชนิดเดียว) ⇒ ผลเดียวกับ tripSellable: การจอง HOLD ผูก basketId · hold ACTIVE ผูกการจอง", async () => {
    await needDb(); const d = await mkDep("2027-04-13"); const ctx = pub(); const ln = [line(d)]; const qv = await quoteOf(ctx, ln); const token = tok();
    const h = V(await bcall("basketHold", ctx, { quote: { lines: ln }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `bk${hex(5)}`, basketToken: token }), "basketHold");
    const r = await bcall("basketConfirm", ctx, { basketId: h.basketId, holdIds: h.holdIds, idempotencyKey: `bc${hex(5)}`, quoteId: qv.quoteId, quote: { lines: ln }, booker: booker(), pay: { method: "PAY_NOW" }, basketToken: token });
    const id = asArr(r.value)[0]?.bookingId; ok(r.ok === true && id, `basketConfirm ${fmt(r)}`);
    eq([(await bk(id)).status, (await bk(id)).basketId, (await holdRow((h.holdIds as string[])[0])).bookingId], ["HOLD", h.basketId, id], "ผล");
  });
  await st("BK-2", "ตะกร้ามีบรรทัด TICKET (ยังไม่มี sellable · K1.1) ⇒ KIND_NOT_SUPPORTED ก่อนแตะฐาน: ไม่มี SellBasket/TripHold ใหม่ · ตัวนับเท่าเดิม", async () => {
    await needDb(); const d = await mkDep("2027-04-13"); const token = tok();
    const tline = { productKind: "TICKET", unitId: uA, productId: "tk-event", slotId: "tk-session", pax: [{ paxTypeId: "tk-type", qty: 2 }] };
    const r = await bcall("basketHold", pub(), { quote: { lines: [line(d), tline] }, quoteId: "0".repeat(64), quoteExpiresAt: addMin(NOW0, 15).toISOString(), idempotencyKey: `bt${hex(5)}`, basketToken: token });
    codeR(r, "KIND_NOT_SUPPORTED", "TICKET");
    eq([(await q<{ n: number }>(`SELECT count(*)::int n FROM "SellBasket" WHERE "publicTokenHash" = $1`, [sha256hex(token)]))[0]?.n, (await dep(d)).held], [0, 0], "ไม่เขียน");
  });
  await st("BK-3", "ตะกร้า 3 บรรทัด 2 สินค้า 2 รอบ (STAFF bookTripsNow) ⇒ การจอง 3 แถว basketId เดียวกัน · BookingRef เรียงตามบรรทัด · เลขไม่ซ้ำ", async () => {
    await needDb(); const d1 = await mkDep("2027-04-14"), d2 = await mkDep("2027-04-14", "A2");
    const lns = [line(d2, { key: "A2", a: 1, c: 0 }), line(d1, { a: 2, c: 0 }), line(d1, { a: 1, c: 1 })];
    const r = (await bookNow(staff(), lns)).r; const refs = VA(r, "bookTripsNow");
    const rows = await Promise.all(refs.map((x) => bk(x.bookingId)));
    eq([refs.length, new Set(rows.map((b) => b.basketId)).size, rows.map((b) => b.departureId), new Set(refs.map((x) => x.code)).size], [3, 1, [d2, d1, d1], 3], "ตะกร้า");
    await invOk([d1, d2], "BK-3");
  });
  await st("BK-4", "ตะกร้า 2 บรรทัด · hold บรรทัดที่ 2 หมดเวลาแล้ว ⇒ HOLD_EXPIRED ทั้งตะกร้า: ไม่มีการจอง · hold บรรทัดแรกยัง ACTIVE ไม่ผูก", async () => {
    await needDb(); const d1 = await mkDep("2027-04-15"), d2 = await mkDep("2027-04-15", "A2");
    const h = await holdOk(pub(), [line(d1, { a: 1, c: 0 }), line(d2, { key: "A2", a: 1, c: 0 })]); const ids = h.v.holdIds as string[];
    await pool.query(`UPDATE "TripHold" SET "expiresAt" = $2 WHERE id = $1`, [ids[1], addMin(NOW0, 1)]); // ข้อมูลทดสอบของร้านชั่วคราว
    codeR(await confirmT(h, { ctx: withNow(h.ctx, addMin(NOW0, 5)) }), "HOLD_EXPIRED", "ทั้งตะกร้า");
    const h0 = await holdRow(ids[0]);
    eq([(await bksOfBasket(h.v.basketId)).length, h0.status, h0.bookingId], [0, "ACTIVE", null], "rollback");
  });
  await st("BK-5", "ลำดับล็อกตะกร้าหลายสินค้า (r2 §d ข้อ 2): 16 ตะกร้าพร้อมกันสลับลำดับบรรทัด [A/D1, A2/D2] ∥ [A2/D2, A/D1] + ตัวเขียนแถวสินค้าแทรก ⇒ ไม่มี THROW/BUSY · ค่าคงที่ D.3", async () => {
    await needDb(); const d1 = await mkDep("2027-04-16", "A", 60), d2 = await mkDep("2027-04-16", "A2", 60);
    let stop = false;
    const writer = (async () => { let n = 0; while (!stop && n < 400) { n++; try { await pool.query(`UPDATE "TripProduct" SET "updatedAt" = now() WHERE id = $1`, [n % 2 ? PRD.A.id : PRD.A2.id]); } catch { /* ignore */ } await sleep(2); } })();
    const rs = await withTimer(par(16, async (i) => (await bookNow(staff(), i % 2 ? [line(d1, { a: 1, c: 0 }), line(d2, { key: "A2", a: 1, c: 0 })] : [line(d2, { key: "A2", a: 1, c: 0 }), line(d1, { a: 1, c: 0 })])).r), 120_000, "BK-5");
    stop = true; await writer;
    ok(!rs.some(badOutcome), `ผลเสีย ${rs.filter(badOutcome).length}: ${fmt(rs.find(badOutcome))}`);
    ok(rs.every((x) => x.ok === true), `ล้ม ${fmt(rs.find((x) => x.ok !== true))}`);
    await invOk([d1, d2], "BK-5");
  });
  groupLine("BK");

  // ═══════════════ RC. ยิงพร้อมกัน ═══════════════
  console.log("\n── RC: ยิงพร้อมกัน (MP §5 ก) ──");
  await st("RC-1", "ที่สุดท้าย: รอบความจุ 1 · STAFF bookTripsNow 12 ครั้งพร้อมกัน ⇒ สำเร็จ 1 พอดี · ที่เหลือ SOLD_OUT · sold 1 · ตัวสุ่มอ่านไม่เจอค่าเกิน", async () => {
    await needDb(); const d = await mkDep("2027-04-20", "A", 1); const stop = sampler("TripDeparture", [d]);
    const rs = await withTimer(par(12, async () => (await bookNow(staff(), [line(d, { a: 1, c: 0, camera: false })])).r), 90_000, "RC-1");
    const s = await stop();
    eq([rs.filter((x) => x.ok === true).length, rs.filter((x) => x.code === "SOLD_OUT").length, (await dep(d)).sold, s.viol.length], [1, 11, 1, 0], `ผล ${fmt(rs.filter((x) => x.ok !== true && x.code !== "SOLD_OUT"))}`);
    await invOk([d], "RC-1");
  });
  await st("RC-2", "ที่สุดท้ายทางหน้าจอง: 12 ตะกร้า PUBLIC ถือ 1 ที่พร้อมกัน ⇒ ถือได้ 1 · แล้วยืนยันตะกร้านั้น 6 ครั้งพร้อมกันคีย์เดิม ⇒ การจอง 1 · held 1", async () => {
    await needDb(); const d = await mkDep("2027-04-21", "A", 1); const ln = [line(d, { a: 1, c: 0, camera: false })];
    const hs = await Promise.all(Array.from({ length: 12 }, () => holdT(pub(), ln)));
    const win = hs.filter((h) => h.r.ok === true);
    eq([win.length, hs.filter((h) => h.r.code === "SOLD_OUT").length], [1, 11], "ถือ");
    const key = `rc2${hex(5)}`; const b = booker();
    const rs = await par(6, () => confirmT(win[0], { key, booker: b }));
    eq([rs.every((x) => x.ok === true), (await bksOfBasket(win[0].v.basketId)).length, (await dep(d)).held], [true, 1, 1], "ยืนยัน");
    await invOk([d], "RC-2");
  });
  await st("RC-3", "ยกเลิก ∥ อนุมัติ บนการจอง PENDING เดียวกัน 6 คู่ ⇒ ไม่มี THROW/BUSY · สถานะสุดท้าย CANCELLED (hold RELEASED) หรือ HOLD (hold ACTIVE PAYMENT) · version = จำนวนครั้งที่สำเร็จ", async () => {
    await needDb(); const d = await mkDep("2027-04-22", "A2", 30); const bs: Rec[] = [];
    for (let i = 0; i < 6; i++) { const h = await holdOk(pub(), [line(d, { key: "A2", a: 1, c: 0 })]); bs.push({ ...ref0(await confirmT(h)), holdId: (h.v.holdIds as string[])[0] }); }
    ok(bs.every((b) => b.status === "PENDING"), `ตั้งต้น ${fmt(bs.map((b) => b.status))}`);
    const rs = await withTimer(Promise.all(bs.flatMap((b) => [call("approveTripBooking", staff(), { bookingId: b.bookingId, expectedVersion: 0, decision: "APPROVE" }), call("cancelTripBooking", staff(), { bookingId: b.bookingId, mode: "EXECUTE", reason: "ยกเลิกแข่งกับอนุมัติ", idempotencyKey: `rc3${hex(5)}` })])), 90_000, "RC-3");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    for (let i = 0; i < bs.length; i++) {
      const b = await bk(bs[i].bookingId), h = await holdRow(bs[i].holdId); const succ = [rs[2 * i], rs[2 * i + 1]].filter((x) => x.ok === true).length;
      ok((b.status === "CANCELLED" && h.status === "RELEASED") || (b.status === "HOLD" && h.status === "ACTIVE" && h.purpose === "PAYMENT"), `การจอง ${i}: ${b.status}/${h.status}/${h.purpose}`);
      eq(b.version, succ, `version ${i}`);
    }
    await invOk([d], "RC-3");
  });
  await st("RC-4", "ผสม 30 คำสั่งพร้อมกันบน 3 รอบ (จองหน้าร้าน · ถือ+ยืนยันเว็บ · ยกเลิก HOLD) ⇒ ไม่มี THROW/BUSY · ค่าคงที่ D.3 ทุกรอบ", async () => {
    await needDb(); const ds = [await mkDep("2027-04-23", "A", 20), await mkDep("2027-04-24", "A", 20), await mkDep("2027-04-25", "A", 20)];
    const pre: string[] = [];
    for (let i = 0; i < 6; i++) { const h = await holdOk(pub(), [line(ds[i % 3], { a: 1, c: 0 })]); pre.push(String(ref0(await confirmT(h)).bookingId)); }
    const rs = await withTimer(par(30, async (i) => {
      if (i % 3 === 0) return (await bookNow(staff(), [line(ds[i % 3], { a: 1, c: 0, camera: false })])).r;
      if (i % 3 === 1) { const h = await holdT(pub(), [line(ds[i % 3], { a: 1, c: 0 })]); return h.r.ok === true ? confirmT(h) : h.r; }
      return call("cancelTripBooking", staff(), { bookingId: pre[i % 6], mode: "EXECUTE", reason: "ยกเลิกระหว่างผสม", idempotencyKey: `rc4${i % 6}${STAMP}` });
    }), 120_000, "RC-4");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    await invOk(ds, "RC-4");
  });
  groupLine("RC");

  // ═══════════════ NC. ไม่มี connection ที่สองในธุรกรรม ═══════════════
  console.log("\n── NC: 14 ขนาน · pool 10 (r2 §d ข้อ 1 · N3) ──");
  await st("NC-1", "14 bookTripsNow พร้อมกัน (คนละรอบ) ⇒ สำเร็จทั้งหมดภายใน 90 วิ · ไม่มี BUSY/P2028/Transaction already closed", async () => {
    await needDb(); const ds = await Promise.all(Array.from({ length: 14 }, (_, i) => mkDep(`2027-05-${String(1 + i).padStart(2, "0")}`)));
    const rs = await withTimer(par(14, async (i) => (await bookNow(staff(), [line(ds[i])])).r), 90_000, "NC-1");
    ok(!rs.some(badOutcome) && rs.every((x) => x.ok === true), `ผล ${fmt(rs.find((x) => x.ok !== true))}`);
  });
  await st("NC-2", "14 confirmTrips (PUBLIC) พร้อมกัน ⇒ สำเร็จทั้งหมดภายใน 90 วิ · ไม่มี BUSY/P2028", async () => {
    await needDb(); const ds = await Promise.all(Array.from({ length: 14 }, (_, i) => mkDep(`2027-05-${String(15 + i).padStart(2, "0")}`)));
    const hs: H[] = []; for (const d of ds) hs.push(await holdOk(pub(), [line(d)]));
    const rs = await withTimer(Promise.all(hs.map((h) => confirmT(h))), 90_000, "NC-2");
    ok(!rs.some(badOutcome) && rs.every((x) => x.ok === true), `ผล ${fmt(rs.find((x) => x.ok !== true))}`);
  });
  await st("NC-3", "transitionBookingInTx ใน tx ของผู้เรียก 14 พร้อมกัน (CONFIRMED→TRAVELLED · STAFF) ⇒ สำเร็จทั้งหมดภายใน 60 วิ · ไม่มี P2028 · version +1", async () => {
    await needDb(); const d = await mkDep("2027-05-30", "A", 60);
    const ids: string[] = []; for (let i = 0; i < 14; i++) ids.push(String(ref0((await bookNow(staff(), [line(d, { a: 1, c: 0, camera: false })])).r).bookingId));
    const rs = await withTimer(Promise.all(ids.map((id) => inTx(tA, uA, async (tx) => fn("transitionBookingInTx")(tx, staff(), { bookingId: id, from: "CONFIRMED", to: "TRAVELLED", expectedVersion: 0 })))), 60_000, "NC-3");
    ok(!rs.some(badOutcome) && rs.every((x) => x.ok === true), `ผล ${fmt(rs.find((x) => x.ok !== true))}`);
    eq((await q<{ s: string; v: number }>(`SELECT DISTINCT status s, version v FROM "TripBooking" WHERE id = ANY($1::text[])`, [ids])).map((r) => `${r.s}/${r.v}`), ["TRAVELLED/1"], "สถานะ");
  });
  await st("NC-4", "transitionBookingInTx ปฏิเสธ: HOLD→TRAVELLED ⇒ STATE_CONFLICT TRANSITION_NOT_ALLOWED · เวอร์ชันเก่า ⇒ STATE_CONFLICT · PUBLIC CONFIRMED→CANCELLED ⇒ FORBIDDEN · ไม่เปลี่ยน", async () => {
    await needDb(); const d = await mkDep("2027-05-31"); const id = String(ref0((await bookNow(staff(), [line(d)])).r).bookingId);
    const t = (ctx: Rec, from: string, to: string, v: number) => inTx(tA, uA, async (tx) => fn("transitionBookingInTx")(tx, ctx, { bookingId: id, from, to, expectedVersion: v }));
    codeR(await t(staff(), "CONFIRMED", "EXPIRED", 0), "STATE_CONFLICT", "CONFIRMED→EXPIRED", "TRANSITION_NOT_ALLOWED");
    codeR(await t(staff(), "CONFIRMED", "TRAVELLED", 7), "STATE_CONFLICT", "เวอร์ชันเก่า");
    codeR(await t(pub(), "CONFIRMED", "CANCELLED", 0), "FORBIDDEN", "PUBLIC");
    eq([(await bk(id)).status, (await bk(id)).version], ["CONFIRMED", 0], "ไม่เปลี่ยน");
  });
  groupLine("NC");

  // ═══════════════ X1. แยกร้าน/หน่วย ═══════════════
  console.log("\n── X1: แยกร้าน/หน่วย (MP §5 ง) ──");
  await st("X1-1", "ร้าน B ยืนยันตะกร้า/hold ของร้าน A ⇒ HOLD_NOT_FOUND/NOT_FOUND · ไม่มีการจอง · hold ร้าน A ไม่เปลี่ยน", async () => {
    await needDb(); const d = await mkDep("2027-06-01"); const h = await holdOk(staff(), [line(d)]);
    const r = await confirmT(h, { ctx: staff({ tenant: tB, unit: uB, who: "ob" }) });
    codeR(r, ["HOLD_NOT_FOUND", "NOT_FOUND", "PRICE_CHANGED"], "ข้ามร้าน");
    eq([(await bksOfBasket(h.v.basketId)).length, (await holdRow((h.v.holdIds as string[])[0])).status], [0, "ACTIVE"], "ไม่เปลี่ยน");
  });
  await st("X1-2", "หน่วย A2 อ้าง id การจองของหน่วย A ⇒ NOT_FOUND ข้อความเดียวกันทุกคำสั่ง (get · cancel · approve · change) · ไม่เปลี่ยน", async () => {
    ok(CF7.bookingId, "CF-7 ไม่ผ่าน"); const c2 = staff({ unit: uA2 });
    const rs = [await call("getTripBooking", c2, { bookingId: CF7.bookingId }), await call("cancelTripBooking", c2, { bookingId: CF7.bookingId, mode: "EXECUTE", reason: "ข้ามหน่วย ทดสอบ", idempotencyKey: `x1${hex(5)}` }),
      await call("approveTripBooking", c2, { bookingId: CF7.bookingId, expectedVersion: 0, decision: "APPROVE" }), await call("getTripBooking", staff({ tenant: tB, unit: uB, who: "ob" }), { bookingId: CF7.bookingId })];
    for (const [i, r] of rs.entries()) codeR(r, "NOT_FOUND", `คำสั่ง ${i}`);
    eq(new Set(rs.map((r) => r.messageTh)).size, 1, "ข้อความ");
    eq((await bk(CF7.bookingId)).version, 0, "ไม่เปลี่ยน");
  });
  await st("X1-3", "listTripBookings: หน่วย A2 ไม่เห็นการจองหน่วย A · ร้าน B ไม่เห็นร้าน A · DTO ไม่มี publicTokenHash/publicToken", async () => {
    await needDb();
    const a2 = asArr(V(await call("listTripBookings", staff({ unit: uA2 }), {}), "list A2").items);
    const bb = asArr(V(await call("listTripBookings", staff({ tenant: tB, unit: uB, who: "ob" }), {}), "list B").items);
    ok(a2.length > 0 && !a2.some((x) => x.id === CF7.bookingId || x.bookingId === CF7.bookingId), "A2 เห็นของ A");
    ok(!bb.some((x) => x.id === CF7.bookingId || x.bookingId === CF7.bookingId), "B เห็นของ A");
    ok(!/publicToken/.test(JSON.stringify([a2.slice(0, 3), V(await call("getTripBooking", staff(), { bookingId: CF7.bookingId }), "get")])), "DTO มี publicToken");
  });
  await st("X1-4", "PUBLIC อ่านการจองด้วย id ⇒ FORBIDDEN/NOT_FOUND (หน้า my/[token] = W1.3)", async () => {
    ok(CF7.bookingId, "CF-7 ไม่ผ่าน");
    codeR(await call("getTripBooking", pub(), { bookingId: CF7.bookingId }), ["FORBIDDEN", "NOT_FOUND"], "PUBLIC get");
  });
  await st("X1-5", "STAFF จองใส่สินค้า/รอบของหน่วยอื่น (บรรทัด unitId = A2 ใน ctx หน่วย A) ⇒ NOT_FOUND ไม่เขียน", async () => {
    await needDb(); const d = await mkDep("2027-06-02", "C"); const n0 = await bookingCount();
    const ln = [line(d, { key: "C" })];
    const r = await call("bookTripsNow", staff(), { quote: { lines: ln }, quoteId: "0".repeat(64), quoteExpiresAt: addMin(NOW0, 15).toISOString(), idempotencyKey: `x5${hex(5)}`, booker: booker(), pay: { method: "PAY_LATER" } }, {});
    codeR(r, ["NOT_FOUND", "PRICE_CHANGED"], "ข้ามหน่วย");
    eq([await bookingCount(), (await dep(d)).held, (await dep(d)).sold], [n0, 0, 0], "ไม่เขียน");
  });
  groupLine("X1");

  // ═══════════════ PM. สิทธิ์ ═══════════════
  console.log("\n── PM: สิทธิ์ใน action ──");
  const actions = srcOf(D + "booking-actions.ts");
  const fnBodies = (s: string): { name: string; body: string }[] => { const out: { name: string; body: string }[] = []; const ms = [...s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)]; for (let i = 0; i < ms.length; i++) out.push({ name: ms[i][1], body: s.slice(ms[i].index ?? 0, ms[i + 1]?.index ?? s.length) }); return out; };
  await st("PM-1", "action ทุกตัวเรียก requireUnit + assertCan · ใช้คีย์ trips.booking.* ครบ 5 ตัวในไฟล์", () => {
    ok(actions, "ยังไม่มี booking-actions.ts");
    const fs = fnBodies(actions); ok(fs.length >= 5, `action ${fs.length} ตัว`);
    const bad = fs.filter((f) => !/requireUnit\(/.test(f.body) || !/assertCan\(/.test(f.body)).map((f) => f.name);
    ok(bad.length === 0, `ไม่ตรวจสิทธิ์: ${bad.join(", ")}`);
    const miss = PERM_KEYS.filter((k) => !actions.includes(`"${k}"`) && !actions.includes(`'${k}'`));
    ok(miss.length === 0, `ไม่ใช้คีย์: ${miss.join(", ")}`);
  });
  await st("PM-2", "canOverride: true ส่งได้เฉพาะหลัง assertCan(\"trips.price.override\") ในฟังก์ชันเดียวกัน", () => {
    ok(actions, "ยังไม่มี booking-actions.ts");
    const bad = fnBodies(actions).filter((f) => /canOverride\s*:\s*true/.test(f.body)).filter((f) => { const a = f.body.search(/assertCan\([^)]*trips\.price\.override/); const c = f.body.search(/canOverride\s*:\s*true/); return a < 0 || a > c; }).map((f) => f.name);
    ok(/canOverride/.test(actions), "ไม่มีทางส่ง canOverride");
    ok(bad.length === 0, `canOverride ก่อน assertCan: ${bad.join(", ")}`);
  });
  await st("PM-3", "action ไม่ส่ง actor อื่นนอกจาก STAFF ของ session (ไม่มี kind: \"SYSTEM\"/\"PUBLIC\" ใน actions) · ไม่ส่ง now", () => {
    ok(actions, "ยังไม่มี booking-actions.ts");
    ok(!/kind\s*:\s*["'](SYSTEM|PUBLIC|AGENT)["']/.test(actions), "action ปลอมผู้กระทำ");
    ok(!/\bnow\s*:/.test(stripStrings(actions)), "action ส่ง now");
  });
  groupLine("PM");

  // ═══════════════ EV. event + audit ═══════════════
  console.log("\n── EV: event/audit (CC :904 · ไม่มีข้อมูลบุคคล) ──");
  await st("EV-1", "trips.booking.created: payload ตรงชุด {amountSatang bookingId channel departureId status unitId} · amountSatang 11,450 · ไม่มีชื่อ/เบอร์/เลขจอง", async () => {
    ok(CF1.bookingId, "CF-1 ไม่ผ่าน");
    const ev = (await outbox("trips.booking.created")).filter((e) => e.payload.bookingId === CF1.bookingId);
    eq(ev.length, 1, "จำนวน");
    eq([Object.keys(ev[0].payload).sort(), ev[0].payload.amountSatang, ev[0].payload.status, ev[0].payload.departureId], [PAYLOAD_KEYS, TOTAL_0142, "HOLD", dH1], "payload");
    const js = JSON.stringify(ev[0].payload);
    ok(!js.includes(String(CF1.code)) && !js.includes(String(CF1Booker.phone)) && !THAI.test(js), `มีข้อมูลบุคคล/เลขจอง: ${js}`);
  });
  await st("EV-2", "คีย์ event = trips.booking.created:<bookingId> · ยืนยันซ้ำ (CF-8) มี created 1 ตัว", async () => {
    ok(CF8.bookingId, "CF-8 ไม่ผ่าน");
    const ev = (await outbox("trips.booking.created")).filter((e) => e.payload.bookingId === CF8.bookingId);
    eq([ev.length, ev[0]?.idempotencyKey], [1, `trips.booking.created:${CF8.bookingId}`], "คีย์");
  });
  await st("EV-3", "trips.booking.confirmed: การจอง STAFF CONFIRMED มี 1 ตัว (status CONFIRMED) · การจอง HOLD ไม่มี", async () => {
    ok(CF7.bookingId && CF1.bookingId, "CF-1/CF-7 ไม่ผ่าน");
    const ev = await outbox("trips.booking.confirmed");
    eq([ev.filter((e) => e.payload.bookingId === CF7.bookingId).length, ev.find((e) => e.payload.bookingId === CF7.bookingId)?.payload.status, ev.filter((e) => e.payload.bookingId === CF1.bookingId).length], [1, "CONFIRMED", 0], "confirmed");
  });
  await st("EV-4", "audit trips.booking.create ของการจอง STAFF (ผู้กระทำ = พนักงาน) · after ไม่มีชื่อ/เบอร์ผู้จอง", async () => {
    ok(CF7.bookingId, "CF-7 ไม่ผ่าน");
    const a = await q<Rec>(`SELECT "actorId", after FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.booking.create' AND "targetId" = $2`, [tA, CF7.bookingId]);
    eq([a.length, a[0]?.actorId], [1, U.oa.userId], "audit");
    ok(!/ลูกค้าทดสอบ|"08\d{8}"/.test(JSON.stringify(a[0]?.after ?? {})), "after มีข้อมูลบุคคล");
  });
  groupLine("EV");

  // ═══════════════ SD. seed (อ่านอย่างเดียว) ═══════════════
  console.log("\n── SD: seed การจองตรงของจอ 18 (ร้าน andaman-dive) ──");
  const seedT = FX.SHOP_DIVE.tenant.id;
  const seedDep = String(asRec(asRec(EXPECTED.dive)?.departures)?.["racha:2026-11-14"] ?? "");
  await st("SD-1", "seed: การจองตรง 3 รายการของราชา ส. 14 พ.ย. (0142 · 0155 · 0160) CONFIRMED · ของภัทรา (Party ฟิกซ์เจอร์) = 11,450 · เก็บแทน 1,500 · เลข TR-6911-NNNN", async () => {
    ok(seedDep, "trips-expected.json ไม่มีรอบ racha:2026-11-14");
    const rows = await q<Rec>(`SELECT * FROM "TripBooking" WHERE "tenantId" = $1 AND "departureId" = $2 ORDER BY "createdAt"`, [seedT, seedDep]);
    ok(rows.length >= 3, `seed มีการจอง ${rows.length}`);
    const pattra = rows.find((b) => b.bookerPartyId === "tripsqc-party-dive-pattra");
    ok(pattra, "ไม่มีการจองของภัทรา");
    eq([pattra?.status, pattra?.grossSatang, pattra?.passThroughSatang, /^TR-6911-\d{4,}$/.test(String(pattra?.code))], ["CONFIRMED", TOTAL_0142, PARK_0142, true], "0142");
    ok(rows.every((b) => b.status === "CONFIRMED"), "สถานะ seed");
  });
  await st("SD-2", "seed: ตัวนับรอบราชา ส. 14 = การจองจริง (sold 6 = 3 + 2 + 1 · held 0)", async () => {
    ok(seedDep, "ไม่มีรอบ"); const want = FX.DEPARTURE_RACHA_1114.bookings.filter((b) => b.agency === null).reduce((s, b) => s + b.adults + b.children, 0);
    eq([(await dep(seedDep)).sold, (await dep(seedDep)).held, want], [want, 0, 6], "ตัวนับ");
    await invOk([seedDep], "SD-2");
  });
  await st("SD-3", "seed คงที่: ไม่มี hold ACTIVE และไม่มีการจอง HOLD/PENDING ในร้าน seed (ไม่ขึ้นกับนาฬิกาจริง)", async () => {
    eq([(await q<{ n: number }>(`SELECT count(*)::int n FROM "TripHold" WHERE "tenantId" = $1 AND status = 'ACTIVE'`, [seedT]))[0]?.n, (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "tenantId" = $1 AND status IN ('HOLD','PENDING')`, [seedT]))[0]?.n], [0, 0], "seed");
    ok(((await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "tenantId" = $1`, [seedT]))[0]?.n ?? 0) >= 3, "ไม่มีการจอง seed");
  });
  groupLine("SD");

  // ═══════════════ LT. ตัวกวาด (ข้ามร้าน — ท้ายไฟล์ · นาฬิกาไกล) ═══════════════
  console.log("\n── LT: ยืนยัน ∥ ตัวกวาด · โค้ดของการจองหมดเวลา ──");
  await st("LT-1", "ยืนยัน (ก่อนหมด 30 วิ) ∥ ตัวกวาด runExpireHolds (หลังหมด 30 วิ) บน 10 hold ⇒ แต่ละตัวจบ CONVERTED + CONFIRMED หรือ EXPIRED + ไม่มีการจอง · ไม่มี THROW/BUSY · ค่าคงที่ D.3", async () => {
    await needDb(); const d = await mkDep("2027-06-10", "A", 40); const hs: H[] = [];
    for (let i = 0; i < 10; i++) hs.push(await holdOk(staff({ now: NOW_RC }), [line(d, { a: 1, c: 0, camera: false })]));
    const exp = new Date(String(hs[0].v.expiresAt));
    const [rs] = await withTimer(Promise.all([Promise.all(hs.map((h) => confirmT(h, { ctx: withNow(h.ctx, new Date(exp.getTime() - 30_000)) }))), call("runExpireHolds", new Date(exp.getTime() + 30_000))]), 120_000, "LT-1");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    for (const [i, h] of hs.entries()) {
      const hr = await holdRow((h.v.holdIds as string[])[0]); const n = (await bksOfBasket(h.v.basketId)).length;
      ok((hr.status === "CONVERTED" && n === 1 && rs[i].ok === true) || (hr.status === "EXPIRED" && n === 0 && rs[i].code === "HOLD_EXPIRED"), `hold ${i}: ${hr.status} การจอง ${n} ผล ${fmt(rs[i].code ?? rs[i].ok)}`);
    }
    await invOk([d], "LT-1");
  });
  await st("LT-2", "การจอง HOLD ที่มีโค้ดหมดเวลา (ตัวกวาด T0.4 ⇒ EXPIRED) แล้ว onTripBookingExpired ⇒ redemption RELEASED · usedCount กลับ · เรียกซ้ำไม่ลดอีก", async () => {
    await needDb(); const code = `L2${hex(2)}`.toUpperCase(); const rule = await rawRule({ kind: "PROMO_CODE", code, discountBp: 1_000, maxUses: 5 });
    const d = await mkDep("2027-06-11"); const h = await holdOk(pub({ now: NOW_LATE }), [line(d, { promo: code })]);
    const id = ref0(await confirmT(h)).bookingId; ok(id, "จองไม่ได้"); eq(await used(rule), 1, "ก่อน");
    await call("runExpireHolds", addMin(NOW_LATE, 20));
    eq((await bk(id)).status, "EXPIRED", "ตัวกวาด T0.4");
    for (let i = 0; i < 2; i++) await call("onTripBookingExpired", { tenantId: tA, unitId: uA, bookingId: id });
    eq([(await redemptions(rule, "RELEASED")).length, (await redemptions(rule)).length, await used(rule)], [1, 0, 0], "ปล่อยโค้ด");
  });
  groupLine("LT");

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
console.log(`\n===== QC TRIPS T0.6 · การจอง · ตะกร้า · ผังสถานะ · เลขจอง · โค้ดครั้งเดียว · แก้ไข/เลื่อนวัน =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
