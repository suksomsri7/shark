// QC — TRIPS T0.7a · เงินฝั่ง trips: งวดจ่าย · รับเงิน · QR พร้อมเพย์ยอดล็อก · คำขอคืนเงินเป็นขั้นตอน (G.3) · ข้อมูลเอกสาร · งาน trips.paymentDue
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/T0.7.md · ledger/TRIPS-CORE-CONTRACT.md §D.5 §F.2 §G.1 §G.3 §H.0–§H.2 §H.8 §J.1 §J.2 · wo-notes trips-T0.6.md "ข้อบังคับ" · trips-T0.5.md มติ 5 8
//   คำตอบเจ้าของ 13 พ.ย. (OQ17): POS ไม่อนุญาต · เอกสารเงินผ่านบัญชี V2 (T0.7b) · ใบนี้ไม่เรียกบัญชี/POS — ทุกแถวเงิน UNPOSTED
//
// กลุ่มข้อ:
//   PC ตัวควบคุมบวก   S ไฟล์/facade/กติกาโค้ด (เทียบ BASE_SHA · ไม่นับไฟล์ที่ตรงกับ session/trips)   MC สูตรบริสุทธิ์ (money-core)
//   DU งวดจ่าย   PY รับเงิน   QR พร้อมเพย์ยอดล็อก   RF คำขอคืนเงิน   DN บันทึกโอนคืน (DONE)   CN tripSellable.cancel   MV แก้การจองที่มีงวด/จ่ายแล้ว
//   CD ข้อมูลกระทบยอดเงินสด (N-4)   RC ยิงพร้อมกัน   NC ไม่มี connection ที่สองในธุรกรรม   X แยกร้าน/หน่วย   PM ผู้กระทำ/สิทธิ์   EV event/audit   JB งานงวด   LT ตัวกวาด (ท้ายไฟล์)
//
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t07-*` ลบใน finally + กวาดค้างตอนเริ่ม · ตารางควบคุม `_qc_t07_ctl_*` · ไม่แตะร้าน seed
// 🔴 สินค้า/ประเภทคน/รายการเสริม/รอบ/ราคา สร้างด้วย SQL ดิบตามรูปตาราง T0.1 · การจองผ่านบริการ T0.6 (merge แล้ว) · เงินผ่านบริการ T0.7 เท่านั้น
// 🔴 นาฬิกา = ctx.now · ตัวกวาด/งานงวดเรียกด้วย tenantIds ของร้านชั่วคราวเท่านั้น (ไม่กวาดทั้งฐาน)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t0.7.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมี T0.7: PC เขียว · S-15 เขียวได้ (ยังไม่มีการแก้) · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t0.7";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** ปลาย wip/trips-t0.7 ตอนเขียนข้อสอบ (= session/trips: P0.1–T0.6 + T1.1) — ฐานของ S-15 */
const BASE_SHA = "4026db50488a756879496f94f97daf02724a4770";

loadTripsQcEnv(LABEL);
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
const groupLine = (g: string) => {
  const mine = cks.filter((c) => c.id.replace(/-\d+$/, "") === g);
  console.log(`  ── สรุป ${g}: ผ่าน ${mine.filter((c) => c.res === "PASS").length}/${mine.length}`);
};
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const num = (v: unknown): number => Number(v);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t07qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SLUG = "trips-t07-";
const EMAIL_PREFIX = "trips-t07-";
const CTL_PREFIX = "_qc_t07_ctl_";
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const addMin = (d: Date | string, m: number) => new Date(new Date(d).getTime() + m * 60_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const INT4 = 2_147_483_647;

// ── ตัวคิดอิสระของข้อสอบ (BigInt · ปัดครึ่งขึ้น ป.86/2542 ข้อ 4(6) — skill common-vat-invoice §20) ──
const halfUp = (a: number, b: number, c: number): number => { const n = BigInt(a) * BigInt(b), d = BigInt(c); return Number((BigInt(2) * n + d) / (BigInt(2) * d)); };
const vatIn = (x: number, bp = 700) => halfUp(x, bp, 10_000 + bp);
/** ปันแบบ "บรรทัดสุดท้ายที่น้ำหนัก > 0 รับเศษ" (สเปกของ allocateWithin · money-math) — ใช้กับกรณีที่ไม่ล้นเพดาน */
const allocLast = (total: number, w: number[]): number[] => {
  const sw = w.reduce((s, x) => s + x, 0); const out = w.map(() => 0); let last = -1;
  w.forEach((x, i) => { if (x > 0) last = i; });
  if (sw === 0 || last < 0) { out[w.length - 1] = total; return out; }
  let acc = 0;
  w.forEach((x, i) => { if (i === last || x <= 0) return; const s = halfUp(total, x, sw); out[i] = s; acc += s; });
  out[last] = total - acc; return out;
};

// ═══════════════ ตัวเลขอ้างอิง (ฟิกซ์เจอร์ · README · สัญญา) ═══════════════
const R = FX.PRODUCT_RACHA;
const B0142 = FX.BOOKING_TR_0142;
const RC = FX.RECEIPT_RC_0588;
const RF88 = FX.REFUND_TR_0188;
const TOTAL = B0142.totalSatang; // 1,145,000
const PARK = B0142.parkSatang; // 150,000
const VATABLE = RC.serviceInclVatSatang; // 995,000
const VAT_DOC = RC.vatSatang; // 65,093
const SHORT = B0142.slipShort.slipSatang; // 1,140,000 (ภาพ 07ค)
const DEP30 = halfUp(VATABLE, 3_000, 10_000); // มัดจำ 30 % TRIP_ONLY = 298,500 (CC :781 · pricing-core :1137)
const BAL30 = TOTAL - DEP30; // 846,500

// ═══════════════ สเปก (ใบสั่ง T0.7 §1 §4–§14) ═══════════════
const D = "src/lib/modules/trips/";
const NEW_FILES = ["money-core.ts", "money.ts", "refund.ts", "money-actions.ts"].map((f) => D + f);
const CORE_FNS = ["tenderGroupOf", "canTransitionRefund", "dueDraftsFromSnapshot", "allocatePayment", "receiptVatSatang", "bookingStatusAfterPayment", "refundQuoteFromSnapshot", "planRefundSlices", "tripRefundEntityId", "moneyDocumentOf"];
const SVC_FNS = ["recordTripPayment", "tripPaymentIntent", "listTripDues", "tripMoneySummary", "tripCashDay", "ensureTripDuesInTx", "runPaymentDue",
  "requestTripRefund", "decideTripRefund", "withdrawTripRefund", "executeTripRefund", "getTripRefund", "listTripRefunds"];
const CONSTS = ["TRIP_TENDERS", "TRIP_REFUND_STATUSES", "TRIP_REFUND_OPEN_STATUSES", "TRIP_REFUND_TRANSITIONS", "TRIP_REFUND_ENTITY", "unavailablePostingPort"];
const EVENTS_NEW = ["trips.payment.received", "trips.payment.due_soon", "trips.payment.overdue", "trips.booking.part_paid", "trips.booking.paid", "trips.refund.requested", "trips.refund.approved", "trips.refund.done"];
const PERM_KEYS = ["trips.payment.record", "trips.refund.request", "trips.refund.approve", "trips.refund.execute"];
const REFUND_TRANS: [string, string][] = [["REQUESTED", "QUOTED"], ["QUOTED", "APPROVED"], ["QUOTED", "REJECTED"], ["QUOTED", "WITHDRAWN"], ["APPROVED", "EXECUTING"], ["EXECUTING", "DONE"], ["EXECUTING", "FAILED"], ["FAILED", "EXECUTING"]];
const REFUND_ST = ["REQUESTED", "QUOTED", "APPROVED", "REJECTED", "WITHDRAWN", "EXECUTING", "DONE", "FAILED"];
const SOLD_ST = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
const SELL_CODES = ["VALIDATION", "NOT_FOUND", "FORBIDDEN", "KIND_NOT_SUPPORTED", "CURRENCY_NOT_ALLOWED", "SOLD_OUT", "INSUFFICIENT_ALLOTMENT", "BERTH_TAKEN", "SLOT_CLOSED", "CUTOFF_PASSED",
  "PRICE_CHANGED", "BELOW_MIN_SELL_PRICE", "DISCOUNT_OVER_CAP", "HOLD_EXPIRED", "HOLD_NOT_FOUND", "HOLD_LIMIT", "AGENT_SUSPENDED", "CREDIT_LIMIT", "REQUIRES_APPROVAL",
  "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "BUSY", "STATE_CONFLICT"];
const NOW0 = "2027-03-01T03:00:00.000Z"; // 10:00 น. 1 มี.ค. 2570 (เวลาร้าน) — เวลาจอง/รับเงินพื้นฐาน
const TRAVEL = "2027-04-10"; // วันเดินทางหลัก (D)
const T23 = "2027-03-18T03:00:00.000Z"; // D − 23 วัน (ภาพ 15 / REFUND_TR_0188.daysBefore 23) ⇒ ขั้น 50 %
const T40 = "2027-03-01T05:00:00.000Z"; // D − 40 วัน ⇒ 100 %

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 40 });
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
async function dropControlTables() {
  try { for (const r of await q<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = current_schema() AND tablename LIKE $1`, [`${CTL_PREFIX}%`])) await pool.query(`DROP TABLE IF EXISTS "${r.t}"`); } catch (e) { console.log(`  ⚠️ ลบตารางควบคุม: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
const withTimer = async <T,>(p: Promise<T>, ms: number, what: string): Promise<T> => {
  let t: NodeJS.Timeout | undefined;
  try { return await Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new AssertFail(`${what}: ค้างเกิน ${ms / 1000} วินาที (สงสัย pool ค้าง/รอล็อกไม่จบ)`)), ms); })]); }
  finally { if (t) clearTimeout(t); }
};
const badOutcome = (r: Rec) => r.ok === "THROW" || (r.code === "BUSY") || /40P01|deadlock|P2028|P2034|55P03|Transaction already closed|Unable to start a transaction/i.test(`${r.e ?? ""} ${r.pg ?? ""}`);

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
  const PPI = await tryImport("@/lib/payment/promptpay");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name} (T0.7 ยังไม่สร้าง)`); return f as AnyFn; };
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e), pg: String((e as { code?: unknown }).code ?? "") }; }
  };
  const pure = (name: string, ...a: unknown[]): Rec => { const r = fn(name)(...a); return asRec(r) ?? { value: r }; };
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const codeR = (r: Rec, code: string | string[], what: string, reason?: string | string[]) => {
    const cs = Array.isArray(code) ? code : [code];
    ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`);
    if (reason) { const rs = Array.isArray(reason) ? reason : [reason]; ok(rs.includes(String(asRec(r.details)?.reason)), `${what} details.reason ต้อง ${rs.join("|")} ได้ ${fmt(r.details)}`); }
  };
  const par = async (n: number, f: (i: number) => Promise<Rec>): Promise<Rec[]> => Promise.all(Array.from({ length: n }, (_, i) => f(i).catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec)));
  const inTx = async (tenantId: string, unitId: string, body: (tx: unknown) => Promise<unknown>): Promise<Rec> => {
    const td = DBI.mod?.tenantDb;
    if (typeof td !== "function") throw new AssertFail(`โหลด tenantDb ไม่ได้ (${DBI.err.slice(0, 80)})`);
    const db = asRec((td as AnyFn)({ tenantId, unitId })) ?? {};
    const tr = db.$transaction as ((f: (tx: unknown) => Promise<unknown>, o?: Rec) => Promise<unknown>) | undefined;
    if (typeof tr !== "function") throw new AssertFail("tenantDb ไม่มี $transaction");
    try { const r = await tr.call(db, body, { timeout: 60_000, maxWait: 60_000 }); return asRec(r) ?? { ok: true, value: r }; }
    catch (e) { const c = (e as { code?: unknown }).code; return typeof c === "string" && SELL_CODES.includes(c) ? { ok: false, code: c, thrown: true } : { ok: "THROW", e: errMsg(e), pg: String(c ?? "") }; }
  };

  // ═══════════════ PC. ตัวควบคุมบวก ═══════════════
  console.log("\n── PC: ตัวควบคุมบวก ──");
  const CTL = `${CTL_PREFIX}${STAMP}`, CTLM = `${CTL_PREFIX}m_${STAMP}`;
  let ctlReady = "";
  try {
    await pool.query(`CREATE TABLE "${CTL}" (id text PRIMARY KEY, capacity int NOT NULL, sold int NOT NULL DEFAULT 0, held int NOT NULL DEFAULT 0, reserved int NOT NULL DEFAULT 0)`);
    await pool.query(`CREATE TABLE "${CTLM}" (id serial PRIMARY KEY, grp text NOT NULL, paid int NOT NULL DEFAULT 0, cap int NOT NULL)`);
  } catch (e) { ctlReady = errMsg(e); }
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed andaman-dive อยู่ · ตารางเงิน T0.1 ครบ (TripPaymentDue · TripMoneyEvent · TripRefundRequest · TripPassThroughEvidence) · สร้างตารางควบคุมได้", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = 'andaman-dive'`))[0]?.n, 1, "ร้าน andaman-dive");
    for (const t of ["TripPaymentDue", "TripMoneyEvent", "TripRefundRequest", "TripPassThroughEvidence", "PaymentSlip"]) await needTable(t);
    ok(!ctlReady, `สร้างตารางควบคุมไม่ได้: ${ctlReady}`);
  });
  await st("PC-2", "ฟิกซ์เจอร์: 0142 = 11,450 (อุทยาน 1,500 · VATable 9,950) · VAT ต่อเอกสาร 650.93 · ภาพ 15 คืน 6,475 / เก็บ 4,975 · VAT ส่วนคืน 325.47 + ส่วนเก็บ 325.46 = 650.93", () => {
    eq(B0142.lines.reduce((s, l) => s + l.totalSatang, 0), TOTAL, "ยอด 0142");
    eq(TOTAL - PARK, VATABLE, "VATable");
    eq(vatIn(VATABLE), VAT_DOC, "VAT ต่อเอกสาร");
    eq([RF88.refundSatang, RF88.keptSatang, RF88.lines.reduce((s, l) => s + l.refundSatang, 0)], [647_500, 497_500, 647_500], "ภาพ 15");
    eq([vatIn(RF88.refundSatang - PARK), VAT_DOC - vatIn(RF88.refundSatang - PARK)], [32_547, 32_546], "VAT คืน/เก็บ (CC :783)");
  });
  await st("PC-3", "ตัวคิดของข้อสอบตรงตัวอย่างในคำสั่งกรมสรรพากร (ป.86/2542 ข้อ 4(6)): 7/107 × 100 บาท = 6.54 · 7/107 × 180 บาท = 11.78 · ปันยอดรวมตรงพอดี", () => {
    eq([vatIn(10_000), vatIn(18_000)], [654, 1_178], "ปัดครึ่งขึ้น");
    const a = allocLast(65_093, [DEP30, 696_500]); eq([a, (a[0] ?? 0) + (a[1] ?? 0)], [[19_528, 45_565], 65_093], "ปันตรงพอดี");
  });
  await st("PC-4", "ตัวควบคุม: QR พร้อมเพย์ของแพลตฟอร์ม — CRC16 เวกเตอร์มาตรฐาน '123456789' ⇒ 29B1 · payload ยอดล็อก 11,450.00 มีแท็ก 54 '5408' + '11450.00'", () => {
    const crc = PPI.mod?.crc16xmodem as AnyFn | undefined, pp = PPI.mod?.promptpayPayload as AnyFn | undefined;
    ok(crc && pp, `โหลด promptpay ไม่ได้ ${PPI.err}`);
    eq(crc?.("123456789"), "29B1", "CRC");
    ok(String(pp?.({ id: "0812345678", amountSatang: TOTAL })).includes("540811450.00"), "แท็ก 54");
  });
  await st("PC-5", "ตัวควบคุม: อ่านยอดแล้วเขียน (ไม่มีเงื่อนไขใน UPDATE) 20 คำขอพร้อมกัน ⇒ ยอดรวมเกินเพดาน (ตัวตรวจจ่ายเกินเห็นได้จริง · ≤ 3 ครั้ง)", async () => {
    ok(!ctlReady, `ไม่มีตารางควบคุม: ${ctlReady}`);
    for (let a = 0; a < 3; a++) {
      const g = `g${a}${hex(2)}`; await pool.query(`INSERT INTO "${CTLM}" (grp, paid, cap) VALUES ($1, 0, 5)`, [g]);
      await Promise.all(Array.from({ length: 20 }, async () => {
        const c = await pool.connect();
        try { const p = (await c.query<{ paid: number; cap: number }>(`SELECT paid, cap FROM "${CTLM}" WHERE grp = $1`, [g])).rows[0]; await c.query(`SELECT pg_sleep(0.01)`); if (p && p.paid + 1 <= p.cap) await c.query(`UPDATE "${CTLM}" SET paid = $2 WHERE grp = $1`, [g, p.paid + 1]); } finally { c.release(); }
      }));
      const r = (await q<{ paid: number }>(`SELECT paid FROM "${CTLM}" WHERE grp = $1`, [g]))[0];
      // อ่านแล้วเขียนทับ ⇒ "lost update" (นับขาด) — ตัวควบคุมพิสูจน์ว่าการยิงพร้อมกันจริงพอจะเห็นการแข่ง
      if (r && r.paid < 5) return;
    }
    throw new AssertFail("control inconclusive: ไม่เห็นการแข่ง");
  });
  await st("PC-6", "ตัวควบคุม: UPDATE คำสั่งเดียวมีเงื่อนไข (paid + 1 <= cap) 40 คำขอพร้อมกัน ⇒ paid = cap พอดี (แบบที่ใบสั่ง §2.1 บังคับ)", async () => {
    ok(!ctlReady, `ไม่มีตารางควบคุม: ${ctlReady}`);
    const g = `u${hex(3)}`; await pool.query(`INSERT INTO "${CTLM}" (grp, paid, cap) VALUES ($1, 0, 7)`, [g]);
    const r = await Promise.all(Array.from({ length: 40 }, async () => (await q(`UPDATE "${CTLM}" SET paid = paid + 1 WHERE grp = $1 AND paid + 1 <= cap RETURNING paid`, [g])).length));
    eq([r.reduce((s, x) => s + x, 0), (await q<{ paid: number }>(`SELECT paid FROM "${CTLM}" WHERE grp = $1`, [g]))[0]?.paid], [7, 7], "ยอด");
  });
  await st("PC-7", "ตัวควบคุม: ล็อกสลับลำดับ (A: r1→r2 · B: r2→r1) ⇒ Postgres ตอบ 40P01 (ตัวจับ deadlock ของกลุ่ม RC ใช้ได้)", async () => {
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
      codes.push(...(await withTimer(Promise.all([pa, pb]), 20_000, "PC-7")));
    } finally { await a.query("ROLLBACK").catch(() => undefined); await b.query("ROLLBACK").catch(() => undefined); a.release(); b.release(); }
    ok(codes.includes("40P01"), `ไม่เห็น 40P01: ${codes.join(",")}`);
  });
  await st("PC-8", "ตัวควบคุม: ผู้ถือ tx ขอ connection ที่สองจาก pool เดียวกัน (max 3) ⇒ ค้างจนตัวจับเวลาจับได้ (ตัวตรวจ NC เห็นอาการ pool ค้างจริง)", async () => {
    const small = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 0 });
    const held: pg.PoolClient[] = [];
    let stalled = false;
    try {
      for (let i = 0; i < 3; i++) { const c = await small.connect(); await c.query("BEGIN"); held.push(c); }
      try { await withTimer(Promise.all(held.map(() => small.connect().then((c2) => { c2.release(); }))), 3_000, "PC-8"); } catch (e) { stalled = e instanceof AssertFail; }
    } finally { for (const c of held) { await c.query("ROLLBACK").catch(() => undefined); c.release(); } await small.end().catch(() => undefined); }
    ok(stalled, "ไม่ค้าง — ตัวตรวจ pool ใช้ไม่ได้");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์ · facade · กติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด ──");
  const srcOf = (p: string) => stripComments(read(p));
  const OWN_SRC = [D + "money-core.ts", D + "money.ts", D + "refund.ts"];
  await st("S-1", "ไฟล์ใหม่ครบ: money-core · money · refund · money-actions", () => {
    const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
  await st("S-2", `facade ส่งออก ${CORE_FNS.length + SVC_FNS.length} ฟังก์ชัน + ${CONSTS.length} ค่า · บล็อก "// TRIPS T0.7 ▸" · ไม่มี export *`, () => {
    const t = needTrips();
    const miss = [...CORE_FNS, ...SVC_FNS].filter((n) => typeof t[n] !== "function").concat(CONSTS.filter((n) => t[n] === undefined));
    ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 10).join(", ")}`);
    const idx = read(D + "index.ts");
    ok(/\/\/\s*TRIPS T0\.7 ▸/.test(idx), "ไม่มีบล็อก // TRIPS T0.7 ▸ … ◂");
    ok(!/export\s*\*\s*from/.test(stripComments(idx)), "มี export * ใน facade");
  });
  await st("S-3", "money-core.ts บริสุทธิ์: import ได้แค่ zod · ./money-math · ./snapshot · ./state · ./booking-core · import type · ไม่มี prisma/tenantDb/นาฬิกา", () => {
    const s = srcOf(D + "money-core.ts"); ok(s, "ยังไม่มีไฟล์");
    const bad: string[] = [];
    for (const m of s.matchAll(/^import\s+(?!type\b)[^;]*?from\s*["']([^"']+)["']/gm)) if (!["zod", "./money-math", "./snapshot", "./state", "./booking-core"].includes(m[1] ?? "")) bad.push(String(m[1]));
    if (/\b(prisma|tenantDb|\$queryRaw|\$transaction|Date\.now\(\)|new Date\(\)|resolveSettings)/.test(s)) bad.push("ไม่บริสุทธิ์");
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("S-4", "money-actions.ts: \"use server\" · ส่งออกเฉพาะ async function · requireUnit + assertCan ของสิทธิ์ 4 คีย์ใหม่ · ไม่รับ now", () => {
    const raw = read(D + "money-actions.ts"); ok(raw, "ยังไม่มีไฟล์");
    const s = stripComments(raw);
    ok(/^\s*["']use server["'];?/.test(s.trimStart()), "ไม่ขึ้นต้น \"use server\"");
    const exps = [...s.matchAll(/^export\s+(?!async\s+function\b)(\S+)/gm)].map((m) => m[1]);
    ok(exps.length === 0, `export ที่ไม่ใช่ async function: ${exps.join(", ")}`);
    ok(/requireUnit\(/.test(s), "ไม่มี requireUnit");
    const miss = PERM_KEYS.filter((k) => !new RegExp(`assertCan\\([^)]*["'\`]${k.replace(/\./g, "\\.")}["'\`]`).test(s));
    ok(miss.length === 0, `assertCan ไม่ครบ: ${miss.join(", ")}`);
    ok(!/\bnow\s*:/.test(s.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""')), "action รับ/ส่ง now");
  });
  await st("S-5", "ไฟล์ของใบ: ไม่มี any · console.* · DELETE/.delete( · Math.round/toFixed/parseFloat (เงินผ่าน money-math เท่านั้น)", () => {
    const bad: string[] = [];
    for (const f of [...OWN_SRC, D + "money-actions.ts"]) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (/(:\s*any\b|\bas\s+any\b|<any>|any\[\])/.test(s)) bad.push(`${f}: any`);
      if (/\bconsole\.(log|info|warn|error|debug)\s*\(/.test(s)) bad.push(`${f}: console`);
      if (/\.(delete|deleteMany)\s*\(|DELETE\s+FROM/i.test(s)) bad.push(`${f}: ลบแถว`);
      if (/Math\.round\s*\(|\.toFixed\s*\(|parseFloat\s*\(/.test(s)) bad.push(`${f}: คิดเงินเอง`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-6", "import ของ money/refund: @/lib/core/* zod @prisma/client ./ node:crypto · @/lib/modules/approval · @/lib/payment/receiver เท่านั้น · ไม่มี prisma ดิบ (F5 +0) · ไม่แตะ pos/account/hotel/rooms/dorm/booking/queue/ticket/slip", () => {
    const bad: string[] = [];
    const okSpec = (sp: string) => sp.startsWith("@/lib/core/") || sp === "zod" || sp === "@prisma/client" || sp.startsWith("./") || sp === "node:crypto" || sp === "@/lib/modules/approval" || sp === "@/lib/payment/receiver";
    for (const f of [D + "money.ts", D + "refund.ts"]) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(s)) bad.push(`${f}: prisma ดิบ`);
      for (const m of s.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g)) if (!okSpec(m[1] ?? "")) bad.push(`${f}→${m[1]}`);
      for (const m of s.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) if (!okSpec(m[1] ?? "")) bad.push(`${f}→${m[1]}`);
    }
    const a = srcOf(D + "money-actions.ts");
    if (/@\/lib\/modules\/(pos|account|hotel|rooms|dorm|booking|queue|ticket)\b|@\/lib\/payment\/slip/.test(a)) bad.push("money-actions แตะโมดูลต้องห้าม");
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-7", "CAS: ทุก UPDATE \"TripRefundRequest\"/\"TripPaymentDue\" ที่ตั้ง status มี WHERE \"status\" + RETURNING · ไม่มี ORM tripRefundRequest/tripPaymentDue/tripMoneyEvent .update(Many) (ตัวควบคุม regex จับโค้ดผิดได้)", () => {
    const badOf = (s: string): string[] => {
      const out: string[] = [];
      for (const m of s.matchAll(/UPDATE\s+"(TripRefundRequest|TripPaymentDue)"[^`]*?SET([\s\S]*?)`/g)) {
        const [set = "", where = ""] = (m[2] ?? "").split(/\bWHERE\b/i);
        if (!/"status"\s*=/.test(set) && !/"paidSatang"\s*=/.test(set)) continue;
        if (!/"status"\s*(=|IN|=\s*ANY)/i.test(where) || !/RETURNING/i.test(where)) out.push(`${m[1]} CAS ไม่ครบ`);
      }
      for (const m of s.matchAll(/(tripRefundRequest|tripPaymentDue|tripMoneyEvent)\.(update|updateMany|upsert)\s*\(/g)) out.push(`ORM ${m[1]}.${m[2]}`);
      return out;
    };
    eq(badOf("await tx.$queryRaw`UPDATE \"TripRefundRequest\" SET \"status\" = 'DONE' WHERE \"id\" = ${id}`;\nawait tx.tripPaymentDue.update({ where: { id }, data: {} });").length, 2, "ตัวควบคุม regex");
    const bad = OWN_SRC.flatMap((f) => { const s = srcOf(f); return s ? badOf(s).map((x) => `${f}: ${x}`) : [`${f}(ไม่มีไฟล์)`]; });
    ok(/UPDATE\s+"TripPaymentDue"/.test(srcOf(D + "money.ts")) && /UPDATE\s+"TripRefundRequest"/.test(srcOf(D + "refund.ts")), "ไม่พบคำสั่ง UPDATE งวด/คำขอ");
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-8", "OQ18: ไม่ส่ง object ของผู้เรียกเข้า Prisma data · zod strict ในบริการเงิน", () => {
    const bad: string[] = [];
    for (const f of OWN_SRC) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (/\bdata\s*:\s*(input|req|args|body|raw|params|payload|p\.data|parsed\.data|v)\b/.test(s)) bad.push(`${f}: data = object ผู้เรียก`);
      if (/\bdata\s*:\s*\{\s*\.\.\.(input|req|args|body|raw|params|payload|p\.data|v)\b/.test(s)) bad.push(`${f}: ...object ผู้เรียกใน data`);
    }
    ok(/(z\.strictObject\(|\.strict\(\))/.test(srcOf(D + "money.ts")) && /(z\.strictObject\(|\.strict\(\))/.test(srcOf(D + "refund.ts")), "ไม่มี zod strict");
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-9", "บริการเงินไม่เรียก QR/ค่าตั้ง/approval ในธุรกรรม: ฟังก์ชัน *InTx ไม่มี promptpayQrFor/resolveSettings/requestBindings/tenantDb(/$transaction(", () => {
    const bad: string[] = [];
    for (const f of OWN_SRC) {
      const s = srcOf(f);
      for (const h of s.matchAll(/(?:export\s+)?async\s+function\s+(\w+InTx)\s*\(([\s\S]*?)\n\}/g)) {
        const body = h[2] ?? "";
        for (const k of ["promptpayQrFor(", "resolveSettings", "requestBindings(", "tenantDb(", "$transaction(", "runBooking("]) if (body.includes(k)) bad.push(`${h[1]}: ${k}`);
      }
    }
    ok(/async\s+function\s+ensureTripDuesInTx/.test(srcOf(D + "money.ts")), "ไม่มี ensureTripDuesInTx ใน money.ts");
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("S-10", "booking.ts: ไม่มีทาง STATE_CONFLICT REFUND_REQUIRED / NOT_SUPPORTED แบบเหมารวมของ PART_PAID|PAID อีก · ยกเลิกหลังขายเรียกคำขอคืนเงิน · ยืนยันการจองสร้างงวด (ensureTripDuesInTx)", () => {
    const s = srcOf(D + "booking.ts");
    ok(!/reason:\s*"REFUND_REQUIRED"/.test(s), "ยังคืน REFUND_REQUIRED");
    ok(!/b\.status\s*===\s*"PART_PAID"\s*\|\|\s*b\.status\s*===\s*"PAID"\)\s*return\s+sellFail\("STATE_CONFLICT",\s*\{\s*reason:\s*"NOT_SUPPORTED"/.test(s), "ยังปฏิเสธ PART_PAID/PAID เหมารวม");
    ok(/requestTripRefund|requestRefundInTx|refund/.test(s) && /ensureTripDuesInTx/.test(s), "ไม่เชื่อมคำขอคืนเงิน/งวด");
  });
  await st("S-11", "ตัวกวาด T0.4: payload trips.booking.expired ใช้ยอด payable จาก snapshot ไม่ใช่ grossSatang (capacity.ts แก้ ≤ 8 บรรทัดเทียบ BASE)", () => {
    const s = srcOf(D + "capacity.ts");
    const i = s.indexOf('type: "trips.booking.expired"'); ok(i > 0, "ไม่พบตัวยิง");
    ok(!/amountSatang:\s*b\.grossSatang/.test(s.slice(i, i + 600)), "ยังใช้ grossSatang");
    const rows = git(["diff", "--numstat", BASE_SHA, "--", D + "capacity.ts"]).trim().split(/\s+/);
    ok(Number(rows[0] ?? 0) + Number(rows[1] ?? 0) <= 8, `capacity.ts แก้ ${rows[0]}+/${rows[1]}−`);
  });
  await st("S-12", "สิทธิ์ 4 คีย์ใหม่ในโมดูล trips (ป้ายไทย)", async () => {
    const P = (await tryImport("@/lib/core/permissions")).mod;
    const isKey = P?.isPermissionKey as ((k: string) => boolean) | undefined, label = P?.permissionLabel as ((k: string) => string) | undefined, mod = P?.moduleOfPermissionKey as ((k: string) => string) | undefined;
    ok(isKey && label && mod, "โหลด permissions ไม่ได้");
    const miss = PERM_KEYS.filter((k) => !isKey?.(k) || !THAI.test(String(label?.(k) ?? "")) || mod?.(k) !== "trips");
    ok(miss.length === 0, `ยังไม่ลงทะเบียน: ${miss.join(", ")}`);
  });
  await st("S-13", `event ใหม่ ${EVENTS_NEW.length} ตัวลง 3 ทะเบียน (outbox-consumers · automation/labels ป้ายไทย · webhooks ผ่าน spread)`, () => {
    const cons = read("src/lib/outbox-consumers.ts"), auto = read("src/lib/automation/labels.ts"), web = read("src/lib/webhooks/labels.ts");
    const miss = EVENTS_NEW.filter((e) => !cons.includes(`"${e}"`) || !new RegExp(`value:\\s*"${e.replace(/\./g, "\\.")}",\\s*label:\\s*"[^"]*[฀-๿]`).test(auto));
    ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
    ok(web.length > 0, "ไม่มี webhooks/labels.ts");
  });
  await st("S-14", "งาน trips.paymentDue ลงทะเบียนใน minute-jobs (lazy import facade · ส่ง signal) · runPaymentDue อยู่ใน jobs.ts", () => {
    const m = stripComments(read("src/lib/platform/minute-jobs.ts"));
    const i = m.indexOf('"trips.paymentDue"'); ok(i > 0, "ยังไม่ลงทะเบียน");
    ok(/runPaymentDue\(/.test(m.slice(i, i + 400)) && /signal/.test(m.slice(i, i + 400)), "ไม่เรียก runPaymentDue พร้อม signal");
    ok(/export\s+async\s+function\s+runPaymentDue/.test(srcOf(D + "jobs.ts")), "runPaymentDue ไม่อยู่ใน jobs.ts");
  });
  await st("S-15", `ไม่แตะไฟล์ต้องห้ามเทียบ BASE ${BASE_SHA.slice(0, 9)} (ไม่นับไฟล์ที่ตรงกับ session/trips): prisma · core/settings · core/sellable · platform/sellables · payment · api/files · pos/account/hotel/rooms/booking/dorm/queue/ticket · snapshot/pricing/promo/money-math/state/numbering ฯลฯ · ข้อสอบเดิม`, () => {
    ok(git(["cat-file", "-t", BASE_SHA]).trim() === "commit", `หา BASE_SHA ${BASE_SHA} ไม่เจอ`);
    const trips = ["snapshot.ts", "pricing.ts", "pricing-core.ts", "promo.ts", "prices.ts", "money-math.ts", "state.ts", "numbering.ts", "capacity-core.ts", "capacity-service.ts", "capacity-actions.ts",
      "products.ts", "products-core.ts", "product-actions.ts", "departures.ts", "departures-core.ts", "departure-actions.ts", "resources.ts", "waitlist.ts", "json-schemas.ts", "pricing-actions.ts", "booking-actions.ts"].map((f) => D + f);
    const paths = ["prisma", "src/lib/core/settings", "src/lib/core/sellable.ts", "src/lib/platform/sellables.ts", "src/lib/payment", "src/app/api/files", ...trips,
      ...["pos", "account", "rooms", "hotel", "booking", "dorm", "queue", "ticket"].map((m) => `src/lib/modules/${m}`),
      ...["p0.1", "t0.1", "t0.2", "t0.3", "t0.4", "t0.5", "t0.6", "t1.1"].map((w) => `scripts/qc-trips-${w}.mts`), "scripts/trips-fixture.mts", "scripts/fitness.mts"];
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...paths]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n")].filter(Boolean))];
    if (git(["ls-tree", "--name-only", "session/trips", "scripts/qc-trips-t0.7.mts"]).trim() && git(["show", "session/trips:scripts/qc-trips-t0.7.mts"]) !== read("scripts/qc-trips-t0.7.mts")) changed.push("scripts/qc-trips-t0.7.mts");
    // ORACLE-EDIT S-15 (ผู้คุม 13 พ.ย.): รอบแก้ r1 — อนุญาต th-tour-2569.ts (มติ V5 · ฟังก์ชันขั้นต่ำคืนเงิน) · booking-actions.ts (มติ V2 · สิทธิ์ยื่นคืนเงิน) · qc-trips-t0.6.mts (ผู้คุมแก้ CN-3 เอง)
    const ALLOW_R1 = ["src/lib/core/settings/legal/th-tour-2569.ts", "src/lib/modules/trips/booking-actions.ts", "scripts/qc-trips-t0.6.mts"];
    const ours = changed.filter((f) => !ALLOW_R1.includes(f) && (git(["diff", "--name-only", "session/trips", "--", f]).trim() !== "" || git(["ls-files", "--others", "--exclude-standard", "--", f]).trim() !== ""));
    ok(ours.length === 0, `แตะ: ${ours.slice(0, 6).join(", ")}`);
  });
  await st("S-16", "ไม่มีค่าธุรกิจตายตัวในไฟล์ของใบ (อัตรา VAT 700 · 7% · ขั้นบันได 30/15/50 · เพดาน 200000) — อ่านจาก snapshot/ค่าตั้ง", () => {
    const bad: string[] = [];
    ok(OWN_SRC.every((f) => read(f)), "ยังไม่มีไฟล์ของใบ");
    for (const f of OWN_SRC) {
      const s = srcOf(f).replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
      if (/\b(700|0\.07|200_?000)\b/.test(s)) bad.push(`${f}: ค่าคงที่ VAT/เพดาน`);
      if (/daysBefore\s*>=?\s*(30|15)\b|refundBp\s*[:=]\s*5_?000\b/.test(s)) bad.push(`${f}: ขั้นบันไดตายตัว`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  groupLine("S");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB"), tJ = rid("tJ");
  const uA = rid("uA"), uA2 = rid("uA2"), uD = rid("uD"), uB = rid("uB"), uJ = rid("uJ"), uJD = rid("uJD");
  let setupErr = "", settingsErr = "";
  const U: Record<string, Rec> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; pt: Record<string, string>; park: string; cam: string }> = {};
  let seq = 0;
  try {
    for (const t of ["TripProduct", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "TripBooking", "TripBookingItem", "TripPaymentDue", "TripMoneyEvent", "TripRefundRequest"]) await needTable(t);
    for (const [id, tag] of [[tA, "a"], [tB, "b"], [tJ, "j"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T0.7 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag] of [[uA, tA, "a"], [uA2, tA, "a2"], [uD, tA, "d"], [uB, tB, "b"], [uJ, tJ, "j"], [uJD, tJ, "jd"]] as const) await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: "{}", updatedAt: new Date() });
    for (const [tag, tenantId] of [["oa", tA], ["ob", tB], ["oj", tJ]] as const) {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id };
    }
    const mkProd = async (key: string, tenantId: string, unitId: string) => {
      const id = rid(`p${key}`), o = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t07qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
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
    await mkProd("A", tA, uA); await mkProd("C", tA, uA2); await mkProd("D", tA, uD); await mkProd("B", tB, uB); await mkProd("J", tJ, uJ); await mkProd("JD", tJ, uJD);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const setV = async (tenantId: string, changes: Rec[], who: string) => {
    const r = asRec(await S("setSettings")(U[who], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  const VATREG = { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 };
  const unitSet = (unit: string, key: string, value: unknown): Rec => ({ key, scope: "UNIT", scopeId: unit, value });
  try {
    if (!setupErr) {
      await setV(tA, [unitSet(uA, "trips.tax.vatRegistered", VATREG), unitSet(uA2, "trips.tax.vatRegistered", VATREG), unitSet(uD, "trips.tax.vatRegistered", VATREG),
        unitSet(uD, "trips.pay.depositPct", 30), unitSet(uD, "trips.pay.balanceDueDaysBefore", 20),
        unitSet(uA2, "trips.cancel.ladder", [{ fromDaysBefore: 60, refundPct: 100 }, { fromDaysBefore: 0, refundPct: 0 }]),
        unitSet(uA, "payments.receiver", { promptpayId: "0812345678", displayName: "ร้านทดสอบ T0.7" }),
        unitSet(uD, "payments.receiver", { promptpayId: "0812345678", displayName: "ร้านทดสอบ T0.7" })], "oa"); // ORACLE-EDIT QR-2 (ผู้คุม 13 พ.ย.): หน่วย uD ต้องมีผู้รับ (uA2 ไม่มี = QR-4)
      await setV(tB, [unitSet(uB, "trips.tax.vatRegistered", VATREG)], "ob");
      await setV(tJ, [unitSet(uJ, "trips.tax.vatRegistered", VATREG), unitSet(uJD, "trips.tax.vatRegistered", VATREG), unitSet(uJD, "trips.pay.depositPct", 30), unitSet(uJD, "trips.pay.balanceDueDaysBefore", 20),
        unitSet(uJD, "trips.pay.overdueAction", "AUTO_RELEASE"), unitSet(uJD, "trips.pay.reminderDaysBefore", [7, 1])], "oj");
    }
  } catch (e) { settingsErr = e instanceof Error ? e.message : String(e); console.log(`  ⚠️ ตั้งค่าตั้งหน่วยไม่สำเร็จ: ${settingsErr}`); }
  const needDb = async () => { needTrips(); ok(!setupErr && PRD.A, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); ok(!settingsErr, `ตั้งค่าตั้งไม่ได้: ${settingsErr}`); };
  const mkDep = async (date: string, key = "A", capacity = 40): Promise<string> => {
    const p = PRD[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const startsAt = new Date(BKK(date, "08:00").getTime() + (seq++ % 600) * 60_000); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      status: "OPEN", capacity, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  const tenantOfUnit = (u: string) => (u === uB ? tB : u === uJ || u === uJD ? tJ : tA);
  const whoOfUnit = (u: string) => (u === uB ? "ob" : u === uJ || u === uJD ? "oj" : "oa");
  const staff = (o: { unit?: string; now?: string | Date; tenant?: string } = {}): Rec => {
    const unit = o.unit ?? uA;
    return { tenantId: o.tenant ?? tenantOfUnit(unit), unitId: unit, channel: "COUNTER", actor: { kind: "STAFF", userId: String(U[whoOfUnit(unit)]?.userId ?? "x") }, now: new Date(o.now ?? NOW0), locale: "th" };
  };
  const sys = (o: { unit?: string; now?: string | Date; job?: string } = {}): Rec => ({ tenantId: tenantOfUnit(o.unit ?? uA), unitId: o.unit ?? uA, channel: "COUNTER", actor: { kind: "SYSTEM", job: o.job ?? "trips.slip" }, now: new Date(o.now ?? NOW0) });
  const pub = (o: { unit?: string; now?: string | Date } = {}): Rec => ({ tenantId: tenantOfUnit(o.unit ?? uA), unitId: o.unit ?? uA, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `t07qc_c${hex(3)}` }, now: new Date(o.now ?? NOW0), locale: "th" });
  const agent = (): Rec => ({ tenantId: tA, unitId: uA, channel: "AGENT_PORTAL", actor: { kind: "AGENT", agentAccountId: "ag1", agentUserId: "agu1" }, now: new Date(NOW0) });
  const lineOf = (dep: string, key: string, o: { a?: number; c?: number; camera?: boolean; promo?: string } = {}): Rec => {
    const p = PRD[key]!;
    const pax = [["ADULT", o.a ?? 2], ["CHILD", o.c ?? 1]].filter(([, n]) => Number(n) > 0).map(([code, n]) => ({ paxTypeId: p.pt[String(code)], qty: Number(n) }));
    return { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: dep, optionId: p.opt, pax, extras: o.camera === false ? [] : [{ extraId: p.cam, qty: 1 }], ...(o.promo ? { promoCode: o.promo } : {}) };
  };
  let bkN = 0;
  const booker = (): Rec => { bkN++; return { name: `ลูกค้าทดสอบ ${bkN}`, phone: `08${String(10_000_000 + bkN * 7_919 + Number.parseInt(hex(2), 16)).slice(-8)}` }; };
  type Bk = { id: string; code: string; dep: string; unit: string; token: string; payable: number; snap: Rec; status: string };
  /** จองด้วยบริการ T0.6 (STAFF bookTripsNow) — PAY_LATER ⇒ CONFIRMED · PAY_NOW ⇒ HOLD (hold PAYMENT T5 นาที) */
  const mkBooking = async (o: { key?: string; date?: string; dep?: string; pay?: "PAY_LATER" | "PAY_NOW"; a?: number; c?: number; camera?: boolean; promo?: string; now?: string } = {}): Promise<Bk> => {
    const key = o.key ?? "A"; const p = PRD[key]!; const dep = o.dep ?? (await mkDep(o.date ?? TRAVEL, key));
    const ctx = staff({ unit: p.unit, now: o.now ?? NOW0 }); const lines = [lineOf(dep, key, o)];
    const qr = await call("quoteTrips", ctx, { lines }, {}); const quote = V(qr, "quoteTrips (T0.5)");
    const r = await call("bookTripsNow", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `n${hex(6)}`, booker: booker(), pay: { method: o.pay ?? "PAY_LATER" } }, {});
    ok(r.ok === true, `bookTripsNow (T0.6): ${fmt(r)}`); const ref = asArr(r.value)[0] ?? {};
    const row = (await q<Rec>(`SELECT * FROM "TripBooking" WHERE id = $1`, [String(ref.bookingId)]))[0] ?? {};
    const snap = asRec(row.policySnapshot) ?? {};
    return { id: String(ref.bookingId), code: String(ref.code), dep, unit: p.unit, token: String(ref.publicToken ?? ""), payable: num(asRec(snap.totals)?.payableSatang), snap, status: String(row.status) };
  };
  const bk = async (id: string): Promise<Rec> => (await q<Rec>(`SELECT * FROM "TripBooking" WHERE id = $1`, [id]))[0] ?? {};
  const dues = async (bid: string) => q<Rec>(`SELECT * FROM "TripPaymentDue" WHERE "bookingId" = $1 ORDER BY seq`, [bid]);
  const evs = async (bid: string, kind?: string) => q<Rec>(`SELECT * FROM "TripMoneyEvent" WHERE "bookingId" = $1 ${kind ? `AND kind = '${kind}'` : ""} ORDER BY "createdAt", id`, [bid]);
  const reqs = async (bid: string) => q<Rec>(`SELECT * FROM "TripRefundRequest" WHERE "bookingId" = $1 ORDER BY "createdAt", id`, [bid]);
  const depRow = async (id: string): Promise<Rec> => (await q<Rec>(`SELECT capacity, sold, held, reserved FROM "TripDeparture" WHERE id = $1`, [id]))[0] ?? {};
  const outbox = async (type: string, tenantId = tA) => q<{ payload: Rec; idempotencyKey: string }>(`SELECT payload, "idempotencyKey" FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = $2 ORDER BY "createdAt"`, [tenantId, type]).catch(() => []);
  const outboxFor = async (type: string, bookingId: string, tenantId = tA) => (await outbox(type, tenantId)).filter((r) => asRec(r.payload)?.bookingId === bookingId);
  const pay = async (b: Bk, amount: number, o: { tender?: string; key?: string; now?: string | Date; ctx?: Rec; slipId?: string } = {}) =>
    call("recordTripPayment", o.ctx ?? staff({ unit: b.unit, now: o.now ?? addMin(NOW0, 1) }), { bookingId: b.id, amountSatang: amount, tender: o.tender ?? "PROMPTPAY", idempotencyKey: o.key ?? `p${hex(6)}`, ...(o.slipId ? { slipId: o.slipId } : {}) });
  const payOk = async (b: Bk, amount: number, o: { tender?: string; key?: string; now?: string | Date } = {}) => V(await pay(b, amount, o), "recordTripPayment");
  const reqRefund = async (b: Bk, o: { now?: string; reasonKind?: string; key?: string; deductions?: Rec[]; choice?: string; ctx?: Rec } = {}) => {
    const row = await bk(b.id);
    return call("requestTripRefund", o.ctx ?? staff({ unit: b.unit, now: o.now ?? T23 }), { bookingId: b.id, expectedVersion: num(row.version), reasonKind: o.reasonKind ?? "CUSTOMER", choice: o.choice ?? "MONEY", reason: "ลูกค้าขอยกเลิก", ...(o.deductions ? { deductions: o.deductions } : {}), idempotencyKey: o.key ?? `r${hex(6)}` });
  };
  const decide = async (b: Bk, requestId: unknown, o: { decision?: string; delta?: number; manualReason?: string; approvalId?: string; key?: string; now?: string; reason?: string } = {}) =>
    call("decideTripRefund", staff({ unit: b.unit, now: o.now ?? T23 }), { requestId, decision: o.decision ?? "APPROVE", ...(o.reason ? { reason: o.reason } : {}), ...(o.delta !== undefined ? { manualDeltaSatang: o.delta } : {}), ...(o.manualReason ? { manualReason: o.manualReason } : {}), ...(o.approvalId ? { approvalId: o.approvalId } : {}), idempotencyKey: o.key ?? `d${hex(6)}` });
  const execute = async (b: Bk, requestId: unknown, o: { key?: string; now?: string; bankTender?: string } = {}) =>
    call("executeTripRefund", staff({ unit: b.unit, now: o.now ?? T23 }), { requestId, idempotencyKey: o.key ?? `x${hex(6)}`, ...(o.bankTender ? { bankTender: o.bankTender } : {}) });
  /** ค่าคงที่ §16 ข้อ 1–3 */
  const moneyInv = async (bid: string): Promise<string[]> => {
    const b = await bk(bid); const bad: string[] = [];
    const e = await evs(bid); const sum = (k: string, f: string) => e.filter((x) => x.kind === k).reduce((s, x) => s + num(x[f]), 0);
    if (num(b.paidSatang) !== sum("RECEIVED", "amountSatang")) bad.push(`paid ${b.paidSatang} ≠ ΣRECEIVED ${sum("RECEIVED", "amountSatang")}`);
    if (num(b.refundedSatang) !== sum("REFUNDED", "amountSatang")) bad.push(`refunded ≠ ΣREFUNDED`);
    const payable = num(asRec(asRec(b.policySnapshot)?.totals)?.payableSatang);
    if (num(b.paidSatang) > payable) bad.push(`paid > payable`);
    const ds = await dues(bid);
    if (ds.length && ds.reduce((s, d) => s + num(d.paidSatang), 0) !== num(b.paidSatang)) bad.push("Σ due.paid ≠ paid");
    for (const d of ds) if (num(d.paidSatang) > num(d.amountSatang) || num(d.paidSatang) < 0) bad.push(`due ${d.seq} paid เกิน`);
    for (const x of e) {
      if (x.kind === "RECEIVED" && num(x.amountSatang) - num(x.passThroughSatang) < 0) bad.push("pt > amount");
      if (x.postingStatus !== "UNPOSTED") bad.push(`postingStatus ${x.postingStatus}`);
    }
    if (b.status === "CANCELLED" && e.some((x) => x.kind === "REFUNDED" || x.kind === "RETAINED") && sum("REFUNDED", "amountSatang") + sum("RETAINED", "amountSatang") !== num(b.paidSatang)) bad.push("REFUNDED + RETAINED ≠ paid");
    return bad;
  };
  const moneyOk = async (bid: string, what: string) => { const b = await moneyInv(bid); ok(b.length === 0, `${what} ค่าคงที่เงิน: ${b.slice(0, 4).join(" · ")}`); };
  const seatInv = async (d: string, what: string) => {
    const c = await depRow(d);
    const s = (await q<{ n: number }>(`SELECT COALESCE(sum(i.qty),0)::int AS n FROM "TripBookingItem" i JOIN "TripBooking" b ON b.id = i."bookingId" LEFT JOIN "TripPaxType" p ON p.id = i."paxTypeId"
      WHERE i."departureId" = $1 AND i.active AND i.kind IN ('SEAT','BERTH') AND COALESCE(p."countsCapacity", true) AND b.status = ANY($2::text[])`, [d, SOLD_ST]))[0]?.n ?? -1;
    const h = (await q<{ n: number }>(`SELECT COALESCE(sum("qtyPublic" + "qtyAllot"),0)::int AS n FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [d]))[0]?.n ?? -1;
    ok(num(c.sold) === s && num(c.held) === h, `${what} ค่าคงที่ D.3: sold ${c.sold}/${s} held ${c.held}/${h}`);
  };
  const vatCtxOf = (snap: Rec): Rec => {
    const lines = asArr(snap.lines); const tax = asRec(snap.tax) ?? {};
    const nonPt = lines.filter((l) => !l.passThrough);
    return { vatRegistered: tax.vatRegistered === true, vatRateBp: num(tax.vatRateBp), vat7Satang: nonPt.filter((l) => l.taxKind === "VAT7").reduce((s, l) => s + num(l.amountSatang), 0), nonPtSatang: nonPt.reduce((s, l) => s + num(l.amountSatang), 0) };
  };

  // ═══════════════ MC. สูตรบริสุทธิ์ ═══════════════
  console.log("\n── MC: money-core (บริสุทธิ์) ──");
  let SNAP: Rec = {};
  try { if (!setupErr && !settingsErr && TR) SNAP = (await mkBooking({ pay: "PAY_LATER" })).snap; } catch (e) { console.log(`  ⚠️ จองตัวอย่างไม่สำเร็จ: ${errMsg(e)}`); }
  const needSnap = () => ok(asRec(SNAP.totals), "ไม่มี snapshot ตัวอย่าง (T0.6 จองไม่ได้)");
  await st("MC-1", "ค่าคงที่: TRIP_TENDERS = CASH PROMPTPAY TRANSFER CARD · tenderGroupOf (CASH · BANK · BANK · CARD) · สถานะคำขอคืนเงิน 8 ค่า · สถานะเปิด 5 ค่า · TRIP_REFUND_ENTITY = trips.refund", () => {
    const t = needTrips();
    eq([t.TRIP_TENDERS, ["CASH", "PROMPTPAY", "TRANSFER", "CARD"].map((x) => fn("tenderGroupOf")(x)), t.TRIP_REFUND_STATUSES, [...(t.TRIP_REFUND_OPEN_STATUSES as string[] ?? [])].sort(), t.TRIP_REFUND_ENTITY],
      [["CASH", "PROMPTPAY", "TRANSFER", "CARD"], ["CASH", "BANK", "BANK", "CARD"], REFUND_ST, ["APPROVED", "EXECUTING", "FAILED", "QUOTED", "REQUESTED"], "trips.refund"], "ค่า");
  });
  await st("MC-2", "canTransitionRefund = ตาราง CC :709 ตรงตัว (8 แถว) · คู่อื่นทุกคู่ = false · สถานะเดิม→เดิม = false", () => {
    const f = fn("canTransitionRefund"); const wrong: string[] = [];
    for (const a of REFUND_ST) for (const b of REFUND_ST) { const exp = REFUND_TRANS.some(([x, y]) => x === a && y === b); if (Boolean(f(a, b)) !== exp) wrong.push(`${a}>${b}`); }
    ok(wrong.length === 0, `ผิด: ${wrong.slice(0, 8).join(" ")}`);
  });
  await st("MC-3", "dueDraftsFromSnapshot: DS ค่าเริ่ม (T13 = 100) ⇒ 1 งวด BALANCE 1,145,000 / vatable 995,000 / pt 150,000 · snapshot ยอดไม่ลงตัว ⇒ SNAPSHOT_INVALID", () => {
    needSnap();
    const r = pure("dueDraftsFromSnapshot", SNAP);
    eq(asArr(r.value).map((d) => [d.seq, d.kind, d.amountSatang, d.vatableSatang, d.passThroughSatang]), [[1, "BALANCE", TOTAL, VATABLE, PARK]], "งวด");
    const broken = JSON.parse(JSON.stringify(SNAP)) as Rec; const ps = asArr(broken.paymentSchedule); if (ps[0]) ps[0].amountSatang = TOTAL - 1; broken.paymentSchedule = ps;
    eq([pure("dueDraftsFromSnapshot", broken).ok, pure("dueDraftsFromSnapshot", broken).reason], [false, "SNAPSHOT_INVALID"], "ยอดไม่ลงตัว");
  });
  await st("MC-4", "receiptVatSatang ต่อเอกสาร: 995,000 ⇒ 65,093 (13ค) · 298,500 ⇒ 19,528 · 696,500 ⇒ 45,565 · 990,655 ⇒ 64,810 · 4,345 ⇒ 284 · ไม่จด VAT ⇒ 0", () => {
    const c = { vatRegistered: true, vatRateBp: 700, vat7Satang: VATABLE, nonPtSatang: VATABLE };
    const f = fn("receiptVatSatang");
    eq([VATABLE, DEP30, 696_500, 990_655, 4_345].map((x) => f(x, c)), [VAT_DOC, 19_528, 45_565, 64_809, 284], "VAT"); // ORACLE-EDIT MC-4 (ผู้คุม 13 พ.ย.): 990,655 × 7/107 = 64,809.21 ⇒ 64,809 (เดิม 64,810 คิดผิด · Σ = 65,093 ตรงเอกสาร)
    eq(f(VATABLE, { ...c, vatRegistered: false }), 0, "ไม่จด");
  });
  await st("MC-5", "receiptVatSatang: บรรทัดไม่ใช่เก็บแทนที่ยกเว้น VAT ไม่มี VAT — VAT7 ครึ่งหนึ่งของ 200,000 ⇒ VAT ของ 100,000 = 6,542 (7/107 × 1,000 บาท)", () => {
    eq(fn("receiptVatSatang")(200_000, { vatRegistered: true, vatRateBp: 700, vat7Satang: 500_000, nonPtSatang: 1_000_000 }), vatIn(100_000), "VAT");
  });
  const due1 = (o: Rec = {}): Rec => ({ id: "d1", seq: 1, status: "OPEN", amountSatang: TOTAL, vatableSatang: VATABLE, passThroughSatang: PARK, paidSatang: 0, paidPassThroughSatang: 0, ...o });
  await st("MC-6", "allocatePayment งวดเดียว (ภาพ 07ค): รับ 1,140,000 ⇒ pt 149,345 · vatable 990,655 · ไม่ครบ · รับอีก 5,000 ⇒ pt 655 · ครบงวด (สูตรสะสมเดียวกับ snapshot.ts :314)", () => {
    const f = fn("allocatePayment");
    const a = asArr(asRec(f([due1()], SHORT))?.slices).map((s) => [s.dueId, s.amountSatang, s.passThroughSatang, s.vatableSatang, s.completesDue]);
    const pt1 = halfUp(PARK, SHORT, TOTAL);
    eq(a, [["d1", SHORT, pt1, SHORT - pt1, false]], "ชิ้นแรก");
    const b = asArr(asRec(f([due1({ status: "PARTLY_PAID", paidSatang: SHORT, paidPassThroughSatang: pt1 })], TOTAL - SHORT))?.slices).map((s) => [s.amountSatang, s.passThroughSatang, s.vatableSatang, s.completesDue]);
    eq(b, [[TOTAL - SHORT, PARK - pt1, TOTAL - SHORT - (PARK - pt1), true]], "ชิ้นที่สอง");
    eq([pt1, PARK - pt1], [149_345, 655], "ตัวเลขภาพ 07ค");
  });
  await st("MC-7", "allocatePayment มัดจำ + ส่วนที่เหลือ: จ่าย 400,000 ⇒ มัดจำ 298,500 (pt 0 · ครบ) + งวด 2 101,500 (pt = round(150,000×101,500/846,500)) · จ่ายเต็ม 1,145,000 ⇒ 2 ชิ้นครบทั้งคู่ · งวด CANCELLED ข้าม", () => {
    const f = fn("allocatePayment");
    const ds = [due1({ id: "a", seq: 1, amountSatang: DEP30, vatableSatang: DEP30, passThroughSatang: 0 }), due1({ id: "b", seq: 2, amountSatang: BAL30, vatableSatang: BAL30 - PARK, passThroughSatang: PARK })];
    const pt2 = halfUp(PARK, 400_000 - DEP30, BAL30);
    eq(asArr(asRec(f(ds, 400_000))?.slices).map((s) => [s.dueId, s.amountSatang, s.passThroughSatang, s.completesDue]), [["a", DEP30, 0, true], ["b", 400_000 - DEP30, pt2, false]], "บางส่วน");
    eq(asArr(asRec(f(ds, TOTAL))?.slices).map((s) => [s.dueId, s.amountSatang, s.passThroughSatang, s.completesDue]), [["a", DEP30, 0, true], ["b", BAL30, PARK, true]], "เต็ม");
    eq(asArr(asRec(f([due1({ id: "x", status: "CANCELLED" }), ...ds], DEP30))?.slices).map((s) => s.dueId), ["a"], "ข้าม CANCELLED");
  });
  await st("MC-8", "allocatePayment ปฏิเสธ: เกินยอดค้าง ⇒ OVERPAYMENT · ไม่มีงวดค้าง ⇒ NOTHING_DUE · 0 / 1.5 / −1 / int4+1 ⇒ INVALID_AMOUNT · อินพุตแช่แข็งไม่ถูกแก้", () => {
    const f = fn("allocatePayment"); const rs = (d: Rec[], a: number) => String(asRec(f(d, a))?.reason);
    const frozen = Object.freeze([Object.freeze(due1())]);
    eq([rs([...frozen], TOTAL + 1), rs([due1({ status: "PAID", paidSatang: TOTAL, paidPassThroughSatang: PARK })], 1), rs([due1()], 0), rs([due1()], 1.5), rs([due1()], -1), rs([due1()], INT4 + 1)],
      ["OVERPAYMENT", "NOTHING_DUE", "INVALID_AMOUNT", "INVALID_AMOUNT", "INVALID_AMOUNT", "INVALID_AMOUNT"], "เหตุ");
    eq(frozen[0]?.paidSatang, 0, "แก้อินพุต");
  });
  await st("MC-9", "bookingStatusAfterPayment: 0 ⇒ null · 1/2 ⇒ PART_PAID · 2/2 ⇒ PAID", () => {
    const f = fn("bookingStatusAfterPayment"); eq([f(0, 2), f(1, 2), f(2, 2)], [null, "PART_PAID", "PAID"], "สถานะ");
  });
  const quoteAt = (at: string, o: Rec = {}): Rec => asRec(pure("refundQuoteFromSnapshot", SNAP, { at, reasonKind: "CUSTOMER", paidSatang: TOTAL, deductionsSatang: 0, passThroughPaidOut: false, ...o }).value) ?? {};
  await st("MC-10", "refundQuoteFromSnapshot ภาพ 15: 23 วันก่อนเดินทาง ขั้น 50 % ⇒ คืน 647,500 · เก็บ 497,500 · non-pt 497,500 · pt 150,000 · VAT คืน 32,547 / เก็บ 32,546", () => {
    needSnap(); const v = quoteAt(T23);
    eq([v.daysBefore, v.refundBp, v.refundSatang, v.keptSatang, v.refundNonPtSatang, v.refundPassThroughSatang, v.refundVatSatang, v.keptVatSatang],
      [23, 5_000, RF88.refundSatang, RF88.keptSatang, RF88.refundSatang - PARK, PARK, 32_547, 32_546], "ผล");
  });
  await st("MC-11", "ขอบขั้นบันไดตามเวลาร้าน (Asia/Bangkok): D−30 23:59 ⇒ 100 % · D−29 00:00 (= 17:00Z วันก่อน) ⇒ 50 % · D−15 23:59 ⇒ 50 % · D−14 00:00 ⇒ 0 % · D+1 ⇒ 0 %", () => {
    needSnap();
    const at = [BKK("2027-03-11", "23:59"), new Date("2027-03-11T17:00:00.000Z"), BKK("2027-03-26", "23:59"), BKK("2027-03-27", "00:00"), BKK("2027-04-11", "09:00")].map((d) => d.toISOString());
    eq(at.map((a) => { const v = quoteAt(a); return [v.daysBefore, v.refundBp]; }), [[30, 10_000], [29, 5_000], [15, 5_000], [14, 0], [-1, 0]], "ขั้น");
  });
  await st("MC-12", "เหตุร้านยกเลิก (EXTERNAL · MIN_NOT_MET · SHOP_FAULT) ⇒ คืน 100 % แม้เหลือ 3 วัน (T21 ค่าเริ่ม · ม.28 วรรคสอง)", () => {
    needSnap(); const at = BKK("2027-04-07", "10:00").toISOString();
    eq(["EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"].map((k) => quoteAt(at, { reasonKind: k }).refundSatang), [TOTAL, TOTAL, TOTAL], "คืนเต็ม");
  });
  await st("MC-13", "หักค่าใช้จ่ายจริงจากส่วนไม่ใช่เก็บแทนเท่านั้น: 100 % หัก 600,000 ⇒ คืน 545,000 · หัก 2,000,000 ⇒ คืน 150,000 (อุทยานเต็ม · ไม่ติดลบ)", () => {
    needSnap();
    eq([quoteAt(T40, { deductionsSatang: 600_000 }).refundSatang, quoteAt(T40, { deductionsSatang: 2_000_000 }).refundSatang], [VATABLE - 600_000 + PARK, PARK], "หัก");
  });
  await st("MC-14", "เงินเก็บแทนจ่ายออกแล้ว ⇒ pt คืน 0 · ภาพ 15 คืน 497,500 · ร้านเก็บ 647,500 · warnings มี PASS_THROUGH_PAID_OUT", () => {
    needSnap(); const v = quoteAt(T23, { passThroughPaidOut: true });
    eq([v.refundSatang, v.keptSatang, v.refundPassThroughSatang, (v.warnings as string[] | undefined)?.includes("PASS_THROUGH_PAID_OUT")], [RF88.refundSatang - PARK, RF88.keptSatang + PARK, 0, true], "ผล");
  });
  await st("MC-15", "planRefundSlices ใบรับเดียว (CC :783): REFUNDED 647,500 / vatable 497,500 / pt 150,000 / VAT 32,547 ‖ RETAINED 497,500 / VAT 32,546 / pt 0 · ขอเกิน ⇒ OVER_REFUND", () => {
    needSnap();
    const rc = { eventId: "e1", dueId: "d1", tender: "PROMPTPAY", amountSatang: TOTAL, vatableSatang: VATABLE, passThroughSatang: PARK, vatSatang: VAT_DOC };
    const r = pure("planRefundSlices", { receipts: [rc], refundNonPtSatang: RF88.refundSatang - PARK, refundPassThroughSatang: PARK, vatCtx: vatCtxOf(SNAP) });
    const pick = (x: Rec) => [x.eventId, x.tender, x.amountSatang, x.vatableSatang, x.passThroughSatang, x.vatSatang];
    eq([asArr(r.refunded).map(pick), asArr(r.retained).map(pick)], [[["e1", "PROMPTPAY", 647_500, 497_500, PARK, 32_547]], [["e1", "PROMPTPAY", 497_500, 497_500, 0, 32_546]]], "แถว");
    eq(pure("planRefundSlices", { receipts: [rc], refundNonPtSatang: VATABLE + 1, refundPassThroughSatang: PARK, vatCtx: vatCtxOf(SNAP) }).reason, "OVER_REFUND", "ขอเกิน");
  });
  await st("MC-16", "planRefundSlices สองใบรับ (07ค: 1,140,000 + 5,000) คืนภาพ 15: ปันตามใบ (pt ตาม pt · non-pt ตาม vatable) · ต่อใบ คืน ≤ รับทุกช่อง · Σ = ยอดคืนพอดี · tender ตามใบ", () => {
    needSnap(); const pt1 = halfUp(PARK, SHORT, TOTAL);
    const r1 = { eventId: "e1", dueId: "d1", tender: "PROMPTPAY", amountSatang: SHORT, vatableSatang: SHORT - pt1, passThroughSatang: pt1, vatSatang: vatIn(SHORT - pt1) };
    const r2 = { eventId: "e2", dueId: "d1", tender: "CASH", amountSatang: TOTAL - SHORT, vatableSatang: TOTAL - SHORT - (PARK - pt1), passThroughSatang: PARK - pt1, vatSatang: vatIn(TOTAL - SHORT - (PARK - pt1)) };
    const nonPt = RF88.refundSatang - PARK;
    const r = pure("planRefundSlices", { receipts: [r1, r2], refundNonPtSatang: nonPt, refundPassThroughSatang: PARK, vatCtx: vatCtxOf(SNAP) });
    const npA = allocLast(nonPt, [r1.vatableSatang, r2.vatableSatang]);
    const exp = [[r1, npA[0] ?? 0, pt1], [r2, npA[1] ?? 0, PARK - pt1]].map(([rc, np, pt]) => { const x = rc as typeof r1; return [x.eventId, x.tender, (np as number) + (pt as number), np, pt, Math.min(x.vatSatang, vatIn(np as number))]; });
    eq(asArr(r.refunded).map((x) => [x.eventId, x.tender, x.amountSatang, x.vatableSatang, x.passThroughSatang, x.vatSatang]), exp, "REFUNDED");
    const ret = asArr(r.retained);
    eq(ret.reduce((s: number, x) => s + num(x.amountSatang), 0), TOTAL - RF88.refundSatang, "Σ RETAINED");
  });
  await st("MC-17", "tripRefundEntityId = 'trf1_' + sha256(JSON [\"trips.refund.v1\", unitId, requestId, amount]) · moneyDocumentOf (13ค): 995,000 · 929,907 · 65,093 · 150,000 · 1,145,000", () => {
    needSnap();
    eq(fn("tripRefundEntityId")({ unitId: "u1", requestId: "r1", amountSatang: 647_500 }), `trf1_${sha256hex(JSON.stringify(["trips.refund.v1", "u1", "r1", 647_500]))}`, "entityId");
    const d = asRec(fn("moneyDocumentOf")(SNAP)) ?? {};
    eq([d.serviceInclVatSatang, d.preVatSatang, d.vatSatang, d.passThroughSatang, d.totalSatang], [VATABLE, RC.preVatSatang, VAT_DOC, PARK, TOTAL], "เอกสาร");
  });
  groupLine("MC");

  // ═══════════════ DU. งวดจ่าย ═══════════════
  console.log("\n── DU: งวดจ่าย ──");
  await st("DU-1", "ยืนยันแบบ PAY_LATER (CONFIRMED) ⇒ งวดเกิดในธุรกรรมยืนยัน: 1 แถว seq 1 BALANCE 1,145,000 / 995,000 / 150,000 · OPEN · paid 0 · ไม่มีแถวเงิน", async () => {
    await needDb(); const b = await mkBooking();
    eq((await dues(b.id)).map((d) => [d.seq, d.kind, d.amountSatang, d.vatableSatang, d.passThroughSatang, d.paidSatang, d.status]), [[1, "BALANCE", TOTAL, VATABLE, PARK, 0, "OPEN"]], "งวด");
    eq((await evs(b.id)).length, 0, "แถวเงิน");
  });
  await st("DU-2", "ยืนยันแบบ PAY_NOW (HOLD) ⇒ งวดเกิดเหมือนกัน (สถานะ HOLD · ที่นั่งยัง held)", async () => {
    await needDb(); const b = await mkBooking({ pay: "PAY_NOW" }); eq(b.status, "HOLD", "สถานะ T0.6");
    eq((await dues(b.id)).map((d) => [d.seq, d.amountSatang, d.status]), [[1, TOTAL, "OPEN"]], "งวด");
  });
  await st("DU-3", "หน่วยมัดจำ 30 % + ส่วนที่เหลือ 20 วันก่อนเดินทาง ⇒ DEPOSIT 298,500 (pt 0) + BALANCE 846,500 (vatable 696,500 · pt 150,000 · dueAt 21 มี.ค. 23:59 น. เวลาร้าน)", async () => {
    await needDb(); const b = await mkBooking({ key: "D" });
    eq((await dues(b.id)).map((d) => [d.seq, d.kind, d.amountSatang, d.vatableSatang, d.passThroughSatang, new Date(String(d.dueAt)).toISOString()]),
      [[1, "DEPOSIT", DEP30, DEP30, 0, new Date(String(asArr(b.snap.paymentSchedule)[0]?.dueAt)).toISOString()], [2, "BALANCE", BAL30, BAL30 - PARK, PARK, BKK("2027-03-21", "23:59").toISOString()]], "งวด");
  });
  await st("DU-4", "การจองก่อน T0.7 (ไม่มีแถวงวด): listTripDues คืนงวดร่าง (id null) ไม่เขียน · ensureTripDuesInTx สร้างครั้งเดียว (เรียกซ้ำ = ไม่เพิ่ม)", async () => {
    await needDb(); const b = await mkBooking();
    await pool.query(`DELETE FROM "TripPaymentDue" WHERE "bookingId" = $1`, [b.id]); // จำลองการจองที่เกิดก่อน T0.7 (แถวของร้านชั่วคราว)
    const l = V(await call("listTripDues", staff(), { bookingId: b.id }), "listTripDues");
    eq([asArr(l.items).map((d) => [d.id ?? null, d.amountSatang]), (await dues(b.id)).length], [[[null, TOTAL]], 0], "ร่าง");
    for (let i = 0; i < 2; i++) { const r = await inTx(tA, uA, async (tx) => ({ ok: true, value: await fn("ensureTripDuesInTx")(tx, staff(), { bookingId: b.id }) })); ok(r.ok === true, `ensure: ${fmt(r)}`); }
    eq((await dues(b.id)).map((d) => [d.seq, d.amountSatang]), [[1, TOTAL]], "สร้างครั้งเดียว");
  });
  await st("DU-5", "listTripDues DTO: outstandingSatang · paidPassThroughSatang ครบ · ไม่มีข้อมูลผู้จอง · PUBLIC ⇒ FORBIDDEN", async () => {
    await needDb(); const b = await mkBooking(); await payOk(b, SHORT);
    const it = asArr(V(await call("listTripDues", staff(), { bookingId: b.id }), "list").items)[0] ?? {};
    eq([it.paidSatang, it.outstandingSatang, it.paidPassThroughSatang, it.status], [SHORT, TOTAL - SHORT, halfUp(PARK, SHORT, TOTAL), "PARTLY_PAID"], "DTO");
    ok(!/ลูกค้าทดสอบ|"phone"|"name"/.test(JSON.stringify(it)), "มีข้อมูลบุคคล");
    codeR(await call("listTripDues", pub(), { bookingId: b.id }), "FORBIDDEN", "PUBLIC");
  });
  groupLine("DU");

  // ═══════════════ PY. รับเงิน ═══════════════
  console.log("\n── PY: รับเงิน ──");
  await st("PY-1", "HOLD + รับเต็ม 1,145,000 (PROMPTPAY) ⇒ PAID · hold CONVERTED · ที่นั่ง held→sold · แถว RECEIVED 1 แถว (amount 1,145,000 · VAT 65,093 · pt 150,000 · dueId · UNPOSTED · attempts 0)", async () => {
    await needDb(); const b = await mkBooking({ pay: "PAY_NOW" }); const d0 = await depRow(b.dep);
    const v = await payOk(b, TOTAL);
    const row = await bk(b.id); const h = (await q<Rec>(`SELECT status FROM "TripHold" WHERE "bookingId" = $1`, [b.id])).map((x) => x.status);
    eq([v.status, row.status, row.paidSatang, h, num((await depRow(b.dep)).sold) - num(d0.sold), num(d0.held) - num((await depRow(b.dep)).held)], ["PAID", "PAID", TOTAL, ["CONVERTED"], 3, 3], "การจอง/ที่นั่ง");
    const e = await evs(b.id); const du = (await dues(b.id))[0] ?? {};
    eq(e.map((x) => [x.kind, x.amountSatang, x.vatSatang, x.passThroughSatang, x.tender, x.dueId, x.postingStatus, x.postingAttempts, x.nextAttemptAt]), [["RECEIVED", TOTAL, VAT_DOC, PARK, "PROMPTPAY", du.id, "UNPOSTED", 0, null]], "แถวเงิน");
    eq([du.paidSatang, du.status], [TOTAL, "PAID"], "งวด"); await moneyOk(b.id, "PY-1"); await seatInv(b.dep, "PY-1");
  });
  await st("PY-2", "CONFIRMED (PAY_LATER) รับ 1,140,000 ⇒ PART_PAID (pt 149,345 · VAT 64,810) · รับ 5,000 ⇒ PAID (pt 655 · VAT 284) · version เพิ่มทุกครั้ง", async () => {
    await needDb(); const b = await mkBooking(); const v0 = num((await bk(b.id)).version);
    const a = await payOk(b, SHORT, { tender: "TRANSFER" }); const a2 = await payOk(b, TOTAL - SHORT, { tender: "CASH" });
    eq([a.status, a2.status, a.outstandingSatang, a2.outstandingSatang, num((await bk(b.id)).version) - v0], ["PART_PAID", "PAID", TOTAL - SHORT, 0, 2], "สถานะ");
    eq((await evs(b.id)).map((x) => [x.amountSatang, x.passThroughSatang, x.vatSatang, x.tender]), [[SHORT, 149_345, 64_809, "TRANSFER"], [TOTAL - SHORT, 655, 284, "CASH"]], "ใบรับ"); // ORACLE-EDIT PY-2 (ผู้คุม 13 พ.ย.)
    await moneyOk(b.id, "PY-2");
  });
  await st("PY-3", "HOLD + รับบางส่วน 1,140,000 ⇒ PART_PAID และที่นั่งแปลงเป็นขาย (hold CONVERTED) — ใบสั่ง §17 ข้อ 2", async () => {
    await needDb(); const b = await mkBooking({ pay: "PAY_NOW" }); await payOk(b, SHORT);
    eq([(await bk(b.id)).status, (await q<Rec>(`SELECT status FROM "TripHold" WHERE "bookingId" = $1`, [b.id])).map((x) => x.status)], ["PART_PAID", ["CONVERTED"]], "ผล");
    await seatInv(b.dep, "PY-3");
  });
  await st("PY-4", "มัดจำ+ส่วนที่เหลือ: จ่าย 298,500 ⇒ PART_PAID (VAT 19,528) · จ่าย 846,500 ⇒ PAID (VAT 45,565 · pt 150,000) · จ่ายครั้งเดียว 400,000 ข้ามงวด ⇒ 2 แถว (ต่องวด)", async () => {
    await needDb(); const b = await mkBooking({ key: "D" });
    await payOk(b, DEP30); await payOk(b, BAL30);
    eq([(await bk(b.id)).status, (await evs(b.id)).map((x) => [x.amountSatang, x.vatSatang, x.passThroughSatang])], ["PAID", [[DEP30, 19_528, 0], [BAL30, 45_565, PARK]]], "สองงวด");
    const b2 = await mkBooking({ key: "D" }); const v = await payOk(b2, 400_000);
    const ds = await dues(b2.id);
    eq([asArr(v.events).length, (await evs(b2.id)).map((x) => [x.dueId, x.amountSatang]), ds.map((d) => d.status)], [2, [[ds[0]?.id, DEP30], [ds[1]?.id, 400_000 - DEP30]], ["PAID", "PARTLY_PAID"]], "ข้ามงวด");
    await moneyOk(b.id, "PY-4a"); await moneyOk(b2.id, "PY-4b");
  });
  await st("PY-5", "จ่ายเกินยอดค้าง ⇒ VALIDATION OVERPAYMENT · ไม่เขียนอะไร (การจองเดิม · งวดเดิม · ไม่มีแถวเงิน)", async () => {
    await needDb(); const b = await mkBooking(); const before = await bk(b.id);
    codeR(await pay(b, TOTAL + 1), "VALIDATION", "จ่ายเกิน", "OVERPAYMENT");
    eq([(await bk(b.id)).version, (await evs(b.id)).length, (await dues(b.id))[0]?.paidSatang], [before.version, 0, 0], "ไม่เขียน");
  });
  await st("PY-6", "ยอดผิดรูป ⇒ VALIDATION: 0 · −100 · 10.5 · '100' · int4+1 · ไม่มี tender / tender AGENCY / ช่องเกิน (receivedAt · whtByCustomerSatang)", async () => {
    await needDb(); const b = await mkBooking();
    const base = { bookingId: b.id, amountSatang: 100, tender: "CASH", idempotencyKey: `p${hex(6)}` };
    const bad: Rec[] = [{ amountSatang: 0 }, { amountSatang: -100 }, { amountSatang: 10.5 }, { amountSatang: "100" }, { amountSatang: INT4 + 1 }, { tender: undefined }, { tender: "AGENCY" }, { receivedAt: NOW0 }, { whtByCustomerSatang: 300 }];
    for (const o of bad) codeR(await call("recordTripPayment", staff(), { ...base, ...o, idempotencyKey: `p${hex(6)}` }), "VALIDATION", `อินพุต ${fmt(o)}`);
    eq((await evs(b.id)).length, 0, "ไม่เขียน");
  });
  await st("PY-7", "สถานะที่รับเงินไม่ได้: PENDING ⇒ STATE_CONFLICT PENDING_APPROVAL · PAID ⇒ NOTHING_DUE · CANCELLED ⇒ NOT_PAYABLE · EXPIRED ⇒ BOOKING_EXPIRED", async () => {
    await needDb();
    const mk = async (status: string) => { const b = await mkBooking(); await pool.query(`UPDATE "TripBooking" SET status = $2 WHERE id = $1`, [b.id, status]); return b; }; // จำลองสถานะ (ร้านชั่วคราว)
    const paid = await mkBooking(); await payOk(paid, TOTAL);
    codeR(await pay(await mk("PENDING"), 100), "STATE_CONFLICT", "PENDING", "PENDING_APPROVAL");
    codeR(await pay(paid, 100), "STATE_CONFLICT", "PAID", "NOTHING_DUE");
    codeR(await pay(await mk("CANCELLED"), 100), "STATE_CONFLICT", "CANCELLED", "NOT_PAYABLE");
    codeR(await pay(await mk("EXPIRED"), 100), "STATE_CONFLICT", "EXPIRED", "BOOKING_EXPIRED");
  });
  await st("PY-8", "HOLD ที่ hold หมดเวลาแล้ว (รับเงิน 20 นาทีหลังจอง · T5 15 นาที) ⇒ HOLD_EXPIRED · ไม่บันทึกเงิน · ที่นั่งไม่ขยับ · งวดไม่ขยับ", async () => {
    await needDb(); const b = await mkBooking({ pay: "PAY_NOW" }); const d0 = await depRow(b.dep);
    codeR(await pay(b, TOTAL, { now: addMin(NOW0, 20) }), "HOLD_EXPIRED", "หมดเวลา");
    eq([(await bk(b.id)).status, (await evs(b.id)).length, (await dues(b.id))[0]?.paidSatang, await depRow(b.dep)], ["HOLD", 0, 0, d0], "ไม่เขียน");
  });
  await st("PY-9", "กันซ้ำ: คีย์เดิม + คำขอเดิม ⇒ ok replayed: true ไม่มีแถวที่สอง · คีย์เดิม + ยอด/tender ต่าง ⇒ IDEMPOTENCY_CONFLICT", async () => {
    await needDb(); const b = await mkBooking(); const key = `k${hex(6)}`;
    const a = await payOk(b, 100_000, { key }); const r = await payOk(b, 100_000, { key });
    eq([a.replayed, r.replayed, (await evs(b.id)).length, (await bk(b.id)).paidSatang], [false, true, 1, 100_000], "ซ้ำ");
    codeR(await pay(b, 200_000, { key }), "IDEMPOTENCY_CONFLICT", "ยอดต่าง");
    codeR(await pay(b, 100_000, { key, tender: "CASH" }), "IDEMPOTENCY_CONFLICT", "tender ต่าง");
  });
  // สลิป (อ่านอย่างเดียว · แถวจำลองของร้านชั่วคราว)
  const mkSlip = async (b: Bk, o: Rec = {}) => {
    const du = (await dues(b.id))[0] ?? {};
    return insertRow("PaymentSlip", { id: rid("slip"), tenantId: tenantOfUnit(b.unit), unitId: b.unit, domain: "TRIPS", refType: "TRIP_DUE", refId: String(du.id), fileId: rid("f"), imageHash: hex(16), expectedSatang: TOTAL, amountSatang: TOTAL, checks: "{}", status: "APPROVED", ...o });
  };
  await st("PY-10", "SYSTEM + สลิป APPROVED (domain TRIPS · refType TRIP_DUE · refId = งวด · ยอดตรง) ⇒ PAID · แถวเงินจด slipId · SYSTEM ไม่มีสลิป ⇒ FORBIDDEN SLIP_REQUIRED", async () => {
    await needDb(); const b = await mkBooking(); const s = await mkSlip(b);
    codeR(await pay(b, TOTAL, { ctx: sys() }), "FORBIDDEN", "ไม่มีสลิป", "SLIP_REQUIRED");
    V(await pay(b, TOTAL, { ctx: sys(), slipId: s, tender: "TRANSFER" }), "สลิป");
    eq([(await bk(b.id)).status, (await evs(b.id)).map((x) => x.slipId)], ["PAID", [s]], "ผล");
  });
  await st("PY-11", "สลิปผิด: ยังไม่อนุมัติ ⇒ SLIP_NOT_APPROVED · ยอดไม่ตรง/งวดของการจองอื่น ⇒ VALIDATION SLIP_MISMATCH · tender CASH ⇒ TENDER_NOT_ALLOWED · สลิปร้านอื่น ⇒ NOT_FOUND", async () => {
    await needDb(); const b = await mkBooking(); const other = await mkBooking(); const bB = await mkBooking({ key: "B" });
    codeR(await pay(b, TOTAL, { slipId: await mkSlip(b, { status: "NEEDS_REVIEW" }), tender: "TRANSFER" }), "STATE_CONFLICT", "ยังไม่อนุมัติ", "SLIP_NOT_APPROVED");
    codeR(await pay(b, TOTAL, { slipId: await mkSlip(b, { amountSatang: SHORT }), tender: "TRANSFER" }), "VALIDATION", "ยอดไม่ตรง", "SLIP_MISMATCH");
    codeR(await pay(b, TOTAL, { slipId: await mkSlip(other), tender: "TRANSFER" }), "VALIDATION", "งวดอื่น", "SLIP_MISMATCH");
    codeR(await pay(b, TOTAL, { slipId: await mkSlip(b), tender: "CASH" }), "VALIDATION", "tender", "TENDER_NOT_ALLOWED");
    codeR(await pay(b, TOTAL, { slipId: await mkSlip(bB), tender: "TRANSFER" }), "NOT_FOUND", "ร้านอื่น");
    eq((await evs(b.id)).length, 0, "ไม่เขียน");
  });
  await st("PY-12", "สลิปเดียวใช้ครั้งเดียว: ซ้ำด้วยคำขอเดิม (คีย์ต่าง) ⇒ ผลเดิม replayed · ใช้กับการจองอื่น/ยอดอื่น ⇒ IDEMPOTENCY_CONFLICT SLIP_ALREADY_USED", async () => {
    await needDb(); const b = await mkBooking(); const s = await mkSlip(b, { amountSatang: SHORT });
    V(await pay(b, SHORT, { slipId: s, tender: "TRANSFER" }), "ครั้งแรก");
    eq(V(await pay(b, SHORT, { slipId: s, tender: "TRANSFER" }), "ซ้ำ").replayed, true, "replayed");
    codeR(await pay(b, 5_000, { slipId: s, tender: "TRANSFER" }), "IDEMPOTENCY_CONFLICT", "ใช้ซ้ำยอดอื่น", "SLIP_ALREADY_USED");
    eq((await evs(b.id)).length, 1, "แถวเดียว");
  });
  await st("PY-13", "มีคำขอคืนเงินเปิด ⇒ รับเงินไม่ได้ (STATE_CONFLICT REFUND_IN_PROGRESS) · หลังถอนคำขอ ⇒ รับได้", async () => {
    await needDb(); const b = await mkBooking(); await payOk(b, SHORT);
    const r = V(await reqRefund(b), "ยื่นคำขอ");
    codeR(await pay(b, TOTAL - SHORT), "STATE_CONFLICT", "รับเงินระหว่างคำขอ", "REFUND_IN_PROGRESS");
    V(await call("withdrawTripRefund", staff({ now: T23 }), { requestId: r.requestId, reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: `w${hex(6)}` }), "ถอน");
    eq(V(await pay(b, TOTAL - SHORT), "หลังถอน").status, "PAID", "สถานะ");
  });
  groupLine("PY");

  // ═══════════════ QR. พร้อมเพย์ยอดล็อก ═══════════════
  console.log("\n── QR: พร้อมเพย์ยอดล็อก ──");
  const pp = (amount: number) => String((PPI.mod?.promptpayPayload as AnyFn | undefined)?.({ id: "0812345678", amountSatang: amount }));
  await st("QR-1", "STAFF: ยอดล็อก = ยอดค้างของงวดแรก (1,145,000) · payload = promptpayPayload(ผู้รับของหน่วย, ยอด) ทุกไบต์ · ไม่เขียนฐาน", async () => {
    await needDb(); const b = await mkBooking({ pay: "PAY_NOW" }); const v0 = (await bk(b.id)).version;
    const v = V(await call("tripPaymentIntent", staff(), { bookingId: b.id }), "intent");
    eq([v.amountSatang, v.seq, v.payload === pp(TOTAL), (await bk(b.id)).version, (await evs(b.id)).length], [TOTAL, 1, true, v0, 0], "QR");
  });
  await st("QR-2", "มัดจำ: ยอดล็อกงวด 1 = 298,500 · จ่ายแล้ว ⇒ งวด 2 = 846,500 · จ่ายบางส่วน ⇒ ยอดค้างของงวดนั้น", async () => {
    await needDb(); const b = await mkBooking({ key: "D" });
    const am = async () => V(await call("tripPaymentIntent", staff({ unit: uD }), { bookingId: b.id }), "intent").amountSatang;
    const a1 = await am(); await payOk(b, DEP30); const a2 = await am(); await payOk(b, 46_500); const a3 = await am();
    eq([a1, a2, a3], [DEP30, BAL30, BAL30 - 46_500], "ยอด");
  });
  await st("QR-3", "PUBLIC ด้วย token ลิงก์การจอง ⇒ QR เดียวกัน · token ผิด/ของร้านอื่น ⇒ NOT_FOUND · PUBLIC ส่ง bookingId ⇒ FORBIDDEN/VALIDATION", async () => {
    await needDb(); const b = await mkBooking({ pay: "PAY_NOW" }); ok(b.token.length >= 22, "การจองไม่มี publicToken (SESSION_SECRET?)");
    eq(V(await call("tripPaymentIntent", pub(), { publicToken: b.token }), "PUBLIC").payload, pp(TOTAL), "payload");
    codeR(await call("tripPaymentIntent", pub(), { publicToken: `${b.token.slice(0, -2)}xx` }), "NOT_FOUND", "token ผิด");
    codeR(await call("tripPaymentIntent", pub({ unit: uB }), { publicToken: b.token }), "NOT_FOUND", "ร้านอื่น");
    codeR(await call("tripPaymentIntent", pub(), { bookingId: b.id }), ["FORBIDDEN", "VALIDATION"], "PUBLIC bookingId");
  });
  await st("QR-4", "หน่วยไม่มีผู้รับพร้อมเพย์ ⇒ STATE_CONFLICT NO_PROMPTPAY_RECEIVER · การจอง PAID ⇒ NOTHING_DUE", async () => {
    await needDb(); const c = await mkBooking({ key: "C" });
    codeR(await call("tripPaymentIntent", staff({ unit: uA2 }), { bookingId: c.id }), "STATE_CONFLICT", "ไม่มีผู้รับ", "NO_PROMPTPAY_RECEIVER");
    const b = await mkBooking(); await payOk(b, TOTAL);
    codeR(await call("tripPaymentIntent", staff(), { bookingId: b.id }), "STATE_CONFLICT", "จ่ายครบ", "NOTHING_DUE");
  });
  groupLine("QR");

  // ═══════════════ RF. คำขอคืนเงิน ═══════════════
  console.log("\n── RF: คำขอคืนเงิน (G.3 · ภาพ 15) ──");
  const paidBooking = async (o: { key?: string; tender?: string } = {}) => { const b = await mkBooking({ key: o.key }); await payOk(b, TOTAL, { tender: o.tender }); return b; };
  await st("RF-1", "ภาพ 15: PAID 1,145,000 · ยื่น 23 วันก่อนเดินทาง ⇒ QUOTED · amount 647,500 · computed (refundBp 5,000 · kept 497,500 · paid 1,145,000 · bookingVersion) · ที่นั่งยังไม่ปล่อย · การจองยัง PAID", async () => {
    await needDb(); const b = await paidBooking(); const d0 = await depRow(b.dep);
    const v = V(await reqRefund(b), "requestTripRefund");
    const row = (await reqs(b.id))[0] ?? {}; const c = asRec(row.computed) ?? {};
    eq([v.status, row.status, row.amountSatang, row.choice, row.reasonKind, row.by, c.refundBp, c.keptSatang, c.paidSatang, c.bookingVersion],
      ["QUOTED", "QUOTED", RF88.refundSatang, "MONEY", "CUSTOMER", "STAFF", 5_000, RF88.keptSatang, TOTAL, num((await bk(b.id)).version)], "คำขอ");
    eq([await depRow(b.dep), (await bk(b.id)).status], [d0, "PAID"], "ยังไม่ปล่อย");
  });
  await st("RF-2", "ขั้นบันไดผ่านบริการ (เวลาร้าน): D−30 23:59 ⇒ 1,145,000 · D−29 00:00 ⇒ 647,500 · D−14 00:00 ⇒ 150,000 (อุทยานเต็ม) · หลังวันเดินทาง ⇒ 150,000", async () => {
    await needDb(); const out: number[] = [];
    for (const at of [BKK("2027-03-11", "23:59"), new Date("2027-03-11T17:00:00.000Z"), BKK("2027-03-27", "00:00"), BKK("2027-04-11", "09:00")]) {
      const b = await paidBooking(); out.push(num(V(await reqRefund(b, { now: at.toISOString() }), "ยื่น").amountSatang));
    }
    eq(out, [TOTAL, RF88.refundSatang, PARK, PARK], "ยอดคืน");
  });
  await st("RF-3", "เหตุร้านยกเลิก EXTERNAL / MIN_NOT_MET / SHOP_FAULT 3 วันก่อนเดินทาง ⇒ คืน 1,145,000 ทุกเหตุ", async () => {
    await needDb(); const out: number[] = [];
    for (const k of ["EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"]) { const b = await paidBooking(); out.push(num(V(await reqRefund(b, { reasonKind: k, now: BKK("2027-04-07", "10:00").toISOString() }), k).amountSatang)); }
    eq(out, [TOTAL, TOTAL, TOTAL], "คืนเต็ม");
  });
  await st("RF-4", "PART_PAID (จ่าย 298,500 ของมัดจำ) ยื่น 40 วันก่อน ⇒ คืน 298,500 (100 %) · paid ใน computed = 298,500", async () => {
    await needDb(); const b = await mkBooking({ key: "D" }); await payOk(b, DEP30);
    const v = V(await reqRefund(b, { now: T40 }), "ยื่น");
    eq([v.amountSatang, asRec(v.computed)?.paidSatang], [DEP30, DEP30], "ยอด");
  });
  await st("RF-5", "ตารางร้านเข้มกว่าประกาศ (ไม่คืน < 60 วัน) ⇒ ยื่นได้ ยอดคืน = อุทยาน 150,000 · warnings มี REFUND_BELOW_STATUTORY_MINIMUM (WARN ไม่บล็อก)", async () => {
    await needDb(); const b = await paidBooking({ key: "C" });
    const v = V(await reqRefund(b), "ยื่น");
    eq([v.amountSatang, (asRec(v.computed)?.warnings as string[] | undefined)?.includes("REFUND_BELOW_STATUTORY_MINIMUM")], [PARK, true], "ผล");
  });
  await st("RF-6", "หลักฐานเงินเก็บแทนจ่ายออกแล้ว (TripPassThroughEvidence ของการจอง · หรือของรอบที่ bookingId ว่าง) ⇒ คืนไม่รวมอุทยาน 497,500 + warning PASS_THROUGH_PAID_OUT", async () => {
    await needDb(); const out: unknown[] = [];
    for (const byBooking of [true, false]) {
      const b = await paidBooking();
      await insertRow("TripPassThroughEvidence", { id: rid("ev"), tenantId: tA, unitId: uA, departureId: b.dep, bookingId: byBooking ? b.id : null, extraKind: "PARK_FEE", paidToPayee: "กรมอุทยาน", amountSatang: PARK, paidAt: new Date(NOW0), fileIds: [], updatedAt: new Date() });
      const v = V(await reqRefund(b), "ยื่น"); out.push([v.amountSatang, (asRec(v.computed)?.warnings as string[] | undefined)?.includes("PASS_THROUGH_PAID_OUT")]);
    }
    eq(out, [[RF88.refundSatang - PARK, true], [RF88.refundSatang - PARK, true]], "ผล");
  });
  await st("RF-7", "หักค่าใช้จ่ายจริง: หมวด VISA 100,000 มีไฟล์หลักฐาน ⇒ ยอดลด 100,000 · ไม่มีหลักฐาน ⇒ EVIDENCE_REQUIRED · หมวดนอกค่าตั้ง ⇒ VALIDATION · ไฟล์ร้านอื่น ⇒ VALIDATION/NOT_FOUND", async () => {
    await needDb(); const file = await insertRow("FileAsset", { id: rid("fa"), tenantId: tA, updatedAt: new Date() }); const fileB = await insertRow("FileAsset", { id: rid("fb"), tenantId: tB, updatedAt: new Date() });
    const b = await paidBooking();
    codeR(await reqRefund(b, { deductions: [{ category: "VISA", amountSatang: 100_000 }] }), "VALIDATION", "ไม่มีหลักฐาน", "EVIDENCE_REQUIRED");
    codeR(await reqRefund(b, { deductions: [{ category: "FUEL", amountSatang: 100_000, evidenceFileId: file }] }), "VALIDATION", "หมวดผิด");
    codeR(await reqRefund(b, { deductions: [{ category: "VISA", amountSatang: 100_000, evidenceFileId: fileB }] }), ["VALIDATION", "NOT_FOUND"], "ไฟล์ร้านอื่น");
    eq(V(await reqRefund(b, { deductions: [{ category: "VISA", amountSatang: 100_000, evidenceFileId: file }] }), "หัก").amountSatang, RF88.refundSatang - 100_000, "ยอด");
  });
  await st("RF-8", "choice CREDIT ⇒ VALIDATION CREDIT_NOT_ENABLED · MOVE_DATE ⇒ VALIDATION MOVE_DATE_VIA_CHANGE · ไม่เขียนคำขอ", async () => {
    await needDb(); const b = await paidBooking();
    codeR(await reqRefund(b, { choice: "CREDIT" }), "VALIDATION", "CREDIT", "CREDIT_NOT_ENABLED");
    codeR(await reqRefund(b, { choice: "MOVE_DATE" }), "VALIDATION", "MOVE_DATE", "MOVE_DATE_VIA_CHANGE");
    eq((await reqs(b.id)).length, 0, "ไม่เขียน");
  });
  await st("RF-9", "คำขอเปิดได้ 1 ต่อการจอง: ยื่นซ้ำ (คีย์อื่น) ⇒ STATE_CONFLICT REFUND_IN_PROGRESS · HOLD ⇒ NOT_REFUNDABLE_STATUS · version เก่า ⇒ STATE_CONFLICT", async () => {
    await needDb(); const b = await paidBooking(); V(await reqRefund(b), "ครั้งแรก");
    codeR(await reqRefund(b), "STATE_CONFLICT", "ซ้ำ", "REFUND_IN_PROGRESS");
    const h = await mkBooking({ pay: "PAY_NOW" }); codeR(await reqRefund(h), "STATE_CONFLICT", "HOLD", "NOT_REFUNDABLE_STATUS");
    const c = await paidBooking();
    codeR(await call("requestTripRefund", staff({ now: T23 }), { bookingId: c.id, expectedVersion: num((await bk(c.id)).version) - 1, reasonKind: "CUSTOMER", choice: "MONEY", reason: "ทดสอบ", idempotencyKey: `r${hex(6)}` }), "STATE_CONFLICT", "version");
  });
  await st("RF-10", "กันซ้ำของคำขอ: คีย์เดิม + คำขอเดิม ⇒ requestId เดิม replayed · คีย์เดิม + เหตุต่าง ⇒ IDEMPOTENCY_CONFLICT · แถวเดียว", async () => {
    await needDb(); const b = await paidBooking(); const key = `rk${hex(5)}`;
    const a = V(await reqRefund(b, { key }), "ครั้งแรก"); const r = V(await reqRefund(b, { key }), "ซ้ำ");
    eq([r.requestId, r.replayed, (await reqs(b.id)).length], [a.requestId, true, 1], "ซ้ำ");
    codeR(await reqRefund(b, { key, reasonKind: "SHOP_FAULT" }), "IDEMPOTENCY_CONFLICT", "เหตุต่าง");
  });
  await st("RF-11", "อนุมัติ ⇒ APPROVED (decidedById = ผู้อนุมัติ) · ปฏิเสธ (ต้องมีเหตุผล) ⇒ REJECTED · ถอน QUOTED ⇒ WITHDRAWN · ถอน APPROVED ⇒ STATE_CONFLICT · ที่นั่งไม่ขยับทุกกรณี", async () => {
    await needDb();
    const a = await paidBooking(); const d0 = await depRow(a.dep); const ra = V(await reqRefund(a), "ยื่น");
    V(await decide(a, ra.requestId), "อนุมัติ");
    eq([(await reqs(a.id))[0]?.status, (await reqs(a.id))[0]?.decidedById, await depRow(a.dep)], ["APPROVED", U.oa?.userId, d0], "APPROVED");
    codeR(await call("withdrawTripRefund", staff({ now: T23 }), { requestId: ra.requestId, reason: "ถอน", idempotencyKey: `w${hex(6)}` }), "STATE_CONFLICT", "ถอน APPROVED");
    const r = await paidBooking(); const rr = V(await reqRefund(r), "ยื่น");
    codeR(await decide(r, rr.requestId, { decision: "REJECT" }), "VALIDATION", "ปฏิเสธไม่มีเหตุผล");
    V(await decide(r, rr.requestId, { decision: "REJECT", reason: "นอกเงื่อนไข" }), "ปฏิเสธ");
    const w = await paidBooking(); const rw = V(await reqRefund(w), "ยื่น");
    V(await call("withdrawTripRefund", staff({ now: T23 }), { requestId: rw.requestId, reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: `w${hex(6)}` }), "ถอน");
    eq([(await reqs(r.id))[0]?.status, (await reqs(w.id))[0]?.status, (await bk(r.id)).status, (await bk(w.id)).status], ["REJECTED", "WITHDRAWN", "PAID", "PAID"], "ผล");
  });
  await st("RF-12", "ใบเสนอเก่า: การจองเปลี่ยนหลังยื่น (version) ⇒ อนุมัติ = STATE_CONFLICT STALE_QUOTE", async () => {
    await needDb(); const b = await paidBooking(); const r = V(await reqRefund(b), "ยื่น");
    await pool.query(`UPDATE "TripBooking" SET version = version + 1 WHERE id = $1`, [b.id]); // จำลองการเปลี่ยน (ร้านชั่วคราว)
    codeR(await decide(b, r.requestId), "STATE_CONFLICT", "เก่า", "STALE_QUOTE");
  });
  await st("RF-13", "แก้ยอดมือ ≤ ฿2,000 (X13): +150,000 มีเหตุผล ⇒ APPROVED ยอด 797,500 · ไม่มีเหตุผล ⇒ MANUAL_REASON_REQUIRED · −100,000 ⇒ ผ่าน + warning MANUAL_BELOW_POLICY", async () => {
    await needDb(); const b = await paidBooking(); const r = V(await reqRefund(b), "ยื่น");
    codeR(await decide(b, r.requestId, { delta: 150_000 }), "VALIDATION", "ไม่มีเหตุผล", "MANUAL_REASON_REQUIRED");
    V(await decide(b, r.requestId, { delta: 150_000, manualReason: "ลูกค้าประจำ ร้านคืนเพิ่ม" }), "แก้ +");
    eq([(await reqs(b.id))[0]?.amountSatang, (await reqs(b.id))[0]?.manualDeltaSatang], [RF88.refundSatang + 150_000, 150_000], "ยอด");
    const c = await paidBooking(); const rc = V(await reqRefund(c), "ยื่น");
    const v = V(await decide(c, rc.requestId, { delta: -100_000, manualReason: "หักค่าเรือที่จ่ายไปแล้ว" }), "แก้ −");
    ok(JSON.stringify(v).includes("MANUAL_BELOW_POLICY"), `ไม่มี warning: ${fmt(v)}`);
  });
  await st("RF-14", "แก้ยอดมือเกิน ฿2,000 ⇒ REQUIRES_APPROVAL (details entityType trips.refund · entityId = tripRefundEntityId(ยอดสุดท้าย)) · คำอนุมัติ APPROVED ⇒ ผ่าน · ใช้ซ้ำกับคำขออื่น ⇒ FORBIDDEN APPROVAL_USED/NOT_APPROVED", async () => {
    await needDb(); const b = await paidBooking(); const r = V(await reqRefund(b), "ยื่น");
    const fin = RF88.refundSatang + 300_000;
    const need = await decide(b, r.requestId, { delta: 300_000, manualReason: "ร้านผิดนัดรับส่ง ชดเชยเพิ่ม" });
    codeR(need, "REQUIRES_APPROVAL", "เกินเพดาน");
    const ent = String(fn("tripRefundEntityId")({ unitId: uA, requestId: r.requestId, amountSatang: fin }));
    eq([asRec(need.details)?.entityType, asRec(need.details)?.entityId, (await reqs(b.id))[0]?.status], ["trips.refund", ent, "QUOTED"], "รายละเอียด");
    const ap = await insertRow("ApprovalRequest", { id: rid("ap"), tenantId: tA, policyId: rid("pol"), entityType: "trips.refund", entityId: ent, unitId: uA, status: "APPROVED", requestedById: String(U.oa?.userId), decidedAt: new Date(), idempotencyKey: `qc-${hex(6)}` });
    V(await decide(b, r.requestId, { delta: 300_000, manualReason: "ร้านผิดนัดรับส่ง ชดเชยเพิ่ม", approvalId: ap }), "มีคำอนุมัติ");
    eq((await reqs(b.id))[0]?.amountSatang, fin, "ยอด");
    const c = await paidBooking(); const rc = V(await reqRefund(c), "ยื่น");
    codeR(await decide(c, rc.requestId, { delta: 300_000, manualReason: "ร้านผิดนัดรับส่ง ชดเชยเพิ่ม", approvalId: ap }), "FORBIDDEN", "ใช้ซ้ำ", ["APPROVAL_USED", "APPROVAL_NOT_APPROVED"]);
  });
  await st("RF-15", "คืนเกินเงินที่รับ: แก้มือจนส่วนไม่ใช่เก็บแทน > ที่รับ ⇒ VALIDATION OVER_REFUND · ติดลบ ⇒ OVER_REFUND · คำขอยัง QUOTED", async () => {
    await needDb(); const b = await paidBooking(); const r = V(await reqRefund(b), "ยื่น");
    codeR(await decide(b, r.requestId, { delta: VATABLE, manualReason: "คืนเกินตั้งใจทดสอบ" }), ["VALIDATION", "REQUIRES_APPROVAL"], "เกิน");
    codeR(await decide(b, r.requestId, { delta: -(RF88.refundSatang - PARK) - 1, manualReason: "ติดลบตั้งใจทดสอบ" }), ["VALIDATION", "REQUIRES_APPROVAL"], "ติดลบ");
    const ap = await insertRow("ApprovalRequest", { id: rid("ap"), tenantId: tA, policyId: rid("pol"), entityType: "trips.refund", entityId: String(fn("tripRefundEntityId")({ unitId: uA, requestId: r.requestId, amountSatang: RF88.refundSatang + VATABLE })), unitId: uA, status: "APPROVED", requestedById: String(U.oa?.userId), decidedAt: new Date(), idempotencyKey: `qc-${hex(6)}` });
    codeR(await decide(b, r.requestId, { delta: VATABLE, manualReason: "คืนเกินตั้งใจทดสอบ", approvalId: ap }), "VALIDATION", "เกินแม้มีคำอนุมัติ", "OVER_REFUND");
    eq((await reqs(b.id))[0]?.status, "QUOTED", "สถานะ");
  });
  await st("RF-16", "autoApproveUpTo (X12 · ค่าปัจจุบัน) > ยอด ⇒ คำขอ APPROVED ทันที (decidedById null) · ค่าเริ่ม 0 ⇒ QUOTED", async () => {
    await needDb(); await setV(tA, [unitSet(uA2, "trips.cancel.autoApproveUpTo", 10_000_000)], "oa");
    try { const b = await paidBooking({ key: "C" }); const v = V(await reqRefund(b), "ยื่น"); eq([v.status, (await reqs(b.id))[0]?.decidedById ?? null], ["APPROVED", null], "อัตโนมัติ"); }
    finally { await setV(tA, [unitSet(uA2, "trips.cancel.autoApproveUpTo", 0)], "oa"); }
  });
  groupLine("RF");

  // ═══════════════ DN. บันทึกโอนคืน ═══════════════
  console.log("\n── DN: บันทึกโอนคืน (DONE) ──");
  const approved = async (o: { key?: string; tender?: string; now?: string } = {}) => { const b = await paidBooking(o); const r = V(await reqRefund(b, { now: o.now }), "ยื่น"); V(await decide(b, r.requestId, { now: o.now }), "อนุมัติ"); return { b, requestId: String(r.requestId) }; };
  await st("DN-1", "ภาพ 15 ครบวงจร: DONE ⇒ การจอง CANCELLED (refundedSatang 647,500 · cancelledAt) · REFUNDED 647,500 (VAT 32,547 · pt 150,000 · tender PROMPTPAY) · RETAINED 497,500 (VAT 32,546) · งวด CANCELLED · ที่นั่งคืน 3", async () => {
    await needDb(); const { b, requestId } = await approved(); const d0 = await depRow(b.dep);
    const v = V(await execute(b, requestId), "execute");
    const row = await bk(b.id);
    eq([v.status, v.bookingStatus, row.status, row.refundedSatang, row.cancelledAt !== null, (await reqs(b.id))[0]?.status], ["DONE", "CANCELLED", "CANCELLED", RF88.refundSatang, true, "DONE"], "สถานะ");
    eq((await evs(b.id)).filter((x) => x.kind !== "RECEIVED").map((x) => [x.kind, x.amountSatang, x.vatSatang, x.passThroughSatang, x.tender, x.postingStatus]).sort((a, c) => String(a[0]).localeCompare(String(c[0]))),
      [["REFUNDED", 647_500, 32_547, PARK, "PROMPTPAY", "UNPOSTED"], ["RETAINED", 497_500, 32_546, 0, "PROMPTPAY", "UNPOSTED"]], "แถวเงิน");
    eq([(await dues(b.id)).map((d) => d.status), num(d0.sold) - num((await depRow(b.dep)).sold)], [["PAID"], 3] /* ORACLE-EDIT DN-1 (ผู้คุม 13 พ.ย.): มติ V3 — งวดที่จ่ายแล้วคง PAID · ยกเลิกเฉพาะงวดที่ยังเปิด */, "งวด/ที่นั่ง");
    await moneyOk(b.id, "DN-1"); await seatInv(b.dep, "DN-1");
  });
  await st("DN-2", "คีย์แถวคืน = trips-ref:<requestId>:<receivedEventId> · trips-ret:<requestId>:<receivedEventId> (อ้างใบรับเดิม)", async () => {
    await needDb(); const { b, requestId } = await approved(); V(await execute(b, requestId), "execute");
    const rcv = (await evs(b.id, "RECEIVED"))[0]?.id;
    eq([(await evs(b.id, "REFUNDED"))[0]?.idempotencyKey, (await evs(b.id, "RETAINED"))[0]?.idempotencyKey], [`trips-ref:${requestId}:${rcv}`, `trips-ret:${requestId}:${rcv}`], "คีย์");
  });
  await st("DN-3", "สองใบรับต่างกลุ่ม tender (TRANSFER 1,140,000 + CASH 5,000) ⇒ แถวคืนต่อใบรับ tender ตามใบ · ต่อใบ คืน+เก็บ = รับ ทุกช่อง (amount · pt · VAT)", async () => {
    await needDb(); const b = await mkBooking(); await payOk(b, SHORT, { tender: "TRANSFER" }); await payOk(b, TOTAL - SHORT, { tender: "CASH" });
    const r = V(await reqRefund(b), "ยื่น"); V(await decide(b, r.requestId), "อนุมัติ"); V(await execute(b, r.requestId), "execute");
    const e = await evs(b.id); const bad: string[] = [];
    for (const rc of e.filter((x) => x.kind === "RECEIVED")) {
      const kids = e.filter((x) => x.kind !== "RECEIVED" && String(x.idempotencyKey).endsWith(`:${rc.id}`));
      for (const f of ["amountSatang", "passThroughSatang", "vatSatang"]) if (kids.reduce((s, x) => s + num(x[f]), 0) !== num(rc[f])) bad.push(`${rc.tender} ${f}`);
      if (kids.some((x) => x.tender !== rc.tender)) bad.push(`${rc.tender} tender ข้ามกลุ่ม`);
    }
    ok(bad.length === 0, bad.join(" · ")); eq(e.filter((x) => x.kind === "REFUNDED").reduce((s, x) => s + num(x.amountSatang), 0), RF88.refundSatang, "Σ คืน");
    await moneyOk(b.id, "DN-3");
  });
  await st("DN-4", "bankTender: ใบรับ PROMPTPAY คืนด้วย TRANSFER ได้ · ใบรับ CASH ส่ง bankTender ไม่เปลี่ยน tender ของแถวคืนเงินสด", async () => {
    await needDb(); const { b, requestId } = await approved(); V(await execute(b, requestId, { bankTender: "TRANSFER" }), "execute");
    eq((await evs(b.id, "REFUNDED")).map((x) => x.tender), ["TRANSFER"], "ธนาคาร");
    const c = await approved({ tender: "CASH" }); V(await execute(c.b, c.requestId, { bankTender: "TRANSFER" }), "execute");
    eq((await evs(c.b.id, "REFUNDED")).map((x) => x.tender), ["CASH"], "เงินสด");
  });
  await st("DN-5", "ยอดคืน 0 (ยกเลิก < 15 วัน · อุทยานจ่ายออกแล้ว) ⇒ DONE · ไม่มี REFUNDED · RETAINED = 1,145,000 · การจอง CANCELLED · ที่นั่งคืน", async () => {
    await needDb(); const b = await paidBooking();
    await insertRow("TripPassThroughEvidence", { id: rid("ev"), tenantId: tA, unitId: uA, departureId: b.dep, bookingId: b.id, extraKind: "PARK_FEE", paidToPayee: "กรมอุทยาน", amountSatang: PARK, paidAt: new Date(NOW0), fileIds: [], updatedAt: new Date() });
    const at = BKK("2027-04-05", "10:00").toISOString(); const r = V(await reqRefund(b, { now: at }), "ยื่น"); eq(r.amountSatang, 0, "ยอด");
    V(await decide(b, r.requestId, { now: at }), "อนุมัติ"); V(await execute(b, r.requestId, { now: at }), "execute");
    eq([(await bk(b.id)).status, (await evs(b.id, "REFUNDED")).length, (await evs(b.id, "RETAINED")).reduce((s, x) => s + num(x.amountSatang), 0)], ["CANCELLED", 0, TOTAL], "ผล");
    await moneyOk(b.id, "DN-5"); await seatInv(b.dep, "DN-5");
  });
  await st("DN-6", "โค้ดส่วนลดคืนสิทธิ์หลังคืนที่นั่ง (redemption RELEASED · usedCount ลด) · ยอดการจองที่มีส่วนลด = payable จาก snapshot (ไม่ใช่ gross)", async () => {
    await needDb(); const code = `T7${hex(2)}`.toUpperCase();
    const rule = await insertRow("TripPriceRule", { id: rid("ru"), tenantId: tA, unitId: uA, productId: null, kind: "PROMO_CODE", code, params: JSON.stringify({ kind: "PROMO_CODE", code, discountBp: 1_000, maxUses: 10 }), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });
    const b = await mkBooking({ promo: code }); ok(b.payable < TOTAL, `ส่วนลดไม่เกิด ${b.payable}`);
    await payOk(b, b.payable); const r = V(await reqRefund(b, { now: T40 }), "ยื่น"); eq(r.amountSatang, b.payable, "คืน 100 % ของที่จ่าย");
    V(await decide(b, r.requestId, { now: T40 }), "อนุมัติ"); V(await execute(b, r.requestId, { now: T40 }), "execute");
    eq([(await q<Rec>(`SELECT status FROM "TripPromoRedemption" WHERE "bookingId" = $1`, [b.id])).map((x) => x.status), (await q<Rec>(`SELECT "usedCount" FROM "TripPriceRule" WHERE id = $1`, [rule]))[0]?.usedCount], [["RELEASED"], 0], "โค้ด");
  });
  await st("DN-7", "execute ก่อนอนุมัติ (QUOTED) ⇒ STATE_CONFLICT · กันซ้ำ: คีย์เดิมหลัง DONE ⇒ ผลเดิม ไม่มีแถวเพิ่ม · คีย์อื่นหลัง DONE ⇒ STATE_CONFLICT", async () => {
    await needDb(); const b = await paidBooking(); const r = V(await reqRefund(b), "ยื่น");
    codeR(await execute(b, r.requestId), "STATE_CONFLICT", "QUOTED");
    V(await decide(b, r.requestId), "อนุมัติ"); const key = `xk${hex(5)}`;
    V(await execute(b, r.requestId, { key }), "ครั้งแรก"); const n = (await evs(b.id)).length;
    V(await execute(b, r.requestId, { key }), "ซ้ำ"); codeR(await execute(b, r.requestId), "STATE_CONFLICT", "คีย์อื่น");
    eq((await evs(b.id)).length, n, "ไม่มีแถวเพิ่ม");
  });
  groupLine("DN");

  // ═══════════════ CN. tripSellable.cancel ═══════════════
  console.log("\n── CN: tripSellable.cancel บนการจองที่ขายแล้ว ──");
  await st("CN-1", "cancel QUOTE บน PAID (23 วัน) ⇒ computed {refundSatang 647,500 · feeSatang 497,500 · ladderStep {15, 5000} · SNAPSHOT} · ไม่เขียน", async () => {
    await needDb(); const b = await paidBooking();
    const v = V(await call("cancelTripBooking", staff({ now: T23 }), { bookingId: b.id, mode: "QUOTE", reason: "ขอราคายกเลิก", idempotencyKey: `cq${hex(6)}` }), "QUOTE");
    eq(asRec(v.computed), { refundSatang: RF88.refundSatang, feeSatang: RF88.keptSatang, ladderStep: { daysBefore: 15, refundBp: 5_000 }, source: "SNAPSHOT" }, "computed");
    eq((await reqs(b.id)).length, 0, "ไม่เขียน");
  });
  await st("CN-2", "cancel EXECUTE บน PAID ⇒ ยื่นคำขอคืนเงิน (requestId · status QUOTED · คีย์ cancel:<bookingId>:…) แทน REFUND_REQUIRED · ซ้ำคีย์เดิม = requestId เดิม", async () => {
    await needDb(); const b = await paidBooking(); const key = `ce${hex(6)}`;
    const body = { bookingId: b.id, mode: "EXECUTE", reason: "ลูกค้ายกเลิกทางโทรศัพท์", idempotencyKey: key };
    const v = V(await call("cancelTripBooking", staff({ now: T23 }), body), "EXECUTE"); const v2 = V(await call("cancelTripBooking", staff({ now: T23 }), body), "ซ้ำ");
    const row = (await reqs(b.id))[0] ?? {};
    eq([v.status, v.requestId, v2.requestId, row.amountSatang, String(row.idempotencyKey).startsWith(`cancel:${b.id}:`), (await reqs(b.id)).length], ["QUOTED", row.id, row.id, RF88.refundSatang, true, 1], "คำขอ");
  });
  await st("CN-3", "cancel choice CREDIT ⇒ VALIDATION CREDIT_NOT_ENABLED · moveToSlotId ⇒ VALIDATION MOVE_DATE_VIA_CHANGE (รับ field แล้ว ไม่ใช่ strict-reject)", async () => {
    await needDb(); const b = await paidBooking();
    codeR(await call("cancelTripBooking", staff({ now: T23 }), { bookingId: b.id, mode: "EXECUTE", reason: "ขอเครดิต", choice: "CREDIT", idempotencyKey: `cc${hex(6)}` }), "VALIDATION", "CREDIT", "CREDIT_NOT_ENABLED");
    codeR(await call("cancelTripBooking", staff({ now: T23 }), { bookingId: b.id, mode: "EXECUTE", reason: "ขอย้ายวัน", choice: "MOVE_DATE", moveToSlotId: b.dep, idempotencyKey: `cm${hex(6)}` }), "VALIDATION", "MOVE", "MOVE_DATE_VIA_CHANGE");
  });
  await st("CN-4", "ConfirmRequest.pay.tender รับเป็นคำใบ้ (ไม่ VALIDATION) · ไม่บันทึกเงินในธุรกรรมยืนยัน", async () => {
    await needDb(); const dep = await mkDep(TRAVEL); const ctx = staff(); const lines = [lineOf(dep, "A")];
    const quote = V(await call("quoteTrips", ctx, { lines }, {}), "quote");
    const r = await call("bookTripsNow", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `n${hex(6)}`, booker: booker(), pay: { method: "PAY_NOW", tender: "CASH" } }, {});
    ok(r.ok === true, `tender ถูกปฏิเสธ: ${fmt(r)}`);
    const id = String(asArr(r.value)[0]?.bookingId); eq([(await bk(id)).status, (await evs(id)).length], ["HOLD", 0], "ไม่รับเงินเอง");
  });
  groupLine("CN");

  // ═══════════════ MV. แก้การจองที่มีงวด/จ่ายแล้ว ═══════════════
  console.log("\n── MV: แก้การจองที่มีงวด/จ่ายแล้ว ──");
  const change = async (b: Bk, toDep: string, o: { a?: number; c?: number } = {}) => {
    const ctx = staff({ now: addMin(NOW0, 5) }); const ln = lineOf(toDep, "A", o);
    const quote = V(await call("quoteTrips", ctx, { lines: [ln] }, {}), "quote");
    return call("changeTripBooking", ctx, { bookingId: b.id, expectedVersion: num((await bk(b.id)).version), line: ln, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `m${hex(6)}` }, {});
  };
  await st("MV-1", "CONFIRMED (ยังไม่จ่าย) เพิ่มผู้ใหญ่ 1 ⇒ งวดเดิม CANCELLED · งวดใหม่ seq 2 ยอด payable ใหม่ OPEN", async () => {
    await needDb(); const b = await mkBooking(); V(await change(b, b.dep, { a: 3 }), "change");
    const p = num(asRec(asRec((await bk(b.id)).policySnapshot)?.totals)?.payableSatang);
    eq((await dues(b.id)).map((d) => [d.seq, d.status, d.amountSatang]), [[1, "CANCELLED", TOTAL], [2, "OPEN", p]], "งวด");
  });
  await st("MV-2", "PAID เลื่อนวันราคาเท่าเดิม ⇒ ผ่าน (ปลด NOT_SUPPORTED) · paid ไม่เปลี่ยน · สถานะ PAID · รอบใหม่ · ไม่มีแถวเงินใหม่", async () => {
    await needDb(); const b = await paidBooking(); const to = await mkDep("2027-04-17");
    V(await change(b, to), "เลื่อน");
    const row = await bk(b.id); eq([row.status, row.paidSatang, row.departureId, (await evs(b.id)).length], ["PAID", TOTAL, to, 1], "ผล");
    await moneyOk(b.id, "MV-2"); await seatInv(to, "MV-2");
  });
  await st("MV-3", "PART_PAID แก้แล้วยอดเปลี่ยน (เพิ่มคน) ⇒ STATE_CONFLICT PRICE_CHANGED_AFTER_PAYMENT · ไม่เขียน", async () => {
    await needDb(); const b = await mkBooking(); await payOk(b, SHORT); const v0 = (await bk(b.id)).version;
    codeR(await change(b, b.dep, { a: 3 }), "STATE_CONFLICT", "ยอดเปลี่ยน", "PRICE_CHANGED_AFTER_PAYMENT");
    eq((await bk(b.id)).version, v0, "ไม่เขียน");
  });
  await st("MV-4", "มีคำขอคืนเงินเปิด ⇒ แก้การจอง = STATE_CONFLICT REFUND_IN_PROGRESS", async () => {
    await needDb(); const b = await paidBooking(); V(await reqRefund(b), "ยื่น");
    codeR(await change(b, await mkDep("2027-04-18")), "STATE_CONFLICT", "คำขอเปิด", "REFUND_IN_PROGRESS");
  });
  groupLine("MV");

  // ═══════════════ CD. ข้อมูลกระทบยอดเงินสด (N-4) ═══════════════
  console.log("\n── CD: ข้อมูลกระทบยอดเงินสดหน้าร้าน ──");
  await st("CD-1", "tripCashDay (วันทำการตามเวลาร้าน): เงินสดรับ − คืนเงินสด = expected · แยก tender · ไม่รวม RETAINED · ร้าน/หน่วยอื่นไม่ปน", async () => {
    await needDb(); const day = "2027-05-02"; const at = BKK(day, "10:00").toISOString();
    const b1 = await mkBooking({ now: at, date: "2027-06-20" }); await payOk(b1, 300_000, { tender: "CASH", now: at }); await payOk(b1, 100_000, { tender: "PROMPTPAY", now: at });
    const b2 = await mkBooking({ now: at, date: "2027-06-20" }); await payOk(b2, TOTAL, { tender: "CASH", now: at });
    const v = V(await call("tripCashDay", staff({ now: BKK(day, "20:00") }), { businessDate: day }), "tripCashDay");
    const mine = asArr(v.events).filter((e) => e.bookingId === b1.id || e.bookingId === b2.id);
    eq([mine.length, asRec(asRec(v.byTender)?.CASH)?.receivedSatang, asRec(asRec(v.byTender)?.PROMPTPAY)?.receivedSatang], [3, 300_000 + TOTAL, 100_000], "ยอด");
    eq(v.expectedSatang, num(asRec(asRec(v.byTender)?.CASH)?.receivedSatang) - num(asRec(asRec(v.byTender)?.CASH)?.refundedSatang), "expected");
  });
  await st("CD-2", "วันทำการตัดที่เที่ยงคืนเวลาร้าน: เงินสด 23:30 น. อยู่วันนั้น · 00:30 น. อยู่วันถัดไป (ไม่ใช่วันตาม UTC)", async () => {
    await needDb(); const d1 = "2027-05-09";
    const b = await mkBooking({ now: BKK(d1, "20:00").toISOString(), date: "2027-06-21" });
    await payOk(b, 1_000, { tender: "CASH", now: BKK(d1, "23:30").toISOString() }); await payOk(b, 2_000, { tender: "CASH", now: BKK("2027-05-10", "00:30").toISOString() });
    const day = async (d: string) => asArr(V(await call("tripCashDay", staff({ now: BKK("2027-05-11", "10:00") }), { businessDate: d }), "day").events).filter((e) => e.bookingId === b.id).map((e) => e.amountSatang);
    eq([await day(d1), await day("2027-05-10")], [[1_000], [2_000]], "วัน");
  });
  groupLine("CD");

  // ═══════════════ RC. ยิงพร้อมกัน ═══════════════
  console.log("\n── RC: ยิงพร้อมกัน ──");
  await st("RC-1", "จ่ายซ้ำคีย์เดิม 10 คำขอพร้อมกัน ⇒ ทุกตัว ok · RECEIVED 1 แถว · paid = ยอดเดียว · ไม่มี THROW/BUSY/40P01", async () => {
    await needDb(); const b = await mkBooking(); const key = `rc1${hex(5)}`;
    const rs = await withTimer(par(10, () => pay(b, TOTAL, { key })), 90_000, "RC-1");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`); ok(rs.every((r) => r.ok === true), `ไม่ ok ${fmt(rs.find((r) => r.ok !== true))}`);
    eq([(await evs(b.id)).length, (await bk(b.id)).paidSatang, rs.filter((r) => asRec(r.value)?.replayed === false).length], [1, TOTAL, 1], "ครั้งเดียว");
  });
  await st("RC-2", "จ่ายเต็มคนละคีย์ 8 คำขอพร้อมกัน ⇒ สำเร็จ 1 · ที่เหลือ NOTHING_DUE/OVERPAYMENT · trips.booking.paid ครั้งเดียว", async () => {
    await needDb(); const b = await mkBooking();
    const rs = await withTimer(par(8, () => pay(b, TOTAL)), 90_000, "RC-2");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    eq([rs.filter((r) => r.ok === true).length, rs.filter((r) => r.ok === false && ["NOTHING_DUE", "OVERPAYMENT"].includes(String(asRec(r.details)?.reason))).length, (await outboxFor("trips.booking.paid", b.id)).length], [1, 7, 1], "ผล");
    await moneyOk(b.id, "RC-2");
  });
  await st("RC-3", "จ่ายย่อย 100,000 × 20 พร้อมกันบน 1,145,000 ⇒ สำเร็จ 11 (1,100,000) · ที่เหลือ OVERPAYMENT · part_paid ครั้งเดียว · paid ≤ payable ตลอด", async () => {
    await needDb(); const b = await mkBooking();
    const rs = await withTimer(par(20, () => pay(b, 100_000)), 120_000, "RC-3");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    eq([rs.filter((r) => r.ok === true).length, (await bk(b.id)).paidSatang, (await bk(b.id)).status, (await outboxFor("trips.booking.part_paid", b.id)).length], [11, 1_100_000, "PART_PAID", 1], "ผล");
    await moneyOk(b.id, "RC-3");
  });
  await st("RC-4", "รับเงิน HOLD ∥ ยกเลิกก่อนจ่าย (T0.6) 6 คู่ ⇒ แต่ละการจองจบ PAID (hold CONVERTED · มีเงิน) หรือ CANCELLED (hold RELEASED · ไม่มีเงิน) · ค่าคงที่ที่นั่ง", async () => {
    await needDb(); const dep = await mkDep("2027-04-12"); const bs: Bk[] = [];
    for (let i = 0; i < 6; i++) bs.push(await mkBooking({ dep, pay: "PAY_NOW" }));
    const rs = await withTimer(Promise.all(bs.flatMap((b) => [pay(b, TOTAL), call("cancelTripBooking", staff({ now: addMin(NOW0, 1) }), { bookingId: b.id, mode: "EXECUTE", reason: "ยกเลิกแข่งกับจ่าย", idempotencyKey: `c4${hex(5)}` })])), 120_000, "RC-4");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    for (const b of bs) {
      const row = await bk(b.id); const h = (await q<Rec>(`SELECT status FROM "TripHold" WHERE "bookingId" = $1`, [b.id]))[0]?.status; const n = (await evs(b.id)).length;
      ok((row.status === "PAID" && h === "CONVERTED" && n === 1) || (row.status === "CANCELLED" && h === "RELEASED" && n === 0), `${b.id.slice(-6)}: ${row.status}/${h}/${n}`);
    }
    await seatInv(dep, "RC-4");
  });
  await st("RC-5", "รับเงิน ∥ ยื่นคำขอคืนเงิน บน PART_PAID 6 คู่ ⇒ ถ้ามีคำขอ computed.paidSatang = paid ของการจองตอนนั้น (ไม่หลุดเงินที่เข้าทีหลัง) · ไม่มี 40P01", async () => {
    await needDb(); const bs: Bk[] = [];
    for (let i = 0; i < 6; i++) { const b = await mkBooking(); await payOk(b, SHORT); bs.push(b); }
    const rs = await withTimer(Promise.all(bs.flatMap((b) => [pay(b, TOTAL - SHORT, { now: T23 }), reqRefund(b)])), 120_000, "RC-5");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    for (const b of bs) {
      const rq = (await reqs(b.id))[0]; const row = await bk(b.id);
      if (rq) eq(num(asRec(rq.computed)?.paidSatang), num(row.paidSatang), `${b.id.slice(-6)} computed.paid`);
      await moneyOk(b.id, "RC-5");
    }
  });
  await st("RC-6", "execute คำขอเดียวกัน 10 พร้อมกัน (คีย์เดียว) ⇒ DONE ครั้งเดียว · REFUNDED/RETAINED ชุดเดียว · ที่นั่งคืนครั้งเดียว · คนละคีย์ 5 ตัว ⇒ สำเร็จ 1", async () => {
    await needDb(); const A1 = await approved(); const d0 = await depRow(A1.b.dep); const key = `x6${hex(5)}`;
    const rs = await withTimer(par(10, () => execute(A1.b, A1.requestId, { key })), 120_000, "RC-6a");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`); ok(rs.every((r) => r.ok === true), `ไม่ ok ${fmt(rs.find((r) => r.ok !== true))}`);
    eq([(await evs(A1.b.id, "REFUNDED")).length, (await evs(A1.b.id, "RETAINED")).length, num(d0.sold) - num((await depRow(A1.b.dep)).sold)], [1, 1, 3], "ครั้งเดียว");
    const A2 = await approved(); const rs2 = await withTimer(par(5, () => execute(A2.b, A2.requestId)), 120_000, "RC-6b");
    ok(!rs2.some(badOutcome), `ผลเสีย ${fmt(rs2.find(badOutcome))}`);
    eq([rs2.filter((r) => r.ok === true).length, (await evs(A2.b.id, "REFUNDED")).length], [1, 1], "คนละคีย์");
    await moneyOk(A1.b.id, "RC-6"); await seatInv(A1.b.dep, "RC-6");
  });
  await st("RC-7", "อนุมัติ ∥ ถอน บนคำขอเดียว 6 คู่ ⇒ จบ APPROVED หรือ WITHDRAWN อย่างใดอย่างหนึ่ง · ผู้แพ้ได้ STATE_CONFLICT · ไม่มี THROW", async () => {
    await needDb(); const items: { b: Bk; id: unknown }[] = [];
    for (let i = 0; i < 6; i++) { const b = await paidBooking(); items.push({ b, id: V(await reqRefund(b), "ยื่น").requestId }); }
    const rs = await withTimer(Promise.all(items.flatMap((x) => [decide(x.b, x.id), call("withdrawTripRefund", staff({ now: T23 }), { requestId: x.id, reason: "ถอนแข่ง", idempotencyKey: `w7${hex(5)}` })])), 90_000, "RC-7");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    for (const [i, x] of items.entries()) { const s = (await reqs(x.b.id))[0]?.status; ok((s === "APPROVED" && rs[2 * i]?.ok === true) || (s === "WITHDRAWN" && rs[2 * i + 1]?.ok === true), `${i}: ${s}`); }
  });
  await st("RC-8", "ยื่นคำขอคืนเงิน 8 คำขอพร้อมกัน (คนละคีย์) บนการจองเดียว ⇒ คำขอ 1 แถว · ที่เหลือ REFUND_IN_PROGRESS", async () => {
    await needDb(); const b = await paidBooking(); const v = num((await bk(b.id)).version);
    const rs = await withTimer(par(8, () => call("requestTripRefund", staff({ now: T23 }), { bookingId: b.id, expectedVersion: v, reasonKind: "CUSTOMER", choice: "MONEY", reason: "ยื่นแข่ง", idempotencyKey: `r8${hex(5)}` })), 90_000, "RC-8");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    eq([(await reqs(b.id)).length, rs.filter((r) => r.ok === true).length], [1, 1], "หนึ่งแถว");
  });
  await st("RC-9", "ผสม 30 คำสั่งบนรอบเดียว (จ่าย HOLD · จ่าย CONFIRMED · execute · ยกเลิกก่อนจ่าย) ⇒ ไม่มี 40P01/THROW/BUSY · ค่าคงที่ที่นั่ง + เงินทุกการจอง", async () => {
    await needDb(); const dep = await mkDep("2027-04-14", "A", 60);
    const holds: Bk[] = [], confs: Bk[] = [], exes: { b: Bk; requestId: string }[] = [];
    for (let i = 0; i < 5; i++) holds.push(await mkBooking({ dep, pay: "PAY_NOW" }));
    for (let i = 0; i < 5; i++) confs.push(await mkBooking({ dep }));
    for (let i = 0; i < 5; i++) { const b = await mkBooking({ dep }); await payOk(b, TOTAL); const r = V(await reqRefund(b), "ยื่น"); V(await decide(b, r.requestId), "อนุมัติ"); exes.push({ b, requestId: String(r.requestId) }); }
    const ops: Promise<Rec>[] = [
      ...holds.map((b) => pay(b, TOTAL)), ...holds.map((b) => call("cancelTripBooking", staff({ now: addMin(NOW0, 1) }), { bookingId: b.id, mode: "EXECUTE", reason: "ผสม", idempotencyKey: `c9${hex(5)}` })),
      ...confs.map((b) => pay(b, SHORT)), ...confs.map((b) => pay(b, TOTAL - SHORT)), ...exes.map((x) => execute(x.b, x.requestId)), ...exes.map((x) => execute(x.b, x.requestId)),
    ];
    const rs = await withTimer(Promise.all(ops), 180_000, "RC-9");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    await seatInv(dep, "RC-9"); for (const b of [...holds, ...confs, ...exes.map((x) => x.b)]) await moneyOk(b.id, "RC-9");
  });
  groupLine("RC");

  // ═══════════════ NC. ไม่มี connection ที่สอง ═══════════════
  console.log("\n── NC: ไม่มี connection ที่สองในธุรกรรม ──");
  await st("NC-1", "14 การรับเงิน HOLD + 14 การยื่นคำขอขนาน (pool แอป 10) ⇒ จบทั้งหมดภายในเวลา · ไม่มี THROW/BUSY", async () => {
    await needDb(); const dep = await mkDep("2027-04-15", "A", 60); const hs: Bk[] = [], ps: Bk[] = [];
    for (let i = 0; i < 14; i++) hs.push(await mkBooking({ dep, pay: "PAY_NOW" }));
    for (let i = 0; i < 14; i++) ps.push(await paidBooking());
    const rs = await withTimer(Promise.all([...hs.map((b) => pay(b, TOTAL)), ...ps.map((b) => reqRefund(b))]), 120_000, "NC-1");
    ok(!rs.some(badOutcome) && rs.every((r) => r.ok === true), `ผล ${fmt(rs.find((r) => r.ok !== true))}`);
  });
  groupLine("NC");

  // ═══════════════ X. แยกร้าน/หน่วย ═══════════════
  console.log("\n── X: แยกร้าน/หน่วย ──");
  await st("X-1", "ร้าน B ใช้ id การจองของร้าน A ⇒ NOT_FOUND ทุกบริการ (รับเงิน · QR · ยื่น · งวด · สรุป) · ไม่เขียน", async () => {
    await needDb(); const b = await paidBooking(); const ctx = staff({ unit: uB }); const n0 = (await evs(b.id)).length;
    codeR(await call("recordTripPayment", ctx, { bookingId: b.id, amountSatang: 100, tender: "CASH", idempotencyKey: `x${hex(6)}` }), "NOT_FOUND", "รับเงิน");
    codeR(await call("tripPaymentIntent", ctx, { bookingId: b.id }), "NOT_FOUND", "QR");
    codeR(await call("requestTripRefund", ctx, { bookingId: b.id, expectedVersion: 0, reasonKind: "CUSTOMER", choice: "MONEY", reason: "ข้ามร้าน", idempotencyKey: `x${hex(6)}` }), "NOT_FOUND", "ยื่น");
    codeR(await call("listTripDues", ctx, { bookingId: b.id }), "NOT_FOUND", "งวด"); codeR(await call("tripMoneySummary", ctx, { bookingId: b.id }), "NOT_FOUND", "สรุป");
    eq([(await evs(b.id)).length, (await reqs(b.id)).length], [n0, 0], "ไม่เขียน");
  });
  await st("X-2", "หน่วยอื่นของร้านเดียวกัน (uA2) ⇒ NOT_FOUND · คำขอคืนเงินของหน่วย A ตัดสิน/ถอน/execute จากร้าน B หรือหน่วย A2 ⇒ NOT_FOUND", async () => {
    await needDb(); const b = await paidBooking(); const r = V(await reqRefund(b), "ยื่น");
    codeR(await call("recordTripPayment", staff({ unit: uA2 }), { bookingId: b.id, amountSatang: 100, tender: "CASH", idempotencyKey: `x${hex(6)}` }), "NOT_FOUND", "หน่วยอื่น");
    for (const ctx of [staff({ unit: uB, now: T23 }), staff({ unit: uA2, now: T23 })]) {
      codeR(await call("decideTripRefund", ctx, { requestId: r.requestId, decision: "APPROVE", idempotencyKey: `x${hex(6)}` }), "NOT_FOUND", "ตัดสิน");
      codeR(await call("withdrawTripRefund", ctx, { requestId: r.requestId, reason: "ข้าม", idempotencyKey: `x${hex(6)}` }), "NOT_FOUND", "ถอน");
      codeR(await call("executeTripRefund", ctx, { requestId: r.requestId, idempotencyKey: `x${hex(6)}` }), "NOT_FOUND", "execute");
    }
    eq((await reqs(b.id))[0]?.status, "QUOTED", "ไม่ขยับ");
  });
  await st("X-3", "listTripRefunds / tripCashDay ของร้าน B ไม่เห็นข้อมูลร้าน A · getTripRefund id ร้าน A ⇒ NOT_FOUND", async () => {
    await needDb(); const b = await paidBooking(); const r = V(await reqRefund(b), "ยื่น");
    const l = V(await call("listTripRefunds", staff({ unit: uB }), {}), "list B");
    ok(!JSON.stringify(l).includes(String(r.requestId)) && !JSON.stringify(V(await call("tripCashDay", staff({ unit: uB }), { businessDate: "2027-03-01" }), "cash B")).includes(b.id), "เห็นข้อมูลร้าน A");
    codeR(await call("getTripRefund", staff({ unit: uB }), { requestId: r.requestId }), "NOT_FOUND", "get");
  });
  groupLine("X");

  // ═══════════════ PM. ผู้กระทำ/สิทธิ์ ═══════════════
  console.log("\n── PM: ผู้กระทำ ──");
  await st("PM-1", "PUBLIC: รับเงิน ⇒ FORBIDDEN · ยื่น ⇒ FORBIDDEN OTP_REQUIRED · ตัดสิน/execute ⇒ FORBIDDEN", async () => {
    await needDb(); const b = await paidBooking(); const r = V(await reqRefund(b), "ยื่น");
    codeR(await call("recordTripPayment", pub(), { bookingId: b.id, amountSatang: 100, tender: "CASH", idempotencyKey: `x${hex(6)}` }), "FORBIDDEN", "รับเงิน");
    codeR(await call("requestTripRefund", pub({ now: T23 }), { bookingId: b.id, expectedVersion: 0, reasonKind: "CUSTOMER", choice: "MONEY", reason: "ลูกค้า", idempotencyKey: `x${hex(6)}` }), "FORBIDDEN", "ยื่น", "OTP_REQUIRED");
    codeR(await call("decideTripRefund", pub({ now: T23 }), { requestId: r.requestId, decision: "APPROVE", idempotencyKey: `x${hex(6)}` }), "FORBIDDEN", "ตัดสิน");
    codeR(await call("executeTripRefund", pub({ now: T23 }), { requestId: r.requestId, idempotencyKey: `x${hex(6)}` }), "FORBIDDEN", "execute");
  });
  await st("PM-2", "AGENT ⇒ FORBIDDEN AGENCY_NOT_ENABLED (รับเงิน · ยื่น) · การจอง collectMode AGENT ⇒ รับเงิน FORBIDDEN AGENCY_NOT_ENABLED", async () => {
    await needDb(); const b = await mkBooking();
    codeR(await call("recordTripPayment", agent(), { bookingId: b.id, amountSatang: 100, tender: "CASH", idempotencyKey: `x${hex(6)}` }), "FORBIDDEN", "AGENT รับเงิน", "AGENCY_NOT_ENABLED");
    codeR(await call("requestTripRefund", agent(), { bookingId: b.id, expectedVersion: 0, reasonKind: "CUSTOMER", choice: "MONEY", reason: "เอเจนซี่", idempotencyKey: `x${hex(6)}` }), "FORBIDDEN", "AGENT ยื่น", "AGENCY_NOT_ENABLED");
    await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'AGENT' WHERE id = $1`, [b.id]); // จำลอง (ร้านชั่วคราว)
    codeR(await pay(b, 100), "FORBIDDEN", "การจองเอเจนซี่", "AGENCY_NOT_ENABLED");
  });
  await st("PM-3", "SYSTEM: ตัดสิน/ถอน/execute คำขอคืนเงิน ⇒ FORBIDDEN (งานตามเวลายื่นได้อย่างเดียว) · SYSTEM ยัง FORBIDDEN บน bookTripsNow (T0.6 คงเดิม)", async () => {
    await needDb(); const b = await paidBooking(); const r = V(await reqRefund(b), "ยื่น");
    codeR(await call("decideTripRefund", sys({ now: T23 }), { requestId: r.requestId, decision: "APPROVE", idempotencyKey: `x${hex(6)}` }), "FORBIDDEN", "ตัดสิน");
    codeR(await call("executeTripRefund", sys({ now: T23 }), { requestId: r.requestId, idempotencyKey: `x${hex(6)}` }), "FORBIDDEN", "execute");
    codeR(await call("bookTripsNow", sys(), {}, {}), ["FORBIDDEN", "VALIDATION"], "bookNow");
  });
  groupLine("PM");

  // ═══════════════ EV. event/audit ═══════════════
  console.log("\n── EV: event · audit ──");
  const PAY_KEYS = ["amountSatang", "bookingId", "dueAt", "dueId"];
  const BK_KEYS = ["amountSatang", "bookingId", "channel", "departureId", "status", "unitId"];
  const RF_KEYS = ["amountSatang", "bookingId", "choice", "requestId"];
  await st("EV-1", "trips.payment.received ต่อแถว RECEIVED · payload คีย์ตรงชุด (dueId bookingId amountSatang dueAt) · คีย์ outbox …:<moneyEventId> · ไม่มีชื่อ/เบอร์/เลขจอง", async () => {
    await needDb(); const b = await mkBooking(); await payOk(b, SHORT); await payOk(b, TOTAL - SHORT);
    const o = await outboxFor("trips.payment.received", b.id); const e = await evs(b.id);
    eq([o.length, o.map((x) => Object.keys(x.payload).sort()), o.map((x) => x.idempotencyKey).sort()], [2, [PAY_KEYS, PAY_KEYS], e.map((x) => `trips.payment.received:${x.id}`).sort()], "event");
    ok(!o.some((x) => JSON.stringify(x.payload).includes(b.code) || /ลูกค้าทดสอบ|08\d{8}/.test(JSON.stringify(x.payload))), "มีข้อมูลบุคคล/เลขจอง");
  });
  await st("EV-2", "สถานะเงิน: HOLD→PAID ยิง confirmed + paid ครั้งเดียว · CONFIRMED→PART_PAID→PAID ยิง part_paid 1 + paid 1 · payload ชุด T0.6 (amountSatang = payable)", async () => {
    await needDb(); const h = await mkBooking({ pay: "PAY_NOW" }); await payOk(h, TOTAL);
    const c = await mkBooking(); await payOk(c, SHORT); await payOk(c, 1_000); await payOk(c, TOTAL - SHORT - 1_000);
    eq([(await outboxFor("trips.booking.confirmed", h.id)).length, (await outboxFor("trips.booking.paid", h.id)).length, (await outboxFor("trips.booking.part_paid", c.id)).length, (await outboxFor("trips.booking.paid", c.id)).length], [1, 1, 1, 1], "จำนวน");
    const p = (await outboxFor("trips.booking.paid", c.id))[0]?.payload ?? {};
    eq([Object.keys(p).sort(), p.amountSatang, p.status], [BK_KEYS, TOTAL, "PAID"], "payload");
  });
  await st("EV-3", "คำขอคืนเงิน: requested · approved · done ครั้งเดียวต่อคำขอ · payload (requestId bookingId amountSatang choice) · DONE ยิง trips.booking.cancelled", async () => {
    await needDb(); const { b, requestId } = await approved(); V(await execute(b, requestId), "execute");
    const got = await Promise.all(["trips.refund.requested", "trips.refund.approved", "trips.refund.done"].map(async (t) => (await outboxFor(t, b.id)).map((x) => [Object.keys(x.payload).sort(), x.payload.requestId, x.payload.amountSatang, x.payload.choice])));
    eq(got, [[[RF_KEYS, requestId, RF88.refundSatang, "MONEY"]], [[RF_KEYS, requestId, RF88.refundSatang, "MONEY"]], [[RF_KEYS, requestId, RF88.refundSatang, "MONEY"]]], "event");
    eq((await outboxFor("trips.booking.cancelled", b.id)).length, 1, "cancelled");
  });
  await st("EV-4", "audit ในธุรกรรมเดียวกัน: trips.payment.record · trips.refund.request/.approve/.execute (targetId · after มีสตางค์/สถานะ/idemKeyHash) · ไม่มีชื่อ/เบอร์", async () => {
    await needDb(); const { b, requestId } = await approved(); V(await execute(b, requestId), "execute");
    const rows = await q<Rec>(`SELECT action, "targetId", after FROM "AuditLog" WHERE "tenantId" = $1 AND ("targetId" = $2 OR "targetId" = $3)`, [tA, b.id, requestId]);
    const acts = new Set(rows.map((r) => String(r.action)));
    const miss = ["trips.payment.record", "trips.refund.request", "trips.refund.approve", "trips.refund.execute"].filter((a) => !acts.has(a));
    ok(miss.length === 0, `ขาด audit: ${miss.join(", ")}`);
    ok(!rows.some((r) => /ลูกค้าทดสอบ|"phone"|08\d{8}/.test(JSON.stringify(r.after))), "มีข้อมูลบุคคลใน audit");
    ok(rows.filter((r) => String(r.action).startsWith("trips.refund.") || r.action === "trips.payment.record").every((r) => typeof asRec(r.after)?.idemKeyHash === "string"), "after ไม่มี idemKeyHash");
  });
  await st("EV-5", "tripMoneySummary: เอกสาร 13ค (995,000 · 929,907 · 65,093 · 150,000 · 1,145,000) · paid/outstanding · taxDocument.status NOT_ISSUED (ยังไม่ออกใบกำกับ · T0.7b)", async () => {
    await needDb(); const b = await mkBooking(); await payOk(b, SHORT);
    const v = V(await call("tripMoneySummary", staff(), { bookingId: b.id }), "summary"); const d = asRec(v.document) ?? {};
    eq([d.serviceInclVatSatang, d.preVatSatang, d.vatSatang, d.passThroughSatang, d.totalSatang, v.paidSatang, v.outstandingSatang, asRec(v.taxDocument)?.status],
      [VATABLE, RC.preVatSatang, VAT_DOC, PARK, TOTAL, SHORT, TOTAL - SHORT, "NOT_ISSUED"], "สรุป");
    ok(!/ใบกำกับภาษี/.test(JSON.stringify(v)) || asRec(v.taxDocument)?.status === "NOT_ISSUED", "แสดงว่าเป็นใบกำกับ");
  });
  groupLine("EV");

  // ═══════════════ JB. งานงวด (ร้าน tJ เท่านั้น) ═══════════════
  console.log("\n── JB: งาน trips.paymentDue ──");
  const runJob = async (now: string | Date) => call("runPaymentDue", new Date(now), { tenantIds: [tJ] });
  await st("JB-1", "NOTIFY_SHOP (ค่าเริ่ม): CONFIRMED ค้างจ่าย · ก่อน dueAt + 24 ชม. (X11) ไม่ทำอะไร · หลัง ⇒ งวด OVERDUE + trips.payment.overdue ครั้งเดียว · ไม่มีคำขอคืนเงิน · รันซ้ำไม่ยิงซ้ำ", async () => {
    await needDb(); const b = await mkBooking({ key: "J" }); const due = new Date(String((await dues(b.id))[0]?.dueAt));
    await runJob(new Date(due.getTime() + 23 * 3_600_000)); eq((await dues(b.id))[0]?.status, "OPEN", "ก่อนผ่อนผัน");
    await runJob(new Date(due.getTime() + 25 * 3_600_000)); await runJob(new Date(due.getTime() + 26 * 3_600_000));
    eq([(await dues(b.id))[0]?.status, (await outboxFor("trips.payment.overdue", b.id, tJ)).length, (await reqs(b.id)).length], ["OVERDUE", 1, 0], "เลยกำหนด");
  });
  await st("JB-2", "เตือนงวด (T16 [7,1] ของหน่วย): งวด BALANCE 21 มี.ค. 23:59 · 6 วันก่อน ⇒ due_soon d=7 ครั้งเดียว · 12 ชม.ก่อน ⇒ d=1 · รันซ้ำไม่ยิงซ้ำ · คีย์ <dueId>:<d>", async () => {
    await needDb(); const b = await mkBooking({ key: "JD" }); await payOk(b, DEP30); /* ORACLE-EDIT JB-2 (ผู้คุม 13 พ.ย.): มติ V1 — การจองที่มีคำขอคืนเงินเปิดอยู่ไม่ถูกเตือน ⇒ จ่ายมัดจำก่อน (แบบ JB-3) */ const d2 = (await dues(b.id))[1] ?? {}; const due = new Date(String(d2.dueAt));
    await runJob(new Date(due.getTime() - 6 * 86_400_000)); await runJob(new Date(due.getTime() - 6 * 86_400_000 + 60_000));
    await runJob(new Date(due.getTime() - 12 * 3_600_000));
    const o = (await outboxFor("trips.payment.due_soon", b.id, tJ)).filter((x) => x.payload.dueId === d2.id);
    eq(o.map((x) => x.idempotencyKey).sort(), [`trips.payment.due_soon:${d2.id}:1`, `trips.payment.due_soon:${d2.id}:7`], "เตือน");
  });
  await st("JB-3", "AUTO_RELEASE (T17 จาก snapshot): จ่ายมัดจำแล้ว งวด 2 เลยกำหนด ⇒ OVERDUE + คำขอคืนเงิน SYSTEM (by SYSTEM · CUSTOMER · MONEY · QUOTED) ครั้งเดียว · ไม่ปล่อยที่ · การจองยัง PART_PAID", async () => {
    await needDb(); const b = await mkBooking({ key: "JD" }); await payOk(b, DEP30); const d0 = await depRow(b.dep);
    const due = new Date(String((await dues(b.id))[1]?.dueAt));
    await runJob(new Date(due.getTime() + 25 * 3_600_000)); await runJob(new Date(due.getTime() + 27 * 3_600_000));
    const rq = await reqs(b.id);
    eq([(await dues(b.id))[1]?.status, rq.length, rq[0]?.by, rq[0]?.reasonKind, rq[0]?.choice, rq[0]?.status, (await bk(b.id)).status, await depRow(b.dep)], ["OVERDUE", 1, "SYSTEM", "CUSTOMER", "MONEY", "QUOTED", "PART_PAID", d0], "ผล");
  });
  await st("JB-4", "งานไม่แตะการจอง HOLD (ใช้เวลาของ hold) และการจองที่จ่ายครบ · ตัวกรอง tenantIds: ร้าน A ไม่ถูกแตะ", async () => {
    await needDb(); const h = await mkBooking({ key: "J", pay: "PAY_NOW" }); const p = await mkBooking({ key: "J" }); await payOk(p, TOTAL);
    const a = await mkBooking(); await runJob("2027-06-30T00:00:00.000Z");
    eq([(await dues(h.id))[0]?.status, (await dues(p.id))[0]?.status, (await dues(a.id))[0]?.status], ["OPEN", "PAID", "OPEN"], "ไม่แตะ");
  });
  await st("JB-5", "runPaymentDue เคารพ signal ที่ยกเลิกแล้ว (ไม่ทำงาน · ไม่ throw) · คืน {reminders, overdue, autoReleased, failed}", async () => {
    await needDb(); const ac = new AbortController(); ac.abort();
    const r = await call("runPaymentDue", new Date("2027-07-30T00:00:00.000Z"), { tenantIds: [tJ], signal: ac.signal });
    ok(r.ok !== "THROW" && "overdue" in r && "reminders" in r && "autoReleased" in r && Array.isArray(r.failed), `รูปผล ${fmt(r)}`);
    eq(r.overdue, 0, "ทำงานทั้งที่ยกเลิก");
  });
  groupLine("JB");

  // ═══════════════ LT. ตัวกวาด (ร้าน A เท่านั้น · ท้ายไฟล์) ═══════════════
  console.log("\n── LT: รับเงิน ∥ ตัวกวาด ──");
  await st("LT-1", "รับเงิน (ก่อนหมด 30 วิ) ∥ runExpireHolds (หลังหมด 30 วิ · tenantIds [A]) บน 8 การจอง HOLD ⇒ PAID+CONVERTED+เงิน 1 แถว หรือ EXPIRED+ไม่มีเงิน · ไม่มี THROW/BUSY", async () => {
    await needDb(); const dep = await mkDep("2027-04-20", "A", 40); const bs: Bk[] = [];
    for (let i = 0; i < 8; i++) bs.push(await mkBooking({ dep, pay: "PAY_NOW" }));
    const exp = new Date(String((await q<Rec>(`SELECT "expiresAt" FROM "TripHold" WHERE "bookingId" = $1`, [bs[0]!.id]))[0]?.expiresAt));
    const [rs] = await withTimer(Promise.all([Promise.all(bs.map((b) => pay(b, TOTAL, { now: new Date(exp.getTime() - 30_000) }))), call("runExpireHolds", new Date(exp.getTime() + 30_000), { tenantIds: [tA] })]), 120_000, "LT-1");
    ok(!rs.some(badOutcome), `ผลเสีย ${fmt(rs.find(badOutcome))}`);
    for (const b of bs) { const row = await bk(b.id); const n = (await evs(b.id)).length; ok((row.status === "PAID" && n === 1) || (row.status === "EXPIRED" && n === 0), `${b.id.slice(-6)} ${row.status}/${n}`); }
    await seatInv(dep, "LT-1");
  });
  await st("LT-2", "การจอง HOLD ที่มีโค้ดส่วนลดหมดเวลา ⇒ trips.booking.expired.amountSatang = payable ของ snapshot (ไม่ใช่ grossSatang)", async () => {
    await needDb(); const code = `L7${hex(2)}`.toUpperCase();
    await insertRow("TripPriceRule", { id: rid("ru"), tenantId: tA, unitId: uA, productId: null, kind: "PROMO_CODE", code, params: JSON.stringify({ kind: "PROMO_CODE", code, discountBp: 1_000, maxUses: 10 }), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });
    const b = await mkBooking({ pay: "PAY_NOW", promo: code }); ok(b.payable < TOTAL, "ส่วนลดไม่เกิด");
    await call("runExpireHolds", addMin(NOW0, 30), { tenantIds: [tA] });
    const o = (await outboxFor("trips.booking.expired", b.id))[0]?.payload ?? {};
    eq([(await bk(b.id)).status, o.amountSatang], ["EXPIRED", b.payable], "payload");
  });
  groupLine("LT");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); await dropControlTables(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0 = 0, t0 = 0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T0.7a · เงินฝั่ง trips · งวด · รับเงิน · QR · คืนเงินเป็นขั้นตอน =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
