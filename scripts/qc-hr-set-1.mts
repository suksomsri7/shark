// QC — HR V2 · fix ticket HR-SET-1: every writer of AppSystem.settings in src/lib/modules/hr/** serialises on ONE lock order and never writes a stale whole object
//   lock order: advisory hr:clockpolicy:<sys> → (writer's own advisory key, e.g. hr:otpolicy / hr:lifepolicy / hr:attpay:policy) → AppSystem row FOR UPDATE ·
//   read under the row lock · change only the writer's own key(s) (shared helper src/lib/modules/hr/settings-lock.ts)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Deterministic lost-update checks (pattern of qc-hr-h3.9 S4.12): a raw transaction holds a lock (A = hr:clockpolicy · B = the AppSystem row FOR UPDATE ·
//   C = the writer's own key) and reads settings; the writer under test starts and must be BLOCKED BY THAT TRANSACTION (pg_blocking_pids, then still pending
//   after 400 ms); the raw transaction writes the stale object + a marker key and commits; the writer finishes; its own key AND the marker must both be there.
// Tenants qc-hr-set1-<stamp> · SKIP while hr/settings-lock.ts is absent (QC_FORCE=1 runs) · --list
// Statics compare with baseRef("QC_SET1_BASE") (merge-base HEAD origin/session/hr), or merge-base(HEAD, session/hr) when that is newer (local integration branch)
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 QC_FORCE=1 pnpm exec tsx scripts/qc-hr-set-1.mts
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  type Any, type Base, type Sev, ROOT, rd, short, errText, sleep, failedKeys, stripComments, canon, sha, srcFiles,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, commitInBase, pathInBase, changedVsBase, diffHunks, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, fitnessNoEnv, tagOf,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-set-1";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-set1-";
const H = "src/lib/modules/hr/";
const HELPER = `${H}settings-lock.ts`;
const W = {
  ot: `${H}ot.ts`, life: `${H}lifecycle.ts`, clock: `${H}clock-settings.ts`, judge: `${H}judge.ts`, work: `${H}work-entries.ts`,
  payroll: `${H}payroll.ts`, attpay: `${H}attendance-pay.ts`, reports: `${H}reports.ts`,
} as const;
/** writer functions (file · function name) that must go through the helper */
const FNS: [string, string][] = [
  [W.ot, "saveOtPolicy"], [W.life, "saveLifecyclePolicy"], [W.clock, "saveClockPolicy"], [W.clock, "saveAttendancePolicy"], [W.judge, "saveCursor"],
  [W.work, "setNormalMinutesPerDay"], [W.payroll, "setPayrollEngine"], [W.attpay, "saveAttendancePayPolicy"], [W.reports, "setReportSettings"],
  [W.payroll, "h37WritePaySetting"], // fix round (controller F1): H3.7's default-pay-account writer (merged from session/hr aa380f6b0)
];
/** explicit allowlist of hr/** files that may write AppSystem.settings without the helper — EMPTY by default (adding a file = an ORACLE-EDIT with a reason) */
const ALLOW: string[] = [];
const MARK = /HR-SET-1/;

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R1|C|R|[static] helper settings-lock.ts: exports lockHrSettings + writeHrSettingsKeys · advisory hr:clockpolicy:<sys> before the caller's own keys before the AppSystem row FOR UPDATE (id · tenantId · type HR) · writer re-reads under the row lock and changes only the patch keys · type-only imports
S1.2|R4|C|R|[static] fitness: every src/lib/modules/hr/** file that writes AppSystem settings (appSystem.update/updateMany/upsert with settings · raw UPDATE "AppSystem") is settings-lock.ts or on the explicit allowlist (empty)
S1.3|R2 R3|C|R|[static] each writer fn (OT · lifecycle · clock ×2 · judge cursor · work entries · payroll engine · attendance-pay · report settings · H3.7 pay account) calls lockHrSettings + writeHrSettingsKeys and has no own appSystem settings read/write · OT/lifecycle/attendance-pay pass their own key (hr:otpolicy · hr:lifepolicy · policyLockKey) to the helper
S1.4|R1|C|R|[static] lock order: outside settings-lock.ts no hr/** code takes hr:clockpolicy, hr:otpolicy, hr:lifepolicy or the exclusive hr:attpay:policy itself, and nothing locks the AppSystem row FOR UPDATE
S1.5|R2 R3|C|R|[static] hunks: every hunk in the 8 writer files vs base carries "HR-SET-1" · ot.ts + lifecycle.ts have ≥ 1 · payroll.ts removed lines ⊆ the stale lock/read/write lines (n/a once the helper is in the base)
S1.6|frozen|C|G|[static] [control] payroll-rules sha · prisma/ and law.ts unchanged vs base · helper has no law-table / payroll-rules access
S2.1|R2|C|R|[db] OT policy (saveOtPolicy): A clock-lock · B row-lock · C hr:otpolicy — blocked, then writer key hrOt + marker both survive (×2 each)
S2.2|R2|C|R|[db] lifecycle policy (saveLifecyclePolicy): A · B · C hr:lifepolicy — blocked, hrLifecycle + marker survive (×2 each)
S2.3|R3|C|R|[db] clock policy (saveClockPolicy): A · B — blocked, hrClock + marker survive (×2 each)
S2.4|R3|C|R|[db] attendance policy (saveAttendancePolicy): A · B — blocked, hrAttendance + marker survive (×2 each)
S2.5|R3|C|R|[db] work entries (setNormalMinutesPerDay): A · B — blocked, hrWork + marker survive (×2 each)
S2.6|R3|C|R|[db] payroll engine (setPayrollEngine v1): A · B — blocked, hrPayroll + marker survive (×2 each)
S2.7|R3|C|R|[db] attendance-pay (saveAttendancePayPolicy): A · B · C hr:attpay:policy — blocked, hrAttendancePay + marker survive (×2 each)
S2.8|R3|C|G|[db] [control] report settings (setReportSettings OFF): A · B — blocked, hrReports + marker survive (×2 each)
S2.9|R3|C|R|[db] judge cursor (runAttendanceJobs maxPages 1 → saveCursor): A · B — blocked, hrAttendanceCursor + marker survive (×2 each)
S2.10|R3|C|R|[db] H3.7 default pay account (setPayrollPayAccount null → h37WritePaySetting): A · B — blocked, hrPayroll.payFinanceAccountId cleared + other hrPayroll keys + marker survive (×2 each)
S3.1|R1|C|R|[db] no deadlock / no lost update: OT + report settings concurrently ×10 — both ok, both keys = round values (base: lost updates by race)
S3.2|R1|C|R|[db] no deadlock / no lost update: lifecycle + report settings concurrently ×10 (base: lost updates by race)
S3.3|R1|C|G|[db] no deadlock / no lost update: clock policy + attendance-pay concurrently ×10
S4.1|pin|C|G|[db] [control] audit rows unchanged in shape (1 row per save · action · targetType AppSystem · targetId · actor · before/after keys) + same return values for all 8 entry points · all 8 keys coexist
S4.2|pin|C|G|[db] [control] OT save refusals unchanged (noPermission · shopWide · sAfter · sAhead · sRound) · nothing written · no audit · all-branch HR admin ok
S4.3|pin|C|G|[db] [control] lifecycle save refusals unchanged (noPermission · shopWide · lead · template · failed · board · ownerSwitch) · nothing written · no audit · owner ok
S4.4|R1|C|R|[db] misuse refused (review m2): writeHrSettingsKeys in a tx that did not call lockHrSettings throws and writes nothing · after lockHrSettings in the same tx it writes (positive control)
X1|X12|M|G|[run] fitness + fitness-hr without env ⇒ exit 0
Z1|house|C|G|no residue (opsEvent included)
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`SET-1-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "SET-1-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, HELPER))) skipReasons.push(`${HELPER} absent (HR-SET-1 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);

// base: env override · else merge-base(HEAD, origin/session/hr) · the local integration branch session/hr wins when it is newer (merges not pushed yet)
const BASE0 = baseRef("QC_SET1_BASE");
const LOCAL_MB = (() => {
  try {
    return execFileSync("git", ["merge-base", "HEAD", "session/hr"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
})();
const BASE = !process.env.QC_SET1_BASE && LOCAL_MB && (!BASE0 || (LOCAL_MB !== BASE0 && commitInBase(BASE0, LOCAL_MB))) ? LOCAL_MB : BASE0;
const IN_BASE = pathInBase(HELPER, BASE);
const code = (p: string) => stripComments(rd(p));
/** body of `function name(` … up to the next top-level "\n}" */
const fnBody = (src: string, name: string) => {
  const i = src.search(new RegExp(`(async\\s+)?function\\s+${name}\\s*\\(`));
  if (i < 0) return "";
  const j = src.indexOf("\n}", i);
  return src.slice(i, j < 0 ? undefined : j + 2);
};
/** text of a call starting at index i (balanced parentheses, max 2000 chars) */
const callText = (s: string, i: number) => {
  const o = s.indexOf("(", i);
  let d = 0;
  for (let k = o; k < Math.min(s.length, o + 2000); k++) {
    if (s[k] === "(") d++;
    else if (s[k] === ")" && --d === 0) return s.slice(i, k + 1);
  }
  return s.slice(i, o + 2000);
};
/** hr/** files that write AppSystem.settings (independent scanner — never the code under test) */
function settingsWriters(): { file: string; hits: string[] }[] {
  const out: { file: string; hits: string[] }[] = [];
  for (const f of srcFiles(H.replace(/\/$/, ""))) {
    const s = code(f);
    const hits: string[] = [];
    for (const m of s.matchAll(/\bappSystem\s*\.\s*(update|updateMany|upsert)\s*\(/g)) if (/\bsettings\b/.test(callText(s, m.index!))) hits.push(m[1]!);
    if (/UPDATE\s+"AppSystem"/i.test(s)) hits.push("raw UPDATE");
    if (hits.length) out.push({ file: f, hits });
  }
  return out;
}

// ═════════════════════════ static ═════════════════════════
function runStatic(): void {
  console.log(`── [static] base ${BASE.slice(0, 9)}${IN_BASE ? " (HR-SET-1 in base)" : ""} ──`);
  // S1.1
  {
    const src = code(HELPER);
    const raw = rd(HELPER);
    const lk = fnBody(src, "lockHrSettings");
    const wr = fnBody(src, "writeHrSettingsKeys");
    const iClock = lk.search(/hr:clockpolicy:/);
    const iFor = lk.search(/FOR UPDATE/);
    const forQ = iFor >= 0 ? lk.slice(Math.max(0, lk.lastIndexOf("`", iFor - 1) - 400), iFor + 12) : "";
    const imps = [...raw.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)];
    const r = {
      exists: src.length > 0,
      exports: /export\s+async\s+function\s+lockHrSettings\b/.test(src) && /export\s+async\s+function\s+writeHrSettingsKeys\b/.test(src),
      clockFirst: iClock >= 0 && iFor > iClock && /pg_advisory_xact_lock/.test(lk.slice(0, iFor)),
      ownBetween: /pg_advisory_xact_lock/.test(lk.slice(iClock + 1, iFor)) && /\bfor\s*\(/.test(lk.slice(iClock, iFor)),
      rowLock: /"AppSystem"/.test(forQ) && /"id"/.test(forQ) && /"tenantId"/.test(forQ) && /'HR'/.test(forQ),
      writerRereads: /FOR UPDATE/.test(wr) && /\bfindFirst\b|\$queryRaw/.test(wr) && /\bupdateMany\b/.test(wr) && /delete\s+\w+\[/.test(wr),
      typeOnly: imps.every((m) => !!m[1]),
    };
    ck("S1.1", r, "helper shape", `imports=${imps.map((m) => m[2]).join(",") || "∅"}`);
  }
  // S1.2
  {
    const w = settingsWriters();
    const bad = w.filter((x) => x.file !== HELPER && !ALLOW.includes(x.file));
    chk("S1.2", bad.length === 0 && ALLOW.length === 0, "only settings-lock.ts writes (allowlist empty)", bad.map((x) => `${x.file.replace(H, "")}:${x.hits.join("+")}`).join(" ") || `ok (${w.map((x) => x.file.replace(H, "")).join(",") || "∅"})`);
  }
  // S1.3
  {
    const bad: string[] = [];
    for (const [f, fn] of FNS) {
      const b = fnBody(code(f), fn);
      if (!b) {
        bad.push(`${fn}:∅`);
        continue;
      }
      if (!/\blockHrSettings\s*\(/.test(b)) bad.push(`${fn}:noLock`);
      if (!/\bwriteHrSettingsKeys\s*\(/.test(b)) bad.push(`${fn}:noWrite`);
      if (/appSystem\s*\.\s*(update|updateMany|upsert)\s*\(/.test(b)) bad.push(`${fn}:ownWrite`);
      if (/appSystem\s*\.\s*findFirst\s*\([^]*?settings\s*:\s*true/.test(b) && !/lockHrSettings/.test(b.slice(0, b.search(/appSystem\s*\.\s*findFirst/)))) bad.push(`${fn}:readBeforeLock`);
    }
    const own = (f: string, fn: string, re: RegExp) => {
      const b = fnBody(code(f), fn);
      const m = b.match(/lockHrSettings\s*\(([^;]*)\)/);
      if (!m || !re.test(m[1]!)) bad.push(`${fn}:ownKey`);
    };
    own(W.ot, "saveOtPolicy", /hr:otpolicy:/);
    own(W.life, "saveLifecyclePolicy", /hr:lifepolicy:/);
    own(W.attpay, "saveAttendancePayPolicy", /policyLockKey\s*\(/);
    chk("S1.3", bad.length === 0, `${FNS.length} writer fns via helper`, bad.join(" ") || "ok");
  }
  // S1.4
  {
    const bad: string[] = [];
    for (const f of srcFiles(H.replace(/\/$/, ""))) {
      if (f === HELPER) continue;
      const lines = code(f).split("\n");
      lines.forEach((l, i) => {
        const at = `${f.replace(H, "")}:${i + 1}`;
        if (/hr:clockpolicy/.test(l)) bad.push(`${at}:clockpolicy`);
        if (/hr:(otpolicy|lifepolicy)/.test(l) && !/lockHrSettings\s*\(/.test(l)) bad.push(`${at}:ownKeyLockedOutsideHelper`);
        if (/\block\s*\(\s*\w+\s*,\s*policyLockKey/.test(l)) bad.push(`${at}:attpayExclusive`);
        if (/FOR\s+(NO\s+KEY\s+)?UPDATE/.test(l) && /"AppSystem"/.test(l)) bad.push(`${at}:rowLock`);
      });
    }
    chk("S1.4", bad.length === 0, "lock acquisitions only in the helper", bad.join(" ") || "ok");
  }
  // S1.5
  if (IN_BASE) chk("S1.5", true, "marked hunks", "n/a · HR-SET-1 in base");
  else {
    const bad: string[] = [];
    for (const f of Object.values(W)) {
      const hs = diffHunks(BASE, f);
      if (!hs) {
        bad.push(`${f}:git`);
        continue;
      }
      if ((f === W.ot || f === W.life) && hs.length === 0) bad.push(`${f.replace(H, "")}:noHunk`);
      hs.forEach((h, i) => {
        if (!h.added.some((l) => MARK.test(l))) bad.push(`${f.replace(H, "")}#${i}:unmarked`);
      });
      if (f === W.payroll)
        for (const h of hs)
          for (const l of h.removed)
            if (!/pg_advisory_xact_lock\(hashtextextended\(\$\{`hr:clockpolicy:|appSystem\.findFirst\(\{ where: \{ id: ctx\.systemId, tenantId: ctx\.tenantId, type: "HR" \}, select: \{ id: true, settings: true \} \}\)|appSystem\.updateMany\(\{ where: \{ id: sys\.id, tenantId: ctx\.tenantId \}, data: \{ settings: base|const base = h37Obj\(sys\.settings\);|base\[PAYROLL_SETTINGS_KEY\] = \{ \.\.\.h37Obj\(base\[PAYROLL_SETTINGS_KEY\]\), \[H37_PAY_KEY\]: value \};/.test(l))
              bad.push(`payroll.ts:removed '${short(l.trim(), 60)}'`);
    }
    chk("S1.5", bad.length === 0, "marked hunks only", bad.join(" ") || "ok");
  }
  // S1.6
  {
    const helper = code(HELPER);
    const r = {
      rulesSha: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA,
      prisma: changedVsBase(BASE, ["prisma"]) === "unchanged",
      law: changedVsBase(BASE, [`${H}law.ts`]) === "unchanged",
      helperNoLaw: !/HrLawTable|hrLawTable|payroll-rules|loadLawSet/.test(helper),
    };
    ck("S1.6", r, "frozen", `prisma=${changedVsBase(BASE, ["prisma"])}`);
  }
}

// ═════════════════════════ db ═════════════════════════
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const imp = async (spec: string): Promise<Any> => (await import(spec).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const M = {
  ot: await imp("@/lib/modules/hr/ot"), otRules: await imp("@/lib/modules/hr/ot-rules"), life: await imp("@/lib/modules/hr/lifecycle"),
  clock: await imp("@/lib/modules/hr/clock-settings"), judge: await imp("@/lib/modules/hr/judge"), work: await imp("@/lib/modules/hr/work-entries"),
  payroll: await imp("@/lib/modules/hr/payroll"), attpay: await imp("@/lib/modules/hr/attendance-pay"), attRules: await imp("@/lib/modules/hr/attendance-pay-rules"),
  reports: await imp("@/lib/modules/hr/reports"), settings: await imp("@/lib/modules/hr/settings"), helper: await imp("@/lib/modules/hr/settings-lock"),
};
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
for (const [k, m] of Object.entries(M)) if (m?.__err) console.log(`⚠ import ${k}: ${m.__err}`);
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const MARKER = "qcSet1Marker";
type Ctx = { tenantId: string; systemId: string };
const REAL_CONSOLE = { log: console.log, info: console.info, warn: console.warn, error: console.error };
/** call a module fn: never throws · console of the code under test muted · result or { __throw } */
async function call(m: Any, fn: string, ...a: unknown[]): Promise<Any> {
  if (typeof m?.[fn] !== "function") return { __throw: `∅${fn}` };
  const mute = () => {};
  Object.assign(console, { log: mute, info: mute, warn: mute, error: mute });
  try {
    return await m[fn](...a);
  } catch (e) {
    return { __throw: errText(e) };
  } finally {
    Object.assign(console, REAL_CONSOLE);
  }
}
const settingsOf = async (sysId: string): Promise<Any> => ((await P.appSystem.findFirst({ where: { id: sysId }, select: { settings: true } }))?.settings ?? {}) as Any;
const setRaw = (sysId: string, s: Any) => P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = $1::jsonb WHERE "id" = $2`, JSON.stringify(s), sysId);
const okRes = (r: Any) => !!r && !r.__throw && r.ok !== false;

type Mode = "A" | "B" | "C";
/**
 * one deterministic lost-update round: raw tx holds the lock of `mode` and reads settings · `start` begins · it must be blocked BY the raw tx
 * (pg_blocking_pids) and still pending 400 ms later · raw tx writes stale + marker and commits · writer completes · return what happened
 */
async function round(sysId: string, mode: Mode, ownKey: string | null, k: number, start: () => Promise<Any>): Promise<{ blocked: boolean; res: Any; s: Any; err: string }> {
  let settled = false;
  let p: Promise<Any> | null = null;
  let blocked = false;
  let err = "";
  try {
    await P.$transaction(
      async (tx: Any) => {
        if (mode === "A") await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, `hr:clockpolicy:${sysId}`);
        if (mode === "C") await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, ownKey);
        const rows = (await tx.$queryRawUnsafe(`SELECT "settings", pg_backend_pid() AS "pid" FROM "AppSystem" WHERE "id" = $1${mode === "B" ? " FOR UPDATE" : ""}`, sysId)) as Any[];
        const stale = (rows[0]?.settings ?? {}) as Any;
        const pid = Number(rows[0]?.pid);
        p = start().then(
          (x) => ((settled = true), x),
          (e) => ((settled = true), { __throw: errText(e) }),
        );
        let seen = false;
        for (let i = 0; i < 160 && !settled && !seen; i++) {
          await sleep(50);
          const w = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, pid).catch(() => null)) as Any[] | null;
          seen = Number(w?.[0]?.n ?? 0) > 0;
        }
        await sleep(400);
        blocked = seen && !settled;
        await tx.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = $1::jsonb WHERE "id" = $2`, JSON.stringify({ ...stale, [MARKER]: k }), sysId);
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (e) {
    err = errText(e);
  }
  const res = p ? await (p as Promise<Any>) : null;
  return { blocked, res, s: await settingsOf(sysId), err };
}
type Writer = { id: string; ctx: Ctx; modes: Mode[]; own: string | null; prep?: (k: number) => Promise<unknown>; run: (k: number) => Promise<Any>; key: (s: Any, k: number) => boolean };
async function lostUpdate(w: Writer): Promise<void> {
  const out: string[] = [];
  let ok = true;
  let k = 0;
  for (const mode of w.modes)
    for (let rep = 0; rep < 2; rep++, k++) {
      if (w.prep) await w.prep(k);
      const r = await round(w.ctx.systemId, mode, w.own, k, () => w.run(k));
      const good = okRes(r.res) && r.blocked && w.key(r.s, k) && r.s?.[MARKER] === k && !r.err;
      if (!good) ok = false;
      out.push(`${mode}${rep}:${good ? "ok" : `blocked=${r.blocked} res=${okRes(r.res) ? "ok" : short(r.res?.reason ?? r.res?.__throw ?? r.res, 50)} key=${w.key(r.s, k)} marker=${r.s?.[MARKER] === k}${r.err ? ` err=${r.err.slice(0, 50)}` : ""}`}`);
    }
  chk(w.id, ok, `${w.modes.join("·")} ×2 blocked · key + marker survive`, out.join(" "));
}
/** run with a hard ceiling — an app-level wait cycle shows up as TIMEOUT instead of hanging the suite */
const within = <R,>(p: Promise<R>, ms = 45_000) => Promise.race([p, sleep(ms).then(() => ({ __throw: "TIMEOUT" }) as Any)]);

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR SET-1");
  const u1 = await fx.newUnit(TT, "QC SET1 สาขาหนึ่ง", "u1");
  const sys = async (n: string) => (await sysSvc.createSystem(TT, "HR", `${n} ${tag}`)).id as string;
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(TT, t, `QC SET1 ${t} ${tag}`, r, ua, p);
  const owner = await mk("owner", "OWNER", [], {});
  const adminAll = await mk("adminall", "STAFF", ["*"], { "hr.employee.create": true });
  const adminU1 = await mk("adminu1", "STAFF", [u1], { "hr.employee.create": true });
  const staff = await mk("staff", "STAFF", [], {});
  const O = vOf(owner);
  const ctxOf = async (n: string): Promise<Ctx> => ({ tenantId: TT, systemId: await sys(n) });
  const S = {
    ot: await ctxOf("ot"), life: await ctxOf("life"), clock: await ctxOf("clock"), att: await ctxOf("att"), work: await ctxOf("work"),
    eng: await ctxOf("engine"), attpay: await ctxOf("attpay"), rep: await ctxOf("reports"), judge: await ctxOf("judge"), pay: await ctxOf("payacct"),
  };
  // judge: 2 active employees, nothing scheduled (nothing due ⇒ the job writes only the cursor) · pageSize 1 + maxPages 1 ⇒ cut after one ⇒ saveCursor(ids[1])
  const jIds = [await fx.mkEmp(TT, S.judge.systemId, `QC SET1 เจ หนึ่ง ${tag}`), await fx.mkEmp(TT, S.judge.systemId, `QC SET1 เจ สอง ${tag}`)].sort();
  const SENT = "zz-qc-set1-sentinel";
  const jNow = new Date("2032-03-10T03:00:00.000Z");
  const W8: Writer[] = [
    { id: "S2.1", ctx: S.ot, modes: ["A", "B", "C"], own: `hr:otpolicy:${S.ot.systemId}`, run: (k) => call(M.ot, "saveOtPolicy", S.ot, O, { afterHours: 10 + k }), key: (s, k) => s?.hrOt?.afterHours === 10 + k },
    { id: "S2.2", ctx: S.life, modes: ["A", "B", "C"], own: `hr:lifepolicy:${S.life.systemId}`, run: (k) => call(M.life, "saveLifecyclePolicy", S.life, O, { probationLeadDays: 10 + k }), key: (s, k) => s?.hrLifecycle?.probationLeadDays === 10 + k },
    { id: "S2.3", ctx: S.clock, modes: ["A", "B"], own: null, run: (k) => call(M.clock, "saveClockPolicy", S.clock, O, { earlyInMin: 10 + k }), key: (s, k) => s?.hrClock?.earlyInMin === 10 + k },
    { id: "S2.4", ctx: S.att, modes: ["A", "B"], own: null, run: (k) => call(M.clock, "saveAttendancePolicy", S.att, O, { notInAlertMin: 10 + k }), key: (s, k) => s?.hrAttendance?.notInAlertMin === 10 + k },
    { id: "S2.5", ctx: S.work, modes: ["A", "B"], own: null, run: (k) => call(M.work, "setNormalMinutesPerDay", S.work, O, 400 + k), key: (s, k) => s?.hrWork?.normalMinutesPerDay === 400 + k },
    { id: "S2.6", ctx: S.eng, modes: ["A", "B"], own: null, run: (k) => call(M.payroll, "setPayrollEngine", S.eng, O, { engineVersion: 1, catCapBp: 500 + k }), key: (s, k) => s?.hrPayroll?.catCapBp === 500 + k && s?.hrPayroll?.engineVersion === 1 },
    { id: "S2.7", ctx: S.attpay, modes: ["A", "B", "C"], own: `hr:attpay:policy:${S.attpay.systemId}`, run: (k) => call(M.attpay, "saveAttendancePayPolicy", S.attpay, O, { freeMin: 10 + k }), key: (s, k) => s?.hrAttendancePay?.freeMin === 10 + k },
    {
      id: "S2.8", ctx: S.rep, modes: ["A", "B"], own: null,
      prep: () => call(M.reports, "setReportSettings", S.rep, O, { registerFullId: true, acknowledge: true }),
      run: () => call(M.reports, "setReportSettings", S.rep, O, { registerFullId: false }), key: (s) => s?.hrReports?.registerFullId === false,
    },
    {
      id: "S2.9", ctx: S.judge, modes: ["A", "B"], own: null,
      prep: async () => setRaw(S.judge.systemId, { ...(await settingsOf(S.judge.systemId)), hrAttendanceCursor: SENT }),
      run: async () => {
        const r = await call(M.judge, "runAttendanceJobs", { now: jNow, tenantId: TT, pageSize: 1, maxPages: 1 });
        return r?.__throw ? r : { ok: true };
      },
      key: (s) => s?.hrAttendanceCursor === jIds[1],
    },
    {
      // H3.7 writer: owner clears the default pay account (null needs no linked book) · planted hrPayroll keys must survive next to the cleared one
      id: "S2.10", ctx: S.pay, modes: ["A", "B"], own: null,
      prep: async (k) => setRaw(S.pay.systemId, { ...(await settingsOf(S.pay.systemId)), hrPayroll: { engineVersion: 1, catCapBp: 700 + k, payFinanceAccountId: "zz-qc-set1-pay" } }),
      run: () => call(M.payroll, "setPayrollPayAccount", S.pay, O, { financeAccountId: null }),
      key: (s, k) => !!s?.hrPayroll && s.hrPayroll.payFinanceAccountId === null && s.hrPayroll.catCapBp === 700 + k && s.hrPayroll.engineVersion === 1,
    },
  ];
  console.log("── [db] deterministic lost-update rounds ──");
  for (const w of W8) await lostUpdate(w);

  // S3 · concurrency pairs (no deadlock · both keys)
  console.log("── [db] concurrent pairs ──");
  const pair = async (id: string, c: Ctx, a: (k: number) => Promise<Any>, b: (k: number) => Promise<Any>, keys: (s: Any, k: number) => Record<string, boolean>) => {
    const bad: string[] = [];
    const t0 = Date.now();
    for (let k = 0; k < 10; k++) {
      const [ra, rb] = await Promise.all([within(a(k)), within(b(k))]);
      const s = await settingsOf(c.systemId);
      const kk = keys(s, k);
      if (!okRes(ra) || !okRes(rb) || !Object.values(kk).every(Boolean)) bad.push(`r${k}:a=${okRes(ra) ? "ok" : short(ra?.reason ?? ra?.__throw, 40)} b=${okRes(rb) ? "ok" : short(rb?.reason ?? rb?.__throw, 40)} ${failedKeys(kk)}`);
    }
    chk(id, bad.length === 0, "10 rounds ok · both keys", bad.join(" ") || `ok ${Date.now() - t0} ms`);
  };
  const P1 = await ctxOf("pair-ot");
  await pair("S3.1", P1, (k) => call(M.ot, "saveOtPolicy", P1, O, { afterHours: 20 + k }), (k) => call(M.reports, "setReportSettings", P1, O, { registerFullId: k % 2 === 0, acknowledge: true }),
    (s, k) => ({ ot: s?.hrOt?.afterHours === 20 + k, rep: s?.hrReports?.registerFullId === (k % 2 === 0) }));
  const P2 = await ctxOf("pair-life");
  await pair("S3.2", P2, (k) => call(M.life, "saveLifecyclePolicy", P2, O, { contractLeadDays: 20 + k }), (k) => call(M.reports, "setReportSettings", P2, O, { registerFullId: k % 2 === 0, acknowledge: true }),
    (s, k) => ({ life: s?.hrLifecycle?.contractLeadDays === 20 + k, rep: s?.hrReports?.registerFullId === (k % 2 === 0) }));
  const P3 = await ctxOf("pair-clock");
  await pair("S3.3", P3, (k) => call(M.clock, "saveClockPolicy", P3, O, { closeGraceMin: 60 + k }), (k) => call(M.attpay, "saveAttendancePayPolicy", P3, O, { freeMin: 20 + k }),
    (s, k) => ({ clock: s?.hrClock?.closeGraceMin === 60 + k, attpay: s?.hrAttendancePay?.freeMin === 20 + k }));

  // S4.1 · audit shape + return values
  console.log("── [db] pins ──");
  {
    const c = await ctxOf("audit");
    const id = c.systemId;
    const rets: Record<string, Any> = {
      ot: await call(M.ot, "saveOtPolicy", c, O, { afterHours: 3, maxAheadDays: 7, otRoundMin: 15 }),
      life: await call(M.life, "saveLifecyclePolicy", c, O, { probationLeadDays: 5 }),
      clock: await call(M.clock, "saveClockPolicy", c, O, { earlyInMin: 30 }),
      att: await call(M.clock, "saveAttendancePolicy", c, O, { notInAlertMin: 15 }),
      work: await call(M.work, "setNormalMinutesPerDay", c, O, 450),
      eng: await call(M.payroll, "setPayrollEngine", c, O, { engineVersion: 1, catCapBp: 900 }),
      attpay: await call(M.attpay, "saveAttendancePayPolicy", c, O, { freeMin: 5 }),
      rep: await call(M.reports, "setReportSettings", c, O, { registerFullId: true, acknowledge: true }),
    };
    const polKeys = Object.keys(M.attRules?.attendancePayPolicyOf?.(undefined) ?? {});
    const SHAPE: [string, string, string[], string[] | null][] = [
      ["ot", "hr.settings.ot-policy.update", ["systemId", "afterHours", "maxAheadDays", "otRoundMin"], null],
      ["life", "hr.settings.lifecycle.update", ["systemId", "fields"], null],
      ["clock", "hr.settings.clock-policy.update", ["systemId", "earlyInMin", "closeGraceMin"], null],
      ["att", "hr.settings.attendance-policy.update", ["systemId", "notInAlertMin", "absentAfterMin", "earlyOutGraceMin", "flagEarlyOut", "otStepMin", "alertsOn", "alertEmployee"], null],
      ["work", "hr.settings.work.update", ["systemId", "normalMinutesPerDay"], null],
      ["eng", "hr.payroll.engine", ["engineVersion", "catCapBp", "totalCapBp"], ["engineVersion", "catCapBp", "totalCapBp"]],
      ["attpay", "hr.attpay.policy", ["systemId", ...polKeys, "inForce"], null],
      ["rep", "hr.report.setting", ["registerFullId"], null],
    ];
    const bad: string[] = [];
    for (const [k, action, after, before] of SHAPE) {
      const rows = (await P.auditLog.findMany({ where: { tenantId: TT, targetId: id, action } })) as Any[];
      const r0 = rows[0];
      const good = rows.length === 1 && r0.targetType === "AppSystem" && r0.actorType === "USER" && r0.actorId === owner.id &&
        canon(Object.keys(r0.after ?? {}).sort()) === canon([...after].sort()) && (before ? canon(Object.keys(r0.before ?? {}).sort()) === canon([...before].sort()) : r0.before === null);
      if (!good) bad.push(`${k}:rows=${rows.length} after=${Object.keys(r0?.after ?? {}).join("/")}`);
    }
    const s = await settingsOf(id);
    const ret = {
      ot: canon(rets.ot) === canon({ ok: true, id }), life: canon(rets.life) === canon({ ok: true, id }), clock: canon(rets.clock) === canon({ ok: true, id }),
      att: canon(rets.att) === canon({ ok: true, id }), work: canon(rets.work) === canon({ ok: true, id }), attpay: canon(rets.attpay) === canon({ ok: true, id }),
      eng: canon(rets.eng) === canon({ ok: true, engine: { engineVersion: 1, catCapBp: 900, totalCapBp: 2000 }, warnings: [] }),
      rep: canon(rets.rep) === canon({ ok: true, registerFullId: true }),
      lifeFields: canon(((await P.auditLog.findFirst({ where: { tenantId: TT, targetId: id, action: "hr.settings.lifecycle.update" } })) as Any)?.after?.fields) === canon(["probationLeadDays"]),
      coexist: s?.hrOt?.afterHours === 3 && s?.hrLifecycle?.probationLeadDays === 5 && s?.hrClock?.earlyInMin === 30 && s?.hrAttendance?.notInAlertMin === 15 &&
        s?.hrWork?.normalMinutesPerDay === 450 && s?.hrPayroll?.catCapBp === 900 && s?.hrAttendancePay?.freeMin === 5 && s?.hrReports?.registerFullId === true,
    };
    ck("S4.1", { audit: bad.length === 0, ...ret }, "audit shape + returns", `${bad.join(" ")} rets=${short(Object.entries(rets).filter(([, v]) => !okRes(v)).map(([k, v]) => `${k}:${v?.reason ?? v?.__throw}`), 160)}`);
  }
  // S4.2 · OT refusals
  {
    const c = await ctxOf("ot-pin");
    const ST = M.settings?.SETTINGS_TEXT ?? {};
    const OT = M.otRules?.OT_TEXT ?? {};
    await setRaw(c.systemId, { keep: 1 });
    const before = canon(await settingsOf(c.systemId));
    const cases: [string, Any, Any, string][] = [
      ["staff", vOf(staff), { afterHours: 2 }, ST.noPermission], ["branch", vOf(adminU1), { afterHours: 2 }, ST.shopWide],
      ["after", O, { afterHours: 99 }, OT.sAfter], ["afterText", O, { afterHours: "x" }, OT.sAfter], ["ahead", O, { maxAheadDays: 0 }, OT.sAhead], ["round", O, { otRoundMin: 7 }, OT.sRound],
    ];
    const bad: string[] = [];
    for (const [n, v, inp, want] of cases) {
      const r = await call(M.ot, "saveOtPolicy", c, v, inp);
      if (!(r?.ok === false && typeof want === "string" && want && r.reason === want && canon(Object.keys(r).sort()) === canon(["ok", "reason"]))) bad.push(`${n}:${short(r, 60)}`);
    }
    const same = canon(await settingsOf(c.systemId)) === before;
    const noAudit = (await P.auditLog.count({ where: { tenantId: TT, targetId: c.systemId } })) === 0;
    const okAll = await call(M.ot, "saveOtPolicy", c, vOf(adminAll), { afterHours: 4 });
    const after = await settingsOf(c.systemId);
    ck("S4.2", { refusals: bad.length === 0, same, noAudit, adminAll: canon(okAll) === canon({ ok: true, id: c.systemId }) && after?.hrOt?.afterHours === 4 && after?.keep === 1 }, "OT refusals pinned", bad.join(" "));
  }
  // S4.3 · lifecycle refusals
  {
    const c = await ctxOf("life-pin");
    const ST = M.settings?.SETTINGS_TEXT ?? {};
    const LT = M.life?.LIFE_TEXT ?? {};
    await setRaw(c.systemId, { keep: 2 });
    const before = canon(await settingsOf(c.systemId));
    const cases: [string, Any, Any, string][] = [
      ["staff", vOf(staff), { probationLeadDays: 3 }, ST.noPermission], ["branch", vOf(adminU1), { probationLeadDays: 3 }, ST.shopWide],
      ["lead", O, { probationLeadDays: 999 }, LT.lead], ["template", O, { onboardingTemplate: [] }, LT.template], ["assign", O, { assignTo: "X" }, ST.failed],
      ["board", O, { kanban: { enabled: true } }, LT.board], ["ownerSwitch", vOf(adminAll), { autoRevokePin: false }, LT.ownerSwitch],
    ];
    const bad: string[] = [];
    for (const [n, v, inp, want] of cases) {
      const r = await call(M.life, "saveLifecyclePolicy", c, v, inp);
      if (!(r?.ok === false && typeof want === "string" && want && r.reason === want && canon(Object.keys(r).sort()) === canon(["ok", "reason"]))) bad.push(`${n}:${short(r, 60)}`);
    }
    const same = canon(await settingsOf(c.systemId)) === before;
    const noAudit = (await P.auditLog.count({ where: { tenantId: TT, targetId: c.systemId } })) === 0;
    const okOwner = await call(M.life, "saveLifecyclePolicy", c, O, { autoRevokePin: false });
    const after = await settingsOf(c.systemId);
    ck("S4.3", { refusals: bad.length === 0, same, noAudit, owner: canon(okOwner) === canon({ ok: true, id: c.systemId }) && after?.hrLifecycle?.autoRevokePin === false && after?.keep === 2 }, "lifecycle refusals pinned", bad.join(" "));
  }
  // S4.4 · misuse of the writer without the lock (review m2)
  {
    const c = await ctxOf("misuse");
    await setRaw(c.systemId, { keep: 4 });
    const before = canon(await settingsOf(c.systemId));
    let misuse = "";
    await P.$transaction(async (tx: Any) => {
      const r = await call(M.helper, "writeHrSettingsKeys", tx, c, { hrQcSet1: 1 });
      misuse = r?.__throw ? String(r.__throw) : `no throw ${short(r, 40)}`;
    }, { timeout: 20_000, maxWait: 10_000 }).catch((e: unknown) => (misuse = `tx: ${errText(e)}`));
    const same = canon(await settingsOf(c.systemId)) === before;
    let good: Any = null;
    await P.$transaction(async (tx: Any) => {
      const l = await call(M.helper, "lockHrSettings", tx, c);
      good = l?.__throw ? l : await call(M.helper, "writeHrSettingsKeys", tx, c, { hrQcSet1: 2 });
    }, { timeout: 20_000, maxWait: 10_000 }).catch((e: unknown) => (good = { __throw: errText(e) }));
    const after = await settingsOf(c.systemId);
    ck("S4.4", { throws: /lockHrSettings/.test(misuse) && !/^∅/.test(misuse), nothing: same, control: good?.count === 1 && after?.hrQcSet1 === 2 && after?.keep === 4 }, "misuse throws · control writes", `misuse=${short(misuse, 80)} control=${short(good, 50)}`);
  }
}

let crashed = "";
try {
  runStatic();
  const fz = await fitnessNoEnv();
  chk("X1", fz.ok, "exit 0 ×2", fz.note);
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  for (const tid of fx.tenants) {
    for (const t of ["HrAttendanceDeduction", "HrAttendanceDay"]) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => null);
    await P.opsEvent.deleteMany({ where: { tenantId: tid } }).catch(() => null);
  }
  await cleanupFx(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of fx.tenants) {
    const n = await P.opsEvent.count({ where: { tenantId: tid } }).catch(() => -1);
    if (n !== 0) left.push(`opsEvent=${n}`);
    for (const t of ["HrAttendanceDeduction", "HrAttendanceDay"]) {
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (r && Number(r[0]?.n) !== 0) left.push(`${t}=${r[0]?.n}`);
    }
  }
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
