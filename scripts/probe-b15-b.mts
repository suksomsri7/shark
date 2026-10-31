// PROBE — SVC B.15 reviewer B (คู่รัก/กลุ่ม · หลายโพรเซสจริง · เงิน+แข่ง) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b15-b.mts
// ข้อมูลใต้ร้าน slug `qc-svc-b15p-*` + ผู้ใช้ `qc-svc-b15p-*@qc.invalid` · IP `b15p-*` · ไฟล์สัญญาณ /tmp/probe-b15b-go-* · ล้างใน finally (+ กวาดค้างตอนเริ่ม)
// env: PROBE_B15_FUZZ_N (ค่าเริ่ม 20000) · PROBE_B15_ONLY=P1,P5 (รันเฉพาะกลุ่ม)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";

loadSvcQcEnv("probe-b15-b");
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  let hn = "";
  try { hn = new URL(process.env[n] ?? "").hostname; } catch { /* */ }
  if (!hn.startsWith(svcQcHostMark())) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
if (!process.env.INTEGRATIONS_CREDENTIALS_KEY) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
process.env.INTEGRATIONS_FAKE = "1";
for (const k of ["SHARK_BUNNY_ZONE", "SHARK_BUNNY_KEY", "SHARK_BUNNY_CDN"]) delete process.env[k];

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const errMsg = (e: unknown) => (e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e)).replace(/\s+/g, " ").trim().slice(0, 300);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MIN = 60_000;

const BKm = (): Promise<any> => import("@/lib/modules/booking/service" as string);
const LNm = (): Promise<any> => import("@/lib/modules/booking/queue-line" as string);
const RNm = (): Promise<any> => import("@/lib/modules/booking/planner-run" as string);
const RSm = (): Promise<any> => import("@/lib/modules/booking/resources" as string);
const GRm = (): Promise<any> => import("@/lib/modules/booking/group" as string);
const DPm = (): Promise<any> => import("@/lib/modules/booking/deposit" as string);
const ONm = (): Promise<any> => import("@/lib/modules/booking/online" as string);
const CSm = (): Promise<any> => import("@/lib/outbox-consumers" as string);

// ═══════════ โหมดลูก ═══════════
type Call = { op: string; a: any[]; delayMs?: number; tag?: string };
const goFile = (run: string, key: string) => `/tmp/probe-b15b-go-${run}-${key}`;
const slim = (r: any) => (r && typeof r === "object" ? {
  ok: r.ok, code: r.code ?? null, id: r.id ?? r.appointmentId ?? null, groupId: r.groupId ?? null, ids: Array.isArray(r.ids) ? r.ids : null,
  status: r.status ?? null, dup: r.duplicated ?? null, groupIds: Array.isArray(r.groupIds) ? r.groupIds : null,
  reason: typeof r.reason === "string" ? r.reason.slice(0, 90) : null,
} : r ?? null);
async function runOp(c: Call): Promise<any> {
  const t0 = Date.now();
  if (c.delayMs) await sleep(c.delayMs);
  const rev = (x: any): any => (x && typeof x === "object" ? (typeof x.__date === "string" ? new Date(x.__date) : Array.isArray(x) ? x.map(rev) : Object.fromEntries(Object.entries(x).map(([k, v]) => [k, rev(v)]))) : x);
  const a = c.a.map(rev);
  try {
    const BK = await BKm(), LN = await LNm(), RN = await RNm(), RS = await RSm(), GR = await GRm(), DP = await DPm(), ON = await ONm();
    let r: any;
    if (c.op === "group") r = await GR.bookGroup(a[0], a[1]);
    else if (c.op === "book") r = await BK.bookAppointment(a[0], a[1]);
    else if (c.op === "rShop") { const x = await LN.rescheduleByShop(a[0], a[1], a[2], a[3] ? { now: a[3] } : undefined); r = { ...x, id: a[1] }; }
    else if (c.op === "rSelf") { const x = await BK.rescheduleBySelf(a[0], a[1], a[2], a[3] ? { now: a[3] } : undefined); r = { ...x, id: a[1] }; }
    else if (c.op === "resGroup") r = await GR.rescheduleGroup(a[0], a[1], a[2], a[3] ? { now: a[3] } : undefined);
    else if (c.op === "cancelGroup") r = await GR.cancelGroup(a[0], a[1], a[2] ? { now: a[2] } : undefined);
    else if (c.op === "cancelShop") { const x = await LN.cancelByShop(a[0], a[1], a[2] ? { now: a[2] } : undefined); r = { ...x, id: a[1] }; }
    else if (c.op === "cancelOnline") r = await ON.cancelOnline(a[0], a[1]);
    else if (c.op === "walkIn") r = await LN.createWalkIn(a[0], { serviceId: a[1], staffId: a[2], channel: "STAFF" }, { now: a[3] });
    else if (c.op === "checkIn") r = await LN.checkIn(a[0], a[1], { via: a[2], now: a[3] });
    else if (c.op === "plan") { for (let k = 0; k < a[2]; k++) await RN.runPlanner(a[0], { now: new Date(a[1].getTime() + k * 20_000) }); r = { ok: true }; }
    else if (c.op === "confirm") r = await DP.confirmDepositByShop(a[0], a[1]);
    else if (c.op === "refund") r = await DP.refundDepositByShop(a[0], a[1]);
    else if (c.op === "expire") r = { ok: true, code: null, reason: J(await BK.expireDepositHolds(new Date(a[0]))) };
    else if (c.op === "status") { const x = await BK.setAppointmentStatus(a[0], a[1], a[2], a[3]); r = { ...x, code: x?.ok ? null : "STATUS_FAIL", id: a[2] }; }
    else if (c.op === "forfeitNS") { const x = await BK.forfeitAfterNoShow(a[0], a[1], a[2]); r = { ok: true, code: null, reason: J(x) }; }
    else if (c.op === "consumeEvt") {
      const { prisma } = await import("@/lib/core/db" as string);
      const CONS = await CSm();
      const ev = await prisma.outboxEvent.findUnique({ where: { id: a[0] } });
      await CONS.consumers[ev.type]({ id: ev.id, tenantId: ev.tenantId, type: ev.type, payload: ev.payload, unitId: ev.unitId, systemId: null });
      r = { ok: true };
    } else if (c.op === "resFlip") {
      const codes: string[] = [];
      for (let k = 0; k < a[3]; k++) { const x = await RS.updateResource(a[0], a[1], a[2], { sortOrder: k % 2 ? a[4] : a[5] }); codes.push(x.ok ? "OK" : x.code); }
      r = { ok: true, code: null, reason: codes.slice(0, 4).join(",") };
    } else if (c.op === "submit") {
      const PNG = Uint8Array.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(96)]));
      r = await DP.submitDepositSlip(a[0], { file: { data: PNG, contentType: "image/png" }, idempotencyKey: a[1] }, { ip: a[2], deps: { put: async () => undefined, del: async () => 200 } });
    } else if (c.op === "quote") r = { ok: true, code: null, reason: String(await ON.lateForfeitSatangOf(a[0], a[1])) };
    else r = { unknownOp: c.op };
    return { op: c.op, tag: c.tag ?? null, r: slim(r), ms: Date.now() - t0 };
  } catch (e) {
    return { op: c.op, tag: c.tag ?? null, threw: errMsg(e), ms: Date.now() - t0 };
  }
}

if (process.env.PROBE_B15B_CHILD) {
  const spec = JSON.parse(process.env.PROBE_B15B_CHILD) as { run: string; key: string; calls: Call[] };
  try {
    const { prisma } = await import("@/lib/core/db" as string);
    await prisma.$queryRawUnsafe("SELECT 1");
    await BKm(); await LNm(); await RNm(); await RSm(); await GRm(); await DPm(); await ONm(); await CSm();
    console.log(`READY ${spec.key}`);
    const t0 = Date.now();
    while (!existsSync(goFile(spec.run, spec.key))) { if (Date.now() - t0 > 300_000) process.exit(5); await sleep(5); }
    const outs = await Promise.all(spec.calls.map(runOp));
    console.log(`RES ${spec.key} ${JSON.stringify(outs)}`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.log(`CHILD_ERR ${errMsg(e)}`);
    process.exit(3);
  }
}

// ═══════════ โพรเซสหลัก ═══════════
const LOG = `/tmp/probe-b15-b.out.${process.pid}.log`;
{
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...x: unknown[]) => { try { appendFileSync(LOG, `${x.map((y) => (typeof y === "string" ? y : J(y))).join(" ")}\n`); } catch { /* */ } try { orig(...x); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}
const ONLY = new Set((process.env.PROBE_B15_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const want = (g: string) => ONLY.size === 0 || ONLY.has(g);
const RUN = Date.now().toString(36);
const goFiles: string[] = [];
let fanSeq = 0;
async function fan(label: string, perChild: Call[][]): Promise<any[]> {
  const key = `${label}-${++fanSeq}`;
  const n = perChild.length;
  const ready = new Set<number>(); const res = new Map<number, any[]>(); const dead = new Set<number>(); const errs: string[] = [];
  const kids = perChild.map((calls, idx) => {
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, PROBE_B15B_CHILD: JSON.stringify({ run: RUN, key, calls }) }, stdio: ["ignore", "pipe", "pipe"] });
    createInterface({ input: ch.stdout }).on("line", (l) => {
      if (l === `READY ${key}`) ready.add(idx);
      else if (l.startsWith(`RES ${key} `)) res.set(idx, JSON.parse(l.slice(`RES ${key} `.length)));
      else if (l.startsWith("CHILD_ERR")) errs.push(`#${idx} ${l}`);
    });
    let tail = "";
    ch.stderr.on("data", (b: Buffer) => { tail = (tail + b.toString()).slice(-600); });
    ch.on("exit", (code) => { dead.add(idx); if (code !== 0) errs.push(`#${idx} exit ${code} ${tail.split("\n").filter(Boolean).slice(-2).join(" | ")}`); });
    return ch;
  });
  const waitFor = async (cond: () => boolean, ms: number) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) return false; await sleep(20); } return true; };
  try {
    await waitFor(() => ready.size === n || dead.size > 0, 240_000);
    if (ready.size < n) throw new Error(`ลูกไม่พร้อม ${ready.size}/${n} ${errs.slice(0, 2).join(" · ")}`);
    const f = goFile(RUN, key); writeFileSync(f, "go"); goFiles.push(f);
    await waitFor(() => res.size + [...dead].filter((i) => !res.has(i)).length >= n, 300_000);
  } finally {
    await waitFor(() => dead.size === n, 30_000);
    for (const k of kids) if (k.exitCode === null) k.kill("SIGKILL");
  }
  if (errs.length) console.log(`  (ลูก: ${errs.slice(0, 3).join(" · ")})`);
  return [...res.values()].flat();
}

type R = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: R[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown = "") => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : sev === "INFO" ? "ℹ️  INFO" : "❌ BREACH"} [${id}] (${sev}) ${what}${d ? ` — ${d.slice(0, 1500)}` : ""}`);
};
const info = (id: string, what: string, detail: unknown = "") => rec(id, false, "INFO", what, detail);
const BADRX = /P2028|P2024|P2034|timed out|Unable to start a transaction|Transaction already closed|INTERNAL|40P01|deadlock/i;
const badOf = (outs: any[]) => outs.filter((o) => o.threw || BADRX.test(J(o)));
const codesOf = (outs: any[]) => outs.map((o) => `${o.op}${o.tag ? `/${o.tag}` : ""}:${o.threw ? "THREW " + o.threw.slice(0, 80) : o.r?.ok ? "OK" : o.r?.code ?? "FAIL"}`);
const step = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { rec(id, false, "ERR", "probe ล้มเอง (ไม่ใช่ผลตัดสิน)", errMsg(e)); } };
const ALLOWED = new Set(["FULL", "BUSY", "LOST_RACE", "BAD_STATE", "GROUP", "NOT_FOUND", "STATUS_FAIL", "SLIP_IN_REVIEW", "FORFEIT_CONFIRM_REQUIRED", "RELEASED", "WALKIN_CLOSED", "LATE_CHANGE", "TOO_LATE", "NOT_CONFIRMED", "IN_REVIEW", "ALREADY_PAID", "EXPIRED"]);
const offContract = (outs: any[]) => outs.filter((o) => !o.threw && o.r && o.r.ok === false && !ALLOWED.has(o.r.code));

// ═══════════ ฐาน ═══════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => (await pool.query(sql, p)).rows;
const colCache = new Map<string, any[]>();
const rid = (p: string) => `b15pb_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function insertRow(table: string, vals: Record<string, unknown>) {
  if (!colCache.has(table)) colCache.set(table, await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  const v: Record<string, unknown> = { ...vals };
  for (const c of colCache.get(table)!) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type as string;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : null;
  }
  const k = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${k.map((x) => `"${x}"`).join(", ")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(", ")})`, k.map((x) => v[x]));
}
const SLUG = "qc-svc-b15p-";
const MAIL = "qc-svc-b15p-";
const TOKENS = new Set<string>();
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const tables = (await q(`SELECT DISTINCT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t as string);
  let pending = tables;
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { failed.push(t); } }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupGlobal() {
  try {
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${MAIL}%`]);
    await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE '%b15p-%'`);
    const keys = [...TOKENS].map((t) => `bq:manage:tk:${createHash("sha256").update(t).digest("hex").slice(0, 32)}`);
    if (keys.length) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [keys]);
  } catch (e) { console.log(`  ⚠️ ลบผู้ใช้/ถัง: ${errMsg(e)}`); }
}
const readDeadlocks = async () => Number((await q(`SELECT deadlocks::text AS n FROM pg_stat_database WHERE datname = current_database()`))[0]?.n ?? NaN);
const dlSettled = async () => { await sleep(12_000); return readDeadlocks(); };

// ═══════════ เวลา ═══════════
const addDays = (ds: string, n: number) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const DS = addDays(TODAY, 6);
const atMs = (ds: string, min: number) => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * MIN; };
const at = (ds: string, min: number) => new Date(atMs(ds, min));
const D = (d: Date) => ({ __date: d.toISOString() });
const HM = (ms: number | null | undefined) => (ms == null ? "—" : new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16));
const minOf = (d: Date) => Math.round((d.getTime() - atMs(DS, 0)) / MIN);

