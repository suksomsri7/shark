// probe-trips-t0.5-lib.mts — hunter T0.5 helpers (untracked) · temp tenants/ids prefixed `trips-hunt5-` · cleanup removes only those
import { randomBytes } from "node:crypto";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

export type Rec = Record<string, any>;
export function boot(label: string) {
  loadTripsQcEnv(label);
  if (process.env.CI) { console.error("no CI"); process.exit(4); }
  pg.defaults.parseInputDatesAsUTC = true;
}
export const STAMP = randomBytes(3).toString("hex");
export const rid = (p: string) => `trips-hunt5-${p}-${STAMP}-${randomBytes(4).toString("hex")}`;
export const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 1500); } catch { return String(v); } };
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
let _pool: pg.Pool | null = null;
export const pool = () => (_pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 }));
export const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool().query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (t: string) => {
  if (!colCache.has(t)) colCache.set(t, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [t]));
  return colCache.get(t) ?? [];
};
const checkLits = async (t: string, c: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [t]);
  for (const r of rows) if (new RegExp(`"?${c}"?`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]); if (l.length) return l; }
  return [];
};
export async function insertRow(table: string, vals: Rec): Promise<string> {
  const v: Rec = { ...vals };
  const all = await cols(table);
  const names = new Set(all.map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of all) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (t === "text" || t.startsWith("character")) { v[c.column_name] = (await checkLits(table, c.column_name))[0] ?? `h${randomBytes(4).toString("hex")}`; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool().query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id);
}
export const tenantIds: string[] = [];
export const userIds: string[] = [];
export async function mkTenant(tag: string) { const id = rid(`t${tag}`); await insertRow("Tenant", { id, name: `hunt5 ${tag}`, slug: `trips-hunt5-${tag}-${STAMP}`, updatedAt: new Date() }); tenantIds.push(id); return id; }
export async function mkUnit(tenantId: string, tag: string, tz?: string) { const id = rid(`u${tag}`); await insertRow("BusinessUnit", { id, tenantId, type: "TRIPS", name: `hunt5 unit ${tag}`, slug: `trips-hunt5-${tag}-${STAMP}`, settings: JSON.stringify(tz ? { timezone: tz } : {}), updatedAt: new Date() }); return id; }
export async function mkOwner(tenantId: string, tag: string) {
  const id = rid(`usr${tag}`); userIds.push(id);
  await insertRow("User", { id, email: `trips-hunt5-${tag}-${STAMP}@shark.local`, name: `hunt5 ${tag}`, updatedAt: new Date() });
  await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
  return { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id };
}
export type Prod = { id: string; opt: string; tenant: string; unit: string; pt: Record<string, string>; park: string; cam: string };
export async function mkProduct(tenantId: string, unitId: string, o: { slug?: string; type?: string; currency?: string; status?: string; park?: [number, number]; nights?: number } = {}): Promise<Prod> {
  const id = rid("p"), opt = rid("o");
  await insertRow("TripProduct", { id, tenantId, unitId, slug: o.slug ?? `h5-${randomBytes(4).toString("hex")}`, productType: o.type ?? "TOUR", sourceKind: "OWN", status: o.status ?? "ACTIVE", title: JSON.stringify({ th: "hunt5" }), body: "{}", currency: o.currency ?? "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
  await insertRow("TripOption", { id: opt, tenantId, unitId, productId: id, name: JSON.stringify({ th: "join" }), durationMin: 480, nights: o.nights ?? null, sortOrder: 1, active: true, updatedAt: new Date() });
  const pt: Record<string, string> = {};
  for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code }), countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
  const [pa, pc] = o.park ?? [60_000, 30_000];
  const park = await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: pa, currency: o.currency ?? "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE", name: JSON.stringify({ th: "park" }), paxPrices: JSON.stringify({ ADULT: pa, CHILD: pc }), active: true, updatedAt: new Date() });
  const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: 50_000, currency: o.currency ?? "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7", name: JSON.stringify({ th: "camera" }), active: true, updatedAt: new Date() });
  return { id, opt, tenant: tenantId, unit: unitId, pt, park, cam };
}
let seq = 0;
export async function mkDep(p: Prod, date: string, hm = "08:00", tzOff = "+07:00"): Promise<string> {
  const startsAt = new Date(new Date(`${date}T${hm}:00${tzOff}`).getTime() + (seq++ % 300) * 60_000); const id = rid("d");
  await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000), status: "OPEN", capacity: 500, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
  return id;
}
export async function cleanup(): Promise<void> {
  const tids = [...tenantIds];
  if (tids.length) {
    let pending = (await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t).filter((t) => t !== "Tenant");
    for (let pass = 0; pass < 14 && pending.length; pass++) {
      const next: string[] = [];
      for (const t of pending) { try { await pool().query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
      pending = next;
    }
    if (pending.length) console.log(`  ⚠️ cleanup left ${pending.join(", ")}`);
    try { await pool().query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant ${errMsg(e)}`); }
  }
  if (userIds.length) {
    for (const t of ["Membership", "Session"]) { try { await pool().query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [userIds]); } catch { /* */ } }
    try { await pool().query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [userIds]); } catch (e) { console.log(`  ⚠️ users ${errMsg(e)}`); }
  }
  const left = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE 'trips-hunt5-%'`);
  console.log(`[cleanup] Tenant trips-hunt5-* left ${left[0]?.n}`);
  await pool().end();
}
export const out = (tag: string, ...a: unknown[]) => console.log(`[${tag}]`, ...a.map((x) => (typeof x === "string" ? x : fmt(x))));
export const safeCall = async (f: () => unknown): Promise<Rec> => { try { const r = await f(); return (r && typeof r === "object" ? r : { ok: "NONE", r }) as Rec; } catch (e) { return { ok: "THROW", name: (e as Error).name, e: errMsg(e), code: (e as Rec).code }; } };
export const brief = (r: Rec) => (r.ok === true ? { ok: true } : r.ok === false ? { ok: false, code: r.code, reason: r.details?.reason, msg: String(r.messageTh ?? r.message ?? "").slice(0, 60) } : r);
