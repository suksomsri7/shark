// probe-trips-t0.6-lib.mts — ตัวช่วยร่วมของ probe นักล่า T0.7 (untracked · hunter)
// ร้านชั่วคราว slug `trips-t07h-*` · อีเมล `trips-t07h-*` · ลบเฉพาะของตัวเองใน cleanup
// ค่าคงที่ที่ตรวจ: I1–I5 (อ่านจากฐาน) · มีตัวควบคุมบวก (ทำให้ข้อมูลร้านตัวเองเสียแล้วคืน)
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

export type Rec = Record<string, unknown>;
export type Fn = (...a: unknown[]) => Promise<unknown>;

export function boot(label: string) {
  loadTripsQcEnv(label);
  if (process.env.CI) { console.error("no CI"); process.exit(4); }
  pg.defaults.parseInputDatesAsUTC = true;
}
export const STAMP = randomBytes(3).toString("hex");
export const hex = (n = 6) => randomBytes(n).toString("hex");
export const rid = (p: string) => `t07h_${p}_${STAMP}${hex(4)}`;
export const tok = () => randomBytes(24).toString("base64url");
export const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
export const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 900); } catch { return String(v); } };
export const errMsg = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 400);
export const out = (tag: string, ...a: unknown[]) => console.log(`[${tag}]`, ...a.map((x) => (typeof x === "string" ? x : fmt(x))));
export const asRec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
export const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(asRec) : []);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
export const R = FX.PRODUCT_RACHA;
export const NOW0 = "2027-03-01T03:00:00.000Z";
export const SOLD_ST = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];

let _pool: pg.Pool | null = null;
export const pool = () => (_pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 }));
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

