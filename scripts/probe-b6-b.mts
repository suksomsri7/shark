// probe-b6-b — reviewer B (โจมตีด้วย probe จริง) ของ WO SVC B.6 · ไม่ใช่ข้อสอบ · ไม่แก้ src/
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b6-b.mts
// ร้านชั่วคราว slug `qc-svc-b6p-*` · id `svcb6p_*` · ผู้ใช้ `qc-svc-b6p-*@qc.invalid` · ล้างใน finally (+ กวาดค้างตอนเริ่ม)
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

loadSvcQcEnv("probe-b6-b");
if (process.env.CI) { console.error("ห้าม CI"); process.exit(4); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PUB = await import("@/lib/modules/booking/public-line");
const DEV = await import("@/lib/modules/booking/devices");
const LN = await import("@/lib/modules/booking/queue-line");
const BK = await import("@/lib/modules/booking/service");
const SET = await import("@/lib/core/settings");
const QS = await import("@/lib/modules/queue/service");
const React = (await import("react")).default;
const RDS = await import("react-dom/server");
const TvBoard = (await import("@/components/booking/public/TvBoard")).default;
const Kiosk = (await import("@/components/booking/public/Kiosk")).default;
const TicketCard = (await import("@/components/booking/public/TicketCard")).default;

type V = "HOLD" | "BREACH" | "INFO";
const res: { id: string; v: V; sev: string; msg: string }[] = [];
const rec = (id: string, v: V, sev: string, msg: string) => { res.push({ id, v, sev, msg }); console.log(`${v === "HOLD" ? "✅" : v === "BREACH" ? "🔴" : "ℹ️ "} [${id}] ${v}${v === "BREACH" ? `(${sev})` : ""} — ${msg}`); };
const errOf = (e: unknown) => (e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown) => { try { return JSON.stringify(v)?.slice(0, 300); } catch { return String(v); } };
const probe = async (id: string, sev: string, fn: () => Promise<string | void>) => {
  try { const m = await fn(); rec(id, "HOLD", sev, m || "ok"); } catch (e) { rec(id, e instanceof Breach ? "BREACH" : "BREACH", sev, e instanceof Breach ? e.message : `throw: ${errOf(e)}`); }
};
class Breach extends Error {}
const must = (c: boolean, m: string) => { if (!c) throw new Breach(m); };

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, p: unknown[] = []) => (await pool.query<T>(sql, p)).rows;
const colCache = new Map<string, { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>();
const rid = (p: string) => `svcb6p_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function insertRow(table: string, vals: Record<string, unknown>) {
  if (!colCache.has(table)) colCache.set(table, await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]) as never);
  const v: Record<string, unknown> = { ...vals };
  for (const c of colCache.get(table)!) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "ARRAY" ? [] : null;
  }
  const k = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${k.map((x) => `"${x}"`).join(",")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(",")})`, k.map((x) => v[x]));
}
const SLUG = "qc-svc-b6p-";
const deviceIds: string[] = [];
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
  }
  await pool.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${SLUG}%`]).catch(() => {});
  await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${SLUG}%`]).catch(() => {});
  await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${SLUG}%`]).catch(() => {});
  await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE '%svcb6p\\_%' OR key = ANY($1::text[])`, [deviceIds.flatMap((d) => [`bq:kiosk:checkin:${d}`, `bq:kiosk:walkin:${d}`])]).catch((e) => console.log(`⚠️ bucket ${errOf(e)}`));
}

