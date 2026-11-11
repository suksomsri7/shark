// probe-b9-b — reviewer B (โจมตีด้วย probe จริง หลายโพรเซส) ของ WO SVC B.9 · ไม่ใช่ข้อสอบ · ไม่แก้ src/
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b9-b.mts
// ร้านชั่วคราว slug `qc-svc-b9p-*` · id `svcb9p_*` · ผู้ใช้ `qc-svc-b9p-*@qc.invalid` · ล้างใน finally (+ กวาดค้างตอนเริ่ม)
// 🔴 ไม่ยิง LINE จริง: ตัวจำลอง 127.0.0.1 + LINE_API_BASE + ครอบ fetch (นอกเครื่อง = บล็อก) · ลูกโพรเซสได้ LINE_API_BASE เดียวกัน
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { writeFileSync, rmSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

loadSvcQcEnv("probe-b9-b");
if (process.env.CI) { console.error("ห้าม CI"); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error("APP_ENV=production"); process.exit(4); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ═══ ตัวจำลอง LINE + ครอบ fetch (ก่อนโหลดโมดูล) ═══
type FakeReq = { method: string; path: string; json: Any };
const FAKE: FakeReq[] = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: Any = null;
    try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
    FAKE.push({ method: req.method ?? "", path, json });
    res.writeHead(200, { "content-type": "application/json" });
    if (path === "/v2/bot/message/push" || path === "/v2/bot/message/reply") res.end(JSON.stringify({ sentMessages: [{ id: `fm${FAKE.length}` }] }));
    else if (path.startsWith("/v2/bot/profile/")) res.end(JSON.stringify({ displayName: "probe", userId: path.split("/").pop() }));
    else res.end("{}");
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const FAKE_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.LINE_API_BASE = FAKE_BASE;
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by probe" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const mark = () => FAKE.length;
const pushes = (m0: number, m1 = FAKE.length) => FAKE.slice(m0, m1).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push");
const pushesTo = (ext: string, m0: number) => pushes(m0).filter((r) => r.json?.to === ext);
const js = (v: unknown) => { try { return JSON.stringify(v) ?? ""; } catch { return String(v); } };

// ═══ โมดูล ═══
const NT: Any = await import("@/lib/platform/booking-notify");
const LK: Any = await import("@/lib/platform/booking-line-link");
const RM: Any = await import("@/lib/platform/booking-remote");
const PB: Any = await import("@/lib/platform/postback-routes");
const LN: Any = await import("@/lib/modules/booking/queue-line");
const BK: Any = await import("@/lib/modules/booking/service");
const SET: Any = await import("@/lib/core/settings");
const CHAT: Any = await import("@/lib/modules/chat");
const prisma: Any = (await import("@/lib/core/db")).prisma;

type V = "HOLD" | "BREACH" | "INFO";
const res: { id: string; v: V; sev: string; msg: string }[] = [];
const rec = (id: string, v: V, sev: string, msg: string) => { res.push({ id, v, sev, msg }); console.log(`${v === "HOLD" ? "✅" : v === "BREACH" ? "🔴" : "ℹ️ "} [${id}] ${v}${v === "BREACH" ? `(${sev})` : ""} — ${msg}`); };
const errOf = (e: unknown) => (e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown) => { try { return JSON.stringify(v)?.slice(0, 300); } catch { return String(v); } };
class Breach extends Error {}
const must = (c: boolean, m: string) => { if (!c) throw new Breach(m); };
const probe = async (id: string, sev: string, fn: () => Promise<string | void>) => {
  try { const m = await fn(); rec(id, "HOLD", sev, m || "ok"); } catch (e) { rec(id, "BREACH", sev, e instanceof Breach ? e.message : `throw: ${errOf(e)}`); }
};

// ═══ ฐาน ═══
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, p: unknown[] = []) => (await pool.query<T>(sql, p)).rows;
const colCache = new Map<string, { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>();
const rid = (p: string) => `svcb9p_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function insertRow(table: string, vals: Record<string, unknown>) {
  if (!colCache.has(table)) colCache.set(table, await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]) as never);
  const v: Record<string, unknown> = { ...vals };
  for (const c of colCache.get(table)!) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : null;
  }
  const k = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${k.map((x) => `"${x}"`).join(",")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(",")})`, k.map((x) => v[x]));
}
const SLUG = "qc-svc-b9p-";
async function cleanup(ids: string[]) {
  if (ids.length) {
    const tables = (await q<{ table_name: string }>(`SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.table_name);
    let pending = tables;
    for (let pass = 0; pass < 8 && pending.length; pass++) {
      const failed: string[] = [];
      for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [ids]); } catch { failed.push(t); } }
      pending = failed;
    }
    if (pending.length) console.log(`⚠️ ลบไม่ได้: ${pending.join(",")}`);
    try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [ids]); } catch (e) { console.log(`⚠️ Tenant ${errOf(e)}`); }
    for (const t of ids) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1 OR key LIKE $2`, [`chat-link:${t}:%`, `bq:ticket:${t}:%`]).catch(() => {});
  }
  await pool.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${SLUG}%`]).catch(() => {});
  await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${SLUG}%`]).catch(() => {});
  await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${SLUG}%`]).catch(() => {});
  await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1 OR key LIKE '%svcb9p\\_%'`, [`bq:remote:${SLUG}%`]).catch((e) => console.log(`⚠️ bucket ${errOf(e)}`));
}
async function sv(tenantId: string, unitId: string, key: string, value: unknown) {
  await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId: unitId } });
  await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId: unitId, value, setById: "probe-b9-b" } });
}
const svClear = (tenantId: string, unitId: string, key: string) => prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId: unitId } });
const parkOutbox = async (tenantIds: string[]) => { await pool.query(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, [tenantIds]); };

// ═══ เวลา ═══
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ds: string, n: number) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const at = (ds: string, hm: string, sec = 0) => { const [y, m, d] = ds.split("-").map(Number); const [h, mi] = hm.split(":").map(Number); return new Date(Date.UTC(y, m - 1, d) + (h * 60 + mi - 420) * 60_000 + sec * 1000); };
const hmMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const D = addDays(bkkToday(), 6);
const RUN = Date.now().toString(36);
const RAND = randomBytes(3).toString("hex");
const T = (k: string) => `svcb9p_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"), uA: T("uA"), uR: T("uR"), uH: T("uH"), uOff: T("uOff"), uB: T("uB"), uRB: T("uRB"),
  oA: T("oA"), oB: T("oB"),
};
const cA = { tenantId: ids.tA, unitId: ids.uA };
const cR = { tenantId: ids.tA, unitId: ids.uR };
const cH = { tenantId: ids.tA, unitId: ids.uH };
const cB = { tenantId: ids.tB, unitId: ids.uB };
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.oA };
const OWNER_B = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.oB };
const SV: Record<string, string> = {}; // หน่วย → บริการ
const STF: Record<string, string[]> = {}; // หน่วย → ช่าง
const HIDE_SVC = `บริการลับเฉพาะ${RAND}`;
const usedPhones = new Set<string>();
const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!usedPhones.has(p)) { usedPhones.add(p); return p; } } };
const PHONES: string[] = [];
const NAMES: Record<string, string> = {}; // คีย์นัด → ชื่อ
const dashed = (p: string) => `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
const phoneLeak = (s: string) => PHONES.filter((p) => s.includes(p) || s.includes(dashed(p)) || s.includes(`66${p.slice(1)}`));
const ap: Record<string, string> = {};
const party: Record<string, string> = {};
const phoneOf: Record<string, string> = {};
const conn: Record<string, string> = {};
const K: Record<string, { id: string; ext: string; partyId: string | null; owner: string | null }> = {};
const pbCtx = (k: string, tenantId = ids.tA, c = "cA") => ({ tenantId, connectionId: conn[c], chatContactId: K[k].id, partyId: K[k].partyId, replyToken: null });
const contactRow = async (k: string) => prisma.chatContact.findFirst({ where: { id: K[k].id }, select: { partyId: true } });

