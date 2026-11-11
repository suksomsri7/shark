// probe-b7-b — reviewer B (โจมตีด้วย probe จริงหลายโพรเซส) ของ WO SVC B.7 · ไม่ใช่ข้อสอบ · ไม่แก้ src/
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b7-b.mts
// ร้านชั่วคราว slug `qc-svc-b7p-*` · id `svcb7p_*` · IP `svcb7p-*` · ล้างใน finally (+ กวาดค้างตอนเริ่ม)
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { writeFileSync, rmSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { sqcIdentityToken } from "./svc-qc-data.mjs";

loadSvcQcEnv("probe-b7-b");
if (process.env.CI) { console.error("ห้าม CI"); process.exit(4); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type AnyFn = (...a: never[]) => Promise<unknown>;
type R = Record<string, unknown>;
const ON = (await import("@/lib/modules/booking/online")) as unknown as Record<string, AnyFn> & { ONLINE_RATE: unknown };
const MT = (await import("@/lib/modules/booking/manage-token")) as unknown as { manageToken: (id: string) => string | null; manageTokenHash: (t: string) => string };
const BK = (await import("@/lib/modules/booking/service")) as unknown as Record<string, AnyFn>;
const LN = (await import("@/lib/modules/booking/queue-line")) as unknown as Record<string, AnyFn>;
const SET = (await import("@/lib/core/settings")) as unknown as Record<string, AnyFn>;
const LINK = (await import("@/lib/core/signed-link")) as unknown as { signLink: (i: { tenantId: string; purpose: string; subjectId: string; expMin: number }) => string };
const React = (await import("react")).default;
const RDS = await import("react-dom/server");
const ManageCard = (await import("@/components/booking/online/ManageCard")).default;
const PublicBooking = (await import("@/components/public-booking")).default;
const call = <T = R,>(f: AnyFn, ...a: unknown[]) => (f as unknown as (...x: unknown[]) => Promise<T>)(...a);

type V = "HOLD" | "BREACH" | "INFO";
const res: { id: string; v: V; sev: string; msg: string }[] = [];
const rec = (id: string, v: V, sev: string, msg: string) => { res.push({ id, v, sev, msg }); console.log(`${v === "HOLD" ? "✅" : v === "BREACH" ? "🔴" : "ℹ️ "} [${id}] ${v}${v === "BREACH" ? `(${sev})` : ""} — ${msg}`); };
const errOf = (e: unknown) => (e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown) => { try { return JSON.stringify(v)?.slice(0, 400); } catch { return String(v); } };
class Breach extends Error {}
class Info extends Error {}
const must = (c: boolean, m: string) => { if (!c) throw new Breach(m); };
const probe = async (id: string, sev: string, fn: () => Promise<string | void>) => {
  try { const m = await fn(); rec(id, "HOLD", sev, m || "ok"); } catch (e) { rec(id, e instanceof Info ? "INFO" : "BREACH", sev, e instanceof Breach || e instanceof Info ? e.message : `throw: ${errOf(e)}`); }
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, p: unknown[] = []) => (await pool.query<T>(sql, p)).rows;
const colCache = new Map<string, { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>();
const rid = (p: string) => `svcb7p_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function insertRow(table: string, vals: R) {
  if (!colCache.has(table)) colCache.set(table, await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]) as never);
  const v: R = { ...vals };
  for (const c of colCache.get(table)!) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : null;
  }
  const k = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${k.map((x) => `"${x}"`).join(",")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(",")})`, k.map((x) => v[x]));
}
const SLUG = "qc-svc-b7p-";
const TOKENS = new Set<string>();
const REAL = new Set<string>();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
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
}
async function cleanupBuckets() {
  try {
    await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE '%svcb7p%' OR key LIKE '%qc-svc-b7p-%'`);
    const keys = [...TOKENS].map((t) => `bq:manage:tk:${sha(t).slice(0, 32)}`);
    if (keys.length) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [keys]);
  } catch (e) { console.log(`⚠️ bucket ${errOf(e)}`); }
}

// ── เวลา ──
const MIN = 60_000;
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ds: string, n: number) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkMs = (ds: string, min: number) => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * MIN; };
const at = (ds: string, min: number) => new Date(bkkMs(ds, min));
const TODAY = bkkToday();
let dayN = 2;
const nextDay = () => { const d = addDays(TODAY, dayN++); if (dayN > 29) throw new Error("วันหมด"); return d; };
const RUN = Date.now().toString(36);
const T = (k: string) => `svcb7p_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"), uO: T("uO"), uO2: T("uO2"), uS: T("uS"), uQ: T("uQ"), uB: T("uB"),
  CUT: T("CUT"), PERM: T("PERM"), O2CUT: T("O2CUT"), SCUT: T("SCUT"), BCUT: T("BCUT"),
  ek: T("ek"), boy: T("boy"), nun: T("nun"), jack: T("jack"), hid: T("hid"), a2: T("a2"), s1: T("s1"), s2: T("s2"), b1: T("b1"),
  P1: T("P1"), PM: T("PM"), PB: T("PB"), P3: T("P3"), owner: T("owner"), ownerB: T("ownerB"),
};
const SL: Record<string, string> = {};
const ref = (u: string, t = ids.tA) => ({ tenantSlug: SL[t], unitSlug: SL[u] });
const cO = { tenantId: ids.tA, unitId: ids.uO };
const cS = { tenantId: ids.tA, unitId: ids.uS };
const cB = { tenantId: ids.tB, unitId: ids.uB };
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
const OWNER_B = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.ownerB };
let ipSeq = 0;
const ip = () => `svcb7p-${RUN}-${++ipSeq}`;
// PII
const PHONES: string[] = ["0813337001", "0813337002", "0813337003"];
const NAMES: string[] = ["คุณลับพีหนึ่ง", "คุณลับรวมแล้ว", "คุณลับร้านบี", "คุณไม่มีเบอร์พี"];
let pseq = 0;
const RUNN = (Date.now() % 10_000).toString().padStart(4, "0");
const newPhone = () => { const p = `096${RUNN}${String(++pseq).padStart(3, "0")}`; PHONES.push(p); return p; };
const newName = () => { const n = `คุณโพรบเจ็ด${++pseq}ลับ`; NAMES.push(n); return n; };
const NOTE = `NOTE-ลับ-${RUN}`;
const piiIn = (s: string) => [...PHONES.filter((p) => s.includes(p) || s.includes(`${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`) || s.includes(`66${p.slice(1)}`)), ...NAMES.filter((n) => s.includes(n)), ...(s.includes(NOTE) ? ["NOTE"] : [])];
const rand43 = () => randomBytes(32).toString("base64url");
const tokOf = (u: unknown) => { const s = String(u ?? ""); if (!s.startsWith("/bq/m/")) throw new Breach(`manageUrl ${fmt(u)}`); const t = s.slice(6); TOKENS.add(t); REAL.add(t); return t; };
type Appt = { id: string; staffId: string; startAt: Date; endAt: Date; status: string; rescheduleCount: number; channel: string | null; partyId: string | null; customerName: string; customerPhone: string; priceSatang: number; depositSatang: number; cancelReason: string | null; manageTokenHash: string | null };
const row = async (id: string) => (await q<Appt>(`SELECT id, "staffId", "startAt", "endAt", status::text AS status, "rescheduleCount", channel, "partyId", "customerName", "customerPhone", "priceSatang", "depositSatang", "cancelReason", "manageTokenHash" FROM "Appointment" WHERE id = $1`, [id]))[0];
const rowByKey = async (k: string) => (await q<{ id: string }>(`SELECT id FROM "Appointment" WHERE "tenantId" = ANY($1::text[]) AND "idempotencyKey" = $2`, [[ids.tA, ids.tB], k]))[0]?.id;
const overlaps = async (unitId: string, ds: string) => q<{ a: string; b: string; staff: string }>(
  `SELECT x.id AS a, y.id AS b, x."staffId" AS staff FROM "Appointment" x JOIN "Appointment" y ON x."staffId" = y."staffId" AND x.id < y.id
   AND x."startAt" < y."endAt" AND y."startAt" < x."endAt"
   WHERE x."unitId" = $1 AND y."unitId" = $1 AND x."startAt" >= $2 AND x."startAt" < $3
   AND x.status NOT IN ('CANCELLED','NO_SHOW','DONE') AND y.status NOT IN ('CANCELLED','NO_SHOW','DONE')`, [unitId, at(ds, 0), at(ds, 1440)]);
