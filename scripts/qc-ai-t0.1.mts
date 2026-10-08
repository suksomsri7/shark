// QC — AI TEAM (SHARK HUB v2) WO T0.1: measure the real cost per task — oracle of the probe `scripts/ai-team-cost-probe.mts`
// Oracle writer · the T0.1 builder must NOT touch this file · QC4 database only (host ep-frosty-lab) · this oracle NEVER calls the real provider
// Run (always this exact wrapper — QC_FORCE inside it):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-ai-t0.1.mts
//   (without QC_FORCE: SKIPPED + exit 0 while the probe is missing or the DB is not QC4 · with QC_FORCE=1: every check runs, missing things are RED, no crash)
// requires: ai-team-seed
//
// SOURCES: ledger/ai-team-briefs/ai-brief-T0.1.md (+ Controller addendum 8 Oct) · ai-brief-COMMON.md · ai-brief-RESOLUTIONS.md (R-A5 · R-E C34)
//   · ledger/AI-TEAM-RUN.md §2 "T0.1" (S1 3 · S2 2 · S3 2 · S4 2 · S5 3 = 12 minimum · X10 · X11)
//   · real code: src/lib/ai/service.ts (sendMessage :97 · charge :342) · provider.ts (pickModel :49 · MockProvider :95 · resolveProvider :210)
//     · credit.ts (chargeUsage :119 · topUp :197) · pricing.ts (costMicroUsd :39) · topup.ts (thbPerUsd :18) · src/lib/mobile/chat.ts (autoTitle :70)
//     · src/lib/mobile/conversations.ts (createConversation :42) · prisma/schema/ai_credit.prisma (AiCreditTxn :56, @@unique([tenantId, ref]) :83).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
// [1] scripts/ai-team-cost-probe.mts — first lines carry `// CONTROLLER-RUN · real provider · never in qc:all`.
//     ENV  AI_COST_PROBE=1   required. Anything else ⇒ exit 0 BEFORE loading env / opening a connection: no file written, no row written.
//          COST_CAP_USD      default 3 (> 0)            PROBE_ROUNDS  default 3 (integer ≥ 1)
//          PROBE_OUT         path of the markdown result, default ledger/AI-TEAM-COST-2026-10.md
//          PROBE_TENANT      at1 | at2 | atx, default at1 (ids through atIds())   · actor = aiMemberActor(AT-1, at-owner, its Membership)
//     Env is loaded ONLY through loadAiTeamQcEnv() of scripts/ai-team-qc-env.mts (no loadEnvFile, no dotenv, no ".env…" literal).
//     The probe never ASSIGNS SHARK_AI_MOCK / SHARK_AI_MODEL / SHARK_AI_KEY / SHARK_AI_PRICE_MARKUP / SHARK_THB_PER_USD (the caller decides);
//     it reads SHARK_AI_MOCK only to write `provider` ("mock" when it is "1", else "real"). It switches dataset collection off
//     (process.env.SHARK_AI_COLLECT = "0") — probe turns are not training data.
//     SAFETY  SHARK_AI_MOCK=1 and PROBE_OUT unset ⇒ refuse: exit 2, nothing written (a mock result must never land in the real ledger file).
//     EXIT    0 = finished (also when stopped by the cap) · 2 = refused / a run failed (sendMessage threw or returned ok:false; cleanup still runs)
//             · 4 = not QC4 (from the loader).
// [2] RUNS — 10 task types × PROBE_ROUNDS, ROUND-MAJOR order (round 1: types 1…10, then round 2, …), a NEW conversation per run, exactly ONE
//     user turn per run (one `sendMessage` ⇒ one CHAT charge). Thai prompts live in the probe file. Types (key · category · path), in this order:
//        1 chat-short · chat · mobile          6 fb-post · content · service
//        2 chat-history · chat · service       7 review-reply · content · service
//        3 quotation · quotation · service     8 invoice-from-quotation · quotation · service
//        4 stalled-deals · summaries · service 9 daily-summary · summaries · service
//        5 follow-up-silent · summaries · service  10 teach-back · teach · service
//     path service = `sendMessage(ctx, { text })` of src/lib/ai/service.ts with NO injected provider and NO `source` override (source CHAT).
//     path mobile  = `createConversation(ctx)` of src/lib/mobile/conversations.ts (empty title — what the app does), then
//                    `sendMobileChat(ctx, { conversationId, text })` of src/lib/mobile/chat.ts. (A conversation that sendMessage creates itself
//                    already has a title ⇒ autoTitle returns early and AUTO_TITLE is never charged — service.ts:196 + mobile/chat.ts:73.)
//     chat-history: the 10 earlier messages are INSERTED as AiMessage rows of the new conversation (data, no model call, no charge) before the
//                    one measured turn.
//     Charging is never bypassed and never done by the probe itself (X11): no chargeUsage*/chargePlatform, no AiCreditTxn/AiCreditWallet write
//     except the refund through `topUp`, no provider class, no fetch.
//     CAP   before STARTING each run: cumulative spend (micro-dollars read from the ledger) ≥ capMicro ⇒ stop, `stoppedByCap: true`, and the
//           markdown has a line containing `STOPPED BY CAP`. (So COST_CAP_USD=0.000001 ⇒ exactly one run: mock usage is > 0, see below.)
// [3] PER RUN the probe reads the AiCreditTxn rows kind USAGE of that conversationId (tenant = probe tenant):
//       model = `model` of the CHAT row (what was really charged: pickModel, after a low-balance degrade if any) · tokensIn/tokensOut/micro = Σ over
//       ALL its USAGE rows (CHAT + AUTO_TITLE; micro = −Σ amountMicro) · toolCalls = number of `deps.onToolCall` firings (the service exposes no
//       round counter) · cachedTokens = null (the provider layer does not report cache usage today) · wallMs = wall time of the turn.
// [4] RESULT FILE (markdown, UTF-8). No URL (`scheme://`) and no secret anywhere in it or on stdout. It contains:
//     (a) ONE table with exactly this header:  | # | type | round | model | tool calls | tokensIn | tokensOut | cached | micro | wall ms |
//         one row per run, plain integers (no thousands separator), cached = `-` when null — cell-for-cell equal to `rows` of (e).
//     (b) p50 / p95 / mean per type (nearest rank on the ascending micro values: value at index ceil(q·n) − 1).
//     (c) the weights (default mix chat 0.5 · quotation 0.1 · summaries 0.2 · content 0.1 · teach 0.1) and
//           categoryMeanMicro[c] = arithmetic mean of micro over all rows whose type has category c
//           weightedMeanMicro    = ceil( Σ_c weights[c] × categoryMeanMicro[c] )                       (integer)
//     (d) pack math with the formula written out (the names revenueMicro, allowanceMicro, margin, approxTasks, weightedMeanMicro, thbPerUsd
//         appear in the text), for priceThb 490 / 1490 / 3990:
//           revenueMicro   = round( priceThb / thbPerUsd() × 1_000_000 )        thbPerUsd() of src/lib/ai/topup.ts
//           allowanceMicro = floor( revenueMicro × (1 − margin) )               margin ≥ 0.5 (default 0.5) ⇒ 2 × allowanceMicro ≤ revenueMicro
//           approxTasks    = floor( allowanceMicro / weightedMeanMicro )
//         and a proposed FREE trial allowance + exactly 2 alternatives (three different allowanceMicro > 0, same approxTasks formula).
//     (e) exactly ONE fenced block opened by the line "```json probe-data":
//         { "version": 1, "runId": "<[a-z0-9]{6,16}>", "provider": "mock"|"real", "startedAt": ISO, "finishedAt": ISO,
//           "tenantId": str, "actorUserId": str, "capUsd": n, "capMicro": round(capUsd×1e6), "rounds": n, "stoppedByCap": bool,
//           "thbPerUsd": n, "margin": n,
//           "types": [ { "key", "category", "path" } ×10, the list of [2] ], "weights": { chat, quotation, summaries, content, teach },
//           "rows": [ { "n": 1…, "type", "round", "conversationId", "model", "toolCalls", "tokensIn", "tokensOut", "cachedTokens": null|n,
//                       "micro", "wallMs", "txnIds": [AiCreditTxn.id of every USAGE row of the conversation] } ],
//           "perType": [ { "type", "n", "p50Micro", "p95Micro", "meanMicro" } — one per type that has rows ],
//           "categoryMeanMicro": { … }, "weightedMeanMicro": n,
//           "packs": [ { "priceThb", "revenueMicro", "allowanceMicro", "approxTasks" } ×3 ],
//           "freeTrial": { "proposed": { "allowanceMicro", "approxTasks", "note" }, "alternatives": [ {…}, {…} ] },
//           "totals": { "runs", "tokensIn", "tokensOut", "spentMicro", "spentUsd" },
//           "cleanup": { "conversationsDeleted", "refundRef", "refundMicro", "walletBeforeMicro", "walletAfterMicro" } }
//         (pack math / freeTrial of a run stopped by the cap are not checked.)
// [5] CLEANUP — ONE phase after the last run, in `finally` (a failed run still cleans):
//       • hard-delete the probe conversations (AiConversation rows + their AiMessage / AiProposal / AiPlan / AiFeedback rows) and anything else the
//         turns wrote for the tenant (AiMemory, AiTrainingSample …): every tenant table of AT-1 has the same row count as before the probe,
//         except AiCreditTxn. Ledger rows are NEVER deleted (they are what S2 verifies, also for the real file, months later).
//       • AiUsage (daily net 300 requests / 400k tokens per tenant) is given back: requests / tokensIn / tokensOut of every day equal before/after
//         (single-statement decrement of what the probe added) — otherwise two probe runs starve every other AI-team oracle of that day.
//       • wallet: `topUp(tenant, spentMicro, { kind: "ADJUST", source: "ADJUST", ref: "qc-ai-t0.1-refund-<runId>" })` ⇒ balance equal before/after.
//         The ref MUST carry the runId: AiCreditTxn has @@unique([tenantId, ref]) and topUp swallows the duplicate (credit.ts:226), so the fixed
//         ref of the brief would refund only the first probe run ever.
//       • stdout: last line `PROBE_RESULT {"runs":n,"spentMicro":n,"spentUsd":n,"stoppedByCap":bool,"out":"<PROBE_OUT>","refundRef":"…"}`.
//         Never prints the key, a header, or a URL (X10).
//
// WHAT MockProvider REPORTS (provider.ts:95–105): tokensIn = ceil(Σ message chars / 4) (> 0: the system prompt is always there),
//   tokensOut = ceil(reply chars / 4) (> 0), model "mock". sendMessage charges with `routedModel` (pickModel → haiku/sonnet id, service.ts:344), so
//   under SHARK_AI_MOCK=1 every CHAT ledger row has a real model id, tokens > 0 and amountMicro < 0; the AUTO_TITLE row is charged with model
//   "mock" (mobile/chat.ts:82 → fallback rate). ⇒ "all fields > 0" IS asserted under mock (S1.2). What mock cannot prove is the real numbers:
//
// CHECKS THAT NEED THE REAL RESULT FILE ledger/AI-TEAM-COST-2026-10.md (written by the controller's real run):  T0.1-S1.5 · T0.1-S2.3 · T0.1-S4.4
//   absent  ⇒ reported `PENDING-REAL` (MINOR, counted NOT green, exit code unaffected) — the controller re-runs this oracle after the measurement
//   present ⇒ CRITICAL: provider "real", 30 rows, every field > 0, real model ids, table = data, Σ = totals = Σ ledger rows still in QC4 by txnIds,
//             stats and pack math recomputed.
//
// HOUSE RULES: SKIP guard before any DB connection · the probe is exercised ONLY as a child process with SHARK_AI_MOCK=1 and a dummy
//   SHARK_AI_KEY (so even a probe that ignored the mock flag could not buy a completion) · children write to os.tmpdir()/qc-ai-t0.1-<rand>,
//   never to the worktree · child output is never echoed raw (redacted) · this oracle tags nothing in the DB (if a broken probe leaves
//   conversations / usage / a wallet drift behind, the affected check is RED and a safety net restores AT-1, saying so) · fixed total ·
//   last line JSON_SUMMARY · exit 1 iff a CRITICAL/MAJOR check fails.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const PROBE_FILE = "scripts/ai-team-cost-probe.mts";
const ENV_FILE = "scripts/ai-team-qc-env.mts";
const REAL_FILE = "ledger/AI-TEAM-COST-2026-10.md";
const QC4_HOST_MARK = "ep-frosty-lab";
const AT1_SLUG = "qc-ai-team-at1";
const OWNER_EMAIL = "at-owner@qc.shark";
const REFUND_REF_PREFIX = "qc-ai-t0.1-refund-";
const FORCE = process.env.QC_FORCE === "1";

