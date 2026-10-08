// QC — AI TEAM (SHARK HUB v2) WO T0.2: data contract · mobile API spec · QC seed · QC env loader · fitness F16.1–F16.3
// Oracle writer · the T0.2 builder must NOT touch this file · QC4 database only (host ep-frosty-lab)
// Run (always this exact wrapper — QC_FORCE inside it):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-ai-t0.2.mts
//   (without QC_FORCE: SKIPPED + exit 0 while a deliverable below is missing · with QC_FORCE=1: every check runs, missing things are RED, no crash)
// requires: ai-team-seed   (this oracle ALSO runs the seed itself, twice — that is what S1 measures)
//
// SOURCES: ledger/ai-team-briefs/ai-brief-T0.2.md (+ Controller addendum 8 Oct) · ai-brief-COMMON.md · ai-brief-RESOLUTIONS.md (R-B · R-E C2 C7 C19 C21 C35)
//   · ledger/AI-TEAM-RUN.md §2 "T0.2" (S1 4 · S2 6 · S3 2 · S4 3 · S5 3 · S6 3 · S7 1 · S8 2 = 24 minimum) · §2 "T1.10" (route list)
//   · ledger/AI-TEAM-MASTER-PLAN.md §4 (X1 · X10) · §6 T1.1 (models/enums of the draft) · ledger/DESIGN-AI-TEAM.md §2 (36 screens)
//   · ledger/REVIEW-AI-TEAM-DESIGN-2026-10-08.md §1 §3 §7 (real names).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
// [1] scripts/ai-team-qc-env.mts — importing it has NO side effect (no env load, no DB connection, no output). Exports:
//       loadAiTeamQcEnv(): { databaseUrl: string; host: string; source: string }  (sync or async)
//         wraps the existing loader (scripts/acc-v2-env.mts#loadQcEnv). BEFORE anything else it parses DATABASE_URL and DIRECT_URL (env that
//         is already exported wins over the file, as today) and, when the HOSTNAME of either one does not start with `ep-frosty-lab`
//         (hostname — not a substring of the whole URL: `postgresql://ep-frosty-lab:x@ep-cool-shadow…/ep-frosty-lab` is refused), it
//         calls process.exit(4). It never prints the URL, the user, the password or the database name (a host label is allowed).
//       atIds(): AtIds | Promise<AtIds>   — resolved from the QC4 database by STABLE keys (tenant slug · user e-mail), never from a cached id:
//         type AtIds = { at1: string; at2: string; atx: string;                       // Tenant.id of the three seed tenants
//                        ownerUserId: string; approverUserId: string; staffUserId: string; otherOwnerUserId: string }   // User.id
//       withInjectedNow(...)              — helper for date-independent oracles (signature is the builder's; must be an exported function).
// [2] scripts/seed-ai-team-qc.mts — `pnpm exec tsx scripts/seed-ai-team-qc.mts` · loads env ONLY through loadAiTeamQcEnv() (no loadEnvFile,
//       no ".env") · exit 0 on success · idempotent by FIND-OR-CREATE (a second run adds no row and replaces no id) · writes ONLY under
//       tenant slug prefix `qc-ai-team-` and e-mail domain `@qc.shark` · never prints a URL or a secret. It creates:
//       tenants  slug `qc-ai-team-at1` (AT-1) · `qc-ai-team-at2` (AT-2) · `qc-ai-team-atx` (AT-X) — exactly these three carry the prefix
//       users    at-owner@qc.shark (OWNER of AT-1 and AT-2, nothing else) · ax-owner@qc.shark (OWNER of AT-X only)
//                at-nid@qc.shark   (AT-1 only · MANAGER · permissions JSON has "account.doc.approve": true and "crm.commission.approve": true)
//                at-staff@qc.shark (AT-1 only · STAFF · permissions JSON has "ai.chat.send": true and "ai.employee.use": true — the second
//                                   key is registered by T1.2; it is stored as-is today)
//                every Membership has acceptedAt set; AT-1 has exactly those 3 members, AT-2 exactly 1, AT-X exactly 1
//       systems  every tenant: one active AppSystem of each type ACCOUNT · CRM · CHAT · MEMBER · KANBAN
//       AT-1 data (all rows point at AT-1's own systems / members):
//         ≥ 20 CrmContact (archivedAt null) · ≥ 5 CrmDeal · ≥ 3 open invoices = AccountDocument docType INVOICE, direction OUT, docNo set,
//         status AWAITING_PAYMENT|PARTIAL, grandTotal > paidTotal · ≥ 3 customer chat threads waiting for a reply = ChatConversation status
//         OPEN, lastMessageDirection IN, with ≥ 1 ChatMessage direction IN · ≥ 3 active KbArticle over ≥ 2 categories · one active
//         ApprovalPolicy entityType "AccountDocument", thresholdSatang 2_000_000 (= 20,000 baht), ≥ 1 step.
// [3] scripts/fitness-ai-team.mts — no DB, no env needed · scans, relative to the root `FITNESS_AI_TEAM_ROOT` (default = repo root):
//       the i18n strings of src/messages/*/ai-team.json and apps/mobile/src/i18n/team.ts, and the zod response schemas (keys included) of
//       src/app/api/mobile/team/** — F16.1 fails when one of them contains token | โทเคน | บาทต่องาน | ค่าแรง | wage.
//       Missing files = pass with a note (ratchet). F16.2 and F16.3 always report.
//       Output: one line per check containing `[F16.n]` · last line `JSON_SUMMARY {"total":n,"passed":n,"findings":[{"id":"F16.1","sev":…,
//       "detail":"<names the offending file>"}]}` · exit 1 iff a CRITICAL/MAJOR finding (same as scripts/fitness.mts).
// [4] prisma draft — `prisma/schema/ai_team.prisma` (brief) or `prisma/drafts/ai_team.prisma` (see OQ-2 in ledger/wo-notes/ai-t0.2-oracle.md:
//       a draft inside prisma/schema makes fitness F1.1/F8.1 CRITICAL). The oracle validates a temp copy of prisma/schema/*.prisma + the draft.
//       Models AiEmployee AiEmployeeManual AiEmployeeAccess AiKnowledgeGrant AiTask AiRoom AiRoomMember AiHandoffFlow AiTeachNote AiActionLog
//       AiEmployeeDaily AiSubscription AiPackBinding AiSaleNotify AiNotifyPref · enums AiPack(FREE STARTER PRO BUSINESS) AiAccessLevel(OFF READ
//       DRAFT AUTO) AiEmployeeStatus(ACTIVE PAUSED TERMINATED) AiTaskStatus(OPEN DONE ARCHIVED) AiOverflowMode(PAUSE WALLET ASK) · every model
//       except AiSubscription has `tenantId String` · AiSubscription has ownerUserId? tenantId? pack cycleStart cycleEnd allowanceMicro usedMicro
//       overflowMode status lastResetKey · AiPackBinding(tenantId @unique, subscriptionId, resolvedOwnerUserId) · AiTask(conversationId @unique,
//       aiEmployeeId) · @@unique([aiEmployeeId, version]) / ([aiEmployeeId, skillId]) / ([aiEmployeeId, day]) · no field named `employeeId` ·
//       no AiCreditSource · a comment block containing "T1.1 adds" that names AiProposal, AiScheduledTask, AiCreditTxn, AiSettings.
// [5] docs/api/AI-TEAM-MOBILE-API.md
//       (a) one section per route: a level-3 heading `### METHOD /api/mobile/…` (one method per heading; path params as [id]); the section
//           has the labelled lines `Auth:` `Permission:` `Request:` `Response:` `Errors:` `Rate limit:` (bold/bullets allowed), Auth names
//           requireMobile | requireMobileUser | mobileUser, and ≥ 1 fenced code block with the zod schema(s) (`z.`).
//       (b) ONE table whose header row has the cells `Screen` and `Routes`: exactly one row per screen id A1–A8 B1–B8 C1–C8 D1–D8 E1–E4
//           (first cell starts with the id; no ranges). The Routes cell lists ≥ 1 `METHOD /api/mobile/…` in backticks — each must have a
//           section (a) — or the literal `client-only` followed by a note (≥ 10 characters, in that cell or in a `Notes` column) saying
//           why no route is needed.
//       (c) sections exist for every route of AI-TEAM-RUN §2 T1.10 (list REQUIRED_ROUTES below), GET /api/mobile/me (mentions uiVersion),
//           GET /api/mobile/usage (frozen keys scope used limit pct warn degraded blocked resetAt balanceMicro), and ≥ 1 route under
//           /api/mobile/team containing each of: notify-prefs · people · packs · sale-notify · inbox/teach · actions · promotions · report ·
//           knowledge · rooms · flows. `GET /api/mobile/team/inbox` uses requireMobileUser (R-E C21).
//       (d) outside the /api/mobile/usage section no code block contains `…Micro` or `systemPrompt` (X10: the app gets percentages only).
// [6] docs/modules/30-ai-team.md (M1–M9 · the 18 files of src/lib/ai/team · the 8 refusal codes) · apps/mobile/qc/fixtures/ai-team/README.md
//       · scripts/qc-all.mts knows the marker `// requires: ai-team-seed` and runs scripts/seed-ai-team-qc.mts for it.
//
// HOUSE RULES: SKIP guard before any DB connection · the seed tenants are permanent (never deleted here) · the only rows this oracle creates
//   are one canary tenant + user tagged `qc-ai-t0.2-<rand>` (deleted in `finally`, S8 asserts 0 left) · temp files live in os.tmpdir() under
//   the same tag, never in the worktree · child output is never echoed raw (redacted) · last line JSON_SUMMARY · exit 1 iff a CRITICAL/MAJOR
//   check fails.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const THIS_FILE = "scripts/qc-ai-t0.2.mts";
const ENV_FILE = "scripts/ai-team-qc-env.mts";
const SEED_FILE = "scripts/seed-ai-team-qc.mts";
const FIT_FILE = "scripts/fitness-ai-team.mts";
const API_DOC = "docs/api/AI-TEAM-MOBILE-API.md";
const MOD_DOC = "docs/modules/30-ai-team.md";
const FIXTURE_README = "apps/mobile/qc/fixtures/ai-team/README.md";
const QC_ALL = "scripts/qc-all.mts";
const DRAFT_CANDIDATES = ["prisma/schema/ai_team.prisma", "prisma/drafts/ai_team.prisma"];
const SCHEMA_DIR = "prisma/schema";

const SLUG_PREFIX = "qc-ai-team-";
const SLUG = { at1: "qc-ai-team-at1", at2: "qc-ai-team-at2", atx: "qc-ai-team-atx" } as const;
const EMAIL = { owner: "at-owner@qc.shark", approver: "at-nid@qc.shark", staff: "at-staff@qc.shark", otherOwner: "ax-owner@qc.shark" } as const;
const ID_KEYS = ["at1", "at2", "atx", "ownerUserId", "approverUserId", "staffUserId", "otherOwnerUserId"] as const;
const SYSTEM_TYPES = ["ACCOUNT", "CRM", "CHAT", "MEMBER", "KANBAN"];
const QC4_HOST_MARK = "ep-frosty-lab";

const ARGV = process.argv.slice(2);
const S4_CHILD = ARGV.includes("--s4-child");
const FORCE = process.env.QC_FORCE === "1";

// ═══ S4 CHILD MODE — load the AI-team env loader under the (fake or real) env given by the parent; never touches the DB ═══
if (S4_CHILD) {
  if (!existsSync(ENV_FILE)) {
    console.log("S4CHILD MISSING");
    process.exit(3);
  }
  let mod: Any = null;
  try {
    mod = await import("./ai-team-qc-env.mts" as string);
  } catch (e) {
    console.log(`S4CHILD IMPORTERR ${e instanceof Error ? e.message : String(e)}`);
    process.exit(3);
  }
  if (typeof mod?.loadAiTeamQcEnv !== "function") {
    console.log("S4CHILD NOFN");
    process.exit(3);
  }
  try {
    await mod.loadAiTeamQcEnv();
  } catch (e) {
    // the message is printed on purpose: the parent checks that it carries no URL / credential
    console.log(`S4CHILD THREW ${e instanceof Error ? e.message : String(e)}`);
    process.exit(5);
  }
  const fns = ["loadAiTeamQcEnv", "atIds", "withInjectedNow"].filter((k) => typeof mod[k] === "function");
  console.log(`S4CHILD LOADED exports=${fns.join(",")}`);
  process.exit(0);
}

