// PROBE — SVC B.14 reviewer (ปฏิทินลากย้าย · หลายโพรเซส · ห้อง/หมอ/ข้ามร้าน) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b14-b.mts
// ข้อมูลใต้ร้าน slug `qc-svc-b14pr-*` + ผู้ใช้ `qc-svc-b14pr-*@qc.invalid` · ล้างใน finally ทุกครั้ง (+ กวาดค้างตอนเริ่ม)
// env: PROBE_B14_ONLY=S1,S7 (รันเฉพาะกลุ่ม)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import pg from "pg";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  let hn = "";
  try { hn = new URL(process.env[n] ?? "").hostname; } catch { /* */ }
  if (!hn.startsWith(svcQcHostMark())) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }

const BKm = (): Promise<any> => import("@/lib/modules/booking/service" as string);
const LNm = (): Promise<any> => import("@/lib/modules/booking/queue-line" as string);
const RNm = (): Promise<any> => import("@/lib/modules/booking/planner-run" as string);
const RSm = (): Promise<any> => import("@/lib/modules/booking/resources" as string);
const CLm = (): Promise<any> => import("@/lib/modules/booking/calendar" as string);

// ═══════════ โหมดลูก ═══════════
type Call = { op: string; a: any[]; delayMs?: number; tag?: string };
const goFile = (run: string, key: string) => `/tmp/probe-b14b-go-${run}-${key}`;
const revive = (x: any): any => {
  if (Array.isArray(x)) return x.map(revive);
  if (x && typeof x === "object") {
    if (typeof x.__date === "string" && Object.keys(x).length === 1) return new Date(x.__date);
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, revive(v)]));
  }
  return x;
};
const slim = (r: any) => (r && typeof r === "object" ? {
  ok: r.ok, code: r.code ?? null, id: r.id ?? r.appointmentId ?? null,
  reason: typeof r.reason === "string" ? r.reason.slice(0, 80) : null,
} : r);
async function runOp(c: Call): Promise<any> {
  const t0 = Date.now();
  if (c.delayMs) await sleep(c.delayMs);
  const a = revive(c.a);
  try {
    const BK = await BKm(), LN = await LNm(), RN = await RNm(), RS = await RSm(), CL = await CLm();
    let r: any;
    if (c.op === "move") r = await CL.moveAppointment(a[0], a[1], a[2], a[3], a[4]);
    else if (c.op === "shop") { const x = await LN.rescheduleByShop(a[0], a[1], a[2], a[3]); r = { ...x, id: a[1] }; }
    else if (c.op === "self") { const x = await BK.rescheduleBySelf(a[0], a[1], a[2], a[3]); r = { ...x, id: a[1] }; }
    else if (c.op === "book") r = await BK.bookAppointment(a[0], a[1]);
    else if (c.op === "bookCal") r = await CL.bookForCustomer(a[0], a[1], a[2]);
    else if (c.op === "walkIn") r = await LN.createWalkIn(a[0], a[1], a[2]);
    else if (c.op === "checkIn") { const x = await LN.checkIn(a[0], { appointmentId: a[1] }, { via: "STAFF", now: a[2] }); r = { ...x, id: a[1] }; }
    else if (c.op === "cancel") { const x = await LN.cancelByShop(a[0], a[1], { now: a[2] }); r = { ...x, id: a[1] }; }
    else if (c.op === "status") { const x = await BK.setAppointmentStatus(a[0], a[1], a[2], a[3]); r = { ...x, code: x.ok ? null : "STATUS_FAIL", id: a[2] }; }
    else if (c.op === "start") { const x = await LN.startJob(a[0], a[1], { now: a[2] }); r = { ...x, id: a[1] }; }
    else if (c.op === "resUpd") r = await RS.updateResource(a[0], a[1], a[2], a[3]);
    else if (c.op === "resMaint") r = await RS.setResourceMaintenance(a[0], a[1], a[2], a[3]);
    else if (c.op === "plan") { await RN.runPlanner(a[0], { now: a[1] }); r = { ok: true }; }
    else r = { unknownOp: c.op };
    return { op: c.op, tag: c.tag ?? null, r: slim(r), ms: Date.now() - t0 };
  } catch (e) {
    return { op: c.op, tag: c.tag ?? null, threw: errMsg(e), ms: Date.now() - t0 };
  }
}

if (process.env.PROBE_B14B_CHILD) {
  const spec = JSON.parse(process.env.PROBE_B14B_CHILD) as { run: string; key: string; calls: Call[] };
  try {
    const { prisma } = await import("@/lib/core/db" as string);
    await prisma.$queryRawUnsafe("SELECT 1");
    await BKm(); await LNm(); await RNm(); await RSm(); await CLm();
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
const LOG = `/tmp/probe-b14-b.out.${process.pid}.log`;
{
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...x: unknown[]) => { try { appendFileSync(LOG, `${x.map((y) => (typeof y === "string" ? y : J(y))).join(" ")}\n`); } catch { /* */ } try { orig(...x); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}
const ONLY = new Set((process.env.PROBE_B14_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const want = (g: string) => ONLY.size === 0 || ONLY.has(g);
const RUN = Date.now().toString(36);
const goFiles: string[] = [];
async function fan(key: string, perChild: Call[][]): Promise<any[]> {
  const n = perChild.length;
  const ready = new Set<number>(); const res = new Map<number, any[]>(); const dead = new Set<number>(); const errs: string[] = [];
  const kids = perChild.map((calls, idx) => {
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, PROBE_B14B_CHILD: JSON.stringify({ run: RUN, key, calls }) }, stdio: ["ignore", "pipe", "pipe"] });
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
    for (const k of kids) if (k.exitCode === null) k.kill("SIGKILL"); // ลูกของ probe เอง (ค้างหลังรายงานผลแล้วเท่านั้น)
  }
  if (errs.length) console.log(`  (ลูก: ${errs.slice(0, 3).join(" · ")})`);
  return [...res.values()].flat();
}
const spread = (calls: Call[], n = 5): Call[][] => Array.from({ length: n }, (_, i) => calls.filter((_, k) => k % n === i));

type R = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: R[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown = "") => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : sev === "INFO" ? "ℹ️  INFO" : "❌ BREACH"} [${id}] (${sev}) ${what}${d ? ` — ${d.slice(0, 1500)}` : ""}`);
};
const BADRX = /P2028|P2024|P2034|timed out|Unable to start a transaction|Transaction already closed|INTERNAL|40P01|deadlock/i;
const badOf = (outs: any[]) => outs.filter((o) => o.threw || BADRX.test(J(o)));
const codesOf = (outs: any[]) => outs.map((o) => `${o.tag ?? o.op}:${o.threw ? "THREW " + o.threw.slice(0, 60) : o.r?.ok ? "OK" : o.r?.code ?? "FAIL"}`);
const okOf = (outs: any[], op?: string, tag?: string) => outs.filter((o) => !o.threw && o.r?.ok && (!op || o.op === op) && (!tag || o.tag === tag));
const step = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { rec(id, false, "ERR", "probe ล้มเอง (ไม่ใช่ผลตัดสิน)", errMsg(e)); } };

// ═══════════ ฐาน ═══════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => (await pool.query(sql, p)).rows;
const colCache = new Map<string, any[]>();
const rid = (p: string) => `b14pr_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
const SLUG = "qc-svc-b14pr-";
const MAIL = "qc-svc-b14pr-";
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
async function cleanupUsers() {
  try {
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const readDeadlocks = async () => Number((await q(`SELECT deadlocks::text AS n FROM pg_stat_database WHERE datname = current_database()`))[0]?.n ?? NaN);
const dlSettled = async () => { await sleep(12_000); return readDeadlocks(); };

// ═══════════ เวลา ═══════════
const MIN = 60_000;
const addDays = (ds: string, n: number) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const DS = addDays(TODAY, 6);
const DS2 = addDays(TODAY, 7);
const atMs = (ds: string, min: number) => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * MIN; };
const at = (ds: string, min: number) => new Date(atMs(ds, min));
const D = (d: Date) => ({ __date: d.toISOString() });
const HM = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16);
const bkkMin = (ms: number) => { const d = new Date(ms + 7 * 3_600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

// ═══════════ fixtures ═══════════
const T = (k: string) => `b14pr_${k}_${RUN}`;
const ids = { tA: T("tA"), tB: T("tB"), owner: T("owner") };
const TIDS = [ids.tA, ids.tB];
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
type ResSpec = { key: string; kind: string; sortOrder: number; cleanup: number; cap?: number; active?: boolean };
type SvcSpec = { key: string; dur: number; kinds?: string[]; buffer?: number };
type Unit = { key: string; tenantId: string; id: string; ctx: { tenantId: string; unitId: string }; staff: string[]; svc: Record<string, string>; res: Record<string, string>; kinds: Map<string, string[]> };
const units: Unit[] = [];
let ord = 0;
let phoneN = 0;
const newPhone = () => `08${String(63_000_000 + Math.floor(Math.random() * 700_000) * 10 + ++phoneN).slice(-8)}`;
async function mkUnit(key: string, o: { tenant?: string; staffN: number; res: ResSpec[]; svcs: SvcSpec[]; hours?: [number, number] }): Promise<Unit> {
  const tenantId = o.tenant ?? ids.tA;
  const id = T(`u_${key}`);
  await insertRow("BusinessUnit", { id, tenantId, type: "BOOKING", name: `pr ${key}`, slug: `b14pr-${key.toLowerCase()}-${RUN}`, updatedAt: new Date() });
  const [op, cl] = o.hours ?? [600, 1260];
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
    await insertRow("BookingService", { id: sid, tenantId, unitId: id, name: `${s.key} ${s.dur}`, durationMin: s.dur, priceSatang: 50000, bufferMin: s.buffer ?? 0, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
    svc[s.key] = sid; kinds.set(sid, s.kinds ?? []);
  }
  const res: Record<string, string> = {};
  for (const r of o.res) {
    const rr = T(`${key}_${r.key}`);
    await insertRow("SvcResource", { id: rr, tenantId, unitId: id, kind: r.kind, name: `${r.key}`, capacity: r.cap ?? 1, cleanupMin: r.cleanup, active: r.active ?? true, sortOrder: r.sortOrder, createdAt: new Date(Date.now() - 900_000 + ++ord * 1000), updatedAt: new Date() });
    res[r.key] = rr;
  }
  const u = { key, tenantId, id, ctx: { tenantId, unitId: id }, staff, svc, res, kinds };
  units.push(u);
  return u;
}

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const BK: any = await BKm();
const LN: any = await LNm();
const RN: any = await RNm();
const RS: any = await RSm();
const CL: any = await CLm();
const SET: any = await import("@/lib/core/settings" as string);

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
    ]));
    if (!s.ok) throw new Error(`setSettings ${J(s)}`);
    const kk = us.flatMap((u) => [...u.kinds.entries()].filter(([, k]) => k.length).map(([sid, k]) => ({ key: "booking.service.resourceKinds", scope: "SERVICE", scopeId: sid, value: k })));
    if (kk.length) { const r = await SET.setSettings(OWNER, { tenantId: t }, kk); if (!r.ok) throw new Error(`resourceKinds ${J(r)}`); }
  }
}

