// QC — TRIPS T1.8a · ข้อความถึงลูกค้าทริปผ่าน notifyCustomer (ยืนยัน · เตือนวันก่อนเดินทาง · งวดจ่าย) + แม่แบบ/ด่าน/ตัวอย่าง + รายการข้อความต่อการจอง
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/T1.8.md รอบ 1 (§3 ไฟล์/งบ · §4 พฤติกรรม · §4.10 หน้าสัมผัส · มติ C-1..C-12 · R1–R10)
//
// กลุ่ม (ป้ายระดับในชื่อข้อ: [pure] [service] [job] [action] [page] [code]):
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน)   S ขอบเขต/กติกาโค้ด (รันได้วันนี้)
//   P บริสุทธิ์   GW ประตู platform   C ยืนยัน   M เตือนวันก่อนเดินทาง   D งวดจ่าย   R ผู้รับ (R1)   X PDPA   E ซ้ำ/พร้อมกัน
//   J งาน (ลองซ้ำ · จังหวะ)   G ไม่ส่งของใบอื่น   T แม่แบบ   L รายการข้อความต่อการจอง   PF SQL/EXPLAIN
//   กลุ่มฟีเจอร์ที่ยังไม่มีของ ⇒ แดงข้อเดียว "<กลุ่ม>-0 ยังไม่สร้าง" (ไม่รันข้อย่อย)
//
// 🔴 ไม่มีข้อความจริงออกไปเด็ดขาด (แบบ qc-svc-b.9.mts:142–175): ตัวจำลอง LINE node:http 127.0.0.1 + LINE_API_BASE + ครอบ fetch (โฮสต์นอกเครื่อง ⇒ 503 + จด)
//    + ด่าน: APP_ENV ≠ production · LINE_API_BASE ชี้ 127.0.0.1 · การเชื่อมต่อ LINE ของร้านทดสอบทุกแถวมี token ขึ้นต้น `qct18tok` (ไม่ใช่ token จริง)
//    ตัวส่งจริงของแชทใช้ LINE_API_BASE เฉพาะเมื่อไม่ใช่ prod และขึ้นต้น http://127.0.0.1: (chat/line.ts:15–26)
// 🔴 นาฬิกา: [service]/[job] ส่ง now จำลองเสมอ · NOW0 = 2027-03-01 10:00 เวลาไทย · รอบ D1 = 2027-03-02 08:00 · งานเรียกด้วย tenantIds เสมอ
// 🔴 ร้านชั่วคราว slug `trips-t18-*` · ลบใน finally + กวาดค้างตอนเริ่ม · ค่าคาดหวังคิดเองจากฟิกซ์เจอร์
// 🔴 ฟิกซ์เจอร์ย่อ: การจอง "ช่องทางสาธารณะ" สร้างด้วย bookTripsNow (STAFF) แล้วตั้ง channel = 'WEB' ตรงในฐาน (การจับคู่ Party จากเบอร์ที่พิมพ์เกิดจริงใน bookTripsNow)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t1.8.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import { changedOnlyByMainMerge, fromMainMerge } from "./trips-main-merge.mjs";

const LABEL = "qc-trips-t1.8";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Rec = Record<string, unknown>;
type AnyFn = (...a: unknown[]) => unknown;

// ═══════════════ ตัวจำลอง LINE + ครอบ fetch (คัดแบบ qc-svc-b.9.mts:142–175) ═══════════════
type FakeReq = { method: string; path: string; json: Any; token: string; retryKey: string; status: number };
const FAKE: FakeReq[] = [];
let FAKE_MODE: "ok" | "429" | "500" = "ok";
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: Any = null;
    if (String(req.headers["content-type"] ?? "").includes("json")) { try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; } }
    const rec: FakeReq = { method: req.method ?? "", path, json, token: String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""), retryKey: String(req.headers["x-line-retry-key"] ?? ""), status: 0 };
    FAKE.push(rec);
    const send = (code: number, obj: unknown) => { rec.status = code; if (res.writableEnded) return; res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.method === "POST" && path === "/v2/bot/message/push") {
      if (FAKE_MODE === "429") return send(429, { message: "quota" });
      if (FAKE_MODE === "500") return send(500, { message: "err" });
      return send(200, { sentMessages: [{ id: `fm${FAKE.length}` }] });
    }
    if (req.method === "GET" && path.startsWith("/v2/bot/profile/")) return send(200, { displayName: "ลูกค้าคิวซี", userId: path.split("/").pop() });
    return send(200, {});
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const FAKE_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const ENV_SAVED: Record<string, string | undefined> = {};
const envSet = (k: string, v: string) => { if (!(k in ENV_SAVED)) ENV_SAVED[k] = process.env[k]; process.env[k] = v; };
envSet("LINE_API_BASE", FAKE_BASE);
envSet("APP_URL", "https://qc-trips.invalid"); // ลิงก์เต็มของข้อความ · โดเมน .invalid ไม่มีวันออกเน็ต
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) envSet("SESSION_SECRET", `qc-t18-${randomBytes(24).toString("hex")}`);
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by qc" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const mark = () => FAKE.length;
const pushesSince = (m: number) => FAKE.slice(m).filter((r) => r.path === "/v2/bot/message/push");
const textOf = (r: FakeReq): string => { const m = r.json?.messages?.[0]; return typeof m?.text === "string" ? m.text : typeof m?.altText === "string" ? m.altText : ""; };

// ═══════════════ ตัวนับคำสั่ง SQL (แบบ qc-trips-t1.7a2 PF-3) ═══════════════
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
let sqlLog: string[] = [];
let counting = false;
const qcPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [{ emit: "event", level: "query" }] });
(qcPrisma as unknown as { $on: (e: string, cb: (ev: { query: string }) => void) => void }).$on("query", (ev) => { if (counting) sqlLog.push(ev.query); });
(globalThis as unknown as { prisma?: unknown }).prisma = qcPrisma;
const realSql = () => sqlLog.filter((x) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET|SAVEPOINT|RELEASE)\b/i.test(x));
const capture = async <T,>(f: () => Promise<T>): Promise<{ r: T; sql: string[] }> => { sqlLog = []; counting = true; try { const r = await f(); return { r, sql: realSql() }; } finally { counting = false; } };

// ═══════════════ harness ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 300); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string) => {
  cks.push({ id, res, why });
  console.log(`  ${res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ "} [${id}] ${name}${res !== "PASS" && why ? ` — ${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); record(id, name, "PASS", ""); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`); }
};
/** กลุ่มฟีเจอร์: ของที่ต้องมีขาด ⇒ แดงข้อเดียว `<g>-0` "ยังไม่สร้าง" แล้วข้ามทั้งกลุ่ม */
const group = async (g: string, title: string, need: () => string | null, body: () => Promise<void>) => {
  console.log(`\n── ${g}: ${title} ──`);
  const miss = need();
  if (miss) { record(`${g}-0`, `${title} — ยังไม่สร้าง`, "FAIL", `ยังไม่สร้าง (not built): ${miss}`); return; }
  try { await body(); } catch (e) { record(`${g}-X`, "กลุ่มล้มกลางทาง", "FAIL", errMsg(e)); }
};
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => { try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const rid = (p: string) => `t18qc${p}${Date.now().toString(36)}${hex(3)}`.toLowerCase();
const SLUG = "trips-t18-";
const EMAIL_PREFIX = "trips-t18-";
const TOKEN_PREFIX = "qct18tok";
const HOUR = 3_600_000, MIN = 60_000;
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const JST = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`);
const TH_PHONE_RE = /(\+?66|0)[689]\d{8}/; // = notify-customer.ts:90
const walk = (rel: string): string[] => {
  const abs = join(ROOT, rel); if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const n of readdirSync(abs)) { const p = join(rel, n); if (statSync(join(ROOT, p)).isDirectory()) out.push(...walk(p)); else out.push(p); }
  return out;
};

// ═══════════════ สเปก (ใบสั่ง §3) ═══════════════
const GATE = "src/lib/platform/notify-customer.ts";
const DEFS = "src/lib/core/settings/defs/trips.ts";
const NCORE = "src/lib/modules/trips/notify-core.ts";
const NSVC = "src/lib/modules/trips/notify.ts";
const JOBS = "src/lib/modules/trips/jobs.ts";
const MANI = "src/lib/modules/trips/manifest.ts";
const TSET = "src/lib/modules/trips/trips-settings.ts";
const BSCR = "src/lib/modules/trips/booking-screens.ts";
const FACADE = "src/lib/modules/trips/index.ts";
const CONSUMERS = "src/lib/outbox-consumers.ts";
const MINUTE = "src/lib/platform/minute-jobs.ts";
const DRAWER = "src/components/trips/BookingDrawer.tsx";
const PREVIEW = "src/components/trips/TripsMsgPreview.tsx";
const TSCREEN = "src/components/trips/TripsSettings.tsx";
const MSG_TH = "src/messages/th/trips.json", MSG_EN = "src/messages/en/trips.json";
/** [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด] */
const LIMITED: [string, number, number][] = [[GATE, 4, 30], [DEFS, 4, 8], [NCORE, 0, 220], [NSVC, 0, 340], [JOBS, 2, 140], [MANI, 2, 30], [TSET, 2, 25], [BSCR, 2, 40], [FACADE, 0, 8],
  [CONSUMERS, 2, 4], [MINUTE, 0, 8], [DRAWER, 2, 45], [PREVIEW, 0, 90], [TSCREEN, 2, 15], [MSG_TH, 0, 30], [MSG_EN, 0, 30]];
const NEW_FILES = [NCORE, NSVC, PREVIEW];
const KINDS_A = ["confirmation", "reminder1Day", "paymentDue"] as const;
const OTHER_KINDS = ["docsMissing", "pickupInfo", "departureChanged", "waitlistOffer", "abandonedBooking", "refunded", "reviewRequest"] as const;
const NOW0 = BKK("2027-03-01", "10:00");
const D1 = "2027-03-02", D5 = "2027-03-05";

