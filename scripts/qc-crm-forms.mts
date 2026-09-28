// qc-crm-forms.mts — CRM v2 WO C4.3 "every form" (registry-driven form tester: valid · required · hostile input ·
// double submit · abandon · server-side parity)
//
// For every `kind:"form"` row of scripts/crm-ui-inventory.json the runner holds a SOURCE-VERIFIED spec (FORMS below —
// fields, which are required and by whom, the server action + REST op it maps to, the DB probe that counts "its" rows,
// where the stored value renders afterwards). Every spec cites the component/action file it was read from.
//
// Run
//   in-process only (no browser, no server — categories f + DB side of c/d; the phase-1 proof on QC3):
//     env CRM_EXPECTED_PATH=.qc-shots/c43/qc3-crm-expected.json bash scripts/iso.sh bash scripts/qc3.sh \
//       bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-forms.mts --inproc
//   full (in-process + browser a–e against a RUNNING production QC server built from HEAD — never started here):
//     env CRM_EXPECTED_PATH=<answer key of the DB the SERVER reads> QC_BASE=http://127.0.0.1:3215 \
//       bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-forms.mts
//   … --dry               plan only: every form × check (no DB writes, no browser) → .qc-shots/crm/forms/plan-dry.json
//   … --form <testid>     only this form (or `re:<regex>`)            … --cat a,b,f   only these categories
//   … --browser-only      skip the in-process pass                   … --selftest-browser   run ONLY the browser
//                         positive controls on synthetic pages (no server, no DB writes)
// 🔴 CRM_EXPECTED_PATH must be the answer key of the DB this process talks to (the runner refuses to touch a DB whose
//    tenant/system does not match the key). The browser pass writes through the SERVER, the probes read through THIS
//    process — both must be the same DB.
//
// ══════════════════════════════ CONTRACT (C4.3 — ledger/crm-briefs/crm-brief-C4.3.md is the addendum) ══════════════
// CATEGORIES  a valid submit → success path + exactly the expected DB rows (browser) · b each required field empty →
//             NEW Thai text rendered ≤72 px under that field (or aria-describedby), document.activeElement is that
//             field, no window dialog, no row (browser) · c over-long / emoji / =cmd / <script> / "><img onerror> in
//             every free-text field → either stored EXACTLY as typed (browser: truncated only by the field's own
//             maxLength) or refused with a clean Thai message (emoji must be accepted); stored values rendered on every
//             render location without executing (window.__qcXss unset, no injected <img src=x>) and visible as literal
//             text; CSV export cells never start with = + - @ (DB side + CSV in-process, render in browser) · d two
//             submits ≤200 ms apart → exactly the expected rows (browser: two real clicks 80 ms apart = GATE;
//             in-process: two parallel action calls = GATE only where the product declares a natural key, advisory
//             otherwise; REST: two parallel POSTs with ONE Idempotency-Key = GATE) · e close/cancel/navigate away
//             after filling everything → zero rows (browser) · f server parity: the same valid payload is accepted by
//             the action (and the REST op when one exists); each required-field-empty / client-refused payload is
//             refused by the action with {ok:false, Thai message} (a throw = unclean: production redacts it) and by
//             REST with 4xx + Thai message, and writes nothing (in-process).
// PROBES      every spec has probe(ctx, tag) = the number of rows THIS attempt owns: tagged forms count rows whose text
//             column contains the attempt's unique tag `qc-form-<run>-<n>`; natural-key forms (member add, visibility,
//             holiday, enroll, bulk, team room, archive) count the natural key and restore the snapshot after EVERY
//             check (restoreEach) so each check starts from the seed.
// WRITES      scripts/lib/qc-crm-restore.mts: snapshot before the first write → restore after every form (or check)
//             → final restore + tag sweep + purge of AuditLog/OutboxEvent/AppNotification/ApiIdempotency rows created
//             since the snapshot → verify() must report identical (else summary.restore.identical=false = ❌).
// SAFETY      in-process: globalThis.fetch is sandboxed — every non-local host (Resend, webhooks, AI) gets a synthetic
//             503 and is recorded in summary.blockedFetch (a form that reached one = a finding, never a real send).
//             Browser: forms with `guard` (real e-mail transport) are never submitted for real — only b runs, with
//             request interception aborting any server-action POST as a second net; a/c/d/e are skippedSafety.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// requires: crm-seed (answer key via CRM_EXPECTED_PATH or scripts/crm-expected.json) — SKIPPED (exit 0) if missing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

// ───────────────────────────── CLI ─────────────────────────────
const ARGV = process.argv.slice(2);
const DRY = ARGV.includes("--dry");
const INPROC_ONLY = ARGV.includes("--inproc");
const BROWSER_ONLY = ARGV.includes("--browser-only");
const SELFTEST_BROWSER = ARGV.includes("--selftest-browser");
const argOf = (flag: string): string | null => (ARGV.includes(flag) ? ARGV[ARGV.indexOf(flag) + 1] ?? null : null);
const FORM_FILTER = argOf("--form");
const PART = argOf("--part"); // write this run's full results to parts/<name>.json (split runs ≤ 15 min under the shared lock)
const MERGE = ARGV.includes("--merge"); // merge parts/*.json → summary.json (no DB, no browser)
const DEVICE = argOf("--device") ?? "both"; // desktop | mobile | both — mobile (390×844) runs a/b/e only (controller ruling D-r1)
const CAT_FILTER = new Set((argOf("--cat") ?? "a,b,c,d,e,f").split(",").map((s) => s.trim()).filter(Boolean));
const formSelected = (t: string) => !FORM_FILTER || (FORM_FILTER.startsWith("re:") ? new RegExp(FORM_FILTER.slice(3)).test(t) : FORM_FILTER === t);
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const SHOTS = ".qc-shots/crm/forms";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cut = (v: unknown, n = 200) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);

// ───────────────────────────── env + DB (QC only) ─────────────────────────────
// the browser self-test needs neither — it must run on a machine state where the QC DB is busy
let P: Any = null;
let PrismaNS: Any = null;
if (!SELFTEST_BROWSER && !MERGE) {
  const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
  accEnv.loadQcEnv();
  P = ((await import("@/lib/core/db")) as Any).prisma;
  PrismaNS = ((await import("@prisma/client")) as Any).Prisma;
}

// ───────────────────────────── registry ─────────────────────────────
type RegRow = { page: string; testid: string; kind: string; roles: string[]; hiddenFor: string[]; expect: Any; wo?: string; opener?: Any; only?: string[] };
const REG: RegRow[] = (() => {
  const raw = JSON.parse(readFileSync("scripts/crm-ui-inventory.json", "utf8"));
  return (Array.isArray(raw) ? raw : raw.rows) as RegRow[];
})();
const FORM_ROWS = REG.filter((r) => r.kind === "form");

// ───────────────────────────── answer key ─────────────────────────────
const EXPECTED_PATH = process.env.CRM_EXPECTED_PATH || "scripts/crm-expected.json";
let E: Any = {};
if (!SELFTEST_BROWSER && !MERGE) {
  if (!existsSync(EXPECTED_PATH)) {
    console.log(`⚠️  SKIPPED — ไม่พบ ${EXPECTED_PATH} (รัน scripts/seed-crm-qc.mts ก่อน)`);
    console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, skipped: true })}`);
    process.exit(0);
  }
  E = JSON.parse(readFileSync(EXPECTED_PATH, "utf8"));
}
const SYS: string = E.systemId ?? "";
const TENANT: string = E.tenantId ?? "";
const CRM_BASE = `/app/sys/${SYS}/crm`;
const RUN = randomBytes(3).toString("hex");
const TAG0 = `qc-form-${RUN}`;
let tagSeq = 0;
const newTag = () => `${TAG0}-${++tagSeq}`;

// ═══════════════════════════════════════════════════════════════════
// in-process sandbox: no real network from THIS process (Resend / webhooks / AI)
// ═══════════════════════════════════════════════════════════════════
const blockedFetch: { method: string; url: string; form: string }[] = [];
let CURRENT_FORM = "-";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Any, init?: Any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
  let host = "";
  try { host = new URL(url).hostname; } catch { /* relative */ }
  if (host && !/^(127\.0\.0\.1|localhost|qc\.invalid|qc\.local)$/.test(host)) {
    blockedFetch.push({ method, url: cut(url, 120), form: CURRENT_FORM });
    return new Response(JSON.stringify({ error: "blocked by qc-crm-forms sandbox" }), { status: 503, headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

// ═══════════════════════════════════════════════════════════════════
// Next request scope (C0.4 technique — scripts/qc-crm-c1.9.mts) so "use server" actions read the session cookie
// ═══════════════════════════════════════════════════════════════════
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = SELFTEST_BROWSER ? null : ((await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any);
const nextWorkUnit = SELFTEST_BROWSER ? null : ((await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any);
const nextCookies = SELFTEST_BROWSER ? null : ((await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any);
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) return fn();
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "qc-form", "x-forwarded-for": "203.0.113.43" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = {
    route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false,
    fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [],
  };
  const unit = {
    type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar,
    headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" },
  };
  try {
    return await nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
  } catch (e) {
    if (/AsyncLocalStorage accessed in runtime/.test(String((e as Error)?.message ?? ""))) return fn();
    throw e;
  }
}

// ── action call → normalised result ──
type AR = { ok: boolean; msg: string; code: string; thrown: boolean; v: Any };
const MODS = new Map<string, Any>();
async function modOf(spec: string): Promise<Any> {
  if (!MODS.has(spec)) MODS.set(spec, await import(spec as string));
  return MODS.get(spec);
}
async function callAction(mod: string, fn: string, args: unknown[], cookie: string): Promise<AR> {
  let f: Any;
  try { f = (await modOf(mod))[fn]; } catch (e) { return { ok: false, msg: `import ${mod} ล้ม: ${cut((e as Error)?.message)}`, code: "MISSING", thrown: true, v: null }; }
  if (typeof f !== "function") return { ok: false, msg: `${mod}#${fn} ไม่มี`, code: "MISSING", thrown: true, v: null };
  try {
    const v = (await inScope(cookie, CRM_BASE, () => f(...args))) as Any;
    if (v && typeof v === "object" && "ok" in v) {
      return { ok: v.ok === true, msg: String(v.error ?? v.reason ?? v.message ?? ""), code: String(v.code ?? ""), thrown: false, v };
    }
    return { ok: true, msg: "", code: "", thrown: false, v };
  } catch (e) {
    const x = e as Any;
    const digest = String(x?.digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) return { ok: true, msg: digest, code: "REDIRECT", thrown: false, v: null };
    return { ok: false, msg: e instanceof Error ? e.message : String(e), code: String(x?.code ?? "THROWN"), thrown: true, v: null };
  }
}

