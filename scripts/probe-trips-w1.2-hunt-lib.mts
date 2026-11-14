// probe-trips-w1.2-hunt-lib.mts — shared helpers of the W1.2a bug-hunter probes (untracked · hunter · not an oracle)
// Temp shops: slug/email prefix `trips-w12h-` · everything removed in cleanup() (tenant rows · users · buckets of every probe IP)
// HTTP target: the controller's QC server (read-only use) at 127.0.0.1:3241 — every request carries an IP header unless the scenario is "no header"
// PROBE-EDIT (มติ W1–W7 · r1): server = build ใหม่ของผู้คุม (หลัง 1dd97156b) · รอฟอร์ม FORM_WAIT (TOO_FAST = 1 วิ · W5) · ตัวอ้างรอบ `t` = ref ชนิด slot (W5) · เพดานถือต่อรอบ 3 (W2)
// PROBE-EDIT (มติ Y1–Y7 · r2): ทุก POST ถือส่ง `t` (ช่องซ่อนของฟอร์มหน้าสินค้า — ตรวจใน submitHold) · ถือถี่เกิน ⇒ e=HOLD_LIMITED · ชื่อช่อง bind หาจากค่า (boundKey) · ข้อความตรวจนอก <script> (visibleText)
import { createHash, createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

export type Rec = Record<string, unknown>;
export const HOST = "127.0.0.1";
export const PORT = 3241;
export const BASE = `http://${HOST}:${PORT}`;
export const SLUG = "trips-w12h-";
export const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
export const hex = (n = 6) => randomBytes(n).toString("hex");
export const rid = (p: string) => `w12h_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
export const HOUR = 3_600_000;
export const MIN = 60_000;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** PROBE-EDIT (มติ W5: TOO_FAST = 1 วิ): รอหลังเปิดหน้าก่อนส่งฟอร์ม (nonce นับเป็นวินาทีเต็ม ⇒ > 1 วิ เสมอ) */
export const FORM_WAIT = 1_300;
export const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
export const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
export const ymdBkk = (d: Date) => new Date(d.getTime() + 7 * HOUR).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function boot(label: string) {
  loadTripsQcEnv(label);
  if (process.env.CI) { console.error("no CI"); process.exit(4); }
  pg.defaults.parseInputDatesAsUTC = true;
}
let _pool: pg.Pool | null = null;
export const pool = () => (_pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 }));
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

// ═══════ settings (core service — not in the builder's edit set) ═══════
type AnyFn = (...a: unknown[]) => unknown;
let setFn: AnyFn | null = null;
const OWNER: Record<string, Rec> = {};
export async function setV(tenantId: string, changes: Rec[]) {
  if (!setFn) { const m = (await import("@/lib/core/settings")) as Rec; setFn = m.setSettings as AnyFn; }
  const r = (await setFn(OWNER[tenantId], { tenantId }, changes, { ackLegalWarn: true })) as Rec;
  if (r?.ok !== true) throw new Error(`setSettings ${changes.map((c) => String(c.key)).join(",")}: ${JSON.stringify(r).slice(0, 300)}`);
}

// ═══════ temp shops ═══════
export const tenantIds: string[] = [];
export type Shop = { tenant: string; unit: string; slug: string; name: string; owner: string };
export type Prod = { id: string; slug: string; opt: string; unit: string; tenant: string; pt: Record<string, string>; cam: string; park: string; dive: string };
export const AD = 350_000, CH = 245_000, PA = 60_000, PC = 30_000, CAM = 50_000, DIVE = 150_000, OUTZ = 60_000;
export async function mkShop(tag: string, o: { name?: string; on?: boolean; contact?: Rec | null; receiver?: boolean } = {}): Promise<Shop> {
  const tenant = rid(`t${tag}`), unit = rid(`u${tag}`), slug = `${SLUG}${STAMP}-${tag}`, name = o.name ?? `ร้านล่า W12 ${tag} ${STAMP}`;
  await insertRow("Tenant", { id: tenant, name, slug, status: "ACTIVE", updatedAt: new Date() });
  tenantIds.push(tenant);
  await insertRow("BusinessUnit", { id: unit, tenantId: tenant, type: "TRIPS", status: "ACTIVE", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify({}), updatedAt: new Date() });
  const u = rid(`uo${tag}`);
  await insertRow("User", { id: u, email: `${SLUG}o${tag}-${STAMP}@shark.local`, name: `ผู้ล่า o${tag}`, updatedAt: new Date() });
  await insertRow("Membership", { id: rid(`mb${tag}`), userId: u, tenantId: tenant, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
  OWNER[tenant] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: u };
  if (o.receiver !== false) await insertRow("PaymentProfile", { id: rid("pp"), tenantId: tenant, promptpayId: "0812345678", displayName: `ผู้รับ ${tag} ${STAMP}`, updatedAt: new Date() });
  if (o.on !== false) await setV(tenant, [{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: unit, value: true }]);
  if (o.contact) await setV(tenant, [{ key: "trips.public.shopContact", scope: "UNIT", scopeId: unit, value: o.contact }]);
  return { tenant, unit, slug, name, owner: u };
}
let pubN = 0;
export async function mkProd(s: Shop, key: string, o: { slug?: string; opts?: number } = {}): Promise<Prod & { opts: string[] }> {
  const id = rid(`p${key}`), opt = rid(`o${key}`);
  const slug = o.slug ?? `w12h-${key.toLowerCase()}-${STAMP}`;
  const { tenant: tenantId, unit: unitId } = s;
  await insertRow("TripProduct", { id, tenantId, unitId, slug, productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทัวร์ล่า ${key}`, en: `Hunt tour ${key}` }),
    body: JSON.stringify({ summary: { th: `สรุป ${key}` } }), currency: "THB", deepDive: false, crossBorder: false, publishedAt: new Date(Date.parse("2026-01-01T00:00:00Z") + pubN++ * 60_000), updatedAt: new Date() });
  const opts = [opt];
  await insertRow("TripOption", { id: opt, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
  for (let i = 2; i <= (o.opts ?? 1); i++) { const x = rid(`o${key}${i}`); opts.push(x); await insertRow("TripOption", { id: x, tenantId, unitId, productId: id, name: JSON.stringify({ th: `ส่วนตัว ${i}`, en: `Private ${i}` }), durationMin: 480, sortOrder: i, active: true, updatedAt: new Date() }); }
  const pt: Record<string, string> = {};
  for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : code === "CHILD" ? "เด็ก" : "ทารก", en: code }),
    ageMin: code === "CHILD" ? 4 : code === "ADULT" ? 12 : null, ageMax: code === "CHILD" ? 11 : code === "INFANT" ? 3 : null, countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
  const park = await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: PA, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
    name: JSON.stringify({ th: "ค่าอุทยาน", en: "Marine park fee" }), paxPrices: JSON.stringify({ ADULT: PA, CHILD: PC }), active: true, sortOrder: 0, updatedAt: new Date() });
  const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: CAM, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
    name: JSON.stringify({ th: "เช่ากล้อง", en: "Camera" }), active: true, sortOrder: 1, updatedAt: new Date() });
  const dive = await insertRow("TripExtra", { id: rid("xdive"), tenantId, unitId, productId: id, kind: "COURSE", basis: "PER_PAX", mandatory: false, priceMinor: DIVE, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
    name: JSON.stringify({ th: "ลองดำน้ำ", en: "Try dive" }), active: true, sortOrder: 2, updatedAt: new Date() });
  for (const [code, amount] of [["ADULT", AD], ["CHILD", CH], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
  return { id, slug, opt, unit: unitId, tenant: tenantId, pt, cam, park, dive, opts };
}
export async function mkZone(s: Shop, tag: string, o: { kind?: "ZONE" | "SELF"; surcharge: number; sort: number }): Promise<string> {
  const id = rid(`z${tag}`);
  await insertRow("TripPickupZone", { id, tenantId: s.tenant, unitId: s.unit, name: `โซน ${tag}`, nameEn: `Zone ${tag}`, pickupOffsetMin: 75, surchargeSatang: o.surcharge, polygon: null, sortOrder: o.sort, kind: o.kind ?? "ZONE",
    areas: JSON.stringify({ th: `พื้นที่ ${tag}`, en: `Area ${tag}` }), windowMin: 30, active: true, basis: "PER_BOOKING", updatedAt: new Date() });
  return id;
}
export async function mkDep(p: Prod, date: string, o: { capacity?: number; sold?: number; status?: string; hm?: string; opt?: string } = {}): Promise<string> {
  const id = rid("d");
  const startsAt = BKK(date, o.hm ?? "08:00");
  await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: o.opt ?? p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * HOUR),
    status: o.status ?? "OPEN", capacity: o.capacity ?? 24, sold: o.sold ?? 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
  return id;
}
export const depRow = async (id: string) => (await q<{ capacity: number; sold: number; held: number; reserved: number; status: string }>(`SELECT capacity, sold, held, reserved, status FROM "TripDeparture" WHERE id = $1`, [id]))[0];
export const bookingsOf = async (tenant: string) => q<{ id: string; code: string; status: string; channel: string; publicTokenHash: string; policySnapshot: Rec; departureId: string; bookerPartyId: string | null; grossSatang: number; vatSatang: number; passThroughSatang: number }>(
  `SELECT id, code, status, channel, "publicTokenHash", "policySnapshot", "departureId", "bookerPartyId", "grossSatang", "vatSatang", "passThroughSatang" FROM "TripBooking" WHERE "tenantId" = $1 ORDER BY "createdAt"`, [tenant]);
