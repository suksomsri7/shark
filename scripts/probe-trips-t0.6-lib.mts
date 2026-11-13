// probe-trips-t0.6-lib.mts — ตัวช่วยร่วมของ probe นักล่า T0.6 (untracked · hunter)
// ร้านชั่วคราว slug `trips-t06h-*` · อีเมล `trips-t06h-*` · ลบเฉพาะของตัวเองใน cleanup
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
export const rid = (p: string) => `t06h_${p}_${STAMP}${hex(4)}`;
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
  await insertRow("TripProduct", { id, tenantId, unitId, slug: `t06h-${key}-${hex(4)}`.toLowerCase(), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ล่า ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
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
  await insertRow("Tenant", { id: tenantId, name: `t06h ${tag}`, slug: `trips-t06h-${tag}-${STAMP}`, updatedAt: new Date() });
  tenantIds.push(tenantId);
  const unitId = rid(`u${tag}`), unit2 = rid(`u2${tag}`);
  for (const [u, s] of [[unitId, "a"], [unit2, "b"]]) await insertRow("BusinessUnit", { id: u, tenantId, type: "TRIPS", name: `t06h ${tag}${s}`, slug: `trips-t06h-${tag}${s}-${STAMP}`, settings: "{}", updatedAt: new Date() });
  const userId = rid(`usr${tag}`);
  await insertRow("User", { id: userId, email: `trips-t06h-${tag}-${STAMP}@shark.local`, name: `t06h ${tag}`, updatedAt: new Date() });
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
export const pub = (sh: Shop, o: { now?: string; unit?: string; tenant?: string } = {}): Rec => ({ tenantId: o.tenant ?? sh.tenantId, unitId: o.unit ?? sh.unitId, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `t06h_${hex(4)}` }, now: new Date(o.now ?? NOW0), locale: "th" });
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
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE 'trips-t06h-%'`)).map((r) => r.id);
    if (us.length) {
      for (const t of ["Membership", "Session"]) { try { await pool().query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* */ } }
      await pool().query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
    }
  } catch (e) { console.log(`  ⚠️ ลบ user ${errMsg(e)}`); }
  const left = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE 'trips-t06h-%'`);
  console.log(`[cleanup] Tenant trips-t06h-* เหลือ ${left[0]?.n}`);
}
export async function sweepStale() {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE 'trips-t06h-%'`)).map((r) => r.id);
  if (stale.length) { tenantIds.push(...stale); await cleanup(); tenantIds.length = 0; }
}
export async function shutdown() {
  try { const { D } = await mods(); const p = asRec(D.prisma); const d = p.$disconnect as (() => Promise<void>) | undefined; if (d) await d.call(p); } catch { /* */ }
  await endPool();
}
export const findings: Rec[] = [];
export const finding = (id: string, sev: string, what: string, detail: unknown) => { findings.push({ id, sev, what, detail }); out(`FINDING ${sev}`, `${id} ${what}`, detail); };
