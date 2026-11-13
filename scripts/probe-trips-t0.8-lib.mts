// probe-trips-t0.8-lib.mts — ตัวช่วยร่วมของ probe นักล่า T0.8 (untracked · hunter)
// ร้านชั่วคราว slug `trips-t08h-*` · อีเมล `trips-t08h-*` · ลบเฉพาะของตัวเอง · ที่เก็บไฟล์ปลอม (ดัก fetch + deps) แบบข้อสอบ
import { createHash, createHmac, randomBytes } from "node:crypto";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

export type Rec = Record<string, unknown>;
export type Fn = (...a: unknown[]) => Promise<unknown>;

export function boot(label: string) {
  loadTripsQcEnv(label);
  if (process.env.CI) { console.error("no CI"); process.exit(4); }
  pg.defaults.parseInputDatesAsUTC = true;
}

// ═══════ ที่เก็บปลอม (ต้องเรียกก่อน import โมดูลใด) ═══════
export const FAKE_ZONE = "qcfake-zone-t08h";
export const STORE = new Map<string, Uint8Array>();
export const STORE_LOG: { op: string; path: string }[] = [];
export const storageCtl = { fail: false, delDelayMs: 0 };
export function installFakeStorage() {
  process.env.SHARK_BUNNY_ZONE = FAKE_ZONE;
  process.env.SHARK_BUNNY_KEY = "qcfake-key";
  process.env.SHARK_BUNNY_CDN = "https://qcfake-t08h.invalid";
  delete process.env.BUNNY_ACCOUNT_KEY;
  const PREFIX = `https://sg.storage.bunnycdn.com/${FAKE_ZONE}/`;
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://sg.storage.bunnycdn.com/")) {
      if (!url.startsWith(PREFIX)) return new Response(null, { status: 403 });
      const path = url.slice(PREFIX.length);
      const method = (init?.method ?? "GET").toUpperCase();
      STORE_LOG.push({ op: method, path });
      if (method === "PUT") {
        const b = init?.body;
        STORE.set(path, b instanceof ArrayBuffer ? new Uint8Array(b) : b instanceof Uint8Array ? new Uint8Array(b) : new Uint8Array(0));
        return new Response(null, { status: 201 });
      }
      if (method === "DELETE") { if (storageCtl.fail) return new Response(null, { status: 503 }); return new Response(null, { status: STORE.delete(path) ? 200 : 404 }); }
      const got = STORE.get(path);
      return got ? new Response(got.slice().buffer as ArrayBuffer, { status: 200 }) : new Response(null, { status: 404 });
    }
    if (url.startsWith("https://api.bunny.net/")) return new Response(null, { status: 200 });
    if (url.includes("bunny") || url.includes("b-cdn")) return new Response(null, { status: 599 });
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
}
export const fakePut = async (path: string, data: Uint8Array) => { STORE_LOG.push({ op: "PUT", path }); STORE.set(path, new Uint8Array(data)); };
export const fakeDel = async (path: string) => {
  STORE_LOG.push({ op: "DELETE", path });
  if (storageCtl.delDelayMs) await new Promise((r) => setTimeout(r, storageCtl.delDelayMs));
  if (storageCtl.fail) return 503;
  return STORE.delete(path) ? 200 : 404;
};
export const DEPS = { put: fakePut, del: fakeDel };

