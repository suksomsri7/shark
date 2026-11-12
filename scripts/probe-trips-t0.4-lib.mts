// probe-trips-t0.4-lib.mts — ตัวช่วยร่วมของ probe นักล่า T0.4 (untracked · hunter) · ร้านชั่วคราว slug/อีเมล/id `trips-hunt4-*` ลบใน cleanup
import { randomBytes } from "node:crypto";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

export type Rec = Record<string, unknown>;
export type Fn = (...a: unknown[]) => Promise<unknown>;

export function boot(label: string) {
  loadTripsQcEnv(label);
  if (process.env.CI) { console.error("no CI"); process.exit(4); }
  pg.defaults.parseInputDatesAsUTC = true;
}
export const STAMP = randomBytes(3).toString("hex");
export const hex = (n = 6) => randomBytes(n).toString("hex");
export const rid = (p: string) => `trips-hunt4-${p}-${STAMP}-${hex(4)}`;
export const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 1200); } catch { return String(v); } };
export const errMsg = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 400);
export const out = (tag: string, ...a: unknown[]) => console.log(`[${tag}]`, ...a.map((x) => (typeof x === "string" ? x : fmt(x))));
export const asRec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const addMin = (d: Date | string, m: number) => new Date(new Date(d).getTime() + m * 60_000);
export const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);

/** PRNG มีเมล็ด (mulberry32) */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] };
}

let _pool: pg.Pool | null = null;
export const pool = () => (_pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 16 }));
export const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool().query<T>(sql, params)).rows;
export async function endPool() { if (_pool) await _pool.end(); }

