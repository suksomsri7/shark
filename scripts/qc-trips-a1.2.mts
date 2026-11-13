// QC — TRIPS A1.2a รอบ 2 (หลังผลตรวจความปลอดภัยของแบบ · มติผู้คุม R1–R5) · ทะเบียนเอเจนซี่ · สมัครเอง→ร้านอนุมัติ · เชิญ · ผู้ใช้/บทบาท · ล็อกอินอีเมล + session · Party/CRM · ใบอนุญาต (บริการเท่านั้น · ไม่มีจอ)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/A1.2.md (ใบสั่ง) · ledger/TRIPS-CORE-CONTRACT.md TC3 §A §B.2 §J.1 §J.3 §J.3.1 · ใบสั่ง A1.1 §2.1 §5 · wo-notes A1.1
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนสร้าง · positive control ของตัวสแกนเครื่องหมาย/สูตรแฮช/rate limit) · K core บริสุทธิ์ · S โครง/ขอบเขต/F17 static/สิทธิ์/event
//   A ล็อกอินอีเมล + session + token · AP สมัคร · SH ฝั่งร้าน (ผังสถานะ · สิทธิ์ · DTO) · IN เชิญ · M ผู้ใช้/บทบาท/ลบตาม PDPA
//   P ความเป็นส่วนตัวสองร้าน (เครื่องหมายฝังที่ร้าน B · สแกน DTO/รายการ/audit/outbox/ops/ผล error ของร้าน A) · PY Party/CRM
//   C พร้อมกัน · CAP เพดานใบสมัคร/คำเชิญ · H งานบ้าน (ag_ · ออกทุกเครื่อง · 20 session · งานกวาด) · I ค่าคงที่ · G regression (fitness · qc-trips-a1.1 --no-regression)
//   RU (ORACLE-ADD r3) มติผู้คุม §10 ข้อ 1–19 + §11 ข้อ 1–3 + หัวข้อที่ผู้ตรวจโค้ดขอเพิ่ม (CODE-REVIEW T-1…T-19) — ร้าน/ตัวตนของตัวเอง · ลำดับกำหนดได้ (ไม่พึ่งการแข่งเวลา)
//
// 🔴 ร้านชั่วคราว slug `trips-a12-*` (A: หน่วย TRIPS 2 · B: TRIPS + A36=false · C: หน่วย SHOP เท่านั้น · D: TRIPS ใช้ทดสอบพร้อมกัน)
//    ตัวตน/ผู้ใช้ติดป้าย "QCA12" · อีเมล `qca12-*@example.test` · ลบใน finally + กวาดค้างตอนเริ่ม · แถวสมุดลบด้วย `SET LOCAL shark.ledger_purge = 'on'`
//    ส่ง deps.sendAgentMail เก็บรหัส/ลิงก์ (ไม่มีอีเมลจริง) · ตั้ง SESSION_SECRET / INTEGRATIONS_CREDENTIALS_KEY เฉพาะโพรเซสถ้าไม่มี (≥ 32)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-a1.2.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้ามรันพร้อมข้อสอบ TRIPS อื่นบนฐานเดียวกัน · `--no-regression` = G เป็น SKIP — รับใบต้องไม่มี SKIP)
// ผลที่ถูกต้องก่อนมี A1.2a: PC เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

const LABEL = "qc-trips-a1.2";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NO_REG = process.argv.includes("--no-regression");
const BASE_SHA = "b11dbd849"; // ปลาย wip/trips-a1.2 ตอนเขียนข้อสอบรอบ 2 (= session/trips @f8160194b + ใบสั่ง/ข้อสอบรอบ 1 + เส้น import ที่ผู้คุมเพิ่ม)
const AGENCY_MIG = "20270201000200_agency";
const ORACLE_FILE = "scripts/qc-trips-a1.2.mts";

loadTripsQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) process.env.SESSION_SECRET = `qc-a12-session-${"s".repeat(40)}`;
if (!process.env.INTEGRATIONS_CREDENTIALS_KEY || process.env.INTEGRATIONS_CREDENTIALS_KEY.trim().length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = `qc-a12-${"k".repeat(40)}`;
process.env.RESEND_API_KEY = ""; // ORACLE-ADD r3: ข้อสอบไม่เคยส่งอีเมลจริง — RU-7 สอบทาง "ไม่มีผู้ให้บริการส่งเมล" (มติ §10 ข้อ 4) · ต้องตั้งก่อน import `@/lib/env`
const RUN_START = new Date();

// ═══════════════ harness ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
type Rec = Record<string, unknown>;
type F = (...a: unknown[]) => Promise<unknown>;
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 220); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string) => {
  cks.push({ id, res, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); record(id, name, "PASS", ""); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`); }
};
const skip = (id: string, name: string, why: string) => record(id, name, "SKIP", why);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const R = (v: unknown): Rec => asRec(v) ?? {};
const fnOf = (mod: Rec | null, name: string, where: string): F => {
  const f = mod?.[name];
  if (typeof f !== "function") throw new AssertFail(`${where} ยังไม่มี ${name}`);
  return f as F;
};
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
const gitOk = (args: string[]) => spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).status === 0;
const hasRef = (ref: string) => gitOk(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
const changedSinceBase = (paths: string[]): string[] => {
  const a = git(["diff", "--name-only", BASE_SHA, "--", ...paths]).split("\n").filter(Boolean);
  const b = git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n").filter(Boolean);
  return [...new Set([...a, ...b])];
};
const sameAsSession = (f: string) => hasRef("session/trips") && gitOk(["diff", "--quiet", "session/trips", "--", f]) && !git(["ls-files", "--others", "--exclude-standard", "--", f]).trim();
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const hex = (n: number) => randomBytes(n).toString("hex");
const rid = (p: string) => `a12qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SLUG = "trips-a12-";
const EMAIL_PREFIX = "trips-a12-";
const QC_MARK = "QCA12";
const mail = (tag: string) => `qca12-${tag}-${STAMP}@example.test`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const thaiTaxId = (prefix12: string): string => {
  const d = prefix12.split("").map(Number);
  const s = d.reduce((a, x, i) => a + x * (13 - i), 0);
  return `${prefix12}${(11 - (s % 11)) % 10}`;
};
const digits = (n: number) => [...randomBytes(n)].map((b) => String(b % 10)).join("");
/** สูตรแฮชตามใบสั่ง §4 (คำนวณเองโดยไม่พึ่งโค้ดของผู้สร้าง) */
const authKey = (label: string) => createHmac("sha256", String(process.env.SESSION_SECRET)).update(`shark:agent-auth:v1:${label}`).digest();
const authHash = (label: string, data: string) => `v1:${createHmac("sha256", authKey(label)).update(data).digest("hex")}`;
const keysDeep = (v: unknown, out: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(v)) { for (const x of v) keysDeep(x, out); return out; }
  const r = asRec(v);
  if (r) for (const [k, x] of Object.entries(r)) { out.add(k); keysDeep(x, out); }
  return out;
};
const leaks = (s: string, needles: string[]) => needles.filter((n) => n && n.length >= 6 && s.includes(n));
const sortedKeys = (v: unknown) => Object.keys(R(v)).sort();

// ═══════════════ ฐาน ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
async function cols(table: string): Promise<ColRow[]> {
  const c = colCache.get(table);
  if (c) return c;
  const r = await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]);
  if (r.length) colCache.set(table, r);
  return r;
}
async function ins(table: string, vals: Rec, client: pg.Pool | pg.PoolClient = pool): Promise<void> {
  const cs = await cols(table);
  if (!cs.length) throw new AssertFail(`ไม่มีตาราง ${table}`);
  const v: Rec = { ...vals };
  for (const c of cs) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    v[c.column_name] = t === "text" || t.startsWith("character") ? `qc${hex(3)}` : ["integer", "bigint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await client.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => { const x = v[k]; return x !== null && typeof x === "object" && !(x instanceof Date) && !Array.isArray(x) ? JSON.stringify(x) : x; }));
}
async function inTx<T>(f: (c: pg.PoolClient) => Promise<T>, commit = false): Promise<T> {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const r = await f(c); await c.query(commit ? "COMMIT" : "ROLLBACK"); return r; }
  catch (e) { try { await c.query("ROLLBACK"); } catch { /* ignore */ } throw e; } finally { c.release(); }
}