// ═══════════ ตัวกวาด invariant (SQL · นิยามเดียวกับ probe-b13-b ฉบับรับ) ═══════════
type Occ = { id: string; s: number; e: number };
async function holdsOf(unitId: string): Promise<{ res: any[]; occ: Map<string, Occ[]>; blocks: Map<string, { s: number; e: number }[]>; bad: string[] }> {
  const res = await q(`SELECT id, kind, capacity, "cleanupMin", active FROM "SvcResource" WHERE "unitId" = $1`, [unitId]);
  const rows = await q(`SELECT a.id, a.status::text AS status, a."serviceId", a."startAt", a."endAt", a."resourceId", a."plannedStartAt", a."startedAt", a."policySnapshot", s."bufferMin", a."checkedInAt"
    FROM "Appointment" a JOIN "BookingService" s ON s.id = a."serviceId" WHERE a."unitId" = $1 AND a.status::text NOT IN ('CANCELLED','NO_SHOW','DONE')`, [unitId]);
  const bl = await q(`SELECT "resourceId", "startAt", "endAt" FROM "SvcResourceBlock" WHERE "unitId" = $1`, [unitId]);
  const blocks = new Map<string, { s: number; e: number }[]>();
  for (const b of bl) blocks.set(b.resourceId, [...(blocks.get(b.resourceId) ?? []), { s: b.startAt.getTime(), e: b.endAt ? b.endAt.getTime() : Number.MAX_SAFE_INTEGER }]);
  const occ = new Map<string, Occ[]>(res.map((r) => [r.id, []]));
  const bad: string[] = [];
  const u = units.find((x) => x.id === unitId);
  for (const a of rows) {
    const job = a.policySnapshot?.job ?? {};
    if (a.status === "ARRIVED" && !a.plannedStartAt && a.checkedInAt && typeof job.unplacedFor === "string" && Date.parse(job.unplacedFor) === a.checkedInAt.getTime()) continue;
    const rids: string[] = Array.isArray(job.resourceIds) ? job.resourceIds : a.resourceId ? [a.resourceId] : [];
    const dur = typeof job.durationMin === "number" ? job.durationMin * MIN : a.endAt.getTime() - a.startAt.getTime() - (job.bufferMin ?? a.bufferMin) * MIN;
    const arrivedFrom = a.status === "ARRIVED" && a.checkedInAt ? Math.max(a.startAt.getTime(), a.checkedInAt.getTime()) : a.startAt.getTime();
    const st0 = a.status === "IN_SERVICE" ? (a.startedAt ?? a.plannedStartAt ?? a.startAt).getTime() : (a.plannedStartAt?.getTime() ?? arrivedFrom);
    const e = st0 + dur;
    const need = u?.kinds.get(a.serviceId) ?? [];
    if (need.length && rids.length && (rids.length !== need.length || rids.some((x, k) => res.find((r) => r.id === x)?.kind !== need[k]))) bad.push(`KIND ${a.id.slice(-6)} ถือ ${J(rids.map((x) => res.find((r) => r.id === x)?.kind ?? "??"))} ต้อง ${J(need)}`);
    if (need.length && !rids.length) bad.push(`UNBOUND ${a.id.slice(-6)} ${a.status} ไม่ถือทรัพยากร`);
    for (const x of rids) {
      const r = res.find((y) => y.id === x);
      if (!r) { bad.push(`FOREIGN ${a.id.slice(-6)} ถือ ${x}`); continue; }
      occ.get(x)!.push({ id: a.id, s: st0, e: e + r.cleanupMin * MIN });
    }
  }
  return { res, occ, blocks, bad };
}
async function sweep(unitId: string): Promise<string[]> {
  const { res, occ, blocks, bad } = await holdsOf(unitId);
  const out = [...bad];
  for (const r of res) {
    const xs = occ.get(r.id)!;
    for (const x of xs) {
      const n = xs.filter((y) => y.s <= x.s && y.e > x.s).length;
      if (n > r.capacity) { out.push(`${r.id.slice(-10)} ซ้อน ${n} > จุ ${r.capacity} ที่ ${HM(x.s)}`); break; }
    }
    for (const x of xs) if ((blocks.get(r.id) ?? []).some((b) => x.s < b.e && b.s < x.e)) { out.push(`${r.id.slice(-10)} ทับปิดซ่อม ${HM(x.s)}`); break; }
    if (!r.active && xs.some((x) => x.e > Date.now())) out.push(`${r.id.slice(-10)} ปิดใช้แต่ยังมีนัดถือ`);
  }
  return out;
}
const overlapCount = async (unitId: string, s: number, e: number) => {
  const { occ } = await holdsOf(unitId);
  const set = new Set<string>();
  for (const xs of occ.values()) for (const x of xs) if (x.s < e && s < x.e) set.add(x.id);
  return set.size;
};
const staffOverlap = async (unitId: string): Promise<string[]> => {
  const rows = await q(`SELECT "staffId", "startAt" AS s, "endAt" AS e FROM "Appointment" WHERE "unitId" = $1 AND status::text NOT IN ('CANCELLED','NO_SHOW','DONE') ORDER BY "staffId", "startAt"`, [unitId]);
  const bad: string[] = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].staffId === rows[i - 1].staffId && rows[i].s.getTime() < rows[i - 1].e.getTime()) bad.push(`${rows[i].staffId.slice(-6)} ${HM(rows[i].s.getTime())}`);
  return bad;
};
const apRow = async (id: string) => (await q(`SELECT id, status::text AS status, "staffId", "startAt", "endAt", "resourceId", "plannedStartAt", "plannedStaffId", "checkedInAt", "lateAt", "updatedAt", "policySnapshot", "assignMode", "groupId" FROM "Appointment" WHERE id = $1`, [id]))[0];
const resIdsOf = (a: any): string[] => (Array.isArray(a?.policySnapshot?.job?.resourceIds) ? a.policySnapshot.job.resourceIds : a?.resourceId ? [a.resourceId] : []);
const evKeys = async (apptId: string) => (await q(`SELECT "idempotencyKey" AS k FROM "OutboxEvent" WHERE type = 'booking.rescheduled' AND payload->>'appointmentId' = $1 ORDER BY "createdAt", id`, [apptId])).map((r) => r.k as string);
const auditN = async (apptId: string) => Number((await q(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "targetId" = $1`, [apptId]).catch(() => [{ n: -1 }]))[0]?.n ?? -1);

const bkIn = (u: Unit, svcKey: string, staffIdx: number | null, ds: string, min: number, channel = "STAFF") =>
  ({ serviceId: u.svc[svcKey], staffId: staffIdx === null ? null : u.staff[staffIdx], dateStr: ds, startMin: min, channel, customerName: "คุณโพรบ บีสิบสี่", customerPhone: newPhone(), idempotencyKey: rid("idem") });
async function bookOk(u: Unit, svcKey: string, staffIdx: number | null, ds: string, min: number, channel = "STAFF"): Promise<string> {
  const r = await BK.bookAppointment(u.ctx, bkIn(u, svcKey, staffIdx, ds, min, channel));
  if (!r.ok) throw new Error(`จอง ${u.key} ${svcKey} ${ds} ${HM(atMs(ds, min))} ${channel} ล้ม ${r.code} ${r.reason}`);
  if (r.status === "PENDING") { const c = await BK.setAppointmentStatus(u.tenantId, u.id, r.id, "CONFIRMED"); if (!c.ok) throw new Error(`ยืนยัน ${J(c)}`); }
  return r.id;
}
const expOf = async (id: string) => { const a = await apRow(id); return { startAt: a.startAt.toISOString(), staffId: a.staffId }; };
const mvCall = (u: Unit, id: string, to: Record<string, unknown>, expect: { startAt: string; staffId: string }, now?: Date, tag?: string, actor: any = OWNER): Call =>
  ({ op: "move", tag, a: [actor, u.ctx, id, to, { expect, ...(now ? { now: D(now) } : {}) }] });
const mvNow = (u: Unit, id: string, to: Record<string, unknown>, expect: { startAt: string; staffId: string }, now?: Date, actor: any = OWNER) =>
  CL.moveAppointment(actor, u.ctx, id, to, { expect, ...(now ? { now } : {}) });
const MOVE_ALLOWED = new Set(["FULL", "BUSY", "LOST_RACE", "BAD_STATE", "IN_USE", "CLASH", "STATUS_FAIL", "NOT_TODAY", "TOO_LATE", "PAST", "NOT_CONFIRMED", "WALKIN_CLOSED"]);
const offContract = (outs: any[]) => outs.filter((o) => !o.threw && o.r && o.r.ok === false && !MOVE_ALLOWED.has(o.r.code));

// ═══════════ main ═══════════
let dlStart = NaN;
const dlNotes: string[] = [];
try {
  const stale = (await q(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id as string);
  if (stale.length) { console.log(`(กวาดร้านค้าง ${stale.length})`); await cleanup(stale); }
  await cleanupUsers();
  for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) await insertRow("Tenant", { id, name: `PR B14 ${n}`, slug: `${SLUG}${n}-${RUN}`, updatedAt: new Date() });
  await insertRow("User", { id: ids.owner, email: `${MAIL}owner-${RUN}@qc.invalid`, name: "PR B14 owner", updatedAt: new Date() });
  for (const t of TIDS) await insertRow("Membership", { id: rid("mb"), userId: ids.owner, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });

  const OILS: SvcSpec[] = [{ key: "OIL", dur: 60, kinds: ["ROOM"] }, { key: "PLAIN", dur: 60 }, { key: "BUF", dur: 50, buffer: 10 }];
  const room1: ResSpec[] = [{ key: "rA", kind: "ROOM", sortOrder: 1, cleanup: 15 }];
  const room2: ResSpec[] = [{ key: "rA", kind: "ROOM", sortOrder: 1, cleanup: 15 }, { key: "rB", kind: "ROOM", sortOrder: 2, cleanup: 15 }];
  const U: Record<string, Unit> = {};
  const mk = async (k: string, o: Parameters<typeof mkUnit>[1]) => { U[k] = await mkUnit(k, o); return U[k]; };
  for (let r = 0; r < 3; r++) await mk(`S1r${r}`, { staffN: 4, res: room2, svcs: OILS });
  for (let r = 0; r < 2; r++) await mk(`S1n${r}`, { staffN: 4, res: room2, svcs: OILS });
  for (let r = 0; r < 3; r++) await mk(`S2r${r}`, { staffN: 8, res: room2, svcs: OILS });
  for (let r = 0; r < 2; r++) await mk(`S2f${r}`, { staffN: 8, res: room2, svcs: OILS });
  for (let r = 0; r < 3; r++) await mk(`S3r${r}`, { staffN: 12, res: room1, svcs: OILS });
  for (let r = 0; r < 2; r++) await mk(`S4d${r}`, { staffN: 10, res: room2, svcs: OILS });
  for (let r = 0; r < 2; r++) await mk(`S4m${r}`, { staffN: 10, res: room2, svcs: OILS });
  for (let r = 0; r < 3; r++) await mk(`S5r${r}`, { staffN: 4, res: room1, svcs: OILS });
  for (let r = 0; r < 2; r++) await mk(`S6r${r}`, { staffN: 4, res: room2, svcs: OILS });
  await mk("S7", { staffN: 3, res: room2, svcs: OILS });
  await mk("S8", { staffN: 3, res: room2, svcs: OILS });
  await mk("S8o", { staffN: 2, res: room1, svcs: OILS });
  await mk("S8b", { tenant: ids.tB, staffN: 2, res: room1, svcs: OILS });
  await mk("S9", { staffN: 4, res: room2, svcs: OILS });
  await mk("S10", { staffN: 6, res: [{ key: "vip", kind: "COUPLE_ROOM", sortOrder: 1, cleanup: 20, cap: 2 }], svcs: [{ key: "CPL", dur: 60, kinds: ["COUPLE_ROOM"] }] });
  await mk("S11", { staffN: 3, res: [], svcs: OILS, hours: [0, 1440] });
  await mk("S12", { staffN: 3, res: [...room2, { key: "bed", kind: "BED", sortOrder: 3, cleanup: 0 }, { key: "rOld", kind: "ROOM", sortOrder: 4, cleanup: 0, active: false }], svcs: OILS });
  await mk("S13", { staffN: 12, res: [1, 2, 3, 4, 5, 6].map((k) => ({ key: `r${k}`, kind: "ROOM", sortOrder: k, cleanup: 10 })), svcs: OILS });
  await finishSetup(units);
  console.log(`(fixtures พร้อม · ${units.length} หน่วย · วัน ${DS} · now จริง ${new Date().toISOString()})`);
  dlStart = await readDeadlocks();
  const dlCheck = async (label: string, d0: number) => { const d1 = await dlSettled(); const n = d1 - d0; dlNotes.push(`${label}:${n}`); return n; };
  const d0all = dlStart;

  // ═══════════ S1 นัดเดียวลากพร้อมกันไป 2 ช่องต่างกัน (expect เดียว) ⇒ 1 ═══════════
  if (want("S1")) {
    console.log("\n── S1: นัดเดียว ลาก 10 ทางไป 2 ช่อง (คนละหมอ) expect เดียวกัน ⇒ สำเร็จ 1 · event 1 ──");
    for (let r = 0; r < 3; r++) await step(`S1-${r}`, async () => {
      const u = U[`S1r${r}`];
      const id = await bookOk(u, "OIL", 0, DS, 660);
      const ex = await expOf(id);
      const calls: Call[] = [
        ...[0, 1, 2, 3, 4].map(() => mvCall(u, id, { dateStr: DS, startMin: 900, staffId: u.staff[0] }, ex, undefined, "X")),
        ...[0, 1, 2, 3, 4].map(() => mvCall(u, id, { dateStr: DS, startMin: 1020, staffId: u.staff[1] }, ex, undefined, "Y")),
      ];
      const outs = await fan(`s1-${r}`, spread(calls.map((c, k) => ({ ...c, delayMs: (k * 5 + r) % 7 }))));
      const oks = okOf(outs);
      const a = await apRow(id);
      const keys = await evKeys(id);
      const win = oks[0]?.tag;
      const posOk = win === "X" ? a.startAt.getTime() === atMs(DS, 900) && a.staffId === u.staff[0] : win === "Y" ? a.startAt.getTime() === atMs(DS, 1020) && a.staffId === u.staff[1] : false;
      const losers = outs.filter((o) => !o.r?.ok).every((o) => o.r?.code === "LOST_RACE" || o.r?.code === "BUSY");
      const sw = await sweep(u.id), so = await staffOverlap(u.id);
      rec(`S1-${r}`, oks.length === 1 && posOk && losers && keys.length === 1 && sw.length === 0 && so.length === 0 && badOf(outs).length === 0, "CRITICAL",
        "สำเร็จ 1 · ที่เหลือ LOST_RACE/BUSY · แถวอยู่ช่องผู้ชนะ · event 1 · ห้อง/หมอไม่ซ้อน", { codes: codesOf(outs), win, at: `${HM(a.startAt.getTime())} ${a.staffId.slice(-3)}`, keys: keys.length, sw, so });
    });
    // ไม่ส่ง expect (ทางเดิมของ rescheduleByShop) — ย้ายต่อกันได้หลายครั้ง แต่ต้องไม่ซ้อน · event = จำนวนสำเร็จ
    for (let r = 0; r < 2; r++) await step(`S1n-${r}`, async () => {
      const u = U[`S1n${r}`];
      const id = await bookOk(u, "OIL", 0, DS, 660);
      const calls: Call[] = [
        ...[0, 1, 2, 3, 4].map((): Call => ({ op: "shop", tag: "X", a: [u.ctx, id, { dateStr: DS, startMin: 900, staffId: u.staff[0] }] })),
        ...[0, 1, 2, 3, 4].map((): Call => ({ op: "shop", tag: "Y", a: [u.ctx, id, { dateStr: DS, startMin: 1020, staffId: u.staff[1] }] })),
      ];
      const outs = await fan(`s1n-${r}`, spread(calls));
      const oks = okOf(outs);
      const keys = await evKeys(id);
      const sw = await sweep(u.id), so = await staffOverlap(u.id);
      rec(`S1n-${r}`, keys.length === oks.length && new Set(keys).size === keys.length && sw.length === 0 && so.length === 0 && badOf(outs).length === 0, "MAJOR",
        "ไม่มี expect (เรียกแบบเดิม): ทุกการย้ายที่สำเร็จมี event คีย์ไม่ซ้ำ (ไป-กลับระหว่าง 2 ช่อง) · ไม่ซ้อน", { codes: codesOf(outs), ok: oks.length, keys: keys.length, sw, so });
    });
  }

  // ═══════════ S2 2 นัดแย่งห้องสุดท้าย · ห้องที่ระบุ ═══════════
  if (want("S2")) {
    console.log("\n── S2: 2 นัด × 5 ทาง แย่งห้องว่างชิ้นสุดท้าย ⇒ 1 · ห้องที่ระบุห้ามสลับเงียบ ──");
    for (let r = 0; r < 3; r++) await step(`S2-${r}`, async () => {
      const u = U[`S2r${r}`];
      await bookOk(u, "OIL", 7, DS, 840); // ถือ rA 14:00
      const a1 = await bookOk(u, "OIL", 0, DS, 600), a2 = await bookOk(u, "OIL", 1, DS, 600);
      const e1 = await expOf(a1), e2 = await expOf(a2);
      const calls: Call[] = [
        ...[0, 1, 2, 3, 4].map(() => mvCall(u, a1, { dateStr: DS, startMin: 840 }, e1, undefined, "a1")),
        ...[0, 1, 2, 3, 4].map(() => mvCall(u, a2, { dateStr: DS, startMin: 840 }, e2, undefined, "a2")),
      ];
      const outs = await fan(`s2-${r}`, spread(calls));
      const ov = await overlapCount(u.id, atMs(DS, 840), atMs(DS, 841));
      const sw = await sweep(u.id);
      rec(`S2-${r}`, okOf(outs).length === 1 && ov === 2 && sw.length === 0 && badOf(outs).length === 0 && offContract(outs).length === 0, "CRITICAL",
        "ห้องว่างเหลือ 1 ⇒ ลากเข้าได้ 1 · ที่ถือห้อง ณ 14:00 = 2 (ของเดิม 1 + ผู้ชนะ 1) · ฐานไม่ล้น", { codes: codesOf(outs), ov, sw });
    });
    for (let r = 0; r < 2; r++) await step(`S2f-${r}`, async () => {
      const u = U[`S2f${r}`];
      const occ = await bookOk(u, "OIL", 7, DS, 840);
      const occRes = resIdsOf(await apRow(occ))[0];
      const freeRes = occRes === u.res.rA ? u.res.rB : u.res.rA;
      const a1 = await bookOk(u, "OIL", 0, DS, 600), a2 = await bookOk(u, "OIL", 1, DS, 600);
      const before = await apRow(a1);
      const r1 = await mvNow(u, a1, { dateStr: DS, startMin: 840, resourceId: occRes }, await expOf(a1));
      const after = await apRow(a1);
      rec(`S2f-${r}-busy`, !r1.ok && r1.code === "FULL" && after.startAt.getTime() === before.startAt.getTime() && after.updatedAt.getTime() === before.updatedAt.getTime(), "CRITICAL",
        "ปล่อยบนห้องที่ไม่ว่าง (มีห้องอื่นว่าง) ⇒ FULL · ไม่สลับไปห้องว่างเงียบ · แถวไม่ถูกเขียน", { r1, before: HM(before.startAt.getTime()), after: HM(after.startAt.getTime()) });
      const e1 = await expOf(a1), e2 = await expOf(a2);
      const calls: Call[] = [
        ...[0, 1, 2, 3, 4].map(() => mvCall(u, a1, { dateStr: DS, startMin: 840, resourceId: freeRes }, e1, undefined, "a1")),
        ...[0, 1, 2, 3, 4].map(() => mvCall(u, a2, { dateStr: DS, startMin: 840, resourceId: freeRes }, e2, undefined, "a2")),
        mvCall(u, a2, { dateStr: DS, startMin: 840, resourceId: occRes }, e2, undefined, "a2busy"),
      ];
      const outs = await fan(`s2f-${r}`, spread(calls));
      const oks = okOf(outs);
      const winId = oks[0]?.tag === "a1" ? a1 : oks[0]?.tag === "a2" ? a2 : null;
      const winRes = winId ? resIdsOf(await apRow(winId)) : [];
      const sw = await sweep(u.id);
      rec(`S2f-${r}`, oks.length === 1 && oks[0].tag !== "a2busy" && J(winRes) === J([freeRes]) && sw.length === 0 && badOf(outs).length === 0, "CRITICAL",
        "ห้องที่ระบุ: 10 ทางแย่งห้องว่าง ⇒ 1 และผู้ชนะถือห้องที่ระบุ · ทางที่ระบุห้องไม่ว่างต้องไม่สำเร็จ", { codes: codesOf(outs), winRes, freeRes, sw });
    });
  }

  // ═══════════ S3 ลาก ∥ จองร้าน ∥ ออนไลน์ ∥ จองจากปฏิทิน ∥ walk-in ∥ วางคิว — ห้องเดียว ═══════════
  if (want("S3")) {
    console.log("\n── S3: ลาก ∥ จอง STAFF ∥ ONLINE ∥ bookForCustomer ∥ walk-in ∥ runPlanner ห้องเดียว ⇒ 1 · deadlock 0 ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 3; r++) await step(`S3-${r}`, async () => {
      const u = U[`S3r${r}`];
      const aX = await bookOk(u, "OIL", 0, DS, 600), aY = await bookOk(u, "OIL", 1, DS, 690);
      const now = at(DS, 835);
      const eX = await expOf(aX), eY = await expOf(aY);
      const bk = (k: number, ch: string): Call => ({ op: "book", tag: ch, a: [u.ctx, bkIn(u, "OIL", k, DS, 840, ch)] });
      const calls: Call[] = [
        mvCall(u, aX, { dateStr: DS, startMin: 840 }, eX, now, "mvX"), mvCall(u, aY, { dateStr: DS, startMin: 840 }, eY, now, "mvY"),
        bk(2, "STAFF"), bk(3, "PHONE"), bk(4, "ONLINE"), bk(5, "ONLINE"),
        { op: "bookCal", tag: "cal", a: [OWNER, u.ctx, { ...bkIn(u, "OIL", 6, DS, 840) }] }, { op: "bookCal", tag: "cal", a: [OWNER, u.ctx, { ...bkIn(u, "OIL", null, DS, 840) }] },
        { op: "walkIn", tag: "wi", a: [u.ctx, { serviceId: u.svc.OIL, staffId: u.staff[8], channel: "STAFF" }, { now: D(now) }] },
        { op: "walkIn", tag: "wi", a: [u.ctx, { serviceId: u.svc.OIL, staffId: u.staff[9], channel: "STAFF" }, { now: D(now) }] },
        { op: "plan", a: [u.ctx, D(now)] },
      ];
      const outs = await fan(`s3-${r}`, spread(calls.map((c, k) => ({ ...c, delayMs: (k * 3 + r) % 9 }))));
      const ov = await overlapCount(u.id, atMs(DS, 840), atMs(DS, 899));
      const sw = await sweep(u.id), so = await staffOverlap(u.id);
      const nonWalk = okOf(outs).filter((o) => o.tag !== "wi" && o.op !== "plan").length;
      rec(`S3-${r}`, ov === 1 && sw.length === 0 && so.length === 0 && badOf(outs).length === 0 && nonWalk <= 1, "CRITICAL",
        "ห้องเดียว ⇒ ที่ถือห้อง 14:00–14:59 = 1 พอดี (walk-in ที่ได้บัตรถูกวางหลัง) · ฐานไม่ล้น · ไม่มี throw/40P01", { codes: codesOf(outs), ov, sw, so });
    });
    const n = await dlCheck("S3", d0);
    rec("S3-dl", n === 0, "CRITICAL", "deadlock ระหว่าง S3 = 0", { delta: n });
  }

  // ═══════════ S4 ลาก ∥ ปิดใช้ห้อง / ปิดซ่อมทั้งสองห้อง ═══════════
  if (want("S4")) {
    console.log("\n── S4: ลากเข้าห้องที่ระบุ ∥ ปิดใช้ห้องนั้น · ลาก ∥ ปิดซ่อม 2 ห้อง ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 2; r++) await step(`S4d-${r}`, async () => {
      const u = U[`S4d${r}`];
      const oil: string[] = [];
      for (let k = 0; k < 4; k++) oil.push(await bookOk(u, "OIL", k, DS2, 600 + k * 90));
      const exs = await Promise.all(oil.map(expOf));
      const calls: Call[] = [
        { op: "resUpd", tag: "off", a: [OWNER, u.ctx, u.res.rB, { active: false }] },
        ...oil.map((id, k) => mvCall(u, id, { dateStr: DS2, startMin: 1080, staffId: u.staff[k], resourceId: u.res.rB }, exs[k], undefined, "mv")),
      ];
      const outs = await fan(`s4d-${r}`, spread(calls));
      const off = outs.find((o) => o.tag === "off");
      const mv = okOf(outs, "move").length;
      const rb = (await q(`SELECT active FROM "SvcResource" WHERE id = $1`, [u.res.rB]))[0].active;
      const sw = await sweep(u.id);
      const consistent = off?.r?.ok ? mv === 0 || !rb : mv <= 1;
      rec(`S4d-${r}`, consistent && mv <= 1 && sw.length === 0 && badOf(outs).length === 0, "CRITICAL",
        "ลาก 4 ∥ ปิดใช้ห้อง B: ปิดใช้สำเร็จ ⇒ ไม่มีนัดอนาคตถือห้อง B · ลากได้ ≤ 1 · ฐานไม่ล้น", { codes: codesOf(outs), rbActive: rb, sw });
    });
    for (let r = 0; r < 2; r++) await step(`S4m-${r}`, async () => {
      const u = U[`S4m${r}`];
      const oil: string[] = [];
      for (let k = 0; k < 8; k++) oil.push(await bookOk(u, "OIL", k, DS, 600 + (k % 4) * 75));
      const exs = await Promise.all(oil.map(expOf));
      const win = [{ startAt: at(DS, 900).toISOString(), endAt: at(DS, 1020).toISOString(), note: "ปิดซ่อม S4m" }];
      const calls: Call[] = [
        { op: "resMaint", tag: "mA", a: [OWNER, u.ctx, u.res.rA, win] }, { op: "resMaint", tag: "mB", a: [OWNER, u.ctx, u.res.rB, win] },
        ...oil.map((id, k) => mvCall(u, id, { dateStr: DS, startMin: 930 + (k % 2) * 15, staffId: u.staff[k] }, exs[k], undefined, "mv")),
      ];
      const outs = await fan(`s4m-${r}`, spread(calls));
      const sw = await sweep(u.id);
      const mv = okOf(outs, "move").length;
      const mOk = okOf(outs, "resMaint").length;
      rec(`S4m-${r}`, sw.length === 0 && mv <= 2 && (mOk < 2 || mv === 0) && badOf(outs).length === 0, "CRITICAL",
        "ลาก 8 ∥ ปิดซ่อมห้อง A+B 15:00–17:00 ⇒ ไม่มีนัดทับช่วงปิดซ่อม · ปิดซ่อมสำเร็จทั้งคู่ ⇒ ลากเข้า 0", { codes: codesOf(outs), sw });
    });
    const n = await dlCheck("S4", d0);
    rec("S4-dl", n === 0, "CRITICAL", "deadlock ระหว่าง S4 = 0", { delta: n });
  }

  // ═══════════ S5 ลาก ∥ ยกเลิก/เช็กอิน/เริ่มงาน แถวเดียวกัน ═══════════
  if (want("S5")) {
    console.log("\n── S5: ลาก ∥ cancelByShop ∥ setStatus ∥ checkIn ∥ startJob ∥ runPlanner (แถวเดียว) ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 3; r++) await step(`S5-${r}`, async () => {
      const u = U[`S5r${r}`];
      const id = await bookOk(u, "OIL", 0, DS, 840);
      const now = at(DS, 830);
      const ex = await expOf(id);
      const cancelSide: Call[] = r === 0
        ? [{ op: "cancel", tag: "cancel", a: [u.ctx, id, D(now)] }, { op: "status", tag: "cancel", a: [u.tenantId, u.id, id, "CANCELLED"] }]
        : [];
      const calls: Call[] = [
        mvCall(u, id, { dateStr: DS, startMin: 960 }, ex, now, "mv"), mvCall(u, id, { dateStr: DS, startMin: 1020, staffId: u.staff[1] }, ex, now, "mv"),
        mvCall(u, id, { dateStr: DS, startMin: 930, staffId: u.staff[2] }, ex, now, "mv"), mvCall(u, id, { dateStr: DS, startMin: 1080 }, ex, now, "mv"),
        { op: "checkIn", tag: "ci", a: [u.ctx, id, D(now)] }, { op: "checkIn", tag: "ci", a: [u.ctx, id, D(now)] },
        ...(r === 2 ? [{ op: "start", tag: "start", a: [u.ctx, id, D(at(DS, 836))], delayMs: 25 } as Call] : []),
        ...cancelSide,
        { op: "plan", a: [u.ctx, D(now)] },
      ];
      const outs = await fan(`s5-${r}`, spread(calls.map((c, k) => ({ ...c, delayMs: c.delayMs ?? (k * 4 + r) % 8 }))));
      const a = await apRow(id);
      const mvOk = okOf(outs, "move");
      const keys = await evKeys(id);
      const sw = await sweep(u.id), so = await staffOverlap(u.id);
      const stOk = a.status === "CANCELLED" || (a.status === "ARRIVED" && a.checkedInAt) || a.status === "IN_SERVICE" || a.status === "CONFIRMED";
      rec(`S5-${r}`, mvOk.length <= 1 && keys.length === mvOk.length && stOk && sw.length === 0 && so.length === 0 && badOf(outs).length === 0 && offContract(outs).length === 0, "CRITICAL",
        "ลาก (expect เดียว) สำเร็จ ≤ 1 · event = จำนวนที่ลากสำเร็จ · สถานะสุดท้ายสอดคล้อง · ไม่ซ้อน · ไม่มี throw · รหัสในสัญญา", { codes: codesOf(outs), final: `${a.status} ${HM(a.startAt.getTime())} ci=${!!a.checkedInAt}`, keys: keys.length, sw, so });
    });
    // ลำดับตายตัว: เช็กอินแล้ว ⇒ ลากไม่ได้ (BAD_STATE · ไม่เขียน)
    await step("S5-seq", async () => {
      const u = U.S5r0;
      const id = await bookOk(u, "OIL", 3, DS, 1140);
      const now = at(DS, 1130);
      const ex = await expOf(id);
      const c = await LN.checkIn(u.ctx, { appointmentId: id }, { via: "STAFF", now });
      const b = await apRow(id);
      const m = await mvNow(u, id, { dateStr: DS, startMin: 1200 }, ex, now);
      const a = await apRow(id);
      rec("S5-seq", c.ok && !m.ok && m.code === "BAD_STATE" && a.updatedAt.getTime() === b.updatedAt.getTime() && (await evKeys(id)).length === 0, "MAJOR",
        "เช็กอินแล้ว (ARRIVED) ลากต่อไม่ได้ ⇒ BAD_STATE ไม่เขียน ไม่มี event", { c: c.ok ? "OK" : c.code, m });
    });
    const n = await dlCheck("S5", d0);
    rec("S5-dl", n === 0, "CRITICAL", "deadlock ระหว่าง S5 = 0", { delta: n });
  }

  // ═══════════ S6 จอเก่าหลังลูกค้าเลื่อนเอง ═══════════
  if (want("S6")) {
    console.log("\n── S6: expect เก่าหลัง rescheduleBySelf ⇒ LOST_RACE · ลูกค้าเลื่อน ∥ ร้านลาก ──");
    await step("S6-seq", async () => {
      const u = U.S6r0;
      const id = await bookOk(u, "OIL", 0, DS, 660, "ONLINE");
      const seen = await expOf(id);
      const s = await BK.rescheduleBySelf(u.ctx, id, { dateStr: DS, startMin: 780, staffId: u.staff[0] });
      if (!s.ok) throw new Error(`self ${J(s)}`);
      const b = await apRow(id);
      const m1 = await mvNow(u, id, { dateStr: DS, startMin: 900 }, seen);
      const a1 = await apRow(id);
      const m2 = await mvNow(u, id, { dateStr: DS, startMin: 900 }, await expOf(id));
      const a2 = await apRow(id);
      rec("S6-seq", !m1.ok && m1.code === "LOST_RACE" && a1.updatedAt.getTime() === b.updatedAt.getTime() && m2.ok && a2.startAt.getTime() === atMs(DS, 900), "CRITICAL",
        "ลูกค้าเลื่อนเองแล้ว ⇒ ลากจากจอเก่า LOST_RACE ไม่เขียน · โหลดใหม่แล้วลากได้", { m1, m2: m2.ok ? "OK" : m2 });
      // expect เวลาถูก แต่คนผิด (ลูกค้าย้ายคน)
      const s2 = await BK.rescheduleBySelf(u.ctx, id, { dateStr: DS, startMin: 900, staffId: u.staff[1] });
      const m3 = await mvNow(u, id, { dateStr: DS, startMin: 1020 }, { startAt: at(DS, 900).toISOString(), staffId: u.staff[0] });
      rec("S6-staff", s2.ok && !m3.ok && m3.code === "LOST_RACE", "MAJOR", "ลูกค้าย้ายคน (เวลาเดิม) ⇒ expect คนเก่า LOST_RACE", { s2: s2.ok ? "OK" : s2, m3 });
    });
    for (let r = 0; r < 2; r++) await step(`S6-${r}`, async () => {
      const u = U[`S6r${r}`];
      const id = await bookOk(u, "OIL", 2, DS2, 660, "ONLINE");
      const ex = await expOf(id);
      const calls: Call[] = [
        { op: "self", tag: "self", a: [u.ctx, id, { dateStr: DS2, startMin: 780, staffId: u.staff[2] }] },
        ...[840, 900, 960, 1020, 1080].map((m, k) => mvCall(u, id, { dateStr: DS2, startMin: m, staffId: u.staff[k % 2 === 0 ? 2 : 3] }, ex, undefined, "mv")),
      ];
      const outs = await fan(`s6-${r}`, spread(calls));
      const mv = okOf(outs, "move").length, sf = okOf(outs, "self").length;
      const keys = await evKeys(id);
      const a = await apRow(id);
      const sw = await sweep(u.id), so = await staffOverlap(u.id);
      rec(`S6-${r}`, mv <= 1 && keys.length === mv + sf && new Set(keys).size === keys.length && sw.length === 0 && so.length === 0 && badOf(outs).length === 0, "CRITICAL",
        "ลูกค้าเลื่อน ∥ ร้านลาก 5 (expect เดียว): ร้านสำเร็จ ≤ 1 · event = จำนวนสำเร็จทั้งหมด คีย์ไม่ซ้ำ · ไม่ซ้อน", { codes: codesOf(outs), final: `${HM(a.startAt.getTime())} ${a.staffId.slice(-3)}`, keys });
      if (mv === 1 && sf === 1) rec(`S6-${r}-order`, false, "INFO", "ร้านลากสำเร็จแล้วลูกค้าเลื่อนทับต่อได้ (ฝั่งลูกค้าไม่มี expect — ตามสัญญา B.7 ผู้เขียนท้ายชนะ)", { final: HM(a.startAt.getTime()) });
    });
  }

  // ═══════════ S7 event ไป-กลับ ═══════════
  if (want("S7")) {
    console.log("\n── S7: ย้ายไป-กลับ (ร้าน+ลูกค้าสลับ) ⇒ event ทุกครั้ง คีย์ไม่ซ้ำ · ล้ม ⇒ ไม่เขียน ──");
    await step("S7", async () => {
      const u = U.S7;
      const id = await bookOk(u, "OIL", 0, DS, 600, "ONLINE");
      const A = { dateStr: DS, startMin: 600 }, B = { dateStr: DS, startMin: 780 };
      const seq: [string, any][] = [["shop", B], ["shop", A], ["shop", B], ["self", A], ["shop", B], ["self", A], ["shop", B], ["shop", A], ["shop", A]];
      const got: string[] = [];
      let okN = 0;
      for (const [who, to] of seq) {
        const r = who === "shop" ? await mvNow(u, id, to, await expOf(id)) : await BK.rescheduleBySelf(u.ctx, id, { ...to, staffId: u.staff[0] });
        got.push(`${who}:${r.ok ? "OK" : r.code}`);
        if (r.ok) okN++;
      }
      const keys = await evKeys(id);
      // ร้านย้ายไปที่เดิม (A→A) — นับเป็นการย้ายที่สำเร็จ ⇒ event (INFO ถ้าไม่มี)
      rec("S7-events", keys.length === okN && new Set(keys).size === keys.length, "MAJOR",
        "ไป-กลับ A↔B (ร้าน 7 · ลูกค้า 2) ⇒ event = จำนวนครั้งที่สำเร็จ · คีย์ไม่ซ้ำ", { got, okN, keys: keys.length, uniq: new Set(keys).size });
      // ล้ม ⇒ ไม่เขียน: ห้องเต็มที่ปลายทาง
      await bookOk(u, "OIL", 1, DS, 1080); await bookOk(u, "OIL", 2, DS, 1080);
      const b = await apRow(id); const k0 = (await evKeys(id)).length; const au0 = await auditN(id);
      const f = await mvNow(u, id, { dateStr: DS, startMin: 1080 }, await expOf(id));
      const a = await apRow(id);
      rec("S7-fail", !f.ok && f.code === "FULL" && a.updatedAt.getTime() === b.updatedAt.getTime() && (await evKeys(id)).length === k0 && (await auditN(id)) === au0, "MAJOR",
        "ลากชนห้องเต็ม ⇒ FULL · แถว/outbox/audit ไม่เปลี่ยน", { f, au0 });
    });
  }

  // ═══════════ S8 ข้ามร้าน/หน่วย · สิทธิ์ · X10 ═══════════
  if (want("S8")) {
    console.log("\n── S8: ข้ามร้าน/หน่วย · สิทธิ์ก่อนขอบเขต · ข้อมูลหลุดในจอ ──");
    await step("S8", async () => {
      const u = U.S8, o = U.S8o, b = U.S8b;
      const id = await bookOk(u, "OIL", 0, DS, 600);
      const oId = await bookOk(o, "OIL", 0, DS, 600);
      const bId = await bookOk(b, "OIL", 0, DS, 600);
      const ex = await expOf(id);
      const snap = async () => J([await apRow(id), await apRow(oId), await apRow(bId)].map((x) => [x.startAt, x.staffId, x.resourceId, x.updatedAt]));
      const s0 = await snap();
      const to = { dateStr: DS, startMin: 900 };
      const cases: [string, Promise<any>, string][] = [
        ["apptOtherUnit", CL.moveAppointment(OWNER, u.ctx, oId, to, { expect: await expOf(oId) }), "NOT_FOUND"],
        ["apptOtherTenant", CL.moveAppointment(OWNER, u.ctx, bId, to, { expect: await expOf(bId) }), "NOT_FOUND"],
        ["apptMissing", CL.moveAppointment(OWNER, u.ctx, "nope_" + RUN, to, { expect: ex }), "NOT_FOUND"],
        ["ctxMix", CL.moveAppointment(OWNER, { tenantId: ids.tA, unitId: b.id }, bId, to, { expect: await expOf(bId) }), "NOT_FOUND"],
        ["staffOtherUnit", CL.moveAppointment(OWNER, u.ctx, id, { ...to, staffId: o.staff[0] }, { expect: ex }), "NOT_FOUND"],
        ["resOtherTenant", CL.moveAppointment(OWNER, u.ctx, id, { ...to, resourceId: b.res.rA }, { expect: ex }), "NOT_FOUND"],
        ["resOtherUnit", CL.moveAppointment(OWNER, u.ctx, id, { ...to, resourceId: o.res.rA }, { expect: ex }), "NOT_FOUND"],
        ["shopStaffOther", LN.rescheduleByShop(u.ctx, id, { ...to, staffId: o.staff[0] }, { expect: ex }), "NOT_FOUND"],
        ["shopResOther", LN.rescheduleByShop(u.ctx, id, { ...to, resourceId: b.res.rA }, { expect: ex }), "NOT_FOUND"],
        ["shopCtxMix", LN.rescheduleByShop({ tenantId: ids.tB, unitId: u.id }, id, to, { expect: ex }), "NOT_FOUND"],
        ["mgrOther", CL.moveAppointment({ role: "MANAGER", unitAccess: [o.id], permissions: {}, userId: "x" }, u.ctx, id, to, { expect: ex }), "FORBIDDEN"],
        ["staffRun", CL.moveAppointment({ role: "STAFF", unitAccess: ["*"], permissions: { "booking.job.run": true, "booking.queue.operate": true, "booking.job.runAny": true }, userId: "x" }, u.ctx, id, to, { expect: ex }), "FORBIDDEN"],
        ["forbidMissing", CL.moveAppointment({ role: "STAFF", unitAccess: ["*"], permissions: {}, userId: "x" }, u.ctx, "nope_" + RUN, to, { expect: ex }), "FORBIDDEN"],
        ["forbidForeign", CL.moveAppointment({ role: "STAFF", unitAccess: ["*"], permissions: {}, userId: "x" }, u.ctx, bId, to, { expect: ex }), "FORBIDDEN"],
        ["staffResUnitOnly", CL.moveAppointment({ role: "STAFF", unitAccess: [o.id], permissions: { "booking.appointment.reschedule": true }, userId: "x" }, u.ctx, id, to, { expect: ex }), "FORBIDDEN"],
        ["bookForbidden", CL.bookForCustomer({ role: "STAFF", unitAccess: ["*"], permissions: { "booking.appointment.reschedule": true }, userId: "x" }, u.ctx, bkIn(u, "OIL", 1, DS, 900) as any), "FORBIDDEN"],
        ["bookOtherUnitSvc", CL.bookForCustomer(OWNER, u.ctx, { ...bkIn(o, "OIL", 1, DS, 900), staffId: o.staff[1] } as any), "*NOT_OK"],
      ];
      const out: Record<string, string> = {}; const bad: string[] = [];
      const msgs = new Set<string>();
      for (const [k, p, want] of cases) {
        const r = await p;
        out[k] = r.ok ? "OK" : r.code;
        if (want === "*NOT_OK" ? r.ok : r.ok || r.code !== want) bad.push(`${k}=${out[k]} (ต้อง ${want})`);
        if (["apptOtherUnit", "apptOtherTenant", "apptMissing"].includes(k)) msgs.add(r.reason);
      }
      const s1 = await snap();
      rec("S8-x1", bad.length === 0 && s1 === s0, "CRITICAL", "ข้ามร้าน/หน่วย ⇒ NOT_FOUND · สิทธิ์ไม่พอ ⇒ FORBIDDEN ก่อนแตะแถว · ไม่มีแถวใดถูกเขียน", { bad, out, unchanged: s1 === s0 });
      rec("S8-msg", msgs.size === 1, "MAJOR", "NOT_FOUND ข้ามหน่วย/ข้ามร้าน/ไม่มีจริง ข้อความเดียวกัน (ไม่บอกว่ามีนัด)", [...msgs]);
      const ok1 = await CL.moveAppointment({ role: "STAFF", unitAccess: [u.id], permissions: { "booking.appointment.reschedule": true }, userId: "x" }, u.ctx, id, to, { expect: ex });
      rec("S8-allow", ok1.ok, "MAJOR", "STAFF ที่มี booking.appointment.reschedule ในหน่วยนั้น ลากได้", ok1.ok ? "OK" : ok1);
      // loadCalendar ขอบเขต + X10
      const views = [
        await CL.loadCalendar(u.ctx, OWNER, { dateStr: DS, mode: "STAFF" }),
        await CL.loadCalendar(u.ctx, OWNER, { dateStr: DS, mode: "RESOURCE", apptId: bId }),
        await CL.loadCalendar(u.ctx, OWNER, { dateStr: DS, range: "WEEK", mode: "STAFF", focusId: o.staff[0], apptId: oId }),
        await CL.loadCalendar(u.ctx, OWNER, { dateStr: DS, range: "WEEK", mode: "RESOURCE", focusId: b.res.rA, apptId: id }),
      ];
      const nulls = [
        await CL.loadCalendar({ tenantId: ids.tA, unitId: b.id }, OWNER, { dateStr: DS }),
        await CL.loadCalendar({ tenantId: ids.tB, unitId: u.id }, OWNER, { dateStr: DS }),
        await CL.loadCalendar(u.ctx, { role: "MANAGER", unitAccess: [o.id], permissions: {}, userId: "x" }, { dateStr: DS }),
        await CL.loadCalendar(u.ctx, OWNER, { dateStr: "2031-02-30" }),
      ];
      const all = J(views);
      const foreign = [oId, bId, ...o.staff, ...b.staff, ...Object.values(o.res), ...Object.values(b.res)].filter((x) => all.includes(x));
      const phones = (await q(`SELECT "customerPhone" AS p FROM "Appointment" WHERE "unitId" = ANY($1::text[])`, [[u.id, o.id, b.id]])).map((r) => String(r.p));
      const leak = [...phones.filter((p) => all.includes(p)), ...["policySnapshot", "idempotencyKey", "partyId", "customerId", "manageToken", "customerPhone", "@qc.invalid"].filter((k) => all.includes(k))];
      rec("S8-view", views.every(Boolean) && nulls.every((x) => x === null) && foreign.length === 0 && views[1].card === null && views[2].focusId !== o.staff[0] && views[3].focusId !== b.res.rA, "CRITICAL",
        "loadCalendar: ctx ผสม/ร้านอื่น/ผู้จัดการหน่วยอื่น/วันไม่จริง ⇒ null · focusId/apptId ของหน่วยอื่นไม่โผล่ · ไม่มี id หน่วยอื่นใน view", { nulls: nulls.map((x) => x === null), foreign, card1: views[1]?.card?.appointmentId ?? null });
      rec("S8-x10", leak.length === 0, "MAJOR", "X10: view ไม่มีเบอร์/policySnapshot/idempotencyKey/partyId/customerId/token/อีเมล", leak);
    });
  }

  // ═══════════ S9 คนลา ═══════════
  if (want("S9")) {
    console.log("\n── S9: ลากเข้าคนลา ⇒ ON_LEAVE · คอลัมน์ลายังแสดงนัดค้าง ──");
    await step("S9", async () => {
      const u = U.S9;
      const leaveStaffNo = 3;
      const onLeaveAppt = await bookOk(u, "OIL", leaveStaffNo, DS, 720); // จองก่อนอนุมัติลา (นัดค้าง)
      const sys = T("hr"), emp = T("emp"), emp2 = T("emp2");
      await insertRow("AppSystem", { id: sys, tenantId: ids.tA, type: "HR", name: "ทีม PR", updatedAt: new Date() });
      await insertRow("HrEmployee", { id: emp, tenantId: ids.tA, systemId: sys, name: "หมอลา", updatedAt: new Date() });
      await insertRow("HrEmployee", { id: emp2, tenantId: ids.tA, systemId: sys, name: "หมอลาพรุ่งนี้", updatedAt: new Date() });
      await q(`UPDATE "BookingStaff" SET "employeeId" = $1 WHERE id = $2`, [emp, u.staff[leaveStaffNo]]);
      await q(`UPDATE "BookingStaff" SET "employeeId" = $1 WHERE id = $2`, [emp2, u.staff[2]]);
      await insertRow("HrLeave", { id: rid("lv"), tenantId: ids.tA, systemId: sys, employeeId: emp, type: "VACATION", fromDate: DS, toDate: DS, status: "APPROVED" });
      await insertRow("HrLeave", { id: rid("lv"), tenantId: ids.tA, systemId: sys, employeeId: emp2, type: "VACATION", fromDate: DS2, toDate: DS2, status: "APPROVED" });
      const a0 = await bookOk(u, "OIL", 0, DS, 600);
      const b0 = await apRow(a0);
      const r1 = await mvNow(u, a0, { dateStr: DS, startMin: 900, staffId: u.staff[leaveStaffNo] }, await expOf(a0));
      const r2 = await mvNow(u, onLeaveAppt, { dateStr: DS, startMin: 960 }, await expOf(onLeaveAppt));
      const r3 = await mvNow(u, onLeaveAppt, { dateStr: DS, startMin: 960, staffId: u.staff[1] }, await expOf(onLeaveAppt));
      const a2 = await bookOk(u, "OIL", 2, DS, 1020);
      const r4 = await mvNow(u, a2, { dateStr: DS2, startMin: 1020 }, await expOf(a2));
      const v = await CL.loadCalendar(u.ctx, OWNER, { dateStr: DS, mode: "STAFF" });
      const col = v?.columns.find((c: any) => c.id === u.staff[leaveStaffNo]);
      const ap = await apRow(a0);
      rec("S9-leave", !r1.ok && r1.code === "ON_LEAVE" && ap.updatedAt.getTime() === b0.updatedAt.getTime() && !r2.ok && r2.code === "ON_LEAVE" && r3.ok && !r4.ok && r4.code === "ON_LEAVE", "MAJOR",
        "ลากเข้าคนลา ⇒ ON_LEAVE ไม่เขียน · ย้ายนัดค้างของคนลาในคนเดิม ⇒ ON_LEAVE · ไปคนอื่นได้ · ข้ามไปวันที่คนนั้นลา ⇒ ON_LEAVE", { r1: r1.code ?? "OK", r2: r2.code ?? "OK", r3: r3.ok ? "OK" : r3, r4: r4.code ?? "OK" });
      rec("S9-col", col?.closed?.code === "LEAVE" && /ลา/.test(col?.closed?.reasonTh ?? "") && v.summary.staffOnLeave === 1, "MINOR", "คอลัมน์คนลา closed LEAVE (ป้ายมี 'ลา') · summary.staffOnLeave 1", { closed: col?.closed, blocks: col?.blocks?.length, sum: v?.summary });
    });
  }

  // ═══════════ S10 นัดคู่ (ห้องคู่ จุ 2) · groupId ═══════════
  if (want("S10")) {
    console.log("\n── S10: ห้องคู่ จุ 2 · นัดคู่ groupId ──");
    await step("S10", async () => {
      const u = U.S10;
      const c1 = await bookOk(u, "CPL", 0, DS, 840), c2 = await bookOk(u, "CPL", 1, DS, 840);
      const gid = T("grp");
      await q(`UPDATE "Appointment" SET "groupId" = $1 WHERE id = ANY($2::text[])`, [gid, [c1, c2]]);
      await bookOk(u, "CPL", 2, DS, 1020); // ห้องคู่ 17:00 ถือแล้ว 1/2
      const others: string[] = [];
      for (let k = 3; k < 6; k++) others.push(await bookOk(u, "CPL", k, DS, k === 5 ? 720 : 600));
      // ร้านลาก 3 นัด (คนละหมอ) ไป 17:00 พร้อมกัน ⇒ ได้ 1 (จุ 2 ถือแล้ว 1)
      const exs = await Promise.all(others.map(expOf));
      const outs = await fan("s10", spread(others.map((id, k) => mvCall(u, id, { dateStr: DS, startMin: 1020 }, exs[k], undefined, "mv")), 3));
      const sw = await sweep(u.id);
      rec("S10-cap", okOf(outs).length === 1 && sw.length === 0 && badOf(outs).length === 0, "CRITICAL", "ห้องคู่จุ 2 (ถือแล้ว 1) ⇒ ลาก 3 ทางเข้าได้ 1 · ฐานไม่ล้น", { codes: codesOf(outs), sw });
      const m = await mvNow(u, c1, { dateStr: DS, startMin: 1140 }, await expOf(c1));
      const a1 = await apRow(c1), a2 = await apRow(c2);
      rec("S10-group", false, "INFO", "นัดที่มี groupId เดียวกัน: ลากตัวเดียวย้ายตัวเดียว (ระบบจองยังไม่มีความหมายของ groupId — booking ไม่เขียน groupId ที่ใด)", { move: m.ok ? "OK" : m.code, c1: HM(a1.startAt.getTime()), c2: HM(a2.startAt.getTime()) });
    });
  }

  // ═══════════ S11 ด่านคน J5: ลาก = จองช่อง STAFF (วันนี้ · ARRIVED/IN_SERVICE/buffer) ═══════════
  if (want("S11")) {
    console.log("\n── S11: parity ด่านคน ลากย้าย vs bookAppointment STAFF (วันนี้ · now จริง) ──");
    await step("S11", async () => {
      const u = U.S11;
      const nowMs = Date.now();
      const base = Math.ceil((bkkMin(nowMs) + 5) / 5) * 5;
      if (base + 330 > 1440 - 60) { rec("S11", false, "INFO", "ข้าม: เวลาไทยใกล้เที่ยงคืน", { base }); return; }
      const td = TODAY;
      // หมอ 0: walk-in กำลังทำ (เริ่มตอนนี้) · นัดมาถึงแล้ว (ARRIVED) · นัดมี buffer
      const w = await LN.createWalkIn(u.ctx, { serviceId: u.svc.PLAIN, staffId: u.staff[0], channel: "STAFF" }, { now: new Date(nowMs) });
      if (!w.ok) throw new Error(`walkIn ${J(w)}`);
      const wid = w.appointmentId ?? w.id;
      const st = await LN.startJob(u.ctx, wid, { now: new Date(nowMs) });
      const arr = await bookOk(u, "PLAIN", 0, td, base + 75); // หลังงานกำลังทำ (ARRIVED มาก่อนเวลา)
      const ci = await LN.checkIn(u.ctx, { appointmentId: arr }, { via: "STAFF", now: new Date(nowMs) });
      await bookOk(u, "BUF", 0, td, base + 200);
      await RN.runPlanner(u.ctx, { now: new Date(nowMs) });
      const mover = await bookOk(u, "PLAIN", 1, td, base + 360);
      const orig = { dateStr: td, startMin: base + 360, staffId: u.staff[1] };
      const diff: string[] = []; const seen: string[] = [];
      for (let t = base + 5; t <= base + 300; t += 10) {
        const ex = await expOf(mover);
        const m = await mvNow(u, mover, { dateStr: td, startMin: t, staffId: u.staff[0] }, ex);
        if (m.ok) { const back = await mvNow(u, mover, orig, await expOf(mover)); if (!back.ok) throw new Error(`ย้ายกลับไม่ได้ ${J(back)}`); }
        const b = await BK.bookAppointment(u.ctx, bkIn(u, "PLAIN", 0, td, t));
        if (b.ok) { const c = await BK.setAppointmentStatus(u.tenantId, u.id, b.id, "CANCELLED"); if (!c.ok) throw new Error(`ยกเลิก ${J(c)}`); }
        const mv = m.ok ? "OK" : m.code, bk = b.ok ? "OK" : b.code;
        seen.push(`${HM(atMs(td, t))}:${mv}/${bk}`);
        if ((mv === "OK") !== (bk === "OK")) diff.push(`${HM(atMs(td, t))} ลาก=${mv} จอง=${bk}`);
      }
      rec("S11-j5", diff.length === 0 && st.ok && ci.ok, "MAJOR", "ด่านคน: ลากย้ายไปหมอที่มีงานกำลังทำ/ลูกค้ามาถึง/นัดมี buffer ได้ผลเท่าจองช่อง STAFF ทุกช่อง (สูตรเดียว J5)", { diff, st: st.ok, ci: ci.ok ? "OK" : ci.code, seen: seen.join(" ") });
    });
  }

  // ═══════════ S12 ห้องที่ระบุ: ชนิด/ปิดใช้/ห้องที่ถือถูกปิดใช้ · LATE ═══════════
  if (want("S12")) {
    console.log("\n── S12: resourceId ผิดชนิด/ปิดใช้ · ห้องเดิมถูกปิดใช้ · LATE ⇒ CONFIRMED ──");
    await step("S12", async () => {
      const u = U.S12;
      const oil = await bookOk(u, "OIL", 0, DS, 600), plain = await bookOk(u, "PLAIN", 1, DS, 600);
      const r1 = await mvNow(u, oil, { dateStr: DS, startMin: 720, resourceId: u.res.bed }, await expOf(oil));
      const r2 = await mvNow(u, oil, { dateStr: DS, startMin: 720, resourceId: u.res.rOld }, await expOf(oil));
      const r3 = await mvNow(u, plain, { dateStr: DS, startMin: 720, resourceId: u.res.rA }, await expOf(plain));
      rec("S12-input", r1.code === "BAD_INPUT" && r2.code === "NOT_FOUND" && r3.code === "BAD_INPUT", "MINOR", "ห้องผิดชนิด ⇒ BAD_INPUT · ห้องปิดใช้ ⇒ NOT_FOUND · บริการไม่ใช้ห้องแต่ระบุห้อง ⇒ BAD_INPUT", { r1: r1.code ?? "OK", r2: r2.code ?? "OK", r3: r3.code ?? "OK" });
      const held = resIdsOf(await apRow(oil))[0];
      await q(`UPDATE "SvcResource" SET active = false WHERE id = $1`, [held]); // ปิดใช้ห้องที่นัดถือ (แบบข้อมูลเก่า/แก้ตรง)
      const r4 = await mvNow(u, oil, { dateStr: DS, startMin: 780 }, await expOf(oil));
      const now4 = resIdsOf(await apRow(oil));
      rec("S12-inactiveHeld", (r4.ok && !now4.includes(held)) || (!r4.ok && r4.code === "FULL"), "MAJOR", "ห้องที่นัดถืออยู่ถูกปิดใช้ ⇒ ลากแล้วต้องได้ห้องอื่น (หรือ FULL) ไม่คงห้องที่ปิดใช้", { r4: r4.ok ? "OK" : r4.code, held: held.slice(-16, -9), now: now4.map((x) => x.slice(-16, -9)) });
      await q(`UPDATE "SvcResource" SET active = true WHERE id = $1`, [held]);
      const late = await bookOk(u, "OIL", 2, DS, 900);
      await q(`UPDATE "Appointment" SET status = 'LATE', "lateAt" = now() WHERE id = $1`, [late]);
      const r5 = await mvNow(u, late, { dateStr: DS, startMin: 960 }, await expOf(late));
      const al = await apRow(late);
      rec("S12-late", r5.ok && al.status === "CONFIRMED" && al.lateAt === null, "MINOR", "LATE ลากได้ ⇒ CONFIRMED + lateAt null", { r5: r5.ok ? "OK" : r5, st: al.status });
      // expect รูปผิด
      const r6 = await mvNow(u, late, { dateStr: DS, startMin: 1000 }, { startAt: "not-a-date", staffId: u.staff[2] } as any);
      const r7 = await CL.moveAppointment(OWNER, u.ctx, late, { dateStr: DS, startMin: 1000 }, {} as any);
      rec("S12-expect", r6.code === "BAD_INPUT" && r7.code === "BAD_INPUT", "MINOR", "expect ผิดรูป/ไม่ส่ง ⇒ BAD_INPUT", { r6: r6.code ?? "OK", r7: r7.code ?? "OK" });
    });
  }

  // ═══════════ S13 perf สัปดาห์งานแน่น ═══════════
  if (want("S13")) {
    console.log("\n── S13: perf loadCalendar สัปดาห์แน่น (12 หมอ × 7 วัน × 9 งาน) ──");
    await step("S13", async () => {
      const u = U.S13;
      const mon = (() => { const [y, m, d] = DS.split("-").map(Number); const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return addDays(DS, -((wd + 6) % 7)); })();
      const rooms = Object.values(u.res);
      let n = 0;
      const vals: string[] = []; const params: unknown[] = [];
      for (let d = 0; d < 7; d++) for (let s = 0; s < 12; s++) for (let k = 0; k < 9; k++) {
        const ds = addDays(mon, d); const st = at(ds, 600 + k * 70); const en = new Date(st.getTime() + 60 * MIN);
        const isOil = (s + k) % 2 === 0; const room = rooms[Math.floor(s / 2)];
        const p = params.length;
        vals.push(`($${p + 1},$${p + 2},$${p + 3},$${p + 4},$${p + 5},$${p + 6},$${p + 7},$${p + 8},$${p + 9},$${p + 10},$${p + 11},now())`);
        params.push(rid("ap"), ids.tA, u.id, u.staff[s], isOil ? u.svc.OIL : u.svc.PLAIN, st, en, `ลูกค้า ${n}`, newPhone(), isOil ? room : null, JSON.stringify(isOil ? { job: { durationMin: 60, bufferMin: 0, resourceIds: [room] } } : {}));
        n++;
      }
      for (let i = 0; i < vals.length; i += 200) {
        const chunk = vals.slice(i, i + 200);
        const off = i * 11;
        const ps = params.slice(off, off + chunk.length * 11);
        const re = chunk.map((_, j) => `($${j * 11 + 1},$${j * 11 + 2},$${j * 11 + 3},$${j * 11 + 4},$${j * 11 + 5},$${j * 11 + 6},$${j * 11 + 7},$${j * 11 + 8},$${j * 11 + 9},$${j * 11 + 10},$${j * 11 + 11}::jsonb,now())`);
        await pool.query(`INSERT INTO "Appointment" (id, "tenantId", "unitId", "staffId", "serviceId", "startAt", "endAt", "customerName", "customerPhone", "resourceId", "policySnapshot", "updatedAt") VALUES ${re.join(",")}`, ps);
      }
      const runs: Record<string, number[]> = {};
      const modes: [string, any][] = [["DAY_STAFF", { mode: "STAFF" }], ["DAY_RES", { mode: "RESOURCE" }], ["WEEK_STAFF", { range: "WEEK", mode: "STAFF", focusId: u.staff[0] }], ["WEEK_RES", { range: "WEEK", mode: "RESOURCE", focusId: rooms[0] }]];
      let dayBlocks = -1;
      for (const [k, o] of modes) {
        runs[k] = [];
        for (let i = 0; i < 3; i++) { const t0 = performance.now(); const v = await CL.loadCalendar(u.ctx, OWNER, { dateStr: DS, ...o }); runs[k].push(Math.round(performance.now() - t0)); if (k === "DAY_STAFF") dayBlocks = v.columns.reduce((s: number, c: any) => s + c.blocks.length, 0); }
      }
      const med = Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, [...v].sort((a, b) => a - b)[1]]));
      const worst = Math.max(...Object.values(med));
      rec("S13-perf", worst < 2500 && dayBlocks === 12 * 9, "MINOR", `loadCalendar ${n} นัด/สัปดาห์: median ทุกมุม < 2.5 วิ · DAY STAFF บล็อก = 108`, { med, runs, dayBlocks });
    });
  }

  const dlEndAll = await dlSettled();
  dlNotes.push(`all:${dlEndAll - d0all}`);
  rec("DL-all", dlEndAll - d0all === 0, "CRITICAL", "deadlock ของฐานตลอด probe = 0 (ลำดับล็อก สาขา → ช่าง → SvcResource → แถวนัด)", { delta: dlEndAll - d0all });

  await step("INV", async () => {
    const bad: string[] = []; const so: string[] = [];
    for (const u of units) { const s = await sweep(u.id); if (s.length) bad.push(`${u.key}: ${s.slice(0, 2).join(" · ")}`); const o = await staffOverlap(u.id); if (o.length && u.key !== "S13") so.push(`${u.key}: ${o.slice(0, 2).join(" · ")}`); }
    rec("INV-all", bad.length === 0 && so.length === 0, "CRITICAL", `SQL sweep ทุกหน่วย (${units.length}): ห้องไม่เกินความจุ · ไม่ทับปิดซ่อม · ชนิดตรง · ไม่ถือของหน่วยอื่น · หมอไม่ซ้อน`, { res: bad, staff: so });
  });
} catch (e) {
  rec("FATAL", false, "ERR", "probe ล้ม", errMsg(e));
} finally {
  let dlEnd = NaN;
  try { dlEnd = await readDeadlocks(); } catch { /* */ }
  for (const f of goFiles) { try { unlinkSync(f); } catch { /* */ } }
  try { await cleanup(TIDS); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  const left = (await q(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n;
  console.log(`\n(ล้างข้อมูลแล้ว · ร้านค้าง ${left} · deadlock ฐาน start ${dlStart} → end ${dlEnd} · ต่อกลุ่ม ${dlNotes.join(" ")})`);
  const br = results.filter((r) => !r.ok && r.sev !== "INFO");
  console.log(`\n══ สรุป: ${results.filter((r) => r.ok).length} HOLD · ${br.length} BREACH/ERR ══`);
  for (const r of br) console.log(`  ❌ [${r.id}] (${r.sev}) ${r.what} — ${r.detail.slice(0, 700)}`);
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, hold: results.filter((r) => r.ok).length, breach: br.map((r) => `${r.id}(${r.sev})`), info: results.filter((r) => !r.ok && r.sev === "INFO").map((r) => r.id), deadlocks: dlNotes, cleanupLeft: left })}`);
  await pool.end();
  try { await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}