// ═══ SKIP guard — a deliverable the oracle must execute is missing ⇒ SKIPPED, no DB connection opened ═══
const MISSING = [ENV_FILE, SEED_FILE, FIT_FILE].filter((f) => !existsSync(f));
if (MISSING.length > 0 && !FORCE) {
  console.log(`⚠️  SKIPPED — WO T0.2 not built yet (missing: ${MISSING.join(", ")})`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
if (FORCE && MISSING.length > 0) console.log(`⚠️  QC_FORCE=1 — running although ${MISSING.length} deliverable(s) are missing (expected: RED for that reason, no crash): ${MISSING.join(", ")}`);

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const hostOf = (u: string | undefined): string => {
  try {
    return new URL(u ?? "").hostname;
  } catch {
    return "";
  }
};
// the seed tenants live on QC4 only — on any other database (CI shard, QC1) this oracle has nothing to measure and must not write
if (!host.startsWith(QC4_HOST_MARK) || !hostOf(process.env.DIRECT_URL || process.env.DATABASE_URL).startsWith(QC4_HOST_MARK)) {
  if (!FORCE) {
    console.log(`⚠️  SKIPPED — database is not QC4 (${QC4_HOST_MARK}); the AI-team seed and this oracle run on QC4 only`);
    console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
    process.exit(0);
  }
  console.error(`🔴 qc-ai-t0.2: database is not QC4 (${QC4_HOST_MARK}) — refusing to run (use scripts/qc4.sh)`);
  process.exit(4);
}

// ─────────────────────────── check table (ids are fixed: a red run and a green run report the same total) ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const CHECKS: Record<string, [string, Sev]> = {
  "T0.2-S1.1": ["the seed runs twice, both exit 0, and exactly the three tenants qc-ai-team-at1|at2|atx carry the prefix", "CRITICAL"],
  "T0.2-S1.2": ["second seed run: the row count of EVERY table (tenantId column) of AT-1/AT-2/AT-X is unchanged", "CRITICAL"],
  "T0.2-S1.3": ["second seed run replaces nothing: atIds() has the contract shape, matches the DB by slug/e-mail, and the id sets of the seeded tables are identical", "CRITICAL"],
  "T0.2-S1.4": ["other lanes' seed tenants (up to 3, picked at runtime) keep their row counts across the two seed runs", "CRITICAL"],
  "T0.2-S1.5": ["a quiet canary tenant + user created by this oracle (same e-mail domain) is byte-for-byte untouched by the two seed runs", "CRITICAL"],
  "T0.2-S1.6": ["[static] the seed writes only under slug prefix qc-ai-team- / @qc.shark and has no unscoped delete", "CRITICAL"],
  "T0.2-S1.7": ["[static] scripts/qc-all.mts registers the marker `requires: ai-team-seed` → seed-ai-team-qc.mts", "MAJOR"],
  "T0.2-S2.1": ["AT-1, AT-2 and AT-X each have an active AppSystem of every type ACCOUNT/CRM/CHAT/MEMBER/KANBAN", "CRITICAL"],
  "T0.2-S2.2": ["AT-1 has exactly 3 accepted members: at-owner OWNER · at-nid MANAGER · at-staff STAFF", "CRITICAL"],
  "T0.2-S2.3": ["AT-1 has ≥ 20 customers (CrmContact, not archived, in AT-1's CRM system)", "CRITICAL"],
  "T0.2-S2.4": ["AT-1 has ≥ 5 deals (CrmDeal in AT-1's CRM system)", "CRITICAL"],
  "T0.2-S2.5": ["AT-1 has ≥ 3 open invoices (INVOICE · OUT · numbered · AWAITING_PAYMENT|PARTIAL · balance > 0)", "CRITICAL"],
  "T0.2-S2.6": ["AT-1 has ≥ 3 customer chat threads waiting for a reply (OPEN · last message IN · real IN message row)", "CRITICAL"],
  "T0.2-S2.7": ["AT-1 has ≥ 3 active knowledge-base articles over ≥ 2 categories", "MAJOR"],
  "T0.2-S2.8": ["AT-1 has an active ApprovalPolicy for AccountDocument, threshold 2,000,000 satang (20,000 baht), ≥ 1 step", "MAJOR"],
  "T0.2-S2.9": ["permission keys: at-nid may approve account + CRM · at-staff has ai.chat.send + ai.employee.use", "MAJOR"],
  "T0.2-S3.1": ["AT-2 has the same single OWNER as AT-1 (at-owner@qc.shark)", "CRITICAL"],
  "T0.2-S3.2": ["AT-X has a different single OWNER (ax-owner@qc.shark) and the two owners share no tenant", "CRITICAL"],
  "T0.2-S4.1": ["env loader refuses a production host (spawned with a fake URL): exit code 4", "CRITICAL"],
  "T0.2-S4.2": ["env loader refuses QC1, an unknown host, a URL that only mentions ep-frosty-lab outside the hostname, and a bad DIRECT_URL alone: exit code 4 each", "CRITICAL"],
  "T0.2-S4.3": ["no refusal prints the URL, the user, the password or the database name", "CRITICAL"],
  "T0.2-S4.4": ["positive control: on the real QC4 env the loader returns (exit 0) and the module exports loadAiTeamQcEnv, atIds, withInjectedNow", "CRITICAL"],
  "T0.2-S5.1": ["[static] the Screen→Routes table of the API doc has exactly one row per screen A1–A8 B1–B8 C1–C8 D1–D8 E1–E4, each with ≥ 1 route or a client-only note", "CRITICAL"],
  "T0.2-S5.2": ["[static] every route named in that table has its own section, and every section is complete (Auth helper · Permission · Request · Response · Errors · Rate limit · zod block)", "CRITICAL"],
  "T0.2-S5.3": ["[static] the doc has a section for every T1.10 route, the later-WO route families, /me (uiVersion) and /usage (frozen shape); inbox uses requireMobileUser", "CRITICAL"],
  "T0.2-S5.4": ["[static] docs/modules/30-ai-team.md covers M1–M9, the 18 team files and the 8 refusal codes", "MAJOR"],
  "T0.2-S5.5": ["[static] apps/mobile/qc/fixtures/ai-team/README.md describes the fixture format", "MINOR"],
  "T0.2-S6.1": ["fitness-ai-team runs green on the repo and reports F16.1, F16.2 and F16.3 with a JSON_SUMMARY", "CRITICAL"],
  "T0.2-S6.2": ["F16.1 turns red (exit ≠ 0, finding names the file) when a temp src/messages/th/ai-team.json contains \"token\"", "CRITICAL"],
  "T0.2-S6.3": ["F16.1 turns red for each other forbidden word and each scanned location (โทเคน · บาทต่องาน · ค่าแรง · wage · mobile i18n · API schema)", "MAJOR"],
  "T0.2-S6.4": ["negative control: clean temp files in all three locations stay green, and an empty root passes (ratchet)", "CRITICAL"],
  "T0.2-S7.1": ["the ai_team.prisma draft passes `prisma validate` together with the existing schema (a deliberately broken control file fails)", "CRITICAL"],
  "T0.2-S7.2": ["[static] the draft declares the 15 models and 5 enums of MASTER-PLAN §6 T1.1 with the keys of the brief", "CRITICAL"],
  "T0.2-S8.1": ["no row tagged qc-ai-t0.2-* is left in the database (canary tenant, its rows, its user)", "MAJOR"],
  "T0.2-S8.2": ["no temp directory is left and the worktree paths scanned by fitness/prisma are exactly as before the run", "MAJOR"],
  "T0.2-X1.1": ["seed users belong only to their own seed tenants (owner: AT-1+AT-2 · other owner: AT-X · approver/staff: AT-1) and to no foreign tenant", "CRITICAL"],
  "T0.2-X1.2": ["seed tenants contain only seed users (AT-1: 3 · AT-2: 1 · AT-X: 1) — no foreign account can enter them", "CRITICAL"],
  "T0.2-X1.3": ["no seeded row crosses a tenant: every systemId / owner / assignee of an AT-* row belongs to the same tenant", "CRITICAL"],
  "T0.2-X10.1": ["[static] docs, seed, loader, fitness and draft contain no credential, no connection URL, no live secret of this environment, and never read `.env`", "CRITICAL"],
  "T0.2-X10.2": ["the seed (2 runs) and the env loader print no connection URL and no secret", "CRITICAL"],
  "T0.2-X10.3": ["[static] outside /api/mobile/usage no schema in the API doc carries micro-dollar fields or systemPrompt", "CRITICAL"],
};
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const done = new Set<string>();
const chk = (id: string, ok: unknown, e: string, a: string) => {
  const def = CHECKS[id];
  if (!def || done.has(id)) return;
  done.add(id);
  cks.push({ id, ok: !!ok, sev: def[1] });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${def[0]}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const cut = (v: unknown, n = 300) => {
  const s = String(v ?? "");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

// ─── secrets of this environment (values stay in memory; only the variable NAME is ever printed) ───
const SECRETS: { name: string; value: string }[] = [];
for (const [k, v] of Object.entries(process.env)) {
  if (!v || k.startsWith("NEXT_PUBLIC_")) continue;
  if (/^postgres(ql)?:\/\//.test(v)) {
    SECRETS.push({ name: k, value: v });
    try {
      const u = new URL(v);
      if (u.password.length >= 8) {
        SECRETS.push({ name: `${k}#password`, value: u.password });
        SECRETS.push({ name: `${k}#password`, value: decodeURIComponent(u.password) });
      }
    } catch {
      /* not a URL — the whole value is already in the list */
    }
  } else if (/(KEY|SECRET|TOKEN|PASSWORD|PASSWD)(_[A-Z0-9]+)?$/.test(k) && v.length >= 16) {
    SECRETS.push({ name: k, value: v });
  }
}
const DB_URL_RE = /postgres(?:ql)?:\/\/[^\s"'`<>]+/g;
const leaksIn = (text: string): string[] => {
  const hit = new Set<string>();
  for (const s of SECRETS) if (text.includes(s.value)) hit.add(s.name);
  if (/postgres(?:ql)?:\/\/[^\s"'`<>/]*:[^\s"'`<>@]+@/.test(text)) hit.add("connection-url-with-credentials");
  return [...hit];
};
const redact = (text: string): string => {
  let out = text;
  for (const s of SECRETS) out = out.split(s.value).join(`<secret:${s.name}>`);
  return out.replace(DB_URL_RE, "<db-url>");
};
/** safe to print: redacted, single line, capped */
const show = (text: string, n = 240) => cut(redact(text).replace(/\s+/g, " ").trim(), n);
const errMsg = (e: unknown) => show(e instanceof Error ? e.message : String(e), 300);

// ─── child processes (async: the DB connection of this process stays alive during long seed runs) ───
const TSX_BIN = join(ROOT, "node_modules", ".bin", "tsx");
const PRISMA_BIN = join(ROOT, "node_modules", ".bin", "prisma");
type Run = { code: number; out: string; timedOut: boolean };
const sh = (cmd: string, args: string[], opt: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<Run> =>
  new Promise<Run>((resolve) => {
    let out = "";
    let settled = false;
    let timedOut = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, out, timedOut });
    };
    const child = spawn(cmd, args, { cwd: ROOT, env: opt.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, opt.timeoutMs ?? 120_000);
    const take = (d: unknown) => {
      out += String(d);
      if (out.length > 4_000_000) out = out.slice(-2_000_000);
    };
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    child.on("error", (e) => {
      out += `\n[spawn error] ${e.message}`;
      finish(127);
    });
    child.on("close", (code) => finish(code ?? 1));
  });
const tsx = (file: string, args: string[] = [], opt: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}) =>
  existsSync(TSX_BIN) ? sh(TSX_BIN, [file, ...args], opt) : sh("pnpm", ["exec", "tsx", file, ...args], opt);
const git = (args: string[]) => sh("git", args, { timeoutMs: 60_000 });

// ─── temp space (outside the worktree) ───
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q").padEnd(6, "q");
const TAG_PREFIX = "qc-ai-t0.2-";
const TAG = `${TAG_PREFIX}${rand}`;
const TMP = join(tmpdir(), TAG);
const put = (root: string, rel: string, content: string) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, "utf8");
};
// paths the temp-file tests (S6 fitness roots · S7 schema copy) could have polluted if they were written in place
const WATCHED_PATHS = ["src/messages", "apps/mobile/src/i18n", "src/app/api/mobile/team", "prisma", "docs"];

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const q = async (sql: string): Promise<Any[]> => (await P.$queryRawUnsafe(sql)) as Any[];
const okId = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(x);
const inList = (ids: string[]) => ids.filter(okId).map((x) => `'${x}'`).join(",") || "''";

/** run one section; a crash or a check the section never reached is recorded as a FAILED check (ids stay stable) */
const section = async (name: string, ids: string[], fn: () => Promise<void>) => {
  console.log(`\n── ${name} ──`);
  let crash = "";
  try {
    await fn();
  } catch (e) {
    crash = errMsg(e);
  }
  for (const id of ids) if (!done.has(id)) chk(id, false, "check evaluated", crash ? `section stopped: ${crash}` : "not evaluated");
};

// ─────────────────────────── DB helpers ───────────────────────────
type Cols = Map<string, Set<string>>;
let COLS: Cols = new Map();
const loadCols = async () => {
  const rows = await q(
    `select c.table_name as t, c.column_name as c from information_schema.columns c join information_schema.tables b on b.table_schema = c.table_schema and b.table_name = c.table_name ` +
      `where c.table_schema = 'public' and b.table_type = 'BASE TABLE' and c.column_name in ('id','tenantId','systemId','memberSystemId','ownerUserId','assigneeUserId')`,
  );
  const m: Cols = new Map();
  for (const r of rows) {
    const t = String(r.t);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) continue;
    if (!m.has(t)) m.set(t, new Set());
    m.get(t)?.add(String(r.c));
  }
  COLS = m;
};
const has = (t: string, c: string) => COLS.get(t)?.has(c) === true;
const tenantTables = () => [...COLS.keys()].filter((t) => has(t, "tenantId")).sort();

/** row count of every tenant-scoped table for the given tenants → key `<tenantId>|<table>` (zero rows are absent) */
const countAll = async (tids: string[]): Promise<Map<string, number>> => {
  const out = new Map<string, number>();
  const ids = tids.filter(okId);
  if (ids.length === 0) return out;
  const tables = tenantTables();
  const one = (t: string) => `select '${t}'::text as t, "tenantId"::text as tid, count(*)::int as n from "${t}" where "tenantId"::text in (${inList(ids)}) group by "tenantId"`;
  for (let i = 0; i < tables.length; i += 40) {
    const part = tables.slice(i, i + 40);
    let rows: Any[];
    try {
      rows = await q(part.map(one).join(" union all "));
    } catch {
      rows = [];
      for (const t of part) rows.push(...(await q(one(t)).catch(() => [])));
    }
    for (const r of rows) out.set(`${r.tid}|${r.t}`, Number(r.n));
  }
  return out;
};
const diffMaps = (a: Map<string, number | string>, b: Map<string, number | string>, label: (k: string) => string): string[] => {
  const out: string[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k) ?? 0;
    const y = b.get(k) ?? 0;
    if (x !== y) out.push(`${label(k)}: ${x}→${y}`);
  }
  return out.sort();
};
const FP_TABLES = ["Membership", "BusinessUnit", "AppSystem", "AppSystemUnit", "CrmContact", "CrmDeal", "AccountDocument", "ChatConversation", "ChatMessage", "KbArticle", "ApprovalPolicy", "ApprovalStep", "Customer"];
/** md5 of the sorted id list of each seeded table → proves "found, not re-created" */
const idPrints = async (tids: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const ids = tids.filter(okId);
  if (ids.length === 0) return out;
  for (const t of FP_TABLES) {
    if (!has(t, "tenantId") || !has(t, "id")) continue;
    const r = await q(`select md5(coalesce(string_agg(id::text, ',' order by id::text), '')) as h, count(*)::int as n from "${t}" where "tenantId"::text in (${inList(ids)})`);
    out.set(t, `${r[0]?.n ?? 0}#${r[0]?.h ?? ""}`);
  }
  return out;
};
const FOREIGN_TABLES = ["Membership", "AppSystem", "AiConversation", "AiProposal", "CrmContact", "AccountDocument", "KbArticle", "ApprovalPolicy"];
const foreignPrint = async (tid: string): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const t = await P.tenant.findUnique({ where: { id: tid }, select: { name: true, slug: true, status: true, updatedAt: true } });
  out.set("Tenant", t ? `${t.name}|${t.slug}|${t.status}|${new Date(t.updatedAt).toISOString()}` : "gone");
  for (const tb of FOREIGN_TABLES) {
    if (!has(tb, "tenantId")) continue;
    const r = await q(`select count(*)::int as n from "${tb}" where "tenantId" = '${okId(tid) ? tid : ""}'`);
    out.set(tb, String(r[0]?.n ?? 0));
  }
  return out;
};

