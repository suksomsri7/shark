// qc-hr-lib.mts — ตัวช่วยกลางของข้อสอบ HR V2 (COMMON §G · ยกจาก qc-hr-h2.1.mts ตอนเขียนข้อสอบ H2.2 · 11 พ.ย. 2026)
//   ไม่มีอะไรรันตอน import (ไม่ต่อฐานข้อมูล) — ข้อสอบเรียก qc4Env() ก่อนใช้ prisma เสมอ · qc-hr-h2.1.mts ไม่ได้ย้ายมาใช้ (คงเดิมตามสั่ง)
//   เนื้อหา: ทะเบียนข้อ + chk + สรุป JSON_SUMMARY · ตัวกันโฮสต์ QC4 (ep-frosty-lab) · ร้าน/สาขา/ผู้ใช้/พนักงานชั่วคราว + กวาดทิ้ง + RESIDUE ·
//   SQL ดิบ · ล็อกกุญแจตารางกะ (ทางสองขนาน) · git ฐาน/บรรพบุรุษ · ชุดค่าคงที่ "แช่แข็ง" ของ H1.2 S5 / H2.1 S8 (ดิจิสต์ · นาฬิกา · privacy matrix)
// ⚠️ ข้อสอบที่ import ไฟล์นี้: qc-hr-h2.2 — แก้ไฟล์นี้ = แก้ทุกข้อสอบที่ใช้ (ผู้คุมเป็นเจ้าของ เหมือนตัวข้อสอบ)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export const ROOT = process.cwd();
export const QC4_HOST_MARK = "ep-frosty-lab";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═════════════════════════ ตัวช่วยล้วน ═════════════════════════
export const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
export const short = (v: unknown, n = 200) => {
  try {
    return (typeof v === "string" ? v : JSON.stringify(v) ?? "undefined").replace(/\s+/g, " ").slice(0, n);
  } catch {
    return String(v).slice(0, n);
  }
};
export const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 180);
export const isThai = (s: string) => /[฀-๿]/.test(s);
export const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["reason", "message", "error"]) if (typeof o[k] === "string" && o[k]) return String(o[k]);
  }
  return "";
};
export const srt = (a: Iterable<string>) => [...a].sort().join(",");
export const failedKeys = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => !v).map(([k]) => k).join(",") || "all";
export const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** "YYYY-MM-DD" ของค่า @db.Date / ISO / สตริงวัน */
export const dk = (v: unknown): string => (v instanceof Date ? (Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : "∅") : typeof v === "string" ? v.slice(0, 10) : "∅");
export const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
export const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const isoOf = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === "string" ? new Date(v).toISOString() : "∅");
/** ป้ายสั้นไม่มีตัวเลขยาว (กฎ SEC: ผลของ AI/เครื่องมือปิดตัวเลข ≥ 9 หลัก ⇒ ชื่อชุดทดสอบห้ามมีเวลาประทับ) */
export const tagOf = (stamp: string) => Number(stamp.replace(/\D/g, "").slice(-12) || "0").toString(36).replace(/\d/g, (d) => "abcdefghij"[Number(d)]);

/** sha256 ของ payroll-rules.ts (FREEZE — COMMON §C.4 · ค่าเดียวกับ h0.6/h0.7/h1.1/h1.2/h2.1) */
export const PAYROLL_RULES_FILE = "src/lib/modules/hr/payroll-rules.ts";
export const PAYROLL_RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";

export function spawnTsx(args: string[], env: Record<string, string | undefined>, timeoutMs = 300_000): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const c = spawn("pnpm", ["exec", "tsx", ...args], { env: env as NodeJS.ProcessEnv, cwd: ROOT });
    let o = "";
    c.stdout.on("data", (d) => (o += String(d)));
    c.stderr.on("data", (d) => (o += String(d)));
    const t = setTimeout(() => c.kill("SIGTERM"), timeoutMs); // ลูกของเราเองเท่านั้น
    c.on("error", (e) => {
      clearTimeout(t);
      res({ code: -1, out: errText(e) });
    });
    c.on("close", (code) => {
      clearTimeout(t);
      res({ code: code ?? -1, out: o });
    });
  });
}
/** fitness.mts + fitness-hr.mts โดยไม่มี env (PATH/HOME เท่านั้น) — X12 ของทุกใบ */
export async function fitnessNoEnv(): Promise<{ ok: boolean; note: string }> {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  const a = await spawnTsx(["scripts/fitness.mts"], env);
  const b = await spawnTsx(["scripts/fitness-hr.mts"], env);
  const tailOf = (s: string) => short(s.trim().split("\n").slice(-1)[0] ?? "", 70);
  return { ok: a.code === 0 && b.code === 0, note: `fitness exit=${a.code} (${tailOf(a.out)}) · fitness-hr exit=${b.code} (${tailOf(b.out)})` };
}

