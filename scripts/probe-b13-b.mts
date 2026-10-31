// PROBE — SVC B.13 reviewer B (หลายโพรเซส · ทรัพยากรร้านนวด) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b13-b.mts
// ข้อมูลใต้ร้าน slug `qc-svc-b13pb-*` + ผู้ใช้ `qc-svc-b13pb-*@qc.invalid` · ล้างใน finally ทุกครั้ง (+ กวาดค้างตอนเริ่ม)
// env: PROBE_B13_FUZZ_N (ค่าเริ่ม 20000) · PROBE_B13_ONLY=P1,P7 (รันเฉพาะกลุ่ม)
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

// ═══════════ โหมดลูก ═══════════
type Call = { op: string; a: any[]; delayMs?: number };
const goFile = (run: string, key: string) => `/tmp/probe-b13b-go-${run}-${key}`;
const slim = (r: any) => (r && typeof r === "object" ? {
  ok: r.ok, code: r.code ?? null, id: r.id ?? r.appointmentId ?? null,
  planned: r.plannedStartAt ? new Date(r.plannedStartAt).toISOString() : null,
  reason: typeof r.reason === "string" ? r.reason.slice(0, 70) : null,
} : r);
async function runOp(c: Call): Promise<any> {
  const t0 = Date.now();
  if (c.delayMs) await sleep(c.delayMs);
  const a = c.a.map((x) => (x && typeof x === "object" && typeof x.__date === "string" ? new Date(x.__date) : x));
  try {
    const BK = await BKm(), LN = await LNm(), RN = await RNm(), RS = await RSm();
    let r: any;
    if (c.op === "book") r = await BK.bookAppointment(a[0], a[1]);
    else if (c.op === "create") { const x = await BK.createAppointment(a[0]); r = x.ok ? x : { ...x, code: "LEGACY_FAIL" }; }
    else if (c.op === "walkIn") r = await LN.createWalkIn(a[0], { serviceId: a[1], staffId: a[2], channel: "STAFF" }, { now: a[3] });
    else if (c.op === "checkIn") { const x = await LN.checkIn(a[0], { appointmentId: a[1] }, { via: "STAFF", now: a[2] }); r = { ...x, id: a[1] }; }
    else if (c.op === "plan") { for (let k = 0; k < a[2]; k++) await RN.runPlanner(a[0], { now: a[1] }); r = { ok: true }; }
    else if (c.op === "rShop") { const x = await LN.rescheduleByShop(a[0], a[1], { dateStr: a[2], startMin: a[3] }, a[4] ? { now: a[4] } : undefined); r = { ...x, id: a[1] }; }
    else if (c.op === "rSelf") { const x = await BK.rescheduleBySelf(a[0], a[1], { dateStr: a[2], startMin: a[3], staffId: a[4] }, a[5] ? { now: a[5] } : undefined); r = { ...x, id: a[1] }; }
    else if (c.op === "status") { const x = await BK.setAppointmentStatus(a[0], a[1], a[2], a[3]); r = { ...x, code: x.ok ? null : "STATUS_FAIL", id: a[2] }; }
    else if (c.op === "start") { const x = await LN.startJob(a[0], a[1], { now: a[2] }); r = { ...x, id: a[1] }; }
    else if (c.op === "resUpd") r = await RS.updateResource(a[0], a[1], a[2], a[3]);
    else if (c.op === "resMaint") r = await RS.setResourceMaintenance(a[0], a[1], a[2], a[3]);
    else if (c.op === "tick") { const x = await RN.runLineTick(a[0], { tenantIds: a[1] }); r = { ok: true, code: null, reason: J(x) }; }
    else if (c.op === "bookSeq") {
      const codes: string[] = [];
      for (const inp of a[1] as any[]) { try { const x = await BK.bookAppointment(a[0], inp); codes.push(x.ok ? "OK" : x.code); } catch (e) { codes.push(`THREW:${errMsg(e).slice(0, 60)}`); } }
      r = { ok: true, code: null, reason: codes.join(",") };
    } else if (c.op === "flip") {
      const codes: string[] = [];
      for (let k = 0; k < a[3]; k++) { const x = await RS.updateResource(a[0], a[1], a[2], { sortOrder: k % 2 ? a[4] : a[5] }); codes.push(x.ok ? "OK" : x.code); }
      r = { ok: true, code: null, reason: codes.join(",") };
    } else r = { unknownOp: c.op };
    return { op: c.op, r: slim(r), ms: Date.now() - t0 };
  } catch (e) {
    return { op: c.op, threw: errMsg(e), ms: Date.now() - t0 };
  }
}

