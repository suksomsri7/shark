// QC — SVC R0.5 · ศูนย์เชื่อมต่อ (Integrations) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/SVC-MASTER-PLAN.md แถว R0.5 · ใบสั่ง ledger/svc-briefs/svc-brief-r0.5.md (§3 = สัญญาที่ตรวจ) · ledger/SVC-CORE-CONTRACT.md §2 §7 §8
//        ledger/wo-notes/svc-r0.8-carry.md (getIntegration ตรวจ unitIds · lastError/code ไม่มีข้อความดิบที่สะท้อนคีย์)
//
// กลุ่มข้อ:
//   F  ไฟล์ส่งมอบ · facade · ไม่ import POS/แชท · .env.example
//   S  secret-box (รูปแบบ · ข้อสอบเปิดกล่องเองด้วยสูตร SHA-256("integrations:"+key) · กุญแจผิด/ขยะ = null ไม่ throw)
//   K  ไม่มีกุญแจ/กุญแจสั้น/กุญแจผิด ⇒ เก็บค่าลับไม่ได้ (ไม่มีกุญแจสำรอง · ไม่เก็บ plaintext) · อ่าน/เรียกไม่ throw
//   C  บันทึก (patch · เปลี่ยน/ล้างคีย์ · ปิดบัง 4 ตัวท้าย · แถวดิบไม่มีค่าลับ · validation · audit)
//   A  สิทธิ์ settings.integrations.manage (เจ้าของ · MANAGER ไม่ได้โดยปริยาย · ผู้ได้คีย์จำกัดหน่วย)
//   X  ข้ามร้าน ⇒ NOT_FOUND / null (X1)
//   T  testIntegration (FAKE) · event integration.connected ครั้งเดียวต่อการเปลี่ยน · lastError ไม่สะท้อนคีย์ (positive control)
//   G  getIntegration: unitIds จำกัดหน่วยจริง · แถวระบุหน่วยชนะ · DRAFT ไม่นับ · handle ไม่มีค่าลับ
//   L  callIntegration: call log ทุกครั้ง (ไม่มี PII/คีย์) · TIMEOUT/PROVIDER_ERROR/QUOTA · fallback · ล้ม 5 ⇒ ERROR + event ครั้งเดียว · ฟื้น · ยิงพร้อมกัน 10 (X3)
//   E  event 3 ทะเบียน · payload พอดี {integrationId, kind, provider}
//   V  ชนิดเสมือน LINE_OA / PROMPTPAY อ่านของเดิม ไม่เก็บซ้ำ ไม่หลุด credentials · catalog 9 ชนิด
//   FK FAKE ใช้ไม่ได้เมื่อไม่มี INTEGRATIONS_FAKE หรือ APP_ENV=production
//   D  ถอดการเชื่อมต่อ = ลบค่าลับ · get ⇒ null
//   J  งานลบ call log > 30 วัน (minute-job daily) · รันซ้ำ = 0
//   P  หน้า settings/integrations (สแตติก) + ฉากภาพ (ไม่มี QC server = SKIP ยอมได้)
//   Z  สแกนรั่ว: DB (TenantIntegration · IntegrationCallLog · AuditLog · OutboxEvent · OpsEvent) · console · ผลคืนทุกตัว · ทำความสะอาด
//
// 🔴 เขียนฐาน qc-svc — รันผ่าน gate lock (ห้ามครอบ timeout):
//    bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.5.mts
// แถวของข้อสอบ: label/ID ขึ้นต้น "svc-r05-" · ลบใน finally (รวมของรอบก่อนที่ค้าง) · env ที่สลับคืนใน finally
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createDecipheriv, createHash, randomBytes } from "node:crypto";
import { format } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-r0.5";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];