export const holdsOf = async (dep: string) => q<{ id: string; status: string; qtyPublic: number; basketId: string | null; expiresAt: Date }>(`SELECT id, status, "qtyPublic", "basketId", "expiresAt" FROM "TripHold" WHERE "departureId" = $1 ORDER BY "createdAt"`, [dep]);

// ═══════ client keys ═══════
export const usedIps = new Set<string>();
export function clientKeyOf(ip: string): string {
  const secret = process.env.SESSION_SECRET ?? "";
  return `pc_${createHmac("sha256", `trips.public.client.v1:${secret}`).update(ip).digest("hex").slice(0, 40)}`;
}
let ipSeq = 0;
const RUN = 1 + ((randomBytes(1)[0] ?? 0) % 250);
/** fresh fake client IP (100.66.<run>.<n>, then next third octet) */
export function freshIp(): string { const n = ipSeq++; const ip = `100.${66 + Math.floor(n / 62_500)}.${(RUN + Math.floor(n / 250)) % 250 + 1}.${1 + (n % 250)}`; usedIps.add(ip); return ip; }

// ═══════ HTTP ═══════
export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const agent = new http.Agent({ keepAlive: true, maxSockets: 400 });
export type Resp = { status: number; headers: http.IncomingHttpHeaders; body: string; ms: number; err?: string };
export function req(path: string, o: { method?: string; headers?: Record<string, string>; ip?: string | null; body?: string | Buffer; ua?: string | null; fresh?: boolean } = {}): Promise<Resp> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const headers: Record<string, string> = { accept: "text/html", ...(o.ua === null ? {} : { "user-agent": o.ua ?? BROWSER_UA }), ...(o.ip ? { "x-forwarded-for": o.ip } : {}), ...(o.headers ?? {}) };
    if (o.ip) usedIps.add(o.ip);
    if (o.body !== undefined) headers["content-length"] = String(Buffer.byteLength(o.body));
    const r = http.request({ host: HOST, port: PORT, path, method: o.method ?? "GET", headers, ...(o.fresh ? { agent: false as const } : { agent }) }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), ms: performance.now() - t0 }));
      res.on("error", (e) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: "", ms: performance.now() - t0, err: String(e) }));
    });
    r.on("error", (e) => resolve({ status: 0, headers: {}, body: "", ms: performance.now() - t0, err: String(e) }));
    r.setTimeout(90_000, () => r.destroy(new Error("timeout 90s")));
    if (o.body !== undefined) r.write(o.body);
    r.end();
  });
}
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
export type Form = { action: string; fields: [string, string][] };
/** the POST form with server-action hidden fields (by id or first POST form) */
export function postForm(html: string, id?: string): Form | null {
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/g;
  for (const m of html.matchAll(re)) {
    const attrs = m[1] ?? "";
    if (!/method="POST"/i.test(attrs)) continue;
    if (id && !attrs.includes(`id="${id}"`)) continue;
    const fields: [string, string][] = [];
    for (const i of (m[2] ?? "").matchAll(/<input\b([^>]*)\/?>/g)) {
      const a = i[1] ?? "";
      const name = /\bname="([^"]*)"/.exec(a)?.[1];
      if (!name) continue;
      const type = /\btype="([^"]*)"/.exec(a)?.[1] ?? "text";
      if ((type === "checkbox" || type === "radio") && !/\bchecked/.test(a)) continue;
      fields.push([unesc(name), unesc(/\bvalue="([^"]*)"/.exec(a)?.[1] ?? "")]);
    }
    return { action: unesc(/\baction="([^"]*)"/.exec(attrs)?.[1] ?? ""), fields };
  }
  return null;
}
export const fieldOf = (f: Form, name: string) => f.fields.find(([k]) => k === name)?.[1] ?? null;
/**
 * PROBE-EDIT (r2 · บทเรียนรอบก่อน): ชื่อช่อง bind ของ server action (`$ACTION_<n>:<m>`) เปลี่ยนตามหน้า/ลำดับ ⇒ หาจากค่า ไม่ใช้ชื่อตายตัว
 * ช่องที่ชื่อขึ้นต้น `$ACTION_` และค่าเป็น JSON array ที่ `match` รับ (เช่น ตัวแรก = slug ร้าน) ⇒ ชื่อช่อง · ไม่พบ ⇒ ""
 */
