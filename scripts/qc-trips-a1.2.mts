// QC — TRIPS A1.2a รอบ 2 (หลังผลตรวจความปลอดภัยของแบบ · มติผู้คุม R1–R5) · ทะเบียนเอเจนซี่ · สมัครเอง→ร้านอนุมัติ · เชิญ · ผู้ใช้/บทบาท · ล็อกอินอีเมล + session · Party/CRM · ใบอนุญาต (บริการเท่านั้น · ไม่มีจอ)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/A1.2.md (ใบสั่ง) · ledger/TRIPS-CORE-CONTRACT.md TC3 §A §B.2 §J.1 §J.3 §J.3.1 · ใบสั่ง A1.1 §2.1 §5 · wo-notes A1.1
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนสร้าง · positive control ของตัวสแกนเครื่องหมาย/สูตรแฮช/rate limit) · K core บริสุทธิ์ · S โครง/ขอบเขต/F17 static/สิทธิ์/event
//   A ล็อกอินอีเมล + session + token · AP สมัคร · SH ฝั่งร้าน (ผังสถานะ · สิทธิ์ · DTO) · IN เชิญ · M ผู้ใช้/บทบาท/ลบตาม PDPA
//   P ความเป็นส่วนตัวสองร้าน (เครื่องหมายฝังที่ร้าน B · สแกน DTO/รายการ/audit/outbox/ops/ผล error ของร้าน A) · PY Party/CRM
//   C พร้อมกัน · CAP เพดานใบสมัคร/คำเชิญ · H งานบ้าน (ag_ · ออกทุกเครื่อง · 20 session · งานกวาด) · I ค่าคงที่ · G regression (fitness · qc-trips-a1.1 --no-regression)
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
  const AU = (n: string): F => fnOf(need(AUM, "@/lib/platform/agent-auth"), n, "platform/agent-auth");
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
  const shop = async (fn: string, ctx: { tenantId: string; actorUserId: string }, input: Rec, opts: Rec = {}): Promise<Rec> => {
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
  await st("K-5", "คีย์ DTO รายละเอียด/รายการตรงตัว · NEVER_SHOW_TO_SHOP_KEYS ครบ 15 · ไม่ซ้อนกับคีย์ DTO", () => {
    eq(CO("SHOP_AGENT_ACCOUNT_KEYS"), DTO_KEYS, "DTO");
    eq(CO("SHOP_AGENT_LIST_KEYS"), LIST_KEYS, "รายการ");
    eq(CO("NEVER_SHOW_TO_SHOP_KEYS"), NEVER, "ห้ามแสดง");
    ok(DTO_KEYS.concat(LIST_KEYS).every((k) => !NEVER.includes(k)), "ซ้อนกัน");
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
    const ch = changedSinceBase(["."]).filter((f) => !f.startsWith("ledger/") && f !== ORACLE_FILE && !sameAsSession(f));
    const extra = ch.filter((f) => !OWNED.has(f));
    eq(extra, [], "ไฟล์นอกขอบเขต");
  });
  await st("S-7", "ไม่แตะไฟล์ต้องห้าม: trips/ticket/pos/hotel/rooms/dorm/booking/queue/account/party/crm/member · core/settings · core/{db,scope,signed-link,rate-limit-db,email,audit,outbox} · prisma/ · app · components · scripts", () => {
    needBuilt();
    const forb = ["trips", "ticket", "pos", "hotel", "rooms", "dorm", "booking", "queue", "account", "party", "crm", "member"].map((m) => `src/lib/modules/${m}`)
      .concat(["src/lib/core/settings", "src/lib/core/db.ts", "src/lib/core/scope.ts", "src/lib/core/signed-link.ts", "src/lib/core/rate-limit-db.ts", "src/lib/core/email.ts", "src/lib/core/audit.ts", "src/lib/core/outbox.ts", "src/lib/core/session.ts", "src/lib/core/origin.ts", "prisma", "src/app", "src/components", "scripts"]);
    const t = changedSinceBase(forb).filter((f) => f !== ORACLE_FILE && !sameAsSession(f));
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
    const ti = R(await AU("createTeammateInvite")(inviter.token, { email, role }, meta()));
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
    const a = await AU("resolveAgentSession")(x.token, { now: new Date(s.idleExpiresAt.getTime() + 1000) });
    const b = await AU("resolveAgentSession")(x.token, { now: new Date(s.expiresAt.getTime() + 1000) });
    eq([a, b], [null, null], "ผล");
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
    const ti = R(await AU("createTeammateInvite")(x.token, { email: ey, role: "SALES" }, meta()));
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
    const ti = R(await AU("createTeammateInvite")(x.token, { email: e, role: "SALES" }, meta()));
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
    const ti = R(await AU("createTeammateInvite")(x.token, { email: ew, role: "SALES" }, meta()));
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
    const b = R(await AU("createTeammateInvite")(y!.token, { email: mail("m4"), role: "SALES" }, meta()));
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
    const c = R(await AU("createTeammateInvite")(Z2.token, { email: mail("m6"), role: "OWNER" }, meta()));
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
    const t1 = R(await AU("createTeammateInvite")(z3.token, { email: e1, role: "SALES" }, meta()));
    const t2 = R(await AU("createTeammateInvite")(z4.token, { email: e2, role: "SALES" }, meta()));
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
    const out = await Promise.all(accs.map((a) => settle([AG("approveAgentAccount")(cD(), { agentAccountId: a }), AG("rejectAgentAccount")(cD(), { agentAccountId: a })])));
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
    const ti = R(await AU("createTeammateInvite")(x.token, { email: e, role: "SALES" }, meta()));
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