type Tn = { id: string; slug: string; name: string } | null;
const tenantBySlug = async (slug: string): Promise<Tn> => (await P.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } })) as Tn;
const userIdByEmail = async (email: string): Promise<string> => String((await P.user.findUnique({ where: { email }, select: { id: true } }))?.id ?? "");
type Ids = Record<(typeof ID_KEYS)[number], string>;
const dbIds = async (): Promise<Ids> => ({
  at1: (await tenantBySlug(SLUG.at1))?.id ?? "",
  at2: (await tenantBySlug(SLUG.at2))?.id ?? "",
  atx: (await tenantBySlug(SLUG.atx))?.id ?? "",
  ownerUserId: await userIdByEmail(EMAIL.owner),
  approverUserId: await userIdByEmail(EMAIL.approver),
  staffUserId: await userIdByEmail(EMAIL.staff),
  otherOwnerUserId: await userIdByEmail(EMAIL.otherOwner),
});
/** set by S4.4: the module was imported and its loader returned inside a CHILD process — only then is it imported into this process */
let envModuleSafe = false;
/** atIds() of the builder's module — null + reason when it cannot be called */
const builderIds = async (): Promise<{ ids: Any; err: string }> => {
  if (!existsSync(ENV_FILE)) return { ids: null, err: `${ENV_FILE} missing` };
  if (!envModuleSafe) return { ids: null, err: `${ENV_FILE} did not load cleanly in a child process (see S4.4) — not imported here` };
  try {
    const mod = (await import("./ai-team-qc-env.mts" as string)) as Any;
    if (typeof mod?.atIds !== "function") return { ids: null, err: "atIds is not an exported function" };
    return { ids: await mod.atIds(), err: "" };
  } catch (e) {
    return { ids: null, err: errMsg(e) };
  }
};
const shapeProblems = (ids: Any): string[] => {
  if (!ids || typeof ids !== "object") return ["atIds() did not return an object"];
  const out: string[] = [];
  for (const k of ID_KEYS) if (!okId(ids[k])) out.push(`${k} is not an id`);
  const extra = Object.keys(ids).filter((k) => !(ID_KEYS as readonly string[]).includes(k));
  if (extra.length) out.push(`unexpected keys: ${extra.join(",")}`);
  return out;
};

// ─────────────────────────── static helpers: API doc ───────────────────────────
const normRoute = (method: string, path: string) =>
  `${method.toUpperCase()} ${path
    .trim()
    .replace(/\?.*$/, "")
    .replace(/\[[^\]]*\]|\{[^}]*\}|:[A-Za-z_]+/g, "[]")
    .replace(/\/+$/, "")}`;
const ROUTE_RE = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/mobile\/[^\s`|,)]*)/g;
const routesIn = (text: string): string[] => {
  const out: string[] = [];
  for (const m of text.matchAll(ROUTE_RE)) out.push(normRoute(String(m[1]), String(m[2])));
  return out;
};
type Sec = { route: string; body: string };
const docSections = (md: string): Sec[] => {
  const lines = md.split("\n");
  const out: Sec[] = [];
  let cur: Sec | null = null;
  let fenced = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const h = fenced ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = String(h[1]).length;
      const routes = level === 3 ? routesIn(String(h[2])) : [];
      if (routes.length === 1) {
        cur = { route: String(routes[0]), body: "" };
        out.push(cur);
        continue;
      }
      if (level <= 3) cur = null;
    }
    if (cur) cur.body += `${line}\n`;
  }
  return out;
};
const codeBlocks = (text: string): string[] => {
  const out: string[] = [];
  const parts = text.split(/^\s*```.*$/m);
  for (let i = 1; i < parts.length; i += 2) out.push(String(parts[i]));
  return out;
};
const SCREEN_IDS: string[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `A${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `B${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `C${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `D${n}`),
  ...[1, 2, 3, 4].map((n) => `E${n}`),
];
type ScreenRow = { id: string; routes: string[]; clientOnly: boolean; note: string; raw: string };
const cellsOf = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
/** the tables whose header row has both a `Screen` and a `Routes` cell */
const screenTables = (md: string): ScreenRow[][] => {
  const lines = md.split("\n");
  const tables: ScreenRow[][] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i]);
    if (!/^\s*\|/.test(line)) continue;
    const head = cellsOf(line).map((c) => c.replace(/[*`]/g, "").trim().toLowerCase());
    const cScreen = head.indexOf("screen");
    const cRoutes = head.indexOf("routes");
    const cNote = head.findIndex((h) => h === "notes" || h === "note");
    if (cScreen < 0 || cRoutes < 0) continue;
    if (!/^\s*\|?\s*:?-{2,}/.test(String(lines[i + 1] ?? ""))) continue;
    const rows: ScreenRow[] = [];
    let k = i + 2;
    for (; k < lines.length && /^\s*\|/.test(String(lines[k])); k += 1) {
      const cells = cellsOf(String(lines[k]));
      const first = String(cells[cScreen] ?? "").replace(/[*`]/g, "").trim();
      // one screen per row: "A1 — ทีม" is a row, "B1–B6" (a range) is not
      const idm = /^([A-E][1-8])(?![0-9A-Za-z])/.exec(first);
      const idCount = (first.match(/(?:^|[^0-9A-Za-z])[A-E][1-8](?![0-9A-Za-z])/g) ?? []).length;
      const routeCell = String(cells[cRoutes] ?? "");
      const noteCell = cNote >= 0 ? String(cells[cNote] ?? "") : "";
      const co = /client-only/i.test(routeCell);
      const note = `${routeCell.replace(/client-only/gi, "")} ${noteCell}`.replace(/[`*:—–\-·()]/g, " ").replace(/\s+/g, " ").trim();
      rows.push({ id: idm && idCount === 1 ? String(idm[1]) : `?${cut(first, 20)}`, routes: routesIn(routeCell), clientOnly: co, note, raw: String(lines[k]) });
    }
    tables.push(rows);
    i = k;
  }
  return tables;
};
const TEAM = "/api/mobile/team";
const REQUIRED_ROUTES: string[] = [
  `GET ${TEAM}/employees`,
  `POST ${TEAM}/employees`,
  `GET ${TEAM}/employees/[id]`,
  `PATCH ${TEAM}/employees/[id]`,
  `POST ${TEAM}/employees/[id]/pause`,
  `POST ${TEAM}/employees/[id]/resume`,
  `POST ${TEAM}/employees/[id]/terminate`,
  `GET ${TEAM}/positions`,
  `GET ${TEAM}/positions/recommend`,
  `GET ${TEAM}/employees/[id]/manual`,
  `GET ${TEAM}/employees/[id]/manual/versions`,
  `POST ${TEAM}/employees/[id]/manual`,
  `POST ${TEAM}/employees/[id]/manual/revert`,
  `POST ${TEAM}/employees/[id]/manual/draft`,
  `GET ${TEAM}/employees/[id]/access`,
  `PUT ${TEAM}/employees/[id]/access`,
  `GET ${TEAM}/employees/[id]/tasks`,
  `POST ${TEAM}/employees/[id]/tasks`,
  `POST ${TEAM}/tasks/[id]/done`,
  `POST ${TEAM}/tasks/[id]/archive`,
  `GET ${TEAM}/schedules`,
  `POST ${TEAM}/schedules`,
  `PATCH ${TEAM}/schedules/[id]`,
  `DELETE ${TEAM}/schedules/[id]`,
  `GET ${TEAM}/inbox`,
  `POST ${TEAM}/inbox/decide`,
  `POST ${TEAM}/persona/sample-speech`,
  `GET ${TEAM}/summary`,
  `GET ${TEAM}/quota`,
  "GET /api/mobile/me",
  "GET /api/mobile/usage",
].map((r) => {
  const sp = r.indexOf(" ");
  return normRoute(r.slice(0, sp), r.slice(sp + 1));
});
const LATER_FAMILIES = ["notify-prefs", "people", "packs", "sale-notify", "inbox/teach", "actions", "promotions", "report", "knowledge", "rooms", "flows"];
const USAGE_ROUTE = normRoute("GET", "/api/mobile/usage");
const USAGE_KEYS = ["scope", "used", "limit", "pct", "warn", "degraded", "blocked", "resetAt", "balanceMicro"];
const SECTION_LABELS = ["Auth", "Permission", "Request", "Response", "Errors", "Rate limit"];
const hasLabel = (body: string, label: string) => new RegExp(`^\\s*(?:[-*+]\\s+)?(?:\\*\\*|__)?${label}(?:\\*\\*|__)?\\s*:`, "im").test(body.replace(/\*\*:/g, ":**"));