const evs = async (type: string, apptId: string) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type = $2 AND payload->>'appointmentId' = $3`, [[ids.tA, ids.tB], type, apptId]))[0].n;
const render = (C: unknown, props: R) => RDS.renderToStaticMarkup(React.createElement(C as never, props as never));

// จองออนไลน์ที่ต้องสำเร็จ
const bookOk = async (u: string, i: R, t = ids.tA) => {
  const key = rid("k");
  const r = await call(ON.bookOnline, ref(u, t), { name: newName(), phone: newPhone(), idempotencyKey: key, ...i }, { ip: ip() });
  if (!r.ok) throw new Error(`bookOnline ${fmt(r)} ${fmt(i)}`);
  const id = await rowByKey((i.idempotencyKey as string) ?? key);
  return { id, token: tokOf(r.manageUrl), res: r };
};
const MV = (t: unknown, o: R = {}) => { if (typeof t === "string") TOKENS.add(t); return call(ON.loadManageView, t, { ip: ip(), ...o }); };
const RS = (t: unknown, to: R, o: R = {}) => { if (typeof t === "string") TOKENS.add(t); return call(ON.rescheduleOnline, t, to, { ip: ip(), ...o }); };
const CN = (t: unknown, o: R = {}) => { if (typeof t === "string") TOKENS.add(t); return call(ON.cancelOnline, t, { ip: ip(), ...o }); };
const ICS = (t: unknown, o: R = {}) => { if (typeof t === "string") TOKENS.add(t); return call<string | null>(ON.loadManageIcs, t, { ip: ip(), ...o }); };

// ── สายยิงพร้อมกันข้ามโพรเซส ──
type Call = R & { fn: string; tag?: string };
type Out = { fn: string; tag: string; ok: boolean; code: string | null; reason: string | null; staffId: string | null; threw: string | null; ms: number };
const NCH = 5;
async function harness(scs: { key: string; calls: Call[] }[]): Promise<Map<string, Out[]>> {
  const go = `/tmp/svc-b7p-go-${RUN}`;
  const out = new Map<string, Out[]>();
  const ready = new Map<string, Set<number>>();
  const got = new Map<string, Map<number, Out[]>>();
  const dead = new Set<number>();
  const errs: string[] = [];
  const kids = Array.from({ length: NCH }, (_, idx) => {
    const spec = { go, scenarios: scs.map((s) => ({ key: s.key, calls: s.calls.filter((_, i) => i % NCH === idx) })) };
    const ch = spawn("pnpm", ["exec", "tsx", join(ROOT, "scripts/probe-b7-b-child.mts")], { cwd: ROOT, env: { ...process.env, PROBE_B7_CHILD: JSON.stringify(spec) }, stdio: ["ignore", "pipe", "pipe"] });
    createInterface({ input: ch.stdout }).on("line", (l) => {
      const m = /^(READY|RES) (\S+)(?: (.*))?$/.exec(l);
      if (m?.[1] === "READY") { if (!ready.has(m[2])) ready.set(m[2], new Set()); ready.get(m[2])!.add(idx); }
      else if (m?.[1] === "RES") { if (!got.has(m[2])) got.set(m[2], new Map()); got.get(m[2])!.set(idx, JSON.parse(m[3] ?? "[]") as Out[]); }
      else if (l.startsWith("CHILD_ERR")) errs.push(`#${idx} ${l}`);
    });
    let tail = "";
    ch.stderr.on("data", (b: Buffer) => { tail = (tail + b.toString()).slice(-400); });
    ch.on("exit", (code) => { dead.add(idx); if (code !== 0) errs.push(`#${idx} exit ${code} ${tail}`); });
    return ch;
  });
  const waitFor = async (c: () => boolean, ms: number) => { const t = Date.now(); while (!c()) { if (Date.now() - t > ms) return false; await new Promise((r) => setTimeout(r, 20)); } return true; };
  try {
    for (const [si, sc] of scs.entries()) {
      const ok = await waitFor(() => [...Array(NCH).keys()].every((i) => ready.get(sc.key)?.has(i)), si === 0 ? 240_000 : 90_000);
      if (!ok) throw new Error(`ลูกไม่พร้อม ${sc.key} ${errs.slice(0, 2).join(" · ")}`);
      writeFileSync(`${go}-${sc.key}`, "go");
      await waitFor(() => [...Array(NCH).keys()].every((i) => got.get(sc.key)?.has(i) || dead.has(i)), 240_000);
      out.set(sc.key, [...Array(NCH).keys()].flatMap((i) => got.get(sc.key)?.get(i) ?? []));
    }
  } finally {
    await waitFor(() => dead.size === NCH, 30_000);
    for (const k of kids) if (k.exitCode === null) k.kill("SIGKILL");
    for (const sc of scs) rmSync(`${go}-${sc.key}`, { force: true });
  }
  return out;
}
const bad = (r: Out[], allowed: string[]) => r.filter((x) => x.threw || (!x.ok && !allowed.includes(x.code ?? "")) || /P2028|P2034|40P01|deadlock/i.test(`${x.reason}`));

