// probe-trips-w1.1-hunt-lib.mts — shared helpers of the W1.1a bug-hunter probes (untracked · hunter)
// Temp shops: slug `w11hunt-*` (NOT the oracle's `trips-w11-*` prefix) · removed in cleanup() · buckets of every IP used are removed.
// HTTP target: the controller's QC server (read-only use) at 127.0.0.1:3241.
// ── post-review round (rulings X1–X12 in ledger/trips-briefs/W1.1.md) — adapted by the oracle writer, attacks unchanged ──
//   • X2(ข): the QC server is `next start` (NODE_ENV=production) ⇒ a request with NO forwarded IP header (or a loopback one) is now CLOSED (rate-limited page, no bucket).
//     Every probe request therefore carries an IP header (`ip:` ⇒ X-Forwarded-For) unless the scenario is specifically "no header".
//   • X6: only a human browser GET counts as a view ⇒ `req()` sends a browser User-Agent by default (node sends none, which is "not a person" now). `ua: null` sends none.
//   • Output statuses: HELD · FOUND · KNOWN (= still observable, but ruled as an accepted debt / deployment precondition — see `known()`), so accepted items stay visible without counting as new findings.
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import { canonicalClientIp } from "../src/lib/platform/trips-public-core";

export type Rec = Record<string, unknown>;
export const HOST = "127.0.0.1";
export const PORT = 3241;
export const SLUG = "w11hunt-";
export const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
export const hex = (n = 6) => randomBytes(n).toString("hex");
export const rid = (p: string) => `w11h_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
export const HOUR = 3_600_000;

export function boot(label: string) {
  loadTripsQcEnv(label);
  if (process.env.CI) { console.error("no CI"); process.exit(4); }
  pg.defaults.parseInputDatesAsUTC = true;
}

let _pool: pg.Pool | null = null;
export const pool = () => (_pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 }));
export const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool().query<T>(sql, params)).rows;

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
export async function insertRow(table: string, vals: Rec): Promise<string> {
  const v: Rec = { ...vals };
  const all = await cols(table);
  if (!all.length) throw new Error(`no table ${table}`);
  const names = new Set(all.map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of all) {
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
  await pool().query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id ?? "");
}

// ═══════ temp shops ═══════
export const tenantIds: string[] = [];
export const allIds: string[] = [];
export async function mkTenant(tag: string, status = "ACTIVE", name?: string): Promise<{ id: string; slug: string }> {
  const id = rid(`t${tag}`); const slug = `${SLUG}${STAMP}-${tag}`;
  await insertRow("Tenant", { id, name: name ?? `Hunt W1.1 ${tag}`, slug, status, updatedAt: new Date() });
  tenantIds.push(id); allIds.push(id);
  return { id, slug };
}
export async function mkUnit(tenantId: string, tag: string, o: { type?: string; status?: string; settings?: Rec } = {}): Promise<string> {
  const id = rid(`u${tag}`);
  await insertRow("BusinessUnit", { id, tenantId, type: o.type ?? "TRIPS", status: o.status ?? "ACTIVE", name: `unit ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify(o.settings ?? {}), updatedAt: new Date() });
  allIds.push(id);
  return id;
}
export type Prod = { id: string; slug: string; opt: string; unit: string; tenant: string; pt: Record<string, string>; cam: string; park: string };
let pubN = 0;
export async function mkProd(key: string, tenantId: string, unitId: string, o: { status?: string; type?: string; slug?: string; title?: Rec; body?: Rec; meeting?: Rec; prices?: Record<string, number | null>; optName?: Rec } = {}): Promise<Prod> {
  const id = rid(`p${key}`), opt = rid(`o${key}`);
  const slug = o.slug ?? `w11h-${key.toLowerCase()}-${STAMP}`;
  await insertRow("TripProduct", { id, tenantId, unitId, slug, productType: o.type ?? "TOUR", sourceKind: "OWN", status: o.status ?? "ACTIVE", title: JSON.stringify(o.title ?? { th: `ฮันต์ ${key}`, en: `Hunt ${key}` }),
    body: JSON.stringify(o.body ?? { summary: { th: `สรุป ${key}` }, itinerary: { th: `กำหนดการ ${key}` }, includes: { th: `รวม ${key}`, en: `Includes ${key}` } }), ...(o.meeting ? { meetingPoint: JSON.stringify(o.meeting) } : {}), currency: "THB", deepDive: false, crossBorder: false,
    publishedAt: new Date(Date.parse("2026-01-01T00:00:00Z") + pubN++ * 60_000), updatedAt: new Date() });
  await insertRow("TripOption", { id: opt, tenantId, unitId, productId: id, name: JSON.stringify(o.optName ?? { th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
  const pt: Record<string, string> = {};
  for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : code === "CHILD" ? "เด็ก" : "ทารก", en: code === "ADULT" ? "Adult" : code === "CHILD" ? "Child" : "Infant" }), countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
  const park = await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: 60_000, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
    name: JSON.stringify({ th: "ค่าอุทยาน", en: "Marine park fee" }), paxPrices: JSON.stringify({ ADULT: 60_000, CHILD: 30_000 }), active: true, updatedAt: new Date() });
  const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: 50_000, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
    name: JSON.stringify({ th: "เช่ากล้องกันน้ำ", en: "Waterproof camera" }), active: true, updatedAt: new Date() });
  const prices = o.prices ?? { ADULT: 123_400, CHILD: 56_700, INFANT: 0 };
  for (const [code, amount] of Object.entries(prices)) if (amount !== null) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
  allIds.push(id, opt, park, cam, ...Object.values(pt));
  return { id, slug, opt, unit: unitId, tenant: tenantId, pt, cam, park };
}
/** departure: `startsAt` absolute · `localDate` given explicitly (unit-local date) */
export async function mkDep(p: Prod, localDate: string, startsAt: Date, o: { capacity?: number; sold?: number; held?: number; reserved?: number; status?: string; cutoffAt?: Date; opt?: string | null } = {}): Promise<string> {
  const id = rid("d");
  await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: o.opt === undefined ? p.opt : o.opt, scheduleId: null, localDate, startsAt, endsAt: new Date(startsAt.getTime() + 8 * HOUR),
    status: o.status ?? "OPEN", capacity: o.capacity ?? 40, sold: o.sold ?? 0, held: o.held ?? 0, reserved: o.reserved ?? 0, minPax: null, cutoffAt: o.cutoffAt ?? startsAt, version: 0, updatedAt: new Date() });
  allIds.push(id);
  return id;
}