// ── REST in-process (route handler) ──
type RR = { status: number; body: Any; text: string };
let REST_KEY = "";
async function callRest(method: string, path: string, body: unknown, idem: string | null): Promise<RR> {
  const route = (await modOf("@/app/api/v1/crm/[...path]/route")) as Any;
  const fn = route?.[method];
  if (typeof fn !== "function") return { status: 0, body: null, text: "MISSING_ROUTE" };
  const headers: Record<string, string> = { authorization: `Bearer ${REST_KEY}`, "content-type": "application/json" };
  if (idem) headers["idempotency-key"] = idem;
  const pathOnly = path.split("?")[0] ?? "";
  try {
    const res: Response = await fn(new Request(`http://qc.invalid/api/v1/crm${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) }),
      { params: Promise.resolve({ path: pathOnly.split("/").filter(Boolean) }) });
    const text = await res.text();
    let parsed: Any = null;
    try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, body: parsed, text };
  } catch (e) {
    return { status: -1, body: null, text: e instanceof Error ? e.message : String(e) };
  }
}
const restMsg = (r: RR): string => String(r.body?.error?.message_th ?? r.body?.error?.message ?? r.body?.message ?? r.text ?? "");
/** review NOTE: the Thai check reads ONLY `error.message_th` (a Thai word elsewhere in the body must not satisfy it) */
const restErrTh = (r: RR): string => String(r.body?.error?.message_th ?? "");

// ═══════════════════════════════════════════════════════════════════
// run context (live lookups against the answer key's tenant — every miss = a SKIP reason, never a throw)
// ═══════════════════════════════════════════════════════════════════
type RunCtx = {
  ownerId: string; cookie: string; browserToken: string; staffCookie: string | null;
  unitIds: string[]; teamId: string | null; teamIds: string[];
  pipelineId: string | null; firstStageId: string | null;
  contactId: string | null; contactName: string | null; companyId: string | null; dealId: string | null;
  objectKey: string | null; objectId: string | null; objectTitleField: string | null; objectRecordCount: number;
  memberAddUserId: string | null;
  sequenceId: string | null; enrollContactId: string | null; bulkContactIds: string[];
  emailContactId: string | null; emailTo: string | null;
  teamRoomChannelId: string | null;
  notes: string[];
};
const MINE = { sessionIds: [] as string[], keyIds: [] as string[] };

async function mintOwnerSession(who = "owner"): Promise<{ id: string; token: string; userId: string }> {
  const userId: string | undefined = E.users?.[who]?.userId;
  if (!userId) throw new Error(`answer key ไม่มี users.${who}.userId`);
  const { sha256, randomToken } = (await import("@/lib/core/hash")) as Any;
  const token = `qcform${randomToken(24)}`;
  const ttl = new Date(Date.now() + 4 * 3600_000);
  const row = await P.session.create({ data: { userId, tokenHash: sha256(token), userAgent: "qc-form", idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.sessionIds.push(row.id);
  return { id: row.id, token, userId };
}

async function buildCtx(): Promise<RunCtx> {
  const s = await mintOwnerSession();
  const ctx: RunCtx = {
    ownerId: s.userId, cookie: `shark_session=${s.token}; __Host-shark_session=${s.token}; shark_tenant=${TENANT}`, browserToken: s.token, staffCookie: null,
    unitIds: Object.values(E.units ?? {}) as string[], teamId: E.teams?.phuket ?? null, teamIds: Object.values(E.teams ?? {}) as string[],
    pipelineId: null, firstStageId: null,
    contactId: E.contactIds?.[0] ?? null, contactName: null, companyId: E.companyIds?.[0] ?? null, dealId: E.dealIds?.[0] ?? null,
    objectKey: null, objectId: E.contractObjectId ?? null, objectTitleField: null, objectRecordCount: 0,
    memberAddUserId: null, sequenceId: null, enrollContactId: null, bulkContactIds: [],
    emailContactId: null, emailTo: null, teamRoomChannelId: null, notes: [],
  };
  const note = (s2: string) => ctx.notes.push(s2);
  // controller ruling D-r1: one STAFF role (thana) for category f permission refusals
  try { const st = await mintOwnerSession("thana"); ctx.staffCookie = `shark_session=${st.token}; __Host-shark_session=${st.token}; shark_tenant=${TENANT}`; }
  catch (e) { note(`thana: ${cut((e as Error).message, 100)} (ข้อ f สิทธิ์พนักงานข้าม)`); }
  try {
    const pl = await P.crmPipeline.findFirst({ where: { systemId: SYS, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    ctx.pipelineId = pl?.id ?? null;
    if (pl) ctx.firstStageId = (await P.crmStage.findFirst({ where: { pipelineId: pl.id }, orderBy: { sortOrder: "asc" }, select: { id: true } }))?.id ?? null;
  } catch (e) { note(`pipeline: ${cut((e as Error).message, 100)}`); }
  try {
    if (ctx.objectId) {
      const o = await P.customObject.findUnique({ where: { id: ctx.objectId }, select: { key: true, titleFieldKey: true, recordCount: true } });
      ctx.objectKey = o?.key ?? null; ctx.objectTitleField = o?.titleFieldKey ?? null; ctx.objectRecordCount = o?.recordCount ?? 0;
    }
  } catch (e) { note(`object: ${cut((e as Error).message, 100)}`); }
  try {
    // a staff user of this shop who is NOT in the phuket team (team-member-add-form target)
    if (ctx.teamId) {
      const inTeam = new Set((await P.teamMember.findMany({ where: { teamId: ctx.teamId }, select: { userId: true } })).map((m: Any) => m.userId));
      const ms = await P.membership.findMany({ where: { tenantId: TENANT }, select: { userId: true }, orderBy: { userId: "asc" } });
      ctx.memberAddUserId = ms.map((m: Any) => m.userId).find((u: string) => !inTeam.has(u) && u !== ctx.ownerId) ?? null;
    }
    if (!ctx.memberAddUserId) note("team-member-add: ไม่มีพนักงานที่ยังไม่อยู่ในทีม");
  } catch (e) { note(`member: ${cut((e as Error).message, 100)}`); }
  try {
    // enroll/bulk targets: live contacts who have not opted out (the sequence itself is a run fixture — the seed has none;
    // a brand-new fixture sequence has no enrollments, so every such contact is eligible)
    const free = await P.crmContact.findMany({ where: { systemId: SYS, archivedAt: null, marketingOptOut: false }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 8 });
    const ids = free.map((c: Any) => c.id as string);
    ctx.enrollContactId = ids[0] ?? null;
    ctx.bulkContactIds = ids.slice(1, 4);
  } catch (e) { note(`sequence targets: ${cut((e as Error).message, 100)}`); }
  try {
    if (ctx.contactId) ctx.contactName = (await P.crmContact.findUnique({ where: { id: ctx.contactId }, select: { name: true } }))?.name ?? null;
    // composer target: a live contact with an e-mail who has not opted out (the thread itself is a fixture — the seed has none)
    const c = await P.crmContact.findFirst({ where: { systemId: SYS, archivedAt: null, marketingOptOut: false, emailOptOut: false, emailBouncedAt: null, email: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
    ctx.emailContactId = c?.id ?? null; ctx.emailTo = c?.email ?? null;
    if (!c) note("email: ไม่มีผู้ติดต่อที่มีอีเมลและรับข่าวสาร");
  } catch (e) { note(`email: ${cut((e as Error).message, 100)}`); }
  try {
    // same source the form uses (ai-bridges.ts:1038 → meeting facade listRoomOptions(tenantId, viewerUserId))
    const meeting = (await modOf("@/lib/modules/meeting")) as Any;
    const list: Any[] = typeof meeting.listRoomOptions === "function" ? ((await meeting.listRoomOptions(TENANT, ctx.ownerId).catch(() => [])) as Any[]) : [];
    ctx.teamRoomChannelId = list[0]?.channelId ?? null;
    if (!ctx.teamRoomChannelId) note("team-room: ไม่มีห้องแชททีมในร้าน (ฟอร์มผูกห้องข้าม)");
  } catch (e) { note(`team-room: ${cut((e as Error).message, 100)}`); }
  return ctx;
}

// ═══════════════════════════════════════════════════════════════════
// FORM SPECS (source-verified — see ledger/crm-briefs/crm-brief-C4.3.md §2 for the per-form table)
// ═══════════════════════════════════════════════════════════════════
type Vals = Record<string, string | boolean | string[]>;
type FieldSpec = {
  key: string; testid: string;
  kind: "text" | "textarea" | "date" | "select" | "checkbox" | "radio" | "file";
  /** who refuses an empty value: "client" (JS or HTML required) · "server" · "both" · false = optional */
  required: "client" | "server" | "both" | false;
  /** HOW the client refuses (b evidence): js-box = one form-level box · html = native `required` bubble · disable = submit disabled */
  clientHow?: "js-box" | "html" | "disable";
  clientMsg?: string; // client-side message text (f: "same refusal" advisory)
  max?: number; // server max length
  clientMax?: number; // maxLength attribute
  text?: boolean; // free text that is stored + displayed → c payloads
  uiEmpty?: boolean; // the UI CAN make it empty (select with "" option / checkbox off) — default true for text
};
type RenderLoc = { label: string; path: (ctx: RunCtx, tag: string) => Promise<string | null> | string | null };
/** one "leave it empty" case for b/f — default = one per required field; compound rules (team OR pipeline) list several */
type RequiredCase = { id: string; empty: string[]; anchor: string; who: "client" | "server" | "both"; clientHow?: FieldSpec["clientHow"]; clientMsg?: string; uncheckAll?: string };
type FormSpec = {
  testid: string; page: string; src: string;
  layout: "page" | "inline" | "modal" | "sheet";
  path: (ctx: RunCtx) => string | null; // concrete URL path (null = SKIP, reason in needs)
  opener?: string[]; openerFn?: (ctx: RunCtx) => string[]; close?: string; submit: string; errorBox?: string;
  fields: FieldSpec[];
  requiredCases?: RequiredCase[];
  tagField: string | null; // field key that carries the tag (null = natural-key form)
  valid: (ctx: RunCtx, tag: string, mode?: "inproc" | "browser") => Vals;
  csvPayloadCell?: boolean; // the tag field is a CSV document: payloads go INTO the title cell (import form)
  mirror?: string[]; // browser c: also type the payload into these fields (a render location shows them instead of the tag field)
  action?: { mod: string; fn: string; args: (ctx: RunCtx, v: Vals) => unknown[] };
  rest?: { method: "POST" | "PUT" | "PATCH"; path: (ctx: RunCtx) => string | null; body: (ctx: RunCtx, v: Vals) => Any; op: string; omitCases?: string[] /* required cases whose field is a URL param, not body */ };
  clientOnly?: { id: string; patch: (ctx: RunCtx, v: Vals) => Vals; why: string }[]; // client refuses, server accepts BY DESIGN (advisory)
  probe: (ctx: RunCtx, tag: string) => Promise<number>;
  expectRows?: (ctx: RunCtx, mode: "inproc" | "browser") => number; // rows a valid submit owns (default 1 · -1 = "≥1, each once")
  dupProbe?: (ctx: RunCtx) => Promise<number>; // rows that exist twice (must stay 0) — for forms whose row count is dynamic
  readStored?: (ctx: RunCtx, tag: string, fieldKey: string) => Promise<string | null>;
  renders?: RenderLoc[];
  csv?: (ctx: RunCtx, tag: string) => Promise<string | null>;
  naturalKey?: string; // the product's own dedupe (unique index / upsert / lock) — d in-process GATED only when set
  restoreEach?: boolean;
  guard?: string; // never submitted for real in the browser (reason)
  needs?: (ctx: RunCtx) => string | null; // precondition missing → SKIP whole form (reason)
  fOnlyWhenNeedsFail?: boolean; // when `needs` fails, still run the serverBad refusals in-process
  fixture?: "sequence" | "emailThread"; // run-created precondition (protected across restores, removed at the end)
  expectedBlockedFetch?: boolean; // this form's valid path reaches a real transport — the sandbox block is expected
  serverBad?: { id: string; patch: (ctx: RunCtx, v: Vals) => Vals; why: string }[]; // extra payloads the server must refuse
};

const likeTag = (tag: string) => ({ contains: tag });
const countWhere = async (model: string, where: Any): Promise<number> => { try { return await P[model].count({ where }); } catch { return -1; } };
const firstOf = async (model: string, where: Any, col: string): Promise<string | null> => {
  try { const r = await P[model].findFirst({ where, select: { [col]: true } }); return r ? String(r[col] ?? "") : null; } catch { return null; }
};
const settingsCrm = async (): Promise<Any> => {
  const s = await P.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } });
  return (s?.settings as Any)?.crm ?? {};
};

// FORMS is filled below (one entry per registry form row)
const FORMS: FormSpec[] = [];

// Stage templates the pipeline form sends (PipelineSettings.tsx:14 TEMPLATES — duplicated literally: the component is
// a client module; importing it here would drag React into the runner)
const PL_STAGES = [
  { name: "ใหม่", kind: "OPEN", probability: 10 },
  { name: "เสนอราคา", kind: "OPEN", probability: 50 },
  { name: "ปิดได้", kind: "WON", probability: 100 },
  { name: "ไม่สำเร็จ", kind: "LOST", probability: 0 },
];
const fd = (o: Record<string, string | string[] | undefined>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const x of v) f.append(k, x); else f.set(k, v);
  }
  return f;
};
const S = (v: Vals, k: string): string => { const x = v[k]; return Array.isArray(x) ? x.join(",") : x === undefined ? "" : String(x); };
const holidayDate = (tag: string): string => {
  // one distinct future date per attempt (2031 + attempt number) — never collides with a seeded holiday
  const n = Number(tag.split("-").pop()) || 1;
  const d = new Date(Date.UTC(2031, 0, 1) + n * 86_400_000);
  return d.toISOString().slice(0, 10);
};
const idOfTagged = async (model: string, col: string, tag: string, extra: Any = {}): Promise<string | null> =>
  firstOf(model, { ...extra, [col]: likeTag(tag) }, "id");
const readCol = (model: string, where: (tag: string) => Any, col: string) => async (_ctx: RunCtx, tag: string): Promise<string | null> => firstOf(model, where(tag), col);
const FIXTURE = { sequenceId: null as string | null, sequenceStepIds: [] as string[], emailThreadKey: null as string | null };
const FAR_FUTURE = "2099-01-01T09:00:00+07:00";

FORMS.push(
  // ───────────── C1.3 companies ─────────────
  {
    testid: "company-new-form", page: "/companies/new", src: "src/app/app/sys/[id]/crm/companies/_components/NewCompanyForm.tsx · action src/lib/modules/crm/companies-actions.ts:71 createCompanyAction → companies.ts:701 createCompany/cleanPatch:479",
    layout: "page", path: () => `${CRM_BASE}/companies/new`, submit: "company-new-submit", errorBox: "company-new-error",
    fields: [
      { key: "name", testid: "company-new-name", kind: "text", required: "both", clientHow: "js-box", clientMsg: "ใส่ชื่อบริษัทก่อนบันทึก", max: 200, text: true },
      { key: "industry", testid: "company-new-industry", kind: "text", required: false, max: 100, text: true },
      { key: "note", testid: "company-new-note", kind: "textarea", required: false, max: 4000, text: true },
    ],
    tagField: "name",
    valid: (_c, tag) => ({ name: tag }),
    action: { mod: "@/lib/modules/crm/companies-actions", fn: "createCompanyAction", args: (_c, v) => [SYS, { name: S(v, "name"), industry: S(v, "industry") || null, note: S(v, "note") || null, ...(v.taxId !== undefined ? { taxId: S(v, "taxId") } : {}), ...(v.website !== undefined ? { website: S(v, "website") } : {}), ...(v.email !== undefined ? { email: S(v, "email") } : {}) }] },
    rest: { method: "POST", path: () => "/companies", body: (_c, v) => ({ name: S(v, "name"), ...(S(v, "industry") ? { industry: S(v, "industry") } : {}), ...(S(v, "note") ? { note: S(v, "note") } : {}) }), op: "companies.create" },
    probe: async (_c, tag) => countWhere("crmCompany", { systemId: SYS, name: likeTag(tag) }),
    readStored: async (_c, tag, k) => firstOf("crmCompany", { systemId: SYS, OR: [{ name: likeTag(tag) }, { industry: likeTag(tag) }, { note: likeTag(tag) }] }, k),
    renders: [
      { label: "list /companies?q=", path: (_c, tag) => `${CRM_BASE}/companies?q=${encodeURIComponent(tag)}` },
      { label: "detail /companies/[id]", path: async (_c, tag) => { const id = await idOfTagged("crmCompany", "name", tag, { systemId: SYS }); return id ? `${CRM_BASE}/companies/${id}` : null; } },
    ],
    csv: async (c, tag) => { const r = await callAction("@/lib/modules/crm/companies-actions", "exportCompaniesAction", [SYS, { q: tag }], c.cookie); return r.ok ? String(r.v?.csv ?? "") : null; },
    serverBad: [
      { id: "taxId-checksum", patch: (_c, v) => ({ ...v, taxId: "1234567890123" }), why: "client taxIdProblem (companies-shared.ts:261) refuses a bad checksum" },
      { id: "website-ftp", patch: (_c, v) => ({ ...v, website: "ftp://qc.example.com" }), why: "client websiteProblem: http(s) only" },
      { id: "email-shape", patch: (_c, v) => ({ ...v, email: "not-an-email" }), why: "client emailProblem" },
    ],
  },
  // ───────────── C1.4 contacts ─────────────
  {
    testid: "contact-new-form", page: "/contacts/new", src: "src/app/app/sys/[id]/crm/contacts/_components/NewContactForm.tsx · action src/lib/modules/crm/contacts-actions.ts:70 createContactAction → contacts.ts:791 createContact/cleanCreate:541",
    layout: "page", path: () => `${CRM_BASE}/contacts/new`, submit: "contact-new-submit", errorBox: "contact-new-error",
    fields: [
      { key: "firstName", testid: "contact-new-firstName", kind: "text", required: "both", clientHow: "js-box", clientMsg: "ใส่ชื่อจริงก่อนบันทึก", max: 200, text: true },
      { key: "lastName", testid: "contact-new-lastName", kind: "text", required: false, max: 200, text: true },
      { key: "jobTitle", testid: "contact-new-jobTitle", kind: "text", required: false, max: 200, text: true },
    ],
    tagField: "firstName",
    valid: (_c, tag) => ({ firstName: tag }),
    action: { mod: "@/lib/modules/crm/contacts-actions", fn: "createContactAction", args: (_c, v) => [SYS, { firstName: S(v, "firstName"), lastName: S(v, "lastName") || null, jobTitle: S(v, "jobTitle") || null, phone: S(v, "phone") || null, email: S(v, "email") || null }] },
    rest: { method: "POST", path: () => "/contacts", body: (_c, v) => ({ firstName: S(v, "firstName"), ...(S(v, "lastName") ? { lastName: S(v, "lastName") } : {}), ...(S(v, "jobTitle") ? { jobTitle: S(v, "jobTitle") } : {}), ...(S(v, "phone") ? { phone: S(v, "phone") } : {}), ...(S(v, "email") ? { email: S(v, "email") } : {}) }), op: "contacts.create" },
    probe: async (_c, tag) => countWhere("crmContact", { systemId: SYS, name: likeTag(tag) }),
    readStored: async (_c, tag, k) => firstOf("crmContact", { systemId: SYS, name: likeTag(tag) }, k),
    renders: [
      { label: "list /contacts?q=", path: (_c, tag) => `${CRM_BASE}/contacts?q=${encodeURIComponent(tag)}` },
      { label: "detail /contacts/[id]", path: async (_c, tag) => { const id = await idOfTagged("crmContact", "name", tag, { systemId: SYS }); return id ? `${CRM_BASE}/contacts/${id}` : null; } },
    ],
    csv: async (c, tag) => { const r = await callAction("@/lib/modules/crm/contacts-actions", "exportContactsAction", [SYS, { q: tag }, true, "qc-form ตรวจไฟล์ส่งออก"], c.cookie); return r.ok ? String(r.v?.csv ?? "") : null; },
    serverBad: [
      { id: "phone-short", patch: (_c, v) => ({ ...v, phone: "12" }), why: "client contactPhoneProblem (contacts-shared.ts:345) 9–15 digits" },
      { id: "email-shape", patch: (_c, v) => ({ ...v, email: "not-an-email" }), why: "client emailProblem + input type=email" },
    ],
  },
  // ───────────── C1.5 deals ─────────────
  {
    testid: "deal-new-form", page: "/deals/new", src: "src/app/app/sys/[id]/crm/deals/_components/NewDealForm.tsx · action src/lib/modules/crm/deals-actions.ts:74 createDealAction → deals.ts:614 createCore/cleanTitle:356",
    layout: "page", path: () => `${CRM_BASE}/deals/new`, submit: "deal-new-submit", errorBox: "deal-new-error",
    fields: [
      { key: "title", testid: "deal-new-title", kind: "text", required: "both", clientHow: "js-box", clientMsg: "ใส่ชื่อดีลก่อน", max: 200, clientMax: 220, text: true },
      { key: "contactId", testid: "deal-new-contact", kind: "select", required: "both", clientHow: "js-box", clientMsg: "เลือกผู้ติดต่อก่อน" },
      { key: "nextStep", testid: "deal-new-next-step", kind: "text", required: false, max: 2000, text: true },
    ],
    tagField: "title",
    // browser: the select lists only the first page of contacts (NewDealForm.tsx:140) — pick its first real option
    valid: (c, tag, mode) => ({ title: tag, contactId: mode === "browser" ? "@first" : c.contactId ?? "" }),
    action: { mod: "@/lib/modules/crm/deals-actions", fn: "createDealAction", args: (c, v) => [SYS, { title: S(v, "title"), contactId: S(v, "contactId"), pipelineId: c.pipelineId ?? "", nextStep: S(v, "nextStep") || null }] },
    rest: { method: "POST", path: () => "/deals", body: (c, v) => ({ title: S(v, "title"), contactId: S(v, "contactId"), pipelineId: c.pipelineId ?? "", ...(S(v, "nextStep") ? { nextStep: S(v, "nextStep") } : {}) }), op: "deals.create" },
    probe: async (_c, tag) => countWhere("crmDeal", { systemId: SYS, title: likeTag(tag) }),
    readStored: async (_c, tag, k) => firstOf("crmDeal", { systemId: SYS, title: likeTag(tag) }, k),
    renders: [
      { label: "detail /deals/[id]", path: async (_c, tag) => { const id = await idOfTagged("crmDeal", "title", tag, { systemId: SYS }); return id ? `${CRM_BASE}/deals/${id}` : null; } },
      { label: "list /deals?view=table&q=", path: (_c, tag) => `${CRM_BASE}/deals?view=table&q=${encodeURIComponent(tag)}` },
    ],
    csv: async (c, tag) => { const r = await callAction("@/lib/modules/crm/deals-actions", "exportDealsAction", [SYS, { q: tag }], c.cookie); return r.ok ? String(r.v?.csv ?? "") : null; },
    needs: (c) => (!c.pipelineId ? "ไม่มี pipeline ในซีด" : !c.contactId ? "ไม่มีผู้ติดต่อในซีด" : null),
    serverBad: [
      { id: "title-201", patch: (_c, v) => ({ ...v, title: `${S(v, "title")} ${"ก".repeat(201)}` }), why: "client refuses >200 (NewDealForm.tsx:89 'ชื่อดีลยาวเกิน 200 ตัวอักษร')" },
    ],
  },
  {
    testid: "pl-new-form", page: "/settings/pipelines", src: "src/app/app/sys/[id]/crm/settings/pipelines/_components/PipelineSettings.tsx:113 · action src/lib/modules/crm/pipelines-actions.ts:55 createPipelineAction → pipelines.ts:207/cleanName:78",
    layout: "inline", path: () => `${CRM_BASE}/settings/pipelines`, submit: "pl-new-submit", errorBox: "pl-msg",
    fields: [{ key: "name", testid: "pl-new-name", kind: "text", required: "both", clientHow: "js-box", clientMsg: "ใส่ชื่อ pipeline ก่อน", max: 100, text: true }],
    tagField: "name",
    valid: (_c, tag) => ({ name: tag }),
    action: { mod: "@/lib/modules/crm/pipelines-actions", fn: "createPipelineAction", args: (_c, v) => [SYS, { name: S(v, "name").trim(), stages: PL_STAGES }] },
    probe: async (_c, tag) => countWhere("crmPipeline", { systemId: SYS, name: likeTag(tag) }),
    readStored: readCol("crmPipeline", (tag) => ({ systemId: SYS, name: likeTag(tag) }), "name"),
    renders: [
      { label: "settings /settings/pipelines", path: () => `${CRM_BASE}/settings/pipelines` },
      { label: "/pipelines", path: () => `${CRM_BASE}/pipelines` },
    ],
  },
  {
    testid: "st-new-form", page: "/settings/stages", src: "src/app/app/sys/[id]/crm/settings/stages/_components/StageSettings.tsx:155 · action src/lib/modules/crm/pipelines-actions.ts:99 addStageAction → pipelines.ts:291/stageData:174",
    layout: "inline", path: (c) => (c.pipelineId ? `${CRM_BASE}/settings/stages?pipeline=${c.pipelineId}` : null), submit: "st-new-submit", errorBox: "st-new-msg",
    fields: [
      { key: "name", testid: "st-new-name", kind: "text", required: "both", clientHow: "js-box", clientMsg: "ใส่ชื่อขั้นก่อน", max: 60, text: true },
      { key: "probability", testid: "st-new-prob", kind: "text", required: false },
    ],
    tagField: "name",
    valid: (_c, tag) => ({ name: tag, probability: "20" }),
    action: { mod: "@/lib/modules/crm/pipelines-actions", fn: "addStageAction", args: (c, v) => [SYS, c.pipelineId ?? "", { name: S(v, "name").trim(), kind: "OPEN", probability: v.probability === "" ? 0 : Number(S(v, "probability")) }] },
    probe: async (_c, tag) => countWhere("crmStage", { systemId: SYS, name: likeTag(tag) }),
    readStored: readCol("crmStage", (tag) => ({ systemId: SYS, name: likeTag(tag) }), "name"),
    renders: [
      { label: "settings /settings/stages", path: (c) => `${CRM_BASE}/settings/stages?pipeline=${c.pipelineId}` },
      { label: "board /deals?pipeline=", path: (c) => `${CRM_BASE}/deals?pipeline=${c.pipelineId}` },
    ],
    needs: (c) => (c.pipelineId ? null : "ไม่มี pipeline ในซีด"),
    restoreEach: true, // 20-stage cap per pipeline — every check starts from the seed's stages
    serverBad: [
      { id: "prob-101", patch: (_c, v) => ({ ...v, probability: "101" }), why: "client 'โอกาสปิดต้องเป็นจำนวนเต็ม 0–100' (StageSettings.tsx:162)" },
      { id: "prob-frac", patch: (_c, v) => ({ ...v, probability: "5.5" }), why: "client Number.isInteger" },
    ],
  },
  {
    testid: "lr-new-form", page: "/settings/lost-reasons", src: "src/app/app/sys/[id]/crm/settings/lost-reasons/_components/LostReasonSettings.tsx:49 · action src/lib/modules/crm/lost-reasons-actions.ts:38 → lost-reasons.ts:71/cleanLabel:41",
    layout: "inline", path: () => `${CRM_BASE}/settings/lost-reasons`, submit: "lr-new-submit", errorBox: "lr-msg",
    fields: [{ key: "label", testid: "lr-new-label", kind: "text", required: "both", clientHow: "js-box", clientMsg: "ใส่ข้อความเหตุผลก่อน", max: 100, text: true }],
    tagField: "label",
    valid: (_c, tag) => ({ label: tag }),
    action: { mod: "@/lib/modules/crm/lost-reasons-actions", fn: "createLostReasonAction", args: (_c, v) => [SYS, S(v, "label")] },
    probe: async (_c, tag) => countWhere("crmLostReason", { systemId: SYS, label: likeTag(tag) }),
    readStored: readCol("crmLostReason", (tag) => ({ systemId: SYS, label: likeTag(tag) }), "label"),
    renders: [{ label: "settings /settings/lost-reasons", path: () => `${CRM_BASE}/settings/lost-reasons` }],
    naturalKey: "label (lost-reasons.ts:74 findFirst → CONFLICT 'มีเหตุผลนี้อยู่แล้ว')",
  },
  // ───────────── C1.6 activities ─────────────
  {
    testid: "activity-log-form", page: "/activities", src: "src/app/app/sys/[id]/crm/activities/_components/LogActivityForm.tsx · action src/app/app/sys/[id]/crm/activities/_components/actions.ts:63 logActivityAction → activities.ts:622/normalizeLog:554",
    layout: "inline", path: () => `${CRM_BASE}/activities`, opener: ["activities-new"], close: "activity-log-cancel", submit: "activity-log-submit", errorBox: "activity-log-error",
    fields: [
      { key: "target", testid: "activity-log-target-q", kind: "text", required: "both", clientHow: "js-box", clientMsg: "เลือกผู้ติดต่อ ดีล หรือบริษัทของกิจกรรมนี้ก่อน" },
      { key: "title", testid: "activity-log-title", kind: "text", required: "both", clientHow: "js-box", clientMsg: 'ใส่หัวเรื่องก่อน — เช่น "โทรคุยเรื่องราคา"', max: 300, clientMax: 300, text: true },
      { key: "body", testid: "activity-log-body", kind: "textarea", required: false, max: 8000, clientMax: 8000, text: true },
    ],
    tagField: "title",
    valid: (c, tag) => ({ target: c.contactName ?? "", title: tag }),
    action: { mod: "@/app/app/sys/[id]/crm/activities/_components/actions", fn: "logActivityAction", args: (c, v) => [SYS, { type: "NOTE", title: S(v, "title"), body: S(v, "body") || null, contactId: S(v, "target") ? c.contactId : null, ...(v.durationSec !== undefined ? { durationSec: Number(S(v, "durationSec")) } : {}) }] },
    rest: { method: "POST", path: () => "/activities", body: (c, v) => ({ type: "NOTE", title: S(v, "title"), ...(S(v, "body") ? { body: S(v, "body") } : {}), ...(S(v, "target") ? { contactId: c.contactId } : {}) }), op: "activities.log" },
    probe: async (_c, tag) => countWhere("crmActivity", { systemId: SYS, title: likeTag(tag) }),
    readStored: async (_c, tag, k) => firstOf("crmActivity", { systemId: SYS, OR: [{ title: likeTag(tag) }, { body: likeTag(tag) }] }, k),
    renders: [
      // NOTEs never appear in the default "pending" list (activities.ts:891 open = doneAt null AND type ≠ NOTE) — a NOTE is done at once
      // the browser picks the target by typing a name and taking the FIRST suggestion — read the contact from the stored row
      // no type filter: the in-process spec logs a NOTE, the browser form defaults to CALL (probe on QC3, 27 Sep) — both are "done"
      { label: "/activities?status=done&contactId=", path: async (_c, tag) => { const cid = await firstOf("crmActivity", { systemId: SYS, title: likeTag(tag) }, "contactId"); return cid ? `${CRM_BASE}/activities?status=done&scope=team&contactId=${cid}` : null; } },
      { label: "contact 360 timeline", path: async (_c, tag) => { const cid = await firstOf("crmActivity", { systemId: SYS, title: likeTag(tag) }, "contactId"); return cid ? `${CRM_BASE}/contacts/${cid}` : null; } },
    ],
    needs: (c) => (c.contactId && c.contactName ? null : "ไม่มีผู้ติดต่อในซีด"),
    serverBad: [
      { id: "duration-neg", patch: (_c, v) => ({ ...v, durationSec: "-5" }), why: "client duration mm:ss parse; service 0–7 days (activities.ts:360)" },
    ],
  },
  // ───────────── C1.7 teams + visibility ─────────────
  {
    testid: "teams-create-form", page: "/app/settings/teams", src: "src/components/crm/settings/TeamsManager.tsx:72 · action src/app/app/settings/teams/actions.ts:49 createTeamAction → src/lib/core/teams.ts:121/cleanName:45",
    layout: "inline", path: () => "/app/settings/teams", opener: ["teams-create-open"], close: "teams-create-cancel", submit: "teams-create-submit", errorBox: "teams-msg",
    fields: [{ key: "name", testid: "teams-create-name", kind: "text", required: "both", clientHow: "js-box", clientMsg: 'ตั้งชื่อทีมก่อน เช่น "ทีมขาย — ภูเก็ต"', max: 80, clientMax: 80, text: true }],
    tagField: "name",
    valid: (_c, tag) => ({ name: tag }),
    action: { mod: "@/app/app/settings/teams/actions", fn: "createTeamAction", args: (_c, v) => [{ name: S(v, "name").trim(), unitIds: [] }] },
    rest: { method: "POST", path: () => "/teams", body: (_c, v) => ({ name: S(v, "name") }), op: "teams.create" },
    probe: async (_c, tag) => countWhere("team", { tenantId: TENANT, name: likeTag(tag) }),
    readStored: readCol("team", (tag) => ({ tenantId: TENANT, name: likeTag(tag) }), "name"),
    renders: [
      { label: "/app/settings/teams", path: () => "/app/settings/teams" },
      { label: "visibility options", path: () => `${CRM_BASE}/settings/visibility` },
    ],
    naturalKey: "Team @@unique([tenantId, name]) (prisma/schema/team.prisma:23) → 'ชื่อทีมนี้มีอยู่แล้วในร้าน'",
    serverBad: [{ id: "name-81", patch: (_c, v) => ({ ...v, name: `${S(v, "name")}${"ก".repeat(81)}` }), why: "client maxLength=80 (TeamsManager.tsx:89)" }],
  },
  {
    testid: "team-member-add-form", page: "/app/settings/teams", src: "src/components/crm/settings/TeamsManager.tsx:309 · action src/app/app/settings/teams/actions.ts:69 addMemberAction → src/lib/core/teams.ts:201 addMember (upsert on @@unique[teamId,userId])",
    layout: "inline", path: () => "/app/settings/teams", openerFn: (c) => [`team-card@${c.teamId}`], submit: "team-member-add-submit", errorBox: "teams-msg",
    fields: [{ key: "userId", testid: "team-member-add-select", kind: "select", required: "both", clientHow: "disable" }],
    tagField: null,
    valid: (c) => ({ userId: c.memberAddUserId ?? "" }),
    action: { mod: "@/app/app/settings/teams/actions", fn: "addMemberAction", args: (c, v) => [c.teamId ?? "", S(v, "userId")] },
    probe: async (c) => countWhere("teamMember", { teamId: c.teamId ?? "-" }), // every member of the team (restoreEach) — catches a phantom userId="" row
    renders: [{ label: "/app/settings/teams member row", path: () => "/app/settings/teams" }],
    naturalKey: "TeamMember @@unique([teamId, userId]) upsert (team.prisma:37)",
    restoreEach: true,
    needs: (c) => (c.teamId && c.memberAddUserId ? null : "ไม่มีทีม หรือไม่มีพนักงานที่ยังไม่อยู่ในทีม"),
  },
  {
    testid: "visibility-override-form", page: "/settings/visibility", src: "src/components/crm/settings/VisibilitySettings.tsx:169 · action src/app/app/sys/[id]/crm/settings/visibility/actions.ts:39 → visibility.ts:635 policies.set (advisory lock + NULL-safe upsert)",
    layout: "inline", path: () => `${CRM_BASE}/settings/visibility`, submit: "visibility-override-add", errorBox: "visibility-msg",
    fields: [
      { key: "teamId", testid: "visibility-override-team", kind: "select", required: false },
      { key: "pipelineId", testid: "visibility-override-pipeline", kind: "select", required: false },
      { key: "role", testid: "visibility-override-role", kind: "select", required: false },
      { key: "entity", testid: "visibility-override-entity", kind: "select", required: "server", uiEmpty: false },
      { key: "visibility", testid: "visibility-override-level", kind: "select", required: "server", uiEmpty: false },
    ],
    requiredCases: [{ id: "team+pipeline", empty: ["teamId", "pipelineId"], anchor: "teamId", who: "both", clientHow: "js-box", clientMsg: "เลือกทีม หรือ pipeline อย่างน้อยหนึ่งอย่าง (ค่าต่อบทบาทแก้ในตารางด้านบน)" }],
    tagField: null,
    valid: (c) => ({ teamId: c.teamIds[1] ?? c.teamId ?? "", pipelineId: c.pipelineId ?? "", role: "", entity: "DEAL", visibility: "OWN" }),
    action: { mod: "@/app/app/sys/[id]/crm/settings/visibility/actions", fn: "setVisibilityPolicyAction", args: (_c, v) => [SYS, { teamId: S(v, "teamId") || null, pipelineId: S(v, "pipelineId") || null, role: S(v, "role") || null, entity: S(v, "entity"), visibility: S(v, "visibility") }] },
    probe: async () => countWhere("crmVisibilityPolicy", { systemId: SYS }), // every row (restoreEach) — a role-only row written by mistake counts too
    renders: [{ label: "/settings/visibility rows", path: () => `${CRM_BASE}/settings/visibility` }],
    naturalKey: "advisory lock per system + NULL-safe lookup (visibility.ts:628) — second submit updates the same row",
    restoreEach: true,
    needs: (c) => (c.teamId && c.pipelineId ? null : "ไม่มีทีมหรือ pipeline ในซีด"),
    serverBad: [
      { id: "entity-bad", patch: (_c, v) => ({ ...v, entity: "NOPE" }), why: "select cannot produce it; service visibility.ts:639" },
      { id: "level-bad", patch: (_c, v) => ({ ...v, visibility: "NOPE" }), why: "service visibility.ts:640" },
      { id: "pipeline-non-deal", patch: (_c, v) => ({ ...v, entity: "CONTACT" }), why: "client 'การตั้งทับต่อ pipeline ใช้ได้กับดีลเท่านั้น' (VisibilitySettings.tsx:174) = service :647" },
    ],
    clientOnly: [{ id: "role-only", patch: (_c, v) => ({ ...v, teamId: "", pipelineId: "", role: "STAFF" }), why: "client refuses role-only (VisibilitySettings.tsx:173 'ค่าต่อบทบาทแก้ในตารางด้านบน'); service accepts role-only BY DESIGN — the per-role table uses the same policies.set (visibility.ts:646)" }],
  },
  // ───────────── C1.9 objects ─────────────
  {
    testid: "object-edit-form", page: "/settings/objects", src: "src/app/app/sys/[id]/crm/settings/objects/_components/ObjectsAdmin.tsx:189 · action src/lib/modules/crm/objects-actions.ts:114 updateObjectAction → objects.ts:527 objects.update/normalizeText:242",
    layout: "inline", path: (c) => (c.objectKey ? `${CRM_BASE}/settings/objects?object=${c.objectKey}` : null), opener: ["object-edit-btn"], close: "object-edit-cancel", submit: "object-edit-save", errorBox: "object-edit-error",
    fields: [
      { key: "label", testid: "object-edit-label", kind: "text", required: "server", max: 120, text: true },
      { key: "labelPlural", testid: "object-edit-plural", kind: "text", required: "server", max: 120, text: true },
      { key: "titleFieldKey", testid: "object-edit-title-field", kind: "text", required: "server", max: 40 },
    ],
    tagField: "label",
    mirror: ["labelPlural"], // /objects index shows labelPlural || label (objects/page.tsx)
    valid: (c, tag) => ({ label: tag, labelPlural: `${tag} ทั้งหมด`, titleFieldKey: c.objectTitleField ?? "" }),
    action: { mod: "@/lib/modules/crm/objects-actions", fn: "updateObjectAction", args: (c, v) => [SYS, c.objectKey ?? "", { label: S(v, "label"), labelPlural: S(v, "labelPlural"), titleFieldKey: S(v, "titleFieldKey") }] },
    probe: async (_c, tag) => countWhere("customObject", { systemId: SYS, label: likeTag(tag) }),
    readStored: async (_c, tag, k) => firstOf("customObject", { systemId: SYS, OR: [{ label: likeTag(tag) }, { labelPlural: likeTag(tag) }] }, k),
    renders: [
      { label: "/settings/objects", path: (c) => `${CRM_BASE}/settings/objects?object=${c.objectKey}` },
      { label: "/objects index", path: () => `${CRM_BASE}/objects` },
      { label: "/objects/[key] header", path: (c) => `${CRM_BASE}/objects/${c.objectKey}` },
    ],
    naturalKey: "update of one CustomObject row (never creates)",
    restoreEach: true,
    needs: (c) => (c.objectKey && c.objectTitleField ? null : "ไม่มีวัตถุ contract ในซีด"),
    serverBad: [{ id: "titlefield-bad", patch: (_c, v) => ({ ...v, titleFieldKey: "Bad Key!" }), why: "service objects.ts:254 regex" }],
  },
  {
    testid: "object-archive-form", page: "/settings/objects", src: "ObjectsAdmin.tsx:126 · action src/lib/modules/crm/objects-actions.ts:144 archiveObjectAction → objects.ts:684 objects.archive (CONFIRM_REQUIRED · reason ≥5)",
    layout: "inline", path: (c) => (c.objectKey ? `${CRM_BASE}/settings/objects?object=${c.objectKey}` : null), opener: ["object-archive-btn"], close: "object-archive-cancel", submit: "object-archive-submit", errorBox: "object-archive-error",
    fields: [
      { key: "confirmKey", testid: "object-archive-confirm-key", kind: "text", required: "both", clientHow: "disable" },
      { key: "reason", testid: "object-archive-reason", kind: "text", required: "both", clientHow: "disable" },
    ],
    tagField: null,
    valid: (c, tag) => ({ confirmKey: c.objectKey ?? "", reason: `${tag} เก็บเพื่อทดสอบ` }),
    action: { mod: "@/lib/modules/crm/objects-actions", fn: "archiveObjectAction", args: (c, v) => [SYS, c.objectKey ?? "", { confirmKey: S(v, "confirmKey"), reason: S(v, "reason") }] },
    probe: async (c) => countWhere("customObject", { systemId: SYS, key: c.objectKey ?? "-", archivedAt: { not: null } }),
    renders: [{ label: "/settings/objects archived list", path: (c) => `${CRM_BASE}/settings/objects?object=${c.objectKey}` }],
    naturalKey: "archive is idempotent (objects.ts:689 already archived → unchanged)",
    restoreEach: true,
    needs: (c) => (c.objectKey && c.objectRecordCount > 0 ? null : "ไม่มีวัตถุที่มีรายการ (confirm/reason ไม่แสดง)"),
    serverBad: [{ id: "reason-4", patch: (_c, v) => ({ ...v, reason: "abcd" }), why: "client ready=reason.trim().length>=5 (ObjectsAdmin.tsx:134)" }],
  },
  {
    testid: "object-add-form", page: "/settings/objects", src: "ObjectsAdmin.tsx:280 · action src/lib/modules/crm/objects-actions.ts:85 createObjectAction (objectKeyProblem) → objects.ts:441 objects.create (+@@unique[systemId,key])",
    layout: "inline", path: () => `${CRM_BASE}/settings/objects`, close: "object-add-cancel", submit: "object-add-create", errorBox: "object-add-error",
    fields: [
      { key: "label", testid: "object-add-singular", kind: "text", required: "both", clientHow: "js-box", clientMsg: "ตั้งชื่อวัตถุ (เอกพจน์) ก่อนสร้าง", max: 120, text: true },
      { key: "labelPlural", testid: "object-add-plural", kind: "text", required: false, max: 120, text: true },
      { key: "key", testid: "object-add-key", kind: "text", required: "both", clientHow: "js-box", clientMsg: 'ตั้งชื่ออ้างอิง (key) ภาษาอังกฤษพิมพ์เล็กก่อนสร้าง เช่น "vehicle"' },
      { key: "titleFieldKey", testid: "object-add-title-field", kind: "text", required: "server", max: 40 },
    ],
    tagField: "label",
    valid: (_c, tag) => ({ label: tag, key: `qf_${tag.slice(8).replace(/[^a-z0-9]/g, "")}`.slice(0, 31), titleFieldKey: "name" }),
    action: { mod: "@/lib/modules/crm/objects-actions", fn: "createObjectAction", args: (_c, v) => [SYS, { key: S(v, "key"), label: S(v, "label"), labelPlural: S(v, "labelPlural") || S(v, "label"), parentType: "COMPANY", titleFieldKey: S(v, "titleFieldKey"), showAsTab: true, portalVisible: false, templateKey: null }] },
    probe: async (_c, tag) => countWhere("customObject", { systemId: SYS, label: likeTag(tag) }),
    readStored: async (_c, tag, k) => firstOf("customObject", { systemId: SYS, label: likeTag(tag) }, k),
    renders: [
      { label: "/settings/objects list", path: () => `${CRM_BASE}/settings/objects` },
      { label: "/objects index", path: () => `${CRM_BASE}/objects` },
    ],
    naturalKey: "CustomObject @@unique([systemId, key]) (crm.prisma:604) → DUPLICATE",
    serverBad: [
      { id: "key-shape", patch: (_c, v) => ({ ...v, key: "Bad Key" }), why: "client objectKeyProblem (objects-shared.ts:38)" },
      { id: "key-reserved", patch: (_c, v) => ({ ...v, key: "contact" }), why: "client reserved key" },
    ],
  },
  {
    testid: "object-view-save-form", page: "/objects/[key]", src: "src/app/app/sys/[id]/crm/objects/_components/ListTools.tsx:102 · action src/lib/modules/crm/objects-actions.ts:370 saveObjectViewAction (no dedupe — MemberSavedView has no unique)",
    layout: "inline", path: (c) => (c.objectKey ? `${CRM_BASE}/objects/${c.objectKey}?q=qc` : null), opener: ["object-view-save-btn"], close: "object-view-save-cancel", submit: "object-view-save-submit", errorBox: "object-view-save-error",
    fields: [{ key: "name", testid: "object-view-name", kind: "text", required: "server", max: 80, text: true }],
    tagField: "name",
    valid: (_c, tag) => ({ name: tag }),
    action: { mod: "@/lib/modules/crm/objects-actions", fn: "saveObjectViewAction", args: (c, v) => [SYS, c.objectKey ?? "", { name: S(v, "name"), filters: { q: "qc" }, scope: "PRIVATE" }] },
    probe: async (_c, tag) => countWhere("memberSavedView", { tenantId: TENANT, name: likeTag(tag) }),
    readStored: readCol("memberSavedView", (tag) => ({ tenantId: TENANT, name: likeTag(tag) }), "name"),
    renders: [{ label: "/objects/[key] view chips", path: (c) => `${CRM_BASE}/objects/${c.objectKey}` }],
    needs: (c) => (c.objectKey ? null : "ไม่มีวัตถุในซีด"),
    serverBad: [{ id: "name-81", patch: (_c, v) => ({ ...v, name: `${S(v, "name")}${"ก".repeat(81)}` }), why: "service VIEW_NAME_MAX 80 (objects-actions.ts:360)" }],
  },
  {
    testid: "object-import-form", page: "/objects/[key]", src: "ListTools.tsx:14 · action src/lib/modules/crm/objects-actions.ts:349 importRecordsAction → objects.ts:1224 records.import (no dedupe)",
    layout: "inline", path: (c) => (c.objectKey ? `${CRM_BASE}/objects/${c.objectKey}` : null), opener: ["object-import-btn"], close: "object-import-cancel", submit: "object-import-submit", errorBox: "object-import-result",
    fields: [{ key: "csv", testid: "object-import-text", kind: "textarea", required: "both", clientHow: "js-box", clientMsg: "ใส่ข้อมูล CSV หรือเลือกไฟล์ก่อนนำเข้า", text: true }],
    tagField: "csv",
    // the object's title field (contract → contractNo) carries the tag; parent = the seed's first company
    valid: (c, tag) => ({ csv: `_parentId,${c.objectTitleField}\n${c.companyId},${tag}\n` }),
    csvPayloadCell: true,
    action: { mod: "@/lib/modules/crm/objects-actions", fn: "importRecordsAction", args: (c, v) => [SYS, c.objectKey ?? "", { csv: S(v, "csv") }] },
    probe: async (c, tag) => countWhere("customRecord", { systemId: SYS, objectId: c.objectId ?? "-", title: likeTag(tag) }),
    readStored: async (c, tag) => firstOf("customRecord", { systemId: SYS, objectId: c.objectId ?? "-", title: likeTag(tag) }, "title"),
    renders: [{ label: "/objects/[key] list", path: (c, tag) => `${CRM_BASE}/objects/${c.objectKey}?q=${encodeURIComponent(tag)}` }],
    csv: async (_c, tag) => { const r = await callRest("POST", `/objects/${_c.objectKey}/records/export`, { reason: "qc-form ตรวจไฟล์ส่งออก", q: tag, confirm: true }, `${tag}-exp`); return r.status < 300 ? String(r.body?.data?.csv ?? "") : null; },
    needs: (c) => (c.objectKey && c.objectTitleField && c.companyId ? null : "ไม่มีวัตถุ/บริษัทในซีด"),
  },
  {
    testid: "object-record-form", page: "/objects/[key]", src: "src/app/app/sys/[id]/crm/objects/_components/RecordForm.tsx · action src/lib/modules/crm/objects-actions.ts:301 createRecordAction → objects.ts:825 createRecordCore (required fields · title slice 200)",
    // 🔴 contract.parentType = COMPANY ⇒ the list page renders object-add-hint instead of the form (objects/[key]/page.tsx:256);
    //    the real form lives in the company 360 object tab — DECISION D-reg1 (registry row points at /objects/[key])
    layout: "inline", path: (c) => (c.companyId && c.objectKey ? `${CRM_BASE}/companies/${c.companyId}?tab=obj-${c.objectKey}` : null), opener: ["object-record-new-btn"], close: "object-record-cancel", submit: "object-record-save", errorBox: "object-record-form-error",
    fields: [{ key: "title", testid: "object-record-field-contractNo", kind: "text", required: "server", text: true }],
    tagField: "title",
    valid: (_c, tag) => ({ title: tag }),
    action: { mod: "@/lib/modules/crm/objects-actions", fn: "createRecordAction", args: (c, v) => [SYS, c.objectKey ?? "", { parentId: c.companyId, values: { [c.objectTitleField ?? "contractNo"]: S(v, "title") } }] },
    rest: { method: "POST", path: (c) => (c.objectKey ? `/objects/${c.objectKey}/records` : null), body: (c, v) => ({ parentId: c.companyId, values: { [c.objectTitleField ?? "contractNo"]: S(v, "title") } }), op: "records.create" },
    probe: async (c, tag) => countWhere("customRecord", { systemId: SYS, objectId: c.objectId ?? "-", title: likeTag(tag) }),
    readStored: async (c, tag) => firstOf("customRecord", { systemId: SYS, objectId: c.objectId ?? "-", title: likeTag(tag) }, "title"),
    renders: [
      { label: "/objects/[key] list", path: (c, tag) => `${CRM_BASE}/objects/${c.objectKey}?q=${encodeURIComponent(tag)}` },
      { label: "record detail", path: async (c, tag) => { const id = await firstOf("customRecord", { systemId: SYS, objectId: c.objectId ?? "-", title: likeTag(tag) }, "id"); return id ? `${CRM_BASE}/objects/${c.objectKey}/${id}` : null; } },
    ],
    csv: async (_c, tag) => { const r = await callRest("POST", `/objects/${_c.objectKey}/records/export`, { reason: "qc-form ตรวจไฟล์ส่งออก", q: tag, confirm: true }, `${tag}-exp`); return r.status < 300 ? String(r.body?.data?.csv ?? "") : null; },
    needs: (c) => (c.objectKey && c.objectTitleField === "contractNo" && c.companyId ? null : "ไม่มีวัตถุ contract (title=contractNo) ในซีด"),
  },
  // ───────────── C1.10 API keys + webhooks ─────────────
  {
    testid: "crm-api-key-form", page: "/settings/api", src: "src/app/app/sys/[id]/crm/settings/api/_components/CrmApiSettings.tsx:134 · action src/app/app/sys/[id]/crm/settings/api/actions.ts:51 createCrmApiKeyAction(fd) (gate() OUTSIDE try — :53)",
    layout: "inline", path: () => `${CRM_BASE}/settings/api`, opener: ["crm-api-new"], submit: "crm-api-key-submit", errorBox: "crm-api-key-msg",
    fields: [{ key: "name", testid: "crm-api-key-name", kind: "text", required: "both", clientHow: "html", max: 100, clientMax: 100, text: true }],
    tagField: "name",
    valid: (_c, tag) => ({ name: tag }),
    action: { mod: "@/app/app/sys/[id]/crm/settings/api/actions", fn: "createCrmApiKeyAction", args: (_c, v) => [fd({ systemId: SYS, name: S(v, "name"), bundle: "crm.readonly" })] },
    probe: async (_c, tag) => countWhere("apiKey", { tenantId: TENANT, name: likeTag(tag) }),
    readStored: readCol("apiKey", (tag) => ({ tenantId: TENANT, name: likeTag(tag) }), "name"),
    renders: [{ label: "/settings/api key table", path: () => `${CRM_BASE}/settings/api` }],
    serverBad: [{ id: "name-101", patch: (_c, v) => ({ ...v, name: `${S(v, "name")}${"k".repeat(101)}` }), why: "client maxLength=100 (CrmApiSettings.tsx:137)" }],
  },
  {
    testid: "crm-api-hook-form", page: "/settings/api", src: "CrmApiSettings.tsx:275 · action src/app/app/sys/[id]/crm/settings/api/actions.ts:100 createCrmWebhookAction(fd) → webhooks/service.ts:145 createEndpoint (DNS-only SSRF guard)",
    layout: "inline", path: () => `${CRM_BASE}/settings/api`, opener: ["crm-api-hook-new"], submit: "crm-api-hook-submit", errorBox: "crm-api-hook-msg",
    fields: [
      { key: "url", testid: "crm-api-hook-url", kind: "text", required: "both", clientHow: "html", clientMax: 500 },
      { key: "events", testid: "crm-api-hook-event-crm.deal.won", kind: "checkbox", required: "server" },
    ],
    requiredCases: [
      { id: "url", empty: ["url"], anchor: "url", who: "both", clientHow: "html" },
      { id: "events", empty: ["events"], anchor: "events", who: "server", uncheckAll: "crm-api-hook-event-" },
    ],
    tagField: "url",
    valid: (_c, tag) => ({ url: `https://${tag}.invalid/hook`, events: ["crm.deal.won", "crm.contact.created"] }),
    action: { mod: "@/app/app/sys/[id]/crm/settings/api/actions", fn: "createCrmWebhookAction", args: (_c, v) => [fd({ systemId: SYS, url: S(v, "url"), events: Array.isArray(v.events) ? (v.events as string[]) : v.events ? [S(v, "events")] : [] })] },
    probe: async (_c, tag) => countWhere("webhookEndpoint", { tenantId: TENANT, url: likeTag(tag) }),
    renders: [{ label: "/settings/api webhook table", path: () => `${CRM_BASE}/settings/api` }],
    serverBad: [{ id: "url-http", patch: (_c, v) => ({ ...v, url: S(v, "url").replace("https://", "http://") }), why: "input type=url accepts http:// — server crmWebhookUrlProblem refuses (webhook-events.ts:42)" }],
  },
  // ───────────── C2.2 sequences ─────────────
  {
    testid: "crm-seq-new-form", page: "/settings/sequences", src: "src/components/crm/sequences/SequenceListView.tsx:23 · action src/app/app/sys/[id]/crm/settings/sequences/actions.ts:56 createSequenceAction → sequences.ts:414 createSequence/cleanHead:356 + sequences-shared.ts:129 cleanStep",
    layout: "inline", path: () => `${CRM_BASE}/settings/sequences`, opener: ["crm-seq-new"], close: "crm-seq-new-cancel", submit: "crm-seq-new-submit", errorBox: "crm-seq-msg",
    fields: [
      { key: "name", testid: "crm-seq-new-name", kind: "text", required: "both", clientHow: "js-box", clientMsg: "ตั้งชื่อลำดับการติดตามก่อนบันทึก", max: 120, clientMax: 120, text: true },
      { key: "subject", testid: "crm-seq-step-subject-new", kind: "text", required: "server", max: 200, clientMax: 200, text: true },
      { key: "body", testid: "crm-seq-step-body-new", kind: "textarea", required: "server", max: 4000, clientMax: 4000, text: true },
    ],
    tagField: "name",
    valid: (_c, tag) => ({ name: tag, subject: "qc หัวเรื่อง", body: "qc เนื้อความ" }),
    action: { mod: "@/app/app/sys/[id]/crm/settings/sequences/actions", fn: "createSequenceAction", args: (_c, v) => [SYS, { name: S(v, "name"), steps: [{ kind: "EMAIL", subject: S(v, "subject"), body: S(v, "body"), templateId: null, channel: null }] }] },
    rest: { method: "POST", path: () => "/sequences", body: (_c, v) => ({ name: S(v, "name"), steps: [{ kind: "EMAIL", subject: S(v, "subject"), body: S(v, "body") }] }), op: "sequences.create" },
    probe: async (_c, tag) => countWhere("crmSequence", { systemId: SYS, name: likeTag(tag) }),
    readStored: async (_c, tag, k) => {
      const seq = await P.crmSequence.findFirst({ where: { systemId: SYS, name: likeTag(tag) }, select: { id: true, name: true } }).catch(() => null);
      if (!seq) return null;
      if (k === "name") return seq.name;
      const step = await P.crmSequenceStep.findFirst({ where: { sequenceId: seq.id }, orderBy: { index: "asc" }, select: { subject: true, body: true } }).catch(() => null);
      return step ? String((step as Any)[k] ?? "") : null;
    },
    renders: [
      { label: "/settings/sequences list", path: () => `${CRM_BASE}/settings/sequences` },
      { label: "sequence editor", path: async (_c, tag) => { const id = await idOfTagged("crmSequence", "name", tag, { systemId: SYS }); return id ? `${CRM_BASE}/settings/sequences/${id}` : null; } },
    ],
  },
  {
    testid: "crm-seq-holiday-form", page: "/settings/holidays", src: "src/components/crm/sequences/SequenceCalendarSettings.tsx:62 · action src/app/app/sys/[id]/crm/settings/sequences/actions.ts:188 addHolidayAction → sequences.ts:1079 addHoliday → settings.ts:187 mergeCrmHolidays (jsonb_set · DISTINCT ON date)",
    layout: "inline", path: () => `${CRM_BASE}/settings/holidays`, submit: "crm-seq-holiday-add", errorBox: "crm-seq-calendar-msg",
    fields: [
      { key: "date", testid: "crm-seq-holiday-date", kind: "date", required: "server" },
      { key: "name", testid: "crm-seq-holiday-name", kind: "text", required: false, max: 120, clientMax: 120, text: true },
    ],
    tagField: "name",
    valid: (_c, tag) => ({ date: holidayDate(tag), name: tag }),
    action: { mod: "@/app/app/sys/[id]/crm/settings/sequences/actions", fn: "addHolidayAction", args: (_c, v) => [SYS, S(v, "date"), S(v, "name")] },
    probe: async (_c, tag) => { const h = ((await settingsCrm()).holidays ?? []) as { date: string; name?: string }[]; return h.filter((x) => x.date === holidayDate(tag)).length; },
    readStored: async (_c, tag) => { const h = ((await settingsCrm()).holidays ?? []) as { date: string; name?: string }[]; return h.find((x) => x.date === holidayDate(tag))?.name ?? null; },
    renders: [{ label: "/settings/holidays rows", path: () => `${CRM_BASE}/settings/holidays` }],
    naturalKey: "DISTINCT ON (date) in one jsonb_set statement (settings.ts:187) — idempotent",
    restoreEach: true,
    serverBad: [{ id: "date-invalid", patch: (_c, v) => ({ ...v, date: "2031-13-45" }), why: "input type=date cannot produce it; service regex+parse (sequences.ts:1079)" }],
  },
  {
    testid: "crm-seq-enroll-form", page: "/contacts/[contactId]", src: "src/components/crm/sequences/SequenceEnrollButton.tsx:33 · action src/app/app/sys/[id]/crm/settings/sequences/actions.ts:94 enrollContactAction → sequences.ts:640 enrollOne (partial unique ACTIVE index)",
    layout: "inline", path: (c) => (c.enrollContactId ? `${CRM_BASE}/contacts/${c.enrollContactId}` : null), opener: ["crm-seq-enroll"], close: "crm-seq-enroll-cancel", submit: "crm-seq-enroll-submit", errorBox: "crm-seq-enroll-msg",
    fields: [{ key: "sequenceId", testid: "crm-seq-enroll-pick", kind: "select", required: "both", clientHow: "js-box", clientMsg: "เลือกลำดับการติดตามก่อน", uiEmpty: false }],
    tagField: null,
    valid: () => ({ sequenceId: FIXTURE.sequenceId ?? "" }),
    action: { mod: "@/app/app/sys/[id]/crm/settings/sequences/actions", fn: "enrollContactAction", args: (c, v) => [SYS, { sequenceId: S(v, "sequenceId"), contactId: c.enrollContactId ?? "", replace: false }] },
    rest: { method: "POST", path: () => (FIXTURE.sequenceId ? `/sequences/${FIXTURE.sequenceId}/enroll` : null), body: (c) => ({ contactId: c.enrollContactId }), op: "sequences.enroll", omitCases: ["sequenceId"] },
    probe: async (c) => countWhere("crmSequenceEnrollment", { sequenceId: FIXTURE.sequenceId ?? "-", contactId: c.enrollContactId ?? "-", status: "ACTIVE" }),
    renders: [{ label: "contact 360 sequences block", path: (c) => `${CRM_BASE}/contacts/${c.enrollContactId}` }],
    naturalKey: "partial unique (sequenceId, contactId) WHERE status='ACTIVE' (migration crm_v2_b:597) → CONFLICT ALREADY_IN",
    restoreEach: true,
    fixture: "sequence",
    needs: (c) => (c.enrollContactId ? null : "ไม่มีผู้ติดต่อที่ยังไม่อยู่ในลำดับ"),
  },
  {
    testid: "crm-seq-bulk-form", page: "/contacts", src: "src/components/crm/sequences/SequenceBulkEnroll.tsx · action src/app/app/sys/[id]/crm/settings/sequences/actions.ts:116 bulkEnrollContactsAction → sequences.ts:711 bulkEnroll/reasonOf:693",
    layout: "inline", path: () => `${CRM_BASE}/contacts`, opener: ["crm-seq-bulk"], close: "crm-seq-bulk-cancel", submit: "crm-seq-bulk-submit", errorBox: "crm-seq-bulk-msg",
    fields: [
      { key: "sequenceId", testid: "crm-seq-bulk-pick", kind: "select", required: "server", uiEmpty: false },
      { key: "confirm", testid: "crm-seq-bulk-confirm", kind: "checkbox", required: "server" },
      { key: "reason", testid: "crm-seq-bulk-reason", kind: "text", required: "server", max: 500, clientMax: 500 },
    ],
    tagField: null,
    valid: (_c, tag) => ({ sequenceId: FIXTURE.sequenceId ?? "", confirm: true, reason: `${tag} ใส่เป็นกลุ่ม` }),
    action: { mod: "@/app/app/sys/[id]/crm/settings/sequences/actions", fn: "bulkEnrollContactsAction", args: (c, v) => [SYS, { sequenceId: S(v, "sequenceId"), contactIds: c.bulkContactIds, confirm: v.confirm === true, reason: S(v, "reason") }] },
    rest: { method: "POST", path: () => (FIXTURE.sequenceId ? `/sequences/${FIXTURE.sequenceId}/bulk-enroll` : null), body: (c, v) => ({ contactIds: c.bulkContactIds, reason: S(v, "reason"), ...(v.confirm === true ? { confirm: true } : {}) }), op: "sequences.bulkEnroll", omitCases: ["sequenceId"] },
    probe: async () => countWhere("crmSequenceEnrollment", { sequenceId: FIXTURE.sequenceId ?? "-", status: "ACTIVE" }),
    expectRows: (c, mode) => (mode === "inproc" ? c.bulkContactIds.length : -1), // browser: every eligible contact on the page (≥1, each once — dupProbe)
    dupProbe: async () => {
      const rows = (await P.crmSequenceEnrollment.groupBy({ by: ["contactId"], where: { sequenceId: FIXTURE.sequenceId ?? "-", status: "ACTIVE" }, _count: { _all: true } }).catch(() => [])) as Any[];
      return rows.filter((r) => (r._count?._all ?? 0) > 1).length;
    },
    renders: [],
    naturalKey: "partial unique ACTIVE index per contact — conflicts counted, never thrown (sequences.ts:711)",
    restoreEach: true,
    fixture: "sequence",
    needs: (c) => (c.bulkContactIds.length ? null : "ไม่มีผู้ติดต่อที่ยังไม่อยู่ในลำดับ"),
  },
  // ───────────── C2.5 e-mail composer (real transport) ─────────────
  {
    testid: "crm-email-composer", page: "/emails/[threadKey]", src: "src/components/crm/emails/EmailComposer.tsx:50 · action src/app/app/sys/[id]/crm/emails/actions.ts:40 → src/lib/modules/crm/emails-actions.ts:58 sendCrmEmailAction → emails.ts:1089 sendCore → deliver() → core.sendEmailRich → fetch api.resend.com",
    layout: "inline", path: () => (FIXTURE.emailThreadKey ? `${CRM_BASE}/emails/${FIXTURE.emailThreadKey}` : null), submit: "crm-email-send", errorBox: "crm-email-composer-msg",
    fields: [
      { key: "subject", testid: "crm-email-subject", kind: "text", required: "both", clientHow: "js-box", clientMsg: "ใส่หัวข้อจดหมายก่อนส่ง — ลูกค้าเห็นหัวข้อก่อนเปิดอ่านเสมอ", max: 300, clientMax: 300, text: true },
      { key: "body", testid: "crm-email-body", kind: "textarea", required: "both", clientHow: "js-box", clientMsg: "ยังไม่มีเนื้อความ — พิมพ์ข้อความที่จะส่งถึงลูกค้าก่อน" },
    ],
    tagField: "subject",
    valid: (_c, tag) => ({ subject: tag, body: "qc เนื้อความ" }),
    // 🔴 in-process ALWAYS schedules far in the future: an immediate send that dies mid-deliver is re-sent for real by the
    //    QC server's minute job (emails.ts:1548-1554). sendCore validates exactly the same before branching (:1165).
    action: { mod: "@/app/app/sys/[id]/crm/emails/actions", fn: "sendCrmEmailAction", args: (c, v) => [SYS, { contactId: c.emailContactId ?? "", to: c.emailTo ? [c.emailTo] : [], subject: S(v, "subject"), bodyHtml: S(v, "body") ? `<p>${S(v, "body")}</p>` : "", scheduledAt: FAR_FUTURE }] },
    probe: async (_c, tag) => countWhere("crmEmailMessage", { systemId: SYS, subject: likeTag(tag) }),
    readStored: readCol("crmEmailMessage", (tag) => ({ systemId: SYS, subject: likeTag(tag) }), "subject"),
    renders: [{ label: "thread page", path: async (_c, tag) => { const k = await firstOf("crmEmailMessage", { systemId: SYS, subject: likeTag(tag) }, "threadKey"); return k ? `${CRM_BASE}/emails/${k}` : null; } }],
    guard: "real e-mail transport (sendEmailRich → api.resend.com) on the SERVER process — browser never submits; in-process runs behind the fetch sandbox",
    fixture: "emailThread",
    needs: (c) => (c.emailContactId && c.emailTo ? null : "ไม่มีผู้ติดต่อที่มีอีเมลและรับข่าวสาร"),
  },
  // ───────────── C3.4 team room ─────────────
  {
    testid: "crm-settings-team-room", page: "/settings", src: "src/components/crm/ai/CrmTeamRoomPicker.tsx:70 · action src/app/app/sys/[id]/crm/_actions/ai.ts:75 setTeamRoomAction → ai-bridges.ts:1029 setTeamRoom (jsonb_set keyed overwrite)",
    layout: "inline", path: () => `${CRM_BASE}/settings`, submit: "crm-settings-team-room-save",
    fields: [
      { key: "teamId", testid: "crm-settings-team-room-team", kind: "select", required: "server", uiEmpty: false },
      { key: "channelId", testid: "crm-settings-team-room-channel", kind: "select", required: false },
    ],
    tagField: null,
    valid: (c) => ({ teamId: c.teamId ?? "", channelId: c.teamRoomChannelId ?? "" }),
    action: { mod: "@/app/app/sys/[id]/crm/_actions/ai", fn: "setTeamRoomAction", args: (_c, v) => [SYS, S(v, "teamId"), S(v, "channelId") || null] },
    probe: async (c) => { const tr = ((await settingsCrm()).teamRooms ?? {}) as Record<string, { channelId?: string }>; return tr[c.teamId ?? "-"]?.channelId === c.teamRoomChannelId ? 1 : 0; },
    renders: [],
    naturalKey: "keyed overwrite settings.crm.teamRooms[teamId] (one jsonb_set)",
    restoreEach: true,
    needs: (c) => (c.teamRoomChannelId ? null : "ไม่มีห้องแชททีม (ระบบ MEETING) ในซีด — ฟอร์มแสดงข้อความแทนฟอร์ม"),
    serverBad: [{ id: "channel-foreign", patch: (_c, v) => ({ ...v, channelId: "qc-no-such-channel" }), why: "service ai-bridges.ts:100 'ไม่พบห้องนี้ในแชททีมของร้าน'" }],
    fOnlyWhenNeedsFail: true,
  },
);

// ═══════════════════════════════════════════════════════════════════
// results
// ═══════════════════════════════════════════════════════════════════
type Cat = "a" | "b" | "c" | "d" | "e" | "f";
type Res = { form: string; cat: Cat; check: string; mode: "inproc" | "browser"; ok: boolean; kind: string; detail: string };
const results: Res[] = [];
const advisories: { form: string; cat: Cat; check: string; detail: string }[] = [];
const skipped: { form: string; cat: Cat | "*"; check: string; mode: string; reason: string }[] = [];
const positiveControls: { id: string; cat: Cat; what: string; caught: boolean; detail: string }[] = [];
const rec = (form: string, cat: Cat, check: string, mode: Res["mode"], ok: boolean, kind = "", detail = "") => {
  results.push({ form, cat, check, mode, ok, kind: ok ? "" : kind, detail: cut(detail, 400) });
  console.log(`  ${ok ? "✅" : "❌"} [${form} · ${cat} · ${check} · ${mode}]${ok ? "" : ` ${kind} — ${cut(detail, 220)}`}`);
};
const adv = (form: string, cat: Cat, check: string, detail: string) => { advisories.push({ form, cat, check, detail: cut(detail, 400) }); console.log(`  ℹ️  [${form} · ${cat} · ${check}] ${cut(detail, 220)}`); };
const skip = (form: string, cat: Cat | "*", check: string, mode: string, reason: string) => { skipped.push({ form, cat, check, mode, reason }); };
const want = (c: Cat) => CAT_FILTER.has(c);

// ── hostile payloads (c) — every payload embeds the attempt's tag so the probe finds its row ──
type Payload = { id: string; make: (tag: string, max?: number) => string; sig: (v: string, tag: string) => string; mustAccept?: boolean };
const PAYLOADS: Payload[] = [
  { id: "overlong", make: (tag, max) => `${tag} ${"ก".repeat(Math.max(10, (max ?? 5000) + 5 - tag.length))}`, sig: (_v, tag) => tag },
  { id: "emoji", make: (tag) => `${tag} 😀👍🏽🇹🇭 👨‍👩‍👧 ทดสอบ`, sig: () => "😀👍🏽🇹🇭", mustAccept: true },
  { id: "formula", make: (tag) => `=cmd|' /C calc'!A0 ${tag}`, sig: () => "=cmd|' /C calc'!A0" },
  { id: "script", make: (tag) => `<script>window.__qcXss=1</script> ${tag}`, sig: () => "<script>window.__qcXss=1</script>" },
  { id: "img", make: (tag) => `"><img src=x onerror="window.__qcXss=1"> ${tag}`, sig: () => `"><img src=x onerror=` },
];
const OTHER_FIELD_PAYLOADS = new Set(["formula", "script", "img"]);

/** CSV cells (RFC 4180, quoted cells) of every line that mentions `needle` */
function csvLinesWith(csv: string, needle: string): string[][] {
  const out: string[][] = [];
  const rows: string[][] = [];
  let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]!;
    if (q) { if (ch === '"') { if (csv[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') { q = true; continue; }
    if (ch === ",") { row.push(cell); cell = ""; continue; }
    if (ch === "\n" || ch === "\r") { if (ch === "\r" && csv[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  for (const r of rows) if (r.some((c) => c.includes(needle))) out.push(r);
  return out;
}
/** a cell is dangerous when a spreadsheet would read it as a formula (the csvRow contract, src/lib/core/csv.ts:118) */
const formulaCell = (c: string) => !/^-?\d+(\.\d+)?$/.test(c) && /^[\t\r\n ]*[=+\-@]/.test(c);
const csvSafe = (lines: string[][]) => lines.every((r) => r.every((c) => !formulaCell(c)));

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** refusal is CLEAN when the action returned {ok:false} with Thai text (a throw is redacted by production Next) */
const cleanRefusal = (r: AR) => !r.ok && !r.thrown && thai(r.msg);
const refusalKind = (r: AR) => (r.ok ? "accepted" : r.thrown ? "thrown" : !thai(r.msg) ? "not-thai" : "");

// ═══════════════════════════════════════════════════════════════════
// restore (shared module) + fixtures
// ═══════════════════════════════════════════════════════════════════
type Restorer = {
  takeSnapshot(): Promise<{ tables: number; rows: number; at: Date }>;
  restoreSnapshot(label: string, opts?: { keepNew?: boolean }): Promise<{ deleted: number; updated: number; recreated: number; failed: string[] }>;
  protect(id: string): void; unprotect(id: string): void; clearProtect(): void;
  sweepTag(tag: string, systemId: string): Promise<number>;
  purgeAppendOnlySince(): Promise<Record<string, number>>;
  verify(): Promise<Any>;
  restoreLog: Any[];
};
let R: Restorer | null = null;

async function ensureFixture(kind: string | undefined, ctx: RunCtx): Promise<string | null> {
  if (kind === "sequence" && !FIXTURE.sequenceId) {
    // TASK step only — an EMAIL/LINE step would make the QC server's sequence job send for real (phase 2)
    const r = await callAction("@/app/app/sys/[id]/crm/settings/sequences/actions", "createSequenceAction",
      [SYS, { name: `${TAG0}-fixture ลำดับทดสอบ`, steps: [{ kind: "TASK", taskTitle: "qc-form งานทดสอบ", taskType: "TASK", body: "", templateId: null, channel: null }] }], ctx.cookie);
    if (!r.ok) return `สร้าง sequence fixture ไม่สำเร็จ: ${r.msg}`;
    FIXTURE.sequenceId = String(r.v?.id ?? "");
    R?.protect(FIXTURE.sequenceId);
    FIXTURE.sequenceStepIds = ((await P.crmSequenceStep.findMany({ where: { sequenceId: FIXTURE.sequenceId }, select: { id: true } })) as Any[]).map((s) => s.id);
    for (const id of FIXTURE.sequenceStepIds) R?.protect(id);
  }
  if (kind === "emailThread" && !FIXTURE.emailThreadKey) {
    CURRENT_FORM = "fixture:emailThread";
    // the seed grants no e-mail consent (canContact → EMAIL_BLOCKED): record one for the composer's contact (restored at the end)
    const consent = await P.crmContactConsent.create({ data: { tenantId: TENANT, systemId: SYS, contactId: ctx.emailContactId ?? "", channel: "EMAIL", granted: true, source: "qc-form-fixture", note: TAG0 }, select: { id: true } }).catch((e: Error) => e);
    if (consent instanceof Error) return `บันทึกความยินยอม fixture ไม่สำเร็จ: ${cut(consent.message, 120)}`;
    R?.protect(consent.id);
    const r = await callAction("@/app/app/sys/[id]/crm/emails/actions", "sendCrmEmailAction",
      [SYS, { contactId: ctx.emailContactId ?? "", to: ctx.emailTo ? [ctx.emailTo] : [], subject: `${TAG0}-fixture หัวข้อ`, bodyHtml: "<p>qc-form fixture</p>", scheduledAt: FAR_FUTURE }], ctx.cookie);
    const m = await P.crmEmailMessage.findFirst({ where: { systemId: SYS, subject: { contains: `${TAG0}-fixture` } }, select: { id: true, threadKey: true } }).catch(() => null);
    if (!m) return `สร้างเธรดอีเมล fixture ไม่สำเร็จ: ${r.ok ? "ไม่มีแถว" : r.msg}`;
    FIXTURE.emailThreadKey = m.threadKey; R?.protect(m.id);
  }
  return null;
}
async function dropFixtures(): Promise<void> {
  if (FIXTURE.sequenceId) { R?.unprotect(FIXTURE.sequenceId); for (const id of FIXTURE.sequenceStepIds) R?.unprotect(id); }
  // the email fixture row is unprotected by clearProtect() at the end (final restore deletes it)
}

// ═══════════════════════════════════════════════════════════════════
// IN-PROCESS pass (f + DB side of c/d + positive controls)
// ═══════════════════════════════════════════════════════════════════
const act = (spec: FormSpec, ctx: RunCtx, v: Vals) => callAction(spec.action!.mod, spec.action!.fn, spec.action!.args(ctx, v), ctx.cookie);
const expectOf = (spec: FormSpec, ctx: RunCtx, mode: "inproc" | "browser") => (spec.expectRows ? spec.expectRows(ctx, mode) : 1);
const between = async (spec: FormSpec, label: string) => { if (spec.restoreEach) await R!.restoreSnapshot(`${spec.testid} ${label}`); };
const emptyOf = (f: FieldSpec): string | boolean | string[] => (f.kind === "checkbox" ? (f.key === "events" ? [] : false) : "");
const casesOf = (spec: FormSpec): RequiredCase[] => spec.requiredCases ?? spec.fields.filter((f) => f.required).map((f) => ({
  id: f.key, empty: [f.key], anchor: f.key, who: f.required as RequiredCase["who"], clientHow: f.clientHow, clientMsg: f.clientMsg,
}));

// S4 (C4.3 review): for 17 forms the required field IS the tag field — emptying it removes the tag, so the tag probe
//   cannot see a row written anyway. Every refusal/abandon check also compares a whole-table state (count or
//   fingerprint, scoped to this system/tenant) taken before/after under the gate lock.
const cnt = (model: string, where: () => Any) => async (): Promise<string> => String(await countWhere(model, where()));
const STATE: Record<string, (ctx: RunCtx) => Promise<string>> = {
  "company-new-form": cnt("crmCompany", () => ({ systemId: SYS })),
  "contact-new-form": cnt("crmContact", () => ({ systemId: SYS })),
  "deal-new-form": cnt("crmDeal", () => ({ systemId: SYS })),
  "pl-new-form": cnt("crmPipeline", () => ({ systemId: SYS })),
  "st-new-form": cnt("crmStage", () => ({ systemId: SYS })),
  "lr-new-form": cnt("crmLostReason", () => ({ systemId: SYS })),
  "activity-log-form": cnt("crmActivity", () => ({ systemId: SYS })),
  "teams-create-form": cnt("team", () => ({ tenantId: TENANT })),
  "team-member-add-form": cnt("teamMember", () => ({ tenantId: TENANT })),
  "visibility-override-form": cnt("crmVisibilityPolicy", () => ({ systemId: SYS })),
  "object-edit-form": async (c) => JSON.stringify(await P.customObject.findFirst({ where: { systemId: SYS, key: c.objectKey ?? "-" }, select: { key: true, label: true, labelPlural: true, titleFieldKey: true, showAsTab: true, portalVisible: true } })),
  "object-archive-form": async (c) => JSON.stringify(await P.customObject.findFirst({ where: { systemId: SYS, key: c.objectKey ?? "-" }, select: { archivedAt: true } })),
  "object-add-form": cnt("customObject", () => ({ systemId: SYS })),
  "object-view-save-form": cnt("memberSavedView", () => ({ tenantId: TENANT })),
  "object-import-form": cnt("customRecord", () => ({ systemId: SYS })),
  "object-record-form": cnt("customRecord", () => ({ systemId: SYS })),
  "crm-api-key-form": cnt("apiKey", () => ({ tenantId: TENANT })),
  "crm-api-hook-form": cnt("webhookEndpoint", () => ({ tenantId: TENANT })),
  "crm-seq-new-form": cnt("crmSequence", () => ({ systemId: SYS })),
  "crm-seq-holiday-form": async () => JSON.stringify((await settingsCrm()).holidays ?? []),
  "crm-seq-enroll-form": cnt("crmSequenceEnrollment", () => ({ systemId: SYS })),
  "crm-seq-bulk-form": cnt("crmSequenceEnrollment", () => ({ systemId: SYS })),
  "crm-email-composer": cnt("crmEmailMessage", () => ({ systemId: SYS })),
  "crm-settings-team-room": async () => JSON.stringify((await settingsCrm()).teamRooms ?? {}),
};
type W = { p: number; s: string };
const stateOf = async (spec: FormSpec, ctx: RunCtx): Promise<string> => (STATE[spec.testid] ? await STATE[spec.testid]!(ctx) : "");
const snapW = async (spec: FormSpec, ctx: RunCtx, t: string): Promise<W> => ({ p: await spec.probe(ctx, t), s: await stateOf(spec, ctx) });
/** Δ of the tag probe AND whether the whole-table state moved — `clean` = nothing was written at all */
async function diffW(spec: FormSpec, ctx: RunCtx, t: string, b: W): Promise<{ d: number; clean: boolean; txt: string }> {
  const a = await snapW(spec, ctx, t);
  // round 2 note: countWhere() returns -1 on a query error — an unmeasurable probe is NEVER "clean"
  if (a.p < 0 || b.p < 0 || a.s === "-1" || b.s === "-1" || a.s === "null" && b.s !== "null") return { d: 0, clean: false, txt: `probe-error (probe ${b.p}→${a.p} · state ${cut(b.s, 20)}→${cut(a.s, 20)})` };
  const moved = a.s !== b.s;
  return { d: a.p - b.p, clean: a.p === b.p && !moved, txt: `rows Δ${a.p - b.p}${moved ? ` · table ${cut(b.s, 40)}→${cut(a.s, 40)}` : ""}` };
}
/** round 2 note: assert per form that its tag probe and whole-table state are measurable before any check relies on them */
async function assertProbes(spec: FormSpec, ctx: RunCtx): Promise<void> {
  const p = await spec.probe(ctx, `${TAG0}-probe-assert`); const st = await stateOf(spec, ctx);
  if (p < 0 || st === "-1" || st === "") throw new Error(`probe/state ของ ${spec.testid} วัดไม่ได้ (probe ${p} · state "${cut(st, 30)}") — หยุดฟอร์มนี้ก่อนตรวจ`);
}
// review NOTE: side rows a create writes next to the main row (Party / CrmDealStageHistory) — a double submit must not double them
const SIDE: Record<string, (tag: string) => Promise<number>> = {
  "company-new-form": (tag) => countWhere("party", { tenantId: TENANT, name: likeTag(tag) }),
  "contact-new-form": (tag) => countWhere("party", { tenantId: TENANT, name: likeTag(tag) }),
  // createDeal writes exactly one CrmDealStageHistory row per deal (deals.ts:725) — no CrmDealContact (v2 run: side 0)
  "deal-new-form": (tag) => countWhere("crmDealStageHistory", { deal: { systemId: SYS, title: likeTag(tag) } }),
};

async function inprocForm(spec: FormSpec, ctx: RunCtx): Promise<void> {
  const F = spec.testid;
  CURRENT_FORM = F;
  if (!spec.action) { skip(F, "*", "inproc", "inproc", "ไม่มี server action"); return; }
  const need = spec.needs?.(ctx) ?? null;
  const fx = need ? null : await ensureFixture(spec.fixture, ctx);
  const blockedBefore = blockedFetch.length;
  if (need || fx) {
    const why = need ?? fx!;
    if (!spec.fOnlyWhenNeedsFail) { for (const c of ["a", "c", "d", "f"] as Cat[]) skip(F, c, "inproc", "inproc", why); return; }
    // f only: server must refuse bad inputs even when the valid path is impossible in this seed
    for (const b of spec.serverBad ?? []) {
      if (!want("f")) break;
      const t = newTag(); const r = await act(spec, ctx, b.patch(ctx, spec.valid(ctx, t)));
      rec(F, "f", `server-bad:${b.id} (action)`, "inproc", cleanRefusal(r), refusalKind(r), `${b.why} · got ${r.ok ? "ok" : `${r.code}:${cut(r.msg, 120)}`}`);
    }
    for (const c of ["a", "c", "d"] as Cat[]) skip(F, c, "inproc", "inproc", why);
    skip(F, "f", "valid+required+staff", "inproc", why); // the valid-path f checks cannot run on this seed (serverBad above did)
    return;
  }
  const rows = expectOf(spec, ctx, "inproc");
  await assertProbes(spec, ctx);

  // f — valid payload accepted by the action (the positive baseline every refusal below is measured against)
  if (want("f")) {
    const t = newTag(); const before = await spec.probe(ctx, t);
    const r = await act(spec, ctx, spec.valid(ctx, t));
    const d = (await spec.probe(ctx, t)) - before;
    rec(F, "f", "valid (action)", "inproc", r.ok && d === rows, r.ok ? "rows" : refusalKind(r) || "refused", `ok=${r.ok} ${r.ok ? "" : `${r.code}:${cut(r.msg, 120)} `}rows Δ${d} (want ${rows})`);
    await between(spec, "f.valid");
    if (spec.rest) {
      const p = spec.rest.path(ctx);
      if (p) {
        const t2 = newTag(); const b2 = await spec.probe(ctx, t2);
        const rr = await callRest(spec.rest.method, p, spec.rest.body(ctx, spec.valid(ctx, t2)), `${t2}-idem`);
        const d2 = (await spec.probe(ctx, t2)) - b2;
        rec(F, "f", `valid (REST ${spec.rest.op})`, "inproc", rr.status >= 200 && rr.status < 300 && d2 === rows, "rest-refused", `HTTP ${rr.status} ${cut(restMsg(rr), 120)} rows Δ${d2}`);
        await between(spec, "f.valid.rest");
      }
    }
    // f — each required-empty case refused by the action and by REST, nothing written
    for (const rc of casesOf(spec)) {
      const t = newTag(); const v = { ...spec.valid(ctx, t) };
      for (const k of rc.empty) { const f = spec.fields.find((x) => x.key === k); v[k] = f ? emptyOf(f) : ""; }
      const before = await snapW(spec, ctx, t);
      const r = await act(spec, ctx, v);
      const w = await diffW(spec, ctx, t, before);
      rec(F, "f", `required:${rc.id} (action)`, "inproc", cleanRefusal(r) && w.clean, !w.clean ? "row-written" : refusalKind(r), `${r.ok ? "accepted" : `${r.code}:${cut(r.msg, 140)}`} ${w.txt} (who=${rc.who})`);
      if (!r.ok && rc.clientMsg && r.msg && r.msg !== rc.clientMsg) adv(F, "f", `required:${rc.id}`, `client says "${rc.clientMsg}" · server says "${cut(r.msg, 140)}"`);
      await between(spec, `f.required.${rc.id}`);
      const rp = spec.rest?.path(ctx);
      if (spec.rest && rp && !(spec.rest.omitCases ?? []).includes(rc.id)) {
        const t2 = newTag(); const v2 = { ...spec.valid(ctx, t2) };
        for (const k of rc.empty) { const f = spec.fields.find((x) => x.key === k); v2[k] = f ? emptyOf(f) : ""; }
        const b2 = await snapW(spec, ctx, t2);
        const rr = await callRest(spec.rest.method, rp, spec.rest.body(ctx, v2), `${t2}-idem`);
        const w2 = await diffW(spec, ctx, t2, b2);
        rec(F, "f", `required:${rc.id} (REST ${spec.rest.op})`, "inproc", rr.status >= 400 && rr.status < 500 && w2.clean && thai(restErrTh(rr)), !w2.clean ? "row-written" : rr.status < 400 ? "accepted" : rr.status >= 500 ? "5xx" : "not-thai", `HTTP ${rr.status} ${cut(restMsg(rr), 120)} ${w2.txt}`);
        await between(spec, `f.required.${rc.id}.rest`);
      }
    }
    // f — inputs the CLIENT refuses (or cannot produce) must be refused by the server too
    for (const b of spec.serverBad ?? []) {
      const t = newTag(); const before = await snapW(spec, ctx, t);
      const r = await act(spec, ctx, b.patch(ctx, spec.valid(ctx, t)));
      const w = await diffW(spec, ctx, t, before);
      rec(F, "f", `server-bad:${b.id} (action)`, "inproc", cleanRefusal(r) && w.clean, !w.clean ? "row-written" : refusalKind(r), `${b.why} · got ${r.ok ? "ok" : `${r.code}:${cut(r.msg, 120)}`} ${w.txt}`);
      await between(spec, `f.bad.${b.id}`);
    }
    for (const b of spec.clientOnly ?? []) {
      const t = newTag(); const before = await spec.probe(ctx, t);
      const r = await act(spec, ctx, b.patch(ctx, spec.valid(ctx, t)));
      const d = (await spec.probe(ctx, t)) - before;
      adv(F, "f", `client-only:${b.id}`, `${b.why} · server ${r.ok ? `accepted (rows Δ${d})` : `refused ${r.code}:${cut(r.msg, 80)}`}`);
      await between(spec, `f.clientOnly.${b.id}`);
    }
  }

  // f — STAFF (thana) permission: a refusal must be a clean Thai {ok:false} (never a throw); a form the UI HIDES from
  //     thana (registry hiddenFor) must also be refused by the server (controller ruling D-r1 · finding 4)
  if (want("f") && ctx.staffCookie) {
    const row = FORM_ROWS.find((r) => r.testid === F);
    const hidden = !!row?.hiddenFor.includes("thana");
    const allowed = !!row?.roles.includes("thana");
    const t = newTag(); const before = await snapW(spec, ctx, t);
    const r = await callAction(spec.action.mod, spec.action.fn, spec.action.args(ctx, spec.valid(ctx, t)), ctx.staffCookie);
    const w = await diffW(spec, ctx, t, before); const d = w.clean ? 0 : Math.max(1, w.d);
    const role = hidden ? "hiddenFor" : allowed ? "roles" : "not-in-roles";
    const detail = `thana (${role}) → ${r.ok ? `accepted rows Δ${d}` : `${r.thrown ? "THROWN " : ""}${r.code}:${cut(r.msg, 120)}`}`;
    if (r.ok) {
      if (hidden) rec(F, "f", "staff:thana", "inproc", false, "server-allows-hidden", detail);
      else adv(F, "f", "staff:thana", detail);
    } else rec(F, "f", "staff:thana", "inproc", cleanRefusal(r) && d === 0, d !== 0 ? "row-written" : refusalKind(r), detail);
    await between(spec, "f.staff");
  }

  // c — hostile input in every free-text field: stored exactly or refused cleanly · CSV cells neutralised
  if (want("c")) {
    for (const f of spec.fields.filter((x) => x.text)) {
      for (const p of PAYLOADS) {
        const onTag = f.key === spec.tagField || spec.tagField === null;
        if (!onTag && !OTHER_FIELD_PAYLOADS.has(p.id)) continue;
        if (spec.csvPayloadCell && p.id === "overlong") { skip(F, "c", `overlong@${f.key}`, "inproc", "record title = first 200 chars of the title field BY DESIGN (objects.ts createRecordCore) — the cell payloads below go through import → store → export"); continue; }
        const t = newTag();
        const value = p.make(t, f.max);
        const v = { ...spec.valid(ctx, t) };
        if (spec.csvPayloadCell) v[f.key] = String(v[f.key]).replace(t, `"${value.replace(/"/g, '""')}"`);
        else if (onTag) v[f.key] = value; else v[f.key] = value; // other field: tag field keeps the plain tag
        const before = await snapW(spec, ctx, t);
        const r = await act(spec, ctx, v);
        const w = await diffW(spec, ctx, t, before); const d = w.d;
        const check = `${p.id}@${f.key}`;
        if (d === expectOf(spec, ctx, "inproc") && d > 0) {
          const stored = spec.readStored ? await spec.readStored(ctx, t, spec.csvPayloadCell ? "title" : f.key) : null;
          const exact = stored === value;
          const kind = stored === null ? "unreadable" : stored === escHtml(value) ? "html-escaped-at-write" : value.startsWith(stored) ? "silent-truncate" : stored === value.replace(/\u200d/g, "") ? "zwj-stripped" : "altered";
          const detail = `len in ${value.length} · stored ${stored === null ? "null" : `${stored.length}: ${cut(stored, 80)}`}`;
          if (!exact && kind === "silent-truncate" && f.clientMax && stored !== null && stored.length >= f.clientMax) adv(F, "c", `${check} stored`, `server cuts silently at ${stored.length}; the UI cannot exceed it (maxLength=${f.clientMax}) · ${detail}`);
          else rec(F, "c", `${check} stored`, "inproc", exact, kind, detail);
          if (spec.csv && ["formula", "script", "img", "emoji"].includes(p.id)) {
            const csv = await spec.csv(ctx, t);
            if (csv === null) skip(F, "c", `${check} csv`, "inproc", "ส่งออก CSV ไม่สำเร็จ/ไม่มีสิทธิ์");
            else {
              const lines = csvLinesWith(csv, t);
              rec(F, "c", `${check} csv`, "inproc", lines.length > 0 && csvSafe(lines), lines.length ? "formula-cell" : "row-missing-from-export", `${lines.length} line(s) · ${cut(JSON.stringify(lines[0] ?? []), 160)}`);
            }
          }
        } else if (w.clean && cleanRefusal(r)) {
          rec(F, "c", `${check} refused`, "inproc", !p.mustAccept, "legit-text-refused", `${r.code}:${cut(r.msg, 140)}`);
        } else {
          rec(F, "c", `${check}`, "inproc", false, !w.clean ? "rows" : refusalKind(r) || "crash", `ok=${r.ok} ${cut(r.msg, 140)} ${w.txt}`);
        }
        await between(spec, `c.${check}`);
      }
    }
  }

  // d — two parallel submits of the SAME payload (in-process = server-side dedupe only)
  if (want("d")) {
    const t = newTag(); const before = await spec.probe(ctx, t);
    const v = spec.valid(ctx, t);
    const [r1, r2] = await Promise.all([act(spec, ctx, v), act(spec, ctx, v)]);
    const d = (await spec.probe(ctx, t)) - before;
    const dup = spec.dupProbe ? await spec.dupProbe(ctx) : 0;
    const side = SIDE[F] ? await SIDE[F]!(t) : null;
    const one = d === rows && dup === 0 && (side === null || side === rows);
    const loserClean = r1.ok && r2.ok ? true : cleanRefusal(r1.ok ? r2 : r1) || (!r1.ok && !r2.ok ? false : true);
    const detail = `rows Δ${d} (want ${rows}) dupes ${dup}${side === null ? "" : ` side ${side}`} · r1 ${r1.ok ? "ok" : `${r1.code}:${cut(r1.msg, 60)}`} · r2 ${r2.ok ? "ok" : `${r2.code}:${cut(r2.msg, 60)}`}`;
    if (spec.naturalKey) rec(F, "d", "double (2 parallel actions)", "inproc", one && loserClean, !one ? "duplicate-rows" : "loser-unclean", `${spec.naturalKey} · ${detail}`);
    else adv(F, "d", "double (2 parallel actions)", `no server-side dedupe declared (UI guard only) · ${detail}`);
    await between(spec, "d.action");
    const rp = spec.rest?.path(ctx);
    if (spec.rest && rp) {
      const t2 = newTag(); const b2 = await spec.probe(ctx, t2); const idem = `${t2}-idem`;
      const body = spec.rest.body(ctx, spec.valid(ctx, t2));
      const [x1, x2] = await Promise.all([callRest(spec.rest.method, rp, body, idem), callRest(spec.rest.method, rp, body, idem)]);
      const d2 = (await spec.probe(ctx, t2)) - b2;
      rec(F, "d", `double (REST ${spec.rest.op}, one Idempotency-Key)`, "inproc", d2 === rows && x1.status < 500 && x2.status < 500, "duplicate-rows", `rows Δ${d2} · HTTP ${x1.status}/${x2.status}`);
      await between(spec, "d.rest");
    }
  }
  const newBlocked = blockedFetch.length - blockedBefore;
  if (newBlocked && !spec.expectedBlockedFetch) adv(F, "c", "network", `${newBlocked} outbound request(s) blocked by the sandbox (${cut(JSON.stringify(blockedFetch.slice(blockedBefore, blockedBefore + 2)), 160)})`);
}

// ── harness positive controls (no DB): restore module read failures (B2), leftover detection, lock guard (S7) ──
async function positiveControlsHarness(lockFile: string): Promise<void> {
  const RM = (await import("./lib/qc-crm-restore.mts" as string)) as { createRestorer: (o: Any) => Restorer };
  const fake = () => {
    const tables: Record<string, Any[]> = { crmLostReason: [{ id: "r1", tenantId: "T", label: "a" }], crmPipeline: [{ id: "p1", tenantId: "T", name: "x" }] };
    const fail = new Set<string>(); let deletes = 0;
    const model = (name: string) => ({
      findMany: async () => { if (fail.has(name)) throw new Error("injected read failure"); return (tables[name] ?? []).map((r) => ({ ...r })); },
      deleteMany: async ({ where }: Any) => { deletes++; const ids: string[] = where?.id?.in ?? []; const before = tables[name]!.length; tables[name] = tables[name]!.filter((r) => !ids.includes(r.id)); return { count: before - tables[name]!.length }; },
      delete: async ({ where }: Any) => { deletes++; tables[name] = tables[name]!.filter((r) => r.id !== where.id); return {}; },
      create: async ({ data }: Any) => { tables[name]!.push({ ...data }); return data; },
      update: async ({ where, data }: Any) => { const r = tables[name]!.find((x) => x.id === where.id); Object.assign(r, data); return r; },
      count: async () => 0,
    });
    const prisma: Any = { crmLostReason: model("crmLostReason"), crmPipeline: model("crmPipeline") };
    const r = RM.createRestorer({ prisma, Prisma: { dmmf: { datamodel: { models: [] } }, DbNull: null }, tenantId: "T", models: ["CrmPipeline", "CrmLostReason"], log: () => {} });
    return { r, tables, fail, deletes: () => deletes };
  };
  const pcs: Any[] = [];
  { // B2a: a read failure during takeSnapshot must abort
    const f = fake(); f.fail.add("crmPipeline");
    const err = await f.r.takeSnapshot().then(() => "", (e: Error) => e.message);
    pcs.push({ id: "PH-restore-readfail-snapshot", cat: "e", what: "injected read failure while taking the snapshot", caught: !!err, detail: cut(err || "snapshot succeeded", 100) });
  }
  { // B2b: a read failure during restore must abort BEFORE any delete (an extra row exists that restore would remove)
    const f = fake(); await f.r.takeSnapshot();
    f.tables.crmLostReason!.push({ id: "r2", tenantId: "T", label: "extra" }); f.fail.add("crmPipeline");
    const err = await f.r.restoreSnapshot("control").then(() => "", (e: Error) => e.message);
    pcs.push({ id: "PH-restore-readfail-restore", cat: "e", what: "injected read failure during restore (must throw, zero deletes)", caught: !!err && f.deletes() === 0 && f.tables.crmLostReason!.length === 2, detail: `threw=${!!err} deletes=${f.deletes()}` });
  }
  { // leftover row: verify() must report not identical; restore removes it; then identical (negative control)
    const f = fake(); await f.r.takeSnapshot();
    f.tables.crmPipeline!.push({ id: "p2", tenantId: "T", name: "left" });
    const v1 = await f.r.verify();
    await f.r.restoreSnapshot("control");
    const v2 = await f.r.verify();
    pcs.push({ id: "PH-verify-leftover", cat: "e", what: "a leftover row after the run", caught: !v1.identical && v1.extra.includes("CrmPipeline#p2") && v2.identical, detail: `before=${v1.identical} extra=${v1.extra.join(",")} after-restore=${v2.identical}` });
  }
  { // round 2 note: a row left in a tenant table OUTSIDE the snapshot list must still fail verify() (leftoversSince)
    let outside = 0; // a model known to DMMF with tenantId+createdAt, but NOT in the snapshot list
    const prisma: Any = { crmLostReason: { findMany: async () => [], count: async () => 0 }, crmPipeline: { findMany: async () => [], count: async () => 0 }, qcOutsideThing: { count: async () => outside } };
    const r = RM.createRestorer({ prisma, Prisma: { dmmf: { datamodel: { models: [{ name: "QcOutsideThing", fields: [{ name: "tenantId", kind: "scalar", type: "String" }, { name: "createdAt", kind: "scalar", type: "DateTime" }] }] } }, DbNull: null }, tenantId: "T", models: ["CrmPipeline", "CrmLostReason"], log: () => {} });
    await r.takeSnapshot(); const clean = await r.verify(); outside = 1; const dirty = await r.verify();
    pcs.push({ id: "PH-verify-leftover-outside", cat: "e", what: "leftover row in a tenant table outside the snapshot list", caught: clean.identical && !dirty.identical && dirty.leftoversSince.QcOutsideThing === 1, detail: `clean=${clean.identical} dirty=${dirty.identical} leftovers=${JSON.stringify(dirty.leftoversSince)}` });
  }
  { // S7: a lock nobody holds must be reported as not held (and ours as held — we got here)
    const never = "/tmp/shark-gate-qc-forms-never-held.lock";
    pcs.push({ id: "PH-lock-guard", cat: "e", what: "lock guard on a lock no ancestor holds", caught: !lockHeldByAncestor(never) && lockHeldByAncestor(lockFile), detail: `never=${lockHeldByAncestor(never)} ours(${lockFile})=${lockHeldByAncestor(lockFile)}` });
  }
  for (const p of pcs) { positiveControls.push(p); console.log(`  ${p.caught ? "🎯" : "⚠️ "} ${p.id} — ${p.caught ? "caught" : "NOT CAUGHT"} · ${p.detail}`); }
}

// ── positive controls (in-process): each deliberately-broken input must be CAUGHT by the same checker the run uses ──
async function positiveControlsInproc(ctx: RunCtx): Promise<void> {
  const spec = FORMS.find((f) => f.testid === "company-new-form");
  if (!spec?.action) return;
  // PC-f: a VALID payload through the refusal checker → the checker must say "not refused"
  const t1 = newTag();
  const r1 = await act(spec, ctx, spec.valid(ctx, t1));
  positiveControls.push({ id: "PC-f-action", cat: "f", what: "valid company payload fed to the required-field refusal check", caught: !cleanRefusal(r1), detail: `cleanRefusal=${cleanRefusal(r1)} (ok=${r1.ok})` });
  // PC-d: two SEQUENTIAL creates with one tag (no dedupe) → the exactly-one counter must see 2
  const r2 = await act(spec, ctx, spec.valid(ctx, t1));
  const n = await spec.probe(ctx, t1);
  positiveControls.push({ id: "PC-d-count", cat: "d", what: "same company submitted twice on purpose", caught: n !== 1, detail: `probe=${n} (ok=${r2.ok})` });
  // PC-e: rows left behind are visible to the orphan check
  positiveControls.push({ id: "PC-e-orphan", cat: "e", what: "orphan check on a tag that DID write rows", caught: n > 0, detail: `probe=${n}` });
  // PC-a: the success check on a tag that was never submitted must fail
  const never = await spec.probe(ctx, `${TAG0}-never`);
  positiveControls.push({ id: "PC-a-norow", cat: "a", what: "success check for a never-submitted tag", caught: never !== 1, detail: `probe=${never}` });
  // PC-c: stored-exact comparator vs an html-escaped expectation · CSV checker vs an un-neutralised line
  const t3 = newTag(); const val = PAYLOADS.find((p) => p.id === "script")!.make(t3);
  await act(spec, ctx, { name: val });
  const stored = await spec.readStored!(ctx, t3, "name");
  positiveControls.push({ id: "PC-c-stored", cat: "c", what: "stored value compared against an html-escaped expectation", caught: stored !== escHtml(val), detail: `stored=${cut(stored, 60)}` });
  const formula = PAYLOADS.find((p) => p.id === "formula")!.make(t3);
  const rawLine = csvLinesWith(`name\n${formula}\n`, t3);
  const { csvRow } = (await import("@/lib/core/csv" as string)) as { csvRow: (c: string[]) => string };
  const safeLine = csvLinesWith(`name\n${csvRow([formula])}\n`, t3);
  positiveControls.push({ id: "PC-c-csv", cat: "c", what: "raw (un-neutralised) CSV line with =cmd", caught: !csvSafe(rawLine) && csvSafe(safeLine), detail: `raw safe=${csvSafe(rawLine)} · csvRow safe=${csvSafe(safeLine)}` });
  // PC-f-rest: a VALID REST body through the REST refusal check
  const t4 = newTag();
  const rr = await callRest("POST", "/companies", { name: t4 }, `${t4}-idem`);
  positiveControls.push({ id: "PC-f-rest", cat: "f", what: "valid REST body fed to the REST refusal check", caught: !(rr.status >= 400 && rr.status < 500), detail: `HTTP ${rr.status}` });
  // PC-f-throw: a throwing action is classified unclean (production redacts thrown messages)
  const thrown: AR = { ok: false, msg: "ข้อความไทย", code: "THROWN", thrown: true, v: null };
  positiveControls.push({ id: "PC-f-thrown", cat: "f", what: "action that throws a Thai error", caught: !cleanRefusal(thrown), detail: refusalKind(thrown) });
  // PC-state (review S4): a row written WITHOUT the attempt's tag (the required field that carries the tag was emptied)
  //   is invisible to the tag probe — the whole-table state must still catch it
  const t5 = newTag(); const b5 = await snapW(spec, ctx, t5);
  await act(spec, ctx, { name: `${TAG0}-untagged` });
  const w5 = await diffW(spec, ctx, t5, b5);
  positiveControls.push({ id: "PC-state-untagged-row", cat: "f", what: "row written without the attempt tag", caught: !w5.clean && w5.d === 0, detail: w5.txt });
  await R!.restoreSnapshot("positive controls");
  for (const p of positiveControls) console.log(`  ${p.caught ? "🎯" : "⚠️ "} ${p.id} (${p.cat}) ${p.what} — ${p.caught ? "caught" : "NOT CAUGHT"} · ${p.detail}`);
}

// ═══════════════════════════════════════════════════════════════════
// BROWSER pass (a–e + render side of c) — needs a running QC server; never started here
// ═══════════════════════════════════════════════════════════════════
const NAME_SHIM = "globalThis.__name = globalThis.__name || function (f) { return f; };";
const selFor = (spec: string): string => {
  // "testid@data-id" → one row of a repeated control · "prefix*" → prefix match
  const at = spec.indexOf("@");
  if (at > 0) return `[data-testid="${spec.slice(0, at)}"][data-id="${spec.slice(at + 1)}"]`;
  if (spec.endsWith("*")) return `[data-testid^="${spec.slice(0, -1)}"]`;
  return `[data-testid="${spec}"]`;
};
async function findVis(page: Any, spec: string, waitMs = 0): Promise<Any | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    await page.evaluate(NAME_SHIM).catch(() => {});
    const h = await page.evaluateHandle((sel: string) => {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const r = (el as HTMLElement).getBoundingClientRect(); const cs = getComputedStyle(el as HTMLElement);
        if (r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden") return el;
      }
      return null;
    }, selFor(spec)).catch(() => null);
    const el = h?.asElement?.() ?? null;
    if (el) return el;
    if (Date.now() >= deadline) return null;
    await sleep(200);
  }
}
async function setField(page: Any, f: FieldSpec, value: string | boolean | string[] | undefined): Promise<string> {
  if (value === undefined) return "";
  if (f.kind === "checkbox" && Array.isArray(value)) {
    // a group of checkboxes sharing a testid prefix: tick exactly the listed values (empty list = untick all)
    const prefix = f.testid.slice(0, f.testid.lastIndexOf("-") + 1);
    await page.evaluate((pre: string, want: string[]) => {
      for (const el of Array.from(document.querySelectorAll(`[data-testid^="${pre}"]`)) as HTMLInputElement[]) {
        const v = (el.getAttribute("data-testid") ?? "").slice(pre.length);
        if (el.type === "checkbox" && el.checked !== want.includes(v)) el.click();
      }
    }, prefix, value);
    return "";
  }
  const el = await findVis(page, f.testid, 4000);
  if (!el) return `ไม่พบช่อง ${f.testid}`;
  if (f.kind === "select") {
    const opts: { value: string; disabled: boolean }[] = await el.evaluate((s: HTMLSelectElement) => Array.from(s.options).map((o) => ({ value: o.value, disabled: o.disabled })));
    const v = String(value);
    if (v === "" && !opts.some((o) => o.value === "")) return "no-empty-option";
    const pick = v === "@first" ? opts.find((o) => o.value !== "" && !o.disabled)?.value : v;
    if (pick === undefined || !opts.some((o) => o.value === pick)) return `ตัวเลือก ${v} ไม่มีใน ${f.testid}`;
    await el.select(pick);
    return "";
  }
  if (f.kind === "checkbox") {
    const checked: boolean = await el.evaluate((e: HTMLInputElement) => !!e.checked);
    if (checked !== (value === true)) await el.click();
    return "";
  }
  if (f.kind === "date") {
    await el.evaluate((e: HTMLInputElement, v: string) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
    }, String(value));
    return "";
  }
  // text / textarea: select-all + delete, then insertText (respects maxLength like a paste would)
  await el.click({ clickCount: 3 }).catch(async () => { await el.evaluate((e: HTMLElement) => e.focus()); });
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (String(value)) await page.keyboard.sendCharacter(String(value));
  if (f.key === "target" && String(value)) {
    // ActivityLog target picker: type → pick the first suggestion (LogActivityForm.tsx:192/206)
    const opt = await findVis(page, "activity-log-target-option", 5000);
    if (!opt) return "ไม่มีตัวเลือกผู้ติดต่อให้กด";
    await opt.click();
  }
  return "";
}

type PageKit = { page: Any; dialogs: string[]; http5xx: string[]; consoleErr: string[]; blocked: string[]; close: () => Promise<void> };
async function newKit(browser: Any, ctx: RunCtx, guard: boolean, device = "desktop"): Promise<PageKit> {
  const page = await browser.newPage();
  if (device === "mobile") await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const host = new URL(BASE).hostname;
  if (BASE.startsWith("https:")) await page.setCookie({ name: "__Host-shark_session", value: ctx.browserToken, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: TENANT, url: BASE, path: "/", secure: true });
  else await page.setCookie({ name: "shark_session", value: ctx.browserToken, domain: host, path: "/" }, { name: "shark_tenant", value: TENANT, domain: host, path: "/" });
  await page.evaluateOnNewDocument(NAME_SHIM);
  const kit: PageKit = { page, dialogs: [], http5xx: [], consoleErr: [], blocked: [], close: async () => { await page.close().catch(() => {}); } };
  page.on("dialog", (d: Any) => { kit.dialogs.push(`${d.type()}: ${cut(d.message(), 80)}`); d.dismiss().catch(() => {}); });
  page.on("response", (r: Any) => { try { if (r.status() >= 500) kit.http5xx.push(`${r.status()} ${cut(r.url(), 100)}`); } catch { /* */ } });
  page.on("pageerror", (e: Error) => kit.consoleErr.push(cut(e.message, 160)));
  if (guard) {
    // second net for guarded forms: no server action POST may leave this page
    await page.setRequestInterception(true);
    // (C4.3 phase 2: these used to be pushed into kit.dialogs ⇒ every guarded b check read "dialog" — runner bug)
    page.on("request", (rq: Any) => { if (rq.method() === "POST" && rq.headers()["next-action"]) { kit.blocked.push(`${Date.now()}`); rq.abort().catch(() => {}); } else rq.continue().catch(() => {}); });
  }
  return kit;
}
async function openForm(kit: PageKit, spec: FormSpec, ctx: RunCtx): Promise<string> {
  const path = spec.path(ctx);
  if (!path) return "ไม่มี URL";
  const resp = await kit.page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 45_000 }).catch((e: Error) => e);
  if (resp instanceof Error) return `เปิดหน้าไม่ได้: ${cut(resp.message, 100)}`;
  if (resp && resp.status() >= 400) return `หน้า ${path} ตอบ ${resp.status()}`;
  const openers = spec.openerFn ? spec.openerFn(ctx) : (spec.opener ?? []);
  for (const o of openers) {
    const el = await findVis(kit.page, o, 5000);
    if (!el) return `ไม่พบตัวเปิด ${o}`;
    await el.click();
    await kit.page.waitForNetworkIdle({ idleTime: 300, timeout: 4000 }).catch(() => {});
    await sleep(250);
  }
  if (!(await findVis(kit.page, spec.submit, 5000))) return `ไม่พบปุ่มส่ง ${spec.submit}`;
  return "";
}
async function fillAll(kit: PageKit, spec: FormSpec, v: Vals): Promise<string> {
  for (const f of spec.fields) {
    const err = await setField(kit.page, f, v[f.key]);
    if (err) return err;
  }
  return "";
}
async function waitProbe(spec: FormSpec, ctx: RunCtx, tag: string, want: number, ms: number): Promise<number> {
  const deadline = Date.now() + ms;
  let n = await spec.probe(ctx, tag);
  while (Date.now() < deadline && (want < 0 ? n < 1 : n < want)) { await sleep(400); n = await spec.probe(ctx, tag); }
  // then wait until the count stops moving (multi-row actions insert one row at a time)
  for (let prev = -2, i = 0; i < 30 && n !== prev; i++) { prev = n; await sleep(800); n = await spec.probe(ctx, tag); }
  return n;
}

// in-page analysers (also driven by --selftest-browser on synthetic pages)
type ThaiNode = { s: string; top: number; bottom: number; left: number; right: number; tid: string | null };
const collectThai = (): ThaiNode[] => {
  const out: ThaiNode[] = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode; const s = (n.textContent ?? "").trim();
    if (!s || !/[฀-๿]/.test(s)) continue;
    const el = n.parentElement; if (!el || el.closest("option,select,script,style,noscript,template")) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    out.push({ s: s.slice(0, 200), top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right, tid: el.closest("[data-testid]")?.getAttribute("data-testid") ?? null });
  }
  return out;
};
type BVerdict = { ok: boolean; kind: string; detail: string };
async function analyseRequired(kit: PageKit, anchorSel: string, before: ThaiNode[], submitSel: string): Promise<BVerdict> {
  const page = kit.page;
  await page.evaluate(NAME_SHIM).catch(() => {});
  const after: ThaiNode[] = await page.evaluate(collectThai).catch(() => []);
  const key = (n: ThaiNode) => `${n.tid}|${n.s}`;
  const was = new Set(before.map(key));
  const fresh = after.filter((n) => !was.has(key(n)));
  const geo = await page.evaluate((sel: string, sub: string) => {
    const el = document.querySelector(sel) as HTMLInputElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const ids = `${el.getAttribute("aria-describedby") ?? ""} ${el.getAttribute("aria-errormessage") ?? ""}`.split(/\s+/).filter(Boolean);
    // review S3: a describedby/errormessage target only counts when it is VISIBLE (hidden = not shown to the user)
    const described = ids.map((id) => document.getElementById(id)).filter((d): d is HTMLElement => !!d).filter((d) => {
      const rr = d.getBoundingClientRect(); const cs = getComputedStyle(d);
      return rr.width > 0 && rr.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
    }).map((d) => { const rr = d.getBoundingClientRect(); return { text: d.textContent?.trim() ?? "", top: rr.top + scrollY, bottom: rr.bottom + scrollY, left: rr.left, right: rr.right }; })
      .filter((d) => /[\u0E00-\u0E7F]/.test(d.text));
    const form = el.closest("form");
    const btn = document.querySelector(sub) as HTMLButtonElement | null;
    return {
      top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right, focused: document.activeElement === el,
      nativeInvalid: !!(el.validity && !el.validity.valid && form && !form.noValidate), described, submitDisabled: !!btn?.disabled,
    };
  }, anchorSel, submitSel).catch((e: Error) => ({ evalError: cut(e.message, 160) }));
  if (!geo || "evalError" in geo) return { ok: false, kind: "field-missing", detail: `ไม่พบช่อง ${anchorSel} หลังกดส่ง${geo ? ` (evaluate: ${(geo as Any).evalError})` : ""}` };
  const under = fresh.filter((n) => n.top >= geo.bottom - 4 && n.top <= geo.bottom + 72 && n.left < geo.right && n.right > geo.left);
  const where = fresh.map((n) => `${n.tid ?? "-"}@${Math.round(n.top - geo.bottom)}px:"${cut(n.s, 40)}"`).slice(0, 3).join(" | ");
  if (kit.dialogs.length) return { ok: false, kind: "dialog", detail: `window dialog: ${kit.dialogs.join(" · ")}` };
  // review S3: …and its text must be NEW (appeared after the submit) — a static hint wired to aria-describedby is not an error
  // round 2 note: the NEW text node must sit INSIDE the describedby element (text AND box containment), not merely match its text
  const describedFresh = geo.described.filter((d: Any) => fresh.some((n) => d.text.includes(n.s) && n.top >= d.top - 1 && n.bottom <= d.bottom + 1 && n.left >= d.left - 1 && n.right <= d.right + 1)).map((d: Any) => d.text as string);
  const inline = under.length > 0 || describedFresh.length > 0;
  if (!inline) {
    if (geo.nativeInvalid) return { ok: false, kind: "native-bubble", detail: "HTML required → browser bubble (not Thai DOM text, outside the page)" };
    if (geo.submitDisabled && !fresh.length) return { ok: false, kind: "silent-disable", detail: "submit disabled, no message tells the user why" };
    if (fresh.length) return { ok: false, kind: "not-under-field", detail: `new Thai text elsewhere: ${where}` };
    return { ok: false, kind: "no-message", detail: "no new Thai text anywhere after submit" };
  }
  if (!geo.focused) return { ok: false, kind: "no-focus", detail: `inline error OK (${cut((under[0]?.s ?? describedFresh[0]) ?? "", 60)}) but focus is not on the field` };
  return { ok: true, kind: "", detail: cut(under[0]?.s ?? describedFresh[0] ?? "", 80) };
}
/** review S6: a render check only analyses a page that really loaded — 2xx/3xx response AND the final pathname equals the
 *  requested one (a redirect to login / an error page / a swallowed goto failure used to be analysed as "the page") */
async function gotoRender(page: Any, url: string): Promise<string> {
  const want = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  const resp = await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 }).catch((e: Error) => e);
  if (resp instanceof Error) return `goto ล้ม: ${cut(resp.message, 100)}`;
  if (!resp) return "goto ไม่มี response";
  if (resp.status() >= 400) return `HTTP ${resp.status()}`;
  const got = (() => { try { return new URL(page.url()).pathname; } catch { return page.url(); } })();
  if (got !== want) return `URL ${got} ≠ ${want}`;
  return "";
}
async function analyseRender(page: Any, sigs: string[]): Promise<{ executed: boolean; injected: number; seen: boolean[]; where: string[] }> {
  await page.evaluate(NAME_SHIM).catch(() => {});
  return page.evaluate((s: string[]) => {
    const w = window as unknown as Record<string, unknown>;
    const injected = document.querySelectorAll('img[src="x"]').length
      + Array.from(document.querySelectorAll("script")).filter((x) => (x.textContent ?? "").trim() === "window.__qcXss=1").length
      + Array.from(document.querySelectorAll("[onerror]")).filter((x) => (x.getAttribute("onerror") ?? "").includes("__qcXss")).length;
    // review S6: search/filter boxes echo the URL query (?q=<tag>) — they never count as "rendered"
    let query = ""; try { query = decodeURIComponent(location.search.replace(/\+/g, " ")); } catch { query = location.search; }
    const fields = (Array.from(document.querySelectorAll("input,textarea")) as HTMLInputElement[]).filter((e) => {
      const tid = e.getAttribute("data-testid") ?? ""; const nm = e.getAttribute("name") ?? "";
      if (e.type === "search" || e.type === "hidden" || /(^|-)(q|search|filter)(-|$)/.test(tid) || /^(q|search)$/.test(nm)) return false;
      return !(e.value && query.includes(e.value));
    }).map((e) => e.value).join("\n");
    const body = document.body.innerText;
    const opts = Array.from(document.querySelectorAll("option")).map((o) => o.textContent).join("\n");
    const where = s.map((x) => (body.includes(x) ? "text" : fields.includes(x) ? "input" : opts.includes(x) ? "option" : "-"));
    return { executed: w.__qcXss === 1, injected, seen: where.map((x) => x !== "-"), where };
  }, sigs);
}
async function doubleClick(page: Any, sel: string): Promise<boolean> {
  const el = await findVis(page, sel, 3000);
  // raw mouse clicks do not scroll: a submit below the fold was never hit (crm-api-hook-form, QC1 phase 2 — 0 POSTs)
  if (el) { await el.evaluate((e: HTMLElement) => e.scrollIntoView({ block: "center" })).catch(() => {}); await sleep(150); }
  const box = el ? await el.boundingBox() : null;
  if (!box) return false;
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await sleep(80);
  await page.mouse.click(x, y);
  return true;
}