// ═════════════════════════ git ฐาน ═════════════════════════
const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
/** ฐานของใบ = env (เช่น QC_H22_BASE) หรือ merge-base HEAD origin/session/hr */
export function baseRef(envVar?: string): string {
  const e = envVar ? process.env[envVar] : "";
  if (e) return e;
  try {
    return git(["merge-base", "HEAD", "origin/session/hr"]);
  } catch {
    return "";
  }
}
export function commitInBase(commit: string, base: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, base], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
/** ไฟล์มีอยู่ในคอมมิตฐานไหม — ใช้แทน SHA ของ merge ที่ยังไม่เกิด (เช่น "H2.2 อยู่ในฐานแล้ว" = ฐานมี roster-board.ts) */
export function pathInBase(path: string, base: string): boolean {
  if (!base) return false;
  try {
    execFileSync("git", ["cat-file", "-e", `${base}:${path}`], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
/** "unchanged" | "changed: a,b" | "git: …" — เทียบ working tree กับฐาน */
export function changedVsBase(base: string, files: string[]): string {
  try {
    const out = git(["diff", "--name-only", base, "--", ...files]);
    return out ? `changed: ${out.replace(/\n/g, ",")}` : "unchanged";
  } catch (e) {
    return `git: ${errText(e).slice(0, 60)}`;
  }
}
/** hunk ของ `git diff -U0 base -- file` (บรรทัดเพิ่ม/ลบ) — ใช้ตรวจ "แก้ได้เฉพาะ hunk ที่มีเครื่องหมาย" */
export function diffHunks(base: string, file: string): { added: string[]; removed: string[] }[] | null {
  try {
    const out = git(["diff", "-U0", base, "--", file]);
    const hunks: { added: string[]; removed: string[] }[] = [];
    for (const line of out.split("\n")) {
      if (line.startsWith("@@")) hunks.push({ added: [], removed: [] });
      else if (hunks.length && line.startsWith("+") && !line.startsWith("+++")) hunks[hunks.length - 1].added.push(line.slice(1));
      else if (hunks.length && line.startsWith("-") && !line.startsWith("---")) hunks[hunks.length - 1].removed.push(line.slice(1));
    }
    return hunks;
  } catch {
    return null;
  }
}

// ═════════════════════════ ทะเบียนข้อ + สรุป ═════════════════════════
export type Sev = "CRITICAL" | "MAJOR" | "MINOR";
export type Base = "RED" | "GREEN";
export type Def = readonly [string, string, Sev, Base, string];
export function makeRegistry(suite: string, prefix: string, checks: readonly Def[]) {
  const TITLE = new Map(checks.map(([id, , , , t]) => [id, t]));
  const SEV = new Map(checks.map(([id, , sev]) => [id, sev]));
  const BASE = new Map(checks.map(([id, , , b]) => [id, b]));
  const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
  function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
    const full = `${prefix}${id}`;
    if (!TITLE.has(full)) throw new Error(`unregistered check id: ${id}`);
    const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
    results.set(full, r);
    console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
    return r.ok;
  }
  function printList(): void {
    console.log(`${suite} — ${checks.length} checks (id · group · sev · base · title)`);
    for (const [id, g, sev, base, t] of checks) console.log(`${id}\t${g}\t${sev}\t${base}\t${t}`);
  }
  function skipExit(reasons: string[]): never {
    console.log(`⏭️  SKIPPED — ${suite}: not built`);
    for (const r of reasons) console.log(`   • ${r}`);
    console.log(`JSON_SUMMARY ${JSON.stringify({ suite, total: 0, passed: 0, failed: [], findings: [], skipped: true, reason: reasons, registered: checks.length })}`);
    process.exit(0);
  }
  /** ข้อที่ไม่ถึง = ❌ · BASE-EXPECTATION · บรรทัดสรุป · JSON_SUMMARY · คืน exit code */
  function finish(o: { forced: boolean; crashed: string; missing: string[] }): number {
    for (const [id] of checks) if (!results.has(id)) chk(id.slice(prefix.length), false, "checked", o.crashed ? `not reached (harness crashed: ${o.crashed.slice(0, 80)})` : "not reached");
    const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
    const asBase = [...results.entries()].filter(([id, r]) => (BASE.get(id) === "RED" ? !r.ok : r.ok)).length;
    const offBase = [...results.entries()].filter(([id, r]) => (BASE.get(id) === "RED" ? r.ok : !r.ok)).map(([id]) => `${id}(${BASE.get(id)}→${results.get(id)!.ok ? "pass" : "fail"})`);
    const nRed = checks.filter(([, , , b]) => b === "RED").length;
    console.log(`BASE-EXPECTATION ${asBase}/${results.size} as registered (RED-by-design ${nRed} · GREEN controls ${checks.length - nRed})${offBase.length ? ` · off: ${offBase.join(" ")}` : ""}`);
    console.log(`\n===== ${suite} ===== passed ${results.size - failed.length}/${results.size}${o.forced ? " (QC_FORCE)" : ""}${o.crashed ? " · CRASHED" : ""}`);
    console.log(
      `JSON_SUMMARY ${JSON.stringify({ suite, total: results.size, passed: results.size - failed.length, failed, findings: failed.map((id) => ({ id, sev: SEV.get(id) ?? "CRITICAL" })), skipped: false, forced: o.forced, crashed: !!o.crashed, missing: o.missing, baseRed: nRed, baseGreen: checks.length - nRed, offBase })}`,
    );
    return failed.length ? 1 : 0;
  }
  return { chk, results, printList, skipExit, finish };
}

// ═════════════════════════ env (QC4 เท่านั้น) ═════════════════════════
/** โหลด env ของ QC แบบเดิม · ไม่ใช่โฮสต์ QC4 ⇒ หยุด (exit 4 ไม่เขียนอะไร) · คืน prisma + core/hash */
export async function qc4Env(suite: string): Promise<{ P: Any; coreHash: Any }> {
  process.env.QC_ENV_FILE ??= ".env.qc";
  if (process.env.QC_ENV_FILE === ".env") {
    console.error(`🔴 ${suite}: QC_ENV_FILE=.env is production — refused`);
    process.exit(4);
  }
  const { loadLegacyQcEnv } = (await import("./qc-env-guard.mjs" as string)) as Any;
  loadLegacyQcEnv(suite);
  const bad = [
    ["DATABASE_URL", process.env.DATABASE_URL ?? ""],
    ["DIRECT_URL", process.env.DIRECT_URL ?? ""],
  ].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(QC4_HOST_MARK));
  if (bad.length) {
    console.error(`🔴 STOP ${suite}: writes allowed on QC4 (${QC4_HOST_MARK}) only — ${bad.map(([n]) => n).join(", ")} is not (nothing written)`);
    process.exit(4);
  }
  let host = "?";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    /* host เท่านั้น — ไม่พิมพ์ URL */
  }
  console.log(`[${suite}] DB host = ${host} (${host.includes(QC4_HOST_MARK) ? "QC4 ✓" : "not QC4"})`);
  const { prisma } = (await import("@/lib/core/db")) as Any;
  const coreHash = (await import("@/lib/core/hash" as string)) as Any;
  return { P: prisma, coreHash };
}

// ═════════════════════════ ข้อมูลชั่วคราว (ร้าน/สาขา/ผู้ใช้/พนักงาน) ═════════════════════════
export type Who = { id: string; name: string; email: string; cookie: string; tenantId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> };
export type EmpOpts = { linkedUserId?: string | null; unitId?: string | null; code?: string; startDate?: string; endDate?: string; position?: string; status?: string; active?: boolean };
export const vOf = (w: Who) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });
/** auth สังเคราะห์รูปเดียวกับ requireTenant() (สำหรับ core ของ action ที่ทดสอบได้โดยไม่มี Next) */
export const authOf = (w: Who) => ({ user: { id: w.id, name: w.name, email: w.email }, tenantId: w.tenantId, active: { tenantId: w.tenantId, userId: w.id, role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, tenant: { id: w.tenantId } } });