// ─────────────────────────── static helpers: prisma draft ───────────────────────────
const DRAFT_MODELS = ["AiEmployee", "AiEmployeeManual", "AiEmployeeAccess", "AiKnowledgeGrant", "AiTask", "AiRoom", "AiRoomMember", "AiHandoffFlow", "AiTeachNote", "AiActionLog", "AiEmployeeDaily", "AiSubscription", "AiPackBinding", "AiSaleNotify", "AiNotifyPref"];
const DRAFT_ENUMS: Record<string, string[]> = {
  AiPack: ["FREE", "STARTER", "PRO", "BUSINESS"],
  AiAccessLevel: ["OFF", "READ", "DRAFT", "AUTO"],
  AiEmployeeStatus: ["ACTIVE", "PAUSED", "TERMINATED"],
  AiTaskStatus: ["OPEN", "DONE", "ARCHIVED"],
  AiOverflowMode: ["PAUSE", "WALLET", "ASK"],
};
const prismaBlocks = (src: string, kind: "model" | "enum"): Map<string, string> => {
  // line-based on purpose: a body may contain `}` inside @default("{}")
  const out = new Map<string, string>();
  const open = new RegExp(`^${kind}\\s+(\\w+)\\s*\\{\\s*$`);
  let name = "";
  let body: string[] = [];
  for (const raw of src.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "");
    if (!name) {
      const m = open.exec(line.trim());
      if (m) {
        name = String(m[1]);
        body = [];
      }
    } else if (line.trim() === "}") {
      out.set(name, body.join("\n"));
      name = "";
    } else body.push(line);
  }
  return out;
};
/** field name → rest of the line (type + attributes) */
const fieldsOf = (body: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const l of body.split("\n")) {
    const m = /^\s*([A-Za-z_]\w*)\s+(\S.*)$/.exec(l);
    if (m && !String(m[1]).startsWith("@@")) out.set(String(m[1]), String(m[2]).trim());
  }
  return out;
};
const hasUnique = (body: string, cols: string[]) => new RegExp(`@@unique\\(\\s*\\[\\s*${cols.join("\\s*,\\s*")}\\s*\\]`).test(body);

// ─────────────────────────── run ───────────────────────────
console.log(`QC T0.2 — AI TEAM data contract · API spec · QC seed · env loader · fitness · host ${host.split(".")[0]} · tag ${TAG}${FORCE ? " · QC_FORCE" : ""}`);
const OUTPUTS: { what: string; out: string }[] = []; // everything a child printed — checked for leaks by X10.2
let seedRuns: Run[] = [];
let seedOk = false;
let canaryTenantId = "";
let canaryUserId = "";
let stateBefore = "";
let stateReadable = false;

