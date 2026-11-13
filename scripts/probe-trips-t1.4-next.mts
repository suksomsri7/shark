// probe-trips-t1.4-next.mts — กดจริงผ่าน Next ของใบรายชื่อรายวัน (T1.4a) โดยผู้ตรวจอิสระ: 2 มุมมอง · ส่งออก CSV · พิมพ์ · เปิดดูข้อมูลสุขภาพ · สิทธิ์/ข้ามหน่วย/ข้ามร้าน · ปุ่มในแผงรอบ · เกินเพดาน
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh pnpm exec tsx scripts/probe-trips-t1.4-next.mts --base http://127.0.0.1:<port>   ( --only 2,4 = รันเฉพาะฉาก )
// 🔴 แถวทดสอบทั้งหมดอยู่ใต้ร้านชั่วคราว slug `trips-t14n-*` (ผู้ใช้ `trips-t14n-*@shark.local`) — คนละคำนำหน้ากับข้อสอบ t1.4 (`trips-t14-`) จึงไม่ถูกข้อสอบกวาด · ลบทุกแถวของตัวเองใน finally เสมอ
// 🔴 ร้าน seed `andaman-dive` อ่านอย่างเดียว (SELECT id ของรอบ 1 แถว เพื่อทดสอบข้ามร้าน) · session ปักธง userAgent แล้วลบใน finally
// 🔴 ไม่ build · ไม่เปิด/ปิด server · ต่อ server ที่ผู้คุมเปิดไว้เท่านั้น
// วิธีปลูกข้อมูล = แบบเดียวกับข้อสอบ t1.4: จองผ่าน quoteTrips/bookTripsNow จริง · ผู้เดินทาง 2 คนแรกกรอก/ลงนามผ่านบริการ T0.8 จริง (updateTripPassenger · recordWitnessedWaiver) — ถ้าบริการปฏิเสธจะปลูกด้วย SQL แบบข้อสอบและพิมพ์บอก
//   ชื่อร้าย/ผู้ถูกลบ/ไฟล์รอลบ/รถ+จุดรับ ปลูกด้วย SQL แบบข้อสอบ (ตัวแก้การจัดรถยังไม่มี — T1.4b)
// หมายเหตุวิธีจับไฟล์: ปุ่มส่งออกสร้าง Blob แล้วกด <a download> — probe ดัก URL.createObjectURL + การกด <a download> ในหน้า (ไบต์ที่ตรวจ = ไบต์ของ Blob ที่จะถูกบันทึกเป็นไฟล์ · ชื่อไฟล์ = แอตทริบิวต์ download)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

loadTripsQcEnv("probe-trips-t1.4-next");

type Rec = Record<string, unknown>;
type AnyFn = (...a: unknown[]) => unknown;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "qc-probe-trips-t14n";
const SLUG = "trips-t14n-";
const EMAIL_PREFIX = "trips-t14n-";
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const UP = STAMP.toUpperCase().replace(/[^A-Z0-9]/g, "");
const OUT = join(ROOT, ".qc-shots/trips/t1.4-next");
const argv = process.argv.slice(2);
const argOf = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const BASE = (argOf("--base") ?? process.env.QC_BASE ?? "").replace(/\/+$/, "");
const ONLY = (argOf("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!BASE) { console.error("❌ ต้องส่ง --base http://127.0.0.1:<port>"); process.exit(2); }
const baseUrl = new URL(BASE);
if (baseUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(baseUrl.hostname)) { console.error("❌ --base ต้องเป็น server QC ในเครื่อง (http://127.0.0.1:<port>)"); process.exit(2); }
{
  const ping = await fetch(`${BASE}/`, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
  if (ping instanceof Error) { console.error(`❌ ต่อ ${BASE} ไม่ได้: ${ping.message.slice(0, 80)}`); process.exit(2); }
  console.log(`🌐 QC server ${BASE} ตอบ HTTP ${ping.status}`);
}

// ═══════════════ ผลตรวจ ═══════════════
const lines: { sc: string; ok: boolean; what: string; expected: string; got: string }[] = [];
const fmt = (v: unknown): string => { try { return (typeof v === "string" ? v : (JSON.stringify(v) ?? String(v))).slice(0, 300); } catch { return String(v); } };
let SC = "S0";
const check = (what: string, cond: boolean, expected: unknown, got: unknown): boolean => {
  lines.push({ sc: SC, ok: cond, what, expected: fmt(expected), got: fmt(got) });
  console.log(`  ${cond ? "✅" : "❌"} [${SC}] ${what} — expected ${fmt(expected)} · got ${fmt(got)}`);
  return cond;
};
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Rec).sort().map((k) => [k, canon((v as Rec)[k])])) : v);
const eqc = (what: string, got: unknown, expected: unknown) => check(what, JSON.stringify(canon(got)) === JSON.stringify(canon(expected)), expected, got);
const note = (m: string) => console.log(`  ℹ️ [${SC}] ${m}`);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (n = 6) => randomBytes(n).toString("hex");
const rid = (p: string) => `t14n_${p}_${Date.now().toString(36)}${hex(3)}`;