export function makeFixtures(P: Any, coreHash: Any, slug: string) {
  const tenants: string[] = [];
  const users: string[] = [];
  const names: string[] = []; // ทุกชื่อคน/พนักงาน/สาขาที่สร้าง (ตรวจรั่ว)
  async function mkUser(tenantId: string, tag: string, name: string, role: Who["role"], unitAccess: string[], permissions: Record<string, boolean>): Promise<Who> {
    const email = `${slug}-${tag}@qc.invalid`;
    const u = await P.user.create({ data: { email, name } });
    users.push(u.id);
    names.push(name);
    await P.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    const token = coreHash.randomToken(32) as string;
    const DAY = 86_400_000;
    await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
    const cookie = `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tenantId}`;
    return { id: u.id, name, email, cookie, tenantId, role, unitAccess, permissions };
  }
  async function mkEmp(tenantId: string, systemId: string, name: string, o: EmpOpts = {}): Promise<string> {
    const e = await P.hrEmployee.create({
      data: {
        tenantId,
        systemId,
        name,
        linkedUserId: o.linkedUserId ?? null,
        code: o.code ?? null,
        position: o.position ?? null,
        startDate: o.startDate ? dbDate(o.startDate) : null,
        ...(o.endDate ? { endDate: dbDate(o.endDate) } : {}),
        ...(o.unitId ? { unitId: o.unitId } : {}),
        ...(o.status ? { employmentStatus: o.status } : {}),
        ...(o.active === false ? { active: false } : {}),
      },
    });
    names.push(name);
    return e.id as string;
  }
  async function newTenant(suffix: string, name: string): Promise<string> {
    const t = await P.tenant.create({ data: { name, slug: `${slug}${suffix}` } });
    tenants.push(t.id);
    return t.id as string;
  }
  async function newUnit(tenantId: string, name: string, s: string): Promise<string> {
    const u = await P.businessUnit.create({ data: { tenantId, type: "SHOP", name, slug: `${slug}-${s}` } });
    names.push(name);
    return u.id as string;
  }
  async function rawRows(sql: string, ...params: unknown[]): Promise<Any[] | null> {
    try {
      return (await P.$queryRawUnsafe(sql, ...params)) as Any[];
    } catch {
      return null;
    }
  }
  return { tenants, users, names, mkUser, mkEmp, newTenant, newUnit, rawRows };
}
export type Fx = ReturnType<typeof makeFixtures>;

const NEW_DELETE_ORDER = ["HrShiftSwapRequest", "HrTimeCorrection", "HrOtRequest", "HrLeaveBalanceTxn", "HrRosterEntry", "HrShift", "HrHoliday", "HrLeavePolicy", "HrEmployeeUnit"];
const MODEL_DELETE_ORDER = [
  "approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy",
  "hrPayrollItem", "hrPayAdjustment", "hrPayrollRun", "hrSalaryProfile",
  "hrEmployeeDoc", "hrAttendance", "hrLeave", "hrWorkSchedule", "hrEmployee",
  "outboxEvent", "appNotification", "webhookDelivery", "auditLog", "aiProposal", "aiPlan", "aiMessage", "aiConversation",
  "party", "membership", "appSystemUnit", "appSystem", "businessUnit",
];
/** กวาดร้านชั่วคราว 2 รอบ + ผู้ใช้/เซสชัน (ตามอีเมล slug ด้วย) */
export async function cleanupFx(P: Any, fx: Fx, slug: string): Promise<void> {
  const d = async (n: string, f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (e) {
      console.log(`  ⚠ cleanup ${n}: ${errText(e).slice(0, 90)}`);
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (const tid of fx.tenants) {
      for (const t of NEW_DELETE_ORDER) await d(t, () => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid));
      for (const m of MODEL_DELETE_ORDER) if (P[m]?.deleteMany) await d(m, () => P[m].deleteMany({ where: { tenantId: tid } }));
      await d("tenant", () => P.tenant.deleteMany({ where: { id: tid } }));
    }
  }
  const extra = ((await P.user.findMany({ where: { email: { startsWith: `${slug}-` } }, select: { id: true } }).catch(() => [])) as Any[]).map((u) => u.id as string);
  for (const uid of [...new Set([...fx.users, ...extra])]) {
    await d("session", () => P.session.deleteMany({ where: { userId: uid } }));
    await d("appNotification(user)", () => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    await d("membership(user)", () => P.membership.deleteMany({ where: { userId: uid } }));
    await d("user", () => P.user.deleteMany({ where: { id: uid } }));
  }
}
/** รายการของที่เหลือ (ว่าง = สะอาด) + พิมพ์บรรทัด RESIDUE */
export async function residueOf(P: Any, fx: Fx, slug: string, slugPrefix: string): Promise<string[]> {
  const residue: string[] = [];
  for (const tid of fx.tenants) {
    for (const m of ["hrLeave", "hrEmployee", "hrAttendance", "hrWorkSchedule", "hrSalaryProfile", "hrPayAdjustment", "hrPayrollRun", "hrPayrollItem", "auditLog", "outboxEvent", "membership", "appSystem", "businessUnit"]) {
      const n = await P[m].count({ where: { tenantId: tid } }).catch(() => -1);
      if (n !== 0) residue.push(`${m}=${n}`);
    }
    for (const t of NEW_DELETE_ORDER) {
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      const n = r ? Number(r[0]?.n ?? -1) : -2;
      if (n !== 0) residue.push(`${t}=${n}`);
    }
  }
  const leftUsers = await P.user.count({ where: { OR: [{ id: { in: fx.users.length ? fx.users : ["∅"] } }, { email: { startsWith: `${slug}-` } }] } }).catch(() => -1);
  const leftSessions = fx.users.length ? await P.session.count({ where: { userId: { in: fx.users } } }).catch(() => -1) : 0;
  if (leftUsers !== 0) residue.push(`user=${leftUsers}`);
  if (leftSessions !== 0) residue.push(`session=${leftSessions}`);
  const leftTenants = await P.tenant.count({ where: { slug: { startsWith: slugPrefix } } }).catch(() => -1);
  if (leftTenants !== 0) residue.push(`tenant(${slugPrefix}*)=${leftTenants}`);
  console.log(`RESIDUE ${residue.length ? residue.join(",") : "none"} (tenants=${fx.tenants.length} users=${fx.users.length})`);
  return residue;
}

// ═════════════════════════ ทางขนาน: ถือกุญแจตารางกะ (ระบบ, พนักงาน, วัน) ═════════════════════════
/**
 * ทางถือ (holder) ล็อก `hr:roster:<systemId>:<employeeId>:<date>` · เริ่ม `call` ซึ่งต้องรอล็อกนี้ ·
 * เมื่อเห็นว่ารอจริง (pg_stat_activity advisory) ⇒ รัน `whileWaiting` (นอก tx ของ holder) · ปล่อย holder (รัน `during` ใน tx ของมัน แล้ว commit)
 */
export async function underRosterLock<R>(
  P: Any,
  systemId: string,
  key: { employeeId: string; date: string },
  call: () => Promise<R>,
  o: { during?: (tx: Any) => Promise<unknown>; whileWaiting?: () => Promise<unknown> } = {},
): Promise<{ res: R; waited: boolean; holderErr: string; sideErr: string }> {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: () => void = () => {};
  const heldP = new Promise<void>((r) => (held = r));
  let holderErr = "";
  let sideErr = "";
  const holder = P.$transaction(
    async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT count(pg_advisory_xact_lock(hashtextextended($1::text, 0)))::int AS n`, `hr:roster:${systemId}:${key.employeeId}:${key.date}`);
      held();
      await gate;
      if (o.during) await o.during(tx);
    },
    { maxWait: 10_000, timeout: 30_000 },
  ).catch((e: unknown) => {
    holderErr = errText(e);
    held();
  });
  await heldP;
  const callP = call();
  let waited = false;
  for (let i = 0; i < 80 && !waited; i++) {
    await sleep(100);
    const w = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory' AND query ILIKE '%pg_advisory_xact_lock%'`).catch(() => null)) as Any[] | null;
    waited = Number(w?.[0]?.n ?? 0) > 0;
  }
  if (o.whileWaiting) {
    try {
      await o.whileWaiting();
    } catch (e) {
      sideErr = errText(e);
    }
  }
  release();
  await holder;
  return { res: await callP, waited, holderErr, sideErr };
}