const TYPES: { key: string; category: string; path: string }[] = [
  { key: "chat-short", category: "chat", path: "mobile" },
  { key: "chat-history", category: "chat", path: "service" },
  { key: "quotation", category: "quotation", path: "service" },
  { key: "stalled-deals", category: "summaries", path: "service" },
  { key: "follow-up-silent", category: "summaries", path: "service" },
  { key: "fb-post", category: "content", path: "service" },
  { key: "review-reply", category: "content", path: "service" },
  { key: "invoice-from-quotation", category: "quotation", path: "service" },
  { key: "daily-summary", category: "summaries", path: "service" },
  { key: "teach-back", category: "teach", path: "service" },
];
const CATEGORIES = ["chat", "quotation", "summaries", "content", "teach"];
const DEFAULT_WEIGHTS: Record<string, number> = { chat: 0.5, quotation: 0.1, summaries: 0.2, content: 0.1, teach: 0.1 };
const PACK_PRICES = [490, 1490, 3990];
const TABLE_HEADER = ["#", "type", "round", "model", "tool calls", "tokensin", "tokensout", "cached", "micro", "wall ms"];
const PINNED_THB_PER_USD = 37.5; // not the default 36 ⇒ a hard-coded rate in the probe is caught (S4.2)

// ═══ SKIP guard — nothing to measure yet ⇒ SKIPPED, no DB connection opened ═══
const PROBE_MISSING = !existsSync(PROBE_FILE);
if (PROBE_MISSING && !FORCE) {
  console.log(`⚠️  SKIPPED — WO T0.1 not built yet (missing: ${PROBE_FILE})`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
if (FORCE && PROBE_MISSING) console.log(`⚠️  QC_FORCE=1 — running although the probe is missing (expected: RED for that reason, no crash): ${PROBE_FILE}`);

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
  console.error(`🔴 qc-ai-t0.1: database is not QC4 (${QC4_HOST_MARK}) — refusing to run (use scripts/qc4.sh)`);
  process.exit(4);
}

// ─────────────────────────── check table (ids are fixed: a red run and a green run report the same total) ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const CHECKS: Record<string, [string, Sev]> = {
  "T0.1-S1.1": ["[mock] the probe (defaults: cap 3, 3 rounds) exits 0 and writes a result file whose `probe-data` block has the contract shape: provider mock, 10 types, 30 rows in round-major order", "CRITICAL"],
  "T0.1-S1.2": ["[mock] every row has tokensIn / tokensOut / micro / wallMs > 0, a routed model id (haiku|sonnet), its own conversation of the AT-1 owner and ≥ 1 ledger row id", "CRITICAL"],
  "T0.1-S1.3": ["[mock] the 30-row markdown table equals the probe-data rows cell for cell", "CRITICAL"],
  "T0.1-S1.4": ["[mock] p50 / p95 / mean per type recompute from the rows (nearest rank)", "MAJOR"],
  "T0.1-S1.5": [`[REAL FILE] ${REAL_FILE}: provider real · 30 rows · every row tokensIn/tokensOut/micro > 0 and a real model id · table = data · totals ≤ cap`, "CRITICAL"],
  "T0.1-S2.1": ["[mock] per row: the AiCreditTxn USAGE rows of its conversation in QC4 are exactly `txnIds`, and their Σ micro / tokens equal the row", "CRITICAL"],
  "T0.1-S2.2": ["[mock] totals.spentMicro = Σ rows = Σ ledger = every USAGE row AT-1 gained during the run (no unlisted spend, no unlisted conversation)", "CRITICAL"],
  "T0.1-S2.3": [`[REAL FILE] ${REAL_FILE}: Σ micro of the file = Σ AiCreditTxn USAGE rows (by txnIds / conversation ids) still in the QC4 ledger`, "CRITICAL"],
  "T0.1-S3.1": ["[mock] full run: total spend ≤ COST_CAP_USD (default 3 = 3,000,000 micro), not stopped, stdout ends with PROBE_RESULT carrying the same spend", "CRITICAL"],
  "T0.1-S3.2": ["[mock] COST_CAP_USD=0.000001 ⇒ exit 0, exactly one run (type 1, round 1), stoppedByCap true + `STOPPED BY CAP` in the file, spend = ledger", "CRITICAL"],
  "T0.1-S3.3": ["without AI_COST_PROBE the probe exits 0 and does nothing: no file, no row, wallet untouched (qc-all can never trigger a measurement)", "CRITICAL"],
  "T0.1-S3.4": ["SHARK_AI_MOCK=1 without PROBE_OUT is refused (exit ≠ 0, nothing written): a mock result can never overwrite the real ledger file", "MAJOR"],
  "T0.1-S4.1": ["[mock] weights are in the file (default mix, Σ = 1) and categoryMeanMicro / weightedMeanMicro recompute from the table", "CRITICAL"],
  "T0.1-S4.2": ["[mock] pack math for 490 / 1,490 / 3,990 THB recomputes from the table at thbPerUsd() (pinned to 37.5 for the run), margin ≥ 50 %, formula + numbers in the text", "CRITICAL"],
  "T0.1-S4.3": ["[mock] FREE trial: one proposal + 2 alternatives, three different allowances, approxTasks recompute", "MAJOR"],
  "T0.1-S4.4": [`[REAL FILE] ${REAL_FILE}: p50/p95, weighted mean, pack math and FREE trial recompute from its own table`, "CRITICAL"],
  "T0.1-S5.1": ["no probe conversation is left after either run: 0 AiConversation rows and 0 rows in any table that references the listed conversation ids (ledger excepted)", "CRITICAL"],
  "T0.1-S5.2": ["AT-1 wallet balance is equal before and after each probe run", "CRITICAL"],
  "T0.1-S5.3": ["each run wrote exactly one ADJUST row ref qc-ai-t0.1-refund-<runId> of +spentMicro, and cleanup{} in the file says the same", "CRITICAL"],
  "T0.1-S5.4": ["every tenant table of AT-1 has the row count it had before the runs (ledger = exactly the listed rows + refunds) and the daily AiUsage net is given back", "MAJOR"],
  "T0.1-S5.5": ["oracle residue: no temp dir left, tracked paths of the worktree and the real ledger file exactly as before", "MAJOR"],
  "T0.1-X10.1": ["no probe output (stdout, stderr, result files) carries the key, a secret of this environment, an Authorization header or a URL", "CRITICAL"],
  "T0.1-X10.2": ["[static] the probe has no key literal, never prints/reads secrets or `.env`, loads env only through loadAiTeamQcEnv(); the real file (when present) is clean too", "CRITICAL"],
  "T0.1-X11.1": ["[static] the probe goes through sendMessage + createConversation/sendMobileChat and contains no charging/provider bypass (refund through topUp only)", "CRITICAL"],
  "T0.1-X11.2": ["[mock] every run was charged by the normal path: exactly one CHAT row priced by costMicroUsd(model, tokens); the mobile-path type also has exactly one AUTO_TITLE row, the others none", "CRITICAL"],
  "T0.1-X11.3": ["[mock] seen live while the probe ran: USER + ASSISTANT message pairs written by sendMessage (answers of MockProvider) in conversations that are all listed in the file", "CRITICAL"],
};
const REAL_IDS = ["T0.1-S1.5", "T0.1-S2.3", "T0.1-S4.4"];
const cks: { id: string; ok: boolean; sev: Sev; pending?: boolean }[] = [];
const done = new Set<string>();
const chk = (id: string, ok: unknown, e: string, a: string, opt: { pending?: boolean } = {}) => {
  const def = CHECKS[id];
  if (!def || done.has(id)) return;
  done.add(id);
  const pending = !ok && opt.pending === true;
  cks.push({ id, ok: !!ok, sev: pending ? "MINOR" : def[1], ...(pending ? { pending: true } : {}) });
  console.log(`  ${ok ? "✅" : pending ? "⏳" : "❌"} [${id}] ${def[0]}${ok ? "" : pending ? ` — PENDING-REAL: ${a}` : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const cut = (v: unknown, n = 300) => {
  const s = String(v ?? "");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const few = (list: string[], n = 4) => (list.length ? `${list.slice(0, n).join(" · ")}${list.length > n ? ` · +${list.length - n} more` : ""}` : "none");

// ─── secrets of this environment (values stay in memory; only the variable NAME is ever printed) ───
const CANARY_KEY = `qc-ai-t0.1-canary-${Math.random().toString(36).slice(2, 12)}-not-a-real-key`;
const SECRETS: { name: string; value: string }[] = [{ name: "SHARK_AI_KEY(canary)", value: CANARY_KEY }];
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
const ANY_URL_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>)]+/i;
/** secrets / provider traces — valid for every stream */
const leaksIn = (text: string): string[] => {
  const hit = new Set<string>();
  for (const s of SECRETS) if (text.includes(s.value)) hit.add(s.name);
  if (/postgres(?:ql)?:\/\/[^\s"'`<>/]*:[^\s"'`<>@]+@/.test(text)) hit.add("connection-url-with-credentials");
  if (/sk-or-[A-Za-z0-9_-]{8,}/.test(text)) hit.add("openrouter-key-pattern");
  if (/Bearer\s+[A-Za-z0-9._-]{8,}/.test(text)) hit.add("bearer-header");
  if (/openrouter\.ai/i.test(text)) hit.add("provider-host");
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

// ─── child processes ───
const TSX_BIN = join(ROOT, "node_modules", ".bin", "tsx");
type Run = { code: number; stdout: string; stderr: string; timedOut: boolean };
const sh = (cmd: string, args: string[], opt: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<Run> =>
  new Promise<Run>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };
    const child = spawn(cmd, args, { cwd: ROOT, env: opt.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM"); // the probe cleans up in `finally`; what it leaves behind is caught by S5 and the safety net
    }, opt.timeoutMs ?? 120_000);
    child.stdout?.on("data", (d: unknown) => {
      stdout += String(d);
      if (stdout.length > 4_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr?.on("data", (d: unknown) => {
      stderr += String(d);
      if (stderr.length > 4_000_000) stderr = stderr.slice(-2_000_000);
    });
    child.on("error", (e) => {
      stderr += `\n[spawn error] ${e.message}`;
      finish(127);
    });
    child.on("close", (code) => finish(code ?? 1));
  });
const git = (args: string[]) => sh("git", args, { timeoutMs: 60_000 });

// ─── temp space (outside the worktree) ───
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q").padEnd(6, "q");
const TAG_PREFIX = "qc-ai-t0.1-";
const TAG = `${TAG_PREFIX}${rand}`;
const TMP = join(tmpdir(), TAG);
const WATCHED_PATHS = ["scripts", "src", "prisma", "docs", REAL_FILE];

/**
 * env of every probe child: mock provider, a dummy key (exported values win over the QC env file, so the real key never reaches the child),
 * auto-routing on (a blank SHARK_AI_MODEL is "not forced" for pickModel), cost price ×1, a pinned exchange rate, and a daily net that cannot
 * be the reason a run fails. The probe's own switches are removed first; each call adds the ones it tests.
 */
const probeEnv = (extra: Record<string, string>): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of ["AI_COST_PROBE", "COST_CAP_USD", "PROBE_ROUNDS", "PROBE_OUT", "PROBE_TENANT", "QC_FORCE"]) delete env[k];
  env.SHARK_AI_MOCK = "1";
  env.SHARK_AI_KEY = CANARY_KEY;
  env.SHARK_AI_MODEL = " ";
  env.SHARK_AI_PRICE_MARKUP = "1";
  env.SHARK_THB_PER_USD = String(PINNED_THB_PER_USD);
  env.SHARK_AI_DAILY_REQ = "1000000";
  env.SHARK_AI_DAILY_TOKENS = "2000000000";
  return { ...env, ...extra };
};
const runProbe = (extra: Record<string, string>, timeoutMs: number) =>
  existsSync(TSX_BIN) ? sh(TSX_BIN, [PROBE_FILE], { env: probeEnv(extra), timeoutMs }) : sh("pnpm", ["exec", "tsx", PROBE_FILE], { env: probeEnv(extra), timeoutMs });

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const q = async (sql: string, ...params: unknown[]): Promise<Any[]> => (await P.$queryRawUnsafe(sql, ...params)) as Any[];
const okId = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_~-]{6,96}$/.test(x);
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