export function boundKey(f: Form, match: (args: unknown[]) => boolean): string {
  for (const [k, v] of f.fields) {
    if (!k.startsWith("$ACTION_")) continue;
    try { const j = JSON.parse(v) as unknown; if (Array.isArray(j) && match(j)) return k; } catch { /* ไม่ใช่ JSON */ }
  }
  return "";
}
/** ข้อความที่ลูกค้าเห็น: ตัด <script> (RSC payload มีคลังข้อความทั้งระบบ) และแท็กออก (บทเรียนรอบก่อน: ตรวจข้อความเฉพาะนอก <script>) */
export const visibleText = (html: string): string => html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
export function multipart(fields: [string, string][]): { body: Buffer; type: string } {
  const b = `----w12h${hex(8)}`;
  const parts = fields.map(([k, v]) => `--${b}\r\nContent-Disposition: form-data; name="${k.replace(/"/g, "%22")}"\r\n\r\n${v}\r\n`);
  return { body: Buffer.from(`${parts.join("")}--${b}--\r\n`, "utf8"), type: `multipart/form-data; boundary=${b}` };
}
/** POST a server-action form the way a no-JS browser does (same-origin by default) */
export function submit(path: string, fields: [string, string][], ip: string | null, o: { origin?: string | null; headers?: Record<string, string> } = {}): Promise<Resp> {
  const mp = multipart(fields);
  const origin = o.origin === undefined ? BASE : o.origin;
  return req(path, { method: "POST", ip, body: mp.body, headers: { "content-type": mp.type, ...(origin === null ? {} : { origin }), ...(o.headers ?? {}) } });
}
export const loc = (r: Resp): string => String(r.headers.location ?? "");
export const testid = (html: string, id: string) => html.includes(`data-testid="${id}"`);
export const titleOf = (html: string): string => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
export function kindOf(r: Resp): string {
  if (r.err) return `ERR(${r.err.slice(0, 40)})`;
  const b = r.body;
  const k = testid(b, "book-rate-limited") ? "RATE" : testid(b, "book-not-found") || /This page could not be found|404/.test(titleOf(b)) ? "NOTFOUND" : testid(b, "book-res") ? "RES" : testid(b, "book-checkout") ? "CHECKOUT" : testid(b, "book-product") ? "PRODUCT" : testid(b, "book-error") ? `ERROR:${/data-testid="book-error"[^>]*data-code="([A-Z_]+)"|data-code="([A-Z_]+)"[^>]*data-testid="book-error"/.exec(b)?.slice(1).find(Boolean) ?? "?"}` : "OTHER";
  return `${r.status}/${k}${r.headers.location ? `→${String(r.headers.location).slice(0, 60)}` : ""}`;
}
export const errCode = (html: string): string | null => /data-testid="book-error"[^>]*data-code="([A-Z_]+)"/.exec(html)?.[1] ?? /data-code="([A-Z_]+)"[^>]*data-testid="book-error"/.exec(html)?.[1] ?? null;