// ── ผลการเรียก + สถิติ ──
export type Stat = { n: number; codes: Record<string, number>; throws: string[]; maxMs: number; slow: number; leaks: string[] };
export const stats: Record<string, Stat> = {};
const RAW = /violates|constraint|duplicate key|deadlock|serializ|Prisma|invalid input syntax|out of range|SQLSTATE|23514|23505|40P01|40001|55P03|25P02|P20\d\d|Invalid `|RangeError|TypeError|timeout|Transaction/i;
export async function call(name: string, ...a: unknown[]): Promise<Rec> {
  const { T } = await mods();
  const t0 = Date.now();
  let r: Rec;
  try { r = asRec(await fnOf(T, name)(...a)); } catch (e) { r = { ok: "THROW", e: errMsg(e), pg: String(asRec(e).code ?? "") }; }
  const ms = Date.now() - t0;
  r.__ms = ms;
  const s = (stats[name] ??= { n: 0, codes: {}, throws: [], maxMs: 0, slow: 0, leaks: [] });
  s.n++;
  const code = r.ok === true ? "ok" : r.ok === "THROW" ? "THROW" : String(r.code);
  s.codes[code] = (s.codes[code] ?? 0) + 1;
  if (r.ok === "THROW" && s.throws.length < 8) s.throws.push(String(r.e));
  if (r.ok === false && typeof r.messageTh === "string" && RAW.test(r.messageTh) && s.leaks.length < 5) s.leaks.push(r.messageTh);
  if (r.ok === false && (typeof r.code !== "string" || !r.code) && s.leaks.length < 5) s.leaks.push(`unnamed ${fmt(r)}`);
  s.maxMs = Math.max(s.maxMs, ms);
  if (ms > 20_000) s.slow++;
  return r;
}
export const code = (r: Rec) => (r.ok === true ? "ok" : r.ok === "THROW" ? `THROW:${String(r.e).slice(0, 80)}` : `${String(r.code)}${asRec(r.details).reason ? `/${String(asRec(r.details).reason)}` : ""}`);

// ── แทรกแถวดิบ ──
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (t: string) => {
  if (!colCache.has(t)) colCache.set(t, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [t]));
  return colCache.get(t) ?? [];
};
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]); if (l.length) return l; }
  return [];
};
export async function insertRow(table: string, vals: Rec): Promise<string> {
  const v: Rec = { ...vals };
  const names = new Set((await cols(table)).map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of await cols(table)) {
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
  return String(v.id);
}

// ── ร้าน/สินค้า/รอบ ──
export const tenantIds: string[] = [];
export type Prod = { id: string; opt: string; opt2: string; unit: string; tenant: string; pt: Record<string, string>; cam: string };
export type Shop = { tenantId: string; unitId: string; unit2: string; userId: string; mem: Rec; P: Prod; P2: Prod };
export async function mkProd(tenantId: string, unitId: string, key: string): Promise<Prod> {
  const id = rid(`p${key}`), o = rid(`o${key}`), o2 = rid(`o2${key}`);
  await insertRow("TripProduct", { id, tenantId, unitId, slug: `t07h-${key}-${hex(4)}`.toLowerCase(), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ล่า ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
  await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
  await insertRow("TripOption", { id: o2, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ส่วนตัว" }), durationMin: 480, sortOrder: 2, active: true, updatedAt: new Date() });
  const pt: Record<string, string> = {};
  for (const [i, c] of ["ADULT", "CHILD", "INFANT"].entries()) pt[c] = await insertRow("TripPaxType", { id: rid(`pt${c}`), tenantId, unitId, productId: id, code: c, label: JSON.stringify({ th: c }), countsCapacity: c !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
  await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: R.parkAdultSatang, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
    name: JSON.stringify({ th: "ค่าอุทยาน" }), paxPrices: JSON.stringify({ ADULT: R.parkAdultSatang, CHILD: R.parkChildSatang }), active: true, updatedAt: new Date() });
  const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: R.extras.camera.satang, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
    name: JSON.stringify({ th: "กล้อง" }), active: true, updatedAt: new Date() });
  for (const [c, amount] of [["ADULT", R.adultSatang], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[c], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
  return { id, opt: o, opt2: o2, unit: unitId, tenant: tenantId, pt, cam };
}
export async function setV(sh: Shop, changes: Rec[]) {
  const { S } = await mods();
  const r = asRec(await fnOf(S, "setSettings")(sh.mem, { tenantId: sh.tenantId }, changes, { ackLegalWarn: true }));
  if (r.ok !== true) throw new Error(`setSettings ${fmt(r)}`);
}
export async function mkShop(tag: string): Promise<Shop> {
  const tenantId = rid(`t${tag}`);
  await insertRow("Tenant", { id: tenantId, name: `t07h ${tag}`, slug: `trips-t07h-${tag}-${STAMP}`, updatedAt: new Date() });
  tenantIds.push(tenantId);
  const unitId = rid(`u${tag}`), unit2 = rid(`u2${tag}`);
  for (const [u, s] of [[unitId, "a"], [unit2, "b"]]) await insertRow("BusinessUnit", { id: u, tenantId, type: "TRIPS", name: `t07h ${tag}${s}`, slug: `trips-t07h-${tag}${s}-${STAMP}`, settings: "{}", updatedAt: new Date() });
  const userId = rid(`usr${tag}`);
  await insertRow("User", { id: userId, email: `trips-t07h-${tag}-${STAMP}@shark.local`, name: `t07h ${tag}`, updatedAt: new Date() });
  await insertRow("Membership", { id: rid(`mb${tag}`), userId, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
  const P = await mkProd(tenantId, unitId, `${tag}1`);
  const P2 = await mkProd(tenantId, unitId, `${tag}2`);
  const sh: Shop = { tenantId, unitId, unit2, userId, mem: { role: "OWNER", unitAccess: ["*"], permissions: {}, userId }, P, P2 };
  const VAT = { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 };
  await setV(sh, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: unitId, value: VAT }, { key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: unit2, value: VAT }]);
  return sh;
}
let depSeq = 0;
export async function mkDep(sh: Shop, o: { date?: string; capacity?: number; P?: Prod; status?: string } = {}): Promise<string> {
  const P = o.P ?? sh.P; const date = o.date ?? "2027-03-20";
  const startsAt = new Date(BKK(date, "08:00").getTime() + (depSeq++ % 600) * 60_000); const id = rid("d");
  await insertRow("TripDeparture", { id, tenantId: P.tenant, unitId: P.unit, productId: P.id, optionId: P.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
    status: o.status ?? "OPEN", capacity: o.capacity ?? 24, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
  return id;
}

// ── ctx · บรรทัด · ผู้จอง ──
export const staff = (sh: Shop, o: { now?: string; unit?: string; tenant?: string; user?: string } = {}): Rec => ({ tenantId: o.tenant ?? sh.tenantId, unitId: o.unit ?? sh.unitId, channel: "COUNTER", actor: { kind: "STAFF", userId: o.user ?? sh.userId }, now: new Date(o.now ?? NOW0), locale: "th" });
export const pub = (sh: Shop, o: { now?: string; unit?: string; tenant?: string } = {}): Rec => ({ tenantId: o.tenant ?? sh.tenantId, unitId: o.unit ?? sh.unitId, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `t07h_${hex(4)}` }, now: new Date(o.now ?? NOW0), locale: "th" });
export const withNow = (c: Rec, now: string): Rec => ({ ...c, now: new Date(now) });
export function line(P: Prod, dep: string, o: { a?: number; c?: number; i?: number; promo?: string; opt?: string; camera?: boolean } = {}): Rec {
  const pax = [["ADULT", o.a ?? 1], ["CHILD", o.c ?? 0], ["INFANT", o.i ?? 0]].filter(([, n]) => Number(n) > 0).map(([c, n]) => ({ paxTypeId: P.pt[String(c)], qty: Number(n) }));
  return { productKind: "TRIP", unitId: P.unit, productId: P.id, slotId: dep, optionId: o.opt ?? P.opt, pax, extras: o.camera ? [{ extraId: P.cam, qty: 1 }] : [], ...(o.promo ? { promoCode: o.promo } : {}) };
}
let bkN = 0;
export const booker = (o: Rec = {}): Rec => { bkN++; return { name: `ลูกค้าล่า ${bkN}`, phone: `08${String(10_000_000 + ((bkN * 7_919 + Number.parseInt(hex(2), 16)) % 89_999_999)).slice(-8)}`, ...o }; };
export async function quote(ctx: Rec, lines: Rec[], opts: Rec = {}): Promise<Rec> {
  const r = await call("quoteTrips", ctx, { lines }, opts);
  if (r.ok !== true) throw new Error(`quote ${code(r)} ${fmt(r.details)}`);
  return asRec(r.value);
}
export type H = { r: Rec; v: Rec; quote: Rec; token?: string; lines: Rec[]; ctx: Rec; key: string };
export async function hold(ctx: Rec, lines: Rec[], o: { token?: string; key?: string; quote?: Rec } = {}): Promise<H> {
  let qt = o.quote;
  if (!qt) { const qr = await call("quoteTrips", ctx, { lines }, {}); if (qr.ok !== true) return { r: { ...qr, __stage: "quote" }, v: {}, quote: {}, lines, ctx, key: "" }; qt = asRec(qr.value); }
  const key = o.key ?? `h${hex(6)}`;
  const isPub = asRec(ctx.actor).kind === "PUBLIC";
  const token = o.token ?? (isPub ? tok() : undefined);
  const r = await call("holdTrips", ctx, { quote: { lines }, quoteId: qt.quoteId, quoteExpiresAt: qt.expiresAt, idempotencyKey: key, ...(token ? { basketToken: token } : {}) }, {});
  return { r, v: asRec(r.value), quote: qt, token, lines, ctx, key };
}
export function confirmBody(h: H, o: { key?: string; booker?: Rec; pay?: string; extra?: Rec; token?: string | null } = {}): Rec {
  const token = o.token === null ? undefined : (o.token ?? h.token);
  return { basketId: h.v.basketId, holdIds: h.v.holdIds, idempotencyKey: o.key ?? `c${hex(6)}`, quoteId: h.quote.quoteId, quote: { lines: h.lines },
    booker: o.booker ?? booker(), pay: { method: o.pay ?? (asRec(h.ctx.actor).kind === "STAFF" ? "PAY_LATER" : "PAY_NOW") }, ...(token ? { basketToken: token } : {}), ...(o.extra ?? {}) };
}
export const confirm = (h: H, o: { ctx?: Rec; key?: string; booker?: Rec; pay?: string; extra?: Rec; token?: string | null } = {}, opts: Rec = {}) => call("confirmTrips", o.ctx ?? h.ctx, confirmBody(h, o), opts);
export async function bookNow(ctx: Rec, lines: Rec[], o: { key?: string; booker?: Rec; pay?: string; quote?: Rec; extra?: Rec } = {}, opts: Rec = {}): Promise<{ q: Rec; r: Rec }> {
  let qt = o.quote;
  if (!qt) { const qr = await call("quoteTrips", ctx, { lines }, {}); if (qr.ok !== true) return { q: {}, r: { ...qr, __stage: "quote" } }; qt = asRec(qr.value); }
  const r = await call("bookTripsNow", ctx, { quote: { lines }, quoteId: qt.quoteId, quoteExpiresAt: qt.expiresAt, idempotencyKey: o.key ?? `n${hex(6)}`, booker: o.booker ?? booker(), pay: { method: o.pay ?? "PAY_LATER" }, ...(o.extra ?? {}) }, opts);
  return { q: qt, r };
}
export const refs = (r: Rec) => asArr(r.value);

// ── ค่าคงที่ ──
/** I1 + I2 ต่อรอบ */
export async function invDeps(deps: string[]): Promise<string[]> {
  const bad: string[] = [];
  if (!deps.length) return bad;
  const rows = await q<{ id: string; capacity: number; sold: number; held: number; reserved: number; s: number; h: number }>(`
    SELECT d.id, d.capacity, d.sold, d.held, d.reserved,
      (SELECT COALESCE(sum(i.qty),0)::int FROM "TripBookingItem" i JOIN "TripBooking" b ON b.id = i."bookingId" LEFT JOIN "TripPaxType" p ON p.id = i."paxTypeId"
        WHERE i."departureId" = d.id AND i.active AND i.kind = 'SEAT' AND COALESCE(p."countsCapacity", true) AND b.status = ANY($2::text[]) AND b."departureId" = d.id) AS s,
      (SELECT COALESCE(sum(h."qtyPublic" + h."qtyAllot"),0)::int FROM "TripHold" h WHERE h."departureId" = d.id AND h.status = 'ACTIVE') AS h
    FROM "TripDeparture" d WHERE d.id = ANY($1::text[])`, [deps, SOLD_ST]);
  for (const r of rows) {
    const tag = `${r.id.slice(-8)} c${r.capacity} s${r.sold}/${r.s} h${r.held}/${r.h} r${r.reserved}`;
    if (r.sold < 0 || r.held < 0 || r.reserved < 0 || r.sold + r.held + r.reserved > r.capacity) bad.push(`I1 ${tag}`);
    if (r.sold !== r.s) bad.push(`I2-sold ${tag}`);
    if (r.held !== r.h) bad.push(`I2-held ${tag}`);
  }
  return bad;
}
/** I3 I4 I5 + §13 ข้อ 2 ต่อร้าน */
export async function invTenant(tenantId: string): Promise<string[]> {
  const bad: string[] = [];
  // I3 เลขซ้ำ
  for (const r of await q<{ code: string; n: number }>(`SELECT code, count(*)::int n FROM "TripBooking" WHERE "tenantId" = $1 GROUP BY code HAVING count(*) > 1`, [tenantId])) bad.push(`I3-dup ${r.code}×${r.n}`);
  // I3 ช่องว่าง: ต่อ (prefix, period) จำนวนการจอง = seq ของตัวนับ และเลขครบ 1..n
  const byGrp = new Map<string, number[]>();
  for (const r of await q<{ code: string }>(`SELECT code FROM "TripBooking" WHERE "tenantId" = $1`, [tenantId])) {
    const m = /^([A-Z]{1,4})-(\d{4})-(\d+)$/.exec(r.code);
    if (!m) { bad.push(`I3-shape ${r.code}`); continue; }
    const k = `${m[1]}|${m[2]}`; (byGrp.get(k) ?? byGrp.set(k, []).get(k)!).push(Number(m[3]));
  }
  const ctr = new Map((await q<{ series: string; period: string; seq: number }>(`SELECT series, period, seq FROM "SellCounter" WHERE "tenantId" = $1`, [tenantId])).map((r) => [`${r.series}|${r.period}`, r.seq]));
  for (const [k, ns] of byGrp) {
    ns.sort((a, b) => a - b);
    const seq = ctr.get(k) ?? -1;
    if (ns.length !== seq || ns.some((n, i) => n !== i + 1)) bad.push(`I3-gap ${k} n=${ns.length} seq=${seq} first=${ns.slice(0, 3)} last=${ns.slice(-2)}`);
  }
  for (const [k, seq] of ctr) if (!byGrp.has(k) && seq > 0 && !k.startsWith("HX")) bad.push(`I3-gap ${k} counter ${seq} but 0 bookings`);
  // I4
  for (const r of await q<{ id: string; used: number; act: number }>(`SELECT r.id, r."usedCount" used, (SELECT count(*)::int FROM "TripPromoRedemption" x WHERE x."ruleId" = r.id AND x.status = 'ACTIVE') act FROM "TripPriceRule" r WHERE r."tenantId" = $1 AND r.kind = 'PROMO_CODE'`, [tenantId]))
    if (r.used !== r.act) bad.push(`I4-used ${r.id.slice(-8)} used ${r.used} active ${r.act}`);
  for (const r of await q<{ bookingId: string; n: number }>(`SELECT "bookingId", count(*)::int n FROM "TripPromoRedemption" WHERE "tenantId" = $1 AND status = 'ACTIVE' GROUP BY "bookingId" HAVING count(*) > 1`, [tenantId])) bad.push(`I4-multi ${r.bookingId}`);
  for (const r of await q<{ id: string; st: string | null }>(`SELECT x.id, b.status st FROM "TripPromoRedemption" x LEFT JOIN "TripBooking" b ON b.id = x."bookingId" WHERE x."tenantId" = $1 AND x.status = 'ACTIVE' AND (b.id IS NULL OR b.status IN ('CANCELLED','EXPIRED'))`, [tenantId]))
    bad.push(`I4-orphan ${r.id.slice(-8)} booking=${r.st ?? "MISSING"}`);
  // I5
  for (const r of await q<{ id: string }>(`SELECT b.id FROM "TripBooking" b WHERE b."tenantId" = $1 AND NOT EXISTS (SELECT 1 FROM "TripBookingItem" i WHERE i."bookingId" = b.id AND i.active AND i.kind = 'SEAT')`, [tenantId])) bad.push(`I5-noseat ${r.id}`);
  for (const r of await q<{ id: string; st: string | null }>(`SELECT h.id, b.status st FROM "TripHold" h LEFT JOIN "TripBooking" b ON b.id = h."bookingId" WHERE h."tenantId" = $1 AND h.status = 'CONVERTED' AND (b.id IS NULL OR NOT (b.status = ANY($2::text[]) OR b.status = 'CANCELLED'))`, [tenantId, SOLD_ST]))
    bad.push(`I5-conv-nobooking ${r.id.slice(-8)} ${r.st ?? "MISSING"}`);
  for (const r of await q<{ id: string }>(`SELECT s.id FROM "SellBasket" s WHERE s."tenantId" = $1 AND s.status = 'CHECKED_OUT' AND NOT EXISTS (SELECT 1 FROM "TripBooking" b WHERE b."basketId" = s.id)`, [tenantId])) bad.push(`I5-basket-nobooking ${r.id}`);
  for (const r of await q<{ id: string }>(`SELECT b.id FROM "TripBooking" b JOIN "SellBasket" s ON s.id = b."basketId" WHERE b."tenantId" = $1 AND s.status <> 'CHECKED_OUT'`, [tenantId])) bad.push(`I5-booking-basket-open ${r.id}`);
  for (const r of await q<{ id: string; status: string }>(`SELECT b.id, b.status FROM "TripBooking" b WHERE b."tenantId" = $1 AND b.status IN ('HOLD','PENDING') AND NOT EXISTS (SELECT 1 FROM "TripHold" h WHERE h."bookingId" = b.id AND h.status = 'ACTIVE')`, [tenantId])) bad.push(`I5-unpaid-nohold ${r.id} ${r.status}`);
  for (const r of await q<{ id: string; status: string }>(`SELECT b.id, b.status FROM "TripBooking" b WHERE b."tenantId" = $1 AND b.status = ANY($2::text[]) AND EXISTS (SELECT 1 FROM "TripHold" h WHERE h."bookingId" = b.id AND h.status = 'ACTIVE')`, [tenantId, SOLD_ST])) bad.push(`I5-sold-with-activehold ${r.id} ${r.status}`);
  // §13 ข้อ 2
  for (const r of await q<{ id: string; s: number; want: number }>(`SELECT b.id, (SELECT COALESCE(sum(i."amountSatang"),0)::int FROM "TripBookingItem" i WHERE i."bookingId" = b.id AND i.active) s, (b."grossSatang" - b."discountSatang" - b."agentDiscountSatang") want FROM "TripBooking" b WHERE b."tenantId" = $1`, [tenantId]))
    if (r.s !== r.want) bad.push(`M2 ${r.id} items ${r.s} want ${r.want}`);
  return bad;
}
export async function allInv(sh: Shop, deps: string[]): Promise<string[]> { return [...(await invDeps(deps)), ...(await invTenant(sh.tenantId))]; }

/** ตัวควบคุมบวก: ทำให้ข้อมูลร้านตัวเองเสียทีละแบบ → ตัวตรวจต้องจับได้ → คืนค่า */
export async function positiveControls(sh: Shop, dep: string, bookingId: string | null, ruleId: string | null): Promise<Rec> {
  const res: Rec = {};
  const fires = async (name: string, mut: string, undo: string, params: unknown[], pat: RegExp) => {
    try { await q(mut, params); } catch (e) { res[name] = `DB-PREVENTS (${errMsg(e).slice(0, 90)})`; return; }
    const b = await allInv(sh, [dep]);
    res[name] = b.some((x) => pat.test(x)) ? "FIRES" : `MISSED (${b.join(" | ").slice(0, 200)})`;
    await q(undo, params);
  };
  await fires("I1-over", `UPDATE "TripDeparture" SET reserved = capacity + 1 WHERE id = $1`, `UPDATE "TripDeparture" SET reserved = 0 WHERE id = $1`, [dep], /^I1 /);
  await fires("I2-sold", `UPDATE "TripDeparture" SET sold = sold + 1 WHERE id = $1`, `UPDATE "TripDeparture" SET sold = sold - 1 WHERE id = $1`, [dep], /^I2-sold/);
  await fires("I2-held", `UPDATE "TripDeparture" SET held = held + 1 WHERE id = $1`, `UPDATE "TripDeparture" SET held = held - 1 WHERE id = $1`, [dep], /^I2-held/);
  await fires("I3-gap", `UPDATE "SellCounter" SET seq = seq + 1 WHERE "tenantId" = $1`, `UPDATE "SellCounter" SET seq = seq - 1 WHERE "tenantId" = $1`, [sh.tenantId], /^I3-gap/);
  if (bookingId) {
    const orig = (await q<{ code: string }>(`SELECT code FROM "TripBooking" WHERE id = $1`, [bookingId]))[0]?.code ?? "";
    const other = (await q<{ code: string }>(`SELECT code FROM "TripBooking" WHERE "tenantId" = $1 AND id <> $2 LIMIT 1`, [sh.tenantId, bookingId]))[0]?.code;
    if (other) {
      try { await q(`UPDATE "TripBooking" SET code = $2 WHERE id = $1`, [bookingId, other]); const b = await invTenant(sh.tenantId); res["I3-dup"] = b.some((x) => x.startsWith("I3-dup")) ? "FIRES" : "MISSED"; await q(`UPDATE "TripBooking" SET code = $2 WHERE id = $1`, [bookingId, orig]); }
      catch (e) { res["I3-dup"] = `DB-UNIQUE-PREVENTS (${errMsg(e).slice(0, 80)})`; }
    }
    await fires("I5-unpaid-nohold/I5-noseat", `UPDATE "TripBookingItem" SET active = false WHERE "bookingId" = $1 AND kind = 'SEAT'`, `UPDATE "TripBookingItem" SET active = true WHERE "bookingId" = $1 AND kind = 'SEAT'`, [bookingId], /I5-noseat/);
  }
  if (ruleId) await fires("I4-used", `UPDATE "TripPriceRule" SET "usedCount" = "usedCount" + 1 WHERE id = $1`, `UPDATE "TripPriceRule" SET "usedCount" = "usedCount" - 1 WHERE id = $1`, [ruleId], /^I4-used/);
  const sb = rid("sb");
  await q(`INSERT INTO "SellBasket" (id, "tenantId", channel, status, "expiresAt", "idempotencyKey", "unitIds", "createdAt", "updatedAt") VALUES ($1, $2, 'COUNTER', 'CHECKED_OUT', now(), $3, ARRAY[$4]::text[], now(), now())`, [sb, sh.tenantId, `pc_${hex(6)}`, sh.unitId]);
  res["I5-basket"] = (await invTenant(sh.tenantId)).some((x) => x.startsWith("I5-basket-nobooking")) ? "FIRES" : "MISSED";
  await q(`DELETE FROM "SellBasket" WHERE id = $1`, [sb]);
  const after = await allInv(sh, [dep]);
  res.restored = after.length === 0 ? "clean" : after;
  return res;
}

// ── สถิติฐาน ──
export async function dbStats(): Promise<{ deadlocks: number; conns: number; idleTx: number }> {
  const d = (await q<{ d: string }>(`SELECT deadlocks::text d FROM pg_stat_database WHERE datname = current_database()`))[0];
  const c = (await q<{ n: number; tx: number }>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE state LIKE 'idle in transaction%')::int AS tx FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend'`))[0];
  return { deadlocks: Number(d?.d ?? 0), conns: c?.n ?? 0, idleTx: c?.tx ?? 0 };
}
export function connSampler() {
  let stop = false; let maxC = 0; let maxTx = 0; let n = 0;
  const loop = (async () => { while (!stop) { try { const s = await dbStats(); maxC = Math.max(maxC, s.conns); maxTx = Math.max(maxTx, s.idleTx); n++; } catch { /* */ } await sleep(50); } })();
  return async () => { stop = true; await loop; return { samples: n, maxConns: maxC, maxIdleInTx: maxTx }; };
}

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
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE 'trips-t07h-%'`)).map((r) => r.id);
    if (us.length) {
      for (const t of ["Membership", "Session"]) { try { await pool().query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* */ } }
      await pool().query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
    }
  } catch (e) { console.log(`  ⚠️ ลบ user ${errMsg(e)}`); }
  const left = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE 'trips-t07h-%'`);
  console.log(`[cleanup] Tenant trips-t07h-* เหลือ ${left[0]?.n}`);
}
export async function sweepStale() {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE 'trips-t07h-%'`)).map((r) => r.id);
  if (stale.length) { tenantIds.push(...stale); await cleanup(); tenantIds.length = 0; }
}
export async function shutdown() {
  try { const { D } = await mods(); const p = asRec(D.prisma); const d = p.$disconnect as (() => Promise<void>) | undefined; if (d) await d.call(p); } catch { /* */ }
  await endPool();
}
export const findings: Rec[] = [];
export const finding = (id: string, sev: string, what: string, detail: unknown) => { findings.push({ id, sev, what, detail }); out(`FINDING ${sev}`, `${id} ${what}`, detail); };

// ═══════════════ T0.7 เงิน: ตัวตรวจ M1–M7 (อ่านจากฐาน) ═══════════════
export const OPEN_REQ = ["REQUESTED", "QUOTED", "APPROVED", "EXECUTING", "FAILED"];
const grp = (t: string) => (t === "CASH" ? "CASH" : t === "PROMPTPAY" || t === "TRANSFER" ? "BANK" : t === "CARD" ? "CARD" : `?${t}`);
let _mc: Rec | null = null;
async function mcore(): Promise<Rec> { if (!_mc) _mc = (await import("@/lib/modules/trips/money-core")) as unknown as Rec; return _mc; }
export async function invMoney(tenantId: string): Promise<string[]> {
  const MC = await mcore();
  const vctx = MC.receiptVatCtxOf as (s: unknown) => Rec | null;
  const rvat = MC.receiptVatSatang as (v: number, c: unknown) => number;
  const bad: string[] = [];
  const bks = await q<{ id: string; status: string; paidSatang: number; refundedSatang: number; vatSatang: number; snap: Rec; version: number }>(`SELECT id, status, "paidSatang", "refundedSatang", "vatSatang", "policySnapshot" snap, version FROM "TripBooking" WHERE "tenantId" = $1`, [tenantId]);
  const evs = await q<{ id: string; bookingId: string; kind: string; amountSatang: number; vatSatang: number; passThroughSatang: number; dueId: string | null; tender: string; idempotencyKey: string; postingStatus: string }>(`SELECT id, "bookingId", kind, "amountSatang", "vatSatang", "passThroughSatang", "dueId", tender, "idempotencyKey", "postingStatus" FROM "TripMoneyEvent" WHERE "tenantId" = $1`, [tenantId]);
  const dues = await q<{ id: string; bookingId: string; seq: number; status: string; amountSatang: number; vatableSatang: number; passThroughSatang: number; paidSatang: number }>(`SELECT id, "bookingId", seq, status, "amountSatang", "vatableSatang", "passThroughSatang", "paidSatang" FROM "TripPaymentDue" WHERE "tenantId" = $1`, [tenantId]);
  const reqs = await q<{ id: string; bookingId: string; status: string; amountSatang: number; manualDeltaSatang: number; computed: Rec }>(`SELECT id, "bookingId", status, "amountSatang", "manualDeltaSatang", computed FROM "TripRefundRequest" WHERE "tenantId" = $1`, [tenantId]);
  const ob = await q<{ type: string; idempotencyKey: string; payload: Rec }>(`SELECT type, "idempotencyKey", payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type LIKE 'trips.%'`, [tenantId]);
  const obCount = new Map<string, number>();
  for (const o of ob) obCount.set(o.idempotencyKey, (obCount.get(o.idempotencyKey) ?? 0) + 1);
  for (const [k, n] of obCount) if (n > 1) bad.push(`M5-outbox-dup ${k} ×${n}`);
  const evBy = new Map<string, typeof evs>(); for (const e of evs) (evBy.get(e.bookingId) ?? evBy.set(e.bookingId, []).get(e.bookingId)!).push(e);
  const dueBy = new Map<string, typeof dues>(); for (const d of dues) (dueBy.get(d.bookingId) ?? dueBy.set(d.bookingId, []).get(d.bookingId)!).push(d);
  const reqBy = new Map<string, typeof reqs>(); for (const r of reqs) (reqBy.get(r.bookingId) ?? reqBy.set(r.bookingId, []).get(r.bookingId)!).push(r);
  const I4 = 2_147_483_647;
  for (const e of evs) {
    if (e.postingStatus !== "UNPOSTED") bad.push(`M5-posting ${e.id} ${e.postingStatus}`);
    for (const k of ["amountSatang", "vatSatang", "passThroughSatang"] as const) if (!(e[k] >= 0 && e[k] <= I4)) bad.push(`M1-range ${e.id} ${k}=${e[k]}`);
    if (e.passThroughSatang > e.amountSatang) bad.push(`M4-pt>amt ${e.id}`);
    if (e.kind === "RECEIVED" && (obCount.get(`trips.payment.received:${e.id}`) ?? 0) !== 1) bad.push(`M5-received-evt ${e.id} n=${obCount.get(`trips.payment.received:${e.id}`) ?? 0}`);
  }
  for (const b of bks) {
    const E = evBy.get(b.id) ?? []; const D = dueBy.get(b.id) ?? []; const Q = reqBy.get(b.id) ?? [];
    const payable = Number(asRec(b.snap.totals).payableSatang); const snapPt = Number(asRec(b.snap.totals).passThroughSatang);
    const rcv = E.filter((e) => e.kind === "RECEIVED"); const ref = E.filter((e) => e.kind === "REFUNDED"); const ret = E.filter((e) => e.kind === "RETAINED");
    const sR = rcv.reduce((s, e) => s + e.amountSatang, 0); const sF = ref.reduce((s, e) => s + e.amountSatang, 0); const sT = ret.reduce((s, e) => s + e.amountSatang, 0);
    const tag = `${b.id.slice(-10)} ${b.status}`;
    // M1
    if (sR !== b.paidSatang) bad.push(`M1-paid ${tag} ΣRCV ${sR} paid ${b.paidSatang}`);
    if (sF !== b.refundedSatang) bad.push(`M1-refunded ${tag} ΣREF ${sF} refunded ${b.refundedSatang}`);
    if (b.refundedSatang > b.paidSatang || b.paidSatang > payable || b.paidSatang < 0) bad.push(`M1-bounds ${tag} paid ${b.paidSatang} ref ${b.refundedSatang} payable ${payable}`);
    // M2 ต่อใบรับ
    const rcvIds = new Map(rcv.map((e) => [e.id, e]));
    const backed = new Map<string, { ref: number; refPt: number; refVat: number; ret: number; retPt: number; retVat: number }>();
    for (const e of [...ref, ...ret]) {
      const m = /^trips-(ref|ret):([^:]+):(.+)$/.exec(e.idempotencyKey);
      if (!m) { bad.push(`M2-key ${e.id} ${e.idempotencyKey}`); continue; }
      const src = rcvIds.get(m[3]);
      if (!src) { bad.push(`M2-nosrc ${e.id}`); continue; }
      if (grp(src.tender) !== grp(e.tender)) bad.push(`M2-xgroup ${e.id} ${src.tender}->${e.tender}`);
      if (src.dueId !== e.dueId) bad.push(`M2-due ${e.id}`);
      const x = backed.get(src.id) ?? { ref: 0, refPt: 0, refVat: 0, ret: 0, retPt: 0, retVat: 0 };
      if (m[1] === "ref") { x.ref += e.amountSatang; x.refPt += e.passThroughSatang; x.refVat += e.vatSatang; } else { x.ret += e.amountSatang; x.retPt += e.passThroughSatang; x.retVat += e.vatSatang; }
      backed.set(src.id, x);
    }
    for (const [id, x] of backed) {
      const s = rcvIds.get(id)!;
      if (x.ref > s.amountSatang || x.refPt > s.passThroughSatang || x.refVat > s.vatSatang) bad.push(`M2-over ${id} ref ${x.ref}/${s.amountSatang}`);
      if (x.ref + x.ret !== s.amountSatang || x.refPt + x.retPt !== s.passThroughSatang || x.refVat + x.retVat !== s.vatSatang) bad.push(`M2-sum ${id} ref+ret ${x.ref}+${x.ret}≠${s.amountSatang} pt ${x.refPt}+${x.retPt}≠${s.passThroughSatang} vat ${x.refVat}+${x.retVat}≠${s.vatSatang}`);
    }
    const byG = new Map<string, number>();
    for (const e of rcv) byG.set(grp(e.tender), (byG.get(grp(e.tender)) ?? 0) + e.amountSatang);
    for (const e of ref) byG.set(grp(e.tender), (byG.get(grp(e.tender)) ?? 0) - e.amountSatang);
    for (const [g, n] of byG) if (n < 0) bad.push(`M2-group ${tag} ${g} ${n}`);
    // M3
    const cur = D.filter((d) => d.status !== "CANCELLED");
    if (["CONFIRMED", "PART_PAID", "PAID"].includes(b.status)) {
      if (!cur.length) bad.push(`M3-nodues ${tag}`);
      else if (cur.reduce((s, d) => s + d.amountSatang, 0) !== payable) bad.push(`M3-sum ${tag} Σdue ${cur.reduce((s, d) => s + d.amountSatang, 0)} payable ${payable}`);
      if (cur.reduce((s, d) => s + d.passThroughSatang, 0) !== snapPt) bad.push(`M3-pt ${tag}`);
    }
    if (D.reduce((s, d) => s + d.paidSatang, 0) !== b.paidSatang) bad.push(`M3-duepaid ${tag} Σdue.paid ${D.reduce((s, d) => s + d.paidSatang, 0)} paid ${b.paidSatang}`);
    const seqs = new Set<number>();
    for (const d of D) {
      if (seqs.has(d.seq)) bad.push(`M3-seqdup ${d.id}`); seqs.add(d.seq);
      const rs = rcv.filter((e) => e.dueId === d.id);
      const sa = rs.reduce((s, e) => s + e.amountSatang, 0); const sp = rs.reduce((s, e) => s + e.passThroughSatang, 0);
      if (sa !== d.paidSatang) bad.push(`M3-due-rcv ${d.id} Σrcv ${sa} due.paid ${d.paidSatang}`);
      if (d.paidSatang < 0 || d.paidSatang > d.amountSatang) bad.push(`M3-due-bounds ${d.id}`);
      if (d.amountSatang !== d.vatableSatang + d.passThroughSatang) bad.push(`M4-due-split ${d.id}`);
      if (sp > d.passThroughSatang) bad.push(`M4-due-pt-over ${d.id} ${sp}>${d.passThroughSatang}`);
      if (d.paidSatang === d.amountSatang && sp !== d.passThroughSatang) bad.push(`M4-due-pt-full ${d.id} ${sp}≠${d.passThroughSatang}`);
      const want = d.status === "CANCELLED" || d.status === "WAIVED" ? null : d.paidSatang === d.amountSatang ? ["PAID"] : d.paidSatang === 0 ? ["OPEN", "OVERDUE"] : ["PARTLY_PAID", "OVERDUE"];
      if (want && !want.includes(d.status)) bad.push(`M3-due-status ${d.id} ${d.status} paid ${d.paidSatang}/${d.amountSatang}`);
    }
    // M4 VAT ต่อใบรับ
    const vc = vctx(b.snap);
    for (const e of rcv) {
      if (!vc) { bad.push(`M4-vctx ${tag}`); break; }
      const want = rvat(e.amountSatang - e.passThroughSatang, vc);
      if (want !== e.vatSatang) bad.push(`M4-vat ${e.id} vat ${e.vatSatang} want ${want}`);
    }
    if (rcv.reduce((s, e) => s + e.passThroughSatang, 0) > snapPt) bad.push(`M4-pt-total ${tag}`);
    // M5
    const live = ["HOLD", "CONFIRMED", "PART_PAID", "PAID"].includes(b.status);
    if (live) {
      const want = b.paidSatang === 0 ? ["HOLD", "CONFIRMED"] : b.paidSatang < payable ? ["PART_PAID"] : ["PAID"];
      if (!want.includes(b.status)) bad.push(`M5-status ${tag} paid ${b.paidSatang}/${payable}`);
    }
    if (b.status === "PART_PAID" && !obCount.has(`trips.booking.part_paid:${b.id}`)) bad.push(`M5-nopartpaid-evt ${tag}`);
    if (b.status === "PAID" && !obCount.has(`trips.booking.paid:${b.id}`)) bad.push(`M5-nopaid-evt ${tag}`);
    if (b.paidSatang > 0 && b.status === "PART_PAID" && obCount.has(`trips.booking.paid:${b.id}`)) bad.push(`M5-paid-evt-but-partpaid ${tag}`);
    // M7
    const open = Q.filter((r) => OPEN_REQ.includes(r.status));
    if (open.length > 1) bad.push(`M7-open>1 ${tag} ${open.length}`);
    for (const r of Q) {
      const c = asRec(r.computed);
      if (r.amountSatang !== Number(c.refundSatang) + r.manualDeltaSatang) bad.push(`M7-amount ${r.id} ${r.amountSatang} ≠ ${c.refundSatang}+${r.manualDeltaSatang}`);
      if (r.status === "DONE") {
        const rr = ref.filter((e) => e.idempotencyKey.startsWith(`trips-ref:${r.id}:`)).reduce((s, e) => s + e.amountSatang, 0);
        const rt = ret.filter((e) => e.idempotencyKey.startsWith(`trips-ret:${r.id}:`)).reduce((s, e) => s + e.amountSatang, 0);
        if (rr !== r.amountSatang) bad.push(`M7-done-ref ${r.id} ΣREF ${rr} ≠ ${r.amountSatang}`);
        if (rr + rt !== b.paidSatang) bad.push(`M7-done-sum ${r.id} ${rr}+${rt}≠${b.paidSatang}`);
        if (b.status !== "CANCELLED") bad.push(`M7-done-notcancelled ${tag}`);
        if ((obCount.get(`trips.refund.done:${r.id}`) ?? 0) !== 1) bad.push(`M5-refund-done-evt ${r.id}`);
      }
      if (["QUOTED", "APPROVED"].includes(r.status) && (obCount.get(`trips.refund.requested:${r.id}`) ?? 0) !== 1) bad.push(`M5-refund-req-evt ${r.id}`);
    }
    if (b.status === "CANCELLED" && E.length && sF + sT !== b.paidSatang) bad.push(`M2-cancel-sum ${tag} ${sF}+${sT}≠${b.paidSatang}`);
  }
  return bad;
}
export async function allMoneyInv(sh: Shop): Promise<string[]> {
  const deps = (await q<{ id: string }>(`SELECT id FROM "TripDeparture" WHERE "tenantId" = $1`, [sh.tenantId])).map((r) => r.id);
  return [...(await invDeps(deps)), ...(await invTenant(sh.tenantId)), ...(await invMoney(sh.tenantId))];
}
/** ตัวควบคุมบวกของ M1–M7 บนแถวของร้านตัวเอง (ทำเสีย → ต้องจับ → คืน) */
export async function moneyControls(sh: Shop): Promise<Rec> {
  const res: Rec = {};
  const base = await allMoneyInv(sh);
  const fires = async (name: string, mut: string, undo: string, params: unknown[], pat: RegExp) => {
    try { await q(mut, params); } catch (e) { res[name] = `DB-PREVENTS (${errMsg(e).slice(0, 90)})`; return; }
    const b = await allMoneyInv(sh);
    res[name] = b.some((x) => pat.test(x) && !base.includes(x)) ? "FIRES" : `MISSED`;
    await q(undo, params);
  };
  const rcv = (await q<{ id: string; bookingId: string; dueId: string }>(`SELECT id, "bookingId", "dueId" FROM "TripMoneyEvent" WHERE "tenantId" = $1 AND kind = 'RECEIVED' LIMIT 1`, [sh.tenantId]))[0];
  const refd = (await q<{ id: string }>(`SELECT id FROM "TripMoneyEvent" WHERE "tenantId" = $1 AND kind = 'REFUNDED' LIMIT 1`, [sh.tenantId]))[0];
  const rq = (await q<{ id: string; bookingId: string }>(`SELECT id, "bookingId" FROM "TripRefundRequest" WHERE "tenantId" = $1 AND status = 'DONE' LIMIT 1`, [sh.tenantId]))[0];
  if (rcv) {
    await fires("M1-paid", `UPDATE "TripBooking" SET "paidSatang" = "paidSatang" + 1 WHERE id = $1`, `UPDATE "TripBooking" SET "paidSatang" = "paidSatang" - 1 WHERE id = $1`, [rcv.bookingId], /^M1-paid|^M3-duepaid/);
    await fires("M3-duepaid", `UPDATE "TripPaymentDue" SET "paidSatang" = "paidSatang" - 1 WHERE id = $1`, `UPDATE "TripPaymentDue" SET "paidSatang" = "paidSatang" + 1 WHERE id = $1`, [rcv.dueId], /^M3-due/);
    await fires("M4-vat", `UPDATE "TripMoneyEvent" SET "vatSatang" = "vatSatang" + 1 WHERE id = $1`, `UPDATE "TripMoneyEvent" SET "vatSatang" = "vatSatang" - 1 WHERE id = $1`, [rcv.id], /^M4-vat|^M2-sum/);
    await fires("M3-status", `UPDATE "TripPaymentDue" SET status = CASE WHEN status = 'PAID' THEN 'PARTLY_PAID' ELSE 'PAID' END WHERE id = $1`, `UPDATE "TripPaymentDue" SET status = CASE WHEN "paidSatang" = "amountSatang" THEN 'PAID' WHEN "paidSatang" = 0 THEN 'OPEN' ELSE 'PARTLY_PAID' END WHERE id = $1`, [rcv.dueId], /^M3-due-status/);
    await fires("M5-posting", `UPDATE "TripMoneyEvent" SET "postingStatus" = 'POSTED' WHERE id = $1`, `UPDATE "TripMoneyEvent" SET "postingStatus" = 'UNPOSTED' WHERE id = $1`, [rcv.id], /^M5-posting/);
    await fires("M5-received-evt", `UPDATE "OutboxEvent" SET "idempotencyKey" = "idempotencyKey" || ':x' WHERE "idempotencyKey" = 'trips.payment.received:' || $1`, `UPDATE "OutboxEvent" SET "idempotencyKey" = 'trips.payment.received:' || $1 WHERE "idempotencyKey" = 'trips.payment.received:' || $1 || ':x'`, [rcv.id], /^M5-received-evt/);
  } else res.rcv = "no RECEIVED row";
  if (refd) await fires("M2-over", `UPDATE "TripMoneyEvent" SET "amountSatang" = "amountSatang" + 1, "passThroughSatang" = "passThroughSatang" WHERE id = $1`, `UPDATE "TripMoneyEvent" SET "amountSatang" = "amountSatang" - 1 WHERE id = $1`, [refd.id], /^M2-|^M1-refunded|^M7-/);
  else res.refd = "no REFUNDED row";
  if (rq) {
    const cp = (sfx: string) => `INSERT INTO "TripRefundRequest" SELECT (r).* FROM (SELECT jsonb_populate_record(NULL::"TripRefundRequest", to_jsonb(t) || jsonb_build_object('id', t.id || '${sfx}', 'idempotencyKey', t."idempotencyKey" || '${sfx}', 'status', 'QUOTED')) r FROM "TripRefundRequest" t WHERE t.id = $1) z`;
    // ใบเดียวไม่พอ (เปิด 1) — เพิ่มใบที่สองแล้วตรวจ
    try { await q(cp("_pc1"), [rq.id]); await q(cp("_pc2"), [rq.id]); const b = await allMoneyInv(sh); res["M7-open>1"] = b.some((x) => /^M7-open/.test(x)) ? "FIRES" : "MISSED"; }
    catch (e) { res["M7-open>1"] = `ERR ${errMsg(e).slice(0, 120)}`; }
    finally { await q(`DELETE FROM "TripRefundRequest" WHERE id IN ($1 || '_pc1', $1 || '_pc2')`, [rq.id]); }
  }
  else res.rq = "no DONE request";
  const after = await allMoneyInv(sh);
  res.restored = after.length === base.length ? "same-as-before" : after;
  return res;
}

// ═══════════════ T0.7 ตัวช่วยเรียกบริการเงิน ═══════════════
export const addMin = (iso: string, m: number) => new Date(new Date(iso).getTime() + m * 60_000).toISOString();
export const unitSet = (unit: string, key: string, value: unknown): Rec => ({ key, scope: "UNIT", scopeId: unit, value });
export type Bk = { id: string; code: string; dep: string; token: string; payable: number; pt: number; snap: Rec; status: string; version: number; sh: Shop };
export async function bkRow(id: string): Promise<Rec> { return (await q(`SELECT * FROM "TripBooking" WHERE id = $1`, [id]))[0] ?? {}; }
/** จองด้วย STAFF bookTripsNow — PAY_LATER ⇒ CONFIRMED · PAY_NOW ⇒ HOLD */
export async function mkBk(sh: Shop, o: { dep?: string; date?: string; pay?: "PAY_LATER" | "PAY_NOW"; a?: number; c?: number; camera?: boolean; promo?: string; now?: string; P?: Prod; capacity?: number } = {}): Promise<Bk> {
  const P = o.P ?? sh.P;
  const dep = o.dep ?? (await mkDep(sh, { date: o.date, P, capacity: o.capacity ?? 40 }));
  const ctx = staff(sh, { now: o.now ?? NOW0 });
  const ln = line(P, dep, { a: o.a ?? 2, c: o.c ?? 0, camera: o.camera ?? true, promo: o.promo });
  const { r } = await bookNow(ctx, [ln], { pay: o.pay ?? "PAY_LATER" });
  if (r.ok !== true) throw new Error(`bookTripsNow ${code(r)} ${fmt(r.details)}`);
  const ref = asArr(r.value)[0] ?? {};
  const row = await bkRow(String(ref.bookingId));
  const snap = asRec(row.policySnapshot);
  return { id: String(ref.bookingId), code: String(ref.code), dep, token: String(ref.publicToken ?? ""), payable: Number(asRec(snap.totals).payableSatang), pt: Number(asRec(snap.totals).passThroughSatang), snap, status: String(row.status), version: Number(row.version), sh };
}
export const PAY_NOW = addMin(NOW0, 1);
export const pay = (b: Bk, amount: unknown, o: { tender?: string; key?: string; now?: string; ctx?: Rec; slipId?: string; extra?: Rec } = {}) =>
  call("recordTripPayment", o.ctx ?? staff(b.sh, { now: o.now ?? PAY_NOW }), { bookingId: b.id, amountSatang: amount, tender: o.tender ?? "CASH", idempotencyKey: o.key ?? `p${hex(6)}`, ...(o.slipId ? { slipId: o.slipId } : {}), ...(o.extra ?? {}) });
export const reqRefund = async (b: Bk, o: { now?: string; reasonKind?: string; key?: string; ctx?: Rec; deductions?: Rec[]; ver?: number; reason?: string } = {}) => {
  const ver = o.ver ?? Number((await bkRow(b.id)).version);
  return call("requestTripRefund", o.ctx ?? staff(b.sh, { now: o.now ?? addMin(NOW0, 10) }), { bookingId: b.id, expectedVersion: ver, reasonKind: o.reasonKind ?? "CUSTOMER", choice: "MONEY", reason: o.reason ?? "ลูกค้ายกเลิก", idempotencyKey: o.key ?? `r${hex(6)}`, ...(o.deductions ? { deductions: o.deductions } : {}) });
};
export const decide = (sh: Shop, requestId: string, o: { decision?: string; delta?: number; manualReason?: string; approvalId?: string; key?: string; ctx?: Rec; reason?: string; now?: string } = {}) =>
  call("decideTripRefund", o.ctx ?? staff(sh, { now: o.now ?? addMin(NOW0, 11) }), { requestId, decision: o.decision ?? "APPROVE", idempotencyKey: o.key ?? `d${hex(6)}`, ...(o.reason ? { reason: o.reason } : o.decision === "REJECT" ? { reason: "ไม่อนุมัติ" } : {}),
    ...(o.delta !== undefined ? { manualDeltaSatang: o.delta } : {}), ...(o.manualReason ? { manualReason: o.manualReason } : {}), ...(o.approvalId ? { approvalId: o.approvalId } : {}) });
export const execute = (sh: Shop, requestId: string, o: { key?: string; ctx?: Rec; bankTender?: string; now?: string } = {}) =>
  call("executeTripRefund", o.ctx ?? staff(sh, { now: o.now ?? addMin(NOW0, 12) }), { requestId, idempotencyKey: o.key ?? `x${hex(6)}`, ...(o.bankTender ? { bankTender: o.bankTender } : {}) });
export const withdraw = (sh: Shop, requestId: string, o: { key?: string; ctx?: Rec } = {}) =>
  call("withdrawTripRefund", o.ctx ?? staff(sh, { now: addMin(NOW0, 11) }), { requestId, reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: o.key ?? `w${hex(6)}` });
export const duesOf = (bid: string) => q<Rec>(`SELECT * FROM "TripPaymentDue" WHERE "bookingId" = $1 ORDER BY seq`, [bid]);
export const evsOf = (bid: string) => q<Rec>(`SELECT * FROM "TripMoneyEvent" WHERE "bookingId" = $1 ORDER BY "createdAt", id`, [bid]);
export const reqsOf = (bid: string) => q<Rec>(`SELECT * FROM "TripRefundRequest" WHERE "bookingId" = $1 ORDER BY "createdAt", id`, [bid]);
export const tally = (rs: Rec[]) => { const m: Record<string, number> = {}; for (const r of rs) m[code(r)] = (m[code(r)] ?? 0) + 1; return m; };
export const pctl = (rs: Rec[], p: number) => { const ms = rs.map((r) => Number(r.__ms) || 0).sort((a, b) => a - b); return ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] ?? 0; };
export const ops: Record<string, number> = {};
export const opAdd = (w: string, n: number) => { ops[w] = (ops[w] ?? 0) + n; };
export function summary(label: string, extra: Rec = {}) {
  const s: Rec = {};
  for (const [k, v] of Object.entries(stats)) s[k] = { n: v.n, codes: v.codes, throws: v.throws, leaks: v.leaks, maxMs: v.maxMs };
  console.log(`\n===SUMMARY ${label}===\n${JSON.stringify({ findings, ops, stats: s, ...extra }, null, 1)}`);
}
