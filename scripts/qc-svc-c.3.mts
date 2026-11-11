// QC — SVC C.3 · สุขภาพตัวต่อ (เตือนเจ้าของ ERROR/โควตา #83 · มุมมองเรียกล่าสุด+กราฟเล็ก · ลบ call log 30 วัน · เมื่อล่มต่อหน่วย) · oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-c.3.md (§2 มติ · §3 สัญญาโค้ด · §4 DOM · §5 หน้า · §7 ฉาก · §10 คำขอเคาะ) · ledger/SVC-MASTER-PLAN.md แถว C.3
//        CC §2 (TenantIntegration · quota Json · onFailure · integration.failed) §1.3 (ค่าตั้งจากทะเบียน) · DH §5.3 · BQ §4.6 · ภาคผนวก ก หอ #83
//
// กลุ่มข้อ:
//   S  ไฟล์/facade/ค่าตั้ง #83/งานรายชั่วโมง/consumer/FAKE โควตา/สุขอนามัย/หน้า (+ S-1/S-2/S-13 git ท้ายไฟล์)
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ฉากร้านทดสอบ · R0.5 save/test → CONNECTED · ล้ม 5 ⇒ ERROR + integration.failed 1 · ตัวนับแจ้งเตือน · ตัวสแกนรั่ว · บล็อกเน็ต
//   E  เตือน ERROR: ครั้งเดียวต่อเหตุ · ผู้รับ = เจ้าของที่รับเชิญแล้ว · ข้อความ · ซ้ำ (X4) · พร้อมกัน 10 ทาง (X3) · ฟื้นแล้วตกใหม่ = เหตุใหม่ · replay เก่า · ฟื้นก่อนรับ · DRAFT · ถอด · event ปลอมข้ามร้าน · payload ขยะ
//   QA เตือนโควตา: quotaIsLow · ถี่ไม่เกิน 60 นาที · ครั้งเดียวต่อเหตุ · ฟื้น/ตกใหม่ · ขอบ 10% · ค่าตั้ง #83 ของร้าน · พร้อมกัน 8 ทาง (X5) · ไม่เรียก DRAFT/ERROR/DISABLED
//      · จำกัดร้าน · งบ (deadline/signal) · หมุนเวียนไม่อดอยาก (แถวล้มก็ขยับ) · ชนิดไม่มีโควตาไม่บังแถว
//   H  มุมมองสุขภาพ: ชุดคีย์พอดี · recent 20 ใหม่→เก่า · daily 14 วันไทย · ไม่นับ log ปลอมข้ามร้าน · quota view · list · X1 NOT_FOUND เดียวกัน · สิทธิ์/หน่วย · ไม่มีค่าลับ · ขยะไม่ throw
//   P  เมื่อล่มต่อหน่วย = onFailure ต่อแถว (ไม่ทำซ้ำ) · J  ลบ call log 30 วัน (positive control ของ R0.5 — ต้องเขียวตลอด)
//   U  DOM (IntegrationHealthPanel) · M  รั่ว/เน็ต · Z  ล้าง · SC ฉาก svcqc (ร้าน B) · G regression (r0.5 · r0.6 · smoke · หลังล้าง)
//
// 🔴 สร้างร้านเอง slug `qc-svc-c3-*` · ผู้ใช้ `svc-c3-*@shark.local` · label `svc-c3-<รอบ>-*` — ไม่เขียนค่าตั้ง/แถวของ svcqc (ยกเว้นฉาก SC ของ builder ในร้าน B) · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// 🔴 INTEGRATIONS_FAKE=1 + กุญแจสุ่มในโพรเซสนี้ (โพรเซสลูกได้ env เดียวกัน) · FAKE ไม่ยิงเน็ต · ครอบ fetch (นอกเครื่อง = บล็อก)
// 🔴 งานลบ call log เป็นงานข้ามร้าน (ลบแถวเกิน 30 วันของทุกร้านในฐาน QC — ตั้งใจ) · แถวอายุน้อยของ svcqc ต้องไม่ลด
// รัน: cd /root/projects/shark-svc-l4 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-c.3.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill กลางคัน · `--no-regression` = G เป็น SKIP)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { format, isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_OTHER, SQC_C3, SQC_INTEGRATION_HEALTH_SCENE } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-c.3";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_C3_NO_REGRESSION === "1";
const IS_CHILD = process.argv.includes("--child");
const F = {
  health: "src/lib/core/integrations/health.ts",
  index: "src/lib/core/integrations/index.ts",
  types: "src/lib/core/integrations/types.ts",
  service: "src/lib/core/integrations/service.ts",
  fake: "src/lib/core/integrations/providers/fake.ts",
  defs: "src/lib/core/settings/defs/integrations.ts",
  setTypes: "src/lib/core/settings/types.ts",
  setIndex: "src/lib/core/settings/index.ts",
  panel: "src/app/app/settings/integrations/IntegrationHealthPanel.tsx",
  page: "src/app/app/settings/integrations/page.tsx",
  hub: "src/app/app/settings/integrations/IntegrationsHub.tsx",
  actions: "src/app/app/settings/integrations/actions.ts",
  pageDir: "src/app/app/settings/integrations",
  consumers: "src/lib/outbox-consumers.ts",
  minute: "src/lib/platform/minute-jobs.ts",
  scene: "scripts/svc-qc-integration-health-scene.mts",
  fitness: "scripts/fitness.mts",
} as const;

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (v: unknown): string => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═══════════════ env ของศูนย์เชื่อมต่อ (โพรเซสลูกได้ค่าจากแม่) ═══════════════
const ENV_KEYS = ["INTEGRATIONS_CREDENTIALS_KEY", "INTEGRATIONS_FAKE"] as const;
const ENV_SAVED: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
if (!IS_CHILD) {
  process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
  process.env.INTEGRATIONS_FAKE = "1";
}

// ═══════════════ ครอบ fetch (ทั้งแม่และลูก) ═══════════════
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by qc" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;

// ═══════════════ โหมดโพรเซสลูก (`--child <base64url JSON>`) — ยิงพร้อมกันจากโพรเซสแยก (ไม่สร้าง/ไม่ล้างข้อมูล) ═══════════════
{
  const ix = process.argv.indexOf("--child");
  if (ix >= 0) {
    let out: unknown[] = [];
    try {
      const job = JSON.parse(Buffer.from(process.argv[ix + 1] ?? "", "base64url").toString("utf8")) as { op: string; items: Any[]; at: number };
      const I = (await import("@/lib/core/integrations" as string)) as Any;
      const OC = job.op === "consume" ? ((await import("@/lib/outbox-consumers" as string)) as Any) : null;
      const runOne = async (x: Any): Promise<unknown> => {
        if (job.op === "job") {
          if (typeof I.runIntegrationHealthJob !== "function") return { childFail: "ไม่มี runIntegrationHealthJob" };
          return I.runIntegrationHealthJob(new Date(x.now), x.opts);
        }
        if (job.op === "consume") { await OC.consumers["integration.failed"](x.evt); return { ok: true }; }
        if (job.op === "purge") return I.purgeIntegrationCallLogs(new Date(x.now));
        return { childFail: `op ${job.op}` };
      };
      const wait = job.at - Date.now();
      if (wait > 0) await sleep(wait);
      out = await Promise.all(job.items.map(async (x) => { try { return await runOne(x); } catch (e) { return { threw: errMsg(e) }; } }));
    } catch (e) { out = [{ childFail: errMsg(e) }]; }
    console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
    try { const { prisma } = (await import("@/lib/core/db" as string)) as Any; await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
    process.exit(0);
  }
}

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const ORIG = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
const out = (s: string) => ORIG.log(s);
const CAPTURED: string[] = [];
for (const k of ["log", "info", "warn", "error", "debug"] as const) console[k] = (...a: unknown[]) => { CAPTURED.push(format(...a)); ORIG[k](...a); };
class AssertFail extends Error {}
const fmt = (v: unknown): string => J(v).slice(0, 260);
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  out(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`, sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (existsSync(join(ROOT, rel)) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? (r?.threw ? `threw:${r.threw}` : r?.childFail ? `child:${r.childFail}` : J(r).slice(0, 80)));
const walk = (dir: string): string[] => {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : /\.(ts|tsx)$/.test(d.name) ? [join(dir, d.name)] : []));
};

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const intL = await tryImport("@/lib/core/integrations");
const I: Any = intL.mod;
const healthL = await loadIf(F.health);
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { out(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
const OC = (await tryImport("@/lib/outbox-consumers")).mod as Any;
const SETL = await tryImport("@/lib/core/settings");
const SET: Any = SETL.mod;
const MJL = await tryImport("@/lib/platform/minute-jobs");
const QH = (await tryImport("@/lib/core/quiet-hours")).mod as Any;
const REG_KEY = Symbol.for("shark.platform.minute-jobs.registry");
const minuteJob = (name: string): Any => ((globalThis as Any)[REG_KEY] as Map<string, Any> | undefined)?.get(name) ?? null;
const HFN = (name: string): ((...a: Any[]) => Any) => {
  const f = I?.[name];
  if (typeof f !== "function") throw new AssertFail(I ? `@/lib/core/integrations ยังไม่มี export ${name} (ใบสั่ง §3.2)${healthL.err ? ` · ${healthL.err}` : ""}` : `โหลด @/lib/core/integrations ไม่ได้: ${intL.err}`);
  return f;
};
const callH = async (name: string, ...args: unknown[]): Promise<Any> => { const f = HFN(name); try { return keep(await f(...args)); } catch (e) { return { ok: false, threw: errMsg(e) }; } };
const RESULTS: unknown[] = [];
const keep = <X,>(r: X): X => { RESULTS.push(r); return r; };

// ═══════════════ ค่าลับ · label ของรอบ ═══════════════
const RAND = randomBytes(3).toString("hex");
const SECRETS: string[] = [];
const sec = (tag: string) => { const s = `qcc3${tag}${randomBytes(12).toString("hex")}`; SECRETS.push(s); return s; };
const leaks = (v: unknown): string[] => { const s = J(v); return SECRETS.filter((x) => s.includes(x)).map((x) => `…${x.slice(-6)}`); };
const ACC = `acc-c3-${RAND}`;
const L = (tag: string) => `${SQC_C3.labelPrefix}${RAND}-${tag}`; // tag ยาว 3 ตัวเสมอ (ไม่มี label ใดเป็นส่วนหนึ่งของอีกตัว)
const DAY = 86_400_000;
const MIN = 60_000;
const START = new Date(Date.now() - 5_000);
const HEALTH_KEYS = ["daily", "id", "kind", "label", "onFailure", "provider", "quota", "recent", "status", "unitIds"];
const CALL_KEYS = ["at", "code", "ms", "ok", "op"];
const DAY_KEYS = ["avgMs", "day", "fail", "ok"];
const QUOTA_KEYS = ["checkedAt", "limit", "low", "percent", "remaining", "resetsAt"];
const keysOf = (o: Any) => (o && typeof o === "object" ? Object.keys(o).sort() : []);

// ═══════════════ ฐานข้อมูล: ล้าง ═══════════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const evIds: string[] = ((await prisma.outboxEvent.findMany({ where: { tenantId: { in: tids } }, select: { id: true } })) as { id: string }[]).map((e) => e.id);
  const sources = [...evIds, ...EXTRA_EVENT_IDS].map((id) => `${SQC_C3.alertSourcePrefix}${id}`);
  try { if (sources.length) await prisma.opsAlertState.deleteMany({ where: { source: { in: sources } } }); } catch (e) { out(`  ⚠️ ลบ OpsAlertState: ${errMsg(e)}`); }
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) out(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { out(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: SQC_C3.emailPrefix } } }); } catch (e) { out(`  ⚠️ ลบ user: ${errMsg(e)}`); }
  try { await prisma.integrationCallLog.deleteMany({ where: { integrationId: { startsWith: SQC_C3.labelPrefix } } }); } catch (e) { out(`  ⚠️ ลบ call log: ${errMsg(e)}`); }
}
const parkOutbox = async () => { if (tenantIds.length) await prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tenantIds); };

// ═══════════════ ยิงพร้อมกันจากโพรเซสลูก ═══════════════
const SYNC_MS = 12_000;
async function fanout(op: string, groups: Any[][], at: number): Promise<Any[]> {
  const outs = await Promise.all(groups.map((items) => new Promise<Any[]>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify({ op, items, at })).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      try { resolve(m ? (JSON.parse(m[1]) as Any[]) : items.map(() => ({ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` }))); }
      catch { resolve(items.map(() => ({ childFail: "อ่านผลลูกไม่ได้" }))); }
    });
  })));
  return outs.flat();
}
const atIn = (ms = SYNC_MS) => Date.now() + ms;
const inProcAt = async <T,>(at: number, calls: (() => Promise<T>)[]) => { const w = at - Date.now(); if (w > 0) await sleep(w); return Promise.all(calls.map(async (c) => { try { return await c(); } catch (e) { return { threw: errMsg(e) } as Any; } })); };
const badOf = (rs: Any[]) => rs.filter((r) => r?.threw || r?.childFail || /P2028|P2024|P2002|40P01|Unique constraint/i.test(J(r)));