// ── โมดูล (import หลังโหลด env) ──
let _m: { T: Rec; S: Rec; D: Rec } | null = null;
export async function mods() {
  if (!_m) {
    const T = (await import("@/lib/modules/trips")) as unknown as Rec;
    const S = (await import("@/lib/core/settings")) as unknown as Rec;
    const D = (await import("@/lib/core/db")) as unknown as Rec;
    _m = { T, S, D };
  }
  return _m;
}
export const fnOf = (m: Rec, name: string): Fn => { const f = m[name]; if (typeof f !== "function") throw new Error(`no fn ${name}`); return f as Fn; };
/** เรียกบริการ — throw ถูกจับเป็น {THROW} */
export async function call(name: string, ...a: unknown[]): Promise<Rec> {
  const { T } = await mods();
  try { return asRec(await fnOf(T, name)(...a)); } catch (e) { return { THROW: errMsg(e), pgcode: String(asRec(e).code ?? "") }; }
}
export const brief = (r: Rec) => (r.THROW ? `THROW ${String(r.THROW).slice(0, 200)}` : r.ok === true ? "ok" : `${String(r.code)}`);
export const RAW = /violates|constraint|duplicate key|deadlock|serializ|Prisma|invalid input syntax|out of range|SQLSTATE|23514|23P01|23505|40P01|40001|55P03|25P02|P20\d\d|Invalid `|RangeError|TypeError|timeout|Transaction/i;
export const rawLeak = (r: Rec) => !!r.THROW || (typeof r.messageTh === "string" && RAW.test(r.messageTh)) || (typeof r.message === "string" && RAW.test(r.message));
/** ผลปฏิเสธต้องมีรหัส (ไม่ใช่ undefined) */
export const unnamed = (r: Rec) => r.ok !== true && !r.THROW && (typeof r.code !== "string" || !r.code);

/** *InTx ใน tx ของผู้เรียก (แบบที่ T0.6 จะเรียก) · CapacityAbort ⇒ {ok:false, code, thrown} · อื่น ⇒ THROW */
export async function inTx(tenantId: string, unitId: string, body: (tx: unknown) => Promise<unknown>, opts: Rec = { timeout: 60_000, maxWait: 60_000 }): Promise<Rec> {
  const { D } = await mods();
  const db = asRec(fnOf(D, "tenantDb")({ tenantId, unitId }) as unknown);
  const tr = db.$transaction as (f: (tx: unknown) => Promise<unknown>, o?: Rec) => Promise<unknown>;
  try { return asRec(await tr.call(db, body, opts)); }
  catch (e) {
    const o = asRec(e);
    if (o.name === "CapacityAbort" && typeof o.code === "string") return { ok: false, code: o.code, thrown: true, messageTh: String(o.message ?? "") };
    return { THROW: errMsg(e), pgcode: String(o.code ?? "") };
  }
}

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
    v[c.column_name] = t === "text" ? `h${hex(4)}` : ["integer", "bigint", "numeric"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" ? "{}"
      : t.startsWith("timestamp") ? new Date() : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool().query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id);
}
export type Shop = { tenantId: string; unitId: string; userId: string; prodId: string; optId: string; tctx: { tenantId: string; actorUserId: string } };
export async function mkTenant(tag: string): Promise<string> {
  const id = rid(`t${tag}`);
  await insertRow("Tenant", { id, name: `hunt4 ${tag}`, slug: `trips-hunt4-${tag}-${STAMP}`, updatedAt: new Date() });
  tenantIds.push(id);
  return id;
}
export async function mkUnit(tenantId: string, tag: string, type = "TRIPS"): Promise<string> {
  const id = rid(`u${tag}`);
  await insertRow("BusinessUnit", { id, tenantId, type, name: `hunt4 unit ${tag}`, slug: `trips-hunt4-${tag}-${STAMP}`, settings: "{}", updatedAt: new Date() });
  return id;
}
export async function mkUser(tenantId: string, tag: string): Promise<string> {
  const id = rid(`usr${tag}`);
  await insertRow("User", { id, email: `trips-hunt4-${tag}-${STAMP}@shark.local`, name: `hunt4 ${tag}`, updatedAt: new Date() });
  await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
  return id;
}
export async function mkProd(tenantId: string, unitId: string, status = "ACTIVE"): Promise<{ id: string; opt: string }> {
  const id = rid("p");
  await insertRow("TripProduct", { id, tenantId, unitId, slug: id.toLowerCase(), productType: "TOUR", sourceKind: "OWN", status, title: JSON.stringify({ th: "ทดสอบล่า", en: "hunt" }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
  const o = rid("o");
  await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ตัวเลือก" }), durationMin: 240, nights: null, sortOrder: 1, active: true, updatedAt: new Date() });
  return { id, opt: o };
}
export async function mkShop(tag: string, userId?: string, tenantId?: string): Promise<Shop> {
  const t = tenantId ?? (await mkTenant(tag));
  const u = await mkUnit(t, tag);
  const usr = userId ?? (await mkUser(t, `o${tag}`));
  const p = await mkProd(t, u);
  return { tenantId: t, unitId: u, userId: usr, prodId: p.id, optId: p.opt, tctx: { tenantId: t, actorUserId: usr } };
}
export const DATE = "2027-03-10";
export const NOW0 = new Date("2027-03-01T00:00:00.000Z");
let seq = 0;
export type DepOpt = { date?: string; capacity?: number; sold?: number; held?: number; reserved?: number; status?: string; minPax?: number | null; prodId?: string; optId?: string; startsAt?: Date };
/** รอบ SQL ดิบ (แบบ mkDep ของข้อสอบ) · cutoffAt = 07:00 ของวัน (ช่องทางที่ปิดช้าสุด) */
export async function mkDep(sh: Shop, o: DepOpt = {}): Promise<string> {
  const date = o.date ?? DATE;
  const k = seq++;
  const startsAt = o.startsAt ?? new Date(addMin(BKK(date, "08:00"), k % 600).getTime() + Math.floor(k / 600) * 1000);
  const counterCut = BKK(date, "07:00");
  const id = rid("d");
  await insertRow("TripDeparture", { id, tenantId: sh.tenantId, unitId: sh.unitId, productId: o.prodId ?? sh.prodId, optionId: o.optId ?? sh.optId, scheduleId: null, localDate: date, startsAt, endsAt: addMin(startsAt, 240),
    status: o.status ?? "OPEN", capacity: o.capacity ?? 24, sold: o.sold ?? 0, held: o.held ?? 0, reserved: o.reserved ?? 0, minPax: o.minPax ?? null,
    cutoffAt: counterCut < startsAt ? counterCut : startsAt, stopSell: null, version: 0, updatedAt: new Date() });
  return id;
}
export async function setV(sh: Shop, changes: Rec[]) {
  const { S } = await mods();
  const r = asRec(await fnOf(S, "setSettings")({ role: "OWNER", unitAccess: ["*"], permissions: {}, userId: sh.userId }, { tenantId: sh.tenantId }, changes, {}));
  if (r.ok !== true) throw new Error(`setSettings ${fmt(r)}`);
}

// ── ctx ──
export const STAFF = (sh: Shop, now: Date = NOW0, ch = "COUNTER", unitId = sh.unitId, tenantId = sh.tenantId): Rec => ({ tenantId, unitId, channel: ch, actor: { kind: "STAFF", userId: sh.userId }, now });
export const PUB = (sh: Shop, now: Date = NOW0, ch = "WEB", unitId = sh.unitId, tenantId = sh.tenantId): Rec => ({ tenantId, unitId, channel: ch, actor: { kind: "PUBLIC", clientKey: `ck${hex()}` }, now });
export const SYS = (sh: Shop, now: Date = NOW0): Rec => ({ tenantId: sh.tenantId, unitId: sh.unitId, channel: "COUNTER", actor: { kind: "SYSTEM", job: "hunt" }, now });
export const ikey = () => `hk${hex(8)}`;
export const basket = () => `basket:${hex(12)}`;

// ── ค่าคงที่ (§4 ข้อ 2 + ของนักล่า) ──
export type DepInv = { id: string; capacity: number; sold: number; held: number; reserved: number; status: string; version: number; guaranteedAt: Date | null; act: number; stopSell: unknown };
export const INV_SQL = `SELECT d.id, d.capacity, d.sold, d.held, d.reserved, d.status, d.version, d."guaranteedAt", d."stopSell",
  (SELECT COALESCE(sum(h."qtyPublic" + h."qtyAllot"), 0)::int FROM "TripHold" h WHERE h."departureId" = d.id AND h.status = 'ACTIVE') AS act
  FROM "TripDeparture" d WHERE d.id = ANY($1::text[])`;
const lastVer = new Map<string, number>();
export function invViol(d: DepInv): string[] {
  const v: string[] = [];
  const tag = `${d.id.slice(-8)} c${d.capacity} s${d.sold} h${d.held} r${d.reserved} act${d.act} ${d.status} v${d.version}`;
  if (d.sold < 0 || d.held < 0 || d.reserved < 0) v.push(`NEG ${tag}`);
  if (d.sold + d.held + d.reserved > d.capacity) v.push(`OVER ${tag}`);
  if (d.held !== d.act) v.push(`HELD≠ΣACTIVE ${tag}`);
  if (d.status === "FULL" && d.sold + d.held < d.capacity) v.push(`FULL-WITH-FREE ${tag}`);
  if (d.guaranteedAt !== null && d.status === "OPEN") v.push(`GUARANTEED-REVERTED ${tag}`);
  const lv = lastVer.get(d.id);
  if (lv !== undefined && d.version < lv) v.push(`VERSION-BACK ${lv}->${d.version} ${tag}`);
  lastVer.set(d.id, Math.max(lv ?? 0, d.version));
  return v;
}
export async function invCheck(ids: string[]): Promise<{ rows: DepInv[]; viol: string[] }> {
  const rows = await q<DepInv>(INV_SQL, [ids]);
  return { rows, viol: rows.flatMap(invViol) };
}
/** ตัวสุ่มอ่านระหว่างยิง (คำสั่งเดียว = snapshot เดียว) */
export function sampler(ids: string[]) {
  let stop = false; const viol: string[] = []; let n = 0;
  const loop = (async () => {
    while (!stop) {
      try { const r = await invCheck(ids); for (const x of r.viol) if (viol.length < 50) viol.push(x); n++; } catch { await sleep(10); }
      await sleep(15);
    }
  })();
  return async () => { stop = true; await loop; return { n, viol }; };
}
export const holdRow = async (id: string) => (await q<Rec>(`SELECT id, status, purpose, "qtyPublic", "expiresAt", "capKeyHash", "departureId" FROM "TripHold" WHERE id = $1`, [id]))[0];

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
  try { await pool().query(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'trips:hold:trips-hunt4-%'`); } catch { /* */ }
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE 'trips-hunt4-%'`)).map((r) => r.id);
    if (us.length) {
      for (const t of ["Membership", "Session"]) { try { await pool().query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* */ } }
      await pool().query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
    }
  } catch (e) { console.log(`  ⚠️ ลบ user ${errMsg(e)}`); }
  const left = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE 'trips-hunt4-%'`);
  console.log(`[cleanup] Tenant trips-hunt4-* เหลือ ${left[0]?.n}`);
}
/** ปิดทุกอย่างให้ process จบ (prisma + pg) */
export async function shutdown() {
  try { const { D } = await mods(); const p = asRec(D.prisma); const d = p.$disconnect as (() => Promise<void>) | undefined; if (d) await d.call(p); } catch { /* */ }
  await endPool();
}