async function browserForm(browser: Any, spec: FormSpec, ctx: RunCtx, device = "desktop"): Promise<void> {
  const F = spec.testid;
  const DEV = device === "mobile" ? " @390" : "";
  const recB = (form: string, cat: Cat, check: string, mode: Res["mode"], ok: boolean, kind = "", detail = "") => rec(form, cat, `${check}${DEV}`, mode, ok, kind, detail);
  const skipB = (form: string, cat: Cat | "*", check: string, mode: string, reason: string) => skip(form, cat, `${check}${DEV}`, mode, reason);
  const wantB = (c: Cat) => want(c) && (device === "desktop" || c === "a" || c === "b" || c === "e");
  CURRENT_FORM = F;
  const need = spec.needs?.(ctx) ?? null;
  const fx = need ? null : await ensureFixture(spec.fixture, ctx);
  if (need || fx || !spec.path(ctx)) { for (const c of ["a", "b", "c", "d", "e"] as Cat[]) skipB(F, c, "browser", "browser", need ?? fx ?? "ไม่มี URL"); return; }
  const guard = !!spec.guard;
  const rows = expectOf(spec, ctx, "browser");
  await assertProbes(spec, ctx);
  const run = async (label: string, fn: (kit: PageKit) => Promise<void>) => {
    const kit = await newKit(browser, ctx, guard, device);
    try { await fn(kit); } catch (e) { recB(F, label[0] as Cat, `${label} (crash)`, "browser", false, "runner-crash", e instanceof Error ? e.message : String(e)); }
    // the server action must have ANSWERED before the page closes and the snapshot is restored — otherwise a slow action
    // (bulkEnroll: one insert per contact) keeps writing into the next check (QC1 phase 2: b/e "rows Δ14/Δ13" stragglers)
    finally { await kit.page.waitForNetworkIdle({ idleTime: 1000, timeout: 30_000 }).catch(() => {}); await kit.close(); await between(spec, `browser.${label}`); }
  };

  // a — valid submit → success path
  if (wantB("a")) {
    if (guard) skipB(F, "a", "valid", "browser", `skippedSafety: ${spec.guard}`);
    else await run("a", async (kit) => {
      const t = newTag(); const e0 = await openForm(kit, spec, ctx); if (e0) return recB(F, "a", "valid", "browser", false, "open", e0);
      const before = await spec.probe(ctx, t);
      const e1 = await fillAll(kit, spec, spec.valid(ctx, t, "browser")); if (e1) return recB(F, "a", "valid", "browser", false, "fill", e1);
      await (await findVis(kit.page, spec.submit, 3000))?.click();
      const n = (await waitProbe(spec, ctx, t, rows < 0 ? -1 : before + rows, 10_000)) - before;
      const dup = spec.dupProbe ? await spec.dupProbe(ctx) : 0;
      const ok = (rows < 0 ? n >= 1 && dup === 0 : n === rows) && !kit.dialogs.length && !kit.http5xx.length && !kit.consoleErr.length;
      recB(F, "a", "valid", "browser", ok, kit.dialogs.length ? "dialog" : kit.http5xx.length ? "5xx" : kit.consoleErr.length ? "page-error" : "rows", `rows Δ${n} (want ${rows < 0 ? "≥1" : rows}) ${kit.http5xx.join(" ")} ${kit.dialogs.join(" ")} ${kit.consoleErr.slice(0, 2).join(" | ")}`);
    });
  }
  // b — each required case empty → inline Thai error under the field + focus, no row, no dialog
  if (wantB("b")) {
    for (const rc of casesOf(spec)) {
      const anchor = spec.fields.find((f) => f.key === rc.anchor);
      if (!anchor) continue;
      if (rc.empty.some((k) => spec.fields.find((f) => f.key === k)?.uiEmpty === false)) { skipB(F, "b", `required:${rc.id}`, "browser", "the UI cannot make this field empty (select without an empty option) — server side covered by f"); continue; }
      await run("b", async (kit) => {
        const t = newTag(); const e0 = await openForm(kit, spec, ctx); if (e0) return recB(F, "b", `required:${rc.id}`, "browser", false, "open", e0);
        const v = { ...spec.valid(ctx, t, "browser") };
        for (const k of rc.empty) { const f = spec.fields.find((x) => x.key === k)!; v[k] = emptyOf(f); }
        const e1 = await fillAll(kit, spec, v);
        if (e1 === "no-empty-option") return skipB(F, "b", `required:${rc.id}`, "browser", "select has no empty option");
        if (e1) return recB(F, "b", `required:${rc.id}`, "browser", false, "fill", e1);
        const before = await snapW(spec, ctx, t);
        await kit.page.evaluate(NAME_SHIM).catch(() => {});
        const thaiBefore: ThaiNode[] = await kit.page.evaluate(collectThai).catch(() => []);
        const btn = await findVis(kit.page, spec.submit, 3000);
        const blockedBefore = kit.blocked.length;
        if (btn) await btn.click().catch(() => {});
        await sleep(1200); await kit.page.waitForNetworkIdle({ idleTime: 300, timeout: 4000 }).catch(() => {});
        const verdict = await analyseRequired(kit, selFor(anchor.testid), thaiBefore, selFor(spec.submit));
        await kit.page.waitForNetworkIdle({ idleTime: 800, timeout: 15_000 }).catch(() => {});
        const w = await diffW(spec, ctx, t, before);
        const leaked = kit.blocked.length - blockedBefore;
        recB(F, "b", `required:${rc.id}`, "browser", verdict.ok && w.clean, !w.clean ? "row-written" : verdict.kind, `${verdict.detail} · ${w.txt} · source: ${rc.who}/${rc.clientHow ?? "-"}${guard ? ` · server-action POSTs after submit (aborted): ${leaked}` : ""}`);
      });
    }
  }
  // c — hostile values typed into the tag field, stored as typed (maxLength aside), rendered inert + visible
  if (wantB("c")) {
    const f = spec.fields.find((x) => x.key === spec.tagField && x.text);
    if (!f || spec.csvPayloadCell) skipB(F, "c", "payloads", "browser", spec.csvPayloadCell ? "CSV text box — payload-in-cell covered in-process" : "no free-text tag field");
    else if (guard) skipB(F, "c", "payloads", "browser", `skippedSafety: ${spec.guard}`);
    else for (const p of PAYLOADS) {
      await run("c", async (kit) => {
        const t = newTag(); const value = p.make(t, f.max);
        const e0 = await openForm(kit, spec, ctx); if (e0) return recB(F, "c", `${p.id}`, "browser", false, "open", e0);
        const v: Vals = { ...spec.valid(ctx, t, "browser"), [f.key]: value };
        for (const m of spec.mirror ?? []) v[m] = value;
        const e1 = await fillAll(kit, spec, v); if (e1) return recB(F, "c", `${p.id}`, "browser", false, "fill", e1);
        const beforeW = await snapW(spec, ctx, t); const before = beforeW.p;
        const thaiBefore: ThaiNode[] = await kit.page.evaluate(collectThai).catch(() => []);
        await (await findVis(kit.page, spec.submit, 3000))?.click();
        const n = (await waitProbe(spec, ctx, t, before + Math.max(1, rows), 8000)) - before;
        if (n > 0) {
          const typed = f.clientMax ? value.slice(0, f.clientMax) : value;
          const stored = spec.readStored ? await spec.readStored(ctx, t, f.key) : null;
          recB(F, "c", `${p.id} stored`, "browser", stored === typed, stored === escHtml(typed) ? "html-escaped-at-write" : stored !== null && typed.startsWith(stored) ? "silent-truncate" : stored === typed.replace(/\u200d/g, "") ? "zwj-stripped" : "altered", `typed ${typed.length} · stored ${stored?.length ?? "null"}`);
          for (const loc of spec.renders ?? []) {
            const path = await loc.path(ctx, t);
            if (!path) { skipB(F, "c", `${p.id} render ${loc.label}`, "browser", "หา URL ไม่ได้"); continue; }
            const gerr = await gotoRender(kit.page, `${BASE}${path}`);
            if (gerr) { recB(F, "c", `${p.id} render ${loc.label}`, "browser", false, "render-page-failed", gerr); continue; }
            await sleep(600);
            const r = await analyseRender(kit.page, [p.sig(typed, t)]);
            recB(F, "c", `${p.id} render ${loc.label}`, "browser", !r.executed && r.injected === 0 && r.seen[0] === true, r.executed ? "executed" : r.injected ? "injected-element" : "not-visible-as-text", `executed=${r.executed} injected=${r.injected} visible=${r.seen[0]} via ${r.where[0]}`);
          }
        } else {
          await sleep(500);
          const after: ThaiNode[] = await kit.page.evaluate(collectThai).catch(() => []);
          const was = new Set(thaiBefore.map((x) => `${x.tid}|${x.s}`));
          const msg = after.find((x) => !was.has(`${x.tid}|${x.s}`));
          await kit.page.waitForNetworkIdle({ idleTime: 800, timeout: 15_000 }).catch(() => {});
          const w = await diffW(spec, ctx, t, beforeW);
          recB(F, "c", `${p.id} refused`, "browser", !p.mustAccept && !!msg && !kit.dialogs.length && w.clean, p.mustAccept ? "legit-text-refused" : kit.dialogs.length ? "dialog" : !w.clean ? "row-written-untagged" : "silent-refusal", `${msg ? `"${cut(msg.s, 80)}"` : "no row and no message"} · ${w.txt}`);
        }
      });
    }
  }
  // d — two real clicks 80 ms apart
  if (wantB("d")) {
    if (guard) skipB(F, "d", "double-click", "browser", `skippedSafety: ${spec.guard}`);
    else await run("d", async (kit) => {
      const t = newTag(); const e0 = await openForm(kit, spec, ctx); if (e0) return recB(F, "d", "double-click", "browser", false, "open", e0);
      const before = await spec.probe(ctx, t);
      const e1 = await fillAll(kit, spec, spec.valid(ctx, t, "browser")); if (e1) return recB(F, "d", "double-click", "browser", false, "fill", e1);
      const posts: string[] = [];
      kit.page.on("response", (r: Any) => { try { if (r.request().method() === "POST") posts.push(String(r.status())); } catch { /* */ } });
      const thaiBefore: ThaiNode[] = await kit.page.evaluate(collectThai).catch(() => []);
      if (!(await doubleClick(kit.page, spec.submit))) return recB(F, "d", "double-click", "browser", false, "open", "ปุ่มส่งไม่มีกรอบ");
      await waitProbe(spec, ctx, t, rows < 0 ? -1 : before + rows, 8000);
      await sleep(2500);
      const n = (await spec.probe(ctx, t)) - before;
      const dup = spec.dupProbe ? await spec.dupProbe(ctx) : 0;
      const was = new Set(thaiBefore.map((x) => `${x.tid}|${x.s}`));
      const msg = ((await kit.page.evaluate(collectThai).catch(() => [])) as ThaiNode[]).find((x) => !was.has(`${x.tid}|${x.s}`));
      const side = SIDE[F] ? await SIDE[F]!(t) : null; // review NOTE: Party / CrmDealContact must not double either
      const ok = (rows < 0 ? n >= 1 && dup === 0 : n === rows) && (side === null || side === rows);
      recB(F, "d", "double-click", "browser", ok, n === 0 ? "double-click-lost-submit" : side !== null && side !== rows && n === rows ? "duplicate-side-rows" : "duplicate-rows", `rows Δ${n} (want ${rows < 0 ? "≥1, each once" : rows}) dupes ${dup}${side === null ? "" : ` side ${side}`} · POSTs [${posts.join(",")}] · msg ${msg ? `${msg.tid}:"${cut(msg.s, 60)}"` : "-"}`);
    });
  }
  // e — fill everything, then close / cancel / navigate away → no rows
  if (wantB("e")) {
    if (guard) skipB(F, "e", "abandon", "browser", `skippedSafety: ${spec.guard}`);
    else await run("e", async (kit) => {
      const t = newTag(); const e0 = await openForm(kit, spec, ctx); if (e0) return recB(F, "e", "abandon", "browser", false, "open", e0);
      const before = await snapW(spec, ctx, t);
      const e1 = await fillAll(kit, spec, spec.valid(ctx, t, "browser")); if (e1) return recB(F, "e", "abandon", "browser", false, "fill", e1);
      let how = "navigate-away";
      const closer = spec.close ? await findVis(kit.page, spec.close, 2000) : null;
      if (closer) { await closer.click(); how = `click ${spec.close}`; }
      else await kit.page.goto(`${BASE}${CRM_BASE}`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => null);
      await sleep(2000); await kit.page.waitForNetworkIdle({ idleTime: 800, timeout: 15_000 }).catch(() => {});
      const w = await diffW(spec, ctx, t, before);
      recB(F, "e", "abandon", "browser", w.clean, "orphan-rows", `${how} · ${w.txt}`);
    });
  }
}

