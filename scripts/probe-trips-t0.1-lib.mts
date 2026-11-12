// probe-trips-t0.1-lib.mts — ตัวช่วยร่วมของ probe ล่าบั๊ก T0.1 (untracked · hunter) · ร้านชั่วคราว slug/อีเมล `trips-hunt-*` ลบใน finally
import { randomBytes } from "node:crypto";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

export function boot(label: string) {
  loadTripsQcEnv(label);
  if (process.env.CI) { console.error("no CI"); process.exit(4); }
}
export type Rec = Record<string, unknown>;
export const STAMP = randomBytes(3).toString("hex");
export const rid = (p: string) => `trips-hunt-${p}-${STAMP}-${randomBytes(4).toString("hex")}`;
export const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 4000); } catch { return String(v); } };
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
export const pgCode = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "");

let _pool: pg.Pool | null = null;
export const pool = () => (_pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 24 }));
export const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool().query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
export const cols = async (t: string) => {
  if (!colCache.has(t)) colCache.set(t, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [t]));
  return colCache.get(t) ?? [];
};
const chkCache = new Map<string, string[]>();
export const checksOf = async (t: string) => {
  if (!chkCache.has(t)) chkCache.set(t, (await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [t])).map((r) => r.def));
  return chkCache.get(t) ?? [];
};
const colRe = (c: string) => new RegExp(`(^|[^A-Za-z0-9_"])"?${c}"?([^A-Za-z0-9_"]|$)`);
export const checkValues = async (t: string, c: string): Promise<string[] | null> => {
  for (const d of await checksOf(t)) {
    if (!colRe(c).test(d)) continue;
    const lits = [...d.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]);
    if (lits.length) return [...new Set(lits)].sort();
  }
  return null;
};
/** INSERT ขั้นต่ำ — เติม NOT NULL ที่ไม่มี default */
export async function insertRow(table: string, vals: Rec, client: pg.Pool | pg.PoolClient = pool()): Promise<Rec> {
  const v: Rec = { ...vals };
  const names = new Set((await cols(table)).map((c) => c.column_name));
  if ("updatedAt" in v && !names.has("updatedAt")) delete v.updatedAt;
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (t === "text" || t.startsWith("character")) { const lits = await checkValues(table, c.column_name); v[c.column_name] = lits?.[0] ?? `h${randomBytes(4).toString("hex")}`; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}"
      : t.startsWith("timestamp") ? new Date() : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await client.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return v;
}
export const tryCode = async (f: () => Promise<unknown>) => { try { await f(); return "ok"; } catch (e) { return pgCode(e) || errMsg(e); } };

export const tenantIds: string[] = [];
export type Actor = { role: "OWNER" | "STAFF" | "MANAGER"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
export async function mkTenant(tag: string): Promise<string> {
  const id = rid(`t${tag}`);
  await insertRow("Tenant", { id, name: `hunt ${tag}`, slug: `trips-hunt-${tag}-${STAMP}`, updatedAt: new Date() });
  tenantIds.push(id);
  return id;
}
export async function mkUnit(tenantId: string, tag: string, type = "TRIPS"): Promise<string> {
  const id = rid(`u${tag}`);
  await insertRow("BusinessUnit", { id, tenantId, type, name: `hunt unit ${tag}`, slug: `trips-hunt-${tag}-${STAMP}`, updatedAt: new Date() });
  return id;
}
export async function mkUser(tenantId: string, tag: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown>): Promise<Actor> {
  const id = rid(`usr${tag}`);
  await insertRow("User", { id, email: `trips-hunt-${tag}-${STAMP}@shark.local`, name: `hunt ${tag}`, updatedAt: new Date() });
  await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: new Date(), updatedAt: new Date() });
  return { role, unitAccess, permissions, userId: id };
}
export async function mkProduct(tenantId: string, unitId: string, extra: Rec = {}): Promise<string> {
  const id = rid("p");
  await insertRow("TripProduct", { id, tenantId, unitId, productType: "TOUR", sourceKind: "OWN", slug: id, status: "ACTIVE", title: JSON.stringify({ th: "hunt" }), body: "{}", currency: "THB", updatedAt: new Date(), ...extra });
  return id;
}
export async function mkDeparture(tenantId: string, unitId: string, productId: string, dayOffset: number, extra: Rec = {}): Promise<string> {
  const id = rid("d");
  const s = new Date(Date.now() + dayOffset * 86_400_000);
  await insertRow("TripDeparture", { id, tenantId, unitId, productId, localDate: s.toISOString().slice(0, 10), startsAt: s, endsAt: new Date(s.getTime() + 8 * 3_600_000), status: "OPEN", capacity: 20, updatedAt: new Date(), ...extra });
  return id;
}
export async function cleanup(): Promise<void> {
  const tids = [...tenantIds];
  const pending0 = (await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t).filter((t) => t !== "Tenant");
  if (tids.length) {
    let pending = pending0;
    for (let pass = 0; pass < 14 && pending.length; pass++) {
      const next: string[] = [];
      for (const t of pending) { try { await pool().query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
      pending = next;
    }
    if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด ${pending.join(", ")}`);
    try { await pool().query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant ${errMsg(e)}`); }
  }
  // แถวที่ probe อาจทิ้งด้วย tenantId ปลอมขึ้นต้น trips-hunt-
  for (const t of pending0) { try { await pool().query(`DELETE FROM "${t}" WHERE "tenantId" LIKE 'trips-hunt-%'`); } catch { /* */ } }
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE 'trips-hunt-%'`)).map((r) => r.id);
    if (us.length) {
      for (const t of ["Membership", "Session"]) { try { await pool().query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* */ } }
      await pool().query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
    }
  } catch (e) { console.log(`  ⚠️ ลบ user ${errMsg(e)}`); }
  const left = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE 'trips-hunt-%'`);
  console.log(`[cleanup] Tenant trips-hunt-* เหลือ ${left[0]?.n}`);
}
export const out = (tag: string, ...a: unknown[]) => console.log(`[${tag}]`, ...a.map((x) => (typeof x === "string" ? x : fmt(x))));