// ═══════ flow over HTTP ═══════
export type Pick = { d: string; t?: string; n: Record<string, number>; x?: Record<string, number>; z?: string; lang?: string };
export const selectPath = (s: Shop, p: { slug: string }, k: Pick) => {
  const qs = new URLSearchParams();
  if (k.lang) qs.set("lang", k.lang);
  qs.set("d", k.d);
  if (k.t) qs.set("t", k.t);
  for (const [c, n] of Object.entries(k.n)) qs.set(`n.${c}`, String(n));
  for (const [r, n] of Object.entries(k.x ?? {})) qs.set(`x.${r}`, String(n));
  if (k.z) qs.set("z", k.z);
  return `/book/${s.slug}/t/${p.slug}?${qs.toString()}`;
};
/** GET product page → hold form (or null + page) */
export async function openSelect(s: Shop, p: { slug: string }, k: Pick, ip: string): Promise<{ r: Resp; form: Form | null; path: string }> {
  const path = selectPath(s, p, k);
  const r = await req(path, { ip });
  return { r, form: postForm(r.body, "book-hold-form"), path };
}
/** full hold over HTTP; waits for the nonce min age; returns the 303 Location */
export async function holdHttp(s: Shop, p: { slug: string }, k: Pick, ip: string, o: { wait?: boolean; mutate?: (f: [string, string][]) => [string, string][]; origin?: string | null } = {}): Promise<{ sel: Resp; post: Resp | null; location: string; form: Form | null }> {
  const g = await openSelect(s, p, k, ip);
  if (!g.form) return { sel: g.r, post: null, location: "", form: null };
  // PROBE-EDIT (มติ Y2): ฟอร์มถือของหน้าสินค้าต้องพก `t` ของรอบที่เลือก — ไม่มี ⇒ POST จะได้ INVALID(t) (บันทึกไว้ให้เห็นต้นเหตุ)
  if (!fieldOf(g.form, "t")) console.log(`INFO  [hold-form] ${g.path}: ฟอร์มถือไม่มีช่อง t (มติ Y2 ⇒ INVALID)`);
  if (o.wait !== false) await sleep(FORM_WAIT);
  const fields = o.mutate ? o.mutate(g.form.fields) : g.form.fields;
  const post = await submit(g.path, fields, ip, { origin: o.origin });
  return { sel: g.r, post, location: loc(post), form: g.form };
}
export async function openCheckout(location: string, ip: string): Promise<{ r: Resp; form: Form | null }> {
  const r = await req(location, { ip });
  return { r, form: postForm(r.body) };
}
export function bookerFields(f: Form, b: { name?: string; phone?: string; email?: string; accept?: boolean } = {}): [string, string][] {
  const out = f.fields.filter(([k]) => !["name", "phone", "email", "accept"].includes(k));
  out.push(["name", b.name ?? `ผู้ล่า ${hex(3)}`], ["phone", b.phone ?? freshPhone()]);
  if (b.email !== undefined) out.push(["email", b.email]);
  if (b.accept !== false) out.push(["accept", "on"]);
  return out;
}
let phoneN = 0;
export const freshPhone = () => { phoneN++; return `06${String((parseInt(hex(3), 16) * 100 + phoneN) % 100_000_000).padStart(8, "0")}`; };
/** hold + checkout + confirm over HTTP → reservation path */
export async function bookHttp(s: Shop, p: { slug: string }, k: Pick, ip: string, b: { name?: string; phone?: string; email?: string } = {}): Promise<{ holdLoc: string; checkout: Resp | null; confirm: Resp | null; resPath: string; why: string }> {
  const h = await holdHttp(s, p, k, ip);
  if (!h.location.includes("/c/")) return { holdLoc: h.location, checkout: null, confirm: null, resPath: "", why: `hold ${h.post ? kindOf(h.post) : kindOf(h.sel)}` };
  const c = await openCheckout(h.location, ip);
  if (!c.form) return { holdLoc: h.location, checkout: c.r, confirm: null, resPath: "", why: `checkout ${kindOf(c.r)}` };
  await sleep(FORM_WAIT);
  const post = await submit(h.location, bookerFields(c.form, b), ip);
  const l = loc(post);
  return { holdLoc: h.location, checkout: c.r, confirm: post, resPath: l.includes("/my/") ? l : "", why: l.includes("/my/") ? "" : `confirm ${kindOf(post)}` };
}