// ── browser positive controls on synthetic pages (no server, no DB) ──
async function positiveControlsBrowser(browser: Any, withServer = false): Promise<void> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const kit: PageKit = { page, dialogs: [], http5xx: [], consoleErr: [], blocked: [], close: async () => {} };
  page.on("dialog", (d: Any) => { kit.dialogs.push(`${d.type()}: ${d.message()}`); d.dismiss().catch(() => {}); });
  const form = (body: string, script: string) => `<!doctype html><html><body style="font:16px sans-serif"><form id="f" ${body}>
    <label>ชื่อ<br><input data-testid="n" id="n"></label><div id="slot"></div><div style="height:420px"></div><p id="box" data-testid="box"></p>
    <button data-testid="s" type="submit">บันทึก</button></form><script>${script}</script></body></html>`;
  const cases: { id: string; html: string; expect: string }[] = [
    { id: "PB-alert", expect: "dialog", html: form("", `f.onsubmit=e=>{e.preventDefault();if(!n.value)alert('ใส่ชื่อก่อน')}`) },
    { id: "PB-form-level", expect: "not-under-field", html: form("", `f.onsubmit=e=>{e.preventDefault();if(!n.value)box.textContent='ใส่ชื่อก่อนบันทึก'}`) },
    { id: "PB-native", expect: "native-bubble", html: form("", `n.required=true;f.onsubmit=e=>e.preventDefault()`) },
    { id: "PB-no-focus", expect: "no-focus", html: form("", `f.onsubmit=e=>{e.preventDefault();if(!n.value)slot.textContent='ใส่ชื่อก่อนบันทึก'}`) },
    { id: "PB-disabled", expect: "silent-disable", html: form("", `document.querySelector('[data-testid=s]').disabled=true`) },
    { id: "PB-good", expect: "", html: form("", `f.onsubmit=e=>{e.preventDefault();if(!n.value){slot.textContent='ใส่ชื่อก่อนบันทึก';n.setAttribute('aria-invalid','true');n.focus()}}`) },
    // review S3: a STATIC hint wired to aria-describedby is not an error message (error goes to a far box)
    { id: "PB-describedby-static", expect: "not-under-field", html: form("", `const h=slot;h.id='h';h.textContent='ชื่อที่ลูกค้าเห็นบนใบเสนอราคา';n.setAttribute('aria-describedby','h');f.onsubmit=e=>{e.preventDefault();if(!n.value){box.textContent='ใส่ชื่อก่อนบันทึก';n.focus()}}`) },
    // round 2: the SAME wording as a static describedby hint, but the new text lands in a far box — must not count as inline
    { id: "PB-describedby-elsewhere", expect: "not-under-field", html: form("", `const h3=slot;h3.id='h3';h3.textContent='ใส่ชื่อก่อนบันทึก';n.setAttribute('aria-describedby','h3');f.onsubmit=e=>{e.preventDefault();if(!n.value){box.textContent='ใส่ชื่อก่อนบันทึก';n.focus()}}`) },
    // negative control: a describedby target that RECEIVES the new text (visible, under the field) + focus must PASS
    { id: "PB-describedby-good", expect: "", html: form("", `const h4=slot;h4.id='h4';n.setAttribute('aria-describedby','h4');f.onsubmit=e=>{e.preventDefault();if(!n.value){h4.textContent='ใส่ชื่อก่อนบันทึก';n.focus()}}`) },
    // review S3: an aria-describedby target that gets the text but stays HIDDEN is not shown to the user
    { id: "PB-describedby-hidden", expect: "no-message", html: form("", `const h2=slot;h2.id='h2';h2.style.display='none';n.setAttribute('aria-describedby','h2');f.onsubmit=e=>{e.preventDefault();if(!n.value){h2.textContent='ใส่ชื่อก่อนบันทึก';n.focus()}}`) },
  ];
  for (const c of cases) {
    kit.dialogs.length = 0;
    await page.setContent(c.html, { waitUntil: "load" });
    await page.evaluate(NAME_SHIM);
    const before: ThaiNode[] = await page.evaluate(collectThai);
    const btn = await page.$('[data-testid="s"]');
    await btn?.click().catch(() => {});
    await sleep(300);
    const v = await analyseRequired(kit, '[data-testid="n"]', before, '[data-testid="s"]');
    const caught = c.expect ? !v.ok && v.kind === c.expect : v.ok;
    positiveControls.push({ id: c.id, cat: "b", what: c.expect ? `synthetic form that fails b as "${c.expect}"` : "synthetic CORRECT form (negative control — must pass)", caught, detail: `verdict ok=${v.ok} kind=${v.kind || "-"} ${cut(v.detail, 80)}` });
  }
  // render: innerHTML (vulnerable) vs textContent (safe)
  const payload = `"><img src=x onerror="window.__qcXss=1"> qc`;
  for (const [id, sink, expectCaught] of [["PR-innerHTML", "innerHTML", true], ["PR-textContent", "textContent", false]] as const) {
    // setContent() rewrites the SAME window (unlike goto) — clear the flag a previous synthetic page may have set
    await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__qcXss; }).catch(() => {});
    await page.setContent(`<!doctype html><html><body><div id="d"></div><script>document.getElementById('d').${sink}=${JSON.stringify(payload)}</script></body></html>`, { waitUntil: "load" });
    await sleep(300);
    const r = await analyseRender(page, [`"><img src=x onerror=`]);
    const bad = r.executed || r.injected > 0 || !r.seen[0];
    positiveControls.push({ id, cat: "c", what: `render via ${sink}`, caught: expectCaught ? bad : !bad, detail: `executed=${r.executed} injected=${r.injected} visible=${r.seen[0]}` });
  }
  // double-click driver really produces two submits on an unguarded button, one on a guarded one
  for (const [id, guardJs, want2, spacer] of [["PD-unguarded", "", 2, 0], ["PD-guarded", "b.disabled=true;", 1, 0], ["PD-below-fold", "", 2, 2400]] as const) {
    await page.setContent(`<!doctype html><html><body><div style="height:${spacer}px"></div><form id="f"><button data-testid="s" id="b">ส่ง</button></form><script>window.n=0;f.onsubmit=e=>{e.preventDefault();window.n++;${guardJs}}</script></body></html>`, { waitUntil: "load" });
    await doubleClick(page, "s");
    await sleep(300);
    const n = await page.evaluate(() => (window as unknown as { n: number }).n);
    positiveControls.push({ id, cat: "d", what: `two clicks 80 ms apart on a ${guardJs ? "guarded" : "unguarded"} submit${spacer ? " below the fold" : ""}`, caught: n === want2, detail: `submits=${n} (want ${want2})` });
  }
  // review S6: a search box echoing the payload is not "rendered" · a failed/404 navigation is never analysed
  await page.setContent('<!doctype html><html><body><input type="search" value="SIG-qc"><input data-testid="list-q" value="SIG-qc"><p>other</p></body></html>', { waitUntil: "load" });
  const rs = await analyseRender(page, ["SIG-qc"]);
  positiveControls.push({ id: "PR-searchbox-echo", cat: "c", what: "payload present only in search/filter boxes", caught: rs.seen[0] === false, detail: `seen=${rs.seen[0]} via ${rs.where[0]}` });
  const nav = await browser.newPage();
  const gf = await gotoRender(nav, "file:///qc-forms-no-such-file-anywhere");
  positiveControls.push({ id: "PR-goto-failed", cat: "c", what: "render navigation that fails", caught: gf !== "", detail: gf || "accepted" });
  if (withServer) {
    const g404 = await gotoRender(nav, `${BASE}${CRM_BASE}/qc-forms-no-such-page-${RUN}`);
    positiveControls.push({ id: "PR-goto-404", cat: "c", what: "render page that 404s / redirects", caught: g404 !== "", detail: g404 || "accepted" });
  }
  await nav.close().catch(() => {});
  await page.close().catch(() => {});
  for (const p of positiveControls.filter((x) => x.id.startsWith("P") && /^(PB|PR|PD)/.test(x.id))) console.log(`  ${p.caught ? "🎯" : "⚠️ "} ${p.id} (${p.cat}) ${p.what} — ${p.caught ? "as designed" : "CHECKER WRONG"} · ${p.detail}`);
}