console.log(`(probe-b7-b · วันนี้ ${TODAY} · SESSION_SECRET ${(process.env.SESSION_SECRET ?? "").length >= 32 ? "มี" : "ไม่มี"})`);
let exitCode = 0;
try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาดค้าง ${stale.length})`); await cleanup(stale); }
  await cleanupBuckets();
  // ═══ ข้อมูล ═══
  for (const [id, n, name] of [[ids.tA, "a", "Probe B7 A"], [ids.tB, "b", "Probe B7 B"]] as const) {
    SL[id] = `${SLUG}${n}-${RUN}`;
    await insertRow("Tenant", { id, name, slug: SL[id], updatedAt: new Date() });
  }
  for (const [id, t, n, type] of [[ids.uO, ids.tA, "o", "BOOKING"], [ids.uO2, ids.tA, "o2", "BOOKING"], [ids.uS, ids.tA, "s", "BOOKING"], [ids.uQ, ids.tA, "q", "QUEUE"], [ids.uB, ids.tB, "b", "BOOKING"]] as const) {
    SL[id] = `b7p-${n}-${RUN}`;
    await insertRow("BusinessUnit", { id, tenantId: t, type, name: `สาขา ${n}`, slug: SL[id], updatedAt: new Date() });
    if (type === "BOOKING") for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: new Date() });
  }
  const svc = (id: string, t: string, u: string, name: string, dur: number, price: number, so: number, dep = 0) => insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin: dur, priceSatang: price, bufferMin: 0, depositSatang: dep, bookable: true, sortOrder: so, updatedAt: new Date() });
  await svc(ids.CUT, ids.tA, ids.uO, "ตัดผมชาย", 45, 25000, 1); await svc(ids.PERM, ids.tA, ids.uO, "ดัดผม", 120, 150000, 2, 30000);
  await svc(ids.O2CUT, ids.tA, ids.uO2, "ตัดผม o2", 45, 25000, 1); await svc(ids.SCUT, ids.tA, ids.uS, "ตัดผม s", 45, 25000, 1); await svc(ids.BCUT, ids.tB, ids.uB, "ตัดผม B", 45, 25000, 1);
  let ord = 0;
  const staff = (id: string, t: string, u: string, name: string, so: number) => insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder: so, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
  for (const [i, [k, n]] of ([[ids.ek, "ช่างเอก"], [ids.boy, "ช่างบอย"], [ids.nun, "ช่างนุ่น"], [ids.jack, "ช่างแจ๊ค"], [ids.hid, "ช่างซ่อน"]] as const).entries()) await staff(k, ids.tA, ids.uO, n, i + 1);
  await staff(ids.a2, ids.tA, ids.uO2, "ช่างสาขาสอง", 1); await staff(ids.s1, ids.tA, ids.uS, "ช่างหนึ่ง", 1); await staff(ids.s2, ids.tA, ids.uS, "ช่างสอง", 2); await staff(ids.b1, ids.tB, ids.uB, "ช่างร้านบี", 1);
  // ช่างเอก: ราคาเฉพาะคน 400 บาท (ตัด) — ใช้ตรวจราคาหลังเลื่อนข้ามช่าง
  await insertRow("BookingStaffService", { id: rid("bss"), tenantId: ids.tA, unitId: ids.uO, staffId: ids.ek, serviceId: ids.CUT, priceSatang: 40000, updatedAt: new Date() });
  await insertRow("BookingStaffService", { id: rid("bss"), tenantId: ids.tA, unitId: ids.uO, staffId: ids.ek, serviceId: ids.PERM, updatedAt: new Date() });
  await insertRow("Party", { id: ids.P1, tenantId: ids.tA, name: NAMES[0], phone: PHONES[0], phoneNorm: PHONES[0], updatedAt: new Date() });
  await insertRow("Party", { id: ids.PM, tenantId: ids.tA, name: NAMES[1], phone: PHONES[1], phoneNorm: PHONES[1], mergedIntoId: ids.P1, updatedAt: new Date() });
  await insertRow("Party", { id: ids.PB, tenantId: ids.tB, name: NAMES[2], phone: PHONES[2], phoneNorm: PHONES[2], updatedAt: new Date() });
  await insertRow("Party", { id: ids.P3, tenantId: ids.tA, name: NAMES[3], updatedAt: new Date() });
  for (const [a, t, u] of [[OWNER, ids.tA, ids.uO], [OWNER, ids.tA, ids.uO2], [OWNER, ids.tA, ids.uS], [OWNER_B, ids.tB, ids.uB]] as const) {
    const r = await call(SET.applyTemplate, a, { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    if (!r.ok) throw new Error(`applyTemplate ${u} ${fmt(r)}`);
  }
  for (const [key, scope, scopeId, value] of [
    ["booking.queue.singleLine", "UNIT", ids.uS, true], ["booking.booking.onlineSharePct", "STAFF", ids.jack, 0],
    ["booking.staff.customerCanChoose", "STAFF", ids.hid, false], ["booking.booking.requireConfirm", "SERVICE", ids.PERM, true],
  ] as const) {
    const r = await call(SET.setSettings, OWNER, { tenantId: ids.tA }, [{ key, scope, scopeId, value }]);
    if (!r.ok) throw new Error(`setSettings ${key} ${fmt(r)}`);
  }
  const rules = await call<{ stepMin: number; minLeadMin: number; horizonDays: number; anyStaff: boolean }>(BK.onlineRulesOf, cO, ids.CUT);
  console.log(`(ข้อมูลพร้อม · rules ${fmt(rules)})`);
  const STEP = rules.stepMin;

  // ═══ C: ยิงพร้อมกันข้ามโพรเซส ═══
  console.log("\n── C. จองซ้อน/เลื่อนพร้อมกัน (5 โพรเซส) ──");
  const d1 = nextDay(), d2 = nextDay(), d3 = nextDay(), d4 = nextDay(), d5 = nextDay(), d6 = nextDay();
  const bi = (o: R): R => ({ name: newName(), phone: newPhone(), idempotencyKey: rid("k"), ...o });
  // C1: ช่างเอก 15:00 — จองระบุ 3 · ใครก็ได้ 2 · พนักงานจอง 2 · เลื่อน 3 นัดเข้าช่องเดียว
  const c1a = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: d1, startMin: 600 });
  const c1b = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.boy, dateStr: d1, startMin: 600 });
  const c1c = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.nun, dateStr: d1, startMin: 660 });
  // C2: หน่วยแถวเดียว 10:15 ช่างสอง — จอง ∥ walk-in ∥ ย้ายช่าง ∥ เลื่อนเอง ∥ เช็กอิน
  const w0 = await call(LN.createWalkIn, cS, { serviceId: ids.SCUT, staffId: ids.s1, channel: "STAFF" }, { now: at(d2, 600) });
  if (!w0.ok) throw new Error(`walk-in ${fmt(w0)}`);
  const c2r = await bookOk(ids.uS, { serviceId: ids.SCUT, staffId: ids.s1, dateStr: d2, startMin: 840 });
  const c2k = await bookOk(ids.uS, { serviceId: ids.SCUT, staffId: ids.s2, dateStr: d2, startMin: 660 });
  if ((await row(c2k.id)).status === "PENDING") await call(BK.setAppointmentStatus, ids.tA, ids.uS, c2k.id, "CONFIRMED");
  // C3: เลื่อนแล้ว 1 ครั้ง (เหลือ 1) — 10 ทางคนละเวลา ⇒ สำเร็จพอดี 1
  const c3 = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.boy, dateStr: d3, startMin: 600 });
  const c3pre = await RS(c3.token, { dateStr: d3, startMin: 660, staffId: ids.boy });
  if (!c3pre.ok) throw new Error(`C3 pre ${fmt(c3pre)}`);
  // C4: 10 ทางเลื่อนไปเวลาเดียวกัน
  const c4 = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.nun, dateStr: d4, startMin: 600 });
  // C5: เลื่อน ∥ ยกเลิก ∥ ร้านยกเลิก ∥ ร้านเลื่อน
  const c5 = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.nun, dateStr: d5, startMin: 600 });
  const c5b = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.boy, dateStr: d5, startMin: 600 });
  // C6: 6 นัด ⇒ ใครก็ได้ 17:00 + จองใครก็ได้ 4
  const c6: { id: string; token: string }[] = [];
  for (const [s, m] of [[ids.ek, 600], [ids.ek, 690], [ids.boy, 600], [ids.boy, 690], [ids.nun, 600], [ids.nun, 690]] as const) c6.push(await bookOk(ids.uO, { serviceId: ids.CUT, staffId: s, dateStr: d6, startMin: m }));

  const tenOf = (f: (i: number) => Call) => Array.from({ length: 10 }, (_, i) => f(i));
  const bk = (u: string, o: R, tag = "book"): Call => ({ fn: "book", tag, ref: ref(u), input: bi(o), ip: ip() });
  const scs: { key: string; calls: Call[] }[] = [
    { key: "c1", calls: [
      bk(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: d1, startMin: 900 }), bk(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: d1, startMin: 900 }), bk(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: d1, startMin: 900 }),
      bk(ids.uO, { serviceId: ids.CUT, staffId: null, dateStr: d1, startMin: 900 }, "any"), bk(ids.uO, { serviceId: ids.CUT, staffId: null, dateStr: d1, startMin: 900 }, "any"),
      { fn: "b3", ctx: cO, input: { serviceId: ids.CUT, staffId: ids.ek, dateStr: d1, startMin: 900, customerName: newName(), customerPhone: newPhone() } },
      { fn: "b3", ctx: cO, input: { serviceId: ids.CUT, staffId: ids.ek, dateStr: d1, startMin: 900, customerName: newName(), customerPhone: newPhone() } },
      { fn: "resched", tag: "a", token: c1a.token, to: { dateStr: d1, startMin: 900, staffId: ids.ek }, ip: ip() },
      { fn: "resched", tag: "b", token: c1b.token, to: { dateStr: d1, startMin: 900, staffId: ids.ek }, ip: ip() },
      { fn: "resched", tag: "c", token: c1c.token, to: { dateStr: d1, startMin: 900, staffId: ids.ek }, ip: ip() },
    ] },
    { key: "c2", calls: [
      bk(ids.uS, { serviceId: ids.SCUT, staffId: ids.s2, dateStr: d2, startMin: 615 }), bk(ids.uS, { serviceId: ids.SCUT, staffId: ids.s2, dateStr: d2, startMin: 615 }),
      bk(ids.uS, { serviceId: ids.SCUT, staffId: null, dateStr: d2, startMin: 615 }, "any"),
      { fn: "walkin", ctx: cS, serviceId: ids.SCUT, now: at(d2, 600).toISOString() }, { fn: "walkin", ctx: cS, serviceId: ids.SCUT, now: at(d2, 600).toISOString() },
      { fn: "move", ctx: cS, id: w0.appointmentId, to: ids.s2, now: at(d2, 600).toISOString() },
      { fn: "resched", token: c2r.token, to: { dateStr: d2, startMin: 615, staffId: ids.s2 }, ip: ip() },
      { fn: "resched", token: c2r.token, to: { dateStr: d2, startMin: 615, staffId: null }, ip: ip() },
      { fn: "checkin", ctx: cS, id: c2k.id, now: at(d2, 600).toISOString() }, { fn: "checkin", ctx: cS, id: c2k.id, now: at(d2, 600).toISOString() },
    ] },
    { key: "c3", calls: tenOf((i) => ({ fn: "resched", token: c3.token, to: { dateStr: d3, startMin: 720 + i * 30, staffId: ids.boy }, ip: ip() })) },
    { key: "c4", calls: tenOf(() => ({ fn: "resched", token: c4.token, to: { dateStr: d4, startMin: 900, staffId: ids.nun }, ip: ip() })) },
    { key: "c5", calls: [
      ...[720, 780, 840, 900].map((m): Call => ({ fn: "resched", token: c5.token, to: { dateStr: d5, startMin: m, staffId: ids.nun }, ip: ip() })),
      ...[0, 1, 2].map((): Call => ({ fn: "cancel", token: c5.token, ip: ip() })),
      { fn: "shopCancel", ctx: cO, id: c5.id },
      { fn: "shopResched", ctx: cO, id: c5.id, to: { dateStr: d5, startMin: 1020, staffId: ids.nun } },
      { fn: "shopResched", ctx: cO, id: c5.id, to: { dateStr: d5, startMin: 1080, staffId: ids.nun } },
    ] },
    { key: "c5b", calls: [
      ...[720, 780, 840, 900, 960].map((m): Call => ({ fn: "resched", token: c5b.token, to: { dateStr: d5, startMin: m, staffId: ids.boy }, ip: ip() })),
      ...[0, 1, 2].map((): Call => ({ fn: "cancel", token: c5b.token, ip: ip() })),
      { fn: "shopResched", ctx: cO, id: c5b.id, to: { dateStr: d5, startMin: 1020, staffId: ids.boy } },
      { fn: "shopResched", ctx: cO, id: c5b.id, to: { dateStr: d5, startMin: 1080, staffId: ids.boy } },
    ] },
    { key: "c6", calls: [
      ...c6.map((x): Call => ({ fn: "resched", token: x.token, to: { dateStr: d6, startMin: 1020, staffId: null }, ip: ip() })),
      ...[0, 1, 2, 3].map(() => bk(ids.uO, { serviceId: ids.CUT, staffId: null, dateStr: d6, startMin: 1020 }, "any")),
    ] },
  ];
  let H = new Map<string, Out[]>();
  let herr = "";
  try { H = await harness(scs); } catch (e) { herr = errOf(e); }
  const HR = (k: string) => { must(!herr, `สายยิงพร้อมกันล้ม ${herr}`); const r = H.get(k) ?? []; must(r.length === 10, `${k} ได้ผล ${r.length}/10`); return r; };
  const sm = (r: Out[]) => r.map((x) => `${x.fn}${x.tag ? `:${x.tag}` : ""}=${x.ok ? "OK" : x.code}`).join(" ");
  const maxMs = (r: Out[]) => Math.max(...r.map((x) => x.ms));
  await probe("C1", "BLOCKER", async () => {
    const r = HR("c1");
    const b = bad(r, ["FULL", "LOST_RACE", "BUSY"]);
    must(b.length === 0, `throw/รหัสนอกชุด ${fmt(b)}`);
    const ov = await overlaps(ids.uO, d1);
    must(ov.length === 0, `ช่างซ้อน ${fmt(ov)}`);
    const n = (await q<{ n: number }>(`SELECT count(*)::int n FROM "Appointment" WHERE "staffId" = $1 AND "startAt" = $2 AND status NOT IN ('CANCELLED','NO_SHOW')`, [ids.ek, at(d1, 900)]))[0].n;
    must(n === 1, `ช่างเอก 15:00 มี ${n} แถว`);
    for (const [x, t] of [[c1a, "a"], [c1b, "b"], [c1c, "c"]] as const) {
      const o = r.find((y) => y.fn === "resched" && y.tag === t)!;
      const a = await row(x.id);
      must((a.startAt.getTime() === at(d1, 900).getTime() && a.staffId === ids.ek) === o.ok, `แถวเลื่อน ${t} ไม่ตรงผล ${o.ok}`);
    }
    return `${sm(r)} · ไม่มีซ้อน (SQL) · ช่อง 1 เจ้าของ · ช้าสุด ${maxMs(r)}ms`;
  });
  await probe("C2", "BLOCKER", async () => {
    const r = HR("c2");
    const b = bad(r, ["FULL", "LOST_RACE", "BUSY", "WALKIN_CLOSED", "CLASH", "BAD_STATE", "NOT_TODAY", "NOT_CONFIRMED"]);
    must(b.length === 0, `throw/รหัสนอกชุด ${fmt(b)}`);
    const ov = await overlaps(ids.uS, d2);
    must(ov.length === 0, `ช่างซ้อน ${fmt(ov)}`);
    const rr = r.filter((x) => x.fn === "resched");
    must(rr.filter((x) => x.ok).length <= 1 || (await row(c2r.id)).rescheduleCount === rr.filter((x) => x.ok).length, "นับเลื่อนไม่ตรง");
    return `${sm(r)} · ไม่มีซ้อน · ช้าสุด ${maxMs(r)}ms`;
  });
  await probe("C3", "BLOCKER", async () => {
    const r = HR("c3");
    const okN = r.filter((x) => x.ok).length;
    const b = bad(r, ["MAX_RESCHEDULE", "LOST_RACE", "BUSY", "RATE_LIMITED"]);
    must(b.length === 0, `throw/รหัสนอกชุด ${fmt(b)}`);
    const a = await row(c3.id);
    must(okN === 1 && a.rescheduleCount === 2, `สำเร็จ ${okN} (ต้อง 1) · count ${a.rescheduleCount}`);
    const e = await evs("booking.rescheduled", c3.id);
    must(e === 2, `event rescheduled ${e} (ต้อง 2)`);
    return `${sm(r)} · count 2 · event 2`;
  });
  await probe("C4", "MINOR", async () => {
    const r = HR("c4");
    const okN = r.filter((x) => x.ok).length;
    must(bad(r, ["MAX_RESCHEDULE", "LOST_RACE", "BUSY", "FULL"]).length === 0, `throw ${fmt(bad(r, ["MAX_RESCHEDULE", "LOST_RACE", "BUSY", "FULL"]))}`);
    const a = await row(c4.id);
    const e = await evs("booking.rescheduled", c4.id);
    must(okN <= 2 && a.rescheduleCount === okN, `สำเร็จ ${okN} · count ${a.rescheduleCount}`);
    if (okN === 2) throw new Info(`10 ทางเวลาเดียวกัน ⇒ สำเร็จ 2 (ครั้งที่ 2 = เลื่อนไปเวลาที่ถืออยู่แล้ว · no-op ที่กินโควตาเลื่อน) · count 2 · event ${e} (คีย์ซ้ำ ⇒ event หาย ${2 - e}) — ไม่ซ้อน`);
    return `สำเร็จ ${okN} · count ${a.rescheduleCount} · event ${e}`;
  });
  const c5check = async (key: string, ap: { id: string }) => {
    const r = HR(key);
    const b5 = [...bad(r.filter((x) => x.fn === "resched" || x.fn === "cancel"), ["MAX_RESCHEDULE", "LOST_RACE", "BUSY", "BAD_STATE", "FULL", "NOT_FOUND"]), ...r.filter((x) => x.threw || /P2028|P2034|40P01|deadlock/i.test(`${x.reason}`))];
    must(b5.length === 0, `throw/รหัสนอกชุด ${fmt(b5)}`);
    const a = await row(ap.id);
    const cust = r.filter((x) => x.fn === "resched" && x.ok).length;
    const shop = r.filter((x) => x.fn === "shopResched" && x.ok).length;
    const cx = r.filter((x) => (x.fn === "cancel" || x.fn === "shopCancel") && x.ok).length;
    const eC = await evs("booking.cancelled", ap.id);
    const eR = await evs("booking.rescheduled", ap.id);
    must(a.rescheduleCount === cust && cust <= 2, `count ${a.rescheduleCount} ≠ ลูกค้าเลื่อนสำเร็จ ${cust}`);
    must(cx <= 1, `ยกเลิกสำเร็จ ${cx} ครั้ง`);
    must((a.status === "CANCELLED") === (cx === 1), `สถานะ ${a.status} ยกเลิกสำเร็จ ${cx}`);
    const custCx = r.some((x) => x.fn === "cancel" && x.ok);
    if (custCx) must(eC === 1 && a.cancelReason === "CUSTOMER", `ลูกค้ายกเลิก: event ${eC} reason ${a.cancelReason}`);
    must(eC <= 1, `booking.cancelled ${eC}`);
    must(eR === cust + shop, `booking.rescheduled ${eR} ≠ ${cust}+${shop}`);
    must((await overlaps(ids.uO, d5)).length === 0, "ซ้อน");
    return `${sm(r)} · ${a.status}/${a.cancelReason} · count ${a.rescheduleCount} · ev cancelled ${eC} rescheduled ${eR}`;
  };
  await probe("C5", "BLOCKER", () => c5check("c5", c5));
  await probe("C5b", "BLOCKER", () => c5check("c5b", c5b));
  await probe("C6", "BLOCKER", async () => {
    const r = HR("c6");
    must(bad(r, ["FULL", "LOST_RACE", "BUSY"]).length === 0, `throw/รหัสนอกชุด ${fmt(bad(r, ["FULL", "LOST_RACE", "BUSY"]))}`);
    const holders = await q<{ staffId: string }>(`SELECT "staffId" FROM "Appointment" WHERE "unitId" = $1 AND "startAt" = $2 AND status NOT IN ('CANCELLED','NO_SHOW')`, [ids.uO, at(d6, 1020)]);
    const okN = r.filter((x) => x.ok).length;
    must(okN === holders.length && okN <= 4 && new Set(holders.map((h) => h.staffId)).size === holders.length, `สำเร็จ ${okN} · เจ้าของช่อง ${fmt(holders)}`);
    must(!holders.some((h) => h.staffId === ids.jack), "ช่าง 0% ได้งานออนไลน์");
    must((await overlaps(ids.uO, d6)).length === 0, "ซ้อน");
    return `${sm(r)} · เจ้าของ ${holders.length} คนละช่าง`;
  });

  // ═══ R: เลื่อนเอง (โพรเซสเดียว) ═══
  console.log("\n── R. เลื่อนเอง ──");
  const dR = nextDay();
  await probe("R1", "MAJOR", async () => {
    // เลื่อนไปช่องที่ทับช่วงของตัวเองบางส่วน (ไม่นับแถวตัวเอง)
    const a = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.boy, dateStr: dR, startMin: 600 });
    const r1 = await RS(a.token, { dateStr: dR, startMin: 600 + STEP, staffId: ids.boy });
    must(r1.ok === true, `เลื่อนทับตัวเองบางส่วน ⇒ ${fmt(r1)}`);
    const v = await call(BK.findSlots, cO, { serviceId: ids.CUT, staffId: ids.boy, dateStr: dR, channel: "ONLINE" }, { excludeAppointmentId: a.id }) as unknown as { startMin: number }[];
    must(v.some((s) => s.startMin === 600), "findSlots(exclude) ไม่เห็นช่องเดิมของตัวเองว่าง");
    const r2 = await RS(a.token, { dateStr: dR, startMin: 600, staffId: ids.boy });
    must(r2.ok === true, `เลื่อนกลับทับ ${fmt(r2)}`);
    const x = await row(a.id);
    must(x.rescheduleCount === 2 && x.startAt.getTime() === at(dR, 600).getTime(), `แถว ${fmt(x)}`);
    must((await overlaps(ids.uO, dR)).length === 0, "ซ้อน");
    return `ทับตัวเอง ±${STEP} นาที ⇒ ok · count 2`;
  });
  await probe("R2", "MAJOR", async () => {
    // เลยเวลาฟรี (now ฉีด) · นัดที่ร้านยกเลิกแล้ว · DONE/NO_SHOW
    const a = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.nun, dateStr: dR, startMin: 900 });
    const v = await MV(a.token);
    must(v.ok === true, fmt(v));
    const free = (v.view as R).freeUntilMs as number;
    const late = new Date(free + MIN);
    const r1 = await RS(a.token, { dateStr: dR, startMin: 960, staffId: ids.nun }, { now: late });
    const r2 = await CN(a.token, { now: late });
    must(r1.code === "LATE_CHANGE" && r2.code === "LATE_CHANGE", `เลยเวลา ${fmt(r1)} ${fmt(r2)}`);
    const edge = await RS(a.token, { dateStr: dR, startMin: 960, staffId: ids.nun }, { now: new Date(free) });
    must(edge.ok === true, `ที่ขอบ freeUntil ${fmt(edge)}`);
    const sc = await call(BK.setAppointmentStatus, ids.tA, ids.uO, a.id, "CANCELLED");
    must(sc.ok === true, `ร้านยกเลิก ${fmt(sc)}`);
    const r3 = await RS(a.token, { dateStr: dR, startMin: 1020, staffId: ids.nun });
    const r4 = await CN(a.token);
    const vv = await MV(a.token);
    const ics = await ICS(a.token);
    must(r3.code === "BAD_STATE" && r4.code === "BAD_STATE", `ร้านยกเลิกแล้ว ${fmt(r3)} ${fmt(r4)}`);
    must(vv.ok === true && (vv.view as R).status === "CANCELLED" && (vv.view as R).canCancel === false && (vv.view as R).canReschedule === false, `view ${fmt(vv)}`);
    must(!!ics && /STATUS:CANCELLED/.test(ics), "ics ไม่ CANCELLED");
    const x = await row(a.id);
    must(x.status === "CANCELLED" && x.rescheduleCount === 1 && x.startAt.getTime() === at(dR, 960).getTime(), `แถว ${fmt(x)}`);
    for (const [k, st] of ["DONE", "NO_SHOW", "IN_SERVICE"].entries()) {
      const f = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: dR, startMin: 600 + k * 60 });
      await q(`UPDATE "Appointment" SET status = $2 WHERE id = $1`, [f.id, st]);
      const z = await RS(f.token, { dateStr: dR, startMin: 1020, staffId: ids.ek });
      const y = await CN(f.token);
      must(z.code === "BAD_STATE" && y.code === "BAD_STATE", `${st} ${fmt(z)} ${fmt(y)}`);
    }
    return "เลยเวลา = LATE_CHANGE ทั้งคู่ · ขอบ freeUntil ได้ · ร้านยกเลิก/DONE/NO_SHOW/IN_SERVICE = BAD_STATE · .ics CANCELLED";
  });
  await probe("R3", "MAJOR", async () => {
    // ร้านยืนยันนัดที่มีมัดจำ (ยังไม่จ่าย) → ลูกค้าเลื่อน (requireConfirm ⇒ PENDING) → ตัวกวาดมัดจำจะยกเลิกทันทีไหม
    const a = await bookOk(ids.uO, { serviceId: ids.PERM, staffId: ids.nun, dateStr: dR, startMin: 600 });
    must((await row(a.id)).status === "PENDING", "PERM ไม่ PENDING");
    await q(`UPDATE "Appointment" SET "createdAt" = "createdAt" - interval '1 hour' WHERE id = $1`, [a.id]); // จองไว้ชั่วโมงก่อน
    const sc = await call(BK.setAppointmentStatus, ids.tA, ids.uO, a.id, "CONFIRMED");
    if (sc.ok !== true) throw new Info(`ร้านยืนยันนัดที่ยังไม่จ่ายมัดจำไม่ได้ (${fmt(sc)}) ⇒ ฉากนี้ไม่เกิด`);
    const r = await RS(a.token, { dateStr: dR, startMin: 780, staffId: ids.nun });
    must(r.ok === true, `เลื่อน ${fmt(r)}`);
    const x = await row(a.id);
    const would = (await q<{ id: string }>(`SELECT x.id FROM "Appointment" x WHERE x.id = $1 AND x."status" = 'PENDING' AND x."depositPaidAt" IS NULL AND x."depositSatang" > 0
      AND x."channel" IN ('ONLINE','LINE') AND (x."policySnapshot" -> 'values' ->> 'booking.deposit.method') <> 'NONE'
      AND jsonb_typeof(x."policySnapshot" -> 'values' -> 'booking.deposit.payWithinMin') = 'number'
      AND x."createdAt" + ((x."policySnapshot" -> 'values' ->> 'booking.deposit.payWithinMin')::numeric * interval '1 minute') <= now()`, [a.id])).length;
    const v = await MV(a.token);
    const hold = (v.view as R | undefined)?.holdUntilMs as number | null;
    let swept = "";
    if (would) { const e = await call(BK.expireDepositHolds, new Date()); const y = await row(a.id); swept = ` · รัน expireDepositHolds จริง ⇒ expired ${fmt(e)} · แถว ${y.status}/${y.cancelReason}`; }
    must(would === 0, `ร้านยืนยันแล้ว (ไม่จ่ายมัดจำ) → ลูกค้าเลื่อน ⇒ สถานะ ${x.status} · ตรงเงื่อนไข expireDepositHolds ทันที (ถูกยกเลิก DEPOSIT_TIMEOUT ในรอบกวาดถัดไป) · หน้าแสดง holdUntil ${hold === null ? "null" : new Date(hold).toISOString()} (อดีต)${swept}`);
    return `สถานะหลังเลื่อน ${x.status} · ไม่เข้าเงื่อนไขกวาดมัดจำ`;
  });
  await probe("R4", "MINOR", async () => {
    // เลื่อนข้ามช่าง (ราคาเฉพาะคนต่างกัน) — ราคา/มัดจำของแถว
    const a = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.boy, dateStr: dR, startMin: 1080 });
    const before = await row(a.id);
    const v = await call(ON.loadOnlineBooking, ref(ids.uO), { svc: ids.CUT, staff: ids.ek, date: dR, time: "18:00" }, { ip: ip() });
    const quote = ((v.view as R)?.summary as R | null)?.priceSatang;
    const r = await RS(a.token, { dateStr: dR, startMin: 1080, staffId: ids.ek });
    must(r.ok === true, `เลื่อนไปช่างเอก ${fmt(r)}`);
    const after = await row(a.id);
    if (after.priceSatang !== quote) throw new Info(`เลื่อนจากช่างบอย (฿${before.priceSatang / 100}) ไปช่างเอก (ราคาเฉพาะคน ฿${Number(quote) / 100}) ⇒ แถวยังราคา ฿${after.priceSatang / 100} · ใบสั่ง §3.5 ไม่กำหนด (ลูกค้าจองช่างถูกแล้วเลื่อนเป็นช่างแพงได้ราคาเดิม)`);
    return `ราคาตามช่างใหม่ ฿${after.priceSatang / 100}`;
  });
  await probe("R5", "MINOR", async () => {
    // คีย์ event booking.rescheduled ชนเมื่อกลับไปเวลา/ช่างเดิม (ลูกค้า → ร้าน → ลูกค้า)
    const a = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.nun, dateStr: dR, startMin: 1140 });
    const r1 = await RS(a.token, { dateStr: dR, startMin: 1080, staffId: ids.nun });
    const s1 = await call(LN.rescheduleByShop, cO, a.id, { dateStr: dR, startMin: 1140, staffId: ids.nun });
    const r2 = await RS(a.token, { dateStr: dR, startMin: 1080, staffId: ids.nun });
    if (!(r1.ok === true && s1.ok === true && r2.ok === true)) throw new Info(`เตรียมฉากไม่ครบ ${fmt([r1, s1, r2])}`);
    const e = await evs("booking.rescheduled", a.id);
    if (e !== 3) throw new Info(`เลื่อนสำเร็จ 3 ครั้ง (ลูกค้า→ร้าน→ลูกค้า กลับเวลาเดิม) ⇒ booking.rescheduled ${e} (คีย์ id#startAt#staff ชน ⇒ event ครั้งที่ 3 หาย · B.9 ไม่แจ้งเวลาใหม่) — รูปคีย์มาจาก B.4/ใบสั่ง`);
    return "event 3";
  });

  // ═══ TK: token ═══
  console.log("\n── TK. token ลิงก์จัดการนัด (X7) ──");
  const dT = nextDay();
  const tk = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.nun, dateStr: dT, startMin: 600, note: NOTE });
  const tkB = await bookOk(ids.uB, { serviceId: ids.BCUT, staffId: ids.b1, dateStr: dT, startMin: 600 }, ids.tB);
  const tkRow0 = await row(tk.id);
  const refNF = await RS(rand43(), { dateStr: dT, startMin: 660, staffId: ids.nun });
  const refCN = await CN(rand43());
  must(isDeepStrictEqual(Object.keys(refNF).sort(), ["code", "ok", "reason"]), "รูปคำตอบอ้างอิง");
  const otherKey = createHmac("sha256", `booking-manage:v1:${"x".repeat(40)}`).update(tk.id).digest("base64url");
  const noLabel = createHmac("sha256", process.env.SESSION_SECRET ?? "").update(tk.id).digest("base64url");
  const walk = await call(LN.createWalkIn, cS, { serviceId: ids.SCUT, staffId: null, channel: "STAFF" }, { now: at(dT, 600) });
  const walkTok = walk.ok ? MT.manageToken(String(walk.appointmentId)) : null;
  const identityTok = LINK.signLink({ tenantId: ids.tA, purpose: "booking.identity", subjectId: tk.id, expMin: 60 });
  const checkinTok = await call<string | null>(LN.checkInToken, cO, tk.id).catch(() => null);
  const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);
  const weird: [string, unknown][] = [
    ["สุ่ม43", rand43()], ["ว่าง", ""], ["สั้น42", tk.token.slice(0, 42)], ["ยาว44", `${tk.token}A`], ["ช่องว่าง", ` ${tk.token}`], ["base64มาตรฐาน", tk.token.replace(/-/g, "+").replace(/_/g, "/")],
    ["ตัวพิมพ์", tk.token.toUpperCase() === tk.token ? tk.token.toLowerCase() : tk.token.toUpperCase()], ["hash-ที่เก็บ", MT.manageTokenHash(tk.token)], ["id-นัด", tk.id],
    ["กุญแจอื่น", otherKey], ["ไม่มีป้าย", noLabel], ["ลิงก์ตัวตน", identityTok], ["ลิงก์เช็กอิน", checkinTok ?? "x"], ["walk-in(HMAC)", walkTok ?? "x"],
    ["null", null], ["undefined", undefined], ["number", 12345], ["array", [tk.token]], ["object-toString", { toString: () => tk.token }], ["unicode", "ก".repeat(43)], ["sql", "'||(SELECT 1)--".padEnd(43, "x")],
  ];
  const checkBad = async (list: [string, unknown][]) => {
    const diff: string[] = [];
    for (const [n, t] of list) {
      const v = await MV(t);
      const r = await RS(t, { dateStr: dT, startMin: 660, staffId: ids.nun });
      const c = await CN(t);
      const i = await ICS(t);
      if (!isDeepStrictEqual(v, { ok: false, code: "NOT_FOUND" })) diff.push(`view:${n}=${fmt(v)}`);
      if (!isDeepStrictEqual(r, refNF)) diff.push(`resched:${n}=${fmt(r)}`);
      if (!isDeepStrictEqual(c, refCN)) diff.push(`cancel:${n}=${fmt(c)}`);
      if (i !== null) diff.push(`ics:${n}`);
    }
    return diff;
  };
  await probe("TK1", "BLOCKER", async () => {
    const diff = await checkBad(weird);
    must(diff.length === 0, diff.join(" | "));
    const x = await row(tk.id);
    must(x.status === tkRow0.status && x.startAt.getTime() === tkRow0.startAt.getTime() && x.rescheduleCount === 0, "แถวเปลี่ยน");
    return `${weird.length} แบบ (กุญแจอื่น · ไม่มีป้าย · ลิงก์เซ็นจุดประสงค์อื่น · hash/id · walk-in) ⇒ คำตอบเดียว ${fmt(refNF)}`;
  });
  await probe("TK2", "BLOCKER", async () => {
    const list: [string, unknown][] = Array.from({ length: 43 }, (_, i) => [`ตัวที่${i}`, flip(tk.token, i)]);
    const diff = await checkBad(list);
    must(diff.length === 0, diff.slice(0, 5).join(" | "));
    return "ดัดแปลงทีละตัวครบ 43 ตำแหน่ง ⇒ NOT_FOUND ทุกทาง";
  });
  await probe("TK3", "BLOCKER", async () => {
    // ชั้นที่สอง: hash ถูกฝังในแถวอื่น (ร้าน B) / แถว WALKIN ที่มี hash ของตัวเอง
    const fakeTok = MT.manageToken(`svcb7p_fake_${RUN}`)!;
    await q(`UPDATE "Appointment" SET "manageTokenHash" = $2 WHERE id = $1`, [tkB.id, MT.manageTokenHash(fakeTok)]);
    const d1x = await checkBad([["hash-ฝังแถวร้านB", fakeTok]]);
    await q(`UPDATE "Appointment" SET "manageTokenHash" = $2 WHERE id = $1`, [tkB.id, MT.manageTokenHash(tkB.token)]);
    let d2x: string[] = [];
    if (walk.ok && walkTok) {
      await q(`UPDATE "Appointment" SET "manageTokenHash" = $2 WHERE id = $1`, [walk.appointmentId, MT.manageTokenHash(walkTok)]);
      d2x = await checkBad([["walk-in มี hash", walkTok]]);
    }
    must(d1x.length === 0 && d2x.length === 0, [...d1x, ...d2x].join(" | "));
    // hash ถูกล้าง ⇒ ตาย · manageLinkFor เปิดคืน · ร้านอื่นเปิดไม่ได้
    await q(`UPDATE "Appointment" SET "manageTokenHash" = NULL WHERE id = $1`, [tk.id]);
    const d3x = await checkBad([["hash-ล้าง", tk.token]]);
    const lB = await call<string | null>(ON.manageLinkFor, cB, tk.id);
    const lO2 = await call<string | null>(ON.manageLinkFor, { tenantId: ids.tA, unitId: ids.uO2 }, tk.id);
    const lA = await call<string | null>(ON.manageLinkFor, cO, tk.id);
    must(d3x.length === 0 && lB === null && lO2 === null && lA === `/bq/m/${tk.token}`, `hash-ล้าง ${d3x.join("|")} · linkFor B ${lB} O2 ${lO2} A ${lA}`);
    return "hash ฝังแถวอื่น/walk-in ⇒ NOT_FOUND (timing-safe ชั้นสอง) · ล้าง hash ⇒ ตาย · manageLinkFor ข้ามร้าน/สาขา null · ร้านเดิมเปิดคืน";
  });
  await probe("TK4", "BLOCKER", async () => {
    const start = (await row(tk.id)).startAt.getTime();
    const e7 = await MV(tk.token, { now: new Date(start + 7 * 86_400_000) });
    must(e7.ok === true, `ขอบ +7 วัน ${fmt(e7)}`);
    const ex = { now: new Date(start + 7 * 86_400_000 + 1) };
    const v = await MV(tk.token, ex); const r = await RS(tk.token, { dateStr: dT, startMin: 660, staffId: ids.nun }, ex); const c = await CN(tk.token, ex); const i = await ICS(tk.token, ex);
    const diff: string[] = [];
    if (!isDeepStrictEqual(v, { ok: false, code: "NOT_FOUND" })) diff.push(`view ${fmt(v)}`);
    if (!isDeepStrictEqual(r, refNF)) diff.push(`resched ${fmt(r)}`);
    if (!isDeepStrictEqual(c, refCN)) diff.push(`cancel ${fmt(c)}`);
    if (i !== null) diff.push("ics");
    for (const [tbl, col, idv, val, back] of [["BusinessUnit", "status", ids.uO, "PAUSED", "ACTIVE"], ["BusinessUnit", "status", ids.uO, "ARCHIVED", "ACTIVE"], ["Tenant", "status", ids.tA, "SUSPENDED", "ACTIVE"], ["BusinessUnit", "type", ids.uO, "QUEUE", "BOOKING"]] as const) {
      await q(`UPDATE "${tbl}" SET "${col}" = $2 WHERE id = $1`, [idv, val]);
      try { diff.push(...(await checkBad([[`${tbl}.${col}=${val}`, tk.token]]))); } finally { await q(`UPDATE "${tbl}" SET "${col}" = $2 WHERE id = $1`, [idv, back]); }
    }
    must(diff.length === 0, diff.join(" | "));
    return "ขอบ +7 วันใช้ได้ · +7 วัน+1ms / สาขา PAUSED/ARCHIVED / ร้าน SUSPENDED / สาขาเปลี่ยนเป็น QUEUE ⇒ คำตอบเดียว";
  });
  await probe("TK5", "BLOCKER", async () => {
    // สลับ token ↔ ช่าง/ร้าน
    const before = await row(tk.id);
    const cases: [string, string, R][] = [
      ["tokA+ช่างร้านB", tk.token, { dateStr: dT, startMin: 660, staffId: ids.b1 }], ["tokA+ช่างสาขาอื่น", tk.token, { dateStr: dT, startMin: 660, staffId: ids.a2 }],
      ["tokA+ช่างซ่อน", tk.token, { dateStr: dT, startMin: 660, staffId: ids.hid }], ["tokA+ช่างแถวเดียว", tk.token, { dateStr: dT, startMin: 660, staffId: ids.s1 }],
      ["tokB+ช่างร้านA", tkB.token, { dateStr: dT, startMin: 660, staffId: ids.nun }],
    ];
    const out: string[] = [];
    for (const [n, t, to] of cases) { const r = await RS(t, to); out.push(`${n}=${r.ok ? "OK" : r.code}`); must(!r.ok && r.code === "NOT_FOUND", `${n} ${fmt(r)}`); }
    const a = await row(tk.id); const b = await row(tkB.id);
    must(a.startAt.getTime() === before.startAt.getTime() && a.staffId === before.staffId && b.staffId === ids.b1, "แถวเปลี่ยน");
    const r1 = await RS(tk.token, { dateStr: dT, startMin: 660, staffId: ids.hid });
    const r2 = await RS(tk.token, { dateStr: dT, startMin: 660, staffId: `nope_${RUN}` });
    must(r1.reason === r2.reason, `ช่างซ่อน ≠ ช่างไม่มีจริง: ${r1.reason} | ${r2.reason}`);
    return out.join(" · ");
  });
  await probe("TK6", "MINOR", async () => {
    const med = async (f: () => Promise<unknown>) => { const xs: number[] = []; for (let i = 0; i < 25; i++) { const t = process.hrtime.bigint(); await f(); xs.push(Number(process.hrtime.bigint() - t) / 1e6); } xs.sort((a, b) => a - b); return xs[12]; };
    const start = (await row(tk.id)).startAt.getTime();
    const mRand = await med(() => MV(rand43()));
    const mFlip = await med(() => MV(flip(tk.token, 20)));
    const mExp = await med(() => MV(tk.token, { now: new Date(start + 8 * 86_400_000) }));
    const mFmt = await med(() => MV("abc"));
    const mOk = await med(() => MV(tk.token));
    const msg = `median ms: รูปผิด ${mFmt.toFixed(1)} · สุ่ม43 ${mRand.toFixed(1)} · ดัดแปลง1ตัว ${mFlip.toFixed(1)} · จริงแต่หมดอายุ ${mExp.toFixed(1)} · ใช้ได้ ${mOk.toFixed(1)}`;
    must(Math.abs(mRand - mFlip) < Math.max(5, mRand * 0.5), msg);
    if (Math.abs(mExp - mRand) > Math.max(10, mRand * 0.5)) throw new Info(`${msg} — หมดอายุต่างจากสุ่มชัด (แต่ต้องถือ token จริงอยู่แล้ว)`);
    return msg;
  });

  // ═══ ID: ลิงก์ตัวตน LINE ═══
  console.log("\n── ID. ลิงก์ตัวตน LINE ──");
  const dI = nextDay();
  await probe("ID1", "BLOCKER", async () => {
    const now = new Date();
    const qy = { svc: ids.CUT, staff: ids.nun, date: dI };
    const base = await call(ON.loadOnlineBooking, ref(ids.uO), qy, { ip: ip(), now });
    const good = LINK.signLink({ tenantId: ids.tA, purpose: "booking.identity", subjectId: ids.P1, expMin: 60 });
    const gv = await call(ON.loadOnlineBooking, ref(ids.uO), { ...qy, who: good }, { ip: ip(), now });
    const gi = (gv.view as R).identity as R | null;
    must(!!gi && gi.name === NAMES[0] && !String(gi.phoneMasked).includes(PHONES[0]) && piiIn(JSON.stringify({ ...(gv.view as R), identity: { ...gi, name: "" } })).length === 0, `ตัวตนดี ${fmt(gi)}`);
    const bads: [string, string][] = [
      ["ร้านB", LINK.signLink({ tenantId: ids.tB, purpose: "booking.identity", subjectId: ids.PB, expMin: 60 })],
      ["partyร้านB-เซ็นร้านA", LINK.signLink({ tenantId: ids.tA, purpose: "booking.identity", subjectId: ids.PB, expMin: 60 })],
      ["party-รวมแล้ว", LINK.signLink({ tenantId: ids.tA, purpose: "booking.identity", subjectId: ids.PM, expMin: 60 })],
      ["จุดประสงค์อื่น", LINK.signLink({ tenantId: ids.tA, purpose: "booking.checkin", subjectId: ids.P1, expMin: 60 })],
      ["หมดอายุ", sqcIdentityToken(process.env.SESSION_SECRET ?? "", { tenantId: ids.tA, partyId: ids.P1, nowMs: Date.now() - 3 * 3_600_000, ttlMin: 60 })],
      ["ดัดแปลง", flip(good, Math.floor(good.length / 2))], ["party-ไม่มี", LINK.signLink({ tenantId: ids.tA, purpose: "booking.identity", subjectId: `nope_${RUN}`, expMin: 60 })],
      ["ขยะ", "x".repeat(300)],
    ];
    const diff: string[] = [];
    for (const [n, w] of bads) { const v = await call(ON.loadOnlineBooking, ref(ids.uO), { ...qy, who: w }, { ip: ip(), now }); if (!isDeepStrictEqual(v, base)) diff.push(`${n}: ${fmt((v.view as R)?.identity)}`); }
    must(diff.length === 0, diff.join(" | "));
    const vB = await call(ON.loadOnlineBooking, ref(ids.uB, ids.tB), { who: good }, { ip: ip(), now });
    must((vB.view as R).identity === null, "ลิงก์ร้าน A ใช้ที่ร้าน B ได้");
    return `ลิงก์ดี ⇒ ชื่อ + ${String(gi!.phoneMasked)} · ${bads.length} แบบเสีย ⇒ view เท่ากับไม่ส่ง who ทุกไบต์ · ข้ามร้าน null`;
  });
  await probe("ID2", "BLOCKER", async () => {
    const good = LINK.signLink({ tenantId: ids.tA, purpose: "booking.identity", subjectId: ids.P1, expMin: 60 });
    const victimName = newName(); const victimPhone = newPhone();
    const k1 = rid("k");
    const r1 = await call(ON.bookOnline, ref(ids.uO), { serviceId: ids.CUT, staffId: ids.nun, dateStr: dI, startMin: 600, name: victimName, phone: victimPhone, who: good, idempotencyKey: k1 }, { ip: ip() });
    must(r1.ok === true, `จองด้วยลิงก์ดี ${fmt(r1)}`);
    const a = await row((await rowByKey(k1))!);
    must(a.partyId === ids.P1 && a.channel === "LINE" && a.customerName === NAMES[0] && a.customerPhone === PHONES[0], `ลิงก์ดีแต่ใช้ชื่อที่กรอก ${fmt(a)}`);
    const out: string[] = [];
    for (const [n, w] of [["ร้านB", LINK.signLink({ tenantId: ids.tB, purpose: "booking.identity", subjectId: ids.PB, expMin: 60 })], ["รวมแล้ว", LINK.signLink({ tenantId: ids.tA, purpose: "booking.identity", subjectId: ids.PM, expMin: 60 })], ["ดัดแปลง", flip(good, 30)]] as const) {
      const k = rid("k");
      const nm = newName(); const ph = newPhone();
      const r = await call(ON.bookOnline, ref(ids.uO), { serviceId: ids.CUT, staffId: ids.nun, dateStr: dI, startMin: 660 + out.length * 60, name: nm, phone: ph, who: w, idempotencyKey: k }, { ip: ip() });
      must(r.ok === true, `${n} ${fmt(r)}`);
      const x = await row((await rowByKey(k))!);
      must(x.partyId !== ids.PB && x.partyId !== ids.PM && x.channel === "ONLINE" && x.customerName === nm, `${n}: สวมรอย ${fmt({ partyId: x.partyId, ch: x.channel, n: x.customerName })}`);
      const r0 = await call(ON.bookOnline, ref(ids.uO), { serviceId: ids.CUT, staffId: ids.nun, dateStr: dI, startMin: 900 + out.length * 60, who: w, idempotencyKey: rid("k") }, { ip: ip() });
      must(!r0.ok && r0.code === "BAD_INPUT", `${n} ไม่กรอกชื่อ/เบอร์ ⇒ ${fmt(r0)}`);
      out.push(n);
    }
    // Party ไม่มีเบอร์
    const w3 = LINK.signLink({ tenantId: ids.tA, purpose: "booking.identity", subjectId: ids.P3, expMin: 60 });
    const r3 = await call(ON.bookOnline, ref(ids.uO), { serviceId: ids.CUT, staffId: ids.boy, dateStr: dI, startMin: 600, name: "x", phone: newPhone(), who: w3, idempotencyKey: rid("k") }, { ip: ip() });
    const v3 = await call(ON.loadOnlineBooking, ref(ids.uO), { who: w3 }, { ip: ip() });
    if (!r3.ok) throw new Info(`ลิงก์ดีหมดทาง: สวมรอยไม่ได้ · แต่ Party ที่ไม่มีเบอร์ (ลูกค้า LINE ใหม่) ⇒ หน้าแสดงตัวตน ${fmt((v3.view as R).identity)} + ซ่อนช่องเบอร์ แต่จอง ⇒ ${r3.code} (เบอร์ที่กรอกถูกละ) — จองไม่ได้เลย`);
    return `ลิงก์ดีใช้ชื่อ/เบอร์ Party (ไม่ใช่ที่กรอก) · ${out.join("/")} ⇒ ONLINE + ชื่อที่กรอก ไม่ผูก Party`;
  });

  // ═══ XS: ข้ามร้าน ═══
  console.log("\n── XS. ข้ามร้าน/สาขา ──");
  const dX = nextDay();
  await probe("XS1", "BLOCKER", async () => {
    const out: string[] = [];
    const nf = async (n: string, r: Promise<R>) => { const x = await r; out.push(n); must(isDeepStrictEqual(x, { ok: false, code: "NOT_FOUND" }), `${n} ${fmt(x)}`); };
    await nf("slugร้านA+สาขาร้านB", call(ON.loadOnlineBooking, { tenantSlug: SL[ids.tA], unitSlug: SL[ids.uB] }, {}, { ip: ip() }));
    await nf("slugร้านB+สาขาร้านA", call(ON.loadOnlineBooking, { tenantSlug: SL[ids.tB], unitSlug: SL[ids.uO] }, {}, { ip: ip() }));
    await nf("สาขาQUEUE", call(ON.loadOnlineBooking, ref(ids.uQ), {}, { ip: ip() }));
    for (const [n, svcId] of [["svcร้านB", ids.BCUT], ["svcสาขาอื่น", ids.O2CUT]] as const) {
      const v = await call(ON.loadOnlineBooking, ref(ids.uO), { svc: svcId, staff: ids.b1 }, { ip: ip() });
      must((v.view as R).step === 1 && (v.view as R).service === null, `${n} ${fmt(v)}`);
      out.push(n);
    }
    const v = await call(ON.loadOnlineBooking, ref(ids.uO), { svc: ids.CUT, staff: ids.a2 }, { ip: ip() });
    must((v.view as R).staffSel !== ids.a2 && !JSON.stringify(v).includes(ids.a2) && !JSON.stringify(v).includes(ids.hid), `staff สาขาอื่น/ช่างซ่อน หลุด ${fmt((v.view as R).staffSel)}`);
    return out.join(" · ") + " · staff สาขาอื่นไม่ถูกเลือก/ช่างซ่อนไม่โผล่";
  });
  await probe("XS2", "BLOCKER", async () => {
    const before = (await q<{ n: number }>(`SELECT count(*)::int n FROM "Appointment" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n;
    const out: string[] = [];
    for (const [n, i] of [
      ["svcร้านB", { serviceId: ids.BCUT, staffId: null }], ["svcร้านB+ช่างร้านB", { serviceId: ids.BCUT, staffId: ids.b1 }], ["svcสาขาอื่น", { serviceId: ids.O2CUT, staffId: null }],
      ["ช่างร้านB", { serviceId: ids.CUT, staffId: ids.b1 }], ["ช่างสาขาอื่น", { serviceId: ids.CUT, staffId: ids.a2 }], ["ช่างซ่อน", { serviceId: ids.CUT, staffId: ids.hid }], ["ช่าง0%", { serviceId: ids.CUT, staffId: ids.jack }],
    ] as const) {
      const r = await call(ON.bookOnline, ref(ids.uO), { ...i, dateStr: dX, startMin: 600, name: newName(), phone: newPhone(), idempotencyKey: rid("k") }, { ip: ip() });
      out.push(`${n}=${r.ok ? "OK" : r.code}`);
      must(!r.ok, `${n} จองได้ ${fmt(r)}`);
      must(piiIn(JSON.stringify(r)).length === 0 && !/svcb7p_/.test(String(r.reason)), `${n} คำตอบหลุด ${fmt(r)}`);
    }
    const after = (await q<{ n: number }>(`SELECT count(*)::int n FROM "Appointment" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n;
    must(after === before, `แถวเพิ่ม ${after - before}`);
    // route จริง (ทางล้มไม่เรียก scheduleDrain)
    try {
      const route = (await import("@/app/api/store/[tenantSlug]/[unitSlug]/book/route")) as unknown as { POST: (r: Request, c: { params: Promise<R> }) => Promise<Response> };
      const res = await route.POST(new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ serviceId: ids.BCUT, staffId: ids.b1, dateStr: dX, startMin: 600, name: "x", phone: newPhone() }) }), { params: Promise.resolve(ref(ids.uO)) });
      const body = await res.text();
      out.push(`route=${res.status}`);
      must(res.status >= 400 && !body.includes(ids.tB), `route ${res.status} ${body}`);
    } catch (e) { if (e instanceof Breach) throw e; out.push(`route-import✗ ${errOf(e).slice(0, 80)}`); }
    return out.join(" · ") + " · ไม่มีแถวใหม่";
  });
  await probe("XS3", "MINOR", async () => {
    const route = (await import("@/app/api/store/[tenantSlug]/[unitSlug]/slots/route")) as unknown as { GET: (r: Request, c: { params: Promise<R> }) => Promise<Response> };
    const get = async (r: { tenantSlug: string; unitSlug: string }, qs: string) => { const x = await route.GET(new Request(`http://x/api?${qs}`, { headers: { "x-forwarded-for": ip() } }), { params: Promise.resolve(r) }); return { s: x.status, j: (await x.json()) as R }; };
    const a = await get(ref(ids.uO), `serviceId=${ids.BCUT}&staffId=${ids.b1}&date=${dX}`);
    const b = await get(ref(ids.uO), `serviceId=${ids.O2CUT}&staffId=any&date=${dX}`);
    const c = await get(ref(ids.uQ), `serviceId=${ids.CUT}&staffId=any&date=${dX}`);
    const e = await get(ref(ids.uO), `serviceId=${ids.CUT}&staffId=${ids.a2}&date=${dX}`);
    must(isDeepStrictEqual(a.j, { slots: [] }) && isDeepStrictEqual(b.j, { slots: [] }) && c.s === 404 && isDeepStrictEqual(e.j, { slots: [] }), `ข้ามร้าน ${fmt([a, b, c, e])}`);
    const h = await get(ref(ids.uO), `serviceId=${ids.CUT}&staffId=${ids.hid}&date=${dX}`);
    const any = await get(ref(ids.uO), `serviceId=${ids.CUT}&staffId=any&date=${dX}`);
    const hidCount = ((h.j.slots as unknown[]) ?? []).length;
    const anyHasHid = JSON.stringify(any.j).includes(ids.hid);
    if (hidCount > 0 || anyHasHid) throw new Info(`ข้ามร้านปิดครบ · แต่ slots route เปิดเผยช่างที่ร้านซ่อนชื่อ (customerCanChoose=false): staffId=<ช่างซ่อน> ⇒ ${hidCount} ช่อง · staffId=any มี id ช่างซ่อน ${anyHasHid} (หน้า view ไม่โชว์ · bookOnline ปฏิเสธ)`);
    return "slots ข้ามร้าน/สาขา ⇒ [] · QUEUE 404 · ช่างซ่อนไม่โผล่";
  });

  // ═══ PII ═══
  console.log("\n── PII ──");
  await probe("PII1", "BLOCKER", async () => {
    const r = await call(ON.bookOnline, ref(ids.uO), { serviceId: ids.CUT, staffId: ids.boy, dateStr: dX, startMin: 900, name: newName(), phone: newPhone(), note: NOTE, idempotencyKey: rid("k") }, { ip: ip() });
    must(r.ok === true, fmt(r));
    const t = tokOf(r.manageUrl);
    const id = (await q<{ id: string }>(`SELECT id FROM "Appointment" WHERE "manageTokenHash" = $1`, [MT.manageTokenHash(t)]))[0].id;
    const v = await MV(t, { reschedule: { date: dX } });
    const ics = (await ICS(t)) ?? "";
    const html = render(ManageCard, { view: v.view, token: t, actions: { cancel: async () => {}, reschedule: async () => {} } });
    const good = LINK.signLink({ tenantId: ids.tA, purpose: "booking.identity", subjectId: ids.P1, expMin: 60 });
    const bv = await call(ON.loadOnlineBooking, ref(ids.uO), { svc: ids.CUT, staff: ids.boy, date: dX, who: good }, { ip: ip() });
    const firstFree = ((bv.view as R).times as { hhmm: string; free: boolean }[]).find((x) => x.free)?.hhmm;
    const bv3 = await call(ON.loadOnlineBooking, ref(ids.uO), { svc: ids.CUT, staff: ids.boy, date: dX, time: firstFree, who: good }, { ip: ip() });
    const phtml = render(PublicBooking, { view: bv3.view, basePath: "/s/x/y", query: { who: good }, idempotencyKey: "k" });
    const ev = await q<{ type: string; payload: unknown; idempotencyKey: string }>(`SELECT type, payload, "idempotencyKey" FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]);
    const buckets = (await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE 'bq:%'`)).map((x) => x.key).join("\n");
    const leaks: string[] = [];
    for (const [n, s] of [["bookRes", JSON.stringify(r)], ["view", JSON.stringify(v)], ["ics", ics], ["ManageCard", html], ["events", JSON.stringify(ev)]] as const) {
      const p = piiIn(s); if (p.length) leaks.push(`${n}:${p.join(",")}`);
      if (n === "events" && s.includes(t)) leaks.push(`${n}:token`);
      if (s.includes(MT.manageTokenHash(t))) leaks.push(`${n}:hash`);
      if (n !== "events" && s.includes(id)) leaks.push(`${n}:apptId`);
    }
    const pPublic = piiIn(phtml).filter((x) => x !== NAMES[0]);
    if (pPublic.length) leaks.push(`PublicBooking(who):${pPublic.join(",")}`);
    for (const tkn of REAL) if (buckets.includes(tkn) || buckets.includes(MT.manageTokenHash(tkn))) { leaks.push("bucket:token/hash เต็ม"); break; }
    const evAll = JSON.stringify(ev);
    for (const tkn of REAL) if (evAll.includes(tkn) || evAll.includes(MT.manageTokenHash(tkn))) { leaks.push("events:token/hash"); break; }
    must(leaks.length === 0, leaks.join(" | "));
    return `bookRes/view/ics/ManageCard/event ${ev.length} รายการ/PublicBooking(who) ⇒ ไม่มีชื่อ/เบอร์/note/token/hash/id นัด`;
  });

  // ═══ RL ═══
  console.log("\n── RL. rate limit ──");
  const dL = nextDay();
  await probe("RL1", "MAJOR", async () => {
    const a = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.nun, dateStr: dL, startMin: 600 });
    const myIp = ip();
    const codes: string[] = [];
    for (let i = 0; i < 60; i++) {
      const t = rand43(); TOKENS.add(t);
      const r = i % 4 === 0 ? await call(ON.loadManageView, t, { ip: myIp }) : i % 4 === 1 ? await call(ON.cancelOnline, t, { ip: myIp }) : i % 4 === 2 ? await call(ON.rescheduleOnline, t, { dateStr: dL, startMin: 660, staffId: null }, { ip: myIp }) : { ok: false, code: (await call<string | null>(ON.loadManageIcs, t, { ip: myIp })) === null ? "NULL" : "ICS" };
      codes.push(String(r.code));
    }
    must(codes.every((c) => c === "NOT_FOUND" || c === "NULL"), `60 ครั้งแรก ${fmt(codes)}`);
    const v = await call(ON.loadManageView, a.token, { ip: myIp });
    const c = await call(ON.cancelOnline, a.token, { ip: myIp });
    const i = await call<string | null>(ON.loadManageIcs, a.token, { ip: myIp });
    must(v.code === "RATE_LIMITED" && c.code === "RATE_LIMITED" && i === null, `ครั้งที่ 61+ ด้วย token จริง ${fmt([v, c, i])}`);
    must((await row(a.id)).status !== "CANCELLED", "ยกเลิกหลุดหลังติดเพดาน");
    return "สลับ token 60 แบบ (ดู/ยกเลิก/เลื่อน/.ics) IP เดียว ⇒ ครั้งที่ 61 token จริง RATE_LIMITED ทุกทาง (ถังรวมต่อ IP)";
  });
  await probe("RL2", "MINOR", async () => {
    // ถังต่อ token: เลื่อนที่ล้มด้วยกติกาช่อง (FULL) ไม่ถูกนับ ⇒ สลับ IP ส่องตารางด้วย token เดียวได้ไม่จำกัด · และหลังถังเต็มยังค้นฐาน
    const a = await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.nun, dateStr: dL, startMin: 900 });
    await bookOk(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: dL, startMin: 900 });
    const codes: string[] = [];
    for (let i = 0; i < 25; i++) codes.push(String((await RS(a.token, { dateStr: dL, startMin: 900, staffId: ids.ek })).code));
    if (codes.includes("RATE_LIMITED")) return `ถังต่อ token นับทางเลื่อนที่ล้มด้วย (${codes.indexOf("RATE_LIMITED") + 1})`;
    const late = new Date(bkkMs(dL, 900) - 60 * MIN);
    const lc: string[] = [];
    for (let i = 0; i < 11; i++) lc.push(String((await CN(a.token, { now: late })).code));
    const afterFull = await RS(a.token, { dateStr: dL, startMin: 900, staffId: ids.ek });
    const afterPast = await RS(a.token, { dateStr: TODAY, startMin: 0, staffId: ids.nun });
    const afterFree = await RS(a.token, { dateStr: dL, startMin: 1020, staffId: ids.nun });
    const x = await row(a.id);
    must(afterFree.code === "RATE_LIMITED" && x.startAt.getTime() === at(dL, 900).getTime(), `หลังถังเต็ม เลื่อนไปช่องว่าง ${fmt(afterFree)}`);
    must(lc[10] === "RATE_LIMITED" && lc.slice(0, 10).every((c) => c === "LATE_CHANGE"), `ยกเลิก ${fmt(lc)}`);
    const fullN = codes.filter((c) => c === "FULL").length;
    if (fullN === 25 || afterFull.code === "FULL" || afterPast.code === "PAST") {
      throw new Info(`ถังต่อ token ไม่กั้นทางอ่าน: เลื่อนไปช่องเต็ม 25 ครั้ง (สลับ IP) ⇒ FULL ${fullN}/25 ไม่ติดเพดาน · หลังถังเต็ม (ยกเลิกครั้งที่ 11 = RATE_LIMITED) เลื่อนไปช่องเต็ม ⇒ ${afterFull.code} · ไปเวลาอดีต ⇒ ${afterPast.code} (คำตอบขึ้นกับฐาน = ยังค้นฐาน) · ทางเขียนกั้นถูก (ช่องว่าง ⇒ RATE_LIMITED แถวไม่ขยับ) — ใบสั่ง §3.5 ลำดับ ip → token → ค้น ⇒ ขัดกับข้อสอบ R-3 (token เดียว ≥12 ครั้ง)`);
    }
    return "ถังต่อ token กั้นทุกทาง";
  });
  await probe("RL3", "MINOR", async () => {
    // ถังหน้าจอง/จองผูก slug ⇒ slug ปลอม = ถังใหม่ทุกครั้ง (ค้นฐาน + เขียนแถวถัง)
    const myIp = ip();
    const before = (await q<{ n: number }>(`SELECT count(*)::int n FROM "ChatRateBucket" WHERE key LIKE $1`, [`%:${myIp}`]))[0].n;
    const codes = new Set<string>();
    for (let i = 0; i < 80; i++) { const r = await call(ON.loadOnlineBooking, { tenantSlug: `svcb7p-x${i}`, unitSlug: "y" }, {}, { ip: myIp }); codes.add(String(r.code)); }
    for (let i = 0; i < 15; i++) { const r = await call(ON.bookOnline, { tenantSlug: `svcb7p-z${i}`, unitSlug: "y" }, { serviceId: "x", staffId: null, dateStr: dL, startMin: 600 }, { ip: myIp }); codes.add(String(r.code)); }
    const after = (await q<{ n: number }>(`SELECT count(*)::int n FROM "ChatRateBucket" WHERE key LIKE $1`, [`%:${myIp}`]))[0].n;
    // ช่องว่างหน้า/ท้าย slug ไม่แยกถัง
    const ip2 = ip();
    const r2: string[] = [];
    for (let i = 0; i < 61; i++) r2.push(String((await call(ON.loadOnlineBooking, { tenantSlug: i % 2 ? ` ${SL[ids.tA]}` : SL[ids.tA], unitSlug: i % 3 ? `${SL[ids.uO]} ` : SL[ids.uO] }, {}, { ip: ip2 })).ok ? "OK" : "RL"));
    must(r2[60] === "RL", `ช่องว่างใน slug แยกถัง ${fmt(r2.slice(55))}`);
    if (!codes.has("RATE_LIMITED")) throw new Info(`IP เดียว slug ปลอม 80 (หน้าจอง) + 15 (จอง) ⇒ ${[...codes].join("/")} ไม่ติดเพดาน · แถวถังใหม่ ${after - before} แถว · ค้น resolvePublicUnit ทุกครั้ง (ถังผูก slug) — slug จริงสลับช่องว่างไม่แยกถัง ✓`);
    return "slug ปลอมติดเพดาน";
  });
  await probe("RL4", "MAJOR", async () => {
    // ถึงเพดาน IP แล้ว: token จริง vs สุ่ม ⇒ คำตอบเดียว (ไม่ค้นฐาน/ไม่บอกใบ้)
    const myIp = ip();
    for (let i = 0; i < 60; i++) await call(ON.loadManageView, rand43(), { ip: myIp });
    const a = await call(ON.rescheduleOnline, tk.token, { dateStr: dT, startMin: 660, staffId: ids.nun }, { ip: myIp });
    const b = await call(ON.rescheduleOnline, rand43(), { dateStr: dT, startMin: 660, staffId: ids.nun }, { ip: myIp });
    const c = await call(ON.loadManageView, tk.token, { ip: myIp });
    const d = await call(ON.loadManageView, rand43(), { ip: myIp });
    must(isDeepStrictEqual(a, b) && isDeepStrictEqual(c, d) && a.code === "RATE_LIMITED", fmt([a, b, c, d]));
    return "หลังเพดาน IP token จริง = สุ่ม (RATE_LIMITED เดียวกัน)";
  });
} catch (e) {
  console.log(`💥 ${errOf(e)}`);
  exitCode = 2;
} finally {
  try {
    const ts = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    await cleanup(ts);
    await cleanupBuckets();
    const left = (await q<{ n: number }>(`SELECT (SELECT count(*) FROM "Tenant" WHERE slug LIKE $1) + (SELECT count(*) FROM "ChatRateBucket" WHERE key LIKE '%svcb7p%')::int AS n`, [`${SLUG}%`]))[0].n;
    console.log(`(ล้างแล้ว · ค้าง ${left})`);
  } catch (e) { console.log(`⚠️ ล้าง ${errOf(e)}`); }
  await pool.end();
}
const br = res.filter((r) => r.v === "BREACH");
console.log(`\nPROBE_SUMMARY ${JSON.stringify({ hold: res.filter((r) => r.v === "HOLD").length, breach: br.map((r) => `${r.id}(${r.sev})`), info: res.filter((r) => r.v === "INFO").map((r) => r.id) })}`);
process.exit(exitCode || (br.length ? 1 : 0));