// ═══════════════ pg (แบบเดียวกับข้อสอบ t1.4) ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1] ?? ""); if (l.length) return l; }
  return [];
};
async function insertRow(table: string, vals: Rec): Promise<string> {
  if ((await cols(table)).length === 0) throw new Error(`ไม่มีตาราง ${table}`);
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
async function tablesWithTenant(): Promise<string[]> {
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  return rows.map((r) => r.t).filter((t) => t !== "Tenant");
}
/** ลบเฉพาะร้านที่ id อยู่ในรายการ (ร้านชั่วคราวของสคริปต์นี้) — แบบเดียวกับ cleanupTenants ของข้อสอบ */
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

// ═══════════════ CSV อ้างอิง (RFC 4180 · ไม่พึ่งโค้ดของใบ) ═══════════════
function parseCsv(text: string): string[][] {
  const s = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" && s[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}
/** เซลล์ที่โปรแกรมตารางจะตีเป็นสูตร: ขึ้นต้น = + - @ tab CR (รวมหลังช่องว่าง/BOM นำหน้า) */
const FORMULA_START = /^[\s﻿ ]*[=+\-@\t\r]/;

// ═══════════════ เบราว์เซอร์ ═══════════════
type Cookie = { name: string; value: string; domain: string; path: string };
type PReq = { method(): string; url(): string; headers(): Record<string, string>; postData(): string | undefined; abort(): Promise<void>; continue(): Promise<void> };
type PResp = { status(): number; request(): PReq; buffer(): Promise<Uint8Array> };
type Page = {
  setViewport(v: object): Promise<void>; setCookie(...c: Cookie[]): Promise<void>; on(ev: string, f: (x: never) => void): void;
  goto(url: string, o: object): Promise<{ status(): number } | null>; reload(o: object): Promise<unknown>; url(): string; content(): Promise<string>;
  evaluate<R, A>(f: (a: A) => R, a?: A): Promise<Awaited<R>>; evaluateOnNewDocument(src: string): Promise<unknown>; exposeFunction(name: string, f: AnyFn): Promise<void>;
  waitForSelector(sel: string, o: object): Promise<unknown>; waitForFunction<A>(f: (a: A) => unknown, o: object, a?: A): Promise<unknown>;
  click(sel: string, o?: object): Promise<void>; select(sel: string, ...v: string[]): Promise<string[]>; keyboard: { press(k: string): Promise<void> };
  emulateMediaType(t?: string): Promise<void>; pdf(o: object): Promise<Uint8Array>; setRequestInterception(on: boolean): Promise<void>;
  screenshot(o: object): Promise<unknown>; close(): Promise<void>;
};
type Browser = { newPage(): Promise<Page>; createBrowserContext(): Promise<{ newPage(): Promise<Page> }>; close(): Promise<void> };
type Action = { url: string; headers: Record<string, string>; body: string; at: number };
type Probe = { page: Page; errors: string[]; actions: Action[]; actionResp: { status: number; at: number; raw: Uint8Array | null }[]; blockActions: { on: boolean } };
const T = (id: string) => `[data-testid="${id}"]`;
const THAI_RE = /[ก-ฺเ-๛]/;
const RAW_KEY_RE = /\b(?:manifest|bookings|errors|common|departures|trips)\.[A-Za-z_]+(?:\.[A-Za-z_]+)*/;
const RAW_ENUM_RE = /\b(?:CONFIRMED|PART_PAID|SUBMITTED|VERIFIED|NEEDS_FIX|NOT_COLLECTED|NOT_REQUIRED|MISSING_NAMES|INCOMPLETE|PASSPORT|ID_CARD|UNASSIGNED|VIA_AGENT|GUARDIAN_REQUIRED|NEEDS_RESIGN|PROVIDED|DECLINED|WITHDRAWN|PURGED|COUNTER|GUARANTEED|TRAVELLED|NO_SHOW|CHECKIN|SAFETY)\b|\b(?:HOLD|PENDING|PAID|OPEN|DIRECT)\b/;
const WO_CODE_RE = /\b(?:T[01]\.\d[a-c]?|A1\.\d[a-c]?|OQ\d+|W1\.\d|L1\.\d)\b/;
/** ตัวดักในหน้า (ข้อความ JS — ไม่ผ่านตัวแปลงของ tsx): window.print ปลอม + เวลาเรียก · Blob ที่ถูกสร้างเป็น URL · การกด <a download> */
const HOOK_SRC = `(() => {
  window.__printCalls = 0; window.__printAt = 0; window.__blobs = []; window.__downloads = [];
  window.print = function () { window.__printCalls += 1; window.__printAt = Date.now(); if (typeof window.__probeOnPrint === "function") { window.__probeOnPrint(); } };
  var orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (b) { window.__blobs.push(b); return orig(b); };
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute("download")) { window.__downloads.push({ name: this.getAttribute("download"), href: this.href }); return; } return click.call(this); };
})();`;

const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");
const TRM = (await import("@/lib/modules/trips")) as unknown as Rec;
const TR = TRM as Record<string, AnyFn>;
const SET = (await import("@/lib/core/settings")) as unknown as Record<string, AnyFn>;
const BOX = (await import("@/lib/core/integrations/secret-box")) as unknown as Record<string, AnyFn>;
const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
  const f = TR[name];
  if (typeof f !== "function") return { ok: "NOFN", name };
  try { return ((await f(...a)) as Rec) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
};
const MSG = { th: JSON.parse(readFileSync(join(ROOT, "src/messages/th/trips.json"), "utf8")) as Rec, en: JSON.parse(readFileSync(join(ROOT, "src/messages/en/trips.json"), "utf8")) as Rec };
const mf = (l: "th" | "en") => MSG[l].manifest as Record<string, Record<string, string>>;

mkdirSync(OUT, { recursive: true });
const sessionIds: string[] = [];
const tenantIds: string[] = [];
const profile = `/tmp/chr-trips-probe14-${process.pid}`;
let fatal = "";
let browser: Browser | null = null;
const scenarioResult: Record<string, string> = {};
const T0 = new Date(Date.now() - 5_000);

// ตัวบ่งชี้ที่ปลูก (ต้องไม่รั่ว)
const MK = {
  doc: `ZQ${UP}`.slice(0, 18), phone: `08${String(10_000_000 + (Number.parseInt(hex(3), 16) % 89_999_999)).slice(-8)}`,
  allergy: `zqxalg${STAMP}`, cond: `zqxcnd${STAMP}`, allergyMinor: `zqxalm${STAMP}`, allergyHold: `zqxalh${STAMP}`, allergyBulk: `zqxalb${STAMP}`,
  guardian: `Zqxgrd${STAMP}`, gone: `Zqxgone${STAMP}`, hold: `Zqxhold${STAMP}`, cxl: `Zqxcxl${STAMP}`, other: `Zqxother${STAMP}`, hotel: `Zqxhotel${STAMP}`, tail: `Zqxtail${STAMP}`,
  dobAdult: "1985-02-03", dobMinor: "2016-05-05",
};
const NASTY = { eq: `=HYPERLINK("http://evil.example/${STAMP}","x")`, at: `@SUM(1+1)${STAMP}`, plus: `+1+1${STAMP}`, minus: `-2+3${STAMP}`, multi: `\t=9+9 "อัญ",${STAMP}\nบรรทัดสอง`, place: `=cmd|' /C calc'!A0 ${STAMP}` };
const THAI_NAME = `สมหญิง ทดสอบ${STAMP}`;
/** ข้อมูลภาษาไทยที่ probe ปลูกเอง (ตัดออกก่อนตรวจ "จออังกฤษไม่มีอักษรไทย") */
const THAI_DATA = [THAI_NAME, "อัญ", "บรรทัดสอง"];

try {
  // กวาดซากของสคริปต์นี้เอง (คำนำหน้า trips-t14n- เท่านั้น)
  {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้างของ probe ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers();
    await prisma.session.deleteMany({ where: { userAgent: UA } });
  }

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tN = rid("tN"); const uN = rid("uN"); const uX = rid("uX");
  const unitSlug = `${SLUG}u-${STAMP}`; const unitSlugX = `${SLUG}x-${STAMP}`;
  await insertRow("Tenant", { id: tN, name: `Probe T1.4 ${STAMP}`, slug: `${SLUG}${STAMP}`, updatedAt: new Date() }); tenantIds.push(tN);
  await insertRow("BusinessUnit", { id: uN, tenantId: tN, type: "TRIPS", name: "Probe trips unit", slug: unitSlug, settings: JSON.stringify({ timezone: "Asia/Bangkok" }), updatedAt: new Date() });
  await insertRow("BusinessUnit", { id: uX, tenantId: tN, type: "TRIPS", name: "Probe other unit", slug: unitSlugX, settings: JSON.stringify({ timezone: "Asia/Bangkok" }), updatedAt: new Date() });
  type Actor = { role: string; unitAccess: string[]; permissions: Rec; userId: string };
  const U: Record<string, Actor> = {};
  const mkUser = async (tag: string, role: string, unitAccess: string[], perms: string[]) => {
    const id = rid(`u${tag}`);
    const permissions = Object.fromEntries(perms.map((p) => [p, true]));
    await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `Probe ${tag}`, updatedAt: new Date() });
    await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId: tN, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: new Date(), updatedAt: new Date() });
    U[tag] = { role, unitAccess, permissions, userId: id };
  };
  const BASE_P = ["trips.departure.view", "trips.passenger.view"];
  await mkUser("oa", "OWNER", ["*"], []);
  await mkUser("v", "STAFF", [uN], BASE_P);
  await mkUser("vh", "STAFF", [uN], [...BASE_P, "trips.passenger.health"]);
  await mkUser("nopax", "STAFF", [uN], ["trips.departure.view", "trips.booking.view"]);
  type Prod = { id: string; opt: string; unit: string; adult: string; child: string; cam: string };
  const mkProd = async (key: string, unitId: string): Promise<Prod> => {
    const id = rid(`p${key}`), o = rid(`o${key}`);
    await insertRow("TripProduct", { id, tenantId: tN, unitId, slug: `t14n-${key}-${STAMP}`.toLowerCase(), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทัวร์ทดสอบ ${key}`, en: `Probe Tour ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
    await insertRow("TripOption", { id: o, tenantId: tN, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
    const adult = await insertRow("TripPaxType", { id: rid("pta"), tenantId: tN, unitId, productId: id, code: "ADULT", label: JSON.stringify({ th: "ผู้ใหญ่", en: "Adult" }), countsCapacity: true, active: true, sortOrder: 0, updatedAt: new Date() });
    const child = await insertRow("TripPaxType", { id: rid("ptc"), tenantId: tN, unitId, productId: id, code: "CHILD", label: JSON.stringify({ th: "เด็ก", en: "Child" }), countsCapacity: true, active: true, sortOrder: 1, updatedAt: new Date() });
    const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId: tN, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: 50_000, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
      name: JSON.stringify({ th: "เช่ากล้องกันน้ำ", en: "Waterproof camera" }), active: true, updatedAt: new Date() });
    for (const pt of [adult, child]) await insertRow("TripPrice", { id: rid("pr"), tenantId: tN, unitId, productId: id, optionId: null, paxTypeId: pt, cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: 350_000, weekdayMask: null, priority: 0, updatedAt: new Date() });
    return { id, opt: o, unit: unitId, adult, child, cam };
  };
  const PH = await mkProd("H", uN);
  const PX = await mkProd("X", uX);
  const PAX_FIELD_KEYS = ["fullName", "nationality", "dob", "sex", "docType", "docNumber", "docExpiry", "phone", "birthPlace", "certLevel", "diveCount", "lastDiveAt", "finSize", "allergies", "pickupHotel"];
  const FIELDS = (req: string[], opt: string[] = []) => Object.fromEntries(PAX_FIELD_KEYS.map((k) => [k, req.includes(k) ? "REQUIRED" : opt.includes(k) ? "OPTIONAL" : "OFF"]));
  const optAll = FIELDS(["fullName"], ["nationality", "dob", "sex", "docType", "docNumber", "phone", "finSize", "allergies", "pickupHotel"]);
  {
    const VATREG = { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 };
    const changes: Rec[] = [
      { key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uN, value: VATREG }, { key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uX, value: VATREG },
      { key: "trips.pax.fields", scope: "PRODUCT", scopeId: PH.id, value: optAll }, { key: "trips.pdpa.healthDataProducts", scope: "PRODUCT", scopeId: PH.id, value: true }, { key: "trips.waiver.requiredFor", scope: "PRODUCT", scopeId: PH.id, value: "ALL" },
      { key: "trips.pax.fields", scope: "PRODUCT", scopeId: PX.id, value: optAll }, { key: "trips.waiver.requiredFor", scope: "PRODUCT", scopeId: PX.id, value: "NONE" },
    ];
    const r = ((await SET.setSettings(U.oa, { tenantId: tN }, changes, { ackLegalWarn: true })) as Rec) ?? {};
    if (r.ok !== true) throw new Error(`setSettings: ${fmt(r)}`);
  }
  const todayBkk = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const TRAVEL = new Date(Date.now() + 7 * 3_600_000 + 40 * 86_400_000).toISOString().slice(0, 10);
  let seq = 0;
  const mkDep = async (p: Prod, capacity = 400): Promise<string> => {
    const startsAt = new Date(new Date(`${TRAVEL}T08:00:00+07:00`).getTime() + (seq++ % 600) * 60_000); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: tN, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: TRAVEL, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      status: "OPEN", capacity, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  const staffCtx = (unit: string): Rec => ({ tenantId: tN, unitId: unit, channel: "COUNTER", actor: { kind: "STAFF", userId: U.oa.userId }, now: new Date(), locale: "th" });
  type Bk = { id: string; code: string; dep: string; pax: string[]; names: string[] };
  let bkN = 0;
  const mkBooking = async (p: Prod, dep: string, names: string[], o: { camera?: boolean; children?: number; booker?: string } = {}): Promise<Bk> => {
    const ctx = staffCtx(p.unit);
    const nChild = o.children ?? 0;
    const pax = [{ paxTypeId: p.adult, qty: names.length - nChild }, ...(nChild ? [{ paxTypeId: p.child, qty: nChild }] : [])];
    const ls = [{ productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: dep, optionId: p.opt, pax, extras: o.camera ? [{ extraId: p.cam, qty: 1 }] : [] }];
    const quote = await call("quoteTrips", ctx, { lines: ls }, {});
    if (quote.ok !== true) throw new Error(`quoteTrips: ${fmt(quote)}`);
    const qv = quote.value as Rec;
    bkN++;
    const r = await call("bookTripsNow", ctx, { quote: { lines: ls }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `n${hex(6)}`, booker: { name: o.booker ?? `Probe Booker ${STAMP} ${bkN}`, phone: `08${String(10_000_000 + bkN * 7_919 + Number.parseInt(hex(2), 16)).slice(-8)}` },
      pay: { method: "PAY_LATER" }, passengers: names.map((n, i) => ({ name: n, paxTypeId: i >= names.length - nChild ? p.child : p.adult })) }, {});
    if (r.ok !== true) throw new Error(`bookTripsNow: ${fmt(r)}`);
    const ref = (Array.isArray(r.value) ? (r.value[0] as Rec) : (r.value as Rec)) ?? {};
    const id = String(ref.bookingId);
    const rows = await q<{ id: string; fullName: string }>(`SELECT id, "fullName" FROM "TripPassenger" WHERE "bookingId" = $1 ORDER BY "createdAt", id`, [id]);
    const ids = [...rows].sort((a, b) => names.indexOf(a.fullName) - names.indexOf(b.fullName)).map((x) => x.id);
    if (ids.length !== names.length) throw new Error(`bookTripsNow สร้างผู้เดินทาง ${ids.length} แถว (คาด ${names.length})`);
    // ตรึงลำดับ (createdAt, id) ให้ตรงลำดับชื่อ — แบบเดียวกับข้อสอบ (T0.6 ใช้ createMany)
    for (const [i, pid] of ids.entries()) await pool.query(`UPDATE "TripPassenger" SET "createdAt" = $2 WHERE id = $1`, [pid, new Date(Date.parse("2027-02-01T00:00:00Z") + (seq++) * 1000 + i)]);
    return { id, code: String(ref.code ?? (await q<Rec>(`SELECT code FROM "TripBooking" WHERE id = $1`, [id]))[0]?.code ?? ""), dep, pax: ids, names };
  };
  const HC = (TRM.HEALTH_CONSENT_V1 as Rec) ?? {};
  const seal = (obj: Rec, aad: string): string => String(BOX.sealIntegrationSecret(obj, aad));
  const consentStored = () => ({ version: "trips.health-consent.v1", textHash: String(HC.hash ?? ""), locale: "th", at: new Date().toISOString(), via: "STAFF_RECORDED", signerRole: "SELF" });
  type Plant = { fullName?: string; nationality?: string | null; docType?: string | null; doc?: string | null; phone?: string | null; formStatus?: string; finSize?: string; pickupHotel?: string; isMinor?: boolean;
    health?: { allergies: string | null; conditions: string | null } | "DECLINED" | "WITHDRAWN" | "GUARDIAN_REQUIRED" };
  /** ปลูกด้วย SQL แบบข้อสอบ t1.4 (plantPax) */
  const plantPax = async (pid: string, o: Plant) => {
    const answers: Rec = { v: 1, rev: 1, fields: { ...(o.finSize ? { finSize: o.finSize } : {}), ...(o.pickupHotel ? { pickupHotel: o.pickupHotel } : {}) } };
    if (typeof o.health === "string") answers.health = { status: o.health, at: new Date().toISOString() };
    else if (o.health) answers.health = { status: "PROVIDED", box: seal({ v: 1, allergies: o.health.allergies, conditions: o.health.conditions }, `trips.pax.health.v1:${tN}:${pid}`), consent: consentStored() };
    await pool.query(`UPDATE "TripPassenger" SET "fullName" = COALESCE($2, "fullName"), nationality = $3, "docType" = $4, "docLast4" = $5, "docNumberEnc" = $6, phone = $7, "formStatus" = $8, answers = $9::jsonb, "isMinor" = $10 WHERE id = $1`,
      [pid, o.fullName ?? null, o.nationality ?? null, o.docType ?? null, o.doc ? o.doc.slice(-4) : null, o.doc ? seal({ v: 1, n: o.doc }, `trips.pax.doc.v1:${tN}:${pid}`) : null, o.phone ?? null, o.formStatus ?? "PENDING", JSON.stringify(answers), o.isMinor === true]);
  };
  const revOf = async (pid: string) => Number(((await q<{ answers: Rec | null }>(`SELECT answers FROM "TripPassenger" WHERE id = $1`, [pid]))[0]?.answers ?? {}).rev ?? 0);
  const setStatus = (id: string, status: string) => pool.query(`UPDATE "TripBooking" SET status = $2 WHERE id = $1`, [id, status]);

  // ── รอบหลัก depM (สินค้า H · หน่วยหลัก) ──
  SC = "SETUP";
  console.log("\n── ตั้งข้อมูล ──");
  const depM = await mkDep(PH);
  const bA = await mkBooking(PH, depM, [`Somchai Probe${STAMP}`, `Thirdy Probe${STAMP}`, `Nong Dek${STAMP}`], { camera: true, children: 1 });
  const bB = await mkBooking(PH, depM, [`Hyper Probe${STAMP}`, `Multi Probe${STAMP}`], { booker: `Comma, "Quote" Booker ${STAMP}` }).catch(async (e: unknown) => { note(`ผู้จองชื่อมี , และ " ถูกบริการปฏิเสธ (${errMsg(e)}) — ใช้ชื่อปกติแทน`); return mkBooking(PH, depM, [`Hyper Probe${STAMP}`, `Multi Probe${STAMP}`]); });
  const bC = await mkBooking(PH, depM, [THAI_NAME, `${MK.gone} Erased`]);
  const bD = await mkBooking(PH, depM, [`Plus Probe${STAMP}`, `Minus Probe${STAMP}`, `At Probe${STAMP}`]);
  const bulk: Bk[] = [];
  for (let i = 0; i < 14; i++) bulk.push(await mkBooking(PH, depM, [1, 2, 3, 4].map((k) => `Bulk${String(i + 1).padStart(2, "0")} Pax${k} ${STAMP}`)));
  const bHold = await mkBooking(PH, depM, [`${MK.hold} Holder`]);
  const bCxl = await mkBooking(PH, depM, [`${MK.cxl} Cancelled`]);
  // (1) ผู้ใหญ่กรอกครบ + ลงนาม — ผ่านบริการ T0.8 จริง
  const real = { adultForm: false, adultWaiver: false, minorForm: false, minorWaiver: false };
  const DEPS = { put: async () => undefined, del: async () => 200 };
  const consentIn = { accepted: true, textHash: String(HC.hash ?? ""), locale: "th" };
  let tplHash = "";
  try {
    const rs = ((await SET.resolveSettings({ tenantId: tN }, ["trips.waiver.template"], { unitId: uN, productId: PH.id }, new Date())) as Rec) ?? {};
    const tv = ((rs["trips.waiver.template"] as Rec)?.value as Rec) ?? {};
    tplHash = String((TR.waiverTemplateHash as AnyFn)({ th: String(tv.th ?? ""), ...(typeof tv.en === "string" ? { en: tv.en } : {}) }));
  } catch (e) { note(`อ่านแม่แบบเอกสารรับทราบความเสี่ยงไม่ได้: ${errMsg(e)}`); }
  {
    const r = await call("updateTripPassenger", staffCtx(uN), { passengerId: bA.pax[0], expectedRev: await revOf(bA.pax[0]), idempotencyKey: `u${hex(6)}`,
      fields: { nationality: "TH", dob: MK.dobAdult, sex: "M", docType: "PASSPORT", docNumber: MK.doc, phone: MK.phone, finSize: "42", pickupHotel: MK.hotel }, health: { consent: consentIn, allergies: MK.allergy, conditions: MK.cond } }, DEPS);
    real.adultForm = r.ok === true;
    if (!real.adultForm) { note(`updateTripPassenger (ผู้ใหญ่) ไม่สำเร็จ ⇒ ปลูกด้วย SQL แทน: ${fmt(r)}`); await plantPax(bA.pax[0], { nationality: "TH", docType: "PASSPORT", doc: MK.doc, phone: MK.phone, formStatus: "SUBMITTED", finSize: "42", pickupHotel: MK.hotel, health: { allergies: MK.allergy, conditions: MK.cond } }); }
    const w = await call("recordWitnessedWaiver", staffCtx(uN), { passengerId: bA.pax[0], idempotencyKey: `ww${hex(5)}`, templateHash: tplHash, locale: "th", signerName: `Somchai Probe${STAMP}`, signerRole: "SELF", isMinorDeclared: false, signatureImage: { contentType: "image/png", data: (() => { const b = new Uint8Array(64); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return b; })() } }, DEPS);
    real.adultWaiver = w.ok === true;
    if (!real.adultWaiver) note(`recordWitnessedWaiver (ผู้ใหญ่) ไม่สำเร็จ: ${fmt(w)}`);
  }
  // (2) ผู้เยาว์ + ผู้ปกครอง — ผ่านบริการ T0.8 จริง
  {
    const pid = bA.pax[2];
    const r = await call("updateTripPassenger", staffCtx(uN), { passengerId: pid, expectedRev: await revOf(pid), idempotencyKey: `u${hex(6)}`,
      fields: { nationality: "TH", dob: MK.dobMinor, finSize: "34" }, health: { consent: consentIn, allergies: MK.allergyMinor }, guardian: { name: MK.guardian, relation: "PARENT" } }, DEPS);
    real.minorForm = r.ok === true;
    if (!real.minorForm) { note(`updateTripPassenger (ผู้เยาว์+ผู้ปกครอง) ไม่สำเร็จ ⇒ ปลูกด้วย SQL แทน: ${fmt(r)}`); await plantPax(pid, { nationality: "TH", formStatus: "SUBMITTED", finSize: "34", isMinor: true, health: { allergies: MK.allergyMinor, conditions: null } }); }
    const w = await call("recordWitnessedWaiver", staffCtx(uN), { passengerId: pid, idempotencyKey: `ww${hex(5)}`, templateHash: tplHash, locale: "th", signerName: MK.guardian, signerRole: "GUARDIAN", guardian: { name: MK.guardian, relation: "PARENT" }, signatureImage: { contentType: "image/png", data: (() => { const b = new Uint8Array(64); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return b; })() } }, DEPS);
    real.minorWaiver = w.ok === true;
    if (!real.minorWaiver) note(`recordWitnessedWaiver (ผู้ปกครอง) ไม่สำเร็จ: ${fmt(w)}`);
  }
  note(`ผู้เดินทางผ่านบริการจริง: ${fmt(real)}`);
  // (3) ที่เหลือปลูกด้วย SQL แบบข้อสอบ
  await pool.query(`UPDATE "TripPassenger" SET "fullName" = '', "formStatus" = 'PENDING', answers = '{}'::jsonb WHERE id = $1`, [bA.pax[1]]); // ยังไม่กรอกชื่อ
  await plantPax(bB.pax[0], { fullName: NASTY.eq, formStatus: "VERIFIED", finSize: "42", health: "DECLINED" });
  await plantPax(bB.pax[1], { fullName: NASTY.multi, formStatus: "SUBMITTED" });
  await plantPax(bC.pax[0], { fullName: THAI_NAME, nationality: "TH", docType: "ID_CARD", doc: "1100700123456", formStatus: "SUBMITTED", finSize: "38", health: "WITHDRAWN" });
  // ผู้ถูกลบ: ธง purged ALL — จงใจ "ทิ้งชื่อไว้ในคอลัมน์" (การลบจริงล้างชื่อด้วย) เพื่อดูว่าชั้นแสดงผล/ไฟล์ไม่พึ่งการล้างคอลัมน์
  await pool.query(`UPDATE "TripPassenger" SET nationality = NULL, dob = NULL, sex = NULL, "docType" = NULL, "docNumberEnc" = NULL, "docLast4" = NULL, phone = NULL, "guardianConsent" = NULL, "waiverEvidence" = NULL, answers = $2::jsonb WHERE id = $1`,
    [bC.pax[1], JSON.stringify({ v: 1, rev: 2, fields: {}, purged: { at: new Date().toISOString(), stages: ["ALL"] } })]);
  await plantPax(bD.pax[0], { fullName: NASTY.plus, formStatus: "SUBMITTED" });
  await plantPax(bD.pax[1], { fullName: NASTY.minus, formStatus: "NEEDS_FIX" });
  await plantPax(bD.pax[2], { fullName: NASTY.at, formStatus: "SUBMITTED", health: "GUARDIAN_REQUIRED", isMinor: true });
  await plantPax(bulk[0].pax[0], { formStatus: "SUBMITTED", finSize: "40", health: { allergies: MK.allergyBulk, conditions: null } });
  await plantPax(bHold.pax[0], { formStatus: "SUBMITTED", health: { allergies: MK.allergyHold, conditions: null } });
  await plantPax(bCxl.pax[0], { formStatus: "SUBMITTED", health: { allergies: `${MK.allergyHold}-cxl`, conditions: null } });
  await setStatus(bHold.id, "HOLD"); await setStatus(bCxl.id, "CANCELLED");
  // ไฟล์: ผู้ใหญ่คนแรก 1 ไฟล์ปกติ + 1 รอลบวัตถุ · ผู้ถูกลบ 1 รอลบวัตถุ
  const d0 = new Date(Date.now() - 86_400_000);
  await insertRow("TripDocument", { id: rid("doc"), tenantId: tN, unitId: uN, passengerId: bA.pax[0], kind: "PASSPORT", fileId: `zqxfile${STAMP}live`, consent: null, retainUntil: new Date(Date.now() + 400 * 86_400_000), deletedAt: null, updatedAt: new Date() });
  await insertRow("TripDocument", { id: rid("doc"), tenantId: tN, unitId: uN, passengerId: bA.pax[0], kind: "MEDICAL", fileId: `zqxfile${STAMP}pend`, consent: JSON.stringify({ purgeStage: "ERASE", objDel: false }), retainUntil: d0, deletedAt: d0, updatedAt: new Date() });
  await insertRow("TripDocument", { id: rid("doc"), tenantId: tN, unitId: uN, passengerId: bC.pax[1], kind: "PASSPORT", fileId: `zqxfile${STAMP}erasedpend`, consent: JSON.stringify({ purgeStage: "ERASE", objDel: false }), retainUntil: d0, deletedAt: d0, updatedAt: new Date() });
  // หน่วยอื่น (ร้านเดียวกัน): รอบ + การจอง 1 ใบ — ใช้ทดสอบข้ามหน่วย และเป็น bookingId แปลกปลอมในจุดรับ
  const depX = await mkDep(PX);
  const bX = await mkBooking(PX, depX, [`${MK.other} OtherUnit`]);
  // ทรัพยากร + การจัดรถ (ปลูกตรง — ตัวแก้การจัดรถเป็นของ T1.4b)
  const van1 = await insertRow("TripResource", { id: rid("van"), tenantId: tN, unitId: uN, kind: "VAN", name: `Van One ${STAMP}`, seats: 4, active: true, updatedAt: new Date() });
  const van2 = await insertRow("TripResource", { id: rid("van"), tenantId: tN, unitId: uN, kind: "VAN", name: `Van Two ${STAMP}`, seats: 12, active: true, updatedAt: new Date() });
  const boat1 = await insertRow("TripResource", { id: rid("boat"), tenantId: tN, unitId: uN, kind: "BOAT", name: `Boat ${STAMP}`, seats: 60, active: true, updatedAt: new Date() });
  const guide1 = await insertRow("TripResource", { id: rid("gd"), tenantId: tN, unitId: uN, kind: "GUIDE", name: `Guide ${STAMP}`, seats: null, active: true, updatedAt: new Date() });
  const depRowM = (await q<{ startsAt: Date; endsAt: Date }>(`SELECT "startsAt", "endsAt" FROM "TripDeparture" WHERE id = $1`, [depM]))[0];
  for (const res of [boat1, guide1]) await insertRow("TripResourceUse", { id: rid("use"), tenantId: tN, unitId: uN, resourceId: res, departureId: depM, startsAt: depRowM?.startsAt, endsAt: depRowM?.endsAt, active: true, updatedAt: new Date() });
  const run1 = await insertRow("TripVehicleRun", { id: rid("run"), tenantId: tN, unitId: uN, departureId: depM, resourceId: van1, createdAt: new Date(Date.now() - 2000), updatedAt: new Date(),
    stops: JSON.stringify([{ bookingId: bA.id, place: NASTY.place, note: "Lobby", time: "06:45" }, { bookingId: bB.id, place: "Karon Sea Sands", time: "07:10" }, { bookingId: bCxl.id, place: "Stop of cancelled booking", time: "07:20" }, { bookingId: bX.id, place: `Foreign stop ${MK.other}`, time: "07:22" }, "junk"]) });
  const run2 = await insertRow("TripVehicleRun", { id: rid("run"), tenantId: tN, unitId: uN, departureId: depM, resourceId: van2, createdAt: new Date(Date.now() - 1000), updatedAt: new Date(),
    stops: JSON.stringify([{ bookingId: bC.id, place: "Chalong Villa", note: "House 12/4", time: "07:35" }, { bookingId: bulk[0].id, place: "Kata Beach Resort", time: "07:50" }, { bookingId: bulk[1].id, place: "Kata Beach Resort", time: "07:50" }]) });
  // รอบที่เริ่มแล้ว (จองตอนยังเป็นอนาคตแล้วเลื่อนเวลาย้อน) + รอบที่ยกเลิก
  const depS = await mkDep(PH);
  const bS = await mkBooking(PH, depS, [`Started Probe${STAMP}`]);
  await pool.query(`UPDATE "TripDeparture" SET "startsAt" = $2, "endsAt" = $3, "cutoffAt" = $2, "localDate" = $4::date WHERE id = $1`, [depS, new Date(Date.now() - 2 * 3_600_000), new Date(Date.now() + 6 * 3_600_000), todayBkk]);
  await pool.query(`UPDATE "TripBooking" SET "travelDate" = $2::date WHERE id = $1`, [bS.id, todayBkk]).catch(() => undefined);
  const depC = await mkDep(PH);
  await pool.query(`UPDATE "TripDeparture" SET status = 'CANCELLED' WHERE id = $1`, [depC]);
  // รอบเกินเพดานผู้เดินทาง: การจองแรกมีแถวผู้เดินทาง 606 แถว (ปลูกตรงแบบข้อสอบ BT-19) · การจองหลังมี 2 คนมีชื่อ
  const depCap = await mkDep(PH);
  const bCap1 = await mkBooking(PH, depCap, [`Cap Head ${STAMP}`]);
  const bCap2 = await mkBooking(PH, depCap, [`${MK.tail} A`, `${MK.tail} B`]);
  await pool.query(`INSERT INTO "TripPassenger" (id, "tenantId", "unitId", "bookingId", "fullName", answers, "formStatus", "isMinor", "createdAt", "updatedAt")
    SELECT 't14n_cap_' || $5 || '_' || g, $1, $2, $3, 'Cap Pax ' || g || ' ' || $5, '{}'::jsonb, 'PENDING', false, $4::timestamptz + (g || ' seconds')::interval, now() FROM generate_series(1, 605) g`, [tN, uN, bCap1.id, new Date("2027-02-02T00:00:00Z"), STAMP]);
  const seed = (await q<{ id: string }>(`SELECT d.id FROM "TripDeparture" d JOIN "Tenant" t ON t.id = d."tenantId" WHERE t.slug = 'andaman-dive' ORDER BY d."startsAt" DESC LIMIT 1`).catch(() => []))[0];
  console.log(`  ℹ️ ร้าน ${tN} · หน่วย ${unitSlug} · รอบหลัก ${depM} · การจองในใบ ${4 + bulk.length} (+ HOLD 1 · ยกเลิก 1) · รอบเกินเพดาน ${depCap}`);

  // ค่าคาดหวังจาก SQL อิสระ
  const M_ST = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
  const sqlFacts = async (dep: string) => {
    const r = (await q<Rec>(`SELECT
      (SELECT count(*)::int FROM "TripBooking" b WHERE b."departureId" = $1 AND b.status = ANY($2::text[])) AS bookings,
      (SELECT COALESCE(sum(i.qty), 0)::int FROM "TripBookingItem" i JOIN "TripBooking" b ON b.id = i."bookingId" WHERE b."departureId" = $1 AND b.status = ANY($2::text[]) AND i.active AND i.kind = 'SEAT') AS people,
      (SELECT count(*)::int FROM "TripPassenger" p JOIN "TripBooking" b ON b.id = p."bookingId" WHERE b."departureId" = $1 AND b.status = ANY($2::text[])) AS slots,
      (SELECT count(*)::int FROM "TripPassenger" p JOIN "TripBooking" b ON b.id = p."bookingId" WHERE b."departureId" = $1 AND b.status = ANY($2::text[]) AND COALESCE(p.answers->'purged'->'stages' ? 'ALL', false)) AS purged,
      (SELECT count(*)::int FROM "TripPassenger" p JOIN "TripBooking" b ON b.id = p."bookingId" WHERE b."departureId" = $1 AND b.status = ANY($2::text[]) AND btrim(p."fullName") <> '' AND NOT COALESCE(p.answers->'purged'->'stages' ? 'ALL', false)) AS named,
      (SELECT count(*)::int FROM "TripPassenger" p JOIN "TripBooking" b ON b.id = p."bookingId" WHERE b."departureId" = $1 AND b.status = ANY($2::text[]) AND p.answers->'health'->>'status' = 'PROVIDED' AND NOT COALESCE(p.answers->'purged'->'stages' ? 'ALL', false)) AS health`, [dep, M_ST]))[0] ?? {};
    return { bookings: Number(r.bookings), people: Number(r.people), slots: Number(r.slots), purged: Number(r.purged), named: Number(r.named), health: Number(r.health) };
  };
  const F = await sqlFacts(depM);
  note(`SQL: ${fmt(F)}`);
  type Aud = { id: string; action: string; actorId: string | null; unitId: string | null; targetType: string | null; targetId: string | null; after: Rec | null; before: Rec | null; createdAt: Date };
  const audits = async (action: string) => q<Aud>(`SELECT id, action, "actorId", "unitId", "targetType", "targetId", after, before, "createdAt" FROM "AuditLog" WHERE "tenantId" = $1 AND action = $2 ORDER BY "createdAt", id`, [tN, action]);
  const SENSITIVE = [MK.doc, MK.phone, MK.phone.slice(3), MK.allergy, MK.cond, MK.allergyMinor, MK.allergyHold, MK.allergyBulk, MK.guardian, MK.dobAdult, MK.dobMinor, "1100700123456"];
  const NOT_ON_SHEET = [MK.gone, MK.hold, MK.cxl, MK.other];
  const leaks = (text: string, list: readonly string[]) => list.filter((m) => m.length > 0 && text.includes(m));

  // ═══════════════ session + เบราว์เซอร์ ═══════════════
  const mint = async (userId: string): Promise<Cookie[]> => {
    const token = "prb" + Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const ttl = new Date(Date.now() + 60 * 60 * 1000);
    const s = await prisma.session.create({ data: { userId, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
    sessionIds.push(s.id);
    return [{ name: "shark_session", value: token, domain: baseUrl.hostname, path: "/" }, { name: "shark_tenant", value: tN, domain: baseUrl.hostname, path: "/" }];
  };
  const CK = { oa: await mint(U.oa.userId), v: await mint(U.v.userId), vh: await mint(U.vh.userId), nopax: await mint(U.nopax.userId) };
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string)) as { default: { launch(o: object): Promise<Browser> } };
  browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${profile}`] });
  const B = browser;
  const open = async (cookies: Cookie[], o: { mobile?: boolean; locale?: "th" | "en"; onPrint?: () => Promise<void> } = {}): Promise<Probe> => {
    // บริบทเบราว์เซอร์แยกต่อหน้า — cookie ของผู้ใช้แต่ละคนไม่ทับกัน (หน้าเก่ายังเป็นผู้ใช้เดิมแม้เปิดหน้าของผู้ใช้อื่นทีหลัง)
    const page = await (await B.createBrowserContext()).newPage();
    await page.setViewport(o.mobile ? { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.setCookie(...cookies, { name: "LOCALE", value: o.locale ?? "th", domain: baseUrl.hostname, path: "/" });
    await page.evaluateOnNewDocument(HOOK_SRC);
    if (o.onPrint) await page.exposeFunction("__probeOnPrint", o.onPrint as AnyFn);
    const pr: Probe = { page, errors: [], actions: [], actionResp: [], blockActions: { on: false } };
    await page.setRequestInterception(true);
    page.on("pageerror", (e: never) => pr.errors.push(String((e as Error).message).slice(0, 160)));
    page.on("request", (r: never) => {
      const x = r as PReq; const h = x.headers();
      const isAction = x.method() === "POST" && typeof h["next-action"] === "string";
      if (isAction) pr.actions.push({ url: x.url(), headers: h, body: x.postData() ?? "", at: Date.now() });
      void (isAction && pr.blockActions.on ? x.abort() : x.continue()).catch(() => undefined);
    });
    page.on("response", (r: never) => { const x = r as PResp; if (x.request().method() === "POST" && typeof x.request().headers()["next-action"] === "string") { const rec: { status: number; at: number; raw: Uint8Array | null } = { status: x.status(), at: Date.now(), raw: null }; pr.actionResp.push(rec); void x.buffer().then((b) => { rec.raw = b; }).catch(() => undefined); } });
    return pr;
  };
  const mfUrl = (dep: string, qs = "", slug = unitSlug) => `${BASE}/app/u/${slug}/trips/departures/${encodeURIComponent(dep)}/manifest${qs ? `?${qs}` : ""}`;
  const goUrl = async (pr: Probe, url: string): Promise<number> => {
    const resp = await pr.page.goto(url, { waitUntil: "networkidle2", timeout: 120_000 }).catch(() => null);
    await sleep(500);
    return resp?.status() ?? 0;
  };
  const has = (pr: Probe, id: string) => pr.page.evaluate((s: string) => document.querySelector(s) !== null, T(id));
  const textOf = (pr: Probe, sel: string) => pr.page.evaluate((s: string) => (document.querySelector(s) as HTMLElement | null)?.innerText ?? null, sel);
  const waitFor = (pr: Probe, id: string, ms = 20_000) => pr.page.waitForSelector(T(id), { timeout: ms }).then(() => true).catch(() => false);
  const clickId = async (pr: Probe, id: string) => { await pr.page.click(T(id)); await sleep(350); };
  const overflow = (pr: Probe, vw: number) => pr.page.evaluate((w: number) => document.documentElement.scrollWidth > w + 2, vw);
  const shot = async (pr: Probe, name: string, fullPage = false) => { await pr.page.screenshot({ path: join(OUT, `${name}.png`), fullPage }); };
  const html = (pr: Probe) => pr.page.evaluate(() => document.documentElement.outerHTML);
  /** ข้อความที่ผู้ใช้เห็น/โปรแกรมอ่านจออ่าน ของบริเวณใบรายชื่อ (ไม่รวมผังพิมพ์ที่ซ่อนอยู่) */
  const visibleText = (pr: Probe) => pr.page.evaluate(() => {
    const parts: string[] = [];
    const root = document.querySelector('[data-testid="trips-mf"]') as HTMLElement | null;
    if (root) parts.push(root.innerText);
    for (const d of Array.from(document.querySelectorAll('[role="dialog"]'))) if (!root || !root.contains(d)) parts.push((d as HTMLElement).innerText);
    const scope = root ?? document.body;
    for (const e of Array.from(scope.querySelectorAll("[aria-label],[title],[placeholder],[alt]"))) { if (e.closest("[data-print-root]")) continue; for (const a of ["aria-label", "title", "placeholder", "alt"]) { const v = e.getAttribute(a); if (v) parts.push(v); } }
    return parts.join("\n");
  });
  const visibleIds = (pr: Probe, prefix: string) => pr.page.evaluate((p: string) => Array.from(document.querySelectorAll(`[data-testid^="${p}"]`)).filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getAttribute("data-testid") ?? ""), prefix);
  const firstMatch = (text: string, re: RegExp): string | null => { for (const l of text.split("\n")) if (re.test(l)) return l.trim().slice(0, 160); return null; };
  const stripData = (text: string) => { let s = text; for (const d of [...THAI_DATA, ...Object.values(NASTY)]) s = s.split(d).join(" "); return s.replace(/"อัญ"/g, " "); };
  const textChecks = (label: string, raw: string, locale: "th" | "en") => {
    const text = stripData(raw);
    check(`${label}: ไม่มีคีย์ข้อความดิบ (manifest.* / errors.* …)`, !RAW_KEY_RE.test(text), "ไม่มี", firstMatch(text, RAW_KEY_RE) ?? "ไม่มี");
    check(`${label}: ไม่มีรหัส enum ดิบบนจอ`, !RAW_ENUM_RE.test(text), "ไม่มี", firstMatch(text, RAW_ENUM_RE) ?? "ไม่มี");
    check(`${label}: ไม่มีรหัสใบงาน / คำว่า POS บนจอ`, !WO_CODE_RE.test(text) && !/\bPOS\b/.test(text), "ไม่มี", firstMatch(text, WO_CODE_RE) ?? firstMatch(text, /\bPOS\b/) ?? "ไม่มี");
    if (locale === "en") check(`${label}: จออังกฤษไม่มีอักษรไทย (นอกข้อมูลที่ปลูก)`, !THAI_RE.test(text), "ไม่มี", firstMatch(text, THAI_RE) ?? "ไม่มี");
  };
  /** ยิง server action ที่จับได้ซ้ำจากหน้าของผู้ใช้อื่น (cookie ของหน้านั้น) */
  const replay = (pr: Probe, a: Action) => pr.page.evaluate(async (x: { url: string; headers: Record<string, string>; body: string }) => {
    try { const r = await fetch(x.url, { method: "POST", headers: x.headers, body: x.body, credentials: "same-origin" }); return { status: r.status, text: await r.text() }; } catch (e) { return { status: -1, text: String(e) }; }
  }, { url: a.url, headers: Object.fromEntries(Object.entries(a.headers).filter(([k]) => ["next-action", "accept", "content-type", "next-router-state-tree"].includes(k.toLowerCase()))), body: a.body });
  const blobBytes = (pr: Probe, i: number) => pr.page.evaluate(async (n: number) => {
    const b = (window as unknown as { __blobs: Blob[] }).__blobs[n];
    if (!b) return null;
    return { type: b.type, bytes: Array.from(new Uint8Array(await b.arrayBuffer())) };
  }, i);
  const pageVar = <R,>(pr: Probe, name: string) => pr.page.evaluate((n: string) => (window as unknown as Record<string, unknown>)[n] as R, name);
  const want = (n: string) => ONLY.length === 0 || ONLY.includes(n);
  const run = async (n: string, title: string, fn: () => Promise<void>) => {
    if (!want(n)) { scenarioResult[n] = "SKIPPED(--only)"; return; }
    SC = `S${n}`;
    console.log(`\n── ฉาก ${n}: ${title} ──`);
    const before = lines.length;
    try { await fn(); } catch (e) { check(`ฉาก ${n} ล้มกลางคัน`, false, "จบฉาก", errMsg(e)); }
    const mine = lines.slice(before);
    scenarioResult[n] = mine.every((l) => l.ok) ? `PASS (${mine.length})` : `FAIL (${mine.filter((l) => !l.ok).length}/${mine.length})`;
  };
  const oaCtx = { tenantId: tN, actorUserId: U.oa.userId };
  const vmOf = async (who: string, dep: string, view?: string) => { const r = await call("loadManifestVM", { tenantId: tN, actorUserId: U[who].userId }, { unitId: uN, departureId: dep, ...(view ? { view } : {}) }); return r.ok === true ? (r.vm as Rec) : null; };
  const rowsOfVm = (vm: Rec | null) => ((vm?.groups as Rec[]) ?? []).flatMap((g) => (g.rows as Rec[]) ?? []);
  let exportAction: Action | null = null;
  let healthAction: Action | null = null;
  /** จำนวนครั้งที่ probe เรียกบริการส่งออกตรง (เพื่อวินิจฉัย) — แต่ละครั้งเขียน audit 1 แถว */
  let exportSvcCalls = 0;

  // ═══════════════ ฉาก 1: 2 มุมมอง · กลุ่ม/แถว/การ์ดสรุป · ขยายรายคน · 1440/390 · อังกฤษ ═══════════════
  await run("1", "2 มุมมอง: กลุ่ม/แถว/การ์ดสรุป · ขยายรายคน · ไม่ล้นที่ 1440/390 · อังกฤษ", async () => {
    const vm = await vmOf("oa", depM);
    check("ตัวโหลด (เจ้าของ) คืน VM", vm !== null, "ok", vm ? "ok" : "ไม่ได้ VM");
    const travA = ((rowsOfVm(vm).find((r) => r.bookingId === bA.id)?.travellers as Rec[]) ?? []);
    note(`ผู้เดินทางของการจองแรกตาม VM: ${fmt(travA.map((t) => [t.no, t.formStatus, t.waiver, t.health, t.isMinor, t.docMasked, t.docs]))}`);
    check("ผู้ใหญ่กรอกครบ+ลงนาม (บริการจริง) ⇒ waiver SIGNED · health PROVIDED · เลขเอกสารปิดบัง 4 ตัวท้าย · ไฟล์ live 2 (หนังสือเดินทาง + ลายเซ็นเอกสารรับทราบความเสี่ยง) รอลบ 1", travA[0]?.waiver === "SIGNED" && travA[0]?.health === "PROVIDED" && travA[0]?.docMasked === `••••${MK.doc.slice(-4)}` && JSON.stringify(travA[0]?.docs) === JSON.stringify({ live: 2, pendingDeletion: 1 }), "SIGNED/PROVIDED/••••" + MK.doc.slice(-4) + "/{2,1}", [travA[0]?.waiver, travA[0]?.health, travA[0]?.docMasked, travA[0]?.docs]);
    check("ผู้เยาว์+ผู้ปกครอง (บริการจริง) ⇒ isMinor true · health PROVIDED · waiver SIGNED", travA[2]?.isMinor === true && travA[2]?.health === "PROVIDED" && travA[2]?.waiver === "SIGNED", "true/PROVIDED/SIGNED", [travA[2]?.isMinor, travA[2]?.health, travA[2]?.waiver]);
    const po = await open(CK.oa);
    const st = await goUrl(po, mfUrl(depM));
    check("เจ้าของเปิดใบรายชื่อ (ตามรถรับส่ง) ได้", st === 200 && (await has(po, "trips-mf")), "200 + trips-mf", st);
    const groups = await po.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="trips-mf-group-"]')).map((e) => e.getAttribute("data-testid")));
    eqc("กลุ่มบนจอ = รถ 1 → รถ 2 → ยังไม่จัดรถ", groups, [`trips-mf-group-run:${run1}`, `trips-mf-group-run:${run2}`, "trips-mf-group-unassigned"]);
    const rowIds = async (pr: Probe) => [...new Set(await visibleIds(pr, "trips-mf-row-"))].map((s) => s.replace("trips-mf-row-", ""));
    const r1 = await rowIds(po);
    eqc("แถวที่เห็น = การจองในใบทั้งหมด (ไม่มี HOLD/ยกเลิก/หน่วยอื่น)", [...r1].sort(), [bA, bB, bC, bD, ...bulk].map((b) => b.id).sort());
    eqc("ลำดับแถวต้นใบ: รถ 1 (จุดรับ 06:45 → 07:10) แล้วรถ 2 (07:35 → 07:50 → 07:50)", r1.slice(0, 5), [bA.id, bB.id, bC.id, bulk[0].id, bulk[1].id]);
    const kpi = async (pr: Probe, id: string) => ((await textOf(pr, T(id))) ?? "").replace(/\s+/g, " ").trim();
    const kPeople = await kpi(po, "trips-mf-kpi-people");
    check(`การ์ดผู้เดินทาง = ${F.people} คน · ${F.bookings} การจอง (SQL)`, kPeople.includes(String(F.people)) && kPeople.includes(`${F.bookings} การจอง`), `${F.people} / ${F.bookings} การจอง`, kPeople);
    const kNames = await kpi(po, "trips-mf-kpi-names");
    check(`การ์ดรายชื่อครบ = ${F.named} / ${F.people} (SQL)`, kNames.includes(`${F.named} / ${F.people}`), `${F.named} / ${F.people}`, kNames);
    const kPick = await kpi(po, "trips-mf-kpi-pickup");
    const assigned = 3 + 2 + 2 + 4 + 4;
    check(`การ์ดรับส่ง: จัดรถแล้ว ${assigned} คน · รถ 2 คัน · ยังไม่จัด ${F.people - assigned} คน`, kPick.includes(`จัดรถแล้ว ${assigned} คน`) && kPick.includes("รถ 2 คัน") && kPick.includes(`${F.people - assigned} คน`), `${assigned}/2/${F.people - assigned}`, kPick);
    note(`การ์ดลงนาม: ${await kpi(po, "trips-mf-kpi-waiver")} · การ์ดต้องเตรียม: ${await kpi(po, "trips-mf-kpi-prep")}`);
    check("การ์ดค้างชำระแสดงสำหรับเจ้าของ (มี ฿)", ((await kpi(po, "trips-mf-kpi-money")) ?? "").includes("฿"), "มี ฿", await kpi(po, "trips-mf-kpi-money"));
    check("แถบแจ้ง: มีการจองยังไม่ยืนยัน 1 (HOLD)", ((await textOf(po, T("trips-mf-pending-note"))) ?? "").includes("1"), "มี 1", await textOf(po, T("trips-mf-pending-note")));
    check("แถบแจ้ง: จุดรับค้าง 2 (ยกเลิก + หน่วยอื่น)", ((await textOf(po, T("trips-mf-stale-note"))) ?? "").includes("2"), "มี 2", await textOf(po, T("trips-mf-stale-note")));
    const over = await po.page.evaluate((id: string) => document.querySelector(`[data-testid="trips-mf-group-run:${id}"] [data-over="true"]`) !== null, run1);
    check("รถ 1 (4 ที่นั่ง · 5 คน) แสดงเกินที่นั่งด้วยสีอันตราย + ไอคอน", over, "data-over", over);
    const stateA = await po.page.evaluate((id: string) => document.querySelector(`[data-testid="trips-mf-row-${id}"]`)?.getAttribute("data-doc-state") ?? null, bA.id);
    eqc("การจองแรก (3 ที่ · ชื่อ 2) = ขาดรายชื่อ", stateA, "MISSING_NAMES");
    // ขยายรายคน
    await clickId(po, `trips-mf-pax-toggle-${bA.id}`);
    const paxTxt = (await po.page.evaluate((id: string) => Array.from(document.querySelectorAll(`[data-testid="trips-mf-pax-${id}"]`)).filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e as HTMLElement).innerText).join("\n"), bA.id)).replace(/\s+/g, " ");
    check("ขยายรายคน: เห็นชื่อ · เลขเอกสารปิดบัง · ผู้เยาว์ · ยังไม่กรอกชื่อ · ไฟล์ 2 + รอลบ 1", paxTxt.includes(`Somchai Probe${STAMP}`) && paxTxt.includes(`••••${MK.doc.slice(-4)}`) && paxTxt.includes("ผู้เยาว์") && paxTxt.includes("ยังไม่กรอกชื่อ") && paxTxt.includes("2 ไฟล์ · รอลบ 1"), "ครบ", paxTxt.slice(0, 280));
    eqc("ขยายรายคน: ไม่มีเลขเอกสารเต็ม/เบอร์/วันเกิด/ผู้ปกครอง/เนื้อหาสุขภาพ", leaks(paxTxt, SENSITIVE), []);
    await shot(po, "s1-pickup-1440-expanded", true);
    await clickId(po, `trips-mf-pax-toggle-${bA.id}`);
    eqc("กดซ้ำ ⇒ รายคนหุบ", (await visibleIds(po, `trips-mf-pax-${bA.id}`)).length, 0);
    // ผู้ถูกลบ
    await clickId(po, `trips-mf-pax-toggle-${bC.id}`);
    const paxC = (await po.page.evaluate((id: string) => Array.from(document.querySelectorAll(`[data-testid="trips-mf-pax-${id}"]`)).filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e as HTMLElement).innerText).join("\n"), bC.id)).replace(/\s+/g, " ");
    check("ผู้เดินทางที่ถูกลบ: แสดง \"ลบตามนโยบายแล้ว\" ไม่มีชื่อ (แม้คอลัมน์ชื่อยังมีค่า)", paxC.includes("ลบตามนโยบายแล้ว") && !paxC.includes(MK.gone), "ลบตามนโยบายแล้ว · ไม่มีชื่อ", paxC.slice(0, 220));
    check("ไม่ล้นแนวนอนที่ 1440 (ตามรถรับส่ง)", !(await overflow(po, 1440)), "ไม่ล้น", await po.page.evaluate(() => document.documentElement.scrollWidth));
    const tblScroll = await po.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="trips-mf-table"]')).map((e) => [e.scrollWidth, e.clientWidth]));
    check("ตารางไม่ต้องเลื่อนแนวนอนที่ 1440", tblScroll.every(([s, c]) => s <= c + 2), "scrollWidth ≤ clientWidth", tblScroll);
    const full = await html(po);
    eqc("HTML/ข้อมูลที่ส่งถึงเบราว์เซอร์ (เจ้าของ): ไม่มีเลขเอกสารเต็ม · เบอร์เต็ม · วันเกิด · ชื่อผู้ปกครอง · เนื้อหาสุขภาพ", leaks(full, SENSITIVE), []);
    eqc("HTML (เจ้าของ): ไม่มีชื่อผู้ถูกลบ · ผู้เดินทางของ HOLD/ยกเลิก · หน่วยอื่น · รหัสไฟล์", leaks(full, [...NOT_ON_SHEET, `zqxfile${STAMP}`]), []);
    textChecks("ไทย: ตามรถรับส่ง", await visibleText(po), "th");
    // มุมมองตามการจอง (กดตัวสลับ)
    await clickId(po, "trips-mf-view-booking"); await sleep(1200);
    check("กดตัวสลับ ⇒ URL มี ?view=booking และกลุ่มเดียว \"การจองทั้งหมด\"", po.page.url().includes("view=booking") && (await has(po, "trips-mf-group-all")), "view=booking + group-all", po.page.url());
    const r2 = await rowIds(po);
    const codeOrder = [bA, bB, bC, bD, ...bulk].sort((a, b) => a.code.localeCompare(b.code)).map((b) => b.id);
    eqc("มุมมองตามการจอง: แถวเรียงตามเลขจอง", r2, codeOrder);
    await shot(po, "s1-booking-1440");
    check("ไม่ล้นแนวนอนที่ 1440 (ตามการจอง)", !(await overflow(po, 1440)), "ไม่ล้น", await po.page.evaluate(() => document.documentElement.scrollWidth));
    // พารามิเตอร์เสีย
    const stBad = await goUrl(po, mfUrl(depM, "view=zzz&x=1"));
    check("?view=zzz ⇒ ทิ้งค่า ใช้ตามรถรับส่ง (ไม่ 404)", stBad === 200 && (await has(po, `trips-mf-group-run:${run1}`)), "200 + มุมมองปริยาย", stBad);
    eqc("ไม่มี page error (เจ้าของ 1440)", po.errors, []);
    await po.page.close();
    // 390
    const pm = await open(CK.oa, { mobile: true });
    await goUrl(pm, mfUrl(depM));
    check("390: ไม่ล้นแนวนอน", !(await overflow(pm, 390)), "ไม่ล้น", await pm.page.evaluate(() => document.documentElement.scrollWidth));
    const cardsVisible = (await visibleIds(pm, "trips-mf-card-")).length;
    const tablesVisible = await pm.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="trips-mf-table"]')).filter((e) => (e as HTMLElement).offsetParent !== null).length);
    check("390: เห็นการ์ดต่อการจอง ไม่เห็นตาราง", cardsVisible === F.bookings && tablesVisible === 0, `${F.bookings} การ์ด · 0 ตาราง`, [cardsVisible, tablesVisible]);
    await pm.page.evaluate((id: string) => { const e = Array.from(document.querySelectorAll(`[data-testid="trips-mf-pax-toggle-${id}"]`)).find((x) => (x as HTMLElement).offsetParent !== null) as HTMLElement | undefined; e?.click(); }, bB.id);
    await sleep(400);
    check("390: ขยายรายคนแล้วยังไม่ล้น (ชื่อยาว =HYPERLINK…)", !(await overflow(pm, 390)), "ไม่ล้น", await pm.page.evaluate(() => document.documentElement.scrollWidth));
    const small = await pm.page.evaluate(() => { const root = document.querySelector('[data-testid="trips-mf-actions"]'); return Array.from(root?.querySelectorAll("button") ?? []).map((b) => Math.round(b.getBoundingClientRect().height)); });
    check("390: ปุ่มในแถบปุ่มสูง ≥ 44px", small.length > 0 && small.every((h) => h >= 44), "≥ 44", small);
    await shot(pm, "s1-pickup-390", true);
    await pm.page.close();
    // อังกฤษ
    const pe = await open(CK.oa, { locale: "en" });
    await goUrl(pe, mfUrl(depM));
    await clickId(pe, `trips-mf-pax-toggle-${bA.id}`); await clickId(pe, `trips-mf-pax-toggle-${bD.id}`);
    textChecks("อังกฤษ: ตามรถรับส่ง + รายคน", await visibleText(pe), "en");
    const enTitle = (await textOf(pe, T("trips-mf-title"))) ?? "";
    check("อังกฤษ: ชื่อสินค้าใช้ภาษาอังกฤษ", enTitle.includes("Probe Tour H"), "Probe Tour H", enTitle);
    await shot(pe, "s1-pickup-en-1440");
    await goUrl(pe, mfUrl(depM, "view=booking"));
    textChecks("อังกฤษ: ตามการจอง", await visibleText(pe), "en");
    eqc("ไม่มี page error (อังกฤษ)", pe.errors, []);
    await pe.page.close();
  });

  // ═══════════════ ฉาก 2: ส่งออก CSV ═══════════════
  await run("2", "ส่งออก CSV: ไฟล์ · กันสูตร · ภาษาไทย · ไม่มีข้อมูลเกินจำเป็น · audit · ผู้ไม่มีสิทธิ์", async () => {
    const before = (await audits("trips.manifest.exported")).length;
    const po = await open(CK.oa);
    await goUrl(po, mfUrl(depM));
    await clickId(po, "trips-mf-export");
    await po.page.waitForFunction(() => (window as unknown as { __downloads: unknown[] }).__downloads.length > 0, { timeout: 30_000 }).catch(() => undefined);
    const dl = await pageVar<{ name: string; href: string }[]>(po, "__downloads");
    check("กดส่งออก ⇒ เกิดการดาวน์โหลด 1 ไฟล์ (<a download> จาก Blob)", dl.length === 1 && dl[0].href.startsWith("blob:"), "1 · blob:", dl);
    exportAction = po.actions[po.actions.length - 1] ?? null;
    check("ชื่อไฟล์ = manifest-<วันที่รอบ>-<6 ตัวท้ายของรหัสรอบ>.csv (ไม่มีข้อความผู้ใช้)", dl[0]?.name === `manifest-${TRAVEL}-${depM.replace(/[^A-Za-z0-9]/g, "").slice(-6)}.csv` && /^[A-Za-z0-9.-]{1,60}$/.test(dl[0]?.name ?? ""), `manifest-${TRAVEL}-….csv`, dl[0]?.name);
    const blob = await blobBytes(po, 0);
    const bytes = Buffer.from(blob?.bytes ?? []);
    writeFileSync(join(OUT, "s2-export-th.csv"), bytes);
    eqc("ชนิดของ Blob", blob?.type, "text/csv;charset=utf-8");
    eqc("ไฟล์ขึ้นต้นด้วย BOM UTF-8 (EF BB BF) — Excel อ่านไทยได้", [...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    {
      await sleep(400);
      const svc = await call("exportManifestCsv", oaCtx, { unitId: uN, departureId: depM, locale: "th" });
      const svcCsv = String((svc.value as Rec)?.csv ?? "");
      note(`วินิจฉัย BOM: บริการ exportManifestCsv คืน csv ขึ้นต้น U+FEFF = ${svcCsv.charCodeAt(0) === 0xfeff} · Blob ที่จอสร้างขึ้นต้นด้วย ${[...bytes.subarray(0, 3)].map((x) => x.toString(16)).join(" ")} (ดูบรรทัดวินิจฉัยของคำตอบดิบด้านล่าง)`);
      exportSvcCalls++;
    }
    const text = bytes.toString("utf8");
    const rows = parseCsv(text);
    const head = rows[0] ?? []; const data = rows.slice(1);
    const COLS = ["group", "pickupTime", "pickupPlace", "bookingCode", "booker", "channel", "paxNo", "traveller", "paxType", "nationality", "docType", "docMasked", "formStatus", "waiver", "health", "finSize"];
    eqc("หัว 16 คอลัมน์ ภาษาไทยจาก messages", head, COLS.map((c) => mf("th").csv[c]));
    const liveByBooking = await q<{ id: string; live: number }>(`SELECT b.id, (SELECT count(*)::int FROM "TripPassenger" p WHERE p."bookingId" = b.id AND NOT COALESCE(p.answers->'purged'->'stages' ? 'ALL', false)) AS live FROM "TripBooking" b WHERE b."departureId" = $1 AND b.status = ANY($2::text[])`, [depM, M_ST]);
    const expectRows = liveByBooking.reduce((n, r) => n + Math.max(1, Number(r.live)), 0);
    eqc("จำนวนแถวข้อมูล = ผู้เดินทางที่ยังไม่ถูกลบ (การจองไม่มีผู้เดินทางเหลือ = 1 แถว)", data.length, expectRows);
    check("ทุกแถวมี 16 เซลล์", data.every((r) => r.length === 16), "16", [...new Set(data.map((r) => r.length))]);
    check("จบทุกบรรทัดด้วย CRLF และไม่มี LF เปล่าในไฟล์", (text.match(/\r\n/g) ?? []).length === rows.length && !/[^\r]\n/.test(text), `${rows.length} CRLF`, (text.match(/\r\n/g) ?? []).length);
    const formula = data.flat().filter((c) => FORMULA_START.test(c));
    eqc("ไม่มีเซลล์ใดขึ้นต้นด้วย = + - @ tab CR (รวมหลังช่องว่าง/BOM)", formula.slice(0, 5), []);
    const trav = data.map((r) => r[7]);
    check("ชื่อ =HYPERLINK(…) ถูกนำหน้าด้วย ' และอยู่ครบทั้งข้อความ", trav.includes(`'${NASTY.eq}`), `'${NASTY.eq}`, trav.find((x) => x.includes("HYPERLINK")) ?? "ไม่พบ");
    check("ชื่อ + - @ ถูกนำหน้าด้วย '", trav.includes(`'${NASTY.plus}`) && trav.includes(`'${NASTY.minus}`) && trav.includes(`'${NASTY.at}`), "ครบ 3", trav.filter((x) => x.startsWith("'")));
    const multiWant = `'=9+9 "อัญ",${STAMP} บรรทัดสอง`;
    check("ชื่อมี tab นำหน้า + \" , ขึ้นบรรทัด + ไทย ⇒ เซลล์เดียว ไม่แตกแถว ไทยครบ", trav.includes(multiWant), multiWant, trav.find((x) => x.includes("บรรทัดสอง")) ?? "ไม่พบ");
    check("จุดรับ =cmd|… ถูกนำหน้าด้วย '", data.some((r) => r[2] === `'${NASTY.place}`), `'${NASTY.place}`, data.find((r) => r[2].includes("cmd"))?.[2] ?? "ไม่พบ");
    check("ภาษาไทยไม่เพี้ยน (ชื่อผู้เดินทางไทย + หัวคอลัมน์)", trav.includes(THAI_NAME) && !text.includes("�"), THAI_NAME, trav.find((x) => /สมหญิง/.test(x)) ?? "ไม่พบ");
    const bookerCell = data.find((r) => r[3] === bB.code)?.[4] ?? "";
    note(`ผู้จองของการจองที่ 2 ในไฟล์: ${bookerCell}`);
    eqc("ไฟล์ไม่มี: เนื้อหาสุขภาพ · เลขเอกสารเต็ม · เบอร์ · วันเกิด · ชื่อผู้ปกครอง", leaks(text, SENSITIVE), []);
    eqc("ไฟล์ไม่มี: ผู้ถูกลบ · ผู้เดินทางของ HOLD/ยกเลิก · หน่วยอื่น", leaks(text, NOT_ON_SHEET), []);
    check("ไฟล์ไม่มีรหัสภายใน (id การจอง/ผู้เดินทาง/รอบ)", ![depM, bA.id, bA.pax[0], run1].some((x) => text.includes(x)), "ไม่มี", [depM, bA.id, bA.pax[0], run1].filter((x) => text.includes(x)));
    const masked = data.map((r) => r[11]).filter((x) => x.length > 0);
    check("คอลัมน์เลขเอกสาร = ••••<4 ตัวท้าย> เท่านั้น", masked.length >= 2 && masked.every((x) => /^••••[A-Z0-9]{4}$/.test(x)), "••••XXXX", masked);
    const HEALTH_TXT = Object.values(mf("th").health); const WAIVER_TXT = Object.values(mf("th").waiver); const FORM_TXT = Object.values(mf("th").formStatus);
    check("เซลล์สถานะ (แบบฟอร์ม/ลงนาม/สุขภาพ) เป็นข้อความไทย ไม่ใช่รหัสดิบ", data.every((r) => (r[12] === "" || FORM_TXT.includes(r[12])) && (r[13] === "" || WAIVER_TXT.includes(r[13])) && (r[14] === "" || HEALTH_TXT.includes(r[14]))), "ข้อความจาก messages", data.find((r) => !(r[14] === "" || HEALTH_TXT.includes(r[14])) || !(r[13] === "" || WAIVER_TXT.includes(r[13])))?.slice(12, 15) ?? "ตรง");
    eqc("กลุ่มในไฟล์ = ชื่อรถ / ยังไม่จัดรถ", [...new Set(data.map((r) => r[0]))], [`Van One ${STAMP}`, `Van Two ${STAMP}`, mf("th").group.unassigned]);
    check("จอแจ้งผลการส่งออก (role=status · จำนวนแถวตรงไฟล์)", (await po.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="trips-mf"] [role="status"]')).map((e) => (e as HTMLElement).innerText).join("|"))).includes(String(data.length)), String(data.length), await po.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="trips-mf"] [role="status"]')).map((e) => (e as HTMLElement).innerText).join("|")));
    const a1 = await audits("trips.manifest.exported");
    eqc("audit trips.manifest.exported เพิ่ม 1 แถวจากการกดปุ่ม (+ การเรียกบริการตรงของ probe เพื่อวินิจฉัย)", a1.length - before, 1 + exportSvcCalls);
    const last = a1[before];
    eqc("audit: ผู้กระทำ · หน่วย · เป้า", [last?.actorId, last?.unitId, last?.targetType, last?.targetId], [U.oa.userId, uN, "TripDeparture", depM]);
    eqc("audit.after = { departureId, format, purpose, rows, truncated, purgedSkipped } เท่านั้น", last?.after, { departureId: depM, format: "CSV", purpose: "MANIFEST", rows: data.length, truncated: false, purgedSkipped: F.purged });
    eqc("audit ไม่มีข้อมูลบุคคล", leaks(JSON.stringify(last ?? {}), [...SENSITIVE, ...NOT_ON_SHEET, `Somchai Probe${STAMP}`, THAI_NAME]), []);
    eqc("ไม่มีสถานะส่งออกค้างใน URL/ที่เก็บของเบราว์เซอร์", await po.page.evaluate(() => [location.search, localStorage.length, sessionStorage.length]), ["", 0, 0]);
    await shot(po, "s2-export-done-1440");
    // อังกฤษ: ภาษาไฟล์จากฝั่งเซิร์ฟเวอร์
    const pe = await open(CK.oa, { locale: "en" });
    await goUrl(pe, mfUrl(depM));
    await clickId(pe, "trips-mf-export");
    await pe.page.waitForFunction(() => (window as unknown as { __downloads: unknown[] }).__downloads.length > 0, { timeout: 30_000 }).catch(() => undefined);
    const eb = Buffer.from((await blobBytes(pe, 0))?.bytes ?? []);
    writeFileSync(join(OUT, "s2-export-en.csv"), eb);
    const er = parseCsv(eb.toString("utf8"));
    eqc("จออังกฤษ ⇒ หัวคอลัมน์อังกฤษ (ภาษาอ่านจากเซิร์ฟเวอร์ ไม่ได้ส่งจากจอ)", er[0], COLS.map((c) => mf("en").csv[c]));
    check("คำขอส่งออกไม่มีช่อง locale/เวลา จากจอ", !/locale|now|"at"/i.test(pe.actions[pe.actions.length - 1]?.body ?? "x"), "ไม่มี", (pe.actions[pe.actions.length - 1]?.body ?? "").slice(0, 160));
    const thaiCells = er.slice(1).flat().filter((c) => THAI_RE.test(stripData(c)));
    eqc("ไฟล์อังกฤษ: เซลล์สถานะ/กลุ่ม/ประเภทไม่มีอักษรไทย (นอกข้อมูลที่ปลูก)", [...new Set(thaiCells)].slice(0, 5), []);
    await pe.page.close();
    // ผู้ดูธรรมดา (departure.view + passenger.view) — ตามใบสั่ง สิทธิ์ส่งออก = สิทธิ์ดู
    const pv = await open(CK.v);
    await goUrl(pv, mfUrl(depM));
    check("ผู้ดู (ดูรอบ+ดูผู้เดินทาง) มีปุ่มส่งออก — ใบสั่งไม่มีสิทธิ์ส่งออกแยก (ข้อสังเกตในรายงาน)", await has(pv, "trips-mf-export"), "มีปุ่ม", await has(pv, "trips-mf-export"));
    await pv.page.close();
    // ผู้ไม่มี passenger.view: ไม่มีปุ่ม + ยิง action ตรงถูกปฏิเสธ
    const pn = await open(CK.nopax);
    await goUrl(pn, mfUrl(depM));
    check("ผู้ไม่มีสิทธิ์ดูผู้เดินทาง: ไม่มีปุ่มส่งออก", !(await has(pn, "trips-mf-export")), "ไม่มี", await has(pn, "trips-mf-export"));
    if (exportAction) {
      const b2 = (await audits("trips.manifest.exported")).length;
      const ctl = await replay(po, exportAction);
      if (argv.includes("--debug")) { const lastReq = po.actions[po.actions.length - 1]; console.log("DEBUG orig headers", JSON.stringify(exportAction.headers), "\nDEBUG orig body", exportAction.body, "\nDEBUG replay headers", JSON.stringify(lastReq?.headers), "\nDEBUG replay body", lastReq?.body, "\nDEBUG resp", ctl.status, ctl.text.slice(0, 300)); }
      note(`วินิจฉัย BOM (คำตอบดิบของ server action อ่านด้วย fetch ในหน้า): มี U+FEFF = ${ctl.text.includes("\uFEFF")} · อยู่ก่อนหัวคอลัมน์แรก = ${ctl.text.includes("\uFEFF" + mf("th").csv.group)} (true/true ⇒ เซิร์ฟเวอร์ส่ง BOM มา แต่หายตอนตัวถอดคำตอบของ server action ฝั่งเบราว์เซอร์แปลงข้อความ — ก่อนถึงโค้ดของจอ)`);
      check("ตัวควบคุม: ยิง action ส่งออกซ้ำด้วยเจ้าของ ⇒ ได้ไฟล์ (วิธียิงตรงใช้ได้จริง)", ctl.status === 200 && ctl.text.includes("manifest-") && ctl.text.includes(bA.code), "200 + ไฟล์", `${ctl.status} · ${ctl.text.length} ไบต์`);
      const r = await replay(pn, exportAction);
      check("ยิง action ส่งออกตรงด้วยผู้ไม่มีสิทธิ์ ⇒ ไม่ได้ข้อมูลเลย", !r.text.includes(bA.code) && !r.text.includes("Somchai") && !r.text.includes("manifest-"), "ไม่มีข้อมูล", `${r.status} · ${r.text.replace(/\s+/g, " ").slice(0, 200)}`);
      note(`ผลยิงตรงของผู้ไม่มีสิทธิ์: HTTP ${r.status} · ${r.text.replace(/\s+/g, " ").slice(0, 200)}`);
      eqc("audit หลังยิงตรง: +1 (เจ้าของ) · +0 (ผู้ไม่มีสิทธิ์)", (await audits("trips.manifest.exported")).length - b2, 1);
      // ปลอม unitId/เวลา/ภาษา ใน input — ต้องไม่มีผล (strict ⇒ ปฏิเสธ หรือ ถูกทับ)
      const forged = { ...exportAction, body: exportAction.body.replace(/\{"departureId":"([^"]+)"\}/, `{"departureId":"$1","unitId":"${uX}","locale":"en","now":"2020-01-01T00:00:00Z"}`) };
      if (forged.body !== exportAction.body) {
        const f = await replay(po, forged);
        check("input แถม unitId/locale/now ⇒ ไม่ถูกใช้ (หัวไฟล์ยังเป็นไทย ของหน่วยตาม slug)", f.status === 200 && f.text.includes(mf("th").csv.traveller) && !f.text.includes(mf("en").csv.traveller), "หัวไทย", `${f.status} · ${f.text.replace(/\s+/g, " ").slice(0, 140)}`);
      } else note(`รูป body ของ action ไม่ตรงที่คาด จึงไม่ได้ทดสอบ input ปลอม: ${exportAction.body.slice(0, 160)}`);
    } else check("จับคำขอ server action ของการส่งออกได้", false, "มี next-action", "ไม่พบ");
    eqc("ไม่มี page error", po.errors, []);
    await pn.page.close(); await po.page.close();
  });

  // ═══════════════ ฉาก 3: พิมพ์ ═══════════════
  await run("3", "พิมพ์: audit ก่อนกล่องพิมพ์ · บันทึกไม่ได้ = ไม่พิมพ์ · ผังพิมพ์ A4 หลายหน้า", async () => {
    const before = (await audits("trips.manifest.printed")).length;
    let auditAtPrint = -1;
    const po = await open(CK.oa, { onPrint: async () => { auditAtPrint = (await audits("trips.manifest.printed")).length - before; } });
    await goUrl(po, mfUrl(depM));
    const stampBefore = await po.page.evaluate(() => (document.querySelector('[data-print-root="trips-manifest"] header') as HTMLElement | null)?.textContent ?? "");
    await clickId(po, "trips-mf-print");
    await po.page.waitForFunction(() => (window as unknown as { __printCalls: number }).__printCalls > 0, { timeout: 30_000 }).catch(() => undefined);
    await sleep(1500);
    eqc("กดพิมพ์ ⇒ window.print ถูกเรียก 1 ครั้ง", await pageVar<number>(po, "__printCalls"), 1);
    const printAt = await pageVar<number>(po, "__printAt");
    const resp = po.actionResp[po.actionResp.length - 1];
    // เวลาของคำตอบจับฝั่ง node (เหตุการณ์ CDP มาช้ากว่าหน้าได้หลายมิลลิวินาที) จึงใช้เป็นข้อมูลประกอบ — หลักฐานลำดับจริง = คำขอถูกส่งก่อนพิมพ์ + มีแถว audit แล้วตอนพิมพ์ (ข้อถัดไป) + ตัดคำขอแล้วไม่พิมพ์ (ท้ายฉาก)
    const reqAt = po.actions[po.actions.length - 1]?.at ?? 0;
    check("ลำดับ: คำขอบันทึกการพิมพ์ถูกส่งก่อน window.print และตอบ HTTP 200", !!resp && resp.status === 200 && reqAt > 0 && reqAt <= printAt, "ส่งก่อนพิมพ์ · 200", resp ? `${resp.status} · ส่งก่อนพิมพ์ ${printAt - reqAt}ms · เหตุการณ์คำตอบถึง node ${resp.at - printAt}ms เทียบเวลาเรียกพิมพ์` : "ไม่มีคำตอบ");
    eqc("ตอนกล่องพิมพ์เปิด มีแถว audit trips.manifest.printed แล้ว 1 แถว", auditAtPrint, 1);
    const a = await audits("trips.manifest.printed");
    eqc("audit trips.manifest.printed รวม +1", a.length - before, 1);
    const last = a[a.length - 1];
    eqc("audit.after = { departureId, purpose, passengers (ไม่นับผู้ถูกลบ) }", last?.after, { departureId: depM, purpose: "MANIFEST", passengers: F.slots - F.purged });
    eqc("audit: ผู้กระทำ/เป้า", [last?.actorId, last?.targetType, last?.targetId], [U.oa.userId, "TripDeparture", depM]);
    const stampAfter = await po.page.evaluate(() => (document.querySelector('[data-print-root="trips-manifest"] header') as HTMLElement | null)?.textContent ?? "");
    check("หัวกระดาษมี \"พิมพ์เมื่อ … โดย <ชื่อผู้พิมพ์>\"", stampAfter.includes("พิมพ์เมื่อ") && stampAfter.includes("Probe oa"), "พิมพ์เมื่อ … Probe oa", stampAfter.slice(-90));
    note(`หัวกระดาษก่อนกด: …${stampBefore.slice(-60)} · หลังกด: …${stampAfter.slice(-60)}`);
    // ผังพิมพ์
    await po.page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await po.page.emulateMediaType("print");
    await sleep(600);
    const pm = await po.page.evaluate(() => {
      const root = document.querySelector('[data-print-root="trips-manifest"]') as HTMLElement | null;
      const rr = root?.getBoundingClientRect();
      const clipped: string[] = [];
      for (let e = root?.parentElement ?? null; e && e !== document.documentElement; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if ((cs.overflowY !== "visible" && e.scrollHeight > e.clientHeight + 2) || cs.position === "fixed") clipped.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)} overflowY=${cs.overflowY} pos=${cs.position} ${e.clientHeight}/${e.scrollHeight}`);
      }
      const shell = Array.from(document.querySelectorAll("nav, aside, header, button, [data-testid='trips-mf-actions'], [data-testid='trips-mf-kpis']")).filter((e) => !e.closest("[data-print-root]") && (e as HTMLElement).offsetParent !== null && getComputedStyle(e).visibility !== "hidden").map((e) => `${e.tagName.toLowerCase()}:${((e as HTMLElement).innerText || "").slice(0, 30)}`);
      return { has: !!root, display: root ? getComputedStyle(root).display : "", h: Math.round(rr?.height ?? 0), w: Math.round(rr?.width ?? 0), left: Math.round(rr?.left ?? -1), top: Math.round(rr?.top ?? -1), docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth,
        font: root ? parseFloat(getComputedStyle(root).fontSize) : 0, color: root ? getComputedStyle(root).color : "", clipped, shell: shell.slice(0, 8), body: document.body.innerText,
        bookings: document.querySelectorAll("[data-print-booking]").length, pax: document.querySelectorAll("[data-print-booking] ol > li").length };
    });
    check("สื่อพิมพ์: รากผังพิมพ์แสดง (display block)", pm.has && pm.display === "block", "block", pm.display);
    eqc("สื่อพิมพ์: เปลือกแอป/แถบทัวร์/ปุ่ม/การ์ดจอ ซ่อนทั้งหมด", pm.shell, []);
    check("สื่อพิมพ์: เนื้อหายาวกว่า 1 หน้า A4 และเอกสารสูงตามเนื้อหา (ไม่ถูกตัดเหลือหน้าเดียว)", pm.h > 1123 * 1.5 && pm.docH >= pm.h, "> 1684px และ doc ≥ root", [pm.h, pm.docH]);
    eqc("สื่อพิมพ์: ไม่มีบรรพบุรุษที่ตัด/เลื่อนเนื้อหา (overflow/fixed)", pm.clipped, []);
    check("สื่อพิมพ์: ไม่ล้นความกว้างกระดาษ", pm.docW <= 794 + 2, "≤ 794", pm.docW);
    check("สื่อพิมพ์: ตัวอักษร ≥ 10pt (13.3px) สีดำ", pm.font >= 13.2 && /rgb\(0, 0, 0\)/.test(pm.color), "≥ 13.3px · rgb(0, 0, 0)", [pm.font, pm.color]);
    eqc("สื่อพิมพ์: ทุกการจองในใบ + รายชื่อรายคนเปิดทั้งหมด", [pm.bookings, pm.pax], [F.bookings, F.slots]);
    check("สื่อพิมพ์: มีท้ายกระดาษเตือนข้อมูลส่วนบุคคล", pm.body.includes(mf("th").print.footer), "มี", pm.body.slice(-120));
    eqc("กระดาษไม่มี: เนื้อหาสุขภาพ · เลขเอกสารเต็ม · เบอร์เต็ม · วันเกิด · ผู้ปกครอง", leaks(pm.body, SENSITIVE), []);
    eqc("กระดาษไม่มี: ชื่อผู้ถูกลบ · HOLD/ยกเลิก · หน่วยอื่น", leaks(pm.body, NOT_ON_SHEET), []);
    check("กระดาษไม่มียอดเงิน (เจ้าของเห็นยอดบนจอ)", !pm.body.includes("฿") && !pm.body.includes("ค้างชำระ"), "ไม่มี ฿/ค้างชำระ", firstMatch(pm.body, /฿|ค้างชำระ/) ?? "ไม่มี");
    check("กระดาษไม่มีจำนวนไฟล์/รอลบ", !/รอลบ|\d ไฟล์/.test(pm.body), "ไม่มี", firstMatch(pm.body, /รอลบ|\d ไฟล์/) ?? "ไม่มี");
    check("กระดาษมีผู้ถูกลบเป็น \"ลบตามนโยบายแล้ว\"", pm.body.includes("ลบตามนโยบายแล้ว"), "มี", "—");
    textChecks("ผังพิมพ์ (ไทย)", pm.body, "th");
    await po.page.screenshot({ path: join(OUT, "s3-print-a4-fullpage.png"), fullPage: true });
    await po.page.screenshot({ path: join(OUT, "s3-print-a4-top.png"), fullPage: false });
    // PDF จริง (A4 · ขอบจาก @page)
    try {
      const pdfPath = join(OUT, "s3-print.pdf");
      writeFileSync(pdfPath, Buffer.from(await po.page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: false })));
      const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
      const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
      const size = /Page size:\s+([^\n]+)/.exec(info)?.[1] ?? "";
      check("PDF: หลายหน้า (≥ 2) ขนาด A4", pages >= 2 && /59[45](\.\d+)? x 84[12]/.test(size), "≥ 2 หน้า · A4", `${pages} หน้า · ${size}`);
      const txt = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      const lastPage = execFileSync("pdftotext", ["-f", String(pages), "-l", String(pages), "-layout", pdfPath, "-"], { encoding: "utf8" });
      check("PDF: การจองท้ายใบ (Bulk14) และผู้เดินทางคนแรกอยู่ครบ — ไม่ถูกตัด", txt.includes("Bulk14 Pax4") && txt.includes("Somchai Probe"), "มีทั้งคู่", [txt.includes("Bulk14 Pax4"), txt.includes("Somchai Probe")]);
      check("PDF: หน้าสุดท้ายมีช่องลงชื่อ/ท้ายกระดาษ", /\.{10,}/.test(lastPage), "มีเส้นลงชื่อ", lastPage.replace(/\s+/g, " ").slice(-160));
      execFileSync("pdftoppm", ["-r", "70", "-png", "-f", "1", "-l", "2", pdfPath, join(OUT, "s3-print-pdf")]);
      execFileSync("pdftoppm", ["-r", "70", "-png", "-f", String(pages), "-l", String(pages), pdfPath, join(OUT, "s3-print-pdf-last")]);
      const bbox = execFileSync("pdftotext", ["-bbox", "-f", "1", "-l", "1", pdfPath, "-"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      const xs = [...bbox.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)].map((m) => m.slice(1, 5).map(Number));
      const minX = Math.min(...xs.map((b) => b[0])); const maxX = Math.max(...xs.map((b) => b[2])); const minY = Math.min(...xs.map((b) => b[1]));
      check("PDF หน้า 1: ขอบกระดาษ ≥ 10mm (28pt) ซ้าย/ขวา/บน", minX >= 28 && 595.3 - maxX >= 28 && minY >= 28, "≥ 28pt", [Math.round(minX), Math.round(595.3 - maxX), Math.round(minY)]);
      note(`PDF ${pages} หน้า · ขอบ ซ้าย ${Math.round(minX)}pt ขวา ${Math.round(595.3 - maxX)}pt บน ${Math.round(minY)}pt`);
    } catch (e) { check("สร้าง/อ่าน PDF ของผังพิมพ์", false, "ได้", errMsg(e)); }
    await po.page.emulateMediaType();
    await po.page.close();
    // บันทึกไม่สำเร็จ ⇒ ไม่พิมพ์
    const pb = await open(CK.oa);
    await goUrl(pb, mfUrl(depM));
    pb.blockActions.on = true;
    const b2 = (await audits("trips.manifest.printed")).length;
    await clickId(pb, "trips-mf-print");
    await waitFor(pb, "trips-mf-print-error", 15_000);
    eqc("action บันทึกการพิมพ์ล้ม (ตัดคำขอ) ⇒ window.print ไม่ถูกเรียก", await pageVar<number>(pb, "__printCalls"), 0);
    const errAttr = await pb.page.evaluate(() => { const e = document.querySelector('[data-testid="trips-mf-print-error"]') as HTMLElement | null; return e ? { role: e.getAttribute("role"), text: e.innerText, color: getComputedStyle(e).color } : null; });
    check("ข้อความผิดพลาดการพิมพ์: role=alert + สีอันตราย + บอกว่ายังไม่เปิดกล่องพิมพ์", errAttr?.role === "alert" && (errAttr?.text ?? "").includes("ยังไม่เปิดกล่องพิมพ์"), "alert", errAttr);
    eqc("ไม่มีแถว audit เพิ่ม", (await audits("trips.manifest.printed")).length - b2, 0);
    check("ปุ่มพิมพ์กลับมากดได้หลังผิดพลาด", (await pb.page.evaluate(() => (document.querySelector('[data-testid="trips-mf-print"]') as HTMLButtonElement | null)?.disabled)) === false, false, "—");
    // ส่งออกล้มแบบเดียวกัน
    await clickId(pb, "trips-mf-export");
    await waitFor(pb, "trips-mf-export-error", 15_000);
    const exErr = await pb.page.evaluate(() => { const e = document.querySelector('[data-testid="trips-mf-export-error"]') as HTMLElement | null; return e ? { role: e.getAttribute("role"), text: e.innerText } : null; });
    check("action ส่งออกล้ม ⇒ ข้อความ role=alert และไม่มีการดาวน์โหลด", exErr?.role === "alert" && (await pageVar<unknown[]>(pb, "__downloads")).length === 0, "alert · 0 ไฟล์", exErr);
    await shot(pb, "s3-print-export-error-1440");
    await pb.page.close();
    // ผู้ดูธรรมดา: ผังพิมพ์อยู่ใน DOM เสมอ (พิมพ์จากเมนูเบราว์เซอร์ไม่ถูกบันทึก — ข้อจำกัดที่รับ)
    const pv = await open(CK.v);
    await goUrl(pv, mfUrl(depM));
    const inDom = await pv.page.evaluate(() => { const r = document.querySelector('[data-print-root="trips-manifest"]') as HTMLElement | null; return r ? { text: (r.textContent ?? "").length, pax: r.querySelectorAll("[data-print-booking] ol > li").length } : null; });
    note(`ผู้ดูธรรมดา: ผังพิมพ์อยู่ใน DOM ตั้งแต่โหลดหน้า (${fmt(inDom)}) ⇒ Ctrl+P พิมพ์ได้โดยไม่มีแถว audit (ข้อจำกัดที่ใบสั่งรับ — Q4)`);
    check("ผู้ดูธรรมดา: ผังพิมพ์ใน DOM ไม่มียอดเงิน/ข้อมูลอ่อนไหว", inDom !== null && leaks(await pv.page.evaluate(() => document.querySelector('[data-print-root="trips-manifest"]')?.textContent ?? ""), [...SENSITIVE, "฿"]).length === 0, "ไม่มี", "—");
    await pv.page.close();
  });

  // ═══════════════ ฉาก 4: เปิดดูข้อมูลสุขภาพ ═══════════════
  await run("4", "ข้อมูลสุขภาพ: ผู้มีสิทธิ์เปิดได้พร้อม audit รายคน · ผู้ไม่มีสิทธิ์ไม่มีปุ่ม/ยิงตรงไม่ได้ · ไม่ค้างหลังปิด/โหลดใหม่", async () => {
    const before = (await audits("trips.passenger.revealed")).length;
    const ph = await open(CK.vh);
    await goUrl(ph, mfUrl(depM));
    check("ผู้มีสิทธิ์สุขภาพ: มีปุ่มดูข้อมูลสุขภาพ", await has(ph, "trips-mf-health"), "มี", await has(ph, "trips-mf-health"));
    eqc("ก่อนเปิด: HTML ไม่มีเนื้อหาสุขภาพ", leaks(await html(ph), [MK.allergy, MK.cond, MK.allergyMinor, MK.allergyBulk]), []);
    await clickId(ph, "trips-mf-health");
    await waitFor(ph, "trips-health-dialog");
    check("กล่อง: มีคำเตือน + ยังไม่แสดงข้อมูล + ยังไม่มี audit", (await has(ph, "trips-health-warning")) && !(await has(ph, "trips-health-list")) && (await audits("trips.passenger.revealed")).length === before, "เตือน · ยังไม่เปิด", "—");
    eqc("วัตถุประสงค์ปริยาย = ความปลอดภัย", await ph.page.evaluate(() => (document.querySelector('[data-testid="trips-health-purpose"]') as HTMLSelectElement | null)?.value ?? null), "SAFETY");
    await shot(ph, "s4-health-dialog-before-1440");
    await ph.page.select(T("trips-health-purpose"), "CHECKIN");
    await clickId(ph, "trips-health-confirm");
    await waitFor(ph, "trips-health-list", 30_000);
    healthAction = ph.actions[ph.actions.length - 1] ?? null;
    const listTxt = ((await textOf(ph, T("trips-health-list"))) ?? "").replace(/\s+/g, " ");
    const items = await ph.page.evaluate(() => document.querySelectorAll('[data-testid="trips-health-list"] > li').length);
    eqc(`รายการ = ผู้เดินทางในใบที่ให้ข้อมูลสุขภาพและยังไม่ถูกลบ (SQL ${F.health})`, items, F.health);
    check("เห็นเนื้อหา: แพ้/โรค ของผู้ใหญ่ · ผู้เยาว์ (ผ่านผู้ปกครอง) · กลุ่ม", listTxt.includes(MK.allergy) && listTxt.includes(MK.cond) && listTxt.includes(MK.allergyMinor) && listTxt.includes(MK.allergyBulk), "ครบ", listTxt.slice(0, 300));
    eqc("ไม่มีของการจอง HOLD/ยกเลิก", leaks(listTxt, [MK.allergyHold, MK.hold, MK.cxl]), []);
    const a = (await audits("trips.passenger.revealed")).slice(before);
    eqc("audit trips.passenger.revealed = 1 แถวต่อผู้เดินทางที่เปิด", a.length, F.health);
    const wantIds = (await q<{ id: string }>(`SELECT p.id FROM "TripPassenger" p JOIN "TripBooking" b ON b.id = p."bookingId" WHERE b."departureId" = $1 AND b.status = ANY($2::text[]) AND p.answers->'health'->>'status' = 'PROVIDED' AND NOT COALESCE(p.answers->'purged'->'stages' ? 'ALL', false) ORDER BY p.id`, [depM, M_ST])).map((r) => r.id);
    eqc("audit: เป้า = ผู้เดินทางแต่ละคน", a.map((x) => x.targetId).sort(), wantIds);
    check("audit.after = { passengerId, what HEALTH, purpose CHECKIN, via MANIFEST, departureId } เท่านั้น · ผู้กระทำถูก", a.every((x) => JSON.stringify(canon(x.after)) === JSON.stringify(canon({ passengerId: x.targetId, what: "HEALTH", purpose: "CHECKIN", via: "MANIFEST", departureId: depM })) && x.actorId === U.vh.userId && x.targetType === "TripPassenger" && x.unitId === uN), "ตรง", a[0]?.after);
    eqc("audit ไม่มีเนื้อหาสุขภาพ/ชื่อ", leaks(JSON.stringify(a), [...SENSITIVE, `Somchai Probe${STAMP}`]), []);
    eqc("ผลไม่อยู่ใน URL / localStorage / sessionStorage", await ph.page.evaluate(() => [location.search, location.hash, JSON.stringify(localStorage).length <= 2, JSON.stringify(sessionStorage).length <= 2]), ["", "", true, true]);
    await shot(ph, "s4-health-revealed-1440");
    // พิมพ์จากเมนูเบราว์เซอร์ขณะกล่องเปิด: กระดาษต้องไม่มีเนื้อหาสุขภาพ
    await ph.page.emulateMediaType("print"); await sleep(400);
    const printBody = await ph.page.evaluate(() => document.body.innerText);
    eqc("สื่อพิมพ์ขณะกล่องสุขภาพเปิด: ไม่มีเนื้อหาสุขภาพบนกระดาษ", leaks(printBody, [MK.allergy, MK.cond, MK.allergyMinor, MK.allergyBulk]), []);
    await ph.page.emulateMediaType(); await sleep(300);
    // ปิดกล่อง
    await ph.page.evaluate(() => { const box = document.querySelector('[data-testid="trips-health-dialog"]'); const btns = Array.from(box?.querySelectorAll("button") ?? []); (btns[btns.length - 1] as HTMLButtonElement | undefined)?.click(); });
    await sleep(600);
    check("ปิดกล่อง ⇒ กล่องหาย และ DOM ไม่มีเนื้อหาสุขภาพเหลือ", !(await has(ph, "trips-health-dialog")) && leaks(await html(ph), [MK.allergy, MK.cond, MK.allergyMinor, MK.allergyBulk]).length === 0, "ไม่เหลือ", leaks(await html(ph), [MK.allergy, MK.cond, MK.allergyMinor]));
    await ph.page.reload({ waitUntil: "networkidle2", timeout: 90_000 }); await sleep(500);
    check("โหลดหน้าใหม่ ⇒ ไม่มีเนื้อหาสุขภาพ และกล่องไม่เปิดเอง", !(await has(ph, "trips-health-dialog")) && leaks(await html(ph), [MK.allergy, MK.cond, MK.allergyMinor, MK.allergyBulk]).length === 0, "ไม่มี", "—");
    eqc("ไม่มีแถว audit เกินจากการเปิด 1 ครั้ง", (await audits("trips.passenger.revealed")).length - before, F.health);
    eqc("ไม่มี page error (ผู้มีสิทธิ์สุขภาพ)", ph.errors, []);
    // ผู้ดูธรรมดา: ไม่มีปุ่ม + ยิงตรง
    const pv = await open(CK.v);
    await goUrl(pv, mfUrl(depM));
    check("ผู้ไม่มีสิทธิ์สุขภาพ: ไม่มีปุ่มดูข้อมูลสุขภาพ", !(await has(pv, "trips-mf-health")), "ไม่มี", await has(pv, "trips-mf-health"));
    if (healthAction) {
      const b2 = (await audits("trips.passenger.revealed")).length;
      const r = await replay(pv, healthAction);
      check("ยิง action เปิดสุขภาพตรงด้วยผู้ไม่มีสิทธิ์ ⇒ FORBIDDEN ไม่มีเนื้อหา/รายการ", r.text.includes("FORBIDDEN") && leaks(r.text, [MK.allergy, MK.cond, MK.allergyMinor, MK.allergyBulk, "items"]).length === 0, "FORBIDDEN · ไม่มีรายการ", `${r.status} · ${r.text.replace(/\s+/g, " ").slice(0, 200)}`);
      const rn = await replay(await (async () => { const p = await open(CK.nopax); await goUrl(p, mfUrl(depM)); return p; })(), healthAction);
      check("ยิงตรงด้วยผู้ไม่มีสิทธิ์ดูผู้เดินทาง ⇒ ไม่มีเนื้อหา", leaks(rn.text, [MK.allergy, MK.cond, MK.allergyMinor, MK.allergyBulk]).length === 0, "ไม่มี", `${rn.status} · ${rn.text.replace(/\s+/g, " ").slice(0, 160)}`);
      const badPurpose = { ...healthAction, body: healthAction.body.replace('"CHECKIN"', '"OTHER"') };
      const rb = await replay(ph, badPurpose);
      check("ผู้มีสิทธิ์ + วัตถุประสงค์นอกชุด (OTHER) ⇒ INVALID_INPUT ไม่มีเนื้อหา", rb.text.includes("INVALID_INPUT") && leaks(rb.text, [MK.allergy, MK.allergyMinor]).length === 0, "INVALID_INPUT", `${rb.status} · ${rb.text.replace(/\s+/g, " ").slice(0, 160)}`);
      const foreign = { ...healthAction, body: healthAction.body.split(depM).join(depX) };
      const rf = await replay(ph, foreign);
      check("ผู้มีสิทธิ์ + รหัสรอบของหน่วยอื่น ⇒ NOT_FOUND", rf.text.includes("NOT_FOUND") && !rf.text.includes(MK.other), "NOT_FOUND", `${rf.status} · ${rf.text.replace(/\s+/g, " ").slice(0, 160)}`);
      eqc("ยิงตรงที่ถูกปฏิเสธทั้งหมด ⇒ ไม่มีแถว audit เพิ่ม", (await audits("trips.passenger.revealed")).length - b2, 0);
    } else check("จับคำขอ server action ของการเปิดสุขภาพได้", false, "มี next-action", "ไม่พบ");
    await pv.page.close(); await ph.page.close();
    // เจ้าของ: มีปุ่ม (OWNER)
    const po = await open(CK.oa);
    await goUrl(po, mfUrl(depM));
    check("เจ้าของร้านมีปุ่มดูข้อมูลสุขภาพ", await has(po, "trips-mf-health"), "มี", await has(po, "trips-mf-health"));
    await po.page.close();
  });

  // ═══════════════ ฉาก 5: สิทธิ์ · ข้ามหน่วย/ข้ามร้าน · คอลัมน์เงิน ═══════════════
  await run("5", "สิทธิ์/การแยกข้อมูล: ไม่มี passenger.view · รอบของหน่วยอื่น/ร้านอื่น · เงินเฉพาะผู้มี booking.view", async () => {
    const pn = await open(CK.nopax);
    const st = await goUrl(pn, mfUrl(depM));
    const forb = await has(pn, "trips-forbidden");
    check("ผู้ไม่มี trips.passenger.view เปิดหน้า ⇒ กล่อง \"ไม่มีสิทธิ์\" (trips-forbidden) ไม่มีใบรายชื่อ", forb && !(await has(pn, "trips-mf")), "trips-forbidden", `HTTP ${st} · forbidden=${forb}`);
    note(`ข้อความที่ผู้ไม่มีสิทธิ์เห็น: ${((await textOf(pn, T("trips-forbidden"))) ?? "").replace(/\s+/g, " ").slice(0, 160)}`);
    const hn = await html(pn);
    eqc("หน้าไม่มีสิทธิ์: HTML ไม่มีชื่อผู้เดินทาง/ผู้จอง/ข้อมูลใด", leaks(hn, [...SENSITIVE, ...NOT_ON_SHEET, `Somchai Probe${STAMP}`, THAI_NAME, `Probe Booker ${STAMP}`, bA.code, MK.hotel]), []);
    await shot(pn, "s5-no-passenger-view-1440");
    await pn.page.close();
    const po = await open(CK.oa);
    // รอบของหน่วยอื่น (ร้านเดียวกัน) ใต้ slug ของหน่วยนี้
    const sx = await goUrl(po, mfUrl(depX));
    const hx = await html(po);
    check("รหัสรอบของหน่วยอื่น ⇒ หน้าไม่พบ ไม่มีใบรายชื่อ", !(await has(po, "trips-mf")) && /404|not[- ]?found|ไม่พบ/i.test(hx), "ไม่พบ", `HTTP ${sx}`);
    eqc("หน้าไม่พบ (หน่วยอื่น): HTML ไม่มีข้อมูลของรอบนั้น", leaks(hx, [MK.other, bX.code, bX.id]), []);
    await shot(po, "s5-foreign-unit-notfound-1440");
    // ตัวควบคุม: เปิดใต้ slug ของหน่วยอื่นเองได้ (เจ้าของ)
    await goUrl(po, mfUrl(depX, "", unitSlugX));
    check("ตัวควบคุม: รอบเดียวกันใต้ slug ของหน่วยตัวเองเปิดได้และเห็นข้อมูล", (await has(po, "trips-mf")) && (await html(po)).includes(bX.code), "เปิดได้", await has(po, "trips-mf"));
    if (seed) {
      const ss = await goUrl(po, mfUrl(seed.id));
      const hs = await html(po);
      check("รหัสรอบของร้านอื่น (ร้าน seed · อ่านอย่างเดียว) ⇒ หน้าไม่พบ ไม่มีใบรายชื่อ", !(await has(po, "trips-mf")) && /404|not[- ]?found|ไม่พบ/i.test(hs), "ไม่พบ", `HTTP ${ss}`);
      check("หน้าไม่พบ (ร้านอื่น): ไม่มีเลขจอง/ชื่อของร้าน seed", !/TR-\d{4}-\d{4}/.test(hs) && !hs.includes("ภัทรา"), "ไม่มี", firstMatch(hs, /TR-\d{4}-\d{4}|ภัทรา/) ?? "ไม่มี");
    } else note("ไม่พบรอบของร้าน seed andaman-dive — ข้ามการทดสอบข้ามร้านผ่านหน้า");
    const longId = "x".repeat(129);
    await goUrl(po, mfUrl(longId));
    check("รหัสรอบยาว 129 ⇒ หน้าไม่พบ", !(await has(po, "trips-mf")), "ไม่พบ", await has(po, "trips-mf"));
    await goUrl(po, mfUrl("no-such-departure' OR '1'='1"));
    check("รหัสรอบเป็นข้อความฉีด SQL ⇒ หน้าไม่พบ", !(await has(po, "trips-mf")), "ไม่พบ", await has(po, "trips-mf"));
    // เงิน
    await goUrl(po, mfUrl(depM));
    const ownerMoney = ((await textOf(po, T("trips-mf-kpi-money"))) ?? "").replace(/\s+/g, " ");
    const ownerHtml = await html(po);
    const ownerLinks = await po.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="trips-mf-row-"] a[href*="/trips/bookings"]')).length);
    check("เจ้าของ: การ์ดค้างชำระ + ยอดค้างในแถว + เลขจองเป็นลิงก์ + ข้อมูลยอดอยู่ในหน้า", ownerMoney.includes("฿") && ownerLinks === F.bookings && /outstandingSatang\\*"\s*:\s*\d/.test(ownerHtml) && (await visibleText(po)).includes("ค้างชำระ ฿"), "ครบ", [ownerMoney, ownerLinks]);
    const amount = /฿\s?([\d,]+\.\d{2})/.exec(ownerMoney)?.[1] ?? "";
    const pv = await open(CK.v);
    await goUrl(pv, mfUrl(depM));
    const vHtml = await html(pv); const vText = await visibleText(pv);
    const vLinks = await pv.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="trips-mf-row-"] a[href*="/trips/bookings"], [data-testid^="trips-mf-card-"] a[href*="/trips/bookings"]')).length);
    check("ผู้ไม่มี booking.view: ไม่มีการ์ดค้างชำระ · ไม่มีคำว่าค้างชำระ/฿ · เลขจองไม่เป็นลิงก์", !(await has(pv, "trips-mf-kpi-money")) && !vText.includes("฿") && !vText.includes("ค้างชำระ") && vLinks === 0, "ไม่มีเงิน", [await has(pv, "trips-mf-kpi-money"), firstMatch(vText, /฿|ค้างชำระ/), vLinks]);
    check("ผู้ไม่มี booking.view: ข้อมูลที่ส่งถึงเบราว์เซอร์ไม่มียอดเงิน (outstandingSatang = null ทุกแถว · ไม่มียอดรวม)", !/outstandingSatang\\*"\s*:\s*\d/.test(vHtml) && (amount.length < 4 || !vHtml.includes(amount)) && !/grossSatang|paidSatang/.test(vHtml), "ไม่มี", firstMatch(vHtml, /outstandingSatang\\*"\s*:\s*\d+/) ?? "ไม่มี");
    eqc("ผู้ดูธรรมดา: HTML ไม่มีข้อมูลอ่อนไหว", leaks(vHtml, [...SENSITIVE, ...NOT_ON_SHEET]), []);
    check("ผู้ดูธรรมดา: เห็นชื่อ + เลขเอกสารปิดบัง + เบอร์ปิดบัง (ตามตารางสิทธิ์)", vHtml.includes(`Somchai Probe${STAMP}`) && vHtml.includes(`••••${MK.doc.slice(-4)}`) && vHtml.includes(MK.phone.slice(-4)), "เห็น", "—");
    await shot(pv, "s5-viewer-no-money-1440");
    eqc("ไม่มี page error", [...po.errors, ...pv.errors], []);
    await pv.page.close(); await po.page.close();
  });

  // ═══════════════ ฉาก 6: ปุ่มใบรายชื่อในแผงรอบ ═══════════════
  await run("6", "แผงรอบ: ปุ่มใบรายชื่อเป็นลิงก์จริง · รอบที่เริ่มแล้ว/ยกเลิก (หนี้ของผู้สร้าง)", async () => {
    const depUrl = (dep: string, start: string) => `${BASE}/app/u/${unitSlug}/trips/departures?view=week&start=${start}&dep=${encodeURIComponent(dep)}`;
    const po = await open(CK.oa);
    await goUrl(po, depUrl(depM, TRAVEL));
    const panel = await waitFor(po, "trips-dep-panel", 20_000);
    const tag = await po.page.evaluate(() => { const e = document.querySelector('[data-testid="trips-dep-manifest"]'); return e ? { tag: e.tagName, href: e.getAttribute("href"), disabled: e.hasAttribute("disabled") } : null; });
    check("แผงรอบ (รอบอนาคต): ปุ่มใบรายชื่อเป็นลิงก์จริง", panel && tag?.tag === "A" && (tag?.href ?? "").endsWith(`/departures/${depM}/manifest`), `<a …/${depM}/manifest>`, tag);
    await shot(po, "s6-panel-link-1440");
    if (tag) { await clickId(po, "trips-dep-manifest"); await waitFor(po, "trips-mf", 30_000); }
    check("กดปุ่ม ⇒ เปิดใบรายชื่อของรอบนั้น", po.page.url().includes(`/departures/${depM}/manifest`) && (await has(po, "trips-mf")), "หน้าใบรายชื่อ", po.page.url());
    const back = await po.page.evaluate(() => document.querySelector('[data-testid="trips-mf-back"]')?.getAttribute("href") ?? "");
    check("ลิงก์กลับ ⇒ ปฏิทินรอบสัปดาห์ของวันเดินทาง + เปิดแผงของรอบเดิม", back.includes("view=week") && back.includes(`start=${TRAVEL}`) && back.includes(`dep=${depM}`), "view=week&start&dep", back);
    await clickId(po, "trips-mf-back"); await sleep(1500);
    check("กดกลับ ⇒ แผงรอบเดิมเปิดอยู่", await waitFor(po, "trips-dep-panel", 20_000), "trips-dep-panel", po.page.url());
    // รอบที่เริ่มแล้ว
    await goUrl(po, depUrl(depS, todayBkk));
    const pS = await waitFor(po, "trips-dep-panel", 20_000);
    const btnS = await has(po, "trips-dep-manifest");
    check("รอบที่เริ่มแล้ว (วันเดินทาง หลังเวลาออก): แผงรอบยังมีปุ่มใบรายชื่อ", pS && btnS, "มีปุ่ม", `แผง=${pS} ปุ่ม=${btnS}`);
    await shot(po, "s6-panel-started-1440");
    const stS = await goUrl(po, mfUrl(depS));
    check("ตัวควบคุม: ใบรายชื่อของรอบที่เริ่มแล้วเปิดทาง URL ได้และมีผู้เดินทาง", stS === 200 && (await has(po, `trips-mf-row-${bS.id}`)), "เปิดได้", stS);
    // รอบที่ยกเลิก
    await goUrl(po, depUrl(depC, TRAVEL));
    const pC = await waitFor(po, "trips-dep-panel", 20_000);
    const btnC = await has(po, "trips-dep-manifest");
    check("รอบที่ยกเลิก: แผงรอบยังมีปุ่มใบรายชื่อ", pC && btnC, "มีปุ่ม", `แผง=${pC} ปุ่ม=${btnC}`);
    const stC = await goUrl(po, mfUrl(depC));
    check("ใบรายชื่อของรอบที่ยกเลิก (ไม่มีการจอง) ⇒ จอว่างบอกตรง ๆ", stC === 200 && (await has(po, "trips-mf-empty")), "trips-mf-empty", stC);
    await po.page.close();
    // ผู้ไม่มี passenger.view: แผงไม่มีปุ่ม
    const pn = await open(CK.nopax);
    await goUrl(pn, depUrl(depM, TRAVEL));
    const pN = await waitFor(pn, "trips-dep-panel", 20_000);
    check("ผู้ไม่มี passenger.view: แผงรอบเปิดได้แต่ไม่มีปุ่มใบรายชื่อ", pN && !(await has(pn, "trips-dep-manifest")), "ไม่มีปุ่ม", `แผง=${pN} ปุ่ม=${await has(pn, "trips-dep-manifest")}`);
    await pn.page.close();
  });

  // ═══════════════ ฉาก 7: เกินเพดานผู้เดินทาง (600) — จอ · ไฟล์ · กระดาษ ═══════════════
  await run("7", "เกินเพดาน 600 ผู้เดินทาง: จอ/ไฟล์/กระดาษ บอกว่าถูกตัดหรือไม่", async () => {
    const vm = await vmOf("oa", depCap);
    eqc("ตัวโหลด: paxTruncated · paxTotal 608 · paxShown 600", [vm?.paxTruncated, vm?.paxTotal, vm?.paxShown], [true, 608, 600]);
    const tailRow = rowsOfVm(vm).find((r) => r.bookingId === bCap2.id);
    note(`การจองท้าย (ผู้เดินทางจริง 2 คน มีชื่อ) ตาม VM: travellers ${((tailRow?.travellers as Rec[]) ?? []).length} · doc ${fmt(tailRow?.doc)}`);
    const po = await open(CK.oa);
    await goUrl(po, mfUrl(depCap));
    const noteTxt = (await textOf(po, T("trips-mf-truncated"))) ?? "";
    check("จอ: มีแถบแจ้งว่ารายการถูกตัด พร้อมตัวเลข 600 จาก 608", noteTxt.includes("600") && noteTxt.includes("608"), "600 / 608", noteTxt);
    const kW = ((await textOf(po, T("trips-mf-kpi-waiver"))) ?? "").replace(/\s+/g, " ");
    check("จอ: การ์ดลงนามเป็น — และบอกว่าตัวเลขไม่ครบ", kW.includes("—") && kW.includes("ไม่ครบ"), "— + ไม่ครบ", kW);
    await clickId(po, `trips-mf-pax-toggle-${bCap2.id}`);
    const tailTxt = (await po.page.evaluate((id: string) => Array.from(document.querySelectorAll(`[data-testid="trips-mf-pax-${id}"]`)).filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e as HTMLElement).innerText).join("\n"), bCap2.id)).replace(/\s+/g, " ");
    check("จอ: การจองท้ายที่รายชื่อถูกตัด ต้องไม่บอกว่า \"ยังไม่มีแถวผู้เดินทางของการจองนี้\" (ข้อมูลมีจริง 2 คน)", !tailTxt.includes(mf("th").pax.none), "ไม่ใช้ข้อความ \"ยังไม่มีแถวผู้เดินทาง\"", tailTxt.slice(0, 160));
    await shot(po, "s7-cap-truncated-1440");
    await clickId(po, "trips-mf-export");
    await po.page.waitForFunction(() => (window as unknown as { __downloads: unknown[] }).__downloads.length > 0, { timeout: 60_000 }).catch(() => undefined);
    const bytes = Buffer.from((await blobBytes(po, 0))?.bytes ?? []);
    writeFileSync(join(OUT, "s7-export-capped.csv"), bytes);
    const text = bytes.toString("utf8"); const rows = parseCsv(text).slice(1);
    check("ไฟล์: แถวข้อมูล ≤ 600", rows.length > 0 && rows.length <= 600, "≤ 600", rows.length);
    check("จอ: หลังส่งออกมีข้อความ role=alert ว่าไฟล์ถูกตัด", (await has(po, "trips-mf-export-truncated")) && (await po.page.evaluate(() => document.querySelector('[data-testid="trips-mf-export-truncated"]')?.getAttribute("role"))) === "alert", "alert", await textOf(po, T("trips-mf-export-truncated")));
    const aud = (await audits("trips.manifest.exported")).filter((x) => x.targetId === depCap);
    eqc("audit ของไฟล์ที่ถูกตัด: truncated true", aud[aud.length - 1]?.after?.truncated, true);
    const tailRows = rows.filter((r) => r[3] === bCap2.code);
    check("ไฟล์เอง (เปิดโดยคนที่ไม่เห็นจอ) มีเครื่องหมายบอกว่าถูกตัด", /ถูกตัด|truncated|ไม่ครบ|แรกเท่านั้น/i.test(text), "มีบรรทัด/เซลล์บอกว่าถูกตัด", "ไม่มีเครื่องหมายใดในไฟล์");
    check("ไฟล์: การจองท้ายที่รายชื่อถูกตัด ต้องไม่ออกเป็นแถว \"ไม่มีผู้เดินทาง\" (ช่องรายคนว่าง) ทั้งที่มี 2 คนมีชื่อ", !(tailRows.length === 1 && tailRows[0][7] === "" && tailRows[0][6] === ""), "ไม่ออกแถวว่างที่ทำให้เข้าใจผิด", tailRows.map((r) => r.slice(3, 8)));
    await po.page.emulateMediaType("print"); await sleep(400);
    const pb = await po.page.evaluate(() => document.body.innerText);
    check("กระดาษ: มีข้อความตัวหนาบอกว่ารายชื่อถูกตัด (600 จาก 608)", pb.includes("600") && pb.includes("608") && pb.includes("คนแรก"), "มี", firstMatch(pb, /คนแรก/) ?? "ไม่มี");
    await po.page.emulateMediaType();
    eqc("ไม่มี page error", po.errors, []);
    await po.page.close();
  });

  // ตรวจรวม: ร้าน seed ไม่ถูกเขียน (audit ของ probe อยู่ใต้ร้านชั่วคราวเท่านั้น) + ไม่มี event ใหม่
  SC = "END";
  const outbox = Number((await q<Rec>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND type LIKE 'trips.manifest%'`, [tN]))[0]?.n);
  eqc("ไม่มี OutboxEvent ชนิด trips.manifest* ของร้านชั่วคราว", outbox, 0);
  const ops = await q<Rec>(`SELECT message, detail FROM "OpsEvent" WHERE "createdAt" >= $1 AND ("tenantId" = $2 OR "tenantId" IS NULL) ORDER BY "createdAt" DESC LIMIT 200`, [T0, tN]).catch(() => [] as Rec[]);
  eqc("OpsEvent ตั้งแต่เริ่มรัน: ไม่มีตัวบ่งชี้บุคคล", leaks(JSON.stringify(ops), [...SENSITIVE, ...NOT_ON_SHEET, `Somchai Probe${STAMP}`]), []);
  note(`OpsEvent ของร้านชั่วคราว/ไม่ระบุร้านตั้งแต่เริ่มรัน: ${ops.length} แถว${ops.length ? ` — ล่าสุด: ${fmt(ops[0])}` : ""}`);
  void oaCtx; void van2; void guide1;
} catch (e) {
  fatal = `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 700) : String(e)}`;
} finally {
  try { await browser?.close(); } catch { /* ปิดแล้ว */ }
  let left = { tenants: -1, users: -1, sessions: -1, rows: -1 };
  try {
    await cleanupTenants(tenantIds);
    await cleanupUsers();
    if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.session.deleteMany({ where: { userAgent: UA } });
    left = {
      tenants: Number((await q<Rec>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0]?.n),
      users: Number((await q<Rec>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]))[0]?.n),
      sessions: Number((await q<Rec>(`SELECT count(*)::int AS n FROM "Session" WHERE "userAgent" = $1`, [UA]))[0]?.n),
      rows: tenantIds.length ? Number((await q<Rec>(`SELECT (SELECT count(*) FROM "TripBooking" WHERE "tenantId" = ANY($1::text[]))::int + (SELECT count(*) FROM "TripPassenger" WHERE "tenantId" = ANY($1::text[]))::int + (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]))::int + (SELECT count(*) FROM "Party" WHERE "tenantId" = ANY($1::text[]))::int + (SELECT count(*) FROM "TripVehicleRun" WHERE "tenantId" = ANY($1::text[]))::int AS n`, [tenantIds]))[0]?.n) : 0,
    };
    console.log(`\n🧹 ลบแถวของ probe แล้ว — เหลือ ร้าน ${left.tenants} · ผู้ใช้ ${left.users} · session ${left.sessions} · แถว trips/audit/party ของร้านชั่วคราว ${left.rows}`);
  } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await prisma.$disconnect().catch(() => undefined);
  await pool.end().catch(() => undefined);
  for (const d of [profile, `/tmp/snap-private-tmp/snap.chromium${profile}`]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ไม่มี */ } }
  const failed = lines.filter((l) => !l.ok);
  if (fatal) console.error(`❌ ${fatal}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ probe: "t1.4-next", base: BASE, checks: lines.length, passed: lines.length - failed.length, failed: failed.length, scenarios: scenarioResult, failures: failed.map((f) => `[${f.sc}] ${f.what} — got ${f.got}`), cleanup: left, fatal: fatal || null, shots: OUT })}`);
  process.exitCode = fatal ? 2 : failed.length > 0 ? 1 : 0;
}