try {
  mkdirSync(TMP, { recursive: true });
  const st0 = await git(["status", "--porcelain", "--untracked-files=all", "--", ...WATCHED_PATHS]);
  stateReadable = st0.code === 0;
  stateBefore = st0.out.trim();
  await loadCols();

  // ═════════════ S5 + X10.3 — API doc / module doc (static) ═════════════
  await section("S5 docs [static]", ["T0.2-S5.1", "T0.2-S5.2", "T0.2-S5.3", "T0.2-S5.4", "T0.2-S5.5", "T0.2-X10.3"], async () => {
    const md = read(API_DOC);
    if (!md) {
      for (const id of ["T0.2-S5.1", "T0.2-S5.2", "T0.2-S5.3", "T0.2-X10.3"]) chk(id, false, `${API_DOC} exists`, "file missing");
    } else {
      const secs = docSections(md);
      const secMap = new Map<string, Sec>();
      const dupSecs: string[] = [];
      for (const s of secs) {
        if (secMap.has(s.route)) dupSecs.push(s.route);
        else secMap.set(s.route, s);
      }
      const tables = screenTables(md);
      const rows = tables.length === 1 ? (tables[0] as ScreenRow[]) : [];

      // S5.1 — the table itself
      const p1: string[] = [];
      if (tables.length !== 1) p1.push(`found ${tables.length} table(s) with header cells Screen + Routes (need exactly 1)`);
      const seen = rows.map((r) => r.id);
      const missing = SCREEN_IDS.filter((id) => !seen.includes(id));
      const dupes = [...new Set(seen.filter((id, i) => seen.indexOf(id) !== i))];
      const unknown = seen.filter((id) => !SCREEN_IDS.includes(id));
      if (missing.length) p1.push(`no row for: ${missing.join(" ")}`);
      if (dupes.length) p1.push(`duplicate rows: ${dupes.join(" ")}`);
      if (unknown.length) p1.push(`rows that are not one screen id (ranges are not allowed): ${unknown.join(" ")}`);
      const empty = rows.filter((r) => SCREEN_IDS.includes(r.id) && r.routes.length === 0 && !r.clientOnly).map((r) => r.id);
      const bareClientOnly = rows.filter((r) => r.clientOnly && r.routes.length === 0 && r.note.length < 10).map((r) => r.id);
      if (empty.length) p1.push(`no route and no client-only note: ${empty.join(" ")}`);
      if (bareClientOnly.length) p1.push(`client-only without a reason (≥ 10 characters): ${bareClientOnly.join(" ")}`);
      chk("T0.2-S5.1", p1.length === 0 && rows.length === SCREEN_IDS.length, `${SCREEN_IDS.length} rows, one per screen, each with ≥ 1 route or a client-only note`, `${rows.length} rows · ${p1.join(" · ") || "-"}`);

      // S5.2 — referenced routes are documented; every section is complete
      const p2: string[] = [];
      const referenced = [...new Set(rows.flatMap((r) => r.routes))];
      const undocumented = referenced.filter((r) => !secMap.has(r));
      if (rows.length === 0) p2.push("no screen table to read routes from");
      if (referenced.length === 0 && rows.length > 0) p2.push("the table names no route at all");
      if (undocumented.length) p2.push(`named in the table but no section: ${undocumented.join(" | ")}`);
      if (dupSecs.length) p2.push(`documented twice: ${[...new Set(dupSecs)].join(" | ")}`);
      const incomplete: string[] = [];
      for (const s of secMap.values()) {
        const lacks = SECTION_LABELS.filter((l) => !hasLabel(s.body, l));
        const authLine = /^.*Auth(?:\*\*|__)?\s*:.*$/im.exec(s.body.replace(/\*\*:/g, ":**"));
        if (!lacks.includes("Auth") && !/requireMobileUser|requireMobile|mobileUser/.test(String(authLine?.[0] ?? ""))) lacks.push("Auth helper name");
        if (!codeBlocks(s.body).some((b) => /\bz\./.test(b))) lacks.push("zod block");
        if (lacks.length) incomplete.push(`${s.route} ← ${lacks.join(", ")}`);
      }
      if (incomplete.length) p2.push(`incomplete sections (${incomplete.length}): ${incomplete.slice(0, 8).join(" | ")}${incomplete.length > 8 ? " …" : ""}`);
      chk("T0.2-S5.2", p2.length === 0 && secMap.size > 0, "every table route has a section · every section has the 6 labels, an auth helper and a zod block", `${secMap.size} sections · ${referenced.length} routes in the table · ${cut(p2.join(" · ") || "-", 900)}`);

      // S5.3 — the contract's route list
      const p3: string[] = [];
      const lacking = REQUIRED_ROUTES.filter((r) => !secMap.has(r));
      if (lacking.length) p3.push(`no section for ${lacking.length}/${REQUIRED_ROUTES.length}: ${lacking.join(" | ")}`);
      const teamRoutes = [...secMap.keys()].filter((r) => r.includes(`${TEAM}/`));
      const noFamily = LATER_FAMILIES.filter((f) => !teamRoutes.some((r) => `${r.split(" ")[1]}/`.includes(`/${f}/`)));
      if (noFamily.length) p3.push(`no ${TEAM} route for: ${noFamily.join(", ")}`);
      const usage = secMap.get(USAGE_ROUTE);
      const usageMissing = usage ? USAGE_KEYS.filter((k) => !new RegExp(`\\b${k}\\b`).test(codeBlocks(usage.body).join("\n"))) : USAGE_KEYS;
      if (usageMissing.length) p3.push(`/usage schema lacks frozen keys: ${usageMissing.join(",")}`);
      const me = secMap.get(normRoute("GET", "/api/mobile/me"));
      if (me && !/\buiVersion\b/.test(me.body)) p3.push("/me section does not mention uiVersion");
      const inbox = secMap.get(normRoute("GET", `${TEAM}/inbox`));
      if (inbox && !/requireMobileUser/.test(inbox.body)) p3.push("GET inbox must use requireMobileUser (R-E C21)");
      chk("T0.2-S5.3", p3.length === 0, `${REQUIRED_ROUTES.length} required routes + ${LATER_FAMILIES.length} later families + frozen /usage + uiVersion`, cut(p3.join(" · ") || "-", 1200));

      // X10.3 — no micro-dollar / prompt field reaches the app
      const bad: string[] = [];
      for (const s of secMap.values()) {
        if (s.route === USAGE_ROUTE) continue;
        const hits = new Set<string>();
        for (const b of codeBlocks(s.body)) for (const m of b.matchAll(/\b\w*Micro\b|\bsystemPrompt\b/g)) hits.add(String(m[0]));
        if (hits.size) bad.push(`${s.route} ← ${[...hits].join(",")}`);
      }
      chk("T0.2-X10.3", bad.length === 0 && secMap.size > 0, "no …Micro / systemPrompt in any schema outside /usage", secMap.size === 0 ? "no route section found" : cut(bad.join(" | "), 700));
    }

    // S5.4 — module doc
    const mod = read(MOD_DOC);
    const TEAM_FILES = ["employees", "templates", "persona-prompt", "manual", "access", "kind-class", "tasks", "schedule", "inbox", "quota", "auto", "undo", "teach", "promotion", "daily", "rooms", "handoff", "packs"];
    const CODES = ["employee_access_off", "employee_access_read_only", "employee_auto_not_granted", "employee_auto_over_limit", "employee_grantor_revoked", "employee_paused", "employee_quota_cap", "team_quota_exhausted"];
    const p4: string[] = [];
    if (!mod) p4.push("file missing");
    else {
      const noM = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !new RegExp(`^#{1,4}\\s.*\\bM${n}\\b`, "m").test(mod));
      const noFile = TEAM_FILES.filter((f) => !mod.includes(`${f}.ts`));
      const noCode = CODES.filter((c) => !mod.includes(c));
      if (noM.length) p4.push(`no heading for M${noM.join(" M")}`);
      if (noFile.length) p4.push(`team files not named: ${noFile.join(", ")}`);
      if (noCode.length) p4.push(`refusal codes not listed: ${noCode.join(", ")}`);
      if (!/\bAiTask\b/.test(mod)) p4.push("the AiTask decision (C7) is not written");
      if (!mod.includes("ai.flow.triggered")) p4.push("event ai.flow.triggered (T5.3) not mentioned");
    }
    chk("T0.2-S5.4", p4.length === 0, "M1–M9 headings · 18 files · 8 refusal codes · AiTask · ai.flow.triggered", cut(p4.join(" · "), 600));
    const fx = read(FIXTURE_README);
    chk("T0.2-S5.5", fx.length > 200 && /route/i.test(fx) && /\bme\b/.test(fx) && /employees/.test(fx), "README > 200 chars naming the keys (me, employees, … by route pattern)", fx ? `${fx.length} chars` : "file missing");
  });

  // ═════════════ S6 — fitness-ai-team (no DB) ═════════════
  await section("S6 fitness F16 [static]", ["T0.2-S6.1", "T0.2-S6.2", "T0.2-S6.3", "T0.2-S6.4"], async () => {
    if (!existsSync(FIT_FILE)) {
      for (const id of ["T0.2-S6.1", "T0.2-S6.2", "T0.2-S6.3", "T0.2-S6.4"]) chk(id, false, `${FIT_FILE} exists`, "file missing");
      return;
    }
    type Fit = { code: number; summary: Any; out: string; f161: Any };
    const fit = async (root: string | null): Promise<Fit> => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      if (root) env.FITNESS_AI_TEAM_ROOT = root;
      else delete env.FITNESS_AI_TEAM_ROOT;
      const r = await tsx(FIT_FILE, [], { env, timeoutMs: 180_000 });
      OUTPUTS.push({ what: `fitness(${root ? "temp root" : "repo"})`, out: r.out });
      let summary: Any = null;
      const line = r.out.split("\n").filter((l) => l.startsWith("JSON_SUMMARY ")).pop();
      try {
        summary = line ? JSON.parse(line.slice("JSON_SUMMARY ".length)) : null;
      } catch {
        summary = null;
      }
      const findings: Any[] = Array.isArray(summary?.findings) ? summary.findings : [];
      return { code: r.code, summary, out: r.out, f161: findings.find((f) => String(f?.id) === "F16.1") ?? null };
    };
    const rootOf = (name: string, files: Record<string, string>) => {
      const root = join(TMP, `fit-${name}`);
      mkdirSync(root, { recursive: true });
      for (const [rel, content] of Object.entries(files)) put(root, rel, content);
      return root;
    };
    const TH = "src/messages/th/ai-team.json";
    const EN = "src/messages/en/ai-team.json";
    const APP = "apps/mobile/src/i18n/team.ts";
    const API = "src/app/api/mobile/team/qcprobe/route.ts";
    const cleanJson = JSON.stringify({ team: { quota: { hint: "ใช้ไปแล้ว 40% ของโควตาเดือนนี้", done: "งานที่ทำเสร็จวันนี้" } } }, null, 2);
    const cleanApp = `export const team = { th: { quotaHint: "ใช้ไปแล้ว 40% ของโควตา" }, en: { quotaHint: "40% of this month's quota used" } } as const;\n`;
    const cleanApi = `import { z } from "zod";\nexport const ZTeamProbeResponse = z.object({ quotaPct: z.number().int(), tasksToday: z.number().int() });\n`;

    // S6.1 — the real repo
    const real = await fit(null);
    const idsSeen = ["F16.1", "F16.2", "F16.3"].filter((id) => real.out.includes(`[${id}]`) || real.out.includes(`${id} `) || real.out.includes(`"${id}"`));
    chk("T0.2-S6.1", real.code === 0 && real.summary && Number(real.summary.total) >= 3 && idsSeen.length === 3, "exit 0 · JSON_SUMMARY total ≥ 3 · F16.1 F16.2 F16.3 all reported", `exit ${real.code} · summary ${real.summary ? `total ${real.summary.total} passed ${real.summary.passed}` : "none"} · ids ${idsSeen.join(",") || "-"} · ${show(real.out.split("\n").slice(-3).join(" "), 200)}`);

    // S6.2 — "token" in a team string
    const tok = await fit(rootOf("token", { [TH]: JSON.stringify({ team: { quota: { hint: "เดือนนี้ใช้ไป 1200 token แล้ว" } } }) }));
    const named = (f: Fit, base: string) => JSON.stringify(f.f161 ?? "").includes(base) || f.out.includes(base);
    chk("T0.2-S6.2", tok.code !== 0 && tok.f161 && named(tok, "ai-team.json"), "exit ≠ 0 · finding F16.1 naming ai-team.json", `exit ${tok.code} · F16.1 finding ${tok.f161 ? "yes" : "no"} · names file ${named(tok, "ai-team.json")}`);

    // S6.3 — every other word and location
    const cases: [string, Record<string, string>, string][] = [
      ["โทเคน in en json", { [EN]: JSON.stringify({ team: { a: "คุณใช้โทเคนไปครึ่งหนึ่ง" } }) }, "ai-team.json"],
      ["บาทต่องาน in th json", { [TH]: JSON.stringify({ team: { a: "เฉลี่ย 3 บาทต่องาน" } }) }, "ai-team.json"],
      ["ค่าแรง in th json", { [TH]: JSON.stringify({ team: { a: "ประหยัดค่าแรงได้" } }) }, "ai-team.json"],
      ["wage in mobile i18n", { [APP]: `export const team = { en: { saved: "saved wage this month" } } as const;\n` }, "team.ts"],
      ["token in mobile i18n", { [APP]: `export const team = { th: { used: "ใช้ไป 300 token" } } as const;\n` }, "team.ts"],
      ["wage key in API response schema", { [API]: `import { z } from "zod";\nexport const ZTeamProbeResponse = z.object({ wage: z.number(), quotaPct: z.number() });\n` }, "route.ts"],
    ];
    const notRed: string[] = [];
    for (let i = 0; i < cases.length; i += 1) {
      const c = cases[i] as [string, Record<string, string>, string];
      const r = await fit(rootOf(`w${i}`, c[1]));
      if (!(r.code !== 0 && r.f161 && named(r, c[2]))) notRed.push(`${c[0]} (exit ${r.code}, F16.1 ${r.f161 ? "found" : "absent"})`);
    }
    chk("T0.2-S6.3", notRed.length === 0, `${cases.length}/${cases.length} cases red with F16.1`, `not red: ${notRed.join(" · ") || "-"}`);

    // S6.4 — controls
    const clean = await fit(rootOf("clean", { [TH]: cleanJson, [EN]: cleanJson, [APP]: cleanApp, [API]: cleanApi }));
    const none = await fit(rootOf("empty", { "README.txt": "nothing to scan\n" }));
    chk("T0.2-S6.4", clean.code === 0 && !clean.f161 && none.code === 0 && !none.f161, "clean files: exit 0 without F16.1 · empty root: exit 0 (ratchet)", `clean exit ${clean.code} F16.1 ${clean.f161 ? cut(JSON.stringify(clean.f161), 160) : "absent"} · empty exit ${none.code}`);
  });

  // ═════════════ S7 — prisma draft ═════════════
  await section("S7 prisma draft", ["T0.2-S7.1", "T0.2-S7.2"], async () => {
    const draftPath = DRAFT_CANDIDATES.find((p) => existsSync(p)) ?? "";
    if (!draftPath) {
      chk("T0.2-S7.1", false, `draft at ${DRAFT_CANDIDATES.join(" or ")}`, "file missing");
      chk("T0.2-S7.2", false, `draft at ${DRAFT_CANDIDATES.join(" or ")}`, "file missing");
      return;
    }
    const draft = read(draftPath);
    const dir = join(TMP, "schema");
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(SCHEMA_DIR)) if (f.endsWith(".prisma") && f !== "ai_team.prisma") cpSync(join(SCHEMA_DIR, f), join(dir, f));
    writeFileSync(join(dir, "ai_team.prisma"), draft, "utf8");
    // the CLI only parses: give it placeholders so it never holds a real connection string
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: "postgresql://no-env:no-env@localhost:5432/no_env_set?schema=public", DIRECT_URL: "postgresql://no-env:no-env@localhost:5432/no_env_set?schema=public", PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1" };
    const good = await sh(PRISMA_BIN, ["validate", "--schema", dir], { env, timeoutMs: 180_000 });
    writeFileSync(join(dir, "zz_qc_broken.prisma"), "model QcAiT02Broken {\n  id\n}\n", "utf8");
    const broken = await sh(PRISMA_BIN, ["validate", "--schema", dir], { env, timeoutMs: 180_000 });
    const tail = (r: Run) => show(r.out.replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter((l) => /error|Error|valid/.test(l)).slice(0, 4).join(" "), 400);
    chk("T0.2-S7.1", good.code === 0 && broken.code !== 0, "validate exit 0 on schema + draft · exit ≠ 0 once a broken control file is added", `${draftPath}: exit ${good.code} (${tail(good) || "-"}) · control exit ${broken.code}`);

    const models = prismaBlocks(draft, "model");
    const enums = prismaBlocks(draft, "enum");
    const p: string[] = [];
    const noModel = DRAFT_MODELS.filter((m) => !models.has(m));
    if (noModel.length) p.push(`models missing: ${noModel.join(", ")}`);
    for (const [name, values] of Object.entries(DRAFT_ENUMS)) {
      const body = enums.get(name);
      if (body === undefined) {
        p.push(`enum ${name} missing`);
        continue;
      }
      const got = body.split(/\s+/).filter((v) => /^[A-Z][A-Z0-9_]*$/.test(v));
      if (got.join(" ") !== values.join(" ")) p.push(`enum ${name} = ${got.join(" ")} (want ${values.join(" ")})`);
    }
    if (enums.has("AiCreditSource") || models.has("AiConversation")) p.push("draft re-declares an existing model/enum (AiCreditSource / AiConversation)");
    for (const [name, body] of models) {
      const f = fieldsOf(body);
      if (f.has("employeeId")) p.push(`${name}.employeeId — the FK name is aiEmployeeId (clashes with HR)`);
      if (name !== "AiSubscription" && DRAFT_MODELS.includes(name) && !/^String(\s|$)/.test(f.get("tenantId") ?? "")) p.push(`${name} lacks a required \`tenantId String\` (tenant axis)`);
    }
    const sub = fieldsOf(models.get("AiSubscription") ?? "");
    for (const k of ["pack", "cycleStart", "cycleEnd", "allowanceMicro", "usedMicro", "overflowMode", "status", "lastResetKey"]) if (!sub.has(k)) p.push(`AiSubscription.${k} missing`);
    if (!/^String\?/.test(sub.get("ownerUserId") ?? "")) p.push("AiSubscription.ownerUserId must be String?");
    if (!/^String\?/.test(sub.get("tenantId") ?? "")) p.push("AiSubscription.tenantId must be String? (global axis, R-E C2)");
    if (!/^AiPack\b/.test(sub.get("pack") ?? "")) p.push("AiSubscription.pack must be AiPack");
    const bind = fieldsOf(models.get("AiPackBinding") ?? "");
    if (!/@unique/.test(bind.get("tenantId") ?? "")) p.push("AiPackBinding.tenantId must be @unique");
    for (const k of ["subscriptionId", "resolvedOwnerUserId"]) if (!bind.has(k)) p.push(`AiPackBinding.${k} missing`);
    const task = fieldsOf(models.get("AiTask") ?? "");
    if (!/@unique/.test(task.get("conversationId") ?? "")) p.push("AiTask.conversationId must be @unique");
    if (!task.has("aiEmployeeId")) p.push("AiTask.aiEmployeeId missing");
    if (!hasUnique(models.get("AiEmployeeManual") ?? "", ["aiEmployeeId", "version"])) p.push("AiEmployeeManual @@unique([aiEmployeeId, version]) missing");
    if (!hasUnique(models.get("AiEmployeeAccess") ?? "", ["aiEmployeeId", "skillId"])) p.push("AiEmployeeAccess @@unique([aiEmployeeId, skillId]) missing");
    if (!hasUnique(models.get("AiEmployeeDaily") ?? "", ["aiEmployeeId", "day"])) p.push("AiEmployeeDaily @@unique([aiEmployeeId, day]) missing");
    const comments = draft.split("\n").filter((l) => /^\s*\/\//.test(l)).join("\n");
    if (!/T1\.1 adds/.test(comments)) p.push('comment block "T1.1 adds" missing');
    else for (const m of ["AiProposal", "AiScheduledTask", "AiCreditTxn", "AiSettings"]) if (!comments.includes(m)) p.push(`"T1.1 adds" block does not name ${m}`);
    chk("T0.2-S7.2", p.length === 0, "15 models · 5 enums · keys and uniques of the brief", cut(p.join(" · "), 1200));
  });

  // ═════════════ X10.1 + S1.6 + S1.7 — static scan of the deliverables ═════════════
  await section("X10 / S1 static", ["T0.2-X10.1", "T0.2-S1.6", "T0.2-S1.7"], async () => {
    const draftPath = DRAFT_CANDIDATES.find((p) => existsSync(p)) ?? DRAFT_CANDIDATES[0];
    const files = [API_DOC, MOD_DOC, FIXTURE_README, SEED_FILE, ENV_FILE, FIT_FILE, String(draftPath)];
    const present = files.filter((f) => existsSync(f));
    const absent = files.filter((f) => !existsSync(f));
    const PATTERNS: [string, RegExp][] = [
      ["neon password", /\bnpg_[A-Za-z0-9]{8,}/],
      ["OpenRouter key", /sk-or-v1-[A-Za-z0-9]{16,}/],
      ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{16,}/],
      ["OpenAI-style key", /\bsk-[A-Za-z0-9]{32,}/],
      ["Expo push token", /Expo(?:nent)?PushToken\[[^\]\s]{8,}\]/],
      ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ["JWT", /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}/],
      ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}/],
      ["full Neon hostname", /\bep-[a-z0-9-]+\.[a-z0-9.-]*neon\.tech/],
      ["bearer credential", /Bearer\s+[A-Za-z0-9_-]{32,}/],
    ];
    const hits: string[] = [];
    for (const f of present) {
      const src = read(f);
      for (const [name, re] of PATTERNS) if (re.test(src)) hits.push(`${f}: ${name}`);
      for (const m of src.matchAll(/postgres(?:ql)?:\/\/[^\s"'`<>/]*:[^\s"'`<>@]+@([^\s"'`<>/:?]+)/g)) {
        const h = String(m[1]);
        if (!/^(localhost|127\.0\.0\.1|example\.com|host|HOST)$/.test(h) && !/\.(invalid|example|test)$/.test(h)) hits.push(`${f}: connection URL with credentials`);
      }
      for (const name of leaksIn(src).filter((n) => n !== "connection-url-with-credentials")) hits.push(`${f}: live value of ${name}`);
      if (f.endsWith(".mts")) {
        if (/["'`]\.env["'`]/.test(src)) hits.push(`${f}: reads ".env" (production file)`);
        if (f !== ENV_FILE && /loadEnvFile\s*\(/.test(src)) hits.push(`${f}: calls loadEnvFile itself (env must come through loadAiTeamQcEnv)`);
        if (/console\.\w+\([^;]*(process\.env\.(DATABASE_URL|DIRECT_URL)|\bdatabaseUrl\b)/.test(src)) hits.push(`${f}: logs a database URL`);
      }
    }
    const seedSrc = read(SEED_FILE);
    if (seedSrc && !(/ai-team-qc-env/.test(seedSrc) && /loadAiTeamQcEnv\s*\(/.test(seedSrc))) hits.push(`${SEED_FILE}: does not load env through loadAiTeamQcEnv()`);
    chk("T0.2-X10.1", absent.length === 0 && hits.length === 0, `${files.length} deliverables present and clean`, `${absent.length ? `missing: ${absent.join(", ")} · ` : ""}${cut([...new Set(hits)].join(" · "), 800) || "clean"}`);

    // S1.6 — the seed can only write its own tenants
    const p: string[] = [];
    if (!seedSrc) p.push("file missing");
    else {
      const strings = [...seedSrc.matchAll(/["'`]([^"'`\n]{3,120})["'`]/g)].map((m) => String(m[1]));
      const foreignSlugs = [...new Set(strings.filter((s) => /^(qc-|siam-dive)[a-z0-9.-]*$/.test(s) && !s.startsWith(SLUG_PREFIX)))];
      const emails = [...new Set(strings.filter((s) => /^[^\s@${}]+@[a-z0-9.-]+\.[a-z]+$/i.test(s)))];
      const foreignEmails = emails.filter((e) => !e.endsWith("@qc.shark"));
      if (!seedSrc.includes(SLUG_PREFIX)) p.push(`prefix ${SLUG_PREFIX} never appears`);
      if (foreignSlugs.length) p.push(`slug-like literals outside the prefix: ${foreignSlugs.join(", ")}`);
      if (foreignEmails.length) p.push(`e-mails outside @qc.shark: ${foreignEmails.join(", ")}`);
      if (/\.deleteMany\(\s*(\{\s*\})?\s*\)/.test(seedSrc)) p.push("deleteMany() without a where");
      if (/\bTRUNCATE\b/i.test(seedSrc)) p.push("TRUNCATE");
      if (/DELETE FROM \\?["']?\w+\\?["']?\s*[;`)]/i.test(seedSrc.replace(/\s+/g, " "))) p.push("DELETE FROM without WHERE");
      if (/\.tenant\.(deleteMany|delete)\(/.test(seedSrc)) p.push("deletes Tenant rows (the contract is find-or-create)");
      if (/acc-v2-env|member-qc-env|kanban-qc-env|crm-qc-env/.test(seedSrc.replace(/ai-team-qc-env/g, ""))) p.push("imports another lane's QC env/seed (their tenants must stay untouched)");
    }
    chk("T0.2-S1.6", p.length === 0, "only qc-ai-team-* slugs and @qc.shark e-mails · no unscoped delete", cut(p.join(" · "), 700));

    const qa = read(QC_ALL);
    const marker = ["// requires:", "ai-team-seed"].join(" ");
    chk("T0.2-S1.7", qa.includes(marker) && qa.includes("seed-ai-team-qc.mts"), `${QC_ALL} contains the marker and the seed file name`, `marker ${qa.includes(marker)} · seed file ${qa.includes("seed-ai-team-qc.mts")}`);
  });

  // ═════════════ S4 — env loader refusal (child processes, fake URLs, no DB) ═════════════
  await section("S4 env loader", ["T0.2-S4.1", "T0.2-S4.2", "T0.2-S4.3", "T0.2-S4.4"], async () => {
    const PW = "QcAiT02FakePw9x7Zk";
    const USER = "qcfakeuser77";
    const DBN = "qcfakedb77";
    const fake = (hostname: string, user = USER, db = DBN, extra = "") => `postgresql://${user}:${PW}@${hostname}/${db}?sslmode=require${extra}`;
    const prod = fake("ep-royal-night-qcfake00.ap-southeast-1.aws.neon.tech.invalid");
    const qc1 = fake("ep-plain-art-qcfake00.ap-southeast-1.aws.neon.tech.invalid");
    const other = fake("db.qc-ai-t02.invalid");
    const trick = fake("ep-cool-shadow-qcfake00.ap-southeast-1.aws.neon.tech.invalid", QC4_HOST_MARK, QC4_HOST_MARK, `&options=${QC4_HOST_MARK}`);
    const child = async (name: string, over: Record<string, string>): Promise<Run & { name: string }> => {
      const r = await tsx(THIS_FILE, ["--s4-child"], { env: { ...process.env, ...over }, timeoutMs: 180_000 });
      OUTPUTS.push({ what: `env-loader child (${name})`, out: r.out });
      return { ...r, name };
    };
    const rProd = await child("production host", { DATABASE_URL: prod, DIRECT_URL: prod });
    const rQc1 = await child("QC1 host", { DATABASE_URL: qc1, DIRECT_URL: qc1 });
    const rOther = await child("unknown host", { DATABASE_URL: other, DIRECT_URL: other });
    const rTrick = await child("ep-frosty-lab outside the hostname", { DATABASE_URL: trick, DIRECT_URL: trick });
    const rDirect = await child("good DATABASE_URL + production DIRECT_URL", { DIRECT_URL: prod });
    const rGood = await child("real QC4 env", {});
    const state = (r: Run) => (/S4CHILD (\w+)/.exec(r.out)?.[1] ?? (r.timedOut ? "TIMEOUT" : "no marker"));
    const brief = (r: Run & { name: string }) => `${r.name}: exit ${r.code} (${state(r)})`;
    chk("T0.2-S4.1", rProd.code === 4, "exit 4", brief(rProd));
    const others = [rQc1, rOther, rTrick, rDirect];
    chk("T0.2-S4.2", others.every((r) => r.code === 4), "exit 4 ×4", others.map(brief).join(" · "));
    const refusals = [rProd, ...others];
    const leaked: string[] = [];
    for (const r of refusals) {
      const what: string[] = [];
      if (r.out.includes(PW)) what.push("password");
      if (r.out.includes(USER)) what.push("user");
      if (r.out.includes(DBN)) what.push("database name");
      if (/postgres(?:ql)?:\/\//.test(r.out)) what.push("URL");
      for (const n of leaksIn(r.out)) what.push(n);
      if (what.length) leaked.push(`${r.name} → ${[...new Set(what)].join(",")}`);
    }
    const reached = refusals.filter((r) => /S4CHILD LOADED/.test(r.out)).map((r) => r.name);
    const ran = refusals.every((r) => !/S4CHILD (MISSING|IMPORTERR|NOFN)/.test(r.out));
    chk("T0.2-S4.3", ran && leaked.length === 0 && reached.length === 0, "the loader ran, refused before returning, and printed no URL/user/password/database", `${ran ? "" : `loader not runnable (${state(rProd)}) · `}leaks: ${leaked.join(" · ") || "none"} · returned instead of refusing: ${reached.join(", ") || "none"}`);
    envModuleSafe = rGood.code === 0 && /S4CHILD LOADED/.test(rGood.out);
    const exportsLine = /S4CHILD LOADED exports=(\S*)/.exec(rGood.out)?.[1] ?? "";
    const exps = exportsLine.split(",").filter(Boolean);
    chk("T0.2-S4.4", rGood.code === 0 && ["loadAiTeamQcEnv", "atIds", "withInjectedNow"].every((k) => exps.includes(k)) && leaksIn(rGood.out).length === 0, "exit 0 · exports loadAiTeamQcEnv, atIds, withInjectedNow · nothing secret printed", `${brief(rGood)} · exports ${exps.join(",") || "-"} · leaks ${leaksIn(rGood.out).join(",") || "none"}`);
  });

  // ═════════════ S1 — seed twice (+ canary, foreign tenants) ═════════════
  let foreign: { id: string; slug: string }[] = [];
  await section("S1 seed ×2", ["T0.2-S1.1", "T0.2-S1.2", "T0.2-S1.3", "T0.2-S1.4", "T0.2-S1.5"], async () => {
    // canary: a tenant nobody else knows, with a user in the seed's own e-mail domain
    const cu = await P.user.create({ data: { email: `${TAG}@qc.shark`, name: `${TAG} canary` }, select: { id: true } });
    canaryUserId = String(cu.id);
    const ct = await P.tenant.create({ data: { name: `${TAG} canary`, slug: TAG }, select: { id: true } });
    canaryTenantId = String(ct.id);
    await P.membership.create({ data: { userId: canaryUserId, tenantId: canaryTenantId, role: "OWNER", acceptedAt: new Date(), permissions: { "ai.chat.send": true } } });
    await P.appSystem.create({ data: { tenantId: canaryTenantId, type: "CRM", name: `${TAG} crm` } });
    await P.kbArticle.create({ data: { tenantId: canaryTenantId, title: `${TAG} article`, body: "canary", category: "canary" } });
    await P.approvalPolicy.create({ data: { tenantId: canaryTenantId, name: `${TAG} policy`, entityType: "AccountDocument", thresholdSatang: 123 } });
    const canaryPrint = async (): Promise<string> => {
      const counts = [...(await countAll([canaryTenantId])).entries()].sort().map(([k, v]) => `${k.split("|")[1]}=${v}`).join(",");
      const t = await P.tenant.findUnique({ where: { id: canaryTenantId } });
      const ms = await P.membership.findMany({ where: { OR: [{ tenantId: canaryTenantId }, { userId: canaryUserId }] }, orderBy: { id: "asc" } });
      const u = await P.user.findUnique({ where: { id: canaryUserId } });
      const pol = await P.approvalPolicy.findMany({ where: { tenantId: canaryTenantId }, orderBy: { id: "asc" } });
      const kb = await P.kbArticle.findMany({ where: { tenantId: canaryTenantId }, orderBy: { id: "asc" } });
      const sys = await P.appSystem.findMany({ where: { tenantId: canaryTenantId }, orderBy: { id: "asc" } });
      return JSON.stringify({ counts, t, ms, u, pol, kb, sys });
    };

    // foreign seed tenants of the other lanes (shared QC4): known seed slugs first, then the oldest tenants
    const known = (await P.tenant.findMany({ where: { slug: { in: ["siam-dive-qc", "siam-dive-member-qc", "siam-dive-kanban-qc"] } }, select: { id: true, slug: true }, orderBy: { createdAt: "asc" } })) as { id: string; slug: string }[];
    const fill = (await P.tenant.findMany({
      where: { NOT: [{ slug: { startsWith: SLUG_PREFIX } }, { slug: { startsWith: "qc-" } }], id: { notIn: known.map((k) => k.id) } },
      select: { id: true, slug: true },
      orderBy: { createdAt: "asc" },
      take: 3,
    })) as { id: string; slug: string }[];
    foreign = [...known, ...fill].slice(0, 3);
    const foreignBefore = new Map<string, Map<string, string>>();
    for (const f of foreign) foreignBefore.set(f.id, await foreignPrint(f.id));
    const canaryBefore = await canaryPrint();

    // run 1
    const runSeed = async (n: number): Promise<Run> => {
      if (!existsSync(SEED_FILE)) return { code: -1, out: `${SEED_FILE} missing`, timedOut: false };
      const t0 = Date.now();
      const r = await tsx(SEED_FILE, [], { timeoutMs: 20 * 60_000 });
      OUTPUTS.push({ what: `seed run ${n}`, out: r.out });
      console.log(`  · seed run ${n}: exit ${r.code}${r.timedOut ? " (timeout)" : ""} in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${show(r.out.split("\n").filter((l) => l.trim()).slice(-2).join(" / "), 200)}`);
      return r;
    };
    const r1 = await runSeed(1);
    const idsA = await dbIds();
    const atA = [idsA.at1, idsA.at2, idsA.atx].filter(okId);
    const slugOf = (tid: string) => (tid === idsA.at1 ? "AT-1" : tid === idsA.at2 ? "AT-2" : tid === idsA.atx ? "AT-X" : tid);
    const countsA = await countAll(atA);
    const printsA = await idPrints(atA);
    const bA = await builderIds();
    // run 2
    const r2: Run = r1.code === 0 ? await runSeed(2) : { code: -1, out: "not run (run 1 failed)", timedOut: false };
    seedRuns = [r1, r2];
    seedOk = r1.code === 0 && r2.code === 0;
    const idsB = await dbIds();
    const atB = [idsB.at1, idsB.at2, idsB.atx].filter(okId);
    const countsB = await countAll([...new Set([...atA, ...atB])]);
    const printsB = await idPrints([...new Set([...atA, ...atB])]);
    const bB = await builderIds();

    const prefixed = (await P.tenant.findMany({ where: { slug: { startsWith: SLUG_PREFIX } }, select: { slug: true }, orderBy: { slug: "asc" } })) as { slug: string }[];
    const slugs = prefixed.map((t) => t.slug);
    const want = [SLUG.at1, SLUG.at2, SLUG.atx];
    chk("T0.2-S1.1", seedOk && slugs.join(",") === want.join(","), `both runs exit 0 · tenants with the prefix = ${want.join(",")}`, `run 1 exit ${r1.code} · run 2 exit ${r2.code} · prefixed tenants: ${slugs.join(",") || "none"}${r1.code !== 0 ? ` · ${show(r1.out.split("\n").slice(-3).join(" "), 200)}` : ""}`);

    const cDiff = diffMaps(countsA, countsB, (k) => `${slugOf(String(k.split("|")[0]))}.${k.split("|")[1]}`);
    chk("T0.2-S1.2", seedOk && atA.length === 3 && countsA.size > 0 && cDiff.length === 0, `${tenantTables().length} tables × 3 tenants: equal counts after run 2`, !seedOk ? "the seed did not run twice" : atA.length !== 3 ? `only ${atA.length}/3 seed tenants exist` : `${countsA.size} non-empty (tenant,table) pairs · changed: ${cut(cDiff.join(" · "), 700) || "none"}`);

    const p3: string[] = [];
    if (!seedOk) p3.push("the seed did not run twice");
    if (bA.err || bB.err) p3.push(`atIds(): ${bA.err || bB.err}`);
    else {
      p3.push(...shapeProblems(bB.ids));
      for (const k of ID_KEYS) {
        if (String(bB.ids?.[k] ?? "") !== idsB[k]) p3.push(`atIds().${k} ≠ the row found by ${k.endsWith("UserId") ? "e-mail" : "slug"}`);
        if (String(bA.ids?.[k] ?? "") !== String(bB.ids?.[k] ?? "")) p3.push(`atIds().${k} changed between the runs`);
      }
    }
    for (const k of ID_KEYS) {
      if (!okId(idsB[k])) p3.push(`${k}: no row in the DB (${k.endsWith("UserId") ? "e-mail" : "slug"} lookup)`);
      else if (idsA[k] !== idsB[k]) p3.push(`${k} was re-created by run 2`);
    }
    const pDiff = diffMaps(printsA, printsB, (k) => k);
    if (pDiff.length) p3.push(`id sets changed in: ${pDiff.map((d) => d.split(":")[0]).join(", ")}`);
    chk("T0.2-S1.3", p3.length === 0, "atIds() = 7 ids matching the DB · same ids and same id sets after run 2", cut([...new Set(p3)].join(" · "), 900));

    const fDiff: string[] = [];
    for (const f of foreign) {
      const d = diffMaps(foreignBefore.get(f.id) ?? new Map(), await foreignPrint(f.id), (k) => k);
      if (d.length) fDiff.push(`tenant ${f.slug} → ${d.join(", ")}`);
    }
    chk("T0.2-S1.4", seedOk && foreign.length > 0 && fDiff.length === 0, `unchanged: ${foreign.map((f) => f.slug).join(", ") || "(no foreign tenant found)"}`, !seedOk ? "the seed did not run twice (nothing measured)" : foreign.length === 0 ? "no foreign tenant on this database" : fDiff.length ? `${fDiff.join(" · ")} — a concurrent lane writing to that tenant looks the same; compare with S1.5 (canary)` : "unchanged");

    const canaryAfter = await canaryPrint();
    chk("T0.2-S1.5", seedOk && canaryAfter === canaryBefore, "canary tenant, its rows, its user and memberships identical", !seedOk ? "the seed did not run twice (nothing measured)" : canaryAfter === canaryBefore ? "identical" : `changed: before ${cut(canaryBefore, 260)} | after ${cut(canaryAfter, 260)}`);
  });

  // ═════════════ S2 / S3 / X1 — what the seed left in the DB (independent of atIds(): looked up by slug / e-mail) ═════════════
  const ids = await dbIds().catch(() => ({ at1: "", at2: "", atx: "", ownerUserId: "", approverUserId: "", staffUserId: "", otherOwnerUserId: "" }) as Ids);
  const at = [ids.at1, ids.at2, ids.atx];
  const nameOfTenant = (tid: string) => (tid === ids.at1 ? "AT-1" : tid === ids.at2 ? "AT-2" : tid === ids.atx ? "AT-X" : `foreign:${tid.slice(0, 8)}`);
  const nameOfUser = (uid: string) => (uid === ids.ownerUserId ? "at-owner" : uid === ids.approverUserId ? "at-nid" : uid === ids.staffUserId ? "at-staff" : uid === ids.otherOwnerUserId ? "ax-owner" : `foreign:${uid.slice(0, 8)}`);
  const noTenant = (k: "at1" | "at2" | "atx") => (okId(ids[k]) ? "" : `tenant ${SLUG[k]} not found`);
  type M = { userId: string; tenantId: string; role: string; acceptedAt: Date | null; permissions: Any };
  const membersOf = async (tid: string): Promise<M[]> => (okId(tid) ? ((await P.membership.findMany({ where: { tenantId: tid }, select: { userId: true, tenantId: true, role: true, acceptedAt: true, permissions: true } })) as M[]) : []);
  const systemsOf = async (tid: string): Promise<{ id: string; type: string }[]> => (okId(tid) ? ((await P.appSystem.findMany({ where: { tenantId: tid, active: true }, select: { id: true, type: true } })) as { id: string; type: string }[]) : []);

  await section("S2 AT-1 content", ["T0.2-S2.1", "T0.2-S2.2", "T0.2-S2.3", "T0.2-S2.4", "T0.2-S2.5", "T0.2-S2.6", "T0.2-S2.7", "T0.2-S2.8", "T0.2-S2.9"], async () => {
    const lack: string[] = [];
    for (const k of ["at1", "at2", "atx"] as const) {
      if (noTenant(k)) {
        lack.push(noTenant(k));
        continue;
      }
      const types = (await systemsOf(ids[k])).map((s) => s.type);
      const miss = SYSTEM_TYPES.filter((t) => !types.includes(t));
      if (miss.length) lack.push(`${nameOfTenant(ids[k])} lacks ${miss.join("/")}`);
    }
    chk("T0.2-S2.1", lack.length === 0, "5 system types × 3 tenants", lack.join(" · "));

    const m1 = await membersOf(ids.at1);
    const roleOf = (uid: string) => m1.find((m) => m.userId === uid);
    const wantRoles: [string, string, string][] = [[ids.ownerUserId, "OWNER", EMAIL.owner], [ids.approverUserId, "MANAGER", EMAIL.approver], [ids.staffUserId, "STAFF", EMAIL.staff]];
    const p2: string[] = [];
    if (noTenant("at1")) p2.push(noTenant("at1"));
    for (const [uid, role, email] of wantRoles) {
      const m = okId(uid) ? roleOf(uid) : undefined;
      if (!okId(uid)) p2.push(`user ${email} not found`);
      else if (!m) p2.push(`${email} is not a member of AT-1`);
      else if (m.role !== role) p2.push(`${email} is ${m.role}, want ${role}`);
      else if (!m.acceptedAt) p2.push(`${email} acceptedAt is null`);
    }
    if (m1.length !== 3) p2.push(`AT-1 has ${m1.length} members (want 3)`);
    chk("T0.2-S2.2", p2.length === 0, "3 accepted members OWNER/MANAGER/STAFF", p2.join(" · "));

    const sys1 = await systemsOf(ids.at1);
    const sysIds = (type: string) => sys1.filter((s) => s.type === type).map((s) => s.id);
    const crm = sysIds("CRM");
    const acc = sysIds("ACCOUNT");
    const chat = sysIds("CHAT");
    const t1 = okId(ids.at1) ? ids.at1 : "";
    const n = async (sql: string) => Number((await q(sql))[0]?.n ?? 0);

    const contacts = t1 && crm.length ? await P.crmContact.count({ where: { tenantId: t1, systemId: { in: crm }, archivedAt: null } }) : 0;
    const memberCustomers = t1 ? await P.customer.count({ where: { tenantId: t1 } }).catch(() => -1) : 0;
    chk("T0.2-S2.3", contacts >= 20, "≥ 20", `${noTenant("at1") || `${contacts} CrmContact`} (member Customer rows: ${memberCustomers})`);

    const deals = t1 && crm.length ? await P.crmDeal.count({ where: { tenantId: t1, systemId: { in: crm } } }) : 0;
    const openDeals = t1 && crm.length ? await P.crmDeal.count({ where: { tenantId: t1, systemId: { in: crm }, kind: "OPEN" } }) : 0;
    chk("T0.2-S2.4", deals >= 5, "≥ 5", `${noTenant("at1") || `${deals} CrmDeal`} (kind OPEN: ${openDeals})`);

    const invoices = t1 && acc.length
      ? await n(`select count(*)::int as n from "AccountDocument" where "tenantId" = '${t1}' and "systemId" in (${inList(acc)}) and "docType"::text = 'INVOICE' and "direction"::text = 'OUT' and "status"::text in ('AWAITING_PAYMENT','PARTIAL') and "docNo" is not null and "grandTotal" > "paidTotal"`)
      : 0;
    const anyInvoices = t1 ? await P.accountDocument.count({ where: { tenantId: t1, docType: "INVOICE" } }) : 0;
    chk("T0.2-S2.5", invoices >= 3, "≥ 3", `${noTenant("at1") || `${invoices} open`} (INVOICE rows of any status: ${anyInvoices})`);

    const threads = t1 && chat.length
      ? await n(`select count(*)::int as n from "ChatConversation" c where c."tenantId" = '${t1}' and c."systemId" in (${inList(chat)}) and c."status"::text = 'OPEN' and c."lastMessageDirection"::text = 'IN' and exists (select 1 from "ChatMessage" m where m."conversationId" = c.id and m."direction"::text = 'IN')`)
      : 0;
    const anyThreads = t1 ? await P.chatConversation.count({ where: { tenantId: t1 } }) : 0;
    chk("T0.2-S2.6", threads >= 3, "≥ 3", `${noTenant("at1") || `${threads} waiting`} (threads of any state: ${anyThreads})`);

    const kb = t1 ? ((await P.kbArticle.findMany({ where: { tenantId: t1, active: true }, select: { category: true } })) as { category: string | null }[]) : [];
    const cats = new Set(kb.map((k) => (k.category ?? "").trim()).filter(Boolean));
    chk("T0.2-S2.7", kb.length >= 3 && cats.size >= 2, "≥ 3 articles · ≥ 2 categories", `${noTenant("at1") || `${kb.length} articles`} · ${cats.size} categories`);

    const pols = t1 ? ((await P.approvalPolicy.findMany({ where: { tenantId: t1, entityType: "AccountDocument", active: true }, select: { thresholdSatang: true, steps: { select: { id: true } } } })) as { thresholdSatang: number | null; steps: { id: string }[] }[]) : [];
    chk("T0.2-S2.8", pols.some((p) => p.thresholdSatang === 2_000_000 && p.steps.length >= 1), "an active policy with thresholdSatang 2000000 and ≥ 1 step", `${noTenant("at1") || `${pols.length} active AccountDocument policies`}: ${pols.map((p) => `${p.thresholdSatang}/${p.steps.length} steps`).join(", ") || "-"}`);

    const perm = (uid: string) => ((okId(uid) ? roleOf(uid)?.permissions : null) ?? {}) as Record<string, unknown>;
    const p9: string[] = [];
    for (const k of ["account.doc.approve", "crm.commission.approve"]) if (perm(ids.approverUserId)[k] !== true) p9.push(`at-nid lacks ${k}`);
    for (const k of ["ai.chat.send", "ai.employee.use"]) if (perm(ids.staffUserId)[k] !== true) p9.push(`at-staff lacks ${k}`);
    chk("T0.2-S2.9", p9.length === 0, "the 4 keys are true in Membership.permissions", p9.join(" · "));
  });

  await section("S3 owners", ["T0.2-S3.1", "T0.2-S3.2"], async () => {
    const owners = async (tid: string) => (await membersOf(tid)).filter((m) => m.role === "OWNER");
    const o1 = await owners(ids.at1);
    const o2 = await owners(ids.at2);
    const ox = await owners(ids.atx);
    const fmt = (o: M[]) => o.map((m) => `${nameOfUser(m.userId)}${m.acceptedAt ? "" : "(not accepted)"}`).join(",") || "none";
    const same = o1.length === 1 && o2.length === 1 && o1[0]?.userId === o2[0]?.userId && okId(ids.ownerUserId) && o1[0]?.userId === ids.ownerUserId && !!o1[0]?.acceptedAt && !!o2[0]?.acceptedAt;
    chk("T0.2-S3.1", same, "AT-1 owner = AT-2 owner = at-owner@qc.shark (one accepted OWNER each)", `${noTenant("at1") || noTenant("at2") || ""} AT-1: ${fmt(o1)} · AT-2: ${fmt(o2)}`.trim());
    const ownerTenants = okId(ids.ownerUserId) ? ((await P.membership.findMany({ where: { userId: ids.ownerUserId }, select: { tenantId: true } })) as { tenantId: string }[]).map((m) => m.tenantId) : [];
    const otherTenants = okId(ids.otherOwnerUserId) ? ((await P.membership.findMany({ where: { userId: ids.otherOwnerUserId }, select: { tenantId: true } })) as { tenantId: string }[]).map((m) => m.tenantId) : [];
    const shared = ownerTenants.filter((t) => otherTenants.includes(t));
    const diff = ox.length === 1 && okId(ids.otherOwnerUserId) && ox[0]?.userId === ids.otherOwnerUserId && !!ox[0]?.acceptedAt && ids.otherOwnerUserId !== ids.ownerUserId && shared.length === 0;
    chk("T0.2-S3.2", diff, "AT-X owner = ax-owner@qc.shark ≠ at-owner · no shared tenant", `${noTenant("atx")} AT-X: ${fmt(ox)} · shared tenants: ${shared.map(nameOfTenant).join(",") || "none"}`.trim());
  });

  await section("X1 isolation", ["T0.2-X1.1", "T0.2-X1.2", "T0.2-X1.3"], async () => {
    const haveAll = at.every(okId) && ID_KEYS.every((k) => okId(ids[k]));
    const wantOf: [string, string, string[]][] = [
      [ids.ownerUserId, "at-owner", [ids.at1, ids.at2]],
      [ids.otherOwnerUserId, "ax-owner", [ids.atx]],
      [ids.approverUserId, "at-nid", [ids.at1]],
      [ids.staffUserId, "at-staff", [ids.at1]],
    ];
    const p1: string[] = [];
    for (const [uid, label, want] of wantOf) {
      if (!okId(uid)) {
        p1.push(`${label}: user not found`);
        continue;
      }
      const got = ((await P.membership.findMany({ where: { userId: uid }, select: { tenantId: true } })) as { tenantId: string }[]).map((m) => m.tenantId).sort();
      if (got.join(",") !== [...want].sort().join(",")) p1.push(`${label} is a member of ${got.map(nameOfTenant).join(",") || "nothing"} (want ${want.map(nameOfTenant).join(",")})`);
    }
    chk("T0.2-X1.1", haveAll && p1.length === 0, "owner {AT-1,AT-2} · other owner {AT-X} · approver {AT-1} · staff {AT-1}", haveAll ? p1.join(" · ") : `seed tenants/users incomplete · ${p1.join(" · ")}`);

    const wantIn: [string, string, string[]][] = [
      [ids.at1, "AT-1", [ids.ownerUserId, ids.approverUserId, ids.staffUserId]],
      [ids.at2, "AT-2", [ids.ownerUserId]],
      [ids.atx, "AT-X", [ids.otherOwnerUserId]],
    ];
    const p2: string[] = [];
    for (const [tid, label, want] of wantIn) {
      if (!okId(tid)) {
        p2.push(`${label}: tenant not found`);
        continue;
      }
      const got = (await membersOf(tid)).map((m) => m.userId).sort();
      if (got.join(",") !== [...want].sort().join(",")) p2.push(`${label} members = ${got.map(nameOfUser).join(",") || "none"} (want ${want.map(nameOfUser).join(",")})`);
    }
    chk("T0.2-X1.2", haveAll && p2.length === 0, "AT-1 {owner,nid,staff} · AT-2 {owner} · AT-X {other owner}", haveAll ? p2.join(" · ") : `seed tenants/users incomplete · ${p2.join(" · ")}`);

    const tids = at.filter(okId);
    const p3: string[] = [];
    let probed = 0;
    if (tids.length === 3) {
      const SYS_COL: [string, string][] = [["AppSystemUnit", "systemId"], ["CrmContact", "systemId"], ["CrmDeal", "systemId"], ["CrmPipeline", "systemId"], ["CrmStage", "systemId"], ["AccountDocument", "systemId"], ["AccountContact", "systemId"], ["ChatContact", "systemId"], ["ChatConversation", "systemId"], ["ChatMessage", "systemId"], ["Customer", "memberSystemId"]];
      for (const [t, c] of SYS_COL) {
        if (!has(t, "tenantId") || !has(t, c)) continue;
        probed += 1;
        const r = await q(`select count(*)::int as n from "${t}" x where x."tenantId" in (${inList(tids)}) and x."${c}" is not null and not exists (select 1 from "AppSystem" s where s.id = x."${c}" and s."tenantId" = x."tenantId")`);
        if (Number(r[0]?.n ?? 0) > 0) p3.push(`${t}.${c}: ${r[0].n} row(s) point at a system of another tenant`);
      }
      const USER_COL: [string, string][] = [["CrmContact", "ownerUserId"], ["CrmDeal", "ownerUserId"], ["ChatConversation", "assigneeUserId"]];
      for (const [t, c] of USER_COL) {
        if (!has(t, "tenantId") || !has(t, c)) continue;
        probed += 1;
        const r = await q(`select count(*)::int as n from "${t}" x where x."tenantId" in (${inList(tids)}) and x."${c}" is not null and not exists (select 1 from "Membership" m where m."userId" = x."${c}" and m."tenantId" = x."tenantId")`);
        if (Number(r[0]?.n ?? 0) > 0) p3.push(`${t}.${c}: ${r[0].n} row(s) name a user who is not a member of that tenant`);
      }
    }
    chk("T0.2-X1.3", tids.length === 3 && probed >= 10 && p3.length === 0, "0 cross-tenant references over ≥ 10 probed columns", tids.length === 3 ? `${probed} columns probed · ${p3.join(" · ") || "none"}` : `only ${tids.length}/3 seed tenants exist`);
  });

  await section("X10 runtime", ["T0.2-X10.2"], async () => {
    const leaks: string[] = [];
    for (const o of OUTPUTS) for (const n of leaksIn(o.out)) leaks.push(`${o.what} → ${n}`);
    const loaderRan = OUTPUTS.some((o) => o.what.startsWith("env-loader child (real QC4") && /S4CHILD LOADED/.test(o.out));
    chk("T0.2-X10.2", seedOk && loaderRan && leaks.length === 0, "seed ran twice + loader ran, and none of their output carries a URL/secret", `${seedOk ? "" : `seed did not run twice (exit ${seedRuns.map((r) => r.code).join("/") || "-"}) · `}${loaderRan ? "" : "loader did not run · "}leaks: ${[...new Set(leaks)].join(" · ") || "none"} (${OUTPUTS.length} outputs scanned)`);
  });
} catch (e) {
  console.log(`  ⚠️  the run stopped early: ${errMsg(e)}`);
} finally {
  // ═════════════ cleanup + S8 ═════════════
  console.log("\n── S8 residue ──");
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      /* retried by the next pass; counted by S8.1 */
    }
  };
  let s81 = "";
  let s81ok = false;
  try {
    if (COLS.size === 0) await loadCols();
    // this run's canary + anything an earlier crashed run of THIS oracle left behind (the tag is exclusive to this file)
    const stale = (await P.tenant.findMany({ where: { slug: { startsWith: TAG_PREFIX } }, select: { id: true } })) as { id: string }[];
    const tids = [...new Set([canaryTenantId, ...stale.map((t) => t.id)])].filter(okId);
    const staleUsers = (await P.user.findMany({ where: { email: { startsWith: TAG_PREFIX } }, select: { id: true } })) as { id: string }[];
    const uids = [...new Set([canaryUserId, ...staleUsers.map((u) => u.id)])].filter(okId);
    if (tids.length) {
      for (let pass = 0; pass < 3; pass += 1) for (const t of tenantTables()) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList(tids)})`));
      for (const id of tids) await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const id of uids) {
      await del(() => P.membership.deleteMany({ where: { userId: id } }));
      await del(() => P.user.delete({ where: { id } }));
    }
    const left: string[] = [];
    if (tids.length) for (const [k, v] of await countAll(tids)) left.push(`${k.split("|")[1]}=${v}`);
    const tenantsLeft = await P.tenant.count({ where: { slug: { startsWith: TAG_PREFIX } } });
    const usersLeft = await P.user.count({ where: { email: { startsWith: TAG_PREFIX } } });
    const kbLeft = await P.kbArticle.count({ where: { title: { startsWith: TAG_PREFIX } } });
    const polLeft = await P.approvalPolicy.count({ where: { name: { startsWith: TAG_PREFIX } } });
    const sysLeft = await P.appSystem.count({ where: { name: { startsWith: TAG_PREFIX } } });
    s81ok = left.length === 0 && tenantsLeft === 0 && usersLeft === 0 && kbLeft === 0 && polLeft === 0 && sysLeft === 0;
    s81 = `tenants ${tenantsLeft} · users ${usersLeft} · kb ${kbLeft} · policies ${polLeft} · systems ${sysLeft} · rows by tenantId: ${left.join(",") || "0"}`;
  } catch (e) {
    s81 = `cleanup failed: ${errMsg(e)}`;
  }
  chk("T0.2-S8.1", s81ok, "0 rows", s81);

  let s82 = "";
  let s82ok = false;
  try {
    rmSync(TMP, { recursive: true, force: true });
    const leftDirs = readdirSync(tmpdir()).filter((d) => d.startsWith(TAG_PREFIX)); // this run's + any an earlier crashed run left (reported, not swept)
    const st1 = await git(["status", "--porcelain", "--untracked-files=all", "--", ...WATCHED_PATHS]);
    const stateAfter = st1.out.trim();
    const changed = stateReadable && st1.code === 0 ? stateAfter.split("\n").filter((l) => l && !stateBefore.split("\n").includes(l)) : [];
    s82ok = leftDirs.length === 0 && stateReadable && st1.code === 0 && stateAfter === stateBefore;
    s82 = `temp dirs left ${leftDirs.length}${leftDirs.length ? ` (${cut(leftDirs.join(","), 120)})` : ""} · git status readable ${stateReadable && st1.code === 0} · new/changed paths: ${cut(changed.join(" , "), 400) || "none"}`;
  } catch (e) {
    s82 = `check failed: ${errMsg(e)}`;
  }
  chk("T0.2-S8.2", s82ok, "no temp dir · identical `git status` for src/messages, apps/mobile/src/i18n, src/app/api/mobile/team, prisma, docs", s82);

  // a check that was never reached still counts (red) — the total is the same in every run
  for (const id of Object.keys(CHECKS)) if (!done.has(id)) chk(id, false, "check evaluated", "not reached (the run stopped early)");
  await prisma.$disconnect().catch(() => undefined);
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
const blocking = findings.filter((f) => f.sev === "CRITICAL" || f.sev === "MAJOR").length;
console.log(`\n${passed === total ? "🟢" : "🔴"} T0.2: ${passed}/${total}${FORCE ? " (QC_FORCE)" : ""} · missing deliverables: ${MISSING.join(", ") || "none"} · residue tag ${TAG}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(blocking === 0 ? 0 : 1);