// ═══════════════ pg + ร้านชั่วคราว ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (t: string) => { if (!colCache.has(t)) colCache.set(t, await q<ColRow>(`SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [t])); return colCache.get(t) ?? []; };
async function insertRow(table: string, vals: Rec): Promise<string> {
  const c0 = await cols(table); if (!c0.length) throw new AssertFail(`ยังไม่มีตาราง ${table}`);
  const v: Rec = { ...vals }; const names = new Set(c0.map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of c0) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (c.column_name === "updatedAt" || c.column_name === "createdAt") { v[c.column_name] = new Date(); continue; }
    if (t === "text" || t.startsWith("character")) { v[c.column_name] = `qc${hex(4)}`; continue; }
    if (t === "USER-DEFINED") { v[c.column_name] = (await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid WHERE ty.typname = $1 ORDER BY e.enumsortorder LIMIT 1`, [c.udt_name]))[0]?.l ?? null; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? "2027-01-01 00:00:00" : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id ?? "");
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  let pending = (await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t).filter((t) => t !== "Tenant");
  for (let pass = 0; pass < 14 && pending.length; pass++) { const next: string[] = []; for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } } pending = next; }
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])).map((r) => r.id);
  if (!us.length) return;
  for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* */ } }
  await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
}
const tenantIds: string[] = [];
let exitCode = 1;

try {
  try { const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id); if (stale.length) await cleanupTenants(stale); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  const TRI = await tryImport("@/lib/modules/trips"), TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const GWI = await tryImport("@/lib/platform/notify-customer");
  const CHI = await tryImport("@/lib/modules/chat");
  const PTI = await tryImport("@/lib/modules/party");
  const DBI = await tryImport("@/lib/core/db");
  const NCI = existsSync(join(ROOT, NCORE)) ? await tryImport("@/lib/modules/trips/notify-core") : { mod: null, err: "ไม่มีไฟล์" };
  const prisma = asRec(DBI.mod?.prisma) as Any;
  const fnOf = (m: { mod: Rec | null; err: string }, n: string): AnyFn | null => (typeof m.mod?.[n] === "function" ? (m.mod[n] as AnyFn) : null);
  const call = async (m: { mod: Rec | null; err: string }, n: string, ...a: unknown[]): Promise<Rec> => {
    const f = fnOf(m, n); if (!f) throw new AssertFail(`ไม่มี ${n} (${m.err.slice(0, 80)})`);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };

  // ═══════════════ ฟิกซ์เจอร์ ═══════════════
  const tA = rid("ta"), tB = rid("tb"), uA = rid("ua"), uT = rid("ut"), uB = rid("ub"), SA = `${SLUG}${STAMP}-a`;
  const OWNER: Rec = {}, OWNER_B: Rec = {};
  let ownerUser = "", staffNoPerm = "";
  const PRD: Record<string, { id: string; opt: string; unit: string; adult: string }> = {};
  const DEP: Record<string, string> = {};
  const PTY: Record<string, string> = {};
  const CC: Record<string, string> = {};
  const BK: Record<string, string> = {};
  let conn = "", sysChat = "", connB = "";
  const VICTIM_PHONE = `08${String(10_000_000 + (parseInt(hex(3), 16) % 89_999_999)).slice(0, 8)}`;
  const NAMES: string[] = [], PHONES: string[] = [VICTIM_PHONE];
  let setupErr = "";
  const setV = async (changes: Rec[], tenant = tA, actor: Rec = OWNER) => {
    const f = fnOf(SETI, "setSettings"); if (!f) throw new AssertFail("ไม่มี setSettings");
    const r = asRec(await f(actor, { tenantId: tenant }, changes, { ackLegalWarn: true })) ?? {};
    if (r.ok !== true) throw new AssertFail(`setSettings: ${fmt(r)}`);
  };
  const mkProd = async (key: string, unit: string, tenant: string, title: Rec) => {
    const id = rid(`p${key}`), opt = rid(`o${key}`);
    await insertRow("TripProduct", { id, tenantId: tenant, unitId: unit, slug: `t18qc-${key.toLowerCase()}-${STAMP}`, productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify(title),
      body: JSON.stringify({ summary: { th: `สรุป ${key}` } }), currency: "THB", deepDive: false, crossBorder: false, publishedAt: new Date("2027-01-01T00:00:00Z"), updatedAt: new Date() });
    await insertRow("TripOption", { id: opt, tenantId: tenant, unitId: unit, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
    const adult = await insertRow("TripPaxType", { id: rid("pt"), tenantId: tenant, unitId: unit, productId: id, code: "ADULT", label: JSON.stringify({ th: "ผู้ใหญ่", en: "Adult" }), ageMin: 12, ageMax: null, countsCapacity: true, active: true, sortOrder: 0, updatedAt: new Date() });
    await insertRow("TripPrice", { id: rid("pr"), tenantId: tenant, unitId: unit, productId: id, optionId: null, paxTypeId: adult, cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: 150_000, weekdayMask: null, priority: 0, updatedAt: new Date() });
    PRD[key] = { id, opt, unit, adult };
  };
  const mkDep = async (tag: string, key: string, tenant: string, startsAt: Date, localDate: string, status = "OPEN") => {
    const p = PRD[key]; const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate, startsAt, endsAt: new Date(startsAt.getTime() + 8 * HOUR),
      status, capacity: 40, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    DEP[tag] = id; return id;
  };
  const staffCtx = (unit: string, tenant = tA, actorId = ownerUser) => ({ tenantId: tenant, unitId: unit, channel: "COUNTER", actor: { kind: "STAFF", userId: actorId }, now: new Date(NOW0.getTime() - HOUR) });
  /** ขายจริงผ่าน bookTripsNow (STAFF · PAY_LATER ⇒ CONFIRMED) · booker = { partyId } หรือ { name, phone } */
  const book = async (tag: string, key: string, depTag: string, booker: Rec, tenant = tA) => {
    const p = PRD[key]; const ctx = staffCtx(p.unit, tenant, tenant === tA ? ownerUser : String(OWNER_B.userId));
    const line = { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: DEP[depTag], optionId: p.opt, pax: [{ paxTypeId: p.adult, qty: 2 }] };
    const qt = await call(TRI, "quoteTrips", ctx, { lines: [line] }); const qv = asRec(qt.value);
    ok(qt.ok === true && qv, `quoteTrips ${tag}: ${fmt(qt)}`);
    const r = await call(TRI, "bookTripsNow", ctx, { idempotencyKey: `t18_${tag}_${hex(6)}`, quoteId: qv?.quoteId, quoteExpiresAt: qv?.expiresAt, booker, pay: { method: "PAY_LATER" }, quote: { lines: [line] } });
    ok(r.ok === true, `bookTripsNow ${tag}: ${fmt(r)}`);
    const b = asArr(r.value)[0]; BK[tag] = String(b?.bookingId ?? ""); ok(BK[tag], `ไม่มี bookingId ${tag}`);
    return BK[tag];
  };
  const contact = async (tag: string, partyId: string | null, lang: string | null, extra: Rec = {}, tenant = tA, c = conn) => {
    const row = await prisma.chatContact.create({ data: { tenantId: tenant, systemId: sysChat, channel: "LINE", channelConnectionId: c, externalUserId: `Uqct18${tag}${hex(8)}`, partyId, lang, ...extra } });
    CC[tag] = row.id; return row.id;
  };
  const linkCode = async (bookingId: string, ccId: string, purpose = "TRIP_BOOKING") =>
    insertRow("ChatLinkCode", { id: rid("lc"), tenantId: tA, connectionId: conn, purpose, refId: bookingId, codeHash: hex(16), codeLast4: "0000", expiresAt: new Date(NOW0.getTime() + 24 * HOUR), usedAt: new Date(NOW0.getTime() - HOUR), usedByChatContactId: ccId, createdAt: new Date() });
  try {
    if (!prisma) throw new AssertFail(`ไม่มี prisma (${DBI.err})`);
    await insertRow("Tenant", { id: tA, name: "ร้านทดสอบ T1.8", slug: SA, status: "ACTIVE", updatedAt: new Date() }); tenantIds.push(tA);
    await insertRow("Tenant", { id: tB, name: "ร้านทดสอบ T1.8 B", slug: `${SLUG}${STAMP}-b`, status: "ACTIVE", updatedAt: new Date() }); tenantIds.push(tB);
    await insertRow("BusinessUnit", { id: uA, tenantId: tA, type: "TRIPS", status: "ACTIVE", name: "หน่วยภูเก็ต", slug: `${SLUG}a-${STAMP}`, settings: JSON.stringify({ timezone: "Asia/Bangkok" }), updatedAt: new Date() });
    await insertRow("BusinessUnit", { id: uT, tenantId: tA, type: "TRIPS", status: "ACTIVE", name: "หน่วยโอกินาวา", slug: `${SLUG}t-${STAMP}`, settings: JSON.stringify({ timezone: "Asia/Tokyo" }), updatedAt: new Date() });
    await insertRow("BusinessUnit", { id: uB, tenantId: tB, type: "TRIPS", status: "ACTIVE", name: "หน่วย B", slug: `${SLUG}b-${STAMP}`, settings: JSON.stringify({ timezone: "Asia/Bangkok" }), updatedAt: new Date() });
    for (const [t, holder, key] of [[tA, OWNER, "o"], [tB, OWNER_B, "ob"]] as const) {
      const u = rid(`u${key}`);
      await insertRow("User", { id: u, email: `${EMAIL_PREFIX}${key}-${STAMP}@qc.invalid`, name: "ผู้ทดสอบ", updatedAt: new Date() });
      await insertRow("Membership", { id: rid("mb"), userId: u, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
      Object.assign(holder, { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: u });
      if (key === "o") ownerUser = u;
      await insertRow("PaymentProfile", { id: rid("pp"), tenantId: t, promptpayId: "0812345678", displayName: `ร้าน T18 ${STAMP}`, updatedAt: new Date() });
    }
    staffNoPerm = rid("us");
    await insertRow("User", { id: staffNoPerm, email: `${EMAIL_PREFIX}s-${STAMP}@qc.invalid`, name: "พนักงานทดสอบ", updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mb"), userId: staffNoPerm, tenantId: tA, role: "STAFF", unitAccess: JSON.stringify([uA]), permissions: JSON.stringify({ "trips.booking.view": true }), acceptedAt: new Date(), updatedAt: new Date() });
    await mkProd("R", uA, tA, { th: "ทริปราชา {ลิงก์} ทดสอบ", en: "Racha {ลิงก์} trip" }); // วงเล็บปีกกาในชื่อสินค้า (ต้องไม่ถูกแทนค่า)
    await mkProd("T", uT, tA, { th: "ทริปโอกินาวา", en: "Okinawa trip" });
    await mkProd("B", uB, tB, { th: "ทริปร้าน B", en: "Shop B trip" });
    await mkDep("D1", "R", tA, BKK(D1, "08:00"), D1); await mkDep("D5", "R", tA, BKK(D5, "08:00"), D5);
    await mkDep("DT", "T", tA, JST(D1, "08:00"), D1); await mkDep("DB", "B", tB, BKK(D1, "08:00"), D1);
    // LINE OA (ตัวจำลอง) + ผู้ติดต่อ (แบบ qc-svc-b.9:407–441)
    sysChat = (await prisma.appSystem.create({ data: { tenantId: tA, type: "CHAT", name: `qc-t18-chat-${STAMP}` } })).id;
    conn = (await prisma.chatChannelConnection.create({ data: { tenantId: tA, systemId: sysChat, type: "LINE", displayName: `qc-t18-a-${STAMP}`, externalAccountId: `qc-t18-a-${STAMP}`, credentials: { channelAccessToken: `${TOKEN_PREFIX}A${hex(6)}`, channelSecret: `qct18secA${hex(6)}` }, meta: { basicId: "@qct18a" } } })).id;
    const sysB = (await prisma.appSystem.create({ data: { tenantId: tB, type: "CHAT", name: `qc-t18-chat-b-${STAMP}` } })).id;
    connB = (await prisma.chatChannelConnection.create({ data: { tenantId: tB, systemId: sysB, type: "LINE", displayName: `qc-t18-b-${STAMP}`, externalAccountId: `qc-t18-b-${STAMP}`, credentials: { channelAccessToken: `${TOKEN_PREFIX}B${hex(6)}`, channelSecret: `qct18secB${hex(6)}` }, meta: { basicId: "@qct18b" } } })).id;
    const msgSet = (t: string, u: string, c: string) => [
      { key: "messaging.lineConnectionId", scope: "UNIT", scopeId: u, value: c },
      { key: "messaging.quietHours", scope: "UNIT", scopeId: u, value: { start: "21:00", end: "08:00" } },
      { key: "messaging.channelOrder", scope: "UNIT", scopeId: u, value: ["LINE", "WEB_LINK"] },
    ].map((x) => ({ ...x, _t: t }));
    await setV(msgSet(tA, uA, conn).map(({ _t, ...x }) => x)); await setV(msgSet(tA, uT, conn).map(({ _t, ...x }) => x));
    await setV(msgSet(tB, uB, connB).map(({ _t, ...x }) => x), tB, OWNER_B);
    // Party: P1 (th) · P2 (en) · P3 (ไม่มี LINE) · P4 (บล็อก) · PV (เจ้าของเบอร์จริง มี LINE · R1) · POLD (ถูกรวมเข้า P1)
    const mkParty = async (tag: string, phone?: string) => { const name = `คุณ${tag}ทดสอบ${STAMP}`; NAMES.push(name); const id = await insertRow("Party", { id: rid("py"), tenantId: tA, kind: "PERSON", name, ...(phone ? { phone, phoneNorm: phone } : {}), updatedAt: new Date() }); PTY[tag] = id; return id; };
    for (const t of ["P1", "P2", "P3", "P4", "POLD"]) await mkParty(t);
    const pv = await call(PTI, "safeFindOrCreate", tA, { name: `คุณจริงทดสอบ${STAMP}`, phone: VICTIM_PHONE }); NAMES.push(`คุณจริงทดสอบ${STAMP}`);
    PTY.PV = typeof (pv as Any) === "string" ? (pv as Any) : String((pv as Any)?.id ?? "");
    if (!PTY.PV) { const r = await q<{ id: string }>(`SELECT id FROM "Party" WHERE "tenantId" = $1 AND name = $2`, [tA, `คุณจริงทดสอบ${STAMP}`]); PTY.PV = r[0]?.id ?? ""; }
    ok(PTY.PV, "สร้าง Party เจ้าของเบอร์ไม่ได้");
    await pool.query(`UPDATE "Party" SET "mergedIntoId" = $2 WHERE id = $1`, [PTY.POLD, PTY.P1]);
    await contact("C1", PTY.P1, "th"); await contact("C2", PTY.P2, "en"); await contact("C4", PTY.P4, "th", { blockedAt: new Date("2027-01-01T00:00:00Z") });
    await contact("CV", PTY.PV, "th"); await contact("CX", null, "en"); await contact("CO", PTY.POLD, "th");
    // การจอง: K1 (P1 หน้าร้าน) · K2 (P2 หน้าร้าน) · K3 (P3) · K4 (P4) · KM (POLD = Party ที่ถูกรวม) · KW (เว็บ พิมพ์เบอร์ของ PV) · KL (เว็บ + รหัสผูก CX) · KT (หน่วยโตเกียว) · KB (ร้าน B)
    for (const [tag, party] of [["K1", "P1"], ["K2", "P2"], ["K3", "P3"], ["K4", "P4"], ["KM", "POLD"]] as const) await book(tag, "R", "D1", { name: `คุณ${party}ทดสอบ${STAMP}`, partyId: PTY[party] });
    await book("KW", "R", "D1", { name: `คนพิมพ์เบอร์ ${STAMP}`, phone: VICTIM_PHONE }); NAMES.push(`คนพิมพ์เบอร์ ${STAMP}`);
    await book("KL", "R", "D1", { name: `ลูกค้าเว็บ ${STAMP}`, phone: `06${hex(4).replace(/\D/g, "1").slice(0, 8).padEnd(8, "2")}` }); NAMES.push(`ลูกค้าเว็บ ${STAMP}`);
    await pool.query(`UPDATE "TripBooking" SET channel = 'WEB' WHERE id = ANY($1::text[])`, [[BK.KW, BK.KL]]);
    await linkCode(BK.KL, CC.CX);
    await book("KT", "T", "DT", { name: `คุณP1ทดสอบ${STAMP}`, partyId: PTY.P1 });
    // การจองทั้งหมดสร้าง "เมื่อวาน" ตามนาฬิกาจำลอง (ก่อนจุดเตือน)
    await pool.query(`UPDATE "TripBooking" SET "createdAt" = $2 WHERE "tenantId" = $1`, [tA, new Date(NOW0.getTime() - 20 * HOUR)]);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const needFx = () => ok(!setupErr && BK.K1, `ไม่มีฟิกซ์เจอร์ (${setupErr || "ยังไม่ตั้ง"})`);
  const logRows = async (tenant = tA) => q<{ dedupeKey: string; status: string; messageKey: string; domain: string; partyId: string | null; at: Date }>(`SELECT "dedupeKey", status, "messageKey", domain, "partyId", at FROM "ServiceMessageLog" WHERE "tenantId" = $1 ORDER BY at`, [tenant]);
  const tripRows = async () => (await logRows()).filter((r) => r.domain === "trips");

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "[service] ฟิกซ์เจอร์: 2 ร้าน · หน่วย Bangkok/Tokyo · การจอง 8 รายการ CONFIRMED · ผู้ติดต่อ LINE 6 ราย", async () => {
    needFx();
    const rows = await q<{ id: string; status: string; channel: string }>(`SELECT id, status, channel FROM "TripBooking" WHERE id = ANY($1::text[])`, [Object.values(BK)]);
    eq(rows.length, 8, "จำนวนการจอง"); ok(rows.every((r) => r.status === "CONFIRMED"), `สถานะ: ${fmt(rows.map((r) => r.status))}`);
    eq(rows.filter((r) => r.channel === "WEB").length, 2, "การจองช่องทางเว็บ");
  });
  await st("PC-2", "[service] ด่านความปลอดภัย: APP_ENV ≠ production · LINE_API_BASE = ตัวจำลอง 127.0.0.1 · การเชื่อมต่อ LINE ของร้านทดสอบทุกแถว token ขึ้นต้น qct18tok", async () => {
    ok(process.env.APP_ENV !== "production" && process.env.VERCEL_ENV !== "production", "production");
    ok(process.env.LINE_API_BASE === FAKE_BASE && FAKE_BASE.startsWith("http://127.0.0.1:"), "LINE_API_BASE");
    const cs = await prisma.chatChannelConnection.findMany({ where: { tenantId: { in: tenantIds } }, select: { credentials: true, type: true } });
    ok(cs.length >= 2, "ไม่มีการเชื่อมต่อทดสอบ");
    for (const c of cs) ok(String(asRec(c.credentials)?.channelAccessToken ?? "").startsWith(TOKEN_PREFIX), "มี token ที่ไม่ใช่ของข้อสอบ");
  });
  await st("PC-3", "[service] ตัวจำลองรับ push จริงจาก facade แชท (pushLineMessagesToContact) · token ของข้อสอบ", async () => {
    needFx(); const m = mark();
    const r = await call(CHI, "pushLineMessagesToContact", { tenantId: tA }, { chatContactId: CC.C1, connectionId: conn, messages: [{ type: "text", text: "qc ping" }] });
    ok(r.ok === true, fmt(r)); const p = pushesSince(m); eq(p.length, 1, "push"); ok(p[0]?.token.startsWith(TOKEN_PREFIX), "token");
  });
  await st("PC-4", "[service] ประตูเดิม: notifyCustomer domain rooms (ข้ามเวลาเงียบ) ⇒ SENT ผ่านตัวจำลอง 1 ครั้ง · เรียกซ้ำ ⇒ duplicate", async () => {
    needFx(); const m = mark(); const key = `qc:tqe:pc:${"abcdefgh".split("").sort(() => Math.random() - 0.5).join("")}`;
    const inp = { unitId: uA, domain: "rooms", messageKey: "bill", chatContactId: CC.C1, vars: {}, dedupeKey: key, at: NOW0, bypassQuiet: true };
    const r1 = await call(GWI, "notifyCustomer", { tenantId: tA }, inp); eq(r1.status, "SENT", `ผล ${fmt(r1)}`);
    const r2 = await call(GWI, "notifyCustomer", { tenantId: tA }, inp); ok(r2.duplicate === true, fmt(r2));
    eq(pushesSince(m).length, 1, "push");
  });
  await st("PC-5", "[service] ข้อเท็จจริงของ R2: กุญแจที่มีช่วงเหมือนเบอร์ (tb0812345678…) ⇒ VALIDATION · ไม่เขียนแถว · ไม่ส่ง", async () => {
    needFx(); const m = mark(); const key = "trips:tb0812345678ab00:confirmation";
    ok(TH_PHONE_RE.test(key), "ตัวอย่างต้องตรงรูปเบอร์");
    const r = await call(GWI, "notifyCustomer", { tenantId: tA }, { unitId: uA, domain: "rooms", messageKey: "bill", chatContactId: CC.C1, vars: {}, dedupeKey: key, at: NOW0, bypassQuiet: true });
    eq([r.status, r.error], ["FAILED", "VALIDATION"], "ผล"); eq(pushesSince(m).length, 0, "push");
    eq((await logRows()).filter((x) => x.dedupeKey === key).length, 0, "แถว log");
  });
  await st("PC-6", "[service] ข้อเท็จจริงของ R1: การจองเว็บที่พิมพ์เบอร์ของคนอื่น ⇒ bookerPartyId = Party เจ้าของเบอร์ ซึ่งมีผู้ติดต่อ LINE บน OA ของหน่วย", async () => {
    needFx(); const r = await q<{ p: string }>(`SELECT "bookerPartyId" AS p FROM "TripBooking" WHERE id = $1`, [BK.KW]);
    eq(r[0]?.p, PTY.PV, "Party ของการจองเว็บ");
    ok((await prisma.chatContact.count({ where: { tenantId: tA, partyId: PTY.PV, channelConnectionId: conn } })) === 1, "Party นั้นมี LINE");
  });
  await st("PC-7", "[pure] ข้อเท็จจริงของ R6: renderTemplate เมื่อแม่แบบ en ว่าง ⇒ ข้อความไทย", () => {
    const f = fnOf(SETI, "renderTemplate"); ok(f, "ไม่มี renderTemplate");
    eq(f!({ type: "template" }, { th: "สวัสดี {ร้าน}", en: "" }, { ร้าน: "X" }, "en"), "สวัสดี X", "ข้อความ");
  });

  // ═══════════════ S ขอบเขต / กติกาโค้ด (รันได้วันนี้) ═══════════════
  console.log("\n── S: ขอบเขตไฟล์และกติกาโค้ด ──");
  const tip = git(["rev-parse", "--verify", "-q", "session/trips"]).trim();
  const BASE = git(["merge-base", "HEAD", "session/trips"]).trim() || tip;
  const same = (f: string) => !!tip && git(["diff", "--name-only", tip, "--", f]).trim() === "" && git(["ls-files", "--others", "--exclude-standard", "--", f]).trim() === "" && git(["ls-files", "--", f]).trim() !== "";
  const changedFiles = () => [...new Set([...git(["diff", "--name-only", BASE, "--", "prisma", "src", "next.config.ts", "scripts/fitness.mts", "scripts/trips-fixture.mts", "scripts/seed-trips-qc.mts"]).split("\n"),
    ...git(["ls-files", "--others", "--exclude-standard", "--", "prisma", "src"]).split("\n")].filter(Boolean))].filter((f) => !same(f) && !fromMainMerge(ROOT, f) && !changedOnlyByMainMerge(ROOT, BASE, f));
  const numstat = (f: string): [number, number] => {
    const ns = git(["diff", "--numstat", BASE, "--", f]).trim().split(/\s+/);
    if (ns[0]) return [Number(ns[0]), Number(ns[1] || 0)];
    return existsSync(join(ROOT, f)) && git(["ls-files", "--", f]).trim() === "" ? [read(f).split("\n").length, 0] : [0, 0];
  };
  await st("S-1", `[code] ไฟล์ที่แตะ ⊆ ใบสั่ง §3 + งบต่อไฟล์ (เทียบ merge-base ${BASE.slice(0, 9)} · ไม่นับไฟล์ที่ตรงกับ session/trips/มาจาก main)`, () => {
    const allowed = new Set(LIMITED.map(([f]) => f));
    const bad = changedFiles().filter((f) => !allowed.has(f));
    ok(bad.length === 0, `แตะไฟล์นอกขอบเขต: ${bad.slice(0, 6).join(", ")}`);
    for (const [f, maxDel, maxAdd] of LIMITED) { if (same(f)) continue; const [add, del] = numstat(f); ok(add <= maxAdd && del <= maxDel, `${f}: +${add} −${del} (จำกัด +${maxAdd} −${maxDel})`); }
  });
  await st("S-2", "[code] ไม่มี migration · ไม่แตะ prisma/ · src/lib/core/** แตะได้เฉพาะ defs/trips.ts · ไม่มีคีย์สิทธิ์ใหม่ (permissions.ts ตรงกับ session/trips)", () => {
    const bad = changedFiles().filter((f) => f.startsWith("prisma/") || (f.startsWith("src/lib/core/") && f !== DEFS));
    ok(bad.length === 0, `แตะ: ${bad.slice(0, 4).join(", ")}`); ok(same("src/lib/core/permissions.ts"), "permissions.ts เปลี่ยน");
  });
  await st("S-3", "[code] ไม่มี event ใหม่: automation/labels.ts · webhooks/labels.ts ตรงกับ session/trips · outbox-consumers ไม่มีคีย์ travelled/cancel_choice/paid_after_expiry ใหม่", () => {
    ok(same("src/lib/automation/labels.ts") && same("src/lib/webhooks/labels.ts"), "ทะเบียน label เปลี่ยน");
    const added = git(["diff", "-U0", BASE, "--", CONSUMERS]).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    ok(!added.some((l) => /trips\.booking\.(travelled|cancel_choice|paid_after_expiry)|trips\.(waitlist|refund|departure)\./.test(l)), `บรรทัดใหม่: ${added.slice(0, 2).join(" | ").slice(0, 200)}`);
    ok(added.every((l) => /trips\.booking\.confirmed|trips\.payment\.due_soon|onTripsNotifyEvent|^\+\s*$|^\+\s*\/\//.test(l)), "บรรทัดที่เพิ่มนอก 2 consumer");
  });
  await st("S-4", "[code] ไฟล์ใหม่ของใบไม่เรียกตัวส่ง LINE ตรง · ไม่ import modules/member|crm|chat · ไม่มี Flex", () => {
    for (const f of [NCORE, NSVC, JOBS]) {
      const s = stripComments(read(f)); if (!s) continue;
      ok(!/push(Line)?Messages?|replyFlex|api\.line\.me|sendLineToParty|lineCall\(/.test(s), `${f}: เรียกตัวส่ง LINE ตรง`);
      ok(!/@\/lib\/modules\/(member|crm|chat)\b/.test(s), `${f}: import โมดูลต้องห้าม`);
      ok(!/["']flex["']|\bflex\s*:/.test(s), `${f}: มี Flex (R7)`);
    }
  });
  await st("S-5", "[code] notify-core.ts บริสุทธิ์: ไม่มี prisma/db · ไม่มี Date.now() · ไม่มี new Date() ไม่มีอาร์กิวเมนต์ (ไม่มีไฟล์ = ผ่านโดยว่าง)", () => {
    const s = stripComments(read(NCORE)); if (!s) return;
    ok(!/@\/lib\/core\/db|prisma|tenantDb/.test(s), "แตะฐาน"); ok(!/Date\.now\(\)|new Date\(\s*\)/.test(s), "อ่านเวลาเครื่อง");
  });
  await st("S-6", "[code] ไฟล์ trips ที่แตะไม่มี AT TIME ZONE · ไม่มี LIKE/startsWith บน dedupeKey (R10)", () => {
    for (const f of [NCORE, NSVC, JOBS, BSCR, MANI]) {
      const s = stripComments(read(f)); if (!s || same(f)) continue;
      ok(!/AT TIME ZONE/i.test(s), `${f}: AT TIME ZONE`);
      ok(!/dedupeKey"?\s*(LIKE|ILIKE)|dedupeKey\s*:\s*\{\s*(startsWith|contains)/i.test(s), `${f}: อ่าน dedupeKey แบบคำนำ`);
    }
  });
  await st("S-7", "[code] ประตู: ทุกบรรทัดที่เปลี่ยนอยู่ในบล็อกรั้ว `// TRIPS T1.8 ▸ … ◂` (C-2) · ไม่เปลี่ยน = ผ่าน", () => {
    if (same(GATE)) return;
    const now = read(GATE).split("\n");
    const inFence = (i: number) => { let open = false; for (let k = 0; k <= i; k++) { if (/TRIPS T1\.8 ▸/.test(now[k] ?? "")) open = true; if (/◂/.test(now[k] ?? "") && /TRIPS T1\.8|^\s*\/\/\s*◂/.test(now[k] ?? "") && k < i) open = false; } return open || /TRIPS T1\.8/.test(now[i] ?? ""); };
    const hunks = git(["diff", "-U0", BASE, "--", GATE]).split("\n").filter((l) => l.startsWith("@@"));
    for (const h of hunks) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(h); if (!m) continue; const start = Number(m[1]) - 1, n = m[2] === undefined ? 1 : Number(m[2]);
      if (n === 0) { ok(inFence(Math.max(0, start)), `ลบบรรทัดนอกรั้วแถว ${start + 1}`); continue; }
      for (let i = start; i < start + n; i++) ok(inFence(i) || !(now[i] ?? "").trim(), `บรรทัด ${i + 1} นอกรั้ว: ${(now[i] ?? "").trim().slice(0, 80)}`);
    }
  });
  await st("S-8", "[code] ใบ a ไม่แตะชนิด abandonedBooking/reviewRequest และแม่แบบของใบอื่น (R5 · §8)", () => {
    for (const f of [NCORE, NSVC, JOBS, CONSUMERS]) {
      if (same(f)) continue;
      const added = (existsSync(join(ROOT, f)) && git(["ls-files", "--", f]).trim() === "" ? read(f) : git(["diff", "-U0", BASE, "--", f]).split("\n").filter((l) => l.startsWith("+")).join("\n"));
      const hit = OTHER_KINDS.filter((k) => new RegExp(`["'\`]${k}["'\`]`).test(stripComments(added)));
      ok(hit.length === 0, `${f}: ${hit.join(", ")}`);
    }
  });

  // ═══════════════ กลุ่มฟีเจอร์ ═══════════════
  const NC = NCI.mod;
  const ncFn = (n: string) => (NC && typeof NC[n] === "function" ? (NC[n] as AnyFn) : null);
  const trFn = (n: string) => (TR && typeof TR[n] === "function" ? (TR[n] as AnyFn) : null);
  const needCore = () => (!NC ? `${NCORE} (${NCI.err.slice(0, 60)})` : ["keyId", "tripsMsgKey", "reminderWindow", "checkTripsMsgTemplate", "renderTripsPreview"].filter((n) => !ncFn(n)).map((n) => `notify-core.${n}`).join(", ") || null);
  const needSvc = () => ["notifyTripBooking", "onTripsNotifyEvent"].filter((n) => !trFn(n)).map((n) => `facade trips.${n}`).join(", ") || null;
  const needJob = () => (!trFn("runCustomerMessages") ? "facade trips.runCustomerMessages" : null);
  const needGateTrips = async () => { const r = await call(GWI, "notifyCustomer", { tenantId: tA }, { unitId: uA, domain: "trips", messageKey: "confirmation", chatContactId: CC.C1, vars: {}, dedupeKey: `trips:qc:probe${STAMP.replace(/\d/g, "x")}`, at: NOW0, bypassQuiet: true }); await pool.query(`DELETE FROM "ServiceMessageLog" WHERE "tenantId" = $1 AND "dedupeKey" LIKE 'trips:qc:probe%'`, [tA]); return r.error === "VALIDATION" ? "ประตูไม่รับ domain trips" : null; };
  const gateTripsMissing = setupErr ? "ฟิกซ์เจอร์ไม่สำเร็จ" : await needGateTrips().catch((e) => errMsg(e));
  FAKE.length = 0; // ข้อลองประตูข้างบนอาจส่งจริงถึงตัวจำลอง — ไม่นับ
  const enableKinds = async (unit: string, kinds: Rec) => setV([{ key: "trips.msg.enabled", scope: "UNIT", scopeId: unit, value: { ...Object.fromEntries([...KINDS_A, ...OTHER_KINDS, "minNotMet", "insuranceMissing", "licenseExpiring", "pdpaRequestDue"].map((k) => [k, false])), ...kinds } }]);
  const notify = (bookingId: string, kind: string, now: Date, extra: Rec = {}, unit = uA, tenant = tA) => call(TRI, "notifyTripBooking", { tenantId: tenant, unitId: unit }, { bookingId, kind, ...extra }, { now });
  const runJob = (now: Date, extra: Rec = {}) => call(TRI, "runCustomerMessages", now, { tenantIds: [tA], ...extra });
  const keyOf = (kind: string, p: Rec): string => String(ncFn("tripsMsgKey")?.(kind, p) ?? "");
  const resetLog = async () => pool.query(`DELETE FROM "ServiceMessageLog" WHERE "tenantId" = ANY($1::text[]) AND domain = 'trips'`, [tenantIds]);

  await group("P", "ตัวช่วยบริสุทธิ์ (notify-core)", needCore, async () => {
    await st("P-1", "[pure] keyId แทนตัวเลขด้วย A–J · ไม่มีตัวเลขเหลือ · แปลงกลับได้ไม่ชน · อักขระนอก [a-z0-9_-] ⇒ null", () => {
      const f = ncFn("keyId")!;
      eq(f("tb0812345678ab00"), "tbAIBCDEFGHIabAA", "แปลง"); ok(f("ab1") !== f("ab2") && f("a1b") !== f("ab1"), "ชนกัน"); eq(f("AB?"), null, "อักขระนอกชุด");
    });
    await st("P-2", "[pure] tripsMsgKey: id รูปเบอร์ (tb0812345678…) ⇒ กุญแจไม่ตรง TH_PHONE_RE · ไม่มีตัวเลข · ≤ 200 · รูป §4.5 ครบ 3 ชนิด", () => {
      const f = ncFn("tripsMsgKey")!;
      const ks = [f("confirmation", { bookingId: "tb0812345678ab00" }), f("reminder1Day", { bookingId: "tb0812345678ab00", departureId: "td0899999999zz00", travelDate: "2027-03-02" }), f("paymentDue", { bookingId: "tb0812345678ab00", dueId: "tp0612345678", eventId: "cm0912345678" })].map(String);
      for (const k of ks) { ok(!TH_PHONE_RE.test(k) && !/\d/.test(k) && k.length <= 200 && /^[A-Za-z:._-]+$/.test(k), `กุญแจ ${k}`); ok(k.startsWith("trips:tbAIBCDEFGHIabAA:"), `คำนำ ${k}`); }
      ok(ks[0].endsWith(":confirmation") && ks[1].includes(":reminder1Day:") && ks[2].includes(":paymentDue:"), fmt(ks));
      ok(f("reminder1Day", { bookingId: "tbaa", departureId: "dd", travelDate: "2027-03-02" }) !== f("reminder1Day", { bookingId: "tbaa", departureId: "dd", travelDate: "2027-03-05" }), "วันต่าง กุญแจต้องต่าง");
    });
    await st("P-3", "[pure] reminderWindow: รอบ 2027-03-02 Bangkok ⇒ [2027-03-01 17:00+07, 2027-03-02 00:00+07) · Tokyo ⇒ เวลาญี่ปุ่น", () => {
      const f = ncFn("reminderWindow")!;
      const a = asRec(f(D1, "Asia/Bangkok")); eq([(a?.from as Date)?.toISOString(), (a?.to as Date)?.toISOString()], [BKK("2027-03-01", "17:00").toISOString(), BKK(D1, "00:00").toISOString()], "Bangkok");
      const b = asRec(f(D1, "Asia/Tokyo")); eq([(b?.from as Date)?.toISOString(), (b?.to as Date)?.toISOString()], [JST("2027-03-01", "17:00").toISOString(), JST(D1, "00:00").toISOString()], "Tokyo");
    });
    await st("P-4", "[pure] checkTripsMsgTemplate: คำต้องห้าม · {ลิงก์} บังคับ · ยาวเกิน · ไทยในอังกฤษ · 'ทันที' ห้ามเฉพาะวลีคืนเงิน/ยืนยัน · ค่าเริ่ม 3 ชนิดผ่าน", () => {
      const f = (k: string, v: unknown) => asRec(ncFn("checkTripsMsgTemplate")!(k, v)) ?? {};
      const codes = (r: Rec) => asArr(r.issues).map((i) => i.code);
      ok(codes(f("confirmation", { th: "คืนเงินอัตโนมัติ {ลิงก์}" })).includes("FORBIDDEN_TERM"), "อัตโนมัติ");
      ok(codes(f("confirmation", { th: "ok {ลิงก์}", en: "refund within 7 days {ลิงก์}" })).includes("FORBIDDEN_TERM"), "refund within");
      ok(codes(f("confirmation", { th: "ยืนยันทันที {ลิงก์}" })).includes("FORBIDDEN_TERM"), "ยืนยันทันที");
      eq(f("reminder1Day", { th: "พรุ่งนี้เจอกัน ติดต่อร้านได้ทันที {ลิงก์}" }).ok, true, "'ทันที' นอกวลีคืนเงิน/ยืนยัน ต้องผ่าน");
      ok(codes(f("reminder1Day", { th: "พรุ่งนี้เจอกัน" })).includes("LINK_REQUIRED"), "ไม่มีลิงก์");
      ok(codes(f("paymentDue", { th: `${"ก".repeat(1001)}{ลิงก์}` })).includes("TOO_LONG"), "ยาว");
      ok(codes(f("confirmation", { th: "x {ลิงก์}", en: "Booked at ร้าน {ลิงก์}" })).includes("THAI_IN_EN"), "ไทยใน en"); eq(f("confirmation", { th: "x {ลิงก์}", en: "Booked {ร้าน} {ลิงก์}" }).ok, true, "{ร้าน} ใน en ผ่าน");
      const getDef = fnOf(SETI, "getDef")!; for (const k of KINDS_A) eq(f(k, asRec(getDef(`trips.msg.${k}`))?.defaults && asRec(asRec(getDef(`trips.msg.${k}`))?.defaults)?._fallback).ok, true, `ค่าเริ่ม ${k}`);
    });
    await st("P-5", "[pure] renderTripsPreview: วงเล็บปีกกาในค่าตัวแปร (ชื่อสินค้า) ไม่ถูกแทนซ้ำ · en ว่าง ⇒ ไทย · แม่แบบผิด ⇒ fallback true + ข้อความมาตรฐาน", () => {
      const f = (v: unknown, loc: string) => asRec(ncFn("renderTripsPreview")!("confirmation", v, { สินค้า: "ทริป {ลิงก์}", ลิงก์: "https://x/y", ร้าน: "ร้าน" }, loc)) ?? {};
      const a = f({ th: "{สินค้า} {ลิงก์}", en: "{สินค้า} {ลิงก์}" }, "th"); eq(a.text, "ทริป {ลิงก์} https://x/y", "ไม่แทนซ้ำ"); eq(a.fallback, false, "fallback");
      eq(f({ th: "ไทย {ลิงก์}", en: "" }, "en").text, "ไทย https://x/y", "en ว่าง ⇒ ไทย");
      const c = f({ th: "คืนเงินอัตโนมัติ {ลิงก์}" }, "th"); eq(c.fallback, true, "fallback"); ok(!String(c.text).includes("อัตโนมัติ"), "ยังใช้ข้อความต้องห้าม");
    });
  });

  await group("GW", "ประตู platform (เพิ่มอย่างเดียว · R8)", () => gateTripsMissing, async () => {
    await st("GW-1", "[service] domain trips ⇒ แม่แบบ trips.msg.confirmation · domain 'trip' ⇒ VALIDATION", async () => {
      await resetLog(); const m = mark();
      const r = await call(GWI, "notifyCustomer", { tenantId: tA }, { unitId: uA, domain: "trips", messageKey: "confirmation", chatContactId: CC.C1, vars: { ร้าน: "ร้านคิวซี", ลิงก์: "https://qc-trips.invalid/x" }, dedupeKey: "trips:qc:gwone", at: NOW0, bypassQuiet: true });
      eq(r.status, "SENT", fmt(r)); ok(textOf(pushesSince(m)[0]!).includes("ร้านคิวซี"), "ข้อความไม่ใช่แม่แบบ trips");
      const r2 = await call(GWI, "notifyCustomer", { tenantId: tA }, { unitId: uA, domain: "trip", messageKey: "confirmation", chatContactId: CC.C1, vars: {}, dedupeKey: "trips:qc:gwtwo", at: NOW0 }); eq(r2.error, "VALIDATION", fmt(r2));
    });
    await st("GW-2", "[service] scope.productId: แม่แบบชั้น PRODUCT ชนะชั้น UNIT · ไม่ส่ง scope ⇒ ชั้น UNIT", async () => {
      await setV([{ key: "trips.msg.confirmation", scope: "UNIT", scopeId: uA, value: { th: "หน่วย {ลิงก์}", en: "" } }, { key: "trips.msg.confirmation", scope: "PRODUCT", scopeId: PRD.R.id, value: { th: "สินค้า {ลิงก์}", en: "" } }]);
      const m = mark(); const base = { unitId: uA, domain: "trips", messageKey: "confirmation", chatContactId: CC.C1, vars: { ลิงก์: "L" }, at: NOW0, bypassQuiet: true };
      await call(GWI, "notifyCustomer", { tenantId: tA }, { ...base, scope: { productId: PRD.R.id }, dedupeKey: "trips:qc:gwp" });
      await call(GWI, "notifyCustomer", { tenantId: tA }, { ...base, dedupeKey: "trips:qc:gwu" });
      eq(pushesSince(m).map(textOf), ["สินค้า L", "หน่วย L"], "ข้อความ");
    });
    await st("GW-3", "[service] localized.en: ผู้ติดต่อ en + แม่แบบ en ไม่ว่าง ⇒ ตัวแปร en · แม่แบบ en ว่าง ⇒ ข้อความไทย + ตัวแปรไทย (R6) · ผู้ติดต่อ th ⇒ ไทย", async () => {
      await setV([{ key: "trips.msg.confirmation", scope: "UNIT", scopeId: uA, value: { th: "ไทย {วันเดินทาง} {ลิงก์}", en: "EN {วันเดินทาง} {ลิงก์}" } }]);
      await pool.query(`DELETE FROM "SettingValue" WHERE "tenantId" = $1 AND key = 'trips.msg.confirmation' AND scope = 'PRODUCT'`, [tA]).catch(() => undefined);
      const base = { unitId: uA, domain: "trips", messageKey: "confirmation", vars: { วันเดินทาง: "อ. 2 มี.ค.", ลิงก์: "Lth" }, localized: { en: { vars: { วันเดินทาง: "Tue 2 Mar", ลิงก์: "Len" } } }, at: NOW0, bypassQuiet: true };
      let m = mark(); await call(GWI, "notifyCustomer", { tenantId: tA }, { ...base, chatContactId: CC.C2, dedupeKey: "trips:qc:gwen" }); eq(pushesSince(m).map(textOf), ["EN Tue 2 Mar Len"], "en");
      await setV([{ key: "trips.msg.confirmation", scope: "UNIT", scopeId: uA, value: { th: "ไทย {วันเดินทาง} {ลิงก์}", en: "" } }]);
      m = mark(); await call(GWI, "notifyCustomer", { tenantId: tA }, { ...base, chatContactId: CC.C2, dedupeKey: "trips:qc:gwenempty" }); eq(pushesSince(m).map(textOf), ["ไทย อ. 2 มี.ค. Lth"], "en ว่าง ⇒ ไทยทั้งข้อความ");
      m = mark(); await call(GWI, "notifyCustomer", { tenantId: tA }, { ...base, chatContactId: CC.C1, dedupeKey: "trips:qc:gwth" }); eq(pushesSince(m).map(textOf), ["ไทย อ. 2 มี.ค. Lth"], "th");
    });
    await st("GW-4", "[code] ผู้เรียกเดิม (booking-notify · dorm-* · booking-waitlist · modules/dorm) ตรงกับ session/trips · refs ใช้ spread แบบมีเงื่อนไข", () => {
      for (const f of ["src/lib/platform/booking-notify.ts", "src/lib/platform/dorm-line.ts", "src/lib/platform/dorm-pay.ts", "src/lib/platform/dorm-announce.ts", "src/lib/platform/booking-waitlist.ts", "src/lib/modules/dorm/dunning.ts", "src/lib/modules/dorm/parcel.ts"]) ok(same(f), `${f} เปลี่ยน`);
      ok(/\.\.\.\(\s*input\.scope\?\.productId\s*\?/.test(read(GATE).replace(/\s+/g, " ")), "refs ไม่ได้ใช้ spread แบบมีเงื่อนไข");
    });
  });

  const needFeature = () => needCore() ?? needSvc() ?? (gateTripsMissing || null);
  await group("C", "ยืนยันการจอง", needFeature, async () => {
    await resetLog(); await enableKinds(uA, { confirmation: true });
    await pool.query(`DELETE FROM "SettingValue" WHERE "tenantId" = $1 AND key = 'trips.msg.confirmation'`, [tA]).catch(() => undefined);
    await st("C-1", "[service] K1 (หน้าร้าน · P1 th) ⇒ push 1 · ลิงก์ https://qc-trips.invalid/book/<slug>/my/<token> · ไม่มีชื่อ/เบอร์ · ข้อความธรรมดา", async () => {
      const m = mark(); const r = await notify(BK.K1, "confirmation", NOW0); eq(r.status, "SENT", fmt(r));
      const p = pushesSince(m); eq(p.length, 1, "push"); eq(p[0]?.json?.messages?.[0]?.type, "text", "ชนิดข้อความ");
      const tok = fnOf(TRI, "bookingPublicToken")?.(BK.K1) as string | undefined;
      ok(textOf(p[0]!).includes(`https://qc-trips.invalid/book/${SA}/my/${tok ?? "?"}`), `ลิงก์: ${textOf(p[0]!).slice(0, 200)}`);
      ok(!NAMES.some((n) => textOf(p[0]!).includes(n)) && !PHONES.some((x) => textOf(p[0]!).includes(x)), "มีข้อมูลบุคคล");
      eq(r.dedupeKey, keyOf("confirmation", { bookingId: BK.K1 }), "กุญแจ");
    });
    await st("C-2", "[service] K2 (P2 en) ⇒ ข้อความอังกฤษ · ลิงก์มี ?lang=en · ไม่มีอักษรไทยนอกชื่อร้าน/สินค้า", async () => {
      const m = mark(); await notify(BK.K2, "confirmation", NOW0); const t = textOf(pushesSince(m)[0] ?? ({} as FakeReq));
      ok(/\?lang=en/.test(t), t.slice(0, 200)); ok(!/[฀-๿]/.test(t.replace("ร้านทดสอบ T1.8", "").replace(/Racha \{ลิงก์\} trip/, "")), `ไทย: ${t.slice(0, 200)}`);
    });
    await st("C-3", "[service] ชื่อสินค้ามี {ลิงก์} ⇒ ออกตามตัวอักษร ไม่ถูกแทนเป็นลิงก์", async () => {
      const rows = (await tripRows()).filter((x) => x.dedupeKey === keyOf("confirmation", { bookingId: BK.K1 })); ok(rows.length === 1, "ไม่มีแถว C-1");
      const last = FAKE.filter((x) => x.path === "/v2/bot/message/push").map(textOf).find((t) => t.includes("ทริปราชา")) ?? ""; ok(last.includes("ทริปราชา {ลิงก์} ทดสอบ"), last.slice(0, 200));
    });
    await st("C-4", "[service] เวลาเงียบ: 23:30 ของการจองที่สร้าง 23:10 ⇒ ส่ง · สร้าง 20:00 ⇒ SKIPPED_QUIET + retryAt 08:00", async () => {
      await resetLog(); const night = BKK("2027-03-01", "23:30");
      await pool.query(`UPDATE "TripBooking" SET "createdAt" = $2 WHERE id = $1`, [BK.K1, BKK("2027-03-01", "23:10")]);
      await pool.query(`UPDATE "TripBooking" SET "createdAt" = $2 WHERE id = $1`, [BK.K2, BKK("2027-03-01", "20:00")]);
      const a = await notify(BK.K1, "confirmation", night), b = await notify(BK.K2, "confirmation", night);
      eq(a.status, "SENT", fmt(a)); eq(b.status, "SKIPPED_QUIET", fmt(b)); eq(new Date(String(b.retryAt)).toISOString(), BKK("2027-03-02", "08:00").toISOString(), "retryAt");
      await pool.query(`UPDATE "TripBooking" SET "createdAt" = $2 WHERE "tenantId" = $1`, [tA, new Date(NOW0.getTime() - 20 * HOUR)]);
    });
    await st("C-5", "[service] สถานะ HOLD/CANCELLED · ช่องทาง OTA/IMPORT ⇒ ไม่เรียกประตู (ไม่มีแถว · ไม่มี push)", async () => {
      await resetLog(); const m = mark();
      for (const [col, val] of [["status", "HOLD"], ["status", "CANCELLED"], ["channel", "OTA"], ["channel", "IMPORT"]] as const) {
        const prev = (await q<Rec>(`SELECT "${col}" AS v FROM "TripBooking" WHERE id = $1`, [BK.K3]))[0]?.v;
        await pool.query(`UPDATE "TripBooking" SET "${col}" = $2 WHERE id = $1`, [BK.K3, val]);
        const r = await notify(BK.K3, "confirmation", NOW0); ok(!["SENT", "NO_CHANNEL", "SENDING"].includes(String(r.status)), `${col}=${val}: ${fmt(r)}`);
        await pool.query(`UPDATE "TripBooking" SET "${col}" = $2 WHERE id = $1`, [BK.K3, prev]);
      }
      eq(pushesSince(m).length, 0, "push"); eq((await tripRows()).length, 0, "แถว log");
    });
    await st("C-6", "[service] สวิตช์หลัก: confirmation ปิด ⇒ DISABLED และไม่มีคำสั่ง SQL ใดแตะ ServiceMessageLog (ไม่เรียกประตูเลย) · ปิดชั้นสินค้าแม้เปิดชั้นหน่วย ⇒ ไม่ส่ง", async () => {
      await resetLog(); await enableKinds(uA, { confirmation: false });
      const { r, sql } = await capture(() => notify(BK.K1, "confirmation", NOW0)); eq(r.status, "DISABLED", fmt(r));
      ok(!sql.some((s) => /ServiceMessageLog/.test(s)), "แตะ ServiceMessageLog");
      await enableKinds(uA, { confirmation: true });
      await setV([{ key: "trips.msg.enabled", scope: "PRODUCT", scopeId: PRD.R.id, value: Object.fromEntries([...KINDS_A, ...OTHER_KINDS, "minNotMet", "insuranceMissing", "licenseExpiring", "pdpaRequestDue"].map((k) => [k, false])) }]);
      eq((await notify(BK.K1, "confirmation", NOW0)).status, "DISABLED", "ชั้นสินค้า");
      await pool.query(`DELETE FROM "SettingValue" WHERE "tenantId" = $1 AND key = 'trips.msg.enabled' AND scope = 'PRODUCT'`, [tA]);
    });
    await st("C-7", "[service] ค่าเริ่มของทะเบียน: หน่วยที่ไม่เคยตั้ง T69 ⇒ ไม่ส่งชนิดใดเลย (R5)", async () => {
      const getDef = fnOf(SETI, "getDef")!; const d = asRec(asRec(getDef("trips.msg.enabled"))?.defaults) ?? {};
      for (const [tpl, v] of Object.entries(d)) for (const [k, on] of Object.entries(asRec(v) ?? {})) ok(on === false, `ค่าเริ่ม ${tpl}.${k} = ${on}`);
      eq((await notify(BK.KT, "confirmation", NOW0, {}, uT)).status, "DISABLED", "หน่วยโตเกียว (ไม่ได้ตั้ง)");
    });
  });

  await group("R", "ผู้รับ (R1)", needFeature, async () => {
    await resetLog(); await enableKinds(uA, { confirmation: true, reminder1Day: true, paymentDue: true });
    await st("R-1", "[service] การจองเว็บที่พิมพ์เบอร์ของ PV (Party มี LINE) ⇒ ไม่ส่งถึง PV · NO_RECIPIENT · ไม่มีแถว log", async () => {
      const m = mark(); const r = await notify(BK.KW, "confirmation", NOW0);
      eq(r.status, "NO_RECIPIENT", fmt(r)); eq(pushesSince(m).length, 0, "push");
      ok(!(await tripRows()).some((x) => x.partyId === PTY.PV), "มีแถวของ PV");
    });
    await st("R-2", "[service] การจองเว็บที่มีรหัสผูก (ผู้ติดต่อไม่มี Party) ⇒ ส่งถึงผู้ติดต่อนั้น (ส่ง chatContactId อย่างเดียว · ภาษา en)", async () => {
      const m = mark(); const r = await notify(BK.KL, "confirmation", NOW0); eq(r.status, "SENT", fmt(r));
      const p = pushesSince(m); eq(p.length, 1, "push"); const ext = (await prisma.chatContact.findFirst({ where: { id: CC.CX }, select: { externalUserId: true } }))?.externalUserId;
      eq(p[0]?.json?.to, ext, "ผู้รับ");
    });
    await st("R-3", "[service] Party ที่ถูกรวม (POLD → P1) ⇒ ส่งถึงผู้ติดต่อของ P1 ไม่ใช่ของ POLD", async () => {
      const m = mark(); const r = await notify(BK.KM, "confirmation", NOW0); eq(r.status, "SENT", fmt(r));
      const ext = (await prisma.chatContact.findFirst({ where: { id: CC.C1 }, select: { externalUserId: true } }))?.externalUserId; eq(pushesSince(m)[0]?.json?.to, ext, "ผู้รับ");
    });
    await st("R-4", "[service] P3 ไม่มี LINE (หน้าร้าน) ⇒ แถว NO_CHANNEL · ไม่มี push", async () => {
      const m = mark(); const r = await notify(BK.K3, "confirmation", NOW0); eq(r.status, "NO_CHANNEL", fmt(r)); eq(pushesSince(m).length, 0, "push");
    });
    await st("R-5", "[service] ข้ามร้าน: ctx ร้าน B + การจองร้าน A ⇒ NOT_FOUND · ไม่มีแถวในร้านใด", async () => {
      const before = (await logRows(tB)).length + (await tripRows()).length; const r = await notify(BK.K1, "confirmation", NOW0, {}, uB, tB);
      eq(r.status, "NOT_FOUND", fmt(r)); eq((await logRows(tB)).length + (await tripRows()).length, before, "แถว");
    });
    await st("R-6", "[service] รหัสผูกของการจองเว็บ แต่ผู้ติดต่อผูก Party อื่น (ไม่ใช่ผู้จอง) ⇒ ไม่ใช้ผู้ติดต่อนั้น", async () => {
      await resetLog(); await linkCode(BK.KW, CC.C1); const m = mark(); const r = await notify(BK.KW, "confirmation", NOW0);
      ok(r.status !== "SENT", fmt(r)); eq(pushesSince(m).length, 0, "push");
      await pool.query(`DELETE FROM "ChatLinkCode" WHERE "tenantId" = $1 AND "refId" = $2`, [tA, BK.KW]);
    });
  });

  await group("M", "เตือนวันก่อนเดินทาง", () => needFeature() ?? needJob(), async () => {
    await resetLog(); await enableKinds(uA, { reminder1Day: true }); await enableKinds(uT, { reminder1Day: true });
    const remK1 = () => keyOf("reminder1Day", { bookingId: BK.K1, departureId: DEP.D1, travelDate: D1 });
    await st("M-1", "[job] 16:45 ⇒ ไม่ส่ง · 17:00 ⇒ ส่ง K1 ครั้งเดียว · 17:15 ⇒ ไม่เพิ่ม", async () => {
      const m = mark(); await runJob(BKK("2027-03-01", "16:45")); ok(!(await tripRows()).some((x) => x.dedupeKey === remK1()), "ส่งก่อน 17:00");
      await runJob(BKK("2027-03-01", "17:00")); await runJob(BKK("2027-03-01", "17:15"));
      eq((await tripRows()).filter((x) => x.dedupeKey === remK1() && x.status === "SENT").length, 1, "SENT");
      ok(pushesSince(m).length >= 1, "push");
    });
    await st("M-2", "[job] จองหลังจุดเตือน (createdAt 17:30 วันก่อน) ⇒ ไม่เตือน", async () => {
      await resetLog(); await pool.query(`UPDATE "TripBooking" SET "createdAt" = $2 WHERE id = $1`, [BK.K2, BKK("2027-03-01", "17:30")]);
      await runJob(BKK("2027-03-01", "18:00")); ok(!(await tripRows()).some((x) => x.dedupeKey.includes(String(ncFn("keyId")!(BK.K2)))), "เตือน K2");
      await pool.query(`UPDATE "TripBooking" SET "createdAt" = $2 WHERE id = $1`, [BK.K2, new Date(NOW0.getTime() - 20 * HOUR)]);
    });
    await st("M-3", "[service] วันเดินทาง 09:00 ⇒ ไม่ส่ง 'พรุ่งนี้' (BAD_STATE หรือ SKIPPED_PRECHECK_TOO_LATE)", async () => {
      await resetLog(); const r = await notify(BK.K1, "reminder1Day", BKK(D1, "09:00")); ok(r.status !== "SENT", fmt(r));
    });
    await st("M-4", "[service] ย้ายรอบระหว่าง claim กับ ส่ง (กุญแจของ D1 · การจองอยู่ D5 แล้ว) ⇒ ยับยั้ง (SKIPPED_PRECHECK_* · ไม่มี push)", async () => {
      await resetLog(); await pool.query(`UPDATE "TripBooking" SET "departureId" = $2, "travelDate" = $3 WHERE id = $1`, [BK.K4, DEP.D5, D5]);
      const m = mark(); const r = await notify(BK.K4, "reminder1Day", BKK("2027-03-01", "17:00"), { departureId: DEP.D1, travelDate: D1 });
      ok(r.status !== "SENT", fmt(r)); eq(pushesSince(m).length, 0, "push");
      await pool.query(`UPDATE "TripBooking" SET "departureId" = $2, "travelDate" = $3 WHERE id = $1`, [BK.K4, DEP.D1, D1]);
    });
    await st("M-5", "[job] คำขอคืนเงินเปิด ⇒ รอบนี้ไม่เตือนและไม่เขียนแถว · คำขอถูกปฏิเสธภายหลัง ⇒ รอบถัดไปเตือนได้ (R4)", async () => {
      await resetLog(); const rq = await insertRow("TripRefundRequest", { id: rid("rq"), tenantId: tA, unitId: uA, bookingId: BK.K1, status: "REQUESTED", updatedAt: new Date() });
      await runJob(BKK("2027-03-01", "17:00")); ok(!(await tripRows()).some((x) => x.dedupeKey === remK1()), "มีแถวขณะคำขอเปิด");
      await pool.query(`UPDATE "TripRefundRequest" SET status = 'REJECTED' WHERE id = $1`, [rq]);
      await runJob(BKK("2027-03-01", "17:15")); eq((await tripRows()).filter((x) => x.dedupeKey === remK1() && x.status === "SENT").length, 1, "หลังปฏิเสธ");
    });
    await st("M-6", "[job] รอบถูกร้านยกเลิก ⇒ ไม่เตือน", async () => {
      await resetLog(); await pool.query(`UPDATE "TripDeparture" SET status = 'CANCELLED' WHERE id = $1`, [DEP.D1]);
      await runJob(BKK("2027-03-01", "17:00")); eq((await tripRows()).filter((x) => x.messageKey === "reminder1Day").length, 0, "แถวเตือน");
      await pool.query(`UPDATE "TripDeparture" SET status = 'OPEN' WHERE id = $1`, [DEP.D1]);
    });
    await st("M-7", "[job] หน่วยโตเกียว: 16:30 JST ⇒ ไม่ส่ง · 17:00 JST (= 15:00 ไทย) ⇒ ส่ง (เขตเวลาหน่วย)", async () => {
      await resetLog(); const k = keyOf("reminder1Day", { bookingId: BK.KT, departureId: DEP.DT, travelDate: D1 });
      await runJob(JST("2027-03-01", "16:30")); ok(!(await tripRows()).some((x) => x.dedupeKey === k), "ส่งก่อนเวลา");
      await runJob(JST("2027-03-01", "17:00")); ok((await tripRows()).some((x) => x.dedupeKey === k && x.status === "SENT"), "ไม่ส่ง");
    });
    await st("M-8", "[service] ไม่มีจุดรับ/จุดนัด ⇒ ข้อความกลาง 'ร้านจะแจ้งเวลารับ' · ไม่มีตัวแปรว่าง", async () => {
      await resetLog(); const m = mark(); await notify(BK.K1, "reminder1Day", BKK("2027-03-01", "17:00"), { departureId: DEP.D1, travelDate: D1 });
      ok(textOf(pushesSince(m)[0] ?? ({} as FakeReq)).includes("ร้านจะแจ้งเวลารับ"), "ข้อความกลาง");
    });
  });

  await group("D", "งวดจ่ายใกล้ครบ (R3)", needFeature, async () => {
    await resetLog(); await enableKinds(uA, { paymentDue: true });
    const due = await insertRow("TripPaymentDue", { id: rid("due"), tenantId: tA, unitId: uA, bookingId: BK.K1, seq: 91, kind: "BALANCE", dueAt: BKK("2027-03-01", "20:00"), amountSatang: 100_000, vatableSatang: 0, passThroughSatang: 0, paidSatang: 40_000, status: "PARTLY_PAID", updatedAt: new Date() });
    const evt = (id: string) => ({ id, tenantId: tA, unitId: uA, type: "trips.payment.due_soon", payload: { dueId: due, bookingId: BK.K1, amountSatang: 999_999, dueAt: BKK("2027-03-01", "20:00").toISOString() } });
    await st("D-1", "[service] consumer due_soon ⇒ push 1 · กุญแจ = …:paymentDue:<due>:<evt.id> · ยอดค้างจากข้อมูลสด ฿600.00 (ไม่ใช่ payload)", async () => {
      const m = mark(); await call(TRI, "onTripsNotifyEvent", evt("cmqcevtone"));
      eq(pushesSince(m).length, 1, "push"); ok(textOf(pushesSince(m)[0]!).includes("600.00") && !textOf(pushesSince(m)[0]!).includes("9,999"), textOf(pushesSince(m)[0]!).slice(0, 200));
      ok((await tripRows()).some((x) => x.dedupeKey === keyOf("paymentDue", { bookingId: BK.K1, dueId: due, eventId: "cmqcevtone" })), "กุญแจ");
    });
    await st("D-2", "[service] event เดิมซ้ำ ⇒ ไม่เพิ่ม · event ใหม่ (id อื่น) ⇒ อีก 1", async () => {
      const m = mark(); await call(TRI, "onTripsNotifyEvent", evt("cmqcevtone")); eq(pushesSince(m).length, 0, "ซ้ำ");
      await call(TRI, "onTripsNotifyEvent", evt("cmqcevttwo")); eq(pushesSince(m).length, 1, "ใหม่");
    });
    await st("D-3", "[service] งวดจ่ายครบก่อนส่ง ⇒ ไม่ส่ง · สกุลเงินไม่ใช่ THB ⇒ ไม่ส่ง · collectMode AGENT ⇒ ไม่ส่ง", async () => {
      const m = mark();
      await pool.query(`UPDATE "TripPaymentDue" SET status = 'PAID', "paidSatang" = "amountSatang" WHERE id = $1`, [due]); await call(TRI, "onTripsNotifyEvent", evt("cmqcevtpaid"));
      await pool.query(`UPDATE "TripPaymentDue" SET status = 'PARTLY_PAID', "paidSatang" = 40000 WHERE id = $1`, [due]);
      await pool.query(`UPDATE "TripBooking" SET currency = 'USD' WHERE id = $1`, [BK.K1]); await call(TRI, "onTripsNotifyEvent", evt("cmqcevtusd")); await pool.query(`UPDATE "TripBooking" SET currency = 'THB' WHERE id = $1`, [BK.K1]);
      await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'AGENT' WHERE id = $1`, [BK.K1]); await call(TRI, "onTripsNotifyEvent", evt("cmqcevtagt")); await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'SHOP' WHERE id = $1`, [BK.K1]);
      eq(pushesSince(m).length, 0, "push");
    });
  });

  await group("X", "PDPA · ข้อมูลส่วนบุคคล", needFeature, async () => {
    await resetLog(); await enableKinds(uA, { confirmation: true });
    await st("X-1", "[service] ผู้ติดต่อบล็อก (P4) ⇒ SKIPPED_CONSENT · ไม่มี push", async () => {
      const m = mark(); const r = await notify(BK.K4, "confirmation", NOW0); eq(r.status, "SKIPPED_CONSENT", fmt(r)); eq(pushesSince(m).length, 0, "push");
    });
    await st("X-2", "[service] booker.erased (ลบจาก CRM/สมาชิก · bookerPartyId ยังอยู่) ⇒ ไม่ส่ง · piiPurgedAt ⇒ ไม่ส่ง", async () => {
      await pool.query(`UPDATE "TripBooking" SET "policySnapshot" = "policySnapshot" || '{"booker":{"v":1,"erased":true}}'::jsonb WHERE id = $1`, [BK.K2]);
      const m = mark(); ok((await notify(BK.K2, "confirmation", NOW0)).status !== "SENT", "erased");
      await pool.query(`UPDATE "TripBooking" SET "piiPurgedAt" = $2 WHERE id = $1`, [BK.K3, NOW0]); ok((await notify(BK.K3, "confirmation", NOW0)).status !== "SENT", "purged");
      eq(pushesSince(m).length, 0, "push");
    });
    await st("X-3", "[service] แถว ServiceMessageLog · OutboxEvent · AuditLog ของร้านไม่มีชื่อ/เบอร์ของฟิกซ์เจอร์ · ไม่มี token", async () => {
      const tok = String(fnOf(TRI, "bookingPublicToken")?.(BK.K1) ?? "zz");
      for (const t of ["ServiceMessageLog", "OutboxEvent", "AuditLog"]) {
        const s = JSON.stringify(await q(`SELECT * FROM "${t}" WHERE "tenantId" = $1`, [tA]).catch(() => []));
        ok(!NAMES.some((n) => s.includes(n)) && !PHONES.some((p) => s.includes(p)) && !s.includes(tok), `${t} มีข้อมูลบุคคล/token`);
      }
    });
  });

  await group("E", "ซ้ำ · พร้อมกัน", needFeature, async () => {
    await resetLog(); await enableKinds(uA, { confirmation: true });
    const ev = { id: "cmqcconfone", tenantId: tA, unitId: uA, type: "trips.booking.confirmed", payload: { bookingId: BK.K1, unitId: uA, departureId: DEP.D1, status: "CONFIRMED", channel: "COUNTER", amountSatang: 300_000 } };
    await st("E-1", "[service] consumer event เดียวกัน 2 ครั้งติด ⇒ push 1", async () => { const m = mark(); await call(TRI, "onTripsNotifyEvent", ev); await call(TRI, "onTripsNotifyEvent", ev); eq(pushesSince(m).length, 1, "push"); });
    await st("E-2", "[service] 8 ทางพร้อมกัน (consumer + notifyTripBooking) ⇒ push 1 · แถว SENT 1", async () => {
      await resetLog(); const m = mark();
      await Promise.all([...Array.from({ length: 4 }, () => call(TRI, "onTripsNotifyEvent", ev)), ...Array.from({ length: 4 }, () => notify(BK.K1, "confirmation", NOW0))]);
      eq(pushesSince(m).length, 1, "push"); eq((await tripRows()).filter((x) => x.status === "SENT").length, 1, "SENT");
    });
    await st("E-3", "[service] ตัวจำลองตอบ 500 ⇒ FAILED (ลองซ้ำได้) · 429 ⇒ QUOTA จบ + audit messaging.line.quota", async () => {
      await resetLog(); FAKE_MODE = "500"; const a = await notify(BK.K1, "confirmation", NOW0); FAKE_MODE = "429"; const b = await notify(BK.KM, "confirmation", NOW0); FAKE_MODE = "ok";
      eq(a.status, "FAILED", fmt(a)); ok(b.status === "FAILED" || b.status === "QUOTA", fmt(b));
      ok((await tripRows()).some((x) => x.status === "QUOTA"), "ไม่มีแถว QUOTA");
    });
  });

  await group("J", "งาน: ลองซ้ำ · จังหวะ (R10)", () => needFeature() ?? needJob(), async () => {
    await resetLog(); await enableKinds(uA, { confirmation: true });
    const k1 = keyOf("confirmation", { bookingId: BK.K1 });
    const ob = await insertRow("OutboxEvent", { id: rid("ob"), tenantId: tA, unitId: uA, type: "trips.booking.confirmed", idempotencyKey: `trips.booking.confirmed:${BK.K1}`, payload: JSON.stringify({ bookingId: BK.K1 }), status: "DONE", createdAt: new Date(NOW0.getTime() - 2 * HOUR), updatedAt: new Date() }).catch(() => "");
    await st("J-1", "[job] แถว FAILED อายุ 30 นาที ⇒ ไม่ลอง · 61 นาที ⇒ ส่ง (ห่าง ≥ 60 นาที)", async () => {
      ok(ob, "ตั้ง OutboxEvent ไม่ได้");
      await insertRow("ServiceMessageLog", { id: rid("sl"), tenantId: tA, unitId: uA, domain: "trips", messageKey: "confirmation", dedupeKey: k1, channel: "LINE", status: "FAILED", at: new Date(NOW0.getTime() - 30 * MIN) });
      const m = mark(); await runJob(NOW0); eq(pushesSince(m).length, 0, "30 นาที");
      await pool.query(`UPDATE "ServiceMessageLog" SET at = $3 WHERE "tenantId" = $1 AND "dedupeKey" = $2`, [tA, k1, new Date(NOW0.getTime() - 61 * MIN)]);
      await runJob(NOW0); eq(pushesSince(m).length, 1, "61 นาที");
    });
    await st("J-2", "[job] SKIPPED_QUIET ⇒ ลองเมื่อพ้นเวลาเงียบ · ในเวลาเงียบ ⇒ ไม่ลอง", async () => {
      await resetLog(); await insertRow("ServiceMessageLog", { id: rid("sl"), tenantId: tA, unitId: uA, domain: "trips", messageKey: "confirmation", dedupeKey: k1, channel: "NONE", status: "SKIPPED_QUIET", at: BKK("2027-03-01", "22:00") });
      const m = mark(); await runJob(BKK("2027-03-01", "23:00")); eq(pushesSince(m).length, 0, "ในเวลาเงียบ"); await runJob(BKK("2027-03-02", "08:15")); eq(pushesSince(m).length, 1, "หลังเวลาเงียบ");
    });
    await st("J-3", "[job] ไม่เริ่มครั้งแรกของ confirmation: การจองยืนยันแล้วที่ไม่มีแถว log ⇒ งานไม่ส่ง (เปิดใช้ครั้งแรกไม่ย้อนหลัง)", async () => {
      await resetLog(); const m = mark(); await runJob(NOW0); eq(pushesSince(m).filter((p) => /ยืนยัน|confirm/i.test(textOf(p))).length, 0, "ส่งย้อนหลัง");
      eq((await tripRows()).filter((x) => x.messageKey === "confirmation").length, 0, "แถว");
    });
    await st("J-4", "[job] tenantIds = [] ⇒ ไม่ทำอะไร · signal aborted ⇒ more = true ไม่ส่ง", async () => {
      const a = await call(TRI, "runCustomerMessages", NOW0, { tenantIds: [] }); eq(Number(a.units ?? 0), 0, fmt(a));
      const ac = new AbortController(); ac.abort(); const b = await runJob(BKK("2027-03-01", "17:00"), { signal: ac.signal }); ok(b.more === true || Number(b.units ?? 0) === 0, fmt(b));
    });
    await st("J-5", "[code] ลงทะเบียน trips.customerMessages ทุก 15 นาทีใน minute-jobs.ts", () => {
      const s = read(MINUTE).replace(/\s+/g, " "); ok(/name: "trips\.customerMessages", everyMinutes: 15/.test(s), "ไม่พบ");
    });
  });

  await group("G", "ไม่ส่งของใบอื่น (T1.6b · W1.4b2 · W1.4c · T1.8b)", needFeature, async () => {
    await resetLog(); await enableKinds(uA, { confirmation: true, reminder1Day: true, paymentDue: true, abandonedBooking: true, reviewRequest: true, departureChanged: true, waitlistOffer: true, refunded: true });
    await st("G-1", "[service] event ชนิด departure.cancelled · refund.done · waitlist.offered · hold.expired · booking.expired ⇒ onTripsNotifyEvent ไม่ส่งอะไร", async () => {
      const m = mark();
      for (const type of ["trips.departure.cancelled", "trips.refund.done", "trips.waitlist.offered", "trips.hold.expired", "trips.booking.expired", "trips.booking.paid_after_expiry", "trips.booking.cancel_choice_offered"])
        await call(TRI, "onTripsNotifyEvent", { id: `cmqc${type.replace(/[^a-z]/g, "")}`, tenantId: tA, unitId: uA, type, payload: { bookingId: BK.K1, departureId: DEP.D1, unitId: uA } });
      eq(pushesSince(m).length, 0, "push");
    });
    await st("G-2", "[service] notifyTripBooking ชนิดนอก a (abandonedBooking · reviewRequest · departureChanged · …) ⇒ ไม่เรียกประตู", async () => {
      const m = mark(); for (const k of OTHER_KINDS) { const r = await notify(BK.K1, k, NOW0); ok(!["SENT", "NO_CHANNEL", "SKIPPED_QUIET", "SENDING"].includes(String(r.status)), `${k}: ${fmt(r)}`); }
      eq(pushesSince(m).length, 0, "push");
    });
    await st("G-3", "[job] การจอง EXPIRED เงิน 0 ของเว็บที่มีรหัสผูก ⇒ งานไม่ส่งข้อความตามจองค้าง (ย้ายไป T1.8b)", async () => {
      await pool.query(`UPDATE "TripBooking" SET status = 'EXPIRED' WHERE id = $1`, [BK.KL]);
      const m = mark(); await runJob(BKK("2027-03-01", "12:00")); eq(pushesSince(m).length, 0, "push");
      await pool.query(`UPDATE "TripBooking" SET status = 'CONFIRMED' WHERE id = $1`, [BK.KL]);
    });
    await st("G-4", "[service] หลังทุกกลุ่ม: แถว log ของ domain trips มี messageKey ⊆ {confirmation, reminder1Day, paymentDue}", async () => {
      const ks = [...new Set((await q<{ k: string }>(`SELECT DISTINCT "messageKey" AS k FROM "ServiceMessageLog" WHERE "tenantId" = $1 AND domain = 'trips' AND "dedupeKey" NOT LIKE 'trips:qc:%'`, [tA])).map((r) => r.k))];
      ok(ks.every((k) => (KINDS_A as readonly string[]).includes(k)), fmt(ks));
    });
  });

  await group("T", "แม่แบบ: writeVia · ด่านบันทึก · ข้อความมาตรฐานแทน (R9)", () => needCore() ?? (fnOf(TRI, "saveTripsSettings") ? null : "saveTripsSettings"), async () => {
    const save = (actor: string, changes: Rec[]) => call(TRI, "saveTripsSettings", { tenantId: tA, actorUserId: actor }, { unitId: uA, changes });
    await st("T-1", "[action] ทางกลาง: writeViaIssues ปฏิเสธ trips.msg.enabled และ trips.msg.<3 ชนิด> (saveSettingsAction/resetSettingAction ใช้ตัวนี้ · actions.ts:52,61)", () => {
      const f = fnOf(SETI, "writeViaIssues")!; const keys = ["trips.msg.enabled", ...KINDS_A.map((k) => `trips.msg.${k}`)];
      eq(asArr(f(keys)).map((i) => i.key).sort(), [...keys].sort(), "คีย์ที่ถูกปฏิเสธ");
    });
    await st("T-2", "[action] saveTripsSettings (OWNER): แม่แบบมี 'คืนเงินอัตโนมัติ' ⇒ VALIDATION ไม่บันทึก · ลบ {ลิงก์} ⇒ VALIDATION · ข้อความถูก ⇒ บันทึกได้", async () => {
      const a = await save(ownerUser, [{ key: "trips.msg.confirmation", scope: "UNIT", scopeId: uA, value: { th: "คืนเงินอัตโนมัติ {ลิงก์}", en: "" } }]); eq(a.code, "VALIDATION", fmt(a));
      const b = await save(ownerUser, [{ key: "trips.msg.reminder1Day", scope: "UNIT", scopeId: uA, value: { th: "พรุ่งนี้เจอกัน", en: "" } }]); eq(b.code, "VALIDATION", fmt(b));
      const c = await save(ownerUser, [{ key: "trips.msg.confirmation", scope: "UNIT", scopeId: uA, value: { th: "{ร้าน} ยืนยันแล้ว {ลิงก์}", en: "" } }]); eq(c.ok, true, fmt(c));
    });
    await st("T-3", "[action] STAFF ที่ไม่มี trips.settings.* ⇒ PERMISSION", async () => {
      const r = await save(staffNoPerm, [{ key: "trips.msg.confirmation", scope: "UNIT", scopeId: uA, value: { th: "x {ลิงก์}", en: "" } }]); eq(r.code, "PERMISSION", fmt(r));
    });
    await st("T-4", "[service] แม่แบบต้องห้ามที่เข้าทางเครื่องยนต์ตรง ⇒ ตอนส่งใช้ข้อความมาตรฐาน · ลิ้นชักแสดง fallback", async () => {
      ok(!needFeature(), "ยังไม่มีบริการ"); await resetLog(); await enableKinds(uA, { confirmation: true });
      await setV([{ key: "trips.msg.confirmation", scope: "UNIT", scopeId: uA, value: { th: "คืนเงินอัตโนมัติ {ลิงก์}", en: "" } }]);
      const m = mark(); await notify(BK.K1, "confirmation", NOW0); const t = textOf(pushesSince(m)[0] ?? ({} as FakeReq)); ok(t && !t.includes("อัตโนมัติ"), t.slice(0, 200));
      const vm = await call(TRI, "loadBookingDetailVM", { tenantId: tA, actorUserId: ownerUser }, { unitId: uA, bookingId: BK.K1 }, { now: NOW0 });
      ok(asArr(asRec(vm.vm)?.messages).some((x) => x.kind === "confirmation" && x.fallback === true), fmt(asRec(vm.vm)?.messages));
      await pool.query(`DELETE FROM "SettingValue" WHERE "tenantId" = $1 AND key = 'trips.msg.confirmation'`, [tA]);
    });
  });

  await group("L", "รายการข้อความต่อการจอง (R10)", () => needFeature(), async () => {
    await st("L-1", "[service] loadBookingDetailVM.messages: K1 หลังส่ง ⇒ confirmation SENT · K3 ⇒ NO_CHANNEL · การจองอื่นไม่ปน", async () => {
      await resetLog(); await enableKinds(uA, { confirmation: true }); await pool.query(`UPDATE "TripBooking" SET "piiPurgedAt" = NULL WHERE id = $1`, [BK.K3]);
      await notify(BK.K1, "confirmation", NOW0); await notify(BK.K3, "confirmation", NOW0);
      const vm = async (b: string) => asArr(asRec((await call(TRI, "loadBookingDetailVM", { tenantId: tA, actorUserId: ownerUser }, { unitId: uA, bookingId: b }, { now: NOW0 })).vm)?.messages);
      eq((await vm(BK.K1)).map((x) => [x.kind, x.status]), [["confirmation", "SENT"]], "K1"); eq((await vm(BK.K3)).map((x) => [x.kind, x.status]), [["confirmation", "NO_CHANNEL"]], "K3");
      eq((await vm(BK.KM)).length, 0, "KM");
    });
    await st("L-2", "[page] BookingDrawer มี data-testid trips-bk-msgs · คีย์ข้อความ bk.msg.* ครบทั้ง th/en · อังกฤษไม่มีอักษรไทย", () => {
      ok(/data-testid="trips-bk-msgs"/.test(read(DRAWER)), "testid");
      const th = asRec(JSON.parse(read(MSG_TH) || "{}"))?.bk as Rec | undefined, en = asRec(JSON.parse(read(MSG_EN) || "{}"))?.bk as Rec | undefined;
      ok(asRec(th?.msg) && asRec(en?.msg), "ไม่มี bk.msg"); ok(!/[฀-๿]/.test(JSON.stringify(en?.msg)), "อังกฤษมีอักษรไทย");
      ok(!/อัตโนมัติ|automatic/i.test(JSON.stringify(th?.msg) + JSON.stringify(en?.msg)), "คำต้องห้าม");
    });
  });

  await group("PF", "SQL · EXPLAIN", () => needFeature(), async () => {
    await st("PF-1", "[service] notifyTripBooking confirmation (ซ้ำ = แคชอุ่น) ≤ 14 คำสั่ง · ทุกคำสั่งบน ServiceMessageLog มี dedupeKey แบบตรงตัว/IN", async () => {
      await resetLog(); await notify(BK.K1, "confirmation", NOW0);
      const { sql } = await capture(() => notify(BK.K1, "confirmation", NOW0)); ok(sql.length <= 14, `${sql.length} คำสั่ง`);
      for (const s of sql.filter((x) => /ServiceMessageLog/.test(x))) ok(/"dedupeKey"\s*(=|IN)/.test(s) || /^\s*(INSERT|UPDATE)/i.test(s), s.slice(0, 160));
    });
    await st("PF-2", "[service] EXPLAIN การอ่านรายการข้อความต่อการจอง ⇒ ใช้ดัชนี ServiceMessageLog_tenantId_dedupeKey_key (ไม่ Seq Scan)", async () => {
      const { sql } = await capture(() => call(TRI, "loadBookingDetailVM", { tenantId: tA, actorUserId: ownerUser }, { unitId: uA, bookingId: BK.K1 }, { now: NOW0 }));
      const s = sql.find((x) => /FROM "public"\."ServiceMessageLog"|FROM "ServiceMessageLog"/.test(x)); ok(s, "ไม่มีคิวรีอ่าน log");
      const keys = [keyOf("confirmation", { bookingId: BK.K1 })];
      await pool.query("SET enable_seqscan = off").catch(() => undefined);
      const plan = (await q<{ "QUERY PLAN": string }>(`EXPLAIN SELECT "dedupeKey", status, at FROM "ServiceMessageLog" WHERE "tenantId" = $1 AND "dedupeKey" = ANY($2::text[])`, [tA, keys])).map((r) => r["QUERY PLAN"]).join("\n");
      await pool.query("SET enable_seqscan = on").catch(() => undefined);
      ok(/ServiceMessageLog_tenantId_dedupeKey_key/.test(plan), plan.slice(0, 200)); ok(/IN \(|= ANY|"dedupeKey" =/.test(s!), `คิวรีจริงไม่ใช้รายการกุญแจ: ${s!.slice(0, 160)}`);
    });
    await st("PF-3", "[job] งานต่อหน่วยที่ไม่มีงาน ≤ 4 คำสั่ง (เทียบหน่วยโตเกียวที่ปิดทุกชนิด)", async () => {
      await enableKinds(uT, {}); const { r, sql } = await capture(() => call(TRI, "runCustomerMessages", NOW0, { tenantIds: [tA] }));
      ok(asRec(r), fmt(r)); ok(sql.length <= 4 * 3 + 6, `${sql.length} คำสั่ง (2 หน่วย + ค่าตั้ง)`);
    });
  });

  // ═══════════════ ปิดท้าย ═══════════════
  await st("PC-8", "[service] ไม่มีคำขอใดออกนอกเครื่องตลอดการรัน (BLOCKED ว่าง) · ทุก push ไปที่ตัวจำลองด้วย token ของข้อสอบ", () => {
    eq(BLOCKED, [], "คำขอออกนอก"); ok(FAKE.filter((x) => x.path === "/v2/bot/message/push").every((x) => x.token.startsWith(TOKEN_PREFIX)), "token");
  });
  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const left = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]); console.log(`  ฟิกซ์เจอร์ค้างหลังลบ: ${left[0]?.n ?? "?"} ร้าน`); } catch { /* */ }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* */ }
  await pool.end().catch(() => undefined);
  try { await qcPrisma.$disconnect(); } catch { /* */ }
  globalThis.fetch = REAL_FETCH;
  for (const [k, v] of Object.entries(ENV_SAVED)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await new Promise<void>((r) => server.close(() => r()));
}

const failed = cks.filter((c) => c.res === "FAIL"), skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-(\d+|X)$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${(p0 ?? 0) + (c.res === "PASS" ? 1 : 0)}/${(t0 ?? 0) + 1}`; }
const notBuilt = failed.filter((c) => /^ยังไม่สร้าง/.test(c.why)).map((c) => c.id);
const otherRed = failed.filter((c) => !notBuilt.includes(c.id)).map((c) => c.id);
console.log(`\n===== QC TRIPS T1.8a · ข้อความถึงลูกค้าทริป =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`แดง "ยังไม่สร้าง": ${notBuilt.join(" ") || "ไม่มี"} · แดงอื่น: ${otherRed.join(" ") || "ไม่มี"}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), notBuilt, otherRed, skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