// ═══════════════ ร้านชั่วคราว + กวาด ═══════════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  try { await inTx(async (c) => { await c.query(`SET LOCAL shark.ledger_purge = 'on'`); await c.query(`DELETE FROM "AgentLedgerEntry" WHERE "tenantId" = ANY($1::text[])`, [tids]); }, true); } catch (e) { console.log(`  ⚠️ ลบสมุดทดสอบ: ${errMsg(e)}`); }
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
const createdUserIds: string[] = [];
const createdIdentityIds: string[] = [];
const createdCodeIds: string[] = [];
const usedEmails: string[] = [];
/** ORACLE-ADD r3 (มติ §10 ข้อ 2): token เชิญเพื่อนที่ถูกใช้ในรัน ⇒ แถว "jti ใช้แล้ว" (`tmj_*` · target = แฮช tm-jti) ในตารางรหัส — เก็บไว้ลบตอนจบ */
const usedJtiTargets = new Set<string>();
const teammateJti = (tok: unknown): string | null => {
  if (typeof tok !== "string" || !tok.includes(".")) return null;
  try { const n = (JSON.parse(Buffer.from(tok.split(".")[0], "base64url").toString("utf8")) as Rec).n; return typeof n === "string" ? n : null; } catch { return null; }
};
const noteTeammateToken = (tok: unknown): void => { const n = teammateJti(tok); if (n) { try { usedJtiTargets.add(authHash("tm-jti", n)); } catch { /* ไม่มีกุญแจ */ } } };
async function cleanupGlobal() {
  try {
    const us = (await q<{ id: string }>(`SELECT u.id FROM "AgentUser" u LEFT JOIN "AgentIdentity" i ON i.id = u."identityId" WHERE u."displayName" LIKE $1 OR i."displayName" LIKE $1 OR u.id = ANY($2::text[]) OR u."identityId" = ANY($3::text[])`, [`${QC_MARK}%`, createdUserIds, createdIdentityIds])).map((r) => r.id);
    if (us.length) {
      await pool.query(`DELETE FROM "AgentLogin" WHERE "agentUserId" = ANY($1::text[])`, [us]);
      await pool.query(`DELETE FROM "AgentSession" WHERE "agentUserId" = ANY($1::text[])`, [us]);
      await pool.query(`DELETE FROM "AgentUser" WHERE id = ANY($1::text[])`, [us]);
    }
    await pool.query(`DELETE FROM "AgentLogin" WHERE subject LIKE 'qca12-%'`);
    const targets = usedEmails.map((e) => { try { return authHash("login-target", e); } catch { return ""; } }).filter(Boolean);
    await pool.query(`DELETE FROM "AgentLoginCode" WHERE id = ANY($1::text[]) OR target = ANY($2::text[])`, [createdCodeIds, targets]);
    // แถว jti ของ token เชิญเพื่อน: ตามแฮชที่จดไว้ + ทุกแถว tmj_ ที่เกิดในรันนี้ (ถือ gate lock ของฐานนี้อยู่ ⇒ มีแต่โพรเซสนี้ที่สร้าง)
    const jt = [...usedJtiTargets];
    await pool.query(`DELETE FROM "AgentLoginCode" WHERE target = ANY($1::text[]) OR id = ANY($2::text[]) OR (id LIKE 'tmj\\_%' AND "createdAt" >= $3)`, [jt, jt.map((t) => `tmj_${t.slice(3, 43)}`), RUN_START]);
    await pool.query(`DELETE FROM "AgentIdentity" WHERE "displayName" LIKE $1 OR id = ANY($2::text[])`, [`${QC_MARK}%`, createdIdentityIds]);
  } catch (e) { console.log(`  ⚠️ cleanup global: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])).map((r) => r.id);
    if (!us.length) return;
    for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* ignore */ } }
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers(); await cleanupGlobal();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  // ── โมดูล ──
  const AGM = await tryImport("@/lib/modules/agency");
  const AUM = await tryImport("@/lib/platform/agent-auth");
  const ASM = await tryImport("@/lib/modules/agency/agent-side");
  const COREM = await tryImport("@/lib/modules/agency/accounts-core");
  const SETM = await tryImport("@/lib/core/settings");
  const RLM = await tryImport("@/lib/core/rate-limit-db");
  const INVM = await tryImport("./trips-agency-invariants.mts");
  const need = (m: { mod: Rec | null; err: string }, what: string): Rec => { if (!m.mod) throw new AssertFail(`ยังไม่มี ${what} (${m.err.slice(0, 90)})`); return m.mod; };
  const AG = (n: string): F => fnOf(need(AGM, "@/lib/modules/agency"), n, "agency facade");
  const AU = (n: string): F => {
    const f = fnOf(need(AUM, "@/lib/platform/agent-auth"), n, "platform/agent-auth");
    if (n !== "verifyAgentLoginCode") return f;
    return async (...a: unknown[]) => { noteTeammateToken(R(a[0]).teammateInvite); return f(...a); }; // ORACLE-ADD r3: จด jti ไว้ลบ
  };
  const AS = (n: string): F => fnOf(need(ASM, "@/lib/modules/agency/agent-side"), n, "agency/agent-side");
  const CO = (n: string): unknown => { const m = need(COREM, "agency/accounts-core"); if (!(n in m)) throw new AssertFail(`accounts-core ยังไม่มี ${n}`); return m[n]; };
  const LIMITS = (): Rec => { const l = asRec(need(AUM, "@/lib/platform/agent-auth").AGENT_AUTH_LIMITS); if (!l) throw new AssertFail("ยังไม่มี AGENT_AUTH_LIMITS"); return l; };
  const lim = (k: string, f?: string): number => { const v = LIMITS()[k]; const n = f ? R(v)[f] : v; ok(typeof n === "number", `AGENT_AUTH_LIMITS.${k}${f ? `.${f}` : ""} ไม่ใช่ตัวเลข`); return n as number; };
  const AG_DIR = "src/lib/modules/agency";
  const OWNED_NEW = [`${AG_DIR}/accounts-core.ts`, `${AG_DIR}/accounts.ts`, `${AG_DIR}/tokens.ts`, `${AG_DIR}/agent-side.ts`, "src/lib/platform/agent-auth.ts"];
  const needBuilt = () => { const miss = OWNED_NEW.filter((f) => !existsSync(join(ROOT, f))); if (miss.length) throw new AssertFail(`ยังไม่มีไฟล์ ${miss.join(", ")}`); };

  // จดหมายที่บริการส่ง (ไม่มีอีเมลจริง)
  const mails: { to: string; kind: string; code?: string; token?: string; url?: string }[] = [];
  const deps = { sendAgentMail: async (m: unknown) => { const r = R(m); mails.push({ to: String(r.to ?? ""), kind: String(r.kind ?? ""), code: typeof r.code === "string" ? r.code : undefined, token: typeof r.token === "string" ? r.token : undefined, url: typeof r.url === "string" ? r.url : undefined }); } };
  /** ตัวจำกัดจำลอง: ปฏิเสธคีย์ที่ขึ้นต้นด้วย deny · หรือคืนผล "ล้ม" (ไม่มี count) เมื่อ broken */
  const stubRate = (o: { deny?: string; broken?: boolean }) => async (key: unknown) => {
    if (o.broken) return { ok: true };
    if (o.deny && String(key).startsWith(o.deny)) return { ok: false, retryAfterSec: 30, count: 999 };
    return { ok: true, count: 1 };
  };
  const lastMail = (to: string, kind: string) => [...mails].reverse().find((m) => m.to === to && m.kind === kind);
  const rip = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
  const OPEN_DEPS: Rec = { ...deps, rateLimit: async () => ({ ok: true, count: 1 }) };
  const meta = (now?: Date, ck?: string, ip?: string, d: Rec = deps): Rec => ({ clientKey: ck ?? `qc-${hex(6)}`, ip: ip ?? rip(), userAgent: "qca12-oracle", ...(now ? { now } : {}), deps: d });
  const allTokens: string[] = [];

  // ═══════════════ PC ═══════════════
  console.log("\n── PC: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  await st("PC-1", `ฐาน QC ต่อได้ + migration ${AGENCY_MIG} ลงแล้ว + ตาราง global 5 ตัวมี`, async () => {
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, [AGENCY_MIG]);
    eq(r[0]?.n, 1, "migration agency");
    for (const t of ["AgentIdentity", "AgentUser", "AgentLogin", "AgentSession", "AgentLoginCode", "AgentAccount", "AgentAccountMember"]) ok((await cols(t)).length > 0, `ไม่มีตาราง ${t}`);
  });
  await st("PC-2", "ฟังก์ชัน A1.1 บน facade ทำงาน: createAgentIdentity → findAgentIdentityByCode (positive control ของตัวตน)", async () => {
    const r = R(await AG("createAgentIdentity")({ displayName: `${QC_MARK} pc ${STAMP}`, owner: { displayName: `${QC_MARK} pc owner`, login: { kind: "EMAIL", providerId: "email", subject: mail("pc") } } }));
    ok(r.ok === true, `createAgentIdentity: ${fmt(r)}`);
    createdIdentityIds.push(String(R(r.identity).id)); createdUserIds.push(String(r.agentUserId)); usedEmails.push(mail("pc"));
    const f = R(await AG("findAgentIdentityByCode")(String(R(r.identity).publicCode)));
    eq(f.id, R(r.identity).id, "หาด้วยรหัสสาธารณะ");
  });

  // ── ร้านชั่วคราว ──
  const now = () => new Date();
  const tA = rid("tA"), tB = rid("tB"), tC = rid("tC"), tD = rid("tD");
  const slugA = `${SLUG}${STAMP}-a`, slugB = `${SLUG}${STAMP}-b`, slugC = `${SLUG}${STAMP}-c`, slugD = `${SLUG}${STAMP}-d`, slugNone = `${SLUG}${STAMP}-none`;
  const uA = rid("uA"), uA2 = rid("uA2"), uB = rid("uB"), uC = rid("uC"), uD = rid("uD");
  type Staff = { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Rec };
  const staff: Record<string, Staff> = {};
  let setupErr = "";
  try {
    for (const [id, slug, tag] of [[tA, slugA, "a"], [tB, slugB, "b"], [tC, slugC, "c"], [tD, slugD, "d"]] as const) { await ins("Tenant", { id, name: `${QC_MARK} ร้าน ${tag}`, slug }); tenantIds.push(id); }
    for (const [id, t, type, tag] of [[uA, tA, "TRIPS", "a"], [uA2, tA, "TRIPS", "a2"], [uB, tB, "TRIPS", "b"], [uC, tC, "SHOP", "c"], [uD, tD, "TRIPS", "d"]] as const) await ins("BusinessUnit", { id, tenantId: t, type, name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}` });
    const mk = async (tag: string, tenantId: string, role: Staff["role"], unitAccess: string[], permissions: Rec): Promise<Staff> => {
      const id = rid(`u${tag}`);
      await ins("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}` });
      await ins("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: now() });
      return { userId: id, role, unitAccess, permissions };
    };
    staff.OA = await mk("oa", tA, "OWNER", ["*"], {});
    staff.OB = await mk("ob", tB, "OWNER", ["*"], {});
    staff.OD = await mk("od", tD, "OWNER", ["*"], {});
    staff.OD2 = await mk("od2", tD, "OWNER", ["*"], {});
    staff.MGR = await mk("mgr", tA, "MANAGER", [uA], {});
    staff.VIEW = await mk("view", tA, "STAFF", ["*"], { "agency.account.view": true });
    staff.NONE = await mk("none", tA, "STAFF", ["*"], {});
    staff.EDIT = await mk("edit", tA, "STAFF", ["*"], { "agency.account.view": true, "agency.account.edit": true });
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const ctxOf = (tenantId: string, s: Staff) => ({ tenantId, actorUserId: s.userId });
  const cA = () => ctxOf(tA, staff.OA), cB = () => ctxOf(tB, staff.OB), cD = () => ctxOf(tD, staff.OD);
  const seenByA: string[] = []; // ผลทุกตัวที่ร้าน A ได้รับ (สแกนเครื่องหมายของร้าน B)
  const withExpected = async (fn: string, input: Rec): Promise<Rec> => {
    if ((fn !== "approveAgentAccount" && fn !== "rejectAgentAccount") || "expectedUpdatedAt" in input) return input;
    const u = (await q<{ u: string }>(`SELECT to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS u FROM "AgentAccount" WHERE id = $1`, [String(input.agentAccountId)]))[0]?.u;
    return { ...input, expectedUpdatedAt: u ?? "1970-01-01T00:00:00.000Z" };
  };
  const shop = async (fn: string, ctx: { tenantId: string; actorUserId: string }, input0: Rec, opts: Rec = {}): Promise<Rec> => {
    const input = await withExpected(fn, input0);
    const r = R(await AG(fn)(ctx, input, { deps, ...opts }));
    if (ctx.tenantId === tA) seenByA.push(JSON.stringify(r));
    return r;
  };

  await st("PC-3", "ร้านชั่วคราว 4 ร้าน + ผู้ใช้ 8 คน · ตั้ง A36 requireApproval = false ที่หน่วยเดียวของร้าน B (ชั้น UNIT) ผ่าน setSettings · resolve: A=true B=false", async () => {
    ok(!setupErr, `ตั้งร้าน: ${setupErr}`);
    const S = (n: string) => fnOf(need(SETM, "@/lib/core/settings"), n, "settings");
    const w = R(await S("setSettings")({ ...staff.OB }, { tenantId: tB }, [{ key: "agency.signup.requireApproval", scope: "UNIT", scopeId: uB, value: false }], {}));
    ok(w.ok === true, `setSettings: ${fmt(w)}`);
    const a = R(await S("resolveSetting")({ tenantId: tA }, "agency.signup.requireApproval", { unitId: uA }));
    const b = R(await S("resolveSetting")({ tenantId: tB }, "agency.signup.requireApproval", { unitId: uB }));
    eq([a.value, b.value], [true, false], "A36");
  });
  const legalB = `${QC_MARK} MARK-B legal ${STAMP}`, contactNameB = `${QC_MARK} MARK-B contact ${STAMP}`, contactEmailB = mail("markb-contact"), licenceB = `MARKB${STAMP.toUpperCase()}`;
  await st("PC-4", "positive control ตัวสแกน: แถว AuditLog ของร้าน A ที่ฝังเครื่องหมายร้าน B ⇒ ตัวสแกนเจอ (แล้วลบ)", async () => {
    ok(!setupErr, "ไม่มีร้าน");
    const id = rid("pcaudit");
    await ins("AuditLog", { id, tenantId: tA, actorType: "SYSTEM", action: "qc.a12.pc", after: { x: legalB } });
    const rows = await q<{ j: string }>(`SELECT row_to_json(a)::text AS j FROM "AuditLog" a WHERE "tenantId" = $1`, [tA]);
    ok(leaks(rows.map((r) => r.j).join("\n"), [legalB]).length === 1, "ตัวสแกนไม่เจอเครื่องหมายที่ฝัง");
    await pool.query(`DELETE FROM "AuditLog" WHERE id = $1`, [id]);
  });
  await st("PC-5", "สูตรแฮชของข้อสอบ: label ต่างกัน ⇒ ค่าต่างกัน · รูป v1:<64hex> · SESSION_SECRET ≥ 32", () => {
    ok(String(process.env.SESSION_SECRET).length >= 32, "SESSION_SECRET");
    const a = authHash("session", "x"), b = authHash("invite", "x");
    ok(/^v1:[0-9a-f]{64}$/.test(a) && a !== b && a === authHash("session", "x"), "สูตร");
  });
  await st("PC-6", "checkRateLimitDb ทำงาน (positive control: เพดาน 2 ⇒ ครั้งที่ 3 ไม่ผ่าน)", async () => {
    const f = fnOf(need(RLM, "rate-limit-db"), "checkRateLimitDb", "rate-limit-db");
    const k = `qca12:pc:${STAMP}`;
    const r = [R(await f(k, { limit: 2, windowMs: 60_000 })), R(await f(k, { limit: 2, windowMs: 60_000 })), R(await f(k, { limit: 2, windowMs: 60_000 }))];
    eq(r.map((x) => x.ok), [true, true, false], "ผล");
  });

  // ═══════════════ K. core บริสุทธิ์ ═══════════════
  console.log("\n── K: accounts-core (บริสุทธิ์) ──");
  const STATUSES = ["INVITED", "PENDING", "ACTIVE", "SUSPENDED", "CLOSED"];
  const ACTIONS = ["INVITE", "APPLY", "AUTO_APPROVE", "ACCEPT_INVITE", "ACCEPT_INVITE_UNVERIFIED", "REVOKE_INVITE", "APPROVE", "REJECT", "WITHDRAW", "SUSPEND", "REINSTATE", "CLOSE", "REAPPLY", "REAPPLY_AUTO", "IDENTITY_CLOSED"];
  const ERROR_CODES = ["VALIDATION", "NOT_FOUND", "FORBIDDEN", "BAD_STATE", "STALE", "RATE_LIMITED", "BUSY", "INVALID_CODE", "LOGIN_UNAVAILABLE", "INVITE_INVALID", "ALREADY_LINKED", "ALREADY_REGISTERED", "LAST_OWNER", "CODE_TAKEN", "IDEMPOTENCY_CONFLICT", "CRM_NOT_AVAILABLE", "CRM_PARTY_MISMATCH"];
  const LIST_KEYS = ["id", "code", "legalName", "status", "closeReason", "payeeType", "publicCode", "licenceWarnings", "memberCount", "createdAt", "updatedAt"];
  const DTO_KEYS = ["id", "code", "kind", "status", "closeReason", "legalName", "payeeType", "country", "branchCode", "vatRegistered", "treaty", "taxIdLast4", "bankLast4", "contact", "licence", "unitIds", "tierId", "partyId", "crm", "identity", "members", "invite", "approvedAt", "suspendedAt", "createdAt", "updatedAt", "warnings"];
  const NEVER = ["identityId", "agentUserId", "lastLoginAt", "providerId", "subject", "activeAgentAccountId", "taxIdHash", "taxIdEnc", "bankAccountEnc", "inviteTokenHash", "tokenHash", "codeHash", "target", "tenantIds", "otherAccounts"];
  await st("K-1", "ค่าคงที่: สถานะ 5 · การกระทำ 15 · รหัสผิดพลาด 17 · เหตุปิด 5 · STICKY = REJECTED+CLOSED_BY_SHOP · รุ่นถ้อยคำ agency-apply-v1 (ตรงตัว)", () => {
    eq(CO("STICKY_CLOSE_REASONS"), ["REJECTED", "CLOSED_BY_SHOP"], "STICKY");
    eq(CO("AGENT_ACCOUNT_STATUSES"), STATUSES, "สถานะ");
    eq(CO("AGENT_ACCOUNT_ACTIONS"), ACTIONS, "การกระทำ");
    eq(CO("AGENCY_ERROR_CODES"), ERROR_CODES, "รหัส");
    eq(CO("AGENT_CLOSE_REASONS"), ["REJECTED", "WITHDRAWN", "INVITE_REVOKED", "CLOSED_BY_SHOP", "IDENTITY_CLOSED"], "เหตุปิด");
    eq(CO("AGENCY_APPLY_PRIVACY_NOTICE_VERSION"), "agency-apply-v1", "รุ่นถ้อยคำ");
  });
  await st("K-2", "ผังสถานะ agentAccountTransition: 20 คู่ที่อนุญาต (รวม INVITED+ACCEPT_INVITE_UNVERIFIED⇒PENDING · PENDING+SUSPEND) ตรงตาราง §3.1 · อีก 70 คู่ = null", () => {
    const tr = CO("agentAccountTransition");
    ok(typeof tr === "function", "ไม่มีฟังก์ชัน");
    const allowed: [string | null, string, string, string | null, string][] = [
      [null, "INVITE", "INVITED", null, "SHOP"], [null, "APPLY", "PENDING", null, "AGENT"], [null, "AUTO_APPROVE", "ACTIVE", null, "AGENT"],
      ["INVITED", "ACCEPT_INVITE", "ACTIVE", null, "AGENT"], ["INVITED", "ACCEPT_INVITE_UNVERIFIED", "PENDING", null, "AGENT"], ["INVITED", "REVOKE_INVITE", "CLOSED", "INVITE_REVOKED", "SHOP"],
      ["PENDING", "SUSPEND", "SUSPENDED", null, "SHOP"],
      ["PENDING", "APPROVE", "ACTIVE", null, "SHOP"], ["PENDING", "REJECT", "CLOSED", "REJECTED", "SHOP"], ["PENDING", "WITHDRAW", "CLOSED", "WITHDRAWN", "AGENT"],
      ["ACTIVE", "SUSPEND", "SUSPENDED", null, "SHOP"], ["SUSPENDED", "REINSTATE", "ACTIVE", null, "SHOP"],
      ["ACTIVE", "CLOSE", "CLOSED", "CLOSED_BY_SHOP", "SHOP"], ["SUSPENDED", "CLOSE", "CLOSED", "CLOSED_BY_SHOP", "SHOP"],
      ["CLOSED", "REAPPLY", "PENDING", null, "AGENT"], ["CLOSED", "REAPPLY_AUTO", "ACTIVE", null, "AGENT"],
      ["INVITED", "IDENTITY_CLOSED", "CLOSED", "IDENTITY_CLOSED", "SYSTEM"], ["PENDING", "IDENTITY_CLOSED", "CLOSED", "IDENTITY_CLOSED", "SYSTEM"],
      ["ACTIVE", "IDENTITY_CLOSED", "CLOSED", "IDENTITY_CLOSED", "SYSTEM"], ["SUSPENDED", "IDENTITY_CLOSED", "CLOSED", "IDENTITY_CLOSED", "SYSTEM"],
    ];
    const key = (f: string | null, a: string) => `${f ?? "-"}|${a}`;
    const exp = new Map(allowed.map((x) => [key(x[0], x[1]), { to: x[2], reason: x[3], actor: x[4] }]));
    const bad: string[] = [];
    for (const f of [null, ...STATUSES]) for (const a of ACTIONS) {
      const got = (tr as (f: unknown, a: unknown) => unknown)(f, a);
      const e = exp.get(key(f, a)) ?? null;
      if (!isDeepStrictEqual(got === null ? null : { to: R(got).to, reason: R(got).reason ?? null, actor: R(got).actor }, e)) bad.push(`${key(f, a)}→${fmt(got)}`);
    }
    ok(bad.length === 0, `ผิด ${bad.length}: ${bad.slice(0, 4).join(" · ")}`);
  });
  await st("K-3", "cleanAgencyText: ตัด ZWSP/BOM · NFC · trim · ปฏิเสธ ตัวกลับทิศ/C0/TAB/U+2028/surrogate เดี่ยว/เกินยาว/ว่าง/ไม่ใช่สตริง", () => {
    const c = CO("cleanAgencyText") as (r: unknown, m: number) => unknown;
    ok(typeof c === "function", "ไม่มีฟังก์ชัน");
    eq([c(" a​b﻿ ", 10), c("é", 5)], ["ab", "é"], "ทำความสะอาด");
    eq(["‮abc", "a\u0001", "a\tb", "a b", "a\ud800", "x".repeat(11), "   ", 5, "⁦x"].map((x) => c(x, 10)), [null, null, null, null, null, null, null, null, null], "ปฏิเสธ");
  });
  await st("K-4", "licenceWarnings: หมดอายุ ⇒ LICENCE_EXPIRED · เกิน 2 ปี ⇒ LICENCE_EXPIRY_TOO_FAR · ปกติ/ว่าง/วันนี้ ⇒ [] (WARN เท่านั้น)", () => {
    const w = CO("licenceWarnings") as (l: unknown, t: string) => unknown;
    const today = "2026-11-13";
    eq([w({ no: "11/1", expiry: "2026-01-01" }, today), w({ no: "11/1", expiry: "2029-12-01" }, today), w({ no: "11/1", expiry: "2027-06-01" }, today), w({ no: null, expiry: null }, today), w({ no: "x", expiry: today }, today)],
      [["LICENCE_EXPIRED"], ["LICENCE_EXPIRY_TOO_FAR"], [], [], []], "คำเตือน");
  });
  await st("K-5", "คีย์ DTO รายละเอียด/รายการตรงตัว · NEVER_SHOW_TO_SHOP_KEYS = 15 คีย์ของใบสั่ง (ตรงตัว · ลำดับเดิม) + คีย์แท็กผู้สมัครของมติ §11 ข้อ 3 (ขึ้นต้น applicant) เท่านั้น · ไม่ซ้อนกับคีย์ DTO", () => {
    eq(CO("SHOP_AGENT_ACCOUNT_KEYS"), DTO_KEYS, "DTO");
    eq(CO("SHOP_AGENT_LIST_KEYS"), LIST_KEYS, "รายการ");
    // ORACLE-ADD r3 (ต้องให้ผู้คุมรับเป็น ORACLE-EDIT): มติ §11 ข้อ 3 สั่งให้แท็กผู้สมัคร "อยู่ใน NEVER_SHOW_TO_SHOP_KEYS" ⇒ รายการยาวกว่า 15 ได้ เฉพาะคีย์ applicant*
    const never = [...(CO("NEVER_SHOW_TO_SHOP_KEYS") as string[])];
    eq(never.slice(0, NEVER.length), NEVER, "ห้ามแสดง (15 คีย์ของใบสั่ง)");
    const extra = never.slice(NEVER.length);
    ok(extra.every((k) => /^applicant[A-Z][A-Za-z]*$/.test(k)) && new Set(never).size === never.length, `คีย์เพิ่มนอกมติ: ${fmt(extra)}`);
    ok(DTO_KEYS.concat(LIST_KEYS).every((k) => !never.includes(k)), "ซ้อนกัน");
  });
  await st("K-6", "maskEmail ไม่มีส่วน local/โดเมนเต็ม", () => {
    const m = String((CO("maskEmail") as (e: string) => unknown)("someone@example.com"));
    ok(m.includes("@") && !m.includes("someone") && !m.includes("example") && m.length >= 5, `ได้ ${m}`);
  });
  await st("K-7", "accounts-core.ts บริสุทธิ์: import ได้เฉพาะ zod + import type · ไม่มี process.env/Date.now/new Date() ไม่มีอาร์กิวเมนต์", () => {
    needBuilt();
    const s = stripComments(read(`${AG_DIR}/accounts-core.ts`));
    const imports = [...s.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1] && m[2] !== "zod").map((m) => m[2]);
    eq(imports, [], "import ค่า");
    ok(!/process\.env|Date\.now\(|new Date\(\s*\)/.test(s), "อ่านนาฬิกา/env");
  });
  const EXPECTED_LIMITS = {
    codeTtlMin: 10, codeMaxAttempts: 5, codePerTarget: { limit: 3, windowMin: 15 }, codePerTargetDay: { limit: 10, windowMin: 1440 },
    codePerClient: { limit: 30, windowMin: 15 }, codePerIp: { limit: 60, windowMin: 60 }, verifyPerClient: { limit: 60, windowMin: 15 }, verifyPerCode: { limit: 10, windowMin: 15 },
    sessionTtlDays: 30, sessionIdleHours: 72, maxSessionsPerUser: 20, shopInviteTtlDays: 14, teammateInviteTtlMin: 2880,
    applyPerClient: { limit: 20, windowMin: 60 }, applyPerIdentity: { limit: 10, windowMin: 1440 }, applyPerShop: { limit: 30, windowMin: 60 },
    openPendingPerShop: 200, openCodeInvitesPerIdentity: 20, inviteAcceptPerClient: { limit: 20, windowMin: 15 }, lookupByCodePerActor: { limit: 30, windowMin: 60 },
    reapplyCooldownDays: 7, sweepBatch: 5000,
    teammateInvitePerInviter: { limit: 5, windowMin: 60 }, teammateInvitePerIdentity: { limit: 20, windowMin: 1440 },
    shopInviteMailPerTarget: { limit: 3, windowMin: 1440 }, shopInviteMailPerShop: { limit: 50, windowMin: 1440 },
  };
  await st("K-8", "AGENT_AUTH_LIMITS = ตาราง §5.0 ตรงตัว (มติ R2) · งบเดาต่ออีเมลต่อวัน codePerTargetDay × codeMaxAttempts ≤ 50", () => {
    needBuilt();
    eq(LIMITS(), EXPECTED_LIMITS, "AGENT_AUTH_LIMITS");
    ok(lim("codePerTargetDay", "limit") * lim("codeMaxAttempts") <= 50, "งบเดาต่อวัน");
  });
  await st("K-9", "agentLoginCodeMail(code): มีรหัส · ไม่มีลิงก์ (http/://) · ไม่รับที่อยู่ (1 อาร์กิวเมนต์) · ผลเหมือนกันทุกครั้ง · AGENT_CLIENT_KEY_RE / AGENT_SESSION_TOKEN_RE ตามใบสั่ง", () => {
    const f = CO("agentLoginCodeMail") as ((c: string) => unknown) & { length: number };
    ok(typeof f === "function" && f.length === 1, "ลายเซ็น");
    const a = R(f("482913")), b = R(f("482913"));
    const all = `${String(a.subject)}\n${String(a.text)}\n${String(a.html)}`;
    ok(isDeepStrictEqual(a, b) && all.includes("482913") && !/https?:|:\/\//i.test(all), `จดหมาย ${fmt(a)}`);
    eq(String(CO("AGENT_CLIENT_KEY_RE")), String(/^[A-Za-z0-9_:.-]{8,128}$/), "clientKey");
    eq(String(CO("AGENT_SESSION_TOKEN_RE")), String(/^ag_[A-Za-z0-9_-]{43}$/), "token");
  });

  // ═══════════════ S. โครง / ขอบเขต ═══════════════
  console.log("\n── S: โครง · ขอบเขต · F17 · สิทธิ์ · event ──");
  const F17_DELEGATE_RE = /(\.|\[\s*["'`])(agentIdentity|agentUser|agentLogin|agentLoginCode|agentSession)\b|\{[^}]*\b(agentIdentity|agentUser|agentLogin|agentLoginCode|agentSession)\b[^}]*\}\s*=\s*\w+/;
  const F17_NAME_RE = /\b(FROM|JOIN|INTO|UPDATE|TABLE|from|join|into|update|table)\s+(\w+\.)?["'`]?(AgentIdentity|AgentUser|AgentLogin|AgentLoginCode|AgentSession)\b|ModelName(\.|\[\s*["'`])(AgentIdentity|AgentUser|AgentLogin|AgentLoginCode|AgentSession)\b/;
  await st("S-1", "ไฟล์ใหม่ 5 ไฟล์มี (accounts-core · accounts · tokens · agent-side · platform/agent-auth) + ชื่อส่งออกของ facade (ร้าน+core) · agent-auth · agent-side ครบ", () => {
    needBuilt();
    const names = ["listAgentAccounts", "getAgentAccount", "inviteAgent", "reissueAgentInvite", "revokeAgentInvite", "approveAgentAccount", "rejectAgentAccount", "suspendAgentAccount", "reinstateAgentAccount", "closeAgentAccount", "updateAgentAccountProfile", "lookupAgentIdentityByCode", "linkAgentCrmCompany", "unlinkAgentCrmCompany", "agentAccountTransition", "cleanAgencyText", "licenceWarnings", "agentLoginCodeMail"];
    const m = need(AGM, "agency facade");
    const miss = names.filter((n) => typeof m[n] !== "function");
    ok(miss.length === 0, `facade ขาด: ${miss.join(", ")}`);
    const au = ["requestAgentLoginCode", "verifyAgentLoginCode", "resolveAgentSession", "logoutAgentSession", "logoutAllAgentSessions", "selectAgentAccount", "agentScope", "myAgentAccounts", "agentApply", "agentAcceptInvite", "agentWithdraw", "createTeammateInvite", "agentTeam", "setTeammateRole", "disableTeammate", "eraseTeammate", "closeMyIdentity", "setAccountMember", "sweepAgentAuth", "agentCookieName", "agentCookieOptions"];
    const m2 = need(AUM, "agent-auth");
    const miss2 = au.filter((n) => typeof m2[n] !== "function");
    ok(miss2.length === 0, `agent-auth ขาด: ${miss2.join(", ")}`);
    const as = ["applyToShop", "acceptShopInvite", "withdrawApplication", "setAgentUserRole", "disableAgentUser", "eraseAgentUser", "closeAgentIdentity", "setAgentAccountMember", "listAgentTeam"];
    const m3 = need(ASM, "agent-side");
    const miss3 = as.filter((n) => typeof m3[n] !== "function");
    ok(miss3.length === 0, `agent-side ขาด: ${miss3.join(", ")}`);
    ok(!/export\s*\*/.test(stripComments(read(`${AG_DIR}/index.ts`))), "index.ts มี export *");
  });
  await st("S-2", "accounts.ts / tokens.ts / accounts-core.ts ไม่ import prisma ดิบ (F5 คง 52) · ไม่มี $queryRawUnsafe/$executeRawUnsafe", () => {
    needBuilt();
    for (const f of [`${AG_DIR}/accounts.ts`, `${AG_DIR}/tokens.ts`, `${AG_DIR}/accounts-core.ts`]) {
      const s = stripComments(read(f));
      ok(!/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(s), `${f} import prisma`);
      ok(!/\$(query|execute)RawUnsafe/.test(s), `${f} RawUnsafe`);
    }
  });
  await st("S-3", "F17 static: ไม่มีไฟล์ใดนอก agency/entry.ts + platform/agent-auth.ts อ้างโมเดล global (regex เดียวกับ fitness F17.1)", () => {
    needBuilt();
    const bad: string[] = [];
    const files = git(["ls-files", "src"]).split("\n").concat(git(["ls-files", "--others", "--exclude-standard", "src"]).split("\n")).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const f of new Set(files)) {
      if (f === `${AG_DIR}/entry.ts` || f === "src/lib/platform/agent-auth.ts") continue;
      const s = stripComments(read(f));
      if (F17_DELEGATE_RE.test(s) || F17_NAME_RE.test(s)) bad.push(f);
    }
    eq(bad, [], "ไฟล์ที่อ้าง");
  });
  await st("S-4", "permissions.ts: 6 คีย์ agency.account.{view,invite,approve,suspend,edit,money} ป้ายไทย ในบล็อก module agency", () => {
    needBuilt();
    const s = read("src/lib/core/permissions.ts");
    const blk = s.slice(s.indexOf('module: "agency"'));
    const miss = ["view", "invite", "approve", "suspend", "edit", "money"].filter((k) => !new RegExp(`"agency\\.account\\.${k}"\\s*:\\s*"[^"]*[ก-๙][^"]*"`).test(blk));
    ok(s.includes('module: "agency"') && miss.length === 0, `ขาด: ${miss.join(", ")}`);
  });
  await st("S-5", "event 3 ตัว (applied · approved · suspended) อยู่ใน outbox-consumers.ts + automation/labels.ts (ป้ายไทย) · webhooks spread AUTOMATION_EVENTS", () => {
    needBuilt();
    const oc = read("src/lib/outbox-consumers.ts"), al = read("src/lib/automation/labels.ts"), wl = read("src/lib/webhooks/labels.ts");
    const ev = ["agency.account.applied", "agency.account.approved", "agency.account.suspended"];
    const miss = ev.filter((e) => !oc.includes(`"${e}"`) || !new RegExp(`value:\\s*"${e.replace(/\./g, "\\.")}",\\s*label:\\s*"[^"]*[ก-๙]`).test(al));
    ok(miss.length === 0 && /\.\.\.AUTOMATION_EVENTS/.test(wl), `ขาด: ${miss.join(", ")}`);
  });
  const OWNED = new Set([...OWNED_NEW, `${AG_DIR}/entry.ts`, `${AG_DIR}/index.ts`, "src/lib/core/permissions.ts", "src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/platform/minute-jobs.ts"]);
  await st("S-6", `ขอบเขต (เทียบ ${BASE_SHA} · ไม่นับ ledger/ · ไฟล์ข้อสอบนี้ · ไฟล์ที่ตรง session/trips): แตะได้เฉพาะไฟล์ใบสั่ง §2`, () => {
    needBuilt();
    const ch = changedSinceBase(["."]).filter((f) => !f.startsWith("ledger/") && f !== ORACLE_FILE && !/^scripts\/(probe-trips-a1\.2-hunt-)/.test(f) && !sameAsSession(f));
    const extra = ch.filter((f) => !OWNED.has(f));
    eq(extra, [], "ไฟล์นอกขอบเขต");
  });
  await st("S-7", "ไม่แตะไฟล์ต้องห้าม: trips/ticket/pos/hotel/rooms/dorm/booking/queue/account/party/crm/member · core/settings · core/{db,scope,signed-link,rate-limit-db,email,audit,outbox} · prisma/ · app · components · scripts", () => {
    needBuilt();
    const forb = ["trips", "ticket", "pos", "hotel", "rooms", "dorm", "booking", "queue", "account", "party", "crm", "member"].map((m) => `src/lib/modules/${m}`)
      .concat(["src/lib/core/settings", "src/lib/core/db.ts", "src/lib/core/scope.ts", "src/lib/core/signed-link.ts", "src/lib/core/rate-limit-db.ts", "src/lib/core/email.ts", "src/lib/core/audit.ts", "src/lib/core/outbox.ts", "src/lib/core/session.ts", "src/lib/core/origin.ts", "prisma", "src/app", "src/components", "scripts"]);
    const t = changedSinceBase(forb).filter((f) => f !== ORACLE_FILE && !/^scripts\/(probe-trips-a1\.2-hunt-)/.test(f) && !sameAsSession(f));
    eq(t, [], "ไฟล์ต้องห้ามที่เปลี่ยน");
  });
  await st("S-8", "ผู้กระทำ AGENT ยังปิดในเส้นทางขาย/จอง: trips/state.ts คง AGENCY_NOT_ENABLED และไม่มีไฟล์ trips เปลี่ยน", () => {
    needBuilt();
    ok(/actorKind === "AGENT"[^\n]*AGENCY_NOT_ENABLED/.test(read("src/lib/modules/trips/state.ts")), "state.ts ไม่มีด่าน AGENT");
    eq(changedSinceBase(["src/lib/modules/trips"]).filter((f) => !sameAsSession(f)), [], "ไฟล์ trips");
  });
  await st("S-9", "party/crm เรียกผ่าน facade แบบ lazy (`await import(\"@/lib/modules/party\"|crm)`) · ไม่มี import ค่าแบบบนสุด · ไม่มี path ลึก", () => {
    needBuilt();
    const s = stripComments(read(`${AG_DIR}/accounts.ts`));
    ok(!/@\/lib\/modules\/(party|crm|member)\//.test(s), "path ลึก");
    ok(!/^\s*import\s+(?!type\b)[^;]*from\s+["']@\/lib\/modules\/(party|crm)["']/m.test(s), "import ค่าบนสุด");
    ok(/await import\(\s*["']@\/lib\/modules\/party["']\s*\)/.test(s) && /await import\(\s*["']@\/lib\/modules\/crm["']\s*\)/.test(s), "ไม่มี lazy import party/crm");
  });
  await st("S-10", "audit/outbox อยู่ใน tx: accounts.ts ไม่มี writeAudit( / emitOutboxOutsideTx( · tokens.ts/agent-auth.ts ไม่มีกุญแจสำรอง (ไม่มี sha256 ของ token ตรง ๆ ที่ใช้แทน HMAC)", () => {
    needBuilt();
    const s = stripComments(read(`${AG_DIR}/accounts.ts`));
    ok(!/\bwriteAudit\(|\bemitOutboxOutsideTx\(/.test(s), "เขียน audit/outbox นอก tx");
    const t = stripComments(read(`${AG_DIR}/tokens.ts`));
    ok(/SESSION_SECRET/.test(t) && /createHmac/.test(t), "tokens.ts ไม่มี HMAC จาก SESSION_SECRET");
  });
  await st("S-11", "คุกกี้ (มติ R1 ข้อ 4): agentCookieOptions() = { name (__Host-shark_agent เมื่อ secure · shark_agent ใน dev) · path / · httpOnly · secure ตาม APP_ENV · sameSite lax } · ไม่มี domain/path /agent ในซอร์ส", () => {
    needBuilt();
    const secure = process.env.APP_ENV !== "development";
    const name = secure ? "__Host-shark_agent" : "shark_agent";
    eq(R(AU("agentCookieOptions")() as unknown), { name, path: "/", httpOnly: true, secure, sameSite: "lax" }, "ตัวเลือกคุกกี้");
    eq(AU("agentCookieName")() as unknown, name, "ชื่อ");
    const src = stripComments(read("src/lib/platform/agent-auth.ts"));
    ok(src.includes("__Host-shark_agent") && /secureCookies/.test(src) && !/domain\s*:/.test(src) && !/["']\/agent["']/.test(src), "ซอร์สคุกกี้");
  });
  await st("S-12", "ฟังก์ชันฝั่งเอเจนซี่ไม่อยู่บน facade (applyToShop · acceptShopInvite · withdrawApplication · setAgentUserRole · disableAgentUser · eraseAgentUser · closeAgentIdentity · setAgentAccountMember · listAgentTeam) · agency/agent-side import ได้เฉพาะจาก platform/agent-auth.ts", () => {
    needBuilt();
    const m = need(AGM, "agency facade");
    const leaked = ["applyToShop", "acceptShopInvite", "withdrawApplication", "setAgentUserRole", "disableAgentUser", "eraseAgentUser", "closeAgentIdentity", "setAgentAccountMember", "listAgentTeam"].filter((n) => n in m);
    eq(leaked, [], "อยู่บน facade");
    const files = git(["ls-files", "src"]).split("\n").concat(git(["ls-files", "--others", "--exclude-standard", "src"]).split("\n")).filter((f) => /\.(ts|tsx)$/.test(f));
    const importers = [...new Set(files)].filter((f) => f !== `${AG_DIR}/agent-side.ts` && /agency\/agent-side["']/.test(stripComments(read(f))));
    eq(importers, ["src/lib/platform/agent-auth.ts"], "ผู้ import agent-side");
  });
  await st("S-13", "สัญญา CC §J.3.1 แก้ตาม §5.8: คุกกี้ __Host-shark_agent Path=/ เฉพาะโดเมนแพลตฟอร์ม · ขอบเขตตัดสินต่อร้านจาก URL (activeAgentAccountId = คำใบ้ UI) · ไม่มี 'path `/agent`' เหลือ", () => {
    needBuilt();
    const cc = read("ledger/TRIPS-CORE-CONTRACT.md");
    const j = cc.slice(cc.indexOf("**J.3.1"), cc.indexOf("**J.3.2"));
    ok(j.includes("__Host-shark_agent") && !j.includes("path `/agent`") && j.includes("คำใบ้ UI") && j.includes("agentScope") && j.includes("memberId"), "CC §J.3.1 ยังไม่แก้");
  });
  await st("S-14", "จดหมาย (มติ R1 ข้อ 3): agent-auth/accounts/entry/tokens ไม่มี sendEmail( · agent-auth ใช้ sendEmailRich · ไม่มี publicOrigin/x-forwarded-host/headers() · ไม่มี console.*", () => {
    needBuilt();
    const files = ["src/lib/platform/agent-auth.ts", `${AG_DIR}/accounts.ts`, `${AG_DIR}/entry.ts`, `${AG_DIR}/tokens.ts`];
    const bad = files.filter((f) => { const t = stripComments(read(f)); return /\bsendEmail\(/.test(t) || /publicOrigin|x-forwarded-host|\bheaders\(\)/.test(t) || /console\.(log|info|warn|error|debug)/.test(t); });
    eq(bad, [], "ไฟล์ผิด");
    ok(/sendEmailRich/.test(stripComments(read("src/lib/platform/agent-auth.ts"))), "ไม่มี sendEmailRich");
  });
  await st("S-15", "งานกวาด agency.authSweep ลงทะเบียนใน minute-jobs.ts แบบ lazy import ของ platform/agent-auth", () => {
    needBuilt();
    const mj = stripComments(read("src/lib/platform/minute-jobs.ts"));
    ok(/name:\s*"agency\.authSweep"/.test(mj) && /await import\(\s*["']@\/lib\/platform\/agent-auth["']\s*\)/.test(mj), "ไม่ได้ลงทะเบียน");
  });

  // ═══════════════ A. ล็อกอิน + session ═══════════════
  console.log("\n── A: ล็อกอินอีเมล · รหัสครั้งเดียว · session ──");
  const reqCode = async (email: string, m: Rec = meta()) => { usedEmails.push(email); const r = R(await AU("requestAgentLoginCode")({ email }, m)); if (r.ok === true) createdCodeIds.push(String(r.codeId)); return r; };
  const verify = async (input: Rec, m: Rec = meta()) => {
    const r = R(await AU("verifyAgentLoginCode")(input, m));
    if (r.ok === true) { allTokens.push(String(r.token)); const u = R(await AU("resolveAgentSession")(String(r.token))).agentUserId; if (typeof u === "string") createdUserIds.push(u); }
    return r;
  };
  type Who = { email: string; token: string; agentUserId: string; identityId: string; publicCode: string };
  const mkIdent = async (tag: string) => {
    const r = R(await AG("createAgentIdentity")({ displayName: `${QC_MARK} ${tag} ${STAMP}`, owner: { displayName: `${QC_MARK} ${tag} owner`, login: { kind: "EMAIL", providerId: "email", subject: mail(tag) } } }));
    ok(r.ok === true, `สร้างตัวตน ${tag}: ${fmt(r)}`);
    createdIdentityIds.push(String(R(r.identity).id)); createdUserIds.push(String(r.agentUserId)); usedEmails.push(mail(tag));
    return { agentUserId: String(r.agentUserId), identityId: String(R(r.identity).id), publicCode: String(R(r.identity).publicCode) };
  };
  const login = async (email: string, extra: Rec = {}): Promise<Who> => {
    const r1 = await reqCode(email);
    ok(r1.ok === true, `ขอรหัส ${email}: ${fmt(r1)}`);
    const code = lastMail(email, "LOGIN_CODE")?.code;
    ok(code, `ไม่มีรหัสในจดหมายถึง ${email}`);
    const r2 = await verify({ email, codeId: r1.codeId, code, ...extra });
    ok(r2.ok === true, `ยืนยัน ${email}: ${fmt(r2)}`);
    const s = R(await AU("resolveAgentSession")(String(r2.token)));
    const ident = R(s.identity);
    if (ident.id) createdIdentityIds.push(String(ident.id));
    return { email, token: String(r2.token), agentUserId: String(s.agentUserId ?? ""), identityId: String(ident.id ?? ""), publicCode: String(ident.publicCode ?? "") };
  };
  const signup = (email: string, tag: string) => login(email, { signup: { agencyName: `${QC_MARK} ${tag} ${STAMP}`, ownerName: `${QC_MARK} owner ${tag}` } });
  const teammate = async (inviter: Who, email: string, role: string, name: string): Promise<Who> => {
    const ti = R(await AU("createTeammateInvite")(inviter.token, { email, role }, meta(undefined, undefined, undefined, OPEN_DEPS)));
    ok(ti.ok === true, `เชิญเพื่อน: ${fmt(ti)}`);
    allTokens.push(String(ti.teammateToken));
    return login(email, { teammateInvite: ti.teammateToken, teammateName: `${QC_MARK} ${name}` });
  };
  const ex = mail("x"), ew = mail("w"), ey = mail("y");
  let X: Who | null = null;
  const needX = (): Who => { if (!X) throw new AssertFail("ยังไม่มีตัวตน X (A-4)"); return X; };

  await st("A-1", "ขอรหัสอีเมลใหม่: {ok codeId expiresAt maskedTo} · จดหมาย LOGIN_CODE 6 หลักถึงอีเมลนั้น · maskedTo ไม่มีอีเมลเต็ม", async () => {
    needBuilt();
    const e = mail("a1");
    const r = await reqCode(e);
    ok(r.ok === true, fmt(r));
    eq(sortedKeys(r), ["codeId", "expiresAt", "maskedTo", "ok"], "คีย์");
    ok(!String(r.maskedTo).includes(e.split("@")[0]), "maskedTo เผยอีเมล");
    ok(/^\d{6}$/.test(lastMail(e, "LOGIN_CODE")?.code ?? ""), "รหัส 6 หลัก");
  });
  await st("A-2", "แถว AgentLoginCode: target = แฮช login-target (ไม่ใช่อีเมล) · codeHash = แฮช login-code ของ `${codeId}:${code}` · ไม่มีรหัสดิบ", async () => {
    needBuilt();
    const e = mail("a2");
    const r = await reqCode(e);
    const code = lastMail(e, "LOGIN_CODE")?.code ?? "";
    const row = (await q<{ target: string; codeHash: string; attempts: number }>(`SELECT target, "codeHash", attempts FROM "AgentLoginCode" WHERE id = $1`, [String(r.codeId)]))[0];
    ok(row, "ไม่มีแถว");
    eq([row.target, row.codeHash, row.attempts], [authHash("login-target", e), authHash("login-code", `${String(r.codeId)}:${code}`), 0], "แถว");
  });
  await st("A-3", "ยืนยันพร้อม signup (อีเมลใหม่) ⇒ ตัวตน X + OWNER · token ขึ้นต้น ag_ (AGENT_SESSION_TOKEN_RE) · ผลยืนยันไม่มี agentUserId · AgentSession.tokenHash = แฮช session (ไม่ใช่ token/sha256) · lastLoginAt ตั้งแล้ว", async () => {
    needBuilt();
    const r1 = await reqCode(ex);
    const v = await verify({ email: ex, codeId: r1.codeId, code: lastMail(ex, "LOGIN_CODE")?.code, signup: { agencyName: `${QC_MARK} X ${STAMP}`, ownerName: `${QC_MARK} owner X` } });
    ok(v.ok === true && v.created === "IDENTITY", fmt(v));
    ok(/^ag_[A-Za-z0-9_-]{43}$/.test(String(v.token)) && !("agentUserId" in v) && !("identityId" in v), `ผล ${sortedKeys(v)}`);
    const sv = R(await AU("resolveAgentSession")(String(v.token)));
    createdIdentityIds.push(String(R(sv.identity).id));
    X = { email: ex, token: String(v.token), agentUserId: String(sv.agentUserId), identityId: String(R(sv.identity).id), publicCode: String(R(sv.identity).publicCode) };
    const s = (await q<{ tokenHash: string; expiresAt: Date; idleExpiresAt: Date }>(`SELECT "tokenHash", "expiresAt", "idleExpiresAt" FROM "AgentSession" WHERE "agentUserId" = $1`, [X.agentUserId]));
    eq(s.length, 1, "จำนวน session");
    ok(s[0].tokenHash === authHash("session", X.token) && s[0].tokenHash !== X.token && s[0].tokenHash !== sha256(X.token), "tokenHash");
    ok(s[0].idleExpiresAt <= s[0].expiresAt, "idle ≤ absolute");
    const u = (await q<{ role: string; lastLoginAt: Date | null }>(`SELECT role, "lastLoginAt" FROM "AgentUser" WHERE id = $1`, [X.agentUserId]))[0];
    eq([u?.role, u?.lastLoginAt instanceof Date], ["OWNER", true], "ผู้ใช้");
  });
  await st("A-4", "ไม่มี oracle บัญชี: ซอร์สของ requestAgentLoginCode ไม่อ้าง agentUser/agentLogin/agentIdentity/agentUserByLogin/findAgentIdentityByCode · อีเมลที่มีบัญชี (X) กับอีเมลใหม่ ⇒ คีย์ผลเดียวกัน + จดหมาย LOGIN_CODE ถึงทั้งคู่ผ่านตัวส่งที่ฉีด", async () => {
    needX();
    const src = stripComments(read("src/lib/platform/agent-auth.ts"));
    const at = src.indexOf("function requestAgentLoginCode");
    ok(at >= 0, "ไม่พบฟังก์ชัน");
    const nx = src.slice(at + 10).search(/\n(export\s+)?(async\s+)?function\s|\nexport\s+const\s/);
    const body = src.slice(at, nx < 0 ? undefined : at + 10 + nx);
    ok(!/\.(agentUser|agentLogin|agentIdentity)\b|agentUserByLogin|findAgentIdentityByCode|listAgentAccountsOfUser/.test(body), "เส้นทางขอรหัสอ่านตารางตัวตน");
    const n0 = mails.length;
    const fresh = mail("a4-fresh");
    const a = await reqCode(ex), b = await reqCode(fresh);
    eq(sortedKeys(a), sortedKeys(b), "คีย์");
    const got = mails.slice(n0).map((m) => `${m.to}|${m.kind}`).sort();
    eq(got, [`${ex}|LOGIN_CODE`, `${fresh}|LOGIN_CODE`].sort(), "จดหมาย");
  });
  await st("A-5", "รหัสผิด ⇒ INVALID_CODE + attempts 1 · รหัสถูกแต่อีเมลอื่น ⇒ INVALID_CODE · รหัสถูก ⇒ ok · ใช้ซ้ำ ⇒ INVALID_CODE", async () => {
    needBuilt();
    const ex = mail("a5"); await mkIdent("a5");
    const r = await reqCode(ex);
    const code = lastMail(ex, "LOGIN_CODE")?.code ?? "";
    const wrong = code === "000000" ? "111111" : "000000";
    const a = await verify({ email: ex, codeId: r.codeId, code: wrong });
    const att = (await q<{ attempts: number }>(`SELECT attempts FROM "AgentLoginCode" WHERE id = $1`, [String(r.codeId)]))[0]?.attempts;
    const b = await verify({ email: ew, codeId: r.codeId, code });
    const c = await verify({ email: ex, codeId: r.codeId, code });
    const d = await verify({ email: ex, codeId: r.codeId, code });
    eq([a.code, att, b.code, c.ok, c.created, d.code], ["INVALID_CODE", 1, "INVALID_CODE", true, "NONE", "INVALID_CODE"], "ผล");
    eq(a.message, d.message, "ข้อความล้มต้องเหมือนกัน");
  });
  await st("A-6", "รหัสหมดอายุ (ขอ ณ now−20 นาที ยืนยัน ณ ตอนนี้) ⇒ INVALID_CODE · ผิดครบ codeMaxAttempts แล้วรหัสถูกก็ ⇒ INVALID_CODE", async () => {
    needBuilt();
    const ex = mail("a6"); await mkIdent("a6");
    const past = new Date(Date.now() - 20 * 60_000);
    const r = await reqCode(ex, meta(past));
    const code = lastMail(ex, "LOGIN_CODE")?.code ?? "";
    const a = await verify({ email: ex, codeId: r.codeId, code });
    const r2 = await reqCode(ex);
    const code2 = lastMail(ex, "LOGIN_CODE")?.code ?? "";
    const wrong = code2 === "000000" ? "111111" : "000000";
    for (let i = 0; i < lim("codeMaxAttempts"); i++) await verify({ email: ex, codeId: r2.codeId, code: wrong });
    const b = await verify({ email: ex, codeId: r2.codeId, code: code2 });
    eq([a.code, b.code], ["INVALID_CODE", "INVALID_CODE"], "ผล");
  });
  await st("A-7", "ขอรหัสใหม่ (เครื่องอื่น) ⇒ รหัสแรกที่ค้างยังใช้ได้ (ไม่มี DoS) · เข้าระบบสำเร็จด้วยรหัสแรก ⇒ รหัสที่สองของอีเมลเดียวกันใช้ไม่ได้", async () => {
    needBuilt();
    const ex = mail("a7"); await mkIdent("a7");
    const r1 = await reqCode(ex);
    const c1 = lastMail(ex, "LOGIN_CODE")?.code ?? "";
    const r2 = await reqCode(ex);
    const c2 = lastMail(ex, "LOGIN_CODE")?.code ?? "";
    const a = await verify({ email: ex, codeId: r1.codeId, code: c1 });
    const b = await verify({ email: ex, codeId: r2.codeId, code: c2 });
    eq([a.ok, b.code], [true, "INVALID_CODE"], "ผล");
  });
  await st("A-8", "รหัสถูกของอีเมลที่ไม่มีบัญชี + ไม่มี signup ⇒ LOGIN_UNAVAILABLE · ไม่สร้างตัวตน/ผู้ใช้", async () => {
    needBuilt();
    const e = mail("a8");
    const r = await reqCode(e);
    const v = await verify({ email: e, codeId: r.codeId, code: lastMail(e, "LOGIN_CODE")?.code ?? "" });
    const n = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLogin" WHERE subject = $1`, [e]);
    eq([v.code, n[0]?.n], ["LOGIN_UNAVAILABLE", 0], "ผล");
  });
  await st("A-9", "rate limit ต่ออีเมล: ขอครบเพดาน codePerTarget แล้วครั้งถัดไป ⇒ RATE_LIMITED + retryAfterSec > 0 (คนละ clientKey)", async () => {
    needBuilt();
    const e = mail("a9");
    const n = lim("codePerTarget", "limit");
    const rs: Rec[] = [];
    for (let i = 0; i <= n; i++) rs.push(await reqCode(e));
    ok(rs.slice(0, n).every((r) => r.ok === true), `ครั้งที่ไม่เกินเพดานล้ม: ${fmt(rs.find((r) => r.ok !== true))}`);
    const last = rs[n];
    ok(last.code === "RATE_LIMITED" && Number(last.retryAfterSec) > 0, fmt(last));
  });
  await st("A-10", "resolveAgentSession: token ถูก ⇒ มุมมองของเอเจนซี่ (agentUserId · role OWNER · identity.publicCode) · token มั่ว ⇒ null · logout ⇒ null", async () => {
    const x = needX();
    const s = R(await AU("resolveAgentSession")(x.token));
    eq([s.agentUserId, s.role, R(s.identity).publicCode], [x.agentUserId, "OWNER", x.publicCode], "มุมมอง");
    eq(await AU("resolveAgentSession")(randomBytes(32).toString("base64url")), null, "token มั่ว");
    const tmp = await login(ex);
    await AU("logoutAgentSession")(tmp.token);
    eq(await AU("resolveAgentSession")(tmp.token), null, "หลัง logout");
  });
  await st("A-11", "หมดอายุ: resolve ณ now > idleExpiresAt ⇒ null · ณ now > expiresAt ⇒ null", async () => {
    const x = needX();
    const s = (await q<{ idleExpiresAt: Date; expiresAt: Date }>(`SELECT "idleExpiresAt", "expiresAt" FROM "AgentSession" WHERE "tokenHash" = $1`, [authHash("session", x.token)]))[0];
    ok(s, "ไม่มี session");
    const th = authHash("session", x.token);
    const keep = (await q<{ i: string; e: string }>(`SELECT "idleExpiresAt"::text AS i, "expiresAt"::text AS e FROM "AgentSession" WHERE "tokenHash" = $1`, [th]))[0];
    const past = await AU("resolveAgentSession")(x.token, { now: new Date(Date.now() + 400 * 86_400_000) });
    ok(past !== null, "now ของผู้เรียกต้องไม่มีผลกับอายุ session (มติ §10 ข้อ 7)");
    await q(`UPDATE "AgentSession" SET "idleExpiresAt" = now() - interval '1 second' WHERE "tokenHash" = $1`, [th]);
    const a = await AU("resolveAgentSession")(x.token);
    const revive = await AU("resolveAgentSession")(x.token, { now: new Date(Date.now() - 3_600_000) });
    await q(`UPDATE "AgentSession" SET "expiresAt" = now() - interval '1 second', "idleExpiresAt" = now() - interval '2 second' WHERE "tokenHash" = $1`, [th]);
    const b = await AU("resolveAgentSession")(x.token);
    await q(`UPDATE "AgentSession" SET "expiresAt" = $2::timestamp, "idleExpiresAt" = $3::timestamp WHERE "tokenHash" = $1`, [th, keep.e, keep.i]);
    eq([a, b, revive], [null, null, null], "ผล");
    ok(await AU("resolveAgentSession")(x.token), "session ปกติต้องยังใช้ได้หลังลองเวลาอนาคต");
  });
  await st("A-12", "ไม่มีกุญแจเซิร์ฟเวอร์ (SESSION_SECRET ว่าง) ⇒ BUSY reason SERVER_KEY_MISSING · ไม่สร้างแถวรหัส · ไม่มีกุญแจสำรอง", async () => {
    needBuilt();
    const keep = process.env.SESSION_SECRET;
    const e = mail("a12");
    let r: Rec = {};
    try { process.env.SESSION_SECRET = ""; r = R(await AU("requestAgentLoginCode")({ email: e }, meta())); } finally { process.env.SESSION_SECRET = keep; }
    usedEmails.push(e);
    const n = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLoginCode" WHERE target = $1`, [authHash("login-target", e)]);
    eq([r.code, r.reason, n[0]?.n], ["BUSY", "SERVER_KEY_MISSING", 0], "ผล");
  });

  await st("A-13", "ขอรหัสพร้อมกัน 8 คำขอ (อีเมลเดียว คนละเครื่อง) ⇒ ok = codePerTarget พอดี · ที่เหลือ RATE_LIMITED · แถวรหัส = codePerTarget", async () => {
    needBuilt();
    const e = mail("a13");
    usedEmails.push(e);
    const out = await Promise.all(Array.from({ length: 8 }, () => AU("requestAgentLoginCode")({ email: e }, meta()).then(R)));
    for (const r of out) if (r.ok === true) createdCodeIds.push(String(r.codeId));
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLoginCode" WHERE target = $1`, [authHash("login-target", e)]))[0]?.n;
    eq([out.filter((r) => r.ok === true).length, out.filter((r) => r.code === "RATE_LIMITED").length, n], [lim("codePerTarget", "limit"), 8 - lim("codePerTarget", "limit"), lim("codePerTarget", "limit")], "ผล");
  });
  await st("A-14", "ถังรายวัน: ขอเต็มเพดาน 15 นาทีในหลายหน้าต่างของวันเดียวกัน (now + k·16 นาที) ⇒ ok รวม = codePerTargetDay พอดี", async () => {
    needBuilt();
    const e = mail("a14");
    const per = lim("codePerTarget", "limit"), day = lim("codePerTargetDay", "limit");
    const windows = Math.ceil(day / per) + 1;
    const t0 = Date.now();
    let okN = 0;
    for (let k = 0; k < windows; k++) for (let i = 0; i < per; i++) if ((await reqCode(e, meta(new Date(t0 + k * 16 * 60_000)))).ok === true) okN++;
    eq(okN, day, "ok รวมต่อวัน");
  });
  await st("A-15", "ตัวจำกัดล้ม (ผลไม่มี count · deps.rateLimit จำลอง) ⇒ ขอรหัส RATE_LIMITED ไม่สร้างแถว · ยืนยันรหัส RATE_LIMITED (ถังต่ออีเมล/ต่อรหัส fail closed)", async () => {
    needBuilt();
    const e = mail("a15");
    usedEmails.push(e);
    const broken = { ...deps, rateLimit: stubRate({ broken: true }) };
    const a = R(await AU("requestAgentLoginCode")({ email: e }, meta(undefined, undefined, undefined, broken)));
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLoginCode" WHERE target = $1`, [authHash("login-target", e)]))[0]?.n;
    const r = await reqCode(e);
    const b = R(await AU("verifyAgentLoginCode")({ email: e, codeId: r.codeId, code: lastMail(e, "LOGIN_CODE")?.code }, meta(undefined, undefined, undefined, broken)));
    eq([a.code, n, b.code], ["RATE_LIMITED", 0, "RATE_LIMITED"], "ผล");
  });
  await st("A-16", "clientKey ผิดรูป ('unknown' · มีช่องว่าง · ยาว 200) ⇒ VALIDATION · ไม่มี ip ⇒ RATE_LIMITED reason NO_CLIENT · ไม่สร้างแถว", async () => {
    needBuilt();
    const e = mail("a16");
    usedEmails.push(e);
    const bad = await Promise.all(["unknown", "has space key", "k".repeat(200)].map((ck) => AU("requestAgentLoginCode")({ email: e }, { ...meta(), clientKey: ck }).then(R)));
    const noIp = R(await AU("requestAgentLoginCode")({ email: e }, { clientKey: `qc-${hex(6)}`, deps }));
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLoginCode" WHERE target = $1`, [authHash("login-target", e)]))[0]?.n;
    eq([bad.map((r) => r.code), noIp.code, noIp.reason, n], [["VALIDATION", "VALIDATION", "VALIDATION"], "RATE_LIMITED", "NO_CLIENT", 0], "ผล");
  });
  await st("A-17", "ถังต่อ IP: ขอรหัส codePerIp ครั้งจาก IP เดียว (อีเมล/เครื่องต่างกันทุกครั้ง) แล้วครั้งถัดไป ⇒ RATE_LIMITED", async () => {
    needBuilt();
    const ip = `10.250.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
    const n = lim("codePerIp", "limit");
    let last: Rec = {}, okN = 0;
    for (let i = 0; i <= n; i++) { last = await reqCode(mail(`a17-${i}`), meta(undefined, undefined, ip)); if (last.ok === true && i < n) okN++; }
    eq([okN, last.code], [n, "RATE_LIMITED"], "ผล");
  });

  // ═══════════════ AP. สมัคร ═══════════════
  console.log("\n── AP: สมัครเอง ──");
  const TAXJ = thaiTaxId(`0105${digits(8)}`);
  const app = (o: Rec = {}): Rec => ({ legalName: `${QC_MARK} legal ${hex(3)}`, payeeType: "TH_JURISTIC", contact: { name: `${QC_MARK} contact` }, consentVersion: "agency-apply-v1", ...o });
  const accountOf = async (tenantId: string, identityId: string) => (await q<Rec>(`SELECT * FROM "AgentAccount" WHERE "tenantId" = $1 AND "identityId" = $2`, [tenantId, identityId]))[0] ?? null;
  const acc = async (id: string) => (await q<Rec>(`SELECT * FROM "AgentAccount" WHERE id = $1`, [id]))[0] ?? null;
  const events = async (tenantId: string, type?: string) => q<{ type: string; payload: Rec; idempotencyKey: string }>(`SELECT type, payload, "idempotencyKey" FROM "OutboxEvent" WHERE "tenantId" = $1 AND type LIKE 'agency.%' ${type ? "AND type = $2" : ""} ORDER BY "createdAt"`, type ? [tenantId, type] : [tenantId]);
  const audits = async (tenantId: string) => q<{ action: string; targetId: string | null; actorType: string; actorId: string | null; after: unknown }>(`SELECT action, "targetId", "actorType"::text AS "actorType", "actorId", after FROM "AuditLog" WHERE "tenantId" = $1 AND action LIKE 'agency.%' ORDER BY "createdAt"`, [tenantId]);
  const AUDIT_AFTER_KEYS = ["from", "to", "reason", "actorKind", "fields", "idem", "body"];
  let accXA = "", accXB = "";
  const appA = app({ legalName: `${QC_MARK} X legal A ${STAMP}`, taxId: TAXJ, contact: { name: `${QC_MARK} contact A`, email: mail("contact-a") } });

  await st("AP-1", "X สมัครร้าน A (A36 = true) ⇒ PENDING · สมาชิก OWNER ของ X · contact.consentVersion/consentAt · Party ชื่ออย่างเดียวในร้าน A", async () => {
    const x = needX();
    const r = R(await AU("agentApply")(x.token, { shopSlug: slugA, application: appA }, meta()));
    ok(r.ok === true && r.status === "PENDING" && r.replayed === false, fmt(r));
    accXA = String(r.agentAccountId);
    const a = await acc(accXA);
    eq([a?.tenantId, a?.identityId, a?.status], [tA, x.identityId, "PENDING"], "แถว");
    const c = R(a?.contact);
    ok(c.consentVersion === "agency-apply-v1" && typeof c.consentAt === "string" && c.source === "APPLY", `contact ${fmt(c)}`);
    const m = await q<{ role: string; active: boolean }>(`SELECT role, active FROM "AgentAccountMember" WHERE "agentAccountId" = $1 AND "agentUserId" = $2`, [accXA, x.agentUserId]);
    eq(m, [{ role: "OWNER", active: true }], "สมาชิก");
  });
  await st("AP-2", "event agency.account.applied ในร้าน A: payload = { agentAccountId } เท่านั้น · 1 แถว", async () => {
    ok(accXA, "ไม่มีบัญชี");
    const ev = (await events(tA, "agency.account.applied")).filter((e) => R(e.payload).agentAccountId === accXA);
    eq(ev.map((e) => sortedKeys(e.payload)), [["agentAccountId"]], "payload");
  });
  await st("AP-3", "audit ของการสมัคร: actorType SYSTEM · actorId = AgentAccountMember.id (ไม่ใช่ agentUserId) · after ⊂ {from to reason actorKind fields idem body} · after.actorKind AGENT", async () => {
    ok(accXA, "ไม่มีบัญชี");
    const mid = (await q<{ id: string }>(`SELECT id FROM "AgentAccountMember" WHERE "agentAccountId" = $1`, [accXA]))[0]?.id;
    const rows = (await audits(tA)).filter((r) => r.targetId === accXA && r.action === "agency.account.apply");
    ok(rows.length === 1, `audit ${rows.length}`);
    const a = rows[0];
    eq([a.actorType, a.actorId, R(a.after).actorKind], ["SYSTEM", mid, "AGENT"], "ผู้ทำ");
    ok(Object.keys(R(a.after)).every((k) => AUDIT_AFTER_KEYS.includes(k)), `after ${fmt(a.after)}`);
  });
  await st("AP-4", "X สมัครร้าน B (A36 = false) พร้อมเครื่องหมาย ⇒ ACTIVE ทันที · approvedAt · AgentBalance 0/0 · event applied + approved", async () => {
    const x = needX();
    const r = R(await AU("agentApply")(x.token, { shopSlug: slugB, application: app({ legalName: legalB, contact: { name: contactNameB, email: contactEmailB }, licenceNo: licenceB, licenceExpiry: "2027-06-30" }) }, meta()));
    ok(r.ok === true && r.status === "ACTIVE", fmt(r));
    accXB = String(r.agentAccountId);
    const a = await acc(accXB);
    ok(a?.approvedAt instanceof Date, "approvedAt");
    const b = await q<{ bal: string; s: number }>(`SELECT "balanceSatang"::text AS bal, "lastSeq" AS s FROM "AgentBalance" WHERE "agentAccountId" = $1`, [accXB]);
    eq(b, [{ bal: "0", s: 0 }], "AgentBalance");
    eq((await events(tB)).filter((e) => R(e.payload).agentAccountId === accXB).map((e) => e.type), ["agency.account.applied", "agency.account.approved"], "event");
  });
  await st("AP-5", "ร้านไม่มีจริง กับ ร้านที่ไม่มีหน่วย TRIPS/TICKET (C) ⇒ NOT_FOUND รหัส+ข้อความเดียวกัน · ไม่มีแถว", async () => {
    const x = needX();
    const a = R(await AU("agentApply")(x.token, { shopSlug: slugC, application: app() }, meta()));
    const b = R(await AU("agentApply")(x.token, { shopSlug: slugNone, application: app() }, meta()));
    eq([a.code, b.code, a.message === b.message], ["NOT_FOUND", "NOT_FOUND", true], "ผล");
    eq(await accountOf(tC, x.identityId), null, "แถวที่ร้าน C");
  });
  await st("AP-6", "ข้อความผิดกติกา (ตัวกลับทิศในชื่อ · อีเมลติดต่อผิดรูป) ⇒ VALIDATION · ไม่มีแถว", async () => {
    const x = needX();
    const a = R(await AU("agentApply")(x.token, { shopSlug: slugD, application: app({ legalName: `‮${QC_MARK} evil` }) }, meta()));
    const b = R(await AU("agentApply")(x.token, { shopSlug: slugD, application: app({ contact: { name: "ok", email: "not-an-email" } }) }, meta()));
    eq([a.code, b.code, await accountOf(tD, x.identityId)], ["VALIDATION", "VALIDATION", null], "ผล");
  });
  await st("AP-7", "รุ่นถ้อยคำความยินยอมไม่ตรง (agency-apply-v0 / ไม่ส่ง) ⇒ VALIDATION · ไม่มีแถว", async () => {
    const x = needX();
    const a = R(await AU("agentApply")(x.token, { shopSlug: slugD, application: app({ consentVersion: "agency-apply-v0" }) }, meta()));
    const ap = app(); delete ap.consentVersion;
    const b = R(await AU("agentApply")(x.token, { shopSlug: slugD, application: ap }, meta()));
    eq([a.code, b.code, await accountOf(tD, x.identityId)], ["VALIDATION", "VALIDATION", null], "ผล");
  });
  await st("AP-8", "เลขภาษีนิติบุคคล: taxIdEnc เข้ารหัส (ไม่มีเลข 13 หลัก) · taxIdLast4 = 4 ตัวท้าย · AgentIdentity.taxIdHash ของ X ยัง null (ไม่แตะตัวตน)", async () => {
    const x = needX();
    const a = await acc(accXA);
    ok(typeof a?.taxIdEnc === "string" && !String(a.taxIdEnc).includes(TAXJ), "taxIdEnc");
    eq(a?.taxIdLast4, TAXJ.slice(-4), "last4");
    eq((await q<{ h: string | null }>(`SELECT "taxIdHash" AS h FROM "AgentIdentity" WHERE id = $1`, [x.identityId]))[0]?.h, null, "taxIdHash");
  });
  await st("AP-9", "สมัครซ้ำขณะ PENDING ⇒ ok replayed · id เดิม · ไม่มีแถว/event ใหม่", async () => {
    const x = needX();
    const r = R(await AU("agentApply")(x.token, { shopSlug: slugA, application: appA }, meta()));
    eq([r.ok, r.agentAccountId, r.replayed], [true, accXA, true], "ผล");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1 AND "identityId" = $2`, [tA, x.identityId]))[0]?.n, 1, "แถว");
    eq((await events(tA, "agency.account.applied")).filter((e) => R(e.payload).agentAccountId === accXA).length, 1, "event");
  });
  let Z: Who | null = null, RR: Who | null = null, accZA = "", accRA = "";
  await st("AP-10", "Z สมัคร A (ใบอนุญาตหมดอายุ) → ถอน ⇒ CLOSED WITHDRAWN → สมัครใหม่ ⇒ PENDING แถวเดิม · event applied 2 ครั้ง", async () => {
    needBuilt();
    Z = await signup(mail("z"), "Z");
    const r1 = R(await AU("agentApply")(Z.token, { shopSlug: slugA, application: app({ licenceNo: "11/09999", licenceExpiry: "2020-01-01" }) }, meta()));
    ok(r1.ok === true, fmt(r1));
    accZA = String(r1.agentAccountId);
    const w = R(await AU("agentWithdraw")(Z.token, { shopSlug: slugA }, meta()));
    const a1 = await acc(accZA);
    const r2 = R(await AU("agentApply")(Z.token, { shopSlug: slugA, application: app({ licenceNo: "11/09999", licenceExpiry: "2020-01-01" }) }, meta()));
    eq([w.status, a1?.status, a1?.statusReason, r2.status, r2.agentAccountId], ["CLOSED", "CLOSED", "WITHDRAWN", "PENDING", accZA], "ผล");
    eq((await events(tA, "agency.account.applied")).filter((e) => R(e.payload).agentAccountId === accZA).length, 2, "event");
  });
  await st("AP-11", "บุคคลธรรมดา (TH_PERSON) เลขบัตร 13 หลักไม่ขึ้นต้น 0: รับที่ร้าน (เข้ารหัส) · ตัวตนไม่ถูกแตะ · Party ชนิด PERSON", async () => {
    needBuilt();
    RR = await signup(mail("r"), "R");
    const pid = thaiTaxId(`1${digits(11)}`);
    const r = R(await AU("agentApply")(RR.token, { shopSlug: slugA, application: app({ payeeType: "TH_PERSON", taxId: pid, legalName: `${QC_MARK} R person` }) }, meta()));
    ok(r.ok === true, fmt(r));
    accRA = String(r.agentAccountId);
    const a = await acc(accRA);
    ok(!String(a?.taxIdEnc ?? "").includes(pid) && a?.taxIdLast4 === pid.slice(-4), "เข้ารหัส");
    const p = (await q<{ kind: string }>(`SELECT kind::text AS kind FROM "Party" WHERE id = $1`, [String(a?.partyId)]))[0];
    eq(p?.kind, "PERSON", "Party kind");
    eq((await q<{ h: string | null }>(`SELECT "taxIdHash" AS h FROM "AgentIdentity" WHERE id = $1`, [RR.identityId]))[0]?.h, null, "taxIdHash");
  });

  await st("AP-12", "ปิดโดยร้านที่ร้าน B (ไม่ต้องอนุมัติ): สมัครซ้ำทันที ⇒ BAD_STATE · หลังช่วงรอ ⇒ PENDING (ไม่ใช่ ACTIVE · approvedAt ล้าง) · ร้านบล็อก PENDING ⇒ SUSPENDED · สมัครซ้ำ ⇒ BAD_STATE · คืนสิทธิ์แถวที่ไม่เคยอนุมัติ ⇒ BAD_STATE · ปิดได้", async () => {
    needBuilt();
    const qq = await signup(mail("q"), "Q");
    const r1 = R(await AU("agentApply")(qq.token, { shopSlug: slugB, application: app() }, meta()));
    ok(r1.status === "ACTIVE", `สมัคร B: ${fmt(r1)}`);
    const id = String(r1.agentAccountId);
    const c = await shop("closeAgentAccount", cB(), { agentAccountId: id });
    const now1 = R(await AU("agentApply")(qq.token, { shopSlug: slugB, application: app() }, meta()));
    const later = new Date(Date.now() + (lim("reapplyCooldownDays") + 1) * 86_400_000);
    const re = R(await AU("agentApply")(qq.token, { shopSlug: slugB, application: app() }, meta(later)));
    const row = await acc(id);
    const blk = await shop("suspendAgentAccount", cB(), { agentAccountId: id });
    const again = R(await AU("agentApply")(qq.token, { shopSlug: slugB, application: app() }, meta(new Date(later.getTime() + 60_000))));
    const rein = await shop("reinstateAgentAccount", cB(), { agentAccountId: id });
    const cl = await shop("closeAgentAccount", cB(), { agentAccountId: id });
    eq([c.status, now1.code, re.status, re.agentAccountId, row?.approvedAt ?? null, blk.status, again.code, rein.code, cl.status], ["CLOSED", "BAD_STATE", "PENDING", id, null, "SUSPENDED", "BAD_STATE", "BAD_STATE", "CLOSED"], "ผล");
  });
  await st("AP-13", "ADMIN สมัคร ⇒ สมาชิก = ผู้สมัคร (ADMIN) + OWNER ทุกคนของตัวตน · OWNER เห็นบัญชีใน myAgentAccounts · ลดบทบาท OWNER คนหนึ่งเป็น SALES ⇒ แถวสมาชิกไหลลงเป็น SALES", async () => {
    needBuilt();
    const h1 = await signup(mail("h1"), "H");
    const h2 = await teammate(h1, mail("h2"), "OWNER", "H2");
    const h3 = await teammate(h1, mail("h3"), "ADMIN", "H3");
    const r = R(await AU("agentApply")(h3.token, { shopSlug: slugA, application: app() }, meta()));
    ok(r.ok === true, fmt(r));
    const id = String(r.agentAccountId);
    const mem = async () => (await q<{ u: string; role: string; active: boolean }>(`SELECT "agentUserId" AS u, role, active FROM "AgentAccountMember" WHERE "agentAccountId" = $1 ORDER BY "agentUserId"`, [id]));
    const m1 = await mem();
    const exp = [[h1.agentUserId, "OWNER"], [h2.agentUserId, "OWNER"], [h3.agentUserId, "ADMIN"]].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    eq(m1.map((m) => [m.u, m.role]), exp, "สมาชิก");
    const mine = R(await AU("myAgentAccounts")(h1.token));
    ok(((mine.items as Rec[]) ?? []).some((i) => i.agentAccountId === id), "OWNER ไม่เห็นบัญชี");
    const d = R(await AU("setTeammateRole")(h1.token, { targetUserId: h2.agentUserId, role: "SALES" }));
    ok(d.ok === true, fmt(d));
    eq((await mem()).find((m) => m.u === h2.agentUserId)?.role, "SALES", "ไหลลง");
  });

  // ═══════════════ SH. ฝั่งร้าน ═══════════════
  console.log("\n── SH: ฝั่งร้าน · ผังสถานะ · สิทธิ์ · DTO ──");
  await st("SH-1", "listAgentAccounts (เจ้าของ A): มีบัญชี X · ทุกแถวคีย์ = SHOP_AGENT_LIST_KEYS · publicCode = ของ X · ไม่มีคีย์ต้องห้ามทุกชั้น", async () => {
    const x = needX();
    const r = await shop("listAgentAccounts", cA(), {});
    ok(r.ok === true && Array.isArray(r.items), fmt(r));
    const items = r.items as Rec[];
    const mine = items.find((i) => i.id === accXA);
    ok(mine && mine.publicCode === x.publicCode && mine.memberCount === 1, `แถว X ${fmt(mine)}`);
    ok(items.every((i) => isDeepStrictEqual(sortedKeys(i), [...LIST_KEYS].sort())), "คีย์แถว");
    const bad = [...keysDeep(items)].filter((k) => NEVER.includes(k));
    eq(bad, [], "คีย์ต้องห้าม");
  });
  await st("SH-2", "getAgentAccount: คีย์ = SHOP_AGENT_ACCOUNT_KEYS · identity = {publicCode displayName status} · members = {memberId displayName role active} 1 แถว · contact ครบ 7 คีย์", async () => {
    needX();
    const r = await shop("getAgentAccount", cA(), { agentAccountId: accXA });
    const d = R(r.account);
    eq(sortedKeys(d), [...DTO_KEYS].sort(), "คีย์");
    eq(sortedKeys(d.identity), ["displayName", "publicCode", "status"], "identity");
    const ms = (d.members as Rec[]) ?? [];
    eq([ms.length, sortedKeys(ms[0])], [1, ["active", "displayName", "memberId", "role"]], "members");
    eq(sortedKeys(d.contact), ["consentAt", "consentVersion", "email", "lineId", "name", "phone", "source"], "contact");
    eq([...keysDeep(d)].filter((k) => NEVER.includes(k)), [], "คีย์ต้องห้าม");
  });
  await st("SH-3", "สิทธิ์: STAFF ไม่มีสิทธิ์ ⇒ FORBIDDEN (รายการ) · STAFF view ⇒ ดูได้แต่อนุมัติ FORBIDDEN · MANAGER จำกัดสาขา ⇒ อนุมัติ FORBIDDEN · สถานะยัง PENDING", async () => {
    needX();
    const a = await shop("listAgentAccounts", ctxOf(tA, staff.NONE), {});
    const b = await shop("listAgentAccounts", ctxOf(tA, staff.VIEW), {});
    const c = await shop("approveAgentAccount", ctxOf(tA, staff.VIEW), { agentAccountId: accXA });
    const d = await shop("approveAgentAccount", ctxOf(tA, staff.MGR), { agentAccountId: accXA });
    eq([a.code, b.ok, c.code, d.code, (await acc(accXA))?.status], ["FORBIDDEN", true, "FORBIDDEN", "FORBIDDEN", "PENDING"], "ผล");
  });
  await st("SH-4", "ร้าน B อ่าน/อนุมัติบัญชีของร้าน A ⇒ NOT_FOUND เหมือน id สุ่มทุกไบต์ · ไม่เปลี่ยนอะไร", async () => {
    needX();
    const a = await shop("getAgentAccount", cB(), { agentAccountId: accXA });
    const b = await shop("getAgentAccount", cB(), { agentAccountId: rid("nope") });
    const c = await shop("approveAgentAccount", cB(), { agentAccountId: accXA });
    eq([a.code, a.message === b.message, c.code, (await acc(accXA))?.status], ["NOT_FOUND", true, "NOT_FOUND", "PENDING"], "ผล");
  });
  await st("SH-5", "อนุมัติ X ที่ A ด้วย code PTD ⇒ ACTIVE · approvedById = เจ้าของ A · approvedAt · code PTD · AgentBalance · event approved 1", async () => {
    needX();
    const r = await shop("approveAgentAccount", cA(), { agentAccountId: accXA, code: "PTD" });
    ok(r.ok === true && r.status === "ACTIVE" && r.replayed === false, fmt(r));
    const a = await acc(accXA);
    eq([a?.status, a?.approvedById, a?.approvedAt instanceof Date, a?.code], ["ACTIVE", staff.OA.userId, true, "PTD"], "แถว");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentBalance" WHERE "agentAccountId" = $1`, [accXA]))[0]?.n, 1, "AgentBalance");
    eq((await events(tA, "agency.account.approved")).filter((e) => R(e.payload).agentAccountId === accXA).length, 1, "event");
  });
  await st("SH-6", "อนุมัติซ้ำ ⇒ ok replayed · event/audit อนุมัติยัง 1 · ปฏิเสธบัญชี ACTIVE ⇒ BAD_STATE ไม่เปลี่ยน", async () => {
    needX();
    const r = await shop("approveAgentAccount", cA(), { agentAccountId: accXA });
    const j = await shop("rejectAgentAccount", cA(), { agentAccountId: accXA });
    eq([r.ok, r.replayed, j.code, (await acc(accXA))?.status], [true, true, "BAD_STATE", "ACTIVE"], "ผล");
    eq((await events(tA, "agency.account.approved")).filter((e) => R(e.payload).agentAccountId === accXA).length, 1, "event");
    eq((await audits(tA)).filter((x) => x.targetId === accXA && x.action === "agency.account.approve").length, 1, "audit");
  });
  await st("SH-7", "ระงับ ⇒ SUSPENDED + suspendedAt + event suspended · ประตู agentScope(X, A) = null · X สมัครซ้ำ ⇒ BAD_STATE · คืนสิทธิ์ ⇒ ACTIVE · ประตูคืน", async () => {
    const x = needX();
    const s = await shop("suspendAgentAccount", cA(), { agentAccountId: accXA });
    const a1 = await acc(accXA);
    const scope1 = await AU("agentScope")(x.token, { shopSlug: slugA });
    const re = R(await AU("agentApply")(x.token, { shopSlug: slugA, application: appA }, meta()));
    const rs = await shop("reinstateAgentAccount", cA(), { agentAccountId: accXA });
    const scope2 = R(await AU("agentScope")(x.token, { shopSlug: slugA }));
    eq([s.status, a1?.suspendedAt instanceof Date, scope1, re.code, rs.status, scope2.agentAccountId, scope2.tenantId], ["SUSPENDED", true, null, "BAD_STATE", "ACTIVE", accXA, tA], "ผล");
    eq((await events(tA, "agency.account.suspended")).filter((e) => R(e.payload).agentAccountId === accXA).length, 1, "event");
  });
  await st("SH-8", "แก้โปรไฟล์: expectedUpdatedAt เก่า ⇒ STALE · ใหม่ + ใบอนุญาตหมดอายุ ⇒ ok · licence.warnings มี LICENCE_EXPIRED · สถานะไม่เปลี่ยน · audit เก็บแค่ชื่อช่อง", async () => {
    needX();
    const d0 = R((await shop("getAgentAccount", cA(), { agentAccountId: accXA })).account);
    const stale = await shop("updateAgentAccountProfile", cA(), { agentAccountId: accXA, expectedUpdatedAt: "2020-01-01T00:00:00.000Z", patch: { licenceNo: "11/00001" } });
    const r = await shop("updateAgentAccountProfile", cA(), { agentAccountId: accXA, expectedUpdatedAt: d0.updatedAt, patch: { licenceNo: "11/00001", licenceExpiry: "2021-01-01" } });
    const d = R(r.account);
    eq([stale.code, r.ok, d.status, R(d.licence).warnings], ["STALE", true, "ACTIVE", ["LICENCE_EXPIRED"]], "ผล");
    const ed = (await audits(tA)).filter((x) => x.targetId === accXA && x.action === "agency.account.edit");
    ok(ed.length >= 1 && ed.every((x) => !JSON.stringify(x.after).includes("11/00001")), `audit ${fmt(ed)}`);
  });
  await st("SH-9", "STAFF มี edit ไม่มี money: แก้ taxId ⇒ FORBIDDEN (ไม่แก้ทั้ง patch) · แก้ legalName ⇒ ok", async () => {
    needX();
    const d0 = R((await shop("getAgentAccount", cA(), { agentAccountId: accXA })).account);
    const a = await shop("updateAgentAccountProfile", ctxOf(tA, staff.EDIT), { agentAccountId: accXA, expectedUpdatedAt: d0.updatedAt, patch: { taxId: thaiTaxId(`0105${digits(8)}`), legalName: `${QC_MARK} should-not` } });
    const mid = await acc(accXA);
    const b = await shop("updateAgentAccountProfile", ctxOf(tA, staff.EDIT), { agentAccountId: accXA, expectedUpdatedAt: d0.updatedAt, patch: { legalName: `${QC_MARK} X legal A2 ${STAMP}` } });
    eq([a.code, mid?.legalName === appA.legalName, b.ok], ["FORBIDDEN", true, true], "ผล");
  });
  await st("SH-10", "อนุมัติ Z ที่ใบอนุญาตหมดอายุ ⇒ ACTIVE (ไม่บล็อก · warnings) · ตั้ง code PTD ซ้ำ ⇒ CODE_TAKEN · ปิด ⇒ CLOSED CLOSED_BY_SHOP · ประตู Z = null", async () => {
    const z = Z; ok(z && accZA, "ไม่มี Z");
    const r = await shop("approveAgentAccount", cA(), { agentAccountId: accZA });
    const d0 = R((await shop("getAgentAccount", cA(), { agentAccountId: accZA })).account);
    const t = await shop("updateAgentAccountProfile", cA(), { agentAccountId: accZA, expectedUpdatedAt: d0.updatedAt, patch: { code: "PTD" } });
    const c = await shop("closeAgentAccount", cA(), { agentAccountId: accZA });
    const a = await acc(accZA);
    eq([r.status, (d0.warnings as unknown[] ?? []).includes("LICENCE_EXPIRED"), t.code, a?.status, a?.statusReason, await AU("agentScope")(z!.token, { shopSlug: slugA })], ["ACTIVE", true, "CODE_TAKEN", "CLOSED", "CLOSED_BY_SHOP", null], "ผล");
    ok(c.ok === true, fmt(c));
  });
  await st("SH-11", "ปฏิเสธ R ⇒ CLOSED REJECTED · ไม่มี event approved · สมัครซ้ำทันที ⇒ BAD_STATE (รอ reapplyCooldownDays) · หลัง 7 วัน + 1 ⇒ PENDING แถวเดิม · Party เดิม", async () => {
    const r0 = RR; ok(r0 && accRA, "ไม่มี R");
    const j = await shop("rejectAgentAccount", cA(), { agentAccountId: accRA });
    const a = await acc(accRA);
    const now1 = R(await AU("agentApply")(r0!.token, { shopSlug: slugA, application: app({ legalName: `${QC_MARK} R again` }) }, meta()));
    const later = new Date(Date.now() + (lim("reapplyCooldownDays") + 1) * 86_400_000);
    const again = R(await AU("agentApply")(r0!.token, { shopSlug: slugA, application: app({ legalName: `${QC_MARK} R again` }) }, meta(later)));
    const b = await acc(accRA);
    eq([j.status, a?.statusReason, (await events(tA, "agency.account.approved")).filter((e) => R(e.payload).agentAccountId === accRA).length, now1.code, again.status, again.agentAccountId, b?.partyId === a?.partyId], ["CLOSED", "REJECTED", 0, "BAD_STATE", "PENDING", accRA, true], "ผล");
  });
  await st("SH-12", "lookupAgentIdentityByCode: รหัสของ X ⇒ identity 3 ช่อง {publicCode displayName status} · ผิดรูป/ไม่มีจริง ⇒ identity null · STAFF view (ไม่มี invite) ⇒ FORBIDDEN", async () => {
    const x = needX();
    const a = await shop("lookupAgentIdentityByCode", cA(), { publicCode: x.publicCode });
    const b = await shop("lookupAgentIdentityByCode", cA(), { publicCode: "AG-1" });
    const c = await shop("lookupAgentIdentityByCode", cA(), { publicCode: "AG-ZZZZZZ" === x.publicCode ? "AG-YYYYYY" : "AG-ZZZZZZ" });
    const f = await shop("lookupAgentIdentityByCode", ctxOf(tA, staff.VIEW), { publicCode: x.publicCode });
    eq([sortedKeys(a.identity), R(a.identity).publicCode, b.identity, c.identity, f.code], [["displayName", "publicCode", "status"], x.publicCode, null, null, "FORBIDDEN"], "ผล");
  });
  await st("SH-13", "rate limit ค้นรหัส: เจ้าของร้าน D คนที่สองค้นครบเพดาน lookupByCodePerActor แล้วครั้งถัดไป ⇒ RATE_LIMITED", async () => {
    needX();
    const n = lim("lookupByCodePerActor", "limit");
    let last: Rec = {};
    for (let i = 0; i <= n; i++) last = await shop("lookupAgentIdentityByCode", ctxOf(tD, staff.OD2), { publicCode: "AG-1" });
    eq(last.code, "RATE_LIMITED", `ครั้งที่ ${n + 1}`);
  });

  // ═══════════════ IN. เชิญ ═══════════════
  console.log("\n── IN: เชิญด้วยอีเมล / รหัสสาธารณะ ──");
  let W: Who | null = null, V: Who | null = null;
  let inv1: Rec = {}, accWA = "";
  const invEmail = (email: string, idem: string, o: Rec = {}) => ({ mode: "EMAIL", email, legalName: `${QC_MARK} invited ${hex(2)}`, payeeType: "TH_JURISTIC", idempotencyKey: idem, ...o });
  const idem1 = `qca12-${STAMP}-i1`;
  const body1 = invEmail(ew, idem1, { legalName: `${QC_MARK} W legal A` });
  await st("IN-1", "เชิญด้วยอีเมล ⇒ INVITED · identityId null · inviteToken ≥ 40 ตัว · inviteTokenHash = แฮช invite · contact.email + source SHOP · จดหมาย SHOP_INVITE มี token + url จาก origin แพลตฟอร์มคงที่ (APP_URL)", async () => {
    needBuilt();
    inv1 = await shop("inviteAgent", cA(), body1);
    ok(inv1.ok === true && inv1.status === "INVITED" && typeof inv1.inviteToken === "string" && String(inv1.inviteToken).length >= 40, fmt(inv1));
    allTokens.push(String(inv1.inviteToken));
    const a = await acc(String(inv1.agentAccountId));
    eq([a?.identityId, a?.inviteTokenHash, R(a?.contact).email, R(a?.contact).source], [null, authHash("invite", String(inv1.inviteToken)), ew, "SHOP"], "แถว");
    const m = lastMail(ew, "SHOP_INVITE");
    let origin = "http://localhost:3000"; try { origin = new URL(process.env.APP_URL || origin).origin; } catch { /* ค่าปริยาย */ }
    ok(m?.token === inv1.inviteToken && typeof m?.url === "string" && m.url.startsWith(origin) && m.url.includes(String(inv1.inviteToken)), `จดหมาย/ลิงก์ ${fmt(m)}`);
  });
  await st("IN-2", "เชิญด้วยอีเมลที่เป็นล็อกอินของเอเจนซี่อยู่แล้ว (X) ⇒ ผลชุดคีย์เดียวกับอีเมลใหม่ · INVITED · identityId null (ไม่มี 'อีเมลถูกใช้แล้ว')", async () => {
    needX();
    const r = await shop("inviteAgent", cA(), invEmail(ex, `qca12-${STAMP}-i2`));
    const a = await acc(String(r.agentAccountId));
    eq([sortedKeys(r), r.status, a?.identityId], [sortedKeys(inv1), "INVITED", null], "ผล");
    await shop("revokeAgentInvite", cA(), { agentAccountId: r.agentAccountId });
  });
  await st("IN-3", "ส่งคำเชิญซ้ำด้วยคีย์เดิม + เนื้อเดิม ⇒ id เดิม token เดิม replayed · แถวเดียว · คีย์เดิมเนื้อต่าง ⇒ IDEMPOTENCY_CONFLICT", async () => {
    ok(inv1.ok === true, "ไม่มีคำเชิญแรก");
    const r = await shop("inviteAgent", cA(), body1);
    const c = await shop("inviteAgent", cA(), { ...body1, legalName: `${QC_MARK} other` });
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1 AND contact->>'email' = $2`, [tA, ew]))[0]?.n;
    eq([r.agentAccountId, r.inviteToken, r.replayed, n, c.code], [inv1.agentAccountId, inv1.inviteToken, true, 1, "IDEMPOTENCY_CONFLICT"], "ผล");
  });
  await st("IN-4", "W (ตัวตนใหม่) รับคำเชิญด้วย token ⇒ ACTIVE · identityId = W · inviteTokenHash null · สมาชิก OWNER · event approved", async () => {
    ok(inv1.ok === true, "ไม่มีคำเชิญ");
    W = await signup(ew, "W");
    const r = R(await AU("agentAcceptInvite")(W.token, { shopSlug: slugA, inviteToken: inv1.inviteToken }, meta()));
    accWA = String(inv1.agentAccountId);
    const a = await acc(accWA);
    const m = await q<{ role: string }>(`SELECT role FROM "AgentAccountMember" WHERE "agentAccountId" = $1 AND "agentUserId" = $2 AND active`, [accWA, W.agentUserId]);
    eq([r.status, a?.identityId, a?.inviteTokenHash, m.map((x) => x.role)], ["ACTIVE", W.identityId, null, ["OWNER"]], "ผล");
    eq((await events(tA, "agency.account.approved")).filter((e) => R(e.payload).agentAccountId === accWA).length, 1, "event");
  });
  await st("IN-5", "ใช้ token เดิมซ้ำ (คนอื่น) ⇒ INVITE_INVALID", async () => {
    ok(inv1.ok === true, "ไม่มีคำเชิญ");
    V = await signup(mail("v"), "V");
    eq(R(await AU("agentAcceptInvite")(V.token, { shopSlug: slugA, inviteToken: inv1.inviteToken }, meta())).code, "INVITE_INVALID", "ผล");
  });
  await st("IN-6", "token หมดอายุ (now + shopInviteTtlDays + 1 วัน) ⇒ INVITE_INVALID · token ร้าน A ที่ส่งผ่าน slug ร้าน B ⇒ INVITE_INVALID · token แก้ 1 ตัวอักษร ⇒ INVITE_INVALID · แถวยัง INVITED", async () => {
    const v = V; ok(v, "ไม่มี V");
    const r = await shop("inviteAgent", cA(), invEmail(mail("i6"), `qca12-${STAMP}-i6`));
    const tok = String(r.inviteToken); allTokens.push(tok);
    const future = new Date(Date.now() + (lim("shopInviteTtlDays") + 1) * 86_400_000);
    const a = R(await AU("agentAcceptInvite")(v!.token, { shopSlug: slugA, inviteToken: tok }, meta(future)));
    const b = R(await AU("agentAcceptInvite")(v!.token, { shopSlug: slugB, inviteToken: tok }, meta()));
    const flip = `${tok.slice(0, -1)}${tok.endsWith("A") ? "B" : "A"}`;
    const c = R(await AU("agentAcceptInvite")(v!.token, { shopSlug: slugA, inviteToken: flip }, meta()));
    eq([a.code, b.code, c.code, (await acc(String(r.agentAccountId)))?.status], ["INVITE_INVALID", "INVITE_INVALID", "INVITE_INVALID", "INVITED"], "ผล");
    await shop("revokeAgentInvite", cA(), { agentAccountId: r.agentAccountId });
  });
  await st("IN-7", "ออกคำเชิญใหม่ ⇒ token ใหม่ · token เก่า INVITE_INVALID · ถอน ⇒ CLOSED INVITE_REVOKED · token ใหม่ INVITE_INVALID", async () => {
    const v = V; ok(v, "ไม่มี V");
    const r = await shop("inviteAgent", cA(), invEmail(mail("i7"), `qca12-${STAMP}-i7`));
    const t1 = String(r.inviteToken);
    const re = await shop("reissueAgentInvite", cA(), { agentAccountId: r.agentAccountId });
    const t2 = String(re.inviteToken); allTokens.push(t1, t2);
    const a = R(await AU("agentAcceptInvite")(v!.token, { shopSlug: slugA, inviteToken: t1 }, meta()));
    const rv = await shop("revokeAgentInvite", cA(), { agentAccountId: r.agentAccountId });
    const b = R(await AU("agentAcceptInvite")(v!.token, { shopSlug: slugA, inviteToken: t2 }, meta()));
    const row = await acc(String(r.agentAccountId));
    eq([t1 !== t2, a.code, rv.status, row?.statusReason, b.code], [true, "INVITE_INVALID", "CLOSED", "INVITE_REVOKED", "INVITE_INVALID"], "ผล");
  });
  await st("IN-8", "เชิญด้วยรหัส: X ที่ร้าน A (มีแถวแล้ว) ⇒ ALREADY_REGISTERED · W ที่ร้าน B ⇒ INVITED identityId=W inviteToken null · W เห็นใน myAgentAccounts แล้วรับโดยไม่มี token ⇒ ACTIVE", async () => {
    const x = needX(), w = W; ok(w, "ไม่มี W");
    const a = await shop("inviteAgent", cA(), { mode: "CODE", publicCode: x.publicCode, legalName: `${QC_MARK} x again`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-i8a` });
    const b = await shop("inviteAgent", cB(), { mode: "CODE", publicCode: w!.publicCode, legalName: `${QC_MARK} W legal B`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-i8b` });
    const mine = R(await AU("myAgentAccounts")(w!.token));
    const seen = ((mine.items as Rec[]) ?? []).find((i) => i.agentAccountId === b.agentAccountId);
    const acc2 = R(await AU("agentAcceptInvite")(w!.token, { shopSlug: slugB }, meta()));
    const row = await acc(String(b.agentAccountId));
    eq([a.code, b.status, b.inviteToken, seen?.status, acc2.status, acc2.agentAccountId, row?.identityId, row?.status], ["ALREADY_REGISTERED", "INVITED", null, "INVITED", "ACTIVE", b.agentAccountId, w!.identityId, "ACTIVE"], "ผล");
  });
  await st("IN-9", "X ถือ token ของร้านที่ X มีบัญชีแล้ว ⇒ ALREADY_LINKED (token ไม่ถูกใช้) · V (อีเมลล็อกอินไม่ตรงอีเมลที่เชิญ) รับ ⇒ PENDING ไม่ใช่ ACTIVE + event applied · ร้านอนุมัติ ⇒ ACTIVE", async () => {
    const x = needX(), v = V; ok(v, "ไม่มี V");
    const r = await shop("inviteAgent", cA(), invEmail(mail("i9"), `qca12-${STAMP}-i9`));
    const tok = String(r.inviteToken); allTokens.push(tok);
    const a = R(await AU("agentAcceptInvite")(x.token, { shopSlug: slugA, inviteToken: tok }, meta()));
    const still = (await acc(String(r.agentAccountId)))?.inviteTokenHash;
    const b = R(await AU("agentAcceptInvite")(v!.token, { shopSlug: slugA, inviteToken: tok }, meta()));
    const applied = (await events(tA, "agency.account.applied")).filter((e) => R(e.payload).agentAccountId === r.agentAccountId).length;
    const ap = await shop("approveAgentAccount", cA(), { agentAccountId: r.agentAccountId });
    eq([a.code, still === authHash("invite", tok), b.status, applied, ap.status], ["ALREADY_LINKED", true, "PENDING", 1, "ACTIVE"], "ผล");
  });

  // ═══════════════ M. ผู้ใช้และบทบาท ═══════════════
  console.log("\n── M: ผู้ใช้ · บทบาท · เจ้าของคนสุดท้าย · ลบตาม PDPA ──");
  let Y: Who | null = null, Z2: Who | null = null, T1: Who | null = null, T2: Who | null = null;
  await st("M-1", "X เชิญเพื่อน Y (SALES) ⇒ token + จดหมาย TEAMMATE_INVITE · Y ยืนยันรหัสพร้อม token ⇒ created TEAMMATE · AgentUser ของ Y อยู่ตัวตน X role SALES", async () => {
    const x = needX();
    const ti = R(await AU("createTeammateInvite")(x.token, { email: ey, role: "SALES" }, meta(undefined, undefined, undefined, OPEN_DEPS)));
    ok(ti.ok === true && lastMail(ey, "TEAMMATE_INVITE")?.token === ti.teammateToken, fmt(ti));
    allTokens.push(String(ti.teammateToken));
    const r1 = await reqCode(ey);
    const v = await verify({ email: ey, codeId: r1.codeId, code: lastMail(ey, "LOGIN_CODE")?.code, teammateInvite: ti.teammateToken, teammateName: `${QC_MARK} Y` });
    ok(v.ok === true && v.created === "TEAMMATE", fmt(v));
    Y = { email: ey, token: String(v.token), agentUserId: String(R(await AU("resolveAgentSession")(String(v.token))).agentUserId) /* ORACLE-EDIT (ผู้คุม): verify ไม่คืน agentUserId (§5.1 · A-3) — อ่านจาก session */, identityId: x.identityId, publicCode: x.publicCode };
    const u = (await q<{ identityId: string; role: string }>(`SELECT "identityId", role FROM "AgentUser" WHERE id = $1`, [Y.agentUserId]))[0];
    eq([u?.identityId, u?.role], [x.identityId, "SALES"], "ผู้ใช้");
  });
  await st("M-2", "token เพื่อนแก้ 1 ตัว ⇒ INVITE_INVALID · หมดอายุ (ยืนยัน ณ +teammateInviteTtlMin+60 นาที) ⇒ INVITE_INVALID · ไม่สร้างผู้ใช้", async () => {
    const x = needX();
    const e = mail("m2");
    const ti = R(await AU("createTeammateInvite")(x.token, { email: e, role: "SALES" }, meta(undefined, undefined, undefined, OPEN_DEPS)));
    const tok = String(ti.teammateToken); allTokens.push(tok);
    const flip = `${tok.slice(0, -2)}${tok.endsWith("AA") ? "BB" : "AA"}`;
    const r1 = await reqCode(e);
    const a = await verify({ email: e, codeId: r1.codeId, code: lastMail(e, "LOGIN_CODE")?.code, teammateInvite: flip, teammateName: `${QC_MARK} m2` });
    const later = new Date(Date.now() + (lim("teammateInviteTtlMin") + 60) * 60_000);
    const r2 = await reqCode(e, meta(later));
    const b = await verify({ email: e, codeId: r2.codeId, code: lastMail(e, "LOGIN_CODE")?.code, teammateInvite: tok, teammateName: `${QC_MARK} m2` }, meta(new Date(later.getTime() + 1000)));
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLogin" WHERE subject = $1`, [e]))[0]?.n;
    eq([a.code, b.code, n], ["INVITE_INVALID", "INVITE_INVALID", 0], "ผล");
  });
  await st("M-3", "เชิญเพื่อนด้วยอีเมลที่มีเจ้าของแล้ว (W) ⇒ ผู้เชิญได้ผลปกติ (ไม่รู้) · W ยืนยันพร้อม token ⇒ LOGIN_UNAVAILABLE · W ยังอยู่ตัวตนเดิม", async () => {
    const x = needX(), w = W; ok(w, "ไม่มี W");
    const ti = R(await AU("createTeammateInvite")(x.token, { email: ew, role: "SALES" }, meta(undefined, undefined, undefined, OPEN_DEPS)));
    ok(ti.ok === true, `ผู้เชิญต้องได้ผลปกติ: ${fmt(ti)}`);
    allTokens.push(String(ti.teammateToken));
    const r1 = await reqCode(ew);
    const v = await verify({ email: ew, codeId: r1.codeId, code: lastMail(ew, "LOGIN_CODE")?.code, teammateInvite: ti.teammateToken, teammateName: `${QC_MARK} hijack` });
    const u = (await q<{ identityId: string }>(`SELECT u."identityId" FROM "AgentLogin" l JOIN "AgentUser" u ON u.id = l."agentUserId" WHERE l.subject = $1`, [ew]));
    eq([v.code, u.map((r) => r.identityId)], ["LOGIN_UNAVAILABLE", [w!.identityId]], "ผล");
  });
  await st("M-4", "Y (SALES) สมัครร้าน ⇒ FORBIDDEN · เชิญเพื่อน ⇒ FORBIDDEN", async () => {
    const y = Y; ok(y, "ไม่มี Y");
    const a = R(await AU("agentApply")(y!.token, { shopSlug: slugD, application: app() }, meta()));
    const b = R(await AU("createTeammateInvite")(y!.token, { email: mail("m4"), role: "SALES" }, meta(undefined, undefined, undefined, OPEN_DEPS)));
    eq([a.code, b.code], ["FORBIDDEN", "FORBIDDEN"], "ผล");
  });
  await st("M-5", "X เพิ่ม Y เป็นสมาชิกบัญชีร้าน B (SALES) ⇒ แถวสมาชิกในร้าน B · myAgentAccounts(Y) = ร้าน B เท่านั้น", async () => {
    const x = needX(), y = Y; ok(y, "ไม่มี Y");
    const r = R(await AS("setAgentAccountMember")({ agentUserId: x.agentUserId }, { agentAccountId: accXB, agentUserId: y!.agentUserId, role: "SALES" }));
    ok(r.ok === true, fmt(r));
    const m = await q<{ tenantId: string; role: string; active: boolean }>(`SELECT "tenantId", role, active FROM "AgentAccountMember" WHERE "agentAccountId" = $1 AND "agentUserId" = $2`, [accXB, y!.agentUserId]);
    const mine = R(await AU("myAgentAccounts")(y!.token));
    eq([m, ((mine.items as Rec[]) ?? []).map((i) => i.agentAccountId)], [[{ tenantId: tB, role: "SALES", active: true }], [accXB]], "ผล");
  });
  await st("M-6", "Z2 (ADMIN) ให้ OWNER ไม่ได้: สมาชิก OWNER ⇒ FORBIDDEN · เลื่อน Y เป็น OWNER ⇒ FORBIDDEN · เชิญเพื่อน OWNER ⇒ FORBIDDEN", async () => {
    const x = needX(), y = Y; ok(y, "ไม่มี Y");
    Z2 = await teammate(x, mail("z2"), "ADMIN", "Z2");
    const a = R(await AS("setAgentAccountMember")({ agentUserId: Z2.agentUserId }, { agentAccountId: accXB, agentUserId: y!.agentUserId, role: "OWNER" }));
    const b = R(await AS("setAgentUserRole")({ agentUserId: Z2.agentUserId }, { targetUserId: y!.agentUserId, role: "OWNER" }));
    const c = R(await AU("createTeammateInvite")(Z2.token, { email: mail("m6"), role: "OWNER" }, meta(undefined, undefined, undefined, OPEN_DEPS)));
    eq([a.code, b.code, c.code], ["FORBIDDEN", "FORBIDDEN", "FORBIDDEN"], "ผล");
  });
  await st("M-7", "เจ้าของคนสุดท้ายของตัวตน: X ลดตัวเองเป็น ADMIN ⇒ LAST_OWNER · role ยัง OWNER", async () => {
    const x = needX();
    const r = R(await AS("setAgentUserRole")({ agentUserId: x.agentUserId }, { targetUserId: x.agentUserId, role: "ADMIN" }));
    eq([r.code, (await q<{ role: string }>(`SELECT role FROM "AgentUser" WHERE id = $1`, [x.agentUserId]))[0]?.role], ["LAST_OWNER", "OWNER"], "ผล");
  });
  await st("M-8", "เจ้าของคนสุดท้ายของบัญชี: ถอด X ออกจากบัญชีร้าน A ⇒ LAST_OWNER · สมาชิกยัง active", async () => {
    const x = needX();
    const r = R(await AS("setAgentAccountMember")({ agentUserId: x.agentUserId }, { agentAccountId: accXA, agentUserId: x.agentUserId, role: null }));
    eq([r.code, (await q<{ active: boolean }>(`SELECT active FROM "AgentAccountMember" WHERE "agentAccountId" = $1 AND "agentUserId" = $2`, [accXA, x.agentUserId]))[0]?.active], ["LAST_OWNER", true], "ผล");
  });
  await st("M-9", "ปิดผู้ใช้ T2 ⇒ DISABLED · ทุก session revokedAt · resolve = null · ประตูร้าน B = null", async () => {
    const x = needX();
    T2 = await teammate(x, mail("t2"), "SALES", "T2");
    R(await AS("setAgentAccountMember")({ agentUserId: x.agentUserId }, { agentAccountId: accXB, agentUserId: T2.agentUserId, role: "SALES" }));
    ok(await AU("agentScope")(T2.token, { shopSlug: slugB }), "ก่อนปิดต้องเข้าได้");
    const r = R(await AS("disableAgentUser")({ agentUserId: x.agentUserId }, { targetUserId: T2.agentUserId }));
    const s = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1 AND "revokedAt" IS NULL`, [T2.agentUserId]);
    eq([r.ok, s[0]?.n, await AU("resolveAgentSession")(T2.token), await AU("agentScope")(T2.token, { shopSlug: slugB })], [true, 0, null, null], "ผล");
  });
  await st("M-10", "ถอดสมาชิก T1 จากบัญชีร้าน B ⇒ active false · activeAgentAccountId ของ session ถูกล้าง · ประตูร้าน B = null", async () => {
    const x = needX();
    T1 = await teammate(x, mail("t1"), "SALES", "T1");
    R(await AS("setAgentAccountMember")({ agentUserId: x.agentUserId }, { agentAccountId: accXB, agentUserId: T1.agentUserId, role: "SALES" }));
    const sel = R(await AU("selectAgentAccount")(T1.token, { shopSlug: slugB }));
    ok(sel.ok === true && sel.agentAccountId === accXB, `เลือกร้าน: ${fmt(sel)}`);
    const r = R(await AS("setAgentAccountMember")({ agentUserId: x.agentUserId }, { agentAccountId: accXB, agentUserId: T1.agentUserId, role: null }));
    const m = (await q<{ active: boolean }>(`SELECT active FROM "AgentAccountMember" WHERE "agentAccountId" = $1 AND "agentUserId" = $2`, [accXB, T1.agentUserId]))[0];
    const s = (await q<{ a: string | null }>(`SELECT "activeAgentAccountId" AS a FROM "AgentSession" WHERE "tokenHash" = $1`, [authHash("session", T1.token)]))[0];
    eq([r.ok, m?.active, s?.a, await AU("agentScope")(T1.token, { shopSlug: slugB })], [true, false, null, null], "ผล");
  });
  await st("M-11", "ลบ Z2 ตาม PDPA ⇒ ERASED · ชื่อแทน (ไม่ขึ้นต้น QCA12) · ไม่มี AgentLogin/AgentSession/AgentLoginCode ของอีเมลนั้น · สมาชิก inactive · แถวสมุดของร้าน B ไม่ถูกแตะ + ค่าคงที่สมุดไม่เพี้ยน", async () => {
    const x = needX(), z2 = Z2; ok(z2, "ไม่มี Z2");
    R(await AS("setAgentAccountMember")({ agentUserId: x.agentUserId }, { agentAccountId: accXB, agentUserId: z2!.agentUserId, role: "ADMIN" }));
    await pool.query(`INSERT INTO "AgentBalance" ("agentAccountId","tenantId","balanceSatang","lastSeq","version","updatedAt") VALUES ($1,$2,100,1,1,now()) ON CONFLICT ("agentAccountId") DO UPDATE SET "balanceSatang" = 100, "lastSeq" = 1`, [accXB, tB]);
    const leId = rid("le");
    await ins("AgentLedgerEntry", { id: leId, tenantId: tB, agentAccountId: accXB, seq: 1, kind: "ADJUSTMENT", amountSatang: 100, currency: "THB", approvalId: "qca12", reason: "qc", idempotencyKey: `qca12-le-${STAMP}`, actorId: z2!.agentUserId });
    const r = R(await AS("eraseAgentUser")({ agentUserId: x.agentUserId }, { targetUserId: z2!.agentUserId }));
    const u = (await q<{ status: string; displayName: string; lastLoginAt: Date | null }>(`SELECT status, "displayName", "lastLoginAt" FROM "AgentUser" WHERE id = $1`, [z2!.agentUserId]))[0];
    const n = (await q<{ l: number; s: number; m: number; e: number }>(`SELECT (SELECT count(*)::int FROM "AgentLogin" WHERE "agentUserId" = $1) AS l, (SELECT count(*)::int FROM "AgentSession" WHERE "agentUserId" = $1) AS s,
      (SELECT count(*)::int FROM "AgentAccountMember" WHERE "agentUserId" = $1 AND active) AS m, (SELECT count(*)::int FROM "AgentLedgerEntry" WHERE id = $2) AS e`, [z2!.agentUserId, leId]))[0];
    const codes = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLoginCode" WHERE target = $1`, [authHash("login-target", mail("z2"))]))[0]?.n;
    eq([r.ok, u?.status, u?.displayName.startsWith(QC_MARK), u?.lastLoginAt, n?.l, n?.s, n?.m, n?.e, codes], [true, "ERASED", false, null, 0, 0, 0, 1, 0], "ผล");
    const drift = fnOf(need(INVM, "trips-agency-invariants"), "agencyBalanceDrift", "invariants");
    eq(await drift((sql: string, p?: unknown[]) => pool.query(sql, p), [tB]), [], "drift");
  });

  await st("M-13", "token เพื่อนของผู้เชิญที่ถูกปิด (Z3 DISABLED) หรือถูกลดเป็น SALES (Z4) ⇒ INVITE_INVALID · ไม่สร้างผู้ใช้", async () => {
    const x = needX();
    const z3 = await teammate(x, mail("z3"), "ADMIN", "Z3");
    const z4 = await teammate(x, mail("z4"), "ADMIN", "Z4");
    const e1 = mail("m13a"), e2 = mail("m13b");
    const t1 = R(await AU("createTeammateInvite")(z3.token, { email: e1, role: "SALES" }, meta(undefined, undefined, undefined, OPEN_DEPS)));
    const t2 = R(await AU("createTeammateInvite")(z4.token, { email: e2, role: "SALES" }, meta(undefined, undefined, undefined, OPEN_DEPS)));
    ok(t1.ok === true && t2.ok === true, `เชิญ ${fmt([t1, t2])}`);
    allTokens.push(String(t1.teammateToken), String(t2.teammateToken));
    R(await AS("disableAgentUser")({ agentUserId: x.agentUserId }, { targetUserId: z3.agentUserId }));
    R(await AS("setAgentUserRole")({ agentUserId: x.agentUserId }, { targetUserId: z4.agentUserId, role: "SALES" }));
    const red = async (e: string, tok: unknown) => { const r = await reqCode(e); return verify({ email: e, codeId: r.codeId, code: lastMail(e, "LOGIN_CODE")?.code, teammateInvite: tok, teammateName: `${QC_MARK} m13` }); };
    const a = await red(e1, t1.teammateToken), b = await red(e2, t2.teammateToken);
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLogin" WHERE subject = ANY($1::text[])`, [[e1, e2]]))[0]?.n;
    eq([a.code, b.code, n], ["INVITE_INVALID", "INVITE_INVALID", 0], "ผล");
  });

  // ═══════════════ P. ความเป็นส่วนตัวสองร้าน ═══════════════
  console.log("\n── P: ร้าน A ไม่รู้เรื่องร้าน B ──");
  const needlesB = () => [legalB, contactNameB, contactEmailB, licenceB, tB, accXB, ex, ey, slugB];
  await st("P-1", "รายการ + รายละเอียดของร้าน A ไม่มีเครื่องหมาย/ค่าใดของร้าน B (ชื่อ · อีเมลติดต่อ · ใบอนุญาต · tenantId · id บัญชี · อีเมลล็อกอิน X/Y · slug)", async () => {
    needX();
    const l = await shop("listAgentAccounts", cA(), {});
    const d = await shop("getAgentAccount", cA(), { agentAccountId: accXA });
    eq(leaks(JSON.stringify([l, d]), needlesB()), [], "รั่ว");
  });
  await st("P-2", "คีย์ต้องห้าม (NEVER_SHOW_TO_SHOP_KEYS) ไม่มีในผลทุกตัวที่ร้าน A ได้รับตลอดการรัน", () => {
    needX();
    const bad = new Set<string>();
    for (const s of seenByA) { try { for (const k of keysDeep(JSON.parse(s))) if (NEVER.includes(k)) bad.add(k); } catch { /* ignore */ } }
    eq([...bad], [], "คีย์");
  });
  await st("P-3", "สมาชิกในรายละเอียดของร้าน A = สมาชิกของบัญชีร้าน A เท่านั้น (Y/T1/T2/Z2 อยู่แค่ร้าน B ไม่โผล่) · memberCount = 1", async () => {
    needX();
    const d = R((await shop("getAgentAccount", cA(), { agentAccountId: accXA })).account);
    const names = ((d.members as Rec[]) ?? []).map((m) => String(m.displayName));
    eq([names.length, names.some((n) => / Y$| T1$| T2$| Z2$/.test(n))], [1, false], "สมาชิก");
  });
  await st("P-4", "AuditLog ของร้าน A: ไม่มีเครื่องหมายร้าน B · ไม่มี token ใด ๆ · ไม่มีอีเมลล็อกอิน · after ⊂ คีย์ที่อนุญาต", async () => {
    needX();
    const rows = await audits(tA);
    ok(rows.length > 0, "ไม่มี audit");
    eq(leaks(JSON.stringify(rows), [...needlesB(), ...allTokens, ew]), [], "รั่ว");
    ok(rows.every((r) => Object.keys(R(r.after)).every((k) => AUDIT_AFTER_KEYS.includes(k))), "after");
  });
  await st("P-5", "OutboxEvent agency.* ของร้าน A: payload = {agentAccountId} ทุกแถว · ไม่มีเครื่องหมายร้าน B · idempotencyKey ไม่มีอีเมล/token", async () => {
    needX();
    const ev = await events(tA);
    ok(ev.length > 0 && ev.every((e) => isDeepStrictEqual(sortedKeys(e.payload), ["agentAccountId"])), `payload ${fmt(ev.map((e) => e.payload))}`);
    eq(leaks(JSON.stringify(ev), [...needlesB(), ...allTokens, ew]), [], "รั่ว");
  });
  await st("P-6", "OpsEvent ตั้งแต่เริ่มรัน: ไม่มีอีเมลล็อกอิน · token · ชื่อ/เครื่องหมาย", async () => {
    needX();
    const rows = await q<{ j: string }>(`SELECT row_to_json(o)::text AS j FROM "OpsEvent" o WHERE "createdAt" >= $1`, [RUN_START]);
    eq(leaks(rows.map((r) => r.j).join("\n"), [...needlesB(), ...allTokens, ew, mail("v"), mail("z"), mail("r")]), [], "รั่ว");
  });
  await st("P-7", "ผล error ทุกตัวที่ร้าน A ได้รับไม่มีค่าของร้าน B", () => {
    needX();
    eq(leaks(seenByA.filter((s) => s.includes('"ok":false')).join("\n"), needlesB()), [], "รั่ว");
  });
  await st("P-8", "Y (สมาชิกเฉพาะร้าน B): ประตูร้าน A = null เหมือนร้านที่ไม่มีจริง · selectAgentAccount ร้าน A = NOT_FOUND รหัส+ข้อความเดียวกับร้านที่ไม่มีจริง", async () => {
    const y = Y; ok(y, "ไม่มี Y");
    const a = await AU("agentScope")(y!.token, { shopSlug: slugA }), b = await AU("agentScope")(y!.token, { shopSlug: slugNone });
    const c = R(await AU("selectAgentAccount")(y!.token, { shopSlug: slugA })), d = R(await AU("selectAgentAccount")(y!.token, { shopSlug: slugNone }));
    eq([a, b, c.code, c.message === d.message, d.code], [null, null, "NOT_FOUND", true, "NOT_FOUND"], "ผล");
    ok(R(await AU("agentScope")(y!.token, { shopSlug: slugB })).agentAccountId === accXB, "ร้าน B ต้องเข้าได้");
  });
  await st("P-9", "เชิญด้วยรหัสที่ร้าน D: X (มีบัญชีที่ A/B) กับตัวตนใหม่ ⇒ ผลชุดคีย์เดียวกัน · INVITED ทั้งคู่ · inviteToken null", async () => {
    const x = needX();
    const v0 = R(await AG("createAgentIdentity")({ displayName: `${QC_MARK} v0 ${STAMP}`, owner: { displayName: `${QC_MARK} v0 owner`, login: { kind: "EMAIL", providerId: "email", subject: mail("v0") } } }));
    createdIdentityIds.push(String(R(v0.identity).id)); createdUserIds.push(String(v0.agentUserId)); usedEmails.push(mail("v0"));
    const a = await shop("inviteAgent", cD(), { mode: "CODE", publicCode: x.publicCode, legalName: `${QC_MARK} d-x`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-p9a` });
    const b = await shop("inviteAgent", cD(), { mode: "CODE", publicCode: R(v0.identity).publicCode, legalName: `${QC_MARK} d-v0`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-p9b` });
    eq([sortedKeys(a), a.status, b.status, a.inviteToken, b.inviteToken], [sortedKeys(b), "INVITED", "INVITED", null, null], "ผล");
  });
  await st("P-10", "myAgentAccounts(X) เห็นทั้งร้านของตัวเอง (A · B · D-INVITED) · ผลของเอเจนซี่เองไม่มีคีย์ภายใน (tokenHash/codeHash/providerId)", async () => {
    const x = needX();
    const r = R(await AU("myAgentAccounts")(x.token));
    const slugs = ((r.items as Rec[]) ?? []).map((i) => i.shopSlug).sort();
    eq(slugs, [slugA, slugB, slugD].sort(), "ร้าน");
    eq([...keysDeep(r)].filter((k) => ["tokenHash", "codeHash", "providerId", "taxIdHash"].includes(k)), [], "คีย์ภายใน");
  });

  await st("P-11", "ประตูต่อร้าน agentScope(X, A) คืน {agentAccountId memberId role tenantId} ตรงตัว · memberId = แถวสมาชิกของร้าน A · ไม่มี agentUserId/identityId ทั้งคีย์และค่า", async () => {
    const x = needX();
    const sc = R(await AU("agentScope")(x.token, { shopSlug: slugA }));
    const mid = (await q<{ id: string }>(`SELECT id FROM "AgentAccountMember" WHERE "agentAccountId" = $1 AND "agentUserId" = $2`, [accXA, x.agentUserId]))[0]?.id;
    eq([sortedKeys(sc), sc.agentAccountId, sc.memberId, sc.tenantId], [["agentAccountId", "memberId", "role", "tenantId"], accXA, mid, tA], "ผล");
    eq(leaks(JSON.stringify(sc), [x.agentUserId, x.identityId]), [], "id global");
  });

  // ═══════════════ PY. Party / CRM ═══════════════
  console.log("\n── PY: Party · CRM ──");
  await st("PY-1", "Party ของบัญชี X ที่ร้าน A: อยู่ร้าน A · ชื่อ = ชื่อในใบสมัคร · ไม่มีอีเมล/เบอร์/เลขภาษี (ไม่จับคู่ลูกค้าเดิม) · ชนิด COMPANY", async () => {
    needX();
    const a = await acc(accXA);
    const p = (await q<Rec>(`SELECT "tenantId", name, email, phone, "taxId", kind::text AS kind FROM "Party" WHERE id = $1`, [String(a?.partyId)]))[0];
    eq([p?.tenantId, p?.name, p?.email ?? null, p?.phone ?? null, p?.taxId ?? null, p?.kind], [tA, appA.legalName, null, null, null, "COMPANY"], "Party");
  });
  await st("PY-2", "Party ของบัญชีร้าน B คนละแถว อยู่ร้าน B (ไม่ข้ามร้าน)", async () => {
    needX();
    const a = await acc(accXA), b = await acc(accXB);
    const pb = (await q<{ tenantId: string }>(`SELECT "tenantId" FROM "Party" WHERE id = $1`, [String(b?.partyId)]))[0];
    eq([a?.partyId !== b?.partyId, pb?.tenantId], [true, tB], "Party");
  });
  await st("PY-3", "ผูกบริษัท CRM ในร้านที่ไม่มีระบบ CRM ⇒ CRM_NOT_AVAILABLE · crmCompanyId ยัง null · ผู้ไม่มีสิทธิ์ edit ⇒ FORBIDDEN", async () => {
    needX();
    const r = await shop("linkAgentCrmCompany", cA(), { agentAccountId: accXA, crmCompanyId: rid("crm") });
    const f = await shop("linkAgentCrmCompany", ctxOf(tA, staff.VIEW), { agentAccountId: accXA, crmCompanyId: rid("crm") });
    eq([r.code, (await acc(accXA))?.crmCompanyId, f.code], ["CRM_NOT_AVAILABLE", null, "FORBIDDEN"], "ผล");
  });
  await st("PY-4", "เลิกผูกเมื่อไม่ได้ผูก ⇒ ok replayed · DTO crm = null", async () => {
    needX();
    const r = await shop("unlinkAgentCrmCompany", cA(), { agentAccountId: accXA });
    eq([r.ok, r.replayed, R(r.account).crm], [true, true, null], "ผล");
  });

  // ═══════════════ C. พร้อมกัน ═══════════════
  console.log("\n── C: พร้อมกัน ──");
  const settle = async (ps: Promise<unknown>[]) => (await Promise.allSettled(ps)).map((s) => (s.status === "fulfilled" ? R(s.value) : { threw: errMsg(s.reason) } as Rec));
  await st("C-1", "สมัครซ้อน 8 คำขอ (ตัวตนเดียว ร้าน D) ⇒ 1 แถว · ok ทุกตัว (สร้าง 1 + replayed 7) · event applied 1 · ไม่มี throw", async () => {
    needBuilt();
    const v = await mkIdent("c1");
    const rs = await settle(Array.from({ length: 8 }, () => AS("applyToShop")({ agentUserId: v.agentUserId }, { tenantId: tD, application: app() })));
    const rows = await q<{ id: string }>(`SELECT id FROM "AgentAccount" WHERE "tenantId" = $1 AND "identityId" = $2`, [tD, v.identityId]);
    eq([rows.length, rs.filter((r) => r.ok === true).length, rs.filter((r) => r.ok === true && r.replayed === false).length, rs.filter((r) => r.threw).length], [1, 8, 1, 0], "ผล");
    eq((await events(tD, "agency.account.applied")).filter((e) => R(e.payload).agentAccountId === rows[0]?.id).length, 1, "event");
  });
  await st("C-2", "สมัคร ∥ เชิญด้วยรหัส (5 ตัวตน · ร้าน D) ⇒ ตัวตนละ 1 แถวพอดี · ไม่มี throw/BUSY · อย่างน้อยหนึ่งฝั่ง ok ต่อคู่", async () => {
    needBuilt();
    const ids = await Promise.all([1, 2, 3, 4, 5].map((i) => mkIdent(`c2-${i}`)));
    const out = await Promise.all(ids.map(async (v, i) => settle([
      AS("applyToShop")({ agentUserId: v.agentUserId }, { tenantId: tD, application: app() }),
      AG("inviteAgent")(cD(), { mode: "CODE", publicCode: v.publicCode, legalName: `${QC_MARK} c2`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-c2-${i}` }, { deps }),
    ])));
    const counts = await Promise.all(ids.map(async (v) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1 AND "identityId" = $2`, [tD, v.identityId]))[0]?.n));
    eq(counts, [1, 1, 1, 1, 1], "แถวต่อตัวตน");
    ok(out.every((pair) => pair.every((r) => !r.threw && r.code !== "BUSY") && pair.some((r) => r.ok === true)), `ผล ${fmt(out)}`);
  });
  await st("C-3", "อนุมัติ ∥ ปฏิเสธ (5 บัญชี PENDING) ⇒ ok ฝั่งเดียวต่อบัญชี (อีกฝั่ง BAD_STATE) · สถานะตรงกับฝั่งที่ชนะ · event approved = จำนวนที่อนุมัติชนะ", async () => {
    needBuilt();
    const ids = await Promise.all([1, 2, 3, 4, 5].map((i) => mkIdent(`c3-${i}`)));
    const accs: string[] = [];
    for (const v of ids) accs.push(String(R(await AS("applyToShop")({ agentUserId: v.agentUserId }, { tenantId: tD, application: app() })).agentAccountId));
    const exp = await Promise.all(accs.map((a) => withExpected("approveAgentAccount", { agentAccountId: a })));
    const out = await Promise.all(accs.map((a, i) => settle([AG("approveAgentAccount")(cD(), exp[i]), AG("rejectAgentAccount")(cD(), exp[i])])));
    let approvedWins = 0;
    for (let i = 0; i < accs.length; i++) {
      const [ap, rj] = out[i];
      ok([ap, rj].filter((r) => r.ok === true).length === 1 && [ap, rj].filter((r) => r.code === "BAD_STATE").length === 1, `คู่ ${i}: ${fmt(out[i])}`);
      const s = (await acc(accs[i]))?.status;
      ok(ap.ok === true ? s === "ACTIVE" : s === "CLOSED", `สถานะ ${i} ${s}`);
      if (ap.ok === true) approvedWins++;
    }
    eq((await events(tD, "agency.account.approved")).filter((e) => accs.includes(String(R(e.payload).agentAccountId))).length, approvedWins, "event");
  });
  await st("C-4", "รับคำเชิญ ∥ ถอนคำเชิญ (5 คำเชิญอีเมล · อีเมลตรงล็อกอินผู้รับ) ⇒ ok ฝั่งเดียว · สถานะ ACTIVE ⇔ รับชนะ · CLOSED INVITE_REVOKED ⇔ ถอนชนะ", async () => {
    needBuilt();
    const ids = await Promise.all([1, 2, 3, 4, 5].map((i) => mkIdent(`c4-${i}`)));
    const invs: Rec[] = [];
    for (let i = 0; i < 5; i++) { const r = R(await AG("inviteAgent")(cD(), invEmail(mail(`c4-${i + 1}`), `qca12-${STAMP}-c4-${i}`), { deps })); allTokens.push(String(r.inviteToken)); invs.push(r); }
    const out = await Promise.all(invs.map((inv, i) => settle([AS("acceptShopInvite")({ agentUserId: ids[i].agentUserId }, { tenantId: tD, inviteToken: inv.inviteToken }), AG("revokeAgentInvite")(cD(), { agentAccountId: inv.agentAccountId })])));
    for (let i = 0; i < 5; i++) {
      const [ac, rv] = out[i];
      ok([ac, rv].filter((r) => r.ok === true).length === 1 && [ac, rv].every((r) => !r.threw), `คู่ ${i}: ${fmt(out[i])}`);
      const a = await acc(String(invs[i].agentAccountId));
      ok(ac.ok === true ? a?.status === "ACTIVE" && a?.identityId === ids[i].identityId : a?.status === "CLOSED" && a?.statusReason === "INVITE_REVOKED", `สถานะ ${i}: ${fmt([a?.status, a?.statusReason])}`);
    }
  });
  await st("C-5", "OWNER สองคนลดบทบาทกันพร้อมกัน (×3 รอบ) ⇒ เหลือ OWNER ≥ 1 ทุกรอบ · ok ไม่เกิน 1 ต่อรอบ", async () => {
    needBuilt();
    for (let round = 0; round < 3; round++) {
      const o1 = await mkIdent(`c5-${round}`);
      const w1 = await login(mail(`c5-${round}`));
      const o2 = await teammate(w1, mail(`c5b-${round}`), "OWNER", `c5b-${round}`);
      const out = await settle([
        AS("setAgentUserRole")({ agentUserId: o1.agentUserId }, { targetUserId: o2.agentUserId, role: "ADMIN" }),
        AS("setAgentUserRole")({ agentUserId: o2.agentUserId }, { targetUserId: o1.agentUserId, role: "ADMIN" }),
      ]);
      const owners = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentUser" WHERE "identityId" = $1 AND role = 'OWNER' AND status = 'ACTIVE'`, [o1.identityId]))[0]?.n ?? 0;
      ok(owners >= 1 && out.filter((r) => r.ok === true).length <= 1 && out.every((r) => !r.threw), `รอบ ${round}: owners ${owners} ${fmt(out)}`);
    }
  });
  await st("C-6", "เดารหัสผิดพร้อมกัน 20 ครั้ง ⇒ attempts ≤ codeMaxAttempts · ทุกตัว INVALID_CODE · แล้วรหัสถูก ⇒ INVALID_CODE", async () => {
    needBuilt();
    const e = mail("c6");
    await mkIdent("c6");
    const r = await reqCode(e);
    const code = lastMail(e, "LOGIN_CODE")?.code ?? "";
    const wrong = code === "000000" ? "111111" : "000000";
    const out = await settle(Array.from({ length: 20 }, () => AU("verifyAgentLoginCode")({ email: e, codeId: r.codeId, code: wrong }, meta())));
    const att = (await q<{ attempts: number }>(`SELECT attempts FROM "AgentLoginCode" WHERE id = $1`, [String(r.codeId)]))[0]?.attempts ?? 99;
    const last = await verify({ email: e, codeId: r.codeId, code });
    ok(out.every((x) => x.code === "INVALID_CODE") && att <= lim("codeMaxAttempts") && last.code === "INVALID_CODE", `attempts ${att} · ${fmt(out.find((x) => x.code !== "INVALID_CODE"))} · last ${fmt(last)}`);
  });
  await st("C-7", "ยืนยันรหัสถูกพร้อมกัน 10 ครั้ง ⇒ ok 1 ตัว · session ใหม่ 1 แถว", async () => {
    needBuilt();
    const e = mail("c7");
    const v = await mkIdent("c7");
    const r = await reqCode(e);
    const code = lastMail(e, "LOGIN_CODE")?.code ?? "";
    const out = await settle(Array.from({ length: 10 }, () => AU("verifyAgentLoginCode")({ email: e, codeId: r.codeId, code }, meta())));
    for (const x of out) if (x.ok === true) allTokens.push(String(x.token));
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1`, [v.agentUserId]))[0]?.n;
    eq([out.filter((x) => x.ok === true).length, n], [1, 1], "ผล");
  });
  await st("C-8", "รับคำเชิญเพื่อนพร้อมกัน (ยืนยันรหัสเดียวกัน 6 ครั้ง + token เพื่อน) ⇒ ผู้ใช้ใหม่ 1 คน · AgentLogin 1 แถว", async () => {
    const x = needX();
    const e = mail("c8");
    const ti = R(await AU("createTeammateInvite")(x.token, { email: e, role: "SALES" }, meta(undefined, undefined, undefined, OPEN_DEPS)));
    allTokens.push(String(ti.teammateToken));
    const r = await reqCode(e);
    const code = lastMail(e, "LOGIN_CODE")?.code ?? "";
    const out = await settle(Array.from({ length: 6 }, () => AU("verifyAgentLoginCode")({ email: e, codeId: r.codeId, code, teammateInvite: ti.teammateToken, teammateName: `${QC_MARK} c8` }, meta())));
    for (const o of out) if (o.ok === true) { createdUserIds.push(String(o.agentUserId)); allTokens.push(String(o.token)); }
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLogin" WHERE subject = $1`, [e]))[0]?.n;
    eq([out.filter((o) => o.ok === true).length, n], [1, 1], "ผล");
  });

  // ═══════════════ CAP. เพดานใบสมัคร/คำเชิญ (มติ R1 ข้อ 11) ═══════════════
  console.log("\n── CAP: เพดาน ──");
  const mkShop = async (tag: string): Promise<string> => {
    const id = rid(`t${tag}`);
    await ins("Tenant", { id, name: `${QC_MARK} ร้าน ${tag}`, slug: `${SLUG}${STAMP}-${tag}` });
    tenantIds.push(id);
    await ins("BusinessUnit", { id: rid(`u${tag}`), tenantId: id, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}` });
    return id;
  };
  await st("CAP-1", "applyPerIdentity: ตัวตนเดียวสมัคร (ร้าน B) ครบเพดาน (ผล ok/ALREADY_REGISTERED) แล้วครั้งถัดไป ⇒ RATE_LIMITED", async () => {
    needBuilt();
    const k = await mkIdent("cap1");
    const n = lim("applyPerIdentity", "limit");
    const rs: Rec[] = [];
    for (let i = 0; i <= n; i++) rs.push(R(await AS("applyToShop")({ agentUserId: k.agentUserId }, { tenantId: tB, application: app() })));
    ok(rs.slice(0, n).every((r) => r.ok === true || r.code === "ALREADY_REGISTERED"), `ก่อนเพดาน ${fmt(rs.find((r) => r.ok !== true && r.code !== "ALREADY_REGISTERED"))}`);
    eq(rs[n].code, "RATE_LIMITED", `ครั้งที่ ${n + 1}`);
  });
  await st("CAP-2", "applyPerShop: ตัวจำกัดจำลองปฏิเสธคีย์ agent:apply:s: ⇒ RATE_LIMITED · ไม่มีแถว", async () => {
    needBuilt();
    const k = await mkIdent("cap2");
    const r = R(await AS("applyToShop")({ agentUserId: k.agentUserId }, { tenantId: tD, application: app() }, { deps: { ...deps, rateLimit: stubRate({ deny: "agent:apply:s:" }) } }));
    eq([r.code, await accountOf(tD, k.identityId)], ["RATE_LIMITED", null], "ผล");
  });
  await st("CAP-3", "openPendingPerShop: ร้านที่มี PENDING ค้างครบเพดาน ⇒ ผู้สมัครใหม่ RATE_LIMITED · ไม่มีแถว", async () => {
    needBuilt();
    const tE = await mkShop("e");
    const n = lim("openPendingPerShop");
    await pool.query(`INSERT INTO "AgentAccount" (id, "tenantId", "identityId", code, status, "partyId", "unitIds", "legalName", "payeeType", "updatedAt")
      SELECT 'a12cap_' || g || '_' || $2, $1, 'a12capid_' || g || '_' || $2, 'P' || g, 'PENDING', 'qcparty', '{}', $3, 'TH_JURISTIC', now() FROM generate_series(1, $4::int) g`, [tE, STAMP, `${QC_MARK} cap`, n]);
    const k = await mkIdent("cap3");
    const r = R(await AS("applyToShop")({ agentUserId: k.agentUserId }, { tenantId: tE, application: app() }));
    const row = await accountOf(tE, k.identityId);
    await pool.query(`DELETE FROM "AgentAccount" WHERE "tenantId" = $1 AND id LIKE 'a12cap_%'`, [tE]);
    eq([r.code, row], ["RATE_LIMITED", null], "ผล");
  });
  await st("CAP-4", "openCodeInvitesPerIdentity: ตัวตนที่มีคำเชิญค้างครบเพดาน (ต่างร้าน) ⇒ ร้าน D เชิญด้วยรหัส ⇒ RATE_LIMITED · ไม่มีแถว", async () => {
    needBuilt();
    const k = await mkIdent("cap4");
    const n = lim("openCodeInvitesPerIdentity");
    for (let i = 0; i < n; i++) {
      const t = await mkShop(`ci${i}`);
      await ins("AgentAccount", { id: rid("capi"), tenantId: t, identityId: k.identityId, code: `C${i}`, status: "INVITED", partyId: "qcparty", unitIds: [], legalName: `${QC_MARK} cap4`, payeeType: "TH_JURISTIC" });
    }
    const r = await shop("inviteAgent", ctxOf(tD, staff.OD), { mode: "CODE", publicCode: k.publicCode, legalName: `${QC_MARK} cap4`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-cap4` });
    eq([r.code, await accountOf(tD, k.identityId)], ["RATE_LIMITED", null], "ผล");
  });

  // ═══════════════ H. งานบ้าน (มติ R1 ข้อ 12) ═══════════════
  console.log("\n── H: ag_ · ออกทุกเครื่อง · 20 session · งานกวาด ──");
  await st("H-1", "token session ขึ้นต้น ag_ · token เดิมที่ตัดคำนำหน้า/เปลี่ยนเป็น cs_ ⇒ resolve null", async () => {
    const x = needX();
    ok(/^ag_[A-Za-z0-9_-]{43}$/.test(x.token), `รูป token ${x.token.slice(0, 6)}`);
    const raw = x.token.slice(3);
    eq([await AU("resolveAgentSession")(raw), await AU("resolveAgentSession")(`cs_${raw}`)], [null, null], "ผล");
  });
  await st("H-2", "ออกจากระบบทุกเครื่อง: 2 session ของผู้ใช้ ⇒ logoutAllAgentSessions ⇒ revoked ≥ 2 · ทั้งสอง token resolve null", async () => {
    needBuilt();
    await mkIdent("hlo");
    const a = await login(mail("hlo")), b = await login(mail("hlo"));
    const r = R(await AU("logoutAllAgentSessions")(a.token));
    eq([r.ok, Number(r.revoked) >= 2, await AU("resolveAgentSession")(a.token), await AU("resolveAgentSession")(b.token)], [true, true, null, null], "ผล");
  });
  await st("H-3", "เพดาน session: ผู้ใช้มี session ใช้ได้ maxSessionsPerUser ใบ (แทรกตรง) ⇒ เข้าระบบใหม่ ⇒ ใช้ได้ยังไม่เกินเพดาน · ใบเก่าสุดถูก revoke · ใบใหม่ใช้ได้", async () => {
    needBuilt();
    const k = await mkIdent("hcap");
    const n = lim("maxSessionsPerUser");
    const t0 = Date.now();
    let oldest = "";
    for (let i = 0; i < n; i++) {
      const id = rid("hs");
      if (i === 0) oldest = id;
      await ins("AgentSession", { id, agentUserId: k.agentUserId, tokenHash: `qcplant-${hex(16)}`, expiresAt: new Date(t0 + 10 * 86_400_000), idleExpiresAt: new Date(t0 + 86_400_000), createdAt: new Date(t0 - (n - i) * 60_000), updatedAt: new Date() });
    }
    const w = await login(mail("hcap"));
    const live = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1 AND "revokedAt" IS NULL AND "expiresAt" > now()`, [k.agentUserId]))[0]?.n;
    const old = (await q<{ r: Date | null }>(`SELECT "revokedAt" AS r FROM "AgentSession" WHERE id = $1`, [oldest]))[0]?.r;
    ok(live === n && old instanceof Date && !!(await AU("resolveAgentSession")(w.token)), `ใช้ได้ ${live} · ใบเก่าสุด ${fmt(old)}`);
  });
  await st("H-4", "งานกวาด sweepAgentAuth: batch 1 ⇒ ลบต่อชนิด ≤ 1 · วนจนหมด ⇒ รหัสหมดอายุ > 1 วัน + session หมดอายุ/revoke > 30 วัน ถูกลบ · ของสดคงอยู่ · ตาราง tenant ไม่เปลี่ยน", async () => {
    needBuilt();
    const k = await mkIdent("hsw");
    const now0 = new Date();
    const old1 = rid("swc"), old2 = rid("swc"), fresh = rid("swc");
    createdCodeIds.push(old1, old2, fresh);
    const tg = authHash("login-target", mail("hsw-target"));
    await ins("AgentLoginCode", { id: old1, target: tg, codeHash: authHash("login-code", "x"), expiresAt: new Date(now0.getTime() - 2 * 86_400_000) });
    await ins("AgentLoginCode", { id: old2, target: tg, codeHash: authHash("login-code", "y"), expiresAt: new Date(now0.getTime() - 3 * 86_400_000) });
    await ins("AgentLoginCode", { id: fresh, target: tg, codeHash: authHash("login-code", "z"), expiresAt: new Date(now0.getTime() + 5 * 60_000) });
    const sx = rid("sws"), sr = rid("sws"), sf = rid("sws");
    await ins("AgentSession", { id: sx, agentUserId: k.agentUserId, tokenHash: `qcplant-${hex(16)}`, expiresAt: new Date(now0.getTime() - 60_000), idleExpiresAt: new Date(now0.getTime() - 120_000), updatedAt: now0 });
    await ins("AgentSession", { id: sr, agentUserId: k.agentUserId, tokenHash: `qcplant-${hex(16)}`, expiresAt: new Date(now0.getTime() + 86_400_000), idleExpiresAt: new Date(now0.getTime() + 3600_000), revokedAt: new Date(now0.getTime() - 40 * 86_400_000), updatedAt: now0 });
    await ins("AgentSession", { id: sf, agentUserId: k.agentUserId, tokenHash: `qcplant-${hex(16)}`, expiresAt: new Date(now0.getTime() + 86_400_000), idleExpiresAt: new Date(now0.getTime() + 3600_000), updatedAt: now0 });
    const accBefore = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]))[0]?.n;
    const first = R(await AU("sweepAgentAuth")({ now: now0, batch: 1 }));
    ok(Number(first.codes) <= 1 && Number(first.sessions) <= 1, `batch ${fmt(first)}`);
    for (let i = 0; i < 30; i++) {
      const left = (await q<{ n: number }>(`SELECT (SELECT count(*) FROM "AgentLoginCode" WHERE id = ANY($1::text[])) + (SELECT count(*) FROM "AgentSession" WHERE id = ANY($2::text[])) AS n`, [[old1, old2], [sx, sr]]))[0]?.n;
      if (Number(left) === 0) break;
      await AU("sweepAgentAuth")({ now: now0 });
    }
    const codes = (await q<{ id: string }>(`SELECT id FROM "AgentLoginCode" WHERE id = ANY($1::text[])`, [[old1, old2, fresh]])).map((r) => r.id);
    const sess = (await q<{ id: string }>(`SELECT id FROM "AgentSession" WHERE id = ANY($1::text[])`, [[sx, sr, sf]])).map((r) => r.id);
    const accAfter = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]))[0]?.n;
    eq([codes, sess, accAfter], [[fresh], [sf], accBefore], "ผล");
  });

  // ═══════════════ M-12 ปิดตัวตน (ท้ายสุด — W ใช้ในหลายกลุ่ม) ═══════════════
  await st("M-12", "ปิดตัวตน W (OWNER) ⇒ ตัวตน CLOSED + ชื่อแทน + taxIdHash null · ผู้ใช้ ERASED · บัญชีที่ร้าน A และ B ⇒ CLOSED IDENTITY_CLOSED · session ใช้ไม่ได้ · audit ในทั้งสองร้าน", async () => {
    const w = W; ok(w, "ไม่มี W");
    const tx = R(await AG("setAgentIdentityTaxId")({ agentUserId: w!.agentUserId }, thaiTaxId(`0105${digits(8)}`)));
    ok(tx.ok === true, `ตั้งเลขภาษี: ${fmt(tx)}`);
    const r = R(await AS("closeAgentIdentity")({ agentUserId: w!.agentUserId }, { confirm: true }));
    const i = (await q<{ status: string; displayName: string; taxIdHash: string | null }>(`SELECT status, "displayName", "taxIdHash" FROM "AgentIdentity" WHERE id = $1`, [w!.identityId]))[0];
    const us = await q<{ status: string }>(`SELECT status FROM "AgentUser" WHERE "identityId" = $1`, [w!.identityId]);
    const accs = await q<{ tenantId: string; status: string; statusReason: string | null }>(`SELECT "tenantId", status, "statusReason" FROM "AgentAccount" WHERE "identityId" = $1 ORDER BY "tenantId"`, [w!.identityId]);
    eq([r.ok, i?.status, i?.displayName.startsWith(QC_MARK), i?.taxIdHash, us.every((u) => u.status === "ERASED")], [true, "CLOSED", false, null, true], "ตัวตน");
    ok(accs.length === 2 && accs.every((a) => a.status === "CLOSED" && a.statusReason === "IDENTITY_CLOSED"), `บัญชี ${fmt(accs)}`);
    eq(await AU("resolveAgentSession")(w!.token), null, "session");
    for (const t of [tA, tB]) ok((await audits(t)).some((a) => a.action === "agency.account.identity_closed"), `audit ร้าน ${t === tA ? "A" : "B"}`);
  });

  // ═══════════════ RU. มติผู้คุม §10 (หลังตรวจรอบ 1) + §11 (หลังรอบแก้ r2) + หัวข้อที่ผู้ตรวจโค้ดขอเพิ่ม (CODE-REVIEW T-1…T-19) ═══════════════
  // ORACLE-ADD r3 (ผู้เขียนข้อสอบเพิ่ม · อิสระจากผู้สร้าง) — ทุกข้อเรียกบริการที่ส่งออกจริงบนฐาน QC ด้วยแถวที่สร้างเอง (ร้าน `trips-a12-<stamp>-ru*` · ตัวตน QCA12 · อีเมล qca12-ru*)
  //   ไม่พึ่งการแข่งเวลา: ข้อ "พร้อมกัน" ตรวจผลที่ต้องจริงทุกลำดับ · ข้อที่ต้องบังคับลำดับใช้ tx ของข้อสอบถือล็อก/แถวไว้แล้วรอจนบริการติดรอ (pg_locks) ก่อน commit
  console.log("\n── RU: มติ §10/§11 · หัวข้อที่ผู้ตรวจขอเพิ่ม ──");
  const SETF = (n: string) => fnOf(need(SETM, "@/lib/core/settings"), n, "settings");
  type Shop2 = { id: string; slug: string; unitId: string; owner: Staff; ctx: { tenantId: string; actorUserId: string } };
  const mkStaff = async (tag: string, tenantId: string, role: Staff["role"], unitAccess: string[], permissions: Rec): Promise<Staff> => {
    const id = rid(`u${tag}`);
    await ins("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}` });
    await ins("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: now() });
    return { userId: id, role, unitAccess, permissions };
  };
  const setRequireApproval = async (s: { id: string; unitId: string; owner: Staff }, value: boolean): Promise<void> => {
    const w = R(await SETF("setSettings")({ ...s.owner }, { tenantId: s.id }, [{ key: "agency.signup.requireApproval", scope: "UNIT", scopeId: s.unitId, value }], {}));
    ok(w.ok === true, `setSettings: ${fmt(w)}`);
  };
  /** ร้านชั่วคราวของกลุ่ม RU: หน่วย TRIPS 1 + เจ้าของ 1 · auto = ไม่ต้องอนุมัติ (A36 = false) */
  const mkShop2 = async (tag: string, o: { auto?: boolean } = {}): Promise<Shop2> => {
    const id = rid(`t${tag}`), unitId = rid(`u${tag}`), slug = `${SLUG}${STAMP}-${tag}`;
    await ins("Tenant", { id, name: `${QC_MARK} ร้าน ${tag}`, slug });
    tenantIds.push(id);
    await ins("BusinessUnit", { id: unitId, tenantId: id, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}` });
    const owner = await mkStaff(`o${tag}`, id, "OWNER", ["*"], {});
    const s: Shop2 = { id, slug, unitId, owner, ctx: { tenantId: id, actorUserId: owner.userId } };
    if (o.auto) await setRequireApproval(s, false);
    return s;
  };
  /** meta ที่ตัวจำกัดผ่านเสมอ (ข้อที่ไม่ได้สอบเพดาน) */
  const mo = (at?: Date, ip?: string): Rec => meta(at, undefined, ip, OPEN_DEPS);
  const applyAs = async (w: { token: string }, slug: string, application: Rec = app(), at?: Date): Promise<Rec> => R(await AU("agentApply")(w.token, { shopSlug: slug, application }, mo(at)));
  const withdrawAs = async (w: { token: string }, slug: string, at?: Date): Promise<Rec> => R(await AU("agentWithdraw")(w.token, { shopSlug: slug }, mo(at)));
  const shopDo = async (fn: string, ctx: { tenantId: string; actorUserId: string }, input: Rec, opts: Rec = {}): Promise<Rec> => R(await AG(fn)(ctx, await withExpected(fn, input), { deps: OPEN_DEPS, ...opts }));
  const detail = async (s: Shop2, id: string): Promise<Rec> => R((await shopDo("getAgentAccount", s.ctx, { agentAccountId: id })).account);
  const cooled = () => new Date(Date.now() + (lim("reapplyCooldownDays") + 1) * 86_400_000);
  const count = async (sql: string, params: unknown[] = []): Promise<number> => Number((await q<{ n: number }>(sql, params))[0]?.n ?? -1);
  /** จำนวนแถว OpsEvent ระดับ ERROR ของ agency.* (เทียบก่อน/หลัง — ไม่พึ่งนาฬิกา · ถือ gate lock ของฐานนี้อยู่) */
  const opsErrors = () => count(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE level::text = 'ERROR' AND source LIKE 'agency.%'`);
  const opsMailWarns = () => count(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE level::text = 'WARN' AND source LIKE 'agency.%'`);
  const liveSessions = (agentUserId: string) => count(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1 AND "revokedAt" IS NULL`, [agentUserId]);
  const loginRows = (email: string) => count(`SELECT count(*)::int AS n FROM "AgentLogin" WHERE subject = $1`, [email]);
  const safe = async (f: () => Promise<unknown>): Promise<Rec> => { try { return R(await f()); } catch (e) { return { threw: errMsg(e) }; } };
  const RESULT_KEYS = ["agentAccountId", "ok", "replayed", "status"];
  const limOpts = (k: string) => ({ limit: lim(k, "limit"), windowMs: lim(k, "windowMin") * 60_000 });
  type Seen = { key: string; limit: number; windowMs: number };
  /** ตัวจำกัดจำลองที่จดทุกคำขอ · deny(คำขอ) ⇒ ปฏิเสธคำขอนั้น */
  const recRate = (seen: Seen[], deny?: (s: Seen) => boolean): Rec => ({
    ...deps,
    rateLimit: async (key: unknown, opts: unknown) => {
      const s: Seen = { key: String(key), limit: Number(R(opts).limit), windowMs: Number(R(opts).windowMs) };
      seen.push(s);
      return deny?.(s) ? { ok: false, retryAfterSec: 30, count: 999 } : { ok: true, count: 1 };
    },
  });
  const isBucket = (s: Seen, k: string) => s.limit === limOpts(k).limit && s.windowMs === limOpts(k).windowMs;
  /** จับทุกอย่างที่พิมพ์ลง console ระหว่าง fn (+ รอสั้น ๆ ให้งานนอกเส้นทางคำขอพิมพ์ ถ้ามี) */
  const captureConsole = async <T,>(fn: () => Promise<T>): Promise<{ out: string; val: T }> => {
    const keep = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
    const buf: string[] = [];
    const w = (...a: unknown[]) => { buf.push(a.map((x) => (typeof x === "string" ? x : fmt(x))).join(" ")); };
    Object.assign(console, { log: w, info: w, warn: w, error: w, debug: w });
    try { const val = await fn(); await new Promise((r) => setTimeout(r, 400)); return { out: buf.join("\n"), val }; } finally { Object.assign(console, keep); }
  };
  /**
   * บังคับลำดับแบบกำหนดได้: ข้อสอบเปิด tx ของตัวเอง ทำ hold (ถือล็อก/เขียนแถวที่ยังไม่ commit) → ยิงบริการ → รอจนบริการ "ติดรอล็อก" (pg_locks มีแถว granted = false)
   * หรือจบไปเอง → commit → คืนผลของบริการ · ข้อที่ใช้ตัวนี้ตัดสินจาก "สถานะสุดท้าย" ซึ่งต้องถูกทั้งสองทาง (ไม่ตัดสินจากว่ารอหรือไม่)
   */
  const underHeldTx = async (hold: (c: pg.PoolClient) => Promise<void>, call: () => Promise<unknown>): Promise<{ res: Rec; waited: boolean }> => {
    const c = await pool.connect();
    let waited = false, settled = false;
    let p: Promise<Rec> = Promise.resolve({});
    try {
      await c.query("BEGIN");
      await hold(c);
      p = safe(call).finally(() => { settled = true; });
      for (let i = 0; i < 400 && !settled; i++) {
        if ((await count(`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted`)) > 0) { waited = true; break; }
        await new Promise((r) => setTimeout(r, 50));
      }
      await c.query("COMMIT");
    } catch (e) { try { await c.query("ROLLBACK"); } catch { /* ignore */ } throw e; } finally { c.release(); }
    return { res: await p, waited };
  };
  const inviteMate = async (by: { token: string }, email: string, role: string): Promise<string> => {
    const ti = R(await AU("createTeammateInvite")(by.token, { email, role }, mo()));
    ok(ti.ok === true, `เชิญเพื่อน: ${fmt(ti)}`);
    allTokens.push(String(ti.teammateToken));
    return String(ti.teammateToken);
  };
  /** ขอรหัส + ยืนยันพร้อม token เพื่อน (ตัวจำกัดผ่านเสมอ) — คืนผลยืนยันดิบ */
  const redeem = async (email: string, tok: string, name = "ru"): Promise<Rec> => {
    const r = await reqCode(email, mo());
    ok(r.ok === true, `ขอรหัส ${email}: ${fmt(r)}`);
    return verify({ email, codeId: r.codeId, code: lastMail(email, "LOGIN_CODE")?.code, teammateInvite: tok, teammateName: `${QC_MARK} ${name}` }, mo());
  };
  const userOfToken = async (token: unknown): Promise<string> => String(R(await AU("resolveAgentSession")(String(token))).agentUserId ?? "");
  const rowJson = async (id: string): Promise<string> => (await q<{ j: string }>(`SELECT row_to_json(a)::text AS j FROM "AgentAccount" a WHERE id = $1`, [id]))[0]?.j ?? "";
  const neverNow = (): string[] => [...new Set([...NEVER, "applicantTag", ...((asRec(COREM.mod)?.NEVER_SHOW_TO_SHOP_KEYS as string[] | undefined) ?? [])])];

  // ─────────────────── มติ §10 ข้อ 1 — ปิดถาวรต้องติดจริง ───────────────────
  await st("RU-1", "มติ §10 ข้อ 1 (RV-F1 · H-F2 · T-1): ร้านอนุมัติอัตโนมัติปิดบัญชี (CLOSED_BY_SHOP) → สมัครซ้ำหลังช่วงรอ ⇒ PENDING → ถอน ⇒ กลับ CLOSED เหตุเดิม CLOSED_BY_SHOP (ไม่ใช่ WITHDRAWN · ยังติดช่วงรอ) → สมัครอีก ⇒ PENDING ไม่ ACTIVE (×2 รอบ) · ประตู null ตลอด · ร้านอนุมัติเอง ⇒ ACTIVE + เหตุถูกล้าง", async () => {
    needBuilt();
    const s = await mkShop2("ru1", { auto: true });
    const k = await signup(mail("ru1"), "RU1");
    const a1 = await applyAs(k, s.slug);
    ok(a1.status === "ACTIVE", `ตัวควบคุม: ร้านนี้ต้องอนุมัติอัตโนมัติ — ${fmt(a1)}`);
    const id = String(a1.agentAccountId);
    const c = await shopDo("closeAgentAccount", s.ctx, { agentAccountId: id });
    eq([c.status, (await acc(id))?.statusReason], ["CLOSED", "CLOSED_BY_SHOP"], "ร้านปิด");
    const at = cooled();
    const rounds: unknown[] = [];
    for (let round = 0; round < 2; round++) {
      const re = await applyAs(k, s.slug, app(), at);
      const scope = await AU("agentScope")(k.token, { shopSlug: s.slug });
      const w = await withdrawAs(k, s.slug, at);
      const row = await acc(id);
      const soon = await applyAs(k, s.slug); // นาฬิกาจริง = ยังอยู่ในช่วงรอของการปิดโดยร้าน
      rounds.push([re.status, re.agentAccountId === id, scope, w.status, row?.status, row?.statusReason, row?.approvedAt ?? null, soon.code]);
    }
    const one = ["PENDING", true, null, "CLOSED", "CLOSED", "CLOSED_BY_SHOP", null, "BAD_STATE"];
    eq(rounds, [one, one], "สมัครซ้ำ → ถอน (สองรอบ)");
    const re3 = await applyAs(k, s.slug, app(), at);
    const ap = await shopDo("approveAgentAccount", s.ctx, { agentAccountId: id });
    const scope3 = R(await AU("agentScope")(k.token, { shopSlug: s.slug }));
    const fin = await acc(id);
    eq([re3.status, ap.status, scope3.agentAccountId, fin?.status, fin?.statusReason ?? null, fin?.approvedById], ["PENDING", "ACTIVE", id, "ACTIVE", null, s.owner.userId], "ร้านอนุมัติเอง");
  });
  await st("RU-2", "มติ §10 ข้อ 1 (REJECTED): ร้านปฏิเสธ แล้วภายหลังร้านเปลี่ยนเป็นอนุมัติอัตโนมัติ (ตัวควบคุม: ผู้สมัครใหม่ ⇒ ACTIVE) → ผู้ถูกปฏิเสธสมัครซ้ำ ⇒ PENDING → ถอน ⇒ CLOSED เหตุเดิม REJECTED → สมัครอีก ⇒ PENDING · ประตู null · approvedAt ว่าง", async () => {
    needBuilt();
    const s = await mkShop2("ru2");
    const k = await signup(mail("ru2"), "RU2");
    const a1 = await applyAs(k, s.slug);
    const id = String(a1.agentAccountId);
    const rj = await shopDo("rejectAgentAccount", s.ctx, { agentAccountId: id });
    eq([a1.status, rj.status, (await acc(id))?.statusReason], ["PENDING", "CLOSED", "REJECTED"], "ปฏิเสธ");
    await setRequireApproval(s, false);
    const ctl = await signup(mail("ru2c"), "RU2C");
    const c1 = await applyAs(ctl, s.slug);
    ok(c1.status === "ACTIVE", `ตัวควบคุม: หลังเปลี่ยนค่าตั้ง ผู้สมัครใหม่ต้อง ACTIVE — ${fmt(c1)}`);
    const at = cooled();
    const re1 = await applyAs(k, s.slug, app(), at);
    const w = await withdrawAs(k, s.slug, at);
    const mid = await acc(id);
    const re2 = await applyAs(k, s.slug, app(), at);
    const fin = await acc(id);
    eq([re1.status, w.status, mid?.status, mid?.statusReason, re2.status, re2.agentAccountId, fin?.status, fin?.approvedAt ?? null, await AU("agentScope")(k.token, { shopSlug: s.slug })],
      ["PENDING", "CLOSED", "CLOSED", "REJECTED", "PENDING", id, "PENDING", null, null], "ผล");
  });

  // ─────────────────── มติ §10 ข้อ 2 — token เชิญเพื่อนใช้ครั้งเดียวตลอดกาล ───────────────────
  await st("RU-3", "มติ §10 ข้อ 2 (RV-F2 · H-F1 · T-2): token เพื่อนใช้ครั้งเดียว — รับแล้วมีแถว jti (target = แฮช tm-jti · usedAt · หมดอายุ = อายุ token) · ลบผู้ถูกเชิญแล้วใช้ token เดิม ⇒ INVITE_INVALID ไม่สร้างผู้ใช้ · token ใหม่ของอีเมลเดิมใช้ได้หนึ่งครั้ง (ครั้งที่สองไม่ได้) · ปิดผู้ถูกเชิญ / ลด-คืนบทบาทผู้เชิญ ก็ไม่ทำให้ token เดิมกลับมา", async () => {
    needBuilt();
    const o = await signup(mail("ru3"), "RU3");
    const usersOf = () => count(`SELECT count(*)::int AS n FROM "AgentUser" WHERE "identityId" = $1 AND status = 'ACTIVE'`, [o.identityId]);
    // (ก) รับ → แถว jti → ลบ → เล่นซ้ำ
    const e1 = mail("ru3a");
    const tok1 = await inviteMate(o, e1, "ADMIN");
    const j1 = await redeem(e1, tok1);
    ok(j1.ok === true && j1.created === "TEAMMATE", `รับครั้งแรก: ${fmt(j1)}`);
    const u1 = await userOfToken(j1.token);
    const jti = teammateJti(tok1);
    ok(jti, "token ไม่มี jti (n)");
    const jr = await q<{ used: boolean; fresh: boolean; within: boolean }>(`SELECT ("usedAt" IS NOT NULL) AS used, ("expiresAt" > now()) AS fresh, ("expiresAt" <= now() + ($2 || ' minutes')::interval) AS within FROM "AgentLoginCode" WHERE target = $1`, [authHash("tm-jti", String(jti)), String(lim("teammateInviteTtlMin") + 5)]);
    eq(jr, [{ used: true, fresh: true, within: true }], "แถว jti (ใช้แล้ว · หมดอายุพร้อม token ⇒ งานกวาดเดิมเก็บ)");
    const er = R(await AS("eraseAgentUser")({ agentUserId: o.agentUserId }, { targetUserId: u1 }));
    ok(er.ok === true, `ลบ: ${fmt(er)}`);
    const n1 = await usersOf();
    const r1 = await redeem(e1, tok1);
    eq([r1.code, await loginRows(e1), await usersOf()], ["INVITE_INVALID", 0, n1], "เล่นซ้ำหลังลบผู้ถูกเชิญ");
    // (ข) token ใหม่ของอีเมลเดิม: ใช้ได้หนึ่งครั้ง
    const tok1b = await inviteMate(o, e1, "SALES");
    const j1b = await redeem(e1, tok1b);
    const again = await redeem(e1, tok1b);
    ok(j1b.ok === true && j1b.created === "TEAMMATE", `token ใหม่ต้องใช้ได้: ${fmt(j1b)}`);
    ok(again.ok !== true && ["INVITE_INVALID", "LOGIN_UNAVAILABLE"].includes(String(again.code)) && (await loginRows(e1)) === 1, `ใช้ครั้งที่สอง: ${fmt(again)}`);
    // (ค) ปิดผู้ถูกเชิญ
    const e2 = mail("ru3b");
    const tok2 = await inviteMate(o, e2, "SALES");
    const j2 = await redeem(e2, tok2);
    ok(j2.ok === true, `รับ (ข้อปิด): ${fmt(j2)}`);
    const u2 = await userOfToken(j2.token);
    ok(R(await AS("disableAgentUser")({ agentUserId: o.agentUserId }, { targetUserId: u2 })).ok === true, "ปิดผู้ใช้");
    const n2 = await usersOf();
    const r2 = await redeem(e2, tok2);
    ok(r2.ok !== true && ["INVITE_INVALID", "LOGIN_UNAVAILABLE"].includes(String(r2.code)) && (await usersOf()) === n2 && (await loginRows(e2)) === 1, `เล่นซ้ำหลังปิดผู้ถูกเชิญ: ${fmt(r2)}`);
    // (ง) ผู้เชิญถูกลดบทบาทแล้วคืน (ผู้เชิญกลับมา "ใช้ได้") + ผู้ถูกเชิญถูกลบ ⇒ token ที่เคยใช้ยังใช้ไม่ได้
    const ez = mail("ru3z"), e3 = mail("ru3c");
    const jz = await redeem(ez, await inviteMate(o, ez, "ADMIN"));
    ok(jz.ok === true, `ผู้เชิญ ADMIN: ${fmt(jz)}`);
    const zId = await userOfToken(jz.token);
    const tok3 = await inviteMate({ token: String(jz.token) }, e3, "SALES");
    const j3 = await redeem(e3, tok3);
    ok(j3.ok === true, `รับ (ข้อผู้เชิญ): ${fmt(j3)}`);
    const u3 = await userOfToken(j3.token);
    const steps = [
      R(await AS("eraseAgentUser")({ agentUserId: o.agentUserId }, { targetUserId: u3 })).ok,
      R(await AS("setAgentUserRole")({ agentUserId: o.agentUserId }, { targetUserId: zId, role: "SALES" })).ok,
      R(await AS("setAgentUserRole")({ agentUserId: o.agentUserId }, { targetUserId: zId, role: "ADMIN" })).ok,
    ];
    const n3 = await usersOf();
    const r3 = await redeem(e3, tok3);
    eq([steps, r3.code, await loginRows(e3), await usersOf()], [[true, true, true], "INVITE_INVALID", 0, n3], "เล่นซ้ำหลังลด-คืนบทบาทผู้เชิญ");
  });

  // ─────────────────── มติ §10 ข้อ 3 — เพดานจดหมายเชิญ ───────────────────
  await st("RU-4", "มติ §10 ข้อ 3 (RV-F3 · T-3) เชิญเพื่อน: ตัวจำกัดจริง — ผู้เชิญหนึ่งคนเชิญได้ teammateInvitePerInviter ฉบับ/ชม. ฉบับถัดไป RATE_LIMITED ไม่มีจดหมาย · ADMIN อีกคนของตัวตนเดียวกันยังเชิญได้ (ถังต่อผู้เชิญ) · ถังต่อตัวตน/วัน: ปล่อยถังต่อผู้เชิญแล้วเชิญได้ teammateInvitePerIdentity ฉบับพอดี ตัวตนอื่นไม่กระทบ", async () => {
    needBuilt();
    const o = await signup(mail("ru4"), "RU4");
    const t0 = new Date(); // now เดียวกันทุกคำขอ ⇒ หน้าต่างเดียวกัน (ไม่คร่อมขอบชั่วโมง)
    const per = lim("teammateInvitePerInviter", "limit");
    const m0 = mails.length;
    const rs: Rec[] = [];
    for (let i = 0; i <= per; i++) rs.push(R(await AU("createTeammateInvite")(o.token, { email: mail(`ru4-${i}`), role: "SALES" }, meta(t0))));
    for (const r of rs) if (r.ok === true) allTokens.push(String(r.teammateToken));
    ok(rs.slice(0, per).every((r) => r.ok === true), `ก่อนเพดาน: ${fmt(rs.find((r) => r.ok !== true))}`);
    eq([rs[per].code, Number(rs[per].retryAfterSec) > 0, mails.slice(m0).filter((m) => m.kind === "TEAMMATE_INVITE").length], ["RATE_LIMITED", true, per], "ฉบับที่เกินเพดาน");
    const adm = await teammate(o, mail("ru4adm"), "ADMIN", "RU4ADM");
    const viaAdmin = R(await AU("createTeammateInvite")(adm.token, { email: mail("ru4-adm-x"), role: "SALES" }, meta(t0)));
    ok(viaAdmin.ok === true, `ADMIN คนอื่นของตัวตนเดียวกันต้องยังเชิญได้: ${fmt(viaAdmin)}`);
    allTokens.push(String(viaAdmin.teammateToken));
    // ถังต่อตัวตน/วัน — ตัวจำกัดในหน่วยความจำที่ถือเพดานจริงของทุกถัง ยกเว้นถังต่อผู้เชิญ
    const day = lim("teammateInvitePerIdentity", "limit");
    const counts = new Map<string, number>();
    const seen: Seen[] = [];
    const honour: Rec = { ...deps, rateLimit: async (key: unknown, opts: unknown) => {
      const s: Seen = { key: String(key), limit: Number(R(opts).limit), windowMs: Number(R(opts).windowMs) };
      seen.push(s);
      if (isBucket(s, "teammateInvitePerInviter")) return { ok: true, count: 1 };
      const c = (counts.get(s.key) ?? 0) + 1;
      counts.set(s.key, c);
      return c <= s.limit ? { ok: true, count: c } : { ok: false, retryAfterSec: 77, count: c };
    } };
    const o2 = await signup(mail("ru4b"), "RU4B"), o3 = await signup(mail("ru4c"), "RU4C");
    let okN = 0;
    for (let i = 0; i < day; i++) { const r = R(await AU("createTeammateInvite")(o2.token, { email: mail(`ru4b-${i}`), role: "SALES" }, meta(t0, undefined, undefined, honour))); if (r.ok === true) { okN++; allTokens.push(String(r.teammateToken)); } }
    const over = R(await AU("createTeammateInvite")(o2.token, { email: mail("ru4b-over"), role: "SALES" }, meta(t0, undefined, undefined, honour)));
    const otherIdentity = R(await AU("createTeammateInvite")(o3.token, { email: mail("ru4c-1"), role: "SALES" }, meta(t0, undefined, undefined, honour)));
    if (otherIdentity.ok === true) allTokens.push(String(otherIdentity.teammateToken));
    eq([okN, over.code, otherIdentity.ok, seen.some((s) => isBucket(s, "teammateInvitePerInviter")), seen.some((s) => isBucket(s, "teammateInvitePerIdentity"))], [day, "RATE_LIMITED", true, true, true], "ถังต่อตัวตน");
    ok(seen.every((s) => /^agent:[a-z:]+v1:[0-9a-f]{64}$/.test(s.key)), `คีย์ถังต้องเป็นแฮช (ไม่มีอีเมล/id ดิบ): ${fmt(seen.find((s) => !/^agent:[a-z:]+v1:[0-9a-f]{64}$/.test(s.key)))}`);
  });
  await st("RU-5", "มติ §10 ข้อ 3 (RV-F3 · T-3) ร้านเชิญอีเมล: ตัวจำกัดจริง — เชิญ + ออกใหม่ ถึงอีเมลเดียวรวม shopInviteMailPerTarget ฉบับ/วัน ฉบับถัดไป (ออกใหม่/เชิญใหม่) RATE_LIMITED ไม่มีแถว/จดหมาย/token ใหม่ · อีเมลอื่นและร้านอื่นไม่กระทบ · ถังต่อร้าน/วัน (shopInviteMailPerShop) ถูกถามด้วยคีย์เดียวกันทั้งร้าน คนละคีย์ต่อร้าน · ถังร้านปฏิเสธ ⇒ RATE_LIMITED ไม่มีแถว", async () => {
    needBuilt();
    const s = await mkShop2("ru5"), s2 = await mkShop2("ru5b");
    const t0 = Date.now();
    let tick = 0;
    const o = (d: Rec = deps): Rec => ({ now: new Date(t0 + ++tick), deps: d }); // เวลาห่างกัน 1 มิลลิวินาที: หน้าต่างเดียวกัน แต่เวลาหมดอายุคำเชิญต่างกัน (token ใหม่จริง)
    const target = mail("ru5-target");
    const inv = async (ctx: Shop2["ctx"], email: string, tag: string, d?: Rec): Promise<Rec> => { const r = R(await AG("inviteAgent")(ctx, invEmail(email, `qca12-${STAMP}-ru5-${tag}`), o(d))); if (typeof r.inviteToken === "string") allTokens.push(r.inviteToken); return r; };
    const reissue = async (id: unknown): Promise<Rec> => { const r = R(await AG("reissueAgentInvite")(s.ctx, { agentAccountId: id }, o())); if (typeof r.inviteToken === "string") allTokens.push(r.inviteToken); return r; };
    const per = lim("shopInviteMailPerTarget", "limit");
    const i1 = await inv(s.ctx, target, "1");
    ok(i1.ok === true, `เชิญครั้งแรก: ${fmt(i1)}`);
    const res: Rec[] = [];
    for (let i = 1; i < per; i++) res.push(await reissue(i1.agentAccountId));
    ok(res.every((r) => r.ok === true), `ออกใหม่ก่อนเพดาน: ${fmt(res.find((r) => r.ok !== true))}`);
    const hash0 = (await acc(String(i1.agentAccountId)))?.inviteTokenHash;
    const m0 = mails.length;
    const r4 = await reissue(i1.agentAccountId);
    const i2 = await inv(s.ctx, target, "2");
    const rows = await count(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1 AND contact->>'email' = $2`, [s.id, target]);
    eq([r4.code, i2.code, (await acc(String(i1.agentAccountId)))?.inviteTokenHash === hash0, rows, mails.length - m0, mails.filter((m) => m.to === target && m.kind === "SHOP_INVITE").length], ["RATE_LIMITED", "RATE_LIMITED", true, 1, 0, per], "เกินเพดานต่ออีเมล");
    const other = await inv(s.ctx, mail("ru5-other"), "3"), otherShop = await inv(s2.ctx, target, "4");
    eq([other.ok, otherShop.ok], [true, true], "อีเมลอื่น / ร้านอื่น");
    // ถังต่อร้าน
    const seen: Seen[] = [];
    const a = await inv(s.ctx, mail("ru5-ka"), "ka", recRate(seen)), b = await inv(s.ctx, mail("ru5-kb"), "kb", recRate(seen)), c = await inv(s2.ctx, mail("ru5-ka"), "kc", recRate(seen));
    ok(a.ok === true && b.ok === true && c.ok === true, `เชิญใต้ตัวจำกัดที่จด: ${fmt([a, b, c])}`);
    const shopKeys = seen.filter((x) => isBucket(x, "shopInviteMailPerShop")).map((x) => x.key), tgtKeys = seen.filter((x) => isBucket(x, "shopInviteMailPerTarget")).map((x) => x.key);
    eq([shopKeys.length, shopKeys[0] === shopKeys[1], shopKeys[0] !== shopKeys[2], tgtKeys.length, new Set(tgtKeys).size], [3, true, true, 3, 3], "คีย์ถัง (ต่อร้าน · ต่ออีเมลต่อร้าน)");
    ok(seen.every((x) => /^agent:[a-z:]+v1:[0-9a-f]{64}$/.test(x.key)), "คีย์ถังต้องเป็นแฮช");
    const denied = await inv(s.ctx, mail("ru5-deny"), "deny", recRate([], (x) => isBucket(x, "shopInviteMailPerShop")));
    eq([denied.code, await count(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1 AND contact->>'email' = $2`, [s.id, mail("ru5-deny")]), mails.some((m) => m.to === mail("ru5-deny"))], ["RATE_LIMITED", 0, false], "ถังร้านปฏิเสธ");
  });
  await st("RU-6", "มติ §10 ข้อ 3 fail closed: ตัวจำกัดตอบโดยไม่มีตัวนับ ⇒ เชิญเพื่อน / ร้านเชิญอีเมล / ออกคำเชิญใหม่ = RATE_LIMITED · ตัวจำกัดโยน error ⇒ ทั้งสามไม่สำเร็จและไม่ throw ถึงผู้เรียก · ทุกกรณีไม่มีจดหมาย ไม่มีแถวใหม่ token คำเชิญเดิมไม่เปลี่ยน", async () => {
    needBuilt();
    const s = await mkShop2("ru6");
    const o = await signup(mail("ru6"), "RU6");
    const base = await shopDo("inviteAgent", s.ctx, invEmail(mail("ru6-base"), `qca12-${STAMP}-ru6-base`));
    ok(base.ok === true, `คำเชิญตั้งต้น: ${fmt(base)}`);
    allTokens.push(String(base.inviteToken));
    const hash0 = (await acc(String(base.agentAccountId)))?.inviteTokenHash;
    const modes: [string, Rec][] = [["no-count", { ...deps, rateLimit: async () => ({ ok: true }) }], ["throws", { ...deps, rateLimit: async () => { throw new Error("qca12 limiter down"); } }]];
    const out: unknown[] = [];
    const m0 = mails.length;
    for (const [name, d] of modes) {
      const em = mail(`ru6-${name}`);
      const tm = await safe(() => AU("createTeammateInvite")(o.token, { email: em, role: "SALES" }, meta(undefined, undefined, undefined, d)));
      const inv = await safe(() => AG("inviteAgent")(s.ctx, invEmail(em, `qca12-${STAMP}-ru6-${name}`), { deps: d }));
      const re = await safe(() => AG("reissueAgentInvite")(s.ctx, { agentAccountId: base.agentAccountId }, { deps: d }));
      const rows = await count(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1 AND contact->>'email' = $2`, [s.id, em]);
      const threw = [tm, inv, re].filter((r) => r.threw !== undefined).length;
      out.push(name === "no-count" ? [tm.code, inv.code, re.code, rows, threw] : [tm.ok === true, inv.ok === true, re.ok === true, rows, threw]);
    }
    eq(out, [["RATE_LIMITED", "RATE_LIMITED", "RATE_LIMITED", 0, 0], [false, false, false, 0, 0]], "ผล");
    eq([mails.length - m0, (await acc(String(base.agentAccountId)))?.inviteTokenHash === hash0], [0, true], "จดหมาย/token");
  });

  // ─────────────────── มติ §10 ข้อ 4 — รหัสไม่อยู่ในหัวเรื่อง · ไม่มีผู้ให้บริการ = ไม่เรียกตัวส่ง ───────────────────
  await st("RU-7", "มติ §10 ข้อ 4 (RV-F4 · T-4): หัวเรื่องจดหมายรหัสคงที่ ไม่มีรหัส (รหัสอยู่ในเนื้อหา) · ไม่มีผู้ให้บริการส่งเมล + ไม่ฉีดตัวส่ง ⇒ ขอรหัส/เชิญเพื่อน/ร้านเชิญ ตอบรูปเดิม · console ไม่มีรหัส/อีเมล/หัวเรื่อง/'[email:dev]' (ตัวส่งไม่ถูกเรียก) · มี ops WARN ที่ไม่มีรหัส/อีเมล · ไม่มี ops ERROR", async () => {
    needBuilt();
    const f = CO("agentLoginCodeMail") as (c: string) => unknown;
    const codes = ["482913", "000000", "999999", "123456"];
    const ms = codes.map((c) => R(f(c)));
    ok(ms.every((m, i) => !String(m.subject).includes(codes[i]) && String(m.text).includes(codes[i]) && String(m.html).includes(codes[i])), `รหัสต้องอยู่ในเนื้อหาเท่านั้น: ${fmt(ms[0])}`);
    ok(new Set(ms.map((m) => String(m.subject))).size === 1 && !/\d{4,}/.test(String(ms[0].subject)), `หัวเรื่องต้องคงที่และไม่มีตัวเลขรหัส: ${fmt(ms.map((m) => m.subject))}`);
    ok(!process.env.RESEND_API_KEY, "ข้อนี้ต้องรันโดยไม่มีกุญแจส่งเมล");
    // positive control ของตัวจับ console: ทางสำรองของ sendEmailRich พิมพ์หัวเรื่อง (เหตุที่มติสั่งห้ามเรียกตัวส่ง)
    const EM = await tryImport("@/lib/core/email");
    const ctlSubject = `qca12 ctl ${STAMP}`;
    const ctl = await captureConsole(() => fnOf(EM.mod, "sendEmailRich", "core/email")({ to: [mail("ru7-ctl")], subject: ctlSubject, html: "<p>x</p>", text: "x" }));
    if (!ctl.out.includes(ctlSubject)) console.log("     ℹ️ [RU-7] ตัวควบคุม: ทางสำรองของ sendEmailRich ไม่พิมพ์หัวเรื่องแล้ว — หลักฐาน console ของข้อนี้อ่อนลง (ยังตรวจ ops WARN)");
    const noSender: Rec = { rateLimit: async () => ({ ok: true, count: 1 }) }; // ไม่มี sendAgentMail
    const e = mail("ru7");
    usedEmails.push(e);
    const withDeps = await reqCode(mail("ru7-with"));
    const e0 = await opsErrors(), w0 = await opsMailWarns();
    const cap = await captureConsole(async () => R(await AU("requestAgentLoginCode")({ email: e }, meta(undefined, undefined, undefined, noSender))));
    const r = cap.val;
    ok(r.ok === true, `ขอรหัส (ไม่มีตัวส่ง): ${fmt(r)}`);
    createdCodeIds.push(String(r.codeId));
    const row = (await q<{ codeHash: string }>(`SELECT "codeHash" FROM "AgentLoginCode" WHERE id = $1`, [String(r.codeId)]))[0];
    ok(row, "ไม่มีแถวรหัส");
    // หารหัสจริงจากแฮช (10^6 ค่า) เพื่อค้นใน console/ops
    const kLogin = authKey("login-code");
    let code = "";
    for (let i = 0; i < 1_000_000 && !code; i++) { const c = String(i).padStart(6, "0"); if (`v1:${createHmac("sha256", kLogin).update(`${String(r.codeId)}:${c}`).digest("hex")}` === row.codeHash) code = c; }
    ok(code, "หารหัสจากแฮชไม่ได้ (สูตรแฮชเปลี่ยน?)");
    const ops = await q<{ level: string; detail: string | null; j: string }>(`SELECT level::text AS level, detail, row_to_json(o)::text AS j FROM "OpsEvent" o WHERE source LIKE 'agency.%' AND detail LIKE $1`, [`%${String(r.codeId)}%`]);
    eq([sortedKeys(r), ops.map((x) => x.level)], [sortedKeys(withDeps), ["WARN"]], "รูปผล + ops ของคำขอนี้");
    const dkeys = Object.keys(R((() => { try { return JSON.parse(ops[0].detail ?? "{}") as unknown; } catch { return {}; } })()));
    ok(dkeys.length > 0 && dkeys.every((k) => ["kind", "ref", "codeId", "reason"].includes(k)) && leaks(ops[0].j, [e, e.split("@")[0]]).length === 0 && !ops[0].j.includes(code), `ops WARN ต้องมีแค่ชนิด/อ้างอิง/เหตุ: ${fmt(ops[0].detail)}`);
    const subject = String(ms[0].subject);
    ok(!cap.out.includes(code) && !cap.out.includes(e) && !cap.out.includes("[email:dev]") && !cap.out.includes(subject), `console ระหว่างขอรหัส: ${cap.out.slice(0, 200)}`);
    // เชิญเพื่อน + ร้านเชิญอีเมล ทางเดียวกัน
    const o = await signup(mail("ru7o"), "RU7");
    const s = await mkShop2("ru7");
    const em1 = mail("ru7-mate"), em2 = mail("ru7-inv");
    const cap2 = await captureConsole(async () => [
      R(await AU("createTeammateInvite")(o.token, { email: em1, role: "SALES" }, meta(undefined, undefined, undefined, noSender))),
      R(await AG("inviteAgent")(s.ctx, invEmail(em2, `qca12-${STAMP}-ru7`), { deps: noSender })),
    ]);
    const [tm, inv] = cap2.val;
    const secrets = [em1, em2, String(tm.teammateToken), String(inv.inviteToken)];
    allTokens.push(String(tm.teammateToken), String(inv.inviteToken));
    eq([tm.ok, inv.ok, inv.status, leaks(cap2.out, secrets), cap2.out.includes("[email:dev]")], [true, true, "INVITED", [], false], "เชิญโดยไม่มีผู้ให้บริการ");
    eq([(await opsMailWarns()) - w0 >= 3, (await opsErrors()) - e0], [true, 0], "ops WARN ≥ 3 · ERROR 0");
    const opsAll = await q<{ j: string }>(`SELECT row_to_json(o)::text AS j FROM "OpsEvent" o WHERE source LIKE 'agency.%' AND "createdAt" >= $1`, [RUN_START]);
    eq(leaks(opsAll.map((x) => x.j).join("\n"), [...secrets, e]), [], "ops ไม่มีอีเมล/token");
  });

  // ─────────────────── มติ §10 ข้อ 5 + §11 ข้อ 1 — อนุมัติ/ปฏิเสธต้องส่ง expectedUpdatedAt ───────────────────
  await st("RU-8", "มติ §10 ข้อ 5 + §11 ข้อ 1 (RV-F5 · T-5): อนุมัติ/ปฏิเสธไม่ส่ง expectedUpdatedAt หรือส่งค่าที่ไม่ใช่เวลา ⇒ VALIDATION · ค่าเก่า ⇒ STALE reason STATE_CONFLICT ไม่เขียนอะไร (สถานะ/updatedAt/audit/event/ยอด) · เอเจนซี่ถอนแล้วสมัครใหม่ด้วยชื่ออื่นระหว่างที่ร้านเปิดดู ⇒ ตราเดิมอนุมัติ/ปฏิเสธไม่ได้ · ตราปัจจุบัน ⇒ ACTIVE", async () => {
    needBuilt();
    const s = await mkShop2("ru8");
    const k = await signup(mail("ru8"), "RU8");
    const good = `${QC_MARK} RU8 GOOD ${STAMP}`, other = `${QC_MARK} RU8 OTHER ${STAMP}`;
    const a1 = await applyAs(k, s.slug, app({ legalName: good }));
    ok(a1.status === "PENDING", `สมัคร: ${fmt(a1)}`);
    const id = String(a1.agentAccountId);
    const call = async (fn: string, input: Rec): Promise<Rec> => R(await AG(fn)(s.ctx, input, { deps: OPEN_DEPS })); // ไม่ผ่านตัวช่วยที่เติมตราให้
    const snap = async () => { const a = await acc(id); return [a?.status, a?.legalName, a?.updatedAt instanceof Date ? a.updatedAt.getTime() : null, a?.approvedAt ?? null, a?.approvedById ?? null]; };
    const writes = async () => [
      (await audits(s.id)).filter((x) => x.targetId === id && ["agency.account.approve", "agency.account.reject"].includes(x.action)).length,
      (await events(s.id, "agency.account.approved")).filter((x) => R(x.payload).agentAccountId === id).length,
      await count(`SELECT count(*)::int AS n FROM "AgentBalance" WHERE "agentAccountId" = $1`, [id]),
    ];
    const s0 = await snap();
    const noStamp = [await call("approveAgentAccount", { agentAccountId: id }), await call("rejectAgentAccount", { agentAccountId: id }), await call("approveAgentAccount", { agentAccountId: id, expectedUpdatedAt: "not-a-date" }), await call("rejectAgentAccount", { agentAccountId: id, expectedUpdatedAt: "" })];
    eq(noStamp.map((r) => r.code), ["VALIDATION", "VALIDATION", "VALIDATION", "VALIDATION"], "ไม่ส่งตรา");
    const old = "2020-01-01T00:00:00.000Z";
    const staleA = await call("approveAgentAccount", { agentAccountId: id, expectedUpdatedAt: old }), staleR = await call("rejectAgentAccount", { agentAccountId: id, expectedUpdatedAt: old });
    eq([staleA.code, staleA.reason, staleR.code, staleR.reason, await snap(), await writes()], ["STALE", "STATE_CONFLICT", "STALE", "STATE_CONFLICT", s0, [0, 0, 0]], "ตราเก่า ⇒ ไม่เขียน");
    const view = await detail(s, id); // ร้านเปิดดูใบสมัคร "GOOD"
    const w = await withdrawAs(k, s.slug), re = await applyAs(k, s.slug, app({ legalName: other }));
    ok(w.status === "CLOSED" && re.status === "PENDING" && re.agentAccountId === id && view.legalName === good, `สลับใบสมัคร: ${fmt([w, re])}`);
    const swA = await call("approveAgentAccount", { agentAccountId: id, expectedUpdatedAt: view.updatedAt }), swR = await call("rejectAgentAccount", { agentAccountId: id, expectedUpdatedAt: view.updatedAt });
    const mid = await acc(id);
    eq([swA.code, swA.reason, swR.code, swR.reason, mid?.status, mid?.legalName, mid?.approvedAt ?? null, await writes()], ["STALE", "STATE_CONFLICT", "STALE", "STATE_CONFLICT", "PENDING", other, null, [0, 0, 0]], "ตราของใบสมัครเดิม");
    const fresh = await detail(s, id);
    const okA = await call("approveAgentAccount", { agentAccountId: id, expectedUpdatedAt: fresh.updatedAt });
    eq([okA.ok, okA.status, okA.replayed, (await acc(id))?.status, await writes()], [true, "ACTIVE", false, "ACTIVE", [1, 1, 1]], "ตราปัจจุบัน");
  });

  // ─────────────────── มติ §10 ข้อ 6 — login แข่ง disable (ลำดับกำหนดได้) ───────────────────
  await st("RU-9", "มติ §10 ข้อ 6 (RV-F6 · T-6): ผู้ใช้ถูกปิดระหว่างเข้าระบบ — ข้อสอบถือล็อกตัวตน + ปิดผู้ใช้ + เพิกถอน session ใน tx ที่ยังไม่ commit แล้วยิงยืนยันรหัสที่ถูก รอจนติดรอ/จบ จึง commit ⇒ ยืนยันไม่สำเร็จ · ไม่มี session ที่ยังไม่ถูกเพิกถอนของผู้ใช้ DISABLED", async () => {
    needBuilt();
    const v = await mkIdent("ru9");
    const e = mail("ru9");
    const before = await login(e);
    const r1 = await reqCode(e, mo());
    const code = lastMail(e, "LOGIN_CODE")?.code;
    ok(r1.ok === true && code, `ขอรหัส: ${fmt(r1)}`);
    const out = await underHeldTx(async (c) => {
      await c.query(`SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text))`, ["agency.identity.v1", v.identityId]);
      await c.query(`UPDATE "AgentUser" SET status = 'DISABLED' WHERE id = $1`, [v.agentUserId]);
      await c.query(`UPDATE "AgentSession" SET "revokedAt" = now() WHERE "agentUserId" = $1 AND "revokedAt" IS NULL`, [v.agentUserId]);
    }, () => AU("verifyAgentLoginCode")({ email: e, codeId: r1.codeId, code }, mo()));
    if (out.res.ok === true) allTokens.push(String(out.res.token));
    const status = (await q<{ status: string }>(`SELECT status FROM "AgentUser" WHERE id = $1`, [v.agentUserId]))[0]?.status;
    eq([out.res.threw, out.res.ok === true, await liveSessions(v.agentUserId), status, await AU("resolveAgentSession")(before.token)], [undefined, false, 0, "DISABLED", null], `ผล (ติดรอล็อก=${out.waited} · ${fmt(out.res)})`);
  });

  // ─────────────────── มติ §10 ข้อ 7 — now ของผู้เรียกไม่มีผลกับอายุ session ───────────────────
  await st("RU-10", "มติ §10 ข้อ 7 (RV-F7 · T-7): ตัวห่อที่ส่งออกทุกตัวตัดสิน session ด้วยนาฬิกาจริง — session ปกติ + now อนาคต 400 วัน ⇒ ยังใช้ได้และ idle ไม่ถูกเลื่อนเกิน 72 ชม.จริง · session หมด idle/หมดอายุสัมบูรณ์ (เลื่อนแถวด้วย SQL) + now อดีต ⇒ ผลเหมือน token ที่ไม่มีจริงทุกตัว (15 ฟังก์ชัน) ไม่มีผลข้างเคียง · คืนแถวแล้วใช้ได้", async () => {
    needBuilt();
    const s = await mkShop2("ru10", { auto: true }), s2 = await mkShop2("ru10b");
    const k = await signup(mail("ru10"), "RU10");
    const a = await applyAs(k, s.slug);
    ok(a.status === "ACTIVE", `สมัคร: ${fmt(a)}`);
    const id = String(a.agentAccountId);
    const th = authHash("session", k.token);
    const far = { now: new Date(Date.now() + 400 * 86_400_000) };
    const liveRes = [
      !!(await AU("resolveAgentSession")(k.token, far)), R(await AU("agentScope")(k.token, { shopSlug: s.slug }, far)).agentAccountId === id,
      R(await AU("selectAgentAccount")(k.token, { shopSlug: s.slug }, far)).ok, R(await AU("myAgentAccounts")(k.token, far)).ok, R(await AU("agentTeam")(k.token, far)).ok,
    ];
    const idleOk = (await q<{ b: boolean }>(`SELECT ("idleExpiresAt" <= now() + interval '73 hours' AND "idleExpiresAt" <= "expiresAt" AND "expiresAt" <= now() + interval '31 days') AS b FROM "AgentSession" WHERE "tokenHash" = $1`, [th]))[0]?.b;
    eq([liveRes, idleOk], [[true, true, true, true, true], true], "now อนาคตไม่ทำให้หมดอายุ/ไม่เลื่อน idle");
    const past = new Date(Date.now() - 2 * 3_600_000), old = { now: past };
    const probe = async (token: string): Promise<unknown[]> => {
      const out: unknown[] = [await AU("resolveAgentSession")(token, old), await AU("agentScope")(token, { shopSlug: s.slug }, old)];
      const calls: (() => Promise<unknown>)[] = [
        () => AU("selectAgentAccount")(token, { shopSlug: s.slug }, old),
        () => AU("myAgentAccounts")(token, old),
        () => AU("logoutAllAgentSessions")(token, old),
        () => AU("agentTeam")(token, old),
        () => AU("setTeammateRole")(token, { targetUserId: k.agentUserId, role: "OWNER" }, old),
        () => AU("agentApply")(token, { shopSlug: s2.slug, application: app() }, mo(past)),
        () => AU("agentAcceptInvite")(token, { shopSlug: s.slug }, mo(past)),
        () => AU("agentWithdraw")(token, { shopSlug: s.slug }, mo(past)),
        () => AU("createTeammateInvite")(token, { email: mail("ru10-x"), role: "SALES" }, mo(past)),
        () => AU("disableTeammate")(token, { targetUserId: k.agentUserId }, old),
        () => AU("eraseTeammate")(token, { targetUserId: k.agentUserId }, old),
        () => AU("closeMyIdentity")(token, { confirm: true }, old),
        () => AU("setAccountMember")(token, { agentAccountId: id, targetUserId: k.agentUserId, role: "OWNER" }, old),
      ];
      for (const c of calls) { const r = await safe(c); out.push(r.threw !== undefined ? `throw` : r.ok === true ? "OK!" : `${String(r.code)}/${String(r.reason ?? "")}`); }
      return out;
    };
    const unknownToken = await probe(`ag_${randomBytes(32).toString("base64url")}`);
    ok(unknownToken[0] === null && unknownToken[1] === null && unknownToken.slice(2).every((x) => typeof x === "string" && x !== "OK!" && x !== "throw"), `token ที่ไม่มีจริง: ${fmt(unknownToken)}`);
    const keep = (await q<{ i: string; e: string }>(`SELECT "idleExpiresAt"::text AS i, "expiresAt"::text AS e FROM "AgentSession" WHERE "tokenHash" = $1`, [th]))[0];
    let idle: unknown[] = [], abs: unknown[] = [];
    try {
      await q(`UPDATE "AgentSession" SET "idleExpiresAt" = now() - interval '1 minute' WHERE "tokenHash" = $1`, [th]);
      idle = await probe(k.token);
      await q(`UPDATE "AgentSession" SET "expiresAt" = now() - interval '1 minute', "idleExpiresAt" = now() - interval '2 minutes' WHERE "tokenHash" = $1`, [th]);
      abs = await probe(k.token);
    } finally {
      await q(`UPDATE "AgentSession" SET "expiresAt" = $2::timestamp, "idleExpiresAt" = $3::timestamp WHERE "tokenHash" = $1`, [th, keep.e, keep.i]);
    }
    eq([idle, abs], [unknownToken, unknownToken], "session หมดอายุ + now อดีต ต้องเหมือน token ที่ไม่มีจริง");
    const st1 = (await q<{ r: Date | null }>(`SELECT "revokedAt" AS r FROM "AgentSession" WHERE "tokenHash" = $1`, [th]))[0];
    eq([st1?.r ?? null, await accountOf(s2.id, k.identityId), mails.some((m) => m.to === mail("ru10-x")), (await q<{ status: string }>(`SELECT status FROM "AgentIdentity" WHERE id = $1`, [k.identityId]))[0]?.status, (await acc(id))?.status],
      [null, null, false, "ACTIVE", "ACTIVE"], "ไม่มีผลข้างเคียง");
    ok(await AU("resolveAgentSession")(k.token), "คืนแถวแล้ว session ต้องใช้ได้ (ตัวควบคุม)");
  });
  await st("RU-11", "T-7: เลื่อน idle = min(นาฬิกาจริง + 72 ชม., expiresAt) · ไม่เกิน 1 ครั้ง/5 นาที (เพิ่งใช้ไป 1 นาที ⇒ ไม่เลื่อน) · ออกจากระบบทุกเครื่องไม่แตะ session ของผู้ใช้อื่นในตัวตนเดียวกัน", async () => {
    needBuilt();
    const o = await signup(mail("ru11"), "RU11");
    const mate = await teammate(o, mail("ru11m"), "SALES", "RU11M");
    const th = authHash("session", o.token);
    const look = async () => (await q<{ atAbs: boolean; near72: boolean; touched: boolean; i: string; u: string }>(`SELECT ("idleExpiresAt" = "expiresAt") AS "atAbs", ("idleExpiresAt" BETWEEN now() + interval '71 hours' AND now() + interval '73 hours') AS near72,
      ("updatedAt" > now() - interval '4 minutes') AS touched, "idleExpiresAt"::text AS i, "updatedAt"::text AS u FROM "AgentSession" WHERE "tokenHash" = $1`, [th]))[0];
    // (ก) ใกล้หมดอายุสัมบูรณ์: idle ถูกตรึงที่ expiresAt
    await q(`UPDATE "AgentSession" SET "expiresAt" = now() + interval '1 hour', "idleExpiresAt" = now() + interval '30 minutes', "updatedAt" = now() - interval '10 minutes' WHERE "tokenHash" = $1`, [th]);
    ok(await AU("resolveAgentSession")(o.token), "ต้องใช้ได้ (ก)");
    const a = await look();
    ok(await AU("resolveAgentSession")(o.token), "ต้องใช้ได้ (ก2)");
    const a2 = await look();
    eq([a?.atAbs, a?.touched, a2?.u === a?.u, a2?.i === a?.i], [true, true, true, true], "ตรึงที่ expiresAt + ไม่เลื่อนซ้ำทันที");
    // (ข) เหลืออายุอีกนาน: idle = ตอนนี้ + 72 ชม.
    await q(`UPDATE "AgentSession" SET "expiresAt" = now() + interval '20 days', "idleExpiresAt" = now() + interval '30 minutes', "updatedAt" = now() - interval '10 minutes' WHERE "tokenHash" = $1`, [th]);
    ok(await AU("resolveAgentSession")(o.token), "ต้องใช้ได้ (ข)");
    const b = await look();
    // (ค) เพิ่งใช้เมื่อ 1 นาทีก่อน: ไม่เลื่อน
    await q(`UPDATE "AgentSession" SET "idleExpiresAt" = now() + interval '30 minutes', "updatedAt" = now() - interval '1 minute' WHERE "tokenHash" = $1`, [th]);
    const c0 = await look();
    ok(await AU("resolveAgentSession")(o.token), "ต้องใช้ได้ (ค)");
    const c1 = await look();
    eq([b?.near72, b?.atAbs, c1?.i === c0?.i, c1?.u === c0?.u], [true, false, true, true], "72 ชม. + ไม่เลื่อนภายใน 5 นาที");
    const lo = R(await AU("logoutAllAgentSessions")(o.token));
    eq([lo.ok, Number(lo.revoked) >= 1, await AU("resolveAgentSession")(o.token), !!(await AU("resolveAgentSession")(mate.token))], [true, true, null, true], "ออกทุกเครื่อง");
  });

  // ─────────────────── มติ §10 ข้อ 10 — เพดานใต้ล็อก (ยิงพร้อมกันไม่เกิน) ───────────────────
  await st("RU-12", "มติ §10 ข้อ 10 (RV-F10 · H-F10 · T-15): ร้านมี PENDING ค้าง = เพดาน − 3 แล้วตัวตนใหม่ 8 รายสมัครพร้อมกัน ⇒ ผ่าน 3 พอดี · RATE_LIMITED 5 · PENDING ของร้าน = openPendingPerShop พอดี · ไม่มี throw", async () => {
    needBuilt();
    const tE = await mkShop("ru12");
    const cap = lim("openPendingPerShop");
    const ids = await Promise.all(Array.from({ length: 8 }, (_, i) => mkIdent(`ru12-${i}`)));
    let rs: Rec[] = [], n = -1, mine = -1;
    try {
      await pool.query(`INSERT INTO "AgentAccount" (id, "tenantId", "identityId", code, status, "partyId", "unitIds", "legalName", "payeeType", "updatedAt")
        SELECT 'a12capp_' || g || '_' || $2, $1, 'a12cappid_' || g || '_' || $2, 'Q' || g, 'PENDING', 'qcparty', '{}', $3, 'TH_JURISTIC', now() FROM generate_series(1, $4::int) g`, [tE, STAMP, `${QC_MARK} cap`, cap - 3]);
      rs = await settle(ids.map((v) => AS("applyToShop")({ agentUserId: v.agentUserId }, { tenantId: tE, application: app() }, { deps: OPEN_DEPS })));
      n = await count(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1 AND status = 'PENDING'`, [tE]);
      mine = await count(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1 AND "identityId" = ANY($2::text[])`, [tE, ids.map((v) => v.identityId)]);
    } finally {
      await pool.query(`DELETE FROM "AgentAccount" WHERE "tenantId" = $1 AND id LIKE 'a12capp_%'`, [tE]);
    }
    eq([n, rs.filter((r) => r.ok === true && r.status === "PENDING").length, rs.filter((r) => r.code === "RATE_LIMITED").length, rs.filter((r) => r.threw !== undefined).length, mine], [cap, 3, 5, 0, 3], `ผล ${fmt(rs.find((r) => r.ok !== true && r.code !== "RATE_LIMITED"))}`);
  });
  await st("RU-13", "มติ §10 ข้อ 10 (RV-F10 · T-15): ตัวตนมีคำเชิญด้วยรหัสค้าง = เพดาน − 2 (ต่างร้าน) แล้ว 4 ร้านเชิญด้วยรหัสพร้อมกัน ⇒ ผ่าน 2 พอดี · RATE_LIMITED 2 · คำเชิญค้างของตัวตน = openCodeInvitesPerIdentity พอดี", async () => {
    needBuilt();
    const k = await mkIdent("ru13");
    const cap = lim("openCodeInvitesPerIdentity");
    await Promise.all(Array.from({ length: cap - 2 }, async (_, i) => {
      const t = await mkShop(`rk${i}`);
      await ins("AgentAccount", { id: rid("capj"), tenantId: t, identityId: k.identityId, code: `K${i}`, status: "INVITED", partyId: "qcparty", unitIds: [], legalName: `${QC_MARK} ru13`, payeeType: "TH_JURISTIC" });
    }));
    const shops: Shop2[] = [];
    for (let i = 0; i < 4; i++) shops.push(await mkShop2(`ru13s${i}`));
    const rs = await settle(shops.map((s, i) => AG("inviteAgent")(s.ctx, { mode: "CODE", publicCode: k.publicCode, legalName: `${QC_MARK} ru13`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-ru13-${i}` }, { deps: OPEN_DEPS })));
    const open = await count(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "identityId" = $1 AND status = 'INVITED'`, [k.identityId]);
    eq([rs.filter((r) => r.ok === true && r.status === "INVITED").length, rs.filter((r) => r.code === "RATE_LIMITED").length, rs.filter((r) => r.threw !== undefined).length, open], [2, 2, 0, cap], `ผล ${fmt(rs)}`);
  });

  // ─────────────────── มติ §10 ข้อ 11 — สมัครซ้ำล้างเงื่อนไขการค้า ───────────────────
  await st("RU-14", "มติ §10 ข้อ 11 (RV-F11 · T-14): สมัครซ้ำ (หลังร้านปิด ⇒ PENDING) ล้าง tierId + unitIds ของยุคก่อน · คง code · ลิงก์ CRM · ข้อมูลธนาคาร · Party · สมัครซ้ำที่ ACTIVE ทันที (คำเชิญด้วยรหัสที่ร้านถอน · ร้านอนุมัติอัตโนมัติ) ⇒ tierId = ค่าเริ่มต้นของร้าน (ไม่ใช่ของเก่า) + unitIds ว่าง + code เดิม", async () => {
    needBuilt();
    // (ก) ปิดโดยร้าน → สมัครซ้ำ ⇒ PENDING
    const s = await mkShop2("ru14");
    const tierOld = rid("tier");
    const dfltOf = async (x: Shop2) => R(await SETF("resolveSetting")({ tenantId: x.id }, "agency.tier.newAgentTier", { unitId: x.unitId })).value;
    const notDefault = (d: unknown) => ["C", "A", "B"].find((c) => c !== d) ?? "C"; // AgentTier.code รับเฉพาะ A/B/C
    await ins("AgentTier", { id: tierOld, tenantId: s.id, code: notDefault(await dfltOf(s)), name: "ระดับยุคก่อน" });
    const k = await signup(mail("ru14"), "RU14");
    const a1 = await applyAs(k, s.slug);
    const id = String(a1.agentAccountId);
    const ap = await shopDo("approveAgentAccount", s.ctx, { agentAccountId: id, code: "KEEP1", unitIds: [s.unitId] });
    const d0 = await detail(s, id);
    const pt = await shopDo("updateAgentAccountProfile", s.ctx, { agentAccountId: id, expectedUpdatedAt: d0.updatedAt, patch: { bankAccount: "1234567890" } });
    ok(ap.status === "ACTIVE" && pt.ok === true, `ตั้งต้น: ${fmt([ap, pt])}`);
    await q(`UPDATE "AgentAccount" SET "tierId" = $2, "crmCompanyId" = $3 WHERE id = $1`, [id, tierOld, "qccrm-ru14"]);
    const before = await acc(id);
    eq([before?.code, before?.unitIds, before?.tierId, before?.bankLast4, typeof before?.bankAccountEnc], ["KEEP1", [s.unitId], tierOld, "7890", "string"], "ก่อนปิด (ตัวควบคุม)");
    const c = await shopDo("closeAgentAccount", s.ctx, { agentAccountId: id });
    const re = await applyAs(k, s.slug, app(), cooled());
    const after = await acc(id);
    eq([c.status, re.status, re.agentAccountId, after?.tierId ?? null, after?.unitIds, after?.code, after?.crmCompanyId, after?.bankLast4, after?.bankAccountEnc === before?.bankAccountEnc, after?.partyId === before?.partyId, after?.approvedAt ?? null, after?.approvedById ?? null],
      ["CLOSED", "PENDING", id, null, [], "KEEP1", "qccrm-ru14", "7890", true, true, null, null], "สมัครซ้ำ ⇒ PENDING");
    // (ข) คำเชิญด้วยรหัสที่ร้านถอน → เอเจนซี่สมัครเอง ⇒ ACTIVE ทันที
    const s2 = await mkShop2("ru14b", { auto: true });
    const tierOld2 = rid("tier");
    const dflt = await dfltOf(s2);
    await ins("AgentTier", { id: tierOld2, tenantId: s2.id, code: notDefault(dflt), name: "ระดับยุคก่อน" });
    let tierDefault: string | null = null;
    if (typeof dflt === "string" && ["A", "B", "C"].includes(dflt)) { tierDefault = rid("tier"); await ins("AgentTier", { id: tierDefault, tenantId: s2.id, code: dflt, name: "ระดับเริ่มต้น" }); }
    const k2 = await signup(mail("ru14b"), "RU14B");
    const inv = await shopDo("inviteAgent", s2.ctx, { mode: "CODE", publicCode: k2.publicCode, legalName: `${QC_MARK} ru14b`, payeeType: "TH_JURISTIC", code: "KEEP2", unitIds: [s2.unitId], idempotencyKey: `qca12-${STAMP}-ru14b` });
    ok(inv.status === "INVITED", `เชิญ: ${fmt(inv)}`);
    const id2 = String(inv.agentAccountId);
    await q(`UPDATE "AgentAccount" SET "tierId" = $2 WHERE id = $1`, [id2, tierOld2]);
    const rv = await shopDo("revokeAgentInvite", s2.ctx, { agentAccountId: id2 });
    const re2 = await applyAs(k2, s2.slug);
    const after2 = await acc(id2);
    eq([rv.status, re2.status, re2.agentAccountId, after2?.tierId ?? null, after2?.unitIds, after2?.code], ["CLOSED", "ACTIVE", id2, tierDefault, [], "KEEP2"], `สมัครซ้ำ ⇒ ACTIVE (ค่าตั้งระดับเริ่มต้น = ${fmt(dflt)})`);
  });

  // ─────────────────── มติ §10 ข้อ 12 + §11 ข้อ 2 — สมาชิกของผู้ใช้ที่ถูกปิด ───────────────────
  await st("RU-15", "มติ §10 ข้อ 12 + §11 ข้อ 2 (RV-F12): ผู้ใช้ถูกปิด ⇒ รายละเอียดฝั่งร้าน members[].active = false (คีย์ 4 ตัวเดิม) · memberCount ไม่นับ · removeAgentAccountMember: ไม่มีสิทธิ์ edit ⇒ FORBIDDEN · สมาชิกที่ยังใช้ได้ ⇒ BAD_STATE · ร้านอื่น/สมาชิกที่ไม่มี ⇒ NOT_FOUND · สมาชิกที่ใช้ไม่ได้ ⇒ ถอดได้ (audit agency.member.remove ผู้ทำ USER) · ซ้ำ ⇒ replayed · ฝั่งเอเจนซี่: ให้บทบาทผู้ใช้ที่ถูกปิดไม่ได้ แต่ถอดได้", async () => {
    needBuilt();
    const s = await mkShop2("ru15", { auto: true }), sOther = await mkShop2("ru15b");
    const viewer = await mkStaff("ru15v", s.id, "STAFF", ["*"], { "agency.account.view": true });
    const o = await signup(mail("ru15"), "RU15");
    const t1 = await teammate(o, mail("ru15t"), "SALES", "RU15T"), t2 = await teammate(o, mail("ru15u"), "SALES", "RU15U");
    const a = await applyAs(o, s.slug);
    ok(a.status === "ACTIVE", `สมัคร: ${fmt(a)}`);
    const id = String(a.agentAccountId);
    for (const t of [t1, t2]) ok(R(await AU("setAccountMember")(o.token, { agentAccountId: id, targetUserId: t.agentUserId, role: "SALES" })).ok === true, "เพิ่มสมาชิก");
    const midOf = async (u: string) => (await q<{ id: string }>(`SELECT id FROM "AgentAccountMember" WHERE "agentAccountId" = $1 AND "agentUserId" = $2`, [id, u]))[0]?.id ?? "";
    const mO = await midOf(o.agentUserId), m1 = await midOf(t1.agentUserId), m2 = await midOf(t2.agentUserId);
    const view = async () => {
      const d = await detail(s, id);
      const ms = (d.members as Rec[]) ?? [];
      const item = (((await shopDo("listAgentAccounts", s.ctx, {})).items as Rec[]) ?? []).find((i) => i.id === id);
      return { flags: [mO, m1, m2].map((m) => ms.find((x) => x.memberId === m)?.active), keys: ms.map((x) => sortedKeys(x).join(",")), count: item?.memberCount, never: [...keysDeep([d, item])].filter((x) => neverNow().includes(x)) };
    };
    const v0 = await view();
    eq([v0.flags, v0.count], [[true, true, true], 3], "ก่อนปิดผู้ใช้");
    for (const t of [t1, t2]) ok(R(await AU("disableTeammate")(o.token, { targetUserId: t.agentUserId })).ok === true, "ปิดผู้ใช้");
    const v1 = await view();
    eq([v1.flags, v1.count, [...new Set(v1.keys)], v1.never], [[true, false, false], 1, ["active,displayName,memberId,role"], []], "หลังปิดผู้ใช้");
    const rm = (ctx: { tenantId: string; actorUserId: string }, memberId: string) => safe(() => AG("removeAgentAccountMember")(ctx, { agentAccountId: id, memberId }));
    const forb = await rm(ctxOf(s.id, viewer), m1), usable = await rm(s.ctx, mO), otherShop = await rm(sOther.ctx, m1), bogus = await rm(s.ctx, rid("nomember"));
    const stillActive = (await q<{ active: boolean }>(`SELECT active FROM "AgentAccountMember" WHERE id = ANY($1::text[]) ORDER BY id`, [[mO, m1]])).map((r) => r.active);
    eq([forb.code, usable.code, otherShop.code, bogus.code, stillActive], ["FORBIDDEN", "BAD_STATE", "NOT_FOUND", "NOT_FOUND", [true, true]], "กติกาถอด");
    const done = await rm(s.ctx, m1), again = await rm(s.ctx, m1);
    const au = (await q<{ actorType: string; actorId: string | null; after: unknown }>(`SELECT "actorType"::text AS "actorType", "actorId", after FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'agency.member.remove' AND "targetId" = $2`, [s.id, m1]));
    eq([done.ok, done.replayed, sortedKeys(done), again.ok, again.replayed, (await q<{ active: boolean }>(`SELECT active FROM "AgentAccountMember" WHERE id = $1`, [m1]))[0]?.active, au.map((x) => [x.actorType, x.actorId])],
      [true, false, ["agentAccountId", "memberId", "ok", "replayed"], true, true, false, [["USER", s.owner.userId]]], "ถอดสมาชิกที่ใช้ไม่ได้");
    ok(au.every((x) => Object.keys(R(x.after)).every((kk) => AUDIT_AFTER_KEYS.includes(kk))) && leaks(JSON.stringify([done, au]), [t1.agentUserId, o.identityId]).length === 0, `audit/ผลต้องไม่มี id global: ${fmt(au)}`);
    // ฝั่งเอเจนซี่
    const give = R(await AU("setAccountMember")(o.token, { agentAccountId: id, targetUserId: t2.agentUserId, role: "SALES" }));
    const mid2 = (await q<{ role: string; active: boolean }>(`SELECT role, active FROM "AgentAccountMember" WHERE id = $1`, [m2]))[0];
    const promote = R(await AS("setAgentAccountMember")({ agentUserId: o.agentUserId }, { agentAccountId: id, agentUserId: t2.agentUserId, role: "ACCOUNTING" }));
    const take = R(await AU("setAccountMember")(o.token, { agentAccountId: id, targetUserId: t2.agentUserId, role: null }));
    eq([give.code, mid2, promote.code, take.ok, (await q<{ active: boolean }>(`SELECT active FROM "AgentAccountMember" WHERE id = $1`, [m2]))[0]?.active], ["NOT_FOUND", { role: "SALES", active: true }, "NOT_FOUND", true, false], "ฝั่งเอเจนซี่กับผู้ใช้ที่ถูกปิด");
  });
  await st("RU-16", "T-11 setAgentAccountMember: บทบาทสมาชิกสูงกว่าบทบาทผู้ใช้ ⇒ VALIDATION reason ROLE_ABOVE_USER · บัญชีหรือผู้ใช้ของตัวตนอื่น ⇒ NOT_FOUND · ADMIN ถอดสมาชิก OWNER/ADMIN ⇒ FORBIDDEN (แถวไม่เปลี่ยน) · ADMIN ถอด SALES ได้", async () => {
    needBuilt();
    const s = await mkShop2("ru16", { auto: true });
    const o = await signup(mail("ru16"), "RU16"), other = await signup(mail("ru16x"), "RU16X");
    const adm = await teammate(o, mail("ru16a"), "ADMIN", "RU16A"), adm2 = await teammate(o, mail("ru16b"), "ADMIN", "RU16B"), sales = await teammate(o, mail("ru16s"), "SALES", "RU16S");
    const a = await applyAs(o, s.slug), ax = await applyAs(other, s.slug);
    ok(a.status === "ACTIVE" && ax.status === "ACTIVE", `สมัคร: ${fmt([a, ax])}`);
    const id = String(a.agentAccountId);
    const set = async (by: Who, account: string, target: string, role: string | null): Promise<Rec> => R(await AU("setAccountMember")(by.token, { agentAccountId: account, targetUserId: target, role }));
    const seat = [await set(o, id, adm.agentUserId, "ADMIN"), await set(o, id, adm2.agentUserId, "ADMIN"), await set(o, id, sales.agentUserId, "SALES")];
    ok(seat.every((r) => r.ok === true), `ตั้งสมาชิก: ${fmt(seat)}`);
    const above = await set(o, id, sales.agentUserId, "ADMIN");
    const foreignAccount = await set(o, String(ax.agentAccountId), sales.agentUserId, "SALES"), foreignUser = await set(o, id, other.agentUserId, "SALES");
    const rmOwner = await set(adm, id, o.agentUserId, null), rmAdmin = await set(adm, id, adm2.agentUserId, null), downAdmin = await set(adm, id, adm2.agentUserId, "SALES");
    const rows = await q<{ u: string; role: string; active: boolean }>(`SELECT "agentUserId" AS u, role, active FROM "AgentAccountMember" WHERE "agentAccountId" = $1`, [id]);
    const rowOf = (u: string) => { const r = rows.find((x) => x.u === u); return r ? `${r.role}:${r.active}` : "none"; };
    eq([above.code, above.reason, foreignAccount.code, foreignUser.code, rmOwner.code, rmAdmin.code, downAdmin.code, rowOf(o.agentUserId), rowOf(adm2.agentUserId), rowOf(sales.agentUserId), rowOf(other.agentUserId)],
      ["VALIDATION", "ROLE_ABOVE_USER", "NOT_FOUND", "NOT_FOUND", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "OWNER:true", "ADMIN:true", "SALES:true", "none"], "ผล");
    const rmSales = await set(adm, id, sales.agentUserId, null);
    eq([rmSales.ok, (await q<{ active: boolean }>(`SELECT active FROM "AgentAccountMember" WHERE "agentAccountId" = $1 AND "agentUserId" = $2`, [id, sales.agentUserId]))[0]?.active], [true, false], "ADMIN ถอด SALES");
  });

  // ─────────────────── มติ §10 ข้อ 13 — RV-F13 ───────────────────
  await st("RU-17", "มติ §10 ข้อ 13 (RV-F13 ก–ง · T-13 · T-19): เชิญด้วยรหัสสาธารณะตัวเล็ก/มีช่องว่าง ⇒ เหมือนการค้น (INVITED) · เปลี่ยน payeeType ขณะมีเลขภาษี: ไม่ส่งเลข ⇒ VALIDATION reason TAX_ID_REQUIRED / เลขไม่ตรงชนิดใหม่ ⇒ VALIDATION / เลขใหม่ถูกชนิด หรือ null ⇒ ok · ร้านแก้ผู้ติดต่อ ⇒ ตราความยินยอมของเอเจนซี่ถูกล้าง + source SHOP · หน่วยที่ปิด/หน่วยของร้านอื่น ไม่รับ (เชิญ · อนุมัติ · แก้) · แก้บัญชี CLOSED ⇒ BAD_STATE", async () => {
    needBuilt();
    const s = await mkShop2("ru17"), sOther = await mkShop2("ru17b");
    const uClosed = rid("uru17x");
    await ins("BusinessUnit", { id: uClosed, tenantId: s.id, type: "TRIPS", name: "หน่วยปิด", slug: `${SLUG}ru17x-${STAMP}`, status: "ARCHIVED" });
    // (ก) รหัสสาธารณะ
    const v = await mkIdent("ru17a");
    const sloppy = `  ${v.publicCode.toLowerCase()} `;
    const lk = await shopDo("lookupAgentIdentityByCode", s.ctx, { publicCode: sloppy });
    const ci = await shopDo("inviteAgent", s.ctx, { mode: "CODE", publicCode: sloppy, legalName: `${QC_MARK} ru17a`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-ru17a` });
    eq([R(lk.identity).publicCode, ci.status, (await acc(String(ci.agentAccountId)))?.identityId], [v.publicCode, "INVITED", v.identityId], "รหัสสาธารณะ");
    // (ง) หน่วย
    const iv = async (tag: string, unitIds: string[]) => { const r = await shopDo("inviteAgent", s.ctx, invEmail(mail(`ru17-${tag}`), `qca12-${STAMP}-ru17-${tag}`, { unitIds })); if (typeof r.inviteToken === "string") allTokens.push(r.inviteToken); return r; };
    const i1 = await iv("closed", [uClosed]), i2 = await iv("foreign", [sOther.unitId]), i3 = await iv("ok", [s.unitId]);
    const k = await signup(mail("ru17"), "RU17");
    const tax = thaiTaxId(`0105${digits(8)}`);
    const a1 = await applyAs(k, s.slug, app({ taxId: tax, contact: { name: `${QC_MARK} ru17 contact`, phone: "021234567" } }));
    ok(a1.status === "PENDING", `สมัคร: ${fmt(a1)}`);
    const id = String(a1.agentAccountId);
    const apClosed = await shopDo("approveAgentAccount", s.ctx, { agentAccountId: id, unitIds: [uClosed] }), apForeign = await shopDo("approveAgentAccount", s.ctx, { agentAccountId: id, unitIds: [sOther.unitId] });
    const stMid = (await acc(id))?.status;
    const ap = await shopDo("approveAgentAccount", s.ctx, { agentAccountId: id, unitIds: [s.unitId] });
    const patch = async (p: Rec): Promise<Rec> => shopDo("updateAgentAccountProfile", s.ctx, { agentAccountId: id, expectedUpdatedAt: (await detail(s, id)).updatedAt, patch: p });
    const pClosed = await patch({ unitIds: [uClosed] }), pForeign = await patch({ unitIds: [sOther.unitId] });
    eq([i1.code, i2.code, i3.status, apClosed.code, apForeign.code, stMid, ap.status, pClosed.code, pForeign.code, (await acc(id))?.unitIds], ["VALIDATION", "VALIDATION", "INVITED", "VALIDATION", "VALIDATION", "PENDING", "ACTIVE", "VALIDATION", "VALIDATION", [s.unitId]], "หน่วยที่ปิด/ของร้านอื่น");
    // (ข) payeeType กับเลขภาษีที่เก็บอยู่
    const person = thaiTaxId(`1${digits(11)}`);
    const b1 = await patch({ payeeType: "TH_PERSON" });
    const r1 = await acc(id);
    const b2 = await patch({ payeeType: "TH_PERSON", taxId: tax }); // เลขนิติบุคคล (ขึ้นต้น 0) ใต้ชนิดบุคคล
    const b3 = await patch({ payeeType: "TH_PERSON", taxId: person });
    const r3 = await acc(id);
    const b4 = await patch({ payeeType: "FOREIGN", taxId: null });
    const r4 = await acc(id);
    const b5 = await patch({ payeeType: "TH_JURISTIC" }); // ไม่มีเลขเก็บอยู่แล้ว ⇒ เปลี่ยนชนิดได้
    eq([b1.code, b1.reason, r1?.payeeType, r1?.taxIdLast4, b2.code, b3.ok, r3?.payeeType, r3?.taxIdLast4, String(r3?.taxIdEnc ?? "").includes(person), b4.ok, r4?.payeeType, r4?.taxIdLast4 ?? null, r4?.taxIdEnc ?? null, b5.ok],
      ["VALIDATION", "TAX_ID_REQUIRED", "TH_JURISTIC", tax.slice(-4), "VALIDATION", true, "TH_PERSON", person.slice(-4), false, true, "FOREIGN", null, null, true], "payeeType + เลขภาษี");
    // (ค) ร้านแก้ผู้ติดต่อ
    const c0 = R((await detail(s, id)).contact);
    const pc = await patch({ contact: { phone: "0812345678" } });
    const c1 = R(R(pc.account).contact);
    eq([c0.consentVersion, c0.source, pc.ok, c1.name, c1.phone, c1.consentVersion, c1.consentAt, c1.source], ["agency-apply-v1", "APPLY", true, `${QC_MARK} ru17 contact`, "0812345678", null, null, "SHOP"], "ร้านแก้ผู้ติดต่อ");
    // T-13
    const cl = await shopDo("closeAgentAccount", s.ctx, { agentAccountId: id });
    const pz = await patch({ legalName: `${QC_MARK} after close` });
    eq([cl.status, pz.code], ["CLOSED", "BAD_STATE"], "แก้บัญชีที่ปิดแล้ว");
  });
  await st("RU-18", "มติ §10 ข้อ 13 (RV-F13 จ): unique ของวิธีล็อกอินชนระหว่างสมัคร (ข้อสอบแทรกแถว AgentLogin ของอีเมลเดียวกันใน tx ที่ยังไม่ commit · รอจนยืนยันรหัสติดรอ แล้ว commit) ⇒ LOGIN_UNAVAILABLE ไม่ใช่ BUSY · ไม่มี ops ERROR · ไม่มีตัวตนใหม่ · ล็อกอินของอีเมลนั้นมีแถวเดียว", async () => {
    needBuilt();
    const holder = await mkIdent("ru18h");
    const e = mail("ru18");
    const r1 = await reqCode(e, mo());
    const code = lastMail(e, "LOGIN_CODE")?.code;
    ok(r1.ok === true && code, `ขอรหัส: ${fmt(r1)}`);
    const n0 = await opsErrors();
    const name = `${QC_MARK} RU18 ${STAMP}`;
    const out = await underHeldTx(
      async (c) => { await ins("AgentLogin", { id: rid("lg"), agentUserId: holder.agentUserId, kind: "EMAIL", providerId: "email", subject: e, verifiedAt: new Date() }, c); },
      () => verify({ email: e, codeId: r1.codeId, code, signup: { agencyName: name, ownerName: `${QC_MARK} owner ru18` } }, mo()),
    );
    const owners = (await q<{ u: string }>(`SELECT "agentUserId" AS u FROM "AgentLogin" WHERE subject = $1`, [e])).map((r) => r.u);
    eq([out.res.threw, out.res.code, await count(`SELECT count(*)::int AS n FROM "AgentIdentity" WHERE "displayName" = $1`, [name]), owners, (await opsErrors()) - n0], [undefined, "LOGIN_UNAVAILABLE", 0, [holder.agentUserId], 0], `ผล (ติดรอ=${out.waited} · ${fmt(out.res)})`);
  });

  // ─────────────────── มติ §10 ข้อ 14 + §11 ข้อ 3 — หนีการพักด้วยการปิดตัวตนแล้วสมัครใหม่ ───────────────────
  await st("RU-19", "มติ §10 ข้อ 14 (H-F3 · ส่วนอีเมลผู้ติดต่อ): ร้านอนุมัติอัตโนมัติพักบัญชีที่มีอีเมลผู้ติดต่อ C → ตัวตนอื่น (อีเมลล็อกอินอื่น) สมัครด้วยอีเมลผู้ติดต่อ C ⇒ PENDING (ผลรูปปกติ ไม่บอกเหตุ) · อีเมลผู้ติดต่ออื่น ⇒ ACTIVE · หลังร้านปิดบัญชีนั้น (CLOSED_BY_SHOP) ก็ยัง ⇒ PENDING", async () => {
    needBuilt();
    const s = await mkShop2("ru19", { auto: true });
    const c = mail("ru19-contact");
    const withContact = (email: string) => app({ contact: { name: `${QC_MARK} ru19 contact`, email } });
    const a = await signup(mail("ru19a"), "RU19A");
    const a1 = await applyAs(a, s.slug, withContact(c));
    ok(a1.status === "ACTIVE", `ตัวควบคุม: ร้านอนุมัติอัตโนมัติ — ${fmt(a1)}`);
    const sus = await shopDo("suspendAgentAccount", s.ctx, { agentAccountId: a1.agentAccountId });
    const b = await signup(mail("ru19b"), "RU19B"), d = await signup(mail("ru19d"), "RU19D"), g = await signup(mail("ru19g"), "RU19G");
    const b1 = await applyAs(b, s.slug, withContact(c));
    const d1 = await applyAs(d, s.slug, withContact(mail("ru19-other")));
    const cl = await shopDo("closeAgentAccount", s.ctx, { agentAccountId: a1.agentAccountId });
    const g1 = await applyAs(g, s.slug, withContact(c));
    eq([sus.status, b1.status, sortedKeys(b1), await AU("agentScope")(b.token, { shopSlug: s.slug }), d1.status, cl.status, g1.status], ["SUSPENDED", "PENDING", RESULT_KEYS, null, "ACTIVE", "CLOSED", "PENDING"], "ผล");
  });
  await st("RU-20", "มติ §11 ข้อ 3 (H-F3 T3 · ปิดให้ครบ): บัญชีถูกพัก (ไม่กรอกอีเมลผู้ติดต่อ) → ร้านแก้ผู้ติดต่อ → เอเจนซี่ปิดตัวตน → สมัครตัวตนใหม่ด้วยอีเมลล็อกอินเดิม → สมัครร้านอนุมัติอัตโนมัติเดิม ⇒ PENDING (ผลรูปปกติ · ประตู null) · อีเมลล็อกอินอื่นที่ร้านเดิม ⇒ ACTIVE · อีเมลเดิมที่ร้านอื่น ⇒ ACTIVE · แถวบัญชีเก็บแท็ก agentAuthHash('applicant-tag', tenantId:อีเมล) ผูกร้าน (ต่างร้านต่างค่า · อยู่รอดหลังปิดตัวตน) ไม่เก็บอีเมลดิบ · แท็กอยู่ใน NEVER_SHOW และไม่ออก DTO/รายการ/audit/outbox/ops", async () => {
    needBuilt();
    const s = await mkShop2("ru20", { auto: true }), s2 = await mkShop2("ru20b", { auto: true });
    const e = mail("ru20");
    const hx = (t: string) => t.slice(3);
    const tagS = authHash("applicant-tag", `${s.id}:${e}`), tagS2 = authHash("applicant-tag", `${s2.id}:${e}`);
    const x1 = await signup(e, "RU20");
    const a1 = await applyAs(x1, s.slug); // ไม่กรอกอีเมลผู้ติดต่อ (ช่องที่ probe hunt-1 [T3] ใช้)
    ok(a1.status === "ACTIVE", `ตัวควบคุม: ร้านอนุมัติอัตโนมัติ — ${fmt(a1)}`);
    const id1 = String(a1.agentAccountId);
    const sus = await shopDo("suspendAgentAccount", s.ctx, { agentAccountId: id1 });
    const ed = await shopDo("updateAgentAccountProfile", s.ctx, { agentAccountId: id1, expectedUpdatedAt: (await detail(s, id1)).updatedAt, patch: { contact: { phone: "0812345678" } } });
    const cl = R(await AU("closeMyIdentity")(x1.token, { confirm: true }));
    ok(sus.status === "SUSPENDED" && ed.ok === true && cl.ok === true, `พัก → ร้านแก้ผู้ติดต่อ → ปิดตัวตน: ${fmt([sus.status, ed.ok, cl])}`);
    const x2 = await signup(e, "RU20 again");
    ok(x2.identityId && x2.identityId !== x1.identityId, "ต้องเป็นตัวตนใหม่");
    const a2 = await applyAs(x2, s.slug);
    const scope = await AU("agentScope")(x2.token, { shopSlug: s.slug });
    const otherMail = await signup(mail("ru20o"), "RU20O");
    const o1 = await applyAs(otherMail, s.slug);
    const a3 = await applyAs(x2, s2.slug);
    eq([a2.ok, a2.status, sortedKeys(a2), scope, o1.status, a3.status], [true, "PENDING", RESULT_KEYS, null, "ACTIVE", "ACTIVE"], "สมัครใหม่ด้วยอีเมลล็อกอินเดิมหลังถูกพัก");
    const j1 = await rowJson(id1), j2 = await rowJson(String(a2.agentAccountId)), j3 = await rowJson(String(a3.agentAccountId));
    eq([j1.includes(hx(tagS)), j2.includes(hx(tagS)), j3.includes(hx(tagS2)), j3.includes(hx(tagS)), j1.includes(hx(tagS2)), [j1, j2, j3].some((j) => j.includes(e))], [true, true, true, false, false, false], "แท็กในแถวบัญชี (สูตรมติ · ผูกร้าน · ไม่มีอีเมลดิบ)");
    ok((CO("NEVER_SHOW_TO_SHOP_KEYS") as string[]).includes("applicantTag"), "applicantTag ต้องอยู่ใน NEVER_SHOW_TO_SHOP_KEYS");
    const shown = [await shopDo("getAgentAccount", s.ctx, { agentAccountId: id1 }), await shopDo("getAgentAccount", s.ctx, { agentAccountId: a2.agentAccountId }), await shopDo("listAgentAccounts", s.ctx, {}), await shopDo("getAgentAccount", s2.ctx, { agentAccountId: a3.agentAccountId }), await shopDo("listAgentAccounts", s2.ctx, {})];
    const rows = [
      ...(await q<{ j: string }>(`SELECT row_to_json(a)::text AS j FROM "AuditLog" a WHERE "tenantId" = ANY($1::text[])`, [[s.id, s2.id]])),
      ...(await q<{ j: string }>(`SELECT row_to_json(o)::text AS j FROM "OutboxEvent" o WHERE "tenantId" = ANY($1::text[])`, [[s.id, s2.id]])),
      ...(await q<{ j: string }>(`SELECT row_to_json(o)::text AS j FROM "OpsEvent" o WHERE "createdAt" >= $1`, [RUN_START])),
    ].map((r) => r.j).join("\n");
    const tagOther = authHash("applicant-tag", `${s.id}:${mail("ru20o")}`);
    eq([leaks(`${JSON.stringify(shown)}\n${rows}`, [hx(tagS), hx(tagS2), hx(tagOther)]), [...keysDeep(shown)].filter((kk) => /applicant/i.test(kk) || neverNow().includes(kk)), /applicant/i.test(rows)], [[], [], false], "แท็กไม่ออก DTO/รายการ/audit/outbox/ops");
  });
  await st("RU-21", "มติ §11 ข้อ 3 (ทางรับคำเชิญ + ปิดโดยร้าน): เชิญด้วยรหัส → รับ ⇒ ACTIVE (แถวเก็บแท็กของอีเมลล็อกอินผู้รับ) → ร้านปิดบัญชี → เอเจนซี่ปิดตัวตน → ตัวตนใหม่อีเมลล็อกอินเดิมสมัครร้านอนุมัติอัตโนมัติเดิม ⇒ PENDING ประตู null", async () => {
    needBuilt();
    const s = await mkShop2("ru21", { auto: true });
    const e = mail("ru21");
    const tagS = authHash("applicant-tag", `${s.id}:${e}`);
    const x1 = await signup(e, "RU21");
    const inv = await shopDo("inviteAgent", s.ctx, { mode: "CODE", publicCode: x1.publicCode, legalName: `${QC_MARK} ru21`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-ru21` });
    const ac = R(await AU("agentAcceptInvite")(x1.token, { shopSlug: s.slug }, mo()));
    ok(inv.status === "INVITED" && ac.status === "ACTIVE", `เชิญ/รับ: ${fmt([inv, ac])}`);
    const id1 = String(inv.agentAccountId);
    const cl = await shopDo("closeAgentAccount", s.ctx, { agentAccountId: id1 });
    const ci = R(await AU("closeMyIdentity")(x1.token, { confirm: true }));
    ok(cl.status === "CLOSED" && ci.ok === true, `ปิด: ${fmt([cl, ci])}`);
    const x2 = await signup(e, "RU21 again");
    const a2 = await applyAs(x2, s.slug);
    eq([a2.ok, a2.status, await AU("agentScope")(x2.token, { shopSlug: s.slug }), (await rowJson(id1)).includes(tagS.slice(3)), (await acc(id1))?.statusReason], [true, "PENDING", null, true, "CLOSED_BY_SHOP"], "ผล");
  });

  // ─────────────────── มติ §10 ข้อ 15 — cursor ผูกร้าน ───────────────────
  await st("RU-22", "มติ §10 ข้อ 15 (H-F4): listAgentAccounts ด้วย cursor = id บัญชีของร้านอื่น ⇒ ผลเท่ากับ cursor ที่ไม่มีจริงทุกไบต์ · cursor ของร้านเอง ⇒ แถวที่เก่ากว่าเท่านั้น · เดินทีละหน้า (limit 1) ได้ครบทุกแถว ไม่ซ้ำ ไม่ข้าม", async () => {
    needBuilt();
    const p = await mkShop2("ru22"), other = await mkShop2("ru22b");
    const inv = async (s: Shop2, tag: string): Promise<string> => { const r = await shopDo("inviteAgent", s.ctx, invEmail(mail(`ru22-${tag}`), `qca12-${STAMP}-ru22-${tag}`)); ok(r.ok === true, `เชิญ ${tag}: ${fmt(r)}`); allTokens.push(String(r.inviteToken)); return String(r.agentAccountId); };
    const p1 = await inv(p, "1"), p2 = await inv(p, "2"), f = await inv(other, "f"), p3 = await inv(p, "3");
    const list = (input: Rec) => shopDo("listAgentAccounts", p.ctx, input);
    const idsOf = (r: Rec) => ((r.items as Rec[]) ?? []).map((i) => String(i.id));
    const all = await list({});
    eq(idsOf(all), [p3, p2, p1], "ทั้งร้าน (ใหม่ก่อน)");
    const foreign = await list({ cursor: f }), none = await list({ cursor: `aa_${hex(12)}` });
    ok(foreign.ok === true && none.ok === true, `cursor แปลก: ${fmt([foreign, none])}`);
    eq(foreign, none, "cursor ของร้านอื่น ต้องเท่ากับ cursor ที่ไม่มีจริง");
    eq(idsOf(await list({ cursor: p3 })), [p2, p1], "cursor ของร้านเอง");
    const walked: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 6; i++) {
      const pg1 = await list({ limit: 1, ...(cursor ? { cursor } : {}) });
      walked.push(...idsOf(pg1));
      if (typeof pg1.nextCursor !== "string") break;
      cursor = pg1.nextCursor;
    }
    eq(walked, [p3, p2, p1], "เดินทีละหน้า");
  });

  // ─────────────────── มติ §10 ข้อ 16 — ถัง IP ───────────────────
  await st("RU-23", "มติ §10 ข้อ 16 (H-F5 · N1): ถังต่อ IP ใช้รูปมาตรฐาน — IPv6 ตัวสะกดต่างกัน/ที่อยู่อื่นใน /64 เดียวกัน = คีย์ถังเดียว · /64 อื่น = คนละคีย์ · IPv4 กับ ::ffff:IPv4 = คีย์เดียว · IP ผิดรูป ⇒ RATE_LIMITED NO_CLIENT ไม่ถามตัวจำกัด ไม่มีแถวรหัส · ipHash ของ session ใช้ที่อยู่รูปมาตรฐาน", async () => {
    needBuilt();
    const ask = async (ip: string) => {
      const seen: Seen[] = [];
      const e = mail(`ru23-${hex(4)}`);
      usedEmails.push(e);
      const r = R(await AU("requestAgentLoginCode")({ email: e }, meta(undefined, undefined, ip, recRate(seen))));
      if (r.ok === true) createdCodeIds.push(String(r.codeId));
      const rows = await count(`SELECT count(*)::int AS n FROM "AgentLoginCode" WHERE target = $1`, [authHash("login-target", e)]);
      return { r, ipKey: seen.find((x) => x.key.startsWith("agent:code:ip:"))?.key ?? null, calls: seen.length, rows };
    };
    const same64 = ["2001:db8:aa:bb::1", "2001:DB8:AA:BB::1", "2001:db8:aa:bb:0:0:0:1", "2001:0db8:00aa:00bb:0000:0000:0000:0001", "2001:db8:aa:bb::2", "2001:db8:aa:bb:ffff:ffff:ffff:ffff"];
    const ks: Awaited<ReturnType<typeof ask>>[] = [];
    for (const ip of same64) ks.push(await ask(ip));
    ok(ks.every((x) => x.r.ok === true && typeof x.ipKey === "string" && /^agent:code:ip:v1:[0-9a-f]{64}$/.test(x.ipKey)), `IPv6 ที่ถูกรูปต้องผ่านและมีคีย์ถังเป็นแฮช: ${fmt(ks.map((x) => [x.r.code ?? "ok", x.ipKey]))}`);
    const other64 = await ask("2001:db8:aa:bc::1"), v4 = await ask("10.77.1.2"), mapped = await ask("::ffff:10.77.1.2"), mappedHex = await ask("::ffff:a4d:102"), v4b = await ask("10.77.1.3");
    eq([new Set(ks.map((x) => x.ipKey)).size, other64.ipKey !== ks[0].ipKey && other64.r.ok, v4.ipKey === mapped.ipKey && v4.ipKey === mappedHex.ipKey && v4.r.ok, v4b.ipKey !== v4.ipKey && v4b.r.ok, v4.ipKey !== ks[0].ipKey], [1, true, true, true, true], "คีย์ถัง");
    const bad = ["10.1.2.300", "1.2.3", "1.2.3.4.5", "not-an-ip", "2001:db8:::1", "12345::1", "::ffff:1.2.3", "2001:db8::g", "10.0.0.1\u0000", " "];
    const bs: Awaited<ReturnType<typeof ask>>[] = [];
    for (const ip of bad) bs.push(await ask(ip));
    eq(bs.map((x) => `${String(x.r.code)}/${String(x.r.reason)}/${x.calls}/${x.rows}`), bad.map(() => "RATE_LIMITED/NO_CLIENT/0/0"), "IP ผิดรูป");
    // ipHash ของ session
    const v = await mkIdent("ru23u");
    const e = mail("ru23u");
    const loginFrom = async (ip: string): Promise<string> => {
      const r = await reqCode(e, mo(undefined, ip));
      const x = await verify({ email: e, codeId: r.codeId, code: lastMail(e, "LOGIN_CODE")?.code }, mo(undefined, ip));
      ok(x.ok === true, `เข้าระบบจาก ${ip}: ${fmt(x)}`);
      return String((await q<{ h: string | null }>(`SELECT "ipHash" AS h FROM "AgentSession" WHERE "tokenHash" = $1`, [authHash("session", String(x.token))]))[0]?.h);
    };
    const h1 = await loginFrom("2001:db8:aa:bb::1"), h2 = await loginFrom("2001:DB8:AA:BB:0:0:0:1"), h3 = await loginFrom("::ffff:10.77.1.2");
    eq([h1 === h2, h3, /^v1:[0-9a-f]{64}$/.test(h1), await liveSessions(v.agentUserId)], [true, authHash("ip", "10.77.1.2"), true, 3], "ipHash");
  });

  // ─────────────────── มติ §10 ข้อ 17 — อีเมล / codeId ───────────────────
  await st("RU-24", "มติ §10 ข้อ 17 (H-F6 · H-F7): อีเมลที่มีอักขระควบคุม/zero-width/bidi/BOM/soft hyphen/NUL/surrogate เดี่ยว ⇒ VALIDATION ทั้งขอรหัส (ก่อนถามตัวจำกัด · ไม่มีแถว/จดหมาย) · ยืนยัน · เชิญเพื่อน · ร้านเชิญ · อีเมลผู้ติดต่อในใบสมัคร (ด่านเดียวกัน) · ตัวใหญ่/ช่องว่างหัวท้าย = target เดียวกับรูปปกติ · codeId ผิดรูป ⇒ INVALID_CODE/VALIDATION โดยไม่ไปถึงถังต่อรหัส attempts ไม่ขยับ รหัสจริงยังใช้ได้ · อินพุตขยะของทางที่ไม่ล็อกอิน ⇒ ไม่มี ops ERROR แม้แต่แถวเดียว", async () => {
    needBuilt();
    const n0 = await opsErrors();
    const s = await mkShop2("ru24");
    const o = await signup(mail("ru24o"), "RU24");
    const base = mail("ru24");
    const put = (ch: string) => base.replace("-ru24-", `-ru${ch}24-`);
    const bad: [string, string][] = [["ZWSP", put("​")], ["ZWJ", put("‍")], ["NUL", put("\u0000")], ["ESC", put("\u001b")], ["LF", put("\n")], ["RTL override", put("‮")], ["LRI", put("⁦")], ["BOM", put("﻿")], ["soft hyphen", put("­")], ["lone surrogate", put("\ud800")], ["C1", put("\u0085")]];
    const codes0 = await count(`SELECT count(*)::int AS n FROM "AgentLoginCode"`);
    const m0 = mails.length;
    const lines: string[] = [];
    for (const [name, em] of bad) {
      const seen: Seen[] = [];
      const rq = await safe(() => AU("requestAgentLoginCode")({ email: em }, meta(undefined, undefined, undefined, recRate(seen))));
      const vf = await safe(() => AU("verifyAgentLoginCode")({ email: em, codeId: `alc_${hex(12)}`, code: "123456" }, mo()));
      const tm = await safe(() => AU("createTeammateInvite")(o.token, { email: em, role: "SALES" }, mo()));
      const iv = await safe(() => AG("inviteAgent")(s.ctx, invEmail(em, `qca12-${STAMP}-ru24-${hex(3)}`), { deps: OPEN_DEPS }));
      const ap = await safe(() => AU("agentApply")(o.token, { shopSlug: s.slug, application: app({ contact: { name: `${QC_MARK} c`, email: em } }) }, mo()));
      const got = [rq.code, vf.code, tm.code, iv.code, ap.code, seen.length].join("/");
      if (got !== "VALIDATION/VALIDATION/VALIDATION/VALIDATION/VALIDATION/0") lines.push(`${name}: ${got}`);
    }
    eq([lines, (await count(`SELECT count(*)::int AS n FROM "AgentLoginCode"`)) - codes0, mails.length - m0, await accountOf(s.id, o.identityId)], [[], 0, 0, null], "อีเมลที่มีอักขระต้องห้าม");
    const variants = [base, base.toUpperCase(), `  ${base} `];
    const targets: unknown[] = [];
    for (const em of variants) { const r = await reqCode(em, mo()); targets.push(r.ok === true ? (await q<{ target: string }>(`SELECT target FROM "AgentLoginCode" WHERE id = $1`, [String(r.codeId)]))[0]?.target : r.code); }
    usedEmails.push(base);
    eq(targets, variants.map(() => authHash("login-target", base)), "ตัวใหญ่/ช่องว่างหัวท้าย = target เดียว");
    // codeId
    const e = mail("ru24c");
    await mkIdent("ru24c");
    const r = await reqCode(e, mo());
    const code = lastMail(e, "LOGIN_CODE")?.code ?? "";
    const real = String(r.codeId);
    const seen: Seen[] = [];
    const badIds: unknown[] = ["alc_\u0000", `${real}\u0000`, "alc_zz", real.toUpperCase(), real.replace("alc_", "ALC_"), ` ${real}`, `${real} `, `${real}0`, real.slice(0, -1), `alc_${"g".repeat(24)}`, "x".repeat(64), `'; DROP TABLE "AgentLoginCode";--`, "x".repeat(65), 12345, null, { toString: () => real }, [real]];
    const got: string[] = [];
    for (const id of badIds) { const x = await safe(() => AU("verifyAgentLoginCode")({ email: e, codeId: id, code }, meta(undefined, undefined, undefined, recRate(seen)))); got.push(x.threw !== undefined ? "throw" : x.ok === true ? "OK!" : String(x.code)); }
    const row = (await q<{ attempts: number; usedAt: Date | null }>(`SELECT attempts, "usedAt" FROM "AgentLoginCode" WHERE id = $1`, [real]))[0];
    ok(got.every((x) => x === "INVALID_CODE" || x === "VALIDATION"), `codeId ผิดรูป: ${fmt(got)}`);
    eq([seen.filter((x) => x.key.startsWith("agent:verify:k:") || isBucket(x, "verifyPerCode")).length, row?.attempts, row?.usedAt ?? null], [0, 0, null], "ไม่ถึงถังต่อรหัส/แถวรหัส");
    const good = await verify({ email: e, codeId: real, code }, mo());
    ok(good.ok === true, `รหัสจริงต้องยังใช้ได้: ${fmt(good)}`);
    // อินพุตขยะของทางที่ไม่ล็อกอิน
    const junkToken = `ag_${randomBytes(32).toString("base64url")}`;
    const junk = [
      await safe(() => AU("requestAgentLoginCode")({ email: base }, { ...mo(), clientKey: "abcd\u0000efgh" })),
      await safe(() => AU("requestAgentLoginCode")({ email: { toString: () => base } }, mo())),
      await safe(() => AU("requestAgentLoginCode")(null, mo())),
      await safe(() => AU("verifyAgentLoginCode")({ email: e, codeId: `alc_${hex(12)}`, code: "12\u000034", signup: { agencyName: `${QC_MARK} a\u0000b`, ownerName: "x" } }, mo())),
      await safe(() => AU("verifyAgentLoginCode")({ email: e, codeId: `alc_${hex(12)}`, code: "123456", teammateInvite: "\u0000.\u0000" }, mo())),
      await safe(() => AU("agentApply")(junkToken, { shopSlug: "x\u0000y", application: app() }, mo())),
      await safe(() => AU("agentAcceptInvite")(junkToken, { shopSlug: s.slug, inviteToken: "\u0000".repeat(43) }, mo())),
      await safe(() => AU("selectAgentAccount")(junkToken, { shopSlug: "a\u0000" })),
      await safe(() => AU("logoutAgentSession")("ag_\u0000")),
    ];
    const nulls = [await AU("resolveAgentSession")("ag_\u0000"), await AU("resolveAgentSession")(`${junkToken}\u0000`), await AU("agentScope")(junkToken, { shopSlug: "x\u0000y" }), await AU("agentScope")("\u0000", { shopSlug: s.slug })];
    eq([junk.filter((x) => x.threw !== undefined).length, junk.slice(0, 8).filter((x) => x.ok === true).length, nulls, (await opsErrors()) - n0], [0, 0, [null, null, null, null], 0], "อินพุตขยะ ⇒ ไม่ throw · ไม่สำเร็จ · ไม่มี ops ERROR");
  });

  // ─────────────────── มติ §10 ข้อ 18 — เข้าระบบพร้อมกันของอีเมลเดียว ───────────────────
  await st("RU-25", "มติ §10 ข้อ 18 (H-F8): ผู้ใช้เดียวยืนยันรหัสที่ถูกสองใบพร้อมกัน (4 รอบ) ⇒ ทุกรอบ ok 1 พอดี + session ใหม่ 1 แถวพอดี · อีกใบ INVALID_CODE (หรือ BUSY reason LOCK) ไม่มี BUSY UNEXPECTED/throw · ไม่มี ops ERROR", async () => {
    needBuilt();
    const v = await mkIdent("ru25");
    const e = mail("ru25");
    const n0 = await opsErrors();
    const bad: string[] = [];
    for (let round = 0; round < 4; round++) {
      const before = await count(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1`, [v.agentUserId]);
      const r1 = await reqCode(e, mo()); const c1 = lastMail(e, "LOGIN_CODE")?.code;
      const r2 = await reqCode(e, mo()); const c2 = lastMail(e, "LOGIN_CODE")?.code;
      const out = await settle([AU("verifyAgentLoginCode")({ email: e, codeId: r1.codeId, code: c1 }, mo()), AU("verifyAgentLoginCode")({ email: e, codeId: r2.codeId, code: c2 }, mo())]);
      for (const x of out) if (x.ok === true) allTokens.push(String(x.token));
      const added = (await count(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1`, [v.agentUserId])) - before;
      const rest = out.filter((x) => x.ok !== true);
      if (out.filter((x) => x.ok === true).length !== 1 || added !== 1 || rest.some((x) => x.threw !== undefined || !(x.code === "INVALID_CODE" || (x.code === "BUSY" && x.reason === "LOCK")))) bad.push(`รอบ ${round}: ${fmt(out.map((x) => (x.ok === true ? "ok" : `${String(x.code)}/${String(x.reason ?? "")}${x.threw ? `/${String(x.threw)}` : ""}`)))} session +${added}`);
    }
    eq([bad, (await opsErrors()) - n0], [[], 0], "ผล");
  });

  // ─────────────────── มติ §10 ข้อ 19 — ถังสมัคร: ตัวตนก่อนร้าน · เล่นซ้ำไม่กินถังร้าน ───────────────────
  await st("RU-26", "มติ §10 ข้อ 19 (H-F9): ลำดับถังของการสมัครผ่านตัวห่อ = เครื่อง → ตัวตน → ร้าน · ถังตัวตนปฏิเสธ ⇒ ถังร้านไม่ถูกถาม ไม่มีแถว · เล่นซ้ำใบสมัครเดิม (replayed) ×3 ⇒ ไม่ถามถังร้านเลย (นับถังตัวตนทุกครั้ง) · ถังร้านเต็มก็ยังเล่นซ้ำได้", async () => {
    needBuilt();
    const s = await mkShop2("ru26");
    const k = await signup(mail("ru26"), "RU26");
    const tagOf = (x: Seen) => (x.key.startsWith("agent:apply:i:") ? "i" : x.key.startsWith("agent:apply:s:") ? "s" : isBucket(x, "applyPerClient") ? "c" : "?");
    const call = async (deny?: string): Promise<{ r: Rec; trace: string[] }> => {
      const seen: Seen[] = [];
      const r = R(await AU("agentApply")(k.token, { shopSlug: s.slug, application: app() }, meta(undefined, undefined, undefined, recRate(seen, (x) => tagOf(x) === deny))));
      return { r, trace: seen.map(tagOf).filter((t) => t !== "?") };
    };
    const d1 = await call("i");
    eq([d1.r.code, d1.trace, await accountOf(s.id, k.identityId)], ["RATE_LIMITED", ["c", "i"], null], "ถังตัวตนปฏิเสธ");
    const a1 = await call();
    eq([a1.r.status, a1.r.replayed, a1.trace], ["PENDING", false, ["c", "i", "s"]], "ใบสมัครใหม่");
    const reps = [await call(), await call(), await call()];
    eq([reps.map((x) => x.r.replayed), reps.map((x) => x.trace)], [[true, true, true], [["c", "i"], ["c", "i"], ["c", "i"]]], "เล่นซ้ำ");
    const r4 = await call("s");
    eq([r4.r.ok, r4.r.replayed, r4.r.agentAccountId], [true, true, a1.r.agentAccountId], "ถังร้านเต็ม + เล่นซ้ำ");
  });
  await st("RU-27", "T-9 ถังทุกตัวใช้เพดานของตัวเองใน AGENT_AUTH_LIMITS (ขอรหัส 4 ถัง · ยืนยัน 2 · สมัคร 3 · รับคำเชิญ 1 · ค้นรหัส 1) คีย์เป็นแฮช · ถังต่อเครื่องปฏิเสธ ⇒ RATE_LIMITED ไม่แตะแถว (ขอรหัส · ยืนยัน · รับคำเชิญ · สมัคร — ถังตัวตนไม่ถูกถาม) · ถังต่อรหัสปฏิเสธ ⇒ ไม่สำเร็จ attempts ไม่ขยับ รหัสยังใช้ได้ภายหลัง", async () => {
    needBuilt();
    const s = await mkShop2("ru27");
    const k = await signup(mail("ru27"), "RU27");
    const inv = await shopDo("inviteAgent", s.ctx, { mode: "CODE", publicCode: k.publicCode, legalName: `${QC_MARK} ru27`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-ru27` });
    ok(inv.status === "INVITED", `เชิญ: ${fmt(inv)}`);
    const e = mail("ru27c");
    await mkIdent("ru27c");
    usedEmails.push(e);
    const seen: Seen[] = [];
    const rec = () => meta(undefined, undefined, undefined, recRate(seen));
    const named = (prefix: string, k2: string) => seen.some((x) => x.key.startsWith(prefix) && isBucket(x, k2));
    const rq = R(await AU("requestAgentLoginCode")({ email: e }, rec()));
    ok(rq.ok === true, `ขอรหัส: ${fmt(rq)}`);
    createdCodeIds.push(String(rq.codeId));
    const code = lastMail(e, "LOGIN_CODE")?.code ?? "";
    const wrong = code === "000000" ? "111111" : "000000";
    const reqBuckets = [named("agent:code:c:", "codePerClient"), named("agent:code:ip:", "codePerIp"), named("agent:code:t:", "codePerTarget"), named("agent:code:td:", "codePerTargetDay"), seen.length];
    seen.length = 0;
    await AU("verifyAgentLoginCode")({ email: e, codeId: rq.codeId, code: wrong }, rec());
    const verBuckets = [named("agent:verify:c:", "verifyPerClient"), named("agent:verify:k:", "verifyPerCode"), seen.length];
    seen.length = 0;
    await AG("lookupAgentIdentityByCode")(s.ctx, { publicCode: k.publicCode }, { deps: recRate(seen) });
    const lookBuckets = [named("agent:lookup:", "lookupByCodePerActor"), seen.length];
    seen.length = 0;
    const s3 = await mkShop2("ru27b");
    const ap = R(await AU("agentApply")(k.token, { shopSlug: s3.slug, application: app() }, rec()));
    const applyBuckets = [ap.status, seen.some((x) => isBucket(x, "applyPerClient")), named("agent:apply:i:", "applyPerIdentity"), named("agent:apply:s:", "applyPerShop"), seen.length];
    seen.length = 0;
    const denyOf = (k2: string) => meta(undefined, undefined, undefined, recRate(seen, (x) => isBucket(x, k2)));
    const accDenied = R(await AU("agentAcceptInvite")(k.token, { shopSlug: s.slug }, denyOf("inviteAcceptPerClient")));
    const accBuckets = [accDenied.code, (await acc(String(inv.agentAccountId)))?.status, seen.length];
    eq([reqBuckets, verBuckets, lookBuckets, applyBuckets, accBuckets], [[true, true, true, true, 4], [true, true, 2], [true, 1], ["PENDING", true, true, true, 3], ["RATE_LIMITED", "INVITED", 1]], "ถังและเพดาน");
    // ปฏิเสธทีละถัง
    const att = async () => (await q<{ attempts: number }>(`SELECT attempts FROM "AgentLoginCode" WHERE id = $1`, [String(rq.codeId)]))[0]?.attempts;
    const a0 = await att();
    const e2 = mail("ru27d");
    usedEmails.push(e2);
    const rqDenied = R(await AU("requestAgentLoginCode")({ email: e2 }, denyOf("codePerClient")));
    const vfClient = R(await AU("verifyAgentLoginCode")({ email: e, codeId: rq.codeId, code }, denyOf("verifyPerClient")));
    const vfCode = R(await AU("verifyAgentLoginCode")({ email: e, codeId: rq.codeId, code }, denyOf("verifyPerCode")));
    seen.length = 0;
    const s4 = await mkShop2("ru27d");
    const apDenied = R(await AU("agentApply")(k.token, { shopSlug: s4.slug, application: app() }, denyOf("applyPerClient")));
    eq([rqDenied.code, await count(`SELECT count(*)::int AS n FROM "AgentLoginCode" WHERE target = $1`, [authHash("login-target", e2)]), vfClient.code, vfCode.ok === true, ["INVALID_CODE", "RATE_LIMITED"].includes(String(vfCode.code)), (await att()) === a0, apDenied.code, seen.some((x) => x.key.startsWith("agent:apply:i:")), await accountOf(s4.id, k.identityId)],
      ["RATE_LIMITED", 0, "RATE_LIMITED", false, true, true, "RATE_LIMITED", false, null], "ถังปฏิเสธ");
    const good = await verify({ email: e, codeId: rq.codeId, code }, mo());
    ok(good.ok === true, `รหัสยังต้องใช้ได้หลังถังปฏิเสธ: ${fmt(good)}`);
  });

  // ─────────────────── T-8 ประตูต่อร้าน: ตารางกรณีไม่ผ่าน ───────────────────
  await st("RU-28", "T-8 agentScope = null เดียวกันทุกกรณี: บัญชี PENDING · บัญชี INVITED · ผู้ใช้ของตัวตนที่ไม่ได้เป็นสมาชิก · แถวสมาชิก inactive · ร้านไม่ ACTIVE · หน่วย TRIPS เดียวของร้านถูกปิด · บัญชีถูกพัก/ปิด — และ activeAgentAccountId ที่ชี้ร้านอื่นไม่มีผล (ร้านจาก URL ตัดสิน) · selectAgentAccount ของบัญชีที่ถูกพัก/ปิด ⇒ NOT_FOUND ข้อความเดียวกับร้านที่ไม่มีจริง", async () => {
    needBuilt();
    const sP = await mkShop2("ru28p"), sI = await mkShop2("ru28i"), sA = await mkShop2("ru28a", { auto: true }), sB = await mkShop2("ru28b", { auto: true });
    const k = await signup(mail("ru28"), "RU28");
    const mate = await teammate(k, mail("ru28m"), "SALES", "RU28M");
    const pend = await applyAs(k, sP.slug);
    const inv = await shopDo("inviteAgent", sI.ctx, { mode: "CODE", publicCode: k.publicCode, legalName: `${QC_MARK} ru28`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-ru28` });
    const actA = await applyAs(k, sA.slug), actB = await applyAs(k, sB.slug);
    ok(pend.status === "PENDING" && inv.status === "INVITED" && actA.status === "ACTIVE" && actB.status === "ACTIVE", `ตั้งต้น: ${fmt([pend.status, inv.status, actA.status, actB.status])}`);
    const scope = (w: { token: string }, slug: string) => AU("agentScope")(w.token, { shopSlug: slug });
    const sel = async (w: { token: string }, slug: string): Promise<Rec> => R(await AU("selectAgentAccount")(w.token, { shopSlug: slug }));
    const none = await sel(k, slugNone);
    eq([R(await scope(k, sA.slug)).agentAccountId, await scope(k, sP.slug), await scope(k, sI.slug), await scope(mate, sA.slug), (await sel(k, sP.slug)).status, (await sel(k, sI.slug)).status], [actA.agentAccountId, null, null, null, "PENDING", "INVITED"], "PENDING / INVITED / ไม่ใช่สมาชิก");
    // คำใบ้ UI ชี้ร้าน B — ประตูของร้าน A/P ต้องตัดสินจาก URL
    const selB = await sel(k, sB.slug);
    const hint = (await q<{ a: string | null }>(`SELECT "activeAgentAccountId" AS a FROM "AgentSession" WHERE "tokenHash" = $1`, [authHash("session", k.token)]))[0]?.a;
    eq([selB.agentAccountId, hint, R(await scope(k, sA.slug)).agentAccountId, await scope(k, sP.slug), await scope(k, slugNone)], [actB.agentAccountId, actB.agentAccountId, actA.agentAccountId, null, null], "activeAgentAccountId ไม่มีผลกับประตู");
    const off: unknown[] = [];
    try {
      await q(`UPDATE "Tenant" SET status = 'SUSPENDED' WHERE id = $1`, [sA.id]);
      off.push(await scope(k, sA.slug), (await sel(k, sA.slug)).code);
    } finally { await q(`UPDATE "Tenant" SET status = 'ACTIVE' WHERE id = $1`, [sA.id]); }
    try {
      await q(`UPDATE "BusinessUnit" SET status = 'ARCHIVED' WHERE id = $1`, [sA.unitId]);
      off.push(await scope(k, sA.slug));
    } finally { await q(`UPDATE "BusinessUnit" SET status = 'ACTIVE' WHERE id = $1`, [sA.unitId]); }
    try {
      await q(`UPDATE "AgentAccountMember" SET active = false WHERE "agentAccountId" = $1 AND "agentUserId" = $2`, [String(actA.agentAccountId), k.agentUserId]);
      off.push(await scope(k, sA.slug));
    } finally { await q(`UPDATE "AgentAccountMember" SET active = true WHERE "agentAccountId" = $1 AND "agentUserId" = $2`, [String(actA.agentAccountId), k.agentUserId]); }
    eq([off, R(await scope(k, sA.slug)).agentAccountId], [[null, "NOT_FOUND", null, null], actA.agentAccountId], "ร้านไม่ ACTIVE / หน่วยปิด / สมาชิก inactive (แล้วคืนค่า ⇒ ผ่าน)");
    const sus = await shopDo("suspendAgentAccount", sB.ctx, { agentAccountId: actB.agentAccountId });
    const s1 = await sel(k, sB.slug), g1 = await scope(k, sB.slug);
    const cl = await shopDo("closeAgentAccount", sB.ctx, { agentAccountId: actB.agentAccountId });
    const s2 = await sel(k, sB.slug), g2 = await scope(k, sB.slug);
    eq([sus.status, s1.code, s1.message === none.message, g1, cl.status, s2.code, s2.message === none.message, g2, none.code], ["SUSPENDED", "NOT_FOUND", true, null, "CLOSED", "NOT_FOUND", true, null, "NOT_FOUND"], "พัก / ปิด");
  });

  // ─────────────────── T-10 เจ้าของคนสุดท้าย (ปิด/ลบ) · ลบ · ปิดตัวตน ───────────────────
  await st("RU-29", "T-10: เจ้าของคนเดียวปิดตัวเอง/ลบตัวเอง ⇒ LAST_OWNER (ยัง ACTIVE · session ยังใช้ได้) · ADMIN ลบผู้ใช้อื่น ⇒ FORBIDDEN · SALES ลบตัวเอง ⇒ ok (ERASED) · ADMIN ปิดตัวตน ⇒ FORBIDDEN · ไม่ยืนยัน (confirm ไม่ใช่ true) ⇒ VALIDATION ตัวตนยัง ACTIVE · OWNER ปิดตัวตน ⇒ แถวคำเชิญด้วยรหัส (INVITED) ก็ถูกปิดเป็น IDENTITY_CLOSED", async () => {
    needBuilt();
    const s = await mkShop2("ru29");
    const o = await signup(mail("ru29"), "RU29");
    const adm = await teammate(o, mail("ru29a"), "ADMIN", "RU29A"), s1 = await teammate(o, mail("ru29s"), "SALES", "RU29S"), s2 = await teammate(o, mail("ru29t"), "SALES", "RU29T");
    const inv = await shopDo("inviteAgent", s.ctx, { mode: "CODE", publicCode: o.publicCode, legalName: `${QC_MARK} ru29`, payeeType: "TH_JURISTIC", idempotencyKey: `qca12-${STAMP}-ru29` });
    ok(inv.status === "INVITED", `เชิญ: ${fmt(inv)}`);
    const ust = async (id: string) => (await q<{ status: string }>(`SELECT status FROM "AgentUser" WHERE id = $1`, [id]))[0]?.status;
    const dis = R(await AU("disableTeammate")(o.token, { targetUserId: o.agentUserId })), er = R(await AU("eraseTeammate")(o.token, { targetUserId: o.agentUserId }));
    eq([dis.code, er.code, await ust(o.agentUserId), !!(await AU("resolveAgentSession")(o.token))], ["LAST_OWNER", "LAST_OWNER", "ACTIVE", true], "เจ้าของคนสุดท้าย");
    const f1 = R(await AU("eraseTeammate")(adm.token, { targetUserId: s1.agentUserId }));
    const self = R(await AU("eraseTeammate")(s2.token, { targetUserId: s2.agentUserId }));
    eq([f1.code, await ust(s1.agentUserId), self.ok, await ust(s2.agentUserId), await loginRows(mail("ru29t")), await AU("resolveAgentSession")(s2.token)], ["FORBIDDEN", "ACTIVE", true, "ERASED", 0, null], "ลบผู้ใช้");
    const f2 = R(await AU("closeMyIdentity")(adm.token, { confirm: true }));
    const v1 = R(await AU("closeMyIdentity")(o.token, { confirm: false })), v2 = R(await AU("closeMyIdentity")(o.token, {})), v3 = R(await AU("closeMyIdentity")(o.token, { confirm: "true" }));
    const identSt = async () => (await q<{ status: string }>(`SELECT status FROM "AgentIdentity" WHERE id = $1`, [o.identityId]))[0]?.status;
    eq([f2.code, v1.code, v2.code, v3.code, await identSt(), (await acc(String(inv.agentAccountId)))?.status], ["FORBIDDEN", "VALIDATION", "VALIDATION", "VALIDATION", "ACTIVE", "INVITED"], "ปิดตัวตนที่ไม่ผ่าน");
    const cl = R(await AU("closeMyIdentity")(o.token, { confirm: true }));
    const row = await acc(String(inv.agentAccountId));
    eq([cl.ok, await identSt(), row?.status, row?.statusReason, row?.inviteTokenHash ?? null, await AU("resolveAgentSession")(adm.token)], [true, "CLOSED", "CLOSED", "IDENTITY_CLOSED", null, null], "ปิดตัวตน");
  });

  // ─────────────────── T-12 การมองเห็นตามสาขา ───────────────────
  await st("RU-30", "T-12: พนักงานจำกัดสาขา (มีสิทธิ์ดู) เห็นบัญชีที่ unitIds ว่างหรือซ้อนสาขาของตน · บัญชีของสาขาอื่น ⇒ ไม่อยู่ในรายการ และ get = NOT_FOUND ทุกไบต์เท่า id ที่ไม่มีจริง · เจ้าของเห็นครบ", async () => {
    needBuilt();
    const s = await mkShop2("ru30");
    const u2 = rid("uru30b");
    await ins("BusinessUnit", { id: u2, tenantId: s.id, type: "TRIPS", name: "หน่วยที่สอง", slug: `${SLUG}ru30b-${STAMP}` });
    const br = await mkStaff("ru30br", s.id, "STAFF", [s.unitId], { "agency.account.view": true });
    const inv = async (tag: string, unitIds: string[]): Promise<string> => { const r = await shopDo("inviteAgent", s.ctx, invEmail(mail(`ru30-${tag}`), `qca12-${STAMP}-ru30-${tag}`, { unitIds })); ok(r.ok === true, `เชิญ ${tag}: ${fmt(r)}`); allTokens.push(String(r.inviteToken)); return String(r.agentAccountId); };
    const aAll = await inv("all", []), aMine = await inv("mine", [s.unitId]), aBoth = await inv("both", [s.unitId, u2]), aOther = await inv("other", [u2]);
    const ctxBr = ctxOf(s.id, br);
    const seenIds = (((await shopDo("listAgentAccounts", ctxBr, {})).items as Rec[]) ?? []).map((i) => String(i.id)).sort();
    const ownerIds = (((await shopDo("listAgentAccounts", s.ctx, {})).items as Rec[]) ?? []).map((i) => String(i.id)).sort();
    const gOther = await shopDo("getAgentAccount", ctxBr, { agentAccountId: aOther }), gNone = await shopDo("getAgentAccount", ctxBr, { agentAccountId: rid("nope") }), gMine = await shopDo("getAgentAccount", ctxBr, { agentAccountId: aMine });
    eq([seenIds, ownerIds, gOther, gMine.ok, (await shopDo("getAgentAccount", s.ctx, { agentAccountId: aOther })).ok], [[aAll, aMine, aBoth].sort(), [aAll, aMine, aBoth, aOther].sort(), gNone, true, true], "การมองเห็น");
    eq(gOther.code, "NOT_FOUND", "รหัส");
  });

  // ─────────────────── T-17 ไม่มีกุญแจเซิร์ฟเวอร์ · T-18 งานกวาดเคารพ signal ───────────────────
  await st("RU-31", "T-17: SESSION_SECRET ว่าง ⇒ สมัคร · รับคำเชิญ · ร้านเชิญ (อีเมล) · ออกคำเชิญใหม่ · เชิญเพื่อน · ยืนยันรหัส · ค้นรหัส = BUSY reason SERVER_KEY_MISSING ไม่เขียนอะไร (ไม่มีกุญแจสำรอง) · INTEGRATIONS_CREDENTIALS_KEY ว่าง + ใบสมัครมีเลขภาษี ⇒ BUSY reason KEY_NOT_CONFIGURED ไม่มีแถว · คืนกุญแจแล้วทำได้ปกติ", async () => {
    needBuilt();
    const s = await mkShop2("ru31");
    const k = await signup(mail("ru31"), "RU31");
    const base = await shopDo("inviteAgent", s.ctx, invEmail(mail("ru31-base"), `qca12-${STAMP}-ru31-base`));
    ok(base.ok === true, `คำเชิญตั้งต้น: ${fmt(base)}`);
    allTokens.push(String(base.inviteToken));
    const hash0 = (await acc(String(base.agentAccountId)))?.inviteTokenHash;
    const e = mail("ru31c");
    await mkIdent("ru31c");
    const rq = await reqCode(e, mo());
    const code = lastMail(e, "LOGIN_CODE")?.code;
    const m0 = mails.length;
    const keepS = process.env.SESSION_SECRET;
    let out: Rec[] = [];
    try {
      process.env.SESSION_SECRET = "";
      out = [
        await safe(() => AU("agentApply")(k.token, { shopSlug: s.slug, application: app() }, mo())),
        await safe(() => AU("agentAcceptInvite")(k.token, { shopSlug: s.slug, inviteToken: base.inviteToken }, mo())),
        await safe(() => AG("inviteAgent")(s.ctx, invEmail(mail("ru31-new"), `qca12-${STAMP}-ru31-new`), { deps: OPEN_DEPS })),
        await safe(() => AG("reissueAgentInvite")(s.ctx, { agentAccountId: base.agentAccountId }, { deps: OPEN_DEPS })),
        await safe(() => AU("createTeammateInvite")(k.token, { email: mail("ru31-mate"), role: "SALES" }, mo())),
        await safe(() => AU("verifyAgentLoginCode")({ email: e, codeId: rq.codeId, code }, mo())),
        await safe(() => AG("lookupAgentIdentityByCode")(s.ctx, { publicCode: k.publicCode }, { deps: OPEN_DEPS })),
      ];
    } finally { process.env.SESSION_SECRET = keepS; }
    const cRow = (await q<{ attempts: number; usedAt: Date | null }>(`SELECT attempts, "usedAt" FROM "AgentLoginCode" WHERE id = $1`, [String(rq.codeId)]))[0];
    eq([out.map((r) => `${String(r.code)}/${String(r.reason)}`), await accountOf(s.id, k.identityId), await count(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1`, [s.id]), (await acc(String(base.agentAccountId)))?.inviteTokenHash === hash0, mails.length - m0, cRow?.attempts, cRow?.usedAt ?? null],
      [out.map(() => "BUSY/SERVER_KEY_MISSING"), null, 1, true, 0, 0, null], "ไม่มี SESSION_SECRET");
    ok(await AU("resolveAgentSession")(k.token), "คืนกุญแจแล้ว session เดิมต้องใช้ได้ (ตัวควบคุม: ไม่มีกุญแจสำรองแทรกแฮชอื่น)");
    const tax = thaiTaxId(`0105${digits(8)}`);
    const keepI = process.env.INTEGRATIONS_CREDENTIALS_KEY;
    let noKey: Rec = {};
    try { process.env.INTEGRATIONS_CREDENTIALS_KEY = ""; noKey = await safe(() => AU("agentApply")(k.token, { shopSlug: s.slug, application: app({ taxId: tax }) }, mo())); } finally { process.env.INTEGRATIONS_CREDENTIALS_KEY = keepI; }
    const rowNoKey = await accountOf(s.id, k.identityId);
    const withKey = await applyAs(k, s.slug, app({ taxId: tax }));
    eq([noKey.code, noKey.reason, rowNoKey, withKey.status, (await accountOf(s.id, k.identityId))?.taxIdLast4], ["BUSY", "KEY_NOT_CONFIGURED", null, "PENDING", tax.slice(-4)], "ไม่มีกุญแจเข้ารหัสเลขภาษี");
  });
  await st("RU-32", "T-18: sweepAgentAuth ที่ signal ถูกยกเลิกแล้ว ⇒ ไม่ลบ session (sessions = 0 · แถวหมดอายุยังอยู่) · เรียกปกติ ⇒ ลบ", async () => {
    needBuilt();
    const k = await mkIdent("ru32");
    const sx = rid("sws");
    const t0 = new Date();
    await ins("AgentSession", { id: sx, agentUserId: k.agentUserId, tokenHash: `qcplant-${hex(16)}`, expiresAt: new Date(t0.getTime() - 60_000), idleExpiresAt: new Date(t0.getTime() - 120_000), updatedAt: t0 });
    const ac = new AbortController();
    ac.abort();
    const r = R(await AU("sweepAgentAuth")({ now: t0, signal: ac.signal }));
    const left = await count(`SELECT count(*)::int AS n FROM "AgentSession" WHERE id = $1`, [sx]);
    let gone = left;
    for (let i = 0; i < 30 && gone > 0; i++) { await AU("sweepAgentAuth")({ now: t0 }); gone = await count(`SELECT count(*)::int AS n FROM "AgentSession" WHERE id = $1`, [sx]); }
    eq([r.sessions, left, gone], [0, 1, 0], "ผล");
  });

  // ═══════════════ I. ค่าคงที่ ═══════════════
  console.log("\n── I: ค่าคงที่ ──");
  await st("I-1", "สมุดเอเจนซี่ของร้านทดสอบ: agencyBalanceDrift ว่าง (trips-agency-invariants)", async () => {
    needBuilt();
    const drift = fnOf(need(INVM, "trips-agency-invariants"), "agencyBalanceDrift", "invariants");
    eq(await drift((sql: string, p?: unknown[]) => pool.query(sql, p), tenantIds), [], "drift");
  });
  await st("I-2", "ทุกบัญชี PENDING/ACTIVE/SUSPENDED ที่มีตัวตน มีสมาชิก active role OWNER ≥ 1", async () => {
    needBuilt();
    const bad = await q<{ id: string }>(`SELECT a.id FROM "AgentAccount" a WHERE a."tenantId" = ANY($1::text[]) AND a.status IN ('PENDING','ACTIVE','SUSPENDED') AND a."identityId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "AgentAccountMember" m WHERE m."agentAccountId" = a.id AND m.active AND m.role = 'OWNER')`, [tenantIds]);
    eq(bad.map((b) => b.id), [], "บัญชีไม่มีเจ้าของ");
  });
  await st("I-3", "สมาชิกทุกแถว: tenantId = ของบัญชี · ผู้ใช้อยู่ตัวตนเดียวกับบัญชี", async () => {
    needBuilt();
    const bad = await q<{ id: string }>(`SELECT m.id FROM "AgentAccountMember" m JOIN "AgentAccount" a ON a.id = m."agentAccountId" JOIN "AgentUser" u ON u.id = m."agentUserId"
      WHERE a."tenantId" = ANY($1::text[]) AND (m."tenantId" <> a."tenantId" OR a."identityId" IS DISTINCT FROM u."identityId")`, [tenantIds]);
    const orphan = await q<{ id: string }>(`SELECT m.id FROM "AgentAccountMember" m LEFT JOIN "AgentAccount" a ON a.id = m."agentAccountId" WHERE m."tenantId" = ANY($1::text[]) AND a.id IS NULL`, [tenantIds]);
    eq([bad.length, orphan.length], [0, 0], "สมาชิกผิด");
  });
  await st("I-4", "ไม่มีค่าดิบในตาราง: AgentSession.tokenHash / AgentAccount.inviteTokenHash / AgentLoginCode ไม่มี token หรืออีเมลที่ใช้ในรัน · AgentLoginCode.target ไม่มี '@'", async () => {
    needBuilt();
    const s = await q<{ j: string }>(`SELECT string_agg("tokenHash", ' ') AS j FROM "AgentSession" WHERE "agentUserId" = ANY($1::text[])`, [createdUserIds]);
    const a = await q<{ j: string }>(`SELECT string_agg(COALESCE("inviteTokenHash", ''), ' ') AS j FROM "AgentAccount" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]);
    const c = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLoginCode" WHERE target LIKE '%@%' OR target LIKE 'qca12-%'`);
    eq([leaks(`${s[0]?.j ?? ""} ${a[0]?.j ?? ""}`, [...allTokens, ...usedEmails]), c[0]?.n], [[], 0], "ค่าดิบ");
  });

  // ═══════════════ G. regression ═══════════════
  console.log("\n── G: regression ──");
  const child = (args: string[]) => spawnSync(join(ROOT, "node_modules/.bin/tsx"), args, { cwd: ROOT, env: process.env, encoding: "utf8", timeout: 40 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  const summary = (out: string): Rec | null => { const l = out.split("\n").find((x) => x.startsWith("JSON_SUMMARY ")); try { return l ? asRec(JSON.parse(l.slice(13))) : null; } catch { return null; } };
  if (NO_REG) {
    for (const [id, n] of [["G-1", "fitness"], ["G-2", "qc-trips-a1.1"]]) skip(id, n, "--no-regression");
  } else {
    await st("G-1", "fitness: F17.1 ✅ · ไม่มี ❌ ใดเลย (เส้น agency→party/crm ผู้คุมเพิ่มแล้ว · F5.1 คง 52)", async () => {
      needBuilt();
      const r = child(["scripts/fitness.mts"]);
      const out = `${r.stdout ?? ""}`;
      ok(out.split("\n").some((l) => l.includes("✅") && l.includes("[F17.1]")), "ไม่มี ✅ [F17.1]");
      const bad = out.split("\n").filter((l) => l.includes("❌"));
      ok(bad.length === 0, `❌ ${bad.length}: ${bad.slice(0, 3).map((l) => l.trim().slice(0, 110)).join(" | ")}`);
    });
    await st("G-2", "qc-trips-a1.1 --no-regression: ที่ไม่ผ่านต้องเป็นข้อขอบเขตที่เห็น entry.ts/index.ts เปลี่ยน (S-* · X1-4) เท่านั้น (ORACLE-EDIT ผู้คุม)", async () => {
      needBuilt();
      const r = child(["scripts/qc-trips-a1.1.mts", "--no-regression"]);
      const s = summary(`${r.stdout ?? ""}`);
      ok(s, `ไม่มี JSON_SUMMARY (exit ${r.status})`);
      const failed = ((s?.failed as string[]) ?? []).filter((x) => !/^S-\d+$/.test(x) && x !== "X1-4");
      ok(failed.length === 0, `ไม่ผ่านนอกรายการ: ${failed.join(", ")}`);
    });
  }
  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); await cleanupGlobal(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as (...a: unknown[]) => unknown).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS A1.2a · ทะเบียนเอเจนซี่ · สมัคร/อนุมัติ · เชิญ · ผู้ใช้ · ล็อกอิน =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
process.exit(exitCode);
