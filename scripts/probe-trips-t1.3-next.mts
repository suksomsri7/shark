// probe-trips-t1.3-next.mts — กดจริงผ่าน Next ของจอการจองฝั่งร้าน (T1.3a) โดยผู้ตรวจอิสระ: รับเงิน · QR · ยกเลิก · อนุมัติ/ปฏิเสธ · สิทธิ์ดูอย่างเดียว · แป้นพิมพ์/390/อังกฤษ
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh pnpm exec tsx scripts/probe-trips-t1.3-next.mts --base http://127.0.0.1:<port>
//   ( --only 1,4 = รันเฉพาะฉาก · --keep ไม่มี: ลบทุกแถวของตัวเองใน finally เสมอ )
// 🔴 แถวทดสอบทั้งหมดอยู่ใต้ร้านชั่วคราว slug `trips-t13n-*` (ผู้ใช้ `trips-t13n-*@shark.local`) — คนละคำนำหน้ากับข้อสอบ t1.3 (`trips-t13-`) จึงไม่ถูกข้อสอบกวาด
// 🔴 ร้าน seed `andaman-dive` อ่านอย่างเดียว (SELECT id ของการจอง 1 ใบ เพื่อทดสอบข้ามร้าน) · session ปักธง userAgent แล้วลบใน finally
// 🔴 ไม่ build · ไม่เปิด/ปิด server · ต่อ server ที่ผู้คุมเปิดไว้เท่านั้น
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

loadTripsQcEnv("probe-trips-t1.3-next");

type Rec = Record<string, unknown>;
type AnyFn = (...a: unknown[]) => unknown;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "qc-probe-trips-t13n";
const SLUG = "trips-t13n-";
const EMAIL_PREFIX = "trips-t13n-";
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const OUT = join(ROOT, ".qc-shots/trips/t1.3-next");
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
const fmt = (v: unknown): string => { try { return (typeof v === "string" ? v : (JSON.stringify(v) ?? String(v))).slice(0, 260); } catch { return String(v); } };
let SC = "S0";
const check = (what: string, cond: boolean, expected: unknown, got: unknown): boolean => {
  lines.push({ sc: SC, ok: cond, what, expected: fmt(expected), got: fmt(got) });
  console.log(`  ${cond ? "✅" : "❌"} [${SC}] ${what} — expected ${fmt(expected)} · got ${fmt(got)}`);
  return cond;
};
const eqc = (what: string, got: unknown, expected: unknown) => check(what, JSON.stringify(got) === JSON.stringify(expected), expected, got);
const note = (m: string) => console.log(`  ℹ️ [${SC}] ${m}`);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (n = 6) => randomBytes(n).toString("hex");
const rid = (p: string) => `t13n_${p}_${Date.now().toString(36)}${hex(3)}`;
const group3 = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const baht = (satang: number) => `${group3(Math.floor(satang / 100))}.${String(satang % 100).padStart(2, "0")}`;

// ═══════════════ pg (แบบเดียวกับข้อสอบ t1.3) ═══════════════
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

// ═══════════════ เบราว์เซอร์ ═══════════════
type Cookie = { name: string; value: string; domain: string; path: string };
type El = { click(o?: object): Promise<void>; type(t: string, o?: object): Promise<void>; focus(): Promise<void> };
type Page = {
  setViewport(v: object): Promise<void>; setCookie(...c: Cookie[]): Promise<void>; on(ev: string, f: (x: never) => void): void;
  goto(url: string, o: object): Promise<{ status(): number } | null>; url(): string; content(): Promise<string>;
  evaluate<R, A>(f: (a: A) => R, a?: A): Promise<R>; $(sel: string): Promise<El | null>;
  waitForSelector(sel: string, o: object): Promise<unknown>; waitForFunction<A>(f: (a: A) => unknown, o: object, a?: A): Promise<unknown>;
  click(sel: string, o?: object): Promise<void>; keyboard: { press(k: string): Promise<void>; down(k: string): Promise<void>; up(k: string): Promise<void>; type(t: string, o?: object): Promise<void> };
  screenshot(o: object): Promise<unknown>; close(): Promise<void>;
};
type Browser = { newPage(): Promise<Page>; close(): Promise<void> };
type JsDialog = { message(): string; accept(): Promise<void>; dismiss(): Promise<void> };
const T = (id: string) => `[data-testid="${id}"]`;
type Probe = { page: Page; errors: string[]; confirms: string[]; posts: { status: number }[]; confirmMode: { accept: boolean } };
const THAI_RE = /[ก-ฺเ-๛]/;
const RAW_KEY_RE = /\b(?:bookings|errors|common|departures|trips)\.[A-Za-z_]+(?:\.[A-Za-z_]+)*/;
const RAW_ENUM_RE = /\b(?:CONFIRMED|PART_PAID|CANCELLED|EXPIRED|UNPOSTED|RECEIVED|REFUNDED|PROMPTPAY|TRANSFER|COUNTER|REFUND_OPEN|PENDING_APPROVAL|DEPARTURE_CANCELLED|OVERDUE|NO_SHOW|TRAVELLED|PAY_LATER|PAY_NOW|STATE_CONFLICT|OVERPAYMENT)\b|\b(?:HOLD|PENDING|PAID|CASH|CARD)\b/;
const WO_CODE_RE = /\b(?:T[01]\.\d[a-c]?|A1\.\d[a-c]?|OQ\d+|W1\.\d|L1\.\d)\b/;

const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");
const TR = (await import("@/lib/modules/trips")) as unknown as Record<string, AnyFn>;
const SET = (await import("@/lib/core/settings")) as unknown as Record<string, AnyFn>;
const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
  const f = TR[name];
  if (typeof f !== "function") return { ok: "NOFN", name };
  try { return ((await f(...a)) as Rec) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
};

mkdirSync(OUT, { recursive: true });
const sessionIds: string[] = [];
const tenantIds: string[] = [];
const profile = `/tmp/chr-trips-probe-${process.pid}`;
let fatal = "";
let browser: Browser | null = null;
const scenarioResult: Record<string, string> = {};