// ═══ ลูกโพรเซส ═══
type ChildOut = { code: number | null; result: Record<string, unknown>[] | null; raw: string };
async function runChildren(specs: Record<string, unknown>[]): Promise<ChildOut[]> {
  const go = `/tmp/svc-b9p-go-${RUN}-${Math.random().toString(36).slice(2, 8)}`;
  let ready = 0;
  const ps = specs.map((s) => new Promise<ChildOut>((resolve) => {
    const c = spawn("pnpm", ["exec", "tsx", join(ROOT, "scripts/probe-b9-b-child.mts"), JSON.stringify({ ...s, go })], { cwd: ROOT, env: { ...process.env, LINE_API_BASE: FAKE_BASE } });
    let buf = "";
    c.stdout.on("data", (d: Buffer) => { buf += d; if (/READY/.test(String(d))) ready++; });
    c.stderr.on("data", (d: Buffer) => { buf += d; });
    c.on("close", (code) => {
      const m = /RESULT (.*)$/m.exec(buf);
      let result: Record<string, unknown>[] | null = null;
      try { result = m ? JSON.parse(m[1]) : null; } catch { result = null; }
      resolve({ code, result, raw: buf.slice(-500) });
    });
  }));
  const t0 = Date.now();
  while (ready < specs.length && Date.now() - t0 < 240_000) await new Promise((r) => setTimeout(r, 50));
  writeFileSync(go, "go");
  const out = await Promise.all(ps);
  rmSync(go, { force: true });
  return out;
}
const flat = (outs: ChildOut[]) => outs.flatMap((o) => o.result ?? [{ throw: `child ล้ม code=${o.code} ${o.raw.replace(/\s+/g, " ").slice(-300)}` }]);
const anyThrow = (rs: Record<string, unknown>[]) => rs.filter((r) => "throw" in r || /P2028|P2034|40P01|deadlock/i.test(fmt(r)));