// ═════════════════════════ ชุดแช่แข็ง (qc-hr-h1.2 S5 → qc-hr-h2.1 S8 · ค่าเดิมทุกตัว) ═════════════════════════
export const FROZEN_DIGESTS: Record<string, string> = {
  listAttendance: "8436a89981a0146a04c8954c6b0a49752eb7cb9c0661df9927bc356bd8fe46c9",
  leaves: "f43008cba9f7bfae26638ae985e4c11565803988943cf3cf2f3921de10b8a62d",
  leaveItemsForViewer: "54ef63446a674b6108da0bf977e2b50aab14cfd40252f18c94c0d4eb0f2798b1",
  monthlyAttendance: "9a4c6047d670e99934b26da17183246f1c3ce07415ccc1c7f81f66cb09df1fb3",
  unavailable: "840adc0a26e7efd47a1e90cc033305236855d619f8b06aaf42dbb91c3b5e9643",
};
export const FROZEN_MONTHLY = { digest: "72166a3e2a2ebb6a37405a105f7db540b946fda05fe020639bbe79a60b87e5c8", totals: "10725000:195000:195000:100000:10430000:475000:100000", flags: "M01=-,M02=-,M03=-,M04=PARTIAL_MONTH" };
export const FROZEN_CLOCK = "K1=DAY_OFF:-:-|K2=ON_TIME:0:0|K3=NO_SCHEDULE:-:-";
const PRIOR_WO_KEYS = new Set(["filedById", "linkApprovedById", "unitId", "employmentStatus", "probationEndAt", "contractEndAt", "filedBy"]);
const H12_NEW_KEYS = ["rosterEntryId", "source", "lat", "lng", "accuracyM", "photoKey", "deviceId", "attachmentKey", "policyId", "days", "halfDay", "hours"];
const B = (baht: number) => Math.round(baht * 100);
const MONTHLY_FIXTURE = {
  period: "2030-05",
  payDate: "2030-05-31",
  employees: [
    { code: "M01", base: B(15_000), sso: true, spouse: false, children: 0, start: null as string | null },
    { code: "M02", base: B(27_500), sso: false, spouse: false, children: 0, start: null as string | null },
    { code: "M03", base: B(52_000), sso: true, spouse: true, children: 2, start: null as string | null },
    { code: "M04", base: B(9_000), sso: true, spouse: false, children: 0, start: "2030-05-16" as string | null },
  ],
  adjustments: [
    { code: "M01", kind: "OT", amount: B(1_250) },
    { code: "M02", kind: "BONUS", amount: B(3_000) },
    { code: "M03", kind: "DEDUCTION", amount: B(800) },
    { code: "M04", kind: "ALLOWANCE", amount: B(500) },
    { code: "M04", kind: "ADVANCE", amount: B(200) },
  ],
} as const;
export type FrozenOut = { digests: { key: string; want: string; got: string }[]; monthly: string; clock: string; privacyBad: string[]; fixtureError: string };

/**
 * สร้างชุดแช่แข็งในร้าน TD (ระบบ D/M/K) ตามแบบ qc-hr-h2.1 S8 ทุกขั้น (ลำดับ/เวลา sleep เดิม) ·
 * คืน `ctxD` + `D` (พนักงาน D01–D03) + `shD` (กะของระบบ D) ให้ข้อสอบเล่นบอร์ดในระบบ D ก่อน · แล้วเรียก `measure()` ได้ค่าแช่แข็ง
 * `other` = เจ้าของร้านอื่น (T2) — ใช้ในแถว otherTenant ของ privacy matrix
 */