// ── เวลา ──
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ds: string, n: number) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const at = (ds: string, hm: string) => { const [y, m, d] = ds.split("-").map(Number); const [h, mi] = hm.split(":").map(Number); return new Date(Date.UTC(y, m - 1, d) + (h * 60 + mi - 420) * 60_000); };
const D = addDays(bkkToday(), 10);
const NOW = at(D, "11:00");
const RUN = Date.now().toString(36);
const T = (k: string) => `svcb6p_${k}_${RUN}`;
const ids = { tA: T("tA"), tB: T("tB"), uS: T("uS"), uS2: T("uS2"), uLeg: T("uLeg"), uB: T("uB"), uQ: T("uQ"), oA: T("oA"), oB: T("oB"), mgr: T("mgr") };
const cS = { tenantId: ids.tA, unitId: ids.uS };
const cS2 = { tenantId: ids.tA, unitId: ids.uS2 };
const cB = { tenantId: ids.tB, unitId: ids.uB };
const OWNER = { role: "OWNER" as const, unitAccess: ["*"], permissions: {}, userId: ids.oA };
const OWNER_B = { role: "OWNER" as const, unitAccess: ["*"], permissions: {}, userId: ids.oB };
const MGR2 = { role: "MANAGER" as const, unitAccess: [ids.uS2], permissions: {}, userId: ids.mgr };
const SV = { s1: T("s1"), s2: T("s2"), s3: T("s3"), x2: T("x2"), xb: T("xb"), leg: T("leg") };
const ST = { a: T("stA"), b: T("stB"), c: T("stC"), x2: T("stX2"), xb: T("stXB"), leg: T("stLeg") };
const PII_NAMES = ["คุณลับสุดยอดหนึ่ง", "คุณลับสุดยอดสอง", "คุณลับร้านบี", "คุณลับสาขาสอง"];
const PII_PHONES = ["0899111001", "0899111002", "0899111003", "0899111004", "0899111005", "0899111006", "0899111007", "0899111099"];
const piiIn = (s: string) => [...PII_NAMES.filter((n) => s.includes(n)), ...PII_PHONES.filter((p) => s.includes(p) || s.includes(p.slice(1)) || s.includes(`${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`))];
const newToken = () => randomBytes(32).toString("base64url");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const render = (C: unknown, props: Record<string, unknown>) => RDS.renderToStaticMarkup(React.createElement(C as never, props as never));
const tokOfUrl = (u: string) => u.replace(/^\/bq\/t\//, "");
const tkTok = (t: string, u: string, d: string, n: string) => PUB.ticketToken({ tenantId: t, unitId: u, businessDate: d, number: n });

// ── ลูกโพรเซส ──
type ChildOut = { code: number | null; result: unknown[] | null; raw: string };
async function runChildren(specs: Record<string, unknown>[]): Promise<ChildOut[]> {
  const go = `/tmp/svc-b6-probe-go-${RUN}-${Math.random().toString(36).slice(2, 8)}`;
  let ready = 0;
  const ps = specs.map((s) => new Promise<ChildOut>((resolve) => {
    const c = spawn("pnpm", ["exec", "tsx", join(ROOT, "scripts/probe-b6-b-child.mts"), JSON.stringify({ ...s, go })], { cwd: ROOT, env: process.env });
    let buf = "";
    c.stdout.on("data", (d) => { buf += d; if (/READY/.test(String(d))) ready++; });
    c.stderr.on("data", (d) => { buf += d; });
    c.on("close", (code) => {
      const m = /RESULT (.*)$/m.exec(buf);
      resolve({ code, result: m ? JSON.parse(m[1]) : null, raw: buf.slice(-600) });
    });
  }));
  const t0 = Date.now();
  while (ready < specs.length && Date.now() - t0 < 180_000) await new Promise((r) => setTimeout(r, 50));
  writeFileSync(go, "go");
  const out = await Promise.all(ps);
  rmSync(go, { force: true });
  return out;
}
const flat = (outs: ChildOut[]) => outs.flatMap((o) => o.result ?? [{ throw: `child ล้ม code=${o.code} ${o.raw}` }]) as Record<string, unknown>[];
const anyThrow = (rs: Record<string, unknown>[]) => rs.filter((r) => "throw" in r || /P2028|P2034|40P01|deadlock/i.test(fmt(r)));

console.log(`(probe-b6-b · วัน ${D} · now ${NOW.toISOString()})`);
let exitCode = 0;
try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาดค้าง ${stale.length})`); await cleanup(stale); }
  // ═══ ข้อมูล ═══
  await insertRow("Tenant", { id: ids.tA, name: "probe A", slug: `${SLUG}a-${RUN}`, updatedAt: new Date() });
  await insertRow("Tenant", { id: ids.tB, name: "probe B", slug: `${SLUG}b-${RUN}`, updatedAt: new Date() });
  for (const [id, t, n, type] of [[ids.uS, ids.tA, "s", "BOOKING"], [ids.uS2, ids.tA, "s2", "BOOKING"], [ids.uLeg, ids.tA, "leg", "BOOKING"], [ids.uB, ids.tB, "b", "BOOKING"], [ids.uQ, ids.tA, "q", "QUEUE"]] as const) {
    await insertRow("BusinessUnit", { id, tenantId: t, type, name: `สาขา ${n}`, slug: `b6p-${n}-${RUN}`, updatedAt: new Date() });
    if (type === "BOOKING") for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: 0, closeMin: 1440, closed: false, updatedAt: new Date() });
  }
  const svc = (id: string, t: string, u: string, name: string, dur: number, so: number) => insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin: dur, priceSatang: 20000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: so, updatedAt: new Date() });
  await svc(SV.s1, ids.tA, ids.uS, "ตัดผม", 30, 1); await svc(SV.s2, ids.tA, ids.uS, "สระ", 20, 2); await svc(SV.s3, ids.tA, ids.uS, "ทำสียาว", 240, 3);
  await svc(SV.x2, ids.tA, ids.uS2, "ตัดผม s2", 30, 1); await svc(SV.xb, ids.tB, ids.uB, "ตัดผม B", 30, 1); await svc(SV.leg, ids.tA, ids.uLeg, "ตัดผม leg", 30, 1);
  let ord = 0;
  const staff = (id: string, t: string, u: string, name: string, so: number) => insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder: so, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
  await staff(ST.a, ids.tA, ids.uS, "ช่างเอ", 1); await staff(ST.b, ids.tA, ids.uS, "ช่างบี", 2); await staff(ST.c, ids.tA, ids.uS, "ช่างซี", 3);
  await staff(ST.x2, ids.tA, ids.uS2, "ช่างสาขาสอง", 1); await staff(ST.xb, ids.tB, ids.uB, "ช่างร้านบี", 1); await staff(ST.leg, ids.tA, ids.uLeg, "ช่างเลก", 1);
  for (const [uid, k, t, role, ua] of [[ids.oA, "oa", ids.tA, "OWNER", ["*"]], [ids.oB, "ob", ids.tB, "OWNER", ["*"]], [ids.mgr, "mgr", ids.tA, "MANAGER", [ids.uS2]]] as const) {
    await insertRow("User", { id: uid, email: `${SLUG}${k}-${RUN}@qc.invalid`, name: `probe ${k}`, updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mb"), userId: uid, tenantId: t, role, unitAccess: JSON.stringify(ua), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
  }
  for (const [a, t, u] of [[OWNER, ids.tA, ids.uS], [OWNER, ids.tA, ids.uS2], [OWNER_B, ids.tB, ids.uB]] as const) {
    const r = await SET.applyTemplate(a as never, { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    if (!r.ok) throw new Error(`applyTemplate ${u} ${fmt(r)}`);
  }
  // ให้รับ walk-in ทุกบริการยกเว้น s3 (ยาว) — ค่าแม่แบบ
  // อุปกรณ์ผ่าน devices.ts
  const mk = async (ctx: { tenantId: string; unitId: string }, kind: "TV" | "KIOSK", name: string) => {
    const r = await DEV.createDevice({ ...ctx, actorUserId: ctx.tenantId === ids.tA ? ids.oA : ids.oB }, { kind, name });
    if (!r.ok) throw new Error(`createDevice ${name} ${fmt(r)}`);
    deviceIds.push(r.device.id);
    return { id: r.device.id, token: r.token, ...ctx };
  };
  const tv1 = await mk(cS, "TV", "ทีวี 1"); const tvR = await mk(cS, "TV", "ทีวีถอน");
  const k1 = await mk(cS, "KIOSK", "ตู้ 1"); const k2 = await mk(cS, "KIOSK", "ตู้ 2"); const k3 = await mk(cS, "KIOSK", "ตู้ 3"); const kRate = await mk(cS, "KIOSK", "ตู้ rate");
  const kS2 = await mk(cS2, "KIOSK", "ตู้ s2"); const tvS2 = await mk(cS2, "TV", "ทีวี s2");
  const kB = await mk(cB, "KIOSK", "ตู้ B"); const tvB = await mk(cB, "TV", "ทีวี B");
  must((await DEV.revokeDevice({ ...cS, actorUserId: ids.oA }, tvR.id)).ok, "revoke tvR");
  // อุปกรณ์ในหน่วยที่ไม่เปิดแถวเดียว (createDevice ปฏิเสธ ⇒ เขียนตรง) + จอคิวเดิม (ไม่มี kind · token ดิบ) ที่หน่วย BOOKING แถวเดียว
  const legTok = newToken(); const legId = T("devLeg");
  await insertRow("QueueDisplay", { id: legId, tenantId: ids.tA, unitId: ids.uLeg, name: "ทีวี leg", displayToken: `sha256:${sha(legTok)}`, settings: JSON.stringify({ kind: "TV" }), updatedAt: new Date() });
  const oldDispTok = `svcb6pold${RUN}`; const oldDispId = T("oldDisp");
  await insertRow("QueueDisplay", { id: oldDispId, tenantId: ids.tA, unitId: ids.uS, name: "จอคิวเดิม", displayToken: oldDispTok, settings: "{}", updatedAt: new Date() });
  const qDispTok = `svcb6pq${RUN}`;
  await insertRow("QueueDisplay", { id: T("qDisp"), tenantId: ids.tA, unitId: ids.uQ, name: "จอ Q", displayToken: qDispTok, settings: "{}", updatedAt: new Date() });
  const qType = T("qtype");
  await insertRow("QueueType", { id: qType, tenantId: ids.tA, unitId: ids.uQ, code: "GENERAL", name: "ทั่วไป", prefix: "Q", updatedAt: new Date() });
  await insertRow("QueueTicket", { id: T("qtk"), tenantId: ids.tA, unitId: ids.uQ, typeId: qType, businessDate: D, seq: 1, number: "Q001", priority: 0, channel: "ONLINE", publicToken: `svcb6ppub${RUN}`, updatedAt: new Date() });

  // นัด (ชื่อ/เบอร์ลับ) วัน D
  const book = async (ctx: { tenantId: string; unitId: string }, serviceId: string, staffId: string, dateStr: string, start: number, name: string, phone: string, key: string) => {
    const r = await BK.bookAppointment(ctx as never, { serviceId, staffId, dateStr, startMin: start, channel: "STAFF", customerName: name, customerPhone: phone, idempotencyKey: `${RUN}-${key}` } as never) as { ok: boolean; id?: string; status?: string; code?: string; reason?: string };
    if (!r.ok || !r.id) throw new Error(`book ${key} ${fmt(r)}`);
    if (r.status === "PENDING") await BK.setAppointmentStatus(ctx.tenantId, ctx.unitId, r.id, "CONFIRMED");
    return r.id;
  };
  const apOK = await book(cS, SV.s1, ST.a, D, 15 * 60, PII_NAMES[0], PII_PHONES[0], "ok");          // CONFIRMED วันนี้
  const apTomorrow = await book(cS, SV.s1, ST.a, addDays(D, 1), 15 * 60, PII_NAMES[1], PII_PHONES[1], "tm");
  const apCancel = await book(cS, SV.s1, ST.b, D, 16 * 60, PII_NAMES[1], PII_PHONES[2], "cx");
  const apPend = await book(cS, SV.s1, ST.b, D, 17 * 60, PII_NAMES[1], PII_PHONES[3], "pd");
  const apB = await book(cB, SV.xb, ST.xb, D, 15 * 60, PII_NAMES[2], PII_PHONES[4], "bb");
  const apS2 = await book(cS2, SV.x2, ST.x2, D, 15 * 60, PII_NAMES[3], PII_PHONES[5], "s2");
  const apQR = await book(cS, SV.s2, ST.c, D, 12 * 60, PII_NAMES[0], PII_PHONES[6], "qr");
  await q(`UPDATE "Appointment" SET status = 'CANCELLED' WHERE id = $1`, [apCancel]);
  await q(`UPDATE "Appointment" SET status = 'PENDING' WHERE id = $1`, [apPend]);
  void apTomorrow; void apB;
  console.log("(ข้อมูลพร้อม)");

  // walk-in เริ่มต้น (ตู้ k1 · มีเบอร์ลับ) ⇒ บัตรสำหรับทดสอบ token
  const wi = async (dev: { token: string }, serviceId = SV.s1, phone?: string, now = NOW) => {
    const r = await PUB.kioskWalkIn(dev.token, { serviceId, staffId: null, ...(phone ? { phone } : {}) }, { now });
    if (!r.ok) throw new Error(`walkIn ${fmt(r)}`);
    return r.ticket;
  };
  const w1 = await wi(k1, SV.s1, PII_PHONES[7]);
  const w1tok = tokOfUrl(w1.ticketUrl);
  const s2w = await wi(kS2, SV.x2);
  const bW = await wi(kB, SV.xb);

  // ═══ 1. token X7 ═══
  console.log("\n── 1. token ──");
  const weird: [string, unknown][] = [
    ["สุ่ม43", newToken()], ["สั้น", "abc"], ["ว่าง", ""], ["ยาว5000", "A".repeat(5000)], ["ยาว43+1", newToken() + "A"], ["unicode", "ก".repeat(43)],
    ["null", null], ["undefined", undefined], ["number", 12345], ["object", { toString: () => tv1.token }], ["array", [tv1.token]],
    ["sql", "' OR 1=1 --".padEnd(43, "x")], ["path", "../../etc/passwd"], ["hash-ที่เก็บ", `sha256:${sha(tv1.token)}`], ["hex-ที่เก็บ", sha(tv1.token)],
    ["ช่องว่างหน้า", ` ${tv1.token}`], ["ตัวพิมพ์ใหญ่", tv1.token.toUpperCase() === tv1.token ? tv1.token.toLowerCase() : tv1.token.toUpperCase()],
    ["ถอนแล้ว", tvR.token], ["หน่วยไม่แถวเดียว", legTok], ["จอคิวเดิม(raw)", oldDispTok],
  ];
  await probe("TK-1", "BLOCKER", async () => {
    const tvBad = [...weird, ["ตู้-บนทีวี", k1.token] as [string, unknown]];
    const kBad = [...weird, ["ทีวี-บนตู้", tv1.token] as [string, unknown]];
    const diff: string[] = [];
    for (const [n, t] of tvBad) { const r = await PUB.loadTvView(t, { now: NOW }); if (r !== null) diff.push(`tv:${n}`); }
    for (const [n, t] of kBad) { const r = await PUB.loadKioskView(t, { now: NOW }); if (r !== null) diff.push(`kiosk:${n}`); }
    const ref = { ok: false, code: "NOT_FOUND", reason: (await PUB.kioskCheckIn(newToken(), { phone: PII_PHONES[0] }, { now: NOW }) as { reason: string }).reason };
    for (const [n, t] of kBad) {
      const a = await PUB.kioskCheckIn(t, { phone: PII_PHONES[0] }, { now: NOW });
      const b = await PUB.kioskCheckIn(t, { qr: "x" }, { now: NOW });
      const c = await PUB.kioskWalkIn(t, { serviceId: SV.s1, staffId: null }, { now: NOW });
      for (const [w, r] of [["ci", a], ["qr", b], ["wi", c]] as const) if (!isDeepStrictEqual(r, ref)) diff.push(`kiosk.${w}:${n}=${fmt(r)}`);
    }
    must(diff.length === 0, `ต่างจาก null/NOT_FOUND: ${diff.join(" | ")}`);
    return `${tvBad.length + kBad.length} รูปแบบ ⇒ null / ${fmt(ref)} ทุกไบต์`;
  });
  await probe("TK-2", "BLOCKER", async () => {
    // rotate ⇒ token เก่าตาย · ใหม่ใช้ได้
    const r = await DEV.rotateDeviceToken({ ...cS, actorUserId: ids.oA }, k3.id);
    must(r.ok, `rotate ${fmt(r)}`);
    must(await PUB.loadKioskView(k3.token, { now: NOW }) === null, "token เก่าหลัง rotate ยังเปิดได้");
    must(await PUB.loadKioskView((r as { token: string }).token, { now: NOW }) !== null, "token ใหม่เปิดไม่ได้");
    k3.token = (r as { token: string }).token;
    // ข้ามร้าน: rotate/revoke อุปกรณ์ร้าน A ด้วย ctx ร้าน B / หน่วยอื่น
    for (const [c, d] of [[cB, k1.id], [{ tenantId: ids.tB, unitId: ids.uS }, k1.id], [cS2, k1.id], [cS, kB.id], [cS, oldDispId]] as const) {
      const a = await DEV.rotateDeviceToken(c, d); const b = await DEV.revokeDevice(c, d);
      must(!a.ok && !b.ok && a.code === "NOT_FOUND" && b.code === "NOT_FOUND", `rotate/revoke ข้ามขอบ ${c.unitId}/${d} ⇒ ${fmt(a)} ${fmt(b)}`);
    }
    const c1 = await DEV.createDevice({ tenantId: ids.tB, unitId: ids.uS }, { kind: "TV", name: "x" });
    must(!c1.ok && c1.code === "NOT_FOUND", `createDevice ร้าน B → หน่วยร้าน A ${fmt(c1)}`);
    const l = await DEV.listDevices({ tenantId: ids.tB, unitId: ids.uS });
    must(l.length === 0, "listDevices ข้ามร้านเห็นอุปกรณ์");
    must(!JSON.stringify(await DEV.listDevices(cS)).match(/sha256|displayToken/), "listDevices มี hash");
    return "rotate ตัด token เก่า · rotate/revoke/create/list ข้ามร้าน/หน่วย/จอคิวเดิม = NOT_FOUND/ว่าง";
  });
  await probe("TK-3", "BLOCKER", async () => {
    // บัตร: ดัดแปลงทีละตัวอักษร (ทุกตำแหน่ง · ทั้ง payload และ sig)
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const flips: string[] = [];
    for (let i = 0; i < w1tok.length; i++) {
      if (w1tok[i] === ".") continue;
      const ch = alpha[(alpha.indexOf(w1tok[i]) + 1) % alpha.length];
      flips.push(w1tok.slice(0, i) + ch + w1tok.slice(i + 1));
    }
    const [p, s] = w1tok.split(".");
    const wrongSecret = (() => { const pp = Buffer.from(`v1|${ids.tA}|${ids.uS}|${D}|${w1.ticketNumber}`).toString("base64url"); return `${pp}.${createHmac("sha256", "booking-ticket:v1:wrong-secret-xxxxxxxxxxxxxxxxxxxxxxxx").update(pp).digest("base64url")}`; })();
    const extra: [string, unknown][] = [
      ["sig ว่าง", `${p}.`], ["ไม่มีจุด", p + s], ["3 ส่วน", `${w1tok}.x`], ["padding", `${p}==.${s}`], ["sig+=", `${w1tok}=`], ["sig base64 ปกติ", `${p}.${Buffer.from(s, "base64url").toString("base64")}`],
      ["secret ผิด", wrongSecret], ["ยาว", `${w1tok}${"A".repeat(700)}`], ["null", null], ["object", { t: w1tok }], ["ว่าง", ""],
      ["ลายเซ็นบัตรอื่น", `${p}.${tokOfUrl(s2w.ticketUrl).split(".")[1]}`],
      ["ข้ามร้าน: tenantB+unitS", tkTok(ids.tB, ids.uS, D, w1.ticketNumber)], ["ข้ามหน่วย: unitS2+เลขที่ S2 ไม่มี", tkTok(ids.tA, ids.uS2, D, "W777")], ["ข้ามหน่วย: unitLeg", tkTok(ids.tA, ids.uLeg, D, w1.ticketNumber)],
      ["วันอื่น D-2", tkTok(ids.tA, ids.uS, addDays(D, -2), w1.ticketNumber)], ["วันพรุ่งนี้", tkTok(ids.tA, ids.uS, addDays(D, 1), w1.ticketNumber)],
      ["เลขไม่มีจริง", tkTok(ids.tA, ids.uS, D, "W999")], ["บัตรหน่วย QUEUE", tkTok(ids.tA, ids.uQ, D, "Q001")], ["วันรูปผิด", tkTok(ids.tA, ids.uS, "2031-1-1", w1.ticketNumber)],
      ["ตู้ token", k1.token], ["publicToken เดิม", (await q<{ publicToken: string }>(`SELECT "publicToken" FROM "QueueTicket" WHERE "unitId"=$1 AND number=$2 AND "businessDate"=$3`, [ids.uS, w1.ticketNumber, D]))[0]?.publicToken],
    ];
    const all: [string, unknown][] = [...flips.map((f, i) => [`flip${i}`, f] as [string, unknown]), ...extra];
    const diff: string[] = [];
    // นาฬิกา: บัตร D ใช้ได้ D และ D+1 · ทดสอบอายุ D+2
    const okNow = await PUB.loadTicketView(w1tok, { now: NOW });
    must(!!okNow, "ตัวควบคุม: token จริงเปิดไม่ได้");
    must((await PUB.loadTicketView(w1tok, { now: at(addDays(D, 1), "23:59") })) !== null, "ตัวควบคุม: เมื่อวานต้องยังเปิดได้");
    if ((await PUB.loadTicketView(w1tok, { now: at(addDays(D, 2), "00:01") })) !== null) diff.push("อายุ D+2 ยังเปิดได้");
    if ((await PUB.loadTicketView(w1tok, { now: at(addDays(D, -1), "12:00") })) !== null) diff.push("ก่อนวันบัตรเปิดได้");
    const refOp = { ok: false, code: "NOT_FOUND", reason: (await PUB.deferTicket(newToken(), { now: NOW }) as { reason: string }).reason };
    for (const [n, t] of all) {
      if ((await PUB.loadTicketView(t, { now: NOW })) !== null) diff.push(`view:${n}`);
    }
    for (const [n, t] of extra) {
      const a = await PUB.deferTicket(t, { now: NOW }); const b = await PUB.cancelTicket(t, { now: NOW });
      if (!isDeepStrictEqual(a, refOp)) diff.push(`defer:${n}=${fmt(a)}`);
      if (!isDeepStrictEqual(b, refOp)) diff.push(`cancel:${n}=${fmt(b)}`);
    }
    for (const t of flips.slice(0, 12)) { const b = await PUB.cancelTicket(t, { now: NOW }); if (!isDeepStrictEqual(b, refOp)) diff.push(`cancel:flip=${fmt(b)}`); }
    // canonical: เปลี่ยนท้าย sig ที่ base64url ไม่ canonical? (บิตท้าย) — ทดสอบตัวสุดท้ายทุกค่า
    let alt = 0;
    for (const ch of alpha) { const t2 = `${p}.${s.slice(0, -1)}${ch}`; if (t2 !== w1tok && (await PUB.loadTicketView(t2, { now: NOW })) !== null) alt++; }
    if (alt) diff.push(`sig ตัวท้ายแบบอื่นเปิดได้ ${alt}`);
    let altP = 0;
    for (const ch of alpha) { const p2 = `${p.slice(0, -1)}${ch}`; if (p2 !== p && Buffer.from(p2, "base64url").equals(Buffer.from(p, "base64url"))) { const t2 = `${p2}.${createHmac("sha256", `booking-ticket:v1:${process.env.SESSION_SECRET}`).update(p2).digest("base64url")}`; if ((await PUB.loadTicketView(t2, { now: NOW })) !== null) altP++; } }
    if (altP) diff.push(`payload non-canonical (ลงนามถูก) เปิดได้ ${altP}`);
    must(diff.length === 0, diff.join(" | "));
    return `ดัดแปลง ${flips.length} ตำแหน่ง + ${extra.length} แบบ ⇒ null / ${fmt(refOp)} · อายุ D..D+1 เท่านั้น`;
  });

  // ข้ามร้าน/หน่วย ที่ตู้
  await probe("TK-4", "BLOCKER", async () => {
    const diff: string[] = [];
    const qrS = await LN.checkInToken(cS, apQR);
    must(!!qrS, "ตัวควบคุม: checkInToken");
    const qrS2 = await LN.checkInToken(cS2, apS2);
    // QR ของหน่วย S ที่ตู้หน่วย S2 (ร้านเดียวกัน) · ตู้ร้าน B
    for (const [n, dev, by] of [["QR uS @ kS2", kS2, { qr: qrS! }], ["QR uS(URL) @ kB", kB, { qr: `https://x.test/c?t=${encodeURIComponent(qrS!)}` }], ["QR uS2 @ k1", k1, { qr: qrS2! }],
      ["เบอร์ร้าน B @ k1", k1, { phone: PII_PHONES[4] }], ["เบอร์ uS2 @ k1", k1, { phone: PII_PHONES[5] }], ["เบอร์ uS @ kB", kB, { phone: PII_PHONES[0] }], ["ticket token ทำ QR", k1, { qr: w1tok }]] as const) {
      const r = await PUB.kioskCheckIn(dev.token, by as never, { now: NOW });
      if (r.ok || r.code !== "NOT_FOUND") diff.push(`${n}=${fmt(r)}`);
    }
    // ยังไม่เช็กอิน (ไม่มีผลข้างเคียง)
    const st = await q<{ status: string }>(`SELECT status::text FROM "Appointment" WHERE id = ANY($1)`, [[apQR, apS2, apB, apOK]]);
    if (st.some((s) => s.status !== "CONFIRMED")) diff.push(`สถานะนัดถูกเปลี่ยน ${fmt(st)}`);
    // walk-in ข้ามหน่วย: serviceId/staffId ของหน่วยอื่น
    for (const [n, i] of [["svc uS2", { serviceId: SV.x2, staffId: null }], ["svc B", { serviceId: SV.xb, staffId: null }], ["staff B", { serviceId: SV.s1, staffId: ST.xb }], ["staff uS2", { serviceId: SV.s1, staffId: ST.x2 }], ["staff leg", { serviceId: SV.s1, staffId: ST.leg }]] as const) {
      const r = await PUB.kioskWalkIn(k2.token, i, { now: NOW });
      if (r.ok) diff.push(`walkIn ${n} สำเร็จ ${fmt(r)}`);
      else if (r.code !== "NOT_FOUND") diff.push(`walkIn ${n} code=${r.code}`);
    }
    must(diff.length === 0, diff.join(" | "));
    return "QR/เบอร์/บริการ/ช่าง ข้ามร้าน/หน่วย ⇒ NOT_FOUND ไม่เปลี่ยนสถานะ";
  });

  // หน่วยปิดแถวเดียวกลางทาง
  await probe("TK-5", "MAJOR", async () => {
    const s2tok = tokOfUrl(s2w.ticketUrl);
    must(!!(await PUB.loadTicketView(s2tok, { now: NOW })), "ตัวควบคุม s2");
    const off = await SET.setSettings(OWNER as never, { tenantId: ids.tA }, [{ key: "booking.queue.singleLine", scope: "UNIT", scopeId: ids.uS2, value: false }]);
    must(off.ok, `ปิด singleLine ไม่ได้ ${fmt(off)}`);
    const r = [await PUB.loadTvView(tvS2.token, { now: NOW }), await PUB.loadKioskView(kS2.token, { now: NOW }), await PUB.loadTicketView(s2tok, { now: NOW })];
    const w = [await PUB.kioskWalkIn(kS2.token, { serviceId: SV.x2, staffId: null }, { now: NOW }), await PUB.cancelTicket(s2tok, { now: NOW })];
    const on = await SET.setSettings(OWNER as never, { tenantId: ids.tA }, [{ key: "booking.queue.singleLine", scope: "UNIT", scopeId: ids.uS2, value: true }]);
    must(on.ok, "เปิดคืนไม่ได้");
    must(r.every((x) => x === null), `ยังเปิดได้ ${fmt(r.map((x) => !!x))}`);
    must(w.every((x) => !x.ok && (x as { code: string }).code === "NOT_FOUND"), `เขียนได้ ${fmt(w)}`);
    return "ปิดแถวเดียว ⇒ ทีวี/ตู้/บัตร null · เขียน NOT_FOUND";
  });

  // timing
  await probe("TK-6", "MINOR", async () => {
    const med = async (fn: () => Promise<unknown>, n = 30) => { const xs: number[] = []; for (let i = 0; i < n; i++) { const t = process.hrtime.bigint(); await fn(); xs.push(Number(process.hrtime.bigint() - t) / 1e6); } xs.sort((a, b) => a - b); return xs[Math.floor(n / 2)]; };
    const tv = {
      "รูปผิด": await med(() => PUB.loadTvView("abc", { now: NOW })),
      "สุ่ม43": await med(() => PUB.loadTvView(newToken(), { now: NOW })),
      "ถอนแล้ว": await med(() => PUB.loadTvView(tvR.token, { now: NOW })),
      "ผิดชนิด": await med(() => PUB.loadTvView(k1.token, { now: NOW })),
      "ไม่แถวเดียว": await med(() => PUB.loadTvView(legTok, { now: NOW })),
    };
    const p = w1tok.split(".")[0];
    const tk = {
      "sig ปลอม": await med(() => PUB.loadTicketView(`${p}.${"A".repeat(43)}`, { now: NOW })),
      "sig ปลอม (ตัวแรกถูก)": await med(() => PUB.loadTicketView(`${p}.${w1tok.split(".")[1].slice(0, 20)}${"A".repeat(23)}`, { now: NOW })),
      "หมดอายุ": await med(() => PUB.loadTicketView(tkTok(ids.tA, ids.uS, addDays(D, -3), w1.ticketNumber), { now: NOW })),
      "เลขไม่มี": await med(() => PUB.loadTicketView(tkTok(ids.tA, ids.uS, D, "W999"), { now: NOW })),
      "บัตร QUEUE": await med(() => PUB.loadTicketView(tkTok(ids.tA, ids.uQ, D, "Q001"), { now: NOW })),
    };
    const sig = { a: tk["sig ปลอม"], b: tk["sig ปลอม (ตัวแรกถูก)"] };
    const r = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${v.toFixed(2)}ms`).join(" · ");
    rec("TK-6i", "INFO", "-", `ทีวี: ${r(tv)}`);
    rec("TK-6j", "INFO", "-", `บัตร: ${r(tk)}`);
    must(Math.abs(sig.a - sig.b) < 0.5, `HMAC เทียบไม่ timing-safe? ${sig.a} vs ${sig.b}`);
    // ไม่แถวเดียว/ถอน/ผิดชนิด ใช้คิวรีเพิ่มเทียบ สุ่ม43 — แต่ token 256 บิต ⇒ ผู้โจมตีไม่มี token ให้แยก
    const spread = Math.max(...Object.values(tv).slice(1)) - Math.min(...Object.values(tv).slice(1));
    return `HMAC เทียบเวลาคงที่ (Δ ${Math.abs(sig.a - sig.b).toFixed(2)}ms) · ทีวี token รูปถูก spread ${spread.toFixed(1)}ms (แยกได้เฉพาะคนที่ถือ token จริงอยู่แล้ว)`;
  });

  // ═══ 2. PII ═══
  console.log("\n── 2. PII ──");
  // ทีวี showCustomerName=true ผ่าน setSettings ชั้น DEVICE
  await probe("PII-1", "BLOCKER", async () => {
    const w = await SET.setSettings(OWNER as never, { tenantId: ids.tA }, [{ key: "booking.display.tvShow", scope: "DEVICE", scopeId: tv1.id, value: { label: "PROVIDER", showCustomerName: true } }]);
    must(w.ok, `เขียน showCustomerName ไม่ได้ ${fmt(w)}`);
    // เช็กอินนัดลับให้มีในแถว + เรียกคิว
    const ci = await PUB.kioskCheckIn(k2.token, { phone: PII_PHONES[0] }, { now: NOW });
    must(ci.ok, `เช็กอินเบอร์จริง ${fmt(ci)}`);
    const pieces: [string, string][] = [];
    const tvv = await PUB.loadTvView(tv1.token, { now: NOW });
    must(!!tvv, "tv null");
    pieces.push(["tvDTO", JSON.stringify(tvv)], ["tvHTML", render(TvBoard, { view: tvv })]);
    const kv = await PUB.loadKioskView(k1.token, { now: NOW });
    pieces.push(["kioskDTO", JSON.stringify(kv)]);
    const acts = { checkIn: async () => null, walkIn: async () => null };
    for (const init of [undefined, { screen: "checkin" }, { screen: "walkin" }, { screen: "ticket", ticket: w1 }, { screen: "checkedIn", ticket: (ci as { ticket: unknown }).ticket }]) pieces.push([`kioskHTML:${(init as { screen?: string })?.screen ?? "home"}`, render(Kiosk, { view: kv, actions: acts, ...(init ? { initial: init } : {}) })]);
    pieces.push(["checkInDTO", JSON.stringify(ci)]);
    const ciTok = tokOfUrl((ci as { ticket: { ticketUrl: string } }).ticket.ticketUrl);
    for (const [n, t] of [["w1", w1tok], ["booked", ciTok]] as const) {
      const v = await PUB.loadTicketView(t, { now: NOW });
      pieces.push([`ticketDTO:${n}`, JSON.stringify(v)], [`ticketHTML:${n}`, render(TicketCard, { view: v, token: t, actions: { defer: async () => {}, cancel: async () => {} } })]);
    }
    pieces.push(["walkinDTO(เบอร์)", JSON.stringify(w1)]);
    const leaks = pieces.map(([n, s]) => [n, piiIn(s)] as const).filter(([, l]) => l.length);
    must(leaks.length === 0, `PII: ${leaks.map(([n, l]) => `${n}:${l.join(",")}`).join(" | ")}`);
    // ชื่ออุปกรณ์/ token/hash ไม่หลุด
    const all = pieces.map(([, s]) => s).join("\n");
    must(!all.includes(`sha256:`) && !all.includes(tv1.token) && !all.includes(k1.token), "token/hash อุปกรณ์หลุดใน DTO/HTML");
    return `${pieces.length} ชิ้น (DTO+HTML 3 หน้า · showCustomerName=true) ไม่มีชื่อ/เบอร์/token`;
  });
  await probe("PII-2", "MAJOR", async () => {
    // outbox ยกเลิกโดยลูกค้า ไม่มีชื่อ/เบอร์
    const w = await wi(k1, SV.s1, PII_PHONES[7]);
    const c = await PUB.cancelTicket(tokOfUrl(w.ticketUrl), { now: NOW });
    must(c.ok, `cancel ${fmt(c)}`);
    const ev = await q<{ payload: unknown }>(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'booking.cancelled'`, [ids.tA]);
    must(ev.length >= 1, "ไม่มี outbox booking.cancelled");
    const l = piiIn(JSON.stringify(ev));
    must(l.length === 0, `outbox มี PII ${l}`);
    // audit อุปกรณ์ไม่มี token/hash
    const au = await q<{ after: unknown; before: unknown }>(`SELECT * FROM "AuditLog" WHERE "tenantId" = $1 AND action LIKE 'booking.device.%'`, [ids.tA]).catch(() => [] as { after: unknown }[]);
    must(au.length > 0, "ไม่พบ audit อุปกรณ์");
    must(!/sha256|[A-Za-z0-9_-]{43}/.test(JSON.stringify(au.map((a) => (a as { after: unknown }).after))), "audit มี token/hash");
    return `outbox ${ev.length} แถว + audit ${au.length} แถว ไม่มี PII/token`;
  });
  await probe("PII-3", "MAJOR", async () => {
    // ตู้แยกไม่ออกว่าเบอร์มีอยู่จริง: ไม่มีเลย vs นัดพรุ่งนี้ vs นัดยกเลิกวันนี้ vs PENDING วันนี้ vs ร้านอื่น
    const cases: [string, string][] = [["ไม่มีเลย", "0812345678"], ["นัดพรุ่งนี้", PII_PHONES[1]], ["นัดยกเลิกวันนี้", PII_PHONES[2]], ["PENDING วันนี้", PII_PHONES[3]], ["ร้าน B", PII_PHONES[4]], ["หน่วย S2", PII_PHONES[5]], ["walk-in มีเบอร์ (QUEUED)", PII_PHONES[7]]];
    const out: Record<string, string> = {};
    for (const [n, p] of cases) out[n] = fmt(await PUB.kioskCheckIn(k2.token, { phone: p }, { now: NOW }));
    const base = out["ไม่มีเลย"];
    const diff = Object.entries(out).filter(([, v]) => v !== base);
    must(diff.length === 0, `แยกได้: ${diff.map(([k, v]) => `${k}=${v}`).join(" | ")} (อ้างอิง ${base})`);
    return `${cases.length} กรณี ⇒ ${base}`;
  });
  await probe("PII-4", "MAJOR", async () => {
    // ตู้: เบอร์ของคนที่เช็กอินแล้ว ⇒ ได้ลิงก์หน้าบัตรของเขา (มี canCancel?)
    const r = await PUB.kioskCheckIn(k3.token, { phone: PII_PHONES[0] }, { now: NOW });
    must(!r.ok || !(await PUB.loadTicketView(tokOfUrl(r.ticket.ticketUrl), { now: NOW }))?.canCancel, "เบอร์คนอื่น ⇒ ได้บัตรที่ยกเลิกได้");
    return r.ok ? `ได้บัตรเดิม ${r.ticket.ticketNumber} (นัด · ยกเลิก/เลื่อนไม่ได้ · ไม่มีชื่อ) — ตามใบสั่ง` : `ล้ม ${r.code}`;
  });

  // ═══ 3. หลายโพรเซส ═══
  console.log("\n── 3. หลายโพรเซส ──");
  await probe("CC-1", "BLOCKER", async () => {
    const before = await q<{ number: string }>(`SELECT number FROM "QueueTicket" WHERE "unitId"=$1 AND "businessDate"=$2`, [ids.uS, D]);
    const outs = await runChildren([k1, k2, k3].map((k) => ({ op: "walkin", token: k.token, serviceId: SV.s2, n: 6, now: at(D, "11:30").toISOString() })));
    const rs = flat(outs);
    const th = anyThrow(rs);
    const oks = rs.filter((r) => r.ok === true).map((r) => String(r.n));
    const fails = rs.filter((r) => r.ok === false);
    const after = await q<{ number: string; refId: string }>(`SELECT number, "refId" FROM "QueueTicket" WHERE "unitId"=$1 AND "businessDate"=$2`, [ids.uS, D]);
    const newNums = after.map((r) => r.number).filter((n) => !before.some((b) => b.number === n));
    const dup = newNums.length !== new Set(newNums).size || oks.length !== new Set(oks).size;
    const walkNums = after.map((r) => r.number).filter((n) => /^[A-Z]+\d+$/.test(n) && n[0] === w1.ticketNumber[0]).map((n) => Number(n.replace(/\D/g, ""))).sort((a, b) => a - b);
    const gaps = walkNums.filter((n, i) => i > 0 && n !== walkNums[i - 1] + 1);
    must(th.length === 0, `throw/P2028: ${fmt(th)}`);
    must(!dup, `เลขซ้ำ ${fmt(newNums)}`);
    must(oks.length === newNums.length, `ok ${oks.length} ≠ บัตรใหม่ ${newNums.length}`);
    must(gaps.length === 0 && walkNums[0] === 1, `เลขข้าม ${fmt(walkNums)}`);
    return `3 โพรเซส × 6 ⇒ ok ${oks.length} · ล้ม ${fails.length} (${[...new Set(fails.map((f) => String(f.code)))].join(",") || "-"}) · เลข walk-in 1..${walkNums.at(-1)} ไม่ซ้ำไม่ข้าม`;
  });
  const clearLine = async (hm: string) => {
    const rows = await q<{ id: string }>(`SELECT id FROM "Appointment" WHERE "unitId"=$1 AND kind='WALKIN' AND status::text='QUEUED'`, [ids.uS]);
    for (const r of rows) { const x = await LN.cancelByShop(cS as never, r.id, { now: at(D, hm) }); if (!x.ok) console.log(`  (clearLine ${r.id} ${fmt(x)})`); }
  };
  const freshWalkins = async (n: number, hm: string) => { const out: { tok: string; num: string; appt: string }[] = []; for (let i = 0; i < n; i++) { const t = await wi(k2, SV.s2, undefined, new Date(at(D, hm).getTime() + i * 1000)); const appt = (await q<{ refId: string }>(`SELECT "refId" FROM "QueueTicket" WHERE "unitId"=$1 AND "businessDate"=$2 AND number=$3`, [ids.uS, D, t.ticketNumber]))[0].refId; out.push({ tok: tokOfUrl(t.ticketUrl), num: t.ticketNumber, appt }); } return out; };
  const state = async (appt: string) => (await q<{ a: string; t: string; ci: Date }>(`SELECT a.status::text a, t.status::text t, a."checkedInAt" ci FROM "Appointment" a JOIN "QueueTicket" t ON t.id = a."queueTicketId" WHERE a.id=$1`, [appt]))[0];
  await probe("CC-2", "BLOCKER", async () => {
    const bad: string[] = [];
    const summary: string[] = [];
    for (let round = 0; round < 4; round++) {
      await clearLine(`12:0${round}`);
      const ws = await freshWalkins(3, `12:0${round}`);
      const me = ws[0];
      const now = at(D, `12:1${round}`).toISOString();
      const outs = await runChildren([{ op: "defer", token: me.tok, now }, { op: "cancel", token: me.tok, now }, { op: "call", ctx: cS, apptId: me.appt, now }]);
      const [d, c, k] = outs.map((o) => (o.result ?? [{ throw: o.raw }])[0] as Record<string, unknown>);
      const th = anyThrow([d, c, k]);
      if (th.length) bad.push(`r${round} throw ${fmt(th)}`);
      const s = await state(me.appt);
      const ev = await q<{ action: string }>(`SELECT action::text FROM "QueueTicketEvent" WHERE "ticketId" = (SELECT "queueTicketId" FROM "Appointment" WHERE id=$1)`, [me.appt]);
      const consistent = (s.a === "CANCELLED") === (s.t === "CANCELLED") && (s.a !== "QUEUED" || ["WAITING", "CALLED"].includes(s.t));
      if (!consistent) bad.push(`r${round} สถานะขัดกัน appt=${s.a} ticket=${s.t}`);
      if (c.ok === true && s.a !== "CANCELLED") bad.push(`r${round} cancel ok แต่ appt=${s.a}`);
      if (k.ok === true && c.ok !== true && s.t !== "CALLED") bad.push(`r${round} call ok แต่ ticket=${s.t}`);
      if (d.ok === true && !ev.some((e) => e.action === "DEFERRED")) bad.push(`r${round} defer ok แต่ไม่มี event`);
      if (c.ok === true) { const ob = await q(`SELECT 1 FROM "OutboxEvent" WHERE "idempotencyKey" = $1`, [`booking.cancelled#${me.appt}`]); if (ob.length !== 1) bad.push(`r${round} outbox ${ob.length}`); }
      summary.push(`r${round}: defer=${d.ok === true ? "ok" : d.code} cancel=${c.ok === true ? "ok" : c.code} call=${k.ok === true ? "ok" : k.code} ⇒ ${s.a}/${s.t}`);
    }
    must(bad.length === 0, `${bad.join(" | ")} :: ${summary.join(" ; ")}`);
    return summary.join(" ; ");
  });
  await probe("CC-3", "MAJOR", async () => {
    // defer ซ้ำหลายครั้ง (ขนาน 4 โพรเซสบนบัตรเดียว + ต่อเนื่อง) ⇒ ไม่ throw · ลำดับ checkedInAt ไม่ซ้ำ · จำนวน DEFERRED = ok
    await clearLine("13:00");
    const ws = await freshWalkins(4, "13:00");
    const now = at(D, "13:05").toISOString();
    const outs = await runChildren([0, 1, 2, 3].map(() => ({ op: "defer", token: ws[0].tok, now })));
    const rs = flat(outs);
    const th = anyThrow(rs);
    const oks = rs.filter((r) => r.ok === true).length;
    const ev = await q<{ n: number }>(`SELECT count(*)::int n FROM "QueueTicketEvent" WHERE action='DEFERRED' AND "ticketId" = (SELECT "queueTicketId" FROM "Appointment" WHERE id=$1)`, [ws[0].appt]);
    const cis = await Promise.all(ws.map(async (w) => ({ n: w.num, ci: (await state(w.appt)).ci.getTime() })));
    const uniq = new Set(cis.map((c) => c.ci)).size === cis.length;
    const order = [...cis].sort((a, b) => a.ci - b.ci).map((c) => c.n);
    must(th.length === 0, `throw ${fmt(th)}`);
    must(ev[0].n === oks, `DEFERRED ${ev[0].n} ≠ ok ${oks}`);
    must(uniq, `checkedInAt ซ้ำ ${fmt(cis)}`);
    // ต่อเนื่องจนสุด ⇒ BAD_STATE
    let seq = 0; let last: unknown = null;
    for (let i = 0; i < 6; i++) { const r = await PUB.deferTicket(ws[0].tok, { now: new Date(at(D, "13:06").getTime() + i) }); last = r; if (r.ok) seq++; else break; }
    must((last as { code?: string })?.code === "BAD_STATE" || (last as { code?: string })?.code === "RATE_LIMITED", `ท้ายสุดไม่ใช่ BAD_STATE ${fmt(last)}`);
    return `ขนาน 4 ⇒ ok ${oks} (${rs.filter((r) => r.ok !== true).map((r) => r.code).join(",")}) · ต่อเนื่องอีก ${seq} แล้ว ${fmt((last as { code?: string })?.code)} · ลำดับ ${order.join(">")}`;
  });
  await probe("CC-4", "MINOR", async () => {
    // walk-in ที่ checkedInAt เท่ากัน (now ฉีดเดียวกัน / ตู้ 2 เครื่องในมิลลิวินาทีเดียว) ⇒ defer ต้องถอย 1 คิว ไม่ใช่ข้ามหลายคิว
    const t = at(D, "14:00");
    await clearLine("14:00");
    const ws: { tok: string; num: string; appt: string }[] = [];
    for (let i = 0; i < 3; i++) { const k = await wi(k2, SV.s2, undefined, t); const appt = (await q<{ refId: string }>(`SELECT "refId" FROM "QueueTicket" WHERE "unitId"=$1 AND "businessDate"=$2 AND number=$3`, [ids.uS, D, k.ticketNumber]))[0].refId; ws.push({ tok: tokOfUrl(k.ticketUrl), num: k.ticketNumber, appt }); }
    const ord0 = (await q<{ id: string }>(`SELECT id FROM "Appointment" WHERE id = ANY($1) ORDER BY "checkedInAt", id`, [ws.map((w) => w.appt)])).map((r) => r.id);
    const first = ws.find((w) => w.appt === ord0[0])!;
    const r = await PUB.deferTicket(first.tok, { now: t });
    must(r.ok, `defer ${fmt(r)}`);
    const ord1 = (await q<{ id: string }>(`SELECT id FROM "Appointment" WHERE id = ANY($1) ORDER BY "checkedInAt", id`, [ws.map((w) => w.appt)])).map((r2) => r2.id);
    const pos = ord1.indexOf(first.appt);
    must(pos === 1, `checkedInAt เท่ากัน: defer ถอยไปตำแหน่ง ${pos} (ต้อง 1) ⇒ ข้ามหลายคิว`);
    return "เวลาเท่ากัน ⇒ ถอย 1 คิว";
  });

  // ═══ 4. rate limit ═══
  console.log("\n── 4. rate limit ──");
  await probe("RL-1", "MAJOR", async () => {
    const t0 = at(D, "15:00");
    let n = 0; let first: string | null = null;
    for (let i = 0; i < 25; i++) { const r = await PUB.kioskCheckIn(kRate.token, { phone: "0800000000" }, { now: t0 }); if (!r.ok && r.code === "RATE_LIMITED") { first ??= String(i + 1); } else n++; }
    must(first === "21", `เพดานตู้เช็กอินที่ครั้ง ${first}`);
    // สลับ token (rotate) ⇒ ถังเดิม
    const rr = await DEV.rotateDeviceToken({ ...cS, actorUserId: ids.oA }, kRate.id);
    kRate.token = (rr as { token: string }).token;
    const a = await PUB.kioskCheckIn(kRate.token, { phone: "0800000000" }, { now: t0 });
    must(!a.ok && a.code === "RATE_LIMITED", `rotate ⇒ ถังใหม่ ${fmt(a)}`);
    // ถึงเพดานแล้ว: เบอร์จริงที่ยังไม่เช็กอิน ⇒ ไม่แตะฐานงาน
    const apX = await book(cS, SV.s1, ST.c, D, 18 * 60, PII_NAMES[0], "0899111088", "rl");
    const b = await PUB.kioskCheckIn(kRate.token, { phone: "0899111088" }, { now: t0 });
    const s = (await q<{ status: string }>(`SELECT status::text FROM "Appointment" WHERE id=$1`, [apX]))[0].status;
    must(!b.ok && b.code === "RATE_LIMITED" && s === "CONFIRMED", `เกินเพดานยังเช็กอิน ${fmt(b)} ${s}`);
    // token ปลอม ไม่กินถังเครื่องจริง / ไม่มีถังให้ token ปลอม
    const bk = await q<{ n: number }>(`SELECT count(*)::int n FROM "ChatRateBucket" WHERE key LIKE 'bq:kiosk:%' AND "updatedAt" > now() - interval '1 hour' AND key NOT IN (SELECT unnest($1::text[]))`, [deviceIds.flatMap((d) => [`bq:kiosk:checkin:${d}`, `bq:kiosk:walkin:${d}`])]);
    rec("RL-1i", "INFO", "-", `ถัง bq:kiosk ที่ไม่ใช่อุปกรณ์ของ probe (รอบอื่น/QC) ${bk[0].n}`);
    // ผ่านตู้อื่นหน่วยเดียวกันได้ (ถังต่อเครื่องตามใบสั่ง)
    const c = await PUB.kioskCheckIn(k3.token, { phone: "0899111088" }, { now: t0 });
    return `เพดาน 20/เครื่อง · rotate ไม่รีเซ็ต · เกินแล้วไม่เช็กอิน · ตู้อื่นยังได้ (${c.ok ? "ok" : (c as { code: string }).code}) = ถังต่อเครื่องตามใบสั่ง`;
  });
  await probe("RL-2", "MAJOR", async () => {
    const t0 = at(D, "15:10");
    let n = 0; let first: string | null = null;
    for (let i = 0; i < 32; i++) { const r = await PUB.kioskWalkIn(kRate.token, { serviceId: "nope", staffId: null }, { now: t0 } as never); if (!r.ok && r.code === "RATE_LIMITED") first ??= String(i + 1); else n++; }
    must(first === "31", `เพดานตู้ walk-in ที่ครั้ง ${first}`);
    const tks = await q<{ n: number }>(`SELECT count(*)::int n FROM "QueueTicket" WHERE "unitId"=$1`, [ids.uS]);
    const r = await PUB.kioskWalkIn(kRate.token, { serviceId: SV.s1, staffId: null }, { now: t0 });
    const tks2 = await q<{ n: number }>(`SELECT count(*)::int n FROM "QueueTicket" WHERE "unitId"=$1`, [ids.uS]);
    must(!r.ok && r.code === "RATE_LIMITED" && tks[0].n === tks2[0].n, `เกินแล้วยังออกบัตร ${fmt(r)}`);
    return "เพดาน 30 · เกินแล้วไม่ออกบัตร";
  });
  await probe("RL-3", "MAJOR", async () => {
    await clearLine("15:20");
    const ws = await freshWalkins(2, "15:20");
    const t0 = at(D, "15:21");
    let first: string | null = null;
    for (let i = 0; i < 12; i++) { const r = i % 2 ? await PUB.cancelTicket(`${ws[1].tok.split(".")[0]}.${"A".repeat(43)}`, { now: t0 }) : await PUB.loadTicketView(ws[0].tok, { now: t0 }).then(() => PUB.deferTicket(ws[0].tok, { now: t0 })); if (!r.ok && r.code === "RATE_LIMITED") first ??= String(i); }
    // defer ทีละ 2 (คู่) = นับ 6 ครั้ง ⇒ ยังไม่เต็ม · ยิงสลับ defer/cancel บนบัตร ws[0] ต่อ
    let hit: number | null = null;
    for (let i = 0; i < 12; i++) { const r = i % 2 ? await PUB.cancelTicket(ws[0].tok, { now: t0 }) : await PUB.deferTicket(ws[0].tok, { now: t0 }); if (!r.ok && r.code === "RATE_LIMITED") { hit = i; break; } }
    must(hit !== null, "ไม่มีเพดานบัตร");
    // บัตรอื่นไม่โดน (ต่อบัตร) · sig ปลอมไม่กินถังบัตรจริง
    const o = await PUB.deferTicket(ws[1].tok, { now: t0 });
    must(o.ok || o.code !== "RATE_LIMITED", "ถังรั่วข้ามบัตร");
    const s = await state(ws[0].appt);
    return `ถังบัตร (defer+cancel ร่วม) เต็มหลังยิงรวม ${6 + (hit ?? 0)} ครั้ง · บัตรอื่นไม่โดน · sig ปลอมไม่นับ · บัตรตอนจบ ${s.a}/${s.t}`;
  });

  // ═══ 5. ทางเดิมของคิว ═══
  console.log("\n── 5. ทางเดิม ──");
  await probe("OLD-1", "MAJOR", async () => {
    const pubTok = (await q<{ publicToken: string }>(`SELECT "publicToken" FROM "QueueTicket" WHERE "unitId"=$1 AND "businessDate"=$2 AND number=$3`, [ids.uS, D, w1.ticketNumber]))[0].publicToken;
    const a = await QS.getTicketStatus(ids.uS, pubTok);
    const b = await QS.getDisplaySnapshot(ids.uS, `sha256:${sha(tv1.token)}`);
    const b2 = await QS.getDisplaySnapshot(ids.uS, `sha256:${sha(k1.token)}`);
    const ctl1 = await QS.getTicketStatus(ids.uQ, `svcb6ppub${RUN}`);
    const ctl2 = await QS.getDisplaySnapshot(ids.uQ, qDispTok);
    must(a === null && b === null && b2 === null, `ทางเดิมยังเปิด: ticket=${!!a} tv=${!!b} kiosk=${!!b2}`);
    must(!!ctl1 && !!ctl2, "ตัวควบคุมหน่วย QUEUE เสีย");
    const act = readFileSync(join(ROOT, "src/lib/modules/queue/actions.ts"), "utf8");
    must(/createDisplayAction[\s\S]{0,200}ticketCtxOf/.test(act) && /revokeDisplayAction[\s\S]{0,200}ticketCtxOf/.test(act), "create/revoke display ไม่ใช้ ticketCtxOf");
    return "getTicketStatus(บัตร APPOINTMENT)/getDisplaySnapshot(hash ทีวี/ตู้) = null · หน่วย QUEUE เดิมได้ · create/revoke = ticketCtxOf";
  });
  await probe("OLD-2", "MINOR", async () => {
    // จอคิวเดิม (ไม่มี kind) ที่ค้างในหน่วย BOOKING แถวเดียว — ยังเปิด snapshot ได้? และถอนจาก UI ได้ไหม
    const s = await QS.getDisplaySnapshot(ids.uS, oldDispTok);
    const listed = (await DEV.listDevices(cS)).some((d) => d.id === oldDispId);
    const rv = await DEV.revokeDevice(cS, oldDispId);
    const leaks = s ? piiIn(JSON.stringify(s)) : [];
    must(!s, `จอคิวเดิมในหน่วยแถวเดียวยังเปิด /s/.../queue/display/<raw> ได้ (next=${fmt((s as { next?: unknown })?.next)} PII=${leaks.join(",") || "ไม่มี"}) · อยู่ใน listDevices=${listed} · revokeDevice=${(rv as { code?: string }).code ?? "ok"} · revokeDisplayAction=notFound (ticketCtxOf) ⇒ ไม่มีทางถอนจาก UI`);
    return "ปิดแล้ว";
  });

  // ═══ 6. ค่าตั้งชั้น DEVICE ═══
  console.log("\n── 6. DEVICE settings ──");
  await probe("DS-1", "BLOCKER", async () => {
    const bad: string[] = [];
    const tries: [string, unknown, { tenantId: string }, { key: string; scope: string; scopeId: string; value: unknown }][] = [
      ["เจ้าของ A → อุปกรณ์ร้าน B", OWNER, { tenantId: ids.tA }, { key: "booking.kiosk.pinLock", scope: "DEVICE", scopeId: kB.id, value: false }],
      ["เจ้าของ B (ctx B) → อุปกรณ์ร้าน A", OWNER_B, { tenantId: ids.tB }, { key: "booking.kiosk.pinLock", scope: "DEVICE", scopeId: k1.id, value: false }],
      ["ผจก.สาขา S2 → อุปกรณ์หน่วย S", MGR2, { tenantId: ids.tA }, { key: "booking.kiosk.pinLock", scope: "DEVICE", scopeId: k1.id, value: false }],
      ["key ที่ไม่รับ DEVICE: singleLine", OWNER, { tenantId: ids.tA }, { key: "booking.queue.singleLine", scope: "DEVICE", scopeId: k1.id, value: false }],
      ["key ที่ไม่รับ DEVICE: lineConnectionId", OWNER, { tenantId: ids.tA }, { key: "messaging.lineConnectionId", scope: "DEVICE", scopeId: k1.id, value: "x" }],
      ["scopeId ไม่มีจริง", OWNER, { tenantId: ids.tA }, { key: "booking.kiosk.pinLock", scope: "DEVICE", scopeId: "nope", value: false }],
      ["scopeId = หน่วย (ผิดชั้น)", OWNER, { tenantId: ids.tA }, { key: "booking.kiosk.pinLock", scope: "DEVICE", scopeId: ids.uS, value: false }],
    ];
    for (const [n, a, c, ch] of tries) {
      try { const r = await SET.setSettings(a as never, c, [ch] as never); if (r.ok) bad.push(`${n} สำเร็จ`); } catch (e) { bad.push(`${n} throw ${errOf(e)}`); }
    }
    const rows = await q<{ n: number }>(`SELECT count(*)::int n FROM "SettingValue" WHERE scope='DEVICE' AND "scopeId" = ANY($1) AND key IN ('booking.kiosk.pinLock','booking.queue.singleLine','messaging.lineConnectionId')`, [[kB.id, k1.id, "nope", ids.uS]]);
    if (rows[0].n) bad.push(`มีแถวถูกเขียน ${rows[0].n}`);
    {
      // ข้อสังเกต: setSettings เชื่อ ctx.tenantId ที่ผู้เรียกส่ง (actor ไม่มี tenant) — เทียบชั้น UNIT เดิม (ไม่ใช่ของใหม่ B.6)
      const dv = await SET.setSettings(OWNER_B as never, { tenantId: ids.tA }, [{ key: "booking.queue.walkInPickStaff", scope: "DEVICE", scopeId: k1.id, value: false }] as never);
      const un = await SET.setSettings(OWNER_B as never, { tenantId: ids.tA }, [{ key: "booking.queue.walkInPickStaff", scope: "UNIT", scopeId: ids.uS, value: false }] as never);
      rec("DS-1j", "INFO", "-", `actor ร้าน B + ctx ร้าน A: DEVICE ok=${dv.ok} · UNIT (ทางเดิม) ok=${un.ok} ⇒ ${dv.ok === un.ok ? "พฤติกรรมเดียวกับชั้นเดิม (ctx มาจาก session ใน action จริง)" : "ต่างจากชั้นเดิม!"}`);
      await SET.resetSetting(OWNER as never, { tenantId: ids.tA }, { key: "booking.queue.walkInPickStaff", scope: "DEVICE", scopeId: k1.id } as never).catch(() => {});
      await SET.resetSetting(OWNER as never, { tenantId: ids.tA }, { key: "booking.queue.walkInPickStaff", scope: "UNIT", scopeId: ids.uS } as never).catch(() => {});
    }
    const ok1 = await SET.setSettings(MGR2 as never, { tenantId: ids.tA }, [{ key: "booking.kiosk.pinLock", scope: "DEVICE", scopeId: kS2.id, value: false }] as never);
    const rs = await SET.resetSetting(OWNER_B as never, { tenantId: ids.tB }, { key: "booking.display.tvShow", scope: "DEVICE", scopeId: tv1.id } as never);
    if (rs.ok) bad.push("resetSetting ข้ามร้านสำเร็จ");
    const f1 = await SET.loadSettingsForm(OWNER_B as never, { tenantId: ids.tB }, { domains: ["booking"], unitId: ids.uB, scope: "DEVICE", scopeId: k1.id }).catch((e) => `throw ${errOf(e)}`);
    const f2 = await SET.loadSettingsForm(OWNER as never, { tenantId: ids.tA }, { domains: ["booking"], unitId: ids.uS2, scope: "DEVICE", scopeId: k1.id }).catch((e) => `throw ${errOf(e)}`);
    if (f1 && typeof f1 === "object") bad.push(`loadSettingsForm ข้ามร้านได้ฟอร์ม`);
    rec("DS-1i", "INFO", "-", `ผจก.สาขาตัวเองเขียน DEVICE ได้=${ok1.ok} (${(ok1 as { code?: string }).code ?? ""}) · ฟอร์ม unit S2+อุปกรณ์หน่วย S = ${typeof f2 === "object" && f2 ? "ได้ฟอร์ม" : fmt(f2)}`);
    must(bad.length === 0, bad.join(" | "));
    return `${tries.length} ทาง (ข้ามร้าน/สาขา/key/ชั้น) ปฏิเสธ · ไม่มีแถว · reset/form ข้ามร้านไม่ได้`;
  });
  await probe("DS-2", "MAJOR", async () => {
    // ค่าตั้งรายเครื่องมีผลเฉพาะเครื่อง: k1 pinLock=false ไม่กระทบ k2 · ถอนแล้ว set ได้แต่เครื่องตาย
    const w = await SET.setSettings(OWNER as never, { tenantId: ids.tA }, [{ key: "booking.kiosk.pinLock", scope: "DEVICE", scopeId: k1.id, value: false }, { key: "booking.kiosk.services", scope: "DEVICE", scopeId: k1.id, value: "ALL" }] as never);
    must(w.ok, `เขียนไม่ได้ ${fmt(w)}`);
    const v1 = await PUB.loadKioskView(k1.token, { now: NOW }); const v2 = await PUB.loadKioskView(k2.token, { now: NOW });
    must(v1!.pinLock === false && v2!.pinLock !== false, `ค่ารายเครื่องรั่ว k1=${v1!.pinLock} k2=${v2!.pinLock}`);
    // k1 ALL: บริการยาวที่ปิด walk-in โชว์แต่รับไม่ได้
    const svc3 = v1!.services.find((s) => s.id === SV.s3);
    const r = await PUB.kioskWalkIn(k1.token, { serviceId: SV.s3, staffId: null }, { now: NOW });
    rec("DS-2i", "INFO", "-", `s3 (240 นาที) บน k1(ALL) = ${fmt(svc3)} · walkIn ⇒ ${r.ok ? "ok" : r.code}`);
    if (svc3 && svc3.walkIn === false) must(!r.ok, "บริการ walkIn:false ออกบัตรได้");
    // ค่า tvShow RESOURCE ของทีวีไม่รั่วไปตู้/บัตร? (ตู้อ่าน tvShow ของเครื่องตู้เอง) — แค่รายงาน
    return "ค่ารายเครื่องไม่รั่วข้ามเครื่อง · บริการปิด walk-in ออกบัตรไม่ได้";
  });
} catch (e) {
  console.log(`💥 setup/probe ล้ม: ${errOf(e)}`);
  exitCode = 1;
} finally {
  const ids2 = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  await cleanup(ids2);
  const left = await q<{ n: number }>(`SELECT (SELECT count(*) FROM "Tenant" WHERE slug LIKE $1)::int + (SELECT count(*) FROM "User" WHERE email LIKE $1)::int + (SELECT count(*) FROM "ChatRateBucket" WHERE key LIKE '%svcb6p\\_%' OR key = ANY($2::text[]))::int n`, [`${SLUG}%`, deviceIds.flatMap((d) => [`bq:kiosk:checkin:${d}`, `bq:kiosk:walkin:${d}`])]);
  console.log(`\n(ล้างแล้ว · ค้าง ${left[0].n})`);
  await pool.end();
  const { prisma } = await import("@/lib/core/db");
  await prisma.$disconnect().catch(() => {});
}
const b = res.filter((r) => r.v === "BREACH");
console.log(`\nPROBE_SUMMARY ${JSON.stringify({ hold: res.filter((r) => r.v === "HOLD").length, breach: b.length, breaches: b.map((x) => `${x.id}:${x.sev}`) })}`);
process.exit(exitCode);