if (process.env.PROBE_B13B_CHILD) {
  const spec = JSON.parse(process.env.PROBE_B13B_CHILD) as { run: string; key: string; calls: Call[] };
  try {
    const { prisma } = await import("@/lib/core/db" as string);
    await prisma.$queryRawUnsafe("SELECT 1");
    await BKm(); await LNm(); await RNm(); await RSm();
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
const LOG = `/tmp/probe-b13-b.out.${process.pid}.log`;
{
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...x: unknown[]) => { try { appendFileSync(LOG, `${x.map((y) => (typeof y === "string" ? y : J(y))).join(" ")}\n`); } catch { /* */ } try { orig(...x); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}
const ONLY = new Set((process.env.PROBE_B13_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const want = (g: string) => ONLY.size === 0 || ONLY.has(g);
const RUN = Date.now().toString(36);
const goFiles: string[] = [];
async function fan(key: string, perChild: Call[][], envExtra: Record<string, string> = {}): Promise<any[]> {
  const n = perChild.length;
  const ready = new Set<number>(); const res = new Map<number, any[]>(); const dead = new Set<number>(); const errs: string[] = [];
  const kids = perChild.map((calls, idx) => {
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, ...envExtra, PROBE_B13B_CHILD: JSON.stringify({ run: RUN, key, calls }) }, stdio: ["ignore", "pipe", "pipe"] });
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
const codesOf = (outs: any[]) => outs.map((o) => `${o.op}:${o.threw ? "THREW " + o.threw.slice(0, 60) : o.r?.ok ? "OK" : o.r?.code ?? "FAIL"}`);
const step = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { rec(id, false, "ERR", "probe ล้มเอง (ไม่ใช่ผลตัดสิน)", errMsg(e)); } };

// ═══════════ ฐาน ═══════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => (await pool.query(sql, p)).rows;
const colCache = new Map<string, any[]>();
const rid = (p: string) => `b13pb_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
const SLUG = "qc-svc-b13pb-";
const MAIL = "qc-svc-b13pb-";
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
const DS = addDays(TODAY, 6);       // วันทดสอบหลัก (ทุกฉากแยกหน่วย)
const DS2 = addDays(TODAY, 7);      // วันถัดไป (ข้ามเที่ยงคืน)
const atMs = (ds: string, min: number) => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * MIN; };
const at = (ds: string, min: number) => new Date(atMs(ds, min));
const D = (d: Date) => ({ __date: d.toISOString() });
const HM = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16);

// ═══════════ fixtures ═══════════
const T = (k: string) => `b13pb_${k}_${RUN}`;
const ids = { tA: T("tA"), tB: T("tB"), tC: T("tC"), owner: T("owner"), clerk: T("clerk") };
const TIDS = [ids.tA, ids.tB, ids.tC];
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
type ResSpec = { key: string; kind: string; sortOrder: number; cleanup: number; cap?: number };
type SvcSpec = { key: string; dur: number; kinds?: string[]; buffer?: number };
type Unit = { key: string; tenantId: string; id: string; ctx: { tenantId: string; unitId: string }; staff: string[]; svc: Record<string, string>; res: Record<string, string>; kinds: Map<string, string[]> };
const units: Unit[] = [];
let ord = 0;
let phoneN = 0;
const newPhone = () => `08${String(62_000_000 + Math.floor(Math.random() * 700_000) * 10 + ++phoneN).slice(-8)}`;
async function mkUnit(key: string, o: { tenant?: string; staffN: number; res: ResSpec[]; svcs: SvcSpec[]; hours?: [number, number] }): Promise<Unit> {
  const tenantId = o.tenant ?? ids.tA;
  const id = T(`u_${key}`);
  await insertRow("BusinessUnit", { id, tenantId, type: "BOOKING", name: `pb ${key}`, slug: `b13pb-${key.toLowerCase()}-${RUN}`, updatedAt: new Date() });
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
    await insertRow("BookingService", { id: sid, tenantId, unitId: id, name: `${s.key} ${s.dur}`, durationMin: s.dur, priceSatang: 50000, bufferMin: s.buffer ?? 0, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
    svc[s.key] = sid; kinds.set(sid, s.kinds ?? []);
  }
  const res: Record<string, string> = {};
  for (const r of o.res) {
    const rr = T(`${key}_${r.key}`);
    await insertRow("SvcResource", { id: rr, tenantId, unitId: id, kind: r.kind, name: `${r.key}`, capacity: r.cap ?? 1, cleanupMin: r.cleanup, active: true, sortOrder: r.sortOrder, createdAt: new Date(Date.now() - 900_000 + ++ord * 1000), updatedAt: new Date() });
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
const SET: any = await import("@/lib/core/settings" as string);
const PL: any = await import("@/lib/modules/booking/planner" as string);

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

// ═══════════ ตัวกวาด invariant (SQL) ═══════════
type Occ = { id: string; s: number; e: number; ps: number; pe: number };
async function holdsOf(unitId: string): Promise<{ res: any[]; occ: Map<string, Occ[]>; blocks: Map<string, { s: number; e: number }[]>; bad: string[] }> {
  const res = await q(`SELECT id, kind, capacity, "cleanupMin", active FROM "SvcResource" WHERE "unitId" = $1`, [unitId]);
  const rows = await q(`SELECT a.id, a.status::text AS status, a."serviceId", a."startAt", a."endAt", a."resourceId", a."plannedStartAt", a."startedAt", a."policySnapshot", s."bufferMin", a."tenantId"
    FROM "Appointment" a JOIN "BookingService" s ON s.id = a."serviceId" WHERE a."unitId" = $1 AND a.status::text NOT IN ('CANCELLED','NO_SHOW','DONE')`, [unitId]);
  const bl = await q(`SELECT "resourceId", "startAt", "endAt" FROM "SvcResourceBlock" WHERE "unitId" = $1`, [unitId]);
  const blocks = new Map<string, { s: number; e: number }[]>();
  for (const b of bl) blocks.set(b.resourceId, [...(blocks.get(b.resourceId) ?? []), { s: b.startAt.getTime(), e: b.endAt ? b.endAt.getTime() : Number.MAX_SAFE_INTEGER }]);
  const occ = new Map<string, Occ[]>(res.map((r) => [r.id, []]));
  const bad: string[] = [];
  const u = units.find((x) => x.id === unitId);
  for (const a of rows) {
    const job = a.policySnapshot?.job ?? {};
    const rids: string[] = Array.isArray(job.resourceIds) ? job.resourceIds : a.resourceId ? [a.resourceId] : [];
    const s = a.startAt.getTime();
    const dur = typeof job.durationMin === "number" ? job.durationMin * MIN : a.endAt.getTime() - s - (job.bufferMin ?? a.bufferMin) * MIN;
    // มติผู้คุม Q1 (31 ต.ค.): เริ่ม = IN_SERVICE ⇒ startedAt · อื่น ⇒ plannedStartAt ?? startAt · ปลาย = เริ่ม + นาที (ไม่ยืดถึง now)
    void s;
    const st0 = a.status === "IN_SERVICE" ? (a.startedAt ?? a.plannedStartAt ?? a.startAt).getTime() : (a.plannedStartAt ?? a.startAt).getTime();
    const e = st0 + dur;
    // physical = ใช้ห้องจริง: IN_SERVICE ที่เลยเวลายังอยู่ในห้องถึง now จริง (เฉพาะฉากวันนี้)
    const pe = a.status === "IN_SERVICE" ? Math.max(e, Date.now()) : e;
    const need = u?.kinds.get(a.serviceId) ?? [];
    if (need.length && rids.length && (rids.length !== need.length || rids.some((x, k) => res.find((r) => r.id === x)?.kind !== need[k]))) bad.push(`KIND ${a.id.slice(-6)} ถือ ${J(rids.map((x) => res.find((r) => r.id === x)?.kind ?? "??"))} ต้อง ${J(need)}`);
    if (need.length && !rids.length) bad.push(`UNBOUND ${a.id.slice(-6)} ${a.status} ไม่ถือทรัพยากร`);
    for (const x of rids) {
      const r = res.find((y) => y.id === x);
      if (!r) { bad.push(`FOREIGN ${a.id.slice(-6)} ถือ ${x}`); continue; }
      occ.get(x)!.push({ id: a.id, s: st0, e: e + r.cleanupMin * MIN, ps: st0, pe: pe + r.cleanupMin * MIN });
    }
  }
  return { res, occ, blocks, bad };
}
/** contract = §4.6 (เริ่ม = startAt) · physical = เริ่มจริง min(startAt, planned, started) */
async function sweep(unitId: string): Promise<{ contract: string[]; physical: string[] }> {
  const { res, occ, blocks, bad } = await holdsOf(unitId);
  const contract = [...bad]; const physical: string[] = [];
  for (const r of res) {
    const xs = occ.get(r.id)!;
    for (const [mode, out] of [["c", contract], ["p", physical]] as const) {
      const sOf = (o: Occ) => (mode === "c" ? o.s : o.ps);
      const eOf = (o: Occ) => (mode === "c" ? o.e : o.pe);
      for (const x of xs) {
        const n = xs.filter((y) => sOf(y) <= sOf(x) && eOf(y) > sOf(x)).length;
        if (n > r.capacity) { out.push(`${r.id.slice(-10)} ซ้อน ${n} > จุ ${r.capacity} ที่ ${HM(sOf(x))}`); break; }
      }
      if (mode === "c") for (const x of xs) if ((blocks.get(r.id) ?? []).some((b) => x.s < b.e && b.s < x.e)) { out.push(`${r.id.slice(-10)} ทับปิดซ่อม ${HM(x.s)}`); break; }
      if (mode === "c" && !r.active && xs.some((x) => x.e > Date.now())) out.push(`${r.id.slice(-10)} ปิดใช้แต่ยังมีนัดถือ`);
    }
  }
  return { contract, physical };
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
const apRow = async (id: string) => (await q(`SELECT id, status::text AS status, "staffId", "startAt", "endAt", "resourceId", "plannedStartAt", "startedAt", "policySnapshot" FROM "Appointment" WHERE id = $1`, [id]))[0];

const bkIn = (u: Unit, svcKey: string, staffIdx: number | null, ds: string, min: number, channel = "STAFF", extra: Record<string, unknown> = {}) =>
  ({ serviceId: u.svc[svcKey], staffId: staffIdx === null ? null : u.staff[staffIdx], dateStr: ds, startMin: min, channel, customerName: "คุณโพรบ บีสิบสาม", customerPhone: newPhone(), idempotencyKey: rid("idem"), ...extra });
async function bookOk(u: Unit, svcKey: string, staffIdx: number | null, ds: string, min: number, channel = "STAFF"): Promise<string> {
  const r = await BK.bookAppointment(u.ctx, bkIn(u, svcKey, staffIdx, ds, min, channel));
  if (!r.ok) throw new Error(`จอง ${u.key} ${svcKey} ${HM(atMs(ds, min))} ${channel} ล้ม ${r.code} ${r.reason}`);
  if (r.status === "PENDING") { const c = await BK.setAppointmentStatus(u.tenantId, u.id, r.id, "CONFIRMED"); if (!c.ok) throw new Error(`ยืนยัน ${J(c)}`); }
  return r.id;
}
const bookCall = (u: Unit, svcKey: string, staffIdx: number | null, ds: string, min: number, channel = "STAFF"): Call => ({ op: "book", a: [u.ctx, bkIn(u, svcKey, staffIdx, ds, min, channel)] });
const createCall = (u: Unit, svcKey: string, staffIdx: number, ds: string, min: number): Call =>
  ({ op: "create", a: [{ tenantId: u.tenantId, unitId: u.id, serviceId: u.svc[svcKey], staffId: u.staff[staffIdx], dateStr: ds, startMin: min, customerName: "ทางเดิม โพรบ", customerPhone: newPhone() }] });
const ALLOWED = new Set(["FULL", "BUSY", "IN_USE", "CLASH", "WALKIN_CLOSED", "LEGACY_FAIL", "STATUS_FAIL", "LOST_RACE", "TOO_LATE"]);
const offContract = (outs: any[]) => outs.filter((o) => !o.threw && o.r && o.r.ok === false && !ALLOWED.has(o.r.code));

// ═══════════ main ═══════════
let dlStart = NaN;
const dlNotes: string[] = [];
try {
  const stale = (await q(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id as string);
  if (stale.length) { console.log(`(กวาดร้านค้าง ${stale.length})`); await cleanup(stale); }
  await cleanupUsers();
  for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"], [ids.tC, "c"]] as const) await insertRow("Tenant", { id, name: `PB B13 ${n}`, slug: `${SLUG}${n}-${RUN}`, updatedAt: new Date() });
  await insertRow("User", { id: ids.owner, email: `${MAIL}owner-${RUN}@qc.invalid`, name: "PB B13 owner", updatedAt: new Date() });
  await insertRow("User", { id: ids.clerk, email: `${MAIL}clerk-${RUN}@qc.invalid`, name: "PB B13 clerk", updatedAt: new Date() });
  for (const t of TIDS) await insertRow("Membership", { id: rid("mb"), userId: ids.owner, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });

  // ── สร้างหน่วยทุกฉาก ──
  const OILS: SvcSpec[] = [{ key: "OIL", dur: 60, kinds: ["ROOM"] }, { key: "OIL30", dur: 30, kinds: ["ROOM"] }, { key: "PLAIN", dur: 60 }];
  const room1: ResSpec[] = [{ key: "rA", kind: "ROOM", sortOrder: 1, cleanup: 15 }];
  const U: Record<string, Unit> = {};
  const mk = async (k: string, o: Parameters<typeof mkUnit>[1]) => { U[k] = await mkUnit(k, o); return U[k]; };
  for (let r = 0; r < 4; r++) await mk(`P1r${r}`, { staffN: 12, res: room1, svcs: OILS });
  for (let r = 0; r < 3; r++) await mk(`P2r${r}`, { staffN: 12, res: [{ key: "rA", kind: "ROOM", sortOrder: 1, cleanup: 15, cap: 3 }], svcs: OILS });
  for (let r = 0; r < 4; r++) await mk(`P3r${r}`, { staffN: 12, res: room1, svcs: OILS });
  const MK: ResSpec[] = [{ key: "eq", kind: "EQUIPMENT", sortOrder: 1, cleanup: 10 }, { key: "rA", kind: "ROOM", sortOrder: 2, cleanup: 15 }, { key: "rB", kind: "ROOM", sortOrder: 3, cleanup: 15 }];
  const MKS: SvcSpec[] = [{ key: "HOT", dur: 60, kinds: ["ROOM", "EQUIPMENT"] }, { key: "OIL", dur: 60, kinds: ["ROOM"] }, { key: "EQS", dur: 45, kinds: ["EQUIPMENT"] }];
  for (let r = 0; r < 4; r++) await mk(`P4r${r}`, { staffN: 12, res: MK, svcs: MKS });
  const room2: ResSpec[] = [{ key: "rA", kind: "ROOM", sortOrder: 1, cleanup: 15 }, { key: "rB", kind: "ROOM", sortOrder: 2, cleanup: 15 }];
  for (let r = 0; r < 3; r++) await mk(`P5r${r}`, { staffN: 8, res: room2, svcs: OILS });
  await mk("P5b", { staffN: 3, res: room1, svcs: OILS });
  for (const p of ["cap", "clean", "off", "kind", "maint"]) for (let r = 0; r < 2; r++) await mk(`P6${p}${r}`, { staffN: 10, res: [{ key: "rA", kind: "ROOM", sortOrder: 1, cleanup: 15, cap: p === "cap" ? 2 : 1 }], svcs: OILS });
  const room4: ResSpec[] = [1, 2, 3, 4].map((k) => ({ key: `r${k}`, kind: "ROOM", sortOrder: k, cleanup: 0 }));
  for (const k of ["P7ctl", "P7flip", "P7flip2"]) await mk(k, { staffN: 12, res: room4, svcs: OILS });
  for (let r = 0; r < 3; r++) await mk(`P8r${r}`, { tenant: ids.tC, staffN: 4, res: room1, svcs: OILS });
  await mk("P8b", { tenant: ids.tC, staffN: 3, res: room1, svcs: OILS });
  for (let r = 0; r < 3; r++) await mk(`P9r${r}`, { staffN: 4, res: [{ key: "rA", kind: "ROOM", sortOrder: 1, cleanup: 0 }], svcs: OILS });
  await mk("P10", { staffN: 3, res: room1, svcs: OILS });
  await mk("P11", { staffN: 3, res: room1, svcs: OILS });
  await mk("P12", { staffN: 6, res: [{ key: "rA", kind: "ROOM", sortOrder: 1, cleanup: 15 }, { key: "vip", kind: "COUPLE_ROOM", sortOrder: 2, cleanup: 20, cap: 2 }], svcs: [...OILS, { key: "CPL", dur: 60, kinds: ["COUPLE_ROOM"] }] });
  await mk("P13", { staffN: 4, res: room1, svcs: OILS, hours: [0, 1440] });
  await mk("P14", { staffN: 2, res: room1, svcs: OILS });
  await mk("P14o", { staffN: 2, res: room1, svcs: OILS });
  await mk("P14b", { tenant: ids.tB, staffN: 2, res: room1, svcs: OILS });
  await mk("P15", { staffN: 2, res: room1, svcs: OILS });
  await mk("P17", { staffN: 3, res: room1, svcs: OILS, hours: [0, 1440] });
  await mk("P18", { staffN: 3, res: room1, svcs: OILS });
  await finishSetup(units);
  console.log(`(fixtures พร้อม · ${units.length} หน่วย · วัน ${DS} · now จริง ${new Date().toISOString()})`);
  const dlSetup = await readDeadlocks();
  dlStart = dlSetup;
  const dlCheck = async (label: string, d0: number) => { const d1 = await dlSettled(); const n = d1 - d0; dlNotes.push(`${label}:${n}`); return { d1, n }; };

  // ═══════════ P1 ห้องเดียว 11 ทาง (จองร้าน/ออนไลน์/โทร/ทางเดิม/walk-in/ร้านเลื่อน/ลูกค้าเลื่อน/ปลุก) ⇒ 1 ═══════════
  if (want("P1")) {
    console.log("\n── P1: ห้องเดียว 11 ทาง 5 โพรเซส ⇒ ได้ 1 ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 4; r++) await step(`P1-${r}`, async () => {
      const u = U[`P1r${r}`];
      const aShop = await bookOk(u, "OIL", 9, DS, 600);
      const aSelf = await bookOk(u, "OIL", 10, DS, 1020, "ONLINE");
      const aRev = await bookOk(u, "OIL", 11, DS, 840);
      const c = await BK.setAppointmentStatus(u.tenantId, u.id, aRev, "CANCELLED"); if (!c.ok) throw new Error(`ยกเลิก ${J(c)}`);
      const now = D(at(DS, 840));
      const calls: Call[] = [
        bookCall(u, "OIL", 0, DS, 840), bookCall(u, "OIL", 1, DS, 840), bookCall(u, "OIL", 2, DS, 840, "ONLINE"), bookCall(u, "OIL", 3, DS, 840, "ONLINE"), bookCall(u, "OIL", 4, DS, 840, "PHONE"),
        createCall(u, "OIL", 5, DS, 840), createCall(u, "OIL", 6, DS, 840),
        { op: "walkIn", a: [u.ctx, u.svc.OIL, u.staff[7], now] },
        { op: "rShop", a: [u.ctx, aShop, DS, 840, null] }, // now จริง (6 วันก่อน) — now ฉีด 14:00 ⇒ PAST/LATE_CHANGE
        { op: "rSelf", a: [u.ctx, aSelf, DS, 840, u.staff[10], null] },
        { op: "status", a: [u.tenantId, u.id, aRev, "CONFIRMED"] },
      ];
      const outs = await fan(`p1-${r}`, spread(calls.map((x, k) => ({ ...x, delayMs: (k * 7 + r * 3) % 11 }))));
      const ov = await overlapCount(u.id, atMs(DS, 840), atMs(DS, 915));
      const sw = await sweep(u.id);
      const bads = badOf(outs), off = offContract(outs);
      rec(`P1-${r}`, ov === 1 && sw.contract.length === 0 && bads.length === 0 && off.length === 0 && outs.length === 11, "CRITICAL",
        "ห้องเดียว ⇒ ที่ถือห้องช่วง 14:00–15:15 = 1 พอดี · ฐานไม่ล้น · ไม่มี throw/40P01 · รหัสในสัญญา", { overlap: ov, sweep: sw.contract, codes: codesOf(outs), off: off.map((o) => o.r), bads });
    });
    const { n } = await dlCheck("P1", d0);
    rec("P1-dl", n === 0, "CRITICAL", "deadlock ของฐานระหว่าง P1 = 0", { delta: n });
  }

  // ═══════════ P2 ความจุ 3 ⇒ 3 ═══════════
  if (want("P2")) {
    console.log("\n── P2: ห้องจุ 3 · 11 ทาง ⇒ 3 พอดี ──");
    for (let r = 0; r < 3; r++) await step(`P2-${r}`, async () => {
      const u = U[`P2r${r}`];
      const aShop = await bookOk(u, "OIL", 9, DS, 600);
      const aSelf = await bookOk(u, "OIL", 10, DS, 1020, "ONLINE");
      const aRev = await bookOk(u, "OIL", 11, DS, 840);
      await BK.setAppointmentStatus(u.tenantId, u.id, aRev, "CANCELLED");
      const now = D(at(DS, 840));
      const calls: Call[] = [
        ...[0, 1, 2, 3].map((k) => bookCall(u, "OIL", k, DS, 840, k % 2 ? "ONLINE" : "STAFF")), bookCall(u, "OIL", 4, DS, 840, "PHONE"),
        createCall(u, "OIL", 5, DS, 840), createCall(u, "OIL", 6, DS, 840),
        { op: "walkIn", a: [u.ctx, u.svc.OIL, u.staff[7], now] }, { op: "rShop", a: [u.ctx, aShop, DS, 840, null] },
        { op: "rSelf", a: [u.ctx, aSelf, DS, 840, u.staff[10], null] }, { op: "status", a: [u.tenantId, u.id, aRev, "CONFIRMED"] },
      ];
      const outs = await fan(`p2-${r}`, spread(calls));
      const ov = await overlapCount(u.id, atMs(DS, 840), atMs(DS, 841));
      const sw = await sweep(u.id);
      rec(`P2-${r}`, ov === 3 && sw.contract.length === 0 && badOf(outs).length === 0 && offContract(outs).length === 0, "CRITICAL",
        "ความจุ 3 ⇒ ที่ถือ ณ 14:00 = 3 พอดี · ฐานไม่ล้น", { overlap: ov, sweep: sw.contract, codes: codesOf(outs) });
    });
  }

  // ═══════════ P3 ใครก็ได้ × ระบุหมอ × walk-in × วางคิว ═══════════
  if (want("P3")) {
    console.log("\n── P3: ANY ×5 ∥ SPECIFIC ×5 ∥ walk-in ×2 ∥ runPlanner (ห้องเดียว) ⇒ 1 · deadlock 0 ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 4; r++) await step(`P3-${r}`, async () => {
      const u = U[`P3r${r}`];
      const now = D(at(DS, 840));
      const calls: Call[] = [
        ...[0, 1, 2, 3, 4].map(() => bookCall(u, "OIL", null, DS, 840)),
        ...[5, 6, 7, 8, 9].map((k) => bookCall(u, "OIL", k, DS, 840)),
        { op: "walkIn", a: [u.ctx, u.svc.OIL, null, now] }, { op: "walkIn", a: [u.ctx, u.svc.OIL, null, now] },
        { op: "plan", a: [u.ctx, now, 3] }, { op: "plan", a: [u.ctx, now, 3] },
      ];
      const outs = await fan(`p3-${r}`, spread(calls.map((x, k) => ({ ...x, delayMs: (k * 5) % 9 }))));
      const ov = await overlapCount(u.id, atMs(DS, 840), atMs(DS, 841));
      const sw = await sweep(u.id), so = await staffOverlap(u.id);
      rec(`P3-${r}`, ov === 1 && sw.contract.length === 0 && so.length === 0 && badOf(outs).length === 0 && offContract(outs).length === 0, "CRITICAL",
        "ANY∥SPECIFIC∥walk-in∥planner ⇒ ถือห้อง ณ 14:00 = 1 · ฐานไม่ล้น · หมอไม่ซ้อน · ไม่มี throw", { overlap: ov, sweep: sw.contract, staff: so, codes: codesOf(outs) });
    });
    const { n } = await dlCheck("P3", d0);
    rec("P3-dl", n === 0, "CRITICAL", "deadlock ของฐานระหว่าง P3 = 0 (วงรอ ถือหมอ→รอห้อง ∥ ถือห้อง→รอหมอ)", { delta: n });
  }

  // ═══════════ P4 หลายชนิด (ลำดับชนิด ≠ sortOrder) ═══════════
  if (want("P4")) {
    console.log("\n── P4: หินร้อน(ห้อง+อุปกรณ์) ∥ น้ำมัน(ห้อง) ∥ อุปกรณ์ล้วน · อุปกรณ์ sortOrder 1 < ห้อง ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 4; r++) await step(`P4-${r}`, async () => {
      const u = U[`P4r${r}`];
      const now = D(at(DS, 840));
      const calls: Call[] = [
        ...[0, 1, 2, 3].map((k) => bookCall(u, "HOT", k, DS, 840)), ...[4, 5, 6, 7].map((k) => bookCall(u, "OIL", k, DS, 840)), ...[8, 9, 10].map((k) => bookCall(u, "EQS", k, DS, 840)),
        { op: "walkIn", a: [u.ctx, u.svc.HOT, u.staff[11], now] }, { op: "walkIn", a: [u.ctx, u.svc.EQS, null, now] },
        createCall(u, "HOT", 0, DS, 1000), createCall(u, "EQS", 1, DS, 1000), { op: "plan", a: [u.ctx, now, 2] },
      ];
      const outs = await fan(`p4-${r}`, spread(calls.map((x, k) => ({ ...x, delayMs: (k * 3) % 7 }))));
      const sw = await sweep(u.id);
      const okN = outs.filter((o) => o.r?.ok && o.op === "book").length;
      const eqAt = await (async () => { const { occ } = await holdsOf(u.id); return (occ.get(u.res.eq) ?? []).filter((x) => x.s <= atMs(DS, 840) && x.e > atMs(DS, 840)).length; })();
      rec(`P4-${r}`, sw.contract.length === 0 && badOf(outs).length === 0 && offContract(outs).length === 0 && okN >= 1 && eqAt <= 1, "CRITICAL",
        "หลายชนิดพร้อมกัน ⇒ ห้อง ≤2 · อุปกรณ์ ≤1 · ชนิดตรง · ไม่มี throw/40P01", { sweep: sw.contract, eqAt14: eqAt, bookOk: okN, codes: codesOf(outs) });
    });
    const { n } = await dlCheck("P4", d0);
    rec("P4-dl", n === 0, "CRITICAL", "deadlock ของฐานระหว่าง P4 = 0 (ล็อกตาม sortOrder ไม่ใช่ลำดับชนิด)", { delta: n });
  }

  // ═══════════ P5 checkIn ∥ runPlanner ∥ walk-in ═══════════
  if (want("P5")) {
    console.log("\n── P5: checkIn ×6 ∥ runPlanner 3 โพรเซส ∥ walk-in ×3 (2 ห้อง) ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 3; r++) await step(`P5-${r}`, async () => {
      const u = U[`P5r${r}`];
      const appts: string[] = [];
      for (const [k, m] of [[0, 600], [1, 600], [2, 675], [3, 675], [4, 750], [5, 750]] as const) appts.push(await bookOk(u, "OIL", k, DS, m));
      const now = D(at(DS, 610 + r * 5));
      const calls: Call[] = [
        ...appts.map((id): Call => ({ op: "checkIn", a: [u.ctx, id, now] })),
        { op: "plan", a: [u.ctx, now, 4] }, { op: "plan", a: [u.ctx, now, 4] }, { op: "plan", a: [u.ctx, now, 4] },
        { op: "walkIn", a: [u.ctx, u.svc.OIL, null, now] }, { op: "walkIn", a: [u.ctx, u.svc.OIL, u.staff[6], now] }, { op: "walkIn", a: [u.ctx, u.svc.OIL, null, now] },
      ];
      const outs = await fan(`p5-${r}`, spread(calls.map((x, k) => ({ ...x, delayMs: (k * 4) % 10 }))));
      await RN.runPlanner(u.ctx, { now: at(DS, 610 + r * 5) });
      const sw = await sweep(u.id), so = await staffOverlap(u.id);
      const ci = outs.filter((o) => o.op === "checkIn" && o.r?.ok).length;
      rec(`P5-${r}`, sw.contract.length === 0 && so.length === 0 && badOf(outs).length === 0 && ci === 6, "CRITICAL",
        "เช็กอินทั้ง 6 สำเร็จ · ฐานไม่ล้น/หมอไม่ซ้อนหลังวางคิว · ไม่มี throw/40P01", { checkIns: ci, sweep: sw.contract, physical: sw.physical, staff: so, codes: codesOf(outs) });
    });
    const { n } = await dlCheck("P5", d0);
    rec("P5-dl", n === 0, "CRITICAL", "deadlock ของฐานระหว่าง P5 (checkIn ล็อกแถวก่อน ∥ planner หมอ→ทรัพยากร→แถว) = 0", { delta: n });
  }

  if (want("P5")) await step("P5b", async () => {
    // ไม่มีการแข่ง: นัด 10:00 (ห้องเดียว · เก็บ 15) มาสาย 10 นาที (ยังในเวลาผ่อนผัน 15) · นัดถัดไปของห้อง 11:15 (หมออีกคน)
    const u = U.P5b;
    const a = await bookOk(u, "OIL", 0, DS, 600);
    const b = await bookOk(u, "OIL", 1, DS, 675);
    const ca = await LN.checkIn(u.ctx, { appointmentId: a }, { via: "STAFF", now: at(DS, 610) });
    await RN.runPlanner(u.ctx, { now: at(DS, 610) });
    const ra = await apRow(a), rb = await apRow(b);
    const sw1 = await sweep(u.id);
    const sa = await LN.startJob(u.ctx, a, { now: at(DS, 610) });
    const cb = await LN.checkIn(u.ctx, { appointmentId: b }, { via: "STAFF", now: at(DS, 670) });
    await RN.runPlanner(u.ctx, { now: at(DS, 670) });
    const rb2 = await apRow(b);
    const sb = await LN.startJob(u.ctx, b, { now: at(DS, 675) });
    const sw2 = await sweep(u.id);
    rec("P5b", sw1.contract.length === 0 && sw2.physical.length === 0, "MAJOR",
      "มาสายในเวลาผ่อนผัน (10:10) ⇒ งานเลื่อน (BOOKED_DELAYED) ถือห้องถึง 11:25 · นัดห้องเดียวกัน 11:15 ต้องถูกเลื่อน/ย้าย/resourceShort — ไม่ใช่ห้องซ้อนในฐาน",
      { checkInA: ca.ok, planA: ra.plannedStartAt ? HM(ra.plannedStartAt.getTime()) : null, planB: rb.plannedStartAt ? HM(rb.plannedStartAt.getTime()) : null, sweepAfterPlan: sw1.contract,
        startA: sa.ok, checkInB: cb.ok, planB2: rb2.plannedStartAt ? HM(rb2.plannedStartAt.getTime()) : null, startB1115: sb.ok ? "OK" : sb.code, physicalAfterStart: sw2.physical });
  });

  // ═══════════ P6 CRUD ∥ จอง ═══════════
  if (want("P6")) {
    console.log("\n── P6: updateResource/setResourceMaintenance ∥ จอง ×9 ──");
    const d0 = await readDeadlocks();
    for (const p of ["cap", "clean", "off", "kind", "maint"]) for (let r = 0; r < 2; r++) await step(`P6-${p}-${r}`, async () => {
      const u = U[`P6${p}${r}`];
      const tMin = p === "clean" ? 675 : 840;
      if (p === "clean") await bookOk(u, "OIL", 9, DS, 600);
      const admin: Call = p === "maint"
        ? { op: "resMaint", a: [OWNER, u.ctx, u.res.rA, [{ startAt: at(DS, 780).toISOString(), endAt: at(DS, 960).toISOString(), note: "probe" }]] }
        : { op: "resUpd", a: [OWNER, u.ctx, u.res.rA, p === "cap" ? { capacity: 1 } : p === "clean" ? { cleanupMin: 120 } : p === "off" ? { active: false } : { kind: "BED" }] };
      const calls: Call[] = [{ ...admin, delayMs: r ? 6 : 0 }, ...Array.from({ length: 9 }, (_, k) => ({ ...bookCall(u, "OIL", k, DS, tMin), delayMs: (k * 2) % 7 }))];
      const outs = await fan(`p6-${p}-${r}`, spread(calls));
      const up = outs.find((o) => o.op === "resUpd" || o.op === "resMaint");
      const books = outs.filter((o) => o.op === "book" && o.r?.ok).length;
      const sw = await sweep(u.id);
      const expBooks = up?.r?.ok ? (p === "cap" ? 1 : 0) : (p === "cap" ? 2 : 1);
      rec(`P6-${p}-${r}`, sw.contract.length === 0 && badOf(outs).length === 0 && books === expBooks && (up?.r?.ok || up?.r?.code === "IN_USE"), "CRITICAL",
        `${p} ∥ จอง 9 ⇒ อย่างใดอย่างหนึ่ง (สำเร็จ ⇒ จองได้ ${p === "cap" ? 1 : 0} · IN_USE ⇒ ${p === "cap" ? 2 : 1}) · ฐานไม่ล้นตามค่าสุดท้าย`,
        { admin: up?.r ?? up?.threw, books, sweep: sw.contract, codes: codesOf(outs) });
    });
    const { n } = await dlCheck("P6", d0);
    rec("P6-dl", n === 0, "CRITICAL", "deadlock ของฐานระหว่าง P6 = 0", { delta: n });
  }

  // ═══════════ P7 สลับ sortOrder ∥ จอง (ลำดับล็อกกลับด้านระหว่าง statement) ═══════════
  if (want("P7")) {
    console.log("\n── P7: updateResource(sortOrder) วน ∥ จองต่อเนื่อง 12 สาย — ตัวควบคุมไม่สลับ vs สลับ ──");
    const seqCalls = (u: Unit): Call[] => Array.from({ length: 12 }, (_, s) => ({ op: "bookSeq", a: [u.ctx, Array.from({ length: 8 }, (_, k) => bkIn(u, "OIL", s, DS, 600 + k * 60 + (s % 4) * 15))] }));
    const runP7 = async (label: string, u: Unit, flips: boolean) => {
      const d0 = await readDeadlocks();
      const calls = seqCalls(u);
      const per = spread(calls, 4);
      if (flips) per.push([{ op: "flip", a: [OWNER, u.ctx, u.res.r1, 60, 1, 9] }, { op: "flip", a: [OWNER, u.ctx, u.res.r4, 60, 4, 0] }]);
      const outs = await fan(`p7-${label}`, per);
      const codes = outs.flatMap((o) => (o.r?.reason ?? "").split(",")).filter(Boolean);
      const busy = codes.filter((c: string) => c === "BUSY").length, threw = codes.filter((c: string) => c.startsWith("THREW")).length;
      const sw = await sweep(u.id);
      const { n } = await dlCheck(`P7-${label}`, d0);
      return { n, busy, threw, okN: codes.filter((c: string) => c === "OK").length, sweep: sw.contract, flipCodes: outs.filter((o) => o.op === "flip").map((o) => (o.r?.reason ?? o.threw ?? "").split(",").reduce((m: Record<string, number>, c: string) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {})) };
    };
    await step("P7", async () => {
      const ctl = await runP7("ctl", U.P7ctl, false);
      rec("P7-ctl", ctl.n === 0 && ctl.threw === 0 && ctl.sweep.length === 0, "INFO", "ตัวควบคุม: จอง 96 ครั้ง 12 สาย ไม่สลับลำดับ ⇒ deadlock 0", ctl);
      const f1 = await runP7("flip", U.P7flip, true);
      let f2: any = null;
      if (f1.n > 0 || f1.busy > 0) f2 = await runP7("flip2", U.P7flip2, true); // ยืนยันซ้ำ
      const breach = (f1.n > 0 || f1.busy > 0) && (!f2 || f2.n > 0 || f2.busy > 0);
      rec("P7-flip", !breach && f1.sweep.length === 0 && f1.threw === 0, "MAJOR",
        "เปลี่ยน sortOrder ทรัพยากรระหว่างมีการจอง ⇒ deadlock 0 (ล็อก ORDER BY sortOrder FOR UPDATE ใช้ snapshot ต่าง statement ⇒ ลำดับกลับด้านได้)", { first: f1, confirm: f2 });
    });
  }

  // ═══════════ P8 ไม่มา ∥ มาสาย ∥ จอง (ร้าน C · tick เฉพาะร้าน C) ═══════════
  if (want("P8")) {
    console.log("\n── P8: runLineTick (ไม่มา) ∥ checkIn มาสาย ∥ จองห้อง ณ เวลานั้น ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 3; r++) await step(`P8-${r}`, async () => {
      const u = U[`P8r${r}`];
      const a = await bookOk(u, "OIL", 0, DS, 600);
      const nowMin = 631 + r; const now = D(at(DS, nowMin));
      const outs = await fan(`p8-${r}`, spread([
        { op: "tick", a: [now, [ids.tC]] }, { op: "checkIn", a: [u.ctx, a, now] },
        { ...bookCall(u, "OIL30", 1, DS, nowMin), delayMs: 3 }, { ...bookCall(u, "OIL30", 2, DS, nowMin), delayMs: 8 }, { op: "plan", a: [u.ctx, now, 2] },
      ], 5));
      await RN.runPlanner(u.ctx, { now: at(DS, nowMin) });
      const st = (await apRow(a)).status;
      const books = outs.filter((o) => o.op === "book" && o.r?.ok).length;
      const sw = await sweep(u.id);
      const consistent = st === "NO_SHOW" ? books <= 1 : books === 0;
      rec(`P8-${r}`, consistent && sw.contract.length === 0 && badOf(outs).length === 0, "CRITICAL",
        "ไม่มา ∥ มาสาย ∥ จอง ⇒ ARRIVED ⇒ จองไม่ได้ · NO_SHOW ⇒ จองได้ ≤1 · ฐานไม่ล้น", { status: st, books, sweep: sw.contract, codes: codesOf(outs) });
    });
    const { n } = await dlCheck("P8", d0);
    rec("P8-dl", n === 0, "CRITICAL", "deadlock ระหว่าง P8 = 0", { delta: n });
    await step("P8b", async () => {
      // นัดยังไม่มา (CONFIRMED) เลยเวลาผ่อนผัน 15 (SPA · RELEASE_REQUEUE) ⇒ ตัววางคิวปล่อยช่อง · ฐาน (§4.6) ยังนับนัดนี้ถือห้อง
      const u = U.P8b;
      const a = await bookOk(u, "OIL", 0, DS, 600);
      const w = await LN.createWalkIn(u.ctx, { serviceId: u.svc.OIL, staffId: null, channel: "STAFF" }, { now: at(DS, 616) });
      const sw1 = await sweep(u.id);
      const bk = await BK.bookAppointment(u.ctx, bkIn(u, "OIL30", 2, DS, 1080));
      const ch = await LN.checkIn(u.ctx, { appointmentId: a }, { via: "STAFF", now: at(DS, 620) });
      await RN.runPlanner(u.ctx, { now: at(DS, 620) });
      const sw2 = await sweep(u.id);
      const wr = w.ok ? await apRow(w.appointmentId) : null;
      rec("P8b", sw1.contract.length === 0 && sw2.contract.length === 0, "MAJOR",
        "ด่านเดียว (§2): นัดเลยเวลาผ่อนผันที่ยังถือห้องในฐาน — ตัววางคิวต้องไม่วาง walk-in ทับห้องนั้น (ไม่งั้นฐานล้นตาม §4.6)",
        { walkIn: w.ok ? { planned: HM(new Date(w.plannedStartAt).getTime()), res: wr?.resourceId?.slice(-6) } : w, sweepAfterWalkIn: sw1.contract, physicalAfterWalkIn: sw1.physical, laterBook18: bk.ok ? "OK" : bk.code, checkIn: ch.ok ? (ch.asWalkIn ? "asWalkIn" : "ok") : ch.code, sweepAfterArrive: sw2.contract, apptAfter: await apRow(a).then((x) => ({ st: x.status, planned: x.plannedStartAt ? HM(x.plannedStartAt.getTime()) : null })) });
    });
  }

  // ═══════════ P9 startJob walk-in ∥ จองห้องเดียวกันที่ now ═══════════
  if (want("P9")) {
    console.log("\n── P9: startJob walk-in (ย้ายมาเริ่มตอนนี้) ∥ จองห้องเดียวกันตอนนี้ ──");
    const d0 = await readDeadlocks();
    for (let r = 0; r < 3; r++) await step(`P9-${r}`, async () => {
      const u = U[`P9r${r}`];
      const a = await bookOk(u, "OIL", 0, DS, 600);
      const w = await LN.createWalkIn(u.ctx, { serviceId: u.svc.OIL, staffId: u.staff[1], channel: "STAFF" }, { now: at(DS, 600) });
      if (!w.ok) throw new Error(`walk-in ${J(w)}`);
      const wr0 = await apRow(w.appointmentId);
      await q(`UPDATE "Appointment" SET status = 'CANCELLED' WHERE id = $1`, [a]); // ห้องว่างตอนนี้ (ไม่ replan)
      const now = D(at(DS, 605));
      const outs = await fan(`p9-${r}`, spread([
        { op: "start", a: [u.ctx, w.appointmentId, now], delayMs: r * 4 },
        bookCall(u, "OIL30", 2, DS, 605), bookCall(u, "OIL30", 3, DS, 605), bookCall(u, "OIL30", 0, DS, 605),
      ], 4));
      const st = outs.find((o) => o.op === "start");
      const books = outs.filter((o) => o.op === "book" && o.r?.ok).length;
      const sw = await sweep(u.id);
      const wins = (st?.r?.ok ? 1 : 0) + books;
      rec(`P9-${r}`, wins === 1 && sw.contract.length === 0 && sw.physical.length === 0 && badOf(outs).length === 0, "CRITICAL",
        "startJob (CLASH หรือได้) ∥ จองห้องตอนนี้ ⇒ ผู้ชนะ 1 พอดี · ฐานไม่ล้น", { walkInPlanned: HM(wr0.startAt.getTime()), start: st?.r ?? st?.threw, books, sweep: sw.contract, physical: sw.physical });
    });
    const { n } = await dlCheck("P9", d0);
    rec("P9-dl", n === 0, "CRITICAL", "deadlock ระหว่าง P9 = 0", { delta: n });
  }

  // ═══════════ P10 ถอย DONE → CONFIRMED (ไม่ใช่ "ปลุก" ตามโค้ด) ═══════════
  if (want("P10")) {
    console.log("\n── P10: setAppointmentStatus DONE → CONFIRMED หลังห้องถูกจองซ้ำ ──");
    await step("P10", async () => {
      const u = U.P10;
      const a = await bookOk(u, "OIL", 0, DS, 840);
      const d = await BK.setAppointmentStatus(u.tenantId, u.id, a, "DONE");
      const b = await BK.bookAppointment(u.ctx, bkIn(u, "OIL", 1, DS, 840));
      const back = await BK.setAppointmentStatus(u.tenantId, u.id, a, "CONFIRMED");
      const sw = await sweep(u.id);
      rec("P10", !(d.ok && b.ok && back.ok) || sw.contract.length === 0, "MAJOR",
        "ถอยนัด DONE กลับเป็นสถานะถือช่องหลังห้องถูกจองไปแล้ว ⇒ ต้องตรวจทรัพยากร (แบบปลุก CANCELLED/NO_SHOW) ไม่ใช่ทำให้ห้องล้น",
        { done: d.ok, rebook: b.ok ? "OK" : b.code, back: back, sweep: sw.contract });
    });
  }

  // ═══════════ P11 นัด (BOOKED) มาก่อนเวลา startJob ตอนห้องยังมีคนใช้ ═══════════
  if (want("P11")) {
    console.log("\n── P11: นัดมาก่อน → startJob ก่อนเวลานัดขณะห้องยังถูกใช้ ──");
    await step("P11", async () => {
      const u = U.P11;
      const a = await bookOk(u, "OIL", 0, DS, 600);   // ห้อง 10:00–11:15
      const b = await bookOk(u, "OIL", 1, DS, 675);   // ห้อง 11:15–12:30
      const ca = await LN.checkIn(u.ctx, { appointmentId: a }, { via: "STAFF", now: at(DS, 595) });
      const sa = await LN.startJob(u.ctx, a, { now: at(DS, 600) });
      const cb = await LN.checkIn(u.ctx, { appointmentId: b }, { via: "STAFF", now: at(DS, 630) });
      const sb = await LN.startJob(u.ctx, b, { now: at(DS, 630) });
      const sw = await sweep(u.id);
      rec("P11", !sb.ok || sw.physical.length === 0, "MAJOR",
        "เริ่มนัดก่อนเวลา (10:30) ขณะห้องเดียวถูกนัดก่อนหน้าใช้อยู่ถึง 11:15 ⇒ ต้อง CLASH (ห้องถูกใช้ 2 งานจริงพร้อมกัน)",
        { a: [ca.ok, sa.ok], checkInB: cb.ok ? "ok" : cb.code, startB: sb, contract: sw.contract, physical: sw.physical });
    });
  }

  // ═══════════ P12 ขอบเวลา ═══════════
  if (want("P12")) {
    console.log("\n── P12: ขอบเวลา (เวลาเก็บ · ปิดซ่อม · ความจุพอดี) ──");
    await step("P12", async () => {
      const u = U.P12;
      await bookOk(u, "OIL", 0, DS, 600); // ห้องถึง 11:15
      const c = (r: any) => (r.ok ? "OK" : r.code);
      const b1114 = c(await BK.bookAppointment(u.ctx, bkIn(u, "OIL", 1, DS, 674)));
      const b1115 = c(await BK.bookAppointment(u.ctx, bkIn(u, "OIL", 2, DS, 675))); // ห้องถึง 12:30
      const m1 = await RS.setResourceMaintenance(OWNER, u.ctx, u.res.rA, [{ startAt: at(DS, 750).toISOString(), endAt: at(DS, 800).toISOString() }]);
      const m0 = await RS.setResourceMaintenance(OWNER, u.ctx, u.res.rA, [{ startAt: at(DS, 749).toISOString(), endAt: at(DS, 800).toISOString() }]);
      // ห้องว่างหลังปิดซ่อม: 12:30–13:20 ปิด · จอง 13:20 ได้ · ปิดซ่อม 14:35 (13:20+60+15) ⇒ จองได้ · ปิด 14:34 ⇒ เต็ม
      await RS.setResourceMaintenance(OWNER, u.ctx, u.res.rA, [{ startAt: at(DS, 750).toISOString(), endAt: at(DS, 800).toISOString() }, { startAt: at(DS, 875).toISOString(), endAt: at(DS, 960).toISOString() }]);
      const b1320 = c(await BK.bookAppointment(u.ctx, bkIn(u, "OIL", 3, DS, 800)));
      const b1319 = c(await BK.bookAppointment(u.ctx, bkIn(u, "OIL30", 4, DS, 799)));
      const findSlots = (await BK.findSlots(u.ctx, { serviceId: u.svc.OIL, staffId: u.staff[5], dateStr: DS, channel: "STAFF" })).map((x: any) => x.startMin);
      const cp = [c(await BK.bookAppointment(u.ctx, bkIn(u, "CPL", 0, DS, 1020))), c(await BK.bookAppointment(u.ctx, bkIn(u, "CPL", 1, DS, 1020))), c(await BK.bookAppointment(u.ctx, bkIn(u, "CPL", 2, DS, 1020)))];
      const cpEdge = c(await BK.bookAppointment(u.ctx, bkIn(u, "CPL", 2, DS, 1100))); // 17:00+60+20 = 18:20 ⇒ 18:20 ได้
      const sw = await sweep(u.id);
      const pass = b1114 === "FULL" && b1115 === "OK" && m1.ok && !m0.ok && m0.code === "IN_USE" && b1320 === "OK" && b1319 === "FULL" && !findSlots.some((t: number) => t >= 750 && t < 800) && !findSlots.includes(675)
        && J(cp) === J(["OK", "OK", "FULL"]) && cpEdge === "OK" && sw.contract.length === 0;
      rec("P12", pass, "CRITICAL", "ขอบ: 11:14 เต็ม/11:15 ได้ · ปิดซ่อมเริ่มพอดีปลายเก็บ ได้ · 1 นาทีก่อน IN_USE · เริ่มพอดีปลายปิดซ่อม ได้ · ทับ 1 นาที เต็ม · ห้องคู่ 2 ได้/3 เต็ม · ปลายเก็บ 20 พอดี ได้",
        { b1114, b1115, maintAtEdge: m1.ok ? "OK" : m1.code, maintMinus1: m0.ok ? "OK" : m0.code, b1320, b1319, slots: findSlots.slice(0, 12).map((t: number) => HM(atMs(DS, t))), cp, cpEdge, sweep: sw.contract });
    });
  }

  // ═══════════ P13 ข้ามเที่ยงคืน + TZ ของเครื่อง ═══════════
  if (want("P13")) {
    console.log("\n── P13: IN_SERVICE 23:30 เลยเที่ยงคืน ∥ จอง 00:05 · โพรเซส TZ +14 / −11 ──");
    await step("P13", async () => {
      const u = U.P13;
      // งานนัด 23:00 เริ่มจริง 23:30 (overrun · J5) — แทรกแถวตรง (ทางจองปกติไม่รับงานเลยเวลาปิด)
      const apId = T("P13ap");
      await insertRow("Appointment", { id: apId, tenantId: u.tenantId, unitId: u.id, serviceId: u.svc.OIL, staffId: u.staff[0], startAt: at(DS, 1380), endAt: at(DS, 1440), status: "IN_SERVICE", startedAt: at(DS, 1410), plannedStartAt: at(DS, 1410),
        resourceId: u.res.rA, policySnapshot: JSON.stringify({ job: { durationMin: 60, bufferMin: 0, resourceIds: [u.res.rA] } }), customerName: "ข้ามคืน", customerPhone: newPhone(), updatedAt: new Date() });
      const tzRuns: Record<string, string[]> = {};
      for (const tz of ["Asia/Bangkok", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
        const outs = await fan(`p13-${tz.replace(/\W/g, "")}`, [[
          { ...bookCall(u, "OIL30", 1, DS2, 5) }, // 00:05 — ห้องถึง 00:45
        ], [{ ...bookCall(u, "OIL30", 2, DS2, 44), delayMs: 400 }]], { TZ: tz });
        tzRuns[tz] = outs.map((o) => (o.r?.ok ? "OK" : o.r?.code ?? o.threw));
      }
      const ok45 = await BK.bookAppointment(u.ctx, bkIn(u, "OIL30", 3, DS2, 45));
      const slots = (await BK.findSlots(u.ctx, { serviceId: u.svc.OIL30, staffId: u.staff[1], dateStr: DS2, channel: "STAFF" })).map((x: any) => x.startMin);
      const sw = await sweep(u.id);
      const pass = Object.values(tzRuns).every((v) => v.every((x) => x === "FULL")) && ok45.ok && !slots.some((t: number) => t < 45) && sw.contract.length === 0;
      rec("P13", pass, "CRITICAL", "งานข้ามเที่ยงคืนถือห้องถึง 00:30+เก็บ 15 ⇒ 00:05/00:44 เต็มทุก TZ ของโพรเซส · 00:45 ได้ · findSlots ไม่มีก่อน 00:45", { tzRuns, ok45: ok45.ok ? "OK" : ok45.code, slots: slots.slice(0, 4), sweep: sw.contract });
    });
  }

  // ═══════════ P14 ข้ามร้าน/ข้ามหน่วย ═══════════
  if (want("P14")) {
    console.log("\n── P14: id ทรัพยากรข้ามร้าน/ข้ามหน่วย ⇒ NOT_FOUND เดียวกัน ──");
    await step("P14", async () => {
      const u = U.P14, o = U.P14o, b = U.P14b;
      const victims: [string, string][] = [["ร้านอื่น", b.res.rA], ["หน่วยอื่น", o.res.rA], ["ไม่มี", "b13pb_nope"], ["sql", `' OR '1'='1`], ["ว่าง", ""]];
      const reasons: string[] = []; const wrong: string[] = [];
      for (const [n, id] of victims) {
        for (const [fn, r] of [
          ["update", await RS.updateResource(OWNER, u.ctx, id, { name: "ขโมย", capacity: 9 })],
          ["maint", await RS.setResourceMaintenance(OWNER, u.ctx, id, [{ startAt: at(DS, 600).toISOString(), endAt: null }])],
          ["off", await RS.updateResource(OWNER, u.ctx, id, { active: false })],
        ] as const) { if (r.ok || r.code !== "NOT_FOUND") wrong.push(`${n}/${fn}:${r.ok ? "OK!" : r.code}`); else reasons.push(r.reason); }
      }
      const cMix = await RS.createResource(OWNER, { tenantId: ids.tA, unitId: b.id }, { kind: "ROOM", name: "ฝากร้าน B" });
      if (cMix.ok || cMix.code !== "NOT_FOUND") wrong.push(`create ctx ผสม:${cMix.ok ? "OK!" : cMix.code}`); else reasons.push(cMix.reason);
      const lMix = await RS.listResources({ tenantId: ids.tA, unitId: b.id });
      const wMix = await RS.walkInNowByService({ tenantId: ids.tB, unitId: u.id }, { now: at(DS, 600) });
      const sMix = await SET.setSettings(OWNER, { tenantId: ids.tA }, [{ key: "booking.service.cleanupMin", scope: "RESOURCE", scopeId: b.res.rA, value: 7 }]);
      const intact = await q(`SELECT id, name, capacity, active FROM "SvcResource" WHERE id = ANY($1::text[]) ORDER BY id`, [[b.res.rA, o.res.rA]]);
      const blocks = await q(`SELECT count(*)::int AS n FROM "SvcResourceBlock" WHERE "resourceId" = ANY($1::text[])`, [[b.res.rA, o.res.rA]]);
      const cross = await q(`SELECT a.id FROM "Appointment" a JOIN "SvcResource" r ON r.id = a."resourceId" WHERE a."tenantId" = ANY($1::text[]) AND (r."unitId" <> a."unitId" OR r."tenantId" <> a."tenantId")`, [TIDS]);
      const pass = wrong.length === 0 && new Set(reasons).size === 1 && J(lMix) === "[]" && J(wMix) === "[]" && !sMix.ok && sMix.code === "NOT_FOUND"
        && intact.every((r: any) => r.capacity === 1 && r.active === true && r.name === "rA") && blocks[0].n === 0 && cross.length === 0;
      rec("P14", pass, "CRITICAL", "X1: update/maint/off/create ด้วย id/ctx ข้ามร้าน/หน่วย/ไม่มี/ฉีด ⇒ NOT_FOUND ข้อความเดียว · ไม่เขียน · list/walkInNow ⇒ [] · ค่าตั้งชั้น RESOURCE ⇒ NOT_FOUND · ไม่มีแถวนัดถือห้องต่างหน่วย",
        { wrong, distinctReasons: [...new Set(reasons)], list: lMix.length, walkInNow: wMix.length, settings: sMix.code ?? sMix.ok, blocks: blocks[0].n, cross: cross.length });
    });
  }

  // ═══════════ P15 บังคับ 40P01 ⇒ ลองใหม่ 1 ครั้ง ⇒ BUSY ═══════════
  if (want("P15")) {
    console.log("\n── P15: บังคับ deadlock 2 รอบติด ⇒ bookAppointment ลองใหม่ 1 ครั้งแล้วคืน BUSY (ไม่ throw · ไม่มีแถว) ──");
    await step("P15", async () => {
      const u = U.P15;
      const dlTo = (await q(`SHOW deadlock_timeout`))[0]?.deadlock_timeout;
      const d0 = await readDeadlocks();
      const P = await pool.connect();
      const inp = bkIn(u, "OIL", 0, DS, 840);
      const key = `booking:idem:${u.tenantId}:${inp.idempotencyKey}`;
      let res: any = null; let pErr: string[] = [];
      try {
        await P.query("BEGIN");
        await P.query(`SELECT id FROM "SvcResource" WHERE id = $1 FOR UPDATE`, [u.res.rA]);
        const pr = BK.bookAppointment(u.ctx, inp).then((x: any) => x, (e: unknown) => ({ threw: errMsg(e) }));
        await sleep(500);
        await P.query(`SELECT id FROM "BookingStaff" WHERE id = $1 FOR UPDATE`, [u.staff[0]]).catch((e: any) => pErr.push(`staff:${e.code}`));
        await sleep(500);
        await P.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [key]).catch((e: any) => pErr.push(`adv:${e.code}`));
        res = await Promise.race([pr, sleep(20_000).then(() => ({ timeout: true }))]);
      } finally { await P.query("ROLLBACK").catch(() => undefined); P.release(); }
      const rows = (await q(`SELECT count(*)::int AS n FROM "Appointment" WHERE "idempotencyKey" = $1`, [inp.idempotencyKey]))[0].n;
      const d1 = await dlSettled();
      const after = await BK.bookAppointment(u.ctx, bkIn(u, "OIL", 0, DS, 840));
      dlNotes.push(`P15(จงใจ):${d1 - d0}`);
      rec("P15", res?.ok === false && res?.code === "BUSY" && rows === 0 && pErr.length === 0 && d1 - d0 >= 2 && after.ok, "MAJOR",
        "40P01 รอบแรก ⇒ ลองใหม่ (เกิด deadlock รอบสอง) ⇒ BUSY · ไม่ throw · ไม่มีแถว · ฝั่งโพรบไม่ถูกเลือกตาย · หลังปล่อย จองได้",
        { deadlock_timeout: dlTo, result: res, rows, probeSideErr: pErr, deadlocksAdded: d1 - d0, afterRelease: after.ok ? "OK" : after.code });
    });
  }

  // ═══════════ P17 งานกำลังทำเลยเวลา (วันนี้ · นาฬิกาจริง) ∥ จองห้องเดียวกันตอนนี้ — มติ Q1 "ไม่ยืดถึง now" vs ตัววางคิว PL-11 ═══════════
  if (want("P17")) {
    console.log("\n── P17: IN_SERVICE เลยเวลา 20 นาที (วันนี้) ⇒ จองห้องเดียวกันอีก 3 นาที ──");
    await step("P17", async () => {
      const u = U.P17;
      const nowMs = Date.now();
      const nowMin = Math.floor(((nowMs + 7 * 3_600_000) % 86_400_000) / MIN);
      const apId = T("P17ap");
      await insertRow("Appointment", { id: apId, tenantId: u.tenantId, unitId: u.id, serviceId: u.svc.OIL, staffId: u.staff[0], startAt: new Date(nowMs - 80 * MIN), endAt: new Date(nowMs - 20 * MIN), status: "IN_SERVICE", startedAt: new Date(nowMs - 80 * MIN), plannedStartAt: new Date(nowMs - 80 * MIN),
        resourceId: u.res.rA, policySnapshot: JSON.stringify({ job: { durationMin: 60, bufferMin: 0, resourceIds: [u.res.rA] } }), customerName: "เลยเวลา", customerPhone: newPhone(), updatedAt: new Date() });
      const view = (await RS.walkInNowByService(u.ctx, { now: new Date(nowMs) })).find((r: any) => r.serviceId === u.svc.OIL30);
      const bk = await BK.bookAppointment(u.ctx, bkIn(u, "OIL30", 1, TODAY, nowMin + 3));
      const planSaysBusy = !!view && view.startAt !== null && new Date(view.startAt).getTime() > nowMs + 3 * MIN;
      rec("P17", !(bk.ok && planSaysBusy), "MAJOR",
        "ด่านเดียว (§2): ตัววางคิวบอกห้องยังไม่ว่าง (งานเลยเวลา ยืดถึง now+5 + เก็บ 15 · PL-11) ⇒ การจองห้องเดียวกันตอนนี้ต้องไม่ผ่าน (มติ Q1 ฝั่งฐานไม่ยืดถึง now)",
        { nowBkk: HM(nowMs), walkInNow: view ? { start: view.startAt ? HM(new Date(view.startAt).getTime()) : null, limitedBy: view.limitedBy } : null, book: bk.ok ? "OK" : `${bk.code} ${bk.reason ?? ""}` });
    });
  }

  // ═══════════ P18 มาสายเข้าแถวที่วางไม่ได้วันนี้ ∥ walk-in ห้องเดียวกัน (หนี้ที่ผู้สร้างเปิด) ═══════════
  if (want("P18")) {
    console.log("\n── P18: นัด 18:45 มาสาย 19:10 (วางไม่ได้ · เลยเวลาปิด) + walk-in 30 นาทีห้องเดียวกัน ──");
    await step("P18", async () => {
      const u = U.P18;
      const a = await bookOk(u, "OIL", 0, DS, 1125);
      const ch = await LN.checkIn(u.ctx, { appointmentId: a }, { via: "STAFF", now: at(DS, 1150) });
      const w = await LN.createWalkIn(u.ctx, { serviceId: u.svc.OIL30, staffId: u.staff[1], channel: "STAFF" }, { now: at(DS, 1150) });
      await RN.runPlanner(u.ctx, { now: at(DS, 1150) });
      const ra = await apRow(a);
      const sw = await sweep(u.id);
      rec("P18", sw.contract.length === 0, "MINOR",
        "แถวมาสายที่ตัววางคิววางไม่ได้ (plannedStartAt null) ฐานยังนับที่เวลานัด แต่ตัววางคิวไม่นับ ⇒ walk-in ลงห้องเดียวกันได้ · ฐานล้นตามนิยาม (ไม่ซ้อนจริง — ลูกค้ายังไม่ได้เข้าห้อง)",
        { checkIn: ch.ok ? (ch.asWalkIn ? "asWalkIn" : "ok") : ch.code, apptA: { st: ra.status, planned: ra.plannedStartAt ? HM(ra.plannedStartAt.getTime()) : null }, walkIn: w.ok ? HM(new Date(w.plannedStartAt).getTime()) : w.code, contract: sw.contract, physical: sw.physical });
    });
  }

  // ═══════════ P19 resourceShort ขึ้นธงเกิน (pure) ═══════════
  if (want("P19")) {
    console.log("\n── P19: resourceShort false positive — งานเลื่อนเพราะหมอ (ไม่ใช่ห้อง) จนเลยเวลาปิด ──");
    await step("P19", async () => {
      const D0 = Date.UTC(2026, 10, 6) - 7 * 3_600_000; const Tm = (h: string) => { const [x, y] = h.split(":").map(Number); return D0 + (x * 60 + y) * MIN; };
      const S0 = { queueOrder: "SINGLE_LINE", backfill: true, safetyBeforeBookingMin: 0, graceMin: 15, noShowAfterMin: 30, lateAction: "RELEASE", priorityEnabled: false, walkInMaxWaitMin: 600, overrunExtendMin: 5, minBreakMin: 0, maxJobsPerDay: null };
      const svcs = [{ id: "PLAIN", name: "p", durationMin: 60, bufferAfterMin: 0 }, { id: "OIL", name: "o", durationMin: 60, bufferAfterMin: 0, resourceKinds: ["ROOM"] }];
      const res = [{ id: "rA", kind: "ROOM", name: "rA", sortOrder: 1, capacity: 1, cleanupMin: 15, blocks: [] }, { id: "rB", kind: "ROOM", name: "rB", sortOrder: 2, capacity: 1, cleanupMin: 15, blocks: [] }];
      const st = [{ id: "s0", name: "s0", sortOrder: 1, windows: [{ startAt: Tm("10:00"), endAt: Tm("20:00") }], services: null }];
      const jb = (id: string, svc: string, h: string, o: any = {}) => ({ id, label: id, kind: "BOOKED", status: "CONFIRMED", serviceId: svc, assignMode: "SPECIFIC", staffId: "s0", startAt: Tm(h), issuedAt: Tm("08:00"), checkedInAt: null, startedAt: null, priority: false, ...o });
      const overrun = jb("A", "PLAIN", "18:00", { status: "IN_SERVICE", checkedInAt: Tm("18:00"), startedAt: Tm("18:20") });
      const b = (svc: string, ids?: string[]) => jb("B", svc, "19:00", { status: "ARRIVED", checkedInAt: Tm("18:55"), ...(ids ? { resourceIds: ids } : {}) });
      const pick = (inp: any) => PL.planDay(inp).jobs.find((x: any) => x.jobId === "B");
      const plainWithRes = pick({ now: Tm("19:20"), settings: S0, staff: st, services: svcs, resources: res, jobs: [overrun, b("PLAIN")] });
      const plainNoRes = pick({ now: Tm("19:20"), settings: S0, staff: st, services: svcs, resources: [], jobs: [overrun, b("PLAIN")] });
      const oilFreeRoom = pick({ now: Tm("19:20"), settings: S0, staff: st, services: svcs, resources: res, jobs: [overrun, b("OIL", ["rA"])] });
      const control = pick({ now: Tm("19:20"), settings: S0, staff: st, services: [svcs[0]], jobs: [overrun, b("PLAIN")] });
      rec("P19-plain", plainWithRes.resourceShort === false && plainNoRes.resourceShort === false && control.resourceShort === false, "MAJOR",
        "§3.1: บริการไม่ใช้ทรัพยากร ⇒ resourceShort false เสมอ — งานธรรมดาถูกหมอดันเลยเวลาปิด (สาขามีบริการประกาศชนิด) ต้องไม่ขึ้นธงห้องไม่พอ",
        { plainWithRes: [HM(plainWithRes.startAt), plainWithRes.resourceShort, J(plainWithRes.resourceIds)], plainResEmpty: plainNoRes.resourceShort, controlNoKinds: control.resourceShort });
      rec("P19-oil", oilFreeRoom.resourceShort === false, "MINOR",
        "บริการใช้ห้อง · ห้องว่างทั้ง 2 ห้อง · เลยเวลาปิดเพราะหมอเลยเวลา (ไม่ใช่ห้อง) ⇒ ไม่ควรขึ้นธง resourceShort (จอ B.14 จะบอกผิดว่าห้องไม่พอ)",
        { start: HM(oilFreeRoom.startAt), short: oilFreeRoom.resourceShort, ids: oilFreeRoom.resourceIds });
    });
  }

  // ═══════════ P16 fuzz ตัววางคิว (pure) ═══════════
  if (want("P16")) {
    const N = Math.max(100, Number(process.env.PROBE_B13_FUZZ_N ?? 20000) || 20000);
    console.log(`\n── P16: fuzz planDay/quoteWalkIn ${N} ชุด (ตัวสร้างของโพรบ: ความจุ 1–3 · ปิดซ่อม · หลายชนิด · overrun · มาสาย · ปล่อยช่อง · ไม่มีชิ้น) ──`);
    await step("P16", async () => {
      const mul = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const DAY0 = Date.UTC(2026, 10, 6) - 7 * 3_600_000;
      const Tm = (m: number) => DAY0 + m * MIN;
      const fails: Record<string, string[]> = { cap: [], block: [], kind: [], past: [], quote: [], late: [], det: [], delay: [] };
      const ts: number[] = [];
      const q10 = { delayed: [] as number[], onTimeHit: 0, pastWindow: [] as string[], far: [] as string[] };
      for (let k = 0; k < N; k++) {
        const r = mul(9157 + k * 7919);
        const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
        const pick = <V,>(xs: V[]) => xs[Math.floor(r() * xs.length)];
        const now = Tm(ri(600, 1100));
        const staff = Array.from({ length: ri(1, 6) }, (_, i) => ({ id: `s${i}`, name: `s${i}`, sortOrder: ri(1, 3), windows: [{ startAt: Tm(600), endAt: Tm(pick([1200, 1320, 1439])) }], services: null }));
        const kindsets = [[], ["ROOM"], ["BED"], ["ROOM", "EQUIPMENT"], ["EQUIPMENT"], ["SOFA"], ["COUPLE_ROOM"]];
        const services = [30, 45, 60, 90, 120].map((d, i) => ({ id: `v${i}`, name: `v${i}`, durationMin: d, bufferAfterMin: pick([0, 0, 5, 10]), resourceKinds: pick(kindsets) }));
        const resources: any[] = [];
        for (const kind of ["ROOM", "BED", "EQUIPMENT", "SOFA"]) for (let i = 0, n = ri(0, 3); i < n; i++) {
          const blocks = r() < 0.25 ? [{ startAt: Tm(ri(600, 1300)), endAt: 0 }].map((b) => ({ ...b, endAt: b.startAt + ri(10, 240) * MIN })) : [];
          resources.push({ id: `${kind}${i}`, kind, name: `${kind}${i}`, sortOrder: ri(1, 4), capacity: r() < 0.25 ? ri(2, 3) : 1, cleanupMin: pick([0, 5, 10, 15, 20]), blocks });
        }
        const jobs: any[] = [];
        // ข้อเท็จจริงที่ไม่ล้น: นัด/งานกำลังทำ ผูกห้องแบบ first-fit ตามช่วงถือ
        const used = new Map<string, { s: number; e: number }[]>();
        const lastEnd = new Map<string, number>();
        const free = (x: any, s: number, e: number) => !x.blocks.some((b: any) => b.startAt < e && s < b.endAt) && [s, ...(used.get(x.id) ?? []).map((u) => u.s).filter((t) => t > s && t < e)].every((t) => (used.get(x.id) ?? []).filter((u) => u.s <= t && u.e > t).length < x.capacity);
        for (let b = 0, nb = ri(0, 18); b < nb; b++) {
          const sv = pick(services); const st = pick(staff);
          // หมอคนเดียวไม่มีนัดซ้อน (สมจริงแบบ oracle) · งานกำลังทำ/มาแล้ว/สาย = เริ่มก่อน now เท่านั้น
          const s = Math.max(Tm(ri(590, 1250)), lastEnd.get(st.id) ?? 0);
          if (s + sv.durationMin * MIN < now - 30 * MIN) { lastEnd.set(st.id, s + (sv.durationMin + sv.bufferAfterMin) * MIN); continue; } // จบไปแล้ว (DONE) — ไม่ส่ง
          const status = s < now ? pick(["CONFIRMED", "IN_SERVICE", "IN_SERVICE", "ARRIVED", "LATE"]) : pick(["CONFIRMED", "CONFIRMED", "ARRIVED"]);
          const started = status === "IN_SERVICE" ? Math.min(now, s + ri(0, 10) * MIN) : null;
          const s0 = started ?? s;
          const ids: string[] = [];
          for (const kd of sv.resourceKinds) { const x = resources.find((y) => y.kind === kd && !ids.includes(y.id) && free(y, s0, Math.max(s0 + sv.durationMin * MIN, status === "IN_SERVICE" ? now + 5 * MIN : 0) + y.cleanupMin * MIN)); if (!x) break; ids.push(x.id); }
          if (ids.length !== sv.resourceKinds.length) continue;
          for (const id of ids) { const x = resources.find((y) => y.id === id); used.set(id, [...(used.get(id) ?? []), { s: s0, e: Math.max(s0 + sv.durationMin * MIN, status === "IN_SERVICE" ? now + 5 * MIN : 0) + x.cleanupMin * MIN }]); }
          lastEnd.set(st.id, Math.max(s + (sv.durationMin + sv.bufferAfterMin + 5) * MIN, status === "IN_SERVICE" ? now + 10 * MIN : 0));
          jobs.push({ id: `B${b}`, label: "b", kind: "BOOKED", status, serviceId: sv.id, assignMode: r() < 0.2 ? "ANY" : "SPECIFIC", staffId: st.id, startAt: s, issuedAt: now - 86_400_000,
            checkedInAt: status === "ARRIVED" || status === "IN_SERVICE" ? Math.min(now, s + ri(-10, 25) * MIN) : null, startedAt: started, priority: false, ...(ids.length ? { resourceIds: ids } : {}) });
        }
        for (let w = 0, nw = ri(0, 10); w < nw; w++) jobs.push({ id: `W${w}`, label: "w", kind: "WALKIN", status: "QUEUED", serviceId: pick(services).id, assignMode: "ANY", staffId: r() < 0.2 ? pick(staff).id : null, startAt: null, issuedAt: now - ri(0, 60) * MIN, checkedInAt: now - ri(0, 60) * MIN, startedAt: null, priority: false });
        jobs.forEach((j) => { if (j.staffId && j.kind === "WALKIN") j.assignMode = "SPECIFIC"; });
        const input = { now, settings: { queueOrder: "SINGLE_LINE", backfill: r() < 0.7, safetyBeforeBookingMin: pick([0, 5]), graceMin: 15, noShowAfterMin: 30, lateAction: pick(["RELEASE", "HOLD"]), priorityEnabled: false, walkInMaxWaitMin: 600, overrunExtendMin: 5, minBreakMin: pick([0, 5]), maxJobsPerDay: null }, staff, services, jobs, resources };
        const t0 = performance.now(); const p = PL.planDay(input); ts.push(performance.now() - t0);
        const resOf = (id: string) => resources.find((x) => x.id === id);
        const occ = new Map<string, { s: number; e: number; j: string; fact: boolean; gated: boolean; short: boolean }[]>();
        for (const j of p.jobs) {
          if (!(j.state === "SCHEDULED" || j.state === "IN_SERVICE") || j.startAt == null || j.endAt == null) continue;
          const src = jobs.find((x) => x.id === j.jobId);
          const kinds = services.find((s) => s.id === src.serviceId)!.resourceKinds;
          if (kinds.length && (j.resourceIds.length !== kinds.length || j.resourceIds.some((id: string, i: number) => resOf(id)?.kind !== kinds[i]))) { if (!j.resourceShort) fails.kind.push(`#${k} ${j.jobId} ${J(j.resourceIds)} ≠ ${J(kinds)}`); continue; }
          if (src.kind === "WALKIN" && j.startAt < now) fails.past.push(`#${k} ${j.jobId} ${HM(j.startAt)} < now ${HM(now)}`);
          // fact = นัดที่เวลาไม่ขยับ/กำลังทำ · gated = จุดลงที่ §4.5(ค) บังคับตรวจห้อง (walk-in/มาสายเข้าแถว/มาก่อน) · อื่น = นัดที่เลื่อนตามหมอ (BOOKED_DELAYED ฯลฯ)
          const fact = src.kind === "BOOKED" && j.startAt === (src.startedAt ?? src.startAt);
          const gated = src.kind === "WALKIN" || ["LATE_ARRIVAL_AS_WALKIN", "BOOKED_EARLY"].includes(j.reason);
          for (const id of j.resourceIds) { const x = resOf(id); occ.set(id, [...(occ.get(id) ?? []), { s: j.startAt, e: j.endAt + x.cleanupMin * MIN, j: `${j.jobId}/${j.reason}`, fact, gated, short: j.resourceShort === true }]); }
        }
        for (const [id, xs] of occ) {
          const x = resOf(id);
          for (const a of xs) {
            const ov = xs.filter((y) => y.s <= a.s && y.e > a.s);
            if (ov.length > x.capacity && ov.some((y) => !y.fact) && !ov.some((y) => y.short && !y.gated)) { (ov.some((y) => y.gated) ? fails.cap : fails.delay).push(`#${k} ${id} ${HM(a.s)} cap ${x.capacity} (${ov.map((y) => y.j).join(",")})`); break; }
            if (!a.fact && !(a.short && !a.gated) && x.blocks.some((b: any) => a.s < b.endAt && b.startAt < a.e)) { (a.gated ? fails.block : fails.delay).push(`#${k} ${a.j} ${id} ทับปิดซ่อม`); break; }
          }
        }
        // ด่านเดียว: นัดที่ยังไม่มา (CONFIRMED/LATE ไม่ได้เช็กอิน) ที่ตัววางคิวปล่อยช่อง — ฐานยังนับว่าถือห้อง [startAt, startAt+dur+cleanup)
        for (const j of p.jobs) {
          if (j.state !== "RELEASED_LATE" && j.state !== "NO_SHOW_DUE") continue;
          const src = jobs.find((x) => x.id === j.jobId); if (!src.resourceIds) continue;
          const dur = services.find((s) => s.id === src.serviceId)!.durationMin * MIN;
          for (const id of src.resourceIds) {
            const x = resOf(id); const hs = src.startAt, he = src.startAt + dur + x.cleanupMin * MIN;
            // นับ ณ จุดเวลา (point-in-time) — จุดสูงสุดอยู่ที่ hs หรือจุดเริ่มของงานอื่นภายใน [hs, he)
            const xs2 = (occ.get(id) ?? []).filter((y) => y.j.split("/")[0] !== j.jobId);
            const pts = [hs, ...xs2.map((y) => y.s).filter((t) => t > hs && t < he)];
            const peak = Math.max(...pts.map((t) => xs2.filter((y) => y.s <= t && y.e > t).length));
            const clash = xs2.filter((y) => !y.fact && y.s < he && hs < y.e);
            if (clash.length && peak + 1 > x.capacity) fails.late.push(`#${k} ${j.jobId}(${j.state}) ${id} ทับงานที่วางใหม่ ${clash.map((c) => c.j).join(",")}`);
          }
        }
        // Q10: นัดที่ถูกเลื่อน "เพราะห้อง" (เทียบแผนเดียวกันที่ไม่สนห้อง) — วัดระยะเลื่อน · เลยหน้าต่างหมอ · ไม่มีสัญญาณ resourceShort
        {
          const p0 = PL.planDay({ ...input, services: services.map(({ resourceKinds: _k, ...x }) => { void _k; return x; }), jobs: jobs.map(({ resourceIds: _r, ...x }: any) => { void _r; return x; }), resources: undefined });
          for (const j of p.jobs) {
            const src = jobs.find((x) => x.id === j.jobId);
            if (src.kind !== "BOOKED" || j.state !== "SCHEDULED" || j.startAt == null) continue;
            const j0 = p0.jobs.find((x: any) => x.jobId === j.jobId);
            if (!j0 || j0.state !== "SCHEDULED" || j0.startAt == null) continue;
            const dm = Math.round((j.startAt - j0.startAt) / MIN);
            if (dm <= 0) continue;
            q10.delayed.push(dm);
            if (j0.startAt === src.startAt) q10.onTimeHit++;
            const st = staff.find((x) => x.id === j.staffId);
            const wEnd = st ? Math.max(...st.windows.map((w: any) => w.endAt)) : Infinity;
            if (j.endAt > wEnd && j0.endAt <= wEnd && !j.resourceShort) q10.pastWindow.push(`#${k} ${j.jobId} ${HM(j0.startAt)}→${HM(j.startAt)} จบ ${HM(j.endAt)} > ปิดหมอ ${HM(wEnd)}`);
            if (dm > 120 && !j.resourceShort && j.reason !== "LATE_ARRIVAL_AS_WALKIN") q10.far.push(`#${k} ${j.jobId}/${j.reason} เลื่อน ${dm} นาที (${HM(j0.startAt)}→${HM(j.startAt)})`);
          }
        }
        if (k % 20 === 0) {
          const sh = <V,>(xs: V[]) => { const c = [...xs]; for (let i = c.length - 1; i > 0; i--) { const m = Math.floor(r() * (i + 1)); [c[i], c[m]] = [c[m], c[i]]; } return c; };
          const p2 = PL.planDay({ ...input, jobs: sh(jobs), resources: sh(resources) });
          const norm = (x: any) => J([...x.jobs].sort((a: any, b: any) => a.jobId.localeCompare(b.jobId)));
          if (norm(p) !== norm(p2)) fails.det.push(`#${k}`);
          const sv = pick(services); const qv = PL.quoteWalkIn(input, { serviceId: sv.id });
          if (!["NONE", "STAFF", "RESOURCE", "BOTH"].includes(qv.limitedBy) || (qv.startAt != null && qv.startAt < now)) fails.quote.push(`#${k} ${J(qv).slice(0, 120)}`);
        }
      }
      ts.sort((a, b) => a - b);
      const pct = (f: number) => ts[Math.min(ts.length - 1, Math.floor(ts.length * f))];
      const perf = { n: N, p50: +pct(0.5).toFixed(3), p95: +pct(0.95).toFixed(3), p99: +pct(0.99).toFixed(3), max: +ts[ts.length - 1].toFixed(3) };
      console.log(`   ⏱  fuzz planDay: ${J(perf)}`);
      const core = ["cap", "block", "kind", "past", "quote", "det"].every((x) => fails[x].length === 0);
      rec("P16-fuzz", core, "CRITICAL", `fuzz ${N} ชุด: ความจุ/ปิดซ่อม/ชนิด/เวลาไม่ย้อน/quote/deterministic`, { perf, ...Object.fromEntries(Object.entries(fails).filter(([x]) => x !== "late" && x !== "delay").map(([x, v]) => [x, `${v.length} ${v.slice(0, 3).join(" · ")}`])) });
      rec("P16-late", fails.late.length === 0, "MAJOR", "fuzz: ตัววางคิววางงาน (walk-in/นัดที่เลื่อน) ทับห้องของนัดที่ปล่อยช่อง (RELEASED_LATE/NO_SHOW_DUE) ซึ่งฐานยังนับว่าถือ (§4.6) — สองสูตร", `${fails.late.length} ชุด · ${fails.late.slice(0, 3).join(" · ")}`);
      rec("P16-delay", fails.delay.length === 0, "MINOR", "fuzz: นัดที่ตัววางคิวเลื่อนตามหมอ (BOOKED_DELAYED/STAFF_UNAVAILABLE/BOOKED_MOVED_STAFF) คงห้องเดิมแม้ชนนัดอื่น/ปิดซ่อม และ resourceShort=false (จอ B.14 ไม่เห็น)", `${fails.delay.length} ชุด · ${fails.delay.slice(0, 3).join(" · ")}`);
      const dl = [...q10.delayed].sort((a, b) => a - b);
      const q10s = { delayedJobs: dl.length, onTimeDelayedByRoom: q10.onTimeHit, p50: dl[Math.floor(dl.length * 0.5)] ?? 0, p95: dl[Math.floor(dl.length * 0.95)] ?? 0, max: dl[dl.length - 1] ?? 0, over120NoSignal: q10.far.length, pastStaffWindowNoSignal: q10.pastWindow.length };
      console.log(`   ⏱  Q10 เลื่อนเพราะห้อง: ${J(q10s)}`);
      rec("P16-q10-window", q10.pastWindow.length === 0, "MAJOR", "Q10: นัดที่ถูกเลื่อนเพราะห้องต้องไม่จบเลยเวลางานของหมอ (ทั้งที่แผนไม่สนห้องจบทัน) โดยไม่มี resourceShort", `${q10.pastWindow.length} · ${q10.pastWindow.slice(0, 3).join(" · ")}`);
      rec("P16-q10-far", q10.far.length === 0, "MINOR", "Q10: นัด (ไม่นับมาสายเข้าแถว) ที่ถูกเลื่อนเพราะห้อง > 120 นาทีต้องมีสัญญาณ resourceShort (จอ B.14 เห็น)", { ...q10s, sample: q10.far.slice(0, 3) });
      rec("P16-perf", perf.p95 < 50, "MAJOR", "fuzz planDay p95 < 50 ms", perf);
    });
  }

  // ═══════════ ท้าย: invariant ทุกหน่วย ═══════════
  await step("INV", async () => {
    const bad: string[] = []; const phys: string[] = [];
    for (const u of units) { const s = await sweep(u.id); if (s.contract.length) bad.push(`${u.key}: ${s.contract.slice(0, 2).join(" · ")}`); if (s.physical.length) phys.push(`${u.key}: ${s.physical.slice(0, 1).join("")}`); }
    rec("INV-all", bad.length === 0, "CRITICAL", `SQL sweep ทุกหน่วย (${units.length}) หลังจบทุกฉาก: ไม่มีทรัพยากรถือเกินความจุ (§4.6) · ไม่ทับปิดซ่อม · ชนิดตรง · ไม่ถือของหน่วยอื่น`, { contract: bad, physical: phys });
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
