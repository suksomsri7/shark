// QC — HR V2 · H2.3 — shift swap / give-away: hr/swap.ts + pure hr/swap-rules.ts → approval core entity `HrShiftSwapRequest` →
//      one effect block rewrites the roster atomically (R6 in-tx primitives in roster.ts)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Contract: ledger/hr-briefs/hr-brief-H2.3.md §2 R1–R14 + §9 rulings (Q16 tightened) + controller delta 11 Nov · base session/hr 02f41f34f.
// Fixtures: own tenants `qc-hr-h23-<stamp>` (u1/u2 · HR systems A + sys2) + `-other` · roster days 2031 · swept in `finally`.
// Signatures (R1 — the oracle fixes them): actor/viewer = { userId, role, unitAccess, permissions } · { ok:true,… } | { ok:false, reason }
//   requestSwap(ctx, actor, { fromEntryId, targetEmployeeId, toEntryId?, reason? }) → { id } · respondSwap(ctx, actor, id, { accept }) → { status }
//   cancelSwap(ctx, actor, id) · decideSwap(ctx, viewer, id, { decision }) → { status, warnings } · swapPreview(ctx, viewer, id) → { warnings }
//   listMySwaps(ctx, actor) / listSwapsForManager(ctx, viewer, { status?, unitId? }) → { items: SwapItem[] } ·
//   applySwapDecision({ tenantId, systemId, swapId, requestId, approved }) → { applied, code? } · swap-rules.ts swapTransition(status, event) → status | null
// Shared-file hunks: `// HR H2.3 ▸ …` … `// ◂ HR H2.3` blocks or single lines containing `HR H2.3` (S8.2/S8.3 strip them, compare with base).
// SKIP while swap.ts is absent (exit 0) · QC_FORCE=1 / --force-run runs anyway · --list prints the ids.
// Run: bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.3.mts

// ▸ LIB-CANDIDATE ─── generic QC-HR helpers (no H2.3 knowledge) — controller swaps this block for `import … from "./qc-hr-lib.mts"` ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const QC4_HOST_MARK = "ep-frosty-lab";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 180);
const short = (v: unknown, n = 200) => {
  try {
    return (typeof v === "string" ? v : JSON.stringify(v) ?? "undefined").replace(/\s+/g, " ").slice(0, n);
  } catch {
    return String(v).slice(0, n);
  }
};
const isThai = (s: string) => /[฀-๿]/.test(s);
const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") for (const k of ["reason", "message", "error"]) if (typeof (v as Any)[k] === "string" && (v as Any)[k]) return String((v as Any)[k]);
  return "";
};
const srt = (a: Iterable<string>) => [...a].sort().join(",");
const failedKeys = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => !v).map(([k]) => k).join(",") || "all";
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const dk = (v: unknown): string => (v instanceof Date ? (Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : "∅") : typeof v === "string" ? v.slice(0, 10) : "∅");
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const CUID_RE = /\bc[a-z0-9]{20,}\b/;

// ── check registry + summary ──
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Base = "RED" | "GREEN";
type Def = readonly [string, string, Sev, Base, string];
const REG = { prefix: "", checks: [] as readonly Def[], title: new Map<string, string>(), sev: new Map<string, Sev>(), base: new Map<string, Base>(), results: new Map<string, { ok: boolean; expected: string; actual: string }>() };
function initRegistry(prefix: string, checks: readonly Def[]): void {
  Object.assign(REG, { prefix, checks });
  for (const [id, , sev, b, t] of checks) {
    REG.title.set(id, t);
    REG.sev.set(id, sev);
    REG.base.set(id, b);
  }
}
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = `${REG.prefix}${id}`;
  if (!REG.title.has(full)) throw new Error(`unregistered check id: ${id}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  REG.results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${REG.title.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
function listAndExit(suite: string): never {
  for (const [id, g, sev, b, t] of REG.checks) console.log(`${id}\t${g}\t${sev}\t${b}\t${t}`);
  console.log(`${suite}: ${REG.checks.length} checks`);
  process.exit(0);
}
function skipAndExit(suite: string, reasons: string[]): never {
  console.log(`⏭️  SKIPPED — ${suite}`);
  for (const r of reasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite, total: 0, passed: 0, failed: [], findings: [], skipped: true, reason: reasons, registered: REG.checks.length })}`);
  process.exit(0);
}
function printSummary(suite: string, o: { force: boolean; crashed: string; missing: string[] }): number {
  for (const [id] of REG.checks) if (!REG.results.has(id)) chk(id.slice(REG.prefix.length), false, "checked", o.crashed ? `not reached (harness crashed: ${o.crashed.slice(0, 80)})` : "not reached");
  const res = [...REG.results.entries()];
  const failed = res.filter(([, r]) => !r.ok).map(([id]) => id);
  const asBase = res.filter(([id, r]) => (REG.base.get(id) === "RED" ? !r.ok : r.ok)).length;
  const offBase = res.filter(([id, r]) => (REG.base.get(id) === "RED" ? r.ok : !r.ok)).map(([id, r]) => `${id}(${REG.base.get(id)}→${r.ok ? "pass" : "fail"})`);
  const nRed = REG.checks.filter(([, , , b]) => b === "RED").length;
  console.log(`BASE-EXPECTATION ${asBase}/${res.length} as registered (RED-by-design ${nRed} · GREEN controls ${REG.checks.length - nRed})${offBase.length ? ` · off: ${offBase.join(" ")}` : ""}`);
  console.log(`\n===== ${suite} ===== passed ${res.length - failed.length}/${res.length}${o.force ? " (QC_FORCE)" : ""}${o.crashed ? " · CRASHED" : ""}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite, total: res.length, passed: res.length - failed.length, failed, findings: failed.map((id) => ({ id, sev: REG.sev.get(id) ?? "CRITICAL" })), skipped: false, forced: o.force, crashed: !!o.crashed, missing: o.missing, baseRed: nRed, baseGreen: REG.checks.length - nRed, offBase })}`);
  return failed.length ? 1 : 0;
}

// ── env guard (QC4 only — refuses before any DB import) ──
async function guardQc4Env(suite: string): Promise<void> {
  process.env.QC_ENV_FILE ??= ".env.qc";
  if (process.env.QC_ENV_FILE === ".env") {
    console.error(`🔴 ${suite}: QC_ENV_FILE=.env is production — refused`);
    process.exit(4);
  }
  const { loadLegacyQcEnv } = (await import("./qc-env-guard.mjs" as string)) as Any;
  loadLegacyQcEnv(suite);
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(QC4_HOST_MARK));
  if (bad.length) {
    console.error(`🔴 STOP ${suite}: writes allowed on QC4 (${QC4_HOST_MARK}) only — ${bad.map(([n]) => n).join(", ")} is not (nothing written)`);
    process.exit(4);
  }
  let host = "?";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    /* host only — never the URL */
  }
  console.log(`[${suite}] DB host = ${host} (${host.includes(QC4_HOST_MARK) ? "QC4 ✓" : "not QC4"})`);
}