try {
  // กวาดซากของสคริปต์นี้เอง (คำนำหน้า trips-t13n- เท่านั้น)
  {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้างของ probe ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers();
    await prisma.session.deleteMany({ where: { userAgent: UA } });
  }

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tN = rid("tN"); const uN = rid("uN");
  const unitSlug = `${SLUG}u-${STAMP}`;
  await insertRow("Tenant", { id: tN, name: `Probe T1.3 ${STAMP}`, slug: `${SLUG}${STAMP}`, updatedAt: new Date() }); tenantIds.push(tN);
  await insertRow("BusinessUnit", { id: uN, tenantId: tN, type: "TRIPS", name: "Probe trips unit", slug: unitSlug, settings: "{}", updatedAt: new Date() });
  type Actor = { role: string; unitAccess: string[]; permissions: Rec; userId: string };
  const U: Record<string, Actor> = {};
  const mkUser = async (tag: string, role: string, unitAccess: string[], perms: string[]) => {
    const id = rid(`u${tag}`);
    const permissions = Object.fromEntries(perms.map((p) => [p, true]));
    await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `Probe ${tag}`, updatedAt: new Date() });
    await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId: tN, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: new Date(), updatedAt: new Date() });
    U[tag] = { role, unitAccess, permissions, userId: id };
  };
  await mkUser("oa", "OWNER", ["*"], []);
  await mkUser("v", "STAFF", [uN], ["trips.booking.view"]);
  await mkUser("none", "STAFF", [uN], ["trips.product.view"]);
  const ADULT = 410_000; const PARK = 40_000; const CAM = 30_000;
  type Prod = { id: string; opt: string; pt: Record<string, string>; cam: string };
  const mkProd = async (key: string): Promise<Prod> => {
    const id = rid(`p${key}`), o = rid(`o${key}`);
    await insertRow("TripProduct", { id, tenantId: tN, unitId: uN, slug: `t13n-${key}-${STAMP}`.toLowerCase(), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทัวร์ทดสอบ ${key}`, en: `Probe Tour ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
    await insertRow("TripOption", { id: o, tenantId: tN, unitId: uN, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
    const pt: Record<string, string> = {};
    for (const [i, code] of ["ADULT", "CHILD"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId: tN, unitId: uN, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : "เด็ก", en: code === "ADULT" ? "Adult" : "Child" }), countsCapacity: true, active: true, sortOrder: i, updatedAt: new Date() });
    await insertRow("TripExtra", { id: rid("xpark"), tenantId: tN, unitId: uN, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: PARK, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
      name: JSON.stringify({ th: "ค่าอุทยาน", en: "Marine park fee" }), paxPrices: JSON.stringify({ ADULT: PARK, CHILD: PARK / 2 }), active: true, updatedAt: new Date() });
    const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId: tN, unitId: uN, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: CAM, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
      name: JSON.stringify({ th: "เช่ากล้องกันน้ำ", en: "Waterproof camera" }), active: true, updatedAt: new Date() });
    await insertRow("TripPrice", { id: rid("pr"), tenantId: tN, unitId: uN, productId: id, optionId: null, paxTypeId: pt.ADULT, cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: ADULT, weekdayMask: null, priority: 0, updatedAt: new Date() });
    return { id, opt: o, pt, cam };
  };
  const PA = await mkProd("A");
  const PP = await mkProd("P");
  const setV = async (changes: Rec[]) => {
    const r = ((await SET.setSettings(U.oa, { tenantId: tN }, changes, { ackLegalWarn: true })) as Rec) ?? {};
    if (r.ok !== true) throw new Error(`setSettings: ${fmt(r)}`);
  };
  await setV([{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uN, value: { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 } },
    { key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: PP.id, value: "SHOP_CONFIRMS" }]);
  const TRAVEL = new Date(Date.now() + 7 * 3_600_000 + 40 * 86_400_000).toISOString().slice(0, 10); // วันนี้ (เวลาไทย) + 40 วัน
  let seq = 0;
  const mkDep = async (p: Prod, capacity = 40): Promise<string> => {
    const startsAt = new Date(new Date(`${TRAVEL}T08:00:00+07:00`).getTime() + (seq++ % 600) * 60_000); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: tN, unitId: uN, productId: p.id, optionId: p.opt, scheduleId: null, localDate: TRAVEL, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      status: "OPEN", capacity, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  const staffCtx = (): Rec => ({ tenantId: tN, unitId: uN, channel: "COUNTER", actor: { kind: "STAFF", userId: U.oa.userId }, now: new Date(), locale: "th" });
  const pubCtx = (): Rec => ({ tenantId: tN, unitId: uN, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `t13n_c${hex(4)}` }, now: new Date(), locale: "th" });
  let bkN = 0;
  type Bk = { id: string; code: string; dep: string; payable: number; status: string; phone: string; name: string; version: number };
  const bkRow = async (id: string) => (await q<Rec>(`SELECT status, version, "paidSatang", "refundedSatang", ("grossSatang" - "discountSatang" - "agentDiscountSatang")::int AS payable FROM "TripBooking" WHERE id = $1`, [id]))[0] ?? {};
  const depRow = async (id: string) => (await q<Rec>(`SELECT sold, held, reserved FROM "TripDeparture" WHERE id = $1`, [id]))[0] ?? {};
  const events = async (id: string) => q<Rec>(`SELECT * FROM "TripMoneyEvent" WHERE "bookingId" = $1 ORDER BY "createdAt"`, [id]);
  const lineOf = (p: Prod, dep: string, a: number, camera: boolean) => [{ productKind: "TRIP", unitId: uN, productId: p.id, slotId: dep, optionId: p.opt, pax: [{ paxTypeId: p.pt.ADULT, qty: a }], extras: camera ? [{ extraId: p.cam, qty: 1 }] : [] }];
  const refOf = async (r: Rec, dep: string, phone: string, name: string): Promise<Bk> => {
    const ref = (Array.isArray(r.value) ? (r.value[0] as Rec) : (r.value as Rec)) ?? {};
    const bookingId = String(ref.bookingId ?? (Array.isArray(ref.bookings) ? (ref.bookings[0] as Rec)?.bookingId : ""));
    const row = await bkRow(bookingId);
    return { id: bookingId, code: String(ref.code ?? (await q<Rec>(`SELECT code FROM "TripBooking" WHERE id = $1`, [bookingId]))[0]?.code ?? ""), dep, payable: Number(row.payable), status: String(row.status), phone, name, version: Number(row.version) };
  };
  const mkBooking = async (o: { pay?: "PAY_LATER" | "PAY_NOW"; a?: number; camera?: boolean; dep?: string } = {}): Promise<Bk> => {
    const dep = o.dep ?? (await mkDep(PA));
    const ctx = staffCtx();
    const ls = lineOf(PA, dep, o.a ?? 2, o.camera !== false);
    const quote = await call("quoteTrips", ctx, { lines: ls }, {});
    if (quote.ok !== true) throw new Error(`quoteTrips: ${fmt(quote)}`);
    const qv = quote.value as Rec;
    bkN++;
    const phone = `08${String(10_000_000 + bkN * 7_919 + Number.parseInt(hex(2), 16)).slice(-8)}`;
    const name = `Probe Customer ${STAMP} ${bkN}`;
    const r = await call("bookTripsNow", ctx, { quote: { lines: ls }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `n${hex(6)}`, booker: { name, phone }, pay: { method: o.pay ?? "PAY_LATER" } }, {});
    if (r.ok !== true) throw new Error(`bookTripsNow: ${fmt(r)}`);
    return refOf(r, dep, phone, name);
  };
  /** การจอง PENDING จริง: สินค้า P ตั้ง trips.sell.confirmMode = SHOP_CONFIRMS · ผู้จองสาธารณะ (PUBLIC · WEB) ถือที่ → ยืนยัน PAY_NOW (ทางเดียวกับข้อสอบ t0.6 CF-15) */
  const mkPending = async (dep: string): Promise<Bk> => {
    const ctx = pubCtx();
    const ls = lineOf(PP, dep, 1, false);
    const quote = await call("quoteTrips", ctx, { lines: ls }, {});
    if (quote.ok !== true) throw new Error(`quoteTrips(pub): ${fmt(quote)}`);
    const qv = quote.value as Rec;
    const token = randomBytes(24).toString("base64url");
    const h = await call("holdTrips", ctx, { quote: { lines: ls }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `h${hex(6)}`, basketToken: token }, {});
    if (h.ok !== true) throw new Error(`holdTrips(pub): ${fmt(h)}`);
    const hv = h.value as Rec;
    bkN++;
    const phone = `08${String(10_000_000 + bkN * 7_919 + Number.parseInt(hex(2), 16)).slice(-8)}`;
    const name = `Probe Request ${STAMP} ${bkN}`;
    const r = await call("confirmTrips", ctx, { basketId: hv.basketId, holdIds: hv.holdIds, idempotencyKey: `c${hex(6)}`, quoteId: qv.quoteId, quote: { lines: ls }, booker: { name, phone }, pay: { method: "PAY_NOW" }, basketToken: token }, {});
    if (r.ok !== true) throw new Error(`confirmTrips(pub): ${fmt(r)}`);
    return refOf(r, dep, phone, name);
  };

  // ═══════════════ session + เบราว์เซอร์ ═══════════════
  const mint = async (userId: string): Promise<Cookie[]> => {
    const token = "prb" + Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const ttl = new Date(Date.now() + 60 * 60 * 1000);
    const s = await prisma.session.create({ data: { userId, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
    sessionIds.push(s.id);
    return [{ name: "shark_session", value: token, domain: baseUrl.hostname, path: "/" }, { name: "shark_tenant", value: tN, domain: baseUrl.hostname, path: "/" }];
  };
  const ownerCookies = await mint(U.oa.userId);
  const viewerCookies = await mint(U.v.userId);
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string)) as { default: { launch(o: object): Promise<Browser> } };
  browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${profile}`] });
  const B = browser;
  const open = async (cookies: Cookie[], o: { mobile?: boolean; locale?: "th" | "en" } = {}): Promise<Probe> => {
    const page = await B.newPage();
    await page.setViewport(o.mobile ? { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.setCookie(...cookies, { name: "LOCALE", value: o.locale ?? "th", domain: baseUrl.hostname, path: "/" });
    const pr: Probe = { page, errors: [], confirms: [], posts: [], confirmMode: { accept: true } };
    page.on("pageerror", (e: never) => pr.errors.push(String((e as Error).message).slice(0, 160)));
    page.on("dialog", (d: never) => { const x = d as JsDialog; pr.confirms.push(x.message()); void (pr.confirmMode.accept ? x.accept() : x.dismiss()); });
    page.on("response", (r: never) => { const x = r as { request(): { method(): string }; status(): number }; if (x.request().method() === "POST") pr.posts.push({ status: x.status() }); });
    return pr;
  };
  const bkUrl = (qs: string) => `${BASE}/app/u/${unitSlug}/trips/bookings${qs ? `?${qs}` : ""}`;
  const go = async (pr: Probe, qs: string): Promise<number> => {
    const resp = await pr.page.goto(bkUrl(qs), { waitUntil: "networkidle2", timeout: 90_000 }).catch(() => null);
    await sleep(600);
    return resp?.status() ?? 0;
  };
  const has = (pr: Probe, id: string) => pr.page.evaluate((s: string) => document.querySelector(s) !== null, T(id));
  const textOf = (pr: Probe, sel: string) => pr.page.evaluate((s: string) => (document.querySelector(s) as HTMLElement | null)?.innerText ?? null, sel);
  const attrOf = (pr: Probe, sel: string, a: string) => pr.page.evaluate((x: { s: string; a: string }) => document.querySelector(x.s)?.getAttribute(x.a) ?? null, { s: sel, a });
  const valueOf = (pr: Probe, id: string) => pr.page.evaluate((s: string) => (document.querySelector(s) as HTMLInputElement | null)?.value ?? null, T(id));
  const disabledOf = (pr: Probe, id: string) => pr.page.evaluate((s: string) => (document.querySelector(s) as HTMLButtonElement | null)?.disabled ?? null, T(id));
  const waitFor = (pr: Probe, id: string, ms = 15_000) => pr.page.waitForSelector(T(id), { timeout: ms }).then(() => true).catch(() => false);
  const waitGone = (pr: Probe, id: string, ms = 20_000) => pr.page.waitForFunction((s: string) => document.querySelector(s) === null, { timeout: ms }, T(id)).then(() => true).catch(() => false);
  const clickId = async (pr: Probe, id: string, o?: object) => { await pr.page.click(T(id), o); await sleep(350); };
  /** พิมพ์ทับค่าในช่อง (เลือกทั้งหมดแล้วพิมพ์ — ผ่านแป้นพิมพ์จริง) */
  const typeInto = async (pr: Probe, id: string, text: string) => {
    await pr.page.click(T(id), { clickCount: 3 });
    await pr.page.keyboard.down("Control"); await pr.page.keyboard.press("a"); await pr.page.keyboard.up("Control");
    await pr.page.keyboard.press("Backspace");
    await pr.page.keyboard.type(text, { delay: 15 });
    await sleep(200);
  };
  const dialogCount = (pr: Probe) => pr.page.evaluate(() => document.querySelectorAll('[role="dialog"]').length);
  const alertText = (pr: Probe) => pr.page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] [role="alert"]')).map((e) => (e as HTMLElement).innerText.trim()).join(" | "));
  const overflow = (pr: Probe, vw: number) => pr.page.evaluate((w: number) => document.documentElement.scrollWidth > w + 2, vw);
  const shot = async (pr: Probe, name: string) => { await pr.page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false }); };
  const visibleText = (pr: Probe) => pr.page.evaluate(() => {
    const parts: string[] = [];
    const root = document.querySelector('[data-testid="trips-bk"]') as HTMLElement | null;
    if (root) parts.push(root.innerText);
    for (const d of Array.from(document.querySelectorAll('[role="dialog"]'))) if (!root || !root.contains(d)) parts.push((d as HTMLElement).innerText);
    // ป้ายที่อ่านด้วยโปรแกรมอ่านจอ/ตัวช่วย (aria-label · title · placeholder · alt) ในบริเวณเดียวกัน
    const scope = root ?? document.body;
    for (const e of Array.from(scope.querySelectorAll("[aria-label],[title],[placeholder],[alt]"))) for (const a of ["aria-label", "title", "placeholder", "alt"]) { const v = e.getAttribute(a); if (v) parts.push(v); }
    return parts.join("\n");
  });
  const firstMatch = (text: string, re: RegExp): string | null => { for (const l of text.split("\n")) if (re.test(l)) return l.trim().slice(0, 140); return null; };
  const textChecks = (label: string, text: string, locale: "th" | "en") => {
    check(`${label}: ไม่มีคีย์ข้อความดิบ (bookings.* / errors.* …)`, !RAW_KEY_RE.test(text), "ไม่มี", firstMatch(text, RAW_KEY_RE) ?? "ไม่มี");
    check(`${label}: ไม่มีรหัส enum ดิบบนจอ`, !RAW_ENUM_RE.test(text), "ไม่มี", firstMatch(text, RAW_ENUM_RE) ?? "ไม่มี");
    check(`${label}: ไม่มีรหัสใบงานบนจอ`, !WO_CODE_RE.test(text), "ไม่มี", firstMatch(text, WO_CODE_RE) ?? "ไม่มี");
    if (locale === "en") {
      check(`${label}: จออังกฤษไม่มีอักษรไทย`, !THAI_RE.test(text), "ไม่มี", firstMatch(text, THAI_RE) ?? "ไม่มี");
      if (text.includes("฿")) note(`${label}: จออังกฤษมีสัญลักษณ์ ฿ (U+0E3F) — ${firstMatch(text, /฿/)}`);
    }
  };
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

  // ═══════════════ ฉาก 0: ตัวโหลด — ข้อความฉีด SQL · ข้ามร้าน · PII · สิทธิ์ (เรียกตรง ไม่ผ่านเบราว์เซอร์) ═══════════════
  await run("0", "ตัวโหลด: ข้อความฉีด SQL · wildcard · ข้ามร้าน · PII · สิทธิ์", async () => {
    const oa = { tenantId: tN, actorUserId: U.oa.userId };
    const b0 = await mkBooking();
    const base = await call("loadBookingListVM", oa, { unitId: uN, when: "all" });
    const total0 = Number((base.vm as Rec)?.total);
    check("รายการฐาน (when=all) เห็นการจองของร้านชั่วคราว", base.ok === true && total0 >= 1, "≥ 1", total0);
    const inj = ["' OR 1=1 --", "x') OR ('1'='1", "\"; DROP TABLE \"TripBooking\"; --", "TR-0000-0001' OR '1'='1", "$1", "\\", "'||(SELECT pg_sleep(3))||'", "{a,b}", "a\u0000b"];
    for (const s of inj) {
      const t0 = Date.now();
      const r = await call("loadBookingListVM", oa, { unitId: uN, q: s });
      const n = Number((r.vm as Rec)?.total);
      check(`q=${JSON.stringify(s)} ⇒ ไม่ throw · 0 แถว · ไม่หน่วง`, (r.ok === true && n === 0 && Date.now() - t0 < 2500) || r.code === "INVALID_INPUT", "ok total 0 (หรือ INVALID_INPUT)", r.ok === true ? `total ${n} · ${Date.now() - t0}ms` : r);
    }
    for (const [k, v] of [["product", "x' OR '1'='1"], ["dep", "x' OR '1'='1"]] as const) {
      const r = await call("loadBookingListVM", oa, { unitId: uN, when: "all", [k]: v });
      check(`${k} เป็นข้อความฉีด ⇒ 0 แถว`, r.ok === true && Number((r.vm as Rec)?.total) === 0, "ok total 0", r.ok === true ? `total ${(r.vm as Rec)?.total}` : r);
    }
    for (const [k, v] of [["channel", "COUNTER' OR '1'='1"], ["date", "2027-01-01'; --"], ["when", "all; --"], ["chip", "hold' --"], ["unitId", `${uN}' OR '1'='1`]] as const) {
      const r = await call("loadBookingListVM", oa, { unitId: uN, [k]: v });
      check(`${k} นอกชุด ⇒ ปฏิเสธ`, r.ok === false && ["INVALID_INPUT", "NOT_FOUND"].includes(String(r.code)), "INVALID_INPUT/NOT_FOUND", r.ok === true ? "ok:true" : r.code);
    }
    for (const s of ["%", "_", "Probe%", "P_obe"]) {
      const r = await call("loadBookingListVM", oa, { unitId: uN, q: s });
      const n = Number((r.vm as Rec)?.total);
      check(`q=${JSON.stringify(s)} (wildcard ของ LIKE) ⇒ ไม่ถูกตีความเป็น wildcard (0 แถว)`, r.ok === true && n === 0, "total 0", r.ok === true ? `total ${n} · nameCapped ${fmt((r.vm as Rec)?.search)}` : r);
    }
    const byName = await call("loadBookingListVM", oa, { unitId: uN, q: b0.name });
    check("ค้นด้วยชื่อเต็ม ⇒ เจอการจองนั้น (positive control)", byName.ok === true && ((byName.vm as Rec).rows as Rec[]).some((r) => r.bookingId === b0.id), "เจอ", (byName.vm as Rec)?.total);
    const byCode = await call("loadBookingListVM", oa, { unitId: uN, q: b0.code.toLowerCase() });
    check("ค้นด้วยเลขจองตัวเล็ก ⇒ เจอ", byCode.ok === true && ((byCode.vm as Rec).rows as Rec[]).some((r) => r.bookingId === b0.id), "เจอ", (byCode.vm as Rec)?.total);
    const rows = ((base.vm as Rec)?.rows as Rec[]) ?? [];
    const badKeys = [...new Set(rows.flatMap((r) => Object.keys(r)).filter((k) => /phone|mail|token|hash|contact/i.test(k)))];
    eqc("คีย์ของแถวรายการไม่มี phone/email/token", badKeys, []);
    check("JSON ของรายการไม่มีเบอร์เต็มของผู้จอง", !JSON.stringify(base.vm).includes(b0.phone), "ไม่มี", JSON.stringify(base.vm).includes(b0.phone) ? "มีเบอร์เต็ม" : "ไม่มี");
    const det = await call("loadBookingDetailVM", oa, { unitId: uN, bookingId: b0.id });
    const cust = ((det.vm as Rec)?.customer as Rec) ?? {};
    check("รายละเอียด: เบอร์ปิดบังรูป 08x-xxx-dddd และไม่มีเบอร์เต็มใน VM", det.ok === true && /^\d{3}-xxx-\d{4}$/.test(String(cust.phoneMasked)) && !JSON.stringify(det.vm).includes(b0.phone), "0xx-xxx-dddd", cust.phoneMasked);
    // ข้ามร้าน: id การจองของร้าน seed (อ่านอย่างเดียว)
    const foreign = (await q<{ id: string; code: string }>(`SELECT id, code FROM "TripBooking" WHERE "tenantId" = 'tripsqc-tenant-dive' ORDER BY code LIMIT 1`))[0];
    if (foreign) {
      const r = await call("loadBookingDetailVM", oa, { unitId: uN, bookingId: foreign.id });
      eqc("รายละเอียดของการจองร้านอื่น ⇒ NOT_FOUND", r.ok === false ? r.code : "ok:true", "NOT_FOUND");
      const r2 = await call("loadBookingListVM", oa, { unitId: uN, q: foreign.code });
      check("ค้นเลขจองของร้านอื่น ⇒ ไม่มีแถวของร้านอื่น", r2.ok === true && !((r2.vm as Rec).rows as Rec[]).some((x) => x.bookingId === foreign.id), "ไม่มี", (r2.vm as Rec)?.total);
      const r3 = await call("loadBookingListVM", oa, { unitId: "tripsqc-unit-dive-trips" });
      check("unitId ของร้านอื่น ⇒ NOT_FOUND/FORBIDDEN", r3.ok === false, "ok:false", r3.ok === false ? r3.code : "ok:true");
    } else note("ไม่พบการจองของร้าน seed — ข้ามการทดสอบข้ามร้าน");
    const v = { tenantId: tN, actorUserId: U.v.userId };
    const lv = await call("loadBookingListVM", v, { unitId: uN, when: "all" });
    const flags = ((lv.vm as Rec)?.flags as Rec) ?? {};
    eqc("ผู้ดูอย่างเดียว: flags + docsWaiting", [flags.canPay, flags.canApprove, flags.canCancel, flags.canSeeMoney, ((lv.vm as Rec)?.segments as Rec)?.docsWaiting], [false, false, false, false, null]);
    eqc("ผู้ดูอย่างเดียว: loadBookingDocsVM", (await call("loadBookingDocsVM", v, { unitId: uN })).code, "FORBIDDEN");
    eqc("ผู้ดูอย่างเดียว: loadCashDayVM", (await call("loadCashDayVM", v, { unitId: uN })).code, "FORBIDDEN");
    const dv = await call("loadBookingDetailVM", v, { unitId: uN, bookingId: b0.id });
    eqc("ผู้ดูอย่างเดียว: actions ทั้งหมด false", (dv.vm as Rec)?.actions, { pay: false, qr: false, approve: false, reject: false, cancel: false, change: false, refund: false });
    const nn = { tenantId: tN, actorUserId: U.none.userId };
    for (const [n, i] of [["loadBookingListVM", { unitId: uN }], ["loadBookingDetailVM", { unitId: uN, bookingId: b0.id }], ["loadBookingDocsVM", { unitId: uN }], ["loadCashDayVM", { unitId: uN }]] as const)
      eqc(`ไม่มี trips.booking.view: ${n}`, (await call(n, nn, i)).code, "FORBIDDEN");
  });

  // ═══════════════ ฉาก 1: รับเงินสดเต็มจำนวน ═══════════════
  await run("1", "รับเงินสดเต็มจำนวน (CONFIRMED ยังไม่จ่าย) + กดยืนยันสองครั้ง", async () => {
    const b = await mkBooking();
    eqc("ตั้งต้น: การจอง CONFIRMED ยังไม่จ่าย", [b.status, (await events(b.id)).length], ["CONFIRMED", 0]);
    const pr = await open(ownerCookies);
    eqc("เปิดจอ + ลิ้นชัก HTTP", await go(pr, `when=all&b=${b.id}`), 200);
    check("ลิ้นชักรายละเอียดขึ้น", await waitFor(pr, "trips-bk-detail"), true, await has(pr, "trips-bk-detail"));
    check("มีปุ่มรับเงิน", await has(pr, "trips-bk-pay"), true, await has(pr, "trips-bk-pay"));
    check("มีการ์ดเงินสดหน้าร้าน (เจ้าของ)", await has(pr, "trips-cash"), true, await has(pr, "trips-cash"));
    await clickId(pr, "trips-bk-pay");
    check("กล่องรับเงินขึ้น", await waitFor(pr, "trips-pay-dialog"), true, await has(pr, "trips-pay-dialog"));
    eqc("ยอดปริยาย = ยอดค้าง", await valueOf(pr, "trips-pay-amount"), baht(b.payable));
    check("เงินสด: มีแถบเก็บแยก · ไม่มีช่องเลขอ้างอิง", (await has(pr, "trips-pay-cash-note")) && !(await has(pr, "trips-pay-reference")), "note มี · reference ไม่มี", [await has(pr, "trips-pay-cash-note"), await has(pr, "trips-pay-reference")]);
    await shot(pr, "s1-pay-dialog");
    pr.posts.length = 0;
    await pr.page.click(T("trips-pay-confirm"), { clickCount: 2, delay: 30 });
    check("กล่องปิดหลังสำเร็จ", await waitGone(pr, "trips-pay-dialog"), true, await has(pr, "trips-pay-dialog"));
    check("ลิ้นชักรีเฟรช: ปุ่มรับเงินหาย", await waitGone(pr, "trips-bk-pay"), true, await has(pr, "trips-bk-pay"));
    await sleep(800);
    const ev = await events(b.id);
    eqc("ฐาน: แถวรับเงิน 1 แถว RECEIVED CASH เต็มยอด", ev.map((e) => [e.kind, e.tender, Number(e.amountSatang)]), [["RECEIVED", "CASH", b.payable]]);
    const row = await bkRow(b.id);
    eqc("ฐาน: การจอง PAID จ่ายครบ", [row.status, Number(row.paidSatang)], ["PAID", b.payable]);
    note(`คำขอ POST ระหว่างกดสองครั้ง: ${pr.posts.length} (สถานะ ${pr.posts.map((p) => p.status).join(",")})`);
    eqc("ลิ้นชัก: ป้ายสถานะ PAID", await attrOf(pr, T("trips-bk-status"), "data-status"), "PAID");
    check("ลิ้นชัก: ไม่มีปุ่ม QR", !(await has(pr, "trips-bk-qr")), false, await has(pr, "trips-bk-qr"));
    check("ลิ้นชัก: มีแถวการรับเงิน + กล่องเอกสารเงินรอออก", (await pr.page.evaluate(() => document.querySelectorAll('[data-testid^="trips-bk-event-"]').length)) === 1, 1, await pr.page.evaluate(() => document.querySelectorAll('[data-testid^="trips-bk-event-"]').length));
    eqc("แถวในตาราง: สถานะ PAID", await attrOf(pr, T(`trips-bk-row-${b.id}`), "data-status"), "PAID");
    const cash = await textOf(pr, T("trips-cash-expected"));
    check("การ์ดเงินสดวันนี้รวมยอดที่เพิ่งรับ (≥ ยอดการจอง)", cash !== null, "มีตัวเลข", cash);
    textChecks("ไทย: ลิ้นชักหลังรับเงิน", await visibleText(pr), "th");
    await shot(pr, "s1-after-cash-paid");
    eqc("ไม่มี page error", pr.errors, []);
    await pr.page.close();
  });

  // ═══════════════ ฉาก 2: โอนบางส่วน + จ่ายเกิน ═══════════════
  await run("2", "โอนบางส่วนพร้อมเลขอ้างอิง · จ่ายเกิน (ฝั่งจอ + ฝั่งบริการ)", async () => {
    const b = await mkBooking();
    const pr = await open(ownerCookies);
    await go(pr, `when=all&b=${b.id}`);
    await waitFor(pr, "trips-bk-pay");
    await clickId(pr, "trips-bk-pay");
    await waitFor(pr, "trips-pay-dialog");
    await clickId(pr, "trips-pay-tender-TRANSFER");
    check("โอน: มีช่องเลขอ้างอิง · ไม่มีแถบเงินสด", (await has(pr, "trips-pay-reference")) && !(await has(pr, "trips-pay-cash-note")), true, [await has(pr, "trips-pay-reference"), await has(pr, "trips-pay-cash-note")]);
    await typeInto(pr, "trips-pay-amount", "1,000.50");
    await typeInto(pr, "trips-pay-reference", "SCB-778899");
    await shot(pr, "s2-transfer-partial");
    // กดสองครั้งในจังหวะเดียวกัน (หนักกว่าดับเบิลคลิกจริง)
    await pr.page.evaluate((s: string) => { const el = document.querySelector(s) as HTMLButtonElement | null; el?.click(); el?.click(); }, T("trips-pay-confirm"));
    check("กล่องปิดหลังสำเร็จ", await waitGone(pr, "trips-pay-dialog"), true, await has(pr, "trips-pay-dialog"));
    await sleep(1200);
    const ev = await events(b.id);
    eqc("ฐาน: 1 แถว TRANSFER 1,000.50", ev.map((e) => [e.kind, e.tender, Number(e.amountSatang)]), [["RECEIVED", "TRANSFER", 100_050]]);
    const auditRef = Number((await q<Rec>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1 AND "action" = 'trips.payment.record' AND to_jsonb("AuditLog".*)::text LIKE '%SCB-778899%'`, [tN]).catch(() => [{ n: -1 }]))[0]?.n);
    check("ฐาน: เลขอ้างอิงที่พิมพ์ถูกส่งถึงบริการ (อยู่ใน audit ของการรับเงิน)", auditRef === 1, "audit 1 แถวมี SCB-778899", auditRef);
    check("ฐาน: เลขอ้างอิงอยู่ในแถวเงิน (TripMoneyEvent.reference)", ev[0]?.reference === "SCB-778899", "SCB-778899", Object.entries(ev[0] ?? {}).filter(([k]) => /ref/i.test(k)));
    const payTxt = (await textOf(pr, T("trips-bk-payments"))) ?? "";
    note(`ลิ้นชัก "การรับเงิน" ${payTxt.includes("SCB-778899") ? "แสดง" : "ไม่แสดง"}เลขอ้างอิงที่บันทึก: ${payTxt.replace(/\n/g, " | ").slice(0, 160)}`);
    const row = await bkRow(b.id);
    eqc("ฐาน: การจอง PART_PAID", [row.status, Number(row.paidSatang)], ["PART_PAID", 100_050]);
    const rest = b.payable - 100_050;
    check("ลิ้นชักรีเฟรช: ยังมีปุ่มรับเงิน", await waitFor(pr, "trips-bk-pay", 8000), true, await has(pr, "trips-bk-pay"));
    const money = (await textOf(pr, T("trips-bk-money"))) ?? "";
    check("ลิ้นชัก: ยอดค้างใหม่ถูกต้อง", money.includes(baht(rest)) && money.includes(baht(100_050)), `มี ${baht(rest)} และ ${baht(100_050)}`, money.replace(/\n/g, " | "));
    // (ก) จ่ายเกินฝั่งจอ
    await clickId(pr, "trips-bk-pay");
    await waitFor(pr, "trips-pay-dialog");
    eqc("เปิดใหม่: ยอดปริยาย = ยอดค้างที่เหลือ", await valueOf(pr, "trips-pay-amount"), baht(rest));
    await typeInto(pr, "trips-pay-amount", baht(rest + 100));
    const hint = (await textOf(pr, T("trips-pay-dialog"))) ?? "";
    check("จ่ายเกิน (ฝั่งจอ): ข้อความอ่านได้ในกล่อง", hint.includes("ยอดเกินยอดค้าง"), "มี \"ยอดเกินยอดค้าง …\"", hint.replace(/\n/g, " | ").slice(0, 200));
    eqc("จ่ายเกิน (ฝั่งจอ): ช่องยอด aria-invalid + ปุ่มยืนยัน disabled", [await attrOf(pr, T("trips-pay-amount"), "aria-invalid"), await disabledOf(pr, "trips-pay-confirm")], ["true", true]);
    await pr.page.evaluate((s: string) => (document.querySelector(s) as HTMLButtonElement | null)?.click(), T("trips-pay-confirm"));
    await sleep(700);
    eqc("จ่ายเกิน (ฝั่งจอ): ไม่มีแถวใหม่", (await events(b.id)).length, 1);
    await shot(pr, "s2-overpay-client");
    // (ข) จ่ายเกินฝั่งบริการ: กล่องค้างยอดเดิม แล้วมีคนอื่นรับเงินไปก่อน ⇒ ยืนยันยอดเดิม = เกินยอดค้างจริง
    await typeInto(pr, "trips-pay-amount", baht(rest));
    const other = await call("recordTripPayment", staffCtx(), { bookingId: b.id, amountSatang: 50_000, tender: "CASH", idempotencyKey: `o${hex(6)}` });
    eqc("(เตรียม) อีกเครื่องรับเงินสด 500.00 ไปก่อน", other.ok, true);
    await clickId(pr, "trips-pay-confirm");
    await sleep(1800);
    const al = await alertText(pr);
    check("จ่ายเกิน (ฝั่งบริการ): กล่องไม่ปิด + ข้อความอ่านได้", (await has(pr, "trips-pay-dialog")) && al.length > 0 && !RAW_KEY_RE.test(al) && !RAW_ENUM_RE.test(al), "ข้อความไทยอ่านได้ในกล่อง", al || "(ไม่มีข้อความ)");
    eqc("จ่ายเกิน (ฝั่งบริการ): ค่าที่พิมพ์ไม่หาย", await valueOf(pr, "trips-pay-amount"), baht(rest));
    eqc("จ่ายเกิน (ฝั่งบริการ): ฐานมี 2 แถว (ของเดิม + อีกเครื่อง) ไม่มีแถวที่สาม", (await events(b.id)).map((e) => Number(e.amountSatang)), [100_050, 50_000]);
    await shot(pr, "s2-overpay-server");
    eqc("ไม่มี page error", pr.errors, []);
    await pr.page.close();
  });

  // ═══════════════ ฉาก 3: พร้อมเพย์ QR ═══════════════
  await run("3", "QR พร้อมเพย์ยอดล็อก (ร้านยังไม่มีผู้รับ ⇒ ข้อความ · ตั้งผู้รับแล้วลองใหม่)", async () => {
    const b = await mkBooking();
    const pr = await open(ownerCookies);
    await go(pr, `when=all&b=${b.id}`);
    await waitFor(pr, "trips-bk-qr");
    await clickId(pr, "trips-bk-qr");
    check("กล่องรับเงินขึ้น (โหมดพร้อมเพย์)", await waitFor(pr, "trips-pay-dialog"), true, await has(pr, "trips-pay-dialog"));
    await sleep(2500);
    const al0 = await alertText(pr);
    check("ร้านไม่มีผู้รับพร้อมเพย์: ข้อความอ่านได้ ไม่มีรูป QR", al0.length > 0 && !RAW_KEY_RE.test(al0) && !RAW_ENUM_RE.test(al0) && !(await has(pr, "trips-pay-qr")), "ข้อความไทยอ่านได้ · ไม่มี QR", `${al0 || "(ไม่มีข้อความ)"} · qr=${await has(pr, "trips-pay-qr")}`);
    eqc("ยังไม่มี QR ⇒ ปุ่มยืนยัน disabled · ไม่มีช่องยอด", [await disabledOf(pr, "trips-pay-confirm"), await has(pr, "trips-pay-amount")], [true, false]);
    await shot(pr, "s3-no-receiver");
    await setV([{ key: "payments.receiver", scope: "UNIT", scopeId: uN, value: { promptpayId: "0812345678", displayName: "Probe Shop T1.3" } }]);
    let got = false;
    for (let i = 0; i < 3 && !got; i++) {
      if (await has(pr, "trips-pay-show-qr")) await clickId(pr, "trips-pay-show-qr");
      got = await waitFor(pr, "trips-pay-qr", 6000);
      if (!got) note(`ลองครั้งที่ ${i + 1}: ยังไม่ได้ QR — ${await alertText(pr)}`);
    }
    if (!got) {
      note("ลองโหลดหน้าใหม่ (เผื่อ server จำค่าตั้งเดิม)");
      await go(pr, `when=all&b=${b.id}`);
      await waitFor(pr, "trips-bk-qr");
      await clickId(pr, "trips-bk-qr");
      got = await waitFor(pr, "trips-pay-qr", 10_000);
    }
    check("ตั้งผู้รับแล้ว: รูป QR ขึ้น", got, true, got ? "ขึ้น" : await alertText(pr));
    const src = (await attrOf(pr, T("trips-pay-qr"), "src")) ?? "";
    check("QR เป็น data URL ของ SVG", src.startsWith("data:image/svg+xml"), "data:image/svg+xml…", src.slice(0, 40));
    const dlg = (await textOf(pr, T("trips-pay-dialog"))) ?? "";
    check("ยอดล็อกของ QR = ยอดค้างของการจอง", dlg.includes(baht(b.payable)), baht(b.payable), dlg.replace(/\n/g, " | ").slice(0, 220));
    check("ชื่อผู้รับแสดง", dlg.includes("Probe Shop T1.3"), "Probe Shop T1.3", dlg.replace(/\n/g, " | ").slice(0, 120));
    eqc("ขอ QR ไม่เขียนฐาน (ยังไม่มีแถวเงิน)", (await events(b.id)).length, 0);
    await shot(pr, "s3-qr");
    eqc("มี QR ⇒ ปุ่ม \"ได้รับเงินแล้ว\" กดได้", await disabledOf(pr, "trips-pay-confirm"), false);
    await clickId(pr, "trips-pay-confirm");
    check("กดได้รับเงินแล้ว ⇒ กล่องปิด", await waitGone(pr, "trips-pay-dialog"), true, await has(pr, "trips-pay-dialog"));
    await sleep(1000);
    eqc("ฐาน: 1 แถว PROMPTPAY = ยอดล็อก · การจอง PAID", [(await events(b.id)).map((e) => [e.tender, Number(e.amountSatang)]), (await bkRow(b.id)).status], [[["PROMPTPAY", b.payable]], "PAID"]);
    eqc("ไม่มี page error", pr.errors, []);
    await pr.page.close();
  });

  // ═══════════════ ฉาก 4: ยกเลิกการจองที่ถือที่ ═══════════════
  await run("4", "ยกเลิกการจอง HOLD ที่ยังไม่จ่าย พร้อมเหตุผล ⇒ ที่นั่งคืน", async () => {
    const dep = await mkDep(PA);
    const d0 = await depRow(dep);
    const b = await mkBooking({ pay: "PAY_NOW", dep });
    const d1 = await depRow(dep);
    eqc("ตั้งต้น: การจอง HOLD (STAFF PAY_NOW)", b.status, "HOLD");
    check("ตั้งต้น: ตัวนับรอบขยับ (ถือ 2 ที่)", JSON.stringify(d0) !== JSON.stringify(d1), "ต่างจากก่อนจอง", `${fmt(d0)} → ${fmt(d1)}`);
    const pr = await open(ownerCookies);
    await go(pr, `when=all&b=${b.id}`);
    await waitFor(pr, "trips-bk-detail");
    const chip0 = await textOf(pr, T("trips-bk-chip-hold"));
    check("มีปุ่มยกเลิกการจอง", await has(pr, "trips-bk-cancel"), true, await has(pr, "trips-bk-cancel"));
    check("HOLD ยังไม่หมด ⇒ มีปุ่มรับเงิน", await has(pr, "trips-bk-pay"), true, await has(pr, "trips-bk-pay"));
    await clickId(pr, "trips-bk-cancel");
    check("กล่องยกเลิกขึ้น", await waitFor(pr, "trips-cancel-bk-dialog"), true, await has(pr, "trips-cancel-bk-dialog"));
    eqc("ยังไม่ใส่เหตุผล ⇒ ยืนยัน disabled", await disabledOf(pr, "trips-cancel-bk-confirm"), true);
    const sum = (await textOf(pr, T("trips-cancel-bk-dialog"))) ?? "";
    check("สรุปบอกจำนวนที่นั่งที่จะคืน (2)", /2/.test(sum), "มีเลข 2", sum.replace(/\n/g, " | ").slice(0, 160));
    await pr.page.click(T("trips-cancel-bk-reason"));
    await pr.page.keyboard.type("ลูกค้าเปลี่ยนใจ ขอยกเลิก", { delay: 10 });
    await sleep(200);
    await shot(pr, "s4-cancel-dialog");
    await pr.page.click(T("trips-cancel-bk-confirm"), { clickCount: 2, delay: 30 });
    check("กล่องปิดหลังสำเร็จ", await waitGone(pr, "trips-cancel-bk-dialog"), true, (await alertText(pr)) || (await has(pr, "trips-cancel-bk-dialog")));
    await sleep(1200);
    const row = await bkRow(b.id);
    eqc("ฐาน: การจอง CANCELLED", row.status, "CANCELLED");
    eqc("ฐาน: ตัวนับรอบกลับเท่าก่อนจอง", await depRow(dep), d0);
    const holds = await q<Rec>(`SELECT status FROM "TripHold" WHERE "bookingId" = $1`, [b.id]);
    check("ฐาน: ไม่มี hold ACTIVE ค้าง", holds.every((h) => h.status !== "ACTIVE"), "ไม่มี ACTIVE", holds.map((h) => h.status));
    check("ลิ้นชักรีเฟรช: ปุ่มยกเลิก/รับเงินหาย", (await waitGone(pr, "trips-bk-cancel", 8000)) && !(await has(pr, "trips-bk-pay")), true, [await has(pr, "trips-bk-cancel"), await has(pr, "trips-bk-pay")]);
    eqc("ตาราง: แถวเป็น CANCELLED", await attrOf(pr, T(`trips-bk-row-${b.id}`), "data-status"), "CANCELLED");
    const chip1 = await textOf(pr, T("trips-bk-chip-hold"));
    check("ชิปถือที่ลดลง", chip0 !== chip1, `ต่างจาก "${chip0}"`, chip1);
    await shot(pr, "s4-after-cancel");
    eqc("ไม่มี page error", pr.errors, []);
    await pr.page.close();
  });

  // ═══════════════ ฉาก 5: อนุมัติ / ปฏิเสธ / เวอร์ชันเก่า ═══════════════
  let pendingLeft: Bk | null = null;
  await run("5", "อนุมัติ PENDING 1 ใบ · ปฏิเสธ 1 ใบ · เวอร์ชันเก่า ⇒ ข้อความชน ไม่เขียน", async () => {
    const dep = await mkDep(PP);
    let P: Bk[] = [];
    try { P = [await mkPending(dep), await mkPending(dep), await mkPending(dep)]; } catch (e) { check("สร้างการจอง PENDING จริง (SHOP_CONFIRMS + ผู้จองสาธารณะ)", false, "PENDING 3 ใบ", errMsg(e)); return; }
    eqc("ตั้งต้น: 3 ใบ PENDING (ผ่าน holdTrips → confirmTrips ของผู้จองสาธารณะ ไม่ได้แก้สถานะในฐาน)", P.map((p) => p.status), ["PENDING", "PENDING", "PENDING"]);
    const dAll = await depRow(dep);
    const pr = await open(ownerCookies);
    // ── อนุมัติ ──
    await go(pr, `when=all&b=${P[0].id}`);
    await waitFor(pr, "trips-bk-detail");
    eqc("PENDING: มีอนุมัติ/ปฏิเสธ/ยกเลิก · ไม่มีรับเงิน", [await has(pr, "trips-bk-approve"), await has(pr, "trips-bk-reject"), await has(pr, "trips-bk-cancel"), await has(pr, "trips-bk-pay")], [true, true, true, false]);
    eqc("ป้ายแถว = ต้องทำ (alert)", await pr.page.evaluate((s: string) => document.querySelector(`${s} [data-shape="alert"]`) !== null, T(`trips-bk-row-${P[0].id}`)), true);
    await clickId(pr, "trips-bk-approve");
    check("กล่องอนุมัติขึ้น", await waitFor(pr, "trips-approve-dialog"), true, await has(pr, "trips-approve-dialog"));
    await shot(pr, "s5-approve-dialog");
    eqc("อนุมัติ: ไม่บังคับเหตุผล ⇒ ยืนยันกดได้", await disabledOf(pr, "trips-approve-confirm"), false);
    await clickId(pr, "trips-approve-confirm");
    check("อนุมัติ: กล่องปิด", await waitGone(pr, "trips-approve-dialog"), true, (await alertText(pr)) || (await has(pr, "trips-approve-dialog")));
    await sleep(1000);
    const a = await bkRow(P[0].id);
    check("ฐาน: อนุมัติแล้วออกจาก PENDING (HOLD รอจ่าย หรือ CONFIRMED) · version +1", ["HOLD", "CONFIRMED"].includes(String(a.status)) && Number(a.version) === P[0].version + 1, "HOLD|CONFIRMED · v+1", [a.status, a.version]);
    check("ลิ้นชักรีเฟรช: ปุ่มอนุมัติหาย", await waitGone(pr, "trips-bk-approve", 8000), true, await has(pr, "trips-bk-approve"));
    // ── ปฏิเสธ ──
    await go(pr, `when=all&b=${P[1].id}`);
    await waitFor(pr, "trips-bk-reject");
    await clickId(pr, "trips-bk-reject");
    await waitFor(pr, "trips-approve-dialog");
    eqc("ปฏิเสธ: ยังไม่ใส่เหตุผล ⇒ ยืนยัน disabled", await disabledOf(pr, "trips-approve-confirm"), true);
    await pr.page.click(T("trips-approve-reason"));
    await pr.page.keyboard.type("รอบนี้เรือเต็มแล้ว", { delay: 10 });
    await sleep(200);
    await clickId(pr, "trips-approve-confirm");
    check("ปฏิเสธ: กล่องปิด", await waitGone(pr, "trips-approve-dialog"), true, (await alertText(pr)) || (await has(pr, "trips-approve-dialog")));
    await sleep(1000);
    eqc("ฐาน: ปฏิเสธ ⇒ CANCELLED", (await bkRow(P[1].id)).status, "CANCELLED");
    const dAfter = await depRow(dep);
    check("ฐาน: ที่นั่งของใบที่ปฏิเสธถูกคืน (ตัวนับรอบลดลง)", Number(dAfter.held) + Number(dAfter.sold) + Number(dAfter.reserved) < Number(dAll.held) + Number(dAll.sold) + Number(dAll.reserved), `รวม < ${fmt(dAll)}`, dAfter);
    eqc("ตาราง: แถวที่ปฏิเสธเป็น CANCELLED", await attrOf(pr, T(`trips-bk-row-${P[1].id}`), "data-status"), "CANCELLED");
    // ── เวอร์ชันเก่า ──
    await go(pr, `when=all&b=${P[2].id}`);
    await waitFor(pr, "trips-bk-approve");
    await clickId(pr, "trips-bk-approve");
    await waitFor(pr, "trips-approve-dialog");
    await pool.query(`UPDATE "TripBooking" SET version = version + 1 WHERE id = $1`, [P[2].id]);
    const audit0 = Number((await q<Rec>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1`, [tN]))[0]?.n);
    await clickId(pr, "trips-approve-confirm");
    await sleep(1800);
    const al = await alertText(pr);
    check("เวอร์ชันเก่า: กล่องไม่ปิด + ข้อความชน", (await has(pr, "trips-approve-dialog")) && al.includes("การจองเปลี่ยนไปแล้ว"), "\"การจองเปลี่ยนไปแล้ว — โหลดใหม่\"", al || "(ไม่มีข้อความ)");
    const c = await bkRow(P[2].id);
    eqc("เวอร์ชันเก่า: ฐานไม่เปลี่ยน (PENDING · version = ที่แก้ไว้)", [c.status, Number(c.version)], ["PENDING", P[2].version + 1]);
    eqc("เวอร์ชันเก่า: ไม่มี audit ใหม่", Number((await q<Rec>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1`, [tN]))[0]?.n), audit0);
    await shot(pr, "s5-stale-conflict");
    pendingLeft = { ...P[2], version: P[2].version + 1 };
    eqc("ไม่มี page error", pr.errors, []);
    await pr.page.close();
  });

  // ═══════════════ ฉาก 6: ผู้ดูอย่างเดียว ═══════════════
  await run("6", "ผู้ใช้ที่มีแค่ trips.booking.view: เห็นรายการ/รายละเอียด ไม่มีปุ่มเขียน/เงินสด/คิวเอกสาร", async () => {
    const paid = await mkBooking(); // มีแถวเงิน ⇒ คิวเอกสารของหน่วยไม่ว่าง
    await call("recordTripPayment", staffCtx(), { bookingId: paid.id, amountSatang: paid.payable, tender: "CASH", idempotencyKey: `v${hex(6)}` });
    const conf = await mkBooking();
    const hold = await mkBooking({ pay: "PAY_NOW" });
    const pr = await open(viewerCookies);
    eqc("ผู้ดู: เปิดรายการ HTTP", await go(pr, "when=all"), 200);
    const nRows = await pr.page.evaluate(() => document.querySelectorAll('[data-testid^="trips-bk-row-"]').length);
    check("ผู้ดู: เห็นแถวการจอง", nRows >= 3, "≥ 3", nRows);
    eqc("ผู้ดู: ไม่มีการ์ดเงินสด · ไม่มีแท็บเอกสารเงินรอออก", [await has(pr, "trips-cash"), await has(pr, "trips-bk-seg-docs")], [false, false]);
    await shot(pr, "s6-viewer-list");
    for (const [label, b] of [["CONFIRMED", conf], ["HOLD", hold], ...(pendingLeft ? [["PENDING", pendingLeft] as const] : [])] as const) {
      eqc(`ผู้ดู: เปิดรายละเอียด ${label} HTTP`, await go(pr, `when=all&b=${b.id}`), 200);
      check(`ผู้ดู: ลิ้นชัก ${label} ขึ้น`, await waitFor(pr, "trips-bk-detail"), true, await has(pr, "trips-bk-detail"));
      eqc(`ผู้ดู ${label}: ไม่มีปุ่ม pay/qr/approve/reject/cancel`, [await has(pr, "trips-bk-pay"), await has(pr, "trips-bk-qr"), await has(pr, "trips-bk-approve"), await has(pr, "trips-bk-reject"), await has(pr, "trips-bk-cancel")], [false, false, false, false, false]);
      eqc(`ผู้ดู ${label}: ปุ่มยังไม่เปิดใช้ (change/refund) เป็น disabled`, [await disabledOf(pr, "trips-bk-change"), await disabledOf(pr, "trips-bk-refund")], [true, true]);
      const html = await pr.page.content();
      check(`ผู้ดู ${label}: HTML ทั้งหน้าไม่มีเบอร์เต็มของผู้จอง`, !html.includes(b.phone), "ไม่มี", html.includes(b.phone) ? "มีเบอร์เต็มใน HTML/RSC" : "ไม่มี");
      const cust = (await textOf(pr, T("trips-bk-customer"))) ?? "";
      check(`ผู้ดู ${label}: เบอร์ปิดบังในลิ้นชัก`, /\d{3}-xxx-\d{4}/.test(cust), "0xx-xxx-dddd", cust.replace(/\n/g, " | "));
    }
    await shot(pr, "s6-viewer-detail");
    eqc("ผู้ดู: ?view=docs HTTP", await go(pr, "when=all&view=docs"), 200);
    eqc("ผู้ดู: ?view=docs ไม่มีคิวเอกสาร (เห็นรายการปกติ)", [await has(pr, "trips-docs"), await has(pr, "trips-bk-table")], [false, true]);
    const html = await pr.page.content();
    check("ผู้ดู: ?view=docs&day= ไม่มีกล่อง/ตัวเลขเงินสด", !(await has(pr, "trips-cash-dialog")) && !html.includes("trips-cash-expected"), "ไม่มี", "ตรวจแล้ว");
    // เจ้าของเปรียบเทียบ (positive control): คิวเอกสารมีแถว
    const po = await open(ownerCookies);
    await go(po, "view=docs");
    const nDocs = await po.page.evaluate(() => document.querySelectorAll('[data-testid^="trips-docs-row-"]').length);
    check("เจ้าของ (positive control): ?view=docs มีคิวเอกสาร + แถว", (await has(po, "trips-docs")) && nDocs >= 1, "trips-docs + ≥ 1 แถว", [await has(po, "trips-docs"), nDocs]);
    textChecks("ไทย: คิวเอกสารเงินรอออก", await visibleText(po), "th");
    await shot(po, "s6-owner-docs");
    // ลิงก์ในคิวเอกสารไปลิ้นชักได้จริง (ไม่ใช่ dead link)
    const href = await po.page.evaluate(() => (document.querySelector('[data-testid^="trips-docs-row-"] a') as HTMLAnchorElement | null)?.getAttribute("href") ?? null);
    if (href) { const st = (await po.page.goto(`${BASE}${href}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null))?.status() ?? 0; check("ลิงก์เลขจองในคิวเอกสารเปิดลิ้นชักได้", st === 200 && (await waitFor(po, "trips-bk-detail", 8000)), "200 + ลิ้นชัก", st); }
    // ข้ามร้านผ่านหน้า: b ของร้าน seed ⇒ 404
    const foreign = (await q<{ id: string }>(`SELECT id FROM "TripBooking" WHERE "tenantId" = 'tripsqc-tenant-dive' ORDER BY code LIMIT 1`))[0];
    if (foreign) {
      const st = await go(po, `when=all&b=${foreign.id}`);
      const fcode = String((await q<Rec>(`SELECT code FROM "TripBooking" WHERE id = $1`, [foreign.id]))[0]?.code ?? "?");
      const body = await po.page.evaluate(() => document.body.innerText);
      const html2 = await po.page.content();
      check("เจ้าของร้านชั่วคราวเปิด ?b= ของร้านอื่น ⇒ ไม่มีลิ้นชัก · ไม่มีข้อมูลร้านอื่น · จอ not-found", !(await has(po, "trips-bk-detail")) && !(await has(po, "trips-bk")) && !html2.includes("tripsqc-party") && !html2.includes("ภัทรา"), "ไม่มี trips-bk / trips-bk-detail / ข้อมูลร้านอื่น", `HTTP ${st} · trips-bk=${await has(po, "trips-bk")} · detail=${await has(po, "trips-bk-detail")} · body="${body.replace(/\s+/g, " ").slice(-120)}"`);
      eqc(`?b= ของร้านอื่น (${fcode}) ⇒ HTTP 404`, st, 404);
      const st2 = await go(po, "when=all&b=does-not-exist");
      check("?b= ที่ไม่มีจริง ⇒ จอ not-found (ไม่มีรายการ)", !(await has(po, "trips-bk")), "ไม่มี trips-bk", `HTTP ${st2} · trips-bk=${await has(po, "trips-bk")}`);
    }
    eqc("?q= มีไบต์ NUL ⇒ ไม่ล่ม (HTTP 200)", await go(po, "q=a%00b"), 200);
    eqc("?q=%25 (wildcard) ⇒ HTTP 200", await go(po, "q=%25"), 200);
    note(`?q=% แสดง ${await po.page.evaluate(() => document.querySelectorAll('[data-testid^="trips-bk-row-"]').length)} แถว (ค้นด้วย % ตัวเดียว)`);
    eqc("ค่าพารามิเตอร์อ่านไม่ได้ ⇒ ไม่ 404", await go(po, "when=zzz&chip=x&ch=%27&date=2026-02-31&view=zzz&day=bad"), 200);
    eqc("ไม่มี page error", [...pr.errors, ...po.errors], []);
    await pr.page.close(); await po.page.close();
  });

  // ═══════════════ ฉาก 7: แป้นพิมพ์ · ทิ้งค่า · 390 · อังกฤษ ═══════════════
  await run("7", "Escape · ปิดกล่องที่พิมพ์ค่าไว้ · ล้นแนวนอนที่ 390 · จออังกฤษ", async () => {
    const b = await mkBooking();
    const pr = await open(ownerCookies);
    await go(pr, `when=all&b=${b.id}`);
    await waitFor(pr, "trips-bk-pay");
    eqc("เปิดลิ้นชัก: โฟกัสอยู่ที่ปุ่มปิด", await pr.page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null), "trips-bk-detail-close");
    // (ก) Escape ปิดกล่องก่อน แล้วค่อยปิดลิ้นชัก
    await clickId(pr, "trips-bk-pay");
    await waitFor(pr, "trips-pay-dialog");
    eqc("กล่องเปิด: มี dialog 2 ชั้น", await dialogCount(pr), 2);
    await pr.page.keyboard.press("Escape");
    await sleep(700);
    eqc("Escape ครั้งแรก: กล่องรับเงินปิด · ลิ้นชักยังอยู่", [await has(pr, "trips-pay-dialog"), await has(pr, "trips-bk-detail"), pr.page.url().includes(`b=${b.id}`)], [false, true, true]);
    eqc("Escape (กล่องยังไม่แก้ค่า): ไม่ถามยืนยัน", pr.confirms.length, 0);
    await pr.page.keyboard.press("Escape");
    await sleep(1200);
    eqc("Escape ครั้งที่สอง: ลิ้นชักปิด · URL ไม่มี b", [await has(pr, "trips-bk-detail"), pr.page.url().includes("b=")], [false, false]);
    // (ข) ปิดกล่องที่พิมพ์ยอดไว้ ⇒ ถามก่อน · เปิดใหม่ไม่ส่งอะไร
    await go(pr, `when=all&b=${b.id}`);
    await waitFor(pr, "trips-bk-pay");
    await clickId(pr, "trips-bk-pay");
    await waitFor(pr, "trips-pay-dialog");
    await typeInto(pr, "trips-pay-amount", "123");
    pr.confirms.length = 0; pr.confirmMode.accept = false;
    await pr.page.evaluate(() => { const btns = Array.from(document.querySelectorAll('[role="dialog"] button')).filter((x) => (x.textContent ?? "").trim() === "ยกเลิก"); (btns[btns.length - 1] as HTMLButtonElement | undefined)?.click(); });
    await sleep(600);
    eqc("ปุ่มยกเลิก (มีค่าที่พิมพ์): ถามยืนยัน 1 ครั้ง · ตอบไม่ ⇒ กล่องยังอยู่ ค่าไม่หาย", [pr.confirms.length, await has(pr, "trips-pay-dialog"), await valueOf(pr, "trips-pay-amount")], [1, true, "123"]);
    pr.confirms.length = 0;
    await pr.page.keyboard.press("Escape");
    await sleep(600);
    eqc("Escape (มีค่าที่พิมพ์): ถามยืนยัน 1 ครั้ง (ไม่ซ้ำ) · ตอบไม่ ⇒ กล่องยังอยู่", [pr.confirms.length, await has(pr, "trips-pay-dialog"), await valueOf(pr, "trips-pay-amount")], [1, true, "123"]);
    // Escape ค้าง (เบราว์เซอร์จริง: keyup หายไปกับกล่องยืนยัน) แล้วกด ✕ ⇒ ต้องถามก่อนเหมือนเดิม
    pr.confirms.length = 0;
    await pr.page.keyboard.down("Escape");
    await sleep(400);
    const afterEscDown = pr.confirms.length;
    pr.confirms.length = 0;
    const xClicked = await pr.page.evaluate(() => {
      const box = document.querySelector('[data-testid="trips-pay-dialog"]')?.closest('[role="dialog"]');
      const x = (box?.querySelector("h2")?.parentElement?.querySelector("button") ?? undefined) as HTMLButtonElement | undefined;
      if (!x) return false;
      x.click();
      return true;
    });
    await sleep(600);
    if (xClicked) check("หลัง Escape ที่ไม่มี keyup (ตอบไม่) แล้วกด ✕: ยังถามก่อนทิ้งค่า", pr.confirms.length === 1 && (await has(pr, "trips-pay-dialog")), "ถาม 1 ครั้ง · กล่องยังอยู่", `ถาม ${pr.confirms.length} ครั้ง (ตอน keydown ถาม ${afterEscDown}) · กล่องอยู่=${await has(pr, "trips-pay-dialog")}`);
    else note("หาปุ่ม ✕ ของกล่องไม่เจอ — ข้ามการทดสอบ Escape ค้าง");
    await pr.page.keyboard.up("Escape");
    if (!(await has(pr, "trips-pay-dialog"))) { await clickId(pr, "trips-bk-pay"); await waitFor(pr, "trips-pay-dialog"); await typeInto(pr, "trips-pay-amount", "123"); }
    pr.confirms.length = 0; pr.confirmMode.accept = true;
    await pr.page.evaluate(() => { const btns = Array.from(document.querySelectorAll('[role="dialog"] button')).filter((x) => (x.textContent ?? "").trim() === "ยกเลิก"); (btns[btns.length - 1] as HTMLButtonElement | undefined)?.click(); });
    await sleep(600);
    eqc("ปุ่มยกเลิก ตอบตกลง ⇒ กล่องปิด", [pr.confirms.length, await has(pr, "trips-pay-dialog")], [1, false]);
    await clickId(pr, "trips-bk-pay");
    await waitFor(pr, "trips-pay-dialog");
    eqc("เปิดใหม่: ยอดกลับเป็นยอดค้าง (ไม่ใช่ค่าที่พิมพ์ทิ้งไว้)", await valueOf(pr, "trips-pay-amount"), baht(b.payable));
    eqc("ปิด/เปิดกล่อง: ไม่มีอะไรถูกส่ง (0 แถวเงิน · สถานะเดิม)", [(await events(b.id)).length, (await bkRow(b.id)).status], [0, "CONFIRMED"]);
    textChecks("ไทย: กล่องรับเงิน + ลิ้นชัก + รายการ", await visibleText(pr), "th");
    await pr.page.keyboard.press("Escape"); await sleep(400);
    // กล่องเงินสดหน้าร้าน
    await pr.page.keyboard.press("Escape"); await sleep(900);
    if (await has(pr, "trips-cash-open")) {
      await clickId(pr, "trips-cash-open");
      check("กล่องเงินสดหน้าร้านเปิดได้", await waitFor(pr, "trips-cash-dialog", 6000), true, await has(pr, "trips-cash-dialog"));
      eqc("ปุ่มปิดยอดเงินสด disabled", await disabledOf(pr, "trips-cash-close"), true);
      textChecks("ไทย: กล่องเงินสดหน้าร้าน", await visibleText(pr), "th");
      await shot(pr, "s7-cash-dialog");
      await pr.page.keyboard.press("Escape"); await sleep(500);
      eqc("Escape ปิดกล่องเงินสด", await has(pr, "trips-cash-dialog"), false);
    }
    eqc("เดสก์ท็อป 1440: รายการไม่ล้นแนวนอน", await overflow(pr, 1440), false);
    eqc("ไม่มี page error (เดสก์ท็อป)", pr.errors, []);
    await pr.page.close();

    // (ค) 390
    const pm = await open(ownerCookies, { mobile: true });
    eqc("390: เปิดรายการ HTTP", await go(pm, "when=all"), 200);
    eqc("390: รายการไม่ล้นแนวนอน", await overflow(pm, 390), false);
    eqc("390: เห็นการ์ด ไม่เห็นตาราง", await pm.page.evaluate(() => ['[data-testid="trips-bk-cards"]', '[data-testid="trips-bk-table"]'].map((s) => { const e = document.querySelector(s) as HTMLElement | null; return !!e && e.offsetParent !== null; })), [true, false]);
    await pm.page.screenshot({ path: join(OUT, "s7-mobile-list.png"), fullPage: true });
    await go(pm, `when=all&b=${b.id}`);
    await waitFor(pm, "trips-bk-detail");
    eqc("390: ลิ้นชักไม่ล้นแนวนอน", await overflow(pm, 390), false);
    const dw = await pm.page.evaluate(() => { const e = document.querySelector('[data-testid="trips-bk-detail"]') as HTMLElement | null; const r = e?.getBoundingClientRect(); const inner = e ? Array.from(e.querySelectorAll("*")).filter((x) => (x as HTMLElement).scrollWidth > (x as HTMLElement).clientWidth + 2 && getComputedStyle(x).overflowX === "visible").length : -1; return { w: Math.round(r?.width ?? 0), right: Math.round(r?.right ?? 0), inner }; });
    check("390: ลิ้นชักเต็มจอ (กว้าง 390 · ชิดขวา)", dw.w === 390 && dw.right === 390, { w: 390, right: 390 }, dw);
    eqc("390: แถบปุ่มลิ้นชักเป็น 2 คอลัมน์", await pm.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="trips-bk-actions"]') as Element).gridTemplateColumns.split(" ").length), 2);
    await shot(pm, "s7-mobile-drawer");
    await clickId(pm, "trips-bk-pay");
    await waitFor(pm, "trips-pay-dialog");
    eqc("390: กล่องรับเงินไม่ล้นแนวนอน", await overflow(pm, 390), false);
    const pd = await pm.page.evaluate(() => { const box = document.querySelector('[data-testid="trips-pay-dialog"]')?.closest('[role="dialog"]') as HTMLElement | null; const r = box?.getBoundingClientRect(); const c = (document.querySelector('[data-testid="trips-pay-confirm"]') as HTMLElement | null)?.getBoundingClientRect(); return { left: Math.round(r?.left ?? -1), right: Math.round(r?.right ?? -1), confirmBottom: Math.round(c?.bottom ?? -1), vh: window.innerHeight }; });
    check("390: กล่องรับเงินอยู่ในจอ + ปุ่มยืนยันมองเห็น", pd.left >= 0 && pd.right <= 390 && pd.confirmBottom > 0 && pd.confirmBottom <= pd.vh, "ในจอ", pd);
    await shot(pm, "s7-mobile-pay-dialog");
    eqc("ไม่มี page error (390)", pm.errors, []);
    await pm.page.close();

    // (ง) อังกฤษ
    const pe = await open(ownerCookies, { locale: "en" });
    eqc("อังกฤษ: เปิดรายการ + ลิ้นชัก HTTP", await go(pe, `when=all&b=${b.id}`), 200);
    await waitFor(pe, "trips-bk-pay");
    eqc("อังกฤษ: <html lang>", await pe.page.evaluate(() => document.documentElement.lang), "en");
    textChecks("อังกฤษ: รายการ + ลิ้นชัก", await visibleText(pe), "en");
    await clickId(pe, "trips-bk-pay");
    await waitFor(pe, "trips-pay-dialog");
    await clickId(pe, "trips-pay-tender-TRANSFER");
    await typeInto(pe, "trips-pay-amount", "99999999");
    textChecks("อังกฤษ: กล่องรับเงิน (โอน · ยอดเกิน)", await visibleText(pe), "en");
    await shot(pe, "s7-en-pay-dialog");
    await typeInto(pe, "trips-pay-amount", baht(b.payable));
    pe.confirmMode.accept = true;
    await pe.page.keyboard.press("Escape"); await sleep(500);
    await pe.page.keyboard.press("Escape"); await sleep(900);
    await shot(pe, "s7-en-list");
    if (pendingLeft) {
      await go(pe, `when=all&b=${pendingLeft.id}`);
      await waitFor(pe, "trips-bk-approve");
      await clickId(pe, "trips-bk-reject");
      await waitFor(pe, "trips-approve-dialog");
      textChecks("อังกฤษ: ลิ้นชัก PENDING + กล่องปฏิเสธ", await visibleText(pe), "en");
      await pe.page.keyboard.press("Escape"); await sleep(400);
      await clickId(pe, "trips-bk-cancel");
      await waitFor(pe, "trips-cancel-bk-dialog");
      textChecks("อังกฤษ: กล่องยกเลิก", await visibleText(pe), "en");
      await pe.page.keyboard.press("Escape"); await sleep(400);
    }
    await go(pe, "view=docs");
    textChecks("อังกฤษ: คิวเอกสารเงินรอออก", await visibleText(pe), "en");
    await go(pe, "when=all&chip=attention");
    textChecks("อังกฤษ: ชิปต้องทำ", await visibleText(pe), "en");
    if (await has(pe, "trips-cash-open")) { await clickId(pe, "trips-cash-open"); await waitFor(pe, "trips-cash-dialog", 6000); textChecks("อังกฤษ: กล่องเงินสดหน้าร้าน", await visibleText(pe), "en"); }
    eqc("ไม่มี page error (อังกฤษ)", pe.errors, []);
    eqc("อังกฤษ: การจองไม่ถูกแตะ (0 แถวเงิน)", (await events(b.id)).length, 0);
    await pe.page.close();
  });
} catch (e) {
  fatal = `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 600) : String(e)}`;
} finally {
  try { await browser?.close(); } catch { /* ปิดแล้ว */ }
  let left = { tenants: -1, users: -1, sessions: -1 };
  try {
    await cleanupTenants(tenantIds);
    await cleanupUsers();
    if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.session.deleteMany({ where: { userAgent: UA } });
    left = {
      tenants: Number((await q<Rec>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0]?.n),
      users: Number((await q<Rec>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]))[0]?.n),
      sessions: Number((await q<Rec>(`SELECT count(*)::int AS n FROM "Session" WHERE "userAgent" = $1`, [UA]))[0]?.n),
    };
    const orphan = tenantIds.length ? Number((await q<Rec>(`SELECT (SELECT count(*) FROM "TripBooking" WHERE "tenantId" = ANY($1::text[]))::int + (SELECT count(*) FROM "TripMoneyEvent" WHERE "tenantId" = ANY($1::text[]))::int + (SELECT count(*) FROM "Party" WHERE "tenantId" = ANY($1::text[]))::int AS n`, [tenantIds]))[0]?.n) : 0;
    console.log(`\n🧹 ลบแถวของ probe แล้ว — เหลือ ร้าน ${left.tenants} · ผู้ใช้ ${left.users} · session ${left.sessions} · แถว trips/party ของร้านชั่วคราว ${orphan}`);
  } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await prisma.$disconnect().catch(() => undefined);
  await pool.end().catch(() => undefined);
  for (const d of [profile, `/tmp/snap-private-tmp/snap.chromium${profile}`]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ไม่มี */ } }
  const failed = lines.filter((l) => !l.ok);
  if (fatal) console.error(`❌ ${fatal}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ probe: "t1.3-next", base: BASE, checks: lines.length, passed: lines.length - failed.length, failed: failed.length, scenarios: scenarioResult, failures: failed.map((f) => `[${f.sc}] ${f.what} — got ${f.got}`), cleanup: left, fatal: fatal || null, shots: OUT })}`);
  process.exitCode = fatal ? 2 : failed.length > 0 ? 1 : 0;
}
