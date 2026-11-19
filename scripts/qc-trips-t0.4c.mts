// QC — TRIPS T0.4c · ชิ้นกลางกันกั๊กที่/ยืนยัน: (1) เพดานที่ถือไม่จ่ายของผู้กระทำ PUBLIC ต่อรอบ (2) confirm ตรวจรอบยังขายได้ในธุรกรรมเดียวกับล็อกรอบ (3) ยืนยันล้มไม่ทิ้ง Party
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/T0.4c.md (§3 สัญญา · §4 ลำดับล็อก · §8 คำถามเปิด — ค่าปริยายของ Q1–Q5 ถูกตรึงในข้อที่ติดป้าย [Qn])
//        มติ W1.2 R7 R16 W2 + หนี้ §12 ข้อ 1 · wo-notes trips-W1.2a.md · ใบ T0.4 §3.3 §11 ข้อ 9 · T0.6 §5.4 · TRIPS-RUN T0.4 (BLOCKER การเชื่อมต่อเส้นที่สอง)
//
// กลุ่มข้อ:
//   PC ตัวควบคุมบวก (กลไกของข้อสอบใช้ได้จริงทั้งก่อน/หลังแก้ · บันทึกสภาพวันนี้เป็น ℹ️)   S ขอบเขต/สถาปัตย์/ค่าตั้ง
//   PH เพดานที่ถือไม่จ่าย PUBLIC ต่อรอบ   CF confirm ตรวจรอบขายได้ในธุรกรรม   PT Party ไม่ค้างเมื่อยืนยันล้ม
//   X3 ยิงพร้อมกัน (≥ 20 ทาง: เพดานไม่ทะลุ · ไม่ขายเกิน · ตัวนับ = ผลรวมจริง · ไม่ deadlock/ค้าง · ไม่มี connection ที่สองใน tx)   X1 ข้ามร้าน/หน่วย
//
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t04c-*` ลบใน finally + กวาดค้างตอนเริ่ม · ไม่แตะร้าน seed (PC-1 อ่านอย่างเดียว)
// 🔴 นาฬิกา = ctx.now คงที่ของแต่ละข้อ (ไม่ผสม now() ของฐานกับนาฬิกาเครื่อง · ไม่รันตัวกวาดข้ามร้าน) · หมดเวลาของ hold = ctx.now ที่ฉีดเท่านั้น
// 🔴 ค่าคาดหวังคิดเองจากสัญญา (ความจุ × % ปัดขึ้น · Σ hold ACTIVE ของแถวจริง) — ไม่ใช้ตัวนับของบริการเป็นคำตอบ
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t0.4c.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมี T0.4c: PC เขียว · S-2 S-5 เขียว · PH/CF/PT ที่เป็นพฤติกรรมใหม่แดงด้วยเหตุ "ได้ ok …" / "Party ค้าง" / "ไม่มีคีย์ค่าตั้ง" · ข้อ regression เขียว
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t0.4c";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** ปลาย session/trips ตอนเขียนข้อสอบ (ฐานของ S-1 เมื่อหา merge-base ไม่ได้) */
const BASE_SHA = "b7df5f478ff4c518e042dec6187949f74f43f1e0";

loadTripsQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t0.6) ═══════════════
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
const info = (id: string, msg: string) => console.log(`     ℹ️ ${id}: ${msg}`);
const groupLine = (g: string) => {
  const mine = cks.filter((c) => c.id.replace(/-\d+$/, "") === g);
  console.log(`  ── สรุป ${g}: ผ่าน ${mine.filter((c) => c.res === "PASS").length}/${mine.length}`);
};
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t04cqc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const tok = () => randomBytes(24).toString("base64url"); // token ตะกร้าของหน้าจอง (32 ตัว)
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SLUG = "trips-t04c-";
const EMAIL_PREFIX = "trips-t04c-";
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const addMin = (d: Date | string, m: number) => new Date(new Date(d).getTime() + m * 60_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═══════════════ สัญญาของใบ (ledger/trips-briefs/T0.4c.md §3) ═══════════════
const KEY = "trips.public.unpaidHoldMaxPct"; // §3.2 คีย์ใหม่ (percent · 1–100 · ค่าเริ่ม 50 ทุกแม่แบบ)
const KEY_DEFAULT = 50;
const REASON = "PUBLIC_UNPAID_SHARE"; // §3.1 HOLD_LIMIT + details.reason
const PUBLIC_CHANNELS = ["WEB", "LIFF", "EMBED", "CHAT_AI"];
const OWN_SRC = ["src/lib/modules/trips/capacity.ts", "src/lib/modules/trips/capacity-service.ts", "src/lib/modules/trips/booking.ts", "src/lib/core/settings/defs/trips.ts"];
const SOLD_ST = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
const SELL_CODES = ["VALIDATION", "NOT_FOUND", "FORBIDDEN", "KIND_NOT_SUPPORTED", "CURRENCY_NOT_ALLOWED", "SOLD_OUT", "INSUFFICIENT_ALLOTMENT", "BERTH_TAKEN", "SLOT_CLOSED", "CUTOFF_PASSED",
  "PRICE_CHANGED", "BELOW_MIN_SELL_PRICE", "DISCOUNT_OVER_CAP", "HOLD_EXPIRED", "HOLD_NOT_FOUND", "HOLD_LIMIT", "AGENT_SUSPENDED", "CREDIT_LIMIT", "REQUIRES_APPROVAL",
  "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "BUSY", "STATE_CONFLICT"];
const MSG_SOLD_OUT = "ที่นั่งไม่พอสำหรับจำนวนที่ขอ"; // ข้อความ SOLD_OUT ของ T0.4 (capacity.ts MESSAGES) — เหตุใหม่ต้องไม่ใช่ข้อความนี้
const MSG_HOLD_LIMIT = "ถือที่พร้อมกันครบจำนวนที่กำหนดแล้ว"; // ข้อความ HOLD_LIMIT ทั่วไป — เหตุใหม่ต้องมีข้อความของตัวเอง
/** เพดานที่นั่ง PUBLIC ต่อรอบ (Q1 ค่าปริยาย: ความจุทั้งหมด × % ปัดขึ้น) */
const shareLimit = (capacity: number, pct: number) => Math.ceil((capacity * pct) / 100);
const NOW0 = "2027-03-01T03:00:00.000Z"; // ก่อนปิดรับเว็บของทุกรอบในไฟล์ (รอบ ≥ 10 มี.ค. · T6 1 วันก่อน 18:00)
const HOLD_MIN = 60; // T5 ที่ข้อสอบตั้งให้ทุกหน่วย (ชั้น UNIT)

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
async function rateKeysCleanup() { try { await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, ["trips:hold:t04cqc_%"]); } catch { /* ไม่มี */ } }
const tenantIds: string[] = [];

// ═══════════════ ตัวสุ่มอ่าน · ตัวจับเวลา ═══════════════
type Sample = { n: number; viol: string[] };
function sampler(ids: string[]): () => Promise<Sample> {
  let stop = false; const viol: string[] = []; let n = 0;
  const loop = (async () => {
    while (!stop) {
      try {
        const rows = await q<{ id: string; capacity: number; sold: number; held: number; reserved: number }>(`SELECT id, capacity, sold, held, reserved FROM "TripDeparture" WHERE id = ANY($1::text[])`, [ids]);
        for (const r of rows) if (r.sold < 0 || r.held < 0 || r.reserved < 0 || r.sold + r.held + r.reserved > r.capacity) viol.push(`${r.id.slice(-6)} c${r.capacity} s${r.sold} h${r.held}`);
        n++;
        await sleep(3);
      } catch { await sleep(5); }
    }
  })();
  return async () => { stop = true; await loop; return { n, viol }; };
}
const withTimer = async <T,>(p: Promise<T>, ms: number, what: string): Promise<T> => {
  let t: NodeJS.Timeout | undefined;
  try { return await Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new AssertFail(`${what}: ค้างเกิน ${ms / 1000} วินาที (สงสัย deadlock/pool ค้าง/รอล็อกไม่จบ)`)), ms); })]); }
  finally { if (t) clearTimeout(t); }
};
const badOutcome = (r: Rec) => r.ok === "THROW" || r.code === "BUSY" || /40P01|deadlock|P2028|P2034|P2024|55P03|Transaction already closed|Unable to start a transaction|Timed out fetching/i.test(`${r.e ?? ""} ${r.pg ?? ""} ${fmt(r.details ?? "")}`);

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers(); await rateKeysCleanup();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const SET = SETI.mod;
  const DBI = await tryImport("@/lib/core/db");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`โหลดโมดูล trips ไม่ได้ (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ไม่มี ${name}`); return f as AnyFn; };
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e), pg: String((e as { code?: unknown }).code ?? "") }; }
  };
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const codeR = (r: Rec, code: string | string[], what: string, reason?: string) => {
    const cs = Array.isArray(code) ? code : [code];
    ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`);
    if (reason) eq(asRec(r.details)?.reason, reason, `${what} details.reason`);
  };
  /** ผลเพดานใหม่ (§3.1): HOLD_LIMIT + reason + retryAfterSec จำนวนเต็ม 1..ระยะถือ + ข้อความไทยของตัวเอง (ไม่ใช่ "เต็ม"/SOLD_OUT/HOLD_LIMIT ทั่วไป) */
  const shareR = (r: Rec, what: string) => {
    codeR(r, "HOLD_LIMIT", what, REASON);
    const ra = asRec(r.details)?.retryAfterSec;
    ok(Number.isInteger(ra) && Number(ra) >= 1 && Number(ra) <= HOLD_MIN * 60, `${what}: details.retryAfterSec ต้องเป็นจำนวนเต็ม 1..${HOLD_MIN * 60} ได้ ${fmt(ra)}`);
    const m = String(r.messageTh ?? "");
    ok(THAI.test(m) && m !== MSG_SOLD_OUT && m !== MSG_HOLD_LIMIT && !/เต็ม/.test(m), `${what}: messageTh ต้องเป็นข้อความไทยของเหตุนี้ (ไม่ใช่ "เต็ม"/SOLD_OUT/HOLD_LIMIT ทั่วไป) ได้ ${fmt(m)}`);
  };
  /** ฟังก์ชันใน tx ของข้อสอบ (tenantDb) · error ที่มี code ของ SellErrorCode ⇒ {ok:false, code} */
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

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const R = FX.PRODUCT_RACHA;
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uH = rid("uH"), uL = rid("uL"), uS = rid("uS"), uP = rid("uP"), uB = rid("uB");
  let setupErr = "", settingsErr = "", keyErr = "";
  const U: Record<string, Rec> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; pt: Record<string, string> }> = {};
  let PARTY_A1 = "";
  try {
    for (const t of ["TripProduct", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "TripHold", "TripBooking", "SellBasket", "Party"]) await needTable(t);
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T0.4c ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag] of [[uA, tA, "a"], [uH, tA, "h"], [uL, tA, "l"], [uS, tA, "s"], [uP, tA, "p"], [uB, tB, "b"]] as const) await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: "{}", updatedAt: new Date() });
    for (const [tag, tenantId] of [["oa", tA], ["ob", tB]] as const) {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id };
    }
    const mkProd = async (key: string, tenantId: string, unitId: string) => {
      const id = rid(`p${key}`), o = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t04cqc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
      await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const pt: Record<string, string> = {};
      for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code }), countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
      await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: R.parkAdultSatang, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
        name: JSON.stringify({ th: "ค่าอุทยาน" }), paxPrices: JSON.stringify({ ADULT: R.parkAdultSatang, CHILD: R.parkChildSatang }), active: true, updatedAt: new Date() });
      for (const [code, amount] of [["ADULT", R.adultSatang], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, opt: o, unit: unitId, tenant: tenantId, pt };
    };
    await mkProd("A", tA, uA); await mkProd("A2", tA, uA); await mkProd("H", tA, uH); await mkProd("L", tA, uL); await mkProd("S", tA, uS); await mkProd("P", tA, uP); await mkProd("B", tB, uB);
    PARTY_A1 = await insertRow("Party", { id: rid("pa1"), tenantId: tA, name: "ลูกค้าประจำร้านเอ (ข้อสอบ t0.4c)", updatedAt: new Date() });
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const setV = async (tenantId: string, changes: Rec[], who = "oa") => {
    const r = asRec(await S("setSettings")(U[who], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  const VATREG = { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 };
  const T6_COUNTER_LATE = { daysBefore: 1, atMin: 1080, perChannel: { COUNTER: { daysBefore: 0, atMin: 420 } } }; // เว็บปิด 18:00 วันก่อน · หน้าร้านปิด 07:00 วันเดินทาง
  const T6_AFTER_START = { daysBefore: 0, atMin: 1439 }; // ปิดรับ 23:59 วันเดินทาง (หลังเวลาออก) ⇒ ทดสอบ STARTED ได้
  try {
    if (!setupErr) {
      const unitsA = [uA, uH, uL, uS, uP];
      await setV(tA, [
        ...unitsA.map((u) => ({ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: u, value: VATREG })),
        ...unitsA.map((u) => ({ key: "trips.sell.holdMinutes", scope: "UNIT", scopeId: u, value: HOLD_MIN })),
        { key: "trips.sell.cutoff", scope: "UNIT", scopeId: uA, value: T6_COUNTER_LATE },
        { key: "trips.sell.cutoff", scope: "UNIT", scopeId: uS, value: T6_AFTER_START },
        { key: "trips.public.holdCapPerContact", scope: "UNIT", scopeId: uL, value: 1 },
        { key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: PRD.A2.id, value: "SHOP_CONFIRMS" },
      ]);
      await setV(tB, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uB, value: VATREG }, { key: "trips.sell.holdMinutes", scope: "UNIT", scopeId: uB, value: HOLD_MIN }], "ob");
    }
  } catch (e) { settingsErr = e instanceof Error ? e.message : String(e); console.log(`  ⚠️ ตั้งค่าตั้งหน่วยไม่สำเร็จ: ${settingsErr}`); }
  try {
    if (!setupErr && !settingsErr) await setV(tA, [{ key: KEY, scope: "UNIT", scopeId: uH, value: 100 }, { key: KEY, scope: "UNIT", scopeId: uP, value: 30 }]);
  } catch (e) { keyErr = e instanceof Error ? e.message : String(e); console.log(`  ⚠️ ตั้งคีย์ใหม่ ${KEY} ไม่ได้ (คาดก่อนมี T0.4c): ${keyErr.slice(0, 160)}`); }
  const needDb = () => { needTrips(); ok(!setupErr && PRD.A, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); ok(!settingsErr, `ตั้งค่าตั้งไม่ได้: ${settingsErr}`); };
  const needKey = () => { needDb(); ok(!keyErr, `ตั้งค่า ${KEY} ไม่ได้ (คีย์ใหม่ยังไม่ลงทะเบียน?): ${keyErr.slice(0, 160)}`); };

  /** รอบของสินค้า key · startsAt = เวลาไทยของ date+hm (ชนรอบเดิมของสินค้าเดียวกัน ⇒ เลื่อนทีละ 1 นาที · unique productId+optionId+startsAt) · cutoffAt คอลัมน์ = startsAt (แบบ t0.6) */
  const usedStarts = new Set<string>();
  const mkDep = async (o: { key?: string; date: string; hm?: string; capacity?: number; status?: string }): Promise<string> => {
    const p = PRD[o.key ?? "A"]; let startsAt = BKK(o.date, o.hm ?? "08:00"); const id = rid("d");
    while (usedStarts.has(`${p.id}|${startsAt.toISOString()}`)) startsAt = addMin(startsAt, 1);
    usedStarts.add(`${p.id}|${startsAt.toISOString()}`);
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: o.date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      status: o.status ?? "OPEN", capacity: o.capacity ?? 10, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  const setStatus = async (id: string, status: string) => { await pool.query(`UPDATE "TripDeparture" SET status = $2 WHERE id = $1`, [id, status]); };

  // ── ctx · บรรทัด · ผู้จอง ──
  const unitOf = (key: string) => PRD[key]?.unit ?? "x";
  const tenantOf = (key: string) => PRD[key]?.tenant ?? "x";
  const staff = (o: { key?: string; ch?: string; now?: string | Date; who?: string } = {}): Rec => ({ tenantId: tenantOf(o.key ?? "A"), unitId: unitOf(o.key ?? "A"), channel: o.ch ?? "COUNTER", actor: { kind: "STAFF", userId: String(U[o.who ?? "oa"]?.userId ?? "x") }, now: new Date(o.now ?? NOW0), locale: "th" });
  let pubN = 0;
  const pub = (o: { key?: string; ch?: string; now?: string | Date; tenant?: string; unit?: string } = {}): Rec => ({ tenantId: o.tenant ?? tenantOf(o.key ?? "A"), unitId: o.unit ?? unitOf(o.key ?? "A"), channel: o.ch ?? "WEB", actor: { kind: "PUBLIC", clientKey: `t04cqc_c${pubN++}_${hex(3)}` }, now: new Date(o.now ?? NOW0), locale: "th" });
  const withNow = (ctx: Rec, now: string | Date): Rec => ({ ...ctx, now: new Date(now) });
  const line = (dep: string, o: { key?: string; a?: number } = {}): Rec => {
    const p = PRD[o.key ?? "A"];
    return { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: dep, optionId: p.opt, pax: [{ paxTypeId: p.pt.ADULT, qty: o.a ?? 2 }], extras: [] };
  };
  let bkN = 0;
  /** ผู้จองใหม่ทุกครั้ง: ชื่อ "qc4c …" + เบอร์ 08 ที่ไม่ซ้ำ (นับ Party ด้วยชื่อ — ชื่อไม่ซ้ำต่อการเรียก) */
  const booker = (o: Rec = {}): Rec => { bkN++; return { name: `qc4c ผู้จอง ${STAMP} ${bkN}`, phone: `08${String(20_000_000 + bkN * 7_919 + Number.parseInt(hex(2), 16)).slice(-8)}`, ...o }; };
  const quoteOf = async (ctx: Rec, lines: Rec[]): Promise<Rec> => V(await call("quoteTrips", ctx, { lines }, {}), "quoteTrips (T0.5)");
  type H = { r: Rec; v: Rec; quote: Rec; token?: string; lines: Rec[]; ctx: Rec; key: string };
  const holdT = async (ctx: Rec, lines: Rec[], o: { key?: string } = {}): Promise<H> => {
    const quote = await quoteOf(ctx, lines);
    const key = o.key ?? `h${hex(6)}`;
    const isPub = asRec(ctx.actor)?.kind === "PUBLIC";
    const token = isPub ? tok() : undefined;
    const r = await call("holdTrips", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: key, ...(token ? { basketToken: token } : {}) }, {});
    return { r, v: asRec(r.value) ?? {}, quote, token, lines, ctx, key };
  };
  const holdOk = async (ctx: Rec, lines: Rec[]): Promise<H> => { const h = await holdT(ctx, lines); V(h.r, "holdTrips"); return h; };
  const confirmInput = (h: H, o: { key?: string; booker?: Rec; pay?: string; onExpired?: string } = {}): Rec => ({
    basketId: h.v.basketId, holdIds: h.v.holdIds, idempotencyKey: o.key ?? `c${hex(6)}`, quoteId: h.quote.quoteId, quote: { lines: h.lines },
    booker: o.booker ?? booker(), pay: { method: o.pay ?? (asRec(h.ctx.actor)?.kind === "STAFF" ? "PAY_LATER" : "PAY_NOW") }, ...(h.token ? { basketToken: h.token } : {}), ...(o.onExpired ? { onExpired: o.onExpired } : {}),
  });
  const confirmT = async (h: H, o: { ctx?: Rec; key?: string; booker?: Rec; pay?: string; onExpired?: string } = {}): Promise<Rec> => call("confirmTrips", o.ctx ?? h.ctx, confirmInput(h, o), {});
  const bookNow = async (ctx: Rec, lines: Rec[], o: { booker?: Rec } = {}): Promise<Rec> => {
    const quote = await quoteOf(ctx, lines);
    return call("bookTripsNow", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `n${hex(6)}`, booker: o.booker ?? booker(), pay: { method: "PAY_LATER" } }, {});
  };
  const ref0 = (r: Rec): Rec => asArr(r.value)[0] ?? {};
  const bk = async (id: unknown): Promise<Rec> => (await q<Rec>(`SELECT * FROM "TripBooking" WHERE id = $1`, [String(id)]))[0] ?? {};
  const bksOfBasket = async (basketId: unknown) => q<Rec>(`SELECT * FROM "TripBooking" WHERE "basketId" = $1 ORDER BY id`, [String(basketId)]);
  const dep = async (id: string): Promise<Rec> => (await q<Rec>(`SELECT capacity, sold, held, reserved, status FROM "TripDeparture" WHERE id = $1`, [id]))[0] ?? {};
  const holdRow = async (id: unknown): Promise<Rec> => (await q<Rec>(`SELECT * FROM "TripHold" WHERE id = $1`, [String(id)]))[0] ?? {};
  const basketRow = async (id: unknown): Promise<Rec> => (await q<Rec>(`SELECT * FROM "SellBasket" WHERE id = $1`, [String(id)]))[0] ?? {};
  const partiesNamed = async (tenantId: string, name: unknown) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Party" WHERE "tenantId" = $1 AND name = $2`, [tenantId, String(name)]))[0]?.n ?? -1;
  const partyIdNamed = async (tenantId: string, name: unknown) => (await q<{ id: string }>(`SELECT id FROM "Party" WHERE "tenantId" = $1 AND name = $2`, [tenantId, String(name)])).map((r) => r.id);
  /** Party ของข้อสอบ (ชื่อ qc4c) ที่ไม่มีการจองใดอ้าง = ค้าง */
  const orphanParties = async (tenantId: string) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Party" p WHERE p."tenantId" = $1 AND p.name LIKE 'qc4c %'
      AND NOT EXISTS (SELECT 1 FROM "TripBooking" b WHERE b."bookerPartyId" = p.id)`, [tenantId]))[0]?.n ?? -1;
  /** ที่นั่งที่ PUBLIC ถือไม่จ่าย ณ now (นิยาม §3.1 ของใบ: ACTIVE · expiresAt > now · ช่องทางสาธารณะ · PAYMENT|SHOP_CONFIRM) — คำนวณเองจากแถวจริง */
  const publicHeld = async (depId: string, now: string | Date) => (await q<{ n: number }>(`SELECT COALESCE(sum("qtyPublic" + "qtyAllot"),0)::int AS n FROM "TripHold"
      WHERE "departureId" = $1 AND status = 'ACTIVE' AND "expiresAt" > $2::timestamp AND channel = ANY($3::text[]) AND purpose IN ('PAYMENT','SHOP_CONFIRM')`, [depId, new Date(now).toISOString(), PUBLIC_CHANNELS]))[0]?.n ?? -1;
  /** ค่าคงที่ D.3: sold = Σ ที่นั่งนับที่ของการจองที่ขายแล้ว · held = Σ hold ACTIVE */
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
  const capKeyOf = (h: H) => `basket:${sha256hex(String(h.token))}`;

  // ═══════════════ PC. ตัวควบคุมบวก ═══════════════
  console.log("\n── PC: ตัวควบคุมบวก (กลไกของข้อสอบ · สภาพวันนี้ = ℹ️) ──");
  await st("PC-1", "ฐาน qc-trips + ร้าน seed andaman-dive อยู่ · ร้านชั่วคราว 6 หน่วย/7 สินค้า + ค่าตั้งพื้นฐานตั้งได้ · เส้นทางปกติ: PUBLIC ถือ 2 ที่ → ยืนยัน PAY_NOW ⇒ HOLD · Party ใหม่ 1 แถวผูก bookerPartyId", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = 'andaman-dive'`))[0]?.n, 1, "ร้าน andaman-dive");
    needDb();
    const d = await mkDep({ date: "2027-03-10" });
    const h = await holdOk(pub(), [line(d)]);
    const b = booker(); const r = await confirmT(h, { booker: b });
    const ref = ref0(r); ok(r.ok === true && ref.bookingId, `confirm: ${fmt(r)}`);
    const ids = await partyIdNamed(tA, b.name);
    eq([ref.status, ids.length, (await bk(ref.bookingId)).bookerPartyId === ids[0]], ["HOLD", 1, true], "สถานะ/Party/ผูก");
  });
  await st("PC-2", "ปิดรอบด้วย SQL ของข้อสอบมีผลจริง: status CLOSED ⇒ getAvailability(WEB) saleBlock STATUS · holdTrips ใหม่ SLOT_CLOSED (ℹ️ ผล confirm ของ hold ที่ถือก่อนปิด = สภาพวันนี้)", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-11" });
    const h = await holdOk(pub(), [line(d)]);
    await setStatus(d, "CLOSED");
    eq(V(await call("getAvailability", pub(), { departureId: d }), "getAvailability").saleBlock, "STATUS", "saleBlock");
    codeR((await holdT(pub(), [line(d, { a: 1 })])).r, "SLOT_CLOSED", "ถือหลังปิด");
    const c = await confirmT(h);
    info("PC-2", `confirmTrips PUBLIC บนรอบที่ปิดหลังถือ = ${c.ok === true ? `ok ${String(ref0(c).status)} (ยังไม่ตรวจในบริการ)` : String(c.code)}`);
  });
  await st("PC-3", "เวลาปิดรับของข้อสอบมีผลจริง (หน่วย A: เว็บ 18:00 วันก่อน · หน้าร้าน 07:00 วันเดินทาง): 10:50Z ⇒ WEB null · 11:01Z ⇒ WEB CUTOFF · COUNTER null · 00:01Z วันเดินทาง ⇒ COUNTER CUTOFF", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-20" });
    const sb = async (ctx: Rec) => V(await call("getAvailability", ctx, { departureId: d }), "getAvailability").saleBlock ?? null;
    eq([await sb(pub({ now: "2027-03-19T10:50:00.000Z" })), await sb(pub({ now: "2027-03-19T11:01:00.000Z" })), await sb(staff({ now: "2027-03-19T11:01:00.000Z" })), await sb(staff({ now: "2027-03-20T00:01:00.000Z" }))],
      [null, "CUTOFF", null, "CUTOFF"], "saleBlock");
  });
  await st("PC-4", "ตัวนับ Party ของข้อสอบเห็นการสร้างจริง: ยืนยันที่ล้มก่อนธุรกรรม (quoteId ผิด ⇒ PRICE_CHANGED) ⇒ +0 · ยืนยันสำเร็จ ⇒ +1 (ℹ️ HOLD_EXPIRED วันนี้ทิ้ง Party กี่แถว)", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-12" });
    const h1 = await holdOk(pub(), [line(d)]); const b1 = booker();
    const r1 = await call("confirmTrips", h1.ctx, { ...confirmInput(h1, { booker: b1 }), quoteId: `q${hex(8)}` }, {});
    ok(r1.ok === false, `quoteId ผิดต้องล้ม: ${fmt(r1)}`);
    eq(await partiesNamed(tA, b1.name), 0, "Party หลังล้มก่อน tx");
    V(await confirmT(h1, { booker: b1 }), "ยืนยันซ้ำด้วย quoteId ถูก");
    eq(await partiesNamed(tA, b1.name), 1, "Party หลังสำเร็จ");
    const h2 = await holdOk(pub(), [line(d)]); const b2 = booker();
    const r2 = await confirmT(h2, { ctx: withNow(h2.ctx, addMin(NOW0, HOLD_MIN + 1)), booker: b2 });
    info("PC-4", `ยืนยันหลัง hold หมดเวลา = ${String(r2.code ?? r2.ok)} · Party ค้างของผู้จองนี้ ${await partiesNamed(tA, b2.name)} แถว`);
  });
  await st("PC-5", "ตัวนับที่ถือ PUBLIC ของข้อสอบ (§3.1) = held ของรอบเมื่อมีแต่ hold PUBLIC: 3 ตะกร้า 1+2+1 ⇒ 4 · hold หน้าร้านไม่นับ · หลังหมดเวลา (now ฉีด) ⇒ 0", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-13", capacity: 20 });
    for (const a of [1, 2, 1]) await holdOk(pub(), [line(d, { a })]);
    eq([await publicHeld(d, NOW0), (await dep(d)).held], [4, 4], "public/held");
    await holdOk(staff(), [line(d, { a: 3 })]);
    eq([await publicHeld(d, NOW0), (await dep(d)).held, await publicHeld(d, addMin(NOW0, HOLD_MIN + 1))], [4, 7, 0], "public/held/หลังหมดเวลา");
  });
  groupLine("PC");

  // ═══════════════ S. ขอบเขต · สถาปัตย์ · ค่าตั้ง ═══════════════
  console.log("\n── S: ขอบเขต/สถาปัตย์/ค่าตั้ง ──");
  await st("S-1", `ไฟล์ src/ ที่แตะ ⊆ ไฟล์เจ้าของ 4 ไฟล์ (${OWN_SRC.map((f) => f.split("/").pop()).join(" · ")}) — เทียบ merge-base กับ session/trips · ไม่นับ scratchpad/ ledger/ scripts/`, () => {
    const base = git(["merge-base", "HEAD", "session/trips"]).trim() || BASE_SHA;
    ok(git(["cat-file", "-t", base]).trim() === "commit", `หาฐาน ${base} ไม่เจอ`);
    const changed = [...new Set([...git(["diff", "--name-only", base, "--", "src", "prisma"]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", "src", "prisma"]).split("\n")].filter(Boolean))];
    const out = changed.filter((f) => !OWN_SRC.includes(f));
    ok(out.length === 0, `แตะนอกไฟล์เจ้าของ: ${out.slice(0, 8).join(", ")}`);
  });
  await st("S-2", "ไม่มี migration/schema ใหม่ (prisma/ ไม่เปลี่ยนเทียบ merge-base) · core/sellable.ts ไม่เปลี่ยน (ไม่มีรหัสผลใหม่)", () => {
    const base = git(["merge-base", "HEAD", "session/trips"]).trim() || BASE_SHA;
    const ch = [...git(["diff", "--name-only", base, "--", "prisma", "src/lib/core/sellable.ts"]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", "prisma"]).split("\n")].filter(Boolean);
    ok(ch.length === 0, `เปลี่ยน: ${ch.slice(0, 6).join(", ")}`);
  });
  await st("S-3", `คีย์ ${KEY}: domain trips · type percent · chain มี UNIT (⊆ UNIT/PRODUCT/DEPARTURE) · ค่าเริ่ม ${KEY_DEFAULT} ทุกแม่แบบ + _fallback · schema รับ 1/50/100 ปฏิเสธ 0/101/1.5/"50"`, () => {
    const d = asRec((S("getDef") as (k: string) => unknown)(KEY));
    ok(d, `ยังไม่ลงทะเบียน ${KEY}`);
    const chain = Array.isArray(d!.chain) ? (d!.chain as string[]) : [];
    ok(d!.domain === "trips" && d!.type === "percent", `domain/type: ${fmt([d!.domain, d!.type])}`);
    ok(chain.includes("UNIT") && chain.every((c) => ["UNIT", "PRODUCT", "DEPARTURE"].includes(c)), `chain ${fmt(chain)}`);
    const df = asRec(d!.defaults) ?? {};
    eq(["DIVE_SHOP", "DAY_TOUR", "LIVEABOARD", "ATTRACTION", "_fallback"].map((k) => df[k]), [50, 50, 50, 50, 50], "ค่าเริ่ม");
    const sc = d!.schema as { safeParse?: (v: unknown) => { success: boolean } } | undefined;
    ok(typeof sc?.safeParse === "function", "ไม่มี schema");
    eq([1, 50, 100, 0, 101, 1.5, "50"].map((v) => sc!.safeParse!(v).success), [true, true, true, false, false, false, false], "schema");
  });
  await st("S-4", `ledger/TRIPS-DEFAULTS.md มีแถวของ ${KEY} (รหัส X· · ค่าเริ่ม 50%)`, () => {
    const t = read("ledger/TRIPS-DEFAULTS.md");
    ok(new RegExp(`^\\| X\\d+ \\| \`${KEY.replace(/\./g, "\\.")}\` \\|.*50`, "m").test(t), "ไม่มีแถวในทะเบียนค่าเริ่ม");
  });
  await st("S-5", "capacity.ts ยังอยู่ในด่านคงที่ (ไม่ import db/settings/ops/capacity-service · ไม่มี tenantDb(/resolveSettings(/prisma.) · ไม่มี now() ของฐานในเงื่อนไข expiresAt · ไม่มีค่า 50 ของเพดานเขียนตายในโมดูล trips", () => {
    const s = stripComments(read("src/lib/modules/trips/capacity.ts"));
    ok(s, "ไม่มี capacity.ts");
    ok(!/^import.*(core\/(db|settings|rate-limit-db|ops)|\.\/(resources|capacity-service|waitlist))/m.test(s) && !/(tenantDb|resolveSettings\w*|systemGate|logOps)\(|\bprisma\./.test(s), "ด่านคงที่ของ capacity.ts ถูกทำลาย");
    ok(!/"expiresAt"\s*(<=|>|<|>=)\s*now\(\)/.test(s), "ใช้ now() ของฐาน");
    const bad: string[] = [];
    for (const f of ["capacity.ts", "capacity-service.ts", "booking.ts", "capacity-core.ts"]) {
      const src = stripComments(read(`src/lib/modules/trips/${f}`));
      for (const m of src.matchAll(/\b(unpaidHold\w*|publicShare\w*|sharePct\w*)\s*[:=?]{1,2}\s*(50|0\.5|5_?000)\b/g)) bad.push(`${f}: ${m[0]}`);
    }
    ok(bad.length === 0, bad.slice(0, 4).join(" · "));
  });
  await st("S-6", "booking.ts: ทุกการเรียก safeFindOrCreate( ส่ง client ของธุรกรรม (≥ 3 อาร์กิวเมนต์) · prepareCore ไม่สร้าง Party เอง (ไม่มี safeFindOrCreate( ในตัวฟังก์ชัน)", () => {
    const s = stripComments(read("src/lib/modules/trips/booking.ts"));
    ok(s, "ไม่มี booking.ts");
    const argc = (from: number): number => {
      let depth = 0, n = 1, i = from;
      for (; i < s.length; i++) {
        const ch = s[i];
        if (ch === "(" || ch === "{" || ch === "[") depth++;
        else if (ch === ")" || ch === "}" || ch === "]") { if (depth === 0) break; depth--; }
        else if (ch === "," && depth === 0) n++;
      }
      return s.slice(from, i).trim() === "" ? 0 : n - (/,\s*$/.test(s.slice(from, i)) ? 1 : 0);
    };
    const calls = [...s.matchAll(/safeFindOrCreate\(/g)].map((m) => argc((m.index ?? 0) + m[0].length));
    ok(calls.length > 0, "ไม่พบการเรียก safeFindOrCreate( (ผู้จองต้องเป็น Party)");
    ok(calls.every((n) => n >= 3), `มีการเรียกแบบไม่ส่ง tx (จำนวนอาร์กิวเมนต์ ${calls.join(",")})`);
    const i = s.search(/async\s+function\s+prepareCore\s*\(/);
    ok(i >= 0, "ไม่พบ prepareCore");
    const rest = s.slice(i + 10); const end = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+/);
    ok(!(end < 0 ? rest : rest.slice(0, end)).includes("safeFindOrCreate("), "prepareCore ยังสร้าง Party นอกธุรกรรม");
  });
  groupLine("S");

  // ═══════════════ PH. เพดานที่ถือไม่จ่ายของ PUBLIC ต่อรอบ ═══════════════
  console.log(`\n── PH: เพดานที่ถือไม่จ่าย PUBLIC ต่อรอบ (ค่าเริ่ม ${KEY_DEFAULT}% ของความจุ ปัดขึ้น) ──`);
  await st("PH-1", `ความจุ 10 ⇒ เพดาน ${shareLimit(10, 50)}: PUBLIC ถือ 3 + 2 ได้ · ถือ 1 ⇒ HOLD_LIMIT ${REASON} + retryAfterSec + ข้อความของตัวเอง · held คงที่ 5 · getAvailability ยังบอกที่ว่างจริง 5 (ไม่ใช่ "เต็ม")`, async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-14", capacity: 10 });
    await holdOk(pub(), [line(d, { a: 3 })]); await holdOk(pub(), [line(d, { a: 2 })]);
    const r = (await holdT(pub(), [line(d, { a: 1 })])).r;
    shareR(r, "ถือครั้งที่ 3");
    const av = V(await call("getAvailability", pub(), { departureId: d }), "getAvailability");
    eq([(await dep(d)).held, av.publicLeft, av.saleBlock ?? null], [5, 5, null], "held/publicLeft/saleBlock");
  });
  await st("PH-2", "พนักงานไม่ติดเพดาน และ SOLD_OUT มาก่อน: หลัง PUBLIC ถือ 5/10 ⇒ STAFF holdTrips 3 + bookTripsNow 2 ได้ · PUBLIC ขอ 1 ⇒ SOLD_OUT (ไม่ใช่ HOLD_LIMIT) · D.3", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-14", capacity: 10 });
    await holdOk(pub(), [line(d, { a: 3 })]); await holdOk(pub(), [line(d, { a: 2 })]);
    await holdOk(staff(), [line(d, { a: 3 })]);
    V(await bookNow(staff(), [line(d, { a: 2 })]), "bookTripsNow");
    codeR((await holdT(pub(), [line(d, { a: 1 })])).r, "SOLD_OUT", "PUBLIC เมื่อไม่เหลือที่");
    eq([(await dep(d)).held, (await dep(d)).sold], [8, 2], "held/sold"); await invOk([d], "PH-2");
  });
  await st("PH-3", "[Q1] ตะกร้าแรกของรอบ (ไม่มี PUBLIC ถือไม่จ่ายอยู่) ถือได้แม้เกินเพดาน: ความจุ 10 ถือ 8 ได้ · ถัดไปขอ 1 ⇒ HOLD_LIMIT", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-15", capacity: 10 });
    await holdOk(pub(), [line(d, { a: 8 })]);
    shareR((await holdT(pub(), [line(d, { a: 1 })])).r, "หลังกลุ่มใหญ่");
    eq(await publicHeld(d, NOW0), 8, "ที่ถือ PUBLIC");
  });
  await st("PH-4", `[Q1] ปัดขึ้น: ความจุ 5 ⇒ เพดาน ${shareLimit(5, 50)}: 2 ได้ · 1 ได้ (=3) · 1 ⇒ HOLD_LIMIT`, async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-15", capacity: 5 });
    await holdOk(pub(), [line(d, { a: 2 })]);
    V((await holdT(pub(), [line(d, { a: 1 })])).r, "ถือที่ 3 (ceil(2.5) = 3)");
    shareR((await holdT(pub(), [line(d, { a: 1 })])).r, "ถือที่ 4");
  });
  await st("PH-5", `นับเฉพาะ ACTIVE ที่ยังไม่หมดเวลา (now ของ ctx): ความจุ 60 (เพดาน ${shareLimit(60, 50)}) ถือ 10+10 ตอน NOW0 · ตอน +61 นาที (ยังไม่กวาด · held ยัง 20) ถือ 25 ได้ · ขอ 6 ⇒ HOLD_LIMIT (ที่ว่างยังพอ)`, async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-16", capacity: 60 });
    await holdOk(pub(), [line(d, { a: 10 })]); await holdOk(pub(), [line(d, { a: 10 })]);
    const later = addMin(NOW0, HOLD_MIN + 1);
    V((await holdT(pub({ now: later }), [line(d, { a: 25 })])).r, "ถือหลัง hold เดิมหมดเวลา (ถ้านับตัวหมดเวลา = 45 > 30)");
    shareR((await holdT(pub({ now: later }), [line(d, { a: 6 })])).r, "เกินเพดานหลังหมดเวลา");
    eq([(await dep(d)).held, await publicHeld(d, later)], [45, 25], "held (ยังไม่กวาด)/ที่ถือ PUBLIC ที่ยังไม่หมดเวลา");
  });
  await st("PH-6", `ปล่อย/แปลงแล้วไม่นับ: ความจุ 12 (เพดาน ${shareLimit(12, 50)}) ถือ 5 → ปล่อย (releaseHold ด้วย capKey ตะกร้า) ⇒ ถือ 5 ได้ → แปลง (convertHoldInTx) ⇒ sold 5 · ถือ 5 ได้ · ขอ 2 ⇒ HOLD_LIMIT`, async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-16", hm: "10:00", capacity: 12 });
    const h1 = await holdOk(pub(), [line(d, { a: 5 })]);
    V(await call("releaseHold", h1.ctx, { holdId: (h1.v.holdIds as string[])[0], reason: "qc", capKey: capKeyOf(h1) }), "releaseHold");
    const h2 = await holdOk(pub(), [line(d, { a: 5 })]);
    const cv = await inTx(tA, uA, (tx) => (fn("convertHoldInTx") as (...a: unknown[]) => Promise<unknown>)(tx, h2.ctx, { holdId: (h2.v.holdIds as string[])[0], capKey: capKeyOf(h2) }));
    ok(cv.ok === true, `convertHoldInTx: ${fmt(cv)}`);
    await holdOk(pub(), [line(d, { a: 5 })]);
    shareR((await holdT(pub(), [line(d, { a: 2 })])).r, "หลังแปลง");
    eq([(await dep(d)).sold, (await dep(d)).held], [5, 5], "sold/held"); // ORACLE-EDIT PH-6 (ผู้คุม 19 พ.ย.): ตัด invOk — ข้อนี้แปลง hold ด้วย convertHoldInTx ตรง ๆ โดยไม่มีการจอง ⇒ sold 5 กับการจอง 0 ไม่ตรงกันตามนิยามของตัวตรวจ (ไม่ใช่พฤติกรรมของบริการ)
  });
  await st("PH-7", "การจอง HOLD ของ PUBLIC (ยืนยันแล้ว ยังไม่จ่าย · hold KEEP) ยังนับ: ถือ 5 → ยืนยัน PAY_NOW ⇒ HOLD · ขอ 1 ⇒ HOLD_LIMIT", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-17", capacity: 10 });
    const h = await holdOk(pub(), [line(d, { a: 5 })]);
    eq(ref0(await confirmT(h)).status, "HOLD", "สถานะการจอง");
    shareR((await holdT(pub(), [line(d, { a: 1 })])).r, "หลังยืนยันไม่จ่าย");
  });
  await st("PH-8", "[Q3] การจอง PENDING ของ PUBLIC (สินค้า SHOP_CONFIRMS · hold purpose SHOP_CONFIRM) ยังนับ: ถือ 5 → ยืนยัน ⇒ PENDING · ขอ 1 ⇒ HOLD_LIMIT", async () => {
    needDb();
    const d = await mkDep({ key: "A2", date: "2027-03-17", capacity: 10 });
    const h = await holdOk(pub({ key: "A2" }), [line(d, { key: "A2", a: 5 })]);
    eq(ref0(await confirmT(h)).status, "PENDING", "สถานะการจอง");
    eq((await holdRow((h.v.holdIds as string[])[0])).purpose, "SHOP_CONFIRM", "purpose");
    const r8 = (await holdT(pub({ key: "A2" }), [line(d, { key: "A2", a: 1 })])).r;
    shareR(r8, "หลัง PENDING");
    // ORACLE-EDIT PH-8 (T0.4c มติ R5 · ผู้คุม 19 พ.ย.): retryAfterSec = min(เวลาถึงที่ถือที่นับซึ่งหมดเร็วสุด, T5 × 60) — ตรึงให้ชัดว่าเพดาน T5 มีผลจริง:
    // เงื่อนไขก่อน = ที่ถือที่นับทุกแถวหมดช้ากว่า T5 × 60 (SHOP_CONFIRM X2 ชม.) ⇒ ค่าที่ได้ต้องเท่ากับ T5 × 60 พอดี (ไม่ใช่แค่ ≤)
    const first = (await q<{ t: Date | null }>(`SELECT min("expiresAt") AS t FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE' AND "expiresAt" > $2::timestamp AND channel = ANY($3::text[]) AND purpose IN ('PAYMENT','SHOP_CONFIRM')`, [d, NOW0, PUBLIC_CHANNELS]))[0]?.t;
    ok(first && Math.ceil((new Date(first).getTime() - new Date(NOW0).getTime()) / 1000) > HOLD_MIN * 60, `เงื่อนไขก่อน: ที่ถือที่นับต้องหมดช้ากว่า T5 (${fmt(first)})`);
    eq(asRec(r8.details)?.retryAfterSec, HOLD_MIN * 60, "retryAfterSec (เพดาน T5 × 60 · มติ R5)");
  });
  await st("PH-9", "แยกต่อรอบ: รอบ D1 ถือ 5/10 ⇒ รอบ D2 ของสินค้าเดียวกันถือ 5 ได้ · ที่หน้าร้านถือ 6/10 ไม่กินเพดาน: PUBLIC ถือ 4 ได้", async () => {
    needDb();
    const d1 = await mkDep({ date: "2027-03-18", capacity: 10 }), d2 = await mkDep({ date: "2027-03-18", hm: "13:00", capacity: 10 }), d3 = await mkDep({ date: "2027-03-18", hm: "15:00", capacity: 10 });
    await holdOk(pub(), [line(d1, { a: 3 })]); await holdOk(pub(), [line(d1, { a: 2 })]);
    await holdOk(pub(), [line(d2, { a: 3 })]); V((await holdT(pub(), [line(d2, { a: 2 })])).r, "D2 ถือครบเพดานของตัวเอง");
    await holdOk(staff(), [line(d3, { a: 6 })]);
    await holdOk(pub(), [line(d3, { a: 1 })]); V((await holdT(pub(), [line(d3, { a: 3 })])).r, "D3 PUBLIC 4 (หน้าร้าน 6 ไม่นับ)");
  });
  await st("PH-10", `ค่าตั้งมีผล: หน่วย H = 100 ⇒ PUBLIC ถือ 4+4+2 = ความจุ 10 ได้ · ขอ 1 ⇒ SOLD_OUT · หน่วย P = 30 ⇒ เพดาน ${shareLimit(10, 30)}: 2+1 ได้ · 1 ⇒ HOLD_LIMIT`, async () => {
    needKey();
    const dh = await mkDep({ key: "H", date: "2027-03-19", capacity: 10 });
    for (const a of [4, 4, 2]) V((await holdT(pub({ key: "H" }), [line(dh, { key: "H", a })])).r, `หน่วย H ถือ ${a}`);
    codeR((await holdT(pub({ key: "H" }), [line(dh, { key: "H", a: 1 })])).r, "SOLD_OUT", "หน่วย H เต็มจริง");
    const dp = await mkDep({ key: "P", date: "2027-03-19", capacity: 10 });
    await holdOk(pub({ key: "P" }), [line(dp, { key: "P", a: 2 })]); V((await holdT(pub({ key: "P" }), [line(dp, { key: "P", a: 1 })])).r, "หน่วย P ถือที่ 3");
    shareR((await holdT(pub({ key: "P" }), [line(dp, { key: "P", a: 1 })])).r, "หน่วย P ถือที่ 4");
  });
  await st("PH-11", "placeHold (ทางตรงของ T0.4 · PUBLIC) ใช้กติกาเดียวกัน: placeHold 5 ได้ · placeHold 1 ⇒ HOLD_LIMIT · holdTrips 1 ⇒ HOLD_LIMIT", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-21", capacity: 10 });
    const ph = (qty: number) => call("placeHold", pub(), { departureId: d, qty, idempotencyKey: `p${hex(6)}`, capKey: `basket:${sha256hex(tok())}` });
    V(await ph(2), "placeHold 2"); V(await ph(3), "placeHold 3");
    shareR(await ph(1), "placeHold เกินเพดาน");
    shareR((await holdT(pub(), [line(d, { a: 1 })])).r, "holdTrips เกินเพดาน");
  });
  await st("PH-12", "ตะกร้าเดียวสองบรรทัดรอบเดียวกันนับรวมกัน: มี PUBLIC ถือ 2/10 อยู่ · ตะกร้า [2, 2] (รวม 6 > 5) ⇒ HOLD_LIMIT ไม่มีแถวใหม่ · ตะกร้า [1, 2] (= 5) ได้", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-22", capacity: 10 });
    await holdOk(pub(), [line(d, { a: 2 })]);
    const r = await holdT(pub(), [line(d, { a: 2 }), line(d, { a: 2 })]);
    shareR(r.r, "สองบรรทัดเกินเพดาน");
    eq([(await dep(d)).held, await publicHeld(d, NOW0)], [2, 2], "ไม่มีที่ถือเพิ่ม (rollback)");
    V((await holdT(pub(), [line(d, { a: 1 }), line(d, { a: 2 })])).r, "สองบรรทัดพอดีเพดาน");
    eq(await publicHeld(d, NOW0), 5, "ที่ถือ PUBLIC");
  });
  await st("PH-13", "เหตุใหม่แยกจากเพดานเดิมได้: HOLD_LIMIT ของจำนวนการถือต่อตะกร้า (X10 = 1 · ตะกร้า 2 บรรทัดคนละรอบ) ไม่มี reason " + REASON, async () => {
    needDb();
    const d1 = await mkDep({ key: "L", date: "2027-03-22", capacity: 10 }), d2 = await mkDep({ key: "L", date: "2027-03-22", hm: "13:00", capacity: 10 });
    const r = (await holdT(pub({ key: "L" }), [line(d1, { key: "L", a: 1 }), line(d2, { key: "L", a: 1 })])).r;
    codeR(r, "HOLD_LIMIT", "เพดานต่อตะกร้า");
    ok(asRec(r.details)?.reason !== REASON, `เพดานเดิมต้องไม่ใช้ reason ${REASON}: ${fmt(r)}`);
  });
  // ORACLE-EDIT PH-14 (ผู้เขียนข้อสอบแยก 19 พ.ย. · สัญญา §3.1 + มติ R5): ข้อเดิมทุกข้อถือที่ ณ ctx.now เดียวกับคำขอที่ล้ม ⇒ เวลาถึงที่ถือหมดเร็วสุด = T5 × 60 = เพดานพอดี
  // ⇒ บริการที่คืน T5 × 60 ตายตัวก็เขียว (ไม่ได้พิสูจน์สูตร "หมดเร็วสุด") — ข้อนี้ถามหลังถือ 20 นาที ⇒ ต้องได้ ceil((min expiresAt − ctx.now)/1000) จากแถวจริง (< T5 × 60)
  await st("PH-14", "retryAfterSec = เวลาถึงที่ถือ PUBLIC ที่นับซึ่งหมดเร็วสุด (ไม่ใช่ T5 ตายตัว): ถือ 3 ตอน NOW0 + 2 ตอน +10 นาที · ขอ 1 ตอน +20 นาที ⇒ HOLD_LIMIT retryAfterSec = ceil((min expiresAt − now)/1000) = 40 นาที", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-25", capacity: 10 });
    await holdOk(pub(), [line(d, { a: 3 })]);
    await holdOk(pub({ now: addMin(NOW0, 10) }), [line(d, { a: 2 })]);
    const at = addMin(NOW0, 20);
    const r = (await holdT(pub({ now: at }), [line(d, { a: 1 })])).r;
    shareR(r, "ขอหลัง 20 นาที");
    const first = (await q<{ t: Date | null }>(`SELECT min("expiresAt") AS t FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE' AND "expiresAt" > $2::timestamp AND channel = ANY($3::text[]) AND purpose IN ('PAYMENT','SHOP_CONFIRM')`, [d, at.toISOString(), PUBLIC_CHANNELS]))[0]?.t;
    ok(first, "ไม่พบที่ถือที่นับ");
    const want = Math.ceil((new Date(first!).getTime() - at.getTime()) / 1000);
    ok(want >= 1 && want < HOLD_MIN * 60, `เงื่อนไขก่อน: เวลาถึงหมดเร็วสุดต้องน้อยกว่า T5 × 60 (${want})`);
    eq([asRec(r.details)?.retryAfterSec, want], [want, (HOLD_MIN - 20) * 60], "retryAfterSec / ค่าที่คิดเองจากแถว");
  });
  groupLine("PH");

  // ═══════════════ CF. confirm ตรวจรอบยังขายได้ในธุรกรรม ═══════════════
  console.log("\n── CF: ยืนยันตรวจรอบขายได้ในธุรกรรมเดียวกับล็อกรอบ ──");
  /** ยืนยันล้มแล้วต้องไม่เขียนอะไร: ไม่มีการจองของตะกร้า · ตะกร้า OPEN · hold ACTIVE ไม่ผูก · ตัวนับเท่าเดิม · ไม่มี Party ของผู้จองนี้ */
  const nothingWritten = async (h: H, d: string, before: Rec, name: unknown, what: string) => {
    const hr = await holdRow((h.v.holdIds as string[])[0]);
    eq([(await bksOfBasket(h.v.basketId)).length, (await basketRow(h.v.basketId)).status, hr.status, hr.bookingId ?? null, (await dep(d)).held, (await dep(d)).sold, await partiesNamed(tA, name)],
      [0, "OPEN", "ACTIVE", null, before.held, before.sold, 0], `${what} ไม่เขียน (การจอง/ตะกร้า/hold/ผูก/held/sold/Party)`);
  };
  await st("CF-1", "PUBLIC: ถือ → ร้านปิดรอบ (CLOSED) → ยืนยัน ⇒ SLOT_CLOSED · ไม่เขียนอะไร", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-23" });
    const h = await holdOk(pub(), [line(d)]); await setStatus(d, "CLOSED"); const before = await dep(d);
    const b = booker(); codeR(await confirmT(h, { booker: b }), "SLOT_CLOSED", "ยืนยันหลังปิด");
    await nothingWritten(h, d, before, b.name, "CF-1");
  });
  await st("CF-2", "PUBLIC: รอบ CANCELLED หลังถือ ⇒ SLOT_CLOSED · ไม่เขียน", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-23", hm: "10:00" });
    const h = await holdOk(pub(), [line(d)]); await setStatus(d, "CANCELLED"); const before = await dep(d);
    const b = booker(); codeR(await confirmT(h, { booker: b }), "SLOT_CLOSED", "ยืนยันหลังยกเลิกรอบ");
    await nothingWritten(h, d, before, b.name, "CF-2");
  });
  await st("CF-3", "หยุดขายช่องทาง: stopSell {channels:[WEB]} หลังถือ ⇒ ยืนยัน WEB SLOT_CLOSED · stopSell {channels:[LIFF]} ⇒ ยืนยัน WEB ได้", async () => {
    needDb();
    const d1 = await mkDep({ date: "2027-03-24" }), d2 = await mkDep({ date: "2027-03-24", hm: "10:00" });
    const h1 = await holdOk(pub(), [line(d1)]), h2 = await holdOk(pub(), [line(d2)]);
    await pool.query(`UPDATE "TripDeparture" SET "stopSell" = $2::jsonb WHERE id = $1`, [d1, JSON.stringify({ channels: ["WEB"], reason: "qc" })]);
    await pool.query(`UPDATE "TripDeparture" SET "stopSell" = $2::jsonb WHERE id = $1`, [d2, JSON.stringify({ channels: ["LIFF"], reason: "qc" })]);
    const before = await dep(d1); const b = booker();
    codeR(await confirmT(h1, { booker: b }), "SLOT_CLOSED", "หยุดขาย WEB");
    await nothingWritten(h1, d1, before, b.name, "CF-3");
    V(await confirmT(h2), "หยุดขายช่องทางอื่น");
  });
  await st("CF-4", "เลยเวลาปิดรับ WEB หลังถือ: ถือ 10:50Z (ก่อน 18:00 ไทยวันก่อน) → ยืนยัน 11:01Z ⇒ CUTOFF_PASSED ไม่เขียน · อีกตะกร้ายืนยัน 10:58Z ได้", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-20", hm: "09:00" });
    const T = "2027-03-19T10:50:00.000Z";
    const h1 = await holdOk(pub({ now: T }), [line(d)]), h2 = await holdOk(pub({ now: T }), [line(d)]);
    const before = await dep(d); const b = booker();
    codeR(await confirmT(h1, { ctx: withNow(h1.ctx, "2027-03-19T11:01:00.000Z"), booker: b }), "CUTOFF_PASSED", "ยืนยันหลังปิดรับ");
    await nothingWritten(h1, d, before, b.name, "CF-4");
    V(await confirmT(h2, { ctx: withNow(h2.ctx, "2027-03-19T10:58:00.000Z") }), "ยืนยันก่อนปิดรับ");
  });
  await st("CF-5", "รอบเริ่มแล้ว (หน่วย S ปิดรับ 23:59 วันเดินทาง): ถือ 07:50 ไทย → ยืนยัน 08:05 ไทย ⇒ CUTOFF_PASSED ไม่เขียน", async () => {
    needDb();
    const d = await mkDep({ key: "S", date: "2027-03-25", hm: "08:00" });
    const h = await holdOk(pub({ key: "S", now: BKK("2027-03-25", "07:50") }), [line(d, { key: "S" })]);
    const before = await dep(d); const b = booker();
    codeR(await confirmT(h, { ctx: withNow(h.ctx, BKK("2027-03-25", "08:05")), booker: b }), "CUTOFF_PASSED", "ยืนยันหลังเริ่ม");
    await nothingWritten(h, d, before, b.name, "CF-5");
  });
  await st("CF-6", "regression: FULL เพราะที่ถือของตัวเอง ⇒ ยืนยันได้ (ความจุ 3 ถือ 3 ในตะกร้าแรก ⇒ FULL) · GUARANTEED ⇒ ยืนยันได้", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-26", capacity: 3 });
    const h = await holdOk(pub(), [line(d, { a: 3 })]);
    eq((await dep(d)).status, "FULL", "สถานะหลังถือ");
    V(await confirmT(h), "ยืนยันบนรอบ FULL");
    const g = await mkDep({ date: "2027-03-26", hm: "10:00", capacity: 10 });
    const hg = await holdOk(pub(), [line(g, { a: 2 })]); await setStatus(g, "GUARANTEED");
    V(await confirmT(hg), "ยืนยันบนรอบ GUARANTEED");
  });
  await st("CF-7", "[Q2] พนักงานตามช่องทางของตน: ถือ COUNTER → ปิดรอบ → ยืนยัน ⇒ SLOT_CLOSED · ถือ/ยืนยันหลังเว็บปิดแต่หน้าร้านยังเปิด ⇒ ได้ · ยืนยันหลังหน้าร้านปิด (07:00 ไทย) ⇒ CUTOFF_PASSED", async () => {
    needDb();
    const d1 = await mkDep({ date: "2027-03-27" });
    const h1 = await holdOk(staff(), [line(d1)]); await setStatus(d1, "CLOSED");
    const b1 = booker(); codeR(await confirmT(h1, { booker: b1 }), "SLOT_CLOSED", "พนักงานยืนยันหลังปิดรอบ");
    eq([(await bksOfBasket(h1.v.basketId)).length, await partiesNamed(tA, b1.name)], [0, 0], "ไม่เขียน");
    const d2 = await mkDep({ date: "2027-03-28" });
    const h2 = await holdOk(staff({ now: "2027-03-27T11:30:00.000Z" }), [line(d2)]);
    V(await confirmT(h2, { ctx: withNow(h2.ctx, "2027-03-27T11:35:00.000Z") }), "หน้าร้านหลังเว็บปิด");
    const h3 = await holdOk(staff({ now: "2027-03-27T23:55:00.000Z" }), [line(d2)]);
    const b3 = booker(); codeR(await confirmT(h3, { ctx: withNow(h3.ctx, "2027-03-28T00:01:00.000Z"), booker: b3 }), "CUTOFF_PASSED", "หลังหน้าร้านปิด");
    eq(await partiesNamed(tA, b3.name), 0, "Party");
  });
  await st("CF-8", "ลำดับเหตุ (§4): รอบปิด + hold หมดเวลาพร้อมกัน — PUBLIC ⇒ HOLD_EXPIRED (rekey ชั้น 0 มาก่อนตามเดิม) · STAFF onExpired REHOLD ⇒ SLOT_CLOSED (ตรวจรอบหลัง 1a ก่อนผูก hold) ไม่มี hold ใหม่ · ไม่มี Party", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-29" });
    const h = await holdOk(pub(), [line(d)]); const hs = await holdOk(staff(), [line(d)]);
    await setStatus(d, "CLOSED");
    const late = addMin(NOW0, HOLD_MIN + 5);
    const b1 = booker(), b2 = booker();
    codeR(await confirmT(h, { ctx: withNow(h.ctx, late), booker: b1 }), "HOLD_EXPIRED", "PUBLIC ปิด+หมดเวลา");
    codeR(await confirmT(hs, { ctx: withNow(hs.ctx, late), onExpired: "REHOLD", booker: b2 }), "SLOT_CLOSED", "STAFF REHOLD บนรอบปิด");
    eq([await partiesNamed(tA, b1.name), await partiesNamed(tA, b2.name)], [0, 0], "Party");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripHold" WHERE "departureId" = $1`, [d]))[0]?.n, 2, "จำนวนแถว hold (ไม่มี rh_)");
  });
  await st("CF-9", "เส้นทาง K1.1: prepareTripConfirm → ร้านปิดรอบ → finalizeTripsInTx ในธุรกรรมของผู้เรียก ⇒ SLOT_CLOSED · ไม่มีการจอง", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-30" });
    const h = await holdOk(pub(), [line(d)]);
    const p = V(await call("prepareTripConfirm", h.ctx, confirmInput(h), {}), "prepareTripConfirm");
    ok(p.prepared, `ไม่มี prepared: ${fmt(p)}`);
    await setStatus(d, "CLOSED");
    const r = await inTx(tA, uA, (tx) => (fn("finalizeTripsInTx") as (...a: unknown[]) => Promise<unknown>)(tx, h.ctx, [], { prepared: p.prepared, basketId: h.v.basketId }));
    codeR(r, "SLOT_CLOSED", "finalizeTripsInTx หลังปิด");
    eq((await bksOfBasket(h.v.basketId)).length, 0, "การจอง");
  });
  await st("CF-10", "regression: ยืนยันบนรอบเปิด (WEB · LIFF) ได้ตามเดิม · ยืนยันซ้ำคีย์เดิมหลังร้านปิดรอบ ⇒ ผลเดิม (ตะกร้า CHECKED_OUT ไม่ตรวจรอบซ้ำ)", async () => {
    needDb();
    const d = await mkDep({ date: "2027-03-31" });
    const h = await holdOk(pub(), [line(d)]); const key = `c${hex(6)}`; const b = booker();
    const r1 = await confirmT(h, { key, booker: b }); V(r1, "ยืนยันครั้งแรก");
    await setStatus(d, "CLOSED");
    const r2 = await confirmT(h, { key, booker: b });
    eq([r2.ok, ref0(r2).bookingId], [true, ref0(r1).bookingId], "ยืนยันซ้ำ");
    const d2 = await mkDep({ date: "2027-03-31", hm: "10:00" });
    V(await confirmT(await holdOk(pub({ ch: "LIFF" }), [line(d2)])), "LIFF");
  });
  groupLine("CF");

  // ═══════════════ PT. ยืนยันล้มไม่ทิ้ง Party ═══════════════
  console.log("\n── PT: ยืนยันล้มในธุรกรรมไม่ทิ้ง Party (OQ23 ค) ──");
  await st("PT-1", "สำเร็จ ⇒ Party ใหม่ 1 แถว (ชื่อ/เบอร์ตามที่ส่ง) ผูก bookerPartyId · จองครั้งที่สองเบอร์เดิมชื่อเดิม ⇒ Party เดิม ไม่เพิ่มแถว", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-01" });
    const b = booker();
    const r1 = await confirmT(await holdOk(pub(), [line(d)]), { booker: b }); V(r1, "จองที่ 1");
    const r2 = await confirmT(await holdOk(pub(), [line(d)]), { booker: { ...b } }); V(r2, "จองที่ 2");
    const ids = await partyIdNamed(tA, b.name);
    const row = (await q<Rec>(`SELECT phone FROM "Party" WHERE id = $1`, [ids[0] ?? ""]))[0] ?? {};
    eq([ids.length, row.phone, (await bk(ref0(r1).bookingId)).bookerPartyId, (await bk(ref0(r2).bookingId)).bookerPartyId], [1, b.phone, ids[0], ids[0]], "Party/เบอร์/ผูก");
  });
  await st("PT-2", "HOLD_EXPIRED ในธุรกรรม (ยืนยันหลังหมดเวลา · ผู้จองใหม่) ⇒ ไม่มี Party ของผู้จองนี้", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-02" });
    const h = await holdOk(pub(), [line(d)]); const b = booker();
    codeR(await confirmT(h, { ctx: withNow(h.ctx, addMin(NOW0, HOLD_MIN + 1)), booker: b }), "HOLD_EXPIRED", "ยืนยันหลังหมดเวลา");
    eq(await partiesNamed(tA, b.name), 0, "Party ค้าง");
  });
  await st("PT-3", "SLOT_CLOSED/CUTOFF_PASSED ในธุรกรรม ⇒ ไม่มี Party (ร่วมกับ CF-1 CF-4 · ตรวจซ้ำแยกข้อ)", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-03" });
    const h = await holdOk(pub(), [line(d)]); await setStatus(d, "CLOSED"); const b = booker();
    const r = await confirmT(h, { booker: b });
    ok(r.ok !== true, `ยืนยันบนรอบปิดต้องล้ม: ${fmt(r)}`);
    eq(await partiesNamed(tA, b.name), 0, "Party ค้าง");
  });
  await st("PT-4", "HOLD_LIMIT ตอน rekey ผู้ติดต่อ (หน่วย L · X10 = 1 · ผู้ติดต่อ LINE เดียวกัน · ชื่อใหม่) ⇒ ไม่มี Party ของผู้จองที่ล้ม · เหตุไม่ใช่ " + REASON, async () => {
    needDb();
    const d = await mkDep({ key: "L", date: "2027-04-04", capacity: 20 });
    const lineId = `U${hex(8)}`;
    const b1 = { name: `qc4c ผู้จอง ${STAMP} line1`, lineUserId: lineId }, b2 = { name: `qc4c ผู้จอง ${STAMP} line2`, lineUserId: lineId };
    V(await confirmT(await holdOk(pub({ key: "L" }), [line(d, { key: "L", a: 1 })]), { booker: b1 }), "ผู้ติดต่อ LINE ครั้งแรก");
    const r = await confirmT(await holdOk(pub({ key: "L" }), [line(d, { key: "L", a: 1 })]), { booker: b2 });
    codeR(r, "HOLD_LIMIT", "ผู้ติดต่อเกิน X10");
    ok(asRec(r.details)?.reason !== REASON, `ต้องไม่ใช่ ${REASON}: ${fmt(r)}`);
    eq(await partiesNamed(tA, b2.name), 0, "Party ค้าง");
  });
  await st("PT-5", "พนักงาน bookTripsNow ล้มในธุรกรรม (SOLD_OUT: ความจุ 1 ขอ 2) ⇒ ไม่มี Party ของผู้จองนี้", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-05", capacity: 1 });
    const b = booker();
    codeR(await bookNow(staff(), [line(d, { a: 2 })], { booker: b }), "SOLD_OUT", "bookTripsNow");
    eq(await partiesNamed(tA, b.name), 0, "Party ค้าง");
  });
  await st("PT-6", "regression: พนักงานส่ง partyId ของร้าน ⇒ ใช้ Party นั้น ไม่สร้างแถวใหม่ · partyId ร้านอื่น ⇒ NOT_FOUND ไม่เขียน", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-06" });
    const n0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Party" WHERE "tenantId" = $1`, [tA]))[0]?.n ?? -1;
    const r = await bookNow(staff(), [line(d, { a: 1 })], { booker: { name: "ลูกค้าประจำ", partyId: PARTY_A1 } });
    V(r, "bookTripsNow");
    eq([(await bk(ref0(r).bookingId)).bookerPartyId, (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Party" WHERE "tenantId" = $1`, [tA]))[0]?.n], [PARTY_A1, n0], "Party เดิม/จำนวนแถว");
    const pB = await insertRow("Party", { id: rid("pb"), tenantId: tB, name: "ลูกค้าร้านบี", updatedAt: new Date() });
    codeR(await bookNow(staff(), [line(d, { a: 1 })], { booker: { name: "x", partyId: pB } }), "NOT_FOUND", "partyId ร้านอื่น");
  });
  await st("PT-7", "ยืนยันซ้ำคีย์เดิม (ผลเดิม) ไม่สร้าง Party เพิ่ม · ยืนยันซ้ำคีย์ใหม่บนตะกร้าที่ CHECKED_OUT ⇒ STATE_CONFLICT ไม่สร้าง Party", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-07" });
    const h = await holdOk(pub(), [line(d)]); const key = `c${hex(6)}`; const b = booker();
    V(await confirmT(h, { key, booker: b }), "ครั้งแรก"); V(await confirmT(h, { key, booker: b }), "ซ้ำคีย์เดิม");
    const b2 = booker();
    codeR(await confirmT(h, { booker: b2 }), "STATE_CONFLICT", "คีย์ใหม่บนตะกร้าที่ปิดแล้ว");
    eq([await partiesNamed(tA, b.name), await partiesNamed(tA, b2.name)], [1, 0], "Party");
  });
  groupLine("PT");

  // ═══════════════ X3. ยิงพร้อมกัน ═══════════════
  console.log("\n── X3: ยิงพร้อมกัน (≥ 20 ทาง · ฐานจริง) ──");
  await st("X3-1", `24 PUBLIC ถือ 2 ที่ ∥ 4 STAFF ถือ 2 ที่ บนรอบความจุ 40 (เพดาน ${shareLimit(40, 50)}) ⇒ PUBLIC สำเร็จ 10 พอดี (Σ 20) · ที่เหลือ HOLD_LIMIT ${REASON} เท่านั้น · STAFF ครบ 4 · held 28 = Σ hold ACTIVE · ไม่เกินทุกจังหวะ · ไม่ค้าง/ไม่ BUSY`, async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-08", capacity: 40 });
    const lnP = [line(d, { a: 2 })], lnS = [line(d, { a: 2 })];
    const qp = await quoteOf(pub(), lnP), qs = await quoteOf(staff(), lnS);
    const go = (i: number): Promise<Rec> => {
      const isStaff = i % 7 === 6; // 4 จาก 28
      const ctx = isStaff ? staff() : pub(); const qq = isStaff ? qs : qp;
      return call("holdTrips", ctx, { quote: { lines: isStaff ? lnS : lnP }, quoteId: qq.quoteId, quoteExpiresAt: qq.expiresAt, idempotencyKey: `x${hex(6)}`, ...(isStaff ? {} : { basketToken: tok() }) }, {}).then((r) => ({ ...r, isStaff }));
    };
    const stop = sampler([d]);
    const rs = await withTimer(par(28, go), 120_000, "X3-1");
    const s = await stop();
    ok(!rs.some(badOutcome), `ผลเสีย: ${fmt(rs.find(badOutcome))}`);
    const P = rs.filter((r) => !r.isStaff), Sx = rs.filter((r) => r.isStaff);
    const pOk = P.filter((r) => r.ok === true).length;
    const pBad = P.filter((r) => r.ok !== true && !(r.code === "HOLD_LIMIT" && asRec(r.details)?.reason === REASON));
    eq([P.length, Sx.length, pOk, pBad.length, Sx.filter((r) => r.ok === true).length], [24, 4, 10, 0, 4], `PUBLIC/STAFF/สำเร็จ/ผลนอกที่อนุญาต(${fmt(pBad[0] ?? null)})/STAFF สำเร็จ`);
    eq([(await dep(d)).held, await publicHeld(d, NOW0), s.viol.length], [28, 20, 0], "held/ที่ถือ PUBLIC/ค่าผิดระหว่างยิง"); await invOk([d], "X3-1");
  });
  await st("X3-2", "ร้านปิดรอบ ∥ 20 การยืนยัน PUBLIC (ข้อสอบถือล็อกแถวรอบด้วย UPDATE CLOSED ค้างไว้ 1.5 วิ แล้ว COMMIT) ⇒ ทั้ง 20 SLOT_CLOSED · ไม่มีการจอง · ไม่มี Party ค้าง · held คงที่ · ไม่ค้าง/ไม่ BUSY", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-09", capacity: 40 });
    const hs: H[] = []; for (let i = 0; i < 20; i++) hs.push(await holdOk(pub(), [line(d, { a: 1 })]));
    const heldBefore = (await dep(d)).held;
    const bs = hs.map(() => booker());
    const c = await pool.connect();
    let rs: Rec[] = [];
    try {
      await c.query("BEGIN");
      await c.query(`UPDATE "TripDeparture" SET status = 'CLOSED' WHERE id = $1`, [d]);
      const pr = withTimer(Promise.all(hs.map((h, i) => confirmT(h, { booker: bs[i] }).catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec))), 120_000, "X3-2");
      await sleep(1_500);
      await c.query("COMMIT");
      rs = await pr;
    } finally { await c.query("ROLLBACK").catch(() => undefined); c.release(); }
    ok(!rs.some(badOutcome), `ผลเสีย: ${fmt(rs.find(badOutcome))}`);
    eq(rs.map((r) => (r.ok === true ? "ok" : String(r.code))).filter((x) => x !== "SLOT_CLOSED"), [], "ผลที่ไม่ใช่ SLOT_CLOSED");
    let bookings = 0, parties = 0;
    for (const [i, h] of hs.entries()) { bookings += (await bksOfBasket(h.v.basketId)).length; parties += await partiesNamed(tA, bs[i].name); }
    eq([bookings, parties, (await dep(d)).held, (await dep(d)).sold], [0, 0, heldBefore, 0], "การจอง/Party/held/sold"); await invOk([d], "X3-2");
  });
  await st("X3-3", "20 การยืนยัน PUBLIC พร้อมกัน (ผู้จองใหม่ทุกราย · pool 10) ⇒ สำเร็จ 20 ภายใน 90 วิ · ไม่มี BUSY/P2028 (ไม่มี connection ที่สองใน tx) · Party ใหม่ 20 แถวผูกการจองครบ · D.3", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-10", capacity: 40 });
    const hs: H[] = []; for (let i = 0; i < 20; i++) hs.push(await holdOk(pub(), [line(d, { a: 1 })]));
    const bs = hs.map(() => booker());
    const rs = await withTimer(Promise.all(hs.map((h, i) => confirmT(h, { booker: bs[i] }))), 90_000, "X3-3");
    ok(!rs.some(badOutcome), `ผลเสีย: ${fmt(rs.find(badOutcome))}`);
    eq(rs.filter((r) => r.ok === true).length, 20, "สำเร็จ");
    let linked = 0; for (const [i, r] of rs.entries()) { const ids = await partyIdNamed(tA, bs[i].name); if (ids.length === 1 && (await bk(ref0(r).bookingId)).bookerPartyId === ids[0]) linked++; }
    eq(linked, 20, "Party 1 แถว/ผู้จอง ผูกการจอง"); await invOk([d], "X3-3");
  });
  await st("X3-4", "20 การยืนยันที่ล้มในธุรกรรมพร้อมกัน (hold หมดเวลา · ผู้จองใหม่) ⇒ HOLD_EXPIRED ทั้งหมด · ไม่มี Party ค้าง · ไม่มี BUSY", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-11", capacity: 40 });
    const hs: H[] = []; for (let i = 0; i < 20; i++) hs.push(await holdOk(pub(), [line(d, { a: 1 })]));
    const bs = hs.map(() => booker()); const late = addMin(NOW0, HOLD_MIN + 1);
    const rs = await withTimer(Promise.all(hs.map((h, i) => confirmT(h, { ctx: withNow(h.ctx, late), booker: bs[i] }))), 90_000, "X3-4");
    ok(!rs.some(badOutcome), `ผลเสีย: ${fmt(rs.find(badOutcome))}`);
    eq(rs.filter((r) => r.code !== "HOLD_EXPIRED").length, 0, "ผลที่ไม่ใช่ HOLD_EXPIRED");
    let parties = 0; for (const b of bs) parties += await partiesNamed(tA, b.name);
    eq(parties, 0, "Party ค้าง");
  });
  await st("X3-5", `ผสม 26 ทาง บนรอบความจุ 30 (เพดาน ${shareLimit(30, 50)}) ที่มี PUBLIC ถือ 10 อยู่ (5 ตะกร้า): ยืนยัน 5 ∥ PUBLIC ถือใหม่ 2 ที่ ×18 ∥ STAFF ถือ 2 ที่ ×3 ⇒ PUBLIC ถือใหม่ได้ 2 พอดี (ยืนยันแล้วยังนับ) · ยืนยันครบ 5 · STAFF ครบ · held 20 · ไม่ค้าง`, async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-12", capacity: 30 });
    const hs: H[] = []; for (let i = 0; i < 5; i++) hs.push(await holdOk(pub(), [line(d, { a: 2 })]));
    const ln = [line(d, { a: 2 })]; const qp = await quoteOf(pub(), ln), qs = await quoteOf(staff(), ln);
    const jobs: (() => Promise<Rec>)[] = [
      ...hs.map((h) => () => confirmT(h).then((r) => ({ ...r, kind: "C" }))),
      ...Array.from({ length: 18 }, () => () => call("holdTrips", pub(), { quote: { lines: ln }, quoteId: qp.quoteId, quoteExpiresAt: qp.expiresAt, idempotencyKey: `x${hex(6)}`, basketToken: tok() }, {}).then((r) => ({ ...r, kind: "P" }))),
      ...Array.from({ length: 3 }, () => () => call("holdTrips", staff(), { quote: { lines: ln }, quoteId: qs.quoteId, quoteExpiresAt: qs.expiresAt, idempotencyKey: `x${hex(6)}` }, {}).then((r) => ({ ...r, kind: "S" }))),
    ];
    const stop = sampler([d]);
    const rs = await withTimer(Promise.all(jobs.map((j) => j().catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec))), 120_000, "X3-5");
    const s = await stop();
    ok(!rs.some(badOutcome), `ผลเสีย: ${fmt(rs.find(badOutcome))}`);
    const n = (k: string) => rs.filter((r) => r.kind === k && r.ok === true).length;
    const pBad = rs.filter((r) => r.kind === "P" && r.ok !== true && !(r.code === "HOLD_LIMIT" && asRec(r.details)?.reason === REASON));
    eq([n("C"), n("P"), pBad.length, n("S")], [5, 2, 0, 3], "ยืนยัน/PUBLIC ใหม่/ผลนอกที่อนุญาต/STAFF");
    eq([(await dep(d)).held, await publicHeld(d, NOW0), s.viol.length], [20, 14, 0], "held/ที่ถือ PUBLIC/ค่าผิด"); await invOk([d], "X3-5");
  });
  groupLine("X3");

  // ═══════════════ X1. ข้ามร้าน/หน่วย ═══════════════
  console.log("\n── X1: ข้ามร้าน/หน่วย ──");
  await st("X1-1", "ยืนยันตะกร้าร้าน A ด้วย ctx ร้าน B (token ถูก) ⇒ HOLD_NOT_FOUND/NOT_FOUND · ไม่มีการจอง · ไม่มี Party ทั้งสองร้าน", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-13" });
    const h = await holdOk(pub(), [line(d)]); const b = booker();
    codeR(await confirmT(h, { ctx: pub({ key: "B" }), booker: b }), ["HOLD_NOT_FOUND", "NOT_FOUND"], "ข้ามร้าน");
    eq([(await bksOfBasket(h.v.basketId)).length, await partiesNamed(tA, b.name), await partiesNamed(tB, b.name)], [0, 0, 0], "ไม่เขียน");
  });
  await st("X1-2", "ยืนยันตะกร้าหน่วย A ด้วย ctx หน่วย H ร้านเดียวกัน ⇒ HOLD_NOT_FOUND · ไม่มี Party", async () => {
    needDb();
    const d = await mkDep({ date: "2027-04-13", hm: "10:00" });
    const h = await holdOk(pub(), [line(d)]); const b = booker();
    codeR(await confirmT(h, { ctx: pub({ key: "H" }), booker: b }), ["HOLD_NOT_FOUND", "NOT_FOUND"], "ข้ามหน่วย");
    eq(await partiesNamed(tA, b.name), 0, "Party");
  });
  await st("X1-3", "เพดานของร้าน B ไม่ถูกกระทบจากร้าน A: ร้าน A รอบความจุ 10 ถือ PUBLIC 5 · ร้าน B รอบความจุ 10 ถือ PUBLIC 3+2 ได้ · ขอ 1 ⇒ HOLD_LIMIT ของร้าน B เอง", async () => {
    needDb();
    const a = await mkDep({ date: "2027-04-14", capacity: 10 }), b = await mkDep({ key: "B", date: "2027-04-14", capacity: 10 });
    await holdOk(pub(), [line(a, { a: 5 })]);
    await holdOk(pub({ key: "B" }), [line(b, { key: "B", a: 3 })]); V((await holdT(pub({ key: "B" }), [line(b, { key: "B", a: 2 })])).r, "ร้าน B ถือ 2");
    shareR((await holdT(pub({ key: "B" }), [line(b, { key: "B", a: 1 })])).r, "ร้าน B เกินเพดาน");
  });
  groupLine("X1");

  // ═══════════════ ปิดท้าย: ทั้งไฟล์ไม่มี Party ค้าง ═══════════════
  console.log("\n── PT (ท้ายไฟล์) ──");
  await st("PT-8", "ทั้งไฟล์: Party ของข้อสอบ (ชื่อ qc4c) ทุกแถวมีการจองอ้าง — ไม่มี Party ค้างจากการยืนยัน/จองที่ล้ม (รวม PC-2 PC-4 ที่บันทึกสภาพวันนี้)", async () => {
    needDb();
    eq([await orphanParties(tA), await orphanParties(tB)], [0, 0], "Party ค้าง ร้าน A/B");
  });

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); await rateKeysCleanup(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T0.4c · เพดานที่ถือ PUBLIC ต่อรอบ · ยืนยันตรวจรอบในธุรกรรม · Party ไม่ค้าง =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