async function launchBrowser(): Promise<{ browser: Any; udd: string }> {
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string)) as Any;
  // snap chromium has a private /tmp — the profile lives inside the repo and is deleted after the run
  const udd = resolvePath(`.qc-shots/c43/chr-forms-${process.pid}`);
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${udd}`] });
  return { browser, udd };
}

// ═══════════════════════════════════════════════════════════════════
// plan (--dry) + main
// ═══════════════════════════════════════════════════════════════════
function planOf(ctx: RunCtx | null): Any[] {
  const plan: Any[] = [];
  for (const s of FORMS.filter((f) => formSelected(f.testid))) {
    const need = ctx ? s.needs?.(ctx) ?? null : null;
    const cases = casesOf(s);
    const text = s.fields.filter((f) => f.text);
    const inCount = s.action ? (1 + (s.rest ? 1 : 0)) + cases.length * (1 + (s.rest ? 1 : 0)) + (s.serverBad?.length ?? 0)
      + text.reduce((a, f) => a + (f.key === s.tagField ? PAYLOADS.length : OTHER_FIELD_PAYLOADS.size), 0) + (s.naturalKey ? 1 : 0) + (s.rest ? 1 : 0) : 0;
    const tagText = s.fields.find((f) => f.key === s.tagField && f.text);
    const brCount = s.guard ? cases.length : 1 + cases.length + (tagText && !s.csvPayloadCell ? PAYLOADS.length * (1 + (s.renders?.length ?? 0)) : 0) + 1 + 1;
    plan.push({
      form: s.testid, page: s.page, layout: s.layout, action: s.action ? `${s.action.mod}#${s.action.fn}` : null, rest: s.rest?.op ?? null,
      fields: s.fields.map((f) => `${f.key}${f.required ? `*${f.required}${f.clientHow ? `/${f.clientHow}` : ""}` : ""}${f.max ? `≤${f.max}` : ""}`),
      requiredCases: cases.map((c) => c.id), textFields: text.map((f) => f.key), serverBad: (s.serverBad ?? []).map((b) => b.id),
      renders: (s.renders ?? []).map((r) => r.label), csv: !!s.csv, naturalKey: s.naturalKey ?? null, guard: s.guard ?? null,
      inprocChecks: inCount, browserChecksApprox: brCount, needs: need,
    });
  }
  return plan;
}