// ═══════ client keys / buckets ═══════
export const usedIps = new Set<string>(["127.0.0.1", "::1"]);
export function clientKeyOf(ip: string): string | null {
  const secret = process.env.SESSION_SECRET ?? "";
  const c = canonicalClientIp(ip);
  if (!c || secret.length < 32) return null;
  return `pc_${createHmac("sha256", `trips.public.client.v1:${secret}`).update(c).digest("hex").slice(0, 40)}`;
}
let ipSeq = 0;
const RUN_OCTET = 1 + (randomBytes(1)[0] ?? 0) % 250;
/** a fresh fake client IP nobody else uses (100.7x.<run>.<n>) */
export function freshIp(): string {
  const n = ipSeq++;
  const ip = `100.${70 + Math.floor(n / 62500)}.${RUN_OCTET}.${1 + (n % 250)}`.replace(/\.(\d+)\.(\d+)$/, (_m, _a, b) => `.${(RUN_OCTET + Math.floor(n / 250)) % 250 + 1}.${b}`);
  usedIps.add(ip);
  return ip;
}
export const useIp = (ip: string): string => { const c = canonicalClientIp(ip); if (c) usedIps.add(c); return ip; };

// ═══════ HTTP ═══════
/** a plain human browser (X6: requests without a browser User-Agent are not counted as views) */
export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const agent = new http.Agent({ keepAlive: true, maxSockets: 400 });
export type Resp = { status: number; headers: http.IncomingHttpHeaders; body: string; ms: number; err?: string };
export function req(path: string, o: { method?: string; headers?: Record<string, string | string[]>; ip?: string | null; body?: string; fresh?: boolean; ua?: string | null } = {}): Promise<Resp> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const headers: Record<string, string | string[]> = { accept: "text/html", ...(o.ua === null ? {} : { "user-agent": o.ua ?? BROWSER_UA }), ...(o.ip ? { "x-forwarded-for": o.ip } : {}), ...(o.headers ?? {}) };
    if (o.ip) useIp(o.ip);
    const r = http.request({ host: HOST, port: PORT, path, method: o.method ?? "GET", headers, ...(o.fresh ? { agent: false as const } : { agent }) }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), ms: performance.now() - t0 }));
      res.on("error", (e) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: "", ms: performance.now() - t0, err: String(e) }));
    });
    r.on("error", (e) => resolve({ status: 0, headers: {}, body: "", ms: performance.now() - t0, err: String(e) }));
    r.setTimeout(60_000, () => r.destroy(new Error("timeout 60s")));
    if (o.body) r.write(o.body);
    r.end();
  });
}
/** which page did we get */
export function kind(r: Resp): string {
  if (r.err) return `ERR(${r.err.slice(0, 40)})`;
  const b = r.body;
  const k = b.includes('data-testid="book-rate-limited"') ? "RATE" : b.includes('data-testid="book-not-found"') ? "NOTFOUND" : b.includes('data-testid="book-product"') ? "PRODUCT" : b.includes('data-testid="book-index"') ? "INDEX" : "OTHER";
  return `${r.status}/${k}`;
}
export const titleOf = (r: Resp): string => /<title>([^<]*)<\/title>/.exec(r.body)?.[1] ?? "";
/** every <title> the document carries, including ones streamed inside the RSC payload */
export const titlesAll = (r: Resp): string[] => [...new Set([...r.body.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1] ?? "").concat([...r.body.matchAll(/\\"title\\",\\"\d+\\",\{\\"children\\":\\"((?:[^"\\]|\\[^"])*)\\"/g)].map((m) => m[1] ?? "")))];
export const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] ?? 0 : 0; };
export async function pmap<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k] as T, k); } }));
  return out;
}