export async function frozenHrFixture(P: Any, fx: Fx, TD: string, T2: string, other: Who, tag: string) {
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const hr = (await import("@/lib/modules/hr/service")) as Any;
  const pay = (await import("@/lib/modules/hr/payroll")) as Any;
  const privacy = (await import("@/lib/modules/hr/privacy" as string)) as Any;
  const digestMod = (await import("@/lib/modules/hr/payroll-digest" as string)) as Any;
  const du1 = await fx.newUnit(TD, `ดีสาขาเหนือ ${tag}`, "du1");
  const du2 = await fx.newUnit(TD, `ดีสาขาใต้ ${tag}`, "du2");
  const sD = await sysSvc.createSystem(TD, "HR", "ทีมดิจิสต์");
  await sleep(30);
  const sM = await sysSvc.createSystem(TD, "HR", "ทีมเงินเดือนรายเดือน");
  await sleep(30);
  const sK = await sysSvc.createSystem(TD, "HR", "ทีมลงเวลา");
  const ctxD = { tenantId: TD, systemId: sD.id as string };
  const ctxK = { tenantId: TD, systemId: sK.id as string };
  const UD = {
    owner: await fx.mkUser(TD, "d-owner", `QC ดีเจ้าของ ${tag}`, "OWNER", [], {}),
    mgrU1: await fx.mkUser(TD, "d-mgru1", `QC ดีผู้จัดการเหนือ ${tag}`, "MANAGER", [du1], { "hr.employee.create": true }),
    mgrAll: await fx.mkUser(TD, "d-mgrall", `QC ดีผู้จัดการทุกสาขา ${tag}`, "MANAGER", ["*"], {}),
    staffU1: await fx.mkUser(TD, "d-staffu1", `QC ดีพนักงานเหนือ ${tag}`, "STAFF", [du1], { "hr.leave.request": true }),
    payAll: await fx.mkUser(TD, "d-payall", `QC ดีเงินเดือน ${tag}`, "STAFF", ["*"], { "hr.payroll.read": true, "hr.leave.read": true }),
    hrRead: await fx.mkUser(TD, "d-hrread", `QC ดีอ่านลา ${tag}`, "STAFF", ["*"], { "hr.leave.read": true }),
    member: await fx.mkUser(TD, "d-member", `QC ดีสมาชิก ${tag}`, "STAFF", [], {}),
    other,
  };
  const labels = new Map<string, string>([[TD, "T"], [T2, "T2"], [sD.id, "sysD"], [du1, "u1"], [du2, "u2"], ...Object.entries(UD).map(([k, w]) => [w.id, k] as [string, string])]);
  const D1 = await fx.mkEmp(TD, sD.id, "QC-H12 ดีหนึ่ง", { code: "D01", position: "แคชเชียร์", unitId: du1, linkedUserId: UD.staffU1.id, startDate: "2030-01-01" });
  await sleep(15);
  const D2 = await fx.mkEmp(TD, sD.id, "QC-H12 ดีสอง", { code: "D02", position: "บาริสต้า", unitId: du1, startDate: "2030-01-02" });
  await sleep(15);
  const D3 = await fx.mkEmp(TD, sD.id, "QC-H12 ดีสาม", { code: "D03", position: "ครัว", unitId: du1 });
  labels.set(D1, "D01").set(D2, "D02").set(D3, "D03");
  const today = hr.bkkParts(new Date()).dateStr as string; // ตำแหน่งข้อมูลเท่านั้น — ไม่อยู่ในค่าคาดหวัง
  const FIX_TS = new Date("2030-01-01T00:00:00Z");
  const shD = await P.hrShift.create({ data: { tenantId: TD, systemId: sD.id, name: "กะดีเช้า", startMin: 420, endMin: 900 } });
  for (const [emp, day] of [[D1, today], [D2, today], [D1, "2030-03-04"], [D2, "2030-03-05"], [D3, "2030-03-04"], [D1, "2030-03-12"]] as [string, string][]) {
    await P.hrRosterEntry.create({ data: { tenantId: TD, systemId: sD.id, employeeId: emp, date: dbDate(day), shiftId: shD.id, unitId: du1, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false, published: true, publishedAt: FIX_TS, source: "MANUAL" } });
  }
  let fixtureError = "";
  try {
    const attIds: string[] = [];
    const leaveIds: string[] = [];
    const c1 = await hr.clock(ctxD, { employeeId: D1, kind: "IN" });
    const c2 = await hr.clock(ctxD, { employeeId: D1, kind: "OUT" });
    const c3 = await hr.clock(ctxD, { employeeId: D2, kind: "IN" });
    const c4 = await hr.clock(ctxD, { employeeId: D3, kind: "IN" });
    const pin: [Any, string][] = [[c1, "2030-03-04T01:55:00Z"], [c2, "2030-03-04T10:05:00Z"], [c3, "2030-03-05T02:20:00Z"], [c4, "2030-03-04T03:00:00Z"]];
    for (const [c, at] of pin) {
      await P.hrAttendance.update({ where: { id: c.id }, data: { at: new Date(at) } });
      attIds.push(c.id);
    }
    for (const [kind, at, judgement, dueMin, lateMin] of [
      ["IN", "2030-03-06T00:10:00Z", "ON_TIME", 420, 0],
      ["IN", "2030-03-07T00:40:00Z", "LATE", 420, 40],
      ["OUT", "2030-03-07T09:00:00Z", null, null, null],
    ] as [string, string, string | null, number | null, number | null][]) {
      const r = await P.hrAttendance.create({ data: { tenantId: TD, systemId: sD.id, employeeId: D2, kind, at: new Date(at), note: kind === "OUT" ? "ออกตามเวลา" : null, judgement, dueMin, lateMin } });
      attIds.push(r.id);
    }
    attIds.forEach((id, i) => labels.set(id, `AT${i + 1}`));
    for (const [type, from, to, reason] of [
      ["PERSONAL", "2030-03-04", "2030-03-04", "ธุระที่บ้าน"],
      ["SICK", "2030-03-12", "2030-03-13", "ไข้หวัด"],
      ["VACATION", "2030-04-01", "2030-04-03", "พักร้อน"],
      ["OTHER", "2030-05-10", "2030-05-10", null],
    ] as [string, string, string, string | null][]) {
      const r = await hr.requestLeave(ctxD, { employeeId: D1, type, fromDate: from, toDate: to, reason });
      leaveIds.push(r.id);
      await sleep(20);
    }
    leaveIds.forEach((id, i) => labels.set(id, `LV${i + 1}`));
    await hr.decideLeave(ctxD, leaveIds[0], "APPROVED", UD.owner.id);
    await hr.decideLeave(ctxD, leaveIds[2], "REJECTED", UD.owner.id);
    await P.hrEmployee.update({ where: { id: D3 }, data: { active: false } });
  } catch (e) {
    fixtureError = errText(e);
    console.log(`  ⚠ frozen fixture: ${fixtureError}`);
  }
  const TS_KEYS = new Set(["createdAt", "updatedAt", "pinSetAt"]);
  const normJson = (v: unknown): string =>
    JSON.stringify(v, function (k, val) {
      if (PRIOR_WO_KEYS.has(k)) return undefined;
      if (TS_KEYS.has(k)) return val == null ? null : "<ts>";
      if (val instanceof Set) return [...val].map((x) => labels.get(String(x)) ?? String(x)).sort();
      if (typeof val === "string" && labels.has(val)) return labels.get(val);
      return val;
    }) ?? "undefined";

  async function measure(): Promise<FrozenOut> {
    const out: FrozenOut = { digests: [], monthly: "∅", clock: "∅", privacyBad: [], fixtureError };
    const dig = async (key: string, f: () => Promise<unknown>) => {
      let d = "∅";
      try {
        d = sha(normJson(await f()));
      } catch (e) {
        d = `THROW ${errText(e)}`;
      }
      out.digests.push({ key, want: FROZEN_DIGESTS[key], got: d });
    };
    await dig("listAttendance", () => hr.listAttendance(ctxD, 50));
    await dig("leaves", async () => ({ list: await hr.listLeaves(ctxD, 100), pending: await hr.pendingLeaves(ctxD, 100) }));
    await dig("leaveItemsForViewer", async () => ({
      owner: await privacy.leaveItemsForViewer(ctxD, vOf(UD.owner)),
      mgrU1: await privacy.leaveItemsForViewer(ctxD, vOf(UD.mgrU1)),
      staffU1: await privacy.leaveItemsForViewer(ctxD, vOf(UD.staffU1)),
    }));
    await dig("monthlyAttendance", async () => {
      const o: Record<string, unknown> = {};
      for (const [k, id] of [["D01", D1], ["D02", D2], ["D03", D3]]) o[k] = await hr.monthlyAttendance(ctxD, id, new Date("2030-03-01T00:00:00Z"));
      return o;
    });
    await dig("unavailable", async () => ({
      unavail0304: await hr.employeesUnavailable(ctxD, [D1, D2, D3], new Date("2030-03-04T05:00:00Z")),
      unavail0320: await hr.employeesUnavailable(ctxD, [D1, D2, D3], new Date("2030-03-20T05:00:00Z")),
      onLeave0304: await hr.isOnLeave(TD, UD.staffU1.id, new Date("2030-03-04T03:00:00Z")),
      onLeave0320: await hr.isOnLeave(TD, UD.staffU1.id, new Date("2030-03-20T03:00:00Z")),
      kiosk: await hr.kioskRoster(ctxD),
    }));
    // MONTHLY (qc-hr-h1.1 S6.5 / h1.2 S5.6 / h2.1 S8.6)
    {
      const ctxM = { tenantId: TD, systemId: sM.id };
      const codeOf = new Map<string, string>();
      const empOf = new Map<string, string>();
      try {
        for (const m of MONTHLY_FIXTURE.employees) {
          const id = await fx.mkEmp(TD, sM.id, `พนง-${m.code} ${tag}`, { code: m.code, ...(m.start ? { startDate: m.start } : {}) });
          codeOf.set(id, m.code);
          empOf.set(m.code, id);
          await pay.setSalaryProfile(ctxM, { employeeId: id, baseSalarySatang: m.base, ssoEligible: m.sso, deductions: { spouse: m.spouse, children: m.children } });
        }
        for (const a of MONTHLY_FIXTURE.adjustments) {
          await P.hrPayAdjustment.create({ data: { tenantId: TD, systemId: sM.id, employeeId: empOf.get(a.code)!, periodKey: MONTHLY_FIXTURE.period, kind: a.kind, amountSatang: a.amount, status: "APPROVED", note: `QC ${a.kind}` } });
        }
        const run = await pay.createPayrollRun(ctxM, { periodKey: MONTHLY_FIXTURE.period, payDate: new Date(`${MONTHLY_FIXTURE.payDate}T05:00:00Z`) });
        const items = (await P.hrPayrollItem.findMany({ where: { runId: run.id }, select: { ...digestMod.PAYROLL_DIGEST_SELECT, snapshotJson: true } })) as Any[];
        const digest = digestMod.payrollItemsDigest(items.map((i) => ({ ...i, employeeId: codeOf.get(i.employeeId) ?? "?" })));
        const r = (await P.hrPayrollRun.findUnique({ where: { id: run.id } })) as Any;
        const totals = [r.totalGrossSatang, r.totalSsoEmployeeSatang, r.totalSsoEmployerSatang, r.totalWhtSatang, r.totalNetSatang, r.totalAddSatang, r.totalDeductSatang].join(":");
        const flags = items
          .map((i) => `${codeOf.get(i.employeeId)}=${((i.snapshotJson as Any)?.flags ?? []).join("+") || "-"}`)
          .sort()
          .join(",");
        out.monthly = `${digest} · ${totals} · ${flags}`;
      } catch (e) {
        out.monthly = `THROW ${errText(e)}`;
      }
    }
    // นาฬิกา (h2.1 S8.8): ตารางประจำทุกวัน · แถวตารางกะเผยแพร่วันนี้ที่ขัดกัน ⇒ clock() ยังตัดสินตามตารางประจำ
    {
      const K1 = await fx.mkEmp(TD, sK.id, `QC-H21 เคหนึ่ง ${tag}`, { unitId: du1 });
      const K2 = await fx.mkEmp(TD, sK.id, `QC-H21 เคสอง ${tag}`, { unitId: du1 });
      const K3 = await fx.mkEmp(TD, sK.id, `QC-H21 เคสาม ${tag}`, { unitId: du1 });
      const shK = await P.hrShift.create({ data: { tenantId: TD, systemId: sK.id, name: "กะเคเช้า", startMin: 420, endMin: 900 } });
      for (let wd = 0; wd < 7; wd++) {
        await P.hrWorkSchedule.create({ data: { tenantId: TD, systemId: sK.id, employeeId: K1, weekday: wd, dayOff: true } });
        await P.hrWorkSchedule.create({ data: { tenantId: TD, systemId: sK.id, employeeId: K2, weekday: wd, dayOff: false, startMin: 0, endMin: 1440, graceMin: 1440 } });
      }
      for (const emp of [K1, K2, K3]) {
        for (const day of [today, addDay(today, -1), addDay(today, 1)]) {
          await P.hrRosterEntry.create({ data: { tenantId: TD, systemId: sK.id, employeeId: emp, date: dbDate(day), shiftId: shK.id, unitId: du1, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false, published: true, publishedAt: FIX_TS, source: "MANUAL" } });
        }
      }
      const o: string[] = [];
      try {
        for (const [k, id] of [["K1", K1], ["K2", K2], ["K3", K3]] as [string, string][]) {
          const c = await hr.clock(ctxK, { employeeId: id, kind: "IN" });
          const row = (await P.hrAttendance.findUnique({ where: { id: c.id } })) as Any;
          o.push(`${k}=${row?.judgement ?? "∅"}:${row?.dueMin ?? "-"}:${row?.lateMin ?? "-"}`);
        }
      } catch (e) {
        o.push(`THROW ${errText(e)}`);
      }
      out.clock = o.join("|");
    }
    // privacy matrix (h1.2 S6.1 = h2.1 S8.9 · ระบบ D)
    {
      const BASE_PROFILE = ["id", "name", "nickname", "code", "phone", "email", "gender", "birthDate", "maritalStatus", "position", "department", "employmentType", "startDate", "endDate", "addressLine", "subdistrict", "district", "province", "postcode", "emergencyName", "emergencyPhone", "emergencyRelation", "note", "active", "hasPin"];
      const SENS6 = ["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName"];
      const H11_PROFILE = ["unitId", "unitName", "employmentStatus", "probationEndAt", "contractEndAt"];
      const LEAVE6 = ["id", "employeeName", "type", "fromDate", "toDate", "status"];
      const M: [string, Who, Any, "null" | "base" | "sens", boolean, boolean][] = [
        ["owner", UD.owner, ctxD, "sens", true, false],
        ["payroll", UD.payAll, ctxD, "sens", true, false],
        ["managerU1", UD.mgrU1, ctxD, "base", true, false],
        ["hrRead", UD.hrRead, ctxD, "base", true, false],
        ["member", UD.member, ctxD, "null", false, true],
        ["self", UD.staffU1, ctxD, "null", false, false],
        ["otherTenant", UD.other, { tenantId: T2, systemId: sD.id }, "null", false, true],
      ];
      for (const [t, w, ctx, prof, reason, mayBeEmpty] of M) {
        let p: Any = null;
        let li: Any = null;
        try {
          p = await privacy.loadEmployeeProfileForViewer(ctx, vOf(w), D1);
          li = await privacy.leaveItemsForViewer(ctx, vOf(w));
        } catch (e) {
          out.privacyBad.push(`${t}:THROW ${errText(e).slice(0, 40)}`);
          continue;
        }
        const pk = p?.profile ? Object.keys(p.profile) : null;
        const extraOk = (k: string) => H11_PROFILE.includes(k) || (prof === "sens" && k === "payType");
        if (prof === "null" ? pk !== null : !pk || !BASE_PROFILE.every((k) => pk.includes(k)) || !pk.every((k) => BASE_PROFILE.includes(k) || SENS6.includes(k) || extraOk(k)) || SENS6.some((k) => pk.includes(k) !== (prof === "sens"))) out.privacyBad.push(`${t}:profile=${pk ? pk.length : "null"}`);
        const items = [...(li?.pending ?? []), ...(li?.history ?? [])] as Any[];
        const keys = new Set(items.flatMap((x) => Object.keys(x)));
        const want = new Set([...LEAVE6, ...(reason ? ["reason"] : [])]);
        const emptyOk = mayBeEmpty && items.length === 0;
        if (t === "otherTenant" ? items.length !== 0 : !emptyOk && srt(keys) !== srt(want) && !(srt([...keys].filter((k) => k !== "filedBy")) === srt(want))) out.privacyBad.push(`${t}:leaveKeys=${srt(keys)}`);
        const h12 = [...(pk ?? []), ...keys].filter((k) => H12_NEW_KEYS.includes(k));
        if (h12.length) out.privacyBad.push(`${t}:H1.2 keys ${h12.join("+")}`);
        if ((p?.docs ?? []).length) out.privacyBad.push(`${t}:docs`);
      }
    }
    return out;
  }
  return { ctxD, sD: sD.id as string, du1, du2, UD, D: { D1, D2, D3 }, shD: shD.id as string, measure };
}
export const frozenMonthlyWant = () => `${FROZEN_MONTHLY.digest} · ${FROZEN_MONTHLY.totals} · ${FROZEN_MONTHLY.flags}`;