// ─────────────────────────── pure validators of a result file (shared by the mock runs and the real file) ───────────────────────────
const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const isPos = (x: unknown): x is number => isInt(x) && x > 0;
const near = (a: unknown, b: number, tol: number) => typeof a === "number" && Number.isFinite(a) && Math.abs(a - b) <= tol;
const rank = (sortedAsc: number[], qq: number) => sortedAsc[Math.max(0, Math.ceil(qq * sortedAsc.length) - 1)] ?? 0;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

type Parsed = { md: string; outside: string; data: Any; err: string };
const BLOCK_RE = /^```json probe-data[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
const parseResult = (path: string): Parsed => {
  if (!existsSync(path)) return { md: "", outside: "", data: null, err: "result file not written" };
  const md = readFileSync(path, "utf8");
  const blocks = [...md.matchAll(BLOCK_RE)];
  if (blocks.length !== 1) return { md, outside: md, data: null, err: `${blocks.length} fenced \`\`\`json probe-data blocks (want exactly 1)` };
  const outside = md.replace(BLOCK_RE, "");
  try {
    const data = JSON.parse(blocks[0]?.[1] ?? "") as Any;
    if (!data || typeof data !== "object" || Array.isArray(data)) return { md, outside, data: null, err: "probe-data is not a JSON object" };
    return { md, outside, data, err: "" };
  } catch (e) {
    return { md, outside, data: null, err: `probe-data is not valid JSON: ${errMsg(e)}` };
  }
};
const rowsOf = (d: Any): Any[] => (Array.isArray(d?.rows) ? (d.rows as Any[]) : []);
const microOf = (r: Any): number => (isInt(r?.micro) ? r.micro : 0);
const categoryOfType = (key: string): string => TYPES.find((t) => t.key === key)?.category ?? "";