// ═══════════════ 0. ด่านฐานข้อมูล (ในตัวข้อสอบ) ═══════════════
{
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.5.mts`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    let hn = "";
    try { hn = new URL(u).hostname; } catch { /* อ่านไม่ได้ = ปฏิเสธ */ }
    if (!hn.startsWith(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
}
loadSvcQcEnv(LABEL);

// ═══════════════ ผลข้อ ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string; allowSkip: boolean }[] = [];
const ORIG = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
const out = (s: string) => ORIG.log(s); // ผลของข้อสอบเอง (ไม่นับใน console ที่สแกนรั่ว)
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => {
  cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail, allowSkip: false });
  out(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL", allowSkip = false) => {
  cks.push({ id, res: "SKIP", sev, why, allowSkip });
  out(`  ⏭️  [${id}] ${name} — SKIP: ${why}`);
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const PMAX = 8;
const why = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
async function step(id: string, name: string, fn: (p: string[]) => Promise<void>, sev: Sev = "CRITICAL") {
  const p: string[] = [];
  try { await fn(p); } catch (e) { p.push(`โยน: ${errMsg(e)}`); }
  chk(id, name, p.length === 0, why(p), sev);
}

// ═══════════════ ค่าลับของรอบ · env ═══════════════
const RAND = randomBytes(4).toString("hex");
const PFX = `svc-r05-${RAND}`;
const SECRETS: string[] = [];
const sec = (tag: string) => { const s = `qc05${tag}${randomBytes(14).toString("hex")}`; SECRETS.push(s); return s; };
const KEY1 = randomBytes(32).toString("hex");
const KEY2 = randomBytes(32).toString("hex");
const ENV_KEYS = ["INTEGRATIONS_CREDENTIALS_KEY", "INTEGRATIONS_FAKE", "APP_ENV"] as const;
const ENV_SAVED: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const envSet = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
envSet("INTEGRATIONS_CREDENTIALS_KEY", KEY1);
envSet("INTEGRATIONS_FAKE", "1");
async function withEnv<T>(over: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(over)) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(over)) envSet(k, v);
  try { return await fn(); } finally { for (const [k, v] of Object.entries(prev)) envSet(k, v); }
}

// ═══════════════ ดัก console (สแกนรั่วข้อ Z-2) ═══════════════
const CAPTURED: string[] = [];
for (const k of ["log", "info", "warn", "error", "debug"] as const) {
  console[k] = (...a: unknown[]) => { CAPTURED.push(format(...a)); ORIG[k](...a); };
}

// ═══════════════ สัญญาข้อมูล (seed R0.2) ═══════════════
const TA = "svcqc-tenant";
const TB = "svcqc-other-tenant";
const U = { barber: "svcqc-unit-barber", massage: "svcqc-unit-massage", dorm: "svcqc-unit-dorm", hotel: "svcqc-unit-hotel" } as const;
const UB_BARBER = "svcqc-other-unit-barber";
type Actor = { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
const ACT: Record<string, Actor> = {
  owner: { userId: "svcqc-user-owner", role: "OWNER", unitAccess: ["*"], permissions: {} },
  manager: { userId: "svcqc-user-manager", role: "MANAGER", unitAccess: [U.barber, U.massage], permissions: {} },
  ek: { userId: "svcqc-user-ek", role: "STAFF", unitAccess: [U.barber], permissions: { "booking.appointment.setStatus": true } },
  ekWild: { userId: "svcqc-user-ek", role: "STAFF", unitAccess: [U.barber], permissions: { "settings.*": true } },
  ekGrant: { userId: "svcqc-user-ek", role: "STAFF", unitAccess: [U.barber], permissions: { "settings.integrations.manage": true } },
  otherOwner: { userId: "svcqc-other-user-owner", role: "OWNER", unitAccess: ["*"], permissions: {} },
};
const CTX_A = { tenantId: TA };
const CTX_B = { tenantId: TB };
const STORED_KINDS = ["SLIP_VERIFY", "PAYMENT_GATEWAY", "SMS", "CHANNEL_MANAGER", "METER", "CALENDAR", "EDC"];
const CATALOG_KINDS = ["LINE_OA", "PROMPTPAY", ...STORED_KINDS];
const READY_KINDS = new Set(["LINE_OA", "PROMPTPAY", "SLIP_VERIFY"]);
const CALL_CODES = new Set(["TIMEOUT", "PROVIDER_ERROR", "QUOTA", "NOT_READY"]);
const EVENTS = ["integration.connected", "integration.failed"];
const DAY = 86_400_000;
const START = new Date(Date.now() - 5_000);

// ═══════════════ ตัวช่วย ═══════════════
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => (has(f) ? readFileSync(join(ROOT, f), "utf8") : "");
const js = (v: unknown) => { try { return JSON.stringify(v) ?? ""; } catch { return String(v); } };
const RESULTS: unknown[] = [];
const keep = <X,>(r: X): X => { RESULTS.push(r); return r; };
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.__missing ? "ไม่มีฟังก์ชัน" : r?.threw ? `โยน(${String(r.message).slice(0, 80)})` : String(r?.code ?? js(r).slice(0, 60)));
const refused = (r: Any, code: string) => r?.ok === false && r?.code === code && !r?.threw;
const leaks = (v: unknown): string[] => { const s = js(v); return SECRETS.filter((x) => s.includes(x)).map((x) => `…${x.slice(-6)}`); };
const tryImport = async (p: string): Promise<Any> => {
  try { return await import(p as string); } catch (e) { out(`  (โหลด ${p} ไม่ได้: ${errMsg(e).slice(0, 160)})`); return null; }
};
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, __missing: true, code: `MISSING:${name}` };
  try { return keep(await fn(...args)); } catch (e) { return { ok: false, threw: true, code: "THREW", message: errMsg(e) }; }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { __missing: true };
  try { return fn(...args); } catch (e) { return { __threw: true, message: errMsg(e) }; }
}
/** เปิดกล่องเองตามสูตรในใบสั่ง (ไม่พึ่งโค้ดของ builder) */
function oracleOpen(box: unknown, raw: string, label = "integrations:"): Record<string, unknown> | null {
  try {
    if (typeof box !== "string") return null;
    const [a, b, c] = box.split(".");
    if (!a || !b || c === undefined || box.split(".").length !== 3) return null;
    const iv = Buffer.from(a, "base64");
    const tag = Buffer.from(b, "base64");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const d = createDecipheriv("aes-256-gcm", createHash("sha256").update(`${label}${raw}`).digest(), iv);
    d.setAuthTag(tag);
    const o: unknown = JSON.parse(Buffer.concat([d.update(Buffer.from(c, "base64")), d.final()]).toString("utf8"));
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch { return null; }
}
const TSX = existsSync(join(ROOT, "node_modules/.bin/tsx")) ? join(ROOT, "node_modules/.bin/tsx") : "";
function runScript(file: string, args: string[], env: Record<string, string | undefined>, timeoutMs: number) {
  const fullEnv = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries({ ...process.env, ...env })) if (v !== undefined) fullEnv[k] = v;
  const r = TSX
    ? spawnSync(TSX, [file, ...args], { cwd: ROOT, env: fullEnv, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 })
    : spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: fullEnv, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}
const tail = (s: string, n = 200) => s.replace(/\s+/g, " ").trim().slice(-n);
function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const outF: string[] = [];
  for (const n of readdirSync(abs)) {
    const rel = join(dir, n);
    if (statSync(join(ROOT, rel)).isDirectory()) outF.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(n)) outF.push(rel);
  }
  return outF;
}

// ═══════════════ โหลดโมดูล ═══════════════
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: Any };
const FILES = {
  types: "src/lib/core/integrations/types.ts",
  registry: "src/lib/core/integrations/registry.ts",
  box: "src/lib/core/integrations/secret-box.ts",
  service: "src/lib/core/integrations/service.ts",
  fake: "src/lib/core/integrations/providers/fake.ts",
  index: "src/lib/core/integrations/index.ts",
  page: "src/app/app/settings/integrations/page.tsx",
};
const I: Any = has(FILES.index) ? await tryImport("@/lib/core/integrations") : null;
const BOX: Any = has(FILES.box) ? await tryImport("@/lib/core/integrations/secret-box") : null;
const PERM: Any = await tryImport("@/lib/core/permissions");
const NEED = (): string[] => (I ? [] : ["ยังไม่มี @/lib/core/integrations"]);

const IDS: Record<string, string> = {}; // L1..L5 → id
const created = { appSystemId: "", connId: "", connWebhookKey: "", payProfile: "none" as "none" | "created" | "patched", payPrev: null as Any };
const view = (r: Any): Any => r?.integration ?? null;
const fieldOf = (v: Any, name: string): Any => (Array.isArray(v?.fields) ? v.fields.find((f: Any) => f?.name === name) : null);
const rowOf = async (id: string): Promise<Any> => (id ? prisma.tenantIntegration.findUnique({ where: { id } }) : null);
const eventsOf = async (id: string, type: string): Promise<Any[]> =>
  ((await prisma.outboxEvent.findMany({ where: { tenantId: { in: [TA, TB] }, type, createdAt: { gte: START } }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => e?.payload?.integrationId === id);
const logsOf = async (id: string): Promise<Any[]> => prisma.integrationCallLog.findMany({ where: { integrationId: id }, orderBy: { at: "asc" } });
const save = (ctx: Any, a: Actor, input: Any) => call(I, "saveIntegration", ctx, a, input);
const test = (ctx: Any, a: Actor, id: string) => call(I, "testIntegration", ctx, a, { id });
const disable = (ctx: Any, a: Actor, id: string) => call(I, "disableIntegration", ctx, a, { id });
const list = (ctx: Any, a: Actor) => call(I, "listIntegrations", ctx, a);
const getI = async (ctx: Any, kind: string): Promise<Any> => {
  if (typeof I?.getIntegration !== "function") return { __missing: true };
  try { return await I.getIntegration(ctx, kind); } catch (e) { return { __threw: true, message: errMsg(e) }; }
};
const callI = async (h: Any, op: string, fn: (a: Any) => Promise<unknown>, opts?: Any): Promise<Any> => {
  if (typeof I?.callIntegration !== "function") return { ok: false, __missing: true };
  try { return keep(await I.callIntegration(h, op, fn, opts)); } catch (e) { return { ok: false, threw: true, message: errMsg(e) }; }
};
const fakeIn = (label: string, fields: Record<string, string>, extra: Any = {}) => ({ kind: "SLIP_VERIFY", provider: "FAKE", label, fields, ...extra });
const throwSecret = (s: string) => async () => { throw new Error(`boom apiKey=${s}`); };

async function cleanup(): Promise<void> {
  const mine = (await prisma.tenantIntegration.findMany({ where: { tenantId: { in: [TA, TB] }, label: { startsWith: "svc-r05-" } }, select: { id: true } })) as { id: string }[];
  const ids = [...new Set([...mine.map((r) => r.id), ...Object.values(IDS)])];
  if (ids.length) {
    await prisma.integrationCallLog.deleteMany({ where: { integrationId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { targetType: "TenantIntegration", targetId: { in: ids } } });
    await prisma.tenantIntegration.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.integrationCallLog.deleteMany({ where: { integrationId: { startsWith: "svc-r05-" } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: [TA, TB] }, action: { startsWith: "settings.integration." } } });
  await prisma.outboxEvent.deleteMany({ where: { tenantId: { in: [TA, TB] }, type: { in: EVENTS } } });
  await prisma.chatChannelConnection.deleteMany({ where: { tenantId: TA, externalAccountId: { startsWith: "svc-r05-" } } });
  await prisma.appSystem.deleteMany({ where: { tenantId: TA, name: { startsWith: "svc-r05-" } } });
}

out(`\n===== QC SVC R0.5 · ศูนย์เชื่อมต่อ · รอบ ${RAND} =====`);
try {
  await cleanup(); // ของรอบก่อนที่ค้าง
  const tenantsOk = (await prisma.tenant.count({ where: { id: { in: [TA, TB] } } })) === 2;
  if (!tenantsOk) chk("PRE", "ร้าน QC ของ SVC มีอยู่ (seed R0.2)", false, "ไม่พบ svcqc-tenant/svcqc-other-tenant — รัน seed-svc-qc ก่อน");

  // ═══════════════ F ไฟล์ ═══════════════
  out("\n— F ไฟล์ส่งมอบ —");
  await step("F-1", "ไฟล์ core/integrations 6 ไฟล์ + หน้า settings/integrations ครบ", async (p) => {
    for (const [k, f] of Object.entries(FILES)) if (!has(f)) p.push(`ไม่มี ${k}: ${f}`);
  });
  await step("F-2", "facade ส่งออกครบ (save/test/disable/list/get/call/purge + RETENTION 30)", async (p) => {
    p.push(...NEED());
    for (const n of ["saveIntegration", "testIntegration", "disableIntegration", "listIntegrations", "getIntegration", "callIntegration", "purgeIntegrationCallLogs"]) if (I && typeof I[n] !== "function") p.push(`ไม่มี ${n}`);
    if (I && I.INTEGRATION_CALL_LOG_RETENTION_DAYS !== 30) p.push(`INTEGRATION_CALL_LOG_RETENTION_DAYS = ${js(I.INTEGRATION_CALL_LOG_RETENTION_DAYS)}`);
    if (!BOX) p.push("โหลด secret-box ไม่ได้");
    else for (const n of ["sealIntegrationSecret", "openIntegrationSecret", "integrationSecretKeyConfigured"]) if (typeof BOX[n] !== "function") p.push(`secret-box ไม่มี ${n}`);
  });
  await step("F-3", "core/integrations ไม่ import โมดูล POS/แชท · ไม่อ้าง CHAT_/POS_CREDENTIALS_KEY", async (p) => {
    const fs = walk("src/lib/core/integrations");
    if (!fs.length) p.push("ไม่มีไฟล์");
    for (const f of fs) {
      const s = read(f);
      if (/from\s+["'][^"']*modules\/(pos|chat)[^"']*["']|import\(\s*["'][^"']*modules\/(pos|chat)/.test(s)) p.push(`${f} import POS/แชท`);
      if (/CHAT_CREDENTIALS_KEY|POS_CREDENTIALS_KEY/.test(s)) p.push(`${f} อ้างกุญแจของระบบอื่น`);
    }
  });
  await step("F-4", ".env.example มี INTEGRATIONS_CREDENTIALS_KEY · ไม่มีไฟล์ใน git ที่ตั้ง INTEGRATIONS_FAKE (prod ไม่มีค่านี้)", async (p) => {
    if (!/^\s*#?\s*INTEGRATIONS_CREDENTIALS_KEY=/m.test(read(".env.example"))) p.push(".env.example ไม่มี INTEGRATIONS_CREDENTIALS_KEY=");
    const tracked = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).stdout.split("\n").filter((f) => /^\.env|(^|\/)vercel\.json$/.test(f) && !/qc/.test(f));
    for (const f of tracked) if (/INTEGRATIONS_FAKE\s*[=:]/.test(read(f))) p.push(`${f} ตั้ง INTEGRATIONS_FAKE`);
  }, "MAJOR");

  // ═══════════════ S secret-box ═══════════════
  out("\n— S กล่องความลับ —");
  await step("S-1", "seal/open ไปกลับได้ · รูปแบบ iv12.tag16.cipher · iv สุ่ม (2 ครั้งไม่เท่ากัน)", async (p) => {
    if (!BOX) { p.push("ไม่มี secret-box"); return; }
    const v = sec("s1");
    const b1 = callSync(BOX, "sealIntegrationSecret", { apiKey: v });
    const b2 = callSync(BOX, "sealIntegrationSecret", { apiKey: v });
    if (typeof b1 !== "string") { p.push(`seal → ${js(b1).slice(0, 80)}`); return; }
    if (b1 === b2) p.push("seal 2 ครั้งได้กล่องเดียวกัน (iv ไม่สุ่ม)");
    if (b1.includes(v)) p.push("กล่องมีค่าดิบ");
    const o = callSync(BOX, "openIntegrationSecret", b1);
    if (o?.apiKey !== v) p.push("open ไม่ได้ค่าเดิม");
    const parts = b1.split(".");
    if (parts.length !== 3 || Buffer.from(parts[0]!, "base64").length !== 12 || Buffer.from(parts[1]!, "base64").length !== 16) p.push("รูปแบบไม่ใช่ b64(iv12).b64(tag16).b64(cipher)");
  });
  await step("S-2", "กุญแจ = SHA-256(\"integrations:\"+env) (ข้อสอบเปิดเอง) · ป้าย pos-credentials:/ดิบ เปิดไม่ได้", async (p) => {
    if (!BOX) { p.push("ไม่มี secret-box"); return; }
    const v = sec("s2");
    const b = callSync(BOX, "sealIntegrationSecret", { apiKey: v });
    if (oracleOpen(b, KEY1)?.apiKey !== v) p.push("สูตร integrations:+key เปิดไม่ได้");
    if (oracleOpen(b, KEY1, "pos-credentials:")) p.push("ป้าย pos-credentials: เปิดได้ (ไม่แยกโดเมน)");
    if (oracleOpen(b, KEY1, "")) p.push("กุญแจดิบไม่มีป้ายเปิดได้");
  });
  await step("S-3", "open: กุญแจผิด/ถูกแก้/ขยะ/ไม่ใช่ string ⇒ null ไม่ throw", async (p) => {
    if (!BOX) { p.push("ไม่มี secret-box"); return; }
    const b = callSync(BOX, "sealIntegrationSecret", { apiKey: sec("s3") });
    const tampered = typeof b === "string" ? b.slice(0, -4) + (b.endsWith("AAAA") ? "BBBB" : "AAAA") : "x";
    for (const [lbl, v] of [["ถูกแก้", tampered], ["ขยะ", "a.b.c"], ["ว่าง", ""], ["ตัวเลข", 42], ["null", null]] as const) {
      const r = callSync(BOX, "openIntegrationSecret", v);
      if (r !== null) p.push(`${lbl} → ${js(r).slice(0, 40)}`);
    }
    await withEnv({ INTEGRATIONS_CREDENTIALS_KEY: KEY2 }, async () => {
      const r = callSync(BOX, "openIntegrationSecret", b);
      if (r !== null) p.push(`กุญแจผิด → ${js(r).slice(0, 40)} (คาด null)`);
    });
  });
  await step("S-4", "ไม่มีกุญแจ/กุญแจ < 32 ⇒ configured false · seal throw · open null (ไม่มีกุญแจสำรอง)", async (p) => {
    if (!BOX) { p.push("ไม่มี secret-box"); return; }
    const b = callSync(BOX, "sealIntegrationSecret", { apiKey: sec("s4") });
    for (const [lbl, k] of [["ไม่มี", undefined], ["31 ตัว", "x".repeat(31)], ["ช่องว่าง 40", " ".repeat(40)]] as const) {
      await withEnv({ INTEGRATIONS_CREDENTIALS_KEY: k, NODE_ENV: "development" }, async () => {
        if (callSync(BOX, "integrationSecretKeyConfigured") !== false) p.push(`${lbl}: configured ไม่ใช่ false`);
        const s = callSync(BOX, "sealIntegrationSecret", { apiKey: "x" });
        if (!s?.__threw) p.push(`${lbl}: seal ไม่ throw (${typeof s})`);
        if (callSync(BOX, "openIntegrationSecret", b) !== null) p.push(`${lbl}: open ไม่ใช่ null`);
      });
    }
  });

  // ═══════════════ K ไม่มีกุญแจ (ก่อนมีแถว) ═══════════════
  out("\n— K ไม่มีกุญแจ —");
  await step("K-1", "ไม่มีกุญแจ/กุญแจสั้น ⇒ save ค่าลับ = NOT_CONFIGURED \"ยังไม่ตั้งกุญแจ\" · ไม่มีแถวเกิด", async (p) => {
    p.push(...NEED());
    for (const [lbl, k] of [["ไม่มี", undefined], ["31 ตัว", "k".repeat(31)]] as const) {
      await withEnv({ INTEGRATIONS_CREDENTIALS_KEY: k }, async () => {
        const r = await save(CTX_A, ACT.owner, fakeIn(`${PFX}-K1`, { apiKey: sec("k1") }));
        if (!refused(r, "NOT_CONFIGURED")) p.push(`${lbl} → ${codeOf(r)} (คาด NOT_CONFIGURED)`);
        else if (!String(r.message ?? "").includes("ยังไม่ตั้งกุญแจ")) p.push(`${lbl}: ข้อความไม่มี "ยังไม่ตั้งกุญแจ"`);
      });
    }
    const n = await prisma.tenantIntegration.count({ where: { tenantId: TA, label: `${PFX}-K1` } });
    if (n) p.push(`มีแถวเกิด ${n} (ห้ามเก็บ plaintext/แถวเปล่า)`);
  });
  await step("K-2", "ไม่มีกุญแจ ⇒ list ยังใช้ได้ keyConfigured=false ไม่ throw", async (p) => {
    p.push(...NEED());
    await withEnv({ INTEGRATIONS_CREDENTIALS_KEY: undefined }, async () => {
      const r = await list(CTX_A, ACT.owner);
      if (r?.ok !== true) p.push(`list → ${codeOf(r)}`);
      else if (r.keyConfigured !== false) p.push(`keyConfigured ${js(r.keyConfigured)}`);
    });
  });

  // ═══════════════ C บันทึก ═══════════════
  out("\n— C บันทึก (patch · เปลี่ยน/ล้างคีย์ · ปิดบัง) —");
  const S1 = sec("L1a");
  const S2 = sec("L1b");
  await step("C-1", "OWNER สร้าง FAKE SLIP_VERIFY (ทุกหน่วย) ⇒ DRAFT · ฟิลด์ลับ masked ••••+4 ตัวท้าย · ผลคืนไม่มีค่าลับ", async (p) => {
    p.push(...NEED());
    const r = await save(CTX_A, ACT.owner, fakeIn(`${PFX}-L1`, { apiKey: S1, accountId: "acc-1" }, { unitIds: [] }));
    if (r?.ok !== true) { p.push(`save → ${codeOf(r)} ${String(r?.message ?? "").slice(0, 60)}`); return; }
    const v = view(r);
    IDS.L1 = String(v?.id ?? "");
    if (!IDS.L1) p.push("ไม่มี integration.id");
    if (v?.status !== "DRAFT") p.push(`status ${js(v?.status)} (คาด DRAFT)`);
    if (v?.virtual !== false) p.push("virtual ไม่ใช่ false");
    const f = fieldOf(v, "apiKey");
    if (!f || f.secret !== true || f.filled !== true) p.push(`apiKey field ${js(f).slice(0, 80)}`);
    else if (f.masked !== `••••${S1.slice(-4)}`) p.push(`masked ${js(f.masked)} (คาด ••••${S1.slice(-4)})`);
    const a = fieldOf(v, "accountId");
    if (a?.masked !== "acc-1" || a?.secret !== false) p.push(`accountId ${js(a).slice(0, 80)}`);
    if (leaks(r).length || js(r).includes(S1.slice(0, 8)) || js(r).includes("secretBox")) p.push("ผลคืนมีค่าลับ/8 ตัวแรก/secretBox");
  });
  await step("C-2", "แถวดิบ: กล่องเปิด (สูตรข้อสอบ) ได้ apiKey · publicFields ไม่มีค่าลับ · secretNames · ผู้สร้าง/แก้ = owner", async (p) => {
    const row = await rowOf(IDS.L1 ?? "");
    if (!row) { p.push("ไม่มีแถว"); return; }
    const o = oracleOpen(row.secretBox, KEY1);
    if (o?.apiKey !== S1) p.push("กล่องเปิดแล้วไม่ได้ apiKey");
    if (o && "accountId" in o) p.push("ค่าสาธารณะอยู่ในกล่อง");
    if (js(row.publicFields) !== js({ accountId: "acc-1" }) && row.publicFields?.accountId !== "acc-1") p.push(`publicFields ${js(row.publicFields)}`);
    if (row.publicFields && "apiKey" in row.publicFields) p.push("publicFields มี apiKey");
    if (js(row.secretNames) !== js(["apiKey"])) p.push(`secretNames ${js(row.secretNames)}`);
    if (leaks({ ...row, secretBox: null }).length || String(row.secretBox).includes(S1)) p.push("แถวดิบมีค่าลับ plaintext");
    if (row.createdById !== ACT.owner.userId || row.updatedById !== ACT.owner.userId) p.push("createdById/updatedById ≠ owner");
    if (row.kind !== "SLIP_VERIFY" || row.provider !== "FAKE" || js(row.unitIds) !== "[]") p.push(`kind/provider/unitIds ${row.kind}/${row.provider}/${js(row.unitIds)}`);
  });
  await step("C-3", "patch: ส่งเฉพาะ accountId ⇒ apiKey/label/unitIds/onFailure คงเดิม", async (p) => {
    const before = await rowOf(IDS.L1 ?? "");
    const r = await save(CTX_A, ACT.owner, { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", fields: { accountId: "acc-2" } });
    if (r?.ok !== true) { p.push(`save → ${codeOf(r)}`); return; }
    const row = await rowOf(IDS.L1 ?? "");
    if (oracleOpen(row?.secretBox, KEY1)?.apiKey !== S1) p.push("apiKey หาย/เปลี่ยน");
    if (row?.publicFields?.accountId !== "acc-2") p.push(`accountId ${js(row?.publicFields)}`);
    if (row?.label !== before?.label || js(row?.unitIds) !== js(before?.unitIds) || row?.onFailure !== before?.onFailure) p.push("label/unitIds/onFailure เปลี่ยน");
  });
  await step("C-4", "เปลี่ยนคีย์: ส่ง apiKey ใหม่ ⇒ แถวเดิม (id เดิม) · กล่องได้ค่าใหม่ · ค่าเก่าหายหมด · accountId คงเดิม", async (p) => {
    const r = await save(CTX_A, ACT.owner, { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", fields: { apiKey: S2 } });
    if (r?.ok !== true) { p.push(`save → ${codeOf(r)}`); return; }
    if (view(r)?.id !== IDS.L1) p.push("id เปลี่ยน");
    if (fieldOf(view(r), "apiKey")?.masked !== `••••${S2.slice(-4)}`) p.push(`masked ${js(fieldOf(view(r), "apiKey")?.masked)}`);
    const row = await rowOf(IDS.L1 ?? "");
    const o = oracleOpen(row?.secretBox, KEY1);
    if (o?.apiKey !== S2) p.push("กล่องไม่ใช่ค่าใหม่");
    if (js(o).includes(S1) || js(row).includes(S1)) p.push("ค่าเก่ายังอยู่");
    if (row?.publicFields?.accountId !== "acc-2") p.push("accountId หาย");
    const n = await prisma.tenantIntegration.count({ where: { tenantId: TA, label: `${PFX}-L1` } });
    if (n !== 1) p.push(`แถว L1 = ${n}`);
  });
  await step("C-5", "\"\" = ล้างฟิลด์ (public) · ส่ง onFailure อย่างเดียว ⇒ เปลี่ยนแค่นั้น · ไม่ส่ง id + label ซ้ำ = แถวเดิม", async (p) => {
    const r1 = await save(CTX_A, ACT.owner, { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", fields: { accountId: "" } });
    if (r1?.ok !== true) p.push(`ล้าง → ${codeOf(r1)}`);
    let row = await rowOf(IDS.L1 ?? "");
    if (row?.publicFields && "accountId" in row.publicFields && row.publicFields.accountId !== "") p.push(`accountId ยังอยู่ ${js(row.publicFields)}`);
    if (oracleOpen(row?.secretBox, KEY1)?.apiKey !== S2) p.push("ล้าง accountId แล้ว apiKey หาย");
    const r2 = await save(CTX_A, ACT.owner, { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", onFailure: "REJECT" });
    if (r2?.ok !== true) p.push(`onFailure → ${codeOf(r2)}`);
    row = await rowOf(IDS.L1 ?? "");
    if (row?.onFailure !== "REJECT") p.push(`onFailure ${row?.onFailure}`);
    if (oracleOpen(row?.secretBox, KEY1)?.apiKey !== S2) p.push("ส่ง onFailure แล้ว apiKey หาย");
    const r3 = await save(CTX_A, ACT.owner, { kind: "SLIP_VERIFY", provider: "FAKE", label: `${PFX}-L1`, onFailure: "MANUAL" });
    if (r3?.ok !== true) p.push(`ไม่ส่ง id (label ซ้ำ) → ${codeOf(r3)}`);
    else if (view(r3)?.id !== IDS.L1) p.push("ไม่ส่ง id + label ซ้ำ ⇒ ได้แถวใหม่ (คาดแถวเดิม)");
    const n = await prisma.tenantIntegration.count({ where: { tenantId: TA, label: `${PFX}-L1` } });
    if (n !== 1) p.push(`แถว L1 = ${n}`);
    row = await rowOf(IDS.L1 ?? "");
    if (row?.onFailure !== "MANUAL") p.push(`onFailure หลังส่ง MANUAL = ${row?.onFailure}`);
  });
  await step("C-6", "validation ⇒ VALIDATION ไม่แตะแถว (kind เสมือน/มั่ว · provider มั่ว · ฟิลด์แปลก · onFailure ผิด · label ว่าง · หน่วยร้านอื่น/ไม่มีจริง)", async (p) => {
    p.push(...NEED());
    const before = await prisma.tenantIntegration.findMany({ where: { tenantId: TA }, select: { id: true, updatedAt: true } });
    const cases: [string, Any][] = [
      ["kind LINE_OA", { kind: "LINE_OA", provider: "FAKE", label: `${PFX}-v1`, fields: { apiKey: "x".repeat(12) } }],
      ["kind PROMPTPAY", { kind: "PROMPTPAY", provider: "FAKE", label: `${PFX}-v2`, fields: { apiKey: "x".repeat(12) } }],
      ["kind มั่ว", { kind: "BOGUS", provider: "FAKE", label: `${PFX}-v3`, fields: { apiKey: "x".repeat(12) } }],
      ["provider มั่ว", fakeIn(`${PFX}-v4`, { apiKey: "x".repeat(12) }, { provider: "NOPE" })],
      ["ฟิลด์แปลก", { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", fields: { bogus: "x" } }],
      ["onFailure ผิด", { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", onFailure: "IGNORE" }],
      ["label ว่างตอนสร้าง", fakeIn("", { apiKey: "x".repeat(12) })],
      ["หน่วยร้านอื่น", fakeIn(`${PFX}-v5`, { apiKey: "x".repeat(12) }, { unitIds: [UB_BARBER] })],
      ["หน่วยไม่มีจริง", fakeIn(`${PFX}-v6`, { apiKey: "x".repeat(12) }, { unitIds: [`${PFX}-nounit`] })],
    ];
    for (const [lbl, inp] of cases) {
      const r = await save(CTX_A, ACT.owner, inp);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const after = await prisma.tenantIntegration.findMany({ where: { tenantId: TA }, select: { id: true, updatedAt: true } });
    if (js(after.map((x: Any) => [x.id, String(x.updatedAt)]).sort()) !== js(before.map((x: Any) => [x.id, String(x.updatedAt)]).sort())) p.push("แถวเปลี่ยน/เกิดใหม่");
    const virt = await prisma.tenantIntegration.count({ where: { kind: { in: ["LINE_OA", "PROMPTPAY"] } } });
    if (virt) p.push(`มีแถว kind LINE_OA/PROMPTPAY ${virt}`);
  });
  await step("C-7", "audit settings.integration.save: actor owner · target TenantIntegration/id · มีชื่อฟิลด์ · ไม่มีค่าลับ/masked", async (p) => {
    const rows = (await prisma.auditLog.findMany({ where: { tenantId: TA, action: "settings.integration.save", targetId: IDS.L1 ?? "-" } })) as Any[];
    if (rows.length < 3) p.push(`audit save ${rows.length} แถว (คาด ≥ 3)`);
    if (rows.some((r) => r.actorId !== ACT.owner.userId || r.targetType !== "TenantIntegration")) p.push("actorId/targetType ผิด");
    if (!rows.some((r) => js([r.before, r.after]).includes("apiKey"))) p.push("ไม่มีชื่อฟิลด์ apiKey ใน before/after");
    if (leaks(rows).length) p.push(`มีค่าลับ ${leaks(rows).join(",")}`);
    if (rows.some((r) => js(r).includes(`••••${S2.slice(-4)}`) || js(r).includes(`••••${S1.slice(-4)}`))) p.push("มีค่า masked (4 ตัวท้าย)");
  });

  // ═══════════════ A สิทธิ์ ═══════════════
  out("\n— A สิทธิ์ settings.integrations.manage —");
  await step("A-1", "คีย์ settings.integrations.manage อยู่ในทะเบียนสิทธิ์ · ป้ายไทย", async (p) => {
    if (!PERM) { p.push("โหลด permissions ไม่ได้"); return; }
    if (PERM.isPermissionKey?.("settings.integrations.manage") !== true) p.push("isPermissionKey false");
    const lb = String(PERM.permissionLabel?.("settings.integrations.manage") ?? "");
    if (!/[฀-๿]/.test(lb) || lb === "settings.integrations.manage") p.push(`ป้าย ${js(lb)}`);
  }, "MAJOR");
  await step("A-2", "MANAGER (ไม่มีคีย์) save/test/disable ⇒ PERMISSION_DENIED ไม่แตะแถว · list ได้ (อ่านอย่างเดียว ไม่มีค่าลับ)", async (p) => {
    p.push(...NEED());
    const before = js(await rowOf(IDS.L1 ?? ""));
    const r1 = await save(CTX_A, ACT.manager, { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", fields: { apiKey: sec("mgr") } });
    const r2 = await test(CTX_A, ACT.manager, IDS.L1 ?? "");
    const r3 = await disable(CTX_A, ACT.manager, IDS.L1 ?? "");
    const r4 = await save(CTX_A, ACT.manager, fakeIn(`${PFX}-mgr`, { apiKey: sec("mgr2") }, { unitIds: [U.barber] }));
    for (const [l, r] of [["save", r1], ["test", r2], ["disable", r3], ["สร้างใหม่", r4]] as const) if (!refused(r, "PERMISSION_DENIED")) p.push(`${l} → ${codeOf(r)}`);
    if (js(await rowOf(IDS.L1 ?? "")) !== before) p.push("แถว L1 เปลี่ยน");
    if (await prisma.tenantIntegration.count({ where: { label: `${PFX}-mgr` } })) p.push("แถว mgr เกิด");
    const l = await list(CTX_A, ACT.manager);
    if (l?.ok !== true) p.push(`MANAGER list → ${codeOf(l)} (คาด ok)`);
    else if (leaks(l).length) p.push("list ของ MANAGER มีค่าลับ");
  });
  await step("A-3", "STAFF ไม่มีคีย์ ⇒ list/save PERMISSION_DENIED · STAFF \"settings.*\" ไม่นับ", async (p) => {
    p.push(...NEED());
    const l = await list(CTX_A, ACT.ek);
    if (!refused(l, "PERMISSION_DENIED")) p.push(`ek list → ${codeOf(l)}`);
    const s = await save(CTX_A, ACT.ek, fakeIn(`${PFX}-ek`, { apiKey: sec("ek") }, { unitIds: [U.barber] }));
    if (!refused(s, "PERMISSION_DENIED")) p.push(`ek save → ${codeOf(s)}`);
    const w = await save(CTX_A, ACT.ekWild, fakeIn(`${PFX}-ekw`, { apiKey: sec("ekw") }, { unitIds: [U.barber] }));
    if (!refused(w, "PERMISSION_DENIED")) p.push(`settings.* save → ${codeOf(w)}`);
    if (await prisma.tenantIntegration.count({ where: { label: { in: [`${PFX}-ek`, `${PFX}-ekw`] } } })) p.push("แถวเกิด");
  });
  await step("A-4", "STAFF ได้คีย์ (หน่วย barber): สร้าง unitIds [barber] ได้ · [] / [dorm] / แก้แถวทุกหน่วย ⇒ PERMISSION_DENIED (ข้ามสาขา)", async (p) => {
    p.push(...NEED());
    const ok = await save(CTX_A, ACT.ekGrant, fakeIn(`${PFX}-L5`, { apiKey: sec("L5") }, { unitIds: [U.barber] }));
    if (ok?.ok !== true) p.push(`[barber] → ${codeOf(ok)} (คาด ok)`);
    else IDS.L5 = String(view(ok)?.id ?? "");
    for (const [lbl, inp] of [
      ["unitIds []", fakeIn(`${PFX}-g1`, { apiKey: sec("g1") }, { unitIds: [] })],
      ["unitIds [dorm]", fakeIn(`${PFX}-g2`, { apiKey: sec("g2") }, { unitIds: [U.dorm] })],
      ["ขยาย L5 ไป dorm", { id: IDS.L5, kind: "SLIP_VERIFY", provider: "FAKE", unitIds: [U.barber, U.dorm] }],
      ["แก้ L1 (ทุกหน่วย)", { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", fields: { accountId: "x" } }],
    ] as const) {
      const r = await save(CTX_A, ACT.ekGrant, inp);
      if (!refused(r, "PERMISSION_DENIED")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const d = await disable(CTX_A, ACT.ekGrant, IDS.L1 ?? "");
    if (!refused(d, "PERMISSION_DENIED")) p.push(`disable L1 → ${codeOf(d)}`);
    if (await prisma.tenantIntegration.count({ where: { label: { in: [`${PFX}-g1`, `${PFX}-g2`] } } })) p.push("แถวเกิด");
    const r5 = await rowOf(IDS.L5 ?? "");
    if (r5 && js(r5.unitIds) !== js([U.barber])) p.push(`L5 unitIds ${js(r5.unitIds)}`);
  });

  // ═══════════════ X ข้ามร้าน ═══════════════
  out("\n— X ข้ามร้าน —");
  await step("X-1", "ร้าน B: list ไม่เห็นของร้าน A · save/test/disable ด้วย id ร้าน A ⇒ NOT_FOUND · แถว A ไม่เปลี่ยน", async (p) => {
    p.push(...NEED());
    const before = js(await rowOf(IDS.L1 ?? ""));
    const l = await list(CTX_B, ACT.otherOwner);
    if (l?.ok !== true) p.push(`B list → ${codeOf(l)}`);
    else if (js(l).includes(IDS.L1 ?? "@@") || js(l).includes(PFX)) p.push("B เห็นแถวของ A");
    const r1 = await save(CTX_B, ACT.otherOwner, { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", fields: { apiKey: sec("xb") } });
    const r2 = await test(CTX_B, ACT.otherOwner, IDS.L1 ?? "");
    const r3 = await disable(CTX_B, ACT.otherOwner, IDS.L1 ?? "");
    for (const [lbl, r] of [["save", r1], ["test", r2], ["disable", r3]] as const) if (!refused(r, "NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)}`);
    if (js(await rowOf(IDS.L1 ?? "")) !== before) p.push("แถว A เปลี่ยน");
    if (await prisma.tenantIntegration.count({ where: { tenantId: TB, label: { startsWith: "svc-r05-" } } })) p.push("เกิดแถวในร้าน B");
  });

  // ═══════════════ T test ═══════════════
  out("\n— T ทดสอบการเชื่อม (FAKE) —");
  await step("T-1", "test (mode OK) ⇒ passed · CONNECTED · lastTestOk/At · call log op test · event connected 1 ครั้ง", async (p) => {
    p.push(...NEED());
    const r = await test(CTX_A, ACT.owner, IDS.L1 ?? "");
    if (r?.ok !== true || r.passed !== true) { p.push(`test → ${codeOf(r)} passed ${js(r?.passed)}`); return; }
    if (view(r)?.status !== "CONNECTED") p.push(`view status ${js(view(r)?.status)}`);
    const row = await rowOf(IDS.L1 ?? "");
    if (row?.status !== "CONNECTED" || row?.lastTestOk !== true || !row?.lastTestAt || row?.consecutiveFailures !== 0) p.push(`แถว ${row?.status}/${row?.lastTestOk}/${row?.consecutiveFailures}`);
    const lg = (await logsOf(IDS.L1 ?? "")).filter((x) => x.op === "test");
    if (lg.length !== 1 || lg[0]?.ok !== true || lg[0]?.code !== null || lg[0]?.tenantId !== TA) p.push(`call log test ${lg.length} ${js(lg[0]).slice(0, 80)}`);
    const ev = await eventsOf(IDS.L1 ?? "", "integration.connected");
    if (ev.length !== 1) p.push(`event connected ${ev.length} (คาด 1)`);
    const au = await prisma.auditLog.count({ where: { tenantId: TA, action: "settings.integration.test", targetId: IDS.L1 ?? "-" } });
    if (!au) p.push("ไม่มี audit settings.integration.test");
  });
  await step("T-2", "test ซ้ำตอน CONNECTED ⇒ ไม่มี event connected เพิ่ม", async (p) => {
    const r = await test(CTX_A, ACT.owner, IDS.L1 ?? "");
    if (r?.ok !== true || r.passed !== true) p.push(`test → ${codeOf(r)}`);
    const ev = await eventsOf(IDS.L1 ?? "", "integration.connected");
    if (ev.length !== 1) p.push(`event connected ${ev.length} (คาด 1)`);
  });
  await step("T-3", "mode FAIL: adapter สะท้อนคีย์จริง (positive control) แต่ผล test/lastError/call log ไม่มีคีย์ · passed false · PROVIDER_ERROR", async (p) => {
    const s = await save(CTX_A, ACT.owner, { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", fields: { mode: "FAIL" } });
    if (s?.ok !== true) { p.push(`ตั้ง mode FAIL → ${codeOf(s)}`); return; }
    const h = await getI({ tenantId: TA, unitId: U.massage }, "SLIP_VERIFY");
    let pc = false;
    try { await h?.adapter?.test?.(); } catch (e) { pc = String((e as Error)?.message ?? "").includes(S2); }
    if (!pc) p.push("positive control: FAKE mode FAIL ไม่ throw ข้อความที่มี apiKey (ใบสั่ง §4)");
    const r = await test(CTX_A, ACT.owner, IDS.L1 ?? "");
    if (r?.ok !== true || r.passed !== false || r.code !== "PROVIDER_ERROR") p.push(`test → ${codeOf(r)} passed ${js(r?.passed)} code ${js(r?.code)}`);
    const row = await rowOf(IDS.L1 ?? "");
    if (row?.lastTestOk !== false || typeof row?.lastError !== "string" || !row.lastError || row.lastError.length > 200) p.push(`lastTestOk/lastError ${row?.lastTestOk}/${js(row?.lastError).slice(0, 40)}`);
    if (String(row?.lastError ?? "").includes("fake provider failure") || String(row?.lastError ?? "").includes("apiKey=")) p.push("lastError = ข้อความดิบของผู้ให้บริการ");
    if (leaks([r, row, await logsOf(IDS.L1 ?? "")]).length) p.push("มีคีย์ในผล/แถว/call log");
    const back = await save(CTX_A, ACT.owner, { id: IDS.L1, kind: "SLIP_VERIFY", provider: "FAKE", fields: { mode: "OK" } });
    const t2 = await test(CTX_A, ACT.owner, IDS.L1 ?? "");
    if (back?.ok !== true || t2?.passed !== true) p.push(`กลับ mode OK แล้ว test → ${codeOf(t2)}`);
    if ((await rowOf(IDS.L1 ?? ""))?.consecutiveFailures !== 0) p.push("ผ่านแล้ว consecutiveFailures ไม่เป็น 0");
  });

  // ═══════════════ G getIntegration ═══════════════
  out("\n— G getIntegration · unitIds —");
  const S3 = sec("L2");
  await step("G-1", "handle: integrationId/kind/provider/onFailure/adapter · JSON(handle) ไม่มีค่าลับ · ร้าน B ⇒ null", async (p) => {
    p.push(...NEED());
    const h = await getI({ tenantId: TA, unitId: U.massage }, "SLIP_VERIFY");
    if (!h || h.__threw || h.__missing) { p.push(`get → ${js(h).slice(0, 80)}`); return; }
    if (h.integrationId !== IDS.L1 || h.kind !== "SLIP_VERIFY" || h.provider !== "FAKE" || h.onFailure !== "MANUAL") p.push(`handle ${js({ ...h, adapter: undefined })}`);
    if (typeof h.adapter?.verify !== "function" || typeof h.adapter?.test !== "function") p.push("adapter ไม่มี verify/test");
    if (leaks(h).length || js(h).includes("secretBox")) p.push("JSON(handle) มีค่าลับ");
    const b = await getI({ tenantId: TB, unitId: UB_BARBER }, "SLIP_VERIFY");
    if (b !== null) p.push(`ร้าน B → ${js(b).slice(0, 60)} (คาด null)`);
    const k = await getI({ tenantId: TA, unitId: U.massage }, "PAYMENT_GATEWAY");
    if (k !== null) p.push("ชนิดที่ไม่เชื่อม ⇒ ไม่ใช่ null");
  });
  await step("G-2", "unitIds จำกัดหน่วยจริง: L2 [barber] CONNECTED ⇒ barber=L2 · massage=L1 · ไม่ส่งหน่วย=L1 · DRAFT [dorm] ไม่นับ (dorm=L1)", async (p) => {
    p.push(...NEED());
    const r = await save(CTX_A, ACT.owner, fakeIn(`${PFX}-L2`, { apiKey: S3 }, { unitIds: [U.barber] }));
    IDS.L2 = String(view(r)?.id ?? "");
    const t = await test(CTX_A, ACT.owner, IDS.L2);
    if (t?.passed !== true) p.push(`test L2 → ${codeOf(t)}`);
    const r3 = await save(CTX_A, ACT.owner, fakeIn(`${PFX}-L3`, { apiKey: sec("L3") }, { unitIds: [U.dorm] }));
    IDS.L3 = String(view(r3)?.id ?? "");
    if (view(r3)?.status !== "DRAFT") p.push("L3 ไม่ใช่ DRAFT");
    const want: [string, string | undefined, string][] = [["barber", U.barber, IDS.L2], ["massage", U.massage, IDS.L1 ?? ""], ["ไม่ส่งหน่วย", undefined, IDS.L1 ?? ""], ["dorm (L3 DRAFT)", U.dorm, IDS.L1 ?? ""]];
    for (const [lbl, unitId, id] of want) {
      const h = await getI(unitId ? { tenantId: TA, unitId } : { tenantId: TA }, "SLIP_VERIFY");
      if (h?.integrationId !== id) p.push(`${lbl} → ${js(h?.integrationId ?? h)} (คาด ${id === IDS.L2 ? "L2" : "L1"})`);
    }
  });
  await step("G-3", "แถวที่ครอบคลุมเฉพาะหน่วย: ชนิด SMS มีแถวเดียว [barber] ⇒ หน่วยอื่น/ไม่ส่งหน่วย = null", async (p) => {
    p.push(...NEED());
    const r = await save(CTX_A, ACT.owner, { kind: "SMS", provider: "FAKE", label: `${PFX}-SMS`, unitIds: [U.barber], fields: { apiKey: sec("sms") } });
    const id = String(view(r)?.id ?? "");
    IDS.SMS = id;
    const t = await test(CTX_A, ACT.owner, id);
    if (t?.passed !== true) { p.push(`SMS FAKE test → ${codeOf(t)}`); return; }
    const a = await getI({ tenantId: TA, unitId: U.barber }, "SMS");
    const b = await getI({ tenantId: TA, unitId: U.massage }, "SMS");
    const c = await getI({ tenantId: TA }, "SMS");
    if (a?.integrationId !== id) p.push("barber ไม่ได้ SMS");
    if (b !== null) p.push("massage ได้ SMS (คาด null — ไม่อยู่ใน unitIds)");
    if (c !== null) p.push("ไม่ส่งหน่วยได้ SMS (คาด null — แถวไม่ใช่ทุกหน่วย)");
  });

  // ═══════════════ L callIntegration ═══════════════
  out("\n— L callIntegration · call log · ล้ม/ฟื้น —");
  await step("L-1", "เรียกผ่าน ⇒ {ok,value} · FAKE verify คืน VALID ยอดตรง · log ok code null ms≥0 op ตามที่ส่ง", async (p) => {
    p.push(...NEED());
    const h = await getI({ tenantId: TA, unitId: U.massage }, "SLIP_VERIFY");
    const r = await callI(h, "verify", (a) => a.verify({ qrPayload: "svc-r05" }, { amountSatang: 12300, receiver: { promptpayId: "0800000000" } }));
    if (r?.ok !== true || r.value?.status !== "VALID" || r.value?.amountSatang !== 12300) p.push(`call → ${js(r).slice(0, 100)}`);
    const lg = (await logsOf(IDS.L1 ?? "")).filter((x) => x.op === "verify");
    if (lg.length !== 1 || lg[0]?.ok !== true || lg[0]?.code !== null || !(lg[0]?.ms >= 0) || lg[0]?.tenantId !== TA) p.push(`log ${lg.length} ${js(lg[0]).slice(0, 100)}`);
  });
  await step("L-2", "fn throw (ข้อความมีคีย์) ⇒ PROVIDER_ERROR fallback MANUAL ไม่ throw · log ok false code PROVIDER_ERROR · ไม่มีคีย์ในผล/log", async (p) => {
    const h = await getI({ tenantId: TA, unitId: U.massage }, "SLIP_VERIFY");
    const n0 = (await logsOf(IDS.L1 ?? "")).length;
    const r = await callI(h, "verify", throwSecret(S2));
    if (r?.ok !== false || r.code !== "PROVIDER_ERROR" || r.fallback !== "MANUAL" || r.threw) p.push(`→ ${js(r).slice(0, 100)}`);
    const lg = await logsOf(IDS.L1 ?? "");
    const last = lg[lg.length - 1];
    if (lg.length !== n0 + 1 || last?.ok !== false || last?.code !== "PROVIDER_ERROR") p.push(`log ${lg.length - n0} ${js(last).slice(0, 80)}`);
    if (leaks([r, lg]).length) p.push("มีคีย์");
  });
  await step("L-3", "error code QUOTA ⇒ QUOTA · ไม่ resolve ⇒ TIMEOUT ภายใน ~timeoutMs (300 ms ⇒ < 3 วิ)", async (p) => {
    const h = await getI({ tenantId: TA, unitId: U.massage }, "SLIP_VERIFY");
    const q = await callI(h, "quota", async () => { throw Object.assign(new Error("over quota"), { code: "QUOTA" }); });
    if (q?.ok !== false || q.code !== "QUOTA") p.push(`QUOTA → ${js(q).slice(0, 80)}`);
    const t0 = Date.now();
    const t = await callI(h, "verify", () => new Promise(() => {}), { timeoutMs: 300 });
    const ms = Date.now() - t0;
    if (t?.ok !== false || t.code !== "TIMEOUT") p.push(`TIMEOUT → ${js(t).slice(0, 80)}`);
    if (ms > 3000) p.push(`ใช้ ${ms} ms`);
    const lg = await logsOf(IDS.L1 ?? "");
    if (!lg.some((x) => x.code === "TIMEOUT") || !lg.some((x) => x.code === "QUOTA")) p.push("log ไม่มี TIMEOUT/QUOTA");
    // ผ่านหนึ่งครั้งเพื่อรีเซ็ตตัวนับของ L1
    await callI(h, "verify", (a) => a.verify({ qrPayload: "x" }, { amountSatang: 100, receiver: {} }));
  });
  await step("L-4", "onFailure REJECT ⇒ fallback REJECT · ล้ม 4 ครั้งยัง CONNECTED · ครั้งที่ 5 ⇒ ERROR + integration.failed 1 · ครั้งที่ 6 ไม่เพิ่ม event", async (p) => {
    p.push(...NEED());
    await save(CTX_A, ACT.owner, { id: IDS.L2, kind: "SLIP_VERIFY", provider: "FAKE", onFailure: "REJECT" });
    const h = await getI({ tenantId: TA, unitId: U.barber }, "SLIP_VERIFY");
    if (h?.integrationId !== IDS.L2 || h?.onFailure !== "REJECT") { p.push(`handle L2 ${js(h?.integrationId)} ${js(h?.onFailure)}`); return; }
    for (let i = 1; i <= 6; i++) {
      const r = await callI(h, "verify", throwSecret(S3));
      if (r?.fallback !== "REJECT") p.push(`ครั้ง ${i} fallback ${js(r?.fallback)}`);
      const row = await rowOf(IDS.L2 ?? "");
      if (row?.consecutiveFailures !== i) p.push(`ครั้ง ${i} consecutiveFailures ${row?.consecutiveFailures}`);
      if (i === 4 && row?.status !== "CONNECTED") p.push(`ครั้ง 4 status ${row?.status}`);
      if (i === 5 && row?.status !== "ERROR") p.push(`ครั้ง 5 status ${row?.status}`);
      if (i === 5 && (await eventsOf(IDS.L2 ?? "", "integration.failed")).length !== 1) p.push("ครั้ง 5 ไม่มี event failed 1 ตัว");
    }
    const ev = await eventsOf(IDS.L2 ?? "", "integration.failed");
    if (ev.length !== 1) p.push(`event failed ${ev.length} (คาด 1)`);
  });
  await step("L-5", "ERROR ยังคืน handle · เรียกผ่านครั้งแรก ⇒ CONNECTED · consecutiveFailures 0 · integration.connected เพิ่ม 1", async (p) => {
    const c0 = (await eventsOf(IDS.L2 ?? "", "integration.connected")).length;
    const h = await getI({ tenantId: TA, unitId: U.barber }, "SLIP_VERIFY");
    if (h?.integrationId !== IDS.L2) { p.push(`ERROR ⇒ get ${js(h?.integrationId ?? h)} (คาด L2)`); return; }
    const r = await callI(h, "verify", (a) => a.verify({ qrPayload: "x" }, { amountSatang: 500, receiver: {} }));
    if (r?.ok !== true) p.push(`call → ${js(r).slice(0, 60)}`);
    const row = await rowOf(IDS.L2 ?? "");
    if (row?.status !== "CONNECTED" || row?.consecutiveFailures !== 0) p.push(`แถว ${row?.status}/${row?.consecutiveFailures}`);
    const c1 = (await eventsOf(IDS.L2 ?? "", "integration.connected")).length;
    if (c1 !== c0 + 1) p.push(`connected ${c0}→${c1}`);
  });
  await step("L-6", "X3: ยิงล้มพร้อมกัน 10 ทาง ⇒ consecutiveFailures = 10 พอดี · ERROR · integration.failed 1 · call log 10", async (p) => {
    p.push(...NEED());
    const r = await save(CTX_A, ACT.owner, fakeIn(`${PFX}-L4`, { apiKey: sec("L4") }, { unitIds: [U.hotel] }));
    IDS.L4 = String(view(r)?.id ?? "");
    const t = await test(CTX_A, ACT.owner, IDS.L4);
    if (t?.passed !== true) { p.push(`test L4 → ${codeOf(t)}`); return; }
    const h = await getI({ tenantId: TA, unitId: U.hotel }, "SLIP_VERIFY");
    if (h?.integrationId !== IDS.L4) { p.push("handle L4"); return; }
    const n0 = (await logsOf(IDS.L4)).length;
    const rs = await Promise.all(Array.from({ length: 10 }, () => callI(h, "verify", throwSecret("x"))));
    if (rs.some((x) => x?.ok !== false || x?.code !== "PROVIDER_ERROR")) p.push("บางทางไม่ใช่ PROVIDER_ERROR");
    const row = await rowOf(IDS.L4);
    if (row?.consecutiveFailures !== 10) p.push(`consecutiveFailures ${row?.consecutiveFailures} (คาด 10)`);
    if (row?.status !== "ERROR") p.push(`status ${row?.status}`);
    const ev = await eventsOf(IDS.L4, "integration.failed");
    if (ev.length !== 1) p.push(`event failed ${ev.length} (คาด 1)`);
    if ((await logsOf(IDS.L4)).length - n0 !== 10) p.push(`call log +${(await logsOf(IDS.L4)).length - n0}`);
  });
  await step("L-7", "call log ทุกแถวของรอบ: code ∈ {null, TIMEOUT, PROVIDER_ERROR, QUOTA, NOT_READY} · ไม่มีคีย์ · tenantId ถูกร้าน", async (p) => {
    const ids = Object.values(IDS).filter(Boolean);
    const lg = (await prisma.integrationCallLog.findMany({ where: { integrationId: { in: ids } } })) as Any[];
    if (!lg.length) p.push("ไม่มี call log");
    for (const x of lg) {
      if (x.code !== null && !CALL_CODES.has(x.code)) p.push(`code ${js(x.code).slice(0, 40)}`);
      if (x.tenantId !== TA) p.push(`tenantId ${x.tenantId}`);
    }
    if (leaks(lg).length) p.push("มีคีย์ใน call log");
  });

  // ═══════════════ E event ═══════════════
  out("\n— E event —");
  await step("E-1", "integration.connected/failed ลง 3 ทะเบียน (outbox-consumers · automation/labels · webhooks/labels)", async (p) => {
    for (const f of ["src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts"]) {
      const s = read(f);
      for (const e of EVENTS) if (!s.includes(`"${e}"`)) p.push(`${f} ไม่มี ${e}`);
    }
  }, "MAJOR");
  await step("E-2", "payload ทุก event ของรอบ = {integrationId, kind, provider} พอดี · ไม่มีค่าลับ · tenantId ถูกร้าน", async (p) => {
    const evs = (await prisma.outboxEvent.findMany({ where: { tenantId: { in: [TA, TB] }, type: { in: EVENTS }, createdAt: { gte: START } } })) as Any[];
    if (evs.length < 4) p.push(`event ${evs.length} (คาด ≥ 4)`);
    for (const e of evs) {
      const keys = Object.keys(e.payload ?? {}).sort().join(",");
      if (keys !== "integrationId,kind,provider") p.push(`payload keys ${keys}`);
      if (e.tenantId !== TA) p.push(`tenantId ${e.tenantId}`);
    }
    if (leaks(evs).length) p.push("มีค่าลับ");
  });

  // ═══════════════ V ชนิดเสมือน ═══════════════
  out("\n— V ชนิดเสมือน · catalog —");
  const MARK = sec("lineTok");
  const PP = "0812342291";
  await step("V-1", "LINE_OA = ChatChannelConnection ของร้าน (แสดง displayName · CONNECTED) · ไม่หลุด credentials/webhookKey · ไม่สร้างแถว TenantIntegration", async (p) => {
    p.push(...NEED());
    const sys = await prisma.appSystem.create({ data: { tenantId: TA, type: "CHAT", name: `svc-r05-${RAND} chat` } });
    created.appSystemId = sys.id;
    const cc = await prisma.chatChannelConnection.create({ data: { tenantId: TA, systemId: sys.id, type: "LINE", displayName: `@${PFX}-oa`, externalAccountId: `${PFX}-ext`, credentials: { channelAccessToken: MARK, channelSecret: MARK } } });
    created.connId = cc.id;
    created.connWebhookKey = cc.webhookKey;
    const l = await list(CTX_A, ACT.owner);
    if (l?.ok !== true) { p.push(`list → ${codeOf(l)}`); return; }
    const it = (l.items ?? []).find((x: Any) => x?.kind === "LINE_OA" && String(x?.label ?? "").includes(`@${PFX}-oa`));
    if (!it) p.push("ไม่มีรายการ LINE_OA ของ connection นี้");
    else {
      if (it.virtual !== true || it.status !== "CONNECTED") p.push(`virtual/status ${js(it.virtual)}/${js(it.status)}`);
      if (typeof it.manageHref !== "string" || !it.manageHref.startsWith("/app")) p.push(`manageHref ${js(it.manageHref)}`);
    }
    if (js(l).includes(MARK)) p.push("list มี credentials ของ LINE");
    if (js(l).includes(cc.webhookKey)) p.push("list มี webhookKey");
    if (await prisma.tenantIntegration.count({ where: { kind: "LINE_OA" } })) p.push("มีแถว TenantIntegration kind LINE_OA");
  });
  await step("V-2", "PROMPTPAY = PaymentProfile ของร้าน (CONNECTED · summary ปิดบังเหลือ 4 ตัวท้าย ไม่มีเลขเต็ม) · ไม่สร้างแถว", async (p) => {
    p.push(...NEED());
    const prev = await prisma.paymentProfile.findUnique({ where: { tenantId: TA } });
    let ppid = PP;
    if (!prev) { await prisma.paymentProfile.create({ data: { tenantId: TA, promptpayId: PP, displayName: `svc-r05 ${RAND}` } }); created.payProfile = "created"; }
    else if (!prev.promptpayId) { created.payPrev = prev; await prisma.paymentProfile.update({ where: { tenantId: TA }, data: { promptpayId: PP } }); created.payProfile = "patched"; }
    else ppid = prev.promptpayId;
    const l = await list(CTX_A, ACT.owner);
    if (l?.ok !== true) { p.push(`list → ${codeOf(l)}`); return; }
    const it = (l.items ?? []).find((x: Any) => x?.kind === "PROMPTPAY");
    if (!it) p.push("ไม่มีรายการ PROMPTPAY");
    else {
      if (it.virtual !== true || it.status !== "CONNECTED") p.push(`virtual/status ${js(it.virtual)}/${js(it.status)}`);
      if (!String(it.summary ?? "").includes(ppid.slice(-4))) p.push("summary ไม่มี 4 ตัวท้าย");
      if (it.manageHref !== "/app/settings/payment") p.push(`manageHref ${js(it.manageHref)}`);
    }
    if (js(l).includes(ppid)) p.push("list มีเลขพร้อมเพย์เต็ม");
    if (await prisma.tenantIntegration.count({ where: { kind: "PROMPTPAY" } })) p.push("มีแถว kind PROMPTPAY");
  });
  await step("V-3", "ร้าน B ไม่เห็น LINE/พร้อมเพย์ของร้าน A", async (p) => {
    const l = await list(CTX_B, ACT.otherOwner);
    if (l?.ok !== true) { p.push(`B list → ${codeOf(l)}`); return; }
    if (js(l).includes(`@${PFX}-oa`) || js(l).includes(created.connId || "@@")) p.push("B เห็น LINE ของ A");
  });
  await step("V-4", "catalog 9 ชนิดพอดี · ready เฉพาะ LINE_OA/PROMPTPAY/SLIP_VERIFY · virtual ถูก · SLIP_VERIFY มี FAKE (เมื่อเปิด)", async (p) => {
    const l = await list(CTX_A, ACT.owner);
    const cat: Any[] = Array.isArray(l?.catalog) ? l.catalog : [];
    const kinds = cat.map((c) => c?.kind).sort();
    if (js(kinds) !== js([...CATALOG_KINDS].sort())) p.push(`kinds ${kinds.join(",")}`);
    for (const c of cat) {
      if (c?.ready !== READY_KINDS.has(c?.kind)) p.push(`${c?.kind} ready ${js(c?.ready)}`);
      if (c?.virtual !== (c?.kind === "LINE_OA" || c?.kind === "PROMPTPAY")) p.push(`${c?.kind} virtual ${js(c?.virtual)}`);
      if (!/[฀-๿]/.test(String(c?.label ?? "")) && !/LINE|EDC|SMS/.test(String(c?.label ?? ""))) p.push(`${c?.kind} label ${js(c?.label)}`);
    }
    const sv = cat.find((c) => c?.kind === "SLIP_VERIFY");
    if (!Array.isArray(sv?.providers) || !sv.providers.some((x: Any) => x?.code === "FAKE")) p.push("SLIP_VERIFY ไม่มี FAKE ตอน INTEGRATIONS_FAKE=1");
  });

  // ═══════════════ FK FAKE ปิด ═══════════════
  out("\n— FK FAKE ต้องเปิดด้วย env —");
  for (const [id, lbl, over] of [
    ["FK-1", "ไม่มี INTEGRATIONS_FAKE", { INTEGRATIONS_FAKE: undefined }],
    ["FK-2", "APP_ENV=production + INTEGRATIONS_FAKE=1", { APP_ENV: "production", INTEGRATIONS_FAKE: "1" }],
  ] as const) {
    await step(id, `${lbl} ⇒ catalog ไม่มี FAKE · save FAKE = VALIDATION · get แถว FAKE เดิม = null ไม่ throw`, async (p) => {
      p.push(...NEED());
      await withEnv(over, async () => {
        const l = await list(CTX_A, ACT.owner);
        const sv = (Array.isArray(l?.catalog) ? l.catalog : []).find((c: Any) => c?.kind === "SLIP_VERIFY");
        if (l?.ok !== true) p.push(`list → ${codeOf(l)}`);
        else if ((sv?.providers ?? []).some((x: Any) => x?.code === "FAKE")) p.push("catalog ยังมี FAKE");
        const s = await save(CTX_A, ACT.owner, fakeIn(`${PFX}-fk`, { apiKey: sec("fk") }));
        if (!refused(s, "VALIDATION")) p.push(`save FAKE → ${codeOf(s)}`);
        const h = await getI({ tenantId: TA, unitId: U.barber }, "SLIP_VERIFY");
        if (h !== null) p.push(`get → ${js(h?.integrationId ?? h).slice(0, 60)} (คาด null)`);
      });
      if (await prisma.tenantIntegration.count({ where: { label: `${PFX}-fk` } })) p.push("แถว fk เกิด");
    });
  }

  // ═══════════════ K กุญแจหาย/ผิด (มีแถวแล้ว) ═══════════════
  out("\n— K กุญแจหาย/ผิดหลังมีแถว —");
  await step("K-3", "เอากุญแจออก ⇒ get null · test NOT_CONFIGURED (\"กุญแจ\") · list ok keyConfigured false · ไม่ throw", async (p) => {
    p.push(...NEED());
    await withEnv({ INTEGRATIONS_CREDENTIALS_KEY: undefined }, async () => {
      const h = await getI({ tenantId: TA, unitId: U.barber }, "SLIP_VERIFY");
      if (h !== null) p.push(`get → ${js(h?.integrationId ?? h).slice(0, 60)}`);
      const t = await test(CTX_A, ACT.owner, IDS.L2 ?? "");
      if (!refused(t, "NOT_CONFIGURED") || !String(t?.message ?? "").includes("กุญแจ")) p.push(`test → ${codeOf(t)}`);
      const l = await list(CTX_A, ACT.owner);
      if (l?.ok !== true || l.keyConfigured !== false) p.push(`list → ${codeOf(l)} keyConfigured ${js(l?.keyConfigured)}`);
    });
  });
  await step("K-4", "กุญแจผิด ⇒ list ok (ฟิลด์ลับ filled · masked \"••••\") · get null · test NOT_CONFIGURED · คืนกุญแจแล้วใช้ได้", async (p) => {
    p.push(...NEED());
    await withEnv({ INTEGRATIONS_CREDENTIALS_KEY: KEY2 }, async () => {
      const l = await list(CTX_A, ACT.owner);
      if (l?.ok !== true) p.push(`list → ${codeOf(l)}`);
      else {
        const it = (l.items ?? []).find((x: Any) => x?.id === IDS.L2);
        const f = fieldOf(it, "apiKey");
        if (f?.filled !== true || f?.masked !== "••••") p.push(`apiKey ${js(f).slice(0, 80)}`);
      }
      const h = await getI({ tenantId: TA, unitId: U.barber }, "SLIP_VERIFY");
      if (h !== null) p.push(`get → ${js(h?.integrationId ?? h).slice(0, 60)}`);
      const t = await test(CTX_A, ACT.owner, IDS.L2 ?? "");
      if (!refused(t, "NOT_CONFIGURED")) p.push(`test → ${codeOf(t)}`);
    });
    const h2 = await getI({ tenantId: TA, unitId: U.barber }, "SLIP_VERIFY");
    if (h2?.integrationId !== IDS.L2) p.push("คืนกุญแจแล้ว get ไม่ได้ L2");
  });

  // ═══════════════ D ถอดการเชื่อมต่อ ═══════════════
  out("\n— D ถอดการเชื่อมต่อ —");
  await step("D-1", "disable L1 ⇒ DISABLED · secretBox null · secretNames [] · get(massage) null · test = VALIDATION · audit disable", async (p) => {
    p.push(...NEED());
    const r = await disable(CTX_A, ACT.owner, IDS.L1 ?? "");
    if (r?.ok !== true || view(r)?.status !== "DISABLED") p.push(`disable → ${codeOf(r)} ${js(view(r)?.status)}`);
    const row = await rowOf(IDS.L1 ?? "");
    if (row?.status !== "DISABLED" || row?.secretBox !== null || js(row?.secretNames) !== "[]") p.push(`แถว ${row?.status} box ${row?.secretBox === null ? "null" : "มี"} names ${js(row?.secretNames)}`);
    const h = await getI({ tenantId: TA, unitId: U.massage }, "SLIP_VERIFY");
    if (h !== null) p.push(`get massage → ${js(h?.integrationId ?? h).slice(0, 60)}`);
    const h2 = await getI({ tenantId: TA, unitId: U.barber }, "SLIP_VERIFY");
    if (h2?.integrationId !== IDS.L2) p.push("barber ไม่ได้ L2 แล้ว");
    const t = await test(CTX_A, ACT.owner, IDS.L1 ?? "");
    if (!refused(t, "VALIDATION")) p.push(`test แถว DISABLED → ${codeOf(t)}`);
    if (!(await prisma.auditLog.count({ where: { tenantId: TA, action: "settings.integration.disable", targetId: IDS.L1 ?? "-" } }))) p.push("ไม่มี audit disable");
  });

  // ═══════════════ J งานลบ call log ═══════════════
  out("\n— J งานลบ call log 30 วัน —");
  await step("J-1", "minute-job integrations.calllog.purge ลงทะเบียน daily (everyMinutes 1440)", async (p) => {
    const mj = await tryImport("@/lib/platform/minute-jobs");
    if (!mj) { p.push("โหลด minute-jobs ไม่ได้"); return; }
    const st = await mj.getMinuteJobStatus(["integrations.calllog.purge"]);
    if (st?.[0]?.everyMinutes !== 1440) p.push(`everyMinutes ${js(st?.[0]?.everyMinutes)}`);
    if (!/name:\s*"integrations\.calllog\.purge"[\s\S]{0,200}cadence:\s*"daily"/.test(read("src/lib/platform/minute-jobs.ts"))) p.push("cadence ไม่ใช่ daily");
  });
  await step("J-2", "purge(now): ลบเฉพาะ at < now−30 วัน (31 วัน · 30 วัน+1 นาที) · เก็บ 30 วัน−1 นาที · 1 วัน · รันซ้ำไม่ลบเพิ่ม (X5)", async (p) => {
    p.push(...NEED());
    const now = new Date();
    const iid = `svc-r05-purge-${RAND}`;
    const mk = (ms: number, tag: string) => ({ tenantId: TA, integrationId: iid, op: `p-${tag}`, ok: true, ms: 1, code: null, at: new Date(now.getTime() - ms) });
    await prisma.integrationCallLog.createMany({ data: [mk(31 * DAY, "31d"), mk(30 * DAY + 60_000, "30d+1m"), mk(30 * DAY - 60_000, "30d-1m"), mk(DAY, "1d")] });
    const r1 = await call(I, "purgeIntegrationCallLogs", now);
    if (!(typeof r1?.deleted === "number" && r1.deleted >= 2)) p.push(`รอบ 1 → ${js(r1).slice(0, 60)}`);
    const left = ((await prisma.integrationCallLog.findMany({ where: { integrationId: iid } })) as Any[]).map((x) => x.op).sort();
    if (js(left) !== js(["p-1d", "p-30d-1m"])) p.push(`เหลือ ${left.join(",")}`);
    const r2 = await call(I, "purgeIntegrationCallLogs", now);
    if (r2?.ok === false) p.push(`รอบ 2 → ${codeOf(r2)}`);
    if ((await prisma.integrationCallLog.count({ where: { integrationId: iid } })) !== 2) p.push("รอบ 2 ลบเพิ่ม");
  });

  // ═══════════════ P หน้า ═══════════════
  out("\n— P หน้า settings/integrations —");
  const pageFiles = walk("src/app/app/settings/integrations");
  await step("P-1", "page.tsx: มี \"เร็ว ๆ นี้\" · การ์ด POS ลิงก์ไป /pos/settings · ไม่มี secretBox ในโฟลเดอร์หน้า", async (p) => {
    if (!has(FILES.page)) { p.push("ไม่มี page.tsx"); return; }
    const all = pageFiles.map(read).join("\n");
    if (!all.includes("เร็ว ๆ นี้")) p.push("ไม่มี \"เร็ว ๆ นี้\"");
    if (!/\/pos\/settings/.test(all)) p.push("ไม่มีลิงก์ /pos/settings (การ์ด POS)");
    if (/secretBox/.test(all)) p.push("มีคำว่า secretBox");
    if (/openIntegrationSecret/.test(all)) p.push("เปิดกล่องในหน้า");
  });
  await step("P-2", "ไฟล์ 'use client' ในโฟลเดอร์หน้า ไม่ import facade/service/secret-box/db (เฉพาะ types/registry)", async (p) => {
    if (!pageFiles.length) { p.push("ไม่มีไฟล์หน้า"); return; }
    for (const f of pageFiles) {
      const s = read(f);
      if (!/^\s*["']use client["']/m.test(s.slice(0, 200))) continue;
      const bad = [...s.matchAll(/from\s+["'](@\/lib\/core\/(?:integrations(?:\/(?:index|service|secret-box|providers\/[^"']*))?|db))["']/g)].map((m) => m[1]);
      if (bad.length) p.push(`${f}: ${bad.join(",")}`);
    }
  });
  await step("P-3", "visual-svc --list r0.5 ⇒ มีหน้า /app/settings/integrations", async (p) => {
    const r = runScript("scripts/visual-svc.mts", ["r0.5", "--list"], { QC_BASE: undefined }, 120_000);
    if (r.code !== 0 || !r.out.includes("/app/settings/integrations")) p.push(`exit ${r.code} · ${tail(r.out, 120)}`);
  }, "MAJOR");
  {
    const base = process.env.QC_BASE ?? "";
    let reach = "";
    if (!base) reach = "ไม่ได้ตั้ง QC_BASE (ต้อง build QC server ก่อน — builder ห้าม build)";
    else if (/:3215\b/.test(base)) reach = "QC_BASE เป็น :3215 (CRM)";
    else {
      try { const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(8000), redirect: "manual" }); if (r.status >= 500) reach = `server ตอบ ${r.status}`; }
      catch (e) { reach = `ต่อ ${base} ไม่ได้ (${errMsg(e).slice(0, 60)})`; }
    }
    if (reach) skip("P-4", "ถ่ายจริง r0.5 owner 1440/390 ⇒ exit 0 · ≥ 2 ภาพ (> 10 KB)", reach, "MAJOR", true);
    else {
      const dir = join(ROOT, ".qc-shots/svc/r0.5");
      const t6 = Date.now();
      const v = runScript("scripts/visual-svc.mts", ["r0.5", "--user", "owner", "--base", base], {}, 900_000);
      const pngs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")).filter((f) => { const s = statSync(join(dir, f)); return s.mtimeMs >= t6 - 1000 && s.size > 10_000; }) : [];
      chk("P-4", "ถ่ายจริง r0.5 owner 1440/390 ⇒ exit 0 · ≥ 2 ภาพ (> 10 KB)", v.code === 0 && pngs.length >= 2, `exit ${v.code} · ภาพ ${pngs.length} · ${tail(v.out, 160)}`, "MAJOR");
    }
  }

  // ═══════════════ Z สแกนรั่ว ═══════════════
  out("\n— Z สแกนรั่ว —");
  await step("Z-1", "DB: TenantIntegration (นอกกล่อง) · IntegrationCallLog · AuditLog · OutboxEvent · OpsEvent ของรอบ ไม่มีค่าลับ", async (p) => {
    const ti = ((await prisma.tenantIntegration.findMany({ where: { tenantId: { in: [TA, TB] } } })) as Any[]).map((r) => ({ ...r, secretBox: null }));
    const boxes = ((await prisma.tenantIntegration.findMany({ where: { tenantId: { in: [TA, TB] } }, select: { secretBox: true } })) as Any[]).map((r) => r.secretBox);
    const cl = await prisma.integrationCallLog.findMany({ where: { tenantId: { in: [TA, TB] }, at: { gte: START } } });
    const au = await prisma.auditLog.findMany({ where: { tenantId: { in: [TA, TB] }, createdAt: { gte: START } } });
    const ob = await prisma.outboxEvent.findMany({ where: { tenantId: { in: [TA, TB] }, createdAt: { gte: START } } });
    const ops = await prisma.opsEvent.findMany({ where: { createdAt: { gte: START } } });
    for (const [lbl, v] of [["TenantIntegration", ti], ["secretBox (plaintext)", boxes], ["IntegrationCallLog", cl], ["AuditLog", au], ["OutboxEvent", ob], ["OpsEvent", ops]] as const) {
      const lk = leaks(v);
      if (lk.length) p.push(`${lbl}: ${lk.join(",")}`);
    }
  });
  await step("Z-2", "console ระหว่างรัน (log/info/warn/error/debug) ไม่มีค่าลับ", async (p) => {
    const lk = leaks(CAPTURED.join("\n"));
    if (lk.length) p.push(`พบ ${lk.join(",")}`);
  });
  await step("Z-3", "ผลคืนทุกตัวของ service (DTO) ไม่มีค่าลับ/secretBox", async (p) => {
    const lk = leaks(RESULTS.filter((r) => !(r && typeof r === "object" && "value" in (r as object))));
    if (lk.length) p.push(`พบ ${lk.join(",")}`);
    if (RESULTS.some((r) => js(r).includes("\"secretBox\""))) p.push("มีคีย์ secretBox ในผลคืน");
    if (!RESULTS.length) p.push("ไม่มีผลคืนให้ตรวจ");
  });
} catch (e) {
  chk("CRASH", "จบกลางทาง: " + errMsg(e), false);
} finally {
  for (const k of ENV_KEYS) envSet(k, ENV_SAVED[k]);
  try {
    await cleanup();
    if (created.payProfile === "created") await prisma.paymentProfile.deleteMany({ where: { tenantId: TA, displayName: `svc-r05 ${RAND}` } });
    if (created.payProfile === "patched") await prisma.paymentProfile.update({ where: { tenantId: TA }, data: { promptpayId: created.payPrev?.promptpayId ?? null } });
    const left = (await prisma.tenantIntegration.count({ where: { label: { startsWith: "svc-r05-" } } }))
      + (await prisma.integrationCallLog.count({ where: { integrationId: { startsWith: "svc-r05-" } } }))
      + (await prisma.chatChannelConnection.count({ where: { externalAccountId: { startsWith: "svc-r05-" } } }))
      + (await prisma.outboxEvent.count({ where: { tenantId: { in: [TA, TB] }, type: { in: EVENTS } } }));
    chk("Z-4", "ทำความสะอาด: ไม่เหลือแถว svc-r05-* / event integration.* ของร้าน QC", left === 0, `เหลือ ${left}`, "MAJOR");
  } catch (e) {
    chk("Z-4", "ทำความสะอาด", false, errMsg(e), "MAJOR");
  }
  await prisma.$disconnect?.().catch(() => {});
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const blockingSkip = skipped.filter((c) => !c.allowSkip);
const passed = cks.length - failed.length - skipped.length;
out(`\n===== QC SVC R0.5 · ศูนย์เชื่อมต่อ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length}${skipped.length > blockingSkip.length ? ` · ยอมได้ ${skipped.length - blockingSkip.length}: ต้องมี QC server` : ""})` : ""}`);
out(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), allowedSkip: skipped.filter((c) => c.allowSkip).map((c) => c.id), findings: [...failed, ...blockingSkip].map((c) => c.id) })}`);
// รับใบ = ไม่มี FAIL และไม่มี SKIP นอกจาก P-4 (ไม่มี QC server — ผู้คุมรันเองตอนรับงาน)
process.exit(failed.length + blockingSkip.length > 0 ? 1 : 0);