// ═════════════════════════ ตัวช่วยสถิต (อ่านซอร์ส/JSON) ═════════════════════════
export const importsOf = (src: string) => [...src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => ({ type: !!m[1], spec: m[2] }));
/** อ็อบเจกต์ซ้อน → { "a.b.c": ค่า } */
export const flat = (o: Any, p = "", out: Record<string, unknown> = {}): Record<string, unknown> => {
  if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flat(v, p ? `${p}.${k}` : k, out);
  else out[p] = o;
  return out;
};
export const jsonOf = (p: string): Any => {
  try {
    return JSON.parse(rd(p) || "null");
  } catch {
    return null;
  }
};
/** ข้อความแม่แบบ "{n}" ⇒ regex ที่รับชื่อ placeholder ใดก็ได้ */
export const placeholderRe = (t: string) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{n\\\}/g, "\\{\\w+\\}")}$`);
/** data-testid ในซอร์ส: "pfx-x" และ `pfx-x-${…}` ⇒ "pfx-x-*" */
export const testidsOf = (src: string, prefix: string) => {
  const s = new Set<string>();
  for (const m of src.matchAll(new RegExp(`${prefix}[a-z0-9-]*[a-z0-9-](\\$\\{)?`, "g"))) s.add(m[1] ? `${m[0].slice(0, -2)}*` : m[0]);
  return s;
};
/** JSON คีย์เรียง (เทียบ deep-equal ไม่ขึ้นกับลำดับคีย์) */
export const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Any)[k]])) : x));
export const keysDeep = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (out.add(k), keysDeep(x, out));
  return out;
};
/** โมดูลที่อาจยังไม่มี: null = ไม่มีไฟล์ · { __err } = import พัง */
export const loadOpt = async (file: string, spec: string): Promise<Any> => (existsSync(join(ROOT, file)) ? ((await import(spec).catch((e: unknown) => ({ __err: errText(e) }))) as Any) : null);
export const modState = (m: Any, f: string) => (m === null ? `∅ ${f}` : m.__err ? `import error ${m.__err}` : "loaded");

// ═════════════════════════ ข้อความคงที่ของเครื่องยนต์ตารางกะ (H2.1 FIXED_REFUSALS) ตามรหัสของบอร์ด H2.2 ═════════════════════════
export const ROSTER_ENGINE_TEXT: Record<string, string> = {
  noPerm: "คุณไม่มีสิทธิ์จัดตารางกะ",
  ended: "พนักงานคนนี้พ้นสภาพแล้ว — จัดกะไม่ได้",
  outEmploy: "วันนี้อยู่นอกช่วงการจ้างของพนักงานคนนี้",
  shiftOff: "กะนี้ปิดใช้แล้ว — เลือกกะอื่น",
  shiftNotFound: "ไม่พบกะนี้ — กรุณารีเฟรช",
  shiftOther: "กะนี้เป็นของสาขาอื่น — เลือกกะของสาขานี้หรือกะที่ใช้ทั้งร้าน",
  dup: "พนักงานคนนี้มีกะนี้ในวันนั้นแล้ว",
  past: "จัดกะย้อนหลังไม่ได้ — ใช้คำขอแก้เวลาแทน",
  sameWeek: "สัปดาห์ต้นทางกับปลายทางต้องไม่ใช่สัปดาห์เดียวกัน",
  publishRace: "ตารางกะมีการแก้ไขระหว่างเผยแพร่ — กรุณากดเผยแพร่อีกครั้ง",
  otherBranch: "พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ",
  unassigned: "พนักงานคนนี้ยังไม่ระบุสาขาประจำ — ผู้ดูแลทุกสาขาเป็นผู้จัดการ",
  otherUnit: "รายการนี้เป็นของสาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ",
  shiftEqual: "เวลาเริ่มกับเวลาเลิกกะต้องไม่เท่ากัน",
};

// ═════════════════════════ statics ของใบ UI (หน้า/action/ไคลเอนต์/inventory/messages/token) — ใช้ซ้ำได้ทุกใบ UI ของ HR ═════════════════════════
/** บล็อกแท็บ HR: `case "HR":` ใน layout.tsx และ hrTabs() ใน hr/ui.tsx → ป้าย */
export function hrNavLabels(): { layout: string; tabs: string; L: string[]; T: string[] } {
  const cut = (s: string, at: string) => (s.indexOf(at) >= 0 ? s.slice(s.indexOf(at), s.indexOf("];", s.indexOf(at))) : "");
  const layout = cut(rd("src/app/app/layout.tsx"), 'case "HR":');
  const tabs = cut(rd("src/lib/modules/hr/ui.tsx"), "export function hrTabs");
  const labels = (s: string) => [...s.matchAll(/label:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  return { layout, tabs, L: labels(layout), T: labels(tabs) };
}
/** ไฟล์ "use server": ส่งออกได้เฉพาะ async function · ชื่อครบ · ทุกตัวเรียกครบทุก regex ใน `mustCall` */
export function useServerFile(src: string, names: string[], mustCall: RegExp[]) {
  const fn = [...src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)(?=\nexport\s|$)/g)];
  const got = fn.map((m) => m[1]);
  const r = {
    useServer: /^\s*["']use server["']/.test(src),
    names: names.every((w) => got.includes(w)),
    onlyAsyncFns: !/export\s+(type|interface|const|let|var|class|default|\{|\*|function\b)/.test(src.replace(/export\s+async\s+function/g, "")),
    eachDelegates: fn.length > 0 && fn.every((m) => mustCall.every((re) => re.test(m[2]))),
  };
  return { r, got };
}
/** ไฟล์ "use client": import ที่ไม่อยู่ในรายการ · import ใดถึง core/db/@prisma/client ในชั้นเดียว (ยกเว้นขอบ "use server" ใน `boundary`) */
export function clientImports(src: string, allowed: (spec: string) => boolean, boundary: RegExp, relBase = "src/lib/modules/hr/") {
  const imp = importsOf(src);
  const reach = (spec: string): boolean => {
    if (boundary.test(spec)) return false;
    const base = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith("./") ? `${relBase}${spec.slice(2)}` : "";
    const s = base ? ([".ts", ".tsx", "/index.ts", "/index.tsx"].map((x) => rd(base + x)).find(Boolean) ?? "") : "";
    return importsOf(stripComments(s)).some((i) => !i.type && /core\/db|@prisma\/client/.test(i.spec));
  };
  return { useClient: /^\s*["']use client["']/.test(src), n: imp.length, bad: imp.filter((i) => !i.type && !allowed(i.spec)).map((i) => i.spec), dbReach: imp.filter((i) => !i.type && reach(i.spec)).map((i) => i.spec) };
}
/** แถว inventory ของหน้า ↔ testid ในโค้ด สองทาง (`via` + ส่วนท้าย -trigger/-sheet ของ ConfirmDialog) */
export function inventoryParity(pageSuffix: string, ids: Set<string>, wo: string, oracle: string, inv = "scripts/hr-ui-inventory.json") {
  const rows = ((jsonOf(inv)?.rows ?? []) as Any[]).filter((r) => String(r.page ?? "").endsWith(pageSuffix));
  const rowIds = rows.flatMap((r) => [String(r.testid), ...(r.via ? [String(r.via)] : [])]);
  const strip = (s: string) => s.replace(/-(trigger|sheet)$/, "");
  return {
    rows: rows.length,
    codeNoRow: [...ids].filter((c) => !rowIds.some((t) => t === c || strip(t) === c)),
    rowNoCode: rows.filter((r) => ![String(r.testid), strip(String(r.testid)), String(r.via ?? "")].some((t) => ids.has(t))).map((r) => String(r.testid)),
    meta: rows.every((r) => r.wo === wo && r.oracle === oracle),
  };
}
/** F16.4 ของ namespace เดียว: คีย์ th = en · ไม่ว่าง · ค่าไทยไม่ใช่ชื่อคีย์ · มีคีย์ที่ต้องมี */
export function msgParity(th: Record<string, unknown>, en: Record<string, unknown>, mustKeys: string[]) {
  const kt = Object.keys(th);
  const ke = Object.keys(en);
  return {
    some: kt.length > 0,
    same: srt(kt) === srt(ke),
    noEmpty: [...Object.values(th), ...Object.values(en)].every((v) => typeof v === "string" && v.trim() !== ""),
    notKeys: Object.values(th).every((v) => !/^[A-Z_]+$/.test(String(v))),
    must: mustKeys.every((k) => typeof th[k] === "string" && typeof en[k] === "string"),
  };
}
/** UI §C.12: token เท่านั้น (ข้ามคอมเมนต์ก่อนเรียก) — ✓ ⚠ เป็นตัวอักษรของ mockup ไม่ใช่อีโมจิ */
export const tokensOnly = (src: string) => ({
  tokens: !/--color-(fg|bg|success|primary|hover)\b/.test(src),
  hex: !/["'`\s(:]#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b|\brgba?\(|\bhsla?\(/.test(src),
  blue: !/\bbg-blue-/.test(src),
  emoji: !/\p{Extended_Pictographic}/u.test(src.replace(/[✓⚠]/g, "")),
});