/** header fields, type list, row order */
const vShape = (d: Any, want: { provider: string; full: boolean }): string[] => {
  const p: string[] = [];
  if (d?.version !== 1) p.push(`version ${JSON.stringify(d?.version)}`);
  if (typeof d?.runId !== "string" || !/^[a-z0-9]{6,16}$/.test(d.runId)) p.push(`runId ${JSON.stringify(d?.runId)}`);
  if (d?.provider !== want.provider) p.push(`provider ${JSON.stringify(d?.provider)} (want ${want.provider})`);
  for (const k of ["startedAt", "finishedAt"]) if (typeof d?.[k] !== "string" || !Number.isFinite(Date.parse(d[k]))) p.push(`${k} is not an ISO time`);
  for (const k of ["tenantId", "actorUserId"]) if (!okId(d?.[k])) p.push(`${k} missing`);
  if (!(typeof d?.capUsd === "number" && d.capUsd > 0)) p.push(`capUsd ${JSON.stringify(d?.capUsd)}`);
  else if (d.capMicro !== Math.round(d.capUsd * 1_000_000)) p.push(`capMicro ${JSON.stringify(d?.capMicro)} ≠ round(capUsd×1e6)`);
  if (!isPos(d?.rounds)) p.push(`rounds ${JSON.stringify(d?.rounds)}`);
  if (typeof d?.stoppedByCap !== "boolean") p.push("stoppedByCap is not a boolean");
  if (!(typeof d?.thbPerUsd === "number" && d.thbPerUsd > 0)) p.push(`thbPerUsd ${JSON.stringify(d?.thbPerUsd)}`);
  if (!(typeof d?.margin === "number" && d.margin >= 0.5 && d.margin < 1)) p.push(`margin ${JSON.stringify(d?.margin)} (want 0.5 ≤ margin < 1)`);
  const types = Array.isArray(d?.types) ? (d.types as Any[]) : [];
  const typeLine = (l: Any[]) => l.map((t) => `${t?.key}:${t?.category}:${t?.path}`).join(",");
  if (typeLine(types) !== typeLine(TYPES)) p.push(`types ≠ the 10 contract types in order (got ${cut(typeLine(types), 160) || "none"})`);
  const rows = rowsOf(d);
  if (!Array.isArray(d?.rows)) p.push("rows is not an array");
  rows.forEach((r, i) => {
    const wantType = TYPES[i % 10]?.key;
    const wantRound = Math.floor(i / 10) + 1;
    if (r?.n !== i + 1 || r?.type !== wantType || r?.round !== wantRound) p.push(`row ${i + 1}: n/type/round = ${r?.n}/${r?.type}/${r?.round} (want ${i + 1}/${wantType}/${wantRound})`);
  });
  if (want.full) {
    if (isPos(d?.rounds) && rows.length !== 10 * d.rounds) p.push(`${rows.length} rows (want ${10 * d.rounds} = 10 types × ${d.rounds} rounds)`);
    if (d?.stoppedByCap !== false) p.push("stoppedByCap is not false");
  }
  return p;
};
/** per-row values */
const vRows = (d: Any, modelOk: (m: string) => boolean, ownerPrefix: string | null): string[] => {
  const p: string[] = [];
  const rows = rowsOf(d);
  if (rows.length === 0) p.push("no rows");
  const convs = new Set<string>();
  const txns = new Set<string>();
  rows.forEach((r, i) => {
    const bad: string[] = [];
    for (const k of ["tokensIn", "tokensOut", "micro", "wallMs"]) if (!isPos(r?.[k])) bad.push(`${k}=${JSON.stringify(r?.[k])}`);
    if (!(isInt(r?.toolCalls) && r.toolCalls >= 0)) bad.push(`toolCalls=${JSON.stringify(r?.toolCalls)}`);
    if (!(r?.cachedTokens === null || (isInt(r?.cachedTokens) && r.cachedTokens >= 0))) bad.push(`cachedTokens=${JSON.stringify(r?.cachedTokens)}`);
    if (typeof r?.model !== "string" || !modelOk(r.model)) bad.push(`model=${JSON.stringify(r?.model)}`);
    if (!okId(r?.conversationId) || convs.has(r.conversationId)) bad.push("conversationId missing or repeated");
    else if (ownerPrefix && !String(r.conversationId).startsWith(ownerPrefix)) bad.push("conversation is not one of the AT-1 owner");
    convs.add(String(r?.conversationId));
    const ids = Array.isArray(r?.txnIds) ? (r.txnIds as unknown[]) : [];
    if (ids.length === 0 || ids.some((x) => !okId(x) || txns.has(x))) bad.push("txnIds empty / malformed / repeated");
    for (const x of ids) txns.add(String(x));
    if (bad.length) p.push(`row ${i + 1} (${r?.type}): ${bad.join(", ")}`);
  });
  return p;
};
const vTotals = (d: Any): string[] => {
  const p: string[] = [];
  const rows = rowsOf(d);
  const sum = (k: string) => rows.reduce((s, r) => s + (isInt(r?.[k]) ? r[k] : 0), 0);
  const t = d?.totals ?? {};
  if (t.runs !== rows.length) p.push(`totals.runs ${JSON.stringify(t.runs)} ≠ ${rows.length} rows`);
  for (const [tk, rk] of [["tokensIn", "tokensIn"], ["tokensOut", "tokensOut"], ["spentMicro", "micro"]] as const) if (t[tk] !== sum(rk)) p.push(`totals.${tk} ${JSON.stringify(t[tk])} ≠ Σ rows ${sum(rk)}`);
  if (!near(t.spentUsd, sum("micro") / 1_000_000, 1e-9)) p.push(`totals.spentUsd ${JSON.stringify(t.spentUsd)} ≠ spentMicro / 1e6`);
  return p;
};
/** the human table of the markdown = the machine rows */
const vTable = (outside: string, d: Any): string[] => {
  const lines = outside.split(/\r?\n/);
  const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const at = lines.findIndex((l) => l.trim().startsWith("|") && cells(l).map((c) => c.toLowerCase()).join("|") === TABLE_HEADER.join("|"));
  if (at < 0) return [`no table with the header | ${TABLE_HEADER.join(" | ")} |`];
  const body: string[][] = [];
  for (let i = at + 1; i < lines.length; i += 1) {
    const l = lines[i] ?? "";
    if (!l.trim().startsWith("|")) break;
    const c = cells(l);
    if (c.every((x) => /^:?-{2,}:?$/.test(x))) continue;
    body.push(c);
  }
  const rows = rowsOf(d);
  const p: string[] = [];
  if (body.length !== rows.length) p.push(`table has ${body.length} rows, probe-data has ${rows.length}`);
  rows.forEach((r, i) => {
    const want = [r?.n, r?.type, r?.round, r?.model, r?.toolCalls, r?.tokensIn, r?.tokensOut, r?.cachedTokens === null ? "-" : r?.cachedTokens, r?.micro, r?.wallMs].map((x) => String(x));
    const got = (body[i] ?? []).map((x) => x.replace(/`/g, ""));
    if (got.join("|") !== want.join("|")) p.push(`table row ${i + 1}: "${cut(got.join(" | "), 120)}" ≠ data "${cut(want.join(" | "), 120)}"`);
  });
  return p;
};
const vPerType = (d: Any): string[] => {
  const p: string[] = [];
  const rows = rowsOf(d);
  const per = Array.isArray(d?.perType) ? (d.perType as Any[]) : [];
  const keys = TYPES.map((t) => t.key).filter((k) => rows.some((r) => r?.type === k));
  if (per.map((x) => x?.type).join(",") !== keys.join(",")) p.push(`perType lists ${cut(per.map((x) => x?.type).join(","), 120) || "nothing"} (want one entry per type that has rows, in order)`);
  for (const k of keys) {
    const xs = rows.filter((r) => r?.type === k).map(microOf).sort((a, b) => a - b);
    const e = per.find((x) => x?.type === k);
    if (!e) continue;
    if (e.n !== xs.length || e.p50Micro !== rank(xs, 0.5) || e.p95Micro !== rank(xs, 0.95) || !near(e.meanMicro, mean(xs), 0.51)) {
      p.push(`${k}: n/p50/p95/mean = ${e.n}/${e.p50Micro}/${e.p95Micro}/${e.meanMicro} (recomputed ${xs.length}/${rank(xs, 0.5)}/${rank(xs, 0.95)}/${mean(xs).toFixed(2)})`);
    }
  }
  return p;
};
const weightedOf = (d: Any): { catMean: Record<string, number>; weighted: number; complete: boolean } => {
  const rows = rowsOf(d);
  const catMean: Record<string, number> = {};
  let complete = true;
  let acc = 0;
  for (const c of CATEGORIES) {
    const xs = rows.filter((r) => categoryOfType(String(r?.type)) === c).map(microOf);
    if (xs.length === 0) complete = false;
    const m = mean(xs);
    catMean[c] = m;
    acc += (typeof d?.weights?.[c] === "number" ? d.weights[c] : 0) * m;
  }
  return { catMean, weighted: acc, complete };
};
const vWeights = (d: Any, outside: string, wantDefault: boolean): string[] => {
  const p: string[] = [];
  const w = (d?.weights ?? {}) as Record<string, unknown>;
  if (Object.keys(w).sort().join(",") !== [...CATEGORIES].sort().join(",")) p.push(`weights keys = ${Object.keys(w).join(",") || "none"} (want ${CATEGORIES.join(",")})`);
  const vals = CATEGORIES.map((c) => (typeof w[c] === "number" ? (w[c] as number) : NaN));
  if (vals.some((v) => !(v >= 0)) || !near(vals.reduce((s, v) => s + v, 0), 1, 1e-9)) p.push(`weights do not sum to 1 (${vals.join("/")})`);
  if (wantDefault && CATEGORIES.some((c) => !near(w[c], DEFAULT_WEIGHTS[c] ?? -1, 1e-9))) p.push(`weights are not the default mix 0.5/0.1/0.2/0.1/0.1 (${vals.join("/")})`);
  for (const c of CATEGORIES) if (!new RegExp(`\\b${c}\\b`, "i").test(outside)) p.push(`category "${c}" is not written in the text of the file`);
  const { catMean, weighted, complete } = weightedOf(d);
  if (!complete) p.push("a category has no row — the weighted mean cannot be recomputed");
  for (const c of CATEGORIES) if (!near(d?.categoryMeanMicro?.[c], catMean[c] ?? 0, 0.51)) p.push(`categoryMeanMicro.${c} ${JSON.stringify(d?.categoryMeanMicro?.[c])} ≠ ${(catMean[c] ?? 0).toFixed(2)}`);
  if (!isPos(d?.weightedMeanMicro) || !near(d.weightedMeanMicro, Math.ceil(weighted - 1e-9), 1)) p.push(`weightedMeanMicro ${JSON.stringify(d?.weightedMeanMicro)} ≠ ceil(Σ weight × category mean) = ${Math.ceil(weighted - 1e-9)}`);
  return p;
};
const vPacks = (d: Any, outside: string): string[] => {
  const p: string[] = [];
  const packs = Array.isArray(d?.packs) ? (d.packs as Any[]) : [];
  if (packs.map((x) => x?.priceThb).join(",") !== PACK_PRICES.join(",")) p.push(`packs = ${packs.map((x) => x?.priceThb).join(",") || "none"} (want ${PACK_PRICES.join(",")})`);
  const wm = isPos(d?.weightedMeanMicro) ? d.weightedMeanMicro : 0;
  const rate = typeof d?.thbPerUsd === "number" && d.thbPerUsd > 0 ? d.thbPerUsd : 0;
  const margin = typeof d?.margin === "number" ? d.margin : 0.5;
  for (const price of PACK_PRICES) {
    const e = packs.find((x) => x?.priceThb === price);
    if (!e || !rate || !wm) {
      if (e) p.push(`${price}: thbPerUsd / weightedMeanMicro unusable`);
      continue;
    }
    const revenue = Math.round((price / rate) * 1_000_000);
    const allowance = Math.floor(revenue * (1 - margin));
    if (e.revenueMicro !== revenue) p.push(`${price}: revenueMicro ${JSON.stringify(e.revenueMicro)} ≠ round(${price} / ${rate} × 1e6) = ${revenue}`);
    if (!isPos(e.allowanceMicro) || !near(e.allowanceMicro, allowance, 1)) p.push(`${price}: allowanceMicro ${JSON.stringify(e.allowanceMicro)} ≠ floor(revenueMicro × (1 − ${margin})) = ${allowance}`);
    else {
      if (2 * e.allowanceMicro > revenue) p.push(`${price}: margin < 50 % (allowance ${e.allowanceMicro} of revenue ${revenue})`);
      if (e.approxTasks !== Math.floor(e.allowanceMicro / wm)) p.push(`${price}: approxTasks ${JSON.stringify(e.approxTasks)} ≠ floor(${e.allowanceMicro} / ${wm}) = ${Math.floor(e.allowanceMicro / wm)}`);
      for (const n of [e.allowanceMicro, e.approxTasks]) if (!new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(outside)) p.push(`${price}: the number ${n} is not in the text of the file`);
    }
  }
  for (const name of ["revenueMicro", "allowanceMicro", "margin", "approxTasks", "weightedMeanMicro", "thbPerUsd"]) if (!outside.includes(name)) p.push(`formula: "${name}" is not named in the text`);
  return p;
};
const vFree = (d: Any): string[] => {
  const p: string[] = [];
  const f = d?.freeTrial ?? {};
  const alts = Array.isArray(f.alternatives) ? (f.alternatives as Any[]) : [];
  if (!f.proposed || alts.length !== 2) return [`freeTrial needs proposed + exactly 2 alternatives (got proposed ${f.proposed ? "yes" : "no"} · ${alts.length} alternatives)`];
  const all = [f.proposed, ...alts] as Any[];
  const wm = isPos(d?.weightedMeanMicro) ? d.weightedMeanMicro : 0;
  all.forEach((o, i) => {
    const label = i === 0 ? "proposed" : `alternative ${i}`;
    if (!isPos(o?.allowanceMicro)) p.push(`${label}: allowanceMicro ${JSON.stringify(o?.allowanceMicro)}`);
    else if (!wm || o.approxTasks !== Math.floor(o.allowanceMicro / wm)) p.push(`${label}: approxTasks ${JSON.stringify(o?.approxTasks)} ≠ floor(${o.allowanceMicro} / ${wm})`);
    if (typeof o?.note !== "string" || o.note.trim().length < 10) p.push(`${label}: note missing (why this size)`);
  });
  if (new Set(all.map((o) => o?.allowanceMicro)).size !== 3) p.push("the three allowances are not different");
  return p;
};
/** no URL / secret in a result file or on stdout */
const vClean = (text: string, what: string): string[] => {
  const p = leaksIn(text).map((n) => `${what} → ${n}`);
  const url = ANY_URL_RE.exec(text);
  if (url) p.push(`${what} → a URL (${cut(url[0].replace(/:\/\/.*/, "://…"), 24)})`);
  return p;
};

// ─────────────────────────── DB helpers (AT-1 only) ───────────────────────────
type Cols = Map<string, Set<string>>;
let COLS: Cols = new Map();
const loadCols = async () => {
  const rows = await q(
    `select c.table_name as t, c.column_name as c from information_schema.columns c join information_schema.tables b on b.table_schema = c.table_schema and b.table_name = c.table_name ` +
      `where c.table_schema = 'public' and b.table_type = 'BASE TABLE' and c.column_name in ('tenantId','conversationId')`,
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
/** row count of every tenant-scoped table of one tenant (zero rows are absent) */
const countAll = async (tid: string): Promise<Map<string, number>> => {
  const out = new Map<string, number>();
  if (!okId(tid)) return out;
  const tables = [...COLS.keys()].filter((t) => has(t, "tenantId")).sort();
  const one = (t: string) => `select '${t}'::text as t, count(*)::int as n from "${t}" where "tenantId"::text = '${tid}'`;
  for (let i = 0; i < tables.length; i += 40) {
    const part = tables.slice(i, i + 40);
    let rows: Any[];
    try {
      rows = await q(part.map(one).join(" union all "));
    } catch {
      rows = [];
      for (const t of part) rows.push(...(await q(one(t)).catch(() => [])));
    }
    for (const r of rows) if (Number(r.n) > 0) out.set(String(r.t), Number(r.n));
  }
  return out;
};
type Txn = { id: string; kind: string; source: string; amountMicro: number; balanceAfter: number; model: string | null; tokensIn: number; tokensOut: number; conversationId: string | null; ref: string | null };
type Snap = { wallet: number | null; txnIds: Set<string>; convIds: Set<string>; usage: Map<string, string>; counts: Map<string, number> };
const snapshot = async (tid: string): Promise<Snap> => {
  const w = (await P.aiCreditWallet.findUnique({ where: { tenantId: tid }, select: { balanceMicro: true } })) as { balanceMicro: number } | null;
  const tx = (await P.aiCreditTxn.findMany({ where: { tenantId: tid }, select: { id: true } })) as { id: string }[];
  const cv = (await P.aiConversation.findMany({ where: { tenantId: tid }, select: { id: true } })) as { id: string }[];
  const us = (await P.aiUsage.findMany({ where: { tenantId: tid }, select: { day: true, requests: true, tokensIn: true, tokensOut: true } })) as { day: string; requests: number; tokensIn: number; tokensOut: number }[];
  const usage = new Map<string, string>();
  for (const u of us) if (u.requests || u.tokensIn || u.tokensOut) usage.set(u.day, `${u.requests}/${u.tokensIn}/${u.tokensOut}`);
  return { wallet: w ? w.balanceMicro : null, txnIds: new Set(tx.map((t) => t.id)), convIds: new Set(cv.map((c) => c.id)), usage, counts: await countAll(tid) };
};
const newTxns = async (tid: string, before: Snap): Promise<Txn[]> => {
  const rows = (await P.aiCreditTxn.findMany({
    where: { tenantId: tid },
    select: { id: true, kind: true, source: true, amountMicro: true, balanceAfter: true, model: true, tokensIn: true, tokensOut: true, conversationId: true, ref: true },
    orderBy: { createdAt: "asc" },
  })) as Txn[];
  return rows.filter((r) => !before.txnIds.has(r.id));
};
/** tables whose count may legitimately differ: the ledger (append-only), a lazily opened wallet, a lazily created (now zero) AiUsage day row */
const LEDGER_TABLES = new Set(["AiCreditTxn", "AiCreditWallet", "AiUsage"]);
const countDiff = (a: Map<string, number>, b: Map<string, number>): string[] => {
  const out: string[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (LEDGER_TABLES.has(k)) continue;
    if ((a.get(k) ?? 0) !== (b.get(k) ?? 0)) out.push(`${k}: ${a.get(k) ?? 0}→${b.get(k) ?? 0}`);
  }
  return out.sort();
};
const usageDiff = (a: Map<string, string>, b: Map<string, string>): string[] => {
  const out: string[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) if ((a.get(k) ?? "0/0/0") !== (b.get(k) ?? "0/0/0")) out.push(`AiUsage ${k} (req/in/out): ${a.get(k) ?? "0/0/0"}→${b.get(k) ?? "0/0/0"}`);
  return out.sort();
};
/** what is still in the database for a list of conversation ids, outside the ledger */
const convLeft = async (tid: string, convIds: string[]): Promise<string[]> => {
  const ids = convIds.filter(okId);
  if (ids.length === 0) return [];
  const out: string[] = [];
  const n = Number((await q(`select count(*)::int as n from "AiConversation" where "tenantId" = '${tid}' and id in (${inList(ids)})`))[0]?.n ?? 0);
  if (n > 0) out.push(`AiConversation=${n}`);
  for (const t of [...COLS.keys()].sort()) {
    if (t === "AiCreditTxn" || !has(t, "conversationId")) continue;
    const r = await q(`select count(*)::int as n from "${t}" where "conversationId"::text in (${inList(ids)})`).catch(() => []);
    if (Number(r[0]?.n ?? 0) > 0) out.push(`${t}=${r[0].n}`);
  }
  return out;
};

/** live view of what the child writes: message pairs per conversation of the AT-1 owner, unioned over all polls */
type Seen = Map<string, { user: boolean; assistant: boolean; mock: boolean; tokens: boolean }>;
const watch = (tid: string, ownerPrefix: string, before: Snap) => {
  const seen: Seen = new Map();
  let busy = false;
  let polls = 0;
  const tick = async () => {
    const rows = await q(
      `select m."conversationId" as c, m.role::text as r, m."tokensIn" as ti, left(m.content, 12) as head from "AiMessage" m where m."tenantId" = $1 and starts_with(m."conversationId", $2)`,
      tid,
      ownerPrefix,
    );
    polls += 1;
    for (const r of rows) {
      const c = String(r.c);
      if (before.convIds.has(c)) continue;
      const e = seen.get(c) ?? { user: false, assistant: false, mock: false, tokens: false };
      if (r.r === "USER") e.user = true;
      if (r.r === "ASSISTANT") {
        e.assistant = true;
        if (String(r.head).startsWith("รับทราบ")) e.mock = true; // MockProvider's fixed prefix (provider.ts:99)
        if (Number(r.ti) > 0) e.tokens = true;
      }
      seen.set(c, e);
    }
  };
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    tick()
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  }, 200);
  return {
    stop: async (): Promise<{ seen: Seen; polls: number }> => {
      clearInterval(timer);
      for (let i = 0; i < 200 && busy; i += 1) await new Promise((r) => setTimeout(r, 25));
      return { seen, polls };
    },
  };
};

// ─────────────────────────── the run ───────────────────────────
console.log(`QC T0.1 — AI TEAM cost probe (mock provider only) · host ${host.split(".")[0]} · tag ${TAG}${FORCE ? " · QC_FORCE" : ""}`);

type ProbeRun = { name: string; run: Run | null; before: Snap | null; after: Snap | null; txns: Txn[]; parsed: Parsed; out: string; seen: Seen; polls: number };
const blankRun = (name: string): ProbeRun => ({ name, run: null, before: null, after: null, txns: [], parsed: { md: "", outside: "", data: null, err: "probe did not run" }, out: "", seen: new Map(), polls: 0 });
let guardRun = blankRun("no AI_COST_PROBE");
let refuseRun = blankRun("mock without PROBE_OUT");
let fullRun = blankRun("full");
let capRun = blankRun("cap");
const OUTPUTS: { what: string; stdout: string; stderr: string }[] = [];
const safetyNotes: string[] = [];
let tenantId = "";
let ownerUserId = "";
let ownerPrefix = "";
let first: Snap | null = null;
let stateBefore = "";
let stateReadable = false;
const realHashBefore = existsSync(REAL_FILE) ? createHash("sha256").update(readFileSync(REAL_FILE)).digest("hex") : "absent";
const realBytesBefore = existsSync(REAL_FILE) ? readFileSync(REAL_FILE) : null;
const realHashNow = () => (existsSync(REAL_FILE) ? createHash("sha256").update(readFileSync(REAL_FILE)).digest("hex") : "absent");
const why = () => (PROBE_MISSING ? `${PROBE_FILE} missing` : !okId(tenantId) || !okId(ownerUserId) ? "AI-team seed not found on this database (tenant qc-ai-team-at1 / at-owner@qc.shark)" : "");

/** one child run of the probe with a before/after picture of AT-1 */
const measure = async (name: string, extra: Record<string, string>, opt: { out?: string; timeoutMs: number; live?: boolean }): Promise<ProbeRun> => {
  const r = blankRun(name);
  r.out = opt.out ?? "";
  r.before = await snapshot(tenantId);
  const w = opt.live ? watch(tenantId, ownerPrefix, r.before) : null;
  r.run = await runProbe({ ...extra, ...(opt.out ? { PROBE_OUT: opt.out } : {}) }, opt.timeoutMs);
  if (w) {
    const s = await w.stop();
    r.seen = s.seen;
    r.polls = s.polls;
  }
  OUTPUTS.push({ what: `probe (${name})`, stdout: r.run.stdout, stderr: r.run.stderr });
  r.after = await snapshot(tenantId);
  r.txns = await newTxns(tenantId, r.before);
  if (opt.out) r.parsed = parseResult(opt.out);
  console.log(`  · probe (${name}): exit ${r.run.code}${r.run.timedOut ? " (timed out)" : ""} · ${r.txns.length} new ledger rows · stdout ${show(r.run.stdout.split("\n").filter(Boolean).slice(-1)[0] ?? "", 160) || "-"}`);
  return r;
};
const untouched = (r: ProbeRun): string[] => {
  if (!r.before || !r.after) return ["not measured"];
  const p = [...countDiff(r.before.counts, r.after.counts), ...usageDiff(r.before.usage, r.after.usage)];
  if (r.before.wallet !== r.after.wallet) p.push(`wallet ${r.before.wallet}→${r.after.wallet}`);
  if (r.txns.length) p.push(`${r.txns.length} new ledger rows`);
  const newConv = [...r.after.convIds].filter((c) => !r.before?.convIds.has(c)).length;
  if (newConv) p.push(`${newConv} new conversations`);
  return p;
};
const resultLine = (stdout: string): Any => {
  const line = stdout.split(/\r?\n/).filter((l) => l.startsWith("PROBE_RESULT ")).slice(-1)[0];
  if (!line) return null;
  try {
    return JSON.parse(line.slice("PROBE_RESULT ".length)) as Any;
  } catch {
    return null;
  }
};
/** ledger rows of the listed conversations vs the file (S2) */
const ledgerOf = (d: Any, txns: Txn[]) => {
  const usage = txns.filter((t) => t.kind === "USAGE");
  const problems: string[] = [];
  let sum = 0;
  for (const r of rowsOf(d)) {
    const mine = usage.filter((t) => t.conversationId === r?.conversationId);
    const ids = (Array.isArray(r?.txnIds) ? (r.txnIds as unknown[]).map(String) : []).sort().join(",");
    const micro = mine.reduce((s, t) => s - t.amountMicro, 0);
    sum += micro;
    const tin = mine.reduce((s, t) => s + t.tokensIn, 0);
    const tout = mine.reduce((s, t) => s + t.tokensOut, 0);
    if (mine.length === 0) problems.push(`row ${r?.n}: no USAGE row in the ledger for its conversation`);
    else if (mine.map((t) => t.id).sort().join(",") !== ids) problems.push(`row ${r?.n}: txnIds ≠ the ${mine.length} ledger rows of the conversation`);
    else if (micro !== r?.micro || tin !== r?.tokensIn || tout !== r?.tokensOut) problems.push(`row ${r?.n}: micro/in/out ${r?.micro}/${r?.tokensIn}/${r?.tokensOut} ≠ ledger ${micro}/${tin}/${tout}`);
  }
  const listed = new Set(rowsOf(d).map((r) => String(r?.conversationId)));
  const unlisted = usage.filter((t) => !t.conversationId || !listed.has(t.conversationId));
  return { problems, sum, unlisted, usageTotal: usage.reduce((s, t) => s - t.amountMicro, 0) };
};

try {
  mkdirSync(TMP, { recursive: true });
  const st0 = await git(["status", "--porcelain", "--untracked-files=all", "--", ...WATCHED_PATHS]);
  stateReadable = st0.code === 0;
  stateBefore = st0.stdout.trim();
  await loadCols();
  tenantId = String(((await P.tenant.findUnique({ where: { slug: AT1_SLUG }, select: { id: true } })) as { id: string } | null)?.id ?? "");
  ownerUserId = String(((await P.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } })) as { id: string } | null)?.id ?? "");
  ownerPrefix = `u~${ownerUserId}~`;
  const src = read(PROBE_FILE);
  // comments are not code: a header that says "never calls chargeUsage" must not trip the static checks
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const ready = !PROBE_MISSING && okId(tenantId) && okId(ownerUserId);
  if (ready) first = await snapshot(tenantId);

  // ═════════════ static ═════════════
  await section("X10 / X11 [static]", ["T0.1-X10.2", "T0.1-X11.1"], async () => {
    if (PROBE_MISSING) {
      chk("T0.1-X10.2", false, `${PROBE_FILE} exists`, "file missing");
      chk("T0.1-X11.1", false, `${PROBE_FILE} exists`, "file missing");
      return;
    }
    const p10: string[] = leaksIn(src).map((n) => `source contains ${n}`);
    if (/loadEnvFile|dotenv/.test(code)) p10.push("loads an env file itself");
    if (/["'`]\.env/.test(code)) p10.push('names a ".env…" file');
    if (!/ai-team-qc-env/.test(code) || !/loadAiTeamQcEnv\s*\(/.test(code)) p10.push("does not load env through loadAiTeamQcEnv()");
    if (/Authorization/i.test(code)) p10.push("mentions an Authorization header");
    for (const l of code.split("\n")) if (/(console\.\w+|process\.std(out|err)\.write)\s*\(/.test(l) && /SHARK_AI_KEY|DATABASE_URL|DIRECT_URL/.test(l)) p10.push(`prints a secret variable: ${cut(l.trim(), 80)}`);
    if (!/CONTROLLER-RUN/.test(src.split("\n").slice(0, 6).join("\n"))) p10.push("header marker `CONTROLLER-RUN` not in the first lines");
    if (existsSync(REAL_FILE)) p10.push(...vClean(read(REAL_FILE), REAL_FILE));
    chk("T0.1-X10.2", p10.length === 0, "no key / URL / env-file access; env through loadAiTeamQcEnv(); CONTROLLER-RUN header", few(p10));

    const p11: string[] = [];
    if (!/@\/lib\/ai\/service/.test(code) || !/\bsendMessage\b/.test(code)) p11.push("does not use sendMessage of @/lib/ai/service");
    if (!/@\/lib\/mobile\/chat/.test(code) || !/\bsendMobileChat\b/.test(code)) p11.push("does not use sendMobileChat of @/lib/mobile/chat");
    if (!/@\/lib\/mobile\/conversations/.test(code) || !/\bcreateConversation\b/.test(code)) p11.push("does not open the mobile conversation with createConversation (AUTO_TITLE would never be charged)");
    if (!/\btopUp\s*\(/.test(code) || !src.includes(REFUND_REF_PREFIX.slice(0, -1))) p11.push("no refund through topUp with ref qc-ai-t0.1-refund-<runId>");
    if (!/AI_COST_PROBE/.test(code)) p11.push("no AI_COST_PROBE guard");
    const banned: [RegExp, string][] = [
      [/\bcharge(Usage|UsageSafe|Platform)\b/, "calls a charge function itself"],
      [/aiCreditTxn\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/, "writes AiCreditTxn itself"],
      [/aiCreditWallet\s*\.\s*(create|update|updateMany|upsert|delete|deleteMany)\b/, "writes AiCreditWallet itself"],
      [/\$executeRaw/, "raw SQL write"],
      [/\b(MockProvider|OpenRouterProvider|resolveProvider)\b/, "touches a provider class / resolver"],
      [/\bfetch\s*\(/, "calls fetch"],
      [/process\.env\.(SHARK_AI_MOCK|SHARK_AI_MODEL|SHARK_AI_KEY|SHARK_AI_PRICE_MARKUP|SHARK_THB_PER_USD)\s*(=(?!=)|\?\?=|\|\|=)/, "assigns a SHARK_AI_* switch"],
      [/delete\s+process\.env\.SHARK_/, "deletes a SHARK_* switch"],
    ];
    for (const [re, msg] of banned) if (re.test(code)) p11.push(msg);
    chk("T0.1-X11.1", p11.length === 0, "sendMessage + createConversation/sendMobileChat · topUp refund · no bypass", few(p11));
  });

  // ═════════════ guard: nothing happens without AI_COST_PROBE ═════════════
  await section("S3 guards", ["T0.1-S3.3", "T0.1-S3.4"], async () => {
    if (!ready) {
      chk("T0.1-S3.3", false, "probe + seed present", why());
      chk("T0.1-S3.4", false, "probe + seed present", why());
      return;
    }
    const gOut = join(TMP, "guard.md");
    guardRun = await measure("no AI_COST_PROBE", { COST_CAP_USD: "0.000001", PROBE_ROUNDS: "1" }, { out: gOut, timeoutMs: 180_000 });
    const g = [...untouched(guardRun)];
    if (existsSync(gOut)) g.push("a result file was written");
    if (realHashNow() !== realHashBefore) g.push(`${REAL_FILE} changed`);
    chk("T0.1-S3.3", guardRun.run?.code === 0 && g.length === 0, "exit 0 · no file · no row · wallet untouched", `exit ${guardRun.run?.code} · ${few(g)}`);

    // mock + default output path = refused (run with a tiny cap and one round, so a probe that does not refuse stays cheap)
    refuseRun = await measure("mock without PROBE_OUT", { AI_COST_PROBE: "1", COST_CAP_USD: "0.000001", PROBE_ROUNDS: "1" }, { timeoutMs: 180_000 });
    const m = [...untouched(refuseRun)];
    if (realHashNow() !== realHashBefore) m.push(`${REAL_FILE} was written by a mock run`);
    chk("T0.1-S3.4", (refuseRun.run?.code ?? 0) !== 0 && !refuseRun.run?.timedOut && m.length === 0, "exit ≠ 0 · real ledger file untouched · no row", `exit ${refuseRun.run?.code} · ${few(m)}`);
  });

  // ═════════════ the full mock run (defaults: cap 3 USD · 3 rounds) ═════════════
  console.log("\n── full mock run ──");
  if (ready) {
    try {
      fullRun = await measure("full", { AI_COST_PROBE: "1" }, { out: join(TMP, "full.md"), timeoutMs: 900_000, live: true });
    } catch (e) {
      console.log(`  ⚠️  full run could not be measured: ${errMsg(e)}`);
    }
  } else console.log(`  · not started: ${why()}`);
  const F = fullRun;
  const fd = F.parsed.data as Any;
  const fNote = () => why() || (F.run ? (F.parsed.err ? `exit ${F.run.code} · ${F.parsed.err} · stderr: ${show(F.run.stderr.split("\n").filter(Boolean).slice(-2).join(" / "), 200) || "-"}` : "") : "probe did not run");
  const provider = await import("@/lib/ai/provider");
  const routed = new Set<string>([provider.FAST_MODEL, provider.SMART_MODEL]);

  await section("S1 result file [mock]", ["T0.1-S1.1", "T0.1-S1.2", "T0.1-S1.3", "T0.1-S1.4"], async () => {
    if (!fd) {
      for (const id of ["T0.1-S1.1", "T0.1-S1.2", "T0.1-S1.3", "T0.1-S1.4"]) chk(id, false, "a parsable result file of the full mock run", fNote());
      return;
    }
    const p1 = vShape(fd, { provider: "mock", full: true });
    if (fd.rounds !== 3 || fd.capUsd !== 3) p1.push(`defaults: rounds ${fd.rounds} / capUsd ${fd.capUsd} (want 3 / 3)`);
    if (fd.tenantId !== tenantId || fd.actorUserId !== ownerUserId) p1.push("tenantId / actorUserId are not AT-1 / at-owner");
    chk("T0.1-S1.1", F.run?.code === 0 && p1.length === 0 && rowsOf(fd).length === 30, "exit 0 · contract shape · 30 rows", `exit ${F.run?.code} · ${rowsOf(fd).length} rows · ${few(p1)}`);
    const p2 = vRows(fd, (m) => routed.has(m), ownerPrefix);
    chk("T0.1-S1.2", rowsOf(fd).length === 30 && p2.length === 0, "30 rows, all > 0, model ∈ {haiku, sonnet} id", `${rowsOf(fd).length} rows · ${few(p2)}`);
    const p3 = vTable(F.parsed.outside, fd);
    chk("T0.1-S1.3", rowsOf(fd).length === 30 && p3.length === 0, "table = rows", few(p3));
    const p4 = vPerType(fd);
    chk("T0.1-S1.4", rowsOf(fd).length === 30 && p4.length === 0, "p50 / p95 / mean per type as recomputed", few(p4));
  });

  await section("S2 ledger [mock]", ["T0.1-S2.1", "T0.1-S2.2"], async () => {
    if (!fd) {
      for (const id of ["T0.1-S2.1", "T0.1-S2.2"]) chk(id, false, "a parsable result file of the full mock run", fNote());
      return;
    }
    const L = ledgerOf(fd, F.txns);
    chk("T0.1-S2.1", rowsOf(fd).length > 0 && L.problems.length === 0, "txnIds / Σ micro / Σ tokens per row = ledger", few(L.problems));
    const p: string[] = [...vTotals(fd)];
    if (fd.totals?.spentMicro !== L.sum) p.push(`totals.spentMicro ${fd.totals?.spentMicro} ≠ Σ ledger of the listed conversations ${L.sum}`);
    if (L.unlisted.length) p.push(`${L.unlisted.length} USAGE row(s) of the run belong to no listed conversation (${L.usageTotal - L.sum} micro unlisted)`);
    const listed = new Set(rowsOf(fd).map((r) => String(r?.conversationId)));
    const stray = [...F.seen.keys()].filter((c) => !listed.has(c));
    if (stray.length) p.push(`${stray.length} conversation(s) written during the run are not listed in the file`);
    chk("T0.1-S2.2", rowsOf(fd).length > 0 && L.sum > 0 && p.length === 0, "totals = Σ rows = Σ ledger = all USAGE of the run", `Σ ledger ${L.sum} · ${few(p)}`);
  });

  await section("S3 cap", ["T0.1-S3.1", "T0.1-S3.2"], async () => {
    if (!fd) chk("T0.1-S3.1", false, "a parsable result file of the full mock run", fNote());
    else {
      const res = resultLine(F.run?.stdout ?? "");
      const p: string[] = [];
      const spent = fd.totals?.spentMicro;
      if (fd.capMicro !== 3_000_000) p.push(`capMicro ${fd.capMicro}`);
      if (!(isPos(spent) && spent <= 3_000_000)) p.push(`spentMicro ${spent}`);
      if (fd.stoppedByCap !== false || /STOPPED BY CAP/.test(F.parsed.outside)) p.push("the file says it was stopped by the cap");
      if (!res) p.push("no PROBE_RESULT line on stdout");
      else if (res.spentMicro !== spent || res.runs !== rowsOf(fd).length || res.stoppedByCap !== false || !near(res.spentUsd, Number(spent) / 1_000_000, 1e-9)) p.push(`PROBE_RESULT ${cut(JSON.stringify(res), 160)} ≠ the file (runs ${rowsOf(fd).length} · spentMicro ${spent})`);
      chk("T0.1-S3.1", p.length === 0, "0 < spend ≤ 3,000,000 micro · not stopped · PROBE_RESULT = file", few(p));
    }
    if (!ready) {
      chk("T0.1-S3.2", false, "probe + seed present", why());
      return;
    }
    capRun = await measure("cap", { AI_COST_PROBE: "1", COST_CAP_USD: "0.000001" }, { out: join(TMP, "cap.md"), timeoutMs: 300_000 });
    const cd = capRun.parsed.data as Any;
    if (!cd) {
      chk("T0.1-S3.2", false, "a parsable result file of the capped run", `exit ${capRun.run?.code} · ${capRun.parsed.err}`);
      return;
    }
    const p = vShape(cd, { provider: "mock", full: false });
    const rows = rowsOf(cd);
    if (rows.length !== 1) p.push(`${rows.length} runs (want exactly 1: the cap is checked before each run and the first run costs > 0)`);
    if (cd.capMicro !== 1) p.push(`capMicro ${cd.capMicro} (want 1)`);
    if (cd.stoppedByCap !== true) p.push("stoppedByCap is not true");
    if (!/STOPPED BY CAP/.test(capRun.parsed.outside)) p.push("the file has no `STOPPED BY CAP` line");
    const L = ledgerOf(cd, capRun.txns);
    if (L.problems.length || L.unlisted.length) p.push(...L.problems, ...(L.unlisted.length ? [`${L.unlisted.length} unlisted USAGE row(s)`] : []));
    if (!(isPos(cd.totals?.spentMicro) && cd.totals.spentMicro === L.sum && L.sum >= 1)) p.push(`spentMicro ${cd.totals?.spentMicro} vs ledger ${L.sum}`);
    if (resultLine(capRun.run?.stdout ?? "")?.stoppedByCap !== true) p.push("PROBE_RESULT does not say stoppedByCap");
    chk("T0.1-S3.2", capRun.run?.code === 0 && p.length === 0, "exit 0 · 1 run · stoppedByCap · spend = ledger", `exit ${capRun.run?.code} · ${rows.length} runs · ${few(p)}`);
  });

  await section("S4 pack math [mock]", ["T0.1-S4.1", "T0.1-S4.2", "T0.1-S4.3"], async () => {
    if (!fd) {
      for (const id of ["T0.1-S4.1", "T0.1-S4.2", "T0.1-S4.3"]) chk(id, false, "a parsable result file of the full mock run", fNote());
      return;
    }
    const p1 = vWeights(fd, F.parsed.outside, true);
    chk("T0.1-S4.1", p1.length === 0, "default weights · category means · weightedMeanMicro", few(p1));
    const p2 = vPacks(fd, F.parsed.outside);
    if (fd.thbPerUsd !== PINNED_THB_PER_USD) p2.unshift(`thbPerUsd ${fd.thbPerUsd} — the run had SHARK_THB_PER_USD=${PINNED_THB_PER_USD} (the probe does not read thbPerUsd())`);
    chk("T0.1-S4.2", p1.length === 0 && p2.length === 0, "revenue / allowance / approxTasks per pack as recomputed", few(p1.length ? ["weighted mean wrong (S4.1)", ...p2] : p2));
    const p3 = vFree(fd);
    chk("T0.1-S4.3", p3.length === 0, "proposed + 2 alternatives", few(p3));
  });

  await section("X11 charging path [mock]", ["T0.1-X11.2", "T0.1-X11.3"], async () => {
    if (!fd) {
      for (const id of ["T0.1-X11.2", "T0.1-X11.3"]) chk(id, false, "a parsable result file of the full mock run", fNote());
      return;
    }
    process.env.SHARK_AI_PRICE_MARKUP = "1"; // the children ran with ×1 — recompute with the same factor
    const pricing = await import("@/lib/ai/pricing");
    const p: string[] = [];
    for (const r of rowsOf(fd)) {
      const mine = F.txns.filter((t) => t.kind === "USAGE" && t.conversationId === r?.conversationId);
      const chat = mine.filter((t) => t.source === "CHAT");
      const title = mine.filter((t) => t.source === "AUTO_TITLE");
      const mobile = TYPES.find((t) => t.key === r?.type)?.path === "mobile";
      const bad: string[] = [];
      if (chat.length !== 1) bad.push(`${chat.length} CHAT rows`);
      else if (chat[0]?.model !== r?.model) bad.push(`model ${r?.model} ≠ charged ${chat[0]?.model}`);
      if (title.length !== (mobile ? 1 : 0)) bad.push(`${title.length} AUTO_TITLE rows (want ${mobile ? 1 : 0})`);
      if (mine.length !== chat.length + title.length) bad.push(`other sources: ${[...new Set(mine.map((t) => t.source))].join(",")}`);
      for (const t of mine) if (-t.amountMicro !== pricing.costMicroUsd(String(t.model ?? ""), t.tokensIn, t.tokensOut) || t.amountMicro >= 0) bad.push(`${t.source} row is not priced by costMicroUsd (${t.amountMicro})`);
      if (bad.length) p.push(`row ${r?.n} (${r?.type}): ${bad.join(", ")}`);
    }
    chk("T0.1-X11.2", rowsOf(fd).length === 30 && p.length === 0, "1 CHAT row per run at list price · AUTO_TITLE exactly on the mobile-path type", few(p));
    const pairs = [...F.seen.values()].filter((e) => e.user && e.assistant);
    const mock = pairs.filter((e) => e.mock && e.tokens).length;
    const listed = new Set(rowsOf(fd).map((r) => String(r?.conversationId)));
    const stray = [...F.seen.keys()].filter((c) => !listed.has(c)).length;
    chk("T0.1-X11.3", pairs.length >= 2 && mock === pairs.length && stray === 0, "≥ 2 conversations seen with a USER + ASSISTANT pair (mock answer, tokens > 0), all listed", `${pairs.length} pairs seen in ${F.polls} polls · ${mock} with a mock answer + tokens · ${stray} unlisted`);
  });

  await section("S5 cleanup", ["T0.1-S5.1", "T0.1-S5.2", "T0.1-S5.3", "T0.1-S5.4"], async () => {
    if (!ready || !fd) {
      for (const id of ["T0.1-S5.1", "T0.1-S5.2", "T0.1-S5.3", "T0.1-S5.4"]) chk(id, false, "the probe ran", fNote());
      return;
    }
    const runs = [fullRun, capRun];
    const p1: string[] = [];
    const p2: string[] = [];
    const p3: string[] = [];
    const p4: string[] = [];
    for (const r of runs) {
      const d = r.parsed.data as Any;
      if (!d || !r.before || !r.after) {
        for (const p of [p1, p2, p3, p4]) p.push(`${r.name}: not measured`);
        continue;
      }
      const convs = rowsOf(d).map((x) => String(x?.conversationId));
      const left = await convLeft(tenantId, convs);
      const fresh = [...r.after.convIds].filter((c) => !r.before?.convIds.has(c)).length;
      if (left.length || fresh) p1.push(`${r.name}: ${left.join(",") || "0 listed rows"} · ${fresh} new conversation(s) still there`);
      if (convs.length === 0) p1.push(`${r.name}: no conversation listed`);

      const grant = r.txns.filter((t) => t.kind === "GRANT").reduce((s, t) => s + t.amountMicro, 0);
      const wantBalance = r.before.wallet ?? grant; // a wallet opened lazily by the first turn starts at its welcome grant
      if (r.after.wallet !== wantBalance) p2.push(`${r.name}: ${r.before.wallet ?? "no wallet"} → ${r.after.wallet} (want ${wantBalance})`);

      const spent = r.txns.filter((t) => t.kind === "USAGE").reduce((s, t) => s - t.amountMicro, 0);
      const ref = `${REFUND_REF_PREFIX}${d.runId}`;
      const adjust = r.txns.filter((t) => t.kind === "ADJUST");
      const other = r.txns.filter((t) => !["USAGE", "ADJUST", "GRANT"].includes(t.kind));
      const c = d.cleanup ?? {};
      if (adjust.length !== 1 || adjust[0]?.ref !== ref || adjust[0]?.amountMicro !== spent || adjust[0]?.source !== "ADJUST" || adjust[0]?.balanceAfter !== wantBalance) {
        p3.push(`${r.name}: ADJUST rows ${adjust.map((t) => `${t.ref}:${t.amountMicro}→${t.balanceAfter}`).join(",") || "none"} (want one ${ref}:${spent}→${wantBalance})`);
      }
      if (other.length) p3.push(`${r.name}: unexpected ledger kinds ${[...new Set(other.map((t) => t.kind))].join(",")}`);
      if (c.refundRef !== ref || c.refundMicro !== spent || c.walletAfterMicro !== r.after.wallet || c.walletBeforeMicro !== wantBalance || c.conversationsDeleted !== convs.length) p3.push(`${r.name}: cleanup{} = ${cut(JSON.stringify(c), 180)}`);

      const diff = [...countDiff(r.before.counts, r.after.counts), ...usageDiff(r.before.usage, r.after.usage)];
      const wantLedger = (r.before.counts.get("AiCreditTxn") ?? 0) + r.txns.length;
      const listedTx = rowsOf(d).reduce((s, x) => s + (Array.isArray(x?.txnIds) ? x.txnIds.length : 0), 0);
      if ((r.after.counts.get("AiCreditTxn") ?? 0) !== wantLedger || r.txns.filter((t) => t.kind === "USAGE").length !== listedTx) diff.push(`AiCreditTxn: ${r.txns.filter((t) => t.kind === "USAGE").length} new USAGE rows vs ${listedTx} listed`);
      if (diff.length) p4.push(`${r.name}: ${few(diff, 6)}`);
    }
    chk("T0.1-S5.1", p1.length === 0, "0 rows for the listed conversations · 0 new conversations", few(p1));
    chk("T0.1-S5.2", p2.length === 0, "balance before = balance after (full run and capped run)", few(p2));
    chk("T0.1-S5.3", p3.length === 0, "one ADJUST qc-ai-t0.1-refund-<runId> of +spent per run · cleanup{} agrees", few(p3));
    chk("T0.1-S5.4", p4.length === 0, "row counts of every AT-1 table and the AiUsage net unchanged", few(p4));
  });

  await section("X10 runtime", ["T0.1-X10.1"], async () => {
    if (OUTPUTS.length === 0 || !fd) {
      chk("T0.1-X10.1", false, "the probe ran and wrote a result", fNote());
      return;
    }
    const p: string[] = [];
    for (const o of OUTPUTS) {
      p.push(...vClean(o.stdout, `${o.what} stdout`));
      p.push(...leaksIn(o.stderr).map((n) => `${o.what} stderr → ${n}`)); // stderr may carry a library warning with a docs link; secrets may not
    }
    for (const r of [fullRun, capRun]) if (r.parsed.md) p.push(...vClean(r.parsed.md, `result file (${r.name})`));
    chk("T0.1-X10.1", p.length === 0, "no key / secret / header / URL", `${few([...new Set(p)])} (${OUTPUTS.length} runs scanned)`);
  });

  // ═════════════ the REAL result file (written by the controller's real measurement) ═════════════
  await section(`real file ${REAL_FILE}`, REAL_IDS, async () => {
    if (!existsSync(REAL_FILE)) {
      for (const id of REAL_IDS) chk(id, false, `${REAL_FILE} exists`, `${REAL_FILE} is not there yet — re-run this oracle after the controller's real measurement`, { pending: true });
      return;
    }
    const R = parseResult(REAL_FILE);
    const d = R.data as Any;
    if (!d) {
      for (const id of REAL_IDS) chk(id, false, "a parsable probe-data block", R.err);
      return;
    }
    const p1 = [...vShape(d, { provider: "real", full: true }), ...vRows(d, (m) => /^[a-z0-9_.-]+\/[a-z0-9_.:-]+$/i.test(m) && !/mock/i.test(m), null), ...vTable(R.outside, d), ...vTotals(d)];
    const maxRow = Math.max(0, ...rowsOf(d).map(microOf));
    if (!(isInt(d.totals?.spentMicro) && isInt(d.capMicro) && d.totals.spentMicro <= d.capMicro + maxRow)) p1.push(`spentMicro ${d.totals?.spentMicro} > cap ${d.capMicro} (+ one run)`);
    chk("T0.1-S1.5", rowsOf(d).length === 30 && p1.length === 0, "provider real · 30 rows · all > 0 · real model ids · table = data · ≤ cap", `${rowsOf(d).length} rows · ${few(p1)}`);

    const ids = rowsOf(d).flatMap((r) => (Array.isArray(r?.txnIds) ? (r.txnIds as unknown[]).map(String) : []));
    const tx = okId(d.tenantId) && ids.length ? ((await P.aiCreditTxn.findMany({ where: { tenantId: d.tenantId, id: { in: ids } }, select: { id: true, kind: true, source: true, amountMicro: true, balanceAfter: true, model: true, tokensIn: true, tokensOut: true, conversationId: true, ref: true } })) as Txn[]) : [];
    const L = ledgerOf(d, tx);
    const p2 = [...L.problems];
    if (tx.length !== ids.length) p2.push(`${ids.length - tx.length} of ${ids.length} listed ledger rows are not in this database`);
    if (d.totals?.spentMicro !== L.sum) p2.push(`totals.spentMicro ${d.totals?.spentMicro} ≠ Σ ledger ${L.sum}`);
    const more = okId(d.tenantId) ? Number((await P.aiCreditTxn.count({ where: { tenantId: d.tenantId, kind: "USAGE", conversationId: { in: rowsOf(d).map((r) => String(r?.conversationId)) }, id: { notIn: ids } } })) ?? 0) : 0;
    if (more) p2.push(`${more} USAGE row(s) of the listed conversations are not in txnIds`);
    chk("T0.1-S2.3", ids.length > 0 && p2.length === 0, "Σ file = Σ ledger rows by id", few(p2));

    const p4 = [...vPerType(d), ...vWeights(d, R.outside, false), ...vPacks(d, R.outside), ...vFree(d)];
    chk("T0.1-S4.4", p4.length === 0, "stats, weighted mean, packs and FREE trial as recomputed", few(p4));
  });
} catch (e) {
  console.log(`  ⚠️  the run stopped early: ${errMsg(e)}`);
} finally {
  // ═════════════ safety net (only acts when the probe under test left something behind) + S5.5 ═════════════
  console.log("\n── S5 residue ──");
  try {
    if (first && okId(tenantId)) {
      const now = await snapshot(tenantId);
      const stray = [...now.convIds].filter((c) => !first?.convIds.has(c) && c.startsWith(ownerPrefix));
      if (stray.length) {
        for (const t of [...COLS.keys()]) if (t !== "AiCreditTxn" && t !== "AiMessage" && has(t, "conversationId") && has(t, "tenantId")) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = '${tenantId}' AND "conversationId" IN (${inList(stray)})`).catch(() => undefined);
        await P.aiConversation.deleteMany({ where: { tenantId, id: { in: stray } } }).catch(() => undefined);
        safetyNotes.push(`deleted ${stray.length} conversation(s) the probe left`);
      }
      const usageNow = (await P.aiUsage.findMany({ where: { tenantId }, select: { id: true, day: true, requests: true, tokensIn: true, tokensOut: true } })) as { id: string; day: string; requests: number; tokensIn: number; tokensOut: number }[];
      for (const u of usageNow) {
        const [rq, ti, to] = (first.usage.get(u.day) ?? "0/0/0").split("/").map(Number);
        // only ever lowered back to the first snapshot — never raised (nothing else runs on AT-1 under the gate lock)
        if (u.requests > (rq ?? 0) || u.tokensIn > (ti ?? 0) || u.tokensOut > (to ?? 0)) {
          await P.aiUsage.update({ where: { id: u.id }, data: { requests: Math.min(u.requests, rq ?? 0), tokensIn: Math.min(u.tokensIn, ti ?? 0), tokensOut: Math.min(u.tokensOut, to ?? 0) } }).catch(() => undefined);
          safetyNotes.push(`gave back the AiUsage net of ${u.day}`);
        }
      }
      if (first.wallet !== null && now.wallet !== null && now.wallet < first.wallet) {
        const delta = first.wallet - now.wallet;
        await P.$transaction(async (tx: Any) => {
          const w = await tx.aiCreditWallet.update({ where: { tenantId }, data: { balanceMicro: { increment: delta } } });
          await tx.aiCreditTxn.create({ data: { tenantId, kind: "ADJUST", source: "ADJUST", amountMicro: delta, balanceAfter: w.balanceMicro, ref: `qc-ai-t0.1-oracle-fix-${rand}`, note: "qc-ai-t0.1 oracle: the probe under test did not refund its mock runs" } });
        }).catch(() => undefined);
        safetyNotes.push(`refunded ${delta} micro the probe did not give back (ADJUST qc-ai-t0.1-oracle-fix-${rand})`);
      }
    }
  } catch (e) {
    safetyNotes.push(`safety net failed: ${errMsg(e)}`);
  }
  if (safetyNotes.length) console.log(`  ⚠️  safety net: ${safetyNotes.join(" · ")}`);

  let s55 = "";
  let s55ok = false;
  try {
    // a mock child must never have written the real ledger file; if one did, put back what was there (S3.4 is already red)
    let realNote = "untouched";
    if (realHashNow() !== realHashBefore) {
      if (realBytesBefore) writeFileSync(REAL_FILE, realBytesBefore);
      else rmSync(REAL_FILE, { force: true });
      realNote = "WRITTEN BY A CHILD — restored";
    }
    rmSync(TMP, { recursive: true, force: true });
    const leftDirs = readdirSync(tmpdir()).filter((d) => d.startsWith(TAG_PREFIX)); // this run's + any an earlier crashed run left (reported, not swept)
    const st1 = await git(["status", "--porcelain", "--untracked-files=all", "--", ...WATCHED_PATHS]);
    const stateAfter = st1.stdout.trim();
    const changed = stateReadable && st1.code === 0 ? stateAfter.split("\n").filter((l) => l && !stateBefore.split("\n").includes(l)) : [];
    const fixTag = await P.aiCreditTxn.count({ where: { ref: `qc-ai-t0.1-oracle-fix-${rand}` } }).catch(() => -1);
    s55ok = leftDirs.length === 0 && stateReadable && st1.code === 0 && stateAfter === stateBefore && realNote === "untouched" && safetyNotes.length === 0 && fixTag === 0;
    s55 = `temp dirs left ${leftDirs.length}${leftDirs.length ? ` (${cut(leftDirs.join(","), 120)})` : ""} · git status readable ${stateReadable && st1.code === 0} · new/changed paths: ${cut(changed.join(" , "), 300) || "none"} · ${REAL_FILE} ${realNote} · safety net ${safetyNotes.length ? "USED" : "not needed"} · oracle ledger rows ${fixTag}`;
  } catch (e) {
    s55 = `check failed: ${errMsg(e)}`;
  }
  chk("T0.1-S5.5", s55ok, "no temp dir · identical `git status` for scripts, src, prisma, docs and the real ledger file · safety net not needed", s55);

  // a check that was never reached still counts (red) — the total is the same in every run
  for (const id of Object.keys(CHECKS)) if (!done.has(id)) chk(id, false, "check evaluated", "not reached (the run stopped early)");
  await prisma.$disconnect().catch(() => undefined);
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev, ...(c.pending ? { pending: "PENDING-REAL" } : {}) }));
const blocking = findings.filter((f) => f.sev === "CRITICAL" || f.sev === "MAJOR").length;
const pendingReal = cks.filter((c) => c.pending).length;
console.log(
  `\n${blocking === 0 && pendingReal === 0 ? "🟢" : blocking === 0 ? "🟡" : "🔴"} T0.1: ${passed}/${total}${FORCE ? " (QC_FORCE)" : ""} · PENDING-REAL ${pendingReal} · probe ${PROBE_MISSING ? "MISSING" : "present"} · env loader ${existsSync(ENV_FILE) ? "present" : "MISSING"} · residue tag ${TAG}`,
);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings, pendingReal })}`);
process.exit(blocking === 0 ? 0 : 1);