// ═══════════ fixtures ═══════════
const T = (k: string) => `b15pb_${k}_${RUN}`;
const ids = { tA: T("tA"), tB: T("tB"), owner: T("owner") };
const TIDS = [ids.tA, ids.tB];
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
const SHOP = { tenantId: ids.tA, actorUserId: ids.owner };
type ResSpec = { key: string; kind: string; sortOrder: number; cleanup: number; cap?: number };
type SvcSpec = { key: string; dur: number; kinds?: string[]; price?: number; staffCount?: number };
type Unit = { key: string; tenantId: string; id: string; ctx: { tenantId: string; unitId: string }; staff: string[]; svc: Record<string, string>; res: Record<string, string>; kinds: Map<string, string[]>; dep?: { payWithinMin: number; minDurationMin: number | null } };
const units: Unit[] = [];
let ord = 0;
let phoneN = 0;
const NAMES: string[] = [];
const PHONES: string[] = [];
const PH0 = 63_000_000 + Math.floor(Math.random() * 600_000) * 10;
const newPhone = () => { const p = `08${String(PH0 + ++phoneN).slice(-8)}`; PHONES.push(p); return p; };
const newName = () => { const n = `คุณโพรบกลุ่ม ${RUN}-${++phoneN}`; NAMES.push(n); return n; };
let ipSeq = 0;
const newIp = () => `b15p-${RUN}-${++ipSeq}`;
async function mkUnit(key: string, o: { tenant?: string; staffN: number; res: ResSpec[]; svcs: SvcSpec[]; hours?: [number, number]; dep?: Unit["dep"] }): Promise<Unit> {
  const tenantId = o.tenant ?? ids.tA;
  const id = T(`u_${key}`);
  await insertRow("BusinessUnit", { id, tenantId, type: "BOOKING", name: `pb ${key}`, slug: `b15pb-${key.toLowerCase()}-${RUN}`, updatedAt: new Date() });
  const [op, cl] = o.hours ?? [600, 1200];
  for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId, unitId: id, weekday: w, openMin: op, closeMin: cl, closed: false, updatedAt: new Date() });
  const staff: string[] = [];
  for (let i = 0; i < o.staffN; i++) {
    const sid = T(`${key}_s${i}`);
    await insertRow("BookingStaff", { id: sid, tenantId, unitId: id, name: `หมอ ${key} ${i + 1}`, sortOrder: i + 1, createdAt: new Date(Date.now() - 900_000 + ++ord * 1000), updatedAt: new Date() });
    staff.push(sid);
  }
  const svc: Record<string, string> = {}; const kinds = new Map<string, string[]>();
  for (const s of o.svcs) {
    const sid = T(`${key}_${s.key}`);
    await insertRow("BookingService", { id: sid, tenantId, unitId: id, name: `${s.key} ${s.dur}`, durationMin: s.dur, priceSatang: s.price ?? 50000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
    svc[s.key] = sid; kinds.set(sid, s.kinds ?? []);
  }
  const res: Record<string, string> = {};
  for (const r of o.res) {
    const rr = T(`${key}_${r.key}`);
    await insertRow("SvcResource", { id: rr, tenantId, unitId: id, kind: r.kind, name: `${r.key}`, capacity: r.cap ?? 1, cleanupMin: r.cleanup, active: true, sortOrder: r.sortOrder, createdAt: new Date(Date.now() - 900_000 + ++ord * 1000), updatedAt: new Date() });
    res[r.key] = rr;
  }
  const u: Unit = { key, tenantId, id, ctx: { tenantId, unitId: id }, staff, svc, res, kinds, ...(o.dep ? { dep: o.dep } : {}) };
  (u as any).staffCount = Object.fromEntries(o.svcs.filter((s) => s.staffCount).map((s) => [svc[s.key], s.staffCount]));
  units.push(u);
  return u;
}

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const BK: any = await BKm();
const LN: any = await LNm();
const RN: any = await RNm();
const GR: any = await GRm();
const DP: any = await DPm();
const ON: any = await ONm();
const CONS: any = await CSm();
const SET: any = await import("@/lib/core/settings" as string);
const PL: any = await import("@/lib/modules/booking/planner" as string);
const SV: any = await import("@/lib/payment/slip-verify" as string);

async function finishSetup(list: Unit[]) {
  for (const u of list) {
    const a = await SET.applyTemplate(OWNER, { tenantId: u.tenantId }, { unitId: u.id, domain: "booking", templateKey: "SPA", overwrite: "RESET_ALL" });
    if (!a.ok) throw new Error(`applyTemplate ${u.key} ${J(a)}`);
  }
  for (const t of TIDS) {
    const us = list.filter((u) => u.tenantId === t);
    if (!us.length) continue;
    const s = await SET.setSettings(OWNER, { tenantId: t }, us.flatMap((u) => [
      { key: "booking.staff.minBreakMin", scope: "UNIT", scopeId: u.id, value: 0 },
      { key: "booking.queue.safetyMin", scope: "UNIT", scopeId: u.id, value: 0 },
      { key: "booking.staff.maxJobsPerDay", scope: "UNIT", scopeId: u.id, value: null },
      { key: "booking.queue.walkInCloseWaitMin", scope: "UNIT", scopeId: u.id, value: 600 },
      { key: "booking.booking.onlineSharePct", scope: "UNIT", scopeId: u.id, value: 100 },
      { key: "booking.booking.horizonDays", scope: "UNIT", scopeId: u.id, value: 60 },
      { key: "booking.booking.maxOpenPerPhone", scope: "UNIT", scopeId: u.id, value: null },
      { key: "booking.booking.requireConfirm", scope: "UNIT", scopeId: u.id, value: false },
    ]));
    if (!s.ok) throw new Error(`setSettings ${J(s)}`);
    const dep = us.filter((u) => u.dep).flatMap((u) => [
      { key: "booking.deposit.method", scope: "UNIT", scopeId: u.id, value: "PROMPTPAY_SLIP" },
      { key: "booking.deposit.amount", scope: "UNIT", scopeId: u.id, value: { mode: "PERCENT", bp: 2000, minDurationMin: u.dep!.minDurationMin } },
      { key: "booking.deposit.payWithinMin", scope: "UNIT", scopeId: u.id, value: u.dep!.payWithinMin },
      { key: "booking.deposit.forfeitPct", scope: "UNIT", scopeId: u.id, value: 50 },
      { key: "booking.late.lateCancelMode", scope: "UNIT", scopeId: u.id, value: "FORFEIT" },
      { key: "booking.late.freeChangeBeforeMin", scope: "UNIT", scopeId: u.id, value: 180 },
    ]);
    if (dep.length) { const r = await SET.setSettings(OWNER, { tenantId: t }, dep); if (!r.ok) throw new Error(`deposit settings ${J(r)}`); }
    const kk = us.flatMap((u) => [...u.kinds.entries()].filter(([, k]) => k.length).map(([sid, k]) => ({ key: "booking.service.resourceKinds", scope: "SERVICE", scopeId: sid, value: k })));
    const sc = us.flatMap((u) => Object.entries((u as any).staffCount as Record<string, number>).map(([sid, n]) => ({ key: "booking.service.staffCount", scope: "SERVICE", scopeId: sid, value: n })));
    if (kk.length || sc.length) { const r = await SET.setSettings(OWNER, { tenantId: t }, [...kk, ...sc]); if (!r.ok) throw new Error(`resourceKinds/staffCount ${J(r)}`); }
  }
}

// ═══════════ ตัวกวาด invariant (SQL · นิยาม B.13 §4.6 + Q1/Q2/Q11/Q18 แบบ probe-b13-b) ═══════════
type Occ = { id: string; s: number; e: number };
async function sweep(unitId: string): Promise<string[]> {
  const res = await q(`SELECT id, kind, capacity, "cleanupMin", active FROM "SvcResource" WHERE "unitId" = $1`, [unitId]);
  const rows = await q(`SELECT a.id, a.status::text AS status, a."serviceId", a."startAt", a."endAt", a."resourceId", a."plannedStartAt", a."startedAt", a."policySnapshot", s."bufferMin", a."checkedInAt"
    FROM "Appointment" a JOIN "BookingService" s ON s.id = a."serviceId" WHERE a."unitId" = $1 AND a.status::text NOT IN ('CANCELLED','NO_SHOW','DONE')`, [unitId]);
  const occ = new Map<string, Occ[]>(res.map((r) => [r.id, []]));
  const bad: string[] = [];
  const u = units.find((x) => x.id === unitId);
  for (const a of rows) {
    const job = a.policySnapshot?.job ?? {};
    if (a.status === "ARRIVED" && !a.plannedStartAt && a.checkedInAt && typeof job.unplacedFor === "string" && Date.parse(job.unplacedFor) === a.checkedInAt.getTime()) continue;
    const rids: string[] = Array.isArray(job.resourceIds) ? job.resourceIds : a.resourceId ? [a.resourceId] : [];
    const s = a.startAt.getTime();
    const dur = typeof job.durationMin === "number" ? job.durationMin * MIN : a.endAt.getTime() - s - (job.bufferMin ?? a.bufferMin) * MIN;
    const arrivedFrom = a.status === "ARRIVED" && a.checkedInAt ? Math.max(a.startAt.getTime(), a.checkedInAt.getTime()) : a.startAt.getTime();
    const st0 = a.status === "IN_SERVICE" ? (a.startedAt ?? a.plannedStartAt ?? a.startAt).getTime() : (a.plannedStartAt?.getTime() ?? arrivedFrom);
    const e = st0 + dur;
    const need = u?.kinds.get(a.serviceId) ?? [];
    if (need.length && !rids.length) bad.push(`UNBOUND ${a.id.slice(-6)} ${a.status}`);
    for (const x of rids) {
      const r = res.find((y) => y.id === x);
      if (!r) { bad.push(`FOREIGN ${a.id.slice(-6)} ถือ ${x}`); continue; }
      occ.get(x)!.push({ id: a.id, s: st0, e: e + r.cleanupMin * MIN });
    }
  }
  for (const r of res) {
    const xs = occ.get(r.id)!;
    for (const x of xs) {
      const n = xs.filter((y) => y.s <= x.s && y.e > x.s).length;
      if (n > r.capacity) { bad.push(`${r.id.slice(-12)} ซ้อน ${n} > จุ ${r.capacity} ที่ ${HM(x.s)}`); break; }
    }
  }
  return bad;
}
const staffOverlap = async (unitId: string): Promise<string[]> => {
  const rows = await q(`SELECT "staffId", "startAt" AS s, "endAt" AS e FROM "Appointment" WHERE "unitId" = $1 AND status::text NOT IN ('CANCELLED','NO_SHOW','DONE') ORDER BY "staffId", "startAt"`, [unitId]);
  const bad: string[] = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].staffId === rows[i - 1].staffId && rows[i].s.getTime() < rows[i - 1].e.getTime()) bad.push(`${rows[i].staffId.slice(-6)} ${HM(rows[i].s.getTime())}`);
  return bad;
};
const AP = `SELECT id, "tenantId", "unitId", status::text AS status, "staffId", "serviceId", "startAt", "endAt", "resourceId", "plannedStartAt", "startedAt", "checkedInAt", "groupId", "depositSatang", "depositPaidAt", "depositSaleId", "cancelReason", "manageTokenHash", "queueTicketId", "idempotencyKey", "createdAt", "policySnapshot" FROM "Appointment"`;
const apRow = async (id: string) => (await q(`${AP} WHERE id = $1`, [id]))[0];
const apRows = async (xs: string[]) => Promise.all(xs.map(apRow));
const groupRows = async (gid: string) => q(`${AP} WHERE "groupId" = $1 ORDER BY "createdAt", id`, [gid]);
const resIdsOf = (a: any): string[] => { const j = a.policySnapshot?.job?.resourceIds; return Array.isArray(j) ? j : a.resourceId ? [a.resourceId] : []; };
/** ทุกกลุ่มในหน่วย: ≥2 แถว · หน่วย/ร้านเดียว · สมาชิกที่ยังถือ (ไม่ CANCELLED/NO_SHOW) เริ่มพร้อมกัน · หมอไม่ซ้ำ · ห้องชิ้นเดียวกันต่อชนิด */
async function groupIntegrity(unitId: string): Promise<string[]> {
  const rows = await q(`${AP} WHERE "groupId" IN (SELECT DISTINCT "groupId" FROM "Appointment" WHERE "unitId" = $1 AND "groupId" IS NOT NULL) ORDER BY "groupId", "createdAt", id`, [unitId]);
  const by = new Map<string, any[]>();
  for (const r of rows) by.set(r.groupId, [...(by.get(r.groupId) ?? []), r]);
  const bad: string[] = [];
  for (const [g, xs] of by) {
    const tag = g.slice(-8);
    if (xs.length < 2) bad.push(`${tag} มี ${xs.length} แถว`);
    if (new Set(xs.map((x) => `${x.tenantId}|${x.unitId}`)).size > 1) bad.push(`${tag} ข้ามหน่วย/ร้าน`);
    const live = xs.filter((x) => !["CANCELLED", "NO_SHOW"].includes(x.status));
    if (new Set(live.map((x) => x.startAt.getTime())).size > 1) bad.push(`${tag} เริ่มไม่พร้อมกัน ${live.map((x) => HM(x.startAt.getTime())).join(",")}`);
    if (new Set(live.map((x) => x.staffId)).size !== live.length) bad.push(`${tag} หมอซ้ำ`);
    const rk = live.map((x) => resIdsOf(x)).filter((r) => r.length);
    if (rk.length > 1 && new Set(rk.map((r) => r.join("|"))).size > 1) bad.push(`${tag} แยกห้อง ${J(rk.map((r) => r.map((y) => y.slice(-4))))}`);
  }
  return bad;
}
async function unitInv(u: Unit): Promise<string[]> {
  return [...(await sweep(u.id)).map((x) => `res:${x}`), ...(await staffOverlap(u.id)).map((x) => `staff:${x}`), ...(await groupIntegrity(u.id)).map((x) => `grp:${x}`)];
}