/**
 * ชุดแช่แข็งครบวง: สร้าง (frozenHrFixture) → `session(fz)` ของใบ (เช่นเล่นบอร์ดผ่าน core ในระบบ D · คืน "ok" | "n/a …" | "✗ …") → วัด ·
 * คืนผล 3 ข้อในรูป [ok, expected, actual] (ดิจิสต์+MONTHLY+session · นาฬิกา · privacy matrix)
 */
export async function frozenControls(P: Any, fx: Fx, TD: string, T2: string, other: Who, tag: string, session: (fz: Awaited<ReturnType<typeof frozenHrFixture>>) => Promise<string>) {
  const fz = await frozenHrFixture(P, fx, TD, T2, other, tag);
  let ses = "";
  try {
    ses = await session(fz);
  } catch (e) {
    ses = `✗ THROW ${errText(e)}`;
  }
  const out = await fz.measure();
  const bad = out.digests.filter((d) => d.got !== d.want).map((d) => `${d.key}=${d.got.slice(0, 12)}`);
  const monthlyOk = out.monthly === frozenMonthlyWant();
  for (const d of out.digests) console.log(`  ℹ ${d.key} digest=${d.got}`);
  return {
    digests: [!out.fixtureError && !bad.length && monthlyOk && !ses.startsWith("✗"), "5 digests + MONTHLY frozen · session ok", `${bad.join(" ") || "digests ok"} monthly=${monthlyOk ? "ok" : out.monthly.slice(0, 40)} session=${ses}${out.fixtureError ? ` fixture=${out.fixtureError.slice(0, 50)}` : ""}`] as const,
    clock: [out.clock === FROZEN_CLOCK, FROZEN_CLOCK, out.clock] as const,
    privacy: [out.privacyBad.length === 0, "7 viewers as base", out.privacyBad.join(" ") || "7 viewers ok"] as const,
  };
}

/** คีย์ที่ DTO ของหน้าจอ HR ทั่วไปห้ามมี (ข้อมูลอ่อนไหว · เงิน · เหตุผลลา · หมายเหตุอิสระ · ติดต่อ · PIN · ลิงก์ผู้ใช้) */
export const HR_FORBIDDEN_DTO_KEYS = ["nationalId", "ssoNumber", "bankName", "bankAccountNo", "bankAccountName", "houseRegAddress", "pinCode", "pinHash", "baseSalarySatang", "payType", "dailyRateSatang", "hourlyRateSatang", "reason", "note", "linkedUserId", "phone", "email"];