/** public ref (same formula as the brief §3.2 — the hunter holds the QC secret) */
export function pubRef(tenantId: string, kind: "product" | "extra" | "zone" | "slot", id: string): string {
  const buf = createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`trips.public.ref.v1:${tenantId}:${kind}:${id}`).digest();
  const B32 = "abcdefghijklmnopqrstuvwxyz234567";
  let out = "", bits = 0, acc = 0;
  for (const byte of buf) { acc = (acc << 8) | byte; bits += 8; while (bits >= 5 && out.length < 12) { out += B32[(acc >>> (bits - 5)) & 31]; bits -= 5; } acc &= (1 << bits) - 1; if (out.length >= 12) break; }
  return out;
}
/** PROBE-EDIT (มติ W5): ตัวอ้างรอบ `t` = ref สาธารณะชนิด slot ของ id รอบ (12 ตัว a-z2-7) */
export const slotRef = (tenantId: string, departureId: string) => pubRef(tenantId, "slot", departureId);
/** ตัวอ้างรอบทั้งหมดที่หน้าสินค้าใส่ในลิงก์ (`t=<ref>`) */
export const slotRefsIn = (html: string): string[] => [...new Set([...html.replace(/&amp;/g, "&").matchAll(/[?&]t=([a-z2-7]{12})\b/g)].map((m) => m[1] ?? ""))];
/** satang from the last money text inside the element with data-testid */
export function moneyOf(html: string, id: string): number | null {
  const i = html.indexOf(`data-testid="${id}"`);
  if (i < 0) return null;
  const end = html.indexOf("</li>", i) > 0 && id.startsWith("book-summary-line-") ? html.indexOf("</li>", i) : html.indexOf("</span>", i);
  const seg = html.slice(i, end > i ? end : i + 600).replace(/<[^>]*>/g, " ");
  const all = [...seg.matchAll(/(-?[\d,]+)\.(\d{2})/g)];
  const m = all[all.length - 1];
  return m ? Number((m[1] ?? "").replace(/,/g, "")) * 100 + Number(m[2]) : null;
}
export function summaryLines(html: string): { kind: string; satang: number | null }[] {
  const out: { kind: string; satang: number | null }[] = [];
  for (let i = 0; i < 40; i++) {
    const at = html.indexOf(`data-testid="book-summary-line-${i}"`);
    if (at < 0) break;
    const kind = /data-kind="([A-Z]+)"/.exec(html.slice(at, at + 200))?.[1] ?? "?";
    out.push({ kind, satang: moneyOf(html, `book-summary-line-${i}`) });
  }
  return out;
}
export const imgSrc = (html: string, id: string): string | null => {
  const i = html.indexOf(`data-testid="${id}"`);
  if (i < 0) return null;
  const tagStart = html.lastIndexOf("<img", i);
  const tag = html.slice(tagStart, html.indexOf(">", i) + 1);
  return /\bsrc="([^"]*)"/.exec(tag)?.[1]?.replace(/&amp;/g, "&") ?? null;
};