// ── เงิน ──
const receiptsOf = async (apptId: string) => q(`SELECT id, status::text AS status, "grandTotalSatang"::int AS grand, "idempotencyKey" AS key FROM "PosSale" WHERE "sourceModule" = 'POS_DEPOSIT' AND "tenantId" = $1 AND "idempotencyKey" LIKE $2 AND status::text <> 'VOIDED' ORDER BY "createdAt"`, [ids.tA, `booking-deposit-${apptId}%`]);
const depOf = async (receiptId: string) => (await q(`SELECT "amountSatang"::int AS amount, "usedSatang"::int AS used, "refundedSatang"::int AS refunded, status::text AS status FROM "PosDeposit" WHERE "receiptSaleId" = $1`, [receiptId]))[0] ?? null;
const refundsOf = async (receiptId: string) => q(`SELECT id, "grandTotalSatang"::int AS grand FROM "PosSale" WHERE "docType" = 'REFUND' AND "refSaleId" = $1 AND status::text <> 'VOIDED'`, [receiptId]);
const forfeitsOf = async (apptId: string) => q(`SELECT id, "grandTotalSatang"::int AS grand FROM "PosSale" WHERE "sourceModule" = 'BOOKING' AND "sourceId" = $1 AND "idempotencyKey" LIKE 'dep-forfeit:%' AND status::text = 'PAID'`, [apptId]);
const jv = async (saleIds: string[]) => (saleIds.length ? q(`SELECT a.code, l.debit::bigint AS debit, l.credit::bigint AS credit, e.id AS entry FROM "AccountJournalEntry" e JOIN "AccountJournalLine" l ON l."entryId" = e.id JOIN "AccountLedger" a ON a.id = l."accountId" WHERE e."refType" = 'PosSale' AND e."refId" = ANY($1::text[])`, [saleIds]) : []);
const balanced = (ls: any[]) => { const by = new Map<string, number>(); for (const l of ls) by.set(l.entry, (by.get(l.entry) ?? 0) + Number(l.debit) - Number(l.credit)); return [...by.values()].every((v) => v === 0); };
const netCr = (ls: any[], pred: (c: string) => boolean) => ls.filter((l) => pred(String(l.code))).reduce((t, l) => t + Number(l.credit) - Number(l.debit), 0);
type Money = { rows: any[]; rc: number; paid: number; refunded: number; forfeited: number; refundCount: number; issues: string[]; saleIds: string[]; perRow: any[] };
/** ตรวจเงินต่อแถว: ใบรับ ≤1 · ผูกแถว (depositSaleId) · จ่ายแล้ว ⇔ มีใบรับ · ไม่มี "จ่ายแล้วแต่ถูกปล่อยช่องเพราะหมดเวลา" · คืน ≤ 1 ใบต่อใบรับ · คืน+ใช้ ≤ ยอด */
async function moneyOf(apptIds: string[]): Promise<Money> {
  const rows = await apRows(apptIds);
  const issues: string[] = []; const saleIds: string[] = []; const perRow: any[] = [];
  let rcN = 0, paid = 0, refunded = 0, forfeited = 0, refundCount = 0;
  for (const a of rows) {
    const rc = await receiptsOf(a.id);
    const tag = a.id.slice(-6);
    rcN += rc.length;
    if (rc.length > 1) issues.push(`${tag} ใบรับ ${rc.length} ใบ`);
    if (rc.length === 1 && a.depositSaleId !== rc[0].id) issues.push(`${tag} ใบรับลอย (แถวไม่ผูก ${a.depositSaleId ? "ผูกใบอื่น" : "null"})`);
    if (rc.length === 0 && a.depositPaidAt) issues.push(`${tag} depositPaidAt แต่ไม่มีใบรับ`);
    if (rc.length && a.status === "CANCELLED" && a.cancelReason === "DEPOSIT_TIMEOUT") issues.push(`${tag} จ่ายแล้วแต่ถูกปล่อยช่อง (DEPOSIT_TIMEOUT)`);
    let rowRef = 0;
    for (const r of rc) {
      saleIds.push(r.id);
      const d = await depOf(r.id);
      paid += d?.amount ?? 0;
      refunded += d?.refunded ?? 0;
      if (d && d.refunded + d.used > d.amount) issues.push(`${tag} คืน+ใช้ ${d.refunded + d.used} > ${d.amount}`);
      if (d && d.amount !== r.grand) issues.push(`${tag} PosDeposit ${d.amount} ≠ ใบรับ ${r.grand}`);
      const rf = await refundsOf(r.id);
      refundCount += rf.length;
      rowRef += rf.length;
      if (rf.length > 1) issues.push(`${tag} ใบคืน ${rf.length} ใบ`);
      for (const x of rf) saleIds.push(x.id);
    }
    const fb = await forfeitsOf(a.id);
    if (fb.length > 1) issues.push(`${tag} บิลริบ ${fb.length} ใบ`);
    for (const x of fb) { forfeited += x.grand; saleIds.push(x.id); }
    perRow.push({ id: tag, st: a.status, why: a.cancelReason, dep: a.depositSatang, rc: rc.map((x) => x.grand), refunds: rowRef, forfeit: fb.map((x) => x.grand) });
  }
  return { rows, rc: rcN, paid, refunded, forfeited, refundCount, issues, saleIds, perRow };
}
async function pump(rounds = 30): Promise<string[]> {
  const errs: string[] = [];
  for (let i = 0; i < rounds; i++) {
    const rows = await q(`SELECT id, "tenantId", type, payload, "unitId" FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND status = 'PENDING' ORDER BY "createdAt", id LIMIT 200`, [TIDS]);
    if (!rows.length) return errs;
    for (const row of rows) {
      const claim = await pool.query(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 minutes' WHERE id = $1 AND status = 'PENDING' RETURNING id`, [row.id]);
      if (!claim.rowCount) continue;
      const h = CONS.consumers?.[row.type];
      if (typeof h === "function") { try { await h({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, unitId: row.unitId, systemId: null }); } catch (e) { errs.push(`${row.type}: ${errMsg(e).slice(0, 100)}`); } }
      await pool.query(`UPDATE "OutboxEvent" SET status = 'DONE', "processedAt" = now() WHERE id = $1 AND status = 'PENDING'`, [row.id]);
    }
  }
  return errs;
}
const evCount = async (type: string, apptId: string) => Number((await q(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type = $2 AND payload->>'appointmentId' = $3`, [TIDS, type, apptId]))[0].n);
const tokenOf = async (u: Unit, leaderId: string): Promise<string> => {
  const url = await ON.manageLinkFor(u.ctx, leaderId);
  if (typeof url !== "string" || !url.startsWith("/bq/m/")) throw new Error(`manageLinkFor ${J(url)}`);
  const t = url.slice("/bq/m/".length);
  TOKENS.add(t);
  return t;
};
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (): Uint8Array => Uint8Array.from(Buffer.concat([PNG_SIG, randomBytes(96)]));
const put = async (_p: string, _d: Uint8Array, _c: string): Promise<void> => { void _p; void _d; void _c; };
const del = async (_p: string): Promise<number> => { void _p; return 200; };
const newTR = () => `B15PB${Date.now().toString(36)}${randomBytes(4).toString("hex")}`.toUpperCase();
/** แนบสลิป (ตรวจมือ) ที่หัวกลุ่ม → ร้านอนุมัติ (เต็ม/บางส่วน) ⇒ id ของ event payment.slip.approved (ยังไม่ระบาย) */
async function slipApproved(token: string, leaderId: string, decision: Record<string, unknown>): Promise<{ evId: string; slipId: string; expected: number }> {
  const s = await DP.submitDepositSlip(token, { file: { data: png(), contentType: "image/png" }, idempotencyKey: `b15p-s-${randomBytes(6).toString("hex")}` }, { ip: newIp(), deps: { put, del } });
  if (!s?.ok) throw new Error(`submitDepositSlip ${J(s)}`);
  const sl = (await q(`SELECT id, status::text AS status, "expectedSatang" AS exp FROM "PaymentSlip" WHERE "refId" = $1 ORDER BY "createdAt" DESC`, [leaderId]))[0];
  if (!sl) throw new Error("ไม่พบ PaymentSlip");
  const d = await SV.decideSlip({ userId: ids.owner }, { tenantId: ids.tA }, sl.id, { reason: "ตรวจกับแอปธนาคารแล้ว", transRef: newTR(), ...decision });
  if (d?.ok !== true) throw new Error(`decideSlip ${J(d)}`);
  const ev = (await q(`SELECT id FROM "OutboxEvent" WHERE type = 'payment.slip.approved' AND payload->>'slipId' = $1`, [sl.id]))[0];
  if (!ev) throw new Error("ไม่มี event payment.slip.approved");
  return { evId: ev.id, slipId: sl.id, expected: Number(sl.exp ?? 0) };
}

const gin = (u: Unit, members: { svc: string; staff: number | null }[], min: number, channel = "STAFF", extra: Record<string, unknown> = {}) => ({
  members: members.map((m) => ({ serviceId: u.svc[m.svc], staffId: m.staff === null ? null : u.staff[m.staff] })),
  dateStr: DS, startMin: min, channel, customerName: newName(), customerPhone: newPhone(), idempotencyKey: rid("gidem"), ...extra,
});
const bkIn = (u: Unit, svcKey: string, staffIdx: number | null, min: number, channel = "STAFF", extra: Record<string, unknown> = {}) =>
  ({ serviceId: u.svc[svcKey], staffId: staffIdx === null ? null : u.staff[staffIdx], dateStr: DS, startMin: min, channel, customerName: newName(), customerPhone: newPhone(), idempotencyKey: rid("idem"), ...extra });
async function groupOk(u: Unit, members: { svc: string; staff: number | null }[], min: number, channel = "STAFF", extra: Record<string, unknown> = {}): Promise<any> {
  const i = gin(u, members, min, channel, extra);
  const r = await GR.bookGroup(u.ctx, i);
  if (!r.ok) throw new Error(`bookGroup ${u.key} ${HM(atMs(DS, min))} ${channel} ล้ม ${r.code} ${r.reason}`);
  return { ...r, phone: i.customerPhone };
}
async function bookOk(u: Unit, svcKey: string, staffIdx: number | null, min: number, channel = "STAFF"): Promise<string> {
  const r = await BK.bookAppointment(u.ctx, bkIn(u, svcKey, staffIdx, min, channel));
  if (!r.ok) throw new Error(`จอง ${u.key} ${svcKey} ${HM(atMs(DS, min))} ${channel} ล้ม ${r.code} ${r.reason}`);
  return r.id;
}

// ═══════════ main ═══════════
let dlStart = NaN;
const dlNotes: string[] = [];
const busyNotes: string[] = [];
const noteBusy = (id: string, outs: any[]) => { const n = outs.filter((o) => o?.r?.code === "BUSY").length; if (n) busyNotes.push(`${id}:${n}`); };
try {
  const stale = (await q(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id as string);
  if (stale.length) { console.log(`(กวาดร้านค้าง ${stale.length})`); await cleanup(stale); }
  await cleanupGlobal();
  for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) await insertRow("Tenant", { id, name: `PB B15 ${n}`, slug: `${SLUG}${n}-${RUN}`, updatedAt: new Date() });
  await insertRow("User", { id: ids.owner, email: `${MAIL}owner-${RUN}@qc.invalid`, name: "PB B15 owner", updatedAt: new Date() });
  for (const t of TIDS) await insertRow("Membership", { id: rid("mb"), userId: ids.owner, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });

  // ── หน่วยทุกฉาก ──
  const U: Record<string, Unit> = {};
  const mk = async (k: string, o: Parameters<typeof mkUnit>[1]) => { U[k] = await mkUnit(k, o); return U[k]; };
  const SVCS: SvcSpec[] = [{ key: "VIP", dur: 60, kinds: ["COUPLE_ROOM"] }, { key: "VIP90", dur: 90, kinds: ["COUPLE_ROOM"] }, { key: "PLAIN", dur: 60 }, { key: "CPL", dur: 60, kinds: ["COUPLE_ROOM"], staffCount: 2 }];
  const vip = (cap = 2, cleanup = 15): ResSpec[] => [{ key: "vip", kind: "COUPLE_ROOM", sortOrder: 1, cleanup, cap }];
  for (let r = 0; r < 4; r++) await mk(`P1r${r}`, { staffN: 12, res: r === 2 ? vip(3) : r === 3 ? [...vip(), { key: "vip2", kind: "COUPLE_ROOM", sortOrder: 2, cleanup: 15, cap: 2 }] : vip(), svcs: SVCS });
  for (let r = 0; r < 3; r++) await mk(`P2r${r}`, { staffN: 12, res: vip(), svcs: SVCS });
  await mk("P3", { staffN: 4, res: vip(), svcs: SVCS });
  for (let r = 0; r < 3; r++) await mk(`P3r${r}`, { staffN: 5, res: vip(), svcs: SVCS });
  for (let r = 0; r < 6; r++) await mk(`P4r${r}`, { staffN: 4, res: vip(), svcs: SVCS });
  const DSVCS: SvcSpec[] = [{ key: "OIL", dur: 60, kinds: ["COUPLE_ROOM"], price: 90_005 }, { key: "ARO", dur: 90, kinds: ["COUPLE_ROOM"], price: 120_003 }, { key: "CPL", dur: 60, kinds: ["COUPLE_ROOM"], price: 90_005, staffCount: 2 }];
  const dRooms: ResSpec[] = [1, 2, 3].map((k) => ({ key: `dv${k}`, kind: "COUPLE_ROOM", sortOrder: k, cleanup: 0, cap: 2 }));
  for (let r = 0; r < 6; r++) await mk(`P5e${r}`, { staffN: 4, res: dRooms, svcs: DSVCS, dep: { payWithinMin: 1, minDurationMin: null } });
  for (const k of ["P5p", "P5l", "P5f", "P5n", "P5g", "P5h", "P5i"]) await mk(k, { staffN: 6, res: dRooms, svcs: DSVCS, dep: { payWithinMin: 1440, minDurationMin: k === "P5h" ? 90 : null } });
  for (const k of ["P12a", "P12c", "P12d", "P12e"]) await mk(k, { staffN: 6, res: dRooms, svcs: DSVCS, dep: { payWithinMin: 1440, minDurationMin: null } });
  for (let r = 0; r < 3; r++) await mk(`P12b${r}`, { staffN: 4, res: dRooms, svcs: DSVCS, dep: { payWithinMin: 1, minDurationMin: null } });
  await mk("P6", { staffN: 12, res: [...vip(), { key: "vip2", kind: "COUPLE_ROOM", sortOrder: 2, cleanup: 15, cap: 2 }, { key: "vip3", kind: "COUPLE_ROOM", sortOrder: 3, cleanup: 15, cap: 2 }], svcs: SVCS });
  await mk("P7a", { staffN: 3, res: vip(), svcs: SVCS });
  await mk("P7a2", { staffN: 3, res: vip(), svcs: SVCS });
  await mk("P7b", { tenant: ids.tB, staffN: 3, res: vip(), svcs: SVCS });
  for (let r = 0; r < 3; r++) await mk(`P10r${r}`, { staffN: 4, res: vip(), svcs: SVCS });
  for (let r = 0; r < 3; r++) await mk(`P10x${r}`, { staffN: 4, res: vip(), svcs: SVCS });
  for (let r = 0; r < 3; r++) await mk(`P11r${r}`, { staffN: 6, res: vip(), svcs: SVCS });
  await finishSetup(units);
  // POS + บัญชี (จด VAT) ของร้าน A ⇒ ใบรับมัดจำ + GL (แบบ qc-svc-b.15)
  {
    const SYS: any = await import("@/lib/modules/system/service" as string);
    const ACC: any = await import("@/lib/modules/account/service" as string);
    const GL: any = await import("@/lib/modules/account/gl" as string);
    const posSys = await SYS.createSystem(ids.tA, "POS", "ขาย PB B15");
    for (const u of units.filter((x) => x.dep)) await SYS.linkUnit(ids.tA, posSys.id, u.id);
    const acc = await SYS.createSystem(ids.tA, "ACCOUNT", "บัญชี PB B15");
    await ACC.saveSettings(ids.tA, acc.id, { orgName: "PB B15 จำกัด", taxId: "0105561177639", vatRegistered: true });
    await GL.ensureAccounting({ tenantId: ids.tA, systemId: acc.id });
    await insertRow("AccountSystemLink", { id: rid("asl"), tenantId: ids.tA, systemId: acc.id, linkedKind: "POS", linkedId: posSys.id });
    await insertRow("PaymentProfile", { id: rid("pp"), tenantId: ids.tA, promptpayId: "0812345678", displayName: "PB B15 Shop A", updatedAt: new Date() });
  }
  console.log(`(fixtures พร้อม · ${units.length} หน่วย · วัน ${DS} · now จริง ${new Date().toISOString()})`);
  dlStart = await readDeadlocks();
  const dlCheck = async (label: string, d0: number) => { const d1 = await dlSettled(); const n = d1 - d0; dlNotes.push(`${label}:${n}`); return n; };

  const DEP_OIL = 18_001, DEP_ARO = 24_001, DEP_PAIR = 42_002;
  const FORFEIT_PAIR = Math.floor(DEP_OIL * 50 / 100) + Math.floor(DEP_ARO * 50 / 100); // 21,000
  const pair = [{ svc: "OIL", staff: null }, { svc: "ARO", staff: null }];

  // ═══════════ P1 ห้องคู่ที่เหลือ: กลุ่ม ×10 ∥ เดี่ยว ×5–10 · หมอชนกัน · พลิกลำดับห้อง ═══════════
  if (want("P1")) {
    console.log("\n── P1: กลุ่ม ×10 ∥ เดี่ยว แข่งห้องคู่/เตียงที่เหลือ + หมอคนเดียวกัน (5 โพรเซส) ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 4; r++) for (const min of [840, 1020]) await step(`P1-${r}-${min}`, async () => {
      const u = U[`P1r${r}`];
      if (r === 2) await bookOk(u, "VIP", 11, min); // ห้องจุ 3 เหลือ 2
      const per: Call[][] = Array.from({ length: 5 }, (_, k) => {
        const calls: Call[] = [
          { op: "group", tag: `g${k}a`, a: [u.ctx, gin(u, [{ svc: "VIP", staff: k % 4 }, { svc: k % 2 ? "VIP90" : "VIP", staff: (k + 1) % 4 }], min, k % 2 ? "ONLINE" : "STAFF")] },
          { op: "group", tag: `g${k}b`, a: [u.ctx, gin(u, [{ svc: "VIP", staff: null }, { svc: "VIP", staff: k < 2 ? 4 + k : null }], min, "STAFF")] },
          { op: "book", tag: `s${k}`, a: [u.ctx, bkIn(u, "VIP", k % 2 ? null : k % 4, min, k === 3 ? "ONLINE" : "STAFF")] },
        ];
        if (k < 3) calls.push({ op: "book", tag: `t${k}`, a: [u.ctx, bkIn(u, k === 1 ? "VIP90" : "VIP", 6 + k, min)] });
        if (r === 3 && k < 2) calls.push({ op: "resFlip", a: [OWNER, u.ctx, k ? u.res.vip2 : u.res.vip, 12, k ? 0 : 3, k ? 2 : 1] });
        return calls;
      });
      const outs = await fan(`p1-${r}-${min}`, per);
      noteBusy("P1", outs);
      const inv = await unitInv(u);
      const rows = (await q(`${AP} WHERE "unitId" = $1 AND "startAt" = $2 AND status::text <> 'CANCELLED'`, [u.id, at(DS, min)]));
      const gOk = outs.filter((o) => o.op === "group" && o.r?.ok);
      const gRows = new Map<string, number>();
      for (const a of rows) if (a.groupId) gRows.set(a.groupId, (gRows.get(a.groupId) ?? 0) + 1);
      const halves = [...gRows.values()].filter((n) => n !== 2).length;
      const okIdsMismatch = gOk.filter((o) => !gRows.has(o.r.groupId) || gRows.get(o.r.groupId) !== 2).length;
      const cap = r === 3 ? 4 : r === 2 ? 3 : 2;
      const occupants = rows.filter((a) => resIdsOf(a).length).length;
      rec(`P1-${r}-${HM(atMs(DS, min))}`, badOf(outs).length === 0 && offContract(outs).length === 0 && inv.length === 0 && halves === 0 && okIdsMismatch === 0 && occupants <= cap, "CRITICAL",
        `${u.key} ${HM(atMs(DS, min))}: กลุ่ม 10 · เดี่ยว ${outs.filter((o) => o.op === "book").length} ⇒ ไม่ throw · ห้อง/หมอไม่ล้น · ไม่มีครึ่งกลุ่ม · ผล ok = แถวในฐาน · ผู้ใช้ห้อง ≤ ${cap}`,
        { groupsOk: gOk.length, singlesOk: outs.filter((o) => o.op === "book" && o.r?.ok).length, occupants, inv, halves, okIdsMismatch, bad: badOf(outs).slice(0, 2), off: offContract(outs).slice(0, 2).map((o) => o.r) });
    });
    const n = await dlCheck("P1", d0);
    rec("P1-deadlock", n === 0, "MAJOR", "deadlock ของฐานระหว่าง P1 (รวมพลิก sortOrder ห้อง r3) = 0", { n });
  }

  // ═══════════ P2 กลุ่ม ∥ ร้านเลื่อน ∥ ลูกค้าเลื่อน (สมาชิก/หัวกลุ่ม) ∥ walk-in ∥ เดี่ยวออนไลน์ ═══════════
  if (want("P2")) {
    console.log("\n── P2: กลุ่ม ∥ rescheduleByShop ∥ rescheduleBySelf (หัวกลุ่ม/สมาชิก) ∥ walk-in ∥ เดี่ยว ONLINE ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 3; r++) await step(`P2-${r}`, async () => {
      const u = U[`P2r${r}`];
      const g0 = await groupOk(u, [{ svc: "VIP", staff: 0 }, { svc: "VIP", staff: 1 }], 660, "ONLINE");
      const sA = await bookOk(u, "VIP", 4, 960);
      const sB = await bookOk(u, "VIP", 5, 1020, "ONLINE");
      const before = (await apRows(g0.ids)).map((a) => [a.startAt.getTime(), a.staffId, resIdsOf(a).join("|")]);
      const now = D(at(DS, 838));
      const per: Call[][] = [
        [{ op: "group", tag: "gA", a: [u.ctx, gin(u, [{ svc: "VIP", staff: 6 }, { svc: "VIP", staff: 7 }], 840)] }, { op: "rShop", tag: "shopA", a: [u.ctx, sA, { dateStr: DS, startMin: 840 }] }],
        [{ op: "group", tag: "gB", a: [u.ctx, gin(u, [{ svc: "VIP", staff: 8 }, { svc: "VIP", staff: null }], 840, "ONLINE")] }, { op: "rSelf", tag: "selfB", a: [u.ctx, sB, { dateStr: DS, startMin: 840, staffId: u.staff[5] }] }],
        [{ op: "rSelf", tag: "selfLead", a: [u.ctx, g0.ids[0], { dateStr: DS, startMin: 840, staffId: null }] }, { op: "rSelf", tag: "selfMem", a: [u.ctx, g0.ids[1], { dateStr: DS, startMin: 840, staffId: null }] }],
        [{ op: "rShop", tag: "shopMem", a: [u.ctx, g0.ids[1], { dateStr: DS, startMin: 840 }] }, { op: "walkIn", tag: "walk", a: [u.ctx, u.svc.VIP, null, now] }],
        [{ op: "book", tag: "online", a: [u.ctx, bkIn(u, "VIP", null, 840, "ONLINE")] }, { op: "group", tag: "gC", a: [u.ctx, gin(u, [{ svc: "VIP", staff: 9 }, { svc: "VIP90", staff: 10 }], 840)] }],
      ];
      const outs = await fan(`p2-${r}`, per);
      noteBusy("P2", outs);
      const o = (t: string) => outs.find((x) => x.tag === t);
      const inv = await unitInv(u);
      const g0rows = await apRows(g0.ids);
      const moved = g0rows.every((a) => a.startAt.getTime() === atMs(DS, 840));
      const same = J(g0rows.map((a) => [a.startAt.getTime(), a.staffId, resIdsOf(a).join("|")])) === J(before);
      const memNF = o("selfMem")?.r?.code === "NOT_FOUND";
      const memGroup = o("shopMem")?.r?.code === "GROUP" || (moved && o("shopMem")?.r?.ok === true);
      const leadOk = o("selfLead")?.r?.ok === true;
      rec(`P2-${r}`, badOf(outs).length === 0 && inv.length === 0 && (moved || same) && moved === leadOk && memNF && memGroup, "CRITICAL",
        `${u.key}: แข่ง 10 ทางที่ 14:00 ห้องคู่จุ 2 ⇒ ฐานไม่ล้น · กลุ่มเดิมขยับทั้งกลุ่มหรือไม่ขยับเลย (ตามผลหัวกลุ่ม) · สมาชิกเลื่อนเอง NOT_FOUND · ร้านเลื่อนเวลาสมาชิก GROUP`,
        { codes: codesOf(outs), inv, g0: { moved, same, lead: o("selfLead")?.r?.code ?? "OK" } });
    });
    const n = await dlCheck("P2", d0);
    rec("P2-deadlock", n === 0, "MAJOR", "deadlock ระหว่าง P2 = 0", { n });
  }

  // ═══════════ P3 มาไม่พร้อมกัน + หมอ IN_SERVICE ลากยาว ⇒ ด่านฐาน = ตัววางคิว ═══════════
  if (want("P3")) {
    console.log("\n── P3: สมาชิกหนึ่งมาก่อน · อีกคนหมอทำงานลากยาว · จองเดี่ยวเข้าห้องคู่ (ตัววางคิว ↔ ด่านฐาน) ──");
    await step("P3-det", async () => {
      const u = U.P3;
      const x = await bookOk(u, "PLAIN", 0, 780);
      const c1 = await LN.checkIn(u.ctx, { appointmentId: x }, { via: "STAFF", now: at(DS, 778) });
      const s1 = await LN.startJob(u.ctx, x, { now: at(DS, 780) });
      if (!c1.ok || !s1.ok) throw new Error(`ตั้ง IN_SERVICE ${J(c1)} ${J(s1)}`);
      const g = await groupOk(u, [{ svc: "VIP", staff: 0 }, { svc: "VIP", staff: 1 }], 840);
      const c2 = await LN.checkIn(u.ctx, { appointmentId: g.ids[1] }, { via: "STAFF", now: at(DS, 835) });
      if (!c2.ok) throw new Error(`checkIn M2 ${J(c2)}`);
      await RN.runPlanner(u.ctx, { now: at(DS, 850) });
      const rows = await apRows(g.ids);
      const P = rows.map((a) => a.plannedStartAt?.getTime() ?? null);
      rec("P3-sync", P[0] !== null && P[0] === P[1] && P[0]! > atMs(DS, 840), "MAJOR", "หลัง runPlanner(14:10): หมอของ M1 ยังทำงาน (ลากยาว) · M2 มาแล้ว ⇒ plannedStartAt ของทั้งกลุ่มเท่ากันและช้ากว่า 14:00 (DB-1)", { planned: P.map(HM), status: rows.map((a) => a.status) });
      if (P[0] === null) return;
      const holdEnd = P[0] + 60 * MIN + 15 * MIN; // ห้องคู่ cleanup 15
      const tIn = minOf(new Date(holdEnd - 15 * MIN)), tOut = minOf(new Date(holdEnd));
      const rIn = await BK.bookAppointment(u.ctx, bkIn(u, "VIP", 2, tIn));
      const rOut = await BK.bookAppointment(u.ctx, bkIn(u, "VIP", 3, tOut));
      rec("P3-gate", rIn.ok === false && rIn.code === "FULL" && rOut.ok === true, "MAJOR",
        `จองเดี่ยวห้องคู่ที่ ${HM(atMs(DS, tIn))} (ทับช่วงที่ตัววางคิววางกลุ่ม ${HM(P[0])}–${HM(holdEnd)}) ⇒ FULL · ที่ ${HM(atMs(DS, tOut))} ⇒ ได้`, { inside: rIn.ok ? "OK" : rIn.code, outside: rOut.ok ? "OK" : rOut.code });
      await RN.runPlanner(u.ctx, { now: at(DS, 850) });
      const inv1 = await unitInv(u);
      rec("P3-replan", inv1.length === 0, "MAJOR", "หลังจองเดี่ยว + วางคิวซ้ำ (14:10) ⇒ ฐานไม่ล้น/กลุ่มครบ", inv1);
      // M1 มาสายในเวลาผ่อนผัน (14:12) ⇒ วางคิวใหม่ (หมอ M1 ยังลากยาว) — ทั้งกลุ่มเลื่อน ⇒ ห้องต้องไม่ชนเดี่ยวที่เพิ่งจอง
      const c3 = await LN.checkIn(u.ctx, { appointmentId: g.ids[0] }, { via: "STAFF", now: at(DS, 852) });
      await RN.runPlanner(u.ctx, { now: at(DS, 858) });
      const rows2 = await apRows(g.ids);
      const inv2 = await unitInv(u);
      const P2 = rows2.map((a) => a.plannedStartAt?.getTime() ?? null);
      rec("P3-late", inv2.length === 0 && P2[0] === P2[1], "MAJOR", "M1 มาสาย (14:12) + วางคิว 14:18 ⇒ ทั้งกลุ่มยังเริ่มพร้อมกัน · ห้องคู่ไม่ล้นในนิยามฐาน (§4.6 plannedStartAt)", { checkIn: c3.ok ? "OK" : c3.code, planned: P2.map(HM), inv2, status: rows2.map((a) => a.status) });
    });
    const d0 = await readDeadlocks();
    for (let r = 0; r < 3; r++) await step(`P3c-${r}`, async () => {
      const u = U[`P3r${r}`];
      const x = await bookOk(u, "PLAIN", 0, 780);
      await LN.checkIn(u.ctx, { appointmentId: x }, { via: "STAFF", now: at(DS, 778) });
      await LN.startJob(u.ctx, x, { now: at(DS, 780) });
      const g = await groupOk(u, [{ svc: "VIP", staff: 0 }, { svc: "VIP", staff: 1 }], 840);
      await LN.checkIn(u.ctx, { appointmentId: g.ids[1] }, { via: "STAFF", now: at(DS, 835) });
      await RN.runPlanner(u.ctx, { now: at(DS, 850) });
      const per: Call[][] = [
        [{ op: "plan", a: [u.ctx, D(at(DS, 850)), 3] }, { op: "book", a: [u.ctx, bkIn(u, "VIP", 2, 900)] }],
        [{ op: "plan", a: [u.ctx, D(at(DS, 851)), 3] }, { op: "book", a: [u.ctx, bkIn(u, "VIP", 3, 915)] }],
        [{ op: "checkIn", tag: "m1id", a: [u.ctx, { appointmentId: g.ids[0] }, "STAFF", D(at(DS, 851))] }, { op: "book", a: [u.ctx, bkIn(u, "VIP", 4, 930)] }],
        [{ op: "checkIn", tag: "m1ph", a: [u.ctx, { phone: g.phone }, "PHONE", D(at(DS, 851))] }, { op: "book", a: [u.ctx, bkIn(u, "VIP", null, 945)] }],
        [{ op: "walkIn", a: [u.ctx, u.svc.VIP, null, D(at(DS, 851))] }, { op: "book", a: [u.ctx, bkIn(u, "VIP", 2, 960)] }],
      ];
      const outs = await fan(`p3c-${r}`, per);
      noteBusy("P3c", outs);
      await RN.runPlanner(u.ctx, { now: at(DS, 853) });
      const inv = await unitInv(u);
      const rows = await apRows(g.ids);
      const tickets = await q(`SELECT "refId", count(*)::int AS n FROM "QueueTicket" WHERE "refId" = ANY($1::text[]) AND status::text NOT IN ('CANCELLED','DONE','NO_SHOW') GROUP BY "refId"`, [g.ids]);
      rec(`P3c-${r}`, badOf(outs).length === 0 && inv.length === 0 && tickets.every((t) => t.n <= 1) && (rows[0].plannedStartAt?.getTime() ?? 0) === (rows[1].plannedStartAt?.getTime() ?? 0), "MAJOR",
        `${u.key}: วางคิววน ∥ จองเดี่ยวห้องคู่ ×5 ∥ M1 เช็กอิน (id+เบอร์) ∥ walk-in ⇒ ไม่ throw · ฐานไม่ล้น · บัตรต่อสมาชิก ≤1 · plannedStartAt กลุ่มเท่ากัน`,
        { codes: codesOf(outs), inv, planned: rows.map((a) => HM(a.plannedStartAt?.getTime())), status: rows.map((a) => a.status), tickets });
    });
    const n = await dlCheck("P3", d0);
    rec("P3-deadlock", n === 0, "MAJOR", "deadlock ระหว่าง P3 = 0", { n });
  }

  // ═══════════ P4 ยกเลิก/เลื่อนทั้งกลุ่ม ∥ เช็กอินสมาชิก ═══════════
  if (want("P4")) {
    console.log("\n── P4: cancelGroup ∥ rescheduleGroup ∥ checkIn (id/เบอร์/QR) ∥ วางคิว ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 6; r++) await step(`P4-${r}`, async () => {
      const u = U[`P4r${r}`];
      const g = await groupOk(u, [{ svc: "VIP", staff: 0 }, { svc: "VIP", staff: 1 }], 840);
      const tok = await LN.checkInToken(u.ctx, g.ids[0]);
      const now = D(at(DS, 830));
      const per: Call[][] = [
        [{ op: "cancelGroup", tag: "cx", a: [u.ctx, g.groupId, now] }, { op: "checkIn", tag: "id1", a: [u.ctx, { appointmentId: g.ids[0] }, "STAFF", now] }],
        [{ op: "resGroup", tag: "rs16", a: [u.ctx, g.groupId, { dateStr: DS, startMin: 960 }, now] }, { op: "checkIn", tag: "ph", a: [u.ctx, { phone: g.phone }, "PHONE", now] }],
        [{ op: "cancelGroup", tag: "cx2", a: [u.ctx, g.groupId, now] }, { op: "checkIn", tag: "id2", a: [u.ctx, { appointmentId: g.ids[1] }, "STAFF", now] }],
        [{ op: "resGroup", tag: "rs15", a: [u.ctx, g.groupId, { dateStr: DS, startMin: 900 }, now] }, { op: "plan", a: [u.ctx, now, 2] }],
        [...(tok ? [{ op: "checkIn", tag: "qr", a: [u.ctx, { token: tok }, "QR", now] }] : []), { op: "resGroup", tag: "rs17", a: [u.ctx, g.groupId, { dateStr: DS, startMin: 1020 }, now] }],
      ];
      if (r >= 3) for (const cs of per) for (const c of cs) if (c.op === "cancelGroup") c.delayMs = 40 + r * 15;
      const order = r % 2 ? per.reverse() : per;
      const outs = await fan(`p4-${r}`, order);
      noteBusy("P4", outs);
      await pump();
      const rows = await apRows(g.ids);
      const st = rows.map((a) => a.status);
      const cancelled = st.filter((s) => s === "CANCELLED").length;
      const live = rows.filter((a) => a.status !== "CANCELLED");
      const issues: string[] = [];
      if (cancelled && cancelled !== rows.length) issues.push(`สถานะผสม ${st.join(",")}`);
      if (new Set(live.map((a) => a.startAt.getTime())).size > 1) issues.push(`เวลาแตก ${live.map((a) => HM(a.startAt.getTime())).join(",")}`);
      for (const a of rows) {
        const tk = await q(`SELECT status::text AS status FROM "QueueTicket" WHERE "refId" = $1`, [a.id]);
        const liveTk = tk.filter((t) => !["CANCELLED", "DONE", "NO_SHOW"].includes(t.status));
        if (liveTk.length > 1) issues.push(`${a.id.slice(-6)} บัตรมีผล ${liveTk.length}`);
        if (a.status === "CANCELLED" && liveTk.length) issues.push(`${a.id.slice(-6)} ยกเลิกแล้วบัตรยังมีผล`);
        if (a.status === "ARRIVED" && !a.queueTicketId) issues.push(`${a.id.slice(-6)} ARRIVED ไม่มีบัตร`);
        const ev = await evCount("booking.cancelled", a.id);
        if (ev !== (a.status === "CANCELLED" ? 1 : 0)) issues.push(`${a.id.slice(-6)} booking.cancelled ${ev}`);
      }
      const inv = await unitInv(u);
      rec(`P4-${r}`, badOf(outs).length === 0 && issues.length === 0 && inv.length === 0, "CRITICAL",
        `${u.key}: ยกเลิกทั้งกลุ่ม ×2 ∥ เลื่อนทั้งกลุ่ม ×3 ∥ เช็กอิน ×4 ⇒ อย่างใดอย่างหนึ่งทั้งกลุ่ม · ไม่มีบัตรค้าง · event ยกเลิก = 1/สมาชิก`,
        { codes: codesOf(outs), status: st, starts: rows.map((a) => HM(a.startAt.getTime())), issues, inv });
    });
    const n = await dlCheck("P4", d0);
    rec("P4-deadlock", n === 0, "MAJOR", "deadlock ระหว่าง P4 = 0", { n });
  }

  // ═══════════ P5 มัดจำกลุ่ม: หมดเวลา ∥ ร้านยืนยัน ∥ สลิป · บางส่วน · เงินเข้าหลังยกเลิก · คืน · ริบ ═══════════
  if (want("P5")) {
    console.log("\n── P5: มัดจำรวม (เงินตรงทุกสตางค์ · GL · ไม่มีจ่ายแล้วถูกปล่อย · ใบรับ/ใบคืนต่อแถวครั้งเดียว) ──");
    const d0 = await readDeadlocks();
    const moneyRec = async (id: string, what: string, m: Money, extra: string[], detail: Record<string, unknown> = {}) => {
      const gl = await jv(m.saleIds);
      const bal = balanced(gl);
      rec(id, m.issues.length === 0 && extra.length === 0 && bal, "CRITICAL", what, { issues: [...m.issues, ...extra], balanced: bal, paid: m.paid, refunded: m.refunded, forfeited: m.forfeited, rows: m.perRow, ...detail });
    };
    // P5a ร้านยืนยันที่หัวกลุ่ม ×5 ∥ หมดเวลา ×5 (ถือช่อง 1 นาที)
    for (let r = 0; r < 3; r++) await step(`P5a-${r}`, async () => {
      const u = U[`P5e${r}`];
      const g = await groupOk(u, pair, 840, "ONLINE");
      const created = (await apRow(g.ids[0])).createdAt.getTime();
      const outs = await fan(`p5a-${r}`, Array.from({ length: 5 }, () => [{ op: "confirm", a: [SHOP, { unitId: u.id, appointmentId: g.ids[0] }] }, { op: "expire", a: [created + 3 * MIN] }]));
      noteBusy("P5a", outs);
      await pump();
      const m = await moneyOf(g.ids);
      const st = new Set(m.rows.map((a) => a.status));
      const extra: string[] = [];
      if (st.size !== 1) extra.push(`สถานะผสม ${[...st].join(",")}`);
      if (st.has("CONFIRMED") && m.paid !== DEP_PAIR) extra.push(`จ่าย ${m.paid} ≠ ${DEP_PAIR}`);
      if (st.has("CANCELLED") && m.paid - m.refunded !== 0 && !m.rows.every((a) => a.cancelReason !== "DEPOSIT_TIMEOUT")) extra.push(`ปล่อยช่องแต่มีเงินค้าง ${m.paid}`);
      if (badOf(outs).length) extra.push(`throw ${J(badOf(outs)[0])}`);
      const okConf = outs.filter((o) => o.op === "confirm" && o.r?.ok).length;
      rec(`P5a-${r}-ok`, !(okConf > 0 && m.rows.some((a) => !a.depositPaidAt)), "MAJOR", `${u.key}: confirmDepositByShop ตอบ ok ⇒ ทุกแถวต้องจ่ายแล้ว (ไม่ใช่ ok ทั้งที่กลุ่มถูกปล่อย/ไม่มีใบรับ — ร้านรับเงินลูกค้าไปแล้ว)`,
        { okConfirms: okConf, rows: m.perRow.map((x) => `${x.st}/${x.why}/rc${x.rc.length}`) });
      await moneyRec(`P5a-${r}`, `${u.key}: confirm หัวกลุ่ม ×5 ∥ expireDepositHolds ×5 ⇒ ทั้งกลุ่มจ่าย (Σ ${DEP_PAIR}) หรือทั้งกลุ่มปล่อย (เงิน 0) · ใบรับต่อแถว ≤1`, m, extra, { codes: codesOf(outs) });
    });
    // P5b สลิปอนุมัติ (consumer ×5) ∥ หมดเวลา ×5 ∥ ร้านยืนยัน ×2
    for (let r = 3; r < 6; r++) await step(`P5b-${r}`, async () => {
      const u = U[`P5e${r}`];
      const g = await groupOk(u, pair, 840, "ONLINE");
      const created = (await apRow(g.ids[0])).createdAt.getTime();
      const tok = await tokenOf(u, g.ids[0]);
      const s = await slipApproved(tok, g.ids[0], { decision: "APPROVE" });
      const per: Call[][] = Array.from({ length: 5 }, (_, k) => [{ op: "consumeEvt", a: [s.evId] }, { op: "expire", a: [created + 3 * MIN] }, ...(k < 2 ? [{ op: "confirm", a: [SHOP, { unitId: u.id, appointmentId: g.ids[0] }] }] : [])]);
      const outs = await fan(`p5b-${r}`, per);
      noteBusy("P5b", outs);
      await pump();
      const m = await moneyOf(g.ids);
      const extra: string[] = [];
      if (s.expected !== DEP_PAIR) extra.push(`สลิป expectedSatang ${s.expected} ≠ ${DEP_PAIR}`);
      if (!m.rows.every((a) => a.status === "CONFIRMED" && a.depositPaidAt)) extra.push(`สถานะ ${m.rows.map((a) => a.status).join(",")}`);
      if (m.paid !== DEP_PAIR || m.rc !== 2) extra.push(`ใบรับ ${m.rc} · Σ ${m.paid} ≠ ${DEP_PAIR}`);
      if (badOf(outs).length) extra.push(`throw ${J(badOf(outs)[0])}`);
      await moneyRec(`P5b-${r}`, `${u.key}: สลิปหัวกลุ่มอนุมัติ ⇒ consumer ×5 ∥ expire ×5 ∥ confirm ×2 ⇒ ทุกแถว CONFIRMED · ใบรับ 2 ใบ Σ ${DEP_PAIR} ตรงสตางค์ · ไม่ถูกปล่อย`, m, extra, { codes: codesOf(outs) });
    });
    // P5c อนุมัติบางส่วน 20,000 (consumer ×3 พร้อมกัน) ⇒ แบ่งตามลำดับ (18,001 + 1,999) · ไม่ยืนยันเอง · ร้านยืนยัน ⇒ ยอมรับยอดที่ได้
    await step("P5c", async () => {
      const u = U.P5p;
      const g = await groupOk(u, pair, 840, "ONLINE");
      const tok = await tokenOf(u, g.ids[0]);
      const s = await slipApproved(tok, g.ids[0], { decision: "APPROVE_PARTIAL", amountSatang: 20_000 });
      const outs = await fan("p5c", Array.from({ length: 3 }, () => [{ op: "consumeEvt", a: [s.evId] }]));
      await pump();
      const m1 = await moneyOf(g.ids);
      const extra: string[] = [];
      if (J(m1.perRow.map((x) => x.rc)) !== J([[18_001], [1_999]])) extra.push(`แบ่ง ${J(m1.perRow.map((x) => x.rc))} ≠ [[18001],[1999]]`);
      if (m1.rows.some((a) => a.status !== "PENDING")) extra.push(`ยืนยันเองทั้งที่จ่ายไม่ครบ ${m1.rows.map((a) => a.status).join(",")}`);
      const c = await DP.confirmDepositByShop(SHOP, { unitId: u.id, appointmentId: g.ids[0] });
      await pump();
      const m2 = await moneyOf(g.ids);
      if (m2.paid !== 20_000 || m2.rc !== 2) extra.push(`หลังร้านยืนยัน ยอด/ใบรับเปลี่ยน Σ ${m2.paid} ใบ ${m2.rc}`);
      rec("P5c-accept", c.ok === true && m2.rows.every((a) => a.status === "CONFIRMED"), "MAJOR", "G6/V21: กลุ่มรับไม่ครบ (UNDERPAID ทุกแถว) ⇒ ร้านกดยืนยันที่หัวกลุ่มต้องยอมรับยอดที่ได้ ⇒ ทุกแถว CONFIRMED (ไม่ใช่ ok เฉย ๆ แล้วค้าง PENDING)",
        { confirm: c.ok ? `OK dup=${c.duplicated ?? false}` : c.code, status: m2.rows.map((a) => a.status) });
      if (badOf(outs).length) extra.push(`throw ${J(badOf(outs)[0])}`);
      await moneyRec("P5c", "อนุมัติสลิปบางส่วน 20,000 ⇒ ใบรับต่อแถวตามลำดับ (18,001/1,999) · ไม่มีแถวยืนยันเอง · ร้านยืนยัน ⇒ CONFIRMED ทุกแถว ยอดไม่เพิ่ม", m2, extra);
    });
    // P5d เงินเข้า (consumer ×3) ∥ ลูกค้ายกเลิกฟรี ×2 ⇒ ค้างคืนทุกแถว · ร้านคืนที่หัวกลุ่ม ×5 ∥ คืนที่สมาชิก ×2 ⇒ คืนครั้งเดียวต่อใบรับ
    await step("P5d", async () => {
      const u = U.P5l;
      const g = await groupOk(u, pair, 840, "ONLINE");
      const tok = await tokenOf(u, g.ids[0]);
      const s = await slipApproved(tok, g.ids[0], { decision: "APPROVE" });
      const outs = await fan("p5d", [[{ op: "consumeEvt", a: [s.evId] }], [{ op: "consumeEvt", a: [s.evId], delayMs: 5 }], [{ op: "consumeEvt", a: [s.evId], delayMs: 15 }],
        [{ op: "cancelOnline", a: [tok, { ip: newIp() }] }], [{ op: "cancelOnline", a: [tok, { ip: newIp() }], delayMs: 8 }]]);
      await pump();
      const m1 = await moneyOf(g.ids);
      const v1 = await GR.groupOf(u.ctx, g.groupId);
      const extra: string[] = [];
      if (!m1.rows.every((a) => a.status === "CANCELLED")) extra.push(`สถานะ ${m1.rows.map((a) => a.status).join(",")}`);
      if (m1.paid !== DEP_PAIR || v1?.deposit?.refundDueSatang !== DEP_PAIR) extra.push(`ก่อนคืน: เงินเข้า ${m1.paid} · ค้างคืน ${v1?.deposit?.refundDueSatang} (ต้อง ${DEP_PAIR})`);
      const outs2 = await fan("p5d-r", [
        ...Array.from({ length: 5 }, () => [{ op: "refund", a: [SHOP, { unitId: u.id, appointmentId: g.ids[0], reason: "ลูกค้ายกเลิก probe" }] }]),
        [{ op: "refund", a: [SHOP, { unitId: u.id, appointmentId: g.ids[1], reason: "ลูกค้ายกเลิก probe" }] }, { op: "refund", a: [SHOP, { unitId: u.id, appointmentId: g.ids[1], reason: "ซ้ำ" }], delayMs: 10 }],
      ]);
      noteBusy("P5d", [...outs, ...outs2]);
      await pump();
      const m2 = await moneyOf(g.ids);
      const gl = await jv(m2.saleIds);
      if (m2.refunded !== DEP_PAIR || m2.refundCount !== 2) extra.push(`คืน Σ ${m2.refunded} · ใบคืน ${m2.refundCount} (ต้อง ${DEP_PAIR} · 2)`);
      if (netCr(gl, (c) => c === "2110") !== 0 || netCr(gl, (c) => c.startsWith("1")) !== 0) extra.push(`GL สุทธิ 2110 ${netCr(gl, (c) => c === "2110")} · เงิน ${netCr(gl, (c) => c.startsWith("1"))}`);
      if (badOf([...outs, ...outs2]).length) extra.push(`throw ${J(badOf([...outs, ...outs2])[0])}`);
      await moneyRec("P5d", `เงินสลิปเข้า ∥ ลูกค้ายกเลิก ⇒ ทุกแถว CANCELLED + ค้างคืน Σ ${DEP_PAIR} · คืน ×7 พร้อมกัน ⇒ ใบคืน 1 ใบ/ใบรับ · Σ คืน ${DEP_PAIR} · GL สุทธิ 0`, m2, extra, { codes: codesOf([...outs, ...outs2]) });
    });
    // P5d2 ลูกค้ายกเลิกก่อน (ฟรี) แล้ว consumer สลิปที่อนุมัติไว้จึงรัน (คิวช้า) ×3 ⇒ เงินเข้าหลังยกเลิกต้องลงใบรับต่อแถว + ค้างคืนครบ
    await step("P5d2", async () => {
      const u = U.P5l;
      const g = await groupOk(u, pair, 1020, "ONLINE");
      const tok = await tokenOf(u, g.ids[0]);
      const s = await slipApproved(tok, g.ids[0], { decision: "APPROVE" });
      const cx = await ON.cancelOnline(tok, { ip: newIp() });
      const outs = await fan("p5d2", Array.from({ length: 3 }, () => [{ op: "consumeEvt", a: [s.evId] }]));
      await pump();
      const m = await moneyOf(g.ids);
      const v = await GR.groupOf(u.ctx, g.groupId);
      const extra: string[] = [];
      if (!cx.ok) extra.push(`cancelOnline ${cx.code}`);
      if (m.paid !== DEP_PAIR || v?.deposit?.refundDueSatang !== DEP_PAIR) extra.push(`เงินเข้า ${m.paid} · ค้างคืน ${v?.deposit?.refundDueSatang} (ต้อง ${DEP_PAIR})`);
      if (J(m.perRow.map((x) => x.rc)) !== J([[DEP_OIL], [DEP_ARO]])) extra.push(`ใบรับต่อแถว ${J(m.perRow.map((x) => x.rc))} ≠ [[${DEP_OIL}],[${DEP_ARO}]]`);
      if (badOf(outs).length) extra.push(`throw ${J(badOf(outs)[0])}`);
      await moneyRec("P5d2", `ยกเลิกก่อนแล้วเงินสลิปเข้า (consumer ×3) ⇒ ใบรับต่อแถว [${DEP_OIL}, ${DEP_ARO}] ครั้งเดียว · ค้างคืน Σ ${DEP_PAIR}`, m, extra, { codes: codesOf(outs) });
    });
    // P5e ยกเลิกช้า (ลิงก์หัวกลุ่ม) ×4 ∥ คำนวณยอด ⇒ ริบ floor ต่อแถว = 21,000 · ค้างคืน 21,002 · คืน ×3 ⇒ ครั้งเดียว
    await step("P5e", async () => {
      const u = U.P5f;
      const g = await groupOk(u, pair, 840, "ONLINE");
      const c = await DP.confirmDepositByShop(SHOP, { unitId: u.id, appointmentId: g.ids[0] });
      if (!c.ok) throw new Error(`confirm ${J(c)}`);
      const tok = await tokenOf(u, g.ids[0]);
      const late = D(at(DS, 780));
      const outs = await fan("p5e", Array.from({ length: 4 }, (_, k) => [{ op: "cancelOnline", a: [tok, { now: late, ip: newIp(), acceptForfeit: true, acceptForfeitSatang: FORFEIT_PAIR }], delayMs: k * 3 }, { op: "quote", a: [u.ctx, g.ids[0]] }]));
      await pump();
      const m1 = await moneyOf(g.ids);
      const extra: string[] = [];
      const okN = outs.filter((o) => o.op === "cancelOnline" && o.r?.ok).length;
      if (okN < 1) extra.push(`ไม่มีทางยกเลิกได้ ${J(codesOf(outs))}`);
      if (m1.forfeited !== FORFEIT_PAIR || J(m1.perRow.map((x) => x.forfeit)) !== J([[9_000], [12_000]])) extra.push(`ริบ ${m1.forfeited} ${J(m1.perRow.map((x) => x.forfeit))} ≠ ${FORFEIT_PAIR} [[9000],[12000]]`);
      const v = await GR.groupOf(u.ctx, g.groupId);
      if (v?.deposit?.refundDueSatang !== DEP_PAIR - FORFEIT_PAIR) extra.push(`ค้างคืน ${v?.deposit?.refundDueSatang} ≠ ${DEP_PAIR - FORFEIT_PAIR}`);
      const outs2 = await fan("p5e-r", Array.from({ length: 3 }, () => [{ op: "refund", a: [SHOP, { unitId: u.id, appointmentId: g.ids[0], reason: "คืนส่วนที่เหลือ probe" }] }]));
      await pump();
      const m2 = await moneyOf(g.ids);
      if (m2.refunded !== DEP_PAIR - FORFEIT_PAIR || m2.refundCount !== 2) extra.push(`คืน ${m2.refunded} · ใบคืน ${m2.refundCount} (ต้อง ${DEP_PAIR - FORFEIT_PAIR} · 2)`);
      if (badOf([...outs, ...outs2]).length) extra.push(`throw ${J(badOf([...outs, ...outs2])[0])}`);
      await moneyRec("P5e", `ยกเลิกช้า ×4 พร้อมกัน ⇒ ยกเลิกครั้งเดียว · ริบต่อแถว 9,000 + 12,000 = ${FORFEIT_PAIR} (ไม่ใช่ 21,001) · คืนที่เหลือ ×3 ⇒ ${DEP_PAIR - FORFEIT_PAIR} ครั้งเดียว`, m2, extra, { codes: codesOf([...outs, ...outs2]) });
    });
    // P5f ไม่มา (NO_SHOW รายคน ×2 ∥ ริบ ×2 ต่อคน) ⇒ ริบ Σ floor = 21,000
    await step("P5f", async () => {
      const u = U.P5n;
      const g = await groupOk(u, pair, 840, "ONLINE");
      const c = await DP.confirmDepositByShop(SHOP, { unitId: u.id, appointmentId: g.ids[0] });
      if (!c.ok) throw new Error(`confirm ${J(c)}`);
      const per: Call[][] = g.ids.flatMap((id: string) => [[{ op: "status", a: [u.tenantId, u.id, id, "NO_SHOW"] }, { op: "forfeitNS", a: [u.tenantId, u.id, id], delayMs: 20 }], [{ op: "status", a: [u.tenantId, u.id, id, "NO_SHOW"] }, { op: "forfeitNS", a: [u.tenantId, u.id, id], delayMs: 40 }]]);
      const outs = await fan("p5f", per);
      await pump();
      const m = await moneyOf(g.ids);
      const extra: string[] = [];
      if (!m.rows.every((a) => a.status === "NO_SHOW")) { info("P5f-state", "ตั้ง NO_SHOW ไม่ได้ (อาจต้องเลยเวลานัด) — ข้ามข้อเงิน", { codes: codesOf(outs), st: m.rows.map((a) => a.status) }); return; }
      if (m.forfeited !== FORFEIT_PAIR) extra.push(`ริบ ${m.forfeited} ≠ ${FORFEIT_PAIR} ${J(m.perRow.map((x) => x.forfeit))}`);
      if (badOf(outs).length) extra.push(`throw ${J(badOf(outs)[0])}`);
      await moneyRec("P5f", `NO_SHOW รายคน ×2 ∥ ริบ ×2 ต่อคน ⇒ บิลริบต่อแถว 1 ใบ · Σ ${FORFEIT_PAIR}`, m, extra, { codes: codesOf(outs) });
    });
    // P5g ยกเลิกช้า (ยังไม่จ่าย) ∥ ร้านยืนยันเงิน ×3 ⇒ ริบ ∈ {0 + ค้างคืนเต็ม, 21,000} · ไม่ริบเงินที่เข้าหลังยกเลิก
    await step("P5g", async () => {
      const u = U.P5g;
      const extra: string[] = []; const view: any[] = [];
      for (let k = 0; k < 3; k++) {
        const g = await groupOk(u, pair, [660, 840, 1020][k], "ONLINE");
        const tok = await tokenOf(u, g.ids[0]);
        const start = minOf((await apRow(g.ids[0])).startAt);
        const outs = await fan(`p5g-${k}`, [[{ op: "cancelOnline", a: [tok, { now: D(at(DS, start - 60)), ip: newIp(), acceptForfeit: true, acceptForfeitSatang: FORFEIT_PAIR }] }],
          ...Array.from({ length: 3 }, (_, j) => [{ op: "confirm", a: [SHOP, { unitId: u.id, appointmentId: g.ids[0] }], delayMs: j * 4 }])]);
        await pump();
        const m = await moneyOf(g.ids);
        const st = m.rows.map((a) => a.status);
        view.push({ codes: codesOf(outs), st, paid: m.paid, forfeited: m.forfeited, refundDue: (await GR.groupOf(u.ctx, g.groupId))?.deposit?.refundDueSatang });
        if (new Set(st).size !== 1) extra.push(`#${k} สถานะผสม ${st.join(",")}`);
        if (![0, FORFEIT_PAIR].includes(m.forfeited)) extra.push(`#${k} ริบ ${m.forfeited}`);
        if (st[0] === "CANCELLED" && m.paid > 0 && m.forfeited === 0 && view[k].refundDue !== m.paid) extra.push(`#${k} เงินเข้าหลังยกเลิกแต่ค้างคืน ${view[k].refundDue} ≠ ${m.paid}`);
        if (st[0] !== "CANCELLED" && m.paid !== DEP_PAIR) extra.push(`#${k} ไม่ยกเลิกแต่จ่าย ${m.paid}`);
        extra.push(...m.issues.map((x) => `#${k} ${x}`));
        if (badOf(outs).length) extra.push(`#${k} throw ${J(badOf(outs)[0])}`);
      }
      rec("P5g", extra.length === 0, "CRITICAL", "ยกเลิกช้าตอนยังไม่จ่าย ∥ ร้านยืนยันเงิน ×3 (3 รอบ) ⇒ ไม่มีสถานะผสม · ริบ 0 หรือ 21,000 · เงินเข้าหลังยกเลิก = ค้างคืนเต็ม", { extra, view });
    });
    // P5h หัวกลุ่มไม่มีมัดจำ (บริการ 60 นาที < minDurationMin 90) · สมาชิกมีมัดจำ 24,001 ⇒ ลิงก์หัวกลุ่มต้องจ่ายได้/ร้านยืนยันที่หัวกลุ่มได้
    await step("P5h", async () => {
      const u = U.P5h;
      const g = await groupOk(u, pair, 840, "ONLINE");
      const rows = await apRows(g.ids);
      const tok = await tokenOf(u, g.ids[0]);
      const p = await DP.loadDepositPay(tok, { ip: newIp() });
      const c = await DP.confirmDepositByShop(SHOP, { unitId: u.id, appointmentId: g.ids[0] });
      await pump();
      const after = await apRows(g.ids);
      const payable = p?.ok === true && p.pay.amountSatang === DEP_ARO && p.pay.state === "AWAITING" && (p.pay.qr !== null || p.pay.noReceiver === true);
      const confirmed = c?.ok === true && after.every((a) => a.status === "CONFIRMED") && after[1].depositPaidAt !== null;
      rec("P5h", payable && confirmed, "MAJOR",
        `กลุ่มผสม [น้ำมัน 60 (มัดจำ 0 เพราะ minDurationMin 90) · อโรมา 90 (${DEP_ARO})] ONLINE ⇒ หน้าจ่ายของหัวกลุ่ม AWAITING ยอด ${DEP_ARO} มี QR · ร้านยืนยันที่หัวกลุ่ม ⇒ ทั้งกลุ่ม CONFIRMED (ไม่งั้นลูกค้าจ่ายไม่ได้ ⇒ ถูกปล่อยทั้งกลุ่ม)`,
        { deposits: rows.map((a) => a.depositSatang), status: rows.map((a) => a.status), pay: p?.ok ? { state: p.pay.state, amount: p.pay.amountSatang, qr: p.pay.qr !== null } : p, confirm: c?.ok ? "OK" : `${c?.code} ${c?.reason}`, after: after.map((a) => [a.status, !!a.depositPaidAt]) });
    });
    // P5i ร้านกดยืนยันที่สมาชิก (ไม่ใช่หัวกลุ่ม) ⇒ สถานะ/ช่วงถือของกลุ่ม
    await step("P5i", async () => {
      const u = U.P5i;
      const g = await groupOk(u, pair, 840, "ONLINE");
      const c = await DP.confirmDepositByShop(SHOP, { unitId: u.id, appointmentId: g.ids[1] });
      await pump();
      const r1 = await apRows(g.ids);
      const mixed = new Set(r1.map((a) => a.status)).size > 1;
      const c2 = await DP.confirmDepositByShop(SHOP, { unitId: u.id, appointmentId: g.ids[0] });
      await pump();
      const m = await moneyOf(g.ids);
      const extra: string[] = [];
      if (!c2.ok || m.paid !== DEP_PAIR || m.rc !== 2 || m.rows.some((a) => a.status !== "CONFIRMED")) extra.push(`หลังยืนยันหัวกลุ่ม ${c2.ok ? "OK" : c2.code} Σ ${m.paid} ใบ ${m.rc} ${m.rows.map((a) => a.status).join(",")}`);
      await moneyRec("P5i", `ยืนยันที่สมาชิกก่อน แล้วที่หัวกลุ่ม ⇒ ใบรับต่อแถว 1 · Σ ${DEP_PAIR} · ทุกแถว CONFIRMED`, m, extra);
      rec("P5i-mixed", !mixed, "MINOR", "ร้านกดยืนยันมัดจำที่แถวสมาชิก (ไม่ใช่หัวกลุ่ม) ⇒ ไม่ควรเหลือกลุ่มสถานะผสม (สมาชิก CONFIRMED · หัวกลุ่ม PENDING ค้างจ่าย = ไม่หมดเวลาเพราะสมาชิกจ่ายแล้ว)",
        { first: c.ok ? "OK" : c.code, statusAfterMemberConfirm: r1.map((a) => [a.status, !!a.depositPaidAt]) });
    });
    const n = await dlCheck("P5", d0);
    rec("P5-deadlock", n === 0, "MAJOR", "deadlock ระหว่าง P5 = 0", { n });
  }

  // ═══════════ P6 ยิงซ้ำ idempotencyKey เดียว ×10 ═══════════
  if (want("P6")) {
    console.log("\n── P6: idempotencyKey เดียว ×10 (bookGroup / bookAppointment staffCount 2) ──");
    const d0 = await readDeadlocks();
    const u = U.P6;
    await step("P6-group", async () => {
      const i = gin(u, [{ svc: "VIP", staff: null }, { svc: "VIP90", staff: 3 }], 840, "ONLINE");
      const outs = await fan("p6g", Array.from({ length: 5 }, () => [{ op: "group", a: [u.ctx, i] }, { op: "group", a: [u.ctx, i], delayMs: 7 }]));
      const gids = new Set(outs.filter((o) => o.r?.ok).map((o) => o.r.groupId));
      const idsSet = new Set(outs.filter((o) => o.r?.ok).map((o) => J(o.r.ids)));
      const rows = await q(`SELECT id, "groupId", "idempotencyKey" FROM "Appointment" WHERE "tenantId" = $1 AND ("idempotencyKey" = $2 OR "idempotencyKey" LIKE $3)`, [u.tenantId, i.idempotencyKey, `${i.idempotencyKey}#%`]);
      rec("P6-group", badOf(outs).length === 0 && outs.every((o) => o.r?.ok) && gids.size === 1 && idsSet.size === 1 && rows.length === 2, "CRITICAL",
        "bookGroup key เดียว ×10 (5 โพรเซส) ⇒ ok ทุกทาง · groupId/ids เดียว · ฐาน 2 แถว (key, key#2)", { codes: codesOf(outs), groups: gids.size, rows: rows.length });
    });
    await step("P6-staffCount", async () => {
      const i = bkIn(u, "CPL", null, 960, "ONLINE");
      const outs = await fan("p6s", Array.from({ length: 5 }, () => [{ op: "book", a: [u.ctx, i] }, { op: "book", a: [u.ctx, i], delayMs: 7 }]));
      const gids = new Set(outs.filter((o) => o.r?.ok).map((o) => o.r.groupId));
      const leads = new Set(outs.filter((o) => o.r?.ok).map((o) => o.r.id));
      const rows = await q(`SELECT id FROM "Appointment" WHERE "tenantId" = $1 AND ("idempotencyKey" = $2 OR "idempotencyKey" LIKE $3)`, [u.tenantId, i.idempotencyKey, `${i.idempotencyKey}#%`]);
      rec("P6-staffCount", badOf(outs).length === 0 && outs.every((o) => o.r?.ok) && gids.size === 1 && leads.size === 1 && rows.length === 2, "CRITICAL",
        "bookAppointment คู่รัก (staffCount 2) key เดียว ×10 ⇒ ok ทุกทาง · groupId/หัวกลุ่มเดียว · 2 แถว", { codes: codesOf(outs), groups: [...gids], rows: rows.length });
    });
    await step("P6-mixed", async () => {
      const base = gin(u, [{ svc: "VIP", staff: 5 }, { svc: "VIP", staff: 6 }], 1080);
      const outs = await fan("p6m", Array.from({ length: 5 }, (_, k) => [{ op: "group", a: [u.ctx, k % 2 ? { ...base, startMin: 1140 } : base] }, { op: "group", a: [u.ctx, k === 4 ? { ...base, members: [...base.members].reverse() } : base], delayMs: 5 }]));
      const rows = await q(`SELECT id, "groupId", "startAt" FROM "Appointment" WHERE "tenantId" = $1 AND ("idempotencyKey" = $2 OR "idempotencyKey" LIKE $3)`, [u.tenantId, base.idempotencyKey, `${base.idempotencyKey}#%`]);
      const gids = new Set(outs.filter((o) => o.r?.ok).map((o) => o.r.groupId));
      rec("P6-mixed", badOf(outs).length === 0 && rows.length === 2 && gids.size <= 1 && offContract(outs.filter((o) => o.r?.code !== "BAD_INPUT")).length === 0, "MAJOR",
        "key เดียวแต่ข้อมูลต่าง (เวลา/ลำดับสมาชิก) ×10 พร้อมกัน ⇒ กลุ่มเดียว 2 แถว · ที่ต่างได้ BAD_INPUT ไม่ throw", { codes: codesOf(outs), rows: rows.length, groups: gids.size });
    });
    await step("P6-collide", async () => {
      const k = rid("ck");
      const s = await BK.bookAppointment(u.ctx, bkIn(u, "PLAIN", 9, 600, "STAFF", { idempotencyKey: `${k}#2` }));
      let r: any; let threw = "";
      try { r = await GR.bookGroup(u.ctx, gin(u, [{ svc: "PLAIN", staff: 10 }, { svc: "PLAIN", staff: 11 }], 600, "STAFF", { idempotencyKey: k })); } catch (e) { threw = errMsg(e); }
      rec("P6-collide", s.ok && !threw, "MINOR", "คีย์ชนกับแถวเดี่ยวที่ใช้ `<key>#2` อยู่แล้ว ⇒ bookGroup ต้องไม่ throw ออกจาก facade (P2002) — คืนรหัสไม่สำเร็จ/สำเร็จก็ได้", { single: s.ok ? "OK" : s.code, group: threw ? `THREW ${threw}` : r?.ok ? "OK" : r?.code });
    });
    const n = await dlCheck("P6", d0);
    rec("P6-deadlock", n === 0, "MAJOR", "deadlock ระหว่าง P6 = 0", { n });
  }

  // ═══════════ P7 ข้ามร้าน/ข้ามหน่วย ⇒ NOT_FOUND เหมือน id สุ่ม ═══════════
  if (want("P7")) {
    console.log("\n── P7: ข้ามร้าน/ข้ามหน่วย ⇒ คำตอบเดียวกับ id ที่ไม่มีอยู่ · ไม่มีแถวใดเปลี่ยน ──");
    await step("P7", async () => {
      const a = U.P7a, a2 = U.P7a2, b = U.P7b;
      const g = await groupOk(a, [{ svc: "VIP", staff: 0 }, { svc: "VIP", staff: 1 }], 840, "ONLINE");
      const snap = J((await apRows(g.ids)).map((x) => [x.status, x.startAt, x.staffId, x.resourceId, x.depositPaidAt, x.plannedStartAt]));
      const fake = `grp_${randomBytes(16).toString("hex")}`;
      const fakeId = `c${randomBytes(12).toString("hex")}`;
      const shopB = { tenantId: ids.tB, actorUserId: ids.owner };
      const norm = (x: any) => J(x && typeof x === "object" ? { ok: x.ok, code: x.code ?? null, reason: x.reason ?? null } : x);
      const pairs: [string, () => Promise<any>, () => Promise<any>][] = [];
      for (const [label, ctx, shop] of [["ร้าน B", b.ctx, shopB], ["หน่วย A2", a2.ctx, SHOP]] as const) {
        pairs.push([`${label} groupOf`, () => GR.groupOf(ctx, g.groupId), () => GR.groupOf(ctx, fake)]);
        pairs.push([`${label} groupOf(id)`, () => GR.groupOf(ctx, g.ids[1]), () => GR.groupOf(ctx, fakeId)]);
        pairs.push([`${label} cancelGroup`, () => GR.cancelGroup(ctx, g.groupId), () => GR.cancelGroup(ctx, fake)]);
        pairs.push([`${label} rescheduleGroup`, () => GR.rescheduleGroup(ctx, g.groupId, { dateStr: DS, startMin: 960 }), () => GR.rescheduleGroup(ctx, fake, { dateStr: DS, startMin: 960 })]);
        pairs.push([`${label} confirmDeposit`, () => DP.confirmDepositByShop(shop, { unitId: ctx.unitId, appointmentId: g.ids[0] }), () => DP.confirmDepositByShop(shop, { unitId: ctx.unitId, appointmentId: fakeId })]);
        pairs.push([`${label} refundDeposit`, () => DP.refundDepositByShop(shop, { unitId: ctx.unitId, appointmentId: g.ids[0], reason: "x" }), () => DP.refundDepositByShop(shop, { unitId: ctx.unitId, appointmentId: fakeId, reason: "x" })]);
        pairs.push([`${label} checkIn`, () => LN.checkIn(ctx, { appointmentId: g.ids[0] }, { via: "STAFF", now: at(DS, 835) }), () => LN.checkIn(ctx, { appointmentId: fakeId }, { via: "STAFF", now: at(DS, 835) })]);
        pairs.push([`${label} rescheduleByShop`, () => LN.rescheduleByShop(ctx, g.ids[1], { dateStr: DS, startMin: 960 }), () => LN.rescheduleByShop(ctx, fakeId, { dateStr: DS, startMin: 960 })]);
        pairs.push([`${label} cancelByShop`, () => LN.cancelByShop(ctx, g.ids[1]), () => LN.cancelByShop(ctx, fakeId)]);
        pairs.push([`${label} rescheduleBySelf`, () => BK.rescheduleBySelf(ctx, g.ids[0], { dateStr: DS, startMin: 960, staffId: null }), () => BK.rescheduleBySelf(ctx, fakeId, { dateStr: DS, startMin: 960, staffId: null })]);
        pairs.push([`${label} lateForfeitSatangOf`, () => ON.lateForfeitSatangOf(ctx, g.ids[0]), () => ON.lateForfeitSatangOf(ctx, fakeId)]);
      }
      const diff: string[] = []; const view: string[] = [];
      for (const [label, f1, f2] of pairs) {
        let x: any, y: any;
        try { x = await f1(); } catch (e) { x = `THREW ${errMsg(e)}`; }
        try { y = await f2(); } catch (e) { y = `THREW ${errMsg(e)}`; }
        view.push(`${label}: ${norm(x).slice(0, 80)}`);
        if (norm(x) !== norm(y) || (x && typeof x === "object" && x.ok === true)) diff.push(`${label}: จริง ${norm(x).slice(0, 120)} ≠ สุ่ม ${norm(y).slice(0, 120)}`);
      }
      const after = J((await apRows(g.ids)).map((x) => [x.status, x.startAt, x.staffId, x.resourceId, x.depositPaidAt, x.plannedStartAt]));
      // จองกลุ่มด้วยบริการ/หมอของหน่วยอื่น
      const nfSvc = await GR.bookGroup(a2.ctx, gin(a, [{ svc: "VIP", staff: null }, { svc: "VIP", staff: null }], 900));
      const nfStf = await GR.bookGroup(a2.ctx, { ...gin(a2, [{ svc: "VIP", staff: null }, { svc: "VIP", staff: null }], 900), members: [{ serviceId: a2.svc.VIP, staffId: a.staff[2] }, { serviceId: a2.svc.VIP, staffId: null }] });
      const nfB = await GR.bookGroup(b.ctx, { ...gin(b, [{ svc: "VIP", staff: 0 }, { svc: "VIP", staff: null }], 900), members: [{ serviceId: b.svc.VIP, staffId: b.staff[0] }, { serviceId: a.svc.VIP, staffId: null }] });
      const leaked = await q(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = ANY($1::text[]) AND "startAt" = $2`, [[a2.id, b.id], at(DS, 900)]);
      const cross = await q(`SELECT "groupId" FROM "Appointment" WHERE "tenantId" = ANY($1::text[]) AND "groupId" IS NOT NULL GROUP BY "groupId" HAVING count(DISTINCT "unitId") > 1 OR count(DISTINCT "tenantId") > 1`, [TIDS]);
      rec("P7", diff.length === 0 && after === snap && nfSvc.code === "NOT_FOUND" && nfStf.code === "NOT_FOUND" && nfB.code === "NOT_FOUND" && leaked[0].n === 0 && cross.length === 0, "CRITICAL",
        "X1: ทุกทาง (groupOf · cancel/reschedule กลุ่ม · มัดจำ ยืนยัน/คืน · เช็กอิน · เลื่อน/ยกเลิกรายคน · ลูกค้าเลื่อน · ยอดริบ) ด้วย id ร้าน/หน่วยอื่น ⇒ คำตอบเดียวกับ id สุ่ม · แถวไม่เปลี่ยน · จองกลุ่มด้วยบริการ/หมอหน่วยอื่น ⇒ NOT_FOUND · ไม่มี groupId ข้ามหน่วย",
        { diff, unchanged: after === snap, nf: [nfSvc.code, nfStf.code, nfB.code], leaked: leaked[0].n, cross: cross.length, sample: view.slice(0, 4) });
    });
  }

  // ═══════════ P10 ยกเลิกทั้งกลุ่ม ∥ ลิงก์หัวกลุ่ม ∥ ร้านยกเลิกรายคน · เลื่อน ∥ ยกเลิก ═══════════
  if (want("P10")) {
    console.log("\n── P10: cancelGroup ×5 ∥ cancelOnline ×3 ∥ cancelByShop สมาชิก ×2 · rescheduleGroup ∥ cancelGroup ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 3; r++) await step(`P10-${r}`, async () => {
      const u = U[`P10r${r}`];
      const g = await groupOk(u, [{ svc: "VIP", staff: 0 }, { svc: "VIP", staff: 1 }], 840, "ONLINE");
      const tok = await tokenOf(u, g.ids[0]);
      const per: Call[][] = [
        [{ op: "cancelGroup", a: [u.ctx, g.groupId] }, { op: "cancelOnline", a: [tok, { ip: newIp() }] }],
        [{ op: "cancelGroup", a: [u.ctx, g.groupId] }, { op: "cancelShop", a: [u.ctx, g.ids[1]] }],
        [{ op: "cancelGroup", a: [u.ctx, g.groupId] }, { op: "cancelOnline", a: [tok, { ip: newIp() }] }],
        [{ op: "cancelGroup", a: [u.ctx, g.groupId] }, { op: "cancelShop", a: [u.ctx, g.ids[1]] }],
        [{ op: "cancelGroup", a: [u.ctx, g.groupId] }, { op: "cancelOnline", a: [tok, { ip: newIp() }] }],
      ];
      const outs = await fan(`p10-${r}`, per);
      noteBusy("P10", outs);
      const rows = await apRows(g.ids);
      const ev = await Promise.all(g.ids.map((id: string) => evCount("booking.cancelled", id)));
      rec(`P10-${r}`, badOf(outs).length === 0 && rows.every((a) => a.status === "CANCELLED") && J(ev) === "[1,1]" && outs.some((o) => o.op === "cancelGroup" && o.r?.ok), "CRITICAL",
        `${u.key}: ยกเลิก 3 ทางพร้อมกัน 10 คำขอ ⇒ ทุกสมาชิก CANCELLED · booking.cancelled ต่อสมาชิก 1 · ไม่ throw`, { codes: codesOf(outs), status: rows.map((a) => `${a.status}/${a.cancelReason}`), ev });
    });
    for (let r = 0; r < 3; r++) await step(`P10x-${r}`, async () => {
      const u = U[`P10x${r}`];
      const g = await groupOk(u, [{ svc: "VIP", staff: 0 }, { svc: "VIP", staff: 1 }], 840);
      const per: Call[][] = Array.from({ length: 5 }, (_, k) => [k % 2 ? { op: "cancelGroup", a: [u.ctx, g.groupId] } : { op: "resGroup", a: [u.ctx, g.groupId, { dateStr: DS, startMin: 960 + k * 30 }] },
        k % 2 ? { op: "resGroup", a: [u.ctx, g.groupId, { dateStr: DS, startMin: 1080 }] } : { op: "cancelGroup", a: [u.ctx, g.groupId], delayMs: 3 }]);
      const outs = await fan(`p10x-${r}`, per);
      const rows = await apRows(g.ids);
      const st = new Set(rows.map((a) => a.status));
      const starts = new Set(rows.map((a) => a.startAt.getTime()));
      const inv = await unitInv(u);
      rec(`P10x-${r}`, badOf(outs).length === 0 && st.size === 1 && starts.size === 1 && inv.length === 0, "CRITICAL",
        `${u.key}: เลื่อนทั้งกลุ่ม ×5 ∥ ยกเลิกทั้งกลุ่ม ×5 ⇒ อย่างใดอย่างหนึ่งทั้งกลุ่ม (สถานะ/เวลาไม่แตก)`, { codes: codesOf(outs), status: [...st], starts: [...starts].map(HM), inv });
    });
    const n = await dlCheck("P10", d0);
    rec("P10-deadlock", n === 0, "MAJOR", "deadlock ระหว่าง P10 = 0", { n });
  }

  // ═══════════ P11 เช็กอินเบอร์ (ทั้งกลุ่ม) ∥ วางคิววน ∥ เช็กอินจอร้านรายคน/QR ═══════════
  if (want("P11")) {
    console.log("\n── P11: checkIn เบอร์ (ทั้งกลุ่ม) ∥ runPlanner วน ∥ checkIn id/QR รายคน ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 3; r++) await step(`P11-${r}`, async () => {
      const u = U[`P11r${r}`];
      const g = await groupOk(u, [{ svc: "VIP", staff: 0 }, { svc: "VIP90", staff: 1 }, { svc: "PLAIN", staff: 2 }], 840);
      await bookOk(u, "VIP", 3, 720);
      await bookOk(u, "PLAIN", 4, 840);
      const tok = await LN.checkInToken(u.ctx, g.ids[2]);
      const now = D(at(DS, 832));
      const per: Call[][] = [
        [{ op: "checkIn", tag: "ph", a: [u.ctx, { phone: g.phone }, "PHONE", now] }, { op: "plan", a: [u.ctx, now, 4] }],
        [{ op: "checkIn", tag: "ph2", a: [u.ctx, { phone: g.phone }, "PHONE", now] }, { op: "checkIn", tag: "id0", a: [u.ctx, { appointmentId: g.ids[0] }, "STAFF", now] }],
        [{ op: "checkIn", tag: "id1", a: [u.ctx, { appointmentId: g.ids[1] }, "STAFF", now] }, { op: "plan", a: [u.ctx, now, 4] }],
        [...(tok ? [{ op: "checkIn", tag: "qr", a: [u.ctx, { token: tok }, "QR", now] }] : []), { op: "checkIn", tag: "id2", a: [u.ctx, { appointmentId: g.ids[2] }, "STAFF", now] }],
        [{ op: "plan", a: [u.ctx, now, 4] }, { op: "checkIn", tag: "id0b", a: [u.ctx, { appointmentId: g.ids[0] }, "STAFF", now] }],
      ];
      const outs = await fan(`p11-${r}`, per);
      noteBusy("P11", outs);
      const rows = await apRows(g.ids);
      const tk = await q(`SELECT "refId", count(*)::int AS n FROM "QueueTicket" WHERE "refId" = ANY($1::text[]) GROUP BY "refId"`, [g.ids]);
      const issues: string[] = [];
      for (const a of rows) {
        const n = tk.find((t) => t.refId === a.id)?.n ?? 0;
        if (a.status !== "ARRIVED") issues.push(`${a.id.slice(-6)} ${a.status}`);
        if (n !== 1) issues.push(`${a.id.slice(-6)} บัตร ${n}`);
        const ev = await evCount("booking.checked_in", a.id);
        if (ev !== 1) issues.push(`${a.id.slice(-6)} checked_in ${ev}`);
      }
      const phAmb = outs.filter((o) => o.tag?.startsWith("ph") && o.r?.code === "AMBIGUOUS").length;
      if (phAmb) issues.push(`เช็กอินเบอร์ได้ AMBIGUOUS ${phAmb}`);
      const inv = await unitInv(u);
      rec(`P11-${r}`, badOf(outs).length === 0 && issues.length === 0 && inv.length === 0, "MAJOR",
        `${u.key}: กลุ่ม 3 คน · เช็กอินเบอร์ ×2 ∥ id ×4 ∥ QR ∥ วางคิว ×12 ⇒ ทุกสมาชิก ARRIVED บัตรละ 1 · event checked_in 1/คน · ไม่ throw`, { codes: codesOf(outs), issues, inv });
    });
    const n = await dlCheck("P11", d0);
    rec("P11-deadlock", n === 0, "MAJOR", "deadlock ระหว่าง P11 (multi-row lock ของกลุ่ม ∥ planner เขียนแถว) = 0", { n });
  }

  // ═══════════ P8 PDPA ═══════════
  if (want("P8")) {
    console.log("\n── P8: PDPA payload outbox/audit ──");
    await step("P8", async () => {
      await pump();
      const rows = await q(`SELECT type, payload::text AS p FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[])`, [TIDS]);
      const leak = rows.filter((r) => NAMES.some((n) => r.p.includes(n)) || PHONES.some((p) => r.p.includes(p) || r.p.includes(p.slice(1))));
      const grp = rows.filter((r) => r.p.includes("grp_")).length;
      rec("P8-outbox", rows.length > 0 && leak.length === 0 && grp > 0, "MAJOR", "X8: payload outbox ของร้านทดสอบทุกแถวไม่มีชื่อ/เบอร์ลูกค้า (มี event ของกลุ่ม)", { events: rows.length, groupEvents: grp, leak: leak.slice(0, 3).map((x) => `${x.type} ${x.p.slice(0, 160)}`) });
      const au = await q(`SELECT action, COALESCE(after::text, '') || COALESCE(before::text, '') AS p FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND action LIKE 'booking.%'`, [TIDS]);
      const leak2 = au.filter((r) => NAMES.some((n) => r.p.includes(n)) || PHONES.some((p) => r.p.includes(p)));
      if (leak2.length) info("P8-audit", "audit booking.* มีชื่อ/เบอร์ (ไม่ใช่ payload outbox — ข้อมูล)", leak2.slice(0, 3).map((x) => x.action));
      else rec("P8-audit", true, "INFO", "audit booking.* ไม่มีชื่อ/เบอร์", { n: au.length });
    });
  }

  // ═══════════ P9 fuzz ตัววางคิว + กลุ่ม (ผสมบริการ/เวลางานสั้น/ลากยาว/มาไม่ครบ) ═══════════
  if (want("P9")) {
    console.log("\n── P9: fuzz planDay + groupId ──");
    await step("P9", async () => {
      const N = Math.max(100, Number(process.env.PROBE_B15_FUZZ_N ?? 20000) || 20000);
      const DAY0 = Date.UTC(2026, 10, 7) - 7 * 3_600_000;
      const TT = (h: number, m = 0) => DAY0 + (h * 60 + m) * MIN;
      const mul = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const fails: Record<string, string[]> = { sync: [], cap: [], staff: [], window: [], early: [], past: [], det: [], block: [] };
      const ts: number[] = [];
      for (let k = 0; k < N; k++) {
        const r = mul(77_777 + k * 7919);
        const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
        const pick = <V,>(xs: readonly V[]): V => xs[Math.floor(r() * xs.length)];
        const now = TT(11);
        const staffN = ri(3, 8);
        const services = [
          { id: "cpl", name: "cpl", durationMin: 60, bufferAfterMin: pick([0, 0, 10]), resourceKinds: ["COUPLE_ROOM"] },
          { id: "cpl90", name: "cpl90", durationMin: 90, bufferAfterMin: 0, resourceKinds: ["COUPLE_ROOM"] },
          { id: "room", name: "room", durationMin: 60, bufferAfterMin: 0, resourceKinds: ["ROOM"] },
          { id: "plain", name: "plain", durationMin: 45, bufferAfterMin: 0 },
        ];
        const staff = Array.from({ length: staffN }, (_, i) => ({
          id: `s${i}`, name: `s${i}`, sortOrder: ri(1, 4), windows: [{ startAt: TT(pick([9, 10, 10])), endAt: TT(pick([13, 14, 15, 17, 21, 21])) }],
          services: r() < 0.3 ? services.map((s) => ({ serviceId: s.id, durationMin: s.durationMin + pick([0, 15, 30]) })) : null,
        }));
        const resources = [
          ...Array.from({ length: ri(1, 2) }, (_, i) => ({ id: `cr${i}`, kind: "COUPLE_ROOM", name: `cr${i}`, sortOrder: ri(1, 3), capacity: pick([2, 2, 3]), cleanupMin: pick([0, 10, 15]), blocks: r() < 0.15 ? [{ startAt: TT(ri(12, 18)), endAt: TT(ri(12, 18)) + 60 * MIN }] : [] })),
          ...Array.from({ length: ri(0, 2) }, (_, i) => ({ id: `rm${i}`, kind: "ROOM", name: `rm${i}`, sortOrder: ri(1, 3), capacity: 1, cleanupMin: pick([0, 15]), blocks: [] })),
        ];
        const durOf = (s: any, svc: string) => (s.services?.find((x: any) => x.serviceId === svc)?.durationMin ?? services.find((x) => x.id === svc)!.durationMin);
        const busy = new Map<string, { s: number; e: number }[]>(staff.map((s) => [s.id, []]));
        const used = new Map<string, { s: number; e: number }[]>(resources.map((x) => [x.id, []]));
        const ovl = (a: { s: number; e: number }, b: { s: number; e: number }) => a.s < b.e && b.s < a.e;
        const capOk = (cap: number, xs: { s: number; e: number }[]) => xs.every((x) => xs.filter((y) => y.s <= x.s && y.e > x.s).length <= cap);
        const jobs: any[] = [];
        let n = 0;
        for (const s of staff) if (r() < 0.4) {
          const st = now - ri(10, 90) * MIN; const dur = ri(30, 160);
          jobs.push({ id: `I${n++}`, label: "i", kind: "BOOKED", status: "IN_SERVICE", serviceId: "plain", durationMin: dur, assignMode: "SPECIFIC", staffId: s.id, startAt: st, issuedAt: now - 86_400_000, checkedInAt: st, startedAt: st, priority: false });
          busy.get(s.id)!.push({ s: st, e: st + dur * MIN });
        }
        const book = (m: number, gid: string | undefined) => {
          const t = now + ri(-3, 28) * 15 * MIN;
          const svcs = Array.from({ length: m }, () => pick(["cpl", "cpl", "cpl90", "plain", "room"]));
          const kindsN = new Set(svcs.map((x) => services.find((y) => y.id === x)!.resourceKinds?.[0]).filter(Boolean));
          if (gid && kindsN.size > 1) return;
          const free = [...staff].sort(() => r() - 0.5).filter((s) => s.windows.some((w) => w.startAt <= t)).slice(0, staffN);
          const picked: any[] = [];
          for (const sv of svcs) {
            const s = free.find((x) => !picked.includes(x) && x.windows.some((w) => w.startAt <= t && t + durOf(x, sv) * MIN <= w.endAt) && busy.get(x.id)!.every((b) => !ovl(b, { s: t, e: t + durOf(x, sv) * MIN })));
            if (!s) return;
            picked.push(s);
          }
          const kind = [...kindsN][0] as string | undefined;
          let room: any = null;
          if (kind) {
            room = resources.filter((x) => x.kind === kind).find((x) => capOk(x.capacity, [...used.get(x.id)!, ...svcs.map((sv, i) => sv === "plain" ? null : { s: t, e: t + (durOf(picked[i], sv) + x.cleanupMin) * MIN }).filter((y): y is { s: number; e: number } => !!y)]));
            if (!room) return;
          }
          svcs.forEach((sv, i) => {
            const s = picked[i]; const d = durOf(s, sv);
            busy.get(s.id)!.push({ s: t, e: t + d * MIN });
            const usesRoom = sv !== "plain" && room;
            if (usesRoom) used.get(room.id)!.push({ s: t, e: t + (d + room.cleanupMin) * MIN });
            const roll = r();
            const status = t <= now + 20 * MIN && roll < 0.35 ? "ARRIVED" : roll < 0.45 && t < now ? "LATE" : "CONFIRMED";
            jobs.push({ id: `B${n++}`, label: "b", kind: "BOOKED", status, serviceId: sv, assignMode: r() < 0.25 ? "ANY" : "SPECIFIC", staffId: s.id, startAt: t, issuedAt: now - 86_400_000,
              checkedInAt: status === "ARRIVED" ? Math.min(now, t) - ri(0, 10) * MIN : null, startedAt: null, priority: false, ...(usesRoom ? { resourceIds: [room.id] } : {}), ...(gid ? { groupId: gid } : {}) });
          });
        };
        for (let g = ri(1, 6); g > 0; g--) book(pick([2, 2, 3]), `G${g}`);
        for (let s = ri(0, 5); s > 0; s--) book(1, undefined);
        for (let w = ri(0, 4); w > 0; w--) jobs.push({ id: `W${n++}`, label: "w", kind: "WALKIN", status: "QUEUED", serviceId: pick(["plain", "cpl", "room"]), assignMode: "ANY", staffId: null, startAt: null, issuedAt: now - ri(0, 40) * MIN, checkedInAt: now - ri(0, 40) * MIN, startedAt: null, priority: false });
        const settings = { queueOrder: pick(["SINGLE_LINE", "APPOINTMENT_FIRST"]), backfill: r() < 0.7, safetyBeforeBookingMin: 0, graceMin: 15, noShowAfterMin: 30, lateAction: pick(["RELEASE", "HOLD"]), priorityEnabled: false, walkInMaxWaitMin: 600, overrunExtendMin: 5, minBreakMin: 0, maxJobsPerDay: null };
        const input = { now, settings, staff, services, jobs: jobs.sort(() => r() - 0.5), resources };
        const t0 = performance.now();
        const p = PL.planDay(input);
        ts.push(performance.now() - t0);
        const src = new Map(jobs.map((j) => [j.id, j]));
        const by = new Map<string, any[]>();
        for (const j of p.jobs) { const s = src.get(j.jobId); if (s?.groupId && s.kind === "BOOKED" && s.status !== "IN_SERVICE") by.set(s.groupId, [...(by.get(s.groupId) ?? []), j]); }
        for (const [g, xs] of by) {
          const sch = xs.filter((x) => x.state === "SCHEDULED" && x.reason !== "LATE_ARRIVAL_AS_WALKIN" && x.reason !== "STAFF_UNAVAILABLE" && !x.resourceShort);
          if (sch.length > 1 && new Set(sch.map((x) => x.startAt)).size > 1) fails.sync.push(`#${k} ${g} ${sch.map((x) => `${x.jobId}@${HM(x.startAt)}`).join(",")}`);
          const early = sch.filter((x) => x.startAt < src.get(x.jobId).startAt);
          const allArrived = xs.filter((x) => x.state === "SCHEDULED").every((x) => { const s = src.get(x.jobId); return s.status === "ARRIVED" || s.checkedInAt !== null; });
          if (early.length && !allArrived) fails.early.push(`#${k} ${g} ${early.map((x) => `${x.jobId}@${HM(x.startAt)}<${HM(src.get(x.jobId).startAt)}`).join(",")}`);
        }
        const occ = new Map<string, { s: number; e: number; j: string }[]>();
        for (const j of p.jobs) {
          if (!(j.state === "SCHEDULED" || j.state === "IN_SERVICE") || j.startAt == null || j.endAt == null) continue;
          if (j.state === "SCHEDULED" && j.startAt < now - 1) fails.past.push(`#${k} ${j.jobId}@${HM(j.startAt)}`);
          if (j.resourceShort) continue;
          for (const id of j.resourceIds ?? []) { const rr = resources.find((x) => x.id === id); if (rr) occ.set(id, [...(occ.get(id) ?? []), { s: j.startAt, e: j.endAt + rr.cleanupMin * MIN, j: j.jobId }]); }
        }
        for (const [id, xs] of occ) {
          const rr = resources.find((x) => x.id === id)!;
          for (const x of xs) if (xs.filter((u) => u.s <= x.s && u.e > x.s).length > rr.capacity) { fails.cap.push(`#${k} ${id} @${HM(x.s)}`); break; }
          for (const x of xs) if (src.get(x.j)?.status !== "IN_SERVICE" && rr.blocks.some((b) => x.s < b.endAt && b.startAt < x.e - rr.cleanupMin * MIN)) { fails.block.push(`#${k} ${id} ${x.j}@${HM(x.s)}`); break; }
        }
        const bs = new Map<string, any[]>();
        for (const j of p.jobs) if ((j.state === "SCHEDULED" || j.state === "IN_SERVICE") && j.staffId && j.reason !== "STAFF_UNAVAILABLE") bs.set(j.staffId, [...(bs.get(j.staffId) ?? []), j]);
        for (const [s, xs] of bs) { xs.sort((a, b) => a.startAt - b.startAt); for (let i = 1; i < xs.length; i++) if (xs[i].startAt < xs[i - 1].endAt) { fails.staff.push(`#${k} ${s} ${xs[i - 1].jobId}/${xs[i].jobId}`); break; } }
        // หน้าต่างหมอ: สมาชิกกลุ่มที่ถูกดันพร้อมกลุ่มจนจบเลยเวลางานหมอ ทั้งที่แผนไม่มีกลุ่มจบทัน ⇒ ต้องมีสัญญาณ (resourceShort) ไม่งั้นจอไม่เห็น
        let p0: any = null;
        for (const j of p.jobs) {
          const s = src.get(j.jobId);
          if (!s?.groupId || s.kind !== "BOOKED" || j.state !== "SCHEDULED" || j.endAt == null || j.resourceShort) continue;
          const st = staff.find((x) => x.id === j.staffId);
          const wEnd = st ? Math.max(...st.windows.map((w) => w.endAt)) : Infinity;
          if (j.endAt <= wEnd) continue;
          p0 ??= PL.planDay({ ...input, jobs: jobs.map(({ groupId: _g, ...x }) => { void _g; return x; }) });
          const j0 = p0.jobs.find((x: any) => x.jobId === j.jobId);
          if (j0 && j0.state === "SCHEDULED" && j0.endAt <= wEnd) fails.window.push(`#${k} ${j.jobId} ${HM(j0.startAt)}→${HM(j.startAt)} จบ ${HM(j.endAt)} > ปิดหมอ ${HM(wEnd)}`);
        }
        if (k % 25 === 0) {
          const p2 = PL.planDay(structuredClone({ ...input, jobs: [...input.jobs].reverse(), resources: [...resources].reverse() }));
          const norm = (x: any) => J([...x.jobs].sort((a: any, b: any) => a.jobId.localeCompare(b.jobId)));
          if (norm(p) !== norm(p2)) fails.det.push(`#${k}`);
        }
      }
      ts.sort((a, b) => a - b);
      const pct = (f: number) => ts[Math.min(ts.length - 1, Math.floor(ts.length * f))];
      const perf = { n: N, p50: +pct(0.5).toFixed(3), p95: +pct(0.95).toFixed(3), p99: +pct(0.99).toFixed(3), max: +ts[ts.length - 1].toFixed(3) };
      console.log(`   ⏱  fuzz planDay+กลุ่ม: ${J(perf)}`);
      const sm = (x: string) => `${fails[x].length} ${fails[x].slice(0, 3).join(" · ")}`;
      rec("P9-core", ["sync", "cap", "staff", "past", "block"].every((x) => fails[x].length === 0), "CRITICAL", `fuzz ${N}: กลุ่มเริ่มพร้อมกัน (ผสมบริการ/นาทีเฉพาะหมอ) · ห้องไม่เกินจุ · ไม่ทับปิดซ่อม · หมอไม่ซ้อน · ไม่วางย้อนเวลา`, { sync: sm("sync"), cap: sm("cap"), block: sm("block"), staff: sm("staff"), past: sm("past") });
      rec("P9-early", fails.early.length === 0, "MAJOR", "PL-G2: สมาชิกกลุ่มถูกดึงเร็วก่อนเวลาจองเฉพาะเมื่อทุกสมาชิกที่ยังถือช่องมาถึงแล้ว", sm("early"));
      rec("P9-window", fails.window.length === 0, "MINOR", "สมาชิกที่ถูกดันตามกลุ่มจนจบเลยเวลางานหมอ (ทั้งที่แผนไม่มีกลุ่มจบทัน) ต้องมีสัญญาณ resourceShort", sm("window"));
      rec("P9-det", fails.det.length === 0, "MAJOR", "deterministic เมื่อสลับลำดับ jobs/resources", sm("det"));
      rec("P9-perf", perf.p95 < 50, "MAJOR", "fuzz planDay p95 < 50 ms", perf);
    });
  }

  // ═══════════ P12 (รอบแก้ 1) ตัวตัดสินกลุ่มใหม่: สลิป 2+ ใบ · 4 ทาง · คืน ∥ สลิปมาช้า · ยกเลิกรายคนแล้วสลิปเข้า ═══════════
  if (want("P12")) {
    console.log("\n── P12: สลิปกลุ่มซ้อน · สลิป∥ยืนยัน∥ยกเลิก∥หมดเวลา · คืน∥สลิปช้า · ยกเลิกรายคนแล้วสลิปเข้า ──");
    const d0 = await readDeadlocks();
    const moneyRec2 = async (id: string, sev: string, what: string, m: Money, extra: string[], detail: Record<string, unknown> = {}) => {
      const bal = balanced(await jv(m.saleIds));
      rec(id, m.issues.length === 0 && extra.length === 0 && bal, sev, what, { issues: [...m.issues, ...extra], balanced: bal, paid: m.paid, refunded: m.refunded, rows: m.perRow, ...detail });
    };
    // P12a ลูกค้าส่งสลิป 4 ใบพร้อมกัน (key ต่าง) → ร้านอนุมัติทุกใบที่ค้าง → consumer ทุก event ×3 พร้อมกัน
    await step("P12a", async () => {
      const u = U.P12a;
      const g = await groupOk(u, pair, 840, "ONLINE");
      const tok = await tokenOf(u, g.ids[0]);
      const subs = await fan("p12a-s", Array.from({ length: 4 }, () => [{ op: "submit", a: [tok, `b15p-s-${randomBytes(6).toString("hex")}`, newIp()] }]));
      const slips = await q(`SELECT id, status FROM "PaymentSlip" WHERE "refId" = ANY($1::text[]) AND status IN ('PENDING','NEEDS_REVIEW')`, [g.ids]);
      const evs: string[] = [];
      for (const sl of slips) {
        const d = await SV.decideSlip({ userId: ids.owner }, { tenantId: ids.tA }, sl.id, { reason: "ตรวจแล้ว", transRef: newTR(), decision: "APPROVE" });
        if (d?.ok) { const ev = (await q(`SELECT id FROM "OutboxEvent" WHERE type = 'payment.slip.approved' AND payload->>'slipId' = $1`, [sl.id]))[0]; if (ev) evs.push(ev.id); }
      }
      const outs = evs.length ? await fan("p12a-c", [evs.map((e) => ({ op: "consumeEvt", a: [e] })), evs.map((e) => ({ op: "consumeEvt", a: [e], delayMs: 4 })), evs.map((e) => ({ op: "consumeEvt", a: [e], delayMs: 9 }))]) : [];
      await pump();
      const m = await moneyOf(g.ids);
      const extra: string[] = [];
      if (m.rc !== 2 || m.paid !== DEP_PAIR) extra.push(`ใบรับ ${m.rc} · Σ ${m.paid} ≠ 2 · ${DEP_PAIR}`);
      if (!m.rows.every((a) => a.status === "CONFIRMED")) extra.push(`สถานะ ${m.rows.map((a) => a.status).join(",")}`);
      const sap = Number((await q(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "targetId" = ANY($1::text[]) AND action = 'booking.deposit.slip_after_paid'`, [g.ids]))[0].n);
      if (evs.length > 1 && sap === 0) extra.push(`สลิปเกิน ${evs.length - 1} ใบ ไม่มี audit slip_after_paid`);
      if (badOf([...subs, ...outs]).length) extra.push(`throw ${J(badOf([...subs, ...outs])[0])}`);
      await moneyRec2("P12a", "CRITICAL", `ส่งสลิป 4 ใบพร้อมกัน ⇒ อนุมัติทุกใบที่ค้าง · consumer ×3 ต่อ event ⇒ ใบรับต่อแถว 1 · Σ ${DEP_PAIR} · ใบที่เกินมีเตือน`, m, extra, { slips: slips.length, events: evs.length, slipAfterPaid: sap, subs: codesOf(subs) });
    });
    // P12b สลิปอนุมัติ ∥ ร้านยืนยัน ∥ ลูกค้ายกเลิก ∥ หมดเวลา (ถือ 1 นาที) · 3 รอบ
    for (let r = 0; r < 3; r++) await step(`P12b-${r}`, async () => {
      const u = U[`P12b${r}`];
      const g = await groupOk(u, pair, 840, "ONLINE");
      const created = (await apRow(g.ids[0])).createdAt.getTime();
      const tok = await tokenOf(u, g.ids[0]);
      const s = await slipApproved(tok, g.ids[0], { decision: "APPROVE" });
      const per: Call[][] = [
        [{ op: "consumeEvt", a: [s.evId], delayMs: r * 7 }, { op: "expire", a: [created + 3 * MIN] }],
        [{ op: "confirm", a: [SHOP, { unitId: u.id, appointmentId: g.ids[r % 2] }] }, { op: "cancelOnline", a: [tok, { ip: newIp() }], delayMs: 3 }],
        [{ op: "cancelOnline", a: [tok, { ip: newIp() }] }, { op: "consumeEvt", a: [s.evId], delayMs: 12 }],
        [{ op: "expire", a: [created + 3 * MIN] }, { op: "confirm", a: [SHOP, { unitId: u.id, appointmentId: g.ids[0] }], delayMs: 5 }],
        [{ op: "consumeEvt", a: [s.evId], delayMs: 2 }, { op: "expire", a: [created + 3 * MIN], delayMs: 6 }],
      ];
      const outs = await fan(`p12b-${r}`, per);
      await pump();
      const m = await moneyOf(g.ids);
      const v = await GR.groupOf(u.ctx, g.groupId);
      const st = new Set(m.rows.map((a) => a.status));
      const extra: string[] = [];
      if (st.size !== 1) extra.push(`สถานะผสม ${[...st].join(",")}`);
      if (m.paid !== DEP_PAIR || m.rc !== 2) extra.push(`เงินเข้า ${m.paid} ใบ ${m.rc} (สลิป ${DEP_PAIR} อนุมัติแล้ว ⇒ ต้องลงครบ 2 ใบ)`);
      if (st.has("CANCELLED") && v?.deposit?.refundDueSatang !== m.paid) extra.push(`ยกเลิกแล้วค้างคืน ${v?.deposit?.refundDueSatang} ≠ ${m.paid}`);
      if (m.rows.some((a) => a.cancelReason === "DEPOSIT_TIMEOUT")) extra.push("สลิปอนุมัติแล้วแต่ถูกปล่อยเพราะหมดเวลา");
      if (badOf(outs).length) extra.push(`throw ${J(badOf(outs)[0])}`);
      await moneyRec2(`P12b-${r}`, "CRITICAL", `${u.key}: สลิปอนุมัติ (consumer ×3) ∥ confirm ×2 ∥ cancelOnline ×2 ∥ expire ×3 ⇒ ใบรับต่อแถว 1 · Σ ${DEP_PAIR} · สถานะไม่ผสม · ยกเลิก ⇒ ค้างคืนเต็ม · ไม่ถูกปล่อยเพราะหมดเวลา`, m, extra, { codes: codesOf(outs), refundDue: v?.deposit?.refundDueSatang });
    });
    // P12c ร้านยกเลิกกลุ่ม → สลิปที่อนุมัติไว้มาช้า (consumer ×2) ∥ ร้านคืนเงิน ×5 → คืนรอบสุดท้าย ⇒ คืนครบครั้งเดียวต่อใบรับ
    await step("P12c", async () => {
      const u = U.P12c;
      const g = await groupOk(u, pair, 840, "ONLINE");
      const tok = await tokenOf(u, g.ids[0]);
      const s = await slipApproved(tok, g.ids[0], { decision: "APPROVE" });
      const cx = await GR.cancelGroup(u.ctx, g.groupId);
      const refund = (id: string, delayMs = 0): Call => ({ op: "refund", a: [SHOP, { unitId: u.id, appointmentId: id, reason: "ร้านยกเลิก probe" }], delayMs });
      const outs = await fan("p12c", [[{ op: "consumeEvt", a: [s.evId] }, refund(g.ids[0], 6)], [{ op: "consumeEvt", a: [s.evId], delayMs: 3 }, refund(g.ids[1], 2)], [refund(g.ids[0]), refund(g.ids[0], 15)]]);
      await pump();
      const last = await DP.refundDepositByShop(SHOP, { unitId: u.id, appointmentId: g.ids[0], reason: "คืนรอบสุดท้าย" });
      await pump();
      const m = await moneyOf(g.ids);
      const v = await GR.groupOf(u.ctx, g.groupId);
      const extra: string[] = [];
      if (!cx.ok) extra.push(`cancelGroup ${cx.code}`);
      if (m.paid !== DEP_PAIR || m.rc !== 2) extra.push(`เงินเข้า ${m.paid} ใบ ${m.rc}`);
      if (m.refunded !== m.paid || m.refundCount !== m.rc) extra.push(`คืน ${m.refunded}/${m.paid} · ใบคืน ${m.refundCount}/${m.rc}`);
      if ((v?.deposit?.refundDueSatang ?? -1) !== 0) extra.push(`ยังค้างคืน ${v?.deposit?.refundDueSatang}`);
      if (badOf(outs).length) extra.push(`throw ${J(badOf(outs)[0])}`);
      await moneyRec2("P12c", "CRITICAL", "ร้านยกเลิกกลุ่ม · สลิปที่อนุมัติไว้มาช้า ∥ คืนเงิน ×5 ⇒ ใบรับต่อแถว · คืนครบครั้งเดียว · ไม่ค้างคืน", m, extra, { codes: codesOf(outs), last: last.ok ? `OK dup=${last.duplicated ?? false}` : last.code });
    });
    // P12d ร้านยกเลิกสมาชิกคนที่ 2 → ลูกค้าจ่ายผ่านลิงก์หัวกลุ่ม (ยอด = ของหัวกลุ่ม) → สลิปอนุมัติ (consumer ×2)
    await step("P12d", async () => {
      const u = U.P12d;
      const g = await groupOk(u, pair, 840, "ONLINE");
      const cs = await LN.cancelByShop(u.ctx, g.ids[1]);
      const tok = await tokenOf(u, g.ids[0]);
      const p = await DP.loadDepositPay(tok, { ip: newIp() });
      const s = await slipApproved(tok, g.ids[0], { decision: "APPROVE" });
      const outs = await fan("p12d", [[{ op: "consumeEvt", a: [s.evId] }], [{ op: "consumeEvt", a: [s.evId], delayMs: 5 }]]);
      await pump();
      const m = await moneyOf(g.ids);
      const extra: string[] = [];
      if (!cs.ok) extra.push(`cancelByShop ${cs.code}`);
      if (!p.ok || p.pay.amountSatang !== DEP_OIL || s.expected !== DEP_OIL) extra.push(`หน้าจ่าย ${p.ok ? p.pay.amountSatang : p.code} · สลิปคาด ${s.expected} (ต้อง ${DEP_OIL})`);
      if (J(m.perRow.map((x) => x.rc)) !== J([[DEP_OIL], []])) extra.push(`ใบรับต่อแถว ${J(m.perRow.map((x) => x.rc))} ≠ [[${DEP_OIL}],[]]`);
      if (m.rows[0].status !== "CONFIRMED") extra.push(`หัวกลุ่มจ่ายครบแต่ ${m.rows[0].status} (ไม่ยืนยันเอง)`);
      if (badOf(outs).length) extra.push(`throw ${J(badOf(outs)[0])}`);
      await moneyRec2("P12d", "MAJOR", `ยกเลิกสมาชิกรายคนแล้วสลิปหัวกลุ่มเข้า (ยอด ${DEP_OIL}) ⇒ ใบรับเฉพาะหัวกลุ่ม ${DEP_OIL} · หัวกลุ่ม CONFIRMED · สมาชิกที่ถูกยกเลิกไม่ได้เงิน`, m, extra);
    });
    // P12e ร้านยกเลิกหัวกลุ่ม → ลูกค้าจ่ายผ่านลิงก์หัวกลุ่ม (ยอด = ของสมาชิกที่เหลือ) → สลิปอนุมัติ
    await step("P12e", async () => {
      const u = U.P12e;
      const g = await groupOk(u, pair, 840, "ONLINE");
      const cs = await LN.cancelByShop(u.ctx, g.ids[0]);
      const tok = await tokenOf(u, g.ids[0]);
      const p = await DP.loadDepositPay(tok, { ip: newIp() });
      if (!p.ok || p.pay.state !== "AWAITING") { info("P12e-pay", "หัวกลุ่มถูกยกเลิก ⇒ ลิงก์หัวกลุ่มจ่ายมัดจำของสมาชิกที่เหลือไม่ได้ (ข้อมูล · ลูกค้าไม่มีลิงก์อื่น)", { cancel: cs.ok ? "OK" : cs.code, pay: p.ok ? { state: p.pay.state, amount: p.pay.amountSatang } : p.code }); return; }
      const s = await slipApproved(tok, g.ids[0], { decision: "APPROVE" });
      const outs = await fan("p12e", [[{ op: "consumeEvt", a: [s.evId] }], [{ op: "consumeEvt", a: [s.evId], delayMs: 5 }]]);
      await pump();
      const m = await moneyOf(g.ids);
      const extra: string[] = [];
      if (p.pay.amountSatang !== DEP_ARO || s.expected !== DEP_ARO) extra.push(`หน้าจ่าย ${p.pay.amountSatang} · สลิปคาด ${s.expected} (ต้อง ${DEP_ARO})`);
      if (J(m.perRow.map((x) => x.rc)) !== J([[], [DEP_ARO]])) extra.push(`ใบรับต่อแถว ${J(m.perRow.map((x) => x.rc))} ≠ [[],[${DEP_ARO}]] (เงินไปลงแถวที่ถูกยกเลิก)`);
      if (m.rows[1].status !== "CONFIRMED") extra.push(`สมาชิกที่เหลือจ่ายครบแต่ ${m.rows[1].status}`);
      if (badOf(outs).length) extra.push(`throw ${J(badOf(outs)[0])}`);
      await moneyRec2("P12e", "MAJOR", `ยกเลิกหัวกลุ่มรายคนแล้วจ่ายผ่านลิงก์หัวกลุ่ม (ยอด ${DEP_ARO}) ⇒ ใบรับที่สมาชิกที่เหลือ ${DEP_ARO} · CONFIRMED · แถวที่ถูกยกเลิกไม่ได้เงิน`, m, extra);
    });
    const n = await dlCheck("P12", d0);
    rec("P12-deadlock", n === 0, "MAJOR", "deadlock ระหว่าง P12 = 0", { n });
  }

  // ═══════════ ท้าย: invariant ทุกหน่วย ═══════════
  await step("INV", async () => {
    const bad: string[] = [];
    for (const u of units) { const s = await unitInv(u); if (s.length) bad.push(`${u.key}: ${s.slice(0, 2).join(" · ")}`); }
    rec("INV-all", bad.length === 0, "CRITICAL", `SQL sweep ทุกหน่วย (${units.length}) หลังจบทุกฉาก: ห้องไม่ล้น (§4.6) · หมอไม่ซ้อน · กลุ่มครบ/พร้อมกัน/ห้องเดียว/หน่วยเดียว`, bad);
  });
} catch (e) {
  rec("FATAL", false, "ERR", "probe ล้ม", errMsg(e));
} finally {
  let dlEnd = NaN;
  try { dlEnd = await readDeadlocks(); } catch { /* */ }
  for (const f of goFiles) { try { unlinkSync(f); } catch { /* */ } }
  try { await cleanup(TIDS); await cleanupGlobal(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  const left = (await q(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n;
  console.log(`\n(ล้างข้อมูลแล้ว · ร้านค้าง ${left} · deadlock ฐาน start ${dlStart} → end ${dlEnd} · ต่อกลุ่ม ${dlNotes.join(" ")} · BUSY ${busyNotes.join(" ") || "0"})`);
  const br = results.filter((r) => !r.ok && r.sev !== "INFO");
  console.log(`\n══ สรุป: ${results.filter((r) => r.ok).length} HOLD · ${br.length} BREACH/ERR ══`);
  for (const r of br) console.log(`  ❌ [${r.id}] (${r.sev}) ${r.what} — ${r.detail.slice(0, 900)}`);
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, hold: results.filter((r) => r.ok).length, breach: br.map((r) => `${r.id}(${r.sev})`), info: results.filter((r) => !r.ok && r.sev === "INFO").map((r) => r.id), deadlocks: dlNotes, busy: busyNotes, cleanupLeft: left })}`);
  await pool.end();
  try { await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}
