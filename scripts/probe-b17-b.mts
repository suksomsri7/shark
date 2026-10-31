// PROBE — SVC B.17 reviewer (waitlist + ไม่มาซ้ำ · ส่งครั้งเดียว · กันจองซ้อน · PDPA · X1/X3/X4/X5/X7/X8) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b17-b.mts
// ข้อมูลใต้ร้าน `qc-svc-b17pb-*` + ผู้ใช้ `svc-b17pb-*@shark.local` · id ขึ้นต้น `pb17_` · ล้างใน finally (+ กวาดของค้างตอนเริ่ม)
// หมวด: JC เข้าพร้อมกัน/เพดาน · XS ข้ามร้าน/สาขา · RL rate limit · ST ยกเลิกถล่มระหว่าง tick · MP หลายโพรเซส (consumer ×2 ×3 โพรเซส + tick)
//       FI FIRST · RT ช่องถูกจองคืนระหว่างจับคู่-ส่ง · QH ขอบเวลาเงียบ · EX หมดอายุ/แบ่งหน้า (expiry + กลุ่ม distinct) · R5 ช่วงว่างขยาย
//       NS ไม่มาซ้ำ (N-1/N/N+1 · คนละวัน/หน่วย · ขอบหน้าต่าง · ONLINE/STAFF · ยกเว้นพร้อมกัน) · PI PII
// 🔴 ไม่ยิง LINE จริง: ตัวจำลอง 127.0.0.1 + LINE_API_BASE + ครอบ fetch · โพรเซสลูก (--child) ใช้ตัวจำลองของแม่
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHILD = process.argv.indexOf("--child");
loadSvcQcEnv("probe-b17-b");
if (process.env.CI || process.env.APP_ENV === "production") { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };

// ═══════════════ ครอบ fetch (แม่และลูก) ═══════════════
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: any, init?: any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by probe" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;

// ═══════════════ โพรเซสลูก: consumer ×2 + tick ×1 พร้อมกันเมื่อได้ GO ═══════════════
if (CHILD >= 0) {
  const arg = JSON.parse(Buffer.from(process.argv[CHILD + 1] ?? "", "base64").toString("utf8"));
  const plat: any = await import("@/lib/platform/booking-waitlist" as string);
  process.stdout.write("READY\n");
  await new Promise<void>((r) => process.stdin.once("data", () => r()));
  const out: any = { ok: true };
  try {
    const now = new Date(arg.now);
    const r = await Promise.all([
      ...arg.evts.flatMap((e: any) => [plat.onWaitlistEvent(e, { now }), plat.onWaitlistEvent(e, { now })]),
      plat.runWaitlistTick(now, { tenantIds: arg.tenantIds }),
    ]);
    out.tick = r[r.length - 1];
  } catch (e) { out.ok = false; out.err = errMsg(e); }
  process.stdout.write(`RESULT ${J(out)}\n`);
  process.exit(0);
}

// ═══════════════ ตัวจำลอง LINE ═══════════════
type FakeReq = { method: string; path: string; json: any };
const FAKE: FakeReq[] = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: any = null;
    try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
    FAKE.push({ method: req.method ?? "", path, json });
    res.writeHead(200, { "content-type": "application/json" });
    if (req.method === "POST" && path === "/v2/bot/message/push") return res.end(JSON.stringify({ sentMessages: [{ id: `fm${FAKE.length}` }] }));
    return res.end("{}");
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const FAKE_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.LINE_API_BASE = FAKE_BASE;
const mark = () => FAKE.length;
const pushesTo = (ext: string, m0 = 0) => FAKE.slice(m0).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push" && r.json?.to === ext);
const msgText = (r: FakeReq | undefined): string => { const m = r?.json?.messages?.[0]; return String(m?.text ?? m?.altText ?? ""); };

type Sev = "BLOCKER" | "MAJOR" | "MINOR" | "INFO";
const results: { id: string; ok: boolean; sev: Sev }[] = [];
const rec = (id: string, ok: boolean, sev: Sev, what: string, data?: unknown) => {
  results.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : sev === "INFO" ? "ℹ️ " : "❌"} [${id}] ${what}${ok ? (data !== undefined ? ` · ${J(data)?.slice(0, 300)}` : "") : ` — ${J(data)?.slice(0, 700)}`}`);
};
const run = async (id: string, sev: Sev, what: string, fn: () => Promise<[boolean, unknown?]>) => {
  try { const [ok, d] = await fn(); rec(id, ok, sev, what, d); } catch (e) { rec(id, false, sev, what, { threw: errMsg(e) }); }
};

// ═══════════════ โมดูล ═══════════════
const wl: any = await import("@/lib/modules/booking/waitlist" as string);
const rule: any = await import("@/lib/modules/booking/no-show-rule" as string);
const plat: any = await import("@/lib/platform/booking-waitlist" as string);
const BK: any = await import("@/lib/modules/booking/service" as string);
const ON: any = await import("@/lib/modules/booking/online" as string);
const LN: any = await import("@/lib/modules/booking/queue-line" as string);
const SET: any = await import("@/lib/core/settings" as string);
const dbMod: any = await import("@/lib/core/db" as string);
const prisma = dbMod.prisma;

const captured: string[] = [];
const KEEP = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
let depth = 0;
async function quiet<R>(fn: () => Promise<R>): Promise<R> {
  const grab = (...a: unknown[]) => { captured.push(a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")); };
  if (depth++ === 0) { console.log = grab; console.info = grab; console.warn = grab; console.error = grab; console.debug = grab; }
  try { return await fn(); } finally { if (--depth === 0) Object.assign(console, KEEP); }
}
const RET: unknown[] = [];
const keep = <X,>(x: X): X => { RET.push(x); return x; };

// ═══════════════ ฐาน ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as any[];
const colCache = new Map<string, any[]>();
const cols = async (t: string) => {
  if (!colCache.has(t)) colCache.set(t, await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [t]));
  return colCache.get(t)!;
};
const rid = (p: string) => `pb17_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function ins(table: string, vals: Record<string, unknown>) {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : null;
  }
  const k = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${k.map((x) => `"${x}"`).join(", ")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(", ")})`, k.map((x) => v[x]));
}
const SLUG = "qc-svc-b17pb-";
const MAIL = "svc-b17pb-";
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const tables = (await q(`SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.table_name);
  let pending = tables;
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { failed.push(t); } }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ Tenant ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    await pool.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${MAIL}%`]);
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ user ${errMsg(e)}`); }
}
async function sv(tenantId: string, scopeId: string, key: string, value: unknown, scope = "UNIT") {
  await pool.query(`DELETE FROM "SettingValue" WHERE "tenantId" = $1 AND key = $2 AND scope = $3 AND "scopeId" = $4`, [tenantId, key, scope, scopeId]);
  await pool.query(`INSERT INTO "SettingValue" (id, "tenantId", key, scope, "scopeId", value, "setById", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())`,
    [rid("sv"), tenantId, key, scope, scopeId, JSON.stringify(value), "probe-b17"]);
}

// ═══════════════ เวลา ═══════════════
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * 60_000; };
const hm = (s: string): number => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const at = (ds: string, s: string) => new Date(bkkMs(ds, hm(s)));
const iso = (d: Date) => d.toISOString().replace("Z", "");
const DAY = 86_400_000;
const TODAY = bkkToday();
const D = addDays(TODAY, 5);
const D2 = addDays(TODAY, 6);
const D3 = addDays(TODAY, 7);
const KEY = (entryId: string, staffId: string, ds: string, t: string) => `booking:waitlistOpen:${entryId}:${staffId}:${Math.floor(bkkMs(ds, hm(t)) / 60_000)}`;