// ── git base helpers ──
const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
let BASE_REF = "";
function baseRef(envName = "QC_HR_BASE"): string {
  if (!BASE_REF) {
    try {
      BASE_REF = process.env[envName] || git(["merge-base", "HEAD", "origin/session/hr"]);
    } catch {
      BASE_REF = "";
    }
  }
  return BASE_REF;
}
const fileAtBase = (p: string): string | null => {
  try {
    return execFileSync("git", ["show", `${baseRef()}:${p}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
};
function changedVsBase(paths: string[]): string {
  try {
    const out = git(["diff", "--name-only", baseRef(), "--", ...paths]);
    return out ? `changed: ${out.replace(/\n/g, ",")}` : "unchanged";
  } catch (e) {
    return `git: ${errText(e).slice(0, 60)}`;
  }
}
/** text minus the WO's marked hunks: block `// <M> ▸` … `◂ <M>` lines, or any single line containing `<M>` · blank lines + trailing ws dropped */
function stripMarked(text: string, marker: string): { text: string; blocks: number } {
  const out: string[] = [];
  let inBlk = false;
  let blocks = 0;
  for (const line of text.split("\n")) {
    if (inBlk) {
      if (line.includes(`◂ ${marker}`)) inBlk = false;
      continue;
    }
    if (line.includes(`${marker} ▸`) && !line.includes("◂")) {
      inBlk = true;
      blocks++;
      continue;
    }
    if (line.includes(marker)) {
      blocks++;
      continue;
    }
    if (line.trim()) out.push(line.replace(/\s+$/, ""));
  }
  return { text: out.join("\n"), blocks };
}

// ── processes ──
function spawnTsx(args: string[], env: Record<string, string | undefined>, timeoutMs = 300_000): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const c = spawn("pnpm", ["exec", "tsx", ...args], { env: env as NodeJS.ProcessEnv, cwd: ROOT });
    let o = "";
    c.stdout.on("data", (d) => (o += String(d)));
    c.stderr.on("data", (d) => (o += String(d)));
    const t = setTimeout(() => c.kill("SIGTERM"), timeoutMs); // our own child only
    c.on("error", (e) => (clearTimeout(t), res({ code: -1, out: errText(e) })));
    c.on("close", (code) => (clearTimeout(t), res({ code: code ?? -1, out: o })));
  });
}

// ── fixtures (throwaway tenants · users with sessions · employees) ──
type Who = { id: string; name: string; tenantId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> };
const vOf = (w: Who) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });
function makeFixtures(P: Any, coreHash: Any, slug: string) {
  const fx = { tenants: [] as string[], users: [] as string[], names: [] as string[] };
  return {
    ...fx,
    async newTenant(suffix: string, name: string): Promise<string> {
      const t = await P.tenant.create({ data: { name, slug: `${slug}${suffix}` } });
      fx.tenants.push(t.id);
      return t.id;
    },
    async newUnit(tenantId: string, name: string, tag: string): Promise<string> {
      const u = await P.businessUnit.create({ data: { tenantId, type: "SHOP", name, slug: `${slug}-${tag}` } });
      fx.names.push(name);
      return u.id;
    },
    async mkUser(tenantId: string, tag: string, name: string, role: Who["role"], unitAccess: string[], permissions: Record<string, boolean>): Promise<Who> {
      const u = await P.user.create({ data: { email: `${slug}-${tag}@qc.invalid`, name } });
      fx.users.push(u.id);
      fx.names.push(name);
      await P.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
      const token = coreHash.randomToken(32) as string;
      await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 864e5), expiresAt: new Date(Date.now() + 864e5) } });
      return { id: u.id, name, tenantId, role, unitAccess, permissions };
    },
    async mkEmp(tenantId: string, systemId: string, name: string, o: { linkedUserId?: string | null; unitId?: string | null; status?: string; active?: boolean } = {}): Promise<string> {
      const e = await P.hrEmployee.create({ data: { tenantId, systemId, name, linkedUserId: o.linkedUserId ?? null, ...(o.unitId ? { unitId: o.unitId } : {}), ...(o.status ? { employmentStatus: o.status } : {}), ...(o.active === false ? { active: false } : {}) } });
      fx.names.push(name);
      return e.id;
    },
  };
}
async function rawRows(P: Any, sql: string, ...params: unknown[]): Promise<Any[] | null> {
  try {
    return (await P.$queryRawUnsafe(sql, ...params)) as Any[];
  } catch {
    return null;
  }
}
const HR_RAW_TABLES = ["HrShiftSwapRequest", "HrTimeCorrection", "HrOtRequest", "HrLeaveBalanceTxn", "HrRosterEntry", "HrShift", "HrHoliday", "HrLeavePolicy", "HrEmployeeUnit"];
const MODEL_ORDER = ["approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy", "hrPayrollItem", "hrPayAdjustment", "hrPayrollRun", "hrSalaryProfile", "hrEmployeeDoc", "hrAttendance", "hrLeave", "hrWorkSchedule", "hrEmployee", "outboxEvent", "appNotification", "webhookDelivery", "auditLog", "aiProposal", "aiPlan", "aiMessage", "aiConversation", "party", "membership", "appSystemUnit", "appSystem", "businessUnit"];
async function sweep(P: Any, fx: { tenants: string[]; users: string[] }, slug: string): Promise<void> {
  const d = async (n: string, f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (e) {
      console.log(`  ⚠ cleanup ${n}: ${errText(e).slice(0, 90)}`);
    }
  };
  for (let pass = 0; pass < 2; pass++)
    for (const tid of fx.tenants) {
      for (const t of HR_RAW_TABLES) await d(t, () => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid));
      for (const m of MODEL_ORDER) if (P[m]?.deleteMany) await d(m, () => P[m].deleteMany({ where: { tenantId: tid } }));
      await d("tenant", () => P.tenant.deleteMany({ where: { id: tid } }));
    }
  const extra = ((await P.user.findMany({ where: { email: { startsWith: `${slug}-` } }, select: { id: true } }).catch(() => [])) as Any[]).map((u) => u.id as string);
  for (const uid of [...new Set([...fx.users, ...extra])]) {
    await d("session", () => P.session.deleteMany({ where: { userId: uid } }));
    await d("appNotification(user)", () => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    await d("membership(user)", () => P.membership.deleteMany({ where: { userId: uid } }));
    await d("user", () => P.user.deleteMany({ where: { id: uid } }));
  }
}
async function residueOf(P: Any, fx: { tenants: string[]; users: string[] }, slug: string, slugPrefix: string): Promise<string[]> {
  const out: string[] = [];
  for (const tid of fx.tenants) {
    for (const m of ["hrLeave", "hrEmployee", "auditLog", "outboxEvent", "approvalRequest", "approvalPolicy", "membership", "appSystem", "businessUnit"]) {
      const n = await P[m].count({ where: { tenantId: tid } }).catch(() => -1);
      if (n !== 0) out.push(`${m}=${n}`);
    }
    for (const t of HR_RAW_TABLES) {
      const r = await rawRows(P, `SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      const n = r ? Number(r[0]?.n ?? -1) : -2;
      if (n !== 0) out.push(`${t}=${n}`);
    }
  }
  const lu = await P.user.count({ where: { OR: [{ id: { in: fx.users.length ? fx.users : ["∅"] } }, { email: { startsWith: `${slug}-` } }] } }).catch(() => -1);
  const ls = fx.users.length ? await P.session.count({ where: { userId: { in: fx.users } } }).catch(() => -1) : 0;
  const lt = await P.tenant.count({ where: { slug: { startsWith: slugPrefix } } }).catch(() => -1);
  if (lu !== 0) out.push(`user=${lu}`);
  if (ls !== 0) out.push(`session=${ls}`);
  if (lt !== 0) out.push(`tenant(${slugPrefix}*)=${lt}`);
  return out;
}

// ── races: a holder lane takes an advisory key; `calls` start and must queue on it; holder runs `during`, commits ──
async function holdAdvisory<R>(P: Any, key: string, during: (tx: Any) => Promise<unknown>, calls: (() => Promise<R>)[]): Promise<{ res: R[]; waited: boolean; holderErr: string }> {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: () => void = () => {};
  const heldP = new Promise<void>((r) => (held = r));
  let holderErr = "";
  const holder = P.$transaction(
    async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT count(pg_advisory_xact_lock(hashtextextended($1::text, 0)))::int AS n`, key);
      held();
      await gate;
      await during(tx);
    },
    { maxWait: 10_000, timeout: 60_000 },
  ).catch((e: unknown) => ((holderErr = errText(e)), held()));
  await heldP;
  const ps = calls.map((c) => c());
  let seen = 0;
  for (let i = 0; i < 80 && seen < calls.length; i++) {
    await sleep(100);
    const w = await rawRows(P, `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`);
    seen = Math.max(seen, Number(w?.[0]?.n ?? 0));
  }
  release();
  await holder;
  return { res: await Promise.all(ps), waited: seen >= 1, holderErr };
}
/** deliver one outbox row to its consumer (never marks it processed) */
async function deliver(CONS: Any, e: Any): Promise<{ ok: boolean; err: string }> {
  const fn = CONS?.[e?.type];
  if (typeof fn !== "function") return { ok: false, err: `MISSING consumer for ${e?.type}` };
  try {
    await fn({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
    return { ok: true, err: "" };
  } catch (err) {
    return { ok: false, err: errText(err) };
  }
}
// ── service calls: module absent / function missing ⇒ { ok:false, text:"∅fn" } (RED for the right reason) · refusals recorded ──
type RO = { ok: boolean; text: string; value: Any };
const refusals: { label: string; text: string }[] = [];
const modState = (m: Any, f: string) => (m === null ? `∅ ${f}` : m.__err ? `import error ${m.__err}` : "loaded");
const loadOpt = async (file: string, spec: string) => (existsSync(join(ROOT, file)) ? ((await import(spec).catch((e: unknown) => ({ __err: errText(e) }))) as Any) : null);
async function callMod(M: Any, file: string, fn: string, args: unknown[], label = fn): Promise<RO> {
  const m = M && !M.__err ? M : null;
  if (typeof m?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(M, file)})`, value: undefined };
  try {
    const v = (await m[fn](...args)) as Any;
    const ok = !!v && typeof v === "object" && v.ok !== false;
    if (!ok) refusals.push({ label, text: textOf(v) });
    return { ok, text: ok ? "" : textOf(v), value: v };
  } catch (e) {
    refusals.push({ label, text: `THROW ${errText(e)}` });
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  }
}
const said = (r: RO, t: string) => !r.ok && r.text === t;
const shown = (r: RO | null | undefined) => (!r ? "-" : r.ok ? "ok" : `"${short(r.text, 60)}"`);
const idOf = (r: RO) => (r.ok ? String(r.value?.id ?? "") : "");
/** chk over named sub-conditions (actual = the failing names + extra) */
const ck = (id: string, r: Record<string, unknown>, expected: string, extra = "") => chk(id, Object.values(r).every(Boolean), expected, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
// ◂ LIB-CANDIDATE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const SUITE = "qc-hr-h2.3";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h23-";
const HRD = "src/lib/modules/hr/";
const SWAP = `${HRD}swap.ts`;
const SWAP_RULES = `${HRD}swap-rules.ts`;
const ROSTER = `${HRD}roster.ts`;
const RULES_FILE = `${HRD}payroll-rules.ts`;
const RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";
const R14_FROZEN = ["service", "settings", "time-rules", "payroll", "payroll-rules", "payroll-digest", "privacy-shared", "roster-rules"].map((f) => `${HRD}${f}.ts`);
const CORE_HUNK_FILES = ["service", "labels", "actions"].map((f) => `src/lib/modules/approval/${f}.ts`);
const MARK = "HR H2.3";
const ENTITY = "HrShiftSwapRequest";
const EV_REQ = "hr.shift.swap_requested";
const EV_OK = "hr.shift.swap_approved";
const LBL: Record<string, string> = { [EV_REQ]: "เมื่อพนักงานขอสลับกะ (HR)", [EV_OK]: "เมื่ออนุมัติสลับกะ (HR)" };
// fixed texts (brief R2–R13 · H2.1 ROSTER_TEXT · H1.1 · approval core SELF_DECIDE_REFUSED)
const T = {
  noTarget: "เลือกเพื่อนร่วมงานที่จะรับกะก่อน",
  notOwn: "ขอสลับได้เฉพาะกะของคุณเอง",
  shiftNf: "ไม่พบกะนี้ — กรุณารีเฟรช",
  unpub: "กะนี้ยังไม่เผยแพร่ — ขอสลับได้หลังผู้จัดการเผยแพร่ตาราง",
  past: "กะนี้ผ่านไปแล้ว — ขอสลับไม่ได้",
  selfTarget: "เลือกเพื่อนร่วมงานคนอื่น",
  targetNf: "ไม่พบเพื่อนร่วมงานคนนี้ หรือพ้นสภาพแล้ว",
  unlinked: "เพื่อนร่วมงานคนนี้ยังไม่มีบัญชีในระบบ — ให้ผู้จัดการจัดกะให้แทน",
  branch: "สลับได้เฉพาะคนในสาขาเดียวกันในวันนั้น — ให้ผู้จัดการยืมตัวก่อน",
  toBad: "กะของเพื่อนร่วมงานไม่ถูกต้อง — กรุณารีเฟรช",
  same: "สองกะนี้เหมือนกัน — ไม่ต้องสลับ",
  leavePeer: "เพื่อนร่วมงาน ลาอนุมัติแล้วในวันนั้น — สลับไม่ได้",
  leaveYou: "คุณ ลาอนุมัติแล้วในวันนั้น — สลับไม่ได้",
  dup: "พนักงานคนนี้มีกะนี้ในวันนั้นแล้ว",
  open: "กะนี้มีคำขอสลับค้างอยู่แล้ว — ยกเลิกคำขอเดิมก่อน",
  notYours: "คำขอนี้ไม่ได้ส่งถึงคุณ",
  stale: "สถานะคำขอเปลี่ยนไปแล้ว กรุณาเปิดดูใหม่",
  expired: "เลยวันของกะนี้แล้ว — คำขอหมดอายุ",
  inChain: "คำขอนี้อยู่ในสายอนุมัติ — ตัดสินที่หน้ารออนุมัติ",
  decided: "คำขอนี้ตัดสินแล้ว — ยกเลิกเองไม่ได้",
  self: "อนุมัติคำขอของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน",
  otherBranch: "พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ",
  unassigned: "พนักงานคนนี้ยังไม่ระบุสาขาประจำ — ผู้ดูแลทุกสาขาเป็นผู้จัดการ",
  entryChanged: "กะนี้เพิ่งถูกแก้ไข — กรุณารีเฟรชแล้วลองใหม่",
  noPerm: "คุณไม่มีสิทธิ์จัดตารางกะ",
  endedYou: "คุณ อยู่นอกช่วงการจ้างในวันนั้น — สลับไม่ได้", // r2 F3 (ORACLE-EDIT r2 · S10.4)
} as const;
const FIXED = new Set<string>(Object.values(T));
const ITEM_KEYS = ["id", "shape", "status", "createdAt", "peerDecidedAt", "decidedAt", "requester", "target", "from", "to", "canRespond", "canCancel"];
const ITEM_OPT = ["reason", "outcome"];
const SIDE_KEYS = "crossesMidnight,date,endMin,entryId,shiftName,startMin";
const P_REQ = "fromEntryId,requesterEmployeeId,swapId,systemId,targetEmployeeId,toEntryId";
const P_OK = "dates,employeeIds,entryIds,swapId,systemId";
const AUDIT_REQ = ["swapId", "fromEntryId", "toEntryId", "targetEmployeeId", "shape"];

const D = (id: string, g: string, sev: Sev, base: Base, title: string): Def => [`H2.3-${id}`, g, sev, base, title] as const;
const C = "CRITICAL", M = "MAJOR"; // prettier-ignore
const CHECKS: readonly Def[] = [
  D("S1.1", "R4", C, "RED", "SWAP ok ⇒ AWAITING_PEER · ids · requestedByUserId · reason trimmed · 1 id-only audit · 1 " + EV_REQ),
  D("S1.2", "R2", M, "RED", "GIVE to a colleague off that day ⇒ AWAITING_PEER · toEntryId null"),
  D("S1.3", "R2", M, "RED", "target null ⇒ noTarget text · 0 rows"),
  D("S1.4", "R3", C, "RED", "colleague's entry / posted employee id ⇒ notOwn text · 0 rows"),
  D("S1.5", "R4", M, "RED", "unpublished / past / sys2 / other-tenant entry ⇒ texts · 0 rows"),
  D("S1.6", "R4", M, "RED", "target ENDED / unlinked / self ⇒ texts · 0 rows"),
  D("S1.7", "R4", M, "RED", "u2 colleague ⇒ branch text · same colleague borrowed into u1 that day ⇒ ok"),
  D("S1.8", "R4", M, "RED", "worker on APPROVED leave ⇒ เพื่อนร่วมงาน/คุณ leave texts (no names)"),
  D("S1.9", "R4", M, "RED", "new holder already holds (date, shiftId) ⇒ dup text"),
  D("S1.10", "R4", C, "RED", "2nd open request on fromEntry · toEntry already in an open request ⇒ open text"),
  D("S1.11", "R4", C, "RED", "FROM entry = another open request's TO entry ⇒ open text · 0 rows · 0 events (ruling 5)"),
  D("S1.12", "R4", C, "RED", "TO entry = another open request's FROM entry ⇒ open text · 0 rows · 0 events (ruling 5)"),
  D("S2.1", "R7", C, "RED", "accept (policy on) ⇒ PENDING · 1 ApprovalRequest (systemId · unit u1 · requestedById = requester user)"),
  D("S2.2", "R5", M, "RED", "decline ⇒ REJECTED · peerDecidedAt · decidedById null · no request"),
  D("S2.3", "R7", C, "RED", "respond by requester / bystander / manager ⇒ notYours · AWAITING_PEER"),
  D("S2.4", "R5", M, "RED", "accept twice ⇒ stale text · 1 request"),
  D("S2.5", "R5", M, "RED", "requester cancels AWAITING_PEER ⇒ CANCELLED"),
  D("S2.6", "R5", M, "RED", "swapTransition vectors · respond/cancel on terminal swaps refused"),
  D("S2.7", "R5", M, "RED", "accept after the entry date passed ⇒ expired text · CANCELLED"),
  D("S2.8", "R7", M, "RED", "accept re-validates (target on APPROVED leave since create) ⇒ leave text · AWAITING_PEER"),
  D("S3.1", "R8", C, "RED", "chain approve + effect by event ⇒ rewritten · APPROVED · decidedById · 1 " + EV_OK + " · 1 apply audit"),
  D("S3.2", "R8", M, "RED", "chain reject + effect ⇒ REJECTED · decidedById · untouched"),
  D("S3.3", "Q1", C, "RED", "no policy ⇒ PENDING w/o request · decideSwap(mgr-u1) ⇒ APPROVED + rewritten + warnings[]"),
  D("S3.4", "R7", M, "RED", "decideSwap while a chain request exists ⇒ inChain text"),
  D("S3.5", "R8", C, "RED", "self: core by target ⇒ reason · core by requester ⇒ SELF_APPROVAL + reason · decideSwap by party ⇒ text · unchanged"),
  D("S3.6", "Q8", M, "RED", "owner = requester / target ⇒ APPROVED at accept · rewritten · no request · hr.swap.owner_auto"),
  D("S3.7", "R13", C, "RED", "cancel PENDING in chain ⇒ swap + request CANCELLED · after chain decided ⇒ decided text"),
  D("S3.8", "R12", M, "RED", "entityLabel = คำขอสลับกะ · actions.ts allow-list · base types kept"),
  D("S3.9", "F2", "MINOR", "RED", "listMyRequests: requester only"),
  D("S4.1", "R6", C, "RED", "SWAP rewrite keeps ids · published/publishedAt · times · shiftId · unitId · source MANUAL"),
  D("S4.2", "R6", M, "RED", "GIVE (direct): row moves · requester has no row that day"),
  D("S4.3", "R8", C, "RED", "target gains same (date,shift) after accept ⇒ untouched · CANCELLED · audit DUP · no throw · request APPROVED"),
  D("S4.4", "R8", C, "RED", "(a) moveEntry after chain APPROVED ⇒ CANCELLED (Q16) · no-op (b) out-of-band edit ⇒ ENTRY_CHANGED · no throw"),
  D("S4.5", "R8", M, "RED", "fromEntry removed after chain APPROVED ⇒ effect no-op · no throw · no event"),
  D("S4.6", "R13", C, "RED", "decide ∥ cancel 10 lanes × 3 rounds ⇒ APPROVED+rewritten or CANCELLED+untouched"),
  D("S4.7", "R8", C, "RED", "approval event ×2 seq + ×2 par ⇒ 1 rewrite · 1 " + EV_OK + " · 1 apply audit"),
  D("S4.8", "R13", C, "RED", "effect ∥ moveEntry under a held roster key ⇒ one order"),
  D("S4.9", "R8", M, "RED", "rosterOnDay after approval ⇒ new holder + userId"),
  D("S4.10", "R13", M, "RED", "hr-swap lock before roster lock · reassignEntriesInTx only swap.ts + roster.ts · both exported"),
  D("S5.1", "R10", M, "RED", "GIVE making a 16 h day ⇒ APPROVED + MAX_DAY(target)"),
  D("S5.2", "R10", M, "RED", "< 11 h rest ⇒ REST in swapPreview and decideSwap"),
  D("S5.3", "R6", M, "RED", "overnight GIVE stays on its start day"),
  D("S5.4", "R10", M, "RED", "warnings never name a third employee or their entries"),
  D("S5.5", "R1", M, "RED", "swap-rules.ts pure (no DB import · no clock)"),
  D("S6.1", "R10", C, "RED", "viewer matrix listMySwaps / listSwapsForManager"),
  D("S6.2", "R10", C, "RED", "peer DTO keys exact · no other requester rows"),
  D("S6.3", "Q18", C, "RED", "reason: requester · target · in-scope deciders only"),
  D("S6.4", "Q9", C, "RED", "mgr-u1 decideSwap on a u2 swap ⇒ H1.1 text · unchanged"),
  D("S6.5", "R12.1", M, "RED", "unitAccess [] writer = tenant-wide (lists + decides u2)"),
  D("S6.6", "R11", M, "RED", "swap-actions.ts · approvals page testids · ui inventory"),
  D("S6.7", "R9", C, "RED", "event payload keys exact · no names / reason"),
  D("S6.8", "X2", C, "RED", "other-tenant / sys2 ctx on a swap id ⇒ refused · unchanged"),
  D("S6.9", "R4", M, "RED", "every swap refusal is a fixed text without name/id"),
  D("S7.1", "R9", C, "RED", "consumers for both events = withAutomation"),
  D("S7.2", "R9", M, "RED", "one automation label each · none in webhooks file · once in WEBHOOK_EVENTS"),
  D("S7.3", "C.10", C, "RED", "both events ×2 seq + ×2 par ⇒ ok · unchanged"),
  D("S7.4", "C.10", M, "RED", "re-emit same key ⇒ one outbox row"),
  D("S7.5", "R9", M, "RED", "rejected / cancelled swaps emit no " + EV_OK),
  D("S8.1", "R14", C, "GREEN", "H2.1 engine on a week with a decided swap: rosterOnDay unique + current holders · publishRoster only unpublished rows · copyWeek 1:1 (ruling 8)"),
  D("S8.2", "R14", C, "GREEN", "R14 files unchanged · roster.ts = base + H2.3 hunks (n/a once H2.3 in base)"),
  D("S8.3", "R12", C, "GREEN", "approval core / effects = base + H2.3 hunks (n/a once in base)"),
  D("S8.4", "R14", C, "GREEN", "HrLeave chain approve/reject + effect unchanged"),
  D("S8.5", "C.4", C, "GREEN", "payroll-rules.ts sha 75a66c0c…"),
  D("S9.1", "Δ4", C, "RED", "decideSwap ∥ moveEntry ⇒ (APPROVED ∧ move entryChanged) or (moved ∧ CANCELLED)"),
  D("S9.2", "Δ4", C, "RED", "decideSwap ∥ publishRoster ⇒ both ok · publishedAt kept · event = unpublished row only"),
  D("S9.3", "R4", C, "RED", "2 requesters × 5 lanes × 3 rounds on one toEntry ⇒ exactly 1 open"),
  D("S9.4", "R8", C, "RED", "2 approved GIVEs of the same (date,shift) to one colleague ⇒ 1 applied · 1 CANCELLED DUP"),
  D("S9.5", "Q16", C, "RED", "moveEntry (from/to) · removeEntry · AWAITING_PEER ⇒ swap + request CANCELLED"),
  // r2 fix round (controller rulings 11 Nov · pre-approved ORACLE-EDIT): one check per fix
  D("S10.1", "r2-F1", M, "RED", "moved (published=false, publishedAt kept) row ⇒ request refused unpublished text · 0 rows · 0 events"),
  D("S10.2", "r2-F2b", M, "RED", "510 newer u2 closed rows ⇒ mgr-u1 still lists its open u1 swap · mgrAll lists it (open first)"),
  D("S10.3", "r2-F2", M, "RED", "FROM u1 · TO u2 swap: mgr-u1 list item has no reason · mgrAll (both in scope) has reason"),
  D("S10.4", "r2-F3", M, "RED", "requester on leave / out of employment on to-day ⇒ decideSwap names คุณ (leaveYou · endedYou)"),
  D("S10.5", "r2-m4", M, "RED", "out-of-scope decider on a closed swap ⇒ H1.1 branch text (scope before status)"),
  D("X1.1", "X1", C, "RED", "10 lanes × 3 rounds requestSwap same entry ⇒ 1 row"),
  D("X6.1", "X6", C, "RED", "10 lanes accept ⇒ 1 PENDING · 1 request"),
  D("X2.1", "X2", C, "RED", "sys2 / other-tenant target or toEntry ⇒ refused · 0 rows"),
  D("X12.1", "X12", M, "GREEN", "fitness + fitness-hr exit 0 with and without env"),
  D("Z1", "-", C, "GREEN", "residue: qc-hr-h23-* tenants + every row of ours gone"),
];
initRegistry("H2.3-", CHECKS);
if (ARGV.includes("--list")) listAndExit(SUITE);
const skipReasons: string[] = existsSync(join(ROOT, SWAP)) ? [] : [`H2.3 not built: ${SWAP} absent`];
if (skipReasons.length && !FORCE) skipAndExit(SUITE, skipReasons);

// ═════════ statics ═════════
/** H2.3 merged into the base ⇒ "did not touch X vs base" statics are n/a (pattern h13InBase): the base already carries swap.ts */
const h23InBase = () => fileAtBase(SWAP) !== null;
const NB: Record<string, Any> = {};
function runStatic(): void {
  const swc = stripComments(rd(SWAP));
  const rsc = stripComments(rd(ROSTER));
  {
    let users: string[] = [];
    try {
      users = git(["grep", "-l", "reassignEntriesInTx", "--", "src"]).split("\n").filter(Boolean);
    } catch {
      /* none */
    }
    const fns = swc.split(/\n(?:export\s+)?async\s+function\s+/).slice(1);
    const bad = fns.filter((c) => /lockRosterKeysInTx\(/.test(c) && !/^requestSwap\b/.test(c)).filter((c) => !(Math.min(...[c.indexOf("hr-swap:"), c.search(/lockSwap\w*\(/)].filter((i) => i >= 0), Infinity) < c.indexOf("lockRosterKeysInTx(")));
    ck("S4.10", { swap: !!swc, uses: /lockRosterKeysInTx\(/.test(swc) && /reassignEntriesInTx\(/.test(swc), order: fns.length > 0 && !bad.length, files: users.includes(ROSTER) && users.every((f) => f === SWAP || f === ROSTER), exported: ["lockRosterKeysInTx", "reassignEntriesInTx"].every((n) => new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(rsc)) }, "lock order · 2 files · exported", `users=${users.join(",") || "∅"}`);
  }
  {
    const c = stripComments(rd(SWAP_RULES));
    const imps = [...c.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2] ?? "").filter((s) => /prisma|core\/db|@\/lib\/core|tenantDb|\.\/service|\.\/swap$|\.\/roster$/.test(s));
    ck("S5.5", { exists: !!c, imports: !imps.length, clock: !/Date\.now\(|new Date\(\s*\)/.test(c) }, "pure", imps.join(","));
  }
  {
    const a = stripComments(rd(`${HRD}swap-actions.ts`));
    const page = rd("src/app/app/approvals/page.tsx");
    const inv = rd("scripts/hr-ui-inventory.json");
    ck("S6.6", { useServer: /^\s*["']use server["']/.test(a), actions: ["request", "respond", "cancel", "decide"].every((n) => new RegExp(`export\\s+async\\s+function\\s+${n}SwapAction\\b`).test(a)), noDb: !!a && !/@\/lib\/core\/db|\bprisma\b|tenantDb\(/.test(a), page: /hr-swap-respond-/.test(page) && /hr-swap-cancel-/.test(page) && /cancelSwapAction/.test(page), inventory: /hr-swap-respond-/.test(inv) && /hr-swap-cancel-/.test(inv) }, "use server · 4 actions · no DB · testids · inventory");
  }
  {
    const cons = stripComments(rd("src/lib/outbox-consumers.ts"));
    const auto = stripComments(rd("src/lib/automation/labels.ts"));
    const hook = stripComments(rd("src/lib/webhooks/labels.ts"));
    for (const ev of [EV_REQ, EV_OK]) {
      const e = ev.replace(/\./g, "\\.");
      NB[ev] = {
        cons: new RegExp(`["']${e}["']\\s*:\\s*withAutomation\\(`).test(cons),
        label: [...auto.matchAll(new RegExp(`\\{\\s*value:\\s*["']${e}["']\\s*,\\s*label:\\s*["']([^"']*)["']\\s*\\}`, "g"))].map((m) => m[1]).join("|") === LBL[ev] && auto.split(ev).length === 2 && hook.split(ev).length === 1,
      };
    }
  }
  {
    const inBase = h23InBase();
    const same = (p: string, max = Infinity) => {
      const b = fileAtBase(p);
      if (b === null) return `∅base ${p}`;
      const h = stripMarked(rd(p), MARK);
      return h.text === stripMarked(b, MARK).text && h.blocks <= max ? "ok" : `${p.split("/").pop()} differs outside ${MARK} hunks (blocks ${h.blocks})`;
    };
    const join2 = (xs: string[]) => xs.filter((x) => x !== "ok" && x !== "unchanged").join(" · ") || "ok";
    const r82 = inBase ? "n/a" : join2([changedVsBase(R14_FROZEN), same(ROSTER)]);
    chk("S8.2", r82 === "ok" || r82 === "n/a", "R14 unchanged · roster = base + hunks", `${r82 === "n/a" ? "n/a · H2.3 in base (ORACLE-EDIT pattern h13InBase)" : r82} (base ${baseRef().slice(0, 9)})`);
    let r83 = "n/a";
    if (!inBase) {
      const ch = changedVsBase(["src/lib/modules/approval"]);
      const extra = ch.startsWith("changed:") ? ch.slice(9).split(",").filter((f) => !CORE_HUNK_FILES.includes(f)) : [];
      r83 = join2([extra.length ? `other approval files: ${extra}` : "ok", ...CORE_HUNK_FILES.map((f) => same(f)), same("src/lib/approval-effects.ts", 1)]);
    }
    chk("S8.3", r83 === "ok" || r83 === "n/a", "core = base + R12 hunks · effects ≤1 block", r83 === "n/a" ? "n/a · H2.3 in base" : r83);
    const rs = sha(rd(RULES_FILE));
    chk("S8.5", rs === RULES_SHA, RULES_SHA.slice(0, 16), rs.slice(0, 16));
  }
}