// ═══════ counters ═══════
export const statRows = (unit: string) => q<{ day: string; channel: string; linkId: string | null; views: number }>(`SELECT "day"::text AS day, channel, "linkId", views FROM "TripLinkStat" WHERE "unitId" = $1 ORDER BY "day", "linkId" NULLS FIRST`, [unit]);
export const viewsOf = async (unit: string) => (await statRows(unit)).reduce((s, r) => s + Number(r.views), 0);
export const bucketCount = async (like: string) => Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM "ChatRateBucket" WHERE key LIKE $1`, [like]))[0]?.n ?? 0);
export const opsCount = async () => Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM "OpsEvent" WHERE source LIKE 'trips.public%'`))[0]?.n ?? 0);

// ═══════ cleanup ═══════
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  const us = (await q<{ id: string }>(`SELECT id FROM "BusinessUnit" WHERE "tenantId" = ANY($1::text[])`, [tids])).map((r) => r.id);
  for (const t of tids) await pool().query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:book:${t}:%`]);
  for (const u of us) await pool().query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:view:${u}:%`]);
  let pending = (await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t).filter((t) => t !== "Tenant");
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await pool().query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  !! cleanup: could not empty ${pending.join(", ")}`);
  try { await pool().query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  !! cleanup tenant: ${String(e).slice(0, 200)}`); }
}
export async function sweepStale() {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`  sweep: ${stale.length} stale hunt tenants`); await cleanupTenants(stale); }
}
export async function cleanup() {
  try {
    await cleanupTenants(tenantIds);
    const keys = [...usedIps].map(clientKeyOf).filter((k): k is string => !!k).map((k) => `trips:book:none:${k}`);
    if (keys.length) { const r = await pool().query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [keys]); console.log(`  cleanup: removed ${r.rowCount} miss buckets of ${keys.length} probe IPs`); }
    const left = await q<{ n: string }>(`SELECT count(*)::text AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]);
    console.log(`  cleanup: hunt tenants left = ${left[0]?.n}`);
  } catch (e) { console.log(`  !! cleanup: ${String(e).slice(0, 300)}`); }
  agent.destroy();
  await pool().end().catch(() => undefined);
}

export const line = (tag: string, expected: string, got: string, okFlag: boolean) => console.log(`${okFlag ? "HELD " : "FOUND"} [${tag}] expected: ${expected} | got: ${got}`);
/** Accepted items of the post-review rulings (kept in the output on purpose — "known/accepted", not a new finding). */
export const ACCEPTED = {
  OQ28: "known/accepted — deployment precondition OQ28 (ruling X2 ค): the edge must OVERWRITE X-Real-IP / X-Vercel-Forwarded-For / X-Forwarded-For; on a bare `next start` these headers are client-controlled",
  STATUS_200: "known/accepted debt — rate-limited page answers HTTP 200 without Retry-After until the gate moves to the proxy/route layer (W1.1b)",
  NO_METHOD: "known debt of X6 — a server component cannot see the HTTP method: a body-less non-GET request (HEAD / DELETE / OPTIONS) sent with a browser User-Agent may still count; closes when the gate moves to the proxy/route layer (W1.1b)",
  FRAMEWORK_500: "known/accepted debt — framework 500 on a malformed percent-encoded path segment (not page code)",
} as const;
/** like line(), but a miss is reported as KNOWN (accepted by a ruling) instead of FOUND */
export const known = (tag: string, expected: string, got: string, okFlag: boolean, why: string) => console.log(`${okFlag ? "HELD " : "KNOWN"} [${tag}] expected: ${expected} | got: ${got}${okFlag ? "" : ` | ${why}`}`);
/** local date `YYYY-MM-DD` of an instant in a fixed-offset zone (minutes east) */
export const ymdAt = (d: Date, offsetMin: number) => new Date(d.getTime() + offsetMin * 60_000).toISOString().slice(0, 10);