// ═══════ output ═══════
export const tally = { held: 0, found: 0, known: 0 };
export const line = (tag: string, expected: string, got: string, okFlag: boolean) => { okFlag ? tally.held++ : tally.found++; console.log(`${okFlag ? "HELD " : "FOUND"} [${tag}] expected: ${expected} | got: ${got}`); };
export const known = (tag: string, expected: string, got: string, okFlag: boolean, why: string) => { okFlag ? tally.held++ : tally.known++; console.log(`${okFlag ? "HELD " : "KNOWN"} [${tag}] expected: ${expected} | got: ${got}${okFlag ? "" : ` | ${why}`}`); };
export const info = (tag: string, msg: string) => console.log(`INFO  [${tag}] ${msg}`);
export async function guard(tag: string, fn: () => Promise<void>) { try { await fn(); } catch (e) { console.log(`ERROR [${tag}] probe step threw: ${String(e instanceof Error ? e.stack ?? e.message : e).slice(0, 500)}`); } }

// ═══════ cleanup ═══════
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  const us = (await q<{ id: string }>(`SELECT id FROM "BusinessUnit" WHERE "tenantId" = ANY($1::text[])`, [tids])).map((r) => r.id);
  for (const t of tids) await pool().query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:%:${t}:%`]);
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
async function cleanupUsers() {
  const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (!us.length) return;
  for (const t of ["Membership", "Session"]) { try { await pool().query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* none */ } }
  await pool().query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
}
export async function sweepStale() {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`  sweep: ${stale.length} stale hunt tenants`); await cleanupTenants(stale); }
  await cleanupUsers();
}
export async function cleanup() {
  try {
    await cleanupTenants(tenantIds);
    await cleanupUsers();
    const keys = [...usedIps].map(clientKeyOf).map((k) => `trips:book:none:${k}`);
    if (keys.length) { const r = await pool().query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [keys]); console.log(`  cleanup: removed ${r.rowCount} miss buckets of ${keys.length} probe IPs`); }
    const left = await q<{ n: string }>(`SELECT (SELECT count(*) FROM "Tenant" WHERE slug LIKE $1) + (SELECT count(*) FROM "User" WHERE email LIKE $1) AS n`, [`${SLUG}%`]);
    const lb = tenantIds.length ? await q<{ n: string }>(`SELECT count(*)::text AS n FROM "ChatRateBucket" WHERE ${tenantIds.map((_, i) => `key LIKE $${i + 1}`).join(" OR ")}`, tenantIds.map((t) => `%${t}%`)) : [{ n: "0" }];
    console.log(`  cleanup: hunt tenants+users left = ${left[0]?.n} · tenant buckets left = ${lb[0]?.n}`);
  } catch (e) { console.log(`  !! cleanup: ${String(e).slice(0, 300)}`); }
  agent.destroy();
  await pool().end().catch(() => undefined);
}
export function summary(label: string) { console.log(`\n=== ${label}: HELD ${tally.held} · FOUND ${tally.found} · KNOWN ${tally.known} ===`); }
