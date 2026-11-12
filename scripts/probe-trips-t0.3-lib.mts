// probe-trips-t0.3-lib.mts — ตัวช่วยร่วมของ probe ล่าบั๊ก T0.3 (untracked · hunter) · ร้านชั่วคราว slug/อีเมล/id `trips-hunt3-*` ลบใน cleanup
import { randomBytes } from "node:crypto";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

export type Rec = Record<string, unknown>;
export type Fn = (...a: unknown[]) => Promise<unknown>;
export type Ctx = { tenantId: string; actorUserId: string };
export type Actor = { role: "OWNER" | "STAFF" | "MANAGER"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };

export function boot(label: string) {
  loadTripsQcEnv(label);
  if (process.env.CI) { console.error("no CI"); process.exit(4); }
  pg.defaults.parseInputDatesAsUTC = true;
}
export const STAMP = randomBytes(3).toString("hex");
export const rid = (p: string) => `trips-hunt3-${p}-${STAMP}-${randomBytes(4).toString("hex")}`;
export const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 1500); } catch { return String(v); } };
export const errMsg = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 400);
export const out = (tag: string, ...a: unknown[]) => console.log(`[${tag}]`, ...a.map((x) => (typeof x === "string" ? x : fmt(x))));
export const asRec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});

let _pool: pg.Pool | null = null;
export const pool = () => (_pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 }));
export const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool().query<T>(sql, params)).rows;
export async function endPool() { if (_pool) await _pool.end(); }

// ── โมดูล (import หลังโหลด env) ──
let _trips: Rec | null = null;
let _set: Rec | null = null;
export async function mods() {
  _trips ??= (await import("@/lib/modules/trips")) as unknown as Rec;
  _set ??= (await import("@/lib/core/settings")) as unknown as Rec;
  return { T: _trips, S: _set };
}
export const fnOf = (m: Rec, name: string): Fn => { const f = m[name]; if (typeof f !== "function") throw new Error(`no fn ${name}`); return f as Fn; };
/** เรียกบริการ — throw ถูกจับเป็น {THROW: ข้อความ} เพื่อรายงาน */
export async function call(name: string, ...a: unknown[]): Promise<Rec> {
  const { T } = await mods();
  try { return asRec(await fnOf(T, name)(...a)); } catch (e) { return { THROW: errMsg(e) }; }
}
export const brief = (r: Rec) => (r.THROW ? `THROW ${String(r.THROW).slice(0, 200)}` : r.ok === true ? "ok" : `${String(r.code)}${r.message ? `(${String(r.message).slice(0, 120)})` : ""}`);
/** ข้อความดิบของฐาน/ไลบรารีที่ไม่ควรถึงผู้เรียก */
export const RAW = /violates|constraint|duplicate key|deadlock|serializ|Prisma|invalid input syntax|out of range|SQLSTATE|23514|23P01|23505|40P01|40001|P20\d\d|Invalid `|RangeError|TypeError/i;
export const rawLeak = (r: Rec) => !!r.THROW || (typeof r.message === "string" && RAW.test(r.message));

// ── ร้านชั่วคราว ──
export const tenantIds: string[] = [];
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (t: string) => {
  if (!colCache.has(t)) colCache.set(t, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [t]));
  return colCache.get(t) ?? [];
};
export async function insertRow(table: string, vals: Rec): Promise<string> {
  const v: Rec = { ...vals };
  const names = new Set((await cols(table)).map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    v[c.column_name] = t === "text" ? `h${randomBytes(4).toString("hex")}` : ["integer", "bigint", "numeric"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" ? "{}"
      : t.startsWith("timestamp") ? new Date() : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool().query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id);
}
export async function mkTenant(tag: string): Promise<string> {
  const id = rid(`t${tag}`);
  await insertRow("Tenant", { id, name: `hunt3 ${tag}`, slug: `trips-hunt3-${tag}-${STAMP}`, updatedAt: new Date() });
  tenantIds.push(id);
  return id;
}
export async function mkUnit(tenantId: string, tag: string, settings: Rec = {}, type = "TRIPS"): Promise<string> {
  const id = rid(`u${tag}`);
  await insertRow("BusinessUnit", { id, tenantId, type, name: `hunt3 unit ${tag}`, slug: `trips-hunt3-${tag}-${STAMP}`, settings: JSON.stringify(settings), updatedAt: new Date() });
  return id;
}
export async function mkUser(tenantId: string, tag: string, role: Actor["role"], unitAccess: string[], perms: string[]): Promise<Actor> {
  const id = rid(`usr${tag}`);
  const permissions = Object.fromEntries(perms.map((p) => [p, true]));
  await insertRow("User", { id, email: `trips-hunt3-${tag}-${STAMP}@shark.local`, name: `hunt3 ${tag}`, updatedAt: new Date() });
  await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: new Date(), updatedAt: new Date() });
  return { role, unitAccess, permissions, userId: id };
}
export async function mkProd(tenantId: string, unitId: string, titleTh: string, status = "ACTIVE", opt: Rec = { durationMin: 240 }): Promise<{ id: string; opt: string }> {
  const id = rid("p");
  await insertRow("TripProduct", { id, tenantId, unitId, slug: id.toLowerCase(), productType: "TOUR", sourceKind: "OWN", status, title: JSON.stringify({ th: titleTh, en: "hunt" }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
  const o = rid("o");
  await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ตัวเลือก" }), durationMin: null, nights: null, sortOrder: 1, active: true, updatedAt: new Date(), ...opt });
  return { id, opt: o };
}
export type Shop = { tenantId: string; unitId: string; owner: Actor; ctx: Ctx };
export async function mkShop(tag: string, settings: Rec = {}): Promise<Shop> {
  const tenantId = await mkTenant(tag);
  const unitId = await mkUnit(tenantId, tag, settings);
  const owner = await mkUser(tenantId, `o${tag}`, "OWNER", ["*"], []);
  return { tenantId, unitId, owner, ctx: { tenantId, actorUserId: owner.userId } };
}
export async function setV(shop: Shop, changes: Rec[]) {
  const { S } = await mods();
  const r = asRec(await fnOf(S, "setSettings")(shop.owner, { tenantId: shop.tenantId }, changes, {}));
  if (r.ok !== true) throw new Error(`setSettings ${fmt(r)}`);
}
export const DEP_SQL = `SELECT id, "productId", "scheduleId", to_char("localDate",'YYYY-MM-DD') AS "localDate", "startsAt", "endsAt", "cutoffAt", status, capacity, sold, held, reserved, "minPax", version, "createdAt" FROM "TripDeparture"`;
export const depRow = async (id: string) => (await q(`${DEP_SQL} WHERE id = $1`, [id]))[0] as Rec | undefined;

export async function cleanup(): Promise<void> {
  const tids = [...tenantIds];
  const tabs = (await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t).filter((t) => t !== "Tenant");
  if (tids.length) {
    let pending = tabs;
    for (let pass = 0; pass < 14 && pending.length; pass++) {
      const next: string[] = [];
      for (const t of pending) { try { await pool().query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
      pending = next;
    }
    if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด ${pending.join(", ")}`);
    try { await pool().query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant ${errMsg(e)}`); }
  }
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE 'trips-hunt3-%'`)).map((r) => r.id);
    if (us.length) {
      for (const t of ["Membership", "Session"]) { try { await pool().query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* */ } }
      await pool().query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
    }
  } catch (e) { console.log(`  ⚠️ ลบ user ${errMsg(e)}`); }
  const left = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE 'trips-hunt3-%'`);
  console.log(`[cleanup] Tenant trips-hunt3-* เหลือ ${left[0]?.n}`);
}