// ═══════════════ ฉาก ═══════════════
const RUN = Date.now().toString(36);
const RAND = randomBytes(3).toString("hex");
const T = (k: string) => `pb17_${k}_${RUN}`;
const id = { tA: T("tA"), tB: T("tB"), uOwner: T("owner") };
const SLUGS: Record<string, string> = { [id.tA]: `${SLUG}a-${RUN}`, [id.tB]: `${SLUG}b-${RUN}` };
type UK = "G1" | "G2" | "W" | "S" | "M" | "F" | "Q" | "RT" | "R5" | "R" | "P" | "B";
// id ของ G1/G2 ขึ้นต้น a0 ⇒ เรียงก่อนหน่วยอื่นของร้าน A (keyset (unitId, dateStr) ของ tick)
const U: Record<UK, { id: string; t: string; slug: string; name: string; mode: string; s2off?: boolean; quiet?: boolean }> = {
  G1: { id: T("a0g1"), t: id.tA, slug: `pb17-g1-${RUN}`, name: "กลุ่มหนึ่ง", mode: "ALL" },
  G2: { id: T("a0g2"), t: id.tA, slug: `pb17-g2-${RUN}`, name: "กลุ่มสอง", mode: "ALL" },
  W: { id: T("w"), t: id.tA, slug: `pb17-w-${RUN}`, name: "ร้านเข้าพร้อมกัน", mode: "ALL" },
  S: { id: T("s"), t: id.tA, slug: `pb17-s-${RUN}`, name: "ร้านยกเลิกถล่ม", mode: "ALL" },
  M: { id: T("m"), t: id.tA, slug: `pb17-m-${RUN}`, name: "ร้านหลายโพรเซส", mode: "ALL" },
  F: { id: T("f"), t: id.tA, slug: `pb17-f-${RUN}`, name: "ร้านคนแรก", mode: "FIRST", s2off: true },
  Q: { id: T("q"), t: id.tA, slug: `pb17-q-${RUN}`, name: "ร้านเวลาเงียบ", mode: "FIRST", s2off: true, quiet: true },
  RT: { id: T("rt"), t: id.tA, slug: `pb17-rt-${RUN}`, name: "ร้านจองคืน", mode: "ALL", s2off: true },
  R5: { id: T("r5"), t: id.tA, slug: `pb17-r5-${RUN}`, name: "ร้านช่วงขยาย", mode: "ALL", s2off: true },
  R: { id: T("r"), t: id.tA, slug: `pb17-r-${RUN}`, name: "ร้านกติกามัดจำ", mode: "ALL" },
  P: { id: T("p"), t: id.tA, slug: `pb17-p-${RUN}`, name: "ร้านต้องโทร", mode: "ALL" },
  B: { id: T("b"), t: id.tB, slug: `pb17-b-${RUN}`, name: "ร้านบี", mode: "ALL" },
};
const ctxOf = (k: UK) => ({ tenantId: U[k].t, unitId: U[k].id });
const refOf = (k: UK) => ({ tenantSlug: SLUGS[U[k].t], unitSlug: U[k].slug });
const stf = (k: UK, n: 1 | 2) => `${U[k].id}_s${n}`;
const svc = (k: UK, s: "cut" | "perm" = "cut") => `${U[k].id}_${s}`;
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id.uOwner };
const usedPhones = new Set<string>();
const PHONES: string[] = [];
const NAMES: string[] = [];
const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!usedPhones.has(p)) { usedPhones.add(p); PHONES.push(p); return p; } } };
const phoneLeak = (s: string) => PHONES.filter((p) => s.includes(p) || s.includes(`${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`) || s.includes(`66${p.slice(1)}`));
const nameLeak = (s: string) => NAMES.filter((n) => s.includes(n));
const IPN = randomInt(10, 250);
let ipSeq = 0;
const nextIp = () => `10.18.${IPN}.${1 + (ipSeq++ % 240)}`;
type Pty = { id: string; phone: string; name: string; ext: string; t: string };
const PTY: Record<string, Pty> = {};
let sysA = "", sysB = "";
const conn: Record<string, string> = {};
async function mkParty(key: string, t: string, contact: boolean): Promise<Pty> {
  const phone = newPhone();
  const name = `คุณ${key}โพรบ${RAND}`; NAMES.push(name);
  const p = await prisma.party.create({ data: { tenantId: t, kind: "PERSON", name, phone, phoneNorm: phone } });
  const ext = `Upb17${key.toLowerCase()}${RAND}${RUN}`;
  if (contact) {
    await prisma.chatContact.create({ data: { tenantId: t, systemId: t === id.tA ? sysA : sysB, channel: "LINE", channelConnectionId: t === id.tA ? conn.A : conn.B, externalUserId: ext, partyId: p.id, lang: "th" } });
  }
  PTY[key] = { id: p.id, phone, name, ext, t };
  return PTY[key];
}
const who = (k: string) => ON.bookingIdentityToken({ tenantId: PTY[k].t }, PTY[k].id, 240) as string;
const ap: Record<string, string> = {};
async function book(k: UK, n: 1 | 2, start: string, ds = D, s: "cut" | "perm" = "cut"): Promise<string> {
  const phone = newPhone();
  const name = `ลูกค้าโพรบ${k}${start.replace(":", "")}${RAND}`; NAMES.push(name);
  const r = await BK.bookAppointment(ctxOf(k), {
    serviceId: svc(k, s), staffId: stf(k, n), dateStr: ds, startMin: hm(start), channel: "STAFF", customerName: name, customerPhone: phone,
    idempotencyKey: `pb17-${RUN}-${k}-${n}-${start}-${ds}-${randomInt(1e9)}`,
  });
  if (!r?.ok) throw new Error(`จอง ${k} s${n} ${start} ${ds}: ${r?.code} ${r?.reason}`);
  if (r.status === "PENDING") await BK.setAppointmentStatus(U[k].t, U[k].id, r.id, "CONFIRMED");
  return r.id;
}
async function insAppt(k: UK, o: { startAt: Date; status: string; partyId?: string | null; phone: string }) {
  const aid = rid("ap");
  await ins("Appointment", {
    id: aid, tenantId: U[k].t, unitId: U[k].id, staffId: stf(k, 1), serviceId: svc(k), startAt: o.startAt, endAt: new Date(o.startAt.getTime() + 30 * 60_000),
    status: o.status, customerName: `ประวัติ${RAND}`, customerPhone: o.phone, partyId: o.partyId ?? null, kind: "BOOKED", channel: "ONLINE", source: "ONLINE",
    policySnapshot: "{}", updatedAt: new Date(),
  });
  return aid;
}
const parkOutbox = async () => { await pool.query(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, [[id.tA, id.tB]]); };
const cancelEvt = async (apptId: string) => {
  const r = await q(`SELECT id, "tenantId", type, "unitId", payload FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type = 'booking.cancelled' AND payload->>'appointmentId' = $2 ORDER BY "createdAt"`, [[id.tA, id.tB], apptId]);
  return r;
};
const cancel = async (k: UK, apptId: string) => { const c = await LN.cancelByShop(ctxOf(k), apptId); await parkOutbox(); return c; };
const logs = async (like: string) => q(`SELECT "dedupeKey", status FROM "ServiceMessageLog" WHERE "tenantId" = ANY($1::text[]) AND "dedupeKey" LIKE $2 ORDER BY at`, [[id.tA, id.tB], like]);
const wlr = async (eid: string) => (await q(`SELECT * FROM "BookingWaitlist" WHERE id = $1`, [eid]))[0] ?? null;
const wjoin = (k: UK, pk: string, i: Record<string, unknown>, ip = nextIp()) => quiet(() => wl.joinWaitlistOnline(refOf(k), { serviceId: svc(k), staffId: null, dateStr: D, fromMin: hm("14:00"), toMin: hm("15:00"), who: who(pk), ...i }, { ip })).then(keep);
const E: Record<string, string> = {};
const okJoin = async (key: string, k: UK, pk: string, i: Record<string, unknown> = {}) => {
  const r: any = await wjoin(k, pk, i);
  if (!r?.ok) throw new Error(`join ${key}: ${r?.code} ${r?.reason}`);
  E[key] = r.entryId;
  return r.entryId as string;
};
const tickA = (now = new Date(), o: Record<string, unknown> = {}) => quiet(() => plat.runWaitlistTick(now, { tenantIds: [id.tA], ...o })).then(keep);
const ev = (e: any, now = new Date()) => quiet(() => plat.onWaitlistEvent(e, { now }));