console.log(`(probe-b9-b · วันฉาก D ${D} · ตัวจำลอง ${FAKE_BASE})`);
let exitCode = 0;
let NF = "";
try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาดค้าง ${stale.length})`); }
  await cleanup(stale);

  // ═══════════ ข้อมูล ═══════════
  const SLUGS: Record<string, string> = {};
  for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) { SLUGS[id] = `${SLUG}${n}-${RUN}`; await insertRow("Tenant", { id, name: `probe ${n}`, slug: SLUGS[id], updatedAt: new Date() }); }
  const units: [string, string, string][] = [[ids.uA, ids.tA, "a"], [ids.uR, ids.tA, "r"], [ids.uH, ids.tA, "h"], [ids.uOff, ids.tA, "off"], [ids.uB, ids.tB, "b"], [ids.uRB, ids.tB, "rb"]];
  for (const [id, t, n] of units) {
    SLUGS[id] = `b9p-${n}-${RUN}`;
    await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name: `สาขา ${n}`, slug: SLUGS[id], updatedAt: new Date() });
    for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: new Date() });
    SV[id] = T(`svc${n}`);
    await insertRow("BookingService", { id: SV[id], tenantId: t, unitId: id, name: id === ids.uH ? HIDE_SVC : `ตัดผม ${n}`, durationMin: 30, priceSatang: 20000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
    STF[id] = [];
    for (let s = 0; s < (id === ids.uR ? 3 : 2); s++) {
      const sid = T(`st${n}${s}`); STF[id].push(sid);
      await insertRow("BookingStaff", { id: sid, tenantId: t, unitId: id, name: `ช่าง${n}${s}`, sortOrder: s, createdAt: new Date(Date.now() - 600_000 + s * 1000), updatedAt: new Date() });
    }
  }
  for (const [uid, k, t] of [[ids.oA, "oa", ids.tA], [ids.oB, "ob", ids.tB]] as const) {
    await insertRow("User", { id: uid, email: `${SLUG}${k}-${RUN}@qc.invalid`, name: `probe ${k}`, updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mb"), userId: uid, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
  }
  for (const [t, u, a] of units.map(([u, t]) => [t, u, t === ids.tA ? OWNER : OWNER_B] as const)) {
    const r = await SET.applyTemplate(a, { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    if (!r?.ok) throw new Error(`applyTemplate ${u} ${fmt(r)}`);
  }
  const sysA = (await prisma.appSystem.create({ data: { tenantId: ids.tA, type: "CHAT", name: `probe-b9-a-${RUN}` } })).id;
  const sysB = (await prisma.appSystem.create({ data: { tenantId: ids.tB, type: "CHAT", name: `probe-b9-b-${RUN}` } })).id;
  const mkConn = async (k: string, t: string, sys: string, basic: string) => {
    conn[k] = (await prisma.chatChannelConnection.create({ data: { tenantId: t, systemId: sys, type: "LINE", displayName: `probe-${k}-${RUN}`, externalAccountId: `probe-${k}-${RUN}`, credentials: { channelAccessToken: `pb9tok${k}${RAND}`, channelSecret: `pb9sec${k}${RAND}` }, meta: { basicId: basic } } })).id;
  };
  await mkConn("cA", ids.tA, sysA, "@pb9a"); await mkConn("cA2", ids.tA, sysA, "@pb9a2"); await mkConn("cB", ids.tB, sysB, "@pb9b");
  for (const [t, u] of units.map(([u, t]) => [t, u] as const)) {
    await sv(t, u, "messaging.lineConnectionId", t === ids.tA ? conn.cA : conn.cB);
    await sv(t, u, "messaging.quietHours", { start: "21:00", end: "08:00" });
    await sv(t, u, "messaging.channelOrder", ["LINE", "WEB_LINK"]);
    await sv(t, u, "booking.queue.walkInCloseWaitMin", 600);
  }
  await sv(ids.tA, ids.uOff, "booking.queue.singleLine", false);
  await sv(ids.tA, ids.uH, "booking.notify.hideServiceName", true);

  // นัด BOOKED (STAFF) — คีย์ → [หน่วย, วัน, เวลา, ช่าง idx]
  const BOOK: Record<string, [string, string, string, number]> = {
    V: [ids.uA, D, "15:00", 0], O: [ids.uA, D, "16:00", 0], M: [ids.uA, D, "17:00", 0], L: [ids.uA, D, "14:00", 1], E: [ids.uA, D, "18:00", 1],
    C: [ids.uA, D, "18:30", 0], C2: [ids.uA, D, "19:00", 0], Q: [ids.uA, addDays(D, 1), "10:00", 0],
    H1: [ids.uH, D, "15:00", 0], H2: [ids.uH, D, "16:00", 0], B1: [ids.uB, D, "15:00", 0],
  };
  for (const [k, [u, ds, st, si]] of Object.entries(BOOK)) {
    const t = u === ids.uB ? ids.tB : ids.tA;
    phoneOf[k] = newPhone(); PHONES.push(phoneOf[k]);
    NAMES[k] = `คุณ${k}ลับสุด${RAND}`;
    const r = await BK.bookAppointment({ tenantId: t, unitId: u }, { serviceId: SV[u], staffId: STF[u][si], dateStr: ds, startMin: hmMin(st), channel: "STAFF", customerName: NAMES[k], customerPhone: phoneOf[k], idempotencyKey: `b9p-${RUN}-${k}` });
    if (!r?.ok) throw new Error(`book ${k} ${fmt(r)}`);
    ap[k] = r.id;
    if (r.status === "PENDING") await BK.setAppointmentStatus(t, u, r.id, "CONFIRMED");
    const row = (await q<{ partyId: string | null }>(`SELECT "partyId" FROM "Appointment" WHERE id = $1`, [r.id]))[0];
    if (!row?.partyId) throw new Error(`no party ${k}`);
    party[k] = row.partyId;
  }
  const contact = async (k: string, t: string, sys: string, c: string, partyId: string | null, owner: string | null) => {
    const ext = `Ub9p${k.toLowerCase()}${RAND}${RUN}`;
    const row = await prisma.chatContact.create({ data: { tenantId: t, systemId: sys, channel: "LINE", channelConnectionId: conn[c], externalUserId: ext, partyId, lang: "th" } });
    K[k] = { id: row.id, ext, partyId, owner };
  };
  for (const k of ["V", "O", "M", "L", "E", "Q", "H1", "H2"]) await contact(`k${k}`, ids.tA, sysA, "cA", party[k], k);
  await contact("kB1", ids.tB, sysB, "cB", party.B1, "B1");
  await contact("kV2", ids.tA, sysA, "cA2", party.V, "V"); // คนเดียวกันบน OA อื่นของร้านเดียวกัน
  for (const k of ["kAtk", "kF1", "kF2", "kF3", "kF4", "kHw"]) await contact(k, ids.tA, sysA, "cA", null, null);
  await contact("kFB", ids.tB, sysB, "cB", null, null);
  await parkOutbox([ids.tA, ids.tB]);
  NF = LK.BOOKING_POSTBACK_NOT_FOUND;
  if (typeof NF !== "string" || !NF) throw new Error("ไม่มี BOOKING_POSTBACK_NOT_FOUND");
  console.log("(ข้อมูลพร้อม)");

  const apState = async (keys: string[]) => q<{ id: string; s: string; t: string | null; ci: Date | null }>(`SELECT id, status::text s, "queueTicketId" t, "checkedInAt" ci FROM "Appointment" WHERE id = ANY($1)`, [keys.map((k) => ap[k])]);
  const lateRows = async (k: string) => (await q<{ n: number }>(`SELECT count(*)::int n FROM "AuditLog" WHERE "tenantId" = ANY($1) AND action = 'booking.customer.running_late' AND "targetId" = $2`, [[ids.tA, ids.tB], ap[k]]))[0].n;

  // ═══════════ 1. postback ปลอม ═══════════
  console.log("\n── 1. postback ปลอม ──");
  await probe("PB-1", "BLOCKER", async () => {
    const before = js(await apState(["V", "O", "B1", "M"]));
    const now = at(D, "14:50");
    const bad: string[] = [];
    const long100 = "x".repeat(100), long101 = "x".repeat(101), long199 = "y".repeat(199);
    const datas: [string, string, string][] = [ // [ชื่อ, ผู้ติดต่อ, data]
      ...(["checkin", "late", "reschedule", "defer"] as const).map((a) => [`kO→V ${a}`, "kO", `booking.${a}?a=${ap.V}`] as [string, string, string]),
      ...(["checkin", "late", "reschedule"] as const).map((a) => [`kO→ร้านB ${a}`, "kO", `booking.${a}?a=${ap.B1}`] as [string, string, string]),
      ["kB1(ร้าน B)→V checkin", "kB1", `booking.checkin?a=${ap.V}`], ["kB1→V late", "kB1", `booking.late?a=${ap.V}`],
      ["kV2 (Party V แต่ OA อื่น)→V checkin", "kV2", `booking.checkin?a=${ap.V}`], ["kV2→V late", "kV2", `booking.late?a=${ap.V}`],
      ["kAtk(ไม่มี Party)→V", "kAtk", `booking.checkin?a=${ap.V}`],
      ["id สุ่ม", "kO", `booking.checkin?a=svcb9p_nope_${RAND}`], ["id ว่าง", "kO", "booking.checkin?a="], ["ไม่มี a", "kO", "booking.checkin"],
      ["id 100 ตัว", "kO", `booking.checkin?a=${long100}`], ["id 101 ตัว", "kO", `booking.checkin?a=${long101}`], ["id 199", "kO", `booking.late?a=${long199}`],
      ["id ผิดรูป sql", "kO", `booking.checkin?a=${encodeURIComponent("' OR 1=1 --")}`], ["id unicode", "kO", `booking.checkin?a=${encodeURIComponent("นัด")}`],
      ["action ไม่รู้จัก (นัดตัวเอง)", "kO", `booking.cancel?a=${ap.O}`], ["action ไม่รู้จัก zzz", "kO", `booking.zzz?a=${ap.V}`], ["action ซ้อนจุด", "kO", `booking.checkin.now?a=${ap.O}`],
      ["action ตัวใหญ่", "kO", `booking.Checkin?a=${ap.O}`], ["a ซ้ำ (ของตัวเอง+V)", "kO", `booking.checkin?a=${ap.O}&a=${ap.V}`], ["param เกิน", "kO", `booking.late?a=${ap.V}&t=${ids.tA}&party=${party.V}`],
      ["__proto__", "kO", `booking.checkin?__proto__=x&a=${ap.V}`], ["โดเมน dorm", "kO", `dorm.checkin?a=${ap.V}`],
      ["checkin นัด O ด้วยไอดีตัวพิมพ์ใหญ่", "kO", `booking.checkin?a=${ap.O.toUpperCase()}`],
    ];
    const replies: string[] = [];
    for (const [n, k, d] of datas) {
      const viaDispatch = await PB.dispatchPostback(pbCtx(k, k === "kB1" ? ids.tB : ids.tA, k === "kB1" ? "cB" : k === "kV2" ? "cA2" : "cA"), d);
      replies.push(js(viaDispatch));
      if (viaDispatch?.handled && viaDispatch.reply?.text !== NF) bad.push(`${n}: ${fmt(viaDispatch.reply)}`);
      if (viaDispatch?.handled && viaDispatch.reply && Object.keys(viaDispatch.reply).length !== 1) bad.push(`${n}: คำตอบมีฟิลด์เกิน ${fmt(viaDispatch.reply)}`);
      // ตรงไม่ผ่านตัวแจก (ตัวจัดการต้องไม่เชื่อ parse เท่านั้น)
      const evt = PB.parsePostbackData(d);
      if (evt) {
        try { const r = await LK.onBookingPostback(pbCtx(k, k === "kB1" ? ids.tB : ids.tA, k === "kB1" ? "cB" : k === "kV2" ? "cA2" : "cA"), evt, { now }); if (r?.text !== NF) bad.push(`ตรง ${n}: ${fmt(r)}`); }
        catch (e) { if (!/BAD_POSTBACK_DATA/.test(errOf(e))) bad.push(`ตรง ${n} throw ${errOf(e)}`); }
      }
    }
    // ctx ประกอบเอง: tenant ผิดกับ connection (ทางนี้ webhook ไม่สร้าง แต่ตัวจัดการต้องไม่เชื่อ)
    for (const [n, ctx] of [["tenantB+connA+kO", { ...pbCtx("kO"), tenantId: ids.tB }], ["tenantA+connB+kB1", { ...pbCtx("kB1", ids.tB, "cB"), tenantId: ids.tA }], ["partyId ปลอม=V", { ...pbCtx("kAtk"), partyId: party.V, connectionId: conn.cA2 }]] as const) {
      const r = await LK.onBookingPostback(ctx, PB.parsePostbackData(`booking.late?a=${ap.V}`), { now });
      if (r?.text !== NF) bad.push(`${n}: ${fmt(r)}`);
    }
    const after = js(await apState(["V", "O", "B1", "M"]));
    if (before !== after) bad.push(`สถานะ/บัตรเปลี่ยน ${after}`);
    for (const k of ["V", "B1", "O"]) if (await lateRows(k)) bad.push(`audit running_late ของ ${k}`);
    const leak = replies.join("|");
    if (phoneLeak(leak).length || Object.values(NAMES).some((x) => leak.includes(x))) bad.push("คำตอบมีชื่อ/เบอร์");
    // ตัวควบคุมบวก: เจ้าของจริงกด reschedule ⇒ ไม่ใช่ข้อความกลาง
    const pos = await PB.dispatchPostback(pbCtx("kV"), `booking.reschedule?a=${ap.V}`);
    must(pos?.handled && pos.reply?.text && pos.reply.text !== NF, `ตัวควบคุมบวกล้ม ${fmt(pos)}`);
    must(bad.length === 0, bad.join(" | "));
    const unhandled = replies.filter((r) => r.includes('"handled":false')).length;
    return `${datas.length} แบบ + ctx ประกอบเอง 3 ⇒ ข้อความกลางทุกไบต์ (handled:false ${unhandled} แบบผิดรูป/ยาว) · ไม่เปลี่ยนสถานะ/ไม่มี audit · ไม่มีชื่อ/เบอร์`;
  });

  // ═══════════ 2. ข้ามร้าน/สิทธิ์ทุกทางเข้า ═══════════
  console.log("\n── 2. ข้ามร้าน ──");
  await probe("XT-1", "BLOCKER", async () => {
    const bad: string[] = [];
    const m0 = mark();
    for (const [n, ctx] of [["ร้าน B/หน่วย B", cB], ["ร้าน B/หน่วย A", { tenantId: ids.tB, unitId: ids.uA }], ["ร้าน A/หน่วย R", cR], ["ว่าง", { tenantId: "", unitId: "" }]] as const) {
      for (const kind of ["confirmation", "reminder", "delayed"]) {
        const r = await NT.notifyBooking(ctx, { appointmentId: ap.O, kind, offsetMin: 1440 }, { now: at(addDays(D, -1), "16:00") });
        if (r?.status !== "NOT_FOUND" || r?.dedupeKey !== null) bad.push(`notify ${n}/${kind}=${fmt(r)}`);
      }
      const i = await LK.issueBookingLinkCode(ctx, { appointmentId: ap.O }, { now: new Date() });
      if (i?.ok || i?.code !== "NOT_FOUND") bad.push(`issue ${n}=${fmt(i)}`);
    }
    // event ข้ามร้าน/หน่วย
    for (const [n, e] of [
      ["tenant B", { id: rid("e"), tenantId: ids.tB, type: "booking.created", payload: { appointmentId: ap.O, kind: "BOOKED", unitId: ids.uA }, unitId: ids.uA }],
      ["หน่วยอื่น", { id: rid("e"), tenantId: ids.tA, type: "booking.created", payload: { appointmentId: ap.O, kind: "BOOKED" }, unitId: ids.uR }],
      ["unitId null + payload หน่วย B", { id: rid("e"), tenantId: ids.tA, type: "booking.created", payload: { appointmentId: ap.O, kind: "BOOKED", unitId: ids.uB }, unitId: null }],
      ["payload ไม่ใช่ object", { id: rid("e"), tenantId: ids.tA, type: "booking.created", payload: "x", unitId: ids.uA }],
      ["type อื่น", { id: rid("e"), tenantId: ids.tA, type: "booking.cancelled", payload: { appointmentId: ap.O, kind: "BOOKED" }, unitId: ids.uA }],
    ] as const) { try { await NT.onBookingNotifyEvent(e); } catch (x) { bad.push(`event ${n} throw ${errOf(x)}`); } }
    // tick tenantIds ร้าน B / ค่าแปลก
    await NT.runBookingNotifyTick(at(D, "14:00"), { tenantIds: [ids.tB] });
    const odd = await NT.runBookingNotifyTick(at(D, "14:00"), { tenantIds: [] });
    const odd2 = await NT.runBookingNotifyTick(at(D, "14:00"), { tenantIds: ["' OR 1=1 --", null as never, 5 as never] });
    if (odd.units || odd2.units) bad.push(`tick tenantIds ว่าง/แปลก ไล่ ${odd.units}/${odd2.units} หน่วย`);
    const toA = pushes(m0).filter((p) => Object.values(K).some((k) => k.ext === p.json?.to && !["kB1", "kFB"].some((x) => K[x].ext === k.ext)));
    if (toA.length) bad.push(`ส่งถึงผู้ติดต่อร้าน A ${toA.length}`);
    // resolveBookingParty / onBookingLinked ข้ามร้าน
    const tkV = await LN.createWalkIn(cA, { serviceId: SV[ids.uA], staffId: null, channel: "STAFF" }, { now: at(D, "10:00") });
    if (!tkV?.ok) bad.push(`walk-in ${fmt(tkV)}`);
    for (const [n, c, a] of [["APPT ร้านB", { tenantId: ids.tB }, { purpose: "APPOINTMENT", refId: ap.V }], ["TICKET ร้านB", { tenantId: ids.tB }, { purpose: "QUEUE_TICKET", refId: tkV.ticketId }], ["DORM", { tenantId: ids.tA }, { purpose: "DORM_LEASE", refId: ap.V }], ["APPT ลงด้วย ticketId", { tenantId: ids.tA }, { purpose: "APPOINTMENT", refId: tkV.ticketId }]] as const) {
      const p = await LK.resolveBookingParty(c, a);
      if (p !== null) bad.push(`resolveParty ${n}=${p}`);
    }
    for (const [n, a] of [["TICKET ร้าน A", { purpose: "QUEUE_TICKET", refId: tkV.ticketId, partyId: null, resolvedPartyId: null, partyMismatch: false }], ["APPT V", { purpose: "APPOINTMENT", refId: ap.V, partyId: null, resolvedPartyId: party.V, partyMismatch: false }]] as const) {
      const r = await LK.onBookingLinked(pbCtx("kFB", ids.tB, "cB"), a, { now: at(D, "10:01") });
      if (r?.text !== PB.LINK_OK_TEXT) bad.push(`onLinked ร้าน B ⇐ ${n}: ${fmt(r)}`);
    }
    must(bad.length === 0, bad.join(" | "));
    return "notify/issue/event/tick/resolveParty/onLinked ข้ามร้าน/หน่วย ⇒ NOT_FOUND/null/LINK_OK_TEXT · ไม่มี push ถึงร้าน A · tenantIds ว่าง/แปลก = ไม่ไล่ร้านอื่น";
  });

  // ═══════════ 3. รหัสผูก ═══════════
  console.log("\n── 3. รหัสผูก LINE ──");
  const issueFor = async (k: string) => { const r = await LK.issueBookingLinkCode(cA, { appointmentId: ap[k] }, { now: new Date() }); if (!r?.ok) throw new Error(`issue ${k} ${fmt(r)}`); return r.code as string; };
  await probe("LK-1", "BLOCKER", async () => {
    const code = await issueFor("C");
    const outs = await runChildren(["kF1", "kF2"].map((k) => ({ op: "consume", ctx: { tenantId: ids.tA, connectionId: conn.cA, chatContactId: K[k].id, replyToken: null }, code })));
    const rs = flat(outs);
    must(anyThrow(rs).length === 0, `throw ${fmt(anyThrow(rs))}`);
    const linked = rs.filter((r) => r.linked === true);
    const used = await q<{ u: string }>(`SELECT "usedByChatContactId" u FROM "ChatLinkCode" WHERE "tenantId" = $1 AND "refId" = $2 AND "usedAt" IS NOT NULL`, [ids.tA, ap.C]);
    const parties = [(await contactRow("kF1"))?.partyId, (await contactRow("kF2"))?.partyId].filter((x) => x === party.C).length;
    must(linked.length === 1 && used.length === 1 && parties === 1, `2 โพรเซสพร้อมกัน: linked ${linked.length} · แถวใช้ ${used.length} · ผูก Party ${parties}`);
    const loserRep = rs.find((r) => r.linked !== true) as Any;
    must(loserRep?.reply?.text === PB.LINK_FAILED_TEXT, `ผู้แพ้ได้ ${fmt(loserRep)}`);
    // ใช้ซ้ำ
    const again = await PB.handleLinkCodeText({ tenantId: ids.tA, connectionId: conn.cA, chatContactId: K.kF3.id, replyToken: null }, code);
    must(again?.linked === false && again?.reply?.text === PB.LINK_FAILED_TEXT, `ใช้ซ้ำ ${fmt(again)}`);
    return `2 โพรเซสใช้รหัสเดียว ⇒ ผูก 1 · ผู้แพ้/ใช้ซ้ำ = LINK_FAILED_TEXT`;
  });
  await probe("LK-2", "BLOCKER", async () => {
    const bad: string[] = [];
    // ข้ามร้าน/ข้าม OA ก่อน (ต้องไม่กินรหัส) แล้วตัวควบคุมบวกใช้ได้
    const code = await issueFor("C2");
    const tries: [string, Any][] = [
      ["ร้าน B ctx + OA B", { tenantId: ids.tB, connectionId: conn.cB, chatContactId: K.kFB.id, replyToken: null }],
      ["ร้าน B ctx + OA A", { tenantId: ids.tB, connectionId: conn.cA, chatContactId: K.kF4.id, replyToken: null }],
      ["ร้าน A + OA อื่น (cA2)", { tenantId: ids.tA, connectionId: conn.cA2, chatContactId: K.kV2.id, replyToken: null }],
      ["ร้าน A + ผู้ติดต่อร้าน B", { tenantId: ids.tA, connectionId: conn.cA, chatContactId: K.kFB.id, replyToken: null }],
    ];
    for (const [n, c] of tries) { const r = await PB.handleLinkCodeText(c, code); if (r?.linked !== false || r?.reply?.text !== PB.LINK_FAILED_TEXT) bad.push(`${n}: ${fmt(r)}`); }
    const ok = await PB.handleLinkCodeText({ tenantId: ids.tA, connectionId: conn.cA, chatContactId: K.kF4.id, replyToken: null }, `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`);
    if (ok?.linked !== true) bad.push(`ตัวควบคุม: เจ้าของรหัสผูกไม่ได้หลังถูกลองข้ามร้าน ${fmt(ok)}`);
    // หมดอายุ
    const code2 = await issueFor("C2");
    await q(`UPDATE "ChatLinkCode" SET "expiresAt" = now() - interval '1 minute' WHERE "tenantId" = $1 AND "refId" = $2 AND "usedAt" IS NULL`, [ids.tA, ap.C2]);
    const ex = await PB.handleLinkCodeText({ tenantId: ids.tA, connectionId: conn.cA, chatContactId: K.kF3.id, replyToken: null }, code2);
    if (ex?.linked !== false || ex?.reply?.text !== PB.LINK_FAILED_TEXT) bad.push(`หมดอายุ: ${fmt(ex)}`);
    // issueBookingLinkCode: ttl ของนัดในอดีต/งานจบ
    const past = await LK.issueBookingLinkCode(cA, { appointmentId: ap.V }, { now: at(addDays(D, 3), "10:00") });
    rec("LK-2i", "INFO", "-", `ออกรหัสนัดที่ผ่านไปแล้ว 3 วัน (ยัง CONFIRMED) ⇒ ${past?.ok ? `ok ttl ถึง ${new Date(past.expiresAt).toISOString()}` : past?.code}`);
    must(bad.length === 0, bad.join(" | "));
    return "ข้ามร้าน/ข้าม OA/ผู้ติดต่อร้านอื่น ⇒ LINK_FAILED_TEXT ไม่กินรหัส (เจ้าของใช้ต่อได้) · หมดอายุ ⇒ LINK_FAILED_TEXT";
  });

  // ═══════════ 4. ไปไม่ทัน ซ้อน 3 โพรเซส ═══════════
  console.log("\n── 4. ไปไม่ทัน / เช็กอิน ──");
  await probe("PB-2", "MAJOR", async () => {
    const outs = await runChildren([0, 1, 2].map(() => ({ op: "postback", ctx: pbCtx("kL"), data: `booking.late?a=${ap.L}`, n: 3, now: at(D, "13:50").toISOString() })));
    const rs = flat(outs);
    must(anyThrow(rs).length === 0, `throw ${fmt(anyThrow(rs))}`);
    const nfs = rs.filter((r) => r.text === NF);
    const n = await lateRows("L");
    const st = (await apState(["L"]))[0];
    must(n === 1 && nfs.length === 0 && st.s === "CONFIRMED" && !st.t, `audit ${n} แถว · ตอบข้อความกลาง ${nfs.length} · สถานะ ${st.s}/${st.t}`);
    const au = await q<{ a: string }>(`SELECT coalesce("after"::text,'') a FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2`, [ids.tA, ap.L]);
    must(!phoneLeak(js(au)).length && !js(au).includes(NAMES.L), "audit มีชื่อ/เบอร์");
    return `3 โพรเซส × 3 ครั้ง ⇒ audit 1 แถว · ตอบรับทราบ 9 ครั้ง · สถานะเดิม`;
  });
  await probe("PB-3", "MINOR", async () => {
    // เช็กอินผ่าน LINE ล่วงหน้า 3 วัน (ปุ่มอยู่ในข้อความยืนยันไม่ได้ แต่ postback ประกอบเองได้)
    const r = await LK.onBookingPostback(pbCtx("kE"), PB.parsePostbackData(`booking.checkin?a=${ap.E}`), { now: at(addDays(D, -3), "18:00") });
    const st = (await apState(["E"]))[0];
    must(st.s === "CONFIRMED" && !st.t, `เช็กอินล่วงหน้า 3 วันได้: ${st.s} บัตร ${st.t} คำตอบ ${fmt(r)}`);
    const r2 = await LK.onBookingPostback(pbCtx("kE"), PB.parsePostbackData(`booking.late?a=${ap.E}`), { now: at(addDays(D, -3), "18:00") });
    rec("PB-3i", "INFO", "-", `"ไปไม่ทัน" ล่วงหน้า 3 วัน ⇒ ${r2?.text === NF ? "ข้อความกลาง" : "รับทราบ + audit"} (${(await lateRows("E"))} แถว) — ไม่มีกรอบเวลา`);
    return `ล่วงหน้า 3 วัน ⇒ ${fmt(r?.text)} ไม่เช็กอิน`;
  });

  // ═══════════ 5. ส่งข้อความ ═══════════
  console.log("\n── 5. ส่งข้อความ ──");
  const PRE_MSG = mark();
  await probe("MS-1", "BLOCKER", async () => {
    // นัด STAFF ไม่ยิง booking.created (B.7 ยิงของออนไลน์) ⇒ ประกอบ event รูปเดียวกับ walk-in (แบบข้อสอบ E-2)
    const evt = { id: rid("evt"), tenantId: ids.tA, type: "booking.created", payload: { appointmentId: ap.M, unitId: ids.uA, staffId: STF[ids.uA][0], kind: "BOOKED", channel: "STAFF", serviceId: SV[ids.uA] }, systemId: null, unitId: ids.uA };
    const m0 = mark();
    const outs = await runChildren([0, 1, 2].map(() => ({ op: "event", evt, n: 2 })));
    const rs = flat(outs);
    must(anyThrow(rs).length === 0, `throw ${fmt(anyThrow(rs))}`);
    const ps = pushesTo(K.kM.ext, m0);
    const logs = await q<{ s: string }>(`SELECT status s FROM "ServiceMessageLog" WHERE "tenantId" = $1 AND "dedupeKey" LIKE $2`, [ids.tA, `booking:confirmation:${ap.M}:%`]);
    must(ps.length === 1 && logs.length === 1 && logs[0].s === "SENT", `consumer 3 โพรเซส × 2 ⇒ push ${ps.length} · log ${fmt(logs)}`);
    return "outbox event เดียว · consumer 3 โพรเซส × 2 ⇒ push 1 · log 1 SENT";
  });
  await probe("MS-2", "BLOCKER", async () => {
    const m0 = mark();
    const now = at(D, "13:00").toISOString();
    const outs = await runChildren([0, 1, 2].map(() => ({ op: "tick", tenantIds: [ids.tA], n: 2, now })));
    const rs = flat(outs);
    must(anyThrow(rs).length === 0, `throw ${fmt(anyThrow(rs))}`);
    const ps = pushes(m0);
    const per = new Map<string, number>();
    for (const p of ps) per.set(String(p.json?.to), (per.get(String(p.json?.to)) ?? 0) + 1);
    const dup = [...per.entries()].filter(([, n]) => n > 1);
    const sentWins = rs.reduce((s, r) => s + ["reminder", "nearTurn", "delayed", "rebookInvite"].reduce((x, k) => x + Number((r as Any)[k] ?? 0), 0), 0);
    const m1 = mark();
    await NT.runBookingNotifyTick(new Date(at(D, "13:00").getTime() + 30_000), { tenantIds: [ids.tA] });
    const again = pushes(m1).length;
    must(dup.length === 0 && again === 0 && ps.length >= 3 && sentWins === ps.length, `tick 3 โพรเซส × 2 นาทีเดียวกัน ⇒ push ${ps.length} (ซ้ำต่อคน ${fmt(dup)}) · ผลรวม reminder ${sentWins} · รอบซ้ำ +${again}`);
    return `tick 3 โพรเซส × 2 (D 13:00) ⇒ ${ps.length} ข้อความ 1 ต่อคน · ผลรวม SENT ที่คืน = ${sentWins} · รอบ 13:00:30 = 0`;
  });
  await probe("MS-3", "MAJOR", async () => {
    const m0 = mark();
    await NT.runBookingNotifyTick(at(D, "22:00"), { tenantIds: [ids.tA] });
    await NT.runBookingNotifyTick(at(D, "23:30"), { tenantIds: [ids.tA] });
    const quiet = pushesTo(K.kQ.ext, m0).length;
    const direct = await NT.notifyBooking(cA, { appointmentId: ap.Q, kind: "reminder", offsetMin: 720 }, { now: at(D, "22:00") });
    await NT.runBookingNotifyTick(at(addDays(D, 1), "08:01"), { tenantIds: [ids.tA] });
    await NT.runBookingNotifyTick(at(addDays(D, 1), "08:02"), { tenantIds: [ids.tA] });
    const after = pushesTo(K.kQ.ext, m0).length;
    // bypass ห้ามใช้กับ delayed/noShowRebook/rebookInvite — noShow ตอน 23:00
    await q(`UPDATE "Appointment" SET status = 'NO_SHOW' WHERE id = $1`, [ap.C2]);
    const ns = await NT.notifyBooking(cA, { appointmentId: ap.C2, kind: "noShowRebook" }, { now: at(D, "23:00") });
    must(quiet === 0 && direct.status === "SKIPPED_QUIET" && after === 1 && (ns.status === "SKIPPED_QUIET" || ns.status === "NO_CHANNEL"), `เวลาเงียบ: 22:00/23:30 push ${quiet} · ตรง ${direct.status} · 08:01–08:02 รวม ${after} · noShow 23:00 ${ns.status}`);
    return `22:00/23:30 ไม่ส่ง · ตรง = SKIPPED_QUIET (retryAt ${direct.retryAt ? new Date(direct.retryAt).toISOString() : "-"}) · 08:01 ส่ง 1 · 08:02 ไม่ซ้ำ · noShow 23:00 = ${ns.status}`;
  });
  await probe("MS-4", "MAJOR", async () => {
    const m0 = mark();
    for (const kind of ["confirmation", "reminder", "checkedIn", "ticketIssued", "delayed", "nearTurn", "yourTurn"]) await sv(ids.tA, ids.uH, `booking.msg.${kind}`, { th: `#HID ${kind} [{บริการ}] {ชื่อ} {เวลา} {เลขคิว}` });
    const out: string[] = [];
    out.push((await NT.notifyBooking(cH, { appointmentId: ap.H1, kind: "confirmation" }, { now: at(addDays(D, -2), "10:00") })).status);
    out.push((await NT.notifyBooking(cH, { appointmentId: ap.H1, kind: "reminder", offsetMin: 60 }, { now: at(D, "14:00") })).status);
    const ci = await LN.checkIn(cH, { appointmentId: ap.H1 }, { via: "STAFF", now: at(D, "14:50") });
    must(!!ci?.ok, `checkIn H1 ${fmt(ci)}`);
    await parkOutbox([ids.tA]);
    out.push((await NT.notifyBooking(cH, { appointmentId: ap.H1, kind: "checkedIn" }, { now: at(D, "14:51") })).status);
    out.push((await NT.notifyBooking(cH, { appointmentId: ap.H1, kind: "nearTurn" }, { now: at(D, "14:51") })).status);
    // walk-in + ผูกรหัส + onLinked reply
    const w = await LN.createWalkIn(cH, { serviceId: SV[ids.uH], staffId: null, channel: "STAFF" }, { now: at(D, "14:52") });
    must(!!w?.ok, `walk-in uH ${fmt(w)}`);
    await parkOutbox([ids.tA]);
    const code = (await LK.issueBookingLinkCode(cH, { appointmentId: w.appointmentId }, { now: new Date() }))?.code;
    const lk = await PB.handleLinkCodeText({ tenantId: ids.tA, connectionId: conn.cA, chatContactId: K.kHw.id, replyToken: null }, String(code));
    out.push((await NT.notifyBooking(cH, { appointmentId: w.appointmentId, kind: "ticketIssued" }, { now: at(D, "14:53") })).status);
    const texts = js(pushes(m0)) + js(lk?.reply);
    const hidden = !texts.includes(HIDE_SVC);
    const marker = (texts.match(/#HID/g) ?? []).length;
    // ตัวควบคุมบวก: ปิด hideServiceName ⇒ ชื่อบริการขึ้น
    await sv(ids.tA, ids.uH, "booking.notify.hideServiceName", false);
    const m1 = mark();
    const pc = await NT.notifyBooking(cH, { appointmentId: ap.H2, kind: "confirmation" }, { now: at(addDays(D, -2), "10:00") });
    const shown = js(pushes(m1)).includes(HIDE_SVC);
    await sv(ids.tA, ids.uH, "booking.notify.hideServiceName", true);
    must(hidden && marker >= 4 && shown, `hideServiceName: ซ่อน=${hidden} · ข้อความ #HID ${marker} (${out.join(",")} · linked ${lk?.linked}) · ตัวควบคุม (ปิด) แสดงชื่อ=${shown} ${pc.status}`);
    return `hideServiceName=true ⇒ ${marker} ข้อความ (${out.join(",")} + คำตอบผูก) ไม่มีชื่อบริการแม้แม่แบบใส่ {บริการ} · ปิด ⇒ แสดง (ตัวควบคุม)`;
  });
  await probe("MS-5", "BLOCKER", async () => {
    // ผู้ติดต่อที่ผูกรหัสนัด = เจ้าของนัดนั้น (ผู้รับตามสัญญา §3.1.2)
    const byId = new Map(Object.values(K).map((k) => [k.id, k] as const));
    for (const r of await q<{ u: string; ref: string }>(`SELECT "usedByChatContactId" u, "refId" ref FROM "ChatLinkCode" WHERE "tenantId" = $1 AND purpose = 'APPOINTMENT' AND "usedAt" IS NOT NULL`, [ids.tA])) {
      const key = Object.entries(ap).find(([, v]) => v === r.ref)?.[0];
      const c = byId.get(r.u);
      if (key && c && !c.owner) c.owner = key;
    }
    const extOwner = new Map(Object.values(K).map((k) => [k.ext, k.owner] as const));
    const bad: string[] = [];
    let n = 0;
    for (const p of pushes(PRE_MSG)) {
      n++;
      const owner = extOwner.get(String(p.json?.to));
      const s = js(p.json);
      const l = phoneLeak(s);
      if (l.length) bad.push(`เบอร์ใน push ถึง ${owner}`);
      for (const [k, nm] of Object.entries(NAMES)) if (k !== owner && s.includes(nm)) bad.push(`ชื่อ ${k} ใน push ถึง ${owner ?? "ไม่มีเจ้าของ"}`);
      if (/svcb9p_/.test(s.replace(/booking\.[a-z]+\?a=svcb9p_[A-Za-z0-9_]+/g, ""))) bad.push(`id ภายในหลุดใน push ถึง ${owner}`);
    }
    const sml = await q<{ k: string }>(`SELECT "dedupeKey" k FROM "ServiceMessageLog" WHERE "tenantId" = ANY($1)`, [[ids.tA, ids.tB]]);
    if (phoneLeak(js(sml)).length) bad.push("เบอร์ใน dedupeKey");
    must(bad.length === 0 && n > 0, `${bad.slice(0, 5).join(" | ")} (${n} push)`);
    return `${n} push ไม่มีเบอร์ใด/ชื่อคนอื่น · dedupeKey ไม่มีเบอร์`;
  });

  // ═══════════ 6. รับบัตรมือถือ ═══════════
  console.log("\n── 6. รับบัตรคิวมือถือ ──");
  const tSlug = SLUGS[ids.tA], rSlug = SLUGS[ids.uR];
  const NOW_R = at(D, "12:00");
  await sv(ids.tA, ids.uR, "booking.queue.remoteTicket", { enabled: true, maxWaitMin: null });
  const take = (phone: string, clientKey: string, o: { t?: string; u?: string; serviceId?: string; staffId?: string | null } = {}) =>
    RM.takeRemoteTicket(o.t ?? tSlug, o.u ?? rSlug, { serviceId: o.serviceId ?? SV[ids.uR], staffId: o.staffId ?? null, phone, clientKey: `${clientKey}-${RUN}` }, { now: NOW_R });
  const walkRows = async () => q<{ id: string; p: string; party: string | null }>(`SELECT id, "customerPhone" p, "partyId" party FROM "Appointment" WHERE "unitId" = $1 AND kind = 'WALKIN'`, [ids.uR]);

  await probe("RM-1", "BLOCKER", async () => {
    // ผู้โจมตีรู้แค่เบอร์ของ V (ลูกค้าเดิม มีนัดที่สาขา A · มี LINE ผูก Party) → รับบัตรมือถือด้วยเบอร์ V → ได้ lineLink → พิมพ์รหัสใน LINE ของตัวเอง
    const m0 = mark();
    const r = await take(phoneOf.V, "atk");
    must(!!r?.ok, `ตัวควบคุม: รับบัตรด้วยเบอร์ V ไม่ได้ ${fmt(r)} (ถ้าปฏิเสธ = ปลอดภัย)`);
    const row = (await walkRows()).find((w) => w.p && w.p.replace(/\D/g, "").endsWith(phoneOf.V.slice(1)));
    const sameParty = row?.party === party.V;
    const code = typeof r.lineLink === "string" ? decodeURIComponent(r.lineLink.split("?")[1] ?? "") : "";
    const lk = code ? await PB.handleLinkCodeText({ tenantId: ids.tA, connectionId: conn.cA, chatContactId: K.kAtk.id, replyToken: null }, code) : null;
    const atkParty = (await contactRow("kAtk"))?.partyId ?? null;
    K.kAtk.partyId = atkParty;
    const steps = [`walk-in ผูก Party ของ V=${sameParty}`, `lineLink=${!!r.lineLink}`, `ผูกรหัส=${lk?.linked}`, `ผู้ติดต่อผู้โจมตีได้ Party V=${atkParty === party.V}`];
    if (atkParty === party.V) {
      const lateRep = await PB.dispatchPostback(pbCtx("kAtk"), `booking.late?a=${ap.V}`);
      const ciRep = await PB.dispatchPostback(pbCtx("kAtk"), `booking.reschedule?a=${ap.V}`);
      const m1 = mark();
      const rem = await NT.notifyBooking(cA, { appointmentId: ap.V, kind: "reminder", offsetMin: 1440 }, { now: at(addDays(D, -1), "15:00") });
      const toAtk = pushesTo(K.kAtk.ext, m1);
      steps.push(`late ⇒ ${lateRep?.reply?.text === NF ? "ข้อความกลาง" : "สำเร็จ (audit " + (await lateRows("V")) + ")"}`, `reschedule ⇒ ${ciRep?.reply?.text === NF ? "ข้อความกลาง" : "สำเร็จ"}`, `เตือนนัด V (${rem.status}) ถึงผู้โจมตี ${toAtk.length} · มีชื่อ V=${js(toAtk).includes(NAMES.V)}`);
    }
    void m0;
    must(atkParty !== party.V, `ยึดตัวตนลูกค้าด้วยเบอร์: ${steps.join(" → ")}`);
    return steps.join(" → ");
  });
  await probe("RM-2", "MAJOR", async () => {
    const p = newPhone(); PHONES.push(p);
    const a = await take(p, "own1");
    must(!!a?.ok, `ตัวควบคุม ${fmt(a)}`);
    const variants = [`+66${p.slice(1)}`, `0066 ${p.slice(1)}`, dashed(p), ` ${p} `, `66-${p.slice(1)}`, `${p.slice(1)}`];
    const bad: string[] = [];
    const n0 = (await walkRows()).length;
    for (const [i, v] of variants.entries()) {
      const r = await take(v, `other${i}`);
      if (r?.ok || r?.code !== "ALREADY") bad.push(`${v}=${fmt(r)}`);
      if (/\/bq\/t\/|line\.me/.test(js(r))) bad.push(`${v} มีลิงก์`);
    }
    if ((await walkRows()).length !== n0) bad.push("สร้างแถวเพิ่ม");
    // เบอร์คนที่มีนัด BOOKED วันนี้ (ไม่ใช่ walk-in) ⇒ ได้บัตรใหม่ของตัวเอง ไม่ใช่ลิงก์บัตรของเขา
    const o = await take(phoneOf.O, "other9");
    rec("RM-2i", "INFO", "-", `เบอร์ลูกค้าที่มีนัด BOOKED (O) ⇒ ${o?.ok ? `ได้บัตรใหม่ ${o.ticketNumber} (ไม่ใช่บัตร/นัดของ O)` : o?.code}`);
    must(bad.length === 0, bad.join(" | "));
    return `เบอร์เดียวกัน ${variants.length} รูปแบบ (+66/0066/ขีด/ช่องว่าง/ไม่มี 0) ⇒ ALREADY ไม่มีลิงก์ ไม่สร้างแถว`;
  });
  await probe("RM-3", "MAJOR", async () => {
    const codes: string[] = [];
    for (let i = 0; i < 6; i++) { const p = newPhone(); PHONES.push(p); codes.push(String((await take(i % 2 ? p : "1", "rl1"))?.code ?? "ok")); }
    const sameClientOtherPhone = codes[5];
    const variants: string[] = [];
    for (const [n, ck] of [["ช่องว่างหน้า", ` rl1-${RUN}`], ["ช่องว่างท้าย", `rl1-${RUN} `], ["ตัวใหญ่", `RL1-${RUN}`], ["zero-width", `rl1-${RUN}\u200b`]] as const) variants.push(`${n}=${(await RM.takeRemoteTicket(tSlug, rSlug, { serviceId: SV[ids.uR], staffId: null, phone: "1", clientKey: ck }, { now: NOW_R }))?.code}`);
    const other = await take("1", "rl2");
    // หน้าต่าง: +10 นาที ใช้ได้อีก
    const later = await RM.takeRemoteTicket(tSlug, rSlug, { serviceId: SV[ids.uR], staffId: null, phone: "1", clientKey: `rl1-${RUN}` }, { now: new Date(NOW_R.getTime() + 600_001) });
    rec("RM-3i", "INFO", "-", `clientKey แปรรูป: ${variants.join(" · ")} · ผู้ใช้อื่น ⇒ ${other?.code} · ไม่มีเพดานรวมต่อหน่วย/ต่อเบอร์ (สลับ IP = ไม่จำกัด) · action ใช้ x-forwarded-for ตัวแรก (ปลอมได้ถ้า proxy ไม่เขียนทับ)`);
    must(sameClientOtherPhone === "RATE_LIMITED" && codes.slice(0, 5).every((c) => c !== "RATE_LIMITED") && later?.code !== "RATE_LIMITED", `ลำดับ ${codes.join(",")} · หลัง 10 นาที ${later?.code}`);
    return `ผู้ใช้เดียวสลับเบอร์ ⇒ ครั้งที่ 6 RATE_LIMITED (${codes.join(",")}) · ครบหน้าต่างใช้ได้อีก`;
  });
  await probe("RM-4", "MAJOR", async () => {
    const bad: string[] = [];
    // ร้าน/สาขา/ปิด ⇒ NOT_FOUND เดียวกัน · ไม่สร้างแถว
    const ref = await take(newPhone(), "x7a", { u: `nope-${RUN}` });
    const cases: [string, Any][] = [
      ["ร้านอื่น+สาขา A", { t: SLUGS[ids.tB] }], ["ร้าน A+สาขาของร้าน B", { u: SLUGS[ids.uRB] }], ["singleLine ปิด", { u: SLUGS[ids.uOff] }],
      ["slug ยาว", { u: "a".repeat(300) }], ["slug path", { u: "../" + rSlug }], ["slug ตัวใหญ่", { u: rSlug.toUpperCase() }], ["ร้านว่าง", { t: "" }],
    ];
    for (const [n, o] of cases) { const r = await take(newPhone(), `x7${n.length}${randomInt(1e6)}`, o); if (!isDeepStrictEqual(r, ref)) bad.push(`${n}=${fmt(r)}`); }
    await sv(ids.tA, ids.uH, "booking.queue.remoteTicket", { enabled: false, maxWaitMin: null });
    const off = await take(newPhone(), "x7off", { u: SLUGS[ids.uH] });
    if (!isDeepStrictEqual(off, ref)) bad.push(`ปิด remote=${fmt(off)}`);
    for (const [n, t, u] of [["nope", tSlug, `nope-${RUN}`], ["ปิด", tSlug, SLUGS[ids.uH]], ["off", tSlug, SLUGS[ids.uOff]], ["ร้านB", SLUGS[ids.tB], rSlug]] as const) if ((await RM.loadRemoteTicketForm(t, u, { now: NOW_R })) !== null) bad.push(`form ${n} ไม่ null`);
    // บริการ/ช่างข้ามหน่วย/ร้าน
    const n0 = (await walkRows()).length;
    for (const [n, o] of [["บริการสาขา A", { serviceId: SV[ids.uA] }], ["บริการร้าน B", { serviceId: SV[ids.uRB] }], ["ช่างสาขา A", { staffId: STF[ids.uA][0] }], ["ช่างร้าน B", { staffId: STF[ids.uRB][0] }]] as const) {
      const r = await take(newPhone(), `xs${randomInt(1e6)}`, o);
      if (r?.ok) bad.push(`${n} ได้บัตร`);
    }
    if ((await walkRows()).length !== n0) bad.push("สร้างแถวจากบริการ/ช่างข้ามหน่วย");
    // maxWaitMin
    await sv(ids.tA, ids.uR, "booking.queue.remoteTicket", { enabled: true, maxWaitMin: 1 });
    const tl = await take(newPhone(), "tl");
    await sv(ids.tA, ids.uR, "booking.queue.remoteTicket", { enabled: true, maxWaitMin: null });
    if (tl?.code !== "TOO_LONG") bad.push(`maxWaitMin=1 ⇒ ${fmt(tl)}`);
    if ((await walkRows()).length !== n0) bad.push("TOO_LONG สร้างแถว");
    const all = js(ref) + js(tl);
    if (phoneLeak(all).length) bad.push("ผลมีเบอร์");
    must(bad.length === 0, bad.join(" | "));
    return `${cases.length + 1} กรณี ⇒ ${fmt(ref)} ทุกไบต์ · ฟอร์ม null · บริการ/ช่างข้ามหน่วยไม่ได้บัตร · maxWaitMin ⇒ TOO_LONG ไม่สร้างแถว`;
  });
  await probe("RM-5", "MAJOR", async () => {
    const ph = Array.from({ length: 5 }, () => { const p = newPhone(); PHONES.push(p); return p; });
    const outs = await runChildren(ph.map((p, i) => ({ op: "remote", t: tSlug, u: rSlug, serviceId: SV[ids.uR], phone: p, clientKey: `cc${i}-${RUN}`, now: at(D, "12:05").toISOString() })));
    const rs = flat(outs);
    must(anyThrow(rs).length === 0, `throw ${fmt(anyThrow(rs))}`);
    const nums = rs.filter((r) => r.ok === true).map((r) => String(r.n));
    const allNums = (await q<{ n: string }>(`SELECT number n FROM "QueueTicket" WHERE "unitId" = $1`, [ids.uR])).map((r) => r.n);
    must(nums.length === 5 && new Set(nums).size === 5 && new Set(allNums).size === allNums.length, `5 โพรเซสต่างเบอร์ ⇒ ok ${nums.length} ${fmt(rs)} · เลขซ้ำในหน่วย ${allNums.length - new Set(allNums).size}`);
    return `5 โพรเซสพร้อมกัน ⇒ 5 บัตร เลขไม่ซ้ำ (${nums.join(",")})`;
  });
  await probe("RM-6", "MINOR", async () => {
    const p = newPhone(); PHONES.push(p);
    const outs = await runChildren([0, 1, 2, 3, 4].map((i) => ({ op: "remote", t: tSlug, u: rSlug, serviceId: SV[ids.uR], phone: p, clientKey: `same${i}-${RUN}`, now: at(D, "12:10").toISOString() })));
    const rs = flat(outs);
    must(anyThrow(rs).length === 0, `throw ${fmt(anyThrow(rs))}`);
    const okN = rs.filter((r) => r.ok === true).length;
    const rows = (await walkRows()).filter((w) => w.p.replace(/\D/g, "").endsWith(p.slice(1))).length;
    must(okN === 1 && rows === 1, `เบอร์เดียว 5 โพรเซสพร้อมกัน (สลับ IP) ⇒ ได้บัตร ${okN} ใบ · แถว ${rows} (ตรวจ ALREADY ไม่ atomic กับ createWalkIn) · ${rs.map((r) => r.ok ? "ok" : r.code).join(",")}`);
    return `เบอร์เดียว 5 โพรเซส ⇒ 1 ใบ อีก 4 ALREADY`;
  });
} catch (e) {
  console.log(`💥 setup/probe ล้ม: ${errOf(e)}`);
  exitCode = 1;
} finally {
  const ids2 = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  await cleanup([...new Set([...ids2, ids.tA, ids.tB])]);
  const left = await q<{ n: number }>(`SELECT (SELECT count(*) FROM "Tenant" WHERE slug LIKE $1)::int + (SELECT count(*) FROM "User" WHERE email LIKE $1)::int + (SELECT count(*) FROM "ChatRateBucket" WHERE key LIKE $2 OR key LIKE $3 OR key LIKE $4)::int + (SELECT count(*) FROM "Appointment" WHERE "tenantId" = ANY($5))::int n`, [`${SLUG}%`, `bq:remote:${SLUG}%`, `chat-link:${ids.tA}:%`, `chat-link:${ids.tB}:%`, [ids.tA, ids.tB]]);
  console.log(`\n(ล้างแล้ว · ค้าง ${left[0].n} · คำขอนอกเครื่องที่ถูกบล็อก ${BLOCKED.length})`);
  if (BLOCKED.length) rec("NET", "BREACH", "MAJOR", `มีคำขอออกนอกเครื่อง ${[...new Set(BLOCKED)].join(",")}`);
  await pool.end();
  await prisma.$disconnect().catch(() => {});
  globalThis.fetch = REAL_FETCH;
  server.close();
}
const b = res.filter((r) => r.v === "BREACH");
console.log(`\nPROBE_SUMMARY ${JSON.stringify({ hold: res.filter((r) => r.v === "HOLD").length, breach: b.length, breaches: b.map((x) => `${x.id}:${x.sev}`) })}`);
process.exit(exitCode);