// ═══════ ทั่วไป ═══════
export const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
export const hex = (n = 6) => randomBytes(n).toString("hex");
export const rid = (p: string) => `t08h${p}${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
export const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
export const fmt = (v: unknown): string => { try { return (JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? `<${x.length}B>` : x)) ?? String(v)).slice(0, 700); } catch { return String(v); } };
export const errMsg = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 300);
export const asRec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
export const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(asRec) : []);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
export const NOW0 = "2027-03-01T03:00:00.000Z";
export const SLUG = "trips-t08h-";
export const JPG = (n = 64) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };
export const PDF = (n = 64) => { const b = new Uint8Array(n); b.set([0x25, 0x50, 0x44, 0x46, 0x2d]); return b; };
export const PNG = (n = 64) => { const b = new Uint8Array(n); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return b; };

// ═══════ ผลของ probe ═══════
export type Finding = { id: string; sev: "BLOCKER" | "MAJOR" | "MINOR" | "NOTE"; status: "REPRODUCED" | "SUSPICION"; title: string; observed: string; expected: string };
export const findings: Finding[] = [];
export const ops: Record<string, number> = {};
export const checks: { id: string; ok: boolean; info: string }[] = [];
export const opn = (g: string, n = 1) => { ops[g] = (ops[g] ?? 0) + n; };
export function check(id: string, cond: boolean, info: string) {
  checks.push({ id, ok: cond, info });
  console.log(`  ${cond ? "✅" : "❌"} [${id}] ${info.slice(0, 600)}`);
}
export function finding(f: Finding) { findings.push(f); console.log(`  🐞 [${f.id}] ${f.sev} ${f.status}: ${f.title} — observed: ${f.observed.slice(0, 400)}`); }

// ═══════ pg ═══════
let _pool: pg.Pool | null = null;
export const pool = () => (_pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 }));
export const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool().query<T>(sql, params)).rows;
export async function endPool() { if (_pool) await _pool.end(); }
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (t: string) => {
  if (!colCache.has(t)) colCache.set(t, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [t]));
  return colCache.get(t) ?? [];
};
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]); if (l.length) return l; }
  return [];
};
export async function insertRow(table: string, vals: Rec): Promise<string> {
  const v: Rec = { ...vals };
  const cs = await cols(table);
  const names = new Set(cs.map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of cs) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (c.column_name === "updatedAt" || c.column_name === "createdAt") { v[c.column_name] = new Date(); continue; }
    if (t === "text" || t.startsWith("character")) { const l = await checkLits(table, c.column_name); v[c.column_name] = l[0] ?? `h${hex(4)}`; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}"
      : t.startsWith("timestamp") ? "2027-01-01 00:00:00" : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool().query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id ?? "");
}

// ═══════ โมดูล ═══════
let _T: Rec | null = null;
export async function T(): Promise<Rec> { return (_T ??= asRec(await import("@/lib/modules/trips"))); }
export async function call(name: string, ...a: unknown[]): Promise<Rec> {
  const m = await T();
  const f = m[name];
  if (typeof f !== "function") return { ok: "NOFN", name };
  try { return asRec(await (f as Fn)(...a)); } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
}
export const code = (r: Rec) => (r.ok === true ? "ok" : r.ok === "THROW" ? `THROW:${String(r.e).slice(0, 120)}` : `${String(r.code)}${asRec(r.details).reason ? `/${String(asRec(r.details).reason)}` : ""}`);
export const val = (r: Rec, what: string): Rec => { if (r.ok !== true) throw new Error(`${what}: ${fmt(r)}`); return asRec(r.value); };

// ═══════ ร้านทดสอบ ═══════
export const PAX_KEYS = ["fullName", "nationality", "dob", "sex", "docType", "docNumber", "docExpiry", "phone", "birthPlace", "certLevel", "diveCount", "lastDiveAt", "finSize", "allergies", "pickupHotel"];
export const FIELDS = (req: string[], opt: string[] = []) => Object.fromEntries(PAX_KEYS.map((k) => [k, req.includes(k) ? "REQUIRED" : opt.includes(k) ? "OPTIONAL" : "OFF"]));
export const CONSENT_HASH = sha256hex(JSON.stringify(["trips.health-consent.v1",
  "ข้าพเจ้ายินยอมให้ร้านเก็บและใช้ข้อมูลสุขภาพของผู้เดินทางคนนี้ (อาหารที่แพ้ โรคประจำตัว แบบฟอร์มแพทย์) เพื่อความปลอดภัยและการจัดบริการของทริปนี้เท่านั้น ข้อมูลจะถูกลบตามระยะเวลาที่ร้านกำหนด และถอนความยินยอมได้ทุกเมื่อจากลิงก์นี้หรือแจ้งร้าน",
  "I consent to the shop collecting and using this traveller's health information (food allergies, medical conditions, medical form) only for the safety and service of this trip. The information will be deleted after the shop's retention period, and I can withdraw consent at any time from this link or by telling the shop."]));
export const consent = { accepted: true, textHash: CONSENT_HASH, locale: "th" };
export const RET = { passportImageDays: 30, medicalFormDays: 365, riskAckDays: 1095, consentAccessLogDays: 1100, manifestDays: 500, taxDocsDays: 1825 };

export type World = {
  tA: string; tB: string; uA: string; uA2: string; uB: string; uL: string;
  U: Record<string, Rec>;
  PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; adult: string }>;
  tenantIds: string[];
};
export const W: World = { tA: "", tB: "", uA: "", uA2: "", uB: "", uL: "", U: {}, PRD: {}, tenantIds: [] };
let seq = 0;

export async function sweepStale() {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1 AND "createdAt" < now() - interval '30 minutes'`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`  🧹 stale own tenants ${stale.length}`); await cleanupTenants(stale); }
}
export async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  for (const t of tids) if (!/^t08h/.test(t)) throw new Error(`refuse to clean foreign tenant ${t}`);
  let pending = (await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t).filter((t) => t !== "Tenant");
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await pool().query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
    pending = next;
  }
  try { await pool().query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
export async function cleanupMisc(lvIds: string[] = []) {
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE 'trips-t08h-%'`)).map((r) => r.id);
    if (us.length) { for (const t of ["Membership", "Session"]) { try { await pool().query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* */ } } await pool().query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]); }
  } catch (e) { console.log(`  ⚠️ users: ${errMsg(e)}`); }
  try { await pool().query(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'trips:token:t08h%' OR key LIKE 'files:private:ip:203.0.113.%' OR key LIKE 'files:private:LINK_CUSTOMER:t08h%' OR key = ANY($1::text[])`, [lvIds.map((x) => `files:private:LINK_CUSTOMER:${x}`)]); } catch { /* */ }
}