// ═════════ DB ═════════
await guardQc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although: ${skipReasons.join(" · ")} (expect RED for the right reason, no crash)`);
const P = ((await import("@/lib/core/db")) as Any).prisma as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const hr = (await import("@/lib/modules/hr/service")) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const coreOutbox = (await import("@/lib/core/outbox" as string)) as Any;
const approval = (await import("@/lib/modules/approval/service" as string)) as Any;
const apLabels = (await import("@/lib/modules/approval/labels" as string)) as Any;
const rMod = await loadOpt(ROSTER, "@/lib/modules/hr/roster");
const swMod = await loadOpt(SWAP, "@/lib/modules/hr/swap");
const srMod = await loadOpt(SWAP_RULES, "@/lib/modules/hr/swap-rules");
const CONS: Any = ((await import("@/lib/outbox-consumers" as string).catch(() => null)) as Any)?.consumers ?? {};
const autoLabels = (await import("@/lib/automation/labels" as string).catch(() => null)) as Any;
const hookLabels = (await import("@/lib/webhooks/labels" as string).catch(() => null)) as Any;
console.log(`[${SUITE}] modules: swap=${modState(swMod, SWAP)} · swap-rules=${modState(srMod, SWAP_RULES)} · roster=${modState(rMod, ROSTER)}`);

const tag = Math.random().toString(36).slice(2, 6).replace(/\d/g, "x"); // letters only (AI tools mask 9+ digit runs — rows identified by id)
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const sw = (fn: string, ...a: unknown[]) => callMod(swMod, SWAP, fn, a);
const ro = (fn: string, ...a: unknown[]) => callMod(rMod, ROSTER, fn, a, `roster.${fn}`);
const items = (r: RO): Any[] => (Array.isArray(r.value?.items) ? r.value.items : Array.isArray(r.value) ? r.value : []);
const ids = (r: RO) => items(r).map((i) => String(i?.id ?? ""));
const itemOf = (r: RO, id: string) => items(r).find((i) => i?.id === id);

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H2.3 สลับกะ");
  const T2 = await fx.newTenant("-other", "QC HR H2.3 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const sA = await sysSvc.createSystem(TT, "HR", "ทีมงาน A");
  await sleep(30);
  const s2 = await sysSvc.createSystem(TT, "HR", "ทีมงาน สอง");
  const sO = await sysSvc.createSystem(T2, "HR", "ทีมร้านอื่น");
  const ctx = { tenantId: TT, systemId: sA.id };
  const ctx2 = { tenantId: TT, systemId: s2.id };
  const ctxO = { tenantId: T2, systemId: sO.id };
  const K = { "hr.employee.create": true };
  const L = { "hr.leave.request": true };
  const mk = (t: string, r: Who["role"], ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC23 ${t} ${tag}`, r, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}), mgrU1: await mk("mgru1", "MANAGER", [u1], K), mgrU2: await mk("mgru2", "MANAGER", [u2], K), mgrAll: await mk("mgrall", "MANAGER", ["*"], K),
    mgrEmpty: await mk("mgrempty", "MANAGER", [], K), mgrRole: await mk("mgrrole", "MANAGER", [u1], {}), pay: await mk("pay", "STAFF", ["*"], { "hr.payroll.read": true }),
    A: await mk("sa", "STAFF", [u1], L), B: await mk("sb", "STAFF", [u1], L), C: await mk("sc", "STAFF", [u1], L), Dd: await mk("sd", "STAFF", [u2], L), D2: await mk("sdd", "STAFF", [u2], L),
    member: await mk("member", "STAFF", [], {}), other: await mk("other", "OWNER", [], {}, T2),
  };
  const emp = (n: string, o: Any, sys = sA.id, tid = TT) => fx.mkEmp(tid, sys, `QC23 พนง ${n} ${tag}`, o);
  const E = {
    O: await emp("โอ", { linkedUserId: U.owner.id, unitId: u1 }), M: await emp("เอ็ม", { linkedUserId: U.mgrU1.id, unitId: u1 }), A: await emp("เอ", { linkedUserId: U.A.id, unitId: u1 }),
    B: await emp("บี", { linkedUserId: U.B.id, unitId: u1 }), C: await emp("ซี", { linkedUserId: U.C.id, unitId: u1 }), D: await emp("ดี", { linkedUserId: U.Dd.id, unitId: u2 }),
    D2: await emp("ดีสอง", { linkedUserId: U.D2.id, unitId: u2 }), Un: await emp("ไม่ผูก", { unitId: u1 }), End: await emp("ออกแล้ว", { unitId: u1, status: "ENDED", active: false }),
    S2: await emp("ระบบสอง", { unitId: u1 }, s2.id), X: await emp("ร้านอื่น", {}, sO.id, T2),
  };
  const shift = (sys: string, tid: string, name: string, s: number, e: number, cm = false) => P.hrShift.create({ data: { tenantId: tid, systemId: sys, name, startMin: s, endMin: e, breakMin: 0, crossesMidnight: cm } }).then((r: Any) => r.id as string);
  const S = { m: await shift(sA.id, TT, "เช้า", 420, 900), a: await shift(sA.id, TT, "บ่าย", 720, 1200), e: await shift(sA.id, TT, "เย็น", 900, 1380), n: await shift(sA.id, TT, "ดึก", 1320, 360, true) };
  const S2m = await shift(s2.id, TT, "เช้าสอง", 420, 900);
  const SOm = await shift(sO.id, T2, "เช้าร้านอื่น", 420, 900);
  // ── helpers ──
  let dayN = 0;
  const nd = () => addDay("2031-01-06", 4 * dayN++); // each scenario on its own 4-day block (2031, unused by other oracles)
  const yesterday = addDay(hr.bkkParts(new Date()).dateStr as string, -1); // placement only
  async function ents(c: Any, who: Who, specs: [string, string, string][], pub = true): Promise<string[]> {
    const out: string[] = [];
    for (const [e, sh, day] of specs) {
      const r = await ro("addEntry", c, vOf(who), { employeeId: e, date: day, shiftId: sh });
      if (!r.ok) throw new Error(`fixture addEntry ${day}: ${r.text}`);
      out.push(r.value.id);
    }
    const ds = specs.map((s) => s[2]).sort();
    const r = pub ? await ro("publishRoster", c, vOf(who), { from: ds[0], to: ds[ds.length - 1] }) : null;
    if (r && !r.ok) throw new Error(`fixture publish: ${r.text}`);
    return out;
  }
  const E1 = (specs: [string, string, string][], pub = true) => ents(ctx, U.owner, specs, pub);
  const swRow = (id: string) => (id ? P.hrShiftSwapRequest.findUnique({ where: { id } }) : Promise.resolve(null)) as Promise<Any>;
  const st = async (id: string) => (await swRow(id))?.status ?? null;
  const row = (id: string) => (id ? P.hrRosterEntry.findUnique({ where: { id } }) : Promise.resolve(null)) as Promise<Any>;
  const holder = async (id: string) => (await row(id))?.employeeId;
  const reqOf = (id: string) => P.approvalRequest.findFirst({ where: { tenantId: TT, entityType: ENTITY, entityId: id || "∅" } }) as Promise<Any>;
  const reqSt = async (id: string) => (await reqOf(id))?.status ?? null;
  const reqN = (id: string) => P.approvalRequest.count({ where: { tenantId: TT, entityType: ENTITY, entityId: id || "∅" } }) as Promise<number>;
  const swN = () => P.hrShiftSwapRequest.count({ where: { tenantId: TT } }) as Promise<number>;
  const evFor = async (type: string, id: string) => ((await P.outboxEvent.findMany({ where: { tenantId: TT, type } })) as Any[]).filter((e) => !!id && e.payload?.swapId === id);
  const audits = async (action: string, id: string) => ((await P.auditLog.findMany({ where: { tenantId: TT, action } })) as Any[]).filter((a) => !!id && (a.after?.swapId === id || a.targetId === id));
  const codes = async (id: string) => (await audits("hr.swap.apply_refused", id)).map((a) => a.after?.code).join(",");
  const req = (who: Who, from: string, target: string | null, to: string | null = null, extra: Any = {}) => sw("requestSwap", ctx, vOf(who), { fromEntryId: from, targetEmployeeId: target, toEntryId: to, ...extra });
  const acc = (who: Who, id: string, accept = true) => sw("respondSwap", ctx, vOf(who), id, { accept });
  const dec = (who: Who, id: string, decision = "APPROVED") => sw("decideSwap", ctx, vOf(who), id, { decision });
  const cancel = (who: Who, id: string, c = ctx) => sw("cancelSwap", c, vOf(who), id);
  const coreDecide = async (who: Who, id: string, decision = "APPROVED") => {
    const q = await reqOf(id);
    return q ? approval.decide(vOf(who), { tenantId: TT }, q.id, { decision }).catch((e: unknown) => ({ ok: false, status: `THROW ${errText(e)}` })) : { ok: false, status: "NO_REQUEST" };
  };
  const deliverDecision = async (id: string) => {
    const q = await reqOf(id);
    const e = q ? await P.outboxEvent.findFirst({ where: { tenantId: TT, idempotencyKey: { in: ["approved", "rejected"].map((t) => `approval.request.${t}#${q.id}`) } } }) : null;
    return e ? deliver(CONS, e) : { ok: false, err: "no decision event" };
  };
  const dl = (x: { ok: boolean; err: string }) => (x.ok ? "ok" : short(x.err, 50));
  const policy = await approval.createPolicy({ tenantId: TT }, { name: "QC23 สายสลับกะ", entityType: ENTITY, systemId: sA.id, steps: [{ order: 1, approverRole: "MANAGER" }] });
  const chain = (on: boolean) => approval.setPolicyActive({ tenantId: TT }, policy.id, on);
  await chain(false);
  type Pair = { a: string; b: string; d1: string; id: string; r: RO; ar: RO | null };
  /** SWAP a(A,d1,m) ↔ b(B,d1+1,a) (or GIVE a → B) · chain on/off · optional peer accept */
  const pair = async (o: { chain?: boolean; accept?: boolean; give?: boolean } = {}): Promise<Pair> => {
    const d1 = nd();
    const [a, b = ""] = await E1(o.give ? [[E.A, S.m, d1]] : [[E.A, S.m, d1], [E.B, S.a, addDay(d1, 1)]]);
    await chain(!!o.chain);
    const r = await req(U.A, a!, E.B, o.give ? null : b);
    const id = idOf(r);
    return { a: a!, b, d1, id, r, ar: o.accept ? await acc(U.B, id) : null };
  };
  const swapped = async (x: Pair) => (await holder(x.a)) === E.B && (!x.b || (await holder(x.b)) === E.A);
  const untouched = async (x: Pair) => (await holder(x.a)) === E.A && (!x.b || (await holder(x.b)) === E.B);
  const rdrRoster = async (day: string): Promise<Any[]> => {
    try {
      return ((await rMod?.rosterOnDay?.({ tenantId: TT, date: day, systemId: sA.id }))?.entries ?? []) as Any[];
    } catch {
      return [];
    }
  };
  const tl: Record<string, string> = {};

  // ═══ S1 create ═══
  console.log("── S1 create ──");
  const REASON = "ไปงานแต่งญาติต่างจังหวัด";
  const d11 = nd();
  const [a11, b11, extra11] = await E1([[E.A, S.m, d11], [E.B, S.a, addDay(d11, 1)], [E.A, S.e, addDay(d11, 1)]]);
  const r11 = await req(U.A, a11!, E.B, b11!, { reason: `  ${REASON}  ` });
  const s11 = idOf(r11);
  {
    const w = await swRow(s11);
    const au = await audits("hr.swap.request", s11);
    const keys = Object.keys(au[0]?.after ?? {});
    const ev = await evFor(EV_REQ, s11);
    ck("S1.1", { ok: r11.ok, row: w?.status === "AWAITING_PEER" && w?.requesterEmployeeId === E.A && w?.targetEmployeeId === E.B && w?.fromEntryId === a11 && w?.toEntryId === b11 && w?.systemId === sA.id, by: w?.requestedByUserId === U.A.id, reason: w?.reason === REASON, audit: au.length === 1 && AUDIT_REQ.every((k) => keys.includes(k)) && keys.every((k) => [...AUDIT_REQ, "systemId", "requesterEmployeeId"].includes(k)), event: ev.length === 1 && ev[0].idempotencyKey === `${EV_REQ}#${s11}` }, "AWAITING_PEER · ids · reason · 1 audit · 1 event", `${shown(r11)} audits=${au.length} events=${ev.length}`);
  }
  {
    const x = await pair({ give: true });
    const w = await swRow(x.id);
    chk("S1.2", x.r.ok && w?.status === "AWAITING_PEER" && w?.toEntryId === null && w?.targetEmployeeId === E.B, "GIVE AWAITING_PEER · to null", `${shown(x.r)} ${w?.status}`);
  }
  /** refusal vectors: every call says its text · no swap row · no swap_requested event appears */
  const evN = () => P.outboxEvent.count({ where: { tenantId: TT, type: EV_REQ } }) as Promise<number>;
  const vec = async (id: string, calls: (() => Promise<RO>)[], want: string[]) => {
    const [n0, e0] = [await swN(), await evN()];
    const rs: RO[] = [];
    for (const c of calls) rs.push(await c());
    const [n1, e1] = [await swN(), await evN()];
    chk(id, rs.every((r, i) => said(r, want[i]!)) && n1 === n0 && e1 === e0, want.join(" | "), `${rs.map(shown).join(" | ")} rows +${n1 - n0} events +${e1 - e0}`);
  };
  {
    const [a] = await E1([[E.A, S.m, nd()]]);
    await vec("S1.3", [() => req(U.A, a!, null)], [T.noTarget]);
  }
  {
    const [b] = await E1([[E.B, S.m, nd()]]);
    await vec("S1.4", [() => req(U.A, b!, E.C), () => req(U.A, b!, E.C, null, { requesterEmployeeId: E.B, employeeId: E.B })], [T.notOwn, T.notOwn]);
  }
  {
    const [unpub] = await E1([[E.A, S.m, nd()]], false);
    const past = (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sA.id, employeeId: E.A, date: dbDate(yesterday), shiftId: S.n, unitId: u1, startMin: 1320, endMin: 360, breakMin: 0, crossesMidnight: true, published: true, publishedAt: new Date(), source: "MANUAL" } })).id;
    const [e2] = await ents(ctx2, U.owner, [[E.S2, S2m, nd()]]);
    const [eo] = await ents(ctxO, U.other, [[E.X, SOm, nd()]]);
    await vec("S1.5", [unpub!, past, e2!, eo!].map((f) => () => req(U.A, f, E.B)), [T.unpub, T.past, T.shiftNf, T.shiftNf]);
  }
  {
    const [a] = await E1([[E.A, S.m, nd()]]);
    await vec("S1.6", [E.End, E.Un, E.A].map((t) => () => req(U.A, a!, t)), [T.targetNf, T.unlinked, T.selfTarget]);
  }
  {
    const d = nd();
    const [a, aB] = await E1([[E.A, S.m, d], [E.A, S.a, addDay(d, 1)]]);
    await P.hrEmployeeUnit.create({ data: { tenantId: TT, systemId: sA.id, employeeId: E.D, unitId: u1, fromDate: dbDate(addDay(d, 1)), toDate: dbDate(addDay(d, 1)) } });
    const [r1, r2] = [await req(U.A, a!, E.D), await req(U.A, aB!, E.D)];
    chk("S1.7", said(r1, T.branch) && r2.ok, "branch text · borrowed ok", `${shown(r1)} · ${shown(r2)}`);
  }
  const leave = (e: string, day: string) => P.hrLeave.create({ data: { tenantId: TT, systemId: sA.id, employeeId: e, type: "PERSONAL", fromDate: dbDate(day), toDate: dbDate(day), status: "APPROVED", decidedById: U.owner.id } });
  {
    const d = nd();
    const [a, a2, c2] = await E1([[E.A, S.m, d], [E.A, S.m, addDay(d, 2)], [E.C, S.a, addDay(d, 1)]]);
    await leave(E.C, d);
    await leave(E.A, addDay(d, 1));
    await vec("S1.8", [() => req(U.A, a!, E.C), () => req(U.A, a2!, E.C, c2!)], [T.leavePeer, T.leaveYou]);
  }
  {
    const d = nd();
    const [a] = await E1([[E.A, S.m, d], [E.B, S.m, d]]);
    await vec("S1.9", [() => req(U.A, a!, E.B)], [T.dup]);
  }
  {
    const [c] = await E1([[E.C, S.e, nd()]]);
    await vec("S1.10", [() => req(U.A, a11!, E.C), () => req(U.C, c!, E.B, b11!)], [T.open, T.open]);
  }
  {
    // ruling 5: s11 (A: a11 → B: b11) is open · B offers b11 (its TO) as FROM · C asks for a11 (its FROM) as TO
    const [c] = await E1([[E.C, S.e, nd()]]);
    await vec("S1.11", [() => req(U.B, b11!, E.C)], [T.open]);
    await vec("S1.12", [() => req(U.C, c!, E.A, a11!)], [T.open]);
  }

  // ═══ S6 scope + privacy (u1 swap s11 stays AWAITING_PEER · u2 swap su2) ═══
  console.log("── S6 scope + privacy ──");
  const d6 = nd();
  const [x6, y6] = await E1([[E.D, S.m, d6], [E.D2, S.a, addDay(d6, 1)]]);
  const su2 = idOf(await sw("requestSwap", ctx, vOf(U.Dd), { fromEntryId: x6, targetEmployeeId: E.D2, toEntryId: y6, reason: REASON }));
  {
    const mine = (w: Who, c = ctx) => sw("listMySwaps", c, vOf(w));
    const mgr = (w: Who, c = ctx) => sw("listSwapsForManager", c, vOf(w), {});
    const V = ["owner", "pay", "mgrU1", "mgrRole", "A", "B", "C", "member"] as const;
    const m: Record<string, RO> = {};
    const g: Record<string, RO> = {};
    for (const k of V) [m[k], g[k]] = [await mine(U[k]), await mgr(U[k])];
    [m.other, g.other] = [await mine(U.other, ctxO), await mgr(U.other, ctxO)];
    g.mgrU2 = await mgr(U.mgrU2);
    const has = (r: RO, id: string) => !!id && ids(r).includes(id);
    const none = (r: RO) => !has(r, s11) && !has(r, su2);
    ck("S6.1", {
      parties: has(m.A!, s11) && has(m.B!, s11) && !has(m.A!, su2),
      notParties: ["owner", "pay", "mgrU1", "mgrRole", "C", "member", "other"].every((k) => none(m[k]!)) && ids(m.member!).length === 0 && ids(m.other!).length === 0,
      owner: g.owner!.ok && has(g.owner!, s11) && has(g.owner!, su2),
      unitU1: ["mgrU1", "mgrRole"].every((k) => g[k]!.ok && has(g[k]!, s11) && !has(g[k]!, su2)),
      denied: ["pay", "A", "C", "member", "other"].every((k) => none(g[k]!) && (!g[k]!.ok || k === "other" || ids(g[k]!).length === 0)),
    }, "parties in listMySwaps · writers + MANAGER by unit", `A=${ids(m.A!).length} owner=${shown(g.owner)}`);
    const it = itemOf(m.B!, s11);
    const k = Object.keys(it ?? {});
    const side = (s: Any) => !!s && srt(Object.keys(s)) === SIDE_KEYS;
    ck("S6.2", { found: !!it, keys: ITEM_KEYS.every((x) => k.includes(x)) && k.every((x) => ITEM_KEYS.includes(x) || ITEM_OPT.includes(x)), people: !!it && srt(Object.keys(it.requester ?? {})) === "employeeId,name" && srt(Object.keys(it.target ?? {})) === "employeeId,name", sides: !!it && side(it.from) && side(it.to), noOtherRows: !JSON.stringify(m.B!.value ?? null).includes(extra11!) }, "R10 keys · no other requester rows", `keys=${k.join(",") || "∅"}`);
    const rsn = (r: RO) => itemOf(r, s11)?.reason;
    const hasR = (r: RO | Any) => JSON.stringify(r?.value ?? r ?? null).includes(REASON);
    ck("S6.3", { parties: rsn(m.A!) === REASON && rsn(m.B!) === REASON, deciders: rsn(g.owner!) === REASON && rsn(g.mgrU1!) === REASON, reader: !!itemOf(g.mgrRole!, s11) && !hasR(itemOf(g.mgrRole!, s11)), outside: [g.C, g.member, g.pay, m.C].every((r) => !hasR(r)) && !hasR(itemOf(g.mgrU2!, s11)) }, "reason: parties + in-scope deciders only");
    const w0 = await swRow(s11);
    const rs = [await sw("respondSwap", ctxO, vOf(U.other), s11, { accept: true }), await sw("decideSwap", ctxO, vOf(U.other), s11, { decision: "APPROVED" }), await cancel(U.other, s11, ctxO), await sw("respondSwap", ctx2, vOf(U.B), s11, { accept: true }), await cancel(U.A, s11, ctx2)];
    const w1 = await swRow(s11);
    ck("S6.8", { refused: rs.every((x) => !x.ok && isThai(x.text) && !CUID_RE.test(x.text) && !x.text.startsWith("THROW")), same: !!w0 && w1?.status === w0.status && +w1.updatedAt === +w0.updatedAt }, "5 × refused Thai, no id · unchanged", rs.map(shown).join(" | "));
    const a2 = await sw("respondSwap", ctx, vOf(U.D2), su2, { accept: true });
    const r64 = await dec(U.mgrU1, su2);
    chk("S6.4", a2.ok && said(r64, T.otherBranch) && (await st(su2)) === "PENDING", T.otherBranch, `accept ${shown(a2)} decide ${shown(r64)} ${await st(su2)}`);
    const lE = await mgr(U.mgrEmpty);
    const r65 = await dec(U.mgrEmpty, su2);
    chk("S6.5", has(lE, s11) && has(lE, su2) && r65.ok && (await st(su2)) === "APPROVED", "lists u1+u2 · decides u2", `${shown(lE)} n=${ids(lE).length} · ${shown(r65)}`);
  }

  // ═══ S2 peer + state machine ═══
  console.log("── S2 peer + state ──");
  const s21 = await pair({ chain: true, accept: true });
  {
    const q = await reqOf(s21.id);
    ck("S2.1", { ok: !!s21.ar?.ok, pending: (await st(s21.id)) === "PENDING" && !!(await swRow(s21.id))?.peerDecidedAt, request: q?.status === "PENDING" && q?.systemId === sA.id && q?.unitId === u1 && q?.requestedById === U.A.id, one: (await reqN(s21.id)) === 1 }, "PENDING · 1 request", `${shown(s21.ar)} req=${short(q && { s: q.status, u: q.unitId === u1, by: q.requestedById === U.A.id }, 60)}`);
  }
  {
    const x = await pair({ chain: true });
    const r = await acc(U.B, x.id, false);
    const w = await swRow(x.id);
    chk("S2.2", r.ok && w?.status === "REJECTED" && !!w?.peerDecidedAt && w?.decidedById === null && (await reqN(x.id)) === 0, "REJECTED · no request", `${shown(r)} ${w?.status}`);
    tl.declined = x.id;
  }
  {
    const x = await pair();
    const rs = [await acc(U.A, x.id), await acc(U.C, x.id), await acc(U.mgrAll, x.id), await acc(U.C, x.id, false)];
    chk("S2.3", rs.every((r) => said(r, T.notYours)) && (await st(x.id)) === "AWAITING_PEER", `${T.notYours} ×4`, `${rs.map(shown).join(" | ")} ${await st(x.id)}`);
  }
  {
    const r2 = await acc(U.B, s21.id);
    chk("S2.4", !!s21.ar?.ok && said(r2, T.stale) && (await reqN(s21.id)) === 1, T.stale, `${shown(r2)} requests=${await reqN(s21.id)}`);
  }
  const cx = await pair();
  {
    const r = await cancel(U.A, cx.id);
    chk("S2.5", r.ok && (await st(cx.id)) === "CANCELLED", "CANCELLED", `${shown(r)} ${await st(cx.id)}`);
  }
  {
    const tr = srMod?.swapTransition;
    const EVTS = ["PEER_ACCEPT", "PEER_DECLINE", "CANCEL", "APPROVE", "REJECT", "APPLY_REFUSED", "EXPIRE"];
    const want: Record<string, string> = { "AWAITING_PEER+PEER_ACCEPT": "PENDING", "AWAITING_PEER+PEER_DECLINE": "REJECTED", "AWAITING_PEER+CANCEL": "CANCELLED", "AWAITING_PEER+EXPIRE": "CANCELLED", "PENDING+APPROVE": "APPROVED", "PENDING+REJECT": "REJECTED", "PENDING+CANCEL": "CANCELLED", "PENDING+APPLY_REFUSED": "CANCELLED", "PENDING+EXPIRE": "CANCELLED" };
    const V = ["AWAITING_PEER", "PENDING", "APPROVED", "REJECTED", "CANCELLED"].flatMap((s) => EVTS.map((e) => `${s}+${e}`)); // 35 vectors · unlisted ⇒ null
    const bad = typeof tr === "function" ? V.filter((v) => (tr(...v.split("+")) ?? null) !== (want[v] ?? null)) : ["∅swapTransition"];
    const db = [await acc(U.B, cx.id), await cancel(U.A, cx.id), await acc(U.B, tl.declined!)];
    ck("S2.6", { vectors: !bad.length, db: said(db[0]!, T.stale) && !db[1]!.ok && said(db[2]!, T.stale) && (await st(cx.id)) === "CANCELLED" && (await st(tl.declined!)) === "REJECTED" }, `${V.length} vectors · terminal refused`, `bad=${bad.slice(0, 4)} ${db.map(shown).join(" | ")}`);
  }
  {
    const x = await pair();
    await P.$executeRawUnsafe(`UPDATE "HrRosterEntry" SET "date" = $1::date WHERE id = $2`, yesterday, x.a); // the day passed (clock-free placement)
    const r = await acc(U.B, x.id);
    chk("S2.7", said(r, T.expired) && (await st(x.id)) === "CANCELLED", T.expired, `${shown(r)} ${await st(x.id)}`);
  }
  {
    const x = await pair({ give: true });
    await leave(E.B, x.d1);
    const r = await acc(U.B, x.id);
    chk("S2.8", x.r.ok && said(r, T.leavePeer) && (await st(x.id)) === "AWAITING_PEER", T.leavePeer, `${shown(x.r)} ${shown(r)} ${await st(x.id)}`);
  }

  // ═══ S3 approval wiring ═══
  console.log("── S3 approval wiring ──");
  const s31 = await pair({ chain: true, accept: true });
  const b4 = [await row(s31.a), await row(s31.b)];
  {
    const d = await coreDecide(U.mgrAll, s31.id);
    const del = await deliverDecision(s31.id);
    const w = await swRow(s31.id);
    ck("S3.1", { decided: !!d?.ok, delivered: del.ok, rewritten: await swapped(s31), status: w?.status === "APPROVED" && w?.decidedById === U.mgrAll.id && !!w?.decidedAt, event: (await evFor(EV_OK, s31.id)).length === 1, audit: (await audits("hr.swap.apply", s31.id)).length === 1 }, "APPROVED · rewritten · decider · 1 event · 1 audit", `decide=${d?.status} deliver=${dl(del)} ${w?.status}`);
  }
  {
    const x = await pair({ chain: true, accept: true });
    const d = await coreDecide(U.mgrAll, x.id, "REJECTED");
    const del = await deliverDecision(x.id);
    const w = await swRow(x.id);
    chk("S3.2", !!d?.ok && del.ok && w?.status === "REJECTED" && w?.decidedById === U.mgrAll.id && (await untouched(x)), "REJECTED · decider · untouched", `decide=${d?.status} deliver=${dl(del)} ${w?.status}`);
    tl.chainRejected = x.id;
  }
  {
    const x = await pair({ accept: true });
    const p0 = await st(x.id);
    const r = await dec(U.mgrU1, x.id);
    chk("S3.3", p0 === "PENDING" && (await reqN(x.id)) === 0 && r.value?.status === "APPROVED" && Array.isArray(r.value?.warnings) && (await swapped(x)) && (await swRow(x.id))?.decidedById === U.mgrU1.id, "PENDING ⇒ APPROVED · rewritten · warnings[]", `${p0} ${shown(r)}`);
  }
  {
    const r = await dec(U.mgrAll, s21.id);
    chk("S3.4", said(r, T.inChain) && (await st(s21.id)) === "PENDING", T.inChain, shown(r));
  }
  {
    // x: target = mgrU1 (E.M) · y: requester = mgrU1 · z: direct decideSwap by the target
    await chain(true);
    const d = nd();
    const [a, m1, m2, a3, m3] = await E1([[E.A, S.m, d], [E.M, S.a, addDay(d, 1)], [E.M, S.e, d], [E.A, S.m, addDay(d, 2)], [E.M, S.a, addDay(d, 3)]]);
    const ix = idOf(await req(U.A, a!, E.M, m1!));
    await acc(U.mgrU1, ix);
    const iy = idOf(await sw("requestSwap", ctx, vOf(U.mgrU1), { fromEntryId: m2, targetEmployeeId: E.A, toEntryId: null }));
    await acc(U.A, iy);
    const [cx5, cy5] = [await coreDecide(U.mgrU1, ix), await coreDecide(U.mgrU1, iy)];
    await chain(false);
    const iz = idOf(await req(U.A, a3!, E.M, m3!));
    await acc(U.mgrU1, iz);
    const zz = await dec(U.mgrU1, iz);
    const qs = [await reqOf(ix), await reqOf(iy)];
    const nDec = qs.every(Boolean) ? await P.approvalDecision.count({ where: { requestId: { in: qs.map((q) => q.id) } } }) : -1;
    ck("S3.5", {
      targetCore: cx5?.ok === false && cx5?.reason === T.self && [undefined, "SELF_APPROVAL"].includes(cx5?.code),
      requesterCore: cy5?.ok === false && cy5?.code === "SELF_APPROVAL" && cy5?.reason === T.self,
      unchanged: qs.every((q) => q?.status === "PENDING") && nDec === 0 && (await st(ix)) === "PENDING" && (await st(iy)) === "PENDING",
      direct: said(zz, T.self) && (await st(iz)) === "PENDING",
    }, "target ⇒ reason · requester ⇒ SELF_APPROVAL + reason · direct ⇒ text", `x=${short(cx5, 60)} y=${short(cy5, 60)} z=${shown(zz)}`);
  }
  {
    await chain(true);
    const d = nd();
    const [o1, a1, a2, o2] = await E1([[E.O, S.m, d], [E.A, S.a, addDay(d, 1)], [E.A, S.m, addDay(d, 2)], [E.O, S.a, addDay(d, 3)]]);
    const i1 = idOf(await sw("requestSwap", ctx, vOf(U.owner), { fromEntryId: o1, targetEmployeeId: E.A, toEntryId: a1 }));
    const k1 = await acc(U.A, i1);
    const i2 = idOf(await req(U.A, a2!, E.O, o2!));
    const k2 = await acc(U.owner, i2);
    await chain(false);
    const ws = [await swRow(i1), await swRow(i2)];
    ck("S3.6", { approved: ws.every((w) => w?.status === "APPROVED" && w?.decidedById === null), rewritten: (await holder(o1!)) === E.A && (await holder(a1!)) === E.O && (await holder(a2!)) === E.O && (await holder(o2!)) === E.A, noRequest: (await reqN(i1)) + (await reqN(i2)) === 0, audit: (await audits("hr.swap.owner_auto", i1)).length === 1 && (await audits("hr.swap.owner_auto", i2)).length === 1 }, "APPROVED at accept · no request · audits", `${shown(k1)} ${shown(k2)}`);
  }
  {
    const x = await pair({ chain: true, accept: true });
    const c = await cancel(U.A, x.id);
    const y = await pair({ chain: true, accept: true });
    const dy = await coreDecide(U.mgrAll, y.id); // decided, effect not delivered yet
    const cy = await cancel(U.A, y.id);
    ck("S3.7", { cancel: c.ok && (await st(x.id)) === "CANCELLED" && (await reqSt(x.id)) === "CANCELLED", decided: !!dy?.ok && said(cy, T.decided) && (await st(y.id)) === "PENDING" && (await reqSt(y.id)) === "APPROVED" }, "together · decided ⇒ refused", `${shown(c)} · ${shown(cy)}`);
    await deliverDecision(y.id);
    tl.cancelledChain = x.id;
  }
  {
    const baseVals = [...(fileAtBase("src/lib/modules/approval/labels.ts") ?? "").split("APPROVER_ROLES")[0]!.matchAll(/value:\s*["']([^"']+)["']/g)].map((m) => m[1]!);
    const now: string[] = (apLabels.ENTITY_TYPES ?? []).map((e: Any) => e.value);
    const act = stripComments(rd("src/lib/modules/approval/actions.ts"));
    const i = act.indexOf("ENTITY_TYPES = new Set(");
    ck("S3.8", { label: apLabels.entityLabel?.(ENTITY) === "คำขอสลับกะ", action: i >= 0 && act.slice(i, act.indexOf("])", i)).includes(`"${ENTITY}"`), kept: baseVals.length > 0 && baseVals.every((v) => now.includes(v)) }, "label · allow-list · base kept", `label=${apLabels.entityLabel?.(ENTITY)}`);
  }
  {
    const q = await reqOf(s21.id);
    const [mA, mB] = [(await approval.listMyRequests({ tenantId: TT }, U.A.id)) as Any[], (await approval.listMyRequests({ tenantId: TT }, U.B.id)) as Any[]];
    chk("S3.9", !!q && mA.some((x) => x.id === q.id) && !mB.some((x) => x.id === q.id), "requester only", `req=${!!q} A=${mA.length} B=${mB.length}`);
  }

  // ═══ S4 effect + races ═══
  console.log("── S4 effect + races ──");
  {
    const now = [await row(s31.a), await row(s31.b)];
    const keep = (x: Any, y: Any) => !!x && !!y && x.published === true && +x.publishedAt === +y.publishedAt && x.startMin === y.startMin && x.endMin === y.endMin && x.shiftId === y.shiftId && x.unitId === y.unitId && dk(x.date) === dk(y.date) && x.source === "MANUAL";
    chk("S4.1", (await swapped(s31)) && keep(now[0], b4[0]) && keep(now[1], b4[1]), "kept fields · MANUAL", `swapped=${await swapped(s31)} a=${short({ p: now[0]?.published, s: now[0]?.source }, 50)}`);
  }
  {
    const x = await pair({ give: true, accept: true });
    const r = await dec(U.mgrU1, x.id);
    const n = await P.hrRosterEntry.count({ where: { tenantId: TT, employeeId: E.A, date: dbDate(x.d1) } });
    chk("S4.2", r.ok && (await holder(x.a)) === E.B && n === 0, "moved · requester off", `${shown(r)} A rows=${n}`);
  }
  {
    const x = await pair({ chain: true, accept: true });
    await E1([[E.B, S.m, x.d1]], false); // B now holds (d1, m)
    const d = await coreDecide(U.mgrAll, x.id);
    const del = await deliverDecision(x.id);
    ck("S4.3", { ok: !!d?.ok && del.ok, untouched: await untouched(x), cancelled: (await st(x.id)) === "CANCELLED", code: (await codes(x.id)) === "DUP", req: (await reqSt(x.id)) === "APPROVED" }, "untouched · CANCELLED · DUP", `deliver=${dl(del)} codes=${await codes(x.id)}`);
  }
  {
    const x = await pair({ chain: true, accept: true });
    await coreDecide(U.mgrAll, x.id);
    const mv = await ro("moveEntry", ctx, vOf(U.owner), x.a, { shiftId: S.e });
    const del = await deliverDecision(x.id);
    const y = await pair({ chain: true, accept: true });
    await coreDecide(U.mgrAll, y.id);
    await P.$executeRawUnsafe(`UPDATE "HrRosterEntry" SET "startMin" = "startMin" + 30, "updatedAt" = now() + interval '1 second' WHERE id = $1`, y.b); // out-of-band writer
    const del2 = await deliverDecision(y.id);
    ck("S4.4", { a: mv.ok && (await st(x.id)) === "CANCELLED" && (await reqSt(x.id)) === "APPROVED" && del.ok && (await untouched(x)) && (await row(x.a))?.shiftId === S.e, b: del2.ok && (await st(y.id)) === "CANCELLED" && (await codes(y.id)) === "ENTRY_CHANGED" && (await untouched(y)) && (await reqSt(y.id)) === "APPROVED", noEvent: (await evFor(EV_OK, x.id)).length + (await evFor(EV_OK, y.id)).length === 0 }, "(a) Q16 + no-op · (b) ENTRY_CHANGED", `move ${shown(mv)} x=${await st(x.id)} y=${await st(y.id)} codes=${await codes(y.id)}`);
  }
  {
    const x = await pair({ chain: true, accept: true });
    await coreDecide(U.mgrAll, x.id);
    const rm = await ro("removeEntry", ctx, vOf(U.owner), x.a);
    const del = await deliverDecision(x.id);
    chk("S4.5", !!x.ar?.ok && rm.ok && (await swRow(x.id)) === null && del.ok && (await holder(x.b)) === E.B && (await evFor(EV_OK, x.id)).length === 0, "gone · no-op · no event", `accept ${shown(x.ar)} remove ${shown(rm)} deliver=${dl(del)}`);
  }
  {
    const out: string[] = [];
    for (let round = 0; round < 3; round++) {
      const viaChain = round === 2;
      const x = await pair({ chain: viaChain, accept: true });
      await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? cancel(U.A, x.id) : viaChain ? coreDecide(U.mgrAll, x.id) : dec(U.mgrAll, x.id))));
      if (viaChain) await deliverDecision(x.id);
      const s = await st(x.id);
      const q = viaChain ? await reqSt(x.id) : s;
      const ok = !!x.id && ((s === "APPROVED" && q === "APPROVED" && (await swapped(x))) || (s === "CANCELLED" && q === "CANCELLED" && (await untouched(x))));
      out.push(`${ok ? "✓" : "✗"}${s}/${q}`);
    }
    chk("S4.6", out.every((o) => o.startsWith("✓")), "3/3 consistent", out.join(" "));
  }
  {
    const e = await P.outboxEvent.findFirst({ where: { tenantId: TT, type: "approval.request.approved", payload: { path: ["entityId"], equals: s31.id || "∅" } } });
    const reps = e ? [await deliver(CONS, e), await deliver(CONS, e), ...(await Promise.all([deliver(CONS, e), deliver(CONS, e)]))] : [];
    chk("S4.7", reps.length === 4 && reps.every((x) => x.ok) && (await swapped(s31)) && (await evFor(EV_OK, s31.id)).length === 1 && (await audits("hr.swap.apply", s31.id)).length === 1, "4 ok · 1 rewrite · 1 event · 1 audit", reps.map(dl).join("|") || "no event");
  }
  /** decision (effect or direct) ∥ moveEntry while the roster key (A, d1) is held */
  const decideVsMove = async (viaEffect: boolean) => {
    const x = await pair({ chain: viaEffect, accept: true });
    if (viaEffect) await coreDecide(U.mgrAll, x.id);
    const first = viaEffect ? async (): Promise<RO> => { const r = await deliverDecision(x.id); return { ok: r.ok, text: r.err, value: null }; } : () => dec(U.mgrAll, x.id);
    const h = await holdAdvisory<RO>(P, `hr:roster:${sA.id}:${E.A}:${x.d1}`, async () => {}, [first, () => ro("moveEntry", ctx, vOf(U.owner), x.a, { shiftId: S.e })]);
    const [d, mv] = h.res as [RO, RO];
    const s = await st(x.id);
    const sh = (await row(x.a))?.shiftId;
    const X = s === "APPROVED" && (await swapped(x)) && sh === S.m && said(mv, T.entryChanged);
    const Y = s === "CANCELLED" && (await untouched(x)) && sh === S.e && mv.ok && (viaEffect ? d.ok : !d.ok && FIXED.has(d.text));
    return { ok: (X || Y) && h.waited && !h.holderErr && !!x.id, info: `${X ? "X" : Y ? "Y" : "MIXED"} ${s} decide=${shown(d)} move=${shown(mv)} waited=${h.waited}${h.holderErr ? ` holder=${h.holderErr}` : ""}` };
  };
  {
    const r = await decideVsMove(true);
    chk("S4.8", r.ok, "X (approved · move refused) or Y (moved · cancelled)", r.info);
  }
  {
    const e = (await rdrRoster(dk((await row(s31.a))?.date))).find((x) => x.entryId === s31.a);
    chk("S4.9", e?.employeeId === E.B && e?.userId === U.B.id, "a → B / user B", e ? `${e.employeeId === E.B} ${e.userId === U.B.id}` : "∅ entry");
  }

  // ═══ S5 warnings (C = third employee with entries on the same days) ═══
  console.log("── S5 warnings ──");
  await chain(false); // ORACLE-EDIT (controller 11 Nov): S4.8 leaves the policy on — S5 exercises the direct path
  const own = new Set<string>();
  const clean = (ws: Any) => Array.isArray(ws) && ws.every((w: Any) => [E.A, E.B].includes(w?.employeeId) && (w?.entryIds ?? []).every((i: string) => own.has(i)));
  const rules = (ws: Any) => short((ws ?? []).map((w: Any) => `${w.rule}:${w.employeeId === E.B ? "B" : w.employeeId === E.A ? "A" : "?"}`), 80);
  const give = async (from: string) => {
    const id = idOf(await req(U.A, from, E.B));
    await acc(U.B, id);
    return { id, r: await dec(U.mgrAll, id) };
  };
  let w51: Any = null;
  let w52: Any[] = [];
  {
    const d = nd();
    const [a, bm] = await E1([[E.A, S.e, d], [E.B, S.m, d], [E.C, S.m, d]]);
    [a!, bm!].forEach((i) => own.add(i));
    const { r } = await give(a!);
    w51 = r.value?.warnings;
    chk("S5.1", r.value?.status === "APPROVED" && Array.isArray(w51) && w51.some((w: Any) => w.rule === "MAX_DAY" && w.employeeId === E.B), "APPROVED + MAX_DAY(B)", `${shown(r)} ${rules(w51)}`);
  }
  {
    const d = addDay(nd(), 1);
    const [n0, a, b] = await E1([[E.A, S.n, addDay(d, -1)], [E.A, S.a, d], [E.B, S.m, d], [E.C, S.n, addDay(d, -1)], [E.C, S.m, d]]);
    [n0!, a!, b!].forEach((i) => own.add(i));
    const id = idOf(await req(U.A, a!, E.B, b!));
    await acc(U.B, id);
    const pv = await sw("swapPreview", ctx, vOf(U.mgrAll), id);
    const r = await dec(U.mgrAll, id);
    w52 = [...(pv.value?.warnings ?? []), ...(r.value?.warnings ?? [])];
    const rest = (ws: Any) => Array.isArray(ws) && ws.some((w: Any) => w.rule === "REST" && w.employeeId === E.A);
    chk("S5.2", rest(pv.value?.warnings) && rest(r.value?.warnings), "REST(A) preview + decide", `preview ${shown(pv)} ${rules(pv.value?.warnings)} decide ${shown(r)}`);
  }
  {
    const d = nd();
    const [n] = await E1([[E.A, S.n, d]]);
    const { r } = await give(n!);
    const e = await row(n!);
    const onD = (await rdrRoster(d)).some((x) => x.entryId === n && x.employeeId === E.B);
    const onD1 = (await rdrRoster(addDay(d, 1))).some((x) => x.entryId === n);
    chk("S5.3", r.ok && e?.employeeId === E.B && dk(e?.date) === d && e?.crossesMidnight === true && onD && !onD1, "B · day D · D+1 no", `${shown(r)} onD=${onD} onD+1=${onD1}`);
  }
  chk("S5.4", clean(w51) && w52.length > 0 && clean(w52), "A/B only", `w51=${rules(w51)} w52=${w52.length}`);

  // ═══ S7 events ═══
  console.log("── S7 events ──");
  ck("S7.1", Object.fromEntries([EV_REQ, EV_OK].map((ev) => [ev, NB[ev]?.cons === true && typeof CONS[ev] === "function"])), "both consumers");
  {
    const n = (list: Any, ev: string) => (Array.isArray(list) ? list.filter((x: Any) => x?.value === ev && (list !== autoLabels?.AUTOMATION_EVENTS || x?.label === LBL[ev])).length : -1);
    ck("S7.2", Object.fromEntries([EV_REQ, EV_OK].map((ev) => [ev, NB[ev]?.label === true && n(autoLabels?.AUTOMATION_EVENTS, ev) === 1 && n(hookLabels?.WEBHOOK_EVENTS, ev) === 1])), `${LBL[EV_REQ]} · ${LBL[EV_OK]}`);
  }
  {
    const es = [(await evFor(EV_REQ, s31.id))[0], (await evFor(EV_OK, s31.id))[0]].filter(Boolean);
    const snap = async () => JSON.stringify([await row(s31.a), await row(s31.b), await swRow(s31.id), await P.outboxEvent.count({ where: { tenantId: TT } })]);
    const s0 = await snap();
    const reps: { ok: boolean; err: string }[] = [];
    for (const e of es) reps.push(await deliver(CONS, e), await deliver(CONS, e), ...(await Promise.all([deliver(CONS, e), deliver(CONS, e)])));
    chk("S7.3", es.length === 2 && reps.every((x) => x.ok) && s0 === (await snap()), "8 ok · unchanged", reps.map(dl).join("|") || "no events");
  }
  {
    const key = `${EV_REQ}#${s11}`;
    const cnt = () => P.outboxEvent.count({ where: { tenantId: TT, idempotencyKey: key } }) as Promise<number>;
    const had = await cnt();
    await coreOutbox.emitOutbox(P, { tenantId: TT, type: EV_REQ, idempotencyKey: key, payload: { swapId: s11 } }).catch(() => {});
    chk("S7.4", !!s11 && had === 1 && (await cnt()) === 1, "1 → 1", `${had} → ${await cnt()}`);
  }
  {
    const quiet = [tl.declined, tl.chainRejected, tl.cancelledChain, cx.id].filter(Boolean) as string[];
    const n = (await Promise.all(quiet.map((id) => evFor(EV_OK, id)))).flat().length;
    const one = (await Promise.all(quiet.map((id) => evFor(EV_REQ, id)))).every((x) => x.length === 1);
    chk("S7.5", quiet.length === 4 && n === 0 && one, `0 ${EV_OK} · 1 ${EV_REQ} each`, `swaps=${quiet.length} approved=${n} requestedOne=${one}`);
  }
  {
    const [q, o] = [(await evFor(EV_REQ, s11))[0], (await evFor(EV_OK, s31.id))[0]];
    const txt = JSON.stringify([q?.payload, o?.payload]);
    ck("S6.7", { req: srt(Object.keys(q?.payload ?? {})) === P_REQ, ok: srt(Object.keys(o?.payload ?? {})) === P_OK, clean: !fx.names.some((n) => txt.includes(n)) && !txt.includes(REASON) }, "payload keys · no names/reason", `req=${srt(Object.keys(q?.payload ?? {}))} ok=${srt(Object.keys(o?.payload ?? {}))}`);
  }

  // ═══ S9 delta races + Q16 ═══
  console.log("── S9 delta races + Q16 ──");
  {
    const r = await decideVsMove(false);
    chk("S9.1", r.ok, "X or Y, never mixed", r.info);
  }
  {
    const x = await pair({ accept: true });
    const [c] = await E1([[E.A, S.n, x.d1]], false);
    const pa = (await row(x.a))?.publishedAt;
    const h = await holdAdvisory<RO>(P, `hr:roster:${sA.id}:${E.A}:${x.d1}`, async () => {}, [() => ro("publishRoster", ctx, vOf(U.owner), { from: x.d1, to: x.d1 }), () => dec(U.mgrAll, x.id)]);
    const [pub, d] = h.res as [RO, RO];
    const ev = pub.value?.eventId ? await P.outboxEvent.findUnique({ where: { id: pub.value.eventId } }) : null;
    const ra = await row(x.a);
    ck("S9.2", { both: pub.ok && d.ok, waited: h.waited, swapped: await swapped(x), kept: ra?.published === true && +ra?.publishedAt === +pa, c: (await row(c!))?.published === true, payload: srt(ev?.payload?.entryIds ?? []) === c && srt(ev?.payload?.employeeIds ?? []) === E.A }, "both ok · kept · event = row c", `publish ${shown(pub)} decide ${shown(d)}`);
  }
  {
    const out: number[] = [];
    for (let round = 0; round < 3; round++) {
      const d = nd();
      const [a, c, b] = await E1([[E.A, S.m, d], [E.C, S.e, d], [E.B, S.a, addDay(d, 1)]]);
      await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? req(U.A, a!, E.B, b!) : req(U.C, c!, E.B, b!))));
      out.push(await P.hrShiftSwapRequest.count({ where: { tenantId: TT, toEntryId: b, status: { in: ["AWAITING_PEER", "PENDING"] } } }));
    }
    chk("S9.3", out.join(",") === "1,1,1", "1,1,1", out.join(","));
  }
  {
    const d = nd();
    const [a, c] = await E1([[E.A, S.m, d], [E.C, S.m, d]]);
    await chain(true);
    const i1 = idOf(await req(U.A, a!, E.B));
    const i2 = idOf(await req(U.C, c!, E.B));
    for (const i of [i1, i2]) await acc(U.B, i);
    for (const i of [i1, i2]) await coreDecide(U.mgrAll, i);
    const dd = await Promise.all([deliverDecision(i1), deliverDecision(i2)]);
    await chain(false);
    const s = [await st(i1), await st(i2)].sort().join(",");
    const held = await P.hrRosterEntry.count({ where: { tenantId: TT, employeeId: E.B, date: dbDate(d), shiftId: S.m } });
    const cs = [await codes(i1), await codes(i2)].filter(Boolean).join(",");
    chk("S9.4", dd.every((x) => x.ok) && s === "APPROVED,CANCELLED" && held === 1 && cs === "DUP", "1 applied · 1 CANCELLED DUP · no throw", `${dd.map(dl).join("|")} ${s} Brows=${held} codes=${cs}`);
  }
  {
    const x1 = await pair({ chain: true, accept: true });
    const m1 = await ro("moveEntry", ctx, vOf(U.owner), x1.a, { shiftId: S.e });
    const x2 = await pair({ chain: true, accept: true });
    const q2 = await reqOf(x2.id);
    const m2 = await ro("removeEntry", ctx, vOf(U.owner), x2.a);
    const x3 = await pair({ chain: true, accept: true });
    const m3 = await ro("moveEntry", ctx, vOf(U.owner), x3.b, { shiftId: S.e });
    const x4 = await pair();
    const m4 = await ro("moveEntry", ctx, vOf(U.owner), x4.a, { shiftId: S.e });
    const pend = ((await approval.listPending({ tenantId: TT }, vOf(U.mgrAll))) as Any[]).map((q) => q.entityId);
    ck("S9.5", {
      moveFrom: m1.ok && (await st(x1.id)) === "CANCELLED" && (await reqSt(x1.id)) === "CANCELLED",
      remove: m2.ok && !!q2 && (await swRow(x2.id)) === null && (await P.approvalRequest.findUnique({ where: { id: q2.id } }))?.status === "CANCELLED",
      moveTo: m3.ok && (await st(x3.id)) === "CANCELLED" && (await reqSt(x3.id)) === "CANCELLED",
      awaiting: m4.ok && (await st(x4.id)) === "CANCELLED",
      inbox: [x1.id, x2.id, x3.id].every((i) => !!i && !pend.includes(i)),
    }, "swaps + requests CANCELLED · not pending", [m1, m2, m3, m4].map(shown).join(" | "));
  }

  // ═══ S10 r2 fix round (pre-approved ORACLE-EDIT · hunter snippets F1 / F2 / F2b) ═══
  console.log("── S10 r2 ──");
  await chain(false);
  {
    // F1: moved row = published false + publishedAt kept ⇒ no swap until re-published
    const [a] = await E1([[E.A, S.m, nd()]]);
    const mv = await ro("moveEntry", ctx, vOf(U.owner), a!, { shiftId: S.e });
    const r = (await row(a!)) ?? {};
    if (!mv.ok || r.published !== false || !r.publishedAt) chk("S10.1", false, "fixture moved row", `move ${shown(mv)} published=${r.published}`);
    else await vec("S10.1", [() => req(U.A, a!, E.B)], [T.unpub]);
  }
  {
    // F2b: branch filter in the query, open first — 510 newer closed u2 rows (one raw INSERT … generate_series)
    const d = nd();
    const [a] = await E1([[E.A, S.m, d]]);
    const [x] = await E1([[E.D, S.m, d]]);
    const id = idOf(await req(U.A, a!, E.B));
    await P.$executeRawUnsafe(
      `INSERT INTO "HrShiftSwapRequest" ("id","tenantId","systemId","requesterEmployeeId","fromEntryId","targetEmployeeId","status","createdAt","updatedAt")
       SELECT concat('qch23r2', $1::text, g), $2, $3, $4, $5, $6, 'REJECTED'::"HrSwapStatus", now() + make_interval(secs => 60 + g), now() FROM generate_series(1, 510) g`,
      tag, TT, sA.id, E.D, x, E.D2,
    );
    const [l1, la] = [await sw("listSwapsForManager", ctx, vOf(U.mgrU1), {}), await sw("listSwapsForManager", ctx, vOf(U.mgrAll), {})];
    ck("S10.2", { id: !!id, u1: l1.ok && ids(l1).includes(id), noU2: l1.ok && !ids(l1).some((i) => i.startsWith("qch23r2")), all: la.ok && ids(la).includes(id) }, "open u1 swap listed for mgr-u1 + mgrAll", `u1 n=${ids(l1).length} all n=${ids(la).length}`);
  }
  {
    // F2 / review m3: FROM in u1 (D borrowed into u1 on d) · TO in u2 (A borrowed into u2 on d2) ⇒ reason only for viewers with both units in scope
    const d = nd();
    const d2 = addDay(d, 1);
    await P.hrEmployeeUnit.create({ data: { tenantId: TT, systemId: sA.id, employeeId: E.D, unitId: u1, fromDate: dbDate(d), toDate: dbDate(d) } });
    await P.hrEmployeeUnit.create({ data: { tenantId: TT, systemId: sA.id, employeeId: E.A, unitId: u2, fromDate: dbDate(d2), toDate: dbDate(d2) } });
    const [aU1, bU2] = await E1([[E.A, S.m, d], [E.D, S.a, d2]]);
    const id = idOf(await sw("requestSwap", ctx, vOf(U.A), { fromEntryId: aU1, targetEmployeeId: E.D, toEntryId: bU2, reason: REASON }));
    const ac = await sw("respondSwap", ctx, vOf(U.Dd), id, { accept: true });
    const [l1, la] = [await sw("listSwapsForManager", ctx, vOf(U.mgrU1), {}), await sw("listSwapsForManager", ctx, vOf(U.mgrAll), {})];
    const [i1, ia] = [itemOf(l1, id), itemOf(la, id)];
    ck("S10.3", { made: !!id && ac.ok, listed: !!i1, noReason: !!i1 && !("reason" in i1) && !JSON.stringify(i1).includes(REASON), allReason: ia?.reason === REASON }, "mgr-u1 no reason · mgrAll reason", `accept ${shown(ac)} u1=${i1 ? Object.keys(i1).length : "∅"}`);
  }
  {
    // F3 / review m5: requester-side refusals name คุณ (SWAP C ↔ B, B accepts, then C's to-day changes)
    const d = nd();
    const [c1, b1, c2, b2] = await E1([[E.C, S.m, d], [E.B, S.a, addDay(d, 1)], [E.C, S.m, addDay(d, 2)], [E.B, S.a, addDay(d, 3)]]);
    const i1 = idOf(await req(U.C, c1!, E.B, b1!));
    const i2 = idOf(await req(U.C, c2!, E.B, b2!));
    for (const i of [i1, i2]) await acc(U.B, i);
    await leave(E.C, addDay(d, 1));
    const r1 = await dec(U.mgrAll, i1);
    await P.hrEmployee.update({ where: { id: E.C }, data: { endDate: dbDate(addDay(d, 2)) } });
    const r2 = await dec(U.mgrAll, i2);
    await P.hrEmployee.update({ where: { id: E.C }, data: { endDate: null } });
    ck("S10.4", { leave: said(r1, T.leaveYou) && (await codes(i1)) === "LEAVE", ended: said(r2, T.endedYou) && (await codes(i2)) === "ENDED", cancelled: (await st(i1)) === "CANCELLED" && (await st(i2)) === "CANCELLED" }, "leaveYou · endedYou", `${shown(r1)} · ${shown(r2)}`);
  }
  {
    // review m4: su2 (u2) is APPROVED (S6.5) — mgr-u1 must get the H1.1 branch text, not the status text
    const r = await dec(U.mgrU1, su2);
    chk("S10.5", said(r, T.otherBranch), T.otherBranch, shown(r));
  }

  // ═══ X ═══
  console.log("── X ──");
  {
    const out: string[] = [];
    for (let round = 0; round < 3; round++) {
      const [a] = await E1([[E.A, S.m, nd()]]);
      const rs = await Promise.all(Array.from({ length: 10 }, () => req(U.A, a!, E.B)));
      out.push(`${await P.hrShiftSwapRequest.count({ where: { tenantId: TT, fromEntryId: a } })}:${rs.filter((r) => r.ok).length}:${rs.filter((r) => !r.ok && r.text !== T.open).length}`);
    }
    chk("X1.1", out.every((s) => s === "1:1:0"), "rows 1 · ok 1 · other refusals 0 (×3)", out.join(" "));
  }
  {
    const x = await pair({ chain: true });
    const rs = await Promise.all(Array.from({ length: 10 }, () => acc(U.B, x.id)));
    await chain(false);
    const okN = rs.filter((r) => r.ok).length;
    chk("X6.1", okN === 1 && rs.every((r) => r.ok || r.text === T.stale) && (await st(x.id)) === "PENDING" && (await reqN(x.id)) === 1, "1 ok · 9 stale · 1 request", `ok=${okN} req=${await reqN(x.id)} ${await st(x.id)}`);
  }
  {
    const d = nd();
    const [a] = await E1([[E.A, S.m, d]]);
    const [xo] = await ents(ctxO, U.other, [[E.X, SOm, d]]);
    await vec("X2.1", [() => req(U.A, a!, E.S2), () => req(U.A, a!, E.B, xo!), () => req(U.A, a!, E.X)], [T.targetNf, T.toBad, T.targetNf]);
  }
  {
    const bad = refusals.filter((r) => !r.label.startsWith("roster.") && (!FIXED.has(r.text) || fx.names.some((n) => r.text.includes(n)) || CUID_RE.test(r.text)));
    chk("S6.9", refusals.length > 0 && !bad.length, "all fixed · no name/id", `${refusals.length} refusals · bad ${bad.length}: ${short(bad.slice(0, 3).map((b) => `${b.label}:${b.text}`), 120)}`);
  }

  // ═══ S8 controls + X12 ═══
  console.log("── S8 controls ──");
  {
    const pol = await approval.createPolicy({ tenantId: TT }, { name: "QC23 สายลา", entityType: "HrLeave", systemId: sA.id, steps: [{ order: 1, approverRole: "MANAGER" }] });
    const out: string[] = [];
    for (const [day, decision] of [["2031-12-29", "APPROVED"], ["2031-12-31", "REJECTED"]]) {
      const l = await hr.requestLeave(ctx, { employeeId: E.C, type: "PERSONAL", fromDate: day, toDate: day, reason: null, actorUserId: U.C.id });
      const q = await P.approvalRequest.findFirst({ where: { tenantId: TT, entityType: "HrLeave", entityId: l.id } });
      const r = q ? await approval.decide(vOf(U.mgrAll), { tenantId: TT }, q.id, { decision }) : null;
      const e = q ? await P.outboxEvent.findFirst({ where: { tenantId: TT, idempotencyKey: `approval.request.${decision!.toLowerCase()}#${q.id}` } }) : null;
      if (e) await deliver(CONS, e);
      out.push(`${r?.ok ? "ok" : "✗"}:${(await P.hrLeave.findUnique({ where: { id: l.id } }))?.status}`);
    }
    await approval.setPolicyActive({ tenantId: TT }, pol.id, false);
    chk("S8.4", out.join(" ") === "ok:APPROVED ok:REJECTED", "ok:APPROVED ok:REJECTED", out.join(" "));
  }
  {
    // ruling 8: direct H2.1 engine control on the week of s31 (chain-approved SWAP when built) — green on base, must stay green with swaps
    const wk = addDay(s31.d1, -((new Date(`${s31.d1}T00:00:00Z`).getUTCDay() + 6) % 7)); // Monday
    const toWk = "2031-11-03"; // Monday, empty (scenarios end before Oct)
    const inWk = (from: string) => ({ tenantId: TT, systemId: sA.id, date: { gte: dbDate(from), lte: dbDate(addDay(from, 6)) } });
    const pubAt0 = [(await row(s31.a))?.publishedAt, (await row(s31.b))?.publishedAt];
    const unpub0 = await P.hrRosterEntry.count({ where: { ...inWk(wk), published: false } });
    const pub = await ro("publishRoster", ctx, vOf(U.owner), { from: wk, to: addDay(wk, 6) });
    const ab = [await row(s31.a), await row(s31.b)];
    const day = await rdrRoster(s31.d1);
    const holders = await Promise.all(day.map((e) => holder(e.entryId)));
    const src = (await P.hrRosterEntry.findMany({ where: inWk(wk) })) as Any[];
    const cp = await ro("copyWeek", ctx, vOf(U.owner), { fromWeek: wk, toWeek: toWk });
    const dst = (await P.hrRosterEntry.findMany({ where: inWk(toWk) })) as Any[];
    const off = (d: Any, from: string) => Math.round((Date.parse(`${dk(d)}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
    const srcKeys = src.map((r) => `${r.employeeId}|${off(r.date, wk)}|${r.shiftId}`);
    const dstKeys = dst.map((r) => `${r.employeeId}|${off(r.date, toWk)}|${r.shiftId}`);
    ck("S8.1", {
      publish: pub.ok && pub.value?.published === unpub0 && ab.every((r, i) => r?.published === true && +r.publishedAt === +pubAt0[i]),
      reader: day.some((e) => e.entryId === s31.a) && new Set(day.map((e) => e.entryId)).size === day.length && day.every((e, i) => e.employeeId === holders[i]),
      copy: cp.ok && Number(cp.value?.created) === dst.length && dst.length > 0 && new Set(dstKeys).size === dstKeys.length && dstKeys.every((k) => srcKeys.includes(k)) && dst.every((r) => r.published === false) && dst.length + (cp.value?.skipped?.length ?? 0) === src.length,
    }, "publish = unpublished only · reader unique/current · copy 1:1 unpublished", `publish ${shown(pub)} ${pub.value?.published}/${unpub0} day=${day.length} copy ${shown(cp)} ${dst.length}+${cp.value?.skipped?.length ?? "?"}/${src.length}`);
  }
  {
    const bare = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_OPTIONS: "--max-old-space-size=2048" };
    const res: string[] = [];
    for (const env of [bare, process.env])
      for (const f of ["scripts/fitness.mts", "scripts/fitness-hr.mts"]) {
        const r = await spawnTsx([f], env, 400_000);
        res.push(`${r.code}${r.code ? ` ${short(r.out.split("\n").filter((l) => /❌|FAIL|Error/.test(l)).join(" "), 80)}` : ""}`);
      }
    chk("X12.1", res.every((r) => r === "0"), "0 ×4 (bare · env)", res.join(" · "));
  }
}

let crashed = "";
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await sweep(P, fx, SLUG);
  } catch (e) {
    console.log(`💥 cleanup: ${errText(e)}`);
  }
}
const residue = await residueOf(P, fx, SLUG, SLUG_PREFIX);
console.log(`RESIDUE ${residue.length ? residue.join(",") : "none"} (tenants=${fx.tenants.length} users=${fx.users.length})`);
chk("Z1", residue.length === 0 && fx.tenants.length > 0, "none", residue.join(",") || "none");
const exitCode = printSummary(SUITE, { force: FORCE, crashed, missing: skipReasons });
await P.$disconnect?.().catch?.(() => {});
process.exit(exitCode);