async function main(): Promise<{ total: number; passed: number; fatal: string }> {
  console.log(`\n═══ QC CRM v2 · C4.3 — every form (${FORMS.length} specs · registry form rows ${FORM_ROWS.length}) ═══`);
  // coverage: every registry form row has a spec and every spec is a registry row (else the plan silently shrinks)
  const specIds = new Set(FORMS.map((f) => f.testid));
  const regIds = new Set(FORM_ROWS.map((r) => r.testid));
  const missingSpec = [...regIds].filter((t) => !specIds.has(t));
  const ghostSpec = [...specIds].filter((t) => !regIds.has(t));
  for (const t of missingSpec) rec(t, "a", "spec-coverage", "inproc", false, "no-spec", "registry form row has no spec in qc-crm-forms.mts");
  for (const t of ghostSpec) rec(t, "a", "spec-coverage", "inproc", false, "ghost-spec", "spec for a testid that is not a registry form row");
  // registry field coverage (informational): which spec field testids are registry rows on the same page
  const fieldCoverage = FORMS.map((s) => ({ form: s.testid, notInRegistry: s.fields.map((f) => f.testid).filter((t) => !REG.some((r) => r.testid === t || (r.testid.includes("*") && new RegExp(`^${r.testid.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(t)))) }))
    .filter((x) => x.notInRegistry.length);

  if (SELFTEST_BROWSER) {
    const { browser, udd } = await launchBrowser();
    try { await positiveControlsBrowser(browser); } finally { await browser.close().catch(() => {}); rmSync(udd, { recursive: true, force: true }); }
    return { total: 0, passed: 0, fatal: "" };
  }

  // DB guard — the answer key must describe THIS database
  const sys = await P.appSystem.findFirst({ where: { id: SYS, tenantId: TENANT, type: "CRM" }, select: { id: true } }).catch(() => null);
  if (!sys) return { total: 0, passed: 0, fatal: `answer key ${EXPECTED_PATH} ไม่ตรงกับฐานข้อมูลนี้ (ไม่พบระบบ CRM ${SYS} ของร้าน ${TENANT}) — ชี้ CRM_EXPECTED_PATH ให้ถูก` };
  if (!DRY) {
    // review S7: every write + the destructive restore run only while THIS process holds the gate lock of ITS database
    const lockFile = expectedLockFile();
    if (!lockHeldByAncestor(lockFile)) return { total: 0, passed: 0, fatal: `ไม่ได้ถือ gate lock ${lockFile} ของฐานนี้ — รันผ่าน \`bash scripts/with-gate-lock.sh …\` (QC3: ผ่าน scripts/qc3.sh) เท่านั้น` };
    if (!INPROC_ONLY && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE)) return { total: 0, passed: 0, fatal: `QC_BASE ${BASE} ไม่ใช่เครื่องนี้ — ตัวรันนี้คุยกับ QC server ในเครื่องเท่านั้น` };
    PROVENANCE = provenanceNow();
    console.log(`[provenance] head ${String(PROVENANCE.head).slice(0, 8)} · src ${String(PROVENANCE.srcTree).slice(0, 8)}${PROVENANCE.srcDirty ? " (DIRTY)" : ""} · runner ${String(PROVENANCE.runnerSha).slice(0, 8)} · db ${PROVENANCE.db} · lock ${lockFile}${PROVENANCE.server ? ` · server ${PROVENANCE.server.buildId ?? PROVENANCE.server.error} (build ${PROVENANCE.server.buildCommit ?? "?"} src ${String(PROVENANCE.server.buildSrcTree ?? "?").slice(0, 8)})` : ""}`);
    await positiveControlsHarness(lockFile);
  }

  if (DRY) {
    const plan = planOf(null);
    const tot = plan.reduce((a, p) => ({ i: a.i + p.inprocChecks, b: a.b + p.browserChecksApprox }), { i: 0, b: 0 });
    for (const p of plan) console.log(`  · ${p.form.padEnd(28)} ${p.layout.padEnd(6)} in-proc ${String(p.inprocChecks).padStart(3)} · browser ≈${String(p.browserChecksApprox).padStart(3)} · required ${p.requiredCases.join(",") || "-"} · text ${p.textFields.join(",") || "-"} · REST ${p.rest ?? "-"}${p.guard ? " · GUARD" : ""}`);
    console.log(`  รวม ${plan.length} ฟอร์ม · in-process ${tot.i} ข้อ · browser ≈${tot.b} ข้อ · ไม่มี spec ${missingSpec.length} · spec ผี ${ghostSpec.length}`);
    writeFileSync(`${SHOTS}/plan-dry.json`, JSON.stringify({ at: new Date().toISOString(), forms: plan.length, inprocChecks: tot.i, browserChecksApprox: tot.b, missingSpec, ghostSpec, fieldCoverage, plan }, null, 2));
    return { total: tot.i + tot.b, passed: 0, fatal: missingSpec.length || ghostSpec.length ? "spec coverage" : "" };
  }

  const RM = (await import("./lib/qc-crm-restore.mts" as string)) as { createRestorer: (o: Any) => Restorer };
  R = RM.createRestorer({ prisma: P, Prisma: PrismaNS, tenantId: TENANT, appendOnlyExtra: ["ApiIdempotency", "OpsEvent", "WebhookDelivery"] }); // phase 2: the QC server may drain our outbox events into deliveries
  await R.takeSnapshot();
  const ctx = await buildCtx();
  for (const n of ctx.notes) console.log(`  · [ctx] ${n}`);
  // QC REST key (crm.admin bundle, bound to this CRM system) — protected across mid-run restores, removed at the end
  try {
    const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
    const AK = (await import("@/lib/api-keys/service" as string)) as Any;
    const bundle = (SC.API_SCOPE_BUNDLES as Any[]).find((b) => b.id === "crm.admin");
    const k = await AK.createApiKey({ tenantId: TENANT }, `${TAG0} rest`, { scopes: [...(bundle?.scopes ?? [])], systemId: SYS, createdById: ctx.ownerId });
    REST_KEY = k.rawKey; MINE.keyIds.push(k.id); R.protect(k.id);
  } catch (e) { console.log(`  ⚠️ ออกคีย์ REST ไม่ได้ — ${e instanceof Error ? e.message : e} (ข้อ REST จะล้ม)`); }

  let browser: Any = null; let udd = "";
  try {
    if (!BROWSER_ONLY) {
      console.log(`\n── positive controls (in-process) ──`);
      await positiveControlsInproc(ctx);
      for (const s of FORMS.filter((f) => formSelected(f.testid))) {
        console.log(`\n── ${s.testid} (in-process) ──`);
        try { await inprocForm(s, ctx); } catch (e) { rec(s.testid, "f", "inproc (crash)", "inproc", false, "runner-crash", e instanceof Error ? `${e.message} ${e.stack?.split("\n")[1] ?? ""}` : String(e)); }
        await R.restoreSnapshot(`${s.testid} in-process`);
      }
    }
    if (!INPROC_ONLY) {
      const ping = await realFetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(8000) }).catch((e: unknown) => e as Error);
      if (ping instanceof Error) throw new Error(`ต่อ QC server ${BASE} ไม่ได้ (${ping.message}) — ผู้คุมงานต้องเปิด server ก่อน (สคริปต์นี้ไม่เปิดเอง)`);
      ({ browser, udd } = await launchBrowser());
      console.log(`\n── positive controls (browser, synthetic pages) ──`);
      await positiveControlsBrowser(browser, true);
      for (const s of FORMS.filter((f) => formSelected(f.testid))) {
        for (const dev of DEVICE === "both" ? ["desktop", "mobile"] : [DEVICE]) {
          console.log(`\n── ${s.testid} (browser ${dev}) ──`);
          try { await browserForm(browser, s, ctx, dev); } catch (e) { rec(s.testid, "a", `browser ${dev} (crash)`, "browser", false, "runner-crash", e instanceof Error ? e.message : String(e)); }
          await R.restoreSnapshot(`${s.testid} browser ${dev}`);
        }
      }
    }
  } finally {
    if (browser) { await browser.close().catch(() => {}); try { rmSync(udd, { recursive: true, force: true }); } catch { /* */ } }
    await dropFixtures();
    R.clearProtect();
    await R.restoreSnapshot("CLEAN (จบรอบ)");
    const swept = await R.sweepTag(TAG0, SYS);
    const purged = await R.purgeAppendOnlySince();
    if (MINE.sessionIds.length) await P.session.deleteMany({ where: { id: { in: MINE.sessionIds } } }).catch(() => {});
    const verify = await R.verify();
    restoreSummary = { log: R.restoreLog, swept, purged, verify: { identical: verify.identical, changed: verify.changed.slice(0, 20), missing: verify.missing.slice(0, 20), extra: verify.extra.slice(0, 20), appendOnlySince: verify.appendOnlySince, leftoversSince: verify.leftoversSince } };
    console.log(`\n🧹 คืนฐาน: กวาดแท็ก ${swept} · purge ${JSON.stringify(purged)} · identical=${verify.identical}${verify.identical ? "" : ` · changed ${verify.changed.length} missing ${verify.missing.length} extra ${verify.extra.length} leftovers ${JSON.stringify(verify.leftoversSince)}`}`);
  }
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  void fieldCoverage;
  return { total, passed, fatal: "" };
}

// ═══════════════════════════════════════════════════════════════════
// MERGE core (review B1 + S8) — pure; exercised by mergeControls() on synthetic parts
// ═══════════════════════════════════════════════════════════════════
type Planned = { cat: Cat; mode: "inproc" | "browser"; device: "-" | "desktop" | "mobile"; check: string | null /* null = the group needs ≥1 entry */ };
const deviceOf = (mode: string, check: string): string => (mode === "inproc" ? "-" : / @390$/.test(check) ? "mobile" : "desktop");
const groupKey = (form: string, cat: string, mode: string, device: string) => `${form}|${cat}|${mode}|${device}`;
/** every check the runner PLANS for a form (check-level where the name is static, group-level where it depends on data) */
function plannedChecks(sp: FormSpec): Planned[] {
  const out: Planned[] = [];
  if (sp.action) {
    out.push({ cat: "f", mode: "inproc", device: "-", check: "valid (action)" });
    for (const rc of casesOf(sp)) out.push({ cat: "f", mode: "inproc", device: "-", check: `required:${rc.id} (action)` });
    for (const b of sp.serverBad ?? []) out.push({ cat: "f", mode: "inproc", device: "-", check: `server-bad:${b.id} (action)` });
    out.push({ cat: "f", mode: "inproc", device: "-", check: "staff:thana" });
    out.push({ cat: "d", mode: "inproc", device: "-", check: null });
    if (sp.fields.some((f) => f.text)) out.push({ cat: "c", mode: "inproc", device: "-", check: null });
  }
  for (const device of ["desktop", "mobile"] as const) {
    const sfx = device === "mobile" ? " @390" : "";
    out.push({ cat: "a", mode: "browser", device, check: `valid${sfx}` });
    for (const rc of casesOf(sp)) out.push({ cat: "b", mode: "browser", device, check: `required:${rc.id}${sfx}` });
    out.push({ cat: "e", mode: "browser", device, check: `abandon${sfx}` });
    if (device === "desktop") { out.push({ cat: "d", mode: "browser", device, check: "double-click" }); out.push({ cat: "c", mode: "browser", device, check: null }); }
  }
  return out;
}
// Review round 2 (SF): the ONLY skips the gate accepts — each with its reason and the EXACT planned checks it stands in for
//   ("(group)" = a group-level planned entry). A skip not in this list ⇒ `unlistedSkips` ⇒ gate red. Adding an entry is a
//   contract change the controller must approve.
type AllowedSkip = { form: string; cat: string; mode: "inproc" | "browser"; check: string; reason: string; covers: string[] };
const TR = "crm-settings-team-room"; const TR_WHY = "seed has no MEETING team rooms — the component renders a text instead of the form";
const SAFE = "real e-mail transport (sendEmailRich → api.resend.com) on the server process — never submitted by the browser";
const NO_TEXT = "the form has no free-text field that is stored and displayed";
const NO_EMPTY = "the select has no empty option — the UI cannot produce the empty value (server side covered by f)";
const ALLOWED_SKIPS: AllowedSkip[] = [
  { form: "object-import-form", cat: "c", mode: "inproc", check: "overlong@csv", reason: "record title = first 200 chars of the title field BY DESIGN (objects.ts createRecordCore)", covers: [] },
  { form: TR, cat: "a", mode: "inproc", check: "inproc", reason: TR_WHY, covers: [] },
  { form: TR, cat: "c", mode: "inproc", check: "inproc", reason: TR_WHY, covers: [] },
  { form: TR, cat: "d", mode: "inproc", check: "inproc", reason: TR_WHY, covers: ["(group)"] },
  { form: TR, cat: "f", mode: "inproc", check: "valid+required+staff", reason: `${TR_WHY} (server-bad refusals still run)`, covers: ["valid (action)", "required:teamId (action)", "staff:thana"] },
  ...["team-member-add-form", "visibility-override-form", "object-archive-form", "crm-api-hook-form", "crm-seq-enroll-form", "crm-seq-bulk-form"].map((form) => ({ form, cat: "c", mode: "browser" as const, check: "payloads", reason: NO_TEXT, covers: ["(group)"] })),
  { form: "object-import-form", cat: "c", mode: "browser", check: "payloads", reason: "CSV text box — payload-in-cell import→store→export covered in-process (S5)", covers: ["(group)"] },
  ...["crm-seq-enroll-form", "crm-seq-bulk-form"].flatMap((form) => ["", " @390"].map((sfx) => ({ form, cat: "b", mode: "browser" as const, check: `required:sequenceId${sfx}`, reason: NO_EMPTY, covers: [`required:sequenceId${sfx}`] }))),
  ...[["a", "valid"], ["d", "double-click"], ["e", "abandon"], ["a", "valid @390"], ["e", "abandon @390"]].map(([cat, check]) => ({ form: "crm-email-composer", cat: cat!, mode: "browser" as const, check: check!, reason: SAFE, covers: [check!] })),
  { form: "crm-email-composer", cat: "c", mode: "browser", check: "payloads", reason: SAFE, covers: ["(group)"] },
  ...([["a", ["valid"]], ["b", ["required:teamId"]], ["c", ["(group)"]], ["d", ["double-click"]], ["e", ["abandon"]]] as [string, string[]][]).map(([cat, covers]) => ({ form: TR, cat, mode: "browser" as const, check: "browser", reason: TR_WHY, covers })),
  ...([["a", ["valid @390"]], ["b", ["required:teamId @390"]], ["c", []], ["d", []], ["e", ["abandon @390"]]] as [string, string[]][]).map(([cat, covers]) => ({ form: TR, cat, mode: "browser" as const, check: "browser @390", reason: TR_WHY, covers })),
];
function mergeParts(docsIn: Any[], plannedFor: (form: string) => Planned[], forms: string[], allowed: AllowedSkip[] = ALLOWED_SKIPS): Any {
  const docs = [...docsIn].sort((x, y) => String(x.at).localeCompare(String(y.at)));
  // B1: a later part supersedes an earlier one ONLY for the (form · category · mode · device) groups it actually produced
  //   entries for — a later `--cat b --device desktop` re-run no longer deletes a/c/d/e or mobile results
  const results = new Map<string, Any>(); const skips = new Map<string, Any>(); const advs = new Map<string, Any>();
  for (const j of docs) {
    const groups = new Set<string>();
    for (const r of j.results ?? []) groups.add(groupKey(r.form, r.cat, r.mode, deviceOf(r.mode, r.check)));
    // review round 2 (SF): a SKIP never replaces an earlier result — only results/advisories supersede (a later part that
    //   merely skips a group must not erase an earlier failure in it)
    for (const a of j.advisories ?? []) groups.add(groupKey(a.form, a.cat, "inproc", "-"));
    const drop = (m: Map<string, Any>) => { for (const [k, v] of [...m]) if (groups.has(v.group) && v.part !== j.part) m.delete(k); };
    drop(results); drop(skips); drop(advs);
    for (const r of j.results ?? []) { const g = groupKey(r.form, r.cat, r.mode, deviceOf(r.mode, r.check)); results.set(`${g}|${r.check}`, { ...r, part: j.part, group: g }); }
    for (const k of j.skipped ?? []) { const g = groupKey(k.form, k.cat, k.mode, deviceOf(k.mode, k.check)); skips.set(`${g}|${k.check}`, { ...k, part: j.part, group: g }); }
    for (const a of j.advisories ?? []) { const g = groupKey(a.form, a.cat, "inproc", "-"); advs.set(`${g}|${a.check}`, { ...a, part: j.part, group: g }); }
  }
  const all = [...results.values()];
  // B1 + round 2: every PLANNED check must be present (result/advisory) or covered by an ALLOWLISTED skip that names it
  //   exactly in `covers` ("(group)" for group-level planned entries); any skip outside the allowlist fails the gate
  const allowOf = (k: Any) => allowed.find((a) => a.form === k.form && a.cat === k.cat && a.mode === k.mode && a.check === k.check);
  const unlistedSkips: string[] = [...skips.values()].filter((k) => !allowOf(k)).map((k) => `${k.form}|${k.cat}|${k.mode}|${k.check} (${cut(k.reason, 60)})`);
  const missingPlanned: string[] = [];
  for (const form of forms) {
    for (const pl of plannedFor(form)) {
      const g = groupKey(form, pl.cat, pl.mode, pl.device);
      const want = pl.check ?? "(group)";
      const skipped = [...skips.values()].some((k) => k.group === g && (allowOf(k)?.covers ?? []).includes(want));
      if (skipped) continue;
      const have = (pl.check === null)
        ? all.some((r) => r.group === g) || [...advs.values()].some((a) => a.group === g)
        : all.some((r) => r.group === g && r.check === pl.check) || [...advs.values()].some((a) => a.group === g && a.check === pl.check);
      if (!have) missingPlanned.push(`${g}|${pl.check ?? "(any)"}`);
    }
  }
  // S8: one runner version, one product source tree, one server build — and the server build = the in-process source
  const provenanceProblems: string[] = [];
  const uniq = (xs: unknown[]) => [...new Set(xs.map((x) => JSON.stringify(x ?? null)))];
  const prov = docs.map((j) => ({ part: j.part, p: j.provenance ?? null, browser: j.browser !== false && (j.results ?? []).some((r: Any) => r.mode === "browser") }));
  for (const x of prov) if (!x.p) provenanceProblems.push(`${x.part}: no provenance recorded`);
  const withP = prov.filter((x) => x.p);
  if (uniq(withP.map((x) => x.p.runnerSha)).length > 1) provenanceProblems.push(`runner versions differ: ${withP.map((x) => `${x.part}=${String(x.p.runnerSha).slice(0, 8)}`).join(" ")}`);
  if (uniq(withP.map((x) => x.p.srcTree)).length > 1) provenanceProblems.push(`product src trees differ: ${withP.map((x) => `${x.part}=${String(x.p.srcTree).slice(0, 8)}`).join(" ")}`);
  for (const x of withP) if (x.p.srcDirty) provenanceProblems.push(`${x.part}: src/prisma had uncommitted changes`);
  const br = withP.filter((x) => x.browser);
  if (uniq(br.map((x) => x.p.server?.buildId)).length > 1) provenanceProblems.push(`server builds differ: ${br.map((x) => `${x.part}=${x.p.server?.buildId}`).join(" ")}`);
  for (const x of br) if (!x.p.server?.buildSrcTree || x.p.server.buildSrcTree !== x.p.srcTree) provenanceProblems.push(`${x.part}: server build src ${String(x.p.server?.buildSrcTree ?? "unknown").slice(0, 8)} ≠ in-process src ${String(x.p.srcTree).slice(0, 8)}`);
  const byCategory: Record<string, { total: number; passed: number }> = {};
  for (const r of all) { const b = (byCategory[`${r.cat}:${r.mode}${r.mode === "browser" ? `:${deviceOf(r.mode, r.check)}` : ""}`] ??= { total: 0, passed: 0 }); b.total++; if (r.ok) b.passed++; }
  // findings 1–4 (addendum §5) are fixed on main 130ca0c1 (C4.3-fix part 1) but NOT in the server build ce728fd8 (controller)
  const FIXED_IN_MAIN: [RegExp, RegExp, string][] = [
    [/^team-member-add-form$/, /^required:userId \(action\)/, "finding 1"], [/^lr-new-form$/, /^double \(2 parallel actions\)/, "finding 2"],
    [/^activity-log-form$/, /^emoji(@title)? stored/, "finding 3"], [/^crm-api-(key|hook)-form$/, /^staff:thana/, "finding 4"],
  ];
  const fixedOf = (r: Any) => FIXED_IN_MAIN.find(([f, c]) => f.test(r.form) && c.test(r.check));
  const failures = all.filter((r) => !r.ok).map((r) => ({ form: r.form, category: r.cat, check: r.check, mode: r.mode, kind: r.kind, detail: r.detail, part: r.part, ...(fixedOf(r) ? { fixedInMain: "130ca0c1", finding: fixedOf(r)![2] } : {}) }));
  const failuresByKind: Record<string, Record<string, string[]>> = {};
  for (const f of failures) ((failuresByKind[(f as Any).fixedInMain ? `fixedInMain:130ca0c1 (${(f as Any).finding})` : f.kind || "?"] ??= {})[f.form] ??= []).push(`${f.category} ${f.check}`);
  const positiveControls: Any[] = []; const restore: Any[] = []; const blocked: Any[] = [];
  for (const j of docs) {
    for (const p of j.positiveControls ?? []) positiveControls.push({ ...p, part: j.part });
    restore.push({ part: j.part, identical: j.restore?.verify?.identical ?? null, purged: j.restore?.purged, leftovers: j.restore?.verify?.leftoversSince, fatal: j.fatal });
    blocked.push(...(j.blockedFetch ?? []));
  }
  const passed = all.filter((r) => r.ok).length;
  const restoreOk = restore.length > 0 && restore.every((r) => r.identical === true && !r.fatal);
  const pcOk = positiveControls.every((p) => p.caught);
  return {
    total: all.length, passed, byCategory, failures, failuresByKind, missingPlanned, provenanceProblems,
    advisories: [...advs.values()], skipped: [...skips.values()], positiveControls, blockedFetch: blocked, restore, restoreOk,
    provenance: withP.map((x) => ({ part: x.part, ...x.p })),
    unlistedSkips,
    gate: passed === all.length && pcOk && restoreOk && missingPlanned.length === 0 && provenanceProblems.length === 0 && unlistedSkips.length === 0,
  };
}
/** positive controls for the merge itself (review B1/S8) — synthetic parts, no DB */
function mergeControls(): Any[] {
  const prov = { runnerSha: "r1", srcTree: "s1", srcDirty: false, server: { buildId: "B", buildSrcTree: "s1" } };
  const R = (cat: string, check: string, ok: boolean, mode = "browser") => ({ form: "X", cat, check, mode, ok, kind: ok ? "" : "k", detail: "" });
  const plan = (): Planned[] => [
    { cat: "a", mode: "browser", device: "desktop", check: "valid" }, { cat: "b", mode: "browser", device: "desktop", check: "required:n" },
    { cat: "e", mode: "browser", device: "desktop", check: "abandon" },
  ];
  const ok = { verify: { identical: true } };
  const p1 = { part: "p1", at: "1", provenance: prov, results: [R("a", "valid", true), R("b", "required:n", false), R("e", "abandon", true)], restore: ok };
  const p2 = { part: "p2", at: "2", provenance: prov, results: [R("b", "required:n", true)], restore: ok }; // a `--cat b` re-run
  const m1 = mergeParts([p1, p2], plan, ["X"]);
  const out: Any[] = [];
  out.push({ id: "PM-partial-rerun", cat: "a", what: "a later `--cat b` part must not drop a/e results", caught: m1.total === 3 && m1.passed === 3 && m1.missingPlanned.length === 0, detail: `total=${m1.total} passed=${m1.passed} missing=${m1.missingPlanned.length}` });
  const m2 = mergeParts([{ ...p1, results: [R("a", "valid", true), R("b", "required:n", true)] }], plan, ["X"]);
  out.push({ id: "PM-missing-planned", cat: "e", what: "a planned check (e abandon) absent from every part", caught: !m2.gate && m2.missingPlanned.some((x: string) => x.includes("|e|")), detail: `missing=${m2.missingPlanned.join(",")}` });
  const m3 = mergeParts([p1, { ...p2, provenance: { ...prov, runnerSha: "r2" } }], plan, ["X"]);
  out.push({ id: "PM-provenance", cat: "a", what: "two parts from different runner versions", caught: !m3.gate && m3.provenanceProblems.length > 0, detail: m3.provenanceProblems.join(" · ") });
  // round 2: a later part that ONLY skips a group must not erase the earlier failure in it; an unlisted skip turns the gate red
  const allow: AllowedSkip[] = [{ form: "X", cat: "b", mode: "browser", check: "required:n", reason: "control", covers: ["required:n"] }];
  const p3 = { part: "p3", at: "3", provenance: prov, results: [], skipped: [{ form: "X", cat: "b", check: "required:n", mode: "browser", reason: "later skip" }], restore: ok };
  const m5 = mergeParts([p1, p3], plan, ["X"], allow);
  out.push({ id: "PM-skip-no-erase", cat: "b", what: "a later part that only skips b must keep the earlier b failure", caught: m5.failures.some((f: Any) => f.check === "required:n") && m5.total === 3 && !m5.gate, detail: `failures=${m5.failures.length} total=${m5.total}` });
  const m6 = mergeParts([{ ...p1, results: [R("a", "valid", true), R("e", "abandon", true)], skipped: [{ form: "X", cat: "b", check: "required:n", mode: "browser", reason: "not allowlisted" }] }], plan, ["X"], []);
  out.push({ id: "PM-unlisted-skip", cat: "b", what: "a skip that is not in the allowlist", caught: !m6.gate && m6.unlistedSkips.length === 1 && m6.missingPlanned.length === 1, detail: `unlisted=${m6.unlistedSkips.join(",")} missing=${m6.missingPlanned.join(",")}` });
  const m7 = mergeParts([{ ...p1, results: [R("a", "valid", true), R("e", "abandon", true)], skipped: [{ form: "X", cat: "b", check: "required:n", mode: "browser", reason: "listed" }] }], plan, ["X"], allow);
  out.push({ id: "NM-listed-skip", cat: "b", what: "negative control: an allowlisted skip that names the planned check (must pass)", caught: m7.gate === true && m7.missingPlanned.length === 0, detail: `gate=${m7.gate} unlisted=${m7.unlistedSkips.length}` });
  const m4 = mergeParts([{ ...p1, provenance: { ...prov, server: { buildId: "B", buildSrcTree: "OTHER" } } }], plan, ["X"]);
  out.push({ id: "PM-build-src", cat: "a", what: "server build compiled from a different src tree than the in-process code", caught: m4.provenanceProblems.some((x: string) => x.includes("server build src")), detail: m4.provenanceProblems.join(" · ") });
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// S7 lock guard + S8 provenance
// ═══════════════════════════════════════════════════════════════════
/** is `lockFile` held by a `flock` process among OUR ancestors (the with-gate-lock wrapper)? — someone else's lock does not count */
function lockHeldByAncestor(lockFile: string): boolean {
  let pid = process.pid;
  for (let i = 0; i < 40 && pid > 1; i++) {
    try {
      const argv = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
      if (argv.length && /(^|\/)flock$/.test(argv[0]!) && argv.includes(lockFile)) return true;
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      pid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    } catch { return false; }
  }
  return false;
}
const hostOfEnvFile = (f: string): string => {
  try { const u = /^DIRECT_URL=["']?([^"'\n]+)/m.exec(readFileSync(f, "utf8"))?.[1] ?? ""; return new URL(u).hostname.split(".")[0] ?? ""; } catch { return ""; }
};
/** the gate lock that serialises writers of the DB this process talks to (qc3.sh → shark-gate-qc3 · qc2 → qc2 · QC1 → shark-gate) */
function expectedLockFile(): string {
  let host = ""; try { host = new URL(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "").hostname.split(".")[0] ?? ""; } catch { /* */ }
  const base = host.replace(/-pooler$/, "");
  if (base && base === hostOfEnvFile(".env.qc3").replace(/-pooler$/, "")) return "/tmp/shark-gate-qc3.lock";
  if (base && base === hostOfEnvFile(".env.qc2").replace(/-pooler$/, "")) return "/tmp/shark-gate-qc2.lock";
  return "/tmp/shark-gate.lock";
}
const git = (args: string[], cwd = process.cwd()): string => { try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
function serverInfo(): Any {
  let port = ""; try { port = new URL(BASE).port || "80"; } catch { return null; }
  try {
    const line = execFileSync("ss", ["-ltnpH", `sport = :${port}`], { encoding: "utf8" });
    const pid = /pid=(\d+)/.exec(line)?.[1];
    if (!pid) return { port, error: "no listener pid" };
    const cwd = readlinkSync(`/proc/${pid}/cwd`);
    const buildId = readFileSync(`${cwd}/.next/BUILD_ID`, "utf8").trim();
    const buildIdMtime = statSync(`${cwd}/.next/BUILD_ID`).mtime.toISOString();
    const buildState = existsSync(`${cwd}/.qc-shots/crm/BUILD-STATE`) ? readFileSync(`${cwd}/.qc-shots/crm/BUILD-STATE`, "utf8").trim() : "";
    const buildCommit = /READY\s+\S+\s+([0-9a-f]{7,40})/.exec(buildState)?.[1] ?? "";
    const buildSrcTree = buildCommit ? git(["rev-parse", `${buildCommit}:src`], cwd) : "";
    return { port, pid: Number(pid), cwd, buildId, buildIdMtime, buildState, buildCommit, buildSrcTree };
  } catch (e) { return { port, error: e instanceof Error ? e.message.slice(0, 120) : String(e) }; }
}
function provenanceNow(): Any {
  const sha = createHash("sha256");
  for (const f of ["scripts/qc-crm-forms.mts", "scripts/lib/qc-crm-restore.mts"]) sha.update(readFileSync(f));
  return {
    head: git(["rev-parse", "HEAD"]), srcTree: git(["rev-parse", "HEAD:src"]), srcDirty: git(["status", "--porcelain", "--", "src", "prisma"]) !== "",
    runnerSha: sha.digest("hex"), db: (() => { try { return new URL(process.env.DIRECT_URL ?? "").hostname.split(".")[0]; } catch { return ""; } })(),
    answerKey: EXPECTED_PATH, server: INPROC_ONLY ? null : serverInfo(),
  };
}
let PROVENANCE: Any = null;

let restoreSummary: Any = null;
let out = { total: 0, passed: 0, fatal: "" };
try { if (!MERGE) out = await main(); } catch (e) { out.fatal = e instanceof Error ? (e.stack ?? e.message).slice(0, 600) : String(e); }

if (MERGE) {
  const { readdirSync } = await import("node:fs");
  const dir = `${SHOTS}/parts`;
  const parts = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
  const docs = parts.map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
  const m = mergeParts(docs, (form) => { const sp = FORMS.find((f) => f.testid === form); return sp ? plannedChecks(sp) : []; }, FORMS.map((f) => f.testid));
  // merge-level positive controls (pure, no DB): the same mergeParts() must catch a lost category, a missing planned check
  // and a provenance mismatch on synthetic parts
  for (const pc of mergeControls()) m.positiveControls.push(pc);
  // round 2: re-prove the no-DB harness controls with THIS runner version (restore module B2 · leftovers · lock guard)
  const pcBefore = positiveControls.length;
  await positiveControlsHarness(expectedLockFile());
  for (const pc of positiveControls.slice(pcBefore)) m.positiveControls.push({ ...pc, part: "merge" });
  const pcMiss = m.positiveControls.filter((p: Any) => !p.caught).length;
  m.gate = m.gate && pcMiss === 0;
  writeFileSync(`${SHOTS}/summary.json`, JSON.stringify({ at: new Date().toISOString(), mode: "merged", parts: parts.map((p) => p.replace(/\.json$/, "")), ...m }, null, 2));
  console.log(`${m.gate ? "🟢" : "🔴"} C4.3 merged ${parts.length} parts: ${m.passed}/${m.total} · positive controls ${m.positiveControls.length - pcMiss}/${m.positiveControls.length} · restore identical all=${m.restoreOk} · missing planned ${m.missingPlanned.length} · provenance problems ${m.provenanceProblems.length}`);
  for (const [k, v] of Object.entries(m.byCategory as Record<string, { total: number; passed: number }>)) console.log(`   ${k.padEnd(14)} ${v.passed}/${v.total}`);
  for (const [k, v] of Object.entries(m.failuresByKind as Record<string, Record<string, string[]>>)) console.log(`   ✗ ${k.padEnd(34)} ${Object.values(v).reduce((a, x) => a + x.length, 0)} checks · ${Object.keys(v).length} forms`);
  for (const x of m.missingPlanned.slice(0, 15)) console.log(`   ⛔ missing planned: ${x}`);
  for (const x of m.provenanceProblems) console.log(`   ⛔ provenance: ${x}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ merged: parts.length, total: m.total, passed: m.passed, failures: m.failures.length, positiveControlsMissed: pcMiss, restoreIdentical: m.restoreOk, missingPlanned: m.missingPlanned.length, provenanceProblems: m.provenanceProblems.length, gate: m.gate })}`);
  process.exit(0);
}
if (!DRY && !SELFTEST_BROWSER) {
  const failures = results.filter((r) => !r.ok).map((r) => ({ form: r.form, category: r.cat, check: r.check, mode: r.mode, kind: r.kind, detail: r.detail }));
  const byCat: Record<string, { total: number; passed: number }> = {};
  for (const r of results) { const b = (byCat[`${r.cat}:${r.mode}`] ??= { total: 0, passed: 0 }); b.total++; if (r.ok) b.passed++; }
  const pcMissed = positiveControls.filter((p) => !p.caught);
  const restoreOk = !restoreSummary || restoreSummary.verify?.identical === true;
  writeFileSync(`${SHOTS}/summary.json`, JSON.stringify({
    at: new Date().toISOString(), mode: INPROC_ONLY ? "inproc" : BROWSER_ONLY ? "browser" : "full", run: TAG0, answerKey: EXPECTED_PATH,
    total: out.total, passed: out.passed, byCategory: byCat, failures, advisories, skipped, positiveControls,
    blockedFetch, restore: restoreSummary, gate: !out.fatal && out.passed === out.total && pcMissed.length === 0 && restoreOk, fatal: out.fatal || null,
  }, null, 2));
  if (PART) {
    mkdirSync(`${SHOTS}/parts`, { recursive: true });
    writeFileSync(`${SHOTS}/parts/${PART}.json`, JSON.stringify({ part: PART, at: new Date().toISOString(), args: ARGV, cats: [...CAT_FILTER], device: DEVICE, inproc: !BROWSER_ONLY, browser: !INPROC_ONLY, provenance: PROVENANCE, results, advisories, skipped, positiveControls, blockedFetch, restore: restoreSummary, fatal: out.fatal || null }, null, 2));
  }
  console.log(`\n${!out.fatal && out.passed === out.total && restoreOk ? "🟢" : "🔴"} C4.3: ${out.passed}/${out.total} · advisories ${advisories.length} · skipped ${skipped.length} · positive controls ${positiveControls.length - pcMissed.length}/${positiveControls.length} caught · restore identical=${restoreOk}`);
  for (const [k, v] of Object.entries(byCat)) console.log(`   ${k.padEnd(10)} ${v.passed}/${v.total}`);
}
if (SELFTEST_BROWSER) {
  const miss = positiveControls.filter((p) => !p.caught);
  writeFileSync(`${SHOTS}/selftest-browser.json`, JSON.stringify({ at: new Date().toISOString(), positiveControls }, null, 2));
  console.log(`\n${miss.length ? "🔴" : "🟢"} browser positive controls ${positiveControls.length - miss.length}/${positiveControls.length}`);
  out.fatal ||= miss.length ? "browser positive control not caught" : "";
}
if (out.fatal) console.error(`❌ ${out.fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: out.total, passed: out.passed, failures: results.filter((r) => !r.ok).length, advisories: advisories.length, skipped: skipped.length, positiveControls: `${positiveControls.filter((p) => p.caught).length}/${positiveControls.length}`, restoreIdentical: restoreSummary?.verify?.identical ?? null, fatal: out.fatal || null })}`);
if (P) await P.$disconnect().catch(() => {});
process.exit(out.fatal ? 2 : 0);