export async function setupWorld(): Promise<void> {
  const tA = rid("ta"), tB = rid("tb"), uA = rid("ua"), uA2 = rid("ub"), uB = rid("uc"), uL = rid("ul");
  Object.assign(W, { tA, tB, uA, uA2, uB, uL });
  for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `hunt T0.8 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); W.tenantIds.push(id); }
  for (const [id, t, tag, tz] of [[uA, tA, "a", "Asia/Bangkok"], [uA2, tA, "a2", "Asia/Bangkok"], [uB, tB, "b", "Asia/Bangkok"], [uL, tA, "l", "America/Santiago"]] as const)
    await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `hunt ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify({ timezone: tz }), updatedAt: new Date() });
  const mkUser = async (tag: string, tenantId: string, role: string, perms: Rec, unitAccess: string[] = ["*"]) => {
    const id = rid(`u${tag}`);
    await insertRow("User", { id, email: `trips-t08h-${tag}-${STAMP}@shark.local`, name: `hunter ${tag}`, updatedAt: new Date() });
    await insertRow("Membership", { id: rid(`m${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(perms), acceptedAt: new Date(), updatedAt: new Date() });
    W.U[tag] = { role, unitAccess, permissions: perms, userId: id };
  };
  await mkUser("oa", tA, "OWNER", {}); await mkUser("ob", tB, "OWNER", {});
  await mkUser("mg", tA, "MANAGER", {});
  await mkUser("mgall", tA, "MANAGER", { "trips.*": true, "trips.passenger.view": true, "trips.passenger.edit": true });
  await mkUser("sv", tA, "STAFF", { "trips.passenger.view": true });
  await mkUser("se", tA, "STAFF", { "trips.passenger.view": true, "trips.passenger.edit": true });
  await mkUser("sh", tA, "STAFF", { "trips.passenger.view": true, "trips.passenger.edit": true, "trips.passenger.health": true });
  await mkUser("shu2", tA, "STAFF", { "trips.passenger.view": true, "trips.passenger.edit": true, "trips.passenger.health": true, "trips.passenger.reveal": true }, [uA2]);
  await mkUser("sr", tA, "STAFF", { "trips.passenger.view": true, "trips.passenger.reveal": true });
  await mkUser("pm", tA, "STAFF", { "trips.pdpa.manage": true });
  await mkUser("pmx", tA, "STAFF", { "trips.pdpa.manage": true, "trips.passenger.reveal": true, "trips.passenger.health": true });
  await mkUser("hstr", tA, "STAFF", { "trips.passenger.health": "true", "trips.passenger.reveal": 1, "trips.passenger.view": true });
  // ไม่ได้ยอมรับคำเชิญ
  { const id = rid("upend"); await insertRow("User", { id, email: `trips-t08h-pend-${STAMP}@shark.local`, name: "pending", updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mpend"), userId: id, tenantId: tA, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: null, updatedAt: new Date() });
    W.U.pend = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id }; }
  const mkProd = async (key: string, tenantId: string, unitId: string, flags: { deepDive?: boolean; crossBorder?: boolean } = {}) => {
    const id = rid(`p${key}`), o = rid(`o${key}`);
    await insertRow("TripProduct", { id, tenantId, unitId, slug: `t08h-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ล่า ${key}` }), body: "{}", currency: "THB", deepDive: !!flags.deepDive, crossBorder: !!flags.crossBorder, updatedAt: new Date() });
    await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วม" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
    const adult = await insertRow("TripPaxType", { id: rid("pt"), tenantId, unitId, productId: id, code: "ADULT", label: JSON.stringify({ th: "ผู้ใหญ่" }), countsCapacity: true, active: true, sortOrder: 0, updatedAt: new Date() });
    await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: adult, cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: 350_000, weekdayMask: null, priority: 0, updatedAt: new Date() });
    W.PRD[key] = { id, opt: o, unit: unitId, tenant: tenantId, adult };
  };
  await mkProd("PD", tA, uA, { deepDive: true }); await mkProd("PT", tA, uA); await mkProd("PN", tA, uA);
  await mkProd("PC", tA, uA2, { deepDive: true }); await mkProd("PB", tB, uB, { deepDive: true }); await mkProd("PL", tA, uL, { deepDive: true });
  const VATREG = { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 };
  const P = (k: string) => W.PRD[k].id;
  const pdFields = FIELDS(["fullName", "nationality", "dob", "docType", "docNumber", "certLevel", "diveCount"], ["allergies", "finSize", "phone", "sex"]);
  await setV(tA, [
    ...[uA, uA2, uL].map((u) => ({ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: u, value: VATREG })),
    { key: "trips.pdpa.retention", scope: "UNIT", scopeId: uA, value: RET },
    { key: "trips.pdpa.retention", scope: "UNIT", scopeId: uA2, value: { ...RET, passportImageDays: null, medicalFormDays: null } },
    { key: "trips.pdpa.retention", scope: "UNIT", scopeId: uL, value: { passportImageDays: 1, medicalFormDays: 2, riskAckDays: 3, consentAccessLogDays: 4, manifestDays: 5, taxDocsDays: 1825 } },
    { key: "trips.pdpa.maskOnScreen", scope: "UNIT", scopeId: uA2, value: false },
    { key: "trips.pax.fields", scope: "PRODUCT", scopeId: P("PD"), value: pdFields },
    { key: "trips.pdpa.healthDataProducts", scope: "PRODUCT", scopeId: P("PD"), value: true },
    { key: "trips.waiver.requiredFor", scope: "PRODUCT", scopeId: P("PD"), value: "SCUBA_ONLY" },
    { key: "trips.pax.fields", scope: "PRODUCT", scopeId: P("PL"), value: pdFields },
    { key: "trips.pdpa.healthDataProducts", scope: "PRODUCT", scopeId: P("PL"), value: true },
    { key: "trips.waiver.requiredFor", scope: "PRODUCT", scopeId: P("PL"), value: "SCUBA_ONLY" },
    { key: "trips.pax.fields", scope: "PRODUCT", scopeId: P("PC"), value: pdFields },
    { key: "trips.pdpa.healthDataProducts", scope: "PRODUCT", scopeId: P("PC"), value: true },
    { key: "trips.pax.fields", scope: "PRODUCT", scopeId: P("PT"), value: FIELDS(["fullName"], ["allergies", "pickupHotel"]) },
    { key: "trips.pdpa.healthDataProducts", scope: "PRODUCT", scopeId: P("PT"), value: false },
    { key: "trips.waiver.requiredFor", scope: "PRODUCT", scopeId: P("PT"), value: "NONE" },
    { key: "trips.pax.fields", scope: "PRODUCT", scopeId: P("PN"), value: FIELDS(["fullName"], ["phone"]) },
    { key: "trips.pdpa.healthDataProducts", scope: "PRODUCT", scopeId: P("PN"), value: false },
    { key: "trips.waiver.requiredFor", scope: "PRODUCT", scopeId: P("PN"), value: "ALL" },
  ]);
  await setV(tB, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uB, value: VATREG },
    { key: "trips.pax.fields", scope: "PRODUCT", scopeId: P("PB"), value: pdFields },
    { key: "trips.pdpa.healthDataProducts", scope: "PRODUCT", scopeId: P("PB"), value: true }], "ob");
}
export async function setV(tenantId: string, changes: Rec[], who = "oa") {
  const S = asRec(await import("@/lib/core/settings"));
  const r = asRec(await (S.setSettings as Fn)(W.U[who], { tenantId }, changes, { ackLegalWarn: true }));
  if (r.ok !== true) throw new Error(`setSettings ${fmt(r)}`);
}
export const staff = (who = "oa", o: { unit?: string; tenant?: string; now?: string | Date } = {}): Rec => ({
  tenantId: o.tenant ?? (who === "ob" ? W.tB : W.tA), unitId: o.unit ?? (who === "ob" ? W.uB : W.uA), channel: "COUNTER", actor: { kind: "STAFF", userId: String(W.U[who]?.userId ?? "x") }, now: new Date(o.now ?? NOW0), locale: "th" });
let pubN = 0;
export const pctx = (now: string | Date = NOW0, ck?: string): Rec => ({ clientKey: ck ?? `t08h_c${pubN++}_${hex(3)}`, now: new Date(now), locale: "th" });
export type Bk = { bookingId: string; pax: string[]; dep: string; key: string };
export async function mkDep(key: string, date: string, o: { endsAt?: Date } = {}): Promise<string> {
  const p = W.PRD[key]; const startsAt = new Date(BKK(date, "08:00").getTime() + (seq++ % 600) * 60_000); const id = rid("d");
  await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: o.endsAt ?? new Date(startsAt.getTime() + 8 * 3_600_000),
    status: "OPEN", capacity: 400, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
  return id;
}
export async function mkBooking(key: string, names: string[], o: { date?: string; endsAt?: Date } = {}): Promise<Bk> {
  const p = W.PRD[key]; const dep = await mkDep(key, o.date ?? "2027-03-10", { endsAt: o.endsAt });
  const ctx = staff(p.tenant === W.tB ? "ob" : "oa", { unit: p.unit, tenant: p.tenant });
  const line = { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: dep, optionId: p.opt, pax: [{ paxTypeId: p.adult, qty: names.length }], extras: [] };
  const quote = val(await call("quoteTrips", ctx, { lines: [line] }, {}), "quoteTrips");
  const r = await call("bookTripsNow", ctx, { quote: { lines: [line] }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `n${hex(6)}`, booker: { name: `ผู้จอง ${hex(2)}`, phone: `08${String(10_000_000 + Number.parseInt(hex(3), 16) % 89_999_999).slice(-8)}` },
    pay: { method: "PAY_LATER" }, passengers: names.map((n) => ({ name: n, paxTypeId: p.adult })) }, {});
  if (r.ok !== true) throw new Error(`bookTripsNow ${fmt(r)}`);
  const bookingId = String(asArr(r.value)[0]?.bookingId ?? "");
  const rows = await q<{ id: string; fullName: string | null }>(`SELECT id, "fullName" FROM "TripPassenger" WHERE "bookingId" = $1 ORDER BY "createdAt", id`, [bookingId]);
  const ids = [...rows].sort((a, b) => names.indexOf(String(a.fullName)) - names.indexOf(String(b.fullName))).map((x) => x.id);
  return { bookingId, pax: ids, dep, key };
}
export const TOKENS: string[] = [];
export async function issue(pid: string, who = "oa", now: string | Date = NOW0, unit?: string): Promise<{ token: string; expiresAt: string }> {
  const v = val(await call("issuePassengerFormLink", staff(who, { now, unit }), { passengerId: pid }), "issue");
  const token = String(v.token ?? ""); TOKENS.push(token);
  return { token, expiresAt: String(v.expiresAt ?? "") };
}
export async function curTemplateHash(key: string): Promise<string> {
  const S = asRec(await import("@/lib/core/settings"));
  const r = asRec(await (S.resolveSettings as Fn)({ tenantId: W.PRD[key].tenant }, ["trips.waiver.template"], { unitId: W.PRD[key].unit, productId: W.PRD[key].id }, new Date(NOW0)));
  const v = asRec(asRec(r["trips.waiver.template"]).value);
  return sha256hex(JSON.stringify(["trips.waiver.v1", String(v.th ?? ""), typeof v.en === "string" ? v.en : null]));
}
export const pax = async (id: string) => (await q<Rec>(`SELECT * FROM "TripPassenger" WHERE id = $1`, [id]))[0] ?? {};
export const docRow = async (id: string) => (await q<Rec>(`SELECT * FROM "TripDocument" WHERE id = $1`, [id]))[0] ?? null;
export const lastIssued = async (pid: string) => (await q<{ id: string }>(`SELECT id FROM "AuditLog" WHERE action = 'trips.passenger.link_issued' AND "targetId" = $1 ORDER BY "createdAt" DESC, id DESC LIMIT 1`, [pid]))[0]?.id ?? "";
export const revOf = (row: Rec) => Number(asRec(row.answers).rev ?? 0);
export const submit = (token: string, body: Rec, now: string | Date = NOW0, ck?: string) => call("submitPassengerForm", pctx(now, ck), { token, idempotencyKey: `s${hex(6)}`, ...body });
export const fullPD = (o: Rec = {}): Rec => ({ fullName: "Hunter Person", nationality: "TH", dob: "1990-05-06", docType: "PASSPORT", docNumber: `HX${hex(4).toUpperCase()}`, certLevel: "AOW", diveCount: 48, ...o });

// ═══════ route ═══════
let ipN = 1;
export async function routeHit(url: string, extraHeaders: Record<string, string> = {}): Promise<{ status: number; h: Record<string, string | null>; body: Uint8Array }> {
  const R = asRec(await import("@/app/api/files/[id]/route"));
  const GET = R.GET as (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>;
  const u = new URL(url.startsWith("http") ? url : `http://qc.local${url}`);
  const id = decodeURIComponent(u.pathname.replace(/^\/api\/files\//, ""));
  const res = await GET(new Request(u.toString(), { headers: { "x-forwarded-for": `203.0.113.${(ipN++ % 250) + 1}`, ...extraHeaders } }), { params: Promise.resolve({ id }) });
  const h: Record<string, string | null> = {};
  for (const k of ["cache-control", "x-content-type-options", "content-disposition", "location", "content-type", "referrer-policy", "retry-after"]) h[k] = res.headers.get(k);
  const body = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, h, body };
}
export function mintSig(fileId: string, exp: number, viewerKey: string): string {
  const s = process.env.SESSION_SECRET ?? "";
  return createHmac("sha256", `private-file:v1:${s}`).update(`${fileId}.${exp}.${viewerKey}`).digest("hex");
}
export const linkUrl = (fileId: string, lv: string, expOff = 200) => { const exp = Math.floor(Date.now() / 1000) + expOff; return `/api/files/${fileId}?exp=${exp}&sig=${mintSig(fileId, exp, `LINK_CUSTOMER:${lv}`)}&lv=${lv}`; };

// ═══════ สแกนการรั่ว ═══════
export async function scanLeaks(markers: string[], tids: string[], since: Date): Promise<{ where: string; marker: string; sample: string }[]> {
  const hits: { where: string; marker: string; sample: string }[] = [];
  const ms = markers.filter((m) => m.length >= 8);
  const scan = (where: string, rows: Rec[]) => {
    for (const r of rows) { const s = JSON.stringify(r); for (const m of ms) if (s.includes(m)) hits.push({ where, marker: m.slice(0, 16), sample: s.slice(Math.max(0, s.indexOf(m) - 80), s.indexOf(m) + 40) }); }
  };
  scan("OutboxEvent", await q(`SELECT type, payload, "idempotencyKey" FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[])`, [tids]));
  scan("AuditLog", await q(`SELECT action, before, after, "targetId", "targetType" FROM "AuditLog" WHERE "tenantId" = ANY($1::text[])`, [tids]));
  try { scan("OpsEvent", await q(`SELECT * FROM "OpsEvent" WHERE "createdAt" >= $1`, [since])); } catch (e) { console.log(`  ⚠️ OpsEvent scan: ${errMsg(e)}`); }
  scan("TripDocView", await q(`SELECT * FROM "TripDocView" WHERE "tenantId" = ANY($1::text[])`, [tids]));
  scan("FileAsset", await q(`SELECT path, "cdnUrl" FROM "FileAsset" WHERE "tenantId" = ANY($1::text[])`, [tids]));
  scan("ChatRateBucket", await q(`SELECT key FROM "ChatRateBucket" WHERE "updatedAt" >= $1`, [since]));
  scan("TripPdpaRequest", await q(`SELECT * FROM "TripPdpaRequest" WHERE "tenantId" = ANY($1::text[])`, [tids]));
  return hits;
}

export function summary(label: string) {
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n══ ${label}: checks ${checks.length - failed.length}/${checks.length} green · findings ${findings.length}`);
  console.log("OPS", JSON.stringify(ops));
  console.log("FINDINGS_JSON", JSON.stringify(findings));
  console.log("FAILED_CHECKS", JSON.stringify(failed.map((c) => `${c.id}: ${c.info.slice(0, 200)}`)));
}