let exitCode = 0;
try {
  const stale = (await q(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาดของค้าง ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();
  try { await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`%10.18.${IPN}.%`]); } catch { /* */ }

  console.log(`\n(probe-b17-b · วันนี้ไทย ${TODAY} · D ${D} · LINE จำลอง ${FAKE_BASE})\n── ฉาก ──`);
  const now = new Date();
  for (const t of [id.tA, id.tB]) await ins("Tenant", { id: t, name: `PB17 ${t === id.tA ? "เอ" : "บี"}`, slug: SLUGS[t], updatedAt: now });
  await ins("User", { id: id.uOwner, email: `${MAIL}owner-${RUN}@shark.local`, name: "PB17 owner", updatedAt: now });
  await ins("Membership", { id: rid("mb"), userId: id.uOwner, tenantId: id.tA, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: now, updatedAt: now });
  sysA = (await prisma.appSystem.create({ data: { tenantId: id.tA, type: "CHAT", name: `pb17-chat-${RUN}` } })).id;
  sysB = (await prisma.appSystem.create({ data: { tenantId: id.tB, type: "CHAT", name: `pb17-chat-b-${RUN}` } })).id;
  conn.A = (await prisma.chatChannelConnection.create({ data: { tenantId: id.tA, systemId: sysA, type: "LINE", displayName: `pb17-a-${RUN}`, externalAccountId: `pb17-a-${RUN}`, credentials: { channelAccessToken: `pb17tokA${RAND}`, channelSecret: `pb17secA${RAND}` }, meta: { basicId: "@pb17a" } } })).id;
  conn.B = (await prisma.chatChannelConnection.create({ data: { tenantId: id.tB, systemId: sysB, type: "LINE", displayName: `pb17-b-${RUN}`, externalAccountId: `pb17-b-${RUN}`, credentials: { channelAccessToken: `pb17tokB${RAND}`, channelSecret: `pb17secB${RAND}` }, meta: { basicId: "@pb17b" } } })).id;
  let ord = 0;
  for (const [k, u] of Object.entries(U) as [UK, (typeof U)[UK]][]) {
    await ins("BusinessUnit", { id: u.id, tenantId: u.t, type: "BOOKING", name: u.name, slug: u.slug, updatedAt: now });
    for (let w = 0; w < 7; w++) await ins("BookingHours", { id: rid("bh"), tenantId: u.t, unitId: u.id, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: now });
    await ins("BookingService", { id: svc(k), tenantId: u.t, unitId: u.id, name: `ตัดผมโพรบ${k}`, durationMin: 30, priceSatang: 25000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: now });
    await ins("BookingService", { id: svc(k, "perm"), tenantId: u.t, unitId: u.id, name: `ดัดผมโพรบ${k}`, durationMin: 120, priceSatang: 150000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 1, updatedAt: now });
    for (const n of [1, 2] as const) await ins("BookingStaff", { id: stf(k, n), tenantId: u.t, unitId: u.id, name: `ช่าง${n}${k}`, sortOrder: n, createdAt: new Date(now.getTime() - 600_000 + ++ord * 1000), updatedAt: now });
    const a = await SET.applyTemplate({ ...OWNER, userId: id.uOwner }, { tenantId: u.t }, { unitId: u.id, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    if (a?.ok !== true) throw new Error(`applyTemplate ${k}: ${a?.code} ${J(a?.issues)}`);
    await sv(u.t, u.id, "messaging.lineConnectionId", u.t === id.tA ? conn.A : conn.B);
    await sv(u.t, u.id, "messaging.channelOrder", ["LINE", "WEB_LINK"]);
    await sv(u.t, u.id, "messaging.quietHours", u.quiet ? { start: "21:00", end: "08:00" } : null);
    await sv(u.t, u.id, "booking.booking.onlineSharePct", 100);
    await sv(u.t, u.id, "booking.booking.maxOpenPerPhone", null);
    await sv(u.t, u.id, "booking.booking.waitlistMode", u.mode);
    if (u.s2off) await sv(u.t, stf(k, 2), "booking.booking.onlineSharePct", 0, "STAFF");
  }
  await sv(id.tA, U.R.id, "booking.late.repeatNoShow", { count: 2, windowDays: 90, action: "REQUIRE_DEPOSIT" });
  await sv(id.tA, U.P.id, "booking.late.repeatNoShow", { count: 3, windowDays: 180, action: "PHONE_ONLY" });
  // หน้าต่าง 14:00–15:00 เต็ม (ช่องที่เปิดออนไลน์ทั้งหมด)
  for (const k of ["W", "S", "M", "B"] as UK[]) for (const n of [1, 2] as const) for (const t0 of ["14:00", "14:30"]) ap[`${k}${n}${t0}`] = await book(k, n, t0);
  for (const n of [1, 2] as const) for (const t0 of ["14:00", "14:30"]) ap[`W${n}${t0}D2`] = await book("W", n, t0, D2);
  for (const t0 of ["14:00", "14:30", "15:00"]) ap[`F${t0}`] = await book("F", 1, t0);
  for (const ds of [D, D2]) for (const t0 of ["14:00", "14:30"]) ap[`Q${t0}${ds}`] = await book("Q", 1, t0, ds);
  for (const ds of [D, D2]) for (const t0 of ["14:00", "14:30"]) ap[`R5${t0}${ds}`] = await book("R5", 1, t0, ds);
  ap.RT = await book("RT", 1, "14:00");
  for (const k of ["J", "L", "X", "S1", "S2", "S3", "S4", "M1", "M2", "FA", "FB", "FC", "QA", "QB", "QA2", "QB2", "R5a", "R5b", "G2"]) await mkParty(k, id.tA, true);
  for (let i = 0; i < 6; i++) await mkParty(`RT${i}`, id.tA, true);
  for (let i = 0; i < 7; i++) await mkParty(`G1_${i}`, id.tA, false);
  await mkParty("PB", id.tB, true);
  await parkOutbox();
  console.log("  ฉากพร้อม");

  // ═══════════════ JC · เข้าพร้อมกัน ═══════════════
  console.log("\n── JC เข้าพร้อมกัน / เพดาน ──");
  await run("JC-1", "BLOCKER", "join พร้อมกัน 12 ทาง (Party เดียว · ค่าเดียวกัน · IP ต่างกัน) ⇒ แถว ACTIVE 1 · id เดียว · duplicated 11", async () => {
    const rs: any[] = await Promise.all(Array.from({ length: 12 }, () => wjoin("W", "J", { staffId: stf("W", 1) })));
    const ids = new Set(rs.filter((r) => r.ok).map((r) => r.entryId));
    const rows = await q(`SELECT id FROM "BookingWaitlist" WHERE "tenantId" = $1 AND "partyId" = $2 AND status = 'ACTIVE'`, [id.tA, PTY.J.id]);
    E.J = [...ids][0] as string;
    return [rs.every((r) => r.ok) && ids.size === 1 && rows.length === 1 && rs.filter((r) => r.duplicated).length === 11, { codes: rs.map((r) => r.code ?? (r.duplicated ? "dup" : "new")), rows: rows.length }];
  });
  await run("JC-2", "MAJOR", "join พร้อมกัน 10 ทาง 5 ชุดค่า (เพดาน 3) ⇒ ACTIVE ตรง 3 แถว · ชุดเดียวกันได้ id เดียว · เกิน = LIMIT", async () => {
    const combos = [{ staffId: stf("W", 1) }, { staffId: stf("W", 2) }, { staffId: null }, { serviceId: svc("W", "perm"), staffId: null }, { serviceId: svc("W", "perm"), staffId: stf("W", 1) }];
    const rs: any[] = await Promise.all([...combos, ...combos].map((c) => wjoin("W", "L", c)));
    const rows = await q(`SELECT id, "serviceId", "staffId" FROM "BookingWaitlist" WHERE "tenantId" = $1 AND "partyId" = $2 AND status = 'ACTIVE'`, [id.tA, PTY.L.id]);
    const perCombo = combos.map((_, i) => new Set([rs[i], rs[i + 5]].filter((r) => r.ok).map((r) => r.entryId)).size);
    const codes = rs.map((r) => (r.ok ? "ok" : r.code));
    return [rows.length === 3 && perCombo.every((n) => n <= 1) && codes.every((c) => c === "ok" || c === "LIMIT"), { rows: rows.length, codes, perCombo }];
  });
  await run("JC-3", "MINOR", "leave ทุกแถวของ L ⇒ duplicated false · ซ้ำ ⇒ duplicated true · พร้อมกัน 5 ทาง = CANCELLED แถวเดียวไม่พัง", async () => {
    const rows = await q(`SELECT id FROM "BookingWaitlist" WHERE "tenantId" = $1 AND "partyId" = $2 AND status = 'ACTIVE'`, [id.tA, PTY.L.id]);
    const first: any[] = await Promise.all(rows.flatMap((r) => Array.from({ length: 5 }, () => quiet(() => wl.leaveWaitlistOnline(refOf("W"), { entryId: r.id, who: who("L") }, { ip: nextIp() })))));
    const fresh = first.filter((r) => r.ok && !r.duplicated).length;
    const left = await q(`SELECT status, "endReason" FROM "BookingWaitlist" WHERE "partyId" = $1`, [PTY.L.id]);
    return [first.every((r) => r.ok) && fresh === rows.length && left.every((r) => r.status === "CANCELLED" && r.endReason === "CUSTOMER"), { fresh, n: rows.length, left }];
  });

  // ═══════════════ XS · ข้ามร้าน/สาขา ═══════════════
  console.log("\n── XS ข้ามร้าน/สาขา ──");
  await run("XS-1", "BLOCKER", "leave entry ของ J ผ่าน: ร้าน B · สาขาอื่นร้านเดียวกัน · ตัวตนคนอื่น · ตัวตนปลอม · id ไม่มีจริง ⇒ NOT_FOUND ข้อความเดียวกันทุกไบต์ · entry ยัง ACTIVE", async () => {
    const L = (ref: any, i: any) => quiet(() => wl.leaveWaitlistOnline(ref, i, { ip: nextIp() }));
    const rs: any[] = [
      await L(refOf("B"), { entryId: E.J, who: who("J") }),
      await L(refOf("S"), { entryId: E.J, who: who("J") }),
      await L(refOf("W"), { entryId: E.J, who: who("X") }),
      await L(refOf("W"), { entryId: E.J, who: `${who("J").slice(0, -4)}AAAA` }),
      await L(refOf("W"), { entryId: `${E.J}x`, who: who("J") }),
      await L(refOf("W"), { entryId: E.J, who: who("PB") }),
      await L({ tenantSlug: SLUGS[id.tB], unitSlug: U.W.slug }, { entryId: E.J, who: who("J") }),
    ];
    const r0 = await wlr(E.J);
    return [rs.every((r) => r.ok === false && r.code === "NOT_FOUND" && r.reason === rs[0].reason) && r0?.status === "ACTIVE", { rs: rs.map((r) => [r.code, r.reason]), st: r0?.status }];
  });
  await run("XS-2", "BLOCKER", "join ร้าน B ด้วยตัวตนร้าน A ⇒ IDENTITY_REQUIRED ข้อความเดียวกับตัวตนเพี้ยน/ว่าง · ไม่มีแถวใหม่", async () => {
    const a: any = await quiet(() => wl.joinWaitlistOnline(refOf("B"), { serviceId: svc("B"), staffId: null, dateStr: D, fromMin: 840, toMin: 900, who: who("J") }, { ip: nextIp() }));
    const b: any = await quiet(() => wl.joinWaitlistOnline(refOf("B"), { serviceId: svc("B"), staffId: null, dateStr: D, fromMin: 840, toMin: 900, who: "garbage" }, { ip: nextIp() }));
    const c: any = await quiet(() => wl.joinWaitlistOnline(refOf("B"), { serviceId: svc("B"), staffId: null, dateStr: D, fromMin: 840, toMin: 900, who: "" }, { ip: nextIp() }));
    const n = await q(`SELECT count(*)::int AS n FROM "BookingWaitlist" WHERE "tenantId" = $1`, [id.tB]);
    return [[a, b, c].every((r) => r.code === "IDENTITY_REQUIRED" && r.reason === a.reason) && n[0].n === 0, { a, b, c, n: n[0].n }];
  });
  await run("XS-3", "BLOCKER", "join สาขา W ด้วยบริการ/ช่างของสาขา S (ร้านเดียวกัน) หรือของร้าน B ⇒ NOT_FOUND ข้อความเดียวกัน", async () => {
    const a: any = await wjoin("W", "J", { serviceId: svc("S"), staffId: null, dateStr: D3 });
    const b: any = await wjoin("W", "J", { staffId: stf("S", 1), dateStr: D3 });
    const c: any = await wjoin("W", "J", { serviceId: svc("B"), dateStr: D3 });
    return [[a, b, c].every((r) => r.code === "NOT_FOUND" && r.reason === a.reason), { a, b, c }];
  });
  await run("XS-4", "BLOCKER", "กล่อง waitlist (waitlistViewOf) ของร้าน B ด้วยตัวตนร้าน A ⇒ canJoin false · ของร้าน A เอง ⇒ joined true", async () => {
    const v: any = await quiet(() => wl.waitlistViewOf(ctxOf("B"), { serviceId: svc("B"), staffId: stf("B", 1), dateStr: D, who: who("J") }));
    const own: any = await quiet(() => wl.waitlistViewOf(ctxOf("W"), { serviceId: svc("W"), staffId: stf("W", 1), dateStr: D, who: who("J") }));
    return [v?.canJoin === false && v?.joined === false && own?.joined === true, { v, own }];
  });
  await run("XS-5", "BLOCKER", "event ปลอม: tenantId B + appointmentId ของร้าน A (ยกเลิกแล้ว) ⇒ ไม่ส่ง · ไม่มีแถว log ใหม่ · ไม่ throw", async () => {
    const aid = ap["W114:00D2"];
    await cancel("W", aid);
    const m0 = mark();
    const l0 = (await logs("booking:waitlistOpen:%")).length;
    await ev({ id: "fake", tenantId: id.tB, type: "booking.cancelled", unitId: U.B.id, payload: { appointmentId: aid, unitId: U.W.id } });
    await ev({ id: "fake2", tenantId: id.tB, type: "booking.rescheduled", unitId: U.B.id, payload: { appointmentId: aid, fromStartAt: at(D2, "14:00").toISOString() } });
    const l1 = (await logs("booking:waitlistOpen:%")).length;
    return [FAKE.slice(m0).length === 0 && l1 === l0, { pushes: FAKE.slice(m0).length, l0, l1 }];
  });
  await run("XS-6", "BLOCKER", "tick จำกัด tenantIds [B] ⇒ entry หมดอายุของร้าน A ยัง ACTIVE · ไม่ส่งให้ร้าน A", async () => {
    const eid = rid("wlx");
    await ins("BookingWaitlist", { id: eid, tenantId: id.tA, unitId: U.G1.id, partyId: PTY.X.id, serviceId: svc("G1"), staffId: null, dateStr: TODAY, fromMin: 0, toMin: 1, status: "ACTIVE", expiresAt: new Date(Date.now() - 60_000), updatedAt: new Date() });
    const m0 = mark();
    const r: any = await quiet(() => plat.runWaitlistTick(new Date(), { tenantIds: [id.tB] }));
    const row = await wlr(eid);
    const ok = row?.status === "ACTIVE" && FAKE.slice(m0).filter((x) => pushesTo(PTY.X.ext).includes(x)).length === 0;
    await pool.query(`DELETE FROM "BookingWaitlist" WHERE id = $1`, [eid]);
    return [ok, { r, st: row?.status }];
  });

  // ═══════════════ RL · rate limit ═══════════════
  console.log("\n── RL rate limit ──");
  await run("RL-1", "MAJOR", "join 15 ทางพร้อมกัน IP เดียว ⇒ ผ่านถัง 10 พอดี (ที่เหลือ RATE_LIMITED) · leave IP เดียวกันหลังจากนั้น ⇒ RATE_LIMITED (ถังร่วม) · IP อื่นยังได้", async () => {
    const ip = `10.18.${IPN}.250`;
    const rs: any[] = await Promise.all(Array.from({ length: 15 }, () => quiet(() => wl.joinWaitlistOnline(refOf("W"), { serviceId: svc("W"), staffId: null, dateStr: D, who: "nope" }, { ip }))));
    const rl = rs.filter((r) => r.code === "RATE_LIMITED").length;
    const lv: any = await quiet(() => wl.leaveWaitlistOnline(refOf("W"), { entryId: E.J, who: who("J") }, { ip }));
    const other: any = await quiet(() => wl.joinWaitlistOnline(refOf("W"), { serviceId: svc("W"), staffId: null, dateStr: D, who: "nope" }, { ip: nextIp() }));
    return [rl === 5 && lv.code === "RATE_LIMITED" && other.code === "IDENTITY_REQUIRED", { rl, codes: rs.map((r) => r.code), lv: lv.code, other: other.code }];
  });
  await run("RL-2", "INFO", "ไม่มี IP (หัว x-forwarded-for ว่าง) ⇒ ถัง 'unknown' ร่วมกันทุกคน (ข้อสังเกต: คนเดียวทำให้คนไม่มี IP ทั้งหมดโดน RATE_LIMITED)", async () => {
    const rs: any[] = [];
    for (let i = 0; i < 11; i++) rs.push(await quiet(() => wl.joinWaitlistOnline(refOf("W"), { serviceId: svc("W"), staffId: null, dateStr: D, who: "nope" }, {})));
    try { await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = 'bq:wl:ip:unknown'`); } catch { /* */ }
    return [false, { last: rs[10].code, note: "พฤติกรรมเดียวกับหน้าอื่นของ storefront (ip || 'unknown')" }];
  });

  // ═══════════════ ST · ยกเลิกถล่มระหว่าง tick ═══════════════
  console.log("\n── ST ยกเลิกถล่มระหว่าง tick (X3/X4/X5) ──");
  await okJoin("S1", "S", "S1", { staffId: stf("S", 1) });
  await okJoin("S2", "S", "S2", { staffId: null });
  await okJoin("S3", "S", "S3", { staffId: stf("S", 2) });
  await okJoin("S4", "S", "S4", { staffId: null });
  const mS = mark();
  const stormAppts = ["S114:00", "S114:30", "S214:00", "S214:30"].map((k) => ap[k]);
  const cres: any[] = await quiet(() => Promise.all([
    ...stormAppts.flatMap((a) => [LN.cancelByShop(ctxOf("S"), a), LN.cancelByShop(ctxOf("S"), a), LN.cancelByShop(ctxOf("S"), a)]),
    plat.runWaitlistTick(new Date(), { tenantIds: [id.tA] }), plat.runWaitlistTick(new Date(), { tenantIds: [id.tA] }), plat.runWaitlistTick(new Date(), { tenantIds: [id.tA] }),
  ]));
  await parkOutbox();
  const stormEvts = (await Promise.all(stormAppts.map((a) => cancelEvt(a)))).flat();
  await quiet(() => Promise.all([...stormEvts.flatMap((e) => [plat.onWaitlistEvent(e), plat.onWaitlistEvent(e)]), plat.runWaitlistTick(new Date(), { tenantIds: [id.tA] }), plat.runWaitlistTick(new Date(), { tenantIds: [id.tA] })]));
  await run("ST-1", "BLOCKER", "ยกเลิกนัดเดียวกัน 3 ทางพร้อมกัน ×4 นัด ⇒ ผู้ชนะ 1 ต่อนัด · event booking.cancelled 1 ต่อนัด", async () => {
    const wins = stormAppts.map((_, i) => cres.slice(i * 3, i * 3 + 3).filter((r) => r?.ok).length);
    const evPer = await Promise.all(stormAppts.map(async (a) => (await cancelEvt(a)).length));
    return [wins.every((n) => n === 1) && evPer.every((n) => n === 1), { wins, evPer }];
  });
  await run("ST-2", "BLOCKER", "ส่งครั้งเดียว: ทุก entry push = จำนวนแถว SENT ของตัวเอง (ไม่มี push ซ้ำต่อคีย์) · S1–S4 ได้ ≥1 · ทุกแถว log อยู่ในสถานะจบ", async () => {
    const per = await Promise.all(["S1", "S2", "S3", "S4"].map(async (k) => {
      const rows = await logs(`booking:waitlistOpen:${E[k]}:%`);
      return { k, push: pushesTo(PTY[k].ext, mS).length, sent: rows.filter((r) => r.status === "SENT").length, st: rows.map((r) => r.status) };
    }));
    return [per.every((p) => p.push === p.sent && p.push >= 1 && p.st.every((s: string) => s === "SENT" || s.startsWith("SKIPPED_PRECHECK_"))), per];
  });
  await run("ST-3", "INFO", "จำนวนข้อความต่อคนเมื่อช่วงว่างโตขึ้นระหว่างถล่ม (R5: ช่วงว่างขยาย = ข้อเสนอเดิม) — >1 = ได้ซ้ำเพราะช่วงขยายไปทางเช้ากว่า", async () => {
    const n = ["S1", "S2", "S3", "S4"].map((k) => pushesTo(PTY[k].ext, mS).length);
    return [n.every((x) => x === 1), { pushes: n }];
  });
  await run("ST-4", "MAJOR", "ซ้ำอีกรอบ (consumer ×2 ทุก event + tick ×2) ⇒ ไม่มี push ใหม่", async () => {
    const m0 = mark();
    await quiet(() => Promise.all([...stormEvts.flatMap((e) => [plat.onWaitlistEvent(e), plat.onWaitlistEvent(e)]), plat.runWaitlistTick(new Date(), { tenantIds: [id.tA] }), plat.runWaitlistTick(new Date(), { tenantIds: [id.tA] })]));
    return [FAKE.slice(m0).filter((r) => r.path === "/v2/bot/message/push").length === 0, { n: FAKE.slice(m0).length }];
  });

  // ═══════════════ MP · หลายโพรเซส ═══════════════
  console.log("\n── MP หลายโพรเซส (consumer ×2 × 3 โพรเซส + tick ×3) ──");
  await okJoin("M1", "M", "M1", { staffId: stf("M", 1) });
  await okJoin("M2", "M", "M2", { staffId: null });
  await cancel("M", ap["M114:00"]);
  const mEvts = await cancelEvt(ap["M114:00"]);
  const mpNow = new Date();
  const arg = Buffer.from(J({ evts: mEvts, now: mpNow.toISOString(), tenantIds: [id.tA] })).toString("base64");
  const kids = [0, 1].map(() => {
    const c = spawn("pnpm", ["exec", "tsx", "scripts/probe-b17-b.mts", "--child", arg], { cwd: ROOT, env: { ...process.env, LINE_API_BASE: FAKE_BASE }, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    let err = "";
    const ready = new Promise<void>((res, rej) => {
      c.stdout.on("data", (d: Buffer) => { buf += d.toString(); if (buf.includes("READY")) res(); });
      c.stderr.on("data", (d: Buffer) => { err += d.toString(); });
      c.on("exit", (code) => { if (!buf.includes("READY")) rej(new Error(`child exit ${code}: ${err.slice(-400)}`)); });
    });
    const done = new Promise<any>((res) => c.on("exit", () => { const m = /RESULT (.*)/.exec(buf); res(m ? JSON.parse(m[1]) : { ok: false, err: err.slice(-400) }); }));
    return { c, ready, done };
  });
  let mpErr = "";
  try { await Promise.all(kids.map((k) => k.ready)); } catch (e) { mpErr = errMsg(e); }
  const mM = mark();
  if (!mpErr) {
    for (const k of kids) k.c.stdin.write("GO\n");
    await quiet(() => Promise.all([...mEvts.flatMap((e) => [plat.onWaitlistEvent(e, { now: mpNow }), plat.onWaitlistEvent(e, { now: mpNow })]), plat.runWaitlistTick(mpNow, { tenantIds: [id.tA] })]));
  } else for (const k of kids) k.c.kill();
  const kidRes = await Promise.all(kids.map((k) => k.done));
  await run("MP-1", "BLOCKER", "3 โพรเซส ⇒ M1 (ช่าง1) 1 ข้อความ · M2 (ใครก็ได้) 1 ข้อความ · แถว SENT อย่างละ 1 · ลูกไม่ล้ม", async () => {
    const p = ["M1", "M2"].map((k) => pushesTo(PTY[k].ext, mM).length);
    const l = await Promise.all(["M1", "M2"].map(async (k) => (await logs(`booking:waitlistOpen:${E[k]}:%`)).map((r) => r.status)));
    return [!mpErr && kidRes.every((r) => r.ok) && p[0] === 1 && p[1] === 1 && l.every((s) => s.length === 1 && s[0] === "SENT"), { mpErr, kidRes, p, l }];
  });

  // ═══════════════ FI · FIRST ═══════════════
  console.log("\n── FI FIRST (2+ entry · 1 ช่อง) ──");
  await okJoin("FA", "F", "FA", { staffId: stf("F", 1) });
  await okJoin("FB", "F", "FB", { staffId: stf("F", 1) });
  await okJoin("FC", "F", "FC", { staffId: null, fromMin: hm("14:30"), toMin: hm("15:30") });
  await cancel("F", ap["F14:00"]);
  const fEv1 = await cancelEvt(ap["F14:00"]);
  const mF = mark();
  await quiet(() => Promise.all([...fEv1.flatMap((e) => [plat.onWaitlistEvent(e), plat.onWaitlistEvent(e), plat.onWaitlistEvent(e)]), plat.runWaitlistTick(new Date(), { tenantIds: [id.tA] }), plat.runWaitlistTick(new Date(), { tenantIds: [id.tA] })]));
  await run("FI-1", "BLOCKER", "FIRST 1 ช่อง (14:00) · consumer ×3 + tick ×2 พร้อมกัน ⇒ FA 1 · FB 0 · FC 0 (หน้าต่าง 14:30–) · แถวช่อง 14:00 มีของ FA เท่านั้น", async () => {
    const p = ["FA", "FB", "FC"].map((k) => pushesTo(PTY[k].ext, mF).length);
    const fb = await logs(`booking:waitlistOpen:${E.FB}:%`);
    return [p[0] === 1 && p[1] === 0 && p[2] === 0 && fb.length === 0, { p, fb }];
  });
  await cancel("F", ap["F15:00"]);
  const mF2 = mark();
  await tickA();
  await run("FI-2", "MAJOR", "ช่องใหม่ 15:00 (นอกหน้าต่าง FA/FB) ⇒ FC 1 · FA/FB 0", async () => {
    const p = ["FA", "FB", "FC"].map((k) => pushesTo(PTY[k].ext, mF2).length);
    return [p[0] === 0 && p[1] === 0 && p[2] === 1, { p }];
  });
  await cancel("F", ap["F14:30"]);
  const mF3 = mark();
  await tickA(); await tickA();
  await run("FI-3", "INFO", "14:30 ว่างเพิ่ม (ต่อจากช่วง 14:00 ของ FA) ⇒ FA ไม่ได้ซ้ำ · FB ไม่ได้ (ช่วง 14:00 ถือโดย FA) · FC ได้ 14:30 เป็นข้อเสนอที่ 2 (คีย์ต่างนาที ⇒ FIRST ถือว่าเป็นช่องใหม่)", async () => {
    const p = ["FA", "FB", "FC"].map((k) => pushesTo(PTY[k].ext, mF3).length);
    return [p[0] === 0 && p[1] === 0 && p[2] === 0, { p, note: "FA ถูกเสนอช่วง 14:00 (รวม 14:30 แล้ว) แต่ FC ได้ 14:30 อีก ⇒ FIRST ไม่ใช่ 'คนแรกคนเดียว' เมื่อหน้าต่างคนละช่วง" }];
  });

  // ═══════════════ RT · ช่องถูกจองคืนระหว่างจับคู่–ส่ง ═══════════════
  console.log("\n── RT ช่องถูกจองคืน (precheck · ไม่มีทางลัด) ──");
  const rtOut: any[] = [];
  for (let i = 0; i < 6; i++) {
    const k = `RT${i}`;
    await okJoin(k, "RT", k, { staffId: stf("RT", 1), toMin: hm("14:30") });
    const cur = (await q(`SELECT id FROM "Appointment" WHERE "unitId" = $1 AND "startAt" = $2 AND status::text NOT IN ('CANCELLED','NO_SHOW')`, [U.RT.id, iso(at(D, "14:00"))]))[0]?.id;
    await cancel("RT", cur);
    const evs = await cancelEvt(cur);
    const m0 = mark();
    const ph = newPhone();
    const nm = `จองคืน${i}${RAND}`; NAMES.push(nm);
    const [, , b] = await quiet(() => Promise.all([
      plat.onWaitlistEvent(evs[0]), plat.runWaitlistTick(new Date(), { tenantIds: [id.tA] }),
      BK.bookAppointment(ctxOf("RT"), { serviceId: svc("RT"), staffId: stf("RT", 1), dateStr: D, startMin: hm("14:00"), channel: "STAFF", customerName: nm, customerPhone: ph, idempotencyKey: `pb17-rt-${RUN}-${i}` }),
    ]));
    const live = (await q(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = $1 AND "startAt" = $2 AND status::text NOT IN ('CANCELLED','NO_SHOW')`, [U.RT.id, iso(at(D, "14:00"))]))[0].n;
    const via: any = await quiet(() => ON.bookOnline(refOf("RT"), { serviceId: svc("RT"), staffId: stf("RT", 1), dateStr: D, startMin: hm("14:00"), who: who(k), idempotencyKey: `pb17-rtv-${RUN}-${i}` }, { ip: nextIp() }));
    const l = (await logs(`booking:waitlistOpen:${E[k]}:%`)).map((r) => r.status);
    rtOut.push({ i, rebook: b?.ok, live, push: pushesTo(PTY[k].ext, m0).length, log: l, via: via?.code ?? (via?.ok ? "OK" : "?") });
    await parkOutbox();
  }
  await run("RT-1", "BLOCKER", "6 รอบ: ยกเลิก → (consumer ∥ tick ∥ ร้านจองคืนช่องเดิม) ⇒ จองคืนสำเร็จทุกรอบ · นัดสดที่ 14:00 = 1 เสมอ · คนรอกดลิงก์จองเวลานั้น ⇒ FULL (ไม่มีทางลัด) · แถว log ∈ {SENT, SKIPPED_PRECHECK_SLOT_TAKEN, ไม่มี}", async () => {
    const okAll = rtOut.every((r) => r.rebook === true && r.live === 1 && r.via === "FULL" && r.log.every((s: string) => s === "SENT" || s === "SKIPPED_PRECHECK_SLOT_TAKEN") && r.push === r.log.filter((s: string) => s === "SENT").length);
    return [okAll, rtOut];
  });

  await run("RT-2", "MINOR", "ช่องเดิมว่างอีกครั้ง (ไม่มีคนจองคืน) ⇒ ALL: ทุก entry ที่รออยู่ได้ข้อความ — รวม entry ที่เคยโดน SKIPPED_PRECHECK_SLOT_TAKEN ที่คีย์เดียวกัน", async () => {
    const cur = (await q(`SELECT id FROM "Appointment" WHERE "unitId" = $1 AND "startAt" = $2 AND status::text NOT IN ('CANCELLED','NO_SHOW')`, [U.RT.id, iso(at(D, "14:00"))]))[0]?.id;
    await cancel("RT", cur);
    const m0 = mark();
    await tickA();
    const per = rtOut.map((r) => ({ i: r.i, taken: r.log.includes("SKIPPED_PRECHECK_SLOT_TAKEN"), push: pushesTo(PTY[`RT${r.i}`].ext, m0).length }));
    const victims = per.filter((p) => p.taken);
    return [per.filter((p) => !p.taken).every((p) => p.push === 1) && victims.every((p) => p.push === 1), { per, note: victims.length ? "SKIPPED_PRECHECK_* เป็นสถานะจบของคีย์ (entry, ช่าง, นาที) ⇒ ช่องเดิมว่างอีกไม่แจ้งคนนี้อีกเลย" : "รอบนี้ไม่มี entry โดน SLOT_TAKEN" }];
  });

  // ═══════════════ QH · เวลาเงียบ ═══════════════
  console.log("\n── QH ขอบเวลาเงียบ 21:00–08:00 (FIRST) ──");
  await okJoin("QA", "Q", "QA", { staffId: stf("Q", 1) });
  await okJoin("QB", "Q", "QB", { staffId: stf("Q", 1) });
  await okJoin("QA2", "Q", "QA2", { staffId: stf("Q", 1), dateStr: D2 });
  await okJoin("QB2", "Q", "QB2", { staffId: stf("Q", 1), dateStr: D2 });
  const DX = addDays(TODAY, 1);
  const DY = addDays(TODAY, 2);
  await cancel("Q", ap[`Q14:00${D}`]);
  const qEv = await cancelEvt(ap[`Q14:00${D}`]);
  const mQ = mark();
  await ev(qEv[0], at(DX, "20:59"));
  await run("QH-1", "MAJOR", "20:59 (ก่อนเวลาเงียบ) ⇒ QA SENT 1 · QB 0", async () => {
    const p = [pushesTo(PTY.QA.ext, mQ).length, pushesTo(PTY.QB.ext, mQ).length];
    return [p[0] === 1 && p[1] === 0, { p, l: await logs(`booking:waitlistOpen:${E.QA}:%`) }];
  });
  await cancel("Q", ap[`Q14:00${D2}`]);
  const qEv2 = await cancelEvt(ap[`Q14:00${D2}`]);
  const mQ2 = mark();
  await ev(qEv2[0], at(DX, "21:00"));
  const l2100 = (await logs(`booking:waitlistOpen:${E.QA2}:%`)).map((r) => r.status);
  const lb2100 = (await logs(`booking:waitlistOpen:${E.QB2}:%`)).length;
  await tickA(at(DY, "07:59"));
  const p0759 = [pushesTo(PTY.QA2.ext, mQ2).length, pushesTo(PTY.QB2.ext, mQ2).length];
  const lb0759 = (await logs(`booking:waitlistOpen:${E.QB2}:%`)).length;
  await run("QH-2", "MAJOR", "21:00 และ 07:59 ⇒ ไม่ส่ง · QA2 แถว SKIPPED_QUIET · QB2 ไม่ได้ช่อง (FIRST ถือให้ QA2) ", async () => [l2100.length === 1 && l2100[0] === "SKIPPED_QUIET" && lb2100 === 0 && p0759[0] === 0 && p0759[1] === 0 && lb0759 === 0, { l2100, lb2100, p0759, lb0759 }]);
  await tickA(at(DY, "08:00"));
  await run("QH-3", "MAJOR", "08:00 (หมดเวลาเงียบ) tick ⇒ QA2 SENT 1 · QB2 0 · tick ซ้ำ ⇒ ไม่เพิ่ม", async () => {
    await tickA(at(DY, "08:01"));
    const p = [pushesTo(PTY.QA2.ext, mQ2).length, pushesTo(PTY.QB2.ext, mQ2).length];
    const l = (await logs(`booking:waitlistOpen:${E.QA2}:%`)).map((r) => r.status);
    return [p[0] === 1 && p[1] === 0 && l.length === 1 && l[0] === "SENT", { p, l }];
  });
  await run("QH-4", "MAJOR", "SKIPPED_QUIET แล้วช่องถูกจองคืนก่อน 08:00 ⇒ 08:00 ไม่ส่งข้อความเก่า (ข้อเสนอค้างไม่หลุด)", async () => {
    // D: จองคืน 14:00 (ช่วงเดิมของ QA) · ปล่อย 14:30 ⇒ ช่วงใหม่เริ่ม 14:30 · 23:00 = SKIPPED_QUIET ของ QA · จองคืน 14:30 ก่อนเช้า · 08:00 ต้องไม่ส่ง
    const nm = `จองคืนคืน${RAND}`; NAMES.push(nm);
    const b = await quiet(() => BK.bookAppointment(ctxOf("Q"), { serviceId: svc("Q"), staffId: stf("Q", 1), dateStr: D, startMin: hm("14:00"), channel: "STAFF", customerName: nm, customerPhone: newPhone(), idempotencyKey: `pb17-qh4a-${RUN}` }));
    await cancel("Q", ap[`Q14:30${D}`]);
    const m0 = mark();
    await tickA(at(DX, "23:00"));
    const lq = (await logs(`booking:waitlistOpen:${E.QA}:%`)).map((r) => [r.dedupeKey === KEY(E.QA, stf("Q", 1), D, "14:30"), r.status]);
    const lqb = (await logs(`booking:waitlistOpen:${E.QB}:%`)).length;
    const b2 = await quiet(() => BK.bookAppointment(ctxOf("Q"), { serviceId: svc("Q"), staffId: stf("Q", 1), dateStr: D, startMin: hm("14:30"), channel: "STAFF", customerName: nm, customerPhone: newPhone(), idempotencyKey: `pb17-qh4b-${RUN}` }));
    await tickA(at(DY, "08:00"));
    const p = [pushesTo(PTY.QA.ext, m0).length, pushesTo(PTY.QB.ext, m0).length];
    const after = (await logs(`booking:waitlistOpen:${E.QA}:%`)).map((r) => r.status);
    const quietSeen = lq.some(([k, s2]) => k === true && s2 === "SKIPPED_QUIET");
    return [!!(b?.ok && b2?.ok && quietSeen && lqb === 0 && p[0] === 0 && p[1] === 0 && !after.slice(1).includes("SENT")), { p, lq, lqb, after, b: b?.ok, b2: b2?.ok }];
  });

  // ═══════════════ R5 · ช่วงว่างขยาย ═══════════════
  console.log("\n── R5 ช่วงว่างขยาย (ใบสั่ง R5: ขยาย = ข้อเสนอเดิม ไม่ส่งซ้ำ) ──");
  await okJoin("R5a", "R5", "R5a", { staffId: stf("R5", 1) });
  await okJoin("R5b", "R5", "R5b", { staffId: stf("R5", 1), dateStr: D2 });
  const m5 = mark();
  await cancel("R5", ap[`R514:00${D2}`]); await tickA();
  await cancel("R5", ap[`R514:30${D2}`]); await tickA();
  await run("R5-1", "MAJOR", "ขยายไปทางหลัง (14:00 แล้ว 14:30) ⇒ R5b 1 ข้อความ (ตัวควบคุม)", async () => [pushesTo(PTY.R5b.ext, m5).length === 1, { p: pushesTo(PTY.R5b.ext, m5).length }]);
  await cancel("R5", ap[`R514:30${D}`]); await tickA();
  await cancel("R5", ap[`R514:00${D}`]); await tickA();
  await run("R5-2", "MINOR", "ขยายไปทางเช้า (14:30 แล้ว 14:00) ⇒ R5a ควรได้ 1 ข้อความตาม R5", async () => {
    const n = pushesTo(PTY.R5a.ext, m5).length;
    return [n === 1, { pushes: n, keys: (await logs(`booking:waitlistOpen:${E.R5a}:%`)).map((r) => [r.dedupeKey.split(":").slice(-1)[0], r.status]) }];
  });

  // ═══════════════ EX · หมดอายุ / แบ่งหน้า ═══════════════
  console.log("\n── EX หมดอายุ / แบ่งหน้า ──");
  const past = new Date(Date.now() - 3_600_000);
  const expIds: string[] = [];
  for (let i = 0; i < 13; i++) { const e = rid(`exp${i}`); expIds.push(e); await ins("BookingWaitlist", { id: e, tenantId: id.tA, unitId: i % 2 ? U.G1.id : U.W.id, partyId: PTY.G1_0.id, serviceId: svc("G1"), staffId: null, dateStr: TODAY, fromMin: 0, toMin: 1, status: "ACTIVE", expiresAt: new Date(past.getTime() + (i % 3) * 1000), updatedAt: new Date() }); }
  const expB = rid("expB");
  await ins("BookingWaitlist", { id: expB, tenantId: id.tB, unitId: U.B.id, partyId: PTY.PB.id, serviceId: svc("B"), staffId: null, dateStr: TODAY, fromMin: 0, toMin: 1, status: "ACTIVE", expiresAt: past, updatedAt: new Date() });
  const exR: any[] = await quiet(() => Promise.all([0, 1, 2].map(() => plat.runWaitlistTick(new Date(), { tenantIds: [id.tA], pageSize: 5 }))));
  await run("EX-1", "MAJOR", "13 แถวหมดอายุ · tick ×3 ซ้อน (pageSize 5) ⇒ EXPIRED ครบ 13 · ผลรวม expired = 13 (ไม่นับซ้ำ) · ร้าน B ไม่ถูกแตะ", async () => {
    const st = await q(`SELECT status, count(*)::int AS n FROM "BookingWaitlist" WHERE id = ANY($1::text[]) GROUP BY status`, [expIds]);
    const b = await wlr(expB);
    const sum = exR.reduce((s, r) => s + (r?.expired ?? 0), 0);
    return [st.length === 1 && st[0].status === "EXPIRED" && st[0].n === 13 && sum === 13 && b?.status === "ACTIVE", { st, sum, b: b?.status }];
  });
  // กลุ่ม (unitId, dateStr): G1 มี 7 แถว ACTIVE วันเดียว (ไม่มี LINE) · G2 (id เรียงถัดไป) 1 แถว ⇒ pageSize 5 ต้องไปถึง G2
  for (let i = 0; i < 7; i++) await ins("BookingWaitlist", { id: rid(`g1${i}`), tenantId: id.tA, unitId: U.G1.id, partyId: PTY[`G1_${i}`].id, serviceId: svc("G1"), staffId: null, dateStr: D, fromMin: 600, toMin: 660, status: "ACTIVE", expiresAt: at(D, "11:00"), updatedAt: new Date(), createdAt: new Date(Date.now() - 10_000 + i) });
  const g2 = rid("g2");
  await ins("BookingWaitlist", { id: g2, tenantId: id.tA, unitId: U.G2.id, partyId: PTY.G2.id, serviceId: svc("G2"), staffId: null, dateStr: D, fromMin: 600, toMin: 660, status: "ACTIVE", expiresAt: at(D, "11:00"), updatedAt: new Date() });
  const mG = mark();
  const gR: any = await tickA(new Date(), { pageSize: 5 });
  await run("EX-2", "MAJOR", "แบ่งหน้ากลุ่ม (distinct + take): G1 7 แถววันเดียว + G2 1 แถว · pageSize 5 ⇒ G2 ได้ข้อความในรอบเดียว", async () => {
    const p = pushesTo(PTY.G2.ext, mG).length;
    const g1Logs = (await q(`SELECT count(*)::int AS n FROM "ServiceMessageLog" WHERE "tenantId" = $1 AND "unitId" = $2 AND "messageKey" = 'waitlistOpen'`, [id.tA, U.G1.id]))[0].n;
    return [p === 1, { p, g1Logs, tick: gR }];
  });
  await run("EX-3", "MINOR", "signal ที่ abort แล้ว ⇒ tick คืนทันที ไม่แตะแถว", async () => {
    const ac = new AbortController(); ac.abort();
    const e = rid("expS");
    await ins("BookingWaitlist", { id: e, tenantId: id.tA, unitId: U.W.id, partyId: PTY.X.id, serviceId: svc("W"), staffId: null, dateStr: TODAY, fromMin: 0, toMin: 1, status: "ACTIVE", expiresAt: past, updatedAt: new Date() });
    const r: any = await quiet(() => plat.runWaitlistTick(new Date(), { tenantIds: [id.tA], signal: ac.signal }));
    const st = (await wlr(e))?.status;
    await pool.query(`DELETE FROM "BookingWaitlist" WHERE id = $1`, [e]);
    return [st === "ACTIVE" && r.expired === 0 && r.scanned === 0, { r, st }];
  });

  // ═══════════════ NS · ไม่มาซ้ำ ═══════════════
  console.log("\n── NS ไม่มาซ้ำ (ขอบ N-1/N/N+1 · คนละวัน/หน่วย · ขอบหน้าต่าง) ──");
  const T0 = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const ns: Record<string, Pty> = {};
  for (const k of ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8", "K9", "K10"]) ns[k] = await mkParty(k, id.tA, true);
  const NS = (k: string, u: UK, d: number[]) => Promise.all(d.map((x) => insAppt(u, { startAt: new Date(T0.getTime() - x), status: "NO_SHOW", partyId: ns[k].id, phone: ns[k].phone })));
  await NS("K1", "R", [DAY]);
  const k2 = await NS("K2", "R", [DAY, 30 * DAY]);
  await NS("K3", "R", [DAY, 2 * DAY, 60 * DAY]);
  await NS("K4", "R", [DAY + 3_600_000, DAY + 7_200_000]);
  await NS("K5", "R", [DAY]); await NS("K5", "W", [DAY]);
  await NS("K6", "R", [0, 90 * DAY]);            // startAt = now (นับ) · startAt = now−90 วันพอดี (ไม่นับ — ขอบเปิด)
  await NS("K10", "R", [0, 90 * DAY - 1]);       // now−90 วัน+1ms (นับ)
  await NS("K7", "P", [DAY, 100 * DAY]);
  await NS("K8", "P", [DAY, 100 * DAY, 179 * DAY]);
  await NS("K9", "P", [DAY, 2 * DAY, 3 * DAY, 4 * DAY]);
  const RN = (k: string, u: UK, ch = "LINE", phone?: string) => quiet(() => rule.repeatNoShowOf(ctxOf(u), ch === "LINE" ? { channel: "LINE", partyId: ns[k].id } : { channel: ch, phone: phone ?? ns[k].phone }, { now: T0 })).then(keep);
  await run("NS-1", "BLOCKER", "R (2/90 บังคับมัดจำ): 1 ⇒ null · 2 ⇒ REQUIRE_DEPOSIT · 3 ⇒ REQUIRE_DEPOSIT · 2 ครั้งวันเดียวกัน ⇒ นับ 2 · หน่วยอื่นไม่นับ", async () => {
    const r = await Promise.all([RN("K1", "R"), RN("K2", "R"), RN("K3", "R"), RN("K4", "R"), RN("K5", "R")]);
    const got = r.map((x: any) => [x.count, x.action]);
    return [J(got) === J([[1, null], [2, "REQUIRE_DEPOSIT"], [3, "REQUIRE_DEPOSIT"], [2, "REQUIRE_DEPOSIT"], [1, null]]), got];
  });
  await run("NS-2", "BLOCKER", "ขอบหน้าต่าง (R15): startAt = now นับ · now−90 วันพอดีไม่นับ · now−90 วัน+1ms นับ", async () => {
    const r = await Promise.all([RN("K6", "R"), RN("K10", "R")]);
    const got = r.map((x: any) => [x.count, x.action]);
    return [J(got) === J([[1, null], [2, "REQUIRE_DEPOSIT"]]), got];
  });
  await run("NS-3", "BLOCKER", "P (3/180 ต้องโทร): 2 ⇒ null · 3 ⇒ PHONE_ONLY · 4 ⇒ PHONE_ONLY", async () => {
    const r = await Promise.all([RN("K7", "P"), RN("K8", "P"), RN("K9", "P")]);
    const got = r.map((x: any) => [x.count, x.action]);
    return [J(got) === J([[2, null], [3, "PHONE_ONLY"], [4, "PHONE_ONLY"]]), got];
  });
  await run("NS-4", "BLOCKER", "ONLINE ด้วยเบอร์ K2 รูปแบบต่าง (+66 / ขีด / 0066) ⇒ นับ 2 เท่ากัน · เบอร์ใหม่ ⇒ 0", async () => {
    const p = ns.K2.phone;
    const fmts = [p, `+66 ${p.slice(1)}`, `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`, `0066${p.slice(1)}`];
    const r: any[] = await Promise.all(fmts.map((f) => RN("K2", "R", "ONLINE", f)));
    const z: any = await RN("K2", "R", "ONLINE", "0899999999");
    return [r.every((x) => x.count === 2 && x.action === "REQUIRE_DEPOSIT") && z.count === 0, { r: r.map((x) => x.count), z: z.count }];
  });
  await run("NS-5", "BLOCKER", "ทางจองจริง: P K8 ⇒ bookOnline LINE REPEAT_NO_SHOW (ข้อความกลาง ไม่มีคำว่า 'ไม่มา') · join waitlist ⇒ REPEAT_NO_SHOW · STAFF ⇒ จองได้", async () => {
    const a: any = await quiet(() => ON.bookOnline(refOf("P"), { serviceId: svc("P"), staffId: stf("P", 1), dateStr: D, startMin: hm("11:00"), who: who("K8"), idempotencyKey: `pb17-ns5a-${RUN}` }, { ip: nextIp() }));
    await book("P", 1, "14:00"); await book("P", 1, "14:30"); await book("P", 2, "14:00"); await book("P", 2, "14:30");
    const j: any = await wjoin("P", "K8", {});
    const s: any = await quiet(() => BK.bookAppointment(ctxOf("P"), { serviceId: svc("P"), staffId: stf("P", 1), dateStr: D, startMin: hm("11:30"), channel: "STAFF", customerName: ns.K8.name, customerPhone: ns.K8.phone, idempotencyKey: `pb17-ns5s-${RUN}` }));
    return [a.code === "REPEAT_NO_SHOW" && !/ไม่มา/.test(a.reason) && j.code === "REPEAT_NO_SHOW" && s?.ok === true, { a: [a.code, a.reason], j: j.code, s: s?.ok }];
  });
  await run("NS-6", "BLOCKER", "R K2 bookOnline LINE ⇒ PENDING มัดจำ > 0 + snapshot.noShowRule · ONLINE เบอร์ K2 ⇒ มัดจำ > 0 · K1 (N-1) ⇒ พฤติกรรมเดิม (ไม่มี noShowRule)", async () => {
    const a: any = await quiet(() => ON.bookOnline(refOf("R"), { serviceId: svc("R"), staffId: stf("R", 1), dateStr: D, startMin: hm("11:00"), who: who("K2"), idempotencyKey: `pb17-ns6a-${RUN}` }, { ip: nextIp() }));
    const b: any = await quiet(() => ON.bookOnline(refOf("R"), { serviceId: svc("R"), staffId: stf("R", 1), dateStr: D, startMin: hm("12:00"), name: "ทดสอบ", phone: `+66 ${ns.K2.phone.slice(1)}`, idempotencyKey: `pb17-ns6b-${RUN}` }, { ip: nextIp() }));
    const c: any = await quiet(() => ON.bookOnline(refOf("R"), { serviceId: svc("R"), staffId: stf("R", 1), dateStr: D, startMin: hm("13:00"), who: who("K1"), idempotencyKey: `pb17-ns6c-${RUN}` }, { ip: nextIp() }));
    const snaps = await q(`SELECT "startAt", status::text AS status, "depositSatang", "policySnapshot"->'noShowRule' AS r FROM "Appointment" WHERE "unitId" = $1 AND "startAt" = ANY($2::timestamp[]) ORDER BY "startAt"`, [U.R.id, [iso(at(D, "11:00")), iso(at(D, "12:00")), iso(at(D, "13:00"))]]);
    const ok = a?.ok && b?.ok && c?.ok && snaps.length === 3 && snaps[0].depositSatang > 0 && snaps[0].status === "PENDING" && snaps[0].r?.action === "REQUIRE_DEPOSIT" && snaps[1].depositSatang > 0 && snaps[2].r === null;
    return [!!ok, { a: a?.code ?? a?.depositSatang, b: b?.code ?? b?.depositSatang, c: c?.code ?? c?.depositSatang, snaps: snaps.map((s) => [s.status, s.depositSatang, s.r]) }];
  });
  await run("NS-7", "MAJOR", "excuseNoShow ×6 พร้อมกันบนนัดเดียว ⇒ ok 1 ครั้ง + duplicated 5 · audit 1 แถว · K2 นับเหลือ 1 ⇒ null ทันที", async () => {
    const rs: any[] = await Promise.all(Array.from({ length: 6 }, () => quiet(() => rule.excuseNoShow({ tenantId: id.tA, actorUserId: id.uOwner }, { unitId: U.R.id, appointmentId: k2[0], reason: "ป่วยกะทันหัน" }))));
    const au = await q(`SELECT after FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'booking.no_show.excused' AND "targetId" = $2`, [id.tA, k2[0]]);
    const s: any = await RN("K2", "R");
    return [rs.filter((r) => r.ok && !r.duplicated).length === 1 && rs.filter((r) => r.duplicated).length === 5 && au.length === 1 && s.count === 1 && s.action === null, { rs, au: au.length, s }];
  });
  await run("NS-8", "BLOCKER", "excuseNoShow ข้ามร้าน/สาขา: เจ้าของร้าน A ส่ง unitId ของร้าน B / นัดของหน่วย P ผ่าน unitId R ⇒ NOT_FOUND คำตอบเดียว · นัดไม่ถูกแก้", async () => {
    const pAppt = (await q(`SELECT id FROM "Appointment" WHERE "unitId" = $1 AND status::text = 'NO_SHOW' LIMIT 1`, [U.P.id]))[0].id;
    const a: any = await quiet(() => rule.excuseNoShow({ tenantId: id.tA, actorUserId: id.uOwner }, { unitId: U.B.id, appointmentId: pAppt, reason: "x" }));
    const b: any = await quiet(() => rule.excuseNoShow({ tenantId: id.tA, actorUserId: id.uOwner }, { unitId: U.R.id, appointmentId: pAppt, reason: "x" }));
    const c: any = await quiet(() => rule.excuseNoShow({ tenantId: id.tB, actorUserId: id.uOwner }, { unitId: U.P.id, appointmentId: pAppt, reason: "x" }));
    const s = (await q(`SELECT "policySnapshot"->'noShow' AS n FROM "Appointment" WHERE id = $1`, [pAppt]))[0].n;
    return [[a, b, c].every((r) => r.code === "NOT_FOUND" && r.reason === a.reason) && s === null, { a, b, c, s }];
  });

  // ═══════════════ PI · PII ═══════════════
  console.log("\n── PI ข้อมูลส่วนบุคคล ──");
  await run("PI-1", "BLOCKER", "ไม่มีเบอร์/ชื่อใน: แถว BookingWaitlist · ServiceMessageLog · OutboxEvent · AuditLog ของร้านทดสอบ · ผลคืน · console", async () => {
    const dump = J([
      await q(`SELECT * FROM "BookingWaitlist" WHERE "tenantId" = ANY($1::text[])`, [[id.tA, id.tB]]),
      await q(`SELECT * FROM "ServiceMessageLog" WHERE "tenantId" = ANY($1::text[]) AND "messageKey" = 'waitlistOpen'`, [[id.tA, id.tB]]),
      await q(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type LIKE 'booking.%' AND type <> 'booking.created'`, [[id.tA, id.tB]]),
      await q(`SELECT after FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND action LIKE 'booking.no_show%'`, [[id.tA, id.tB]]),
      RET, captured,
    ]);
    const ph = phoneLeak(dump); const nm = nameLeak(dump);
    return [ph.length === 0 && nm.length === 0, { ph: ph.slice(0, 3), nm: nm.slice(0, 3) }];
  });
  await run("PI-2", "MAJOR", "ข้อความ waitlist ถึงลูกค้ามีชื่อของตัวเองเท่านั้น · ไม่มีเบอร์ใด ๆ · ไม่มีชื่อคนอื่น · ไม่มีคำขอออกนอกเครื่อง", async () => {
    const bad: any[] = [];
    for (const k of Object.keys(PTY)) for (const r of pushesTo(PTY[k].ext)) {
      const t = msgText(r);
      if (phoneLeak(t).length || nameLeak(t).some((n) => n !== PTY[k].name)) bad.push({ k, t: t.slice(0, 120) });
    }
    return [bad.length === 0 && BLOCKED.length === 0, { bad: bad.slice(0, 3), blocked: BLOCKED.slice(0, 3) }];
  });
} catch (e) {
  console.log(`🔴 probe ล้ม: ${errMsg(e)}`);
  exitCode = 2;
} finally {
  try { await cleanup([id.tA, id.tB]); await cleanupUsers(); await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`%10.18.${IPN}.%`]); } catch (e) { console.log(`  ⚠️ cleanup ${errMsg(e)}`); }
  const left = await q(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]).catch(() => [{ n: -1 }]);
  const fail = results.filter((r) => !r.ok && r.sev !== "INFO");
  const info = results.filter((r) => !r.ok && r.sev === "INFO");
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, pass: results.filter((r) => r.ok).length, fail: fail.map((r) => `${r.id}:${r.sev}`), info: info.map((r) => r.id), leftover: left[0]?.n })}`);
  await pool.end().catch(() => {});
  await prisma.$disconnect?.().catch(() => {});
  server.close();
  process.exit(exitCode || (fail.length ? 1 : 0));
}