// ═══════════════ ฉาก (ร้านทดสอบ A B C) ═══════════════
const tenantIds: string[] = [];
const EXTRA_EVENT_IDS: string[] = []; // id ของ event ปลอม (ไม่อยู่ใน OutboxEvent)
const T: Record<"A" | "B" | "C", string> = { A: "", B: "", C: "" };
const U: Record<string, string> = {};
type Actor = { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
const ACT: Record<string, Actor> = {};
const USERS: Record<string, string> = {};
const IDS: Record<string, string> = {};
const ROWT: Record<string, "A" | "B" | "C"> = {};
let ready = false;
const needReady = () => ok(ready, "ฉากข้อมูลทดสอบสร้างไม่สำเร็จ (ดู PC-1)");
const ctxOf = (k: "A" | "B" | "C") => ({ tenantId: T[k] });
const ownerOf = (k: "A" | "B" | "C"): Actor => (k === "A" ? ACT.oA1 : k === "B" ? ACT.oB : ACT.oC);
const id = (tag: string) => { const v = IDS[tag]; ok(v, `ยังไม่มีแถว ${tag} (ขั้นก่อนหน้าล้ม)`); return v; };
const rowOf = async (tag: string): Promise<Any> => prisma.tenantIntegration.findUnique({ where: { id: id(tag) } });

async function mkRow(k: "A" | "B" | "C", tag: string, kind: string, fields: Record<string, string> = {}, extra: Any = {}): Promise<string> {
  ok(typeof I?.saveIntegration === "function", `โหลด @/lib/core/integrations ไม่ได้: ${intL.err}`);
  const r = await I.saveIntegration(ctxOf(k), ownerOf(k), { create: true, kind, provider: "FAKE", label: L(tag), fields: { apiKey: sec(tag), accountId: ACC, mode: "OK", ...fields }, ...extra });
  if (r?.ok !== true) {
    const quotaF = Object.keys(fields).some((f) => f.startsWith("quota"));
    throw new AssertFail(`สร้าง ${tag} (${kind}) ไม่ได้: ${codeOf(r)}${quotaF && r?.code === "VALIDATION" ? " — FAKE ยังไม่มีฟิลด์ quotaRemaining/quotaLimit (ใบสั่ง §1 fake.ts)" : ` ${r?.message ?? ""}`}`);
  }
  IDS[tag] = r.integration.id;
  ROWT[tag] = k;
  return r.integration.id;
}
async function setF(tag: string, fields: Record<string, string>, extra: Any = {}) {
  const k = ROWT[tag];
  const row = await rowOf(tag);
  const r = await I.saveIntegration(ctxOf(k), ownerOf(k), { id: id(tag), kind: row.kind, provider: "FAKE", fields, ...extra });
  ok(r?.ok === true, `แก้ฟิลด์ ${tag} ไม่ได้: ${codeOf(r)}`);
}
const testRow = async (tag: string): Promise<Any> => keep(await I.testIntegration(ctxOf(ROWT[tag]), ownerOf(ROWT[tag]), { id: id(tag) }));
async function connect(tag: string) {
  const t = await testRow(tag);
  ok(t?.ok === true && t.passed === true, `test ${tag} ไม่ผ่าน: ${codeOf(t)}`);
  eq((await rowOf(tag))?.status, "CONNECTED", `${tag} status`);
}
async function failN(tag: string, n = 5) {
  await setF(tag, { mode: "FAIL" });
  for (let i = 0; i < n; i++) await testRow(tag);
}
const evShape = (r: Any) => ({ id: r.id, tenantId: r.tenantId, type: r.type, payload: r.payload, unitId: r.unitId ?? null });
const failedEvents = async (tag: string): Promise<Any[]> =>
  ((await prisma.outboxEvent.findMany({ where: { tenantId: T[ROWT[tag]], type: "integration.failed" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[])
    .filter((e) => e.payload?.integrationId === IDS[tag]).map(evShape);
const consume = async (evt: Any, type = "integration.failed"): Promise<Any> => {
  const f = OC?.consumers?.[type];
  if (typeof f !== "function") return { threw: `ไม่มี consumer ${type}` };
  try { await f(evt); return { ok: true }; } catch (e) { return { threw: errMsg(e) }; }
};
const notifsAll = async (): Promise<Any[]> => (tenantIds.length ? prisma.appNotification.findMany({ where: { tenantId: { in: tenantIds } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) : []);
const notifs = async (tag: string): Promise<Any[]> => (await notifsAll()).filter((n: Any) => String(n.title).includes(L(tag)) || String(n.body).includes(L(tag)));
const recips = (ns: Any[]) => ns.map((n: Any) => n.recipientUserId ?? "<ทั้งร้าน>").sort();
const quotaLogs = async (tag: string, extra: Any = {}) => prisma.integrationCallLog.count({ where: { integrationId: id(tag), op: "quota", ...extra } });
const job = async (now: Date | string | number, opts: Any): Promise<Any> => {
  const f = HFN("runIntegrationHealthJob");
  try { return keep(await f(new Date(now), opts)); } catch (e) { throw new AssertFail(`runIntegrationHealthJob throw: ${errMsg(e)} (ใบสั่ง §2.4 ห้าม throw)`); }
};
const iso = (d: Date | number | string) => new Date(d).toISOString();
const setQuotaJson = async (tag: string, q: Any) => { await prisma.tenantIntegration.update({ where: { id: id(tag) }, data: { quota: q } }); };
const ownersA = () => [USERS.oA1, USERS.oA2].sort();
const textOfN = (n: Any) => `${n.title} ${n.body}`;
const BAD_TEXT = /apiKey|secretBox|INTEGRATIONS_CREDENTIALS_KEY|PROVIDER_ERROR|TIMEOUT|NOT_READY|fake provider/;

out(`\n===== QC SVC C.3 · สุขภาพตัวต่อ · รอบ ${RAND} =====`);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SQC_C3.tenantSlugPrefix } }, select: { id: true } });
  if (stale.length) { out(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ S (ไม่แตะฐาน) ═══════════════
  out("\n── S โครงสร้าง ──");
  await st("S-3", "มีไฟล์ใหม่ของใบครบ 4 ไฟล์ (health.ts · defs/integrations.ts · IntegrationHealthPanel.tsx · ฉาก svcqc) (§1)", () => {
    const miss = [F.health, F.defs, F.panel, F.scene].filter((f) => !existsSync(join(ROOT, f)));
    ok(!miss.length, `ขาด ${miss.join(", ")}`);
  });
  await st("S-4", "facade @/lib/core/integrations: getIntegrationHealth · listIntegrationHealth · runIntegrationHealthJob · onIntegrationFailed · quotaIsLow + ค่าคงที่ (KEY · 20 · 14 · 60) (§3.2)", () => {
    ok(I, `โหลด facade ไม่ได้: ${intL.err}`);
    const miss = ["getIntegrationHealth", "listIntegrationHealth", "runIntegrationHealthJob", "onIntegrationFailed", "quotaIsLow"].filter((n) => typeof I[n] !== "function");
    ok(!miss.length, `ขาด ${miss.join(", ")}${healthL.err ? ` (${healthL.err})` : ""}`);
    eq([I.INTEGRATION_QUOTA_ALERT_KEY, I.INTEGRATION_HEALTH_RECENT, I.INTEGRATION_HEALTH_DAYS, I.INTEGRATION_QUOTA_CHECK_MINUTES], [SQC_C3.quotaKey, SQC_C3.recent, SQC_C3.days, SQC_C3.checkMinutes], "ค่าคงที่");
  });
  await st("S-5", "ค่าตั้ง #83 integrations.quota.alertPercent: domain integrations · ชั้น TENANT อย่างเดียว · ค่าเริ่ม 10 · ป้ายไทยมี 'โควตา' · ownerOnly · สิทธิ์ settings.integrations.manage · รับ 1/10/99 ปฏิเสธ 0/100/10.5/'10' (§2.1)", () => {
    ok(typeof SET?.getDef === "function", `โหลด @/lib/core/settings ไม่ได้: ${SETL.err}`);
    const d = SET.getDef(SQC_C3.quotaKey);
    ok(d, "ยังไม่มีนิยาม integrations.quota.alertPercent");
    eq([d.domain, J(d.chain), d.defaults?._fallback, d.editPermission], ["integrations", J(["TENANT"]), SQC_C3.quotaDefaultPercent, "settings.integrations.manage"], "domain/chain/ค่าเริ่ม/สิทธิ์");
    ok(THAI.test(d.labelTh ?? "") && /โควตา/.test(d.labelTh), `labelTh ${J(d.labelTh)}`);
    ok(d.ownerOnly === true && SET.isOwnerOnly?.(d) === true, "ต้อง ownerOnly");
    const acc = [1, 10, 99].map((v) => d.schema.safeParse(v).success);
    const rej = [0, 100, 10.5, "10"].map((v) => d.schema.safeParse(v).success);
    eq([acc, rej], [[true, true, true], [false, false, false, false]], "schema");
    ok((SET.listDefs?.("integrations") ?? []).some((x: Any) => x.key === SQC_C3.quotaKey), "listDefs(integrations) ไม่มีคีย์");
  });
  await st("S-6", "settings/types.ts: SettingDomain มี \"integrations\" · settings/index.ts import ./defs/integrations (§1)", () => {
    const t = stripComments(read(F.setTypes));
    const m = /export type SettingDomain\s*=([^;]*);/.exec(t);
    ok(m && /"integrations"/.test(m[1]), `SettingDomain = ${m?.[1]?.trim() ?? "?"}`);
    ok(/import\s+["']\.\/defs\/integrations["']/.test(stripComments(read(F.setIndex))), "settings/index.ts ไม่ import ./defs/integrations");
  });
  await st("S-7", "FAKE: ฟิลด์สาธารณะ quotaRemaining + quotaLimit (ไม่บังคับ · ป้ายไทย) ในแค็ตตาล็อก · ฟิลด์เดิม apiKey/accountId/mode คงอยู่ (§1 fake.ts)", () => {
    ok(typeof I?.integrationCatalog === "function", "ไม่มี integrationCatalog");
    const sv = I.integrationCatalog().find((c: Any) => c.kind === "SLIP_VERIFY");
    const fk = sv?.providers?.find((p: Any) => p.code === "FAKE");
    ok(fk, "SLIP_VERIFY ไม่มี FAKE (INTEGRATIONS_FAKE=1)");
    const by = Object.fromEntries((fk.fields ?? []).map((f: Any) => [f.name, f]));
    const bad = ["quotaRemaining", "quotaLimit"].filter((n) => !(by[n] && by[n].secret === false && by[n].required === false && THAI.test(by[n].label ?? "")));
    ok(!bad.length, `ฟิลด์ไม่ครบ/ผิด: ${bad.join(", ")} (มี ${Object.keys(by).join(",")})`);
    ok(["apiKey", "accountId", "mode"].every((n) => by[n]), "ฟิลด์เดิมหาย");
  }, "MAJOR");
  await st("S-8", "minute-jobs: integrations.health ทุก 60 นาที cadence minute (ส่ง deadline+signal) · integrations.calllog.purge คงรายวัน 1440 (§1)", () => {
    ok(MJL.mod, `โหลด minute-jobs ไม่ได้: ${MJL.err}`);
    const h = minuteJob("integrations.health"), p = minuteJob("integrations.calllog.purge");
    ok(h, "ไม่มีงาน integrations.health");
    eq([h.everyMinutes, h.cadence, h.vpsOnly], [60, "minute", false], "integrations.health");
    ok(p && p.everyMinutes === 1440 && p.cadence === "daily", `purge ${J(p && { e: p.everyMinutes, c: p.cadence })}`);
    const s = stripComments(read(F.minute));
    const i = s.indexOf('"integrations.health"');
    const blk = i >= 0 ? s.slice(i, i + 600) : "";
    ok(/runIntegrationHealthJob\s*\(/.test(blk) && /deadline/.test(blk) && /signal/.test(blk) && /import\(\s*["']@\/lib\/core\/integrations["']\s*\)/.test(blk), "บล็อกงานต้อง lazy import facade + ส่ง deadline/signal");
  }, "MAJOR");
  await st("S-9", "consumer integration.failed → onIntegrationFailed (dynamic import facade) · integration.connected คง no-op (§1)", () => {
    const s = stripComments(read(F.consumers));
    ok(/"integration\.failed"\s*:\s*withAutomation\(\s*async\s*\(\s*evt\s*\)\s*=>\s*\(\s*await\s+import\(\s*["']@\/lib\/core\/integrations["']\s*\)\s*\)\.onIntegrationFailed\(\s*evt\s*\)\s*\)/.test(s), "บรรทัด integration.failed ไม่ตรงสัญญา");
    ok(/"integration\.connected"\s*:\s*withAutomation\(\s*async\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(s), "integration.connected ไม่ใช่ no-op เดิม");
  }, "MAJOR");
  await st("S-10", "health.ts สุขอนามัย: ไม่มี any · ไม่ import POS/แชท/payment/โมดูล · ไม่มี getDay/getDate/getHours ดิบ · ใช้ bkkYmd/bkkParts · ไม่มี console.log · ล็อกแถว FOR UPDATE · กันซ้ำ source integration-alert:failed: (§2.2)", () => {
    const raw = read(F.health);
    ok(raw, "ยังไม่มี health.ts");
    const s = stripComments(raw);
    const bad: string[] = [];
    if (/:\s*any\b|\bas\s+any\b|<any>/.test(s)) bad.push("any");
    if (/from\s+["']@\/lib\/(modules|payment)\//.test(s) || /import\(\s*["']@\/lib\/(modules|payment)\//.test(s)) bad.push("import โมดูล/payment");
    if (/\.(getDay|getDate|getHours|getMonth|getFullYear)\(/.test(s)) bad.push("getDay/getDate ดิบ");
    if (!/bkkYmd|bkkParts|bkkDayStart/.test(s)) bad.push("ไม่ใช้ตัวช่วยเวลาไทย");
    if (/console\.log\(/.test(s)) bad.push("console.log");
    if (!/FOR UPDATE/i.test(s)) bad.push("ไม่มีล็อกแถว");
    if (!s.includes(SQC_C3.alertSourcePrefix)) bad.push("ไม่มี source integration-alert:failed:");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-11", "หน้า: page.tsx เรียก listIntegrationHealth · ใช้ IntegrationHealthPanel · ค่าตั้ง #83 ผ่าน SettingsForm + loadSettingsForm(domains integrations) · ไฟล์ 'use client' ไม่ import facade · ไม่มี secretBox ในโฟลเดอร์ (§5)", () => {
    const bad: string[] = [];
    const files = walk(F.pageDir);
    const all = files.map((f) => stripComments(read(f))).join("\n");
    if (!/listIntegrationHealth\s*\(/.test(stripComments(read(F.page)))) bad.push("page.tsx ไม่เรียก listIntegrationHealth");
    if (!/IntegrationHealthPanel/.test(stripComments(read(F.hub)) + stripComments(read(F.page)))) bad.push("hub/page ไม่ใช้ IntegrationHealthPanel");
    if (!/loadSettingsForm\s*\(/.test(all) || !/SettingsForm/.test(all) || !/["']integrations["']/.test(all)) bad.push("ไม่มี SettingsForm/loadSettingsForm ของ domain integrations");
    for (const f of files) {
      const src = read(f);
      if (/^\s*["']use client["']/.test(src) && /from\s+["']@\/lib\/core\/integrations(\/(service|secret-box|index|health))?["']/.test(stripComments(src).replace(/import\s+type[^;]*;/g, ""))) bad.push(`${f} (client) import facade/service`);
      if (/secretBox/.test(src)) bad.push(`${f} มีคำ secretBox`);
    }
    const p = read(F.panel);
    if (!/^\s*["']use client["']/.test(p)) bad.push("panel ไม่ขึ้นต้น 'use client'");
    if (/from\s+["'](@\/lib\/core\/db|@prisma\/client|next\/[^"']*|@\/lib\/core\/integrations["']|@\/lib\/core\/integrations\/(service|secret-box|health|index))/.test(p)) bad.push("panel import ของ server");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("QA-1", "quotaIsLow (pure · §2.2): 100/1000@10 ต่ำ · 101/1000 ไม่ · 0 ไม่มี limit ต่ำ · 5 ไม่มี limit ไม่ · null ไม่ · limit 0 ไม่ · 250/1000@25 ต่ำ · undefined ไม่", () => {
    const f = HFN("quotaIsLow");
    const got = [f({ remaining: 100, limit: 1000 }, 10), f({ remaining: 101, limit: 1000 }, 10), f({ remaining: 0 }, 10), f({ remaining: 5 }, 10), f({ remaining: null, limit: 1000 }, 10), f({ remaining: 50, limit: 0 }, 10), f({ remaining: 250, limit: 1000 }, 25), f(undefined, 10)];
    eq(got, [true, false, true, false, false, false, true, false], "ผล");
  });

  // ═══════════════ PC ตัวควบคุม (ฉาก) ═══════════════
  out("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฉาก: ร้าน A (เจ้าของ 2 + เจ้าของยังไม่รับเชิญ 1 + MANAGER + STAFF ถือคีย์จำกัดหน่วย + STAFF) · ร้าน B · ร้าน C · หน่วย · FAKE เปิด · มีกุญแจ", async () => {
    const STAMP = `${Date.now().toString(36)}${RAND}`;
    const mkTenant = async (k: "A" | "B" | "C") => { const t = await prisma.tenant.create({ data: { name: `QC C3 ${k}`, slug: `${SQC_C3.tenantSlugPrefix}${k.toLowerCase()}-${STAMP}` } }); tenantIds.push(t.id); T[k] = t.id; };
    await mkTenant("A"); await mkTenant("B"); await mkTenant("C");
    const mkUnit = async (k: "A" | "B" | "C", tag: string) => { U[tag] = (await prisma.businessUnit.create({ data: { tenantId: T[k], type: "BOOKING", name: `QC C3 ${tag}`, slug: `c3${tag}-${STAMP}`.toLowerCase() } })).id; };
    await mkUnit("A", "A1"); await mkUnit("A", "A2"); await mkUnit("B", "B1"); await mkUnit("C", "C1");
    const mkUser = async (key: string, k: "A" | "B" | "C", role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}, accepted = true) => {
      const u = await prisma.user.create({ data: { email: `${SQC_C3.emailPrefix}${STAMP}-${key}@shark.local`, name: `QC C3 ${key}` } });
      await prisma.membership.create({ data: { userId: u.id, tenantId: T[k], role, unitAccess, permissions, acceptedAt: accepted ? new Date() : null } });
      USERS[key] = u.id;
      ACT[key] = { userId: u.id, role, unitAccess, permissions };
    };
    await mkUser("oA1", "A", "OWNER", ["*"]);
    await mkUser("oA2", "A", "OWNER", ["*"]);
    await mkUser("oA3", "A", "OWNER", ["*"], {}, false);
    await mkUser("mgrA", "A", "MANAGER", [U.A1, U.A2]);
    await mkUser("keyA", "A", "STAFF", [U.A1], { "settings.integrations.manage": true });
    await mkUser("stA", "A", "STAFF", [U.A1]);
    await mkUser("oB", "B", "OWNER", ["*"]);
    await mkUser("oC", "C", "OWNER", ["*"]);
    ok(I?.integrationSecretKeyConfigured?.() === true, "กุญแจของศูนย์ฯ ไม่ถูกตั้ง");
    const sv = I.integrationCatalog().find((c: Any) => c.kind === "SMS");
    ok(sv?.providers?.some((p: Any) => p.code === "FAKE"), "FAKE ไม่เปิด");
    ready = true;
  });
  await st("PC-2", "R0.5: SMS E01 (REJECT) save → DRAFT · test (OK) ⇒ CONNECTED + integration.connected 1", async () => {
    needReady();
    await mkRow("A", "e01", "SMS", {}, { onFailure: "REJECT", unitIds: [] });
    eq((await rowOf("e01"))?.status, "DRAFT", "สถานะหลังบันทึก");
    await connect("e01");
    const ev = ((await prisma.outboxEvent.findMany({ where: { tenantId: T.A, type: "integration.connected" } })) as Any[]).filter((e) => e.payload?.integrationId === IDS.e01);
    eq(ev.length, 1, "event connected");
  });
  await st("PC-3", "R0.5: E01 ล้ม 5 ครั้ง (FAKE mode FAIL สะท้อน apiKey) ⇒ ERROR + integration.failed 1 · lastError ไม่มีคีย์ (positive control ของเหตุ ERROR)", async () => {
    await failN("e01");
    const row = await rowOf("e01");
    eq(row?.status, "ERROR", "status");
    eq((await failedEvents("e01")).length, 1, "event failed");
    eq(leaks(row?.lastError), [], "lastError รั่ว");
    await parkOutbox();
  });
  await st("PC-4", "ตัวควบคุม: consumer integration.failed มีอยู่ · ตัวนับแจ้งเตือนเจอแถวที่ใส่เอง (แล้วลบ) · ตัวสแกนรั่วจับค่าลับที่ฝังได้ · fetch นอกเครื่องถูกบล็อก", async () => {
    needReady();
    ok(typeof OC?.consumers?.["integration.failed"] === "function", "ไม่มี consumer integration.failed");
    const n = await prisma.appNotification.create({ data: { tenantId: T.C, title: `ทดสอบ ${L("pcx")}`, body: "x", recipientUserId: USERS.oC } });
    eq((await notifs("pcx")).length, 1, "ตัวนับแจ้งเตือน");
    await prisma.appNotification.delete({ where: { id: n.id } });
    eq((await notifs("pcx")).length, 0, "ลบแจ้งเตือนทดสอบ");
    eq(leaks({ x: `..${SECRETS[0]}..` }).length, 1, "ตัวสแกนรั่ว");
    const r = await fetch("https://qc-c3.invalid/ping");
    ok(r.status === 503 && BLOCKED.includes("qc-c3.invalid"), "fetch ไม่ถูกบล็อก");
    BLOCKED.length = 0;
  }, "MAJOR");

  // ═══════════════ E เตือน ERROR ═══════════════
  out("\n── E เตือน ERROR ──");
  const e01ev: Any[] = [];
  await st("E-1", "รับ event failed ของ E01 ⇒ แจ้งเตือน 1 แถวต่อเจ้าของที่รับเชิญแล้ว (oA1 oA2) · ไม่ถึงเจ้าของที่ยังไม่รับเชิญ/MANAGER/STAFF ถือคีย์/STAFF · ไม่มีแถวทั้งร้าน · ร้าน B/C ไม่มี", async () => {
    e01ev.push(...(await failedEvents("e01")));
    ok(e01ev.length === 1, `event failed ${e01ev.length}`);
    const r = await consume(e01ev[0]);
    ok(!r.threw, `consumer throw: ${r.threw}`);
    const ns = await notifs("e01");
    eq(recips(ns), ownersA(), "ผู้รับ");
    ok(ns.every((n: Any) => n.tenantId === T.A), "แจ้งข้ามร้าน");
    eq((await notifsAll()).filter((n: Any) => n.tenantId !== T.A).length, 0, "ร้าน B/C มีแจ้งเตือน");
  });
  await st("E-2", "ข้อความ ERROR: title มี «label» + 'ขัดข้อง' · REJECT ⇒ body มี 'ปฏิเสธ' · ไทย · ไม่มีค่าลับ/apiKey/ชื่อ env/รหัสอังกฤษ/ข้อความดิบของผู้ให้บริการ (§2.2)", async () => {
    const ns = await notifs("e01");
    ok(ns.length > 0, "ไม่มีแจ้งเตือน");
    for (const n of ns) {
      ok(String(n.title).includes(`«${L("e01")}»`) && /ขัดข้อง/.test(n.title), `title ${J(n.title)}`);
      ok(THAI.test(n.body) && /ปฏิเสธ/.test(n.body), `body (REJECT) ${J(n.body).slice(0, 160)}`);
      ok(!BAD_TEXT.test(textOfN(n)), `ข้อความมีของต้องห้าม ${J(textOfN(n)).slice(0, 160)}`);
      eq(leaks(n), [], "ค่าลับ");
    }
  });
  await st("E-3", "X4: ส่ง event เดิมซ้ำ 2 รอบ ⇒ ยังเท่าเดิม (2)", async () => {
    ok(e01ev[0], "ไม่มี event");
    await consume(e01ev[0]); await consume(e01ev[0]);
    eq((await notifs("e01")).length, 2, "จำนวน");
  });
  await st("E-4", "X3: E02 (MANUAL) ตก ERROR · รับ event เดียวกันพร้อมกัน 10 ทาง (3 โพรเซส × 3 + ในโพรเซส 1) ⇒ แจ้ง 2 แถวพอดี · body มี 'ตรวจมือ' · ไม่ throw", async () => {
    needReady();
    await mkRow("A", "e02", "SMS", {}, { onFailure: "MANUAL", unitIds: [] });
    await connect("e02"); await failN("e02"); await parkOutbox();
    const ev = await failedEvents("e02");
    ok(ev.length === 1, `event ${ev.length}`);
    const at = atIn();
    const [kids, mine] = await Promise.all([fanout("consume", [0, 1, 2].map(() => [0, 1, 2].map(() => ({ evt: ev[0] }))), at), inProcAt(at, [() => consume(ev[0])])]);
    eq(badOf([...kids, ...mine]).map((x) => J(x).slice(0, 80)), [], "ผลผิดปกติ");
    const ns = await notifs("e02");
    eq(recips(ns), ownersA(), "ผู้รับ");
    ok(ns.every((n: Any) => /ตรวจมือ/.test(n.body)), `body (MANUAL) ${J(ns[0]?.body).slice(0, 160)}`);
  });
  await st("E-5", "ฟื้น (test ผ่าน ⇒ CONNECTED · event connected ไม่เตือน) แล้วตกใหม่ ⇒ event failed ตัวที่ 2 ⇒ เหตุใหม่ แจ้งอีก 2 (รวม 4)", async () => {
    await setF("e01", { mode: "OK" }); await connect("e01");
    const cev = ((await prisma.outboxEvent.findMany({ where: { tenantId: T.A, type: "integration.connected" }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => e.payload?.integrationId === IDS.e01).map(evShape);
    for (const c of cev) await consume(c, "integration.connected");
    eq((await notifs("e01")).length, 2, "หลังฟื้น");
    await failN("e01"); await parkOutbox();
    const ev = await failedEvents("e01");
    ok(ev.length === 2, `event failed ${ev.length}`);
    e01ev.push(ev[1]);
    await consume(ev[1]);
    const ns = await notifs("e01");
    eq(ns.length, 4, "จำนวนรวม");
    eq(recips(ns), [...ownersA(), ...ownersA()].sort(), "ผู้รับ");
  });
  await st("E-6", "X4: replay event เก่า (เหตุแรก) หลังเหตุที่สองเตือนแล้ว ⇒ ไม่เพิ่ม (4)", async () => {
    ok(e01ev.length === 2, "ขั้นก่อนหน้าล้ม");
    await consume(e01ev[0]); await consume(e01ev[1]);
    eq((await notifs("e01")).length, 4, "จำนวน");
  });
  await st("E-7", "ฟื้นก่อน consumer ได้รับ: E03 ตก ERROR แล้วกลับ CONNECTED ⇒ รับ event ⇒ ไม่เตือน", async () => {
    needReady();
    await mkRow("A", "e03", "SMS", {}, { unitIds: [] });
    await connect("e03"); await failN("e03"); await parkOutbox();
    const ev = await failedEvents("e03");
    ok(ev.length === 1, `event ${ev.length}`);
    await setF("e03", { mode: "OK" }); await connect("e03");
    await consume(ev[0]);
    eq((await notifs("e03")).length, 0, "แจ้งเตือน");
  });
  await st("E-8", "DRAFT ล้มครบ 5 ⇒ ERROR ไม่มี event (R-6) · งานรายชั่วโมงก็ไม่เตือน ⇒ 0", async () => {
    needReady();
    await mkRow("A", "e04", "SMS", {}, { unitIds: [] });
    await failN("e04");
    eq((await rowOf("e04"))?.status, "ERROR", "status");
    eq((await failedEvents("e04")).length, 0, "event");
    if (typeof I?.runIntegrationHealthJob === "function") await job("2026-09-01T03:00:00.000Z", { tenantId: T.A });
    eq((await notifs("e04")).length, 0, "แจ้งเตือน");
  }, "MAJOR");
  await st("E-9", "X1: event ปลอม tenantId ร้าน B แต่ integrationId เป็นของร้าน A (E02 ยัง ERROR) ⇒ ไม่เตือนใครเพิ่ม · ร้าน B ไม่มีแจ้งเตือน", async () => {
    const fid = `svc-c3-forged-${RAND}`;
    EXTRA_EVENT_IDS.push(fid);
    const before = (await notifs("e02")).length;
    const r = await consume({ id: fid, tenantId: T.B, type: "integration.failed", payload: { integrationId: id("e02"), kind: "SMS", provider: "FAKE" }, unitId: null });
    ok(!r.threw, `throw ${r.threw}`);
    eq((await notifs("e02")).length, before, "จำนวนแจ้ง E02");
    eq((await notifsAll()).filter((n: Any) => n.tenantId === T.B).length, 0, "ร้าน B");
  });
  await st("E-10", "ถอดแล้ว (DISABLED) ก่อนรับ event ⇒ ไม่เตือน", async () => {
    needReady();
    await mkRow("A", "e05", "SMS", {}, { unitIds: [] });
    await connect("e05"); await failN("e05"); await parkOutbox();
    const ev = await failedEvents("e05");
    ok(ev.length === 1, `event ${ev.length}`);
    const d = await I.disableIntegration(ctxOf("A"), ACT.oA1, { id: id("e05") });
    ok(d?.ok === true, `disable ${codeOf(d)}`);
    await consume(ev[0]);
    eq((await notifs("e05")).length, 0, "แจ้งเตือน");
  }, "MAJOR");
  await st("E-11", "payload ขยะ (null · {} · integrationId ไม่ใช่ข้อความ · ไม่มีแถว) ⇒ consumer ไม่ throw · ไม่มีแจ้งเตือนใหม่", async () => {
    needReady();
    const n0 = (await notifsAll()).length;
    const bad: string[] = [];
    for (const [i, payload] of [null, {}, { integrationId: 42 }, { integrationId: `nope-${RAND}` }].entries()) {
      const fid = `svc-c3-junk${i}-${RAND}`;
      EXTRA_EVENT_IDS.push(fid);
      const r = await consume({ id: fid, tenantId: T.A, type: "integration.failed", payload, unitId: null });
      if (r.threw) bad.push(`${J(payload)} → ${r.threw}`);
    }
    eq(bad, [], "throw");
    eq((await notifsAll()).length, n0, "แจ้งเตือนใหม่");
  }, "MAJOR");

  // ═══════════════ QA เตือนโควตา ═══════════════
  out("\n── QA เตือนโควตา ──");
  const TQ = Date.parse("2026-09-10T03:00:00.000Z");
  const atQ = (min: number) => new Date(TQ + min * MIN);
  await st("QA-2", "Q01 (500/1000) + แถวที่ห้ามเรียก (DRAFT · DISABLED · ERROR) · รอบแรก ⇒ เรียก quota() 1 ครั้ง · quota = {remaining 500, limit 1000, resetsAt null, checkedAt = now, lowAlertedAt null} · ไม่เตือน (§2.3)", async () => {
    needReady();
    await mkRow("A", "q01", "SLIP_VERIFY", { quotaRemaining: "500", quotaLimit: "1000" }, { unitIds: [] });
    await connect("q01");
    await mkRow("A", "qd1", "SLIP_VERIFY", { quotaRemaining: "0", quotaLimit: "1000" }, { unitIds: [] }); // DRAFT
    await mkRow("A", "qx1", "SLIP_VERIFY", { quotaRemaining: "0", quotaLimit: "1000" }, { unitIds: [] });
    await connect("qx1");
    ok((await I.disableIntegration(ctxOf("A"), ACT.oA1, { id: id("qx1") }))?.ok === true, "disable qx1");
    await mkRow("A", "qe1", "SLIP_VERIFY", { quotaRemaining: "0", quotaLimit: "1000" }, { unitIds: [] });
    await failN("qe1"); await setF("qe1", { mode: "OK" }); // DRAFT ล้ม 5 ⇒ ERROR (ไม่มี event) · กลับ mode OK แต่สถานะยัง ERROR
    eq((await rowOf("qe1"))?.status, "ERROR", "qe1 status");
    const r = await job(atQ(0), { tenantId: T.A });
    ok(r && typeof r.checked === "number" && typeof r.alerted === "number" && r.checked >= 1, `ผลคืน ${J(r)}`);
    const q = (await rowOf("q01"))?.quota;
    eq(q, { remaining: 500, limit: 1000, resetsAt: null, checkedAt: iso(atQ(0)), lowAlertedAt: null }, "quota");
    eq(await quotaLogs("q01", { ok: true }), 1, "call log quota");
    eq((await notifs("q01")).length, 0, "แจ้งเตือน");
  });
  await st("QA-3", "ภายใน 60 นาทีไม่เรียกซ้ำ: เปลี่ยนเหลือ 80 แล้วรัน (+30 นาที) ⇒ quota ยัง 500 · call log ยัง 1", async () => {
    await setF("q01", { quotaRemaining: "80" });
    await job(atQ(30), { tenantId: T.A });
    eq((await rowOf("q01"))?.quota?.remaining, 500, "remaining");
    eq(await quotaLogs("q01"), 1, "call log");
  }, "MAJOR");
  await st("QA-4", "+61 นาที: เหลือ 80/1000 (8% ≤ 10) ⇒ แจ้งเจ้าของ 2 คน 1 ครั้ง · lowAlertedAt ตั้ง · ข้อความมี «label» + 'โควตา' + เลขคงเหลือ · ไม่มีค่าลับ", async () => {
    const r = await job(atQ(61), { tenantId: T.A });
    const q = (await rowOf("q01"))?.quota;
    ok(q?.remaining === 80 && typeof q?.lowAlertedAt === "string", `quota ${J(q)}`);
    ok(r?.alerted >= 1, `alerted ${J(r)}`);
    const ns = await notifs("q01");
    eq(recips(ns), ownersA(), "ผู้รับ");
    for (const n of ns) {
      ok(String(n.title).includes(`«${L("q01")}»`) && /โควตา/.test(textOfN(n)) && /80/.test(n.body), `ข้อความ ${J(textOfN(n)).slice(0, 160)}`);
      ok(!BAD_TEXT.test(textOfN(n)) && !leaks(n).length, "ข้อความมีของต้องห้าม/ค่าลับ");
    }
  });
  await st("QA-5", "X5: รันต่อ (+122 นาที) ยังต่ำ ⇒ ไม่แจ้งซ้ำ (2)", async () => {
    await job(atQ(122), { tenantId: T.A });
    eq((await notifs("q01")).length, 2, "จำนวน");
  });
  await st("QA-6", "เติมเป็น 900 (+183 นาที) ⇒ เหตุจบ: lowAlertedAt = null · ไม่แจ้ง", async () => {
    await setF("q01", { quotaRemaining: "900" });
    await job(atQ(183), { tenantId: T.A });
    const q = (await rowOf("q01"))?.quota;
    ok(q?.remaining === 900 && q?.lowAlertedAt === null, `quota ${J(q)}`);
    eq((await notifs("q01")).length, 2, "จำนวน");
  });
  await st("QA-7", "ตกใหม่เหลือ 50 (+244 นาที) ⇒ เหตุใหม่ แจ้งอีก 2 (รวม 4)", async () => {
    await setF("q01", { quotaRemaining: "50" });
    await job(atQ(244), { tenantId: T.A });
    eq((await notifs("q01")).length, 4, "จำนวน");
  });
  await st("QA-8", "ขอบ (+305 นาที): 100/1000 = 10% ⇒ แจ้ง · 101/1000 ⇒ ไม่ · 0 ไม่มี limit ⇒ แจ้ง · 5 ไม่มี limit ⇒ ไม่ · Q01 ไม่เพิ่ม", async () => {
    needReady();
    for (const [tag, f] of [["qb1", { quotaRemaining: "100", quotaLimit: "1000" }], ["qb2", { quotaRemaining: "101", quotaLimit: "1000" }], ["qz0", { quotaRemaining: "0" }], ["qn5", { quotaRemaining: "5" }]] as const) {
      await mkRow("A", tag, "SLIP_VERIFY", { ...f }, { unitIds: [] });
      await connect(tag);
    }
    await job(atQ(305), { tenantId: T.A });
    eq([(await notifs("qb1")).length, (await notifs("qb2")).length, (await notifs("qz0")).length, (await notifs("qn5")).length, (await notifs("q01")).length], [2, 0, 2, 0, 4], "จำนวน [qb1 qb2 qz0 qn5 q01]");
  });
  await st("QA-9", "ค่าตั้ง #83 ของร้าน B = 25 (ชั้น TENANT): 200/1000 (20%) ไม่แจ้งตอนค่าเริ่ม 10 · หลังตั้ง 25 แจ้งเจ้าของ B 1 คน · ร้าน A ไม่กระทบ", async () => {
    needReady();
    await mkRow("B", "qt1", "SLIP_VERIFY", { quotaRemaining: "200", quotaLimit: "1000" }, { unitIds: [] });
    await connect("qt1");
    const nA = (await notifsAll()).filter((n: Any) => n.tenantId === T.A).length;
    await job(atQ(0), { tenantId: T.B });
    eq((await notifs("qt1")).length, 0, "ก่อนตั้งค่า");
    await prisma.settingValue.create({ data: { tenantId: T.B, key: SQC_C3.quotaKey, scope: "TENANT", scopeId: T.B, value: 25, setById: USERS.oB } });
    await job(atQ(61), { tenantId: T.B });
    eq(recips(await notifs("qt1")), [USERS.oB], "ผู้รับหลังตั้ง 25");
    eq((await notifsAll()).filter((n: Any) => n.tenantId === T.A).length, nA, "ร้าน A");
  });
  await st("QA-10", "X5: Q0C (10/1000) รันงานพร้อมกัน 8 ทาง (3 โพรเซส × 2 + ในโพรเซส 2) ⇒ แจ้ง 2 แถวพอดี (เหตุละครั้ง) · ไม่ throw · แถวอื่นไม่เพิ่ม", async () => {
    needReady();
    await mkRow("A", "q0c", "SLIP_VERIFY", { quotaRemaining: "10", quotaLimit: "1000" }, { unitIds: [] });
    await connect("q0c");
    ok(typeof I?.runIntegrationHealthJob === "function", "ยังไม่มี runIntegrationHealthJob");
    const now = iso(atQ(400));
    const at = atIn();
    const [kids, mine] = await Promise.all([
      fanout("job", [0, 1, 2].map(() => [0, 1].map(() => ({ now, opts: { tenantId: T.A } }))), at),
      inProcAt(at, [() => I.runIntegrationHealthJob(new Date(now), { tenantId: T.A }), () => I.runIntegrationHealthJob(new Date(now), { tenantId: T.A })]),
    ]);
    eq(badOf([...kids, ...mine]).map((x) => J(x).slice(0, 80)), [], "ผลผิดปกติ");
    eq(recips(await notifs("q0c")), ownersA(), "ผู้รับ Q0C");
    eq([(await notifs("q01")).length, (await notifs("qb1")).length, (await notifs("qz0")).length], [4, 2, 2], "แถวอื่น");
  });
  await st("QA-11", "ไม่เรียก DRAFT / DISABLED / ERROR (แม้ตั้งโควตา 0): ไม่มี call log op quota · ไม่มีแจ้งเตือน (§2.4)", async () => {
    eq([await quotaLogs("qd1"), await quotaLogs("qx1"), await quotaLogs("qe1")], [0, 0, 0], "call log quota [DRAFT DISABLED ERROR]");
    eq([(await notifs("qd1")).length, (await notifs("qx1")).length, (await notifs("qe1")).length], [0, 0, 0], "แจ้งเตือน");
  });
  await st("QA-13", "งบ: deadline เลยแล้ว / signal abort ⇒ checked 0 · ไม่มี call log ใหม่ · ไม่ throw", async () => {
    needReady();
    const n0 = await prisma.integrationCallLog.count({ where: { tenantId: T.A, op: "quota" } });
    const r1 = await job(atQ(600), { tenantId: T.A, deadline: Date.now() - 1 });
    const ac = new AbortController(); ac.abort();
    const r2 = await job(atQ(600), { tenantId: T.A, signal: ac.signal });
    eq([r1?.checked, r2?.checked], [0, 0], "checked");
    eq(await prisma.integrationCallLog.count({ where: { tenantId: T.A, op: "quota" } }), n0, "call log ใหม่");
  }, "MAJOR");
  const TR = Date.parse("2026-09-20T03:00:00.000Z");
  await st("QA-14", "ไม่อดอยาก (ร้าน C · maxRows 5): แถวล้ม 5 แถว (checkedAt เก่ากว่า) + แถวต่ำ 1 แถว ⇒ รอบ 1 เรียก 5 แถวล้ม (checkedAt ขยับแม้ล้ม · remaining คงเดิม · ไม่แจ้ง) · รอบ 2 ถึงแถวต่ำ ⇒ แจ้งเจ้าของ C · X1 ร้าน A ไม่ถูกแตะ (QA-12)", async () => {
    needReady();
    const fails = ["rf1", "rf2", "rf3", "rf4", "rf5"];
    for (const t of fails) { await mkRow("C", t, "SLIP_VERIFY", { quotaRemaining: "900", quotaLimit: "1000" }, { unitIds: [] }); await connect(t); await setF(t, { mode: "FAIL" }); await setQuotaJson(t, { remaining: null, limit: null, resetsAt: null, checkedAt: iso(TR - 5 * 60 * MIN), lowAlertedAt: null }); }
    await mkRow("C", "rlo", "SLIP_VERIFY", { quotaRemaining: "1", quotaLimit: "1000" }, { unitIds: [] });
    await connect("rlo");
    await setQuotaJson("rlo", { remaining: null, limit: null, resetsAt: null, checkedAt: iso(TR - 2 * 60 * MIN), lowAlertedAt: null });
    const r1 = await job(TR, { tenantId: T.C, maxRows: 5 });
    eq(r1?.checked, 5, "รอบ 1 checked");
    eq((await notifs("rlo")).length, 0, "รอบ 1 แจ้ง rlo");
    const qs = await Promise.all(fails.map(async (t) => (await rowOf(t))?.quota));
    eq(qs.map((q) => [q?.checkedAt, q?.remaining]), fails.map(() => [iso(TR), null]), "แถวล้ม: checkedAt ขยับ · remaining คงเดิม");
    eq(await Promise.all(fails.map((t) => quotaLogs(t, { ok: false }))), [1, 1, 1, 1, 1], "call log ล้ม");
    const r2 = await job(TR, { tenantId: T.C, maxRows: 5 });
    eq([r2?.checked, r2?.alerted], [1, 1], "รอบ 2 checked/alerted");
    eq(recips(await notifs("rlo")), [USERS.oC], "ผู้รับ rlo");
  });
  await st("QA-12", "X1: งานจำกัดร้าน C ไม่แตะแถวของร้าน A (quota ของ Q01 ไม่เปลี่ยน · ไม่มี call log ใหม่ของร้าน A)", async () => {
    const q0 = J((await rowOf("q01"))?.quota);
    const n0 = await prisma.integrationCallLog.count({ where: { tenantId: T.A } });
    await job(TR + 120 * MIN, { tenantId: T.C, maxRows: 5 });
    eq(J((await rowOf("q01"))?.quota), q0, "quota Q01");
    eq(await prisma.integrationCallLog.count({ where: { tenantId: T.A } }), n0, "call log ร้าน A");
  });
  await st("QA-15", "ชนิดไม่มีโควตาไม่บัง (ร้าน C · maxRows 5): SMS CONNECTED 6 แถว (quota ว่าง) + SLIP ต่ำ 1 แถวใหม่ ⇒ รอบเดียวถึงแถว SLIP (กรองชนิดใน SQL) · SMS ไม่มี call log quota", async () => {
    needReady();
    const sms = ["ss1", "ss2", "ss3", "ss4", "ss5", "ss6"];
    for (const t of sms) { await mkRow("C", t, "SMS", {}, { unitIds: [] }); await connect(t); }
    await mkRow("C", "rsl", "SLIP_VERIFY", { quotaRemaining: "0", quotaLimit: "1000" }, { unitIds: [] });
    await connect("rsl");
    await job(TR + 30 * MIN, { tenantId: T.C, maxRows: 5 });
    eq(recips(await notifs("rsl")), [USERS.oC], "ผู้รับ rsl");
    eq((await Promise.all(sms.map((t) => quotaLogs(t)))).reduce((a, b) => a + b, 0), 0, "call log quota ของ SMS");
  });

  // ═══════════════ P เมื่อล่มต่อหน่วย ═══════════════
  out("\n── P เมื่อล่มต่อหน่วย ──");
  await st("P-1", "R0.5: PU1 (หน่วย A1 · REJECT) · PU2 (หน่วย A2 · MANUAL) ⇒ getIntegration ต่อหน่วยได้แถวระบุหน่วย onFailure ตรง (positive control)", async () => {
    needReady();
    await mkRow("A", "pu1", "SMS", {}, { unitIds: [U.A1], onFailure: "REJECT" }); await connect("pu1");
    await mkRow("A", "pu2", "SMS", {}, { unitIds: [U.A2], onFailure: "MANUAL" }); await connect("pu2");
    const h1 = await I.getIntegration({ tenantId: T.A, unitId: U.A1 }, "SMS");
    const h2 = await I.getIntegration({ tenantId: T.A, unitId: U.A2 }, "SMS");
    eq([h1?.integrationId, h1?.onFailure, h2?.integrationId, h2?.onFailure], [IDS.pu1, "REJECT", IDS.pu2, "MANUAL"], "handle");
  });
  await st("P-2", "R0.5: เรียกล้มผ่าน handle ต่อหน่วย ⇒ fallback REJECT (A1) / MANUAL (A2) (positive control)", async () => {
    const h1 = await I.getIntegration({ tenantId: T.A, unitId: U.A1 }, "SMS");
    const h2 = await I.getIntegration({ tenantId: T.A, unitId: U.A2 }, "SMS");
    const boom = async () => { throw new Error("boom"); };
    const r1 = await I.callIntegration(h1, "send", boom), r2 = await I.callIntegration(h2, "send", boom);
    eq([r1?.fallback, r2?.fallback], ["REJECT", "MANUAL"], "fallback");
  });
  await st("P-3", "มุมมองสุขภาพแสดง onFailure + unitIds ของแถว (PU1 REJECT [A1] · PU2 MANUAL [A2]) (§2.6)", async () => {
    const a = await callH("getIntegrationHealth", ctxOf("A"), ACT.oA1, { id: id("pu1") });
    const b = await callH("getIntegrationHealth", ctxOf("A"), ACT.oA1, { id: id("pu2") });
    eq([a?.health?.onFailure, a?.health?.unitIds, b?.health?.onFailure, b?.health?.unitIds], ["REJECT", [U.A1], "MANUAL", [U.A2]], "health");
  }, "MAJOR");
  await st("P-4", "ไม่ทำที่เก็บ 'เมื่อล่ม' ซ้ำ: defs/integrations.ts ไม่มี onFailure/onVerifierDown/failure · payments.slip.onVerifierDown ยัง RETIRED (positive control)", () => {
    ok(!/onFailure|onVerifierDown|failure|whenDown/i.test(stripComments(read(F.defs))), "defs/integrations.ts มีค่าตั้งเมื่อล่ม");
    eq(SET?.getDef?.("payments.slip.onVerifierDown")?.hiddenUntil, "RETIRED", "onVerifierDown");
  }, "MAJOR");

  // ═══════════════ H มุมมองสุขภาพ ═══════════════
  out("\n── H มุมมองสุขภาพ ──");
  const NOW_H = new Date();
  type Syn = { at: Date; ok: boolean; ms: number; code: string | null; op: string };
  const SYN: Syn[] = [];
  let H_NF = "";
  await st("H-0", "ฉาก H01 (SMS · CONNECTED): ลบ log จริง · ใส่ log สังเคราะห์ 25 แถวย้อน ~20 วัน + log ปลอม tenantId ร้าน B (ใหม่สุด) + HB1 ของร้าน B", async () => {
    needReady();
    await mkRow("A", "h01", "SMS", {}, { unitIds: [] }); await connect("h01");
    await mkRow("B", "hb1", "SMS", {}, { unitIds: [] }); await connect("hb1");
    await prisma.integrationCallLog.deleteMany({ where: { integrationId: id("h01") } });
    for (let k = 0; k < 25; k++) {
      const fail = k % 7 === 3;
      SYN.push({ at: new Date(NOW_H.getTime() - 3 * MIN - k * 19 * 60 * MIN), ok: !fail, ms: 50 + k * 3, code: fail ? (k % 2 ? "TIMEOUT" : "QUOTA") : null, op: k % 3 ? "send" : "test" });
    }
    await prisma.integrationCallLog.createMany({ data: SYN.map((s) => ({ tenantId: T.A, integrationId: id("h01"), op: s.op, ok: s.ok, ms: s.ms, code: s.code, at: s.at })) });
    await prisma.integrationCallLog.create({ data: { tenantId: T.B, integrationId: id("h01"), op: "forged", ok: true, ms: 1, code: null, at: new Date(NOW_H.getTime() - MIN) } });
  }, "MAJOR");
  await st("H-1", "getIntegrationHealth(เจ้าของ A, H01) ⇒ ok · thresholdPercent 10 · ชุดคีย์ health พอดี (ไม่มี fields/publicFields/secretNames/lastError) · quota null (§3.1)", async () => {
    const r = await callH("getIntegrationHealth", ctxOf("A"), ACT.oA1, { id: id("h01"), now: NOW_H });
    ok(r?.ok === true, `ผล ${codeOf(r)} ${r?.message ?? ""}`);
    eq(r.thresholdPercent, 10, "thresholdPercent");
    eq(keysOf(r.health), HEALTH_KEYS, "คีย์ health");
    eq([r.health.id, r.health.kind, r.health.provider, r.health.label, r.health.status, r.health.quota], [IDS.h01, "SMS", "FAKE", L("h01"), "CONNECTED", null], "ค่า");
  });
  await st("H-2", "recent = 20 แถวใหม่ → เก่า ของ (ร้าน A, H01) พอดี · คีย์ {op ok ms code at} · at เป็น ISO · ไม่มี log ปลอมของร้าน B (X1)", async () => {
    const r = await callH("getIntegrationHealth", ctxOf("A"), ACT.oA1, { id: id("h01"), now: NOW_H });
    const rec: Any[] = r?.health?.recent ?? [];
    ok(Array.isArray(r?.health?.recent), `ไม่มี recent (${codeOf(r)})`);
    ok(rec.every((x) => J(keysOf(x)) === J(CALL_KEYS)), `คีย์ ${J(keysOf(rec[0]))}`);
    eq(rec.some((x) => x.op === "forged"), false, "มี log ปลอม");
    const exp = [...SYN].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20).map((s) => ({ op: s.op, ok: s.ok, ms: s.ms, code: s.code, at: s.at.toISOString() }));
    eq(rec.map((x) => ({ op: x.op, ok: x.ok, ms: x.ms, code: x.code, at: x.at })), exp, "recent");
  });
  await st("H-3", "daily = 14 วันไทย เก่า → ใหม่ (วันสุดท้าย = วันนี้ไทย) · ok/fail/avgMs (Math.round เฉลี่ย · ไม่มี = null) ตรงกับ log สังเคราะห์ · คีย์ {day ok fail avgMs}", async () => {
    ok(typeof QH?.bkkYmd === "function", "โหลด quiet-hours ไม่ได้");
    const r = await callH("getIntegrationHealth", ctxOf("A"), ACT.oA1, { id: id("h01"), now: NOW_H });
    const days: string[] = Array.from({ length: 14 }, (_, i) => QH.bkkYmd(new Date(NOW_H.getTime() - (13 - i) * DAY)));
    const exp = days.map((day) => {
      const xs = SYN.filter((s) => QH.bkkYmd(s.at) === day);
      return { day, ok: xs.filter((s) => s.ok).length, fail: xs.filter((s) => !s.ok).length, avgMs: xs.length ? Math.round(xs.reduce((a, s) => a + s.ms, 0) / xs.length) : null };
    });
    const got: Any[] = r?.health?.daily ?? [];
    ok(got.every((x) => J(keysOf(x)) === J(DAY_KEYS)), `คีย์ ${J(keysOf(got[0]))}`);
    eq(got.map((x) => ({ day: x.day, ok: x.ok, fail: x.fail, avgMs: x.avgMs })), exp, "daily");
  });
  await st("H-4", "quota view ของ Q01 (50/1000) = {remaining 50 · limit 1000 · percent 5 · low true · checkedAt ISO · resetsAt null} · ชุดคีย์พอดี", async () => {
    const r = await callH("getIntegrationHealth", ctxOf("A"), ACT.oA1, { id: id("q01") });
    const q = r?.health?.quota;
    eq(keysOf(q), QUOTA_KEYS, "คีย์ quota");
    eq([q.remaining, q.limit, q.percent, q.low, q.resetsAt, typeof q.checkedAt === "string" && !Number.isNaN(Date.parse(q.checkedAt))], [50, 1000, 5, true, null, true], "quota");
  });
  await st("H-5", "listIntegrationHealth: เจ้าของ A เห็นแถวเก็บของร้าน A ครบ (ไม่มีชนิดเสมือน · ชุดคีย์พอดีทุกตัว · threshold 10) · เจ้าของ B threshold 25 ไม่มี id ร้าน A", async () => {
    const a = await callH("listIntegrationHealth", ctxOf("A"), ACT.oA1, { now: NOW_H });
    ok(a?.ok === true && Array.isArray(a.items), `A ${codeOf(a)}`);
    const rowsA = ((await prisma.tenantIntegration.findMany({ where: { tenantId: T.A }, select: { id: true } })) as { id: string }[]).map((x) => x.id).sort();
    eq(a.items.map((x: Any) => x.id).sort(), rowsA, "id ร้าน A");
    ok(a.items.every((x: Any) => J(keysOf(x)) === J(HEALTH_KEYS)), "คีย์ item");
    eq(a.thresholdPercent, 10, "threshold A");
    const b = await callH("listIntegrationHealth", ctxOf("B"), ACT.oB, { now: NOW_H });
    ok(b?.ok === true, `B ${codeOf(b)}`);
    eq(b.thresholdPercent, 25, "threshold B");
    eq(rowsA.filter((x) => J(b).includes(x)), [], "B เห็น id ร้าน A");
  });
  await st("H-6", "X1: id ร้านอื่น / ไม่มี / รูปผิด ⇒ NOT_FOUND ข้อความไทย ผลเดียวกันทุกตัวอักษร (ทั้งสองทิศ)", async () => {
    const rs = [
      await callH("getIntegrationHealth", ctxOf("A"), ACT.oA1, { id: id("hb1") }),
      await callH("getIntegrationHealth", ctxOf("A"), ACT.oA1, { id: `nope${RAND}x` }),
      await callH("getIntegrationHealth", ctxOf("A"), ACT.oA1, { id: "../%00" }),
      await callH("getIntegrationHealth", ctxOf("B"), ACT.oB, { id: id("h01") }),
    ];
    ok(rs[0]?.ok === false && rs[0].code === "NOT_FOUND" && THAI.test(rs[0].message ?? ""), `ผล ${J(rs[0])}`);
    H_NF = J(rs[0]);
    eq(rs.map((r) => J(r)), rs.map(() => H_NF), "ผลต่างกัน");
  });
  await st("H-7", "สิทธิ์: STAFF ไม่มีคีย์ ⇒ PERMISSION_DENIED (get+list) · MANAGER อ่านได้ · STAFF ถือคีย์จำกัดหน่วย A1: แถว [A2] ⇒ NOT_FOUND เดียวกับ H-6 · แถว [A1]/[] ได้ · list ไม่มีแถว [A2]", async () => {
    const g = await callH("getIntegrationHealth", ctxOf("A"), ACT.stA, { id: id("h01") });
    const l = await callH("listIntegrationHealth", ctxOf("A"), ACT.stA, {});
    ok(g?.ok === false && g.code === "PERMISSION_DENIED" && l?.ok === false && l.code === "PERMISSION_DENIED", `STAFF ${codeOf(g)} / ${codeOf(l)}`);
    const m = await callH("getIntegrationHealth", ctxOf("A"), ACT.mgrA, { id: id("h01") });
    ok(m?.ok === true, `MANAGER ${codeOf(m)}`);
    const k2 = await callH("getIntegrationHealth", ctxOf("A"), ACT.keyA, { id: id("pu2") });
    ok(H_NF !== "", "H-6 ล้ม");
    eq(J(k2), H_NF, "แถว [A2] ของผู้จำกัดหน่วย A1");
    const k1 = await callH("getIntegrationHealth", ctxOf("A"), ACT.keyA, { id: id("pu1") });
    const k0 = await callH("getIntegrationHealth", ctxOf("A"), ACT.keyA, { id: id("h01") });
    ok(k1?.ok === true && k0?.ok === true, `[A1] ${codeOf(k1)} · [] ${codeOf(k0)}`);
    const kl = await callH("listIntegrationHealth", ctxOf("A"), ACT.keyA, {});
    ok(kl?.ok === true && kl.items.some((x: Any) => x.id === IDS.pu1) && !kl.items.some((x: Any) => x.id === IDS.pu2), `list ผู้จำกัดหน่วย ${codeOf(kl)}`);
  });
  await st("H-8", "X10: ผลคืนทุกตัวของ get/list ไม่มีค่าลับ · ไม่มีคำ secretBox/secretNames/publicFields/apiKey · ไม่มีค่า accountId", () => {
    const hs = RESULTS.filter((r: Any) => r && typeof r === "object" && ("health" in r || ("items" in r && "thresholdPercent" in r)));
    ok(hs.length >= 5, `ผลสุขภาพที่เก็บไว้ ${hs.length}`);
    const s = J(hs);
    eq(leaks(s), [], "ค่าลับ");
    ok(!/secretBox|secretNames|publicFields|apiKey/.test(s) && !s.includes(ACC), "มีชื่อฟิลด์ลับ/ค่าสาธารณะในผลสุขภาพ");
  });
  await st("H-9", "ขยะไม่ throw: ctx null ⇒ NOT_FOUND · actor null ⇒ PERMISSION_DENIED · role แปลก (list) ⇒ ok:false", async () => {
    const a = await callH("getIntegrationHealth", null, ACT.oA1, { id: id("h01") });
    const b = await callH("getIntegrationHealth", ctxOf("A"), null, { id: id("h01") });
    const c = await callH("listIntegrationHealth", ctxOf("A"), { userId: "x", role: "ROOT", unitAccess: ["*"], permissions: {} }, {});
    eq([a?.code, b?.code, c?.ok], ["NOT_FOUND", "PERMISSION_DENIED", false], "ผล");
    ok(!a?.threw && !b?.threw && !c?.threw, "throw");
  }, "MAJOR");

  // ═══════════════ J ลบ call log 30 วัน (positive control ของ R0.5 · §2.5) ═══════════════
  out("\n── J ลบ call log 30 วัน ──");
  const purge = async (now: Date, opts?: Any): Promise<Any> => { ok(typeof I?.purgeIntegrationCallLogs === "function", "ไม่มี purgeIntegrationCallLogs"); return I.purgeIntegrationCallLogs(now, opts); };
  const JID = `${SQC_C3.labelPrefix}${RAND}-jlog`;
  const NOWJ = new Date();
  const CUT = NOWJ.getTime() - 30 * DAY;
  const mkLogs = async (tenantId: string, ats: number[], tag = "j") => prisma.integrationCallLog.createMany({ data: ats.map((a) => ({ tenantId, integrationId: `${JID}${tag}`, op: "qc", ok: true, ms: 1, code: null, at: new Date(a) })) });
  const cntJ = (where: Any) => prisma.integrationCallLog.count({ where: { integrationId: { startsWith: JID }, ...where } });
  const svcqcYoung = () => prisma.integrationCallLog.count({ where: { tenantId: { in: [SQC_TENANT.id, SQC_OTHER.tenant.id] }, at: { gte: new Date(CUT + MIN) } } });
  await st("J-1", "ลบเฉพาะเกินอายุ: ร้าน A (−30ว−1ms · −31ว · −40ว ลบ · ขอบ −30ว พอดี + −30ว+1วิ เก็บ) · ร้าน B (−35ว −60ว ลบ · −1ว −29ว เก็บ) · log อายุน้อยของ svcqc ไม่ลด", async () => {
    needReady();
    await mkLogs(T.A, [CUT - 1, NOWJ.getTime() - 31 * DAY, NOWJ.getTime() - 40 * DAY, CUT, CUT + 1000]);
    await mkLogs(T.B, [NOWJ.getTime() - 35 * DAY, NOWJ.getTime() - 60 * DAY, NOWJ.getTime() - DAY, NOWJ.getTime() - 29 * DAY]);
    const y0 = await svcqcYoung();
    const r = await purge(NOWJ);
    ok(typeof r?.deleted === "number" && r.deleted >= 5, `deleted ${J(r)}`);
    eq([await cntJ({ at: { lt: new Date(CUT) } }), await cntJ({ at: { gte: new Date(CUT) } })], [0, 4], "[เกินอายุ เหลือ · อายุน้อย]");
    eq(await svcqcYoung(), y0, "svcqc อายุน้อย");
  });
  await st("J-2", "รันซ้ำ ⇒ deleted 0 · แถวอายุน้อยคงเดิม (idempotent)", async () => {
    const r = await purge(NOWJ);
    eq([r?.deleted, await cntJ({})], [0, 4], "[deleted · คงเหลือ]");
  });
  await st("J-3", "ค้าง 2,345 แถว (ร้าน C) ⇒ หมดในรอบเดียว (เป็นก้อน)", async () => {
    await mkLogs(T.C, Array.from({ length: 2345 }, (_, i) => NOWJ.getTime() - 45 * DAY - i * 1000), "bk");
    const r = await purge(NOWJ);
    ok(r?.deleted >= 2345, `deleted ${J(r)}`);
    eq(await cntJ({ tenantId: T.C }), 0, "คงเหลือ");
  }, "MAJOR");
  await st("J-4", "งบ: deadline เลยแล้ว ⇒ 0 (แถวคงอยู่) · signal abort ⇒ 0 · รอบปกติ ⇒ หมด", async () => {
    await mkLogs(T.C, Array.from({ length: 50 }, (_, i) => NOWJ.getTime() - 50 * DAY - i), "dl");
    const r1 = await purge(NOWJ, { deadline: Date.now() - 1 });
    const ac = new AbortController(); ac.abort();
    const r2 = await purge(NOWJ, { signal: ac.signal });
    eq([r1?.deleted, r2?.deleted, await cntJ({ tenantId: T.C })], [0, 0, 50], "[deadline · signal · คงเหลือ]");
    await purge(NOWJ);
    eq(await cntJ({ tenantId: T.C }), 0, "หลังรอบปกติ");
  }, "MAJOR");
  await st("J-5", "X3: ค้าง 3,000 แถว · ลบพร้อมกัน 6 ทาง (ในโพรเซส 4 + โพรเซสลูก 2) ⇒ ลบรวม 3,000 พอดี · ไม่ throw/deadlock", async () => {
    await mkLogs(T.C, Array.from({ length: 3000 }, (_, i) => NOWJ.getTime() - 70 * DAY - i * 10), "cc");
    const at = atIn();
    const now = NOWJ.toISOString();
    const [kids, mine] = await Promise.all([fanout("purge", [[{ now }], [{ now }]], at), inProcAt(at, [0, 1, 2, 3].map(() => () => I.purgeIntegrationCallLogs(new Date(now))))]);
    const all = [...kids, ...mine];
    eq(badOf(all).map((x) => J(x).slice(0, 80)), [], "ผลผิดปกติ");
    eq([all.reduce((a, r) => a + (Number(r?.deleted) || 0), 0), await cntJ({ tenantId: T.C })], [3000, 0], "[ลบรวม · คงเหลือ]");
  }, "MAJOR");
  await st("J-6", "งานที่ลงทะเบียน integrations.calllog.purge ทำงานจริง (เรียก run ของทะเบียน) ⇒ ลบแถวเกินอายุที่ใส่ใหม่", async () => {
    const jb = minuteJob("integrations.calllog.purge");
    ok(jb && typeof jb.run === "function", "ไม่มีงานในทะเบียน");
    await mkLogs(T.C, [NOWJ.getTime() - 33 * DAY, NOWJ.getTime() - 34 * DAY, NOWJ.getTime() - 90 * DAY], "rj");
    await jb.run(NOWJ, 20_000, { signal: new AbortController().signal, deadline: Date.now() + 20_000 });
    eq(await cntJ({ tenantId: T.C }), 0, "คงเหลือ");
  }, "MAJOR");

  // ═══════════════ U DOM ═══════════════
  out("\n── U DOM ──");
  const panelL = await loadIf(F.panel);
  const React = (await tryImport("react")).mod as Any;
  const RDS = (await tryImport("react-dom/server")).mod as Any;
  const render = (props: Any): string => {
    const Comp = panelL.mod?.default;
    if (typeof Comp !== "function") throw new AssertFail(`โหลด ${F.panel} ไม่ได้: ${panelL.err || "ไม่มี default export"}`);
    return String(RDS.renderToStaticMarkup(React.createElement(Comp, props))).replace(/<!-- -->/g, "");
  };
  const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
  const textOf = (h: string) => unesc(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const tagsWith = (h: string, attr: string, val: string): string[] => [...h.matchAll(new RegExp(`<[^>]*\\s${attr}="${val}"[^>]*>`, "g"))].map((m) => m[0]);
  const SAMPLE_DAYS = Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, ok: i, fail: i % 3 === 0 ? 1 : 0, avgMs: i ? 100 + i : null }));
  const SAMPLE = {
    id: "svc-c3-u", kind: "SLIP_VERIFY", provider: "FAKE", label: "ตรวจสลิป (ทดสอบ)", status: "CONNECTED", onFailure: "MANUAL", unitIds: [],
    quota: { remaining: 50, limit: 1000, percent: 5, low: true, checkedAt: "2026-10-14T03:00:00.000Z", resetsAt: null },
    recent: [
      { op: "verify", ok: true, ms: 120, code: null, at: "2026-10-14T03:00:00.000Z" },
      { op: "verify", ok: false, ms: 8000, code: "TIMEOUT", at: "2026-10-14T02:00:00.000Z" },
      { op: "quota", ok: false, ms: 30, code: "PROVIDER_ERROR", at: "2026-10-14T01:00:00.000Z" },
      { op: "quota", ok: false, ms: 31, code: "QUOTA", at: "2026-10-14T00:00:00.000Z" },
    ],
    daily: SAMPLE_DAYS,
  };
  await st("U-1", "แผง: ราก data-testid=integration-health + data-status · svg integration-health-chart มี bar 14 ตัว (data-day/ok/fail) · แถวเรียกล่าสุด 4 แถว (data-ok)", () => {
    const h = render({ health: SAMPLE, thresholdPercent: 10 });
    ok(/data-testid="integration-health"[^>]*data-status="CONNECTED"|data-status="CONNECTED"[^>]*data-testid="integration-health"/.test(h), "ราก");
    ok(/<svg[^>]*data-testid="integration-health-chart"/.test(h), "svg กราฟ");
    const bars = tagsWith(h, "data-testid", "integration-health-bar");
    eq(bars.length, 14, "bar");
    ok(bars.every((b) => /data-day="2026-10-\d\d"/.test(b) && /data-ok="\d+"/.test(b) && /data-fail="\d+"/.test(b)), "attr ของ bar");
    eq(bars.map((b) => /data-day="([^"]+)"/.exec(b)?.[1]), SAMPLE_DAYS.map((d) => d.day), "ลำดับวัน");
    const calls = tagsWith(h, "data-testid", "integration-health-call");
    eq(calls.map((c) => /data-ok="(true|false)"/.exec(c)?.[1]), ["true", "false", "false", "false"], "แถวเรียก");
  }, "MAJOR");
  await st("U-2", "ป้ายไทย: สำเร็จ · หมดเวลา · ผู้ให้บริการขัดข้อง · โควตาหมด · โควตา data-low=true + 'เหลือ 5%' · ไม่มีรหัสอังกฤษในข้อความที่เห็น", () => {
    const h = render({ health: SAMPLE, thresholdPercent: 10 });
    const t = textOf(h);
    const miss = ["สำเร็จ", "หมดเวลา", "ผู้ให้บริการขัดข้อง", "โควตาหมด", "เหลือ 5%"].filter((w) => !t.includes(w));
    ok(!miss.length, `ขาด ${miss.join(", ")}`);
    ok(tagsWith(h, "data-testid", "integration-health-quota").some((x) => /data-low="true"/.test(x)), "quota data-low");
    ok(!/TIMEOUT|PROVIDER_ERROR|NOT_READY|\bQUOTA\b/.test(t), "มีรหัสอังกฤษ");
  }, "MAJOR");
  await st("U-3", "ไม่มีโควตา + ไม่มีการเรียก ⇒ ไม่มีธาตุ quota · ข้อความ 'ยังไม่มีการเรียก' · bar ยัง 14", () => {
    const h = render({ health: { ...SAMPLE, quota: null, recent: [] }, thresholdPercent: 10 });
    eq(tagsWith(h, "data-testid", "integration-health-quota").length, 0, "quota");
    ok(textOf(h).includes("ยังไม่มีการเรียก"), "ข้อความว่าง");
    eq(tagsWith(h, "data-testid", "integration-health-bar").length, 14, "bar");
  }, "MINOR");

  // ═══════════════ M รั่ว ═══════════════
  out("\n── M รั่ว/เน็ต ──");
  await st("M-1", "X10: แถวของร้านทดสอบ (AppNotification · TenantIntegration.quota/lastError · IntegrationCallLog · OutboxEvent · OpsEvent · AuditLog) ไม่มีค่าลับ/ข้อความดิบ 'apiKey='", async () => {
    needReady();
    const w = { tenantId: { in: tenantIds } };
    const dump = J([
      await prisma.appNotification.findMany({ where: w }),
      await prisma.tenantIntegration.findMany({ where: w, select: { quota: true, lastError: true, label: true } }),
      await prisma.integrationCallLog.findMany({ where: w, select: { op: true, code: true } }),
      await prisma.outboxEvent.findMany({ where: w, select: { payload: true } }),
      await prisma.opsEvent.findMany({ where: { ...w, createdAt: { gte: START } } }),
      await prisma.auditLog.findMany({ where: w, select: { before: true, after: true } }),
    ]);
    eq(leaks(dump), [], "ค่าลับ");
    ok(!/apiKey=/.test(dump), "มีข้อความดิบ apiKey=");
  });
  await st("M-2", "X10: console ระหว่างข้อสอบไม่มีค่าลับ", () => eq(leaks(CAPTURED.join("\n")), [], "console"), "MAJOR");
  await st("M-3", "ไม่มีคำขอออกนอกเครื่อง", () => eq(BLOCKED, [], "คำขอนอกเครื่อง"), "MINOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  out("\n── Z: ล้างข้อมูล ──");
  try { await cleanup(tenantIds); } catch (e) { out(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant qc-svc-c3-* 0 · แถวของร้านทดสอบ 0 ทุกตาราง · ผู้ใช้ทดสอบ 0 · call log svc-c3-* 0 · OpsAlertState ของ event ทดสอบ 0", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: SQC_C3.tenantSlugPrefix } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: SQC_C3.emailPrefix } } }), 0, "user");
    eq(await prisma.integrationCallLog.count({ where: { integrationId: { startsWith: SQC_C3.labelPrefix } } }), 0, "call log");
    eq(await prisma.opsAlertState.count({ where: { source: { in: EXTRA_EVENT_IDS.map((x) => `${SQC_C3.alertSourcePrefix}${x}`) } } }), 0, "OpsAlertState");
  }, "MAJOR");
  globalThis.fetch = REAL_FETCH;
  for (const k of ENV_KEYS) { if (ENV_SAVED[k] === undefined) delete process.env[k]; else process.env[k] = ENV_SAVED[k]; }
}

// ═══════════════ SC ฉาก svcqc (ร้าน B · builder) ═══════════════
out("\n── SC ฉาก svcqc ──");
{
  const S = SQC_INTEGRATION_HEALTH_SCENE;
  let why = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: S.tenantId }, select: { id: true } });
    const m = t ? await prisma.membership.findFirst({ where: { tenantId: S.tenantId, userId: S.ownerUserId, role: "OWNER" }, select: { id: true } }) : null;
    if (!t || !m) why = "ร้าน svcqc-other-tenant / เจ้าของยังไม่มี (รัน seed-svc-qc ก่อน)";
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  // ฉากต้องเห็น FAKE ใน registry ของโพรเซสลูก (ข้อสอบตั้ง env ให้) — ไม่ใช้กุญแจ (ฉากไม่มีค่าลับ)
  const sceneEnv = { ...process.env, INTEGRATIONS_FAKE: "1" };
  const runScene = (args: string[] = []) => spawnSync("pnpm", ["exec", "tsx", F.scene, ...args], { cwd: ROOT, env: sceneEnv, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (o: string) => { const l = o.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const sceneRow = (): Promise<Any> => prisma.tenantIntegration.findFirst({ where: { tenantId: S.tenantId, label: S.label } });
  const counts = async () => [await prisma.settingValue.count({ where: { tenantId: S.tenantId } }), await prisma.outboxEvent.count({ where: { tenantId: S.tenantId } }), await prisma.appNotification.count({ where: { tenantId: S.tenantId } })];
  const n1 = "ฉาก svc-qc-integration-health-scene: --clear แล้วรัน · รันซ้ำ = 0/0/0 · แถว CALENDAR CONNECTED ร้าน B · log 40 · มุมมองสุขภาพ (other-owner): recent 20 · มีการเรียก 7 วัน · ok 33 fail 7 · quota 8% ต่ำ · ไม่เขียน SettingValue/Outbox/AppNotification";
  const n2 = "ฉาก --clear ลบเฉพาะแถวฉาก + log ของแถว (แถวอื่นของร้าน B คงเดิม) แล้วรันคืน";
  if (why) { skip("SC-1", n1, why, "MAJOR"); skip("SC-2", n2, why, "MAJOR"); }
  else {
    await st("SC-1", n1, async () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const c0 = await counts();
      runScene(["--clear"]);
      const a = runScene();
      ok(a.status === 0, `รอบแรก exit=${a.status} ${`${a.stdout}${a.stderr}`.split("\n").slice(-3).join(" | ").slice(0, 200)}`);
      const b = runScene();
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      const row = await sceneRow();
      ok(row && row.kind === S.kind && row.provider === S.provider && row.status === "CONNECTED" && row.secretBox === null && J(row.unitIds) === "[]", `แถว ${J(row && { k: row.kind, s: row.status })}`);
      eq(await prisma.integrationCallLog.count({ where: { tenantId: S.tenantId, integrationId: row.id } }), S.expect.logs, "log");
      const actor = { userId: S.ownerUserId, role: "OWNER", unitAccess: ["*"], permissions: {} };
      const r = await callH("getIntegrationHealth", { tenantId: S.tenantId }, actor, { id: row.id });
      ok(r?.ok === true, `health ${codeOf(r)}`);
      const d: Any[] = r.health.daily;
      eq([r.health.recent.length, d.filter((x) => x.ok + x.fail > 0).length, d.reduce((a, x) => a + x.ok, 0), d.reduce((a, x) => a + x.fail, 0), r.health.quota?.percent, r.health.quota?.low],
        [S.expect.recent, S.expect.daysWithCalls, S.expect.ok, S.expect.fail, S.expect.percent, S.expect.low], "[recent วัน ok fail % ต่ำ]");
      eq(await counts(), c0, "SettingValue/Outbox/AppNotification ของร้าน B");
    }, "MAJOR");
    await st("SC-2", n2, async () => {
      const others0 = await prisma.tenantIntegration.count({ where: { tenantId: S.tenantId, NOT: { label: S.label } } });
      const row = await sceneRow();
      ok(row, "ไม่มีแถวฉาก");
      const c = runScene(["--clear"]);
      ok(c.status === 0 && !(await sceneRow()), `--clear exit=${c.status}`);
      eq(await prisma.integrationCallLog.count({ where: { integrationId: row.id } }), 0, "log ของแถวฉาก");
      eq(await prisma.tenantIntegration.count({ where: { tenantId: S.tenantId, NOT: { label: S.label } } }), others0, "แถวอื่นของร้าน B");
      const back = runScene();
      ok(back.status === 0 && (await sceneRow()), "รันคืน");
    }, "MAJOR");
  }
}

// ═══════════════ S (git · ตอนรับใบเท่านั้น) ═══════════════
out("\n── S: ไฟล์ที่แตะ (git) ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim()).length;
const OWN_NEW = [F.health, F.defs, F.panel];
const OWN_EDIT = [F.index, F.types, F.service, F.fake, F.setTypes, F.setIndex, F.page, F.hub, F.actions, F.consumers, F.minute];
const OWN = new Set<string>([...OWN_NEW, ...OWN_EDIT]);
{
  const ch = dirty(["src", "prisma", "public"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.health}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ (§1)", "C.3 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ) · มีไฟล์ใหม่ครบ", () => {
    const outside = ch.filter((f) => !OWN.has(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 8).join(", ")}`);
    const miss = OWN_NEW.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
await st("S-2", "ไม่แตะชิ้นต้องห้าม: prisma · core นอกรายการ (secret-box · registry · settings/service · settings/registry · defs/payments · ops) · payment · modules · automation/webhooks labels", () => {
  const banned = dirty(["prisma", "src/lib/core", "src/lib/payment", "src/lib/modules", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts"]).filter((f) => !OWN.has(f));
  eq(banned, [], "ไฟล์");
});
await st("S-13", "แก้ชิ้นกลางแบบเพิ่ม: service.ts ลบ 0 · facade ≤ 1 · types ≤ 3 · fake ≤ 4 · settings/types ≤ 1 · settings/index 0 · consumers ≤ 1 · minute-jobs 0 · fitness ไม่ลบ (§1 · K1)", () => {
  const lim: [string, number][] = [[F.service, 0], [F.index, 1], [F.types, 3], [F.fake, 4], [F.setTypes, 1], [F.setIndex, 0], [F.consumers, 1], [F.minute, 0]];
  const bad = lim.filter(([f, n]) => rm(f) > n).map(([f]) => `${f} ลบ ${rm(f)}`);
  if (dirty([F.fitness]).length && rm(F.fitness) > 0) bad.push("fitness ลบบรรทัด");
  ok(!bad.length, bad.join(" · "));
}, "MAJOR");

// ═══════════════ G regression (หลังล้างข้อมูล) ═══════════════
out("\n── G: regression ──");
const summaryOf = (o: string): { failed: string[] } | null => {
  const line = o.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as { failed: string[] }; } catch { return null; }
};
const judgeNoFail = (o: string) => (summaryOf(o)?.failed.length ?? 1) === 0;
const REG: { s: string; note: string }[] = [
  { s: "qc-svc-r0.5", note: "ไม่มี FAIL (ศูนย์เชื่อมต่อ · purge · FAKE)" },
  { s: "qc-svc-r0.6", note: "ไม่มี FAIL (ตรวจสลิปใช้ quota/onFailure)" },
  { s: "qc-svc-smoke", note: "ไม่มี FAIL" },
];
{
  const hasWork = typeof I?.runIntegrationHealthJob === "function" && typeof I?.getIntegrationHealth === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (runIntegrationHealthJob / getIntegrationHealth) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_C3_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const gid = `G-${i + 1}`;
    const name = `${g.s} (${g.note})`;
    if (why) { skip(gid, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(gid, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const env = { ...process.env }; // env ของศูนย์ฯ คืนค่าเดิมแล้วใน finally — ชุดลูกตั้งเอง
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`], { cwd: ROOT, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-c3-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = judgeNoFail(all);
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(gid, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
out(`\n===== QC SVC C.3 · สุขภาพตัวต่อ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
out(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
out(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · SC-* ไม่มีร้าน svcqc · S-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
